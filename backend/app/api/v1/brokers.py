from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import enforce_allowed_origin, error_detail, get_current_principal, require_json_request
from app.db.models.foundation import BrokerAccount, Position
from app.db.session import get_db_session
from app.schemas.trading import (
    BrokerAccountResponse,
    BrokerProviderResponse,
    ConnectBrokerRequest,
    DisconnectResponse,
    SyncAllResponse,
    SyncResultResponse,
)
from app.services.auth_service import AuthenticatedPrincipal
from app.services.position_sync import BrokerSyncError, disconnect_broker_account, owned_broker, sync_broker_account

router = APIRouter(prefix="/brokers", tags=["brokers"])

PROVIDERS = (
    ("mock", "Mock Broker", "Mock", "M", True, "SIMULATED"),
    ("zerodha", "Zerodha", "Zerodha", "Z", False, "UNAVAILABLE"),
    ("angel", "Angel One", "Angel", "A", False, "UNAVAILABLE"),
    ("dhan", "Dhan", "Dhan", "D", False, "UNAVAILABLE"),
    ("groww", "Groww", "Groww", "G", False, "UNAVAILABLE"),
    ("upstox", "Upstox", "Upstox", "U", False, "UNAVAILABLE"),
    ("icici", "ICICI Direct", "ICICI", "I", False, "UNAVAILABLE"),
    ("kotak", "Kotak Neo", "Kotak", "K", False, "UNAVAILABLE"),
    ("5paisa", "5Paisa", "5Paisa", "5", False, "UNAVAILABLE"),
    ("hdfc", "HDFC Securities", "HDFC", "H", False, "UNAVAILABLE"),
    ("motilal", "Motilal Oswal", "Motilal", "M", False, "UNAVAILABLE"),
    ("shoonya", "Shoonya (Finvasia)", "Shoonya", "S", False, "UNAVAILABLE"),
)


def _sync_error(exc: BrokerSyncError) -> HTTPException:
    code = status.HTTP_409_CONFLICT if exc.code in {"sync_in_progress", "broker_disconnected"} else status.HTTP_404_NOT_FOUND if exc.code == "broker_not_found" else status.HTTP_503_SERVICE_UNAVAILABLE
    return HTTPException(status_code=code, detail=error_detail(exc.code, exc.message))


async def _account_response(db: AsyncSession, account: BrokerAccount) -> BrokerAccountResponse:
    count = await db.scalar(select(func.count()).select_from(Position).where(
        Position.user_id == account.user_id,
        Position.broker_account_id == account.id,
        Position.status == "open",
    ))
    return BrokerAccountResponse(
        id=account.id,
        provider=account.provider,
        display_name=account.display_name,
        status=account.status,
        last_synced_at=account.last_synced_at,
        position_count=int(count or 0),
        account_metadata=account.account_metadata,
    )


@router.get("/providers", response_model=list[BrokerProviderResponse])
async def list_providers(_: AuthenticatedPrincipal = Depends(get_current_principal)) -> list[BrokerProviderResponse]:
    return [BrokerProviderResponse(id=i, name=n, short=s, monogram=m, connection_available=a, data_mode=mode) for i, n, s, m, a, mode in PROVIDERS]


@router.get("", response_model=list[BrokerAccountResponse])
async def list_brokers(principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> list[BrokerAccountResponse]:
    accounts = (await db.scalars(select(BrokerAccount).where(BrokerAccount.user_id == principal.user.id).order_by(BrokerAccount.created_at))).all()
    return [await _account_response(db, account) for account in accounts]


@router.post("/connect", response_model=BrokerAccountResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_json_request)])
async def connect_broker(payload: ConnectBrokerRequest, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> BrokerAccountResponse:
    if payload.provider != "mock":
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=error_detail("broker_adapter_not_implemented", f"{payload.provider.title()} authorization is not implemented"))
    external_id = f"mock:{payload.client_request_id}"
    existing = await db.scalar(select(BrokerAccount).where(
        BrokerAccount.user_id == principal.user.id,
        BrokerAccount.provider == "mock",
        BrokerAccount.external_account_id == external_id,
    ))
    if existing:
        return await _account_response(db, existing)
    number = int(await db.scalar(select(func.count()).select_from(BrokerAccount).where(BrokerAccount.user_id == principal.user.id, BrokerAccount.provider == "mock")) or 0) + 1
    account = BrokerAccount(
        user_id=principal.user.id,
        provider="mock",
        external_account_id=external_id,
        display_name=payload.display_name or f"Mock Paper Account {number}",
        status="connected",
        account_metadata={"adapter": "mock", "data_mode": "SIMULATED", "paper": True},
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return await _account_response(db, account)


@router.post("/sync", response_model=SyncAllResponse, dependencies=[Depends(enforce_allowed_origin)])
async def sync_all(principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> SyncAllResponse:
    account_ids = list((await db.scalars(select(BrokerAccount.id).where(BrokerAccount.user_id == principal.user.id, BrokerAccount.status != "disconnected"))).all())
    results = []
    for account_id in account_ids:
        try:
            results.append(SyncResultResponse(**await sync_broker_account(db, principal.user.id, account_id)))
        except BrokerSyncError as exc:
            raise _sync_error(exc) from exc
    return SyncAllResponse(results=results)


@router.post("/{account_id}/reconnect", response_model=BrokerAccountResponse, dependencies=[Depends(enforce_allowed_origin)])
async def reconnect_broker(account_id: UUID, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> BrokerAccountResponse:
    try:
        account = await owned_broker(db, principal.user.id, account_id)
    except BrokerSyncError as exc:
        raise _sync_error(exc) from exc
    if account.provider != "mock":
        raise HTTPException(status_code=501, detail=error_detail("broker_adapter_not_implemented", "Broker authorization is not implemented"))
    account.status = "connected"
    await db.commit()
    return await _account_response(db, account)


@router.post("/{account_id}/sync", response_model=SyncResultResponse, dependencies=[Depends(enforce_allowed_origin)])
async def sync_one(account_id: UUID, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> SyncResultResponse:
    try:
        return SyncResultResponse(**await sync_broker_account(db, principal.user.id, account_id))
    except BrokerSyncError as exc:
        raise _sync_error(exc) from exc


@router.delete("/{account_id}", response_model=DisconnectResponse, dependencies=[Depends(enforce_allowed_origin)])
async def disconnect_broker(account_id: UUID, principal: AuthenticatedPrincipal = Depends(get_current_principal), db: AsyncSession = Depends(get_db_session)) -> DisconnectResponse:
    try:
        retained, paused = await disconnect_broker_account(db, principal.user.id, account_id)
    except BrokerSyncError as exc:
        raise _sync_error(exc) from exc
    return DisconnectResponse(broker_account_id=account_id, retained_positions=retained, paused_tools=paused)
