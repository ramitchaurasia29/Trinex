from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, UserOwnedMixin


TOOL_TYPES = (
    "timed-exit",
    "trailing-sl",
    "timed-entry",
    "no-motion",
    "range-break",
    "partial-profit",
    "mtm-lock",
    "dependency",
)
TOOL_TYPE_SQL = ", ".join(f"'{value}'" for value in TOOL_TYPES)

MONEY = Numeric(20, 4)
PRECISE_NUMBER = Numeric(20, 8)
JSON_OBJECT_DEFAULT = text("'{}'::jsonb")


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'disabled', 'deleted')",
            name="status_values",
        ),
        Index("ix_users_status", "status"),
    )

    phone_e164: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    email_normalized: Mapped[str | None] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(2048))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'active'")
    )
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        CheckConstraint("expires_at > created_at", name="expiry_after_creation"),
        Index("ix_auth_sessions_user_expires", "user_id", "expires_at"),
    )

    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    device_id: Mapped[str | None] = mapped_column(String(128))
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)


class BrokerAccount(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "broker_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_broker_accounts_user_id_id"),
        UniqueConstraint(
            "user_id",
            "provider",
            "external_account_id",
            name="uq_broker_accounts_user_provider_external",
        ),
        CheckConstraint(
            "status IN ('connected', 'syncing', 'error', 'expired', 'disconnected')",
            name="status_values",
        ),
        Index("ix_broker_accounts_user_status", "user_id", "status"),
    )

    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    external_account_id: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'disconnected'")
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    session_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    account_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )


class Instrument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "instruments"
    __table_args__ = (
        UniqueConstraint(
            "exchange", "trading_symbol", name="uq_instruments_exchange_symbol"
        ),
        CheckConstraint(
            "kind IN ('stock', 'future', 'option')",
            name="kind_values",
        ),
        CheckConstraint(
            "option_type IS NULL OR option_type IN ('CE', 'PE')",
            name="option_type_values",
        ),
        CheckConstraint("lot_size > 0", name="lot_size_positive"),
        CheckConstraint("tick_size > 0", name="tick_size_positive"),
        Index("ix_instruments_symbol", "display_symbol"),
        Index("ix_instruments_expiry", "expiry_date"),
    )

    exchange: Mapped[str] = mapped_column(String(20), nullable=False)
    trading_symbol: Mapped[str] = mapped_column(String(120), nullable=False)
    display_symbol: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    underlying_symbol: Mapped[str | None] = mapped_column(String(120))
    expiry_date: Mapped[date | None] = mapped_column(Date)
    strike_price: Mapped[Decimal | None] = mapped_column(PRECISE_NUMBER)
    option_type: Mapped[str | None] = mapped_column(String(2))
    lot_size: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    tick_size: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'INR'")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    instrument_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )


class Position(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "positions"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_positions_user_id_id"),
        UniqueConstraint(
            "user_id",
            "broker_account_id",
            "broker_position_key",
            name="uq_positions_user_broker_key",
        ),
        ForeignKeyConstraint(
            ["user_id", "broker_account_id"],
            ["broker_accounts.user_id", "broker_accounts.id"],
            name="fk_positions_user_broker_account",
            ondelete="RESTRICT",
        ),
        CheckConstraint("side IN ('BUY', 'SELL')", name="side_values"),
        CheckConstraint("product IN ('MIS', 'NRML', 'CNC')", name="product_values"),
        CheckConstraint("status IN ('open', 'closed')", name="status_values"),
        CheckConstraint("quantity >= 0", name="quantity_nonnegative"),
        Index(
            "ix_positions_user_open",
            "user_id",
            "updated_at",
            postgresql_where=text("status = 'open'"),
        ),
        Index("ix_positions_broker_account", "broker_account_id"),
        Index("ix_positions_instrument", "instrument_id"),
    )

    broker_account_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    instrument_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("instruments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    broker_position_key: Mapped[str] = mapped_column(String(160), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    product: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default=text("'open'")
    )
    quantity: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    available_quantity: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    average_price: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, server_default=text("0")
    )
    unrealized_pnl: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, server_default=text("0")
    )
    margin_used: Mapped[Decimal] = mapped_column(
        MONEY, nullable=False, server_default=text("0")
    )
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PositionSnapshot(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "position_snapshots"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "position_id"],
            ["positions.user_id", "positions.id"],
            name="fk_position_snapshots_user_position",
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "position_id", "captured_at", name="uq_position_snapshots_position_captured"
        ),
        CheckConstraint("quantity >= 0", name="quantity_nonnegative"),
        Index("ix_position_snapshots_user_captured", "user_id", "captured_at"),
    )

    position_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    average_price: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    last_traded_price: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    previous_close: Mapped[Decimal | None] = mapped_column(PRECISE_NUMBER)
    day_open: Mapped[Decimal | None] = mapped_column(PRECISE_NUMBER)
    day_low: Mapped[Decimal | None] = mapped_column(PRECISE_NUMBER)
    day_high: Mapped[Decimal | None] = mapped_column(PRECISE_NUMBER)
    realized_pnl: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    margin_used: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    greeks: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ToolInstance(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "tool_instances"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_tool_instances_user_id_id"),
        ForeignKeyConstraint(
            ["user_id", "broker_account_id"],
            ["broker_accounts.user_id", "broker_accounts.id"],
            name="fk_tool_instances_user_broker_account",
            ondelete="RESTRICT",
        ),
        CheckConstraint(f"tool_type IN ({TOOL_TYPE_SQL})", name="tool_type_values"),
        CheckConstraint(
            "status IN ('draft', 'waiting', 'active', 'imminent', 'paused', "
            "'queued', 'completed', 'cancelled', 'failed')",
            name="status_values",
        ),
        CheckConstraint("execution_mode = 'paper'", name="paper_only"),
        CheckConstraint("config_version > 0", name="config_version_positive"),
        Index(
            "ix_tool_instances_user_active",
            "user_id",
            "updated_at",
            postgresql_where=text(
                "status IN ('waiting', 'active', 'imminent', 'paused', 'queued')"
            ),
        ),
        Index("ix_tool_instances_config_gin", "config", postgresql_using="gin"),
    )

    tool_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'draft'")
    )
    execution_mode: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'paper'")
    )
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    config_version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    target_label: Mapped[str] = mapped_column(String(255), nullable=False)
    trading_timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default=text("'Asia/Kolkata'")
    )
    broker_account_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    instrument_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("instruments.id", ondelete="RESTRICT")
    )
    armed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ToolInstancePosition(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "tool_instance_positions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "tool_instance_id"],
            ["tool_instances.user_id", "tool_instances.id"],
            name="fk_tool_instance_positions_user_tool",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "position_id"],
            ["positions.user_id", "positions.id"],
            name="fk_tool_instance_positions_user_position",
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "tool_instance_id",
            "position_id",
            "role",
            name="uq_tool_instance_positions_tool_position_role",
        ),
        CheckConstraint(
            "role IN ('target', 'trigger', 'basket_member')",
            name="role_values",
        ),
        Index("ix_tool_instance_positions_position", "position_id"),
    )

    tool_instance_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    position_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False)


