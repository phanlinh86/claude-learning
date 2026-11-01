#!/usr/bin/env python3
"""Character / core-item art generator for Kitten's Balloon Farm (character artist A).

Writes (relative to game/assets/default/):
  characters/miu_{idle,blink,talk,happy,cheer,think,oops}.svg
        0 0 256 256, feet anchor (128,244), drawn height ~240 (ear tips y ~8 to feet y 244).
        Miu the cream kitten: straw hat with a mint band, mint neckerchief, caramel patches, ¾ view facing
        RIGHT and slightly UP. Every frame shares the same body / kerchief / feet / head geometry; only eyes,
        mouth, brows, arms, ears (oops), tail (cheer), a small hop (happy/cheer) or a head tilt (think) change.
  items/sign.svg     0 0 128 112, blank board x 12-116 / y 8-76 (#FFF8EA), post bottom (64,112)
  ui/star.svg, ui/star_empty.svg                0 0 64 64
  icon.svg           0 0 512 512, full bleed, opaque

Usage: python3 tools/art_miu.py [outDir]
Rules (docs/DESIGN.md section 3): 100% original art, flat cartoon, ~4 px outline in a darker tone of the
fill, one-step cel shading lower/right + one soft highlight upper-left, no <text>/fonts/scripts/external
refs, no filters at all. width/height = viewBox. Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md section 3)
M = {
    'fur': '#FFF6E8', 'shade': '#EADBC4', 'belly': '#FFFCF6', 'line': '#8A6650',
    'patch': '#D2A274', 'patchSh': '#BE8E62',
    'iris': '#5B8C3A', 'irisDk': '#3E6B26', 'irisLt': '#8DBA62', 'pupil': '#2F2622', 'white': '#FFFFFF',
    'nose': '#F4A6B4', 'noseDk': '#C9707F', 'inner': '#F4A6B4', 'cheek': '#F7B6C2',
    'mouth': '#7E3A4C', 'tongue': '#F59AAE',
    'hat': '#EBD08C', 'hatSh': '#C9AA62', 'hatLine': '#9C7E3E', 'hatHi': '#F7E6B4',
    'mint': '#5FD3B4', 'mintDk': '#2E8C78', 'mintHi': '#A8EEDB',
    'starEye': '#FFD86B',
}
WOOD = {'fill': '#E2C597', 'line': '#9A774C', 'shade': '#C9A774', 'hi': '#F0DDBA', 'dark': '#B08C5C', 'blank': '#FFF8EA'}
PAL = {'red': ('#E84A4A', '#A8282E'), 'blue': ('#3C8DE8', '#1F5BA8'), 'yellow': ('#FFD23F', '#C99A12'),
       'green': ('#4CC26B', '#2A8343')}
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


def smooth(pts, close=True):
    """Catmull-Rom through the points -> cubic bezier path."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if (close or i > 0) else pts[i]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (close or i + 2 < n) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if close else '')


def star_path(cx, cy, ro, ri, rot=-90):
    pts = []
    for i in range(10):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return poly(pts)


def rounded_star(cx, cy, ro, ri, rr=0.18, rot=-90):
    """Star with rounded tips: each tip is a quadratic through the outer point."""
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


def bez(p0, p1, p2, p3, n=24):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return out


# ======================================================================= MIU
HEAD_C = (128, 104)
HEAD_AB = (82, 64)              # x 46-210, y 40-168 (+ cheek tufts)
NECK = (128, 166)               # head tilt pivot (think)
EYE_N = (110, 104, 17.5, 21.5)  # near eye (viewer's left) - ¾ view facing right
EYE_F = (169, 100, 14.5, 19)    # far eye, a bit smaller
NOSE = (148, 124)
CHEEKS = ((84, 132, 12, 7.5), (192, 126, 8.5, 6))
BODY = (124, 200, 50, 42)       # x 74-174, y 158-242
FOOT_N = (102, 236, 18, 8)      # bottom y 244 = anchor
FOOT_F = (150, 235, 15.5, 7.5)
SH_N = (82, 180)
SH_F = (166, 178)
ARM_W = 19


