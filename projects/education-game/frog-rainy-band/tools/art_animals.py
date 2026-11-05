#!/usr/bin/env python3
"""Bop's Rainy Band - garden-animal band members (character artist B, DESIGN §4.2).

Writes game/assets/default/items/animal_<x>.svg and animal_<x>_sing.svg for
x in duck, cat, dog, cow, sheep, hen, bird, pig (16 files) and removes every other animal_*.svg
(old jungle stickers from the sister game).

Each animal SITS on its stool, front view, big round head (~55 % of the height) on a small round
body, readable at 110 px.  viewBox 0 0 160 160 (width/height = viewBox), bottom anchor (80, 156):
the shapes rest on y = GROUND (148) and the white sticker border reaches y ~ 156.
The two frames share the identical body; only the face changes:
  * rest : open round eyes with catch-lights, small smile
  * sing : happy closed "^ ^" eyes, mouth (or beak) wide open with a pink tongue.
100 % original art from primitives:
  * each part = outline (stroke drawn UNDER the fill, so a group of shapes gets one merged outline) in a
    darker tone of the fill + shade fill + the base fill shifted up-left and clipped (one-step cel shade)
    + one soft highlight upper-left;
  * white sticker border (~8 px outside the outline) + a faint drop shadow (<use> of one silhouette).
No <text>, fonts, scripts, filters or external refs.

Usage: python3 tools/art_animals.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

V = 160               # viewBox side
GROUND = 148          # y where feet rest (sticker border reaches ~156 = the anchor)
OUTLINE = 3.0         # visible outline width
STICKER = 8           # sticker reach beyond the shapes' geometry
EYE = '#2F2A3A'
CHEEK = '#F590A8'
SHADOW = '#26304F'
MOUTH = '#7A2E3A'
TONGUE = '#F27F93'


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


def mirror_d(d):
    """Mirror a path's x coordinates around x = 80 (absolute commands M L C Q Z only)."""
    out, toks, i = [], d.replace(',', ' ').split(), 0
    expect_x = True
    for t in toks:
        if t[0].isalpha():
            out.append(t[0])
            rest = t[1:]
            expect_x = True
            if not rest:
                continue
            t = rest
        v = float(t)
        out.append(f(V - v) if expect_x else f(v))
        expect_x = not expect_x
    return ' '.join(out)


class Part:
    def __init__(self, shapes, base, line, shade=None, details=(), hl=None, over=(), sticker=True,
                 stroke=None, cel=True):
        self.shapes = shapes if isinstance(shapes, (list, tuple)) else [shapes]
        self.base, self.line = base, line
        self.shade = shade or mix(base, line, 0.3)
        self.details = list(details)   # svg drawn clipped to the part
        self.hl = hl                   # (cx, cy, rx, ry[, rot]) soft highlight, clipped
        self.over = list(over)         # svg drawn after the part, unclipped (eyes, mouth ...)
        self.sticker = sticker
        self.stroke = stroke           # width -> open paths drawn as strokes
        self.cel = cel


_uid = [0]


def uid():
    _uid[0] += 1
    return 'k%d' % _uid[0]


def render_part(p):
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
    cid = uid()
    sh = ''.join(paint(s) for s in p.shapes)
    out.append('<clipPath id="%s">%s</clipPath>' % (cid, sh))
    out.append('<g fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round">%s</g>'
               % (p.line, p.line, f(2 * OUTLINE), sh))
    if p.cel:
        out.append('<g fill="%s">%s</g>' % (p.shade, sh))
    inner = ['<g fill="%s"%s>%s</g>' % (p.base, ' transform="translate(-3.4 -4)"' if p.cel else '', sh)]
    inner.extend(p.details)
    if p.hl:
        cx, cy, rx, ry = p.hl[:4]
        rot = p.hl[4] if len(p.hl) > 4 else -25
        inner.append(paint(E(cx, cy, rx, ry, rot), 'fill="#FFFFFF" opacity=".3"'))
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
    _uid[0] = 0
    sil = silhouette(parts)
    body = '\n'.join(render_part(p) for p in parts)
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="%d" height="%d" viewBox="0 0 %d %d">\n'
            '<defs><g id="sil">%s</g></defs>\n'
            '<use href="#sil" xlink:href="#sil" transform="translate(0 2.5)" fill="%s" stroke="%s" '
            'stroke-width="%d" stroke-linejoin="round" opacity=".2"/>\n'
            '<use href="#sil" xlink:href="#sil" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
            'stroke-linejoin="round"/>\n%s\n</svg>\n'
            % (V, V, V, V, sil, SHADOW, SHADOW, 2 * STICKER, 2 * STICKER, body))


