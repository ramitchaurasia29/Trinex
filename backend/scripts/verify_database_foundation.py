import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint, insert, inspect, select
from sqlalchemy.exc import IntegrityError

from app.db import models
from app.db.base import Base
from app.db.session import close_database_engine, get_engine
from app.schemas.tool_config import validate_tool_config


EXPECTED_TABLES = {
    "users",
    "auth_sessions",
    "broker_accounts",
    "instruments",
    "positions",
    "position_snapshots",
    "tool_instances",
    "tool_instance_positions",
    "orders",
    "order_events",
    "tool_events",
    "alerts",
    "activity_events",
    "user_tool_defaults",
    "user_preferences",
}

TOOL_CONFIG_EXAMPLES: dict[str, dict[str, Any]] = {
    "timed-exit": {
        "exitType": "full",
        "partialType": "lots",
        "lots": "",
        "qty": "",
        "pct": "",
        "instrument": "fo",
        "time": "15:10",
    },
    "trailing-sl": {
        "instrument": "fo",
        "move": "20",
        "moveUnit": "pts",
        "sl": "10",
        "slUnit": "pts",
    },
    "timed-entry": {
        "instrument": "fo",
        "side": "BUY",
        "ladder": False,
        "time": "09:35",
        "qty": "1",
        "entries": [{"time": "09:35", "qty": "1"}],
    },
    "no-motion": {
        "instrument": "stock",
        "exitType": "window",
        "start": "09:30",
        "end": "10:00",
        "movementType": "pts",
        "movement": "5",
        "high": "",
        "low": "",
        "reference": "entry",
    },
    "range-break": {
        "exitType": "full",
        "partialType": "qty",
        "lots": "",
        "qty": "",
        "pct": "",
        "instrument": "stock",
        "rangeLevel": "high",
        "price": "100",
        "direction": "above",
        "trigger": "touch",
    },
    "partial-profit": {
        "instrument": "options",
        "targetCount": 1,
        "targets": [{"level": "125", "type": "lots", "value": "1"}],
    },
    "mtm-lock": {
        "positionType": "single",
        "selectedPositionIds": ["p1"],
        "basket": "",
        "activation": "5000",
        "progressive": False,
        "protected": "3500",
        "levels": [{"target": "", "lock": ""}],
    },
    "dependency": {
        "referenceSymbol": "NIFTY",
        "level": "24400",
        "direction": "above",
        "action": "entry",
        "entrySymbol": "NIFTY 24500 CE",
        "entryQuantity": "1",
        "exitPositionId": "",
        "exitQuantity": "full",
        "quantityType": "qty",
        "exitValue": "",
    },
}


async def expect_integrity(connection: Any, label: str, statement: Any) -> None:
    savepoint = await connection.begin_nested()
    try:
        await connection.execute(statement)
    except IntegrityError:
        await savepoint.rollback()
        print(f"CONSTRAINT {label}: PASS")
        return
    await savepoint.rollback()
    raise AssertionError(f"Expected integrity failure: {label}")


def database_shape(sync_connection: Any) -> dict[str, dict[str, set[str]]]:
    inspector = inspect(sync_connection)
    result: dict[str, dict[str, set[str]]] = {}
    for table_name in EXPECTED_TABLES:
        result[table_name] = {
            "checks": {
                item["name"]
                for item in inspector.get_check_constraints(table_name)
                if item["name"]
            },
            "foreign_keys": {
                item["name"]
                for item in inspector.get_foreign_keys(table_name)
                if item["name"]
            },
            "uniques": {
                item["name"]
                for item in inspector.get_unique_constraints(table_name)
                if item["name"]
            },
            "indexes": {
                item["name"]
                for item in inspector.get_indexes(table_name)
                if item["name"] and not item.get("duplicates_constraint")
            },
        }
    return result


