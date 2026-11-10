from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    error_detail,
    get_current_principal,
    require_json_request,
)
from app.db.session import get_db_session
from app.schemas.auth import UpdateProfileRequest, UserResponse
from app.services.auth_service import AuthenticatedPrincipal

router = APIRouter(prefix="/users", tags=["users"])


@router.patch(
    "/me",
    response_model=UserResponse,
    dependencies=[Depends(require_json_request)],
)
async def update_me(
    payload: UpdateProfileRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    user = principal.user
    if "display_name" in payload.model_fields_set:
        user.display_name = payload.display_name
    if "email" in payload.model_fields_set:
        user.email_normalized = str(payload.email).lower() if payload.email is not None else None
        user.email_verified_at = None
    try:
        await db.commit()
        await db.refresh(user)
        return UserResponse.from_user(user)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=error_detail("email_in_use", "That email address is already in use"),
        ) from exc
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=error_detail("profile_unavailable", "Profile updates are temporarily unavailable"),
        ) from exc
