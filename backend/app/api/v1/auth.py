import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    enforce_allowed_origin,
    error_detail,
    get_current_principal,
    require_json_request,
)
from app.core.config import get_settings
from app.core.redis import RedisConfigurationError, RedisOperationError
from app.db.models.foundation import AuthSession, User, UserPreferences
from app.db.session import get_db_session
from app.schemas.auth import (
    AuthenticationResponse,
    CompleteProfileRequest,
    OtpRequestResponse,
    PhoneRequest,
    UserResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.services.auth_service import (
    AuthenticatedPrincipal,
    create_session,
    hash_session_token,
)
from app.services.otp_delivery import OtpDeliveryUnavailable, deliver_otp
from app.services.redis_store import (
    OTP_MAX_ATTEMPTS,
    OTP_TTL_SECONDS,
    check_rate_limit,
    consume_registration_ticket,
    create_registration_ticket,
    issue_otp,
    revoke_otp,
    verify_otp,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/api",
    )


def _set_registration_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.registration_cookie_name,
        value=token,
        max_age=settings.registration_ttl_seconds,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/api/v1/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.session_cookie_name, path="/api")
    response.delete_cookie(settings.registration_cookie_name, path="/api/v1/auth")


def _service_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=error_detail("authentication_unavailable", "Authentication is temporarily unavailable"),
    )


@router.post(
    "/request-otp",
    response_model=OtpRequestResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_json_request)],
)
async def request_otp(payload: PhoneRequest, request: Request) -> OtpRequestResponse:
    settings = get_settings()
    otp = f"{secrets.randbelow(1_000_000):06d}"
    try:
        issuance = await issue_otp(
            payload.phone,
            otp,
            cooldown_seconds=settings.otp_resend_cooldown_seconds,
        )
        if issuance.status == "cooldown":
            return OtpRequestResponse(
                expires_in_seconds=OTP_TTL_SECONDS,
                resend_after_seconds=issuance.ttl_seconds,
            )

        phone_limit = await check_rate_limit(
            payload.phone,
            limit=settings.otp_phone_limit,
            window_seconds=settings.otp_rate_window_seconds,
            scope="otp-request-phone",
        )
        ip_limit = await check_rate_limit(
            _client_ip(request),
            limit=settings.otp_ip_limit,
            window_seconds=settings.otp_rate_window_seconds,
            scope="otp-request-ip",
        )
        if not phone_limit.allowed or not ip_limit.allowed:
            await revoke_otp(payload.phone, otp)
            retry_after = max(phone_limit.reset_after_seconds, ip_limit.reset_after_seconds)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=error_detail(
                    "otp_rate_limited",
                    "Too many OTP requests. Try again later.",
                    retry_after_seconds=retry_after,
                ),
                headers={"Retry-After": str(retry_after)},
            )

        try:
            await deliver_otp(payload.phone, otp)
        except OtpDeliveryUnavailable as exc:
            await revoke_otp(payload.phone, otp)
            raise _service_unavailable() from exc

        return OtpRequestResponse(
            expires_in_seconds=OTP_TTL_SECONDS,
            resend_after_seconds=settings.otp_resend_cooldown_seconds,
            development_otp=(
                otp
                if settings.environment == "development" and settings.dev_otp_preview
                else None
            ),
        )
    except HTTPException:
        raise
    except (RedisConfigurationError, RedisOperationError) as exc:
        raise _service_unavailable() from exc


@router.post(
    "/verify-otp",
    response_model=VerifyOtpResponse,
    dependencies=[Depends(require_json_request)],
)
async def verify_phone_otp(
    payload: VerifyOtpRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> VerifyOtpResponse:
    try:
        verification = await verify_otp(payload.phone, payload.otp)
    except (RedisConfigurationError, RedisOperationError) as exc:
        raise _service_unavailable() from exc

    if verification.status == "invalid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_detail(
                "invalid_otp",
                "The OTP is incorrect",
                attempts_remaining=max(OTP_MAX_ATTEMPTS - verification.attempts, 0),
            ),
        )
    if verification.status == "missing":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=error_detail("otp_expired", "The OTP has expired or was not requested"),
        )
    if verification.status == "limited":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error_detail(
                "otp_attempts_exceeded",
                "Maximum OTP verification attempts reached",
                retry_after_seconds=verification.ttl_seconds,
            ),
            headers={"Retry-After": str(verification.ttl_seconds)},
        )

    now = datetime.now(UTC)
    try:
        user = await db.scalar(select(User).where(User.phone_e164 == payload.phone))
        if user is None:
            ticket = await create_registration_ticket(
                payload.phone,
                ttl_seconds=get_settings().registration_ttl_seconds,
            )
            _set_registration_cookie(response, ticket)
            return VerifyOtpResponse(status="profile_required")

        if user.status != "active" or user.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=error_detail("account_unavailable", "The account is unavailable"),
            )
        user.phone_verified_at = user.phone_verified_at or now
        user.last_login_at = now
        token = await create_session(
            db,
            user,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
        await db.refresh(user)
        _set_session_cookie(response, token)
        return VerifyOtpResponse(status="authenticated", user=UserResponse.from_user(user))
    except HTTPException:
        await db.rollback()
        raise
    except (RedisConfigurationError, RedisOperationError, SQLAlchemyError) as exc:
        await db.rollback()
        raise _service_unavailable() from exc


@router.post(
    "/complete-profile",
    response_model=AuthenticationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_json_request)],
)
async def complete_profile(
    payload: CompleteProfileRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> AuthenticationResponse:
    settings = get_settings()
    ticket = request.cookies.get(settings.registration_cookie_name)
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_detail("registration_expired", "Phone verification must be completed again"),
        )
    try:
        phone_e164 = await consume_registration_ticket(ticket)
    except (RedisConfigurationError, RedisOperationError) as exc:
        raise _service_unavailable() from exc
    if phone_e164 is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_detail("registration_expired", "Phone verification must be completed again"),
        )

    now = datetime.now(UTC)
    try:
        user = await db.scalar(select(User).where(User.phone_e164 == phone_e164))
        if user is None:
            user = User(
                phone_e164=phone_e164,
                display_name=payload.display_name,
                phone_verified_at=now,
                last_login_at=now,
            )
            db.add(user)
            await db.flush()
            db.add(UserPreferences(user_id=user.id))
        elif user.status != "active" or user.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=error_detail("account_unavailable", "The account is unavailable"),
            )
        else:
            user.last_login_at = now

        token = await create_session(
            db,
            user,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
        await db.refresh(user)
        _set_session_cookie(response, token)
        response.delete_cookie(settings.registration_cookie_name, path="/api/v1/auth")
        return AuthenticationResponse(user=UserResponse.from_user(user))
    except HTTPException:
        await db.rollback()
        raise
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=error_detail("registration_conflict", "The account was created concurrently; request a new OTP"),
        ) from exc
    except SQLAlchemyError as exc:
        await db.rollback()
        raise _service_unavailable() from exc


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(enforce_allowed_origin)],
)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        try:
            await db.execute(
                update(AuthSession)
                .where(
                    AuthSession.token_hash == hash_session_token(token),
                    AuthSession.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(UTC))
            )
            await db.commit()
        except SQLAlchemyError as exc:
            await db.rollback()
            raise _service_unavailable() from exc
    _clear_auth_cookies(response)


@router.get("/me", response_model=UserResponse)
async def get_me(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> UserResponse:
    return UserResponse.from_user(principal.user)
