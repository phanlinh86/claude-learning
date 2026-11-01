#!/usr/bin/env python3
"""Character / item / UI art generator for Mầm's Treasure Reef (character artist A).

Writes (relative to game/assets/default/):
  characters/tutu_{idle,blink,talk,happy,cheer,think,oops,dance_a,dance_b}.svg
        0 0 256 256, feet anchor (128,244), ¾ view facing RIGHT. Same body in every frame; only the
        face, the front flippers, a hop (happy/cheer), a head tilt (think) or a lean (dance) change.
  items/shell_{red,blue,yellow,green,orange,purple}.svg   0 0 128 128, scallop point down, centre (64,66), 96 w x 92 h
  items/pearl.svg, items/tag.svg                          0 0 128 128 (tag: plain centre x 30-98 / y 40-108)
  items/mound.svg, items/mound_hole.svg                   0 0 160 96, base y 92, mound crest y 30 (x 64..96 flat)
  items/chest_back.svg / chest_front.svg                  0 0 256 200, opening centre (128,54)
  items/long_back.svg / long_front.svg                    0 0 512 200, opening line y 60
  items/sign.svg                                          0 0 128 112, blank board x 12-116 / y 10-78, stake bottom (64,112)
  ui/star.svg, ui/star_empty.svg, ui/pearl_icon.svg, ui/lock.svg   0 0 64 64
  ui/trophy_{bronze,silver,gold}.svg                      0 0 128 128
  ui/lagoon_{1..6}.svg                                    0 0 160 160 round sticker badges
  avatars/{turtle,crab,octopus,seahorse,clownfish,dolphin}.svg   0 0 128 128 round sticker faces
  icon.svg                                                0 0 512 512, full bleed, opaque

Usage: python3 tools/art_tutu.py [outDir]
Rules (docs/DESIGN.md §3): 100% original art, flat cartoon, ~4 px outline in a darker tone of the fill,
one-step cel shade lower-right + one soft highlight upper-left, no <text>/fonts/scripts/filters/external
refs, width/height = viewBox. Deterministic (re-running gives byte-identical files).
"""
import math
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md §3)
PALETTE = {
    'red':    ('#E84A4A', '#A8282E'),
    'blue':   ('#3C8DE8', '#1F5BA8'),
    'yellow': ('#FFD23F', '#C99A12'),
    'green':  ('#4CC26B', '#2A8343'),
    'orange': ('#FF9A2E', '#C4650C'),
    'purple': ('#9B6BE0', '#6840A8'),
    'cream':  ('#FFF4DC', '#C9A877'),
}
T = {  # Tutu
    'skin': '#E3CC9A', 'skinSh': '#C4A86F', 'skinHi': '#F3E4BE', 'line': '#6B4A2E',
    'shell': '#8E5B3A', 'shellSh': '#6B3F24', 'plate': '#E8C27A', 'plateSh': '#CFA55A', 'plateLine': '#6B3F24',
    'belly': '#F6E9CF', 'bellySh': '#E6D3AC',
    'eye': '#3A2E2A', 'iris': '#5B8F7A', 'irisDk': '#3F6B5A', 'white': '#FFFFFF',
    'cheek': '#F7B6C2', 'mouth': '#7E3A4C', 'tongue': '#F59AAE',
    'band': '#5FD3B4', 'bandDk': '#2E8C78', 'bandHi': '#A8EEDB',
}
CH = {'wood': '#8A5A33', 'woodSh': '#6B4224', 'woodHi': '#A8744A', 'brass': '#D9A441', 'brassDk': '#A5751F',
      'brassHi': '#F0CC7A', 'line': '#4E2E16', 'inner': '#3B2414', 'innerLt': '#5A3820'}
SAND = {'fill': '#F6E6BF', 'shade': '#D6BC82', 'line': '#A88C55', 'speck': '#C9AC73', 'hi': '#FBF1D6', 'dark': '#B8975C'}
DRIFT = {'fill': '#CDB48C', 'shade': '#B2976C', 'line': '#7E6342', 'board': '#EFDCB8', 'boardSh': '#DCC49A'}
STICKER = '#FFFFFF'
SHADOW = '#1D3A5E'
LW = 4.2


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


def fa(col):
    return f'fill="{col}"'


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


def shaded_ellipse(uid, e, fill, shade, line, lw=LW, off=(-8, -7), hi=None):
    """Ellipse with one-step cel shade (lower-right crescent) and outline. Returns (defs, body)."""
    cx, cy, rx, ry = e
    defs = f'<clipPath id="{uid}">{ell(*e)}</clipPath>'
    g = ell(*e, f'fill="{shade}"')
    g += f'<g clip-path="url(#{uid})">' + ell(cx + off[0], cy + off[1], rx, ry, f'fill="{fill}"') + '</g>'
    g += ell(*e, f'fill="none" stroke="{line}" stroke-width="{f(lw)}"')
    if hi:
        g += ell(cx - rx * 0.45, cy - ry * 0.5, rx * 0.22, ry * 0.12, f'fill="#FFFFFF" opacity="{f(hi)}" transform="rotate(-35 {f(cx - rx * 0.45)} {f(cy - ry * 0.5)})"')
    return defs, g


def sticker(uid, r, cx, cy, inner, border=6, shadow=True):
    """Round sticker: faint drop shadow, white border, then the content clipped to the inner circle."""
    g = ''
    if shadow:
        g += circ(cx, cy + 3, r + border, f'fill="{SHADOW}" opacity="0.18"')
    g += circ(cx, cy, r + border, f'fill="{STICKER}"')
    g += f'<g clip-path="url(#{uid})">{inner}</g>'
    return f'<clipPath id="{uid}">{circ(cx, cy, r)}</clipPath>', g


# ======================================================================= TUTU
HEAD = (140, 106, 48)             # big round head, x 92-188, y 58-154
SNOUT = (180, 120, 15, 12)        # little beak bump on the right (facing right)
BODY = (134, 192, 46, 42)         # torso, y 150-234
SHELL = (104, 178, 60, 56)        # carapace behind the torso, visible as a crescent on the left + top
BELLY = (138, 200, 32, 30)
NECK = (140, 150)                 # head tilt pivot
EYE_N = (124, 104, 16.5)          # near eye (viewer's left)
EYE_F = (166, 102, 13)            # far eye, a bit smaller (¾ view)
MOUTH = (166, 130)
CHEEKS = ((104, 126, 11, 7), (184, 134, 7.5, 5))
SHOULDER_N = (98, 164)
SHOULDER_F = (170, 158)
FLIPPER = ('M0,-6 C-13,-2 -22,22 -20,46 C-19,62 -10,75 2,75 C14,75 20,63 18,46 C16,22 10,-2 0,-6 Z')
FLIPPER_TIP = (1, 75)
HIND = ((104, 236, 24, 9, -8), (152, 237, 22, 8, 10))
FEET_Y = 244
HEAD_SPOTS = ((112, 76, 4.5), (150, 68, 4), (98, 98, 3.2), (178, 90, 3.4), (132, 60, 2.6), (158, 150, 3), (110, 140, 2.6))


def eye_open(e, look=(0, 0), wide=1.0):
    cx, cy, r = e
    r *= wide
    g = circ(cx, cy, r, filled(T['white'], T['line'], 3.2))
    ix, iy = cx + look[0], cy + look[1]
    g += circ(ix, iy, r * 0.72, f'fill="{T["iris"]}"')
    g += circ(ix, iy + r * 0.1, r * 0.72, f'fill="none" stroke="{T["irisDk"]}" stroke-width="{f(r * 0.1)}" opacity="0.5"')
    pr = r * 0.5
    g += circ(ix, iy, pr, f'fill="{T["eye"]}"')
    g += circ(ix - pr * 0.4, iy - pr * 0.42, pr * 0.46, f'fill="{T["white"]}"')
    g += circ(ix + pr * 0.45, iy + pr * 0.45, pr * 0.2, f'fill="{T["white"]}"')
    return g


def eye_closed(e, kind):
    cx, cy, r = e
    w = r * 0.86
    if kind == 'happy':
        d = f'M{f(cx - w)},{f(cy + 5)} Q{f(cx)},{f(cy - 15)} {f(cx + w)},{f(cy + 5)}'
        return path(d, stroke(T['eye'], 5.4))
    d = f'M{f(cx - w)},{f(cy + 2)} Q{f(cx)},{f(cy - 8)} {f(cx + w)},{f(cy + 2)}'
    return path(d, stroke(T['eye'], 4.6))


def eye_star(e):
    cx, cy, r = e
    g = circ(cx, cy, r, filled(T['white'], T['line'], 3.2))
    g += circ(cx, cy, r * 0.72, f'fill="{T["iris"]}"')
    g += path(star_path(cx, cy + 1, r * 0.8, r * 0.38), f'fill="{T["eye"]}" stroke="{T["eye"]}" stroke-width="2" stroke-linejoin="round"')
    g += circ(cx - r * 0.2, cy - r * 0.14, r * 0.17, f'fill="{T["white"]}"')
    g += circ(cx + r * 0.6, cy - r * 0.62, r * 0.13, f'fill="{T["white"]}"')
    return g


def brows(up=0, tilt=0):
    g = ''
    for (cx, cy, r), side in ((EYE_N, -1), (EYE_F, 1)):
        y = cy - r - 7 - up
        d = f'M{f(cx - 9)},{f(y + 3 + tilt * side)} Q{f(cx)},{f(y - 4)} {f(cx + 9)},{f(y + 3 - tilt * side)}'
        g += path(d, stroke(T['line'], 3.6) + ' opacity="0.85"')
    return g


