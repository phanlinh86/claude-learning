#!/usr/bin/env python3
"""Pip's Reef Tower - SEA-ANIMAL stickers for the shell blocks (character artist B, DESIGN 3 / 4.2).

Writes game/assets/default/items/animal_<name>.svg for name in
fish, crab, turtle, whale, seahorse, dolphin, jellyfish, shrimp  (8 files) and removes any other
animal_*.svg left over from the cake game (bunny, bear, ...).

Each sticker is a friendly, ORIGINAL flat-cartoon sea animal with a thick white die-cut sticker border and a
faint drop shadow, big dark eyes with white catch-lights and rosy cheeks.  Every animal reads by SILHOUETTE
alone at 60 px (checked in the grey-scale row of docs/art/animals_sheet.png):
  fish      round body, forked tail, top fin           (soft mint-teal, peach fins - no stripes, not a clownfish)
  crab      front view, two BIG raised claws, eye stalks (soft coral)
  turtle    side view, domed shell with plates, head out (sage shell, pale lime skin)
  whale     big round body, tail flukes up, water spout  (periwinkle, cream belly)
  seahorse  upright, tube snout, curly tail              (warm apricot)
  dolphin   long body, beak, tall dorsal fin, flukes     (grey-blue, white belly)
  jellyfish scalloped bell + wavy tentacles              (lilac-pink)
  shrimp    curled C of segments, fan tail, long antennae (salmon pink)
Main colours are soft tints, never a pure answer colour (DESIGN 3 palette).

viewBox 0 0 128 128 (width/height = viewBox). Built from simple primitives:
  * each part = outline (stroke UNDER the fill -> one merged outline per part) in a darker tone of the fill +
    one-step cel shade (base shifted up-left, clipped) + one soft highlight upper-left;
  * thin bendy parts (tentacles, tails, antennae) are filled 'ribbons' (offset polygons) so they merge too.
No <text>, fonts, scripts, filters or external refs.

Usage: python3 tools/art_animals.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

OUTLINE = 2.6         # visible outline width (px at 128; reads at 60 px)
STICKER = 7           # sticker reach beyond the shapes' geometry
EYE = '#2F2A3A'
CHEEK = '#F58C8C'
SHADOW = '#1F4E5A'    # deep teal drop shadow (under water)
MOUTH = '#5A2E3A'


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


def ribbon(pts, cap=True):
    """Filled tapering ribbon along pts = [(x, y, width), ...]; round end caps. Returns a list of shapes."""
    L, R = [], []
    n = len(pts)
    for i, (x, y, w) in enumerate(pts):
        xa, ya = pts[max(0, i - 1)][:2]
        xb, yb = pts[min(n - 1, i + 1)][:2]
        dx, dy = xb - xa, yb - ya
        d = math.hypot(dx, dy) or 1
        nx, ny = -dy / d, dx / d
        L.append((x + nx * w / 2, y + ny * w / 2))
        R.append((x - nx * w / 2, y - ny * w / 2))
    poly = L + R[::-1]
    d = 'M' + ' L'.join('%s %s' % (f(a), f(b)) for a, b in poly) + ' Z'
    out = [P(d)]
    if cap:
        out.append(C(pts[0][0], pts[0][1], pts[0][2] / 2))
        out.append(C(pts[-1][0], pts[-1][1], pts[-1][2] / 2))
    return out


def wave_pts(x0, y0, x1, y1, w0, w1, amp, waves, n=18, phase=0.0):
    out = []
    dx, dy = x1 - x0, y1 - y0
    d = math.hypot(dx, dy) or 1
    nx, ny = -dy / d, dx / d
    for i in range(n + 1):
        t = i / n
        s = amp * math.sin(t * waves * 2 * math.pi + phase) * (0.4 + 0.6 * t)
        out.append((x0 + dx * t + nx * s, y0 + dy * t + ny * s, w0 + (w1 - w0) * t))
    return out


class Part:
    """A filled part (one or more shapes merged under one outline)."""

    def __init__(self, shapes, base, line, shade=None, details=(), hl=None, over=(), sticker=True, cel=True):
        self.shapes = shapes if isinstance(shapes, (list, tuple)) else [shapes]
        self.base, self.line = base, line
        self.shade = shade or mix(base, line, 0.3)
        self.details = list(details)   # svg drawn clipped to the part (patterns, belly)
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
        inner.append(paint(E(cx, cy, rx, ry, rot), 'fill="#FFFFFF" opacity=".34"'))
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
            'stroke-width="%d" stroke-linejoin="round" opacity=".22"/>\n'
            '<use href="#sil" xlink:href="#sil" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
            'stroke-linejoin="round"/>\n%s\n</svg>\n' % (sil, SHADOW, SHADOW, 2 * STICKER, 2 * STICKER, body))


# ---------- paint helpers ----------
def stroke_path(d, col, w, op=1):
    return paint(P(d), 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"%s'
                 % (col, f(w), (' opacity="%s"' % f(op)) if op != 1 else ''))


def fill_path(d, col, op=1):
    return paint(P(d), 'fill="%s"%s' % (col, (' opacity="%s"' % f(op)) if op != 1 else ''))


def fill(shape, col, op=1):
    return paint(shape, 'fill="%s"%s' % (col, (' opacity="%s"' % f(op)) if op != 1 else ''))


def eye(cx, cy, s=1.0):
    return (fill(E(cx, cy, 5.0 * s, 5.8 * s), EYE) +
            fill(C(cx - 1.6 * s, cy - 2.1 * s, 2.0 * s), '#FFFFFF') +
            fill(C(cx + 1.7 * s, cy + 2.2 * s, 0.9 * s), '#FFFFFF'))


def cheek(x, y, r=5.0):
    return fill(E(x, y, r, r * .62), CHEEK, .8)


def smile(x1, y1, x2, y2, depth, col=MOUTH, w=2.3):
    mx = (x1 + x2) / 2
    return stroke_path('M%s %s Q%s %s %s %s' % (f(x1), f(y1), f(mx), f((y1 + y2) / 2 + depth), f(x2), f(y2)), col, w)


def bubble(x, y, r):
    return [paint(C(x, y, r), 'fill="#E9FAFF" stroke="#7FBFD0" stroke-width="1.8"'),
            fill(E(x - r * .35, y - r * .35, r * .3, r * .22, -30), '#FFFFFF')]


# =====================================================================================
# Bodies centred near (64, 64); outer silhouette inside ~8..120 so the sticker border fits.

def fish():
    BODY, BODY_L = '#7FD3C4', '#3C8E84'
    FIN, FIN_L = '#FFC29E', '#C27650'
    tail = Part(P('M40 64 C30 52 20 40 12 40 C10 50 14 58 20 64 C14 70 10 78 12 88 C20 88 30 76 40 64 Z'),
                FIN, FIN_L, hl=(18, 48, 3, 7, 20),
                details=[stroke_path('M16 48 Q24 56 30 62 M16 80 Q24 72 30 66', mix(FIN, FIN_L, .45), 2)])
    top = Part(P('M50 40 C54 24 74 18 88 30 C82 32 76 36 72 40 Z'), FIN, FIN_L,
               details=[stroke_path('M60 34 Q66 28 74 26', mix(FIN, FIN_L, .45), 1.8)])
    bot = Part(P('M60 88 C60 100 70 104 78 98 C74 94 72 90 72 86 Z'), FIN, FIN_L)
    face = [eye(88, 58, 1.55), cheek(94, 74, 5.2), smile(96, 80, 108, 74, 3.5)]
    body = Part(E(72, 64, 40, 31), BODY, BODY_L, hl=(56, 44, 14, 6),
                details=[fill(E(78, 82, 30, 12), mix(BODY, '#FFFFFF', .55)),           # pale belly
                         stroke_path('M52 50 Q58 60 52 70 M62 46 Q69 58 62 72', mix(BODY, BODY_L, .4), 2.2, .8)],
                over=face)
    side = Part(P('M58 70 C64 64 74 66 72 78 C66 82 58 78 58 70 Z'), FIN, FIN_L, cel=False,
                details=[stroke_path('M62 72 L68 76', mix(FIN, FIN_L, .45), 1.6)])
    return [tail, top, bot, body, side]


def crab():
    B, BL = '#F7957F', '#B9503F'
    LIGHT = mix(B, '#FFFFFF', .5)
    legs = []
    for sx in (-1, 1):
        for i, (lx, ly) in enumerate(((30, 84), (28, 94), (34, 102))):
            x0 = 64 + sx * (64 - lx - 12)
            legs.append(Part(ribbon([(x0, ly - 4, 7), (64 + sx * (64 - lx), ly, 6.5), (64 + sx * (64 - lx + 4), ly + 8, 5)]),
                             B, BL, cel=False))
    arms = [Part(ribbon([(64 + sx * 26, 72, 9), (64 + sx * 36, 60, 8.5), (64 + sx * 40, 50, 8)]), B, BL, cel=False)
            for sx in (-1, 1)]
    claws = []
    for sx in (-1, 1):
        cx = 64 + sx * 40
        rot = -sx * 25
        upper = P('M%s 50 C%s 34 %s 22 %s 18 C%s 22 %s 30 %s 40 Z' % (
            f(cx - sx * 12), f(cx - sx * 16), f(cx - sx * 4), f(cx + sx * 8), f(cx + sx * 16), f(cx + sx * 16), f(cx + sx * 4)))
        claws.append(Part([E(cx, 40, 15, 13, rot), P('M%s 34 C%s 22 %s 14 %s 10 C%s 18 %s 24 %s 34 Z' % (
            f(cx - sx * 4), f(cx - sx * 4), f(cx + sx * 4), f(cx + sx * 12), f(cx + sx * 16), f(cx + sx * 16), f(cx + sx * 10)))],
            B, BL, hl=(cx - 6, 36, 5, 3, rot),
            over=[stroke_path('M%s 34 Q%s 30 %s 26' % (f(cx - sx * 2), f(cx + sx * 4), f(cx + sx * 9)), BL, 2.4)]))
        del upper
    stalks = [Part(ribbon([(64 + sx * 12, 60, 5), (64 + sx * 15, 46, 4.5)], cap=False), B, BL, cel=False, sticker=True)
              for sx in (-1, 1)]
    eyeballs = [Part(C(64 + sx * 15, 42, 8.5), '#FFFFFF', BL, cel=False,
                     over=[eye(64 + sx * 15 + 1, 43, 1.08)]) for sx in (-1, 1)]
    face = [cheek(44, 80, 5), cheek(84, 80, 5), smile(56, 80, 72, 80, 6)]
    body = Part(P('M26 76 C26 58 44 54 64 54 C84 54 102 58 102 76 C102 92 86 98 64 98 C42 98 26 92 26 76 Z'),
                B, BL, hl=(46, 62, 14, 5, -8),
                details=[fill(E(64, 92, 26, 7), LIGHT, .7),
                         fill(C(40, 66, 2.4), LIGHT), fill(C(88, 66, 2.4), LIGHT), fill(C(64, 60, 2.2), LIGHT)],
                over=face)
    return legs + arms + claws + stalks + [body] + eyeballs


def turtle():
    SH, SHL = '#8FC79B', '#3F7E52'
    SK, SKL = '#D6E9A6', '#7E9A48'
    PLATE = '#B7DDB8'
    flip_b = Part(E(30, 88, 13, 7, -25), SK, SKL, cel=False)
    flip_f = Part(E(86, 92, 15, 7.5, 28), SK, SKL)
    tail = Part(P('M16 78 L8 82 L18 86 Z'), SK, SKL, cel=False)
    head = Part([E(102, 60, 16, 14.5), E(92, 72, 9, 8)], SK, SKL, hl=(96, 52, 6, 3, -15),
                over=[eye(106, 57, 1.35), cheek(110, 68, 4.4), smile(103, 70, 116, 66, 3.2)])
    plates = [
        P('M52 44 L68 44 L74 58 L64 70 L52 70 L44 58 Z'),
    ]
    rim = Part(P('M14 80 C14 74 20 72 26 72 L94 72 C100 72 104 76 102 82 C100 86 96 88 90 88 L28 88 C20 88 14 86 14 80 Z'),
               mix(SH, '#FFFFFF', .35), SHL, cel=False,
               details=[stroke_path('M30 80 L32 88 M46 80 L47 88 M62 80 L62 88 M78 80 L77 88', SHL, 1.8, .5)])
    shell = Part(P('M18 78 C18 46 38 30 58 30 C80 30 100 46 100 78 Z'), SH, SHL, hl=(40, 42, 13, 6),
                 details=[fill(plates[0], PLATE),
                          paint(plates[0], 'fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"' % SHL),
                          fill_path('M24 74 C26 60 32 52 40 48 L44 58 L52 70 L46 78 Z', PLATE, .9),
                          fill_path('M94 74 C92 60 86 52 78 48 L74 58 L64 70 L72 78 Z', PLATE, .9),
                          stroke_path('M40 48 L44 58 L52 70 L46 78 M78 48 L74 58 L64 70 L72 78 M52 70 L50 78 M64 70 L66 78 M58 30 L60 44',
                                      SHL, 2.2, .85)])
    return [tail, flip_b, rim, shell, head, flip_f]


def whale():
    B, BL = '#93A6DC', '#4E5E9E'
    BELLY = '#E4E9FA'
    W, WL = '#D7F4FB', '#5FA9BF'
    spout = Part(ribbon([(78, 40, 6), (78, 30, 5.5), (78, 22, 5)], cap=False) +
                 [C(78, 18, 6), C(68, 18, 6), C(88, 18, 6), C(62, 24, 4.5), C(94, 24, 4.5), C(72, 12, 5), C(84, 12, 5)],
                 W, WL, cel=False,
                 details=[fill(C(70, 14, 1.8), '#FFFFFF'), fill(C(84, 10, 1.6), '#FFFFFF')])
    flukes = Part(P('M34 70 C26 62 22 52 26 40 C18 40 10 44 8 50 C14 50 18 54 20 58 C14 58 8 62 6 68 '
                    'C14 66 22 66 30 76 Z'), B, BL, hl=(14, 50, 3, 5, 20))
    face = [eye(94, 66, 1.45), cheek(100, 80, 5.4), smile(96, 86, 112, 80, 3.5)]
    body = Part(P('M24 74 C24 52 50 40 76 40 C104 40 120 56 120 74 C120 92 102 102 76 102 C52 102 34 92 24 74 Z'),
                B, BL, hl=(64, 50, 16, 6, -10),
                details=[fill_path('M30 84 C46 98 64 104 84 102 C102 100 116 92 120 80 L120 108 L30 108 Z', BELLY),
                         stroke_path('M62 94 Q80 100 100 94 M66 99 Q84 105 104 98', mix(BELLY, BL, .35), 1.8)],
                over=face)
    fin = Part(P('M60 86 C56 98 48 102 42 102 C46 96 48 90 50 84 Z'), B, BL, cel=False)
    return [spout, flukes, body, fin]


def seahorse():
    B, BL = '#F6C373', '#B47A26'
    BELLY = '#FFE7B8'
    FIN, FINL = '#F9D9A8', '#B47A26'
    # curly tail: a tapering spiral ribbon from under the belly, curling forward (to the right)
    pts = []
    for i in range(29):
        t = i / 28
        if t < 0.45:
            u = t / 0.45
            x, y = 58 - 6 * u, 84 + 20 * u
        else:
            u = (t - 0.45) / 0.55
            a = math.pi + u * 1.55 * math.pi              # spiral clockwise from the left
            r = 10 * (1 - 0.62 * u)
            x, y = 62 + r * math.cos(a) , 104 - r * math.sin(a) * -1
            x, y = 62 + r * math.cos(a), 104 + r * math.sin(a)
        pts.append((x, y, 13 - 8 * t))
    tail = Part(ribbon(pts), B, BL, cel=False,
                details=[stroke_path('M50 92 L58 92 M48 100 L56 101', mix(B, BL, .4), 1.8, .8)])
    fin = Part(P('M40 52 C28 50 24 62 28 72 C34 70 38 66 42 62 Z'), FIN, FINL, cel=False,
               details=[stroke_path('M30 58 L40 58 M29 64 L40 62', mix(FIN, FINL, .45), 1.6)])
    crest = Part([E(52, 16, 4, 6, -20), E(60, 12, 4, 6, 0), E(46, 24, 3.6, 5, -40)], B, BL, cel=False)
    snout = Part(P('M78 30 L96 32 C99 30 104 30 104 35 C104 40 99 40 96 38 L80 41 Z'), B, BL, cel=False,
                 details=[fill(E(101, 35, 1.4, 2.4), mix(B, BL, .55))])
    body = Part([P('M50 40 C38 50 38 72 46 82 C52 90 62 90 68 82 C76 70 74 52 66 42 Z'),
                 E(66, 30, 18, 16, 10)], B, BL, hl=(56, 22, 8, 4),
                details=[fill_path('M62 48 C72 56 72 72 64 84 C58 82 56 70 58 56 Z', BELLY),
                         stroke_path('M58 56 L68 55 M58 64 L70 64 M58 72 L68 73 M60 79 L66 80', mix(BELLY, BL, .45), 1.6)],
                over=[eye(72, 28, 1.4), cheek(78, 40, 4.4), smile(84, 43, 90, 42, 1.8, MOUTH, 2)])
    return [tail, fin, crest, snout, body]


def dolphin():
    B, BL = '#A9C6DE', '#56789A'
    BELLY = '#F2F7FB'
    flukes = Part(P('M30 72 C22 66 14 56 6 54 C6 62 12 70 18 74 C12 80 8 88 8 96 C16 92 24 84 32 78 Z'),
                  B, BL, hl=(12, 60, 3, 5, 30))
    dorsal = Part(P('M54 52 C54 38 62 28 76 26 C70 34 68 44 70 52 Z'), B, BL, cel=False)
    flipper = Part(P('M64 76 C62 88 56 96 46 98 C50 90 52 82 54 76 Z'), B, BL, cel=False)
    face = [eye(90, 58, 1.35), cheek(94, 70, 4.6)]
    body = Part(P('M22 76 C32 58 56 48 80 48 C92 48 100 52 104 58 C110 58 118 59 121 62 C122 65 120 68 116 68 '
                  'L104 69 C96 80 76 86 54 84 C40 83 30 80 22 76 Z'), B, BL, hl=(62, 54, 16, 4, -8),
                details=[fill_path('M34 80 C52 74 76 72 98 68 L116 68 L116 90 L34 90 Z', BELLY),
                         stroke_path('M104 66 Q110 70 118 66', BL, 2.2)],
                over=face + [fill(C(78, 52, 2.2), mix(B, '#FFFFFF', .5))])
    return [flukes, dorsal, flipper, body]


def jellyfish():
    B, BL = '#EDB7E6', '#A2609E'
    T, TL = '#F4CDEF', '#A2609E'
    tents = []
    for i, (x0, ph) in enumerate(((40, 0.0), (56, 1.6), (72, 0.6), (88, 2.2))):
        tents.append(Part(ribbon(wave_pts(x0, 66, x0 + (i - 1.5) * 4, 112 + (i % 2) * 6, 6.5, 4.0, 4.0, 1.5, phase=ph)),
                          T, TL, cel=False))
    arms = [Part(ribbon(wave_pts(x0, 64, x0 + dx, 98, 9, 6, 3.0, 2.0, phase=ph)), mix(B, '#FFFFFF', .3), TL, cel=False)
            for x0, dx, ph in ((60, -4, 0.8), (68, 4, 2.6))]
    bell = Part(P('M24 62 C22 32 42 18 64 18 C86 18 106 32 104 62 C104 68 98 70 94 66 C90 72 82 72 79 66 '
                  'C75 72 67 72 64 66 C61 72 53 72 49 66 C46 72 38 72 34 66 C30 70 24 68 24 62 Z'),
                B, BL, hl=(46, 30, 14, 6, -20),
                details=[fill(E(64, 60, 34, 6), mix(B, '#FFFFFF', .4), .8),
                         fill(C(86, 32, 3), '#FFFFFF', .5), fill(C(92, 42, 2), '#FFFFFF', .5)],
                over=[eye(52, 44, 1.35), eye(76, 44, 1.35), cheek(42, 54, 4.8), cheek(86, 54, 4.8),
                      smile(58, 52, 70, 52, 5)])
    return tents + arms + [bell]


def shrimp():
    B, BL = '#FFA898', '#C2564A'
    STRIPE = '#FFD7CC'
    # antennae (thin ribbons, part of the sticker) from the head out to the upper right / top
    ant = [Part(ribbon([(84, 32, 3.2), (92, 20, 2.8), (104, 12, 2.4), (116, 12, 2.2)]), B, BL, cel=False),
           Part(ribbon([(80, 30, 3.2), (80, 18, 2.8), (72, 10, 2.4), (60, 8, 2.2)]), B, BL, cel=False)]
    # curled C body: segments along an arc centred (58, 66), from the head (upper right) round the left to the tail
    segs = []
    n = 6
    for i in range(n):
        a = math.radians(-60 - i * 40)                  # -60 (upper right) .. -260 (lower right) going left
        r = 26
        x, y = 58 + r * math.cos(a), 66 + r * math.sin(a)
        rr = 15 - i * 1.5
        segs.append(C(x, y, rr))
    body = Part(segs, B, BL, hl=(46, 44, 10, 5, -40),
                details=[stroke_path('M%s %s L%s %s' % (
                    f(58 + 13 * math.cos(math.radians(-80 - i * 40))), f(66 + 13 * math.sin(math.radians(-80 - i * 40))),
                    f(58 + 40 * math.cos(math.radians(-80 - i * 40))), f(66 + 40 * math.sin(math.radians(-80 - i * 40)))),
                    STRIPE, 2.6, .9) for i in range(5)])
    rx, ry = 58 + 26 * math.cos(math.radians(-275)), 66 + 26 * math.sin(math.radians(-275))   # tail root
    lobes = []
    for ang in (-25, 12, 50):
        a = math.radians(ang)
        lobes.append(E(rx + 10 * math.cos(a), ry + 10 * math.sin(a), 11, 5, ang))
    tail = Part(lobes + [C(rx, ry, 6)], B, BL, cel=False,
                details=[stroke_path('M%s %s L%s %s' % (f(rx), f(ry), f(rx + 16), f(ry + 3)), STRIPE, 1.6)])
    legs = [Part(ribbon([(58 + 14 * math.cos(math.radians(a)), 66 + 14 * math.sin(math.radians(a)), 3.4),
                         (58 + 6 * math.cos(math.radians(a)) + 4, 66 + 6 * math.sin(math.radians(a)), 3)]),
                 mix(B, BL, .2), BL, cel=False, sticker=False) for a in (-150, -190, -230)]
    head = Part(E(84, 44, 18, 15, 20), B, BL, hl=(78, 36, 6, 3, -10),
                over=[eye(88, 42, 1.4), cheek(96, 52, 4.4), smile(90, 54, 100, 50, 2.8, MOUTH, 2.1)])
    return ant + [tail, body] + legs + [head]


ANIMALS = {'fish': fish, 'crab': crab, 'turtle': turtle, 'whale': whale, 'seahorse': seahorse,
           'dolphin': dolphin, 'jellyfish': jellyfish, 'shrimp': shrimp}


def main():
    os.makedirs(OUT, exist_ok=True)
    keep = ['animal_%s.svg' % n for n in ANIMALS]
    for fn_ in os.listdir(OUT):
        if fn_.startswith('animal_') and fn_.endswith('.svg') and fn_ not in keep:
            os.remove(os.path.join(OUT, fn_))
    for name, fn in ANIMALS.items():
        with open(os.path.join(OUT, 'animal_%s.svg' % name), 'w') as fh:
            fh.write(build(fn()))
    print('wrote %d stickers to %s' % (len(ANIMALS), OUT))


if __name__ == '__main__':
    main()
