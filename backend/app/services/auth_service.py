import hashlib
import ipaddress
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models.foundation import AuthSession, User


class AuthenticationError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    user: User
    session: AuthSession


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def safe_ip_address(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


async def create_session(
    db: AsyncSession,
    user: User,
    *,
    ip_address: str | None,
    user_agent: str | None,
) -> str:
    settings = get_settings()
    token = secrets.token_urlsafe(48)
    now = datetime.now(UTC)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=now + timedelta(days=settings.session_ttl_days),
            last_seen_at=now,
            ip_address=safe_ip_address(ip_address),
            user_agent=(user_agent or "")[:2000] or None,
        )
    )
    return token


async def authenticate_session(db: AsyncSession, token: str | None) -> AuthenticatedPrincipal:
    if not token:
        raise AuthenticationError("not_authenticated", "Authentication is required")

    result = await db.execute(
        select(AuthSession, User)
        .join(User, User.id == AuthSession.user_id)
        .where(AuthSession.token_hash == hash_session_token(token))
    )
    row = result.first()
    if row is None:
        raise AuthenticationError("invalid_session", "The session is invalid")

    session, user = row
    now = datetime.now(UTC)
    if session.revoked_at is not None:
        raise AuthenticationError("revoked_session", "The session has been revoked")
    if session.expires_at <= now:
        raise AuthenticationError("session_expired", "The session has expired")
    if user.status != "active" or user.deleted_at is not None:
        raise AuthenticationError("account_unavailable", "The account is unavailable")

    if session.last_seen_at is None or session.last_seen_at <= now - timedelta(minutes=5):
        session.last_seen_at = now
        await db.commit()
    return AuthenticatedPrincipal(user=user, session=session)
