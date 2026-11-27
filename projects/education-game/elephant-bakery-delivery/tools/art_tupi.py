#!/usr/bin/env python3
"""Character art generator for Tupi's Bakery Delivery (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/tupi_{idle,blink,talk,happy,cheer,think,oops,honk,spray,wave,giggle,hand}.svg   0 0 300 300
        Tupi SEATED (she rides in the cart; the cart front hides her lower body), 3/4 view facing RIGHT, eyes on the
        child. SEAT ANCHOR (150, 250) = the bottom of her bottom. The torso is identical in every frame; the head may tilt
        (think / oops), only face, trunk and arms change.
  characters/tupi_title.svg      0 0 300 360   standing, waving, cupcake on a plate held by the trunk; feet (150, 350)
  characters/cart_back.svg, cart_front.svg  0 0 340 240  facing RIGHT, ground anchor (170, 232), wheels not drawn
  characters/wheel.svg           0 0 80 80     centre (40, 40)
  characters/mouse.svg, mouse_wave.svg       0 0 140 120   mouse in a flour sack, feet anchor (70, 114)
  characters/bird.svg, bird_sing.svg         0 0 120 100   round peach bird, feet anchor (60, 94)
  icon.svg                       0 0 512 512   Tupi in her cart on an icing road + a gingerbread house, full bleed
Also writes game/js/tupi_points.js (BD.TUPI_POINTS).

Tupi is drawn at the SAME scale as the cart: 1 Tupi unit = 1 cart unit. Place Tupi's seat anchor (150, 250) on
cart.seat (200, 168), i.e. translate Tupi by (+50, -82) in cart coordinates.

Usage: python3 tools/art_tupi.py   then   node tools/tupi_sheet.js
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone (never black), one-step cel
shade (lower right) + one soft highlight (upper left); no <text>/fonts/scripts/external refs, no filters.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
JS_OUT = os.path.join(ROOT, 'game', 'js', 'tupi_points.js')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # DESIGN.md section 3 (exact hex) — never an answer colour
    'skin': '#B7B2B8', 'skinSh': '#9893A0', 'skinLine': '#6B6574', 'skinHi': '#CBC7CD',
    'pink': '#F4B4B6', 'pinkSh': '#E39A9E',
    'eye': '#2E2836', 'white': '#FFFFFF',
    'hat': '#FFFDF6', 'hatSh': '#EDE6D8', 'hatLine': '#BDB3A3',
    'apron': '#F3E4C8', 'apronSh': '#E2CFAE', 'apronLine': '#B89A70', 'trim': '#C98E4E',
    'mouth': '#6E3A48', 'tongue': '#F08E9A',
    # cart
    'wood': '#D29A5F', 'woodSh': '#A8703C', 'woodLine': '#7A4C27', 'woodIn': '#B98048',
    'cream': '#FFF4E2', 'creamSh': '#F0DFC4',
    'wheel': '#7A5A44', 'wheelSh': '#634633', 'wheelLine': '#4A3324', 'hub': '#F3E4C8',
    'copper': '#C98E4E', 'copperLine': '#8E5E2E',
    # surprises
    'mouse': '#C9A887', 'mouseSh': '#B08E6E', 'mouseLine': '#7E6248', 'sack': '#EADBC0', 'sackSh': '#D6C3A2',
    'sackLine': '#9C8462', 'flour': '#FFFDF8', 'nose': '#8A5A5E',
    'bird': '#F2B28A', 'birdSh': '#DE9670', 'birdLine': '#A8664A', 'belly': '#FBE3CF', 'beak': '#D98C5F',
    'beakLine': '#9A5A36', 'leg': '#B8806A',
    # cupcake (title + icon; neutral, never an answer colour)
    'frost': '#F8D5DA', 'frostSh': '#EDB9C1', 'frostLine': '#C48A94', 'cup': '#D29A5F', 'cupLine': '#7A4C27',
    'cherry': '#C9485A', 'plate': '#FFFFFF', 'plateLine': '#BDB3A3',
}

SEAT = (150, 250)
CART_SEAT = (200, 168)
TUPI_OFF = (CART_SEAT[0] - SEAT[0], CART_SEAT[1] - SEAT[1])     # (+50, -82)
GROUND = (170, 232)
WHEELS = [(92, 194, 38), (262, 194, 38)]                         # centre x, y, radius in cart coords (bottom y 232)
TRAY = (86, 138)                                                 # bottom-centre of the cargo (tray floor)

HEAD = (160, 120, 68, 63)          # head ellipse cx, cy, rx, ry
TORSO = (148, 212, 60, 38)         # torso ellipse (bottom = 250 = seat)
NECK = (162, 186)                  # head tilt pivot
EYE_N = (184, 110, 11, 14)
EYE_F = (222, 103, 9, 12.5)
MOUTH = (196, 162)
TRUNK_BASE = [(205, 128), (214, 136)]
SH_N = (198, 192)                  # near shoulder
SH_F = (118, 190)                  # far shoulder (behind the body)
GRIP = (246, 184)                  # near hand on the handlebar (= cart (296, 102))

# trunk centrelines (start inside the head); width base -> tip
TRUNKS = {
    'idle':  [(200, 128), (218, 138), (236, 148), (249, 160), (258, 172), (268, 172), (272, 162)],
    'up':    [(200, 128), (220, 136), (238, 136), (252, 126), (258, 112), (252, 102)],
    'think': [(200, 128), (218, 140), (226, 156), (220, 170), (206, 174), (198, 166)],
    'honk':  [(200, 132), (222, 128), (238, 110), (246, 86), (250, 62), (252, 40)],
    'spray': [(200, 130), (224, 130), (246, 120), (262, 100), (271, 78), (274, 58)],
    'hand':  [(200, 130), (222, 142), (242, 155), (260, 166), (274, 174), (282, 180)],
    'cheer': [(200, 130), (222, 128), (236, 112), (240, 92), (234, 78), (222, 78)],
    'wave':  [(200, 128), (220, 136), (234, 132), (242, 120), (238, 108)],
    'oops':  [(200, 128), (220, 140), (234, 156), (240, 174), (248, 186), (258, 186)],
}
TRUNK_W = (30, 19)


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


def poly_d(pts):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'


def ptsd(pts, close=True):
    """Smooth path through points (Catmull-Rom -> cubic Bezier)."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if close or i > 0 else pts[0]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if close or i + 2 < n else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if close else '')


