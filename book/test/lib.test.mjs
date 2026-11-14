import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPages, planPath, bookSize, validateListing, toPayload, readOnboarded, writeOnboarded, fmtDate, STORAGE_KEY } from '../src/lib.js';

test('buildPages: har e\'lon alohida sahifa, oxirida yangi e\'lon sahifasi', () => {
  const pages = buildPages([{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual(pages.map((p) => p.type), ['listing', 'listing', 'add']);
  assert.deepEqual(buildPages([]).map((p) => p.type), ['add']);
});

test('planPath: qisqa masofada hamma sahifa, uzoqda ko\'pi bilan 4 ta varaq va oxiri maqsad', () => {
  assert.deepEqual(planPath(2, 2), []);
  assert.deepEqual(planPath(0, 2), [1, 2]);
  assert.deepEqual(planPath(1, 9), [3, 5, 7, 9]);
  assert.deepEqual(planPath(9, 1), [7, 5, 3, 1]);
  assert.equal(planPath(0, 50).at(-1), 50);
  assert.equal(planPath(0, 50).length, 4);
});

test('bookSize: keng ekranda ikki sahifa, mobilda bitta; o\'lcham chegaralangan', () => {
  assert.equal(bookSize(1440, 900).mode, 'spread');
  assert.equal(bookSize(1440, 900).pw, 470);
  assert.equal(bookSize(820, 1180).mode, 'spread');
  const m = bookSize(375, 812);
  assert.equal(m.mode, 'single');
  assert.ok(m.pw <= 375 - 28);
  assert.ok(Math.abs(m.ph / m.pw - 1 / 0.72) < 0.02);
  assert.ok(bookSize(320, 480).pw >= 250);
});

test('validateListing: serverdagi qoidalar', () => {
  assert.equal(validateListing({ name: 'Sabzi', category: 'Sabzavot', quantityKg: 300, pricePerKg: 2000 }).length, 0);
  assert.equal(validateListing({ name: '', category: '', quantityKg: 0, pricePerKg: -1 }).length, 4);
});

test('toPayload: tahrirda bo\'sh sana null, yangida umuman yuborilmaydi', () => {
  const v = { name: ' Sabzi ', category: 'Sabzavot', quantityKg: '300', pricePerKg: '2000', harvestDate: '' };
  assert.equal('harvestDate' in toPayload(v, false), false);
  assert.equal(toPayload(v, true).harvestDate, null);
  assert.equal(toPayload(v, false).name, 'Sabzi');
  assert.equal(toPayload({ ...v, harvestDate: '2026-09-01' }, false).harvestDate, '2026-09-01');
});

test('onboarding: localStorage holati saqlanadi; saqlash xatosi jim o\'tadi', () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(readOnboarded(st), false);
  writeOnboarded(st);
  assert.equal(mem.get(STORAGE_KEY), '1');
  assert.equal(readOnboarded(st), true);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(readOnboarded(broken), false);
  assert.doesNotThrow(() => writeOnboarded(broken));
});

test('fmtDate', () => {
  assert.equal(fmtDate('2026-09-05T00:00:00.000Z'), '05.09.2026');
  assert.equal(fmtDate(null), null);
  assert.equal(fmtDate('bad'), null);
});
