"""Step 5: Uzbek TTS, one clip per translated segment, cached by hash(text+voice+settings)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

from . import audio_io
from .providers.base import TTSProvider
from .util import DiskCache, sha1


def synth_cached(provider: TTSProvider, cache: DiskCache, text: str) -> tuple[np.ndarray, int]:
    """Provider-native audio for ``text`` (mono float32, native rate), cached on disk."""
    p = cache.path("tts", sha1("tts", provider.cache_tag, text), "wav")
    if p.is_file():
        x, sr = sf.read(str(p), dtype="float32", always_2d=False)
        return x, sr
    x, sr = provider.synthesize(text)
    sf.write(str(p), x, sr, subtype="FLOAT")
    return x, sr


def synth_at(provider: TTSProvider, cache: DiskCache, text: str, sr_out: int) -> np.ndarray:
    """Cached TTS resampled to the lesson's sample rate."""
    x, sr = synth_cached(provider, cache, text)
    return audio_io.resample(x, sr, sr_out)


def run_tts(translations: dict, provider: TTSProvider, cache: DiskCache, sr_out: int, outdir: Path,
            progress=None) -> dict[str, str]:
    """Write ``tts/seg_XXXX.wav`` (original sample rate) for every translated segment."""
    outdir.mkdir(parents=True, exist_ok=True)
    files: dict[str, str] = {}
    items = translations["items"]
    for n, (idx, it) in enumerate(sorted(items.items(), key=lambda kv: int(kv[0]))):
        x = synth_at(provider, cache, it["uz"], sr_out)
        f = outdir / f"seg_{int(idx):04d}.wav"
        sf.write(str(f), x, sr_out, subtype="FLOAT")
        files[idx] = f.name
        if progress:
            progress(n + 1, len(items))
    return files