def ell_d(cx, cy, rx, ry):
    """Ellipse as a clockwise (screen) path, the same winding as tube() so a nonzero union has no holes."""
    return (f'M{f(cx - rx)},{f(cy)} A{f(rx)},{f(ry)} 0 1 1 {f(cx + rx)},{f(cy)} '
            f'A{f(rx)},{f(ry)} 0 1 1 {f(cx - rx)},{f(cy)} Z')


def rrect_d(x0, y0, x1, y1, r):
    return (f'M{f(x0 + r)},{f(y0)} L{f(x1 - r)},{f(y0)} Q{f(x1)},{f(y0)} {f(x1)},{f(y0 + r)} L{f(x1)},{f(y1 - r)} '
            f'Q{f(x1)},{f(y1)} {f(x1 - r)},{f(y1)} L{f(x0 + r)},{f(y1)} Q{f(x0)},{f(y1)} {f(x0)},{f(y1 - r)} '
            f'L{f(x0)},{f(y0 + r)} Q{f(x0)},{f(y0)} {f(x0 + r)},{f(y0)} Z')


def catmull(pts, per=10):
    """Sample an open Catmull-Rom curve through pts."""
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[max(i - 1, 0)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(i + 2, n - 1)]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(pts[-1])
    return out


def area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))


