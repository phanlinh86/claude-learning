#!/usr/bin/env python3
"""Generate Tuk's Ice Match polar-animal stickers and home badges (character artist B).

Writes game/assets/default/items/
  animal_{bear,seal,fox,owl,whale,puffin,penguin,hare,walrus}.svg  (all facing RIGHT, full body)
  home_{den,floe,burrow,nest,sea,cliff,pebbles}.svg               (round sticker badges with a little scene)
viewBox 0 0 128 128, ~110 px of art. Original art built from simple primitives (pipeline from Dee's
Forest Memory tools/art_animals.py):
  * every part = fill + one-step cel shade (the part shifted up-left, clipped, leaves a darker
    crescent lower-right) + outline in a darker tone of the fill (never black);
  * white sticker border (~6 px beyond the outline) + faint cool drop shadow (opacity .18, +3 y),
    both made from one <use> of the merged silhouette.
Mapping (DESIGN 4.2): bear-den, seal-floe, fox-burrow, owl-nest, whale-sea, puffin-cliff, penguin-pebbles.
The penguin chick is a fluffy grey chick with a black cap + white mask - NOT Tuk (navy/white, knitted hat).
Also deletes the old forest animal svgs. No filters, text, fonts, scripts or external refs.

Usage: python3 tools/art_animals.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

EYE = '#2F2622'
CHEEK = '#F59AAE'
STICKER_SW = 14          # stroke width of the sticker <use>: 7 px beyond geometry = ~6 px beyond a 2.4 px outline
SHADOW = '#1E3550'       # faint cool drop shadow (icy world)


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

    def part(self, shape, fill, dark, shade=True, off=(-3, -4), sw=3, sil=True, hl=None,
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


# ---------------------------------------------------------------- polar animals
# Silhouettes are kept apart on purpose: bear = chunky on all fours + round ears; seal = long low teardrop lying
# down, head up; fox = four thin legs + huge bushy tail; owl = round egg upright, no tufts; whale = big round
# head + fluke up + spout; puffin = upright black/white + big orange beak; penguin chick = fluffy grey ball with a
# black cap + white mask; hare = sitting, very long black-tipped ears; walrus = plump, propped up on front
# flippers, whisker pads + tusks.
NOSE = '#3A3238'


def leg(a, x, y, w, h, fill, dark, hoof=None, shade_col=None):
    inner = paint(R(x - 2, y + h - 7, w + 4, 9), 'fill="%s"' % hoof) if hoof else None
    a.part(R(x, y, w, h, min(w / 2, 6)), fill, dark, shade_col=shade_col, off=(-2, -3), inner=inner)


def bear():
    """Polar bear cub on all fours, facing right: chunky cream body, small round ears, black nose."""
    a = Art('bear')
    b, sh, dk = '#F3EEDF', '#D9CDAF', '#9C9378'
    a.part(C(21, 76, 6), b, dk, shade=False, sw=2.4)
    for x in (24, 40, 66, 82):
        leg(a, x, 88, 16, 26, b, dk, hoof='#E6DDC6', shade_col=sh)
    a.part(E(56, 82, 37, 23), b, dk, shade_col=sh, hl=(40, 66, 10, 4, -10))
    a.part(C(74, 38, 9), b, dk, shade_col=sh, inner=paint(C(75, 39, 4.6), 'fill="#CDBFA6"'))
    a.part(C(104, 38, 8.5), b, dk, shade_col=sh, inner=paint(C(103, 39, 4.4), 'fill="#CDBFA6"'))
    a.part(C(90, 60, 24), b, dk, shade_col=sh, hl=(78, 44, 7, 3.5, -25))
    a.part(E(107, 70, 14, 11), '#FBF8EF', dk, shade_col='#ECE5D3', off=(-2, -3), sil=False)
    a.flat(E(114, 64, 5.6, 4.2), NOSE)
    a.flat(E(112.4, 62.6, 1.8, 1), '#FFFFFF', opacity=.75)
    a.line('M 114 68 L 114 72 M 106 74 Q 110 78 114 72 Q 117 77 121 73', '#6E6656', 2)
    a.eye(84, 56, 6, look=(.8, 0))
    a.eye(102, 53, 5.4, look=(.8, 0))
    a.cheek(82, 70, 5, opacity=.8)
    # toe lines on the front paws
    for x in (66, 82):
        a.line('M %s 111 L %s 114 M %s 111 L %s 114' % (f(x + 5), f(x + 5), f(x + 10), f(x + 10)), dk, 1.4)
    return a


def seal():
    """Grey harbour-seal pup lying on its belly, head raised to the right; dark spots, big shiny eyes."""
    a = Art('seal')
    g, sh, dk = '#9AA6B2', '#808D9B', '#4F5B69'
    light = '#C9D2DB'
    spots = ''.join(paint(E(x, y, r, r * .75, rot), 'fill="%s" opacity=".75"' % '#6F7C8A') for x, y, r, rot in
                    ((40, 92, 3, 10), (52, 86, 2.4, -20), (62, 94, 2.8, 0), (30, 100, 2.2, 30), (74, 84, 2.2, 10),
                     (46, 100, 2, 0)))
    # rear flippers (fan) at the left
    a.part(P('M 22 98 C 12 92 6 84 4 80 C 12 80 20 86 26 92 Z'), g, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 22 102 C 12 104 6 110 4 114 C 12 114 22 110 28 104 Z'), g, dk, shade_col=sh, off=(-1, -2))
    # long teardrop body rising to the neck
    a.part(P('M 20 100 C 22 88 40 80 60 78 C 74 76 82 70 86 58 L 112 64 C 116 82 110 100 96 108 '
             'C 82 116 40 116 26 110 C 21 108 19 104 20 100 Z'), g, dk, shade_col=sh, hl=(46, 84, 10, 3, -8),
           inner=paint(E(80, 110, 24, 6), 'fill="%s"' % light) + spots)
    # round head
    a.part(C(96, 52, 21), g, dk, shade_col=sh, hl=(86, 38, 6, 3, -25),
           inner=paint(C(84, 46, 2), 'fill="#6F7C8A" opacity=".7"'))
    # muzzle
    a.part(E(110, 62, 11, 8.5), light, dk, shade_col='#B6C1CC', off=(-1, -2), sw=2.2, sil=False)
    a.flat(E(114, 57, 3.8, 2.8), NOSE)
    a.flat(C(113, 56.2, 1), '#FFFFFF', opacity=.7)
    a.line('M 108 66 Q 112 69 116 65', '#4F5B69', 1.8)
    for x, y in ((106, 61), (109, 63), (116, 62), (118, 64)):
        a.flat(C(x, y, .9), '#5D6977')
    a.line('M 118 60 L 126 57 M 118 63 L 126 65', '#7D8996', 1.2)
    # front flipper
    a.part(P('M 78 98 C 84 104 90 112 88 116 C 82 116 74 108 72 100 Z'), g, dk, shade_col=sh, off=(-1, -2), sil=False)
    a.eye(89, 49, 6.6, look=(.8, 0))
    a.eye(105, 47, 5.8, look=(.8, 0))
    a.cheek(88, 61, 4.4, opacity=.8)
    return a


def fox():
    """White arctic fox standing, facing right: huge bushy tail, short rounded ears, short muzzle, dark nose."""
    a = Art('fox')
    w, sh, dk = '#F2F4F6', '#CCD5DF', '#8E9AA6'
    # bushy tail sweeping up-left (fluffy scalloped edge)
    a.part(P('M 40 84 C 30 90 14 88 8 74 C 2 62 6 46 16 40 C 18 36 24 38 24 42 C 26 40 32 44 30 48 '
             'C 34 50 34 56 32 58 C 36 62 42 66 44 70 C 48 74 48 80 40 84 Z'), w, dk, shade_col=sh,
           hl=(16, 56, 3, 8, -20))
    for x in (34, 46, 70, 82):
        leg(a, x, 92, 10, 22, w, dk, hoof='#E2E7EC', shade_col=sh)
    a.part(E(60, 88, 31, 16), w, dk, shade_col=sh, hl=(46, 77, 9, 3, -8))
    # short rounded ears
    a.part(P('M 74 46 C 70 38 70 28 76 24 C 84 28 88 34 88 42 Z'), w, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 77 41 C 75 36 75 31 78 29 C 82 31 84 35 84 39 Z'), 'fill="#C9D1DA"'))
    a.part(P('M 96 38 C 98 30 104 24 110 24 C 112 30 110 38 106 44 Z'), w, dk, shade_col=sh, off=(-1, -2),
           inner=paint(P('M 100 37 C 102 32 105 29 108 29 C 108 33 107 37 105 40 Z'), 'fill="#C9D1DA"'))
    a.part(C(90, 58, 21), w, dk, shade_col=sh, hl=(80, 44, 6, 3, -25))
    # cheek ruff
    a.line('M 70 64 L 66 70 M 74 70 L 71 76', dk, 1.6)
    a.part(P('M 96 58 C 104 56 114 60 120 65 C 116 72 106 75 98 74 C 92 71 92 62 96 58 Z'), '#FFFFFF', dk,
           shade_col='#E9EDF1', off=(-1, -2), sil=False)
    a.flat(E(119, 64.5, 3.8, 3.2), NOSE)
    a.flat(C(118, 63.3, 1.1), '#FFFFFF', opacity=.7)
    a.line('M 106 70 Q 110 73 115 69', '#6E7A86', 1.8)
    a.eye(85, 53, 5.6, look=(.8, 0))
    a.eye(101, 51, 5.2, look=(.8, 0))
    a.cheek(80, 65, 4.6, opacity=.8)
    return a


def owl():
    """Snowy owl standing, round white body with dark flecks, round head (no ear tufts), yellow eyes."""
    a = Art('owl')
    w, sh, dk = '#FBFCFD', '#D3DCE6', '#8C98A6'
    fleck = '#59626E'
    flecks = ''.join(paint(P('M %s %s q 3 2.6 6 0' % (f(x), f(y))),
                           'fill="none" stroke="%s" stroke-width="2" stroke-linecap="round"' % fleck)
                     for x, y in ((46, 78), (58, 76), (70, 78), (82, 76), (52, 88), (64, 88), (76, 88),
                                  (58, 98), (70, 98), (40, 66), (88, 66)))
    # feathered feet
    for x in (52, 74):
        a.part(E(x, 110, 9, 5.5), w, dk, shade_col=sh, off=(-1, -2))
        a.line('M %s 114 L %s 117 M %s 115 L %s 118 M %s 114 L %s 117' % (
            f(x - 5), f(x - 6), f(x), f(x), f(x + 5), f(x + 6)), '#5E5A52', 2)
    a.part(P('M 28 72 C 28 48 44 40 64 40 C 86 40 100 50 100 72 C 100 96 88 110 64 110 C 40 110 28 96 28 72 Z'),
           w, dk, shade_col=sh, hl=(40, 56, 6, 3, -35), inner=flecks)
    # wings
    a.part(P('M 32 66 C 20 76 20 94 32 104 C 38 98 40 84 38 72 Z'), w, dk, shade_col=sh, sil=False, off=(-1, -2),
           inner=paint(P('M 26 86 q 4 3 8 0 M 26 94 q 4 3 8 0'), 'fill="none" stroke="%s" stroke-width="1.8"' % fleck))
    a.part(P('M 96 68 C 106 78 106 94 96 102 C 92 96 90 84 92 72 Z'), w, dk, shade_col=sh, sil=False, off=(-1, -2),
           inner=paint(P('M 94 86 q 4 3 8 0 M 94 94 q 4 3 8 0'), 'fill="none" stroke="%s" stroke-width="1.8"' % fleck))
    # round head turned a little right
    a.part(C(70, 36, 26), w, dk, shade_col=sh, hl=(58, 20, 6, 3, -30),
           inner=paint(P('M 56 16 q 3 2 6 0 M 68 13 q 3 2 6 0 M 80 16 q 3 2 6 0'),
                       'fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round"' % fleck))
    # yellow eyes
    for x, y in ((62, 38), (84, 37)):
        a.add(paint(C(x, y, 8.6), 'fill="#FFD23F" stroke="#C99A12" stroke-width="2"'))
        a.eye(x + .6, y, 5, look=(.6, 0))
    a.part(P('M 70 44 C 73 42 78 42 80 44 L 75 53 Z'), '#4A4648', '#2E2A2C', shade=False, sw=1.6, sil=False)
    a.cheek(56, 50, 4.4, opacity=.8)
    a.cheek(90, 49, 4.4, opacity=.8)
    return a


def whale():
    """Small blue-grey whale facing right: big round head, pale grooved belly, tail fluke up, little spout."""
    a = Art('whale')
    b, sh, dk = '#5C7FA8', '#4A6B92', '#2E4A6E'
    belly = '#C6D7EA'
    # spout (water)
    wt, wdk = '#BFE6FA', '#3D78A8'
    a.part(P('M 86 50 C 84 42 84 34 86 28 C 88 34 90 42 88 50 Z'), wt, wdk, shade=False, sw=2)
    a.part(P('M 86 30 C 80 22 72 20 66 24 C 70 28 78 30 86 32 Z'), wt, wdk, shade=False, sw=2)
    a.part(P('M 88 30 C 94 22 102 20 108 24 C 104 28 96 30 88 32 Z'), wt, wdk, shade=False, sw=2)
    for x, y, r in ((64, 16, 3.4), (110, 16, 3.4), (87, 14, 3.6), (75, 10, 2.4), (99, 9, 2.4)):
        a.part(C(x, y, r), wt, wdk, shade=False, sw=1.8)
    # tail stalk + fluke
    a.part(P('M 40 90 C 28 88 20 80 18 70 L 30 66 C 32 74 38 80 48 82 Z'), b, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 24 72 C 12 72 4 64 4 54 C 12 56 20 60 24 66 C 24 56 30 48 40 46 C 40 58 34 68 26 74 Z'), b, dk,
           shade_col=sh, off=(-1, -2), hl=(12, 58, 3, 1.6, 30))
    grooves = ''.join(paint(P('M %s %s Q 82 %s %s %s' % (f(52), f(y), f(y + 6), f(114), f(y - 6))),
                            'fill="none" stroke="#9FB6D1" stroke-width="1.6" stroke-linecap="round"')
                      for y in (98, 104))
    a.part(P('M 34 88 C 34 66 56 52 82 52 C 108 52 122 68 122 86 C 122 102 106 112 82 112 C 60 112 44 104 34 96 Z'),
           b, dk, shade_col=sh, hl=(58, 60, 12, 4, -10),
           inner=paint(P('M 40 98 C 60 96 96 92 124 86 L 124 120 L 40 120 Z'), 'fill="%s"' % belly) + grooves)
    # pectoral flipper
    a.part(P('M 74 98 C 80 106 82 114 78 118 C 70 116 66 108 66 100 Z'), b, dk, shade_col=sh, off=(-1, -2))
    # blowhole
    a.line('M 84 54 Q 87 52 90 54', dk, 1.8)
    a.eye(100, 78, 6, look=(.8, 0))
    a.line('M 104 92 Q 112 94 118 88', '#24405F', 2.2)
    a.cheek(98, 89, 5.4, opacity=.85)
    return a


def puffin():
    """Atlantic puffin standing upright, facing right: black back, white face + belly, big orange-red beak, orange feet."""
    a = Art('puffin')
    k, ksh, kdk = '#33363F', '#262930', '#15171C'
    w, wsh, wdk = '#FFFFFF', '#E2E8EE', '#8A94A0'
    bk, bkdk = '#E8643A', '#A83A18'
    ft, ftdk = '#FF9A2E', '#C4650C'
    for x in (52, 72):
        a.part(P('M %s 108 L %s 108 L %s 116 C %s 118 %s 118 %s 116 Z' % (
            f(x - 2), f(x + 4), f(x + 14), f(x + 10), f(x - 6), f(x - 8))), ft, ftdk, shade=False, sw=2)
    # short tail
    a.part(P('M 38 96 L 26 106 L 40 104 Z'), k, kdk, shade=False, sw=2)
    # black body
    a.part(E(60, 78, 27, 33), k, kdk, shade_col=ksh, hl=(48, 60, 6, 3, -20))
    # white chest/belly
    a.part(P('M 66 50 C 84 54 90 70 88 86 C 86 100 78 110 64 110 C 56 110 52 102 54 92 C 56 76 58 62 66 50 Z'),
           w, wdk, shade_col=wsh, off=(-2, -2), sw=2, sil=False)
    # black wing over the side
    a.part(P('M 40 62 C 30 74 30 94 42 104 C 50 98 54 84 52 70 Z'), k, kdk, shade_col=ksh, off=(-1, -2), sil=False,
           hl=(40, 74, 2, 6, 0))
    # head: black cap, white face
    a.part(C(70, 38, 21), k, kdk, shade_col=ksh, hl=(60, 24, 5, 2.5, -30),
           inner=paint(P('M 60 36 C 62 26 76 22 86 30 C 92 36 92 50 84 56 C 74 60 62 54 60 46 Z'), 'fill="#FFFFFF"') +
           paint(E(80, 54, 10, 3), 'fill="#E2E8EE"'))
    # big triangular beak with stripes
    a.part(P('M 86 26 C 100 28 112 36 116 46 C 110 52 98 54 86 52 C 84 44 84 34 86 26 Z'), bk, bkdk,
           shade_col='#D24F28', off=(-1, -2),
           inner=paint(P('M 84 24 C 90 26 92 40 90 54 L 82 54 L 82 24 Z'), 'fill="#5E6878"') +
           paint(P('M 92 28 C 95 34 96 44 94 52'), 'fill="none" stroke="#FFD23F" stroke-width="2.6"') +
           paint(P('M 100 32 C 103 38 104 44 102 52'), 'fill="none" stroke="#F7A07A" stroke-width="1.8"'))
    a.line('M 88 46 L 112 46', bkdk, 1.6)
    # eye with the puffin's little grey triangle marks
    a.line('M 70 32 L 76 29', '#7A8494', 1.6)
    a.eye(75, 38, 5.4, look=(.8, 0))
    a.cheek(74, 48, 4.4, opacity=.85)
    return a


def penguin():
    """Fluffy grey penguin chick (NOT Tuk): round downy grey body, black cap with a white face mask, tiny dark beak."""
    a = Art('penguin')
    g, sh, dk = '#B4BCC6', '#97A0AC', '#626B78'
    cap, capdk = '#3A3F47', '#23272D'
    for x in (50, 72):
        a.part(E(x, 112, 9, 4.6), '#6B6F78', '#3F434A', shade=False, sw=2)
    # fluffy downy body (scalloped)
    a.part(P(scallop(60, 82, 31, 27, 14, 2.2, .2)), g, dk, shade_col=sh, hl=(46, 66, 8, 4, -20),
           inner=paint(E(66, 90, 17, 15), 'fill="#CCD3DB"') +
           ''.join(paint(P('M %s %s q 2 -3 4 0' % (f(x), f(y))), 'fill="none" stroke="%s" stroke-width="1.6" '
                         'stroke-linecap="round"' % '#8D96A2') for x, y in ((44, 80), (52, 96), (40, 92), (78, 102))))
    # tiny fluffy flippers held out
    a.part(P('M 32 76 C 22 80 16 90 18 96 C 26 94 32 88 34 82 Z'), g, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 88 78 C 98 82 104 90 104 96 C 96 96 90 90 88 84 Z'), g, dk, shade_col=sh, off=(-1, -2))
    # head: black cap with a fluffy top tuft, big white face mask
    a.part(P(scallop(68, 40, 23, 21, 12, 1.6, .3)), cap, capdk, shade_col='#2C3036', hl=(56, 26, 5, 2.5, -30),
           inner=paint(P('M 50 44 C 50 30 64 26 76 30 C 86 26 94 34 92 46 C 90 58 80 62 70 62 C 58 62 50 56 50 44 Z'),
                       'fill="#FFFFFF"'))
    a.line('M 64 18 C 62 12 66 8 70 10 M 70 18 C 72 12 76 12 78 14', cap, 2.6, sil=True)
    a.part(P('M 90 44 C 96 44 102 46 104 48 C 100 52 94 52 90 51 Z'), '#4A4E56', '#2A2D33', shade=False, sw=1.6,
           sil=False)
    a.eye(70, 42, 5.6, look=(.9, 0))
    a.eye(85, 41, 5, look=(.9, 0))
    a.cheek(66, 53, 4.6, opacity=.9)
    a.cheek(90, 52, 3.6, opacity=.9)
    return a


def hare():
    """White arctic hare sitting, facing right: very long ears with black tips, big hind foot, round cotton tail."""
    a = Art('hare')
    w, sh, dk = '#F7F9FB', '#D0D9E3', '#8C97A3'
    tip = '#3B3F48'
    pink = '#F2B6C2'
    a.part(E(70, 30, 8, 26, -10), w, dk, shade_col=sh,
           inner=paint(E(71, 34, 4, 17, -10), 'fill="%s"' % pink) +
           paint(P('M 56 0 L 84 0 L 84 16 C 76 20 66 18 56 14 Z'), 'fill="%s"' % tip))
    a.part(E(94, 28, 8, 26, 16), w, dk, shade_col=sh,
           inner=paint(E(93, 32, 4, 17, 16), 'fill="%s"' % pink) +
           paint(P('M 86 0 L 116 0 L 116 14 C 106 18 96 16 86 12 Z'), 'fill="%s"' % tip))
    a.part(P(scallop(26, 92, 10, 10, 7, 1.8)), '#FFFFFF', dk, shade_col='#E6ECF1', off=(-2, -2))
    # big hind foot (tucked under the body)
    a.part(E(50, 110, 22, 7), w, dk, shade_col=sh, off=(-2, -2))
    a.part(E(54, 90, 29, 22), w, dk, shade_col=sh, hl=(42, 76, 9, 4, -15))
    a.part(E(86, 110, 8, 6), w, dk, shade_col=sh, off=(-2, -2))
    a.line('M 84 107 L 84 110 M 88 107 L 88 110', dk, 1.4)
    a.part(C(84, 66, 23), w, dk, shade_col=sh, hl=(72, 50, 7, 3.5, -25))
    a.flat(E(98, 78, 11, 8), '#FFFFFF')
    a.flat(P('M 100 70 C 100 68 108 68 108 70 L 104 74 Z'), '#E8869E', '#A85870', sw=1.4)
    a.line('M 104 74 L 104 77 M 104 77 Q 100 81 97 78 M 104 77 Q 108 81 111 78', '#6A7480', 2)
    a.line('M 110 74 L 120 72 M 110 78 L 120 80', '#9AA4AE', 1.4)
    a.eye(78, 62, 6.2, look=(.8, 0))
    a.eye(97, 60, 5.6, look=(.8, 0))
    a.cheek(74, 76, 5, opacity=.85)
    return a


def walrus():
    """Brown walrus calf propped up on its front flippers, facing right: plump body, whisker pads, two small tusks."""
    a = Art('walrus')
    b, sh, dk = '#9B6E54', '#80573F', '#5A3826'
    pad = '#C9A086'
    # rear flippers
    a.part(P('M 20 104 C 10 100 4 94 4 88 C 12 88 20 94 26 100 Z'), b, dk, shade_col=sh, off=(-1, -2))
    a.part(P('M 22 108 C 12 112 8 118 8 122 C 16 122 24 116 28 110 Z'), b, dk, shade_col=sh, off=(-1, -2))
    wrinkle = paint(P('M 50 76 q 6 -3 12 0 M 46 86 q 6 -3 12 0'), 'fill="none" stroke="#80573F" stroke-width="1.8" '
                    'stroke-linecap="round"')
    # plump body rising to the head
    a.part(P('M 20 106 C 18 86 34 70 56 66 C 70 62 76 54 80 44 L 110 50 C 116 66 112 88 102 104 '
             'C 92 118 40 120 26 114 C 22 112 20 110 20 106 Z'), b, dk, shade_col=sh, hl=(40, 78, 10, 4, -20),
           inner=wrinkle)
    # front flipper propping it up
    a.part(P('M 82 96 C 88 104 94 112 104 116 C 98 120 84 120 78 114 C 74 108 74 100 78 96 Z'), b, dk,
           shade_col=sh, off=(-1, -2))
    # head
    a.part(C(94, 46, 22), b, dk, shade_col=sh, hl=(82, 32, 6, 3, -25))
    # tusks (drawn before the whisker pads so the pads overlap their roots)
    for x in (100, 110):
        a.part(P('M %s 64 C %s 74 %s 82 %s 86 C %s 84 %s 76 %s 64 Z' % (
            f(x - 2.6), f(x - 2.6), f(x - 1), f(x + .6), f(x + 2.6), f(x + 3), f(x + 2.6))),
            '#FFF8E8', '#A8957A', shade_col='#EDE1C8', off=(-1, 0), sw=1.8)
    # puffy whisker pads
    a.part(C(101, 60, 8), pad, dk, shade_col='#B88C70', off=(-1, -2), sw=2, sil=False)
    a.part(C(113, 59, 8), pad, dk, shade_col='#B88C70', off=(-1, -2), sw=2)
    for x, y in ((98, 58), (102, 62), (104, 57), (110, 58), (114, 62), (117, 57)):
        a.flat(C(x, y, 1), '#6E4A36')
    a.flat(E(110, 51, 4, 2.8), NOSE)
    a.flat(C(109, 50.2, 1), '#FFFFFF', opacity=.7)
    a.line('M 118 62 L 126 64 M 118 58 L 126 56', '#7A5642', 1.2)
    a.eye(88, 40, 5.6, look=(.8, 0))
    a.eye(103, 38, 5, look=(.8, 0))
    a.cheek(86, 52, 4.4, opacity=.85)
    return a


# ---------------------------------------------------------------- homes (round badges with a little scene)
BADGE_C = (64, 62.5)
BADGE_R = 50


class Badge(Art):
    """A round sticker badge: scene clipped to a circle, ring outline, white sticker border + drop shadow."""

    def __init__(self, name, sky, ring):
        super().__init__(name)
        self.ring = ring
        cx, cy = BADGE_C
        self.clip = self.cid()
        self.defs.append('<clipPath id="%s">%s</clipPath>' % (self.clip, paint(C(cx, cy, BADGE_R), '')))
        self.silhouette(C(cx, cy, BADGE_R))
        self.add(paint(C(cx, cy, BADGE_R), 'fill="%s"' % sky))
        self.add('<g clip-path="url(#%s)">' % self.clip)
        # soft sky glow upper-left
        self.add(paint(C(cx - 18, cy - 26, 30), 'fill="#FFFFFF" opacity=".22"'))

    def scene(self, shape, fill, dark, **kw):
        kw.setdefault('sil', False)
        return self.part(shape, fill, dark, **kw)

    def finish(self):
        cx, cy = BADGE_C
        self.add('</g>')
        # inner light rim + outer ring in a darker tone of the scene
        self.add(paint(C(cx, cy, BADGE_R - 2.6), 'fill="none" stroke="#FFFFFF" stroke-width="2" opacity=".55"'))
        self.add(paint(C(cx, cy, BADGE_R), 'fill="none" stroke="%s" stroke-width="3"' % self.ring))
        return self


def flakes(a, pts, col='#FFFFFF', op=.9):
    for x, y, r in pts:
        a.add(paint(C(x, y, r), 'fill="%s" opacity="%s"' % (col, f(op))))


def home_den():
    """Polar-bear den: a big snow cave with a dark arched opening, paw prints leading in."""
    a = Badge('den', '#BFDCF4', '#5E86AE')
    flakes(a, ((32, 30, 1.8), (50, 22, 1.4), (88, 24, 1.8), (100, 38, 1.4), (24, 50, 1.4)))
    # back snow hill
    a.scene(P('M 0 90 C 20 76 40 74 54 80 L 54 130 L 0 130 Z'), '#E8F1F9', '#9AB5CE', shade=False, sw=2)
    # snow ground
    a.scene(P('M 0 94 C 30 88 90 88 128 94 L 128 130 L 0 130 Z'), '#F7FBFE', '#9AB5CE', shade_col='#DCE9F4',
            off=(0, -4), sw=2)
    # the snow cave dome
    a.scene(P('M 22 100 C 20 66 40 40 66 40 C 92 40 110 64 108 100 Z'), '#FFFFFF', '#7F9DBB', shade_col='#D2E2F0',
            off=(-5, -5), hl=(46, 54, 10, 5, -30))
    a.line('M 34 66 Q 44 62 50 66 M 84 56 Q 92 56 96 62', '#B9CFE3', 2)
    # dark arched opening with a snowy lip
    a.scene(P('M 48 100 C 48 80 54 66 66 66 C 78 66 84 80 84 100 Z'), '#2B4466', '#1C2F4C', shade=False, sw=2.4,
            inner=paint(P('M 66 70 C 76 72 80 86 80 100 L 84 100 C 84 80 78 66 66 66 Z'), 'fill="#3E5C86"'))
    a.scene(P('M 44 100 C 52 96 80 96 88 100 C 80 104 52 104 44 100 Z'), '#FFFFFF', '#9AB5CE', shade=False, sw=1.8)
    # paw prints leading into the den
    for x, y, s in ((92, 112, 1), (104, 106, .85), (80, 118, 1.1)):
        a.add(paint(E(x, y, 4 * s, 3 * s), 'fill="#A8C2DA"'))
        for dx in (-3.6, 0, 3.6):
            a.add(paint(C(x + dx * s, y - 4.4 * s, 1.4 * s), 'fill="#A8C2DA"'))
    return a.finish()


def home_floe():
    """Seal's ice floe: a flat ice floe on dark-blue sea with a round breathing hole."""
    a = Badge('floe', '#CDE8F7', '#2F6A9E')
    # sea
    a.scene(R(0, 54, 128, 80), '#3C7FB8', '#2F6A9E', shade=False, sw=0)
    for y, x0 in ((62, 14), (70, 70), (108, 22), (114, 74)):
        a.line('M %s %s q 5 -3 10 0 q 5 3 10 0' % (f(x0), f(y)), '#7FB4DE', 2.2)
    # floe thickness (side face) then top
    a.scene(P('M 14 84 L 28 70 L 56 64 L 98 66 L 116 78 L 110 96 L 70 102 L 22 98 Z'), '#8FC3E0', '#2F6A9E',
            shade=False, sw=2.4)
    a.scene(P('M 14 80 L 28 66 L 56 60 L 98 62 L 116 74 L 108 88 L 70 94 L 22 92 Z'), '#FFFFFF', '#5E8FB8',
            shade_col='#DCEDF8', off=(-4, -5), sw=2.4, hl=(40, 68, 10, 3, -8))
    # breathing hole
    a.scene(E(68, 78, 13, 6), '#24578A', '#1A4470', shade=False, sw=2.2,
            inner=paint(E(68, 80, 10, 3.6), 'fill="#3C7FB8"') + paint(E(64, 79, 3, 1), 'fill="#9FD3F0"'))
    # bubbles from the hole
    for x, y, r in ((74, 70, 2.2), (78, 64, 1.6), (72, 60, 1.2)):
        a.add(paint(C(x, y, r), 'fill="#FFFFFF" stroke="#5E8FB8" stroke-width="1"'))
    return a.finish()


