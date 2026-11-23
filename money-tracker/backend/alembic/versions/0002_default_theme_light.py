"""Use the light theme by default."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE user_settings SET theme = 'light' WHERE theme = 'system'"))
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.alter_column(
            "theme",
            existing_type=sa.String(length=16),
            existing_nullable=False,
            server_default=sa.text("'light'"),
        )


def downgrade() -> None:
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.alter_column(
            "theme",
            existing_type=sa.String(length=16),
            existing_nullable=False,
            server_default=sa.text("'system'"),
        )