# ---------- shared face bits ----------
def stroke_path(d, col, w, op=1, cap='round'):
    return paint(P(d), 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="%s" stroke-linejoin="round"%s'
                 % (col, f(w), cap, (' opacity="%s"' % f(op)) if op != 1 else ''))


def fill_path(d, col, op=1, extra=''):
    return paint(P(d), 'fill="%s"%s%s' % (col, (' opacity="%s"' % f(op)) if op != 1 else '', extra))


def eye(cx, cy, s=1.0):
    return (paint(E(cx, cy, 5.4 * s, 6.6 * s), 'fill="%s"' % EYE) +
            paint(C(cx - 1.7 * s, cy - 2.4 * s, 2.2 * s), 'fill="#FFFFFF"') +
            paint(C(cx + 1.9 * s, cy + 2.4 * s, 1 * s), 'fill="#FFFFFF"'))


def happy_eye(cx, cy, s=1.0):
    w, h = 5.6 * s, 4.6 * s
    return stroke_path('M%s %s Q%s %s %s %s' % (f(cx - w), f(cy + h * .45), f(cx), f(cy - h * 1.35), f(cx + w), f(cy + h * .45)),
                       EYE, 2.3 * s)


def eyes(x1, x2, y, s, sing):
    fn = happy_eye if sing else eye
    return [fn(x1, y, s), fn(x2, y, s)]


def cheeks(x1, x2, y, col=CHEEK, r=6.5, op=.7):
    return [paint(E(x1, y, r, r * .62), 'fill="%s" opacity="%s"' % (col, f(op))),
            paint(E(x2, y, r, r * .62), 'fill="%s" opacity="%s"' % (col, f(op)))]


def smile(cx, cy, w, depth, col, sw=2.4):
    return stroke_path('M%s %s Q%s %s %s %s' % (f(cx - w), f(cy), f(cx), f(cy + depth), f(cx + w), f(cy)), col, sw)


def open_mouth(cx, cy, rx, ry, line=None):
    """Singing mouth: a rounded 'D' (flat-ish top), dark inside, pink tongue at the bottom (clipped)."""
    cid = uid()
    d = ('M%s %s Q%s %s %s %s Q%s %s %s %s Q%s %s %s %s Z'
         % (f(cx - rx), f(cy - ry * .45), f(cx), f(cy - ry * 1.05), f(cx + rx), f(cy - ry * .45),
            f(cx + rx * 1.02), f(cy + ry * 1.0), f(cx), f(cy + ry * 1.0),
            f(cx - rx * 1.02), f(cy + ry * 1.0), f(cx - rx), f(cy - ry * .45)))
    s = '<clipPath id="%s">%s</clipPath>' % (cid, paint(P(d)))
    s += fill_path(d, MOUTH, extra=' stroke="%s" stroke-width="2" stroke-linejoin="round"' % (line or '#5A1F2A'))
    s += '<g clip-path="url(#%s)">%s</g>' % (cid, paint(E(cx, cy + ry * 0.95, rx * 0.75, ry * 0.55), 'fill="%s"' % TONGUE))
    return s


def toes3(x, y, col, w=2.6):
    return stroke_path('M%s %s L%s %s M%s %s L%s %s M%s %s L%s %s'
                       % (f(x), f(y - 7), f(x - 6), f(y), f(x), f(y - 7), f(x), f(y + 1), f(x), f(y - 7), f(x + 6), f(y)),
                       col, w)


# ---------- shared body plan (sitting) ----------
def body_part(B, L, details=(), cx=80, cy=118, rx=37, ry=30, hl=True):
    return Part(E(cx, cy, rx, ry), B, L, details=details, hl=(cx - rx * .5, cy - ry * .55, rx * .3, ry * .18) if hl else None)


