#!/usr/bin/env python3
"""Character art generator for Rio's Singing Eggs (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/rio_{idle,blink,talk,happy,cheer,think,oops,wave,point,dance,beat}.svg + rio_full_wave.svg
        0 0 300 300, FEET ANCHOR (150,292). Rio is a tiny round baby dragon (mint-aqua, cream striped belly, peach bat
        wings, peach-cream horns + a crest of rounded spikes, a chubby tail with a spade tip) sitting in 3/4 view facing
        RIGHT with his eyes on the viewer. Body, haunch, belly and tail root are IDENTICAL in every frame; only the head
        tilt, eyes, mouth, brows, arms, wings, tail curl (and in 'dance' the near foot) change.
        beat = "sing / blow": head forward-up, mouth a round "O" (the world draws the spark from the mouth point).
        full_wave = the title pose, waving next to a cream speckled egg.
        docs/art/rio_hand.json gives per frame the mouth point (mouth + tips[0]), the near paw, the head top and the eye.
  characters/lamb.svg, lamb_ball.svg   0 0 160 120, bottom anchor (80,116), facing right: a baby triceratops
        (lamb = walking, lamb_ball = happy hop, all feet off the ground, mouth open "rawr")
  characters/bird.svg, bird_sing.svg   0 0 120 100, feet anchor (60,96), facing LEFT (a small grey-blue bird, kept)
  icon.svg                             0 0 512 512, full bleed, opaque, no text: Rio singing to a big speckled egg

Usage: python3 tools/art_rio.py [outDir]
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone (never black), one-step cel
shade (lower right) + one soft highlight (upper left); no <text>/fonts/scripts/external refs, no filters.
Deterministic: re-running gives byte-identical files.
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'rio_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Rio palette (DESIGN.md section 3) — never an answer colour
    'skin': '#7CD3C4', 'sh': '#4FA99B', 'line': '#2F7A70', 'farSkin': '#6CC2B3', 'farSh': '#4A9C8F',
    'belly': '#FFF1D6', 'bellySh': '#EBD6AE', 'bellyLine': '#C9AE7E',
    'horn': '#F6D9A8', 'hornSh': '#E2BC80', 'hornLine': '#B98C52',
    'wing': '#F7C9A8', 'wingSh': '#DFA27F', 'wingLine': '#B9765A', 'farWing': '#E9B593',
    'cheek': '#F2A99A', 'pupil': '#2F2A3A', 'white': '#FFFFFF', 'mouth': '#7A3A44', 'tongue': '#EE8F96',
    'claw': '#FFF6E6',
    # bird beak / legs (kept from the drum game's bird)
    'brass': '#D8B26A', 'brassD': '#9C7838', 'brassL': '#F3DFAE',
}
SHELL = ('#FFF4E0', '#EAD9BC', '#B4976E')   # egg shell base / shade / line (DESIGN §3)
SPECK = '#D9C3A0'


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


def rect(x, y, w, h, r=0, a=''):
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(r)}" {a}/>'


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


class Doc:
    """Collects <defs> with unique ids (the prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='k'):
        self.prefix, self.defs, self.n = prefix, [], 0

    def uid(self, k='g'):
        self.n += 1
        return f'{self.prefix}{k}{self.n}'

    def clip(self, inner):
        cid = self.uid('c')
        self.defs.append(f'<clipPath id="{cid}">{inner}</clipPath>')
        return cid

    def shaded(self, tpl, base, shade, line, dx=-10, dy=-9, w=LW, hi=None):
        """One-step cel shade: shape in shade colour, base colour shifted up-left inside it, outline on top.
        tpl is an element string with '{a}' where the attributes go."""
        cid = self.clip(tpl.format(a=''))
        out = tpl.format(a=f'fill="{shade}"')
        out += (f'<g clip-path="url(#{cid})"><g transform="translate({f(dx)},{f(dy)})">'
                f'{tpl.format(a=f"fill=\"{base}\"")}</g>')
        if hi:
            out += hi
        out += '</g>'
        out += tpl.format(a=f'fill="none" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')
        return out

    def shp(self, d, base, shade, line, dx=-6, dy=-6, w=LW, hi=None):
        return self.shaded(f'<path d="{d}" {{a}}/>', base, shade, line, dx, dy, w, hi)


def ptsd(pts, close=True):
    """Smooth path through points (Catmull-Rom → cubic Bézier)."""
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


def crs(pts, per=8):
    """Sample an open Catmull-Rom curve through pts."""
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2 = pts[max(i - 1, 0)], pts[i], pts[i + 1]
        p3 = pts[min(i + 2, n - 1)]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(pts[-1])
    return out


