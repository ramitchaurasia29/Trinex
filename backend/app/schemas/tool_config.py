from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class ToolConfigModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class ExitQuantityConfig(ToolConfigModel):
    exit_type: Literal["full", "partial"] = Field(alias="exitType")
    partial_type: Literal["lots", "qty", "pct"] = Field(alias="partialType")
    lots: str
    qty: str
    pct: str


class TimedExitConfig(ExitQuantityConfig):
    instrument: Literal["fo", "stock"]
    time: str


class TrailingStopLossConfig(ToolConfigModel):
    instrument: Literal["fo", "stock"]
    move: str
    move_unit: Literal["pts", "pct"] = Field(alias="moveUnit")
    sl: str
    sl_unit: Literal["pts", "pct"] = Field(alias="slUnit")
    initial_risk: str | None = Field(default=None, alias="initialRisk")
    initial_risk_unit: Literal["pts", "pct"] | None = Field(
        default=None, alias="initialRiskUnit"
    )


class OrderPolicy(ToolConfigModel):
    product: Literal["MIS", "NRML", "CNC"]
    order_type: Literal["MARKET", "LIMIT"] = Field(alias="orderType")
    validity: Literal["DAY", "IOC"]
    limit_price: str | None = Field(default=None, alias="limitPrice")
    slippage_bps: str = Field(alias="slippageBps")

    @model_validator(mode="after")
    def validate_price(self) -> "OrderPolicy":
        if self.order_type == "LIMIT" and not self.limit_price:
            raise ValueError("LIMIT orders require limitPrice")
        if self.order_type == "MARKET" and self.limit_price not in (None, ""):
            raise ValueError("MARKET orders cannot include limitPrice")
        return self


class TimedEntryRow(ToolConfigModel):
    time: str
    qty: str


class TimedEntryConfig(ToolConfigModel):
    instrument: Literal["fo", "stock"]
    side: Literal["BUY", "SELL"]
    ladder: bool
    time: str
    qty: str
    entries: list[TimedEntryRow]
    order_policy: OrderPolicy | None = Field(default=None, alias="orderPolicy")


class NoMotionConfig(ToolConfigModel):
    instrument: Literal["stock", "options"]
    exit_type: Literal["window", "highlow"] = Field(alias="exitType")
    start: str
    end: str
    movement_type: Literal["pts", "pct"] = Field(alias="movementType")
    movement: str
    high: str
    low: str
    reference: Literal["entry", "ltp"]


class RangeBreakConfig(ExitQuantityConfig):
    instrument: Literal["fo", "stock"]
    range_level: Literal["high", "low"] = Field(alias="rangeLevel")
    price: str
    direction: Literal["above", "below", "either"]
    trigger: Literal["touch", "cross", "close"]
    candle_interval: Literal["1m", "3m", "5m", "15m"] | None = Field(
        default=None, alias="candleInterval"
    )


class ProfitTarget(ToolConfigModel):
    level: str
    type: Literal["lots", "qty", "pct"]
    value: str


class PartialProfitConfig(ToolConfigModel):
    instrument: Literal["stock", "options"]
    target_count: int = Field(alias="targetCount", ge=1, le=5)
    targets: list[ProfitTarget]


class MtmLockLevel(ToolConfigModel):
    target: str
    lock: str


class MtmLockConfig(ToolConfigModel):
    position_type: Literal["single", "basket"] = Field(alias="positionType")
    selected_position_ids: list[str] = Field(alias="selectedPositionIds")
    basket: str
    activation: str
    progressive: bool
    protected: str
    levels: list[MtmLockLevel]


class DependencyConfig(ToolConfigModel):
    reference_symbol: str = Field(alias="referenceSymbol")
    level: str
    direction: Literal["above", "below"]
    action: Literal["entry", "exit"]
    entry_symbol: str = Field(alias="entrySymbol")
    entry_quantity: str = Field(alias="entryQuantity")
    entry_side: Literal["BUY", "SELL"] | None = Field(default=None, alias="entrySide")
    exit_position_id: str = Field(alias="exitPositionId")
    exit_quantity: Literal["full", "partial"] = Field(alias="exitQuantity")
    quantity_type: Literal["qty", "pct"] = Field(alias="quantityType")
    exit_value: str = Field(alias="exitValue")
    order_policy: OrderPolicy | None = Field(default=None, alias="orderPolicy")


TOOL_CONFIG_VERSION = 2
TOOL_CONFIG_VERSIONS: dict[str, int] = {
    "timed-exit": 1,
    "trailing-sl": 2,
    "timed-entry": 2,
    "no-motion": 1,
    "range-break": 2,
    "partial-profit": 1,
    "mtm-lock": 1,
    "dependency": 2,
}
TOOL_CONFIG_MODELS: dict[str, type[ToolConfigModel]] = {
    "timed-exit": TimedExitConfig, "trailing-sl": TrailingStopLossConfig,
    "timed-entry": TimedEntryConfig, "no-motion": NoMotionConfig,
    "range-break": RangeBreakConfig, "partial-profit": PartialProfitConfig,
    "mtm-lock": MtmLockConfig, "dependency": DependencyConfig,
}


