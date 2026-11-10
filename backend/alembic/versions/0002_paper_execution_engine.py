"""Paper execution engine persistence.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tool_execution_states",
        sa.Column("tool_instance_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("handler_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("checkpoint", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("config_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("data_state", sa.String(length=16), server_default=sa.text("'initializing'"), nullable=False),
        sa.Column("next_evaluation_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_quote_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_owner", sa.String(length=128), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fencing_token", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("error_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_error_code", sa.String(length=80), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("data_state IN ('initializing', 'fresh', 'suspended', 'stale', 'closed')", name=op.f("ck_tool_execution_states_data_state_values")),
        sa.CheckConstraint("error_count >= 0", name=op.f("ck_tool_execution_states_error_count_nonnegative")),
        sa.CheckConstraint("fencing_token >= 0", name=op.f("ck_tool_execution_states_fencing_token_nonnegative")),
        sa.CheckConstraint("handler_version > 0", name=op.f("ck_tool_execution_states_handler_version_positive")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_tool_execution_states_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id", "tool_instance_id"], ["tool_instances.user_id", "tool_instances.id"], name="fk_tool_execution_states_user_tool", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tool_execution_states")),
        sa.UniqueConstraint("tool_instance_id", name="uq_tool_execution_states_tool"),
        sa.UniqueConstraint("user_id", "id", name="uq_tool_execution_states_user_id_id"),
    )
    op.create_index("ix_tool_execution_states_due", "tool_execution_states", ["next_evaluation_at"])
    op.create_index("ix_tool_execution_states_lease", "tool_execution_states", ["lease_expires_at"])
    op.create_index(op.f("ix_tool_execution_states_user_id"), "tool_execution_states", ["user_id"])

    op.create_table(
        "execution_actions",
        sa.Column("tool_instance_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action_key", sa.String(length=160), nullable=False),
        sa.Column("action_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("attempt_count >= 0", name=op.f("ck_execution_actions_attempt_count_nonnegative")),
        sa.CheckConstraint("status IN ('pending', 'ordering', 'completed', 'failed', 'superseded')", name=op.f("ck_execution_actions_status_values")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_execution_actions_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id", "tool_instance_id"], ["tool_instances.user_id", "tool_instances.id"], name="fk_execution_actions_user_tool", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_execution_actions")),
        sa.UniqueConstraint("tool_instance_id", "action_key", name="uq_execution_actions_tool_key"),
        sa.UniqueConstraint("user_id", "id", name="uq_execution_actions_user_id_id"),
    )
    op.create_index("ix_execution_actions_user_status", "execution_actions", ["user_id", "status", "created_at"])
    op.create_index(op.f("ix_execution_actions_user_id"), "execution_actions", ["user_id"])

    op.add_column("orders", sa.Column("execution_action_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("orders", sa.Column("parent_order_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("orders", sa.Column("attempt_number", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.add_column("orders", sa.Column("validity", sa.String(length=8), server_default=sa.text("'IOC'"), nullable=False))
    op.add_column("orders", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("attempt_number_positive", "orders", "attempt_number > 0")
    op.create_check_constraint("filled_quantity_lte_quantity", "orders", "filled_quantity <= quantity")
    op.create_check_constraint("validity_values", "orders", "validity IN ('DAY', 'IOC')")
    op.create_foreign_key("fk_orders_user_execution_action", "orders", "execution_actions", ["user_id", "execution_action_id"], ["user_id", "id"], ondelete="RESTRICT")
    op.create_foreign_key(op.f("fk_orders_parent_order_id_orders"), "orders", "orders", ["parent_order_id"], ["id"], ondelete="RESTRICT")

    op.create_table(
        "order_fills",
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("fill_key", sa.String(length=160), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("price", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("turnover", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("slippage", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("brokerage", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("stt", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("exchange_charge", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("sebi_charge", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("gst", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("stamp_duty", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("total_cost", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("cost_model_version", sa.String(length=40), nullable=False),
        sa.Column("filled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("price > 0", name=op.f("ck_order_fills_price_positive")),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_order_fills_quantity_positive")),
        sa.CheckConstraint("total_cost >= 0", name=op.f("ck_order_fills_total_cost_nonnegative")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_order_fills_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id", "order_id"], ["orders.user_id", "orders.id"], name="fk_order_fills_user_order", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_fills")),
        sa.UniqueConstraint("order_id", "fill_key", name="uq_order_fills_order_key"),
    )
    op.create_index("ix_order_fills_user_filled", "order_fills", ["user_id", "filled_at"])
    op.create_index(op.f("ix_order_fills_user_id"), "order_fills", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_order_fills_user_id"), table_name="order_fills")
    op.drop_index("ix_order_fills_user_filled", table_name="order_fills")
    op.drop_table("order_fills")
    op.drop_constraint(op.f("fk_orders_parent_order_id_orders"), "orders", type_="foreignkey")
    op.drop_constraint("fk_orders_user_execution_action", "orders", type_="foreignkey")
    op.drop_constraint("ck_orders_validity_values", "orders", type_="check")
    op.drop_constraint("ck_orders_filled_quantity_lte_quantity", "orders", type_="check")
    op.drop_constraint("ck_orders_attempt_number_positive", "orders", type_="check")
    op.drop_column("orders", "expires_at")
    op.drop_column("orders", "validity")
    op.drop_column("orders", "attempt_number")
    op.drop_column("orders", "parent_order_id")
    op.drop_column("orders", "execution_action_id")
    op.drop_index(op.f("ix_execution_actions_user_id"), table_name="execution_actions")
    op.drop_index("ix_execution_actions_user_status", table_name="execution_actions")
    op.drop_table("execution_actions")
    op.drop_index(op.f("ix_tool_execution_states_user_id"), table_name="tool_execution_states")
    op.drop_index("ix_tool_execution_states_lease", table_name="tool_execution_states")
    op.drop_index("ix_tool_execution_states_due", table_name="tool_execution_states")
    op.drop_table("tool_execution_states")
