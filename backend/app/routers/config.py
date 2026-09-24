"""Endpoints d'édition de la configuration Snort."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..controllers import get_controller
from ..models import RawConfig, SnortConfig

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("", response_model=SnortConfig)
def get_config():
    return get_controller().get_config()


@router.put("", response_model=SnortConfig)
def update_config(cfg: SnortConfig):
    try:
        return get_controller().update_config(cfg)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/raw", response_model=RawConfig)
def get_raw_config():
    content, path = get_controller().read_raw_config()
    return RawConfig(content=content, path=path)


@router.put("/raw", response_model=RawConfig)
def update_raw_config(payload: RawConfig):
    get_controller().write_raw_config(payload.content)
    content, path = get_controller().read_raw_config()
    return RawConfig(content=content, path=path)
