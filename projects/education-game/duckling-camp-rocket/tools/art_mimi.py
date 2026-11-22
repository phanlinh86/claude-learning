#!/usr/bin/env python3
"""Character art generator for Mimi's Splash Rocket (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/mimi_{idle,blink,talk,happy,cheer,think,oops,pump,wave,giggle,dance,look}.svg + mimi_title.svg
        0 0 300 300, FEET ANCHOR (150,290). Mimi = a small round fluffy cream duckling in a khaki bucket hat, 3/4 view
        facing RIGHT. The body (fluffy down, tail tuft, belly, feet) is identical in every frame except pump (squashed
        1.06 x 0.90 about the feet line) and dance (rocks + lifts a foot); the head (with the hat) may tilt about the
        neck; the face features and the wings change per pose.
  characters/rocket.svg            0 0 120 240  bottle rocket, nose UP, anchor = nozzle bottom (60,236)
  characters/chute.svg             0 0 240 200  open 6-gore canopy, cords meet at (120,196)
  characters/chute_closed.svg      0 0 240 200  folded bundle, same attachment point (120,196)
  characters/marmot.svg, marmot_wave.svg   0 0 160 160  anchor bottom-centre (80,156) (pops out of a burrow)
  characters/goat.svg, goat_hop.svg        0 0 180 180  feet (90,174), facing LEFT
  characters/bird.svg, bird_sing.svg       0 0 100 90   perch feet (50,86), facing LEFT
  icon.svg                                 0 0 512 512  full bleed, opaque, no text
Also writes game/js/mimi_points.js (DK.MIMI_POINTS, DK.ROCKET_POINTS).

Usage: python3 tools/art_mimi.py   then   node tools/mimi_sheet.js   and   node tools/render_icons.js
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone of the fill (never black),
one-step cel shade (lower right) + one soft highlight (upper left); no <text>/fonts/scripts/external refs, no filters.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
JS_OUT = os.path.join(ROOT, 'game', 'js', 'mimi_points.js')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # DESIGN.md section 3, exact hex — Mimi is never an answer colour (NOT yellow)
    'down': '#FBF3DD', 'downSh': '#EADBB5', 'downLine': '#A8936A', 'downHi': '#FFFCF2',
    'bill': '#F0A982', 'billSh': '#D98A64', 'billLine': '#A9634A', 'billHi': '#F8CBB0',
    'eye': '#2A1E1A', 'cheek': '#F4B3A6', 'mouth': '#8E4A40', 'tongue': '#EE9A92',
    'hat': '#C9B48A', 'hatSh': '#B39E74', 'hatBand': '#8A7350', 'hatLine': '#7A6544', 'hatHi': '#DCCCA6',
    # rocket
    'glass': '#DDEFF2', 'glassLine': '#7FA3AA', 'water': '#B9DDE3', 'waterSh': '#9FCBD3',
    'nose': '#F6EEDC', 'noseSh': '#E6DAC0', 'noseLine': '#A8936A',
    'fin': '#C9B48A', 'finSh': '#B39E74', 'finLine': '#7A6544', 'cap': '#8A7350', 'capLine': '#5E4D34',
    # parachute
    'gA': '#F6EEDC', 'gAsh': '#E6DAC0', 'gB': '#8FB8B2', 'gBsh': '#7AA59F', 'gLine': '#5E8580', 'cord': '#6F8F8A',
    # marmot
    'mar': '#C59A6A', 'marSh': '#AA8052', 'marLine': '#765634', 'marBelly': '#EBD3AE', 'marNose': '#5A3E2E',
    # goat
    'goat': '#F7F4EE', 'goatSh': '#E2DACB', 'goatLine': '#958B7C', 'horn': '#C8B99E', 'hornLine': '#8B7C64',
    'hoof': '#7A6C60', 'earIn': '#F2C3BA',
    # bird
    'bird': '#B8B2CF', 'birdSh': '#9D96BA', 'birdLine': '#6C668E', 'breast': '#F6C9AC', 'breastSh': '#E8B092',
    'beak': '#E9A37E', 'beakLine': '#A9634A',
}

FEET = (150, 290)
BODY = (142, 216, 80, 58)       # body ellipse cx, cy, rx, ry (bottom at 274: the feet show below)
HEAD = (180, 130, 60)           # head circle cx, cy, r
NECK = (176, 186)               # head-tilt pivot
EYE_N = (192, 124, 15)
EYE_F = (231, 117, 11)
HINGE = (224, 155)              # bill hinge (lower jaw rotates about it)
SH_N = (150, 206)               # near wing shoulder
SH_F = (214, 200)               # far wing shoulder
PUMP = (1.06, 0.90)             # pump squash about the feet line
PUMP_PIV = (150, 284)


# ------------------------------------------------------------------ tiny SVG helpers
def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def svg(w, h, body, defs=''):
    d = f'<defs>{defs}</defs>' if defs else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{d}{body}</svg>\n')


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as fh:
        fh.write(text)


def ell(cx, cy, rx, ry, a=''):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" {a}/>'


def circ(cx, cy, r, a=''):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {a}/>'


def path(d, a=''):
    return f'<path d="{d}" {a}/>'


def st(col, w, fill='none'):
    return f'fill="{fill}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"'


def fl(fill, line, w=LW):
    return f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"'


def rot(x, y, ang, cx=0, cy=0):
    a = math.radians(ang)
    dx, dy = x - cx, y - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


def P2(p):
    return f'{f(p[0])},{f(p[1])}'


def ptsd(pts, close=True):
    """Smooth path through points (Catmull-Rom -> cubic Bezier)."""
    n = len(pts)
    d = f'M{P2(pts[0])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if close or i > 0 else pts[0]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if close or i + 2 < n else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{P2(c1)} {P2(c2)} {P2(p2)}'
    return d + (' Z' if close else '')


def fluff_d(cx, cy, rx, ry, n, amp, a0=0.0, ampf=None):
    """A fluffy (scalloped) ellipse, clockwise: n bumps; amp(angle) = bump height (units); cusps between bumps."""
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + 360 * i / n)
        pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    d = f'M{P2(pts[0])}'
    for i in range(n):
        am = a0 + 360 * (i + 0.5) / n
        k = amp * (ampf(am % 360) if ampf else 1.0)
        a = math.radians(am)
        # control point pushed out: a quadratic peak of height ~k/2 + the ellipse sagitta
        sag = 1.0 / math.cos(math.pi / n)
        c = (cx + (rx * sag + 2 * k) * math.cos(a), cy + (ry * sag + 2 * k) * math.sin(a))
        d += f' Q{P2(c)} {P2(pts[i + 1])}'
    return d + ' Z'


class Doc:
    """Collects <defs> with unique ids (a prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='m'):
        self.prefix, self.defs, self.n = prefix, [], 0

    def uid(self, k='g'):
        self.n += 1
        return f'{self.prefix}{k}{self.n}'

    def add(self, kind, inner, attrs=''):
        i = self.uid(kind[0])
        self.defs.append(f'<{kind} id="{i}" {attrs}>{inner}</{kind}>')
        return i

    def clip(self, inner):
        return self.add('clipPath', inner)

    def solid(self, d, base, shade, line, dx=-10, dy=-9, w=LW, hi='', inner=''):
        """Union-outlined cel-shaded shape: a thick stroke underneath (only the silhouette shows), the shade colour,
        then the base colour shifted up-left inside a clip (so the shade is a crescent lower-right)."""
        cid = self.clip(f'<path d="{d}"/>')
        o = path(d, f'fill="{line}" stroke="{line}" stroke-width="{f(2 * w)}" stroke-linejoin="round"') if w else ''
        o += path(d, f'fill="{shade}"')
        o += (f'<g clip-path="url(#{cid})"><path d="{d}" fill="{base}" transform="translate({f(dx)},{f(dy)})"/>'
              f'{hi}{inner}</g>')
        return o


