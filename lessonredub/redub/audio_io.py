"""Audio I/O. All sample-accurate editing is done on integer PCM arrays (no lossy hops).

Reference ("working") audio = the source WAV itself when it is PCM 16/24/32 WAV, otherwise an
ffmpeg-decoded PCM WAV at the original sample rate / channel count. The source is never modified.
"""
from __future__ import annotations

import json
import math
import os
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from .util import log

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_BIN", "ffprobe")

# subtype -> (numpy dtype used for I/O, bits, left-shift inside the dtype)
SUBTYPES = {"PCM_16": ("int16", 16, 0), "PCM_24": ("int32", 24, 8), "PCM_32": ("int32", 32, 0)}


def set_binaries(ffmpeg: str | None, ffprobe: str | None) -> None:
    global FFMPEG, FFPROBE
    if ffmpeg:
        FFMPEG = ffmpeg
    if ffprobe:
        FFPROBE = ffprobe


def run(cmd: list[str], input: bytes | None = None) -> subprocess.CompletedProcess:
    p = subprocess.run(cmd, input=input, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(cmd[:6])}...\n{p.stderr.decode(errors='replace')[-800:]}")
    return p


def probe(path: str | Path) -> dict:
    """ffprobe the first audio stream."""
    p = run([FFPROBE, "-v", "error", "-select_streams", "a:0", "-show_entries",
             "stream=codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample:format=duration",
             "-of", "json", str(path)])
    return json.loads(p.stdout)


def prepare_working_wav(src: Path, workdir: Path) -> Path:
    """Return a PCM WAV path that is the sample-exact reference for this lesson."""
    if src.suffix.lower() == ".wav":
        try:
            if sf.info(str(src)).subtype in SUBTYPES:
                return src
        except RuntimeError:
            pass
    info = probe(src)
    st = info["streams"][0]
    bits = int(st.get("bits_per_raw_sample") or 0) or int(st.get("bits_per_sample") or 0)
    codec = "pcm_s24le" if bits > 16 else "pcm_s16le"
    dst = workdir / "source.wav"
    log.info("decoding %s -> %s (%s, original rate/channels)", src.name, dst.name, codec)
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-vn", "-c:a", codec, str(dst)])
    return dst


def wav_info(path: str | Path) -> dict:
    i = sf.info(str(path))
    return {"sr": i.samplerate, "channels": i.channels, "frames": i.frames, "subtype": i.subtype}


def read_pcm(path: str | Path, start: int = 0, stop: int | None = None) -> tuple[np.ndarray, int, str]:
    """Read integer PCM as (frames, channels) in the file's native integer dtype."""
    i = sf.info(str(path))
    dtype = SUBTYPES[i.subtype][0]
    data, sr = sf.read(str(path), start=start, stop=stop, dtype=dtype, always_2d=True)
    return data, sr, i.subtype


def write_pcm(path: str | Path, data: np.ndarray, sr: int, subtype: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), data, sr, subtype=subtype)


def int_scale(subtype: str) -> float:
    """Divisor that maps stored integers to [-1, 1) floats."""
    return 32768.0 if SUBTYPES[subtype][0] == "int16" else 2147483648.0


def to_float(data: np.ndarray, subtype: str) -> np.ndarray:
    return data.astype(np.float32) / np.float32(int_scale(subtype))


def float_to_pcm(x: np.ndarray, subtype: str) -> np.ndarray:
    """Quantise float [-1,1] to the file's integer representation (rounded, clipped)."""
    dtype, bits, shift = SUBTYPES[subtype]
    lim = 2 ** (bits - 1)
    q = np.clip(np.rint(np.asarray(x, dtype=np.float64) * lim), -lim, lim - 1).astype(np.int64)
    return (q << shift).astype(dtype)


def mono_of(data: np.ndarray, subtype: str) -> np.ndarray:
    """Float mono mix of an integer (frames, ch) array."""
    return to_float(data, subtype).mean(axis=1) if data.shape[1] > 1 else to_float(data[:, 0], subtype)


def resample(x: np.ndarray, sr_from: int, sr_to: int) -> np.ndarray:
    if sr_from == sr_to:
        return x.astype(np.float32, copy=False)
    g = math.gcd(sr_from, sr_to)
    return resample_poly(x, sr_to // g, sr_from // g).astype(np.float32)


def build_analysis_16k(wav: Path, out: Path, chunk_s: float = 60.0) -> int:
    """Stream the working WAV into a mono 16 kHz PCM16 file for VAD/ASR. Returns frames written."""
    info = sf.info(str(wav))
    sr = info.samplerate
    down = sr // math.gcd(sr, 16000)
    block = down * max(1, round(chunk_s * sr / down))
    dtype = SUBTYPES[info.subtype][0]
    n = 0
    with sf.SoundFile(str(out), "w", 16000, 1, subtype="PCM_16") as fo:
        for blk in sf.blocks(str(wav), blocksize=block, dtype=dtype, always_2d=True):
            m = mono_of(blk, info.subtype)
            y = np.clip(resample(m, sr, 16000), -1.0, 1.0)
            fo.write(y)
            n += len(y)
    return n


def read_16k(path: Path) -> np.ndarray:
    x, _ = sf.read(str(path), dtype="float32", always_2d=False)
    return x


def decode_bytes(data: bytes, sr: int) -> np.ndarray:
    """Decode any encoded audio bytes (mp3...) to float32 mono at ``sr`` through ffmpeg."""
    p = run([FFMPEG, "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "f32le",
             "-ac", "1", "-ar", str(sr), "pipe:1"], input=data)
    return np.frombuffer(p.stdout, dtype="<f4").copy()


def encode_mp3(wav: Path, mp3: Path, bitrate: str) -> None:
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav), "-vn",
         "-c:a", "libmp3lame", "-b:a", bitrate, "-write_xing", "1", str(mp3)])


def decoded_frames(path: Path) -> int:
    """Number of PCM frames a decoder (ffmpeg) produces for ``path`` (streamed, low memory)."""
    ch = int(probe(path)["streams"][0]["channels"])
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-"]
    total = 0
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as pr:
        while True:
            buf = pr.stdout.read(1 << 20)
            if not buf:
                break
            total += len(buf)
    return total // (2 * ch)