def head_pts():
    """Chubby superellipse head with two fluffy cheek tufts on each side."""
    cx, cy = HEAD_C
    a, b = HEAD_AB
    pts = []
    tufts = ((152, 0.075), (164, 0.06), (24, 0.06), (13, 0.05))
    for i in range(240):
        th = i * 1.5
        c, s = math.cos(math.radians(th)), math.sin(math.radians(th))
        n = 2.35
        x = math.copysign(abs(c) ** (2 / n), c)
        y = math.copysign(abs(s) ** (2 / n), s)
        k = 1.0
        for t0, amp in tufts:
            dd = abs(th - t0)
            if dd < 6:
                k += amp * (1 - dd / 6)
        # cheeks slightly wider than the crown (cat face), chin a little flatter
        wide = 1 + 0.05 * max(0, s)
        pts.append((cx + a * x * k * wide, cy + b * y * k * (0.96 if s > 0 else 1)))
    return pts


HEAD_D = poly(head_pts())

EAR_N = ((52, 84), (60, 12), (112, 46))   # base-left, tip, base-right
EAR_F = ((150, 42), (206, 8), (208, 84))


def ear(e, fill, rot=0, uid='e', patch=False):
    (a, t, b) = e
    pivot = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    # rounded triangle: quadratic around the tip
    def lerp(p, q, s):
        return (p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s)
    s1, s2 = lerp(t, a, 0.16), lerp(t, b, 0.16)
    d = (f'M{f(a[0])},{f(a[1])} Q{f(lerp(a, t, 0.5)[0] - 3)},{f(lerp(a, t, 0.5)[1])} {f(s1[0])},{f(s1[1])} '
         f'Q{f(t[0])},{f(t[1])} {f(s2[0])},{f(s2[1])} Q{f(lerp(t, b, 0.5)[0] + 3)},{f(lerp(t, b, 0.5)[1])} {f(b[0])},{f(b[1])} Z')
    # inner ear: smaller triangle toward the base centre
    ia, it, ib = lerp(a, pivot, 0.42), lerp(t, pivot, 0.3), lerp(b, pivot, 0.42)
    ia = lerp(ia, it, 0.1)
    ib = lerp(ib, it, 0.1)
    i1, i2 = lerp(it, ia, 0.2), lerp(it, ib, 0.2)
    di = (f'M{f(ia[0])},{f(ia[1])} L{f(i1[0])},{f(i1[1])} Q{f(it[0])},{f(it[1])} {f(i2[0])},{f(i2[1])} '
          f'L{f(ib[0])},{f(ib[1])} Z')
    g = f'<g transform="rotate({f(rot)} {f(pivot[0])} {f(pivot[1])})">'
    g += path(d, filled(fill, M['line']))
    g += path(di, f'fill="{M["inner"]}" stroke="{mix(M["inner"], M["line"], 0.35)}" stroke-width="2" stroke-linejoin="round"')
    # fur tuft inside the ear
    g += path(f'M{f(ia[0] + (ib[0] - ia[0]) * 0.35)},{f(ia[1] + (ib[1] - ia[1]) * 0.35 + 2)} '
              f'Q{f(pivot[0] + (it[0] - pivot[0]) * 0.35)},{f(pivot[1] + (it[1] - pivot[1]) * 0.45)} '
              f'{f(pivot[0] + (it[0] - pivot[0]) * 0.55)},{f(pivot[1] + (it[1] - pivot[1]) * 0.6)}',
              stroke(M['fur'], 2.6) + ' opacity="0.9"')
    g += '</g>'
    return g


def eye_open(e, look=(3, -3), wide=1.0, pupil=0.62):
    cx, cy, rx, ry = e
    rx *= wide
    ry *= wide
    g = ell(cx, cy, rx, ry, f'fill="{M["iris"]}" stroke="{M["pupil"]}" stroke-width="3.2"')
    g += ell(cx + look[0] * 0.3, cy + ry * 0.38, rx * 0.72, ry * 0.42, f'fill="{M["irisLt"]}" opacity="0.8"')
    px, py = cx + look[0], cy + look[1]
    prx, pry = rx * pupil, ry * pupil * 0.98
    g += ell(px, py, prx, pry, f'fill="{M["pupil"]}"')
    g += ell(px - prx * 0.32, py - pry * 0.38, prx * 0.5, pry * 0.42, f'fill="{M["white"]}"')
    g += circ(px + prx * 0.5, py + pry * 0.45, prx * 0.2, f'fill="{M["white"]}"')
    return g


