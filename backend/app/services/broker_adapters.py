import hashlib
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class BrokerPosition:
    key: str
    trading_symbol: str
    display_symbol: str
    exchange: str
    kind: str
    side: str
    product: str
    quantity: Decimal
    available_quantity: Decimal
    average_price: Decimal
    ltp: Decimal
    previous_close: Decimal
    day_open: Decimal
    day_low: Decimal
    day_high: Decimal
    realized_pnl: Decimal
    margin_used: Decimal
    lot_size: Decimal
    tick_size: Decimal
    opened_at: datetime
    status: str = "open"
    closed_at: datetime | None = None
    expiry_date: date | None = None
    strike_price: Decimal | None = None
    option_type: str | None = None
    underlying_symbol: str | None = None
    greeks: dict[str, object] | None = None
    exit_method: str | None = None


@dataclass(frozen=True)
class BrokerPositionBook:
    positions: tuple[BrokerPosition, ...]
    margin_available: Decimal
    captured_at: datetime


class BrokerAdapter(Protocol):
    async def fetch_position_book(self, external_account_id: str) -> BrokerPositionBook: ...


class MockBrokerAdapter:
    """Deterministic, credential-free paper position source."""

    async def fetch_position_book(self, external_account_id: str) -> BrokerPositionBook:
        seed = int(hashlib.sha256(external_account_id.encode()).hexdigest()[:4], 16)
        shift = Decimal(seed % 7) / Decimal("10")
        now = datetime.now(UTC).replace(microsecond=0)
        expiry = date(2026, 11, 26)
        positions = (
            self._p("nifty-ce", "NIFTY26NOV24500CE", "NIFTY 24500 CE", "NFO", "option", "BUY", 150, 75, "182.40", Decimal("214.65") + shift, "NRML", now, expiry, "24500", "CE", "NIFTY", {"delta": "0.54", "gamma": "0.0021", "theta": "-11.8", "vega": "9.4", "iv": "13.6"}),
            self._p("nifty-pe", "NIFTY26NOV24500PE", "NIFTY 24500 PE", "NFO", "option", "BUY", 75, 75, "171.20", Decimal("158.10") + shift, "NRML", now, expiry, "24500", "PE", "NIFTY", {"delta": "-0.46", "gamma": "0.0020", "theta": "-10.4", "vega": "8.8", "iv": "14.2"}),
            self._p("banknifty-ce", "BANKNIFTY26NOV52000CE", "BANKNIFTY 52000 CE", "NFO", "option", "SELL", 35, 35, "438.00", Decimal("412.30") + shift, "NRML", now, expiry, "52000", "CE", "BANKNIFTY", {"delta": "0.47", "gamma": "0.0009", "theta": "-22.2", "vega": "17.1", "iv": "15.0"}),
            self._p("banknifty-pe", "BANKNIFTY26NOV52000PE", "BANKNIFTY 52000 PE", "NFO", "option", "SELL", 70, 35, "270.00", Decimal("286.40") + shift, "NRML", now, expiry, "52000", "PE", "BANKNIFTY", {"delta": "-0.41", "gamma": "0.0009", "theta": "-24.2", "vega": "18.1", "iv": "15.2"}),
            self._p("reliance", "RELIANCE-EQ", "RELIANCE", "NSE", "stock", "BUY", 200, 1, "1428.00", Decimal("1430.35") + shift, "MIS", now),
            self._p("hdfcbank", "HDFCBANK-EQ", "HDFCBANK", "NSE", "stock", "SELL", 150, 1, "1712.50", Decimal("1698.20") + shift, "MIS", now),
            self._p("tatamotors", "TATAMOTORS-EQ", "TATAMOTORS", "NSE", "stock", "BUY", 500, 1, "742.10", Decimal("736.85") + shift, "CNC", now),
            self._closed("closed-sbin", "SBIN-EQ", "SBIN", "NSE", "stock", "BUY", 300, 1, "812.40", "806.10", "MIS", now, "External"),
            self._closed("closed-banknifty", "BANKNIFTY26NOV51800CE", "BANKNIFTY 51800 CE", "NFO", "option", "SELL", 35, 35, "288.00", "241.50", "NRML", now, "External", expiry, "51800", "CE", "BANKNIFTY"),
        )
        return BrokerPositionBook(positions=positions, margin_available=Decimal("184210.00"), captured_at=now)

    @staticmethod
    def _p(key: str, trading: str, display: str, exchange: str, kind: str, side: str, qty: int, lot: int, avg: str, ltp: Decimal, product: str, now: datetime, expiry: date | None = None, strike: str | None = None, option_type: str | None = None, underlying: str | None = None, greeks: dict[str, object] | None = None) -> BrokerPosition:
        average = Decimal(avg)
        quantity = Decimal(qty)
        signed = quantity if side == "BUY" else -quantity
        unrealized = (ltp - average) * signed
        return BrokerPosition(key, trading, display, exchange, kind, side, product, quantity, quantity, average, ltp, ltp - Decimal("4.20"), ltp - Decimal("2.10"), ltp - Decimal("12.00"), ltp + Decimal("14.00"), Decimal("0"), abs(average * quantity) / Decimal("5"), Decimal(lot), Decimal("0.05"), now - timedelta(hours=2), expiry_date=expiry, strike_price=Decimal(strike) if strike else None, option_type=option_type, underlying_symbol=underlying, greeks=greeks)

    @classmethod
    def _closed(cls, key: str, trading: str, display: str, exchange: str, kind: str, side: str, qty: int, lot: int, avg: str, exit_price: str, product: str, now: datetime, method: str, expiry: date | None = None, strike: str | None = None, option_type: str | None = None, underlying: str | None = None) -> BrokerPosition:
        average, exit_value, quantity = Decimal(avg), Decimal(exit_price), Decimal(qty)
        signed = quantity if side == "BUY" else -quantity
        realized = (exit_value - average) * signed
        return BrokerPosition(key, trading, display, exchange, kind, side, product, quantity, Decimal("0"), average, exit_value, exit_value, exit_value, exit_value, exit_value, realized, Decimal("0"), Decimal(lot), Decimal("0.05"), now - timedelta(days=1), status="closed", closed_at=now - timedelta(hours=1), expiry_date=expiry, strike_price=Decimal(strike) if strike else None, option_type=option_type, underlying_symbol=underlying, exit_method=method)


def get_broker_adapter(provider: str) -> BrokerAdapter:
    if provider == "mock":
        return MockBrokerAdapter()
    raise ValueError("Broker adapter is not implemented")
