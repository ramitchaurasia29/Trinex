import hashlib
import hmac
import json
import logging
import secrets
from dataclasses import dataclass, field
from typing import Any, Literal

from app.core.config import get_settings
from app.core.redis import (
    RedisConfigurationError,
    RedisOperationError,
    get_redis_client,
)

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 5 * 60
OTP_MAX_ATTEMPTS = 5
POSITION_CACHE_TTL_SECONDS = 30
QUOTE_CACHE_TTL_SECONDS = 5
EXECUTION_LOCK_TTL_SECONDS = 30

_ISSUE_OTP_SCRIPT = """
if redis.call('EXISTS', KEYS[4]) == 1 then
  return {'cooldown', redis.call('TTL', KEYS[4])}
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
redis.call('DEL', KEYS[2])
redis.call('DEL', KEYS[3])
redis.call('SET', KEYS[4], '1', 'EX', tonumber(ARGV[3]))
return {'issued', tonumber(ARGV[2])}
"""

_REVOKE_OTP_SCRIPT = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  redis.call('DEL', KEYS[3])
  redis.call('DEL', KEYS[4])
  return 1
end
return 0
"""

_VERIFY_OTP_SCRIPT = """
if redis.call('EXISTS', KEYS[3]) == 1 then
  return {'limited', tonumber(ARGV[2]), redis.call('TTL', KEYS[3])}
end
local stored = redis.call('GET', KEYS[1])
if not stored then
  return {'missing', 0, -2}
end
local attempts = redis.call('INCR', KEYS[2])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
end
local ttl = redis.call('TTL', KEYS[1])
if stored == ARGV[1] then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  redis.call('DEL', KEYS[3])
  redis.call('DEL', KEYS[4])
  return {'verified', attempts, 0}
end
if attempts >= tonumber(ARGV[2]) then
  redis.call('SET', KEYS[3], '1', 'EX', math.max(ttl, 1))
  redis.call('DEL', KEYS[1])
  return {'limited', attempts, ttl}
end
return {'invalid', attempts, ttl}
"""

_CONSUME_VALUE_SCRIPT = """
local value = redis.call('GET', KEYS[1])
if not value then
  return nil
end
redis.call('DEL', KEYS[1])
return value
"""

_RATE_LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return {count, redis.call('TTL', KEYS[1])}
"""

_RELEASE_LOCK_SCRIPT = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


@dataclass(frozen=True)
class OtpVerificationResult:
    status: Literal["verified", "invalid", "limited", "missing"]
    attempts: int
    ttl_seconds: int


@dataclass(frozen=True)
class OtpIssueResult:
    status: Literal["issued", "cooldown"]
    ttl_seconds: int


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    reset_after_seconds: int


@dataclass(frozen=True)
class LockHandle:
    key: str
    token: str = field(repr=False)


