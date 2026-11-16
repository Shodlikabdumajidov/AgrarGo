"""Step 6: time-fitting of a Uzbek clip into a Russian segment's slot (the critical step).

Order of attack for a clip of length T in a slot of length S:
  trim silence -> fits? place -> stretch <= max_stretch -> shorten text (<= N retries, re-TTS)
  -> max stretch + small overflow into following silence -> FAILED_FIT.
"""
from __future__ import annotations

import shutil
from dataclasses import dataclass
from typing import Callable

import numpy as np

from . import audio_io
from .config import Cfg
from .models import FitResult
from .util import log

try:  # BS.1770 integrated loudness (optional)
    import pyloudnorm as _pyln
except Exception:  # noqa: BLE001
    _pyln = None


# --------------------------------------------------------------------------- trimming / fades
def trim_silence(x: np.ndarray, sr: int, thr_db: float, keep_ms: float) -> np.ndarray:
    """Cut leading/trailing samples below ``thr_db`` relative to the clip peak (keeps a small margin)."""
    if len(x) == 0:
        return x
    peak = float(np.max(np.abs(x)))
    if peak <= 0:
        return x[:0]
    idx = np.flatnonzero(np.abs(x) > peak * 10 ** (thr_db / 20))
    keep = int(keep_ms * sr / 1000)
    return x[max(0, idx[0] - keep): idx[-1] + 1 + keep]


