"""Per-file pipeline orchestration: resumable, fingerprinted steps with on-disk artifacts.

Public API for a future web app::

    cfg = load_config("config.yaml")
    result = FilePipeline("lesson01.mp3", cfg).run()
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
import soundfile as sf

from . import audio_io
from .assemble import Placement, assemble
from .config import Cfg
from .fitting import FitContext, available_backend, fit_segment
from .models import AsrOutcome, FitResult, Segment
from .plan import PlanItem, build_plan
from .providers import make_asr, make_translator, make_tts
from .qa import verify
from .report import build_report, save_report
from .segmentation import build_segments
from .step_asr import outcomes_from_json, outcomes_to_json, run_asr
from .step_translate import build_item, run_translate, shorten_cached
from .step_tts import run_tts, synth_at
from .util import DiskCache, log, read_json, sha1, write_json

STEPS = ["load", "segment", "asr", "translate", "tts", "fit", "assemble", "qa"]
ProgressFn = Callable[[str, int, int], None]


@dataclass
class FileResult:
    file: str
    status: str                       # PASS | FAIL | ERROR
    output_wav: str | None = None
    output_mp3: str | None = None
    counts: dict = field(default_factory=dict)
    attention: int = 0
    seconds: float = 0.0
    error: str | None = None


class Providers:
    """Lazy provider container (so `report`/`preview` never need keys or models)."""

    def __init__(self, cfg: Cfg):
        self.cfg = cfg
        self._asr = self._tr = self._tts = None

    @property
    def asr(self):
        self._asr = self._asr or make_asr(self.cfg)
        return self._asr

    @property
    def translator(self):
        self._tr = self._tr or make_translator(self.cfg)
        return self._tr

    @property
    def tts(self):
        self._tts = self._tts or make_tts(self.cfg)
        return self._tts


class FilePipeline:
    def __init__(self, src: str | Path, cfg: Cfg, work_root: str | Path | None = None,
                 out_dir: str | Path | None = None, providers: Providers | None = None,
                 progress: ProgressFn | None = None):
        self.src = Path(src)
        self.cfg = cfg
        self.stem = self.src.stem
        self.wd = Path(work_root or cfg.paths.work_dir) / self.stem
        self.out_dir = Path(out_dir or cfg.paths.output_dir)
        self.wd.mkdir(parents=True, exist_ok=True)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.cache = DiskCache(cfg.paths.cache_dir)
        self.providers = providers or Providers(cfg)
        self.progress = progress
        audio_io.set_binaries(cfg.paths.ffmpeg, cfg.paths.ffprobe)
        self.state: dict = read_json(self.wd / "state.json", {})
        self.out_wav = self.out_dir / f"{self.stem}_uz.wav"
        self.out_mp3 = self.out_dir / f"{self.stem}_uz.mp3"

    # ------------------------------------------------------------------ overrides / fingerprints
    def overrides(self) -> dict:
        """overrides.json: {"segments": {"12": {"language": "ru|en", "uzbek": "...", "skip": true}}}"""
        return (read_json(self.wd / "overrides.json", {}) or {}).get("segments", {})

    def _fps(self) -> dict[str, str]:
        c, ov = self.cfg, self.overrides()
        st = self.src.stat()
        lang_ov = {k: v.get("language") for k, v in ov.items() if v.get("language")}
        fx = c.mock.asr_fixture
        fx_hash = sha1(Path(fx).read_bytes().hex()) if fx and Path(fx).is_file() else None
        f: dict[str, str] = {}
        f["load"] = sha1(str(self.src.resolve()), st.st_size, int(st.st_mtime))
        f["segment"] = sha1(f["load"], c.segmentation.to_dict())
        f["asr"] = sha1(f["segment"], c.asr.to_dict(), c.providers.asr, fx_hash, lang_ov)
        f["translate"] = sha1(f["asr"], c.translate.to_dict(), c.providers.translate, ov,
                              c.asr.uncertain_policy, c.fitting.min_replace_s)
        f["tts"] = sha1(f["translate"], c.tts.to_dict(), c.providers.tts)
        f["fit"] = sha1(f["tts"], c.fitting.to_dict(), c.loudness.to_dict(), c.assemble.fade_ms)
        f["assemble"] = sha1(f["fit"], c.assemble.to_dict())
        f["qa"] = sha1(f["assemble"], "qa1")
        return f

    def _outputs(self, step: str) -> list[Path]:
        wd = self.wd
        return {
            "load": [wd / "source.json", wd / "analysis_16k.wav"],
            "segment": [wd / "segments.json"],
            "asr": [wd / "transcripts.json"],
            "translate": [wd / "translations.json"],
            "tts": [wd / "tts.json"],
            "fit": [wd / "fit.json"],
            "assemble": [self.out_wav, wd / "assemble.json"] + ([self.out_mp3] if self.cfg.assemble.mp3 else []),
            "qa": [wd / "report.json", wd / "report.html"],
        }[step]

    def _prog(self, step: str, done: int, total: int) -> None:
        if self.progress:
            self.progress(step, done, total)

    # ------------------------------------------------------------------ driver
    def run(self, force_from: str | None = None) -> FileResult:
        t0 = time.time()
        fps = self._fps()
        forced = False
        for step in STEPS:
            forced = forced or step == force_from
            fresh = (not forced and self.state.get(step) == fps[step]
                     and all(p.is_file() for p in self._outputs(step)))
            if fresh:
                log.info("[%s] %s: up to date, skipped", self.stem, step)
                self._prog(step, 1, 1)
                continue
            log.info("[%s] %s: running", self.stem, step)
            getattr(self, f"_step_{step}")()
            self.state[step] = fps[step]
            write_json(self.wd / "state.json", self.state)
            self._prog(step, 1, 1)
        rep = read_json(self.wd / "report.json")
        return FileResult(self.stem, rep["qa"]["result"], str(self.out_wav),
                          str(self.out_mp3) if self.cfg.assemble.mp3 else None, rep["counts"],
                          len(rep["attention"]), time.time() - t0)

    # ------------------------------------------------------------------ artifact accessors
    def _source(self) -> dict:
        return read_json(self.wd / "source.json")

    def _segments(self) -> list[Segment]:
        return [Segment(**{k: r[k] for k in ("index", "speech_start", "speech_end", "start", "end")}, sr=self._source()["sr"])
                for r in read_json(self.wd / "segments.json")["segments"]]

    def _asr(self) -> list[AsrOutcome]:
        return outcomes_from_json(read_json(self.wd / "transcripts.json"))

    def _plan(self) -> list[PlanItem]:
        return build_plan(self._segments(), self._asr(), self.overrides(), self.cfg)

    # ------------------------------------------------------------------ steps
    def _step_load(self) -> None:
        wav = audio_io.prepare_working_wav(self.src, self.wd)
        info = audio_io.wav_info(wav)
        audio_io.build_analysis_16k(wav, self.wd / "analysis_16k.wav")
        write_json(self.wd / "source.json", {"input": str(self.src), "working_wav": str(wav),
                                             "sr": info["sr"], "channels": info["channels"],
                                             "n_samples": info["frames"], "subtype": info["subtype"]})

    def _step_segment(self) -> None:
        src = self._source()
        x16 = audio_io.read_16k(self.wd / "analysis_16k.wav")
        segs = build_segments(x16, src["sr"], src["n_samples"], self.cfg)
        write_json(self.wd / "segments.json", {"sr": src["sr"], "n_samples": src["n_samples"],
                                               "segments": [s.to_json() for s in segs]})
        log.info("[%s] %d speech segments", self.stem, len(segs))

    def _step_asr(self) -> None:
        segs = self._segments()
        x16 = audio_io.read_16k(self.wd / "analysis_16k.wav")
        lang_ov = {int(k): v["language"] for k, v in self.overrides().items() if v.get("language")}
        out = run_asr(segs, x16, self.cfg, self.providers.asr, self.cache, lang_ov,
                      lambda d, t: self._prog("asr", d, t))
        write_json(self.wd / "transcripts.json", outcomes_to_json(out))

    def _step_translate(self) -> None:
        segs, asr = self._segments(), self._asr()
        plan = build_plan(segs, asr, self.overrides(), self.cfg)
        write_json(self.wd / "plan.json", [asdict(p) for p in plan])
        res = run_translate(segs, asr, plan, self.overrides(), self.cfg, self.providers.translator, self.cache,
                            lambda d, t: self._prog("translate", d, t))
        write_json(self.wd / "translations.json", res)

    def _step_tts(self) -> None:
        tr = read_json(self.wd / "translations.json")
        files = run_tts(tr, self.providers.tts, self.cache, self._source()["sr"], self.wd / "tts",
                        lambda d, t: self._prog("tts", d, t))
        write_json(self.wd / "tts.json", files)

    def _ref_audio(self, seg: Segment) -> np.ndarray:
        src = self._source()
        data, _, sub = audio_io.read_pcm(src["working_wav"], seg.speech_start, seg.speech_end)
        return audio_io.mono_of(data, sub)

    def _step_fit(self) -> None:
        cfg, src = self.cfg, self._source()
        sr, n = src["sr"], src["n_samples"]
        segs, asr = self._segments(), self._asr()
        plan = build_plan(segs, asr, self.overrides(), cfg)
        tr = read_json(self.wd / "translations.json")["items"]
        translator, tts = self.providers.translator, self.providers.tts
        backend = available_backend(cfg.fitting.stretch_backend)
        (self.wd / "fit").mkdir(exist_ok=True)
        min_gap = int(cfg.fitting.overflow_min_gap_s * sr)
        results: list[dict] = []
        todo = [p for p in plan if p.action == "replace"]
        for k, p in enumerate(todo):
            i = p.index
            seg, item = segs[i], tr[str(i)]
            nxt = segs[i + 1] if i + 1 < len(segs) else None
            limit = n if nxt is None else min(nxt.start, nxt.speech_start - min_gap)
            room = max(0, limit - seg.end) if cfg.fitting.allow_overflow else 0
            ctx = FitContext(sr, seg.end - seg.speech_start, room, self._ref_audio(seg), backend, i)
            ti = build_item(i, segs, asr, cfg)
            res, clip = fit_segment(
                ctx, item["uz"],
                lambda t: synth_at(tts, self.cache, t, sr),
                lambda t, mc: shorten_cached(translator, self.cache, ti, t, mc, cfg.translate.apostrophe),
                cfg)
            res.flags = sorted(set(res.flags + asr[i].flags))
            if clip is not None:
                f = self.wd / "fit" / f"seg_{i:04d}.wav"
                sf.write(str(f), clip, sr, subtype="FLOAT")
                res.clip_file = f.name
            results.append(asdict(res))
            self._prog("fit", k + 1, len(todo))
        write_json(self.wd / "fit.json", results)

    def _step_assemble(self) -> None:
        cfg, src = self.cfg, self._source()
        sr, sub, n = src["sr"], src["subtype"], src["n_samples"]
        segs, plan = self._segments(), self._plan()
        fits = {r["index"]: r for r in read_json(self.wd / "fit.json")}
        data, _, _ = audio_io.read_pcm(src["working_wav"])
        placements: list[Placement] = []
        for i, r in fits.items():
            if not r.get("clip_file"):
                continue  # FAILED_FIT with keep_original: Russian stays untouched
            clip, _ = sf.read(str(self.wd / "fit" / r["clip_file"]), dtype="float32")
            s = segs[i]
            placements.append(Placement(i, s.start, s.end, s.speech_start, clip))
        assemble(data, sub, sr, placements, float(cfg.assemble.fade_ms))
        assert len(data) == n, "assembly changed the sample count"
        audio_io.write_pcm(self.out_wav, data, sr, sub)
        del data
        if cfg.assemble.mp3:
            audio_io.encode_mp3(self.out_wav, self.out_mp3, cfg.assemble.mp3_bitrate)
        placed = {p.index for p in placements}
        write_json(self.wd / "assemble.json", {
            "zones": [list(p.zone) for p in placements],
            "clips": [[p.index, p.clip_start, min(p.clip_end, n)] for p in placements],
            "kept": [[s.index, s.start, s.end] for s in segs if s.index not in placed],
        })

    def _step_qa(self) -> None:
        src = self._source()
        a = read_json(self.wd / "assemble.json")
        qa = verify(Path(src["working_wav"]), self.out_wav, [tuple(z) for z in a["zones"]],
                    [tuple(k) for k in a["kept"]], [tuple(c) for c in a["clips"]],
                    self.out_mp3 if self.cfg.assemble.mp3 else None, src["n_samples"])
        rows = self._report_rows()
        meta = {"sr": src["sr"], "channels": src["channels"], "n_samples": src["n_samples"],
                "providers": self.cfg.providers.to_dict(), "output_wav": str(self.out_wav)}
        rep = build_report(self.stem, meta, rows, qa)
        save_report(self.wd, rep)
        log.info("[%s] QA %s | %s | attention: %d", self.stem, qa["result"], rep["counts"], len(rep["attention"]))

    def _report_rows(self) -> list[dict]:
        segs, asr, plan = self._segments(), self._asr(), self._plan()
        tr = read_json(self.wd / "translations.json")["items"]
        fits = {r["index"]: r for r in read_json(self.wd / "fit.json")}
        rows = []
        for s, a, p in zip(segs, asr, plan):
            fr = fits.get(s.index)
            row = {"index": s.index, "start_s": s.speech_start_s, "end_s": s.end_s, "lang": a.lang,
                   "slot_s": (s.end - s.speech_start) / s.sr, "tts_s": 0.0, "final_s": 0.0, "stretch": 1.0,
                   "retries": 0, "overflow_s": 0.0, "status": p.status, "flags": list(a.flags),
                   "ru_text": a.text if a.lang == "ru" else "", "uz_text": ""}
            if a.lang == "en":
                row["ru_text"] = a.text
            if fr:
                row.update({k: fr[k] for k in ("tts_s", "final_s", "stretch", "retries", "overflow_s", "status", "flags", "uz_text")})
                row["slot_s"] = fr["slot_s"]
                row["note"] = fr.get("note", "")
            rows.append(row)
        return rows
