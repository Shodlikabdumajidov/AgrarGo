"""Step 4: translate Russian segments to Uzbek with neighbouring context; per-segment disk cache."""
from __future__ import annotations

from typing import Callable

from .config import Cfg
from .models import AsrOutcome, Segment
from .plan import PlanItem
from .providers.base import TranslationItem, TranslationProvider
from .util import DiskCache, log, sha1


def normalize_uz(text: str, apostrophe: str) -> str:
    """Unify o'/g' apostrophe variants to the configured character and collapse whitespace."""
    for ch in ("'", "’", "ʼ", "‘", "ʻ", "`", "´"):
        for letter in "oOgG":
            text = text.replace(letter + ch, letter + apostrophe)
    return " ".join(text.split())


def max_chars_for(seg: Segment, cfg: Cfg) -> int:
    slot_s = (seg.end - seg.speech_start) / seg.sr
    return max(8, int(slot_s * float(cfg.translate.uz_chars_per_s)))


def build_item(i: int, segs: list[Segment], asr: list[AsrOutcome], cfg: Cfg) -> TranslationItem:
    k = int(cfg.translate.context_segments)

    def line(j: int) -> str:
        return f"[{asr[j].lang}] {asr[j].text}"

    before = [line(j) for j in range(max(0, i - k), i)]
    after = [line(j) for j in range(i + 1, min(len(segs), i + 1 + k))]
    return TranslationItem(segs[i].index, asr[i].text, before, after, max_chars_for(segs[i], cfg))


def item_key(item: TranslationItem, provider: TranslationProvider) -> str:
    return sha1("tr", provider.cache_tag, item.ru, item.before, item.after, item.max_chars)


def run_translate(segs, asr, plan: list[PlanItem], overrides: dict, cfg: Cfg, provider: TranslationProvider,
                  cache: DiskCache, progress: Callable[[int, int], None] | None = None) -> dict:
    """Return {"items": {idx: {ru, uz, source, max_chars}}}. Overrides win and cost nothing."""
    ap = cfg.translate.apostrophe
    items: dict[str, dict] = {}
    todo: list[TranslationItem] = []
    for i, p in enumerate(plan):
        if p.action != "replace":
            continue
        it = build_item(i, segs, asr, cfg)
        ov = (overrides.get(str(p.index), {}) or {}).get("uzbek")
        if ov:
            items[str(p.index)] = {"ru": it.ru, "uz": normalize_uz(ov, ap), "source": "override", "max_chars": it.max_chars}
            continue
        hit = cache.get_json("translate", item_key(it, provider))
        if hit:
            items[str(p.index)] = {"ru": it.ru, "uz": normalize_uz(hit["uz"], ap), "source": "cache", "max_chars": it.max_chars}
        else:
            todo.append(it)
    done = 0
    bs = int(cfg.translate.batch_size)
    for b in range(0, len(todo), bs):
        batch = todo[b:b + bs]
        res = provider.translate_batch(batch)
        for it in batch:
            uz = res.get(it.id)
            if not uz:  # missing in the batch reply: ask for this one alone
                uz = provider.translate_batch([it]).get(it.id)
            if not uz:
                raise RuntimeError(f"translator returned nothing for segment {it.id}")
            cache.put_json("translate", item_key(it, provider), {"uz": uz})
            items[str(it.id)] = {"ru": it.ru, "uz": normalize_uz(uz, ap), "source": provider.name, "max_chars": it.max_chars}
        done += len(batch)
        if progress:
            progress(done, len(todo))
    log.info("translate: %d segments (%d new API items)", len(items), len(todo))
    return {"items": items}


def shorten_cached(provider: TranslationProvider, cache: DiskCache, item: TranslationItem,
                   current: str, max_chars: int, apostrophe: str) -> str:
    """Cached 'make it shorter' helper used by the time-fitting step."""
    key = sha1("short", provider.cache_tag, item.ru, current, max_chars)
    hit = cache.get_json("shorten", key)
    if hit is None:
        hit = {"uz": provider.shorten(item, current, max_chars)}
        cache.put_json("shorten", key, hit)
    return normalize_uz(hit["uz"], apostrophe)
