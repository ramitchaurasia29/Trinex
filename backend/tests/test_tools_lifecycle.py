import secrets
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.models.foundation import ActivityEvent, ToolEvent, ToolInstance
from app.db.session import get_session_factory
from app.main import app
from test_brokers_positions import cleanup, register

pytestmark = pytest.mark.asyncio


def phone() -> str:
    return f"7{secrets.randbelow(1_000_000_000):09d}"


def timed_exit(position_id: str, qty: str = "75") -> dict:
    return {"id": str(uuid4()), "tool_type":"timed-exit", "config":{"instrument":"fo","time":"15:10","exitType":"partial","partialType":"qty","lots":"","qty":qty,"pct":""}, "position_ids":[position_id]}


async def test_tool_persistence_lifecycle_defaults_and_isolation() -> None:
    assert get_settings().neon_branch == "dev-database-foundation"
    one, two = phone(), phone()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as first, AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as other:
        try:
            await register(first, one, "Tool Owner")
            await register(other, two, "Other Owner")
            account_one = (await first.post("/api/v1/brokers/connect", json={"provider":"mock","client_request_id":str(uuid4())})).json()["id"]
            account_two = (await first.post("/api/v1/brokers/connect", json={"provider":"mock","client_request_id":str(uuid4())})).json()["id"]
            await first.post(f"/api/v1/brokers/{account_one}/sync")
            await first.post(f"/api/v1/brokers/{account_two}/sync")
            positions = (await first.get("/api/v1/positions?status=open")).json()["items"]
            p1 = next(p for p in positions if p["broker_account_id"] == account_one and p["kind"] == "option")
            p2 = next(p for p in positions if p["broker_account_id"] == account_two and p["kind"] == "option")
            instruments = (await first.get("/api/v1/instruments?kind=option")).json()
            instrument_id = instruments[0]["id"]

            payload = timed_exit(p1["id"])
            created = await first.post("/api/v1/tools/drafts", json=payload)
            assert created.status_code == 201, created.text
            draft = created.json(); tool_id = draft["id"]
            duplicate = await first.post("/api/v1/tools/drafts", json=payload)
            assert duplicate.json()["id"] == tool_id
            assert (await other.get(f"/api/v1/tools/{tool_id}")).status_code == 404

            review = await first.post(f"/api/v1/tools/{tool_id}/review", json={"expected_version":draft["version"]})
            assert review.status_code == 200 and review.json()["valid"]
            armed = (await first.post(f"/api/v1/tools/{tool_id}/arm", json={"expected_version":draft["version"]})).json()
            assert armed["status"] == "waiting" and armed["execution_mode"] == "paper"
            assert (await first.patch(f"/api/v1/tools/{tool_id}", json={"expected_version":armed["version"],"config":payload["config"],"position_ids":[p1["id"]]})).status_code == 409
            paused = (await first.post(f"/api/v1/tools/{tool_id}/pause", json={"expected_version":armed["version"]})).json()
            changed = {**payload["config"], "time":"15:00"}
            updated = await first.patch(f"/api/v1/tools/{tool_id}", json={"expected_version":paused["version"],"config":changed,"position_ids":[p1["id"]]})
            assert updated.status_code == 200
            assert (await first.patch(f"/api/v1/tools/{tool_id}", json={"expected_version":paused["version"],"config":changed,"position_ids":[p1["id"]]})).status_code == 409
            resumed = (await first.post(f"/api/v1/tools/{tool_id}/resume", json={"expected_version":updated.json()["version"]})).json()
            cancelled = (await first.post(f"/api/v1/tools/{tool_id}/cancel", json={"expected_version":resumed["version"]})).json()
            assert cancelled["status"] == "cancelled"
            assert (await first.post(f"/api/v1/tools/{tool_id}/resume", json={"expected_version":cancelled["version"]})).status_code == 409

            basket_config = {"positionType":"basket","selectedPositionIds":[p1["id"],p2["id"]],"basket":"2-position basket","activation":"5000","progressive":False,"protected":"3500","levels":[{"target":"","lock":""}]}
            basket = await first.post("/api/v1/tools/drafts", json={"id":str(uuid4()),"tool_type":"mtm-lock","config":basket_config,"position_ids":[p1["id"],p2["id"]]})
            assert basket.status_code == 201
            basket_armed = await first.post(f"/api/v1/tools/{basket.json()['id']}/arm", json={"expected_version":basket.json()["version"]})
            assert basket_armed.status_code == 200 and len(basket_armed.json()["positions"]) == 2

            entry_config = {"instrument":"fo","side":"BUY","ladder":False,"time":"09:35","qty":"1","entries":[{"time":"09:35","qty":""}],"orderPolicy":{"product":"NRML","orderType":"MARKET","validity":"DAY","limitPrice":None,"slippageBps":"5"}}
            entry = await first.post("/api/v1/tools/drafts", json={"id":str(uuid4()),"tool_type":"timed-entry","config":entry_config,"broker_account_id":account_one,"instrument_id":instrument_id})
            assert entry.status_code == 201
            assert (await first.post(f"/api/v1/tools/{entry.json()['id']}/arm", json={"expected_version":entry.json()["version"]})).status_code == 200

            invalid = await first.post("/api/v1/tools/drafts", json=timed_exit(p1["id"], "999999"))
            failed_arm = await first.post(f"/api/v1/tools/{invalid.json()['id']}/arm", json={"expected_version":invalid.json()["version"]})
            assert failed_arm.status_code == 422 and "quantity" in failed_arm.json()["detail"]["errors"]

            defaults = await first.put("/api/v1/tool-defaults", json={"defaults":[{"tool_type":"timed-exit","config":{"time":"15:05","exitType":"full","foPartialType":"lots","stockPartialType":"qty"},"is_enabled":True},{"tool_type":"mtm-lock","config":{"progressive":True},"is_enabled":True}]})
            assert defaults.status_code == 200 and len((await first.get("/api/v1/tool-defaults")).json()) == 2
            activity = (await first.get("/api/v1/activity/events")).json()["items"]
            assert {item["event_type"] for item in activity} >= {"tool_created", "tool_armed", "tool_paused", "tool_resumed", "tool_cancelled"}
            async with get_session_factory()() as db:
                assert await db.scalar(select(func.count()).select_from(ToolEvent).where(ToolEvent.tool_instance_id == tool_id)) >= 6
                assert await db.scalar(select(func.count()).select_from(ActivityEvent).where(ActivityEvent.tool_instance_id == tool_id)) >= 5
                assert await db.scalar(select(ToolInstance.execution_mode).where(ToolInstance.id == tool_id)) == "paper"
        finally:
            await cleanup([one, two])
