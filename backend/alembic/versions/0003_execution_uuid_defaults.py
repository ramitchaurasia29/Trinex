"""Add UUID defaults omitted from the initial execution revision.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("tool_execution_states", "execution_actions", "order_fills"):
        op.alter_column(table, "id", server_default=sa.text("gen_random_uuid()"))


def downgrade() -> None:
    for table in ("tool_execution_states", "execution_actions", "order_fills"):
        op.alter_column(table, "id", server_default=None)