def metadata_shape() -> dict[str, dict[str, set[str]]]:
    result: dict[str, dict[str, set[str]]] = {}
    for table_name in EXPECTED_TABLES:
        table = Base.metadata.tables[table_name]
        result[table_name] = {
            "checks": {
                constraint.name
                for constraint in table.constraints
                if isinstance(constraint, CheckConstraint) and constraint.name
            },
            "foreign_keys": {
                constraint.name
                for constraint in table.constraints
                if isinstance(constraint, ForeignKeyConstraint) and constraint.name
            },
            "uniques": {
                constraint.name
                for constraint in table.constraints
                if isinstance(constraint, UniqueConstraint) and constraint.name
            },
            "indexes": {index.name for index in table.indexes if index.name},
        }
    return result


async def main() -> None:
    engine = get_engine()
    try:
        async with engine.connect() as connection:
            database_tables = set(
                await connection.run_sync(
                    lambda sync: inspect(sync).get_table_names(schema="public")
                )
            )
            assert database_tables - {"alembic_version"} == EXPECTED_TABLES
            assert await connection.run_sync(database_shape) == metadata_shape()
            print("SCHEMA_CONSTRAINT_AND_INDEX_PARITY: PASS")

            await connection.rollback()
            transaction = await connection.begin()
            try:
                now = datetime.now(timezone.utc)
                user_id = (
                    await connection.execute(
                        insert(models.User)
                        .values(
                            phone_e164="+919000000001",
                            email_normalized="foundation-one@example.invalid",
                            display_name="Foundation One",
                        )
                        .returning(models.User.id)
                    )
                ).scalar_one()
                other_user_id = (
                    await connection.execute(
                        insert(models.User)
                        .values(
                            phone_e164="+919000000002",
                            email_normalized="foundation-two@example.invalid",
                            display_name="Foundation Two",
                        )
                        .returning(models.User.id)
                    )
                ).scalar_one()
                assert user_id.version == 4 and other_user_id.version == 4

                broker_id = (
                    await connection.execute(
                        insert(models.BrokerAccount)
                        .values(
                            user_id=user_id,
                            provider="zerodha",
                            external_account_id="FOUNDATION-1",
                            display_name="Foundation broker",
                            status="connected",
                        )
                        .returning(models.BrokerAccount.id)
                    )
                ).scalar_one()
                instrument_id = (
                    await connection.execute(
                        insert(models.Instrument)
                        .values(
                            exchange="NFO",
                            trading_symbol="FOUNDATION TEST CE",
                            display_symbol="FOUNDATION TEST CE",
                            kind="option",
                            option_type="CE",
                            strike_price=Decimal("123.12345678"),
                            lot_size=Decimal("75"),
                            tick_size=Decimal("0.05"),
                        )
                        .returning(models.Instrument.id)
                    )
                ).scalar_one()
                position_id = (
                    await connection.execute(
                        insert(models.Position)
                        .values(
                            user_id=user_id,
                            broker_account_id=broker_id,
                            instrument_id=instrument_id,
                            broker_position_key="FOUNDATION-POSITION-1",
                            side="BUY",
                            product="NRML",
                            quantity=Decimal("150.00000000"),
                            available_quantity=Decimal("150.00000000"),
                            average_price=Decimal("123.12345678"),
                            margin_used=Decimal("1234.5678"),
                            opened_at=now,
                        )
                        .returning(models.Position.id)
                    )
                ).scalar_one()
                tool_config = TOOL_CONFIG_EXAMPLES["timed-exit"]
                tool_id = (
                    await connection.execute(
                        insert(models.ToolInstance)
                        .values(
                            user_id=user_id,
                            tool_type="timed-exit",
                            status="waiting",
                            config=tool_config,
                            summary="Exit at 15:10",
                            target_label="FOUNDATION TEST CE",
                            broker_account_id=broker_id,
                            instrument_id=instrument_id,
                            armed_at=now,
                        )
                        .returning(models.ToolInstance.id)
                    )
                ).scalar_one()
                for tool_type, config in TOOL_CONFIG_EXAMPLES.items():
                    assert validate_tool_config(tool_type, config) == config
                    if tool_type == "timed-exit":
                        continue
                    await connection.execute(
                        insert(models.ToolInstance).values(
                            user_id=user_id,
                            tool_type=tool_type,
                            status="draft",
                            config=config,
                            summary=f"Foundation {tool_type}",
                            target_label="Foundation target",
                        )
                    )
                order_id = (
                    await connection.execute(
                        insert(models.Order)
                        .values(
                            user_id=user_id,
                            broker_account_id=broker_id,
                            instrument_id=instrument_id,
                            tool_instance_id=tool_id,
                            position_id=position_id,
                            idempotency_key="FOUNDATION-ORDER-1",
                            broker_order_id="FOUNDATION-BROKER-ORDER-1",
                            side="SELL",
                            order_type="MARKET",
                            product="NRML",
                            quantity=Decimal("75"),
                        )
                        .returning(models.Order.id)
                    )
                ).scalar_one()

                await connection.execute(
                    insert(models.AuthSession).values(
                        user_id=user_id,
                        token_hash="foundation-token-hash",
                        expires_at=now + timedelta(hours=1),
                    )
                )
                await connection.execute(
                    insert(models.UserPreferences).values(user_id=user_id)
                )
                await connection.execute(
                    insert(models.UserToolDefault).values(
                        user_id=user_id,
                        tool_type="timed-exit",
                        config=tool_config,
                    )
                )
                await connection.execute(
                    insert(models.PositionSnapshot).values(
                        user_id=user_id,
                        position_id=position_id,
                        quantity=Decimal("150"),
                        average_price=Decimal("123.12345678"),
                        last_traded_price=Decimal("125.87654321"),
                        realized_pnl=Decimal("0"),
                        unrealized_pnl=Decimal("412.3456"),
                        margin_used=Decimal("1234.5678"),
                        greeks={"delta": "0.54000000"},
                        captured_at=now,
                    )
                )
                await connection.execute(
                    insert(models.ToolInstancePosition).values(
                        user_id=user_id,
                        tool_instance_id=tool_id,
                        position_id=position_id,
                        role="target",
                    )
                )
                await connection.execute(
                    insert(models.OrderEvent).values(
                        user_id=user_id,
                        order_id=order_id,
                        sequence=1,
                        event_type="created",
                        status="created",
                        occurred_at=now,
                    )
                )
                await connection.execute(
                    insert(models.ToolEvent).values(
                        user_id=user_id,
                        tool_instance_id=tool_id,
                        sequence=1,
                        event_type="armed",
                        message="Tool armed",
                        occurred_at=now,
                    )
                )
                await connection.execute(
                    insert(models.Alert).values(
                        user_id=user_id,
                        severity="info",
                        title="Foundation alert",
                        body="Foundation verification",
                        action="view",
                        dedupe_key="FOUNDATION-ALERT-1",
                        tool_instance_id=tool_id,
                    )
                )
                await connection.execute(
                    insert(models.ActivityEvent).values(
                        user_id=user_id,
                        event_type="foundation_test",
                        summary="Foundation verification",
                        tool_instance_id=tool_id,
                        order_id=order_id,
                        position_id=position_id,
                        impact_amount=Decimal("12.3456"),
                        occurred_at=now,
                    )
                )

                position = (
                    await connection.execute(
                        select(
                            models.Position.id,
                            models.Position.average_price,
                            models.Position.margin_used,
                            models.Position.created_at,
                        ).where(models.Position.id == position_id)
                    )
                ).one()
                assert position.average_price == Decimal("123.12345678")
                assert position.margin_used == Decimal("1234.5678")
                assert position.created_at.tzinfo is not None
                stored_config = await connection.scalar(
                    select(models.ToolInstance.config).where(models.ToolInstance.id == tool_id)
                )
                assert stored_config == tool_config
                stored_tool_configs = dict(
                    (
                        await connection.execute(
                            select(models.ToolInstance.tool_type, models.ToolInstance.config)
                        )
                    ).all()
                )
                assert stored_tool_configs == TOOL_CONFIG_EXAMPLES
                preferences = (
                    await connection.execute(
                        select(
                            models.UserPreferences.trading_timezone,
                            models.UserPreferences.default_trading_mode,
                        ).where(models.UserPreferences.user_id == user_id)
                    )
                ).one()
                assert preferences.trading_timezone == "Asia/Kolkata"
                assert preferences.default_trading_mode == "paper"
                print("UUID_NUMERIC_UTC_TIMEZONE_JSONB_ROUNDTRIP: PASS")
                print("ALL_EIGHT_TOOL_CONFIG_JSONB_ROUNDTRIP: PASS")

                await expect_integrity(
                    connection,
                    "unique session token",
                    insert(models.AuthSession).values(
                        user_id=other_user_id,
                        token_hash="foundation-token-hash",
                        expires_at=now + timedelta(hours=1),
                    ),
                )
                await expect_integrity(
                    connection,
                    "unique broker account",
                    insert(models.BrokerAccount).values(
                        user_id=user_id,
                        provider="zerodha",
                        external_account_id="FOUNDATION-1",
                        display_name="Duplicate",
                    ),
                )
                await expect_integrity(
                    connection,
                    "unique tool default",
                    insert(models.UserToolDefault).values(
                        user_id=user_id,
                        tool_type="timed-exit",
                        config=tool_config,
                    ),
                )
                await expect_integrity(
                    connection,
                    "unique order idempotency",
                    insert(models.Order).values(
                        user_id=user_id,
                        broker_account_id=broker_id,
                        instrument_id=instrument_id,
                        idempotency_key="FOUNDATION-ORDER-1",
                        side="BUY",
                        order_type="MARKET",
                        product="NRML",
                        quantity=Decimal("1"),
                    ),
                )
                await expect_integrity(
                    connection,
                    "unique order event sequence",
                    insert(models.OrderEvent).values(
                        user_id=user_id,
                        order_id=order_id,
                        sequence=1,
                        event_type="duplicate",
                        occurred_at=now,
                    ),
                )
                await expect_integrity(
                    connection,
                    "unique tool event sequence",
                    insert(models.ToolEvent).values(
                        user_id=user_id,
                        tool_instance_id=tool_id,
                        sequence=1,
                        event_type="duplicate",
                        message="Duplicate",
                        occurred_at=now,
                    ),
                )
                await expect_integrity(
                    connection,
                    "cross-user broker isolation",
                    insert(models.Position).values(
                        user_id=other_user_id,
                        broker_account_id=broker_id,
                        instrument_id=instrument_id,
                        broker_position_key="CROSS-USER",
                        side="BUY",
                        product="NRML",
                        quantity=Decimal("1"),
                        available_quantity=Decimal("1"),
                        average_price=Decimal("1"),
                        opened_at=now,
                    ),
                )
                await expect_integrity(
                    connection,
                    "cross-user tool-position isolation",
                    insert(models.ToolInstancePosition).values(
                        user_id=other_user_id,
                        tool_instance_id=tool_id,
                        position_id=position_id,
                        role="target",
                    ),
                )
                await expect_integrity(
                    connection,
                    "paper-only tool",
                    insert(models.ToolInstance).values(
                        user_id=user_id,
                        tool_type="timed-exit",
                        status="draft",
                        execution_mode="live",
                        config=tool_config,
                        summary="Blocked",
                        target_label="Blocked",
                    ),
                )
                await expect_integrity(
                    connection,
                    "paper-only order",
                    insert(models.Order).values(
                        user_id=user_id,
                        broker_account_id=broker_id,
                        instrument_id=instrument_id,
                        idempotency_key="FOUNDATION-LIVE-BLOCKED",
                        execution_mode="live",
                        side="BUY",
                        order_type="MARKET",
                        product="NRML",
                        quantity=Decimal("1"),
                    ),
                )
                await expect_integrity(
                    connection,
                    "unknown tool type",
                    insert(models.ToolInstance).values(
                        user_id=user_id,
                        tool_type="unknown-tool",
                        status="draft",
                        config={},
                        summary="Blocked",
                        target_label="Blocked",
                    ),
                )
            finally:
                await transaction.rollback()
                print("TEST_DATA_ROLLBACK: PASS")
    finally:
        await close_database_engine()


if __name__ == "__main__":
    asyncio.run(main())