def tube_pts(cl_pts, w0, w1, bulb=1.12):
    """Closed outline of a tapered tube along a Catmull-Rom centreline, round cap at the tip; clockwise."""
    c = catmull(cl_pts)
    L = [0.0]
    for i in range(1, len(c)):
        L.append(L[-1] + math.dist(c[i], c[i - 1]))
    tot = L[-1] or 1
    left, right = [], []
    for i, p in enumerate(c):
        a = c[max(i - 1, 0)]
        b = c[min(i + 1, len(c) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        dl = math.hypot(dx, dy) or 1
        nx, ny = -dy / dl, dx / dl
        t = L[i] / tot
        w = (w0 + (w1 - w0) * t) * (1 + (bulb - 1) * max(0.0, (t - 0.8) / 0.2))
        left.append((p[0] + nx * w / 2, p[1] + ny * w / 2))
        right.append((p[0] - nx * w / 2, p[1] - ny * w / 2))
    # round cap
    tip = c[-1]
    a = c[-2]
    ang0 = math.atan2(left[-1][1] - tip[1], left[-1][0] - tip[0])
    rr = math.dist(left[-1], tip)
    dirx, diry = tip[0] - a[0], tip[1] - a[1]
    cap = []
    # sweep through the forward direction
    fw = math.atan2(diry, dirx)
    s = 1 if math.sin(fw - ang0) > 0 else -1
    for k in range(1, 12):
        th = ang0 + s * math.pi * k / 12
        cap.append((tip[0] + rr * math.cos(th), tip[1] + rr * math.sin(th)))
    pts = left + cap + right[::-1]
    if area(pts) < 0:
        pts = pts[::-1]
    return pts, c


def tube_d(cl_pts, w0, w1, bulb=1.12):
    return poly_d(tube_pts(cl_pts, w0, w1, bulb)[0])


class Doc:
    """Collects <defs> with unique ids (the prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='t'):
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
        """Union-outlined cel-shaded shape: a thick stroke underneath (only the silhouette shows), then the shade
        colour, then the base colour shifted up-left inside a clip (+ highlight / inner details in the clip)."""
        cid = self.clip(f'<path d="{d}"/>')
        o = path(d, f'fill="{line}" stroke="{line}" stroke-width="{f(2 * w)}" stroke-linejoin="round"') if w else ''
        o += path(d, f'fill="{shade}"')
        o += (f'<g clip-path="url(#{cid})"><path d="{d}" fill="{base}" transform="translate({f(dx)},{f(dy)})"/>'
              f'{hi}{inner}</g>')
        return o

    def text(self):
        return ''.join(self.defs)


# ======================================================================= Tupi
def eyes(kind, look=(0, 0)):
    o = ''
    for (cx, cy, rx, ry), near in ((EYE_N, True), (EYE_F, False)):
        if kind == 'open':
            o += ell(cx, cy, rx, ry, f'fill="{P["eye"]}"')
            o += circ(cx - rx * 0.32 + look[0], cy - ry * 0.42 + look[1], rx * 0.42, f'fill="{P["white"]}"')
            o += circ(cx + rx * 0.35 + look[0], cy + ry * 0.35 + look[1], rx * 0.16, f'fill="{P["white"]}"')
        elif kind == 'shut':            # gentle closed arcs (blink)
            o += path(f'M{f(cx - rx)},{f(cy)} Q{f(cx)},{f(cy + ry * 0.8)} {f(cx + rx)},{f(cy)}', st(P['eye'], 4.4))
        elif kind == 'happy':           # ^^
            o += path(f'M{f(cx - rx)},{f(cy + 3)} Q{f(cx)},{f(cy - ry * 1.1)} {f(cx + rx)},{f(cy + 3)}', st(P['eye'], 4.8))
    return o


def brows(kind):
    if kind == 'up':          # curious / "hmm?"
        return (path(f'M174,86 Q184,78 195,83', st(P['skinLine'], 3.6)) +
                path(f'M214,80 Q222,74 230,78', st(P['skinLine'], 3.2)))
    if kind == 'think':
        return (path(f'M173,88 Q184,84 195,88', st(P['skinLine'], 3.6)) +
                path(f'M213,77 Q222,70 231,76', st(P['skinLine'], 3.2)))
    return ''


def mouth(kind):
    x, y = MOUTH
    if kind == 'smile':
        return path(f'M{f(x - 11)},{f(y - 3)} Q{f(x)},{f(y + 8)} {f(x + 10)},{f(y - 4)}', st(P['mouth'], 3.8))
    if kind == 'talk':
        return (ell(x, y + 1, 9, 10, fl(P['mouth'], P['mouth'], 2)) +
                ell(x + 1, y + 6, 5.5, 4, f'fill="{P["tongue"]}"'))
    if kind == 'big':
        d = f'M{f(x - 15)},{f(y - 6)} Q{f(x)},{f(y - 2)} {f(x + 13)},{f(y - 7)} Q{f(x + 10)},{f(y + 14)} {f(x - 1)},{f(y + 14)} Q{f(x - 13)},{f(y + 13)} {f(x - 15)},{f(y - 6)} Z'
        return path(d, fl(P['mouth'], P['mouth'], 2.4)) + ell(x - 1, y + 8, 7, 4.5, f'fill="{P["tongue"]}"')
    if kind == 'o':
        return ell(x, y, 5.5, 6.5, fl(P['mouth'], P['mouth'], 2))
    if kind == 'toot':
        return ell(x - 2, y, 7, 8, fl(P['mouth'], P['mouth'], 2)) + ell(x - 1, y + 4, 4, 3, f'fill="{P["tongue"]}"')
    if kind == 'wavy':
        return path(f'M{f(x - 9)},{f(y)} Q{f(x - 4)},{f(y - 4)} {f(x)},{f(y)} Q{f(x + 4)},{f(y + 4)} {f(x + 8)},{f(y - 1)}',
                    st(P['mouth'], 3.4))
    return ''


def cheeks(big=False):
    k = 1.2 if big else 1.0
    return (ell(166, 136, 13 * k, 8 * k, f'fill="{P["pink"]}" opacity="0.85"') +
            ell(236, 128, 7 * k, 5 * k, f'fill="{P["pink"]}" opacity="0.8"'))


def trunk_details(key):
    """Wrinkle lines across the trunk + a nostril at the tip."""
    pts, c = tube_pts(TRUNKS[key], *TRUNK_W)
    o = ''
    n = len(c)
    for t in (0.42, 0.56, 0.7):
        i = int(t * (n - 1))
        a, b = c[max(i - 1, 0)], c[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        dl = math.hypot(dx, dy) or 1
        nx, ny = -dy / dl, dx / dl
        w = (TRUNK_W[0] + (TRUNK_W[1] - TRUNK_W[0]) * t) * 0.32
        p = c[i]
        # short curved tick on the shaded side
        o += path(f'M{f(p[0] + nx * w)},{f(p[1] + ny * w)} Q{f(p[0] + nx * w * 1.6 + dx / dl * 3)},{f(p[1] + ny * w * 1.6 + dy / dl * 3)} '
                  f'{f(p[0] + nx * w * 2.1)},{f(p[1] + ny * w * 2.1)}', st(P['skinLine'], 2.4) + ' opacity="0.55"')
    tip, pre = c[-1], c[-4]
    ang = math.degrees(math.atan2(tip[1] - pre[1], tip[0] - pre[0]))
    o += ell(0, 0, 4.2, 6.4, f'fill="{P["skinLine"]}" opacity="0.8" transform="translate({f(tip[0] - (tip[0] - pre[0]) * 0.05)},{f(tip[1] - (tip[1] - pre[1]) * 0.05)}) rotate({f(ang)})"')
    return o


def hat(doc, dy=0):
    """Baker's toque: a puffy top of three bumps + a band; sits on the head top, tilted back a little."""
    dy += 4
    puff = ' '.join([ell_d(133, 42 + dy, 23, 21), ell_d(162, 32 + dy, 27, 24), ell_d(192, 42 + dy, 22, 20),
                     ell_d(162, 52 + dy, 39, 15)])
    o = doc.solid(puff, P['hat'], P['hatSh'], P['hatLine'], dx=-6, dy=-6, w=LW * 0.9,
                  inner=path(f'M146,{f(56 + dy)} Q150,{f(34 + dy)} 160,{f(30 + dy)}', st(P['hatSh'], 3)) +
                  path(f'M178,{f(56 + dy)} Q182,{f(38 + dy)} 190,{f(32 + dy)}', st(P['hatSh'], 3)))
    band = rrect_d(123, 54 + dy, 203, 74 + dy, 8)
    o += doc.solid(band, P['hat'], P['hatSh'], P['hatLine'], dx=-4, dy=-5, w=LW * 0.9,
                   inner=path(f'M128,{f(66 + dy)} L198,{f(66 + dy)}', st(P['hatSh'], 2.2)))
    return f'<g transform="rotate(-8 163 {f(62 + dy)})">{o}</g>'


def head_group(doc, face, trunk_key, tilt=0, dy=0):
    """Far ear + head with trunk (one union outline) + near ear + face + hat."""
    cx, cy, rx, ry = HEAD
    o = ''
    # far ear peeking behind the head (upper right)
    # head + trunk union
    d = ell_d(cx, cy, rx, ry) + ' ' + tube_d(TRUNKS[trunk_key], *TRUNK_W)
    hi = ell(128, 84, 20, 12, f'fill="{P["skinHi"]}" opacity="0.7" transform="rotate(-30 128 84)"')
    o += doc.solid(d, P['skin'], P['skinSh'], P['skinLine'], dx=-9, dy=-9, hi=hi)
    o += trunk_details(trunk_key)
    # near ear: big round ear over the back of the head
    ear = ell_d(102, 128, 46, 54)
    o += doc.solid(ear, P['skin'], P['skinSh'], P['skinLine'], dx=-7, dy=-7,
                   inner=ell(108, 132, 30, 38, f'fill="{P["pink"]}"') +
                   ell(114, 140, 22, 28, f'fill="{P["pinkSh"]}" opacity="0.45"'))
    # face
    o += cheeks(face.get('cheeks', False))
    o += eyes(face.get('eyes', 'open'), face.get('look', (0, 0)))
    o += brows(face.get('brows', ''))
    o += mouth(face.get('mouth', 'smile'))
    o += hat(doc)
    t = []
    if dy:
        t.append(f'translate(0 {f(dy)})')
    if tilt:
        t.append(f'rotate({f(tilt)} {NECK[0]} {NECK[1]})')
    return f'<g transform="{" ".join(t)}">{o}</g>' if t else o


def torso(doc):
    cx, cy, rx, ry = TORSO
    d = ell_d(cx, cy, rx, ry)
    # apron bib on the front (right) side with a caramel trim + neck strap
    bib = (path('M170,180 Q192,174 212,181 Q214,214 204,236 Q190,246 176,236 Q166,212 170,180 Z', fl(P['apron'], P['apronLine'], 2.6)) +
           path('M171,181 Q192,175 211,182', st(P['trim'], 5)) +
           path('M182,212 Q191,218 200,212', st(P['trim'], 3.2)))
    return doc.solid(d, P['skin'], P['skinSh'], P['skinLine'], dx=-8, dy=-8, inner=bib)


def arm(doc, sh, hand, r=13, w=23, bend=6):
    """A stubby arm (tube with a soft elbow bend to the lower right) + a round hand in one union outline."""
    mx, my = (sh[0] + hand[0]) / 2, (sh[1] + hand[1]) / 2
    dx, dy = hand[0] - sh[0], hand[1] - sh[1]
    dl = math.hypot(dx, dy) or 1
    nx, ny = dy / dl, -dx / dl
    if ny < 0:
        nx, ny = -nx, -ny
    d = tube_d([sh, (mx + nx * bend, my + ny * bend), hand], w, w * 0.88, 1.0) + ' ' + ell_d(hand[0], hand[1], r, r)
    return doc.solid(d, P['skin'], P['skinSh'], P['skinLine'], dx=-4, dy=-4,
                     inner=ell(hand[0] - 3, hand[1] - 4, r * 0.45, r * 0.3, f'fill="{P["skinHi"]}" opacity="0.8"'))


FRAMES = {
    #        face                                                         trunk    near hand        far hand    tilt
    'idle':   ({'eyes': 'open', 'mouth': 'smile'},                         'idle',  GRIP,           None,       0),
    'blink':  ({'eyes': 'shut', 'mouth': 'smile'},                         'idle',  GRIP,           None,       0),
    'talk':   ({'eyes': 'open', 'mouth': 'talk'},                          'idle',  GRIP,           None,       0),
    'happy':  ({'eyes': 'open', 'mouth': 'big', 'cheeks': True},           'up',    GRIP,           None,       0),
    'cheer':  ({'eyes': 'happy', 'mouth': 'big', 'cheeks': True},          'cheer', (270, 112),     (66, 80),   0),
    'think':  ({'eyes': 'open', 'mouth': 'o', 'brows': 'think', 'look': (2, -3)}, 'think', GRIP,    None,       6),
    'oops':   ({'eyes': 'open', 'mouth': 'wavy', 'brows': 'up'},           'oops',  (254, 124),     None,       -6),
    'honk':   ({'eyes': 'happy', 'mouth': 'toot', 'cheeks': True},         'honk',  GRIP,           None,       0),
    'spray':  ({'eyes': 'happy', 'mouth': 'big', 'cheeks': True},          'spray', GRIP,           None,       0),
    'wave':   ({'eyes': 'open', 'mouth': 'big'},                           'wave',  (266, 108),     None,       0),
    'giggle': ({'eyes': 'happy', 'mouth': 'big', 'cheeks': True},          'up',    (202, 166),     None,       0),
    'hand':   ({'eyes': 'open', 'mouth': 'big'},                           'hand',  GRIP,           None,       0),
}


def tupi_body(doc, name):
    face, tk, hand_n, hand_f, tilt = FRAMES[name]
    o = ''
    if hand_f:
        o += arm(doc, SH_F, hand_f)
    o += torso(doc)
    o += head_group(doc, face, tk, tilt)
    if name == 'wave':   # motion ticks
        o += path('M286,92 Q294,104 290,118', st(P['skinLine'], 3) + ' opacity="0.5"')
        o += path('M250,84 Q244,92 245,102', st(P['skinLine'], 3) + ' opacity="0.5"')
    if name == 'honk':   # little toot lines at the trunk tip
        for a in (-60, -90, -120):
            x0, y0 = 252 + 18 * math.cos(math.radians(a)), 36 + 18 * math.sin(math.radians(a))
            x1, y1 = 252 + 30 * math.cos(math.radians(a)), 36 + 30 * math.sin(math.radians(a))
            o += path(f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)}', st(P['skinLine'], 3.6))
    o += arm(doc, SH_N, hand_n)
    return o


def tupi_svg(name):
    doc = Doc('t')
    body = tupi_body(doc, name)
    return svg(300, 300, body, doc.text())


def cupcake(doc, cx, by, s=1.0):
    """A neutral strawberry-cream cupcake, bottom-centre (cx, by), ~64*s tall."""
    def T(x, y):
        return cx + x * s, by + y * s
    cup = poly_d([T(-22, -26), T(22, -26), T(16, 0), T(-16, 0)])
    o = doc.solid(cup, P['cup'], P['woodSh'], P['cupLine'], dx=-3 * s, dy=-2 * s, w=LW * 0.75 * s,
                  inner=''.join(path(f'M{f(T(x, -26)[0])},{f(T(x, -26)[1])} L{f(T(x * 0.72, 0)[0])},{f(T(x * 0.72, 0)[1])}',
                                     st(P['woodSh'], 2.4 * s)) for x in (-11, 0, 11)))
    fr = ' '.join([ell_d(*T(0, -32), 27 * s, 11 * s), ell_d(*T(0, -42), 21 * s, 10 * s), ell_d(*T(0, -51), 13 * s, 8 * s)])
    o += doc.solid(fr, P['frost'], P['frostSh'], P['frostLine'], dx=-3 * s, dy=-3 * s, w=LW * 0.75 * s)
    o += circ(*T(1, -62), 7 * s, fl(P['cherry'], '#8E2E3C', 2.4 * s)) + circ(*T(-1, -64), 2.2 * s, f'fill="{P["white"]}"')
    o += path(f'M{f(T(3, -68)[0])},{f(T(3, -68)[1])} Q{f(T(6, -76)[0])},{f(T(6, -76)[1])} {f(T(12, -78)[0])},{f(T(12, -78)[1])}',
              st('#7A5236', 2.2 * s))
    return o


def title_svg():
    doc = Doc('ti')
    o = ''
    dy = 40
    # legs (stubby, standing)
    for x, sh in ((126, 0), (170, 0)):
        o += doc.solid(rrect_d(x - 18, 298, x + 18, 350, 14), P['skin'], P['skinSh'], P['skinLine'], dx=-4, dy=-4,
                       inner=ell(x + 2, 346, 13, 4, f'fill="{P["skinSh"]}"'))
        for k in (-8, 0, 8):
            o += ell(x + k + 4, 346, 3.2, 2.4, f'fill="{P["hat"]}" stroke="{P["skinLine"]}" stroke-width="1.4"')
    # far arm waving up behind the near ear (+ motion ticks)
    o += arm(doc, (112, 246), (40, 168), bend=-8)
    o += path('M22,150 Q16,162 20,176', st(P['skinLine'], 3) + ' opacity="0.5"')
    o += path('M48,138 Q58,142 62,152', st(P['skinLine'], 3) + ' opacity="0.5"')
    # tail
    o += path('M92,286 Q78,284 74,272', st(P['skinLine'], 9)) + path('M92,286 Q78,284 74,272', st(P['skin'], 4.5))
    o += circ(73, 270, 5, f'fill="{P["skinSh"]}" stroke="{P["skinLine"]}" stroke-width="2"')
    # body
    d = ell_d(150, 268, 62, 56)
    apron = (path('M164,228 Q196,222 210,236 Q216,280 200,318 L156,318 Q150,272 164,228 Z', fl(P['apron'], P['apronLine'], 2.6)) +
             path('M164,229 Q196,223 210,237', st(P['trim'], 5)) +
             path('M158,312 L202,312', st(P['trim'], 5)) +
             path('M172,270 Q186,280 200,270 L198,288 Q186,294 174,288 Z', fl(P['apronSh'], P['apronLine'], 2)))
    o += doc.solid(d, P['skin'], P['skinSh'], P['skinLine'], dx=-9, dy=-9, inner=apron)
    # head: happy trunk curl
    o += head_group(doc, {'eyes': 'open', 'mouth': 'big', 'cheeks': True}, 'up', 0, dy)
    # near arm holds the plate out in front, the cupcake on it
    px, py = 236, 262
    o += arm(doc, (190, 250), (224, 270), bend=-4)
    o += ell(px, py, 40, 8, fl(P['plate'], P['plateLine'], 3)) + ell(px, py - 1, 28, 4.5, f'fill="{P["hatSh"]}"')
    o += cupcake(doc, px + 2, py - 2, 0.85)
    o += circ(226, 270, 13, fl(P['skin'], P['skinLine'], LW)) + ell(223, 266, 6, 4, f'fill="{P["skinHi"]}"')
    return svg(300, 360, o, doc.text())


# ======================================================================= cart
def canopy(doc):
    """A little striped parasol over the cargo tray (scalloped edge)."""
    o = ''
    o += path('M34,148 L52,24', st(P['woodLine'], 10)) + path('M34,148 L52,24', st(P['wood'], 5))
    d = f'M2,54 Q14,8 64,6 Q114,8 126,54 ' + ''.join(
        f'Q{f(126 - k * 15.5 - 7.75)},{f(68)} {f(126 - (k + 1) * 15.5)},54 ' for k in range(8)) + 'Z'
    stripes = ''
    for k in range(-3, 6):
        x = 64 + k * 26
        stripes += path(f'M{f(64 + (x - 64) * 0.15)},6 L{f(x - 7)},70 L{f(x + 7)},70 L{f(64 + (x - 64) * 0.15 + 2)},6 Z',
                        f'fill="{P["wood"]}"')
    o += doc.solid(d, P['cream'], P['creamSh'], P['woodLine'], dx=-6, dy=-5, inner=stripes +
                   path('M18,30 Q40,14 64,12', st(P['white'], 4) + ' opacity="0.7"'))
    o += circ(64, 4, 6, fl(P['copper'], P['copperLine'], 3))
    return o


def wheel_body(doc, cx=40, cy=40, r=38):
    o = circ(cx, cy, r - LW / 2, fl(P['wheel'], P['wheelLine'], LW))
    o += circ(cx, cy, r - 9, fl(P['wheelSh'], P['wheelLine'], 2.4))
    o += circ(cx, cy, r - 13, f'fill="{P["cream"]}"')
    for k in range(5):
        a = math.radians(k * 72 - 90)
        o += path(f'M{f(cx)},{f(cy)} L{f(cx + (r - 13) * math.cos(a))},{f(cy + (r - 13) * math.sin(a))}', st(P['wheelSh'], 6))
    o += circ(cx, cy, 9, fl(P['hub'], P['wheelLine'], 3)) + circ(cx, cy, 3, f'fill="{P["wheelLine"]}"')
    o += path(f'M{f(cx - r * 0.62)},{f(cy - r * 0.5)} A{f(r * 0.8)},{f(r * 0.8)} 0 0 1 {f(cx - r * 0.1)},{f(cy - r * 0.8)}',
              st('#9A7A62', 4))
    # a tread notch so the spin is readable even when blurred
    o += circ(cx, cy - r + 6, 3.6, f'fill="{P["cream"]}"')
    return o


def wheel_svg():
    return svg(80, 80, wheel_body(Doc('w')))


# ======================================================================= mouse + bird
def mouse_svg(wave):
    doc = Doc('m')
    o = ''
    # mouse head peeking out of the sack top
    hx, hy = 70, 50
    if wave:
        o += doc.solid(tube_d([(86, 66), (106, 54), (118, 40)], 10, 9, 1.0) + ' ' + ell_d(119, 38, 8, 8),
                       P['mouse'], P['mouseSh'], P['mouseLine'], dx=-2, dy=-2, w=2.6,
                       inner=ell(119, 39, 4, 3.4, f'fill="{P["pink"]}"'))
        o += path('M130,30 Q135,38 131,46', st(P['mouseLine'], 2.2) + ' opacity="0.6"')
        o += path('M110,26 Q114,22 120,22', st(P['mouseLine'], 2.2) + ' opacity="0.6"')
    for ex in (-22, 22):
        o += doc.solid(ell_d(hx + ex, hy - 18, 15, 15), P['mouse'], P['mouseSh'], P['mouseLine'], dx=-3, dy=-3, w=3,
                       inner=ell(hx + ex, hy - 17, 9, 9, f'fill="{P["pink"]}"'))
    o += doc.solid(ell_d(hx, hy, 24, 21), P['mouse'], P['mouseSh'], P['mouseLine'], dx=-5, dy=-5, w=3)
    o += ell(hx, hy + 9, 4.5, 3.4, f'fill="{P["nose"]}"')
    for s in (-1, 1):
        o += path(f'M{f(hx + s * 8)},{f(hy + 9)} L{f(hx + s * 22)},{f(hy + 6)} M{f(hx + s * 8)},{f(hy + 11)} L{f(hx + s * 21)},{f(hy + 13)}',
                  st(P['mouseLine'], 1.4) + ' opacity="0.7"')
    if wave:
        for s in (-1, 1):
            o += path(f'M{f(hx + s * 10 - 5)},{f(hy - 1)} Q{f(hx + s * 10)},{f(hy - 8)} {f(hx + s * 10 + 5)},{f(hy - 1)}',
                      st(P['eye'], 3))
        o += path(f'M{f(hx - 5)},{f(hy + 13)} Q{f(hx)},{f(hy + 21)} {f(hx + 5)},{f(hy + 13)} Z', fl(P['mouth'], P['mouth'], 1.5))
    else:
        for s in (-1, 1):
            o += ell(hx + s * 10, hy - 1, 4.2, 5.2, f'fill="{P["eye"]}"') + circ(hx + s * 10 - 1.4, hy - 3, 1.6, f'fill="{P["white"]}"')
        o += path(f'M{f(hx - 4)},{f(hy + 14)} Q{f(hx)},{f(hy + 17)} {f(hx + 4)},{f(hy + 14)}', st(P['mouth'], 1.8))
    o += ell(hx - 16, hy + 7, 5, 3, f'fill="{P["pink"]}" opacity="0.8"') + ell(hx + 16, hy + 7, 5, 3, f'fill="{P["pink"]}" opacity="0.8"')
    # sack (front) with a folded rim the mouse sits in
    sack = 'M28,70 Q22,96 30,110 Q70,118 110,110 Q118,96 112,70 Q70,62 28,70 Z'
    o += doc.solid(sack, P['sack'], P['sackSh'], P['sackLine'], dx=-6, dy=-5, w=3.4,
                   inner=path('M50,84 L50,106 M70,86 L70,110 M90,84 L90,106', st(P['sackSh'], 2)) +
                   ell(70, 96, 14, 10, f'fill="{P["flour"]}" opacity="0.6"'))
    o += doc.solid(ptsd([(24, 70), (44, 62), (70, 66), (96, 62), (116, 70), (100, 78), (70, 74), (40, 78)]),
                   P['sackSh'], P['sackSh'], P['sackLine'], dx=0, dy=0, w=3)
    # little paws on the rim
    for x in (58, 82) if not wave else (58,):
        o += ell(x, 70, 8, 6, fl(P['mouse'], P['mouseLine'], 2.4))
        o += path(f'M{x - 3},{71} L{x - 3},{75} M{x + 3},{71} L{x + 3},{75}', st(P['mouseLine'], 1.6))
    o += circ(16, 112, 5, f'fill="{P["flour"]}"') + circ(124, 110, 4, f'fill="{P["flour"]}"') + circ(116, 114, 3, f'fill="{P["flour"]}"')
    return svg(140, 120, o, doc.text())


def bird_svg(sing):
    doc = Doc('b')
    o = ''
    lift = 6 if sing else 0
    # legs
    for x in (54, 66):
        o += path(f'M{x},{80 - lift} L{x},94', st(P['leg'], 3.4)) + path(f'M{x - 5},94 L{x + 5},94', st(P['leg'], 3))
    # tail
    o += doc.solid(poly_d([(24, 58 - lift), (6, 48 - lift), (10, 66 - lift)]), P['birdSh'], P['birdSh'], P['birdLine'], dx=0, dy=0, w=3)
    # body
    o += doc.solid(ell_d(58, 56 - lift, 34, 28), P['bird'], P['birdSh'], P['birdLine'], dx=-5, dy=-5, w=3.2,
                   inner=ell(70, 66 - lift, 18, 14, f'fill="{P["belly"]}"'))
    # wing
    wing_rot = -25 if sing else 0
    o += f'<g transform="rotate({wing_rot} 46 {56 - lift})">' + doc.solid(
        ptsd([(30, 52 - lift), (48, 46 - lift), (60, 56 - lift), (46, 70 - lift), (32, 66 - lift)]),
        P['birdSh'], P['birdSh'], P['birdLine'], dx=0, dy=0, w=2.6) + '</g>'
    # head tuft
    o += path(f'M60,{30 - lift} Q56,{20 - lift} 64,{18 - lift} M64,{30 - lift} Q66,{22 - lift} 72,{22 - lift}', st(P['birdLine'], 3))
    # face
    ex, ey = 74, 48 - lift
    if sing:
        o += path(f'M{ex - 5},{ey} Q{ex},{ey - 6} {ex + 5},{ey}', st(P['eye'], 2.8))
        o += path(f'M87,{47 - lift} L103,{40 - lift} L101,{50 - lift} L103,{60 - lift} L87,{56 - lift} Z', fl(P['mouth'], P['beakLine'], 2))
        o += path(f'M87,{46 - lift} L104,{39 - lift} L90,{50 - lift} Z', fl(P['beak'], P['beakLine'], 2))
        o += path(f'M87,{57 - lift} L103,{61 - lift} L90,{54 - lift} Z', fl(P['beak'], P['beakLine'], 2))
        o += ell(93, 52 - lift, 3, 2, f'fill="{P["tongue"]}"')
    else:
        o += ell(ex, ey, 4.4, 5.4, f'fill="{P["eye"]}"') + circ(ex - 1.4, ey - 2, 1.6, f'fill="{P["white"]}"')
        o += path(f'M88,{48 - lift} L102,{52 - lift} L88,{57 - lift} Z', fl(P['beak'], P['beakLine'], 2))
    o += ell(80, 58 - lift, 5, 3, f'fill="{P["pink"]}" opacity="0.9"')
    return svg(120, 100, o, doc.text())


# ======================================================================= icon
def icon_svg():
    doc = Doc('i')
    o = f'<rect width="512" height="512" fill="#F6ECD8"/>'
    # gingham
    for k in range(0, 512, 64):
        o += f'<rect x="{k}" y="0" width="32" height="512" fill="#EBDCC0" opacity="0.6"/>'
        o += f'<rect x="0" y="{k}" width="512" height="32" fill="#EBDCC0" opacity="0.6"/>'
    # road: a gentle S from bottom-left to the house at top-right
    road = 'M-40,430 C120,400 160,300 300,290 S470,220 560,170'
    o += path(road, st('#5A3826', 112)) + path(road, st('#8C5E3F', 100)) + path(road, st('#FFF4E2', 100) + ' stroke-dasharray="0.1 14" opacity="0.95"')
    o += path(road, st('#8C5E3F', 86)) + path(road, st('#FFF4E2', 5) + ' stroke-dasharray="18 16"')
    # gingerbread house (top right)
    hx, hy = 420, 196
    o += doc.solid(f'M{hx - 62},{hy} L{hx - 62},{hy - 70} L{hx},{hy - 124} L{hx + 62},{hy - 70} L{hx + 62},{hy} Z',
                   '#C98A52', '#A86C3C', '#7E4E2A', dx=-6, dy=-6,
                   inner=path(rrect_d(hx - 16, hy - 48, hx + 16, hy + 6, 14), fl('#B5773F', '#7E4E2A', 3.4)) +
                   circ(hx - 36, hy - 52, 11, fl('#FFC977', '#7E4E2A', 3)))
    o += path(f'M{hx - 74},{hy - 62} L{hx},{hy - 128} L{hx + 74},{hy - 62}', st('#7E4E2A', 26)) + \
        path(f'M{hx - 74},{hy - 62} L{hx},{hy - 128} L{hx + 74},{hy - 62}', st('#FFF2DC', 17))
    o += circ(hx, hy - 136, 12, fl('#8DBB82', '#5F8A57', 3))
    # Tupi in her cart, big and central
    k, tx, ty = 1.22, 36, 168
    g = ''
    g += cart_back_body(doc)
    g += f'<g transform="translate({TUPI_OFF[0]} {TUPI_OFF[1]})">{tupi_body(doc, "happy")}</g>'
    g += cupcake(doc, TRAY[0], TRAY[1], 0.9)
    g += cart_front_body(doc)
    for x, y, r in WHEELS:
        g += f'<g transform="translate({x - 40} {y - 40}) scale({f(r / 38)})">{wheel_body(doc)}</g>'
    o += ell(tx + GROUND[0] * k, ty + GROUND[1] * k, 150, 16, 'fill="#5A3826" opacity="0.3"')
    o += f'<g transform="translate({tx} {ty}) scale({k})">{g}</g>'
    return svg(512, 512, o, doc.text())


def cart_back_body(doc):
    return _cart_back(doc)


def cart_front_body(doc):
    return _cart_front(doc)


# cart halves (shared by the cart SVGs and the icon)
def _cart_back(doc):
    """Canopy + pole, the seat back behind Tupi, the tray's inner back wall."""
    o = canopy(doc)
    o += doc.solid(rrect_d(124, 92, 152, 172, 12), P['wood'], P['woodSh'], P['woodLine'], dx=-5, dy=-5)
    o += doc.solid(rrect_d(24, 112, 146, 160, 10), P['woodIn'], P['woodSh'], P['woodLine'], dx=-4, dy=-4,
                   inner=path('M30,122 L140,122', st(P['woodSh'], 2.4)) + path('M30,136 L140,136', st(P['woodSh'], 2.4)))
    return o


def _cart_front(doc):
    o = ''
    o += path('M286,134 L296,100', st(P['woodLine'], 11)) + path('M286,134 L296,100', st(P['copper'], 5.5))
    d = ('M30,132 Q24,132 24,140 L26,190 Q28,200 40,200 L298,200 Q310,200 312,188 L314,160 '
         'Q316,124 290,116 L156,114 Q146,114 146,124 L146,132 Z')
    inner = (path('M26,160 L314,160', st(P['cream'], 12)) +
             ''.join(circ(x, 160, 2.6, f'fill="{P["trim"]}"') for x in range(38, 312, 16)) +
             path('M150,124 Q220,118 292,124', st('#E4B27C', 4) + ' opacity="0.8"') +
             path('M32,140 L140,140', st('#E4B27C', 3.4) + ' opacity="0.8"'))
    emb = (ell(226, 138, 22, 14, fl(P['cream'], P['woodLine'], 3)) +
           path('M212,142 Q212,128 226,128 Q240,128 240,142 Z', fl('#E0A35E', P['woodLine'], 2.6)) +
           path('M220,131 L218,138 M227,130 L226,138 M234,131 L234,138', st(P['woodLine'], 1.8)))
    o += doc.solid(d, P['wood'], P['woodSh'], P['woodLine'], dx=-8, dy=-8, inner=inner + emb)
    for x, y, r in WHEELS:
        o += path(f'M{f(x - r - 6)},200 A{f(r + 6)},{f(r + 6)} 0 0 1 {f(x + r + 6)},200 Z', fl(P['woodSh'], P['woodLine'], LW))
        o += path(f'M{f(x - r + 2)},200 A{f(r - 2)},{f(r - 2)} 0 0 1 {f(x + r - 2)},200 Z', f'fill="{P["wheelLine"]}" opacity="0.55"')
    o += doc.solid(rrect_d(304, 176, 326, 194, 8), P['copper'], P['copperLine'], P['copperLine'], dx=-3, dy=-3, w=3.2)
    o += circ(312, 140, 8, fl('#FFF1C9', P['copperLine'], 3.2)) + circ(310, 138, 2.6, f'fill="{P["white"]}"')
    o += path('M282,103 L310,101', st(P['copperLine'], 8)) + path('M282,103 L310,101', st(P['copper'], 3.6))
    o += circ(312, 101, 5.5, fl(P['cream'], P['copperLine'], 2.6))
    o += circ(316, 88, 7, fl(P['copper'], P['copperLine'], 3)) + circ(314, 86, 2, f'fill="{P["white"]}"')
    o += path('M312,96 L314,94', st(P['copperLine'], 3))
    return o


def write_points():
    def tip(key, back=0.0):
        pts, c = tube_pts(TRUNKS[key], *TRUNK_W)
        return c[-1]
    sp = tip('spray')
    hd = tip('hand')
    ys = [y for x, y, r in WHEELS]
    js = f"""/* Tupi's Bakery Delivery — BD.TUPI_POINTS (written by tools/art_tupi.py; do not edit by hand).
 * Tupi frames: 300x300 viewBox, Tupi seated facing RIGHT. Cart: 340x240 viewBox facing RIGHT.
 * Tupi is drawn at the SAME scale as the cart (1 unit = 1 unit): put Tupi's seat anchor on cart.seat, i.e. draw the
 * Tupi frame at cart offset (cart.seat - seat) = ({TUPI_OFF[0]}, {TUPI_OFF[1]}). Compose: cart_back -> Tupi -> cargo -> cart_front -> wheels.
 *   seat       Tupi's seat anchor (bottom of her bottom) in the Tupi frame
 *   trunkTip   tip of the trunk in tupi_spray (emit the sprinkle fountain here, direction up-forward ~ -70 deg)
 *   trunkHold  where the held treat goes in tupi_hand (bottom-centre of the treat)
 *   mouth      mouth centre; box = union of all seated frames' opaque pixels [x0, y0, x1, y1] (Tupi frame)
 *   cart.ground  wheel contact point; cart.seat where Tupi's seat anchor goes; cart.wheels [cx, cy, r] (wheel.svg is
 *              80x80 with r 38 -> scale r / 38, its centre (40, 40) on [cx, cy]); cart.tray bottom-centre of the cargo
 *              (the tray front lip in cart_front covers the bottom ~8 units); cart.box = the composed Tupi + cart + wheels
 *              (idle frame) bounding box in CART coords (y0 < 0: Tupi's hat rises above the cart viewBox). */
(function (BD) {{
  'use strict';
  BD.TUPI_POINTS = {{ seat: [{SEAT[0]}, {SEAT[1]}], trunkTip: [{round(sp[0])}, {round(sp[1])}], trunkHold: [{round(hd[0])}, {round(hd[1]) - 4}],
    mouth: [{MOUTH[0]}, {MOUTH[1]}], box: {BOX},
    cart: {{ ground: [{GROUND[0]}, {GROUND[1]}], seat: [{CART_SEAT[0]}, {CART_SEAT[1]}],
      wheels: [{', '.join(f'[{x}, {y}, {r}]' for x, y, r in WHEELS)}], tray: [{TRAY[0]}, {TRAY[1]}],
      box: {CART_BOX} }} }};
}})(typeof window !== 'undefined' ? (window.BD = window.BD || {{}}) : (globalThis.BD = globalThis.BD || {{}}));
"""
    with open(JS_OUT, 'w') as fh:
        fh.write(js)


# measured with tools/tupi_sheet.js (union of opaque pixels); update if the art changes
BOX = [45, 4, 298, 255]
CART_BOX = [0, -74, 338, 232]


def main():
    for name in FRAMES:
        write(f'characters/tupi_{name}.svg', tupi_svg(name))
    write('characters/tupi_title.svg', title_svg())
    d = Doc('cb')
    write('characters/cart_back.svg', svg(340, 240, _cart_back(d), d.text()))
    d = Doc('cf')
    write('characters/cart_front.svg', svg(340, 240, _cart_front(d), d.text()))
    write('characters/wheel.svg', wheel_svg())
    write('characters/mouse.svg', mouse_svg(False))
    write('characters/mouse_wave.svg', mouse_svg(True))
    write('characters/bird.svg', bird_svg(False))
    write('characters/bird_sing.svg', bird_svg(True))
    write('icon.svg', icon_svg())
    write_points()
    print('wrote', len(FRAMES) + 9, 'svg files +', os.path.relpath(JS_OUT, ROOT))


if __name__ == '__main__':
    main()
