"""Transcription providers: LocalWhisper (faster-whisper), OpenAIWhisperAPI, Mock."""
from __future__ import annotations

import io
import json
import os
from pathlib import Path

import numpy as np
import soundfile as sf

from ..config import Cfg, require_env
from ..util import log
from .base import AsrResult, TranscriptionProvider
from .http import RateLimiter, post

NAME_TO_CODE = {"russian": "ru", "english": "en"}


def restrict(probs: dict[str, float], candidates: list[str]) -> dict[str, float]:
    """Keep only candidate languages and renormalise (so p(ru)+p(en)=1)."""
    sub = {c: float(probs.get(c, 0.0)) for c in candidates}
    tot = sum(sub.values())
    return {c: (v / tot if tot > 0 else 1.0 / len(candidates)) for c, v in sub.items()}


class LocalWhisperASR(TranscriptionProvider):
    """faster-whisper; per-segment language-ID restricted to ru/en, then forced-language transcription."""

    name = "local"

    def __init__(self, cfg: Cfg):
        self.c = cfg.asr
        self._model = None
        self.device, self.compute, self.model_name = self._pick()

    def _pick(self) -> tuple[str, str, str]:
        dev = self.c.device
        if dev == "auto":
            try:
                import ctranslate2
                dev = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
            except Exception:  # noqa: BLE001
                dev = "cpu"
        compute = self.c.compute_type
        if compute == "auto":
            compute = "float16" if dev == "cuda" else "int8"
        model = self.c.model_gpu if dev == "cuda" else self.c.model_cpu
        log.info("faster-whisper: model=%s device=%s compute=%s", model, dev, compute)
        return dev, compute, model

    @property
    def cache_tag(self) -> str:
        return f"local:{self.model_name}:{self.c.beam_size}"

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel
            self._model = WhisperModel(self.model_name, device=self.device, compute_type=self.compute)
        return self._model

    def process(self, audio, sr, info, forced_lang):
        m = self._load()
        cands = list(self.c.candidates)
        probs: dict[str, float] = {}
        lang = forced_lang
        if lang is None:
            # transcribe() is a lazy generator: language detection happens up-front, decoding does not.
            _, det = m.transcribe(audio, language=None, beam_size=1)
            allp = dict(det.all_language_probs) if getattr(det, "all_language_probs", None) else {det.language: det.language_probability}
            probs = restrict(allp, cands)
            lang = max(probs, key=probs.get)
        segs, _ = m.transcribe(audio, language=lang, beam_size=int(self.c.beam_size), vad_filter=False,
                               condition_on_previous_text=False, temperature=0.0)
        text = " ".join(s.text.strip() for s in segs).strip()
        return AsrResult(lang=lang, probs=probs or {lang: 1.0}, text=text)


class OpenAIWhisperAPI(TranscriptionProvider):
    """OpenAI /v1/audio/transcriptions. One call per segment (language reported by the API)."""

    name = "openai"

    def __init__(self, cfg: Cfg):
        self.c = cfg.asr
        self.limiter = RateLimiter(cfg.asr.requests_per_minute)
        self.retries = int(cfg.asr.retries)
        self.url = "https://api.openai.com/v1/audio/transcriptions"

    @property
    def cache_tag(self) -> str:
        return f"openai:{self.c.openai_model}"

    def _call(self, audio: np.ndarray, sr: int, language: str | None) -> dict:
        key = require_env("OPENAI_API_KEY")  # >>> INSERT API KEY HERE (.env -> OPENAI_API_KEY)
        buf = io.BytesIO()
        sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
        data = {"model": self.c.openai_model, "response_format": "verbose_json"}
        if language:
            data["language"] = language
        r = post(self.url, headers={"Authorization": f"Bearer {key}"}, limiter=self.limiter,
                 retries=self.retries, data=data, files={"file": ("seg.wav", buf.getvalue(), "audio/wav")})
        return r.json()

    def process(self, audio, sr, info, forced_lang):
        from ..step_asr import script_of

        cands = list(self.c.candidates)
        if forced_lang:
            j = self._call(audio, sr, forced_lang)
            return AsrResult(lang=forced_lang, probs={forced_lang: 1.0}, text=j.get("text", "").strip())
        j = self._call(audio, sr, None)
        det = NAME_TO_CODE.get(str(j.get("language", "")).lower(), str(j.get("language", "")).lower())
        text = j.get("text", "").strip()
        if det not in cands:  # API guessed another language: decide by script, then redo forced
            det = {"ru": "ru", "en": "en"}.get(script_of(text, 0.5)[0], cands[-1])
            text = self._call(audio, sr, det).get("text", "").strip()
        return AsrResult(lang=det, probs={det: 0.9, **{c: 0.1 for c in cands if c != det}}, text=text)


class MockASR(TranscriptionProvider):
    """Offline: language/text come from a JSON fixture [{start,end,lang,text}] matched by overlap.

    Without a fixture it alternates ru/en (starting with ru) so the flow can be exercised on real files.
    """

    name = "mock"

    def __init__(self, cfg: Cfg, fixture: list | str | Path | None = None):
        if fixture is None:
            fixture = cfg.mock.asr_fixture
        if isinstance(fixture, (str, Path)):
            p = Path(fixture)
            fixture = json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None
        self.fixture = fixture

    @property
    def cache_tag(self) -> str:
        from ..util import sha1
        return "mock:" + sha1(self.fixture)

    def process(self, audio, sr, info, forced_lang):
        s0, s1, idx = info["start_s"], info["end_s"], info["index"]
        best, best_ov = None, 0.0
        for f in self.fixture or []:
            ov = min(s1, f["end"]) - max(s0, f["start"])
            if ov > best_ov:
                best, best_ov = f, ov
        if best is not None:
            lang, text = best["lang"], best.get("text", "")
        else:
            lang = "ru" if idx % 2 == 0 else "en"
            text = f"тестовая фраза номер {idx}" if lang == "ru" else f"test phrase number {idx}"
        if forced_lang and forced_lang != lang:
            lang, text = forced_lang, (text if best is None else f"[{forced_lang}] {text}")
        return AsrResult(lang=lang, probs={lang: 0.99, **{c: 0.01 for c in ("ru", "en") if c != lang}}, text=text)


def make_asr(cfg: Cfg, fixture=None) -> TranscriptionProvider:
    kind = cfg.providers.asr
    if kind == "local":
        return LocalWhisperASR(cfg)
    if kind == "openai":
        return OpenAIWhisperAPI(cfg)
    if kind == "mock":
        return MockASR(cfg, fixture)
    raise ValueError(f"unknown asr provider '{kind}'")