def validate_tool_config(tool_type: str, config: dict[str, Any]) -> dict[str, Any]:
    model_type = TOOL_CONFIG_MODELS.get(tool_type)
    if model_type is None:
        raise ValueError(f"Unsupported tool type: {tool_type}")
    # Keep version-1 JSON byte-for-byte compatible by omitting new optional v2 keys.
    return model_type.model_validate(config).model_dump(by_alias=True, exclude_none=True)


def _number(raw: Any) -> Decimal | None:
    try:
        value = Decimal(str(raw))
        return value if value.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def _minutes(raw: str) -> int | None:
    try:
        hour, minute = (int(part) for part in raw.split(":"))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour * 60 + minute
    except (ValueError, AttributeError):
        pass
    return None


def complete_config_errors(tool_type: str, config: dict[str, Any]) -> dict[str, str]:
    """Validate execution-neutral configuration completeness for Review/Arm."""
    try:
        c = validate_tool_config(tool_type, config)
    except (ValidationError, ValueError) as exc:
        if isinstance(exc, ValidationError):
            return {".".join(str(x) for x in item["loc"]): item["msg"] for item in exc.errors()}
        return {"toolType": str(exc)}
    errors: dict[str, str] = {}

    def positive(key: str, raw: Any, *, integer: bool = False, maximum: Decimal | None = None) -> Decimal | None:
        value = _number(raw)
        if value is None or value <= 0 or (integer and value != value.to_integral_value()):
            errors[key] = "Enter a positive whole number" if integer else "Enter a value above 0"
        elif maximum is not None and value > maximum:
            errors[key] = f"Value cannot exceed {maximum}"
        return value

    def market_time(key: str, raw: str) -> int | None:
        value = _minutes(raw)
        if value is None or value < 555 or value > 929:
            errors[key] = "Choose a time between 09:15 and 15:29"
        return value

    if tool_type == "timed-exit":
        market_time("time", c["time"])
    elif tool_type == "trailing-sl":
        positive("move", c["move"], maximum=Decimal("100") if c["moveUnit"] == "pct" else None)
        positive("sl", c["sl"], maximum=Decimal("100") if c["slUnit"] == "pct" else None)
        if c.get("initialRisk") is not None and c.get("initialRiskUnit") is not None:
            positive("initialRisk", c["initialRisk"], maximum=Decimal("100") if c["initialRiskUnit"] == "pct" else None)
    elif tool_type == "timed-entry":
        if c.get("orderPolicy"):
            _order_policy_errors(c.get("orderPolicy"), c["instrument"], errors)
        if c["ladder"]:
            if not c["entries"]:
                errors["entries"] = "Add at least one ladder entry"
            previous = -1
            for index, row in enumerate(c["entries"]):
                current = market_time(f"entries.{index}.time", row["time"])
                positive(f"entries.{index}.qty", row["qty"], integer=True)
                if current is not None and current <= previous:
                    errors[f"entries.{index}.time"] = "Each ladder time must be later than the previous one"
                if current is not None:
                    previous = current
        else:
            market_time("time", c["time"]); positive("qty", c["qty"], integer=True)
    elif tool_type == "no-motion":
        start, end = market_time("start", c["start"]), market_time("end", c["end"])
        if start is not None and end is not None and end <= start:
            errors["end"] = "End time must be later than start time"
        if c["exitType"] == "window":
            positive("movement", c["movement"], maximum=Decimal("100") if c["movementType"] == "pct" else None)
        else:
            high, low = positive("high", c["high"]), positive("low", c["low"])
            if high is not None and low is not None and high <= low:
                errors["high"] = "High value must be greater than low value"
    elif tool_type == "range-break":
        positive("price", c["price"])
    elif tool_type == "partial-profit":
        if len(c["targets"]) != c["targetCount"]:
            errors["targets"] = "Target rows must match targetCount"
        previous: Decimal | None = None
        for index, row in enumerate(c["targets"]):
            level = positive(f"targets.{index}.level", row["level"])
            positive(f"targets.{index}.value", row["value"], integer=row["type"] != "pct", maximum=Decimal("100") if row["type"] == "pct" else None)
            if previous is not None and level is not None and level == previous:
                errors[f"targets.{index}.level"] = "Target levels must be distinct"
            if level is not None: previous = level
    elif tool_type == "mtm-lock":
        activation = positive("activation", c["activation"])
        if c["positionType"] == "single" and len(c["selectedPositionIds"]) != 1:
            errors["selectedPositionIds"] = "Select exactly one position"
        if c["positionType"] == "basket" and len(c["selectedPositionIds"]) < 2:
            errors["selectedPositionIds"] = "Select at least two basket positions"
        if c["progressive"]:
            previous_target = activation or Decimal("0"); previous_lock = Decimal("-Infinity")
            for index, row in enumerate(c["levels"]):
                target, lock = positive(f"levels.{index}.target", row["target"]), _number(row["lock"])
                if lock is None or lock < 0: errors[f"levels.{index}.lock"] = "Enter a non-negative lock value"
                if target is not None and target <= previous_target: errors[f"levels.{index}.target"] = "Target must exceed the previous level"
                if target is not None and lock is not None and lock >= target: errors[f"levels.{index}.lock"] = "Lock must be below its target"
                if lock is not None and lock < previous_lock: errors[f"levels.{index}.lock"] = "Lock must not decrease"
                if target is not None: previous_target = target
                if lock is not None: previous_lock = lock
        else:
            protected = _number(c["protected"])
            if protected is None or protected < 0: errors["protected"] = "Enter a non-negative protected MTM"
            elif activation is not None and protected >= activation: errors["protected"] = "Protected MTM must be below activation"
    elif tool_type == "dependency":
        positive("level", c["level"])
        if not c["referenceSymbol"]: errors["referenceSymbol"] = "Choose a reference instrument"
        if c["action"] == "entry":
            if not c["entrySymbol"]: errors["entrySymbol"] = "Choose an entry instrument"
            positive("entryQuantity", c["entryQuantity"], integer=True)
            entry_instrument = "fo" if any(token in c["entrySymbol"].upper() for token in ("CE", "PE", "FUT")) else "stock"
            if c.get("orderPolicy"):
                _order_policy_errors(c.get("orderPolicy"), entry_instrument, errors)
        else:
            if not c["exitPositionId"]: errors["exitPositionId"] = "Choose an open position"
            if c["exitQuantity"] == "partial": positive("exitValue", c["exitValue"], maximum=Decimal("100") if c["quantityType"] == "pct" else None)

    if tool_type in {"timed-exit", "range-break"} and c["exitType"] == "partial":
        field = {"lots": "lots", "qty": "qty", "pct": "pct"}[c["partialType"]]
        positive(field, c[field], integer=field in {"lots", "qty"}, maximum=Decimal("100") if field == "pct" else None)
    return errors


