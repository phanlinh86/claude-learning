#!/usr/bin/env python3
"""Character / rocket / UI art generator for Bim's Rainbow Rocket (character artist A).

Writes (relative to game/assets/default/):
  characters/bim_{idle,blink,talk,happy,cheer,think,oops}.svg   0 0 256 256
        Bim the baby elephant as seen in the rocket cockpit: head, shoulders, arms. The head is IDENTICAL in every frame
        (centre (128,122)); only eyes, mouth, trunk, ears and arms change. Neck anchor (128,236) = the point placed on the
        rocket's cockpit neck point (100,118) when Bim is drawn at 0.55 scale. Everything below y ≈ 225 is hidden by
        the canopy rim in the rocket.
  characters/bim_full_{wave,cheer}.svg   0 0 256 300   whole Bim standing, feet anchor (128,288)
  characters/rocket_back.svg   0 0 200 300   body, fins, legs, nozzle, cockpit interior (drawn BEHIND Bim)
        nozzle exit centre (100,286), cockpit neck point (100,118), feet bottom y = 296
  characters/rocket_front.svg  0 0 200 300   glass canopy + gold rim + nose cap (drawn OVER Bim)
  items/wagon_back.svg, items/wagon_front.svg   0 0 160 110   cloud wagon halves, hitch point (80,18)
  ui/star.svg, ui/star_empty.svg   0 0 64 64
  icon.svg   0 0 512 512   full bleed: Bim waving from the rocket among rainbow clouds

Usage: python3 tools/art_bim.py [outDir]
Rules (docs/DESIGN.md §3): 100 % original, flat cartoon, ≈4 px outline in a darker tone (never black), one-step cel
shading + one soft highlight upper-left, no <text>/fonts/scripts/external refs, no filters. width/height = viewBox.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md §3)
B = {
    'skin': '#B8BED3', 'shade': '#9AA1BA', 'line': '#6B7290', 'hi': '#DADEEA', 'pink': '#F6B8C8', 'pinkSh': '#E89AB0',
    'eye': '#2F2A3A', 'white': '#FFFFFF', 'nail': '#EEF0F6', 'mouth': '#7A3346', 'tongue': '#F08AA0',
    'scarf': '#8FDCC6', 'scarfDk': '#4FA88E', 'scarfSh': '#72C7AF', 'scarfHi': '#C2EEE1',
    'gog': '#B98552', 'gogDk': '#7E5630', 'gogHi': '#D9AB7A', 'lens': '#DDF2FF', 'lensSh': '#B5DDF5',
    'star': '#FFD54A', 'starLn': '#C98A12',
}
R = {
    'body': '#FFF4E2', 'shade': '#E9D7B9', 'line': '#8A6E4E', 'hi': '#FFFFFF',
    'teal': '#2FA7A0', 'tealDk': '#1E7A74', 'tealLn': '#16564F', 'tealHi': '#6CCBC3',
    'gold': '#E8B44A', 'goldDk': '#A87A22', 'goldHi': '#F8D98A',
    'glass': '#CFEFFF', 'glassLn': '#86AFC9', 'inside': '#C6E6F8', 'insideSh': '#A9D2EC',
}
CLOUD = {'fill': '#FFFFFF', 'shade': '#DCE2F6', 'line': '#9AA6D1'}
STAR = {'base': '#FFC93C', 'dark': '#C98A12', 'hi': '#FFE89A', 'sh': '#F2AE22'}
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


def path(d, extra=''):
    return f'<path d="{d}" {extra}/>'


def stroke(col, w, fill='none'):
    return f'fill="{fill}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"'


def filled(fill, line, w=LW):
    return f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"'


def poly_d(pts, close=True):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + (' Z' if close else '')


def smooth_d(pts):
    """Closed smooth path through pts (Catmull-Rom → cubic Bézier)."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + ' Z'


def rounded_star(cx, cy, ro, ri, rr=0.2, rot=-90):
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


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1])


def bez_tan(p0, p1, p2, p3, t):
    u = 1 - t
    dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0])
    dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1])
    L = math.hypot(dx, dy) or 1
    return dx / L, dy / L


def rot_pt(p, ang, about):
    a = math.radians(ang)
    x, y = p[0] - about[0], p[1] - about[1]
    return (about[0] + x * math.cos(a) - y * math.sin(a), about[1] + x * math.sin(a) + y * math.cos(a))


# ======================================================================= BIM geometry (cockpit frame 256 × 256)
HEAD_C = (128, 122)
HEAD_AB = (70, 64)          # x 58-198, y 58-186
EYES = ((103, 124), (153, 124))
EYE_R = (11.5, 15)
CHEEKS = ((80, 152), (176, 152))
EAR_L = (66, 126)           # ear centre (viewer's left)
EAR_ATTACH_L = (96, 104)    # pivot for the "one ear up" pose
TRUNK_ROOT = (128, 138)
NECK = (128, 236)


