import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import AddPage from './AddPage.jsx';
import Cover from './Cover.jsx';
import Leaf from './Leaf.jsx';
import ListingForm from './ListingForm.jsx';
import ListingPage from './ListingPage.jsx';
import PageSheet from './PageSheet.jsx';
import Toc from './Toc.jsx';
import useBookSize from './useBookSize.js';
import { buildPages, planPath, readOnboarded, writeOnboarded } from './lib.js';

const EASE = [0.645, 0.045, 0.355, 1]; // easeInOutCubic: qog'oz asta ko'tarilib, tez o'tib, yumshoq tushadi
const SLOW = 0.95; // qo'lda bosilganda tabiiy tezlik
const FAST = 0.28; // mundarijadan sakraganda tezroq
// localStorage'ga kirishning o'zi ham xato berishi mumkin (maxfiy rejim, bloklangan cookie)
const store = () => { try { return window.localStorage; } catch { return null; } };
const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const rad = (v) => (Math.abs(v) * Math.PI) / 180;

const Hint = ({ onClick }) => (
  <button type="button" className="bk-hint" onClick={onClick} data-hint="flip">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.1L4 15.5a1.6 1.6 0 0 1 2.4-2L9 15" /></svg>
    <span>Varaqlash uchun bosing</span>
  </button>
);

