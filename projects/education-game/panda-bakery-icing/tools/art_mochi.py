#!/usr/bin/env python3
"""Character art generator for Mochi's Icing Bakery (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/mochi_{idle,blink,talk,happy,cheer,think,oops,wave,pipe,point}.svg + mochi_title.svg
        0 0 300 300, FEET ANCHOR (150,292). Mochi (a round baby panda baker in a cream chef's hat and an oatmeal
        apron) faces RIGHT in 3/4 view, eyes on the viewer. Body / legs / apron / tail are identical in every frame;
        only the eyes, mouth, brows, arms, a small head tilt (think / oops) and the hat bounce change.
        The icing bag is NOT drawn here: docs/art/mochi_hand.json gives, per frame, the point in the near (right)
        paw where the bag is gripped (the nozzle hangs from there) plus a suggested nozzle direction.
  characters/bird.svg, bird_flap.svg      0 0 160 120, centre anchor, facing right (lilac-grey sparrow, cream belly)
  characters/sack.svg                     0 0 160 140, bottom anchor (80,136), open burlap flour sack
  characters/mouse.svg, mouse_happy.svg   0 0 120 100, bottom anchor (60,98), grey mouse peeking over a rim
  icon.svg                                0 0 512 512, full bleed, opaque

Usage: python3 tools/art_mochi.py [outDir]
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
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'mochi_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

M = {  # Mochi palette (DESIGN.md section 3)
    'fur': '#FAF7F2', 'furSh': '#E3DDD3', 'furLine': '#6F6A72',
    'blk': '#34323D', 'blkLine': '#22212A', 'blkHi': '#55525F',
    'cheek': '#F6B1A0', 'nose': '#2B2A33', 'white': '#FFFFFF', 'pupil': '#22212A',
    'mouth': '#7A3A3F', 'tongue': '#F28F86',
    'hat': '#FFF6E8', 'hatSh': '#EADFCC', 'hatLine': '#A3927C',
    'apron': '#E9DFD2', 'apronSh': '#D6C9B8', 'apronLine': '#9C8C79',
    'spoon': '#B98A5A', 'spoonLine': '#7A5634', 'flour': '#FFFFFF',
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


def sparkle(x, y, s, fill='#FFF3C4', line='#D9B45A'):
    return path(f'M{f(x)},{f(y - s)} Q{f(x + s * 0.18)},{f(y - s * 0.18)} {f(x + s)},{f(y)} '
                f'Q{f(x + s * 0.18)},{f(y + s * 0.18)} {f(x)},{f(y + s)} Q{f(x - s * 0.18)},{f(y + s * 0.18)} '
                f'{f(x - s)},{f(y)} Q{f(x - s * 0.18)},{f(y - s * 0.18)} {f(x)},{f(y - s)} Z',
                fl(fill, line, 1.6))


class Doc:
    """Collects <defs> with unique ids (prefix lets several drawings share one file, e.g. the icon)."""

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


# ======================================================================= MOCHI geometry
HEAD = (150, 124, 88, 74)          # x 62-238, y 50-198  (head ~ 52 % of the 286 px figure, ~60 % with ears)
NECK = (152, 196)                  # tilt pivot
BODY = (148, 244, 60, 48)          # x 88-208, y 196-292
EAR_F = (78, 72, 25)               # back ear (viewer's left)
EAR_N = (218, 64, 23)              # front ear (towards the tray)
PATCH_N = (119, 136, 27, 32, 30)   # near eye patch (viewer's left, bigger): cx cy rx ry rot
PATCH_F = (192, 132, 21, 27, -26)  # far eye patch
EYE_N = (122, 131, 15.5)
EYE_F = (192, 128, 12.5)
NOSE = (163, 158)
MOUTH = (163, 170)
SH_F = (100, 214)                  # far arm shoulder (behind the body)
SH_N = (204, 213)                  # near (right) arm shoulder (in front)
# arm hanging straight down from the shoulder (0,0); length ~62, paw at the end
ARM = ('M-17,-6 C-21,10 -22,26 -20,38 C-18,52 -8,60 2,60 C12,60 21,52 21,38 C21,26 20,10 16,-6 '
       'C10,-17 -11,-17 -17,-6 Z')
GRIP = (1, 44)                     # where the icing bag is gripped in the paw (local)


def arm(doc, sh, ang, scale=1.0):
    """Charcoal arm; ang 0 = hanging down, > 0 swings the paw to the viewer's LEFT, < 0 to the RIGHT."""
    tf = f'translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)}) scale({f(scale)})'
    tpl = f'<path d="{ARM}" transform="{tf}" {{a}}/>'
    hi = f'<path d="M-11,2 C-13,14 -14,26 -12,36" transform="{tf}" {st(M["blkHi"], 5)} opacity=".85"/>'
    o = doc.shaded(tpl, M['blkHi'], M['blk'], M['blkLine'], dx=-3, dy=-3, hi=hi)
    # paw pad (soft rosy bean on the paw tip)
    o += f'<g transform="{tf}">' + ell(2, 48, 8.5, 6, f'fill="{M["cheek"]}" opacity=".55"') + '</g>'
    return o


