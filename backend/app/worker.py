from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket
from datetime import UTC, datetime

from app.core.config import get_settings
from app.core.redis import close_redis_client
from app.db.session import close_database_engine, get_session_factory
from app.execution.engine import ExecutionEngine
from app.services.redis_store import cache_subscription, set_worker_heartbeat
from app.db.models.foundation import ToolInstance
from sqlalchemy import select


logger = logging.getLogger("trinex.worker")


def _validate_worker_settings() -> None:
    settings = get_settings()
    if settings.trading_mode != "paper" or settings.market_data_provider != "mock":
        raise RuntimeError("Execution worker is restricted to paper mode with mock market data")
    branch = (settings.neon_branch or "").strip().lower()
    if not branch or branch in {"production", "main", "master"}:
        raise RuntimeError("Execution worker requires an explicit non-production NEON_BRANCH")


async def run(*, once: bool = False, stop_event: asyncio.Event | None = None) -> None:
    _validate_worker_settings()
    settings = get_settings()
    stop = stop_event or asyncio.Event()
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    engine = ExecutionEngine(lease_seconds=settings.execution_lease_seconds)
    heartbeat_ttl = max(30, settings.execution_heartbeat_seconds * 3)
    try:
        while not stop.is_set():
            async with get_session_factory()() as db:
                try:
                    instrument_ids = [str(value) for value in (await db.scalars(select(ToolInstance.instrument_id).where(ToolInstance.status.in_(("waiting","active","imminent","queued")), ToolInstance.instrument_id.is_not(None)))).all()]
                    await cache_subscription(worker_id, sorted(set(instrument_ids)), ttl_seconds=heartbeat_ttl)
                    processed = await engine.run_once(db, worker_id)
                    await set_worker_heartbeat(worker_id, {"at":datetime.now(UTC).isoformat(),"processed":processed,"subscriptions":len(set(instrument_ids)),"mode":"PAPER","provider":"mock","state":"running"}, ttl_seconds=heartbeat_ttl)
                except Exception:
                    await db.rollback(); logger.exception("Paper worker iteration failed")
            if once:
                return
            try:
                await asyncio.wait_for(
                    stop.wait(), timeout=settings.execution_poll_interval_seconds
                )
            except TimeoutError:
                pass
    finally:
        try:
            await set_worker_heartbeat(
                worker_id,
                {
                    "at": datetime.now(UTC).isoformat(),
                    "mode": "PAPER",
                    "provider": "mock",
                    "state": "stopping",
                },
                ttl_seconds=15,
            )
        except Exception:
            logger.exception("Could not publish final worker heartbeat")
        await close_redis_client()
        await close_database_engine()
        logger.info("Paper worker stopped gracefully")


async def _run_cli(*, once: bool) -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def request_shutdown() -> None:
        if not stop_event.is_set():
            logger.info("Shutdown requested; finishing the current polling cycle")
            stop_event.set()

    for signum in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(signum, request_shutdown)
        except (NotImplementedError, RuntimeError):
            signal.signal(signum, lambda *_args: loop.call_soon_threadsafe(request_shutdown))

    await run(once=once, stop_event=stop_event)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Trinex paper execution worker")
    parser.add_argument("--once", action="store_true", help="Run one recoverable polling cycle")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    # Dependency INFO logs can include backend endpoint URLs. Worker logs should
    # contain operational state, never connection details.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    asyncio.run(_run_cli(once=args.once))
