# lessonredub – replace Russian narration with Uzbek, sample-exact

Command-line pipeline for mixed English/Russian (Pimsleur-style) lessons. Russian narrator speech is
detected, translated to short spoken Uzbek, voiced by TTS, time-fitted into the original slot and
spliced back in. **Output length and every non-Russian sample stay bit-identical to the original.**
All editing happens on integer PCM numpy arrays; the only lossy step is the optional final MP3 export.

```
lessonredub/
  main.py                CLI: estimate | process | report | preview
  config.yaml            all settings (providers, thresholds, prices)      .env.example  API keys
  redub/
    pipeline.py          resumable per-file orchestration (import this from FastAPI later)
    audio_io.py          ffmpeg/soundfile I/O, 16 kHz analysis copy, mp3 export
    segmentation.py      step 2  Silero / faster-whisper VAD / energy VAD, merge, split, pad
    step_asr.py          step 3  per-segment ru-vs-en language ID, forced transcription, script check
    step_translate.py    step 4  context-aware translation, per-segment cache, shorten helper
    step_tts.py          step 5  TTS cache + resampling
    fitting.py           step 6  trim, stretch (rubberband), shorten+retry, overflow, loudness, fades
    assemble.py          step 7  sample-exact splice with edge crossfade
    qa.py / report.py    step 8  PASS/FAIL checks, report.json + report.html
    plan.py cost.py preview.py overrides via work/<lesson>/overrides.json
    providers/           asr.py translate.py tts.py (real + mock), http.py (retry, rate limit)
  tests/                 synthetic 60 s lesson, mock end-to-end, fake-HTTP provider tests
```

## Windows setup (step by step)

1. **Python 3.11+** – https://www.python.org/downloads/ (tick “Add python.exe to PATH”).
2. **ffmpeg (“full” build, includes the rubberband filter)** – download `ffmpeg-release-full.7z` from
   https://www.gyan.dev/ffmpeg/builds/, unzip to `C:\ffmpeg`, add `C:\ffmpeg\bin` to PATH. Check:
   ```bat
   ffmpeg -hide_banner -filters | findstr rubberband
   ```
   If that prints a line, pitch-preserving stretch works with no extra install. (If not, the code falls
   back to `pyrubberband` when the `rubberband` CLI is on PATH, else to a lower-quality built-in WSOLA.)
3. **Project environment**
   ```bat
   cd lessonredub
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. **Optional GPU (CUDA)** – with an NVIDIA GPU install the CUDA 12 + cuDNN 9 runtime that
   faster-whisper/ctranslate2 needs (see the faster-whisper README), and `pip install torch` from
   https://pytorch.org for Silero VAD. Device is auto-detected: CUDA → `large-v3` float16, otherwise
   CPU → `small` int8 (change `asr.model_cpu` to `medium` if you can wait). If torch is missing the
   pipeline automatically uses faster-whisper’s bundled Silero VAD.
5. **Keys** – `copy .env.example .env` and fill in only what you switch on in `config.yaml`
   (`# >>> INSERT API KEY HERE` marks every place in code/config that reads a key).

## Run

```bat
python -m pytest tests -q                         :: 1. synthetic test, mock mode, ~20 s, no keys
python main.py estimate lessons\                  :: cost estimate BEFORE any paid call
python main.py process lessons\lesson01.mp3       :: one file
python main.py process lessons\ --asr local --translate mock --tts mock
python main.py report lessons\                    :: attention list per lesson
python main.py preview lessons\lesson01.mp3 --at 12:34 --span 6
```
Outputs: `output\<stem>_uz.wav` (lossless master) and `.mp3`; working files in `work\<stem>\`
(`segments.json transcripts.json translations.json tts\ fit\ fit.json report.json report.html state.json`).
Switch providers by editing only `providers:` in `config.yaml` (or `--asr/--translate/--tts`) plus `.env`.

### Resume, overrides, re-runs
Every step stores a fingerprint of its inputs+settings in `state.json`; finished steps are skipped on rerun,
and API results are cached under `cache\` by content hash (rerunning costs nothing). `--force-from asr`
reruns one step and everything after it. To fix a segment, create `work\<stem>\overrides.json`:
```json
{"segments": {"12": {"language": "ru"}, "14": {"uzbek": "Ayting: \"I'm going\""}, "20": {"skip": true}}}
```
(`index` = the `#` column of `report.html`.) Re-run `process`: a language override re-transcribes only that
segment; a text override only re-runs TTS → fit → assemble for what changed.

## How requirement 6 (fitting) behaves
Slot = from the Russian segment’s speech start to the end of its padded region. Uzbek starts exactly at the
Russian speech start. Per segment: trim TTS silence → fits? place → else rubberband up to `max_stretch` (1.15)
→ else ask the translator for a shorter text and re-TTS (≤ `max_retries`) → else max stretch and spill into
the following silence only if ≥ `overflow_min_gap_s` remains before the next segment → else **FAILED_FIT**
(by default the original Russian is left in place and listed under “Attention needed”; set
`fitting.failed_fit_action: truncate` to insert a cut clip instead). Uzbek is loudness-matched (BS.1770 LUFS,
RMS for clips < 0.45 s) to the Russian speech it replaces, with 15 ms fades and a 15 ms crossfade at the
region edges.

## Assumptions (tell me if any is wrong)
* “Bit-identical” is relative to the decoded working copy. WAV PCM input is used as-is; MP3/FLAC/other input is
  decoded once by ffmpeg to PCM at the original rate/channels (`work\<stem>\source.wav`).
* Stereo: analysis uses the mono mix; the Uzbek clip is placed identically in every channel.
* Segments whose language is uncertain are **kept** (Russian stays) and flagged `UNCERTAIN_LANG`
  (`asr.uncertain_policy: replace` changes that). A Russian word inside an English-dominant segment is
  not replaced (the segment stays English) and is flagged `MIXED_SCRIPT`; an English phrase inside a Russian
  segment is kept quoted in the Uzbek text and spoken by the Uzbek voice.
* MP3 is re-encoded from the final WAV with LAME (+Xing/LAME header so ffmpeg trims encoder delay/padding);
  `qa` decodes it and fails loudly if the length differs. The WAV is the master.
* Segments shorter than `fitting.min_replace_s` (0.2 s) are treated as noise and left alone.
* Memory: a 30-min 44.1 kHz stereo 16-bit lesson needs ~1 GB RAM while assembling.
* The model IDs, ElevenLabs model (Uzbek support!), prices and `speed/stability` are config values – verify
  them against current provider docs. The real HTTP providers are written to the public REST docs but were
  only tested with a faked HTTP layer (no keys were available).

## Suggested order of work
1. `python -m pytest tests -q` → must be all green.
2. One real lesson in full mock mode (`--asr mock --translate mock --tts mock`): checks decode, VAD, assembly, mp3
   length, report. (Mock ASR alternates ru/en; use real ASR for meaningful language IDs.)
3. Real ASR, mock translate/TTS: `--asr local`. Open `report.html`, listen with `preview`; fix wrong
   languages via `overrides.json`. Tune `segmentation.*` if segments split/merge badly.
4. `python main.py estimate lessons\` (now based on real transcripts).
5. Real keys for ONE lesson (`translate: claude`, `tts: elevenlabs` or `azure`); compare with your manual result
   (`preview` A/B around several timestamps); tune `uz_chars_per_s`, `max_stretch`, voice settings.
6. Batch the folder; read the “Attention needed” lists only.