def paws(B, L, y=142, dx=17, rx=12, ry=7, details=None):
    return [Part(E(80 - dx, y, rx, ry), B, L, cel=False, hl=None,
                 over=[stroke_path('M%s %s L%s %s M%s %s L%s %s' % (f(80 - dx - 3.5), f(y - 2.5), f(80 - dx - 3.5), f(y + 2.5),
                                                                    f(80 - dx + 3.5), f(y - 2.5), f(80 - dx + 3.5), f(y + 2.5)),
                                    L, 1.8, .6)] if details else []),
            Part(E(80 + dx, y, rx, ry), B, L, cel=False, hl=None,
                 over=[stroke_path('M%s %s L%s %s M%s %s L%s %s' % (f(80 + dx - 3.5), f(y - 2.5), f(80 + dx - 3.5), f(y + 2.5),
                                                                    f(80 + dx + 3.5), f(y - 2.5), f(80 + dx + 3.5), f(y + 2.5)),
                                    L, 1.8, .6)] if details else [])]


# =====================================================================================
def duck(sing):
    B, L = '#FFE27A', '#C08F22'
    BILL, BL = '#FF9F45', '#C4650C'
    WING = '#F6CB52'
    tail = Part(P('M108 112 C120 104 128 100 130 92 C136 104 130 120 114 126 Z'), B, L, cel=False)
    body = body_part(B, L, details=[fill_path('M44 112 C40 128 52 140 68 138 C60 130 56 118 44 112 Z', WING),
                                    fill_path('M116 112 C120 128 108 140 92 138 C100 130 104 118 116 112 Z', WING)])
    feet = [Part(P('M50 146 C52 136 62 134 70 140 L74 148 Z'), BILL, BL, cel=False),
            Part(P('M110 146 C108 136 98 134 90 140 L86 148 Z'), BILL, BL, cel=False)]
    tuft = Part(P('M76 26 C70 14 76 8 82 16 C84 8 94 10 88 24 Z'), B, L, cel=False)
    face = eyes(64, 96, 54, 1.55, sing) + cheeks(50, 110, 72)
    if sing:
        face += [fill_path('M66 84 Q80 82 94 84 Q92 98 80 99 Q68 98 66 84 Z', MOUTH,
                           extra=' stroke="%s" stroke-width="2.4" stroke-linejoin="round"' % BL),
                 paint(E(80, 94, 7.5, 3.6), 'fill="%s"' % TONGUE),
                 fill_path('M60 74 C62 64 98 64 100 74 C101 82 88 86 80 86 C72 86 59 82 60 74 Z', BILL,
                           extra=' stroke="%s" stroke-width="2.6" stroke-linejoin="round"' % BL),
                 paint(E(72, 71, 2, 1.4), 'fill="%s"' % BL), paint(E(88, 71, 2, 1.4), 'fill="%s"' % BL),
                 paint(E(72, 68, 6, 2.2, -10), 'fill="#FFFFFF" opacity=".35"')]
    else:
        face += [fill_path('M62 78 C62 66 98 66 98 78 C98 88 86 92 80 92 C74 92 62 88 62 78 Z', BILL,
                           extra=' stroke="%s" stroke-width="2.6" stroke-linejoin="round"' % BL),
                 stroke_path('M65 81 Q80 88 95 81', BL, 2.2),
                 paint(E(72, 74, 2, 1.4), 'fill="%s"' % BL), paint(E(88, 74, 2, 1.4), 'fill="%s"' % BL),
                 paint(E(72, 70, 6, 2.2, -10), 'fill="#FFFFFF" opacity=".35"')]
    head = Part(C(80, 62, 38), B, L, hl=(62, 38, 12, 7), over=face)
    return [tail, body] + feet + [tuft, head]


