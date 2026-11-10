from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import error_detail, get_current_principal, require_json_request
from app.db.models.foundation import ToolInstance, UserToolDefault
from app.db.session import get_db_session
from app.schemas.tool_config import TOOL_CONFIG_MODELS
from app.schemas.tools import (
    ToolDefaultResponse, ToolDefaultsUpdate, ToolDraftCreate, ToolListResponse,
    ToolMutation, ToolResponse, ToolReviewResponse, ToolUpdate,
)
from app.services.auth_service import AuthenticatedPrincipal
from app.services.tool_service import (
    ACTIVE_STATUSES, HISTORY_STATUSES, ToolServiceError, create_draft, review_tool,
    tool_response, transition_tool, update_tool,
)

router = APIRouter(tags=["tools"])


def fail(exc: ToolServiceError) -> HTTPException:
    return HTTPException(exc.status_code, detail=error_detail(exc.code, exc.message, errors=exc.errors))


@router.post("/tools/drafts", response_model=ToolResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_json_request)])
async def create(payload: ToolDraftCreate, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> ToolResponse:
    try:
        tool = await create_draft(db, principal.user.id, tool_id=payload.id, tool_type=payload.tool_type, config=payload.config, position_ids=payload.position_ids, broker_account_id=payload.broker_account_id, instrument_id=payload.instrument_id)
        return await tool_response(db, tool, include_events=True)
    except ToolServiceError as exc: raise fail(exc) from exc


@router.get("/tools", response_model=ToolListResponse)
async def list_tools(scope: str = Query("active", pattern="^(drafts|active|history)$"), principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> ToolListResponse:
    statuses = {"drafts": {"draft"}, "active": ACTIVE_STATUSES, "history": HISTORY_STATUSES}[scope]
    items = (await db.scalars(select(ToolInstance).where(ToolInstance.user_id == principal.user.id, ToolInstance.status.in_(statuses)).order_by(ToolInstance.updated_at.desc()))).all()
    return ToolListResponse(items=[await tool_response(db, item) for item in items])


@router.get("/tools/{tool_id}", response_model=ToolResponse)
async def get_tool(tool_id: UUID, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> ToolResponse:
    item = await db.scalar(select(ToolInstance).where(ToolInstance.user_id == principal.user.id, ToolInstance.id == tool_id))
    if item is None: raise HTTPException(404, detail=error_detail("tool_not_found", "Tool was not found"))
    return await tool_response(db, item, include_events=True)


@router.patch("/tools/{tool_id}", response_model=ToolResponse, dependencies=[Depends(require_json_request)])
async def update(tool_id: UUID, payload: ToolUpdate, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> ToolResponse:
    try:
        item = await update_tool(db, principal.user.id, tool_id, payload.expected_version, payload.config, payload.position_ids, payload.broker_account_id, payload.instrument_id)
        return await tool_response(db, item, include_events=True)
    except ToolServiceError as exc: raise fail(exc) from exc


@router.post("/tools/{tool_id}/review", response_model=ToolReviewResponse, dependencies=[Depends(require_json_request)])
async def review(tool_id: UUID, payload: ToolMutation, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> ToolReviewResponse:
    try:
        item, errors = await review_tool(db, principal.user.id, tool_id, payload.expected_version)
        return ToolReviewResponse(valid=not errors, validation_errors=errors, tool=await tool_response(db, item, include_events=True))
    except ToolServiceError as exc: raise fail(exc) from exc


def action_endpoint(action: str):
    async def endpoint(tool_id: UUID, payload: ToolMutation, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> ToolResponse:
        try:
            item = await transition_tool(db, principal.user.id, tool_id, payload.expected_version, action)
            return await tool_response(db, item, include_events=True)
        except ToolServiceError as exc: raise fail(exc) from exc
    return endpoint


for _action in ("arm", "pause", "resume", "cancel"):
    router.add_api_route(f"/tools/{{tool_id}}/{_action}", action_endpoint(_action), methods=["POST"], response_model=ToolResponse, dependencies=[Depends(require_json_request)], name=f"tool_{_action}")


DEFAULT_ALLOWED: dict[str, set[str]] = {
    "timed-exit": {"time", "exitType", "foPartialType", "stockPartialType"},
    "trailing-sl": {"moveUnit", "slUnit"}, "timed-entry": {"side", "ladder"},
    "no-motion": {"reference", "movementType", "exitType"},
    "range-break": {"rangeLevel", "direction", "trigger", "exitType", "foPartialType", "stockPartialType"},
    "partial-profit": {"targetCount"}, "mtm-lock": {"progressive"},
    "dependency": {"direction", "action", "exitQuantity", "quantityType"},
}


def validate_default(tool_type: str, config: dict) -> None:
    allowed = DEFAULT_ALLOWED.get(tool_type)
    if allowed is None or not set(config).issubset(allowed):
        raise HTTPException(422, detail=error_detail("invalid_tool_defaults", "Defaults contain unsupported fields"))
    literals = {
        "exitType": {"full", "partial"}, "foPartialType": {"lots", "qty"}, "stockPartialType": {"qty", "pct"},
        "moveUnit": {"pts", "pct"}, "slUnit": {"pts", "pct"}, "side": {"BUY", "SELL"},
        "reference": {"entry", "ltp"}, "movementType": {"pts", "pct"}, "rangeLevel": {"high", "low"},
        "direction": {"above", "below", "either"}, "trigger": {"touch", "cross", "close"},
        "action": {"entry", "exit"}, "exitQuantity": {"full", "partial"}, "quantityType": {"qty", "pct"},
    }
    for key, choices in literals.items():
        if key in config and config[key] not in choices:
            raise HTTPException(422, detail=error_detail("invalid_tool_defaults", f"Invalid default for {key}"))
    for key in ("progressive", "ladder"):
        if key in config and not isinstance(config[key], bool): raise HTTPException(422, detail=error_detail("invalid_tool_defaults", f"{key} must be boolean"))
    if "targetCount" in config and (not isinstance(config["targetCount"], int) or not 1 <= config["targetCount"] <= 5): raise HTTPException(422, detail=error_detail("invalid_tool_defaults", "targetCount must be between 1 and 5"))
    if "time" in config:
        try: hour, minute = (int(value) for value in str(config["time"]).split(":")); valid_time = 0 <= hour <= 23 and 0 <= minute <= 59 and 9 * 60 + 15 <= hour * 60 + minute <= 15 * 60 + 29
        except ValueError: valid_time = False
        if not valid_time: raise HTTPException(422, detail=error_detail("invalid_tool_defaults", "Default time must be between 09:15 and 15:29"))


@router.get("/tool-defaults", response_model=list[ToolDefaultResponse])
async def get_defaults(principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> list[ToolDefaultResponse]:
    rows = (await db.scalars(select(UserToolDefault).where(UserToolDefault.user_id == principal.user.id).order_by(UserToolDefault.tool_type))).all()
    return [ToolDefaultResponse(tool_type=row.tool_type, config=row.config, is_enabled=row.is_enabled, version=row.updated_at.isoformat()) for row in rows]


@router.put("/tool-defaults", response_model=list[ToolDefaultResponse], dependencies=[Depends(require_json_request)])
async def put_defaults(payload: ToolDefaultsUpdate, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> list[ToolDefaultResponse]:
    output = []
    for item in payload.defaults:
        validate_default(item.tool_type, item.config)
        row = await db.scalar(select(UserToolDefault).where(UserToolDefault.user_id == principal.user.id, UserToolDefault.tool_type == item.tool_type).with_for_update())
        if row:
            if item.expected_version and row.updated_at.isoformat() != item.expected_version:
                raise HTTPException(409, detail=error_detail("stale_default_version", "Tool defaults changed in another session"))
            row.config, row.is_enabled = item.config, item.is_enabled
        else:
            row = UserToolDefault(user_id=principal.user.id, tool_type=item.tool_type, config=item.config, config_version=1, is_enabled=item.is_enabled); db.add(row)
        output.append(row)
    await db.commit()
    for row in output: await db.refresh(row)
    return [ToolDefaultResponse(tool_type=row.tool_type, config=row.config, is_enabled=row.is_enabled, version=row.updated_at.isoformat()) for row in output]
