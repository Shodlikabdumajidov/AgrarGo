import React from 'react';
import { fmt } from './lib.js';

/** Mundarija: e'lonlar va sahifa raqamlari; nomga bosilsa kitob o'sha sahifaga varaqlanadi */
export default function Toc({ products, currentIndex, onGoTo, interactive = true }) {
  const addNo = products.length + 1;
  return (
    <>
      <div className="bk-kicker">AgrarGo</div>
      <h2 className="bk-h1" style={{ marginTop: '.15em' }}>Mundarija</h2>
      <div className="bk-orn" aria-hidden="true">❦</div>
      {products.length === 0 ? (
        <p style={{ fontStyle: 'italic', color: '#6b5b39', lineHeight: 1.5 }}>Hali e'lon qo'shmagansiz. Pastdagi «Yangi e'lon» sahifasidan birinchi mahsulotingizni joylang.</p>
      ) : (
        <nav aria-label="Mundarija" style={{ display: 'flex', flexDirection: 'column' }}>
          {products.map((p, i) => (
            <button
              key={p.id}
              type="button"
              disabled={!interactive}
              className={['bk-toc-item', currentIndex === i ? 'on' : ''].join(' ').trim()}
              onClick={() => onGoTo(i)}
              data-toc={p.id}
            >
              <span className={['bk-dot', p.status].join(' ')} aria-hidden="true" />
              <span className="bk-toc-name">{p.name} {fmt(p.quantityKg)} kg</span>
              <span className="bk-toc-dots" aria-hidden="true" />
              <span className="bk-toc-no">{i + 1}</span>
            </button>
          ))}
        </nav>
      )}
      <button type="button" disabled={!interactive} className={['bk-toc-item', currentIndex === products.length ? 'on' : ''].join(' ').trim()} style={{ marginTop: '.6em', color: '#0a7a44', fontWeight: 700 }} onClick={() => onGoTo(products.length)} data-toc="add">
        <span aria-hidden="true">＋</span>
        <span className="bk-toc-name">Yangi e'lon qo'shish</span>
        <span className="bk-toc-dots" aria-hidden="true" />
        <span className="bk-toc-no">{addNo}</span>
      </button>
      <div style={{ marginTop: 'auto', paddingTop: '1.2em', fontSize: '.8em', color: '#7a6a47', fontStyle: 'italic' }}>
        <span>Jami e'lonlar:</span> <span>{products.length}</span>
      </div>
    </>
  );
}
