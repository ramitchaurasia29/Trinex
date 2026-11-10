from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.foundation import (
    ExecutionAction, Instrument, Position, ToolEvent, ToolExecutionState,
    ToolInstance, ToolInstancePosition,
)
from app.execution.calendar import IST, NseCalendar
from app.execution.clock import Clock, SystemClock
from app.execution.handlers import HANDLERS, HandlerContext, HandlerDecision, no_motion, timed_entry
from app.execution.market_data import CandleBuilder, MarketDataProvider, MockMarketDataProvider, Quote
from app.execution.simulator import PaperOrderRequest, PaperOrderSimulator
from app.services.redis_store import acquire_execution_lock, cache_instrument_quote, release_lock


ACTIVE = ("waiting", "active", "imminent", "queued")


class ExecutionEngine:
    def __init__(self, provider: MarketDataProvider | None = None, clock: Clock | None = None, *, lease_seconds: int = 30):
        self.clock = clock or SystemClock()
        self.provider = provider or MockMarketDataProvider(self.clock)
        self.calendar = NseCalendar()
        self.simulator = PaperOrderSimulator()
        self.lease_seconds = lease_seconds
        self._candle_buffers: dict[tuple[UUID, str], list[Quote]] = {}

    @staticmethod
    def fingerprint(tool: ToolInstance) -> str:
        body = json.dumps({"type": tool.tool_type, "version": tool.config_version, "config": tool.config}, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(body.encode()).hexdigest()

    async def run_once(self, db: AsyncSession, worker_id: str) -> int:
        await self._resume_pending(db)
        tools = list((await db.scalars(
            select(ToolInstance).where(ToolInstance.status.in_(ACTIVE)).order_by(ToolInstance.updated_at).with_for_update(skip_locked=True).limit(50)
        )).all())
        processed = 0
        for tool in tools:
            lock = await acquire_execution_lock(str(tool.id))
            if lock is None: continue
            try:
                await self._evaluate(db, tool, worker_id)
                processed += 1
            finally:
                await release_lock(lock)
        return processed

    async def _state(self, db: AsyncSession, tool: ToolInstance, worker_id: str) -> ToolExecutionState:
        now = self.clock.now()
        state = await db.scalar(select(ToolExecutionState).where(ToolExecutionState.tool_instance_id == tool.id).with_for_update())
        fingerprint = self.fingerprint(tool)
        if state is None:
            state = ToolExecutionState(user_id=tool.user_id, tool_instance_id=tool.id, config_fingerprint=fingerprint, checkpoint={}, data_state="initializing", lease_owner=worker_id, lease_expires_at=now + timedelta(seconds=self.lease_seconds), fencing_token=1)
            db.add(state); await db.flush()
        else:
            if state.config_fingerprint != fingerprint:
                state.checkpoint = {}; state.config_fingerprint = fingerprint; state.data_state = "initializing"
            state.lease_owner = worker_id; state.lease_expires_at = now + timedelta(seconds=self.lease_seconds); state.fencing_token += 1
        return state

    async def _positions(self, db: AsyncSession, tool: ToolInstance) -> list[tuple[Position, Instrument]]:
        return list((await db.execute(
            select(Position, Instrument).join(ToolInstancePosition, ToolInstancePosition.position_id == Position.id).join(Instrument, Instrument.id == Position.instrument_id).where(ToolInstancePosition.user_id == tool.user_id, ToolInstancePosition.tool_instance_id == tool.id).order_by(ToolInstancePosition.created_at)
        )).all())

    @staticmethod
    def _position_dict(position: Position, instrument: Instrument) -> dict:
        return {"id":str(position.id),"instrument_id":str(position.instrument_id),"broker_account_id":str(position.broker_account_id),"side":position.side,"product":position.product,"status":position.status,"quantity":str(position.quantity),"available_quantity":str(position.available_quantity),"average_price":str(position.average_price),"realized_pnl":str(position.realized_pnl),"unrealized_pnl":str(position.unrealized_pnl),"lot_size":str(instrument.lot_size),"kind":instrument.kind}

    async def _evaluation_instrument(self, db: AsyncSession, tool: ToolInstance, rows: list[tuple[Position, Instrument]]) -> Instrument | None:
        if tool.tool_type == "dependency":
            return await db.scalar(select(Instrument).where(Instrument.display_symbol == tool.config.get("referenceSymbol"), Instrument.is_active.is_(True)))
        if rows: return rows[0][1]
        if tool.instrument_id: return await db.get(Instrument, tool.instrument_id)
        return None

    async def _evaluate(self, db: AsyncSession, tool: ToolInstance, worker_id: str) -> None:
        now = self.clock.now(); state = await self._state(db, tool, worker_id); rows = await self._positions(db, tool)
        instrument = await self._evaluation_instrument(db, tool, rows)
        if instrument is None:
            await self._fail(db, tool, state, "instrument_not_found"); return
        if not self.calendar.is_open(now):
            state.next_evaluation_at = self.calendar.session_bounds(now)[0].astimezone(UTC); await db.commit(); return
        quote = await self.provider.quote(instrument.id); freshness = quote.freshness(now)
        await cache_instrument_quote(str(instrument.id), {"bid":str(quote.bid),"ask":str(quote.ask),"last":str(quote.last),"exchange_at":quote.exchange_at.isoformat(),"source":quote.source,"data_mode":"SIMULATED"})
        recovered = state.data_state in {"suspended", "stale"} and freshness == "fresh"
        if freshness != "fresh":
            if tool.tool_type == "no-motion": state.checkpoint = {**state.checkpoint, "had_data_gap": True}
            if state.data_state != freshness: await self._tool_event(db, tool, f"market_data_{freshness}", f"Market data {freshness}", {"age_seconds":str(quote.age_seconds(now))})
            state.data_state = freshness; state.last_quote_at = quote.exchange_at; await db.commit(); return
        if recovered:
            state.checkpoint.pop("previous", None)
            await self._tool_event(db, tool, "market_data_recovered", "Fresh simulated market data restored", {})
        state.data_state = "fresh"; state.last_quote_at = quote.exchange_at; state.last_evaluated_at = now
        if tool.status == "waiting":
            tool.status = "active"; await self._tool_event(db, tool, "monitoring_started", "Paper monitoring started", {"data_mode":"SIMULATED"})
        positions = [self._position_dict(*row) for row in rows]
        candle = self._completed_candle(tool, quote, now)
        context = HandlerContext(now=now, config=tool.config, checkpoint=state.checkpoint, positions=positions, quote=quote, candle=candle, instrument_lot_size=instrument.lot_size)
        decision = await self._decide(tool, context)
        state.checkpoint = decision.checkpoint
        if decision.failed:
            await self._fail(db, tool, state, decision.reason or "handler_failed"); return
        if decision.complete_without_order:
            tool.status = "completed"; tool.completed_at = now; state.data_state = "closed"
            await self._tool_event(db, tool, "tool_completed", "Paper tool completed without an order", {"reason":decision.reason})
            await db.commit(); return
        if decision.action:
            if decision.action == "exit_basket":
                await db.commit()
                for index, (position, _) in enumerate(rows):
                    if position.status == "open" and position.available_quantity > 0:
                        await self._create_action(db, tool, state, HandlerDecision(decision.checkpoint, "exit", f"{decision.action_key}:{index}", position.available_quantity, str(position.id), decision.reason), quote)
                return
            await self._create_action(db, tool, state, decision, quote); return
        state.next_evaluation_at = now + timedelta(seconds=1); await db.commit()

    async def _decide(self, tool: ToolInstance, ctx: HandlerContext) -> HandlerDecision:
        local = ctx.now.astimezone(IST)
        if tool.tool_type in {"timed-exit", "timed-entry"}:
            rows = tool.config["entries"] if tool.tool_type == "timed-entry" and tool.config["ladder"] else [{"time":tool.config["time"]}]
            index = int(ctx.checkpoint.get("current_step", 0))
            if index >= len(rows): return HandlerDecision(ctx.checkpoint, complete_without_order=True)
            hour, minute = map(int, rows[index]["time"].split(":")); scheduled = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
            delta = (local - scheduled).total_seconds()
            if delta < 0: return HandlerDecision(ctx.checkpoint)
            if delta > 60: return HandlerDecision(ctx.checkpoint, reason="schedule_missed", failed=True)
            return timed_entry(ctx, index) if tool.tool_type == "timed-entry" else HANDLERS[tool.tool_type](ctx)
        if tool.tool_type == "no-motion":
            start_h, start_m = map(int, tool.config["start"].split(":")); start_time = local.replace(hour=start_h, minute=start_m).time()
            end_h, end_m = map(int, tool.config["end"].split(":")); end_time = local.replace(hour=end_h, minute=end_m).time()
            if local.time() < start_time: return HandlerDecision(ctx.checkpoint)
            if local.time() >= end_time and "reference" not in ctx.checkpoint:
                return HandlerDecision(ctx.checkpoint, reason="monitoring_window_missed", failed=True)
            ended = local.time() >= end_time
            return no_motion(ctx, window_ended=ended, data_complete=not bool(ctx.checkpoint.get("had_data_gap")))
        return HANDLERS[tool.tool_type](ctx)

    async def _create_action(self, db: AsyncSession, tool: ToolInstance, state: ToolExecutionState, decision: HandlerDecision, quote: Quote) -> None:
        key = f"{tool.armed_at.isoformat() if tool.armed_at else tool.id}:{decision.action_key}"
        existing = await db.scalar(select(ExecutionAction).where(ExecutionAction.tool_instance_id == tool.id, ExecutionAction.action_key == key))
        if existing:
            await db.commit(); return
        position_id = UUID(decision.position_id) if decision.position_id else None
        position = await db.scalar(select(Position).where(Position.user_id == tool.user_id, Position.id == position_id).with_for_update()) if position_id else None
        policy = tool.config.get("orderPolicy") or {"product":position.product if position else "MIS","orderType":"MARKET","validity":"IOC","limitPrice":None,"slippageBps":"0"}
        broker_id = position.broker_account_id if position else tool.broker_account_id
        instrument_id = position.instrument_id if position else tool.instrument_id
        if not broker_id or not instrument_id or decision.quantity is None:
            await self._fail(db, tool, state, "execution_context_missing"); return
        side = ("SELL" if position.side == "BUY" else "BUY") if decision.action == "exit" and position else tool.config.get("side") or tool.config.get("entrySide")
        if side not in {"BUY", "SELL"}:
            await self._fail(db, tool, state, "entry_side_missing"); return
        payload = {"broker_account_id":str(broker_id),"instrument_id":str(instrument_id),"position_id":str(position_id) if position_id else None,"side":side,"product":policy["product"],"quantity":str(decision.quantity),"order_type":policy["orderType"],"validity":policy["validity"],"limit_price":policy.get("limitPrice"),"slippage_bps":policy.get("slippageBps","0")}
        action = ExecutionAction(user_id=tool.user_id, tool_instance_id=tool.id, action_key=key, action_type=decision.action, status="pending", payload=payload, triggered_at=self.clock.now())
        db.add(action); tool.status = "queued"; await db.flush()
        await self._tool_event(db, tool, "execution_triggered", "Paper execution condition triggered", {"action_key":key,"reason":decision.reason,"data_mode":"SIMULATED"})
        await db.commit(); await self._process_action(db, action, quote)

    async def _resume_pending(self, db: AsyncSession) -> None:
        actions = list((await db.scalars(select(ExecutionAction).where(ExecutionAction.status.in_(("pending", "ordering"))).with_for_update(skip_locked=True).limit(25))).all())
        for action in actions:
            if action.status == "ordering" and not self.calendar.is_open(self.clock.now()):
                await self.simulator.cancel_open_day(db, action)
                continue
            instrument_id = UUID(action.payload["instrument_id"]); quote = await self.provider.quote(instrument_id)
            await self._process_action(db, action, quote)

    def _completed_candle(self, tool: ToolInstance, quote: Quote, now: datetime):
        if tool.tool_type != "range-break" or tool.config.get("trigger") != "close": return None
        interval = tool.config.get("candleInterval")
        if interval not in CandleBuilder.INTERVALS: return None
        key = (quote.instrument_id, interval); buffer = self._candle_buffers.setdefault(key, []); buffer.append(quote)
        minutes = CandleBuilder.INTERVALS[interval]
        start = buffer[0].exchange_at.replace(second=0, microsecond=0)
        start = start - timedelta(minutes=start.minute % minutes)
        if now < start + timedelta(minutes=minutes): return None
        completed = CandleBuilder.from_quotes(buffer, interval); self._candle_buffers[key] = []
        return completed

    async def _process_action(self, db: AsyncSession, action: ExecutionAction, quote: Quote) -> None:
        p = action.payload
        request = PaperOrderRequest(user_id=action.user_id, tool_id=action.tool_instance_id, action_id=action.id, broker_account_id=UUID(p["broker_account_id"]), instrument_id=UUID(p["instrument_id"]), position_id=UUID(p["position_id"]) if p.get("position_id") else None, side=p["side"], product=p["product"], quantity=Decimal(p["quantity"]), order_type=p["order_type"], validity=p["validity"], limit_price=Decimal(p["limit_price"]) if p.get("limit_price") else None, slippage_bps=Decimal(p["slippage_bps"]))
        await self.simulator.execute(db, request, quote)

    async def _fail(self, db: AsyncSession, tool: ToolInstance, state: ToolExecutionState, code: str) -> None:
        tool.status = "failed"; tool.completed_at = self.clock.now(); state.last_error_code = code; state.error_count += 1; state.data_state = "closed"
        await self._tool_event(db, tool, "execution_failed", "Paper execution stopped safely", {"code":code})
        await db.commit()

    async def _tool_event(self, db: AsyncSession, tool: ToolInstance, event_type: str, message: str, details: dict) -> None:
        sequence = int(await db.scalar(select(func.coalesce(func.max(ToolEvent.sequence), 0)).where(ToolEvent.tool_instance_id == tool.id)) or 0) + 1
        db.add(ToolEvent(user_id=tool.user_id, tool_instance_id=tool.id, sequence=sequence, event_type=event_type, message=message, state_before={}, state_after={"status":tool.status}, details=details, occurred_at=self.clock.now()))
