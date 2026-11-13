#!/usr/bin/env python3
"""Character art generator for Bao's Bubble Sky (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/bao_{idle,blink,talk,happy,cheer,think,oops,blow,wave,giggle,dance}.svg + bao_title.svg
        0 0 300 300, FEET ANCHOR (150,292). Bao = a small round baby panda SITTING on his cloud, 3/4 view facing RIGHT,
        eyes on the child, cream bandana, a bubble wand in the right paw (as seen).
        The body (belly, shoulder band, legs, soles, tail, bandana) is identical in every frame; only the head (eyes,
        mouth, brows, tilt), the arms and the wand change.
        Wand ring centre (rest frames idle/blink/talk/happy/think/oops/wave/giggle) = (250,120) r 26;
        blow = (214,104) r 26 (raised in front of the mouth). cheer / dance / title move the ring (see RING_AT).
  characters/bird.svg, bird_flap.svg      0 0 120 100, centre anchor (60,50), facing RIGHT
  characters/kite.svg                     0 0 140 200, anchor = kite centre (70,70); the string is drawn by code
  icon.svg                                0 0 512 512, full bleed, opaque, no text
Also writes game/js/bao_points.js (PB.BAO_POINTS).

Usage: python3 tools/art_bao.py   then   node tools/bao_sheet.js && node tools/render_icons.js
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone (never black), one-step cel shade
(lower right) + one soft highlight (upper left); no <text>/fonts/scripts/external refs, no filters.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
JS_OUT = os.path.join(ROOT, 'game', 'js', 'bao_points.js')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Bao palette (DESIGN.md section 3, exact hex) — never an answer colour
    'fur': '#FBFAF6', 'sh': '#E3E0DA', 'line': '#8B8794',
    'dark': '#3A3640', 'darkLine': '#24212A', 'darkHi': '#57525E',
    'nose': '#2B2830', 'pupil': '#1E1B24', 'white': '#FFFFFF', 'cheek': '#F4A7A0',
    'band': '#EED9B5', 'bandLine': '#B79E74', 'bandSh': '#DCC294',
    'stick': '#C8A27A', 'stickLine': '#8E6B45',
    'ring': '#EEF3F6', 'ringLine': '#9AA7B0',
    'mouth': '#6A3640', 'tongue': '#EE9A92',
    'lid': '#E9E6EE',     # closed / happy eye arcs (light, drawn on the dark patch)
}

FEET = (150, 292)
RING_REST = (250, 120)
RING_BLOW = (214, 104)
RING_R = 26


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


class Doc:
    """Collects <defs> with unique ids (the prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='b'):
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

    def shaded(self, tpl, base, shade, line, dx=-10, dy=-9, w=LW, hi=None):
        """One-step cel shade: shape in shade colour, base colour shifted up-left inside it, outline on top."""
        cid = self.clip(tpl.format(a=''))
        out = tpl.format(a=f'fill="{shade}"')
        out += (f'<g clip-path="url(#{cid})"><g transform="translate({f(dx)},{f(dy)})">'
                f'{tpl.format(a=f"fill=\"{base}\"")}</g>')
        if hi:
            out += hi
        out += '</g>'
        if w:
            out += tpl.format(a=f'fill="none" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')
        return out

    def film_grad(self):
        """Iridescent soap-film rim gradient (pastel cyan → lilac → peach)."""
        return self.add('linearGradient',
                        '<stop offset="0" stop-color="#9FE6F2"/><stop offset=".5" stop-color="#CDB8F2"/>'
                        '<stop offset="1" stop-color="#FFCFA8"/>', 'x1="0" y1="0" x2="1" y2="1"')


def film(doc, cx, cy, r, alpha=1.0):
    """A soap film / bubble: clear fill, iridescent rim, curved highlight + dot."""
    g = doc.film_grad()
    o = circ(cx, cy, r, f'fill="#FFFFFF" fill-opacity="{f(0.25 * alpha)}"')
    o += circ(cx, cy, r - 1.5, f'fill="none" stroke="url(#{g})" stroke-width="{f(max(2.2, r * 0.13))}" '
                               f'stroke-opacity="{f(0.55 * alpha + 0.2)}"')
    a0, a1 = math.radians(200), math.radians(250)
    rr = r * 0.7
    x0, y0 = cx + rr * math.cos(a0), cy + rr * math.sin(a0)
    x1, y1 = cx + rr * math.cos(a1), cy + rr * math.sin(a1)
    o += path(f'M{f(x0)},{f(y0)} A{f(rr)},{f(rr)} 0 0 1 {f(x1)},{f(y1)}',
              st('#FFFFFF', max(2, r * 0.13)) + f' opacity="{f(0.9 * alpha)}"')
    o += circ(cx + r * 0.42, cy + r * 0.45, max(1.2, r * 0.07), f'fill="#FFFFFF" opacity="{f(0.75 * alpha)}"')
    return o


