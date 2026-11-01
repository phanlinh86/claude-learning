#!/usr/bin/env python3
"""Generate Kitten's Balloon Farm farm-animal sticker sprites (character artist B).

Writes game/assets/default/items/animal_{cow,pig,sheep,duck,horse,goat,chick,bunny,puppy}.svg
(viewBox 0 0 128 128, all facing RIGHT). All art is original, built from simple primitives (same
pipeline as ../owl-snow-garden/tools/art_animals.py):
  * every part = fill + one-step cel shade (the part shifted up-left, clipped, leaves a darker
    crescent lower-right) + outline in a darker tone of the fill (never black);
  * white sticker border (~6 px beyond the outline) + faint blue drop shadow (opacity .18, +3 y),
    both made from one <use> of the merged silhouette.
No filters, text, fonts, scripts or external refs.

Usage: python3 tools/art_animals.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

EYE = '#2F2622'
CHEEK = '#FF8FA8'
STICKER_SW = 14          # stroke width of the sticker <use>: 7 px beyond geometry = ~6 px beyond a 2.4 px outline
SHADOW = '#3A3020'       # faint warm drop shadow


def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def hexrgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def mix(a, b, t):
    ca, cb = hexrgb(a), hexrgb(b)
    return '#%02X%02X%02X' % tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))


# ---------- shape builders (strings with an {A} slot for paint attributes) ----------
def E(cx, cy, rx, ry, rot=0):
    tr = ' transform="rotate(%s %s %s)"' % (f(rot), f(cx), f(cy)) if rot else ''
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s"%s {A}/>' % (f(cx), f(cy), f(rx), f(ry), tr)


def C(cx, cy, r):
    return '<circle cx="%s" cy="%s" r="%s" {A}/>' % (f(cx), f(cy), f(r))


def P(d):
    return '<path d="%s" {A}/>' % ' '.join(d.split())


def R(x, y, w, h, rx=0):
    return '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" {A}/>' % (f(x), f(y), f(w), f(h), f(rx))


def paint(shape, attrs):
    return shape.replace('{A}', attrs)


def mirror_d(d, cx=64):
    """Mirror an absolute path made of M/L/C/Q/Z commands with x,y pairs around x=cx."""
    out, toks = [], d.replace(',', ' ').split()
    i = 0
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            out.append(t)
            i += 1
            continue
        x, y = float(toks[i]), float(toks[i + 1])
        out.append('%s %s' % (f(2 * cx - x), f(y)))
        i += 2
    return ' '.join(out)


def scallop(cx, cy, rx, ry, n, bump, start=0.0):
    """Closed fluffy 'cloud' path: n arcs bulging outward around an ellipse."""
    pts = []
    for k in range(n):
        a = start + 2 * math.pi * k / n
        pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    d = 'M %s %s' % (f(pts[0][0]), f(pts[0][1]))
    for k in range(n):
        p0, p1 = pts[k], pts[(k + 1) % n]
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        dx, dy = mx - cx, my - cy
        L = math.hypot(dx, dy) or 1
        qx, qy = mx + dx / L * bump * 2, my + dy / L * bump * 2
        d += ' Q %s %s %s %s' % (f(qx), f(qy), f(p1[0]), f(p1[1]))
    return d + ' Z'


class Art:
    def __init__(self, name):
        self.name = name
        self.defs = []
        self.sil = []
        self.body = []
        self.n = 0
        self.xf = None       # optional (scale, dx, dy): scale about the centre (64, 64), then shift, to fit the frame

    def cid(self):
        self.n += 1
        return '%s_c%d' % (self.name, self.n)

    def add(self, s):
        self.body.append(s)

    def silhouette(self, shape, sw=None):
        if sw:   # thin strokes (whiskers, legs) join the silhouette as strokes
            self.sil.append(paint(shape, 'fill="none" stroke-width="%s"' % f(sw + STICKER_SW)))
        else:
            self.sil.append(paint(shape, ''))

    def part(self, shape, fill, dark, shade=True, off=(-3, -4), sw=2.4, sil=True, hl=None,
             shade_t=0.38, inner=None, shade_col=None):
        """Draw one cel-shaded outlined part. Returns its clip id (for clipped decorations)."""
        if sil:
            self.silhouette(shape)
        cid = self.cid()
        self.defs.append('<clipPath id="%s">%s</clipPath>' % (cid, paint(shape, '')))
        if shade:
            self.add(paint(shape, 'fill="%s"' % (shade_col or mix(fill, dark, shade_t))))
            self.add('<g clip-path="url(#%s)"><g transform="translate(%s %s)">%s</g>' % (
                cid, f(off[0]), f(off[1]), paint(shape, 'fill="%s"' % fill)))
        else:
            self.add(paint(shape, 'fill="%s"' % fill))
            self.add('<g clip-path="url(#%s)">' % cid)
        if inner:
            self.add(inner)
        if hl:
            cx, cy, rx, ry = hl[:4]
            rot = hl[4] if len(hl) > 4 else 0
            self.add(paint(E(cx, cy, rx, ry, rot), 'fill="#FFFFFF" opacity=".5"'))
        self.add('</g>')
        if sw:
            self.add(paint(shape, 'fill="none" stroke="%s" stroke-width="%s" stroke-linejoin="round"' % (dark, f(sw))))
        return cid

    def flat(self, shape, fill, dark=None, sw=2.4, sil=False, opacity=None):
        if sil:
            self.silhouette(shape)
        a = 'fill="%s"' % fill
        if dark:
            a += ' stroke="%s" stroke-width="%s" stroke-linejoin="round"' % (dark, f(sw))
        if opacity is not None:
            a += ' opacity="%s"' % f(opacity)
        self.add(paint(shape, a))

    def line(self, d, color, sw, sil=False, opacity=None):
        shape = P(d)
        if sil:
            self.silhouette(shape, sw)
        a = 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"' % (color, f(sw))
        if opacity is not None:
            a += ' opacity="%s"' % f(opacity)
        self.add(paint(shape, a))

    # ----- face helpers -----
    def eye(self, cx, cy, r, look=(0, 0)):
        x, y = cx + look[0], cy + look[1]
        self.add(paint(E(x, y, r, r * 1.14), 'fill="%s"' % EYE))
        self.add(paint(C(x - r * .32, y - r * .42, r * .44), 'fill="#FFFFFF"'))
        self.add(paint(C(x + r * .38, y + r * .4, r * .18), 'fill="#FFFFFF" opacity=".9"'))

    def eye_white(self, cx, cy, R_, r, dark, look=(0, 0)):
        self.add(paint(C(cx, cy, R_), 'fill="#FFFFFF" stroke="%s" stroke-width="2.4"' % dark))
        self.eye(cx, cy, r, look)

    def cheek(self, cx, cy, rx=6, ry=None, opacity=.6):
        self.add(paint(E(cx, cy, rx, ry or rx * .62), 'fill="%s" opacity="%s"' % (CHEEK, f(opacity))))

    def smile(self, cx, cy, w, color, sw=2.6, depth=None):
        d = depth if depth is not None else w * .55
        self.line('M %s %s Q %s %s %s %s' % (f(cx - w / 2), f(cy), f(cx), f(cy + d), f(cx + w / 2), f(cy)), color, sw)

    def svg(self, sticker=True):
        out = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
               'width="128" height="128" viewBox="0 0 128 128">']
        defs = list(self.defs)
        if sticker:
            defs.append('<g id="%s_sil">%s</g>' % (self.name, ''.join(self.sil)))
        out.append('<defs>%s</defs>' % ''.join(defs))
        if self.xf:
            k, dx, dy = self.xf
            out.append('<g transform="translate(%s %s) scale(%s)">' % (f(64 * (1 - k) + dx), f(64 * (1 - k) + dy), f(k)))
        if sticker:
            ref = '#%s_sil' % self.name
            out.append('<use href="%s" xlink:href="%s" transform="translate(0 3)" fill="%s" stroke="%s" '
                       'stroke-width="%d" stroke-linejoin="round" stroke-linecap="round" opacity=".18"/>' % (
                           ref, ref, SHADOW, SHADOW, STICKER_SW))
            out.append('<use href="%s" xlink:href="%s" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
                       'stroke-linejoin="round" stroke-linecap="round"/>' % (ref, ref, STICKER_SW))
        out.extend(self.body)
        if self.xf:
            out.append('</g>')
        out.append('</svg>')
        return '\n'.join(out) + '\n'




# ---------------------------------------------------------------- farm animals
# Three "white" animals are kept apart by tone: warm cream wool (sheep), cool blue-white (duck),
# neutral white-grey with a grey saddle (goat); the cow is white with big dark patches.
HOOF = '#5A4640'


def leg(a, x, y, w, h, fill, dark, hoof=None, shade_col=None):
    """Rounded leg; optional hoof band at the bottom (clipped)."""
    inner = paint(R(x - 2, y + h - 6, w + 4, 8), 'fill="%s"' % hoof) if hoof else None
    a.part(R(x, y, w, h, min(w / 2, 6)), fill, dark, shade_col=shade_col, off=(-2, -3), inner=inner)


def cow():
    """Black-and-white calf, side 3/4 facing right: big head, pink muzzle, tiny horn nubs, spots."""
    a = Art('cow')
    w, sh, dk = '#FFFFFF', '#E2DEDA', '#6B625E'
    spot = '#3C3538'
    # tail with tuft
    a.line('M 22 76 C 14 80 12 90 14 98', dk, 6, sil=True)
    a.line('M 22 76 C 14 80 12 90 14 98', w, 2.6)
    a.part(E(14, 100, 5, 6.5), spot, '#221C1F', shade=False, sw=2)
    for x, h in ((26, 24), (42, 22), (64, 22), (80, 24)):
        leg(a, x, 116 - h, 12, h, w, dk, hoof=HOOF, shade_col=sh)
    a.part(E(52, 84, 34, 21), w, dk, shade_col=sh, hl=(40, 70, 9, 3.5, -10),
           inner=paint(P('M 30 70 C 36 62 50 64 50 74 C 50 84 38 86 32 82 C 26 78 26 74 30 70 Z'), 'fill="%s"' % spot) +
           paint(E(66, 100, 11, 8, 10), 'fill="%s"' % spot) + paint(C(22, 92, 6), 'fill="%s"' % spot) +
           paint(E(64, 84, 26, 9), 'fill="%s" opacity=".0"' % w))
    # horn nubs + ears behind the head
    a.part(E(70, 28, 4.5, 6.5, -20), '#F3E6C6', '#A88E62', shade=False, sw=2)
    a.part(E(95, 27, 4.5, 6.5, 20), '#F3E6C6', '#A88E62', shade=False, sw=2)
    a.part(E(52, 44, 12, 6.5, -18), spot, '#221C1F', shade=False, inner=paint(E(54, 45, 7, 3.2, -18), 'fill="#F4A9B8"'))
    a.part(E(112, 42, 10, 6, 22), spot, '#221C1F', shade=False, inner=paint(E(110, 43, 5.5, 3, 22), 'fill="#F4A9B8"'))
    # head
    a.part(E(82, 52, 28, 25), w, dk, shade_col=sh, hl=(70, 36, 7, 3.5, -25),
           inner=paint(P('M 56 46 C 56 32 66 26 76 28 C 80 34 78 42 72 48 C 66 54 58 54 56 46 Z'), 'fill="%s"' % spot) +
           paint(P('M 84 28 C 82 33 86 35 88 31 C 90 35 94 33 92 28 Z'), 'fill="%s"' % spot))
    a.part(E(88, 68, 20, 12), '#F7B7C2', '#C27585', shade_col='#EEA0AE', sil=False, off=(-2, -3),
           hl=(80, 62, 5, 2, -10))
    a.flat(E(81, 67, 2.2, 3), '#B45E70')
    a.flat(E(95, 67, 2.2, 3), '#B45E70')
    a.line('M 82 74 Q 88 78 94 74', '#9C4A5C', 2)
    a.eye(70, 48, 6, look=(.8, 0))
    a.eye(95, 47, 6, look=(.8, 0))
    a.cheek(60, 60, 4.8)
    a.cheek(107, 58, 4)
    return a


def pig():
    """Pink piglet, side 3/4 facing right: round body, curly tail, flop-tip ears, big snout poking right."""
    a = Art('pig')
    p, sh, dk = '#FFB6C8', '#F291AE', '#C25E84'
    tail = 'M 22 80 C 12 80 9 70 15 66 C 21 62 25 70 19 73 C 15 75 12 72 13 69'
    a.line(tail, dk, 6.4, sil=True)
    a.line(tail, p, 2.8)
    for x in (26, 42, 64, 80):
        leg(a, x, 98, 12, 16, p, dk, hoof='#D27994', shade_col=sh)
    a.part(E(54, 84, 35, 24), p, dk, shade_col=sh, hl=(40, 68, 10, 4, -12))
    # ears (flop-tip triangles)
    a.part(P('M 62 40 C 58 30 56 20 60 14 C 68 18 76 24 80 32 Z'), p, dk, shade_col=sh,
           inner=paint(P('M 64 34 C 62 28 61 23 63 20 C 68 23 72 27 74 31 Z'), 'fill="#F27FA2"'))
    a.part(P('M 90 30 C 94 22 100 16 106 14 C 108 22 108 30 104 38 Z'), p, dk, shade_col=sh,
           inner=paint(P('M 95 29 C 98 24 101 21 104 20 C 105 25 104 30 102 34 Z'), 'fill="#F27FA2"'))
    a.part(C(84, 56, 27), p, dk, shade_col=sh, hl=(72, 40, 7, 3.5, -25))
    # snout
    a.part(E(108, 62, 11, 12.5), '#FF9FBA', dk, shade_col='#F283A3', off=(-2, -2), hl=(105, 55, 3, 2, -10))
    a.flat(E(104, 62, 2, 3.6), '#B4446E')
    a.flat(E(112, 62, 2, 3.6), '#B4446E')
    a.line('M 88 74 Q 94 79 100 75', '#A8406A', 2.2)
    a.eye(75, 51, 6, look=(.8, 0))
    a.eye(95, 49, 5.6, look=(.8, 0))
    a.cheek(70, 66, 5.5, opacity=.75)
    return a


def sheep():
    """Fluffy cream lamb facing right: cloud body, grey-brown face and legs, wool tuft on the head."""
    a = Art('sheep')
    w, sh, dk = '#FFFBF0', '#E8DDC6', '#6F6355'
    face, fdk = '#7C665A', '#46362E'
    for x in (30, 44, 64, 78):
        leg(a, x, 96, 10, 20, face, fdk, hoof='#3E302A')
    # wool body
    a.part(P(scallop(52, 80, 37, 24, 13, 3.2, .2)), w, dk, shade_col=sh, hl=(40, 64, 10, 4, -12),
           inner=paint(P('M 34 82 q 4 -4 8 0 M 52 92 q 4 -4 8 0 M 62 74 q 4 -4 8 0'),
                       'fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" opacity=".6"' % sh))
    # ears
    a.part(E(74, 52, 11, 5.5, -25), face, fdk, shade=False, inner=paint(E(75, 52, 6, 2.5, -25), 'fill="#E7A0A8"'))
    a.part(E(113, 52, 10, 5, 25), face, fdk, shade=False, inner=paint(E(112, 52, 5.5, 2.3, 25), 'fill="#E7A0A8"'))
    # face
    a.part(P('M 78 52 C 78 40 86 36 94 36 C 104 36 110 44 110 54 C 110 68 104 78 94 78 C 84 78 78 66 78 52 Z'),
           face, fdk, hl=(86, 46, 4, 2.5, -30))
    a.flat(E(95, 72, 9, 5.5), '#9C8274')
    a.line('M 92 70 L 95 72.5 L 98 70', '#3A2C26', 2)
    # wool tuft on the head
    a.part(P(scallop(92, 38, 16, 10, 8, 2.6, .3)), w, dk, shade_col=sh, off=(-2, -3))
    a.eye_white(87, 56, 6.6, 4.6, fdk, look=(1.2, .4))
    a.eye_white(102, 55, 6, 4.2, fdk, look=(1, .4))
    a.cheek(83, 67, 4.2, opacity=.8)
    a.cheek(106, 66, 3.6, opacity=.8)
    return a


def duck():
    """White duckling in profile facing right: long neck, round head, long flat orange bill, upturned tail."""
    a = Art('duck')
    w, sh, dk = '#FFFFFF', '#D9E2EC', '#6C7B8E'
    o, odk = '#F2A03D', '#B8661A'
    for x in (48, 66):
        a.part(P('M %s 104 L %s 104 L %s 114 C %s 117 %s 117 %s 114 Z' % (
            f(x - 2), f(x + 3), f(x + 12), f(x + 8), f(x - 6), f(x - 8))), o, odk, shade=False, sw=2.2)
    # one path: pointed tail up-left, body, neck and round head
    a.part(P('M 12 62 C 22 70 30 72 42 72 C 56 70 66 68 70 62 C 66 54 64 46 66 38 C 68 26 78 20 88 20 '
             'C 100 20 108 30 106 42 C 105 50 100 56 96 60 C 96 70 100 76 100 86 C 100 102 84 110 62 110 '
             'C 38 110 22 100 18 86 C 16 80 12 72 12 62 Z'), w, dk, shade_col=sh, hl=(80, 28, 7, 3.5, -25),
           inner=paint(E(48, 78, 10, 3, -8), 'fill="#FFFFFF" opacity=".6"'))
    # wing
    a.part(P('M 34 80 C 42 70 66 70 76 80 C 80 90 70 98 56 98 C 46 98 36 92 34 80 Z'), w, dk,
           shade_col='#E3EAF2', sil=False, off=(-2, -2),
           inner=paint(P('M 46 90 Q 54 92 60 88 M 52 82 Q 60 84 66 80'),
                       'fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" opacity=".7"' % sh))
    # bill
    a.part(P('M 100 40 C 108 36 120 36 122 42 C 123 48 114 52 102 52 Z'), o, odk, shade_t=.25, sw=2.4, off=(-1, -2.5),
           hl=(108, 40, 4, 1.5, -6))
    a.line('M 103 46 C 110 46 116 45 121 43', odk, 1.8)
    a.flat(E(108, 41, 1.4, 0.9), odk)
    a.eye(90, 36, 6, look=(.8, 0))
    a.cheek(91, 50, 5, opacity=.75)
    return a


def horse():
    """Brown foal in profile facing right: long legs, dark mane and tail, long head with cream muzzle."""
    a = Art('horse')
    b, sh, dk = '#C88A55', '#AE6F3E', '#73441F'
    m, mdk = '#6A3E22', '#3E2210'
    # tail
    a.part(P('M 26 70 C 16 72 10 82 10 94 C 10 102 14 108 18 108 C 18 100 22 92 28 86 C 30 80 30 74 26 70 Z'),
           m, mdk, shade=False, inner=paint(P('M 16 84 C 14 92 15 100 17 104'), 'fill="none" stroke="#8C5634" stroke-width="2"'))
    for x in (26, 40, 62, 76):
        leg(a, x, 84, 10, 32, b, dk, hoof='#4E3222', shade_col=sh)
    # ears
    a.part(P('M 82 26 C 80 18 80 12 82 6 C 88 10 92 16 92 22 Z'), b, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 84 22 C 83 17 83 13 84 10 C 87 13 89 16 89 20 Z'), 'fill="#E7A88C"'))
    # neck + long head in one shape (muzzle lower right), body overlaps the neck base
    a.part(P('M 60 84 C 62 66 68 48 74 36 C 74 22 92 14 100 24 C 106 30 112 38 117 46 C 121 54 116 62 106 62 '
             'C 100 62 96 60 92 58 C 90 68 88 78 86 88 Z'), b, dk, shade_col=sh, hl=(86, 24, 6, 3, -25),
           inner=paint(E(110, 53, 12, 10, 30), 'fill="#ECC9A0"'))
    a.part(E(52, 78, 31, 17), b, dk, shade_col=sh, hl=(40, 66, 9, 3.5, -8))
    # mane along the neck + forelock
    a.part(P('M 84 18 C 74 18 68 26 70 34 C 62 38 62 46 66 50 C 58 54 58 62 62 66 C 56 70 58 78 62 80 '
             'C 66 66 70 50 78 36 C 82 30 86 26 90 24 C 90 20 88 18 84 18 Z'), m, mdk, shade=False, sw=2.2,
           hl=(76, 26, 3, 1.5, -40))
    a.part(P('M 88 20 C 94 16 100 20 98 28 C 94 26 92 30 88 28 Z'), m, mdk, shade=False, sw=2)
    a.flat(E(113, 50, 1.8, 2.8, 30), '#7A4A30')
    a.line('M 104 58 Q 109 61 113 59', '#8A5434', 2)
    a.eye(96, 36, 6.4, look=(.8, 0))
    a.cheek(97, 48, 5, opacity=.75)
    return a


def goat():
    """White-grey goat kid facing right: slim body, long legs, swept-back horns, droopy ears, little beard."""
    a = Art('goat')
    w, sh, dk = '#F4F1EC', '#D3CCC2', '#655D54'
    g = '#B5AC9F'
    # upright tail flick
    a.part(P('M 26 72 C 20 68 18 60 22 56 C 26 60 30 64 32 70 Z'), w, dk, shade_col=sh, sw=2.2)
    for x in (27, 40, 63, 76):
        leg(a, x, 84, 11, 31, w, dk, hoof=HOOF, shade_col=sh)
    # neck (body overlaps its base)
    a.part(P('M 66 86 C 70 70 74 56 80 44 L 98 50 C 94 62 90 76 88 88 Z'), w, dk, shade_col=sh)
    a.part(P('M 22 78 C 22 66 34 62 52 62 C 72 62 86 66 86 80 C 86 94 72 98 54 98 C 34 98 22 92 22 78 Z'),
           w, dk, shade_col=sh, hl=(40, 67, 9, 3, -5),
           inner=paint(E(54, 92, 26, 5), 'fill="#FFFFFF" opacity=".55"'))
    # swept-back horns
    horn = 'M 86 30 C 82 20 74 14 66 16'
    horn2 = 'M 96 28 C 94 18 88 10 80 10'
    for d in (horn, horn2):
        a.line(d, '#94805C', 8.4, sil=True)
    for d in (horn, horn2):
        a.line(d, '#EADCB8', 4.2)
    # droopy ears
    a.part(E(72, 40, 13, 5.5, 28), w, dk, shade_col=sh, inner=paint(E(73, 40, 7, 2.4, 28), 'fill="#F0B4BC"'))
    # beard
    a.part(P('M 102 60 C 104 70 102 78 98 84 C 94 78 92 70 94 62 Z'), g, '#7E766C', shade=False, sw=2)
    # head: long face, muzzle lower right
    a.part(E(98, 44, 16, 22, -40), w, dk, shade_col=sh, hl=(88, 30, 5, 3, -40),
           inner=paint(E(110, 56, 8, 6, -40), 'fill="#FBE4E4"'))
    a.part(E(113, 42, 10, 4.5, -18), w, dk, shade_col=sh, off=(-1, -2),
           inner=paint(E(112, 42, 5, 2, -18), 'fill="#F0B4BC"'))
    a.flat(E(113, 54, 1.6, 2.4, -40), '#8A6A66')
    a.line('M 104 60 Q 108 62 112 60', '#8A6A66', 1.8)
    # forehead tuft
    a.flat(P('M 90 26 C 92 22 96 22 98 24 C 96 26 94 28 92 28 Z'), g)
    a.eye(94, 40, 5.6, look=(.8, 0))
    a.eye(106, 38, 5, look=(.8, 0))
    a.cheek(96, 52, 4.2, opacity=.75)
    return a


def chick():
    """Fluffy yellow chick facing right: round ball body, feather tuft, tiny beak, stubby wing, little feet."""
    a = Art('chick')
    y, sh, dk = '#FFE25C', '#F5C431', '#C08E10'
    o, odk = '#FF9A2E', '#C4650C'
    for x in (52, 72):
        a.line('M %s 104 L %s 116 M %s 116 L %s 116 M %s 116 L %s 112' % (
            f(x), f(x), f(x - 6), f(x + 6), f(x), f(x + 5)), odk, 6, sil=True)
        a.line('M %s 104 L %s 116 M %s 116 L %s 116 M %s 116 L %s 112' % (
            f(x), f(x), f(x - 6), f(x + 6), f(x), f(x + 5)), o, 3)
    # little tail tuft on the left
    a.part(P('M 26 72 C 16 66 14 58 18 54 C 22 58 26 58 30 62 Z'), y, dk, shade_col=sh, sw=2.2)
    # tuft on top
    a.part(P('M 56 34 C 52 22 56 14 62 12 C 62 20 64 24 66 30 C 68 22 74 18 80 20 C 76 26 74 32 72 36 Z'),
           y, dk, shade_col=sh, sw=2.2)
    a.part(C(62, 72, 40), y, dk, shade_col=sh, hl=(46, 48, 12, 6, -30),
           inner=paint(E(66, 96, 22, 10), 'fill="#FFF2A6" opacity=".7"'))
    # wing
    a.part(P('M 34 74 C 38 64 50 62 56 70 C 58 78 54 88 46 90 C 44 86 40 88 38 86 C 36 84 34 80 34 74 Z'),
           y, dk, shade_col=sh, sil=False, off=(-2, -2))
    # beak
    a.part(P('M 96 62 C 102 62 108 64 112 67 C 108 70 102 72 96 72 Z'), o, odk, shade_t=.25, sw=2.2, off=(-1, -2))
    a.line('M 97 67 L 110 67', odk, 1.4)
    a.eye(74, 60, 6.6, look=(.8, 0))
    a.eye(94, 58, 6, look=(.8, 0))
    a.cheek(76, 78, 6, opacity=.75)
    a.cheek(100, 77, 4.2, opacity=.75)
    return a


def bunny():
    """Light-grey bunny sitting, 3/4 facing right: very long upright ears, cotton tail, white muzzle."""
    a = Art('bunny')
    g, sh, dk = '#E3E6EC', '#C3C9D4', '#68718A'
    pink = '#F6AFC2'
    # long ears (behind the head)
    a.part(E(70, 30, 8, 22, -10), g, dk, shade_col=sh, inner=paint(E(71, 32, 4, 15, -10), 'fill="%s"' % pink))
    a.part(E(92, 28, 8, 22, 14), g, dk, shade_col=sh, inner=paint(E(91, 30, 4, 15, 14), 'fill="%s"' % pink))
    # cotton tail
    a.part(P(scallop(24, 90, 9, 9, 7, 1.6)), '#FFFFFF', dk, shade_col='#E8ECF2', off=(-2, -2))
    a.part(E(52, 90, 30, 24), g, dk, shade_col=sh, hl=(40, 74, 9, 4, -15))
    # hind foot + front paw
    a.part(E(60, 111, 18, 6.5), g, dk, shade_col=sh, off=(-2, -2))
    a.part(E(86, 108, 8, 7), g, dk, shade_col=sh, off=(-2, -2))
    a.line('M 84 104 L 84 108 M 88 104 L 88 108', dk, 1.4)
    a.part(C(82, 64, 25), g, dk, shade_col=sh, hl=(70, 48, 7, 3.5, -25))
    a.flat(E(96, 76, 11, 8), '#FFFFFF')
    a.flat(P('M 98 68 C 98 66 106 66 106 68 L 102 72 Z'), '#EE8AA6', '#B65C78', sw=1.4)
    a.line('M 102 72 L 102 75 M 102 75 Q 98 79 95 76 M 102 75 Q 106 79 109 76', '#6A6E80', 2)
    a.line('M 108 72 L 118 70 M 108 76 L 118 78', '#9AA3B6', 1.4)
    a.eye(76, 60, 6.4, look=(.8, 0))
    a.eye(96, 58, 5.8, look=(.8, 0))
    a.cheek(72, 74, 5, opacity=.75)
    return a


def puppy():
    """Sandy puppy sitting, 3/4 facing right: long floppy brown ears, cream muzzle, tongue, wagging tail."""
    a = Art('puppy')
    s, sh, dk = '#E4B676', '#CC9654', '#8A5A26'
    ear, edk = '#A86E3C', '#6A421E'
    cream = '#FFF1D8'
    tail = 'M 30 94 C 20 90 16 78 20 68'
    a.line(tail, dk, 9, sil=True)
    a.line(tail, s, 5)
    a.part(E(52, 94, 28, 21), s, dk, shade_col=sh, hl=(40, 80, 8, 3.5, -15),
           inner=paint(E(70, 96, 10, 16), 'fill="%s"' % cream))
    a.part(E(42, 104, 16, 12), s, dk, shade_col=sh, off=(-2, -3))
    a.part(E(40, 113, 12, 5), s, dk, shade_col=sh, off=(-1, -2))
    for x in (66, 80):
        leg(a, x, 92, 11, 24, s, dk, shade_col=sh)
    # far ear peeking at top right
    a.part(P('M 92 34 C 98 28 106 30 108 38 C 106 44 102 48 98 46 Z'), ear, edk, shade=False)
    a.part(C(82, 56, 26), s, dk, shade_col=sh, hl=(72, 38, 7, 3.5, -25))
    # muzzle
    a.part(E(100, 66, 15, 11), cream, mix(cream, dk, .5), shade_col='#F2DDBC', off=(-2, -3), sil=True)
    a.part(P('M 98 76 C 98 82 106 84 107 76 Z'), '#FF8FA6', '#C25676', shade=False, sw=1.8)
    a.line('M 92 74 Q 98 78 104 74 Q 110 76 112 72', '#7A4A30', 2)
    a.part(E(110, 60, 5.5, 4.5), '#4A3428', '#2E1E16', shade=False, sw=1.6)
    a.flat(E(108.5, 58.5, 1.8, 1), '#FFFFFF', opacity=.7)
    # near floppy ear hanging over the left side of the head
    a.part(P('M 66 36 C 56 36 50 48 52 62 C 53 72 58 78 64 76 C 70 72 70 60 72 50 C 74 42 72 36 66 36 Z'),
           ear, edk, shade_col='#93602F', off=(-2, -3), hl=(58, 46, 2.5, 5, 10))
    a.eye(82, 52, 6.4, look=(.8, 0))
    a.eye(100, 50, 5.8, look=(.8, 0))
    a.cheek(84, 68, 5, opacity=.75)
    return a


ALL = {
    'animal_cow': cow, 'animal_pig': pig, 'animal_sheep': sheep, 'animal_duck': duck, 'animal_horse': horse,
    'animal_goat': goat, 'animal_chick': chick, 'animal_bunny': bunny, 'animal_puppy': puppy,
}


# per-animal (scale, dx, dy) so every sticker border + shadow stays inside the 128 frame, ~110 px of art
FIT = {'cow': (0.95, -2, 2), 'pig': (1, 0, 2), 'sheep': (0.95, -3, -2), 'duck': (1, -2, 0), 'horse': (0.95, 0, 1), 'goat': (0.93, -3, 1), 'chick': (1, 0, -2), 'bunny': (0.94, 2, 1), 'puppy': (1, 0, -3)}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ALL.items():
        art = fn()
        art.xf = FIT.get(name[7:])
        with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
            fh.write(art.svg())
    print('wrote %d sprites to %s' % (len(ALL), OUT))


if __name__ == '__main__':
    main()
