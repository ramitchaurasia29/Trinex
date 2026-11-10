from collections.abc import Mapping
from datetime import date, datetime, time
from zoneinfo import ZoneInfo


IST = ZoneInfo("Asia/Kolkata")

# Official NSE Capital Market/F&O holidays published for 2026. The additional
# 15 January closure was announced by NSE for the Maharashtra civic election.
NSE_HOLIDAYS_2026 = frozenset({
    date(2026, 1, 15), date(2026, 1, 26), date(2026, 3, 3),
    date(2026, 3, 26), date(2026, 3, 31), date(2026, 4, 3),
    date(2026, 4, 14), date(2026, 5, 1), date(2026, 5, 28),
    date(2026, 6, 26), date(2026, 9, 14), date(2026, 10, 2),
    date(2026, 10, 20), date(2026, 11, 10), date(2026, 11, 24),
    date(2026, 12, 25),
})

# Do not infer a future exchange calendar from public/bank-holiday calendars.
# Add a year only after NSE publishes its Capital Market/F&O circular.
NSE_HOLIDAYS_BY_YEAR: dict[int, frozenset[date]] = {
    2026: NSE_HOLIDAYS_2026,
}


class ExchangeCalendarUnavailableError(RuntimeError):
    """Raised when NSE has not published a calendar used by this worker."""


class NseCalendar:
    open_time = time(9, 15)
    close_time = time(15, 30)

    def __init__(
        self,
        holidays_by_year: Mapping[int, set[date] | frozenset[date]] | None = None,
    ):
        calendars = holidays_by_year or NSE_HOLIDAYS_BY_YEAR
        self.holidays_by_year = {
            year: frozenset(holidays) for year, holidays in calendars.items()
        }

    def _holidays_for(self, day: date) -> frozenset[date]:
        try:
            return self.holidays_by_year[day.year]
        except KeyError as exc:
            raise ExchangeCalendarUnavailableError(
                f"Official NSE trading calendar is unavailable for {day.year}; "
                "paper execution is blocked"
            ) from exc

    def is_trading_day(self, day: date) -> bool:
        holidays = self._holidays_for(day)
        return day.weekday() < 5 and day not in holidays

    def is_open(self, instant: datetime) -> bool:
        local = instant.astimezone(IST)
        return self.is_trading_day(local.date()) and self.open_time <= local.time() < self.close_time

    def session_bounds(self, instant: datetime) -> tuple[datetime, datetime]:
        local = instant.astimezone(IST)
        self._holidays_for(local.date())
        return (
            datetime.combine(local.date(), self.open_time, IST),
            datetime.combine(local.date(), self.close_time, IST),
        )