# ======================================================================= BAO geometry
HEAD = (138, 114, 72, 62)          # x 66-210, y 52-176
PIVOT = (140, 180)                 # head tilt pivot (neck)
MUZ = (178, 140, 29, 21)           # white muzzle, pushed right (3/4 view)
NOSE = (186, 130)
MOUTH = (184, 148)                 # mouth centre (rest)
PATCH_N = (110, 108, 21, 26, 30)   # near eye patch cx, cy, rx, ry, rotation
PATCH_F = (162, 101, 16, 21, -26)  # far eye patch
EYE_N = (112, 106, 11.5)           # near eye (bigger)
EYE_F = (161, 100, 9)              # far eye
EAR_N = (80, 62, 23)
EAR_F = (184, 56, 20)
BODY = (140, 236, 72, 54)          # x 68-212, y 182-290
SH_N = (100, 200)                  # near shoulder
SH_F = (176, 198)                  # far shoulder (wand arm)
ARM_W = 33
PAW_R = 15.5

#            eyes      mouth   tilt  brows       look      near arm  far arm   puff
POSES = {
    'idle':   ('open',   'smile',  0,  None,       (0, 1),   'lap',   'rest',  False),
    'blink':  ('closed', 'smile',  0,  None,       (0, 1),   'lap',   'rest',  False),
    'talk':   ('open',   'talk',   0,  None,       (0, 1),   'lap',   'rest',  False),
    'happy':  ('wide',   'big',    0,  None,       (0, 0),   'lap',   'rest',  False),
    'cheer':  ('happy',  'big',    0,  None,       (0, 0),   'up',    'up',    False),
    'think':  ('look',   'hmm',    8,  (5, 1),     (3, -4),  'chin',  'rest',  False),
    'oops':   ('wide',   'o',     -9,  (1, 6),     (-1, 0),  'lap',   'rest',  False),
    'blow':   ('look',   'blow',  -7,  None,       (3, -3),  'lap',   'blow',  True),
    'wave':   ('open',   'big',    0,  None,       (0, 1),   'wave',  'rest',  False),
    'giggle': ('happy',  'big',    5,  None,       (0, 0),   'mouth', 'rest',  False),
    'dance':  ('happy',  'big',   -6,  None,       (0, 0),   'out',   'dance', False),
    'title':  ('wide',   'big',   -4,  None,       (0, 0),   'lap',   'title', False),
}

# far (wand) arm: shoulder → elbow → paw centre, and the wand ring centre
FAR_ARM = {
    'rest':  ([SH_F, (204, 208), (220, 190)], RING_REST),
    'blow':  ([SH_F, (212, 204), (230, 172)], RING_BLOW),
    'up':    ([SH_F, (212, 178), (228, 140)], (248, 62)),
    'dance': ([SH_F, (214, 216), (244, 194)], (268, 128)),
    'title': ([SH_F, (214, 184), (232, 148)], (256, 74)),
}
NEAR_ARM = {
    'lap':   [SH_N, (100, 224), (124, 240)],
    'up':    [SH_N, (78, 176), (66, 138)],
    'chin':  [SH_N, (112, 220), None],          # paw at the (tilted) chin, computed
    'wave':  [SH_N, (74, 188), (54, 150)],
    'mouth': [SH_N, (132, 212), None],          # paw over the (tilted) mouth, computed
    'out':   [SH_N, (76, 210), (50, 186)],
}
RING_AT = {k: v[1] for k, v in FAR_ARM.items()}


def head_pt(x, y, tilt):
    return rot(x, y, tilt, *PIVOT) if tilt else (x, y)


