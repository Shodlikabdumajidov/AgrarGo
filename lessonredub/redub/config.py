"""Configuration loading (YAML + .env) with deep-merge over the packaged defaults."""
from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config.yaml"


class Cfg:
    """Read-only attribute view over a nested dict: ``cfg.fitting.max_stretch``."""

    def __init__(self, data: dict[str, Any]):
        object.__setattr__(self, "_d", data)

    def __getattr__(self, key: str) -> Any:
        try:
            v = self._d[key]
        except KeyError as e:
            raise AttributeError(f"missing config key: {key}") from e
        return Cfg(v) if isinstance(v, dict) else v

    def __getitem__(self, key: str) -> Any:
        v = self._d[key]
        return Cfg(v) if isinstance(v, dict) else v

    def get(self, key: str, default: Any = None) -> Any:
        v = self._d.get(key, default)
        return Cfg(v) if isinstance(v, dict) else v

    def to_dict(self) -> dict[str, Any]:
        return copy.deepcopy(self._d)


def deep_merge(base: dict, over: dict) -> dict:
    """Return ``base`` with ``over`` merged recursively on top (no mutation)."""
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_env(path: str | Path | None = None) -> None:
    """Minimal .env loader (KEY=VALUE lines). Existing environment variables win."""
    p = Path(path) if path else PROJECT_ROOT / ".env"
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and v and k not in os.environ:
            os.environ[k] = v


def load_config(path: str | Path | None = None, overrides: dict | None = None) -> Cfg:
    """Load defaults, merge the user file and in-code overrides, and load .env."""
    load_env()
    data = yaml.safe_load(DEFAULT_CONFIG_PATH.read_text(encoding="utf-8"))
    if path:
        data = deep_merge(data, yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {})
    if overrides:
        data = deep_merge(data, overrides)
    return Cfg(data)


def require_env(name: str) -> str:
    """Fetch a required secret from the environment with a helpful error."""
    v = os.environ.get(name, "").strip()
    if not v:
        raise RuntimeError(
            f"Environment variable {name} is not set. Put it in .env (see .env.example) "
            f"or switch this provider to 'mock' in config.yaml."
        )
    return v