def g(inner, tr):
    return f'<g transform="{tr}">{inner}</g>' if tr else inner


# ======================================================================= MIMI
def body_d():
    cx, cy, rx, ry = BODY
    # fluff on the top/back, smooth underneath
    def af(a):
        s = math.sin(math.radians(a))
        return max(0.0, 1 - max(0.0, s) * 1.6)
    d = fluff_d(cx, cy, rx, ry, 16, 4.2, a0=10, ampf=af)
    # tail tuft (back, pointing up-left) — two little flicks
    d += ' ' + ptsd(list(reversed([(76, 192), (54, 174), (44, 166), (52, 182), (40, 180), (58, 202), (82, 210)])))
    return d


def body(doc):
    cx, cy, rx, ry = BODY
    hi = ell(108, 196, 30, 15, f'fill="{P["downHi"]}" opacity=".9" transform="rotate(-25 108 196)"')
    # belly: lighter down patch with a scalloped top edge
    belly = ''
    bpts = []
    for i in range(7):
        x = 150 + i * 13
        bpts.append((x, 236 + (i % 2) * 6 - math.sin(i / 6 * math.pi) * 8))
    belly = ell(184, 252, 42, 28, f'fill="{P["downHi"]}" opacity=".75"')
    # a few soft down marks (texture)
    marks = ('M96,234 q6,4 12,0 M112,252 q6,4 12,0 M84,214 q5,3 10,0 M130,268 q6,3 12,0', )
    inner = belly + path(marks[0], st(P['downSh'], 3) + ' opacity=".9"')
    return doc.solid(body_d(), P['down'], P['downSh'], P['downLine'], dx=-9, dy=-10, hi=hi, inner=inner)


def foot(x, by, s=1.0, a=0.0, behind=False):
    """A webbed peach foot, toes to the RIGHT, bottom at y=by, heel near x-14."""
    loc = [(-15, -3), (-14, -12), (-2, -14), (12, -12), (22, -9), (27, -4), (25, 0), (19, -1), (15, 1), (9, -1),
           (4, 1), (-8, 0), (-14, 0)]
    pts = [(x + px * s, by + py * s) for px, py in loc]
    if a:
        pts = [rot(px, py, a, x, by) for px, py in pts]
    col = P['billSh'] if behind else P['bill']
    o = path(ptsd(pts), fl(col, P['billLine'], 3.8))
    w1 = [(x + 6 * s, by - 9 * s), (x + 9 * s, by - 2 * s)]
    w2 = [(x + 14 * s, by - 10 * s), (x + 19 * s, by - 3 * s)]
    if a:
        w1 = [rot(px, py, a, x, by) for px, py in w1]
        w2 = [rot(px, py, a, x, by) for px, py in w2]
    o += path(f'M{P2(w1[0])} L{P2(w1[1])} M{P2(w2[0])} L{P2(w2[1])}', st(P['billSh'] if not behind else P['billLine'], 2.4))
    if not behind:
        o += ell(x - 2 * s, by - 9 * s, 6 * s, 2.6 * s, f'fill="{P["billHi"]}" opacity=".8"')
    return o


def legs(lift=False):
    o = path('M126,266 L128,282', st(P['billLine'], 10)) + path('M126,266 L128,282', st(P['billSh'], 4.6))
    o += foot(126, 285, 0.92, behind=True)
    if lift:
        o += path('M166,266 L178,270', st(P['billLine'], 10)) + path('M166,266 L178,270', st(P['bill'], 4.6))
        o += foot(180, 274, 1.0, a=-22)
    else:
        o += path('M166,266 L168,284', st(P['billLine'], 10)) + path('M166,266 L168,284', st(P['bill'], 4.6))
        o += foot(168, 288, 1.0)
    return o


def wing_pts(sh, ang, L=54, w=21):
    loc = [(0, -w * 0.75), (L * 0.45, -w * 1.0), (L * 0.85, -w * 0.62), (L * 1.02, -w * 0.12),
           (L * 0.92, w * 0.32), (L * 0.80, w * 0.18), (L * 0.70, w * 0.62), (L * 0.56, w * 0.42),
           (L * 0.40, w * 0.82), (L * 0.18, w * 0.86), (0, w * 0.75)]
    return [(sh[0] + x, sh[1] + y) for x, y in (rot(a, b, ang) for a, b in loc)]


def wing(doc, sh, ang, L=54, w=21, behind=False, motion=False):
    pts = wing_pts(sh, ang, L, w)
    d = ptsd(pts)
    if behind:
        o = path(d, fl(P['downSh'], P['downLine']))
    else:
        o = doc.solid(d, P['down'], P['downSh'], P['downLine'], dx=-5, dy=-6)
        # one feather crease
        a, b = rot(L * 0.30, w * 0.1, ang), rot(L * 0.72, w * 0.05, ang)
        o += path(f'M{f(sh[0] + a[0])},{f(sh[1] + a[1])} L{f(sh[0] + b[0])},{f(sh[1] + b[1])}', st(P['downSh'], 3))
    if motion:
        tx, ty = sh[0] + rot(L, 0, ang)[0], sh[1] + rot(L, 0, ang)[1]
        o += path(f'M{f(tx - 22)},{f(ty - 14)} Q{f(tx - 30)},{f(ty + 2)} {f(tx - 22)},{f(ty + 16)} '
                  f'M{f(tx - 34)},{f(ty - 20)} Q{f(tx - 44)},{f(ty + 2)} {f(tx - 34)},{f(ty + 22)}',
                  st('#FFFFFF', 3.6) + ' opacity=".95"')
    return o


def wing_tip(sh, ang, L=54):
    x, y = rot(L * 1.02, 0, ang)
    return round(sh[0] + x), round(sh[1] + y)


def head_d():
    cx, cy, r = HEAD
    def af(a):  # fluffy at the back of the head and the cheeks/chin, smooth at the face
        if 300 <= a or a <= 40:
            return 0.0
        return 1.0
    return fluff_d(cx, cy, r, r * 0.97, 14, 3.2, a0=-5, ampf=af)


