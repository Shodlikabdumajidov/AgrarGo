import React from 'react';

/** Qog'oz sahifa: tekstura, kitob o'rtasidagi (bukilish) soya va sahifa raqami */
export default function PageSheet({ side = 'right', pw, ph, folio, children, innerRef }) {
  return (
    <div className={['bk-page bk-paper', side].join(' ')} style={{ width: pw, height: ph, left: 0 }}>
      <div className={side === 'right' ? 'bk-gutter-r' : 'bk-gutter-l'} />
      <div className="bk-inner" ref={innerRef}>{children}</div>
      {folio ? <div className="bk-folio">— {folio} —</div> : null}
    </div>
  );
}