def home_burrow():
    """Arctic fox burrow: a low snowy mound with a round earthy hole at the front; dry grass; warm sky."""
    a = Badge('burrow', '#FBE3CC', '#B07A52')
    a.add(paint(C(96, 30, 9), 'fill="#FFD9A0" opacity=".9"'))
    # tundra grass strip behind
    a.scene(P('M 0 78 C 30 74 98 74 128 78 L 128 130 L 0 130 Z'), '#C9B48A', '#8E7650', shade=False, sw=2)
    # low wide snowy mound
    a.scene(P('M 0 108 C 8 66 40 50 66 50 C 92 50 120 66 128 108 Z'), '#FFFFFF', '#8E9AA6', shade_col='#DDE6EE',
            off=(-5, -5), hl=(44, 70, 12, 4, -15))
    # snow ground front
    a.scene(P('M 0 106 C 30 102 98 102 128 106 L 128 130 L 0 130 Z'), '#F4F8FB', '#8E9AA6', shade_col='#DDE6EE',
            off=(0, -3), sw=2)
    # earthy rim + round dark hole
    a.scene(E(66, 90, 23, 18), '#A4724A', '#6E4628', shade_col='#8A5C38', off=(-2, -3), sw=2.4)
    a.scene(E(67, 93, 16, 13), '#3E2818', '#2A1A0E', shade=False, sw=1.6,
            inner=paint(E(70, 97, 11, 7.5), 'fill="#2A1A0E"'))
    a.scene(P('M 40 82 C 48 72 58 68 66 68 C 76 68 86 72 92 82 C 82 76 50 76 40 82 Z'), '#FFFFFF', '#8E9AA6',
            shade=False, sw=1.6)
    # dry grass tufts poking through the snow
    for x, y in ((20, 76), (104, 72), (36, 60), (84, 56)):
        a.line('M %s %s l -3 -9 M %s %s l 0 -11 M %s %s l 3 -9' % (f(x), f(y), f(x + 2), f(y), f(x + 4), f(y)),
               '#B08A4A', 2.2)
    return a.finish()


