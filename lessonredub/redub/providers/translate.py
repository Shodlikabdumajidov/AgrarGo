"""Translation providers (Russian -> spoken Uzbek, Latin script): Claude, OpenAI, Mock."""
from __future__ import annotations

import json
import re

from ..config import Cfg, require_env
from .base import TranslationItem, TranslationProvider
from .http import ProviderError, RateLimiter, post

PROMPT_VERSION = "v1"

SYSTEM = (
    "You are a professional translator and voice-over scriptwriter for a Pimsleur-style audio language "
    "course. A narrator gives instructions in Russian; the learner practises English phrases. You translate "
    "ONLY the narrator's Russian lines into natural, SPOKEN Uzbek (Latin script, modern official orthography, "
    "use the letters oʻ and gʻ). Rules:\n"
    "1. Keep every English target phrase exactly as written, in its original English, inside double quotes.\n"
    "2. Be short and conversational: each translation MUST NOT exceed its max_chars (it has to fit a fixed "
    "time slot). Prefer short natural phrasing over literal translation.\n"
    "3. The 'before'/'after' context lines show neighbouring lesson content ([en] = English phrase spoken in "
    "the lesson, [ru] = other narrator lines). Use them for meaning only; never translate or repeat them.\n"
    "4. Output ONLY JSON, no commentary."
)


def build_batch_prompt(items: list[TranslationItem]) -> str:
    payload = [{"id": i.id, "ru": i.ru, "before": i.before, "after": i.after, "max_chars": i.max_chars} for i in items]
    return ("Translate each item's 'ru' into Uzbek.\nReturn exactly this JSON shape: "
            '{"translations": [{"id": <int>, "uz": "<text>"}, ...]} with one entry per input id.\n\n'
            + json.dumps(payload, ensure_ascii=False))


def build_shorten_prompt(item: TranslationItem, current_uz: str, max_chars: int) -> str:
    return ("The Uzbek voice-over below is too long for its time slot. Rewrite it SHORTER (at most "
            f"{max_chars} characters) keeping the meaning and any quoted English phrases.\n"
            'Return only JSON: {"translations": [{"id": %d, "uz": "<text>"}]}\n\n' % item.id
            + json.dumps({"id": item.id, "ru": item.ru, "current_uz": current_uz, "max_chars": max_chars,
                          "before": item.before, "after": item.after}, ensure_ascii=False))


def parse_translations(text: str) -> dict[int, str]:
    """Robustly extract {id: uz} from a model reply (handles code fences / stray prose)."""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        obj = json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}|\[.*\]", t, re.S)
        if not m:
            raise ProviderError(f"model reply is not JSON: {text[:200]}") from None
        obj = json.loads(m.group(0))
    rows = obj.get("translations", []) if isinstance(obj, dict) else obj
    return {int(r["id"]): str(r["uz"]).strip() for r in rows}


class ClaudeTranslator(TranslationProvider):
    name = "claude"

    def __init__(self, cfg: Cfg):
        self.c = cfg.translate
        self.model = self.c.claude_model
        self.limiter = RateLimiter(self.c.requests_per_minute)

    @property
    def cache_tag(self) -> str:
        return f"claude:{self.model}:{PROMPT_VERSION}"

    def _ask(self, prompt: str) -> str:
        key = require_env("ANTHROPIC_API_KEY")  # >>> INSERT API KEY HERE (.env -> ANTHROPIC_API_KEY)
        body = {"model": self.model, "max_tokens": int(self.c.max_tokens), "system": SYSTEM,
                "messages": [{"role": "user", "content": prompt}]}
        if self.c.temperature is not None:
            body["temperature"] = float(self.c.temperature)
        r = post("https://api.anthropic.com/v1/messages",
                 headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                 limiter=self.limiter, retries=int(self.c.retries), json_body=body)
        return "".join(b.get("text", "") for b in r.json().get("content", []))

    def translate_batch(self, items):
        return parse_translations(self._ask(build_batch_prompt(items)))

    def shorten(self, item, current_uz, max_chars):
        return parse_translations(self._ask(build_shorten_prompt(item, current_uz, max_chars))).get(item.id, current_uz)


class OpenAITranslator(TranslationProvider):
    name = "openai"

    def __init__(self, cfg: Cfg):
        self.c = cfg.translate
        self.model = self.c.openai_model
        self.limiter = RateLimiter(self.c.requests_per_minute)

    @property
    def cache_tag(self) -> str:
        return f"openai:{self.model}:{PROMPT_VERSION}"

    def _ask(self, prompt: str) -> str:
        key = require_env("OPENAI_API_KEY")  # >>> INSERT API KEY HERE (.env -> OPENAI_API_KEY)
        body = {"model": self.model, "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]}
        if self.c.temperature is not None:
            body["temperature"] = float(self.c.temperature)
        r = post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {key}"},
                 limiter=self.limiter, retries=int(self.c.retries), json_body=body)
        return r.json()["choices"][0]["message"]["content"]

    def translate_batch(self, items):
        return parse_translations(self._ask(build_batch_prompt(items)))

    def shorten(self, item, current_uz, max_chars):
        return parse_translations(self._ask(build_shorten_prompt(item, current_uz, max_chars))).get(item.id, current_uz)


class MockTranslator(TranslationProvider):
    """Offline: ``[UZ] <russian>``. ``shorten`` drops trailing words (factor from config)."""

    name = "mock"

    def __init__(self, cfg: Cfg):
        self.factor = float(cfg.tts.mock.shorten_factor)

    @property
    def cache_tag(self) -> str:
        return f"mock:{self.factor}"

    def translate_batch(self, items):
        return {i.id: f"[UZ] {i.ru}" for i in items}

    def shorten(self, item, current_uz, max_chars):
        words = current_uz.split()
        target = max(1, int(len(current_uz) * self.factor))
        while len(words) > 1 and len(" ".join(words)) > target:
            words.pop()
        return " ".join(words)


def make_translator(cfg: Cfg) -> TranslationProvider:
    kind = cfg.providers.translate
    table = {"claude": ClaudeTranslator, "openai": OpenAITranslator, "mock": MockTranslator}
    if kind not in table:
        raise ValueError(f"unknown translate provider '{kind}'")
    return table[kind](cfg)
