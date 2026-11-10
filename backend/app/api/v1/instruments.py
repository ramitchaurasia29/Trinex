from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_principal
from app.db.models.foundation import Instrument
from app.db.session import get_db_session
from app.schemas.tools import InstrumentResponse
from app.services.auth_service import AuthenticatedPrincipal

router = APIRouter(prefix="/instruments", tags=["instruments"])


@router.get("", response_model=list[InstrumentResponse])
async def list_instruments(search: str | None = Query(None, max_length=120), kind: str | None = Query(None, pattern="^(stock|future|option)$"), _: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> list[InstrumentResponse]:
    stmt = select(Instrument).where(Instrument.is_active.is_(True))
    if search:
        term = f"%{search.strip()}%"; stmt = stmt.where(or_(Instrument.display_symbol.ilike(term), Instrument.trading_symbol.ilike(term)))
    if kind: stmt = stmt.where(Instrument.kind == kind)
    rows = (await db.scalars(stmt.order_by(Instrument.display_symbol).limit(100))).all()
    return [InstrumentResponse(id=row.id, exchange=row.exchange, trading_symbol=row.trading_symbol, display_symbol=row.display_symbol, kind=row.kind, lot_size=str(row.lot_size), expiry_date=row.expiry_date.isoformat() if row.expiry_date else None, metadata=row.instrument_metadata) for row in rows]