def taper(pts, w0, w1, per=6):
    """Closed outline of a tube along pts whose width goes w0 → w1 (round-ish ends). Returns (d, end point, end dir)."""
    s = crs(pts, per)
    left, right = [], []
    for i, (x, y) in enumerate(s):
        a, b = s[max(i - 1, 0)], s[min(i + 1, len(s) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1
        nx, ny = -ty / ln, tx / ln
        w = (w0 + (w1 - w0) * i / (len(s) - 1)) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    ex, ey = s[-1]
    px, py = s[-2]
    ln = math.hypot(ex - px, ey - py) or 1
    dx, dy = (ex - px) / ln, (ey - py) / ln
    cap = (ex + dx * w1 * 0.45, ey + dy * w1 * 0.45)
    sx, sy = s[0]
    a, b = s[0], s[1]
    ln0 = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
    cap0 = (sx - (b[0] - a[0]) / ln0 * w0 * 0.45, sy - (b[1] - a[1]) / ln0 * w0 * 0.45)
    ring = left + [cap] + right[::-1] + [cap0]
    return ptsd(ring[::2] if len(ring) > 40 else ring), (ex, ey), (dx, dy)


def tube(d, wout, col_line, col_fill, lw=LW):
    """A round-capped tube along path d: outline stroke underneath, fill stroke on top."""
    return path(d, st(col_line, wout)) + path(d, st(col_fill, wout - 2 * lw))


def star4(x, y, s, fill='#FFF6C8', line='#E2C86A', w=1.6):
    return path(f'M{f(x)},{f(y - s)} L{f(x + s * 0.3)},{f(y - s * 0.3)} L{f(x + s)},{f(y)} L{f(x + s * 0.3)},{f(y + s * 0.3)} '
                f'L{f(x)},{f(y + s)} L{f(x - s * 0.3)},{f(y + s * 0.3)} L{f(x - s)},{f(y)} L{f(x - s * 0.3)},{f(y - s * 0.3)} Z',
                f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')


def scallop(cx, cy, rx, ry, n, bulge=0.62, a0=-90):
    """A puffy scalloped outline: n points on an ellipse joined by outward arcs."""
    pts = [(cx + rx * math.cos(math.radians(a0 + 360 * i / n)), cy + ry * math.sin(math.radians(a0 + 360 * i / n)))
           for i in range(n)]
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        r = math.hypot(x1 - x0, y1 - y0) * bulge
        d += f' A{f(r)},{f(r)} 0 0 1 {f(x1)},{f(y1)}'
    return d + ' Z'


def blob(cx, cy, ang, s, wk=0.62):
    """A rounded spike / horn: base centred at (cx, cy), pointing at ang (deg), length s."""
    a = math.radians(ang)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    b = s * wk
    pts = [(cx + nx * b, cy + ny * b), (cx + dx * s * 0.55 + nx * b * 0.62, cy + dy * s * 0.55 + ny * b * 0.62),
           (cx + dx * s, cy + dy * s),
           (cx + dx * s * 0.55 - nx * b * 0.62, cy + dy * s * 0.55 - ny * b * 0.62), (cx - nx * b, cy - ny * b),
           (cx - dx * s * 0.25, cy - dy * s * 0.25)]
    return ptsd(pts)


def note(x, y, s, fill='#FFE08A', line='#B98A2E', double=False):
    """A chunky music note (head at x, y), with a cream halo so it reads on any sky."""
    hd = f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(s * 0.52)}" ry="{f(s * 0.38)}" transform="rotate(-22 {f(x)} {f(y)})" {{a}}/>'
    sx = x + s * 0.44
    d = f'M{f(sx)},{f(y - s * 0.1)} L{f(sx)},{f(y - s * 1.45)}'
    if double:
        x2 = sx + s * 1.05
        d2 = f'M{f(sx)},{f(y - s * 1.45)} L{f(x2)},{f(y - s * 1.7)} L{f(x2)},{f(y - s * 0.35)}'
        hd2 = hd.replace(f'cx="{f(x)}" cy="{f(y)}"', f'cx="{f(x + s * 1.05)}" cy="{f(y - s * 0.25)}"').replace(
            f'rotate(-22 {f(x)} {f(y)})', f'rotate(-22 {f(x + s * 1.05)} {f(y - s * 0.25)})')
        o = path(d + ' ' + d2, st('#FFFFFF', s * 0.42)) + hd.format(a=fl('#FFFFFF', '#FFFFFF', s * 0.3))
        o += hd2.format(a=fl('#FFFFFF', '#FFFFFF', s * 0.3))
        o += path(d + ' ' + d2, st(line, s * 0.24)) + hd.format(a=fl(fill, line, s * 0.13)) + hd2.format(a=fl(fill, line, s * 0.13))
        return o
    fd = f'M{f(sx)},{f(y - s * 1.45)} Q{f(sx + s * 0.2)},{f(y - s * 0.95)} {f(sx + s * 0.7)},{f(y - s * 0.85)}'
    o = path(d + ' ' + fd, st('#FFFFFF', s * 0.42)) + hd.format(a=fl('#FFFFFF', '#FFFFFF', s * 0.3))
    o += path(d + ' ' + fd, st(line, s * 0.24)) + hd.format(a=fl(fill, line, s * 0.13))
    return o


# ======================================================================= RIO
# head: a big round baby-dragon head with a soft rounded snout to the right; cranium centre ≈ (158,120), y 56..186
HEAD = [(158, 58), (194, 62), (220, 78), (236, 100), (246, 124), (246, 148), (234, 168), (210, 182), (174, 188),
        (138, 186), (110, 174), (93, 152), (90, 120), (101, 89), (126, 66)]
NECK = (164, 190)                  # head pivot (head tilts per pose round this point)
MOUTH = (214, 158)
EYE_N = (148, 116, 20)             # near eye (viewer's left, bigger)
EYE_F = (205, 110, 15)             # far eye (towards the eggs)
BODY = 'M150,190 C186,188 204,214 204,244 C204,272 186,292 150,292 C116,292 96,272 96,244 C96,212 116,192 150,190 Z'
BELLY = (170, 250, 27, 34)
SH_F = (194, 208)                  # far shoulder (behind the body)
SH_N = (178, 224)                  # near shoulder (in front)
ARM_W = 26
PAW_R = 11.5
WING_N = (118, 214)                # wing roots on the back
WING_F = (134, 204)
HORN_N = (130, 72, -122, 24)       # x, y, angle, length
HORN_F = (176, 64, -78, 18)
CREST = [(104, 84, -150, 15), (93, 110, -168, 13), (90, 138, -184, 10)]   # head-back spikes
BACK_CREST = [(102, 214, -160, 10), (97, 236, -176, 9)]

# arms: [shoulder, elbow, paw]; near kind 'paw' | 'open' (waving) | 'point'
ARMS = {
    'idle':  ([SH_F, (206, 226), (216, 240)], [SH_N, (192, 236), (200, 250)], 'paw'),
    'talk':  ([SH_F, (206, 226), (216, 240)], [SH_N, (206, 232), (224, 222)], 'open'),
    'happy': ([SH_F, (214, 220), (226, 226)], [SH_N, (204, 238), (220, 242)], 'paw'),
    'cheer': ([(112, 206), (90, 188), (78, 160)], [SH_N, (226, 206), (254, 184)], 'open'),
    'think': ([SH_F, (206, 226), (216, 240)], [SH_N, (214, 220), (212, 192)], 'paw'),
    'oops':  ([SH_F, (206, 226), (216, 240)], [SH_N, (212, 224), (230, 214)], 'open'),
    'wave':  ([SH_F, (206, 228), (216, 242)], [SH_N, (232, 204), (258, 176)], 'open'),
    'point': ([SH_F, (206, 226), (216, 240)], [SH_N, (226, 212), (252, 196)], 'point'),
    'dance': ([(112, 208), (90, 204), (74, 190)], [SH_N, (226, 204), (248, 180)], 'open'),
    'beat':  ([SH_F, (214, 222), (226, 214)], [SH_N, (206, 232), (220, 222)], 'paw'),
    'full_wave': ([SH_F, (214, 228), (226, 240)], [SH_N, (232, 204), (256, 174)], 'open'),
}
ARMS['blink'] = ARMS['idle']
ARMS['icon'] = ARMS['beat']

POSES = {
    #             eyes      mouth     brows    look      head (rot, dx, dy)  wings (deg, scale)  tail
    'idle':      ('open',   'smile',  None,    (1, 2),   (0, 0, 0),          (0, 1),             'rest'),
    'blink':     ('closed', 'smile',  None,    (1, 2),   (0, 0, 0),          (0, 1),             'rest'),
    'talk':      ('open',   'talk',   None,    (1, 2),   (-2, 0, 0),         (-4, 1),            'rest'),
    'happy':     ('wide',   'big',    None,    (0, 1),   (-3, 0, -1),        (-14, 1.08),        'up'),
    'cheer':     ('happy',  'big',    None,    (0, 0),   (-4, 0, -3),        (-30, 1.16),        'up'),
    'think':     ('look',   'hmm',    (0, 6),  (4, -5),  (6, 0, 0),          (0, 1),             'rest'),
    'oops':      ('wide',   'o',      (7, 0),  (-1, 1),  (9, -2, 0),         (6, 0.96),          'rest'),
    'wave':      ('open',   'big',    None,    (1, 2),   (-2, 0, 0),         (-10, 1.04),        'up'),
    'point':     ('look',   'talk',   (4, 4),  (5, -3),  (-4, 0, 0),         (-4, 1),            'rest'),
    'dance':     ('happy',  'big',    None,    (0, 0),   (-7, 0, -2),        (-34, 1.14),        'swish'),
    'beat':      ('wide',   'sing',   (3, 3),  (4, -2),  (-11, 5, -4),       (-10, 1.04),        'up'),
    'full_wave': ('wide',   'big',    None,    (1, 2),   (-3, 0, 0),         (-12, 1.06),        'up'),
    'icon':      ('happy',  'sing',   None,    (0, 0),   (-11, 5, -4),       (-18, 1.1),         'up'),
}


def eye(cx, cy, r, mode='open', look=(0, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.06 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.86, rr * 1.04, f'fill="{P["pupil"]}"')
        px, py = cx + look[0] * 0.5, cy + look[1] * 0.5
        o += ell(cx, cy + rr * 0.5, rr * 0.5, rr * 0.24, 'fill="#4C6C8E" opacity=".75"')
        o += circ(px - rr * 0.28, py - rr * 0.36, rr * 0.36, 'fill="#FFFFFF"')
        o += circ(px + rr * 0.3, py + rr * 0.3, rr * 0.15, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.85)},{f(cy)} Q{f(cx)},{f(cy + r * 0.7)} {f(cx + r * 0.85)},{f(cy)}', st(P['pupil'], 4.8))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.85)},{f(cy + r * 0.34)} Q{f(cx)},{f(cy - r * 0.95)} {f(cx + r * 0.85)},{f(cy + r * 0.34)}',
                  st(P['pupil'], 5.4))
    return o


def mouth(mode):
    mx, my = MOUTH
    line = P['line']
    if mode == 'smile':     # a little smile with one tooth
        o = path(f'M{mx - 15},{my - 4} Q{mx - 2},{my + 10} {mx + 14},{my - 6}', st(line, 3.8))
        o += path(f'M{mx + 2},{my + 2.6} L{mx + 4.5},{my + 8} L{mx + 7.5},{my + 1.4} Z', fl('#FFFFFF', line, 1.8))
        return o
    if mode == 'talk':
        o = path(f'M{mx - 12},{my - 4} Q{mx},{my - 4} {mx + 12},{my - 6} Q{mx + 11},{my + 12} {mx},{my + 13} '
                 f'Q{mx - 11},{my + 12} {mx - 12},{my - 4} Z', fl(P['mouth'], line, 3.2))
        o += ell(mx, my + 8, 6.4, 3.6, f'fill="{P["tongue"]}"')
        o += path(f'M{mx + 2},{my - 4.2} L{mx + 4.5},{my + 1} L{mx + 7},{my - 4.6} Z', 'fill="#FFFFFF"')
        return o
    if mode == 'big':
        ww, h = 17, 16
        o = path(f'M{f(mx - ww)},{f(my - 5)} Q{mx},{f(my - 1)} {f(mx + ww)},{f(my - 8)} '
                 f'Q{f(mx + ww * 0.8)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - ww * 0.8)},{f(my + h)} {f(mx - ww)},{f(my - 5)} Z',
                 fl(P['mouth'], line, 3.2))
        o += ell(mx, my + h - 5, 8.4, 4.4, f'fill="{P["tongue"]}"')
        o += path(f'M{mx + 3},{my - 3.6} L{mx + 6},{my + 2.4} L{mx + 9},{my - 4.4} Z', 'fill="#FFFFFF"')
        return o
    if mode == 'o':
        return ell(mx + 1, my + 3, 6, 7.4, fl(P['mouth'], line, 3))
    if mode == 'sing':      # round "O": singing / blowing the spark
        o = ell(mx + 3, my + 2, 11, 13, fl(P['mouth'], line, 3.6))
        o += ell(mx + 3, my + 9, 6.4, 4, f'fill="{P["tongue"]}"')
        return o
    if mode == 'hmm':
        return path(f'M{mx - 12},{my + 1} Q{mx - 6},{my - 4} {mx},{my} Q{mx + 6},{my + 4} {mx + 12},{my - 2}', st(line, 3.6))
    return ''


def mouth_point(mode):
    mx, my = MOUTH
    return (mx + 3, my + 2) if mode == 'sing' else ((mx + 1, my + 3) if mode == 'o' else (mx, my + 3))


def head(doc, pose):
    """The head group (horns + crest behind, head, face). Returns svg in head-local coords."""
    eyes, mo, brows, look = POSES[pose][:4]
    o = ''
    for (x, y, a, s) in [HORN_F] + CREST:
        o += doc.shp(blob(x, y, a, s), P['horn'], P['hornSh'], P['hornLine'], dx=-2, dy=-3, w=3.6)
    hd = ptsd(HEAD)
    hi = ell(118, 88, 18, 8, 'fill="#FFFFFF" opacity=".34" transform="rotate(-44 118 88)"')
    o += doc.shp(hd, P['skin'], P['sh'], P['line'], dx=-12, dy=-11, hi=hi)
    # near horn in front of the head edge
    x, y, a, s = HORN_N
    o += doc.shp(blob(x, y, a, s), P['horn'], P['hornSh'], P['hornLine'], dx=-3, dy=-3, w=3.8,
                 hi=ell(x - 7, y - 10, 3, 5, 'fill="#FFFFFF" opacity=".55" transform="rotate(-30 %s %s)"' % (f(x - 7), f(y - 10))))
    # a few soft scale freckles on the cranium
    for (fx, fy, fr) in ((176, 78, 3.2), (188, 86, 2.4), (166, 88, 2.2)):
        o += circ(fx, fy, fr, f'fill="{P["sh"]}" opacity=".45"')
    # nostrils on the snout
    o += ell(236, 128, 2.6, 3.6, f'fill="{P["line"]}" opacity=".8" transform="rotate(-20 236 128)"')
    o += ell(226, 124, 2, 2.8, f'fill="{P["line"]}" opacity=".6" transform="rotate(-20 226 124)"')
    # cheeks
    o += ell(130, 150, 14, 8.5, f'fill="{P["cheek"]}" opacity=".85"')
    o += mouth(mo)
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 8 - lift
            o += path(f'M{f(cx - 7)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 7)},{f(y + 3)}', st(P['line'], 3.6))
    return o


def wing(doc, root, ang, sc, far=False):
    """A small bat wing on the back, root at `root`, spreading up-left. ang (deg, - = more raised/open)."""
    loc = {'root': (0, 0), 'lead': (-4, -48), 'tip': (-36, -74), 'a': (-54, -46), 'b': (-48, -22), 'c': (-28, -6),
           'end': (-4, 6)}
    pt = {k: rot(root[0] + x * sc, root[1] + y * sc, ang, *root) for k, (x, y) in loc.items()}

    def P_(k):
        return f'{f(pt[k][0])},{f(pt[k][1])}'

    def ctrl(k1, k2, pull=0.32):   # scallop control point pulled towards the root
        mx, my = (pt[k1][0] + pt[k2][0]) / 2, (pt[k1][1] + pt[k2][1]) / 2
        return f'{f(mx + (root[0] - mx) * pull)},{f(my + (root[1] - my) * pull)}'
    d = (f'M{P_("root")} Q{P_("lead")} {P_("tip")} Q{ctrl("tip", "a")} {P_("a")} Q{ctrl("a", "b")} {P_("b")} '
         f'Q{ctrl("b", "c")} {P_("c")} Q{ctrl("c", "end", 0.2)} {P_("end")} Z')
    base = P['farWing'] if far else P['wing']
    o = doc.shp(d, base, P['wingSh'], P['wingLine'], dx=4, dy=-5, w=3.8)
    # wing "fingers"
    for k in ('tip', 'a', 'b'):
        x, y = pt[k]
        x0, y0 = root[0] + (x - root[0]) * 0.12, root[1] + (y - root[1]) * 0.12
        x1, y1 = root[0] + (x - root[0]) * 0.86, root[1] + (y - root[1]) * 0.86
        o += path(f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)}', st(P['wingSh'], 2.6))
    return o