def hat(doc):
    """Khaki bucket hat sitting on the head (slight tilt back)."""
    o = ''
    cx = 176
    # back brim (behind the crown)
    brim = ell_d_rot(cx, 84, 76, 17, -5)
    o += doc.solid(brim, P['hat'], P['hatSh'], P['hatLine'], dx=-3, dy=-5, w=4.2)
    # crown: rounded dome
    crown = ptsd([(120, 84), (124, 58), (138, 40), (164, 32), (194, 34), (218, 46), (230, 66), (232, 80), (200, 88),
                  (160, 90)])
    hi = ell(150, 50, 18, 9, f'fill="{P["hatHi"]}" opacity=".9" transform="rotate(-18 150 50)"')
    o += doc.solid(crown, P['hat'], P['hatSh'], P['hatLine'], dx=-6, dy=-6, w=4.2, hi=hi)
    # stitch lines on the crown
    o += path('M146,40 Q140,60 142,84 M196,36 Q206,58 206,84', st(P['hatSh'], 2.6) + ' opacity=".9"')
    # band
    band = ptsd([(121, 74), (160, 80), (200, 78), (231, 70), (232, 82), (200, 92), (160, 94), (120, 86)])
    o += path(band, fl(P['hatBand'], P['hatLine'], 3.4))
    # a little cream feather tucked in the band
    o += circ(138, 85, 7.5, fl(P['gB'], P['gLine'], 2.6)) + circ(136, 83, 2.6, 'fill="#FFFFFF" opacity=".8"')
    # front brim lip (the near half of the brim, over the crown base)
    lip = ptsd([(104, 92), (140, 98), (180, 100), (222, 94), (252, 80), (256, 88), (226, 106), (180, 112), (136, 108),
                (102, 100)])
    o += doc.solid(lip, P['hat'], P['hatSh'], P['hatLine'], dx=-2, dy=-5, w=4.2)
    o += path('M110,99 Q180,112 250,86', st(P['hatSh'], 2.2) + ' stroke-dasharray="5 6"')
    return o


def ell_d_rot(cx, cy, rx, ry, a):
    pts = []
    for i in range(24):
        t = 2 * math.pi * i / 24
        pts.append(rot(cx + rx * math.cos(t), cy + ry * math.sin(t), a, cx, cy))
    return ptsd(pts)


def tufts():
    """Down tufts peeking out from under the hat brim (back of the head + a forelock)."""
    d = ptsd([(118, 104), (100, 98), (94, 92), (106, 92), (100, 84), (116, 90), (126, 98)])
    d2 = ptsd([(228, 106), (240, 108), (250, 104), (246, 112), (234, 116), (226, 114)])
    return d + ' ' + d2


def eye(cx, cy, r, mode, look=(0, 0)):
    o = ''
    if mode in ('open', 'wide', 'up', 'det'):
        rr = r * (1.1 if mode == 'wide' else 1.0)
        ry = rr * (1.12 if mode in ('up', 'wide') else 1.06)
        o += ell(cx, cy, rr, ry, f'fill="{P["eye"]}"')
        px, py = cx + look[0] * r / 12, cy + look[1] * r / 12
        o += circ(px - rr * 0.32, py - rr * 0.36, rr * 0.38, 'fill="#FFFFFF"')
        o += circ(px + rr * 0.36, py + rr * 0.38, rr * 0.16, 'fill="#FFFFFF"')
    elif mode == 'closed':
        o += path(f'M{f(cx - r * 0.95)},{f(cy)} Q{f(cx)},{f(cy + r * 0.85)} {f(cx + r * 0.95)},{f(cy)}', st(P['eye'], 4.4))
    elif mode == 'happy':
        o += path(f'M{f(cx - r * 0.95)},{f(cy + r * 0.35)} Q{f(cx)},{f(cy - r * 1.0)} {f(cx + r * 0.95)},{f(cy + r * 0.35)}',
                  st(P['eye'], 4.8))
    return o


UPPER = [(219, 141), (240, 135), (262, 136), (276, 142), (282, 150), (276, 156), (256, 157), (236, 158), (220, 158)]
LOWER = [(222, 156), (244, 157), (264, 157), (272, 160), (264, 167), (244, 169), (226, 166)]


def bill(mode):
    """Duck bill: upper mandible fixed, the lower one rotates about HINGE."""
    ang = {'closed': 0, 'talk': 15, 'big': 24, 'o': 10, 'hmm': 0, 'grin': 6}[mode]
    lo = [rot(x, y, ang, *HINGE) for x, y in LOWER]
    o = ''
    if ang:
        # mouth interior between the mandibles
        inner = [(224, 156), (262, 156), (276, 154)] + [rot(x, y, ang, *HINGE) for x, y in ((268, 158), (240, 160))]
        o += path(ptsd(inner), fl(P['mouth'], P['billLine'], 2.6))
        tx, ty = rot(250, 162, ang * 0.75, *HINGE)
        o += ell(tx, ty, 10, 4.5, f'fill="{P["tongue"]}" transform="rotate({f(ang * 0.6)} {f(tx)} {f(ty)})"')
    o += path(ptsd(lo), fl(P['billSh'], P['billLine'], 3.8))
    o += path(ptsd(UPPER), fl(P['bill'], P['billLine'], 3.8))
    o += path('M232,142 Q252,138 268,142', st(P['billHi'], 4) + ' opacity=".95"')   # highlight
    o += ell(266, 144, 2.6, 1.8, f'fill="{P["billSh"]}"')                             # nostril
    if mode in ('closed', 'hmm', 'grin'):
        # the seam: a smile curling up at the back
        if mode == 'hmm':
            o += path('M224,158 Q240,160 254,157 Q266,154 274,157', st(P['billLine'], 3))
        else:
            o += path('M216,150 Q218,160 228,159 Q252,160 276,155', st(P['billLine'], 3))
    return o


#            eyes      bill     tilt  brows        look      near wing          far wing           lift
POSES = {
    'idle':   ('open',   'closed',  0,  None,        (-1, 1),  ('rest',),         ('rest',),         False),
    'blink':  ('closed', 'closed',  0,  None,        (-1, 1),  ('rest',),         ('rest',),         False),
    'talk':   ('open',   'talk',    0,  None,        (-1, 1),  ('rest',),         ('rest',),         False),
    'happy':  ('wide',   'big',     0,  None,        (0, 0),   ('rest',),         ('rest',),         False),
    'cheer':  ('happy',  'big',    -3,  None,        (0, 0),   ('up',),           ('up',),           False),
    'think':  ('up',     'hmm',     8,  (5, 0),      (3, -5),  ('chin',),         ('rest',),         False),
    'oops':   ('wide',   'o',      -9,  (0, 6),      (-1, 0),  ('hmm',),          ('rest',),         False),
    'pump':   ('det',    'grin',    0,  (-3, -3),    (2, 1),   ('out',),          ('out',),          False),
    'wave':   ('open',   'big',     0,  None,        (-1, 1),  ('wave',),         ('rest',),         False),
    'giggle': ('happy',  'big',     6,  None,        (0, 0),   ('giggle',),       ('rest',),         False),
    'dance':  ('happy',  'big',    -6,  None,        (0, 0),   ('up2',),          ('up',),           True),
    'look':   ('up',     'o',     -15,  None,        (3, -6),  ('rest',),         ('rest',),         False),
    'title':  ('wide',   'big',    -4,  None,        (-1, 1),  ('hug',),          ('wave',),         False),
}
#              angle (deg), length, width
WING_N = {'rest': (132, 52, 21), 'up': (-128, 56, 21), 'up2': (-140, 56, 21), 'chin': (-30, 56, 20),
          'hmm': (-112, 54, 21), 'out': (178, 56, 21), 'wave': (-104, 56, 21), 'giggle': (-22, 46, 19),
          'hug': (168, 50, 21)}
