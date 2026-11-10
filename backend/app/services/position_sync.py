from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.foundation import (
    ActivityEvent,
    BrokerAccount,
    Instrument,
    Position,
    PositionSnapshot,
    ToolEvent,
    ToolInstance,
    ToolInstancePosition,
)
from app.services.broker_adapters import BrokerPosition, get_broker_adapter
from app.services.redis_store import acquire_lock, release_lock


class BrokerSyncError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


async def owned_broker(db: AsyncSession, user_id: UUID, account_id: UUID) -> BrokerAccount:
    account = await db.scalar(
        select(BrokerAccount).where(
            BrokerAccount.id == account_id,
            BrokerAccount.user_id == user_id,
        )
    )
    if account is None:
        raise BrokerSyncError("broker_not_found", "Broker account was not found")
    return account


async def _instrument(db: AsyncSession, source: BrokerPosition) -> Instrument:
    instrument = await db.scalar(
        select(Instrument).where(
            Instrument.exchange == source.exchange,
            Instrument.trading_symbol == source.trading_symbol,
        )
    )
    if instrument is None:
        instrument = Instrument(
            exchange=source.exchange,
            trading_symbol=source.trading_symbol,
            display_symbol=source.display_symbol,
            kind=source.kind,
            underlying_symbol=source.underlying_symbol,
            expiry_date=source.expiry_date,
            strike_price=source.strike_price,
            option_type=source.option_type,
            lot_size=source.lot_size,
            tick_size=source.tick_size,
            instrument_metadata={"data_mode": "SIMULATED"},
        )
        db.add(instrument)
        await db.flush()
    return instrument


def _unrealized(source: BrokerPosition) -> Decimal:
    if source.status == "closed":
        return Decimal("0")
    signed = source.quantity if source.side == "BUY" else -source.quantity
    return ((source.ltp - source.average_price) * signed).quantize(Decimal("0.0001"))


async def _snapshot_changed(db: AsyncSession, position_id: UUID, source: BrokerPosition) -> bool:
    latest = await db.scalar(
        select(PositionSnapshot)
        .where(PositionSnapshot.position_id == position_id)
        .order_by(PositionSnapshot.captured_at.desc())
        .limit(1)
    )
    if latest is None:
        return True
    return any((
        latest.quantity != source.quantity,
        latest.average_price != source.average_price,
        latest.last_traded_price != source.ltp,
        latest.previous_close != source.previous_close,
        latest.day_open != source.day_open,
        latest.day_low != source.day_low,
        latest.day_high != source.day_high,
        latest.realized_pnl != source.realized_pnl,
        latest.unrealized_pnl != _unrealized(source),
        latest.margin_used != source.margin_used,
        latest.greeks != (source.greeks or {}),
    ))


