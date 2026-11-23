#!/usr/bin/env python3
"""Character art generator for Nuka's Snow Dig (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/nuka_{idle,blink,talk,happy,cheer,think,oops,wave,point,dig}.svg + nuka_full_wave.svg
        0 0 300 300, FEET ANCHOR (150,292). Nuka = a chubby round polar-bear cub in a warm brown knitted scarf, 3/4
        view facing RIGHT, eyes on the viewer. Body, belly, feet, tail and scarf are identical in every frame; only the
        eyes, mouth, brows, arms and (think / oops) a small head tilt change.
  characters/nuka_slide.svg                  0 0 300 300, belly-slide to the right, bottom anchor (150,292)
  characters/seal.svg, seal_happy.svg        0 0 160 140, bottom anchor (80,136): harp-seal pup in an ice breathing hole
  characters/tern.svg, tern_flap.svg         0 0 200 140, centre anchor (100,70), facing right (wings up / down)
  icon.svg                                   0 0 512 512, full bleed, opaque
  docs/art/nuka_hand.json                    per frame: near paw centre / tip, head top, eye (viewBox px)

Usage: python3 tools/art_nuka.py [outDir]
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone (never black), one-step cel
shade (lower right) + one soft highlight (upper left); no <text>/fonts/scripts/external refs; one light blur in the
icon only. Deterministic: re-running gives byte-identical files.
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'nuka_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

N = {  # Nuka palette (DESIGN.md section 3)
    'fur': '#FBF5E8', 'furSh': '#E2D7C1', 'furLine': '#9A8C74', 'muzzle': '#FFFDF7',
    'dark': '#2E2A33', 'blush': '#F3BFB2', 'mouth': '#7A3A36', 'tongue': '#EE8F86', 'pad': '#5B4F4C',
    'scarf': '#A8714A', 'scarfDk': '#7A4E30', 'scarfLt': '#C99670', 'brow': '#B3A388',
}
SNOW = {'fill': '#F4F8FC', 'sh': '#CFDDEA', 'line': '#8FA9BF', 'hi': '#FFFFFF'}


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


def ptsd(pts, close=True):
    """Smooth path through points (Catmull-Rom → cubic Bézier)."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if (close or i > 0) else pts[0]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (close or i + 2 < n) else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if close else '')


class Doc:
    """Collects <defs> with unique ids (the prefix keeps ids unique when drawings share one file)."""

    def __init__(self, prefix='n'):
        self.prefix, self.defs, self.n = prefix, [], 0

    def uid(self, k='g'):
        self.n += 1
        return f'{self.prefix}{k}{self.n}'

    def clip(self, inner):
        cid = self.uid('c')
        self.defs.append(f'<clipPath id="{cid}">{inner}</clipPath>')
        return cid

    def shaded(self, tpl, base, shade, line, dx=-10, dy=-9, w=LW, hi=None, extra=''):
        """One-step cel shade: shape in the shade colour, the base colour shifted up-left inside it, outline on top.
        tpl is an element string with '{a}' where the attributes go; extra = more art clipped inside the shape."""
        cid = self.clip(tpl.format(a=''))
        out = tpl.format(a=f'fill="{shade}"')
        out += (f'<g clip-path="url(#{cid})"><g transform="translate({f(dx)},{f(dy)})">'
                + tpl.format(a=f'fill="{base}"') + '</g>' + extra + (hi or '') + '</g>')
        out += tpl.format(a=f'fill="none" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')
        return out

    def defs_str(self):
        return ''.join(self.defs)


def hi_ell(cx, cy, rx, ry, ang=-30, op=.6):
    return ell(cx, cy, rx, ry, f'fill="#FFFFFF" opacity="{op}" transform="rotate({ang} {f(cx)} {f(cy)})"')


# ======================================================================= NUKA
HEAD = (154, 120, 72, 63)          # x 82-226, y 57-183
NECK = (156, 182)                  # head tilt pivot
EAR_N = (104, 72, 19)              # near ear (viewer's left)
EAR_F = (190, 62, 16)              # far ear
EYE_N = (146, 114)                 # near eye centre
EYE_F = (186, 108)                 # far eye centre
MUZ = (204, 141, 31, 24)           # muzzle ellipse (pokes out right of the head = the short snout)
NOSE = (223, 127)
SH_N = (192, 208)                  # near (front, viewer's right) shoulder
SH_F = (110, 208)                  # far (back, viewer's left) shoulder

BODY_PTS = [(112, 180), (96, 204), (88, 236), (94, 268), (118, 287), (150, 290), (184, 287), (206, 268),
            (212, 236), (204, 204), (190, 182), (150, 172)]


def ear(doc, cx, cy, r):
    o = doc.shaded(f'<circle cx="{cx}" cy="{cy}" r="{r}" {{a}}/>', N['fur'], N['furSh'], N['furLine'], dx=-4, dy=-4)
    o += circ(cx + 1, cy + 2, r * 0.52, f'fill="{N["blush"]}"')
    return o