WING_F = {'rest': (64, 40, 18), 'up': (-52, 54, 20), 'out': (-6, 54, 20), 'wave': (-18, 58, 20)}


def features(pose):
    eyes, bm, tilt, brows, look, _n, _f, _l = POSES[pose]
    o = ''
    o += ell(184, 152, 13, 8, f'fill="{P["cheek"]}" opacity=".9"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for i, ((cx, cy, r), lift) in enumerate(zip((EYE_N, EYE_F), brows)):
            y = cy - r - 8 - lift
            if pose == 'pump':   # determined: slanted down towards the bill
                o += path(f'M{f(cx - 7)},{f(y - 2)} L{f(cx + 6)},{f(y + 3)}', st(P['downLine'], 3.6))
            else:
                o += path(f'M{f(cx - 6)},{f(y + 2)} Q{f(cx)},{f(y - 3)} {f(cx + 6)},{f(y + 2)}', st(P['downLine'], 3.4))
    o += bill(bm)
    return o


def head(doc, pose):
    cx, cy, r = HEAD
    hi = ell(152, 104, 20, 11, f'fill="{P["downHi"]}" opacity=".95" transform="rotate(-30 152 104)"')
    o = doc.solid(tufts(), P['down'], P['downSh'], P['downLine'], dx=-3, dy=-3)
    o += doc.solid(head_d(), P['down'], P['downSh'], P['downLine'], dx=-8, dy=-9, hi=hi)
    o += features(pose)
    o += hat(doc)
    tilt = POSES[pose][2]
    return g(o, f'rotate({tilt} {NECK[0]} {NECK[1]})' if tilt else '')


def mimi_inner(doc, pose, held=''):
    eyes, bm, tilt, brows, look, na, fa, lift = POSES[pose]
    fw = WING_F[fa[0]]
    nw = WING_N[na[0]]
    upper = ''
    upper += wing(doc, SH_F, fw[0], fw[1], fw[2], behind=True, motion=(fa[0] == 'wave'))
    upper += body(doc)
    upper += head(doc, pose)
    upper += held
    upper += wing(doc, SH_N, nw[0], nw[1], nw[2], motion=(na[0] == 'wave'))
    if pose == 'pump':
        upper = g(upper, f'translate({PUMP_PIV[0]} {PUMP_PIV[1]}) scale({PUMP[0]} {PUMP[1]}) '
                         f'translate({-PUMP_PIV[0]} {-PUMP_PIV[1]})')
        o = legs() + upper
        # effort puffs by the feet
        o += path('M96,284 q-8,-3 -14,-10 M206,284 q8,-3 14,-10', st('#FFFFFF', 3.6) + ' opacity=".95"')
        return o
    if pose == 'dance':
        return g(legs(lift=True) + upper, 'rotate(-5 150 288)')
    return legs() + upper


def mimi_svg(pose):
    doc = Doc('m')
    held = ''
    if pose == 'title':
        # the rocket tucked under the near wing, nose up-back
        held = g(rocket_inner(Doc('r'), prefix_doc=doc), 'translate(106 287) rotate(-10) scale(0.54) translate(-60 -236)')
    body = mimi_inner(doc, pose, held)
    return svg(300, 300, body, ''.join(doc.defs))


# ======================================================================= ROCKET
ROCKET = {'nozzle': (60, 236), 'nose': (60, 10), 'com': (60, 150), 'waterTop': 150, 'w': 56}


def rocket_inner(_doc=None, prefix_doc=None, water=True):
    doc = prefix_doc or _doc
    o = ''
    L, R = 32, 88
    # back fin (seen behind, darker)
    # side fins
    finL = ptsd([(34, 150), (16, 180), (8, 214), (12, 226), (30, 214), (36, 200)])
    finR = [(120 - x, y) for x, y in [(34, 150), (16, 180), (8, 214), (12, 226), (30, 214), (36, 200)]]
    o += doc.solid(finL, P['fin'], P['finSh'], P['finLine'], dx=-3, dy=-4, w=3.8)
    o += doc.solid(ptsd(finR), P['fin'], P['finSh'], P['finLine'], dx=-3, dy=-4, w=3.8)
    # bottle: nozzle neck at the bottom, shoulders, straight body, top under the nose cone
    bottle = ('M32,74 L88,74 L88,176 C88,194 74,200 70,212 L70,222 L50,222 L50,212 C46,200 32,194 32,176 Z')
    o += path(bottle, f'fill="{P["glassLine"]}" stroke="{P["glassLine"]}" stroke-width="7.6" stroke-linejoin="round"')
    o += path(bottle, f'fill="{P["glass"]}" opacity=".85"')
    if water:
        cid = doc.clip(f'<path d="{bottle}"/>')
        wt = ROCKET['waterTop']
        o += (f'<g clip-path="url(#{cid})"><rect x="20" y="{wt}" width="80" height="90" fill="{P["water"]}"/>'
              f'<path d="M20,{wt} Q40,{wt - 5} 60,{wt} T100,{wt} L100,{wt + 5} L20,{wt + 5} Z" fill="{P["water"]}"/>'
              f'<rect x="70" y="{wt}" width="30" height="90" fill="{P["waterSh"]}" opacity=".7"/>'
              f'<path d="M24,{wt + 1} Q40,{wt - 4} 60,{wt + 1} T96,{wt + 1}" {st(P["glassLine"], 2.6)} opacity=".8"/>'
              f'<path d="M26,{wt + 5} Q40,{wt + 1} 58,{wt + 5}" {st("#FFFFFF", 2.4)} opacity=".9"/>'
              + circ(48, wt + 22, 3.4, 'fill="#FFFFFF" opacity=".85"') + circ(58, wt + 40, 2.4, 'fill="#FFFFFF" opacity=".85"')
              + circ(66, wt + 16, 2, 'fill="#FFFFFF" opacity=".85"') + '</g>')
    # bottle ridges + highlight streak
    o += path('M34,120 Q60,126 86,120', st(P['glassLine'], 2.4) + ' opacity=".55"')
    o += path('M40,84 L40,172', st('#FFFFFF', 5.5) + ' opacity=".95"')
    o += path('M48,90 L48,120', st('#FFFFFF', 3) + ' opacity=".8"')
    # centre fin (edge-on, in front)
    # (the third fin is hidden behind the bottle in this front view)
    # nozzle cap
    o += path('M48,220 L72,220 L70,236 L50,236 Z', fl(P['cap'], P['capLine'], 3.6))
    o += path('M52,226 L68,226', st('#A89070', 2.2))
    # nose cone (cream) with a peach band
    nose = 'M30,78 C30,46 44,22 60,10 C76,22 90,46 90,78 Z'
    hi = ell(46, 44, 7, 16, 'fill="#FFFFFF" opacity=".7" transform="rotate(18 46 44)"')
    band = (f'<path d="M20,60 L100,60 L100,72 L20,72 Z" fill="{P["bill"]}"/>'
            f'<path d="M20,72 L100,72" {st(P["billLine"], 2.4)}/>')
    o += doc.solid(nose, P['nose'], P['noseSh'], P['noseLine'], dx=-5, dy=-3, w=3.8, hi=hi, inner=band)
    o += path('M30,78 L90,78', st(P['noseLine'], 3.8))
    return o


def rocket_svg():
    doc = Doc('r')
    return svg(120, 240, rocket_inner(doc), ''.join(doc.defs))


# ======================================================================= CHUTE
ATT = (120, 196)


def chute_inner(doc, cx=120, top=10, w=212, h=82, att=ATT):
    """Open 6-gore dome; the cords run from the 7 scallop points to att."""
    x0, x1 = cx - w / 2, cx + w / 2
    yb = top + h               # rim line
    n = 6
    rim = [(x0 + w * i / n, yb + (6 if 0 < i < n else 0) - abs(i - n / 2) * 0) for i in range(n + 1)]
    # rim points sag a little to the sides (perspective: the near edge is lower in the middle)
    rim = [(x, y + 8 * math.sin(math.pi * i / n)) for i, (x, y) in enumerate(rim)]
    o = ''
    # cords (behind the canopy rim)
    cords = ''
    for (x, y) in rim:
        cords += f'M{f(x)},{f(y)} L{f(att[0])},{f(att[1])} '
    o += path(cords, st(P['cord'], 2.2))
    # dome outline
    dome = (f'M{P2(rim[0])} C{f(x0)},{f(top + h * 0.2)} {f(cx - w * 0.3)},{f(top)} {f(cx)},{f(top)} '
            f'C{f(cx + w * 0.3)},{f(top)} {f(x1)},{f(top + h * 0.2)} {P2(rim[-1])} ')
    for i in range(n, 0, -1):   # scalloped rim back to the start
        a, b = rim[i], rim[i - 1]
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 12)
        dome += f'Q{P2(m)} {P2(b)} '
    dome += 'Z'
    cid = doc.clip(f'<path d="{dome}"/>')
    o += path(dome, f'fill="{P["gLine"]}" stroke="{P["gLine"]}" stroke-width="{f(2 * 4)}" stroke-linejoin="round"')
    gores = ''
    apex = (cx, top - 4)
    for i in range(n):
        a, b = rim[i], rim[i + 1]
        if i == 0:
            a = (a[0] - 70, a[1] + 20)
        if i == n - 1:
            b = (b[0] + 70, b[1] + 20)
        # gore = wedge from the apex to two rim points (curved seams bulge outward)
        ca = (apex[0] + (a[0] - apex[0]) * 0.55 + (a[0] - cx) * 0.25, apex[1] + (a[1] - apex[1]) * 0.3)
        cb = (apex[0] + (b[0] - apex[0]) * 0.55 + (b[0] - cx) * 0.25, apex[1] + (b[1] - apex[1]) * 0.3)
        col, sh = (P['gA'], P['gAsh']) if i % 2 == 0 else (P['gB'], P['gBsh'])
        d = f'M{P2(apex)} Q{P2(ca)} {P2(a)} L{P2(b)} Q{P2(cb)} {P2(apex)} Z'
        gores += path(d, f'fill="{col}"')
    # lower-right shade band + highlight
    shade = (f'<path d="M{f(x0 - 10)},{f(yb - 18)} Q{f(cx)},{f(yb + 6)} {f(x1 + 10)},{f(yb - 18)} L{f(x1 + 10)},{f(yb + 30)} '
             f'L{f(x0 - 10)},{f(yb + 30)} Z" fill="#2E4A47" opacity=".13"/>')
    seams = ''
    for i in range(1, n):
        a = rim[i]
        ca = (apex[0] + (a[0] - apex[0]) * 0.55 + (a[0] - cx) * 0.25, apex[1] + (a[1] - apex[1]) * 0.3)
        seams += f'M{P2(apex)} Q{P2(ca)} {P2(a)} '
    hi = ell(cx - w * 0.24, top + h * 0.3, w * 0.12, h * 0.14, 'fill="#FFFFFF" opacity=".45" transform="rotate(-25 '
             f'{f(cx - w * 0.24)} {f(top + h * 0.3)})"')
    under = (f'<rect x="{f(x0 - 20)}" y="{f(top - 20)}" width="{f(w / 2 + 20)}" height="{f(h + 60)}" fill="{P["gA"]}"/>'
             f'<rect x="{f(cx)}" y="{f(top - 20)}" width="{f(w / 2 + 20)}" height="{f(h + 60)}" fill="{P["gB"]}"/>')
    o += f'<g clip-path="url(#{cid})">{under}{gores}{shade}{hi}</g>'
    o += path(seams, st(P['gLine'], 2.4) + ' opacity=".8"')
    # vent at the top
    o += ell(cx, top + 3, 9, 4, fl(P['gB'], P['gLine'], 2.6))
    # attachment ring
    o += circ(att[0], att[1] - 3, 4, fl('#E8E2D2', P['gLine'], 2.4))
    return o


