#!/usr/bin/env python3
"""Generate Lolo's Jungle Leaves animal + food sticker sprites (character artist C, DESIGN §4.3).

Writes game/assets/default/items/
  animal_{panda,elephant,rabbit,squirrel,bee,bird,hippo,mouse}.svg
  food_{bamboo,peanut,carrot,acorn,honey,worm,watermelon,cheese}.svg
(viewBox 0 0 128 128). Rewritten from Gigi's city-animal generator (../giraffe-city-windows), same pipeline,
all art original, built from simple primitives:
  * every part = fill + one-step cel shade (the part shifted up-left, clipped, leaves a darker
    crescent lower-right) + outline in a darker tone of the fill (never black);
  * white sticker border (~6 px beyond the outline) + faint drop shadow (opacity .18, +3 y),
    both made from one <use> of the merged silhouette;
  * every sticker is auto-fitted (scale + shift) so its sticker silhouette is ~110-118 px and centred.
Stickers are shown on the pale leaf underside (#F3F6DF) and in the HUD.
No filters, text, fonts, scripts or external refs.

Pairs (topic `food`): panda-bamboo, elephant-peanut, rabbit-carrot, squirrel-acorn, bee-honey, bird-worm,
hippo-watermelon, mouse-cheese. Foods never show an animal.

Usage: python3 tools/art_animals.py && node tools/animals_sheet.js
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
        self.sw_k = 1.0        # outline thickness factor (pale stickers get bolder outlines)
        self.shadow = .18      # drop-shadow opacity

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
            self.add(paint(shape, 'fill="none" stroke="%s" stroke-width="%s" stroke-linejoin="round"' % (dark, f(sw * self.sw_k))))
        return cid

    def flat(self, shape, fill, dark=None, sw=2.4, sil=False, opacity=None):
        if sil:
            self.silhouette(shape)
        a = 'fill="%s"' % fill
        if dark:
            a += ' stroke="%s" stroke-width="%s" stroke-linejoin="round"' % (dark, f(sw * self.sw_k))
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
                       'stroke-width="%d" stroke-linejoin="round" stroke-linecap="round" opacity="%s"/>' % (
                           ref, ref, f(3 / k), SHADOW, SHADOW, STICKER_SW, f(self.shadow)))
            out.append('<use href="%s" xlink:href="%s" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
                       'stroke-linejoin="round" stroke-linecap="round"/>' % (ref, ref, STICKER_SW))
        out.extend(self.body)
        out.append('</g>')
        out.append('</svg>')
        return '\n'.join(out) + '\n'


def leg(a, x, y, w, h, fill, dark, sock=None, shade_col=None):
    inner = paint(R(x - 2, y + h - 7, w + 4, 9), 'fill="%s"' % sock) if sock else None
    a.part(R(x, y, w, h, min(w / 2, 6)), fill, dark, shade_col=shade_col, off=(-2, -3), inner=inner)


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
    a.sw_k, a.shadow = 1.45, .3
    g, sh, dk = '#ECE9F1', '#D3CDDD', '#5E5474'
    pink = '#F4AFC0'
    a.part(E(72, 32, 8.5, 25, -8), g, dk, shade_col=sh, inner=paint(E(73, 34, 4.4, 18, -8), 'fill="%s"' % pink))
    a.part(E(94, 30, 8.5, 25, 14), g, dk, shade_col=sh, inner=paint(E(93, 32, 4.4, 18, 14), 'fill="%s"' % pink))
    a.part(P(scallop(26, 94, 10, 10, 7, 1.8)), '#FFFFFF', '#6E6484', shade_col='#E6E2EC', off=(-2, -2))
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




def bird():
    """Little robin-like songbird (brown, peach chest) standing, facing right: peach breast, pointed beak, tail fan, thin legs."""
    a = Art('bird')
    b, sh, dk = '#A57A56', '#8C6343', '#5A3A22'
    peach = '#F7C29C'
    beak, bdk = '#E9B04E', '#9A6414'
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
    a.part(P('M 104 46 C 110 46 118 50 122 53 C 118 56 110 59 104 59 Z'), beak, bdk, shade_col='#DC8A2C', off=(-1, -2))
    a.line('M 105 53 L 116 53', bdk, 1.2)
    # wing with feather tips
    a.part(P('M 36 72 C 44 60 62 60 72 70 C 72 84 62 94 48 94 C 46 90 42 88 40 86 C 38 84 36 80 36 72 Z'),
           '#B98D66', dk, shade_col='#9E7350', off=(-2, -2), sil=False,
           inner=paint(P('M 44 82 C 50 84 56 84 62 80 M 46 88 C 52 90 58 88 64 84'),
                       'fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" opacity=".7"' % dk))
    a.eye(93, 48, 6.4, look=(.8, 0))
    a.cheek(92, 61, 5, opacity=.85)
    return a




def rot_pts(pts, ang, cx, cy, ox=0, oy=0):
    """Rotate local points by ang degrees, then move the local origin to (cx, cy)."""
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + (x - ox) * ca - (y - oy) * sa, cy + (x - ox) * sa + (y - oy) * ca) for x, y in pts]


def smooth(pts):
    """Closed smooth path through pts (Catmull-Rom -> cubic)."""
    n = len(pts)
    d = 'M %s %s' % (f(pts[0][0]), f(pts[0][1]))
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += ' C %s %s %s %s %s %s' % (f(c1[0]), f(c1[1]), f(c2[0]), f(c2[1]), f(p2[0]), f(p2[1]))
    return d + ' Z'


def strokes(ds, color, sw, opacity=None, extra=''):
    o = ' opacity="%s"' % f(opacity) if opacity is not None else ''
    return ''.join(paint(P(d), 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"%s%s' % (
        color, f(sw), o, extra)) for d in ds)


# ================================================================ animals
# Silhouettes kept apart: panda = front-facing round head with black ears + eye patches; elephant = side view,
# big ear + curled trunk; bunny = very long ears; squirrel = huge curled tail behind; bee = striped ball + wings;
# bird = small, pointed beak, tail fan, thin legs; hippo = front view, huge wide snout, tiny ears;
# mouse = side view, big round ears, long thin curly tail, pointy nose.

def panda():
    """Baby panda sitting, front view: white head, dark round ears, tilted eye patches, dark arms + legs."""
    a = Art('panda')
    w, wsh, wdk = '#FBFAF7', '#E2DFE6', '#6E6878'
    k, ksh, kdk = '#4A4552', '#3A3641', '#24212A'
    pad = '#8F8698'
    a.part(C(38, 26, 12), k, kdk, shade_col=ksh, hl=(34, 21, 3.5, 2, -30))
    a.part(C(90, 26, 12), k, kdk, shade_col=ksh, hl=(86, 21, 3.5, 2, -30))
    a.part(E(64, 92, 31, 26), w, wdk, shade_col=wsh, hl=(50, 78, 8, 3.5, -20),
           inner=paint(E(64, 98, 17, 15), 'fill="#FFFFFF" opacity=".75"'))
    a.part(E(36, 88, 10, 17, 24), k, kdk, shade_col=ksh, off=(-2, -2))
    a.part(E(92, 88, 10, 17, -24), k, kdk, shade_col=ksh, off=(-2, -2))
    for x in (42, 86):
        a.part(E(x, 110, 14, 10), k, kdk, shade_col=ksh, off=(-2, -2),
               inner=paint(E(x, 111, 6, 5), 'fill="%s"' % pad) +
               ''.join(paint(C(x + dx, 104.5, 2), 'fill="%s"' % pad) for dx in (-5, 0, 5)))
    a.part(E(64, 52, 35, 29), w, wdk, shade_col=wsh, hl=(46, 34, 9, 4, -25))
    a.flat(E(49, 53, 9.5, 12, 30), k)
    a.flat(E(79, 53, 9.5, 12, -30), k)
    for x in (50, 78):
        a.flat(C(x, 52, 5.6), '#FFFFFF')
        a.eye(x + .6, 52.4, 4.2)
    a.flat(P('M 58 62 C 58 59 70 59 70 62 C 70 65 66 67 64 67 C 62 67 58 65 58 62 Z'), k, kdk, sw=1.2)
    a.flat(E(62, 61.5, 2, 1), '#FFFFFF', opacity=.6)
    a.line('M 64 67 L 64 69 M 58 69 Q 61 73 64 69 Q 67 73 70 69', kdk, 1.8)
    a.cheek(40, 66, 5.5, opacity=.85)
    a.cheek(88, 66, 5.5, opacity=.85)
    return a


def elephant():
    """Small grey-blue elephant standing, facing right: big flappy ear, trunk curled up, stubby legs, tail tuft."""
    a = Art('elephant')
    a.sw_k, a.shadow = 1.4, .3
    c, sh, dk = '#9FB2C8', '#879CB4', '#34465F'
    far = '#8A9EB6'
    pink = '#F2B9C6'
    nail = '#EEF1F6'
    a.line('M 28 72 C 22 76 18 82 17 90', dk, 7.4, sil=True)
    a.line('M 28 72 C 22 76 18 82 17 90', c, 2.6)
    a.part(P(scallop(17, 93, 4.5, 5, 5, 1.2)), '#6F83A0', dk, shade=False, sw=1.6)
    for x, col in ((34, far), (72, far)):
        leg(a, x, 84, 14, 26, col, dk, sock=None, shade_col=mix(col, dk, .25))
    for x in (46, 84):
        leg(a, x, 86, 15, 26, c, dk, shade_col=sh)
    for x in (46, 84):
        a.flat(E(x + 7.5, 109, 5.5, 2.6), nail, mix(nail, dk, .5), sw=1)
    a.part(E(58, 76, 33, 25), c, dk, shade_col=sh, hl=(42, 60, 10, 4, -15))
    # trunk: down from the face, curling up at the tip
    trunk = 'M 103 62 C 110 76 120 80 124 70 C 126 64 124 58 120 56'
    a.line(trunk, dk, 19, sil=True)
    a.line(trunk, c, 13)
    a.flat(E(120, 55, 3.6, 3, 10), sh, dk, sw=1.6)
    a.part(C(90, 56, 22), c, dk, shade_col=sh, hl=(82, 42, 6, 3, -25))
    a.part(P('M 82 38 C 64 30 50 42 52 60 C 54 76 68 84 82 76 C 86 64 88 50 82 38 Z'), c, dk, shade_col=sh,
           off=(-2, -3), inner=paint(P('M 78 44 C 66 40 58 48 59 60 C 60 70 68 75 77 71 C 80 62 81 52 78 44 Z'),
                                     'fill="%s"' % pink))
    a.eye(96, 51, 5.4, look=(.8, 0))
    a.cheek(98, 64, 5, opacity=.85)
    a.line('M 94 70 Q 98 74 102 70', '#3E4E68', 2)
    return a


def squirrel():
    """Red-brown squirrel sitting, facing right: huge curled bushy tail, cream belly, tufted ears, little paws."""
    a = Art('squirrel')
    c, sh, dk = '#C97A45', '#AE6334', '#6E3A1C'
    tl, tsh = '#D48A55', '#B86C3A'
    cream = '#F7E4C6'
    pink = '#F2B0A8'
    tail = 'M 58 106 C 24 110 6 88 10 62 C 13 38 28 18 50 14 C 66 12 76 24 68 34 C 64 40 58 40 56 48 C 52 60 54 72 62 84 Z'
    a.part(P(tail), tl, dk, shade_col=tsh, off=(-3, -3), hl=(22, 50, 4, 11, 15),
           inner=strokes(['M 58 22 C 44 22 32 32 28 48 C 24 64 28 84 44 98', 'M 40 30 C 30 40 22 56 24 72'],
                         mix(tl, '#FFFFFF', .35), 3, .7))
    a.part(E(52, 112, 11, 5.5), c, dk, shade_col=sh, off=(-1, -2))
    a.part(E(72, 88, 23, 25), c, dk, shade_col=sh, hl=(58, 72, 6, 3, -25),
           inner=paint(E(80, 94, 13, 18), 'fill="%s"' % cream))
    a.part(E(78, 112, 12, 5.5), c, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 74 40 C 70 30 68 22 70 13 C 78 18 84 26 86 36 Z'), c, dk, shade_col=sh, off=(-1, -1),
           inner=paint(P('M 75 36 C 73 30 73 26 74 21 C 78 24 80 28 81 33 Z'), 'fill="%s"' % pink))
    a.part(C(84, 56, 21), c, dk, shade_col=sh, hl=(74, 42, 6, 3, -25))
    a.part(P('M 92 40 C 92 30 96 22 102 16 C 106 24 106 32 102 42 Z'), c, dk, shade_col=sh, off=(-1, -1),
           inner=paint(P('M 95 38 C 96 32 98 27 101 24 C 103 29 103 34 101 38 Z'), 'fill="%s"' % pink))
    a.part(E(98, 63, 11, 8.5, -8), cream, mix(cream, dk, .5), shade=False, sw=1.8, sil=False)
    a.flat(E(107.5, 58.5, 3.4, 2.6), '#4A2A18')
    a.flat(C(106.5, 57.6, .9), '#FFFFFF', opacity=.7)
    a.line('M 107 61 L 106 64 Q 103 67 100 65', '#6E3A1C', 1.8)
    a.part(E(92, 82, 6, 4.5, -20), c, dk, shade_col=sh, off=(-1, -1), sil=False)
    a.part(E(84, 84, 6, 4.5, -10), c, dk, shade_col=sh, off=(-1, -1), sil=False)
    a.eye(90, 51, 5.6, look=(.8, 0))
    a.cheek(88, 64, 4.6, opacity=.85)
    return a


def hippo():
    """Pink-grey hippo sitting, front view: huge wide snout with nostrils, tiny ears, eyes on top bumps, stubby legs."""
    a = Art('hippo')
    c, sh, dk = '#B9A3B6', '#A08A9E', '#66506A'
    sn, snsh = '#D3BFCE', '#BFA9BB'
    pink = '#F2A8BC'
    a.part(E(64, 98, 38, 22), c, dk, shade_col=sh, hl=(42, 86, 8, 3, -15),
           inner=paint(E(64, 104, 20, 12), 'fill="%s" opacity=".55"' % sn))
    for x in (40, 88):
        a.part(R(x - 12, 100, 24, 18, 9), c, dk, shade_col=sh, off=(-2, -2),
               inner=''.join(paint(E(x + dx, 116, 3, 2.2), 'fill="#F1E8EF"') for dx in (-6, 0, 6)))
    a.part(E(36, 22, 7, 6.5, -20), c, dk, shade_col=sh, off=(-1, -1), inner=paint(E(36, 23, 3.4, 3.2), 'fill="%s"' % pink))
    a.part(E(92, 22, 7, 6.5, 20), c, dk, shade_col=sh, off=(-1, -1), inner=paint(E(92, 23, 3.4, 3.2), 'fill="%s"' % pink))
    a.part(P('M 30 52 C 28 40 34 30 46 26 C 52 18 60 22 64 26 C 68 22 76 18 82 26 C 94 30 100 40 98 52 Z'),
           c, dk, shade_col=sh, hl=(42, 30, 5, 2.5, -30))
    a.part(E(64, 66, 42, 25), sn, mix(sn, dk, .7), shade_col=snsh, hl=(40, 52, 9, 3.5, -10))
    a.flat(E(49, 58, 4.4, 3), '#7A5E78')
    a.flat(E(79, 58, 4.4, 3), '#7A5E78')
    a.flat(P('M 40 74 Q 64 94 88 74 Q 64 84 40 74 Z'), '#B8667E', '#7E4A62', sw=1.6)
    a.flat(R(54, 77.5, 6, 6, 1.5), '#FFFFFF', '#9A8098', sw=1)
    a.flat(R(68, 77.5, 6, 6, 1.5), '#FFFFFF', '#9A8098', sw=1)
    a.eye(48, 38, 5)
    a.eye(80, 38, 5)
    a.cheek(30, 70, 5.5, opacity=.85)
    a.cheek(98, 70, 5.5, opacity=.85)
    return a


def mouse():
    """Little grey mouse sitting, facing right: big round pink ears, pointy nose, whiskers, long curly tail."""
    a = Art('mouse')
    g, sh, dk = '#B4B2BE', '#9A98A8', '#5E5C6E'
    belly = '#E8E6EE'
    pink, pdk = '#F4B3C2', '#C06E86'
    tailc = '#E3AFBD'
    tail = 'M 40 104 C 18 110 6 96 12 82 C 16 72 30 72 30 82 C 30 88 24 90 22 86'
    a.line(tail, pdk, 7, sil=True)
    a.line(tail, tailc, 3.4)
    a.part(C(92, 34, 13), g, dk, shade_col=sh, off=(-2, -2), inner=paint(C(93, 35, 8), 'fill="%s"' % pink))
    a.part(E(60, 90, 26, 23), g, dk, shade_col=sh, hl=(46, 76, 8, 3.5, -20),
           inner=paint(E(72, 96, 13, 15), 'fill="%s"' % belly))
    a.part(E(56, 112, 11, 5), g, dk, shade_col=sh, off=(-1, -2))
    a.part(E(80, 112, 10, 5), g, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 66 64 C 64 48 78 40 92 44 C 104 48 112 58 118 66 C 112 74 100 78 88 78 C 74 78 66 74 66 64 Z'),
           g, dk, shade_col=sh, hl=(76, 50, 6, 3, -25))
    a.part(C(70, 42, 15), g, dk, shade_col=sh, off=(-2, -2), inner=paint(C(71, 43, 9.5), 'fill="%s"' % pink))
    a.flat(C(117.5, 66, 3.8), '#F08AA4', pdk, sw=1.2)
    a.flat(C(116.5, 65, 1), '#FFFFFF', opacity=.7)
    a.line('M 110 64 L 124 58 M 111 68 L 125 70', '#7E7C90', 1.3, sil=True)
    a.line('M 112 72 Q 108 75 105 72', '#5E5C6E', 1.6)
    a.part(E(88, 90, 5.5, 4.2, -20), g, dk, shade_col=sh, off=(-1, -1), sil=False)
    a.eye(96, 57, 5.4, look=(.8, 0))
    a.cheek(96, 69, 4.4, opacity=.9)
    return a


# ================================================================ foods (no animal on any of them)

def bamboo():
    """Two bamboo stalks crossing slightly, with nodes and a few leaves."""
    a = Art('bamboo')
    g, sh, dk = '#8DC25A', '#71A845', '#3F6E25'
    g2, sh2 = '#A9CF68', '#8DB64E'
    lf, lsh, ldk = '#5DAA4C', '#4A9140', '#2E6626'

    def stalk(x0, y0, x1, y1, w, fill, shade, nodes):
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        nx, ny = -dy / L * w / 2, dx / L * w / 2
        d = 'M %s %s L %s %s L %s %s L %s %s Z' % (f(x0 + nx), f(y0 + ny), f(x1 + nx), f(y1 + ny),
                                                f(x1 - nx), f(y1 - ny), f(x0 - nx), f(y0 - ny))
        rings = []
        for t in nodes:
            cx, cy = x0 + dx * t, y0 + dy * t
            rings.append('M %s %s L %s %s' % (f(cx + nx * 1.2), f(cy + ny * 1.2), f(cx - nx * 1.2), f(cy - ny * 1.2)))
        inner = strokes(rings, dk, 2.6) + strokes(
            ['M %s %s L %s %s' % (f(x0 + dx * t + nx * 1.2 - dx / L * 2.6), f(y0 + dy * t + ny * 1.2 - dy / L * 2.6),
                                  f(x0 + dx * t - nx * 1.2 - dx / L * 2.6), f(y0 + dy * t - ny * 1.2 - dy / L * 2.6))
             for t in nodes], '#E6F4C4', 1.6, .8)
        inner += strokes(['M %s %s L %s %s' % (f(x0 + nx * .45), f(y0 + ny * .45), f(x1 + nx * .45), f(y1 + ny * .45))],
                         '#FFFFFF', 2.2, .35)
        a.part(P(d.replace('Z', '').strip() + ' Z'), fill, dk, shade_col=shade, off=(-2.5, 0), inner=inner)
        a.flat(E(x1, y1, w / 2, w / 5), mix(fill, '#FFFFFF', .3), dk, sw=1.8)

    def leaf(cx, cy, rx, ry, rot):
        a.part(E(cx, cy, rx, ry, rot), lf, ldk, shade_col=lsh, off=(-1, -2),
               inner=paint(E(cx, cy, rx * .8, .6, rot), 'fill="%s" opacity=".6"' % ldk))
    leaf(30, 42, 16, 5.5, -30)
    leaf(98, 34, 17, 5.5, 25)
    stalk(78, 120, 88, 16, 15, g2, sh2, (.28, .58, .86))
    stalk(44, 120, 40, 10, 17, g, sh, (.25, .52, .79))
    leaf(56, 26, 15, 5, 32)
    leaf(106, 58, 13, 4.6, -20)
    return a


def peanut():
    """Two peanuts in their shells, crossed: waisted figure-eight shells with a dotted net texture."""
    a = Art('peanut')
    c, sh, dk = '#E4BC80', '#CC9E5E', '#8A5E2E'
    tex = '#B8884A'

    def nut(cx, cy, A, B, ang):
        loc = []
        for i in range(36):
            t = 2 * math.pi * i / 36
            s = abs(math.sin(t))
            k = 1 - 0.32 * s ** 6
            loc.append((A * math.cos(t), B * math.sin(t) * k * (1 + .08 * math.cos(t) ** 2)))
        pts = rot_pts(loc, ang, cx, cy)
        lines = []
        for u in (-.62, -.3, .3, .62):
            seg = rot_pts([(A * u, -B * .62), (A * u + 3, 0), (A * u, B * .62)], ang, cx, cy)
            lines.append('M %s %s Q %s %s %s %s' % tuple(f(v) for p in seg for v in p))
        for v in (-.4, .4):
            seg = rot_pts([(-A * .8, B * v), (0, B * v * .6), (A * .8, B * v)], ang, cx, cy)
            lines.append('M %s %s Q %s %s %s %s' % tuple(f(q) for p in seg for q in p))
        dots = ''.join(paint(C(x, y, 1.3), 'fill="%s" opacity=".7"' % tex) for x, y in rot_pts(
            [(-A * .46, -B * .2), (-A * .46, B * .3), (A * .46, -B * .25), (A * .46, B * .22), (-A * .78, 0),
             (A * .78, B * .05)], ang, cx, cy))
        hlp = rot_pts([(-A * .5, -B * .45)], ang, cx, cy)[0]
        a.part(P(smooth(pts)), c, dk, shade_col=sh, inner=strokes(lines, tex, 1.6, .65) + dots,
               hl=(hlp[0], hlp[1], 7, 3, ang - 10))
    nut(60, 50, 42, 20, -28)
    nut(68, 82, 40, 19, 22)
    return a


def carrot():
    """A carrot with a bunch of green leaves, tilted a little, with soft ridges."""
    a = Art('carrot')
    o, sh, dk = '#F58A35', '#DC6E20', '#A44A12'
    lf, lsh, ldk = '#6CB850', '#56A040', '#3E7A2C'
    for cx, cy, ry, rot in ((56, 24, 17, -28), (72, 18, 19, 0), (88, 26, 17, 30)):
        a.part(E(cx, cy, 7.5, ry, rot), lf, ldk, shade_col=lsh, off=(-1, -2),
               inner=paint(E(cx, cy + 2, .8, ry * .8, rot), 'fill="%s" opacity=".6"' % ldk))
    ridges = strokes(['M 52 56 Q 60 58 66 56', 'M 74 50 Q 80 52 86 49', 'M 54 76 Q 60 78 64 76',
                      'M 70 70 Q 75 72 80 70', 'M 58 94 Q 62 96 66 94', 'M 62 106 Q 64 108 67 106'], dk, 1.8, .55)
    a.part(P('M 48 44 C 52 34 88 32 92 42 C 94 60 74 98 62 116 C 58 122 52 120 52 114 C 46 92 44 62 48 44 Z'),
           o, dk, shade_col=sh, hl=(58, 50, 4, 12, 8), inner=ridges)
    return a


def acorn():
    """An acorn: smooth brown nut with a textured cap, a short stem and one small oak leaf."""
    a = Art('acorn')
    n, nsh, ndk = '#C98A4E', '#AD6F37', '#6E4220'
    cap, csh, cdk = '#8E623A', '#76502E', '#4A2E16'
    lf, lsh, ldk = '#8CB85A', '#76A246', '#4A7428'
    a.part(P('M 84 22 C 92 10 108 8 116 12 C 112 22 100 30 86 28 Z'), lf, ldk, shade_col=lsh, off=(-1, -1),
           inner=strokes(['M 86 26 Q 100 18 114 13'], ldk, 1.2, .7))
    a.limb('M 64 34 C 64 26 68 20 74 18', '#7A5230', '#4A2E16', 5)
    a.part(P('M 34 62 C 34 94 50 114 64 120 C 78 114 94 94 94 62 Z'), n, ndk, shade_col=nsh, hl=(46, 74, 4, 11, 10),
           inner=paint(E(64, 117, 3, 2.4), 'fill="%s"' % ndk))
    hatch = strokes(['M %s 34 L %s 68' % (f(x), f(x + 14)) for x in range(18, 104, 9)] +
                    ['M %s 34 L %s 68' % (f(x + 14), f(x)) for x in range(18, 104, 9)], cdk, 1.4, .45)
    a.part(P('M 26 62 C 26 40 44 30 64 30 C 84 30 102 40 102 62 C 94 70 34 70 26 62 Z'), cap, cdk, shade_col=csh,
           hl=(44, 40, 9, 3.5, -15), inner=hatch)
    return a


def honey():
    """A round clay honey pot (no text) with golden honey dripping over the rim and a wooden dipper."""
    a = Art('honey')
    pot, psh, pdk = '#D9935A', '#BE7840', '#7E4620'
    rim, rsh = '#C98450', '#AC6A38'
    h, hsh, hdk = '#FFC233', '#F0A21A', '#B07008'
    wood, wdk = '#B8844E', '#6E4622'
    a.limb('M 76 44 L 100 12', wood, wdk, 6)
    a.part(C(101.5, 10.5, 5), wood, wdk, shade=False, sw=2)
    a.part(P('M 30 54 C 16 72 20 104 40 114 C 56 121 72 121 88 114 C 108 104 112 72 98 54 Z'), pot, pdk,
           shade_col=psh, hl=(38, 76, 5, 12, 15),
           inner=paint(P('M 20 74 Q 64 88 108 74 L 108 84 Q 64 98 20 84 Z'), 'fill="#F2C48E"') +
           strokes(['M 20 74 Q 64 88 108 74', 'M 20 84 Q 64 98 108 84'], pdk, 1.6, .5) +
           ''.join(paint(C(x, y, 2.4), 'fill="%s"' % hsh) for x, y in ((40, 83), (64, 87), (88, 83))))
    a.part(R(26, 42, 76, 14, 7), rim, pdk, shade_col=rsh, off=(-1, -2))
    a.part(P('M 30 43 C 44 38 84 38 98 43 L 98 52 C 98 60 92 62 91 55 C 90 50 86 50 84 56 C 82 72 72 74 72 60 '
             'C 71 53 66 52 63 57 C 61 63 55 63 54 56 C 53 51 48 50 46 58 C 44 66 36 66 36 58 C 36 54 32 52 30 52 Z'),
           h, hdk, shade_col=hsh, off=(1, -2), hl=(46, 45, 8, 2, 0))
    a.flat(E(78, 64, 1.6, 3), '#FFFFFF', opacity=.6)
    return a


def worm():
    """A cute smiling pink earthworm wiggling in an S-curve, ring bands, rosy cheeks."""
    a = Art('worm')
    c, dk = '#F49AB0', '#B5587A'
    ring = '#E07896'
    body = 'M 18 100 C 24 76 48 74 56 92 C 64 110 88 108 92 84 C 95 68 96 58 98 52'
    a.line(body, dk, 22.4, sil=True)
    a.line(body, c, 18)
    a.add(paint(P(body), 'fill="none" stroke="%s" stroke-width="18" stroke-dasharray="2.4 8" stroke-dashoffset="-6" '
                         'opacity=".7"' % ring))
    a.line('M 20 94 C 26 80 44 78 52 88', '#FFFFFF', 3, opacity=.45)
    a.part(C(98, 42, 19), c, dk, shade_col='#E886A0', hl=(90, 30, 6, 3, -25))
    a.eye(92, 38, 4.8)
    a.eye(106, 38, 4.8)
    a.flat(P('M 92 48 Q 99 57 106 48 Z'), '#C9506E', dk, sw=1.6)
    a.flat(E(99, 52.5, 3, 1.8), '#F7A0B4')
    a.cheek(86, 48, 4.4, opacity=.95)
    a.cheek(112, 48, 4.4, opacity=.95)
    return a


def watermelon():
    """A juicy watermelon slice: green striped rind, pale band, red flesh with dark seeds."""
    a = Art('watermelon')
    rind, rsh, rdk = '#4E9E40', '#3E8834', '#2A6422'
    pale = '#E8F2C6'
    fl, fsh, fdk = '#F2606A', '#DE4A56', '#A8303C'
    seed = '#3E2A26'
    a.part(P('M 64 12 L 122 90 C 102 120 26 120 6 90 Z'), rind, rdk, shade_col=rsh, off=(0, -3),
           inner=strokes(['M 16 104 Q 20 108 24 108', 'M 40 114 Q 46 116 52 116', 'M 76 116 Q 82 116 88 114',
                          'M 104 108 Q 108 106 112 104'], '#2E7428', 3, .7))
    a.flat(P('M 64 20 L 114 89 C 96 112 32 112 14 89 Z'), pale, sil=False)
    a.part(P('M 64 26 L 108 87 C 90 104 38 104 20 87 Z'), fl, fdk, shade_col=fsh, sw=1.6, sil=False, off=(2, -3),
           hl=(56, 48, 3, 10, 35))
    for x, y, r in ((64, 52, 0), (52, 70, 20), (76, 70, -20), (40, 86, 30), (64, 84, 0), (88, 86, -30)):
        a.flat(E(x, y, 2.6, 4.2, r), seed)
        a.flat(E(x - .8, y - 1.4, .8, 1.3, r), '#FFFFFF', opacity=.5)
    return a


def cheese():
    """A wedge of cheese with round holes, seen from the front-top."""
    a = Art('cheese')
    c, sh, dk = '#FFC93C', '#F0AE22', '#B07A10'
    top = '#FFE27E'
    hole, hdk = '#E39E1A', '#B07A10'
    holes = ''.join(paint(E(x, y, rx, ry), 'fill="%s"' % hole) + paint(E(x + rx * .2, y + ry * .3, rx * .7, ry * .6),
                                                                      'fill="%s" opacity=".55"' % mix(hole, dk, .4))
                    for x, y, rx, ry in ((32, 84, 7, 8), (60, 96, 5, 6), (86, 80, 8, 9), (104, 98, 4.5, 5), (50, 76, 3.5, 4)))
    a.part(P('M 12 66 L 116 66 L 116 108 C 116 112 114 114 110 114 L 18 114 C 14 114 12 112 12 108 Z'),
           c, dk, shade_col=sh, off=(-2, -3), inner=holes)
    a.part(P('M 12 66 L 98 28 C 106 30 114 48 116 66 Z'), top, dk, shade_col='#FBD660', off=(-1, -2),
           hl=(70, 46, 12, 3, -22),
           inner=paint(E(66, 54, 5.5, 2.6, -10), 'fill="%s"' % hole) + paint(E(92, 44, 3.5, 1.8, -10), 'fill="%s"' % hole))
    return a


ALL = {
    'animal_panda': panda, 'animal_elephant': elephant, 'animal_rabbit': rabbit, 'animal_squirrel': squirrel,
    'animal_bee': bee, 'animal_bird': bird, 'animal_hippo': hippo, 'animal_mouse': mouse,
    'food_bamboo': bamboo, 'food_peanut': peanut, 'food_carrot': carrot, 'food_acorn': acorn,
    'food_honey': honey, 'food_worm': worm, 'food_watermelon': watermelon, 'food_cheese': cheese,
}
# stickers inherited from Gigi's city game that do not belong to this game
OLD = ['animal_dog', 'animal_cat', 'animal_fish', 'animal_duck', 'animal_hen', 'animal_spider',
       'home_kennel', 'home_basket', 'home_nest', 'home_bowl', 'home_hive', 'home_hutch', 'home_pond',
       'home_coop', 'home_web']


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ALL.items():
        with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
            fh.write(fn().svg())
    for o in OLD:
        p = os.path.join(OUT, o + '.svg')
        if os.path.exists(p):
            os.remove(p)
    print('wrote %d sprites to %s' % (len(ALL), OUT))


if __name__ == '__main__':
    main()