def eye(cx, cy, k=1.0, mode='open', look=(0, 0)):
    """Big dark cartoon eye with catch-lights. modes: open, wide, look, closed, happy, squint."""
    rx, ry = 10.5 * k, 12.5 * k
    o = ''
    if mode in ('open', 'wide', 'look'):
        if mode == 'wide':
            rx, ry = rx * 1.1, ry * 1.12
        x, y = cx + look[0], cy + look[1]
        o += ell(x, y, rx, ry, f'fill="{N["dark"]}"')
        o += ell(x - rx * 0.32, y - ry * 0.38, rx * 0.42, ry * 0.36, 'fill="#FFFFFF"')
        o += circ(x + rx * 0.38, y + ry * 0.4, rx * 0.17, 'fill="#FFFFFF"')
        if mode == 'wide':
            o += circ(x + rx * 0.45, y - ry * 0.55, rx * 0.12, 'fill="#FFFFFF" opacity=".9"')
    elif mode == 'closed':      # gentle U blink
        o += path(f'M{f(cx - rx)},{f(cy)} Q{f(cx)},{f(cy + ry * 0.8)} {f(cx + rx)},{f(cy)}', st(N['dark'], 4.6 * k))
    elif mode == 'happy':       # ^ ^
        o += path(f'M{f(cx - rx)},{f(cy + ry * 0.3)} Q{f(cx)},{f(cy - ry * 0.95)} {f(cx + rx)},{f(cy + ry * 0.3)}',
                  st(N['dark'], 5 * k))
    return o


def nose(x=None, y=None, k=1.0):
    nx, ny = (x, y) if x is not None else NOSE
    d = (f'M{f(nx - 11 * k)},{f(ny - 4 * k)} Q{f(nx)},{f(ny - 10 * k)} {f(nx + 11 * k)},{f(ny - 4 * k)} '
         f'Q{f(nx + 9 * k)},{f(ny + 5 * k)} {f(nx)},{f(ny + 7 * k)} Q{f(nx - 9 * k)},{f(ny + 5 * k)} {f(nx - 11 * k)},{f(ny - 4 * k)} Z')
    return path(d, f'fill="{N["dark"]}"') + ell(nx - 3 * k, ny - 3.5 * k, 3.6 * k, 1.9 * k, 'fill="#FFFFFF" opacity=".85"')


def mouth(mode):
    nx, ny = NOSE
    mx, my = nx - 3, ny + 18          # the centre of the mouth line
    line = N['furLine']
    stem = path(f'M{nx},{ny + 7} L{nx - 1},{my - 2}', st(line, 3.2))
    if mode == 'closed':        # little bear smile
        return stem + path(f'M{mx - 12},{my - 4} Q{mx - 6},{my + 4} {mx + 2},{my - 2} Q{mx + 8},{my + 3} {mx + 12},{my - 4}',
                           st(line, 3.4))
    if mode in ('talk', 'smile', 'big'):
        w, h = {'talk': (9, 15), 'smile': (13, 13), 'big': (16, 18)}[mode]
        top = my - (2 if mode == 'talk' else 4)
        d = (f'M{f(mx - w)},{f(top)} Q{f(mx)},{f(top + 3)} {f(mx + w)},{f(top - 1)} '
             f'Q{f(mx + w * 0.85)},{f(top + h)} {f(mx)},{f(top + h)} Q{f(mx - w * 0.9)},{f(top + h)} {f(mx - w)},{f(top)} Z')
        return (stem + path(d, fl(N['mouth'], line, 3))
                + ell(mx, top + h - h * 0.3, w * 0.55, h * 0.24, f'fill="{N["tongue"]}"'))
    if mode == 'o':             # curious "hmm?"
        return stem + ell(mx, my + 4, 5.5, 6.5, fl(N['mouth'], line, 3))
    if mode == 'hmm':
        return stem + path(f'M{mx - 10},{my + 1} Q{mx - 4},{my - 4} {mx + 1},{my + 1} Q{mx + 6},{my + 5} {mx + 11},{my - 1}',
                           st(line, 3.4))
    return stem


def head(doc, eyes='open', mo='closed', brows=None, look=(0, 0)):
    o = ear(doc, *EAR_N) + ear(doc, *EAR_F)
    hx, hy, hrx, hry = HEAD
    tpl = f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>'
    # a little fur tuft on the crown (part of the head shape)
    o += doc.shaded(tpl, N['fur'], N['furSh'], N['furLine'], dx=-12, dy=-10, hi=hi_ell(116, 88, 22, 11, -34, .7))
    o += path('M138,60 Q146,48 150,58 Q156,46 160,58', fl(N['fur'], N['furLine'], 3.4))
    o += path('M139,62 L161,62', st(N['fur'], 5))
    # cheeks
    o += ell(124, 144, 14, 8.5, f'fill="{N["blush"]}" opacity=".9"')
    o += ell(174, 145, 8.5, 6, f'fill="{N["blush"]}" opacity=".9"')
    # muzzle (lighter, pokes out = short snout)
    mx, my, mrx, mry = MUZ
    mt = f'<ellipse cx="{mx}" cy="{my}" rx="{mrx}" ry="{mry}" {{a}}/>'
    o += doc.shaded(mt, N['muzzle'], N['furSh'], N['furLine'], dx=-5, dy=-6, w=3.6)
    o += eye(*EYE_N, k=1.0, mode=eyes, look=look)
    o += eye(*EYE_F, k=0.86, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy), lift, k in ((EYE_N, brows[0], 1.0), (EYE_F, brows[1], 0.86)):
            y = cy - 12.5 * k - 9 - lift
            o += path(f'M{f(cx - 8 * k)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 8 * k)},{f(y + 3)}', st(N['brow'], 3.8))
    o += nose() + mouth(mo)
    for (x, y) in ((206, 150), (200, 144), (212, 156)):
        o += circ(x, y, 1.4, f'fill="{N["furLine"]}" opacity=".55"')
    return o


