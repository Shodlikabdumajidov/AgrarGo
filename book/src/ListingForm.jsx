import React, { useState } from 'react';
import { motion } from 'framer-motion';
import MetalButton from './MetalButton.jsx';
import { CATEGORIES, toPayload, validateListing } from './lib.js';

const empty = { name: '', category: '', quantityKg: '', pricePerKg: '', harvestDate: '' };
const fromProduct = (p) => ({
  name: p.name,
  category: CATEGORIES.includes(p.category) ? p.category : 'Boshqa',
  quantityKg: String(Number(p.quantityKg)),
  pricePerKg: String(Number(p.pricePerKg)),
  harvestDate: p.harvestDate ? String(p.harvestDate).slice(0, 10) : '',
});

/**
 * Yangi e'lon / tahrirlash formasi. Sahifa markazidan «o'sib chiqadi» (clip-path doira kengayadi).
 * onSubmit(payload) — Promise; xatoda { messages: [...] } bilan rad etiladi.
 */
export default function ListingForm({ product, onSubmit, onCancel }) {
  const editing = !!product;
  const [v, setV] = useState(product ? fromProduct(product) : empty);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const errs = validateListing(v);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await onSubmit(toPayload(v, editing));
    } catch (err) {
      setErrors(err && err.messages && err.messages.length ? err.messages : ["Saqlab bo'lmadi. Qayta urinib ko'ring."]);
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="bk-formwrap bk-paper"
      style={{ borderRadius: '0 .5em .5em 0' }}
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ clipPath: 'circle(0% at 50% 50%)' }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-label={editing ? "E'lonni tahrirlash" : "Yangi e'lon"}
    >
      <div className="bk-gutter-r" />
      <motion.form
        className="bk-inner"
        onSubmit={submit}
        noValidate
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.18, duration: 0.45, ease: 'easeOut' }}
      >
        <div className="bk-kicker">{editing ? 'Tahrirlash' : "E'lon joylash"}</div>
        <h2 className="bk-h1" style={{ marginTop: '.15em' }}>{editing ? "E'lonni tahrirlash" : "Yangi e'lon qo'shish"}</h2>
        <div className="bk-orn" aria-hidden="true">❦</div>
        {errors.length ? <div className="bk-errors" role="alert">{errors.map((m) => <div key={m}>{m}</div>)}</div> : null}
        <div className="bk-field">
          <label htmlFor="bk-name">Mahsulot nomi</label>
          <input id="bk-name" className="bk-input" value={v.name} onChange={set('name')} maxLength={100} placeholder="Masalan: Pomidor" autoComplete="off" />
        </div>
        <div className="bk-field">
          <label htmlFor="bk-category">Kategoriyasi</label>
          <select id="bk-category" data-native="" className="bk-input" value={v.category} onChange={set('category')}>
            <option value="">Tanlang...</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.9em' }}>
          <div className="bk-field">
            <label htmlFor="bk-qty">Vazni (kg)</label>
            <input id="bk-qty" className="bk-input" type="number" min="0" step="0.01" inputMode="decimal" value={v.quantityKg} onChange={set('quantityKg')} placeholder="500" />
          </div>
          <div className="bk-field">
            <label htmlFor="bk-price">Narxi (1 kg, so'm)</label>
            <input id="bk-price" className="bk-input" type="number" min="0" step="0.01" inputMode="decimal" value={v.pricePerKg} onChange={set('pricePerKg')} placeholder="4500" />
          </div>
        </div>
        <div className="bk-field">
          <label htmlFor="bk-harvest">O'rim-yig'im sanasi <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(ixtiyoriy)</span></label>
          <input id="bk-harvest" className="bk-input" type="date" value={v.harvestDate} onChange={set('harvestDate')} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.7em', marginTop: 'auto', paddingTop: '.6em' }}>
          <button type="submit" className="bk-metal green" disabled={busy} data-act="submit">{busy ? 'Saqlanmoqda...' : editing ? 'Saqlash' : "E'lonni joylash"}</button>
          <MetalButton tone="ghost" disabled={busy} onClick={onCancel} data-act="cancel">Bekor qilish</MetalButton>
        </div>
      </motion.form>
    </motion.div>
  );
}
