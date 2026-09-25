"""Détecteur d'anomalies (Isolation Forest, scikit-learn).

scikit-learn est importé paresseusement : le backend démarre même sans ML
installé, et les endpoints renvoient alors un message clair.
Le modèle est gardé en mémoire (ré-entraînable via l'API).
"""

from __future__ import annotations

import threading
from datetime import datetime

from ..models import Alert
from .features import FEATURE_NAMES, alerts_to_matrix

MIN_SAMPLES = 10


class AnomalyDetector:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._model = None
        self._scaler = None
        self._meta = {
            "trained": False,
            "n_samples": 0,
            "trained_at": None,
            "contamination": 0.05,
        }

    @staticmethod
    def available() -> bool:
        try:
            import sklearn  # noqa: F401
            return True
        except ImportError:
            return False

    def status(self) -> dict:
        return {"installed": self.available(), "features": FEATURE_NAMES, **self._meta}

    def train(self, alerts: list[Alert], contamination: float = 0.05) -> dict:
        if not self.available():
            raise RuntimeError("scikit-learn n'est pas installé (pip install scikit-learn).")
        from sklearn.ensemble import IsolationForest
        from sklearn.preprocessing import StandardScaler

        X = alerts_to_matrix(alerts)
        if len(X) < MIN_SAMPLES:
            raise ValueError(
                f"Pas assez de données pour entraîner ({len(X)} < {MIN_SAMPLES}). "
                "Générez plus de trafic (ping, requêtes web) puis réessayez."
            )
        with self._lock:
            self._scaler = StandardScaler().fit(X)
            Xs = self._scaler.transform(X)
            self._model = IsolationForest(
                n_estimators=200, contamination=contamination, random_state=42
            ).fit(Xs)
            self._meta = {
                "trained": True,
                "n_samples": len(X),
                "trained_at": datetime.now().isoformat(),
                "contamination": contamination,
            }
        return self.status()

    def score(self, alerts: list[Alert]) -> list[dict]:
        """Retourne pour chaque alerte un score d'anomalie (haut = plus anormal)
        et un drapeau is_anomaly."""
        with self._lock:
            if self._model is None:
                return []
            X = alerts_to_matrix(alerts)
            if not X:
                return []
            Xs = self._scaler.transform(X)
            # decision_function : haut = normal ; on inverse pour "score d'anomalie"
            raw = -self._model.decision_function(Xs)
            preds = self._model.predict(Xs)  # -1 = anomalie, 1 = normal
        return [
            {"alert": a, "anomaly_score": float(s), "is_anomaly": bool(p == -1)}
            for a, s, p in zip(alerts, raw, preds)
        ]


# Instance unique partagée par l'API
detector = AnomalyDetector()
