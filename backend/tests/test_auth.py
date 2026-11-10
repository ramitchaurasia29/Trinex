import asyncio
import secrets
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import delete, func, select, update

from app.core.config import Settings, get_settings
from app.core.redis import close_redis_client, get_redis_client
from app.db.models.foundation import AuthSession, User, UserPreferences
from app.db.session import close_database_engine, get_session_factory
from app.main import app
from app.schemas.auth import PhoneRequest, UpdateProfileRequest
from app.services.auth_service import hash_session_token
from app.services.redis_store import _otp_keys

pytestmark = pytest.mark.asyncio


def fresh_phone() -> str:
    return f"9{secrets.randbelow(1_000_000_000):09d}"


@pytest.fixture(autouse=True)
def development_branch_only() -> None:
    branch = (get_settings().neon_branch or "").lower()
    assert branch == "dev-database-foundation"
    assert branch not in {"production", "main", "master"}


@pytest.fixture(autouse=True)
async def reset_async_clients():
    yield
    await close_redis_client()
    await close_database_engine()


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as test_client:
        yield test_client


async def cleanup_user(phone: str) -> None:
    normalized = PhoneRequest(phone=phone).phone
    async with get_session_factory()() as db:
        user_id = await db.scalar(select(User.id).where(User.phone_e164 == normalized))
        if user_id is None:
            return
        await db.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
        await db.execute(delete(UserPreferences).where(UserPreferences.user_id == user_id))
        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()


async def request_code(client: AsyncClient, phone: str) -> str:
    response = await client.post("/api/v1/auth/request-otp", json={"phone": phone})
    assert response.status_code == 202
    payload = response.json()
    assert payload["expires_in_seconds"] == 300
    assert payload["resend_after_seconds"] <= 30
    assert len(payload["development_otp"]) == 6
    return payload["development_otp"]


async def test_new_user_existing_user_profile_session_and_logout(client: AsyncClient) -> None:
    phone = fresh_phone()
    try:
        otp = await request_code(client, phone)
        verified = await client.post(
            "/api/v1/auth/verify-otp",
            json={"phone": phone, "otp": otp},
        )
        assert verified.status_code == 200
        assert verified.json()["status"] == "profile_required"

        completed = await client.post(
            "/api/v1/auth/complete-profile",
            json={"display_name": "Test Trader"},
        )
        assert completed.status_code == 201
        assert completed.json()["user"]["display_name"] == "Test Trader"
        set_cookie = completed.headers["set-cookie"].lower()
        assert "httponly" in set_cookie
        assert "samesite=lax" in set_cookie
        assert "path=/api" in set_cookie

        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["phone"].endswith(phone)

        rejected_owner = await client.patch(
            "/api/v1/users/me",
            json={"user_id": str(me.json()["id"]), "display_name": "Wrong"},
        )
        assert rejected_owner.status_code == 422

        updated = await client.patch(
            "/api/v1/users/me",
            json={"display_name": "Updated Trader", "email": "Trader@Example.com"},
        )
        assert updated.status_code == 200
        assert updated.json()["display_name"] == "Updated Trader"
        assert updated.json()["email"] == "trader@example.com"

        async with get_session_factory()() as db:
            user = await db.scalar(select(User).where(User.phone_e164 == f"+91{phone}"))
            assert user is not None
            preferences = await db.scalar(
                select(UserPreferences).where(UserPreferences.user_id == user.id)
            )
            assert preferences is not None
            assert preferences.trading_timezone == "Asia/Kolkata"
            assert preferences.default_trading_mode == "paper"
            session = await db.scalar(
                select(AuthSession).where(AuthSession.user_id == user.id)
            )
            raw_cookie = client.cookies.get(get_settings().session_cookie_name)
            assert raw_cookie is not None
            assert session is not None
            assert session.token_hash == hash_session_token(raw_cookie)
            assert session.token_hash != raw_cookie

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
            cookies=client.cookies,
        ) as refreshed:
            assert (await refreshed.get("/api/v1/auth/me")).status_code == 200

        assert (await client.post("/api/v1/auth/logout")).status_code == 204
        assert (await client.get("/api/v1/auth/me")).status_code == 401

        second_otp = await request_code(client, phone)
        existing = await client.post(
            "/api/v1/auth/verify-otp",
            json={"phone": phone, "otp": second_otp},
        )
        assert existing.status_code == 200
        assert existing.json()["status"] == "authenticated"
        assert existing.json()["user"]["display_name"] == "Updated Trader"
    finally:
        await cleanup_user(phone)


async def test_incorrect_otp_is_blocked_on_fifth_attempt(client: AsyncClient) -> None:
    phone = fresh_phone()
    otp = await request_code(client, phone)
    wrong = "000000" if otp != "000000" else "111111"
    for attempt in range(1, 6):
        response = await client.post(
            "/api/v1/auth/verify-otp",
            json={"phone": phone, "otp": wrong},
        )
        assert response.status_code == (429 if attempt == 5 else 400)
    assert (
        await client.post("/api/v1/auth/verify-otp", json={"phone": phone, "otp": otp})
    ).status_code == 429


async def test_duplicate_requests_issue_only_one_otp() -> None:
    phone = fresh_phone()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as first, AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as second:
        responses = await asyncio.gather(
            first.post("/api/v1/auth/request-otp", json={"phone": phone}),
            second.post("/api/v1/auth/request-otp", json={"phone": phone}),
        )
    assert [response.status_code for response in responses] == [202, 202]
    previews = [response.json().get("development_otp") for response in responses]
    assert sum(preview is not None for preview in previews) == 1


async def test_expired_otp_and_security_validation(client: AsyncClient) -> None:
    phone = fresh_phone()
    await request_code(client, phone)
    normalized = PhoneRequest(phone=phone).phone
    await get_redis_client().expire(_otp_keys(normalized)[0], 1)
    await asyncio.sleep(1.1)
    expired = await client.post(
        "/api/v1/auth/verify-otp",
        json={"phone": phone, "otp": "123456"},
    )
    assert expired.status_code == 410
    assert expired.json()["detail"]["code"] == "otp_expired"

    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="production", dev_otp_preview=True)
    with pytest.raises(ValidationError):
        UpdateProfileRequest.model_validate({"display_name": None})


async def test_registration_ticket_is_single_use_and_session_expiry(client: AsyncClient) -> None:
    phone = fresh_phone()
    try:
        otp = await request_code(client, phone)
        verified = await client.post(
            "/api/v1/auth/verify-otp",
            json={"phone": phone, "otp": otp},
        )
        assert verified.json()["status"] == "profile_required"

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
            cookies=client.cookies,
        ) as first, AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
            cookies=client.cookies,
        ) as second:
            responses = await asyncio.gather(
                first.post(
                    "/api/v1/auth/complete-profile",
                    json={"display_name": "Concurrent Trader"},
                ),
                second.post(
                    "/api/v1/auth/complete-profile",
                    json={"display_name": "Concurrent Trader"},
                ),
            )
            assert sorted(response.status_code for response in responses) == [201, 401]
            authenticated_client = first if responses[0].status_code == 201 else second

            normalized = PhoneRequest(phone=phone).phone
            async with get_session_factory()() as db:
                user = await db.scalar(select(User).where(User.phone_e164 == normalized))
                assert user is not None
                count = await db.scalar(
                    select(func.count()).select_from(User).where(User.phone_e164 == normalized)
                )
                assert count == 1
                now = datetime.now(UTC)
                await db.execute(
                    update(AuthSession)
                    .where(AuthSession.user_id == user.id)
                    .values(created_at=now - timedelta(days=2), expires_at=now - timedelta(days=1))
                )
                await db.commit()

            expired = await authenticated_client.get("/api/v1/auth/me")
            assert expired.status_code == 401
            assert expired.json()["detail"]["code"] == "session_expired"
    finally:
        await cleanup_user(phone)
