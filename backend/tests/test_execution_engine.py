from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest

from app.execution.calendar import ExchangeCalendarUnavailableError, NseCalendar
from app.execution.costs import calculate_costs
from app.execution.handlers import (
    HandlerContext, dependency, mtm_lock, no_motion, partial_profit, range_break,
    timed_entry, timed_exit, trailing_sl,
)
from app.execution.market_data import CandleBuilder, MockMarketDataProvider, Quote
from app.execution.simulator import PaperOrderRequest, PaperOrderSimulator


NOW = datetime(2026, 11, 9, 5, 0, tzinfo=UTC)  # 10:30 IST, trading day
INSTRUMENT = uuid4()


def quote(price: str, *, age: int = 0, size: str = "50") -> Quote:
    value = Decimal(price)
    return Quote(INSTRUMENT, value - Decimal("0.05"), value + Decimal("0.05"), value, Decimal(size), Decimal(size), NOW - timedelta(seconds=age), NOW, 1)


def position(side: str = "BUY", qty: str = "100") -> dict:
    return {"id":str(uuid4()),"side":side,"available_quantity":qty,"quantity":qty,"average_price":"100","realized_pnl":"0","unrealized_pnl":"0","lot_size":"25","product":"MIS","kind":"stock"}


def context(config: dict, *, price: str = "100", state: dict | None = None, positions: list[dict] | None = None) -> HandlerContext:
    return HandlerContext(NOW, config, state or {}, positions or [position()], quote(price))


def test_quote_freshness_and_deterministic_mock_provider() -> None:
    assert quote("100", age=5).freshness(NOW) == "fresh"
    assert quote("100", age=6).freshness(NOW) == "suspended"
    assert quote("100", age=16).freshness(NOW) == "stale"


@pytest.mark.asyncio
async def test_mock_provider_and_candle_builder_are_deterministic() -> None:
    provider = MockMarketDataProvider(scenario={INSTRUMENT:[Decimal("100"),Decimal("102")]})
    first, second = await provider.quote(INSTRUMENT), await provider.quote(INSTRUMENT)
    candle = CandleBuilder.from_quotes([first, second], "1m")
    assert (first.last, second.last, candle.open, candle.close, candle.high) == (Decimal("100"), Decimal("102"), Decimal("100"), Decimal("102"), Decimal("102"))


def test_calendar_uses_nse_session_and_holidays() -> None:
    calendar = NseCalendar()
    assert calendar.is_open(NOW)
    assert not calendar.is_open(datetime(2026, 11, 10, 5, 0, tzinfo=UTC))


def test_calendar_fails_closed_until_nse_publishes_2027() -> None:
    calendar = NseCalendar()
    with pytest.raises(ExchangeCalendarUnavailableError, match="unavailable for 2027"):
        calendar.is_open(datetime(2027, 1, 4, 5, 0, tzinfo=UTC))


def test_calendar_accepts_only_an_explicit_loaded_year() -> None:
    calendar = NseCalendar({2027: set()})
    assert calendar.is_open(datetime(2027, 1, 4, 5, 0, tzinfo=UTC))


def test_timed_handlers_and_quantity_conversion() -> None:
    exit_config = {"exitType":"partial","partialType":"pct","lots":"","qty":"","pct":"50"}
    assert timed_exit(context(exit_config)).quantity == Decimal("50")
    entry = timed_entry(context({"instrument":"fo","ladder":False,"time":"10:30","qty":"2","entries":[]}), 0)
    assert entry.quantity == Decimal("50")


def test_trailing_stop_anchor_steps_and_trigger() -> None:
    config = {"move":"10","moveUnit":"pts","sl":"5","slUnit":"pts","initialRisk":"10","initialRiskUnit":"pts"}
    initial = trailing_sl(context(config, price="100"))
    assert initial.checkpoint["stop"] == "90"
    moved = trailing_sl(context(config, price="121", state=initial.checkpoint))
    assert moved.checkpoint["steps"] == 2 and Decimal(moved.checkpoint["stop"]) == Decimal("100")
    triggered = trailing_sl(context(config, price="99", state=moved.checkpoint))
    assert triggered.action == "exit" and triggered.reason == "stop_reached"