def _safe_segment(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _key(*parts: str) -> str:
    prefix = get_settings().redis_key_prefix.strip(":") or "trinex"
    return ":".join((prefix, *parts))


def _otp_digest(subject: str, otp: str) -> str:
    secret = get_settings().otp_hash_secret
    if secret is None:
        raise RedisConfigurationError("OTP hashing is not configured")
    message = f"{subject}:{otp}".encode("utf-8")
    return hmac.new(
        secret.get_secret_value().encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def _raise_operation_error(operation: str, exc: Exception) -> RedisOperationError:
    logger.warning("Redis %s failed (%s)", operation, type(exc).__name__)
    return RedisOperationError(f"Redis {operation} failed")


async def store_otp(subject: str, otp: str) -> None:
    """Store only an HMAC of an OTP for five minutes."""
    code_key = _key("otp", _safe_segment(subject), "code")
    attempts_key = _key("otp", _safe_segment(subject), "attempts")
    try:
        redis = get_redis_client()
        await redis.set(code_key, _otp_digest(subject, otp), ex=OTP_TTL_SECONDS)
        await redis.delete(attempts_key)
    except RedisConfigurationError:
        raise
    except Exception as exc:
        raise _raise_operation_error("OTP storage", exc) from exc


def _otp_keys(subject: str) -> list[str]:
    subject_key = _safe_segment(subject)
    return [
        _key("otp", subject_key, "code"),
        _key("otp", subject_key, "attempts"),
        _key("otp", subject_key, "blocked"),
        _key("otp", subject_key, "cooldown"),
    ]


async def issue_otp(subject: str, otp: str, *, cooldown_seconds: int) -> OtpIssueResult:
    """Atomically issue one OTP and reject concurrent/resend requests during cooldown."""
    try:
        result = await get_redis_client().eval(
            _ISSUE_OTP_SCRIPT,
            keys=_otp_keys(subject),
            args=[_otp_digest(subject, otp), str(OTP_TTL_SECONDS), str(cooldown_seconds)],
        )
        return OtpIssueResult(status=str(result[0]), ttl_seconds=max(int(result[1]), 0))
    except RedisConfigurationError:
        raise
    except Exception as exc:
        raise _raise_operation_error("OTP issuance", exc) from exc


async def revoke_otp(subject: str, otp: str) -> None:
    """Remove an OTP only when the supplied plaintext still owns the stored digest."""
    try:
        await get_redis_client().eval(
            _REVOKE_OTP_SCRIPT,
            keys=_otp_keys(subject),
            args=[_otp_digest(subject, otp)],
        )
    except RedisConfigurationError:
        raise
    except Exception as exc:
        raise _raise_operation_error("OTP revocation", exc) from exc


async def verify_otp(subject: str, otp: str) -> OtpVerificationResult:
    """Verify an OTP atomically while enforcing a five-attempt limit."""
    try:
        result = await get_redis_client().eval(
            _VERIFY_OTP_SCRIPT,
            keys=_otp_keys(subject),
            args=[_otp_digest(subject, otp), str(OTP_MAX_ATTEMPTS), str(OTP_TTL_SECONDS)],
        )
        return OtpVerificationResult(
            status=str(result[0]),
            attempts=int(result[1]),
            ttl_seconds=max(int(result[2]), 0),
        )
    except RedisConfigurationError:
        raise
    except Exception as exc:
        raise _raise_operation_error("OTP verification", exc) from exc


async def create_registration_ticket(phone_e164: str, *, ttl_seconds: int) -> str:
    token = secrets.token_urlsafe(48)
    key = _key("auth", "registration", _safe_segment(token))
    try:
        await get_redis_client().set(key, phone_e164, ex=ttl_seconds)
        return token
    except RedisConfigurationError:
        raise
    except Exception as exc:
        raise _raise_operation_error("registration ticket creation", exc) from exc


async def consume_registration_ticket(token: str) -> str | None:
    key = _key("auth", "registration", _safe_segment(token))
    try:
        value = await get_redis_client().eval(_CONSUME_VALUE_SCRIPT, keys=[key], args=[])
        return None if value is None else str(value)
    except RedisConfigurationError:
        raise
    except Exception as exc:
        raise _raise_operation_error("registration ticket consumption", exc) from exc


async def check_rate_limit(
    identifier: str,
    *,
    limit: int,
    window_seconds: int,
    scope: str = "api",
) -> RateLimitResult:
    """Apply an atomic fixed-window rate limit without storing raw identifiers."""
    if limit < 1 or window_seconds < 1:
        raise ValueError("Rate limit and window must be positive")
    try:
        result = await get_redis_client().eval(
            _RATE_LIMIT_SCRIPT,
            keys=[_key("rate", _safe_segment(scope), _safe_segment(identifier))],
            args=[str(window_seconds)],
        )
        count = int(result[0])
        ttl = max(int(result[1]), 0)
        return RateLimitResult(
            allowed=count <= limit,
            limit=limit,
            remaining=max(limit - count, 0),
            reset_after_seconds=ttl,
        )
    except Exception as exc:
        raise _raise_operation_error("rate limit", exc) from exc


async def acquire_lock(
    resource: str,
    *,
    ttl_seconds: int = EXECUTION_LOCK_TTL_SECONDS,
) -> LockHandle | None:
    """Acquire a short-lived lock for paper-mode execution coordination."""
    if ttl_seconds < 1:
        raise ValueError("Lock TTL must be positive")
    key = _key("lock", _safe_segment(resource))
    token = secrets.token_urlsafe(32)
    try:
        acquired = await get_redis_client().set(key, token, nx=True, ex=ttl_seconds)
        return LockHandle(key=key, token=token) if acquired is True or acquired == "OK" else None
    except Exception as exc:
        raise _raise_operation_error("lock acquisition", exc) from exc


async def release_lock(handle: LockHandle) -> bool:
    """Release a lock only when its private ownership token still matches."""
    try:
        released = await get_redis_client().eval(
            _RELEASE_LOCK_SCRIPT,
            keys=[handle.key],
            args=[handle.token],
        )
        return int(released) == 1
    except Exception as exc:
        raise _raise_operation_error("lock release", exc) from exc


async def _cache_json(key: str, value: Any, ttl_seconds: int) -> None:
    try:
        await get_redis_client().set(
            key,
            json.dumps(value, separators=(",", ":"), default=str),
            ex=ttl_seconds,
        )
    except Exception as exc:
        raise _raise_operation_error("cache write", exc) from exc


async def _get_cached_json(key: str) -> Any | None:
    try:
        value = await get_redis_client().get(key)
        return None if value is None else json.loads(value)
    except Exception as exc:
        raise _raise_operation_error("cache read", exc) from exc


async def cache_position_data(account_id: str, data: Any) -> None:
    await _cache_json(
        _key("cache", "positions", _safe_segment(account_id)),
        data,
        POSITION_CACHE_TTL_SECONDS,
    )


async def get_cached_position_data(account_id: str) -> Any | None:
    return await _get_cached_json(
        _key("cache", "positions", _safe_segment(account_id))
    )


async def cache_instrument_quote(instrument_id: str, quote: Any) -> None:
    await _cache_json(
        _key("cache", "quotes", _safe_segment(instrument_id)),
        quote,
        QUOTE_CACHE_TTL_SECONDS,
    )


async def get_cached_instrument_quote(instrument_id: str) -> Any | None:
    return await _get_cached_json(
        _key("cache", "quotes", _safe_segment(instrument_id))
    )


async def acquire_execution_lock(execution_id: str) -> LockHandle | None:
    """Coordinate temporary paper-mode work; never stores an armed tool."""
    return await acquire_lock(f"paper-execution:{execution_id}")


async def set_worker_heartbeat(worker_id: str, payload: dict[str, Any], *, ttl_seconds: int = 30) -> None:
    """Publish temporary worker liveness without persisting tool state."""
    await _cache_json(_key("worker", "heartbeat", _safe_segment(worker_id)), payload, ttl_seconds)
    await _cache_json(_key("worker", "heartbeat", "latest"), {**payload, "worker_id": worker_id}, ttl_seconds)


async def get_worker_heartbeat() -> dict[str, Any] | None:
    value = await _get_cached_json(_key("worker", "heartbeat", "latest"))
    return value if isinstance(value, dict) else None


async def cache_subscription(worker_id: str, instrument_ids: list[str], *, ttl_seconds: int = 30) -> None:
    await _cache_json(_key("worker", "subscriptions", _safe_segment(worker_id)), instrument_ids, ttl_seconds)
