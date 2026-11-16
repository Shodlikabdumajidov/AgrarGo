"""TTS providers: ElevenLabs, Azure Speech, Mock (synthetic tone clips)."""
from __future__ import annotations

import io
from xml.sax.saxutils import escape

import numpy as np
import soundfile as sf

from .. import audio_io
from ..config import Cfg, require_env
from .base import TTSProvider
from .http import RateLimiter, post


class ElevenLabsTTS(TTSProvider):
    """One consistent voice for the whole course (ELEVENLABS_VOICE_ID)."""

    name = "elevenlabs"

    def __init__(self, cfg: Cfg):
        self.c = cfg.tts.elevenlabs
        self.limiter = RateLimiter(cfg.tts.requests_per_minute)
        self.retries = int(cfg.tts.retries)

    @property
    def cache_tag(self) -> str:
        import os
        return f"elevenlabs:{os.environ.get('ELEVENLABS_VOICE_ID', '')}:{self.c.to_dict()}"

    def synthesize(self, text):
        key = require_env("ELEVENLABS_API_KEY")        # >>> INSERT API KEY HERE (.env -> ELEVENLABS_API_KEY)
        voice = require_env("ELEVENLABS_VOICE_ID")     # >>> INSERT VOICE ID HERE (.env -> ELEVENLABS_VOICE_ID)
        fmt = self.c.output_format
        body = {"text": text, "model_id": self.c.model_id,
                "voice_settings": {"stability": self.c.stability, "similarity_boost": self.c.similarity_boost,
                                   "style": self.c.style, "use_speaker_boost": self.c.use_speaker_boost,
                                   "speed": self.c.speed}}
        r = post(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format={fmt}",
                 headers={"xi-api-key": key, "Content-Type": "application/json"},
                 limiter=self.limiter, retries=self.retries, json_body=body)
        sr = int(fmt.split("_")[1])
        if fmt.startswith("pcm_"):
            return np.frombuffer(r.content, dtype="<i2").astype(np.float32) / 32768.0, sr
        return audio_io.decode_bytes(r.content, sr), sr


class AzureTTS(TTSProvider):
    name = "azure"

    def __init__(self, cfg: Cfg):
        self.c = cfg.tts.azure
        self.limiter = RateLimiter(cfg.tts.requests_per_minute)
        self.retries = int(cfg.tts.retries)

    @property
    def cache_tag(self) -> str:
        return f"azure:{self.c.to_dict()}"

    def synthesize(self, text):
        import os
        key = require_env("AZURE_SPEECH_KEY")          # >>> INSERT API KEY HERE (.env -> AZURE_SPEECH_KEY)
        region = require_env("AZURE_SPEECH_REGION")    # >>> INSERT REGION HERE (.env -> AZURE_SPEECH_REGION)
        ssml = (f"<speak version='1.0' xml:lang='uz-UZ'><voice name='{self.c.voice}'>"
                f"<prosody rate='{self.c.rate}'>{escape(text)}</prosody></voice></speak>")
        r = post(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
                 headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                          "X-Microsoft-OutputFormat": self.c.output_format, "User-Agent": "lessonredub"},
                 limiter=self.limiter, retries=self.retries, data=ssml.encode("utf-8"))
        x, sr = sf.read(io.BytesIO(r.content), dtype="float32", always_2d=True)
        return x.mean(axis=1), sr


class MockTTS(TTSProvider):
    """Synthetic 'speech': syllable-modulated harmonic tone, length proportional to text length.

    Has leading/trailing silence so the silence-trimming step is exercised. Output rate is 24 kHz so
    resampling to the lesson rate is exercised too.
    """

    name = "mock"

    def __init__(self, cfg: Cfg):
        self.c = cfg.tts.mock

    @property
    def cache_tag(self) -> str:
        return f"mock:{self.c.to_dict()}"

    def synthesize(self, text):
        sr = 24000
        dur = max(0.15, len(text) / float(self.c.chars_per_s))
        t = np.arange(int(dur * sr)) / sr
        f0 = 140.0 + (sum(map(ord, text)) % 60)
        env = 0.5 * (1 - np.cos(2 * np.pi * 4.0 * t)) ** 0.5
        y = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in (1, 2, 3)) * env * 0.25
        fade = int(0.01 * sr)
        y[:fade] *= np.linspace(0, 1, fade)
        y[-fade:] *= np.linspace(1, 0, fade)
        lead = np.zeros(int(self.c.lead_silence_s * sr))
        tail = np.zeros(int(self.c.tail_silence_s * sr))
        return np.concatenate([lead, y, tail]).astype(np.float32), sr


def make_tts(cfg: Cfg) -> TTSProvider:
    kind = cfg.providers.tts
    table = {"elevenlabs": ElevenLabsTTS, "azure": AzureTTS, "mock": MockTTS}
    if kind not in table:
        raise ValueError(f"unknown tts provider '{kind}'")
    return table[kind](cfg)
