import asyncio
import logging
import sys
from collections.abc import AsyncIterator
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Psycopg's async driver requires a selector event loop on Windows.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


class DatabaseConfigurationError(RuntimeError):
    """Raised when the backend database URL is unavailable."""


class DatabaseOperationError(RuntimeError):
    """Raised when a database operation fails without leaking connection details."""


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _as_psycopg_url(url: str) -> str:
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    raise DatabaseConfigurationError("DATABASE_URL must be a PostgreSQL URL")


def get_database_url(*, unpooled: bool = False) -> str:
    settings = get_settings()
    secret = settings.database_url_unpooled if unpooled else settings.database_url
    if secret is None:
        variable = "DATABASE_URL_UNPOOLED" if unpooled else "DATABASE_URL"
        raise DatabaseConfigurationError(f"{variable} is not configured")
    return _as_psycopg_url(secret.get_secret_value())


def assert_safe_migration_target() -> str:
    """Return the direct URL only for an explicitly named non-production branch."""
    settings = get_settings()
    branch = (settings.neon_branch or "").strip()
    if not branch:
        raise DatabaseConfigurationError("NEON_BRANCH is required for migrations")
    if branch.lower() in {"production", "main", "master"}:
        raise DatabaseConfigurationError("Migrations are blocked on production branches")

    url = get_database_url(unpooled=True)
    hostname = urlparse(url).hostname or ""
    if "-pooler" in hostname:
        raise DatabaseConfigurationError(
            "Migrations require the direct DATABASE_URL_UNPOOLED endpoint"
        )
    return url


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            get_database_url(),
            pool_pre_ping=True,
            pool_recycle=300,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency for future database-backed endpoints."""
    async with get_session_factory()() as session:
        yield session


async def check_database_connection() -> None:
    """Run a read-only connectivity probe through SQLAlchemy."""
    try:
        async with get_engine().connect() as connection:
            result = await connection.execute(text("SELECT 1"))
            if result.scalar_one() != 1:
                raise DatabaseOperationError("Database health check returned an invalid result")
    except DatabaseConfigurationError:
        raise
    except DatabaseOperationError:
        raise
    except Exception as exc:
        logger.warning("Database health check failed (%s)", type(exc).__name__)
        raise DatabaseOperationError("Database health check failed") from exc


async def close_database_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
