#!/usr/bin/env python3
"""Character art generator for Tumi's Flower Farm (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/tumi_{idle,blink,talk,happy,cheer,think,oops,wave,pipe,point}.svg + tumi_title.svg
        0 0 300 300, FEET ANCHOR (150,292). Tumi (a round baby turtle in a floppy straw sun hat with a daisy) stands
        upright in 3/4 view facing RIGHT, eyes on the viewer. Shell / belly / legs / tail are identical in every frame;
        only the eyes, mouth, brows, flippers, a small head tilt (think / oops) and a tiny hat bounce change.
        The watering can is NOT drawn here: docs/art/tumi_hand.json gives, per frame, the point in the near (right)
        flipper where the can's handle is gripped plus the spout direction (from the grip towards the spout tip).
  characters/butterfly.svg, butterfly_flap.svg   0 0 160 120, centre anchor, facing right (soft lilac, cream spots)
  characters/hay.svg                             0 0 160 140, bottom anchor (80,136), rim (chick clip line) y = 52
  characters/chick.svg, chick_happy.svg          0 0 120 100, bottom anchor (60,98), pale-cream chick peeking
  icon.svg                                       0 0 512 512, full bleed, opaque

Usage: python3 tools/art_tumi.py [outDir]
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
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'tumi_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

T = {  # Tumi palette (DESIGN.md section 3)
    'skin': '#B9CC93', 'skinSh': '#97AE72', 'skinLine': '#5E7446', 'skinHi': '#D6E4B8',
    'shell': '#C68B4F', 'shellSh': '#A8723C', 'plate': '#E2B27A', 'plateSh': '#D39B60', 'shellLine': '#7E5228',
    'belly': '#F4E6C4', 'bellySh': '#E4D0A3', 'bellyLine': '#A88A57',
    'cheek': '#F6B1A0', 'white': '#FFFFFF', 'pupil': '#2E3626', 'eyeLine': '#4A5C35',
    'mouth': '#7A3A3F', 'tongue': '#F28F86',
    'hat': '#F2D59A', 'hatSh': '#D6B46E', 'hatLine': '#9E7A3C', 'band': '#FFF6E2', 'bandLine': '#C9AE7A',
    'daisy': '#FFFFFF', 'daisyLine': '#C9B48A', 'daisyMid': '#F4BE4A', 'daisyMidLine': '#C48A2A',
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


def blob(cx, cy, r, n=6, rot0=0.0):
    """Rounded polygon (soft hexagon for shell plates)."""
    pts = [(cx + r * math.cos(math.radians(rot0 + i * 360 / n)), cy + r * math.sin(math.radians(rot0 + i * 360 / n)))
           for i in range(n)]
    d = ''
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        a = (p1[0] + (p0[0] - p1[0]) * 0.28, p1[1] + (p0[1] - p1[1]) * 0.28)
        b = (p1[0] + (p2[0] - p1[0]) * 0.28, p1[1] + (p2[1] - p1[1]) * 0.28)
        d += ('M' if i == 0 else 'L') + f'{f(a[0])},{f(a[1])} Q{f(p1[0])},{f(p1[1])} {f(b[0])},{f(b[1])} '
    return d + 'Z'


def daisy(cx, cy, r, petals=8, line=None):
    line = line or T['daisyLine']
    o = ''
    for i in range(petals):
        a = math.radians(i * 360 / petals - 90)
        px, py = cx + math.cos(a) * r * 0.62, cy + math.sin(a) * r * 0.62
        o += ell(px, py, r * 0.42, r * 0.24, fl(T['daisy'], line, max(1.2, r * 0.12)) +
                 f' transform="rotate({f(math.degrees(a))} {f(px)} {f(py)})"')
    o += circ(cx, cy, r * 0.36, fl(T['daisyMid'], T['daisyMidLine'], max(1.2, r * 0.12)))
    return o


class Doc:
    """Collects <defs> with unique ids (prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='t'):
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


# ======================================================================= TUMI geometry
HEAD = (162, 132, 80, 64)          # x 82-242, y 68-196 (head + hat ~ 58 % of the figure: a baby)
NECK = (158, 200)                  # tilt pivot
SHELL = (114, 232, 62, 56)         # carapace dome on the back (viewer's left): x 52-176, y 176-288
RIM = (164, 240, 50, 50)           # shell rim showing around the belly plate
BELLY = (168, 241, 43, 45)         # cream plastron: x 125-211, y 196-286
EYE_N = (134, 134, 19)
EYE_F = (198, 129, 15.5)
MOUTH = (174, 166)
SH_F = (126, 212)                  # far flipper shoulder (emerges at the shell rim, behind the belly)
SH_N = (204, 214)                  # near (right) flipper shoulder (in front of the belly)
# flipper hanging straight down from the shoulder (0,0); length ~60, rounded paddle tip
ARM = ('M-15,-7 C-20,8 -23,26 -21,40 C-19,54 -9,62 3,61 C14,60 21,51 20,38 C19,24 17,8 14,-7 '
       'C8,-17 -9,-17 -15,-7 Z')
GRIP = (1, 43)                     # where the watering-can handle is gripped (local)