def head_d():
    cx, cy = HEAD_C
    a, b = HEAD_AB
    pts = []
    for i in range(72):
        th = math.radians(i * 5)
        c, s = math.cos(th), math.sin(th)
        k = 1 + 0.07 * max(0.0, s) ** 1.5 - 0.03 * max(0.0, -s)   # chubby cheeks, slightly narrower crown
        pts.append((cx + a * c * k, cy + b * s * (1 + 0.02 * max(0.0, s))))
    return smooth_d(pts)


def ear_pts(side):
    """Big round ear flap, attached behind the head. side -1 = viewer's left, +1 = right."""
    cx = 128 + side * (128 - EAR_L[0])
    cy = EAR_L[1]
    pts = []
    for i in range(36):
        th = math.radians(i * 10)
        c, s = math.cos(th), math.sin(th)
        rx = 48 + 6 * max(0.0, s)           # wider at the bottom
        ry = 56 + 4 * max(0.0, s)
        # a small dent near the bottom-outer edge for an elephant-ear wiggle
        dent = -5 * math.exp(-((th - math.radians(60 if side > 0 else 120)) ** 2) / 0.04)
        pts.append((cx + (rx + dent) * c, cy + (ry + dent) * s))
    return pts


def inner_ear_pts(side):
    cx = 128 + side * (128 - 60)
    cy = 130
    pts = []
    for i in range(30):
        th = math.radians(i * 12)
        c, s = math.cos(th), math.sin(th)
        pts.append((cx + (30 + 4 * max(0.0, s)) * c, cy + (38 + 3 * max(0.0, s)) * s))
    return pts


def ear(p, side, ang=0):
    pivot = (128 + side * (128 - EAR_ATTACH_L[0]), EAR_ATTACH_L[1])
    tr = f' transform="rotate({f(ang)} {f(pivot[0])} {f(pivot[1])})"' if ang else ''
    outer = smooth_d(ear_pts(side))
    cid = f'{p}ear{"L" if side < 0 else "R"}'
    cx = 128 + side * (128 - EAR_L[0])
    defs = f'<clipPath id="{cid}"><path d="{outer}"/></clipPath>'
    body = (f'<g{tr}>' + path(outer, filled(B['skin'], B['line'])) +
            f'<g clip-path="url(#{cid})">' +
            ell(cx + side * 26, EAR_L[1] + 40, 46, 42, f'fill="{B["shade"]}"') +
            path(smooth_d(inner_ear_pts(side)), f'fill="{B["pink"]}"') +
            ell(cx + side * 14, 150, 22, 18, f'fill="{B["pinkSh"]}" opacity=".55"') +
            ell(cx - side * 12, 98, 14, 10, f'fill="#FFFFFF" opacity=".28"') +
            '</g>' + path(outer, stroke(B['line'], LW)) + '</g>')
    return defs, body


def torso(p):
    d = 'M60,262 C60,226 70,206 92,198 Q128,186 164,198 C186,206 196,226 196,262 Z'
    cid = p + 'torso'
    defs = f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'
    body = (path(d, filled(B['skin'], B['line'])) + f'<g clip-path="url(#{cid})">' +
            ell(186, 248, 40, 50, f'fill="{B["shade"]}"') + '</g>' + path(d, stroke(B['line'], LW)))
    return defs, body


def scarf(p, cx=128, cy=192, sc=1.0):
    """Mint scarf around the neck with a knot and two tails on the viewer's left."""
    def T(x, y):
        return (cx + (x - 128) * sc, cy + (y - 192) * sc)
    band = [T(76, 184), T(102, 192), T(128, 195), T(154, 192), T(180, 184), T(184, 196), T(156, 208), T(128, 212),
            T(100, 208), T(72, 196)]
    bd = smooth_d(band)
    tail1 = [T(86, 200), T(98, 206), T(96, 228), T(90, 246), T(76, 244), T(80, 224)]
    tail2 = [T(80, 200), T(88, 210), T(76, 230), T(64, 240), T(58, 230), T(70, 214)]
    knot = ell(*T(86, 202), 13 * sc, 11 * sc, filled(B['scarf'], B['scarfDk'], LW * sc))
    out = ''
    for tl in (tail2, tail1):
        out += path(smooth_d(tl), filled(B['scarf'], B['scarfDk'], LW * sc))
    # stripes on the tails
    out += path(f'M{f(T(82,226)[0])},{f(T(82,226)[1])} L{f(T(96,228)[0])},{f(T(96,228)[1])}', stroke(B['scarfDk'], 3 * sc))
    out += path(f'M{f(T(66,230)[0])},{f(T(66,230)[1])} L{f(T(76,236)[0])},{f(T(76,236)[1])}', stroke(B['scarfDk'], 3 * sc))
    out += path(bd, filled(B['scarf'], B['scarfDk'], LW * sc))
    out += path(f'M{f(T(84,190)[0])},{f(T(84,190)[1])} Q{f(T(128,204)[0])},{f(T(128,204)[1])} {f(T(172,190)[0])},{f(T(172,190)[1])}',
                stroke(B['scarfHi'], 3.2 * sc))
    out += path(f'M{f(T(100,205)[0])},{f(T(100,205)[1])} Q{f(T(128,212)[0])},{f(T(128,212)[1])} {f(T(158,204)[0])},{f(T(158,204)[1])}',
                stroke(B['scarfSh'], 3 * sc))
    out += knot
    return out


