from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ToolDraftCreate(ApiModel):
    id: UUID
    tool_type: Literal["timed-exit", "trailing-sl", "timed-entry", "no-motion", "range-break", "partial-profit", "mtm-lock", "dependency"]
    config: dict[str, Any]
    position_ids: list[UUID] = Field(default_factory=list)
    broker_account_id: UUID | None = None
    instrument_id: UUID | None = None


class ToolUpdate(ApiModel):
    expected_version: str
    config: dict[str, Any]
    position_ids: list[UUID] = Field(default_factory=list)
    broker_account_id: UUID | None = None
    instrument_id: UUID | None = None


class ToolMutation(ApiModel):
    expected_version: str


class ToolPositionResponse(BaseModel):
    id: UUID
    symbol: str
    broker_account_id: UUID
    quantity: str
    available_quantity: str
    role: str


class ToolEventResponse(BaseModel):
    id: UUID
    sequence: int
    event_type: str
    message: str
    occurred_at: datetime
    details: dict[str, Any]


class ToolResponse(BaseModel):
    id: UUID
    tool_type: str
    status: str
    execution_mode: Literal["paper"]
    config: dict[str, Any]
    config_version: int
    version: str
    summary: str
    target_label: str
    broker_account_id: UUID | None
    instrument_id: UUID | None
    positions: list[ToolPositionResponse]
    validation_errors: dict[str, str] = Field(default_factory=dict)
    execution_ready: bool = False
    execution_blockers: list[str] = Field(default_factory=list)
    execution_state: dict[str, Any] | None = None
    latest_evaluation_at: datetime | None = None
    latest_market_data_at: datetime | None = None
    execution_failure_reason: str | None = None
    simulated_order_count: int = 0
    armed_at: datetime | None
    paused_at: datetime | None
    created_at: datetime
    updated_at: datetime
    events: list[ToolEventResponse] = Field(default_factory=list)


class ToolListResponse(BaseModel):
    items: list[ToolResponse]


class ToolReviewResponse(BaseModel):
    valid: bool
    validation_errors: dict[str, str]
    tool: ToolResponse


class ToolDefaultItem(ApiModel):
    tool_type: str
    config: dict[str, Any]
    is_enabled: bool = True
    expected_version: str | None = None


class ToolDefaultsUpdate(ApiModel):
    defaults: list[ToolDefaultItem]


class ToolDefaultResponse(BaseModel):
    tool_type: str
    config: dict[str, Any]
    is_enabled: bool
    version: str


class InstrumentResponse(BaseModel):
    id: UUID
    exchange: str
    trading_symbol: str
    display_symbol: str
    kind: str
    lot_size: str
    expiry_date: str | None
    metadata: dict[str, Any]


class ActivityEventResponse(BaseModel):
    id: UUID
    event_type: str
    summary: str
    tool_instance_id: UUID | None
    position_id: UUID | None
    occurred_at: datetime
    metadata: dict[str, Any]


class ActivityListResponse(BaseModel):
    items: list[ActivityEventResponse]
    next_cursor: str | None = None
