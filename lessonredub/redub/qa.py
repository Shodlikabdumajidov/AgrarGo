"""Step 8: verification of the output against the original (hard requirements) -> PASS/FAIL."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

from . import audio_io


def _equal(a_path: Path, b_path: Path, lo: int, hi: int, dtype: str) -> bool:
    if hi <= lo:
        return True
    a, _ = sf.read(str(a_path), start=lo, stop=hi, dtype=dtype, always_2d=True)
    b, _ = sf.read(str(b_path), start=lo, stop=hi, dtype=dtype, always_2d=True)
    return a.shape == b.shape and np.array_equal(a, b)


def verify(orig_wav: Path, out_wav: Path, zones: list[tuple[int, int]], kept: list[tuple[int, int, int]],
           clips: list[tuple[int, int, int]], mp3: Path | None, n_expected: int) -> dict:
    """Run all hard checks.

    zones: [lo,hi) ranges the pipeline was allowed to modify. kept: (index,start,end) of segments left
    original. clips: (index,start,end) of inserted Uzbek clips.
    """
    io, oo = audio_io.wav_info(orig_wav), audio_io.wav_info(out_wav)
    dtype = audio_io.SUBTYPES[io["subtype"]][0]
    checks: dict[str, dict] = {}

    def add(name: str, ok: bool, detail: str = "") -> None:
        checks[name] = {"ok": bool(ok), "detail": detail}

    add("sample_rate_equal", io["sr"] == oo["sr"], f"{io['sr']} vs {oo['sr']}")
    add("channels_equal", io["channels"] == oo["channels"], f"{io['channels']} vs {oo['channels']}")
    add("sample_count_equal", io["frames"] == oo["frames"] == n_expected,
        f"original={io['frames']} output={oo['frames']}")

    zs = sorted(zones)
    gaps, prev = [], 0
    for lo, hi in zs:
        gaps.append((prev, lo))
        prev = max(prev, hi)
    gaps.append((prev, io["frames"]))
    outside_ok = all(_equal(orig_wav, out_wav, a, b, dtype) for a, b in gaps)
    add("outside_replaced_zones_bit_identical", outside_ok, f"{len(gaps)} ranges compared")

    bad = [i for i, a, b in kept if not _equal(orig_wav, out_wav, a, b, dtype)]
    add("kept_segments_bit_identical", not bad, f"{len(kept)} kept segments; mismatching: {bad}" if bad else f"{len(kept)} kept segments")

    cs = sorted(clips, key=lambda c: c[1])
    overlap = [(a[0], b[0]) for a, b in zip(cs, cs[1:]) if a[2] > b[1]]
    hit_kept = [(c[0], k[0]) for c in cs for k in kept if c[1] < k[2] and k[1] < c[2]]
    add("no_clip_overlap", not overlap, f"overlapping pairs: {overlap}" if overlap else f"{len(cs)} clips")
    add("no_clip_touches_kept_segment", not hit_kept, f"clip/kept pairs: {hit_kept}" if hit_kept else "ok")

    if mp3 is not None and mp3.is_file():
        d = audio_io.decoded_frames(mp3)
        add("mp3_decoded_length_equal", d == io["frames"], f"decoded={d} original={io['frames']}")
    passed = all(c["ok"] for c in checks.values())
    return {"result": "PASS" if passed else "FAIL", "checks": checks}
