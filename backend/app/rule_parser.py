"""Parsing minimal des règles Snort, partagé par les contrôleurs mock et Linux.

Une règle Snort ressemble à :
    alert tcp $EXTERNAL_NET any -> $HOME_NET 80 ( msg:"..."; sid:1000001; rev:1; )
Une règle désactivée est simplement commentée avec un `#` en début de ligne.
"""

from __future__ import annotations

import re
from typing import Optional

from .models import Rule

_SID_RE = re.compile(r"sid:\s*(\d+)")
_REV_RE = re.compile(r"rev:\s*(\d+)")
_MSG_RE = re.compile(r'msg:\s*"([^"]*)"')
_CLASS_RE = re.compile(r"classtype:\s*([\w\-]+)")
# Actions Snort valides en tête de règle
_ACTIONS = ("alert", "log", "pass", "drop", "reject", "sdrop", "block")


def parse_rule(line: str) -> Optional[Rule]:
    """Transforme une ligne texte en objet Rule, ou None si ce n'est pas une règle."""
    stripped = line.strip()
    if not stripped:
        return None

    enabled = True
    body = stripped
    # Ligne commentée => règle désactivée (mais on ignore les vrais commentaires)
    if body.startswith("#"):
        body = body.lstrip("#").strip()
        enabled = False

    tokens = body.split()
    if not tokens or tokens[0] not in _ACTIONS:
        return None  # commentaire libre, pas une règle

    sid_match = _SID_RE.search(body)
    if not sid_match:
        return None  # une règle sans sid n'est pas exploitable ici
    sid = int(sid_match.group(1))

    action = tokens[0]
    proto = tokens[1] if len(tokens) > 1 else "ip"
    msg_match = _MSG_RE.search(body)
    class_match = _CLASS_RE.search(body)
    rev_match = _REV_RE.search(body)

    return Rule(
        sid=sid,
        enabled=enabled,
        action=action,
        proto=proto,
        msg=msg_match.group(1) if msg_match else "",
        classtype=class_match.group(1) if class_match else None,
        rev=int(rev_match.group(1)) if rev_match else 1,
        raw=body,
    )


def build_rule(
    *,
    action: str,
    proto: str,
    source: str,
    sport: str,
    direction: str,
    dest: str,
    dport: str,
    msg: str,
    sid: int,
    rev: int = 1,
) -> str:
    """Construit une ligne de règle Snort à partir de champs séparés."""
    safe_msg = msg.replace('"', "'")
    return (
        f'{action} {proto} {source} {sport} {direction} {dest} {dport} '
        f'( msg:"{safe_msg}"; sid:{sid}; rev:{rev}; )'
    )


def set_enabled(raw: str, enabled: bool) -> str:
    """Retourne la ligne (dé)commentée selon l'état voulu."""
    clean = raw.lstrip("#").strip()
    return clean if enabled else f"# {clean}"
