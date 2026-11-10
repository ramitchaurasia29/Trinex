import secrets
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

from app.core.config import get_settings
from app.db.models.foundation import (
    ActivityEvent,
    AuthSession,
    BrokerAccount,
    Instrument,
    Position,
    PositionSnapshot,
    ToolEvent,
    ToolInstance,
    ToolInstancePosition,
    User,
    UserPreferences,
    UserToolDefault,
)
from app.db.session import get_session_factory
from app.main import app
from app.services.redis_store import acquire_lock, release_lock

pytestmark = pytest.mark.asyncio


def fresh_phone() -> str:
    return f"8{secrets.randbelow(1_000_000_000):09d}"


async def register(client: AsyncClient, phone: str, name: str) -> None:
    sent = await client.post("/api/v1/auth/request-otp", json={"phone": phone})
    assert sent.status_code == 202
    otp = sent.json()["development_otp"]
    verified = await client.post("/api/v1/auth/verify-otp", json={"phone": phone, "otp": otp})
    assert verified.json()["status"] == "profile_required"
    assert (await client.post("/api/v1/auth/complete-profile", json={"display_name": name})).status_code == 201


async def cleanup(phone_numbers: list[str]) -> None:
    normalized = [f"+91{phone}" for phone in phone_numbers]
    async with get_session_factory()() as db:
        user_ids = list((await db.scalars(select(User.id).where(User.phone_e164.in_(normalized)))).all())
        if user_ids:
            tool_ids = list((await db.scalars(select(ToolInstance.id).where(ToolInstance.user_id.in_(user_ids)))).all())
            position_ids = list((await db.scalars(select(Position.id).where(Position.user_id.in_(user_ids)))).all())
            if tool_ids:
                await db.execute(delete(ToolEvent).where(ToolEvent.tool_instance_id.in_(tool_ids)))
                await db.execute(delete(ToolInstancePosition).where(ToolInstancePosition.tool_instance_id.in_(tool_ids)))
            if position_ids:
                await db.execute(delete(ActivityEvent).where(ActivityEvent.position_id.in_(position_ids)))
                await db.execute(delete(PositionSnapshot).where(PositionSnapshot.position_id.in_(position_ids)))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.user_id.in_(user_ids)))
            await db.execute(delete(ToolInstance).where(ToolInstance.user_id.in_(user_ids)))
            await db.execute(delete(Position).where(Position.user_id.in_(user_ids)))
            await db.execute(delete(BrokerAccount).where(BrokerAccount.user_id.in_(user_ids)))
            await db.execute(delete(AuthSession).where(AuthSession.user_id.in_(user_ids)))
            await db.execute(delete(UserPreferences).where(UserPreferences.user_id.in_(user_ids)))
            await db.execute(delete(UserToolDefault).where(UserToolDefault.user_id.in_(user_ids)))
            await db.execute(delete(User).where(User.id.in_(user_ids)))
            await db.flush()
            await db.execute(delete(Instrument).where(
                ~Instrument.id.in_(select(Position.instrument_id)),
                Instrument.instrument_metadata["data_mode"].astext == "SIMULATED",
            ))
            await db.commit()


