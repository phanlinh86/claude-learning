#!/usr/bin/env python3
"""Character / core-item art generator for Dee's Forest Memory (character artist A).

Writes (relative to game/assets/default/):
  characters/dee_{idle,blink,talk,happy,cheer,think,oops}.svg
        0 0 256 256, feet anchor (128,244). Dee the duckling: fluffy yellow down, orange-brown bill and webbed feet,
        a sage leaf cape tied at the neck with a little leaf knot, one daisy on the head, a soft curl of down on the
        crown. ¾ view facing RIGHT. Every frame shares body / cape / feet / head geometry; only eyes, bill, brows,
        wings, a small hop (happy / cheer) or a head tilt (think / oops) change.
  items/card_back.svg   0 0 156 200  deep forest teal, leaf-and-swirl pattern, golden acorn emblem (DESIGN §3)
  ui/star.svg, ui/star_empty.svg    0 0 64 64
  icon.svg              0 0 512 512  full bleed, opaque: Dee's face + two cards (one flipped showing a heart)

Usage: python3 tools/art_dee.py [outDir]
Rules (docs/DESIGN.md §3): 100% original art, flat cartoon, ~4 px outline in a darker tone of the fill (never black),
one-step cel shading lower/right + one soft highlight upper-left, no <text>/fonts/scripts/external refs, no filters.
width/height = viewBox. Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md §3)
D = {
    'down': '#FFE27A', 'shade': '#F2C94C', 'line': '#B9862A', 'hi': '#FFF3BF', 'belly': '#FFEC9E',
    'bill': '#F59A3B', 'billSh': '#DB7F28', 'billLn': '#A95F1C', 'billHi': '#FBC583',
    'mouth': '#9C3B33', 'tongue': '#F2899A',
    'eye': '#2F2622', 'eyeLo': '#5A4438', 'white': '#FFFFFF', 'cheek': '#F7B6C2',
    'cape': '#7DB37A', 'capeDk': '#4E7F52', 'capeSh': '#679E66', 'capeHi': '#A8D3A1',
    'petal': '#FFFFFF', 'petalLn': '#C9B48C', 'petalSh': '#F1EADB', 'disc': '#F5B52A', 'discLn': '#C07F12',
    'starEye': '#FFD86B', 'starLn': '#C98612',
}
BACK = {'base': '#2F7D73', 'line': '#1F5C54', 'mid': '#4FA393', 'light': '#8CCFB8', 'medal': '#3A8C80'}
ACORN_GOLD = {'nut': '#F4C653', 'nutSh': '#D9A033', 'nutHi': '#FFE7A3', 'cap': '#B9792C', 'capSh': '#94591B',
              'line': '#7E4E14', 'stem': '#7E4E14'}
CARD = {'face': '#FFF8EA', 'frame': '#E7D3AE', 'line': '#9A774C'}
LW = 4.2  # outline width at viewBox 256


def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join('%02X' % round(pa[i] + (pb[i] - pa[i]) * t) for i in range(3))


def svg(w, h, body, defs=''):
    d = f'<defs>{defs}</defs>' if defs else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{d}{body}</svg>\n')


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as fh:
        fh.write(text)


def ell(cx, cy, rx, ry, extra=''):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" {extra}/>'


def circ(cx, cy, r, extra=''):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {extra}/>'


def rect(x, y, w, h, r=0, extra=''):
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(r)}" {extra}/>'


def path(d, extra=''):
    return f'<path d="{d}" {extra}/>'


def stroke(col, w, fill='none'):
    return f'fill="{fill}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"'


def filled(fill, line, w=LW):
    return f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"'


def poly(pts, close=True):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + (' Z' if close else '')


def rounded_star(cx, cy, ro, ri, rr=0.18, rot=-90):
    pts = []
    for i in range(10):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d = ''
    for i in range(10):
        p = pts[i]
        if i % 2 == 0:
            a, b = pts[i - 1], pts[(i + 1) % 10]
            s = (p[0] + (a[0] - p[0]) * rr, p[1] + (a[1] - p[1]) * rr)
            e = (p[0] + (b[0] - p[0]) * rr, p[1] + (b[1] - p[1]) * rr)
            d += ('M' if not d else ' L') + f'{f(s[0])},{f(s[1])} Q{f(p[0])},{f(p[1])} {f(e[0])},{f(e[1])}'
        else:
            d += f' L{f(p[0])},{f(p[1])}'
    return d + ' Z'


def rot_pt(p, ang, about=(0, 0)):
    a = math.radians(ang)
    x, y = p[0] - about[0], p[1] - about[1]
    return (about[0] + x * math.cos(a) - y * math.sin(a), about[1] + x * math.sin(a) + y * math.cos(a))


# ======================================================================= DEE geometry
HEAD_C = (134, 98)
HEAD_AB = (70, 63)              # x 64-204, y 35-161
NECK = (128, 160)               # head tilt pivot
EYE_N = (124, 90, 13.5, 17.5)   # near eye (viewer's left)
EYE_F = (178, 84, 10.5, 15)     # far eye, smaller (¾ view facing right)
BILL = (160, 116)               # bill base (where it meets the face)
CHEEKS = ((100, 120, 13, 8), (202, 104, 6.5, 5.5))
BODY = (122, 192, 60, 47)       # x 62-182, y 145-239
SH_N = (124, 178)               # near wing shoulder (on the flank, clear of the cape)
SH_F = (166, 172)               # far wing shoulder


def head_path():
    """Round, slightly pear-ish head: cheeks a bit wider than the crown."""
    cx, cy = HEAD_C
    a, b = HEAD_AB
    pts = []
    for i in range(180):
        th = math.radians(i * 2)
        c, s = math.cos(th), math.sin(th)
        n = 2.2
        x = math.copysign(abs(c) ** (2 / n), c)
        y = math.copysign(abs(s) ** (2 / n), s)
        wide = 1 + 0.04 * s           # lower half (s > 0) a little wider
        pts.append((cx + a * x * wide, cy + b * y))
    return poly(pts)


HEAD_D = head_path()
BODY_D = None


def body_path():
    """Egg-shaped body, fuller at the bottom, chest pushed forward (right)."""
    cx, cy = BODY[0], BODY[1]
    a, b = BODY[2], BODY[3]
    pts = []
    for i in range(180):
        th = math.radians(i * 2)
        c, s = math.cos(th), math.sin(th)
        k = 1 + 0.08 * s                       # fuller bottom
        x = cx + a * c * k + 6 * max(0, c) * (1 - abs(s))  # chest bulge to the right
        y = cy + b * s
        pts.append((x, y))
    return poly(pts)


BODY_D = body_path()


def tuft():
    """A soft curl of down on the crown (two small feathers leaning back)."""
    g = path('M128,40 C120,26 124,12 138,10 C132,18 134,28 140,38 Z', filled(D['down'], D['line'], 3.6))
    g += path('M138,40 C140,26 152,18 162,24 C152,26 148,32 147,41 Z', filled(D['down'], D['line'], 3.6))
    g += path('M131,32 C129,24 131,19 135,16', stroke(D['hi'], 2.4))
    return g


def daisy(cx, cy, r=10, rot=-18):
    g = f'<g transform="rotate({rot} {cx} {cy})">'
    for i in range(8):
        a = i * 45
        g += ell(cx, cy - r * 0.95, r * 0.42, r * 0.8,
                 f'fill="{D["petal"]}" stroke="{D["petalLn"]}" stroke-width="2" transform="rotate({a} {cx} {cy})"')
    g += circ(cx, cy, r * 0.5, filled(D['disc'], D['discLn'], 2.2))
    g += circ(cx - r * 0.15, cy - r * 0.17, r * 0.17, 'fill="#FFE08A"')
    g += '</g>'
    return g


def eye_open(e, look=(2, -2), wide=1.0):
    cx, cy, rx, ry = e
    rx *= wide
    ry *= wide
    px, py = cx + look[0] * 0.5, cy + look[1] * 0.5
    g = ell(px, py, rx, ry, f'fill="{D["eye"]}"')
    g += ell(px + 1, py + ry * 0.45, rx * 0.66, ry * 0.36, f'fill="{D["eyeLo"]}" opacity="0.9"')
    g += ell(px - rx * 0.3 + look[0] * 0.25, py - ry * 0.36 + look[1] * 0.25, rx * 0.42, ry * 0.36, f'fill="{D["white"]}"')
    g += circ(px + rx * 0.42, py + ry * 0.42, rx * 0.17, f'fill="{D["white"]}"')
    return g


def eye_closed(e, kind):
    cx, cy, rx, ry = e
    w = rx * 1.0
    if kind == 'happy':   # ^ ^
        d = f'M{f(cx - w)},{f(cy + 5)} Q{f(cx)},{f(cy - 15)} {f(cx + w)},{f(cy + 5)}'
        return path(d, stroke(D['eye'], 5))
    d = f'M{f(cx - w)},{f(cy)} Q{f(cx)},{f(cy + 9)} {f(cx + w)},{f(cy)}'   # soft closed lid
    return path(d, stroke(D['eye'], 4.6))


def eye_star(e):
    cx, cy, rx, ry = e
    r = max(rx, ry) * 0.98
    g = path(rounded_star(cx, cy + 1, r, r * 0.48, 0.2),
             f'fill="{D["starEye"]}" stroke="{D["starLn"]}" stroke-width="2.6" stroke-linejoin="round"')
    g += circ(cx - r * 0.18, cy - r * 0.12, r * 0.16, f'fill="{D["white"]}"')
    return g


def brows(up=0, tilt=0):
    g = ''
    for (cx, cy, rx, ry), side in ((EYE_N, -1), (EYE_F, 1)):
        y = cy - ry - 8 - up
        hw = rx * 0.75
        d = f'M{f(cx - hw)},{f(y + 3 + tilt * side)} Q{f(cx)},{f(y - 4)} {f(cx + hw)},{f(y + 3 - tilt * side)}'
        g += path(d, stroke(D['line'], 3.6))
    return g


def bill(kind):
    """Duck bill pointing right from the face. kind: smile | talk | open | big | o | hmm."""
    up = 'M146,112 C150,100 188,96 210,103 C224,108 224,120 211,124 C190,129 156,128 146,121 C143,118 143,115 146,112 Z'
    g = ''
    # lower bill / mouth first (behind the upper bill)
    if kind == 'smile':
        g += path('M150,120 C164,134 196,134 208,123 C196,128 162,128 150,120 Z', filled(D['billSh'], D['billLn'], 3))
    elif kind == 'hmm':
        g += path('M152,121 C166,128 186,131 204,124 C190,127 166,126 152,121 Z', filled(D['billSh'], D['billLn'], 3))
    elif kind in ('talk', 'open', 'big', 'o'):
        drop = {'talk': 12, 'open': 15, 'big': 21, 'o': 13}[kind]
        x1 = {'talk': 206, 'open': 208, 'big': 210, 'o': 196}[kind]
        g += path(f'M150,119 C160,{f(124 + drop)} {f(x1 - 14)},{f(124 + drop * 1.15)} {f(x1)},{f(122 + drop * 0.55)} '
                  f'C{f(x1 + 4)},{f(120 + drop * 0.3)} {f(x1)},124 196,125 C176,127 160,125 150,119 Z',
                  filled(D['billSh'], D['billLn'], 3))
        # mouth inside
        mx0, mx1 = 156, x1 - 8
        g += path(f'M{mx0},123 C166,{f(124 + drop * 0.85)} {f(mx1 - 10)},{f(124 + drop * 0.9)} {f(mx1)},{f(123 + drop * 0.35)} '
                  f'C{f(mx1 - 16)},127 170,127 {mx0},123 Z', f'fill="{D["mouth"]}"')
        g += ell((mx0 + mx1) / 2 + 2, 124 + drop * 0.62, (mx1 - mx0) * 0.22, drop * 0.2, f'fill="{D["tongue"]}"')
    g += path(up, filled(D['bill'], D['billLn'], 3.6))
    # cel shade along the lower edge + highlight on top
    g += path('M152,121 C170,125 196,125 212,121 C206,124 192,127 176,127 C164,127 154,125 152,121 Z', f'fill="{D["billSh"]}" opacity="0.8"')
    g += path('M156,106 C170,101 190,100 204,104', stroke(D['billHi'], 3.2))
    g += ell(196, 108, 2.4, 1.6, f'fill="{D["billLn"]}"')   # nostril
    return g


def cheeks(k=1.0):
    return ''.join(ell(x, y, rx * k, ry * k, f'fill="{D["cheek"]}" opacity="0.9"') for x, y, rx, ry in CHEEKS)


def wing(sh, ang, length=48, front=True, fold=1.0):
    """Stubby feathered wing: pivot at the shoulder, pointing along `ang` degrees (0 = right, 90 = down)."""
    L = length
    w = 13 * fold
    d = (f'M-4,{f(-w)} C{f(L * 0.35)},{f(-w - 4)} {f(L * 0.7)},{f(-w)} {f(L * 0.9)},{f(-w * 0.55)} '
         f'Q{f(L + 5)},{f(-w * 0.25)} {f(L * 0.97)},{f(w * 0.08)} '
         f'Q{f(L + 3)},{f(w * 0.5)} {f(L * 0.86)},{f(w * 0.62)} '
         f'Q{f(L * 0.86)},{f(w * 1.08)} {f(L * 0.7)},{f(w * 0.95)} '
         f'C{f(L * 0.45)},{f(w * 1.15)} 8,{f(w * 1.05)} -4,{f(w * 0.8)} '
         f'C-12,{f(w * 0.4)} -12,{f(-w * 0.6)} -4,{f(-w)} Z')
    sh_d = (f'M{f(L * 0.1)},{f(w * 0.5)} C{f(L * 0.4)},{f(w * 0.7)} {f(L * 0.7)},{f(w * 0.6)} {f(L * 0.92)},{f(w * 0.3)} '
            f'Q{f(L + 1)},{f(w * 0.55)} {f(L * 0.86)},{f(w * 0.62)} Q{f(L * 0.86)},{f(w * 1.08)} {f(L * 0.7)},{f(w * 0.95)} '
            f'C{f(L * 0.45)},{f(w * 1.15)} 8,{f(w * 1.05)} -4,{f(w * 0.8)} Z')
    g = f'<g transform="translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)})">'
    g += path(d, f'fill="{D["down"]}"')
    g += path(sh_d, f'fill="{D["shade"]}"')
    g += path(d, f'fill="none" stroke="{D["line"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    # two feather creases near the tip
    g += path(f'M{f(L * 0.62)},{f(-w * 0.15)} Q{f(L * 0.76)},{f(-w * 0.05)} {f(L * 0.86)},{f(w * 0.1)}', stroke(D['line'], 2.2) + ' opacity="0.75"')
    g += path(f'M{f(L * 0.56)},{f(w * 0.42)} Q{f(L * 0.68)},{f(w * 0.5)} {f(L * 0.76)},{f(w * 0.68)}', stroke(D['line'], 2.2) + ' opacity="0.75"')
    g += path(f'M{f(L * 0.12)},{f(-w * 0.55)} C{f(L * 0.3)},{f(-w * 0.8)} {f(L * 0.5)},{f(-w * 0.8)} {f(L * 0.66)},{f(-w * 0.6)}', stroke(D['hi'], 2.6) + ' opacity="0.9"')
    g += '</g>'
    return g


def foot(cx, by, s=1.0, shade=False):
    """Webbed foot seen ¾ from the side, toes pointing right, bottom at y = by."""
    def P(x, y):
        return f'{f(cx + x * s)},{f(by + y * s)}'
    d = (f'M{P(-17, -4)} C{P(-17, -12)} {P(-6, -14)} {P(2, -13)} C{P(12, -12)} {P(20, -10)} {P(24, -6)} '
         f'Q{P(28, -1)} {P(22, 0)} Q{P(19, 4)} {P(13, 1)} Q{P(9, 5)} {P(3, 1)} Q{P(-2, 4)} {P(-8, 1)} '
         f'C{P(-13, 2)} {P(-17, 1)} {P(-17, -4)} Z')
    col = mix(D['bill'], D['billSh'], 0.45) if shade else D['bill']
    g = path(d, filled(col, D['billLn'], 3.4))
    g += path(f'M{P(9, -6)} L{P(13, 0)} M{P(1, -7)} L{P(3, 0)}', stroke(D['billLn'], 2) + ' opacity="0.7"')
    g += path(f'M{P(-10, -9)} Q{P(0, -11)} {P(10, -9)}', stroke(D['billHi'], 2.2) + ' opacity="0.9"')
    return g


def legs():
    # two short stubby legs between the body and the feet (mostly hidden)
    g = path('M104,226 L106,238', stroke(D['billLn'], 9.5)) + path('M104,226 L106,238', stroke(D['billSh'], 5))
    g += path('M148,224 L150,236', stroke(D['billLn'], 9.5)) + path('M148,224 L150,236', stroke(D['billSh'], 5))
    return g


def body_block(uid):
    defs = f'<clipPath id="{uid}bd"><path d="{BODY_D}"/></clipPath>'
    cx, cy, a, b = BODY
    g = path(BODY_D, f'fill="{D["down"]}"')
    g += f'<g clip-path="url(#{uid}bd)">'
    g += ell(cx + 14, cy + 14, a + 4, b + 2, f'fill="{D["shade"]}"')
    g += ell(cx - 4, cy - 6, a - 6, b - 6, f'fill="{D["down"]}"')
    g += ell(cx + 22, cy + 6, 26, 28, f'fill="{D["belly"]}"')      # soft chest
    g += '</g>'
    g += path(BODY_D, f'fill="none" stroke="{D["line"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    # fluffy chest tufts poking out of the outline
    g += path('M176,176 q8,4 6,12 q7,4 3,12', filled(D['down'], D['line'], 3.2))
    for d in ('M150,210 q6,-6 12,0', 'M134,222 q6,-6 12,0', 'M160,194 q5,-5 10,0'):
        g += path(d, stroke(D['shade'], 2.6))
    return defs, g


def tail():
    """Small perky tail at the back (left), behind the cape tip."""
    return path('M70,200 C56,196 44,182 42,170 C52,176 58,174 66,180 C62,170 64,164 68,160 C74,172 80,184 82,196 Z',
                filled(D['down'], D['line'], 3.6)) + path('M62,182 C56,180 52,176 49,173', stroke(D['shade'], 2.4))


def cape():
    """Sage leaf cape: a big leaf over the back, tied at the neck, a little leaf knot at the throat."""
    leaf = 'M120,150 C104,148 82,154 70,170 C58,186 54,206 58,226 C78,222 98,210 110,192 C120,178 124,162 120,150 Z'
    g = path(leaf, f'fill="{D["cape"]}"')
    # cel shade: lower (outer) half of the leaf
    g += path('M120,152 C116,172 104,194 86,210 C76,218 66,222 58,226 C78,222 98,210 110,192 C120,178 124,162 120,152 Z',
              f'fill="{D["capeSh"]}"')
    g += path(leaf, f'fill="none" stroke="{D["capeDk"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    # midrib + veins
    g += path('M116,154 C104,172 82,200 60,224', stroke(D['capeDk'], 2.6))
    for t0, t1 in (('M104,170', 'Q92,166 82,168'), ('M94,184', 'Q82,182 72,186'), ('M84,198', 'Q74,198 66,204'),
                   ('M106,168', 'Q110,180 108,190'), ('M96,182', 'Q100,194 96,204')):
        g += path(t0 + ' ' + t1, stroke(D['capeDk'], 2) + ' opacity="0.7"')
    g += path('M76,170 C86,158 100,154 112,154', stroke(D['capeHi'], 2.8))
    # neck tie (band under the head, over the body)
    g += path('M84,152 C108,166 152,168 184,152 L185,161 C152,177 106,176 82,161 Z', filled(D['cape'], D['capeDk'], 3.4))
    g += path('M90,158 C114,169 150,170 178,158', stroke(D['capeHi'], 2.2))
    # little leaf knot at the throat (front, right)
    g += path('M170,162 C176,150 192,148 198,154 C192,162 180,166 170,162 Z', filled(D['cape'], D['capeDk'], 3))
    g += path('M170,162 C172,174 184,182 192,180 C190,170 180,164 170,162 Z', filled(D['capeSh'], D['capeDk'], 3))
    g += path('M172,161 L193,154 M171,163 L189,178', stroke(D['capeDk'], 1.8) + ' opacity="0.8"')
    g += circ(170, 162, 4.2, filled(D['cape'], D['capeDk'], 2.6))
    return g


def head_block(uid, pose):
    defs = f'<clipPath id="{uid}hd"><path d="{HEAD_D}"/></clipPath>'
    cx, cy = HEAD_C
    a, b = HEAD_AB
    g = tuft()
    g += path(HEAD_D, f'fill="{D["down"]}"')
    g += f'<g clip-path="url(#{uid}hd)">'
    g += ell(cx + 14, cy + 14, a + 4, b + 4, f'fill="{D["shade"]}"')
    g += ell(cx - 5, cy - 7, a - 4, b - 4, f'fill="{D["down"]}"')
    g += ell(cx + 14, cy + 30, 42, 22, f'fill="{D["belly"]}" opacity="0.8"')   # light muzzle/cheek area
    g += '</g>'
    g += path(HEAD_D, f'fill="none" stroke="{D["line"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    g += ell(96, 64, 13, 7, f'fill="#FFFFFF" opacity="0.45" transform="rotate(-38 96 64)"')   # soft highlight
    # little fluff flicks at the back of the head
    g += path('M66,104 q-7,4 -5,12 q-6,5 -1,12', filled(D['down'], D['line'], 3.2))
    g += cheeks(pose.get('cheek', 1.0))
    g += pose['face']
    g += daisy(98, 42, 11)
    return defs, g


def dee_parts(pose, uid):
    defs, g = '', ''
    hop = pose.get('hop', 0)
    wn, wf = pose.get('wings', ((114, 44), (60, 40)))   # (angle, length) near / far
    front_near = pose.get('nearFront', False)
    # feet stay on the ground during a hop only if hop == 0
    g += f'<g transform="translate(0,{f(-hop)})">'
    g += wing(SH_F, wf[0], wf[1])                        # far wing (behind the body)
    g += tail()
    g += legs()
    bd, bg = body_block(uid)
    defs += bd
    g += bg
    g += foot(152, 242, 0.88, shade=True)
    g += foot(110, 244, 1.0)
    g += cape()
    hd, hg = head_block(uid, pose)
    defs += hd
    tilt = pose.get('tilt', 0)
    if not front_near:
        g += wing(SH_N, wn[0], wn[1])
    if tilt:
        g += f'<g transform="rotate({f(tilt)} {f(NECK[0])} {f(NECK[1])})">{hg}</g>'
    else:
        g += hg
    if front_near:
        g += wing(SH_N, wn[0], wn[1])
    g += '</g>'
    return defs, g


def face(eyes, b, extra=''):
    return eyes + bill(b) + extra


POSES = {
    'idle':  dict(face=face(eye_open(EYE_N) + eye_open(EYE_F), 'smile')),
    'blink': dict(face=face(eye_closed(EYE_N, 'blink') + eye_closed(EYE_F, 'blink'), 'smile')),
    'talk':  dict(face=face(eye_open(EYE_N) + eye_open(EYE_F), 'talk')),
    'happy': dict(face=face(eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy'), 'open'),
                  wings=((-150, 48), (-38, 44)), hop=7, cheek=1.2),
    'cheer': dict(face=face(eye_star(EYE_N) + eye_star(EYE_F), 'big'),
                  wings=((-172, 52), (-14, 48)), hop=10, cheek=1.25),
    'think': dict(face=face(eye_open(EYE_N, (4, -6)) + eye_open(EYE_F, (4, -6)), 'hmm', brows(1, 3)),
                  wings=((-58, 60), (60, 40)), nearFront=True, tilt=-6),
    'oops':  dict(face=face(eye_open(EYE_N, (0, 0), 1.06) + eye_open(EYE_F, (0, 0), 1.06), 'o', brows(5, -2)),
                  wings=((158, 46), (14, 42)), tilt=5),
}


def gen_dee():
    for name, pose in POSES.items():
        defs, g = dee_parts(pose, 'd' + name[:2])
        write(f'characters/dee_{name}.svg', svg(256, 256, g, defs))


# ======================================================================= ACORN (svg, golden emblem)
def acorn_svg(cx, cy, s, P=ACORN_GOLD, lw=2.6):
    """Acorn centred at (cx, cy), total height ≈ 1.25 s (stem to tip), width ≈ s."""
    def X(x):
        return f(cx + x * s)

    def Y(y):
        return f(cy + y * s)
    nut = (f'M{X(-0.42)},{Y(-0.08)} C{X(-0.44)},{Y(0.26)} {X(-0.2)},{Y(0.5)} {X(0)},{Y(0.6)} '
           f'C{X(0.2)},{Y(0.5)} {X(0.44)},{Y(0.26)} {X(0.42)},{Y(-0.08)} Z')
    g = path(nut, f'fill="{P["nut"]}"')
    g += path(f'M{X(0.12)},{Y(-0.06)} C{X(0.3)},{Y(0.04)} {X(0.3)},{Y(0.32)} {X(0)},{Y(0.6)} C{X(0.2)},{Y(0.5)} {X(0.44)},{Y(0.26)} {X(0.42)},{Y(-0.08)} Z',
              f'fill="{P["nutSh"]}"')
    g += path(nut, f'fill="none" stroke="{P["line"]}" stroke-width="{f(lw)}" stroke-linejoin="round"')
    g += ell(cx - 0.2 * s, cy + 0.12 * s, 0.07 * s, 0.14 * s, f'fill="{P["nutHi"]}" opacity="0.9"')
    cap = (f'M{X(-0.5)},{Y(-0.02)} C{X(-0.54)},{Y(-0.3)} {X(-0.28)},{Y(-0.44)} {X(0)},{Y(-0.44)} '
           f'C{X(0.28)},{Y(-0.44)} {X(0.54)},{Y(-0.3)} {X(0.5)},{Y(-0.02)} C{X(0.2)},{Y(0.06)} {X(-0.2)},{Y(0.06)} {X(-0.5)},{Y(-0.02)} Z')
    g += path(f'M{X(0.02)},{Y(-0.42)} C{X(0.04)},{Y(-0.56)} {X(0.12)},{Y(-0.64)} {X(0.2)},{Y(-0.66)}', stroke(P['stem'], lw * 1.6))
    g += path(cap, f'fill="{P["cap"]}"')
    g += path(f'M{X(-0.5)},{Y(-0.02)} C{X(-0.2)},{Y(0.06)} {X(0.2)},{Y(0.06)} {X(0.5)},{Y(-0.02)} C{X(0.52)},{Y(-0.14)} {X(0.48)},{Y(-0.2)} {X(0.42)},{Y(-0.24)} C{X(0.2)},{Y(-0.14)} {X(-0.2)},{Y(-0.14)} {X(-0.46)},{Y(-0.2)} Z',
              f'fill="{P["capSh"]}" opacity="0.8"')
    # cap scales: a few short arcs
    for (x, y) in ((-0.28, -0.26), (0, -0.3), (0.28, -0.26), (-0.14, -0.14), (0.14, -0.14)):
        g += path(f'M{X(x - 0.09)},{Y(y)} Q{X(x)},{Y(y + 0.07)} {X(x + 0.09)},{Y(y)}', stroke(P['line'], lw * 0.6) + ' opacity="0.65"')
    g += path(cap, f'fill="none" stroke="{P["line"]}" stroke-width="{f(lw)}" stroke-linejoin="round"')
    return g


# ======================================================================= CARD BACK
def back_quadrant():
    """Swirl + leaves for the top-left quadrant of the card back (mirrored for the other three)."""
    m, l = BACK['mid'], BACK['light']
    g = path('M18,30 C18,18 30,14 38,20 C46,26 40,38 32,34 C26,31 30,24 34,26', stroke(m, 3.2))
    g += path('M34,20 C50,14 64,22 70,34', stroke(m, 2.6))
    g += path('M24,36 C18,50 22,64 32,72', stroke(m, 2.6))
    # leaves along the vines
    for (x, y, a) in ((54, 18, -20), (66, 30, 30), (20, 54, 70), (30, 68, 120)):
        g += ell(x, y, 7.5, 3.6, f'fill="{m}" transform="rotate({a} {x} {y})"')
        g += path(f'M{f(x - 6 * math.cos(math.radians(a)))},{f(y - 6 * math.sin(math.radians(a)))} '
                  f'L{f(x + 6 * math.cos(math.radians(a)))},{f(y + 6 * math.sin(math.radians(a)))}',
                  stroke(BACK['base'], 1.2) + ' opacity="0.8"')
    for (x, y, r) in ((46, 40, 2.2), (40, 52, 1.6), (58, 46, 1.4), (76, 22, 1.8), (16, 80, 1.6)):
        g += circ(x, y, r, f'fill="{l}"')
    return g


def card_back_group(uid):
    """The 156 x 200 card back as an SVG group (used by items/card_back.svg and the icon)."""
    defs = (f'<radialGradient id="{uid}g" cx="0.5" cy="0.45" r="0.62">'
            f'<stop offset="0" stop-color="{mix(BACK["base"], BACK["mid"], 0.35)}"/><stop offset="1" stop-color="{BACK["base"]}"/></radialGradient>'
            f'<clipPath id="{uid}c"><rect x="12" y="12" width="132" height="176" rx="11"/></clipPath>')
    g = rect(2, 2, 152, 196, 18, f'fill="url(#{uid}g)" stroke="{BACK["line"]}" stroke-width="4"')
    g += rect(7, 7, 142, 186, 14, f'fill="none" stroke="{mix(BACK["base"], "#FFFFFF", 0.12)}" stroke-width="2"')
    g += f'<g clip-path="url(#{uid}c)">'
    q = back_quadrant()
    g += q
    g += f'<g transform="translate(156,0) scale(-1,1)">{q}</g>'
    g += f'<g transform="translate(0,200) scale(1,-1)">{q}</g>'
    g += f'<g transform="translate(156,200) scale(-1,-1)">{q}</g>'
    # small leaves at the middle of the long sides
    for x, a in ((22, 90), (134, 90)):
        g += ell(x, 100, 9, 4, f'fill="{BACK["mid"]}" transform="rotate({a} {x} 100)"')
    g += '</g>'
    g += rect(12, 12, 132, 176, 11, f'fill="none" stroke="{BACK["light"]}" stroke-width="2.5" opacity="0.9"')
    # medallion
    g += circ(78, 100, 31, f'fill="{BACK["medal"]}" stroke="{BACK["light"]}" stroke-width="3"')
    g += circ(78, 100, 25, f'fill="none" stroke="{BACK["mid"]}" stroke-width="2" stroke-dasharray="2.5 4" stroke-linecap="round"')
    g += acorn_svg(78, 102, 30)
    # soft sheen upper-left
    g += path('M16,40 C18,24 26,16 42,15', stroke('#FFFFFF', 3) + ' opacity="0.22"')
    return defs, g


def gen_card_back():
    defs, g = card_back_group('cb')
    write('items/card_back.svg', svg(156, 200, g, defs))


# ======================================================================= STARS
def gen_stars():
    sp = rounded_star(32, 34, 29, 14, 0.16)
    defs = f'<clipPath id="st"><path d="{sp}"/></clipPath>'
    g = path(sp, 'fill="#FFC83A"')
    g += '<g clip-path="url(#st)">' + path('M32,34 L64,36 L64,64 L0,64 L0,48 Z', 'fill="#F5A623" opacity="0.65"') + '</g>'
    g += path(sp, f'fill="none" stroke="#C98612" stroke-width="{LW}" stroke-linejoin="round"')
    g += ell(24, 25, 4.5, 8, 'fill="#FFFFFF" opacity="0.75" transform="rotate(35 24 25)"')
    g += circ(19, 36, 2.2, 'fill="#FFFFFF" opacity="0.6"')
    write('ui/star.svg', svg(64, 64, g, defs))
    g = path(sp, f'fill="#E8EDF3" fill-opacity="0.9" stroke="#8E9BAE" stroke-width="{LW}" stroke-linejoin="round"')
    g += path(rounded_star(32, 34, 17, 8.5, 0.2), 'fill="none" stroke="#C4CDD8" stroke-width="2.2" stroke-linejoin="round" stroke-dasharray="3 4"')
    write('ui/star_empty.svg', svg(64, 64, g))


# ======================================================================= ICON
def heart_d(cx, cy, s):
    def P(x, y):
        return f'{f(cx + x * s)},{f(cy + y * s)}'
    return (f'M{P(0, -0.22)} C{P(0.08, -0.42)} {P(0.5, -0.5)} {P(0.5, -0.12)} C{P(0.5, 0.14)} {P(0.2, 0.32)} {P(0, 0.48)} '
            f'C{P(-0.2, 0.32)} {P(-0.5, 0.14)} {P(-0.5, -0.12)} C{P(-0.5, -0.5)} {P(-0.08, -0.42)} {P(0, -0.22)} Z')


def card_front_heart(uid):
    """156 x 200 card front with a glowing red heart lantern (icon only)."""
    defs = (f'<radialGradient id="{uid}h" cx="0.42" cy="0.4" r="0.7"><stop offset="0" stop-color="#FF8E86"/>'
            f'<stop offset="0.55" stop-color="#E84A4A"/><stop offset="1" stop-color="#C7363A"/></radialGradient>'
            f'<radialGradient id="{uid}w" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFE9A8" stop-opacity="0.9"/>'
            f'<stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient>')
    g = rect(2, 2, 152, 196, 18, f'fill="{CARD["face"]}" stroke="{CARD["line"]}" stroke-width="4"')
    g += rect(11, 11, 134, 178, 12, f'fill="none" stroke="{CARD["frame"]}" stroke-width="6"')
    g += circ(78, 104, 62, f'fill="url(#{uid}w)"')
    g += path('M78,40 L78,54', stroke('#9A774C', 3))
    g += rect(68, 52, 20, 8, 3, filled('#C99A3A', '#8A6420', 2.4))
    g += path(heart_d(78, 108, 104), f'fill="url(#{uid}h)" stroke="#A8282E" stroke-width="5" stroke-linejoin="round"')
    g += ell(56, 86, 10, 6, 'fill="#FFFFFF" opacity="0.7" transform="rotate(-35 56 86)"')
    return defs, g


def gen_icon():
    defs = ('<linearGradient id="ibg" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#4E9466"/><stop offset="1" stop-color="#2D6748"/></linearGradient>')
    g = '<rect width="512" height="512" fill="url(#ibg)"/>'
    # soft forest bokeh + leaves
    for (x, y, r, o) in ((60, 70, 54, 0.12), (450, 60, 40, 0.1), (300, 30, 26, 0.12), (470, 300, 60, 0.08), (40, 300, 30, 0.1)):
        g += circ(x, y, r, f'fill="#CDEBB8" opacity="{o}"')
    g += path('M0,420 C120,380 260,392 512,410 L512,512 L0,512 Z', 'fill="#7FB46A"')
    g += path('M0,460 C150,440 340,446 512,456 L512,512 L0,512 Z', 'fill="#6AA35A"')
    # two cards: back card (left, tilted), front card showing a heart (right, tilted the other way)
    bd, bg = card_back_group('icb')
    fd, fg = card_front_heart('icf')
    defs += bd + fd
    g += f'<g transform="translate(222,38) rotate(-12 78 100) scale(1.05)">' + rect(6, 10, 152, 196, 18, 'fill="#1E3F2E" opacity="0.25"') + bg + '</g>'
    g += f'<g transform="translate(330,84) rotate(11 78 100) scale(1.05)">' + rect(6, 10, 152, 196, 18, 'fill="#1E3F2E" opacity="0.25"') + fg + '</g>'
    # Dee big, lower-left, head and shoulders (body runs off the bottom)
    pose = dict(face=face(eye_open(EYE_N, (3, -3)) + eye_open(EYE_F, (3, -3)), 'open'), cheek=1.15,
                wings=((-140, 50), (-40, 44)))
    ddefs, dg = dee_parts(pose, 'ic')
    defs += ddefs
    g += f'<g transform="translate(-96,128) scale(2.02)">{dg}</g>'
    for x, y, s in ((300, 300, 12), (488, 40, 9), (200, 56, 10)):
        g += path(rounded_star(x, y, s, s * 0.42, 0.15), 'fill="#FFF3B0" stroke="#E0A818" stroke-width="2" stroke-linejoin="round"')
    write('icon.svg', svg(512, 512, g, defs))


if __name__ == '__main__':
    gen_dee()
    gen_card_back()
    gen_stars()
    gen_icon()
    print('wrote art to', OUT)