def chute_svg():
    doc = Doc('c')
    return svg(240, 200, chute_inner(doc), ''.join(doc.defs))


def chute_closed_svg():
    doc = Doc('k')
    o = ''
    cx = 120
    # short cord to the nose attachment
    o += path(f'M{cx - 4},170 L{ATT[0]},{ATT[1]} M{cx + 4},170 L{ATT[0]},{ATT[1]}', st(P['cord'], 2.2))
    bundle = ptsd([(cx, 120), (cx + 18, 126), (cx + 24, 146), (cx + 18, 168), (cx, 174), (cx - 18, 168), (cx - 24, 146),
                   (cx - 18, 126)])
    stripes = (f'<path d="M{cx - 30},134 L{cx + 30},146 L{cx + 30},156 L{cx - 30},144 Z" fill="{P["gB"]}"/>'
               f'<path d="M{cx - 30},156 L{cx + 30},168 L{cx + 30},178 L{cx - 30},166 Z" fill="{P["gB"]}"/>')
    hi = ell(cx - 9, 136, 5, 9, 'fill="#FFFFFF" opacity=".55"')
    o += doc.solid(bundle, P['gA'], P['gAsh'], P['gLine'], dx=-4, dy=-4, w=4, inner=stripes + hi)
    # tie band + a little bow
    o += path(f'M{cx - 18},160 Q{cx},166 {cx + 18},160', st(P['gLine'], 3.2))
    o += path(f'M{cx},120 Q{cx - 8},110 {cx - 2},106 Q{cx + 6},108 {cx},120 Z', fl(P['gA'], P['gLine'], 2.6))
    o += circ(ATT[0], ATT[1] - 3, 4, fl('#E8E2D2', P['gLine'], 2.4))
    return svg(240, 200, o, ''.join(doc.defs))


