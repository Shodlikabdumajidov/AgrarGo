#!/usr/bin/env python3
"""Hero «Character Showcase» videolarining oq orqa fonini shaffof qiladi (alpha kanalli WebM, VP9) va shaffof poster (WebP) yaratadi.
Manba: repo ildizidagi P1.mp4, P2.mp4, P3.mp4 (o'zgarmaydi). Natija: images/showcase/p{1,2,3}.webm va p{1,2,3}.webp.
Usul: kadrning chetiga tutashgan deyarli oq hudud (flood-fill/komponent) fon deb olinadi; personajning ichidagi oq joylar (ko'z, qalpoq naqshi) saqlanadi.
Ishga tushirish: pip install opencv-python-headless numpy pillow && python3 tools/make-showcase-alpha.py   (ffmpeg kerak)"""
import os, subprocess, sys
import cv2, numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'images', 'showcase')
SIZES = {1: (752, 1024), 2: (752, 1024), 3: (720, 1280)}   # P3 4K (2160x3840) mobil uchun 720x1280 ga kichraytiriladi
THRESH = 236   # R,G,B hammasi shundan yuqori bo'lsa «deyarli oq»
KERNEL = np.ones((3, 3), np.uint8)

def cutout(rgb):
    near_white = (rgb.min(axis=2) >= THRESH).astype(np.uint8)
    n, lab = cv2.connectedComponents(near_white, connectivity=4)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border != 0]) & (near_white == 1)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    alpha = cv2.erode(alpha, KERNEL, iterations=1)            # oq halo (fringe) qolmasin
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.9)               # yumshoq chekka
    return np.dstack([rgb, alpha])

def frames(src, w, h):
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-an', '-vf', f'scale={w}:{h}:flags=lanczos', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    size = w * h * 3
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size: break
        yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    p.wait()

def main():
    os.makedirs(OUT, exist_ok=True)
    for n, (w, h) in SIZES.items():
        src = os.path.join(ROOT, f'P{n}.mp4')
        out = os.path.join(OUT, f'p{n}.webm')
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}', '-r', '30', '-i', '-',
                                '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '4', '-auto-alt-ref', '0', '-an', out], stdin=subprocess.PIPE)
        poster_done = False
        for i, rgb in enumerate(frames(src, w, h)):
            rgba = cutout(rgb)
            enc.stdin.write(rgba.tobytes())
            if i == 12 and not poster_done:
                im = Image.fromarray(rgba, 'RGBA'); im = im.resize((480, int(480 * h / w)), Image.LANCZOS)
                im.save(os.path.join(OUT, f'p{n}.webp'), 'WEBP', quality=82, method=6); poster_done = True
        enc.stdin.close(); enc.wait()
        print(f'p{n}: {os.path.getsize(out) // 1024} KB webm (alpha)')

if __name__ == '__main__':
    sys.exit(main())
