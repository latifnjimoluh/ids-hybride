"""Authentification JWT du dashboard.

- Hachage des mots de passe via PBKDF2 (stdlib, aucune dépendance native).
- Tokens JWT signés (HS256) via PyJWT.
- Magasin d'utilisateurs simple persisté en JSON, initialisé avec un compte
  admin par défaut (à changer en production).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .config import MOCK_DATA_DIR, settings

_USERS_FILE = MOCK_DATA_DIR / "users.json"
_ALGO = "HS256"
_PBKDF2_ROUNDS = 200_000

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# --------------------------------------------------------------------------- #
# Hachage de mot de passe (PBKDF2-HMAC-SHA256)
# --------------------------------------------------------------------------- #
def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"{salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), _PBKDF2_ROUNDS)
    return hmac.compare_digest(candidate.hex(), hash_hex)


# --------------------------------------------------------------------------- #
# Magasin d'utilisateurs
# --------------------------------------------------------------------------- #
def _load_users() -> dict:
    MOCK_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not _USERS_FILE.exists():
        users = {settings.admin_user: {"password": hash_password(settings.admin_password)}}
        _USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")
        return users
    return json.loads(_USERS_FILE.read_text(encoding="utf-8"))


def authenticate(username: str, password: str) -> bool:
    users = _load_users()
    user = users.get(username)
    return bool(user) and verify_password(password, user["password"])


def change_password(username: str, new_password: str) -> None:
    users = _load_users()
    if username not in users:
        raise KeyError(username)
    users[username]["password"] = hash_password(new_password)
    _USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")


# --------------------------------------------------------------------------- #
# JWT
# --------------------------------------------------------------------------- #
def create_token(username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + timedelta(minutes=settings.token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGO)


def decode_token(token: str) -> str:
    """Retourne le username ; lève ValueError si le token est invalide/expiré."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGO])
        return payload["sub"]
    except (jwt.PyJWTError, KeyError) as exc:
        raise ValueError(str(exc))


# --------------------------------------------------------------------------- #
# Dépendances FastAPI
# --------------------------------------------------------------------------- #
def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    try:
        return decode_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )
