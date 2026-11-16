"""Decide, per segment, whether it gets replaced and why not otherwise."""
from __future__ import annotations

from dataclasses import dataclass

from .config import Cfg
from .models import AsrOutcome, Segment


@dataclass
class PlanItem:
    index: int
    action: str            # replace | keep
    reason: str            # RU | EN | UNCERTAIN_LANG | SKIPPED_NOISE | SKIPPED_SHORT | SKIPPED_OVERRIDE
    status: str            # initial report status for kept segments ("" for replaced ones)


def build_plan(segs: list[Segment], asr: list[AsrOutcome], overrides: dict, cfg: Cfg) -> list[PlanItem]:
    """Replace only Russian speech; everything else is kept bit-identical."""
    plan: list[PlanItem] = []
    for s, a in zip(segs, asr):
        ov = overrides.get(str(s.index), {}) or {}
        if ov.get("skip"):
            plan.append(PlanItem(s.index, "keep", "SKIPPED_OVERRIDE", "SKIPPED"))
        elif a.lang == "en":
            plan.append(PlanItem(s.index, "keep", "EN", "KEPT_EN"))
        elif a.lang != "ru":
            plan.append(PlanItem(s.index, "keep", "SKIPPED_NOISE", "SKIPPED"))
        elif (s.speech_end - s.speech_start) / s.sr < cfg.fitting.min_replace_s and not ov.get("uzbek"):
            plan.append(PlanItem(s.index, "keep", "SKIPPED_SHORT", "SKIPPED"))
        elif a.uncertain and cfg.asr.uncertain_policy == "keep" and not a.forced:
            plan.append(PlanItem(s.index, "keep", "UNCERTAIN_LANG", "UNCERTAIN_LANG"))
        else:
            plan.append(PlanItem(s.index, "replace", "RU", ""))
    return plan
