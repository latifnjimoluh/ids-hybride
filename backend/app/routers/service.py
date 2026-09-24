"""Endpoints de contrôle du service Snort."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..controllers import get_controller
from ..models import RunOptions, ServiceAction, ServiceStatus

router = APIRouter(prefix="/api/service", tags=["service"])


@router.get("/status", response_model=ServiceStatus)
def status():
    return get_controller().service_status()


@router.get("/run-options", response_model=RunOptions)
def run_options():
    """Options d'exécution disponibles (modes, DAQ, modes d'alerte, tweaks)."""
    return RunOptions()


@router.post("/action", response_model=ServiceStatus)
def action(payload: ServiceAction):
    options = {
        "mode": payload.mode,
        "interface": payload.interface,
        "daq": payload.daq,
        "alert_mode": payload.alert_mode,
        "tweak": payload.tweak,
    }
    try:
        return get_controller().service_action(payload.action, options)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
