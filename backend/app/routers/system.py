"""Endpoints d'introspection système (équivalents snort -V / --list-*)."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..controllers import get_controller
from ..models import DaqModule, NetworkInterface, Plugin, SystemInfo

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/info", response_model=SystemInfo)
def system_info():
    return get_controller().system_info()


@router.get("/interfaces", response_model=list[NetworkInterface])
def interfaces():
    return get_controller().list_interfaces()


@router.get("/daqs", response_model=list[DaqModule])
def daqs():
    return get_controller().list_daqs()


@router.get("/plugins", response_model=list[Plugin])
def plugins(kind: str = Query("", description="Filtre par type : inspector, codec, logger…")):
    return get_controller().list_plugins(kind)
