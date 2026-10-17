import { buildCorsOptions } from './cors';

const check = (opts: ReturnType<typeof buildCorsOptions>, origin: string | undefined) =>
  new Promise<boolean>((resolve, reject) =>
    (opts.origin as (o: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => void)(origin, (err, ok) =>
      err ? reject(err) : resolve(!!ok),
    ),
  );

describe('buildCorsOptions', () => {
  it("development'da ro'yxat bo'sh bo'lsa hamma manzilga ruxsat", () => {
    expect(buildCorsOptions([], false).origin).toBe(true);
  });

  it("production'da faqat ro'yxatdagi manzillarga ruxsat", async () => {
    const opts = buildCorsOptions(['https://agrargo.uz'], true);
    await expect(check(opts, 'https://agrargo.uz')).resolves.toBe(true);
    await expect(check(opts, 'https://evil.example')).resolves.toBe(false);
    await expect(check(opts, 'https://agrargo.uz.evil.example')).resolves.toBe(false);
    await expect(check(opts, 'null')).resolves.toBe(false);
  });

  it("production'da ro'yxat bo'sh bo'lsa hech kimga ruxsat yo'q (Origin yo'q so'rovlardan tashqari)", async () => {
    const opts = buildCorsOptions([], true);
    await expect(check(opts, 'https://agrargo.uz')).resolves.toBe(false);
    await expect(check(opts, undefined)).resolves.toBe(true);
  });

  it("faqat kerakli sarlavhalar va cookie'siz rejim", () => {
    const opts = buildCorsOptions(['https://agrargo.uz'], true);
    expect(opts.credentials).toBe(false);
    expect(opts.allowedHeaders).toEqual(['Content-Type', 'Authorization']);
  });
});
