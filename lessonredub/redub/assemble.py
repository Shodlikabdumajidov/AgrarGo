"""Step 7: sample-exact assembly. Only the replaced regions are touched (integer PCM arrays)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import audio_io


@dataclass
class Placement:
    index: int
    region_start: int      # padded Russian region [start, end)
    region_end: int
    clip_start: int        # = speech_start of the Russian segment
    clip: np.ndarray       # mono float32, already faded + loudness-matched

    @property
    def clip_end(self) -> int:
        return self.clip_start + len(self.clip)

    @property
    def zone(self) -> tuple[int, int]:
        """Everything this placement may modify: [region_start, max(region_end, clip_end))."""
        return self.region_start, max(self.region_end, self.clip_end)


def _edge_mask(length: int, region_len: int, taper: int) -> np.ndarray:
    """1 at the region's outer edges (ramping to 0 over ``taper`` samples), 0 inside,
    1 after ``region_len`` (overflow area keeps the original silence)."""
    m = np.zeros(length)
    taper = min(taper, region_len // 2)
    if taper > 0:
        r = 0.5 * (1 + np.cos(np.linspace(0, np.pi, taper, endpoint=False)))  # 1 -> ~0
        m[:taper] = r
        m[region_len - taper: region_len] = r[::-1]
    m[region_len:] = 1.0
    return m


def assemble(data: np.ndarray, subtype: str, sr: int, placements: list[Placement], fade_ms: float) -> np.ndarray:
    """Modify ``data`` (frames, ch integer PCM) IN PLACE and return it.

    Inside each Russian region the original is removed except for a short crossfade at the region
    edges (so there is no click against the untouched neighbouring samples), then the Uzbek clip is
    added starting at the segment's speech_start.
    """
    n = len(data)
    taper = int(fade_ms * sr / 1000)
    for p in sorted(placements, key=lambda q: q.region_start):
        lo, hi = p.zone
        hi = min(hi, n)
        if hi <= lo:
            continue
        mask = _edge_mask(hi - lo, p.region_end - p.region_start, taper)
        seg = data[lo:hi].astype(np.float64)          # integer units
        lim = float(2 ** (audio_io.SUBTYPES[subtype][1] - 1)) * (2 ** audio_io.SUBTYPES[subtype][2])
        add = np.zeros(hi - lo)
        a = p.clip_start - lo
        clip = p.clip[: max(0, hi - p.clip_start)]
        add[a: a + len(clip)] = clip.astype(np.float64) * lim
        mixed = seg * mask[:, None] + add[:, None]
        shift = audio_io.SUBTYPES[subtype][2]
        q = np.rint(mixed / (1 << shift)) * (1 << shift)
        info = np.iinfo(data.dtype)
        data[lo:hi] = np.clip(q, info.min, info.max).astype(data.dtype)
    return data