def cat(sing):
    B, L = '#F6B56B', '#B0662A'
    W, STR, PINKIN = '#FFF4E4', '#DE8C40', '#F7B6B0'
    tail = Part(P('M108 138 C134 140 142 112 128 98'), B, L, stroke=12,
                over=[stroke_path('M132 122 L139 124 M129 109 L136 106', STR, 3)])
    body = body_part(B, L, details=[paint(E(80, 126, 20, 20), 'fill="%s"' % W),
                                    stroke_path('M46 108 L56 110 M44 120 L54 120', STR, 3.5),
                                    stroke_path('M114 108 L104 110 M116 120 L106 120', STR, 3.5)])
    pw = paws(W, L, details=True)
    ear_l = Part(P('M46 50 L42 14 L74 32 Z'), B, L, cel=False, over=[fill_path('M50 42 L48 24 L64 33 Z', PINKIN)])
    ear_r = Part(P('M114 50 L118 14 L86 32 Z'), B, L, cel=False, over=[fill_path('M110 42 L112 24 L96 33 Z', PINKIN)])
    face = eyes(63, 97, 60, 1.5, sing) + cheeks(50, 110, 78)
    face += [fill_path('M74 74 L86 74 Q81 80 80 80 Q79 80 74 74 Z', '#E86C7E',
                       extra=' stroke="#B04050" stroke-width="1.4" stroke-linejoin="round"')]
    if sing:
        face += [open_mouth(80, 88, 7, 7.5)]
    else:
        face += [stroke_path('M72 82 Q76 87 80 81 Q84 87 88 82', '#7A3E22', 2.2)]
    wh = '#9A6A4A'
    face += [stroke_path('M100 82 L120 78 M100 87 L120 89', wh, 1.6, .7),
             stroke_path('M60 82 L40 78 M60 87 L40 89', wh, 1.6, .7)]
    head = Part(E(80, 64, 40, 35), B, L, hl=(58, 42, 12, 6), over=face,
                details=[paint(E(70, 82, 13, 10), 'fill="%s"' % W), paint(E(90, 82, 13, 10), 'fill="%s"' % W),
                         fill_path('M80 30 L76 44 L80 48 L84 44 Z', STR),
                         fill_path('M66 32 L66 42 L71 39 Z', STR), fill_path('M94 32 L94 42 L89 39 Z', STR)])
    return [tail, body] + pw + [ear_l, ear_r, head]


def dog(sing):
    B, L = '#EED2A6', '#A4784A'
    EAR, EL = '#9A6A48', '#5E3B22'
    CR = '#FFF3DE'
    tail = Part(P('M112 128 C128 124 134 108 128 98'), B, L, stroke=11)
    body = body_part(B, L, details=[paint(E(80, 124, 20, 22), 'fill="%s"' % CR)])
    pw = paws(CR, L, details=True)
    face = eyes(63, 97, 58, 1.5, sing) + cheeks(50, 110, 78)
    face += [paint(E(80, 76, 8, 5.6), 'fill="#3A2A2A"'), paint(E(77.5, 74.2, 2.6, 1.4), 'fill="#FFFFFF" opacity=".6"'),
             stroke_path('M80 81 L80 84', '#3A2A2A', 2.2)]
    if sing:
        face += [open_mouth(80, 91, 8, 7.5)]
    else:
        face += [stroke_path('M71 84 Q75.5 89 80 84 Q84.5 89 89 84', '#3A2A2A', 2.3),
                 fill_path('M76 87 Q80 85.5 84 87 L84 92 Q80 96 76 92 Z', TONGUE,
                           extra=' stroke="#C24A60" stroke-width="1.4" stroke-linejoin="round"')]
    head = Part(E(80, 64, 38, 35), B, L, hl=(60, 42, 11, 6), over=face,
                details=[paint(E(98, 56, 14, 13), 'fill="#D6AE78"'),
                         paint(E(80, 84, 19, 14), 'fill="%s"' % CR)])
    ear_d = 'M50 36 C34 36 26 58 30 80 C32 92 46 94 50 80 C54 66 58 46 50 36 Z'
    ear_l = Part(P(ear_d), EAR, EL, hl=(38, 52, 4, 9, 10))
    ear_r = Part(P(mirror_d(ear_d)), EAR, EL)
    return [tail, body] + pw + [head, ear_l, ear_r]


