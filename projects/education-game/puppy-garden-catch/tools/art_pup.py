#!/usr/bin/env python3
"""Character / core-item art generator for Puppy Garden Catch (character artist A).

Writes (relative to game/assets/default/):
  characters/pup_{idle,blink,talk,happy,cheer,think,oops,run1,run2}.svg
        0 0 256 256, feet anchor (128,244), paws x 70-186 / y 135-170 (basket is drawn over them by code)
  items/basket_back.svg, items/basket_front.svg
        0 0 256 160, rim centre (128,40), rim ellipse rx 112 / ry 26, basket bottom y ~150
  items/ball_{red,blue,yellow,green,orange,purple,plain}.svg
        0 0 128 128, centre (64,64), r 52
  items/bubble.svg      0 0 128 128, centre (64,64), r ~58, transparent inside
  icon.svg              0 0 512 512, full bleed, opaque
  (ui/star*.svg are kept as they are.)

Usage: python3 tools/art_pup.py [outDir]
Rules (docs/DESIGN.md section 3): 100% original art (Pip is our own puppy, not any known character),
flat cartoon, ~4 px outline in a darker tone of the fill, one-step cel shading lower/right + one soft
highlight upper-left, no <text>/fonts/scripts, at most one feGaussianBlur per file (we use none).
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
PIP = {
    'fill': '#D9A066', 'shade': '#C68B52', 'line': '#8A5A2E', 'hi': '#F4CD98',
    'light': '#FFF0D6', 'lightShade': '#F2DCB8', 'lightLine': '#D9B98C',
    'ear': '#A8703C', 'earShade': '#93602F', 'earLine': '#74471F',
    'nose': '#5A3A2A', 'eye': '#2E2018', 'white': '#FFFFFF',
    'cheek': '#FF9E9E', 'mouth': '#7A3B2E', 'tongue': '#FF8A98', 'tongueLine': '#D8606E',
    'collar': '#3FBFA8', 'collarDk': '#2A8F7D', 'tag': '#E9F3F2', 'tagLine': '#8FA9A6',
}
BASKET = {
    'fill': '#E8B86A', 'weave': '#B8823A', 'line': '#8A5A24', 'hi': '#F6D79A',
    'inner': '#B07A3A', 'deep': '#7A4F22', 'shadow': '#5E3C1A',
}
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


# ======================================================================= PIP
# Shared geometry (every frame uses these unchanged; only face / ears / tail / legs differ).
HEAD = (128, 80, 72, 61)          # ellipse: x 56-200, y 19-141  (~55 % of the 225 px tall puppy)
MUZZLE = (128, 107, 35, 25)
NOSE = (128, 93)
EYES = ((99, 74), (157, 74))
CHEEKS = ((80, 103), (176, 103))
BODY = (128, 194, 50, 45)         # ellipse: y 149-239
BELLY = (128, 204, 28, 30)
PAWS = ((90, 158), (166, 158))    # front paws held in front of the chest (inside x 70-186, y 135-170)
NECK = (128, 140)                 # head tilt pivot
HEAD_LIFT = -6                    # whole head (+ears) raised 6 px -> head y 13-135
HIPS = ((106, 222), (150, 222))
FEET_IDLE = ((103, 236), (153, 236))   # feet ellipses ry 8 -> bottom y 244 = anchor


def head_shape(extra=''):
    return ell(*HEAD, extra)


def ear(side, ang, sc=1.0):
    """Floppy ear hanging from the top side of the head. side -1 = left, +1 = right.
    ang: rotation in degrees outward (0 = hangs straight down, ~120 = perked up)."""
    ax, ay = (76, 36) if side < 0 else (180, 36)
    d = 'M-12,-6 C-30,8 -34,58 -24,80 C-16,96 6,96 12,78 C18,54 16,14 10,-6 C4,-12 -6,-12 -12,-6 Z'
    inner = 'M-6,8 C-18,24 -20,58 -14,72 C-8,82 2,80 5,68 C8,50 6,20 2,8 Z'
    rot = ang if side < 0 else -ang
    sx = 1 if side < 0 else -1
    t = f'transform="translate({ax},{ay}) rotate({f(rot)}) scale({f(sx * sc)},{f(sc)})"'
    g = path(d, filled(PIP['ear'], PIP['earLine']))
    g += path(inner, f'fill="{PIP["earShade"]}"')
    g += path('M-18,20 C-22,40 -22,56 -18,66', stroke(mix(PIP['ear'], '#FFFFFF', 0.25), 3) + ' opacity="0.8"')
    return f'<g {t}>{g}</g>'


def eyes_open(look=(0, 0), wide=1.0, dx=0):
    out = ''
    for i, (ex, ey) in enumerate(EYES):
        ex += dx
        s = 1.0 if dx == 0 else (0.9 if i == 0 else 1.04)   # head turned: far eye a bit smaller
        rx, ry = 11.5 * s * wide, 14.5 * s * wide
        ix, iy = ex + look[0], ey + look[1]
        out += ell(ix, iy, rx, ry, f'fill="{PIP["eye"]}"')
        out += circ(ix - 4 * s, iy - 5.5 * s, 4.6 * s, f'fill="{PIP["white"]}"')
        out += circ(ix + 3.6 * s, iy + 5 * s, 2 * s, f'fill="{PIP["white"]}"')
    return out


def eyes_closed(kind, dx=0):
    out = ''
    for ex, ey in EYES:
        ex += dx
        w = 11
        if kind == 'happy':     # upward arcs ^ ^
            d = f'M{f(ex - w)},{f(ey + 5)} Q{f(ex)},{f(ey - 11)} {f(ex + w)},{f(ey + 5)}'
        else:                   # blink: soft downward lids
            d = f'M{f(ex - w)},{f(ey)} Q{f(ex)},{f(ey + 9)} {f(ex + w)},{f(ey)}'
        out += path(d, stroke(PIP['eye'], 4.8))
    return out


def eyes_sparkle():
    out = ''
    for ex, ey in EYES:
        out += path(star_path(ex, ey + 1, 15, 6.5), f'fill="{PIP["eye"]}" stroke="{PIP["eye"]}" stroke-width="2.4" stroke-linejoin="round"')
        out += circ(ex - 2.5, ey - 2, 2.8, f'fill="{PIP["white"]}"')
    return out


def brows(raise_=0, tilt=0, dx=0):
    out = ''
    for (ex, ey), side in zip(EYES, (-1, 1)):
        ex += dx
        y = ey - 24 - raise_
        d = f'M{f(ex - 8)},{f(y + 2 + tilt * side)} Q{f(ex)},{f(y - 4)} {f(ex + 8)},{f(y + 2 - tilt * side)}'
        out += path(d, stroke(PIP['line'], 3.6))
    return out


def nose(dx=0):
    nx, ny = NOSE[0] + dx, NOSE[1]
    d = (f'M{f(nx - 12)},{f(ny - 5)} C{f(nx - 12)},{f(ny - 9)} {f(nx + 12)},{f(ny - 9)} {f(nx + 12)},{f(ny - 5)} '
         f'C{f(nx + 12)},{f(ny + 2)} {f(nx + 4)},{f(ny + 7)} {f(nx)},{f(ny + 7)} '
         f'C{f(nx - 4)},{f(ny + 7)} {f(nx - 12)},{f(ny + 2)} {f(nx - 12)},{f(ny - 5)} Z')
    return path(d, f'fill="{PIP["nose"]}"') + ell(nx - 4, ny - 4, 4, 2.2, 'fill="#FFFFFF" opacity="0.55"')


def mouth(kind, dx=0, uid='m'):
    mx, my = NOSE[0] + dx, NOSE[1] + 7
    col = PIP['mouth']
    if kind == 'smile':      # little "w" smile under the nose
        return path(f'M{f(mx)},{f(my)} L{f(mx)},{f(my + 5)} M{f(mx - 13)},{f(my + 4)} Q{f(mx - 6)},{f(my + 12)} {f(mx)},{f(my + 5)} '
                    f'Q{f(mx + 6)},{f(my + 12)} {f(mx + 13)},{f(my + 4)}', stroke(col, 3.4))
    if kind in ('talk', 'big', 'wide'):
        w, h = {'talk': (10, 13), 'big': (15, 15), 'wide': (17, 19)}[kind]
        top = my + 5
        d = (f'M{f(mx - w)},{f(top)} Q{f(mx)},{f(top + 3)} {f(mx + w)},{f(top)} '
             f'C{f(mx + w)},{f(top + h * 0.9)} {f(mx + w * 0.5)},{f(top + h)} {f(mx)},{f(top + h)} '
             f'C{f(mx - w * 0.5)},{f(top + h)} {f(mx - w)},{f(top + h * 0.9)} {f(mx - w)},{f(top)} Z')
        tongue = ell(mx, top + h - 1, w * 0.62, h * 0.42, f'fill="{PIP["tongue"]}"') + \
            path(f'M{f(mx)},{f(top + h - h * 0.32)} L{f(mx)},{f(top + h - 2)}', stroke(PIP['tongueLine'], 1.8))
        out = path(f'M{f(mx)},{f(my)} L{f(mx)},{f(top)}', stroke(col, 3.4))
        out += f'<clipPath id="{uid}">{path(d)}</clipPath>' + path(d, f'fill="{col}"')
        out += f'<g clip-path="url(#{uid})">{tongue}</g>' + path(d, stroke(col, 3))
        return out
    if kind == 'o':
        return (path(f'M{f(mx)},{f(my)} L{f(mx)},{f(my + 4)}', stroke(col, 3.2))
                + ell(mx, my + 10, 5.5, 6.5, f'fill="{col}"') + ell(mx, my + 13, 3.2, 2.4, f'fill="{PIP["tongue"]}"'))
    if kind == 'hmm':        # small sideways thinking mouth
        return path(f'M{f(mx)},{f(my)} L{f(mx)},{f(my + 4)} M{f(mx - 7)},{f(my + 8)} Q{f(mx + 2)},{f(my + 11)} {f(mx + 10)},{f(my + 5)}',
                    stroke(col, 3.4))
    return ''


def head(face, uid, ears=(8, 8), dx=0, cheek=0.55, ear_sc=1.0):
    """face = svg for eyes + brows + mouth; dx shifts the face toward +x (head turned)."""
    g = ''
    # head base + cel shade (clip to head; shade fill, then base fill shifted up-left)
    g += head_shape(filled(PIP['fill'], PIP['line']))
    g += (f'<g clip-path="url(#{uid}h)">' + f'<rect x="50" y="12" width="160" height="136" fill="{PIP["shade"]}"/>'
          + '<g transform="translate(-7,-8)">' + head_shape(f'fill="{PIP["fill"]}"') + '</g>'
          # light forehead blaze (Pip's own marking)
          + ell(128 + dx * 0.6, 46, 11, 20, f'fill="{PIP["hi"]}" opacity="0.75"')
          + '</g>')
    g += head_shape(stroke(PIP['line'], LW))
    # soft highlight upper-left
    g += ell(92, 42, 20, 9, f'fill="#FFFFFF" opacity="0.28" transform="rotate(-24 92 42)"')
    # muzzle
    mx, my, mrx, mry = MUZZLE
    mx += dx
    g += ell(mx, my, mrx, mry, f'fill="{PIP["light"]}" stroke="{PIP["lightLine"]}" stroke-width="2.4"')
    g += ell(mx + 6, my + 9, mrx - 12, mry - 15, f'fill="{PIP["lightShade"]}" opacity="0.8"')
    # cheeks
    for i, (cx, cy) in enumerate(CHEEKS):
        cx += dx * (0.6 if i == 0 else 1.0)
        g += ell(cx, cy, 10, 6.5, f'fill="{PIP["cheek"]}" opacity="{f(cheek)}"')
    # muzzle freckles
    for fx, fy in ((-17, -6), (-21, 1), (17, -6), (21, 1)):
        g += circ(mx + fx, my + fy, 1.5, f'fill="{PIP["lightLine"]}"')
    g += nose(dx)
    g += face
    # ears last so they overlap the head edge (flop down at the sides)
    g += ear(-1, ears[0], ear_sc) + ear(1, ears[1], ear_sc)
    return g


def tail(ang=0):
    """Short wavy tail on Pip's left side, behind the body. ang rotates it (negative = up)."""
    d = 'M0,0 C-10,-6 -22,-14 -28,-30 C-31,-38 -40,-38 -40,-30 C-38,-12 -22,6 -2,12 Z'
    g = path(d, filled(PIP['fill'], PIP['line']))
    g += path('M-36,-28 C-34,-16 -24,-4 -8,4', stroke(PIP['shade'], 3.4))
    g += ell(-36, -32, 4.5, 5, f'fill="{PIP["light"]}"')   # light tail tip
    return f'<g transform="translate(88,206) rotate({f(ang)})">{g}</g>'