# ======================================================================= MARMOT
def marmot_svg(wave):
    doc = Doc('w' if wave else 'v')
    o = ''
    # body rising out of the hole: flat bottom at y 156
    bodyd = ptsd([(28, 156), (30, 112), (38, 76), (56, 48), (80, 40), (104, 48), (122, 76), (130, 112), (132, 156)])
    hi = ell(56, 66, 12, 18, 'fill="#DDB98C" opacity=".8" transform="rotate(25 56 66)"')
    belly = ptsd([(50, 156), (52, 120), (64, 100), (80, 96), (96, 100), (108, 120), (110, 156)])
    inner = path(belly, f'fill="{P["marBelly"]}"')
    # ears
    for x, a in ((52, -20), (108, 20)):
        o += ell(x, 46, 11, 10, fl(P['mar'], P['marLine'], 4) + f' transform="rotate({a} {x} 46)"')
        o += ell(x, 47, 5, 4.5, f'fill="{P["earIn"]}" transform="rotate({a} {x} 47)"')
    o += doc.solid(bodyd, P['mar'], P['marSh'], P['marLine'], dx=-6, dy=-6, hi=hi, inner=inner)
    # muzzle
    o += ell(80, 84, 22, 15, fl(P['marBelly'], P['marLine'], 3.2))
    o += ell(80, 76, 7, 5, fl(P['marNose'], '#3E2A1E', 2))
    o += ell(78, 74.5, 2.4, 1.4, 'fill="#FFFFFF" opacity=".6"')
    o += path('M80,81 L80,86 M80,86 Q74,92 68,88 M80,86 Q86,92 92,88', st(P['marLine'], 2.6))
    # buck teeth
    o += path('M75,88 L75,96 Q80,98 85,96 L85,88 Z', fl('#FFFFFF', P['marLine'], 2.2))
    o += path('M80,89 L80,96', st(P['marLine'], 1.6))
    # eyes + cheeks
    for x in (62, 98):
        o += ell(x, 64, 7, 7.6, f'fill="{P["eye"]}"')
        o += circ(x - 2.4, 61.4, 2.8, 'fill="#FFFFFF"') + circ(x + 2.6, 66.6, 1.2, 'fill="#FFFFFF"')
    o += ell(54, 82, 7, 4.5, f'fill="{P["cheek"]}" opacity=".85"') + ell(106, 82, 7, 4.5, f'fill="{P["cheek"]}" opacity=".85"')
    # whiskers
    o += path('M58,86 L42,84 M58,90 L44,94 M102,86 L118,84 M102,90 L116,94', st(P['marLine'], 1.6) + ' opacity=".7"')
    # paws
    def paw(x, y, r=9):
        return (ell(x, y, r, r * 0.85, fl(P['mar'], P['marLine'], 3.4)) +
                path(f'M{f(x - 3)},{f(y + 3)} L{f(x - 3)},{f(y + 6)} M{f(x + 3)},{f(y + 3)} L{f(x + 3)},{f(y + 6)}',
                     st(P['marLine'], 1.8)))
    o += paw(66, 112)
    if wave:
        o += path('M108,118 Q124,100 128,80', st(P['marLine'], 15) ) + path('M108,118 Q124,100 128,80', st(P['mar'], 8))
        o += paw(128, 76, 10)
        o += path('M140,62 Q148,74 142,88 M148,54 Q160,74 150,94', st('#FFFFFF', 3) + ' opacity=".95"')
    else:
        o += paw(94, 112)
    return svg(160, 160, o, ''.join(doc.defs))


# ======================================================================= GOAT
def goat_svg(hop):
    doc = Doc('h' if hop else 'q')
    o = ''
    lift = 18 if hop else 0
    def leg(x, top, bot, a=0):
        p0, p1 = (x, top), (x + math.sin(math.radians(a)) * (bot - top), bot)
        r = path(f'M{P2(p0)} L{P2(p1)}', st(P['goatLine'], 13)) + path(f'M{P2(p0)} L{P2(p1)}', st(P['goat'], 6.6))
        r += path(f'M{f(p1[0] - 6)},{f(p1[1] - 4)} L{f(p1[0] + 6)},{f(p1[1] - 4)} L{f(p1[0] + 5)},{f(p1[1] + 3)} '
                  f'L{f(p1[0] - 5)},{f(p1[1] + 3)} Z', fl(P['hoof'], '#54493F', 2.4))
        return r
    by = 116 - lift
    if hop:   # legs tucked (front forward, back backward)
        legs_b = leg(130, by + 14, by + 46, 30) + leg(64, by + 14, by + 46, -30)
        legs_f = leg(118, by + 18, by + 50, 26) + leg(76, by + 18, by + 50, -26)
    else:
        legs_b = leg(128, by + 10, 170) + leg(66, by + 10, 170)
        legs_f = leg(116, by + 14, 171) + leg(78, by + 14, 171)
    o += legs_b
    # tail (up)
    o += path(ptsd([(138, by - 14), (150, by - 30), (156, by - 26), (146, by - 6)]), fl(P['goat'], P['goatLine'], 3.4))
    bodyd = fluff_d(102, by, 44, 28, 12, 0.6, a0=0)
    hi = ell(88, by - 16, 18, 7, 'fill="#FFFFFF" opacity=".9"')
    o += doc.solid(bodyd, P['goat'], P['goatSh'], P['goatLine'], dx=-4, dy=-6, hi=hi)
    o += legs_f
    # neck + head (facing LEFT)
    hx, hy = 52, by - 38
    o += path(f'M{f(hx + 8)},{f(hy + 10)} L{f(hx + 30)},{f(by - 4)}', st(P['goatLine'], 30)) + \
        path(f'M{f(hx + 8)},{f(hy + 10)} L{f(hx + 30)},{f(by - 4)}', st(P['goat'], 21))
    # horns (little, curving back)
    o += path(f'M{f(hx + 4)},{f(hy - 16)} Q{f(hx + 8)},{f(hy - 34)} {f(hx + 22)},{f(hy - 34)} Q{f(hx + 14)},{f(hy - 26)} '
              f'{f(hx + 14)},{f(hy - 14)} Z', fl(P['horn'], P['hornLine'], 3))
    o += path(f'M{f(hx - 8)},{f(hy - 16)} Q{f(hx - 6)},{f(hy - 32)} {f(hx + 6)},{f(hy - 34)} Q{f(hx)},{f(hy - 26)} '
              f'{f(hx + 2)},{f(hy - 14)} Z', fl(P['horn'], P['hornLine'], 3))
    # ears (sideways, floppy)
    o += path(ptsd([(hx + 14, hy - 8), (hx + 36, hy - 4), (hx + 40, hy + 4), (hx + 18, hy + 4)]), fl(P['goat'], P['goatLine'], 3.4))
    o += path(ptsd([(hx + 18, hy - 4), (hx + 34, hy - 1), (hx + 32, hy + 2), (hx + 20, hy + 1)]), f'fill="{P["earIn"]}"')
    headd = ptsd([(hx - 20, hy - 4), (hx - 8, hy - 20), (hx + 12, hy - 20), (hx + 22, hy - 4), (hx + 16, hy + 14),
                  (hx - 2, hy + 22), (hx - 22, hy + 20), (hx - 30, hy + 10)])
    o += doc.solid(headd, P['goat'], P['goatSh'], P['goatLine'], dx=-3, dy=-4)
    o += path(ptsd([(hx - 32, hy - 2), (hx - 44, hy + 2), (hx - 38, hy + 6)], close=False), '') if False else ''
    # far ear
    # muzzle + nose + beard
    o += ell(hx - 20, hy + 12, 11, 8, f'fill="#FBE6E0"')
    o += ell(hx - 26, hy + 9, 2.4, 2, f'fill="{P["goatLine"]}"')
    o += path(f'M{f(hx - 26)},{f(hy + 15)} Q{f(hx - 20)},{f(hy + 20)} {f(hx - 14)},{f(hy + 15)}', st(P['goatLine'], 2.4))
    o += path(ptsd([(hx - 12, hy + 20), (hx - 6, hy + 34), (hx - 2, hy + 21)]), fl(P['goat'], P['goatLine'], 2.6))
    # eye + cheek
    if hop:
        o += path(f'M{f(hx - 9)},{f(hy - 1)} Q{f(hx - 3)},{f(hy - 9)} {f(hx + 3)},{f(hy - 1)}', st(P['eye'], 3.6))
    else:
        o += ell(hx - 3, hy - 2, 5.8, 6.4, f'fill="{P["eye"]}"')
        o += circ(hx - 5, hy - 4.4, 2.3, 'fill="#FFFFFF"') + circ(hx - 0.8, hy + 0.6, 1, 'fill="#FFFFFF"')
    o += ell(hx + 6, hy + 10, 6, 4, f'fill="{P["cheek"]}" opacity=".85"')
    if hop:
        o += path('M150,150 q10,-2 16,-10 M30,150 q-10,-2 -16,-10', st('#FFFFFF', 3.4) + ' opacity=".95"')
    return svg(180, 180, o, ''.join(doc.defs))


