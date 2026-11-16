"""Step 3: per-segment language ID (ru vs en only) + forced-language transcription + script check."""
from __future__ import annotations

from dataclasses import asdict
from typing import Callable

import numpy as np

from .config import Cfg
from .models import AsrOutcome, Segment
from .providers.base import TranscriptionProvider
from .util import DiskCache, log, sha1

SR16 = 16000


def script_of(text: str, thr: float) -> tuple[str, float]:
    """Classify a transcript by letters: ('ru'|'en'|'mixed'|'none', cyrillic_share)."""
    cyr = sum("Ѐ" <= ch <= "ӿ" for ch in text)
    lat = sum(ch.isalpha() and ch < "ɐ" for ch in text)
    tot = cyr + lat
    if tot == 0:
        return "none", 0.0
    r = cyr / tot
    if r >= thr:
        return "ru", r
    if 1 - r >= thr:
        return "en", r
    return "mixed", r


def decide(res_lang: str, probs: dict, text: str, c: Cfg) -> tuple[str, bool, str, list]:
    """Combine probabilities + script check -> (lang, uncertain, script, flags)."""
    flags: list[str] = []
    script, cyr_share = script_of(text, c.asr.script_threshold)
    lang = res_lang
    uncertain = False
    if not text.strip() or script == "none":
        return "other", False, script, ["NO_SPEECH_TEXT"]
    if len(probs) >= 2:
        vals = sorted(probs.values(), reverse=True)
        if vals[0] - vals[1] < c.asr.min_margin:
            uncertain = True
            flags.append("LOW_LANG_MARGIN")
    if script in ("ru", "en") and script != lang:
        uncertain = True
        flags.append("SCRIPT_DISAGREES")
    minority = min(cyr_share, 1 - cyr_share)
    if minority >= c.asr.mixed_ratio:
        flags.append("MIXED_SCRIPT")
    if uncertain:
        flags.append("UNCERTAIN_LANG")
    return lang, uncertain, script, flags


def run_asr(segs: list[Segment], x16: np.ndarray, cfg: Cfg, provider: TranscriptionProvider, cache: DiskCache,
            lang_overrides: dict[int, str], progress: Callable[[int, int], None] | None = None) -> list[AsrOutcome]:
    """Transcribe every segment independently (never language-detect the whole file)."""
    out: list[AsrOutcome] = []
    pad = int(cfg.asr.context_pad_s * SR16)
    for n, s in enumerate(segs):
        a = max(0, int(s.speech_start_s * SR16) - pad)
        b = min(len(x16), int(s.speech_end_s * SR16) + pad)
        audio = np.ascontiguousarray(x16[a:b])
        forced = lang_overrides.get(s.index)
        key = sha1(provider.cache_tag, forced, list(cfg.asr.candidates),
                   hash_audio(audio), s.index if provider.name == "mock" else None)
        hit = cache.get_json("asr", key)
        if hit is None:
            r = provider.process(audio, SR16, {"index": s.index, "start_s": s.speech_start_s, "end_s": s.speech_end_s}, forced)
            hit = {"lang": r.lang, "probs": r.probs, "text": r.text}
            cache.put_json("asr", key, hit)
        if forced:
            script, _ = script_of(hit["text"], cfg.asr.script_threshold)
            o = AsrOutcome(s.index, forced, hit["text"], hit["probs"], script, False, ["LANG_OVERRIDE"], True)
        else:
            lang, unc, script, flags = decide(hit["lang"], hit["probs"], hit["text"], cfg)
            o = AsrOutcome(s.index, lang, hit["text"], hit["probs"], script, unc, flags)
        out.append(o)
        if progress:
            progress(n + 1, len(segs))
    log.info("ASR: %d ru, %d en, %d other, %d uncertain", sum(o.lang == "ru" for o in out),
             sum(o.lang == "en" for o in out), sum(o.lang == "other" for o in out), sum(o.uncertain for o in out))
    return out


def hash_audio(a: np.ndarray) -> str:
    import hashlib
    return hashlib.sha1(np.round(a * 32767).astype(np.int16).tobytes()).hexdigest()


def outcomes_to_json(o: list[AsrOutcome]) -> list[dict]:
    return [asdict(x) for x in o]


def outcomes_from_json(rows: list[dict]) -> list[AsrOutcome]:
    return [AsrOutcome(**r) for r in rows]