def arm_d(L):
    """Stubby bear arm hanging down from the shoulder (0,0); a round paw (r 16) at the end, tip at y = L + 17.7."""
    return (f'M-13,-6 C-14,{f(L * .45)} -12,{f(L - 14)} -14,{f(L - 6)} A16,16 0 1 0 14,{f(L - 6)} '
            f'C12,{f(L - 14)} 14,{f(L * .45)} 13,-6 C7,-15 -7,-15 -13,-6 Z')


def arm(doc, sh, ang, L, palm=False, finger=False, snow=False):
    """ang 0 = hanging down; > 0 swings the paw to the viewer's LEFT, < 0 to the RIGHT. palm = show the pads.
    snow = a scoop of snow sitting on top of the paw (in screen space, it does not rotate with the arm)."""
    tf = f'translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)})'
    o = ''
    if finger:     # a stubby raised pointing "toe" (rounded, no claws)
        o += f'<g transform="{tf}">' + rect(-6.5, L + 2, 13, 26, 6.5, fl(N['fur'], N['furLine'], 3.6)) + '</g>'
    tpl = f'<path d="{arm_d(L)}" transform="{tf}" {{a}}/>'
    hi = f'<path d="M-6,0 C-8,{f(L * .35)} -8,{f(L * .6)} -7,{f(L - 8)}" transform="{tf}" {st("#FFFFFF", 4.4)} opacity=".7"/>'
    o += doc.shaded(tpl, N['fur'], N['furSh'], N['furLine'], dx=-5, dy=-4, hi=hi)
    if palm:
        o += (f'<g transform="{tf}" fill="{N["pad"]}">' + ell(0, L + 6, 7.5, 6) + circ(-8.5, L - 4, 3.2)
              + circ(0, L - 7, 3.2) + circ(8.5, L - 4, 3.2) + '</g>')
    elif not finger:   # two little toe creases at the paw tip
        o += (f'<g transform="{tf}">' + path(f'M-5,{f(L + 17)} L-4.5,{f(L + 10)} M5,{f(L + 17)} L4.5,{f(L + 10)}',
                                              st(N['furLine'], 2.6) + ' opacity=".75"') + '</g>')
    if snow:
        px, py = paw_pt(sh, ang, L, 2)
        o += snow_scoop(px, py - 12)
    return o


def snow_scoop(x, y):
    """A heap of snow resting on a paw, its base centre at (x, y + 6)."""
    return (path(f'M{f(x - 17)},{f(y + 6)} C{f(x - 19)},{f(y - 6)} {f(x - 7)},{f(y - 11)} {f(x)},{f(y - 7)} '
                 f'C{f(x + 8)},{f(y - 14)} {f(x + 20)},{f(y - 6)} {f(x + 17)},{f(y + 6)} '
                 f'C{f(x + 8)},{f(y + 10)} {f(x - 8)},{f(y + 10)} {f(x - 17)},{f(y + 6)} Z', fl(SNOW['fill'], SNOW['line'], 3))
            + circ(x - 6, y - 3, 2.6, 'fill="#FFFFFF"') + circ(x + 7, y + 1, 2, f'fill="{SNOW["sh"]}"')
            + circ(x + 24, y - 10, 3, fl(SNOW['fill'], SNOW['line'], 1.8)) + circ(x - 22, y - 12, 2.4, fl(SNOW['fill'], SNOW['line'], 1.6)))


def paw_pt(sh, ang, L, tip=0):
    x, y = rot(0, L + tip, ang)
    return sh[0] + x, sh[1] + y


def body(doc):
    o = ''
    # stubby round tail at the back
    o += doc.shaded('<circle cx="90" cy="258" r="12" {a}/>', N['fur'], N['furSh'], N['furLine'], dx=-3, dy=-3, w=3.8)
    # legs + feet (toes to the right)
    for (cx, cy, rx, ry, a) in ((118, 279, 26, 12, 3), (178, 279, 30, 12.5, -2)):
        o += doc.shaded(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({a} {cx} {cy})" {{a}}/>',
                        N['fur'], N['furSh'], N['furLine'], dx=-4, dy=-5)
    bd = ptsd(BODY_PTS)
    tpl = f'<path d="{bd}" {{a}}/>'
    belly = ell(164, 244, 34, 36, f'fill="{N["muzzle"]}"')
    o += doc.shaded(tpl, N['fur'], N['furSh'], N['furLine'], dx=-13, dy=-8, extra=belly,
                    hi=hi_ell(110, 222, 9, 16, 12, .55))
    # toes peeking from the feet
    for x in (196, 203):
        o += path(f'M{x},{276} Q{x + 3},{281} {x},{286}', st(N['furLine'], 2.4) + ' opacity=".7"')
    # little leg crease
    o += path('M146,266 Q150,280 147,288', st(N['furSh'], 3.2))
    return o


def scarf_band(doc):
    """The knitted neck band (drawn before the head, the head sits on it) + the fluttering back tail."""
    o = ''
    # back tail flutters out to the left behind the body
    tail = 'M110,188 C96,192 82,200 72,214 C66,222 60,226 54,228 C60,236 66,240 72,240 C80,230 90,224 100,218 C108,212 114,206 116,200 Z'
    o += doc.shaded(f'<path d="{tail}" {{a}}/>', N['scarf'], N['scarfDk'], N['scarfDk'], dx=-2, dy=-4, w=3.4,
                    extra=''.join(path(f'M{x},{y} l14,12', st(N['scarfDk'], 2.4) + ' opacity=".55"')
                                  for (x, y) in ((70, 210), (82, 200), (94, 194))))
    for (x, y) in ((54, 230), (60, 236), (67, 241)):  # fringe
        o += path(f'M{x},{y} l-7,5', st(N['scarfDk'], 3.4))
    band = 'M96,172 C122,190 186,192 214,172 C218,182 218,194 212,202 C184,214 122,214 98,200 C92,192 92,180 96,172 Z'
    ribs = ''.join(path(f'M{x},{180 + abs(x - 156) * -0.02} L{x},{210 - abs(x - 156) * 0.09}',
                        st(N['scarfDk'], 2.6) + ' opacity=".5"') for x in range(106, 212, 11))
    hi = path('M104,186 C130,200 180,202 206,188', st(N['scarfLt'], 3.4) + ' opacity=".8"')
    o += doc.shaded(f'<path d="{band}" {{a}}/>', N['scarf'], N['scarfDk'], N['scarfDk'], dx=-3, dy=-5, w=3.8,
                    extra=ribs, hi=hi)
    return o


