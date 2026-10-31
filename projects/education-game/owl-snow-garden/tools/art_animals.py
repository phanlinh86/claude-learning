#!/usr/bin/env python3
"""Generate Owlet's Snow Garden arctic-animal badge sprites (character artist B).

Writes game/assets/default/items/animal_{bear,seal,fox,hare,reindeer,walrus,penguin,puffin,whale}.svg
(viewBox 0 0 128 128). All art is original, built from simple primitives (same pipeline as
dino-nest-sort / puppy-garden-catch):
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

EYE = '#2A2135'
CHEEK = '#FF7F9E'
STICKER_SW = 15          # stroke width of the sticker <use>: 7.5 px beyond geometry = 6 px beyond a 3 px outline
SHADOW = '#2B4A7A'       # faint blue-ish drop shadow


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



# ANIMALS_BELOW
# Cool snow-white (fox, hare) vs warm cream-white (bear) so the three white animals differ.
SNOW, SNOW_SH, SNOW_DK = '#FCFDFF', '#D3DEEB', '#71839C'
CREAM, CREAM_SH, CREAM_DK = '#FFFAEE', '#EADFC6', '#8E8578'
NOSE = '#2A2135'
PINK = '#F4B3C2'


def mirror(d):
    return mirror_d(d)


def bear():
    """Polar bear cub, sitting, front view: small round ears, broad head, big cream muzzle, black nose."""
    a = Art('bear')
    w, sh, dk = CREAM, CREAM_SH, CREAM_DK
    # body
    a.part(E(64, 99, 33, 19), w, dk, shade_col=sh, inner=paint(E(64, 104, 18, 11), 'fill="#FFFFFF"'))
    # feet with pads
    for x in (42, 86):
        a.part(E(x, 110, 12, 6.5), w, dk, shade_col=sh, sw=2.6)
        a.flat(E(x, 111, 5.5, 3.4), '#CDBFB4')
    # ears
    for x in (34, 94):
        a.part(C(x, 27, 11.5), w, dk, shade_col=sh, inner=paint(C(x + (1 if x < 64 else -1), 28.5, 6), 'fill="%s"' % '#E9C9C4'))
    # head
    a.part(E(64, 54, 38, 31), w, dk, shade_col=sh, hl=(44, 36, 10, 5, -30))
    # muzzle
    a.part(E(64, 69, 17, 12.5), '#FFFFFF', dk, shade_col='#F1E8D6', sw=2.4, sil=False, off=(-2, -3))
    a.flat(P('M 56 63 C 56 58.5 72 58.5 72 63 C 72 67 67 70 64 70 C 61 70 56 67 56 63 Z'), NOSE)
    a.flat(E(61, 61.5, 2.6, 1.3), '#FFFFFF', opacity=.75)
    a.line('M 64 70 L 64 73 M 58 73.5 Q 64 79 70 73.5', '#4A3E40', 2.4)
    a.eye(48, 50, 6.6)
    a.eye(80, 50, 6.6)
    a.cheek(36, 64, 6.5)
    a.cheek(92, 64, 6.5)
    # arms on belly
    a.part(E(36, 96, 7, 11, 25), w, dk, shade_col=sh, sw=2.6, off=(-2, -3))
    a.part(E(92, 96, 7, 11, -25), w, dk, shade_col=sh, sw=2.6, off=(-2, -3))
    return a


def fox():
    """Arctic fox, sitting 3/4: tall pointy ears, pointed snout, huge bushy curled tail on the right."""
    a = Art('fox')
    w, sh, dk = SNOW, SNOW_SH, SNOW_DK
    # bushy tail curling up the right side
    a.part(P('M 64 114 C 96 120 122 104 120 76 C 119 64 116 56 110 50 C 108 54 106 48 102 46 C 102 50 98 46 92 48 '
             'C 88 54 90 62 96 68 C 104 76 102 90 92 96 C 84 100 74 100 64 100 Z'), w, dk, shade_col=sh,
           hl=(110, 72, 3.5, 9, 0),
           inner=paint(P('M 104 56 Q 108 62 110 70 M 112 84 Q 110 92 104 98 M 84 106 Q 92 106 98 102'),
                       'fill="none" stroke="%s" stroke-width="2" stroke-linecap="round" opacity=".55"' % SNOW_DK))
    # body
    a.part(P('M 40 112 C 34 96 40 76 56 70 C 72 66 84 80 84 98 C 84 108 80 114 72 114 L 46 114 C 43 114 41 113 40 112 Z'),
           w, dk, shade_col=sh, inner=paint(E(58, 92, 10, 14), 'fill="#FFFFFF"'))
    # front legs
    for x in (50, 66):
        a.part(R(x - 6, 92, 12, 23, 6), w, dk, shade_col=sh, sw=2.6, off=(-2, -3))
    # ears (tall, pointed)
    a.part(P('M 24 44 C 20 30 20 16 24 8 C 34 12 44 22 50 32 Z'), w, dk, shade_col=sh,
           inner=paint(P('M 28 38 C 26 28 26 20 28 15 C 34 19 40 26 43 32 Z'), 'fill="%s"' % '#C9D3E2'))
    a.part(P('M 88 44 C 92 30 92 16 88 8 C 78 12 68 22 62 32 Z'), w, dk, shade_col=sh,
           inner=paint(P('M 84 38 C 86 28 86 20 84 15 C 78 19 72 26 69 32 Z'), 'fill="%s"' % '#C9D3E2'))
    # head: fluffy cheek tufts and a pointed snout
    a.part(P('M 20 52 C 18 36 36 26 56 26 C 76 26 94 36 92 52 C 92 56 96 58 98 60 C 92 62 88 62 86 64 '
             'C 80 70 70 76 62 82 C 58 85 54 85 50 82 C 42 76 32 70 26 64 C 24 62 20 62 14 60 C 16 58 20 56 20 52 Z'),
           w, dk, shade_col=sh, hl=(38, 36, 9, 4.5, -20))
    a.flat(P('M 51 77 C 51 74 61 74 61 77 C 61 80 58 82 56 82 C 54 82 51 80 51 77 Z'), NOSE)
    a.flat(E(54.5, 76, 1.8, 1), '#FFFFFF', opacity=.75)
    a.line('M 50 70 Q 53 73 56 71 Q 59 73 62 70', '#4A4E5C', 2.2)
    a.eye(43, 54, 6.4, look=(.5, 0))
    a.eye(69, 54, 6.4, look=(-.5, 0))
    a.cheek(32, 63, 5.5)
    a.cheek(80, 63, 5.5)
    return a


def hare():
    """Snow hare, front view: very long upright ears with grey tips, round face, big hind feet."""
    a = Art('hare')
    w, sh, dk = SNOW, SNOW_SH, SNOW_DK
    tip = '#8A97AB'
    for (cx, rot) in ((47, -10), (81, 10)):
        ear = E(cx, 34, 10, 27, rot)
        a.part(ear, w, dk, shade_col=sh,
               inner=paint(E(cx, 37, 4.6, 19, rot), 'fill="%s"' % PINK) +
               paint(E(cx + (-3.5 if rot < 0 else 3.5), 9, 11, 8, rot), 'fill="%s"' % tip))
    # body
    a.part(E(64, 100, 27, 16), w, dk, shade_col=sh)
    # long hind feet
    a.part(E(44, 111, 13, 6), w, dk, shade_col=sh, sw=2.6, off=(-2, -3))
    a.part(E(84, 111, 13, 6), w, dk, shade_col=sh, sw=2.6, off=(-2, -3))
    # head
    a.part(E(64, 70, 30, 26), w, dk, shade_col=sh, hl=(48, 55, 8, 4.5, -30),
           inner=paint(E(64, 82, 13, 8.5), 'fill="#FFFFFF"'))
    a.eye(52, 66, 6.6)
    a.eye(76, 66, 6.6)
    a.flat(P('M 60 76 C 60 74 68 74 68 76 L 64 80.5 Z'), '#E8829E', '#B65C78', sw=1.4)
    a.line('M 64 80.5 L 64 83 M 64 83 Q 60 87 57 84.5 M 64 83 Q 68 87 71 84.5', '#6A6E80', 2.2)
    a.line('M 44 80 L 32 78 M 44 84 L 33 86 M 84 80 L 96 78 M 84 84 L 95 86', '#9AA6B8', 1.6)
    a.cheek(44, 76, 5.5)
    a.cheek(84, 76, 5.5)
    a.part(E(54, 97, 6, 5), w, dk, shade=False, sw=2.2, sil=False)
    a.part(E(74, 97, 6, 5), w, dk, shade=False, sw=2.2, sil=False)
    return a


def seal():
    """Grey harp-seal pup lying on its tummy: big round head, huge dark eyes, whiskers, tail flippers."""
    a = Art('seal')
    g, dk = '#B9C3CF', '#5F6C80'
    belly = '#E4E9EF'
    # tail flippers
    a.part(P('M 100 88 C 108 78 118 72 122 76 C 124 82 116 90 110 94 C 118 96 124 102 120 108 C 114 110 106 104 100 98 Z'),
           mix(g, dk, .15), dk, shade=False)
    # body
    a.part(P('M 18 86 C 16 64 36 56 60 60 C 84 64 98 78 104 90 C 106 100 98 108 86 110 L 38 112 C 26 110 18 100 18 86 Z'),
           g, dk, hl=(70, 66, 10, 4, 15),
           inner=paint(E(56, 112, 36, 10), 'fill="%s"' % belly) +
           paint(C(78, 78, 3), 'fill="%s" opacity=".35"' % dk) + paint(C(88, 86, 2.4), 'fill="%s" opacity=".35"' % dk) +
           paint(C(70, 72, 2), 'fill="%s" opacity=".35"' % dk))
    # front flipper
    a.part(P('M 60 96 C 70 96 80 102 82 110 C 74 112 64 108 58 102 Z'), mix(g, dk, .15), dk, shade=False, sw=2.4)
    # head
    a.part(C(42, 54, 29), g, dk, hl=(28, 36, 8, 5, -30))
    a.eye(31, 50, 7.8)
    a.eye(54, 50, 7.8)
    a.flat(E(37, 66, 8, 6), belly, mix(g, dk, .5), sw=1.8)
    a.flat(E(48, 66, 8, 6), belly, mix(g, dk, .5), sw=1.8)
    a.flat(P('M 38.5 59 C 38.5 56.5 46.5 56.5 46.5 59 C 46.5 61.5 44 63 42.5 63 C 41 63 38.5 61.5 38.5 59 Z'), NOSE)
    a.line('M 42.5 69 Q 42.5 71 40 72 M 42.5 69 Q 42.5 71 45 72', '#4A4E5C', 2)
    for s in (-1, 1):
        x0 = 42.5 + s * 12
        a.line('M %s 64 L %s 61 M %s 67 L %s 68 M %s 70 L %s 74' % (
            f(x0), f(x0 + s * 11), f(x0), f(x0 + s * 12), f(x0 - s * 1), f(x0 + s * 10)), '#6F7B8E', 1.5)
    a.cheek(24, 62, 5)
    a.cheek(61, 62, 5)
    for (x, y) in ((40, 38), (48, 34)):
        a.flat(C(x, y, 2), dk, opacity=.3)
    return a


def reindeer():
    """Brown reindeer, front view: small branched antlers, sideways ears, cream muzzle, #C96B5C nose."""
    a = Art('reindeer')
    b, dk = '#A8714A', '#6B4128'
    cream = '#F1DDBF'
    ant, adk = '#E2C496', '#94714A'
    antler_l = 'M 50 32 C 47 26 44 22 42 15 M 45 24 C 40 24 35 22 31 18 M 43 18 C 45 16 47 15 49 14'
    for d in (antler_l, mirror(antler_l)):
        a.line(d, adk, 8.5, sil=True)
    for d in (antler_l, mirror(antler_l)):
        a.line(d, ant, 4.4)
    # shoulders with fluffy cream chest
    a.part(P('M 30 116 C 28 102 40 94 64 94 C 88 94 100 102 98 116 Z'), b, dk, hl=(42, 102, 6, 3, -20),
           inner=paint(scallop(64, 106, 14, 10, 9, 2.2), 'fill="%s"' % cream))
    # ears
    a.part(E(26, 46, 14, 6.5, -22), b, dk, inner=paint(E(27, 46, 8, 3, -22), 'fill="%s"' % '#E9B8A2'))
    a.part(E(102, 46, 14, 6.5, 22), b, dk, inner=paint(E(101, 46, 8, 3, 22), 'fill="%s"' % '#E9B8A2'))
    # head
    a.part(P('M 34 52 C 34 34 48 26 64 26 C 80 26 94 34 94 52 C 94 64 88 70 84 76 C 84 90 76 98 64 98 '
             'C 52 98 44 90 44 76 C 40 70 34 64 34 52 Z'), b, dk, hl=(46, 36, 8, 4, -25))
    a.part(E(64, 82, 18, 14), cream, mix(cream, dk, .5), shade=False, sw=2.4, sil=False)
    a.part(E(64, 76, 9.5, 7.5), '#C96B5C', '#8E4438', shade_t=.3, sw=2.4, sil=False, off=(-2, -2),
           hl=(61, 73.5, 3, 1.8, -20))
    a.line('M 64 84 L 64 87 M 58 87.5 Q 64 93 70 87.5', '#5A3420', 2.4)
    # forehead tuft
    a.flat(P('M 58 30 C 60 36 62 36 64 32 C 66 36 68 36 70 30 Z'), mix(b, dk, .3))
    a.eye(52, 54, 6.4)
    a.eye(76, 54, 6.4)
    a.cheek(44, 68, 5.5)
    a.cheek(84, 68, 5.5)
    return a


