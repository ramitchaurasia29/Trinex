from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import AsyncIterator, Protocol
from uuid import UUID

from app.execution.clock import Clock, SystemClock


@dataclass(frozen=True)
class Quote:
    instrument_id: UUID
    bid: Decimal
    ask: Decimal
    last: Decimal
    bid_size: Decimal
    ask_size: Decimal
    exchange_at: datetime
    received_at: datetime
    sequence: int
    source: str = "mock"
    data_mode: str = "SIMULATED"

    def age_seconds(self, now: datetime) -> Decimal:
        return Decimal(str(max(0.0, (now - self.exchange_at).total_seconds())))

    def freshness(self, now: datetime) -> str:
        age = self.age_seconds(now)
        if age <= 5:
            return "fresh"
        if age <= 15:
            return "suspended"
        return "stale"


@dataclass(frozen=True)
class Candle:
    instrument_id: UUID
    interval: str
    started_at: datetime
    ended_at: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    complete: bool = True
    source: str = "mock"


class MarketDataProvider(Protocol):
    async def quote(self, instrument_id: UUID) -> Quote: ...
    async def stream(self, instrument_ids: set[UUID]) -> AsyncIterator[Quote]: ...


class MockMarketDataProvider:
    """Deterministic paper quotes; no network or broker connection is used."""

    def __init__(self, clock: Clock | None = None, *, scenario: dict[UUID, list[Decimal]] | None = None):
        self.clock = clock or SystemClock()
        self.scenario = scenario or {}
        self._sequence: dict[UUID, int] = {}

    def _price(self, instrument_id: UUID, sequence: int) -> Decimal:
        values = self.scenario.get(instrument_id)
        if values:
            return values[min(sequence, len(values) - 1)]
        digest = hashlib.sha256(instrument_id.bytes).digest()
        base = Decimal(100 + int.from_bytes(digest[:2], "big") % 24900)
        step = Decimal(((sequence % 21) - 10)) / Decimal("20")
        return (base + step).quantize(Decimal("0.05"), rounding=ROUND_HALF_UP)

    async def quote(self, instrument_id: UUID) -> Quote:
        sequence = self._sequence.get(instrument_id, 0)
        self._sequence[instrument_id] = sequence + 1
        now = self.clock.now().astimezone(UTC)
        last = self._price(instrument_id, sequence)
        spread = max(Decimal("0.05"), last * Decimal("0.0002"))
        size = Decimal(25 + (sequence % 4) * 25)
        return Quote(
            instrument_id=instrument_id,
            bid=(last - spread).quantize(Decimal("0.05"), rounding=ROUND_HALF_UP),
            ask=(last + spread).quantize(Decimal("0.05"), rounding=ROUND_HALF_UP),
            last=last,
            bid_size=size,
            ask_size=size,
            exchange_at=now,
            received_at=now,
            sequence=sequence,
        )

    async def stream(self, instrument_ids: set[UUID]) -> AsyncIterator[Quote]:
        for instrument_id in sorted(instrument_ids, key=str):
            yield await self.quote(instrument_id)


class CandleBuilder:
    INTERVALS = {"1m": 1, "3m": 3, "5m": 5, "15m": 15}

    @classmethod
    def from_quotes(cls, quotes: list[Quote], interval: str) -> Candle:
        if not quotes or interval not in cls.INTERVALS:
            raise ValueError("A supported interval and at least one quote are required")
        ordered = sorted(quotes, key=lambda item: item.exchange_at)
        start = ordered[0].exchange_at.replace(second=0, microsecond=0)
        minutes = cls.INTERVALS[interval]
        start = start - timedelta(minutes=start.minute % minutes)
        prices = [item.last for item in ordered]
        return Candle(
            instrument_id=ordered[0].instrument_id,
            interval=interval,
            started_at=start,
            ended_at=start + timedelta(minutes=minutes),
            open=prices[0], high=max(prices), low=min(prices), close=prices[-1],
        )
