import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFaces, turnsForFace, spreadFaces, angleFromX, shouldComplete, bendProfile, bookShift, folioOf, TOC_PER_PAGE } from '../src/three/model.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Mahsulot ' + i, quantityKg: 10 + i, status: 'ACTIVE' }));

test('buildFaces: bo\'sh kitob — muqova, forzats, mundarija, yangi e\'lon (juft)', () => {
  const f = buildFaces([]);
  assert.deepEqual(f.map((x) => x.kind), ['cover', 'endpaper', 'toc', 'add']);
  assert.equal(f.length % 2, 0);
});

test('buildFaces: har doim juft soni; mundarija e\'lon sahifalariga to\'g\'ri havola qiladi', () => {
  for (const n of [1, 2, 3, 8, 9, 10, 25]) {
    const f = buildFaces(P(n));
    assert.equal(f.length % 2, 0, 'n=' + n);
    f.filter((x) => x.kind === 'toc').forEach((toc) => toc.items.forEach((it) => {
      assert.equal(f[it.face].kind, 'listing');
      assert.equal(f[it.face].product.id, it.id);
    }));
    const toc = f.filter((x) => x.kind === 'toc');
    assert.equal(toc.length, Math.ceil(n / TOC_PER_PAGE));
    assert.equal(f[toc.at(-1).addFace].kind, 'add');
    assert.equal(toc.filter((t) => t.withAdd).length, 1);
  }
});

test('turnsForFace va spreadFaces mos keladi', () => {
  assert.equal(turnsForFace(0), 0);
  assert.equal(turnsForFace(1), 1); // varaq 0 ag'darilsa orqa yuz (1) chapda
  assert.equal(turnsForFace(2), 1); // old yuz (2) o'ngda
  assert.equal(turnsForFace(3), 2);
  assert.equal(turnsForFace(4), 2);
  const L = 4;
  assert.deepEqual(spreadFaces(0, L), { left: null, right: 0 });
  assert.deepEqual(spreadFaces(1, L), { left: 1, right: 2 });
  assert.deepEqual(spreadFaces(L, L), { left: 2 * L - 1, right: null });
  for (let f = 1; f < 8; f++) { const s = spreadFaces(turnsForFace(f), 4); assert.ok(s.left === f || s.right === f); }
});

test('folioOf: mundarija — 1-bet', () => { assert.equal(folioOf(2), 1); assert.equal(folioOf(0), null); assert.equal(folioOf(1), null); });

test('angleFromX: chegaralarda 0 va PI', () => {
  assert.equal(angleFromX(5, 1.4), 0);
  assert.ok(Math.abs(angleFromX(0, 1.4) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(angleFromX(-9, 1.4) - Math.PI) < 1e-9);
});

test('shouldComplete: tezlik va burchak bo\'yicha', () => {
  assert.equal(shouldComplete(0.5, 1, 0), false);
  assert.equal(shouldComplete(2, 1, 0), true);
  assert.equal(shouldComplete(0.3, 1, 4), true); // tez siltash
  assert.equal(shouldComplete(2.5, 1, -4), false); // orqaga tez tortish
  assert.equal(shouldComplete(2.5, -1, 0), false);
  assert.equal(shouldComplete(1, -1, 0), true);
});

test('bendProfile: tekis holatlarda z=0, oraliqda bukiladi, uzunlik saqlanadi', () => {
  const w = 1.4, seg = 24;
  const flatR = bendProfile(0, 0.6, w, seg), flatL = bendProfile(Math.PI, 0.6, w, seg);
  assert.ok(Math.abs(flatR.at(-1).x - w) < 1e-9 && Math.abs(flatR.at(-1).z) < 1e-9);
  assert.ok(Math.abs(flatL.at(-1).x + w) < 1e-9 && Math.abs(flatL.at(-1).z) < 1e-6);
  const mid = bendProfile(Math.PI / 2, 0.6, w, seg);
  assert.ok(mid.at(-1).z > 0.5 * w * 0.8, 'varaq ko\'tarilgan');
  const len = mid.reduce((s, p, i) => (i ? s + Math.hypot(p.x - mid[i - 1].x, p.z - mid[i - 1].z) : 0), 0);
  assert.ok(Math.abs(len - w) < 1e-9, 'varaq cho\'zilmaydi');
});

test('bookShift: yopiq — chapga, ochiq — markazda, oxirida — o\'ngga', () => {
  const w = 1.4;
  assert.ok(Math.abs(bookShift(0, 0, w) + w / 2) < 1e-9);
  assert.ok(Math.abs(bookShift(Math.PI, 0, w)) < 1e-9);
  assert.ok(Math.abs(bookShift(Math.PI, Math.PI, w) - w / 2) < 1e-9);
});
