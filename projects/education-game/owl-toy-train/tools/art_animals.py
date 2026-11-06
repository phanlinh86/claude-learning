#!/usr/bin/env python3
"""Generate Momo's Toy Train animal stickers + home badges (character artist B, DESIGN §4.2).

Writes game/assets/default/items/animal_{cow,pig,sheep,duck,frog,fish,bird,squirrel,butterfly,bunny,mouse,fox}.svg
and items/home_{barn,pond,tree,burrow}.svg, all viewBox 0 0 160 160.
  * Animals: drawn in a 128-unit design space, then fitted into the 160 frame by a per-animal (scale, dx, dy)
    so the sticker border sits on the BOTTOM ANCHOR (80, 156) and the art is ~150 px wide/tall at most.
    FIT values come from tools/animal_fit.json (written by `node tools/train_sheet.js fit`, which rasterises each
    sticker and measures its real bounds); without the json a default fit is used.
  * Style (same pipeline as the repo's other sticker sets, original drawings): every part = fill + one-step cel shade
    + outline in a darker tone of the fill (never black); white sticker border (~6 px beyond the outline) + faint warm
    drop shadow from one <use> of the merged silhouette. Most animals face RIGHT, 3/4 side view, sitting/standing.
  * Home badges: round (r 72) little scenes with a white rim, readable at 64 px.
No filters, text, fonts, scripts or external refs.

Usage: python3 tools/art_animals.py
"""
import json
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
        self.xf = None       # (scale, dx, dy) into the 160 frame, see svg()
        self.flip = False

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
        """160×160 document. self.xf = (k, dx, dy): the 128-unit art is drawn at translate(dx dy) scale(k);
        self.flip mirrors the art horizontally inside its 128 design box (so every animal faces the same way)."""
        out = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
               'width="160" height="160" viewBox="0 0 160 160">']
        defs = list(self.defs)
        if sticker:
            defs.append('<g id="%s_sil">%s</g>' % (self.name, ''.join(self.sil)))
        out.append('<defs>%s</defs>' % ''.join(defs))
        k, dx, dy = self.xf or (1.18, 4.5, 6)
        out.append('<g transform="translate(%s %s) scale(%s)">' % (f(dx), f(dy), f(k)))
        if getattr(self, 'flip', False):
            out.append('<g transform="translate(128 0) scale(-1 1)">')
        if sticker:
            ref = '#%s_sil' % self.name
            out.append('<use href="%s" xlink:href="%s" transform="translate(0 3)" fill="%s" stroke="%s" '
                       'stroke-width="%d" stroke-linejoin="round" stroke-linecap="round" opacity=".18"/>' % (
                           ref, ref, SHADOW, SHADOW, STICKER_SW))
            out.append('<use href="%s" xlink:href="%s" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
                       'stroke-linejoin="round" stroke-linecap="round"/>' % (ref, ref, STICKER_SW))
        out.extend(self.body)
        if getattr(self, 'flip', False):
            out.append('</g>')
        out.append('</g>')
        out.append('</svg>')
        return '\n'.join(out) + '\n'






# ---------------------------------------------------------------- farm animals (barn)
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



# ---------------------------------------------------------------- forest / pond animals
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




