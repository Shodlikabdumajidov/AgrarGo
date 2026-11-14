import React from 'react';

/** Birinchi bo'sh sahifa: o'rtada katta zumrad yashil doira ichida oq PLUS */
export default function AddPage({ onAdd, interactive = true }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '1.1em' }}>
      <div className="bk-kicker">Yangi sahifa</div>
      <button type="button" className="bk-plus" aria-label="Yangi e'lon qo'shish" disabled={!interactive} onClick={onAdd} data-act="add">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" /></svg>
      </button>
      <div style={{ fontSize: '1.25em', fontWeight: 700 }}>Yangi e'lon qo'shish</div>
      <p style={{ margin: 0, maxWidth: '16em', color: '#6b5b39', fontStyle: 'italic', lineHeight: 1.5, fontSize: '.92em' }}>
        Mahsulotingizni joylang: do'konlar uni darhol ko'rib, bron qila boshlaydi.
      </p>
    </div>
  );
}