def foot(cx, cy, ang=0):
    t = f' transform="rotate({f(ang)} {f(cx)} {f(cy)})"' if ang else ''
    g = ell(cx, cy, 19, 8, filled(PIP['light'], PIP['lightLine'], 3.4))
    g += path(f'M{f(cx - 5)},{f(cy - 7)} L{f(cx - 5)},{f(cy - 2)} M{f(cx + 5)},{f(cy - 7)} L{f(cx + 5)},{f(cy - 2)}', stroke(PIP['lightLine'], 2.4))
    return f'<g{t}>{g}</g>'


def leg(hip, foot_xy, ang=0):
    hx, hy = hip
    fx, fy = foot_xy
    d = f'M{f(hx)},{f(hy)} Q{f((hx + fx) / 2)},{f((hy + fy) / 2 + 2)} {f(fx)},{f(fy - 4)}'
    return (path(d, stroke(PIP['line'], 22 + 2 * LW)) + path(d, stroke(PIP['shade'], 22))
            + foot(fx, fy, ang))


def body(uid):
    bx, by, brx, bry = BODY
    g = ell(bx, by, brx, bry, filled(PIP['fill'], PIP['line']))
    g += (f'<g clip-path="url(#{uid}b)">' + f'<rect x="70" y="140" width="120" height="110" fill="{PIP["shade"]}"/>'
          + ell(bx - 6, by - 7, brx, bry, f'fill="{PIP["fill"]}"')
          + ell(*BELLY, f'fill="{PIP["lightShade"]}"')
          + ell(BELLY[0] - 3, BELLY[1] - 5, BELLY[2] - 2, BELLY[3] - 3, f'fill="{PIP["light"]}"')
          + '</g>')
    g += ell(bx, by, brx, bry, stroke(PIP['line'], LW))
    return g


