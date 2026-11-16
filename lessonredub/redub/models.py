"""Plain dataclasses shared by pipeline steps (all JSON-serialisable via asdict)."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Segment:
    """One speech segment. Sample indices are at the ORIGINAL sample rate.

    ``speech_*``  = VAD speech bounds (a Uzbek clip starts at ``speech_start``).
    ``start/end`` = padded region owned by this segment (regions never overlap).
    """

    index: int
    sr: int
    speech_start: int
    speech_end: int
    start: int
    end: int

    @property
    def speech_start_s(self) -> float:
        return self.speech_start / self.sr

    @property
    def speech_end_s(self) -> float:
        return self.speech_end / self.sr

    @property
    def start_s(self) -> float:
        return self.start / self.sr

    @property
    def end_s(self) -> float:
        return self.end / self.sr

    def to_json(self) -> dict:
        return {
            "index": self.index,
            "speech_start": self.speech_start, "speech_end": self.speech_end,
            "start": self.start, "end": self.end,
            "speech_start_s": round(self.speech_start_s, 4), "speech_end_s": round(self.speech_end_s, 4),
            "start_s": round(self.start_s, 4), "end_s": round(self.end_s, 4),
        }


@dataclass
class AsrOutcome:
    """Per-segment language decision + transcript."""

    index: int
    lang: str                      # ru | en | other
    text: str = ""
    probs: dict = field(default_factory=dict)
    script: str = ""               # ru | en | mixed | none (from the transcript letters)
    uncertain: bool = False
    flags: list = field(default_factory=list)
    forced: bool = False           # language came from overrides.json


@dataclass
class FitResult:
    """Outcome of the time-fitting step for one replaced segment."""

    index: int
    status: str = "OK"             # OK|STRETCHED|SHORTENED|OVERFLOW|FAILED_FIT
    flags: list = field(default_factory=list)
    slot_s: float = 0.0
    tts_s: float = 0.0             # trimmed TTS length of the FIRST attempt
    final_s: float = 0.0
    stretch: float = 1.0
    retries: int = 0
    uz_text: str = ""
    overflow_s: float = 0.0
    gain_db: float = 0.0
    clip_file: str | None = None
    note: str = ""
