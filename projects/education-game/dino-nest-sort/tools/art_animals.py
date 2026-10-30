#!/usr/bin/env python3
"""Generate Dino Nest Sort animal / fruit / home-badge sprites (character artist B).

Writes game/assets/default/items/{animal_*,fruit_*,home_*}.svg (viewBox 0 0 128 128).
All art is original, built from simple primitives:
  * every part = fill + one-step cel shade (the part shifted up-left, clipped, leaves a darker
    crescent lower-right) + outline in a darker tone of the fill (never black);
  * animals/fruit get a white sticker border (~6 px beyond the outline) and a faint drop
    shadow (opacity .18, +3 y), both made from one <use> of the merged silhouette;
  * home badges are round (r 58) scenes with a white rim.
No filters, text, fonts, scripts or external refs.

Usage: python3 tools/art_animals.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

EYE = '#2A2135'
CHEEK = '#FF7F9E'
STICKER_SW = 15          # stroke width of the sticker <use>: 7.5 px beyond geometry = 6 px beyond a 3 px outline
SHADOW = '#1B2433'


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

    def part(self, shape, fill, dark, shade=True, off=(-4, -5), sw=3.0, sil=True, hl=None,
             shade_t=0.38, inner=None):
        """Draw one cel-shaded outlined part. Returns its clip id (for clipped decorations)."""
        if sil:
            self.silhouette(shape)
        cid = self.cid()
        self.defs.append('<clipPath id="%s">%s</clipPath>' % (cid, paint(shape, '')))
        if shade:
            self.add(paint(shape, 'fill="%s"' % mix(fill, dark, shade_t)))
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
        if sticker:
            ref = '#%s_sil' % self.name
            out.append('<use href="%s" xlink:href="%s" transform="translate(0 3)" fill="%s" stroke="%s" '
                       'stroke-width="%d" stroke-linejoin="round" stroke-linecap="round" opacity=".18"/>' % (
                           ref, ref, SHADOW, SHADOW, STICKER_SW))
            out.append('<use href="%s" xlink:href="%s" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
                       'stroke-linejoin="round" stroke-linecap="round"/>' % (ref, ref, STICKER_SW))
        out.extend(self.body)
        out.append('</svg>')
        return '\n'.join(out) + '\n'


# =============================== ANIMALS ===============================
def fish():
    a = Art('fish')
    body, dk = '#2FC3D6', '#16808F'
    fin, fdk = '#FFB13B', '#C47A0E'
    # tail (right) and fins first so the body overlaps them
    a.part(P('M 84 64 C 94 52 106 38 116 38 C 120 40 118 52 113 64 C 118 76 120 88 116 90 '
             'C 106 90 94 76 84 64 Z'), fin, fdk, hl=(104, 48, 5, 3, 40))
    a.line('M 100 56 L 110 50 M 100 72 L 110 78', fdk, 2.2, opacity=.55)
    a.part(P('M 38 38 C 44 18 68 16 80 36 C 66 34 52 34 38 38 Z'), fin, fdk, shade=False)
    a.part(P('M 52 92 C 56 106 70 108 76 98 C 68 96 60 94 52 92 Z'), fin, fdk, shade=False)
    stripes = (paint(P('M 62 30 C 54 50 54 78 62 98'), 'fill="none" stroke="%s" stroke-width="7" opacity=".28"' % dk) +
               paint(P('M 76 32 C 70 50 70 78 76 96'), 'fill="none" stroke="%s" stroke-width="5" opacity=".22"' % dk) +
               paint(E(50, 82, 26, 12), 'fill="#BDF3F7" opacity=".8"'))
    a.part(E(56, 64, 40, 32), body, dk, hl=(40, 44, 12, 6, -20), inner=stripes)
    # side fin on body
    a.part(P('M 66 70 C 72 66 80 67 82 72 C 78 78 70 78 66 70 Z'), fin, fdk, shade=False, sil=False, sw=2.4)
    a.eye_white(37, 58, 12, 8, dk, look=(-1.5, 0))
    a.cheek(42, 76, 6)
    a.flat(E(19, 68, 3.6, 3.2), '#FF8FA8', dk, sw=2)
    # bubbles
    a.part(C(14, 38, 5), '#E8FBFF', '#5FB7CF', shade=False, sw=2.2, hl=(12.5, 36.5, 1.8, 1.4))
    a.part(C(22, 24, 3.4), '#E8FBFF', '#5FB7CF', shade=False, sw=2)
    return a


def frog():
    a = Art('frog')
    g, dk = '#7CCB3E', '#3D8420'
    belly = '#D9F09A'
    # feet
    for s in (-1, 1):
        cx = 64 + s * 30
        a.part(P(mirror_d('M 24 106 C 22 98 32 94 42 98 C 48 100 48 108 44 110 C 38 112 28 112 24 106 Z')
                 if s > 0 else 'M 24 106 C 22 98 32 94 42 98 C 48 100 48 108 44 110 C 38 112 28 112 24 106 Z'),
               g, dk, shade=False)
    # eye bumps
    a.part(C(40, 40, 18), g, dk, hl=(34, 31, 6, 4, -30))
    a.part(C(88, 40, 18), g, dk, hl=(82, 31, 6, 4, -30))
    a.part(P('M 16 74 C 16 50 36 42 64 42 C 92 42 112 50 112 74 C 112 96 92 106 64 106 '
             'C 36 106 16 96 16 74 Z'), g, dk, hl=(32, 58, 10, 5, -25),
           inner=paint(E(64, 96, 30, 16), 'fill="%s"' % belly))
    # redraw bump fronts over the head seam (no outline on the bottom) so the eyes sit in bumps
    a.add(paint(C(40, 42, 15.5), 'fill="%s"' % g))
    a.add(paint(C(88, 42, 15.5), 'fill="%s"' % g))
    a.eye_white(40, 41, 12, 8.5, dk, look=(0.5, 1))
    a.eye_white(88, 41, 12, 8.5, dk, look=(-0.5, 1))
    # wide mouth
    a.line('M 28 72 C 44 88 84 88 100 72', dk, 3.2)
    a.line('M 26 70 L 30 74 M 102 70 L 98 74', dk, 2.6)
    a.flat(E(30, 82, 7, 4.4), '#FFB3C6', opacity=.9)
    a.flat(E(98, 82, 7, 4.4), '#FFB3C6', opacity=.9)
    # spots
    a.flat(C(56, 56, 2.6), dk, opacity=.35)
    a.flat(C(72, 58, 2), dk, opacity=.35)
    return a


def duck():
    a = Art('duck')
    y, dk = '#FFD84A', '#C69414'
    o, odk = '#FF9A2E', '#C4650C'
    # feet
    a.part(P('M 50 104 L 62 104 C 64 110 58 112 52 112 C 44 112 42 108 50 104 Z'), o, odk, shade=False, sw=2.4)
    a.part(P('M 72 104 L 84 104 C 88 108 86 112 78 112 C 70 112 68 108 72 104 Z'), o, odk, shade=False, sw=2.4)
    # body with tail flick
    a.part(P('M 30 80 C 30 62 50 56 70 58 C 86 60 96 58 108 50 C 114 48 116 54 112 62 '
             'C 108 72 110 80 104 90 C 96 104 80 108 64 108 C 44 108 30 98 30 80 Z'), y, dk,
           hl=(50, 68, 12, 5, -10))
    # wing
    a.part(P('M 62 74 C 72 66 94 68 100 78 C 96 92 76 96 64 88 C 70 86 74 84 76 82 C 70 82 64 80 62 74 Z'),
           mix(y, dk, .18), dk, shade=False, sil=False, sw=2.4)
    # head
    a.part(C(48, 44, 26), y, dk, hl=(38, 30, 9, 5, -30))
    a.line('M 46 18 C 44 12 50 10 52 14 M 50 18 C 52 12 58 12 58 16', dk, 2.4)
    a.part(P('M 48 16 C 46 10 52 8 54 12 C 58 8 62 12 58 18 Z'), y, dk, shade=False, sw=2.4)
    # bill (flat, wide)
    a.part(P('M 30 46 C 22 42 10 44 10 52 C 10 60 22 62 32 58 C 36 56 36 48 30 46 Z'), o, odk,
           hl=(18, 48, 5, 2.4, -10), shade_t=.3)
    a.line('M 12 53 C 18 54 26 54 32 52', odk, 2.2)
    a.eye(46, 38, 7, look=(-1, 0))
    a.cheek(56, 54, 6)
    return a


def bird():
    a = Art('bird')
    b, dk = '#3E8FEA', '#1D56A0'
    breast = '#FF7A4D'
    o, odk = '#FFC23B', '#C48A0E'
    # legs
    a.line('M 58 98 L 56 108 M 72 98 L 74 108', odk, 3.2, sil=True)
    a.line('M 50 109 L 60 109 M 70 109 L 80 109', odk, 3.2, sil=True)
    # tail feathers
    a.part(P('M 92 70 C 102 64 112 54 118 54 C 120 60 116 70 110 76 C 114 78 114 84 108 86 '
             'C 102 86 96 82 90 80 Z'), mix(b, dk, .2), dk, shade=False)
    # head tuft
    a.part(P('M 56 30 C 52 20 58 14 64 20 C 66 12 76 14 72 26 Z'), b, dk, shade=False, sw=2.6)
    # round body
    a.part(C(62, 64, 37), b, dk, hl=(46, 44, 12, 7, -30),
           inner=paint(E(50, 86, 26, 24), 'fill="%s"' % breast) +
           paint(E(44, 80, 9, 5, -20), 'fill="#FFB39A" opacity=".7"'))
    # wing
    a.part(P('M 66 66 C 76 56 98 60 98 74 C 96 86 82 92 70 88 C 76 84 80 82 82 80 C 72 80 66 76 66 66 Z'),
           mix(b, dk, .25), dk, shade=False, sil=False, sw=2.4)
    a.line('M 80 72 C 86 74 90 76 92 80', dk, 2, opacity=.5)
    # beak
    a.part(P('M 30 58 L 16 64 L 30 70 C 32 66 32 62 30 58 Z'), o, odk, shade=False, sw=2.4)
    a.eye(42, 56, 7, look=(-1, 0))
    a.cheek(48, 70, 5.5)
    return a


def owl():
    a = Art('owl')
    t, dk = '#D4A062', '#8C5E26'
    face = '#FFF0D6'
    belly = '#F7E0B8'
    o, odk = '#FF9A2E', '#C4650C'
    # feet
    for x in (52, 76):
        a.part(P('M %s 106 C %s 112 %s 114 %s 112 C %s 114 %s 112 %s 106 Z' % (
            f(x - 7), f(x - 8), f(x - 4), f(x), f(x + 4), f(x + 8), f(x + 7))), o, odk, shade=False, sw=2.2)
    # body with ear tufts in one silhouette
    a.part(P('M 30 36 C 26 28 22 20 18 12 C 32 14 42 20 50 28 C 58 26 70 26 78 28 C 86 20 96 14 110 12 C 106 20 102 28 98 36 '
             'C 108 48 110 64 108 78 C 106 98 88 110 64 110 C 40 110 22 98 20 78 C 18 64 20 48 30 34 Z'),
           t, dk, hl=(36, 44, 8, 5, -40),
           inner=paint(E(64, 92, 24, 18), 'fill="%s"' % belly))
    a.line('M 24 18 C 30 22 34 26 38 30 M 104 18 C 98 22 94 26 90 30', mix('#D4A062', '#8C5E26', .6), 2.2, opacity=.6)
    # belly feather marks
    for (x, y) in ((56, 86), (72, 86), (64, 96), (52, 98), (76, 98)):
        a.line('M %s %s Q %s %s %s %s' % (f(x - 4), f(y), f(x), f(y + 4), f(x + 4), f(y)), mix(t, dk, .3), 2)
    # wings
    a.part(P('M 24 60 C 14 70 14 90 26 100 C 32 92 34 74 24 60 Z'), mix(t, dk, .25), dk, shade=False, sil=False, sw=2.4)
    a.part(P(mirror_d('M 24 60 C 14 70 14 90 26 100 C 32 92 34 74 24 60 Z')), mix(t, dk, .25), dk, shade=False, sil=False, sw=2.4)
    # face disc (two overlapping circles)
    a.add(paint(P('M 64 46 C 58 38 50 36 46 36 C 34 36 26 46 26 56 C 26 68 36 76 46 76 C 54 76 60 72 64 68 '
                  'C 68 72 74 76 82 76 C 92 76 102 68 102 56 C 102 46 94 36 82 36 C 78 36 70 38 64 46 Z'),
                'fill="%s" stroke="%s" stroke-width="2.4" stroke-linejoin="round"' % (face, mix(t, dk, .4))))
    a.eye_white(46, 56, 14, 9.5, dk, look=(1, 0.5))
    a.eye_white(82, 56, 14, 9.5, dk, look=(-1, 0.5))
    # beak
    a.part(P('M 58 68 L 70 68 L 64 79 Z'), o, odk, shade=False, sw=2.2, sil=False)
    a.cheek(32, 72, 5.5)
    a.cheek(96, 72, 5.5)
    return a


def squirrel():
    a = Art('squirrel')
    c, dk = '#D9722F', '#934113'
    cream = '#FFE6C4'
    acorn, adk = '#B07A43', '#6E4520'
    # big bushy tail behind, curling up on the right
    a.part(P('M 66 106 C 104 112 124 84 116 56 C 112 40 120 26 110 16 C 98 6 80 12 82 26 '
             'C 84 36 96 36 96 48 C 96 62 74 72 66 106 Z'), mix(c, '#FFFFFF', .08), dk, off=(-5, -5),
           hl=(104, 30, 6, 10, 20),
           inner=paint(P('M 104 62 C 110 76 100 94 84 100'), 'fill="none" stroke="%s" stroke-width="3" opacity=".35" stroke-linecap="round"' % dk))
    # feet
    a.part(E(44, 106, 10, 6), c, dk, shade=False, sw=2.4)
    a.part(E(66, 106, 10, 6), c, dk, shade=False, sw=2.4)
    # body
    a.part(E(54, 84, 24, 24), c, dk, inner=paint(E(50, 90, 14, 16), 'fill="%s"' % cream))
    # ears
    a.part(P('M 30 38 C 26 26 28 14 34 12 C 42 16 44 26 42 34 Z'), c, dk, shade=False,
           inner=paint(E(35, 26, 3.5, 7, -10), 'fill="#FFB3A0"'))
    a.part(P('M 52 34 C 52 22 58 12 64 12 C 70 18 68 30 62 36 Z'), c, dk, shade=False,
           inner=paint(E(61, 24, 3.5, 7, 15), 'fill="#FFB3A0"'))
    # head
    a.part(C(46, 50, 22), c, dk, hl=(38, 38, 8, 4, -30),
           inner=paint(E(34, 60, 13, 10), 'fill="%s"' % cream))
    a.eye(44, 46, 6.5, look=(-1, 0))
    a.flat(E(26, 56, 3.6, 3), '#5A2A12')
    a.line('M 26 60 Q 30 64 34 61', dk, 2.2)
    a.cheek(48, 60, 5)
    # acorn held in paws
    a.part(E(46, 82, 8, 9), acorn, adk, shade=False, sw=2.2, sil=False)
    a.part(P('M 37 78 C 37 70 55 70 55 78 Z'), '#7A4E28', '#4A2C12', shade=False, sw=2.2, sil=False)
    a.line('M 46 71 L 48 67', '#4A2C12', 2.2)
    a.part(E(38, 84, 5, 4), c, dk, shade=False, sw=2.2, sil=False)
    a.part(E(54, 84, 5, 4), c, dk, shade=False, sw=2.2, sil=False)
    return a


def rabbit():
    a = Art('rabbit')
    p, dk = '#F6CFDD', '#B56E8A'
    inner = '#FF98B6'
    # ears
    a.part(E(48, 34, 10, 23, -12), p, dk, inner=paint(E(48, 36, 4.6, 16, -12), 'fill="%s"' % inner), hl=(44, 24, 2.5, 6, -12))
    a.part(E(80, 34, 10, 23, 12), p, dk, inner=paint(E(80, 36, 4.6, 16, 12), 'fill="%s"' % inner))
    # body + feet
    a.part(E(64, 100, 26, 15), p, dk)
    a.part(E(48, 110, 10, 5), p, dk, shade=False, sw=2.4)
    a.part(E(80, 110, 10, 5), p, dk, shade=False, sw=2.4)
    # head
    a.part(E(64, 70, 33, 28), p, dk, hl=(46, 54, 9, 5, -30),
           inner=paint(E(64, 82, 13, 9), 'fill="#FFF3F7"'))
    a.eye(51, 66, 6.8)
    a.eye(77, 66, 6.8)
    a.flat(P('M 60 76 L 68 76 L 64 81 Z'), '#FF6F96', mix('#FF6F96', '#000000', .3), sw=1.6)
    a.line('M 64 81 L 64 84 M 64 84 Q 60 88 56 85 M 64 84 Q 68 88 72 85', dk, 2.2)
    a.flat(R(61, 85, 6, 5, 1.5), '#FFFFFF', dk, sw=1.4)
    a.cheek(42, 78, 6.5)
    a.cheek(86, 78, 6.5)
    # paws
    a.part(E(54, 96, 6, 5), p, dk, shade=False, sw=2.2, sil=False)
    a.part(E(74, 96, 6, 5), p, dk, shade=False, sw=2.2, sil=False)
    return a


def cow():
    a = Art('cow')
    w, dk = '#FFFFFF', '#6E6A80'
    patch = '#3C3446'
    m, mdk = '#FFB3C4', '#C96B84'
    horn, hdk = '#FFE9B8', '#B89650'
    # horns
    a.part(P('M 40 30 C 36 22 34 14 38 10 C 44 12 48 22 48 30 Z'), horn, hdk, shade=False, sw=2.4)
    a.part(P(mirror_d('M 40 30 C 36 22 34 14 38 10 C 44 12 48 22 48 30 Z')), horn, hdk, shade=False, sw=2.4)
    # ears
    a.part(E(22, 48, 14, 7.5, 20), w, dk, inner=paint(E(24, 49, 8, 3.6, 20), 'fill="%s"' % m))
    a.part(E(106, 48, 14, 7.5, -20), w, dk, inner=paint(E(104, 49, 8, 3.6, -20), 'fill="%s"' % m))
    # head with patches
    patches = (paint(P('M 30 36 C 40 26 56 26 62 34 C 64 44 56 58 44 60 C 34 60 26 50 30 36 Z'), 'fill="%s"' % patch) +
               paint(P('M 84 66 C 92 58 104 60 106 70 C 104 80 92 82 86 76 Z'), 'fill="%s"' % patch))
    a.part(P('M 64 24 C 90 24 100 40 100 58 C 100 76 92 86 64 86 C 36 86 28 76 28 58 C 28 40 38 24 64 24 Z'),
           w, dk, shade_t=.25, inner=patches, hl=(76, 34, 8, 4, 20))
    # hair tuft
    a.part(P('M 56 28 C 56 20 62 18 64 24 C 66 18 74 20 72 28 Z'), patch, '#231C2A', shade=False, sw=2.2)
    # muzzle
    a.part(E(64, 88, 32, 20), m, mdk, hl=(52, 78, 9, 4, -10))
    a.flat(E(52, 88, 4.5, 6, -10), mdk)
    a.flat(E(76, 88, 4.5, 6, 10), mdk)
    a.smile(64, 98, 14, mdk, depth=5)
    # eyes (left one sits on the patch: white ring keeps it readable)
    a.add(paint(C(48, 54, 9), 'fill="#FFFFFF"'))
    a.eye(48, 54, 7)
    a.eye(80, 54, 7)
    a.cheek(36, 70, 6, opacity=.55)
    a.cheek(92, 66, 5.5, opacity=.55)
    return a


def sheep():
    a = Art('sheep')
    wool, wdk = '#FFF8EC', '#B4A184'
    face, fdk = '#5E5058', '#2F262C'
    # legs
    for x in (48, 80):
        a.part(R(x - 6, 96, 12, 16, 5), face, fdk, shade=False, sw=2.4)
    # fluffy body
    a.part(P(scallop(64, 70, 44, 32, 13, 4.2, start=0.15)), wool, wdk, shade_t=.3, off=(-4, -5),
           hl=(40, 50, 12, 6, -20))
    # ears
    a.part(E(36, 56, 12, 6, 25), face, fdk, inner=paint(E(36, 57, 6, 2.6, 25), 'fill="#E89AAA"'))
    a.part(E(92, 56, 12, 6, -25), face, fdk, inner=paint(E(92, 57, 6, 2.6, -25), 'fill="#E89AAA"'))
    # face
    a.part(P('M 64 40 C 80 40 86 54 84 68 C 82 82 74 90 64 90 C 54 90 46 82 44 68 C 42 54 48 40 64 40 Z'),
           face, fdk, shade_t=.3, hl=(56, 50, 6, 3, -20))
    # wool tuft on the head
    a.part(P(scallop(64, 40, 16, 8, 7, 2.6, start=0.3)), wool, wdk, shade=False, sw=2.6, sil=False)
    a.eye_white(55, 62, 7, 5, fdk)
    a.eye_white(73, 62, 7, 5, fdk)
    a.cheek(52, 76, 5, opacity=.75)
    a.cheek(76, 76, 5, opacity=.75)
    a.flat(E(64, 76, 3.5, 2.4), '#2A2125')
    a.smile(64, 81, 8, '#E8D8DC', sw=2.2, depth=3)
    return a


def bat():
    a = Art('bat')
    p, dk = '#8B74C4', '#4F3D86'
    wing, wdk = '#6F5AAE', '#43327A'
    belly = '#D6C8F2'
    wl = 'M 48 54 C 38 40 24 34 12 38 C 12 50 14 62 18 76 C 24 70 30 70 34 78 C 38 72 44 72 50 78 C 52 70 52 62 48 54 Z'
    a.part(P(wl), wing, wdk, hl=(24, 44, 6, 3, 20),
           inner=paint(P('M 46 58 L 22 42 M 44 62 L 32 74'), 'fill="none" stroke="%s" stroke-width="2" opacity=".5"' % wdk))
    a.part(P(mirror_d(wl)), wing, wdk,
           inner=paint(P(mirror_d('M 46 58 L 22 42 M 44 62 L 32 74')), 'fill="none" stroke="%s" stroke-width="2" opacity=".5"' % wdk))
    # feet
    a.part(E(57, 96, 5, 4), p, dk, shade=False, sw=2.2)
    a.part(E(71, 96, 5, 4), p, dk, shade=False, sw=2.2)
    # ears
    a.part(P('M 44 44 L 40 22 C 48 24 54 30 58 38 Z'), p, dk, shade=False, inner=paint(E(46, 34, 2.5, 6, -25), 'fill="#FFA6C4"'))
    a.part(P(mirror_d('M 44 44 L 40 22 C 48 24 54 30 58 38 Z')), p, dk, shade=False, inner=paint(E(82, 34, 2.5, 6, 25), 'fill="#FFA6C4"'))
    # body/head (one round blob)
    a.part(E(64, 64, 25, 30), p, dk, hl=(54, 46, 7, 4, -30),
           inner=paint(E(64, 84, 14, 12), 'fill="%s"' % belly))
    a.eye(55, 58, 6.5, look=(0, 0.5))
    a.eye(73, 58, 6.5, look=(0, 0.5))
    a.cheek(49, 70, 4.8, opacity=.75)
    a.cheek(79, 70, 4.8, opacity=.75)
    a.smile(64, 70, 10, '#3A2A66', depth=5)
    a.flat(P('M 60.5 71.2 L 62 75 L 63.4 72'), '#FFFFFF')
    return a


def bear():
    a = Art('bear')
    b, dk = '#A8693A', '#683A18'
    m = '#F2D2A6'
    inner = '#E6A774'
    # body + paws
    a.part(E(64, 102, 30, 13), b, dk, inner=paint(E(64, 106, 16, 9), 'fill="%s"' % m))
    a.part(E(44, 110, 9, 5), b, dk, shade=False, sw=2.4)
    a.part(E(84, 110, 9, 5), b, dk, shade=False, sw=2.4)
    # ears
    a.part(C(32, 30, 14), b, dk, shade=False, inner=paint(C(33, 31, 7.5), 'fill="%s"' % inner))
    a.part(C(96, 30, 14), b, dk, shade=False, inner=paint(C(95, 31, 7.5), 'fill="%s"' % inner))
    # head
    a.part(E(64, 60, 38, 34), b, dk, hl=(44, 40, 11, 5, -30))
    a.part(E(64, 74, 18, 13.5), m, mix(m, dk, .5), shade=False, sw=2.4, sil=False)
    a.flat(P('M 57 68 C 57 64 71 64 71 68 C 71 72 66 75 64 75 C 62 75 57 72 57 68 Z'), '#3B2214')
    a.flat(E(61.5, 67, 2.4, 1.3), '#FFFFFF', opacity=.7)
    a.line('M 64 75 L 64 79 M 58 80 Q 64 85 70 80', '#3B2214', 2.4)
    a.eye(49, 55, 6.8)
    a.eye(79, 55, 6.8)
    a.cheek(38, 70, 6)
    a.cheek(90, 70, 6)
    # paws on belly
    a.part(E(50, 96, 7, 5.5), b, dk, shade=False, sw=2.2, sil=False)
    a.part(E(78, 96, 7, 5.5), b, dk, shade=False, sw=2.2, sil=False)
    return a


def hen():
    a = Art('hen')
    w, dk = '#FFFDF6', '#A48C6C'
    red, rdk = '#E84A4A', '#A8282E'
    o, odk = '#FFB21F', '#C47C0A'
    # legs
    a.line('M 56 98 L 54 110 M 74 98 L 76 110', odk, 3.2, sil=True)
    a.line('M 48 111 L 58 111 M 72 111 L 82 111', odk, 3.2, sil=True)
    # tail feathers up on the right
    a.part(P('M 88 70 C 92 56 98 40 108 30 C 116 34 118 46 114 58 C 120 60 120 72 112 78 '
             'C 106 86 96 86 88 82 Z'), w, dk, shade_t=.3)
    a.line('M 100 46 C 104 56 104 66 100 74', dk, 2, opacity=.4)
    # body
    a.part(P('M 30 64 C 30 54 40 50 52 54 C 66 58 82 56 94 64 C 106 74 100 102 70 102 '
             'C 44 102 30 88 30 64 Z'), w, dk, shade_t=.3, hl=(46, 64, 10, 5, -10))
    # wing
    a.part(P('M 56 72 C 66 64 88 66 92 78 C 88 90 70 94 60 86 C 66 84 70 82 72 80 C 64 80 58 78 56 72 Z'),
           mix(w, dk, .14), dk, shade=False, sil=False, sw=2.2)
    # comb (behind head)
    a.part(P('M 28 30 C 24 20 32 14 38 20 C 38 10 50 8 50 18 C 54 10 64 14 60 26 Z'), red, rdk, shade=False, sw=2.4,
           hl=(36, 18, 3, 2))
    # head
    a.part(C(44, 44, 20), w, dk, shade_t=.3, hl=(36, 34, 6, 3.5, -30))
    # wattle
    a.part(P('M 26 52 C 22 58 24 66 30 66 C 34 64 34 56 32 52 Z'), red, rdk, shade=False, sw=2.2)
    # beak
    a.part(P('M 28 40 L 14 46 L 28 52 Z'), o, odk, shade=False, sw=2.2)
    a.eye(40, 40, 6.2, look=(-1, 0))
    a.cheek(50, 52, 5)
    return a


def cat():
    a = Art('cat')
    g, dk = '#A9B4C6', '#5A6782'
    pink = '#FFA6BE'
    muz = '#FFFFFF'
    # tail
    a.line('M 86 106 C 104 108 114 100 112 92 C 111 88 114 86 117 88', dk, 11, sil=True)
    a.line('M 86 106 C 104 108 114 100 112 92 C 111 88 114 86 117 88', g, 6)
    # body
    a.part(E(64, 100, 26, 14), g, dk, inner=paint(E(64, 104, 13, 9), 'fill="#F2F5FA"'))
    a.part(E(52, 110, 8, 4.5), g, dk, shade=False, sw=2.2)
    a.part(E(76, 110, 8, 4.5), g, dk, shade=False, sw=2.2)
    # ears
    ear = 'M 30 46 C 28 34 28 20 32 14 C 42 18 52 26 58 34 Z'
    a.part(P(ear), g, dk, shade=False, inner=paint(P('M 34 38 C 34 30 34 24 36 21 C 42 24 48 30 50 34 Z'), 'fill="%s"' % pink))
    a.part(P(mirror_d(ear)), g, dk, shade=False, inner=paint(P(mirror_d('M 34 38 C 34 30 34 24 36 21 C 42 24 48 30 50 34 Z')), 'fill="%s"' % pink))
    # head
    stripes = paint(P('M 64 28 L 64 38 M 56 29 L 58 37 M 72 29 L 70 37'), 'fill="none" stroke="%s" stroke-width="3.4" stroke-linecap="round" opacity=".7"' % dk)
    a.part(E(64, 58, 38, 30), g, dk, hl=(44, 40, 10, 4.5, -25), inner=stripes)
    # muzzle
    a.flat(E(57, 72, 9, 7), muz)
    a.flat(E(71, 72, 9, 7), muz)
    a.flat(P('M 60 66 L 68 66 L 64 71 Z'), pink, mix(pink, '#000000', .35), sw=1.4)
    a.line('M 64 71 L 64 74 M 64 74 Q 60 78 56 75 M 64 74 Q 68 78 72 75', dk, 2.2)
    # whiskers (extend past the head: part of the sticker silhouette)
    for s in (-1, 1):
        for (y0, y1) in ((68, 64), (73, 73), (78, 82)):
            x0 = 64 + s * 16
            x1 = 64 + s * 50
            a.line('M %s %s L %s %s' % (f(x0), f(y0), f(x1), f(y1)), dk, 2.2, sil=True)
    a.eye(50, 56, 7.4)
    a.eye(78, 56, 7.4)
    a.cheek(40, 70, 5.5)
    a.cheek(88, 70, 5.5)
    return a


# =============================== FRUIT ===============================
def apple():
    a = Art('apple')
    r, dk = '#E8413C', '#A01F1E'
    lf, ldk = '#5CC04A', '#2C7F22'
    a.line('M 63 38 C 63 30 64 24 68 16', '#7A4A24', 5, sil=True)
    a.part(P('M 70 26 C 78 14 96 12 104 18 C 98 32 82 36 70 26 Z'), lf, ldk, shade=False, sw=2.6,
           inner=paint(P('M 74 26 C 84 22 92 20 100 19'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".6"' % ldk))
    a.part(P('M 64 38 C 52 28 20 30 18 62 C 16 92 38 114 56 112 C 60 111 62 109 64 109 C 66 109 68 111 72 112 '
             'C 90 114 112 92 110 62 C 108 30 76 28 64 38 Z'), r, dk, off=(-6, -6), hl=(36, 52, 9, 14, 20))
    a.flat(E(46, 46, 4, 3, 30), '#FFFFFF', opacity=.75)
    return a


def banana():
    a = Art('banana')
    y, dk = '#FFD93D', '#C3920C'
    a.part(P('M 20 32 C 14 78 46 112 98 104 C 110 102 114 94 110 86 C 72 92 46 74 42 32 Z'), y, dk,
           off=(4, -6), hl=(40, 66, 4, 14, -25))
    a.line('M 32 36 C 34 70 60 94 102 96', mix(y, dk, .5), 2.2, opacity=.7)
    a.part(R(23, 18, 16, 16, 3.5), '#9A6A34', '#5E3C18', shade=False, sw=2.4)
    a.flat(E(108, 90, 4, 3, -20), '#6E4A22')
    return a


def strawberry():
    a = Art('strawberry')
    r, dk = '#F0384E', '#A3172B'
    lf, ldk = '#4FB548', '#257A22'
    seeds = ''
    for row, (y, xs) in enumerate(((50, (40, 56, 72, 88)), (62, (32, 48, 64, 80, 96)), (74, (38, 54, 70, 86)),
                                    (86, (46, 62, 78)), (98, (56, 70)))):
        for x in xs:
            seeds += paint(E(x, y, 2.2, 3.4), 'fill="#FFE27A"')
    a.part(P('M 64 114 C 38 106 16 78 18 56 C 20 38 38 32 64 36 C 90 32 108 38 110 56 '
             'C 112 78 90 106 64 114 Z'), r, dk, off=(-6, -6), inner=seeds, hl=(36, 52, 6, 12, 25))
    # leaf crown
    crown = ('M 64 40 C 58 46 44 50 36 44 C 42 40 46 36 50 34 C 44 30 40 26 42 22 C 50 24 56 28 60 32 '
             'C 60 26 62 22 64 20 C 66 22 68 26 68 32 C 72 28 78 24 86 22 C 88 26 84 30 78 34 '
             'C 82 36 86 40 92 44 C 84 50 70 46 64 40 Z')
    a.part(P(crown), lf, ldk, shade=False, sw=2.6)
    a.line('M 64 32 C 64 26 66 22 69 19', '#3E8A2C', 4.5, sil=True)
    return a


def orange():
    a = Art('orange')
    o, dk = '#FF9A2E', '#C2620A'
    lf, ldk = '#5CC04A', '#2C7F22'
    dots = ''.join(paint(C(x, y, 1.3), 'fill="%s" opacity=".35"' % dk)
                   for (x, y) in ((50, 60), (80, 56), (66, 86), (90, 80), (44, 88), (72, 70), (56, 100), (94, 98)))
    a.part(C(64, 70, 42), o, dk, off=(-6, -6), inner=dots, hl=(46, 50, 11, 8, -35))
    a.part(P('M 66 30 C 72 18 90 14 100 20 C 94 32 78 36 66 30 Z'), lf, ldk, shade=False, sw=2.6,
           inner=paint(P('M 70 29 C 80 25 88 22 96 21'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".6"' % ldk))
    a.flat(E(62, 30, 4.5, 3), '#6A8A2A', '#3C5A14', sw=1.8)
    return a


# =============================== HOME BADGES ===============================
def badge(name, scene, rim_dark):
    a = Art(name)
    cid = name + '_clip'
    a.defs.append('<clipPath id="%s"><circle cx="64" cy="64" r="52"/></clipPath>' % cid)
    a.add(paint(C(64, 67, 58), 'fill="%s" opacity=".18"' % SHADOW))
    a.add(paint(C(64, 64, 58), 'fill="#FFFFFF" stroke="%s" stroke-width="3"' % rim_dark))
    a.add('<g clip-path="url(#%s)">' % cid)
    scene(a)
    a.add('</g>')
    a.add(paint(C(64, 64, 52), 'fill="none" stroke="%s" stroke-width="2.4" opacity=".55"' % rim_dark))
    return a


SKY = '#BFE8FF'
GRASS, GDK = '#8ED05E', '#4E9A2E'


def home_pond():
    def scene(a):
        a.add(R(0, 0, 128, 128).replace('{A}', 'fill="%s"' % SKY))
        a.add(paint(P('M 0 54 C 30 44 98 44 128 54 L 128 128 L 0 128 Z'), 'fill="%s"' % GRASS))
        a.add(paint(P('M 0 54 C 30 44 98 44 128 54'), 'fill="none" stroke="%s" stroke-width="2.4"' % GDK))
        # water
        a.part(E(64, 86, 50, 28), '#4AB0EA', '#1F6FB0', off=(0, 5), shade_t=.3, sil=False, sw=3,
               hl=(48, 72, 18, 4))
        # ripples
        for (cx, cy, rx) in ((84, 80, 12), (84, 80, 6), (40, 100, 9)):
            a.add(paint(E(cx, cy, rx, rx * .38), 'fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".85"'))
        # lily pad with notch + pink flower
        a.part(P('M 50 94 L 68 86 C 70 98 64 108 48 110 C 30 112 18 104 18 94 C 18 84 30 78 42 78 Z'),
               '#55C04A', '#2C7F22', shade=False, sil=False, sw=2.6, hl=(32, 86, 7, 2.6))
        for k in range(5):
            ang = -90 + k * 72
            x = 42 + 7 * math.cos(math.radians(ang))
            y = 92 + 5 * math.sin(math.radians(ang))
            a.flat(E(x, y, 5.5, 3.6, ang), '#FF8FB4', '#D04F7E', sw=1.4)
        a.flat(C(42, 92, 3.2), '#FFE27A')
        # reeds / cattails on the right bank
        for (x, h) in ((104, 30), (112, 24)):
            a.line('M %s 72 L %s %s' % (f(x), f(x), f(72 - h)), '#3C8A2A', 3)
            a.flat(R(x - 3.5, 72 - h - 2, 7, 13, 3.5), '#9A6234', '#5E3A18', sw=1.6)
        a.line('M 20 70 C 18 62 22 56 26 52 M 24 72 C 24 64 28 60 32 58', '#3C8A2A', 3)
    return badge('home_pond', scene, '#1F6FB0')


def home_tree():
    def scene(a):
        a.add(R(0, 0, 128, 128).replace('{A}', 'fill="%s"' % SKY))
        a.add(paint(P('M 0 100 C 30 94 98 94 128 100 L 128 128 L 0 128 Z'), 'fill="%s"' % GRASS))
        # trunk
        a.part(P('M 54 104 C 58 92 58 76 56 62 L 72 62 C 70 76 70 92 76 104 C 70 106 60 106 54 104 Z'),
               '#A86B3A', '#663C18', sil=False, off=(-3, 0), shade_t=.35)
        a.flat(E(64, 82, 4.5, 6), '#4A2A14')  # little hole for a squirrel/owl
        # canopy clusters
        lf, ldk = '#4FB848', '#26781F'
        canopy = ('M 30 62 C 18 60 14 46 22 38 C 20 26 32 18 42 22 C 46 12 60 8 70 14 C 80 8 96 12 98 24 '
                  'C 110 26 116 40 108 50 C 112 62 100 72 88 68 C 82 76 68 76 62 70 C 54 76 38 72 30 62 Z')
        a.part(P(canopy), lf, ldk, sil=False, off=(-5, -6), shade_t=.42,
               inner=(paint(C(46, 36, 10), 'fill="#7AD35E" opacity=".7"') +
                      paint(C(76, 28, 8), 'fill="#7AD35E" opacity=".7"') +
                      paint(C(90, 46, 6), 'fill="#7AD35E" opacity=".6"')))
        a.line('M 44 50 Q 50 54 56 50 M 74 52 Q 80 56 86 52', ldk, 2, opacity=.5)
        for (x, y) in ((34, 112), (96, 110)):
            a.line('M %s %s L %s %s M %s %s L %s %s' % (f(x), f(y), f(x - 3), f(y - 7), f(x + 4), f(y), f(x + 5), f(y - 6)), GDK, 2.4)
    return badge('home_tree', scene, '#26781F')


def home_field():
    def scene(a):
        a.add(R(0, 0, 128, 128).replace('{A}', 'fill="%s"' % SKY))
        # sun hint
        a.flat(C(98, 30, 11), '#FFE27A', '#E0A81C', sw=2)
        # far + near hills
        a.add(paint(P('M 0 66 C 30 54 70 56 128 64 L 128 128 L 0 128 Z'), 'fill="#B5DE7A"'))
        a.add(paint(P('M 0 80 C 40 70 90 72 128 80 L 128 128 L 0 128 Z'), 'fill="%s"' % GRASS))
        a.add(paint(P('M 0 80 C 40 70 90 72 128 80'), 'fill="none" stroke="%s" stroke-width="2.2" opacity=".7"' % GDK))
        # fence: rails + posts
        wood, wdk = '#F3D7A6', '#A6763E'
        a.flat(R(4, 64, 120, 6, 2), wood, wdk, sw=2)
        a.flat(R(4, 76, 120, 6, 2), wood, wdk, sw=2)
        for x in (14, 38, 62, 86, 110):
            a.flat(P('M %s 88 L %s 60 L %s 55 L %s 60 L %s 88 Z' % (f(x - 5), f(x - 5), f(x), f(x + 5), f(x + 5))),
                   wood, wdk, sw=2.2)
        # grass tufts
        for (x, y) in ((22, 102), (100, 104), (80, 116)):
            a.line('M %s %s L %s %s M %s %s L %s %s M %s %s L %s %s' % (
                f(x), f(y), f(x - 4), f(y - 9), f(x + 3), f(y), f(x + 3), f(y - 11), f(x + 6), f(y), f(x + 10), f(y - 8)), GDK, 2.6)
        # big flower
        a.line('M 50 116 C 50 106 52 98 52 90', '#3C8A2A', 3.4)
        a.flat(E(58, 104, 7, 3.4, -30), '#5CC04A', '#2C7F22', sw=1.8)
        for k in range(6):
            ang = k * 60
            x = 52 + 9 * math.cos(math.radians(ang))
            y = 88 + 9 * math.sin(math.radians(ang))
            a.flat(C(x, y, 6.5), '#FF8FB4', '#D04F7E', sw=2)
        a.flat(C(52, 88, 6), '#FFD23F', '#C99A12', sw=2)
    return badge('home_field', scene, '#4E9A2E')


def home_cave():
    def scene(a):
        a.add(R(0, 0, 128, 128).replace('{A}', 'fill="%s"' % SKY))
        rock, rdk = '#B4A596', '#6E5E50'
        # lumpy rocky hill
        a.part(P('M -4 118 C 0 84 10 58 26 44 C 30 34 40 30 48 32 C 56 24 72 24 80 30 C 90 28 100 36 102 44 C 118 58 128 84 132 118 Z'), rock, rdk,
               sil=False, off=(-6, -4), shade_t=.4, hl=(40, 40, 12, 5, -35),
               inner=(paint(P('M 18 74 L 30 68 M 100 52 L 110 62 M 102 84 L 114 80 M 36 46 L 46 42'),
                            'fill="none" stroke="%s" stroke-width="2.2" opacity=".5"' % rdk)))
        # cave mouth (dark arch) framed by rounded stones
        a.part(P('M 30 114 C 28 80 42 58 64 56 C 86 58 100 80 98 114 Z'), '#3A3050', '#221B32', shade=False,
               sil=False, sw=3, inner=paint(E(64, 114, 26, 20), 'fill="#2A2240"'))
        for k in range(7):
            t = math.radians(180 + k * 30)
            x = 64 + 36 * math.cos(t)
            y = 92 + 37 * math.sin(t)
            a.part(E(x, y, 5.5, 4.4, k * 30), '#C9BCAE', rdk, sil=False, sw=2.4, off=(-2, -2))
        a.flat(C(58, 96, 1.6), '#FFFFFF', opacity=.5)
        a.flat(C(72, 102, 1.2), '#FFFFFF', opacity=.4)
        # grass in front of the mouth
        a.add(paint(P('M 0 108 C 40 102 88 102 128 108 L 128 128 L 0 128 Z'), 'fill="%s"' % GRASS))
        a.line('M 0 108 C 40 102 88 102 128 108', GDK, 2.2)
        a.line('M 40 114 L 38 104 M 44 114 L 46 103 M 86 114 L 84 104 M 90 114 L 92 104', GDK, 2.4)
    return badge('home_cave', scene, '#6E5E50')


ALL = {
    'animal_fish': fish, 'animal_frog': frog, 'animal_duck': duck, 'animal_bird': bird, 'animal_owl': owl,
    'animal_squirrel': squirrel, 'animal_rabbit': rabbit, 'animal_cow': cow, 'animal_sheep': sheep,
    'animal_bat': bat, 'animal_bear': bear, 'animal_hen': hen, 'animal_cat': cat,
    'fruit_apple': apple, 'fruit_banana': banana, 'fruit_strawberry': strawberry, 'fruit_orange': orange,
    'home_pond': home_pond, 'home_tree': home_tree, 'home_field': home_field, 'home_cave': home_cave,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ALL.items():
        art = fn()
        svg = art.svg(sticker=not name.startswith('home_'))
        with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
            fh.write(svg)
    print('wrote %d sprites to %s' % (len(ALL), OUT))


if __name__ == '__main__':
    main()