def bunny():
    """White-and-tan bunny sitting, 3/4 facing right: long ears with tan backs, tan saddle patch, cotton tail.
    (Deliberately unlike Momo's lilac plush `bunny_toy`.)"""
    a = Art('bunny')
    w, sh, dk = '#FFFDF8', '#EADFD2', '#8A6E58'
    tan, tdk = '#E2AE76', '#B07A44'
    pink = '#F6AFC2'
    a.part(E(70, 30, 8.5, 23, -10), w, dk, shade_col=sh,
           inner=paint(E(66, 22, 10, 14, -10), 'fill="%s"' % tan) + paint(E(71, 33, 4, 15, -10), 'fill="%s"' % pink))
    a.part(E(93, 28, 8.5, 23, 14), w, dk, shade_col=sh,
           inner=paint(E(98, 18, 10, 13, 14), 'fill="%s"' % tan) + paint(E(92, 31, 4, 15, 14), 'fill="%s"' % pink))
    a.part(P(scallop(24, 92, 9.5, 9.5, 7, 1.7)), '#FFFFFF', dk, shade_col='#F1EAE2', off=(-2, -2))
    a.part(E(52, 90, 30, 24), w, dk, shade_col=sh, hl=(40, 76, 8, 3.5, -15),
           inner=paint(P('M 26 80 C 30 66 48 62 62 68 C 64 80 54 92 40 94 C 30 94 25 88 26 80 Z'), 'fill="%s"' % tan) +
           paint(E(70, 98, 9, 13), 'fill="#FFFFFF"'))
    a.part(E(60, 111, 18, 6.5), w, dk, shade_col=sh, off=(-2, -2))
    a.part(E(86, 108, 8, 7), w, dk, shade_col=sh, off=(-2, -2))
    a.line('M 84 104 L 84 108 M 88 104 L 88 108', dk, 1.4)
    a.part(C(82, 64, 25), w, dk, shade_col=sh, hl=(72, 48, 6, 3, -25),
           inner=paint(E(70, 50, 13, 11, -20), 'fill="%s"' % tan))
    a.flat(E(96, 76, 11, 8), '#FFFFFF')
    a.flat(P('M 98 68 C 98 66 106 66 106 68 L 102 72 Z'), '#EE8AA6', '#B65C78', sw=1.4)
    a.line('M 102 72 L 102 75 M 102 75 Q 98 79 95 76 M 102 75 Q 106 79 109 76', '#7A5E4A', 2)
    a.line('M 108 72 L 118 70 M 108 76 L 118 78', '#B9A898', 1.4)
    a.eye(76, 60, 6.4, look=(.8, 0))
    a.eye(96, 58, 5.8, look=(.8, 0))
    a.cheek(74, 74, 5, opacity=.8)
    return a


def fish():
    """Round teal fish with an orange tail and fins, little bubbles (drawn facing left, flipped to face right)."""
    a = Art('fish')
    body, dk = '#2FC3D6', '#16808F'
    fin, fdk = '#FFB13B', '#C47A0E'
    a.part(P('M 84 64 C 94 52 106 38 116 38 C 120 40 118 52 113 64 C 118 76 120 88 116 90 '
             'C 106 90 94 76 84 64 Z'), fin, fdk, hl=(104, 48, 5, 3, 40))
    a.line('M 100 56 L 110 50 M 100 72 L 110 78', fdk, 2.2, opacity=.55)
    a.part(P('M 38 38 C 44 18 68 16 80 36 C 66 34 52 34 38 38 Z'), fin, fdk, shade=False)
    a.part(P('M 52 92 C 56 106 70 108 76 98 C 68 96 60 94 52 92 Z'), fin, fdk, shade=False)
    stripes = (paint(P('M 62 30 C 54 50 54 78 62 98'), 'fill="none" stroke="%s" stroke-width="7" opacity=".28"' % dk) +
               paint(P('M 76 32 C 70 50 70 78 76 96'), 'fill="none" stroke="%s" stroke-width="5" opacity=".22"' % dk) +
               paint(E(50, 82, 26, 12), 'fill="#BDF3F7" opacity=".8"'))
    a.part(E(56, 64, 40, 32), body, dk, hl=(40, 44, 12, 6, -20), inner=stripes)
    a.part(P('M 66 70 C 72 66 80 67 82 72 C 78 78 70 78 66 70 Z'), fin, fdk, shade=False, sil=False, sw=2.4)
    a.eye_white(37, 58, 12, 8, dk, look=(-1.5, 0))
    a.cheek(42, 76, 6)
    a.smile(27, 72, 8, dk, sw=2.2, depth=3.5)
    a.part(C(14, 38, 5), '#E8FBFF', '#5FB7CF', shade=False, sw=2.2, hl=(12.5, 36.5, 1.8, 1.4))
    a.part(C(22, 24, 3.4), '#E8FBFF', '#5FB7CF', shade=False, sw=2)
    a.flip = True
    return a


def bird():
    """Round blue songbird with a peach breast standing on twig legs (drawn facing left, flipped to face right)."""
    a = Art('bird')
    b, dk = '#3E8FEA', '#1D56A0'
    breast = '#FF9A6B'
    o, odk = '#FFC23B', '#C48A0E'
    a.line('M 58 98 L 56 108 M 72 98 L 74 108', odk, 3.2, sil=True)
    a.line('M 50 109 L 60 109 M 70 109 L 80 109', odk, 3.2, sil=True)
    a.part(P('M 92 70 C 102 64 112 54 118 54 C 120 60 116 70 110 76 C 114 78 114 84 108 86 '
             'C 102 86 96 82 90 80 Z'), mix(b, dk, .2), dk, shade=False)
    a.part(P('M 56 30 C 52 20 58 14 64 20 C 66 12 76 14 72 26 Z'), b, dk, shade=False, sw=2.6)
    a.part(C(62, 64, 37), b, dk, hl=(46, 44, 12, 7, -30),
           inner=paint(E(50, 86, 26, 24), 'fill="%s"' % breast) +
           paint(E(44, 80, 9, 5, -20), 'fill="#FFC6AE" opacity=".7"'))
    a.part(P('M 66 66 C 76 56 98 60 98 74 C 96 86 82 92 70 88 C 76 84 80 82 82 80 C 72 80 66 76 66 66 Z'),
           mix(b, dk, .25), dk, shade=False, sil=False, sw=2.4)
    a.line('M 80 72 C 86 74 90 76 92 80', dk, 2, opacity=.5)
    a.part(P('M 30 58 L 16 64 L 30 70 C 32 66 32 62 30 58 Z'), o, odk, shade=False, sw=2.4)
    a.eye(42, 56, 7, look=(-1, 0))
    a.cheek(48, 70, 5.5)
    a.flip = True
    return a