def mouth(kind):
    mx, my = MOUTH
    if kind == 'closed':
        return path(f'M{f(mx - 14)},{f(my - 1)} Q{f(mx + 2)},{f(my + 13)} {f(mx + 18)},{f(my - 2)}', stroke(T['line'], 4))
    if kind == 'smile':
        d = f'M{f(mx - 13)},{f(my - 2)} Q{f(mx + 2)},{f(my + 16)} {f(mx + 17)},{f(my - 3)} Z'
        return path(d, filled(T['mouth'], T['line'], 3.4)) + ell(mx + 2, my + 7, 6, 3, f'fill="{T["tongue"]}"')
    if kind == 'talk':
        g = ell(mx + 2, my + 7, 11, 10, filled(T['mouth'], T['line'], 3.4))
        g += ell(mx + 2, my + 12, 6.5, 3.6, f'fill="{T["tongue"]}"')
        return g
    if kind == 'o':
        g = ell(mx + 2, my + 5, 6, 6.5, filled(T['mouth'], T['line'], 3))
        g += ell(mx + 2, my + 7.5, 3.4, 2.2, f'fill="{T["tongue"]}"')
        return g
    return ''


def flipper(side, ang, sc=1.0, uid='fl'):
    sx, sy = SHOULDER_N if side < 0 else SHOULDER_F
    t = f'transform="translate({sx},{sy}) scale({f(sc)},{f(sc)}) rotate({f(ang)})"'
    g = path(FLIPPER, f'fill="{T["skin"]}"')
    g += f'<g clip-path="url(#{uid})">'
    g += path('M-30,10 C-20,40 -4,70 20,80 L40,80 L40,-10 C22,16 10,34 -30,10 Z', f'fill="{T["skinSh"]}"')
    g += '</g>'
    g += path(FLIPPER, stroke(T['line'], LW))
    g += circ(-6, 30, 3.2, f'fill="{T["skinSh"]}"') + circ(4, 48, 2.6, f'fill="{T["skinSh"]}"') + circ(-8, 52, 2.2, f'fill="{T["skinSh"]}"')
    g += ell(-8, 14, 3.5, 8, 'fill="#FFFFFF" opacity="0.55" transform="rotate(12 -8 14)"')
    return f'<g {t}>{g}</g>'


def flipper_angle_to(side, target):
    sx, sy = SHOULDER_N if side < 0 else SHOULDER_F
    tx, ty = target[0] - sx, target[1] - sy
    base = math.degrees(math.atan2(FLIPPER_TIP[1], FLIPPER_TIP[0]))
    want = math.degrees(math.atan2(ty, tx))
    sc = math.hypot(tx, ty) / math.hypot(*FLIPPER_TIP)
    return want - base, sc


def hex_plate(cx, cy, r, rot, fill, line, lw=3):
    pts = []
    for i in range(6):
        a = math.radians(rot + i * 60)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d = 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'
    return path(d, filled(fill, line, lw))


def shell(uid):
    cx, cy, rx, ry = SHELL
    defs = f'<clipPath id="{uid}">{ell(*SHELL)}</clipPath>'
    g = ell(*SHELL, f'fill="{T["shellSh"]}"')
    g += f'<g clip-path="url(#{uid})">'
    g += ell(cx - 7, cy - 7, rx, ry, f'fill="{T["shell"]}"')
    # rim band (lighter ring just inside the edge)
    g += ell(cx, cy, rx - 7, ry - 7, f'fill="none" stroke="{mix(T["shell"], T["plate"], 0.35)}" stroke-width="7" opacity="0.8"')
    # big central plates + a ring of smaller ones
    g += hex_plate(cx - 2, cy - 4, 20, 0, T['plate'], T['plateLine'])
    for ang, r, pr in ((150, 36, 13), (195, 37, 13), (240, 36, 12.5), (285, 36, 12), (105, 36, 12), (60, 36, 12), (330, 36, 12), (15, 37, 12)):
        a = math.radians(ang)
        px, py = cx + r * math.cos(a) * 1.0, cy + r * math.sin(a) * 0.95
        g += hex_plate(px, py, pr, ang, T['plate'], T['plateLine'], 2.8)
    # shade on the lower-right of the plates
    g += ell(cx + 24, cy + 26, 40, 34, f'fill="{T["shellSh"]}" opacity="0.28"')
    g += '</g>'
    g += ell(*SHELL, f'fill="none" stroke="{T["line"]}" stroke-width="{f(LW)}"')
    g += ell(cx - 26, cy - 34, 7, 3.5, 'fill="#FFFFFF" opacity="0.5" transform="rotate(-40 78 144)"')
    return defs, g


def bandana(uid):
    hx, hy, hr = HEAD
    g = f'<g clip-path="url(#{uid})">'
    band = f'M{f(hx - hr - 4)},{f(hy - 12)} Q{f(hx)},{f(hy - 58)} {f(hx + hr + 4)},{f(hy - 20)}'
    g += path(band, stroke(T['bandDk'], 24))
    g += path(band, stroke(T['band'], 18.5))
    g += path(f'M{f(hx - hr)},{f(hy - 16)} Q{f(hx - 2)},{f(hy - 58)} {f(hx + hr)},{f(hy - 26)}', stroke(T['bandHi'], 3) + ' opacity="0.9"')
    # little lighter dots along the band
    for i in range(6):
        t = (i + 0.5) / 6
        x = hx - hr - 4 + (2 * hr + 8) * t
        y = (1 - t) ** 2 * (hy - 12) + 2 * (1 - t) * t * (hy - 58) + t * t * (hy - 20)
        g += circ(x, y + 2, 2.4, f'fill="{T["bandHi"]}" opacity="0.8"')
    g += '</g>'
    # knot at the back-left with two tails
    kx, ky = hx - hr + 4, hy - 22
    tail1 = f'M{f(kx)},{f(ky)} C{f(kx - 18)},{f(ky - 2)} {f(kx - 30)},{f(ky + 10)} {f(kx - 34)},{f(ky + 24)} C{f(kx - 24)},{f(ky + 18)} {f(kx - 14)},{f(ky + 14)} {f(kx - 2)},{f(ky + 10)} Z'
    tail2 = f'M{f(kx)},{f(ky + 2)} C{f(kx - 10)},{f(ky + 14)} {f(kx - 14)},{f(ky + 28)} {f(kx - 10)},{f(ky + 40)} C{f(kx - 2)},{f(ky + 30)} {f(kx + 4)},{f(ky + 20)} {f(kx + 6)},{f(ky + 10)} Z'
    g += path(tail1, filled(T['band'], T['bandDk'], 3.4)) + path(tail2, filled(T['band'], T['bandDk'], 3.4))
    g += path(f'M{f(kx - 6)},{f(ky + 6)} C{f(kx - 14)},{f(ky + 8)} {f(kx - 22)},{f(ky + 14)} {f(kx - 27)},{f(ky + 20)}', stroke(T['bandHi'], 2.2) + ' opacity="0.9"')
    g += ell(kx, ky + 2, 9, 7.5, filled(T['band'], T['bandDk'], 3.2))
    g += path(f'M{f(kx - 5)},{f(ky - 1)} Q{f(kx)},{f(ky - 4)} {f(kx + 5)},{f(ky - 1)}', stroke(T['bandHi'], 2.2))
    return g


def tutu_head(pose, uid):
    """Head only (skin, spots, snout, bandana, cheeks, face); clip id uid+'h' must exist."""
    hx, hy, hr = HEAD
    h = circ(hx, hy, hr, f'stroke="{T["line"]}" stroke-width="{f(2 * LW)}" fill="none"')
    h += ell(*SNOUT, f'stroke="{T["line"]}" stroke-width="{f(2 * LW)}" fill="none"')
    h += ell(*SNOUT, f'fill="{T["skin"]}"')
    h += ell(SNOUT[0] + 3, SNOUT[1] + 4, SNOUT[2] * 0.8, SNOUT[3] * 0.6, f'fill="{T["skinSh"]}" opacity="0.8"')
    h += circ(hx, hy, hr, f'fill="{T["skinSh"]}"')
    h += f'<g clip-path="url(#{uid}h)">' + circ(hx - 9, hy - 8, hr, f'fill="{T["skin"]}"')
    for sx, sy, sr in HEAD_SPOTS:
        h += circ(sx, sy, sr, f'fill="{T["skinSh"]}" opacity="0.75"')
    h += '</g>'
    h += circ(hx, hy, hr, f'fill="none" stroke="{T["line"]}" stroke-width="{f(LW * 0.8)}"')
    # cover the outline seam between the head and the snout
    h += ell(SNOUT[0] - 4, SNOUT[1] - 1, 9, 9, f'fill="{T["skin"]}"')
    h += circ(SNOUT[0] + 5, SNOUT[1] - 4, 1.8, f'fill="{T["line"]}" opacity="0.8"') + circ(SNOUT[0] + 11, SNOUT[1] - 2, 1.5, f'fill="{T["line"]}" opacity="0.8"')
    h += ell(hx - 22, hy - 28, 14, 6, 'fill="#FFFFFF" opacity="0.55" transform="rotate(-35 118 78)"')
    h += bandana(uid + 'h')
    for cx, cy, rx, ry in CHEEKS:
        h += ell(cx, cy, rx, ry, f'fill="{T["cheek"]}" opacity="{f(pose.get("cheek", 0.85))}"')
    h += pose['face']
    return h