def scarf_front(doc):
    """The knot and the short front tail (drawn after the head)."""
    o = ''
    t = 'M160,198 C158,214 160,230 156,246 L182,248 C184,232 182,214 180,198 Z'
    ribs = ''.join(path(f'M{x},196 L{x - 2},250', st(N['scarfDk'], 2.4) + ' opacity=".5"') for x in (166, 174))
    o += doc.shaded(f'<path d="{t}" {{a}}/>', N['scarf'], N['scarfDk'], N['scarfDk'], dx=-3, dy=-3, w=3.6, extra=ribs)
    for x in (158, 165, 172, 179):
        o += path(f'M{x},{247} l-1,8', st(N['scarfDk'], 3.4))
    knot = 'M156,190 C156,182 182,180 184,190 C186,200 182,206 170,206 C158,206 156,198 156,190 Z'
    o += doc.shaded(f'<path d="{knot}" {{a}}/>', N['scarf'], N['scarfDk'], N['scarfDk'], dx=-3, dy=-3, w=3.6,
                    hi=path('M161,189 Q168,185 176,187', st(N['scarfLt'], 3)))
    return o


# Arm specs: (shoulder, ang, L, palm, finger, snow)
A_F = (SH_F, 20, 30, False, False, False)
A_N = (SH_N, -7, 30, False, False, False)
UP_N = ((204, 204), -142, 64, True, False, False)     # raised near paw, beside the snout (drawn behind the head)
UP_F = ((112, 206), 150, 60, True, False, False)      # raised far paw, left of the head
POSES = {
    #            eyes      mouth     far arm                                near arm                                tilt brows    look
    'idle':     ('open',  'closed', A_F,                                   A_N,                                     0, None,    (0, 1)),
    'blink':    ('closed', 'closed', A_F,                                  A_N,                                     0, None,    (0, 1)),
    'talk':     ('open',  'talk',   (SH_F, 30, 30, False, False, False),   (SH_N, -26, 30, False, False, False),    0, None,    (0, 1)),
    'happy':    ('wide',  'big',    (SH_F, 50, 32, False, False, False),   (SH_N, -60, 32, True, False, False),     0, (3, 3),  (0, 0)),
    'cheer':    ('happy', 'big',    UP_F,                                  UP_N,                                    0, None,    (0, 0)),
    'think':    ('look',  'hmm',    A_F,                                   ((196, 214), 168, 32, False, False, False), 7, (0, 7), (4, -5)),
    'oops':     ('wide',  'o',      ((112, 206), 146, 60, False, False, False), A_N,                               -6, (8, 2), (-2, 0)),
    'wave':     ('open',  'smile',  A_F,                                   UP_N,                                    0, None,    (0, 1)),
    'point':    ('look',  'talk',   A_F,                                   ((194, 210), -112, 36, False, True, False),  0, (4, 4), (4, -3)),
    'dig':      ('wide',  'big',    ((186, 202), -98, 42, False, False, True), ((198, 218), -66, 38, False, False, True), 0, (3, 3), (2, 2)),
    'full_wave': ('wide', 'smile',  UP_F,                                  (SH_N, -58, 32, False, False, False),    0, None,    (0, 0)),
}
BEHIND_HEAD = ('cheer', 'wave', 'oops', 'full_wave')   # raised arms drawn behind the head (paw shows beside it)


def snowball(cx, cy, r):
    return (circ(cx, cy, r, fl(SNOW['fill'], SNOW['line'], 3.4))
            + path(f'M{f(cx - r * .2)},{f(cy + r * .95)} A{f(r)},{f(r)} 0 0 0 {f(cx + r * .95)},{f(cy + r * .1)} '
                   f'A{f(r * 1.1)},{f(r * 1.1)} 0 0 1 {f(cx - r * .2)},{f(cy + r * .95)} Z', f'fill="{SNOW["sh"]}"')
            + circ(cx - r * .38, cy - r * .38, r * .26, 'fill="#FFFFFF"')
            + circ(cx + r * .3, cy - r * .1, r * .1, f'fill="{SNOW["sh"]}"'))


