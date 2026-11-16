#!/usr/bin/env python3
"""lessonredub CLI:  estimate | process | report | preview

Examples
  python main.py estimate lessons/
  python main.py process lessons/lesson01.mp3
  python main.py process lessons/ --asr local --translate mock --tts mock
  python main.py report lessons/
  python main.py preview lessons/lesson01.mp3 --at 12:34 --span 6
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from redub.config import load_config
from redub.util import fmt_ts, parse_ts, read_json, setup_logging, write_json


def _cfg(a):
    over = {}
    prov = {k: getattr(a, k) for k in ("asr", "translate", "tts") if getattr(a, k, None)}
    if prov:
        over["providers"] = prov
    if getattr(a, "work_dir", None):
        over.setdefault("paths", {})["work_dir"] = a.work_dir
    if getattr(a, "out_dir", None):
        over.setdefault("paths", {})["output_dir"] = a.out_dir
    return load_config(a.config, over)


def cmd_estimate(a) -> int:
    from redub import cost
    cfg = _cfg(a)
    from redub import audio_io
    audio_io.set_binaries(cfg.paths.ffmpeg, cfg.paths.ffprobe)
    rows, tot = cost.estimate_many(a.path, cfg)
    print(cost.format_table(rows, tot, cfg))
    return 0


def cmd_process(a) -> int:
    from tqdm import tqdm
    from redub import cost
    from redub.pipeline import FilePipeline, FileResult, Providers

    cfg = _cfg(a)
    files = cost.list_audio(a.path)
    if not files:
        print("no audio files found")
        return 1
    print(f"providers: {cfg.providers.to_dict()} | {len(files)} file(s)")
    providers = Providers(cfg)                      # share models/clients across the batch
    results: list[FileResult] = []
    bar = tqdm(files, unit="file", desc="lessons")
    for f in bar:
        t0 = time.time()

        def prog(step, done, total, _f=f):
            bar.set_postfix_str(f"{_f.name}: {step} {done}/{total}")

        try:
            r = FilePipeline(f, cfg, providers=providers, progress=prog).run(force_from=a.force_from)
        except Exception as e:  # noqa: BLE001 - one bad file must not kill the batch
            r = FileResult(f.stem, "ERROR", error=f"{type(e).__name__}: {e}", seconds=time.time() - t0)
            tqdm.write(f"ERROR {f.name}: {e}")
        results.append(r)
    _summary(results, cfg)
    write_json(Path(cfg.paths.work_dir) / "batch_summary.json", [r.__dict__ for r in results])
    return 0 if all(r.status == "PASS" for r in results) else 2


def _summary(results, cfg) -> None:
    print("\n" + "=" * 78 + "\nSUMMARY")
    print(f"{'file':32} {'result':7} {'attn':>4} {'secs':>6}  statuses")
    for r in results:
        print(f"{r.file[:32]:32} {r.status:7} {r.attention:4d} {r.seconds:6.1f}  {r.counts if r.status != 'ERROR' else r.error}")
    ok = sum(r.status == "PASS" for r in results)
    print(f"\n{ok}/{len(results)} PASS, {sum(r.status == 'FAIL' for r in results)} FAIL, "
          f"{sum(r.status == 'ERROR' for r in results)} ERROR, {sum(r.attention for r in results)} segments need attention")
    print(f"Reports: {cfg.paths.work_dir}/<file>/report.html")


def cmd_report(a) -> int:
    from redub import cost
    from redub.report import render_html
    cfg = _cfg(a)
    root = Path(cfg.paths.work_dir)
    stems = [f.stem for f in cost.list_audio(a.path)] if Path(a.path).exists() else [Path(a.path).name]
    bad = 0
    for stem in stems:
        rep = read_json(root / stem / "report.json")
        if rep is None:
            print(f"{stem}: no report yet")
            continue
        (root / stem / "report.html").write_text(render_html(rep), encoding="utf-8")
        print(f"\n{stem}: {rep['qa']['result']}  {rep['counts']}  -> {root / stem / 'report.html'}")
        for item in rep["attention"]:
            print(f"   #{item['index']:<3} {fmt_ts(item['start_s'])}  {item['status']:<14} {item['why']}")
        bad += rep["qa"]["result"] != "PASS"
    return 2 if bad else 0


def cmd_preview(a) -> int:
    from redub.preview import make_preview
    from redub import audio_io
    cfg = _cfg(a)
    audio_io.set_binaries(cfg.paths.ffmpeg, cfg.paths.ffprobe)
    paths = make_preview(a.file, cfg, parse_ts(a.at), a.span, out_dir=a.preview_dir)
    for k, p in paths.items():
        print(f"{k}: {p}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="lessonredub", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-v", "--verbose", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p, providers=True):
        p.add_argument("--config", help="extra YAML merged over config.yaml")
        p.add_argument("--work-dir")
        p.add_argument("--out-dir")
        if providers:
            p.add_argument("--asr", choices=["local", "openai", "mock"])
            p.add_argument("--translate", choices=["claude", "openai", "mock"])
            p.add_argument("--tts", choices=["elevenlabs", "azure", "mock"])

    p = sub.add_parser("estimate", help="estimate TTS chars / ASR minutes / tokens / cost for a file or folder")
    p.add_argument("path"); common(p); p.set_defaults(fn=cmd_estimate)
    p = sub.add_parser("process", help="run the pipeline on a file or folder (resumable)")
    p.add_argument("path"); common(p)
    p.add_argument("--force-from", choices=["load", "segment", "asr", "translate", "tts", "fit", "assemble", "qa"],
                   help="rerun this step and everything after it")
    p.set_defaults(fn=cmd_process)
    p = sub.add_parser("report", help="print attention items / regenerate report.html")
    p.add_argument("path", help="audio file, folder of audio files, or lesson stem"); common(p, False); p.set_defaults(fn=cmd_report)
    p = sub.add_parser("preview", help="export an A/B snippet (original vs processed) around a time")
    p.add_argument("file"); p.add_argument("--at", required=True, help="e.g. 754 or 12:34")
    p.add_argument("--span", type=float, default=6.0); p.add_argument("--preview-dir", default="preview")
    common(p, False); p.set_defaults(fn=cmd_preview)

    a = ap.parse_args(argv)
    setup_logging(a.verbose)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
