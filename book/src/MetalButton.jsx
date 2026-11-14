import React from 'react';

/** Kitob dizayniga mos metall tugma. tone: brass (default) | steel | copper | green | ghost */
export default function MetalButton({ tone = 'brass', icon, children, ...rest }) {
  return (
    <button type="button" className={['bk-metal', tone === 'brass' ? '' : tone].join(' ').trim()} {...rest}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
