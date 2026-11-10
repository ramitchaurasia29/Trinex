import pytest

from app.schemas.tool_config import complete_config_errors, execution_config_errors, validate_tool_config


VALID = {
    "timed-exit": {"instrument":"fo","time":"15:10","exitType":"partial","partialType":"lots","lots":"1","qty":"","pct":""},
    "trailing-sl": {"instrument":"fo","move":"20","moveUnit":"pts","sl":"10","slUnit":"pts"},
    "timed-entry": {"instrument":"fo","side":"BUY","ladder":True,"time":"09:35","qty":"","entries":[{"time":"09:35","qty":"1"},{"time":"10:00","qty":"1"}]},
    "no-motion": {"instrument":"options","exitType":"window","start":"09:30","end":"10:00","movementType":"pts","movement":"5","high":"","low":"","reference":"entry"},
    "range-break": {"instrument":"fo","rangeLevel":"high","price":"250","direction":"above","trigger":"touch","exitType":"full","partialType":"lots","lots":"","qty":"","pct":""},
    "partial-profit": {"instrument":"options","targetCount":2,"targets":[{"level":"220","type":"lots","value":"1"},{"level":"240","type":"lots","value":"1"}]},
    "mtm-lock": {"positionType":"basket","selectedPositionIds":["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000002"],"basket":"2-position basket","activation":"5000","progressive":True,"protected":"","levels":[{"target":"6000","lock":"3500"},{"target":"8000","lock":"5000"}]},
    "dependency": {"referenceSymbol":"NIFTY 24500 CE","level":"250","direction":"above","action":"entry","entrySymbol":"NIFTY 24500 CE","entryQuantity":"75","exitPositionId":"","exitQuantity":"full","quantityType":"qty","exitValue":""},
}


@pytest.mark.parametrize("tool_type", VALID)
def test_all_eight_tool_schemas(tool_type: str) -> None:
    normalized = validate_tool_config(tool_type, VALID[tool_type])
    assert normalized == VALID[tool_type]
    assert complete_config_errors(tool_type, normalized) == {}


def test_strict_shape_and_semantic_errors() -> None:
    with pytest.raises(Exception):
        validate_tool_config("timed-exit", {**VALID["timed-exit"], "unknown": True})
    invalid = {**VALID["timed-entry"], "entries": [{"time":"10:00","qty":"1"},{"time":"09:35","qty":"0"}]}
    errors = complete_config_errors("timed-entry", invalid)
    assert "entries.1.time" in errors and "entries.1.qty" in errors
    invalid_profit = {**VALID["partial-profit"], "targetCount": 3}
    assert "targets" in complete_config_errors("partial-profit", invalid_profit)


def test_execution_v2_requirements_and_v1_compatibility() -> None:
    assert "initialRisk" in execution_config_errors("trailing-sl", VALID["trailing-sl"])
    trailing = {**VALID["trailing-sl"], "initialRisk":"30", "initialRiskUnit":"pts"}
    assert execution_config_errors("trailing-sl", trailing) == {}
    policy = {"product":"NRML","orderType":"MARKET","validity":"DAY","limitPrice":None,"slippageBps":"5"}
    entry = {**VALID["timed-entry"], "orderPolicy":policy}
    assert execution_config_errors("timed-entry", entry) == {}
    close = {**VALID["range-break"], "trigger":"close", "candleInterval":"5m"}
    assert execution_config_errors("range-break", close) == {}
    dependency = {**VALID["dependency"], "entrySide":"BUY", "orderPolicy":policy}
    assert execution_config_errors("dependency", dependency) == {}


@pytest.mark.parametrize(("tool_type", "patch", "field"), [
    ("timed-exit", {"time":"20:00"}, "time"),
    ("trailing-sl", {"move":"0"}, "move"),
    ("timed-entry", {"ladder":False,"qty":"0"}, "qty"),
    ("no-motion", {"start":"10:00","end":"09:30"}, "end"),
    ("range-break", {"price":"0"}, "price"),
    ("partial-profit", {"targetCount":3}, "targets"),
    ("mtm-lock", {"selectedPositionIds":["00000000-0000-0000-0000-000000000001"]}, "selectedPositionIds"),
    ("dependency", {"level":"0"}, "level"),
])
def test_each_tool_rejects_invalid_semantics(tool_type: str, patch: dict, field: str) -> None:
    assert field in complete_config_errors(tool_type, {**VALID[tool_type], **patch})