# ----------------------------------------------------------------- face parts
def eye(cx, cy, r, mode, look):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.1 if mode == 'wide' else 1)
        o += circ(cx, cy, rr, f'fill="{P["white"]}"')
        px, py = cx + look[0] * r / 11, cy + look[1] * r / 11
        pr = rr * (0.74 if mode == 'wide' else 0.8)
        o += circ(px, py, pr, f'fill="{P["pupil"]}"')
        o += circ(px - pr * 0.32, py - pr * 0.36, pr * 0.42, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.38, py + pr * 0.4, pr * 0.17, 'fill="#FFFFFF"')
    elif mode == 'closed':     # gentle U
        o += path(f'M{f(cx - r * 0.85)},{f(cy)} Q{f(cx)},{f(cy + r * 0.75)} {f(cx + r * 0.85)},{f(cy)}', st(P['lid'], 4))
    elif mode == 'happy':      # ^ arcs
        o += path(f'M{f(cx - r * 0.85)},{f(cy + r * 0.35)} Q{f(cx)},{f(cy - r * 0.95)} {f(cx + r * 0.85)},{f(cy + r * 0.35)}',
                  st(P['lid'], 4.4))
    return o


def mouth(mode):
    mx, my = MOUTH
    ln = P['nose']
    o = ''
    if mode != 'blow':
        o += path(f'M{NOSE[0] - 1},{NOSE[1] + 6} Q{mx},{my - 6} {mx},{my - 3}', st(ln, 2.8))
    if mode == 'smile':
        o += path(f'M{mx - 13},{my - 3} Q{mx - 6},{my + 5} {mx},{my - 3} Q{mx + 6},{my + 4} {mx + 11},{my - 4}', st(ln, 3.2))
    elif mode == 'talk':
        o += path(f'M{mx - 11},{my - 3} Q{mx},{my - 1} {mx + 10},{my - 4} Q{mx + 9},{my + 11} {mx},{my + 11} '
                  f'Q{mx - 10},{my + 10} {mx - 11},{my - 3} Z', fl(P['mouth'], ln, 2.8))
        o += ell(mx, my + 7, 5.5, 3, f'fill="{P["tongue"]}"')
    elif mode == 'big':
        w, h = 15, 15
        o += path(f'M{f(mx - w)},{f(my - 4)} Q{mx},{f(my)} {f(mx + w - 2)},{f(my - 6)} '
                  f'Q{f(mx + w * 0.8)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.8)},{f(my + h)} {f(mx - w)},{f(my - 4)} Z',
                  fl(P['mouth'], ln, 2.8))
        o += path(f'M{mx - 7},{my + h - 3} Q{mx},{my + 5} {mx + 7},{my + h - 3} Q{mx},{my + h + 1} {mx - 7},{my + h - 3} Z',
                  f'fill="{P["tongue"]}"')
    elif mode == 'o':
        o += ell(mx, my + 3, 5, 6, fl(P['mouth'], ln, 2.8))
    elif mode == 'hmm':
        o += path(f'M{mx - 11},{my + 1} Q{mx - 5},{my - 4} {mx},{my + 1} Q{mx + 5},{my + 5} {mx + 10},{my}', st(ln, 3.2))
    elif mode == 'blow':       # pursed "o" lips, pushed a little forward-up towards the ring
        o += path(f'M{NOSE[0] - 1},{NOSE[1] + 6} L{mx + 1},{my - 6}', st(ln, 2.6))
        o += ell(mx + 3, my, 5.2, 4.6, fl(P['mouth'], ln, 3))
    return o


