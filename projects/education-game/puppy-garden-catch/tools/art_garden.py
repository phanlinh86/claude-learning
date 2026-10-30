#!/usr/bin/env python3
"""Puppy Garden Catch: extra garden sprites (character artist B), same style as tools/art_animals.py.

Writes game/assets/default/items/{fruit_pear,fruit_cherry,fruit_carrot,animal_pig,animal_snail,animal_ladybug}.svg
(viewBox 0 0 128 128, centred, white sticker border + faint drop shadow). Reuses the Art helper from
art_animals.py, so the existing sprites are untouched. All art is original, built from simple primitives.

Silhouette notes (they must read at 64 px and differ from neighbours):
  * pear   = yellow-green, narrow neck + wide bottom, tilted, brown stem + leaf (apple is red and round)
  * cherry = TWO small glossy red balls on a V of thin stems + one leaf (strawberry is one seeded heart)
  * carrot = long orange cone lying diagonally with a big green leaf fan
  * pig    = pink round face, big oval snout with two nostrils, folded triangle ears, curly tail
  * snail  = big spiral shell (warm honey) on a soft mint body with two eye stalks
  * ladybug= red round dome, black head, black centre line + spots, tiny legs/antennae

Usage: python3 tools/art_garden.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_animals import Art, E, C, P, R, paint, mirror_d, mix, f, OUT  # noqa: E402


# =============================== FRUIT ===============================
def pear():
    a = Art('pear')
    g, dk = '#C9DC4A', '#7E8E14'
    lf, ldk = '#5CC04A', '#2C7F22'
    # stem + leaf
    a.line('M 64 34 C 64 26 66 20 70 14', '#7A4A24', 5, sil=True)
    a.part(P('M 69 24 C 76 12 94 10 102 16 C 96 30 80 34 69 24 Z'), lf, ldk, shade=False, sw=2.6,
           inner=paint(P('M 73 24 C 83 20 91 18 98 17'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".6"' % ldk))
    # body: narrow neck, wide round bottom
    body = ('M 64 30 C 54 30 50 38 50 48 C 50 58 44 62 36 72 C 26 84 26 102 40 110 '
            'C 52 117 76 117 88 110 C 102 102 102 84 92 72 C 84 62 78 58 78 48 C 78 38 74 30 64 30 Z')
    a.part(P(body), g, dk, off=(-6, -6), shade_t=.42, hl=(46, 84, 7, 13, 20),
           inner=paint(E(80, 100, 14, 8, -20), 'fill="#F2C24A" opacity=".45"'))
    a.flat(E(56, 50, 3, 5, 10), '#FFFFFF', opacity=.6)
    # tiny freckles
    for (x, y) in ((70, 70), (80, 86), (60, 94), (74, 104), (88, 96)):
        a.flat(C(x, y, 1.3), dk, opacity=.35)
    return a


def cherry():
    a = Art('cherry')
    r, dk = '#E0253F', '#8E1024'
    stem, sdk = '#6FA834', '#3E6A16'
    lf, ldk = '#5CC04A', '#2C7F22'
    # two stems meeting at a knot up top
    a.line('M 40 82 C 44 60 56 36 70 18', stem, 4.2, sil=True)
    a.line('M 88 88 C 86 64 78 38 70 18', stem, 4.2, sil=True)
    a.line('M 40 82 C 44 60 56 36 70 18 M 88 88 C 86 64 78 38 70 18', sdk, 1.4, opacity=.45)
    # leaf off the knot
    a.part(P('M 71 20 C 80 8 100 8 110 16 C 102 30 84 32 71 20 Z'), lf, ldk, shade=False, sw=2.6,
           inner=paint(P('M 75 20 C 86 16 96 15 106 16'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".6"' % ldk))
    a.flat(C(70, 19, 3.6), sdk)
    # the two cherries (left one slightly higher, right one in front)
    a.part(C(40, 90, 22), r, dk, off=(-5, -5), hl=(31, 81, 6, 8, 30))
    a.flat(E(33, 80, 3, 2.2, 30), '#FFFFFF', opacity=.8)
    a.part(C(87, 96, 22), r, dk, off=(-5, -5), hl=(78, 87, 6, 8, 30))
    a.flat(E(80, 86, 3, 2.2, 30), '#FFFFFF', opacity=.8)
    # stem dimples
    a.line('M 36 70 Q 40 73 44 70', dk, 2, opacity=.6)
    a.line('M 83 76 Q 87 79 91 76', dk, 2, opacity=.6)
    return a


def carrot():
    a = Art('carrot')
    o, dk = '#FF8A1E', '#B9560A'
    lf, ldk = '#4FB548', '#257A22'
    # leaf fan at the top-right (three rounded fronds)
    for (rot, ln) in ((-66, 32), (-30, 36), (6, 31)):
        t = math.radians(rot - 90 + 45)
        bx, by = 82, 46
        tx, ty = bx + ln * math.cos(t), by + ln * math.sin(t)
        nx, ny = -math.sin(t) * 10, math.cos(t) * 10
        d = 'M %s %s C %s %s %s %s %s %s C %s %s %s %s %s %s Z' % (
            f(bx), f(by), f(bx + nx + (tx - bx) * .3), f(by + ny + (ty - by) * .3),
            f(tx + nx * .9), f(ty + ny * .9), f(tx), f(ty),
            f(tx - nx * .9), f(ty - ny * .9), f(bx - nx + (tx - bx) * .3), f(by - ny + (ty - by) * .3),
            f(bx), f(by))
        a.part(P(d), lf, ldk, shade=False, sw=2.6,
               inner=paint(P('M %s %s L %s %s' % (f(bx), f(by), f((bx + tx * 3) / 4), f((by + ty * 3) / 4))),
                           'fill="none" stroke="%s" stroke-width="1.8" opacity=".55"' % ldk))
    # root: long rounded cone from top-right (84,42) to tip bottom-left (22,108)
    root = 'M 72 34 C 84 30 98 42 94 56 C 88 70 58 96 28 114 C 22 117 16 112 19 106 C 36 76 56 44 72 34 Z'
    rings = paint(P('M 64 50 L 72 56 M 50 70 L 60 76 M 40 86 L 46 91 M 74 40 L 80 46 M 30 102 L 34 105'),
                  'fill="none" stroke="%s" stroke-width="2.4" stroke-linecap="round" opacity=".55"' % dk)
    a.part(P(root), o, dk, off=(-5, -5), shade_t=.36, inner=rings, hl=(60, 50, 4, 14, 45))
    return a


# =============================== ANIMALS ===============================
def pig():
    a = Art('pig')
    p, dk = '#FFB3C4', '#C25E7A'
    snout, sdk = '#FF8FAB', '#B84A6A'
    # curly tail peeking out on the right
    a.line('M 96 96 C 108 96 112 86 106 82 C 100 80 100 90 108 90 C 114 90 118 84 116 78', dk, 9, sil=True)
    a.line('M 96 96 C 108 96 112 86 106 82 C 100 80 100 90 108 90 C 114 90 118 84 116 78', p, 4.4)
    # body + feet
    a.part(E(64, 100, 30, 14), p, dk)
    for x in (46, 82):
        a.part(R(x - 7, 104, 14, 10, 4), mix(p, dk, .25), dk, shade=False, sw=2.4)
        a.line('M %s 108 L %s 114' % (f(x), f(x)), dk, 1.8, opacity=.6)
    # ears (triangles, tips folded forward)
    # ears: rise from the head top, then flop forward/outward (pig, not cat)
    ear = 'M 50 34 C 44 22 30 16 16 18 C 12 30 18 44 30 50 C 36 44 42 38 50 34 Z'
    ein = 'M 44 32 C 38 25 29 22 21 23 C 19 31 23 39 30 43 Z'
    a.part(P(ear), p, dk, shade=False, inner=paint(P(ein), 'fill="%s"' % snout))
    a.part(P(mirror_d(ear)), p, dk, shade=False, inner=paint(P(mirror_d(ein)), 'fill="%s"' % snout))
    a.line('M 18 22 C 22 30 26 36 30 40', dk, 2, opacity=.45)
    a.line(mirror_d('M 18 22 C 22 30 26 36 30 40'), dk, 2, opacity=.45)
    # head
    a.part(E(64, 62, 38, 32), p, dk, hl=(44, 44, 10, 5, -25))
    # snout
    a.part(E(64, 73, 18, 12.5), snout, sdk, shade=False, sw=2.8, sil=False, hl=(57, 67, 7, 2.8))
    a.flat(E(58, 74, 3.4, 4.8), '#8E2E4A')
    a.flat(E(70, 74, 3.4, 4.8), '#8E2E4A')
    a.smile(64, 89, 12, dk, sw=2.4, depth=4)
    a.eye(48, 56, 6.8)
    a.eye(80, 56, 6.8)
    a.cheek(36, 72, 6, opacity=.75)
    a.cheek(92, 72, 6, opacity=.75)
    return a


def snail():
    a = Art('snail')
    b, bdk = '#A6E2B8', '#4E9A68'
    s, sdk = '#FFB547', '#B86A12'
    # soft body: long foot along the bottom, head rising on the left
    body = ('M 18 104 C 14 96 18 84 24 76 C 26 64 30 52 40 50 C 50 48 54 58 52 70 '
            'C 52 80 56 90 70 92 L 108 92 C 118 92 120 104 112 108 C 90 112 40 112 18 104 Z')
    # eye stalks first (behind head)
    a.line('M 36 54 L 28 30 M 46 52 L 50 28', bdk, 7.6, sil=True)
    a.line('M 36 54 L 28 30 M 46 52 L 50 28', b, 4)
    a.part(C(28, 27, 7.4), b, bdk, shade=False, sw=2.4)
    a.part(C(50, 25, 7.4), b, bdk, shade=False, sw=2.4)
    a.part(P(body), b, bdk, shade_t=.35, hl=(34, 62, 4, 8, 15))
    # spiral shell
    a.part(C(80, 64, 31), s, sdk, off=(-5, -6), hl=(66, 46, 8, 5, -35),
           inner=paint(E(84, 92, 26, 6), 'fill="%s" opacity=".35"' % sdk))
    pts = []
    for k in range(0, 61):
        t = k / 60.0
        ang = math.radians(-90 + t * 720 * 0.92)
        rr = 25 * (1 - t) + 2
        pts.append((82 + rr * math.cos(ang) * 1.0 - t * 2, 64 + rr * math.sin(ang)))
    d = 'M %s %s ' % (f(pts[0][0]), f(pts[0][1])) + ' '.join('L %s %s' % (f(x), f(y)) for (x, y) in pts[1:])
    a.line(d, sdk, 3.4, opacity=.9)
    a.line('M 60 76 C 66 86 80 90 94 86', '#FFE0A0', 2.4, opacity=.7)
    # face on the head
    a.eye(28.5, 28, 4.4)
    a.eye(50.5, 26, 4.4)
    a.smile(40, 66, 10, bdk, sw=2.4, depth=5)
    a.cheek(48, 72, 4.5, opacity=.75)
    a.cheek(30, 70, 4, opacity=.6)
    return a


def ladybug():
    a = Art('ladybug')
    r, dk = '#E8413C', '#9E1E22'
    blk, bdk = '#2E2A3A', '#17141F'
    # legs (behind the shell)
    for s in (-1, 1):
        for (y0, dy) in ((70, -8), (84, 0), (98, 8)):
            x0 = 64 + s * 34
            a.line('M %s %s L %s %s' % (f(x0), f(y0), f(x0 + s * 14), f(y0 + dy)), bdk, 3.6, sil=True)
    # antennae
    a.line('M 56 30 C 52 20 46 14 40 12', bdk, 3, sil=True)
    a.line('M 72 30 C 76 20 82 14 88 12', bdk, 3, sil=True)
    a.flat(C(40, 12, 3.6), blk)
    a.flat(C(88, 12, 3.6), blk)
    # head
    a.part(E(64, 38, 22, 15), blk, bdk, shade_t=.25, hl=(56, 30, 5, 2.4, -20), sw=2.4)
    # red shell with centre line + spots
    spots = ''.join(paint(C(x, y, rr), 'fill="%s"' % blk) for (x, y, rr) in (
        (48, 64, 6.5), (80, 64, 6.5), (40, 88, 6), (88, 88, 6), (54, 106, 5), (74, 106, 5)))
    spots += paint(P('M 64 48 L 64 118'), 'fill="none" stroke="%s" stroke-width="3.4"' % blk)
    a.part(C(64, 82, 36), r, dk, off=(-6, -6), inner=spots, hl=(40, 74, 4, 8, 30))
    a.flat(E(56, 54, 3.4, 2, -20), '#FFFFFF', opacity=.75)
    # face on the head
    a.add(paint(C(56, 38, 5.4), 'fill="#FFFFFF"'))
    a.add(paint(C(72, 38, 5.4), 'fill="#FFFFFF"'))
    a.eye(56, 38, 3.6)
    a.eye(72, 38, 3.6)
    a.smile(64, 45, 7, '#FFFFFF', sw=1.8, depth=2.6)
    a.cheek(49, 46, 3, opacity=.85)
    a.cheek(79, 46, 3, opacity=.85)
    return a


ALL = {
    'fruit_pear': pear, 'fruit_cherry': cherry, 'fruit_carrot': carrot,
    'animal_pig': pig, 'animal_snail': snail, 'animal_ladybug': ladybug,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ALL.items():
        with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
            fh.write(fn().svg(sticker=True))
    print('wrote %d sprites to %s' % (len(ALL), OUT))


if __name__ == '__main__':
    main()
