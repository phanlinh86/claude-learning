#!/usr/bin/env python3
"""Character art generator for Moka's Fairy Tea Party (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/moka_{idle,blink,talk,happy,cheer,think,oops,wave,point,sip,umbrella}.svg + moka_title.svg
        0 0 300 300, SEAT ANCHOR (150,292) = bottom centre of the sitting body. Moka (a small round honey-brown bear
        cub, cream muzzle / belly / inner ears / paw pads, cream knitted scarf with a small teal stripe, a cream teacup
        with a gold rim) SITS in 3/4 view facing RIGHT, eyes on the child. Body, hind legs, tail and scarf are identical
        in every frame; only head (face, tilt), arms, cup position and props change.
  characters/fairy.svg, fairy_flap.svg, fairy_sprinkle.svg      0 0 120 120, centre anchor (60,60), facing RIGHT
  characters/ladybug.svg, ladybug_step.svg, ladybug_fly.svg     0 0 100 100, feet anchor (50,96), facing RIGHT
  characters/butterfly.svg, butterfly_flap.svg                  0 0 120 120, centre anchor (60,60)
  characters/snail.svg, snail_peek.svg                          0 0 140 120, bottom anchor (70,116), facing RIGHT
  icon.svg                                                      0 0 512 512, full bleed, opaque, no text

Usage (from the game folder): python3 tools/art_moka.py && node tools/moka_sheet.js && node tools/render_icons.js
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone (never black), one-step cel
shade (lower right) + one soft highlight (upper left); no <text>/fonts/scripts/external refs; no filters (the fairy
glow is a radial gradient). Deterministic: re-running gives byte-identical files.
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
PTS_JSON = os.path.join(ROOT, 'docs', 'art', 'moka_bbox.json')   # points per frame; moka_sheet.js adds measured boxes
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Moka palette (DESIGN.md section 3) — never an answer colour
    'fur': '#C88A4E', 'sh': '#A46C38', 'line': '#6E4422', 'farFur': '#B97C43', 'farSh': '#956031',
    'cream': '#F4E2C4', 'creamSh': '#E2C9A2', 'creamLine': '#A8835A', 'farCream': '#E8D3B0',
    'nose': '#3A2B2B', 'pupil': '#2F2A3A', 'white': '#FFFFFF', 'cheek': '#F2A99A',
    'mouth': '#6E2C25', 'tongue': '#EE8F84',
    'scarf': '#FBF1DC', 'scarfSh': '#E8D7B6', 'scarfLine': '#A88B60', 'teal': '#6FB7B0', 'tealD': '#4E918A',
    'cup': '#FBF5E8', 'cupSh': '#E4D8C2', 'cupLine': '#A8916C', 'gold': '#D8B26A', 'goldD': '#A8843E', 'tea': '#B98A5E',
    'halo': '#FFF4E0',
}


# ------------------------------------------------------------------ tiny SVG helpers (same as tools/art_bo.py)
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

    def __init__(self, prefix='m'):
        self.prefix, self.defs, self.n = prefix, [], 0

    def uid(self, k='g'):
        self.n += 1
        return f'{self.prefix}{k}{self.n}'

    def clip(self, inner):
        cid = self.uid('c')
        self.defs.append(f'<clipPath id="{cid}">{inner}</clipPath>')
        return cid

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


# ======================================================================= MOKA
SEAT = (150, 292)
BODY = (148, 234, 60, 55.7)        # x 88-208, y 178-289.7 (+ outline → 292): round sitting body
HEAD = (156, 120, 72, 64)          # x 84-228, y 56-184: big round head
NECK = (158, 186)                  # tilt pivot
MUZ = (194, 148, 32, 23)           # cream muzzle pushed right (3/4 view)
NOSE = (211, 133)
MOUTH = (208, 158)
EYE_N = (146, 112, 15.5)           # near eye (viewer's left, bigger)
EYE_F = (192, 104, 12)             # far eye
EAR_N = (104, 66, 24)              # near round ear (upper left)
EAR_F = (208, 64, 20)              # far round ear (upper right)
SH_N = (130, 212)                  # near shoulder
SH_F = (194, 206)                  # far shoulder
ARM_W = 26
PAW_R = 12.5

CUP_HOLD = (204, 224)              # idle: held in front of the chest in both paws
CUP_LOW = (240, 232)               # one paw holding it beside the belly
CUP_UP = (250, 100)                # cheer: raised high
CUP_SIP = (236, 158)               # sip: at the mouth

CUP_S = 1.3                        # cup scale (cup body ≈ 52 × 34 viewBox px)
# arms: (far arm pts, near arm pts, cup centre, cup rotation)
ARMS = {
    'hold':  ([SH_F, (226, 222), (236, 230)], [SH_N, (146, 250), (180, 236)], CUP_HOLD, 0),
    'cheer': ([SH_F, (238, 176), (250, 122)], [SH_N, (96, 196), (76, 160)], CUP_UP, -8),
    'wave':  ([SH_F, (212, 240), (222, 246)], [SH_N, (92, 204), (66, 164)], CUP_LOW, 0),
    'think': ([SH_F, (212, 240), (222, 246)], [SH_N, (170, 228), (190, 186)], CUP_LOW, 0),
    'point': ([SH_F, (212, 240), (222, 246)], [SH_N, (190, 208), (254, 190)], CUP_LOW, 0),
    'sip':   ([SH_F, (246, 212), (256, 180)], [SH_N, (176, 222), (212, 182)], CUP_SIP, -28),
    'umb':   ([SH_F, (212, 240), (222, 246)], [SH_N, (92, 206), (78, 176)], CUP_LOW, 0),
}

#              eyes       mouth    tilt  brows     look       arms
POSES = {
    'idle':     ('open',    'smile',  0,   None,    (-1, 2),   'hold'),
    'blink':    ('closed',  'smile',  0,   None,    (-1, 2),   'hold'),
    'talk':     ('open',    'talk',   0,   None,    (-1, 2),   'hold'),
    'happy':    ('wide',    'big',    0,   None,    (-1, 1),   'hold'),
    'cheer':    ('happy',   'big',    0,   None,    (0, 0),    'cheer'),
    'think':    ('look',    'hmm',    8,   (0, 6),  (4, -5),   'think'),
    'oops':     ('wide',    'o',     -9,   (7, 2),  (-1, 1),   'hold'),
    'wave':     ('open',    'big',    0,   None,    (-1, 2),   'wave'),
    'point':    ('look',    'talk',   0,   (4, 4),  (5, -1),   'point'),
    'sip':      ('content', 'sip',    0,   None,    (0, 0),    'sip'),
    'umbrella': ('open',    'smile',  0,   None,    (-1, 1),   'umb'),
    'title':    ('wide',    'big',    0,   None,    (-1, 2),   'wave'),
    'icon':     ('open',    'big',    0,   None,    (-1, 2),   'hold'),    # icon only
}


def eye(cx, cy, r, mode='open', look=(0, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.08 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.88, rr, fl(P['white'], P['line'], 3.2))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.74 if mode == 'wide' else 0.7)
        o += ell(px, py, pr * 0.88, pr, f'fill="{P["pupil"]}"')
        o += circ(px - pr * 0.3, py - pr * 0.4, pr * 0.44, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.4, py + pr * 0.42, pr * 0.18, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.8)},{f(cy)} Q{f(cx)},{f(cy + r * 0.62)} {f(cx + r * 0.8)},{f(cy)}', st(P['pupil'], 4.6))
    elif mode == 'content':         # closed, relaxed, with a tiny lash: sipping tea
        o += path(f'M{f(cx - r * 0.85)},{f(cy + 2)} Q{f(cx)},{f(cy + r * 0.75)} {f(cx + r * 0.85)},{f(cy + 2)}',
                  st(P['pupil'], 4.6))
        o += path(f'M{f(cx - r * 0.85)},{f(cy + 2)} L{f(cx - r * 1.15)},{f(cy - 2)}', st(P['pupil'], 3.2))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.8)},{f(cy + r * 0.32)} Q{f(cx)},{f(cy - r * 0.9)} {f(cx + r * 0.8)},{f(cy + r * 0.32)}',
                  st(P['pupil'], 5.2))
    return o


def mouth(mode):
    mx, my = MOUTH
    line = P['line']
    o = path(f'M{NOSE[0] - 1},{NOSE[1] + 8} L{mx - 1},{my - 4}', st(line, 3))   # philtrum
    if mode in ('smile', 'sip'):     # little bear "w" smile
        o += path(f'M{mx - 13},{my - 4} Q{mx - 7},{my + 4} {mx - 1},{my - 3} Q{mx + 5},{my + 4} {mx + 11},{my - 5}',
                  st(line, 3.6))
    elif mode == 'talk':
        o += path(f'M{mx - 12},{my - 4} Q{mx},{my - 2} {mx + 11},{my - 5} Q{mx + 10},{my + 11} {mx},{my + 12} '
                  f'Q{mx - 11},{my + 10} {mx - 12},{my - 4} Z', fl(P['mouth'], line, 3.2))
        o += ell(mx, my + 7.5, 6, 3.4, f'fill="{P["tongue"]}"')
    elif mode == 'big':
        w, h = 15, 15
        o += path(f'M{f(mx - w)},{f(my - 5)} Q{mx},{f(my - 1)} {f(mx + w - 2)},{f(my - 7)} '
                  f'Q{f(mx + w * 0.8)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.8)},{f(my + h)} {f(mx - w)},{f(my - 5)} Z',
                  fl(P['mouth'], line, 3.2))
        o += path(f'M{mx - 7},{my + h - 3} Q{mx},{my + 6} {mx + 7},{my + h - 3} Q{mx},{my + h + 1} {mx - 7},{my + h - 3} Z',
                  f'fill="{P["tongue"]}"')
    elif mode == 'o':
        o += ell(mx, my + 3, 5.5, 6.5, fl(P['mouth'], line, 3))
    elif mode == 'hmm':
        o += path(f'M{mx - 11},{my + 1} Q{mx - 5},{my - 4} {mx},{my + 1} Q{mx + 5},{my + 5} {mx + 10},{my}', st(line, 3.6))
    return o


def ear(doc, cx, cy, r, far=False):
    fur, sh = (P['farFur'], P['farSh']) if far else (P['fur'], P['sh'])
    o = doc.shaded(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {{a}}/>', fur, sh, P['line'], dx=-4, dy=-4)
    # inner ear, pushed toward the head centre (down-in)
    ix = cx + (5 if not far else -3)
    o += circ(ix, cy + 4, r * 0.55, f'fill="{P["farCream"] if far else P["cream"]}"')
    return o


def head(doc, pose, crown=False):
    eyes, mo, tilt, brows, look, _ = POSES[pose]
    hx, hy, hrx, hry = HEAD
    o = ear(doc, *EAR_F, far=True) + ear(doc, *EAR_N)
    hi = ell(116, 86, 16, 9, 'fill="#FFFFFF" opacity=".28" transform="rotate(-38 116 86)"')
    o += doc.shaded(f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>', P['fur'], P['sh'], P['line'],
                    dx=-12, dy=-10, hi=hi)
    # a soft fur tuft on the forehead
    o += path('M146,62 Q152,50 160,56 Q166,48 174,56', st(P['line'], 3.4))
    mx, my, mrx, mry = MUZ
    o += doc.shaded(f'<ellipse cx="{mx}" cy="{my}" rx="{mrx}" ry="{mry}" {{a}}/>', P['cream'], P['creamSh'], P['creamLine'],
                    dx=-6, dy=-6, w=3.2)
    o += ell(124, 148, 13, 8, f'fill="{P["cheek"]}" opacity=".85"')
    o += ell(226, 124, 5.5, 4.2, f'fill="{P["cheek"]}" opacity=".8"')
    o += mouth(mo)
    nx, ny = NOSE
    o += path(f'M{nx - 11},{ny - 4} Q{nx},{ny - 9} {nx + 10},{ny - 5} Q{nx + 9},{ny + 5} {nx},{ny + 7} '
              f'Q{nx - 9},{ny + 5} {nx - 11},{ny - 4} Z', fl(P['nose'], P['nose'], 1.5))
    o += ell(nx - 4, ny - 3, 3.4, 1.9, 'fill="#FFFFFF" opacity=".6"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 7 - lift
            o += path(f'M{f(cx - 7)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 7)},{f(y + 3)}', st(P['line'], 3.4))
    if crown:
        o += flower_crown(doc)
    if tilt:
        o = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{o}</g>'
    return o


def flower_crown(doc):
    """Title pose: a little crown of cream / dusty-rose blossoms and sage leaves along the head top (no answer colours)."""
    o = path('M100,84 C118,58 190,50 222,74', st('#5E7C46', 9)) + path('M100,84 C118,58 190,50 222,74', st('#8DAA6A', 4.4))
    for (x, y, a) in ((112, 70, -50), (150, 56, -10), (196, 58, 30), (130, 62, 140), (176, 54, 200)):
        lx, ly = rot(x + 12, y, a, x, y)
        o += path(f'M{f(x)},{f(y)} Q{f((x + lx) / 2 + 4)},{f((y + ly) / 2 - 6)} {f(lx)},{f(ly)} '
                  f'Q{f((x + lx) / 2 - 4)},{f((y + ly) / 2 + 6)} {f(x)},{f(y)} Z', fl('#9DB07A', '#5E7C46', 2.2))
    for (x, y, r, c, cl) in ((104, 80, 9, '#F3E6CC', '#B8A27A'), (138, 60, 10.5, '#C98C86', '#94605B'),
                             (166, 54, 9, '#F3E6CC', '#B8A27A'), (196, 58, 10.5, '#C98C86', '#94605B'),
                             (220, 74, 8.5, '#F3E6CC', '#B8A27A')):
        for k in range(5):
            px, py = rot(x, y - r * 0.62, k * 72, x, y)
            o += circ(px, py, r * 0.5, fl(c, cl, 2))
        o += circ(x, y, r * 0.34, fl('#F2D58A', '#B89646', 1.6))
    return o


def body(doc):
    bx, by, brx, bry = BODY
    tpl = f'<ellipse cx="{bx}" cy="{f(by)}" rx="{brx}" ry="{f(bry)}" {{a}}/>'
    cid = doc.clip(tpl.format(a=''))
    belly = (f'<g clip-path="url(#{cid})">' + ell(182, 246, 30, 40, f'fill="{P["cream"]}"') +
             ell(194, 260, 16, 30, f'fill="{P["creamSh"]}"') + '</g>')
    hi = ell(112, 212, 12, 7, 'fill="#FFFFFF" opacity=".24" transform="rotate(-36 112 212)"')
    o = circ(90, 262, 11, fl(P['farFur'], P['line'], 4))      # little round tail at the back
    # far hind foot (peeks out at the right, behind the near foot)
    o += ell(238, 272, 14, 15, fl(P['farFur'], P['line'], 4))
    o += ell(242, 273, 8.5, 10, f'fill="{P["farCream"]}"')
    o += doc.shaded(tpl, P['fur'], P['sh'], P['line'], dx=-12, dy=-8, w=0, hi=hi)
    o += belly
    o += tpl.format(a=f'fill="none" stroke="{P["line"]}" stroke-width="{f(LW)}"')
    # near hind leg: a round thigh + a foot sticking out to the right with a cream pad and toe beans
    o += doc.shaded('<ellipse cx="170" cy="266" rx="34" ry="22" {a}/>', P['fur'], P['sh'], P['line'], dx=-8, dy=-6)
    o += path('M146,256 Q156,248 172,248', st('#FFFFFF', 3) + ' opacity=".22"')
    o += ell(206, 274, 17, 15.6, fl(P['fur'], P['line'], 4))
    o += ell(210, 275, 11, 11, f'fill="{P["cream"]}"')
    o += ell(211, 278, 5.2, 4.4, f'fill="{P["creamSh"]}"')
    for (x, y) in ((203, 268), (210, 265), (217, 268)):
        o += circ(x, y, 2.4, f'fill="{P["creamSh"]}"')
    return o


def scarf(doc):
    band = 'M102,178 C128,198 186,200 214,178 C218,184 219,193 215,198 C186,220 126,218 100,196 C97,190 98,183 102,178 Z'
    cid = doc.clip(f'<path d="{band}"/>')
    o = ''
    # hanging end on the near side (behind the band)
    tail = 'M110,192 L130,198 L124,238 L102,234 Z'
    o += doc.shaded(f'<path d="{tail}" {{a}}/>', P['scarf'], P['scarfSh'], P['scarfLine'], dx=-4, dy=-2, w=3.4)
    o += path('M126,214 L106,210', st(P['teal'], 5))
    o += path('M104,236 L103,244 M111,237 L110,245 M118,238 L117,246', st(P['scarfLine'], 2.6))
    o += path(band, f'fill="{P["scarf"]}"')
    o += (f'<g clip-path="url(#{cid})">' + path('M90,198 C128,224 186,224 226,194 L226,230 L90,230 Z',
                                                  f'fill="{P["scarfSh"]}"')
          + path('M100,188 C128,208 186,210 216,188', st(P['teal'], 5.5)) + '</g>')
    # knit ribs
    for x in (118, 136, 156, 176, 196):
        o += path(f'M{x},{196 if x < 150 else 197} l1,6', st(P['scarfLine'], 1.6) + ' opacity=".6"')
    o += path(band, f'fill="none" stroke="{P["scarfLine"]}" stroke-width="3.4" stroke-linejoin="round"')
    return o


def cup(cx, cy, ang=0, s=CUP_S):
    """Small cream teacup with a gold rim and handle on the right; (cx, cy) = cup centre."""
    o = ''
    t = f'translate({f(cx)},{f(cy)}) rotate({f(ang)}) scale({f(s)})'
    o += f'<g transform="{t}">'
    o += circ(19, -2, 7.5, f'fill="none" stroke="{P["cupLine"]}" stroke-width="7.6"')
    o += circ(19, -2, 7.5, f'fill="none" stroke="{P["cup"]}" stroke-width="3"')
    bowl = 'M-20,-11 L20,-11 Q19,10 0,13 Q-19,10 -20,-11 Z'
    o += path(bowl, f'fill="{P["cupSh"]}"')
    o += path('M-20,-11 L14,-11 Q12,7 -2,10 Q-17,8 -20,-11 Z', f'fill="{P["cup"]}"')
    o += path('M-19,-5 Q-1,-1 19,-5', st(P['gold'], 2.6))                       # gold band
    o += path('M-13,-4 Q-12,4 -6,8', st('#FFFFFF', 2.6) + ' opacity=".8"')       # shine
    o += path(bowl, f'fill="none" stroke="{P["cupLine"]}" stroke-width="3" stroke-linejoin="round"')
    o += ell(0, -11, 20, 4.6, fl(P['tea'], P['goldD'], 2.6))                      # tea + gold rim
    o += ell(0, -11, 20, 4.6, f'fill="none" stroke="{P["gold"]}" stroke-width="1.6"')
    o += ell(-6, -12, 6, 1.4, 'fill="#FFFFFF" opacity=".35"')
    o += '</g>'
    return o


def arm(pts, far=False):
    """Front arm tube through pts + a round cream-padded paw. Returns svg and the paw centre."""
    d = ptsd(pts, close=False)
    fur = P['farFur'] if far else P['fur']
    o = tube(d, ARM_W - (2 if far else 0), P['line'], fur)
    hx, hy = pts[-1]
    r = PAW_R - (1 if far else 0)
    o += circ(hx, hy, r, fl(fur, P['line'], 3.6))
    ex, ey = pts[-2]
    ln = math.hypot(hx - ex, hy - ey) or 1
    tx, ty = (hx - ex) / ln, (hy - ey) / ln
    o += circ(hx + tx * 3, hy + ty * 3, r * 0.5, f'fill="{P["farCream"] if far else P["cream"]}"')
    return o, (hx + tx * r, hy + ty * r)


def umbrella(doc):
    """A big mushroom cap held as an umbrella: dusty-rose cap with cream spots on a cream stalk (from the near paw)."""
    o = path('M80,188 L120,40', st(P['line'], 12)) + path('M80,188 L120,40', st('#F3E6CC', 6.4))
    o += '<g transform="rotate(-3 132 40)">'
    capd = 'M14,46 C16,16 74,5 132,5 C190,5 248,16 250,46 C222,40 180,36 132,36 C84,36 42,40 14,46 Z'
    hi = path('M42,30 Q70,13 110,11', st('#FFFFFF', 5) + ' opacity=".3"')
    o += doc.shaded(f'<path d="{capd}" {{a}}/>', '#C98C86', '#A8706B', '#7E4E4A', dx=-6, dy=-6, hi=hi)
    o += path('M18,45 C48,38 90,35 132,35 C174,35 216,38 246,45 C220,50 176,52 132,52 C88,52 44,50 18,45 Z',
              fl('#F3E6CC', '#B8A27A', 3))                                                 # gills underneath
    for x in (40, 62, 84, 106, 128, 150, 172, 194, 216):
        o += path(f'M{x},{41 if x in (40, 216) else 38} L{x + (x - 132) * 0.04},{49}', st('#D8C6A2', 1.8))
    for (x, y, rx, ry) in ((70, 22, 11, 7), (122, 13, 9, 5.5), (176, 18, 12, 7), (222, 32, 7, 5), (40, 35, 7, 5),
                           (150, 30, 6, 4)):
        o += ell(x, y, rx, ry, f'fill="#F3E6CC" opacity=".95"')
    o += '</g>'
    return o


def extras(pose, tip):
    soft = st(P['line'], 3.6) + ' opacity=".8"'
    ex = ''
    if pose in ('wave', 'title'):
        hx, hy = ARMS['wave'][1][-1]
        ex += path(f'M{hx - 18},{hy - 20} Q{hx - 28},{hy - 6} {hx - 26},{hy + 10} '
                   f'M{hx - 26},{hy - 36} Q{hx - 42},{hy - 16} {hx - 38},{hy + 8}', soft)
    if pose == 'cheer':
        cx, cy = CUP_UP
        ex += path(f'M{cx - 26},{cy - 26} L{cx - 34},{cy - 36} M{cx},{cy - 32} L{cx},{cy - 44} '
                   f'M{cx + 26},{cy - 24} L{cx + 34},{cy - 34}', soft)
    if pose == 'oops':
        ex += path('M246,50 Q246,38 256,38 Q266,38 264,48 Q262,56 254,58 L254,64', st(P['line'], 4) + ' opacity=".8"')
        ex += circ(254, 74, 2.8, f'fill="{P["line"]}" opacity=".8"')
    if pose == 'think':
        for (x, y, r) in ((246, 76, 3.4), (260, 58, 5), (276, 36, 7)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".75"')
    if pose == 'point':
        tx, ty = tip
        ex += path(f'M{f(tx + 8)},{f(ty - 12)} L{f(tx + 16)},{f(ty - 18)} M{f(tx + 10)},{f(ty)} L{f(tx + 20)},{f(ty)} '
                   f'M{f(tx + 8)},{f(ty + 12)} L{f(tx + 16)},{f(ty + 18)}', soft)
    if pose == 'sip':        # steam curls over the cup
        cx, cy = CUP_SIP
        ex += path(f'M{cx + 4},{cy - 30} Q{cx - 2},{cy - 40} {cx + 4},{cy - 50} Q{cx + 10},{cy - 60} {cx + 4},{cy - 70} '
                   f'M{cx + 18},{cy - 26} Q{cx + 13},{cy - 34} {cx + 18},{cy - 42}', st(P['line'], 3) + ' opacity=".55"')
    out = ''
    if ex:
        halo = (ex.replace(f'stroke="{P["line"]}"', f'stroke="{P["halo"]}"').replace(f'fill="{P["line"]}"', f'fill="{P["halo"]}"')
                .replace('stroke-width="2.6"', 'stroke-width="6"').replace('stroke-width="3.6"', 'stroke-width="7"')
                .replace('stroke-width="4"', 'stroke-width="7.4"').replace('stroke-width="3"', 'stroke-width="6.4"'))
        out = f'<g opacity=".55">{halo}</g>' + ex
    if pose == 'cheer':
        cx, cy = CUP_UP
        out += star4(cx + 30, cy + 34, 7, w=1.8) + star4(cx + 30, cy - 4, 6, w=1.6) + star4(cx - 16, cy - 50, 6, w=1.6)
    return out


def moka(doc, pose):
    eyes, mo, tilt, brows, look, arms = POSES[pose]
    far, near, (cx, cy), cang = ARMS[arms]
    o = body(doc)
    o += head(doc, pose, crown=(pose == 'title'))
    o += scarf(doc)
    far_arm, _ = arm(far, far=True)
    near_arm, tip = arm(near)
    if arms == 'hold':      # cup in front of the chest, both paws hug it from the sides
        o += far_arm + cup(cx, cy, cang) + near_arm
    elif arms == 'sip':
        o += far_arm + cup(cx, cy, cang) + near_arm
    elif arms == 'cheer':
        o += near_arm + cup(cx, cy, cang) + far_arm
    else:                   # cup held by the far paw beside the belly, the near arm does the gesture
        o += cup(cx, cy, cang) + far_arm
        if arms == 'umb':
            o += umbrella(doc)
        o += near_arm
    o += extras(pose, tip)
    return o, {'cup': [cx, cy], 'tip': [round(tip[0]), round(tip[1])]}


def pt(x, y, pose):
    tilt = POSES[pose][2]
    if tilt:
        x, y = rot(x, y, tilt, *NECK)
    return [round(x), round(y)]


def write_moka():
    out = {}
    for pose in POSES:
        if pose == 'icon':
            continue
        d = Doc('m')
        b, info = moka(d, pose)
        name = f'moka_{pose}'
        write(f'characters/{name}.svg', svg(300, 300, b, ''.join(d.defs)))
        out[pose] = {'cup': info['cup'], 'mouth': pt(MOUTH[0], MOUTH[1] + 4, pose), 'nose': pt(*NOSE, pose),
                     'head': pt(HEAD[0], HEAD[1], pose), 'headTop': pt(156, HEAD[1] - HEAD[3] - 14, pose),
                     'paw': info['tip'], 'eye': pt(EYE_N[0], EYE_N[1], pose)}
        if pose == 'umbrella':
            out[pose]['umbrellaCap'] = {'x0': 12, 'x1': 253, 'y0': 2, 'y1': 55, 'tilt': -3, 'stalk': [[80, 188], [120, 40]]}
    os.makedirs(os.path.dirname(PTS_JSON), exist_ok=True)
    with open(PTS_JSON, 'w') as fh:
        json.dump(out, fh, indent=1)
        fh.write('\n')
    return out


# ======================================================================= FAIRY (pip) — 0 0 120 120, centre (60,60)
FY = {'b': '#FFF7E0', 'sh': '#F1E2BC', 'line': '#C9B07A', 'wing': '#E8F4FF', 'vein': '#B9B3D6', 'cap': '#9DB07A',
      'capD': '#62784A', 'cheek': '#F4A9A0'}


def fairy(mode='rest'):
    d = Doc('f')
    g = d.uid('r')
    d.defs.append(f'<radialGradient id="{g}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF3C4" stop-opacity=".9"/>'
                  f'<stop offset=".55" stop-color="#FFE9A8" stop-opacity=".35"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/>'
                  f'</radialGradient>')
    o = circ(58, 62, 52, f'fill="url(#{g})"')               # warm glow
    up, lo = (-30, 22) if mode != 'flap' else (16, -14)     # wing angles around the hinge
    hinge = (48, 54)

    def wing(cx, cy, rx, ry, base_ang, ang):
        w = ell(cx, cy, rx, ry, f'fill="{FY["wing"]}" fill-opacity=".7" stroke="{FY["vein"]}" stroke-width="1.8" '
                f'transform="rotate({base_ang} {cx} {cy})"')
        w += path(f'M{hinge[0]},{hinge[1]} Q{f(cx)},{f(cy + 2)} {f(cx - rx * 0.7)},{f(cy - 2)}', st(FY['vein'], 1.4))
        w += path(f'M{hinge[0]},{hinge[1]} Q{f(cx + 2)},{f(cy - ry * 0.4)} {f(cx - rx * 0.4)},{f(cy - ry * 0.9)}',
                  st(FY['vein'], 1.2))
        return f'<g transform="rotate({ang} {hinge[0]} {hinge[1]})">{w}</g>'

    o += wing(34, 34, 22, 12, -30, up)        # upper wing pair (back)
    o += wing(34, 66, 16, 9, 24, lo)         # lower wing
    # body: a round sprite
    hi = ell(48, 52, 8, 5, 'fill="#FFFFFF" opacity=".7" transform="rotate(-35 48 52)"')
    o += d.shaded('<circle cx="62" cy="64" r="25" {a}/>', FY['b'], FY['sh'], FY['line'], dx=-5, dy=-5, w=3, hi=hi)
    # tiny arms
    if mode == 'sprinkle':
        o += path('M76,72 Q88,70 94,62', st(FY['line'], 6.4)) + path('M76,72 Q88,70 94,62', st(FY['b'], 3))
        # leaf wand: stem + little leaf + sparkle at the tip
        o += path('M94,64 L106,44', st(FY['capD'], 2.6))
        o += path('M106,44 Q114,36 112,26 Q102,30 106,44 Z', fl(FY['cap'], FY['capD'], 2))
        o += star4(112, 22, 7, w=1.4) + star4(98, 30, 3.6, w=1.2) + star4(116, 40, 3, w=1)
    else:
        o += path('M74,76 Q82,82 86,78', st(FY['line'], 6)) + path('M74,76 Q82,82 86,78', st(FY['b'], 2.8))
    o += path('M48,80 Q44,86 46,90', st(FY['line'], 5.6)) + path('M48,80 Q44,86 46,90', st(FY['b'], 2.4))
    # face (looking right)
    for (x, y, r) in ((64, 61, 4.2), (78, 60, 3.6)):
        o += ell(x, y, r * 0.85, r, f'fill="#2F2A3A"') + circ(x - 1.2, y - 1.6, r * 0.38, 'fill="#FFFFFF"')
    o += circ(57, 70, 3.6, f'fill="{FY["cheek"]}" opacity=".85"') + circ(82, 68, 2.6, f'fill="{FY["cheek"]}" opacity=".85"')
    o += path('M68,69 Q72,73 76,69', st('#8A6A4A', 2.2))
    # leaf cap with a curly stem
    capd = 'M40,50 C40,30 62,24 80,34 C86,38 88,44 86,48 C72,42 54,42 40,50 Z'
    o += d.shaded(f'<path d="{capd}" {{a}}/>', FY['cap'], '#82975F', FY['capD'], dx=-3, dy=-3, w=2.6)
    o += path('M52,40 Q62,34 74,36', st(FY['capD'], 1.6) + ' opacity=".7"')
    o += path('M62,30 Q60,20 68,16 Q74,14 72,20', st(FY['capD'], 2.4))
    return svg(120, 120, o, ''.join(d.defs))


# ======================================================================= LADYBUG — 0 0 100 100, feet (50,96), RIGHT
LB = {'shell': '#E07A6A', 'sh': '#BA5A4C', 'line': '#8C3F36', 'hi': '#F6B1A5', 'dot': '#3A2B2B', 'head': '#4A3A3E',
      'headL': '#2E2428', 'wing': '#F2EEF8', 'vein': '#B9B3D6'}


def ladybug(mode='stand'):
    d = Doc('l')
    o = ell(50, 95, 30, 2.6, 'fill="#3A2B2B" opacity=".14"')
    # legs (3 visible), feet at y 95
    if mode == 'step':
        legs = [((34, 80), (26, 95)), ((48, 82), (52, 95)), ((62, 80), (72, 95))]
    elif mode == 'fly':
        legs = [((34, 80), (30, 88)), ((48, 82), (48, 90)), ((62, 80), (66, 88))]
    else:
        legs = [((34, 80), (30, 95)), ((48, 82), (48, 95)), ((62, 80), (68, 95))]
    for (a, b) in legs:
        o += path(f'M{a[0]},{a[1]} Q{(a[0] + b[0]) / 2 - 3},{(a[1] + b[1]) / 2} {b[0]},{b[1]}', st(LB['headL'], 4))
    lift = -6 if mode == 'fly' else 0
    o += f'<g transform="translate(0,{lift})">'
    # under-body
    o += ell(48, 80, 30, 7, f'fill="{LB["headL"]}"')
    if mode == 'fly':   # wings out behind
        o += ell(34, 46, 22, 11, f'fill="{LB["wing"]}" fill-opacity=".75" stroke="{LB["vein"]}" stroke-width="1.6" '
                 f'transform="rotate(-30 40 60)"')
        o += ell(56, 40, 24, 11, f'fill="{LB["wing"]}" fill-opacity=".75" stroke="{LB["vein"]}" stroke-width="1.6" '
                 f'transform="rotate(-62 50 60)"')
    # head (right) with a friendly face
    o += d.shaded('<circle cx="76" cy="68" r="15" {a}/>', LB['head'], LB['headL'], LB['headL'], dx=-3, dy=-3, w=3)
    o += path('M74,55 Q72,42 64,38', st(LB['headL'], 2.6)) + circ(64, 38, 3.2, f'fill="{LB["headL"]}"')
    o += path('M82,55 Q86,42 94,40', st(LB['headL'], 2.6)) + circ(94, 40, 3.2, f'fill="{LB["headL"]}"')
    for (x, y, r) in ((76, 65, 5.2), (86, 64, 4.4)):
        o += ell(x, y, r * 0.86, r, fl('#FFFFFF', LB['headL'], 1.2)) + ell(x + 1, y + 1, r * 0.5, r * 0.58, 'fill="#2F2A3A"')
        o += circ(x, y - 1, r * 0.22, 'fill="#FFFFFF"')
    o += circ(73, 74, 2.8, 'fill="#F2A99A" opacity=".9"') + circ(87, 73, 2.2, 'fill="#F2A99A" opacity=".9"')
    o += path('M78,75 Q81,78 84,75', st('#F2A99A', 1.8))
    # shell dome
    if mode == 'fly':   # elytra open: two halves lifted
        for (ang, dx) in ((-34, -4), (-14, 6)):
            hdome = 'M18,78 C16,52 32,38 50,38 C62,38 70,46 72,58 L46,78 Z'
            o += f'<g transform="rotate({ang} 46 74) translate({dx},0)">'
            o += d.shaded(f'<path d="{hdome}" {{a}}/>', LB['shell'], LB['sh'], LB['line'], dx=-5, dy=-5, w=3.6)
            o += circ(36, 54, 5.5, f'fill="{LB["dot"]}"') + circ(54, 50, 4.5, f'fill="{LB["dot"]}"') + circ(30, 68, 4, f'fill="{LB["dot"]}"')
            o += '</g>'
    else:
        dome = 'M14,80 C12,52 30,36 48,36 C66,36 74,50 74,64 C74,72 72,78 70,80 Z'
        hi = ell(32, 50, 9, 5, f'fill="{LB["hi"]}" opacity=".9" transform="rotate(-35 32 50)"')
        o += d.shaded(f'<path d="{dome}" {{a}}/>', LB['shell'], LB['sh'], LB['line'], dx=-6, dy=-6, w=3.6, hi=hi)
        o += path('M50,37 Q46,58 44,80', st(LB['line'], 2.6))
        for (x, y, r) in ((30, 64, 5), (40, 46, 4.5), (60, 48, 4.8), (58, 66, 5.2), (26, 76, 3.2)):
            o += circ(x, y, r, f'fill="{LB["dot"]}"')
    o += '</g>'
    return svg(100, 100, o, ''.join(d.defs))


# ======================================================================= BUTTERFLY — 0 0 120 120, centre (60,60)
BF = {'up': '#D9B8E8', 'upD': '#A985BD', 'upL': '#EEDCF5', 'lo': '#F6C9A8', 'loD': '#C9926D', 'body': '#7A5A6A',
      'bodyL': '#5A3E4C', 'spot': '#FFF6EA'}


def butterfly(mode='open'):
    d = Doc('b')
    sx = 1.0 if mode == 'open' else 0.42
    o = ''

    def wings(side):
        w = ''
        up = 'M60,56 C52,30 30,10 14,16 C2,22 6,46 18,58 C30,66 48,64 60,60 Z'
        lo = 'M60,62 C46,64 28,70 24,86 C22,100 36,106 46,98 C54,90 58,76 60,66 Z'
        w += d.shaded(f'<path d="{up}" {{a}}/>', BF['up'], '#C7A2D9', BF['upD'], dx=-4, dy=-4, w=3.2,
                      hi=ell(26, 28, 7, 4, f'fill="{BF["upL"]}" opacity=".9" transform="rotate(-40 26 28)"'))
        w += d.shaded(f'<path d="{lo}" {{a}}/>', BF['lo'], '#E9B08C', BF['loD'], dx=-3, dy=-3, w=3.2)
        w += circ(26, 34, 6, f'fill="{BF["spot"]}" opacity=".9"') + circ(38, 48, 3.5, f'fill="{BF["spot"]}" opacity=".9"')
        w += circ(38, 88, 4.5, f'fill="{BF["spot"]}" opacity=".9"')
        tr = f'translate(60,0) scale({f(sx * side)},1) translate(-60,0)'
        return f'<g transform="{tr}">{w}</g>'

    o += wings(1) + wings(-1)
    # body + head + antennae
    o += ell(60, 70, 6, 20, fl(BF['body'], BF['bodyL'], 2.6))
    o += path('M57,62 L63,62 M56,70 L64,70 M57,78 L63,78', st(BF['bodyL'], 1.6) + ' opacity=".6"')
    o += circ(60, 46, 9, fl(BF['body'], BF['bodyL'], 2.6))
    o += path('M57,38 Q52,26 46,22', st(BF['bodyL'], 2.2)) + circ(46, 22, 2.8, f'fill="{BF["bodyL"]}"')
    o += path('M63,38 Q68,26 74,22', st(BF['bodyL'], 2.2)) + circ(74, 22, 2.8, f'fill="{BF["bodyL"]}"')
    for x in (56.5, 63.5):
        o += circ(x, 45, 2.2, 'fill="#FFFFFF"') + circ(x + 0.4, 45.4, 1.2, 'fill="#2F2A3A"')
    o += circ(54.5, 49.5, 1.6, 'fill="#F2A99A"') + circ(65.5, 49.5, 1.6, 'fill="#F2A99A"')
    o += path('M58,50 Q60,52 62,50', st('#F2C9D0', 1.4))
    return svg(120, 120, o, ''.join(d.defs))


# ======================================================================= SNAIL — 0 0 140 120, bottom (70,116), RIGHT
SN = {'body': '#B5C99A', 'sh': '#93A979', 'line': '#667A50', 'shell': '#EFD9B4', 'shellSh': '#D9BD8E',
      'shellLine': '#9E8358', 'swirl': '#B89A6A', 'leaf': '#A9BD86', 'leafD': '#6F8752'}


def snail(peek=False):
    d = Doc('s')
    o = ell(70, 115, 56, 3, 'fill="#3A2B2B" opacity=".14"')
    # tiny leaf umbrella held by the neck, leaning back over the shell
    o += path('M104,74 Q96,40 84,22', st(SN['leafD'], 3.4))
    leaf = 'M44,26 C54,6 104,0 126,18 C112,20 100,24 86,22 C72,22 58,22 44,26 Z'
    o += d.shaded(f'<path d="{leaf}" {{a}}/>', SN['leaf'], '#8FA46B', SN['leafD'], dx=-3, dy=-3, w=3)
    o += path('M48,24 Q86,10 122,18', st(SN['leafD'], 1.8) + ' opacity=".7"')
    o += path('M84,22 Q88,26 84,30', st(SN['leafD'], 2.6))
    # body: a long soft foot + neck rising at the right
    foot = 'M14,112 C10,104 18,98 30,98 L92,98 C94,84 94,70 100,62 C108,52 124,54 128,66 C132,78 128,96 124,104 C120,112 110,114 98,114 Z'
    o += d.shaded(f'<path d="{foot}" {{a}}/>', SN['body'], SN['sh'], SN['line'], dx=-4, dy=-4, w=3.6,
                  hi=ell(108, 64, 6, 4, 'fill="#FFFFFF" opacity=".35" transform="rotate(-30 108 64)"'))
    # eye stalks
    h = 26 if peek else 12
    er = 6.4 if peek else 5.4
    for (bx, tx) in ((106, 102), (118, 122)):
        ty = 58 - h
        o += path(f'M{bx},62 Q{(bx + tx) / 2},{(62 + ty) / 2} {tx},{ty}', st(SN['line'], 7)) + \
            path(f'M{bx},62 Q{(bx + tx) / 2},{(62 + ty) / 2} {tx},{ty}', st(SN['body'], 3))
        o += circ(tx, ty, er, fl('#FFFFFF', SN['line'], 2.2)) + circ(tx + 1.2, ty + 0.6, er * 0.52, 'fill="#2F2A3A"')
        o += circ(tx, ty - 1.2, er * 0.2, 'fill="#FFFFFF"')
    if peek:
        o += path('M96,20 L92,12 M130,22 L136,16', st(SN['line'], 2.4) + ' opacity=".7"')
    o += circ(110, 80, 3.6, 'fill="#F2A99A" opacity=".9"')
    o += path('M116,82 Q120,86 124,81', st(SN['line'], 2.2))
    # shell with a swirl
    o += d.shaded('<circle cx="58" cy="72" r="34" {a}/>', SN['shell'], SN['shellSh'], SN['shellLine'], dx=-5, dy=-5, w=3.8,
                  hi=ell(42, 52, 9, 5, 'fill="#FFFFFF" opacity=".5" transform="rotate(-40 42 52)"'))
    sw = []
    for k in range(60):
        a = k * 0.2
        r = 28 - k * 0.42
        sw.append((58 + r * math.cos(a + 1.2) * 0.98, 72 + r * math.sin(a + 1.2)))
    o += path(ptsd(sw, close=False), st(SN['swirl'], 3.2))
    return svg(140, 120, o, ''.join(d.defs))


# ======================================================================= ICON — 0 0 512 512
def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE3D0"/>'
                  f'<stop offset=".7" stop-color="#FBF6DF"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # sun glow upper-right + sun shafts
    o += circ(430, 70, 90, 'fill="#FFF1C2" opacity=".6"') + circ(430, 70, 52, 'fill="#FFF6D6"')
    for (x0, x1) in ((380, 300), (430, 400), (470, 500)):
        o += path(f'M{x0},40 L{x0 + 40},40 L{x1 + 60},512 L{x1 - 30},512 Z', 'fill="#FFFBEA" opacity=".25"')
    # far forest silhouettes
    o += path('M0,290 C30,210 60,200 80,250 C100,180 150,170 170,240 C200,200 230,210 250,260 L250,360 L0,360 Z',
              'fill="#A9C9A4" opacity=".8"')
    o += path('M240,280 C270,200 320,196 340,250 C370,190 420,200 440,260 C470,230 500,240 512,250 L512,360 L240,360 Z',
              'fill="#9EC09A" opacity=".8"')
    # framing trunk on the left
    o += path('M-10,0 L52,0 C48,120 50,240 62,380 L-10,380 Z', fl('#9C7452', '#6E4A2E', 5))
    o += path('M14,20 C12,120 14,240 22,360', st('#B88E66', 6) + ' opacity=".7"')
    # mossy ground
    o += path('M0,360 C140,340 360,350 512,336 L512,512 L0,512 Z', 'fill="#B7C98E"')
    o += path('M0,440 C160,428 340,440 512,426 L512,512 L0,512 Z', 'fill="#A3B97C"')
    for (x, y) in ((40, 470), (460, 480), (300, 492), (110, 420)):
        o += circ(x, y, 6, 'fill="#F3E6CC"') + circ(x, y, 2.4, 'fill="#E2C66E"')
    # garland vine with leaves + a glowing open bell-flower lantern
    o += path('M40,96 Q250,170 512,92', st('#5E7C46', 6))
    for (x, y) in ((110, 122), (190, 142), (320, 142), (420, 118)):
        o += ell(x, y, 11, 6, fl('#8DAA6A', '#5E7C46', 2.4) + f' transform="rotate(20 {x} {y})"')
    lg = d.uid('lg')
    d.defs.append(f'<radialGradient id="{lg}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE7A3" stop-opacity=".95"/>'
                  f'<stop offset="1" stop-color="#FFE7A3" stop-opacity="0"/></radialGradient>')
    lx, ly = 352, 186
    o += path(f'M{lx},140 L{lx},{ly - 26}', st('#5E7C46', 4))
    o += circ(lx, ly, 62, f'fill="url(#{lg})"')
    o += path(f'M{lx - 30},{ly - 6} C{lx - 30},{ly - 34} {lx + 30},{ly - 34} {lx + 30},{ly - 6} '
              f'L{lx + 38},{ly + 14} L{lx + 18},{ly + 6} L{lx},{ly + 18} L{lx - 18},{ly + 6} L{lx - 38},{ly + 14} Z',
              fl('#FFE7A3', '#C9A04A', 4))
    o += ell(lx, ly + 4, 12, 10, 'fill="#FFF8DC"')
    for (x, y, s) in ((300, 230, 9), (404, 232, 7), (250, 196, 6)):
        o += star4(x, y, s, w=1.8)
    # log tea table on the right with a leaf placemat and a cookie
    o += ell(410, 470, 120, 10, 'fill="#5E4526" opacity=".18"')
    for x in (330, 480):
        o += rect(x - 13, 410, 26, 56, 10, fl('#F3E6CC', '#B8A27A', 4))
        o += path(f'M{x - 32},{418} C{x - 30},{396} {x + 30},{396} {x + 32},{418} Z', fl('#C98C86', '#8E5A55', 4))
        o += circ(x - 12, 408, 3.6, 'fill="#F3E6CC"') + circ(x + 10, 405, 3, 'fill="#F3E6CC"')
    o += rect(282, 352, 260, 46, 20, fl('#A9784E', '#6E4A2E', 5))
    o += path('M290,368 L536,368', st('#D2A576', 4) + ' opacity=".8"')
    o += path('M286,356 C320,344 380,350 420,346 C470,342 510,348 540,354', st('#8DAA6A', 10))
    o += ell(420, 350, 54, 12, fl('#B7C98E', '#7F9560', 3))
    o += ell(420, 340, 28, 9, fl('#E2B27A', '#A97540', 3.4))
    o += path('M408,338 L420,330 L432,338 L420,346 Z', fl('#FF8FC0', '#C9558A', 2))   # icing (no text)
    # Moka holding his cup at the table end (big, in front)
    sc = 1.36
    tx, ty = 176 - 150 * sc, 500 - 292 * sc
    md = Doc('im')
    mb, _ = moka(md, 'icon')
    d.defs.extend(md.defs)
    o += ell(176, 498, 100, 12, 'fill="#5E4526" opacity=".2"')
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{mb}</g>'
    # the fairy above, between Moka and the lantern
    fd = fairy('sprinkle')
    inner = fd[fd.index('>') + 1:fd.rindex('</svg>')].replace('id="f', 'id="if').replace('url(#f', 'url(#if')
    o += f'<g transform="translate(236,40) scale(1.05)">{inner}</g>'
    return svg(512, 512, o, ''.join(d.defs))


def main():
    tbl = write_moka()
    write('characters/fairy.svg', fairy('rest'))
    write('characters/fairy_flap.svg', fairy('flap'))
    write('characters/fairy_sprinkle.svg', fairy('sprinkle'))
    write('characters/ladybug.svg', ladybug('stand'))
    write('characters/ladybug_step.svg', ladybug('step'))
    write('characters/ladybug_fly.svg', ladybug('fly'))
    write('characters/butterfly.svg', butterfly('open'))
    write('characters/butterfly_flap.svg', butterfly('flap'))
    write('characters/snail.svg', snail(False))
    write('characters/snail_peek.svg', snail(True))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:9s} {v}')


if __name__ == '__main__':
    main()
