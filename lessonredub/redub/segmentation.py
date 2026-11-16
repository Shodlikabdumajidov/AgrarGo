"""Step 2: VAD segmentation (Silero / faster-whisper VAD / energy fallback) + merge/split/pad."""
from __future__ import annotations

import numpy as np

from .config import Cfg
from .models import Segment
from .util import log

SR16 = 16000


def _energy_vad(x: np.ndarray, c: Cfg) -> list[tuple[int, int]]:
    """Frame-energy VAD with an adaptive noise floor. Returns (start, end) at 16 kHz."""
    win, hop = int(0.02 * SR16), int(0.01 * SR16)
    if len(x) < win:
        return []
    sq = np.concatenate([[0.0], np.cumsum(x.astype(np.float64) ** 2)])
    starts = np.arange(0, len(x) - win + 1, hop)
    e = (sq[starts + win] - sq[starts]) / win
    db = 10 * np.log10(e + 1e-12)
    thr = max(np.percentile(db, 10) + c.segmentation.energy.margin_db, c.segmentation.energy.floor_db)
    act = db > thr
    out, i, n = [], 0, len(act)
    while i < n:
        if act[i]:
            j = i
            while j + 1 < n and act[j + 1]:
                j += 1
            out.append((int(starts[i]), int(starts[j] + win)))
            i = j + 1
        else:
            i += 1
    return out


def _silero_vad(x: np.ndarray, c: Cfg) -> list[tuple[int, int]]:
    import torch
    from silero_vad import get_speech_timestamps, load_silero_vad

    s = c.segmentation
    ts = get_speech_timestamps(
        torch.from_numpy(x.astype(np.float32)), load_silero_vad(), sampling_rate=SR16,
        threshold=s.threshold, min_speech_duration_ms=int(s.min_speech_s * 1000),
        min_silence_duration_ms=int(s.min_silence_s * 1000), speech_pad_ms=0)
    return [(int(t["start"]), int(t["end"])) for t in ts]


def _fw_vad(x: np.ndarray, c: Cfg) -> list[tuple[int, int]]:
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    s = c.segmentation
    opts = VadOptions(threshold=s.threshold, min_speech_duration_ms=int(s.min_speech_s * 1000),
                      min_silence_duration_ms=int(s.min_silence_s * 1000), speech_pad_ms=0)
    return [(int(t["start"]), int(t["end"])) for t in get_speech_timestamps(x.astype(np.float32), opts)]


def detect_speech(x16: np.ndarray, c: Cfg) -> list[tuple[int, int]]:
    """Run the configured VAD backend; ``auto`` tries silero, faster_whisper, then energy."""
    order = {"auto": ["silero", "faster_whisper", "energy"]}.get(c.segmentation.backend, [c.segmentation.backend])
    fns = {"silero": _silero_vad, "faster_whisper": _fw_vad, "energy": _energy_vad}
    last: Exception | None = None
    for name in order:
        try:
            r = fns[name](x16, c)
            log.info("VAD backend '%s' -> %d raw segments", name, len(r))
            return r
        except Exception as e:  # noqa: BLE001 - fall through to the next backend
            last = e
            log.warning("VAD backend '%s' unavailable (%s)", name, e)
    raise RuntimeError(f"no VAD backend worked: {last}")


def _merge(spans: list[tuple[int, int]], gap: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for s, e in sorted(spans):
        if out and s - out[-1][1] < gap:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def _split_long(spans: list[tuple[int, int]], x: np.ndarray, max_len: int) -> list[tuple[int, int]]:
    """Split spans longer than max_len at the quietest 50 ms window in the last 40% of the allowed length."""
    out: list[tuple[int, int]] = []
    w = int(0.05 * SR16)
    for s, e in spans:
        while e - s > max_len:
            lo, hi = s + int(max_len * 0.6), s + max_len
            seg = np.abs(x[lo:hi]).astype(np.float64)
            if len(seg) <= w:
                cut = hi
            else:
                energy = np.convolve(seg ** 2, np.ones(w) / w, mode="valid")
                cut = lo + int(np.argmin(energy)) + w // 2
            out.append((s, cut))
            s = cut
        out.append((s, e))
    return out


def build_segments(x16: np.ndarray, sr: int, n_samples: int, c: Cfg) -> list[Segment]:
    """VAD -> merge close gaps -> drop blips -> split long -> pad -> Segment list at original sr."""
    s = c.segmentation
    spans = _merge(detect_speech(x16, c), int(s.merge_gap_s * SR16))
    spans = [(a, b) for a, b in spans if (b - a) >= int(s.min_speech_s * SR16)]
    spans = _split_long(spans, x16, int(s.max_segment_s * SR16))
    k = sr / SR16
    sp = [(min(n_samples, int(round(a * k))), min(n_samples, int(round(b * k)))) for a, b in spans]
    pad = int(round(s.pad_s * sr))
    segs: list[Segment] = []
    for i, (a, b) in enumerate(sp):
        prev_end = sp[i - 1][1] if i else 0
        next_start = sp[i + 1][0] if i + 1 < len(sp) else n_samples
        pb = min(pad, (a - prev_end) // 2 if i else a)
        pa = min(pad, (next_start - b) // 2 if i + 1 < len(sp) else n_samples - b)
        segs.append(Segment(i, sr, a, b, a - max(pb, 0), b + max(pa, 0)))
    return segs
