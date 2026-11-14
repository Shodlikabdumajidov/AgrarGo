import React from 'react';
import { createRoot } from 'react-dom/client';
import BookApp from './BookApp.jsx';
import Book3D from './three/Book3D.jsx';
import css from './book.css';

const STYLE_ID = 'agrar-book-css';
/** Bundle versiyasi: js/app.js eski (keshdagi) nusxani shu raqam bo'yicha aniqlaydi */
export const version = 3;

/** Diagnostika uchun: WebGL mavjudmi (qaror shunga bog'liq emas — 3D kitob doim avval sinab ko'riladi) */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ok = !!(gl && typeof gl.getParameter === 'function');
    if (gl && gl.getExtension) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
    return ok;
  } catch { return false; }
}

/** FAQAT haqiqiy xato (masalan, WebGL kontekst yaratilmadi) bo'lsa CSS-3D kitobni ko'rsatadi va sababini konsolga yozadi */
class Guard extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { if (typeof console !== 'undefined') console.error('[AgrarBook] 3D kitob ishga tushmadi, zaxira (CSS) kitob ochildi. Sabab:', err && (err.message || err), '| WebGL mavjud:', webglAvailable()); }
  render() { return this.state.failed ? <BookApp {...this.props.bookProps} /> : this.props.children; }
}

/**
 * Kitobni `container` ichiga o'rnatadi.
 * props: { products, onCreate(payload), onUpdate(id, payload), onArchive(product), onDelete(id), onClose(), renderer?: 'webgl' | 'css' }
 * Qaytaradi: { update(partialProps), unmount(), renderer } — renderer: 'webgl' (3D) yoki 'css' (ataylab tanlangan)
 */
export function mount(container, props) {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }
  let current = { ...props };
  const useWebgl = current.renderer !== 'css'; // 'css' — faqat ataylab (dasturchi) tanlansa
  const root = createRoot(container);
  const render = () => root.render(useWebgl ? <Guard bookProps={current}><Book3D {...current} /></Guard> : <BookApp {...current} />);
  render();
  return {
    renderer: useWebgl ? 'webgl' : 'css',
    update(next) { current = { ...current, ...next }; render(); },
    unmount() { root.unmount(); },
  };
}

/** Muqobil nom: AgrarBook.render(container, props) === AgrarBook.mount(container, props) */
export const render = mount;