def walrus():
    """Brown walrus: round pear body, puffy whisker pads, short round cream tusks, little flippers."""
    a = Art('walrus')
    b, dk = '#B07A56', '#6E4630'
    pad = '#E4BC98'
    tusk, tdk = '#FFF4DC', '#C9A877'
    # flippers
    a.part(E(22, 106, 13, 7, 25), mix(b, dk, .15), dk, shade=False)
    a.part(E(106, 106, 13, 7, -25), mix(b, dk, .15), dk, shade=False)
    # body
    a.part(P('M 22 96 C 18 60 36 22 64 22 C 92 22 110 60 106 96 C 104 112 86 116 64 116 C 42 116 24 112 22 96 Z'),
           b, dk, hl=(44, 36, 10, 5, -30),
           inner=paint(E(64, 104, 26, 12), 'fill="%s" opacity=".55"' % pad) +
           paint(P('M 50 34 Q 56 31 62 34 M 66 34 Q 72 31 78 34'), 'fill="none" stroke="%s" stroke-width="2" opacity=".4"' % dk))
    # tusks (short, rounded) behind the pads
    for x in (55, 73):
        a.part(P('M %s 72 L %s 88 C %s 94 %s 94 %s 88 L %s 72 Z' % (
            f(x - 4.5), f(x - 4.5), f(x - 4.5), f(x + 4.5), f(x + 4.5), f(x + 4.5))), tusk, tdk, shade=False, sw=2.2, sil=False)
    # whisker pads
    a.part(C(54, 70, 12), pad, mix(pad, dk, .55), sw=2.4, sil=False, off=(-2, -3), shade_t=.25)
    a.part(C(74, 70, 12), pad, mix(pad, dk, .55), sw=2.4, sil=False, off=(-2, -3), shade_t=.25)
    for (x, y) in ((48, 68), (52, 73), (56, 67), (46, 74), (80, 68), (76, 73), (72, 67), (82, 74)):
        a.flat(C(x, y, 1.3), mix(pad, dk, .6))
    a.flat(P('M 58 59 C 58 55 70 55 70 59 C 70 62 66 64 64 64 C 62 64 58 62 58 59 Z'), '#3E2A24')
    a.flat(E(61.5, 58, 2, 1), '#FFFFFF', opacity=.7)
    a.eye(50, 47, 6)
    a.eye(78, 47, 6)
    a.cheek(38, 60, 5.5)
    a.cheek(90, 60, 5.5)
    return a


