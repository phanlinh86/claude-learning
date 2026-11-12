#!/usr/bin/env python3
"""Character art generator for Bo's Farm Parade (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/bo_{idle,blink,talk,happy,cheer,think,oops,wave,point,bark,dance}.svg + bo_title.svg
        0 0 300 300, FEET ANCHOR (150,292). Bo (a small round caramel puppy, one dark-brown floppy ear, cream muzzle /
        chest / paws, brown leather collar with a brass tag) SITS in 3/4 view facing RIGHT, eyes on the viewer.
        Body, haunch, chest, collar and head are identical in every frame; only eyes, mouth, brows, ears, front legs,
        tail and (think / oops) a small head tilt change.  docs/art/bo_points.json gives per frame the mouth, head
        centre, head top, near paw tip and nose (speech bubble / sparkles).
  characters/chick.svg, chick_step.svg, chick_flap.svg   0 0 120 120, feet anchor (60,116), facing RIGHT
  characters/rooster.svg, rooster_crow.svg               0 0 160 180, feet anchor (80,176), facing LEFT
  icon.svg                                               0 0 512 512, full bleed, opaque, no text

Usage: python3 tools/art_bo.py [outDir]   then   node tools/bo_sheet.js && node tools/render_icons.js
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
PTS_JSON = os.path.join(ROOT, 'docs', 'art', 'bo_points.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Bo palette (DESIGN.md section 3) — never an answer colour
    'fur': '#D9A066', 'sh': '#B98250', 'line': '#7A4E2C', 'farFur': '#C99158', 'farSh': '#A87345',
    'cream': '#F6E7CF', 'creamSh': '#E6CFAE', 'creamLine': '#B98A5E', 'farCream': '#E9D6B8',
    'ear': '#7A4B2A', 'earSh': '#603A20', 'earLine': '#4A2C17', 'earIn': '#8E5C38',
    'nose': '#3A2B2B', 'pupil': '#2F2A3A', 'white': '#FFFFFF', 'cheek': '#F2A99A',
    'mouth': '#6E2C25', 'tongue': '#EE8F84', 'tongueSh': '#D9736A',
    'collar': '#8C5A3C', 'collarSh': '#6E4329', 'collarLine': '#4E2F1F', 'stitch': '#B98A63',
    'brass': '#D8B26A', 'brassD': '#9C7838', 'brassL': '#F3DFAE',
    'halo': '#FFF4E0',
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

    def __init__(self, prefix='b'):
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


def poly(pts):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'


def star4(x, y, s, fill='#FFF6C8', line='#E2C86A', w=1.6):
    return path(f'M{f(x)},{f(y - s)} L{f(x + s * 0.3)},{f(y - s * 0.3)} L{f(x + s)},{f(y)} L{f(x + s * 0.3)},{f(y + s * 0.3)} '
                f'L{f(x)},{f(y + s)} L{f(x - s * 0.3)},{f(y + s * 0.3)} L{f(x - s)},{f(y)} L{f(x - s * 0.3)},{f(y - s * 0.3)} Z',
                f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')


# ======================================================================= BO
HEAD = (150, 114, 72, 63)          # x 78-222, y 51-177  (the big round head)
NECK = (152, 186)                  # tilt pivot
BODY = (146, 231, 54, 59)          # x 92-200, y 172-290 (sitting, mostly hidden under the head top)
HAUNCH = (114, 256, 37, 31)        # near hind leg (viewer side)
MUZ = (190, 140, 36, 26)           # cream muzzle, pushed right (3/4 view)
NOSE = (214, 125)
MOUTH = (209, 148)                 # mouth centre (under the nose)
EYE_N = (144, 106, 17.5)           # near eye (viewer's left, bigger)
EYE_F = (186, 98, 13.5)            # far eye
SH_N = (168, 224)                  # near front shoulder
SH_F = (190, 218)                  # far front shoulder
LEG_W = 25
PAW_R = 12.5
EAR_N_PIV = (108, 70)              # near (dark-brown) ear hinge
EAR_F_PIV = (190, 60)              # far (caramel) ear hinge

# near ear: a long soft floppy teardrop hanging down the left side of the head
EAR_N = [(118, 60), (100, 58), (82, 70), (70, 96), (66, 126), (72, 150), (86, 160), (98, 150), (102, 124), (108, 96),
         (122, 74)]
# far ear: a smaller fold that peeks up behind the head top-right and flops forward
EAR_F = [(170, 64), (182, 44), (204, 36), (226, 42), (240, 60), (246, 84), (240, 96), (228, 88), (214, 72), (196, 64)]

# front legs (shoulder → elbow → paw centre); None = standing straight down
LEGS = {
    'down':  ([SH_F, (194, 248), (198, 272)],      [SH_N, (168, 250), (170, 274)]),
    'wave':  ([SH_F, (194, 248), (198, 272)],      [SH_N, (204, 210), (228, 172)]),
    'think': ([SH_F, (194, 248), (198, 272)],      [SH_N, (200, 216), (204, 184)]),
    'point': ([SH_F, (194, 248), (198, 272)],      [SH_N, (210, 222), (252, 208)]),
    'cheer': ([SH_F, (230, 190), (250, 146)],      [SH_N, (206, 210), (230, 182)]),
    'dance': ([SH_F, (222, 222), (248, 214)],      [SH_N, (206, 204), (234, 184)]),
}

TAILS = {
    'rest':  [(100, 252), (78, 248), (62, 230), (60, 208), (70, 194)],
    'wag':   [(100, 250), (84, 238), (74, 214), (74, 190), (86, 176)],
    'swirl': [(100, 254), (70, 254), (50, 232), (52, 206), (74, 198), (84, 214), (72, 222)],
}

#            eyes       mouth    tilt  brows     look       ears     tail     legs     paw-kind
POSES = {
    'idle':  ('open',   'smile',  0,   None,     (0, 2),   'flop',  'rest',  'down',  'paw'),
    'blink': ('closed', 'smile',  0,   None,     (0, 2),   'flop',  'rest',  'down',  'paw'),
    'talk':  ('open',   'talk',   0,   None,     (0, 2),   'flop',  'rest',  'down',  'paw'),
    'happy': ('wide',   'big',    0,   None,     (0, 1),   'flop',  'wag',   'down',  'paw'),
    'cheer': ('happy',  'big',    0,   None,     (0, 0),   'perk',  'wag',   'cheer', 'paw'),
    'think': ('look',   'hmm',    8,   (0, 6),   (4, -5),  'flop',  'rest',  'think', 'paw'),
    'oops':  ('wide',   'o',     -9,   (7, 2),   (-1, 1),  'perk',  'rest',  'down',  'paw'),
    'wave':  ('open',   'big',    0,   None,     (0, 2),   'flop',  'wag',   'wave',  'paw'),
    'point': ('look',   'talk',   0,   (4, 4),   (5, -2),  'flop',  'rest',  'point', 'paw'),
    'bark':  ('happy',  'bark',   0,   None,     (0, 0),   'fly',   'wag',   'down',  'paw'),
    'dance': ('happy',  'big',    0,   None,     (0, 0),   'perk',  'swirl', 'dance', 'paw'),
    'title': ('wide',   'big',    0,   None,     (0, 2),   'flop',  'wag',   'wave',  'paw'),
    'lead':  ('wide',   'big',    0,   None,     (2, 1),   'flop',  'wag',   'point', 'paw'),   # icon only
}

EAR_ROT = {'flop': (0, 0), 'perk': (18, -14), 'fly': (44, -26)}   # near ear (clockwise = out-left), far ear


def eye(cx, cy, r, mode='open', look=(0, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.08 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.9, rr, fl(P['white'], P['line'], 3.2))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.74 if mode == 'wide' else 0.7)
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
    # philtrum from the nose down to the mouth
    o = path(f'M{NOSE[0] - 1},{NOSE[1] + 8} Q{mx - 1},{my - 6} {mx},{my - 3}', st(line, 3))
    if mode == 'smile':     # puppy "w" smile
        o += path(f'M{mx - 16},{my - 4} Q{mx - 8},{my + 5} {mx},{my - 3} Q{mx + 7},{my + 4} {mx + 13},{my - 5}', st(line, 3.6))
    elif mode == 'talk':
        o += path(f'M{mx - 13},{my - 4} Q{mx},{my - 2} {mx + 12},{my - 5} Q{mx + 11},{my + 12} {mx},{my + 13} '
                  f'Q{mx - 12},{my + 11} {mx - 13},{my - 4} Z', fl(P['mouth'], line, 3.2))
        o += ell(mx, my + 8.5, 6.5, 3.6, f'fill="{P["tongue"]}"')
    elif mode == 'big':
        w, h = 17, 17
        o += path(f'M{f(mx - w)},{f(my - 5)} Q{mx},{f(my - 1)} {f(mx + w - 2)},{f(my - 7)} '
                  f'Q{f(mx + w * 0.8)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.8)},{f(my + h)} {f(mx - w)},{f(my - 5)} Z',
                  fl(P['mouth'], line, 3.2))
        o += path(f'M{mx - 8},{my + h - 3} Q{mx},{my + 6} {mx + 8},{my + h - 3} Q{mx},{my + h + 1} {mx - 8},{my + h - 3} Z',
                  f'fill="{P["tongue"]}"')
    elif mode == 'bark':    # wide open "woof"
        o += path(f'M{mx - 16},{my - 6} Q{mx},{my - 10} {mx + 16},{my - 8} Q{mx + 18},{my + 18} {mx + 2},{my + 23} '
                  f'Q{mx - 16},{my + 20} {mx - 16},{my - 6} Z', fl(P['mouth'], line, 3.4))
        o += path(f'M{mx - 9},{my + 18} Q{mx},{my + 8} {mx + 10},{my + 17} Q{mx + 2},{my + 23} {mx - 9},{my + 18} Z',
                  f'fill="{P["tongue"]}"')
        o += path(f'M{mx - 10},{my - 5} L{mx - 7},{my + 1} L{mx - 4},{my - 6} Z', 'fill="#FFFFFF"')   # tiny tooth
    elif mode == 'o':
        o += ell(mx + 1, my + 3, 6, 7, fl(P['mouth'], line, 3))
    elif mode == 'hmm':
        o += path(f'M{mx - 12},{my + 1} Q{mx - 6},{my - 4} {mx},{my + 1} Q{mx + 6},{my + 5} {mx + 11},{my}', st(line, 3.6))
    return o


def ear_near(doc, mode):
    ang = EAR_ROT[mode][0]
    d = ptsd(EAR_N)
    hi = path('M96,70 Q82,92 80,124', st('#FFFFFF', 4) + ' opacity=".18"')
    o = doc.shaded(f'<path d="{d}" {{a}}/>', P['ear'], P['earSh'], P['earLine'], dx=-6, dy=-6, hi=hi)
    if ang:
        o = f'<g transform="rotate({ang} {EAR_N_PIV[0]} {EAR_N_PIV[1]})">{o}</g>'
    return o


def ear_far(doc, mode):
    ang = EAR_ROT[mode][1]
    d = ptsd(EAR_F)
    o = doc.shaded(f'<path d="{d}" {{a}}/>', P['farFur'], P['farSh'], P['line'], dx=-5, dy=-5)
    o += path('M198,54 Q220,48 234,70', st(P['farSh'], 3))
    if ang:
        o = f'<g transform="rotate({ang} {EAR_F_PIV[0]} {EAR_F_PIV[1]})">{o}</g>'
    return o


def head(doc, pose):
    eyes, mo, tilt, brows, look, ears, *_ = POSES[pose]
    hx, hy, hrx, hry = HEAD
    o = ear_far(doc, ears)
    hi = ell(108, 84, 15, 8, 'fill="#FFFFFF" opacity=".3" transform="rotate(-40 108 84)"')
    o += doc.shaded(f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>', P['fur'], P['sh'], P['line'],
                    dx=-12, dy=-10, hi=hi)
    # a little caramel tuft on the forehead
    o += path('M142,56 Q148,44 158,50 Q162,42 170,48', st(P['line'], 3.4))
    # cream muzzle (protrudes a little at the right: 3/4 view)
    mx, my, mrx, mry = MUZ
    o += doc.shaded(f'<ellipse cx="{mx}" cy="{my}" rx="{mrx}" ry="{mry}" {{a}}/>', P['cream'], P['creamSh'], P['creamLine'],
                    dx=-6, dy=-6, w=3.2)
    # cheeks
    o += ell(130, 140, 13, 8, f'fill="{P["cheek"]}" opacity=".85"')
    o += mouth(mo)
    # nose: soft rounded triangle with a shine
    nx, ny = NOSE
    o += path(f'M{nx - 12},{ny - 5} Q{nx},{ny - 10} {nx + 11},{ny - 6} Q{nx + 10},{ny + 6} {nx},{ny + 8} Q{nx - 10},{ny + 6} {nx - 12},{ny - 5} Z',
              fl(P['nose'], P['nose'], 1.5))
    o += ell(nx - 4, ny - 3.5, 3.6, 2, 'fill="#FFFFFF" opacity=".6"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 7 - lift
            o += path(f'M{f(cx - 7)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 7)},{f(y + 3)}', st(P['line'], 3.4))
    o += ear_near(doc, ears)
    if tilt:
        o = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{o}</g>'
    return o


def leg(pts, far=False):
    """Front leg tube through pts + a cream paw. Returns svg and the paw tip point."""
    d = ptsd(pts, close=False)
    fur = P['farFur'] if far else P['fur']
    cream = P['farCream'] if far else P['cream']
    o = tube(d, LEG_W - (2 if far else 0), P['line'], fur)
    hx, hy = pts[-1]
    ex, ey = pts[-2]
    ln = math.hypot(hx - ex, hy - ey) or 1
    tx, ty = (hx - ex) / ln, (hy - ey) / ln
    down = ty > 0.8
    r = PAW_R - (1 if far else 0)
    if down:   # standing paw: a flat cream oval on the ground, toes forward
        px, py = hx + 2, 281
        o += ell(px, py, r + 3.5, 9, fl(cream, P['line'], 3.6))
        o += path(f'M{f(px + 4)},{f(py - 4)} L{f(px + 5)},{f(py + 3)} M{f(px + 10)},{f(py - 3)} L{f(px + 11)},{f(py + 3)}',
                  st(P['creamLine'], 2.2))
        return o, (px + r + 3.5, py)
    # raised paw: round cream paw + little toe beans facing the viewer
    o += circ(hx, hy, r, fl(cream, P['line'], 3.6))
    for a in (-40, 0, 40):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        dx, dy = tx * c - ty * s, tx * s + ty * c
        o += circ(hx + dx * 6.5, hy + dy * 6.5, 2.2, f'fill="{P["creamLine"]}" opacity=".75"')
    return o, (hx + tx * r, hy + ty * r)


def tail(kind):
    pts = TAILS[kind]
    d = ptsd(pts, close=False)
    o = tube(d, 19, P['line'], P['fur'])
    # cream tail tip
    a, b = pts[-2], pts[-1]
    ln = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
    tx, ty = (b[0] - a[0]) / ln, (b[1] - a[1]) / ln
    o += path(f'M{f(b[0] - tx * 7)},{f(b[1] - ty * 7)} L{f(b[0])},{f(b[1])}', st(P['cream'], 10.2))
    return o


def body(doc):
    bx, by, brx, bry = BODY
    tpl = f'<ellipse cx="{bx}" cy="{by}" rx="{brx}" ry="{bry}" {{a}}/>'
    cid = doc.clip(tpl.format(a=''))
    chest = (f'<g clip-path="url(#{cid})">' + ell(180, 232, 28, 44, f'fill="{P["cream"]}"') +
             ell(190, 248, 16, 34, f'fill="{P["creamSh"]}"') + '</g>')
    hi = ell(116, 210, 10, 6, 'fill="#FFFFFF" opacity=".24" transform="rotate(-36 116 210)"')
    o = doc.shaded(tpl, P['fur'], P['sh'], P['line'], dx=-12, dy=-8, w=0, hi=hi)
    o += chest
    o += tpl.format(a=f'fill="none" stroke="{P["line"]}" stroke-width="{f(LW)}"')
    # near haunch + hind foot
    hx, hy, hrx, hry = HAUNCH
    o += doc.shaded(f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>', P['fur'], P['sh'], P['line'],
                    dx=-8, dy=-8)
    o += path('M96,244 Q104,234 118,232', st('#FFFFFF', 3) + ' opacity=".22"')
    o += ell(140, 282, 22, 9, fl(P['cream'], P['line'], 3.6))
    o += path('M148,278 L149,285 M155,278 L156,285', st(P['creamLine'], 2.2))
    return o


def collar(doc):
    band = 'M108,180 C132,195 170,195 194,176 C197,181 198,187 196,191 C172,209 130,209 106,193 C104,188 105,184 108,180 Z'
    cid = doc.clip(f'<path d="{band}"/>')
    o = path(band, f'fill="{P["collar"]}"')
    o += (f'<g clip-path="url(#{cid})">' + path('M96,191 C130,210 172,210 204,187 L204,220 L96,220 Z', f'fill="{P["collarSh"]}"')
          + '</g>')
    o += path('M108,186 C132,199 170,199 195,182', st(P['stitch'], 1.8) + ' stroke-dasharray="4 5"')
    o += path(band, f'fill="none" stroke="{P["collarLine"]}" stroke-width="3.4" stroke-linejoin="round"')
    # brass ring + round tag (paw-print free, plain shine)
    o += circ(168, 202, 4, f'fill="none" stroke="{P["brassD"]}" stroke-width="2.6"')
    o += circ(169, 213, 9, fl(P['brass'], P['brassD'], 2.6))
    o += path('M164,209 Q166,206 170,206', st(P['brassL'], 2.4))
    return o


def extras(pose, near_tip):
    soft = st(P['line'], 3.6) + ' opacity=".8"'
    ex = ''
    if pose in ('wave', 'title'):
        hx, hy = LEGS['wave'][1][-1]
        ex += path(f'M{hx + 20},{hy - 18} Q{hx + 30},{hy - 6} {hx + 28},{hy + 10} '
                   f'M{hx + 28},{hy - 32} Q{hx + 44},{hy - 14} {hx + 40},{hy + 8}', soft)
    if pose == 'cheer':
        for (x, y, r) in ((44, 112, 5), (268, 96, 5), (34, 84, 3.4), (282, 70, 3.4)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose in ('happy', 'cheer', 'bark', 'wave', 'title'):   # wag marks beside the tail
        t = TAILS['wag'][-1]
        ex += path(f'M{t[0] - 22},{t[1] + 4} Q{t[0] - 30},{t[1] + 16} {t[0] - 28},{t[1] + 28}', soft)
    if pose == 'dance':
        ex += path('M40,206 Q30,220 36,236 M120,298 L112,294 M168,298 L176,294', soft)
        ex += path('M262,170 Q276,180 276,196', soft)
        ex += circ(272, 154, 3.6, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'bark':   # three motion arcs in front of the open mouth (no letters)
        mx, my = MOUTH
        for k, (r, w) in enumerate(((22, 4), (34, 4), (46, 4))):
            a0, a1 = math.radians(-38), math.radians(38)
            cx, cy = mx + 14, my + 6
            ex += path(f'M{f(cx + r * math.cos(a0))},{f(cy + r * math.sin(a0))} A{r},{r} 0 0 1 '
                       f'{f(cx + r * math.cos(a1))},{f(cy + r * math.sin(a1))}', st(P['line'], w) + ' opacity=".8"')
        ex += path('M96,38 L90,24 M118,30 L118,16', soft)
    if pose == 'oops':
        ex += path('M244,48 Q244,36 254,36 Q264,36 262,46 Q260,54 252,56 L252,62', st(P['line'], 4) + ' opacity=".8"')
        ex += circ(252, 72, 2.8, f'fill="{P["line"]}" opacity=".8"')
    if pose == 'think':
        for (x, y, r) in ((248, 84, 3.4), (262, 66, 5), (276, 44, 7)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".75"')
    if pose == 'point':
        tx, ty = near_tip
        ex += path(f'M{f(tx + 10)},{f(ty - 12)} L{f(tx + 20)},{f(ty - 18)} M{f(tx + 12)},{f(ty)} L{f(tx + 24)},{f(ty)} '
                   f'M{f(tx + 10)},{f(ty + 12)} L{f(tx + 20)},{f(ty + 18)}', soft)
    if not ex:
        return ''
    # a soft cream halo under the motion marks so they also read on the night sky
    halo = (ex.replace(f'stroke="{P["line"]}"', f'stroke="{P["halo"]}"').replace(f'fill="{P["line"]}"', f'fill="{P["halo"]}"')
            .replace('stroke-width="2.6"', 'stroke-width="6"').replace('stroke-width="3.6"', 'stroke-width="7"')
            .replace('stroke-width="4"', 'stroke-width="7.4"'))
    return f'<g opacity=".55">{halo}</g>' + ex


def cap(doc):
    """Tiny parade-leader cap (cream crown, brown brim + band, brass button, cream plume) sitting on the head top."""
    o = '<g transform="rotate(-10 150 58)">'
    o += path('M150,34 C142,22 146,8 156,4 C154,14 160,20 158,32 Z', fl(P['cream'], P['creamLine'], 2.6))  # plume
    crown = 'M122,58 L126,30 C136,24 164,24 174,30 L178,58 Z'
    o += doc.shaded(f'<path d="{crown}" {{a}}/>', P['cream'], P['creamSh'], P['creamLine'], dx=-4, dy=-2, w=3.4)
    o += rect(124, 44, 52, 8, 2, f'fill="{P["collar"]}"')
    o += circ(150, 38, 5, fl(P['brass'], P['brassD'], 2))
    o += path('M114,60 C130,52 170,52 188,60 C186,66 176,68 166,66 C150,62 132,64 118,66 C112,65 111,62 114,60 Z',
              fl(P['collar'], P['collarLine'], 3.2))
    o += '</g>'
    return o


def bo(doc, pose):
    eyes, mo, tilt, brows, look, ears, tl, legs, _ = POSES[pose]
    lf, ln = LEGS[legs]
    o = tail(tl)
    far_leg, far_tip = leg(lf, far=True)
    o += far_leg if legs in ('down', 'wave', 'think', 'point') else ''
    o += body(doc)
    near_leg, near_tip = leg(ln)
    raised = legs != 'down'
    if not raised:
        o += near_leg
    o += collar(doc)
    if legs in ('cheer', 'dance'):
        o += far_leg
    o += head(doc, pose)
    if pose == 'title':
        hc = cap(doc)
        o += hc
    if raised:
        o += near_leg
    o += extras(pose, near_tip)
    return o, near_tip


def pt(x, y, pose):
    tilt = POSES[pose][2]
    if tilt:
        x, y = rot(x, y, tilt, *NECK)
    return [round(x), round(y)]


def write_bo():
    out = {}
    for pose in POSES:
        if pose == 'lead':
            continue
        d = Doc('b')
        b, tip = bo(d, pose)
        name = 'bo_title' if pose == 'title' else f'bo_{pose}'
        write(f'characters/{name}.svg', svg(300, 300, b, ''.join(d.defs)))
        out[pose] = {'mouth': pt(MOUTH[0], MOUTH[1] + 4, pose), 'nose': pt(*NOSE, pose), 'head': pt(HEAD[0], HEAD[1], pose),
                     'headTop': pt(150, 4 if pose == 'title' else HEAD[1] - HEAD[3], pose),
                     'paw': [round(tip[0]), round(tip[1])], 'eye': pt(EYE_N[0], EYE_N[1], pose)}
    os.makedirs(os.path.dirname(PTS_JSON), exist_ok=True)
    with open(PTS_JSON, 'w') as fh:
        json.dump({'_about': ('Bo per frame in the 0 0 300 300 viewBox (feet anchor 150,292; scale = h/300). mouth = mouth '
                              'centre (speech-bubble tail / bark puff), nose = nose tip, head = head centre (head is an '
                              'ellipse rx 72 ry 63), headTop = top of the head (title: top of the cap plume), paw = tip of the '
                              'near front paw (point: aim sparkles from here), eye = near eye centre; bbox = measured opaque '
                              'box (added by tools/bo_sheet.js).'),
                   **out}, fh, indent=1)
        fh.write('\n')
    return out


# ======================================================================= CHICK (faces RIGHT)
CK = {'b': '#F7E3A0', 'sh': '#EBCD7C', 'line': '#C9A44A', 'hi': '#FFF6D6', 'beak': '#F0A65A', 'beakD': '#C47A34',
      'leg': '#E2A35A'}


def chick(mode='stand'):
    d = Doc('c')
    o = ''
    # legs
    if mode == 'step':
        legs = [((54, 98), (48, 112)), ((66, 98), (74, 113))]
    else:
        legs = [((54, 98), (54, 113)), ((66, 98), (66, 113))]
    for (a, b) in legs:
        o += path(f'M{a[0]},{a[1]} L{b[0]},{b[1]}', st(CK['beakD'], 3.4))
        o += path(f'M{b[0] - 4},{b[1] + 2} L{b[0] + 7},{b[1] + 2} M{b[0]},{b[1] + 2} L{b[0] + 4},{b[1] - 3}', st(CK['beakD'], 3))
    o += ell(60, 115, 22, 2.4, 'fill="#8A6A3A" opacity=".18"')
    # far wing (flap: up behind the body)
    if mode == 'flap':
        o += d.shaded('<path d="M70,56 C78,36 96,26 106,30 C104,44 92,58 76,66 Z" {a}/>', CK['b'], CK['sh'], CK['line'],
                      dx=-3, dy=-3, w=3)
    # fluffy body: a round ball with a scalloped edge
    pts = []
    for i in range(28):
        a = math.radians(i * 360 / 28)
        r = 36 + (2.2 if i % 2 else 0)
        pts.append((60 + r * math.cos(a), 68 + r * 0.95 * math.sin(a)))
    bd = ptsd(pts)
    hi = ell(44, 46, 12, 7, f'fill="{CK["hi"]}" opacity=".8" transform="rotate(-35 44 46)"')
    o += d.shaded(f'<path d="{bd}" {{a}}/>', CK['b'], CK['sh'], CK['line'], dx=-6, dy=-6, w=3.6, hi=hi)
    # head tuft
    o += path('M56,34 C52,22 58,16 62,24 C62,14 70,14 68,28', fl(CK['b'], CK['line'], 3))
    # eye + cheek
    o += circ(74, 58, 5.8, 'fill="#2F2A3A"') + circ(72.4, 56, 2.2, 'fill="#FFFFFF"') + circ(76, 60.4, 0.9, 'fill="#FFFFFF"')
    o += ell(78, 72, 6, 3.6, 'fill="#F2A99A" opacity=".8"')
    # beak
    if mode == 'flap':
        o += path('M88,60 L104,56 L90,66 Z', fl(CK['beak'], CK['beakD'], 2.2))
        o += path('M89,68 L102,72 L88,72 Z', fl(CK['beak'], CK['beakD'], 2.2))
        o += path('M90,66 L98,68 L89,70 Z', 'fill="#B5615A"')
    else:
        o += path('M88,61 L103,66 L88,71 Q85,66 88,61 Z', fl(CK['beak'], CK['beakD'], 2.2))
    # near wing
    if mode == 'flap':
        o += d.shaded('<path d="M40,64 C30,46 16,38 8,40 C10,54 22,70 38,76 Z" {a}/>', CK['b'], CK['sh'], CK['line'],
                      dx=-3, dy=-3, w=3)
        o += path('M4,30 Q0,38 4,46 M108,20 Q114,28 112,36', st(CK['line'], 2.6) + ' opacity=".8"')
    else:
        o += d.shaded('<path d="M38,70 C40,58 56,58 62,70 C62,82 50,90 40,84 Z" {a}/>', CK['b'], CK['sh'], CK['line'],
                      dx=-3, dy=-3, w=3)
    return svg(120, 120, o, ''.join(d.defs))


# ======================================================================= ROOSTER (faces LEFT)
RS = {'b': '#F5EFE4', 'sh': '#DED2BE', 'line': '#9C8C74', 'tail': '#B98552', 'tailD': '#8A6A3A', 'tailLine': '#5E4526',
      'comb': '#E07A6A', 'combD': '#B0574A', 'beak': '#E3B25A', 'beakD': '#A57C2E', 'leg': '#D9A85A', 'legD': '#A57C2E'}


def rooster(crow=False):
    d = Doc('r')
    o = ''
    # sickle tail feathers (behind, sweeping up to the right)
    for (pts, base, sh) in (
            ([(110, 112), (128, 70), (148, 50), (156, 66), (146, 96), (124, 124)], RS['tailD'], RS['tailLine']),
            ([(108, 116), (136, 84), (154, 86), (150, 108), (128, 130)], RS['tail'], RS['tailD']),
            ([(104, 108), (114, 66), (130, 38), (140, 50), (132, 84), (116, 118)], RS['tail'], RS['tailD'])):
        dd = ptsd(pts)
        o += d.shaded(f'<path d="{dd}" {{a}}/>', base, sh, RS['tailLine'], dx=-3, dy=-3, w=3.2)
    o += path('M118,104 Q130,72 136,52 M120,112 Q140,88 150,64', st('#DDB07E', 2.2) + ' opacity=".8"')
    # legs
    for x in (72, 90):
        o += path(f'M{x},140 L{x},172', st(RS['legD'], 5))
        o += path(f'M{x},140 L{x},172', st(RS['leg'], 2.4))
        o += path(f'M{x + 2},174 L{x - 10},175 M{x},174 L{x + 7},175 M{x},173 L{x - 6},168', st(RS['legD'], 3.4))
    o += ell(80, 176, 32, 3, 'fill="#5E4526" opacity=".16"')
    # body (teardrop, chest to the left)
    body_pts = [(46, 100), (58, 84), (84, 82), (110, 90), (126, 108), (122, 132), (100, 146), (70, 146), (50, 132), (42, 116)]
    if crow:
        body_pts = [(38, 100), (52, 80), (84, 80), (110, 90), (126, 108), (122, 132), (100, 146), (66, 146), (44, 132), (34, 116)]
    bd = ptsd(body_pts)
    hi = ell(62, 98, 12, 6, 'fill="#FFFFFF" opacity=".6" transform="rotate(-30 62 98)"')
    o += d.shaded(f'<path d="{bd}" {{a}}/>', RS['b'], RS['sh'], RS['line'], dx=-6, dy=-6, w=3.8, hi=hi)
    # wing
    o += d.shaded('<path d="M70,104 C82,94 108,98 116,112 C114,128 96,136 80,130 C70,124 66,114 70,104 Z" {a}/>',
                  RS['b'], RS['sh'], RS['line'], dx=-3, dy=-3, w=3.2)
    o += path('M80,116 Q94,122 108,116 M84,124 Q96,128 106,124', st(RS['sh'], 2.6))
    # neck + head
    h = ''
    h += d.shaded('<path d="M44,88 C40,70 42,54 56,46 C70,40 80,50 80,62 C80,74 76,86 70,96 Z" {a}/>', RS['b'], RS['sh'],
                  RS['line'], dx=-4, dy=-4, w=3.6)
    # comb (3 soft lobes)
    h += path('M48,46 C42,36 48,28 54,34 C54,24 64,22 66,32 C70,24 80,28 76,40 C72,46 56,48 48,46 Z',
              fl(RS['comb'], RS['combD'], 2.8))
    # beak
    if crow:
        h += path('M44,56 L26,48 L44,62 Z', fl(RS['beak'], RS['beakD'], 2.4))
        h += path('M44,66 L28,70 L44,70 Z', fl(RS['beak'], RS['beakD'], 2.4))
        h += path('M44,62 L34,64 L44,67 Z', 'fill="#8E3F37"')
        h += path('M52,56 Q56,51 61,56', st('#2F2A3A', 3))     # proud closed eye
    else:
        h += path('M44,58 L28,64 L44,70 Q47,64 44,58 Z', fl(RS['beak'], RS['beakD'], 2.4))
        h += circ(56, 58, 4.6, 'fill="#2F2A3A"') + circ(54.6, 56.4, 1.8, 'fill="#FFFFFF"')
    # wattle
    h += path('M44,70 C40,80 44,88 50,84 C54,80 52,72 48,70 Z', fl(RS['comb'], RS['combD'], 2.4))
    h += ell(60, 68, 4.4, 3, 'fill="#F2A99A" opacity=".8"')
    if crow:
        h = f'<g transform="rotate(16 66 92)">{h}</g>'
        h += path('M14,34 Q6,46 12,58 M6,22 Q-6,42 4,62', st(RS['line'], 3) + ' opacity=".8"')
    o += h
    return svg(160, 180, o, ''.join(d.defs))


# ======================================================================= ICON
def sheep(d, x, y, s):
    """Small sheep facing right (fluffy wool cloud, dark-brown face/legs), feet at (x, y)."""
    o = ''
    for lx in (-14, 4, 14):
        o += path(f'M{f(x + lx * s)},{f(y - 14 * s)} L{f(x + lx * s)},{f(y - 1 * s)}', st('#5B4636', 7 * s))
    pts = []
    for i in range(16):
        a = math.radians(i * 22.5)
        r = 26 + (4 if i % 2 else 0)
        pts.append((x + r * 1.15 * s * math.cos(a), y - 34 * s + r * 0.82 * s * math.sin(a)))
    w = ptsd(pts)
    o += d.shaded(f'<path d="{w}" {{a}}/>', '#FBF6EC', '#E3D9C6', '#A8987E', dx=-5 * s, dy=-5 * s, w=3.4)
    hx, hy = x + 30 * s, y - 42 * s
    o += ell(hx - 4 * s, hy - 10 * s, 7 * s, 4.4 * s, fl('#5B4636', '#3E2F24', 2.4) + f' transform="rotate(-30 {f(hx - 4 * s)} {f(hy - 10 * s)})"')
    o += ell(hx, hy, 12 * s, 14 * s, fl('#6B5444', '#3E2F24', 3))
    o += circ(hx - 6 * s, hy - 16 * s, 8 * s, 'fill="#FBF6EC"')
    o += circ(hx + 2 * s, hy - 3 * s, 2.6 * s, 'fill="#FFFFFF"') + circ(hx + 2.4 * s, hy - 2.6 * s, 1.5 * s, 'fill="#2F2A3A"')
    return o


def wagon(d, x, y, s, wheel_col='#9AA4AE'):
    """Little wooden wagon (2 wheels), base at (x, y)."""
    o = ''
    o += path(f'M{f(x + 46 * s)},{f(y - 24 * s)} L{f(x + 70 * s)},{f(y - 34 * s)}', st('#7A5130', 5 * s))
    o += d.shaded(rect(x - 46 * s, y - 50 * s, 92 * s, 28 * s, 5 * s, '{a}'), '#B98552', '#7A5130', '#5E3D22',
                  dx=-3, dy=-3, w=3.4)
    o += path(f'M{f(x - 40 * s)},{f(y - 40 * s)} L{f(x + 40 * s)},{f(y - 40 * s)}', st('#DDB07E', 2.6))
    for wx in (-28, 28):
        cx, cy = x + wx * s, y - 14 * s
        o += circ(cx, cy, 14 * s, fl('#7A5130', '#5E3D22', 3.4)) + circ(cx, cy, 5 * s, fl(wheel_col, '#636C75', 2))
        o += path(f'M{f(cx - 10 * s)},{f(cy)} L{f(cx + 10 * s)},{f(cy)} M{f(cx)},{f(cy - 10 * s)} L{f(cx)},{f(cy + 10 * s)}',
                  st('#5E3D22', 2.4))
    return o


def bucket(d, x, y, s):
    """A blue bucket standing at (x, y) (answer blue — it's a parade member, not Bo)."""
    o = path(f'M{f(x - 22 * s)},{f(y - 50 * s)} Q{f(x)},{f(y - 82 * s)} {f(x + 22 * s)},{f(y - 50 * s)}', st('#636C75', 4 * s))
    b = f'M{f(x - 26 * s)},{f(y - 50 * s)} L{f(x + 26 * s)},{f(y - 50 * s)} L{f(x + 19 * s)},{f(y)} L{f(x - 19 * s)},{f(y)} Z'
    o += d.shaded(f'<path d="{b}" {{a}}/>', '#3C8DE8', '#1F5BA8', '#1F5BA8', dx=-5 * s, dy=-2, w=3.6,
                  hi=path(f'M{f(x - 15 * s)},{f(y - 42 * s)} L{f(x - 11 * s)},{f(y - 8 * s)}', st('#A6CCF5', 4 * s)))
    o += ell(x, y - 50 * s, 26 * s, 6 * s, fl('#A6CCF5', '#1F5BA8', 3))
    return o


def barn(d, x, y, s):
    """Barn base centre (x, y): muted terracotta, cream trim, open dark doorway, loft window, weathervane."""
    o = ''
    w, h = 210 * s, 190 * s
    body = (f'M{f(x - w / 2)},{f(y)} L{f(x - w / 2)},{f(y - h * 0.62)} L{f(x - w * 0.3)},{f(y - h * 0.86)} L{f(x)},{f(y - h)} '
            f'L{f(x + w * 0.3)},{f(y - h * 0.86)} L{f(x + w / 2)},{f(y - h * 0.62)} L{f(x + w / 2)},{f(y)} Z')
    o += d.shaded(f'<path d="{body}" {{a}}/>', '#B5735E', '#7E4A3C', '#5E342A', dx=-10 * s, dy=0, w=4)
    for i in range(1, 7):
        xx = x - w / 2 + i * w / 7
        o += path(f'M{f(xx)},{f(y - h * 0.6)} L{f(xx)},{f(y - 4)}', st('#9A5E4C', 2.4) + ' opacity=".7"')
    roof = (f'M{f(x - w / 2 - 12 * s)},{f(y - h * 0.6)} L{f(x - w * 0.31)},{f(y - h * 0.88)} L{f(x)},{f(y - h - 10 * s)} '
            f'L{f(x + w * 0.31)},{f(y - h * 0.88)} L{f(x + w / 2 + 12 * s)},{f(y - h * 0.6)}')
    o += path(roof, st('#F1E6CF', 10 * s)) + path(roof, st('#5E342A', 2.6) + ' opacity=".5"')
    # loft window (warm)
    o += rect(x - 18 * s, y - h * 0.8, 36 * s, 30 * s, 4, fl('#FFE7B0', '#F1E6CF', 5 * s))
    o += path(f'M{f(x)},{f(y - h * 0.8)} L{f(x)},{f(y - h * 0.8 + 30 * s)}', st('#F1E6CF', 3 * s))
    # doorway
    dw, dh = 96 * s, 110 * s
    o += rect(x - dw / 2, y - dh, dw, dh, 3, fl('#3E2620', '#F1E6CF', 7 * s))
    o += path(f'M{f(x - dw / 2)},{f(y - dh)} L{f(x + dw / 2)},{f(y)} M{f(x + dw / 2)},{f(y - dh)} L{f(x - dw / 2)},{f(y)}',
              st('#5A3A30', 3) + ' opacity=".5"')
    o += ell(x, y - 12 * s, 34 * s, 10 * s, 'fill="#FFD9A0" opacity=".25"')
    # open doors (swung outwards, seen thin)
    for sg in (-1, 1):
        x0 = x + sg * dw / 2
        dd = f'M{f(x0)},{f(y - dh)} L{f(x0 + sg * 30 * s)},{f(y - dh + 8 * s)} L{f(x0 + sg * 30 * s)},{f(y + 4 * s)} L{f(x0)},{f(y)} Z'
        o += path(dd, fl('#A8664F', '#5E342A', 3))
        o += path(f'M{f(x0)},{f(y - dh)} L{f(x0 + sg * 30 * s)},{f(y + 4 * s)}', st('#F1E6CF', 3.6 * s))
    # weathervane
    vx, vy = x, y - h - 12 * s
    o += path(f'M{f(vx)},{f(vy)} L{f(vx)},{f(vy - 40 * s)}', st('#4A4F55', 3.4 * s))
    o += path(f'M{f(vx - 16 * s)},{f(vy - 40 * s)} L{f(vx + 20 * s)},{f(vy - 40 * s)}', st('#4A4F55', 3 * s))
    o += path(f'M{f(vx - 8 * s)},{f(vy - 42 * s)} C{f(vx - 8 * s)},{f(vy - 58 * s)} {f(vx + 6 * s)},{f(vy - 62 * s)} '
              f'{f(vx + 10 * s)},{f(vy - 52 * s)} L{f(vx + 18 * s)},{f(vy - 60 * s)} L{f(vx + 16 * s)},{f(vy - 44 * s)} Z',
              'fill="#4A4F55"')
    return o


def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6C9A6"/>'
                  f'<stop offset=".45" stop-color="#F8DCC6"/><stop offset=".8" stop-color="#FDF4E3"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # low morning sun upper-left
    o += circ(92, 96, 70, 'fill="#FFE9B8" opacity=".55"') + circ(92, 96, 46, 'fill="#FFF3CF"')
    # far hills + patchwork fields (muted yellow-green)
    o += path('M0,300 C80,250 160,256 240,282 C320,240 420,236 512,268 L512,360 L0,360 Z', 'fill="#B9C98E"')
    o += path('M140,286 L230,270 L262,300 L170,312 Z M320,262 L400,256 L430,280 L344,290 Z', 'fill="#CFD89E"')
    o += path('M240,282 L300,262 L332,292 L262,300 Z', 'fill="#A9BD7E"')
    # windmill far left
    o += path('M40,300 L46,236 L58,236 L64,300 Z', fl('#E9DFCB', '#B8A98E', 2.4))
    for a in (20, 110, 200, 290):
        x1, y1 = rot(52, 196, a, 52, 236)
        o += path(f'M52,236 L{f(x1)},{f(y1)}', st('#B8A98E', 5))
    o += circ(52, 236, 4, 'fill="#8A7B64"')
    # mist band
    o += path('M0,318 C120,306 300,312 512,302 L512,330 C320,338 140,334 0,340 Z', 'fill="#FFFFFF" opacity=".45"')
    # meadow
    o += path('M0,346 C140,332 340,340 512,326 L512,512 L0,512 Z', 'fill="#A9C27F"')
    o += path('M0,430 C160,420 340,432 512,420 L512,512 L0,512 Z', 'fill="#98B46F"')
    # barn on the right (cropped by the edge)
    o += barn(d, 430, 418, 1.0)
    # dirt path band toward the barn door
    o += path('M0,404 C140,396 300,402 420,410 L460,420 L460,446 C300,440 140,452 0,456 Z', 'fill="#D8BE95"')
    o += path('M0,404 C140,396 300,402 420,410 M0,456 C140,452 300,440 460,446', st('#BFA27A', 3))
    # fence posts mid-left
    for x in (10, 60, 110, 160):
        o += rect(x, 330, 10, 46, 3, fl('#B98552', '#7A5130', 2.4))
    o += path('M0,342 L176,340 M0,360 L176,358', st('#B98552', 6))
    # little parade: sheep (back), wagon with a blue bucket
    o += ell(40, 440, 50, 7, 'fill="#5E4526" opacity=".16"')
    o += sheep(d, 34, 440, 1.25)
    o += ell(134, 446, 54, 7, 'fill="#5E4526" opacity=".16"')
    o += wagon(d, 130, 446, 1.0)
    o += bucket(d, 130, 398, 0.95)
    # sparkles
    o += star4(250, 160, 12, w=2.2) + star4(214, 220, 8, w=2) + star4(470, 118, 9, w=2)
    # Bo leading (waving), big and in front
    sc = 1.26
    tx, ty = 302 - 150 * sc, 504 - 292 * sc
    bd = Doc('ib')
    bb, _ = bo(bd, 'lead')
    d.defs.extend(bd.defs)
    o += ell(306, 500, 112, 13, 'fill="#5E4526" opacity=".2"')
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{bb}</g>'
    return svg(512, 512, o, ''.join(d.defs))


def main():
    tbl = write_bo()
    write('characters/chick.svg', chick('stand'))
    write('characters/chick_step.svg', chick('step'))
    write('characters/chick_flap.svg', chick('flap'))
    write('characters/rooster.svg', rooster(False))
    write('characters/rooster_crow.svg', rooster(True))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:8s} {v}')


if __name__ == '__main__':
    main()