def arm(doc, sh, ang, scale=1.0):
    """Sage flipper; ang 0 = hanging down, > 0 swings the tip to the viewer's LEFT, < 0 to the RIGHT."""
    tf = f'translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)}) scale({f(scale)})'
    tpl = f'<path d="{ARM}" transform="{tf}" {{a}}/>'
    hi = f'<path d="M-11,2 C-14,14 -15,26 -13,36" transform="{tf}" {st(T["skinHi"], 4.6)} opacity=".9"/>'
    o = doc.shaded(tpl, T['skin'], T['skinSh'], T['skinLine'], dx=-4, dy=-3, hi=hi)
    # two soft freckle-spots on the flipper (turtle skin pattern)
    o += f'<g transform="{tf}">' + ell(7, 22, 4.2, 3.2, f'fill="{T["skinSh"]}"') + \
        ell(10, 34, 3, 2.4, f'fill="{T["skinSh"]}"') + '</g>'
    return o


def local_pt(sh, ang, scale, p):
    x, y = rot(p[0] * scale, p[1] * scale, ang)
    return sh[0] + x, sh[1] + y


def eye(cx, cy, r, mode='open', look=(1, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.08 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.92, rr, fl(T['white'], T['eyeLine'], 3.2))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.66 if mode == 'wide' else 0.62)
        o += ell(px, py, pr * 0.92, pr, f'fill="{T["pupil"]}"')
        o += circ(px - pr * 0.3, py - pr * 0.4, pr * 0.42, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.4, py + pr * 0.4, pr * 0.18, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.85)},{f(cy - 1)} Q{f(cx)},{f(cy + r * 0.75)} {f(cx + r * 0.85)},{f(cy - 1)}',
                  st(T['eyeLine'], 4.4))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.85)},{f(cy + r * 0.35)} Q{f(cx)},{f(cy - r * 0.9)} {f(cx + r * 0.85)},'
                  f'{f(cy + r * 0.35)}', st(T['eyeLine'], 5))
    return o


def mouth(mode):
    mx, my = MOUTH
    if mode == 'closed':            # soft turtle smile
        return path(f'M{mx - 15},{my - 3} Q{mx - 1},{my + 9} {mx + 14},{my - 6}', st(T['skinLine'], 3.8))
    if mode == 'talk':
        o = path(f'M{mx - 12},{my - 3} Q{mx},{my} {mx + 12},{my - 5} Q{mx + 11},{my + 14} {mx},{my + 15} '
                 f'Q{mx - 12},{my + 13} {mx - 12},{my - 3} Z', fl(T['mouth'], T['skinLine'], 3.2))
        o += ell(mx, my + 9.5, 6.5, 3.8, f'fill="{T["tongue"]}"')
        return o
    if mode in ('smile', 'big'):
        k = 1.3 if mode == 'big' else 1.0
        w, h = 15 * k, 14 * k
        o = path(f'M{f(mx - w)},{f(my - 4)} Q{mx},{f(my + 1)} {f(mx + w)},{f(my - 7)} '
                 f'Q{f(mx + w * 0.85)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.85)},{f(my + h)} '
                 f'{f(mx - w)},{f(my - 4)} Z', fl(T['mouth'], T['skinLine'], 3.2))
        o += ell(mx, my + h - 4.5 * k, 8 * k, 4.2 * k, f'fill="{T["tongue"]}"')
        return o
    if mode == 'o':                 # curious "hmm?"
        return ell(mx + 1, my + 3, 5.5, 6.5, fl(T['mouth'], T['skinLine'], 3))
    if mode == 'hmm':               # little wavy curious mouth
        return path(f'M{mx - 11},{my + 2} Q{mx - 5},{my - 3} {mx},{my + 2} Q{mx + 5},{my + 6} {mx + 11},{my}',
                    st(T['skinLine'], 3.8))
    return ''


def hat(doc, dy=0):
    """Floppy straw sun hat sitting on the head top, tipped back a little; cream band + one tiny daisy."""
    o = f'<g transform="translate(0,{f(dy)}) rotate(-5 160 84)">'
    # floppy brim: wide, gently wavy, the sides drooping
    brim = ('M48,96 C42,88 50,78 66,72 C92,62 128,58 160,58 C194,58 230,62 254,72 C270,79 276,90 268,98 '
            'C262,104 250,102 240,104 C220,110 196,112 160,112 C126,112 100,110 80,104 C68,102 54,104 48,96 Z')
    hi = ell(92, 76, 22, 6, 'fill="#FFF3D2" opacity=".9" transform="rotate(-10 92 76)"')
    o += doc.shaded(f'<path d="{brim}" {{a}}/>', T['hat'], T['hatSh'], T['hatLine'], dx=-4, dy=-6, hi=hi)
    # straw weave on the brim (short radial dashes)
    for i in range(13):
        a = math.radians(200 + i * 11.5)
        x0, y0 = 160 + math.cos(a) * 64, 86 + math.sin(a) * -15 + 10
        x1, y1 = 160 + math.cos(a) * 92, 86 + math.sin(a) * -21 + 13
        o += path(f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)}', st(T['hatSh'], 2.4) + ' opacity=".9"')
    # crown (dome) sitting on the brim
    crown = 'M114,86 C112,56 128,30 160,30 C192,30 208,56 206,86 C190,94 130,94 114,86 Z'
    chi = ell(134, 46, 10, 7, 'fill="#FFF3D2" opacity=".95" transform="rotate(-30 134 46)"')
    o += doc.shaded(f'<path d="{crown}" {{a}}/>', T['hat'], T['hatSh'], T['hatLine'], dx=-6, dy=-5, hi=chi)
    o += path('M126,52 C146,46 176,46 196,54', st(T['hatSh'], 2.4))
    # cream band hugging the crown base
    band = 'M114,72 C134,78 186,78 206,72 L207,86 C190,94 130,94 113,86 Z'
    o += path(band, fl(T['band'], T['bandLine'], 3))
    # tiny daisy on the band (front-right, towards the bed)
    o += daisy(194, 80, 11)
    o += '</g>'
    return o