def home_nest():
    """Snowy owl nest: a round twig nest with two white eggs sitting on a grey rock."""
    a = Badge('nest', '#D3EEF0', '#5C7F86')
    flakes(a, ((30, 34, 1.6), (96, 28, 1.8), (104, 50, 1.4)))
    a.scene(P('M 0 100 C 30 94 98 94 128 100 L 128 130 L 0 130 Z'), '#F4F8FB', '#8E9AA6', shade=False, sw=2)
    # grey rock
    a.scene(P('M 14 114 C 14 92 32 78 64 78 C 96 78 114 92 114 114 Z'), '#9AA3AD', '#5F6873', shade_col='#7F8894',
            off=(-5, -5), hl=(36, 88, 8, 3, -15))
    a.line('M 34 102 L 42 96 M 84 98 L 92 104 L 100 100', '#6F7883', 2)
    # snow cap on the rock
    a.scene(P('M 22 92 C 30 84 40 82 46 84 C 44 88 34 92 22 96 Z'), '#FFFFFF', '#8E9AA6', shade=False, sw=1.6)
    # nest bowl (back rim, cup, eggs, front rim)
    a.scene(E(64, 66, 32, 11), '#8A5E30', '#5A3A1A', shade=False, sw=2.4)
    a.scene(E(64, 66, 24, 7), '#5E3E1E', '#4A2E12', shade=False, sw=1.4)
    for x, y in ((56, 62), (72, 61)):
        a.scene(E(x, y, 8, 10), '#FFFFFF', '#9A9486', shade_col='#E8E3D6', off=(-2, -2), sw=2, hl=(x - 3, y - 4, 2, 3))
    a.scene(P('M 32 66 C 34 80 48 86 64 86 C 80 86 94 80 96 66 C 90 74 80 76 64 76 C 48 76 38 74 32 66 Z'),
            '#A9773F', '#5A3A1A', shade_col='#8A5E30', off=(0, -3), sw=2.4)
    for d in ('M 34 70 L 56 82', 'M 50 74 L 80 84', 'M 66 84 L 94 70', 'M 40 78 L 64 76', 'M 76 76 L 92 80',
              'M 28 66 L 22 60', 'M 96 64 L 104 58', 'M 92 72 L 102 74'):
        a.line(d, '#6E4A22', 2)
    a.line('M 38 72 L 60 78 M 70 78 L 90 72', '#C9975A', 1.6)
    return a.finish()


