"""Cost estimator: TTS characters / ASR minutes / translation tokens + approximate USD, BEFORE paid calls."""
from __future__ import annotations

from pathlib import Path

from . import audio_io
from .config import Cfg
from .util import read_json

AUDIO_EXT = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".wma"}


def list_audio(path: str | Path) -> list[Path]:
    p = Path(path)
    if p.is_file():
        return [p]
    return sorted(f for f in p.iterdir() if f.suffix.lower() in AUDIO_EXT)


def duration_s(path: Path) -> float:
    return float(audio_io.probe(path)["format"]["duration"])


def estimate_file(path: Path, cfg: Cfg, work_root: str | Path | None = None) -> dict:
    """Estimate usage for one lesson; uses real numbers if it was already transcribed/translated."""
    e, pr = cfg.estimate, cfg.pricing
    dur = duration_s(path)
    wd = Path(work_root or cfg.paths.work_dir) / path.stem
    tr = read_json(wd / "translations.json")
    actual = tr is not None
    if actual:
        items = tr["items"].values()
        ru_chars = sum(len(i["ru"]) for i in items)
        tts_chars = int(sum(len(i["uz"]) for i in items) * e.retry_overhead)
        n_items = len(tr["items"])
    else:
        ru_s = dur * e.ru_speech_fraction
        ru_chars = int(ru_s * e.ru_chars_per_s)
        tts_chars = int(ru_s * e.uz_chars_per_s * e.retry_overhead)
        n_items = max(1, int(ru_s / 3.0))
    batches = max(1, -(-n_items // int(cfg.translate.batch_size)))
    tok_in = int(ru_chars / e.chars_per_token_ru * e.context_factor + batches * e.prompt_tokens_per_batch)
    tok_out = int(tts_chars / e.retry_overhead / e.chars_per_token_uz * 1.4)   # JSON overhead
    asr_min = dur / 60.0 if cfg.providers.asr == "openai" else 0.0
    cost = {"asr": asr_min * pr.openai_whisper_per_min}
    tp = pr.claude_per_mtok if cfg.providers.translate == "claude" else pr.openai_per_mtok
    cost["translate"] = 0.0 if cfg.providers.translate == "mock" else (tok_in * tp["in"] + tok_out * tp["out"]) / 1e6
    cost["tts"] = {"elevenlabs": tts_chars / 1000 * pr.elevenlabs_per_1k_chars,
                   "azure": tts_chars / 1e6 * pr.azure_per_1m_chars}.get(cfg.providers.tts, 0.0)
    return {"file": path.name, "duration_min": dur / 60, "based_on": "actual transcript" if actual else "duration heuristic",
            "asr_minutes_paid": asr_min, "ru_chars": ru_chars, "tts_chars": tts_chars,
            "translate_tokens_in": tok_in, "translate_tokens_out": tok_out,
            "cost": cost, "cost_total": sum(cost.values())}


def estimate_many(path: str | Path, cfg: Cfg, work_root: str | Path | None = None) -> tuple[list[dict], dict]:
    rows = [estimate_file(f, cfg, work_root) for f in list_audio(path)]
    tot = {k: sum(r[k] for r in rows) for k in ("duration_min", "asr_minutes_paid", "ru_chars", "tts_chars",
                                                "translate_tokens_in", "translate_tokens_out", "cost_total")}
    tot["cost"] = {k: sum(r["cost"][k] for r in rows) for k in ("asr", "translate", "tts")}
    return rows, tot


def format_table(rows: list[dict], tot: dict, cfg: Cfg) -> str:
    h = f"{'file':34} {'min':>6} {'ASR min':>9} {'TTS chars':>10} {'tr tok in/out':>16} {'~USD':>8}  basis"
    lines = [h, "-" * len(h)]
    for r in rows:
        lines.append(f"{r['file'][:34]:34} {r['duration_min']:6.1f} {r['asr_minutes_paid']:9.1f} {r['tts_chars']:10d} "
                     f"{r['translate_tokens_in']:>8d}/{r['translate_tokens_out']:<7d} {r['cost_total']:8.2f}  {r['based_on']}")
    lines += ["-" * len(h),
              f"{'TOTAL (' + str(len(rows)) + ' files)':34} {tot['duration_min']:6.1f} {tot['asr_minutes_paid']:9.1f} {tot['tts_chars']:10d} "
              f"{tot['translate_tokens_in']:>8d}/{tot['translate_tokens_out']:<7d} {tot['cost_total']:8.2f}",
              f"  by service: ASR ${tot['cost']['asr']:.2f} | translate ${tot['cost']['translate']:.2f} | TTS ${tot['cost']['tts']:.2f}"
              f"   (providers: {cfg.providers.to_dict()})",
              "  Approximate: prices come from config.yaml -> pricing; edit them. Run `process` with a local ASR + mock",
              "  translate/TTS first, then `estimate` again for numbers based on real transcripts."]
    return "\n".join(lines)
