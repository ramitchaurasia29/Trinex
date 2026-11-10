from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, ROUND_FLOOR
from typing import Any

from app.execution.market_data import Candle, Quote


def dec(value: Any) -> Decimal:
    return Decimal(str(value))


@dataclass(frozen=True)
class HandlerContext:
    now: datetime
    config: dict[str, Any]
    checkpoint: dict[str, Any]
    positions: list[dict[str, Any]]
    quote: Quote | None = None
    quotes: dict[str, Quote] = field(default_factory=dict)
    candle: Candle | None = None
    instrument_lot_size: Decimal = Decimal("1")


@dataclass(frozen=True)
class HandlerDecision:
    checkpoint: dict[str, Any]
    action: str | None = None
    action_key: str | None = None
    quantity: Decimal | None = None
    position_id: str | None = None
    reason: str | None = None
    complete_without_order: bool = False
    failed: bool = False


def _position(ctx: HandlerContext) -> dict[str, Any]:
    if not ctx.positions:
        raise ValueError("Handler requires a position")
    return ctx.positions[0]


def _exit_quantity(config: dict[str, Any], position: dict[str, Any]) -> Decimal:
    available = dec(position["available_quantity"])
    if config.get("exitType", "full") == "full":
        return available
    kind = config["partialType"]
    raw = dec(config[{"lots": "lots", "qty": "qty", "pct": "pct"}[kind]])
    if kind == "lots":
        return raw * dec(position["lot_size"])
    if kind == "pct":
        return (available * raw / Decimal(100)).to_integral_value(rounding=ROUND_FLOOR)
    return raw


def timed_exit(ctx: HandlerContext) -> HandlerDecision:
    position = _position(ctx)
    return HandlerDecision(
        checkpoint={**ctx.checkpoint, "triggered_at": ctx.now.isoformat()},
        action="exit", action_key="timed-exit", quantity=_exit_quantity(ctx.config, position),
        position_id=str(position["id"]), reason="scheduled_time",
    )


def trailing_sl(ctx: HandlerContext) -> HandlerDecision:
    if ctx.quote is None:
        return HandlerDecision(ctx.checkpoint)
    p = _position(ctx); side = p["side"]; price = ctx.quote.last
    state = dict(ctx.checkpoint)
    if "anchor" not in state:
        anchor = price
        risk = dec(ctx.config["initialRisk"])
        if ctx.config["initialRiskUnit"] == "pct": risk = anchor * risk / 100
        state.update(anchor=str(anchor), watermark=str(anchor), stop=str(anchor - risk if side == "BUY" else anchor + risk), steps=0)
        return HandlerDecision(state)
    anchor, watermark, stop = dec(state["anchor"]), dec(state["watermark"]), dec(state["stop"])
    favorable = max(watermark, price) if side == "BUY" else min(watermark, price)
    step = dec(ctx.config["move"]); movement = dec(ctx.config["sl"])
    if ctx.config["moveUnit"] == "pct": step = anchor * step / 100
    if ctx.config["slUnit"] == "pct": movement = anchor * movement / 100
    favorable_distance = favorable - anchor if side == "BUY" else anchor - favorable
    steps = max(0, int((favorable_distance / step).to_integral_value(rounding=ROUND_FLOOR)))
    moved_stop = dec(state["stop"])
    if steps > int(state.get("steps", 0)):
        initial = dec(state["stop"]) - dec(state.get("applied_move", "0")) if side == "BUY" else dec(state["stop"]) + dec(state.get("applied_move", "0"))
        moved_stop = initial + movement * steps if side == "BUY" else initial - movement * steps
    state.update(watermark=str(favorable), stop=str(moved_stop), steps=steps, applied_move=str(movement * steps))
    hit = price <= moved_stop if side == "BUY" else price >= moved_stop
    if hit:
        return HandlerDecision(state, "exit", "trailing-stop", dec(p["available_quantity"]), str(p["id"]), "stop_reached")
    return HandlerDecision(state)


def timed_entry(ctx: HandlerContext, step_index: int = 0) -> HandlerDecision:
    rows = ctx.config["entries"] if ctx.config["ladder"] else [{"time": ctx.config["time"], "qty": ctx.config["qty"]}]
    row = rows[step_index]
    quantity = dec(row["qty"])
    if ctx.config["instrument"] == "fo":
        quantity *= dec(ctx.positions[0].get("lot_size", 1)) if ctx.positions else ctx.instrument_lot_size
    state = {**ctx.checkpoint, "current_step": step_index}
    return HandlerDecision(state, "entry", f"timed-entry:{step_index}", quantity, reason="scheduled_time")