def collar():
    d = 'M86,134 Q128,162 170,134'
    g = path(d, stroke(PIP['collarDk'], 13)) + path(d, stroke(PIP['collar'], 8))
    g += path('M98,142 Q128,158 158,142', stroke('#FFFFFF', 2) + ' opacity="0.45"')
    g += circ(128, 157, 6.5, filled(PIP['tag'], PIP['tagLine'], 2.4)) + circ(126, 155, 1.8, 'fill="#FFFFFF"')
    return g


def arms_and_paws():
    g = ''
    for (px, py), (sx, sy) in zip(PAWS, ((104, 172), (152, 172))):
        d = f'M{f(sx)},{f(sy)} Q{f((sx + px) / 2)},{f(py + 10)} {f(px)},{f(py + 2)}'
        g += path(d, stroke(PIP['line'], 18 + 2 * LW)) + path(d, stroke(PIP['fill'], 18))
    for px, py in PAWS:
        g += ell(px, py, 15, 13, filled(PIP['light'], PIP['lightLine'], 3.4))
        g += path(f'M{f(px - 5)},{f(py - 12)} L{f(px - 5)},{f(py - 6)} M{f(px + 5)},{f(py - 12)} L{f(px + 5)},{f(py - 6)}', stroke(PIP['lightLine'], 2.4))
        g += ell(px - 5, py + 2, 5, 3, 'fill="#FFFFFF" opacity="0.5"')
    return g