class Order(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_orders_user_id_id"),
        UniqueConstraint("user_id", "idempotency_key", name="uq_orders_user_idempotency"),
        UniqueConstraint(
            "user_id",
            "broker_account_id",
            "broker_order_id",
            name="uq_orders_user_broker_order",
        ),
        ForeignKeyConstraint(
            ["user_id", "broker_account_id"],
            ["broker_accounts.user_id", "broker_accounts.id"],
            name="fk_orders_user_broker_account",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "tool_instance_id"],
            ["tool_instances.user_id", "tool_instances.id"],
            name="fk_orders_user_tool_instance",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "position_id"],
            ["positions.user_id", "positions.id"],
            name="fk_orders_user_position",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "execution_action_id"],
            ["execution_actions.user_id", "execution_actions.id"],
            name="fk_orders_user_execution_action",
            ondelete="RESTRICT",
        ),
        CheckConstraint("execution_mode = 'paper'", name="paper_only"),
        CheckConstraint("side IN ('BUY', 'SELL')", name="side_values"),
        CheckConstraint("product IN ('MIS', 'NRML', 'CNC')", name="product_values"),
        CheckConstraint(
            "order_type IN ('MARKET', 'LIMIT', 'SL', 'SL-M')",
            name="order_type_values",
        ),
        CheckConstraint(
            "status IN ('created', 'queued', 'submitted', 'open', 'partially_filled', "
            "'filled', 'cancelled', 'rejected', 'failed')",
            name="status_values",
        ),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("filled_quantity >= 0", name="filled_quantity_nonnegative"),
        CheckConstraint("filled_quantity <= quantity", name="filled_quantity_lte_quantity"),
        CheckConstraint("validity IN ('DAY', 'IOC')", name="validity_values"),
        CheckConstraint("attempt_number > 0", name="attempt_number_positive"),
        Index("ix_orders_user_status", "user_id", "status", "created_at"),
        Index("ix_orders_broker_account", "broker_account_id"),
        Index("ix_orders_instrument", "instrument_id"),
    )

    broker_account_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    instrument_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("instruments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    tool_instance_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    position_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    execution_action_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    parent_order_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT")
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    broker_order_id: Mapped[str | None] = mapped_column(String(160))
    execution_mode: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'paper'")
    )
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    order_type: Mapped[str] = mapped_column(String(12), nullable=False)
    product: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, server_default=text("'created'")
    )
    quantity: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    filled_quantity: Mapped[Decimal] = mapped_column(
        PRECISE_NUMBER, nullable=False, server_default=text("0")
    )
    limit_price: Mapped[Decimal | None] = mapped_column(PRECISE_NUMBER)
    trigger_price: Mapped[Decimal | None] = mapped_column(PRECISE_NUMBER)
    average_fill_price: Mapped[Decimal | None] = mapped_column(PRECISE_NUMBER)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    attempt_number: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    validity: Mapped[str] = mapped_column(
        String(8), nullable=False, server_default=text("'IOC'")
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ToolExecutionState(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "tool_execution_states"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_tool_execution_states_user_id_id"),
        UniqueConstraint("tool_instance_id", name="uq_tool_execution_states_tool"),
        ForeignKeyConstraint(
            ["user_id", "tool_instance_id"],
            ["tool_instances.user_id", "tool_instances.id"],
            name="fk_tool_execution_states_user_tool",
            ondelete="RESTRICT",
        ),
        CheckConstraint("handler_version > 0", name="handler_version_positive"),
        CheckConstraint("fencing_token >= 0", name="fencing_token_nonnegative"),
        CheckConstraint("error_count >= 0", name="error_count_nonnegative"),
        CheckConstraint(
            "data_state IN ('initializing', 'fresh', 'suspended', 'stale', 'closed')",
            name="data_state_values",
        ),
        Index("ix_tool_execution_states_due", "next_evaluation_at"),
        Index("ix_tool_execution_states_lease", "lease_expires_at"),
    )

    tool_instance_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    handler_version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    checkpoint: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
    config_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    data_state: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'initializing'")
    )
    next_evaluation_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_quote_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_owner: Mapped[str | None] = mapped_column(String(128))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fencing_token: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    error_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    last_error_code: Mapped[str | None] = mapped_column(String(80))


