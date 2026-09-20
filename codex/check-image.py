#!/usr/bin/env python3
"""codex 가 만든 그림이 진짜 생성물인지, 알파가 진짜인지 잰다.

  python3 ~/.claude/skills/codex/check-image.py <png> [<png>…]

가짜(코드로 그린 것) = 고유색 수백 미만 또는 단일색 블록이 절반 초과.
통째로 투명한 칸은 세지 않는다 — 투명 그림의 빈 자리를 「단일색」으로 세면 진짜를 가짜로 오판한다.
"""
import sys
from PIL import Image

B = 32
bad = 0
for path in sys.argv[1:]:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    n = s = 0
    for y in range(0, h - B + 1, B):
        for x in range(0, w - B + 1, B):
            c = im.crop((x, y, x + B, y + B))
            if c.getchannel("A").getextrema()[1] == 0:
                continue
            n += 1
            s += len(set(c.getdata())) == 1
    hist = im.getchannel("A").histogram()
    uniq = len(set(p[:3] for p in im.getdata() if p[3]))
    fake = uniq < 1000 or (n and s * 2 > n)
    bad += fake
    print(f"{'가짜?' if fake else '진짜 '} {path}\n"
          f"      {w}x{h} · 고유색 {uniq} · 단일색 블록 {s}/{n}"
          f" · 투명 {100 * hist[0] / (w * h):.1f}% · 반투명 {100 * sum(hist[1:240]) / (w * h):.1f}%")
sys.exit(1 if bad else 0)
