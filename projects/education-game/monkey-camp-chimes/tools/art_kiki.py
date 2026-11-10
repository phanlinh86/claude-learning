#!/usr/bin/env python3
"""Character art generator for Kiki's Camp Chimes (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/kiki_{idle,blink,talk,happy,cheer,think,oops,wave,point,dance}.svg + kiki_full_wave.svg
        0 0 300 300, FEET ANCHOR (150,292). Kiki (a small round chestnut monkey with a heart-shaped cream face, a curl of
        hair on top, a long curly tail and a cream polka-dot camp bandana) faces RIGHT in 3/4 view, eyes on the viewer.
        Head, body, belly, bandana and ears are identical in every frame; only eyes, mouth, brows, arms, (think / oops) a
        small head tilt and (dance) the near leg + tail swirl change.
        docs/art/kiki_hand.json gives per frame the near hand tip, the far hand, the head top and the near eye.
  characters/hedgehog.svg, hedgehog_ball.svg   0 0 160 120, bottom anchor (80,116), facing right
  characters/bird.svg, bird_sing.svg           0 0 120 100, feet anchor (60,96), facing LEFT
  icon.svg                                     0 0 512 512, full bleed, opaque, no text

Usage: python3 tools/art_kiki.py [outDir]
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
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'kiki_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Kiki palette (DESIGN.md section 3) — never an answer colour
    'fur': '#8A5A3B', 'sh': '#6F4630', 'line': '#4E2F1F', 'farFur': '#7A4E33', 'farSh': '#5F3B28',
    'face': '#F2D9B8', 'faceSh': '#DDBF98', 'faceLine': '#9C6E4A',
    'cheek': '#F2A99A', 'pupil': '#2F2A3A', 'white': '#FFFFFF', 'mouth': '#6E2C25', 'tongue': '#EE8F84',
    'nose': '#5A3424',
    'band': '#F1E6CF', 'bandSh': '#DDCCAA', 'dot': '#A27B55', 'bandLine': '#8A6A4A',
    'brass': '#D8B26A', 'brassD': '#9C7838', 'brassL': '#F3DFAE',
}


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


def tube(d, wout, col_line, col_fill, lw=LW):
    """A round-capped tube along path d: outline stroke underneath, fill stroke on top."""
    return path(d, st(col_line, wout)) + path(d, st(col_fill, wout - 2 * lw))


def star4(x, y, s, fill='#FFF6C8', line='#E2C86A', w=1.6):
    return path(f'M{f(x)},{f(y - s)} L{f(x + s * 0.3)},{f(y - s * 0.3)} L{f(x + s)},{f(y)} L{f(x + s * 0.3)},{f(y + s * 0.3)} '
                f'L{f(x)},{f(y + s)} L{f(x - s * 0.3)},{f(y + s * 0.3)} L{f(x - s)},{f(y)} L{f(x - s * 0.3)},{f(y - s * 0.3)} Z',
                f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')


# ======================================================================= KIKI
HEAD = (150, 130, 72, 66)          # x 78-222, y 64-196
NECK = (152, 204)                  # tilt pivot
BODY = (146, 242, 45, 41)          # x 101-191, y 201-283
BELLY = (158, 248, 27, 25)
EYE_N = (144, 128, 16)             # near eye (viewer's left, bigger)
EYE_F = (190, 124, 13)             # far eye (towards the chimes)
NOSE = (186, 152)
MOUTH = (180, 170)
SH_F = (118, 214)                  # far shoulder (behind the body)
SH_N = (178, 214)                  # near shoulder (in front)
ARM_W = 21                         # arm tube outer width
HAND_R = 11
TUFT_TOP = 38

# heart-shaped face mask (two lobes round the eyes, point at the chin), shifted right: 3/4 view facing right
FACE = [(167, 106), (180, 96), (199, 95), (214, 107), (219, 128), (215, 150), (206, 172), (188, 189), (170, 193),
        (148, 185), (128, 168), (118, 146), (119, 120), (130, 101), (150, 96)]

# arm centre lines (shoulder → elbow → hand centre) per pose; 'fist' = closed hand, 'open' = waving palm, 'point' = finger
ARMS = {
    #            far arm                                   near arm                                    near hand
    'idle':  ([SH_F, (106, 236), (110, 258)],             [SH_N, (194, 236), (192, 258)],             'fist'),
    'talk':  ([SH_F, (106, 236), (110, 258)],             [SH_N, (204, 236), (224, 222)],             'open'),
    'happy': ([SH_F, (96, 234), (82, 222)],               [SH_N, (206, 234), (224, 218)],             'open'),
    'cheer': ([SH_F, (84, 204), (54, 172)],               [SH_N, (212, 186), (230, 150)],             'open'),
    'think': ([SH_F, (106, 236), (110, 258)],             [SH_N, (214, 226), (204, 196)],             'fist'),
    'oops':  ([SH_F, (104, 238), (108, 258)],             [SH_N, (222, 196), (226, 146)],             'fist'),
    'wave':  ([SH_F, (106, 236), (110, 258)],             [SH_N, (222, 196), (240, 146)],             'open'),
    'point': ([SH_F, (106, 236), (110, 258)],             [SH_N, (214, 200), (246, 178)],             'point'),
    'dance': ([SH_F, (88, 210), (60, 200)],               [SH_N, (214, 200), (246, 186)],             'open'),
    'full_wave': ([SH_F, (82, 200), (46, 168)],           [SH_N, (204, 238), (220, 226)],             'fist'),
    'ring':  ([SH_F, (106, 236), (110, 258)],             [SH_N, (230, 192), (262, 142)],             'open'),
}
ARMS['blink'] = ARMS['idle']

POSES = {
    #             eyes      mouth     tilt brows    look      far hand
    'idle':      ('open',   'smile',  0,   None,    (0, 2),   'fist'),
    'blink':     ('closed', 'smile',  0,   None,    (0, 2),   'fist'),
    'talk':      ('open',   'talk',   0,   None,    (0, 2),   'fist'),
    'happy':     ('wide',   'big',    0,   None,    (0, 1),   'open'),
    'cheer':     ('happy',  'big',    0,   None,    (0, 0),   'open'),
    'think':     ('look',   'hmm',    7,   (0, 6),  (4, -5),  'fist'),
    'oops':      ('wide',   'o',     -6,   (7, 0),  (-1, 1),  'fist'),
    'wave':      ('open',   'big',    0,   None,    (0, 2),   'fist'),
    'point':     ('look',   'talk',   0,   (4, 4),  (5, -3),  'fist'),
    'dance':     ('happy',  'big',    0,   None,    (0, 0),   'open'),
    'full_wave': ('wide',   'big',    0,   None,    (0, 2),   'open'),
}


def eye(cx, cy, r, mode='open', look=(0, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.08 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.9, rr, fl(P['white'], P['line'], 3.2))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.72 if mode == 'wide' else 0.68)
        o += ell(px, py, pr * 0.9, pr, f'fill="{P["pupil"]}"')
        o += circ(px - pr * 0.3, py - pr * 0.4, pr * 0.44, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.4, py + pr * 0.42, pr * 0.18, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.8)},{f(cy)} Q{f(cx)},{f(cy + r * 0.62)} {f(cx + r * 0.8)},{f(cy)}', st(P['pupil'], 4.6))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.8)},{f(cy + r * 0.32)} Q{f(cx)},{f(cy - r * 0.9)} {f(cx + r * 0.8)},{f(cy + r * 0.32)}',
                  st(P['pupil'], 5.2))
    return o


def mouth(mode):
    mx, my = MOUTH
    line = P['line']
    if mode == 'closed':
        return path(f'M{mx - 9},{my - 2} Q{mx - 1},{my + 6} {mx + 9},{my - 3}', st(line, 3.6))
    if mode == 'smile':
        return path(f'M{mx - 12},{my - 4} Q{mx - 1},{my + 8} {mx + 11},{my - 5}', st(line, 3.8))
    if mode == 'talk':
        o = path(f'M{mx - 10},{my - 4} Q{mx},{my - 5} {mx + 10},{my - 5} Q{mx + 10},{my + 11} {mx},{my + 12} '
                 f'Q{mx - 10},{my + 10} {mx - 10},{my - 4} Z', fl(P['mouth'], line, 3.2))
        o += ell(mx, my + 7.5, 6, 3.4, f'fill="{P["tongue"]}"')
        return o
    if mode == 'big':
        w, h = 15, 15
        o = path(f'M{f(mx - w)},{f(my - 5)} Q{mx},{f(my - 1)} {f(mx + w)},{f(my - 7)} '
                 f'Q{f(mx + w * 0.8)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.8)},{f(my + h)} {f(mx - w)},{f(my - 5)} Z',
                 fl(P['mouth'], line, 3.2))
        o += ell(mx, my + h - 5, 8, 4, f'fill="{P["tongue"]}"')
        return o
    if mode == 'o':
        return ell(mx + 1, my + 3, 5.5, 6.5, fl(P['mouth'], line, 3))
    if mode == 'hmm':
        return path(f'M{mx - 10},{my + 2} Q{mx - 5},{my - 3} {mx},{my + 1} Q{mx + 5},{my + 5} {mx + 10},{my}', st(line, 3.6))
    return ''


def ears(doc):
    """Big round monkey ears: the near one sticks out on the viewer's left, the far one peeks out behind the head."""
    o = doc.shaded('<circle cx="224" cy="116" r="19" {a}/>', P['farFur'], P['farSh'], P['line'], dx=-5, dy=-5)
    o += circ(226, 117, 10.5, f'fill="{P["faceSh"]}"')
    o += doc.shaded('<circle cx="78" cy="130" r="27" {a}/>', P['fur'], P['sh'], P['line'], dx=-6, dy=-6)
    o += circ(80, 132, 16.5, f'fill="{P["face"]}"')
    o += path('M74,124 Q70,134 78,142', st(P['faceSh'], 3.4))
    return o