def pup_svg(name, pose):
    uid = 'p' + name[:2]
    defs = f'<clipPath id="{uid}h">{head_shape()}</clipPath><clipPath id="{uid}b">{ell(*BODY)}</clipPath>'
    dx = pose.get('dx', 0)
    g = tail(pose.get('tail', 0))
    feet = pose.get('feet', FEET_IDLE)
    fang = pose.get('footAng', (0, 0))
    g += leg(HIPS[0], feet[0], fang[0]) + leg(HIPS[1], feet[1], fang[1])
    g += body(uid)
    g += collar()
    g += arms_and_paws()
    h = head(pose['face'], uid, pose.get('ears', (8, 8)), dx, pose.get('cheek', 0.55), pose.get('earSc', 1.0))
    if pose.get('tilt'):
        h = f'<g transform="rotate({f(pose["tilt"])} {NECK[0]} {NECK[1]})">{h}</g>'
    g += f'<g transform="translate(0,{HEAD_LIFT})">{h}</g>'   # head sits a little high so more face clears the basket
    return svg(256, 256, g, defs)


def face(eyes, mouth_kind, brow='', dx=0, uid='m'):
    return eyes + brow + mouth(mouth_kind, dx, uid)


POSES = {
    'idle':  dict(face=face(eyes_open(), 'smile')),
    'blink': dict(face=face(eyes_closed('blink'), 'smile')),
    'talk':  dict(face=face(eyes_open(), 'talk', uid='mta')),
    'happy': dict(face=face(eyes_closed('happy'), 'big', uid='mha'), ears=(46, 46), tail=-38, cheek=0.8),
    'cheer': dict(face=face(eyes_sparkle(), 'wide', uid='mch'), ears=(70, 70), earSc=0.84, tail=-52, cheek=0.85),
    'think': dict(face=face(eyes_open(look=(4, -5)), 'hmm', brows(1, 2)), tilt=-8, ears=(10, 22)),
    'oops':  dict(face=face(eyes_open(look=(0, 1), wide=1.06), 'o', brows(6, -1)), ears=(3, 44)),
    'run1':  dict(face=face(eyes_open(look=(2, 0), dx=11), 'big', dx=11, uid='mr1'), dx=11, ears=(18, 34), tail=-30,
                  feet=((82, 234), (176, 228)), footAng=(-14, 16)),
    'run2':  dict(face=face(eyes_open(look=(2, 0), dx=11), 'big', dx=11, uid='mr2'), dx=11, ears=(28, 44), tail=-18,
                  feet=((116, 230), (144, 238)), footAng=(10, -6)),
}


