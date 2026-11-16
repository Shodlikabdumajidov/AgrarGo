"""HTTP helper for real providers: retry with exponential backoff + simple rate limiting."""
from __future__ import annotations

import random
import threading
import time
from typing import Callable

from ..util import log


class ProviderError(RuntimeError):
    """Non-retryable provider failure (bad key, bad request...)."""


class TransientError(RuntimeError):
    """Retryable failure (429 / 5xx / network)."""

    def __init__(self, msg: str, retry_after: float | None = None):
        super().__init__(msg)
        self.retry_after = retry_after


class RateLimiter:
    """Allow at most ``per_minute`` calls per minute (thread-safe, evenly spaced)."""

    def __init__(self, per_minute: float):
        self.interval = 60.0 / per_minute if per_minute and per_minute > 0 else 0.0
        self._next = 0.0
        self._lock = threading.Lock()

    def wait(self) -> None:
        if not self.interval:
            return
        with self._lock:
            now = time.monotonic()
            delay = max(0.0, self._next - now)
            self._next = max(now, self._next) + self.interval
        if delay:
            time.sleep(delay)


def retry_call(fn: Callable, retries: int = 5, base_delay: float = 1.5, max_delay: float = 60.0):
    """Call ``fn`` retrying on TransientError with exponential backoff + jitter."""
    attempt = 0
    while True:
        try:
            return fn()
        except TransientError as e:
            attempt += 1
            if attempt > retries:
                raise ProviderError(f"giving up after {retries} retries: {e}") from e
            delay = e.retry_after or min(max_delay, base_delay * 2 ** (attempt - 1))
            delay += random.uniform(0, 0.25 * delay)
            log.warning("transient provider error (%s); retry %d/%d in %.1fs", e, attempt, retries, delay)
            time.sleep(delay)


def post(url: str, *, headers: dict, limiter: RateLimiter, retries: int, json_body=None, data=None,
         files=None, timeout: float = 120.0):
    """POST with rate limit + retry. Returns the ``requests.Response`` (2xx only)."""
    import requests

    def once():
        limiter.wait()
        try:
            r = requests.post(url, headers=headers, json=json_body, data=data, files=files, timeout=timeout)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise TransientError(f"network error: {type(e).__name__}") from e
        if r.status_code in (429, 500, 502, 503, 504):
            ra = r.headers.get("retry-after")
            raise TransientError(f"HTTP {r.status_code}", float(ra) if ra and ra.replace(".", "").isdigit() else None)
        if not r.ok:
            raise ProviderError(f"HTTP {r.status_code}: {r.text[:400]}")  # body never contains our key
        return r

    return retry_call(once, retries=retries)