def nuka(doc, pose):
    eyes, mo, aF, aN, tilt, brows, look = POSES[pose]
    o = ''
    behind = pose in BEHIND_HEAD
    two_front = pose == 'dig'
    if not two_front and not behind:
        o += arm(doc, *aF)
    if behind and aF[1] > 90:       # raised far arm behind the body / head
        o += arm(doc, *aF)
    if behind and aN[1] < -90:      # raised near arm behind the head
        o += arm(doc, *aN)
    o += body(doc)
    if behind and aF[1] <= 90:
        o += arm(doc, *aF)
    o += scarf_band(doc)
    h = head(doc, eyes, mo, brows, look)
    if tilt:
        h = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{h}</g>'
    o += h
    o += scarf_front(doc)
    if two_front:
        o += arm(doc, *aF)
    if not (behind and aN[1] < -90):
        o += arm(doc, *aN)
    if pose == 'full_wave':
        px, py = paw_pt(*aN[:3])
        o += snowball(px + 2, py - 14, 15)
    if pose == 'oops':                # a tiny "?" made of shapes (no text): hook + dot
        o += path('M246,58 C246,46 266,46 266,58 C266,66 256,66 256,74', st(N['furLine'], 5))
        o += circ(256, 84, 3.6, f'fill="{N["furLine"]}"')
    if pose in ('cheer', 'happy'):    # little sparkle pops
        for (x, y, s) in ((40, 120, 9), (262, 92, 8), (58, 64, 6)):
            o += path(f'M{x},{y - s} Q{x + 1.5},{y - 1.5} {x + s},{y} Q{x + 1.5},{y + 1.5} {x},{y + s} '
                      f'Q{x - 1.5},{y + 1.5} {x - s},{y} Q{x - 1.5},{y - 1.5} {x},{y - s} Z', 'fill="#FFD86B"')
    return o


def hand_table():
    t = {'_about': 'Nuka per frame, in the 0 0 300 300 viewBox (feet anchor 150,292). paw = centre of the near (front, '
                   'viewer-right) paw; tip = the paw tip (point: the pointing toe tip, use it for the hint direction); '
                   'headTop = y of the top of the ears; eye = near eye centre; bbox = measured opaque box (tools/nuka_sheet.js). '
                   'slide: paw = front paw tip (leading edge of the slide).'}
    for p, (eyes, mo, aF, aN, tilt, brows, look) in POSES.items():
        tip = 28 if aN[4] else 16
        pw, tp = paw_pt(*aN[:3]), paw_pt(*aN[:3], tip=tip)
        if aN[1] < -90 and p in BEHIND_HEAD:
            pass
        t[p] = {'paw': [round(pw[0]), round(pw[1])], 'tip': [round(tp[0]), round(tp[1])],
                'headTop': EAR_F[1] - EAR_F[2], 'eye': list(EYE_N)}
    t['slide'] = {'paw': [276, 278], 'tip': [290, 278], 'headTop': 144, 'eye': [207, 199]}
    return t


def write_nuka():
    for p in POSES:
        d = Doc('n')
        b = nuka(d, p)
        write(f'characters/nuka_{p}.svg', svg(300, 300, b, d.defs_str()))
    d = Doc('s')
    write('characters/nuka_slide.svg', svg(300, 300, slide(d), d.defs_str()))
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    old = {}
    if os.path.exists(HAND_JSON):
        try:
            old = json.load(open(HAND_JSON))
        except ValueError:
            old = {}
    t = hand_table()
    for k, v in t.items():     # keep the measured bboxes merged in by nuka_sheet.js
        if isinstance(v, dict) and k in old and 'bbox' in old[k]:
            v['bbox'] = old[k]['bbox']
    with open(HAND_JSON, 'w') as fh:
        json.dump(t, fh, indent=1)
        fh.write('\n')


# ----------------------------------------------------------------- belly slide
def fpaw(doc, x, y, k, x0=196):
    """A front leg stretched forward to the right, paw (sole down) ending at about x + 26."""
    dd = (f'M{x0},{f(y - 13 * k)} C{x0 + 26},{f(y - 15 * k)} {x},{f(y - 16 * k)} {x + 14},{f(y - 13 * k)} '
          f'C{x + 30},{f(y - 9 * k)} {x + 30},{f(y + 11 * k)} {x + 12},{f(y + 12 * k)} C{x - 20},{f(y + 12 * k)} {x0 + 20},{f(y + 12 * k)} {x0},{f(y + 10 * k)} '
          f'C{x0 - 10},{f(y + 8 * k)} {x0 - 10},{f(y - 11 * k)} {x0},{f(y - 13 * k)} Z')
    o = doc.shaded(f'<path d="{dd}" {{a}}/>', N['fur'], N['furSh'], N['furLine'], dx=-3, dy=-4)
    o += path(f'M{x + 18},{f(y - 9 * k)} L{x + 14},{f(y - 3 * k)} M{x + 23},{f(y - 4 * k)} L{x + 17},{f(y + 1 * k)}',
              st(N['furLine'], 2.6) + ' opacity=".75"')
    return o


