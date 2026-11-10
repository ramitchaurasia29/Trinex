from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


MONEY = Decimal("0.0001")


@dataclass(frozen=True)
class CostBreakdown:
    turnover: Decimal
    brokerage: Decimal
    stt: Decimal
    exchange_charge: Decimal
    sebi_charge: Decimal
    gst: Decimal
    stamp_duty: Decimal
    total: Decimal
    version: str = "india-nse-2026-04-01"


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def calculate_costs(*, price: Decimal, quantity: Decimal, side: str, kind: str, product: str) -> CostBreakdown:
    """Effective-dated NSE paper model. Options turnover is premium turnover."""
    turnover = _money(price * quantity)
    delivery = kind == "stock" and product == "CNC"
    brokerage = Decimal("0") if delivery else min(Decimal("20"), turnover * Decimal("0.0003"))
    exchange_rate = {
        "stock": Decimal("0.000030699"),
        "future": Decimal("0.000018299"),
        "option": Decimal("0.0003552"),
    }[kind]
    exchange = turnover * exchange_rate
    sebi = turnover * Decimal("0.000001")
    if kind == "option":
        stt = turnover * Decimal("0.0015") if side == "SELL" else Decimal("0")
        stamp = turnover * Decimal("0.00003") if side == "BUY" else Decimal("0")
    elif kind == "future":
        stt = turnover * Decimal("0.0005") if side == "SELL" else Decimal("0")
        stamp = turnover * Decimal("0.00002") if side == "BUY" else Decimal("0")
    else:
        stt_rate = Decimal("0.001") if delivery else Decimal("0.00025")
        stt = turnover * stt_rate if side == "SELL" or delivery else Decimal("0")
        stamp_rate = Decimal("0.00015") if delivery else Decimal("0.00003")
        stamp = turnover * stamp_rate if side == "BUY" else Decimal("0")
    gst = (brokerage + exchange + sebi) * Decimal("0.18")
    values = [_money(item) for item in (brokerage, stt, exchange, sebi, gst, stamp)]
    return CostBreakdown(turnover, *values, _money(sum(values)), "india-nse-2026-04-01")