def paw(hx, hy, tx, ty, far=False, kind='paw'):
    skin = P['farSkin'] if far else P['skin']
    r = PAW_R + (2 if kind == 'open' else 0)
    o = circ(hx, hy, r, fl(skin, P['line'], 3.8))
    if kind == 'point':      # one chubby claw-finger pointing on
        x1, y1 = hx + tx * 16, hy + ty * 16
        o += path(f'M{f(hx + tx * 4)},{f(hy + ty * 4)} L{f(x1)},{f(y1)}', st(P['line'], 11)) + \
            path(f'M{f(hx + tx * 4)},{f(hy + ty * 4)} L{f(x1)},{f(y1)}', st(skin, 3.6))
        o += circ(hx, hy, r - 2.3, f'fill="{skin}"')
        o += circ(x1 + tx * 3, y1 + ty * 3, 2.6, fl(P['claw'], P['line'], 1.6))
        return o
    # three little cream claws on the front edge
    n = 3
    spread = 44 if kind == 'open' else 36
    for i in range(n):
        a = math.radians((i - 1) * spread)
        dx, dy = tx * math.cos(a) - ty * math.sin(a), tx * math.sin(a) + ty * math.cos(a)
        o += circ(hx + dx * (r - 0.5), hy + dy * (r - 0.5), 2.7, fl(P['claw'], P['line'], 1.6))
    if kind == 'open':
        o += ell(hx - tx * 1.5, hy - ty * 1.5, 5.6, 4.4, f'fill="{P["sh"]}" opacity=".6"')
    return o


