#!/usr/bin/env python3
"""Generate Gigi's Peekaboo Windows animal + home sticker sprites (character artist C, DESIGN §4.3).

Writes game/assets/default/items/
  animal_{dog,cat,bird,fish,bee,rabbit,duck,hen,spider}.svg
  home_{kennel,basket,nest,bowl,hive,hutch,pond,coop,web}.svg
(viewBox 0 0 128 128, animals full body facing RIGHT, homes EMPTY). Same pipeline as
../duckling-forest-memory/tools/art_animals.py, all art original, built from simple primitives:
  * every part = fill + one-step cel shade (the part shifted up-left, clipped, leaves a darker
    crescent lower-right) + outline in a darker tone of the fill (never black);
  * white sticker border (~6 px beyond the outline) + faint warm drop shadow (opacity .18, +3 y),
    both made from one <use> of the merged silhouette;
  * every sticker is auto-fitted (scale + shift) so its sticker silhouette is ~110-118 px and centred.
Stickers are shown on the cream window interior (#FFF6E2), on the pavement and in the HUD.
No filters, text, fonts, scripts or external refs.

Pairs (topic `homes`): dog-kennel, cat-basket, bird-nest, fish-bowl, bee-hive, rabbit-hutch, duck-pond,
hen-coop, spider-web.

Usage: python3 tools/art_animals.py
"""
import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

EYE = '#2F2622'
CHEEK = '#F59AAE'
STICKER_SW = 14          # stroke width of the sticker <use>: 7 px beyond geometry = ~6 px beyond a 2.4 px outline
SHADOW = '#3A3020'       # faint warm drop shadow
TARGET = 106             # largest side of the fitted geometry (sticker border adds 14 -> ~120 px)
NOSE = '#3A2622'


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


def attr(shape, name):
    m = re.search(r'\b%s="([-\d.]+)"' % name, shape)
    return float(m.group(1)) if m else 0.0


def bbox_of(shape, pad=0.0):
    """Conservative bounding box of one shape string (absolute path commands only; curve control points included)."""
    if shape.startswith('<circle'):
        cx, cy, r = attr(shape, 'cx'), attr(shape, 'cy'), attr(shape, 'r')
        b = (cx - r, cy - r, cx + r, cy + r)
    elif shape.startswith('<ellipse'):
        cx, cy, rx, ry = attr(shape, 'cx'), attr(shape, 'cy'), attr(shape, 'rx'), attr(shape, 'ry')
        m = re.search(r'rotate\(([-\d.]+)', shape)
        if m:
            a = math.radians(float(m.group(1)))
            hx = math.hypot(rx * math.cos(a), ry * math.sin(a))
            hy = math.hypot(rx * math.sin(a), ry * math.cos(a))
        else:
            hx, hy = rx, ry
        b = (cx - hx, cy - hy, cx + hx, cy + hy)
    elif shape.startswith('<rect'):
        x, y, w, h = attr(shape, 'x'), attr(shape, 'y'), attr(shape, 'width'), attr(shape, 'height')
        b = (x, y, x + w, y + h)
    else:
        d = re.search(r'd="([^"]+)"', shape).group(1)
        nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', d)]
        xs, ys = nums[0::2], nums[1::2]
        b = (min(xs), min(ys), max(xs), max(ys))
    return (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)


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


def poly(pts, close=True):
    d = 'M %s %s' % (f(pts[0][0]), f(pts[0][1])) + ''.join(' L %s %s' % (f(x), f(y)) for x, y in pts[1:])
    return d + (' Z' if close else '')


class Art:
    def __init__(self, name):
        self.name = name
        self.defs = []
        self.sil = []
        self.body = []
        self.n = 0
        self.box = None

    def cid(self):
        self.n += 1
        return '%s_c%d' % (self.name, self.n)

    def add(self, s):
        self.body.append(s)

    def _grow(self, b):
        self.box = b if self.box is None else (min(self.box[0], b[0]), min(self.box[1], b[1]),
                                               max(self.box[2], b[2]), max(self.box[3], b[3]))

    def silhouette(self, shape, sw=None):
        if sw:   # thin strokes (legs, reeds, threads) join the silhouette as strokes
            self.sil.append(paint(shape, 'fill="none" stroke-width="%s"' % f(sw + STICKER_SW)))
            self._grow(bbox_of(shape, sw / 2))
        else:
            self.sil.append(paint(shape, ''))
            self._grow(bbox_of(shape, 1.2))

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

    def limb(self, d, fill, dark, sw):
        """Thick outlined stroke (tail, leg): dark stroke + fill stroke on top, joins the silhouette."""
        self.line(d, dark, sw + 4.4, sil=True)
        self.line(d, fill, sw)

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

    def smile(self, cx, cy, w, color, sw=2.2, depth=None):
        d = depth if depth is not None else w * .55
        self.line('M %s %s Q %s %s %s %s' % (f(cx - w / 2), f(cy), f(cx), f(cy + d), f(cx + w / 2), f(cy)), color, sw)

    def fit(self):
        """(scale, dx, dy) so the silhouette box is TARGET px on its long side, centred at (64, 62.5)."""
        x0, y0, x1, y1 = self.box
        k = min(TARGET / (x1 - x0), TARGET / (y1 - y0), 1.2)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        return k, 64 - k * cx, 62.5 - k * cy

    def svg(self, sticker=True):
        out = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
               'width="128" height="128" viewBox="0 0 128 128">']
        defs = list(self.defs)
        if sticker:
            defs.append('<g id="%s_sil">%s</g>' % (self.name, ''.join(self.sil)))
        out.append('<defs>%s</defs>' % ''.join(defs))
        k, dx, dy = self.fit()
        out.append('<g transform="translate(%s %s) scale(%s)">' % (f(dx), f(dy), ('%.4f' % k).rstrip('0')))
        if sticker:
            ref = '#%s_sil' % self.name
            out.append('<use href="%s" xlink:href="%s" transform="translate(0 %s)" fill="%s" stroke="%s" '
                       'stroke-width="%d" stroke-linejoin="round" stroke-linecap="round" opacity=".18"/>' % (
                           ref, ref, f(3 / k), SHADOW, SHADOW, STICKER_SW))
            out.append('<use href="%s" xlink:href="%s" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
                       'stroke-linejoin="round" stroke-linecap="round"/>' % (ref, ref, STICKER_SW))
        out.extend(self.body)
        out.append('</g>')
        out.append('</svg>')
        return '\n'.join(out) + '\n'


def leg(a, x, y, w, h, fill, dark, sock=None, shade_col=None):
    inner = paint(R(x - 2, y + h - 7, w + 4, 9), 'fill="%s"' % sock) if sock else None
    a.part(R(x, y, w, h, min(w / 2, 6)), fill, dark, shade_col=shade_col, off=(-2, -3), inner=inner)