def goggles():
    l, r = (100, 72), (156, 72)
    out = ''
    # strap following the crown, behind the lenses
    out += path('M60,108 C62,86 76,76 88,74', stroke(B['gogDk'], 12))
    out += path('M60,108 C62,86 76,76 88,74', stroke(B['gog'], 7))
    out += path('M196,108 C194,86 180,76 168,74', stroke(B['gogDk'], 12))
    out += path('M196,108 C194,86 180,76 168,74', stroke(B['gog'], 7))
    # bridge
    out += path('M114,72 Q128,64 142,72', stroke(B['gogDk'], 9))
    out += path('M114,72 Q128,64 142,72', stroke(B['gog'], 4.5))
    for (x, y) in (l, r):
        out += circ(x, y, 17, filled(B['gog'], B['gogDk']))
        out += circ(x, y, 11.5, filled(B['lens'], B['gogDk'], 2.6))
        out += path(f'M{f(x - 2)},{f(y + 11)} A11.5,11.5 0 0 0 {f(x + 11)},{f(y + 1)}', stroke(B['lensSh'], 4))
        out += path(f'M{f(x - 7)},{f(y - 1)} Q{f(x - 6)},{f(y - 7)} {f(x - 1)},{f(y - 8)}', stroke('#FFFFFF', 3.2))
        out += path(f'M{f(x - 13)},{f(y - 6)} A14,14 0 0 1 {f(x - 4)},{f(y - 14)}', stroke(B['gogHi'], 2.4))
    return out


def eyes(kind):
    out = ''
    rx, ry = EYE_R
    for i, (x, y) in enumerate(EYES):
        if kind in ('open', 'look', 'wide'):
            dx, dy = (4, -4) if kind == 'look' else (0, 0)
            k = 1.08 if kind == 'wide' else 1.0
            out += ell(x + dx, y + dy, rx * k, ry * k, f'fill="{B["eye"]}"')
            out += circ(x + dx - 3.6, y + dy - 5.6, 4.8, 'fill="#FFFFFF"')
            out += circ(x + dx + 4, y + dy + 5.5, 2, 'fill="#FFFFFF" opacity=".85"')
        elif kind == 'closed':
            out += path(f'M{f(x - 11)},{f(y + 1)} Q{f(x)},{f(y + 10)} {f(x + 11)},{f(y + 1)}', stroke(B['eye'], 4.2))
            out += path(f'M{f(x + (-12 if i == 0 else 12))},{f(y + 1)} l{f(-4 if i == 0 else 4)},-3', stroke(B['eye'], 3))
        elif kind == 'happy':
            out += path(f'M{f(x - 11)},{f(y + 4)} Q{f(x)},{f(y - 12)} {f(x + 11)},{f(y + 4)}', stroke(B['eye'], 5))
        elif kind == 'star':
            out += path(rounded_star(x, y + 1, 17, 8, 0.22), filled(B['star'], B['starLn'], 3.2))
            out += circ(x - 4, y - 3, 2.6, 'fill="#FFFFFF"')
    return out


def brows(kind):
    if kind == 'up':      # "hmm?" — left brow raised high, right level
        return (path('M90,104 Q101,94 113,100', stroke(B['line'], 4)) +
                path('M143,106 Q153,103 164,106', stroke(B['line'], 4)))
    if kind == 'think':
        return (path('M92,104 Q102,99 113,103', stroke(B['line'], 4)) +
                path('M142,101 Q153,95 165,101', stroke(B['line'], 4)))
    return ''


def cheeks():
    return ''.join(ell(x, y, 14, 8.5, f'fill="{B["pink"]}" opacity=".9"') + ell(x - 4, y - 2, 4, 2.2, 'fill="#FFFFFF" opacity=".55"')
                   for (x, y) in CHEEKS)


def mouth(kind):
    if kind == 'smile':
        return path('M96,168 Q128,194 160,168', stroke(B['line'], 4.2))
    if kind == 'open':     # talking: open D under the lifted trunk
        d = 'M100,170 Q128,176 150,168 Q146,196 124,197 Q104,196 100,170 Z'
        return (path(d, filled(B['mouth'], B['line'], 3.6)) +
                path('M110,190 Q124,182 138,190 Q126,196 110,190 Z', f'fill="{B["tongue"]}"'))
    if kind == 'big':
        d = 'M90,166 Q128,180 166,166 Q160,206 128,207 Q96,206 90,166 Z'
        return (path(d, filled(B['mouth'], B['line'], 3.8)) +
                path('M104,196 Q128,184 152,196 Q130,208 104,196 Z', f'fill="{B["tongue"]}"'))
    if kind == 'o':
        return ell(102, 178, 7, 8, filled(B['mouth'], B['line'], 3.4))
    if kind == 'think':
        return path('M100,172 Q112,176 122,170', stroke(B['line'], 4))
    return ''