export default function BookApp({ products, onCreate, onUpdate, onArchive, onDelete, onClose }) {
  const { mode, pw, ph } = useBookSize();
  const spread = mode === 'spread';
  const pages = useMemo(() => buildPages(products), [products]);
  const seq = useMemo(() => (spread ? pages : [{ type: 'toc', id: 'toc' }, ...pages]), [spread, pages]);

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [flip, setFlip] = useState(null); // { dir, from, to }
  const [form, setForm] = useState(null); // { product? }
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [onboarded, setOnboarded] = useState(() => readOnboarded(store()));
  const onboardedRef = useRef(onboarded);

  const angle = useMotionValue(0); // varaq burchagi
  const coverA = useMotionValue(0); // muqova burchagi
  const indexRef = useRef(0);
  const turning = useRef(false);
  const pendingNew = useRef(false);
  const prevIds = useRef(new Set(products.map((p) => p.id)));
  const prevMode = useRef(mode);

  const rightX = spread ? pw : 0;
  const stageW = spread ? pw * 2 : pw;

  // ---- Soyalar (varaq burchagiga bog'liq) ----
  const rBarX = useTransform(angle, (v) => rightX + Math.max(0, pw * Math.cos(rad(v))));
  const rBarO = useTransform(angle, (v) => (Math.cos(rad(v)) > 0 ? Math.sin(rad(v)) * 0.6 : 0));
  const lBarX = useTransform(angle, (v) => rightX + Math.min(0, pw * Math.cos(rad(v))) - pw * 0.24);
  const lBarO = useTransform(angle, (v) => (Math.cos(rad(v)) < 0 ? Math.sin(rad(v)) * 0.55 : 0));
  const stageX = useTransform(coverA, [0, -180], [spread ? -pw / 2 : 0, 0]);
  const slabScale = useTransform(coverA, [0, -180], [spread ? 0.5 : 1, 1]);
  const leftO = useTransform(coverA, [-70, -175], [0, 1]);

  // Ishora yo'qolishi bosish hodisasi to'liq tugagandan keyin (setTimeout): aks holda React ishorani «capture» bosqichidayoq
  // olib tashlaydi va ishoraning o'z onClick'i ishlamay qoladi.
  const markOnboarded = useCallback(() => {
    if (onboardedRef.current) return;
    onboardedRef.current = true;
    writeOnboarded(store());
    setTimeout(() => setOnboarded(true), 0);
  }, []);

  // ---- Rejim o'zgarsa (ekran aylantirildi) joriy sahifa saqlanadi ----
  useEffect(() => {
    if (prevMode.current === mode) return;
    setIndex((i) => { const n = mode === 'single' ? i + 1 : Math.max(0, i - 1); indexRef.current = n; return n; });
    prevMode.current = mode;
  }, [mode]);

  // ---- Ro'yxat o'zgarganda: yangi e'longa o'tish, indeksni chegaralash ----
  useEffect(() => {
    const ids = new Set(products.map((p) => p.id));
    if (pendingNew.current) {
      const fresh = products.findIndex((p) => !prevIds.current.has(p.id));
      if (fresh !== -1) { pendingNew.current = false; turn(spread ? fresh : fresh + 1, { fast: true }); }
    }
    prevIds.current = ids;
    setIndex((i) => { const n = Math.min(i, seq.length - 1); indexRef.current = n; return n; });
    setConfirmId(null);
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Varaqlash ----
  const turn = useCallback(async (to, opts = {}) => {
    const fast = !!opts.fast;
    if (turning.current || to === indexRef.current || to < 0 || to >= seq.length) return;
    turning.current = true;
    setForm(null);
    let cur = indexRef.current;
    try {
      for (const next of planPath(cur, to, fast ? 4 : 1)) {
        const dir = next > cur ? 1 : -1;
        angle.set(dir === 1 ? 0 : -180);
        setFlip({ dir, from: cur, to: next });
        await raf2();
        await animate(angle, dir === 1 ? -180 : 0, { duration: fast ? FAST : SLOW, ease: EASE });
        cur = next; indexRef.current = next;
        setIndex(next);
        setFlip(null);
      }
    } finally { turning.current = false; setFlip(null); }
  }, [seq.length, angle]);

  const next = () => { markOnboarded(); turn(indexRef.current + 1); };
  const prev = () => turn(indexRef.current - 1);
  const goToPage = (i) => turn(spread ? i : i + 1, { fast: true });

  // ---- Muqovani ochish ----
  const openBook = useCallback(async () => {
    if (open || turning.current) return;
    turning.current = true;
    markOnboarded();
    await animate(coverA, -180, { duration: 1.15, ease: EASE });
    setOpen(true);
    turning.current = false;
  }, [open, coverA, markOnboarded]);

  // ---- Klaviatura ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (form) setForm(null); else onClose && onClose(); return; }
      if (form || !open) { if (!open && (e.key === 'Enter')) openBook(); return; }
      const t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // har renderda yangilanadi: oxirgi holatni ko'radi

  // ---- Amallar ----
  const guard = async (fn) => { setBusy(true); try { await fn(); } catch (e) { /* xabarni xost ko'rsatadi */ } finally { setBusy(false); } };
  const doArchive = (p) => guard(() => onArchive(p));
  const doDelete = (p) => guard(async () => { await onDelete(p.id); setConfirmId(null); });
  const submitForm = async (payload) => {
    if (form.product) await onUpdate(form.product.id, payload);
    else { pendingNew.current = true; try { await onCreate(payload); } catch (e) { pendingNew.current = false; throw e; } }
    setForm(null);
  };

  // ---- Sahifa tarkibi ----
  const pageNo = (item) => (item.type === 'listing' ? pages.findIndex((p) => p.id === item.id) + 1 : item.type === 'add' ? products.length + 1 : null);
  const curPageIdx = spread ? index : index - 1;
  const body = (item, interactive) => {
    if (item.type === 'toc') return <Toc products={products} currentIndex={curPageIdx} onGoTo={goToPage} interactive={interactive} />;
    if (item.type === 'add') return <AddPage interactive={interactive} onAdd={() => setForm({})} />;
    const p = item.product;
    return (
      <ListingPage
        product={p} number={pageNo(item)} interactive={interactive} busy={busy} confirming={confirmId === p.id}
        onEdit={() => setForm({ product: p })} onArchive={() => doArchive(p)}
        onAskDelete={() => setConfirmId(p.id)} onCancelDelete={() => setConfirmId(null)} onDelete={() => doDelete(p)}
      />
    );
  };
  const sheet = (item, interactive) => <PageSheet side="right" pw={pw} ph={ph} folio={pageNo(item)}>{body(item, interactive)}</PageSheet>;

  const underIdx = flip ? (flip.dir === 1 ? flip.to : flip.from) : index;
  const leafIdx = flip ? (flip.dir === 1 ? flip.from : flip.to) : null;
  const last = index >= seq.length - 1;
  const folioNo = seq[index] ? pageNo(seq[index]) : null;

  return (
    <div className="bk-root" role="dialog" aria-modal="true" aria-label="Mening e'lonlarim kitobi">
      <div className="bk-topbar">
        <div className="bk-title"><span aria-hidden="true">📖</span><span>Mening e'lonlarim</span></div>
        <button type="button" className="bk-close" onClick={onClose} aria-label="Yopish">✕</button>
      </div>

      <motion.div
        className="bk-stage"
        style={{ width: stageW, height: ph, x: stageX, '--bk-fs': `${(pw / 26).toFixed(2)}px`, touchAction: 'pan-y' }}
        onClickCapture={markOnboarded}
        onPanEnd={(_, info) => { if (!open || form) return; if (info.offset.x < -70) next(); else if (info.offset.x > 70) prev(); }}
      >
        {/* yer ustidagi soya */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '4%', right: '4%', bottom: -pw * 0.05, height: pw * 0.1, background: 'radial-gradient(ellipse at center, rgba(0,0,0,.75), transparent 70%)', filter: 'blur(8px)' }} />
        {/* charm asos (kitob qalinligi) */}
        <motion.div className="bk-leather" aria-hidden="true" style={{ position: 'absolute', left: -pw * 0.03, right: -pw * 0.03, top: -pw * 0.03, bottom: -pw * 0.03, borderRadius: '.5em 1em 1em .5em', scaleX: slabScale, transformOrigin: '100% 50%', boxShadow: '0 1.2em 2.4em rgba(0,0,0,.6)' }} />

        {/* chap sahifa — doimo mundarija (keng ekranda) */}
        {spread ? (
          <motion.div style={{ position: 'absolute', left: 0, top: 0, opacity: leftO }}>
            <PageSheet side="left" pw={pw} ph={ph}><Toc products={products} currentIndex={curPageIdx} onGoTo={goToPage} interactive={open && !flip} /></PageSheet>
          </motion.div>
        ) : null}

        {/* o'ng sahifa (varaq tagida) */}
        <div style={{ position: 'absolute', left: rightX, top: 0, width: pw, height: ph }}>
          {seq[underIdx] ? sheet(seq[underIdx], open && !flip) : null}
          {open && !flip && !form && !last ? <button type="button" className="bk-corner" onClick={next} aria-label="Keyingi sahifa" /> : null}
          <AnimatePresence>
            {form ? <ListingForm key="form" product={form.product} onSubmit={submitForm} onCancel={() => setForm(null)} /> : null}
          </AnimatePresence>
        </div>

        {/* varaq soyalari */}
        {flip ? <motion.div className="bk-shadebar" aria-hidden="true" style={{ left: 0, x: rBarX, width: pw * 0.24, opacity: rBarO, background: 'linear-gradient(90deg, rgba(0,0,0,.7), transparent)' }} /> : null}
        {flip && spread ? <motion.div className="bk-shadebar" aria-hidden="true" style={{ left: 0, x: lBarX, width: pw * 0.24, opacity: lBarO, background: 'linear-gradient(270deg, rgba(0,0,0,.7), transparent)' }} /> : null}

        {/* varaq */}
        {flip && seq[leafIdx] ? <Leaf angle={angle} left={rightX} pw={pw} ph={ph} renderFace={() => sheet(seq[leafIdx], false)} /> : null}

        {/* muqova */}
        {!open ? (
          <Cover coverA={coverA} left={rightX} pw={pw} ph={ph} onOpen={openBook}>
            {!onboarded ? <Hint onClick={(e) => { e.stopPropagation(); openBook(); }} /> : null}
          </Cover>
        ) : null}

        {/* onboarding ishorasi ochiq kitobda ham (birinchi bosishgacha) */}
        {open && !onboarded && !flip ? (
          <div style={{ position: 'absolute', left: rightX, top: 0, width: pw, height: ph, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto' }}><Hint onClick={next} /></div>
          </div>
        ) : null}
      </motion.div>

      <div className="bk-nav" style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}>
        {!spread ? <button type="button" className="bk-navbtn" onClick={() => turn(0, { fast: true })} disabled={index === 0 || !!flip || !!form}><span aria-hidden="true">≡</span><span>Mundarija</span></button> : null}
        <button type="button" className="bk-navbtn" onClick={prev} disabled={index === 0 || !!flip || !!form}><span aria-hidden="true">◀</span><span>Oldingi</span></button>
        <span className="bk-counter" aria-live="polite">{folioNo ? <><span>Sahifa</span> <span>{folioNo}</span></> : <span>Mundarija</span>}</span>
        <button type="button" className="bk-navbtn solid" onClick={next} disabled={last || !!flip || !!form}><span>Keyingi</span><span aria-hidden="true">▶</span></button>
      </div>
    </div>
  );
}