def butterfly():
    """Front view butterfly: big soft-pink upper wings, peach lower wings with cream spots, plum body, curly antennae."""
    a = Art('butterfly')
    up, udk = '#FF9EC4', '#C2558A'
    lo, ldk = '#FFC27A', '#C7801F'
    body, bdk = '#7C5A9A', '#4A3264'
    ant = 'M 58 40 C 54 28 48 22 42 20'
    a.line(ant, bdk, 3, sil=True)
    a.line(mirror_d(ant), bdk, 3, sil=True)
    a.part(C(41, 19, 4.6), body, bdk, shade=False, sw=2)
    a.part(C(87, 19, 4.6), body, bdk, shade=False, sw=2)
    wl = 'M 60 80 C 52 96 40 110 28 108 C 16 106 16 92 24 84 C 32 78 46 76 60 80 Z'
    a.part(P(wl), lo, ldk, hl=(26, 92, 4, 2.5, -30), inner=paint(C(34, 96, 5.5), 'fill="#FFF3DC"'))
    a.part(P(mirror_d(wl)), lo, ldk, inner=paint(C(94, 96, 5.5), 'fill="#FFF3DC"'))
    wu = 'M 60 70 C 50 56 34 38 20 40 C 6 42 4 60 12 72 C 20 84 42 84 60 78 Z'
    a.part(P(wu), up, udk, hl=(20, 50, 6, 3.5, -30),
           inner=paint(C(26, 62, 8), 'fill="#FFE1EE"') + paint(C(44, 70, 4.4), 'fill="#FFE1EE"') +
           paint(P('M 56 74 C 44 66 30 58 18 56'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".45"' % udk))
    a.part(P(mirror_d(wu)), up, udk,
           inner=paint(C(102, 62, 8), 'fill="#FFE1EE"') + paint(C(84, 70, 4.4), 'fill="#FFE1EE"') +
           paint(P(mirror_d('M 56 74 C 44 66 30 58 18 56')), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".45"' % udk))
    # body + head
    a.part(E(64, 88, 7.5, 22), body, bdk, hl=(62, 76, 2, 5), off=(-2, -3),
           inner=paint(P('M 56 86 L 72 86 M 56 94 L 72 94 M 57 102 L 71 102'), 'fill="none" stroke="#9C7DB8" stroke-width="2.2"'))
    a.part(C(64, 56, 15), body, bdk, hl=(58, 49, 4, 2.5, -25))
    a.eye(58.5, 55, 3.8)
    a.eye(69.5, 55, 3.8)
    a.smile(64, 62, 6, '#F3D4FF', sw=1.8, depth=2.6)
    a.cheek(54, 61, 3.2, opacity=.9)
    a.cheek(74, 61, 3.2, opacity=.9)
    return a


# =============================== HOME BADGES ===============================
SHADOW_B = '#2A2420'
SKY = '#CDEBFA'
GRASS, GDK = '#8ED05E', '#4E9A2E'


def badge(name, scene, rim_dark):
    """Round badge in the 128 design box (r 58 → r 72.5 in the 160 frame), white rim + faint shadow."""
    a = Art(name)
    cid = name + '_clip'
    a.defs.append('<clipPath id="%s"><circle cx="64" cy="64" r="52"/></clipPath>' % cid)
    a.add(paint(C(64, 66.5, 58), 'fill="%s" opacity=".16"' % SHADOW_B))
    a.add(paint(C(64, 64, 58), 'fill="#FFFFFF" stroke="%s" stroke-width="3"' % rim_dark))
    a.add('<g clip-path="url(#%s)">' % cid)
    scene(a)
    a.add('</g>')
    a.add(paint(C(64, 64, 52), 'fill="none" stroke="%s" stroke-width="2.6" opacity=".6"' % rim_dark))
    a.xf = (1.25, 0, -1.5)
    return a


def home_barn():
    def scene(a):
        a.add(paint(R(0, 0, 128, 128), 'fill="%s"' % SKY))
        a.add(paint(P('M 0 96 C 30 90 98 90 128 96 L 128 128 L 0 128 Z'), 'fill="%s"' % GRASS))
        red, rdk = '#C8654F', '#86372A'
        roof, roofdk = '#8E4A3C', '#5E2C22'
        # barn body (gambrel house shape)
        body = 'M 28 104 L 28 60 L 40 40 L 64 26 L 88 40 L 100 60 L 100 104 Z'
        a.part(P(body), red, rdk, sil=False, off=(-4, -3), shade_t=.3, sw=3,
               inner=paint(P('M 40 64 L 40 104 M 52 64 L 52 104 M 76 64 L 76 104 M 88 64 L 88 104'),
                           'fill="none" stroke="%s" stroke-width="1.6" opacity=".35"' % rdk))
        # roof trim
        a.line('M 24 62 L 38 38 L 64 22 L 90 38 L 104 62', roofdk, 9)
        a.line('M 24 62 L 38 38 L 64 22 L 90 38 L 104 62', '#FFFFFF', 4.4)
        # hay loft window
        a.part(R(56, 40, 16, 13, 2.5), '#FFE7A3', '#B8873A', shade=False, sil=False, sw=2.2)
        a.line('M 64 40 L 64 53', '#B8873A', 1.8)
        # big door with white X
        a.part(R(44, 66, 40, 38, 3), red, rdk, shade=False, sil=False, sw=2.6)
        a.add(paint(R(44, 66, 40, 38, 3), 'fill="none" stroke="#FFFFFF" stroke-width="4"'))
        a.line('M 46 68 L 82 102 M 82 68 L 46 102', '#FFFFFF', 4)
        a.add(paint(R(44, 66, 40, 38, 3), 'fill="none" stroke="%s" stroke-width="1.6"' % rdk))
        # grass tufts
        a.line('M 16 112 L 14 104 M 20 112 L 22 103 M 108 112 L 106 104 M 112 112 L 114 104', GDK, 2.4)
    return badge('home_barn', scene, '#86372A')


def home_pond():
    def scene(a):
        a.add(paint(R(0, 0, 128, 128), 'fill="%s"' % SKY))
        a.add(paint(P('M 0 50 C 30 42 98 42 128 50 L 128 128 L 0 128 Z'), 'fill="%s"' % GRASS))
        a.add(paint(P('M 0 50 C 30 42 98 42 128 50'), 'fill="none" stroke="%s" stroke-width="2.4"' % GDK))
        # round blue-green pond
        a.part(E(64, 84, 50, 30), '#3DB7B4', '#1D7A80', off=(0, 5), shade_t=.3, sil=False, sw=3,
               hl=(50, 70, 18, 4))
        for (cx, cy, rx) in ((86, 76, 12), (86, 76, 6), (38, 98, 8)):
            a.add(paint(E(cx, cy, rx, rx * .38), 'fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".85"'))
        # big lily pad with notch + pink flower
        a.part(P('M 56 90 L 76 82 C 78 96 70 106 52 108 C 32 110 22 102 22 92 C 22 82 34 76 46 76 Z'),
               '#55C04A', '#2C7F22', shade=False, sil=False, sw=2.6, hl=(36, 84, 7, 2.6))
        for k in range(5):
            ang = -90 + k * 72
            x = 46 + 7.5 * math.cos(math.radians(ang))
            y = 89 + 5.5 * math.sin(math.radians(ang))
            a.flat(E(x, y, 6, 3.8, ang), '#FF8FB4', '#D04F7E', sw=1.4)
        a.flat(C(46, 89, 3.4), '#FFE27A')
        for (x, h) in ((104, 30), (112, 24)):
            a.line('M %s 70 L %s %s' % (f(x), f(x), f(70 - h)), '#3C8A2A', 3)
            a.flat(R(x - 3.5, 70 - h - 2, 7, 13, 3.5), '#9A6234', '#5E3A18', sw=1.6)
        a.line('M 20 66 C 18 58 22 52 26 48 M 24 68 C 24 60 28 56 32 54', '#3C8A2A', 3)
    return badge('home_pond', scene, '#1D7A80')


def home_tree():
    def scene(a):
        a.add(paint(R(0, 0, 128, 128), 'fill="%s"' % SKY))
        a.add(paint(P('M 0 104 C 30 98 98 98 128 104 L 128 128 L 0 128 Z'), 'fill="%s"' % GRASS))
        a.part(P('M 50 108 C 56 94 56 74 54 58 L 74 58 C 72 74 72 94 78 108 C 70 110 58 110 50 108 Z'),
               '#A86B3A', '#663C18', sil=False, off=(-3, 0), shade_t=.35)
        # round hollow (dark hole with a lighter rim)
        a.flat(E(64, 84, 8.5, 10), '#B98250', '#663C18', sw=2)
        a.flat(E(64, 85, 6, 7.5), '#3E2412')
        lf, ldk = '#4FB848', '#26781F'
        a.part(C(64, 44, 36), lf, ldk, sil=False, off=(-5, -6), shade_t=.42,
               inner=(paint(C(48, 32, 10), 'fill="#7AD35E" opacity=".7"') +
                      paint(C(76, 26, 7), 'fill="#7AD35E" opacity=".7"') +
                      paint(C(86, 48, 5), 'fill="#7AD35E" opacity=".6"')))
        a.line('M 44 50 Q 50 54 56 50 M 72 54 Q 78 58 84 54 M 58 30 Q 64 34 70 30', ldk, 2, opacity=.5)
        for (x, y) in ((34, 116), (96, 114)):
            a.line('M %s %s L %s %s M %s %s L %s %s' % (f(x), f(y), f(x - 3), f(y - 7), f(x + 4), f(y), f(x + 5), f(y - 6)), GDK, 2.4)
    return badge('home_tree', scene, '#26781F')


def home_burrow():
    def scene(a):
        a.add(paint(R(0, 0, 128, 128), 'fill="%s"' % SKY))
        # grassy hill
        a.part(P('M -6 120 C -4 80 26 50 64 48 C 102 50 132 80 134 120 Z'), '#8ED05E', '#4E9A2E', sil=False,
               off=(-6, -5), shade_t=.35, hl=(40, 62, 14, 5, -25))
        for (x, y) in ((24, 74), (98, 66), (108, 84), (40, 58)):
            a.line('M %s %s L %s %s M %s %s L %s %s' % (f(x), f(y), f(x - 2), f(y - 6), f(x + 3), f(y), f(x + 4), f(y - 6)), GDK, 2.2)
        # round dark hole with a soil rim
        a.part(E(62, 94, 26, 22), '#A9784A', '#6B4422', shade=False, sil=False, sw=2.6)
        a.flat(E(62, 97, 19, 16.5), '#3A2618')
        a.flat(E(58, 92, 6, 3), '#5A3C26', opacity=.6)
        # carrot lying on the right
        a.part(P('M 88 104 C 96 98 110 92 120 90 C 118 98 108 108 94 112 C 90 112 86 108 88 104 Z'),
               '#FF9A2E', '#C4650C', shade=False, sil=False, sw=2.2, hl=(104, 98, 6, 1.5, -20))
        a.line('M 98 104 L 100 108 M 106 100 L 108 104', '#C4650C', 1.6)
        a.part(P('M 88 104 C 82 96 80 90 84 88 C 86 94 88 98 90 102 C 88 94 90 88 94 88 C 94 94 92 100 90 104 Z'),
               '#4FB848', '#26781F', shade=False, sil=False, sw=1.8)
    return badge('home_burrow', scene, '#4E7A2E')


ALL = {
    'animal_cow': cow, 'animal_pig': pig, 'animal_sheep': sheep, 'animal_duck': duck, 'animal_frog': frog,
    'animal_fish': fish, 'animal_bird': bird, 'animal_squirrel': squirrel, 'animal_butterfly': butterfly,
    'animal_bunny': bunny, 'animal_mouse': mouse, 'animal_fox': fox,
    'home_barn': home_barn, 'home_pond': home_pond, 'home_tree': home_tree, 'home_burrow': home_burrow,
}

FIT_JSON = os.path.join(ROOT, 'tools', 'animal_fit.json')


def main():
    os.makedirs(OUT, exist_ok=True)
    fit = {}
    if os.path.exists(FIT_JSON):
        with open(FIT_JSON) as fh:
            fit = json.load(fh)
    for name, fn in ALL.items():
        art = fn()
        if name.startswith('animal_') and name in fit:
            art.xf = tuple(fit[name])
        with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
            fh.write(art.svg(sticker=name.startswith('animal_')))
    print('wrote %d sprites to %s' % (len(ALL), OUT))


if __name__ == '__main__':
    main()
