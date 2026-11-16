"""Build a fake 60 s mixed-language lesson from tones with KNOWN Russian/English regions."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf

# (start_s, end_s, lang, text). Chosen to exercise: segment at t=0 and at file end, very short slot,
# fits / needs stretch / needs shortening / cannot fit, English right after a short gap.
SCHEDULE = [
    (0.00, 2.00, "ru", "Скажите привет"),                      # starts at sample 0
    (5.00, 7.00, "en", "Hello, how are you"),
    (9.00, 11.00, "ru", "А теперь скажите: как дела"),
    (15.00, 17.50, "en", "How are you today"),
    (18.40, 20.40, "ru", "Теперь вы можете сказать это сами"),  # shortish gap before, longer text
    (25.00, 26.00, "en", "Fine, thanks"),
    (27.50, 29.00, "ru", "Очень хорошо, продолжайте говорить дальше"),  # long text, short slot
    (36.00, 38.00, "en", "I would like a coffee"),
    (38.60, 39.20, "ru", "Да"),                                # tiny slot
    (44.00, 46.50, "en", "A coffee please"),
    (48.00, 50.00, "ru", "Повторите за мной"),
    (53.00, 55.00, "en", "Thank you very much"),
    (57.50, 60.00, "ru", "Это конец урока, спасибо"),          # touches end of file
]
DURATION = 60.0


def _voice(dur: float, sr: int, f0: float, rate: float) -> np.ndarray:
    t = np.arange(int(dur * sr)) / sr
    env = (0.5 * (1 - np.cos(2 * np.pi * rate * t))) ** 0.6
    y = sum(np.sin(2 * np.pi * f0 * k * t + k) / k for k in (1, 2, 3, 4)) * env * 0.35
    n = int(0.02 * sr)
    y[:n] *= np.linspace(0, 1, n)
    y[-n:] *= np.linspace(1, 0, n)
    return y


def build(path: str | Path, sr: int = 44100, channels: int = 2, subtype: str = "PCM_16", seed: int = 3) -> dict:
    """Write the fake lesson WAV and an ASR fixture JSON next to it; return the schedule info."""
    rng = np.random.default_rng(seed)
    n = int(DURATION * sr)
    x = rng.standard_normal(n) * 10 ** (-72 / 20)          # faint noise floor in the "silences"
    for s, e, lang, _ in SCHEDULE:
        a, b = int(s * sr), min(n, int(e * sr))
        v = _voice((b - a) / sr, sr, 180.0 if lang == "ru" else 330.0, 3.3 if lang == "ru" else 4.4)
        x[a:b] += v[: b - a] * (1.0 if lang == "ru" else 0.6)
    x = np.clip(x, -1, 1)
    data = np.stack([x, x * 0.9], axis=1) if channels == 2 else x[:, None]
    p = Path(path)
    sf.write(str(p), data, sr, subtype=subtype)
    fixture = [{"start": s, "end": e, "lang": lang, "text": text} for s, e, lang, text in SCHEDULE]
    fx = p.with_suffix(".asr.json")
    fx.write_text(json.dumps(fixture, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"wav": p, "fixture": fx, "schedule": SCHEDULE, "sr": sr, "n": n}