def eye_closed(e, kind):
    cx, cy, rx, ry = e
    w = rx * 0.95
    if kind == 'happy':
        d = f'M{f(cx - w)},{f(cy + 5)} Q{f(cx)},{f(cy - 17)} {f(cx + w)},{f(cy + 5)}'
        return path(d, stroke(M['pupil'], 5.4))
    d = f'M{f(cx - w)},{f(cy + 2)} Q{f(cx)},{f(cy - 10)} {f(cx + w)},{f(cy + 2)}'
    return path(d, stroke(M['pupil'], 4.8))


def eye_star(e):
    cx, cy, rx, ry = e
    g = ell(cx, cy, rx, ry, f'fill="{M["pupil"]}" stroke="{M["pupil"]}" stroke-width="3.2"')
    g += ell(cx, cy + ry * 0.45, rx * 0.7, ry * 0.35, f'fill="{M["iris"]}" opacity="0.7"')
    g += path(rounded_star(cx, cy, min(rx, ry) * 0.92, min(rx, ry) * 0.44, 0.2),
              f'fill="{M["starEye"]}" stroke="#E0A818" stroke-width="1.6" stroke-linejoin="round"')
    g += circ(cx + rx * 0.55, cy - ry * 0.6, rx * 0.16, f'fill="{M["white"]}"')
    return g


def brows(up=0, tilt=0):
    g = ''
    for (cx, cy, rx, ry), side in ((EYE_N, -1), (EYE_F, 1)):
        y = cy - ry - 8 - up
        d = f'M{f(cx - 9)},{f(y + 3 + tilt * side)} Q{f(cx)},{f(y - 4)} {f(cx + 9)},{f(y + 3 - tilt * side)}'
        g += path(d, stroke(M['line'], 3.6))
    return g


def nose():
    x, y = NOSE
    d = f'M{f(x - 6.5)},{f(y - 3)} Q{f(x)},{f(y - 6)} {f(x + 6.5)},{f(y - 3)} Q{f(x + 3)},{f(y + 4)} {f(x)},{f(y + 4.5)} Q{f(x - 3)},{f(y + 4)} {f(x - 6.5)},{f(y - 3)} Z'
    return path(d, filled(M['nose'], M['noseDk'], 2)) + ell(x - 2, y - 2.2, 2.2, 1.2, 'fill="#FFFFFF" opacity="0.7"')


def mouth(kind):
    x, y = NOSE
    y += 4.5
    lc = M['line']
    w_ = (f'M{f(x)},{f(y)} L{f(x)},{f(y + 3)} M{f(x)},{f(y + 3)} Q{f(x - 3)},{f(y + 8)} {f(x - 8)},{f(y + 6)} '
          f'M{f(x)},{f(y + 3)} Q{f(x + 3)},{f(y + 8)} {f(x + 8)},{f(y + 6)}')
    if kind == 'smile':
        return path(w_, stroke(lc, 3))
    if kind == 'talk':
        g = path(f'M{f(x - 6)},{f(y + 5)} Q{f(x)},{f(y + 19)} {f(x + 6)},{f(y + 5)} Q{f(x)},{f(y + 7)} {f(x - 6)},{f(y + 5)} Z',
                 filled(M['mouth'], lc, 2.6))
        g += ell(x, y + 12.5, 3.4, 2.2, f'fill="{M["tongue"]}"')
        return path(f'M{f(x)},{f(y)} L{f(x)},{f(y + 4)}', stroke(lc, 3)) + g
    if kind in ('open', 'big'):
        k = 1.0 if kind == 'open' else 1.3
        g = path(f'M{f(x - 10 * k)},{f(y + 4)} Q{f(x)},{f(y + 7)} {f(x + 10 * k)},{f(y + 4)} '
                 f'Q{f(x + 9 * k)},{f(y + 17 * k)} {f(x)},{f(y + 18 * k)} Q{f(x - 9 * k)},{f(y + 17 * k)} {f(x - 10 * k)},{f(y + 4)} Z',
                 filled(M['mouth'], lc, 2.8))
        g += path(f'M{f(x - 5.5 * k)},{f(y + 14 * k)} Q{f(x)},{f(y + 9 * k)} {f(x + 5.5 * k)},{f(y + 14 * k)} '
                  f'Q{f(x)},{f(y + 18 * k)} {f(x - 5.5 * k)},{f(y + 14 * k)} Z', f'fill="{M["tongue"]}"')
        return path(f'M{f(x)},{f(y)} L{f(x)},{f(y + 4)}', stroke(lc, 3)) + g
    if kind == 'o':
        return (path(f'M{f(x)},{f(y)} L{f(x)},{f(y + 3)}', stroke(lc, 3)) +
                ell(x, y + 10, 4.6, 5.4, filled(M['mouth'], lc, 2.6)) + ell(x, y + 12.2, 2.4, 2, f'fill="{M["tongue"]}"'))
    if kind == 'hmm':   # small sideways squiggle (thinking)
        return path(f'M{f(x)},{f(y)} L{f(x)},{f(y + 3)} M{f(x - 7)},{f(y + 8)} Q{f(x - 2)},{f(y + 5)} {f(x + 2)},{f(y + 8)} T{f(x + 9)},{f(y + 7)}',
                    stroke(lc, 3))
    return ''


