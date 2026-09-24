"""Console Snort intégrée : exécution de commandes d'introspection (lecture seule)."""

from __future__ import annotations

from fastapi import APIRouter

from ..controllers import get_controller
from ..models import ConsoleCommand, ConsoleResult

router = APIRouter(prefix="/api/console", tags=["console"])

# Suggestions de commandes affichées dans l'UI
COMMANDS = [
    {"cmd": "snort -V", "desc": "Version et bibliothèques"},
    {"cmd": "snort --daq-list", "desc": "Modules DAQ disponibles"},
    {"cmd": "snort --list-interfaces", "desc": "Interfaces réseau"},
    {"cmd": "snort --list-plugins", "desc": "Tous les plugins"},
    {"cmd": "snort --show-plugins", "desc": "Détail des plugins"},
    {"cmd": "snort --list-gids", "desc": "Generator IDs"},
    {"cmd": "snort --list-builtin", "desc": "Règles intégrées"},
    {"cmd": "snort --help-module http_inspect", "desc": "Aide d'un module"},
    {"cmd": "snort --help", "desc": "Aide générale"},
]


@router.get("/commands")
def commands():
    return COMMANDS


@router.post("/run", response_model=ConsoleResult)
def run(payload: ConsoleCommand):
    return get_controller().run_console(payload.command)
