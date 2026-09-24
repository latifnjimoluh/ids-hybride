"""Endpoints de gestion des règles Snort."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..controllers import get_controller
from ..models import (
    ImportResult,
    Rule,
    RuleCategory,
    RuleCreate,
    RulesetImport,
    RuleToggle,
    ValidationResult,
)

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=list[Rule])
def list_rules():
    return get_controller().list_rules()


@router.get("/categories", response_model=list[RuleCategory])
def rule_categories():
    return get_controller().rule_categories()


@router.post("/import", response_model=ImportResult)
def import_ruleset(payload: RulesetImport):
    try:
        return get_controller().import_ruleset(payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("", response_model=Rule, status_code=201)
def create_rule(payload: RuleCreate):
    try:
        return get_controller().create_rule(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{sid}", response_model=Rule)
def update_rule(sid: int, payload: RuleCreate):
    if not payload.raw:
        raise HTTPException(status_code=400, detail="Le champ 'raw' est requis pour la mise à jour.")
    try:
        return get_controller().update_rule(sid, payload.raw)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/{sid}/toggle", response_model=Rule)
def toggle_rule(sid: int, payload: RuleToggle):
    try:
        return get_controller().toggle_rule(sid, payload.enabled)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/{sid}", status_code=204)
def delete_rule(sid: int):
    try:
        get_controller().delete_rule(sid)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/validate", response_model=ValidationResult)
def validate_rules():
    return get_controller().validate_rules()