class ExecutionAction(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "execution_actions"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_execution_actions_user_id_id"),
        UniqueConstraint(
            "tool_instance_id", "action_key", name="uq_execution_actions_tool_key"
        ),
        ForeignKeyConstraint(
            ["user_id", "tool_instance_id"],
            ["tool_instances.user_id", "tool_instances.id"],
            name="fk_execution_actions_user_tool",
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status IN ('pending', 'ordering', 'completed', 'failed', 'superseded')",
            name="status_values",
        ),
        CheckConstraint("attempt_count >= 0", name="attempt_count_nonnegative"),
        Index("ix_execution_actions_user_status", "user_id", "status", "created_at"),
    )

    tool_instance_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    action_key: Mapped[str] = mapped_column(String(160), nullable=False)
    action_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'")
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OrderFill(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "order_fills"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "order_id"],
            ["orders.user_id", "orders.id"],
            name="fk_order_fills_user_order",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("order_id", "fill_key", name="uq_order_fills_order_key"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("price > 0", name="price_positive"),
        CheckConstraint("total_cost >= 0", name="total_cost_nonnegative"),
        Index("ix_order_fills_user_filled", "user_id", "filled_at"),
    )

    order_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    fill_key: Mapped[str] = mapped_column(String(160), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    price: Mapped[Decimal] = mapped_column(PRECISE_NUMBER, nullable=False)
    turnover: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    slippage: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    brokerage: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    stt: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    exchange_charge: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    sebi_charge: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    gst: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    stamp_duty: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    cost_model_version: Mapped[str] = mapped_column(String(40), nullable=False)
    filled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OrderEvent(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "order_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "order_id"],
            ["orders.user_id", "orders.id"],
            name="fk_order_events_user_order",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("order_id", "sequence", name="uq_order_events_order_sequence"),
        CheckConstraint("sequence > 0", name="sequence_positive"),
        Index("ix_order_events_user_occurred", "user_id", "occurred_at"),
    )

    order_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str | None] = mapped_column(String(24))
    broker_event_id: Mapped[str | None] = mapped_column(String(160))
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ToolEvent(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "tool_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "tool_instance_id"],
            ["tool_instances.user_id", "tool_instances.id"],
            name="fk_tool_events_user_tool",
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "tool_instance_id", "sequence", name="uq_tool_events_tool_sequence"
        ),
        CheckConstraint("sequence > 0", name="sequence_positive"),
        Index("ix_tool_events_user_occurred", "user_id", "occurred_at"),
    )

    tool_instance_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    state_before: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
    state_after: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Alert(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "tool_instance_id"],
            ["tool_instances.user_id", "tool_instances.id"],
            name="fk_alerts_user_tool",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "order_id"],
            ["orders.user_id", "orders.id"],
            name="fk_alerts_user_order",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "position_id"],
            ["positions.user_id", "positions.id"],
            name="fk_alerts_user_position",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("user_id", "dedupe_key", name="uq_alerts_user_dedupe"),
        CheckConstraint(
            "severity IN ('critical', 'warning', 'success', 'info')",
            name="severity_values",
        ),
        CheckConstraint(
            "action IS NULL OR action IN ('view', 'retry', 'reconnect', 'dismiss')",
            name="action_values",
        ),
        Index(
            "ix_alerts_user_unread",
            "user_id",
            "created_at",
            postgresql_where=text("read_at IS NULL AND dismissed_at IS NULL"),
        ),
    )

    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str | None] = mapped_column(String(16))
    dedupe_key: Mapped[str | None] = mapped_column(String(160))
    tool_instance_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    order_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    position_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ActivityEvent(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "activity_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "tool_instance_id"],
            ["tool_instances.user_id", "tool_instances.id"],
            name="fk_activity_events_user_tool",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "order_id"],
            ["orders.user_id", "orders.id"],
            name="fk_activity_events_user_order",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "position_id"],
            ["positions.user_id", "positions.id"],
            name="fk_activity_events_user_position",
            ondelete="RESTRICT",
        ),
        Index("ix_activity_events_user_occurred", "user_id", "occurred_at"),
    )

    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    tool_instance_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    order_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    position_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    impact_amount: Mapped[Decimal | None] = mapped_column(MONEY)
    event_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserToolDefault(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "user_tool_defaults"
    __table_args__ = (
        UniqueConstraint("user_id", "tool_type", name="uq_user_tool_defaults_user_tool"),
        CheckConstraint(f"tool_type IN ({TOOL_TYPE_SQL})", name="tool_type_values"),
        CheckConstraint("config_version > 0", name="config_version_positive"),
        Index("ix_user_tool_defaults_config_gin", "config", postgresql_using="gin"),
    )

    tool_type: Mapped[str] = mapped_column(String(40), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    config_version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )


class UserPreferences(UUIDPrimaryKeyMixin, UserOwnedMixin, TimestampMixin, Base):
    __tablename__ = "user_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_preferences_user"),
        CheckConstraint("theme IN ('light', 'system')", name="theme_values"),
        CheckConstraint("font_size IN ('default', 'large')", name="font_size_values"),
        CheckConstraint(
            "pnl_display IN ('amount', 'percentage', 'both')",
            name="pnl_display_values",
        ),
        CheckConstraint("default_trading_mode = 'paper'", name="paper_only"),
    )

    trading_timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default=text("'Asia/Kolkata'")
    )
    theme: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default=text("'light'")
    )
    font_size: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default=text("'default'")
    )
    pnl_display: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'both'")
    )
    default_trading_mode: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'paper'")
    )
    notification_preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=JSON_OBJECT_DEFAULT
    )