SHOULDER_CLIP = {}


def arm(pts, kind, far=False, doc=None):
    """Front leg tube through pts + paw. Returns svg and the paw tip point."""
    d = ptsd(pts, close=False)
    skin = P['farSkin'] if far else P['skin']
    o = tube(d, ARM_W, P['line'], skin)
    if not far and pts[0] == SH_N and doc:   # hide the round cap outline where the arm meets the body (not on the belly)
        bx, by, brx, bry = BELLY
        hole = f'M{bx - brx},{by} a{brx},{bry} 0 1 0 {2 * brx},0 a{brx},{bry} 0 1 0 {-2 * brx},0 Z'
        cid = doc.clip(f'<path d="{BODY} {hole}" clip-rule="evenodd"/>')
        o += f'<g clip-path="url(#{cid})">' + circ(pts[0][0], pts[0][1], ARM_W / 2 + 0.6, f'fill="{skin}"') + '</g>'
    hx, hy = pts[-1]
    ex, ey = pts[-2]
    ln = math.hypot(hx - ex, hy - ey) or 1
    tx, ty = (hx - ex) / ln, (hy - ey) / ln
    o += paw(hx, hy, tx, ty, far, kind)
    reach = 20 if kind == 'point' else PAW_R + 2
    return o, (hx + tx * reach, hy + ty * reach)


TAILS = {
    'rest':  [(112, 266), (86, 276), (62, 272), (46, 256)],
    'up':    [(112, 268), (82, 276), (60, 260), (54, 236)],
    'swish': [(112, 268), (80, 266), (64, 244), (74, 222)],
}


