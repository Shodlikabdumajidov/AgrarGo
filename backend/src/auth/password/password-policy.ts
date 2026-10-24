import { registerDecorator, ValidationOptions } from 'class-validator';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt faqat birinchi 72 baytni hisobga oladi

// Eng ko'p ishlatiladigan zaif parollar (harf va raqamli bo'lsa ham)
const COMMON = new Set([
  'password1', 'password12', 'password123', 'password1234', 'qwerty123', 'qwerty1234', 'qwerty12345',
  'abcd1234', 'abc12345', 'a1234567', 'a12345678', 'q1w2e3r4', 'iloveyou1', 'welcome1', 'admin123', 'admin1234',
  'agrargo1', 'agrargo123',
]);

/** Parol siyosati: 8 belgidan kam emas, 72 baytdan oshmasin, kamida bitta harf va bitta raqam, ommabop zaif parol emas. */
export function passwordProblems(password: unknown): string[] {
  if (typeof password !== 'string') return ["Parol matn bo'lishi kerak"];
  const problems: string[] = [];
  if ([...password].length < PASSWORD_MIN) problems.push(`Parol kamida ${PASSWORD_MIN} ta belgidan iborat bo'lishi kerak`);
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) problems.push("Parol juda uzun (ko'pi bilan 72 bayt)");
  if (!/\p{L}/u.test(password)) problems.push("Parolda kamida bitta harf bo'lishi kerak");
  if (!/\d/.test(password)) problems.push("Parolda kamida bitta raqam bo'lishi kerak");
  if (COMMON.has(password.toLowerCase())) problems.push("Bu parol juda oddiy va ko'p ishlatiladi. Boshqasini tanlang");
  if (password.length >= PASSWORD_MIN && new Set(password).size < 4) problems.push("Parolda juda kam xil belgi bor");
  return problems;
}

/** class-validator dekoratori: birinchi topilgan muammo xabar sifatida qaytadi. */
export function IsStrongPassword(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isStrongPassword',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => passwordProblems(value).length === 0,
        defaultMessage: (args) => passwordProblems(args?.value)[0] ?? "Parol talabga javob bermaydi",
      },
    });
}
