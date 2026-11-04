#!/usr/bin/env python3
"""Lulu's Jungle Tower - jungle-animal block stickers (character artist B).

Writes game/assets/default/items/animal_<name>.svg for name in
monkey, elephant, tiger, parrot, lion, frog, snake, hippo  (8 files) and removes the old farm
stickers (cat/dog/cow/pig/sheep/duck and every *_wave.svg) left over from the sister games.

Every sticker is a big friendly HEAD PORTRAIT (front view, a little shoulder/body where it helps
recognition) filling the 128 box, because it is printed on the face of a wooden block and must read at
60 px.  viewBox 0 0 128 128 (width/height = viewBox).  100 % original art from simple primitives:
  * each part = outline (stroke drawn UNDER the fill, so a group of shapes gets one merged outline) in a
    darker tone of the fill + shade fill + the base fill shifted up-left and clipped to the part (one-step
    cel shade) + one soft highlight upper-left;
  * a white sticker border (~6 px outside the outline) and a faint drop shadow (<use> of one merged
    silhouette);
  * big eyes with a white catch-light, rosy cheeks.
No <text>, fonts, scripts, filters or external refs.

Usage: python3 tools/art_animals.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

GROUND = 117          # y where paws/feet rest (sticker border reaches ~124, shadow ~127)
OUTLINE = 2.6         # visible outline width (px at 128; reads at 60 px)
STICKER = 7           # sticker reach beyond the shapes' geometry (~6 px beyond the outline)
EYE = '#2F2A3A'
CHEEK = '#F590A8'
SHADOW = '#26304F'


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


def CAP(x1, y1, x2, y2, w):
    """Capsule (rounded limb) from (x1,y1) to (x2,y2) of width w."""
    import math
    L = math.hypot(x2 - x1, y2 - y1)
    a = math.degrees(math.atan2(y2 - y1, x2 - x1))
    return ('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" transform="rotate(%s %s %s)" {A}/>'
            % (f(x1 - w / 2), f(y1 - w / 2), f(L + w), f(w), f(w / 2), f(a), f(x1), f(y1)))


def paint(shape, attrs=''):
    return shape.replace(' {A}', (' ' + attrs) if attrs else '')


class Part:
    """A filled body part (one or more shapes merged), or a stroked part (tail/whisker-like)."""

    def __init__(self, shapes, base, line, shade=None, details=(), hl=None, over=(), sticker=True,
                 stroke=None, cel=True):
        self.shapes = shapes if isinstance(shapes, (list, tuple)) else [shapes]
        self.base, self.line = base, line
        self.shade = shade or mix(base, line, 0.32)
        self.details = list(details)   # svg drawn clipped to the part (stripes, spots, patches)
        self.hl = hl                   # (cx, cy, rx, ry[, rot]) soft highlight, clipped
        self.over = list(over)         # svg drawn after the part, unclipped (eyes, mouth ...)
        self.sticker = sticker
        self.stroke = stroke           # width -> the shapes are open paths drawn as strokes
        self.cel = cel


def render_part(p, uid):
    out = []
    if p.stroke:
        w = p.stroke
        for s in p.shapes:
            out.append(paint(s, 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" '
                                'stroke-linejoin="round"' % (p.line, f(w + 2 * OUTLINE))))
        for s in p.shapes:
            out.append(paint(s, 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" '
                                'stroke-linejoin="round"' % (p.base, f(w))))
        out.extend(p.over)
        return '\n'.join(out)
    cid = 'c%d' % uid
    out.append('<clipPath id="%s">%s</clipPath>' % (cid, ''.join(paint(s) for s in p.shapes)))
    out.append('<g fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round">%s</g>'
               % (p.line, p.line, f(2 * OUTLINE), ''.join(paint(s) for s in p.shapes)))
    if p.cel:
        out.append('<g fill="%s">%s</g>' % (p.shade, ''.join(paint(s) for s in p.shapes)))
    inner = []
    inner.append('<g fill="%s"%s>%s</g>' % (p.base, ' transform="translate(-2.6 -3)"' if p.cel else '',
                                           ''.join(paint(s) for s in p.shapes)))
    inner.extend(p.details)
    if p.hl:
        cx, cy, rx, ry = p.hl[:4]
        rot = p.hl[4] if len(p.hl) > 4 else -25
        inner.append(paint(E(cx, cy, rx, ry, rot), 'fill="#FFFFFF" opacity=".26"'))
    out.append('<g clip-path="url(#%s)">%s</g>' % (cid, ''.join(inner)))
    out.extend(p.over)
    return '\n'.join(out)


def silhouette(parts):
    s = []
    for p in parts:
        if not p.sticker:
            continue
        for sh in p.shapes:
            if p.stroke:
                s.append(paint(sh, 'fill="none" stroke-width="%s" stroke-linecap="round"'
                                   % f(p.stroke + 2 * STICKER)))
            else:
                s.append(paint(sh))
    return ''.join(s)


def build(parts):
    sil = silhouette(parts)
    body = '\n'.join(render_part(p, i) for i, p in enumerate(parts))
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="128" height="128" viewBox="0 0 128 128">\n'
            '<defs><g id="sil">%s</g></defs>\n'
            '<use href="#sil" xlink:href="#sil" transform="translate(0 3)" fill="%s" stroke="%s" '
            'stroke-width="%d" stroke-linejoin="round" opacity=".18"/>\n'
            '<use href="#sil" xlink:href="#sil" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
            'stroke-linejoin="round"/>\n%s\n</svg>\n' % (sil, SHADOW, SHADOW, 2 * STICKER, 2 * STICKER, body))


# ---------- shared face bits ----------
def eye(cx, cy, s=1.0):
    return (paint(E(cx, cy, 5.4 * s, 6.6 * s), 'fill="%s"' % EYE) +
            paint(C(cx - 1.7 * s, cy - 2.4 * s, 2.2 * s), 'fill="#FFFFFF"') +
            paint(C(cx + 1.9 * s, cy + 2.4 * s, 1 * s), 'fill="#FFFFFF"'))


def eyes(x1, x2, y, s=1.0):
    return [eye(x1, y, s), eye(x2, y, s * 1.04)]


def cheeks(x1, x2, y, col=CHEEK, r=5.2):
    return [paint(E(x1, y, r, r * .62), 'fill="%s" opacity=".75"' % col),
            paint(E(x2, y, r * .85, r * .58), 'fill="%s" opacity=".75"' % col)]


def mouth_w(cx, cy, col, w=4.2):
    """Kitten/lion style 'w' mouth under the nose."""
    return paint(P('M%s %s Q%s %s %s %s Q%s %s %s %s' % (
        f(cx - w), f(cy), f(cx - w / 2), f(cy + 3.6), f(cx), f(cy), f(cx + w / 2), f(cy + 3.6), f(cx + w), f(cy))),
        'fill="none" stroke="%s" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' % col)


def smile(x1, y1, x2, y2, depth, col, w=1.8):
    mx = (x1 + x2) / 2
    return paint(P('M%s %s Q%s %s %s %s' % (f(x1), f(y1), f(mx), f((y1 + y2) / 2 + depth), f(x2), f(y2))),
                 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"' % (col, f(w)))


def line(x1, y1, x2, y2, col, w=1.5, op=1):
    return paint(P('M%s %s L%s %s' % (f(x1), f(y1), f(x2), f(y2))),
                 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"%s'
                 % (col, f(w), (' opacity="%s"' % f(op)) if op != 1 else ''))


def toes(x, y, col, n=2, gap=4.2):
    return [line(x + (i - (n - 1) / 2) * gap, y - 4, x + (i - (n - 1) / 2) * gap, y - 0.5, col, 1.4)
            for i in range(n)]


import math


def stroke_path(d, col, w, op=1, cap='round'):
    return paint(P(d), 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="%s" stroke-linejoin="round"%s'
                 % (col, f(w), cap, (' opacity="%s"' % f(op)) if op != 1 else ''))


def fill_path(d, col, op=1):
    return paint(P(d), 'fill="%s"%s' % (col, (' opacity="%s"' % f(op)) if op != 1 else ''))


def big_eyes(x1, x2, y, s=1.45):
    return [eye(x1, y, s), eye(x2, y, s)]


# =====================================================================================
# Every animal: a head portrait centred near (64, 62); the outer silhouette stays inside x/y 9..119 so the
# sticker border (+7) and the shadow fit the 128 box.

def monkey():
    B, L = '#9A6A48', '#5E3B22'          # same brown as Lulu's monkey friend (character artist A)
    FACE, FL = '#F3DDBF', '#B98C62'
    ear_l = Part(C(22, 62, 14), B, L, over=[paint(C(22, 62, 8), 'fill="%s"' % FACE)])
    ear_r = Part(C(106, 62, 14), B, L, over=[paint(C(106, 62, 8), 'fill="%s"' % FACE)])
    tuft = Part(P('M52 26 C50 14 58 9 64 15 C68 8 78 12 74 24 Z'), B, L, cel=False)
    face = big_eyes(51, 77, 55, 1.35)
    face += cheeks(38, 90, 76, '#F08C8C', 6)
    face += [paint(E(59.5, 74, 2, 1.5), 'fill="%s"' % L), paint(E(68.5, 74, 2, 1.5), 'fill="%s"' % L),
             fill_path('M50 82 Q64 98 78 82 Q64 88 50 82 Z', '#7A3B30'),
             fill_path('M56 87.5 Q64 93.5 72 87.5 Q64 90 56 87.5 Z', '#F08C9A')]
    head = Part(E(64, 64, 40, 38), B, L, hl=(44, 40, 12, 7),
                details=[fill_path('M64 47 C58 36 36 36 34 54 C33 64 38 70 42 74 C38 84 46 100 64 100 '
                                   'C82 100 90 84 86 74 C90 70 95 64 94 54 C92 36 70 36 64 47 Z', FACE),
                         paint(E(56, 46, 6, 3, -20), 'fill="#FFFFFF" opacity=".35"')],
                over=face)
    return [ear_l, ear_r, tuft, head]


def elephant():
    B, L = '#A7B3C9', '#59647E'
    PINK = '#F2B5C4'
    ear_l = Part(P('M40 44 C24 26 4 36 8 62 C10 80 22 92 38 84 Z'), B, L, hl=(18, 46, 5, 9, 10),
                 over=[fill_path('M36 50 C26 38 14 42 15 60 C16 74 24 82 34 78 Z', PINK)])
    ear_r = Part(P('M88 44 C104 26 124 36 120 62 C118 80 106 92 90 84 Z'), B, L,
                 over=[fill_path('M92 50 C102 38 114 42 113 60 C112 74 104 82 94 78 Z', PINK)])
    face = big_eyes(52, 76, 54, 1.3)
    face += cheeks(42, 86, 72, '#F08CA8', 5.6)
    face += [stroke_path('M50 79 Q54 84 58 80', '#4A5470', 2.2)]
    head = Part(E(64, 58, 31, 32), B, L, hl=(50, 38, 10, 6), over=face,
                details=[stroke_path('M54 36 Q64 32 74 36', L, 1.8, .5)])
    # trunk: a fat tube down and a happy curl up to the right
    trunk = Part(P('M64 78 C64 96 70 108 82 106 C90 105 92 96 88 92'), B, L, stroke=13,
                 over=[stroke_path('M61 90 L67 90 M62 98 L68 97', L, 1.6, .7)])
    tip = Part(C(88, 91, 7.2), B, L, over=[paint(E(88, 89.5, 2.6, 2), 'fill="%s"' % '#59647E')])
    return [ear_l, ear_r, head, trunk, tip]


def tiger():
    B, L = '#F59A3C', '#A9561A'
    W = '#FFF6E6'
    ST = '#4A2E26'
    ear_l = Part(C(30, 30, 13), B, L, over=[paint(C(30, 31, 7), 'fill="%s"' % '#F7C2B0')])
    ear_r = Part(C(98, 30, 13), B, L, over=[paint(C(98, 31, 7), 'fill="%s"' % '#F7C2B0')])
    face = big_eyes(49, 79, 56, 1.35)
    face += cheeks(34, 94, 76, '#F07C7C', 5.2)
    face += [fill_path('M57 72 L71 72 Q66 80 64 80 Q62 80 57 72 Z', '#E86C7E'),
             mouth_w(64, 81, '#6A3A22', 6.5)]
    wh = '#8A6A5A'
    face += [line(86, 82, 104, 78, wh, 1.3, .7), line(86, 86, 104, 88, wh, 1.3, .7),
             line(42, 82, 24, 78, wh, 1.3, .7), line(42, 86, 24, 88, wh, 1.3, .7)]
    stripes = [fill_path('M64 26 L60 40 L64 46 L68 40 Z', ST), fill_path('M50 28 L50 40 L55 36 Z', ST),
               fill_path('M78 28 L78 40 L73 36 Z', ST),
               fill_path('M22 54 L36 58 L22 64 Z', ST), fill_path('M22 70 L34 70 L24 78 Z', ST),
               fill_path('M106 54 L92 58 L106 64 Z', ST), fill_path('M106 70 L94 70 L104 78 Z', ST)]
    head = Part(E(64, 64, 44, 40), B, L, hl=(42, 40, 12, 6), over=face,
                details=stripes + [fill_path('M64 66 C48 64 34 74 38 88 C42 100 56 104 64 98 '
                                             'C72 104 86 100 90 88 C94 74 80 64 64 66 Z', W),
                                   paint(E(49, 58, 10, 9), 'fill="%s"' % W), paint(E(79, 58, 10, 9), 'fill="%s"' % W)])
    return [ear_l, ear_r, head]


def parrot():
    R, RL = '#E4513E', '#9A2A22'         # scarlet head
    Y, B2 = '#FFC93A', '#3C7FD8'         # wing feathers peeking at the bottom
    WP = '#FFF7EE'
    crest = Part([P('M56 24 C50 10 58 4 64 14 Z'), P('M64 22 C64 6 74 4 74 18 Z'), P('M70 26 C76 12 86 14 80 28 Z')],
                 R, RL, cel=False)
    wing_l = Part(P('M40 84 C24 92 20 106 28 114 L58 114 C58 104 52 92 40 84 Z'), B2, '#1F4F98', cel=False,
                  details=[fill_path('M24 104 C34 100 46 102 58 110 L58 114 C46 108 34 106 24 110 Z', Y)])
    wing_r = Part(P('M88 84 C104 92 108 106 100 114 L70 114 C70 104 76 92 88 84 Z'), B2, '#1F4F98', cel=False,
                  details=[fill_path('M104 104 C94 100 82 102 70 110 L70 114 C82 108 94 106 104 110 Z', Y)])
    body = Part(E(64, 104, 22, 18), R, RL, cel=False)
    face_patch = [paint(E(46, 56, 15, 17), 'fill="%s"' % WP)]
    face = [eye(47, 55, 1.35), stroke_path('M38 46 Q46 42 54 46', RL, 1.2, .5)]
    face += [paint(E(48, 74, 5.2, 3.2), 'fill="#F590A0" opacity=".75"')]
    head = Part(E(62, 62, 34, 36), R, RL, hl=(46, 38, 10, 6), details=face_patch, over=face)
    # big hooked beak: cream upper, dark lower, pointing right-down
    beak_lo = Part(P('M78 72 C84 78 90 80 94 78 C92 84 84 86 78 82 Z'), '#4A4250', '#2A2430', cel=False)
    beak_up = Part(P('M68 54 C80 46 100 50 104 66 C106 76 100 84 96 82 C96 74 90 68 76 70 Z'), '#FFE9C2', '#A88B5A',
                   hl=(84, 54, 8, 3, -10), over=[paint(E(80, 57, 2, 1.4), 'fill="#A88B5A"')])
    return [body, wing_l, wing_r, crest, head, beak_lo, beak_up]


def lion():
    B, L = '#F0C070', '#A06E2A'
    M, ML = '#C8732E', '#82461A'
    CREAM = '#FBE7C4'
    mane_shapes = [C(64, 64, 40)]
    for i in range(12):
        a = math.radians(-90 + i * 30 + 15)
        mane_shapes.append(C(64 + 41 * math.cos(a), 64 + 41 * math.sin(a), 13))
    mane = Part(mane_shapes, M, ML, hl=(38, 30, 12, 6),
                details=[stroke_path('M%s %s L%s %s' % (f(64 + 30 * math.cos(math.radians(a))),
                                                        f(64 + 30 * math.sin(math.radians(a))),
                                                        f(64 + 46 * math.cos(math.radians(a))),
                                                        f(64 + 46 * math.sin(math.radians(a)))), ML, 2, .45)
                         for a in range(-90, 270, 30)])
    ear_l = Part(C(38, 34, 9), B, L, over=[paint(C(38, 35, 4.6), 'fill="#E08E7A"')])
    ear_r = Part(C(90, 34, 9), B, L, over=[paint(C(90, 35, 4.6), 'fill="#E08E7A"')])
    face = big_eyes(52, 76, 58, 1.3)
    face += cheeks(40, 88, 76, '#EE8270', 5.4)
    face += [fill_path('M57 73 L71 73 Q66 80 64 80 Q62 80 57 73 Z', '#7A4A2A'),
             mouth_w(64, 81, '#7A4A2A', 6)]
    head = Part(E(64, 66, 30, 29), B, L, hl=(50, 48, 8, 5), over=face,
                details=[paint(E(64, 82, 16, 12), 'fill="%s"' % CREAM)])
    return [mane, ear_l, ear_r, head]


def frog():
    B, L = '#7CC452', '#3F7D22'
    BELLY = '#DDF2B0'
    face = big_eyes(40, 88, 34, 1.4)
    face += cheeks(30, 98, 74, '#F59AA8', 6)
    face += [fill_path('M34 72 Q64 100 94 72 Q64 84 34 72 Z', '#3E6E22'),
             fill_path('M50 80 Q64 90 78 80 Q64 84 50 80 Z', '#F08C9A'),
             paint(C(58, 58, 1.8), 'fill="%s"' % L), paint(C(70, 58, 1.8), 'fill="%s"' % L)]
    head = Part([E(64, 70, 50, 32), C(40, 36, 18), C(88, 36, 18)], B, L, hl=(30, 26, 7, 4), over=face,
                details=[paint(E(64, 92, 34, 12), 'fill="%s"' % BELLY),
                         paint(C(24, 62, 3.5), 'fill="%s"' % mix(B, L, .3)), paint(C(104, 60, 3), 'fill="%s"' % mix(B, L, .3))])
    return [head]


def snake():
    B, L = '#46B39A', '#22715F'           # teal (never the frog's leaf green)
    BELLY = '#FFE58A'
    SPOT = '#2E8A75'
    # coiled body: two fat loops at the bottom, the neck rising to the head
    coil = Part(P('M30 104 C16 104 14 88 30 86 C50 84 82 84 98 88 C114 92 112 108 96 108 C78 110 46 110 30 104'),
                B, L, stroke=16,
                over=[paint(C(x, y, 3.2), 'fill="%s"' % SPOT) for x, y in ((40, 86), (60, 85), (80, 86), (98, 104), (60, 109))])
    neck = Part(P('M86 90 C92 76 84 66 72 62'), B, L, stroke=15)
    tongue = stroke_path('M58 84 L58 94 M58 94 L54 99 M58 94 L62 99', '#E2445A', 2.4)
    face = big_eyes(52, 76, 46, 1.25)
    face += cheeks(42, 86, 62, '#F590A0', 5)
    face += [smile(46, 66, 70, 66, 7, '#1E5A4C', 2.2),
             paint(C(56, 58, 1.4), 'fill="%s"' % L), paint(C(64, 58, 1.4), 'fill="%s"' % L)]
    head = Part(E(62, 52, 30, 26), B, L, hl=(48, 36, 10, 5), over=face,
                details=[paint(C(62, 30, 4), 'fill="%s"' % SPOT), paint(C(48, 33, 3), 'fill="%s"' % SPOT),
                         paint(C(76, 33, 3), 'fill="%s"' % SPOT)])
    t = Part(P('M58 74 L58 82'), '#E2445A', '#A82838', stroke=2.2, sticker=False, over=[tongue])
    return [coil, neck, t, head]


def hippo():
    B, L = '#A898C8', '#5E5088'
    MZ = '#C9B8E2'
    PINK = '#F2A8C0'
    ear_l = Part(E(36, 26, 8, 10, -20), B, L, over=[paint(E(36, 27, 4, 5.6, -20), 'fill="%s"' % PINK)])
    ear_r = Part(E(92, 26, 8, 10, 20), B, L, over=[paint(E(92, 27, 4, 5.6, 20), 'fill="%s"' % PINK)])
    face = big_eyes(48, 80, 42, 1.25)
    head = Part(E(64, 50, 34, 28), B, L, hl=(48, 32, 10, 5), over=face)
    mz = [paint(E(46, 76, 7, 5.4), 'fill="%s"' % L), paint(E(82, 76, 7, 5.4), 'fill="%s"' % L),
          smile(42, 94, 86, 94, 7, L, 2.4),
          fill_path('M52 99.5 L52 106 L58 106 L58 101 Z', '#FFFFFF'), fill_path('M70 101 L70 106 L76 106 L76 99.5 Z', '#FFFFFF')]
    mz += cheeks(26, 104, 90, '#EE8AA8', 6)
    muzzle = Part(E(64, 86, 48, 26), MZ, L, hl=(40, 72, 12, 5), over=mz)
    return [ear_l, ear_r, head, muzzle]


ANIMALS = {'monkey': monkey, 'elephant': elephant, 'tiger': tiger, 'parrot': parrot,
           'lion': lion, 'frog': frog, 'snake': snake, 'hippo': hippo}
OLD = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck']


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