def head(doc, pose):
    eyes, mo, tilt, brows, look, _na, _fa, puff = POSES[pose]
    hx, hy, hrx, hry = HEAD
    o = ''
    # ears (behind the head)
    for (ex, ey, er) in (EAR_F, EAR_N):
        o += doc.shaded(f'<circle cx="{ex}" cy="{ey}" r="{er}" {{a}}/>', P['dark'], '#2F2B35', P['darkLine'],
                        dx=-4, dy=-4, w=LW)
        o += circ(ex + 2, ey + 3, er * 0.5, f'fill="{P["darkHi"]}" opacity=".7"')
    # head: chubby round, cheeks a little fuller at the bottom
    pts = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        k = 1 + 0.05 * max(0, math.sin(a)) ** 2      # fuller lower half
        pts.append((hx + hrx * math.cos(a) * k, hy + hry * math.sin(a) * (1 + 0.02 * math.sin(a))))
    hd = ptsd(pts)
    hi = ell(100, 76, 22, 10, 'fill="#FFFFFF" opacity=".9" transform="rotate(-32 100 76)"')
    o += doc.shaded(f'<path d="{hd}" {{a}}/>', P['fur'], P['sh'], P['line'], dx=-11, dy=-10, hi=hi)
    # little tuft on the crown
    o += path('M128,54 Q134,44 142,50 Q146,42 154,48', st(P['line'], 3.2))
    # eye patches (soft teardrops sloping down-outwards)
    for (cx, cy, rx, ry, rr) in (PATCH_N, PATCH_F):
        o += ell(cx, cy, rx, ry, fl(P['dark'], P['darkLine'], 3) + f' transform="rotate({rr} {cx} {cy})"')
    # muzzle
    mx, my, mrx, mry = MUZ
    o += doc.shaded(f'<ellipse cx="{mx}" cy="{my}" rx="{mrx}" ry="{mry}" {{a}}/>', P['fur'], P['sh'], P['line'],
                    dx=-5, dy=-5, w=3)
    # cheeks (puffed in blow)
    if puff:
        o += doc.shaded('<ellipse cx="200" cy="150" rx="15" ry="13" {a}/>', P['fur'], P['sh'], P['line'], dx=-4, dy=-4, w=3)
        o += ell(202, 153, 8, 5, f'fill="{P["cheek"]}" opacity=".6"')
        o += ell(96, 140, 17, 11, f'fill="{P["cheek"]}" opacity=".95"')
    else:
        o += ell(97, 139, 14, 8.5, f'fill="{P["cheek"]}" opacity=".85"')
    o += mouth(mo)
    # nose: soft rounded triangle with a shine
    nx, ny = NOSE
    o += path(f'M{nx - 10},{ny - 4} Q{nx},{ny - 9} {nx + 9},{ny - 5} Q{nx + 8},{ny + 5} {nx},{ny + 7} Q{nx - 8},{ny + 5} {nx - 10},{ny - 4} Z',
              fl(P['nose'], P['nose'], 1.5))
    o += ell(nx - 3.5, ny - 3, 3.2, 1.8, 'fill="#FFFFFF" opacity=".6"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 18 - lift
            o += path(f'M{f(cx - 6)},{f(y + 2)} Q{f(cx)},{f(y - 3)} {f(cx + 6)},{f(y + 2)}', st(P['dark'], 3.6))
    if tilt:
        o = f'<g transform="rotate({tilt} {PIVOT[0]} {PIVOT[1]})">{o}</g>'
    return o


# ----------------------------------------------------------------- body (identical in every frame)
def body(doc):
    bx, by, brx, bry = BODY
    o = ''
    # tail: a small white puff behind, lower left
    o += doc.shaded('<circle cx="72" cy="268" r="14" {a}/>', P['fur'], P['sh'], P['line'], dx=-4, dy=-4)
    # body: round sitting pear
    bd = ptsd([(bx, by - bry), (bx + brx * 0.78, by - bry * 0.62), (bx + brx, by + 4), (bx + brx * 0.8, by + bry * 0.8),
               (bx, by + bry), (bx - brx * 0.8, by + bry * 0.8), (bx - brx, by + 4), (bx - brx * 0.78, by - bry * 0.62)])
    cid = doc.clip(f'<path d="{bd}"/>')
    o += path(bd, f'fill="{P["sh"]}"')
    o += f'<g clip-path="url(#{cid})">'
    o += path(bd, f'fill="{P["fur"]}" transform="translate(-10,-8)"')
    # the dark shoulder band (panda "vest")
    o += path(f'M{bx - brx - 6},{by - 18} Q{bx},{by - 2} {bx + brx + 6},{by - 22} L{bx + brx + 6},{by - bry - 10} '
              f'L{bx - brx - 6},{by - bry - 10} Z', f'fill="{P["dark"]}"')
    o += path(f'M{bx - brx},{by - 20} Q{bx - 20},{by - 10} {bx + 10},{by - 13}', st(P['darkHi'], 5) + ' opacity=".7"')
    o += '</g>'
    o += path(bd, f'fill="none" stroke="{P["line"]}" stroke-width="{f(LW)}"')
    # legs: chubby dark legs forward with soles to the viewer
    for (lx, ly, rx, ry, rr, far) in ((114, 268, 30, 21, -10, False), (190, 270, 24, 18, 8, True)):
        tpl = f'<ellipse cx="{lx}" cy="{ly}" rx="{rx}" ry="{ry}" transform="rotate({rr} {lx} {ly})" {{a}}/>'
        o += doc.shaded(tpl, P['dark'], '#2F2B35', P['darkLine'], dx=-5, dy=-5,
                        hi=ell(lx - rx * 0.35, ly - ry * 0.45, rx * 0.4, ry * 0.22, f'fill="{P["darkHi"]}" opacity=".7"'))
    # soles: a pad + three toe beans (soft grey, readable on the dark leg)
    for (sx, sy, s) in ((98, 274, 1.0), (202, 276, 0.8)):
        o += ell(sx, sy + 2, 11 * s, 9 * s, f'fill="{P["darkHi"]}" stroke="#6E6976" stroke-width="1.6"')
        for dx in (-9, 0, 9):
            o += circ(sx + dx * s, sy - 10 * s, 3.6 * s, f'fill="{P["darkHi"]}" stroke="#6E6976" stroke-width="1.4"')
    # bandana: a cream scarf around the neck, a knot and a little point at the front
    o += path('M132,192 Q146,224 154,224 Q164,222 176,188 Z', fl(P['band'], P['bandLine'], 3.4))
    o += path('M146,200 Q150,214 154,216', st(P['bandSh'], 2.6))
    o += path('M84,166 Q140,196 200,164 Q206,174 198,182 Q140,212 90,182 Q80,176 84,166 Z', fl(P['band'], P['bandLine'], 3.6))
    o += path('M92,178 Q140,202 194,176', st(P['bandSh'], 2.6))
    for (x, y) in ((110, 186), (132, 193), (170, 190)):   # tiny dots in the bandana's own tone
        o += circ(x, y, 2.2, f'fill="{P["bandSh"]}"')
    return o


# ----------------------------------------------------------------- arms + wand
def arm(pts):
    d = ptsd(pts, close=False)
    o = path(d, st(P['darkLine'], ARM_W))
    o += path(d, st(P['dark'], ARM_W - 2 * LW))
    # soft highlight along the upper-left edge
    ox = [(x - 4, y - 4) for (x, y) in pts]
    o += path(ptsd(ox, close=False), st(P['darkHi'], 5) + ' opacity=".6"')
    return o


def paw(x, y, r=PAW_R):
    o = circ(x, y, r, fl(P['dark'], P['darkLine'], LW))
    o += circ(x - r * 0.3, y - r * 0.32, r * 0.4, f'fill="{P["darkHi"]}" opacity=".8"')
    return o


def wand(doc, paw_xy, ring_xy):
    px, py = paw_xy
    rx, ry = ring_xy
    dx, dy = rx - px, ry - py
    ln = math.hypot(dx, dy)
    ux, uy = dx / ln, dy / ln
    ex, ey = rx - ux * RING_R, ry - uy * RING_R        # stick meets the ring rim
    sx, sy = px - ux * 22, py - uy * 22                # handle end below the paw
    stick = f'M{f(sx)},{f(sy)} L{f(ex)},{f(ey)}'
    o = path(stick, st(P['stickLine'], 9.5)) + path(stick, st(P['stick'], 5))
    o += path(f'M{f(sx + 1)},{f(sy - 1)} L{f(ex - 1)},{f(ey + 1)}', st('#E2C7A4', 1.6) + ' opacity=".8"')
    # silvery ring + soap film
    o += film(doc, rx, ry, RING_R - 3)
    o += circ(rx, ry, RING_R, f'fill="none" stroke="{P["ringLine"]}" stroke-width="9"')
    o += circ(rx, ry, RING_R, f'fill="none" stroke="{P["ring"]}" stroke-width="4.4"')
    o += path(f'M{f(rx - RING_R * 0.82)},{f(ry - RING_R * 0.5)} A{RING_R},{RING_R} 0 0 1 {f(rx - RING_R * 0.2)},{f(ry - RING_R * 0.98)}',
              st('#FFFFFF', 2.2))
    return o


def bao(doc, pose, extra=''):
    eyes, mo, tilt, brows, look, na, fa, puff = POSES[pose]
    o = body(doc)
    # far (wand) arm first in rest/blow so the head front stays clean; the paw hold is drawn over the stick
    fpts, ring = FAR_ARM[fa]
    npts = list(NEAR_ARM[na])
    if npts[2] is None:
        if na == 'chin':
            npts[2] = head_pt(146, 176, tilt)
        else:
            npts[2] = head_pt(MOUTH[0] - 2, MOUTH[1] + 4, tilt)
    o += head(doc, pose)
    o += wand(doc, fpts[2], ring)
    o += arm(fpts) + paw(*fpts[2])
    # paw fingers wrapped over the stick
    o += path(f'M{f(fpts[2][0] - 8)},{f(fpts[2][1] + 2)} Q{f(fpts[2][0])},{f(fpts[2][1] + 7)} {f(fpts[2][0] + 9)},{f(fpts[2][1] + 1)}',
              st(P['darkHi'], 2.4))
    o += arm(npts) + paw(*npts[2])
    if na in ('wave', 'up', 'out'):     # open waving paw: little toe beans
        x, y = npts[2]
        for dx in (-7, 0, 7):
            o += circ(x + dx, y - 6, 2.6, f'fill="{P["darkHi"]}"')
    o += extra
    return o, ring


def bao_svg(pose):
    doc = Doc('b')
    extra = ''
    if pose == 'title':   # a few bubbles drifting from the wand
        for (x, y, r) in ((236, 22, 15), (282, 108, 13), (204, 34, 8), (40, 52, 12), (276, 40, 9), (24, 120, 8)):
            extra += film(doc, x, y, r)
    body_svg, _ = bao(doc, pose, extra)
    return svg(300, 300, body_svg, ''.join(doc.defs))


# ======================================================================= BIRD (0 0 120 100, centre (60,50), facing RIGHT)
BIRD = {'back': '#7F95B8', 'sh': '#6A80A3', 'line': '#4E5F80', 'belly': '#F6EBD6', 'bellyLine': '#B9A98A',
        'beak': '#F0B77C', 'beakLine': '#B07A44'}


def bird_svg(flap):
    doc = Doc('d')
    B = BIRD
    o = ''
    # forked swallow tail (left)
    o += path('M34,54 L6,40 L20,54 L4,66 L34,62 Z', fl(B['sh'], B['line'], 3))
    # far wing (behind) when flapping
    if flap:
        o += path('M60,40 C60,26 62,14 70,2 C80,14 82,30 74,42 Z', fl(B['sh'], B['line'], 3))
    # body + head: one round shape
    bd = ptsd([(30, 56), (40, 38), (62, 32), (74, 22), (90, 22), (100, 34), (98, 50), (86, 66), (62, 74), (40, 70)])
    o += doc.shaded(f'<path d="{bd}" {{a}}/>', B['back'], B['sh'], B['line'], dx=-4, dy=-4, w=3.2,
                    hi=ell(76, 28, 9, 4, 'fill="#FFFFFF" opacity=".35" transform="rotate(-20 76 28)"'))
    # cream belly + throat
    belly = ptsd([(44, 64), (64, 50), (84, 44), (97, 46), (88, 64), (64, 73)])
    o += path(belly, fl(B['belly'], B['bellyLine'], 2.4))
    # beak
    o += path('M98,36 L112,41 L98,46 Z', fl(B['beak'], B['beakLine'], 2.4))
    # eye + cheek
    o += circ(88, 35, 4.8, f'fill="{P["pupil"]}"') + circ(86.6, 33.4, 1.8, 'fill="#FFFFFF"')
    o += ell(90, 45, 4.6, 3, f'fill="{P["cheek"]}" opacity=".85"')
    # near wing
    if flap:
        o += path('M44,52 C40,34 36,18 30,4 C48,10 64,24 70,46 C64,54 52,56 44,52 Z', fl(B['back'], B['line'], 3))
        o += path('M38,16 Q50,28 56,46 M48,12 Q60,26 64,44', st(B['sh'], 2.2))
    else:
        o += path(ptsd([(40, 50), (58, 44), (78, 50), (66, 62), (44, 62)]), fl(B['back'], B['line'], 3))
        o += path('M50,54 Q60,52 70,55', st(B['sh'], 2.2))
    # little feet tucked
    o += path('M60,74 L58,80 M68,73 L67,79', st(B['beakLine'], 2.2))
    return svg(120, 100, o, ''.join(doc.defs))


# ======================================================================= KITE (0 0 140 200, kite centre (70,70))
def kite_svg():
    doc = Doc('k')
    T, R, Bt, L, C = (70, 10), (126, 58), (70, 130), (14, 58), (70, 58)
    line = '#A48A72'
    o = ''
    # ribbon tail with 3 bows (drawn first, behind)
    tail = 'M70,130 C58,146 84,158 70,172 C58,184 76,190 70,198'
    o += path(tail, st(line, 3.2))
    for (x, y, col) in ((66, 147, '#F6C9A8'), (74, 167, '#BFE3CF'), (68, 186, '#F6EBD6')):
        o += path(f'M{x},{y} L{x - 11},{y - 6} L{x - 11},{y + 6} Z M{x},{y} L{x + 11},{y - 6} L{x + 11},{y + 6} Z',
                  fl(col, line, 2.4))
        o += circ(x, y, 2.6, fl(col, line, 2))
    # four patches
    quads = [((T, R, C), '#F6C9A8'), ((R, Bt, C), '#F6EBD6'), ((Bt, L, C), '#BFE3CF'), ((L, T, C), '#F6EBD6')]
    for (a, b, c), col in quads:
        o += path(f'M{a[0]},{a[1]} L{b[0]},{b[1]} L{c[0]},{c[1]} Z', f'fill="{col}"')
    # soft cel shade on the right half + highlight upper-left
    o += path(f'M{T[0]},{T[1]} L{R[0]},{R[1]} L{Bt[0]},{Bt[1]} Z', 'fill="#B0927A" opacity=".12"')
    o += path('M64,22 L28,56', st('#FFFFFF', 4) + ' opacity=".6"')
    # a small cloud motif in the cream patch (muted)
    o += path('M84,92 q4,-8 11,-4 q6,-6 11,2 q6,1 4,7 l-26,0 q-4,-3 0,-5 Z', 'fill="#FFFFFF" opacity=".85"')
    # spars + outline
    o += path(f'M{T[0]},{T[1] + 3} L{Bt[0]},{Bt[1] - 3} M{L[0] + 3},{L[1]} L{R[0] - 3},{R[1]}', st('#C8A27A', 3.4))
    o += path(f'M{T[0]},{T[1]} L{R[0]},{R[1]} L{Bt[0]},{Bt[1]} L{L[0]},{L[1]} Z', fl('none', line, 3.8))
    # bridle knot at the kite centre (70,70) where the code-drawn string attaches
    o += circ(70, 70, 3, fl('#F6EBD6', line, 2))
    return svg(140, 200, o, ''.join(doc.defs))


# ======================================================================= ICON (512, full bleed)
def bubble_thing(doc, kind, cx, cy, r):
    """Original little things inside the icon bubbles (answer palette, exact hex)."""
    o = ''
    s = r * 0.5
    if kind == 'ball':
        o += circ(cx, cy, s, fl('#E84A4A', '#A8282E', 4))
        o += path(f'M{f(cx - s)},{f(cy)} Q{f(cx)},{f(cy + s * 0.5)} {f(cx + s)},{f(cy)}', st('#FFFFFF', 5))
        o += circ(cx - s * 0.4, cy - s * 0.45, s * 0.22, 'fill="#F7A0A0"')
    elif kind == 'duck':
        o += path(ptsd([(cx - s, cy + s * 0.1), (cx - s * 0.6, cy + s * 0.75), (cx + s * 0.6, cy + s * 0.8),
                        (cx + s * 0.95, cy + s * 0.15), (cx + s * 0.4, cy - s * 0.05), (cx - s * 0.3, cy - s * 0.05)]),
                  fl('#FFD23F', '#C99A12', 4))
        o += circ(cx + s * 0.25, cy - s * 0.42, s * 0.46, fl('#FFD23F', '#C99A12', 4))
        o += path(f'M{f(cx + s * 0.62)},{f(cy - s * 0.5)} L{f(cx + s * 1.05)},{f(cy - s * 0.35)} L{f(cx + s * 0.62)},{f(cy - s * 0.22)} Z',
                  fl('#FF9A2E', '#C4650C', 3))
        o += circ(cx + s * 0.34, cy - s * 0.52, s * 0.09, f'fill="{P["pupil"]}"')
        o += path(f'M{f(cx - s * 0.45)},{f(cy + s * 0.25)} Q{f(cx)},{f(cy + s * 0.5)} {f(cx + s * 0.35)},{f(cy + s * 0.2)}',
                  st('#C99A12', 3))
    elif kind == 'star':
        pts = []
        for i in range(10):
            a = -math.pi / 2 + i * math.pi / 5
            rr = s * (1.05 if i % 2 == 0 else 0.5)
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        o += path('M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z', fl('#FFC23A', '#C98A12', 4))
        o += circ(cx - s * 0.2, cy - s * 0.2, s * 0.14, 'fill="#FFFFFF" opacity=".7"')
    return o


def icon_svg():
    doc = Doc('i')
    sky = doc.add('linearGradient', '<stop offset="0" stop-color="#BFDDF8"/><stop offset="1" stop-color="#FCEFF4"/>',
                  'x1="0" y1="0" x2="0" y2="1"')
    o = f'<rect width="512" height="512" fill="url(#{sky})"/>'
    # rainbow arch behind
    bands = ['#F6A6A6', '#F8C49A', '#F7E19A', '#B9E3A8', '#A9D2F2', '#B9B2EE', '#E2B6E8']
    cx, cy, r0, w = 300, 470, 330, 22
    for i, c in enumerate(bands):
        r = r0 - i * w
        o += path(f'M{cx - r + w / 2},{cy} A{r - w / 2},{r - w / 2} 0 0 1 {cx + r - w / 2},{cy}',
                  f'fill="none" stroke="{c}" stroke-width="{f(w + 0.6)}" opacity=".85"')
    # cloud floor
    puffs = [(-10, 470, 70), (70, 452, 72), (160, 470, 64), (250, 460, 70), (340, 474, 66), (430, 458, 72), (520, 470, 66)]
    for (x, y, r) in puffs:
        o += circ(x, y + 6, r, 'fill="#DDE6F3"')
    for (x, y, r) in puffs:
        o += circ(x, y, r, 'fill="#FFFFFF"')
    o += f'<rect x="0" y="470" width="512" height="42" fill="#FFFFFF"/>'
    # Bao blowing (scaled 1.42, feet at (176, 498))
    k = 1.42
    tx, ty = 176 - FEET[0] * k, 498 - FEET[1] * k
    b, ring = bao(doc, 'blow')
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({k})">{b}</g>'
    rx, ry = tx + ring[0] * k, ty + ring[1] * k
    # three bubbles flowing up-right from the wand: ball, duck, star
    for (kind, bx, by, br) in (('ball', rx + 100, ry + 4, 50), ('duck', rx + 168, ry - 112, 58), ('star', rx + 52, ry - 160, 46)):
        o += bubble_thing(doc, kind, bx, by, br)
        o += film(doc, bx, by, br)
    # two tiny bubbles
    o += film(doc, rx + 40, ry + 30, 12) + film(doc, 470, 40, 14)
    return svg(512, 512, o, ''.join(doc.defs))


# ======================================================================= main
def main():
    for pose in POSES:
        name = 'bao_title' if pose == 'title' else 'bao_' + pose
        write(f'characters/{name}.svg', bao_svg(pose))
    write('characters/bird.svg', bird_svg(False))
    write('characters/bird_flap.svg', bird_svg(True))
    write('characters/kite.svg', kite_svg())
    write('icon.svg', icon_svg())
    js = ("/* Bao's Bubble Sky — PB.BAO_POINTS (written by tools/art_bao.py; do not edit by hand).\n"
          " * Points in Bao's 300x300 viewBox: feet anchor, wand ring centre at rest (idle blink talk happy think oops wave giggle),\n"
          " * the ring centre in 'blow', ring radius, and the mouth (rest). Scale by (h / 300) and place by the feet. */\n"
          "(function (PB) {\n  'use strict';\n"
          f"  PB.BAO_POINTS = {{ feet: [{FEET[0]}, {FEET[1]}], ring: [{RING_REST[0]}, {RING_REST[1]}], "
          f"blowRing: [{RING_BLOW[0]}, {RING_BLOW[1]}], ringR: {RING_R}, mouth: [{MOUTH[0]}, {MOUTH[1]}] }};\n"
          "})(typeof window !== 'undefined' ? (window.PB = window.PB || {}) : (globalThis.PB = globalThis.PB || {}));\n")
    with open(JS_OUT, 'w') as fh:
        fh.write(js)
    print('wrote', len(POSES), 'Bao frames, bird x2, kite, icon, bao_points.js')


if __name__ == '__main__':
    main()