def gen_pup():
    for name, pose in POSES.items():
        write(f'characters/pup_{name}.svg', pup_svg(name, pose))


# ======================================================================= BASKET
RIM = (128, 40, 112, 26)       # rim ellipse in basket viewBox (0 0 256 160)
BOTTOM = (128, 128, 86, 22)    # bottom ellipse -> lowest point y 150


def rim_pt(t, e=RIM):
    """Point on an ellipse at angle t (0 = right, pi/2 = front/bottom)."""
    cx, cy, rx, ry = e
    return cx + rx * math.cos(t), cy + ry * math.sin(t)


def arc_d(e, t0, t1, n=40, move=True):
    pts = [rim_pt(t0 + (t1 - t0) * i / n, e) for i in range(n + 1)]
    return ('M' if move else 'L') + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts)


def wall_d():
    """Front wall: front half of the rim ellipse, sides down to the front half of the bottom ellipse."""
    return arc_d(RIM, 0, math.pi) + ' ' + arc_d(BOTTOM, math.pi, 0, move=False) + ' Z'


def wall_point(u, v):
    """Map (u: -1..1 across the front, v: 0 at rim .. 1 at bottom) onto the curved front wall."""
    t = math.acos(max(-1, min(1, u)))           # angle on the front half
    x0, y0 = rim_pt(t, RIM)
    x1, y1 = rim_pt(t, BOTTOM)
    # slight outward belly on the wall (rounder basket)
    bulge = math.sin(v * math.pi) * 7 * (1 if x0 >= 128 else -1) * abs(u) ** 0.8
    return x0 + (x1 - x0) * v + bulge, y0 + (y1 - y0) * v


def weave(rows, cols, v0, v1, fill, gap, hi, rnd):
    """Brick-offset wicker weavers on the curved wall between v0 and v1."""
    out = ''
    for r in range(rows):
        va = v0 + (v1 - v0) * r / rows
        vb = v0 + (v1 - v0) * (r + 1) / rows
        off = 0.5 if r % 2 else 0.0
        for c in range(-1, cols + 1):
            ua = -1 + 2 * (c + off) / cols
            ub = -1 + 2 * (c + off + 1) / cols
            ua, ub = max(-1, ua), min(1, ub)
            if ub <= ua:
                continue
            # inset a little so the dark gaps show (stakes between weavers)
            pad_u = 0.012 + 0.0
            pad_v = (vb - va) * 0.12
            q = [wall_point(ua + pad_u, va + pad_v), wall_point(ub - pad_u, va + pad_v),
                 wall_point(ub - pad_u, vb - pad_v), wall_point(ua + pad_u, vb - pad_v)]
            mid_t = wall_point((ua + ub) / 2, va + pad_v * 0.2)
            mid_b = wall_point((ua + ub) / 2, vb - pad_v * 0.2)
            d = (f'M{f(q[0][0])},{f(q[0][1])} Q{f(mid_t[0])},{f(mid_t[1] - 1.5)} {f(q[1][0])},{f(q[1][1])} '
                 f'L{f(q[2][0])},{f(q[2][1])} Q{f(mid_b[0])},{f(mid_b[1] + 1.5)} {f(q[3][0])},{f(q[3][1])} Z')
            col = fill if rnd.random() > 0.18 else mix(fill, gap, 0.18)
            out += path(d, f'fill="{col}" stroke="{gap}" stroke-width="1.4" stroke-linejoin="round"')
            # highlight on the upper edge of each weaver
            h0 = wall_point(ua + 0.05, va + pad_v * 1.8)
            h1 = wall_point(ub - 0.05, va + pad_v * 1.8)
            hm = wall_point((ua + ub) / 2, va + pad_v * 1.4)
            out += path(f'M{f(h0[0])},{f(h0[1])} Q{f(hm[0])},{f(hm[1] - 1)} {f(h1[0])},{f(h1[1])}', stroke(hi, 1.6) + ' opacity="0.75"')
    return out


