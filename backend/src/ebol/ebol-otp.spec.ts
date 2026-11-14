import { contractFingerprint, generatePickupCode, hashPickupCode, maskPhone, pickupCodeMatches } from './ebol-otp';

describe('e-BOL OTP yordamchilari', () => {
  it('kod har doim 4 xonali raqam', () => {
    for (let i = 0; i < 200; i++) expect(generatePickupCode()).toMatch(/^\d{4}$/);
  });

  it("hash kodga, turga, id va kalitga bog'liq; faqat to'g'ri kod mos keladi", () => {
    const h = hashPickupCode('secret', 'SHIPMENT', 'id-1', '4821');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(pickupCodeMatches('secret', 'SHIPMENT', 'id-1', '4821', h)).toBe(true);
    expect(pickupCodeMatches('secret', 'SHIPMENT', 'id-1', '4822', h)).toBe(false);
    expect(pickupCodeMatches('secret', 'SHIPMENT', 'id-2', '4821', h)).toBe(false); // boshqa yukka ishlamaydi
    expect(pickupCodeMatches('secret', 'LOCAL', 'id-1', '4821', h)).toBe(false);
    expect(pickupCodeMatches('other', 'SHIPMENT', 'id-1', '4821', h)).toBe(false);
    expect(pickupCodeMatches('secret', 'SHIPMENT', 'id-1', '4821', 'zz')).toBe(false); // buzilgan hash yiqitmaydi
  });

  it('shartnoma izi barqaror va har bir maydonga sezgir', () => {
    const p = { kind: 'SHIPMENT' as const, refId: 'a', driverId: 'd', farmerId: 'f', signedAt: new Date('2026-01-01T00:00:00Z') };
    expect(contractFingerprint(p)).toBe(contractFingerprint({ ...p }));
    expect(contractFingerprint(p)).not.toBe(contractFingerprint({ ...p, farmerId: 'x' }));
    expect(contractFingerprint(p)).not.toBe(contractFingerprint({ ...p, signedAt: new Date('2026-01-01T00:00:01Z') }));
  });

  it('telefon maskalanadi', () => expect(maskPhone('+998901234567')).toBe('+998901***67'));
});