def head(doc, eyes='open', mo='closed', brows=None, look=(1, 2), hat_dy=0):
    hx, hy, hrx, hry = HEAD
    o = ''
    hi = ell(108, 126, 14, 9, f'fill="{T["skinHi"]}" opacity=".95" transform="rotate(-40 108 126)"')
    # head: round, a touch wider at the snout side (towards the bed)
    hp = (f'M{hx - hrx},{hy} C{hx - hrx},{hy - hry * 0.95} {hx - hrx * 0.45},{hy - hry} {hx + 6},{hy - hry} '
          f'C{hx + hrx * 0.62},{hy - hry} {hx + hrx + 2},{hy - hry * 0.55} {hx + hrx},{hy + 4} '
          f'C{hx + hrx - 2},{hy + hry * 0.82} {hx + hrx * 0.4},{hy + hry} {hx - 2},{hy + hry} '
          f'C{hx - hrx * 0.6},{hy + hry} {hx - hrx},{hy + hry * 0.7} {hx - hrx},{hy} Z')
    o += doc.shaded(f'<path d="{hp}" {{a}}/>', T['skin'], T['skinSh'], T['skinLine'], dx=-11, dy=-10, hi=hi)
    # soft skin spots on the back of the head
    o += ell(96, 160, 6, 4.5, f'fill="{T["skinSh"]}" opacity=".8"') + ell(106, 176, 4, 3, f'fill="{T["skinSh"]}" opacity=".8"')
    # cheeks
    o += ell(108, 160, 15, 9, f'fill="{T["cheek"]}" opacity=".95"')
    o += ell(226, 154, 10, 8, f'fill="{T["cheek"]}" opacity=".95"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 9 - lift
            o += path(f'M{f(cx - 9)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 9)},{f(y + 3)}', st(T['skinLine'], 4))
    # two tiny nostrils on the snout
    o += ell(222, 140, 2.2, 1.6, f'fill="{T["skinLine"]}"') + ell(231, 138, 2, 1.5, f'fill="{T["skinLine"]}"')
    o += mouth(mo)
    o += hat(doc, hat_dy)
    return o


def body(doc, far=''):
    o = ''
    # tiny pointed tail (back, viewer's left)
    o += path('M62,262 C48,262 38,268 32,278 C44,280 58,278 70,272 Z', fl(T['skin'], T['skinLine'], 4))
    # far foot (behind)
    o += doc.shaded('<ellipse cx="120" cy="279" rx="25" ry="13" {a}/>', T['skin'], T['skinSh'], T['skinLine'], -3, -3)
    # carapace dome with plates
    sx, sy, srx, sry = SHELL
    stpl = f'<ellipse cx="{sx}" cy="{sy}" rx="{srx}" ry="{sry}" {{a}}/>'
    plates = ''
    for (cx, cy, r, a) in ((96, 220, 22, 0), (80, 260, 18, 10), (122, 190, 17, 30), (126, 256, 18, 0),
                           (62, 226, 13, 20), (106, 288, 14, 0), (84, 186, 12, 15)):
        plates += path(blob(cx, cy, r, 6, a), fl(T['plate'], T['shellLine'], 2.8))
    plates += ell(78, 204, 13, 6, 'fill="#FFFFFF" opacity=".4" transform="rotate(-40 78 204)"')
    o += doc.shaded(stpl, T['shell'], T['shellSh'], T['shellLine'], dx=-8, dy=-8, hi=plates)
    o += far   # far flipper: in front of the carapace, behind the belly (it comes out of the shell opening)
    # rim band around the plastron
    rx_, ry_, rrx, rry = RIM
    o += doc.shaded(f'<ellipse cx="{rx_}" cy="{ry_}" rx="{rrx}" ry="{rry}" {{a}}/>', T['plate'], T['plateSh'],
                    T['shellLine'], -5, -5)
    # cream belly plate with soft scute lines
    bx, by, brx, bry = BELLY
    btpl = f'<ellipse cx="{bx}" cy="{by}" rx="{brx}" ry="{bry}" {{a}}/>'
    bhi = ell(150, 216, 12, 7, 'fill="#FFFFFF" opacity=".7" transform="rotate(-30 150 216)"')
    o += doc.shaded(btpl, T['belly'], T['bellySh'], T['bellyLine'], dx=-6, dy=-6, w=3.8, hi=bhi)
    o += path('M130,226 C150,232 188,232 208,224 M127,256 C150,262 188,262 209,254 M170,198 L170,284',
              st(T['bellySh'], 3))
    # near foot (in front), with toe nubs
    o += doc.shaded('<ellipse cx="190" cy="279" rx="28" ry="13" {a}/>', T['skin'], T['skinSh'], T['skinLine'], -3, -3)
    for x in (204, 213):
        o += ell(x, 284, 3.2, 2.4, f'fill="{T["belly"]}"')
    return o


F_REST, N_REST = (SH_F, 30, 1), (SH_N, -22, 1)
POSES = {
    #          eyes      mouth     far arm                 near (right) arm          tilt brows    look   hat dy
    'idle':    ('open',  'closed', F_REST,                 N_REST,                    0, None,     (1, 2),  0),
    'blink':   ('closed', 'closed', F_REST,                N_REST,                    0, None,     (1, 2),  0),
    'talk':    ('open',  'talk',   (SH_F, 38, 1),          (SH_N, -38, 1),            0, None,     (1, 2), -1),
    'happy':   ('wide',  'smile',  (SH_F, 62, 1),          (SH_N, -64, 1),            0, None,     (1, 1), -2),
    'cheer':   ('happy', 'big',    ((112, 208), 140, 1.06), ((206, 208), -138, 1.06),  0, None,     (0, 0), -4),
    'think':   ('look',  'hmm',    F_REST,                 ((206, 214), 128, 0.92),   7, (0, 6),   (4, -5), 0),
    'oops':    ('wide',  'o',      (SH_F, 44, 0.95),       ((204, 210), -72, 1),     -7, (8, 0),   (-1, 1), -2),
    'wave':    ('open',  'smile',  F_REST,                 ((204, 210), -146, 1),     0, None,     (1, 2), -2),
    'pipe':    ('look',  'smile',  F_REST,                 ((204, 212), -86, 1),      0, None,     (5, 4),  0),
    'point':   ('look',  'talk',   F_REST,                 ((204, 211), -122, 1),     0, (4, 4),   (5, -4), -1),
    'title':   ('wide',  'smile',  ((126, 214), -50, 1),   ((204, 210), -146, 1),     0, None,     (1, 2), -2),
}
# spout direction per frame: degrees, canvas convention (0 = right, 90 = straight down), from the grip point (the
# can's handle) towards the spout tip. Held by the handle, the spout tip hangs down / forward.
SPOUT_ANG = {'idle': 55, 'blink': 55, 'talk': 52, 'happy': 60, 'cheer': 45, 'think': 100, 'oops': 65,
             'wave': 40, 'pipe': 55, 'point': 30, 'title': 40}


def red_flower(cx, cy, r=24):
    """A single big flower with red petals (title pose): answer red petals, brown centre (DESIGN section 3)."""
    o = path(f'M{f(cx - 2)},{f(cy + r * 0.6)} C{f(cx - 6)},{f(cy + r * 1.6)} {f(cx - 2)},{f(cy + r * 2.3)} '
             f'{f(cx - 8)},{f(cy + r * 3)}', st('#3E7A2E', 8) )
    o += path(f'M{f(cx - 2)},{f(cy + r * 0.6)} C{f(cx - 6)},{f(cy + r * 1.6)} {f(cx - 2)},{f(cy + r * 2.3)} '
              f'{f(cx - 8)},{f(cy + r * 3)}', st('#5FA046', 4.4))
    lx, ly = cx - 4, cy + r * 1.7
    o += path(f'M{f(lx)},{f(ly)} C{f(lx + 10)},{f(ly - 16)} {f(lx + 26)},{f(ly - 14)} {f(lx + 30)},{f(ly - 8)} '
              f'C{f(lx + 22)},{f(ly + 2)} {f(lx + 10)},{f(ly + 4)} {f(lx)},{f(ly)} Z', fl('#5FA046', '#3E7A2E', 2.6))
    for i in range(5):
        a = math.radians(i * 72 - 90)
        px, py = cx + math.cos(a) * r * 0.55, cy + math.sin(a) * r * 0.55
        o += ell(px, py, r * 0.5, r * 0.38, fl('#E84A4A', '#A8282E', 3) +
                 f' transform="rotate({f(math.degrees(a))} {f(px)} {f(py)})"')
        hx, hy = cx + math.cos(a) * r * 0.62, cy + math.sin(a) * r * 0.62
        o += ell(hx, hy, r * 0.22, r * 0.12, 'fill="#F7A0A0"' +
                 f' transform="rotate({f(math.degrees(a))} {f(hx)} {f(hy)})"')
    o += circ(cx, cy, r * 0.3, fl('#8A5A2E', '#5A3A28', 2.6))
    o += circ(cx - r * 0.1, cy - r * 0.1, r * 0.09, 'fill="#C69060"')
    return o


def tumi(doc, pose):
    eyes, mo, aF, aN, tilt, brows, look, hat_dy = POSES[pose]
    o = ''
    if pose == 'title':
        o += body(doc)
    elif pose == 'cheer':     # raised far flipper: over the body, behind the head
        o += body(doc) + arm(doc, *aF)
    else:
        o += body(doc, arm(doc, *aF))
    hd = head(doc, eyes, mo, brows, look, hat_dy)
    if tilt:
        hd = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{hd}</g>'
    o += hd
    if pose == 'title':
        o += arm(doc, *aF)
        tx, ty = local_pt(*aF, GRIP)
        o += red_flower(tx + 8, ty - 38, 22)
        o += ell(tx + 2, ty - 6, 9, 11, fl(T['skin'], T['skinLine'], 3.6) + f' transform="rotate(-40 {f(tx + 2)} {f(ty - 6)})"')
    if pose in ('wave', 'title'):
        o += path('M262,128 Q276,140 276,158 M276,112 Q294,132 290,162', st('#FFFFFF', 4.4) + ' opacity=".95"')
        o += path('M262,128 Q276,140 276,158 M276,112 Q294,132 290,162', st(T['skinLine'], 1.6) + ' opacity=".4"')
    if pose == 'cheer':
        o += sparkle(30, 120, 10) + sparkle(274, 104, 9) + sparkle(24, 82, 6) + sparkle(284, 70, 6)
    if pose == 'think':
        for (x, y, r) in ((252, 58, 4), (264, 40, 6), (278, 18, 8)):
            o += circ(x, y, r, fl('#FFFFFF', T['skinLine'], 2.4))
    if pose == 'oops':   # a small friendly "?" drawn as a path
        o += path('M250,40 C250,26 274,24 274,38 C274,48 262,48 262,60', st(T['skinLine'], 7))
        o += path('M250,40 C250,26 274,24 274,38 C274,48 262,48 262,60', st('#FFE3A8', 3.6))
        o += circ(262, 73, 4.6, fl('#FFE3A8', T['skinLine'], 2.4))
    o += arm(doc, *aN)
    return o


def hand_table():
    out = {}
    for pose, p in POSES.items():
        sh, ang, sc = p[3]
        x, y = local_pt(sh, ang, sc, GRIP)
        out[pose] = [round(x), round(y)]
    return out


def write_tumi():
    for pose in POSES:
        d = Doc('t')
        b = tumi(d, pose)
        write(f'characters/tumi_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
    tbl = hand_table()
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        fh.write('{\n "_about": ' + json.dumps(
            'Tumi right (near) flipper grip point per frame, [x, y] in the 0 0 300 300 viewBox (feet anchor 150,292): '
            'the watering can is held there by its handle. _nozzle = spout direction in degrees, canvas convention '
            '(0 = right, 90 = straight down), from the grip towards the spout tip. Flipper tip radius ~19 px at '
            'viewBox scale.') + ',\n')
        for k, v in tbl.items():
            fh.write(f' "{k}": [{v[0]}, {v[1]}],\n')
        fh.write(' "_nozzle": ' + json.dumps(SPOUT_ANG) + '\n}\n')
    return tbl


# ======================================================================= BUTTERFLY (soft lilac, cream spots)
BF = {'wing': '#C9B6E4', 'wingSh': '#AE97D0', 'line': '#6E5A92', 'spot': '#FFF6E2', 'body': '#8C74A8',
      'bodySh': '#735C8E', 'face': '#F3E6D6', 'cheek': '#F6B1A0'}


def butterfly(flap=False):
    d = Doc('b')
    o = ''
    if flap:
        # wings folded up above the body (seen edge-on-ish): tall narrow pair
        o += d.shaded('<path d="M76,58 C60,40 56,14 70,6 C84,0 94,18 90,58 Z" {a}/>',
                      BF['wingSh'], BF['line'], BF['line'], -2, -2, 3.4)
        o += d.shaded('<path d="M80,60 C70,38 76,10 94,6 C110,4 112,28 98,50 C94,56 88,60 80,60 Z" {a}/>',
                      BF['wing'], BF['wingSh'], BF['line'], -3, -3, 3.6,
                      ell(92, 24, 6, 8, f'fill="{BF["spot"]}"') + ell(86, 44, 4, 5, f'fill="{BF["spot"]}"'))
        o += d.shaded('<path d="M80,62 C72,66 64,80 70,90 C78,94 88,84 88,66 Z" {a}/>',
                      BF['wing'], BF['wingSh'], BF['line'], -2, -2, 3.2, circ(76, 80, 3.6, f'fill="{BF["spot"]}"'))
    else:
        # far wings (behind, a touch darker)
        o += path('M84,56 C96,30 118,14 136,20 C146,26 140,46 122,58 Z', fl(BF['wingSh'], BF['line'], 3.4))
        o += path('M84,64 C100,70 118,84 112,98 C104,104 92,94 86,72 Z', fl(BF['wingSh'], BF['line'], 3.2))
        # near upper wing (big, towards the viewer's left / back)
        up = 'M82,58 C70,30 46,10 24,14 C8,18 8,40 22,54 C36,64 60,64 82,62 Z'
        o += d.shaded(f'<path d="{up}" {{a}}/>', BF['wing'], BF['wingSh'], BF['line'], -4, -4, 3.8,
                      ell(34, 32, 9, 7, f'fill="{BF["spot"]}"') + ell(54, 46, 6, 5, f'fill="{BF["spot"]}"') +
                      circ(22, 46, 3.6, f'fill="{BF["spot"]}"') +
                      ell(36, 24, 9, 4, 'fill="#FFFFFF" opacity=".55" transform="rotate(-20 36 24)"'))
        lo = 'M82,64 C64,66 42,78 40,94 C40,106 56,108 68,98 C78,90 84,78 84,66 Z'
        o += d.shaded(f'<path d="{lo}" {{a}}/>', BF['wing'], BF['wingSh'], BF['line'], -3, -3, 3.6,
                      ell(56, 90, 6, 5, f'fill="{BF["spot"]}"') + circ(70, 80, 3.4, f'fill="{BF["spot"]}"'))
    # body: soft rounded segments
    o += d.shaded('<ellipse cx="86" cy="66" rx="20" ry="8" transform="rotate(-8 86 66)" {a}/>',
                  BF['body'], BF['bodySh'], BF['line'], -2, -2, 3.4)
    o += path('M78,60 L76,72 M88,58 L87,72', st(BF['bodySh'], 2.4))
    # head + face (right)
    o += circ(110, 58, 13, fl(BF['face'], BF['line'], 3.4))
    o += path('M112,46 C114,32 122,24 132,24', st(BF['line'], 3)) + circ(133, 24, 3.6, f'fill="{BF["body"]}"')
    o += path('M106,46 C104,32 110,20 120,16', st(BF['line'], 3)) + circ(121, 16, 3.2, f'fill="{BF["body"]}"')
    o += circ(114, 56, 3.6, 'fill="#3A3148"') + circ(113, 54.6, 1.4, 'fill="#FFFFFF"')
    o += ell(116, 63, 3.6, 2.4, f'fill="{BF["cheek"]}"')
    o += path('M106,63 Q110,67 114,64', st(BF['line'], 2.2))
    return svg(160, 120, o, ''.join(d.defs))


# ======================================================================= HAY / CHICK
HY = {'fill': '#E6C77E', 'shade': '#C9A45A', 'line': '#8E6A2E', 'light': '#F4DFA4', 'twine': '#A87E44',
      'in': '#B98F45'}


def hay():
    d = Doc('h')
    o = ell(80, 134, 66, 5, 'fill="#5A4636" opacity=".18"')
    bale = ('M14,56 C14,40 24,34 38,34 C56,34 62,52 80,52 C98,52 104,34 122,34 C136,34 146,40 146,56 '
            'L147,122 C147,132 138,136 126,136 L34,136 C22,136 13,132 13,122 Z')
    hi = ell(32, 66, 9, 5, 'fill="#FFF6D6" opacity=".8" transform="rotate(-20 32 66)"')
    strands = ''
    for (x, y, l, a) in ((26, 82, 18, 8), (44, 104, 16, -6), (30, 120, 14, 4), (64, 74, 15, -4), (60, 114, 18, 6),
                         (96, 84, 16, 5), (92, 120, 14, -8), (120, 72, 15, -5), (126, 104, 18, 7), (110, 96, 12, 2),
                         (78, 96, 12, -3), (136, 124, 10, 4)):
        x2, y2 = x + l * math.cos(math.radians(a)), y + l * math.sin(math.radians(a))
        strands += path(f'M{x},{y} L{f(x2)},{f(y2)}', st(HY['shade'], 2.4))
        strands += path(f'M{x + 2},{y - 3} L{f(x2 - 3)},{f(y2 - 3)}', st(HY['light'], 1.8))
    o += d.shaded(f'<path d="{bale}" {{a}}/>', HY['fill'], HY['shade'], HY['line'], -8, -7, 4, hi + strands)
    # two twine bands
    for x in (50, 110):
        o += path(f'M{x - 2},{44} C{x - 4},{80} {x - 4},{110} {x - 2},{135}', st(HY['line'], 6))
        o += path(f'M{x - 2},{44} C{x - 4},{80} {x - 4},{110} {x - 2},{135}', st(HY['twine'], 3))
    # the dip where the chick peeks: a darker hollow just behind the rim
    o += path('M40,40 C56,32 104,32 120,40 C104,54 56,54 40,40 Z', f'fill="{HY["in"]}"')
    o += path('M48,40 C60,36 100,36 112,40', st(HY['shade'], 2.4))
    # front rim (the chick clip line, y = 52 at the centre) with straw tufts poking up
    o += path('M26,36 C48,36 60,53 80,53 C100,53 112,36 134,36', st(HY['line'], 6))
    o += path('M26,36 C48,36 60,53 80,53 C100,53 112,36 134,36', st(HY['light'], 3))
    for (x, y, dx, dy) in ((20, 38, -6, -10), (28, 35, 2, -12), (38, 36, -2, -10), (124, 36, 4, -11),
                           (134, 37, 8, -9), (144, 44, 8, -6), (16, 46, -8, -5)):
        o += path(f'M{x},{y} L{x + dx},{y + dy}', st(HY['line'], 4)) + path(f'M{x},{y} L{x + dx},{y + dy}', st(HY['light'], 2))
    return svg(160, 140, o, ''.join(d.defs))


CH = {'fill': '#FFF0B8', 'shade': '#EBD488', 'line': '#B4964C', 'beak': '#F2A65A', 'beakLine': '#B4682A'}


def chick(happy=False):
    d = Doc('k')
    o = ''
    # head-and-body blob rising from the rim
    hb = 'M18,100 C14,70 26,34 60,32 C94,34 106,70 102,100 Z'
    hi = ell(42, 46, 10, 6, 'fill="#FFFFFF" opacity=".8" transform="rotate(-30 42 46)"')
    # fluffy tuft on top
    o += path('M54,36 C50,22 56,14 62,14 C60,22 62,28 64,34 M60,34 C64,22 74,20 78,24 C72,26 68,30 66,36',
              fl(CH['fill'], CH['line'], 3.2))
    o += d.shaded(f'<path d="{hb}" {{a}}/>', CH['fill'], CH['shade'], CH['line'], -6, -6, 3.8, hi)
    # fluffy chest scallops
    o += path('M40,92 Q46,86 52,92 Q58,86 64,92 Q70,86 76,92', st(CH['shade'], 2.6))
    # wing tips over the rim
    for (x, s) in ((22, -1), (98, 1)):
        o += path(f'M{x},{98} C{x + s * 10},{80} {x + s * 16},{78} {x + s * 18},{86} C{x + s * 16},{92} {x + s * 10},{96} {x},{98} Z',
                  fl(CH['fill'], CH['line'], 3.2))
    # cheeks
    o += ell(36, 70, 7, 4.4, 'fill="#F6B1A0"') + ell(84, 70, 7, 4.4, 'fill="#F6B1A0"')
    if happy:
        for cx in (46, 74):
            o += path(f'M{cx - 7},{60} Q{cx},{50} {cx + 7},{60}', st('#4A3A2A', 4))
        o += path('M50,66 L60,62 L70,66 L60,70 Z', fl(CH['beak'], CH['beakLine'], 2.4))
        o += path('M52,70 L60,82 L68,70 Q60,74 52,70 Z', fl('#E8865A', CH['beakLine'], 2.4))
        o += path('M56,74 Q60,78 64,74', 'fill="#F28F86"')
    else:
        for cx in (46, 74):
            o += circ(cx, 58, 7, 'fill="#3E3328"') + circ(cx - 2.4, 55.4, 2.8, 'fill="#FFFFFF"') + \
                 circ(cx + 2.4, 60.6, 1.1, 'fill="#FFFFFF"')
        o += path('M51,66 L60,62 L69,66 L60,74 Z', fl(CH['beak'], CH['beakLine'], 2.4))
        o += path('M52,66 L68,66', st(CH['beakLine'], 1.6))
    return svg(120, 100, o, ''.join(d.defs))


# ======================================================================= ICON
CAN = {'fill': '#B8C4CC', 'shade': '#8B98A2', 'light': '#E3EAEE', 'line': '#5E6A74'}


def watering_can(doc, gx, gy, ang=24, k=1.0, band='#FF8FC0', bandD='#C9558A'):
    """A small tin watering can, held at its top handle (gx, gy); ang tips the spout down (clockwise)."""
    o = f'<g transform="translate({f(gx)},{f(gy)}) rotate({f(ang)}) scale({f(k)})">'
    # local: handle grip at (0,0); body below-right
    o += path('M-14,26 C-30,10 -12,-14 14,-6 C30,-1 40,10 44,22', st(CAN['line'], 13))
    o += path('M-14,26 C-30,10 -12,-14 14,-6 C30,-1 40,10 44,22', st(CAN['fill'], 7))
    # spout (long, to the right) + rose head
    o += path('M62,58 L112,18 L120,26 L72,74 Z', fl(CAN['fill'], CAN['line'], 4))
    o += path('M66,60 L112,22', st(CAN['light'], 3))
    o += path('M108,10 C116,2 132,10 130,22 C128,30 122,34 116,32 Z', fl(CAN['light'], CAN['line'], 4))
    for (x, y) in ((120, 14), (125, 21), (118, 24)):
        o += circ(x, y, 1.6, f'fill="{CAN["shade"]}"')
    body_t = 'M-24,22 C-26,18 -20,14 -14,14 L58,14 C64,14 70,18 68,22 L66,84 C66,92 58,96 50,96 L-8,96 C-16,96 -24,92 -24,84 Z'
    hi = rect(-16, 22, 10, 60, 5, f'fill="{CAN["light"]}" opacity=".95"')
    stripe = rect(-30, 44, 104, 18, 0, f'fill="{band}"') + path('M-30,62 L74,62', st(bandD, 2.6))
    stripe += daisy(36, 53, 7, 6, line=bandD)
    o += doc.shaded(f'<path d="{body_t}" {{a}}/>', CAN['fill'], CAN['shade'], CAN['line'], -8, -4, 4.4, stripe + hi)
    o += ell(22, 15, 46, 6, fl(CAN['light'], CAN['line'], 3.6))
    o += '</g>'
    return o


def icon_flower(cx, cy, r, col, dark, light, centre='#FFE08A', rim='#C99A12', stem=70):
    o = path(f'M{f(cx)},{f(cy)} C{f(cx - 4)},{f(cy + stem * 0.5)} {f(cx + 4)},{f(cy + stem * 0.8)} {f(cx)},{f(cy + stem)}',
             st('#3E7A2E', 9)) + \
        path(f'M{f(cx)},{f(cy)} C{f(cx - 4)},{f(cy + stem * 0.5)} {f(cx + 4)},{f(cy + stem * 0.8)} {f(cx)},{f(cy + stem)}',
             st('#5FA046', 5))
    ly = cy + stem * 0.55
    o += path(f'M{f(cx)},{f(ly)} C{f(cx - 10)},{f(ly - 18)} {f(cx - 28)},{f(ly - 16)} {f(cx - 32)},{f(ly - 8)} '
              f'C{f(cx - 24)},{f(ly + 2)} {f(cx - 10)},{f(ly + 4)} {f(cx)},{f(ly)} Z', fl('#5FA046', '#3E7A2E', 3))
    for i in range(5):
        a = math.radians(i * 72 - 90 + (cx % 20))
        px, py = cx + math.cos(a) * r * 0.56, cy + math.sin(a) * r * 0.56
        o += ell(px, py, r * 0.5, r * 0.38, fl(col, dark, 3.4) + f' transform="rotate({f(math.degrees(a))} {f(px)} {f(py)})"')
        hx, hy = cx + math.cos(a) * r * 0.64, cy + math.sin(a) * r * 0.64
        o += ell(hx, hy, r * 0.22, r * 0.12, f'fill="{light}" transform="rotate({f(math.degrees(a))} {f(hx)} {f(hy)})"')
    o += circ(cx, cy, r * 0.3, fl(centre, rim, 3))
    return o


def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD3EC"/>'
                  f'<stop offset=".7" stop-color="#D6EEF2"/><stop offset="1" stop-color="#EAF6F4"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # sun with soft rays (top right)
    for i in range(12):
        a = math.radians(i * 30 + 8)
        o += path(f'M{f(430 + math.cos(a) * 62)},{f(78 + math.sin(a) * 62)} L{f(430 + math.cos(a) * 88)},{f(78 + math.sin(a) * 88)}',
                  st('#FFE9A0', 10))
    o += circ(430, 78, 50, fl('#FFE27A', '#F2BE4A', 5))
    o += circ(414, 62, 14, 'fill="#FFF3C4"')
    # clouds
    for (x, y, s) in ((96, 70, 1.0), (262, 120, 0.7)):
        o += (f'<g transform="translate({x},{y}) scale({s})">' +
              path('M-56,18 C-70,18 -72,-4 -54,-6 C-52,-26 -24,-30 -14,-14 C-4,-34 30,-30 32,-8 C52,-10 56,18 38,18 Z',
                   fl('#FFFFFF', '#C9E2EE', 4)) + '</g>')
    # far hills + meadow
    o += path('M0,300 C80,250 170,262 250,290 C330,250 430,240 512,276 L512,512 L0,512 Z', 'fill="#A9CC8E"')
    o += path('M0,340 C110,300 220,316 300,336 C380,312 460,312 512,326 L512,512 L0,512 Z', 'fill="#93BA7A"')
    o += path('M0,380 C140,356 340,360 512,372 L512,512 L0,512 Z', 'fill="#9CC77A"')
    o += path('M0,452 C150,436 360,440 512,446 L512,512 L0,512 Z', 'fill="#85B266"')
    # tiny dusty-rose barn far away
    o += path('M318,300 L318,272 L334,256 L350,272 L350,300 Z', fl('#C98A7A', '#9A5E52', 3))
    o += rect(328, 282, 12, 18, 1, 'fill="#FFF6E2"')
    # flower row (right): soil furrow + flowers in answer colours
    o += path('M330,478 C390,468 450,468 512,472 L512,512 L326,512 Z', fl('#6B4630', '#4A2F1F', 4))
    o += path('M350,492 C400,486 450,486 500,490', st('#8A5E40', 4))
    fls = (('#E84A4A', '#A8282E', '#F7A0A0', '#8A5A2E', '#5A3A28'), ('#FFD23F', '#C99A12', '#FFEB9C', '#8A5A2E', '#5A3A28'),
           ('#3C8DE8', '#1F5BA8', '#A6CCF5', '#FFE08A', '#C99A12'), ('#FF8FC0', '#C9558A', '#FFCCE2', '#FFE08A', '#C99A12'),
           ('#FF9A2E', '#C4650C', '#FFCB8E', '#FFE08A', '#C99A12'), ('#8E44AD', '#6840A8', '#D2BDF3', '#FFE08A', '#C99A12'))
    pos = ((392, 448, 30, 40), (452, 410, 36, 76), (498, 456, 28, 40), (352, 486, 20, 26), (470, 488, 21, 24),
           (416, 492, 20, 22))
    for (x, y, r, sl), c in zip(pos, fls):
        o += icon_flower(x, y, r, c[0], c[1], c[2], c[3], c[4], sl)
    o += sparkle(490, 352, 12) + sparkle(330, 300, 9) + sparkle(470, 300, 7)
    # Tumi (pipe pose) on the left, the can held by its handle in her right flipper, water falling on the flowers
    sc = 1.36
    tx, ty = -66, 462 - 292 * sc
    gx, gy = hand_table()['pipe']
    px, py = tx + gx * sc, ty + gy * sc
    can_ang = 14
    nd = Doc('im')
    nb = tumi(nd, 'pipe')
    d.defs.extend(nd.defs)
    o += ell(tx + 150 * sc, 458, 96, 12, 'fill="#4A6A30" opacity=".22"')
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{nb}</g>'
    ck = 1.2
    can = watering_can(d, px - 4, py - 6, can_ang, ck)
    # rose head position (local 122,20) -> world, for the drops
    rx_, ry_ = rot(122 * ck, 20 * ck, can_ang)
    rx_, ry_ = rx_ + px - 4, ry_ + py - 6
    drops = ''
    for i, (dx, dy) in enumerate(((10, 18), (22, 34), (4, 42), (30, 56), (16, 66), (36, 22))):
        x, y = rx_ + dx, ry_ + dy
        drops += path(f'M{f(x)},{f(y - 7)} C{f(x + 5)},{f(y)} {f(x + 4)},{f(y + 5)} {f(x)},{f(y + 5)} '
                      f'C{f(x - 4)},{f(y + 5)} {f(x - 5)},{f(y)} {f(x)},{f(y - 7)} Z', fl('#E6F5FF', '#6FA8D6', 2.2))
    o += can + drops
    # the flipper tip over the handle so the can sits IN the flipper
    sh, ang_, scl = POSES['pipe'][3]
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">'
    tpl = f'<path d="{ARM}" transform="translate({f(sh[0])},{f(sh[1])}) rotate({f(ang_)}) scale({f(scl)})" {{a}}/>'
    o += f'<g clip-path="url(#{d.clip(circ(gx, gy, 20))})">' + d.shaded(tpl, T['skin'], T['skinSh'], T['skinLine'], -4, -3) + '</g>'
    o += '</g>'
    return svg(512, 512, o, ''.join(d.defs))


def main():
    tbl = write_tumi()
    write('characters/butterfly.svg', butterfly(False))
    write('characters/butterfly_flap.svg', butterfly(True))
    write('characters/hay.svg', hay())
    write('characters/chick.svg', chick(False))
    write('characters/chick_happy.svg', chick(True))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:8s} grip={v}')


if __name__ == '__main__':
    main()
