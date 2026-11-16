"""A/B preview: export a few seconds around a timestamp, original vs processed."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

from . import audio_io
from .config import Cfg
from .util import read_json


def make_preview(src: str | Path, cfg: Cfg, at_s: float, span_s: float = 6.0, work_root: str | Path | None = None,
                 out_dir: str | Path = "preview") -> dict[str, Path]:
    """Write <stem>_<t>_A_original.wav, _B_processed.wav and _AB.wav (A, 0.6 s silence, B)."""
    src = Path(src)
    wd = Path(work_root or cfg.paths.work_dir) / src.stem
    meta = read_json(wd / "source.json")
    if meta is None:
        raise SystemExit(f"{src.name} has not been processed yet (no {wd}). Run `process` first.")
    out_wav = Path(cfg.paths.output_dir) / f"{src.stem}_uz.wav"
    if not out_wav.is_file():
        raise SystemExit(f"processed file missing: {out_wav}")
    sr = meta["sr"]
    a = max(0, int((at_s - span_s / 2) * sr))
    b = min(meta["n_samples"], int((at_s + span_s / 2) * sr))
    orig, _, sub = audio_io.read_pcm(meta["working_wav"], a, b)
    proc, _, _ = audio_io.read_pcm(out_wav, a, b)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    tag = f"{src.stem}_{int(at_s)}s"
    paths = {"A": out / f"{tag}_A_original.wav", "B": out / f"{tag}_B_processed.wav", "AB": out / f"{tag}_AB.wav"}
    audio_io.write_pcm(paths["A"], orig, sr, sub)
    audio_io.write_pcm(paths["B"], proc, sr, sub)
    gap = np.zeros((int(0.6 * sr), orig.shape[1]), dtype=orig.dtype)
    audio_io.write_pcm(paths["AB"], np.concatenate([orig, gap, proc]), sr, sub)
    return paths