def whiskers():
    g = ''
    for d in ('M64,124 Q52,119 38,118', 'M64,132 Q50,133 38,138', 'M200,118 Q212,112 226,111', 'M200,127 Q214,126 227,130'):
        g += path(d, stroke(M['line'], 2.4) + ' opacity="0.85"')
    return g


def cheeks(k=1.0):
    return ''.join(ell(x, y, rx * k, ry * k, f'fill="{M["cheek"]}" opacity="0.85"') for x, y, rx, ry in CHEEKS)


def hat(uid):
    """Straw hat sitting between the ears, tilted back a little (Miu looks up-right)."""
    defs = f'<clipPath id="{uid}cr"><path d="M104,46 C101,20 116,8 136,8 C156,8 170,20 166,46 Z"/></clipPath>'
    g = '<g transform="rotate(-7 136 44)">'
    # brim back half (behind the crown)
    g += ell(136, 46, 62, 15, filled(M['hat'], M['hatLine']))
    g += ell(138, 48, 50, 10, f'fill="{M["hatSh"]}" opacity="0.55"')
    # crown
    crown = 'M104,46 C101,20 116,8 136,8 C156,8 170,20 166,46 Z'
    g += path(crown, f'fill="{M["hat"]}"')
    g += f'<g clip-path="url(#{uid}cr)">'
    g += path('M150,4 C166,12 172,30 170,50 L180,50 L180,0 Z', f'fill="{M["hatSh"]}" opacity="0.8"')
    g += rect(96, 32, 80, 12, 0, f'fill="{M["mint"]}"')
    g += rect(96, 40, 80, 4, 0, f'fill="{M["mintDk"]}" opacity="0.45"')
    g += path('M100,33 L176,33', stroke(M['mintHi'], 2) + ' opacity="0.8"')
    for x in (118, 128, 140, 152):   # woven straw dashes
        g += path(f'M{x},14 L{x - 1},28', stroke(M['hatSh'], 2) + ' opacity="0.7"')
    g += '</g>'
    g += path(crown, f'fill="none" stroke="{M["hatLine"]}" stroke-width="{LW}" stroke-linejoin="round"')
    g += path('M106,32 L166,32 M106,44 L166,44', stroke(M['mintDk'], 2.2))
    g += ell(118, 20, 4, 7, f'fill="{M["hatHi"]}" opacity="0.9" transform="rotate(25 118 20)"')
    # little band bow at the near side
    g += path('M108,38 C98,30 90,34 92,40 C94,46 102,44 108,40 Z', filled(M['mint'], M['mintDk'], 2.6))
    g += path('M108,40 C100,46 98,54 104,54 C108,52 109,46 108,40 Z', filled(M['mint'], M['mintDk'], 2.6))
    g += circ(108, 39, 3.6, filled(M['mint'], M['mintDk'], 2.4))
    # brim front lip (over the crown base): lower half of the brim ellipse
    g += path('M74,46 A62,15 0 0 0 198,46 A62,8 0 0 1 74,46 Z', f'fill="{M["hat"]}" stroke="{M["hatLine"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    g += path('M84,51 A56,10 0 0 0 186,52', stroke(M['hatHi'], 2.4) + ' opacity="0.9"')
    g += '</g>'
    return defs, g


def kerchief():
    band = 'M86,160 Q128,176 180,156 L182,168 Q130,190 88,172 Z'
    tri = 'M110,170 Q140,184 172,164 Q162,186 146,204 Q142,209 137,204 Q120,190 110,170 Z'
    g = path(tri, filled(M['mint'], M['mintDk']))
    g += path('M120,178 Q142,186 164,172', stroke(M['mintDk'], 2) + ' opacity="0.5"')
    for x, y in ((132, 186), (152, 182), (142, 197)):
        g += circ(x, y, 2.8, f'fill="{M["mintHi"]}"')
    g += path(band, filled(M['mint'], M['mintDk']))
    g += path('M92,165 Q130,180 176,160', stroke(M['mintHi'], 2.4) + ' opacity="0.9"')
    # knot + two little tails at the near side
    g += path('M86,166 C74,170 70,184 76,190 C82,186 86,178 90,172 Z', filled(M['mint'], M['mintDk'], 3))
    g += path('M88,170 C86,182 90,194 96,196 C98,188 96,178 92,170 Z', filled(M['mint'], M['mintDk'], 3))
    g += ell(88, 167, 7.5, 7, filled(M['mint'], M['mintDk'], 3))
    return g


def tail(kind):
    if kind == 'up':
        pts = bez((84, 216), (52, 206), (38, 168), (52, 140)) + bez((52, 140), (58, 128), (70, 126), (72, 134))[1:]
    else:
        pts = bez((84, 222), (46, 232), (24, 208), (34, 184)) + bez((34, 184), (40, 170), (58, 170), (56, 182))[1:]
    d = smooth(pts[::3] + [pts[-1]], close=False)
    tip = pts[int(len(pts) * 0.68):]
    dt = smooth(tip[::2] + ([tip[-1]] if (len(tip) - 1) % 2 else []), close=False)
    ring = pts[int(len(pts) * 0.38):int(len(pts) * 0.47)]
    dr = smooth(ring, close=False)
    g = path(d, stroke(M['line'], 17 + 2 * LW))
    g += path(d, stroke(M['fur'], 17))
    g += path(dr, f'fill="none" stroke="{M["patch"]}" stroke-width="17"')
    g += path(dt, stroke(M['patch'], 17))
    return g


def arm(pts, uid, front=True):
    """Thick rounded arm along a polyline, ending in a round paw."""
    d = poly(pts, close=False)
    g = path(d, stroke(M['line'], ARM_W + 2 * LW))
    g += path(d, stroke(M['fur'], ARM_W))
    px, py = pts[-1]
    g += circ(px, py, 12, filled(M['fur'], M['line']))
    # toe beans hint: two short creases pointing along the arm direction
    ax, ay = pts[-2]
    dx, dy = px - ax, py - ay
    ln = math.hypot(dx, dy) or 1
    ux, uy = dx / ln, dy / ln
    nx, ny = -uy, ux
    for s in (-1, 1):
        x0, y0 = px + ux * 5 + nx * s * 4, py + uy * 5 + ny * s * 4
        g += path(f'M{f(x0)},{f(y0)} L{f(x0 + ux * 5)},{f(y0 + uy * 5)}', stroke(M['line'], 2) + ' opacity="0.8"')
    return g


ARMS = {
    'rest':  ([SH_N, (90, 196), (104, 202)], [SH_F, (164, 194), (152, 200)]),
    'happy': ([SH_N, (62, 164), (54, 138)], [SH_F, (192, 166), (206, 142)]),
    'cheer': ([SH_N, (56, 160), (42, 124)], [SH_F, (194, 158), (212, 120)]),
    'think': ([SH_N, (104, 204), (136, 172)], [SH_F, (164, 194), (152, 200)]),
    'oops':  ([SH_N, (62, 192), (50, 184)], [SH_F, (190, 190), (204, 180)]),
}


def body_block(uid):
    bx, by, ba, bb = BODY
    defs = f'<clipPath id="{uid}bd">{ell(bx, by, ba, bb)}</clipPath>'
    g = ell(bx, by, ba, bb, f'fill="{M["fur"]}"')
    g += f'<g clip-path="url(#{uid}bd)">'
    g += ell(bx + 10, by + 10, ba, bb, f'fill="{M["shade"]}"')
    g += ell(bx - 4, by - 6, ba - 4, bb - 4, f'fill="{M["fur"]}"')
    g += ell(bx + 10, by + 10, 27, 24, f'fill="{M["belly"]}"')
    g += ell(bx - 46, by - 4, 26, 30, f'fill="{M["patch"]}"')     # back patch
    g += '</g>'
    g += ell(bx, by, ba, bb, f'fill="none" stroke="{M["line"]}" stroke-width="{LW}"')
    return defs, g


def feet():
    g = ''
    for (x, y, rx, ry) in (FOOT_F, FOOT_N):
        g += ell(x, y, rx, ry, filled(M['fur'], M['line']))
        for k in (-1, 1):
            g += path(f'M{f(x + k * rx * 0.3)},{f(y - ry * 0.2)} L{f(x + k * rx * 0.3)},{f(y + ry * 0.55)}', stroke(M['line'], 2) + ' opacity="0.7"')
    return g


def head_block(uid, pose):
    """Ears + head + face + hat (the group that tilts in 'think')."""
    defs = f'<clipPath id="{uid}hd"><path d="{HEAD_D}"/></clipPath>'
    er = pose.get('ears', 0)
    g = ear(EAR_F, M['fur'], er, uid)
    g += ear(EAR_N, M['patch'], -er, uid)
    g += path(HEAD_D, f'fill="{M["fur"]}"')
    g += f'<g clip-path="url(#{uid}hd)">'
    cx, cy = HEAD_C
    a, b = HEAD_AB
    g += ell(cx + 12, cy + 12, a + 6, b + 6, f'fill="{M["shade"]}"')
    g += ell(cx - 4, cy - 6, a - 2, b - 3, f'fill="{M["fur"]}"')
    # caramel patch over the near ear / forehead, a small one at the far crown
    g += path('M30,30 C70,26 104,40 100,66 C96,84 74,86 58,96 C46,104 34,104 28,96 Z', f'fill="{M["patch"]}"')
    g += path('M172,30 C190,34 206,46 212,64 C200,66 184,58 176,46 Z', f'fill="{M["patch"]}"')
    # forehead stripes (tabby hint) in the patch colour
    for d in ('M128,46 L130,58', 'M140,45 L140,56', 'M116,48 L120,58'):
        g += path(d, stroke(M['patch'], 4.2))
    # muzzle: soft lighter pad around nose and mouth
    g += ell(NOSE[0] - 1, NOSE[1] + 8, 22, 14, f'fill="{M["belly"]}"')
    g += '</g>'
    g += path(HEAD_D, f'fill="none" stroke="{M["line"]}" stroke-width="{LW}" stroke-linejoin="round"')
    g += ell(82, 76, 9, 5, f'fill="#FFFFFF" opacity="0.35" transform="rotate(-35 82 76)"')
    g += cheeks(pose.get('cheek', 1.0))
    g += whiskers()
    g += pose['face']
    hd, hg = hat(uid)
    defs += hd
    g += hg
    return defs, g


def miu_parts(pose, uid):
    defs, g = '', ''
    hop = pose.get('hop', 0)
    g += f'<g transform="translate(0,{f(-hop)})">'
    g += tail(pose.get('tail', 'curl'))
    an, af = ARMS[pose.get('arms', 'rest')]
    raised = pose.get('arms') in ('happy', 'cheer', 'oops')
    if raised:
        g += arm(af, uid)
    bd, bg = body_block(uid)
    defs += bd
    g += bg
    g += feet()
    g += kerchief()
    hd, hg = head_block(uid, pose)
    defs += hd
    tilt = pose.get('tilt', 0)
    if tilt:
        g += f'<g transform="rotate({f(tilt)} {f(NECK[0])} {f(NECK[1])})">{hg}</g>'
    else:
        g += hg
    if not raised:
        g += arm(af, uid)
    g += arm(an, uid)
    g += '</g>'
    return defs, g


def face(eyes, m, extra=''):
    return eyes + nose() + mouth(m) + extra


POSES = {
    'idle':  dict(face=face(eye_open(EYE_N) + eye_open(EYE_F), 'smile')),
    'blink': dict(face=face(eye_closed(EYE_N, 'blink') + eye_closed(EYE_F, 'blink'), 'smile')),
    'talk':  dict(face=face(eye_open(EYE_N) + eye_open(EYE_F), 'talk')),
    'happy': dict(face=face(eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy'), 'open'),
                  arms='happy', hop=6, cheek=1.2),
    'cheer': dict(face=face(eye_star(EYE_N) + eye_star(EYE_F), 'big'), arms='cheer', hop=8, tail='up', cheek=1.25),
    'think': dict(face=face(eye_open(EYE_N, (5, -7)) + eye_open(EYE_F, (5, -7)), 'hmm', brows(0, 3)),
                  arms='think', tilt=-8),
    'oops':  dict(face=face(eye_open(EYE_N, (2, -1), 1.04, 0.5) + eye_open(EYE_F, (2, -1), 1.04, 0.5), 'o', brows(6, -2)),
                  arms='oops', ears=16),
}


def gen_miu():
    for name, pose in POSES.items():
        defs, g = miu_parts(pose, 'm' + name[:2])
        write(f'characters/miu_{name}.svg', svg(256, 256, g, defs))


# ======================================================================= SIGN
def gen_sign():
    defs = '<clipPath id="sgf"><rect x="3" y="2" width="122" height="80" rx="9"/></clipPath>'
    # post
    g = rect(55, 74, 18, 40, 3, filled(WOOD['fill'], WOOD['line'], 3.4))
    g += rect(64, 78, 8, 33, 0, f'fill="{WOOD["shade"]}"')
    g += path('M60,88 L60,104', stroke(WOOD['dark'], 1.6) + ' opacity="0.6"')
    # board frame
    g += rect(3, 2, 122, 80, 9, f'fill="{WOOD["fill"]}"')
    g += '<g clip-path="url(#sgf)">'
    g += rect(3, 76, 122, 8, 0, f'fill="{WOOD["shade"]}"') + rect(118, 2, 8, 82, 0, f'fill="{WOOD["shade"]}" opacity="0.8"')
    g += path('M6,5 L122,5', stroke(WOOD['hi'], 2.4))
    g += '</g>'
    g += rect(3, 2, 122, 80, 9, f'fill="none" stroke="{WOOD["line"]}" stroke-width="{LW}"')
    # blank area (exactly x 12-116, y 8-76)
    g += rect(12, 8, 104, 68, 6, f'fill="{WOOD["blank"]}" stroke="{WOOD["dark"]}" stroke-width="2"')
    g += rect(12, 8, 104, 5, 3, f'fill="{WOOD["shade"]}" opacity="0.25"')
    # nails in the frame corners
    for x, y in ((7.5, 6.5), (120.5, 6.5), (7.5, 78), (120.5, 78)):
        g += circ(x, y, 1.9, f'fill="{WOOD["line"]}"')
    # grass tuft at the post foot
    g += path('M48,112 Q52,102 55,112 Q58,100 62,112 M66,112 Q70,101 73,112 Q77,104 80,112',
              f'fill="#9CCB7C" stroke="#6E9E54" stroke-width="2" stroke-linejoin="round"')
    write('items/sign.svg', svg(128, 112, g, defs))


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
def svg_balloon(cx, cy, w, key, uid):
    base, dark = PAL[key]
    h = w * 1.19
    s = w
    d = (f'M{f(cx)},{f(cy - 0.6 * s)} C{f(cx + 0.28 * s)},{f(cy - 0.6 * s)} {f(cx + 0.5 * s)},{f(cy - 0.38 * s)} {f(cx + 0.5 * s)},{f(cy - 0.1 * s)} '
         f'C{f(cx + 0.5 * s)},{f(cy + 0.2 * s)} {f(cx + 0.26 * s)},{f(cy + 0.5 * s)} {f(cx + 0.04 * s)},{f(cy + 0.58 * s)} '
         f'Q{f(cx)},{f(cy + 0.595 * s)} {f(cx - 0.04 * s)},{f(cy + 0.58 * s)} '
         f'C{f(cx - 0.26 * s)},{f(cy + 0.5 * s)} {f(cx - 0.5 * s)},{f(cy + 0.2 * s)} {f(cx - 0.5 * s)},{f(cy - 0.1 * s)} '
         f'C{f(cx - 0.5 * s)},{f(cy - 0.38 * s)} {f(cx - 0.28 * s)},{f(cy - 0.6 * s)} {f(cx)},{f(cy - 0.6 * s)} Z')
    defs = (f'<radialGradient id="{uid}" cx="0.36" cy="0.3" r="0.75">'
            f'<stop offset="0" stop-color="{mix(base, "#FFFFFF", 0.3)}"/><stop offset="0.35" stop-color="{base}"/>'
            f'<stop offset="0.8" stop-color="{base}"/><stop offset="1" stop-color="{mix(base, dark, 0.6)}"/></radialGradient>')
    g = path(d, f'fill="url(#{uid})" stroke="{dark}" stroke-width="7" stroke-linejoin="round"')
    g += ell(cx - 0.2 * s, cy - 0.3 * s, 0.11 * s, 0.065 * s, f'fill="#FFFFFF" opacity="0.7" transform="rotate(-40 {f(cx - 0.2 * s)} {f(cy - 0.3 * s)})"')
    g += circ(cx - 0.31 * s, cy - 0.14 * s, 0.03 * s, 'fill="#FFFFFF" opacity="0.6"')
    ky = cy + 0.59 * s
    g += path(f'M{f(cx - 0.07 * s)},{f(ky + 0.08 * s)} Q{f(cx)},{f(ky - 0.02 * s)} {f(cx + 0.07 * s)},{f(ky + 0.08 * s)} Q{f(cx)},{f(ky + 0.1 * s)} {f(cx - 0.07 * s)},{f(ky + 0.08 * s)} Z',
              filled(mix(base, dark, 0.4), dark, 4))
    return defs, g, (cx, ky + 0.08 * s)


def gen_icon():
    defs = ('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#7CC6F2"/><stop offset="0.75" stop-color="#CDEBFB"/>'
            '<stop offset="1" stop-color="#EAF7FF"/></linearGradient>')
    g = '<rect width="512" height="512" fill="url(#isky)"/>'
    # sun (no face) top-left
    g += circ(70, 72, 70, 'fill="#FFE9A0" opacity="0.5"')
    g += circ(70, 72, 46, 'fill="#FFDB5C" stroke="#F0B429" stroke-width="5"')
    # cloud
    g += path('M236,74 a22,22 0 0 1 40,-12 a26,26 0 0 1 46,10 a18,18 0 0 1 4,36 L240,108 a18,18 0 0 1 -4,-34 Z',
              'fill="#FFFFFF" opacity="0.95"')
    # hills
    g += path('M0,392 C110,346 210,350 300,382 C380,350 450,344 512,360 L512,512 L0,512 Z', 'fill="#A8CF8E"')
    g += path('M0,446 C150,412 340,416 512,438 L512,512 L0,512 Z', 'fill="#9CCB7C"')
    # balloons (strings first)
    bals = [(408, 92, 104, 'blue'), (302, 128, 112, 'red'), (452, 226, 96, 'yellow')]
    knots, bg = [], ''
    for i, (x, y, w, k) in enumerate(bals):
        d2, g2, kn = svg_balloon(x, y, w, k, f'ib{i}')
        defs += d2
        bg += g2
        knots.append(kn)
    hand = (366, 452)
    for kx, ky in knots:
        g += path(f'M{f(kx)},{f(ky)} Q{f((kx + hand[0]) / 2 + 14)},{f((ky + hand[1]) / 2)} {hand[0]},{hand[1]}',
                  stroke('#6B5A50', 4))
    g += circ(hand[0], hand[1], 7, filled('#5FD3B4', '#2E8C78', 3))
    g += bg
    # Miu (idle body, happy eyes, paws up) big, body off the bottom edge
    pose = dict(face=face(eye_open(EYE_N, (4, -4)) + eye_open(EYE_F, (4, -4)), 'open'), cheek=1.1)
    mdefs, mg = miu_parts(pose, 'ic')
    defs += mdefs
    g += f'<g transform="translate(-36,170) scale(1.66)">{mg}</g>'
    # sparkles
    for x, y, s in ((210, 56, 13), (488, 30, 9), (360, 230, 8)):
        g += path(rounded_star(x, y, s, s * 0.42, 0.15), 'fill="#FFF3B0" stroke="#E0A818" stroke-width="2" stroke-linejoin="round"')
    write('icon.svg', svg(512, 512, g, defs))


if __name__ == '__main__':
    gen_miu()
    gen_sign()
    gen_stars()
    gen_icon()
    print('wrote art to', OUT)
