from datetime import UTC, datetime
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class FixedClock:
    def __init__(self, value: datetime):
        self.value = value.astimezone(UTC)

    def now(self) -> datetime:
        return self.value

    def set(self, value: datetime) -> None:
        self.value = value.astimezone(UTC)
