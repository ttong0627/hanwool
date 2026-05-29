# -*- coding: utf-8 -*-
"""
프론트엔드 favicon.svg 디자인을 PIL로 재현해 Android 런처 아이콘 생성.
- 한옥 처마 + 시장 건물 + 배송 경로 점 (주황 그라데이션 원)
- legacy(ic_launcher) + adaptive(foreground) + assets 원본 모두 갱신
"""
import os
import numpy as np
from PIL import Image, ImageDraw

S = 1024
scale = S / 48.0
def s(v): return v * scale

WHITE = (255, 255, 255, 255)
ORANGE = (0xEA, 0x58, 0x06, 255)


def cubic(p0, p1, p2, p3, n=60):
    pts = []
    for i in range(n + 1):
        u = i / n; v = 1 - u
        x = v**3*p0[0] + 3*v*v*u*p1[0] + 3*v*u*u*p2[0] + u**3*p3[0]
        y = v**3*p0[1] + 3*v*v*u*p1[1] + 3*v*u*u*p2[1] + u**3*p3[1]
        pts.append((s(x), s(y)))
    return pts


def render_favicon() -> Image.Image:
    # 그라데이션 원 배경 (#fb923c → #c2410c, 대각선)
    yy, xx = np.mgrid[0:S, 0:S]
    t = (xx + yy) / (2.0 * S)
    c0 = np.array([0xFB, 0x92, 0x3C]); c1 = np.array([0xC2, 0x41, 0x0C])
    grad = (c0[None, None, :] * (1 - t[..., None]) + c1[None, None, :] * t[..., None]).astype('uint8')
    rgba = np.dstack([grad, np.full((S, S), 255, 'uint8')])
    pim = Image.fromarray(rgba, 'RGBA')

    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, S - 1, S - 1], fill=255)
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    base.paste(pim, (0, 0), mask)

    d = ImageDraw.Draw(base)

    # 처마 곡선
    roof = cubic((9, 22.5), (9, 22.5), (15, 17), (24, 13)) + \
           cubic((24, 13), (33, 17), (39, 22.5), (39, 22.5))
    d.line(roof, fill=WHITE, width=int(2.8 * scale), joint='curve')
    r = 1.4 * scale
    for (x, y) in [roof[0], roof[-1]]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)

    # 지붕 꼭대기 점
    d.ellipse([s(22), s(9.5), s(26), s(13.5)], fill=WHITE)
    # 건물 몸체
    d.rounded_rectangle([s(15), s(22.5), s(33), s(35.5)], radius=s(2), fill=WHITE)
    # 문
    d.rounded_rectangle([s(20.5), s(28), s(27.5), s(35.5)], radius=s(1.5), fill=ORANGE)
    # 배송 경로 점
    d.ellipse([s(33.5), s(6.5), s(40.5), s(13.5)], fill=WHITE)
    d.ellipse([s(35), s(8), s(39), s(12)], fill=ORANGE)

    return base


def main():
    base = render_favicon()

    # assets 원본 (다음 prebuild용)
    base.save('assets/icon.png')

    # adaptive foreground: 안전영역 고려 60% 축소 + 투명 패딩
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    inner = base.resize((int(S * 0.60), int(S * 0.60)), Image.LANCZOS)
    off = (S - inner.width) // 2
    fg.paste(inner, (off, off), inner)
    fg.save('assets/adaptive-icon.png')

    # Android mipmap 해상도
    res = 'android/app/src/main/res'
    launcher_sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    fg_sizes = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}

    for dpi, px in launcher_sizes.items():
        folder = f'{res}/mipmap-{dpi}'
        ic = base.resize((px, px), Image.LANCZOS)
        ic.save(f'{folder}/ic_launcher.webp', 'WEBP', quality=95)
        ic.save(f'{folder}/ic_launcher_round.webp', 'WEBP', quality=95)

    for dpi, px in fg_sizes.items():
        folder = f'{res}/mipmap-{dpi}'
        fgi = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        inner_px = int(px * 0.60)
        ii = base.resize((inner_px, inner_px), Image.LANCZOS)
        o = (px - inner_px) // 2
        fgi.paste(ii, (o, o), ii)
        fgi.save(f'{folder}/ic_launcher_foreground.webp', 'WEBP', quality=95)

    print('아이콘 생성 완료: legacy + adaptive foreground + assets')


if __name__ == '__main__':
    main()
