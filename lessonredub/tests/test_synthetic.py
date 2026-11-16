"""End-to-end synthetic test in mock mode.  Run:  python -m pytest tests -q   (or: python tests/test_synthetic.py)"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import synth  # noqa: E402
from redub import audio_io  # noqa: E402
from redub.config import load_config  # noqa: E402
from redub.pipeline import FilePipeline  # noqa: E402
from redub.util import read_json, write_json  # noqa: E402

CASES = [(44100, 2, "PCM_16"), (48000, 1, "PCM_16"), (44100, 2, "PCM_24")]


def make_cfg(tmp: Path, fixture: Path, **extra):
    over = {
        "providers": {"asr": "mock", "translate": "mock", "tts": "mock"},
        "paths": {"work_dir": str(tmp / "work"), "output_dir": str(tmp / "out"), "cache_dir": str(tmp / "cache")},
        "segmentation": {"backend": "energy"},
        "mock": {"asr_fixture": str(fixture)},
    }
    over.update(extra)
    return load_config(overrides=over)


@pytest.fixture(params=CASES, ids=lambda c: f"{c[0]}Hz-{c[1]}ch-{c[2]}")
def run(request, tmp_path):
    sr, ch, sub = request.param
    info = synth.build(tmp_path / "lesson.wav", sr, ch, sub)
    cfg = make_cfg(tmp_path, info["fixture"])
    pipe = FilePipeline(info["wav"], cfg)
    res = pipe.run()
    return info, cfg, pipe, res


def test_pipeline_end_to_end(run):
    info, cfg, pipe, res = run
    sr = info["sr"]
    orig, _ = sf.read(str(info["wav"]), dtype="int32", always_2d=True)
    out, out_sr = sf.read(str(pipe.out_wav), dtype="int32", always_2d=True)

    # (a) identical length / format
    assert out_sr == sr and out.shape == orig.shape
    # (b) English regions bit-identical (with a little guard band on each side)
    segs = read_json(pipe.wd / "segments.json")["segments"]
    asr = read_json(pipe.wd / "transcripts.json")
    n_en = 0
    for s, a in zip(segs, asr):
        if a["lang"] == "en":
            n_en += 1
            assert np.array_equal(orig[s["start"]:s["end"]], out[s["start"]:s["end"]]), f"English seg {s['index']} changed"
    assert n_en == sum(1 for x in synth.SCHEDULE if x[2] == "en")
    # everything outside the modified zones is untouched
    a = read_json(pipe.wd / "assemble.json")
    mask = np.ones(len(orig), bool)
    for lo, hi in a["zones"]:
        mask[lo:hi] = False
    assert np.array_equal(orig[mask], out[mask])
    # (c) no overlap between inserted clips, none inside a kept segment
    clips = sorted(a["clips"], key=lambda c: c[1])
    for c1, c2 in zip(clips, clips[1:]):
        assert c1[2] <= c2[1], "clips overlap"
    for _, cs, ce in clips:
        for _, ks, ke in a["kept"]:
            assert ce <= ks or cs >= ke, "clip touches a kept segment"
    # Russian regions really changed and Uzbek starts at the Russian segment's start
    ru_segs = [s for s, x in zip(segs, asr) if x["lang"] == "ru"]
    assert ru_segs
    fits = {r["index"]: r for r in read_json(pipe.wd / "fit.json")}
    placed = 0
    for s in ru_segs:
        if fits[s["index"]]["status"] == "FAILED_FIT":
            continue
        placed += 1
        reg = slice(s["speech_start"], s["speech_end"])
        assert not np.array_equal(orig[reg], out[reg])
        clip = next(c for c in clips if c[0] == s["index"])
        assert clip[1] == s["speech_start"] and clip[2] <= s["end"] + int(2 * sr) and clip[2] > clip[1]
    assert placed >= 5
    # QA verdict + mp3 length
    assert res.status == "PASS", read_json(pipe.wd / "report.json")["qa"]
    assert audio_io.decoded_frames(pipe.out_mp3) == len(orig)


def test_statuses_cover_fitting_paths(run):
    _, _, pipe, _ = run
    st = {r["status"] for r in read_json(pipe.wd / "fit.json")}
    assert "OK" in st
    assert st & {"STRETCHED", "SHORTENED"}, st


def test_resume_skips_and_override_reruns(tmp_path):
    info = synth.build(tmp_path / "lesson.wav", 44100, 2)
    cfg = make_cfg(tmp_path, info["fixture"])
    pipe = FilePipeline(info["wav"], cfg)
    pipe.run()
    stamp = pipe.out_wav.stat().st_mtime_ns
    pipe2 = FilePipeline(info["wav"], cfg)          # nothing changed -> everything skipped
    pipe2.run()
    assert pipe2.out_wav.stat().st_mtime_ns == stamp
    # override the Uzbek text of segment 2 -> only translate/tts/fit/assemble/qa rerun, output changes
    before = read_json(pipe.wd / "fit.json")
    write_json(pipe.wd / "overrides.json", {"segments": {"2": {"uzbek": "Salom"}}})
    pipe3 = FilePipeline(info["wav"], cfg)
    res = pipe3.run()
    after = {r["index"]: r for r in read_json(pipe.wd / "fit.json")}
    assert after[2]["uz_text"] == "Salom" and res.status == "PASS"
    assert after[2]["uz_text"] != {r["index"]: r for r in before}[2]["uz_text"]


def test_language_override_keeps_segment_original(tmp_path):
    info = synth.build(tmp_path / "lesson.wav", 44100, 2)
    cfg = make_cfg(tmp_path, info["fixture"])
    write_json(tmp_path / "work" / "lesson" / "overrides.json", {"segments": {"0": {"language": "en"}}})
    pipe = FilePipeline(info["wav"], cfg)
    assert pipe.run().status == "PASS"
    a = read_json(pipe.wd / "assemble.json")
    assert 0 in [k[0] for k in a["kept"]]


def test_failed_fit_keeps_original_russian(tmp_path):
    info = synth.build(tmp_path / "lesson.wav", 44100, 2)
    cfg = make_cfg(tmp_path, info["fixture"], fitting={"allow_overflow": False})
    pipe = FilePipeline(info["wav"], cfg)
    res = pipe.run()
    fits = {r["index"]: r for r in read_json(pipe.wd / "fit.json")}
    assert fits[6]["status"] == "FAILED_FIT" and fits[6]["clip_file"] is None
    assert 6 in [k[0] for k in read_json(pipe.wd / "assemble.json")["kept"]]
    assert res.status == "PASS" and "FAILED_FIT" in {a["status"] for a in read_json(pipe.wd / "report.json")["attention"]}


def test_preview_and_cli(tmp_path, capsys):
    import main as cli
    info = synth.build(tmp_path / "lesson.wav", 44100, 2)
    base = ["--work-dir", str(tmp_path / "w"), "--out-dir", str(tmp_path / "o"), "--config", str(_cfgfile(tmp_path, info))]
    assert cli.main(["process", str(info["wav"])] + base) == 0
    assert cli.main(["report", str(info["wav"])] + base) == 0
    assert cli.main(["estimate", str(info["wav"])] + base) == 0
    assert cli.main(["preview", str(info["wav"]), "--at", "0:10", "--span", "4", "--preview-dir", str(tmp_path / "pv")] + base) == 0
    assert len(list((tmp_path / "pv").glob("*.wav"))) == 3


def _cfgfile(tmp_path, info):
    import yaml
    p = tmp_path / "t.yaml"
    p.write_text(yaml.safe_dump({"providers": {"asr": "mock", "translate": "mock", "tts": "mock"},
                                 "segmentation": {"backend": "energy"},
                                 "paths": {"cache_dir": str(tmp_path / "cache")},
                                 "mock": {"asr_fixture": str(info["fixture"])}}))
    return p


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q", "-x"]))
