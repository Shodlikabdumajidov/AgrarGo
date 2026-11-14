// node --test tools/new-alphabet.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// js/new-alphabet.js brauzer API'laridan foydalanadi: sinov uchun minimal almashtirgichlar
const store = new Map();
global.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) }, addEventListener() {} };
global.document = { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [] };
const { convert, changedRange } = require('../js/new-alphabet.js');

test("o' / g' (barcha tutuq turlari)", () => {
  for (const q of ["'", '‘', '’', 'ʻ', 'ʼ', '`', '´']) {
    assert.equal(convert(`o${q}zbek`), 'özbek');
    assert.equal(convert(`O${q}zbek`), 'Özbek');
    assert.equal(convert(`g${q}ishli`), 'ğişli');
    assert.equal(convert(`G${q}ishli`), 'Ğişli');
  }
});

test('sh / ch va registr', () => {
  assert.equal(convert('sh Sh SH sH'), 'ş Ş Ş ş');
  assert.equal(convert('ch Ch CH cH'), 'ç Ç Ç ç');
  assert.equal(convert('shahar chorva SHAHAR CHORVA'), 'şahar çorva ŞAHAR ÇORVA');
});

test("boshqa tutuq ishlatilishi o'zgarmaydi (ma'no, san'at), idempotent", () => {
  assert.equal(convert("ma'no san'at"), "ma'no san'at");
  const once = convert("O'zbekiston, g'alla, shirin, choy");
  assert.equal(once, 'Özbekiston, ğalla, şirin, çoy');
  assert.equal(convert(once), once);
  assert.equal(convert(''), '');
});

test("changedRange: kiritilgan bo'lak topiladi", () => {
  assert.deepEqual(changedRange('abc', 'abXc'), { start: 2, end: 3 });
  assert.deepEqual(changedRange('', 'sh'), { start: 0, end: 2 });
  assert.deepEqual(changedRange('abc', 'ab'), { start: 2, end: 2 }); // o'chirish: bo'sh oraliq
  assert.deepEqual(changedRange('ss', 'sss'), { start: 2, end: 3 });
});