def test_no_motion_reaches_boundary_and_fails_closed_on_gap() -> None:
    config = {"reference":"entry","exitType":"window","movement":"5","movementType":"pts"}
    first = no_motion(context(config, price="101"))
    reached = no_motion(context(config, price="106", state=first.checkpoint), window_ended=True)
    assert reached.complete_without_order
    incomplete = no_motion(context(config, price="101", state=first.checkpoint), window_ended=True, data_complete=False)
    assert incomplete.failed and incomplete.action is None


def test_range_requires_fresh_cross_and_partial_profit_uses_remaining() -> None:
    config = {"trigger":"cross","direction":"above","price":"105","exitType":"full"}
    baseline = range_break(context(config, price="104"))
    assert baseline.action is None
    crossed = range_break(context(config, price="106", state=baseline.checkpoint))
    assert crossed.action == "exit"
    pp = {"targets":[{"level":"110","type":"pct","value":"50"},{"level":"120","type":"pct","value":"50"}]}
    first = partial_profit(context(pp, price="111")); assert first.quantity == Decimal("50")
    p = position(qty="50")
    second = partial_profit(context(pp, price="121", state=first.checkpoint, positions=[p])); assert second.quantity == Decimal("25")


def test_mtm_progressive_floor_and_dependency_fresh_cross() -> None:
    positions = [position()]; positions[0]["unrealized_pnl"] = "6500"
    config = {"activation":"5000","progressive":True,"levels":[{"target":"6000","lock":"3500"}]}
    armed = mtm_lock(context(config, positions=positions)); assert armed.checkpoint["floor"] == "3500"
    positions[0]["unrealized_pnl"] = "3400"
    assert mtm_lock(context(config, state=armed.checkpoint, positions=positions)).action == "exit_basket"
    dep = {"level":"105","direction":"above","action":"entry","entryQuantity":"10"}
    baseline = dependency(context(dep, price="106")); assert baseline.action is None
    below = dependency(context(dep, price="104", state=baseline.checkpoint)); assert below.action is None
    assert dependency(context(dep, price="106", state=below.checkpoint)).action == "entry"


def test_effective_dated_costs_and_partial_liquidity() -> None:
    costs = calculate_costs(price=Decimal("100"), quantity=Decimal("100"), side="SELL", kind="stock", product="MIS")
    assert costs.version == "india-nse-2026-04-01" and costs.stt > 0 and costs.gst > 0
    request = PaperOrderRequest(uuid4(), uuid4(), uuid4(), uuid4(), INSTRUMENT, "BUY", "MIS", Decimal("100"))
    instrument = type("Instrument", (), {"tick_size":Decimal("0.05")})()
    filled, price, reason = PaperOrderSimulator.simulate_attempt(request, quote("100", size="25"), instrument, Decimal("100"))
    assert filled == Decimal("25") and price is not None and reason is None


def test_limit_orders_never_fill_worse_than_limit() -> None:
    instrument = type("Instrument", (), {"tick_size":Decimal("0.05")})()
    blocked = PaperOrderRequest(uuid4(), uuid4(), uuid4(), uuid4(), INSTRUMENT, "BUY", "MIS", Decimal("10"), order_type="LIMIT", validity="DAY", limit_price=Decimal("99"))
    filled, price, reason = PaperOrderSimulator.simulate_attempt(blocked, quote("100"), instrument, Decimal("10"))
    assert filled == 0 and price is None and reason == "limit_not_marketable"
    marketable = PaperOrderRequest(uuid4(), uuid4(), uuid4(), uuid4(), INSTRUMENT, "BUY", "MIS", Decimal("10"), order_type="LIMIT", validity="IOC", limit_price=Decimal("101"))
    filled, price, reason = PaperOrderSimulator.simulate_attempt(marketable, quote("100"), instrument, Decimal("10"))
    assert filled == Decimal("10") and price is not None and price <= Decimal("101") and reason is None