def slide(doc):
    """Nuka on his tummy sliding right: front paws stretched forward, hind paws up behind, grin, scarf flying."""
    o = ''
    # hind legs kicked up behind (soles with pads facing the viewer)
    for (cx, cy, a) in ((40, 214, -38), (62, 200, -22)):
        o += doc.shaded(f'<ellipse cx="{cx}" cy="{cy}" rx="15" ry="22" transform="rotate({a} {cx} {cy})" {{a}}/>',
                        N['fur'], N['furSh'], N['furLine'], dx=-3, dy=-3)
        px, py = rot(0, -6, a)
        o += f'<g transform="translate({cx},{cy}) rotate({a})" fill="{N["pad"]}">' + ell(0, 2, 8, 9) + \
            circ(-7, -11, 3) + circ(0, -14, 3) + circ(7, -11, 3) + '</g>'
    # legs joining the body
    o += doc.shaded('<path d="M40,236 C44,220 58,212 74,214 L88,248 L46,256 Z" {a}/>', N['fur'], N['furSh'],
                    N['furLine'], dx=-3, dy=-3)
    # body lying flat (tummy on the snow)
    bd = ptsd([(50, 248), (64, 222), (100, 208), (150, 204), (196, 212), (228, 236), (232, 268), (214, 288),
               (150, 291), (80, 290), (52, 278)])
    tpl = f'<path d="{bd}" {{a}}/>'
    o += doc.shaded(tpl, N['fur'], N['furSh'], N['furLine'], dx=-8, dy=-10, hi=hi_ell(104, 222, 26, 7, -6, .6))
    o += doc.shaded('<circle cx="54" cy="240" r="11" {a}/>', N['fur'], N['furSh'], N['furLine'], dx=-3, dy=-3, w=3.6)
    # tummy-on-snow line + speed puffs under the body
    o += path('M70,286 Q150,294 226,280', st(N['furSh'], 3))
    # flying scarf tail streaming back over the body (two waves, fringe at the end)
    tail = ('M176,208 C156,196 140,204 122,196 C104,188 94,170 72,170 C64,170 58,174 56,180 '
            'C70,180 78,188 92,196 C110,206 124,214 142,214 C156,214 166,220 178,226 Z')
    o += doc.shaded(f'<path d="{tail}" {{a}}/>', N['scarf'], N['scarfDk'], N['scarfDk'], dx=-2, dy=-4, w=3.4,
                    extra=''.join(path(f'M{x},{y} l-5,16', st(N['scarfDk'], 2.4) + ' opacity=".55"')
                                  for (x, y) in ((82, 172), (100, 182), (118, 192), (136, 200), (154, 202))))
    for (x, y) in ((56, 176), (55, 182), (57, 188)):
        o += path(f'M{x},{y} l-9,{(y - 182) * .5}', st(N['scarfDk'], 3.4))
    # far front paw (behind the head), stretched forward
    o += fpaw(doc, 256, 262, .9)
    # neck band of the scarf (only the part below the chin shows)
    band = 'M158,206 C170,198 186,202 192,214 C198,230 196,252 188,268 C178,274 166,270 160,262 C166,244 166,224 158,206 Z'
    o += doc.shaded(f'<path d="{band}" {{a}}/>', N['scarf'], N['scarfDk'], N['scarfDk'], dx=-3, dy=-3, w=3.6,
                    extra=''.join(path(f'M156,{y} L198,{y + 2}', st(N['scarfDk'], 2.4) + ' opacity=".5"')
                                  for y in range(210, 268, 9)))
    # the head, lifted and looking forward with a big grin
    h = head(doc, 'happy', 'big', None, (0, 0))
    o += f'<g transform="translate(214,206) rotate(6) scale(.8) translate(-156,-122)">{h}</g>'
    # near front paw in front, stretched forward along the snow
    o += fpaw(doc, 260, 278, 1.0, x0=218)
    # snow spray in front of the paws
    for (x, y, r) in ((292, 284, 6), (284, 290, 4.5), (294, 272, 3.5)):
        o += circ(x, y, r, fl(SNOW['fill'], SNOW['line'], 2.4))
    return o


# ======================================================================= SEAL PUP (160 x 140)
S = {'fur': '#F2F0EA', 'sh': '#C9C7C2', 'line': '#8E8A84', 'eye': '#22232A', 'nose': '#3A3436', 'blush': '#F3C3B8'}


def seal(happy=False):
    d = Doc('p' if not happy else 'q')
    o = ''
    # ice ring with dark water
    o += ell(80, 116, 72, 20, fl('#DDEAF4', '#9DBCD6', 4))
    o += ell(80, 112, 72, 16, 'fill="#EEF5FA"')
    o += ell(80, 114, 52, 11.5, fl('#3F6A8C', '#5F86A8', 3))
    o += ell(70, 112, 26, 4, 'fill="#6E97B8" opacity=".6"')
    # seal body, clipped to above the waterline (+ the water ellipse)
    bd = ptsd([(42, 116), (40, 84), (52, 50), (80, 34), (108, 50), (120, 84), (118, 116)])
    cid = d.clip(rect(0, 0, 160, 113) + ell(80, 113, 49, 9))
    body_tpl = f'<path d="{bd}" {{a}}/>'
    face = ''
    o += f'<g clip-path="url(#{cid})">'
    o += d.shaded(body_tpl, S['fur'], S['sh'], S['line'], dx=-7, dy=-6, w=3.8, hi=hi_ell(62, 52, 12, 7, -36, .8))
    # flippers
    if happy:
        for (x, y, a) in ((40, 78, 50), (120, 78, -50)):
            o += d.shaded(f'<ellipse cx="{x}" cy="{y}" rx="8" ry="16" transform="rotate({a} {x} {y})" {{a}}/>',
                          S['fur'], S['sh'], S['line'], dx=-2, dy=-2, w=3.2)
    else:
        for (x, y, a) in ((48, 100, 28), (112, 100, -28)):
            o += d.shaded(f'<ellipse cx="{x}" cy="{y}" rx="7.5" ry="14" transform="rotate({a} {x} {y})" {{a}}/>',
                          S['fur'], S['sh'], S['line'], dx=-2, dy=-2, w=3.2)
    o += '</g>'
    # fluffy tufts on top
    o += path('M72,38 Q76,28 80,36 Q84,27 88,38', fl(S['fur'], S['line'], 2.8))
    o += path('M73,40 L87,40', st(S['fur'], 4))
    # face
    if happy:
        for x in (62, 98):
            face += path(f'M{x - 9},{66} Q{x},{54} {x + 9},{66}', st(S['eye'], 4.6))
    else:
        for x in (62, 98):
            face += ell(x, 62, 10, 11, f'fill="{S["eye"]}"')
            face += ell(x - 3.5, 57.5, 4, 3.6, 'fill="#FFFFFF"')
            face += circ(x + 4, 66, 1.8, 'fill="#FFFFFF"')
    face += ell(52, 76, 7, 4.5, f'fill="{S["blush"]}" opacity=".85"') + ell(108, 76, 7, 4.5, f'fill="{S["blush"]}" opacity=".85"')
    face += ell(73, 82, 8, 6.5, f'fill="#FFFFFF" stroke="{S["sh"]}" stroke-width="1.6"')
    face += ell(87, 82, 8, 6.5, f'fill="#FFFFFF" stroke="{S["sh"]}" stroke-width="1.6"')
    for (x, y) in ((70, 81), (74, 85), (86, 81), (90, 85)):
        face += circ(x, y, 1.1, f'fill="{S["line"]}"')
    face += path('M74,73 Q80,70 86,73 Q84,79 80,80 Q76,79 74,73 Z', f'fill="{S["nose"]}"')
    face += ell(78, 73.5, 2, 1, 'fill="#FFFFFF" opacity=".8"')
    if happy:
        face += path('M73,88 Q80,98 87,88 Z', fl('#7A3A36', S['line'], 2)) + ell(80, 92.5, 3.6, 2, 'fill="#EE8F86"')
    else:
        face += path('M75,89 Q80,93 85,89', st(S['line'], 2.4))
    for (x0, y0, x1, y1) in ((66, 82, 44, 78), (66, 85, 46, 88), (94, 82, 116, 78), (94, 85, 114, 88)):
        face += path(f'M{x0},{y0} L{x1},{y1}', st(S['line'], 1.4) + ' opacity=".7"')
    o += face
    # front lip of the ice ring over the body base + sparkles
    o += path('M28,114 Q80,136 132,114', st('#FFFFFF', 3) + ' opacity=".9"')
    o += path('M10,118 Q80,140 150,118', st('#BCD3E6', 2.4))
    if happy:
        for (x, y, r) in ((24, 96, 4), (138, 92, 4), (30, 80, 2.6), (132, 74, 2.6)):
            o += circ(x, y, r, fl('#CFE6F7', '#7FA6C6', 1.6))
    return svg(160, 140, o, d.defs_str())