def tutu_parts(pose, uid):
    """Returns (defs, body) of Tutu in the 256 box."""
    hx, hy, hr = HEAD
    head_e = (hx, hy, hr, hr)
    defs = (f'<clipPath id="{uid}h">{circ(hx, hy, hr)}</clipPath>'
            f'<clipPath id="{uid}b">{ell(*BODY)}</clipPath>'
            f'<clipPath id="{uid}f">{path(FLIPPER)}</clipPath>')
    tilt = pose.get('tilt', 0)
    ht = f' transform="rotate({f(tilt)} {NECK[0]} {NECK[1]})"' if tilt else ''
    fn, ff = pose.get('flippers', (22, -22))
    fsc = pose.get('flipSc', (1.0, 1.0))
    far_front = pose.get('farFront', False)

    g = ''
    if not far_front:
        g += flipper(1, ff, fsc[1], uid + 'f')
    # shell behind everything
    sd, sg = shell(uid + 's')
    defs += sd
    g += sg
    # hind flippers
    for cx, cy, rx, ry, rot in HIND:
        g += ell(cx, cy, rx, ry, filled(T['skin'], T['line']) + f' transform="rotate({rot} {cx} {cy})"')
        g += ell(cx + 4, cy + 3, rx * 0.7, ry * 0.45, f'fill="{T["skinSh"]}" opacity="0.7" transform="rotate({rot} {cx} {cy})"')
    # torso + belly
    g += ell(*BODY, f'fill="{T["skinSh"]}"')
    g += f'<g clip-path="url(#{uid}b)">' + ell(BODY[0] - 8, BODY[1] - 7, BODY[2], BODY[3], f'fill="{T["skin"]}"')
    bx, by, brx, bry = BELLY
    g += ell(bx, by, brx, bry, f'fill="{T["bellySh"]}"') + ell(bx - 4, by - 4, brx, bry, f'fill="{T["belly"]}"')
    g += ell(bx, by, brx, bry, f'fill="none" stroke="{T["skinSh"]}" stroke-width="3"')
    for yy in (-12, 2, 16):
        g += path(f'M{f(bx - brx + 6)},{f(by + yy)} Q{f(bx)},{f(by + yy + 4)} {f(bx + brx - 6)},{f(by + yy)}', stroke(T['bellySh'], 2.4) + ' opacity="0.9"')
    g += '</g>'
    g += ell(*BODY, f'fill="none" stroke="{T["line"]}" stroke-width="{f(LW)}"')
    # neck
    g += path(f'M{f(hx - 22)},{f(hy + 34)} Q{f(hx - 4)},{f(hy + 56)} {f(hx + 26)},{f(hy + 36)}', stroke(T['line'], LW + 8))
    g += path(f'M{f(hx - 22)},{f(hy + 34)} Q{f(hx - 4)},{f(hy + 56)} {f(hx + 26)},{f(hy + 36)}', stroke(T['skinSh'], LW + 2))
    g += path(f'M{f(hx - 22)},{f(hy + 32)} Q{f(hx - 4)},{f(hy + 52)} {f(hx + 26)},{f(hy + 34)}', stroke(T['skin'], LW))
    g += f'<g{ht}>{tutu_head(pose, uid)}</g>'
    g += flipper(-1, fn, fsc[0], uid + 'f')
    if far_front:
        g += flipper(1, ff, fsc[1], uid + 'f')
    dy = pose.get('dy', 0)
    lean = pose.get('lean', 0)
    if dy or lean:
        tr = ''
        if lean:
            tr += f'rotate({f(lean)} 128 {FEET_Y}) '
        if dy:
            tr += f'translate(0,{f(dy)})'
        g = f'<g transform="{tr.strip()}">{g}</g>'
    return defs, g


def face(eyes, mk, extra=''):
    return eyes + extra + mouth(mk)


def _think_pose():
    tilt = 7
    target = rot_pt(MOUTH[0] - 6, MOUTH[1] + 14, tilt, *NECK)
    ang, sc = flipper_angle_to(-1, target)
    return dict(face=face(eye_open(EYE_N, (4, -6)) + eye_open(EYE_F, (4, -6)), 'closed', brows(2, 2)),
                tilt=tilt, flippers=(ang, -18), flipSc=(sc, 1.0))


