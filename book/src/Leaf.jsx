import React from 'react';
import { motion, useTransform } from 'framer-motion';

const STRIPS = 14; // varaq 14 ta tik bo'lakka bo'linadi: bukilish (paper curl) shu bo'laklarning nisbiy burilishidan hosil bo'ladi
const BEND = 11; // bir bo'lakning eng katta nisbiy burilishi (daraja)
const rad = (v) => (Math.abs(v) * Math.PI) / 180;

function Strip({ i, w, pw, ph, angle, bend, shade, renderFace }) {
  return (
    <motion.div
      className="bk-strip"
      style={{ left: i === 0 ? 0 : w, width: w + 0.75, height: ph, transformOrigin: '0% 50%', rotateY: i === 0 ? angle : bend }}
    >
      <div className="bk-face bk-paper">
        <div style={{ position: 'absolute', left: -i * w, top: 0, width: pw, height: ph }}>{renderFace()}</div>
        <motion.div style={{ position: 'absolute', inset: 0, opacity: shade, background: `rgba(20,12,0,${(0.12 + 0.5 * (i / STRIPS)).toFixed(3)})` }} />
      </div>
      <div className="bk-face back">
        <motion.div style={{ position: 'absolute', inset: 0, opacity: shade, background: `rgba(20,12,0,${(0.5 - 0.4 * (i / STRIPS)).toFixed(3)})` }} />
      </div>
      {i < STRIPS - 1 ? <Strip i={i + 1} w={w} pw={pw} ph={ph} angle={angle} bend={bend} shade={shade} renderFace={renderFace} /> : null}
    </motion.div>
  );
}

/**
 * Qog'oz varaq. `angle` (Framer Motion MotionValue): 0 — o'ng sahifada yotibdi, -180 — chap tomonga o'tib bo'ldi.
 * Mexanizm: ildiz bo'lak (kitob o'rtasida mahkamlangan) burchak bo'yicha buriladi, qolgan bo'laklar ichma-ich joylashgan va
 * har biri sin·cos egri chizig'i bo'yicha qo'shimcha buriladi → varaq o'rtasida bukiladi, boshida va oxirida tekis bo'ladi.
 * Soya burchakka qarab o'zgaradi: 90° da eng qorong'i.
 */
export default function Leaf({ angle, left, pw, ph, renderFace }) {
  const w = pw / STRIPS;
  const bend = useTransform(angle, (v) => -Math.sign(v || -1) * BEND * Math.sin(rad(v)) * Math.cos(rad(v)) * 2);
  const shade = useTransform(angle, (v) => Math.sin(rad(v)) * 0.9);
  const fade = useTransform(angle, [-180, -170, 0], [0, 1, 1]);
  return (
    <motion.div className="bk-leaf" style={{ left, width: pw, height: ph, perspective: pw * 6.5, perspectiveOrigin: '0% 50%', opacity: fade }} aria-hidden="true">
      <Strip i={0} w={w} pw={pw} ph={ph} angle={angle} bend={bend} shade={shade} renderFace={renderFace} />
    </motion.div>
  );
}
