import { detectImageExt } from './profile.service';

const pad = (b: number[]) => Buffer.concat([Buffer.from(b), Buffer.alloc(32)]);

describe('detectImageExt', () => {
  it('JPG, PNG va WEBP ni haqiqiy baytlar bo‘yicha aniqlaydi', () => {
    expect(detectImageExt(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(detectImageExt(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectImageExt(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]))).toBe('webp');
  });

  it("boshqa fayllarni (skript, GIF, SVG, bo'sh) rad etadi", () => {
    expect(detectImageExt(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(detectImageExt(Buffer.from('GIF89a' + 'x'.repeat(30)))).toBeNull();
    expect(detectImageExt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageExt(Buffer.alloc(0))).toBeNull();
  });
});