# ======================================================================= ARCTIC TERN (200 x 140)
T = {'body': '#FFFFFF', 'sh': '#E3E8EE', 'line': '#7E8B97', 'wing': '#B8C2CC', 'wingSh': '#97A3AE', 'cap': '#2C2E36',
     'beak': '#E98A6A', 'beakLn': '#B5603F'}


def tern_wing(d, up, far):
    if up:
        pts = 'M110,66 C108,46 96,24 62,4 C70,22 72,36 76,48 C78,58 82,64 86,68 Z' if not far else 'M118,62 C118,44 112,26 100,10 C100,26 98,44 102,62 Z'
    else:
        pts = 'M108,68 C98,90 82,108 58,128 C70,106 76,92 80,72 Z' if not far else 'M118,66 C116,86 110,104 100,118 C98,100 98,86 100,68 Z'
    col = T['wing'] if not far else T['wingSh']
    o = d.shaded(f'<path d="{pts}" {{a}}/>', col, T['wingSh'] if not far else '#808C97', T['line'], dx=-2, dy=-2, w=3.2)
    return o


def tern(flap=False):
    d = Doc('t' if not flap else 'u')
    up = not flap
    o = tern_wing(d, up, True)
    # forked tail streamers
    o += path('M54,72 C40,70 26,62 12,52 C26,66 34,72 44,78 Z', fl(T['body'], T['line'], 3))
    o += path('M54,76 C40,82 26,88 14,92 C28,82 36,80 46,74 Z', fl(T['sh'], T['line'], 3))
    # body (slim teardrop to the right)
    bd = 'M46,74 C64,62 104,54 132,56 C150,57 160,64 160,74 C158,86 134,90 110,88 C84,86 62,82 46,74 Z'
    o += d.shaded(f'<path d="{bd}" {{a}}/>', T['body'], T['sh'], T['line'], dx=-3, dy=-5, w=3.6)
    # head
    o += d.shaded('<circle cx="146" cy="62" r="17" {a}/>', T['body'], T['sh'], T['line'], dx=-3, dy=-3, w=3.6)
    # black cap (top + back of head)
    o += path('M130,58 C130,44 150,40 162,52 C160,56 154,57 150,56 C142,55 136,58 130,64 Z', f'fill="{T["cap"]}"')
    # beak (coral) + eye + blush
    o += path('M160,60 L190,66 L160,70 Z', fl(T['beak'], T['beakLn'], 2.4))
    o += circ(152, 62, 4.6, f'fill="{T["cap"]}"') + circ(150.6, 60.4, 1.7, 'fill="#FFFFFF"')
    o += ell(150, 72, 5, 3, 'fill="#F3BFB2" opacity=".8"')
    # tiny coral feet tucked under
    o += path('M102,88 l-6,6 M108,88 l-5,7', st(T['beak'], 3.4))
    o += tern_wing(d, up, False)
    return svg(200, 140, o, d.defs_str())