def home_sea():
    """Whale's sea: rolling blue waves with a big white splash in the middle."""
    a = Badge('sea', '#D6ECFA', '#1F5BA8')
    a.add(paint(C(30, 34, 8), 'fill="#FFE9A8" opacity=".9"'))
    # back wave band
    a.scene(P('M 0 72 Q 16 62 32 72 T 64 72 T 96 72 T 128 72 L 128 130 L 0 130 Z'), '#6FAEE0', '#2F6FA8', shade=False,
            sw=2.2)
    # splash crown (behind the front wave)
    a.scene(P('M 42 88 C 38 74 42 62 48 56 C 52 52 57 55 57 61 C 57 49 60 38 66 34 C 72 38 75 49 75 61 '
              'C 75 55 80 52 84 56 C 90 62 94 74 90 88 Z'), '#FFFFFF', '#3C7FB8', shade_col='#CBE6F8', off=(-3, -3),
            sw=2.4)
    for x, y, r in ((40, 44, 3.2), (90, 42, 3.2), (54, 30, 2.6), (80, 28, 2.6), (66, 20, 3), (34, 58, 2.2),
                    (96, 58, 2.2)):
        a.scene(C(x, y, r), '#FFFFFF', '#3C7FB8', shade=False, sw=1.6)
    # front waves with foam
    a.scene(P('M 0 88 Q 16 76 32 88 T 64 88 T 96 88 T 128 88 L 128 130 L 0 130 Z'), '#3C8DE8', '#1F5BA8',
            shade_col='#2F78CC', off=(0, -5), sw=2.4)
    for x0 in (2, 34, 66, 98):
        a.line('M %s 86 Q %s 79 %s 82' % (f(x0 + 6), f(x0 + 16), f(x0 + 26)), '#FFFFFF', 3)
    a.scene(P('M 0 108 Q 16 98 32 108 T 64 108 T 96 108 T 128 108 L 128 130 L 0 130 Z'), '#2F78CC', '#1F5BA8',
            shade=False, sw=2.2)
    for x0 in (18, 50, 82):
        a.line('M %s 106 Q %s 100 %s 103' % (f(x0 + 4), f(x0 + 12), f(x0 + 20)), '#9FD0F5', 2.4)
    return a.finish()


