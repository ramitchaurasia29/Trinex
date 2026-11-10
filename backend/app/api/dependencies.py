from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.services.auth_service import (
    AuthenticatedPrincipal,
    AuthenticationError,
    authenticate_session,
)


def error_detail(code: str, message: str, **extra: object) -> dict[str, object]:
    return {"code": code, "message": message, **extra}


async def enforce_allowed_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in get_settings().cors_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_detail("origin_not_allowed", "Request origin is not allowed"),
        )


async def require_json_request(request: Request) -> None:
    await enforce_allowed_origin(request)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type != "application/json":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=error_detail("json_required", "Content-Type must be application/json"),
        )


async def get_current_principal(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AuthenticatedPrincipal:
    settings = get_settings()
    try:
        return await authenticate_session(db, request.cookies.get(settings.session_cookie_name))
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_detail(exc.code, exc.message),
        ) from exc
