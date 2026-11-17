#!/usr/bin/env python3
"""Character art generator for Tibo's Dino Lake Fishing (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/tibo_{idle,blink,talk,happy,cheer,think,oops,cast,reel,wave}.svg + tibo_title.svg
        0 0 300 300, SEAT ANCHOR (150,292) = bottom centre of the sitting turtle. Tibo (a baby turtle, soft sage skin,
        honey-caramel shell with plates and a cream rim, cream belly plate, straw sun hat with a teal ribbon) SITS on
        his shell bottom in 3/4 view facing RIGHT, eyes on the child. Shell, body, hind feet and tail are identical in
        every frame; only head (face, tilt, lean) and the front flippers change.
        ROD GRIP (205,175): the near paw is centred on it, the far paw sits 15 px further along the rest angle
        (-1.05 rad), so a rod drawn by code from the grip passes across both paws.  Not drawn here, except in title.
  characters/ptero.svg, ptero_flap.svg           0 0 200 140, centre anchor (100,70), facing RIGHT
  characters/bronto.svg, bronto_spray.svg        0 0 260 300, bottom anchor (130,296), facing LEFT, knee-deep
  characters/frog.svg, frog_jump.svg             0 0 120 100, bottom anchor (60,96)
  characters/firefly.svg                         0 0 48 48, centre anchor (24,24)
  icon.svg                                       0 0 512 512, full bleed, opaque, no text

Usage (from the game folder root): python3 tools/art_tibo.py && node tools/tibo_sheet.js
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone (never black), one-step cel
shade (lower right) + one soft highlight (upper left); no <text>/fonts/scripts/external refs; one feGaussianBlur max
(none used: glows are radial gradients). Deterministic: re-running gives byte-identical files.
The script ends with a validator (viewBox = width/height, no text/scripts/external refs, no answer colours on Tibo
and the critters) and exits non-zero on a problem.
"""
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
PTS_JSON = os.path.join(ROOT, 'docs', 'art', 'tibo_bbox.json')   # points per frame; tibo_sheet.js adds measured boxes
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Tibo palette (DESIGN.md section 3) — never an answer colour
    'skin': '#B9D6A5', 'sh': '#8FB37E', 'line': '#5E7F52', 'farSkin': '#AACB96', 'farSh': '#86A975',
    'shell': '#D7A65E', 'shellSh': '#C1904A', 'plate': '#B9853F', 'plateL': '#E3B873', 'shellLine': '#86602C',
    'rim': '#F3E2B8', 'rimLine': '#B39461', 'belly': '#F3E7C6', 'bellySh': '#E3D2A8', 'bellyLine': '#A8916A',
    'pupil': '#2F2A3A', 'white': '#FFFFFF', 'cheek': '#F2A99A', 'mouth': '#6E2C25', 'tongue': '#EE8F84',
    'hat': '#EBD39A', 'hatSh': '#D9BD7E', 'weave': '#C9AE6E', 'hatLine': '#9C7F45',
    'teal': '#6FB7B0', 'tealD': '#468C86', 'claw': '#F3E7C6', 'halo': '#FFF8E6',
    'bamboo': '#D9B66E', 'node': '#A9853E', 'fishline': '#FFF8E6',
}


# ------------------------------------------------------------------ tiny SVG helpers (same as bear-fairy-tea/tools/art_moka.py)
def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def svg(w, h, body, defs='', comment=''):
    d = f'<defs>{defs}</defs>' if defs else ''
    c = f'<!-- {comment} -->' if comment else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{c}{d}{body}</svg>\n')


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

    def __init__(self, prefix='t'):
        self.prefix, self.defs, self.n = prefix, [], 0

    def uid(self, k='g'):
        self.n += 1
        return f'{self.prefix}{k}{self.n}'

    def clip(self, inner):
        cid = self.uid('c')
        self.defs.append(f'<clipPath id="{cid}">{inner}</clipPath>')
        return cid

    def shaded(self, tpl, base, shade, line, dx=-10, dy=-9, w=LW, hi=None, inner=''):
        """One-step cel shade: shape in shade colour, base colour shifted up-left inside it, outline on top."""
        cid = self.clip(tpl.format(a=''))
        out = tpl.format(a=f'fill="{shade}"')
        out += (f'<g clip-path="url(#{cid})"><g transform="translate({f(dx)},{f(dy)})">'
                f'{tpl.format(a=f"fill=\"{base}\"")}</g>{inner}')
        if hi:
            out += hi
        out += '</g>'
        if w:
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


