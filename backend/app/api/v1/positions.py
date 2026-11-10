from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import error_detail, get_current_principal
from app.db.session import get_db_session
from app.schemas.trading import PositionDetailResponse, PositionListResponse
from app.services.auth_service import AuthenticatedPrincipal
from app.services.position_queries import get_position_detail, list_positions

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("", response_model=PositionListResponse)
async def get_positions(
    status_filter: Literal["open", "closed"] = Query(default="open", alias="status"),
    broker_account_id: UUID | None = None,
    search: str | None = Query(default=None, max_length=120),
    kind: Literal["stock", "future", "option"] | None = None,
    side: Literal["BUY", "SELL"] | None = None,
    product: Literal["MIS", "NRML", "CNC"] | None = None,
    sort: Literal["recent", "pnl-desc", "pnl-asc", "az", "qty"] = "recent",
    date_from: date | None = None,
    date_to: date | None = None,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: AsyncSession = Depends(get_db_session),
) -> PositionListResponse:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail=error_detail("invalid_date_range", "date_from must be on or before date_to"))
    return await list_positions(
        db,
        principal.user.id,
        status=status_filter,
        broker_account_id=broker_account_id,
        search=search,
        kind=kind,
        side=side,
        product=product,
        sort=sort,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/{position_id}", response_model=PositionDetailResponse)
async def get_position(
    position_id: UUID,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: AsyncSession = Depends(get_db_session),
) -> PositionDetailResponse:
    detail = await get_position_detail(db, principal.user.id, position_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_detail("position_not_found", "Position was not found"),
        )
    return detail
