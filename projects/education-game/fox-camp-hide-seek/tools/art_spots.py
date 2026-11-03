#!/usr/bin/env python3
"""Pip's Camp Hide & Seek - hiding places (character artist B).

Writes game/assets/default/spots/<kind>.svg and <kind>_open.svg for
kind in bush, stump, tent, rock, leaves, log, snowman, drift  (16 files) + spots/spots.json.

Every file: viewBox 0 0 240 200 (width/height = viewBox), bottom-centre anchor (120, 196), transparent around.
The object's top over its central 50 % (x 60..180) is a fairly level line at PEEK[kind] (= spots.json peekY):
the renderer draws the hidden friend BEHIND the place and clips it at peekY, so everything of the friend below
that line must be covered by opaque object.  The *_open variant is the same object "opened" in the same frame
and never dips below peekY over the central 50 % either (an opaque hollow fills any opening), so the two
can be swapped without a gap.

Style (DESIGN.md section 3): flat cartoon, chunky rounded shapes, ~4 px outline in a darker tone of the fill
(a stroke drawn UNDER the fill so a group of shapes gets one merged outline), one-step cel shade (the base
fill shifted up-left and clipped to the part -> a crescent lower-right) + one soft highlight upper-left.
Calm natural colours, lower saturation than every answer colour so a red/orange/yellow/green/blue/purple
hat peeking above pops.  100 % original, built from primitives.  No <text>, fonts, scripts, filters or refs.

Usage: python3 tools/art_spots.py
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'spots')

W, H = 240, 200
BASE_Y = 196
OUTLINE = 3.8          # visible outline width (px at 240)
SHIFT = (-4, -5)       # cel shade: the base fill is shifted up-left by this much
KINDS = ['bush', 'stump', 'tent', 'rock', 'leaves', 'log', 'snowman', 'drift']
SEASON = {'bush': 0, 'stump': 0, 'tent': 1, 'rock': 1, 'leaves': 2, 'log': 2, 'snowman': 3, 'drift': 3}
# clip line (viewBox y) = the LOWEST point of the object's top contour over x 60..180 (measured by
# tools/art_spots_sheet.js, which prints a warning when the art and these numbers disagree)
PEEK = {'bush': 53, 'stump': 50, 'tent': 59, 'rock': 58, 'leaves': 62, 'log': 63, 'snowman': 63, 'drift': 62}


def f(v):
    s = ('%.1f' % v).rstrip('0').rstrip('.')
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


def R(x, y, w, h, rx=0):
    return '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" {A}/>' % (f(x), f(y), f(w), f(h), f(rx))


def paint(shape, attrs=''):
    return shape.replace(' {A}', (' ' + attrs) if attrs else '')


def stroke(shape, col, w, op=1):
    return paint(shape, 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"%s'
                 % (col, f(w), (' opacity="%s"' % f(op)) if op != 1 else ''))


def fill(shape, col, op=1):
    return paint(shape, 'fill="%s"%s' % (col, (' opacity="%s"' % f(op)) if op != 1 else ''))


def leaf_path(cx, cy, L, wd, rot):
    """A pointed leaf (lens) centred at (cx, cy), length L, width wd, rotated rot degrees."""
    a = math.radians(rot)
    ux, uy = math.cos(a), math.sin(a)
    vx, vy = -uy, ux
    x1, y1 = cx - ux * L / 2, cy - uy * L / 2
    x2, y2 = cx + ux * L / 2, cy + uy * L / 2
    c1 = (cx + vx * wd, cy + vy * wd)
    c2 = (cx - vx * wd, cy - vy * wd)
    return P('M%s %s Q%s %s %s %s Q%s %s %s %s Z' % (f(x1), f(y1), f(c1[0]), f(c1[1]), f(x2), f(y2),
                                                    f(c2[0]), f(c2[1]), f(x1), f(y1)))


class Doc:
    def __init__(self):
        self.n = 0
        self.out = []

    def uid(self):
        self.n += 1
        return 'k%d' % self.n

    def part(self, shapes, base, line, shade=None, details=(), hl=None, over=(), cel=True, ow=OUTLINE):
        """Filled part: merged outline under the fill, cel shade, highlight; details clipped to the part."""
        shapes = shapes if isinstance(shapes, (list, tuple)) else [shapes]
        shade = shade or mix(base, line, 0.30)
        cid = self.uid()
        allp = ''.join(paint(s) for s in shapes)
        o = ['<clipPath id="%s">%s</clipPath>' % (cid, allp),
             '<g fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round">%s</g>' % (line, line, f(2 * ow), allp)]
        inner = []
        if cel:
            o.append('<g fill="%s">%s</g>' % (shade, allp))
            inner.append('<g fill="%s" transform="translate(%s %s)">%s</g>' % (base, f(SHIFT[0]), f(SHIFT[1]), allp))
        else:
            inner.append('<g fill="%s">%s</g>' % (base, allp))
        inner.extend(details)
        if hl:
            cx, cy, rx, ry = hl[:4]
            rot = hl[4] if len(hl) > 4 else -20
            inner.append(paint(E(cx, cy, rx, ry, rot), 'fill="#FFFFFF" opacity=".24"'))
        o.append('<g clip-path="url(#%s)">%s</g>' % (cid, ''.join(inner)))
        o.extend(over)
        return '\n'.join(o)

    def add(self, *items):
        self.out.extend(items)

    def group(self, transform, items):
        return '<g transform="%s">%s</g>' % (transform, '\n'.join(items))

    def svg(self):
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">\n%s\n</svg>\n'
                % (W, H, W, H, '\n'.join(self.out)))


def ground_shadow(x0=14, x1=226, op=.16):
    return fill(E((x0 + x1) / 2, BASE_Y - 1, (x1 - x0) / 2, 7), '#3E4A3A', op)


def tuft(x, y, col, s=1.0):
    """Little grass tuft at the base."""
    d = 'M%s %s Q%s %s %s %s M%s %s Q%s %s %s %s M%s %s Q%s %s %s %s' % (
        f(x - 7 * s), f(y), f(x - 9 * s), f(y - 9 * s), f(x - 12 * s), f(y - 13 * s),
        f(x), f(y), f(x), f(y - 10 * s), f(x + 1 * s), f(y - 16 * s),
        f(x + 6 * s), f(y), f(x + 9 * s), f(y - 8 * s), f(x + 13 * s), f(y - 11 * s))
    return stroke(P(d), col, 3.2 * s)


# ======================================================================= BUSH (spring)
BUSH = dict(base='#8EAA7C', line='#566E4C', shade='#77956A', dark='#46593F', hollow='#3E5137')


def bush_left():
    return [C(66, 132, 48), C(94, 94, 40), C(70, 82, 28), C(42, 162, 30),
            P('M22 196 C18 176 20 150 44 134 L120 120 L120 196 Z')]


def bush_right():
    return [C(174, 132, 48), C(146, 94, 40), C(170, 82, 28), C(198, 162, 30),
            P('M218 196 C222 176 220 150 196 134 L120 120 L120 196 Z')]


def bush_texture(xs):
    """Leafy scallop strokes + blossoms (only those whose x falls in xs)."""
    lo, hi = xs
    out = []
    scallops = [(52, 112), (86, 76), (110, 124), (64, 156), (100, 168), (40, 178), (130, 96), (152, 140),
                (176, 108), (196, 160), (138, 176), (168, 178), (82, 136), (156, 70), (120, 150)]
    for x, y in scallops:
        if lo <= x < hi:
            out.append(stroke(P('M%s %s q7 -8 14 0' % (f(x - 7), f(y))), BUSH['shade'], 3.2))
    return out


def blossoms(xs, pts=((78, 70), (118, 64), (160, 78), (48, 128), (196, 126), (100, 112), (140, 132), (62, 170),
                      (182, 168), (126, 92))):
    lo, hi = xs
    out = []
    for x, y in pts:
        if lo <= x < hi:
            for k in range(5):
                a = math.radians(k * 72 - 90)
                out.append(fill(C(x + 3.6 * math.cos(a), y + 3.6 * math.sin(a), 3.1), '#F6F2E8'))
            out.append(fill(C(x, y, 2.2), '#E3CF8E'))
    return out


def bush(open_):
    d = Doc()
    d.add(ground_shadow(10, 230))
    b = BUSH
    if not open_:
        shapes = bush_left() + bush_right() + [C(120, 86, 36)]
        d.add(d.part(shapes, b['base'], b['line'], b['shade'], details=bush_texture((0, 240)),
                     hl=(84, 74, 34, 14, -16), over=blossoms((0, 240))))
        d.add(tuft(30, 196, '#6E8C5E'), tuft(204, 196, '#6E8C5E', .9))
    else:
        # dark hollow between the parted halves (opaque: covers the friend down to the ground)
        d.add(d.part(P('M84 196 L86 66 C90 46 150 46 154 66 L156 196 Z'), b['hollow'], '#2F3E2A', cel=False))
        d.add(stroke(P('M96 120 q10 -14 22 -4 M126 150 q10 -12 20 -2 M100 176 q10 -10 18 0'), '#4E6345', 3.4))
        left = d.part(bush_left(), b['base'], b['line'], b['shade'], details=bush_texture((0, 120)),
                      hl=(70, 80, 26, 12, -16), over=blossoms((0, 120)))
        right = d.part(bush_right(), b['base'], b['line'], b['shade'], details=bush_texture((120, 240)),
                       hl=(150, 82, 22, 10, -16), over=blossoms((120, 240)))
        d.add(d.group('translate(22 196) rotate(-8) scale(0.86 1) translate(-22 -196)', [left]))
        d.add(d.group('translate(218 196) rotate(8) scale(0.86 1) translate(-218 -196)', [right]))
        # a few loose leaves flying out to the sides
        for cx, cy, rot in ((40, 44, -30), (204, 40, 30), (24, 70, -60), (222, 66, 50)):
            d.add(d.part(leaf_path(cx, cy, 16, 6, rot), b['base'], b['line'], ow=2.2, cel=False))
        d.add(tuft(30, 196, '#6E8C5E'), tuft(204, 196, '#6E8C5E', .9))
    return d.svg()


# ======================================================================= STUMP (spring)
STUMP = dict(bark='#9A7B5E', line='#5C4532', shade='#816449', top='#DCC398', ring='#BFA277', moss='#90A56C',
             mossl='#5F7448', hollow='#4A3626')


def stump_body():
    return P('''M10 196 C24 190 34 182 38 168 L40 62 C40 50 200 50 200 62 L202 168 C206 182 216 190 230 196 Z''')


def stump_bark_lines():
    out = []
    for x, y0, y1 in ((62, 96, 176), (92, 82, 150), (128, 104, 186), (160, 84, 160), (186, 100, 172), (106, 160, 190)):
        out.append(stroke(P('M%s %s C%s %s %s %s %s %s' % (f(x), f(y0), f(x - 4), f((y0 + y1) / 2), f(x + 4),
                                                         f((y0 + y1) / 2 + 10), f(x), f(y1))), STUMP['shade'], 3.6))
    return out


def stump(open_):
    d = Doc()
    s = STUMP
    d.add(ground_shadow(6, 234))
    d.add(d.part(stump_body(), s['bark'], s['line'], s['shade'], details=stump_bark_lines(), hl=(64, 100, 14, 34, 0)))
    # roots
    for pth in ('M38 168 C30 184 16 192 6 196 L44 196 C44 186 44 178 46 172 Z',
                'M202 168 C210 184 224 192 236 196 L196 196 C196 186 196 178 194 172 Z'):
        d.add(d.part(P(pth), s['bark'], s['line'], s['shade']))
    if not open_:
        rings = [stroke(E(120, 62, r * 1.5, r * .32), s['ring'], 3) for r in (14, 32, 50)]
        d.add(d.part(E(120, 62, 80, 14), s['top'], s['line'], mix(s['top'], s['ring'], .5), details=rings,
                     hl=(92, 58, 30, 5, 0), cel=False))
        d.add(fill(C(120, 62, 3.4), s['ring']))
        d.add(stroke(P('M182 62 L170 62'), s['ring'], 3))   # a crack
    else:
        # hollow stump: the rim with a dark inside; the friend pops out of the hollow
        d.add(d.part(E(120, 62, 80, 14), s['top'], s['line'], cel=False))
        d.add(fill(E(120, 63, 66, 9.5), s['hollow']))
        d.add(fill(P('M58 63 C70 56 170 56 182 63 C170 59 70 59 58 63 Z'), '#2E2118'))
        # the sawn-off lid knocked off, leaning on the right root
        lid = d.part(E(0, 0, 34, 8), s['top'], s['line'], cel=False,
                     details=[stroke(E(0, 0, 20, 4), s['ring'], 2.6)])
        d.add(d.group('translate(206 172) rotate(-62)', [lid]))
        for cx, cy, rot in ((30, 120, 20), (210, 104, -30), (40, 96, -40)):
            d.add(d.group('translate(%d %d) rotate(%d)' % (cx, cy, rot),
                          [d.part(R(-5, -2.5, 10, 5, 2), s['top'], s['line'], ow=2, cel=False)]))
    # moss draped over the left rim, little mushroom at the root
    moss = P('M40 62 C40 54 62 50 78 52 C74 60 66 62 66 70 C60 76 50 70 48 80 C42 84 40 76 40 70 Z')
    d.add(d.part(moss, s['moss'], s['mossl'], hl=(52, 58, 10, 4, -10)))
    d.add(d.part(P('M44 178 L44 168 C44 162 54 162 54 168 L54 178 Z'), '#EFE4D0', '#9C8A70', cel=False))
    d.add(d.part(P('M36 170 C36 156 62 156 62 170 Z'), '#C9A88C', '#8A6C55', hl=(44, 162, 6, 2, -10)))
    d.add(fill(C(44, 164, 2), '#F3EADB'), fill(C(53, 162, 1.6), '#F3EADB'))
    d.add(tuft(16, 196, '#6E8C5E'), tuft(222, 196, '#6E8C5E', .9))
    return d.svg()


# ======================================================================= TENT (summer)
TENT = dict(canvas='#E9DCC0', side='#D3C3A0', line='#8C7A58', inside='#6B5A42', inside2='#55462F',
            pole='#8A6E4E', rope='#A8987A', trim='#BBA67E')
TENT_APEX, TENT_RIDGE_END = (58, 58), (206, 62)


def tent(open_):
    d = Doc()
    t = TENT
    ax, ay = TENT_APEX
    rx, ry = TENT_RIDGE_END
    d.add(ground_shadow(4, 236))
    # guy ropes + pegs (behind)
    d.add(stroke(P('M%s %s L4 192' % (f(ax), f(ay))), t['rope'], 2.2))
    d.add(stroke(P('M%s %s L236 190' % (f(rx), f(ry))), t['rope'], 2.2))
    d.add(fill(R(1, 186, 6, 10, 2), t['pole']), fill(R(233, 184, 6, 10, 2), t['pole']))
    # poles sticking out at both ends of the ridge
    d.add(stroke(P('M%s %s L%s %s' % (f(ax), f(ay + 4), f(ax), f(ay - 14))), t['line'], 7.6))
    d.add(stroke(P('M%s %s L%s %s' % (f(ax), f(ay + 4), f(ax), f(ay - 14))), t['pole'], 4))
    d.add(stroke(P('M%s %s L%s %s' % (f(rx), f(ry + 4), f(rx), f(ry - 12))), t['line'], 7.6))
    d.add(stroke(P('M%s %s L%s %s' % (f(rx), f(ry + 4), f(rx), f(ry - 12))), t['pole'], 4))
    # side roof panel (seen at an angle), slightly darker
    side = P('M%s %s L%s %s C%s %s %s %s 228 194 L112 194 Z' % (f(ax), f(ay), f(rx), f(ry), f(rx + 6), f(ry + 40),
                                                               f(220), f(150)))
    seams = [stroke(P('M%s %s L%s 194' % (f(ax + (rx - ax) * k), f(ay + (ry - ay) * k), f(112 + 116 * k))),
                    mix(t['side'], t['line'], .35), 2.6) for k in (.34, .67)]
    seams.append(fill(P('M112 194 L228 194 L226 182 L116 182 Z'), t['trim']))
    d.add(d.part(side, t['side'], t['line'], mix(t['side'], t['line'], .22), details=seams,
                 hl=(150, 74, 50, 7, 2)))
    # front triangle face
    front = P('M%s %s L116 194 L4 194 Z' % (f(ax), f(ay)))
    fdet = [fill(P('M4 194 L116 194 L113 182 L8 182 Z'), t['trim'])]
    d.add(d.part(front, t['canvas'], t['line'], mix(t['canvas'], t['line'], .2), details=fdet,
                 hl=(44, 120, 8, 40, 20)))
    # a little patch on the side panel
    d.add(d.part(R(170, 128, 22, 18, 4), '#C8B48C', t['line'], ow=2, cel=False,
                 over=[stroke(P('M173 131 l3 3 M188 131 l-3 3 M173 143 l3 -3 M188 143 l-3 -3'), t['line'], 1.6)]))
    if not open_:
        # closed door: a seam down the middle with two toggles
        d.add(stroke(P('M%s %s L%s 192' % (f(ax), f(ay + 22), f(ax))), t['line'], 3.2))
        d.add(stroke(P('M%s %s Q%s %s %s 192 M%s %s Q%s %s %s 192' % (
            f(ax), f(ay + 22), f(ax - 18), f(150), f(ax - 30), f(ax), f(ay + 22), f(ax + 18), f(150), f(ax + 30))),
            mix(t['canvas'], t['line'], .3), 2.4))
        for y in (120, 158):
            d.add(d.part(R(ax - 8, y - 3, 16, 6, 3), t['pole'], '#5E4A34', ow=1.6, cel=False))
    else:
        # door thrown open: a dark doorway and the flap rolled up to the side
        door = P('M%s %s L%s 192 L%s 192 Z' % (f(ax), f(ay + 18), f(ax - 36), f(ax + 34)))
        d.add(d.part(door, t['inside'], '#4A3C2A', cel=False,
                     details=[fill(P('M%s %s L%s 192 L%s 192 Z' % (f(ax), f(ay + 30), f(ax - 10), f(ax + 30))),
                                   t['inside2'])]))
        flap = P('M%s %s L%s 192 C%s 176 %s 150 %s %s Z' % (f(ax), f(ay + 18), f(ax + 34), f(ax + 52), f(ax + 30),
                                                            f(ax + 6), f(ay + 26)))
        d.add(d.part(flap, t['canvas'], t['line'], mix(t['canvas'], t['line'], .25)))
        d.add(d.part(E(ax + 30, 150, 9, 30, -14), mix(t['canvas'], t['trim'], .5), t['line'], cel=False,
                     over=[stroke(P('M%s 148 l18 -4' % f(ax + 20)), t['pole'], 3.2)]))
    d.add(tuft(20, 196, '#7C9A5E'), tuft(124, 196, '#7C9A5E', .8), tuft(230, 196, '#7C9A5E', .8))
    return d.svg()


# ======================================================================= ROCK (summer)
ROCK = dict(base='#A8A79E', line='#626159', shade='#8E8D84', moss='#8FA06C', mossl='#5E6E46', crack='#7A796F')


def rock_shape():
    return P('M10 196 C2 150 16 90 50 66 C72 50 162 48 192 62 C226 80 240 150 232 196 Z')


def rock(open_):
    d = Doc()
    k = ROCK
    d.add(ground_shadow(4, 236))
    det = [stroke(P('M150 88 L162 108 L156 124'), k['crack'], 3.2), stroke(P('M70 142 L84 150 L82 166'), k['crack'], 3),
           fill(E(196, 150, 16, 10), mix(k['shade'], k['line'], .2), .6), fill(E(60, 110, 8, 5), k['shade'], .8),
           fill(E(116, 170, 10, 5), k['shade'], .8)]
    moss = P('M48 70 C66 52 120 48 150 52 C142 60 128 58 120 66 C110 72 96 64 88 74 C80 80 70 72 62 82 C54 86 46 80 48 70 Z')
    body = [d.part(rock_shape(), k['base'], k['line'], k['shade'], details=det, hl=(70, 82, 30, 14, -24)),
            d.part(moss, k['moss'], k['mossl'], hl=(80, 60, 18, 4, -6)),
            fill(C(104, 60, 2.6), '#F3EFE2'), fill(C(132, 56, 2.2), '#F3EFE2')]
    pebble = d.part(E(0, 0, 18, 12), k['base'], k['line'], k['shade'], hl=(-6, -5, 7, 3, -20))
    if not open_:
        d.add(*body)
        d.add(d.group('translate(212 186)', [pebble]))
    else:
        # the boulder tipped onto its right edge: dark gap under the lifted left side, pebble rolled away
        d.add(fill(P('M10 196 C14 176 60 172 120 176 L120 196 Z'), '#3E3D37'))
        d.add(d.group('rotate(4.5 232 196)', body))
        d.add(d.group('translate(24 184) rotate(-40)', [pebble]))
        for cx, cy, r in ((40, 168, 7), (54, 160, 5), (28, 176, 5)):
            d.add(fill(C(cx, cy, r), '#E7E1CF', .8))
    d.add(tuft(118, 196, '#7C9A5E', .9), tuft(232, 196, '#7C9A5E', .7))
    return d.svg()


# ======================================================================= LEAVES (autumn)
LEAF = dict(pile='#A88A5C', line='#6B5235', shade='#8F7349', hollow='#4E3B27',
            cols=['#C1A267', '#A98458', '#AD7556', '#9C9A62', '#B98F5E', '#B5805C'])


def leaves_mound(side=None):
    if side is None:
        return P('M14 196 C12 150 24 92 52 68 C78 52 162 50 188 68 C216 92 228 150 226 196 Z')
    if side == 'L':
        return P('M14 196 C12 150 24 92 52 68 C72 56 100 52 110 56 C118 60 120 66 120 76 L122 196 Z')
    return P('M226 196 C228 150 216 92 188 68 C168 56 140 52 130 56 C122 60 120 66 120 76 L118 196 Z')


LEAF_PTS = [(54, 72, -30), (80, 60, 10), (108, 56, -12), (134, 56, 22), (162, 60, -8), (188, 72, 40),
            (34, 102, -60), (206, 100, 60), (70, 96, 30), (102, 86, -40), (140, 90, 16), (172, 98, -24),
            (52, 134, 10), (92, 124, 70), (126, 120, -20), (160, 130, 34), (196, 140, -50), (26, 150, 80),
            (72, 160, -14), (112, 156, 40), (150, 164, -60), (188, 172, 18), (40, 180, -30), (96, 184, 12),
            (138, 186, -10), (216, 182, 70), (122, 70, 80), (64, 120, -70)]


def leaf_items(d, pts, sel=lambda x: True):
    out = []
    for i, (x, y, rot) in enumerate(pts):
        if not sel(x):
            continue
        col = LEAF['cols'][i % len(LEAF['cols'])]
        lp = leaf_path(x, y, 30, 10, rot)
        a = math.radians(rot)
        vein = P('M%s %s L%s %s' % (f(x - 12 * math.cos(a)), f(y - 12 * math.sin(a)),
                                    f(x + 12 * math.cos(a)), f(y + 12 * math.sin(a))))
        out.append(d.part(lp, col, LEAF['line'], ow=2.2, cel=False,
                          over=[stroke(vein, mix(col, LEAF['line'], .45), 1.8)]))
    return out


def leaves(open_):
    d = Doc()
    L = LEAF
    d.add(ground_shadow(4, 236))
    if not open_:
        d.add(d.part(leaves_mound(), L['pile'], L['line'], L['shade'], hl=(80, 82, 34, 12, -14)))
        d.add(*leaf_items(d, LEAF_PTS))
    else:
        d.add(d.part(P('M86 196 L88 66 C94 48 146 48 152 66 L154 196 Z'), L['hollow'], '#33261A', cel=False))
        left = [d.part(leaves_mound('L'), L['pile'], L['line'], L['shade'], hl=(60, 86, 22, 10, -14))]
        left += leaf_items(d, LEAF_PTS, lambda x: x < 108)
        right = [d.part(leaves_mound('R'), L['pile'], L['line'], L['shade'], hl=(160, 82, 18, 8, -14))]
        right += leaf_items(d, LEAF_PTS, lambda x: x > 132)
        d.add(d.group('translate(16 196) rotate(-8) scale(0.86 1) translate(-16 -196)', left))
        d.add(d.group('translate(224 196) rotate(8) scale(0.86 1) translate(-224 -196)', right))
        # leaves blown up into the air (to the sides so the peek stays clear)
        fly = [(34, 34, -20), (56, 16, 40), (16, 60, 70), (200, 22, -40), (224, 46, 20), (180, 8, 60), (90, 22, 80),
               (150, 16, -60)]
        d.add(*leaf_items(d, fly))
    return d.svg()


# ======================================================================= LOG (autumn)
LOG = dict(bark='#8E7055', line='#553F2D', shade='#76593F', end='#D8BB8E', ring='#B99A6E', hollow='#3F2E20',
           moss='#8D9C62', mossl='#5D6A40')


def log_body():
    return P('M44 66 L206 66 C232 66 236 196 206 196 L44 196 Z')


def log(open_):
    d = Doc()
    g = LOG
    d.add(ground_shadow(6, 234))
    det = [stroke(P('M%s %s C%s %s %s %s %s %s' % (f(x0), f(y), f(x0 + 40), f(y - 6), f(x0 + 80), f(y + 6),
                                                   f(x0 + 120), f(y))), g['shade'], 3.4)
           for x0, y in ((70, 98), (96, 128), (60, 160), (120, 178), (110, 84))]
    det.append(fill(E(150, 148, 10, 6), g['line'], .5))    # knot hole
    body = [d.part(log_body(), g['bark'], g['line'], g['shade'], details=det, hl=(120, 80, 70, 6, 0))]
    # branch stub
    body.append(d.part(P('M178 72 L186 46 C188 40 198 42 196 48 L192 72 Z'), g['bark'], g['line'], g['shade']))
    body.append(fill(E(191, 45, 4.5, 2.5, 20), g['end']))
    # cut end with rings and a dark hollow
    rings = [stroke(E(44, 131, 24, 52), g['ring'], 3), stroke(E(44, 131, 34, 60), g['ring'], 2.4)]
    body.append(d.part(E(44, 131, 40, 65), g['end'], g['line'], cel=False, details=rings,
                       over=[d.part(E(46, 132, 17, 38), g['hollow'], '#2B1F15', cel=False)]))
    # moss on the top
    moss = P('M70 66 C74 58 132 56 150 62 C146 70 136 68 130 74 C122 80 112 72 104 78 C96 82 86 74 78 78 C70 80 66 72 70 66 Z')
    body.append(d.part(moss, g['moss'], g['mossl'], hl=(96, 62, 18, 3, 0)))
    # small beige mushroom by the hollow end
    mush = [d.part(R(-4, -14, 8, 14, 3), '#EFE4D0', '#9C8A70', cel=False),
            d.part(P('M-14 -10 C-14 -26 14 -26 14 -10 Z'), '#C8A68A', '#86684F', hl=(-5, -18, 5, 2, -10))]
    if not open_:
        d.add(*body)
        d.add(d.group('translate(222 196)', mush))
    else:
        # the log rocked back / tipped up at the hollow end: a dark gap under it, a little dust
        d.add(fill(P('M10 196 C20 180 70 176 130 186 L130 196 Z'), '#3A2C20'))
        d.add(d.group('rotate(6 214 196)', body))
        d.add(d.group('translate(214 196) rotate(10)', mush))
        for cx, cy, r in ((18, 178, 7), (34, 172, 5), (8, 166, 4)):
            d.add(fill(C(cx, cy, r), '#E3D3B6', .8))
    return d.svg()


# ======================================================================= SNOWMAN (winter)
SNOW = dict(snow='#F4F6F9', shade='#D3DDE9', line='#8494AA', scarf='#8C7B6B', scarfd='#5E5045', coal='#56565E',
            twig='#7A5E45', nose='#D8A27A', nosel='#A06C48')


def snowman_body():
    return P('M10 196 C0 150 14 86 58 70 C94 58 162 58 196 70 C232 88 242 156 230 196 Z')


def snowman_head(d):
    s = SNOW
    eyes = []
    for ex in (-10, 11):
        eyes.append(fill(C(ex, -4, 4.4), '#2F2A3A'))
        eyes.append(fill(C(ex - 1.4, -5.6, 1.5), '#FFFFFF'))
    smile = [fill(C(x, y, 1.9), s['coal']) for x, y in ((-10, 9), (-4, 12), (3, 12), (9, 9))]
    cheeks = [fill(E(-18, 5, 5, 3), '#F2B4B0', .7), fill(E(19, 5, 4.5, 3), '#F2B4B0', .7)]
    nose = d.part(P('M2 0 L22 4 L2 6 Z'), s['nose'], s['nosel'], ow=1.8, cel=False)
    return [d.part(C(0, 0, 30), s['snow'], s['line'], s['shade'], hl=(-10, -12, 10, 6, -30),
                   over=eyes + smile + cheeks + [nose])]


def snowman(open_):
    d = Doc()
    s = SNOW
    d.add(ground_shadow(6, 234, .12))
    # twig arms (behind the body): one up-and-out on the right, one out on the left
    for pth in ('M206 120 L234 84 M226 94 L236 96 M222 100 L220 88', 'M30 128 L4 108 M12 114 L8 102 M16 118 L4 120'):
        d.add(stroke(P(pth), '#4E3B2C', 7.4), stroke(P(pth), s['twig'], 4))
    det = [fill(E(170, 170, 40, 16), s['shade'], .7)]
    sparkles = [fill(C(x, y, 1.8), '#FFFFFF') for x, y in ((150, 100), (188, 132), (100, 150))]
    d.add(d.part(snowman_body(), s['snow'], s['line'], s['shade'], details=det, hl=(86, 98, 40, 14, -14),
                 over=sparkles))
    for y in (112, 142, 172):
        d.add(d.part(C(120, y, 6.4), s['coal'], '#38383E', ow=1.8, cel=False,
                     over=[fill(C(118, y - 2, 1.8), '#8A8A92')]))
    head = snowman_head(d)
    scarf_knot = d.part(P('M-30 26 C-10 36 20 36 34 24 L36 36 C18 48 -14 48 -34 38 Z'), s['scarf'], s['scarfd'],
                        details=[stroke(P('M-20 32 L-18 44 M-6 36 L-6 46 M8 36 L8 46 M22 32 L22 42'),
                                        mix(s['scarf'], s['scarfd'], .5), 2.4)])
    tail = d.part(P('M20 36 L36 34 L40 72 L26 74 Z'), s['scarf'], s['scarfd'],
                  details=[stroke(P('M24 50 L38 49 M25 62 L39 61'), mix(s['scarf'], s['scarfd'], .5), 2.4)],
                  over=[stroke(P('M28 74 L27 80 M33 73 L33 80 M38 72 L39 79'), s['scarfd'], 2.4)])
    if not open_:
        # head perched on the left shoulder (outside the peek zone), scarf around the neck
        d.add(d.group('translate(62 52)', [tail] + head + [scarf_knot]))
    else:
        # head lifted up and tipped, snow puffs where it sat
        for cx, cy, r in ((40, 74, 9), (60, 70, 7), (84, 74, 8), (26, 84, 6)):
            d.add(fill(C(cx, cy, r), '#FFFFFF', .9))
        d.add(d.group('translate(58 40) rotate(-14)', [tail, scarf_knot] + head))
    return d.svg()


# ======================================================================= DRIFT (winter)
FIR = dict(base='#728F7B', line='#465F50', shade='#5F7B68', trunk='#7A5E45')


def drift_shape(side=None):
    if side is None:
        return P('M12 196 C10 150 22 86 58 66 C88 52 160 52 190 64 C222 84 230 150 228 196 Z')
    if side == 'L':
        return P('M12 196 C10 150 22 86 58 66 C78 56 100 52 110 56 C118 60 120 66 120 76 L122 196 Z')
    return P('M228 196 C230 150 222 84 190 64 C170 55 140 52 130 56 C122 60 120 66 120 76 L118 196 Z')


def fir(d, x, y, s=1.0):
    tiers = []
    for i, (w, h, ty) in enumerate(((30, 30, -36), (24, 26, -58), (17, 22, -78))):
        tiers.append(P('M%s %s L%s %s L%s %s Z' % (f(x - w * s), f(y + ty * s), f(x), f(y + (ty - h * 1.5) * s),
                                                    f(x + w * s), f(y + ty * s))))
    snowcaps = [fill(P('M%s %s l%s %s l%s %s z' % (f(x - 8 * s), f(y + (ty - h * 1.1) * s), f(8 * s), f(-h * .45 * s),
                                                   f(8 * s), f(h * .45 * s))), '#F4F6F9')
                for (w, h, ty) in ((30, 30, -36), (24, 26, -58), (17, 22, -78))]
    return [d.part(R(x - 5 * s, y - 40 * s, 10 * s, 40 * s, 3), FIR['trunk'], '#4E3B2C', cel=False),
            d.part(tiers, FIR['base'], FIR['line'], FIR['shade'], hl=(x - 10 * s, y - 80 * s, 6, 16, 20),
                   over=snowcaps)]


def drift(open_):
    d = Doc()
    s = SNOW
    d.add(ground_shadow(4, 236, .12))
    d.add(*fir(d, 212, 120, 1.0))           # small fir behind the right shoulder of the drift
    d.add(*fir(d, 30, 110, .6))
    sp = [fill(C(x, y, 1.8), '#FFFFFF') for x, y in ((150, 96), (80, 120), (190, 150), (120, 168))]
    det = [fill(E(176, 176, 48, 14), s['shade'], .7), stroke(P('M60 150 q20 -10 40 0'), s['shade'], 3),
           stroke(P('M140 128 q20 -10 40 0'), s['shade'], 3)]
    det += [stroke(P('M34 120 q14 -8 28 0'), s['shade'], 3), stroke(P('M170 104 q12 -7 24 0'), s['shade'], 3),
            fill(E(64, 186, 30, 9), s['shade'], .7)]
    lump = d.part(P('M150 196 C150 170 170 160 190 162 C212 164 226 180 226 196 Z'), s['snow'], s['line'], s['shade'],
                  hl=(178, 170, 12, 4, -10), over=[fill(C(196, 172, 1.8), '#FFFFFF')])
    stones = [d.part(E(36, 192, 9, 5), '#9C9FA6', '#62656E', cel=False), d.part(E(50, 194, 6, 3.5), '#9C9FA6', '#62656E', cel=False)]
    if not open_:
        d.add(d.part(drift_shape(), s['snow'], s['line'], s['shade'], details=det, hl=(86, 84, 40, 12, -12), over=sp))
        d.add(lump, *stones)
        d.add(stroke(P('M160 64 L168 48 M168 56 L174 52'), '#4E3B2C', 5), stroke(P('M160 64 L168 48 M168 56 L174 52'),
                                                                               s['twig'], 2.6))
    else:
        d.add(d.part(P('M86 196 L88 66 C94 48 146 48 152 66 L154 196 Z'), '#B7C6D9', '#7C8CA4', cel=False,
                     details=[fill(P('M96 196 L98 100 C104 86 136 86 142 100 L144 196 Z'), '#A5B6CC')]))
        left = d.part(drift_shape('L'), s['snow'], s['line'], s['shade'], details=det, hl=(66, 88, 26, 10, -12))
        right = d.part(drift_shape('R'), s['snow'], s['line'], s['shade'], details=det, hl=(160, 84, 20, 8, -12))
        d.add(d.group('translate(14 196) rotate(-8) scale(0.86 1) translate(-14 -196)', [left]))
        d.add(d.group('translate(226 196) rotate(8) scale(0.86 1) translate(-226 -196)', [right]))
        d.add(d.group('translate(10 4)', [lump]), *stones)
        # snow puffs bursting up at the sides
        for cx, cy, r in ((30, 50, 10), (48, 34, 8), (16, 30, 6), (200, 38, 9), (218, 22, 7), (66, 54, 7),
                          (178, 56, 7)):
            d.add(d.part(C(cx, cy, r), '#FFFFFF', s['line'], ow=1.6, cel=False))
    return d.svg()


BUILDERS = {'bush': bush, 'stump': stump, 'tent': tent, 'rock': rock, 'leaves': leaves, 'log': log,
            'snowman': snowman, 'drift': drift}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for k in KINDS:
        for open_ in (False, True):
            name = k + ('_open' if open_ else '') + '.svg'
            with open(os.path.join(OUT, name), 'w') as fh:
                fh.write(BUILDERS[k](open_))
        meta[k] = {'peekY': PEEK[k], 'season': SEASON[k]}
    with open(os.path.join(OUT, 'spots.json'), 'w') as fh:
        json.dump(meta, fh, indent=2)
        fh.write('\n')
    print('wrote %d files to %s' % (2 * len(KINDS) + 1, OUT))


if __name__ == '__main__':
    main()
