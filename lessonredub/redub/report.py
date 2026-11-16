"""QA report (report.json + report.html) with an 'Attention needed' section on top."""
from __future__ import annotations

import html
from pathlib import Path

from .util import fmt_ts, write_json

OK_STATUSES = {"OK", "KEPT_EN", "SKIPPED"}


def attention_items(rows: list[dict]) -> list[dict]:
    """Rows a human should listen to: anything other than a clean OK / untouched English."""
    out = []
    for r in rows:
        why = []
        if r["status"] in ("FAILED_FIT", "OVERFLOW", "UNCERTAIN_LANG"):
            why.append(r["status"])
        elif "UNCERTAIN_LANG" in r.get("flags", []):
            why.append("language uncertain (segment was replaced anyway)")
        if r["status"] == "SHORTENED":
            why.append("text was shortened by the translator - check meaning")
        if r.get("stretch", 1.0) and r["stretch"] > 1.10:
            why.append(f"strong stretch {r['stretch']:.2f}x")
        if "MIXED_SCRIPT" in r.get("flags", []):
            why.append("mixed Russian/English text in one segment")
        if "TRUNCATED" in r.get("flags", []):
            why.append("clip truncated")
        if why:
            out.append({"index": r["index"], "start_s": r["start_s"], "why": "; ".join(why), "status": r["status"]})
    return out


def build_report(name: str, meta: dict, rows: list[dict], qa: dict) -> dict:
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {"file": name, "meta": meta, "qa": qa, "counts": counts,
            "attention": attention_items(rows), "segments": rows}


def render_html(rep: dict) -> str:
    e = html.escape
    qa = rep["qa"]
    css = ("body{font-family:Segoe UI,Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%}"
           "td,th{border:1px solid #ccc;padding:4px 6px;font-size:13px;vertical-align:top}th{background:#eee}"
           ".PASS{color:#0a7d2c}.FAIL{color:#c00}.bad{background:#fde2e2}.warn{background:#fff3cd}.dim{color:#888}"
           ".good{background:#e6f6e6}")
    out = [f"<html><head><meta charset='utf-8'><title>{e(rep['file'])}</title><style>{css}</style></head><body>",
           f"<h1>{e(rep['file'])} <span class='{qa['result']}'>{qa['result']}</span></h1>",
           f"<p>{rep['meta'].get('n_samples')} samples @ {rep['meta'].get('sr')} Hz, "
           f"{rep['meta'].get('channels')} ch. Status counts: {e(str(rep['counts']))}</p>"]
    out.append("<h2>Verification</h2><table><tr><th>check</th><th>result</th><th>detail</th></tr>")
    for k, v in qa["checks"].items():
        out.append(f"<tr class='{'good' if v['ok'] else 'bad'}'><td>{e(k)}</td><td>{'PASS' if v['ok'] else 'FAIL'}</td><td>{e(v['detail'])}</td></tr>")
    out.append("</table><h2>Attention needed</h2>")
    if rep["attention"]:
        out.append("<table><tr><th>#</th><th>time</th><th>status</th><th>why</th></tr>")
        for a in rep["attention"]:
            out.append(f"<tr class='warn'><td>{a['index']}</td><td>{fmt_ts(a['start_s'])}</td><td>{e(a['status'])}</td><td>{e(a['why'])}</td></tr>")
        out.append("</table>")
    else:
        out.append("<p>Nothing - all replaced segments fit cleanly.</p>")
    out.append("<h2>All segments</h2><table><tr><th>#</th><th>start</th><th>end</th><th>slot s</th><th>TTS s</th>"
               "<th>stretch</th><th>retries</th><th>status</th><th>Russian</th><th>Uzbek</th></tr>")
    for r in rep["segments"]:
        cls = "bad" if r["status"] == "FAILED_FIT" else "warn" if r["status"] in ("OVERFLOW", "UNCERTAIN_LANG", "SHORTENED") else "dim" if r["status"] in ("KEPT_EN", "SKIPPED") else ""
        out.append(f"<tr class='{cls}'><td>{r['index']}</td><td>{fmt_ts(r['start_s'])}</td><td>{fmt_ts(r['end_s'])}</td>"
                   f"<td>{r['slot_s']:.2f}</td><td>{r['tts_s']:.2f}</td><td>{r['stretch']:.3f}</td><td>{r['retries']}</td>"
                   f"<td>{e(r['status'])}</td><td>{e(r['ru_text'])}</td><td>{e(r['uz_text'])}</td></tr>")
    out.append("</table></body></html>")
    return "\n".join(out)


def save_report(workdir: Path, rep: dict) -> None:
    write_json(workdir / "report.json", rep)
    (workdir / "report.html").write_text(render_html(rep), encoding="utf-8")