TRUNKS = {
    'down':  [((128, 138), (126, 168), (118, 192), (134, 202)), ((134, 202), (150, 210), (168, 198), (162, 184))],
    'talk':  [((128, 138), (132, 160), (146, 170), (162, 168)), ((162, 168), (178, 166), (186, 152), (178, 144))],
    'up':    [((128, 138), (132, 162), (160, 168), (174, 152)), ((174, 152), (186, 138), (184, 120), (196, 110))],
    'high':  [((128, 138), (134, 164), (166, 166), (180, 146)), ((180, 146), (192, 128), (186, 104), (202, 92))],
    'chin':  [((128, 138), (128, 170), (124, 194), (110, 198)), ((110, 198), (94, 202), (88, 186), (100, 178))],
    'wiggle': [((128, 138), (118, 160), (146, 176), (138, 194)), ((138, 194), (132, 206), (116, 204), (118, 192))],
}


def trunk(kind):
    segs = TRUNKS[kind]
    d = f'M{f(segs[0][0][0])},{f(segs[0][0][1])}'
    for s in segs:
        d += f' C{f(s[1][0])},{f(s[1][1])} {f(s[2][0])},{f(s[2][1])} {f(s[3][0])},{f(s[3][1])}'
    out = path(d, stroke(B['line'], 31))
    out += path(d, stroke(B['skin'], 22.6))
    # cel shade along one side: offset copy clipped by the trunk width (drawn thin, offset to lower-right)
    sh = ''
    for s in segs:
        pts = [bez(*s, t / 10) for t in range(11)]
        tans = [bez_tan(*s, t / 10) for t in range(11)]
        pp = [(x - ty * 6.5, y + tx * 6.5) for (x, y), (tx, ty) in zip(pts, tans)]
        # normal pointing to the right of the travel direction; choose side that is lower/right on screen
        if sum(-ty for _, ty in tans) < 0:
            pp = [(x + ty * 6.5, y - tx * 6.5) for (x, y), (tx, ty) in zip(pts, tans)]
        sh += 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pp) + ' '
    out += path(sh.strip(), stroke(B['shade'], 7) + ' opacity=".9"')
    # wrinkles across the trunk
    for (si, t) in ((0, 0.35), (0, 0.55), (0, 0.75)):
        s = segs[si]
        x, y = bez(*s, t)
        tx, ty = bez_tan(*s, t)
        nx, ny = -ty, tx
        a = (x + nx * 7.5, y + ny * 7.5)
        b = (x - nx * 7.5, y - ny * 7.5)
        c = (x + tx * 3, y + ty * 3)
        out += path(f'M{f(a[0])},{f(a[1])} Q{f(c[0])},{f(c[1])} {f(b[0])},{f(b[1])}', stroke(B['line'], 2.4) + ' opacity=".55"')
    # tip: little nostril ring
    s = segs[-1]
    tx, ty = bez_tan(*s, 1)
    ex, ey = s[3]
    ang = math.degrees(math.atan2(ty, tx))
    out += ell(ex + tx * 4, ey + ty * 4, 3.4, 7.6, f'fill="{B["shade"]}" stroke="{B["line"]}" stroke-width="2" '
               f'transform="rotate({f(ang)} {f(ex + tx * 4)} {f(ey + ty * 4)})"')
    # blend the root into the face (covers the round cap's outline)
    out += ell(128, 139, 11.6, 9, f'fill="{B["skin"]}"')
    # highlight along the upper-left edge near the root
    out += path('M120,146 Q119,156 121,166', stroke('#FFFFFF', 3) + ' opacity=".35"')
    return out


def hand(x, y, r=14.5, nails=True, ang=0):
    out = circ(x, y, r, filled(B['skin'], B['line']))
    out += ell(x + r * 0.3, y + r * 0.35, r * 0.62, r * 0.45, f'fill="{B["shade"]}" opacity=".7"')
    if nails:
        a = math.radians(ang)
        for k in (-1, 0, 1):
            px = x + k * r * 0.48
            py = y + r * 0.55 - abs(k) * 2
            q = rot_pt((px, py), ang, (x, y))
            out += ell(q[0], q[1], 3.4, 2.4, f'fill="{B["nail"]}" stroke="{B["line"]}" stroke-width="1.4"')
    return out


def arm(sx, sy, hx, hy, bend=0.0, r=14.5):
    mx, my = (sx + hx) / 2, (sy + hy) / 2
    nx, ny = -(hy - sy), (hx - sx)
    L = math.hypot(nx, ny) or 1
    cx, cy = mx + nx / L * bend, my + ny / L * bend
    d = f'M{f(sx)},{f(sy)} Q{f(cx)},{f(cy)} {f(hx)},{f(hy)}'
    return path(d, stroke(B['line'], 26)) + path(d, stroke(B['skin'], 18))


ARMS = {
    # (shoulder, hand, bend) for viewer-left and viewer-right arms; None = hand resting on the rim
    'rest':  [((80, 214), (78, 216), 0), ((176, 214), (178, 216), 0)],
    'wave':  [((80, 214), (78, 216), 0), ((178, 210), (214, 150), -10)],
    'yay':   [((84, 212), (58, 178), 8), ((172, 212), (198, 178), -8)],
    'up':    [((86, 210), (40, 118), 14), ((170, 210), (216, 118), -14)],
    'chin':  [((84, 214), (96, 198), 8), ((176, 214), (178, 216), 0)],
    'shrug': [((80, 214), (78, 216), 0), ((176, 212), (206, 182), -8)],
}