def braid(e, t0, t1, n, width, fill, dark, line, hi):
    """Rolled, braided rim band along part of an ellipse."""
    d = arc_d(e, t0, t1)
    out = path(d, stroke(line, width + 2 * 3.2)) + path(d, stroke(fill, width))
    for i in range(n + 1):
        t = t0 + (t1 - t0) * (i + 0.5) / (n + 1)
        x, y = rim_pt(t, e)
        # tangent direction
        tx, ty = -e[2] * math.sin(t), e[3] * math.cos(t)
        L = math.hypot(tx, ty) or 1
        tx, ty = tx / L, ty / L
        nx, ny = -ty, tx
        a = (x - tx * 4 - nx * width * 0.42, y - ty * 4 - ny * width * 0.42)
        b = (x + tx * 4 + nx * width * 0.42, y + ty * 4 + ny * width * 0.42)
        out += path(f'M{f(a[0])},{f(a[1])} Q{f(x + nx * 2)},{f(y + ny * 2 - 1)} {f(b[0])},{f(b[1])}', stroke(dark, 2.2))
        out += path(f'M{f(a[0] + tx * 2.5)},{f(a[1] + ty * 2.5 - 1.2)} L{f(x + tx * 3)},{f(y + ty * 3 - 1.5)}', stroke(hi, 1.6) + ' opacity="0.8"')
    return out


def handle(side):
    """Small loop handle stub at the rim side."""
    x = 14 if side < 0 else 242
    s = -1 if side < 0 else 1
    d = f'M{f(x - s * 6)},{f(32)} C{f(x + s * 14)},{f(26)} {f(x + s * 16)},{f(58)} {f(x - s * 4)},{f(56)}'
    return path(d, stroke(BASKET['line'], 9 + 6.4)) + path(d, stroke(BASKET['fill'], 9)) + \
        path(d, stroke(BASKET['weave'], 2) + ' stroke-dasharray="3 4"')