def penguin():
    """Black-and-white penguin, front view: egg body, white heart face + belly, orange beak and feet."""
    a = Art('penguin')
    k, dk = '#33405A', '#1B2335'
    w = '#FBFCFF'
    o, odk = '#FF9A2E', '#C4650C'
    for x in (50, 78):
        a.part(E(x, 112, 12, 5.5), o, odk, shade=False, sw=2.4)
    # flippers
    a.part(E(24, 76, 8, 20, 22), k, dk, shade=False)
    a.part(E(104, 76, 8, 20, -22), k, dk, shade=False)
    a.part(E(64, 66, 38, 47), k, dk, hl=(42, 34, 9, 5, -30),
           inner=paint(P('M 64 42 C 56 28 34 30 34 52 C 34 72 38 98 64 110 C 90 98 94 72 94 52 C 94 30 72 28 64 42 Z'),
                       'fill="%s"' % w) +
                 paint(E(64, 100, 22, 10), 'fill="%s"' % '#DCE4EE'))
    a.eye(52, 50, 6.4, look=(.5, 0))
    a.eye(76, 50, 6.4, look=(-.5, 0))
    a.part(P('M 56 59 C 58 56 70 56 72 59 C 70 64 66 68 64 68 C 62 68 58 64 56 59 Z'), o, odk, shade_t=.3,
           sw=2.2, sil=False, off=(-1.5, -2))
    a.cheek(44, 62, 5.5)
    a.cheek(84, 62, 5.5)
    return a


