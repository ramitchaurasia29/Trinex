from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BrokerProviderResponse(BaseModel):
    id: str
    name: str
    short: str
    monogram: str
    connection_available: bool
    data_mode: Literal["SIMULATED", "UNAVAILABLE"]


class ConnectBrokerRequest(StrictModel):
    provider: str
    client_request_id: UUID
    display_name: str | None = Field(default=None, min_length=1, max_length=120)


class BrokerAccountResponse(BaseModel):
    id: UUID
    provider: str
    display_name: str
    status: str
    last_synced_at: datetime | None
    position_count: int
    account_metadata: dict[str, object]
    data_mode: Literal["SIMULATED"] = "SIMULATED"


class SyncResultResponse(BaseModel):
    broker_account_id: UUID
    status: Literal["completed"] = "completed"
    open_positions: int
    closed_positions: int
    snapshots_created: int
    synced_at: datetime
    data_mode: Literal["SIMULATED"] = "SIMULATED"


class SyncAllResponse(BaseModel):
    results: list[SyncResultResponse]


class DisconnectResponse(BaseModel):
    broker_account_id: UUID
    status: Literal["disconnected"] = "disconnected"
    retained_positions: int
    paused_tools: int


class PositionResponse(BaseModel):
    id: UUID
    broker_account_id: UUID
    broker_provider: str
    broker_display_name: str
    broker_status: str
    data_mode: Literal["SIMULATED"] = "SIMULATED"
    symbol: str
    trading_symbol: str
    exchange: str
    kind: str
    side: str
    product: str
    status: str
    quantity: Decimal
    net_quantity: Decimal
    available_quantity: Decimal
    lot_size: Decimal
    average_entry_price: Decimal
    ltp: Decimal
    previous_close: Decimal | None
    day_open: Decimal | None
    day_low: Decimal | None
    day_high: Decimal | None
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    mtm: Decimal
    gross_exposure: Decimal
    pnl_percentage: Decimal
    margin_used: Decimal
    margin_available: Decimal
    expiry_date: date | None
    greeks: dict[str, object]
    opened_at: datetime
    closed_at: datetime | None
    last_synced_at: datetime | None
    stale: bool
    exit_method: str | None = None


class PositionSummaryResponse(BaseModel):
    position_count: int
    gross_exposure: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    mtm: Decimal
    profitable_count: int
    losing_count: int


class PositionListResponse(BaseModel):
    items: list[PositionResponse]
    summary: PositionSummaryResponse
    last_synced_at: datetime | None


class PositionActivityResponse(BaseModel):
    id: UUID
    event_type: str
    summary: str
    impact_amount: Decimal | None
    occurred_at: datetime
    metadata: dict[str, object]


class PositionDetailResponse(BaseModel):
    position: PositionResponse
    activity: list[PositionActivityResponse]