def tail(doc, kind):
    d, (ex, ey), (dx, dy) = taper(TAILS[kind], 30, 13)
    o = doc.shp(d, P['skin'], P['sh'], P['line'], dx=-3, dy=-5)
    # spade tip (peach-cream) pointing along the tail
    ang = math.degrees(math.atan2(dy, dx)) - 90
    tip = 'M0,-6 C-3,-2 -13,2 -13,10 C-13,16 -6,18 -2,14 L0,22 L2,14 C6,18 13,16 13,10 C13,2 3,-2 0,-6 Z'
    o += (f'<g transform="translate({f(ex + dx * 2)},{f(ey + dy * 2)}) rotate({f(ang)})">' +
          doc.shp(tip, P['horn'], P['hornSh'], P['hornLine'], dx=-2, dy=-2, w=3.4) + '</g>')
    return o


def legs(doc, pose):
    """(far foot behind the body, near haunch + near foot in front)."""
    far = ell(200, 284, 17, 8.5, fl(P['farSkin'], P['line'], 3.8))
    for x in (210, 216):
        far += circ(x, 288, 2.3, fl(P['claw'], P['line'], 1.4))
    hi = ell(114, 250, 8, 4.5, 'fill="#FFFFFF" opacity=".25" transform="rotate(-36 114 250)"')
    near = doc.shaded('<ellipse cx="126" cy="262" rx="29" ry="26" {a}/>', P['skin'], P['sh'], P['line'], dx=-6, dy=-7, hi=hi)
    if pose == 'dance':       # near foot kicked up
        fx, fy, fa = 176, 272, -24
    else:
        fx, fy, fa = 154, 283, 0
    foot = ell(0, 0, 23, 9.5, fl(P['skin'], P['line'], 3.8))
    foot += ell(-4, 3, 13, 4, f'fill="{P["sh"]}" opacity=".5"')
    for x in (15, 21):
        foot += circ(x, 4, 2.6, fl(P['claw'], P['line'], 1.5))
    near += f'<g transform="translate({fx},{fy}) rotate({fa})">{foot}</g>'
    return far, near


def body(doc):
    o = doc.shp(BODY, P['skin'], P['sh'], P['line'], dx=-11, dy=-9)
    px, py, prx, pry = BELLY
    cid = doc.clip(f'<ellipse cx="{px}" cy="{py}" rx="{prx}" ry="{pry}"/>')
    o += ell(px, py, prx, pry, f'fill="{P["bellySh"]}"')
    o += f'<g clip-path="url(#{cid})">' + ell(px - 5, py - 5, prx, pry, f'fill="{P["belly"]}"')
    for k in range(5):           # soft belly stripes
        y = py - pry + 12 + k * 12.5
        o += path(f'M{px - prx},{f(y - 2)} Q{px},{f(y + 5)} {px + prx},{f(y - 2)}', st(P['bellySh'], 2.6))
    o += '</g>'
    o += ell(px, py, prx, pry, f'fill="none" stroke="{P["bellyLine"]}" stroke-width="2.4"')
    return o


def egg(doc, cx, bottom, w, h, speck=True):
    """A cream speckled egg standing on its bottom (cx, bottom)."""
    top = bottom - h
    d = (f'M{f(cx)},{f(top)} C{f(cx + w * 0.42)},{f(top)} {f(cx + w * 0.52)},{f(bottom - h * 0.42)} {f(cx + w * 0.5)},'
         f'{f(bottom - h * 0.3)} C{f(cx + w * 0.48)},{f(bottom - h * 0.06)} {f(cx + w * 0.25)},{f(bottom)} {f(cx)},{f(bottom)} '
         f'C{f(cx - w * 0.25)},{f(bottom)} {f(cx - w * 0.48)},{f(bottom - h * 0.06)} {f(cx - w * 0.5)},{f(bottom - h * 0.3)} '
         f'C{f(cx - w * 0.52)},{f(bottom - h * 0.42)} {f(cx - w * 0.42)},{f(top)} {f(cx)},{f(top)} Z')
    hi = ell(cx - w * 0.2, top + h * 0.26, w * 0.1, h * 0.13, 'fill="#FFFFFF" opacity=".85" '
             f'transform="rotate(-24 {f(cx - w * 0.2)} {f(top + h * 0.26)})"')
    sp = ''
    if speck:
        for (u, v, r) in ((0.16, 0.3, 0.07), (-0.05, 0.52, 0.055), (0.24, 0.62, 0.05), (-0.26, 0.7, 0.06),
                          (0.06, 0.8, 0.045), (0.3, 0.42, 0.035), (-0.18, 0.45, 0.035)):
            sp += ell(cx + u * w, top + v * h, r * w, r * w * 0.8, f'fill="{SPECK}"')
    return doc.shp(d, SHELL[0], SHELL[1], SHELL[2], dx=-w * 0.12, dy=-h * 0.06, w=max(3, w * 0.05), hi=sp + hi)