def gen_basket():
    rnd = random.Random(23)
    cx, cy, rx, ry = RIM
    # ---------------- back: inner far wall + dark inside + back half of the rim
    defs = f'<clipPath id="bki"><ellipse cx="{cx}" cy="{cy}" rx="{rx - 3}" ry="{ry - 2}"/></clipPath>'
    g = handle(-1) + handle(1)
    g += ell(cx, cy, rx, ry, f'fill="{BASKET["deep"]}"')
    g += '<g clip-path="url(#bki)">'
    # inner far wall (lit, upper part of the opening) with faint weave rows
    g += ell(cx, cy - 9, rx - 6, ry - 6, f'fill="{BASKET["inner"]}"')
    for k in range(4):
        y = cy - 22 + k * 6.5
        g += path(f'M{cx - rx},{f(y + 8)} Q{cx},{f(y - 8)} {cx + rx},{f(y + 8)}', stroke(BASKET['deep'], 1.6) + ' opacity="0.55"')
    for k in range(-9, 10):
        x = cx + k * 11.5
        g += path(f'M{f(x)},{f(cy - 28)} L{f(x + k * 0.6)},{f(cy - 4)}', stroke(BASKET['deep'], 1.4) + ' opacity="0.4"')
    # dark inner shadow at the bottom/front of the opening (the floor is hidden by the front wall)
    g += ell(cx, cy + 14, rx - 4, ry - 6, f'fill="{BASKET["shadow"]}" opacity="0.85"')
    g += '</g>'
    # back half of the rolled rim (top arc)
    g += braid(RIM, math.pi, 2 * math.pi, 20, 11, BASKET['fill'], BASKET['weave'], BASKET['line'], BASKET['hi'])
    write('items/basket_back.svg', svg(256, 160, g, defs))

    # ---------------- front: front wall + front half of the rim (drawn over the items)
    W = wall_d()
    defs = f'<clipPath id="bkf">{path(W)}</clipPath>'
    g = path(W, f'fill="{BASKET["weave"]}"')
    g += '<g clip-path="url(#bkf)">'
    g += weave(6, 12, 0.08, 1.0, BASKET['fill'], BASKET['weave'], BASKET['hi'], rnd)
    # cel shading: darker band low/right, soft light upper-left
    g += path('M256,30 C254,90 230,150 128,160 L256,160 Z', f'fill="{BASKET["line"]}" opacity="0.28"')
    g += path(f'M0,40 L0,160 C40,150 60,120 56,64 Z', f'fill="{BASKET["line"]}" opacity="0.12"')
    # base band near the bottom
    g += path(arc_d(BOTTOM, math.pi * 0.98, math.pi * 0.02), stroke(BASKET['line'], 6) + ' opacity="0.45"')
    g += '</g>'
    g += path(W, f'fill="none" stroke="{BASKET["line"]}" stroke-width="{LW}" stroke-linejoin="round"')
    # front half of the rolled rim
    g += braid(RIM, 0, math.pi, 22, 13, BASKET['fill'], BASKET['weave'], BASKET['line'], BASKET['hi'])
    write('items/basket_front.svg', svg(256, 160, g, defs))


# ======================================================================= BALLS
def ball_svg(key):
    fill, dark = PALETTE[key]
    plain = key == 'cream'
    shade = mix(fill, dark, 0.42 if not plain else 0.28)
    stripe = mix(fill, '#FFFFFF', 0.5 if key not in ('yellow',) else 0.62)
    cid = 'bc' + key[:3]
    defs = f'<clipPath id="{cid}"><circle cx="64" cy="64" r="52"/></clipPath>'
    g = circ(64, 64, 52, f'fill="{fill}"')
    g += f'<g clip-path="url(#{cid})">'
    # cel shade: lower-right crescent
    g += circ(64, 64, 52, f'fill="{shade}"') + circ(57, 57, 52, f'fill="{fill}"')
    if not plain:
        # ONE lighter curved stripe band across the ball (like a soft toy ball seam band)
        band = ('M-4,58 C24,40 62,44 96,64 C112,73 124,84 132,96 L132,118 C120,104 106,94 90,86 '
                'C58,68 24,66 -4,82 Z')
        g += path(band, f'fill="{stripe}"')
        g += path(band, f'fill="none" stroke="{mix(fill, dark, 0.25)}" stroke-width="2.2" opacity="0.6"')
        # seam where the band meets the shade
        g += path('M100,108 C108,112 116,118 122,124', stroke(mix(stripe, dark, 0.3), 2) + ' opacity="0.5"')
    else:
        # plain ball: faint thin stripe at the edge only (centre stays clear for the letter / number)
        g += path('M24,104 C46,122 86,124 108,102', stroke('#E9D3A8', 3.2))
    g += '</g>'
    # highlight upper-left + small dot
    g += ell(42, 38, 13, 7.5, f'fill="#FFFFFF" opacity="{0.6 if not plain else 0.75}" transform="rotate(-38 42 38)"')
    g += circ(30, 56, 3.4, 'fill="#FFFFFF" opacity="0.55"')
    g += circ(64, 64, 52, f'fill="none" stroke="{dark}" stroke-width="{LW}"')
    return svg(128, 128, g, defs)


def gen_balls():
    for key in ('red', 'blue', 'yellow', 'green', 'orange', 'purple'):
        write(f'items/ball_{key}.svg', ball_svg(key))
    write('items/ball_plain.svg', ball_svg('cream'))