def star4(x, y, s, fill='#FFF6C8', line='#D9BE6A', w=1.6):
    return path(f'M{f(x)},{f(y - s)} L{f(x + s * 0.3)},{f(y - s * 0.3)} L{f(x + s)},{f(y)} L{f(x + s * 0.3)},{f(y + s * 0.3)} '
                f'L{f(x)},{f(y + s)} L{f(x - s * 0.3)},{f(y + s * 0.3)} L{f(x - s)},{f(y)} L{f(x - s * 0.3)},{f(y - s * 0.3)} Z',
                f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')


def halo_of(ex, line):
    """A pale halo copy of line-art extras so they read on the night water."""
    h = ex.replace(f'stroke="{line}"', f'stroke="{P["halo"]}"').replace(f'fill="{line}"', f'fill="{P["halo"]}"')
    h = re.sub(r'stroke-width="([\d.]+)"', lambda m: f'stroke-width="{f(float(m.group(1)) + 3.4)}"', h)
    return f'<g opacity=".6">{h}</g>' + ex


# ======================================================================= TIBO
SEAT = (150, 292)
GRIP = (205, 175)
ROD_A = -1.05
GRIP2 = (GRIP[0] + 15 * math.cos(ROD_A), GRIP[1] + 15 * math.sin(ROD_A))   # far paw, further up the rod
NECK = (166, 172)                   # head tilt pivot
HEAD_PTS = [(98, 116), (106, 84), (134, 62), (174, 58), (208, 72), (228, 100), (230, 126), (214, 152), (184, 168),
            (148, 170), (118, 160), (102, 140)]
EYE_N = (148, 121, 17.5)            # near eye (viewer's left, bigger)
EYE_F = (196, 115, 13.5)            # far eye
MOUTH = (200, 146)
NOSTRIL = (224, 116)
SH_N = (148, 204)                   # near shoulder
SH_F = (192, 192)                   # far shoulder
ARM_W = 25
PAW_R = 12

# front flippers: (far arm pts, near arm pts) — paws end at GRIP2 (far) and GRIP (near), except wave
ARMS = {
    'hold':  ([SH_F, (216, 190), GRIP2], [SH_N, (168, 214), GRIP]),
    'cheer': ([SH_F, (228, 160), GRIP2], [SH_N, (150, 168), GRIP]),
    'cast':  ([SH_F, (222, 188), GRIP2], [SH_N, (180, 210), GRIP]),
    'reel':  ([SH_F, (208, 200), GRIP2], [SH_N, (150, 222), GRIP]),
    'wave':  ([SH_F, (214, 194), GRIP], [SH_N, (112, 196), (88, 150)]),
}

#              eyes       mouth       tilt  shift      brows      look      arms
POSES = {
    'idle':   ('open',    'smile',     0,   (0, 0),    None,      (-2, 2),  'hold'),
    'blink':  ('closed',  'smile',     0,   (0, 0),    None,      (-2, 2),  'hold'),
    'talk':   ('open',    'talk',      0,   (0, 0),    None,      (-2, 2),  'hold'),
    'happy':  ('wide',    'big',       0,   (0, 0),    None,      (-2, 1),  'hold'),
    'cheer':  ('happy',   'big',      -4,   (0, -4),   None,      (0, 0),   'cheer'),
    'think':  ('look',    'hmm',       8,   (0, 0),    (0, 6),    (4, -6),  'hold'),
    'oops':   ('wide',    'o',        -9,   (0, 0),    (7, 2),    (-2, 1),  'hold'),
    'cast':   ('open',    'grin',      7,   (8, 5),    None,      (3, 1),   'cast'),
    'reel':   ('open',    'grin',     -7,   (-7, -2),  (-3, -3),  (2, 0),   'reel'),
    'wave':   ('open',    'big',       0,   (0, 0),    None,      (-2, 2),  'wave'),
    'title':  ('wide',    'big',       0,   (0, 0),    None,      (-2, 2),  'wave'),
    'icon':   ('open',    'big',      -3,   (-2, 0),   None,      (2, -2),  'reel'),   # icon only
}


def eye(cx, cy, r, mode='open', look=(0, 2)):
    o = ''
    if mode in ('open', 'wide', 'look', 'focus'):
        rr = r * (1.08 if mode == 'wide' else 1)
        ry = rr * (0.86 if mode == 'focus' else 1)
        o += ell(cx, cy, rr * 0.86, ry, fl(P['white'], P['line'], 3.2))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.74 if mode == 'wide' else 0.68)
        o += ell(px, py, pr * 0.88, pr, f'fill="{P["pupil"]}"')
        o += circ(px - pr * 0.32, py - pr * 0.4, pr * 0.42, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.4, py + pr * 0.42, pr * 0.18, 'fill="#FFFFFF"')
        if mode == 'focus':      # a determined upper lid
            o += path(f'M{f(cx - rr * 0.95)},{f(cy - ry * 0.55)} Q{f(cx)},{f(cy - ry * 0.95)} {f(cx + rr * 0.95)},{f(cy - ry * 0.4)}',
                      st(P['line'], 3.6))
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.8)},{f(cy)} Q{f(cx)},{f(cy + r * 0.62)} {f(cx + r * 0.8)},{f(cy)}', st(P['pupil'], 4.6))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.8)},{f(cy + r * 0.32)} Q{f(cx)},{f(cy - r * 0.9)} {f(cx + r * 0.8)},{f(cy + r * 0.32)}',
                  st(P['pupil'], 5.2))
    return o


def mouth(mode):
    mx, my = MOUTH
    line = P['line']
    o = ''
    if mode == 'smile':          # a wide gentle beak smile curling up at the snout
        o += path(f'M{mx - 22},{my - 3} Q{mx - 4},{my + 12} {mx + 16},{my - 6}', st(line, 3.8))
        o += path(f'M{mx - 24},{my - 6} Q{mx - 23},{my - 2} {mx - 20},{my - 1}', st(line, 3))
    elif mode == 'talk':
        o += path(f'M{mx - 20},{my - 4} Q{mx - 2},{my + 1} {mx + 16},{my - 7} Q{mx + 12},{my + 14} {mx - 2},{my + 15} '
                  f'Q{mx - 16},{my + 13} {mx - 20},{my - 4} Z', fl(P['mouth'], line, 3.2))
        o += ell(mx - 2, my + 10, 8, 3.6, f'fill="{P["tongue"]}"')
    elif mode in ('big', 'grin'):
        h = 19 if mode == 'big' else 15
        o += path(f'M{mx - 24},{my - 5} Q{mx - 2},{my + 2} {mx + 18},{my - 9} '
                  f'Q{mx + 14},{my + h} {mx - 4},{my + h} Q{mx - 20},{my + h - 2} {mx - 24},{my - 5} Z',
                  fl(P['mouth'], line, 3.2))
        o += path(f'M{mx - 13},{my + h - 3} Q{mx - 3},{my + 6} {mx + 7},{my + h - 4} Q{mx - 3},{my + h + 1} {mx - 13},{my + h - 3} Z',
                  f'fill="{P["tongue"]}"')
    elif mode == 'grit':         # determined grin: closed teeth line
        o += path(f'M{mx - 22},{my - 4} Q{mx - 2},{my + 2} {mx + 16},{my - 8} Q{mx + 12},{my + 9} {mx - 4},{my + 9} '
                  f'Q{mx - 18},{my + 8} {mx - 22},{my - 4} Z', fl('#FFFDF5', line, 3.2))
        o += path(f'M{mx - 20},{my + 1} Q{mx - 2},{my + 5} {mx + 14},{my - 3}', st(P['bellyLine'], 1.8))
    elif mode == 'o':
        o += ell(mx - 2, my + 3, 6, 7, fl(P['mouth'], line, 3))
    elif mode == 'hmm':
        o += path(f'M{mx - 18},{my + 1} Q{mx - 9},{my - 4} {mx - 1},{my + 1} Q{mx + 6},{my + 5} {mx + 13},{my - 1}',
                  st(line, 3.8))
    return o


