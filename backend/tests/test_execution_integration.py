from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select

from app.db.models.foundation import (
    ActivityEvent, BrokerAccount, ExecutionAction, Instrument, Order, OrderEvent,
    OrderFill, Position, PositionSnapshot, ToolEvent, ToolExecutionState,
    ToolInstance, ToolInstancePosition, User,
)
from app.db.session import get_session_factory
from app.execution.clock import FixedClock
from app.execution.engine import ExecutionEngine
from app.execution.market_data import MockMarketDataProvider


@pytest.mark.asyncio
async def test_engine_is_idempotent_and_reconciles_a_paper_exit() -> None:
    now = datetime(2026, 11, 9, 5, 0, tzinfo=UTC)
    user_id, broker_id, instrument_id, position_id, tool_id = (uuid4() for _ in range(5))
    async with get_session_factory()() as db:
        try:
            db.add(User(id=user_id, phone_e164=f"+919{str(user_id.int)[-9:]}", display_name="Execution Test"))
            await db.flush()
            db.add(BrokerAccount(id=broker_id, user_id=user_id, provider="mock", external_account_id=str(uuid4()), display_name="PAPER Integration", status="connected", account_metadata={"data_mode":"SIMULATED"}))
            db.add(Instrument(id=instrument_id, exchange="NSE", trading_symbol=f"TEST{str(instrument_id)[:8]}", display_symbol=f"TEST {str(instrument_id)[:8]}", kind="stock", lot_size=Decimal("1"), tick_size=Decimal("0.05"), instrument_metadata={"data_mode":"SIMULATED"}))
            await db.flush()
            db.add(Position(id=position_id, user_id=user_id, broker_account_id=broker_id, instrument_id=instrument_id, broker_position_key=f"paper:{position_id}", side="BUY", product="MIS", status="open", quantity=Decimal("10"), available_quantity=Decimal("10"), average_price=Decimal("100"), realized_pnl=Decimal("0"), unrealized_pnl=Decimal("0"), margin_used=Decimal("0"), opened_at=now, last_synced_at=now))
            db.add(ToolInstance(id=tool_id, user_id=user_id, tool_type="timed-exit", status="waiting", execution_mode="paper", config={"instrument":"stock","time":"10:30","exitType":"full","partialType":"qty","lots":"","qty":"","pct":""}, config_version=1, summary="Exit full at 10:30", target_label="TEST", broker_account_id=broker_id, instrument_id=instrument_id, armed_at=now))
            await db.flush()
            db.add(ToolInstancePosition(user_id=user_id, tool_instance_id=tool_id, position_id=position_id, role="target"))
            await db.commit()

            clock = FixedClock(now)
            provider = MockMarketDataProvider(clock, scenario={instrument_id:[Decimal("110")]})
            engine = ExecutionEngine(provider, clock)
            tool = await db.get(ToolInstance, tool_id)
            await engine._evaluate(db, tool, "integration-worker")

            assert await db.scalar(select(func.count()).select_from(ExecutionAction).where(ExecutionAction.tool_instance_id == tool_id)) == 1
            assert await db.scalar(select(func.count()).select_from(Order).where(Order.tool_instance_id == tool_id)) == 1
            assert await db.scalar(select(func.count()).select_from(OrderFill).join(Order).where(Order.tool_instance_id == tool_id)) == 1
            assert await db.scalar(select(Position.status).where(Position.id == position_id)) == "closed"
            assert await db.scalar(select(ToolInstance.status).where(ToolInstance.id == tool_id)) == "completed"

            # A restarted worker sees no eligible completed tool and creates no duplicate action.
            assert await engine.run_once(db, "restarted-worker") == 0
            assert await db.scalar(select(func.count()).select_from(ExecutionAction).where(ExecutionAction.tool_instance_id == tool_id)) == 1
        finally:
            await db.rollback()
            order_ids = list((await db.scalars(select(Order.id).where(Order.tool_instance_id == tool_id))).all())
            await db.execute(delete(ActivityEvent).where(ActivityEvent.user_id == user_id))
            if order_ids:
                await db.execute(delete(OrderFill).where(OrderFill.order_id.in_(order_ids)))
                await db.execute(delete(OrderEvent).where(OrderEvent.order_id.in_(order_ids)))
            await db.execute(delete(Order).where(Order.user_id == user_id))
            await db.execute(delete(ExecutionAction).where(ExecutionAction.user_id == user_id))
            await db.execute(delete(ToolEvent).where(ToolEvent.user_id == user_id))
            await db.execute(delete(ToolExecutionState).where(ToolExecutionState.user_id == user_id))
            await db.execute(delete(ToolInstancePosition).where(ToolInstancePosition.user_id == user_id))
            await db.execute(delete(ToolInstance).where(ToolInstance.user_id == user_id))
            await db.execute(delete(PositionSnapshot).where(PositionSnapshot.user_id == user_id))
            await db.execute(delete(Position).where(Position.user_id == user_id))
            await db.execute(delete(BrokerAccount).where(BrokerAccount.user_id == user_id))
            await db.execute(delete(Instrument).where(Instrument.id == instrument_id))
            await db.execute(delete(User).where(User.id == user_id))
            await db.commit()
