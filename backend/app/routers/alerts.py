"""Endpoints de visualisation des alertes."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..controllers import get_controller
from ..models import Alert, AlertStats

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[Alert])
def list_alerts(limit: int = Query(200, ge=1, le=1000)):
    return get_controller().list_alerts(limit)


@router.get("/stats", response_model=AlertStats)
def alert_stats():
    return get_controller().alert_stats()
