"""Endpoint de consultation des logs Snort."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..controllers import get_controller
from ..models import LogsResponse

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=LogsResponse)
def logs(lines: int = Query(200, ge=1, le=2000)):
    return get_controller().tail_logs(lines)