def apply_fades(x: np.ndarray, sr: int, fade_ms: float) -> np.ndarray:
    """Raised-cosine fade in/out (never longer than half the clip)."""
    n = min(int(fade_ms * sr / 1000), len(x) // 2)
    if n <= 0:
        return x
    y = x.copy()
    ramp = 0.5 * (1 - np.cos(np.linspace(0, np.pi, n)))
    y[:n] *= ramp
    y[-n:] *= ramp[::-1]
    return y


# --------------------------------------------------------------------------- time stretch
def _stretch_ffmpeg(x: np.ndarray, sr: int, factor: float) -> np.ndarray:
    p = audio_io.run([audio_io.FFMPEG, "-hide_banner", "-loglevel", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1",
                      "-i", "pipe:0", "-af", f"rubberband=tempo={factor:.6f}", "-f", "f32le", "-ar", str(sr),
                      "-ac", "1", "pipe:1"], input=x.astype("<f4").tobytes())
    return np.frombuffer(p.stdout, dtype="<f4").copy()


def _stretch_pyrb(x: np.ndarray, sr: int, factor: float) -> np.ndarray:
    import pyrubberband
    return pyrubberband.time_stretch(x, sr, factor).astype(np.float32)


def _stretch_wsola(x: np.ndarray, sr: int, factor: float) -> np.ndarray:
    """Pure-numpy WSOLA fallback (pitch preserving, lower quality than rubberband)."""
    n = int(0.032 * sr) // 2 * 2
    hs = n // 2
    ha = hs * factor
    delta = int(0.008 * sr)
    win = np.hanning(n + 1)[:-1]
    xp = np.concatenate([np.zeros(delta), x, np.zeros(n + delta + int(ha) + 2)])
    nout = int(len(x) / factor)
    frames = nout // hs + 2
    y = np.zeros(frames * hs + n)
    wsum = np.zeros_like(y)
    prev = delta
    for k in range(frames):
        pos = int(round(k * ha)) + delta
        if k == 0:
            best = pos
        else:
            target = xp[prev + hs: prev + hs + n]
            lo = max(0, pos - delta)
            cand = xp[lo: pos + delta + n]
            if len(cand) < n + 1 or len(target) < n:
                best = pos
            else:
                # sliding dot-product via correlate (valid)
                corr = np.correlate(cand, target, mode="valid")
                best = lo + int(np.argmax(corr))
        fr = xp[best: best + n]
        if len(fr) < n:
            fr = np.pad(fr, (0, n - len(fr)))
        y[k * hs: k * hs + n] += fr * win
        wsum[k * hs: k * hs + n] += win
        prev = best
    wsum[wsum < 1e-6] = 1.0
    return (y / wsum)[:nout].astype(np.float32)


def available_backend(pref: str) -> str:
    """Resolve 'auto' to the best installed time-stretch backend."""
    if pref != "auto":
        return pref
    try:
        p = audio_io.run([audio_io.FFMPEG, "-hide_banner", "-filters"])
        if b"rubberband" in p.stdout:
            return "ffmpeg"
    except Exception:  # noqa: BLE001
        pass
    if shutil.which("rubberband"):
        try:
            import pyrubberband  # noqa: F401
            return "pyrubberband"
        except Exception:  # noqa: BLE001
            pass
    log.warning("no rubberband available; using the lower-quality WSOLA fallback")
    return "wsola"


def time_stretch(x: np.ndarray, sr: int, factor: float, backend: str) -> np.ndarray:
    """Speed up by ``factor`` (>1 = shorter) keeping pitch."""
    if abs(factor - 1.0) < 1e-4:
        return x
    fn = {"ffmpeg": _stretch_ffmpeg, "pyrubberband": _stretch_pyrb, "wsola": _stretch_wsola}[backend]
    return fn(x.astype(np.float32), sr, factor)


# --------------------------------------------------------------------------- loudness
def active_rms_db(x: np.ndarray, sr: int) -> float:
    """RMS (dBFS) over frames within 25 dB of the loudest frame (ignores pauses)."""
    fr = max(1, int(0.02 * sr))
    n = len(x) // fr
    if n == 0:
        return float(10 * np.log10(np.mean(np.square(x, dtype=np.float64)) + 1e-12))
    e = np.mean(np.square(x[: n * fr].astype(np.float64)).reshape(n, fr), axis=1)
    db = 10 * np.log10(e + 1e-12)
    keep = db > db.max() - 25
    return float(10 * np.log10(np.mean(10 ** (db[keep] / 10)) + 1e-12))


def level_pair(ref: np.ndarray, clip: np.ndarray, sr: int) -> tuple[float, float, str]:
    """Measure both signals with the same method: LUFS if both long enough, else active RMS."""
    if _pyln is not None and min(len(ref), len(clip)) >= int(0.45 * sr):
        try:
            m = _pyln.Meter(sr)
            a, b = m.integrated_loudness(ref.astype(np.float64)), m.integrated_loudness(clip.astype(np.float64))
            if np.isfinite(a) and np.isfinite(b):
                return float(a), float(b), "lufs"
        except Exception:  # noqa: BLE001
            pass
    return active_rms_db(ref, sr), active_rms_db(clip, sr), "rms"


def match_loudness(clip: np.ndarray, ref: np.ndarray | None, sr: int, cfg: Cfg) -> tuple[np.ndarray, float]:
    """Scale ``clip`` to the loudness of ``ref`` (the replaced Russian speech). Returns (clip, gain_db)."""
    if len(clip) == 0:
        return clip, 0.0
    gain = 0.0
    if cfg.loudness.match and ref is not None and len(ref) > 0 and np.max(np.abs(ref)) > 1e-5:
        a, b, _ = level_pair(ref, clip, sr)
        lim = float(cfg.loudness.max_gain_db)
        gain = float(np.clip(a - b, -lim, lim))
    y = clip * np.float32(10 ** (gain / 20))
    peak = float(np.max(np.abs(y)))
    lim_peak = float(cfg.loudness.peak_limit)
    if peak > lim_peak:
        g2 = lim_peak / peak
        y = y * np.float32(g2)
        gain += 20 * np.log10(g2)
    return y.astype(np.float32), gain


# --------------------------------------------------------------------------- the fitting logic
@dataclass
class FitContext:
    sr: int
    slot: int                    # samples available from speech_start to region end
    overflow_room: int           # extra samples allowed beyond the slot (>=0)
    ref_audio: np.ndarray | None  # original Russian speech (mono float) for loudness matching
    backend: str
    index: int = 0


def _stretch_to(x: np.ndarray, sr: int, target: int, backend: str, max_factor: float) -> tuple[np.ndarray, float]:
    """Stretch so len(x) <= target (one corrective pass). Returns (clip, factor_used)."""
    f = len(x) / target
    y = time_stretch(x, sr, f, backend)
    if len(y) > target:  # rubberband can overshoot by a few samples: correct once
        f2 = f * len(y) / target
        if f2 <= max_factor * 1.02:
            y, f = time_stretch(x, sr, f2, backend), f2
    return y[:target], f


def fit_segment(ctx: FitContext, uz_text: str, synth: Callable[[str], np.ndarray],
                shorten: Callable[[str, int], str] | None, cfg: Cfg) -> tuple[FitResult, np.ndarray | None]:
    """Fit TTS audio for ``uz_text`` into the slot. Returns (result, final mono float clip or None)."""
    f, sr = cfg.fitting, ctx.sr
    margin = int(f.slot_margin_ms * sr / 1000)
    s_max = max(1, ctx.slot - margin)
    res = FitResult(index=ctx.index, slot_s=ctx.slot / sr, uz_text=uz_text)
    text = uz_text
    first = True
    clip = np.zeros(0, np.float32)
    max_f = float(f.max_stretch)

    while True:
        clip = trim_silence(synth(text), sr, float(f.trim_threshold_db), float(f.trim_keep_ms))
        if first:
            res.tts_s, first = len(clip) / sr, False
        t = len(clip)
        if t == 0:
            res.status, res.note = "FAILED_FIT", "TTS returned silence"
            return res, None
        if t <= s_max:
            final, res.status = clip, ("SHORTENED" if res.retries else "OK")
            break
        if t / s_max <= max_f:
            final, factor = _stretch_to(clip, sr, s_max, ctx.backend, max_f)
            res.stretch = factor
            res.status = "SHORTENED" if res.retries else "STRETCHED"
            break
        if res.retries < int(f.max_retries) and shorten is not None:
            # aim for text that needs a bit less than the max stretch
            target = max(4, int(len(text) * (s_max * max_f * 0.92) / t))
            new = shorten(text, target)
            res.retries += 1
            if new and new != text:
                text = new
            continue
        # last resort: max stretch, then maybe spill into the following silence
        stretched = time_stretch(clip, sr, max_f, ctx.backend)
        extra = len(stretched) - s_max
        res.stretch = max_f
        if f.allow_overflow and extra <= ctx.overflow_room:
            final, res.status, res.overflow_s = stretched, "OVERFLOW", max(0, extra) / sr
            break
        res.status = "FAILED_FIT"
        res.note = f"needs {len(stretched) / sr:.2f}s at {max_f}x, slot {ctx.slot / sr:.2f}s (+{ctx.overflow_room / sr:.2f}s room)"
        if f.failed_fit_action == "truncate":
            final = stretched[:s_max]
            res.flags.append("TRUNCATED")
            break
        res.uz_text = text
        return res, None

    final, res.gain_db = match_loudness(final, ctx.ref_audio, sr, cfg)
    final = apply_fades(final, sr, float(cfg.assemble.fade_ms))
    res.uz_text, res.final_s = text, len(final) / sr
    return res, final
