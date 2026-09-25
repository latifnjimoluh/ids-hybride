"""Point d'entrée FastAPI du dashboard Snort (projet ids-hybride)."""

from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .auth import get_current_user
from .config import settings

# Répertoire du frontend buildé (npm run build). S'il existe, le backend
# sert lui-même l'interface : une seule URL/port pour l'API et l'UI (modèle
# appliance web, comme EveBox/Scirius pour Suricata).
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
from .routers import (
    alerts,
    auth,
    config,
    console,
    logs,
    ml,
    pcap,
    rules,
    service,
    system,
    ws,
)

app = FastAPI(
    title="IDS-Hybride, Dashboard Snort",
    description="API de pilotage de Snort : règles, alertes, service, configuration.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers publics (login) et temps réel (auth par token en query)
app.include_router(auth.router)
app.include_router(ws.router)

# Routers protégés : tout appel exige un JWT valide.
_protected = Depends(get_current_user)
app.include_router(rules.router, dependencies=[_protected])
app.include_router(alerts.router, dependencies=[_protected])
app.include_router(service.router, dependencies=[_protected])
app.include_router(config.router, dependencies=[_protected])
app.include_router(system.router, dependencies=[_protected])
app.include_router(pcap.router, dependencies=[_protected])
app.include_router(logs.router, dependencies=[_protected])
app.include_router(console.router, dependencies=[_protected])
app.include_router(ml.router, dependencies=[_protected])


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "backend": settings.backend, "version": app.version}


# --------------------------------------------------------------------------- #
# Service du frontend (SPA React) : monté APRÈS les routers pour que /api/*
# et le WebSocket restent prioritaires.
# --------------------------------------------------------------------------- #
if FRONTEND_DIST.is_dir():
    _assets = FRONTEND_DIST / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/", include_in_schema=False)
    async def _spa_root():
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa_fallback(full_path: str):
        # Ne pas masquer l'API : un chemin /api/* inconnu doit rester un 404 JSON.
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        # Sert un vrai fichier statique s'il existe, sinon l'index (routing SPA).
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