def local_pt(sh, ang, scale, p):
    x, y = rot(p[0] * scale, p[1] * scale, ang)
    return sh[0] + x, sh[1] + y


def eye(cx, cy, r, mode='open', look=(1, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.1 if mode == 'wide' else 1)
        o += circ(cx, cy, rr, fl(M['white'], M['blkLine'], 3))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.66 if mode == 'wide' else 0.64)
        o += circ(px, py, pr, f'fill="{M["pupil"]}"')
        o += circ(px - pr * 0.34, py - pr * 0.4, pr * 0.42, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.42, py + pr * 0.38, pr * 0.17, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink (light line on the dark patch)
        o += path(f'M{f(cx - r * 0.85)},{f(cy - 1)} Q{f(cx)},{f(cy + r * 0.7)} {f(cx + r * 0.85)},{f(cy - 1)}',
                  st(M['fur'], 4.6))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.85)},{f(cy + r * 0.35)} Q{f(cx)},{f(cy - r * 0.85)} {f(cx + r * 0.85)},'
                  f'{f(cy + r * 0.35)}', st(M['fur'], 5.2))
    return o


def mouth(mode):
    mx, my = MOUTH
    if mode == 'closed':            # little panda "w"
        return path(f'M{mx - 11},{my - 2} Q{mx - 5},{my + 5} {mx},{my - 1} Q{mx + 5},{my + 5} {mx + 11},{my - 3}',
                    st(M['furLine'], 3.6))
    if mode == 'talk':
        o = path(f'M{mx - 11},{my - 3} Q{mx},{my} {mx + 11},{my - 4} Q{mx + 10},{my + 14} {mx},{my + 15} '
                 f'Q{mx - 11},{my + 13} {mx - 11},{my - 3} Z', fl(M['mouth'], M['furLine'], 3.2))
        o += ell(mx, my + 9.5, 6.5, 3.8, f'fill="{M["tongue"]}"')
        return o
    if mode in ('smile', 'big'):
        k = 1.3 if mode == 'big' else 1.0
        w, h = 14 * k, 14 * k
        o = path(f'M{f(mx - w)},{f(my - 4)} Q{mx},{f(my + 1)} {f(mx + w)},{f(my - 6)} '
                 f'Q{f(mx + w * 0.85)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.85)},{f(my + h)} '
                 f'{f(mx - w)},{f(my - 4)} Z', fl(M['mouth'], M['furLine'], 3.2))
        o += ell(mx, my + h - 4.5 * k, 8 * k, 4.2 * k, f'fill="{M["tongue"]}"')
        return o
    if mode == 'o':                 # curious "hmm?"
        return ell(mx + 1, my + 3, 5.5, 6.5, fl(M['mouth'], M['furLine'], 3))
    if mode == 'hmm':               # little wavy curious mouth
        return path(f'M{mx - 10},{my + 2} Q{mx - 5},{my - 3} {mx},{my + 2} Q{mx + 5},{my + 6} {mx + 10},{my}',
                    st(M['furLine'], 3.6))
    return ''


def ear(doc, cx, cy, r):
    tpl = f'<circle cx="{cx}" cy="{cy}" r="{r}" {{a}}/>'
    hi = path(f'M{cx - r * 0.55},{cy + r * 0.1} Q{cx - r * 0.5},{cy - r * 0.5} {cx},{cy - r * 0.6}',
              st(M['blkHi'], 4.5))
    return doc.shaded(tpl, M['blkHi'], M['blk'], M['blkLine'], dx=-3, dy=-3, hi=hi)


def patch(doc, p):
    cx, cy, rx, ry, a = p
    tpl = f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({a} {cx} {cy})" {{a}}/>'
    return tpl.format(a=fl(M['blk'], M['blkLine'], 3))