def head(doc, pose):
    eyes, mo, tilt, brows, look, _ = POSES[pose]
    hx, hy, hrx, hry = HEAD
    o = ears(doc)
    # hair curl on top (a single spring-like curl, Kiki's mark)
    curl = 'M140,70 C134,56 140,42 154,40 C166,39 172,50 166,58 C161,64 152,60 156,53'
    o += tube(curl, 13, P['line'], P['fur'], 4.2)
    hi = ell(110, 104, 12, 6.5, 'fill="#FFFFFF" opacity=".28" transform="rotate(-42 110 104)"')
    tpl = f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>'
    o += doc.shaded(tpl, P['fur'], P['sh'], P['line'], dx=-12, dy=-10, hi=hi)
    # two little fur flicks on the forehead
    o += path('M134,78 Q142,70 150,74 M152,72 Q160,64 168,70', st(P['sh'], 3.2))
    # heart face
    fd = ptsd(FACE)
    o += doc.shaded(f'<path d="{fd}" {{a}}/>', P['face'], P['faceSh'], P['faceLine'], dx=-7, dy=-7, w=3)
    # cheeks
    o += ell(132, 158, 12, 7.5, f'fill="{P["cheek"]}" opacity=".85"')
    o += ell(209, 154, 6.5, 5.5, f'fill="{P["cheek"]}" opacity=".85"')
    # nose (small soft oval with a shine) + philtrum
    nx, ny = NOSE
    o += ell(nx, ny, 7, 4.6, f'fill="{P["nose"]}"') + ell(nx - 2, ny - 1.6, 2.4, 1.3, 'fill="#FFFFFF" opacity=".55"')
    o += path(f'M{nx - 2},{ny + 4} Q{nx - 4},{ny + 10} {MOUTH[0]},{MOUTH[1] - 4}', st(P['faceLine'], 2.2))
    o += mouth(mo)
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if eyes in ('open', 'wide', 'look'):  # two tiny lashes at the outer corner of the near eye
        x, y, r = EYE_N
        o += path(f'M{f(x - r * 0.8)},{f(y - r * 0.56)} L{f(x - r * 1.16)},{f(y - r * 0.8)} '
                  f'M{f(x - r * 0.88)},{f(y - r * 0.2)} L{f(x - r * 1.26)},{f(y - r * 0.28)}', st(P['line'], 2.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 7 - lift
            o += path(f'M{f(cx - 7)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 7)},{f(y + 3)}', st(P['line'], 3.4))
    if tilt:
        o = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{o}</g>'
    return o


def arm(pts, kind, far=False):
    """Arm tube through pts (shoulder → elbow → hand centre) + hand. Returns svg and the hand tip point."""
    d = ptsd(pts, close=False)
    fur = P['farFur'] if far else P['fur']
    o = tube(d, ARM_W, P['line'], fur)
    hx, hy = pts[-1]
    ex, ey = pts[-2]
    ln = math.hypot(hx - ex, hy - ey) or 1
    tx, ty = (hx - ex) / ln, (hy - ey) / ln
    palm = P['faceSh'] if far else P['face']
    tip = (hx + tx * HAND_R, hy + ty * HAND_R)
    if kind == 'point':
        fx, fy = hx + tx * 21, hy + ty * 21
        o += path(f'M{f(hx)},{f(hy)} L{f(fx)},{f(fy)}', st(P['line'], 12)) + path(f'M{f(hx)},{f(hy)} L{f(fx)},{f(fy)}', st(palm, 4.2))
        o += circ(hx, hy, HAND_R, fl(palm, P['line'], 3.6))
        # curled fingers line
        o += path(f'M{f(hx - ty * 6 + tx * 2)},{f(hy + tx * 6 + ty * 2)} Q{f(hx + tx * 6)},{f(hy + ty * 6)} '
                  f'{f(hx + ty * 6 + tx * 2)},{f(hy - tx * 6 + ty * 2)}', st(P['faceLine'], 2.2))
        tip = (fx + tx * 3, fy + ty * 3)
    elif kind == 'open':
        # palm with three little finger bumps fanned along the arm direction + a thumb
        for a in (-38, 0, 38):
            c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
            dx, dy = tx * c - ty * s, tx * s + ty * c
            o += circ(hx + dx * 10.5, hy + dy * 10.5, 5.2, fl(palm, P['line'], 3))
        o += circ(hx, hy, HAND_R + 0.5, fl(palm, P['line'], 3.6))
        o += circ(hx, hy, HAND_R - 2.4, f'fill="{palm}"')
        tip = (hx + tx * 16, hy + ty * 16)
    else:
        o += circ(hx, hy, HAND_R, fl(palm, P['line'], 3.6))
        o += path(f'M{f(hx - ty * 5 + tx * 3)},{f(hy + tx * 5 + ty * 3)} Q{f(hx + tx * 7)},{f(hy + ty * 7)} '
                  f'{f(hx + ty * 5 + tx * 3)},{f(hy - tx * 5 + ty * 3)}', st(P['faceLine'], 2.2))
    return o, tip


TAILS = {
    'rest':  [(104, 256), (74, 266), (48, 252), (40, 222), (50, 196), (72, 188), (86, 202), (78, 216), (66, 210)],
    'swirl': [(104, 254), (70, 252), (44, 228), (42, 196), (58, 172), (82, 168), (94, 184), (86, 198), (74, 192)],
}


def tail(kind):
    d = ptsd(TAILS[kind], close=False)
    return tube(d, 15, P['line'], P['fur']) + path(d, st('#FFFFFF', 2.2) + ' opacity=".18" transform="translate(-2,-2)"')


def legs(doc, dance=False):
    """Returns (far leg, near leg) svg. Feet are soft cream ovals pointing right; the far leg sits behind the body."""
    far = tube('M126,266 L122,280', 22, P['line'], P['farFur'])
    far += ell(124, 284, 17, 7.6, fl(P['faceSh'], P['line'], 3.6))
    if dance:   # near knee up, foot kicked forward (in front of the body)
        thigh = ''
        near = tube('M166,262 Q192,266 204,250', 23, P['line'], P['fur'])
        near += ell(210, 245, 9, 15, fl(P['face'], P['line'], 3.6) + ' transform="rotate(-24 210 245)"')
    else:       # thigh hidden behind the round body, only the foot peeks out in front
        thigh = tube('M166,262 L170,280', 23, P['line'], P['fur'])
        near = ell(176, 284, 21, 7.8, fl(P['face'], P['line'], 3.6))
        near += path('M188,281 L190,287 M181,280 L182,287', st(P['faceLine'], 2))
    return far + thigh, near


def bandana(doc):
    band = 'M104,200 C128,214 172,216 196,198 C200,204 201,212 197,218 C172,236 126,234 101,216 C98,210 99,204 104,200 Z'
    knot = 'M148,216 C162,220 178,218 190,212 C190,228 180,244 168,252 C160,240 152,228 148,216 Z'
    o = ''
    for shape in (band, knot):
        cid = doc.clip(f'<path d="{shape}"/>')
        o += path(shape, f'fill="{P["band"]}"')
        o += f'<g clip-path="url(#{cid})">'
        o += path('M96,222 C126,240 176,240 204,214 L204,260 L96,260 Z', f'fill="{P["bandSh"]}"')
        for (x, y) in ((112, 210), (128, 220), (146, 214), (164, 222), (182, 214), (194, 206), (120, 202), (156, 206),
                       (172, 232), (160, 240), (178, 222)):
            o += circ(x, y, 3.9, f'fill="{P["dot"]}"')
        o += '</g>'
        o += path(shape, f'fill="none" stroke="{P["bandLine"]}" stroke-width="{f(LW * 0.8)}" stroke-linejoin="round"')
    return o


def body(doc):
    bx, by, brx, bry = BODY
    tpl = f'<ellipse cx="{bx}" cy="{by}" rx="{brx}" ry="{bry}" {{a}}/>'
    hi = ell(116, 228, 9, 5.5, 'fill="#FFFFFF" opacity=".24" transform="rotate(-36 116 228)"')
    o = doc.shaded(tpl, P['fur'], P['sh'], P['line'], dx=-11, dy=-9, hi=hi)
    px, py, prx, pry = BELLY
    o += doc.shaded(f'<ellipse cx="{px}" cy="{py}" rx="{prx}" ry="{pry}" {{a}}/>', P['face'], P['faceSh'], P['faceSh'],
                    dx=-5, dy=-5, w=0.1)
    return o


def small_bell(doc, cx, top, h, base, dark, light, line=None, clap=0, tilt=0):
    """A classic camp bell (dome + flared lip) hanging from (cx, top) with a crown loop; used by the title pose + icon."""
    line = line or dark
    w = h * 0.86
    y0 = top + h * 0.12
    yl = top + h * 0.86
    d = (f'M{f(cx - w * 0.28)},{f(y0 + h * 0.06)} C{f(cx - w * 0.3)},{f(y0 - h * 0.08)} {f(cx + w * 0.3)},{f(y0 - h * 0.08)} '
         f'{f(cx + w * 0.28)},{f(y0 + h * 0.06)} C{f(cx + w * 0.36)},{f(y0 + h * 0.3)} {f(cx + w * 0.32)},{f(yl - h * 0.14)} '
         f'{f(cx + w * 0.5)},{f(yl)} C{f(cx + w * 0.3)},{f(yl + h * 0.08)} {f(cx - w * 0.3)},{f(yl + h * 0.08)} {f(cx - w * 0.5)},{f(yl)} '
         f'C{f(cx - w * 0.32)},{f(yl - h * 0.14)} {f(cx - w * 0.36)},{f(y0 + h * 0.3)} {f(cx - w * 0.28)},{f(y0 + h * 0.06)} Z')
    o = ''
    o += circ(cx, top + h * 0.06, h * 0.07, f'fill="none" stroke="{P["brassD"]}" stroke-width="{f(max(2, h * 0.045))}"')
    o += circ(cx + clap, yl + h * 0.06, h * 0.085, fl(P['brass'], P['brassD'], max(1.6, h * 0.03)))
    hi = path(f'M{f(cx - w * 0.16)},{f(y0 + h * 0.08)} C{f(cx - w * 0.24)},{f(y0 + h * 0.3)} {f(cx - w * 0.24)},{f(yl - h * 0.24)} '
              f'{f(cx - w * 0.3)},{f(yl - h * 0.08)}', st(light, max(2.4, h * 0.06)) + ' opacity=".85"')
    o += doc.shaded(f'<path d="{d}" {{a}}/>', base, dark, line, dx=-w * 0.12, dy=-h * 0.04, w=max(2.4, h * 0.045), hi=hi)
    o += path(f'M{f(cx - w * 0.47)},{f(yl - h * 0.02)} C{f(cx - w * 0.2)},{f(yl + h * 0.05)} {f(cx + w * 0.2)},{f(yl + h * 0.05)} '
              f'{f(cx + w * 0.47)},{f(yl - h * 0.02)}', st(line, max(1.8, h * 0.03)) + ' opacity=".6"')
    if tilt:
        o = f'<g transform="rotate({f(tilt)} {f(cx)} {f(top)})">{o}</g>'
    return o


def kiki(doc, pose, arms_pose=None):
    eyes, mo, tilt, brows, look, far_kind = POSES[pose]
    aF, aN, near_kind = ARMS[arms_pose or pose]
    dance = pose == 'dance'
    o = tail('swirl' if dance else 'rest')
    far_arm, far_tip = arm(aF, far_kind, far=True)
    far_leg, near_leg = legs(doc, dance)
    o += far_leg
    o += far_arm
    o += body(doc)
    o += near_leg
    o += bandana(doc)
    o += head(doc, pose)
    near_arm, near_tip = arm(aN, near_kind)
    # pose extras (drawn in the line colour, soft)
    soft = st(P['line'], 3.6) + ' opacity=".75"'
    ex = ''
    if pose in ('wave', 'full_wave'):
        hx, hy = aN[-1] if pose == 'wave' else aF[-1]
        sgn = 1 if pose == 'wave' else -0.6
        ex += path(f'M{f(hx + sgn * 22)},{f(hy - 16)} Q{f(hx + sgn * 32)},{f(hy - 4)} {f(hx + sgn * 30)},{f(hy + 12)} '
                  f'M{f(hx + sgn * 30)},{f(hy - 30)} Q{f(hx + sgn * 46)},{f(hy - 12)} {f(hx + sgn * 42)},{f(hy + 10)}', soft)
    if pose == 'cheer':
        for (x, y, r) in ((40, 120, 5), (262, 112, 5), (30, 92, 3.4), (276, 86, 3.4)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'dance':
        ex += path('M262,170 Q276,180 276,196 M226,264 Q238,272 236,284', soft)
        ex += circ(270, 156, 3.6, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'oops':
        ex += path('M244,64 Q244,52 254,52 Q264,52 262,62 Q260,70 252,72 L252,78', st(P['line'], 4) + ' opacity=".8"')
        ex += circ(252, 88, 2.8, f'fill="{P["line"]}" opacity=".8"')
    if pose == 'think':
        for (x, y, r) in ((228, 86, 3.4), (240, 70, 5), (256, 52, 7)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".75"')
    if ex:   # a soft cream halo under the motion marks so they also read on the night sky
        halo = (ex.replace(f'stroke="{P["line"]}"', 'stroke="#FFF4E0"').replace(f'fill="{P["line"]}"', 'fill="#FFF4E0"')
                .replace('stroke-width="2.6"', 'stroke-width="6"').replace('stroke-width="3.6"', 'stroke-width="7"')
                .replace('stroke-width="4"', 'stroke-width="7.4"'))
        o += f'<g opacity=".55">{halo}</g>' + ex
    if pose == 'full_wave':   # a little brass bell on a string held in the near hand
        hx, hy = aN[-1]
        o += path(f'M{f(hx + 2)},{f(hy + 4)} Q{f(hx + 6)},{f(hy + 14)} {f(hx + 4)},{f(hy + 24)}', st(P['bandLine'], 2.6))
        o += small_bell(doc, hx + 4, hy + 22, 34, P['brass'], P['brassD'], P['brassL'], line=P['brassD'], clap=2, tilt=-10)
    o += near_arm
    return o, near_tip, far_tip


def head_top(pose):
    tilt = POSES[pose][2]
    if not tilt:
        return [154, TUFT_TOP]
    x, y = rot(154, TUFT_TOP, tilt, *NECK)
    return [round(x), round(y)]


def write_kiki():
    out = {}
    for pose in POSES:
        d = Doc('k')
        b, tip, ftip = kiki(d, pose)
        write(f'characters/kiki_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
        ex, ey = EYE_N[0], EYE_N[1]
        if POSES[pose][2]:
            ex, ey = rot(ex, ey, POSES[pose][2], *NECK)
        out[pose] = {'hand': [round(tip[0]), round(tip[1])], 'farHand': [round(ftip[0]), round(ftip[1])],
                     'headTop': head_top(pose), 'eye': [round(ex), round(ey)]}
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        json.dump({'_about': ('Kiki per frame, in the 0 0 300 300 viewBox (feet anchor 150,292). hand = tip of the NEAR hand '
                              '(point: the fingertip — aim the hint / sparkle from here; wave: the waving palm top); farHand = '
                              'tip of the far hand; headTop = [x, y] of the hair-curl top (speech-bubble tail / stars over the '
                              'head; the round head itself starts at y 64); eye = near eye centre; bbox = measured opaque box '
                              '(added by tools/kiki_sheet.js).'),
                   **out}, fh, indent=1)
        fh.write('\n')
    return out


# ======================================================================= HEDGEHOG
HG = {'sp': '#9C8B7A', 'spSh': '#80705F', 'spLine': '#5E5043', 'spHi': '#B9AA99', 'face': '#EBD9C0', 'faceSh': '#D6C0A2',
      'faceLine': '#8E7660', 'nose': '#E7B6B0', 'noseLine': '#B07F79', 'feet': '#C9B49A'}


def spikes(cx, cy, rx, ry, a0, a1, n, k):
    """Scalloped spiky outline points along an ellipse arc (angles in degrees, 0 = right, y down)."""
    pts = []
    for i in range(n * 2 + 1):
        a = math.radians(a0 + (a1 - a0) * i / (n * 2))
        r = 1 + (k if i % 2 else 0)
        pts.append((cx + rx * r * math.cos(a), cy + ry * r * math.sin(a)))
    return pts


def poly(pts):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'


def hedgehog(ball=False):
    d = Doc('h')
    o = ''
    if not ball:
        # feet (behind)
        for x in (54, 98):
            o += ell(x, 109.5, 9, 4.6, fl(HG['feet'], HG['faceLine'], 2.6))
        # face + belly (the cream front part, pointed snout to the right)
        face = ptsd([(78, 108), (66, 86), (76, 58), (100, 46), (122, 56), (138, 72), (150, 86), (146, 96), (126, 104),
                     (104, 110)])
        o += d.shaded(f'<path d="{face}" {{a}}/>', HG['face'], HG['faceSh'], HG['faceLine'], dx=-4, dy=-4, w=3.4)
        # spiky back (dome on the left, over the head)
        pts = spikes(70, 76, 56, 42, 112, 300, 12, 0.16)
        pts = [(90, 111)] + [(x, min(y, 111)) for (x, y) in pts] + [(104, 52), (96, 70), (84, 92)]
        back = poly(pts)
        o += d.shaded(f'<path d="{back}" {{a}}/>', HG['sp'], HG['spSh'], HG['spLine'], dx=-5, dy=-5, w=3.6,
                      hi=ell(46, 52, 14, 7, 'fill="#FFFFFF" opacity=".25" transform="rotate(-30 46 52)"'))
        for (x0, y0, x1, y1) in ((40, 70, 30, 60), (54, 60, 46, 48), (68, 56, 64, 42), (36, 92, 24, 88), (52, 84, 42, 76),
                                 (60, 98, 48, 98), (74, 72, 70, 62), (84, 60, 84, 50)):
            o += path(f'M{x0},{y0} L{x1},{y1}', st(HG['spHi'], 2.6))
        # ear
        o += ell(104, 54, 7, 6, fl(HG['face'], HG['faceLine'], 2.6)) + ell(105, 55, 3.4, 3, f'fill="{HG["nose"]}"')
        # eye + cheek + nose + smile
        o += circ(116, 72, 6.2, f'fill="#2F2A3A"') + circ(114, 70, 2.3, 'fill="#FFFFFF"') + circ(118.4, 74.4, 1, 'fill="#FFFFFF"')
        o += ell(118, 86, 6, 3.6, 'fill="#F2A99A" opacity=".85"')
        o += circ(150, 86, 6, fl(HG['nose'], HG['noseLine'], 2.4)) + ell(148.4, 84, 2, 1.3, 'fill="#FFFFFF" opacity=".8"')
        o += path('M136,94 Q140,98 145,95', st(HG['faceLine'], 2.4))
        # tiny front paw
        o += ell(112, 108.5, 7, 4.4, fl(HG['feet'], HG['faceLine'], 2.4))
    else:
        cx, cy, r = 80, 70, 39
        pts = spikes(cx, cy, r, r, -90, 270, 18, 0.13)
        ballp = poly(pts)
        o += ell(80, 113.5, 30, 2.5, 'fill="#5E5043" opacity=".18"')
        o += d.shaded(f'<path d="{ballp}" {{a}}/>', HG['sp'], HG['spSh'], HG['spLine'], dx=-6, dy=-6, w=3.6,
                      hi=ell(64, 50, 13, 7, 'fill="#FFFFFF" opacity=".28" transform="rotate(-35 64 50)"'))
        for a in range(0, 360, 30):
            x0, y0 = cx + 18 * math.cos(math.radians(a)), cy + 18 * math.sin(math.radians(a))
            x1, y1 = cx + 30 * math.cos(math.radians(a + 8)), cy + 30 * math.sin(math.radians(a + 8))
            o += path(f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)}', st(HG['spHi'], 2.4))
        # a little cream face peeking at the front + the nose and a closed happy eye
        o += path('M100,86 Q118,80 122,94 Q116,106 100,104 Z', fl(HG['face'], HG['faceLine'], 2.8))
        o += circ(123, 93, 5, fl(HG['nose'], HG['noseLine'], 2.2))
        o += path('M104,90 Q108,86 112,90', st('#2F2A3A', 2.6))
    return svg(160, 120, o, ''.join(d.defs))


# ======================================================================= BIRD (faces LEFT)
BD = {'back': '#A9B4C2', 'sh': '#8E9AAB', 'line': '#5D6878', 'belly': '#F3E7D3', 'bellySh': '#E2D2B8', 'wing': '#97A3B4',
      'wingBar': '#76839A', 'cap': '#8995A8'}


def bird(sing=False):
    d = Doc('b')
    o = ''
    # tail (up-right, behind)
    o += d.shaded('<path d="M84,62 L110,40 C114,44 114,50 110,54 L92,74 Z" {a}/>', BD['wing'], BD['wingBar'], BD['line'],
                  dx=-3, dy=-3, w=3.2)
    # legs + toes (brass)
    for x in (54, 66):
        o += path(f'M{x},84 L{x},94', st(P['brassD'], 3.2))
        o += path(f'M{x - 6},95 L{x + 4},95 M{x},95 L{x - 3},91', st(P['brassD'], 3))
    # body (round)
    bt = '<ellipse cx="64" cy="64" rx="30" ry="25" {a}/>'
    o += d.shaded(bt, BD['back'], BD['sh'], BD['line'], dx=-5, dy=-5, w=3.6)
    o += path('M40,70 C46,88 74,94 88,78 C80,86 54,86 40,70 Z', f'fill="{BD["bellySh"]}"')
    o += ell(56, 72, 20, 14, f'fill="{BD["belly"]}"')
    # head (overlaps the body front-left); sing: tilted up
    h = ''
    h += d.shaded('<circle cx="44" cy="44" r="20" {a}/>', BD['back'], BD['sh'], BD['line'], dx=-4, dy=-4, w=3.6,
                  hi=ell(38, 32, 7, 4, 'fill="#FFFFFF" opacity=".4" transform="rotate(-30 38 32)"'))
    h += path('M30,52 C34,62 48,64 56,56 C50,60 38,60 30,52 Z', f'fill="{BD["belly"]}"')
    if sing:   # open beak (two brass triangles)
        h += path('M27,40 L12,34 L28,46 Z', fl(P['brass'], P['brassD'], 2.2))
        h += path('M28,48 L13,52 L27,52 Z', fl(P['brass'], P['brassD'], 2.2))
        h += path('M27,44 L18,44 L28,49 Z', 'fill="#B5615A"')
        h += path('M38,40 Q42,35 47,40', st('#2F2A3A', 2.8))   # happy closed eye
    else:
        h += path('M27,42 L14,46 L27,51 Z', fl(P['brass'], P['brassD'], 2.2))
        h += circ(39, 42, 5, 'fill="#2F2A3A"') + circ(37.6, 40.4, 1.9, 'fill="#FFFFFF"') + circ(41, 44, 0.8, 'fill="#FFFFFF"')
    h += ell(42, 53, 4.4, 2.8, 'fill="#F2A99A" opacity=".85"')
    if sing:
        h = f'<g transform="rotate(14 54 58)">{h}</g>'
    o += h
    # wing
    o += d.shaded('<path d="M58,60 C66,50 86,52 92,62 C94,72 84,82 70,80 C62,78 56,70 58,60 Z" {a}/>', BD['wing'], BD['wingBar'],
                  BD['line'], dx=-3, dy=-3, w=3.2)
    o += path('M66,66 C72,70 80,70 86,66 M68,73 C74,76 80,76 84,73', st(BD['wingBar'], 2.4))
    if sing:   # two tiny curved song lines in front of the open beak
        o += path('M8,24 Q2,32 6,42 M16,14 Q6,26 10,38', st(BD['line'], 2.6) + ' opacity=".75"')
    return svg(120, 100, o, ''.join(d.defs))


# ======================================================================= ICON
def plate_star(doc, cx, cy, r, base, dark, light):
    pts = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        rr = r if i % 2 == 0 else r * 0.48
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    dd = poly(pts)
    return doc.shaded(f'<path d="{dd}" {{a}}/>', base, dark, dark, dx=-r * 0.1, dy=-r * 0.1, w=4,
                      hi=ell(cx - r * 0.25, cy - r * 0.25, r * 0.16, r * 0.08, f'fill="{light}" transform="rotate(-40 {f(cx - r * 0.25)} {f(cy - r * 0.25)})"'))


def log(doc, x0, y0, x1, y1, r):
    """A horizontal or vertical log (wood palette) with bark lines and a cut end ring on the ends."""
    horiz = abs(y1 - y0) < abs(x1 - x0)
    if horiz:
        tpl = rect(x0, y0 - r, x1 - x0, 2 * r, r, '{a}')
    else:
        tpl = rect(x0 - r, y0, 2 * r, y1 - y0, r * 0.6, '{a}')
    o = doc.shaded(tpl, '#A87245', '#8A5A35', '#6E4526', dx=-3, dy=-r * 0.35, w=4.4,
                   hi=None)
    if horiz:
        o += path(f'M{f(x0 + r)},{f(y0 - r * 0.45)} L{f(x1 - r)},{f(y0 - r * 0.45)}', st('#D29A66', 3) + ' opacity=".8"')
        for x in range(int(x0) + 40, int(x1) - 20, 54):
            o += path(f'M{x},{f(y0 - 2)} Q{x + 16},{f(y0 + 4)} {x + 30},{f(y0 + 1)}', st('#6E4526', 2.6) + ' opacity=".6"')
        for x in (x0 + r * 0.6, x1 - r * 0.6):
            o += ell(x, y0, r * 0.5, r * 0.85, fl('#D29A66', '#6E4526', 3)) + ell(x, y0, r * 0.2, r * 0.38, 'fill="none" stroke="#A87245" stroke-width="2"')
    else:
        o += path(f'M{f(x0 - r * 0.4)},{f(y0 + 10)} L{f(x0 - r * 0.4)},{f(y1)}', st('#D29A66', 3) + ' opacity=".7"')
        for y in range(int(y0) + 40, int(y1), 46):
            o += path(f'M{f(x0 - 4)},{y} Q{f(x0 + 2)},{y + 16} {f(x0 - 2)},{y + 30}', st('#6E4526', 2.6) + ' opacity=".55"')
    return o


def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9729A"/>'
                  f'<stop offset=".38" stop-color="#F29B6B"/><stop offset=".72" stop-color="#FBD7A5"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # low sun on the right + soft rays
    o += circ(424, 318, 62, 'fill="#FFE2A6" opacity=".55"') + circ(424, 318, 44, 'fill="#FFF0C4"')
    # mountains with snowy caps (desaturated, violet-rose)
    o += path('M0,350 L0,290 L60,236 L104,270 L170,196 L238,268 L282,236 L350,300 L400,262 L462,224 L512,262 L512,350 Z',
              'fill="#B77D8E"')
    o += path('M150,218 L170,196 L192,220 L180,214 L170,224 L160,214 Z M442,240 L462,224 L486,244 L472,240 L462,248 L452,240 Z '
              'M44,250 L60,236 L76,250 L66,248 L60,254 L52,248 Z', 'fill="#F7E3DC"')
    o += path('M0,360 L0,318 L80,284 L150,316 L230,282 L310,322 L388,290 L460,316 L512,300 L512,360 Z', 'fill="#C98B87"')
    # lake glint
    o += rect(0, 352, 512, 22, 0, 'fill="#E9B6A2"') + path('M300,362 L392,362 M330,368 L372,368', st('#FFF0C4', 3) + ' opacity=".8"')
    # silhouetted pines
    for (x, s) in ((20, 1.1), (66, 0.9), (110, 1.2), (350, 1.0), (392, 1.25), (440, 0.95), (486, 1.15)):
        hgt = 90 * s
        b = 382
        o += path(f'M{f(x)},{f(b - hgt)} L{f(x + 22 * s)},{f(b - hgt * 0.5)} L{f(x + 12 * s)},{f(b - hgt * 0.5)} '
                  f'L{f(x + 28 * s)},{f(b)} L{f(x - 28 * s)},{f(b)} L{f(x - 12 * s)},{f(b - hgt * 0.5)} L{f(x - 22 * s)},{f(b - hgt * 0.5)} Z',
                  'fill="#7A5468"')
    # meadow
    o += path('M0,384 C120,370 300,376 512,366 L512,512 L0,512 Z', 'fill="#D7A86E"')
    o += path('M0,430 C140,418 330,428 512,414 L512,512 L0,512 Z', 'fill="#C8955D"')
    for (x, y) in ((40, 404), (210, 398), (470, 396), (300, 446), (120, 470), (430, 470)):
        o += path(f'M{x},{y} l-5,-10 M{x},{y} l0,-12 M{x},{y} l5,-10', st('#A97A45', 2.6))
    # little campfire glow bottom right
    fx = 400
    o += ell(fx, 478, 54, 14, 'fill="#FFD9A0" opacity=".55"')
    o += path(f'M{fx - 28},484 L{fx + 28},472 M{fx - 28},472 L{fx + 28},484', st('#6E4526', 9))
    o += path(f'M{fx},478 C{fx - 16},472 {fx - 16},452 {fx - 6},440 C{fx - 6},454 {fx},454 {fx + 2},442 C{fx + 8},450 {fx + 18},460 {fx + 10},476 Z', fl('#FFB65C', '#E07D35', 3))
    o += path(f'M{fx},476 C{fx - 6},470 {fx - 6},462 {fx - 2},456 C{fx},464 {fx + 6},464 {fx + 6},470 Z', 'fill="#FFE7A0"')
    # garland with three lit paper lanterns (warm cream, brass-gold glow)
    o += path('M42,58 Q268,104 492,58', st('#6E4526', 2.6))
    for (x, y) in ((150, 80), (256, 89), (362, 80)):
        o += circ(x, y + 10, 20, 'fill="#FFE7A8" opacity=".45"')
        o += path(f'M{x},{y - 4} L{x},{y}', st('#6E4526', 2.4))
        o += ell(x, y + 11, 12, 13, fl('#F8E2B0', '#C99A5A', 2.6)) + path(f'M{x - 7},{y + 11} L{x + 7},{y + 11}', st('#E2BE80', 2))
        o += rect(x - 5, y - 2, 10, 4, 1.5, f'fill="{P["brass"]}"') + rect(x - 5, y + 21, 10, 3.6, 1.5, f'fill="{P["brass"]}"')
    # posts + beam (the right post bleeds off the edge so the chimes get room)
    o += log(d, 44, 92, 44, 520, 17) + log(d, 492, 92, 492, 520, 17)
    o += log(d, 22, 120, 512, 120, 18)
    # chimes (cords + brass hooks) — the struck red bell swings away from Kiki's hand
    chimes = [(292, 208, 104, 'bell', ('#E84A4A', '#A8282E', '#F7A0A0'), -9),
              (384, 236, 0, 'star', ('#FFD23F', '#C99A12', '#FFEB9C'), 0),
              (450, 178, 70, 'bell', ('#3C8DE8', '#1F5BA8', '#A6CCF5'), 3)]
    for (cx, top, h, kind, (bs, dk, lt), tilt) in chimes:
        hx = cx
        bx, by = rot(cx, top, tilt, hx, 134)
        o += path(f'M{hx},132 L{f(bx)},{f(by)}', st('#8A6A4A', 3.2))
        o += circ(hx, 136, 4.2, fl(P['brass'], P['brassD'], 2))
        if kind == 'bell':
            o += f'<g transform="rotate({tilt} {hx} 134)">' + small_bell(d, cx, top, h, bs, dk, lt, line=dk, clap=-4 if tilt else 0) + '</g>'
        else:
            o += circ(cx, top + 4, 5, f'fill="none" stroke="{P["brassD"]}" stroke-width="3"')
            o += plate_star(d, cx, top + 40, 34, bs, dk, lt)
    # "ding" ticks round the struck bell (short radial strokes) + sparkles
    for ang in (-150, -122, -58, -30):
        a = math.radians(ang)
        x0, y0 = 304 + 62 * math.cos(a), 262 + 62 * math.sin(a)
        x1, y1 = 304 + 80 * math.cos(a), 262 + 80 * math.sin(a)
        o += path(f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)}', st('#FFF6D8', 7))
    o += star4(352, 330, 12, w=2.2) + star4(420, 296, 9, w=2) + star4(236, 184, 9, w=2)
    # Kiki (happy face, near arm up, open palm tapping the bell lip)
    sc = 1.22
    tx, ty = 128 - 150 * sc, 506 - 292 * sc
    kd = Doc('ik')
    kb, tip, _ = kiki(kd, 'happy', arms_pose='ring')
    d.defs.extend(kd.defs)
    o += ell(130, 504, 110, 12, 'fill="#7A4E33" opacity=".22"')
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{kb}</g>'
    return svg(512, 512, o, ''.join(d.defs))


def main():
    tbl = write_kiki()
    write('characters/hedgehog.svg', hedgehog(False))
    write('characters/hedgehog_ball.svg', hedgehog(True))
    write('characters/bird.svg', bird(False))
    write('characters/bird_sing.svg', bird(True))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:10s} {v}')


if __name__ == '__main__':
    main()
