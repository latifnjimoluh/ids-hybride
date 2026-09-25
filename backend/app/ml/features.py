"""Transformation des alertes Snort en vecteurs de features numériques."""

from __future__ import annotations

from datetime import datetime

from ..models import Alert

# Ordre des features (exposé à l'UI pour transparence)
FEATURE_NAMES = ["priority", "dst_port", "src_port", "hour", "is_tcp", "is_udp", "is_icmp"]


def alert_to_features(a: Alert) -> list[float]:
    proto = (a.proto or "").lower()
    hour = a.timestamp.hour if isinstance(a.timestamp, datetime) else 0
    return [
        float(a.priority or 3),
        float(a.dst_port or 0),
        float(a.src_port or 0),
        float(hour),
        1.0 if proto == "tcp" else 0.0,
        1.0 if proto == "udp" else 0.0,
        1.0 if proto == "icmp" else 0.0,
    ]


def alerts_to_matrix(alerts: list[Alert]) -> list[list[float]]:
    return [alert_to_features(a) for a in alerts]