async def test_mock_broker_sync_isolation_and_disconnect() -> None:
    assert get_settings().neon_branch == "dev-database-foundation"
    phone_one, phone_two = fresh_phone(), fresh_phone()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as first, AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as second:
        try:
            await register(first, phone_one, "Broker Test One")
            await register(second, phone_two, "Broker Test Two")

            providers = await first.get("/api/v1/brokers/providers")
            assert providers.status_code == 200
            assert next(item for item in providers.json() if item["id"] == "mock")["connection_available"] is True
            assert (await second.get("/api/v1/positions?status=open")).json()["items"] == []
            unavailable = await first.post("/api/v1/brokers/connect", json={"provider": "zerodha", "client_request_id": str(uuid4())})
            assert unavailable.status_code == 501

            request_id = str(uuid4())
            connected = await first.post("/api/v1/brokers/connect", json={"provider": "mock", "client_request_id": request_id})
            assert connected.status_code == 201
            account_one = connected.json()["id"]
            duplicate = await first.post("/api/v1/brokers/connect", json={"provider": "mock", "client_request_id": request_id})
            assert duplicate.json()["id"] == account_one
            account_two = (await first.post("/api/v1/brokers/connect", json={"provider": "mock", "client_request_id": str(uuid4()), "display_name": "Second Paper Account"})).json()["id"]
            assert account_two != account_one

            first_sync = await first.post(f"/api/v1/brokers/{account_one}/sync")
            assert first_sync.status_code == 200, first_sync.text
            assert first_sync.json()["open_positions"] == 7
            assert first_sync.json()["closed_positions"] == 2
            assert first_sync.json()["snapshots_created"] == 9
            repeated = await first.post(f"/api/v1/brokers/{account_one}/sync")
            assert repeated.status_code == 200
            assert repeated.json()["snapshots_created"] == 0
            assert (await first.post(f"/api/v1/brokers/{account_two}/sync")).status_code == 200
            synced_all = await first.post("/api/v1/brokers/sync")
            assert synced_all.status_code == 200, synced_all.text
            assert len(synced_all.json()["results"]) == 2

            positions = await first.get("/api/v1/positions?status=open&search=NIFTY&kind=option&sort=pnl-desc")
            assert positions.status_code == 200
            body = positions.json()
            assert body["summary"]["position_count"] >= 4
            assert all(item["data_mode"] == "SIMULATED" for item in body["items"])
            long_item = next(item for item in body["items"] if item["symbol"] == "NIFTY 24500 CE")
            assert long_item["net_quantity"] == "150.00000000"
            assert long_item["mtm"] == long_item["unrealized_pnl"]
            position_id = long_item["id"]
            assert (await first.get(f"/api/v1/positions/{position_id}")).status_code == 200

            assert (await second.get(f"/api/v1/positions/{position_id}")).status_code == 404
            assert (await second.post(f"/api/v1/brokers/{account_one}/sync")).status_code == 404
            assert (await second.post(f"/api/v1/brokers/{account_one}/reconnect")).status_code == 404
            assert (await second.delete(f"/api/v1/brokers/{account_one}")).status_code == 404

            principal = (await first.get("/api/v1/auth/me")).json()
            async with get_session_factory()() as db:
                user_id = principal["id"]
                tool = ToolInstance(
                    user_id=user_id,
                    tool_type="timed-exit",
                    status="active",
                    execution_mode="paper",
                    config={"time": "15:10"},
                    summary="Paper test tool",
                    target_label="NIFTY 24500 CE",
                    broker_account_id=account_one,
                )
                db.add(tool)
                await db.commit()
                await db.refresh(tool)
                tool_id = tool.id

            lock = await acquire_lock(f"broker-sync:{principal['id']}:{account_one}", ttl_seconds=10)
            assert lock is not None
            try:
                assert (await first.post(f"/api/v1/brokers/{account_one}/sync")).status_code == 409
            finally:
                await release_lock(lock)

            disconnected = await first.delete(f"/api/v1/brokers/{account_one}")
            assert disconnected.status_code == 200
            assert disconnected.json()["retained_positions"] == 9
            assert disconnected.json()["paused_tools"] == 1
            retained = await first.get(f"/api/v1/positions?status=open&broker_account_id={account_one}")
            assert retained.json()["summary"]["position_count"] == 7
            assert all(item["stale"] for item in retained.json()["items"])
            reconnected = await first.post(f"/api/v1/brokers/{account_one}/reconnect")
            assert reconnected.status_code == 200
            assert reconnected.json()["status"] == "connected"
            async with get_session_factory()() as db:
                assert await db.scalar(select(ToolInstance.status).where(ToolInstance.id == tool_id)) == "paused"
                assert await db.scalar(select(func.count()).select_from(ToolEvent).where(ToolEvent.tool_instance_id == tool_id)) == 1
                assert await db.scalar(select(func.count()).select_from(Position).where(Position.user_id == principal["id"])) == 18
        finally:
            await cleanup([phone_one, phone_two])