def home_cliff():
    """Puffin's cliff: a tall rocky sea cliff with green grass on top and a little round nesting hole."""
    a = Badge('cliff', '#DCEBF5', '#6B5848')
    # sea at the bottom right
    a.scene(R(0, 98, 128, 40), '#4C88BC', '#2F6A9E', shade=False, sw=0)
    a.line('M 96 108 q 5 -3 10 0 q 5 3 10 0', '#9FC8EA', 2)
    # cliff body
    a.scene(P('M 0 34 L 60 30 C 76 30 86 40 88 54 L 92 78 L 100 84 L 104 132 L 0 132 Z'), '#A88E78', '#6B5848',
            shade_col='#8E7460', off=(-6, -4), sw=2.4, hl=(28, 50, 12, 3, -4))
    # rock layers
    for d in ('M 6 58 L 40 56 L 52 60', 'M 54 78 L 86 76', 'M 10 92 L 36 90', 'M 50 108 L 96 106', 'M 14 118 L 40 116'):
        a.line(d, '#7E6654', 2)
    # grass top
    a.scene(P('M 0 32 L 60 28 C 72 28 80 32 84 38 C 76 42 66 40 60 42 C 50 44 40 40 30 44 C 20 46 10 42 0 44 Z'),
            '#7CB86A', '#4E8040', shade_col='#68A458', off=(0, -3), sw=2.2)
    for x in (12, 26, 44, 62, 76):
        a.line('M %s 30 l -2 -6 M %s 30 l 2 -7' % (f(x), f(x + 3)), '#4E8040', 1.8)
    # nesting hole with a little ledge
    a.scene(E(52, 68, 12, 10), '#3A2A22', '#2A1C14', shade=False, sw=2.2,
            inner=paint(E(55, 72, 8, 6), 'fill="#24170F"'))
    a.scene(P('M 36 78 C 44 76 62 76 70 78 C 66 82 42 82 36 78 Z'), '#C2AA92', '#6B5848', shade=False, sw=1.8)
    return a.finish()


