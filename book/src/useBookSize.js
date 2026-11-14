import { useEffect, useState } from 'react';
import { bookSize } from './lib.js';

/** Oyna o'lchamiga qarab kitob rejimi (ikki sahifa / bitta sahifa) va sahifa o'lchami */
export default function useBookSize() {
  const read = () => bookSize(window.innerWidth, window.innerHeight);
  const [size, setSize] = useState(read);
  useEffect(() => {
    let raf = 0;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setSize((prev) => { const n = read(); return n.pw === prev.pw && n.mode === prev.mode ? prev : n; })); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
  }, []);
  return size;
}