def arms(kind):
    out = ''
    for (sh, hd, bend) in ARMS[kind]:
        if sh != hd and math.hypot(sh[0] - hd[0], sh[1] - hd[1]) > 6:
            out += arm(sh[0], sh[1], hd[0], hd[1], bend)
        out += hand(hd[0], hd[1])
    return out


MOODS = {
    #           eyes      mouth    trunk    arms    ears (L,R deg)  brows
    'idle':  ('open',   'smile', 'down',  'rest', (0, 0),    ''),
    'blink': ('closed', 'smile', 'down',  'rest', (0, 0),    ''),
    'talk':  ('open',   'open',  'talk',  'wave', (0, 0),    ''),
    'happy': ('happy',  'big',   'up',    'yay',  (-6, 6),   ''),
    'cheer': ('star',   'big',   'high',  'up',   (-12, 12), ''),
    'think': ('look',   'think', 'chin',  'chin', (0, 0),    'think'),
    'oops':  ('wide',   'o',     'wiggle', 'shrug', (-26, 0), 'up'),
}


def bim_head(p, mood, with_arms=True):
    """Ears + head + face + trunk (no torso). Returns defs, body."""
    e, m, t, a, (eL, eR), br = MOODS[mood]
    defs = ''
    body = ''
    for side, ang in ((-1, eL), (1, eR)):
        d, b = ear(p, side, ang)
        defs += d
        body += b
    return defs, body, (e, m, t, a, br)


def bim_face(p, parts):
    e, m, t, a, br = parts
    hd = head_d()
    cid = p + 'head'
    defs = f'<clipPath id="{cid}"><path d="{hd}"/></clipPath>'
    body = path(hd, filled(B['skin'], B['line']))
    body += f'<g clip-path="url(#{cid})">'
    body += ell(176, 176, 70, 52, f'fill="{B["shade"]}"')
    body += ell(92, 82, 34, 18, 'fill="#FFFFFF" opacity=".3" transform="rotate(-20 92 82)"')
    body += '</g>' + path(hd, stroke(B['line'], LW))
    body += cheeks() + mouth(m) + eyes(e) + brows(br) + goggles() + trunk(t)
    return defs, body


def bim_cockpit(mood, p='b'):
    d1, ears_svg, parts = bim_head(p, mood)
    d2, tor = torso(p)
    d3, face = bim_face(p, parts)
    body = ears_svg + tor + scarf(p) + face + arms(parts[3])
    return d1 + d2 + d3, body


# ---------------------------------------------------------------- full-body Bim (256 × 300, feet (128,288))
def bim_full(pose, p='f'):
    mood = {'wave': 'happy', 'cheer': 'cheer'}[pose]
    d1, ears_svg, parts = bim_head(p, mood)
    d3, face = bim_face(p, parts)
    hs = 0.8
    htr = f'translate(128 {f(118)}) scale({hs}) translate(-128 -122)'
    defs = d1 + d3
    out = ''
    # tail (behind the body, viewer's right)
    out += path('M170,236 Q194,236 196,214', stroke(B['line'], 9) + '') + path('M170,236 Q194,236 196,214', stroke(B['skin'], 4.5))
    out += path('M196,214 l-4,-9 l6,4 l3,-8 l2,10 z', filled(B['shade'], B['line'], 2.6))
    # legs
    for x in (104, 152):
        out += path(f'M{x - 17},236 L{x - 18},280 Q{x},292 {x + 18},280 L{x + 17},236 Z', filled(B['skin'], B['line']))
        out += path(f'M{x + 6},244 L{x + 8},282 Q{x + 14},284 {x + 17},280 L{x + 16},244 Z', f'fill="{B["shade"]}"')
        out += path(f'M{x - 18},280 Q{x},292 {x + 18},280', stroke(B['line'], LW))
        for k in (-1, 0, 1):
            out += ell(x + k * 9, 284 - abs(k) * 1.5, 4.2, 3, f'fill="{B["nail"]}" stroke="{B["line"]}" stroke-width="1.6"')
    # torso (pear)
    td = 'M128,166 C162,166 184,196 184,228 C184,256 160,266 128,266 C96,266 72,256 72,228 C72,196 94,166 128,166 Z'
    cid = p + 'tor'
    defs += f'<clipPath id="{cid}"><path d="{td}"/></clipPath>'
    out += path(td, filled(B['skin'], B['line']))
    out += f'<g clip-path="url(#{cid})">' + ell(176, 250, 46, 52, f'fill="{B["shade"]}"') + \
        ell(128, 236, 30, 26, f'fill="{B["hi"]}" opacity=".55"') + '</g>' + path(td, stroke(B['line'], LW))
    # arms behind the head for cheer drawn after the head; resting arm first
    arm_out = ''
    if pose == 'wave':
        out += arm(86, 192, 80, 236, 8) + hand(80, 238, 13)
        arm_out = arm(172, 190, 214, 132, -12) + hand(216, 128, 14, ang=-30)
        # wave motion lines
        arm_out += path('M232,104 q8,6 6,16', stroke(B['line'], 3) + ' opacity=".55"')
        arm_out += path('M240,96 q12,10 9,26', stroke(B['line'], 3) + ' opacity=".4"')
    else:
        arm_out = arm(88, 190, 40, 112, 14) + hand(38, 108, 14) + arm(168, 190, 216, 112, -14) + hand(218, 108, 14)
    out += scarf(p, 128, 172, 0.82)
    out += f'<g transform="{htr}">' + ears_svg + face + '</g>'
    out += arm_out
    return defs, out