# ======================================================================= BIRD
def bird_svg(sing):
    doc = Doc('s' if sing else 'b')
    o = ''
    # feet (perch at y 86)
    o += path('M46,72 L44,86 M56,72 L56,86 M38,86 L50,86 M50,86 L62,86', st(P['beakLine'], 2.6))
    # tail (right, facing LEFT)
    o += path(ptsd([(70, 56), (92, 48), (96, 54), (78, 68)]), fl(P['birdSh'], P['birdLine'], 3.2))
    tilt = -10 if sing else 0
    bodyd = ptsd([(20, 44), (28, 24), (46, 14), (64, 18), (76, 34), (78, 54), (68, 70), (48, 76), (30, 70), (20, 58)])
    hi = ell(36, 26, 9, 5, 'fill="#FFFFFF" opacity=".5" transform="rotate(-30 36 26)"')
    breast = ell(34, 58, 18, 15, f'fill="{P["breast"]}"')
    inner = breast + ell(40, 64, 14, 9, f'fill="{P["breastSh"]}" opacity=".5"')
    b = doc.solid(bodyd, P['bird'], P['birdSh'], P['birdLine'], dx=-3, dy=-4, w=3.4, hi=hi, inner=inner)
    # wing
    b += path(ptsd([(44, 38), (66, 36), (76, 50), (64, 60), (48, 52)]), fl(P['birdSh'], P['birdLine'], 3))
    b += path('M54,48 L68,50 M52,54 L64,56', st(P['birdLine'], 1.6) + ' opacity=".6"')
    # beak
    if sing:
        b += path('M22,36 L6,30 L20,42 Z', fl(P['beak'], P['beakLine'], 2.4))
        b += path('M22,44 L8,48 L22,48 Z', fl(P['beak'], P['beakLine'], 2.4))
    else:
        b += path('M22,38 L8,42 L22,46 Z', fl(P['beak'], P['beakLine'], 2.4))
    # eye + cheek
    if sing:
        b += path('M28,32 Q33,26 38,32', st(P['eye'], 3))
    else:
        b += ell(33, 32, 4.4, 4.8, f'fill="{P["eye"]}"') + circ(31.6, 30.4, 1.7, 'fill="#FFFFFF"')
    b += ell(36, 44, 5, 3, f'fill="{P["cheek"]}" opacity=".9"')
    # head tuft
    b += path('M44,15 Q46,6 52,6 Q48,10 50,16', fl(P['bird'], P['birdLine'], 2.4))
    o += g(b, f'rotate({tilt} 50 72)' if tilt else '')
    if sing:   # little song squiggles (no text)
        o += path('M6,20 q4,-6 8,0 t8,0 M12,10 q3,-4 6,0 t6,0', st('#FFFFFF', 2.6) + ' opacity=".95"')
        o += circ(4, 22, 2.4, 'fill="#FFFFFF"')
    return svg(100, 90, o, ''.join(doc.defs))


# ======================================================================= ICON
def drop(x, y, r, a=1.0):
    return path(f'M{f(x)},{f(y - r * 1.7)} Q{f(x + r)},{f(y - r * 0.2)} {f(x)},{f(y + r)} Q{f(x - r)},{f(y - r * 0.2)} '
                f'{f(x)},{f(y - r * 1.7)} Z', fl('#EAF6F8', '#7FA3AA', 2.4) + f' opacity="{a}"')