def hat(doc):
    """Straw sun hat: a wide tilted brim, a round crown, a teal ribbon band + bow with tails at the back."""
    o = ''
    # ribbon tails fluttering behind (left), under the brim
    o += path('M86,84 C74,92 66,104 64,116 L76,112 L80,122 C84,108 92,96 100,88 Z', fl(P['teal'], P['tealD'], 3))
    brim = ell(158, 80, 88, 21, '{a} transform="rotate(-7 158 80)"')
    hi = path('M88,84 Q110,70 150,66', st('#FFFFFF', 4) + ' opacity=".35"')
    weave = ''
    for k, (rx, ry) in enumerate(((74, 16), (58, 12.4))):
        weave += ell(158, 80, rx, ry, f'fill="none" stroke="{P["weave"]}" stroke-width="2" transform="rotate(-7 158 80)"')
    for a in range(0, 360, 20):
        x0, y0 = 158 + 60 * math.cos(math.radians(a)), 80 + 13 * math.sin(math.radians(a))
        x1, y1 = 158 + 84 * math.cos(math.radians(a)), 80 + 19 * math.sin(math.radians(a))
        x0, y0 = rot(x0, y0, -7, 158, 80)
        x1, y1 = rot(x1, y1, -7, 158, 80)
        weave += path(f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)}', st(P['weave'], 1.6) + ' opacity=".8"')
    o += doc.shaded(brim, P['hat'], P['hatSh'], P['hatLine'], dx=-6, dy=-7, w=4, hi=hi, inner=weave)
    # crown
    crown = '<path d="M112,80 C110,52 126,30 156,28 C186,26 204,46 204,72 C190,82 128,86 112,80 Z" {a}/>'
    cw = ''
    for y in (40, 52, 64):
        cw += path(f'M100,{y + 6} Q156,{y - 6} 214,{y - 2}', st(P['weave'], 2) + ' opacity=".9"')
    for x in (124, 140, 156, 172, 188):
        for y in (46, 58):
            cw += path(f'M{x + (y - 52) * 0.1},{y - 4} l1,7', st(P['weave'], 1.6) + ' opacity=".7"')
    chi = ell(134, 44, 11, 6, 'fill="#FFFFFF" opacity=".35" transform="rotate(-30 134 44)"')
    o += doc.shaded(crown, P['hat'], P['hatSh'], P['hatLine'], dx=-8, dy=-5, w=4, hi=chi, inner=cw)
    # ribbon band around the crown base + a small bow at the back-left
    band = 'M111,70 C130,78 186,76 205,62 L205,72 C188,86 128,88 112,80 Z'
    o += path(band, fl(P['teal'], P['tealD'], 3))
    o += path('M114,74 C132,80 184,78 203,66', st('#FFFFFF', 2) + ' opacity=".35"')
    o += path('M110,76 C98,64 88,66 90,76 C92,86 104,84 110,76 Z', fl(P['teal'], P['tealD'], 3))
    o += path('M110,76 C102,88 96,94 98,98 C106,98 112,88 110,76 Z', fl(P['teal'], P['tealD'], 3))
    o += circ(111, 76, 5, fl(P['teal'], P['tealD'], 2.6))
    return o


