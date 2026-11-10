from fastapi import APIRouter, HTTPException, status

from app.core.redis import (
    RedisConfigurationError,
    RedisOperationError,
    check_redis_connection,
)
from app.db.session import (
    DatabaseConfigurationError,
    DatabaseOperationError,
    check_database_connection,
)
from app.schemas.health import ExecutionHealthResponse, HealthResponse
from app.services.redis_store import get_worker_heartbeat

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(service="api", status="ok")


@router.get("/redis", response_model=HealthResponse)
async def redis_health() -> HealthResponse:
    try:
        await check_redis_connection()
    except RedisConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis is not configured",
        ) from exc
    except RedisOperationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis is unavailable",
        ) from exc
    return HealthResponse(service="redis", status="ok")


@router.get("/database", response_model=HealthResponse)
async def database_health() -> HealthResponse:
    try:
        await check_database_connection()
    except DatabaseConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not configured",
        ) from exc
    except DatabaseOperationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc
    return HealthResponse(service="database", status="ok")


@router.get("/execution", response_model=ExecutionHealthResponse)
async def execution_health() -> ExecutionHealthResponse:
    try:
        heartbeat = await get_worker_heartbeat()
    except (RedisConfigurationError, RedisOperationError):
        heartbeat = None
    worker_state = str(heartbeat.get("state", "running")) if heartbeat else None
    return ExecutionHealthResponse(
        status=("stopping" if worker_state == "stopping" else "ok") if heartbeat else "unavailable",
        last_heartbeat_at=str(heartbeat.get("at")) if heartbeat else None,
    )