def hat(doc, dy=0):
    """Tall puffy chef's toque, a touch tilted back (to the viewer's left), band hugging the head top."""
    o = f'<g transform="translate(0,{f(dy + 3)}) rotate(-5 150 80)">'
    puff = ('M104,64 C86,60 80,38 94,26 C100,12 120,8 130,16 C136,2 164,0 172,14 C184,6 206,12 206,30 '
            'C220,40 214,62 198,64 Z')
    hi = ell(116, 26, 14, 8, 'fill="#FFFFFF" opacity=".9" transform="rotate(-25 116 26)"')
    o += doc.shaded(f'<path d="{puff}" {{a}}/>', M['hat'], M['hatSh'], M['hatLine'], dx=-6, dy=-7, hi=hi)
    # soft puff creases
    o += path('M130,18 C128,30 132,44 138,56 M172,16 C176,30 174,44 170,56', st(M['hatSh'], 3.4))
    band = 'M100,58 C130,52 170,52 202,58 L200,86 C168,80 132,80 102,86 Z'
    o += doc.shaded(f'<path d="{band}" {{a}}/>', M['hat'], M['hatSh'], M['hatLine'], dx=-4, dy=-4)
    o += path('M124,59 L124,82 M150,56 L150,80 M176,57 L176,82', st(M['hatSh'], 3))
    o += '</g>'
    return o


