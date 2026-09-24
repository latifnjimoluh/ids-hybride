"""Flux d'alertes en temps réel via WebSocket.

Le client se connecte à /api/ws/alerts?token=<jwt>. Le serveur pousse les
nouvelles alertes au fil de l'eau (toutes les ~2 s). Authentification par
token JWT passé en paramètre de requête (les WebSockets ne portent pas
d'en-tête Authorization côté navigateur).
"""

from __future__ import annotations

import asyncio
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..auth import decode_token
from ..controllers import get_controller

router = APIRouter(tags=["ws"])

POLL_INTERVAL = 2.0  # secondes


@router.websocket("/api/ws/alerts")
async def ws_alerts(websocket: WebSocket, token: str = ""):
    # --- Authentification ---
    try:
        decode_token(token)
    except ValueError:
        await websocket.close(code=1008)  # policy violation
        return

    await websocket.accept()
    controller = get_controller()
    try:
        while True:
            # new_alerts() est synchrone : on l'exécute dans un thread pour ne
            # pas bloquer la boucle d'événements.
            alerts = await asyncio.to_thread(controller.new_alerts)
            for alert in alerts:
                await websocket.send_json(_serialize(alert))
            await asyncio.sleep(POLL_INTERVAL)
    except WebSocketDisconnect:
        pass
    except Exception:
        with suppress(Exception):
            await websocket.close()


def _serialize(alert) -> dict:
    data = alert.model_dump()
    data["timestamp"] = alert.timestamp.isoformat()
    return data
