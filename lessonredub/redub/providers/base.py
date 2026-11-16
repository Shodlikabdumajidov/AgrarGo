"""Provider interfaces. Real and mock implementations are interchangeable via config.yaml."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np


@dataclass
class AsrResult:
    lang: str                       # ru | en | other
    probs: dict = field(default_factory=dict)   # normalised over the candidate languages
    text: str = ""


class TranscriptionProvider(ABC):
    name = "base"

    @property
    def cache_tag(self) -> str:
        """Anything that changes results must be part of this tag (it keys the ASR cache)."""
        return self.name

    @abstractmethod
    def process(self, audio: np.ndarray, sr: int, info: dict, forced_lang: str | None) -> AsrResult:
        """Language-ID (restricted to the candidates) + transcript for ONE segment.

        ``audio`` is mono float32 at ``sr`` (16 kHz). ``info`` has index/start_s/end_s (mock uses it).
        If ``forced_lang`` is given, skip language-ID and transcribe in that language.
        """


@dataclass
class TranslationItem:
    id: int
    ru: str
    before: list = field(default_factory=list)   # context lines, e.g. "[en] I'm going"
    after: list = field(default_factory=list)
    max_chars: int = 60


class TranslationProvider(ABC):
    name = "base"

    @property
    def cache_tag(self) -> str:
        return self.name

    @abstractmethod
    def translate_batch(self, items: list[TranslationItem]) -> dict[int, str]:
        """Return {item.id: uzbek_latin_text}. Must keep English target phrases untouched."""

    @abstractmethod
    def shorten(self, item: TranslationItem, current_uz: str, max_chars: int) -> str:
        """Return a shorter Uzbek rendering (<= max_chars) of the same meaning."""


class TTSProvider(ABC):
    name = "base"

    @property
    @abstractmethod
    def cache_tag(self) -> str:
        """Hash input: provider + voice + model + settings."""

    @abstractmethod
    def synthesize(self, text: str) -> tuple[np.ndarray, int]:
        """Return (mono float32 audio, sample_rate)."""
