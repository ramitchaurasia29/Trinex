import logging

from upstash_redis.asyncio import Redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class RedisConfigurationError(RuntimeError):
    """Raised when backend-only Upstash settings are unavailable."""


class RedisOperationError(RuntimeError):
    """Raised when an Upstash operation fails without leaking provider details."""


_redis_client: Redis | None = None


def get_redis_client() -> Redis:
    """Return the process-wide asynchronous Upstash Redis client."""
    global _redis_client

    if _redis_client is not None:
        return _redis_client

    settings = get_settings()
    if (
        settings.upstash_redis_rest_url is None
        or settings.upstash_redis_rest_token is None
    ):
        raise RedisConfigurationError("Upstash Redis is not configured")

    _redis_client = Redis(
        url=settings.upstash_redis_rest_url.get_secret_value(),
        token=settings.upstash_redis_rest_token.get_secret_value(),
        allow_telemetry=False,
    )
    return _redis_client


async def check_redis_connection() -> None:
    """Verify connectivity without returning or logging credentials."""
    try:
        response = await get_redis_client().ping()
        if str(response).upper() != "PONG":
            raise RedisOperationError("Redis health check returned an invalid response")
    except RedisConfigurationError:
        raise
    except RedisOperationError:
        raise
    except Exception as exc:
        logger.warning("Redis health check failed (%s)", type(exc).__name__)
        raise RedisOperationError("Redis health check failed") from exc


async def close_redis_client() -> None:
    """Close the shared HTTP client during FastAPI shutdown."""
    global _redis_client

    if _redis_client is None:
        return

    client = _redis_client
    _redis_client = None
    try:
        await client.close()
    except Exception as exc:
        logger.warning("Redis client shutdown failed (%s)", type(exc).__name__)
