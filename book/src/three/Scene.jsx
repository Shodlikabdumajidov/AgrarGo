import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { angleFromX, bendProfile, bookShift, shouldComplete } from './model.js';
import { TH, TW } from './paint.js';

export const PAGE_W = 1.4;
export const PAGE_H = PAGE_W * (TH / TW);
const SEG = 26; // varaq bo'ylab bo'laklar soni (bukilish silliqligi)
const EPS = 0.0042; // qatlamlar orasidagi masofa (z-fighting bo'lmasligi uchun)
const TILT = -0.2; // kitob biroz yuqoridan ko'rinadi
const smooth = (x) => x * x * (3 - 2 * x);
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

/** Varaq: bukiladigan 2 tomonli sahifa (old/orqa yuz alohida mesh, bitta geometriya) */
function Leaf({ j, ctrl, front, back, cover }) {
  const group = useRef(), fRef = useRef(), bRef = useRef();
  const sw = cover ? 1.035 : 1, sh = cover ? 1.045 : 1;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = (SEG + 1) * 2;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i <= SEG; i++) { uv.set([i / SEG, 1], i * 4); uv.set([i / SEG, 0], i * 4 + 2); }
    for (let i = 0; i < SEG; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const st = useRef({ bend: 0, last: -1 });

  useEffect(() => { ctrl.meshes[j] = [fRef.current, bRef.current]; return () => { delete ctrl.meshes[j]; }; }, [j, ctrl]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    let active = false;
    if (!ctrl.dragging[j]) {
      if (ctrl.delay[j] > 0) { ctrl.delay[j] -= dt; active = true; }
      else {
        const err = ctrl.target[j] - ctrl.ang[j];
        if (Math.abs(err) > 1e-4 || Math.abs(ctrl.vel[j]) > 1e-3) {
          ctrl.vel[j] += (err * 62 - ctrl.vel[j] * 12.5) * dt;
          ctrl.ang[j] += ctrl.vel[j] * dt;
          if (ctrl.ang[j] < 0) { ctrl.ang[j] = 0; ctrl.vel[j] = 0; }
          if (ctrl.ang[j] > Math.PI) { ctrl.ang[j] = Math.PI; ctrl.vel[j] = 0; }
          active = true;
        } else { ctrl.ang[j] = ctrl.target[j]; ctrl.vel[j] = 0; }
      }
    } else active = true;
    const theta = ctrl.ang[j];
    st.current.bend = damp(st.current.bend, Math.max(-1, Math.min(1, ctrl.vel[j] * 0.28)), 14, dt);
    const key = theta + st.current.bend * 0.01 + ctrl.t * 7;
    if (key !== st.current.last || active) {
      st.current.last = key;
      const lag = 0.62 * (0.35 + st.current.bend * 0.95);
      const prof = bendProfile(theta, lag, PAGE_W * sw, SEG);
      const m = smooth(theta / Math.PI);
      const zoff = ((1 - m) * (ctrl.L - j) + m * j) * EPS;
      const pos = geo.attributes.position.array, h = (PAGE_H * sh) / 2;
      for (let i = 0; i <= SEG; i++) {
        const p = prof[i];
        pos.set([p.x, h, p.z + zoff], i * 6); pos.set([p.x, -h, p.z + zoff], i * 6 + 3);
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
    }
    if (active) state.invalidate();
  });

  const common = { roughness: cover ? 0.5 : 0.88, metalness: cover ? 0.12 : 0, emissive: '#ffffff', emissiveIntensity: cover ? 0.05 : 0.24 };
  return (
    <group ref={group}>
      <mesh ref={fRef} geometry={geo} userData={{ leaf: j, side: 'front' }} frustumCulled={false}>
        <meshStandardMaterial {...common} map={front || null} emissiveMap={front || null} side={THREE.FrontSide} color={front ? '#ffffff' : '#10201a'} />
      </mesh>
      <mesh ref={bRef} geometry={geo} userData={{ leaf: j, side: 'back' }} frustumCulled={false}>
        <meshStandardMaterial {...common} map={back || null} emissiveMap={back || null} side={THREE.BackSide} color={back ? '#ffffff' : '#10201a'} />
      </mesh>
    </group>
  );
}

