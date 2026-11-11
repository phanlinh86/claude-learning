#!/usr/bin/env python3
"""Character / core-item art generator for Tuk's Ice Match (character artist A).

Writes (relative to game/assets/default/):
  characters/tuk_{idle,blink,talk,happy,cheer,think,oops}.svg
        0 0 256 256, feet anchor (128,244). Tuk the penguin chick: a round slate-navy chick with a white face mask
        and belly, amber beak and feet, big eyes with catch-lights, rosy cheeks, an off-white knitted hat with cherry
        stripes, a ribbed cuff and a pom-pom. ¾ view facing RIGHT. Every frame shares body / head / hat / feet geometry;
        only eyes, beak, brows, flippers, a small hop (happy / cheer) or a head tilt (think / oops) change.
  items/ice_back.svg    0 0 180 200  a frosted ice block (DESIGN §3 ice palette)
  icon.svg              0 0 512 512  full bleed, opaque: Tuk's face + two ice blocks (one clear with a red fish inside)

Usage: python3 tools/art_tuk.py [outDir]
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
T = {
    'navy': '#2E3A59', 'navySh': '#222B44', 'line': '#161C2E', 'navyHi': '#4A5A80',
    'white': '#FFFFFF', 'whiteSh': '#E3ECF5', 'whiteLn': '#9FB2C8',
    'beak': '#F2A33A', 'beakSh': '#D98A24', 'beakLn': '#B86F17', 'beakHi': '#FBCB82',
    'mouth': '#8E3A3A', 'tongue': '#F28A9A',
    'eye': '#1E1A1A', 'eyeLo': '#3E3546', 'cheek': '#F7A8B8',
    'hat': '#F4EFE6', 'hatSh': '#DDD5C6', 'hatLn': '#A39A8A', 'stripe': '#C9454F', 'stripeSh': '#A8343E',
    'starEye': '#FFD23F', 'starLn': '#C99A12',
}
ICE = {'clear0': '#DDF1FB', 'clear1': '#BFE3F5', 'bevel': '#F4FBFF', 'line': '#6FA7C8', 'side': '#9CCBE3',
       'frost0': '#F2F8FC', 'frost1': '#DCEAF3', 'motif': '#C4DCEB'}
RED = {'base': '#E84A4A', 'dark': '#A8282E', 'light': '#FF8E86'}
LW = 4.2  # outline width at viewBox 256


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


# ======================================================================= TUK geometry
HEAD = (130, 106, 63)            # circle: x 67-193, y 43-169
BODY = (126, 190, 65, 52)        # ellipse: x 61-191, y 138-242
NECK = (128, 166)                # head tilt pivot
EYE_N = (119, 122, 14, 17)       # near eye (viewer's left), bigger
EYE_F = (166, 117, 11, 15)       # far eye, smaller (¾ view facing right)
CHEEKS = ((99, 146, 11.5, 7.5), (186, 138, 5.5, 5))
SH_N = (84, 170)                 # near flipper shoulder
SH_F = (176, 166)                # far flipper shoulder (behind the body)


def head_shape(extra):
    return circ(HEAD[0], HEAD[1], HEAD[2], extra)


def body_shape(extra):
    return ell(BODY[0], BODY[1], BODY[2], BODY[3], extra)


# ---------------------------------------------------------------- hat
CUFF_D = 'M58,78 Q130,52 202,66 L204,90 Q130,74 60,102 Z'
DOME_D = 'M62,78 C56,50 82,30 122,29 C166,28 198,44 199,67 Q130,54 62,78 Z'


def hat(uid):
    defs = f'<clipPath id="{uid}dm"><path d="{DOME_D}"/></clipPath>'
    g = path(DOME_D, f'fill="{T["hat"]}"')
    g += f'<g clip-path="url(#{uid}dm)">'
    g += ell(150, 66, 70, 34, f'fill="{T["hatSh"]}"')                  # cel shade (lower right)
    g += ell(118, 46, 64, 26, f'fill="{T["hat"]}"')
    for y0, w in ((50, 10), (32, 9)):                                     # cherry stripes parallel to the cuff
        g += path(f'M40,{y0 + 24} Q130,{y0 - 4} 220,{y0 + 14}', stroke(T['stripe'], w))
        g += path(f'M40,{y0 + 28} Q130,{y0} 220,{y0 + 18}', stroke(T['stripeSh'], 2.2) + ' opacity="0.6"')
    # knit texture: tiny v stitches in columns
    for i in range(7):
        x = 78 + i * 18
        for y in (36 + abs(i - 3) * 3, 58 + abs(i - 3) * 2):
            g += path(f'M{f(x - 3)},{f(y - 3)} L{f(x)},{f(y + 1)} L{f(x + 3)},{f(y - 3)}', stroke(T['hatLn'], 1.4) + ' opacity="0.45"')
    g += '</g>'
    g += path(DOME_D, f'fill="none" stroke="{T["hatLn"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    g += path('M80,52 C88,38 102,32 116,31', stroke('#FFFFFF', 4) + ' opacity="0.8"')   # highlight upper-left
    # ribbed cuff
    g += path(CUFF_D, filled(T['hat'], T['hatLn']))
    g += path('M64,98 Q130,72 202,88 L203,80 Q130,66 62,92 Z', f'fill="{T["hatSh"]}"')
    for i in range(12):
        t = (i + 0.5) / 12
        x0 = 60 + t * 142
        yt = (1 - t) ** 2 * 78 + 2 * (1 - t) * t * 52 + t * t * 66
        yb = (1 - t) ** 2 * 102 + 2 * (1 - t) * t * 74 + t * t * 90
        g += path(f'M{f(x0)},{f(yt + 4)} L{f(x0 + 1)},{f(yb - 4)}', stroke(T['hatLn'], 1.8) + ' opacity="0.55"')
    g += path(CUFF_D, f'fill="none" stroke="{T["hatLn"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    # pom-pom (scalloped fluffy ball)
    cx, cy, r = 118, 31, 14.5
    pts = []
    for i in range(72):
        a = math.radians(i * 5)
        rr = r + 2.2 * math.cos(a * 9)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    pd = poly(pts)
    g += path(pd, filled(T['stripe'], T['stripeSh'], 3.6))
    g += circ(cx + 4, cy + 4, r * 0.62, f'fill="{T["stripeSh"]}" opacity="0.55"')
    g += circ(cx - 5, cy - 5, r * 0.36, 'fill="#FFFFFF" opacity="0.45"')
    return defs, g


# ---------------------------------------------------------------- face parts
def eye_open(e, look=(2, -2), wide=1.0):
    cx, cy, rx, ry = e
    rx *= wide
    ry *= wide
    px, py = cx + look[0] * 0.5, cy + look[1] * 0.5
    g = ell(px, py, rx, ry, f'fill="{T["eye"]}"')
    g += ell(px + 1, py + ry * 0.45, rx * 0.66, ry * 0.36, f'fill="{T["eyeLo"]}" opacity="0.9"')
    g += ell(px - rx * 0.3 + look[0] * 0.25, py - ry * 0.36 + look[1] * 0.25, rx * 0.44, ry * 0.38, f'fill="{T["white"]}"')
    g += circ(px + rx * 0.42, py + ry * 0.42, rx * 0.18, f'fill="{T["white"]}"')
    return g


def eye_closed(e, kind):
    cx, cy, rx, ry = e
    w = rx * 1.0
    if kind == 'happy':   # ^ ^
        d = f'M{f(cx - w)},{f(cy + 5)} Q{f(cx)},{f(cy - 15)} {f(cx + w)},{f(cy + 5)}'
        return path(d, stroke(T['eye'], 5))
    d = f'M{f(cx - w)},{f(cy + 1)} Q{f(cx)},{f(cy + 10)} {f(cx + w)},{f(cy + 1)}'   # soft closed lid
    return path(d, stroke(T['eye'], 4.6)) + path(f'M{f(cx - w * 0.7)},{f(cy + 8)} l-3,4 M{f(cx)},{f(cy + 9.5)} l0,4.5', stroke(T['eye'], 2.4))


def eye_star(e):
    cx, cy, rx, ry = e
    r = max(rx, ry) * 1.0
    g = path(rounded_star(cx, cy + 1, r, r * 0.5, 0.2),
             f'fill="{T["starEye"]}" stroke="{T["starLn"]}" stroke-width="2.6" stroke-linejoin="round"')
    g += circ(cx - r * 0.18, cy - r * 0.12, r * 0.16, f'fill="{T["white"]}"')
    return g


def brows(up=0, tilt=0):
    g = ''
    for (cx, cy, rx, ry), side in ((EYE_N, -1), (EYE_F, 1)):
        y = cy - ry - 6 - up
        hw = rx * 0.72
        d = f'M{f(cx - hw)},{f(y + 3 + tilt * side)} Q{f(cx)},{f(y - 3)} {f(cx + hw)},{f(y + 3 - tilt * side)}'
        g += path(d, stroke(T['line'], 3.4))
    return g


def beak(kind):
    """Short pointy chick beak pointing right. kind: smile | talk | open | big | o | hmm."""
    up = 'M146,133 C152,126 170,126 182,134 C186,137 184,140 180,140 C168,142 154,142 147,140 C143,138 143,135 146,133 Z'
    g = ''
    if kind in ('smile', 'hmm'):
        lo = ('M149,139 C158,147 172,147 178,140 Z' if kind == 'smile' else 'M151,139 C160,144 170,145 177,140 Z')
        g += path(lo, filled(T['beakSh'], T['beakLn'], 3))
    else:
        drop = {'talk': 9, 'open': 11, 'big': 15, 'o': 10}[kind]
        x1 = {'talk': 176, 'open': 177, 'big': 178, 'o': 168}[kind]
        lo = (f'M148,138 C152,{f(142 + drop)} {f(x1 - 10)},{f(142 + drop)} {f(x1)},{f(139 + drop * 0.45)} '
              f'C{f(x1 + 2)},{f(139)} {f(x1 - 4)},140 166,141 C158,141 152,140 148,138 Z')
        g += path(lo, filled(T['beakSh'], T['beakLn'], 3))
        mx1 = x1 - 6
        g += path(f'M153,140 C158,{f(141 + drop * 0.8)} {f(mx1 - 6)},{f(141 + drop * 0.8)} {f(mx1)},{f(140 + drop * 0.3)} '
                  f'C{f(mx1 - 8)},141 162,142 153,140 Z', f'fill="{T["mouth"]}"')
        g += ell((153 + mx1) / 2 + 1, 141 + drop * 0.55, (mx1 - 153) * 0.24, drop * 0.18, f'fill="{T["tongue"]}"')
    g += path(up, filled(T['beak'], T['beakLn'], 3.4))
    g += path('M150,138 C162,140 172,140 182,137 C180,140 172,141 162,141 C156,141 151,140 150,138 Z', f'fill="{T["beakSh"]}" opacity="0.8"')
    g += path('M153,131 C161,128 169,128 175,131', stroke(T['beakHi'], 2.6))
    return g


def cheeks(k=1.0):
    return ''.join(ell(x, y, rx * k, ry * k, f'fill="{T["cheek"]}" opacity="0.9"') for x, y, rx, ry in CHEEKS)


def flipper(sh, ang, length=50, width=15, front=True):
    """Penguin flipper: a soft paddle from the shoulder pointing along `ang` degrees (0 = right, 90 = down)."""
    L, w = length, width
    d = (f'M-2,{f(-w)} C{f(L * 0.45)},{f(-w * 1.05)} {f(L * 0.85)},{f(-w * 0.6)} {f(L)},{f(-w * 0.05)} '
         f'C{f(L * 1.04)},{f(w * 0.35)} {f(L * 0.9)},{f(w * 0.6)} {f(L * 0.7)},{f(w * 0.62)} '
         f'C{f(L * 0.4)},{f(w * 0.7)} 10,{f(w * 1.0)} -2,{f(w)} C-10,{f(w * 0.5)} -10,{f(-w * 0.5)} -2,{f(-w)} Z')
    sh_d = (f'M{f(L * 0.05)},{f(w * 0.45)} C{f(L * 0.4)},{f(w * 0.3)} {f(L * 0.8)},{f(w * 0.25)} {f(L * 0.98)},{f(w * 0.15)} '
            f'C{f(L * 0.94)},{f(w * 0.55)} {f(L * 0.85)},{f(w * 0.6)} {f(L * 0.7)},{f(w * 0.62)} '
            f'C{f(L * 0.4)},{f(w * 0.7)} 10,{f(w * 1.0)} -2,{f(w)} Z')
    g = f'<g transform="translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)})">'
    g += path(d, f'fill="{T["navy"]}"')
    g += path(sh_d, f'fill="{T["navySh"]}"')
    g += path(d, f'fill="none" stroke="{T["line"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    g += path(f'M{f(L * 0.12)},{f(-w * 0.55)} C{f(L * 0.35)},{f(-w * 0.75)} {f(L * 0.6)},{f(-w * 0.62)} {f(L * 0.78)},{f(-w * 0.38)}',
              stroke(T['navyHi'], 2.8) + ' opacity="0.9"')
    g += '</g>'
    return g


def foot(cx, by, s=1.0, shade=False):
    """Amber webbed foot seen ¾ from the side, three round toes pointing right, bottom at y = by."""
    def P(x, y):
        return f'{f(cx + x * s)},{f(by + y * s)}'
    d = (f'M{P(-17, -4)} C{P(-17, -12)} {P(-6, -14)} {P(2, -13)} C{P(12, -12)} {P(20, -10)} {P(24, -6)} '
         f'Q{P(28, -1)} {P(22, 0)} Q{P(19, 4)} {P(13, 1)} Q{P(9, 5)} {P(3, 1)} Q{P(-2, 4)} {P(-8, 1)} '
         f'C{P(-13, 2)} {P(-17, 1)} {P(-17, -4)} Z')
    col = T['beakSh'] if shade else T['beak']
    g = path(d, filled(col, T['beakLn'], 3.4))
    g += path(f'M{P(9, -6)} L{P(13, 0)} M{P(1, -7)} L{P(3, 0)}', stroke(T['beakLn'], 2) + ' opacity="0.7"')
    g += path(f'M{P(-10, -9)} Q{P(0, -11)} {P(10, -9)}', stroke(T['beakHi'], 2.2) + ' opacity="0.9"')
    return g


def body_block(uid):
    defs = f'<clipPath id="{uid}bd">{body_shape("")}</clipPath>'
    cx, cy, a, b = BODY
    g = body_shape(f'fill="{T["navy"]}"')
    g += f'<g clip-path="url(#{uid}bd)">'
    g += ell(cx + 12, cy + 14, a + 2, b + 2, f'fill="{T["navySh"]}"')
    g += ell(cx - 6, cy - 6, a - 6, b - 6, f'fill="{T["navy"]}"')
    # white belly (pushed forward, to the right) with a cel shade on its lower right
    g += ell(141, 196, 44, 46, f'fill="{T["white"]}"')
    g += path('M176,176 C186,206 170,236 140,244 L200,244 L200,170 Z', f'fill="{T["whiteSh"]}"')
    g += ell(141, 196, 44, 46, f'fill="none" stroke="{T["whiteLn"]}" stroke-width="1.6" opacity="0.5"')
    g += ell(88, 168, 10, 16, f'fill="{T["navyHi"]}" opacity="0.5" transform="rotate(30 88 168)"')   # soft highlight
    # a few fluffy down tufts on the belly
    for d in ('M128,214 q5,-5 10,0', 'M146,226 q5,-5 10,0', 'M152,204 q4,-4 8,0'):
        g += path(d, stroke(T['whiteSh'], 2.4))
    g += '</g>'
    return defs, g


def head_block(uid, pose):
    cx, cy, r = HEAD
    defs = f'<clipPath id="{uid}hd">{head_shape("")}</clipPath>'
    g = head_shape(f'fill="{T["navy"]}"')
    g += f'<g clip-path="url(#{uid}hd)">'
    g += circ(cx + 12, cy + 12, r + 2, f'fill="{T["navySh"]}"')
    g += circ(cx - 5, cy - 6, r - 4, f'fill="{T["navy"]}"')
    # white face mask: two lobes round the eyes + the chin (¾ view, shifted right)
    mask = (ell(119, 128, 31, 33, '') + ell(165, 124, 26, 31, '') + ell(146, 154, 46, 26, ''))
    g += f'<g fill="{T["white"]}">{mask}</g>'
    g += path('M188,118 C192,140 182,162 160,172 L200,172 L200,110 Z', f'fill="{T["whiteSh"]}"')
    g += ell(70, 118, 8, 22, f'fill="{T["navyHi"]}" opacity="0.45"')      # rim light upper-left of the head
    g += '</g>'
    g += cheeks(pose.get('cheek', 1.0))
    g += pose['face']
    hd, hg = hat(uid)
    defs += hd
    g += f'<g transform="rotate(-3 130 80)">{hg}</g>'
    return defs, g


def tuk_parts(pose, uid):
    defs, g = '', ''
    hop = pose.get('hop', 0)
    (an, ln), (af, lf) = pose.get('flippers', ((100, 48), (66, 46)))
    front_near = pose.get('nearFront', False)
    sh_n = pose.get('shN', SH_N)
    tilt = pose.get('tilt', 0)
    tr = f' transform="rotate({f(tilt)} {f(NECK[0])} {f(NECK[1])})"' if tilt else ''
    g += f'<g transform="translate(0,{f(-hop)})">'
    g += flipper(SH_F, af, lf, 14)                                       # far flipper (behind the body)
    # union outline: both outlines stroked first (2 x LW), then the fills cover the inner halves
    g += body_shape(f'fill="none" stroke="{T["line"]}" stroke-width="{f(LW * 2)}"')
    g += f'<g{tr}>' + head_shape(f'fill="none" stroke="{T["line"]}" stroke-width="{f(LW * 2)}"') + '</g>'
    bd, bg = body_block(uid)
    defs += bd
    g += bg
    g += foot(152, 242, 0.88, shade=True)
    g += foot(106, 244, 1.0)
    if not front_near:
        g += flipper(sh_n, an, ln, 13.5)
    hd, hg = head_block(uid, pose)
    defs += hd
    g += f'<g{tr}>{hg}</g>'
    if front_near:
        g += flipper(sh_n, an, ln, 15)
    g += '</g>'
    return defs, g


def face(eyes, b, extra=''):
    return eyes + beak(b) + extra


POSES = {
    'idle':  dict(face=face(eye_open(EYE_N) + eye_open(EYE_F), 'smile')),
    'blink': dict(face=face(eye_closed(EYE_N, 'blink') + eye_closed(EYE_F, 'blink'), 'smile')),
    'talk':  dict(face=face(eye_open(EYE_N) + eye_open(EYE_F), 'talk')),
    'happy': dict(face=face(eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy'), 'open'),
                  flippers=((-150, 50), (-34, 46)), hop=8, cheek=1.2),
    'cheer': dict(face=face(eye_star(EYE_N) + eye_star(EYE_F), 'big'),
                  flippers=((-178, 54), (-6, 50)), hop=10, cheek=1.25),
    'think': dict(face=face(eye_open(EYE_N, (5, -7)) + eye_open(EYE_F, (5, -7)), 'hmm', brows(1, 3)),
                  flippers=((-46, 50), (66, 46)), shN=(112, 182), nearFront=True, tilt=-5),
    'oops':  dict(face=face(eye_open(EYE_N, (0, 0), 1.08) + eye_open(EYE_F, (0, 0), 1.08), 'o', brows(4, -2)),
                  flippers=((150, 48), (24, 46)), tilt=5),
}


def gen_tuk():
    for name, pose in POSES.items():
        defs, g = tuk_parts(pose, 't' + name[:2])
        write(f'characters/tuk_{name}.svg', svg(256, 256, g, defs))


# ======================================================================= ICE BLOCK (svg)
def snowflake(cx, cy, r, col, w):
    g = ''
    for i in range(6):
        a = math.radians(i * 60 - 90)
        x1, y1 = cx + r * math.cos(a), cy + r * math.sin(a)
        g += path(f'M{f(cx)},{f(cy)} L{f(x1)},{f(y1)}', stroke(col, w))
        for t, br in ((0.55, 0.3), (0.8, 0.2)):
            bx, by = cx + r * t * math.cos(a), cy + r * t * math.sin(a)
            for s in (-1, 1):
                b = a + s * math.radians(45)
                g += path(f'M{f(bx)},{f(by)} L{f(bx + r * br * math.cos(b))},{f(by + r * br * math.sin(b))}', stroke(col, w * 0.8))
    g += circ(cx, cy, r * 0.12, f'fill="{col}"')
    return g


def sparkle(x, y, s, col='#FFFFFF', op=0.95):
    return path(f'M{f(x)},{f(y - s)} Q{f(x + s * 0.18)},{f(y - s * 0.18)} {f(x + s)},{f(y)} Q{f(x + s * 0.18)},{f(y + s * 0.18)} {f(x)},{f(y + s)} '
                f'Q{f(x - s * 0.18)},{f(y + s * 0.18)} {f(x - s)},{f(y)} Q{f(x - s * 0.18)},{f(y - s * 0.18)} {f(x)},{f(y - s)} Z',
                f'fill="{col}" opacity="{op}"')


def fish(cx, cy, s, P=RED):
    """Rounded cute fish facing right, body length ≈ 1.6 s."""
    def X(x):
        return f(cx + x * s)

    def Y(y):
        return f(cy + y * s)
    tail = f'M{X(-0.5)},{Y(0)} L{X(-0.95)},{Y(-0.42)} Q{X(-1.02)},{Y(0)} {X(-0.95)},{Y(0.42)} Z'
    g = path(tail, filled(P['base'], P['dark'], 0.05 * s))
    g += path(f'M{X(-0.05)},{Y(-0.42)} Q{X(0.08)},{Y(-0.7)} {X(0.32)},{Y(-0.44)} Z', filled(P['base'], P['dark'], 0.045 * s))
    body = f'M{X(0.66)},{Y(0)} C{X(0.6)},{Y(-0.48)} {X(-0.2)},{Y(-0.56)} {X(-0.58)},{Y(0)} C{X(-0.2)},{Y(0.56)} {X(0.6)},{Y(0.48)} {X(0.66)},{Y(0)} Z'
    g += path(body, f'fill="{P["base"]}"')
    g += path(f'M{X(-0.5)},{Y(0.1)} C{X(-0.1)},{Y(0.5)} {X(0.5)},{Y(0.42)} {X(0.64)},{Y(0.08)} C{X(0.5)},{Y(0.5)} {X(-0.2)},{Y(0.52)} {X(-0.5)},{Y(0.1)} Z',
              f'fill="{P["dark"]}" opacity="0.35"')
    g += path(body, f'fill="none" stroke="{P["dark"]}" stroke-width="{f(0.05 * s)}" stroke-linejoin="round"')
    g += ell(cx - 0.02 * s, cy - 0.2 * s, 0.22 * s, 0.08 * s, f'fill="{P["light"]}" opacity="0.8"')
    g += path(f'M{X(-0.1)},{Y(0.05)} Q{X(0.05)},{Y(0.2)} {X(0.0)},{Y(0.3)}', stroke(P['dark'], 0.04 * s) + ' opacity="0.7"')
    g += circ(cx + 0.36 * s, cy - 0.08 * s, 0.11 * s, 'fill="#1E1A1A"')
    g += circ(cx + 0.33 * s, cy - 0.11 * s, 0.04 * s, 'fill="#FFFFFF"')
    g += path(f'M{X(0.5)},{Y(0.14)} Q{X(0.56)},{Y(0.19)} {X(0.62)},{Y(0.13)}', stroke(P['dark'], 0.035 * s))
    g += ell(cx + 0.26 * s, cy + 0.12 * s, 0.07 * s, 0.045 * s, f'fill="{RED["light"]}" opacity="0.8"')
    return g


def ice_block_group(uid, frosted=True, inner=''):
    """A 180 x 200 chunky ice block: top face 172 x 180, a 10 px side face below. Frosted or clear with `inner`."""
    W, H, r = 172, 180, 0.16 * 172
    defs = (f'<linearGradient id="{uid}cl" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="{ICE["clear0"]}"/>'
            f'<stop offset="1" stop-color="{ICE["clear1"]}"/></linearGradient>'
            f'<linearGradient id="{uid}fr" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="{ICE["frost0"]}"/>'
            f'<stop offset="1" stop-color="{ICE["frost1"]}"/></linearGradient>'
            f'<clipPath id="{uid}c">{rect(4, 4, W, H, r)}</clipPath>')
    g = rect(4, 14, W, H, r, filled(ICE['side'], ICE['line'], 4))                       # side face
    g += path(f'M{f(4 + r)},{f(H + 10)} L{f(W + 4 - r)},{f(H + 10)}', stroke('#BFE0F0', 2) + ' opacity="0.8"')
    g += rect(4, 4, W, H, r, f'fill="url(#{uid}cl)"')
    g += f'<g clip-path="url(#{uid}c)">'
    if frosted:
        g += rect(4, 4, W, H, r, f'fill="url(#{uid}fr)"')
        g += snowflake(90, 94, 46, ICE['motif'], 4.2)
        for (x, y, rr) in ((30, 38, 9), (150, 150, 10), (148, 34, 6), (32, 156, 6)):
            g += snowflake(x, y, rr, ICE['motif'], 1.8)
        for (x, y, s) in ((54, 28, 5), (134, 64, 4), (40, 120, 3.5), (128, 136, 5), (100, 164, 3)):
            g += sparkle(x, y, s)
        # frosty rim: soft crystals growing from the edges
        g += rect(10, 10, W - 12, H - 12, r - 6, f'fill="none" stroke="#FFFFFF" stroke-width="5" opacity="0.6"')
    else:
        g += inner
        g += rect(4, 4, W, H, r, 'fill="#FFFFFF" opacity="0.12"')                     # glaze
        g += path('M26,150 L150,30', stroke('#FFFFFF', 7) + ' opacity="0.28"')       # shine streaks
        g += path('M44,166 L162,52', stroke('#FFFFFF', 3) + ' opacity="0.25"')
    # bevel highlight top-left
    g += path(f'M14,{f(H * 0.62)} L14,{f(r + 6)} Q14,14 {f(r + 6)},14 L{f(W * 0.62)},14', stroke(ICE['bevel'], 6) + ' opacity="0.95"')
    g += '</g>'
    g += rect(4, 4, W, H, r, f'fill="none" stroke="{ICE["line"]}" stroke-width="4"')
    return defs, g


def gen_ice_back():
    defs, g = ice_block_group('ib', True)
    write('items/ice_back.svg', svg(180, 200, g, defs))


# ======================================================================= ICON
def gen_icon():
    defs = ('<linearGradient id="ibg" x1="0" y1="0" x2="0.3" y2="1">'
            '<stop offset="0" stop-color="#9ED8F2"/><stop offset="1" stop-color="#4C9FD6"/></linearGradient>')
    g = '<rect width="512" height="512" fill="url(#ibg)"/>'
    for (x, y, r, o) in ((70, 60, 54, 0.16), (440, 470, 70, 0.1), (250, 40, 24, 0.18), (30, 260, 28, 0.12)):
        g += circ(x, y, r, f'fill="#FFFFFF" opacity="{o}"')
    # frozen lake band at the bottom
    g += path('M0,404 C140,384 330,388 512,398 L512,512 L0,512 Z', 'fill="#D9EEF8"')
    g += path('M0,446 C170,430 350,436 512,442 L512,512 L0,512 Z', 'fill="#C2E1F1"')
    # two ice blocks on the right: frosted behind, clear with a red fish in front
    fd, fg = ice_block_group('icf', True)
    inner = fish(90, 96, 92)
    cd, cg = ice_block_group('icc', False, inner)
    defs += fd + cd
    g += '<g transform="translate(296,24) rotate(-10 90 100) scale(0.84)">' + rect(8, 18, 172, 186, 28, 'fill="#1F5B86" opacity="0.2"') + fg + '</g>'
    g += '<g transform="translate(330,232) rotate(7 90 100) scale(0.96)">' + rect(8, 18, 172, 186, 28, 'fill="#1F5B86" opacity="0.22"') + cg + '</g>'
    # Tuk big, lower-left, head and shoulders (body runs off the bottom)
    pose = dict(face=face(eye_open(EYE_N, (4, -2)) + eye_open(EYE_F, (4, -2)), 'open'), cheek=1.15,
                flippers=((-140, 48), (66, 46)))
    tdefs, tg = tuk_parts(pose, 'ic')
    defs += tdefs
    g += f'<g transform="translate(-36,112) scale(1.8)">{tg}</g>'
    for x, y, s in ((230, 70, 13), (488, 210, 9), (60, 150, 10), (300, 470, 8)):
        g += sparkle(x, y, s, '#FFFFFF', 0.95)
    write('icon.svg', svg(512, 512, g, defs))


if __name__ == '__main__':
    gen_tuk()
    gen_ice_back()
    gen_icon()
    print('wrote art to', OUT)