def execution_config_errors(tool_type: str, config: dict[str, Any]) -> dict[str, str]:
    """Execution-only v2 requirements; v1 drafts remain readable."""
    errors = complete_config_errors(tool_type, config)
    if errors:
        return errors
    c = validate_tool_config(tool_type, config)
    if tool_type == "trailing-sl" and (not c.get("initialRisk") or not c.get("initialRiskUnit")):
        errors["initialRisk"] = "Set the initial stop-loss risk"
    if tool_type == "timed-entry":
        _order_policy_errors(c.get("orderPolicy"), c["instrument"], errors)
    if tool_type == "range-break" and c["trigger"] == "close" and not c.get("candleInterval"):
        errors["candleInterval"] = "Choose a candle interval"
    if tool_type == "dependency" and c["action"] == "entry":
        if not c.get("entrySide"):
            errors["entrySide"] = "Choose Buy or Sell for the dependency entry"
        entry_instrument = "fo" if any(token in c["entrySymbol"].upper() for token in ("CE", "PE", "FUT")) else "stock"
        _order_policy_errors(c.get("orderPolicy"), entry_instrument, errors)
    return errors


def config_version_for(tool_type: str, config: dict[str, Any]) -> int:
    v2 = (
        tool_type == "trailing-sl" and "initialRisk" in config
        or tool_type == "timed-entry" and "orderPolicy" in config
        or tool_type == "range-break" and "candleInterval" in config
        or tool_type == "dependency" and "orderPolicy" in config and "entrySide" in config
    )
    return TOOL_CONFIG_VERSIONS[tool_type] if v2 else 1


def _order_policy_errors(policy: dict[str, Any] | None, instrument: str, errors: dict[str, str]) -> None:
    if not policy:
        errors["orderPolicy"] = "Choose an execution policy"
        return
    product = policy.get("product")
    if instrument == "stock" and product not in {"MIS", "CNC"}:
        errors["orderPolicy.product"] = "Stocks support MIS or CNC"
    if instrument in {"fo", "options"} and product not in {"MIS", "NRML"}:
        errors["orderPolicy.product"] = "Derivatives support MIS or NRML"
    slippage = _number(policy.get("slippageBps"))
    if slippage is None or slippage < 0 or slippage > 100:
        errors["orderPolicy.slippageBps"] = "Slippage must be between 0 and 100 bps"
    if policy.get("orderType") == "LIMIT":
        limit_price = _number(policy.get("limitPrice"))
        if limit_price is None or limit_price <= 0:
            errors["orderPolicy.limitPrice"] = "Enter a limit price above 0"