# ---------------------------------------------------------------- rocket (200 × 300)
DOME_C, DOME_R = (100, 76), 68


def rocket_back(p='r'):
    defs = ''
    out = ''
    # legs (behind the body) with gold feet pads; feet bottom y = 296
    for side in (-1, 1):
        hx, fx = 100 + side * 32, 100 + side * 50
        d = f'M{hx},244 Q{f(hx + side * 12)},270 {fx},286'
        out += path(d, stroke(R['tealLn'], 15)) + path(d, stroke(R['teal'], 9))
        out += ell(fx, 289.5, 14, 5.2, filled(R['gold'], R['goldDk'], 3))
        out += ell(fx - 4, 288, 5, 1.6, f'fill="{R["goldHi"]}"')
    # nozzle: exit centre (100,286)
    nd = 'M80,250 L120,250 L128,281 Q129,286 124,286 L76,286 Q71,286 72,281 Z'
    out += path(nd, filled(R['tealDk'], R['tealLn'], 3.6))
    out += path('M84,254 L92,254 L88,282 L79,282 Z', f'fill="{R["teal"]}" opacity=".8"')
    out += path('M73,283 L127,283', stroke(R['goldDk'], 7)) + path('M74,283 L126,283', stroke(R['gold'], 3.6))
    # fins
    for side in (-1, 1):
        def X(x):
            return 100 + side * (x - 100)
        fd = f'M{f(X(30))},192 C{f(X(8))},210 {f(X(2))},242 {f(X(6))},272 Q{f(X(8))},281 {f(X(19))},275 L{f(X(64))},246 Z'
        out += path(fd, filled(R['teal'], R['tealLn']))
        out += path(f'M{f(X(22))},208 C{f(X(14))},224 {f(X(11))},242 {f(X(12))},262', stroke(R['tealHi'], 4) + ' opacity=".8"')
        out += path(f'M{f(X(54))},248 L{f(X(22))},270', stroke(R['tealDk'], 5) + ' opacity=".6"')
    # cockpit interior (sky-tinted dome back, seen through the glass)
    out += circ(DOME_C[0], DOME_C[1], DOME_R - 2, f'fill="{R["inside"]}"')
    out += path(f'M{DOME_C[0] - 66},{DOME_C[1] + 10} A66,66 0 0 0 {DOME_C[0] + 66},{DOME_C[1] + 10} Z', f'fill="{R["insideSh"]}"')
    out += ell(100, 112, 44, 14, f'fill="{R["tealDk"]}" opacity=".35"')  # seat shadow
    # body
    bd = 'M28,120 C12,150 14,206 50,240 C70,258 84,264 100,264 C116,264 130,258 150,240 C186,206 188,150 172,120 Z'
    cid = p + 'body'
    defs += f'<clipPath id="{cid}"><path d="{bd}"/></clipPath>'
    out += path(bd, filled(R['body'], R['line']))
    out += f'<g clip-path="url(#{cid})">'
    out += ell(176, 200, 46, 92, f'fill="{R["shade"]}"')
    out += path('M10,226 Q100,250 190,226 L190,280 L10,280 Z', f'fill="{R["teal"]}"')        # lower teal band
    out += path('M10,226 Q100,250 190,226', stroke(R['tealLn'], 3.4))
    out += path('M10,234 Q100,258 190,234', stroke(R['tealDk'], 5) + ' opacity=".5"')
    out += path('M10,140 Q100,158 190,140 L190,154 Q100,172 10,154 Z', f'fill="{R["teal"]}"')  # nose band
    out += path('M10,140 Q100,158 190,140', stroke(R['tealLn'], 3)) + path('M10,154 Q100,172 190,154', stroke(R['tealLn'], 3))
    out += path('M10,144 Q100,162 190,144', stroke(R['tealHi'], 2.4) + ' opacity=".8"')
    out += ell(46, 190, 9, 34, 'fill="#FFFFFF" opacity=".75"')                                 # soft highlight
    out += '</g>' + path(bd, stroke(R['line'], LW))
    # rivets along the nose band
    for x in (40, 70, 100, 130, 160):
        y = 147 + 9 * (1 - ((x - 100) / 90) ** 2)
        out += circ(x, y, 3, filled(R['gold'], R['goldDk'], 1.4))
    # emblem: gold-ringed porthole with a star
    out += circ(100, 196, 21, filled(R['gold'], R['goldDk'], 3.6))
    out += circ(100, 196, 14.5, filled('#FFFFFF', R['goldDk'], 2.2))
    out += path(rounded_star(100, 197, 10.5, 4.8, 0.2), filled(STAR['base'], STAR['dark'], 2))
    out += path('M88,188 A14,14 0 0 1 96,183', stroke('#FFFFFF', 2.4) + ' opacity=".8"')
    return defs, out


