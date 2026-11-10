from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_principal
from app.db.models.foundation import ActivityEvent, ToolInstance
from app.db.session import get_db_session
from app.schemas.tools import ActivityEventResponse, ActivityListResponse
from app.services.auth_service import AuthenticatedPrincipal

router = APIRouter(prefix="/activity/events", tags=["activity"])


@router.get("", response_model=ActivityListResponse)
async def list_activity(tool_type: str | None = None, position_id: UUID | None = None, before: datetime | None = None, limit: int = Query(50, ge=1, le=100), principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> ActivityListResponse:
    stmt = select(ActivityEvent).outerjoin(ToolInstance, ToolInstance.id == ActivityEvent.tool_instance_id).where(ActivityEvent.user_id == principal.user.id)
    if tool_type: stmt = stmt.where(ToolInstance.tool_type == tool_type)
    if position_id: stmt = stmt.where(ActivityEvent.position_id == position_id)
    if before: stmt = stmt.where(ActivityEvent.occurred_at < before)
    rows = (await db.scalars(stmt.order_by(ActivityEvent.occurred_at.desc()).limit(limit + 1))).all()
    page, more = rows[:limit], len(rows) > limit
    return ActivityListResponse(items=[ActivityEventResponse(id=row.id, event_type=row.event_type, summary=row.summary, tool_instance_id=row.tool_instance_id, position_id=row.position_id, occurred_at=row.occurred_at, metadata=row.event_metadata) for row in page], next_cursor=page[-1].occurred_at.isoformat() if more and page else None)