def rio(doc, pose):
    eyes, mo, brows, look, (hr, hdx, hdy), (wa, ws), tail_kind = POSES[pose]
    aF, aN, near_kind = ARMS[pose]
    o = ''
    far_leg, near_leg = legs(doc, pose)
    far_arm, far_tip = arm(aF, 'paw', far=True)
    o += wing(doc, WING_F, wa - 16, ws * 0.86, far=True)
    o += tail(doc, tail_kind)
    o += far_leg + far_arm
    for (x, y, a, s) in BACK_CREST:
        o += doc.shp(blob(x, y, a, s), P['horn'], P['hornSh'], P['hornLine'], dx=-2, dy=-2, w=3.4)
    o += body(doc) + near_leg
    o += wing(doc, WING_N, wa, ws)
    if pose == 'full_wave':   # the speckled egg beside him, his far paw resting on it
        o += egg(doc, 262, 291, 62, 80)
        o += arm(aF, 'paw', far=True)[0]
    tr = f'translate({hdx},{hdy}) rotate({hr} {NECK[0]} {NECK[1]})'
    o += f'<g transform="{tr}">{head(doc, pose)}</g>'
    mpx, mpy = mouth_point(mo)
    mpx, mpy = rot(mpx, mpy, hr, *NECK)
    mouth_pt = (mpx + hdx, mpy + hdy)
    near_arm, near_tip = arm(aN, near_kind, doc=doc)
    # pose extras (drawn in the line colour, soft)
    soft = st(P['line'], 3.6) + ' opacity=".75"'
    ex = ''
    if pose in ('wave', 'full_wave'):
        hx, hy = aN[-1]
        ex += path(f'M{f(hx + 18)},{f(hy - 18)} Q{f(hx + 28)},{f(hy - 6)} {f(hx + 26)},{f(hy + 10)} '
                   f'M{f(hx + 4)},{f(hy - 30)} Q{f(hx + 22)},{f(hy - 34)} {f(hx + 32)},{f(hy - 24)}', soft)
    if pose == 'cheer':
        for (x, y, r) in ((40, 120, 5), (272, 120, 5), (30, 92, 3.4), (284, 94, 3.4)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'dance':
        ex += circ(268, 146, 3.6, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'oops':
        ex += path('M252,58 Q252,46 262,46 Q272,46 270,56 Q268,64 260,66 L260,72', st(P['line'], 4) + ' opacity=".8"')
        ex += circ(260, 82, 2.8, f'fill="{P["line"]}" opacity=".8"')
    if pose == 'think':
        for (x, y, r) in ((246, 86, 3.4), (258, 70, 5), (272, 52, 7)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".75"')
    if pose == 'beat':   # two little song puffs above/below the mouth
        mx, my = mouth_pt
        ex += path(f'M{f(mx + 30)},{f(my - 22)} Q{f(mx + 40)},{f(my - 12)} {f(mx + 38)},{f(my + 2)} '
                   f'M{f(mx + 28)},{f(my + 16)} Q{f(mx + 38)},{f(my + 24)} {f(mx + 34)},{f(my + 34)}', soft)
    if ex:   # a soft cream halo under the motion marks so they also read on the night sky
        halo = (ex.replace(f'stroke="{P["line"]}"', 'stroke="#FFF4E0"').replace(f'fill="{P["line"]}"', 'fill="#FFF4E0"')
                .replace('stroke-width="2.6"', 'stroke-width="6"').replace('stroke-width="3.6"', 'stroke-width="7"')
                .replace('stroke-width="4"', 'stroke-width="7.4"'))
        o += f'<g opacity=".55">{halo}</g>' + ex
    o += near_arm
    head_top = rot(HORN_N[0] + math.cos(math.radians(HORN_N[2])) * HORN_N[3],
                   HORN_N[1] + math.sin(math.radians(HORN_N[2])) * HORN_N[3], hr, *NECK)
    eye_pt = rot(EYE_N[0], EYE_N[1], hr, *NECK)
    info = {'mouth': mouth_pt, 'hand': near_tip, 'nearPaw': aN[-1], 'farPaw': aF[-1],
            'headTop': (head_top[0] + hdx, head_top[1] + hdy), 'eye': (eye_pt[0] + hdx, eye_pt[1] + hdy)}
    return o, info


def R(p):
    return [round(p[0]), round(p[1])]


def write_rio():
    out = {}
    for pose in POSES:
        if pose == 'icon':
            continue
        d = Doc('k')
        b, info = rio(d, pose)
        write(f'characters/rio_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
        out[pose] = {'mouth': R(info['mouth']), 'tips': [R(info['mouth'])], 'hand': R(info['hand']),
                     'nearPaw': R(info['nearPaw']), 'farPaw': R(info['farPaw']),
                     'headTop': R(info['headTop']), 'eye': R(info['eye'])}
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        json.dump({'_about': ('Rio the baby dragon per frame, in the 0 0 300 300 viewBox (feet anchor 150,292). '
                              'mouth = the spark origin (centre of the mouth; beat = the round singing "O"); tips[0] = the '
                              'same mouth point (kept for code that read the old drumstick tips); hand = the tip of the NEAR '
                              'paw (wave: top of the waving paw; point: the pointing claw); nearPaw / farPaw = paw centres; '
                              'headTop = tip of the near horn (speech-bubble tail / stars over the head); eye = near eye '
                              'centre; bbox = measured opaque box [x0, y0, x1, y1] (added by tools/rio_sheet.js).'),
                   **out}, fh, indent=1)
        fh.write('\n')
    return out


# ======================================================================= LAMB = baby triceratops (faces RIGHT)
TB = {'skin': '#B9B2D6', 'sh': '#9D95C2', 'line': '#6B6394', 'far': '#A9A1CA', 'belly': '#DCD7EC',
      'frill': '#F6EBD3', 'frillSh': '#E4D3B0', 'frillLine': '#A8916A', 'frillIn': '#CAC3E3',
      'horn': '#FFF4E0', 'hornLine': '#B4976E', 'spot': '#A69DCB', 'cheek': '#F2A9B4', 'mouth': '#6E3848',
      'tongue': '#EE8F96'}


def trike(hop=False):
    d = Doc('h' if not hop else 'j')
    o = ''
    dy = -12 if hop else 0
    # ground shadow (stays on the ground)
    o += ell(80, 114, 40 if hop else 46, 3, 'fill="#4E4870" opacity=".14"')
    # legs: (hip x, far?) — walking: straight columns; hop: front pair reaching forward, back pair kicked back
    legs_ = ((58, True), (98, True), (48, False), (88, False))
    LEG = []
    for x, far in legs_:
        if hop:
            front = x > 70
            top = (x, 90 + dy)
            foot = (x + (8 if front else -8), 104 + dy)
        else:
            top = (x, 90)
            foot = (x, 108)
        LEG.append((top, foot, far))

    def leg(top, foot, far):
        col = TB['far'] if far else TB['skin']
        dd = f'M{f(top[0])},{f(top[1])} L{f(foot[0])},{f(foot[1])}'
        s = path(dd, st(TB['line'], 17)) + path(dd, st(col, 17 - 2 * 3.2))
        for i in (-1, 1):
            s += circ(foot[0] + 3 + i * 3.4, foot[1] + 4, 2.1, fl(TB['horn'], TB['hornLine'], 1.2))
        return s
    for top, foot, far in LEG:
        if far:
            o += leg(top, foot, far)
    # tail
    tpts = [(46, 78 + dy), (30, 84 + dy), (16, 92 + dy - (6 if hop else 0)), (8, 94 + dy - (12 if hop else 0))]
    td, _, _ = taper(tpts, 22, 6)
    o += d.shp(td, TB['skin'], TB['sh'], TB['line'], dx=-2, dy=-3, w=3.2)
    # body
    bd = ptsd([(40, 76 + dy), (52, 56 + dy), (78, 48 + dy), (104, 54 + dy), (116, 72 + dy), (110, 94 + dy), (80, 102 + dy),
               (50, 98 + dy)])
    sp = ''.join(ell(x, y + dy, rx, ry, f'fill="{TB["spot"]}"') for (x, y, rx, ry) in
                 ((66, 60, 7, 4.4), (84, 56, 5, 3.4), (56, 72, 4, 3), (96, 64, 4, 3)))
    sp += ell(56, 60 + dy, 10, 4.4, f'fill="#FFFFFF" opacity=".4" transform="rotate(-24 56 {f(60 + dy)})"')
    o += d.shp(bd, TB['skin'], TB['sh'], TB['line'], dx=-4, dy=-6, w=3.6, hi=sp)
    o += path(f'M56,{f(94 + dy)} Q80,{f(104 + dy)} 104,{f(90 + dy)}', st(TB['belly'], 5) + ' opacity=".9"')
    for top, foot, far in LEG:
        if not far:
            o += leg(top, foot, far)
    # head group (tilted up a bit when hopping)
    h = ''
    # frill: scalloped cream rim + lilac inside
    fr = scallop(110, 54, 27, 26, 9, 0.6)
    h += d.shp(fr, TB['frill'], TB['frillSh'], TB['frillLine'], dx=-2, dy=-2, w=3)
    h += ell(112, 56, 18, 17, f'fill="{TB["frillIn"]}"')
    for (x, y) in ((101, 42), (112, 38), (122, 44)):
        h += circ(x, y, 2.4, f'fill="{TB["frillSh"]}"')
    # brow horns (far one first) + nose horn
    h += d.shp(blob(136, 56, -64, 15, 0.42), TB['horn'], TB['frillSh'], TB['hornLine'], dx=-1, dy=-1, w=2.6)
    hd = ptsd([(112, 62), (128, 54), (144, 60), (154, 74), (152, 86), (138, 93), (118, 92), (106, 80)])
    h += d.shp(hd, TB['skin'], TB['sh'], TB['line'], dx=-3, dy=-4, w=3.4,
               hi=ell(120, 64, 6, 3.2, 'fill="#FFFFFF" opacity=".4" transform="rotate(-30 120 64)"'))
    h += d.shp(blob(124, 58, -78, 17, 0.42), TB['horn'], TB['frillSh'], TB['hornLine'], dx=-1, dy=-1, w=2.6)
    h += d.shp(blob(149, 67, -58, 9, 0.5), TB['horn'], TB['frillSh'], TB['hornLine'], dx=-1, dy=-1, w=2.4)
    # face
    h += ell(124, 82, 6, 3.6, f'fill="{TB["cheek"]}" opacity=".9"')
    h += ell(150, 74, 1.6, 2.2, f'fill="{TB["line"]}" opacity=".8"')
    if hop:
        h += path('M124,69 Q129,62 134,69', st('#2F2A3A', 3))      # ^ happy eye
        h += path('M134,84 Q144,82 152,82 Q150,94 140,94 Q134,92 134,84 Z', fl(TB['mouth'], TB['line'], 2.2))
        h += ell(142, 90, 4, 2.2, f'fill="{TB["tongue"]}"')
    else:
        h += ell(129, 68, 4.6, 5.4, 'fill="#2F2A3A"') + circ(127.4, 66, 1.9, 'fill="#FFFFFF"') + circ(130.6, 70.4, 0.8,
                                                                                                    'fill="#FFFFFF"')
        h += path('M136,85 Q143,89 150,84', st(TB['line'], 2.4))
    if hop:
        o += f'<g transform="translate(0,{dy}) rotate(-8 112 80)">{h}</g>'
        # little joy marks + motion ticks under the feet
        o += path('M58,108 L54,113 M84,109 L84,114 M108,108 L112,113', st(TB['line'], 2.4) + ' opacity=".55"')
        o += path('M150,40 Q156,44 156,52 M156,30 Q166,36 166,48', st(TB['line'], 2.6) + ' opacity=".65"')
    else:
        o += h
    return svg(160, 120, o, ''.join(d.defs))


# ======================================================================= BIRD (faces LEFT) — unchanged design
BD = {'back': '#A9B4C2', 'sh': '#8E9AAB', 'line': '#5D6878', 'belly': '#F3E7D3', 'bellySh': '#E2D2B8', 'wing': '#97A3B4',
      'wingBar': '#76839A', 'cap': '#8995A8'}


def bird(sing=False):
    d = Doc('b')
    o = ''
    o += d.shaded('<path d="M84,62 L110,40 C114,44 114,50 110,54 L92,74 Z" {a}/>', BD['wing'], BD['wingBar'], BD['line'],
                  dx=-3, dy=-3, w=3.2)
    for x in (54, 66):
        o += path(f'M{x},84 L{x},94', st(P['brassD'], 3.2))
        o += path(f'M{x - 6},95 L{x + 4},95 M{x},95 L{x - 3},91', st(P['brassD'], 3))
    bt = '<ellipse cx="64" cy="64" rx="30" ry="25" {a}/>'
    o += d.shaded(bt, BD['back'], BD['sh'], BD['line'], dx=-5, dy=-5, w=3.6)
    o += path('M40,70 C46,88 74,94 88,78 C80,86 54,86 40,70 Z', f'fill="{BD["bellySh"]}"')
    o += ell(56, 72, 20, 14, f'fill="{BD["belly"]}"')
    h = ''
    h += d.shaded('<circle cx="44" cy="44" r="20" {a}/>', BD['back'], BD['sh'], BD['line'], dx=-4, dy=-4, w=3.6,
                  hi=ell(38, 32, 7, 4, 'fill="#FFFFFF" opacity=".4" transform="rotate(-30 38 32)"'))
    h += path('M30,52 C34,62 48,64 56,56 C50,60 38,60 30,52 Z', f'fill="{BD["belly"]}"')
    if sing:
        h += path('M27,40 L12,34 L28,46 Z', fl(P['brass'], P['brassD'], 2.2))
        h += path('M28,48 L13,52 L27,52 Z', fl(P['brass'], P['brassD'], 2.2))
        h += path('M27,44 L18,44 L28,49 Z', 'fill="#B5615A"')
        h += path('M38,40 Q42,35 47,40', st('#2F2A3A', 2.8))
    else:
        h += path('M27,42 L14,46 L27,51 Z', fl(P['brass'], P['brassD'], 2.2))
        h += circ(39, 42, 5, 'fill="#2F2A3A"') + circ(37.6, 40.4, 1.9, 'fill="#FFFFFF"') + circ(41, 44, 0.8, 'fill="#FFFFFF"')
    h += ell(42, 53, 4.4, 2.8, 'fill="#F2A99A" opacity=".85"')
    if sing:
        h = f'<g transform="rotate(14 54 58)">{h}</g>'
    o += h
    o += d.shaded('<path d="M58,60 C66,50 86,52 92,62 C94,72 84,82 70,80 C62,78 56,70 58,60 Z" {a}/>', BD['wing'], BD['wingBar'],
                  BD['line'], dx=-3, dy=-3, w=3.2)
    o += path('M66,66 C72,70 80,70 86,66 M68,73 C74,76 80,76 84,73', st(BD['wingBar'], 2.4))
    if sing:
        o += path('M8,24 Q2,32 6,42 M16,14 Q6,26 10,38', st(BD['line'], 2.6) + ' opacity=".75"')
    return svg(120, 100, o, ''.join(d.defs))


# ======================================================================= ICON
def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD0F4"/>'
                  f'<stop offset=".5" stop-color="#D4EFF8"/><stop offset=".78" stop-color="#FFE7C8"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # soft sun
    o += circ(96, 92, 58, 'fill="#FFF3C4" opacity=".55"') + circ(96, 92, 38, fl('#FFE58A', '#F2C65A', 4))
    # far volcano with a thin plume + misty hills
    o += path('M250,360 L340,206 Q352,190 366,190 L384,190 Q398,190 408,206 L512,330 L512,360 Z', fl('#B4B6D6', '#9698C0', 4))
    o += path('M342,204 Q376,214 406,204 L400,196 Q376,204 348,196 Z', 'fill="#F4B48C" opacity=".8"')
    o += path('M372,184 Q360,160 378,140 Q396,120 384,96', st('#FFFFFF', 12) + ' opacity=".6"')
    o += path('M0,330 Q90,268 190,300 Q280,326 360,290 Q440,258 512,292 L512,400 L0,400 Z', fl('#A9CFA0', '#8DB585', 4))
    o += path('M0,372 Q120,330 250,356 Q380,382 512,346 L512,430 L0,430 Z', fl('#93C487', '#76A86E', 4))
    # meadow
    o += path('M0,408 Q256,384 512,404 L512,512 L0,512 Z', fl('#8FC777', '#6FA85C', 4.4))
    o += path('M0,430 Q256,410 512,428 L512,512 L0,512 Z', 'fill="#7EB868"')
    # ferns at the edges
    for (x, y, s, fl_) in ((30, 470, 1.1, 1), (488, 476, 1.0, -1)):
        for i in range(5):
            a = -90 + (i - 2) * 26
            ex_, ey_ = x + math.cos(math.radians(a)) * 70 * s, y + math.sin(math.radians(a)) * 70 * s
            o += path(f'M{f(x)},{f(y)} Q{f(x + (ex_ - x) * 0.4 + 10 * fl_)},{f(y + (ey_ - y) * 0.7)} {f(ex_)},{f(ey_)}',
                      st('#4F8F48', 10)) + path(f'M{f(x)},{f(y)} Q{f(x + (ex_ - x) * 0.4 + 10 * fl_)},{f(y + (ey_ - y) * 0.7)} '
                                                f'{f(ex_)},{f(ey_)}', st('#6FB25E', 5))
    # the big egg in its straw ring (right)
    ecx, ebot = 376, 456
    o += ell(ecx, ebot + 6, 96, 14, 'fill="#3E6A34" opacity=".25"')
    o += ell(ecx, ebot - 6, 84, 20, fl('#A88443', '#7E6230', 4))       # back half of the ring
    o += egg(d, ecx, ebot, 158, 214)
    ring = f'M{ecx - 92},{ebot - 10} Q{ecx},{ebot + 40} {ecx + 92},{ebot - 10} Q{ecx + 96},{ebot + 12} {ecx},{ebot + 24} ' \
           f'Q{ecx - 96},{ebot + 12} {ecx - 92},{ebot - 10} Z'
    o += d.shp(ring, '#E3C27E', '#C9A25E', '#A88443', dx=-4, dy=-4, w=4)
    for i in range(7):
        x = ecx - 72 + i * 24
        o += path(f'M{x},{ebot + 4 + abs(i - 3) * -1.5} q8,6 16,0', st('#F5E2B0', 3.4))
    # sound rings round the singing egg (top right)
    for k, r in enumerate((104, 124)):
        dd = f'M{f(ecx + r * 0.62)},{f(ebot - 214 + 40 - r * 0.5)} A{r},{r} 0 0 1 {f(ecx + r * 0.95)},{f(ebot - 120 + k * 6)}'
        o += path(dd, st('#FFFFFF', 10) + ' opacity=".85"') + path(dd, st('#F2C65A', 4.4))
    # Rio (singing), scaled up, sitting on the meadow on the left
    sc = 1.22
    tx, ty = 138 - 150 * sc, 470 - 292 * sc
    kd = Doc('ik')
    kb, info = rio(kd, 'icon')
    d.defs.extend(kd.defs)
    o += ell(138, 470, 118, 11, 'fill="#3E6A34" opacity=".25"')
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{kb}</g>'
    mx, my = tx + info['mouth'][0] * sc, ty + info['mouth'][1] * sc
    # music notes flowing from his mouth to the egg
    o += path(f'M{f(mx + 18)},{f(my - 6)} Q{f(mx + 60)},{f(my - 70)} {f(ecx - 70)},{f(my - 92)}',
              st('#FFFFFF', 4) + ' opacity=".8" stroke-dasharray="2 12"')
    o += note(mx + 56, my - 6, 26, '#FFE08A', '#B98A2E')
    o += note(mx + 70, my - 108, 30, '#F7A8C6', '#B5577E', double=True)
    o += note(ecx - 34, my - 150, 24, '#B9E3F7', '#4C86AE')
    o += star4(ecx + 70, ebot - 232, 15, w=2.6) + star4(mx + 6, my - 96, 10, w=2.2) + star4(ecx - 96, ebot - 40, 9, w=2)
    return svg(512, 512, o, ''.join(d.defs))


def main():
    tbl = write_rio()
    write('characters/lamb.svg', trike(False))
    write('characters/lamb_ball.svg', trike(True))
    write('characters/bird.svg', bird(False))
    write('characters/bird_sing.svg', bird(True))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:10s} mouth {v["mouth"]} hand {v["hand"]} head {v["headTop"]}')


if __name__ == '__main__':
    main()