def rocket_front(p='r'):
    defs = ''
    out = ''
    cx, cy = DOME_C
    r = DOME_R
    gid = p + 'glass'
    defs += (f'<radialGradient id="{gid}" cx="{f(cx - 12)}" cy="{f(cy - 14)}" r="{f(r + 8)}" gradientUnits="userSpaceOnUse">'
             f'<stop offset="0" stop-color="{R["glass"]}" stop-opacity=".04"/>'
             f'<stop offset=".7" stop-color="{R["glass"]}" stop-opacity=".16"/>'
             f'<stop offset="1" stop-color="{R["glass"]}" stop-opacity=".55"/></radialGradient>')
    out += circ(cx, cy, r, f'fill="url(#{gid})"')
    out += circ(cx, cy, r, stroke(R['glassLn'], 3.4))
    # glare
    def arcpath(rad, a0, a1):
        p0 = (cx + rad * math.cos(math.radians(a0)), cy + rad * math.sin(math.radians(a0)))
        p1 = (cx + rad * math.cos(math.radians(a1)), cy + rad * math.sin(math.radians(a1)))
        return f'M{f(p0[0])},{f(p0[1])} A{f(rad)},{f(rad)} 0 0 1 {f(p1[0])},{f(p1[1])}'
    out += path(arcpath(61, 200, 244), stroke('#FFFFFF', 5.5) + ' opacity=".9"')
    out += path(arcpath(61, 252, 260), stroke('#FFFFFF', 5.5) + ' opacity=".9"')
    out += path(arcpath(58, 330, 352), stroke('#FFFFFF', 4) + ' opacity=".5"')
    # nose cap on the dome
    out += path('M82,13 Q84,-0 100,-0 Q116,-0 118,13 Q100,20 82,13 Z', filled(R['teal'], R['tealLn'], 3.4))
    out += path('M88,8 Q92,3 99,3', stroke(R['tealHi'], 2.6))
    # gold rim collar (covers Bim below the neck)
    rd = 'M22,112 Q100,126 178,112 L180,128 Q100,144 20,128 Z'
    out += path(rd, filled(R['gold'], R['goldDk'], 3.8))
    out += path('M26,116 Q100,130 174,116', stroke(R['goldHi'], 3.2))
    out += path('M26,126 Q100,141 174,126', stroke(R['goldDk'], 2.4) + ' opacity=".55"')
    for x in (34, 56, 78, 100, 122, 144, 166):
        t = (x - 20) / 160
        y = (1 - t) ** 2 * 120 + 2 * (1 - t) * t * 135 + t * t * 120
        out += circ(x, y, 2.8, filled(R['goldHi'], R['goldDk'], 1.4))
    return defs, out


# ---------------------------------------------------------------- wagon (160 × 110, hitch (80,18))
def cloud_puffs(circles, p, fill, shade, line, lw=3.6, shade_off=(6, 9)):
    cid = p
    clip = ''.join(circ(*c) for c in circles)
    defs = f'<clipPath id="{cid}">{clip}</clipPath>'
    out = ''.join(circ(c[0], c[1], c[2] + lw / 2, f'fill="{line}"') for c in circles)
    out += ''.join(circ(*c, f'fill="{fill}"') for c in circles)
    out += f'<g clip-path="url(#{cid})">' + ''.join(
        circ(c[0] + shade_off[0], c[1] + shade_off[1], c[2], f'fill="{shade}"') for c in circles if c[1] > 60) + \
        ''.join(circ(*c, f'fill="{fill}"') for c in circles if c[1] <= 60) + '</g>'
    return defs, out


def wagon_back():
    out = ''
    d = 'M28,58 Q80,-20 132,58'
    out += path(d, stroke(R['tealLn'], 11)) + path(d, stroke(R['teal'], 6)) + path('M36,48 Q60,16 74,15', stroke(R['tealHi'], 2.2))
    out += circ(80, 18, 7, stroke(R['goldDk'], 6.4)) + circ(80, 18, 7, stroke(R['gold'], 3.4))
    out += ell(80, 58, 62, 14, filled('#C9D0EC', CLOUD['line'], 3.4))
    out += ell(80, 62, 52, 8, 'fill="#B5BEE0"')
    return '', out


def wagon_front(p='w'):
    circles = [(30, 70, 20), (56, 78, 24), (84, 80, 25), (110, 76, 23), (132, 68, 19), (44, 92, 14), (78, 96, 13),
               (112, 92, 13), (18, 62, 10), (142, 60, 10)]
    defs, out = cloud_puffs(circles, p + 'cl', CLOUD['fill'], CLOUD['shade'], CLOUD['line'])
    rim = 'M16,58 Q80,84 144,58'
    out += path(rim, stroke(R['tealLn'], 13)) + path(rim, stroke(R['teal'], 8)) + path('M22,60 Q80,82 138,60', stroke(R['tealHi'], 2.2))
    for x in (32, 56, 80, 104, 128):
        t = (x - 16) / 128
        y = (1 - t) ** 2 * 58 + 2 * (1 - t) * t * 84 + t * t * 58
        out += circ(x, y + 0.5, 2.4, filled(R['gold'], R['goldDk'], 1.2))
    out += ell(40, 76, 9, 5, 'fill="#FFFFFF" opacity=".9"')
    return defs, out