# ======================================================================= BUBBLE
def bubble_body(cx=64, cy=64, r=58, uid='bb'):
    defs = (f'<radialGradient id="{uid}f" cx="0.5" cy="0.5" r="0.5">'
            '<stop offset="0.62" stop-color="#FFFFFF" stop-opacity="0"/>'
            '<stop offset="0.84" stop-color="#DFF6FF" stop-opacity="0.28"/>'
            '<stop offset="1" stop-color="#FFFFFF" stop-opacity="0.7"/></radialGradient>'
            f'<linearGradient id="{uid}r" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.35" stop-color="#C8F1FF"/>'
            '<stop offset="0.65" stop-color="#FFD6EC"/><stop offset="1" stop-color="#E8FFF6"/></linearGradient>')
    g = circ(cx, cy, r, f'fill="url(#{uid}f)"')
    # faint iridescent tint swirls near the rim
    g += path(f'M{f(cx + r * 0.2)},{f(cy + r * 0.92)} A{f(r * 0.93)},{f(r * 0.93)} 0 0 0 {f(cx + r * 0.92)},{f(cy + r * 0.12)}',
              stroke('#FFC8E6', r * 0.09) + ' opacity="0.35"')
    g += path(f'M{f(cx - r * 0.9)},{f(cy + r * 0.3)} A{f(r * 0.92)},{f(r * 0.92)} 0 0 0 {f(cx - r * 0.2)},{f(cy + r * 0.9)}',
              stroke('#BDEBFF', r * 0.08) + ' opacity="0.35"')
    g += circ(cx, cy, r - 1.5, f'fill="none" stroke="url(#{uid}r)" stroke-width="{f(r * 0.07)}"')
    # big curved highlight upper-left + small dot
    g += path(f'M{f(cx - r * 0.72)},{f(cy - r * 0.08)} A{f(r * 0.74)},{f(r * 0.74)} 0 0 1 {f(cx - r * 0.12)},{f(cy - r * 0.72)}',
              stroke('#FFFFFF', r * 0.12) + ' opacity="0.85"')
    g += circ(cx + r * 0.5, cy + r * 0.52, r * 0.065, 'fill="#FFFFFF" opacity="0.8"')
    g += circ(cx - r * 0.02, cy - r * 0.62, r * 0.06, 'fill="#FFFFFF" opacity="0.9"')
    return defs, g


def gen_bubble():
    defs, g = bubble_body()
    write('items/bubble.svg', svg(128, 128, g, defs))


# ======================================================================= ICON
def gen_icon():
    defs = ('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#8FD3FF"/><stop offset="1" stop-color="#E3F6FF"/></linearGradient>'
            f'<clipPath id="pih">{head_shape()}</clipPath><clipPath id="pib">{ell(*BODY)}</clipPath>'
            '<clipPath id="bcred"><circle cx="64" cy="64" r="52"/></clipPath>')
    g = '<rect width="512" height="512" fill="url(#sky)"/>'
    g += path('M36,118 q16,-28 46,-14 q22,-24 50,0 q22,0 20,20 l-110,0 q-18,-2 -6,-6 Z', 'fill="#FFFFFF" opacity="0.9"')
    g += path('M0,392 C130,352 300,362 512,384 L512,512 L0,512 Z', 'fill="#A9CC7A"')
    g += path('M0,436 C160,410 340,418 512,438 L512,512 L0,512 Z', 'fill="#8DBB6A"')
    for x, y, c in ((60, 420, '#FFC7D9'), (452, 432, '#FFF0A8'), (410, 470, '#D9C8FF'), (96, 474, '#FFFFFF')):
        for k in range(5):
            a = k * 1.2566
            g += circ(x + 7 * math.cos(a), y + 7 * math.sin(a), 6, f'fill="{c}"')
        g += circ(x, y, 4.5, 'fill="#F5B83D"')
    # Pip: big face, body runs off the bottom edge
    face_ = face(eyes_open(look=(3, -2)), 'big', uid='mic')
    pip = tail(-36) + body('pi') + collar() + head(face_, 'pi', (40, 40), 0, 0.8)
    g += f'<g transform="translate(-40,76) scale(2.0)">{pip}</g>'
    # bubble with a red ball, upper right
    ball = ball_svg('red')
    ball_inner = ball[ball.index('</defs>') + 7:ball.rindex('</svg>')]
    bdefs, bub = bubble_body(64, 64, 58, 'ib')
    defs += bdefs
    g += f'<g transform="translate(318,40) scale(1.45)">' \
         f'<g transform="translate(64,64) scale(0.74) translate(-64,-64)">{ball_inner}</g>{bub}</g>'
    write('icon.svg', svg(512, 512, g, defs))


if __name__ == '__main__':
    gen_pup()
    gen_basket()
    gen_balls()
    gen_bubble()
    gen_icon()
    print('wrote art to', OUT)