def icon_svg():
    doc = Doc('i')
    sky = doc.add('linearGradient', '<stop offset="0" stop-color="#9FD3EE"/><stop offset="1" stop-color="#F3F7EE"/>',
                  'x1="0" y1="0" x2="0" y2="1"')
    o = f'<rect width="512" height="512" fill="url(#{sky})"/>'
    # soft sun
    o += circ(84, 84, 52, 'fill="#FFF6D8" opacity=".85"') + circ(84, 84, 36, 'fill="#FFF0BE"')
    # mountains (2 layers, snow caps)
    o += path('M0,300 L70,210 L120,250 L210,150 L300,240 L360,190 L440,260 L512,220 L512,340 L0,340 Z', 'fill="#A9A6C4"')
    o += path('M190,174 L210,150 L232,176 L220,170 L210,180 L200,170 Z', 'fill="#F4F6FA"')
    o += path('M346,206 L360,190 L376,208 L366,204 L358,212 Z', 'fill="#F4F6FA"')
    o += path('M0,330 L60,260 L130,320 L240,224 L330,300 L420,236 L512,300 L512,360 L0,360 Z', 'fill="#8FA3B8"')
    o += path('M218,244 L240,224 L264,246 L250,240 L240,252 L228,240 Z', 'fill="#F4F6FA"')
    o += path('M402,252 L420,236 L440,254 L428,250 L420,258 Z', 'fill="#F4F6FA"')
    # pine forest edge
    for i, x in enumerate(range(-10, 530, 34)):
        h = 54 + (i * 37 % 5) * 8
        y = 352
        c = '#5F8A6E' if i % 2 else '#4E7560'
        o += path(f'M{x},{y} L{x + 20},{y - h} L{x + 40},{y} Z', f'fill="{c}"')
    # meadow
    o += path('M0,346 Q256,330 512,346 L512,512 L0,512 Z', 'fill="#A9CF8E"')
    o += path('M0,380 Q256,366 512,384', st('#9CC48A', 10) + ' opacity=".7"')
    # a picnic mat on the meadow (the landing target, dashed ring)
    o += ell(400, 452, 84, 34, 'fill="#000" opacity=".08"')
    o += ell(400, 446, 84, 34, fl('#EFE2C6', '#9C8763', 4))
    o += ell(400, 446, 60, 24, 'fill="none" stroke="#CDB68E" stroke-width="7"')
    o += ell(400, 446, 96, 42, 'fill="none" stroke="#FFFFFF" stroke-width="5" stroke-dasharray="14 12" opacity=".95"')
    # flight arc (dotted) from the pad up to the rocket
    o += path('M262,470 Q280,340 346,282', 'fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" '
              'stroke-dasharray="0.1 20" opacity=".8"')
    # water spray behind the rocket
    rx, ry, rr = 360, 282, 12     # nozzle point in the icon, rocket tilt (deg, clockwise = to the right)
    sx, sy = rot(rx, ry + 150, rr, rx, ry)
    o += path(f'M{f(rx - 6)},{f(ry)} L{f(sx - 40)},{f(sy)} Q{f(sx)},{f(sy + 16)} {f(sx + 40)},{f(sy)} L{f(rx + 6)},{f(ry)} Z',
              'fill="#EAF6F8" opacity=".7"')
    for (dx, dy, r) in ((-26, 40, 9), (18, 58, 8), (-40, 92, 7), (30, 100, 9), (-10, 120, 6), (6, 30, 6), (-56, 132, 5),
                        (48, 136, 6), (-20, 70, 5)):
        x, y = rot(rx + dx, ry + dy, rr, rx, ry)
        o += drop(x, y, r)
    # rocket (scaled), nose up-right
    k = 0.72
    o += g(rocket_inner(doc), f'translate({rx} {ry}) rotate({rr}) scale({k}) translate(-60 -236)')
    # the parachute popping out of the nose: a small half-open canopy
    nx, ny = rot(rx, ry - (236 - 10) * k, rr, rx, ry)
    o += g(chute_inner(doc, cx=120, top=60, w=150, h=70, att=(120, 196)),
           f'translate({f(nx)} {f(ny)}) rotate({rr}) scale(0.62) translate(-120 -196)')
    # pop sparkles
    for (x, y, s) in ((470, 40, 10), (300, 30, 8), (484, 118, 7)):
        o += path(f'M{x},{y - s} L{x + s * 0.3},{y - s * 0.3} L{x + s},{y} L{x + s * 0.3},{y + s * 0.3} L{x},{y + s} '
                  f'L{x - s * 0.3},{y + s * 0.3} L{x - s},{y} L{x - s * 0.3},{y - s * 0.3} Z', 'fill="#FFFFFF"')
    # Mimi watching (the look frame), big, bottom-left
    mdoc = doc
    m = mimi_inner(mdoc, 'look')
    km = 0.98
    o += g(m, f'translate({f(128 - 150 * km)} {f(500 - 290 * km)}) scale({km})')
    return svg(512, 512, o, ''.join(doc.defs))


# ======================================================================= main
FRAMES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'pump', 'wave', 'giggle', 'dance', 'look']


def main():
    for pose in FRAMES + ['title']:
        write(f'characters/mimi_{pose}.svg', mimi_svg(pose))
    write('characters/rocket.svg', rocket_svg())
    write('characters/chute.svg', chute_svg())
    write('characters/chute_closed.svg', chute_closed_svg())
    write('characters/marmot.svg', marmot_svg(False))
    write('characters/marmot_wave.svg', marmot_svg(True))
    write('characters/goat.svg', goat_svg(False))
    write('characters/goat_hop.svg', goat_svg(True))
    write('characters/bird.svg', bird_svg(False))
    write('characters/bird_sing.svg', bird_svg(True))
    write('icon.svg', icon_svg())

    pump_dy = round((1 - PUMP[1]) * (PUMP_PIV[1] - HEAD[1]))
    pump_hat_dy = round((1 - PUMP[1]) * (PUMP_PIV[1] - 32))
    wt = wing_tip(SH_N, WING_N['rest'][0], WING_N['rest'][1])
    hat_top = (166, 32)
    box = [40, 28, 284, 292]
    R = ROCKET
    js = ("/* Mimi's Splash Rocket — DK.MIMI_POINTS + DK.ROCKET_POINTS (written by tools/art_mimi.py; do not edit by hand).\n"
          " * MIMI_POINTS: points in Mimi's 300x300 viewBox (characters/mimi_*.svg). Scale by (h / 300), place by the feet.\n"
          " *   feet     feet anchor of every frame (bottom of the webbed feet)\n"
          " *   box      hit box [x0, y0, x1, y1] (hat to feet, tail to bill)\n"
          " *   pumpDy   how much LOWER the head centre is in mimi_pump (all above the feet squashed 1.06 x 0.90 about y 284);\n"
          " *            pumpHatDy = how much lower the hat top is there\n"
          " *   wingTip  tip of the near wing at rest; hatTop = top of the bucket hat (standing frames, no tilt)\n"
          " *   head     head centre (tilt pivot for the face is the neck [176, 186]); bill = bill tip\n"
          " * ROCKET_POINTS: points in the rocket's 120x240 viewBox (characters/rocket.svg, nose UP).\n"
          " *   nozzle   anchor = nozzle bottom; nose = nose-cone tip (= the chute attachment, chute.svg (120, 196));\n"
          " *   com      centre of mass (rotate about it in flight); waterTop = water line y (water fills below it);\n"
          " *   w        bottle width (fins reach x 8..112) */\n"
          "(function (DK) {\n  'use strict';\n"
          f"  DK.MIMI_POINTS = {{ feet: [{FEET[0]}, {FEET[1]}], box: [{box[0]}, {box[1]}, {box[2]}, {box[3]}], pumpDy: {pump_dy}, pumpHatDy: {pump_hat_dy},\n"
          f"    wingTip: [{wt[0]}, {wt[1]}], hatTop: [{hat_top[0]}, {hat_top[1]}], head: [{HEAD[0]}, {HEAD[1]}], bill: [282, 150] }};\n"
          f"  DK.ROCKET_POINTS = {{ nozzle: [{R['nozzle'][0]}, {R['nozzle'][1]}], nose: [{R['nose'][0]}, {R['nose'][1]}], "
          f"com: [{R['com'][0]}, {R['com'][1]}], waterTop: {R['waterTop']}, w: {R['w']} }};\n"
          "})(typeof window !== 'undefined' ? (window.DK = window.DK || {}) : (globalThis.DK = globalThis.DK || {}));\n")
    with open(JS_OUT, 'w') as fh:
        fh.write(js)
    print('wrote', len(FRAMES) + 1, 'Mimi frames, rocket, chute x2, marmot x2, goat x2, bird x2, icon, mimi_points.js')
    print(js)


if __name__ == '__main__':
    main()