def head(doc, pose, with_hat=True):
    eyes, mo, tilt, shift, brows, look, _ = POSES[pose]
    hd = ptsd(HEAD_PTS)
    cid_shade = doc.clip(f'<path d="{hd}"/>')
    # neck behind the head
    o = tube('M168,196 L170,156', 46, P['line'], P['skin'])
    o += path('M150,186 Q170,194 190,184', st(P['sh'], 3) + ' opacity=".8"')
    hi = ell(118, 118, 9, 14, 'fill="#FFFFFF" opacity=".28" transform="rotate(20 118 118)"')
    o += doc.shaded(f'<path d="{hd}" {{a}}/>', P['skin'], P['sh'], P['line'], dx=-12, dy=-10, hi=hi)
    # shade of the hat brim on the forehead
    o += f'<g clip-path="url(#{cid_shade})">' + ell(160, 96, 84, 16, f'fill="{P["sh"]}" opacity=".7" transform="rotate(-7 160 96)"') + '</g>'
    # little forehead scale spots (turtle texture, subtle)
    for (x, y, r) in ((118, 136, 3.4), (126, 146, 2.6), (110, 128, 2.2)):
        o += circ(x, y, r, f'fill="{P["sh"]}" opacity=".7"')
    o += ell(130, 146, 14, 8.5, f'fill="{P["cheek"]}" opacity=".85"')
    o += ell(217, 138, 7, 5, f'fill="{P["cheek"]}" opacity=".8"')
    o += mouth(mo)
    nx, ny = NOSTRIL
    o += ell(nx, ny, 2.4, 1.8, f'fill="{P["line"]}"') + ell(nx - 8, ny - 1, 2, 1.6, f'fill="{P["line"]}" opacity=".8"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 6 - lift
            o += path(f'M{f(cx - 8)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 8)},{f(y + 3)}', st(P['line'], 3.6))
    if with_hat:
        o += hat(doc)
    tr = ''
    if shift != (0, 0):
        tr += f'translate({shift[0]},{shift[1]}) '
    if tilt:
        tr += f'rotate({tilt} {NECK[0]} {NECK[1]})'
    if tr:
        o = f'<g transform="{tr.strip()}">{o}</g>'
    return o


def shell_and_body(doc):
    """Everything that never changes: tail, far foot, shell, body + belly plate, near hind foot."""
    o = ''
    # tiny tail peeking out at the back bottom
    o += path('M66,268 Q46,276 40,286 Q56,288 74,280 Z', fl(P['farSkin'], P['line'], 3.8))
    # far hind foot (behind)
    o += ell(238, 272, 17, 12, fl(P['farSkin'], P['line'], 4) + ' transform="rotate(-10 238 272)"')
    for (x, y) in ((250, 266), (254, 273)):
        o += circ(x, y, 2.6, f'fill="{P["claw"]}"')
    # carapace (back shell): a big dome on his back (left)
    shell = ('M58,252 C44,206 58,160 96,146 C124,136 154,146 168,170 C178,190 176,240 166,270 C150,290 84,292 66,280 Z')
    tpl = f'<path d="{shell}" {{a}}/>'
    plates = ''
    for pts in (
            [(96, 160), (128, 152), (150, 170), (140, 200), (106, 202), (86, 182)],
            [(106, 206), (140, 204), (152, 232), (136, 258), (102, 258), (90, 232)],
            [(60, 200), (82, 186), (100, 206), (86, 232), (60, 230)],
            [(60, 236), (86, 238), (96, 262), (76, 276), (60, 266)]):
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        sm = [(cx + (x - cx) * 0.86, cy + (y - cy) * 0.86) for (x, y) in pts]
        plates += path(ptsd(sm), f'fill="{P["plateL"]}" stroke="{P["plate"]}" stroke-width="4" stroke-linejoin="round" opacity=".95"')
    # cream rim along the front / bottom edge of the shell
    rim = path('M170,176 C180,206 178,246 166,272 C148,292 86,294 64,280', st(P['rim'], 13))
    rim += path('M165,190 L177,192 M171,222 L183,222 M168,252 L180,256 M146,280 L150,292 M116,284 L116,296 M88,282 L84,292',
                st(P['rimLine'], 2) + ' opacity=".8"')
    hi = ell(98, 168, 18, 9, 'fill="#FFFFFF" opacity=".33" transform="rotate(-30 98 168)"')
    o += doc.shaded(tpl, P['shell'], P['shellSh'], P['shellLine'], dx=-12, dy=-8, hi=hi, inner=plates + rim)
    # body (sage) in front of the shell, with the cream belly plate
    body = '<ellipse cx="170" cy="236" rx="46" ry="54" {a}/>'
    bid = doc.clip('<ellipse cx="170" cy="236" rx="46" ry="54"/>')
    o += doc.shaded(body, P['skin'], P['sh'], P['line'], dx=-8, dy=-8, w=0)
    bp = 'M150,188 C176,180 206,192 210,222 C214,252 200,280 176,286 C156,290 140,272 140,240 C140,212 140,194 150,188 Z'
    belly = doc.shaded(f'<path d="{bp}" {{a}}/>', P['belly'], P['bellySh'], P['bellyLine'], dx=-6, dy=-6, w=3.2)
    belly += path('M142,222 Q176,214 210,226 M140,254 Q174,248 206,260', st(P['bellyLine'], 2.6) + ' opacity=".7"')
    belly += path('M176,186 Q178,236 176,286', st(P['bellyLine'], 2.4) + ' opacity=".55"')
    o += f'<g clip-path="url(#{bid})">{belly}</g>'
    o += body.format(a=f'fill="none" stroke="{P["line"]}" stroke-width="{f(LW)}"')
    # near hind foot sticking out to the right
    o += doc.shaded('<ellipse cx="206" cy="276" rx="25" ry="14" {a}/>', P['skin'], P['sh'], P['line'], dx=-5, dy=-5)
    for (x, y) in ((222, 268), (229, 275), (224, 283)):
        o += circ(x, y, 3, fl(P['claw'], P['bellyLine'], 1.4))
    o += circ(196, 274, 2.6, f'fill="{P["sh"]}"') + circ(206, 280, 2, f'fill="{P["sh"]}"')
    return o


def arm(pts, far=False):
    """Front flipper tube through pts + a round paw with little cream claws. Returns svg."""
    d = ptsd(pts, close=False)
    skin = P['farSkin'] if far else P['skin']
    o = tube(d, ARM_W - (2 if far else 0), P['line'], skin)
    hx, hy = pts[-1]
    r = PAW_R - (1 if far else 0)
    o += circ(hx, hy, r, fl(skin, P['line'], 3.6))
    ex, ey = pts[-2]
    ln = math.hypot(hx - ex, hy - ey) or 1
    tx, ty = (hx - ex) / ln, (hy - ey) / ln
    nx, ny = -ty, tx
    for k in (-1, 0, 1):
        cx, cy = hx + tx * r * 0.78 + nx * k * r * 0.5, hy + ty * r * 0.78 + ny * k * r * 0.5
        o += circ(cx, cy, 2.4, f'fill="{P["claw"]}"')
    return o


def rod_title():
    """Title only: a tiny bamboo rod from the grip with a cream fish on the line."""
    gx, gy = GRIP
    L = 92
    tx, ty = gx + L * math.cos(ROD_A) + 6, gy + L * math.sin(ROD_A) + 4      # slight bend at the tip
    mx, my = gx + L * 0.55 * math.cos(ROD_A), gy + L * 0.55 * math.sin(ROD_A)
    d = f'M{f(gx - 10 * math.cos(ROD_A))},{f(gy - 10 * math.sin(ROD_A))} Q{f(mx)},{f(my)} {f(tx)},{f(ty)}'
    o = path(d, st(P['node'], 8)) + path(d, st(P['bamboo'], 4.4))
    for k in (0.3, 0.55, 0.8):
        nx, ny = gx + L * k * math.cos(ROD_A), gy + L * k * math.sin(ROD_A)
        o += circ(nx + k * 3, ny + k * 2, 3.4, f'fill="{P["node"]}"')
    # line down to the fish
    fx, fy = tx + 4, 146
    o += path(f'M{f(tx)},{f(ty)} Q{f(tx + 10)},{f((ty + fy) / 2)} {f(fx)},{f(fy - 22)}', st('#B8A882', 3.2))
    o += path(f'M{f(tx)},{f(ty)} Q{f(tx + 10)},{f((ty + fy) / 2)} {f(fx)},{f(fy - 22)}', st(P['fishline'], 1.6))
    # the float
    o += ell(tx + 6, 104, 5, 7, fl('#FFF8E6', '#8E7A55', 2)) + path(f'M{f(tx + 1.2)},104 L{f(tx + 10.8)},104', st(P['teal'], 3))
    # little cream fish hanging nose-up, wiggling
    o += f'<g transform="translate({f(fx)},{f(fy)}) rotate(-80)">'
    o += path('M18,0 L34,-11 Q30,0 34,11 Z', fl('#F7CBA8', '#B08E62', 2.6))
    o += ell(0, 0, 22, 13, fl('#FFF4DE', '#B08E62', 2.8))
    o += ell(2, 5, 13, 5, 'fill="#E9D3AE"')
    o += path('M-2,-12 Q6,-20 12,-11', fl('#F7CBA8', '#B08E62', 2.2))
    o += circ(-12, -3, 3.4, 'fill="#2F2A3A"') + circ(-13, -4, 1.2, 'fill="#FFFFFF"')
    o += path('M-21,2 Q-18,5 -15,3', st('#B08E62', 1.8))
    o += '</g>'
    o += path(f'M{f(fx - 16)},{f(fy + 8)} L{f(fx - 24)},{f(fy + 10)} M{f(fx + 16)},{f(fy + 8)} L{f(fx + 24)},{f(fy + 10)}',
              st('#FFF8E6', 3) + ' opacity=".9"')
    return o


def extras(pose):
    line = P['line']
    soft = st(line, 3.6) + ' opacity=".8"'
    ex = ''
    if pose in ('wave', 'title'):
        hx, hy = ARMS['wave'][1][-1]
        ex += path(f'M{hx - 18},{hy - 16} Q{hx - 28},{hy - 2} {hx - 26},{hy + 14} '
                   f'M{hx - 26},{hy - 32} Q{hx - 42},{hy - 12} {hx - 38},{hy + 12}', soft)
    if pose == 'oops':
        ex += path('M250,40 Q250,28 260,28 Q270,28 268,38 Q266,46 258,48 L258,54', st(line, 4) + ' opacity=".8"')
        ex += circ(258, 64, 2.8, f'fill="{line}" opacity=".8"')
    if pose == 'think':
        for (x, y, r) in ((254, 58, 3.4), (266, 40, 5), (280, 18, 7)):
            ex += circ(x, y, r, f'fill="none" stroke="{line}" stroke-width="2.6" opacity=".75"')
    if pose == 'cast':      # swoosh behind the head: leaning forward
        ex += path('M84,100 Q72,112 76,128 M70,86 Q54,104 60,128', soft)
    if pose == 'reel':
        ex += path('M84,120 Q74,130 80,142', soft) + path('M236,60 Q246,52 252,58', soft)
    out = halo_of(ex, line) if ex else ''
    if pose in ('cheer', 'happy'):
        out += star4(246, 70, 8, w=1.8) + star4(262, 104, 6, w=1.6) + star4(80, 64, 6.5, w=1.6)
        if pose == 'cheer':
            out += star4(236, 30, 5, w=1.4) + star4(70, 104, 5, w=1.4)
    return out


def tibo(doc, pose):
    eyes, mo, tilt, shift, brows, look, arms = POSES[pose]
    far, near = ARMS[arms]
    o = shell_and_body(doc)
    o += arm(far, far=True)
    o += head(doc, pose)
    if pose == 'title':
        o += rod_title()
    o += arm(near)
    o += extras(pose)
    return o


def pt(x, y, pose):
    _, _, tilt, shift, _, _, _ = POSES[pose]
    if tilt:
        x, y = rot(x, y, tilt, *NECK)
    return [round(x + shift[0]), round(y + shift[1])]


def write_tibo():
    out = {}
    for pose in POSES:
        if pose == 'icon':
            continue
        d = Doc('t')
        b = tibo(d, pose)
        name = f'tibo_{pose}'
        write(f'characters/{name}.svg', svg(300, 300, b, ''.join(d.defs), comment='grip 205 175'))
        far, near = ARMS[POSES[pose][6]]
        out[pose] = {'grip': list(GRIP), 'farPaw': [round(far[-1][0]), round(far[-1][1])],
                     'nearPaw': [round(near[-1][0]), round(near[-1][1])],
                     'mouth': pt(MOUTH[0], MOUTH[1] + 4, pose), 'eye': pt(EYE_N[0], EYE_N[1], pose),
                     'head': pt(164, 114, pose), 'hatTop': pt(156, 26, pose)}
        if pose == 'title':
            out[pose]['rod'] = 'drawn in the file (tiny rod + cream fish)'
    os.makedirs(os.path.dirname(PTS_JSON), exist_ok=True)
    with open(PTS_JSON, 'w') as fh:
        json.dump(out, fh, indent=1)
        fh.write('\n')
    return out


# ======================================================================= PTERO — 0 0 200 140, centre (100,70), RIGHT
PT = {'b': '#B9A9C9', 'sh': '#9E8DB1', 'line': '#6A5A80', 'wing': '#C4B6D3', 'wingSh': '#A897BC', 'wingL': '#E2D9EC',
      'far': '#A898BB', 'farSh': '#9282A8', 'belly': '#F3E7D2', 'beak': '#F4D7A6', 'beakLine': '#B08E62'}

PT_WINGS = {   # (shoulder, wrist, tip, trailing-edge points back to the hip) per wing, per frame
    'glide': {'far': ((104, 70), (78, 26), (30, 16), [(46, 34), (64, 44), (82, 58), (92, 80)]),
              'near': ((96, 78), (58, 60), (8, 74), [(26, 92), (46, 96), (66, 98), (86, 94)])},
    'flap':  {'far': ((104, 72), (82, 100), (52, 126), [(68, 130), (82, 124), (94, 110), (100, 94)]),
              'near': ((96, 80), (62, 104), (20, 122), [(36, 132), (56, 134), (76, 126), (90, 104)])},
}


def ptero(flap=False):
    d = Doc('p')
    W = PT_WINGS['flap' if flap else 'glide']
    o = ''

    def wing(spec, near):
        sh, wr, tip, trail = spec
        pts = [sh, wr, tip] + trail
        dd = f'M{sh[0]},{sh[1]} Q{f((sh[0] + wr[0]) / 2)},{f((sh[1] + wr[1]) / 2 - 8)} {wr[0]},{wr[1]} L{tip[0]},{tip[1]}'
        # scalloped trailing edge: little inward arcs between the trailing points
        prev = tip
        for q in trail:
            mx, my = (prev[0] + q[0]) / 2, (prev[1] + q[1]) / 2
            # bulge toward the wrist (inwards)
            ix, iy = mx + (wr[0] - mx) * 0.12, my + (wr[1] - my) * 0.12
            dd += f' Q{f(ix)},{f(iy)} {q[0]},{q[1]}'
            prev = q
        dd += ' Z'
        base, shade = (PT['wing'], PT['wingSh']) if near else (PT['far'], PT['farSh'])
        hi = path(f'M{sh[0]},{sh[1]} Q{f((sh[0] + wr[0]) / 2)},{f((sh[1] + wr[1]) / 2 - 4)} {wr[0]},{wr[1]} L{tip[0]},{tip[1]}',
                  st(PT['wingL'], 5) + ' opacity=".8"')
        w = d.shaded(f'<path d="{dd}" {{a}}/>', base, shade, PT['line'], dx=-3, dy=-4, w=3.6, hi=hi)
        # two soft membrane folds from the wrist
        for q in (trail[0], trail[2]):
            w += path(f'M{wr[0]},{wr[1]} Q{f((wr[0] + q[0]) / 2 + 3)},{f((wr[1] + q[1]) / 2)} {q[0]},{q[1]}',
                      st(PT['line'], 1.8) + ' opacity=".35"')
        # little wrist thumb
        w += circ(wr[0], wr[1], 3.4, fl(PT['belly'], PT['line'], 1.8))
        return w

    o += wing(W['far'], False)
    # tail + feet
    o += path('M80,90 Q66,100 56,100 Q64,92 74,84 Z', fl(PT['b'], PT['line'], 3))
    o += path('M90,98 L86,108 M100,100 L100,110', st(PT['line'], 4.4)) + path('M90,98 L86,108 M100,100 L100,110', st(PT['beak'], 2))
    # body
    hi = ell(88, 76, 7, 4, 'fill="#FFFFFF" opacity=".35" transform="rotate(-30 88 76)"')
    o += d.shaded('<ellipse cx="100" cy="86" rx="24" ry="17" {a}/>', PT['b'], PT['sh'], PT['line'], dx=-5, dy=-5, w=3.6, hi=hi)
    o += ell(108, 92, 13, 8, f'fill="{PT["belly"]}"')
    # neck + head with a big rounded crest pointing back
    o += tube('M112,80 Q120,70 126,62', 20, PT['line'], PT['b'])
    o += path('M122,44 C112,24 92,16 74,20 C88,30 104,44 114,58 Z', fl(PT['far'], PT['line'], 3.2))
    o += path('M112,40 C102,30 92,26 84,24', st(PT['wingL'], 2.6) + ' opacity=".8"')
    o += d.shaded('<circle cx="130" cy="56" r="21" {a}/>', PT['b'], PT['sh'], PT['line'], dx=-5, dy=-5, w=3.6,
                  hi=ell(120, 46, 6, 4, 'fill="#FFFFFF" opacity=".4" transform="rotate(-30 120 46)"'))
    # long rounded beak (pterosaur), gently down-curved, blunt rounded tip
    o += path('M146,50 C162,48 176,54 182,61 C184,65 180,67 176,67 C166,66 156,68 146,68 Z', fl(PT['beak'], PT['beakLine'], 3))
    o += path('M148,60 Q166,60 180,63', st(PT['beakLine'], 1.8))
    o += circ(164, 54, 1.4, f'fill="{PT["beakLine"]}"')
    # eye + cheek
    o += ell(134, 53, 7.4, 8.4, fl('#FFFFFF', PT['line'], 2.4)) + ell(135.5, 54.5, 4.6, 5.2, f'fill="{P["pupil"]}"')
    o += circ(134, 52.4, 1.9, 'fill="#FFFFFF"')
    o += ell(130, 68, 5, 3.4, f'fill="{P["cheek"]}" opacity=".9"')
    o += wing(W['near'], True)
    return svg(200, 140, o, ''.join(d.defs))


# ======================================================================= BRONTO — 0 0 260 300, bottom (130,296), LEFT
BR = {'b': '#8FC3C0', 'sh': '#73A9A6', 'line': '#467C79', 'far': '#80B6B3', 'belly': '#F2E6C8', 'bellyLine': '#A8916A',
      'spot': '#6E9F9C', 'drop': '#E6F7F6', 'dropLine': '#5E9FA3'}


def bronto(spray=False):
    d = Doc('b')
    o = ''
    # far legs (behind)
    for x in (126, 208):
        o += path(f'M{x - 16},246 L{x - 16},296 L{x + 16},296 L{x + 16},246 Z', fl(BR['far'], BR['line'], 4))
    # tail to the right
    o += path('M222,222 C248,226 258,246 258,262 C246,256 230,254 212,258 Z', fl(BR['b'], BR['line'], 4))
    # neck: a thick S-curve rising to the upper left; head sits on its top
    if not spray:
        neck = ('M104,240 C86,214 70,180 66,148 C62,122 58,104 52,90 L92,80 C94,100 98,122 106,144 '
                'C116,172 136,196 160,206 Z')
        head_c, head_a = (62, 72), 0
        nspots = ((76, 120, 5), (84, 150, 5.5), (98, 180, 5), (116, 204, 4.4))
    else:
        neck = ('M104,240 C88,212 80,184 80,156 C80,134 82,118 84,104 L122,104 C120,120 118,138 120,156 '
                'C122,180 138,198 160,206 Z')
        head_c, head_a = (92, 100), 34
        nspots = ((96, 132, 5), (98, 160, 5.5), (106, 186, 5), (120, 206, 4.4))
    o += d.shaded(f'<path d="{neck}" {{a}}/>', BR['b'], BR['sh'], BR['line'], dx=-8, dy=0, w=4.4, inner=''.join(
        circ(x, y, r, f'fill="{BR["spot"]}" opacity=".85"') for (x, y, r) in nspots))
    # body
    body = '<ellipse cx="170" cy="232" rx="74" ry="48" {a}/>'
    bid = d.clip('<ellipse cx="170" cy="232" rx="74" ry="48"/>')
    hi = ell(132, 204, 16, 8, 'fill="#FFFFFF" opacity=".3" transform="rotate(-20 132 204)"')
    spots = ''.join(circ(x, y, r, f'fill="{BR["spot"]}" opacity=".85"') for (x, y, r) in
                    ((162, 200, 7), (186, 196, 5.5), (208, 208, 6.5), (178, 216, 4), (224, 226, 4.5), (144, 214, 4)))
    o += d.shaded(body, BR['b'], BR['sh'], BR['line'], dx=-10, dy=-8, w=0, hi=hi, inner=spots)
    o += f'<g clip-path="url(#{bid})">' + ell(162, 282, 66, 26, f'fill="{BR["belly"]}"') + '</g>'
    o += body.format(a=f'fill="none" stroke="{BR["line"]}" stroke-width="4.4"')
    # near legs (front), chunky round-topped columns ending at the box bottom (knee-deep in the lake)
    for x in (140, 220):
        o += d.shaded(f'<path d="M{x - 19},296 L{x - 19},252 Q{x - 19},238 {x},238 Q{x + 19},238 {x + 19},252 L{x + 19},296 Z" {{a}}/>',
                      BR['b'], BR['sh'], BR['line'], dx=-5, dy=0, w=4.2)
    # water line ripples at the knees (soft, the game's lake sits over the feet)
    o += path('M108,284 Q140,277 172,284 M188,284 Q220,277 252,284', st('#FFFFFF', 3) + ' opacity=".6"')
    # head (facing left): round head, soft snout to the left, in head-local coords centred (0,0)
    hd = '<path d="M-30,-12 C-28,-30 -6,-38 14,-34 C36,-30 46,-12 40,6 C34,22 12,28 -10,24 C-28,22 -40,14 -40,2 C-40,-6 -36,-10 -30,-12 Z" {a}/>'
    ho = d.shaded(hd, BR['b'], BR['sh'], BR['line'], dx=-5, dy=-6, w=4.2,
                  hi=ell(-10, -24, 10, 5, 'fill="#FFFFFF" opacity=".35" transform="rotate(-20 -10 -24)"'))
    ho += ell(-8, -10, 10, 11, fl('#FFFFFF', BR['line'], 2.8)) + ell(-11, -8, 6.2, 7.2, f'fill="{P["pupil"]}"')
    ho += circ(-13.5, -11, 2.5, 'fill="#FFFFFF"') + circ(-8.5, -4, 1.1, 'fill="#FFFFFF"')
    ho += path('M-16,-24 Q-8,-28 0,-24', st(BR['line'], 2.6))
    ho += ell(4, 8, 8.5, 5.5, f'fill="{P["cheek"]}" opacity=".85"')
    ho += path('M-36,6 Q-26,15 -12,11', st(BR['line'], 3.2))
    ho += ell(-34, -4, 2.2, 1.7, f'fill="{BR["line"]}"')
    ho += circ(22, -18, 4.4, f'fill="{BR["spot"]}" opacity=".85"') + circ(30, -4, 3.2, f'fill="{BR["spot"]}" opacity=".85"')
    hx, hy = head_c
    o += f'<g transform="translate({hx},{hy}) rotate({head_a})">{ho}</g>'
    if spray:
        # water spout from the nostril, a fountain arching up with drops either side
        nx, ny = rot(-34, -4, head_a)
        nx, ny = nx + hx, ny + hy
        top = ny - 50
        sp = (f'M{f(nx - 3)},{f(ny - 2)} C{f(nx - 6)},{f(top + 22)} {f(nx - 12)},{f(top + 10)} {f(nx - 28)},{f(top + 8)} '
              f'C{f(nx - 16)},{f(top - 2)} {f(nx + 8)},{f(top - 4)} {f(nx + 20)},{f(top + 6)} '
              f'C{f(nx + 8)},{f(top + 10)} {f(nx + 4)},{f(top + 22)} {f(nx + 4)},{f(ny - 2)} Z')
        o += path(sp, fl(BR['drop'], BR['dropLine'], 3) + ' opacity=".95"')
        o += path(f'M{f(nx)},{f(ny - 8)} L{f(nx - 1)},{f(top + 16)}', st('#FFFFFF', 2.6))
        for (dx, dy, r) in ((-36, 12, 4.5), (-42, 26, 3.6), (30, 12, 4.5), (36, 28, 3.4), (-22, -4, 3.4),
                            (12, -6, 3.8), (-48, 4, 2.6), (44, 0, 2.6)):
            o += circ(nx + dx, top + dy, r, fl(BR['drop'], BR['dropLine'], 2))
    return svg(260, 300, o, ''.join(d.defs))


# ======================================================================= FROG — 0 0 120 100, bottom (60,96)
FR = {'b': '#A3B86C', 'sh': '#879C52', 'line': '#5C6E34', 'belly': '#F2E9C6', 'bellyLine': '#A8956A'}


def frog(jump=False):
    d = Doc('f')
    o = ''
    if not jump:
        o += ell(60, 95, 38, 2.6, 'fill="#3A2B2B" opacity=".14"')
        # back haunches + big feet
        for s in (-1, 1):
            o += ell(60 + s * 30, 80, 16, 13, fl(FR['sh'], FR['line'], 3.4))
            o += path(f'M{60 + s * 26},{92} Q{60 + s * 40},{88} {60 + s * 48},{94} L{60 + s * 24},{95} Z', fl(FR['b'], FR['line'], 3))
        lift = 0
    else:
        # stretched legs below
        for s in (-1, 1):
            o += path(f'M{60 + s * 14},70 Q{60 + s * 26},84 {60 + s * 22},96', st(FR['line'], 12)) + \
                path(f'M{60 + s * 14},70 Q{60 + s * 26},84 {60 + s * 22},96', st(FR['b'], 5.4))
            o += path(f'M{60 + s * 14},94 Q{60 + s * 26},90 {60 + s * 34},96 L{60 + s * 14},97 Z', fl(FR['b'], FR['line'], 2.6))
        lift = -14
    o += f'<g transform="translate(0,{lift})">'
    # body
    body = '<path d="M28,70 C26,48 40,40 60,40 C80,40 94,48 92,70 C92,86 78,92 60,92 C42,92 28,86 28,70 Z" {a}/>'
    o += d.shaded(body, FR['b'], FR['sh'], FR['line'], dx=-5, dy=-5, w=3.8,
                  hi=ell(42, 50, 8, 4.4, 'fill="#FFFFFF" opacity=".35" transform="rotate(-25 42 50)"'))
    o += ell(60, 76, 20, 13, fl(FR['belly'], FR['bellyLine'], 2.4))
    # eye bumps
    for x in (42, 78):
        o += d.shaded(f'<circle cx="{x}" cy="40" r="14" {{a}}/>', FR['b'], FR['sh'], FR['line'], dx=-3, dy=-3, w=3.6)
        o += ell(x, 40, 8.6, 9.4, fl('#FFFFFF', FR['line'], 2.2))
        o += ell(x + 1, 42, 5.4, 6, f'fill="{P["pupil"]}"') + circ(x - 1, 39.5, 2.2, 'fill="#FFFFFF"')
    o += circ(36, 62, 4.5, f'fill="{P["cheek"]}" opacity=".85"') + circ(84, 62, 4.5, f'fill="{P["cheek"]}" opacity=".85"')
    if jump:
        o += ell(60, 62, 6, 5, fl('#6E2C25', FR['line'], 2.4))
    else:
        o += path('M44,60 Q60,72 76,60', st(FR['line'], 3.2))
    o += circ(55, 52, 1.3, f'fill="{FR["line"]}"') + circ(65, 52, 1.3, f'fill="{FR["line"]}"')
    # front legs
    if not jump:
        for x in (46, 74):
            o += path(f'M{x},78 L{x + (x - 60) * 0.15},92', st(FR['line'], 9)) + path(f'M{x},78 L{x + (x - 60) * 0.15},92', st(FR['b'], 3.6))
            o += ell(x + (x - 60) * 0.15, 93, 6, 3, fl(FR['b'], FR['line'], 2.4))
    else:
        for s in (-1, 1):
            o += path(f'M{60 + s * 24},62 Q{60 + s * 36},52 {60 + s * 40},40', st(FR['line'], 9)) + \
                path(f'M{60 + s * 24},62 Q{60 + s * 36},52 {60 + s * 40},40', st(FR['b'], 3.6))
            o += circ(60 + s * 40, 38, 4.4, fl(FR['b'], FR['line'], 2.4))
    o += '</g>'
    return svg(120, 100, o, ''.join(d.defs))


# ======================================================================= FIREFLY — 0 0 48 48, centre (24,24)
def firefly():
    d = Doc('y')
    g = d.uid('r')
    d.defs.append(f'<radialGradient id="{g}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF3C4" stop-opacity=".95"/>'
                  f'<stop offset=".45" stop-color="#FFE9A0" stop-opacity=".5"/><stop offset="1" stop-color="#FFE9A0" stop-opacity="0"/>'
                  f'</radialGradient>')
    o = circ(24, 30, 18, f'fill="url(#{g})"')
    o += ell(15, 15, 8, 5, 'fill="#EEF4FF" fill-opacity=".75" stroke="#A9A6C8" stroke-width="1.4" transform="rotate(-35 15 15)"')
    o += ell(32, 14, 8, 5, 'fill="#EEF4FF" fill-opacity=".75" stroke="#A9A6C8" stroke-width="1.4" transform="rotate(30 32 14)"')
    o += circ(24, 31, 8.4, fl('#FFE9A0', '#D9B85A', 2))
    o += circ(22, 29, 3, 'fill="#FFFBE6"')
    o += circ(24, 19, 7.6, fl('#7A6A86', '#4E4260', 2))
    o += path('M21,12 Q18,6 14,5 M27,12 Q30,6 34,5', st('#4E4260', 1.6))
    o += circ(21.4, 18.5, 2, 'fill="#FFFFFF"') + circ(26.6, 18.5, 2, 'fill="#FFFFFF"')
    o += circ(21.8, 18.9, 1, f'fill="{P["pupil"]}"') + circ(27, 18.9, 1, f'fill="{P["pupil"]}"')
    o += path('M22,22.5 Q24,24 26,22.5', st('#F2C9D0', 1.2))
    return svg(48, 48, o, ''.join(d.defs))


# ======================================================================= ICON — 0 0 512 512
def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD8F0"/>'
                  f'<stop offset="1" stop-color="#FBE9C9"/></linearGradient>')
    w = d.uid('w')
    d.defs.append(f'<linearGradient id="{w}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD9D6"/>'
                  f'<stop offset="1" stop-color="#5FAFB4"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    o += circ(70, 74, 40, 'fill="#FFF3C8" opacity=".7"') + circ(70, 74, 26, 'fill="#FFF8DC"')
    # far mountains + a gentle volcano with a lazy smoke puff
    o += path('M0,300 L70,220 L130,262 L200,196 L270,268 L512,250 L512,330 L0,330 Z', 'fill="#B4B6DA"')
    o += path('M300,300 L370,170 L388,166 L404,168 L470,300 Z', fl('#A8A3CF', '#8A84B8', 3))
    o += path('M370,170 Q388,182 404,168', st('#F6B48A', 5))
    for (x, y, r) in ((392, 150, 14), (404, 128, 18), (424, 104, 22)):
        o += circ(x, y, r, 'fill="#FFFFFF" opacity=".85"')
    # a soft long-neck dino silhouette far away
    o += ('<g transform="translate(296,4) scale(-1,1) translate(-264,0)">' +
          path('M200,300 C204,284 222,280 236,286 C244,270 248,250 252,236 C254,228 262,226 264,232 '
               'C266,240 258,252 256,268 C254,282 258,296 264,300 Z', 'fill="#8090BC"') + '</g>')
    # lake
    o += path('M0,300 C120,292 380,298 512,292 L512,512 L0,512 Z', f'fill="url(#{w})"')
    o += path('M30,330 L140,330 M300,340 L460,340 M200,380 L320,380', st('#FFFFFF', 4) + ' opacity=".5"')
    # lily pad
    o += ell(420, 468, 52, 16, fl('#9CC08A', '#6F9361', 4))
    o += path('M420,468 L470,462 L462,476 Z', 'fill="#5FAFB4"')
    # Tibo on his rock (big, lower left), rod bent with a red fish on the line
    o += ell(150, 470, 150, 22, 'fill="#2E5B5E" opacity=".25"')
    rock = 'M-10,512 L-10,420 C10,380 70,360 150,362 C230,364 290,392 300,450 L310,512 Z'
    o += d.shaded(f'<path d="{rock}" {{a}}/>', '#A9A79C', '#8E8B80', '#66645B', dx=-10, dy=-10, w=5,
                  hi=path('M30,410 Q90,374 170,376', st('#FFFFFF', 6) + ' opacity=".3"'))
    o += path('M10,404 C60,368 160,358 240,378 C210,384 120,382 40,412 Z', fl('#A3B86C', '#6F7E44', 3))   # moss
    sc = 1.3
    tx, ty = 150 - 150 * sc, 382 - 292 * sc
    td = Doc('it')
    tb = tibo(td, 'icon')
    d.defs.extend(td.defs)
    # bent rod from the grip (drawn between the far and near paw layers: here simply over Tibo)
    gx, gy = tx + GRIP[0] * sc, ty + GRIP[1] * sc
    rtx, rty = 420, 128
    rod = f'M{f(gx - 10)},{f(gy + 14)} Q{f(gx + 80)},{f(gy - 230)} {rtx},{rty}'
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{tb}</g>'
    o += path(rod, st('#A9853E', 14)) + path(rod, st('#D9B66E', 8))
    fx, fy = 430, 250
    o += path(f'M{rtx},{rty} L{fx},{fy - 30}', st('#FFF8E6', 3.4))
    # fish: red, wriggling on the line, splash drops
    o += f'<g transform="translate({fx},{fy}) rotate(-70)">'
    o += path('M30,0 L58,-20 Q50,0 58,20 Z', fl('#A8282E', '#7E1E22', 4))
    o += ell(0, 0, 40, 25, fl('#E84A4A', '#A8282E', 5))
    o += ell(4, 10, 26, 10, 'fill="#FFF4DE"')
    o += ell(-14, -10, 12, 6, 'fill="#F7A0A0" opacity=".9"')
    o += path('M-2,-24 Q14,-40 26,-20', fl('#A8282E', '#7E1E22', 3.4))
    o += circ(-20, -4, 7, 'fill="#FFFFFF"') + circ(-21, -4, 4.4, 'fill="#2F2A3A"') + circ(-22.5, -6, 1.6, 'fill="#FFFFFF"')
    o += path('M-38,6 Q-32,12 -26,8', st('#7E1E22', 3))
    o += '</g>'
    for (x, y, r) in ((380, 280, 7), (476, 280, 6), (392, 306, 5), (466, 312, 5), (430, 318, 6)):
        o += circ(x, y, r, fl('#E6F7F6', '#5E9FA3', 2.4))
    o += path('M360,300 Q430,280 500,300', st('#FFFFFF', 5) + ' opacity=".8"')
    return svg(512, 512, o, ''.join(d.defs))


# ======================================================================= validation
ANSWER = {'#E84A4A', '#A8282E', '#F7A0A0', '#3C8DE8', '#1F5BA8', '#A6CCF5', '#FFD23F', '#C99A12', '#FFEB9C', '#4CC26B',
          '#2A8343', '#A8E6B8', '#FF9A2E', '#C4650C', '#FFCB8E', '#8E44AD', '#6840A8', '#D2BDF3', '#FF8FC0', '#C9558A',
          '#FFCCE2'}


def validate(files):
    bad = []
    for rel in files:
        s = open(os.path.join(OUT, rel)).read()
        m = re.match(r'<svg xmlns="http://www.w3.org/2000/svg" width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"', s)
        if not m or m.group(1) != m.group(3) or m.group(2) != m.group(4):
            bad.append(f'{rel}: width/height != viewBox')
        for k in ('<text', '<script', '<image', 'href', '@import', 'font', 'http://', 'https://'):
            body = s.replace('xmlns="http://www.w3.org/2000/svg"', '')
            if k in body:
                bad.append(f'{rel}: contains {k}')
        if s.count('feGaussianBlur') > 1:
            bad.append(f'{rel}: > 1 blur')
        ids = re.findall(r'id="([^"]+)"', s)
        if len(ids) != len(set(ids)):
            bad.append(f'{rel}: duplicate ids')
        for ref in re.findall(r'url\(#([^)]+)\)', s):
            if ref not in ids:
                bad.append(f'{rel}: dangling url(#{ref})')
        if rel != 'icon.svg':
            used = {c.upper() for c in re.findall(r'#[0-9A-Fa-f]{6}', s)}
            if used & ANSWER:
                bad.append(f'{rel}: answer colour {sorted(used & ANSWER)}')
        if rel.startswith('characters/tibo_') and '<!-- grip 205 175 -->' not in s:
            bad.append(f'{rel}: no grip comment')
    return bad


def main():
    tbl = write_tibo()
    files = [f'characters/tibo_{p}.svg' for p in tbl]
    for name, txt in (('ptero', ptero(False)), ('ptero_flap', ptero(True)), ('bronto', bronto(False)),
                      ('bronto_spray', bronto(True)), ('frog', frog(False)), ('frog_jump', frog(True)),
                      ('firefly', firefly())):
        write(f'characters/{name}.svg', txt)
        files.append(f'characters/{name}.svg')
    write('icon.svg', icon())
    files.append('icon.svg')
    bad = validate(files)
    for k, v in tbl.items():
        print(f'{k:6s} {v}')
    if bad:
        print('VALIDATION FAILED:\n  ' + '\n  '.join(bad))
        sys.exit(1)
    print(f'OK: {len(files)} SVGs valid')


if __name__ == '__main__':
    main()
