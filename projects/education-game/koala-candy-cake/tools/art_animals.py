#!/usr/bin/env python3
"""Koko's Cake Tower - animal COOKIE stickers for the cake layers (character artist B, DESIGN 4.2).

Writes game/assets/default/items/animal_<name>.svg for name in
bunny, bear, cat, dog, duck, pig, cow, sheep  (8 files) and removes the old jungle stickers
(elephant, frog, hippo, lion, monkey, parrot, snake, tiger) and any *_wave.svg.

Each sticker is a gingerbread-style animal cookie FACE (front view) filling the 128 box: a warm baked
cookie base, a piped white royal-icing line just inside the edge, flood icing in white / pastel where it
helps recognition (pig pink, duck butter, cow white with cookie spots, sheep white wool), chocolate-icing
eyes with a white catch-light, rosy cheeks, and a white sticker border + faint drop shadow.  Every animal
reads by SILHOUETTE alone at 60 px: bunny tall ears, bear round ears, cat pointy ears + whiskers,
dog floppy ears, duck beak + tuft, pig snout + folded ears, cow horns + spots, sheep fluffy wool.

viewBox 0 0 128 128 (width/height = viewBox). 100 % original art from simple primitives:
  * each part = outline (stroke UNDER the fill -> one merged outline per part) in a darker tone + one-step
    cel shade (base shifted up-left, clipped) + one soft highlight upper-left;
No <text>, fonts, scripts, filters or external refs.

Usage: python3 tools/art_animals.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

OUTLINE = 2.6         # visible outline width (px at 128; reads at 60 px)
STICKER = 7           # sticker reach beyond the shapes' geometry (~6 px beyond the outline)
EYE = '#3A2418'       # chocolate icing
CHEEK = '#F58FA6'
SHADOW = '#5A3A22'

COOKIE, COOKIE_L = '#D69A5A', '#8A5226'      # baked gingerbread + its outline
COOKIE_D = '#B5743A'                         # darker bake (dog ears, bear ear insides)
ICING = '#FFFDF7'
PINK, PINK_L = '#F9B9CE', '#C9708F'
BUTTER, BUTTER_L = '#FFE7A3', '#C79A3A'
MINT = '#BFE8D8'
LILAC = '#DCCDF3'
CHOC = '#5A3A22'


def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def hexrgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def mix(a, b, t):
    ca, cb = hexrgb(a), hexrgb(b)
    return '#%02X%02X%02X' % tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))


# ---------- shapes: strings with an {A} slot for paint attributes ----------
def E(cx, cy, rx, ry, rot=0):
    tr = ' transform="rotate(%s %s %s)"' % (f(rot), f(cx), f(cy)) if rot else ''
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s"%s {A}/>' % (f(cx), f(cy), f(rx), f(ry), tr)


def C(cx, cy, r):
    return '<circle cx="%s" cy="%s" r="%s" {A}/>' % (f(cx), f(cy), f(r))


def P(d):
    return '<path d="%s" {A}/>' % ' '.join(d.split())


def paint(shape, attrs=''):
    return shape.replace(' {A}', (' ' + attrs) if attrs else '')


class Part:
    """A filled part (one or more shapes merged under one outline)."""

    def __init__(self, shapes, base, line, shade=None, details=(), hl=None, over=(), sticker=True, cel=True):
        self.shapes = shapes if isinstance(shapes, (list, tuple)) else [shapes]
        self.base, self.line = base, line
        self.shade = shade or mix(base, line, 0.3)
        self.details = list(details)   # svg drawn clipped to the part (icing, spots)
        self.hl = hl                   # (cx, cy, rx, ry[, rot]) soft highlight, clipped
        self.over = list(over)         # svg drawn after the part, unclipped (eyes, mouth ...)
        self.sticker = sticker
        self.cel = cel


def render_part(p, uid):
    out = []
    cid = 'c%d' % uid
    out.append('<clipPath id="%s">%s</clipPath>' % (cid, ''.join(paint(s) for s in p.shapes)))
    out.append('<g fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round">%s</g>'
               % (p.line, p.line, f(2 * OUTLINE), ''.join(paint(s) for s in p.shapes)))
    if p.cel:
        out.append('<g fill="%s">%s</g>' % (p.shade, ''.join(paint(s) for s in p.shapes)))
    inner = ['<g fill="%s"%s>%s</g>' % (p.base, ' transform="translate(-2.4 -2.8)"' if p.cel else '',
                                        ''.join(paint(s) for s in p.shapes))]
    inner.extend(p.details)
    if p.hl:
        cx, cy, rx, ry = p.hl[:4]
        rot = p.hl[4] if len(p.hl) > 4 else -25
        inner.append(paint(E(cx, cy, rx, ry, rot), 'fill="#FFFFFF" opacity=".28"'))
    out.append('<g clip-path="url(#%s)">%s</g>' % (cid, ''.join(inner)))
    out.extend(p.over)
    return '\n'.join(out)


def build(parts):
    sil = ''.join(paint(sh) for p in parts if p.sticker for sh in p.shapes)
    body = '\n'.join(render_part(p, i) for i, p in enumerate(parts))
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="128" height="128" viewBox="0 0 128 128">\n'
            '<defs><g id="sil">%s</g></defs>\n'
            '<use href="#sil" xlink:href="#sil" transform="translate(0 2.5)" fill="%s" stroke="%s" '
            'stroke-width="%d" stroke-linejoin="round" opacity=".2"/>\n'
            '<use href="#sil" xlink:href="#sil" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
            'stroke-linejoin="round"/>\n%s\n</svg>\n' % (sil, SHADOW, SHADOW, 2 * STICKER, 2 * STICKER, body))


# ---------- paint helpers ----------
def stroke_path(d, col, w, op=1):
    return paint(P(d), 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"%s'
                 % (col, f(w), (' opacity="%s"' % f(op)) if op != 1 else ''))


def fill_path(d, col, op=1):
    return paint(P(d), 'fill="%s"%s' % (col, (' opacity="%s"' % f(op)) if op != 1 else ''))


def fill(shape, col, op=1, extra=''):
    return paint(shape, 'fill="%s"%s%s' % (col, (' opacity="%s"' % f(op)) if op != 1 else '', extra))


def piped(shape, col=ICING, w=2.6, dash=None):
    """Royal-icing line (no fill) along `shape`."""
    return paint(shape, 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"%s'
                 % (col, f(w), (' stroke-dasharray="%s"' % dash) if dash else ''))


def eye(cx, cy, s=1.0):
    return (fill(E(cx, cy, 5.2 * s, 6.2 * s), EYE) +
            fill(C(cx - 1.6 * s, cy - 2.3 * s, 2.1 * s), '#FFFFFF') +
            fill(C(cx + 1.8 * s, cy + 2.3 * s, 0.95 * s), '#FFFFFF'))


def eyes(x1, x2, y, s=1.3):
    return [eye(x1, y, s), eye(x2, y, s)]


def cheeks(x1, x2, y, col=CHEEK, r=5.6):
    return [fill(E(x1, y, r, r * .64), col, .85), fill(E(x2, y, r, r * .64), col, .85)]


def smile(x1, y1, x2, y2, depth, col, w=2.2):
    mx = (x1 + x2) / 2
    return stroke_path('M%s %s Q%s %s %s %s' % (f(x1), f(y1), f(mx), f((y1 + y2) / 2 + depth), f(x2), f(y2)), col, w)


def wmouth(cx, cy, col, w=5.0, sw=2.2):
    return stroke_path('M%s %s Q%s %s %s %s Q%s %s %s %s' % (
        f(cx - w), f(cy), f(cx - w / 2), f(cy + 4), f(cx), f(cy), f(cx + w / 2), f(cy + 4), f(cx + w), f(cy)), col, sw)


def icing_ring(cx, cy, rx, ry, inset=6, dash=None):
    return piped(E(cx, cy, rx - inset, ry - inset), ICING, 2.6, dash)


# =====================================================================================
# Head portraits centred near (64, 66); outer silhouette inside x/y ~9..119 so the sticker border fits.

def bunny():
    ears = []
    for cx, rot in ((47, -10), (81, 10)):
        ears.append(Part(E(cx, 34, 11.5, 26, rot), COOKIE, COOKIE_L, hl=(cx - 4, 22, 3, 8, rot),
                         details=[fill(E(cx, 37, 5.6, 18, rot), PINK)]))
    face = eyes(51, 77, 72, 1.25)
    face += cheeks(38, 90, 88)
    face += [fill_path('M59 82 Q64 79 69 82 Q66 87 64 87 Q62 87 59 82 Z', '#EE7F9E'),
             stroke_path('M64 87 L64 92', CHOC, 2),
             wmouth(64, 92, CHOC, 5.5),
             fill_path('M60.5 94 L60.5 100 Q64 101.5 67.5 100 L67.5 94 Q64 95.5 60.5 94 Z', ICING),
             stroke_path('M64 95 L64 100.5', '#D8C9B4', 1)]
    head = Part(E(64, 82, 37, 31), COOKIE, COOKIE_L, hl=(44, 66, 11, 6),
                details=[icing_ring(64, 82, 37, 31), fill(C(64, 58, 2.2), ICING), fill(C(57, 59.5, 1.8), ICING),
                         fill(C(71, 59.5, 1.8), ICING)], over=face)
    return ears + [head]


def bear():
    ears = [Part(C(cx, 34, 15), COOKIE, COOKIE_L, details=[fill(C(cx, 35, 8), COOKIE_D), piped(C(cx, 35, 8.2), ICING, 2.2)])
            for cx in (31, 97)]
    face = eyes(48, 80, 62, 1.3)
    face += cheeks(34, 94, 80)
    mz = [fill(E(64, 82, 19, 15), ICING),
          fill_path('M55 75 Q64 70 73 75 Q72 83 64 84 Q56 83 55 75 Z', CHOC),
          fill(E(60, 75, 3.4, 1.8, -15), '#FFFFFF', .55),
          stroke_path('M64 84 L64 89', CHOC, 2.2), smile(56, 88, 72, 88, 5, CHOC, 2.4)]
    head = Part(E(64, 70, 44, 40), COOKIE, COOKIE_L, hl=(42, 46, 13, 7),
                details=[icing_ring(64, 70, 44, 40, 6.5, '0.1 6.2')], over=face + mz)
    return ears + [head]


def cat():
    ears = [Part(P('M26 52 L22 14 Q24 10 28 12 L58 34 Z'), COOKIE, COOKIE_L,
                 details=[fill_path('M30 42 L28 22 L46 35 Z', LILAC)]),
            Part(P('M102 52 L106 14 Q104 10 100 12 L70 34 Z'), COOKIE, COOKIE_L,
                 details=[fill_path('M98 42 L100 22 L82 35 Z', LILAC)])]
    face = eyes(47, 81, 64, 1.35)
    face += cheeks(34, 94, 82)
    face += [fill_path('M58 76 L70 76 Q66 82 64 82 Q62 82 58 76 Z', '#EE7F9E'),
             wmouth(64, 84, CHOC, 6)]
    wh = ICING
    face += [stroke_path('M30 80 L10 76', wh, 2.6), stroke_path('M30 87 L11 91', wh, 2.6),
             stroke_path('M98 80 L118 76', wh, 2.6), stroke_path('M98 87 L117 91', wh, 2.6)]
    head = Part(E(64, 72, 42, 36), COOKIE, COOKIE_L, hl=(42, 52, 12, 6),
                details=[icing_ring(64, 72, 42, 36, 6),
                         stroke_path('M56 40 L60 46 M64 38 L64 46 M72 40 L68 46', ICING, 2.4)],
                over=face)
    return ears + [head]


def dog():
    ears = [Part(P('M34 34 C18 30 8 46 12 70 C14 84 22 92 30 86 C36 76 40 52 42 40 Z'), COOKIE_D, COOKIE_L,
                 hl=(20, 52, 3, 10, 10), details=[piped(P('M32 42 C22 42 18 56 20 72'), ICING, 2.2, '0.1 5')]),
            Part(P('M94 34 C110 30 120 46 116 70 C114 84 106 92 98 86 C92 76 88 52 86 40 Z'), COOKIE_D, COOKIE_L,
                 details=[piped(P('M96 42 C106 42 110 56 108 72'), ICING, 2.2, '0.1 5')])]
    face = eyes(50, 78, 60, 1.3)
    face += cheeks(38, 90, 82)
    face += [fill(E(64, 82, 16, 13), ICING),
             fill(E(64, 75, 8, 5.6), CHOC), fill(E(61.5, 73.5, 2.6, 1.4, -10), '#FFFFFF', .55),
             stroke_path('M64 80 L64 86', CHOC, 2.2), wmouth(64, 86, CHOC, 6),
             fill_path('M60 89 Q60 99 64 99 Q68 99 68 89 Z', '#F17E98'), stroke_path('M64 90 L64 96', '#C9557A', 1.2)]
    head = Part(E(64, 68, 34, 37), COOKIE, COOKIE_L, hl=(48, 44, 10, 6),
                details=[fill(E(78, 56, 12, 11, 15), COOKIE_D), icing_ring(64, 68, 34, 37, 5.5)], over=face)
    return [head] + ears


def duck():
    tuft = Part([E(58, 20, 5, 11, -25), E(68, 18, 5, 12, 15)], BUTTER, BUTTER_L, cel=False)
    face = eyes(48, 80, 56, 1.35)
    face += cheeks(32, 96, 76)
    head = Part(C(64, 64, 44), BUTTER, BUTTER_L, hl=(42, 40, 13, 7),
                details=[icing_ring(64, 64, 44, 44, 6)], over=face)
    bill = Part(P('M36 78 C36 68 92 68 92 78 C92 90 78 96 64 96 C50 96 36 90 36 78 Z'), '#FFAE57', '#C26A1C',
                hl=(52, 74, 9, 3, -5),
                over=[stroke_path('M42 82 Q64 88 86 82', '#C26A1C', 2.2),
                      fill(E(56, 75, 2.2, 1.4), '#C26A1C'), fill(E(72, 75, 2.2, 1.4), '#C26A1C')])
    return [tuft, head, bill]


def pig():
    ears = [Part(P('M27 44 C27 26 42 18 56 30 C48 36 40 46 33 60 C28 56 26 50 27 44 Z'), PINK, PINK_L,
                 hl=(34, 32, 3, 7, 30), details=[fill_path('M33 42 C35 32 42 28 48 32 C42 38 38 44 34 50 Z', mix(PINK, PINK_L, .3))]),
            Part(P('M101 44 C101 26 86 18 72 30 C80 36 88 46 95 60 C100 56 102 50 101 44 Z'), PINK, PINK_L,
                 details=[fill_path('M95 42 C93 32 86 28 80 32 C86 38 90 44 94 50 Z', mix(PINK, PINK_L, .3))])]
    face = eyes(46, 82, 58, 1.3)
    face += cheeks(30, 98, 80, '#F07A98', 6.2)
    face += [smile(52, 98, 76, 98, 5, '#A8506F', 2.4)]
    head = Part(E(64, 70, 46, 40), PINK, PINK_L, hl=(40, 46, 13, 7),
                details=[icing_ring(64, 70, 46, 40, 6, '0.1 6.4')], over=face)
    snout = Part(E(64, 82, 18, 13), '#F59AB7', PINK_L, hl=(56, 76, 6, 3, -10),
                 over=[fill(E(57.5, 82, 3.6, 5), '#A8506F'), fill(E(70.5, 82, 3.6, 5), '#A8506F')])
    return [head] + ears + [snout]


def cow():
    horns = [Part(P('M36 36 C26 30 20 18 24 10 C30 14 36 22 46 28 Z'), '#FFF1CF', '#B79A62', cel=False),
             Part(P('M92 36 C102 30 108 18 104 10 C98 14 92 22 82 28 Z'), '#FFF1CF', '#B79A62', cel=False)]
    ears = [Part(E(23, 52, 11, 6.5, -20), ICING, '#8A6A4A', details=[fill(E(24, 52, 6, 3.2, -20), PINK)]),
            Part(E(105, 52, 11, 6.5, 20), ICING, '#8A6A4A', details=[fill(E(104, 52, 6, 3.2, 20), PINK)])]
    face = eyes(48, 80, 54, 1.25)
    face += cheeks(34, 94, 72)
    head = Part(E(64, 64, 38, 40), ICING, '#8A6A4A', shade='#EADFCF', hl=(46, 40, 11, 6),
                details=[fill_path('M26 40 C34 30 48 34 46 46 C44 58 30 60 24 52 Z', COOKIE),
                         fill_path('M80 26 C90 22 98 30 96 38 C92 44 82 42 80 36 Z', COOKIE),
                         fill(C(92, 64, 5), COOKIE)], over=face)
    muzzle = Part(E(64, 92, 30, 18), PINK, PINK_L, hl=(48, 84, 8, 3, -5),
                  over=[fill(E(53, 90, 4, 5.4), '#A8506F'), fill(E(75, 90, 4, 5.4), '#A8506F'),
                        smile(56, 101, 72, 101, 3.5, '#A8506F', 2.2)])
    return horns + ears + [head, muzzle]


def curl(x, y, deg):
    a = math.radians(deg)
    ux, uy = math.cos(a), math.sin(a)
    # a small 'c' curl of piped icing facing outwards
    x1, y1 = x - 5 * uy - 2 * ux, y + 5 * ux - 2 * uy
    x2, y2 = x + 5 * uy - 2 * ux, y - 5 * ux - 2 * uy
    return stroke_path('M%s %s A5.4 5.4 0 1 1 %s %s' % (f(x1), f(y1), f(x2), f(y2)), '#DCD2C2', 2.2)


def sheep():
    wool = [C(64, 64, 36)]
    for i in range(11):
        a = math.radians(-90 + i * 360 / 11)
        wool.append(C(64 + 40 * math.cos(a), 62 + 40 * math.sin(a), 13.5))
    woolp = Part(wool, ICING, '#B8AE9E', shade='#E9E2D6', hl=(36, 30, 12, 6),
                 details=[curl(64 + 40 * math.cos(math.radians(-90 + i * 360 / 11)),
                               62 + 40 * math.sin(math.radians(-90 + i * 360 / 11)), -90 + i * 360 / 11)
                          for i in range(11)])
    ears = [Part(E(26, 62, 12, 6.5, 20), COOKIE, COOKIE_L, sticker=False, details=[fill(E(26, 62, 6, 3, 20), PINK)]),
            Part(E(102, 62, 12, 6.5, -20), COOKIE, COOKIE_L, sticker=False, details=[fill(E(102, 62, 6, 3, -20), PINK)])]
    face = eyes(53, 75, 66, 1.15)
    face += cheeks(44, 84, 82, CHEEK, 4.8)
    face += [fill_path('M59 82 L69 82 Q66 87 64 87 Q62 87 59 82 Z', CHOC), smile(57, 90, 71, 90, 4, CHOC, 2.2)]
    head = Part(E(64, 72, 22, 26), COOKIE, COOKIE_L, hl=(54, 56, 6, 4), over=face)
    topknot = Part([C(56, 46, 8), C(64, 42, 9), C(72, 46, 8)], ICING, '#B8AE9E', shade='#E9E2D6', sticker=False)
    return [woolp] + ears + [head, topknot]


ANIMALS = {'bunny': bunny, 'bear': bear, 'cat': cat, 'dog': dog, 'duck': duck, 'pig': pig, 'cow': cow, 'sheep': sheep}
OLD = ['elephant', 'frog', 'hippo', 'lion', 'monkey', 'parrot', 'snake', 'tiger']


def main():
    os.makedirs(OUT, exist_ok=True)
    for fn_ in os.listdir(OUT):
        nm = fn_[:-4] if fn_.endswith('.svg') else ''
        if nm.endswith('_wave') or nm in ['animal_' + o for o in OLD]:
            os.remove(os.path.join(OUT, fn_))
    for name, fn in ANIMALS.items():
        with open(os.path.join(OUT, 'animal_%s.svg' % name), 'w') as fh:
            fh.write(build(fn()))
    print('wrote %d stickers to %s' % (len(ANIMALS), OUT))


if __name__ == '__main__':
    main()
