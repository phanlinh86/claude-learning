#!/usr/bin/env python3
"""Generate Dee's Forest Memory forest-animal sticker sprites (character artist B).

Writes game/assets/default/items/animal_{fox,deer,hedgehog,squirrel,bunny,frog,bear,owl,mouse}.svg
(viewBox 0 0 128 128, all facing RIGHT, full body). All art is original, built from simple primitives
(same pipeline as ../kitten-balloon-farm/tools/art_animals.py):
  * every part = fill + one-step cel shade (the part shifted up-left, clipped, leaves a darker
    crescent lower-right) + outline in a darker tone of the fill (never black);
  * white sticker border (~6 px beyond the outline) + faint blue drop shadow (opacity .18, +3 y),
    both made from one <use> of the merged silhouette.
Stickers are used on cream cards, as rewards and hopping on grass / leaves / snow.
No filters, text, fonts, scripts or external refs.

Usage: python3 tools/art_animals.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

EYE = '#2F2622'
CHEEK = '#F59AAE'
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


# ---------------------------------------------------------------- forest animals
# Silhouettes are kept apart on purpose: fox = long body + huge white-tipped tail + pointy ears;
# fawn = long legs + white spots; hedgehog = spiky dome + pointy cream snout; squirrel = upright + giant
# S-tail; bunny = upright very long ears; mouse = low crouch + huge round ears + thin long tail;
# bear = chunky four-legged + small round ears; owlet = egg shape on a branch; frog = wide squat + eye bumps.
HOOF = '#4A3426'


def leg(a, x, y, w, h, fill, dark, hoof=None, shade_col=None):
    inner = paint(R(x - 2, y + h - 7, w + 4, 9), 'fill="%s"' % hoof) if hoof else None
    a.part(R(x, y, w, h, min(w / 2, 6)), fill, dark, shade_col=shade_col, off=(-2, -3), inner=inner)


def spikes(cx, cy, rx, ry, a0, a1, n, depth):
    """Zig-zag spiny dome path along an ellipse arc from angle a0 to a1 (radians), closed through the centre-bottom."""
    pts = []
    for k in range(2 * n + 1):
        t = a0 + (a1 - a0) * k / (2 * n)
        r = 1.0 if k % 2 else 1.0 - depth
        pts.append((cx + rx * r * math.cos(t), cy + ry * r * math.sin(t)))
    d = 'M %s %s' % (f(pts[0][0]), f(pts[0][1]))
    for x, y in pts[1:]:
        d += ' L %s %s' % (f(x), f(y))
    return d + ' Z'


def fox():
    """Red fox cub standing, facing right: huge bushy white-tipped tail, pointy ears, dark socks, white muzzle."""
    a = Art('fox')
    o, sh, dk = '#D9763C', '#BC5D27', '#8A3E14'
    wht, sock = '#FFF6EA', '#5A3326'
    # bushy tail sweeping up-left, white tip
    tail = P('M 40 84 C 30 88 16 84 10 72 C 4 60 8 46 16 42 C 22 52 30 60 42 66 C 48 70 48 80 40 84 Z')
    a.part(tail, o, dk, shade_col=sh, hl=(20, 56, 3, 7, -30),
           inner=paint(P('M 4 40 C 12 38 20 44 22 52 C 16 58 8 56 4 50 Z'), 'fill="%s"' % wht))
    for x in (34, 46, 68, 80):
        leg(a, x, 92, 11, 22, o, dk, hoof=sock, shade_col=sh)
    a.part(E(60, 88, 30, 16), o, dk, shade_col=sh, hl=(48, 77, 9, 3, -8),
           inner=paint(E(82, 94, 10, 12), 'fill="%s"' % wht))
    # pointy ears
    a.part(P('M 72 46 C 70 34 70 22 72 14 C 82 20 88 28 90 38 Z'), o, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 75 40 C 74 32 74 25 75 21 C 81 25 84 30 85 36 Z'), 'fill="%s"' % sock))
    a.part(P('M 94 36 C 98 26 104 18 112 14 C 114 24 112 34 108 44 Z'), o, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 99 35 C 102 28 106 23 110 21 C 110 27 109 33 107 38 Z'), 'fill="%s"' % sock))
    # head with white cheek fluff
    a.part(C(88, 56, 21), o, dk, shade_col=sh, hl=(78, 42, 6, 3, -25),
           inner=paint(P('M 66 62 C 72 66 80 68 88 66 C 92 74 86 80 78 78 C 70 76 66 70 66 62 Z'), 'fill="%s"' % wht))
    # pointed white muzzle + nose
    a.part(P('M 92 56 C 102 54 114 58 121 63 C 116 71 104 75 94 73 C 88 70 88 60 92 56 Z'), wht, mix(wht, dk, .55),
           shade_col='#F1E2CF', off=(-1, -2))
    a.flat(E(119.5, 62.5, 3.8, 3.2), '#3A2622')
    a.flat(C(118.5, 61.3, 1.1), '#FFFFFF', opacity=.7)
    a.line('M 104 69 Q 109 72 114 68', '#8A5A44', 1.8)
    a.eye(82, 51, 5.6, look=(.8, 0))
    a.eye(99, 49, 5.2, look=(.8, 0))
    a.cheek(78, 63, 4.6, opacity=.8)
    return a


def deer():
    """Fawn standing, facing right: long thin legs, white back spots, big ears, dark nose, short white tail."""
    a = Art('deer')
    b, sh, dk = '#C88B55', '#AD7041', '#6E4220'
    cream = '#FBEBD3'
    a.part(P('M 30 72 C 26 66 26 60 30 58 C 34 60 36 66 36 72 Z'), cream, dk, shade=False, sw=2.2)
    for x in (34, 46, 70, 82):
        leg(a, x, 82, 9, 34, b, dk, hoof=HOOF, shade_col=sh)
    spots = ''.join(paint(E(x, y, r, r * .8), 'fill="#FFFFFF"') for x, y, r in
                    ((42, 70, 3.4), (54, 67, 3.8), (66, 69, 3.4), (48, 78, 2.8), (60, 77, 3), (36, 78, 2.4), (72, 76, 2.6)))
    # neck + body
    a.part(P('M 70 84 C 74 72 78 60 82 50 L 98 56 C 94 66 90 76 88 88 Z'), b, dk, shade_col=sh)
    a.part(E(58, 78, 30, 15), b, dk, shade_col=sh, hl=(42, 68, 7, 2.5, -6),
           inner=paint(E(60, 92, 24, 6), 'fill="%s"' % cream) + spots)
    # big ears
    a.part(E(74, 34, 13, 6, -32), b, dk, shade_col=sh, inner=paint(E(75, 34, 8, 3, -32), 'fill="#F2B8B4"'))
    a.part(E(108, 26, 12, 5.5, -60), b, dk, shade_col=sh, off=(-1, -2),
           inner=paint(E(108, 27, 7, 2.6, -60), 'fill="#F2B8B4"'))
    # head + long snout pointing right
    a.part(P('M 78 44 C 78 32 88 28 96 30 C 106 32 112 40 118 48 C 122 54 118 62 110 62 C 104 62 100 60 96 60 '
             'C 86 60 78 54 78 44 Z'), b, dk, shade_col=sh, hl=(88, 36, 5, 2.5, -20),
           inner=paint(E(106, 58, 11, 5, 15), 'fill="%s"' % cream) + paint(C(96, 30, 4), 'fill="%s"' % cream))
    a.flat(E(117, 50, 3.6, 3), '#3A2622')
    a.flat(C(116, 49, 1), '#FFFFFF', opacity=.7)
    a.line('M 106 58 Q 110 60 114 57', '#7A4A30', 1.8)
    a.eye(88, 44, 5.8, look=(.8, 0))
    a.eye(102, 42, 5, look=(.8, 0))
    a.cheek(88, 54, 4.2, opacity=.8)
    return a


def hedgehog():
    """Hedgehog walking right: round spiky dome of soft spines, cream face with a long pointy snout."""
    a = Art('hedgehog')
    sp, sh, dk = '#8E6A52', '#735039', '#4C3222'
    face, fdk = '#F4DCB4', '#A07A52'
    for x in (34, 50, 70, 84):
        a.part(R(x, 102, 10, 12, 5), '#C69C74', fdk, shade=False, sw=2.2)
    # spine dome (zig-zag) with lighter spine tips
    dome = P(spikes(58, 92, 50, 52, math.pi * 1.0, math.pi * 1.98, 13, .2))
    tips = ''.join(paint(P('M %s %s L %s %s' % (
        f(58 + 42 * math.cos(t)), f(92 + 44 * math.sin(t)), f(58 + 30 * math.cos(t)), f(92 + 32 * math.sin(t)))),
        'stroke="%s" stroke-width="2" stroke-linecap="round" opacity=".7"' % '#C49C78')
        for t in [math.pi * (1.06 + .085 * k) for k in range(11)])
    a.part(dome, sp, dk, shade_col=sh, inner=tips + paint(E(38, 62, 10, 4, -35), 'fill="#FFFFFF" opacity=".25"'))
    # cream belly / face with pointy snout to the right
    a.part(P('M 22 96 C 30 84 58 80 78 74 C 86 66 98 64 106 72 C 112 76 118 80 123 84 C 120 90 112 92 104 94 '
             'C 92 106 46 110 22 96 Z'), face, fdk, shade_col='#E7C79A', off=(-2, -3), hl=(90, 70, 5, 2.5, -20))
    a.flat(C(121.5, 84, 3.4), '#3A2622')
    a.flat(C(120.6, 83, 1), '#FFFFFF', opacity=.7)
    a.part(C(86, 70, 6), face, fdk, shade=False, sw=2, inner=paint(C(87, 71, 3), 'fill="#E9A9A6"'))
    a.line('M 106 90 Q 110 93 114 90', '#8A5A44', 1.8)
    a.eye(100, 78, 5.4, look=(.8, 0))
    a.cheek(96, 88, 4.6, opacity=.85)
    return a


def squirrel():
    """Red squirrel sitting up, facing right, holding an acorn; giant curled tail behind the back, ear tufts."""
    a = Art('squirrel')
    r, sh, dk = '#C25E2C', '#A2471B', '#6E2A0C'
    cream = '#F8E4C4'
    # giant fluffy tail: a chain of overlapping puffs along an S-curve (outline drawn under all fills = clean union)
    puffs = [(34, 64, 17), (30, 80, 14), (34, 46, 13), (52, 100, 11), (36, 98, 13), (22, 88, 14), (15, 72, 14), (16, 55, 14), (24, 38, 13), (38, 26, 12),
             (52, 22, 10), (62, 28, 7.5)]
    for x, y, rr in puffs:
        a.silhouette(C(x, y, rr))
        a.add(paint(C(x, y, rr), 'fill="%s" stroke="%s" stroke-width="4.8"' % (r, dk)))
    for x, y, rr in puffs:
        a.add(paint(C(x, y, rr), 'fill="%s"' % sh))
    for x, y, rr in puffs:
        a.add(paint(C(x - 1.6, y - 2, rr - 2), 'fill="%s"' % r))
    a.line('M 34 92 C 22 84 20 64 24 48 C 28 36 38 30 48 28', '#E59A62', 5, opacity=.8)
    a.line('M 40 84 C 32 74 32 60 38 50', '#E59A62', 3, opacity=.55)
    a.part(E(70, 110, 16, 6), r, dk, shade_col=sh, off=(-2, -2))
    a.part(E(70, 86, 20, 23), r, dk, shade_col=sh, hl=(60, 72, 5, 3, -20),
           inner=paint(E(78, 90, 10, 17), 'fill="%s"' % cream))
    # tufted ears
    a.part(P('M 66 42 C 62 32 62 22 66 16 C 70 22 76 30 78 38 Z'), r, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 68 38 C 66 32 66 27 67 23 C 70 27 72 31 73 36 Z'), 'fill="#F0A994"'))
    a.part(P('M 84 36 C 86 26 90 18 96 14 C 98 22 96 32 92 40 Z'), r, dk, shade_col=sh, off=(-1, -2))
    a.part(C(80, 54, 19), r, dk, shade_col=sh, hl=(72, 42, 5, 3, -25),
           inner=paint(E(96, 64, 12, 8), 'fill="%s"' % cream))
    a.part(E(99, 58, 8, 7), cream, mix(cream, dk, .5), shade=False, sw=2, sil=False)
    a.flat(E(105.5, 56, 2.8, 2.2), '#4A2A1E')
    a.line('M 96 64 Q 100 66 104 63', '#8A4A30', 1.8)
    # acorn held in paws
    a.part(E(90, 86, 7, 8.5), '#C99A5C', '#7E5A2E', shade_col='#B08046', off=(-1, -2))
    a.part(P('M 82 82 C 82 74 98 74 98 82 Z'), '#7A5434', '#4A321E', shade=False, sw=2)
    a.line('M 90 75 L 91 71', '#4A321E', 2)
    a.part(E(84, 88, 5, 4, -20), r, dk, shade_col=sh, off=(-1, -1), sil=False)
    a.part(E(96, 88, 4.6, 4, 20), r, dk, shade_col=sh, off=(-1, -1), sil=False)
    a.eye(77, 50, 5.6, look=(.8, 0))
    a.eye(92, 48, 5, look=(.8, 0))
    a.cheek(76, 62, 4.6, opacity=.8)
    return a


def bunny():
    """Grey-brown wild bunny sitting, facing right: very long upright ears, cotton tail, white muzzle."""
    a = Art('bunny')
    g, sh, dk = '#B8A089', '#9C836B', '#5E4A38'
    pink = '#F2ABB8'
    a.part(E(72, 30, 8, 24, -8), g, dk, shade_col=sh, inner=paint(E(73, 32, 4, 17, -8), 'fill="%s"' % pink) +
           paint(E(69, 8, 6, 4, -8), 'fill="#7A6450"'))
    a.part(E(94, 28, 8, 24, 14), g, dk, shade_col=sh, inner=paint(E(93, 30, 4, 17, 14), 'fill="%s"' % pink) +
           paint(E(99, 7, 6, 4, 14), 'fill="#7A6450"'))
    a.part(P(scallop(26, 94, 10, 10, 7, 1.8)), '#FFFFFF', '#8D7F74', shade_col='#EDE6DE', off=(-2, -2))
    a.part(E(54, 92, 29, 23), g, dk, shade_col=sh, hl=(42, 76, 9, 4, -15),
           inner=paint(E(74, 98, 9, 14), 'fill="#F3EADF"'))
    a.part(E(58, 112, 20, 6.5), g, dk, shade_col=sh, off=(-2, -2))
    a.part(E(86, 109, 8, 6.5), g, dk, shade_col=sh, off=(-2, -2))
    a.line('M 84 106 L 84 109 M 88 106 L 88 109', dk, 1.4)
    a.part(C(84, 66, 23), g, dk, shade_col=sh, hl=(72, 50, 7, 3.5, -25))
    a.flat(E(98, 78, 11, 8), '#F6EFE6')
    a.flat(P('M 100 70 C 100 68 108 68 108 70 L 104 74 Z'), '#E8869E', '#A85870', sw=1.4)
    a.line('M 104 74 L 104 77 M 104 77 Q 100 81 97 78 M 104 77 Q 108 81 111 78', '#6A5444', 2)
    a.line('M 110 74 L 120 72 M 110 78 L 120 80', '#8E7A68', 1.4)
    a.eye(78, 62, 6.2, look=(.8, 0))
    a.eye(97, 60, 5.6, look=(.8, 0))
    a.cheek(74, 76, 5, opacity=.8)
    return a


def frog():
    """Green frog sitting, 3/4 facing right: wide squat body, big eye bumps on top, wide smile, webbed feet."""
    a = Art('frog')
    g, sh, dk = '#7FBF5A', '#63A243', '#3A6E26'
    belly = '#E2F0B0'
    # folded back legs
    a.part(E(30, 98, 18, 14, -10), g, dk, shade_col=sh, hl=(24, 90, 5, 2.5, -10))
    a.part(P('M 14 108 C 20 104 34 104 40 109 C 43 113 40 116 37 114 C 34 117 30 117 28 114 C 25 117 20 117 18 114 '
             'C 14 116 10 112 14 108 Z'), g, dk, shade=False, sw=2.2)
    # body + head in one squat shape
    a.part(P('M 18 88 C 18 66 36 52 60 50 C 84 48 108 52 116 66 C 122 78 118 94 104 102 C 90 110 40 112 26 104 '
             'C 20 100 18 94 18 88 Z'), g, dk, shade_col=sh, hl=(40, 62, 10, 4, -12),
           inner=paint(E(74, 100, 30, 12), 'fill="%s"' % belly) + paint(C(36, 74, 4), 'fill="#5FA03E"') +
           paint(C(46, 66, 3), 'fill="#5FA03E"') + paint(C(28, 86, 3), 'fill="#5FA03E"'))
    # front legs with webbed toes
    for x in (66, 92):
        a.part(R(x, 96, 10, 16, 5), g, dk, shade_col=sh, off=(-1, -2))
        a.part(P('M %s 110 C %s 106 %s 106 %s 110 C %s 114 %s 116 %s 114 C %s 117 %s 117 %s 114 C %s 116 %s 115 %s 110 Z' % (
            f(x - 4), f(x), f(x + 10), f(x + 14), f(x + 17), f(x + 14), f(x + 11), f(x + 8), f(x + 3), f(x + 1),
            f(x - 3), f(x - 6), f(x - 4))), g, dk, shade=False, sw=2)
    # eye bumps
    a.part(C(66, 46, 14), g, dk, shade_col=sh, hl=(60, 38, 4, 2, -30))
    a.part(C(96, 44, 14), g, dk, shade_col=sh, hl=(90, 36, 4, 2, -30))
    a.eye_white(67, 46, 9.5, 6.2, dk, look=(1.4, 0))
    a.eye_white(97, 44, 9.5, 6.2, dk, look=(1.4, 0))
    a.line('M 66 76 C 78 88 100 88 112 72', '#2F5E20', 2.6)
    a.flat(C(104, 62, 1.6), '#2F5E20')
    a.flat(C(110, 62, 1.6), '#2F5E20')
    a.cheek(64, 72, 6, opacity=.85)
    a.cheek(112, 70, 4.6, opacity=.85)
    return a


def bear():
    """Brown bear cub on all fours, facing right: chunky body, small round ears, tan muzzle, stubby tail."""
    a = Art('bear')
    b, sh, dk = '#9E6A42', '#835430', '#4E2E16'
    tan = '#E4BE8E'
    a.part(C(22, 76, 6), b, dk, shade=False, sw=2.2)
    for x in (26, 42, 64, 80):
        leg(a, x, 90, 15, 24, b, dk, hoof='#6E4426', shade_col=sh)
    a.part(E(56, 84, 36, 22), b, dk, shade_col=sh, hl=(40, 68, 10, 4, -10))
    a.part(C(70, 36, 9), b, dk, shade_col=sh, inner=paint(C(71, 37, 4.6), 'fill="%s"' % tan))
    a.part(C(104, 36, 8.5), b, dk, shade_col=sh, inner=paint(C(103, 37, 4.4), 'fill="%s"' % tan))
    a.part(C(88, 58, 24), b, dk, shade_col=sh, hl=(76, 42, 7, 3.5, -25))
    a.part(E(104, 68, 14, 11), tan, mix(tan, dk, .5), shade_col='#D7AC78', off=(-2, -3), sil=False)
    a.flat(E(110, 62, 5.4, 4), '#3A2418')
    a.flat(E(108.5, 60.6, 1.8, 1), '#FFFFFF', opacity=.7)
    a.line('M 110 66 L 110 70 M 102 72 Q 106 76 110 70 Q 113 75 117 71', '#5A3420', 2)
    a.eye(82, 54, 6, look=(.8, 0))
    a.eye(100, 51, 5.4, look=(.8, 0))
    a.cheek(80, 68, 5, opacity=.8)
    return a


def owl():
    """Tawny owlet perched on a short branch, body facing the viewer, head turned a little right."""
    a = Art('owl')
    t, sh, dk = '#B98352', '#9C6738', '#5E3A1A'
    cream = '#F4E0BC'
    # branch
    a.part(P('M 12 108 C 40 104 80 104 116 106 C 120 107 120 114 116 115 C 80 114 40 114 12 116 C 8 115 8 109 12 108 Z'),
           '#8A6040', '#523620', shade_col='#74502F', off=(0, -2))
    a.part(E(108, 100, 8, 4, -30), '#8CC069', '#4E7F3A', shade=False, sw=2)
    # ear tufts
    a.part(P('M 38 34 C 34 24 34 16 38 10 C 46 16 52 22 54 30 Z'), t, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 84 28 C 88 20 94 14 102 12 C 102 20 100 28 96 34 Z'), t, dk, shade_col=sh, off=(-1, -2))
    chev = ''.join(paint(P('M %s %s q 3 3 6 0' % (f(x), f(y))),
                         'fill="none" stroke="%s" stroke-width="2" stroke-linecap="round"' % '#C9A06A')
                   for x, y in ((58, 80), (68, 78), (78, 80), (63, 90), (73, 90), (68, 100)))
    a.part(P('M 30 60 C 30 36 46 24 66 24 C 88 24 102 38 102 60 C 102 88 90 108 66 108 C 42 108 30 88 30 60 Z'),
           t, dk, shade_col=sh, hl=(42, 40, 6, 3, -35),
           inner=paint(E(68, 88, 22, 22), 'fill="%s"' % cream) + chev)
    # wings
    a.part(P('M 34 60 C 22 70 22 90 34 100 C 40 94 42 80 40 66 Z'), t, dk, shade_col=sh, sil=False, off=(-1, -2))
    a.part(P('M 98 62 C 108 72 108 90 98 98 C 94 92 92 80 94 68 Z'), t, dk, shade_col=sh, sil=False, off=(-1, -2))
    # face discs
    a.part(C(54, 52, 15), '#F3DDB6', mix('#F1D7AE', dk, .6), shade=False, sw=2, sil=False)
    a.part(C(82, 50, 15), '#F3DDB6', mix('#F1D7AE', dk, .6), shade=False, sw=2, sil=False)
    a.part(C(55, 52, 10.5), '#FFFFFF', '#A07A52', shade=False, sw=2, sil=False)
    a.part(C(83, 50, 10.5), '#FFFFFF', '#A07A52', shade=False, sw=2, sil=False)
    a.eye(57, 52, 6.6, look=(.4, 0))
    a.eye(85, 50, 6.6, look=(.4, 0))
    a.part(P('M 64 60 C 68 58 74 58 76 60 L 70 70 Z'), '#E9A23E', '#9C6214', shade=False, sw=2, sil=False)
    a.cheek(46, 66, 4.6, opacity=.8)
    a.cheek(94, 64, 4.6, opacity=.8)
    # feet gripping the branch
    for x in (56, 76):
        a.part(P('M %s 104 C %s 102 %s 102 %s 104 L %s 110 L %s 108 L %s 110 L %s 108 L %s 110 Z' % (
            f(x - 6), f(x - 3), f(x + 3), f(x + 6), f(x + 6), f(x + 3), f(x), f(x - 3), f(x - 6))),
            '#E9A23E', '#9C6214', shade=False, sw=1.8, sil=False)
    return a


def mouse():
    """Grey field mouse crouching low, facing right: huge round pink ears, pointy snout, long thin curly tail."""
    a = Art('mouse')
    g, sh, dk = '#A9A7B4', '#8D8A9A', '#575468'
    pink, pdk = '#F2A9B8', '#B9667C'
    tail = 'M 30 96 C 16 102 6 94 8 82 C 10 72 22 70 24 78 C 25 84 18 86 16 82'
    a.line(tail, pdk, 6.4, sil=True)
    a.line(tail, pink, 3)
    for x in (40, 74):
        a.part(E(x, 110, 9, 4.5), pink, pdk, shade=False, sw=2)
    a.part(P('M 24 94 C 24 74 42 64 62 64 C 78 64 88 72 92 82 C 94 96 84 108 62 108 C 40 108 24 104 24 94 Z'),
           g, dk, shade_col=sh, hl=(40, 74, 9, 3.5, -12),
           inner=paint(E(66, 104, 20, 6), 'fill="#E4E2EA"'))
    # huge round ears
    a.part(C(70, 48, 17), g, dk, shade_col=sh, inner=paint(C(71, 49, 11), 'fill="%s"' % pink))
    # head + pointy snout
    a.part(P('M 70 78 C 68 64 78 56 90 56 C 100 56 108 64 114 72 C 118 76 122 80 121 84 C 118 88 110 88 102 90 '
             'C 88 94 72 90 70 78 Z'), g, dk, shade_col=sh, hl=(82, 62, 5, 2.5, -25),
           inner=paint(E(104, 86, 10, 4, -10), 'fill="#E4E2EA"'))
    a.part(C(102, 46, 15), g, dk, shade_col=sh, inner=paint(C(102, 47, 9.6), 'fill="%s"' % pink))
    a.flat(C(121, 82, 3.4), '#D9748E', '#9C4A62', sw=1.4)
    a.line('M 112 82 L 124 76 M 112 86 L 124 90', '#7A7890', 1.3)
    a.line('M 106 88 Q 110 90 113 87', '#575468', 1.6)
    a.eye(92, 68, 5.4, look=(.8, 0))
    a.cheek(92, 79, 4.6, opacity=.85)
    return a


ALL = {
    'animal_fox': fox, 'animal_deer': deer, 'animal_hedgehog': hedgehog, 'animal_squirrel': squirrel,
    'animal_bunny': bunny, 'animal_frog': frog, 'animal_bear': bear, 'animal_owl': owl, 'animal_mouse': mouse,
}

# per-animal (scale, dx, dy): border + shadow stay inside the 128 frame, ~110 px of art
FIT = {'fox': (0.922, 0.5, -2.3), 'deer': (1, -9, -4), 'hedgehog': (0.908, -1.4, -14.1), 'squirrel': (0.975, 12.7, -2.4),
       'bunny': (0.894, 0, 0), 'frog': (0.937, 1.4, -11.2), 'bear': (1, 0, -9), 'owl': (0.952, 0.5, -1.4),
       'mouse': (0.894, 1.3, -10.3)}


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
