from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.foundation import (
    ActivityEvent, BrokerAccount, ExecutionAction, Instrument, Order, OrderEvent,
    OrderFill, Position, PositionSnapshot, ToolExecutionState, ToolInstance,
    ToolInstancePosition,
)
from app.execution.costs import calculate_costs
from app.execution.calendar import IST
from app.execution.market_data import Quote


@dataclass(frozen=True)
class PaperOrderRequest:
    user_id: UUID
    tool_id: UUID
    action_id: UUID
    broker_account_id: UUID
    instrument_id: UUID
    side: str
    product: str
    quantity: Decimal
    order_type: str = "MARKET"
    validity: str = "IOC"
    limit_price: Decimal | None = None
    slippage_bps: Decimal = Decimal("0")
    position_id: UUID | None = None


@dataclass(frozen=True)
class SimulationResult:
    requested: Decimal
    filled: Decimal
    average_price: Decimal | None
    order_ids: tuple[UUID, ...]
    status: str
    reason: str | None = None


class PaperOrderSimulator:
    max_attempts = 3

    @staticmethod
    def _round_tick(price: Decimal, tick: Decimal) -> Decimal:
        return (price / tick).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * tick

    @classmethod
    def simulate_attempt(
        cls, request: PaperOrderRequest, quote: Quote, instrument: Instrument, remaining: Decimal,
    ) -> tuple[Decimal, Decimal | None, str | None]:
        if remaining <= 0: return Decimal("0"), None, None
        base = quote.ask if request.side == "BUY" else quote.bid
        available = quote.ask_size if request.side == "BUY" else quote.bid_size
        if available <= 0: return Decimal("0"), None, "temporary_no_liquidity"
        impact = base * request.slippage_bps / Decimal("10000")
        price = base + impact if request.side == "BUY" else base - impact
        price = cls._round_tick(price, instrument.tick_size)
        if request.order_type == "LIMIT":
            assert request.limit_price is not None
            marketable = price <= request.limit_price if request.side == "BUY" else price >= request.limit_price
            if not marketable: return Decimal("0"), None, "limit_not_marketable"
            price = min(price, request.limit_price) if request.side == "BUY" else max(price, request.limit_price)
        return min(remaining, available), price, None

    async def execute(self, db: AsyncSession, request: PaperOrderRequest, quote: Quote) -> SimulationResult:
        account = await db.scalar(select(BrokerAccount).where(
            BrokerAccount.user_id == request.user_id,
            BrokerAccount.id == request.broker_account_id,
        ).with_for_update())
        instrument = await db.scalar(select(Instrument).where(Instrument.id == request.instrument_id))
        action = await db.scalar(select(ExecutionAction).where(
            ExecutionAction.user_id == request.user_id,
            ExecutionAction.id == request.action_id,
        ).with_for_update())
        tool = await db.scalar(select(ToolInstance).where(
            ToolInstance.user_id == request.user_id, ToolInstance.id == request.tool_id,
        ).with_for_update())
        if not account or not instrument or not action or not tool:
            raise ValueError("Owned execution resources were not found")
        if account.status != "connected":
            return await self._reject(db, request, action, "broker_disconnected")
        if tool.execution_mode != "paper":
            return await self._reject(db, request, action, "paper_mode_required")
        if request.quantity <= 0 or (instrument.kind in {"option", "future"} and request.quantity % instrument.lot_size != 0):
            return await self._reject(db, request, action, "invalid_quantity")

        existing_day = await db.scalar(select(Order).where(
            Order.execution_action_id == action.id, Order.status == "open", Order.validity == "DAY",
        ).order_by(Order.attempt_number.desc()).with_for_update())
        if existing_day is not None:
            return await self._fill_open_day(db, request, quote, instrument, action, tool, existing_day)

        position = None
        if request.position_id:
            position = await db.scalar(select(Position).where(
                Position.user_id == request.user_id, Position.id == request.position_id,
            ).with_for_update())
            if not position or position.broker_account_id != request.broker_account_id:
                return await self._reject(db, request, action, "position_not_found")
            if request.quantity > position.available_quantity:
                return await self._reject(db, request, action, "insufficient_quantity")

        remaining = request.quantity
        total_value = Decimal("0")
        filled_total = Decimal("0")
        order_ids: list[UUID] = []
        terminal_reason: str | None = None
        day_open = False
        for attempt in range(1, self.max_attempts + 1):
            fill_qty, fill_price, reason = self.simulate_attempt(request, quote, instrument, remaining)
            order = Order(
                user_id=request.user_id, broker_account_id=request.broker_account_id,
                instrument_id=request.instrument_id, tool_instance_id=request.tool_id,
                position_id=request.position_id, execution_action_id=request.action_id,
                parent_order_id=order_ids[0] if order_ids else None,
                idempotency_key=f"{action.action_key}:{attempt}", broker_order_id=f"PAPER-{uuid4().hex[:16]}",
                execution_mode="paper", side=request.side, order_type=request.order_type,
                product=request.product, status="submitted", quantity=remaining,
                filled_quantity=Decimal("0"), limit_price=request.limit_price,
                attempt_number=attempt, validity=request.validity,
                expires_at=datetime.now(UTC).astimezone(IST).replace(hour=15, minute=30, second=0, microsecond=0).astimezone(UTC) if request.validity == "DAY" else None,
                submitted_at=datetime.now(UTC),
            )
            db.add(order); await db.flush(); order_ids.append(order.id)
            await self._event(db, order, "paper_submitted", "submitted", {"data_mode": "SIMULATED", "attempt": attempt})
            if fill_qty > 0 and fill_price is not None:
                costs = calculate_costs(price=fill_price, quantity=fill_qty, side=request.side, kind=instrument.kind, product=request.product)
                fill = OrderFill(
                    user_id=request.user_id, order_id=order.id, fill_key=f"{action.action_key}:{attempt}:1",
                    quantity=fill_qty, price=fill_price, turnover=costs.turnover,
                    slippage=abs(fill_price - (quote.ask if request.side == "BUY" else quote.bid)) * fill_qty,
                    brokerage=costs.brokerage, stt=costs.stt, exchange_charge=costs.exchange_charge,
                    sebi_charge=costs.sebi_charge, gst=costs.gst, stamp_duty=costs.stamp_duty,
                    total_cost=costs.total, cost_model_version=costs.version, filled_at=datetime.now(UTC),
                )
                db.add(fill)
                order.filled_quantity = fill_qty; order.average_fill_price = fill_price
                order.status = "filled" if fill_qty == remaining else "partially_filled"
                order.filled_at = datetime.now(UTC) if order.status == "filled" else None
                await self._event(db, order, "paper_fill", order.status, {"quantity": str(fill_qty), "price": str(fill_price), "costs": str(costs.total), "data_mode": "SIMULATED"})
                filled_total += fill_qty; total_value += fill_qty * fill_price; remaining -= fill_qty
                await self._reconcile_position(db, request, instrument, position, fill_qty, fill_price, costs.total, quote)
                if remaining <= 0: break
                if request.validity == "DAY":
                    order.status = "open"; day_open = True
                    break
            terminal_reason = reason or "partial_liquidity"
            order.status = "cancelled"; order.cancelled_at = datetime.now(UTC)
            await self._event(db, order, "paper_cancelled", "cancelled", {"reason": terminal_reason, "remaining": str(remaining)})
            if request.validity == "DAY" and reason == "limit_not_marketable":
                order.status = "open"
                day_open = True
                break

        average = total_value / filled_total if filled_total else None
        if remaining <= 0:
            action.status = "completed"; action.completed_at = datetime.now(UTC)
            await self._advance_tool(db, tool)
            status = "filled"
        elif day_open:
            action.status = "ordering"; tool.status = "queued"; status = "open"
        elif filled_total:
            action.status = "failed"; action.completed_at = datetime.now(UTC); tool.status = "failed"; tool.completed_at = datetime.now(UTC)
            status = "partially_filled"
        else:
            action.status = "failed"; action.completed_at = datetime.now(UTC); tool.status = "failed"; tool.completed_at = datetime.now(UTC); status = "rejected"
        action.attempt_count = len(order_ids)
        db.add(ActivityEvent(user_id=request.user_id, event_type=f"paper_order_{status}", summary=f"Simulated order {status}", tool_instance_id=request.tool_id, order_id=order_ids[-1] if order_ids else None, position_id=request.position_id, event_metadata={"data_mode":"SIMULATED","filled_quantity":str(filled_total)}, occurred_at=datetime.now(UTC)))
        await db.commit()
        return SimulationResult(request.quantity, filled_total, average, tuple(order_ids), status, terminal_reason)

    async def _fill_open_day(self, db: AsyncSession, request: PaperOrderRequest, quote: Quote, instrument: Instrument, action: ExecutionAction, tool: ToolInstance, order: Order) -> SimulationResult:
        remaining = order.quantity - order.filled_quantity
        fill_qty, fill_price, reason = self.simulate_attempt(request, quote, instrument, remaining)
        if fill_qty <= 0 or fill_price is None:
            await db.commit()
            return SimulationResult(request.quantity, order.filled_quantity, order.average_fill_price, (order.id,), "open", reason)
        costs = calculate_costs(price=fill_price, quantity=fill_qty, side=request.side, kind=instrument.kind, product=request.product)
        fill_count = int(await db.scalar(select(func.count()).select_from(OrderFill).where(OrderFill.order_id == order.id)) or 0) + 1
        db.add(OrderFill(user_id=request.user_id, order_id=order.id, fill_key=f"{action.action_key}:day:{fill_count}", quantity=fill_qty, price=fill_price, turnover=costs.turnover, slippage=abs(fill_price - (quote.ask if request.side == "BUY" else quote.bid)) * fill_qty, brokerage=costs.brokerage, stt=costs.stt, exchange_charge=costs.exchange_charge, sebi_charge=costs.sebi_charge, gst=costs.gst, stamp_duty=costs.stamp_duty, total_cost=costs.total, cost_model_version=costs.version, filled_at=datetime.now(UTC)))
        previous_value = (order.average_fill_price or Decimal("0")) * order.filled_quantity
        order.filled_quantity += fill_qty
        order.average_fill_price = (previous_value + fill_qty * fill_price) / order.filled_quantity
        await self._event(db, order, "paper_fill", "partially_filled" if order.filled_quantity < order.quantity else "filled", {"quantity":str(fill_qty),"price":str(fill_price),"data_mode":"SIMULATED"})
        position = await db.scalar(select(Position).where(Position.user_id == request.user_id, Position.id == request.position_id).with_for_update()) if request.position_id else None
        await self._reconcile_position(db, request, instrument, position, fill_qty, fill_price, costs.total, quote)
        if order.filled_quantity >= order.quantity:
            order.status = "filled"; order.filled_at = datetime.now(UTC); action.status = "completed"; action.completed_at = datetime.now(UTC)
            await self._advance_tool(db, tool); status = "filled"
        else:
            order.status = "open"; action.status = "ordering"; tool.status = "queued"; status = "open"
        await db.commit()
        return SimulationResult(request.quantity, order.filled_quantity, order.average_fill_price, (order.id,), status, reason)

    async def cancel_open_day(self, db: AsyncSession, action: ExecutionAction, reason: str = "session_closed") -> None:
        orders = list((await db.scalars(select(Order).where(Order.execution_action_id == action.id, Order.status == "open").with_for_update())).all())
        for order in orders:
            order.status = "cancelled"; order.cancelled_at = datetime.now(UTC)
            await self._event(db, order, "paper_cancelled", "cancelled", {"reason":reason})
        action.status = "failed"; action.completed_at = datetime.now(UTC)
        tool = await db.scalar(select(ToolInstance).where(ToolInstance.id == action.tool_instance_id).with_for_update())
        if tool: tool.status = "failed"; tool.completed_at = datetime.now(UTC)
        await db.commit()

    async def _advance_tool(self, db: AsyncSession, tool: ToolInstance) -> None:
        now = datetime.now(UTC)
        state = await db.scalar(select(ToolExecutionState).where(ToolExecutionState.tool_instance_id == tool.id).with_for_update())
        if tool.tool_type == "timed-entry" and state:
            rows = tool.config["entries"] if tool.config["ladder"] else [tool.config]
            current = int(state.checkpoint.get("current_step", 0)) + 1
            state.checkpoint = {**state.checkpoint, "current_step": current}
            tool.status = "completed" if current >= len(rows) else "active"
        elif tool.tool_type == "partial-profit" and state:
            tool.status = "completed" if int(state.checkpoint.get("next_target", 0)) >= len(tool.config["targets"]) else "active"
        elif tool.tool_type == "mtm-lock":
            open_count = int(await db.scalar(
                select(func.count()).select_from(Position).join(
                    ToolInstancePosition, ToolInstancePosition.position_id == Position.id
                ).where(ToolInstancePosition.tool_instance_id == tool.id, Position.status == "open", Position.available_quantity > 0)
            ) or 0)
            tool.status = "completed" if open_count == 0 else "queued"
        else:
            tool.status = "completed"
        if tool.status == "completed": tool.completed_at = now

    async def _reject(self, db: AsyncSession, request: PaperOrderRequest, action: ExecutionAction, reason: str) -> SimulationResult:
        action.status = "failed"; action.completed_at = datetime.now(UTC); action.attempt_count += 1
        tool = await db.scalar(select(ToolInstance).where(ToolInstance.id == request.tool_id).with_for_update())
        if tool: tool.status = "failed"; tool.completed_at = datetime.now(UTC)
        await db.commit()
        return SimulationResult(request.quantity, Decimal("0"), None, (), "rejected", reason)

    async def _event(self, db: AsyncSession, order: Order, event_type: str, status: str, payload: dict) -> None:
        sequence = int(await db.scalar(select(func.coalesce(func.max(OrderEvent.sequence), 0)).where(OrderEvent.order_id == order.id)) or 0) + 1
        db.add(OrderEvent(user_id=order.user_id, order_id=order.id, sequence=sequence, event_type=event_type, status=status, payload=payload, occurred_at=datetime.now(UTC)))

    async def _reconcile_position(self, db: AsyncSession, request: PaperOrderRequest, instrument: Instrument, position: Position | None, quantity: Decimal, price: Decimal, costs: Decimal, quote: Quote) -> Position:
        now = datetime.now(UTC)
        if position is None:
            key = f"paper:{request.instrument_id}:{request.product}"
            position = await db.scalar(select(Position).where(
                Position.user_id == request.user_id,
                Position.broker_account_id == request.broker_account_id,
                Position.broker_position_key == key,
            ).with_for_update())
            if position is None:
                position = Position(user_id=request.user_id, broker_account_id=request.broker_account_id, instrument_id=request.instrument_id, broker_position_key=key, side=request.side, product=request.product, status="open", quantity=quantity, available_quantity=quantity, average_price=price, realized_pnl=-costs, unrealized_pnl=Decimal("0"), margin_used=Decimal("0"), opened_at=now, last_synced_at=now)
                db.add(position); await db.flush()
            elif position.side == request.side:
                total = position.quantity + quantity
                position.average_price = (position.average_price * position.quantity + price * quantity) / total
                position.quantity = total; position.available_quantity += quantity; position.realized_pnl -= costs
            else:
                self._apply_reduction(position, quantity, price, costs)
        else:
            self._apply_reduction(position, quantity, price, costs)
        position.last_synced_at = now
        multiplier = Decimal("1") if position.side == "BUY" else Decimal("-1")
        position.unrealized_pnl = (quote.last - position.average_price) * position.quantity * multiplier if position.status == "open" else Decimal("0")
        db.add(PositionSnapshot(user_id=request.user_id, position_id=position.id, quantity=position.quantity, average_price=position.average_price, last_traded_price=quote.last, realized_pnl=position.realized_pnl, unrealized_pnl=position.unrealized_pnl, margin_used=position.margin_used, greeks={"data_mode":"SIMULATED"}, captured_at=now))
        return position

    @staticmethod
    def _apply_reduction(position: Position, quantity: Decimal, price: Decimal, costs: Decimal) -> None:
        multiplier = Decimal("1") if position.side == "BUY" else Decimal("-1")
        position.realized_pnl += (price - position.average_price) * quantity * multiplier - costs
        position.quantity -= quantity; position.available_quantity -= quantity
        if position.quantity <= 0:
            position.quantity = Decimal("0"); position.available_quantity = Decimal("0")
            position.status = "closed"; position.closed_at = datetime.now(UTC)