def cow(sing):
    B, L = '#FFFBF4', '#7A7284'
    SPOT = '#5A5266'
    MZ, ML = '#F7C4C4', '#C07C84'
    HORN, HL = '#F4E3B8', '#B39A62'
    tail = Part(P('M112 132 C126 132 132 122 130 110'), B, L, stroke=6,
                over=[paint(E(130, 106, 5, 7), 'fill="%s"' % SPOT)])
    body = body_part(B, L, details=[fill_path('M44 110 C52 100 66 106 62 118 C58 128 46 126 44 110 Z', SPOT),
                                    fill_path('M100 124 C104 114 120 116 118 128 C116 138 102 136 100 124 Z', SPOT)])
    hooves = [Part(E(63, 142, 12, 7), '#8C8296', '#5A5266', cel=False), Part(E(97, 142, 12, 7), '#8C8296', '#5A5266', cel=False)]
    horn_l = Part(P('M58 34 C50 30 46 20 50 12 C56 18 62 22 68 26 Z'), HORN, HL, cel=False)
    horn_r = Part(P(mirror_d('M58 34 C50 30 46 20 50 12 C56 18 62 22 68 26 Z')), HORN, HL, cel=False)
    ear_l = Part(E(38, 50, 15, 8, -18), B, L, over=[paint(E(39, 50.5, 9, 4.2, -18), 'fill="%s"' % MZ)])
    ear_r = Part(E(122, 50, 15, 8, 18), B, L, over=[paint(E(121, 50.5, 9, 4.2, 18), 'fill="%s"' % MZ)])
    head = Part(E(80, 60, 36, 33), B, L, hl=(62, 40, 10, 6),
                details=[fill_path('M86 28 C98 26 112 38 110 50 C104 56 92 50 88 42 C84 36 82 30 86 28 Z', SPOT)],
                over=eyes(66, 94, 54, 1.45, sing) + cheeks(52, 108, 70))
    mo = [paint(E(70, 80, 3.4, 4.4), 'fill="%s"' % ML), paint(E(90, 80, 3.4, 4.4), 'fill="%s"' % ML)]
    mo += [open_mouth(80, 92, 7.5, 5.8, '#8A4050')] if sing else [smile(80, 91, 9, 5, ML, 2.4)]
    muzzle = Part(E(80, 84, 28, 17), MZ, ML, hl=(66, 74, 9, 3.5, -8), over=mo)
    return [tail, body] + hooves + [horn_l, horn_r, ear_l, ear_r, head, muzzle]


def sheep(sing):
    W, WL = '#FBF5E8', '#B6A68E'
    SK, SL = '#F3D3BC', '#A9806A'
    LEG = '#8A7468'
    bshapes = [E(80, 118, 36, 28)]
    for a in range(0, 360, 36):
        r = math.radians(a)
        bshapes.append(C(80 + 33 * math.cos(r), 118 + 24 * math.sin(r), 10))
    body = Part(bshapes, W, WL, hl=(58, 100, 10, 5))
    feet = [Part(E(63, 143, 10, 6), LEG, '#5E4C44', cel=False), Part(E(97, 143, 10, 6), LEG, '#5E4C44', cel=False)]
    hshapes = [C(80, 60, 34)]
    for a in range(0, 360, 30):
        r = math.radians(a)
        hshapes.append(C(80 + 34 * math.cos(r), 60 + 32 * math.sin(r), 10.5))
    wool = Part(hshapes, W, WL, hl=(58, 34, 10, 5))
    ear_l = Part(E(40, 70, 15, 7, 22), SK, SL, over=[paint(E(41, 70, 9, 3.5, 22), 'fill="#F2A8B0"')])
    ear_r = Part(E(120, 70, 15, 7, -22), SK, SL, over=[paint(E(119, 70, 9, 3.5, -22), 'fill="#F2A8B0"')])
    fo = eyes(68, 92, 68, 1.3, sing) + cheeks(59, 101, 82, r=5.4)
    fo += [fill_path('M75 79 L85 79 Q81 84 80 84 Q79 84 75 79 Z', SL)]
    fo += [open_mouth(80, 92, 6.5, 6.5)] if sing else [stroke_path('M73 88 Q76.5 92 80 87 Q83.5 92 87 88', SL, 2.2)]
    face = Part(E(80, 72, 25, 27), SK, SL, hl=(68, 58, 7, 4), over=fo)
    fringe = Part([C(66, 48, 9), C(80, 44, 10.5), C(94, 48, 9)], W, WL, cel=False, sticker=False,
                  hl=(76, 40, 5, 2.5))
    return [body] + feet + [wool, ear_l, ear_r, face, fringe]


