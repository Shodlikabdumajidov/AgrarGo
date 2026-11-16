"""Real provider classes exercised with a faked HTTP layer (no network, no keys)."""
from __future__ import annotations

import io
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from redub.config import load_config  # noqa: E402
from redub.providers import http  # noqa: E402
from redub.providers import translate as T  # noqa: E402
from redub.providers import tts as TT  # noqa: E402
from redub.providers.base import TranslationItem  # noqa: E402


class FakeResp:
    def __init__(self, json_obj=None, content=b""):
        self._j, self.content = json_obj, content

    def json(self):
        return self._j


def test_claude_translator_parses_fenced_json(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    reply = '```json\n{"translations": [{"id": 3, "uz": "Salom, \\"hello\\""}]}\n```'
    seen = {}

    def fake_post(url, **kw):
        seen.update(kw)
        return FakeResp({"content": [{"type": "text", "text": reply}]})

    monkeypatch.setattr(T, "post", fake_post)
    tr = T.ClaudeTranslator(load_config())
    out = tr.translate_batch([TranslationItem(3, "Привет", ["[en] hello"], [], 20)])
    assert out == {3: 'Salom, "hello"'}
    assert seen["headers"]["x-api-key"] == "test" and seen["json_body"]["model"]


def test_missing_key_gives_clear_error(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        T.ClaudeTranslator(load_config())._ask("x")


def test_elevenlabs_pcm_and_azure_wav(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "v")
    pcm = (np.sin(np.arange(4410) / 10) * 8000).astype("<i2").tobytes()
    monkeypatch.setattr(TT, "post", lambda url, **kw: FakeResp(content=pcm))
    cfg = load_config(overrides={"tts": {"elevenlabs": {"output_format": "pcm_44100"}}})
    x, sr = TT.ElevenLabsTTS(cfg).synthesize("salom")
    assert sr == 44100 and len(x) == 4410

    monkeypatch.setenv("AZURE_SPEECH_KEY", "k")
    monkeypatch.setenv("AZURE_SPEECH_REGION", "westeurope")
    buf = io.BytesIO()
    sf.write(buf, np.zeros(2400, np.float32), 24000, format="WAV", subtype="PCM_16")
    monkeypatch.setattr(TT, "post", lambda url, **kw: FakeResp(content=buf.getvalue()))
    x, sr = TT.AzureTTS(load_config()).synthesize("a < b")
    assert sr == 24000 and len(x) == 2400


def test_retry_backoff(monkeypatch):
    monkeypatch.setattr(http.time, "sleep", lambda s: None)
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) < 3:
            raise http.TransientError("HTTP 429")
        return "ok"

    assert http.retry_call(flaky, retries=5) == "ok" and len(calls) == 3
    with pytest.raises(http.ProviderError):
        http.retry_call(lambda: (_ for _ in ()).throw(http.TransientError("x")), retries=2)
