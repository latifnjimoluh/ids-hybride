"""Endpoints du module ML (détection d'anomalies)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..controllers import get_controller
from ..ml.detector import detector

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/status")
def status():
    return detector.status()


@router.post("/train")
def train():
    alerts = get_controller().list_alerts(1000)
    try:
        return detector.train(alerts)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/anomalies")
def anomalies(limit: int = Query(300, ge=1, le=1000)):
    st = detector.status()
    if not st["installed"]:
        raise HTTPException(status_code=400, detail="scikit-learn non installé.")
    if not st["trained"]:
        raise HTTPException(status_code=400, detail="Modèle non entraîné. Lancez l'entraînement d'abord.")

    alerts = get_controller().list_alerts(limit)
    scored = detector.score(alerts)
    scored.sort(key=lambda x: x["anomaly_score"], reverse=True)

    items = []
    for it in scored:
        a = it["alert"]
        items.append({
            "timestamp": a.timestamp.isoformat(),
            "msg": a.msg,
            "priority": a.priority,
            "proto": a.proto,
            "src_addr": a.src_addr,
            "dst_addr": a.dst_addr,
            "sid": a.sid,
            "anomaly_score": round(it["anomaly_score"], 4),
            "is_anomaly": it["is_anomaly"],
        })
    return {
        "total": len(items),
        "anomalies": sum(1 for i in items if i["is_anomaly"]),
        "items": items,
    }