def no_motion(ctx: HandlerContext, *, window_ended: bool = False, data_complete: bool = True) -> HandlerDecision:
    p = _position(ctx); state = dict(ctx.checkpoint)
    if ctx.quote and "reference" not in state:
        reference = dec(p["average_price"]) if ctx.config["reference"] == "entry" else ctx.quote.last
        state.update(reference=str(reference), condition_met=False)
    if ctx.quote and "reference" in state:
        price = ctx.quote.last
        if ctx.config["exitType"] == "window":
            reference = dec(state["reference"]); movement = dec(ctx.config["movement"])
            if ctx.config["movementType"] == "pct": movement = reference * movement / 100
            state["condition_met"] = bool(state.get("condition_met")) or price >= reference + movement or price <= reference - movement
        else:
            state["condition_met"] = bool(state.get("condition_met")) or price >= dec(ctx.config["high"]) or price <= dec(ctx.config["low"])
    if not window_ended: return HandlerDecision(state)
    if not data_complete: return HandlerDecision(state, reason="incomplete_market_data", failed=True)
    if state.get("condition_met"): return HandlerDecision(state, reason="movement_observed", complete_without_order=True)
    return HandlerDecision(state, "exit", "no-motion:end", dec(p["available_quantity"]), str(p["id"]), "no_motion")


def range_break(ctx: HandlerContext) -> HandlerDecision:
    p = _position(ctx); state = dict(ctx.checkpoint); level = dec(ctx.config["price"]); direction = ctx.config["direction"]
    price = ctx.candle.close if ctx.config["trigger"] == "close" and ctx.candle and ctx.candle.complete else ctx.quote.last if ctx.quote else None
    if price is None: return HandlerDecision(state)
    previous = dec(state["previous"]) if "previous" in state else None
    above, below = price >= level, price <= level
    trigger = ctx.config["trigger"]
    hit = False
    if trigger in {"touch", "close"}: hit = (direction in {"above", "either"} and above) or (direction in {"below", "either"} and below)
    elif previous is not None:
        hit = (direction in {"above", "either"} and previous < level <= price) or (direction in {"below", "either"} and previous > level >= price)
    state["previous"] = str(price)
    if hit: return HandlerDecision(state, "exit", f"range-break:{trigger}", _exit_quantity(ctx.config, p), str(p["id"]), "range_broken")
    return HandlerDecision(state)


def partial_profit(ctx: HandlerContext) -> HandlerDecision:
    if ctx.quote is None: return HandlerDecision(ctx.checkpoint)
    p = _position(ctx); state = dict(ctx.checkpoint); index = int(state.get("next_target", 0))
    if index >= len(ctx.config["targets"]): return HandlerDecision(state, complete_without_order=True)
    target = ctx.config["targets"][index]; level = dec(target["level"])
    hit = ctx.quote.last >= level if p["side"] == "BUY" else ctx.quote.last <= level
    if not hit: return HandlerDecision(state)
    available = dec(p["available_quantity"]); value = dec(target["value"])
    quantity = value * dec(p["lot_size"]) if target["type"] == "lots" else (available * value / 100).to_integral_value(rounding=ROUND_FLOOR) if target["type"] == "pct" else value
    state["next_target"] = index + 1
    return HandlerDecision(state, "exit", f"partial-profit:{index}", quantity, str(p["id"]), f"target_{index + 1}")


def mtm_lock(ctx: HandlerContext) -> HandlerDecision:
    state = dict(ctx.checkpoint)
    mtm = sum(dec(p["realized_pnl"]) + dec(p["unrealized_pnl"]) for p in ctx.positions)
    activation = dec(ctx.config["activation"])
    if not state.get("activated") and mtm >= activation: state["activated"] = True
    floor: Decimal | None = None
    if state.get("activated"):
        if not ctx.config["progressive"]: floor = dec(ctx.config["protected"])
        else:
            for row in ctx.config["levels"]:
                if mtm >= dec(row["target"]): floor = max(floor or dec(row["lock"]), dec(row["lock"]))
            if floor is not None: state["floor"] = str(max(floor, dec(state.get("floor", floor))))
            floor = dec(state["floor"]) if "floor" in state else None
    state["last_mtm"] = str(mtm)
    if floor is not None and mtm <= floor:
        return HandlerDecision(state, "exit_basket", "mtm-lock:floor", reason="mtm_floor_reached")
    return HandlerDecision(state)


def dependency(ctx: HandlerContext) -> HandlerDecision:
    if ctx.quote is None: return HandlerDecision(ctx.checkpoint)
    state = dict(ctx.checkpoint); level = dec(ctx.config["level"]); price = ctx.quote.last
    previous = dec(state["previous"]) if "previous" in state else None
    state["previous"] = str(price)
    if previous is None: return HandlerDecision(state)
    crossed = previous < level <= price if ctx.config["direction"] == "above" else previous > level >= price
    if not crossed: return HandlerDecision(state)
    if ctx.config["action"] == "entry":
        return HandlerDecision(state, "entry", "dependency:entry", dec(ctx.config["entryQuantity"]), reason="fresh_cross")
    p = _position(ctx); quantity = dec(p["available_quantity"])
    if ctx.config["exitQuantity"] == "partial":
        value = dec(ctx.config["exitValue"])
        quantity = value if ctx.config["quantityType"] == "qty" else (quantity * value / 100).to_integral_value(rounding=ROUND_FLOOR)
    return HandlerDecision(state, "exit", "dependency:exit", quantity, str(p["id"]), "fresh_cross")


HANDLERS = {
    "timed-exit": timed_exit,
    "trailing-sl": trailing_sl,
    "timed-entry": timed_entry,
    "no-motion": no_motion,
    "range-break": range_break,
    "partial-profit": partial_profit,
    "mtm-lock": mtm_lock,
    "dependency": dependency,
}
