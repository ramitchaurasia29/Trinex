from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.foundation import (
    ActivityEvent, BrokerAccount, Instrument, Order, OrderFill, Position, ToolEvent,
    ToolExecutionState, ToolInstance, ToolInstancePosition, UserToolDefault,
)
from app.schemas.tool_config import complete_config_errors, config_version_for, execution_config_errors, validate_tool_config
from app.schemas.tools import ToolEventResponse, ToolPositionResponse, ToolResponse


ACTIVE_STATUSES = {"waiting", "active", "imminent", "paused", "queued"}
HISTORY_STATUSES = {"completed", "cancelled", "failed"}
POSITION_TOOLS = {"timed-exit", "trailing-sl", "no-motion", "range-break", "partial-profit"}
EXECUTION_BLOCKERS: dict[str, list[str]] = {}


class ToolServiceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409, errors: dict[str, str] | None = None):
        self.code, self.message, self.status_code, self.errors = code, message, status_code, errors or {}
        super().__init__(message)


def _safe_decimal(value: Any) -> Decimal | None:
    try: return Decimal(str(value))
    except Exception: return None


def version_of(tool: ToolInstance) -> str:
    return tool.updated_at.astimezone(UTC).isoformat()


def _parse_version(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(UTC)
    except ValueError:
        return None


def assert_version(tool: ToolInstance, expected: str) -> None:
    parsed = _parse_version(expected)
    actual = tool.updated_at.astimezone(UTC)
    if parsed is None or parsed != actual:
        raise ToolServiceError("stale_tool_version", "This tool was changed in another session", 409)


async def owned_tool(db: AsyncSession, user_id: UUID, tool_id: UUID, *, lock: bool = False) -> ToolInstance:
    stmt = select(ToolInstance).where(ToolInstance.user_id == user_id, ToolInstance.id == tool_id)
    if lock: stmt = stmt.with_for_update()
    tool = await db.scalar(stmt)
    if tool is None: raise ToolServiceError("tool_not_found", "Tool was not found", 404)
    return tool


async def _append_event(db: AsyncSession, tool: ToolInstance, event_type: str, message: str, before: dict[str, Any], after: dict[str, Any], details: dict[str, Any] | None = None, *, activity: bool = False) -> None:
    sequence = int(await db.scalar(select(func.coalesce(func.max(ToolEvent.sequence), 0)).where(ToolEvent.tool_instance_id == tool.id)) or 0) + 1
    now = datetime.now(UTC)
    db.add(ToolEvent(user_id=tool.user_id, tool_instance_id=tool.id, sequence=sequence, event_type=event_type, message=message, state_before=before, state_after=after, details=details or {}, occurred_at=now))
    if activity:
        position_id = await db.scalar(select(ToolInstancePosition.position_id).where(ToolInstancePosition.tool_instance_id == tool.id).limit(1))
        db.add(ActivityEvent(user_id=tool.user_id, event_type=event_type, summary=message, tool_instance_id=tool.id, position_id=position_id, event_metadata={"tool_type": tool.tool_type, "status": tool.status, "target_label": tool.target_label, "data_mode": "PAPER"}, occurred_at=now))


async def _load_positions(db: AsyncSession, user_id: UUID, ids: list[UUID]) -> list[tuple[Position, Instrument, BrokerAccount]]:
    if not ids: return []
    rows = (await db.execute(select(Position, Instrument, BrokerAccount).join(Instrument, Instrument.id == Position.instrument_id).join(BrokerAccount, BrokerAccount.id == Position.broker_account_id).where(Position.user_id == user_id, Position.id.in_(ids)))).all()
    by_id = {row[0].id: row for row in rows}
    if len(by_id) != len(set(ids)):
        raise ToolServiceError("position_not_found", "One or more positions were not found", 404)
    return [by_id[item] for item in ids]


def _requested_quantity(tool_type: str, config: dict[str, Any], position: Position, instrument: Instrument) -> Decimal | None:
    if tool_type in {"timed-exit", "range-break"}:
        if config["exitType"] == "full": return position.available_quantity
        kind = config["partialType"]
        raw = _safe_decimal(config[{"lots":"lots","qty":"qty","pct":"pct"}[kind]])
        if raw is None: return None
        if kind == "lots": return raw * instrument.lot_size
        if kind == "qty": return raw
        return (position.available_quantity * raw / Decimal("100"))
    if tool_type == "dependency" and config["action"] == "exit":
        if config["exitQuantity"] == "full": return position.available_quantity
        raw = _safe_decimal(config["exitValue"])
        if raw is None: return None
        if config["quantityType"] == "qty": return raw
        return position.available_quantity * raw / Decimal("100")
    return None


async def validate_context(db: AsyncSession, user_id: UUID, tool_type: str, config: dict[str, Any], position_ids: list[UUID], broker_account_id: UUID | None, instrument_id: UUID | None) -> tuple[list[tuple[Position, Instrument, BrokerAccount]], BrokerAccount | None, Instrument | None, dict[str, str]]:
    errors = complete_config_errors(tool_type, config)
    rows = await _load_positions(db, user_id, position_ids)
    broker = None
    instrument = None
    if broker_account_id:
        broker = await db.scalar(select(BrokerAccount).where(BrokerAccount.user_id == user_id, BrokerAccount.id == broker_account_id))
        if broker is None: raise ToolServiceError("broker_not_found", "Broker account was not found", 404)
    if instrument_id:
        instrument = await db.scalar(select(Instrument).where(Instrument.id == instrument_id, Instrument.is_active.is_(True)))
        if instrument is None: raise ToolServiceError("instrument_not_found", "Instrument was not found", 404)

    if tool_type in POSITION_TOOLS and len(rows) != 1: errors["positionIds"] = "Select exactly one open position"
    if tool_type == "mtm-lock":
        expected = []
        for value in config.get("selectedPositionIds", []):
            try: expected.append(UUID(value))
            except (ValueError, TypeError): errors["selectedPositionIds"] = "Position IDs must be valid UUIDs"
        if set(expected) != set(position_ids): errors["selectedPositionIds"] = "Selected positions do not match associations"
    if tool_type == "dependency" and config.get("action") == "exit":
        try: expected_exit = UUID(config.get("exitPositionId", ""))
        except ValueError: expected_exit = None
        if len(rows) != 1 or expected_exit != (rows[0][0].id if rows else None): errors["exitPositionId"] = "Exit position does not match associations"
    entry_action = tool_type == "timed-entry" or (tool_type == "dependency" and config.get("action") == "entry")
    if entry_action:
        if broker is None: errors["brokerAccountId"] = "Choose a connected broker account"
        if instrument is None: errors["instrumentId"] = "Choose an active instrument"
    for position, position_instrument, account in rows:
        if position.status != "open" or position.available_quantity <= 0: errors[f"positions.{position.id}"] = "Position is not eligible"
        if account.status != "connected": errors[f"brokers.{account.id}"] = "Broker account is disconnected"
        if broker is not None and broker.id != account.id: errors["brokerAccountId"] = "Broker account does not own the selected position"
        expected_kind = "stock" if position_instrument.kind == "stock" else "fo"
        if tool_type in {"timed-exit", "trailing-sl", "range-break"} and config.get("instrument") != expected_kind: errors["instrument"] = "Instrument type does not match the selected position"
        if tool_type in {"no-motion", "partial-profit"}:
            expected = "stock" if position_instrument.kind == "stock" else "options"
            if config.get("instrument") != expected: errors["instrument"] = "Instrument type does not match the selected position"
        requested = _requested_quantity(tool_type, config, position, position_instrument) if not errors.get("exitValue") else None
        if requested is not None:
            if requested > position.available_quantity: errors["quantity"] = "Requested quantity exceeds eligible quantity"
            if position_instrument.kind in {"option", "future"} and requested % position_instrument.lot_size != 0: errors["quantity"] = f"Quantity must be a multiple of lot size {position_instrument.lot_size}"
        if tool_type == "partial-profit":
            available = position.available_quantity; previous: Decimal | None = None
            for index, target in enumerate(config.get("targets", [])):
                level = _safe_decimal(target.get("level"))
                amount = _safe_decimal(target.get("value"))
                if level is None or amount is None: continue
                if previous is not None and ((position.side == "BUY" and level <= previous) or (position.side == "SELL" and level >= previous)):
                    errors[f"targets.{index}.level"] = "Target levels must progress in the profitable direction"
                exit_amount = amount * position_instrument.lot_size if target["type"] == "lots" else (available * amount / Decimal("100") if target["type"] == "pct" else amount)
                if exit_amount > available: errors[f"targets.{index}.value"] = "Cumulative exits exceed eligible quantity"
                if position_instrument.kind in {"option", "future"} and exit_amount % position_instrument.lot_size != 0: errors[f"targets.{index}.value"] = f"Exit must be a multiple of lot size {position_instrument.lot_size}"
                available = max(Decimal("0"), available - exit_amount); previous = level
    if broker and broker.status != "connected": errors["brokerAccountId"] = "Broker account is disconnected"
    return rows, broker, instrument, errors


def _summary(tool_type: str, config: dict[str, Any]) -> str:
    if tool_type == "timed-exit": return f"Exit {config.get('exitType', 'full')} at {config.get('time', '—')}"
    if tool_type == "trailing-sl": return f"{config.get('move', '—')} {config.get('moveUnit', '')} → SL {config.get('sl', '—')} {config.get('slUnit', '')}"
    if tool_type == "timed-entry": return f"{'Ladder' if config.get('ladder') else config.get('side', 'Entry')} at {config.get('time', '—')}"
    if tool_type == "no-motion": return f"No-motion window ends {config.get('end', '—')}"
    if tool_type == "range-break": return f"{config.get('rangeLevel', 'Level')} {config.get('price', '—')} → exit"
    if tool_type == "partial-profit": return f"{config.get('targetCount', 0)} profit target(s)"
    if tool_type == "mtm-lock": return f"MTM activates at ₹{config.get('activation', '—')}"
    return f"{config.get('referenceSymbol', 'Instrument')} crosses {config.get('direction', 'level')}"


def _target(tool_type: str, rows: list[tuple[Position, Instrument, BrokerAccount]], instrument: Instrument | None, config: dict[str, Any]) -> str:
    if rows: return " + ".join(item[1].display_symbol for item in rows)
    if instrument: return instrument.display_symbol
    return config.get("entrySymbol") or config.get("referenceSymbol") or "Draft"


async def replace_associations(db: AsyncSession, tool: ToolInstance, rows: list[tuple[Position, Instrument, BrokerAccount]], config: dict[str, Any]) -> None:
    await db.execute(delete(ToolInstancePosition).where(ToolInstancePosition.tool_instance_id == tool.id))
    for position, _, _ in rows:
        role = "basket_member" if tool.tool_type == "mtm-lock" and config.get("positionType") == "basket" else "target"
        db.add(ToolInstancePosition(user_id=tool.user_id, tool_instance_id=tool.id, position_id=position.id, role=role))


async def tool_response(db: AsyncSession, tool: ToolInstance, *, include_events: bool = False) -> ToolResponse:
    rows = (await db.execute(select(ToolInstancePosition, Position, Instrument).join(Position, Position.id == ToolInstancePosition.position_id).join(Instrument, Instrument.id == Position.instrument_id).where(ToolInstancePosition.tool_instance_id == tool.id).order_by(ToolInstancePosition.created_at))).all()
    positions = [ToolPositionResponse(id=position.id, symbol=instrument.display_symbol, broker_account_id=position.broker_account_id, quantity=str(position.quantity), available_quantity=str(position.available_quantity), role=link.role) for link, position, instrument in rows]
    events: list[ToolEventResponse] = []
    if include_events:
        event_rows = (await db.scalars(select(ToolEvent).where(ToolEvent.user_id == tool.user_id, ToolEvent.tool_instance_id == tool.id).order_by(ToolEvent.sequence.desc()))).all()
        events = [ToolEventResponse(id=e.id, sequence=e.sequence, event_type=e.event_type, message=e.message, occurred_at=e.occurred_at, details=e.details) for e in event_rows]
    errors = complete_config_errors(tool.tool_type, tool.config)
    blockers = sorted(execution_config_errors(tool.tool_type, tool.config))
    state = await db.scalar(select(ToolExecutionState).where(ToolExecutionState.tool_instance_id == tool.id))
    order_count = int(await db.scalar(select(func.count()).select_from(Order).where(Order.tool_instance_id == tool.id)) or 0)
    return ToolResponse(id=tool.id, tool_type=tool.tool_type, status=tool.status, execution_mode="paper", config=tool.config, config_version=tool.config_version, version=version_of(tool), summary=tool.summary, target_label=tool.target_label, broker_account_id=tool.broker_account_id, instrument_id=tool.instrument_id, positions=positions, validation_errors=errors, execution_ready=not blockers, execution_blockers=blockers, execution_state=state.checkpoint if state else None, latest_evaluation_at=state.last_evaluated_at if state else None, latest_market_data_at=state.last_quote_at if state else None, execution_failure_reason=state.last_error_code if state else None, simulated_order_count=order_count, armed_at=tool.armed_at, paused_at=tool.paused_at, created_at=tool.created_at, updated_at=tool.updated_at, events=events)


async def create_draft(db: AsyncSession, user_id: UUID, *, tool_id: UUID, tool_type: str, config: dict[str, Any], position_ids: list[UUID], broker_account_id: UUID | None, instrument_id: UUID | None) -> ToolInstance:
    existing = await db.scalar(select(ToolInstance).where(ToolInstance.id == tool_id))
    if existing:
        if existing.user_id != user_id: raise ToolServiceError("tool_not_found", "Tool was not found", 404)
        return existing
    try: normalized = validate_tool_config(tool_type, config)
    except (ValidationError, ValueError) as exc: raise ToolServiceError("invalid_tool_config", "Configuration shape is invalid", 422, {"config": str(exc)}) from exc
    rows, broker, instrument, _ = await validate_context(db, user_id, tool_type, normalized, position_ids, broker_account_id, instrument_id)
    tool = ToolInstance(id=tool_id, user_id=user_id, tool_type=tool_type, status="draft", execution_mode="paper", config=normalized, config_version=config_version_for(tool_type, normalized), summary=_summary(tool_type, normalized), target_label=_target(tool_type, rows, instrument, normalized), broker_account_id=broker.id if broker else (rows[0][2].id if len({r[2].id for r in rows}) == 1 and rows else None), instrument_id=instrument.id if instrument else (rows[0][1].id if len(rows) == 1 else None))
    db.add(tool); await db.flush(); await replace_associations(db, tool, rows, normalized)
    await _append_event(db, tool, "tool_created", "Tool draft created", {}, {"status": "draft"}, activity=True)
    await db.commit(); await db.refresh(tool); return tool


async def update_tool(db: AsyncSession, user_id: UUID, tool_id: UUID, expected_version: str, config: dict[str, Any], position_ids: list[UUID], broker_account_id: UUID | None, instrument_id: UUID | None) -> ToolInstance:
    tool = await owned_tool(db, user_id, tool_id, lock=True); assert_version(tool, expected_version)
    if tool.status not in {"draft", "paused"}: raise ToolServiceError("invalid_tool_transition", "Pause this tool before editing", 409)
    filled = await db.scalar(select(func.count()).select_from(OrderFill).join(Order, Order.id == OrderFill.order_id).where(Order.tool_instance_id == tool.id))
    if filled:
        raise ToolServiceError("executed_tool_immutable", "Cancel and recreate a tool after execution has started", 409)
    try: normalized = validate_tool_config(tool.tool_type, config)
    except (ValidationError, ValueError) as exc: raise ToolServiceError("invalid_tool_config", "Configuration shape is invalid", 422, {"config": str(exc)}) from exc
    rows, broker, instrument, _ = await validate_context(db, user_id, tool.tool_type, normalized, position_ids, broker_account_id, instrument_id)
    before = {"status": tool.status, "config": tool.config}; tool.config = normalized; tool.config_version = config_version_for(tool.tool_type, normalized); tool.summary = _summary(tool.tool_type, normalized); tool.target_label = _target(tool.tool_type, rows, instrument, normalized); tool.broker_account_id = broker.id if broker else (rows[0][2].id if len({r[2].id for r in rows}) == 1 and rows else None); tool.instrument_id = instrument.id if instrument else (rows[0][1].id if len(rows) == 1 else None); tool.updated_at = datetime.now(UTC)
    await replace_associations(db, tool, rows, normalized); await _append_event(db, tool, "draft_updated", "Tool configuration updated", before, {"status": tool.status, "config": normalized})
    await db.commit(); await db.refresh(tool); return tool


async def review_tool(db: AsyncSession, user_id: UUID, tool_id: UUID, expected_version: str) -> tuple[ToolInstance, dict[str, str]]:
    tool = await owned_tool(db, user_id, tool_id, lock=True)
    assert_version(tool, expected_version)
    links = list((await db.scalars(select(ToolInstancePosition.position_id).where(ToolInstancePosition.tool_instance_id == tool.id))).all())
    _, _, _, errors = await validate_context(db, user_id, tool.tool_type, tool.config, links, tool.broker_account_id, tool.instrument_id)
    errors.update(execution_config_errors(tool.tool_type, tool.config))
    event = "validation_failed" if errors else "review_passed"; message = "Tool validation failed" if errors else "Tool review passed"
    await _append_event(db, tool, event, message, {"status": tool.status}, {"status": tool.status}, {"fields": sorted(errors)})
    await db.commit(); await db.refresh(tool); return tool, errors


async def transition_tool(db: AsyncSession, user_id: UUID, tool_id: UUID, expected_version: str, action: str) -> ToolInstance:
    tool = await owned_tool(db, user_id, tool_id, lock=True)
    target = {"arm": "waiting", "pause": "paused", "resume": "waiting", "cancel": "cancelled"}[action]
    if tool.status == target: return tool
    assert_version(tool, expected_version)
    allowed = {"arm": {"draft"}, "pause": {"waiting", "active", "imminent", "queued"}, "resume": {"paused"}, "cancel": {"draft", "waiting", "active", "imminent", "queued", "paused", "failed"}}[action]
    if tool.status not in allowed: raise ToolServiceError("invalid_tool_transition", f"Cannot {action} a {tool.status} tool", 409)
    if action in {"arm", "resume"}:
        links = list((await db.scalars(select(ToolInstancePosition.position_id).where(ToolInstancePosition.tool_instance_id == tool.id))).all())
        _, _, _, errors = await validate_context(db, user_id, tool.tool_type, tool.config, links, tool.broker_account_id, tool.instrument_id)
        errors.update(execution_config_errors(tool.tool_type, tool.config))
        if errors:
            await _append_event(db, tool, "validation_failed", f"Tool {action} validation failed", {"status": tool.status}, {"status": tool.status}, {"fields": sorted(errors)})
            await db.commit(); raise ToolServiceError("tool_validation_failed", "Tool configuration is not eligible to arm", 422, errors)
    before = {"status": tool.status}; now = datetime.now(UTC); tool.status = target; tool.updated_at = now
    if action == "arm": tool.armed_at = now
    if action == "pause": tool.paused_at = now
    if action == "resume": tool.paused_at = None
    if action == "cancel": tool.completed_at = now
    event = f"tool_{'armed' if action == 'arm' else action + 'd' if action in {'pause', 'resume'} else 'cancelled'}"
    message = {"arm": "Tool armed in waiting state", "pause": "Tool paused", "resume": "Tool resumed in waiting state", "cancel": "Tool cancelled"}[action]
    await _append_event(db, tool, event, message, before, {"status": target}, activity=True)
    await db.commit(); await db.refresh(tool); return tool