async def sync_broker_account(db: AsyncSession, user_id: UUID, account_id: UUID) -> dict[str, object]:
    lock = await acquire_lock(f"broker-sync:{user_id}:{account_id}", ttl_seconds=30)
    if lock is None:
        raise BrokerSyncError("sync_in_progress", "This broker account is already syncing")
    try:
        account = await owned_broker(db, user_id, account_id)
        if account.status == "disconnected":
            raise BrokerSyncError("broker_disconnected", "Reconnect the broker account before syncing")
        if account.provider != "mock":
            raise BrokerSyncError("broker_adapter_not_implemented", "This broker adapter is not available yet")

        account.status = "syncing"
        await db.commit()
        book = await get_broker_adapter(account.provider).fetch_position_book(account.external_account_id)
        incoming_keys: set[str] = set()
        snapshots_created = 0
        open_count = 0
        closed_count = 0

        account = await owned_broker(db, user_id, account_id)
        for source in book.positions:
            incoming_keys.add(source.key)
            instrument = await _instrument(db, source)
            position = await db.scalar(
                select(Position).where(
                    Position.user_id == user_id,
                    Position.broker_account_id == account_id,
                    Position.broker_position_key == source.key,
                )
            )
            was_closed = position is not None and position.status == "closed"
            if position is None:
                position = Position(
                    user_id=user_id,
                    broker_account_id=account_id,
                    broker_position_key=source.key,
                    instrument_id=instrument.id,
                    side=source.side,
                    product=source.product,
                    status=source.status,
                    quantity=source.quantity,
                    available_quantity=source.available_quantity,
                    average_price=source.average_price,
                    realized_pnl=source.realized_pnl,
                    unrealized_pnl=_unrealized(source),
                    margin_used=source.margin_used,
                    opened_at=source.opened_at,
                    closed_at=source.closed_at,
                    last_synced_at=book.captured_at,
                )
                db.add(position)
                await db.flush()
            else:
                position.instrument_id = instrument.id
                position.side = source.side
                position.product = source.product
                position.status = source.status
                position.quantity = source.quantity
                position.available_quantity = source.available_quantity
                position.average_price = source.average_price
                position.realized_pnl = source.realized_pnl
                position.unrealized_pnl = _unrealized(source)
                position.margin_used = source.margin_used
                position.opened_at = source.opened_at
                position.closed_at = source.closed_at
                position.last_synced_at = book.captured_at

            if await _snapshot_changed(db, position.id, source):
                db.add(PositionSnapshot(
                    user_id=user_id,
                    position_id=position.id,
                    quantity=source.quantity,
                    average_price=source.average_price,
                    last_traded_price=source.ltp,
                    previous_close=source.previous_close,
                    day_open=source.day_open,
                    day_low=source.day_low,
                    day_high=source.day_high,
                    realized_pnl=source.realized_pnl,
                    unrealized_pnl=_unrealized(source),
                    margin_used=source.margin_used,
                    greeks=source.greeks or {},
                    captured_at=book.captured_at,
                ))
                snapshots_created += 1

            if source.status == "open":
                open_count += 1
            else:
                closed_count += 1
                if not was_closed:
                    db.add(ActivityEvent(
                        user_id=user_id,
                        event_type="position_closed",
                        summary=f"{source.display_symbol} closed in simulated broker data",
                        position_id=position.id,
                        impact_amount=source.realized_pnl,
                        event_metadata={"exit_method": source.exit_method or "External", "data_mode": "SIMULATED"},
                        occurred_at=source.closed_at or book.captured_at,
                    ))

        existing_open = (
            await db.scalars(select(Position).where(
                Position.user_id == user_id,
                Position.broker_account_id == account_id,
                Position.status == "open",
            ))
        ).all()
        for position in existing_open:
            if position.broker_position_key not in incoming_keys:
                position.status = "closed"
                position.available_quantity = Decimal("0")
                position.unrealized_pnl = Decimal("0")
                position.closed_at = book.captured_at
                position.last_synced_at = book.captured_at

        account.status = "connected"
        account.last_synced_at = book.captured_at
        account.account_metadata = {
            **(account.account_metadata or {}),
            "adapter": "mock",
            "data_mode": "SIMULATED",
            "margin_available": str(book.margin_available),
            "last_error_code": None,
        }
        db.add(ActivityEvent(
            user_id=user_id,
            event_type="broker_sync_completed",
            summary=f"{account.display_name} synchronized simulated positions",
            event_metadata={"broker_account_id": str(account.id), "open_positions": open_count, "closed_positions": closed_count, "data_mode": "SIMULATED"},
            occurred_at=book.captured_at,
        ))
        await db.commit()
        return {
            "broker_account_id": account.id,
            "open_positions": open_count,
            "closed_positions": closed_count,
            "snapshots_created": snapshots_created,
            "synced_at": book.captured_at,
        }
    except BrokerSyncError:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        try:
            account = await owned_broker(db, user_id, account_id)
            account.status = "error"
            account.account_metadata = {**(account.account_metadata or {}), "last_error_code": "sync_failed"}
            await db.commit()
        except Exception:
            await db.rollback()
        raise BrokerSyncError("sync_failed", "Broker synchronization failed")
    finally:
        await release_lock(lock)


async def disconnect_broker_account(db: AsyncSession, user_id: UUID, account_id: UUID) -> tuple[int, int]:
    account = await owned_broker(db, user_id, account_id)
    position_ids = list((await db.scalars(select(Position.id).where(
        Position.user_id == user_id,
        Position.broker_account_id == account_id,
    ))).all())
    linked_tool_ids: set[UUID] = set()
    if position_ids:
        linked_tool_ids.update((await db.scalars(select(ToolInstancePosition.tool_instance_id).where(
            ToolInstancePosition.user_id == user_id,
            ToolInstancePosition.position_id.in_(position_ids),
        ))).all())
    tools = list((await db.scalars(select(ToolInstance).where(
        ToolInstance.user_id == user_id,
        ToolInstance.status.in_(("waiting", "active", "imminent", "queued")),
        or_(ToolInstance.broker_account_id == account_id, ToolInstance.id.in_(linked_tool_ids) if linked_tool_ids else False),
    ))).all())
    now = datetime.now(UTC)
    for tool in tools:
        before = tool.status
        sequence = (await db.scalar(select(func.coalesce(func.max(ToolEvent.sequence), 0)).where(ToolEvent.tool_instance_id == tool.id))) + 1
        tool.status = "paused"
        tool.paused_at = now
        db.add(ToolEvent(
            user_id=user_id,
            tool_instance_id=tool.id,
            sequence=sequence,
            event_type="broker_disconnected",
            message="Tool paused because its broker account was disconnected",
            state_before={"status": before},
            state_after={"status": "paused"},
            details={"broker_account_id": str(account_id), "data_mode": "SIMULATED"},
            occurred_at=now,
        ))
    account.status = "disconnected"
    await db.commit()
    return len(position_ids), len(tools)