/** Orqa qopqoq (o'ng taxta) va umurtqa — kitobga qalinlik va og'irlik beradi */
function Binding({ endpaper, L }) {
  const leather = useMemo(() => new THREE.MeshStandardMaterial({ color: '#06301f', roughness: 0.55, metalness: 0.1 }), []);
  useEffect(() => () => leather.dispose(), [leather]);
  const depth = 0.05;
  return (
    <group>
      <mesh position={[PAGE_W / 2 + 0.018, 0, -0.03 - L * EPS * 0.5]} material={leather}>
        <boxGeometry args={[PAGE_W * 1.035 + 0.03, PAGE_H * 1.045, depth]} />
      </mesh>
      <mesh position={[PAGE_W / 2 + 0.018, 0, -0.03 - L * EPS * 0.5 + depth / 2 + 0.0005]} rotation={[0, 0, 0]}>
        <planeGeometry args={[PAGE_W * 0.99, PAGE_H * 0.995]} />
        <meshStandardMaterial map={endpaper || null} emissiveMap={endpaper || null} emissive="#ffffff" emissiveIntensity={0.3} roughness={0.9} color={endpaper ? '#ffffff' : '#0a2a1e'} />
      </mesh>
      <mesh position={[0, 0, -0.045 - L * EPS * 0.5]} material={leather}>
        <boxGeometry args={[0.085, PAGE_H * 1.045, 0.075]} />
      </mesh>
    </group>
  );
}

/** Kamera, kitob joylashuvi va yorug'lik. Hammasi varaq burchaklariga qarab silliq harakatlanadi. */
function Rig({ ctrl, children }) {
  const group = useRef();
  const { camera, size } = useThree();
  const cur = useRef({ x: 0, focus: 1, d: 6, init: false });
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const a0 = ctrl.ang[0] || 0, aL = ctrl.ang[ctrl.L - 1] || 0;
    const openFrac = (a0 / Math.PI) * (1 - aL / Math.PI);
    const c = cur.current;
    c.focus = damp(c.focus, ctrl.narrow ? (ctrl.side === 'L' ? -1 : 1) : 0, 7, dt);
    const targetX = bookShift(a0, aL, PAGE_W) - (ctrl.narrow ? c.focus * (PAGE_W / 2) * openFrac : 0);
    const aspect = size.width / size.height;
    const needW = (ctrl.narrow ? PAGE_W * 1.14 : PAGE_W * (1.16 + 1.04 * openFrac)) * 1.04;
    const needH = PAGE_H * 1.1;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const dTarget = Math.max(needH / (2 * tan), needW / (2 * tan * aspect));
    if (!c.init) { c.x = targetX; c.d = dTarget; c.init = true; }
    const px = c.x, pd = c.d;
    c.x = damp(c.x, targetX, 9, dt); c.d = damp(c.d, dTarget, 6, dt);
    if (group.current) { group.current.position.x = c.x; group.current.rotation.x = TILT; }
    camera.position.set(0, -0.05, c.d); camera.lookAt(0, -0.05, 0);
    if (Math.abs(c.x - px) > 1e-5 || Math.abs(c.d - pd) > 1e-5 || Math.abs(c.x - targetX) > 1e-4 || Math.abs(c.d - dTarget) > 1e-4 || Math.abs(c.focus - (ctrl.narrow ? (ctrl.side === 'L' ? -1 : 1) : 0)) > 1e-3) state.invalidate();
  });
  return <group ref={group}>{children}</group>;
}