def home_pebbles():
    """Penguin's pebble nest: a ring of round pebbles on the snow, little three-toed footprints leading in."""
    a = Badge('pebbles', '#DCE2F7', '#6E7A9E')
    # distant iceberg
    a.scene(P('M 76 64 L 86 40 L 94 46 L 102 32 L 116 64 Z'), '#FFFFFF', '#6E86AE', shade_col='#C6D6EC', off=(-5, -2),
            sw=2.2)
    a.scene(R(0, 60, 128, 8), '#A9C8E8', '#6E8EB8', shade=False, sw=0)
    # snow ground
    a.scene(P('M 0 64 C 30 60 98 60 128 64 L 128 130 L 0 130 Z'), '#F7FAFD', '#8E9AA6', shade_col='#E0E8F0',
            off=(0, -6), sw=2)
    # soft hollow inside the ring
    a.add(paint(E(64, 82, 30, 12), 'fill="#D6E0EA"'))
    cols = [('#8E96A0', '#5C6470'), ('#A89F94', '#6E655A'), ('#7A8490', '#4C5562'), ('#B4AFA6', '#76706A')]
    n = 11
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n + .2
        x, y = 64 + 36 * math.cos(t), 82 + 16 * math.sin(t)
        pts.append((y, x, k))
    for y, x, k in sorted(pts):          # back pebbles first
        fill, dk = cols[k % 4]
        r = 7.6 + (y - 66) * .1
        a.scene(E(x, y, r * 1.15, r * .85, (k * 23) % 40 - 20), fill, dk, shade_col=mix(fill, dk, .45),
                off=(-1.6, -2), sw=2, hl=(x - r * .4, y - r * .4, r * .3, r * .18))
    # one little egg in the middle
    a.scene(E(64, 80, 6.5, 8), '#FFFFFF', '#9A9486', shade_col='#E8E3D6', off=(-2, -2), sw=2, hl=(61, 76, 1.6, 2.4))
    # footprints leading into the nest
    for x, y, s in ((90, 114, 1), (102, 108, .9)):
        a.line('M %s %s l -4 -5 M %s %s l 0 -6 M %s %s l 4 -5' % (f(x), f(y), f(x), f(y), f(x), f(y)),
               '#A9BCD0', 2.2 * s)
    return a.finish()


