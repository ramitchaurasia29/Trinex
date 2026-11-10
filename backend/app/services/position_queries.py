from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.foundation import ActivityEvent, BrokerAccount, Instrument, Position, PositionSnapshot
from app.schemas.trading import (
    PositionActivityResponse,
    PositionDetailResponse,
    PositionListResponse,
    PositionResponse,
    PositionSummaryResponse,
)


ZERO = Decimal("0")


async def _position_response(
    db: AsyncSession,
    position: Position,
    instrument: Instrument,
    account: BrokerAccount,
) -> PositionResponse:
    snapshot = await db.scalar(
        select(PositionSnapshot)
        .where(PositionSnapshot.position_id == position.id)
        .order_by(PositionSnapshot.captured_at.desc())
        .limit(1)
    )
    ltp = snapshot.last_traded_price if snapshot else position.average_price
    quantity = position.quantity
    signed_quantity = quantity if position.side == "BUY" else -quantity
    exposure = abs(position.average_price * quantity)
    mtm = position.realized_pnl + position.unrealized_pnl
    percentage = (position.unrealized_pnl / exposure * Decimal("100")) if exposure else ZERO
    margin_available = Decimal(str((account.account_metadata or {}).get("margin_available", "0")))
    exit_method = None
    if position.status == "closed":
        event = await db.scalar(
            select(ActivityEvent)
            .where(
                ActivityEvent.user_id == position.user_id,
                ActivityEvent.position_id == position.id,
                ActivityEvent.event_type == "position_closed",
            )
            .order_by(ActivityEvent.occurred_at.desc())
            .limit(1)
        )
        exit_method = str((event.event_metadata or {}).get("exit_method", "External")) if event else "External"
    return PositionResponse(
        id=position.id,
        broker_account_id=account.id,
        broker_provider=account.provider,
        broker_display_name=account.display_name,
        broker_status=account.status,
        symbol=instrument.display_symbol,
        trading_symbol=instrument.trading_symbol,
        exchange=instrument.exchange,
        kind=instrument.kind,
        side=position.side,
        product=position.product,
        status=position.status,
        quantity=quantity,
        net_quantity=signed_quantity,
        available_quantity=position.available_quantity,
        lot_size=instrument.lot_size,
        average_entry_price=position.average_price,
        ltp=ltp,
        previous_close=snapshot.previous_close if snapshot else None,
        day_open=snapshot.day_open if snapshot else None,
        day_low=snapshot.day_low if snapshot else None,
        day_high=snapshot.day_high if snapshot else None,
        realized_pnl=position.realized_pnl,
        unrealized_pnl=position.unrealized_pnl,
        mtm=mtm,
        gross_exposure=exposure,
        pnl_percentage=percentage,
        margin_used=position.margin_used,
        margin_available=margin_available,
        expiry_date=instrument.expiry_date,
        greeks=snapshot.greeks if snapshot else {},
        opened_at=position.opened_at,
        closed_at=position.closed_at,
        last_synced_at=position.last_synced_at,
        stale=account.status != "connected",
        exit_method=exit_method,
    )


async def list_positions(
    db: AsyncSession,
    user_id: UUID,
    *,
    status: str,
    broker_account_id: UUID | None = None,
    search: str | None = None,
    kind: str | None = None,
    side: str | None = None,
    product: str | None = None,
    sort: str = "recent",
    date_from: date | None = None,
    date_to: date | None = None,
) -> PositionListResponse:
    statement = (
        select(Position, Instrument, BrokerAccount)
        .join(Instrument, Instrument.id == Position.instrument_id)
        .join(BrokerAccount, BrokerAccount.id == Position.broker_account_id)
        .where(Position.user_id == user_id, Position.status == status)
    )
    if broker_account_id:
        statement = statement.where(Position.broker_account_id == broker_account_id)
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            Instrument.display_symbol.ilike(pattern) | Instrument.trading_symbol.ilike(pattern)
        )
    if kind:
        statement = statement.where(Instrument.kind == kind)
    if side:
        statement = statement.where(Position.side == side)
    if product:
        statement = statement.where(Position.product == product)
    if date_from and status == "closed":
        statement = statement.where(func.date(Position.closed_at) >= date_from)
    if date_to and status == "closed":
        statement = statement.where(func.date(Position.closed_at) <= date_to)
    order = {
        "recent": desc(Position.updated_at),
        "pnl-desc": desc(Position.unrealized_pnl if status == "open" else Position.realized_pnl),
        "pnl-asc": asc(Position.unrealized_pnl if status == "open" else Position.realized_pnl),
        "az": asc(Instrument.display_symbol),
        "qty": desc(Position.quantity),
    }.get(sort, desc(Position.updated_at))
    rows = (await db.execute(statement.order_by(order))).all()
    items = [await _position_response(db, position, instrument, account) for position, instrument, account in rows]
    realized = sum((item.realized_pnl for item in items), ZERO)
    unrealized = sum((item.unrealized_pnl for item in items), ZERO)
    exposure = sum((item.gross_exposure for item in items), ZERO)
    summary = PositionSummaryResponse(
        position_count=len(items),
        gross_exposure=exposure,
        realized_pnl=realized,
        unrealized_pnl=unrealized,
        mtm=realized + unrealized,
        profitable_count=sum(1 for item in items if item.mtm > 0),
        losing_count=sum(1 for item in items if item.mtm < 0),
    )
    last_synced = max((item.last_synced_at for item in items if item.last_synced_at), default=None)
    return PositionListResponse(items=items, summary=summary, last_synced_at=last_synced)


async def get_position_detail(db: AsyncSession, user_id: UUID, position_id: UUID) -> PositionDetailResponse | None:
    row = (
        await db.execute(
            select(Position, Instrument, BrokerAccount)
            .join(Instrument, Instrument.id == Position.instrument_id)
            .join(BrokerAccount, BrokerAccount.id == Position.broker_account_id)
            .where(Position.user_id == user_id, Position.id == position_id)
        )
    ).first()
    if row is None:
        return None
    position, instrument, account = row
    events = (
        await db.scalars(
            select(ActivityEvent)
            .where(ActivityEvent.user_id == user_id, ActivityEvent.position_id == position_id)
            .order_by(ActivityEvent.occurred_at.desc())
            .limit(20)
        )
    ).all()
    return PositionDetailResponse(
        position=await _position_response(db, position, instrument, account),
        activity=[PositionActivityResponse(
            id=event.id,
            event_type=event.event_type,
            summary=event.summary,
            impact_amount=event.impact_amount,
            occurred_at=event.occurred_at,
            metadata=event.event_metadata,
        ) for event in events],
    )