def head(doc, eyes='open', mo='closed', brows=None, look=(1, 2), hat_dy=0):
    hx, hy, hrx, hry = HEAD
    o = ''
    o += ear(doc, *EAR_F)
    o += ear(doc, *EAR_N)
    hi = ell(100, 92, 26, 14, 'fill="#FFFFFF" opacity=".9" transform="rotate(-34 100 92)"')
    o += doc.shaded(f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>',
                    M['fur'], M['furSh'], M['furLine'], dx=-12, dy=-11, hi=hi)
    # muzzle (a slightly brighter oval) toward the tray side
    o += ell(165, 166, 28, 20, f'fill="#FFFFFF" opacity=".9"')
    o += patch(doc, PATCH_N) + patch(doc, PATCH_F)
    # cheeks
    o += ell(100, 170, 15, 9, f'fill="{M["cheek"]}" opacity=".9"')
    o += ell(214, 164, 11, 8, f'fill="{M["cheek"]}" opacity=".9"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 21 - lift
            o += path(f'M{f(cx - 9)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 9)},{f(y + 3)}', st(M['blk'], 4))
    # nose: rounded triangle + shine
    nx, ny = NOSE
    o += path(f'M{nx - 9},{ny - 4} Q{nx},{ny - 8} {nx + 9},{ny - 4} Q{nx + 8},{ny + 3} {nx},{ny + 6} '
              f'Q{nx - 8},{ny + 3} {nx - 9},{ny - 4} Z', f'fill="{M["nose"]}"')
    o += ell(nx - 3, ny - 3, 3, 1.6, 'fill="#FFFFFF" opacity=".75"')
    o += path(f'M{nx},{ny + 5} L{nx},{MOUTH[1] - 1}', st(M['furLine'], 3))
    o += mouth(mo)
    o += hat(doc, hat_dy)
    return o


def body(doc):
    o = ''
    # tiny round tail (back, viewer's left)
    o += circ(90, 262, 11, fl(M['fur'], M['furLine']))
    bx, by, brx, bry = BODY
    hi = ell(116, 222, 16, 9, 'fill="#FFFFFF" opacity=".8" transform="rotate(-30 116 222)"')
    o += doc.shaded(f'<ellipse cx="{bx}" cy="{by}" rx="{brx}" ry="{bry}" {{a}}/>',
                    M['fur'], M['furSh'], M['furLine'], dx=-9, dy=-8, hi=hi)
    # legs (charcoal), the near one a bit forward
    for cx, cy, rx, ry, a in ((116, 276, 27, 16, 8), (180, 278, 30, 14, -4)):
        tpl = f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({a} {cx} {cy})" {{a}}/>'
        o += doc.shaded(tpl, M['blkHi'], M['blk'], M['blkLine'], dx=-3, dy=-3)
    o += ell(192, 282, 8, 5, f'fill="{M["cheek"]}" opacity=".5"')   # little sole bean on the near foot
    # apron: bib + skirt, shifted toward the tray (3/4 view)
    ap = ('M134,204 C146,200 178,200 190,204 L192,232 C204,238 210,252 206,268 C196,276 172,280 154,280 '
          'C136,280 116,276 108,268 C106,252 116,238 132,232 Z')
    o += doc.shaded(f'<path d="{ap}" {{a}}/>', M['apron'], M['apronSh'], M['apronLine'], dx=-6, dy=-5, w=3.8)
    # waist tie + little bow at the back
    o += path('M120,236 C140,240 176,240 198,234', st(M['apronLine'], 3) + ' opacity=".8"')
    o += path('M110,238 C100,230 92,234 96,242 C100,248 108,244 110,238 Z', fl(M['apron'], M['apronLine'], 3))
    o += path('M110,238 C102,246 98,254 104,256', st(M['apronLine'], 3))
    # pocket with a tiny wooden spoon
    o += path('M178,248 L178,268 C178,272 200,272 202,266 L202,248', st(M['apronSh'], 3))
    o += path('M196,252 L208,226', st(M['spoonLine'], 7)) + path('M196,252 L208,226', st(M['spoon'], 3.6))
    o += ell(210, 220, 6, 8, fl(M['spoon'], M['spoonLine'], 2.6) + ' transform="rotate(24 210 220)"')
    o += path('M176,248 L204,248', st(M['apronLine'], 3))
    # flour smudge
    o += path('M126,258 C130,250 142,252 146,256 C152,256 152,264 146,266 C140,272 128,270 126,264 C120,264 120,258 126,258 Z',
              f'fill="{M["flour"]}" opacity=".7"')
    o += circ(154, 270, 2.4, f'fill="{M["flour"]}" opacity=".8"') + circ(120, 250, 1.8, f'fill="{M["flour"]}" opacity=".8"')
    return o


F_REST, N_REST = (SH_F, 26, 1), (SH_N, -24, 1)
POSES = {
    #          eyes      mouth     far arm                 near (right) arm          tilt brows    look   hat dy
    'idle':    ('open',  'closed', F_REST,                 N_REST,                    0, None,     (1, 2),  0),
    'blink':   ('closed', 'closed', F_REST,                N_REST,                    0, None,     (1, 2),  0),
    'talk':    ('open',  'talk',   (SH_F, 34, 1),          (SH_N, -40, 1),            0, None,     (1, 2), -1),
    'happy':   ('wide',  'smile',  (SH_F, 62, 1),          (SH_N, -64, 1),            0, None,     (1, 1), -2),
    'cheer':   ('happy', 'big',    ((98, 210), 130, 1.06), ((202, 208), -132, 1.06),     0, None,     (0, 0), -4),
    'think':   ('look',  'hmm',    F_REST,                 ((206, 214), 120, 0.95),   7, (0, 6),   (4, -5), 0),
    'oops':    ('wide',  'o',      (SH_F, 42, 0.95),       ((204, 210), -72, 1),     -7, (8, 0),   (-1, 1), -2),
    'wave':    ('open',  'smile',  F_REST,                 ((204, 210), -140, 1),     0, None,     (1, 2), -2),
    'pipe':    ('look',  'smile',  F_REST,                 ((204, 212), -84, 1),      0, None,     (5, 4),  0),
    'point':   ('look',  'talk',   F_REST,                 ((204, 211), -118, 1),     0, (4, 4),   (5, -4), -1),
    'title':   ('wide',  'smile',  ((104, 214), -52, 1),   ((204, 210), -140, 1),     0, None,     (1, 2), -2),
}
# suggested nozzle direction per frame: degrees, canvas convention (0 = right, 90 = straight down), from the grip
# point towards the nozzle tip.
NOZZLE_ANG = {'idle': 100, 'blink': 100, 'talk': 96, 'happy': 70, 'cheer': 60, 'think': 140, 'oops': 70,
              'wave': 40, 'pipe': 70, 'point': 30, 'title': 40}


def heart_cookie(doc, cx, cy, r=26):
    """A round sugar cookie with a red heart of icing (title pose), dough palette from DESIGN.md section 3."""
    o = circ(cx, cy, r, fl('#E9B872', '#9A6330', 3.6))
    o += circ(cx, cy, r - 5, 'fill="none" stroke="#D79B55" stroke-width="3"')
    o += ell(cx - r * 0.4, cy - r * 0.45, r * 0.3, r * 0.16, f'fill="#F6D59D" transform="rotate(-30 {f(cx - r * 0.4)} {f(cy - r * 0.45)})"')
    k = r / 26
    hp = (f'M{f(cx)},{f(cy + 11 * k)} C{f(cx - 16 * k)},{f(cy)} {f(cx - 14 * k)},{f(cy - 13 * k)} {f(cx - 6 * k)},'
          f'{f(cy - 12 * k)} C{f(cx - 2 * k)},{f(cy - 12 * k)} {f(cx)},{f(cy - 8 * k)} {f(cx)},{f(cy - 6 * k)} '
          f'C{f(cx)},{f(cy - 8 * k)} {f(cx + 2 * k)},{f(cy - 12 * k)} {f(cx + 6 * k)},{f(cy - 12 * k)} '
          f'C{f(cx + 14 * k)},{f(cy - 13 * k)} {f(cx + 16 * k)},{f(cy)} {f(cx)},{f(cy + 11 * k)} Z')
    o += f'<path d="{hp}" transform="translate(0,1.6)" {st("#A8282E", 6.5 * k)}/>'
    o += path(hp, st('#E84A4A', 6 * k))
    o += path(f'M{f(cx - 9 * k)},{f(cy - 9 * k)} Q{f(cx - 12 * k)},{f(cy - 3 * k)} {f(cx - 6 * k)},{f(cy + 3 * k)}',
              st('#F7A0A0', 2 * k))
    o += circ(cx + 7 * k, cy - 9 * k, 1.4 * k, 'fill="#FFFFFF"')
    for (dx, dy) in ((-14, 12), (14, 10), (16, -14)):
        o += circ(cx + dx * k, cy + dy * k, 2.2 * k, 'fill="#5A3A28"')
    return o


def mochi(doc, pose):
    eyes, mo, aF, aN, tilt, brows, look, hat_dy = POSES[pose]
    o = ''
    if pose not in ('title', 'cheer'):
        o += arm(doc, *aF)
    o += body(doc)
    if pose == 'cheer':     # raised far arm: above the shoulder, so it sits over the body but behind the head
        o += arm(doc, *aF)
    hd = head(doc, eyes, mo, brows, look, hat_dy)
    if tilt:
        hd = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{hd}</g>'
    o += hd
    if pose == 'title':
        o += arm(doc, *aF)
        tx, ty = local_pt(*aF, GRIP)
        o += heart_cookie(doc, tx + 12, ty - 22, 31)
        o += ell(tx - 6, ty - 8, 7, 10, fl(M['blkHi'], M['blkLine'], 3.4) + f' transform="rotate(32 {f(tx - 6)} {f(ty - 8)})"')
    if pose in ('wave', 'title'):
        o += path('M262,118 Q276,130 276,148 M276,102 Q294,122 290,152', st(M['furSh'], 4) + ' opacity=".95"')
        o += path('M262,118 Q276,130 276,148 M276,102 Q294,122 290,152', st(M['furLine'], 1.6) + ' opacity=".35"')
    if pose == 'cheer':
        o += sparkle(34, 112, 10) + sparkle(270, 96, 9) + sparkle(26, 74, 6) + sparkle(282, 64, 6)
    if pose == 'think':
        for (x, y, r) in ((246, 70, 4), (258, 52, 6), (272, 30, 8)):
            o += circ(x, y, r, fl('#FFFFFF', M['furLine'], 2.4))
    if pose == 'oops':   # a small friendly "?" drawn as a path
        o += path('M246,58 C246,44 270,42 270,56 C270,66 258,66 258,78', st(M['blkLine'], 7))
        o += path('M246,58 C246,44 270,42 270,56 C270,66 258,66 258,78', st('#FFD9A0', 3.6))
        o += circ(258, 92, 4.6, fl('#FFD9A0', M['blkLine'], 2.4))
    o += arm(doc, *aN)
    return o


def hand_table():
    out = {}
    for pose, p in POSES.items():
        sh, ang, sc = p[3]
        x, y = local_pt(sh, ang, sc, GRIP)
        out[pose] = [round(x), round(y)]
    return out


def write_mochi():
    for pose in POSES:
        d = Doc('m')
        b = mochi(d, pose)
        write(f'characters/mochi_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
    tbl = hand_table()
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        fh.write('{\n "_about": ' + json.dumps(
            'Mochi right (near) paw grip point per frame, [x, y] in the 0 0 300 300 viewBox (feet anchor 150,292): '
            'draw the icing bag gripped there, the nozzle hanging from it. _nozzle = suggested nozzle direction in '
            'degrees, canvas convention (0 = right, 90 = straight down), from the grip towards the nozzle tip. '
            'Paw radius ~18 px at viewBox scale.') + ',\n')
        for k, v in tbl.items():
            fh.write(f' "{k}": [{v[0]}, {v[1]}],\n')
        fh.write(' "_nozzle": ' + json.dumps(NOZZLE_ANG) + '\n}\n')
    return tbl


# ======================================================================= BIRD (sparrow-like, lilac-grey)
BI = {'fill': '#B8AFC9', 'shade': '#9C92B2', 'line': '#5F5674', 'cap': '#8E82A8', 'belly': '#FFF1DC',
      'bellySh': '#EBD5B4', 'beak': '#E8B27A', 'beakLine': '#9A6A3A', 'wing': '#A79DBD'}


def bird(flap=False):
    d = Doc('b')
    o = ''
    # tail (back, left)
    o += d.shaded('<path d="M40,66 C26,60 14,62 8,66 C14,72 18,80 16,86 C26,82 36,78 44,74 Z" {a}/>',
                  BI['wing'], BI['shade'], BI['line'], -3, -3, 3.6)
    if flap:   # far wing up behind the body
        o += d.shaded('<path d="M70,46 C62,26 70,8 86,4 C90,18 90,34 84,48 Z" {a}/>',
                      BI['shade'], BI['line'], BI['line'], -2, -2, 3.4)
    body_t = '<ellipse cx="80" cy="62" rx="40" ry="34" {a}/>'
    hi = ell(66, 42, 13, 6, 'fill="#FFFFFF" opacity=".5" transform="rotate(-25 66 42)"')
    cid = d.clip(body_t.format(a=''))
    o += body_t.format(a=f'fill="{BI["shade"]}"')
    o += (f'<g clip-path="url(#{cid})"><g transform="translate(-6,-6)">{body_t.format(a=chr(102) + "ill=" + chr(34) + BI["fill"] + chr(34))}</g>'
          f'<path d="M72,30 C90,20 116,30 122,52 C108,46 88,40 72,30 Z" fill="{BI["cap"]}"/>'
          f'<ellipse cx="94" cy="78" rx="28" ry="22" fill="{BI["belly"]}"/>'
          f'<path d="M80,90 Q94,98 110,88" fill="none" stroke="{BI["bellySh"]}" stroke-width="3"/>{hi}</g>')
    o += body_t.format(a=f'fill="none" stroke="{BI["line"]}" stroke-width="3.8"')
    # feet tucked
    o += path('M78,96 L76,104 M90,96 L92,104', st(BI['beakLine'], 3.2))
    # near wing
    if flap:
        o += d.shaded('<path d="M58,52 C50,30 58,10 76,4 C84,20 84,40 76,56 C70,60 62,58 58,52 Z" {a}/>',
                      BI['wing'], BI['shade'], BI['line'], -3, -3, 3.6)
        o += path('M66,40 C66,30 70,22 74,16', st(BI['shade'], 2.6))
    else:
        o += d.shaded('<path d="M86,56 C78,46 60,46 50,54 C42,62 38,72 34,80 C48,80 64,76 76,70 C86,66 90,60 86,56 Z" {a}/>',
                      BI['wing'], BI['shade'], BI['line'], -3, -3, 3.6)
        o += path('M50,66 C58,64 68,62 78,60 M46,73 C54,72 62,70 70,68', st(BI['shade'], 2.6))
    # beak
    o += path('M116,52 L134,58 L116,64 Z', fl(BI['beak'], BI['beakLine'], 3))
    o += path('M117,58 L130,58', st(BI['beakLine'], 1.8))
    # cheek + eye
    o += ell(106, 68, 6, 4, 'fill="#F6B1A0" opacity=".9"')
    o += circ(104, 50, 8.5, fl('#FFFFFF', BI['line'], 2.6))
    o += circ(106, 51, 5.4, 'fill="#2B2A33"') + circ(104.3, 48.6, 2.1, 'fill="#FFFFFF"')
    return svg(160, 120, o, ''.join(d.defs))


# ======================================================================= SACK / MOUSE
SA = {'fill': '#D9C7A3', 'shade': '#C2AD85', 'line': '#86704C', 'light': '#EADDBF', 'in': '#8E7856',
      'flour': '#FFFDF8', 'flourSh': '#EDE6DA'}


def sack():
    d = Doc('s')
    o = ell(80, 134, 62, 5, 'fill="#5A4636" opacity=".16"')
    bag = ('M30,46 C20,70 14,100 18,122 C20,134 40,136 80,136 C120,136 140,134 142,122 C146,100 140,70 130,46 Z')
    hi = ell(40, 74, 8, 22, 'fill="#FFFFFF" opacity=".3" transform="rotate(10 40 74)"')
    o += d.shaded(f'<path d="{bag}" {{a}}/>', SA['fill'], SA['shade'], SA['line'], -8, -6, 4, hi)
    # burlap weave hints
    for (x, y) in ((50, 90), (64, 108), (96, 96), (112, 116), (120, 80), (40, 114)):
        o += path(f'M{x - 4},{y} L{x + 4},{y} M{x},{y - 4} L{x},{y + 4}', st(SA['shade'], 2) + ' opacity=".8"')
    # a little patch, stitched
    o += rect(92, 104, 24, 20, 4, fl(SA['light'], SA['line'], 2.6) + ' transform="rotate(-6 104 114)"')
    o += rect(95.5, 107.5, 17, 13, 2, 'fill="none" stroke="#86704C" stroke-width="1.6" stroke-dasharray="2.5 3" '
              'transform="rotate(-6 104 114)"')
    # opening: dark inside, rolled rim
    o += ell(80, 44, 54, 13, fl(SA['in'], SA['line'], 3.6))
    # flour heap in the mouth of the sack
    o += path('M34,46 C40,30 58,24 72,26 C80,16 98,18 104,28 C118,26 128,36 126,46 C110,52 52,52 34,46 Z',
              fl(SA['flour'], SA['flourSh'], 3))
    o += ell(70, 32, 8, 3.5, 'fill="#FFFFFF"')
    o += path('M28,46 C40,58 120,58 132,46', st(SA['line'], 9))
    o += path('M28,46 C40,58 120,58 132,46', st(SA['light'], 4.4))
    # flour dust on the side
    o += circ(126, 64, 3, f'fill="{SA["flour"]}"') + circ(132, 74, 2, f'fill="{SA["flour"]}"') + circ(30, 66, 2.4, f'fill="{SA["flour"]}"')
    return svg(160, 140, o, ''.join(d.defs))


MO = {'fill': '#BDB7B3', 'shade': '#A29B97', 'line': '#655E5B', 'ear': '#F2B8B0', 'nose': '#E98C8C'}


def mouse(happy=False):
    d = Doc('u')
    o = ''
    # ears
    for cx, cy, r in ((30, 30, 20), (90, 30, 20)):
        o += circ(cx, cy, r, fl(MO['fill'], MO['line'], 3.6))
        o += circ(cx + (2 if cx < 60 else -2), cy + 2, r * 0.62, f'fill="{MO["ear"]}"')
    head_t = '<path d="M20,98 C14,76 20,46 60,40 C100,46 106,76 100,98 Z" {a}/>'
    hi = ell(42, 54, 10, 5, 'fill="#FFFFFF" opacity=".45" transform="rotate(-25 42 54)"')
    o += d.shaded(head_t, MO['fill'], MO['shade'], MO['line'], -5, -5, 3.6, hi)
    # cheeks
    o += ell(34, 78, 7, 4.4, 'fill="#F6B1A0"') + ell(86, 78, 7, 4.4, 'fill="#F6B1A0"')
    # eyes
    if happy:
        for cx in (44, 76):
            o += path(f'M{cx - 7},{68} Q{cx},{58} {cx + 7},{68}', st('#2B2A33', 4))
    else:
        for cx in (44, 76):
            o += circ(cx, 64, 7.5, 'fill="#2B2A33"') + circ(cx - 2.4, 61.4, 2.8, 'fill="#FFFFFF"') + \
                 circ(cx + 2.4, 66.6, 1.1, 'fill="#FFFFFF"')
    # nose + whiskers + mouth
    o += ell(60, 76, 6, 4.6, fl(MO['nose'], '#B4625F', 2))
    if happy:   # floury nose
        o += ell(58, 73, 8, 5, 'fill="#FFFFFF" opacity=".95"') + circ(66, 70, 2.2, 'fill="#FFFFFF"') + \
             circ(52, 68, 1.6, 'fill="#FFFFFF"')
    for s in (-1, 1):
        o += path(f'M{60 + s * 12},{78} L{60 + s * 30},{74} M{60 + s * 12},{82} L{60 + s * 30},{84}',
                  st(MO['line'], 1.8) + ' opacity=".8"')
    if happy:
        o += path('M52,84 Q60,94 68,84 Q60,90 52,84 Z', fl('#7A3A3F', MO['line'], 2))
    else:
        o += path('M54,84 Q57,88 60,84 Q63,88 66,84', st(MO['line'], 2.4))
    # paws on the rim
    for cx in (34, 86):
        o += ell(cx, 94, 11, 7, fl('#E9E4E0', MO['line'], 3))
        o += path(f'M{cx - 3},{90} L{cx - 3},{95} M{cx + 3},{90} L{cx + 3},{95}', st(MO['shade'], 1.8))
    return svg(120, 100, o, ''.join(d.defs))


# ======================================================================= ICON
def icing_bag(x, y, ang, length=70, color='#E84A4A', dark='#A8282E', half=26):
    """Piping bag: nozzle tip at (x,y), pointing along ang (canvas deg, 0 = right). Bag extends back from the tip."""
    o = f'<g transform="translate({f(x)},{f(y)}) rotate({f(ang + 180)})">'
    # local: tip at origin, bag along +x
    h, h2 = half, half - 6
    o += path(f'M14,-6 L{length},-{h} C{length + 14},-{h - 2} {length + 14},{h - 2} {length},{h} L14,6 Z',
              fl('#FFFFFF', '#9E968C', 3.4))
    o += path(f'M18,-4 L{length - 4},-{h2} C{length + 4},-{h2 - 6} {length + 4},{h2 - 6} {length - 4},{h2} L18,4 Z',
              f'fill="{color}" opacity=".9"')
    o += path(f'M24,-2 L{length - 10},-{h2 - 6}', st('#FFFFFF', 3.4) + ' opacity=".75"')
    o += path(f'M{length + 8},-6 L{length + 22},-12 M{length + 8},6 L{length + 22},12', st('#9E968C', 4))
    o += path('M0,0 L16,-8 L16,8 Z', fl('#C9C2B8', '#7E766C', 2.6))
    return o + '</g>'


def icon():
    d = Doc('i')
    g = d.uid('w')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F9EEDB"/>'
                  f'<stop offset="1" stop-color="#F0DDBF"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # tiles
    for y in range(20, 380, 56):
        o += path(f'M0,{y} L512,{y}', st('#E8D3B2', 3))
    # window with spring sky
    o += rect(318, 36, 160, 150, 18, fl('#BFE2F2', '#A87A4E', 10))
    o += path('M398,40 L398,182 M322,112 L474,112', st('#A87A4E', 8))
    o += path('M326,70 C360,62 380,84 396,70', st('#8A6A50', 5))
    for (x, y) in ((342, 66), (362, 74), (382, 70)):
        o += circ(x, y, 7, 'fill="#FFCCE2"') + circ(x, y, 2.4, 'fill="#F7A0A0"')
    # counter
    o += rect(0, 400, 512, 112, 0, fl('#C99A6B', '#A87A4E', 0))
    o += rect(0, 392, 512, 18, 0, 'fill="#D8AE80"')
    o += path('M0,410 L512,410', st('#A87A4E', 4))
    o += path('M60,450 C120,446 160,456 220,452 M300,470 C360,466 420,474 480,468', st('#B88A5C', 3))
    # Mochi (pipe pose), scaled, on the left; the bag points down-right from her paw onto the cookie
    sc = 1.5
    tx, ty = -66, 508 - 292 * sc
    gx, gy = hand_table()['pipe']
    px, py = tx + gx * sc, ty + gy * sc
    bang = 44
    tipx, tipy = px + 84 * math.cos(math.radians(bang)), py + 84 * math.sin(math.radians(bang))
    # big cookie on the counter (right)
    ccx, ccy, crx, cry = 396, 418, 110, 74
    o += ell(ccx, ccy + cry + 2, crx, 14, 'fill="#5A3A28" opacity=".22"')
    o += ell(ccx, ccy + 9, crx, cry, fl('#D79B55', '#9A6330', 6))
    o += ell(ccx, ccy, crx, cry, fl('#E9B872', '#9A6330', 6))
    o += ell(ccx - 40, ccy - 44, 30, 11, f'fill="#F6D59D" transform="rotate(-12 {ccx - 40} {ccy - 44})"')
    for (dx, dy) in ((84, 6), (66, 44), (-62, 50), (40, -52)):
        o += ell(ccx + dx, ccy + dy, 7.5, 5.5, 'fill="#5A3A28"')
    # heart of icing; the nozzle tip touches its lower-left curve
    k = 2.9
    hx, hy = tipx + 46, tipy - 12
    hp = (f'M{f(hx)},{f(hy + 20 * k * 0.72)} C{f(hx - 30 * k)},{f(hy)} {f(hx - 22 * k)},{f(hy - 22 * k * 0.72)} '
          f'{f(hx - 9 * k)},{f(hy - 20 * k * 0.72)} C{f(hx - 3 * k)},{f(hy - 19 * k * 0.72)} {f(hx)},{f(hy - 13 * k * 0.72)} '
          f'{f(hx)},{f(hy - 10 * k * 0.72)} C{f(hx)},{f(hy - 13 * k * 0.72)} {f(hx + 3 * k)},{f(hy - 19 * k * 0.72)} '
          f'{f(hx + 9 * k)},{f(hy - 20 * k * 0.72)} C{f(hx + 22 * k)},{f(hy - 22 * k * 0.72)} {f(hx + 30 * k)},{f(hy)} '
          f'{f(hx)},{f(hy + 20 * k * 0.72)}')
    o += f'<path d="{hp}" transform="translate(0,4)" {st("#A8282E", 22)}/>'
    o += path(hp, st('#E84A4A', 20))
    o += f'<path d="{hp}" transform="translate(-3,-4)" {st("#F7A0A0", 5)} opacity=".9"/>'
    o += circ(hx - 48, hy - 36, 3.6, 'fill="#FFFFFF"') + circ(hx + 36, hy - 40, 3, 'fill="#FFFFFF"')
    # sparkles
    o += sparkle(476, 300, 18) + sparkle(300, 290, 10) + sparkle(470, 220, 9)
    nd = Doc('im')
    nb = mochi(nd, 'pipe')
    d.defs.extend(nd.defs)
    # the bag goes first: Mochi's arm and paw cover its back end, so the cone comes out of her paw
    o += icing_bag(tipx, tipy, bang, length=124, half=38)
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{nb}</g>'
    return svg(512, 512, o, ''.join(d.defs))


def main():
    tbl = write_mochi()
    write('characters/bird.svg', bird(False))
    write('characters/bird_flap.svg', bird(True))
    write('characters/sack.svg', sack())
    write('characters/mouse.svg', mouse(False))
    write('characters/mouse_happy.svg', mouse(True))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:8s} grip={v}')


if __name__ == '__main__':
    main()
