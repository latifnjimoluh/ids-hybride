"""Point d'entrée FastAPI du dashboard Snort (projet ids-hybride)."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fastapi import Depends

from .auth import get_current_user
from .config import settings
from .routers import (
    alerts,
    auth,
    config,
    console,
    logs,
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


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "backend": settings.backend, "version": app.version}