# ================================================================ animals
# Silhouettes kept apart: puppy = 4 legs + floppy ears + wagging tail; kitten = sits upright, pointy ears,
# curled tail, whiskers; bird = small round, pointed beak, tail fan, thin legs; goldfish = fish shape + big
# fan tail; bee = striped ball + wings + antennae; rabbit = very long ears; duckling = yellow + flat bill +
# webbed feet; hen = plump white + red comb + tail fan; spider = round ball + 8 bent legs + thread.

def dog():
    """Puppy standing, facing right: golden coat, floppy brown ears, white muzzle + chest, a brown back patch."""
    a = Art('dog')
    c, sh, dk = '#E7B272', '#D09455', '#8A5628'
    ear, edk = '#A8683A', '#6A3C1C'
    wht = '#FFF5E6'
    a.limb('M 32 76 C 24 70 18 60 20 46', c, dk, 8)          # tail up, wagging
    a.line('M 20 46 C 19 50 19 54 21 58', wht, 3.6, opacity=.9)
    for x, s in ((34, sh), (48, c), (70, sh), (84, c)):
        leg(a, x, 88, 12, 24, c, dk, sock=wht, shade_col=s if s != c else sh)
    a.part(E(60, 84, 31, 17), c, dk, shade_col=sh, hl=(46, 74, 9, 3, -8),
           inner=paint(E(86, 92, 11, 13), 'fill="%s"' % wht) + paint(E(50, 76, 10, 7, -10), 'fill="%s"' % ear))
    a.part(E(78, 54, 7, 13, 22), ear, edk, shade=False, sw=2.2)   # far ear peeking behind
    a.part(C(92, 54, 22), c, dk, shade_col=sh, hl=(82, 40, 6, 3, -25),
           inner=paint(P('M 96 34 C 100 42 100 50 98 58 L 92 58 C 92 50 92 42 96 34 Z'), 'fill="%s"' % wht))
    a.part(E(108, 66, 13, 9.5, -6), wht, mix(wht, dk, .55), shade_col='#F1DFC6', off=(-1, -2))
    a.flat(E(117, 61, 4.6, 3.6), NOSE)
    a.flat(C(115.8, 59.8, 1.2), '#FFFFFF', opacity=.75)
    a.line('M 117 64 L 117 68 M 108 69 Q 112 73 117 68 Q 119 71 121 69', '#7A4A30', 1.8)
    a.flat(P('M 111 71 C 111 77 117 77 117 71 Z'), '#F28C9C', '#B9546A', sw=1.2)
    a.part(P('M 76 38 C 68 40 64 52 66 66 C 68 74 78 74 80 66 C 82 56 84 44 82 38 Z'), ear, edk,
           shade_col='#8E5428', off=(-2, -2), sil=False, hl=(72, 48, 2, 5, 10))   # near floppy ear
    a.eye(92, 51, 6, look=(.8, 0))
    a.eye(106, 49, 5.2, look=(.8, 0))
    a.cheek(90, 64, 5, opacity=.85)
    return a