def puffin():
    """Puffin, side 3/4 facing left: black back, white face, big orange-striped beak, orange feet."""
    a = Art('puffin')
    k, dk = '#33405A', '#1B2335'
    w = '#FBFCFF'
    o, odk = '#FF8A2A', '#BF5A10'
    # feet
    a.part(P('M 56 108 L 70 108 C 72 114 66 116 58 116 C 50 116 50 112 56 108 Z'), o, odk, shade=False, sw=2.4)
    a.part(P('M 74 108 L 88 108 C 92 112 90 116 82 116 C 74 116 70 112 74 108 Z'), o, odk, shade=False, sw=2.4)
    # tail
    a.part(P('M 96 88 L 112 98 C 108 102 100 102 94 100 Z'), k, dk, shade=False, sw=2.4)
    # body
    a.part(E(72, 80, 30, 32, -8), k, dk, hl=(90, 56, 5, 8, 20),
           inner=paint(E(60, 88, 20, 26, -8), 'fill="%s"' % w))
    # wing
    a.part(P('M 78 66 C 92 62 104 74 102 92 C 96 98 86 98 80 92 C 84 84 82 74 78 66 Z'), mix(k, '#5A6A88', .3), dk,
           shade=False, sw=2.4, sil=False)
    # head
    a.part(C(56, 42, 25), k, dk, hl=(66, 24, 6, 3.5, 20),
           inner=paint(E(48, 46, 18, 17), 'fill="%s"' % '#EEF1F6'))
    # beak: grey base band, yellow stripe, big orange, red-orange tip
    beak = P('M 36 30 C 24 34 12 44 10 54 C 14 60 26 64 36 64 Z')
    bands = (paint(R(28, 20, 10, 50), 'fill="#7E8BA0"') +
             paint(P('M 25 20 C 23 34 23 54 25 70 L 30 70 C 28 54 28 34 30 20 Z'), 'fill="#FFD23F"') +
             paint(P('M 18 20 C 16 34 16 54 18 70 L 4 70 L 4 20 Z'), 'fill="#E85A3A"'))
    a.part(beak, o, odk, shade_t=.25, inner=bands, hl=(20, 44, 4, 2, -30), sw=2.6)
    a.line('M 36 52 C 26 52 18 54 11 55', odk, 2)
    # puffin eye markings
    a.flat(P('M 44 34 L 48 30 L 50 34 Z'), '#7E8BA0')
    a.eye(48, 42, 6.2, look=(-.8, 0))
    a.cheek(50, 55, 6, opacity=.75)
    return a


