import React from 'react';
import MetalButton from './MetalButton.jsx';
import { STATUS, fmt, fmtDate } from './lib.js';

/** Bitta e'lon sahifasi: qog'ozga bosilgan matn va metall tugmalar */
export default function ListingPage({ product: p, number, confirming, busy, onEdit, onArchive, onAskDelete, onCancelDelete, onDelete, interactive = true }) {
  const st = STATUS[p.status] || STATUS.ACTIVE;
  const created = fmtDate(p.createdAt);
  const harvest = fmtDate(p.harvestDate);
  const canArchive = p.status === 'ACTIVE' || p.status === 'ARCHIVED';
  const archived = p.status === 'ARCHIVED';
  return (
    <>
      <div className="bk-kicker"><span>E'lon №</span> <span>{number}</span></div>
      <h2 className="bk-h1" style={{ marginTop: '.2em' }}>{p.name}</h2>
      <div style={{ fontStyle: 'italic', color: '#6b5b39', marginTop: '.25em' }}>{p.category}</div>
      <div className="bk-orn" aria-hidden="true">❦</div>
      <dl style={{ margin: 0 }}>
        <div className="bk-row"><dt>Vazni</dt><dd>{fmt(p.quantityKg)} kg</dd></div>
        <div className="bk-row"><dt>Narxi</dt><dd>{fmt(p.pricePerKg)} so'm / kg</dd></div>
        <div className="bk-row"><dt>Jami qiymat</dt><dd>{fmt(Number(p.quantityKg) * Number(p.pricePerKg))} so'm</dd></div>
        {harvest ? <div className="bk-row"><dt>O'rim-yig'im</dt><dd>{harvest}</dd></div> : null}
        {created ? <div className="bk-row"><dt>Joylangan</dt><dd>{created}</dd></div> : null}
      </dl>
      <div style={{ margin: '1.1em 0 .4em' }}><span className={['bk-stamp', st.tone].join(' ')}>{st.label}</span></div>

      <div style={{ marginTop: 'auto', paddingTop: '.8em' }}>
        {confirming ? (
          <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.6em' }}>
            <span style={{ fontStyle: 'italic', color: '#7a1a14', flex: '1 1 100%' }}>O'chirishni tasdiqlaysizmi?</span>
            <MetalButton tone="copper" disabled={!interactive || busy} onClick={onDelete} data-act="confirm-delete">Ha, o'chirish</MetalButton>
            <MetalButton tone="steel" disabled={!interactive || busy} onClick={onCancelDelete}>Yo'q</MetalButton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6em' }}>
            <MetalButton icon="✎" disabled={!interactive || busy} onClick={onEdit} data-act="edit">Tahrirlash</MetalButton>
            {canArchive ? <MetalButton tone="steel" icon={archived ? '↺' : '▤'} disabled={!interactive || busy} onClick={onArchive} data-act="archive">{archived ? 'Faollashtirish' : 'Arxivlash'}</MetalButton> : null}
            <MetalButton tone="copper" icon="✕" disabled={!interactive || busy} onClick={onAskDelete} data-act="delete">O'chirish</MetalButton>
          </div>
        )}
      </div>
    </>
  );
}
