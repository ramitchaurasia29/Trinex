from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    service: str
    status: Literal["ok"]


class ExecutionHealthResponse(BaseModel):
    service: str = "paper-execution-worker"
    status: Literal["ok", "stopping", "unavailable"]
    mode: Literal["PAPER"] = "PAPER"
    provider: Literal["mock"] = "mock"
    last_heartbeat_at: str | None = None