def hen(sing):
    B, L = '#FFF7EC', '#B89C7C'
    COMB, CL = '#E8564A', '#A8282E'
    BEAK, BKL = '#FFB640', '#C4800C'
    WING = '#F2E2CC'
    tail = Part([P('M106 116 C110 96 124 86 132 90 C126 98 124 106 122 114 Z'),
                 P('M110 122 C122 108 136 106 140 112 C132 116 126 122 120 128 Z')], B, L, cel=False)
    body = body_part(B, L, details=[fill_path('M44 112 C42 128 54 140 70 138 C62 128 58 118 44 112 Z', WING),
                                    fill_path('M116 112 C118 128 106 140 90 138 C98 128 102 118 116 112 Z', WING)])
    feet = [toes3(66, 148, BKL, 4.2), toes3(66, 148, BEAK, 2.2), toes3(94, 148, BKL, 4.2), toes3(94, 148, BEAK, 2.2)]
    legs = Part([P('M66 141 L66 141.5'), P('M94 141 L94 141.5')], BEAK, BKL, stroke=3, over=feet)
    comb = Part([C(70, 32, 8.5), C(81, 26, 10), C(92, 31, 8)], COMB, CL, cel=False)
    face = eyes(66, 94, 58, 1.4, sing) + cheeks(53, 107, 74)
    if sing:
        face += [paint(E(80, 96, 4.5, 6), 'fill="%s" stroke="%s" stroke-width="2"' % (COMB, CL)),
                 paint(E(80, 79, 8, 7.5), 'fill="%s" stroke="#5A1F2A" stroke-width="1.6"' % MOUTH),
                 paint(E(80, 83.5, 4.6, 2.6), 'fill="%s"' % TONGUE),
                 fill_path('M69 69 Q80 62 91 69 L80 75 Z', BEAK, extra=' stroke="%s" stroke-width="2.2" stroke-linejoin="round"' % BKL),
                 fill_path('M73 85 L87 85 L80 91 Z', BEAK, extra=' stroke="%s" stroke-width="2.2" stroke-linejoin="round"' % BKL)]
    else:
        face += [paint(E(80, 88, 5, 6.5), 'fill="%s" stroke="%s" stroke-width="2"' % (COMB, CL)),
                 fill_path('M70 71 Q80 65 90 71 L80 83 Z', BEAK, extra=' stroke="%s" stroke-width="2.2" stroke-linejoin="round"' % BKL),
                 stroke_path('M74 76 L86 76', BKL, 1.6, .7)]
    head = Part(C(80, 62, 34), B, L, hl=(64, 42, 10, 6), over=face)
    return [tail, body, legs, comb, head]


