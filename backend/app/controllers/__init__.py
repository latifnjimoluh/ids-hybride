"""Fabrique de contrôleur Snort selon la configuration (mock | linux)."""

from __future__ import annotations

from functools import lru_cache

from ..config import settings
from .base import SnortController


@lru_cache
def get_controller() -> SnortController:
    """Retourne l'instance unique du contrôleur adapté au backend choisi."""
    if settings.backend == "linux":
        from .linux import LinuxSnortController

        return LinuxSnortController()

    from .mock import MockSnortController

    return MockSnortController()
