"""Small public-data cache shared by the API and worker processes."""
import hashlib
import json
import os
import time
from uuid import uuid4

import httpx

from .db import STORAGE


def public_json(url, params=None, ttl=3600):
    key = hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()
    directory = STORAGE / "public-cache"
    directory.mkdir(exist_ok=True)
    path = directory / f"{key}.json"
    try:
        if time.time() - path.stat().st_mtime < ttl:
            return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    response = httpx.get(url, params=params, timeout=httpx.Timeout(16, connect=5), follow_redirects=True)
    response.raise_for_status()
    value = response.json()
    if value.get("error"):
        raise ValueError(value.get("reason", "Fuente no disponible"))
    temporary = directory / f"{key}.{uuid4().hex}.tmp"
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return value