def bird(sing):
    B, L = '#86BFEF', '#3A78B0'
    BELLY = '#FFE6C8'
    BEAK, BKL = '#FFAA3D', '#C4650C'
    tail = Part(P('M106 128 C122 130 136 124 142 114 C134 132 124 142 104 140 Z'), B, L, cel=False)
    body = body_part(B, L, details=[paint(E(80, 124, 23, 22), 'fill="%s"' % BELLY)])
    feet = [toes3(68, 148, BKL, 4.2), toes3(68, 148, BEAK, 2.2), toes3(92, 148, BKL, 4.2), toes3(92, 148, BEAK, 2.2)]
    wd = 'M48 100 C30 108 30 132 48 138 C58 128 58 110 48 100 Z'
    wing_l = Part(P(wd), mix(B, L, .15), L, cel=False, over=feet[:2])
    wing_r = Part(P(mirror_d(wd)), mix(B, L, .15), L, cel=False, over=feet[2:])
    tuft = Part([P('M76 30 C68 18 72 8 80 14 Z'), P('M80 28 C82 14 92 10 92 20 Z')], B, L, cel=False)
    face = eyes(65, 95, 58, 1.5, sing) + cheeks(52, 108, 76)
    if sing:
        face += [paint(E(80, 82, 8, 7.5), 'fill="%s" stroke="#5A1F2A" stroke-width="1.6"' % MOUTH),
                 paint(E(80, 86.5, 4.6, 2.6), 'fill="%s"' % TONGUE),
                 fill_path('M70 72 Q80 65 90 72 L80 78 Z', BEAK, extra=' stroke="%s" stroke-width="2.2" stroke-linejoin="round"' % BKL),
                 fill_path('M73 88 L87 88 L80 94 Z', BEAK, extra=' stroke="%s" stroke-width="2.2" stroke-linejoin="round"' % BKL)]
    else:
        face += [fill_path('M71 74 Q80 68 89 74 L80 85 Z', BEAK, extra=' stroke="%s" stroke-width="2.2" stroke-linejoin="round"' % BKL),
                 stroke_path('M74 78.5 L86 78.5', BKL, 1.6, .7)]
    head = Part(C(80, 64, 36), B, L, hl=(62, 44, 10, 6), over=face,
                details=[paint(E(80, 80, 22, 16), 'fill="%s"' % BELLY)])
    return [tail, body, wing_l, wing_r, tuft, head]


def pig(sing):
    B, L = '#F9B8C4', '#C2647C'
    SN = '#FFCCD6'
    tail = Part(P('M112 130 C126 134 130 120 122 118 C114 116 116 128 126 126'), B, L, stroke=4.5)
    body = body_part(B, L)
    hooves = [Part(E(63, 142, 12, 7), '#E893A6', L, cel=False,
                   over=[stroke_path('M63 138 L63 146', L, 1.8, .6)]),
              Part(E(97, 142, 12, 7), '#E893A6', L, cel=False,
                   over=[stroke_path('M97 138 L97 146', L, 1.8, .6)])]
    ear_d = 'M48 46 C40 32 40 20 46 14 C56 18 66 26 72 34 Z'
    ear_l = Part(P(ear_d), B, L, cel=False, over=[fill_path('M51 38 C46 30 46 24 49 21 C55 24 60 28 64 33 Z', '#F08CA2')])
    ear_r = Part(P(mirror_d(ear_d)), B, L, cel=False,
                 over=[fill_path(mirror_d('M51 38 C46 30 46 24 49 21 C55 24 60 28 64 33 Z'), '#F08CA2')])
    face = eyes(62, 98, 56, 1.45, sing) + cheeks(48, 112, 76, '#F27E98')
    face += [open_mouth(80, 94, 7, 5.6)] if sing else [smile(80, 92, 9, 5, L, 2.4)]
    head = Part(E(80, 64, 40, 36), B, L, hl=(58, 42, 12, 6), over=face)
    snout = Part(E(80, 77, 16, 11), SN, L, cel=False, hl=(74, 71, 6, 2.5, -8),
                 over=[paint(E(74, 77.5, 2.8, 4.2), 'fill="%s"' % L), paint(E(86, 77.5, 2.8, 4.2), 'fill="%s"' % L)])
    return [tail, body] + hooves + [ear_l, ear_r, head, snout]


ANIMALS = {'duck': duck, 'cat': cat, 'dog': dog, 'cow': cow, 'sheep': sheep, 'hen': hen, 'bird': bird, 'pig': pig}


def main():
    os.makedirs(OUT, exist_ok=True)
    keep = set()
    for name in ANIMALS:
        keep.add('animal_%s.svg' % name)
        keep.add('animal_%s_sing.svg' % name)
    for fn_ in os.listdir(OUT):
        if fn_.startswith('animal_') and fn_.endswith('.svg') and fn_ not in keep:
            os.remove(os.path.join(OUT, fn_))
    for name, fn in ANIMALS.items():
        for sing in (False, True):
            with open(os.path.join(OUT, 'animal_%s%s.svg' % (name, '_sing' if sing else '')), 'w') as fh:
                fh.write(build(fn(sing)))
    print('wrote %d stickers to %s' % (2 * len(ANIMALS), OUT))


if __name__ == '__main__':
    main()