# ---------------------------------------------------------------- stars (64 × 64)
def star_full():
    d = rounded_star(32, 34, 29, 13.5, 0.22)
    out = path(d, filled(STAR['base'], STAR['dark'], 3.6))
    out += path(rounded_star(35, 37, 20, 9, 0.25), f'fill="{STAR["sh"]}" opacity=".55"')
    out += path(rounded_star(31, 33, 18, 8.4, 0.25), f'fill="{STAR["base"]}"')
    out += path('M21,24 Q24,18 29,16', stroke(STAR['hi'], 3.6))
    out += circ(19, 30, 2, f'fill="{STAR["hi"]}"')
    return out


def star_empty():
    d = rounded_star(32, 34, 28, 13, 0.22)
    return path(d, 'fill="#FFFFFF" fill-opacity=".45" stroke="#9EA5BA" stroke-width="4" stroke-linejoin="round"')


# ---------------------------------------------------------------- icon (512 × 512)
def icon():
    defs = ('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#8FD0F5"/><stop offset=".62" stop-color="#C6E8FA"/>'
            '<stop offset="1" stop-color="#FFE3C9"/></linearGradient>')
    out = '<rect width="512" height="512" fill="url(#isky)"/>'
    # rainbow arc
    bands = ['#F28A8A', '#F8B86A', '#F8DE74', '#92D69A', '#86BDEE', '#B49AE6']
    for i, c in enumerate(bands):
        rad = 238 - i * 17
        out += path(f'M{f(256 - rad)},420 A{rad},{rad} 0 0 1 {f(256 + rad)},420', stroke(c, 18) + ' opacity=".85"')
    # sparkles
    for (x, y, s) in ((70, 84, 14), (440, 110, 11), (416, 250, 9), (92, 236, 9)):
        out += path(f'M{x},{y - s} Q{x + s * .18},{y - s * .18} {x + s},{y} Q{x + s * .18},{y + s * .18} {x},{y + s} '
                    f'Q{x - s * .18},{y + s * .18} {x - s},{y} Q{x - s * .18},{y - s * .18} {x},{y - s} Z', 'fill="#FFFFFF"')
    # back clouds
    d1, c1 = cloud_puffs([(40, 452, 60), (120, 470, 54), (412, 470, 56), (480, 446, 60), (300, 500, 60), (200, 504, 56)],
                         'icl1', '#FFFFFF', '#DCE2F6', '#9AA6D1', 4)
    defs += d1
    out += c1
    # rocket + Bim (rocket 200×300 scaled 1.38, slightly tilted)
    sc = 1.75
    rb_d, rb = rocket_back('ir')
    bm_d, bm = bim_cockpit('talk', 'ib')
    rf_d, rf = rocket_front('ir')
    defs += rb_d + bm_d + rf_d
    flame = (path('M100,280 Q122,300 112,330 Q100,356 88,330 Q78,300 100,280 Z', 'fill="#FF9A3C"') +
             path('M100,282 Q114,300 108,322 Q100,338 92,322 Q86,300 100,282 Z', 'fill="#FFD45A"') +
             path('M100,284 Q107,298 104,312 Q100,320 96,312 Q93,298 100,284 Z', 'fill="#FFF6D0"'))
    bim_tr = 'translate(100 118) scale(.55) translate(-128 -236)'
    out += (f'<g transform="translate(262 300) rotate(7) scale({sc}) translate(-100 -150)">' + flame + rb +
            f'<g transform="{bim_tr}">{bm}</g>' + rf + '</g>')
    # front clouds
    d2, c2 = cloud_puffs([(-6, 500, 50), (70, 512, 46), (440, 516, 48), (520, 494, 50), (256, 540, 60)],
                         'icl2', '#FFFFFF', '#DCE2F6', '#9AA6D1', 4)
    defs += d2
    out += c2
    return defs, out


def main():
    for mood in MOODS:
        d, b = bim_cockpit(mood)
        write(f'characters/bim_{mood}.svg', svg(256, 256, b, d))
    for pose in ('wave', 'cheer'):
        d, b = bim_full(pose)
        write(f'characters/bim_full_{pose}.svg', svg(256, 300, b, d))
    d, b = rocket_back()
    write('characters/rocket_back.svg', svg(200, 300, b, d))
    d, b = rocket_front()
    write('characters/rocket_front.svg', svg(200, 300, b, d))
    d, b = wagon_back()
    write('items/wagon_back.svg', svg(160, 110, b, d))
    d, b = wagon_front()
    write('items/wagon_front.svg', svg(160, 110, b, d))
    write('ui/star.svg', svg(64, 64, star_full()))
    write('ui/star_empty.svg', svg(64, 64, star_empty()))
    d, b = icon()
    write('icon.svg', svg(512, 512, b, d))
    print('wrote Bim / rocket / wagon / stars / icon to', OUT)


if __name__ == '__main__':
    main()