/** Sichqoncha/sensor: bosish, sudrab varaqlash (sahifa chekkasi kursorga ergashadi), hover */
function Controller({ ctrl, groupRef, handlers }) {
  const { gl, camera, raycaster, invalidate } = useThree();
  const h = useRef(handlers); h.current = handlers;
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';
    const ndc = new THREE.Vector2();
    const setRay = (e) => { const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
    const pick = () => {
      const objs = ctrl.meshes.filter(Boolean).flat().filter(Boolean);
      const hit = raycaster.intersectObjects(objs, false)[0];
      if (!hit) return null;
      const { leaf, side } = hit.object.userData;
      const face = leaf * 2 + (side === 'back' ? 1 : 0);
      const u = hit.uv ? hit.uv.x : 0, v = hit.uv ? hit.uv.y : 0;
      const tu = side === 'back' ? 1 - u : u;
      const px = tu * TW, py = (1 - v) * TH;
      const region = (ctrl.textures[face]?.hits || []).find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null;
      return { face, leaf, side, u, region };
    };
    const localX = () => {
      const g = groupRef.current; if (!g) return 0;
      g.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const o = raycaster.ray.origin.clone().applyMatrix4(inv), d = raycaster.ray.direction.clone().transformDirection(inv);
      if (Math.abs(d.z) < 1e-6) return 0;
      return o.x + (-o.z / d.z) * d.x - 0; // spine x = 0 (guruh siljishi guruh ichida hisobga olingan)
    };
    let down = null;
    const settled = (j) => Math.abs(ctrl.ang[j] - ctrl.target[j]) < 0.05 && ctrl.delay[j] <= 0;

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      setRay(e);
      down = { x: e.clientX, y: e.clientY, hit: pick(), drag: null, id: e.pointerId };
      try { el.setPointerCapture(e.pointerId); } catch { /* ba'zi brauzerlar */ }
    };
    const onMove = (e) => {
      setRay(e);
      if (!down) {
        const hit = pick();
        el.style.cursor = hit && (hit.region || hit.face === 0 || hit.u > 0.82) ? 'pointer' : hit ? 'grab' : 'default';
        return;
      }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 0.8) {
        const dir = dx < 0 ? 1 : -1;
        const leaf = dir === 1 ? ctrl.t : ctrl.t - 1;
        if (leaf >= 0 && leaf < ctrl.L && settled(leaf)) { down.drag = { dir, leaf, last: ctrl.ang[leaf], t: performance.now(), vel: 0 }; ctrl.dragging[leaf] = true; el.style.cursor = 'grabbing'; h.current.onDragStart && h.current.onDragStart(); }
      }
      if (down.drag) {
        const d = down.drag, now = performance.now();
        const th = angleFromX(localX(), PAGE_W);
        const dtt = Math.max(1, now - d.t) / 1000;
        d.vel = d.vel * 0.6 + ((th - d.last) / dtt) * 0.4; d.last = th; d.t = now;
        ctrl.ang[d.leaf] = th; ctrl.vel[d.leaf] = d.vel * 0.5;
        invalidate();
      }
    };
    const onUp = (e) => {
      if (!down) return;
      const d = down.drag, dn = down; down = null;
      try { el.releasePointerCapture(dn.id); } catch { /* */ }
      if (d) {
        ctrl.dragging[d.leaf] = false;
        const complete = shouldComplete(d.last, d.dir, d.vel);
        const turned = d.dir === 1 ? complete : !complete; // varaq oxirida chapdami?
        ctrl.target[d.leaf] = turned ? Math.PI : 0;
        const newT = d.dir === 1 ? (complete ? ctrl.t + 1 : ctrl.t) : (complete ? ctrl.t - 1 : ctrl.t);
        ctrl.t = newT; h.current.onTurned(newT, d.dir, complete);
        invalidate();
        el.style.cursor = 'default';
        return;
      }
      if (Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 8) return;
      const hit = dn.hit;
      if (!hit) return;
      if (hit.region && hit.region.go != null) return h.current.onGoFace(hit.region.go);
      if (hit.region && hit.region.act === 'add') return h.current.onAdd();
      if (hit.face === 0) return h.current.onTurnTo(1);
      if (hit.u > 0.82) return h.current.onTurnTo(hit.side === 'front' ? ctrl.t + 1 : ctrl.t - 1);
      h.current.onSelect(hit.face);
    };
    const onLeave = () => { if (!down) el.style.cursor = 'default'; };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('pointerleave', onLeave);
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('pointerleave', onLeave); };
  }, [gl, camera, raycaster, ctrl, groupRef, invalidate]);
  return null;
}

export default function BookScene({ ctrl, textures, handlers }) {
  const L = ctrl.L;
  const groupRef = useRef();
  useEffect(() => { ctrl.textures = textures; }, [ctrl, textures]);
  ctrl.textures = textures;
  const { invalidate } = useThree();
  useEffect(() => { invalidate(); }, [textures, L, invalidate]);
  const leaves = Array.from({ length: L }, (_, j) => j);
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[-2.2, 3.2, 4]} intensity={1.5} />
      <pointLight position={[0, 0.2, -2.4]} intensity={9} distance={7} color="#00E676" />
      <pointLight position={[2.6, -2.2, 2.2]} intensity={2.2} distance={8} color="#7dffc0" />
      <Rig ctrl={ctrl}>
        <group ref={(g) => { groupRef.current = g; }}>
          <Binding endpaper={textures[1]?.tex} L={L} />
          {leaves.map((j) => <Leaf key={j} j={j} ctrl={ctrl} front={textures[2 * j]?.tex} back={textures[2 * j + 1]?.tex} cover={j === 0} />)}
        </group>
      </Rig>
      <Controller ctrl={ctrl} groupRef={groupRef} handlers={handlers} />
    </>
  );
}
