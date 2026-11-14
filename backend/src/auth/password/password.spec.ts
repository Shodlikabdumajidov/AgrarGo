import { IsStrongPassword, passwordProblems } from './password-policy';
import { generateOtp, generateResetToken, hashOtp, hashResetToken, RESET_TOKEN_REGEX, safeEqualHex } from './otp';
import { validate } from 'class-validator';

describe('passwordProblems', () => {
  it("yaxshi parollarni qabul qiladi (parol1234 ham, uzun va unicode ham)", () => {
    for (const ok of ['parol1234', 'Abcdefg1', 'qwerty!7Zx', 'Yangi-parol-2026', "O'zbekiston2026", 'пароль12345']) {
      expect(passwordProblems(ok)).toEqual([]);
    }
  });

  it.each([
    ['qisqa', 'abc123', /kamida 8/],
    ['raqamsiz', 'abcdefghij', /raqam/],
    ['harfsiz', '1234567890', /harf/],
    ['ommabop', 'Password123', /oddiy/],
    ['ommabop 2', 'qwerty123', /oddiy/],
    ['kam xil belgi', 'aaaaaaa1', /kam xil/],
  ])('%s parolni rad etadi', (_n, pw, msg) => {
    expect(passwordProblems(pw).join(' ')).toMatch(msg);
  });

  it("72 baytdan uzun (bcrypt kesib tashlaydi) va matn bo'lmagan qiymatni rad etadi", () => {
    expect(passwordProblems('a1'.repeat(37)).join(' ')).toMatch(/72 bayt/); // 74 bayt
    expect(passwordProblems('я1'.repeat(30)).join(' ')).toMatch(/72 bayt/); // kirill harf 2 bayt: 90 bayt (60 belgi emas, baytlar hisoblanadi)
    expect(passwordProblems('абвгдежзиклмнопрстуфхцчш0123456789abcdefghijklmn')).toEqual([]); // 72 bayt: chegaraning o'zi qabul qilinadi
    expect(passwordProblems(undefined)).not.toEqual([]);
    expect(passwordProblems(12345678)).not.toEqual([]);
    expect(passwordProblems({ $ne: '' })).not.toEqual([]);
  });

  it("dekorator birinchi muammoni xabar qilib qaytaradi", async () => {
    class Dto {
      @IsStrongPassword()
      password!: string;
    }
    const bad = Object.assign(new Dto(), { password: 'short' });
    const errors = await validate(bad);
    expect(Object.values(errors[0].constraints!)[0]).toMatch(/kamida 8/);
    expect(await validate(Object.assign(new Dto(), { password: 'parol1234' }))).toHaveLength(0);
  });
});

describe('OTP', () => {
  it('kod 6 xonali raqam; boshidagi nollar saqlanadi; taqsimot ko‘p xil', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const c = generateOtp();
      expect(c).toMatch(/^\d{6}$/);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(380);
  });

  it("xesh kalitga va raqamga bog'liq: boshqa raqam/kalit bilan mos kelmaydi", () => {
    const h = hashOtp('secret-a', '+998901234567', '123456');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(safeEqualHex(h, hashOtp('secret-a', '+998901234567', '123456'))).toBe(true);
    expect(safeEqualHex(h, hashOtp('secret-a', '+998901234567', '123457'))).toBe(false);
    expect(safeEqualHex(h, hashOtp('secret-a', '+998907654321', '123456'))).toBe(false);
    expect(safeEqualHex(h, hashOtp('secret-b', '+998901234567', '123456'))).toBe(false);
    expect(h).not.toContain('123456');
  });

  it("safeEqualHex bo'sh yoki turli uzunlikdagi qiymatda xato bermaydi", () => {
    expect(safeEqualHex('', '')).toBe(false);
    expect(safeEqualHex('ab', 'abcd')).toBe(false);
    expect(safeEqualHex('zz', 'zz')).toBe(false); // hex emas
  });

  it('tiklash tokeni: 43 belgi, takrorlanmaydi, xeshi tokenning o‘zini oshkor qilmaydi', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).toMatch(RESET_TOKEN_REGEX);
    expect(a).not.toBe(b);
    expect(hashResetToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResetToken(a)).not.toContain(a);
    expect(hashResetToken(a)).toBe(hashResetToken(a));
  });
});
