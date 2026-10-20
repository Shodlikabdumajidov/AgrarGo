import React from 'react';
import { motion, useTransform } from 'framer-motion';

const Wheat = () => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M32 58V20" />
    <path d="M32 24c-7-1-10-6-10-11 6 0 10 4 10 11zM32 24c7-1 10-6 10-11-6 0-10 4-10 11z" fill="currentColor" />
    <path d="M32 36c-7-1-10-6-10-11 6 0 10 4 10 11zM32 36c7-1 10-6 10-11-6 0-10 4-10 11z" fill="currentColor" />
    <path d="M32 48c-7-1-10-6-10-11 6 0 10 4 10 11zM32 48c7-1 10-6 10-11-6 0-10 4-10 11z" fill="currentColor" />
    <path d="M32 14c-2-3-2-6 0-9 2 3 2 6 0 9z" fill="currentColor" />
  </svg>
);

/** Yopiq kitob muqovasi: to'q zumrad charm, tikuv, oltin bosma yozuvlar. coverA: 0 — yopiq, -180 — to'liq ochilgan */
export default function Cover({ coverA, left, pw, ph, onOpen, children }) {
  const shade = useTransform(coverA, [0, -90, -180], [0, 0.55, 0]);
  const fade = useTransform(coverA, [-180, -172, 0], [0, 1, 1]);
  return (
    <motion.div style={{ position: 'absolute', left, top: 0, width: pw, height: ph, perspective: pw * 6.5, perspectiveOrigin: '0% 50%', opacity: fade, zIndex: 10 }}>
      <motion.div
        role="button"
        tabIndex={0}
        aria-label="Kitobni ochish: Mening e'lonlarim"
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        style={{ position: 'absolute', inset: 0, transformOrigin: '0% 50%', rotateY: coverA, transformStyle: 'preserve-3d', cursor: 'pointer', outline: 'none' }}
      >
        <div className="bk-cover-face bk-leather">
          <div className="bk-stitch" />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.1em', padding: '3.6em 2em 3em 3.4em', textAlign: 'center' }}>
            <div className="bk-gold" style={{ width: '4.6em', height: '4.6em', color: '#f3c75a' }}><Wheat /></div>
            <div className="bk-gold" style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: '2.15em', lineHeight: 1.1, letterSpacing: '.01em', maxWidth: '6.4em' }}>Mening E'lonlarim</div>
            <div aria-hidden="true" style={{ width: '6em', height: '.14em', background: 'linear-gradient(90deg, transparent, #e8c25a, transparent)' }} />
            <div className="bk-emboss" style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: '1.25em', letterSpacing: '.38em', textTransform: 'uppercase', color: '#0b6b45' }}>AgrarGo</div>
          </div>
          <motion.div style={{ position: 'absolute', inset: 0, opacity: shade, background: 'linear-gradient(90deg, rgba(0,0,0,.1), rgba(0,0,0,.7))' }} />
        </div>
        <div className="bk-cover-face bk-cover-inside" style={{ transform: 'rotateY(180deg)' }}>
          <motion.div style={{ position: 'absolute', inset: 0, opacity: shade, background: 'linear-gradient(270deg, rgba(0,0,0,.1), rgba(0,0,0,.7))' }} />
        </div>
      </motion.div>
      {children}
    </motion.div>
  );
}