ALL = {
    'animal_bear': bear, 'animal_seal': seal, 'animal_fox': fox, 'animal_owl': owl, 'animal_whale': whale,
    'animal_puffin': puffin, 'animal_penguin': penguin, 'animal_hare': hare, 'animal_walrus': walrus,
    'home_den': home_den, 'home_floe': home_floe, 'home_burrow': home_burrow, 'home_nest': home_nest,
    'home_sea': home_sea, 'home_cliff': home_cliff, 'home_pebbles': home_pebbles,
}
OLD = ['animal_deer', 'animal_hedgehog', 'animal_squirrel', 'animal_bunny', 'animal_frog', 'animal_mouse']

# per-animal (scale, dx, dy): border + shadow stay inside the 128 frame, ~110 px of art.
# Suggested values come from `node tools/art_animals_sheet.js --fit` (measures each silhouette in Chromium).
FIT = {'bear': (1.062, -0.5, -9.6), 'seal': (0.945, 3.3, -9.6), 'fox': (1.002, 5.9, -6.5), 'owl': (0.98, 0, -0.2),
       'whale': (0.909, 0.9, 0.2), 'puffin': (1.021, -7.1, -4.9), 'penguin': (0.967, 3.1, -0.5), 'hare': (0.901, 1.8, 3.2),
       'walrus': (0.916, 1.4, -9.6)}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ALL.items():
        art = fn()
        key = name.split('_', 1)[1]
        art.xf = FIT.get(key) if name.startswith('animal_') else None
        with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
            fh.write(art.svg())
    for name in OLD:
        p = os.path.join(OUT, name + '.svg')
        if os.path.exists(p):
            os.remove(p)
            print('removed', name)
    print('wrote %d sprites to %s' % (len(ALL), OUT))


if __name__ == '__main__':
    main()