def whale():
    """Small blue-grey beluga-style whale: rounded melon head, tail fluke up, big smile, little spout."""
    a = Art('whale')
    b, dk = '#A7C2DA', '#4D6D8C'
    belly = '#DDEAF5'
    # spout
    spout = 'M 40 36 L 40 20 C 37 14 31 13 27 18 M 40 20 C 43 14 49 13 53 18'
    a.line(spout, '#5E98C6', 6.4, sil=True)
    a.line(spout, '#BFE4FA', 3.2)
    for (x, y) in ((24, 26), (56, 26)):
        drop = P('M %s %s C %s %s %s %s %s %s C %s %s %s %s %s %s Z' % (
            f(x), f(y - 5), f(x + 4), f(y), f(x + 3), f(y + 3), f(x), f(y + 3), f(x - 3), f(y + 3), f(x - 4), f(y), f(x), f(y - 5)))
        a.part(drop, '#BFE4FA', '#5E98C6', shade=False, sw=2)
    # tail fluke
    a.part(P('M 100 70 C 98 58 100 46 106 40 C 112 42 114 50 112 58 C 116 52 122 48 124 52 C 124 62 116 72 106 78 Z'),
           mix(b, dk, .12), dk, shade=False)
    # body
    a.part(P('M 10 76 C 8 52 24 36 46 36 C 70 36 86 54 98 66 C 102 70 106 70 108 68 C 110 76 104 84 94 88 '
             'C 78 98 52 104 34 100 C 18 96 10 88 10 76 Z'), b, dk, hl=(30, 46, 10, 5, -25),
           inner=paint(P('M 12 82 C 30 94 60 96 92 86 L 96 110 L 10 110 Z'), 'fill="%s"' % belly))
    # flipper
    a.part(E(54, 92, 12, 6, 28), mix(b, dk, .15), dk, shade=False, sw=2.4, sil=False)
    a.eye(36, 62, 6.6)
    a.line('M 16 78 Q 28 88 44 80', dk, 2.8)
    a.cheek(46, 74, 6)
    a.line('M 64 52 Q 70 50 76 54', '#FFFFFF', 2, opacity=.6)
    return a


ALL = {
    'animal_bear': bear, 'animal_seal': seal, 'animal_fox': fox, 'animal_hare': hare, 'animal_reindeer': reindeer,
    'animal_walrus': walrus, 'animal_penguin': penguin, 'animal_puffin': puffin, 'animal_whale': whale,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ALL.items():
        with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
            fh.write(fn().svg())
    print('wrote %d sprites to %s' % (len(ALL), OUT))


if __name__ == '__main__':
    main()