def cat():
    """Grey tabby kitten sitting, facing right: pointy ears, curled tail, whiskers, cream chest, stripes."""
    a = Art('cat')
    g, sh, dk = '#B9B6CA', '#9D99B2', '#5C5876'
    cream, pink = '#F6F3FA', '#F2A9B8'
    stripe = '#8A86A2'
    a.limb('M 46 108 C 24 112 12 100 14 84 C 16 72 26 66 28 56', g, dk, 9)
    a.line('M 28 56 C 28 60 27 63 26 65', stripe, 7)
    stripes = ''.join(paint(P(d), 'fill="none" stroke="%s" stroke-width="3.4" stroke-linecap="round"' % stripe) for d in (
        'M 42 80 C 48 82 52 86 54 92', 'M 40 92 C 46 94 50 98 50 104', 'M 50 70 C 56 72 60 76 62 82'))
    a.part(P('M 40 110 C 34 92 40 70 62 66 C 82 64 92 80 90 98 C 90 106 86 112 78 112 L 48 112 C 44 112 41 112 40 110 Z'),
           g, dk, shade_col=sh, hl=(50, 76, 6, 3, -30), inner=paint(E(78, 92, 10, 17), 'fill="%s"' % cream) + stripes)
    a.part(E(70, 111, 8, 5), g, dk, shade_col=sh, off=(-1, -2))
    a.part(E(85, 111, 8, 5), g, dk, shade_col=sh, off=(-1, -2))
    a.line('M 68 108 L 68 111 M 72 108 L 72 111 M 83 108 L 83 111 M 87 108 L 87 111', dk, 1.2)
    # pointy ears
    a.part(P('M 60 42 C 57 32 57 22 60 13 C 68 18 75 25 79 32 Z'), g, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 63 37 C 61 30 61 25 63 20 C 67 23 71 27 73 32 Z'), 'fill="%s"' % pink))
    a.part(P('M 88 30 C 94 23 100 18 108 15 C 108 24 106 33 102 41 Z'), g, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 92 30 C 96 26 100 23 104 21 C 104 27 103 32 101 36 Z'), 'fill="%s"' % pink))
    head_str = ''.join(paint(P(d), 'fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"' % stripe) for d in (
        'M 80 32 L 81 40', 'M 74 33 L 76 40', 'M 86 32 L 85 39', 'M 62 50 L 69 51', 'M 62 57 L 68 57'))
    a.part(E(83, 52, 24, 21), g, dk, shade_col=sh, hl=(72, 38, 6, 3, -25), inner=head_str)
    a.part(E(96, 61, 10, 7), cream, mix(cream, dk, .45), shade=False, sw=1.8, sil=False)
    a.flat(P('M 94 55 C 94 53 101 53 101 55 L 97.5 58.5 Z'), '#E8869E', '#A85870', sw=1.2)
    a.line('M 97.5 58.5 L 97.5 61 Q 94 65 91 62 M 97.5 61 Q 101 65 104 62', '#5C5876', 1.8)
    a.line('M 104 58 L 121 54 M 105 62 L 121 64', '#7A7690', 1.4, sil=True)
    a.eye(80, 50, 5.8, look=(.8, 0))
    a.eye(96, 48, 5.2, look=(.8, 0))
    a.cheek(78, 61, 4.8, opacity=.85)
    return a


def bird():
    """Little blue-grey songbird standing, facing right: peach breast, pointed beak, tail fan, thin legs."""
    a = Art('bird')
    b, sh, dk = '#93A7BF', '#7890AA', '#455B76'
    peach = '#F9D2B0'
    beak, bdk = '#F2A646', '#A86414'
    legc = '#C98652'
    a.line('M 58 98 L 56 114 M 50 116 L 56 114 L 62 116', mix(legc, dk, .4), 6.2, sil=True)
    a.line('M 72 98 L 72 114 M 66 116 L 72 114 L 78 116', mix(legc, dk, .4), 6.2, sil=True)
    a.line('M 58 98 L 56 114 M 50 116 L 56 114 L 62 116', legc, 3)
    a.line('M 72 98 L 72 114 M 66 116 L 72 114 L 78 116', legc, 3)
    a.part(P('M 40 70 C 30 64 18 56 10 46 C 10 58 14 70 22 78 C 18 82 16 86 14 92 C 24 92 34 86 42 80 Z'),
           b, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 14 52 C 22 62 30 68 40 72'), 'fill="none" stroke="%s" stroke-width="2" opacity=".6"' % dk))
    a.part(E(62, 78, 32, 24, -12), b, dk, shade_col=sh, hl=(48, 64, 9, 3.5, -20),
           inner=paint(E(80, 88, 18, 17), 'fill="%s"' % peach))
    a.part(C(88, 52, 21), b, dk, shade_col=sh, hl=(80, 38, 6, 3, -25),
           inner=paint(E(96, 64, 10, 8), 'fill="%s"' % peach))
    a.part(P('M 82 34 C 78 24 82 16 90 14 C 88 20 88 26 92 32 Z'), b, dk, shade_col=sh, off=(-1, -1))
    a.part(P('M 104 46 C 110 46 118 50 122 53 C 118 56 110 59 104 59 Z'), beak, bdk, shade_col='#DC8A2C', off=(-1, -2))
    a.line('M 105 53 L 116 53', bdk, 1.2)
    # wing with feather tips
    a.part(P('M 36 72 C 44 60 62 60 72 70 C 72 84 62 94 48 94 C 46 90 42 88 40 86 C 38 84 36 80 36 72 Z'),
           '#A9BBD0', dk, shade_col='#8DA2BB', off=(-2, -2), sil=False,
           inner=paint(P('M 44 82 C 50 84 56 84 62 80 M 46 88 C 52 90 58 88 64 84'),
                       'fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" opacity=".7"' % dk))
    a.eye(93, 48, 6.4, look=(.8, 0))
    a.cheek(92, 61, 5, opacity=.85)
    return a


def fish():
    """Goldfish swimming right: round body, big flowing fan tail, dorsal fin, big eye, two bubbles."""
    a = Art('fish')
    o, sh, dk = '#F59A52', '#DD7E3A', '#A4501C'
    fin, fdk = '#F9BE85', '#B86428'
    belly = '#FCCB98'
    rays = ''.join(paint(P(d), 'fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" opacity=".6"' % fdk) for d in (
        'M 38 66 C 28 56 20 50 12 48', 'M 36 70 C 26 70 18 70 12 70', 'M 38 74 C 28 82 20 88 12 92'))
    a.part(P('M 42 62 C 30 46 16 36 6 40 C 12 52 14 60 10 70 C 14 80 12 88 6 100 C 18 104 32 92 42 78 Z'),
           fin, fdk, shade_col='#F2A464', off=(-2, -2), inner=rays, hl=(14, 46, 2.5, 4, -40))
    a.part(P('M 56 46 C 60 30 76 24 90 32 C 86 38 82 42 80 48 Z'), fin, fdk, shade_col='#F2A464', off=(-1, -2),
           inner=paint(P('M 64 42 C 68 36 74 32 80 32'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".6"' % fdk))
    a.part(P('M 62 84 C 60 96 54 102 48 106 C 60 108 72 100 76 88 Z'), fin, fdk, shade_col='#F2A464', off=(-1, -2))
    scales = ''.join(paint(P('M %s %s q 4 5 8 0' % (f(x), f(y))),
                           'fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" opacity=".55"' % '#FFD2A8')
                     for x, y in ((50, 56), (60, 52), (54, 64), (64, 60), (58, 72), (68, 68)))
    a.part(P('M 38 68 C 38 50 58 40 78 40 C 100 40 116 54 116 66 C 116 80 100 92 78 92 C 58 92 38 84 38 68 Z'),
           o, dk, shade_col=sh, hl=(62, 48, 10, 3, -10),
           inner=paint(E(82, 84, 26, 9), 'fill="%s"' % belly) + scales)
    a.part(P('M 84 70 C 84 80 76 86 68 86 C 70 80 76 72 84 70 Z'), fin, fdk, shade=False, sw=1.8, sil=False)
    a.line('M 90 46 C 96 54 96 72 90 82', '#E07E36', 2, opacity=.7)   # gill
    a.eye_white(100, 58, 9, 6.2, dk, look=(1, 0))
    a.smile(110, 72, 7, '#8E3E12', 2, depth=3)
    a.cheek(102, 72, 4.6, opacity=.9)
    for x, y, r in ((118, 34, 5), (110, 20, 3.4)):
        a.part(C(x, y, r), '#E8F6FD', '#7FB2D0', shade=False, sw=1.8, hl=(x - r * .3, y - r * .35, r * .3, r * .2))
    return a


def bee():
    """Round fuzzy bee flying right: soft yellow with brown stripes, clear wings, antennae, tiny stinger."""
    a = Art('bee')
    y, sh, dk = '#FFD650', '#EDB92A', '#9A6E10'
    st = '#5E3E22'
    wing, wdk = '#EEF8FE', '#86AAC4'
    a.part(E(50, 38, 13, 20, -24), wing, wdk, shade=False, sw=2.2, hl=(46, 30, 3, 7, -24),
           inner=paint(P('M 48 52 C 48 42 50 32 54 24'), 'fill="none" stroke="%s" stroke-width="1.4" opacity=".6"' % wdk))
    a.part(E(70, 34, 13, 21, 18), wing, wdk, shade=False, sw=2.2, hl=(66, 26, 3, 7, 18),
           inner=paint(P('M 68 50 C 70 40 72 30 74 22'), 'fill="none" stroke="%s" stroke-width="1.4" opacity=".6"' % wdk))
    a.part(P('M 26 75 C 22 75 18 77 15 78 C 18 79 22 81 26 81 Z'), st, mix(st, '#000000', .2), shade=False, sw=1.8)
    for x in (50, 62, 74):
        a.line('M %s 96 L %s 106' % (f(x), f(x - 2)), st, 3.4, sil=True)
    bands = ''.join(paint(E(x, 74, w, 32), 'fill="%s"' % st) for x, w in ((34, 5), (50, 6), (66, 5.5)))
    a.part(E(58, 74, 34, 26), y, dk, shade_col=sh, hl=(44, 58, 9, 4, -15), inner=bands)
    a.part(C(94, 68, 21), y, dk, shade_col=sh, hl=(86, 54, 6, 3, -25))
    a.line('M 92 48 C 92 40 94 34 98 28', st, 2.6, sil=True)
    a.line('M 102 50 C 106 44 110 40 116 38', st, 2.6, sil=True)
    a.flat(C(98, 27, 4.2), st, sil=True)
    a.flat(C(117, 37, 4.2), st, sil=True)
    a.eye(92, 65, 5.8, look=(.8, 0))
    a.eye(107, 63, 5.2, look=(.8, 0))
    a.smile(102, 76, 9, '#7A4E16', 2.2, depth=4.5)
    a.cheek(88, 76, 4.8, opacity=.9)
    a.cheek(112, 73, 3.6, opacity=.9)
    return a


def rabbit():
    """White-grey bunny sitting, facing right: very long upright ears with pink insides, cotton tail."""
    a = Art('rabbit')
    g, sh, dk = '#F1EEF4', '#D8D2E0', '#8A8098'
    pink = '#F4AFC0'
    a.part(E(72, 32, 8.5, 25, -8), g, dk, shade_col=sh, inner=paint(E(73, 34, 4.4, 18, -8), 'fill="%s"' % pink))
    a.part(E(94, 30, 8.5, 25, 14), g, dk, shade_col=sh, inner=paint(E(93, 32, 4.4, 18, 14), 'fill="%s"' % pink))
    a.part(P(scallop(26, 94, 10, 10, 7, 1.8)), '#FFFFFF', '#958BA2', shade_col='#ECE8F0', off=(-2, -2))
    a.part(E(54, 92, 29, 23), g, dk, shade_col=sh, hl=(42, 76, 9, 4, -15))
    a.part(E(52, 111, 15, 6), g, dk, shade_col=sh, off=(-2, -2))
    a.part(E(86, 109, 8, 6.5), g, dk, shade_col=sh, off=(-2, -2))
    a.line('M 84 106 L 84 109 M 88 106 L 88 109', dk, 1.4)
    a.part(C(84, 68, 23), g, dk, shade_col=sh, hl=(72, 52, 7, 3.5, -25))
    a.flat(E(98, 80, 11, 8), '#FFFFFF')
    a.flat(P('M 100 72 C 100 70 108 70 108 72 L 104 76 Z'), '#E8869E', '#A85870', sw=1.4)
    a.line('M 104 76 L 104 79 M 104 79 Q 100 83 97 80 M 104 79 Q 108 83 111 80', '#6E6480', 2)
    a.line('M 110 76 L 121 74 M 110 80 L 121 82', '#9A90A8', 1.4, sil=True)
    a.eye(78, 64, 6.2, look=(.8, 0))
    a.eye(97, 62, 5.6, look=(.8, 0))
    a.cheek(74, 78, 5.2, opacity=.95)
    return a


def duck():
    """Yellow duckling standing, facing right: fluffy head tuft, flat orange bill, little wing, webbed feet."""
    a = Art('duck')
    y, sh, dk = '#FFE27A', '#F3C952', '#B5891E'
    bill, bdk = '#F7A24B', '#B8661C'
    for x in (54, 72):
        a.line('M %s 98 L %s 108' % (f(x), f(x)), bdk, 6.4, sil=True)
        a.line('M %s 98 L %s 108' % (f(x), f(x)), bill, 3)
        a.part(P('M %s 106 C %s 104 %s 104 %s 106 L %s 114 C %s 116 %s 113 %s 115 C %s 113 %s 116 %s 114 Z' % (
            f(x - 2), f(x), f(x + 4), f(x + 6), f(x + 12), f(x + 8), f(x + 5), f(x + 2), f(x - 1), f(x - 4), f(x - 6))),
            bill, bdk, shade=False, sw=2)
    a.part(P('M 32 76 C 24 72 16 64 14 54 C 22 56 30 60 36 66 Z'), y, dk, shade_col=sh, off=(-1, -2))
    a.part(E(58, 82, 32, 22, -6), y, dk, shade_col=sh, hl=(44, 68, 9, 3.5, -12))
    a.part(P('M 40 78 C 46 66 64 66 72 76 C 70 88 56 94 44 90 C 42 86 40 82 40 78 Z'), sh, dk, shade_col='#E8B83E',
           off=(-2, -2), sil=False,
           inner=paint(P('M 46 84 C 52 86 58 86 64 82'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".6"' % dk))
    a.part(C(86, 50, 22), y, dk, shade_col=sh, hl=(76, 36, 6, 3, -25))
    a.part(P('M 80 30 C 76 22 80 14 88 12 C 86 18 88 24 92 28 Z'), y, dk, shade_col=sh, off=(-1, -1))
    a.part(P('M 90 29 C 92 22 98 18 104 20 C 100 22 98 26 98 31 Z'), y, dk, shade_col=sh, off=(-1, -1))
    a.part(P('M 100 54 C 106 49 116 49 123 53 C 122 60 114 64 104 63 C 100 62 98 58 100 54 Z'), bill, bdk,
           shade_col='#E58C34', off=(-1, -2))
    a.line('M 103 58 C 110 59 116 57 121 55', bdk, 1.4)
    a.flat(E(108, 53, 1.4, 1), bdk)
    a.eye(92, 45, 6.2, look=(.8, 0))
    a.cheek(92, 60, 5, opacity=.9)
    return a


def hen():
    """White hen standing, facing right: plump body, red comb + wattle, yellow beak, feather tail fan."""
    a = Art('hen')
    w, sh, dk = '#FFFCF4', '#EBE1CF', '#9C8668'
    comb, cdk = '#E8564E', '#A8282E'
    beak, bdk = '#F4B53E', '#A87414'
    legc, ldk = '#EDAA40', '#A06A14'
    for x in (56, 74):
        a.line('M %s 98 L %s 112 M %s 116 L %s 112 L %s 116 M %s 112 L %s 117' % (
            f(x), f(x), f(x - 6), f(x), f(x + 6), f(x), f(x + 1)), ldk, 6.4, sil=True)
        a.line('M %s 98 L %s 112 M %s 116 L %s 112 L %s 116 M %s 112 L %s 117' % (
            f(x), f(x), f(x - 6), f(x), f(x + 6), f(x), f(x + 1)), legc, 3)
    # tail fan of three feathers
    a.part(P('M 38 72 C 26 66 18 54 18 40 C 28 44 36 52 42 62 Z'), w, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 40 66 C 32 54 30 40 34 26 C 42 34 46 46 48 58 Z'), w, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 46 62 C 44 48 46 36 54 26 C 58 38 58 50 56 60 Z'), w, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 30 78 C 30 62 44 56 62 56 C 80 56 88 50 92 56 C 100 66 98 92 82 100 C 66 108 42 106 34 96 '
             'C 30 92 30 86 30 78 Z'), w, dk, shade_col=sh, hl=(44, 66, 9, 3.5, -12))
    a.part(P('M 42 76 C 50 66 66 66 74 76 C 72 88 58 94 46 90 C 44 86 42 82 42 76 Z'), sh, dk, shade_col='#DED2BC',
           off=(-2, -2), sil=False,
           inner=paint(P('M 48 84 C 54 86 60 86 66 82'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".6"' % dk))
    a.part(P('M 76 34 C 72 26 78 20 84 24 C 84 16 94 14 96 22 C 100 16 110 20 104 30 C 102 34 96 36 90 36 Z'),
           comb, cdk, shade_col='#D4423C', off=(-1, -1.5))
    a.part(C(90, 48, 18), w, dk, shade_col=sh, hl=(82, 38, 5, 2.5, -25))
    a.part(P('M 105 44 C 110 45 116 48 119 50 C 115 52 110 54 105 54 Z'), beak, bdk, shade_col='#E39E2C', off=(-1, -2))
    a.part(P('M 102 56 C 106 56 108 60 107 64 C 106 68 100 68 99 64 C 98 60 99 56 102 56 Z'), comb, cdk,
           shade=False, sw=2)
    a.eye(94, 44, 5.6, look=(.8, 0))
    a.cheek(92, 56, 4.6, opacity=.95)
    return a


def spider():
    """Cute round spider hanging on its thread: soft plum ball body, 8 short bent legs, big friendly eyes."""
    a = Art('spider')
    p, sh, dk = '#8C79A8', '#725F90', '#47395E'
    legc = '#7A6896'
    a.line('M 64 6 L 64 46', '#A9A2B8', 2, sil=True)
    # 4 bent legs per side (hip -> knee up/out -> foot down/out)
    legs_l = [((44, 64), (24, 46), (14, 58)), ((40, 74), (18, 66), (10, 82)),
              ((42, 84), (20, 88), (14, 104)), ((48, 94), (32, 104), (28, 118))]
    for (h, k, ft) in legs_l:
        for side in (1, -1):
            hx, kx, fx = (h[0], k[0], ft[0]) if side == 1 else (128 - h[0], 128 - k[0], 128 - ft[0])
            d = 'M %s %s Q %s %s %s %s' % (f(hx), f(h[1]), f(kx), f(k[1] - 6), f(fx), f(ft[1]))
            a.limb(d, legc, dk, 5.2)
            a.flat(C(fx, ft[1], 3.6), legc, dk, sw=2, sil=True)
    spots = ''.join(paint(C(x, y, r), 'fill="%s"' % '#A08DBE') for x, y, r in ((50, 56, 4), (62, 50, 3), (46, 68, 2.6)))
    a.part(C(64, 74, 30), p, dk, shade_col=sh, hl=(50, 56, 8, 4, -35), inner=spots)
    a.eye_white(58, 72, 10, 6.8, dk, look=(1.8, .6))
    a.eye_white(80, 71, 9, 6.2, dk, look=(1.6, .6))
    a.smile(72, 86, 10, '#3E3052', 2.4, depth=5)
    a.cheek(50, 86, 5.4, opacity=.95)
    a.cheek(88, 84, 4.6, opacity=.95)
    return a


# ================================================================ homes (all EMPTY: no animal inside)
# Silhouettes: kennel = small pointed-roof house with big arched door; basket = wide low oval + cushion + yarn;
# nest = twig bowl with 3 eggs on a branch; bowl = round glass globe; hive = striped straw dome; hutch = long box on
# legs with mesh door; pond = flat oval water + tall reeds; coop = tall barn with ramp; web = round web under a twig.

def kennel():
    """Doghouse: honey wood planks, slate-blue pointed roof, dark arched doorway, bone plaque, little bowl."""
    a = Art('kennel')
    wd, wsh, wdk = '#E8B77E', '#D09A5C', '#8E5E2E'
    rf, rdk = '#7193BC', '#3F5D86'
    planks = ''.join(paint(P('M 18 %s L 110 %s' % (f(y), f(y))),
                           'stroke="%s" stroke-width="1.8" opacity=".55"' % '#B98248') for y in (66, 78, 90, 102))
    a.part(P('M 22 112 L 22 62 L 64 30 L 106 62 L 106 112 Z'), wd, wdk, shade_col=wsh, hl=(36, 70, 6, 3, -30),
           inner=planks)
    a.part(P('M 46 112 L 46 86 C 46 70 82 70 82 86 L 82 112 Z'), '#5E3E2A', '#3E2618', shade_col='#4A2E1E',
           off=(2, 3), sil=False)
    a.part(P('M 8 66 L 64 20 L 120 66 L 112 74 L 64 36 L 16 74 Z'), rf, rdk, shade_col='#5E7FA8', off=(0, -3),
           hl=(40, 44, 10, 2, -40))
    a.part(R(14, 108, 100, 8, 4), '#B88550', '#7A5228', shade=False, sw=2.2)
    # bone plaque
    bone = P('M 54 54 C 50 50 54 46 57 49 C 58 46 62 47 61 51 L 67 51 C 66 47 70 46 71 49 C 74 46 78 50 74 54 '
             'C 78 58 74 62 71 59 C 70 62 66 61 67 57 L 61 57 C 62 61 58 62 57 59 C 54 62 50 58 54 54 Z')
    a.part(bone, '#FFF4E0', '#A88A62', shade=False, sw=1.8, sil=False)
    # small food bowl at the door
    a.part(P('M 88 104 L 114 104 L 110 114 L 92 114 Z'), '#7CC9B6', '#3F8C7A', shade_col='#5FB09C', off=(-1, -2),
           sil=True)
    a.part(E(101, 104, 13, 3), '#B9784A', '#6E4224', shade=False, sw=1.6, sil=False)
    return a


def basket():
    """Cat basket: round wicker basket with a puffy pink cushion and a little ball of yarn."""
    a = Art('basket')
    wk, wsh, wdk = '#DCA962', '#C08C46', '#7E5420'
    cu, cdk = '#F6BBD0', '#B9668A'
    a.part(E(64, 70, 56, 14), '#A87434', wdk, shade=False, sw=2.4)                 # inside of the basket
    a.part(P(scallop(64, 64, 44, 11, 9, 1.4)), cu, cdk, shade_col='#E99DBA', off=(-2, -3), hl=(46, 58, 10, 3, -4))
    for x in (50, 64, 78):
        a.flat(C(x, 64, 1.8), '#C9739A')
    weave = ''.join(paint(P('M %s 76 C %s 84 %s 96 %s 104' % (f(x), f(x + 2), f(x + 2), f(x))),
                          'fill="none" stroke="%s" stroke-width="2" opacity=".6"' % wdk)
                    for x in (26, 40, 54, 68, 82, 96)) + \
        ''.join(paint(P('M 10 %s C 40 %s 88 %s 118 %s' % (f(y), f(y + 8), f(y + 8), f(y))),
                      'fill="none" stroke="%s" stroke-width="2.4" opacity=".45"' % '#F2CC8A') for y in (82, 94))
    a.part(P('M 8 72 C 30 82 98 82 120 72 C 118 96 98 112 64 112 C 30 112 10 96 8 72 Z'), wk, wdk, shade_col=wsh,
           hl=(26, 84, 7, 2.5, 20), inner=weave)
    a.line('M 8 72 C 30 82 98 82 120 72', '#EFC27E', 5)
    a.line('M 8 72 C 30 82 98 82 120 72', wdk, 1.6, opacity=.6)
    yarn = ''.join(paint(P(d), 'fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round"' % '#5FA986') for d in (
        'M 92 38 C 98 44 100 52 98 60', 'M 100 32 C 108 38 112 46 110 56', 'M 88 46 C 96 42 106 42 114 46'))
    a.part(C(101, 46, 13), '#9ED9B6', '#4E9A74', shade_col='#7FC79E', off=(-2, -2), inner=yarn)
    a.line('M 88 52 C 80 56 76 50 70 54', '#4E9A74', 2, sil=False)
    return a


def nest():
    """Twig nest with three pale speckled eggs, resting on a branch with a leaf."""
    a = Art('nest')
    br, bdk = '#9A6A44', '#5E3E22'
    tw, tsh, tdk = '#B88A52', '#9C6E3C', '#5E3E1C'
    egg, edk = '#DDEFF7', '#7E9CB4'
    a.part(P('M 10 102 C 40 98 90 98 118 92 L 118 101 C 90 106 40 108 10 111 Z'), br, bdk, shade=False, sw=2.2)
    a.part(E(110, 86, 10, 5.5, -30), '#86C46A', '#4E8A3A', shade_col='#6FAE55', off=(-1, -1),
           inner=paint(P('M 102 91 L 118 81'), 'stroke="#4E8A3A" stroke-width="1.4"'))
    a.part(E(64, 68, 48, 10), '#6E4A28', tdk, shade=False, sw=2.2)
    speck = lambda x, y: ''.join(paint(C(x + dx, y + dy, 1.4), 'fill="%s"' % '#9DB4C6') for dx, dy in ((-3, -4), (3, 2), (-1, 6)))
    a.part(E(45, 56, 13, 17, -12), egg, edk, shade_col='#C6DDEA', off=(-2, -3), hl=(40, 48, 3.5, 5, -12), inner=speck(45, 56))
    a.part(E(85, 56, 13, 17, 12), egg, edk, shade_col='#C6DDEA', off=(-2, -3), hl=(80, 48, 3.5, 5, 12), inner=speck(85, 56))
    a.part(E(65, 50, 14, 18), egg, edk, shade_col='#C6DDEA', off=(-2, -3), hl=(59, 42, 3.5, 5.5), inner=speck(65, 50))
    twigs = ''.join(paint(P(d), 'fill="none" stroke="%s" stroke-width="2.2" stroke-linecap="round" opacity=".75"' % c)
                    for d, c in (('M 20 74 C 40 86 70 88 108 76', '#D8AE72'), ('M 22 84 C 44 92 82 94 104 84', '#7E5630'),
                                 ('M 30 92 C 50 98 76 98 96 92', '#D8AE72'), ('M 24 72 L 52 96', '#7E5630'),
                                 ('M 60 76 L 84 98', '#7E5630'), ('M 104 72 L 76 98', '#D8AE72'), ('M 40 78 L 30 94', '#D8AE72')))
    a.part(P('M 14 68 C 22 74 106 74 114 68 C 112 88 92 102 64 102 C 36 102 16 88 14 68 Z'), tw, tdk, shade_col=tsh,
           inner=twigs)
    a.line('M 14 68 L 8 62 M 114 68 L 120 62', tdk, 2.4, sil=True)
    return a


def bowl():
    """Round glass fish bowl: light water with a wave top, green weed, pebbles, bubbles, glass shine."""
    a = Art('bowl')
    gl, gdk = '#EEF8FC', '#6FA4C4'
    glass = P('M 42 26 L 86 26 C 86 32 90 36 96 40 C 116 54 114 96 96 108 C 82 116 46 116 32 108 '
              'C 14 96 12 54 32 40 C 38 36 42 32 42 26 Z')
    inner = (paint(P('M 10 52 C 24 46 36 56 50 50 C 64 44 76 56 90 50 C 102 45 112 52 120 50 L 120 120 L 10 120 Z'),
                   'fill="#9AD6F0"') +
             paint(P('M 10 52 C 24 46 36 56 50 50 C 64 44 76 56 90 50 C 102 45 112 52 120 50'),
                   'fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".8"') +
             paint(E(66, 112, 46, 10), 'fill="#7FC2E2"') +
             paint(P('M 46 108 C 40 94 50 86 44 72 C 50 82 56 90 52 108 Z'), 'fill="#5DB86A" stroke="#3A8A48" stroke-width="1.6"') +
             paint(P('M 54 108 C 56 96 64 92 60 80 C 68 88 66 100 62 108 Z'), 'fill="#78C878" stroke="#3A8A48" stroke-width="1.6"') +
             paint(P('M 80 108 C 76 98 84 90 80 82 C 88 90 88 100 86 108 Z'), 'fill="#5DB86A" stroke="#3A8A48" stroke-width="1.6"') +
             ''.join(paint(C(x, y, r), 'fill="%s" stroke="%s" stroke-width="1.2"' % (c, mix(c, '#5A4A3A', .4)))
                     for x, y, r, c in ((36, 106, 5, '#F2C9A0'), (46, 110, 5, '#E9D8F2'), (68, 110, 6, '#F6E3A6'),
                                        (92, 106, 5, '#F2B8C0'), (100, 102, 4, '#CFE6C0'), (58, 111, 4, '#D6E4EE'))) +
             ''.join(paint(C(x, y, r), 'fill="none" stroke="#FFFFFF" stroke-width="1.6"')
                     for x, y, r in ((88, 72, 3.4), (92, 62, 2.4), (86, 56, 1.8))))
    a.part(glass, gl, gdk, shade=False, inner=inner)
    a.line('M 26 62 C 22 72 22 84 26 92', '#FFFFFF', 4, opacity=.85)
    a.line('M 32 50 C 30 52 29 54 28 56', '#FFFFFF', 4, opacity=.85)
    a.part(R(36, 21, 56, 9, 4.5), '#D7EEF8', gdk, shade=False, sw=2.2, hl=(52, 24, 10, 1.4))
    return a


def hive():
    """Beehive skep: rounded dome of stacked straw coils, dark entrance, on a wooden stand, little flower."""
    a = Art('hive')
    st, ssh, sdk = '#F0C064', '#D9A140', '#93661A'
    coils = ''.join(paint(P('M 10 %s C 40 %s 88 %s 118 %s' % (f(y), f(y + 7), f(y + 7), f(y))),
                          'fill="none" stroke="%s" stroke-width="2.6" stroke-linecap="round" opacity=".75"' % '#B8832C')
                    for y in (40, 54, 68, 82, 96)) + \
        ''.join(paint(P('M 10 %s C 40 %s 88 %s 118 %s' % (f(y), f(y + 7), f(y + 7), f(y))),
                      'fill="none" stroke="%s" stroke-width="2.4" opacity=".6"' % '#FBE0A0') for y in (35, 49, 63, 77, 91))
    a.part(E(64, 22, 9, 5), st, sdk, shade_col=ssh, off=(-1, -1))
    a.part(P('M 16 106 C 14 66 30 26 64 20 C 98 26 114 66 112 106 Z'), st, sdk, shade_col=ssh, hl=(40, 40, 8, 4, -40),
           inner=coils)
    a.part(P('M 52 106 C 52 92 76 92 76 106 Z'), '#5E3E1E', '#3E2610', shade=False, sw=2)
    a.part(R(8, 104, 112, 10, 4), '#A8744A', '#6E4626', shade_col='#94623A', off=(0, -2))
    a.part(R(18, 112, 8, 8, 2), '#94623A', '#6E4626', shade=False, sw=2)
    a.part(R(102, 112, 8, 8, 2), '#94623A', '#6E4626', shade=False, sw=2)
    # small honey drip by the door
    a.part(P('M 70 66 C 74 60 80 62 80 66 C 80 72 74 74 70 78 C 66 74 60 72 60 66 C 60 62 66 60 70 66 Z'),
           '#F6A94A', '#B8661C', shade=False, sw=1.6, sil=False, hl=(65, 65, 2, 1.4))   # little honey heart
    return a


def hutch():
    """Rabbit hutch: long wooden box on four legs, green-grey slanted roof, mesh door with straw, carrot."""
    a = Art('hutch')
    wd, wsh, wdk = '#E4C290', '#CBA56E', '#8A6638'
    for x in (20, 98):
        a.part(R(x, 94, 9, 20, 3), wsh, wdk, shade=False, sw=2.2)
    a.part(R(12, 46, 104, 52, 6), wd, wdk, shade_col=wsh, hl=(28, 54, 6, 2, -10))
    mesh = (paint(R(20, 54, 54, 38), 'fill="#FFF4DC"') +
            ''.join(paint(P('M %s 96 C %s 88 %s 86 %s 84' % (f(x), f(x + 2), f(x + 5), f(x + 7))),
                          'fill="none" stroke="%s" stroke-width="2.2" stroke-linecap="round"' % c)
                    for x, c in ((22, '#E9C25E'), (28, '#F5D97E'), (34, '#E9C25E'), (40, '#F5D97E'), (48, '#E9C25E'),
                                 (54, '#F5D97E'), (60, '#E9C25E'), (66, '#F5D97E'))) +
            paint(R(20, 86, 54, 8), 'fill="#F2D27A"') +
            ''.join(paint(P('M %s 54 L %s 92' % (f(x), f(x))), 'stroke="#8E959C" stroke-width="1.6"')
                    for x in (29, 38, 47, 56, 65)) +
            ''.join(paint(P('M 20 %s L 74 %s' % (f(y), f(y))), 'stroke="#8E959C" stroke-width="1.6"')
                    for y in (62, 70, 78, 86)))
    a.part(R(20, 54, 54, 38, 3), '#FFF4DC', '#8E6A3C', shade=False, sw=3, sil=False, inner=mesh)
    a.part(R(80, 54, 28, 38, 3), '#D3AE78', wdk, shade_col='#BD9660', off=(-1, -2), sil=False,
           inner=paint(P('M 80 66 L 108 66 M 80 80 L 108 80'), 'stroke="%s" stroke-width="1.6" opacity=".6"' % wdk))
    a.flat(C(86, 74, 2.6), '#8E6A3C')
    a.part(P('M 4 50 L 10 32 L 118 24 L 124 40 Z'), '#8FAF8A', '#557552', shade_col='#7A9C76', off=(0, -2),
           hl=(40, 34, 14, 1.8, -4))
    # carrot on the ground
    a.part(P('M 56 108 C 60 104 66 104 70 106 L 100 114 C 96 118 66 118 58 114 C 55 112 54 110 56 108 Z'),
           '#F59A4A', '#B8601C', shade_col='#E5843A', off=(-1, -2),
           inner=paint(P('M 66 108 L 70 112 M 78 110 L 81 115 M 88 112 L 90 116'), 'stroke="#C96E22" stroke-width="1.4"'))
    a.part(P('M 56 108 C 50 102 46 100 42 102 C 46 104 48 106 50 110 C 46 110 42 112 40 116 C 46 116 52 114 57 112 Z'),
           '#6CBF5A', '#3E8A38', shade=False, sw=1.8)
    return a


def pond():
    """Little pond: oval of blue water in a grassy rim, ripples, a lily pad with a pink flower, tall reeds."""
    a = Art('pond')
    gr, gdk = '#93CF78', '#4F8C3E'
    wt, wsh, wdk = '#8DD0EE', '#6AB6DC', '#3D86B0'
    # reeds + cattails (behind the pond, on the left)
    for x0, x1, top in ((22, 18, 26), (32, 34, 18), (12, 6, 40), (42, 46, 36)):
        a.line('M %s 90 C %s 70 %s 50 %s %s' % (f(x0), f(x0), f(x1), f(x1), f(top)), '#3E7E36', 6.4, sil=True)
        a.line('M %s 90 C %s 70 %s 50 %s %s' % (f(x0), f(x0), f(x1), f(x1), f(top)), '#6FB55A', 3)
    for x, top in ((18, 26), (34, 18), (46, 36)):
        a.part(R(x - 4, top + 4, 8, 20, 4), '#A0683E', '#5E3A1C', shade_col='#87542E', off=(-1, -2))
    a.part(P('M 6 90 C 10 74 14 62 22 54 C 20 68 18 80 18 90 Z'), '#7CC264', '#3E7E36', shade=False, sw=2)
    a.part(P('M 52 88 C 56 74 62 66 70 62 C 66 72 62 80 62 88 Z'), '#7CC264', '#3E7E36', shade=False, sw=2)
    a.part(E(68, 92, 52, 26), gr, gdk, shade_col='#7BBC62', off=(0, -3))
    ripples = ''.join(paint(P(d), 'fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" opacity=".8"')
                      for d in ('M 34 92 C 40 88 50 88 56 92', 'M 42 102 C 48 99 56 99 62 102', 'M 96 86 C 100 84 106 84 110 86'))
    a.part(E(68, 93, 44, 20), wt, wdk, shade_col=wsh, off=(2, 3), inner=ripples, hl=(50, 86, 12, 2.5, -4), sil=False)
    a.part(P('M 84 98 C 84 90 94 86 102 88 C 110 90 114 98 108 104 L 96 98 L 100 108 C 92 110 84 106 84 98 Z'),
           '#6CBF5A', '#3E7E36', shade_col='#5AA64A', off=(-1, -1.5), sil=False)
    for ang in range(0, 360, 72):
        r_ = math.radians(ang - 90)
        a.part(E(94 + 5 * math.cos(r_), 92 + 5 * math.sin(r_), 3.4, 5.8, ang), '#F9B4CF', '#C6668E', shade=False, sw=1.4,
               sil=False)
    a.flat(C(94, 92, 2.6), '#FFE27A', '#C99A12', sw=1)
    # stones on the rim
    for x, y, rx in ((110, 76, 6), (118, 88, 4.6), (28, 108, 5)):
        a.part(E(x, y, rx, rx * .7), '#C9C3BA', '#7F786E', shade_col='#B3ACA2', off=(-1, -1.5))
    return a


def coop():
    """Hen house: terracotta barn with a gambrel roof and white trim, round hay window, X-braced door, ramp."""
    a = Art('coop')
    rd, rsh, rdk = '#D98466', '#C26C50', '#86412C'
    trim = '#FBF7EE'
    # ramp to a little hatch door
    a.part(P('M 94 82 L 124 112 L 116 116 L 86 86 Z'), '#B88550', '#7A5228', shade=False, sw=2.2,
           inner=paint(P('M 100 92 L 95 97 M 106 98 L 101 103 M 112 104 L 107 109'), 'stroke="#7A5228" stroke-width="2"'))
    boards = ''.join(paint(P('M %s 30 L %s 116' % (f(x), f(x))), 'stroke="%s" stroke-width="1.6" opacity=".5"' % rdk)
                     for x in (38, 50, 62, 74, 86, 98))
    a.part(P('M 26 114 L 26 58 L 40 34 L 64 22 L 88 34 L 102 58 L 102 114 Z'), rd, rdk, shade_col=rsh,
           hl=(38, 64, 5, 3, -20), inner=boards)
    a.line('M 22 62 L 38 32 L 64 18 L 90 32 L 106 62', '#8C6A5A', 9, sil=True)
    a.line('M 22 62 L 38 32 L 64 18 L 90 32 L 106 62', trim, 4)
    a.part(C(64, 48, 9), '#5E3E28', '#3E2618', shade=False, sw=2.2,
           inner=paint(P('M 55 52 C 58 46 62 50 64 46 C 66 50 70 46 73 52 L 73 58 L 55 58 Z'), 'fill="#F2D27A"'))
    a.line('M 55 48 L 73 48 M 64 39 L 64 57', trim, 2.4)
    a.flat(C(64, 48, 9), 'none', trim, sw=3)
    a.part(R(48, 80, 32, 34, 2), '#E9C29A', '#86412C', shade=False, sw=2.2,
           inner=paint(P('M 48 80 L 80 114 M 80 80 L 48 114'), 'stroke="%s" stroke-width="4"' % trim))
    a.flat(R(48, 80, 32, 34, 2), 'none', trim, sw=3.4)
    a.part(P('M 86 86 L 86 74 C 86 68 98 68 98 74 L 98 86 Z'), '#5E3E28', '#3E2618', shade=False, sw=2, sil=False)
    a.part(R(18, 112, 92, 6, 3), '#9DCB7E', '#5A8C46', shade=False, sw=2)
    return a


def web():
    """Spider web strung under a twig: round web of spokes + rings on a pale backing, dew drops, a leaf."""
    a = Art('web')
    cx, cy, rr = 64, 70, 46
    n = 8
    ang = [math.radians(-90 + 22.5 + 45 * k) for k in range(n)]
    rim = [(cx + rr * math.cos(t), cy + rr * math.sin(t)) for t in ang]
    strand = '#7F96B0'
    inner = ''
    for x, y in rim:
        inner += paint(P('M %s %s L %s %s' % (f(cx), f(cy), f(x), f(y))),
                       'stroke="%s" stroke-width="2" stroke-linecap="round"' % strand)
    def ring(s):
        pts = [(cx + rr * s * math.cos(t), cy + rr * s * math.sin(t)) for t in ang]
        d = 'M %s %s' % (f(pts[0][0]), f(pts[0][1]))
        for i in range(1, n + 1):
            p0, p1 = pts[i - 1], pts[i % n]
            mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
            d += ' Q %s %s %s %s' % (f(cx + (mx - cx) * .86), f(cy + (my - cy) * .86), f(p1[0]), f(p1[1]))
        return d + ' Z'
    for k, s in enumerate((0.2, 0.38, 0.56, 0.74, 0.92)):
        pts = [(cx + rr * s * math.cos(t), cy + rr * s * math.sin(t)) for t in ang]
        d = 'M %s %s' % (f(pts[0][0]), f(pts[0][1]))
        for i in range(1, n + 1):
            p0, p1 = pts[i - 1], pts[i % n]
            mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
            qx, qy = cx + (mx - cx) * .86, cy + (my - cy) * .86      # strands sag a little toward the centre
            d += ' Q %s %s %s %s' % (f(qx), f(qy), f(p1[0]), f(p1[1]))
        inner += paint(P(d + ' Z'), 'fill="none" stroke="%s" stroke-width="2" stroke-linejoin="round"' % strand)
    for x, y, r in ((84, 54, 3.2), (46, 88, 2.8), (70, 100, 2.4), (40, 58, 2.2)):
        inner += paint(C(x, y, r), 'fill="#BFE6F8" stroke="#6FA4C4" stroke-width="1"')
        inner += paint(C(x - r * .35, y - r * .35, r * .35), 'fill="#FFFFFF"')
    a.part(P(scallop(cx, cy, rr * 1.02, rr * 1.02, n, 1.2, ang[0])), '#F2F6FB', '#A9B8CA', shade=False, sw=2, inner=inner)
    # twig on top with threads down to the web
    a.line('M 36 %s L 30 14 M 92 %s L 98 14' % (f(rim[7][1]), f(rim[0][1])), strand, 2, sil=True)
    a.part(P('M 4 16 C 40 8 90 8 124 14 L 124 20 C 90 16 40 16 4 22 Z'), '#9A6A44', '#5E3E22', shade=False, sw=2.2)
    a.line('M 100 14 C 104 6 110 4 114 4', '#5E3E22', 2.6, sil=True)
    a.part(E(112, 30, 10, 5, 50), '#86C46A', '#4E8A3A', shade_col='#6FAE55', off=(-1, -1),
           inner=paint(P('M 106 22 L 118 38'), 'stroke="#4E8A3A" stroke-width="1.4"'))
    a.part(E(18, 28, 8, 4, -50), '#86C46A', '#4E8A3A', shade=False, sw=2)
    return a


ALL = {
    'animal_dog': dog, 'animal_cat': cat, 'animal_bird': bird, 'animal_fish': fish, 'animal_bee': bee,
    'animal_rabbit': rabbit, 'animal_duck': duck, 'animal_hen': hen, 'animal_spider': spider,
    'home_kennel': kennel, 'home_basket': basket, 'home_nest': nest, 'home_bowl': bowl, 'home_hive': hive,
    'home_hutch': hutch, 'home_pond': pond, 'home_coop': coop, 'home_web': web,
}
OLD = ['fox', 'deer', 'hedgehog', 'squirrel', 'bunny', 'frog', 'bear', 'owl', 'mouse']


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ALL.items():
        with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
            fh.write(fn().svg())
    for o in OLD:   # the old forest stickers belong to Dee's game
        p = os.path.join(OUT, 'animal_%s.svg' % o)
        if os.path.exists(p):
            os.remove(p)
    print('wrote %d sprites to %s' % (len(ALL), OUT))


if __name__ == '__main__':
    main()
