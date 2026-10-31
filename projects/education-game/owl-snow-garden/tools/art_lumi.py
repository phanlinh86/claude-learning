#!/usr/bin/env python3
"""Character / core-item art generator for Owlet's Snow Garden (character artist A).

Writes (relative to game/assets/default/):
  characters/lumi_{idle,blink,talk,happy,cheer,think,oops}.svg
        0 0 256 256, feet anchor (128,244). Every frame shares the same body / scarf / feet geometry;
        only eyes, beak, brows, wings and (happy/cheer) a small hop or (think) a head tilt change.
  items/seed_{red,blue,yellow,green,orange,purple,plain}.svg
        0 0 128 128, seed body centre (64,70), ~84 w x 104 h (y 20-122), sprout above (top y ~4).
        Plain seed: centre area (≈ x 34-94, y 50-108) left plain for code-drawn letters/numbers.
  items/pot_back.svg / pot_front.svg            0 0 256 200
        rim top y 20 (outer rim ellipse (128,44) rx 118 ry 24), opening rx 100 ry 17,
        soil surface ellipse centre (128,48) rx 96 ry 13, front lip y 44-82, body tapers to base y 196.
  items/planter_back.svg / planter_front.svg    0 0 512 200
        back rail top y 22, soil line y 54 (soil x 36-476), front board top y 60, base y 194.
  items/sign.svg     0 0 128 112, blank board x 12-116 / y 10-78, stake bottom (64,112)
  ui/star.svg, ui/star_empty.svg                0 0 64 64
  icon.svg           0 0 512 512, full bleed, opaque

Usage: python3 tools/art_lumi.py [outDir]
Rules (docs/DESIGN.md section 3): 100% original art, flat cartoon, ~4 px outline in a darker tone of the
fill, one-step cel shading lower/right + one soft highlight upper-left, no <text>/fonts/scripts/external
refs, no filters at all (so the "max one feGaussianBlur" rule is trivially met). width/height = viewBox.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md section 3)
PALETTE = {
    'red':    ('#E84A4A', '#A8282E'),
    'blue':   ('#3C8DE8', '#1F5BA8'),
    'yellow': ('#FFD23F', '#C99A12'),
    'green':  ('#4CC26B', '#2A8343'),
    'orange': ('#FF9A2E', '#C4650C'),
    'purple': ('#9B6BE0', '#6840A8'),
    'cream':  ('#FFF4DC', '#C9A877'),
}
L = {
    'fill': '#FBFAF6', 'shade': '#DCE3EA', 'speck': '#A9B4C2', 'line': '#7C8899', 'disc': '#FFFFFF',
    'iris': '#F2B73A', 'irisDk': '#B9821C', 'irisHi': '#FFD978', 'pupil': '#3A2E2A', 'white': '#FFFFFF',
    'beak': '#5B5560', 'beakHi': '#8C8794', 'mouth': '#7E3A4C', 'tongue': '#F59AAE',
    'cheek': '#F7B6C2',
    'scarf': '#5FD3B4', 'scarfDk': '#2E8C78', 'scarfHi': '#A8EEDB',
    'feet': '#F3C27A', 'feetLine': '#B07E3C',
}
POT = {'fill': '#E9DCC8', 'shade': '#D2C1A6', 'line': '#9C8466', 'hi': '#F6EEE2',
       'inner': '#B9A383', 'innerDk': '#8E7A5E', 'soil': '#6B4A36', 'soilDk': '#4E3425', 'soilHi': '#86604A'}
WOOD = {'fill': '#D8B98C', 'shade': '#C3A072', 'line': '#94714A', 'hi': '#EBD3AE', 'dark': '#A9865A',
        'inner': '#A07C52', 'board': '#EFDCB8'}
SNOW = {'fill': '#FFFFFF', 'shade': '#D6E4F2', 'line': '#9FB3C8'}
LW = 4.2  # outline width at viewBox 256 scale


def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join('%02X' % round(pa[i] + (pb[i] - pa[i]) * t) for i in range(3))


def svg(w, h, body, defs=''):
    d = f'<defs>{defs}</defs>' if defs else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{d}{body}</svg>\n')


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as fh:
        fh.write(text)


def ell(cx, cy, rx, ry, extra=''):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" {extra}/>'


def circ(cx, cy, r, extra=''):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {extra}/>'


def rect(x, y, w, h, r=0, extra=''):
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(r)}" {extra}/>'


def path(d, extra=''):
    return f'<path d="{d}" {extra}/>'


def stroke(col, w, fill='none'):
    return f'fill="{fill}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"'


def filled(fill, line, w=LW):
    return f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"'


def star_path(cx, cy, ro, ri, rot=-90):
    pts = []
    for i in range(10):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'


def rot_pt(x, y, ang, cx, cy):
    a = math.radians(ang)
    dx, dy = x - cx, y - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


# ======================================================================= LUMI
# Shared geometry (identical in every frame).
HEAD = (130, 98, 82, 70)        # x 48-212, y 28-168: big round head (owlets have no visible neck)
BODY = (126, 186, 68, 54)       # x 58-194, y 132-240
NECK = (130, 170)               # head tilt pivot (think)
EYE_N = (113, 99, 24.5)         # near eye (viewer's left) - ¾ view facing right
EYE_F = (170, 97, 20)           # far eye, a bit smaller
BEAK = (146, 121)               # top of the beak
CHEEKS = ((90, 128, 12, 7.5), (192, 124, 8.5, 6))
FEET = (108, 150)               # foot centres x, toes bottom at y 244 (= anchor)
SHOULDER_N = (72, 158)
SHOULDER_F = (184, 156)
TUFT_N = 'M100,38 Q90,33 82,26 Q81,32 77,33 Q70,31 63,31 Q64,46 72,56 Z'
TUFT_F = 'M160,34 Q170,29 177,23 Q178,29 182,30 Q188,28 194,28 Q199,44 195,60 Z'
WING = ('M0,-2 C-17,2 -25,28 -21,52 C-19,64 -11,73 -3,71 C2,70 5,65 7,61 C11,64 15,59 16,53 '
        'C19,32 15,4 0,-2 Z')
WING_TIP = (-3, 71)


def disc_d():
    """Facial disc: two soft lobes around the eyes meeting in a point under the beak."""
    (ax, ay, ar), (bx, by, br) = EYE_N, EYE_F
    ar += 10
    br += 9
    return (f'M{f(ax - ar)},{f(ay)} A{f(ar)},{f(ar)} 0 0 1 {f(ax + ar * 0.55)},{f(ay - ar * 0.84)} '
            f'Q{f((ax + bx) / 2 + 2)},{f(ay - 20)} {f(bx - br * 0.55)},{f(by - br * 0.84)} '
            f'A{f(br)},{f(br)} 0 0 1 {f(bx + br)},{f(by + 2)} '
            f'C{f(bx + br)},{f(by + br * 0.9)} {f(BEAK[0] + 16)},{f(BEAK[1] + 18)} {f(BEAK[0] + 1)},{f(BEAK[1] + 22)} '
            f'C{f(BEAK[0] - 18)},{f(BEAK[1] + 18)} {f(ax - ar)},{f(ay + ar * 0.9)} {f(ax - ar)},{f(ay)} Z')


def eye_open(e, look=(0, 0), wide=1.0):
    cx, cy, r = e
    r *= wide
    g = circ(cx, cy, r, filled(L['iris'], L['irisDk'], 3.4))
    g += circ(cx + look[0] * 0.3, cy + look[1] * 0.3 + r * 0.12, r * 0.78, f'fill="{L["irisHi"]}" opacity="0.55"')
    px, py = cx + look[0], cy + look[1]
    pr = r * 0.6
    g += circ(px, py, pr, f'fill="{L["pupil"]}"')
    g += circ(px - pr * 0.38, py - pr * 0.42, pr * 0.42, f'fill="{L["white"]}"')
    g += circ(px + pr * 0.45, py + pr * 0.42, pr * 0.17, f'fill="{L["white"]}"')
    return g


def eye_closed(e, kind):
    cx, cy, r = e
    w = r * 0.82
    if kind == 'happy':      # big upward smile arcs
        d = f'M{f(cx - w)},{f(cy + 6)} Q{f(cx)},{f(cy - 16)} {f(cx + w)},{f(cy + 6)}'
        return path(d, stroke(L['pupil'], 5.4))
    # blink: gentle happy arc (DESIGN 4.1), thinner and flatter + tiny lashes
    d = f'M{f(cx - w)},{f(cy + 3)} Q{f(cx)},{f(cy - 9)} {f(cx + w)},{f(cy + 3)}'
    return path(d, stroke(L['pupil'], 4.6))


def eye_star(e):
    cx, cy, r = e
    g = circ(cx, cy, r, filled(L['iris'], L['irisDk'], 3.4))
    g += path(star_path(cx, cy + 1, r * 0.78, r * 0.36), f'fill="{L["pupil"]}" stroke="{L["pupil"]}" stroke-width="2.2" stroke-linejoin="round"')
    g += circ(cx - r * 0.18, cy - r * 0.12, r * 0.17, f'fill="{L["white"]}"')
    g += circ(cx + r * 0.62, cy - r * 0.62, r * 0.13, f'fill="{L["white"]}"')
    return g


def brows(up=0, tilt=0):
    g = ''
    for (cx, cy, r), side in ((EYE_N, -1), (EYE_F, 1)):
        y = cy - r - 9 - up
        d = f'M{f(cx - 10)},{f(y + 3 + tilt * side)} Q{f(cx)},{f(y - 4)} {f(cx + 10)},{f(y + 3 - tilt * side)}'
        g += path(d, stroke(L['line'], 3.8))
    return g


def beak(kind):
    bx, by = BEAK
    if kind == 'closed':
        d = f'M{f(bx - 9)},{f(by)} Q{f(bx)},{f(by - 4)} {f(bx + 9)},{f(by)} Q{f(bx + 3)},{f(by + 10)} {f(bx + 1)},{f(by + 17)} Q{f(bx - 2)},{f(by + 10)} {f(bx - 9)},{f(by)} Z'
        return path(d, filled(L['beak'], L['beak'], 2)) + ell(bx - 3, by + 2.5, 3, 1.6, f'fill="{L["beakHi"]}"')
    if kind in ('talk', 'smile'):
        o = 13 if kind == 'talk' else 9
        # open beak: dark-rose mouth oval with a tongue, rimmed in beak grey (= lower beak), upper beak on top
        my = by + 5 + o / 2
        g = ell(bx + 1, my, 8.5 if kind == 'talk' else 9.5, o / 2 + 2.5, filled(L['mouth'], L['beak'], 3.6))
        g += ell(bx + 1, my + o * 0.28, 5, 2.8, f'fill="{L["tongue"]}"')
        up = f'M{f(bx - 10)},{f(by)} Q{f(bx)},{f(by - 4)} {f(bx + 10)},{f(by)} Q{f(bx + 5)},{f(by + 6)} {f(bx + 1)},{f(by + 9)} Q{f(bx - 3)},{f(by + 6)} {f(bx - 10)},{f(by)} Z'
        return g + path(up, filled(L['beak'], L['beak'], 2)) + ell(bx - 3, by + 2.5, 3, 1.6, f'fill="{L["beakHi"]}"')
    if kind == 'o':
        up = f'M{f(bx - 8)},{f(by)} Q{f(bx)},{f(by - 4)} {f(bx + 8)},{f(by)} Q{f(bx + 3)},{f(by + 6)} {f(bx + 1)},{f(by + 8)} Q{f(bx - 2)},{f(by + 6)} {f(bx - 8)},{f(by)} Z'
        g = ell(bx + 1, by + 13, 6, 6.5, filled(L['mouth'], L['beak'], 2.6))
        g += ell(bx + 1, by + 15.5, 3.4, 2.4, f'fill="{L["tongue"]}"')
        return g + path(up, filled(L['beak'], L['beak'], 2)) + ell(bx - 3, by + 2, 2.6, 1.4, f'fill="{L["beakHi"]}"')
    return ''


def speck(x, y, s=1.0, col=None, w=2.6):
    col = col or L['speck']
    return path(f'M{f(x - 4 * s)},{f(y - 2 * s)} Q{f(x)},{f(y + 3 * s)} {f(x + 4 * s)},{f(y - 2 * s)}', stroke(col, w))


HEAD_SPECKS = ((96, 48, 1.0), (118, 40, 1.1), (142, 39, 1.1), (164, 46, 1.0), (78, 64, 0.9), (184, 62, 0.85),
               (130, 52, 0.9), (68, 86, 0.8), (199, 84, 0.75))
BODY_SPECKS = ((72, 196, 1.0), (82, 214, 1.1), (98, 228, 1.0), (176, 196, 1.0), (184, 210, 0.9), (166, 222, 1.1),
               (150, 234, 0.9), (122, 234, 0.85), (162, 204, 0.85), (88, 200, 0.85))


def wing(side, ang, sc=1.0, uid='w'):
    sx, sy = SHOULDER_N if side < 0 else SHOULDER_F
    mirror = 1 if side < 0 else -1
    t = f'transform="translate({sx},{sy}) scale({f(mirror * sc)},{f(sc)}) rotate({f(ang)})"'
    g = path(WING, filled(L['fill'], L['line']))
    g += f'<g clip-path="url(#{uid})">'
    g += path('M-30,10 C-20,40 -6,74 20,80 L40,80 L40,-10 C20,20 8,40 -30,10 Z', f'fill="{L["shade"]}"')
    g += '</g>'
    g += path(WING, stroke(L['line'], LW))
    # feather tips + a speckle
    g += path('M-12,56 C-10,62 -7,66 -4,68 M2,58 C4,62 5,64 6,66', stroke(L['speck'], 2.4))
    g += speck(-6, 30, 0.8) + speck(4, 44, 0.75)
    g += ell(-10, 16, 4, 9, 'fill="#FFFFFF" opacity="0.8" transform="rotate(14 -10 16)"')
    return f'<g {t}>{g}</g>'


def wing_angle_to(side, target, length=None):
    """Angle that makes the wing tip point at target (for 'think')."""
    sx, sy = SHOULDER_N if side < 0 else SHOULDER_F
    mirror = 1 if side < 0 else -1
    tx, ty = (target[0] - sx) * mirror, target[1] - sy
    base = math.degrees(math.atan2(WING_TIP[1], WING_TIP[0]))
    want = math.degrees(math.atan2(ty, tx))
    sc = math.hypot(tx, ty) / math.hypot(*WING_TIP) if length is None else length
    return want - base, sc


def feet():
    g = ''
    for fx in FEET:
        for k, dx in enumerate((-8.5, 0, 8.5)):
            g += ell(fx + dx, 238.6 - (1 if k == 1 else 0), 5.6, 5.4, filled(L['feet'], L['feetLine'], 3))
        g += ell(fx - 2, 235.5, 3, 1.4, 'fill="#FFFFFF" opacity="0.6"')
    return g


def scarf():
    """Mint knitted scarf wrapped round the neck, knot at front-left with a fringed end hanging down."""
    top = 'M60,152 Q126,186 200,148'
    band = top + ' L203,166 Q126,206 62,170 Z'
    g = path(band, filled(L['scarf'], L['scarfDk']))
    # knit ribs + shade along the bottom edge
    g += path('M66,166 Q126,200 200,162', stroke(mix(L['scarf'], L['scarfDk'], 0.35), 4) + ' opacity="0.7"')
    for i in range(1, 12):
        t = i / 12
        x0 = 60 + (200 - 60) * t
        ya = (1 - t) ** 2 * 152 + 2 * (1 - t) * t * 186 + t * t * 148
        g += path(f'M{f(x0 - 1)},{f(ya + 3)} l2,12', stroke(L['scarfDk'], 2) + ' opacity="0.45"')
    g += path('M70,158 Q120,182 160,170', stroke(L['scarfHi'], 3) + ' opacity="0.9"')
    # hanging end (from the knot down the chest), fringe at the bottom
    end = 'M92,176 C90,192 88,206 86,218 L112,220 C112,206 112,192 114,178 Z'
    g += path(end, filled(L['scarf'], L['scarfDk']))
    g += path('M88,198 L113,199 M87,210 L112,211', stroke(L['scarfDk'], 2.6) + ' opacity="0.6"')
    g += path('M96,182 C95,194 94,204 93,214', stroke(L['scarfHi'], 2.6) + ' opacity="0.8"')
    for k in range(5):
        x = 89 + k * 5.6
        g += path(f'M{f(x)},{f(220 + (k % 2) * 0.5)} L{f(x - 0.8)},{f(229 + (k % 2) * 2)}', stroke(L['scarfDk'], 5.6))
        g += path(f'M{f(x)},{f(220.5)} L{f(x - 0.8)},{f(228 + (k % 2) * 2)}', stroke(L['scarf'], 2.8))
    # knot
    g += ell(104, 178, 13, 10.5, filled(L['scarf'], L['scarfDk']))
    g += path('M96,174 Q104,170 112,175', stroke(L['scarfHi'], 2.6))
    g += path('M98,183 Q104,186 110,183', stroke(L['scarfDk'], 2) + ' opacity="0.6"')
    return g


def lumi_parts(pose, uid):
    """Returns (defs, body svg) of Lumi in the 256 box."""
    defs = (f'<clipPath id="{uid}h">{ell(*HEAD)}</clipPath><clipPath id="{uid}b">{ell(*BODY)}</clipPath>'
            f'<clipPath id="{uid}w">{path(WING)}</clipPath>')
    tilt = pose.get('tilt', 0)
    ht = f' transform="rotate({f(tilt)} {NECK[0]} {NECK[1]})"' if tilt else ''
    wn, wf = pose.get('wings', (8, 8))
    wsc = pose.get('wingSc', (1.0, 1.0))
    far_front = pose.get('farFront', False)

    g = ''
    if not far_front:
        g += wing(1, wf, wsc[1], uid + 'w')
    # silhouette outline (union of body, head and tufts): thick under-strokes, fills on top
    sil = 2 * LW
    g += ell(*BODY, stroke(L['line'], sil))
    g += f'<g{ht}>' + ell(*HEAD, stroke(L['line'], sil)) + path(TUFT_N, stroke(L['line'], sil)) + \
        path(TUFT_F, stroke(L['line'], sil)) + '</g>'
    # body + cel shade (lower right) + speckles
    g += ell(*BODY, f'fill="{L["fill"]}"')
    g += f'<g clip-path="url(#{uid}b)">' + rect(50, 120, 160, 130, 0, f'fill="{L["shade"]}"') + \
        ell(BODY[0] - 9, BODY[1] - 8, BODY[2], BODY[3], f'fill="{L["fill"]}"') + \
        ''.join(speck(x, y, s) for x, y, s in BODY_SPECKS) + '</g>'
    g += feet()
    g += scarf()
    # head
    h = path(TUFT_N, f'fill="{L["fill"]}"') + path(TUFT_F, f'fill="{L["shade"]}"')
    h += path('M76,50 Q72,42 68,35', stroke(L['shade'], 3)) + path('M184,42 Q188,36 191,32', stroke(L['speck'], 2.4) + ' opacity="0.7"')
    h += ell(*HEAD, f'fill="{L["fill"]}"')
    h += f'<g clip-path="url(#{uid}h)">' + rect(40, 20, 180, 160, 0, f'fill="{L["shade"]}"') + \
        ell(HEAD[0] - 9, HEAD[1] - 8, HEAD[2], HEAD[3], f'fill="{L["fill"]}"') + \
        ''.join(speck(x, y, s) for x, y, s in HEAD_SPECKS) + '</g>'
    h += ell(*HEAD, stroke(L['line'], LW * 0.8))
    h += ell(84, 54, 18, 8, 'fill="#FFFFFF" opacity="0.9" transform="rotate(-32 84 54)"')
    # facial disc
    d = disc_d()
    h += path(d, stroke(L['shade'], 5)) + path(d, f'fill="{L["disc"]}"')
    # little feather "V" over the beak
    h += path(f'M{BEAK[0] - 8},{BEAK[1] - 16} L{BEAK[0] + 1},{BEAK[1] - 6} L{BEAK[0] + 9},{BEAK[1] - 16}', stroke(L['shade'], 3.2))
    for cx, cy, rx, ry in CHEEKS:
        h += ell(cx, cy, rx, ry, f'fill="{L["cheek"]}" opacity="{f(pose.get("cheek", 0.85))}"')
    h += pose['face']
    g += f'<g{ht}>{h}</g>'
    g += wing(-1, wn, wsc[0], uid + 'w')
    if far_front:
        g += wing(1, wf, wsc[1], uid + 'w')
    dy = pose.get('dy', 0)
    if dy:
        g = f'<g transform="translate(0,{f(dy)})">{g}</g>'
    return defs, g


def face(eyes, bk, extra=''):
    return eyes + extra + beak(bk)


def _think_pose():
    tilt = 6
    target = rot_pt(BEAK[0] + 6, BEAK[1] + 16, tilt, *NECK)
    ang, sc = wing_angle_to(1, target)
    return dict(face=face(eye_open(EYE_N, (5, -7)) + eye_open(EYE_F, (5, -7)), 'closed', brows(2, 2)),
                tilt=tilt, wings=(10, ang), wingSc=(1.0, sc), farFront=True)


POSES = {
    'idle':  dict(face=face(eye_open(EYE_N, (3, 1)) + eye_open(EYE_F, (3, 1)), 'closed')),
    'blink': dict(face=face(eye_closed(EYE_N, 'blink') + eye_closed(EYE_F, 'blink'), 'closed')),
    'talk':  dict(face=face(eye_open(EYE_N, (3, 1)) + eye_open(EYE_F, (3, 1)), 'talk')),
    'happy': dict(face=face(eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy'), 'smile'),
                  wings=(128, 128), dy=-8, cheek=1.0),
    'cheer': dict(face=face(eye_star(EYE_N) + eye_star(EYE_F), 'talk'), wings=(112, 112), dy=-12, cheek=1.0),
    'think': _think_pose(),
    'oops':  dict(face=face(eye_open(EYE_N, (0, 0), 1.06) + eye_open(EYE_F, (0, 0), 1.06), 'o', brows(7, -1)),
                  wings=(30, 26)),
}


def gen_lumi():
    for name, pose in POSES.items():
        defs, g = lumi_parts(pose, 'l' + name[:2])
        write(f'characters/lumi_{name}.svg', svg(256, 256, g, defs))


# ======================================================================= SEEDS
SEED_D = ('M64,19 C68,19 76,30 86,44 C98,60 106,74 106,88 C106,110 88,123 64,123 '
          'C40,123 22,110 22,88 C22,74 30,60 42,44 C52,30 60,19 64,19 Z')


def sprout():
    stem = 'M64,22 C63,16 63,12 65,8'
    g = path(stem, stroke('#2A8343', 7)) + path(stem, stroke('#6FD07E', 3.2))
    right = 'M65,9 C70,1 84,-1 94,4 C88,12 74,15 65,9 Z'
    left = 'M64,10 C58,3 46,2 38,7 C44,14 56,15 64,10 Z'
    g += path(left, filled('#5CC56E', '#2A8343', 2.8)) + path('M61,9 C55,7 49,7 43,7', stroke('#A8E9A0', 1.6))
    g += path(right, filled('#6FD07E', '#2A8343', 2.8)) + path('M68,8 C75,5 82,4 89,4', stroke('#C3F2B8', 1.8))
    return g


def seed_svg(key):
    fill, dark = PALETTE[key]
    plain = key == 'cream'
    shade = mix(fill, dark, 0.45 if not plain else 0.3)
    light = mix(fill, '#FFFFFF', 0.45 if key != 'yellow' else 0.6)
    cid = 'sd' + key[:3]
    defs = f'<clipPath id="{cid}">{path(SEED_D)}</clipPath>'
    g = sprout()
    g += path(SEED_D, f'fill="{fill}"')
    g += f'<g clip-path="url(#{cid})">'
    g += path(SEED_D, f'fill="{shade}"') + f'<g transform="translate(-9,-7)">{path(SEED_D, f"fill={chr(34)}{fill}{chr(34)}")}</g>'
    if not plain:
        # soft light stripes following the seed's shape + a few specks
        g += path('M50,38 C38,62 36,96 48,116', stroke(light, 6) + ' opacity="0.85"')
        g += path('M64,30 C62,62 62,96 64,120', stroke(light, 5) + ' opacity="0.6"')
        g += path('M80,40 C92,64 92,96 82,116', stroke(light, 5) + ' opacity="0.5"')
    else:
        # plain: faint rim tint at the bottom only (centre stays clear for letters / numbers)
        g += path('M30,104 C44,122 84,124 98,104', stroke('#F1DDB5', 4))
    g += '</g>'
    g += path(SEED_D, f'fill="none" stroke="{dark}" stroke-width="{LW}" stroke-linejoin="round"')
    g += ell(44, 54, 6, 12, f'fill="#FFFFFF" opacity="{0.6 if not plain else 0.8}" transform="rotate(28 44 54)"')
    g += circ(36, 76, 3, 'fill="#FFFFFF" opacity="0.55"')
    return svg(128, 128, g, defs)


def gen_seeds():
    for key in ('red', 'blue', 'yellow', 'green', 'orange', 'purple'):
        write(f'items/seed_{key}.svg', seed_svg(key))
    write('items/seed_plain.svg', seed_svg('cream'))


# ======================================================================= POT
RIM_O = (128, 44, 118, 24)     # outer rim (top surface) ellipse: x 10-246, y 20-68
RIM_I = (128, 44, 100, 17)     # opening: y 27-61
SOIL = (128, 48, 96, 13)       # soil surface: centre (128,48)
LIP = 14                       # rim lip thickness (front face)
BASE = (128, 188, 76, 8)       # base ellipse -> lowest y 196


def ept(e, t):
    cx, cy, rx, ry = e
    return cx + rx * math.cos(t), cy + ry * math.sin(t)


def arc_d(e, t0, t1, n=36, move=True, dy=0):
    pts = [ept(e, t0 + (t1 - t0) * i / n) for i in range(n + 1)]
    return ('M' if move else 'L') + ' L'.join(f'{f(x)},{f(y + dy)}' for x, y in pts)


def snow_puff(circles, shade=True, rects=(), lw=5.2):
    """Fluffy snow cap: union of circles/rounded rects (outline under, fill over) + a soft blue shade."""
    ol = f'fill="{SNOW["line"]}" stroke="{SNOW["line"]}" stroke-width="{f(lw)}" stroke-linejoin="round"'
    g = ''.join(circ(x, y, r, ol) for x, y, r in circles) + ''.join(rect(*q, ol) for q in rects)
    g += ''.join(circ(x, y, r, f'fill="{SNOW["shade"] if shade else SNOW["fill"]}"') for x, y, r in circles)
    g += ''.join(rect(*q, f'fill="{SNOW["fill"]}"') for q in rects)
    if shade:   # white top, soft blue underside (one-step cel shade)
        g += ''.join(circ(x - r * 0.12, y - r * 0.2, r * 0.86, f'fill="{SNOW["fill"]}"') for x, y, r in circles)
    x, y, r = max(circles, key=lambda c: c[2])
    g += ell(x - r * 0.35, y - r * 0.4, r * 0.35, r * 0.18, 'fill="#FFFFFF"')
    return g


def rim_puffs(e, t0, t1, n, r0, r1, dy=0, seed=1):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        u = i / (n - 1)
        x, y = ept(e, t0 + (t1 - t0) * u)
        r = r0 + (r1 - r0) * math.sin(u * math.pi) + rnd.uniform(-1, 1)
        out.append((x, y + dy - r * 0.35, r))
    return out


def gen_pot():
    cx = 128
    # ---------------- back: rim top surface (whole ring) + inner wall + soil
    defs = f'<clipPath id="pbo">{ell(*RIM_I)}</clipPath>'
    g = ell(*RIM_O, filled(POT['fill'], POT['line']))
    g += ell(cx - 4, 41, 104, 18, f'fill="{POT["hi"]}" opacity="0.7"')
    g += ell(*RIM_I, f'fill="{POT["inner"]}" stroke="{POT["line"]}" stroke-width="3"')
    g += '<g clip-path="url(#pbo)">'
    g += ell(cx, 30, 100, 10, f'fill="{POT["innerDk"]}" opacity="0.55"')
    g += ell(*SOIL, f'fill="{POT["soil"]}"')
    g += ell(cx + 6, 52, 90, 10, f'fill="{POT["soilDk"]}" opacity="0.6"')
    rnd = random.Random(7)
    for _ in range(26):
        a = rnd.uniform(0, 2 * math.pi)
        r = math.sqrt(rnd.random()) * 0.85
        x, y = cx + SOIL[2] * r * math.cos(a), SOIL[1] + SOIL[3] * r * math.sin(a)
        g += ell(x, y, rnd.uniform(1.6, 3.2), rnd.uniform(1.0, 1.8), f'fill="{POT["soilHi"] if rnd.random() < .6 else POT["soilDk"]}"')
    g += path(arc_d(SOIL, math.pi * 1.1, math.pi * 1.9), stroke(POT['soilDk'], 2.4) + ' opacity="0.7"')
    g += '</g>'
    # little snow drift on the back rim (right)
    g += snow_puff(rim_puffs((128, 44, 109, 20.5), 1.6 * math.pi, 1.84 * math.pi, 4, 8, 12, seed=2))
    write('items/pot_back.svg', svg(256, 200, g, defs))

    # ---------------- front: front rim surface + lip face + tapered body
    front_rim = arc_d(RIM_O, 0, math.pi) + ' ' + arc_d(RIM_I, math.pi, 0, move=False) + ' Z'
    lip = arc_d(RIM_O, 0, math.pi) + ' ' + arc_d(RIM_O, math.pi, 0, move=False, dy=LIP) + ' Z'
    # body: under the lip, slightly narrower than the rim, curving in to the base
    by0 = RIM_O[1] + LIP + 4
    body = (f'M{f(cx - 108)},{f(by0)} C{f(cx - 106)},{f(by0 + 40)} {f(cx - 90)},{f(150)} {f(cx - BASE[2])},{f(BASE[1])} '
            + arc_d(BASE, math.pi, 0, move=False) +
            f' C{f(cx + 90)},{f(150)} {f(cx + 106)},{f(by0 + 40)} {f(cx + 108)},{f(by0)} '
            + arc_d((cx, by0, 108, 22), 0, math.pi, move=False) + ' Z')
    defs = f'<clipPath id="pfb">{path(body)}</clipPath><clipPath id="pfl">{path(lip)}</clipPath>'
    g = path(body, f'fill="{POT["fill"]}"')
    g += '<g clip-path="url(#pfb)">'
    g += path(f'M{cx + 30},60 C{cx + 80},70 {cx + 100},130 {cx + 60},200 L260,200 L260,60 Z', f'fill="{POT["shade"]}"')
    g += path(f'M{cx - 86},84 C{cx - 84},120 {cx - 74},150 {cx - 62},176', stroke(POT['hi'], 9) + ' opacity="0.9"')
    # under-lip shadow + a calm decorative band
    g += path(arc_d((cx, by0, 108, 22), 0, math.pi), stroke(POT['line'], 9) + ' opacity="0.28"')
    g += path(arc_d((cx, 150, 94, 18), 0.05 * math.pi, 0.95 * math.pi), stroke(POT['shade'], 6))
    g += path(arc_d((cx, 150, 94, 18), 0.05 * math.pi, 0.95 * math.pi, dy=-6), stroke(POT['hi'], 2.4) + ' opacity="0.8"')
    g += '</g>'
    g += path(body, f'fill="none" stroke="{POT["line"]}" stroke-width="{LW}" stroke-linejoin="round"')
    # lip face
    g += path(lip, f'fill="{POT["fill"]}"')
    g += f'<g clip-path="url(#pfl)">' + rect(cx + 40, 40, 100, 50, 0, f'fill="{POT["shade"]}" opacity="0.8"') + '</g>'
    g += path(lip, f'fill="none" stroke="{POT["line"]}" stroke-width="{LW}" stroke-linejoin="round"')
    # front rim top surface
    g += path(front_rim, f'fill="{POT["fill"]}" stroke="{POT["line"]}" stroke-width="3" stroke-linejoin="round"')
    g += path(arc_d((cx, 44, 109, 20.5), 0.62 * math.pi, 0.92 * math.pi), stroke(POT['hi'], 3.2))
    # snow cap on the front rim (left) with a little drip over the lip
    puffs = rim_puffs((128, 44, 109, 20.5), 0.6 * math.pi, 0.9 * math.pi, 5, 10, 15, seed=3)
    dx_, dy_ = ept((128, 44, 118, 24), 0.74 * math.pi)
    puffs += [(dx_ + 2, dy_ + 9, 8), (dx_ + 3, dy_ + 17, 5)]   # little drip over the lip
    g += snow_puff(puffs)
    write('items/pot_front.svg', svg(256, 200, g, defs))


# ======================================================================= PLANTER
def gen_planter():
    W, x0, x1 = 512, 16, 496
    # ---------------- back: back rail, side rails (top view), inner wall, soil (centre line y 54)
    g = path(f'M{x0 + 4},26 Q{x0 + 4},22 {x0 + 10},22 L{x1 - 10},22 Q{x1 - 4},22 {x1 - 4},26 L{x1 - 4},64 L{x0 + 4},64 Z',
             filled(WOOD['fill'], WOOD['line']))
    g += rect(x0 + 18, 34, x1 - x0 - 36, 30, 2, f'fill="{WOOD["inner"]}" stroke="{WOOD["line"]}" stroke-width="2.4"')
    g += rect(x0 + 18, 34, x1 - x0 - 36, 6, 0, f'fill="{WOOD["line"]}" opacity="0.35"')
    soil = f'M{x0 + 20},50 C{x0 + 60},45 {x1 - 60},45 {x1 - 20},50 L{x1 - 20},66 L{x0 + 20},66 Z'
    g += path(soil, f'fill="{POT["soil"]}"')
    g += rect(x0 + 20, 56, x1 - x0 - 40, 10, 0, f'fill="{POT["soilDk"]}" opacity="0.6"')
    rnd = random.Random(11)
    for _ in range(60):
        x = rnd.uniform(x0 + 26, x1 - 26)
        y = rnd.uniform(49, 60)
        g += ell(x, y, rnd.uniform(1.6, 3.2), rnd.uniform(1.0, 1.7), f'fill="{POT["soilHi"] if rnd.random() < .6 else POT["soilDk"]}"')
    # back rail top surface highlight + grain
    g += path(f'M{x0 + 12},27 L{x1 - 12},27', stroke(WOOD['hi'], 3))
    g += path(f'M{x0 + 60},30 L{x0 + 150},30 M{x0 + 230},30 L{x0 + 300},30 M{x1 - 120},30 L{x1 - 50},30', stroke(WOOD['dark'], 1.6) + ' opacity="0.6"')
    g += snow_puff([(x1 - 100 + i * 20, 21 - 3 * math.sin(i / 4 * math.pi), 7 + 4 * math.sin(i / 4 * math.pi)) for i in range(5)])
    write('items/planter_back.svg', svg(W, 200, g))

    # ---------------- front: front board (3 planks), top rail, corner posts, little feet
    defs = f'<clipPath id="plf">{rect(x0, 60, x1 - x0, 130, 8)}</clipPath>'
    g = rect(x0 + 18, 186, 34, 10, 3, filled(WOOD['dark'], WOOD['line'], 3)) + \
        rect(x1 - 52, 186, 34, 10, 3, filled(WOOD['dark'], WOOD['line'], 3))
    g += rect(x0, 60, x1 - x0, 130, 8, f'fill="{WOOD["fill"]}"')
    g += '<g clip-path="url(#plf)">'
    g += rect(x0, 150, x1 - x0, 50, 0, f'fill="{WOOD["shade"]}"')
    for y in (104, 146):
        g += path(f'M{x0},{y} L{x1},{y}', stroke(WOOD['line'], 3))
        g += path(f'M{x0},{y + 3} L{x1},{y + 3}', stroke(WOOD['hi'], 2) + ' opacity="0.8"')
    rnd = random.Random(5)
    for row, (ya, yb) in enumerate(((78, 102), (108, 144), (150, 188))):
        for _ in range(4):
            x = rnd.uniform(x0 + 50, x1 - 120)
            y = rnd.uniform(ya + 6, yb - 6)
            ln = rnd.uniform(40, 90)
            g += path(f'M{f(x)},{f(y)} Q{f(x + ln / 2)},{f(y - 3)} {f(x + ln)},{f(y)}', stroke(WOOD['dark'], 1.8) + ' opacity="0.55"')
    # corner posts
    for px in (x0, x1 - 26):
        g += rect(px, 60, 26, 130, 0, f'fill="{WOOD["dark"]}" opacity="0.35"')
        g += path(f'M{px + 26 if px == x0 else px},60 L{px + 26 if px == x0 else px},190', stroke(WOOD['line'], 2.4))
    g += path(f'M{x0 + 40},84 L{x0 + 40},176', stroke(WOOD['hi'], 5) + ' opacity="0.6"')
    g += '</g>'
    g += rect(x0, 60, x1 - x0, 130, 8, f'fill="none" stroke="{WOOD["line"]}" stroke-width="{LW}"')
    # top front rail (over the soil edge)
    g += rect(x0 - 4, 56, x1 - x0 + 8, 18, 6, filled(WOOD['fill'], WOOD['line']))
    g += path(f'M{x0 + 6},61 L{x1 - 6},61', stroke(WOOD['hi'], 3))
    g += rect(x0 - 4, 68, x1 - x0 + 8, 6, 3, f'fill="{WOOD["shade"]}" opacity="0.8"')
    # nail dots
    for x in (x0 + 13, x1 - 13):
        for y in (88, 126, 168):
            g += circ(x, y, 2.6, f'fill="{WOOD["line"]}"')
    # snow caps on the front rail ends
    g += snow_puff([(x0 + i * 18, 56 - 3 * math.sin(i / 5 * math.pi), 7 + 5 * math.sin(i / 5 * math.pi)) for i in range(6)]
                   + [(x0 + 70, 66, 6), (x0 + 71, 73, 4)])
    g += snow_puff([(x1 - i * 18, 56 - 2 * math.sin(i / 3 * math.pi), 6.5 + 4 * math.sin(i / 3 * math.pi)) for i in range(4)])
    write('items/planter_front.svg', svg(W, 200, g, defs))


# ======================================================================= SIGN
def gen_sign():
    defs = '<clipPath id="sgb"><rect x="6" y="5" width="116" height="80" rx="10"/></clipPath>'
    # stake
    g = rect(56, 78, 16, 36, 3, filled(WOOD['fill'], WOOD['line'], 3.4))
    g += rect(64, 82, 8, 30, 0, f'fill="{WOOD["shade"]}"')
    g += path('M56,111 L72,111', stroke(WOOD['line'], 3))
    # board
    g += rect(6, 5, 116, 80, 10, f'fill="{WOOD["board"]}"')
    g += '<g clip-path="url(#sgb)">'
    g += rect(6, 79, 116, 8, 0, f'fill="{WOOD["shade"]}"') + rect(116, 5, 8, 82, 0, f'fill="{WOOD["shade"]}" opacity="0.7"')
    g += path('M14,82 L40,82 M76,82 L104,82', stroke(WOOD['dark'], 1.4) + ' opacity="0.6"')
    g += '</g>'
    g += rect(6, 5, 116, 80, 10, f'fill="none" stroke="{WOOD["line"]}" stroke-width="{LW}"')
    g += circ(14, 76, 2.2, f'fill="{WOOD["line"]}"') + circ(114, 76, 2.2, f'fill="{WOOD["line"]}"')
    # snow cap along the top edge (stays above y 10 inside the blank area except tiny drips at the corners)
    g += snow_puff([(14, 5, 5), (36, 4.5, 5.5), (60, 5, 5), (86, 4.5, 5.5), (110, 5, 5), (24, 9, 2.6), (99, 9.2, 2.8)],
                   shade=False, rects=((3, 0.5, 122, 8, 4),), lw=4)
    write('items/sign.svg', svg(128, 112, g, defs))


# ======================================================================= STARS
def gen_stars():
    sp = star_path(32, 34, 28, 13.5)
    defs = f'<clipPath id="st">{path(sp)}</clipPath>'
    g = path(sp, f'fill="#FFC83A"')
    g += '<g clip-path="url(#st)">' + path('M32,34 L64,38 L64,64 L0,64 L0,50 Z', 'fill="#F5A623" opacity="0.65"') + '</g>'
    g += path(sp, f'fill="none" stroke="#C98612" stroke-width="{LW}" stroke-linejoin="round"')
    g += ell(24, 25, 4.5, 8, 'fill="#FFFFFF" opacity="0.75" transform="rotate(35 24 25)"')
    g += circ(19, 35, 2.2, 'fill="#FFFFFF" opacity="0.6"')
    write('ui/star.svg', svg(64, 64, g, defs))
    g = path(sp, f'fill="#E8EDF3" fill-opacity="0.9" stroke="#8E9BAE" stroke-width="{LW}" stroke-linejoin="round"')
    g += path(star_path(32, 34, 17, 8), 'fill="none" stroke="#C4CDD8" stroke-width="2.2" stroke-linejoin="round" stroke-dasharray="3 4"')
    write('ui/star_empty.svg', svg(64, 64, g))


# ======================================================================= ICON
def flower(cx, cy, r, petal, dark, n=6, rot=-90):
    g = ''
    for i in range(n):
        a = math.radians(rot + i * 360 / n)
        px, py = cx + r * 0.62 * math.cos(a), cy + r * 0.62 * math.sin(a)
        g += ell(px, py, r * 0.5, r * 0.36, filled(petal, dark, 4) + f' transform="rotate({f(math.degrees(a))} {f(px)} {f(py)})"')
    for i in range(n):
        a = math.radians(rot + i * 360 / n)
        px, py = cx + r * 0.7 * math.cos(a), cy + r * 0.7 * math.sin(a)
        g += ell(px - 2, py - 2, r * 0.2, r * 0.1, f'fill="#FFFFFF" opacity="0.45" transform="rotate({f(math.degrees(a))} {f(px)} {f(py)})"')
    g += circ(cx, cy, r * 0.34, filled('#FFF4DC', '#C9A877', 4))
    g += circ(cx - r * 0.1, cy - r * 0.1, r * 0.1, 'fill="#FFFFFF" opacity="0.8"')
    return g


def gen_icon():
    defs = ('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#9FD4F5"/><stop offset="0.7" stop-color="#E4F3FF"/>'
            '<stop offset="1" stop-color="#F6FAFF"/></linearGradient>')
    g = '<rect width="512" height="512" fill="url(#isky)"/>'
    # soft distant hills + snow ground
    g += path('M0,330 C90,290 170,300 260,326 C350,300 440,290 512,312 L512,512 L0,512 Z', 'fill="#DCEBF8"')
    g += path('M0,380 C140,350 330,356 512,374 L512,512 L0,512 Z', f'fill="{SNOW["fill"]}"')
    g += path('M0,446 C160,428 340,432 512,446 L512,512 L0,512 Z', f'fill="{SNOW["shade"]}" opacity="0.6"')
    rnd = random.Random(3)
    for _ in range(18):
        x, y = rnd.uniform(14, 498), rnd.uniform(14, 300)
        g += circ(x, y, rnd.uniform(3, 6.5), 'fill="#FFFFFF" opacity="0.9"')
    # flower (right)
    g += path('M424,420 C420,370 430,320 428,250', stroke('#2A8343', 18))
    g += path('M424,420 C420,370 430,320 428,250', stroke('#4CC26B', 10))
    g += path('M426,350 C446,330 474,330 486,342 C468,358 444,362 426,350 Z', filled('#4CC26B', '#2A8343', 5))
    g += path('M424,384 C404,366 378,366 368,376 C386,394 410,398 424,384 Z', filled('#4CC26B', '#2A8343', 5))
    g += flower(428, 222, 66, '#E84A4A', '#A8282E')
    g += ell(424, 422, 56, 11, f'fill="{SNOW["shade"]}"')
    # Lumi bust (body runs off the bottom edge)
    ldefs, lg = lumi_parts(dict(face=face(eye_open(EYE_N, (4, 0)) + eye_open(EYE_F, (4, 0)), 'smile'),
                                wings=(8, 8), cheek=1.0), 'ic')
    defs += ldefs
    g += f'<g transform="translate(-66,58) scale(2.0)">{lg}</g>'
    # sparkles near the flower
    for x, y, s in ((356, 132, 13), (492, 140, 9), (470, 70, 8)):
        g += path(star_path(x, y, s, s * 0.42), 'fill="#FFE27A" stroke="#E0A818" stroke-width="2" stroke-linejoin="round"')
    write('icon.svg', svg(512, 512, g, defs))


if __name__ == '__main__':
    gen_lumi()
    gen_seeds()
    gen_pot()
    gen_planter()
    gen_sign()
    gen_stars()
    gen_icon()
    print('wrote art to', OUT)
