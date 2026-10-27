import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import BookScene from './Scene.jsx';
import { TW, faceSignature, logoReady, onLogoReady, paintFace } from './paint.js';
import { buildFaces, folioOf, spreadFaces, turnsForFace } from './model.js';
import ListingForm from '../ListingForm.jsx';
import MetalButton from '../MetalButton.jsx';
import { readOnboarded, writeOnboarded } from '../lib.js';

const store = () => { try { return window.localStorage; } catch { return null; } };
const hostT = () => (typeof window.T === 'function' ? window.T : (s) => s);
const hostLang = () => { try { return (window.I18N && window.I18N.lang) || document.documentElement.lang || ''; } catch { return ''; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Yuzlar uchun canvas teksturalari (o'zgarmaganlari keshdan olinadi, keraksizlari bo'shatiladi) */
function useTextures(faces, lang, t) {
  const cache = useRef(new Map());
  const out = useMemo(() => {
    const next = new Map();
    const list = faces.map((face, i) => {
      const sig = faceSignature(face, i, lang);
      let e = cache.current.get(sig) || next.get(sig);
      if (!e) {
        const canvas = document.createElement('canvas');
        const hits = paintFace(canvas, face, i, t);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        if (i % 2) { tex.wrapS = THREE.ClampToEdgeWrapping; tex.repeat.set(-1, 1); tex.offset.set(1, 0); } // orqa yuz: ko'zguda
        e = { tex, hits };
      }
      next.set(sig, e);
      return e;
    });
    cache.current.forEach((e, k) => { if (!next.has(k)) e.tex.dispose(); });
    cache.current = next;
    return list;
  }, [faces, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { cache.current.forEach((e) => e.tex.dispose()); cache.current = new Map(); }, []);
  return out;
}

function useNarrow() {
  const read = () => window.innerWidth / Math.max(1, window.innerHeight) < 1.05 || window.innerWidth < 760;
  const [n, setN] = useState(read);
  useEffect(() => { const f = () => setN(read()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return n;
}

const Hint = ({ onClick }) => (
  <button type="button" className="bk-hint bk3-hint" onClick={onClick} data-hint="flip">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.1L4 15.5a1.6 1.6 0 0 1 2.4-2L9 15" /></svg>
    <span>Varaqlash uchun bosing</span>
  </button>
);

/**
 * «Mening e'lonlarim» — WebGL (React Three Fiber) 3D kitobi.
 * Props BookApp bilan bir xil: { products, onCreate, onUpdate, onArchive, onDelete, onClose }.
 */
export default function Book3D({ products, onCreate, onUpdate, onArchive, onDelete, onClose }) {
  const narrow = useNarrow();
  const [lang, setLang] = useState(hostLang);
  useEffect(() => { const f = () => setLang(hostLang() + ':' + Date.now()); document.addEventListener('i18n:change', f); return () => document.removeEventListener('i18n:change', f); }, []);
  const t = useMemo(() => hostT(), [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const faces = useMemo(() => buildFaces(products), [products]);
  const L = faces.length / 2;
  // Muqovadagi logotip rasmi yuklangach teksturalar qayta chiziladi (imzoga qo'shiladi)
  const [logoOk, setLogoOk] = useState(logoReady);
  useEffect(() => { let on = true; onLogoReady(() => { if (on) setLogoOk(true); }); return () => { on = false; }; }, []);
  const textures = useTextures(faces, lang + (logoOk ? '|logo' : ''), t);

  const [turns, setTurns] = useState(0);
  const [side, setSide] = useState('R');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [onboarded, setOnboarded] = useState(() => readOnboarded(store()));
  const onboardedRef = useRef(onboarded);
  const pendingNew = useRef(false);
  const prevIds = useRef(new Set(products.map((p) => p.id)));

  // ---- Imperativ holat (har kadrda o'qiladi; React render'dan tashqarida) ----
  const ctrl = useRef(null);
  if (!ctrl.current) ctrl.current = { ang: [], vel: [], target: [], delay: [], dragging: [], meshes: [], textures: [], t: 0, L, narrow, side: 'R' };
  const c = ctrl.current;
  c.L = L; c.narrow = narrow; c.side = side;
  for (let j = 0; j < L; j++) if (c.ang[j] === undefined) { const done = j < c.t; c.ang[j] = done ? Math.PI : 0; c.vel[j] = 0; c.target[j] = done ? Math.PI : 0; c.delay[j] = 0; c.dragging[j] = false; }
  if (c.t > L) { c.t = L; setTurns(L); }

  const markOnboarded = useCallback(() => {
    if (onboardedRef.current) return;
    onboardedRef.current = true; writeOnboarded(store());
    setTimeout(() => setOnboarded(true), 0);
  }, []);

  /** n ta varaq ag'darilgan holatga o'tish: varaqlar ketma-ket, biroz kechikib buriladi */
  const turnTo = useCallback((n, opts = {}) => {
    n = clamp(n, 0, c.L);
    const cur = c.t;
    if (n === cur) return;
    const fwd = n > cur;
    const order = [];
    if (fwd) for (let j = cur; j < n; j++) order.push(j); else for (let j = cur - 1; j >= n; j--) order.push(j);
    order.forEach((j, k) => {
      c.target[j] = fwd ? Math.PI : 0;
      if (k >= 7 || opts.instant) { c.ang[j] = c.target[j]; c.vel[j] = 0; c.delay[j] = 0; } else c.delay[j] = k * (opts.fast ? 0.055 : 0.1);
    });
    c.t = n;
    setTurns(n);
    setSide(opts.side || (fwd ? (n === 1 ? 'R' : 'L') : 'R'));
    setConfirmId(null);
    markOnboarded();
  }, [c, markOnboarded]);

  const goFace = useCallback((face) => {
    const n = turnsForFace(face);
    const onRight = face % 2 === 0;
    const sideWanted = onRight ? 'R' : 'L';
    if (n === c.t) { setSide(sideWanted); setSelected(face); return; }
    turnTo(n, { fast: true, side: sideWanted });
    setSelected(face);
  }, [c, turnTo]);

  // ---- Ro'yxat o'zgarganda: yangi e'longa o'tish ----
  useEffect(() => {
    const ids = new Set(products.map((p) => p.id));
    if (pendingNew.current) {
      const fresh = products.findIndex((p) => !prevIds.current.has(p.id));
      if (fresh !== -1) { pendingNew.current = false; const f = faces.findIndex((x) => x.kind === 'listing' && x.product.id === products[fresh].id); if (f > 0) setTimeout(() => goFace(f), 60); }
    }
    prevIds.current = ids;
    setConfirmId(null);
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Navigatsiya ----
  const next = useCallback(() => {
    markOnboarded();
    if (!narrow) return turnTo(c.t + 1);
    if (c.t === 0) return turnTo(1, { side: 'R' });
    if (side === 'L' && c.t < L) return setSide('R');
    if (c.t < L) return turnTo(c.t + 1, { side: 'L' });
  }, [narrow, side, L, c, turnTo, markOnboarded]);
  const prev = useCallback(() => {
    if (!narrow) return turnTo(c.t - 1);
    if (c.t === 1 && side === 'R') return turnTo(0);
    if (side === 'R' && c.t > 1) return setSide('L');
    if (c.t > 1) return turnTo(c.t - 1, { side: 'R' });
    if (c.t === L && side === 'L') return turnTo(L - 1, { side: 'R' });
  }, [narrow, side, L, c, turnTo]);
  const atStart = turns === 0;
  const atEnd = turns >= L;

  // ---- Klaviatura ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (form) setForm(null); else onClose && onClose(); return; }
      if (form) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Enter' && c.t === 0) turnTo(1, { side: 'R' });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ---- Ko'rinadigan va tanlangan sahifa ----
  const vis = spreadFaces(turns, L);
  const visible = (narrow ? [side === 'L' ? vis.left : vis.right] : [vis.left, vis.right]).filter((f) => f != null);
  const isActionable = (f) => faces[f] && (faces[f].kind === 'listing' || faces[f].kind === 'add');
  const active = visible.includes(selected) && isActionable(selected) ? selected : [...visible].reverse().find(isActionable) ?? null;
  const activeFace = active != null ? faces[active] : null;
  const choices = visible.filter((f) => faces[f].kind === 'listing');

  const handlers = useMemo(() => ({
    onTurned: (n, dir, complete) => { setTurns(n); if (complete) setSide(dir === 1 ? (n === 1 ? 'R' : 'L') : 'R'); setConfirmId(null); markOnboarded(); },
    onTurnTo: (n) => { turnTo(n, { side: n > c.t ? (n === 1 ? 'R' : 'L') : 'R' }); },
    onGoFace: goFace,
    onAdd: () => { markOnboarded(); setForm({}); },
    onSelect: (f) => { setSelected(f); if (c.narrow) setSide(f % 2 ? 'L' : 'R'); markOnboarded(); },
    onDragStart: () => { setConfirmId(null); markOnboarded(); },
  }), [c, goFace, turnTo, markOnboarded]);

  // ---- Amallar ----
  const guard = async (fn) => { setBusy(true); try { await fn(); } catch (e) { /* xabarni xost ko'rsatadi */ } finally { setBusy(false); } };
  const submitForm = async (payload) => {
    if (form.product) await onUpdate(form.product.id, payload);
    else { pendingNew.current = true; try { await onCreate(payload); } catch (e) { pendingNew.current = false; throw e; } }
    setForm(null);
  };

  const label = (f) => { const n = folioOf(f); return n == null ? '' : String(n); };
  const counter = turns === 0 ? <span>Muqova</span> : (() => {
    const shown = visible.map(label).filter(Boolean);
    return shown.length ? <><span>Sahifa</span> <span>{shown.join('–')}</span></> : <span>Muqova</span>;
  })();
  const product = activeFace && activeFace.kind === 'listing' ? activeFace.product : null;

  return (
    <div className="bk-root bk3-root" role="dialog" aria-modal="true" aria-label="Mening e'lonlarim kitobi">
      <div className="bk-topbar">
        <div className="bk-title"><span aria-hidden="true">📖</span><span>Mening e'lonlarim</span></div>
        <button type="button" className="bk-close" onClick={onClose} aria-label="Yopish">✕</button>
      </div>

      <div className="bk3-canvaswrap" data-turns={turns} data-faces={faces.length} data-side={side}>
        <Canvas
          frameloop="demand" flat dpr={[1, 2]} camera={{ fov: 32, position: [0, 0, 6], near: 0.1, far: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          aria-label="3D kitob"
        >
          <BookScene ctrl={c} textures={textures} handlers={handlers} />
        </Canvas>
        {!onboarded ? <Hint onClick={() => { markOnboarded(); turnTo(turns === 0 ? 1 : turns + 1, { side: 'R' }); }} /> : null}
        <ul className="bk3-sr" aria-label="Mundarija">
          {products.map((p) => <li key={p.id}><button type="button" onClick={() => { const f = faces.findIndex((x) => x.kind === 'listing' && x.product.id === p.id); goFace(f); }}>{p.name}</button></li>)}
        </ul>
      </div>

      <div className="bk3-actions" aria-live="polite" style={{ opacity: turns === 0 ? 0 : 1, pointerEvents: turns === 0 ? 'none' : 'auto' }}>
        {choices.length > 1 ? (
          <div className="bk3-chips" role="tablist" aria-label="Sahifani tanlash">
            {choices.map((f) => <button key={f} type="button" role="tab" aria-selected={active === f} className={['bk3-chip', active === f ? 'on' : ''].join(' ').trim()} onClick={() => setSelected(f)}>{faces[f].product.name}</button>)}
          </div>
        ) : product ? <div className="bk3-chips"><span className="bk3-chip on">{product.name}</span></div> : null}
        {product ? (
          confirmId === product.id ? (
            <div role="alert" className="bk3-row">
              <span className="bk3-warn">O'chirishni tasdiqlaysizmi?</span>
              <MetalButton tone="copper" disabled={busy} onClick={() => guard(async () => { await onDelete(product.id); setConfirmId(null); })} data-act="confirm-delete">Ha, o'chirish</MetalButton>
              <MetalButton tone="steel" disabled={busy} onClick={() => setConfirmId(null)}>Yo'q</MetalButton>
            </div>
          ) : (
            <div className="bk3-row">
              <MetalButton icon="✎" disabled={busy} onClick={() => setForm({ product })} data-act="edit">Tahrirlash</MetalButton>
              {product.status === 'ACTIVE' || product.status === 'ARCHIVED' ? (
                <MetalButton tone="steel" icon={product.status === 'ARCHIVED' ? '↺' : '▤'} disabled={busy} onClick={() => guard(() => onArchive(product))} data-act="archive">{product.status === 'ARCHIVED' ? 'Faollashtirish' : 'Arxivlash'}</MetalButton>
              ) : null}
              <MetalButton tone="copper" icon="✕" disabled={busy} onClick={() => setConfirmId(product.id)} data-act="delete">O'chirish</MetalButton>
            </div>
          )
        ) : activeFace && activeFace.kind === 'add' ? (
          <div className="bk3-row"><MetalButton tone="green" icon="＋" disabled={busy} onClick={() => setForm({})} data-act="add">Yangi e'lon qo'shish</MetalButton></div>
        ) : turns > 0 ? <div className="bk3-row bk3-muted">Mundarijadan e'lonni tanlang yoki sahifani varaqlang</div> : null}
      </div>

      <div className="bk-nav" style={{ marginTop: 10 }}>
        <button type="button" className="bk-navbtn" onClick={() => goFace(2)} disabled={turns === 0}><span aria-hidden="true">≡</span><span>Mundarija</span></button>
        <button type="button" className="bk-navbtn" onClick={prev} disabled={atStart}><span aria-hidden="true">◀</span><span>Oldingi</span></button>
        <span className="bk-counter" aria-live="polite">{counter}</span>
        <button type="button" className="bk-navbtn solid" onClick={next} disabled={atEnd}><span>{turns === 0 ? 'Ochish' : 'Keyingi'}</span><span aria-hidden="true">▶</span></button>
      </div>

      {form ? (
        <div className="bk3-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <div className="bk3-formshell" style={{ '--bk-fs': '16px' }}>
            <ListingForm key={form.product ? form.product.id : 'new'} product={form.product} onSubmit={submitForm} onCancel={() => setForm(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
