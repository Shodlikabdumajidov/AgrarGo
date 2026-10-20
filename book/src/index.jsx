import React from 'react';
import { createRoot } from 'react-dom/client';
import BookApp from './BookApp.jsx';
import css from './book.css';

const STYLE_ID = 'agrar-book-css';

/**
 * Kitobni `container` ichiga o'rnatadi.
 * props: { products, onCreate(payload), onUpdate(id, payload), onArchive(product), onDelete(id), onClose() }
 * Qaytaradi: { update(partialProps), unmount() }
 */
export function mount(container, props) {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }
  let current = { ...props };
  const root = createRoot(container);
  const render = () => root.render(<BookApp {...current} />);
  render();
  return {
    update(next) { current = { ...current, ...next }; render(); },
    unmount() { root.unmount(); },
  };
}
