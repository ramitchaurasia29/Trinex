from types import SimpleNamespace

import pytest

from app import worker


@pytest.mark.asyncio
async def test_worker_publishes_stopping_heartbeat_and_closes_resources(monkeypatch) -> None:
    settings = SimpleNamespace(
        trading_mode="paper",
        market_data_provider="mock",
        neon_branch="dev-database-foundation",
        execution_lease_seconds=30,
        execution_heartbeat_seconds=10,
        execution_poll_interval_seconds=1,
    )
    heartbeats: list[dict] = []
    closed: list[str] = []

    monkeypatch.setattr(worker, "get_settings", lambda: settings)

    async def record_heartbeat(_worker_id, payload, *, ttl_seconds):
        heartbeats.append({**payload, "ttl_seconds": ttl_seconds})

    async def close_redis():
        closed.append("redis")

    async def close_database():
        closed.append("database")

    monkeypatch.setattr(worker, "set_worker_heartbeat", record_heartbeat)
    monkeypatch.setattr(worker, "close_redis_client", close_redis)
    monkeypatch.setattr(worker, "close_database_engine", close_database)

    stop_event = worker.asyncio.Event()
    stop_event.set()
    await worker.run(stop_event=stop_event)

    assert heartbeats[-1]["state"] == "stopping"
    assert heartbeats[-1]["mode"] == "PAPER"
    assert closed == ["redis", "database"]


def test_worker_refuses_a_production_branch(monkeypatch) -> None:
    settings = SimpleNamespace(
        trading_mode="paper",
        market_data_provider="mock",
        neon_branch="production",
    )
    monkeypatch.setattr(worker, "get_settings", lambda: settings)
    with pytest.raises(RuntimeError, match="non-production"):
        worker._validate_worker_settings()
