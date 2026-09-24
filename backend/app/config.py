"""Configuration centrale du backend.

Le choix du backend (`mock` ou `linux`) se fait via la variable
d'environnement SNORT_BACKEND. En dev sous Windows on reste en `mock` ;
sur une vraie sonde Linux on passe à `linux` sans toucher au frontend.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Racine du backend (…/backend)
BACKEND_ROOT = Path(__file__).resolve().parent.parent
# Données du mode mock (règles + alertes simulées)
MOCK_DATA_DIR = BACKEND_ROOT / "app" / "data"


class Settings(BaseSettings):
    """Paramètres lus depuis l'environnement (préfixe SNORT_)."""

    model_config = SettingsConfigDict(env_prefix="SNORT_", env_file=".env", extra="ignore")

    # "mock" (défaut, dev Windows) ou "linux" (vraie instance Snort)
    backend: str = "mock"

    # --- Chemins utilisés par le backend Linux ---
    snort_binary: str = "/usr/local/bin/snort"
    config_path: str = "/usr/local/etc/snort/snort.lua"
    rules_path: str = "/usr/local/etc/snort/rules/local.rules"
    alert_json_path: str = "/var/log/snort/alert_json.txt"
    service_name: str = "snort3"  # nom du service systemd
    interface: str = "eth0"

    # --- CORS : origines autorisées pour le frontend React ---
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # --- Authentification (JWT) ---
    # ⚠️ En production : définir SNORT_SECRET_KEY (aléatoire, long) et changer
    # les identifiants par défaut via SNORT_ADMIN_USER / SNORT_ADMIN_PASSWORD.
    secret_key: str = "dev-secret-change-me-in-production"
    token_expire_minutes: int = 720  # 12 h
    admin_user: str = "admin"
    admin_password: str = "admin"  # mot de passe initial (à changer)


settings = Settings()
