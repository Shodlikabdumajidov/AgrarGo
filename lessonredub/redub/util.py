"""Small shared helpers: hashing, atomic JSON, disk cache, logging, time formatting."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

log = logging.getLogger("redub")


def setup_logging(verbose: bool = False) -> None:
    logging.basicConfig(
        level=logging.INFO if verbose else logging.WARNING,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )


def sha1(*parts: Any) -> str:
    """Stable hash of arbitrary JSON-able parts."""
    h = hashlib.sha1()
    for p in parts:
        h.update(json.dumps(p, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


def write_json(path: str | Path, obj: Any) -> None:
    """Atomic JSON write (temp file + replace) so a crash never leaves a half file."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    os.replace(tmp, p)


def read_json(path: str | Path, default: Any = None) -> Any:
    p = Path(path)
    if not p.is_file():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


class DiskCache:
    """Content-addressed cache directory (JSON and arbitrary files)."""

    def __init__(self, root: str | Path):
        self.root = Path(root)

    def path(self, ns: str, key: str, ext: str) -> Path:
        d = self.root / ns
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{key}.{ext}"

    def get_json(self, ns: str, key: str) -> Any | None:
        p = self.path(ns, key, "json")
        return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None

    def put_json(self, ns: str, key: str, obj: Any) -> None:
        write_json(self.path(ns, key, "json"), obj)


def fmt_ts(sec: float) -> str:
    """Seconds -> ``MM:SS.mmm`` (or ``H:MM:SS.mmm``)."""
    sec = max(0.0, float(sec))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:06.3f}" if h else f"{int(m):02d}:{s:06.3f}"


def parse_ts(text: str) -> float:
    """Parse ``SS``, ``MM:SS`` or ``H:MM:SS`` (decimals allowed) into seconds."""
    parts = [float(p) for p in re.split(r":", str(text).strip())]
    sec = 0.0
    for p in parts:
        sec = sec * 60 + p
    return sec
