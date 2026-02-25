"""
Simple in-memory TTL cache for API responses.
Avoids repeated Google Drive / DB calls within the TTL window.
"""
import time
import threading
from typing import Any, Optional

_store: dict = {}
_lock = threading.Lock()


def get(key: str) -> Optional[Any]:
    """Return cached value if still within TTL, else None."""
    with _lock:
        entry = _store.get(key)
        if entry and time.time() < entry["expires_at"]:
            return entry["value"]
        return None


def set(key: str, value: Any, ttl: int = 60) -> None:
    """Store value with TTL in seconds (default 60s)."""
    with _lock:
        _store[key] = {"value": value, "expires_at": time.time() + ttl}


def invalidate(key: str) -> None:
    """Remove a cache entry (call after upload/delete)."""
    with _lock:
        _store.pop(key, None)


def invalidate_prefix(prefix: str) -> None:
    """Remove all entries whose key starts with prefix."""
    with _lock:
        keys = [k for k in _store if k.startswith(prefix)]
        for k in keys:
            del _store[k]