# ======================================================================= ICON (512, full bleed)
def knit_hat(cx, cy, s):
    """A red knitted beanie, centre of the brim (cx, cy), width ~ 1.0 s. Answer red base/dark/light."""
    r, dk, lt = '#E84A4A', '#A8282E', '#F7A0A0'
    w = s
    o = ''
    dome = (f'M{f(cx - w * .46)},{f(cy)} C{f(cx - w * .48)},{f(cy - s * .7)} {f(cx + w * .48)},{f(cy - s * .7)} '
            f'{f(cx + w * .46)},{f(cy)} Z')
    o += path(dome, fl(r, dk, 5))
    for i in range(-3, 4):   # knit ribs
        x = cx + i * w * .12
        o += path(f'M{f(x)},{f(cy - 4)} Q{f(x + i * 3)},{f(cy - s * .3)} {f(cx + i * w * .05)},{f(cy - s * .5)}',
                  st(dk, 2.6) + ' opacity=".45"')
    o += ell(cx - w * .2, cy - s * .36, w * .1, s * .06, 'fill="#FFFFFF" opacity=".45" transform="rotate(-30 %s %s)"'
             % (f(cx - w * .2), f(cy - s * .36)))
    o += rect(cx - w * .52, cy - s * .08, w * 1.04, s * .2, s * .09, fl(dk, '#7E1C22', 5))
    for i in range(9):
        x = cx - w * .44 + i * w * .11
        o += path(f'M{f(x)},{f(cy - s * .04)} L{f(x)},{f(cy + s * .08)}', st('#C23A3E', 3.2))
    pr = s * .17
    o += circ(cx, cy - s * .55, pr, fl(lt, dk, 4.4))
    for a in range(0, 360, 45):
        x, y = cx + math.cos(math.radians(a)) * pr * .55, cy - s * .55 + math.sin(math.radians(a)) * pr * .55
        o += circ(x, y, pr * .18, 'fill="#FFFFFF" opacity=".45"')
    return o


def icon():
    d = Doc('i')
    d.defs.append('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16204A"/>'
                  '<stop offset="1" stop-color="#3B4F7E"/></linearGradient>')
    d.defs.append('<filter id="iglow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>')
    o = rect(0, 0, 512, 512, 0, 'fill="url(#isky)"')
    # stars
    for (x, y, r) in ((40, 60, 2.6), (120, 30, 2), (300, 44, 2.4), (470, 70, 2.8), (440, 180, 2), (60, 200, 2.2),
                      (200, 110, 1.8), (380, 120, 1.8), (486, 260, 2)):
        o += circ(x, y, r, 'fill="#FFF6D6" opacity=".9"')
    # aurora ribbon (blurred bands + crisp cores)
    bands = [('M-20,150 C80,90 170,190 270,130 C360,80 430,150 540,100', '#7FE3B0', 46, .55),
             ('M-20,190 C90,140 180,230 280,170 C370,120 440,190 540,140', '#6FD3E0', 34, .45),
             ('M-20,112 C90,70 190,140 290,96 C380,56 450,110 540,70', '#B9A3F0', 28, .45)]
    o += '<g filter="url(#iglow)">' + ''.join(path(p, st(c, w) + f' opacity="{op}"') for p, c, w, op in bands) + '</g>'
    o += ''.join(path(p, st(c, w * .3) + f' opacity="{op * .8}"') for p, c, w, op in bands)
    # Nuka rising from the drift, near paw held high with the found hat (arm behind the head: only the paw shows)
    n = Doc('j')
    K, X, Y = 1.36, 214, 332
    up = ((204, 204), -161, 142, True, False, False)
    g = arm(n, *up) + arm(n, (112, 206), 150, 60, True, False, False)
    g += body(n) + scarf_band(n) + head(n, 'wide', 'big', (3, 3), (0, 0)) + scarf_front(n)
    d.defs.extend(n.defs)
    o += f'<g transform="translate({X},{Y}) scale({K}) translate(-156,-170)">{g}</g>'
    px, py = paw_pt(*up[:3])
    hx, hy = X + (px - 156) * K, Y + (py - 170) * K
    o += knit_hat(hx + 4, hy - 14, 118)
    # sparkles round the hat
    for (x, y, s) in ((hx - 74, hy - 70, 12), (hx + 74, hy - 40, 14), (hx + 40, hy - 120, 9)):
        o += path(f'M{f(x)},{f(y - s)} Q{f(x + 2)},{f(y - 2)} {f(x + s)},{f(y)} Q{f(x + 2)},{f(y + 2)} {f(x)},{f(y + s)} '
                  f'Q{f(x - 2)},{f(y + 2)} {f(x - s)},{f(y)} Q{f(x - 2)},{f(y - 2)} {f(x)},{f(y - s)} Z', 'fill="#FFE27A"')
    # snow drift in front
    drift = 'M-10,420 C40,380 120,372 200,398 C270,380 360,370 420,388 C470,400 500,410 530,404 L530,530 L-10,530 Z'
    o += d.shaded(f'<path d="{drift}" {{a}}/>', SNOW['fill'], SNOW['sh'], SNOW['line'], dx=-14, dy=-12, w=5,
                  hi=path('M40,406 C90,386 150,386 196,404', st('#FFFFFF', 8) + ' opacity=".9"'))
    for (x, y, r) in ((90, 470, 4), (300, 450, 3.4), (420, 480, 4), (210, 490, 3)):
        o += circ(x, y, r, f'fill="{SNOW["sh"]}"')
    # flung snow bits
    for (x, y, r) in ((100, 360, 9), (70, 330, 6), (380, 350, 8), (412, 322, 5.5)):
        o += circ(x, y, r, fl(SNOW['fill'], SNOW['line'], 2.6))
    return svg(512, 512, o, d.defs_str())


def main():
    write_nuka()
    write('characters/seal.svg', seal(False))
    write('characters/seal_happy.svg', seal(True))
    write('characters/tern.svg', tern(False))
    write('characters/tern_flap.svg', tern(True))
    write('icon.svg', icon())
    print('nuka art written to', OUT)


if __name__ == '__main__':
    main()