POSES = {
    'idle':    dict(face=face(eye_open(EYE_N, (3, 1)) + eye_open(EYE_F, (3, 1)), 'closed')),
    'blink':   dict(face=face(eye_closed(EYE_N, 'blink') + eye_closed(EYE_F, 'blink'), 'closed')),
    'talk':    dict(face=face(eye_open(EYE_N, (3, 1)) + eye_open(EYE_F, (3, 1)), 'talk')),
    'happy':   dict(face=face(eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy'), 'smile'),
                    flippers=(124, -124), dy=-8, cheek=1.0),
    'cheer':   dict(face=face(eye_star(EYE_N) + eye_star(EYE_F), 'talk'), flippers=(100, -100), dy=-12, cheek=1.0),
    'think':   _think_pose(),
    'oops':    dict(face=face(eye_open(EYE_N, (0, 0), 1.06) + eye_open(EYE_F, (0, 0), 1.06), 'o', brows(7, -1)),
                    flippers=(40, -36)),
    'dance_a': dict(face=face(eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy'), 'smile'),
                    flippers=(108, -136), lean=-9, cheek=1.0),
    'dance_b': dict(face=face(eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy'), 'smile'),
                    flippers=(136, -108), lean=9, cheek=1.0),
}


def gen_tutu():
    for name, pose in POSES.items():
        defs, g = tutu_parts(pose, 't' + name[:2] + name[-1])
        write(f'characters/tutu_{name}.svg', svg(256, 256, g, defs))


# ======================================================================= SHELLS
SH_HINGE = (64, 110)
SH_C = (64, 68)       # centre of the scalloped rim arc
SH_R = 48
SH_N = 7              # bumps


def scallop_d():
    """Fan shell: hinge point at the bottom, convex sides, scalloped top rim (7 bumps)."""
    hx, hy = SH_HINGE
    cx, cy = SH_C
    pts = []
    for i in range(SH_N + 1):
        a = math.pi + i * math.pi / SH_N          # from left (180°) over the top to right (360°)
        pts.append((cx + SH_R * math.cos(a), cy + SH_R * math.sin(a)))
    d = f'M{f(hx - 12)},{f(hy - 8)} C{f(hx - 36)},{f(hy - 18)} {f(pts[0][0] - 4)},{f(pts[0][1] + 24)} {f(pts[0][0])},{f(pts[0][1])} '
    for i in range(SH_N):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        dx, dy = mx - cx, my - cy
        n = math.hypot(dx, dy)
        bx, by = mx + dx / n * 11, my + dy / n * 11
        d += f'Q{f(bx)},{f(by)} {f(x1)},{f(y1)} '
    d += f'C{f(pts[-1][0] + 4)},{f(pts[-1][1] + 24)} {f(hx + 36)},{f(hy - 18)} {f(hx + 12)},{f(hy - 8)} Z'
    return d, pts


def shell_svg(key):
    fill, dark = PALETTE[key]
    shade = mix(fill, dark, 0.42)
    light = mix(fill, '#FFFFFF', 0.5 if key != 'yellow' else 0.62)
    cid = 'sh' + key[:3]
    d, pts = scallop_d()
    hx, hy = SH_HINGE
    defs = f'<clipPath id="{cid}">{path(d)}</clipPath>'
    # hinge "ears"
    g = rect(hx - 17, hy - 14, 34, 12, 3, filled(shade, dark, 3.4))
    g += path(d, f'fill="{fill}"')
    g += f'<g clip-path="url(#{cid})">'
    g += path(d, f'fill="{shade}"') + f'<g transform="translate(-6,-6)">{path(d, fa(fill))}</g>'
    # ribs: from the hinge to each bump valley, lighter
    for i in range(SH_N + 1):
        x, y = pts[i]
        g += path(f'M{f(hx)},{f(hy - 6)} L{f(x)},{f(y)}', stroke(light, 4.5) + ' opacity="0.85"')
    # bump crests catch the light
    for i in range(SH_N):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        dx, dy = mx - SH_C[0], my - SH_C[1]
        n = math.hypot(dx, dy)
        g += circ(mx + dx / n * 5, my + dy / n * 5, 3, f'fill="{light}" opacity="0.75"')
    g += '</g>'
    g += path(d, f'fill="none" stroke="{dark}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    g += ell(40, 52, 5, 11, 'fill="#FFFFFF" opacity="0.6" transform="rotate(30 40 52)"')
    g += circ(32, 72, 2.6, 'fill="#FFFFFF" opacity="0.55"')
    return svg(128, 128, g, defs)


def gen_shells():
    for key in ('red', 'blue', 'yellow', 'green', 'orange', 'purple'):
        write(f'items/shell_{key}.svg', shell_svg(key))


# ======================================================================= PEARL + TAG
PEARL = {'fill': '#FBF6EC', 'shade': '#E2D6C6', 'line': '#B9A98F', 'pink': '#F6CFD8', 'blue': '#CFE3F2'}
TAN = {'fill': '#D9C18A', 'shade': '#B99E66', 'line': '#8E7443'}


def pearl_body(cx, cy, r, uid):
    defs = f'<clipPath id="{uid}">{circ(cx, cy, r)}</clipPath>'
    g = circ(cx, cy, r, f'fill="{PEARL["shade"]}"')
    g += f'<g clip-path="url(#{uid})">'
    g += circ(cx - r * 0.16, cy - r * 0.14, r, f'fill="{PEARL["fill"]}"')
    g += ell(cx + r * 0.3, cy + r * 0.45, r * 0.7, r * 0.4, f'fill="{PEARL["pink"]}" opacity="0.7"')
    g += ell(cx - r * 0.5, cy + r * 0.2, r * 0.45, r * 0.6, f'fill="{PEARL["blue"]}" opacity="0.6"')
    g += circ(cx - r * 0.16, cy - r * 0.2, r * 0.72, f'fill="{PEARL["fill"]}" opacity="0.9"')
    g += '</g>'
    g += circ(cx, cy, r, f'fill="none" stroke="{PEARL["line"]}" stroke-width="{f(LW * r / 34)}"')
    g += ell(cx - r * 0.38, cy - r * 0.42, r * 0.2, r * 0.32, f'fill="#FFFFFF" transform="rotate(35 {f(cx - r * 0.38)} {f(cy - r * 0.42)})"')
    g += circ(cx + r * 0.2, cy - r * 0.6, r * 0.09, 'fill="#FFFFFF" opacity="0.9"')
    return defs, g


def gen_pearl():
    # small half-open tan shell (lower valve) as a cup; pearl sits in it
    cup = 'M14,92 C14,112 36,122 64,122 C92,122 114,112 114,92 C100,84 28,84 14,92 Z'
    defs = f'<clipPath id="pcup">{path(cup)}</clipPath>'
    g = path('M22,96 C22,74 40,66 64,66 C88,66 106,74 106,96 Z', filled(TAN['shade'], TAN['line'], 3.4))  # back valve
    pd, pg = pearl_body(64, 62, 34, 'prl')
    defs += pd
    g += pg
    g += path(cup, f'fill="{TAN["fill"]}"')
    g += '<g clip-path="url(#pcup)">'
    g += path(cup, f'fill="{TAN["shade"]}"') + f'<g transform="translate(-5,-5)">{path(cup, fa(TAN["fill"]))}</g>'
    for x in (28, 40, 52, 64, 76, 88, 100):
        g += path(f'M{f(x)},90 L{f(64 + (x - 64) * 0.7)},122', stroke(mix(TAN['fill'], '#FFFFFF', 0.45), 3.4) + ' opacity="0.8"')
    g += '</g>'
    g += path(cup, f'fill="none" stroke="{TAN["line"]}" stroke-width="{f(LW)}"')
    write('items/pearl.svg', svg(128, 128, g, defs))


def gen_tag():
    fill, dark = PALETTE['cream']
    shade = mix(fill, dark, 0.3)
    defs = f'<clipPath id="tagc">{circ(64, 74, 48)}</clipPath>'
    # rope loop
    g = path('M50,26 C44,8 84,8 78,26', stroke(TAN['line'], 9)) + path('M50,26 C44,8 84,8 78,26', stroke(TAN['fill'], 5))
    g += path('M54,20 L57,14 M62,16 L62,10 M70,16 L72,10', stroke(TAN['line'], 1.6) + ' opacity="0.6"')
    g += circ(64, 74, 48, f'fill="{fill}"')
    g += '<g clip-path="url(#tagc)">' + circ(64, 74, 48, f'fill="{shade}"') + circ(58, 68, 48, f'fill="{fill}"') + '</g>'
    g += circ(64, 74, 48, f'fill="none" stroke="{dark}" stroke-width="{f(LW)}"')
    g += circ(64, 74, 40, f'fill="none" stroke="{shade}" stroke-width="2.4" opacity="0.9"')
    g += circ(64, 34, 5, filled(shade, dark, 2.6))  # hole for the rope
    g += ell(38, 52, 4.5, 9, 'fill="#FFFFFF" opacity="0.85" transform="rotate(35 38 52)"')
    write('items/tag.svg', svg(128, 128, g, defs))


# ======================================================================= MOUNDS
MOUND_D = 'M6,92 C8,66 30,38 64,30 L96,30 C130,38 152,66 154,92 Z'   # crest y 30, flat x 64..96


def gen_mounds():
    defs = f'<clipPath id="mnd">{path(MOUND_D)}</clipPath>'
    g = ell(80, 91, 80, 5, f'fill="{SHADOW}" opacity="0.16"')
    g += path(MOUND_D, f'fill="{SAND["fill"]}"')
    g += '<g clip-path="url(#mnd)">'
    g += path(MOUND_D, f'fill="{SAND["shade"]}"') + f'<g transform="translate(-8,-7)">{path(MOUND_D, fa(SAND["fill"]))}</g>'
    g += ell(80, 100, 86, 20, f'fill="{SAND["shade"]}"')
    g += ell(80, 104, 70, 14, f'fill="{SAND["dark"]}" opacity="0.35"')
    rnd = random.Random(21)
    for _ in range(22):
        x, y = rnd.uniform(14, 146), rnd.uniform(40, 90)
        if abs(x - 80) < 22 and y < 50:
            continue
        g += circ(x, y, rnd.uniform(1.2, 2.4), f'fill="{SAND["speck"] if rnd.random() < .7 else SAND["dark"]}" opacity="0.8"')
    g += path('M30,62 Q40,58 50,62', stroke(SAND['hi'], 2.6) + ' opacity="0.9"')
    g += path('M100,52 Q110,48 120,52', stroke(SAND['hi'], 2.6) + ' opacity="0.9"')
    g += '</g>'
    g += path(MOUND_D, f'fill="none" stroke="{SAND["line"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    g += ell(44, 48, 9, 4, 'fill="#FFFFFF" opacity="0.5" transform="rotate(-30 44 48)"')
    write('items/mound.svg', svg(160, 96, g, defs))
    # dug hole: flat sand ring with a dark dip
    g = ell(80, 84, 74, 12, filled(SAND['fill'], SAND['line'], 3.6))
    g += ell(80, 82, 52, 8.5, filled(SAND['dark'], SAND['line'], 3))
    g += ell(84, 84, 40, 5, f'fill="{mix(SAND["dark"], "#6B4A2E", 0.5)}" opacity="0.8"')
    g += ell(60, 79, 10, 2.2, 'fill="#FFFFFF" opacity="0.35"')
    for x, y in ((14, 74), (142, 76), (120, 68), (36, 68)):
        g += circ(x, y, 2, f'fill="{SAND["speck"]}"')
    write('items/mound_hole.svg', svg(160, 96, g))


# ======================================================================= CHESTS
def band_v(x, y0, y1, w=14, line=CH['line']):
    g = rect(x - w / 2, y0, w, y1 - y0, 3, filled(CH['brass'], line, 3))
    g += rect(x - w / 2 + 3, y0 + 3, 3.5, y1 - y0 - 6, 1.5, f'fill="{CH["brassHi"]}" opacity="0.8"')
    g += rect(x + w / 2 - 6, y0 + 3, 3, y1 - y0 - 6, 1.5, f'fill="{CH["brassDk"]}" opacity="0.6"')
    return g


def rivets(x, ys, line=CH['brassDk']):
    return ''.join(circ(x, y, 2.4, f'fill="{line}"') for y in ys)


def chest_lid(x0, x1, ytop, ybot, uid, bands=(), w_band=14):
    """Open lid seen from the front, leaning back: outer dome shape with the dark inside visible."""
    cx = (x0 + x1) / 2
    d = (f'M{f(x0)},{f(ybot)} L{f(x0)},{f(ytop + 26)} Q{f(x0)},{f(ytop)} {f(x0 + 26)},{f(ytop)} '
         f'L{f(x1 - 26)},{f(ytop)} Q{f(x1)},{f(ytop)} {f(x1)},{f(ytop + 26)} L{f(x1)},{f(ybot)} Z')
    inner = (f'M{f(x0 + 12)},{f(ybot)} L{f(x0 + 12)},{f(ytop + 28)} Q{f(x0 + 12)},{f(ytop + 12)} {f(x0 + 30)},{f(ytop + 12)} '
             f'L{f(x1 - 30)},{f(ytop + 12)} Q{f(x1 - 12)},{f(ytop + 12)} {f(x1 - 12)},{f(ytop + 28)} L{f(x1 - 12)},{f(ybot)} Z')
    defs = f'<clipPath id="{uid}">{path(d)}</clipPath>'
    g = path(d, f'fill="{CH["wood"]}"')
    g += f'<g clip-path="url(#{uid})">'
    g += path(d, f'fill="{CH["woodSh"]}"') + f'<g transform="translate(-6,-5)">{path(d, fa(CH["wood"]))}</g>'
    g += path(inner, f'fill="{CH["inner"]}"')
    g += path(inner, f'fill="{CH["innerLt"]}" opacity="0.5" transform="translate(0,{f((ybot - ytop) * 0.55)})"')
    for bx in bands:
        g += band_v(bx, ytop - 4, ybot + 4, w_band)
    g += '</g>'
    g += path(d, f'fill="none" stroke="{CH["line"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    g += path(f'M{f(x0 + 10)},{f(ytop + 20)} Q{f(x0 + 12)},{f(ytop + 8)} {f(x0 + 26)},{f(ytop + 6)}', stroke(CH['woodHi'], 3) + ' opacity="0.9"')
    return defs, g


def gen_chest():
    W, x0, x1 = 256, 22, 234
    # ---------------- back: lid (hinged at the back, leaning back) + inner back wall + back rim
    defs, g = chest_lid(x0 + 2, x1 - 2, 4, 52, 'cbl', bands=(70, 186))
    # inner back wall + side walls (dark) seen through the opening; opening centre (128,54)
    g += rect(x0 + 8, 40, x1 - x0 - 16, 36, 4, f'fill="{CH["inner"]}" stroke="{CH["line"]}" stroke-width="3"')
    g += rect(x0 + 8, 40, x1 - x0 - 16, 10, 0, f'fill="{CH["innerLt"]}" opacity="0.55"')
    # back rim (top edge of the back wall)
    g += rect(x0 + 4, 36, x1 - x0 - 8, 10, 4, filled(CH['wood'], CH['line'], 3.2))
    g += rect(x0 + 10, 38, x1 - x0 - 20, 3, 1.5, f'fill="{CH["woodHi"]}" opacity="0.8"')
    write('items/chest_back.svg', svg(W, 200, g, defs))

    # ---------------- front: lip + body + bands + lock + feet
    body = rect(x0, 56, x1 - x0, 130, 10)
    defs = f'<clipPath id="cfb">{body}</clipPath>'
    g = ''
    for fx in (x0 + 14, x1 - 46):
        g += rect(fx, 184, 32, 12, 4, filled(CH['woodSh'], CH['line'], 3))
    g += rect(x0, 56, x1 - x0, 130, 10, f'fill="{CH["wood"]}"')
    g += '<g clip-path="url(#cfb)">'
    g += rect(x0, 150, x1 - x0, 50, 0, f'fill="{CH["woodSh"]}"')
    g += rect(x1 - 40, 56, 40, 140, 0, f'fill="{CH["woodSh"]}" opacity="0.6"')
    # planks
    for y in (100, 142):
        g += path(f'M{x0},{y} L{x1},{y}', stroke(CH['line'], 3) + ' opacity="0.8"')
        g += path(f'M{x0},{y + 3} L{x1},{y + 3}', stroke(CH['woodHi'], 2) + ' opacity="0.7"')
    rnd = random.Random(9)
    for ya, yb in ((70, 96), (104, 138), (146, 182)):
        for _ in range(3):
            x = rnd.uniform(x0 + 30, x1 - 90)
            y = rnd.uniform(ya + 4, yb - 4)
            ln = rnd.uniform(26, 60)
            g += path(f'M{f(x)},{f(y)} Q{f(x + ln / 2)},{f(y - 2.5)} {f(x + ln)},{f(y)}', stroke(CH['woodSh'], 1.8) + ' opacity="0.7"')
    g += path(f'M{x0 + 10},80 L{x0 + 10},170', stroke(CH['woodHi'], 4) + ' opacity="0.55"')
    g += '</g>'
    g += rect(x0, 56, x1 - x0, 130, 10, f'fill="none" stroke="{CH["line"]}" stroke-width="{f(LW)}"')
    # vertical brass bands (front body) with rivets
    for bx in (70, 186):
        g += band_v(bx, 60, 190)
        g += rivets(bx, (74, 118, 162))
    # front lip (y 50-66): a wide wood rail with a brass edge
    g += rect(x0 - 4, 50, x1 - x0 + 8, 18, 6, filled(CH['wood'], CH['line']))
    g += rect(x0 + 4, 54, x1 - x0 - 8, 3.5, 1.5, f'fill="{CH["woodHi"]}" opacity="0.9"')
    g += rect(x0 - 4, 62, x1 - x0 + 8, 6, 3, f'fill="{CH["woodSh"]}" opacity="0.8"')
    # lock plate (brass, with a keyhole dot) hanging from the lip
    g += path('M110,60 L146,60 Q152,60 152,66 L152,92 Q152,104 128,106 Q104,104 104,92 L104,66 Q104,60 110,60 Z', filled(CH['brass'], CH['line'], 3.4))
    g += path('M112,64 L144,64', stroke(CH['brassHi'], 3))
    g += circ(128, 80, 5.5, f'fill="{CH["line"]}"') + rect(125.5, 82, 5, 10, 2, f'fill="{CH["line"]}"')
    # corner caps (brass)
    for cx_, cy_ in ((x0 + 2, 184), (x1 - 2, 184)):
        g += circ(cx_, cy_, 7, filled(CH['brass'], CH['line'], 3))
    write('items/chest_front.svg', svg(W, 200, g, defs))


def gen_long_chest():
    W, x0, x1 = 512, 14, 498
    bands = (90, 256, 422)
    # ---------------- back: low lid + inner wall; opening line y 60
    defs, g = chest_lid(x0 + 2, x1 - 2, 8, 56, 'lbl', bands=bands, w_band=14)
    g += rect(x0 + 8, 46, x1 - x0 - 16, 36, 4, f'fill="{CH["inner"]}" stroke="{CH["line"]}" stroke-width="3"')
    g += rect(x0 + 8, 46, x1 - x0 - 16, 10, 0, f'fill="{CH["innerLt"]}" opacity="0.55"')
    g += rect(x0 + 4, 42, x1 - x0 - 8, 10, 4, filled(CH['wood'], CH['line'], 3.2))
    g += rect(x0 + 10, 44, x1 - x0 - 20, 3, 1.5, f'fill="{CH["woodHi"]}" opacity="0.8"')
    write('items/long_back.svg', svg(W, 200, g, defs))

    # ---------------- front
    body = rect(x0, 62, x1 - x0, 124, 10)
    defs = f'<clipPath id="lfb">{body}</clipPath>'
    g = ''
    for fx in (x0 + 16, x1 - 48):
        g += rect(fx, 184, 32, 12, 4, filled(CH['woodSh'], CH['line'], 3))
    g += rect(x0, 62, x1 - x0, 124, 10, f'fill="{CH["wood"]}"')
    g += '<g clip-path="url(#lfb)">'
    g += rect(x0, 150, x1 - x0, 50, 0, f'fill="{CH["woodSh"]}"')
    g += rect(x1 - 60, 62, 60, 140, 0, f'fill="{CH["woodSh"]}" opacity="0.5"')
    for y in (104, 146):
        g += path(f'M{x0},{y} L{x1},{y}', stroke(CH['line'], 3) + ' opacity="0.8"')
        g += path(f'M{x0},{y + 3} L{x1},{y + 3}', stroke(CH['woodHi'], 2) + ' opacity="0.7"')
    rnd = random.Random(13)
    for ya, yb in ((74, 100), (108, 142), (150, 182)):
        for _ in range(6):
            x = rnd.uniform(x0 + 30, x1 - 100)
            y = rnd.uniform(ya + 4, yb - 4)
            ln = rnd.uniform(30, 70)
            g += path(f'M{f(x)},{f(y)} Q{f(x + ln / 2)},{f(y - 2.5)} {f(x + ln)},{f(y)}', stroke(CH['woodSh'], 1.8) + ' opacity="0.7"')
    g += path(f'M{x0 + 10},84 L{x0 + 10},170', stroke(CH['woodHi'], 4) + ' opacity="0.55"')
    g += '</g>'
    g += rect(x0, 62, x1 - x0, 124, 10, f'fill="none" stroke="{CH["line"]}" stroke-width="{f(LW)}"')
    for bx in bands:
        g += band_v(bx, 66, 190)
        g += rivets(bx, (82, 124, 166))
    g += rect(x0 - 4, 56, x1 - x0 + 8, 18, 6, filled(CH['wood'], CH['line']))
    g += rect(x0 + 4, 60, x1 - x0 - 8, 3.5, 1.5, f'fill="{CH["woodHi"]}" opacity="0.9"')
    g += rect(x0 - 4, 68, x1 - x0 + 8, 6, 3, f'fill="{CH["woodSh"]}" opacity="0.8"')
    for cx_, cy_ in ((x0 + 2, 184), (x1 - 2, 184)):
        g += circ(cx_, cy_, 7, filled(CH['brass'], CH['line'], 3))
    write('items/long_front.svg', svg(W, 200, g, defs))


# ======================================================================= SIGN
def starfish(cx, cy, r, fill='#F2A58F', line='#B86A55', rot=-90):
    pts = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * 0.5
        a = math.radians(rot + i * 36)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'
    g = path(d, filled(fill, line, 3))
    for i in range(5):
        a = math.radians(rot + i * 72)
        g += circ(cx + r * 0.55 * math.cos(a), cy + r * 0.55 * math.sin(a), r * 0.1, f'fill="{line}" opacity="0.6"')
    g += circ(cx - r * 0.15, cy - r * 0.18, r * 0.12, 'fill="#FFFFFF" opacity="0.7"')
    return g


def gen_sign():
    defs = '<clipPath id="sgb"><path d="M8,8 Q6,4 12,5 L116,4 Q122,4 122,10 L121,80 Q121,86 115,86 L12,87 Q6,87 6,81 Z"/></clipPath>'
    board = 'M8,8 Q6,4 12,5 L116,4 Q122,4 122,10 L121,80 Q121,86 115,86 L12,87 Q6,87 6,81 Z'
    # stake (driftwood post)
    g = rect(56, 78, 16, 36, 3, filled(DRIFT['fill'], DRIFT['line'], 3.4))
    g += rect(64, 82, 7, 30, 0, f'fill="{DRIFT["shade"]}"')
    g += path('M56,111 L72,111', stroke(DRIFT['line'], 3))
    g += path(board, f'fill="{DRIFT["board"]}"')
    g += '<g clip-path="url(#sgb)">'
    g += rect(6, 80, 116, 10, 0, f'fill="{DRIFT["boardSh"]}"') + rect(114, 4, 10, 84, 0, f'fill="{DRIFT["boardSh"]}" opacity="0.7"')
    g += path('M14,83 L40,83 M76,84 L104,84', stroke(DRIFT['shade'], 1.4) + ' opacity="0.7"')
    g += '</g>'
    g += path(board, f'fill="none" stroke="{DRIFT["line"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    # nails in the corners (inside the margin, not the blank area)
    for x, y in ((12.5, 10), (115.5, 9.5), (12.5, 80), (115.5, 80)):
        g += circ(x, y, 2.2, f'fill="{DRIFT["line"]}"')
    # tiny starfish stuck on the stake
    g += starfish(78, 94, 11)
    write('items/sign.svg', svg(128, 112, g, defs))


# ======================================================================= UI
def gold_star(cx, cy, ro, uid='st', fill='#FFC83A', shade='#F5A623', line='#C98612', lw=LW):
    sp = star_path(cx, cy, ro, ro * 0.48)
    defs = f'<clipPath id="{uid}">{path(sp)}</clipPath>'
    g = path(sp, f'fill="{fill}"')
    g += f'<g clip-path="url(#{uid})">' + path(f'M{f(cx)},{f(cy)} L{f(cx + ro * 1.2)},{f(cy + ro * 0.15)} L{f(cx + ro * 1.2)},{f(cy + ro * 1.2)} L{f(cx - ro * 1.2)},{f(cy + ro * 1.2)} L{f(cx - ro * 1.2)},{f(cy + ro * 0.55)} Z', f'fill="{shade}" opacity="0.65"') + '</g>'
    g += path(sp, f'fill="none" stroke="{line}" stroke-width="{f(lw)}" stroke-linejoin="round"')
    g += ell(cx - ro * 0.28, cy - ro * 0.32, ro * 0.16, ro * 0.28, f'fill="#FFFFFF" opacity="0.75" transform="rotate(35 {f(cx - ro * 0.28)} {f(cy - ro * 0.32)})"')
    g += circ(cx - ro * 0.46, cy + ro * 0.04, ro * 0.08, 'fill="#FFFFFF" opacity="0.6"')
    return defs, g


def gen_stars():
    defs, g = gold_star(32, 34, 28)
    write('ui/star.svg', svg(64, 64, g, defs))
    sp = star_path(32, 34, 28, 13.5)
    g = path(sp, f'fill="#E8EDF3" fill-opacity="0.9" stroke="#8E9BAE" stroke-width="{LW}" stroke-linejoin="round"')
    g += path(star_path(32, 34, 17, 8), 'fill="none" stroke="#C4CDD8" stroke-width="2.2" stroke-linejoin="round" stroke-dasharray="3 4"')
    write('ui/star_empty.svg', svg(64, 64, g))


def gen_pearl_icon():
    defs, g = pearl_body(32, 32, 26, 'pic')
    write('ui/pearl_icon.svg', svg(64, 64, g, defs))


def gen_lock():
    body = '#9FB3C8'
    bodySh = '#7D93AB'
    line = '#4E6480'
    g = path('M20,34 L20,24 Q20,8 32,8 Q44,8 44,24 L44,34', stroke(line, 11)) + path('M20,34 L20,24 Q20,8 32,8 Q44,8 44,24 L44,34', stroke('#C6D3E1', 5.5))
    defs = f'<clipPath id="lkb">{rect(10, 28, 44, 30, 9)}</clipPath>'
    g += rect(10, 28, 44, 30, 9, f'fill="{body}"')
    g += '<g clip-path="url(#lkb)">' + rect(10, 44, 44, 20, 0, f'fill="{bodySh}"') + rect(10, 28, 44, 30, 9, f'fill="{body}" transform="translate(-4,-4)"') + '</g>'
    g += rect(10, 28, 44, 30, 9, f'fill="none" stroke="{line}" stroke-width="{f(LW)}"')
    g += circ(32, 41, 4.5, f'fill="{line}"') + rect(29.6, 43, 4.8, 8, 2, f'fill="{line}"')
    g += ell(17, 34, 2.4, 4.5, 'fill="#FFFFFF" opacity="0.7" transform="rotate(30 17 34)"')
    write('ui/lock.svg', svg(64, 64, g, defs))


TROPHY = {
    'bronze': ('#C98A5A', '#8E5A33', '#E8B98F'),
    'silver': ('#C9D1DA', '#7E8A99', '#F0F4F8'),
    'gold':   ('#F0C34A', '#B0801A', '#FBE39A'),
}


def gen_trophies():
    for i, (name, (metal, metalDk, metalHi)) in enumerate(TROPHY.items()):
        n = i + 1
        uid = 'tr' + name[:2]
        g = ell(64, 118, 44, 7, f'fill="{SHADOW}" opacity="0.14"')
        # closed chest, slightly from above: domed lid + body, metal bands/trim in the trophy colour
        lid = 'M18,58 L18,44 Q18,20 44,20 L84,20 Q110,20 110,44 L110,58 Z'
        body = rect(18, 58, 92, 52, 8)
        defs = f'<clipPath id="{uid}l">{path(lid)}</clipPath><clipPath id="{uid}b">{body}</clipPath>'
        g += rect(18, 58, 92, 52, 8, f'fill="{CH["wood"]}"')
        g += f'<g clip-path="url(#{uid}b)">' + rect(18, 90, 92, 30, 0, f'fill="{CH["woodSh"]}"') + rect(18, 58, 92, 52, 8, f'fill="{CH["wood"]}" transform="translate(-5,-4)"')
        g += path('M18,86 L110,86', stroke(CH['line'], 2.4) + ' opacity="0.8"') + '</g>'
        g += rect(18, 58, 92, 52, 8, f'fill="none" stroke="{CH["line"]}" stroke-width="{f(LW)}"')
        g += path(lid, f'fill="{CH["wood"]}"')
        g += f'<g clip-path="url(#{uid}l)">' + path(lid, f'fill="{CH["woodSh"]}"') + path(lid, f'fill="{CH["wood"]}" transform="translate(-5,-4)"') + '</g>'
        g += path(lid, f'fill="none" stroke="{CH["line"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
        # metal bands + lip + lock
        for bx in (36, 92):
            g += rect(bx - 6, 18, 12, 94, 3, filled(metal, metalDk, 3))
            g += rect(bx - 3, 22, 2.6, 86, 1.3, f'fill="{metalHi}" opacity="0.8"')
        g += rect(14, 54, 100, 12, 5, filled(metal, metalDk, 3))
        g += rect(20, 57, 88, 2.6, 1.3, f'fill="{metalHi}" opacity="0.9"')
        g += path('M54,64 L74,64 Q78,64 78,68 L78,80 Q78,88 64,90 Q50,88 50,80 L50,68 Q50,64 54,64 Z', filled(metal, metalDk, 3))
        g += circ(64, 74, 3.6, f'fill="{metalDk}"') + rect(62.4, 76, 3.2, 7, 1.5, f'fill="{metalDk}"')
        # feet
        for fx in (24, 90):
            g += rect(fx, 108, 14, 8, 3, filled(metal, metalDk, 2.6))
        # stars on the lid (1 / 2 / 3)
        xs = {1: (64,), 2: (50, 78), 3: (40, 64, 88)}[n]
        for k, sx in enumerate(xs):
            sd, sg = gold_star(sx, 38 if (n != 3 or k == 1) else 40, 13 if n == 1 else 11, uid + 's' + str(k), lw=2.8)
            defs += sd
            g += sg
        # sticker-ish soft highlight on the lid
        g += ell(36, 28, 7, 3, 'fill="#FFFFFF" opacity="0.5" transform="rotate(-30 36 28)"')
        write(f'ui/trophy_{name}.svg', svg(128, 128, g, defs))


# ---------------------------------------------------------------- lagoon badges
WATER = {'top': '#5FC9DD', 'mid': '#3FB0CB', 'deep': '#2A8EAE'}
CORAL = {'pink': '#E9A3B8', 'pinkDk': '#B97289', 'lilac': '#C9A9E0', 'lilacDk': '#9376B0', 'kelp': '#7FA66B', 'kelpDk': '#557A45'}


def coral_branch(x, y, h, col, dark, flip=1):
    d = (f'M{f(x)},{f(y)} C{f(x - 6 * flip)},{f(y - h * 0.4)} {f(x - 14 * flip)},{f(y - h * 0.55)} {f(x - 12 * flip)},{f(y - h * 0.8)} '
         f'M{f(x)},{f(y)} C{f(x + 2 * flip)},{f(y - h * 0.5)} {f(x + 4 * flip)},{f(y - h * 0.8)} {f(x + 2 * flip)},{f(y - h)} '
         f'M{f(x)},{f(y - h * 0.3)} C{f(x + 8 * flip)},{f(y - h * 0.45)} {f(x + 16 * flip)},{f(y - h * 0.55)} {f(x + 16 * flip)},{f(y - h * 0.75)}')
    g = path(d, stroke(dark, 13)) + path(d, stroke(col, 8))
    for px, py in ((x - 12 * flip, y - h * 0.8), (x + 2 * flip, y - h), (x + 16 * flip, y - h * 0.75)):
        g += circ(px, py, 5.5, filled(col, dark, 2.6))
    return g


def bubble(x, y, r):
    return circ(x, y, r, 'fill="#FFFFFF" opacity="0.35"') + circ(x - r * 0.3, y - r * 0.3, r * 0.3, 'fill="#FFFFFF" opacity="0.8"')


def badge_scene(n, uid):
    R, cx, cy = 68, 80, 80
    g = circ(cx, cy, R, f'fill="{WATER["top"]}"')
    g += ell(cx, cy + 40, R + 20, 60, f'fill="{WATER["mid"]}"')
    sand = f'M{f(cx - R)},{f(cy + 36)} Q{f(cx)},{f(cy + 22)} {f(cx + R)},{f(cy + 36)} L{f(cx + R)},{f(cy + R)} L{f(cx - R)},{f(cy + R)} Z'
    if n == 1:   # shell beach
        g += path(sand, f'fill="{SAND["fill"]}"') + path(sand, f'fill="{SAND["shade"]}" opacity="0.6" transform="translate(0,14)"')
        g += path(f'M{f(cx - R)},{f(cy + 36)} Q{f(cx)},{f(cy + 22)} {f(cx + R)},{f(cy + 36)}', stroke(SAND['line'], 3))
        g += f'<g transform="translate(44,88) scale(0.42)">{shell_inline("orange")}</g>'
        g += f'<g transform="translate(82,100) scale(0.36)">{shell_inline("purple")}</g>'
        g += starfish(118, 118, 13)
        g += bubble(50, 46, 6) + bubble(112, 36, 4.5) + bubble(100, 56, 3)
    elif n == 2:  # coral garden
        g += path(sand, f'fill="{SAND["fill"]}"')
        g += coral_branch(50, 118, 58, CORAL['pink'], CORAL['pinkDk'])
        g += coral_branch(110, 120, 52, CORAL['lilac'], CORAL['lilacDk'], -1)
        kelp = 'M80,122 C74,104 88,92 80,72 C76,62 84,52 82,42'
        g += path(kelp, stroke(CORAL['kelpDk'], 10)) + path(kelp, stroke(CORAL['kelp'], 6))
        g += ell(84, 118, 14, 8, filled(CORAL['pink'], CORAL['pinkDk'], 3))
        g += bubble(118, 48, 5) + bubble(40, 58, 4)
    elif n == 3:  # pearl cave
        g += circ(cx, cy, R, f'fill="{WATER["deep"]}"')
        cave = f'M{f(cx - R)},{f(cy + R)} L{f(cx - R)},{f(cy - 10)} Q{f(cx - 40)},{f(cy - 62)} {f(cx)},{f(cy - 58)} Q{f(cx + 44)},{f(cy - 62)} {f(cx + R)},{f(cy - 6)} L{f(cx + R)},{f(cy + R)} Z'
        g += path(cave, 'fill="#1F4F6B"')
        g += path(f'M{f(cx - 30)},{f(cy - 56)} Q{f(cx)},{f(cy - 30)} {f(cx + 30)},{f(cy - 56)}', stroke('#2A6688', 8) + ' opacity="0.8"')
        g += path(sand, f'fill="{SAND["shade"]}"')
        g += circ(cx, cy + 10, 34, 'fill="#FBF6EC" opacity="0.22"')
        g += circ(cx, cy + 10, 24, 'fill="#FBF6EC" opacity="0.25"')
        pd, pg = pearl_body(cx, cy + 12, 18, uid + 'p')
        g += pg
        for x, y, s in ((38, 58, 4), (122, 66, 3.5), (104, 40, 3), (56, 110, 2.5)):
            g += circ(x, y, s, 'fill="#9FE8DD" opacity="0.8"')
        return pd, g
    elif n == 4:  # friends bay: a crab + a clownfish peeking
        g += path(sand, f'fill="{SAND["fill"]}"')
        g += crab_face(56, 104, 0.36)
        g += clownfish_body(112, 66, 0.5)
        g += bubble(40, 50, 5) + bubble(132, 100, 4)
    elif n == 5:  # sunken ship (friendly): tilted hull, mast with a little flag, porthole
        g += path(sand, f'fill="{SAND["fill"]}"')
        g += f'<g transform="rotate(-10 80 100)">'
        hull = 'M34,96 Q36,124 80,126 Q124,124 130,96 Z'
        g += path(hull, filled('#A8744A', CH['line'], 3.6))
        g += rect(34, 88, 96, 12, 4, filled('#8A5A33', CH['line'], 3.2))
        g += path('M40,108 L124,108', stroke(CH['line'], 2) + ' opacity="0.5"')
        g += circ(60, 112, 5, filled('#9FE8DD', CH['line'], 2.6)) + circ(84, 114, 5, filled('#9FE8DD', CH['line'], 2.6)) + circ(108, 112, 5, filled('#9FE8DD', CH['line'], 2.6))
        g += rect(78, 36, 7, 54, 2, filled('#8A5A33', CH['line'], 3))
        g += path('M85,40 L112,48 L85,56 Z', filled('#F2A58F', '#B86A55', 3))
        g += '</g>'
        g += bubble(44, 44, 5) + bubble(124, 50, 4) + bubble(40, 72, 3)
    else:         # rainbow reef: rainbow arch over coral
        g += path(sand, f'fill="{SAND["fill"]}"')
        cols = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
        for i, k in enumerate(cols):
            r = 62 - i * 8
            g += path(f'M{f(cx - r)},{f(cy + 30)} A{f(r)},{f(r)} 0 0 1 {f(cx + r)},{f(cy + 30)}', stroke(PALETTE[k][0], 8.5))
        g += path(f'M{f(cx - 66)},{f(cy + 30)} A66,66 0 0 1 {f(cx + 66)},{f(cy + 30)}', stroke('#FFFFFF', 2) + ' opacity="0.5"')
        g += coral_branch(50, 124, 36, CORAL['pink'], CORAL['pinkDk'])
        g += coral_branch(112, 124, 34, CORAL['lilac'], CORAL['lilacDk'], -1)
        g += starfish(82, 122, 11)
    return '', g


def shell_inline(key):
    """Scallop drawn inline (no clip) for use inside badges/icons, 128-box local coords."""
    fill, dark = PALETTE[key]
    light = mix(fill, '#FFFFFF', 0.5)
    d, pts = scallop_d()
    hx, hy = SH_HINGE
    g = rect(hx - 17, hy - 14, 34, 12, 3, filled(mix(fill, dark, 0.4), dark, 3.4))
    g += path(d, filled(fill, dark, LW * 1.4))
    for i in range(SH_N + 1):
        x, y = pts[i]
        g += path(f'M{f(hx)},{f(hy - 6)} L{f(x)},{f(y)}', stroke(light, 5) + ' opacity="0.85"')
    return g


def gen_lagoons():
    for n in range(1, 7):
        uid = 'lg%d' % n
        extra, inner = badge_scene(n, uid)
        d, g = sticker(uid, 68, 80, 80, inner)
        g += circ(80, 80, 68, f'fill="none" stroke="{WATER["deep"]}" stroke-width="3" opacity="0.5"')
        g += ell(54, 40, 16, 7, 'fill="#FFFFFF" opacity="0.35" transform="rotate(-35 54 40)"')
        write(f'ui/lagoon_{n}.svg', svg(160, 160, g, d + extra))


# ======================================================================= AVATARS
AV = {
    'crab': ('#F08A5D', '#C25F38', '#F6AC8A'),
    'octopus': ('#B48AD6', '#7E5CA3', '#CFB0E6'),
    'seahorse': ('#E9B949', '#B0821F', '#F4D47F'),
    'clownfish': ('#F2925A', '#B55E2E', '#F7B890'),
    'dolphin': ('#7FA8C9', '#4E7399', '#A9C6DC'),
}
AV_BG = {'turtle': '#9FE8DD', 'crab': '#FBE3C4', 'octopus': '#E6D7F5', 'seahorse': '#FFF0C2', 'clownfish': '#CFEFF7', 'dolphin': '#DCEBF8'}


def av_eye(cx, cy, r, look=(1, 0.5)):
    g = circ(cx, cy, r, filled('#FFFFFF', '#3A2E2A', 2.6))
    px, py = cx + look[0] * r * 0.18, cy + look[1] * r * 0.18
    g += circ(px, py, r * 0.55, 'fill="#3A2E2A"')
    g += circ(px - r * 0.2, py - r * 0.22, r * 0.22, 'fill="#FFFFFF"')
    g += circ(px + r * 0.24, py + r * 0.24, r * 0.1, 'fill="#FFFFFF"')
    return g


def av_smile(cx, cy, w, col='#3A2E2A', lw=3.2):
    return path(f'M{f(cx - w)},{f(cy)} Q{f(cx)},{f(cy + w * 0.9)} {f(cx + w)},{f(cy)}', stroke(col, lw))


def crab_face(cx, cy, s):
    fill, dark, hi = AV['crab']
    g = f'<g transform="translate({f(cx)},{f(cy)}) scale({f(s)})">'
    # mitten claws at the sides, legs below
    for sx in (-1, 1):
        g += path(f'M{f(sx * 40)},10 Q{f(sx * 78)},0 {f(sx * 84)},-28', stroke(dark, 16)) + path(f'M{f(sx * 40)},10 Q{f(sx * 78)},0 {f(sx * 84)},-28', stroke(fill, 10))
        g += circ(sx * 86, -34, 17, filled(fill, dark, 3.4)) + path(f'M{f(sx * 78)},-46 Q{f(sx * 92)},-50 {f(sx * 100)},-40', stroke(dark, 3.4))
        for k in range(3):
            g += path(f'M{f(sx * (30 + k * 14))},{f(26 + k * 2)} L{f(sx * (46 + k * 16))},{f(48 + k * 4)}', stroke(dark, 7)) + path(f'M{f(sx * (30 + k * 14))},{f(26 + k * 2)} L{f(sx * (46 + k * 16))},{f(48 + k * 4)}', stroke(fill, 3.5))
    # eye stalks
    for sx in (-1, 1):
        g += path(f'M{f(sx * 18)},-20 L{f(sx * 24)},-46', stroke(dark, 10)) + path(f'M{f(sx * 18)},-20 L{f(sx * 24)},-46', stroke(fill, 5.5))
    g += ell(0, 4, 54, 42, f'fill="{dark}"') + ell(-5, -1, 52, 40, f'fill="{fill}"') + ell(0, 4, 54, 42, f'fill="none" stroke="{dark}" stroke-width="4"')
    g += circ(-24, -46, 13, f'fill="{dark}"') + circ(24, -46, 13, f'fill="{dark}"')
    g += av_eye(-24, -46, 11) + av_eye(24, -46, 11)
    g += ell(-28, 10, 9, 5.5, 'fill="#F7B6C2" opacity="0.9"') + ell(28, 10, 9, 5.5, 'fill="#F7B6C2" opacity="0.9"')
    g += av_smile(0, 8, 16, dark, 4)
    g += ell(-30, -14, 8, 4, 'fill="#FFFFFF" opacity="0.5" transform="rotate(-30 -30 -14)"')
    return g + '</g>'


def clownfish_body(cx, cy, s):
    fill, dark, hi = AV['clownfish']
    g = f'<g transform="translate({f(cx)},{f(cy)}) scale({f(s)})">'
    g += path('M46,0 L72,-24 L70,24 Z', filled(fill, dark, 3.4))
    g += ell(0, 0, 52, 32, f'fill="{dark}"') + ell(-4, -3, 50, 30, f'fill="{fill}"')
    g += path('M-14,-30 L-4,-30 L-2,30 L-12,30 Z', filled('#FFFFFF', dark, 3)) + path('M22,-26 L32,-22 L30,22 L20,26 Z', filled('#FFFFFF', dark, 3))
    g += ell(0, 0, 52, 32, f'fill="none" stroke="{dark}" stroke-width="4"')
    g += path('M-10,-32 Q4,-46 18,-30', filled(fill, dark, 3.4))
    g += av_eye(-28, -6, 10, (-1, 0.3))
    g += av_smile(-36, 10, 7, dark, 3)
    return g + '</g>'


def avatar_turtle():
    hx, hy, hr = HEAD
    # Tutu's head only, re-centred and scaled into the sticker
    face_ = eye_open(EYE_N, (3, 1)) + eye_open(EYE_F, (3, 1)) + mouth('smile')
    pose = dict(face=face_, cheek=1.0)
    d = f'<clipPath id="avth">{circ(hx, hy, hr)}</clipPath>'
    s = 1.12
    g = circ(64, 64, 56, f'fill="{AV_BG["turtle"]}"')
    body = ell(hx + 2, hy + hr + 30, 40, 30, filled(T['skin'], T['line']))
    body += ell(hx - 40, hy + hr + 22, 34, 30, filled(T['shell'], T['line']))
    g += f'<g transform="translate({f(64 - hx * s)},{f(66 - hy * s)}) scale({f(s)})">{body}{tutu_head(pose, "avt")}</g>'
    return d, g


def avatar_crab():
    g = circ(64, 64, 56, f'fill="{AV_BG["crab"]}"') + crab_face(64, 70, 0.82)
    return '', g


def avatar_octopus():
    fill, dark, hi = AV['octopus']
    g = circ(64, 64, 56, f'fill="{AV_BG["octopus"]}"')
    # tentacles peeking under the head
    for i, (x, y, rot) in enumerate(((22, 92, -30), (40, 106, -12), (64, 112, 0), (88, 106, 12), (106, 92, 30))):
        g += path(f'M{f(x)},{f(y - 20)} Q{f(x - 4)},{f(y + 6)} {f(x + 8)},{f(y + 12)}', stroke(dark, 15) + f' transform="rotate({rot} {x} {y})"')
        g += path(f'M{f(x)},{f(y - 20)} Q{f(x - 4)},{f(y + 6)} {f(x + 8)},{f(y + 12)}', stroke(fill, 9.5) + f' transform="rotate({rot} {x} {y})"')
        g += circ(x + 2, y + 2, 2.2, f'fill="{hi}" opacity="0.9" transform="rotate({rot} {x} {y})"')
    head = (64, 58, 46, 42)
    d, hg = shaded_ellipse('avo', head, fill, mix(fill, dark, 0.45), dark, hi=0.5)
    g += hg
    g += circ(40, 34, 4, f'fill="{hi}" opacity="0.8"') + circ(88, 30, 3, f'fill="{hi}" opacity="0.8"') + circ(96, 50, 2.6, f'fill="{hi}" opacity="0.8"')
    g += av_eye(48, 62, 12) + av_eye(82, 62, 12)
    g += ell(36, 80, 8, 5, 'fill="#F7B6C2" opacity="0.9"') + ell(94, 80, 8, 5, 'fill="#F7B6C2" opacity="0.9"')
    g += av_smile(65, 80, 11, dark, 3.4)
    return d, g


def avatar_seahorse():
    fill, dark, hi = AV['seahorse']
    g = circ(64, 64, 56, f'fill="{AV_BG["seahorse"]}"')
    # curled body below
    body = 'M70,88 C92,96 96,120 72,126 C56,130 48,118 56,110'
    g += path(body, stroke(dark, 20)) + path(body, stroke(fill, 14))
    g += path('M78,96 C86,100 88,110 80,118', stroke(mix(fill, dark, 0.3), 3) + ' opacity="0.7"')
    g += path('M38,52 Q18,44 24,66 Q30,80 42,74 Z', filled(mix(fill, '#FFFFFF', 0.3), dark, 3))
    g += path('M30,58 L36,64 M28,66 L36,68', stroke(dark, 2) + ' opacity="0.6"')
    # crest spikes (soft) + head
    for x, y, r in ((44, 30, 7), (58, 22, 7), (72, 24, 6.5)):
        g += circ(x, y, r, filled(fill, dark, 3))
    head = (62, 54, 32, 30)
    d, hg = shaded_ellipse('avs', head, fill, mix(fill, dark, 0.45), dark, hi=0.5)
    g += hg
    # snout to the right
    g += path('M88,58 Q108,56 110,66 Q104,74 88,70 Z', filled(fill, dark, 3.4))
    g += path('M98,64 L106,65', stroke(dark, 2.6))
    g += av_eye(66, 52, 12, (1, 0.3))
    g += ell(50, 68, 8, 5, 'fill="#F7B6C2" opacity="0.9"')
    g += circ(50, 46, 3, f'fill="{hi}" opacity="0.8"') + circ(74, 70, 2.5, f'fill="{hi}" opacity="0.8"')
    return d, g


def avatar_clownfish():
    g = circ(64, 64, 56, f'fill="{AV_BG["clownfish"]}"') + clownfish_body(60, 66, 0.86)
    g += bubble(100, 30, 5) + bubble(26, 36, 3.5)
    return '', g


def avatar_dolphin():
    fill, dark, hi = AV['dolphin']
    g = circ(64, 64, 56, f'fill="{AV_BG["dolphin"]}"')
    # head: rounded melon with a beak to the right, fin on top
    g += path('M54,32 Q62,6 84,16 Q76,28 68,36 Z', filled(fill, dark, 3.4))
    head = 'M22,62 C22,34 40,24 64,26 C84,28 96,42 100,56 Q118,58 120,70 Q110,78 100,76 C96,92 80,102 60,100 C38,98 22,84 22,62 Z'
    defs = f'<clipPath id="avd">{path(head)}</clipPath>'
    g += path(head, f'fill="{mix(fill, dark, 0.45)}"')
    g += '<g clip-path="url(#avd)">' + path(head, f'fill="{fill}" transform="translate(-6,-6)"') + path('M26,72 C40,100 80,100 100,74 L100,104 L20,104 Z', 'fill="#E6EFF6"') + '</g>'
    g += path(head, f'fill="none" stroke="{dark}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    g += av_eye(74, 54, 11, (1, 0.3))
    g += path('M84,70 Q98,80 112,70', stroke(dark, 3.4))
    g += ell(60, 72, 8, 5, 'fill="#F7B6C2" opacity="0.9"')
    g += ell(40, 44, 8, 4, 'fill="#FFFFFF" opacity="0.55" transform="rotate(-35 40 44)"')
    g += bubble(106, 36, 4) + bubble(30, 92, 3)
    return defs, g


def gen_avatars():
    for name, fn in (('turtle', avatar_turtle), ('crab', avatar_crab), ('octopus', avatar_octopus),
                     ('seahorse', avatar_seahorse), ('clownfish', avatar_clownfish), ('dolphin', avatar_dolphin)):
        extra, inner = fn()
        d, g = sticker('av' + name[:3], 56, 64, 64, inner)
        write(f'avatars/{name}.svg', svg(128, 128, g, d + extra))


# ======================================================================= ICON
def gen_icon():
    defs = ('<linearGradient id="iw" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#7FDCEB"/><stop offset="0.55" stop-color="#4FBFD6"/>'
            '<stop offset="1" stop-color="#2A8EAE"/></linearGradient>')
    g = '<rect width="512" height="512" fill="url(#iw)"/>'
    # light shafts + bubbles
    for x, w in ((60, 50), (170, 36), (330, 60)):
        g += path(f'M{x},0 L{x + w},0 L{x + w + 90},512 L{x + 50},512 Z', 'fill="#FFFFFF" opacity="0.08"')
    for x, y, r in ((420, 90, 14), (460, 150, 9), (70, 200, 11), (110, 150, 6)):
        g += bubble(x, y, r)
    # sand floor
    g += path('M0,392 C120,372 300,376 512,392 L512,512 L0,512 Z', f'fill="{SAND["fill"]}"')
    g += path('M0,440 C160,426 340,430 512,444 L512,512 L0,512 Z', f'fill="{SAND["shade"]}" opacity="0.6"')
    # open chest on the right, with shells + a pearl inside
    g += '<g transform="translate(236,232) scale(1.02)">'
    cd, cg = chest_lid(24, 232, 4, 52, 'icl', bands=(70, 186))
    defs += cd
    g += cg
    g += rect(30, 40, 196, 36, 4, f'fill="{CH["inner"]}"')
    g += rect(26, 36, 204, 10, 4, filled(CH['wood'], CH['line'], 3.2))
    g += f'<g transform="translate(40,-30) scale(0.62)">{shell_inline("red")}</g>'
    g += f'<g transform="translate(140,-24) scale(0.62)">{shell_inline("blue")}</g>'
    pd, pg = pearl_body(128, 48, 24, 'icp')
    defs += pd
    g += pg
    # front body (compact copy of chest_front geometry)
    g += rect(22, 56, 212, 130, 10, filled(CH['wood'], CH['line']))
    g += rect(22, 150, 212, 36, 10, f'fill="{CH["woodSh"]}"')
    for bx in (70, 186):
        g += band_v(bx, 60, 186)
    g += rect(18, 50, 220, 18, 6, filled(CH['wood'], CH['line']))
    g += path('M110,60 L146,60 Q152,60 152,66 L152,92 Q152,104 128,106 Q104,104 104,92 L104,66 Q104,60 110,60 Z', filled(CH['brass'], CH['line'], 3.4))
    g += circ(128, 80, 5.5, f'fill="{CH["line"]}"')
    g += '</g>'
    # sparkles
    for x, y, s in ((392, 196, 16), (470, 250, 10), (300, 180, 9)):
        g += path(star_path(x, y, s, s * 0.42), 'fill="#FFF3B0" stroke="#E0B23A" stroke-width="2" stroke-linejoin="round"')
    # Tutu (big, bottom-left; body runs off the edge)
    td, tg = tutu_parts(dict(face=face(eye_open(EYE_N, (4, 0)) + eye_open(EYE_F, (4, 0)), 'smile'), flippers=(26, -22), cheek=1.0), 'ict')
    defs += td
    g += f'<g transform="translate(-80,104) scale(1.85)">{tg}</g>'
    write('icon.svg', svg(512, 512, g, defs))


if __name__ == '__main__':
    gen_tutu()
    gen_shells()
    gen_pearl()
    gen_tag()
    gen_mounds()
    gen_chest()
    gen_long_chest()
    gen_sign()
    gen_stars()
    gen_pearl_icon()
    gen_lock()
    gen_trophies()
    gen_lagoons()
    gen_avatars()
    gen_icon()
    print('wrote art to', OUT)
