#!/usr/bin/env python3
"""Character / UI art generator for Bop's Rainy Band (character artist A).

Writes (relative to game/assets/default/):
  characters/bop_{idle,blink,talk,happy,cheer,think,oops,drum,drum_up,umbrella}.svg   0 0 300 300
        Bop the little aqua frog, 3/4 view facing RIGHT (towards his big drum and the band).
        FEET anchor (150, 292). Torso, thighs and feet are IDENTICAL in every frame; the head (eyes, hat, face) is
        a separate group that may tilt around the neck point NECK; the arms + drumsticks change per pose.
          idle · blink · talk (mouth open) · happy (big smile) · cheer (arms up, eyes-closed smile)
          think (head tilt, eyes up) · oops ("hmm?", one brow up, never sad)
          drum (both stick tips down at about (285, 210)) · drum_up (sticks raised) · umbrella (leaf umbrella overhead)
  characters/bop_full_wave.svg       0 0 300 300   title pose: waving a drumstick high, big smile
  characters/snail.svg, snail_ring.svg   0 0 140 110   snail with a tiny silver bell (ring = bell tilted + shine)
  characters/umbrella_leaf.svg       0 0 220 160   a big rounded leaf umbrella, stalk hanging down
  icon.svg                           0 0 512 512   full bleed: Bop with drumsticks beside a red, yellow and blue drum
                                                   under raindrops

Usage: python3 tools/art_bop.py [outDir]
Rules (docs/DESIGN.md §3): 100 % original, flat cartoon, ≈4.6 px outline in a darker tone (never black), one-step cel
shading + a soft highlight upper-left, no <text>/fonts/scripts/external refs, no filters. width/height = viewBox.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md §3)
P = {
    'skin': '#62C7CF', 'shade': '#3E9EA8', 'line': '#2A6E78', 'hi': '#A6E6EA',
    'belly': '#FFF4DA', 'bellySh': '#EEDDB8',
    'eye': '#2F2A3A', 'white': '#FFFFFF', 'cheek': '#F6B1A0',
    'mouth': '#6E2E44', 'tongue': '#F28CA2',
    'hat': '#E9C98E', 'hatSh': '#CFA766', 'hatLn': '#8C6338', 'hatHi': '#F6E2B8', 'band': '#9C6B43',
    'wood': '#C99A6B', 'woodSh': '#A87A4E', 'woodLn': '#7A5232', 'tip': '#FFF1D6',
    'spot': '#4FB3BD',
}
LW = 4.6                # outline width at viewBox 300
NECK = (150, 196)       # head tilt pivot
FEET_Y = 292


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


def ell(cx, cy, rx, ry, extra='', rot=0):
    t = f' transform="rotate({f(rot)} {f(cx)} {f(cy)})"' if rot else ''
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}"{t} {extra}/>'


def circ(cx, cy, r, extra=''):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {extra}/>'


def path(d, extra=''):
    return f'<path d="{d}" {extra}/>'


def stroke(col, w, fill='none'):
    return f'fill="{fill}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"'


def filled(fill, line, w=LW):
    return f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"'


def smooth_d(pts, close=True):
    """Smooth path through pts (Catmull-Rom → cubic Bézier). (x, y, 'c') = sharp corner."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        if not close:
            p0 = pts[max(0, i - 1)]
            p3 = pts[min(n - 1, i + 2)]
        k1 = 0 if len(p1) > 2 else 1 / 6
        k2 = 0 if len(p2) > 2 else 1 / 6
        c1 = (p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1)
        c2 = (p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if close else '')


def ell_d(cx, cy, rx, ry):
    return f'M{f(cx - rx)},{f(cy)} a{f(rx)},{f(ry)} 0 1 0 {f(2 * rx)},0 a{f(rx)},{f(ry)} 0 1 0 {f(-2 * rx)},0 Z'


def clip(cid, d):
    return f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'


def g_clip(cid, inner):
    return f'<g clip-path="url(#{cid})">{inner}</g>'


def unit(a):
    """Unit vector for angle a in degrees (0 = right, 90 = down)."""
    return math.cos(math.radians(a)), math.sin(math.radians(a))


# ======================================================================= BOP
# ---------------------------------------------------------------- torso + legs (identical in every frame)
TORSO_D = smooth_d([(150, 168), (196, 176), (222, 212), (224, 252), (204, 282), (150, 290), (98, 284),
                    (76, 254), (80, 212), (104, 178)])
BELLY_D = smooth_d([(168, 196), (204, 210), (214, 246), (200, 276), (164, 286), (130, 276), (124, 240), (138, 206)])


def foot(x, y, s, fill, flip=False):
    """A flat frog foot with three round toe pads, heel at (x, y), toes pointing right (or left if flip)."""
    k = -1 if flip else 1
    pads = [(x + k * 30 * s, y - 2), (x + k * 25 * s, y - 13 * s), (x + k * 14 * s, y - 19 * s)]
    d = smooth_d([(x - k * 8 * s, y - 14 * s), (x + k * 8 * s, y - 18 * s), (x + k * 26 * s, y - 10 * s),
                  (x + k * 32 * s, y - 2), (x + k * 18 * s, y + 1), (x - k * 6 * s, y)])
    o = path(d, filled(fill, P['line']))
    for px, py in pads:
        o += circ(px, py, 5.2 * s, filled(fill, P['line'], LW * 0.8))
    return o


def lower_body(p):
    """Far foot + far thigh (behind), torso, near thigh, near foot. Returns (defs, back, front)."""
    cid = p + 'tor'
    defs = clip(cid, TORSO_D) + clip(p + 'bel', BELLY_D)
    back = foot(196, 290, 0.95, P['shade'])                          # far foot, peeking out to the right
    back += ell(206, 262, 24, 28, filled(P['shade'], P['line']), -20)  # far thigh
    o = path(TORSO_D, f'fill="{P["skin"]}"')
    inner = ell(92, 262, 40, 50, f'fill="{P["shade"]}"')             # back-side shade
    inner += ell(150, 300, 90, 20, f'fill="{P["shade"]}"')
    inner += path(BELLY_D, filled(P['belly'], P['bellySh'], 0))
    inner += g_clip(p + 'bel', ell(140, 284, 44, 22, f'fill="{P["bellySh"]}"'))
    inner += ell(118, 196, 16, 9, f'fill="{P["hi"]}" opacity=".8"', -30)
    o += g_clip(cid, inner)
    o += path(BELLY_D, stroke(P['bellySh'], 2.4))
    o += path(TORSO_D, stroke(P['line'], LW))
    # near thigh (a big round haunch at the back) + near foot
    th = smooth_d([(70, 236), (100, 226), (124, 248), (122, 278), (98, 290), (70, 284), (60, 262)])
    o += path(th, filled(P['skin'], P['line']))
    o += path('M76,246 Q92,236 108,240', stroke(P['hi'], 4) + ' opacity=".8"')
    o += circ(84, 268, 4, f'fill="{P["spot"]}"') + circ(100, 256, 3, f'fill="{P["spot"]}"')
    o += foot(112, 291, 1.08, P['skin'])
    return defs, back, o


# ---------------------------------------------------------------- arms + drumsticks
SH_NEAR = (190, 210)    # near (front) shoulder
SH_FAR = (112, 206)     # far (back-left) shoulder


def stick(hx, hy, a, L=62, back=14):
    """A drumstick gripped at (hx, hy), pointing along angle a. Returns (svg, tip point)."""
    ux, uy = unit(a)
    bx, by = hx - ux * back, hy - uy * back
    tx, ty = hx + ux * L, hy + uy * L
    o = path(f'M{f(bx)},{f(by)} L{f(tx)},{f(ty)}', stroke(P['woodLn'], 7.5 + 2 * 3.2))
    o += path(f'M{f(bx)},{f(by)} L{f(tx)},{f(ty)}', stroke(P['wood'], 7.5))
    nx, ny = -uy, ux
    o += path(f'M{f(bx + nx * 1.6)},{f(by + ny * 1.6 - 0.5)} L{f(tx - ux * 6 + nx * 1.6)},{f(ty - uy * 6 + ny * 1.6)}',
              stroke(P['woodSh'], 2.2))
    o += circ(tx, ty, 7.4, filled(P['tip'], P['woodLn'], 3.2))
    o += circ(tx - 2.2, ty - 2.4, 2.2, f'fill="{P["white"]}"')
    return o, (tx, ty)


def hand(hx, hy, a, fill):
    """A round frog hand with three finger pads curled round the stick (fingers towards angle a+90)."""
    ux, uy = unit(a)
    nx, ny = -uy, ux
    o = circ(hx, hy, 11.5, filled(fill, P['line'], LW * 0.9))
    for k in (-1, 0, 1):
        px = hx + ux * k * 7.5 + nx * 9.5
        py = hy + uy * k * 7.5 + ny * 9.5
        o += circ(px, py, 4.6, filled(fill, P['line'], LW * 0.75))
    return o


def arm(sh, el, hd, fill):
    d = f'M{f(sh[0])},{f(sh[1])} Q{f(el[0])},{f(el[1])} {f(hd[0])},{f(hd[1])}'
    return path(d, stroke(P['line'], 19 + 2 * LW)) + path(d, stroke(fill, 19))


# pose: name → (far arm, near arm, far behind torso?) ; arm = (elbow, hand, stick angle, finger side ±1, stick on?)
# finger side: +1 = fingers on the +normal of the stick direction.
POSES = {
    'rest': (((88, 236), (92, 252), 160, -1), ((214, 238), (222, 244), 20, 1), False),
    'drum': (((180, 244), (230, 232), -22, 1), ((214, 210), (234, 194), 16, 1), True),
    'up': (((182, 244), (234, 232), -42, 1), ((240, 214), (252, 174), -64, 1), True),
    'cheer': (((74, 222), (52, 168), -110, 1), ((232, 222), (250, 168), -66, -1), False),
    'wave': (((88, 236), (92, 252), 160, -1), ((238, 214), (254, 156), -64, -1), False),
    'think': (((88, 236), (92, 252), 160, -1), ((220, 216), (216, 196), -30, 1), False),
    'umbrella': (((88, 236), (92, 252), 160, -1), ((246, 214), (266, 150), -90, -1), False),
}


def arms(pose):
    (fe, fh, fa, fs), (ne, nh, na, ns), far_behind = POSES[pose]
    back, front, tips = '', '', []
    far = arm(SH_FAR, fe, fh, P['shade'])
    L = 54 if pose == 'drum' else 62
    s, t = stick(fh[0], fh[1], fa, L)
    far += s + hand(fh[0], fh[1], fa + (0 if fs > 0 else 180), P['shade'])
    tips.append(t)
    near = arm(SH_NEAR, ne, nh, P['skin'])
    if pose == 'umbrella':
        near += hand(nh[0], nh[1], na + (0 if ns > 0 else 180), P['skin'])
    else:
        s, t = stick(nh[0], nh[1], na, L)
        near += s + hand(nh[0], nh[1], na + (0 if ns > 0 else 180), P['skin'])
        tips.append(t)
    if far_behind:
        back = far
    else:
        front = far
    return back, front + near, tips


# ---------------------------------------------------------------- head (drawn in final coords, tilted as a group)
HEAD_D = smooth_d([(146, 90), (200, 92), (240, 114), (258, 150), (242, 186), (192, 204), (130, 206), (80, 196),
                   (56, 170), (58, 134), (86, 104)])
EYE_F = (142, 80, 26)
EYE_N = (206, 80, 32)


def eye(cx, cy, r, kind, look, near, p):
    """Eye dome (skin) on top of the head, white eyeball, big pupil, two catch-lights."""
    fill = P['skin'] if near else P['shade']
    o = circ(cx, cy, r, filled(fill, P['line']))
    if near:
        o += path(f'M{f(cx - r * 0.7)},{f(cy - r * 0.55)} A{f(r * 0.9)},{f(r * 0.9)} 0 0 1 {f(cx + r * 0.1)},{f(cy - r * 0.86)}',
                  stroke(P['hi'], 3.6) + ' opacity=".9"')
    er = r * 0.74
    ex, ey = cx + r * 0.04, cy + r * 0.1
    lx, ly = look
    if kind in ('open', 'wide', 'up', 'side'):
        if kind == 'wide':
            er *= 1.05
        o += circ(ex, ey, er, f'fill="{P["white"]}" stroke="{P["line"]}" stroke-width="2.2"')
        pr = er * (0.62 if kind != 'wide' else 0.55)
        if kind == 'up':
            lx, ly = lx + 1.5, -er * 0.3
        px = ex + er * 0.28 * lx
        py = ey + ly + er * 0.08
        o += circ(px, py, pr, f'fill="{P["eye"]}"')
        o += circ(px - pr * 0.36, py - pr * 0.4, pr * 0.38, f'fill="{P["white"]}"')
        o += circ(px + pr * 0.38, py + pr * 0.36, pr * 0.16, f'fill="{P["white"]}"')
    elif kind == 'blink':
        o += circ(ex, ey, er, f'fill="{fill}"')
        o += path(f'M{f(ex - er * 0.8)},{f(ey)} Q{f(ex)},{f(ey + er * 0.7)} {f(ex + er * 0.8)},{f(ey)}', stroke(P['eye'], 3.6))
    elif kind == 'smile':
        o += circ(ex, ey, er, f'fill="{fill}"')
        o += path(f'M{f(ex - er * 0.75)},{f(ey + er * 0.25)} Q{f(ex)},{f(ey - er * 0.75)} {f(ex + er * 0.75)},{f(ey + er * 0.25)}',
                  stroke(P['eye'], 4))
    return o


def hat(p):
    """Straw boater perched on the back of the head, tilted back."""
    o = '<g transform="translate(-14 6) rotate(-18 104 72)">'
    o += ell(104, 72, 58, 14, filled(P['hat'], P['hatLn']))
    o += ell(104, 74, 46, 8, f'fill="{P["hatSh"]}"')
    crown = 'M70,72 L72,42 Q104,32 136,42 L138,72 Q104,82 70,72 Z'
    o += path(crown, filled(P['hat'], P['hatLn']))
    o += path('M71,58 Q104,68 137,58 L138,70 Q104,80 70,70 Z', filled(P['band'], P['hatLn'], 2.6))
    o += ell(104, 41, 32, 6, f'fill="{P["hatHi"]}" opacity=".9"')
    o += path('M80,46 L80,56', stroke(P['hatHi'], 3.4) + ' opacity=".9"')
    # woven straw ticks on the brim
    for x in (60, 76, 132, 148):
        o += path(f'M{x},{74 if x in (76, 132) else 72} l4,4', stroke(P['hatSh'], 2.2))
    return o + '</g>'


def brow(cx, cy, a):
    return path(f'M{f(cx - 9)},{f(cy + 2)} Q{f(cx)},{f(cy - 4)} {f(cx + 9)},{f(cy + 2)}',
                stroke(P['line'], 3.6) + f' transform="rotate({f(a)} {f(cx)} {f(cy)})"')


def mouth(kind):
    o = ''
    if kind == 'smile':
        o += path('M158,152 Q200,186 244,146', stroke(P['line'], 4))
        o += path('M156,147 q-3,5 2,6', stroke(P['line'], 3)) + path('M244,140 q4,4 0,7', stroke(P['line'], 3))
    elif kind == 'talk':
        d = smooth_d([(166, 154), (204, 160), (238, 148), (230, 172), (206, 186), (180, 178)])
        o += path(d, filled(P['mouth'], P['line'], 3.6))
        o += ell(206, 176, 14, 6, f'fill="{P["tongue"]}"')
    elif kind == 'big':
        d = smooth_d([(154, 148, 'c'), (200, 160), (246, 140, 'c'), (234, 172), (204, 190), (172, 178)])
        o += path(d, filled(P['mouth'], P['line'], 3.8))
        o += ell(204, 180, 18, 8, f'fill="{P["tongue"]}"')
        o += path('M160,151 Q200,164 240,145', stroke(P['white'], 3.2) + ' opacity=".9"')
    elif kind == 'grin':      # drumming: wide closed grin, tongue tip out of the corner
        o += path('M160,152 Q202,182 242,148', stroke(P['line'], 4))
        o += path('M228,162 q8,10 16,0', filled(P['tongue'], P['line'], 2.8))
    elif kind == 'o':
        o += ell(206, 164, 9, 10, filled(P['mouth'], P['line'], 3.4))
        o += ell(206, 169, 5, 3.4, f'fill="{P["tongue"]}"')
    elif kind == 'hmm':
        o += path('M176,160 Q192,150 206,160 T236,156', stroke(P['line'], 4))
    return o


HEAD = {   # mood: eye kind, mouth, brows, look (x -1..1, y px), tilt (deg), cheek scale
    'idle': ('open', 'smile', None, (1, 0), 0, 1.0),
    'blink': ('blink', 'smile', None, (1, 0), 0, 1.0),
    'talk': ('open', 'talk', None, (1, 0), 0, 1.0),
    'happy': ('open', 'big', None, (0.6, 0), 0, 1.2),
    'cheer': ('smile', 'big', None, (0, 0), -4, 1.25),
    'think': ('up', 'hmm', 'think', (0.5, 0), -9, 0.9),
    'oops': ('wide', 'o', 'oops', (0.2, 0), 7, 1.0),
    'drum': ('open', 'grin', None, (1.4, 3), 3, 1.1),
    'drum_up': ('open', 'big', None, (1.2, 0), -2, 1.15),
    'umbrella': ('open', 'big', None, (0.7, -2), 0, 1.15),
    'wave': ('open', 'big', None, (0.6, 0), -3, 1.2),
    'icon': ('open', 'big', None, (1.2, 2), 2, 1.2),     # drum pose with a big happy mouth (icon only)
}


def head(p, mood):
    ek, mk, bk, look, tilt, chk = HEAD[mood]
    cid = p + 'head'
    defs = clip(cid, HEAD_D)
    o = hat(p)
    o += eye(*EYE_F, ek, look, False, p)
    o += path(HEAD_D, f'fill="{P["skin"]}"')
    inner = ell(130, 222, 120, 36, f'fill="{P["shade"]}"')           # chin shade
    inner += ell(40, 166, 24, 52, f'fill="{P["shade"]}" opacity=".55"')
    inner += ell(100, 112, 30, 10, f'fill="{P["hi"]}" opacity=".85"', -14)
    o += g_clip(cid, inner)
    o += path(HEAD_D, stroke(P['line'], LW))
    o += eye(*EYE_N, ek, look, True, p)
    # nostrils
    o += ell(232, 124, 2.6, 1.8, f'fill="{P["line"]}"', -20) + ell(244, 126, 2.2, 1.6, f'fill="{P["line"]}"', -20)
    # cheeks
    o += ell(232, 160, 14 * chk, 9 * chk, f'fill="{P["cheek"]}"')
    o += ell(132, 158, 11 * chk, 7.5 * chk, f'fill="{P["cheek"]}" opacity=".95"')
    o += mouth(mk)
    # a few soft spots on the crown
    o += circ(156, 108, 4, f'fill="{P["spot"]}"') + circ(170, 118, 2.8, f'fill="{P["spot"]}"')
    if bk == 'think':
        o += brow(200, 40, -10) + brow(128, 48, 8)
    elif bk == 'oops':
        o += brow(202, 36, -18) + brow(128, 50, 0)
    if tilt:
        o = f'<g transform="rotate({f(tilt)} {f(NECK[0])} {f(NECK[1])})">{o}</g>'
    return defs, o


# ---------------------------------------------------------------- leaf umbrella (shared)
def leaf_canopy(cx, cy, w, h, a=0):
    """A big rounded leaf (lotus/taro-like) seen from below-side: canopy centre (cx, cy), width w, height h."""
    L, T = cx - w / 2, cy - h / 2
    d = smooth_d([(cx - w * 0.5, cy + h * 0.38), (cx - w * 0.42, cy - h * 0.12), (cx - w * 0.2, cy - h * 0.46),
                  (cx + w * 0.08, cy - h * 0.52), (cx + w * 0.34, cy - h * 0.34), (cx + w * 0.5, cy + h * 0.3),
                  (cx + w * 0.3, cy + h * 0.5), (cx + w * 0.1, cy + h * 0.36), (cx - w * 0.1, cy + h * 0.5),
                  (cx - w * 0.3, cy + h * 0.38)])
    o = path(d, filled('#7CC77A', '#2F7A47'))
    # underside rim shade + veins
    o += path(f'M{f(cx - w * 0.46)},{f(cy + h * 0.3)} Q{f(cx - w * 0.2)},{f(cy + h * 0.5)} {f(cx - w * 0.1)},{f(cy + h * 0.44)} '
              f'Q{f(cx + w * 0.1)},{f(cy + h * 0.32)} {f(cx + w * 0.3)},{f(cy + h * 0.44)} '
              f'Q{f(cx + w * 0.44)},{f(cy + h * 0.38)} {f(cx + w * 0.46)},{f(cy + h * 0.26)}', stroke('#5AAE62', 7))
    ox, oy = cx + w * 0.05, cy + h * 0.22
    for ex, ey in ((-0.4, 0.1), (-0.22, -0.3), (0.06, -0.42), (0.3, -0.22), (0.42, 0.14)):
        o += path(f'M{f(ox)},{f(oy)} Q{f(ox + w * ex * 0.5)},{f(oy + h * ey * 0.7 - 6)} {f(cx + w * ex)},{f(cy + h * ey)}',
                  stroke('#3E8E52', 3.4))
    o += path(f'M{f(cx - w * 0.3)},{f(cy - h * 0.28)} Q{f(cx - w * 0.12)},{f(cy - h * 0.44)} {f(cx + w * 0.04)},{f(cy - h * 0.44)}',
              stroke('#B6E3A6', 5) + ' opacity=".9"')
    if a:
        o = f'<g transform="rotate({f(a)} {f(cx)} {f(cy)})">{o}</g>'
    return o, (ox, oy)


def umbrella_overlay():
    """Leaf canopy over Bop's head held by the near hand (umbrella frame)."""
    hx, hy = POSES['umbrella'][1][1]
    can, (ox, oy) = leaf_canopy(150, 32, 272, 60, 0)
    ex, ey = 238, 54
    stalk = f'M{f(hx + 1)},{f(hy + 10)} C{f(hx + 2)},{f(hy - 40)} {f(ex + 14)},{f(ey + 10)} {f(ex)},{f(ey)}'
    o = path(stalk, stroke('#2F7A47', 8 + 2 * 3.4)) + path(stalk, stroke('#6DB86C', 8))
    return o, can


# ---------------------------------------------------------------- assemble
def bop(mood, p='b'):
    pose = {'drum': 'drum', 'icon': 'drum', 'drum_up': 'up', 'cheer': 'cheer', 'wave': 'wave', 'umbrella': 'umbrella',
            'think': 'think'}.get(mood, 'rest')
    d1, back, front_legs = lower_body(p)
    d2, h = head(p, mood)
    a_back, a_front, tips = arms(pose)
    o = ell(150, 293, 78, 6, 'fill="#1E3A40" opacity=".16"')
    stalk, canopy = ('', '')
    if mood == 'umbrella':
        stalk, canopy = umbrella_overlay()
    o += a_back + back + front_legs + canopy + h + a_front + stalk
    return d1 + d2, o, tips


# ======================================================================= SNAIL
def snail(ring):
    S = {'shell': '#E7D6C6', 'shellSh': '#CDB4A0', 'shellLn': '#B98E7A', 'body': '#C7E0A8', 'bodySh': '#A9C985',
         'bodyLn': '#6E9A52', 'silver': '#D9DEE6', 'silverSh': '#A9B2C0', 'silverLn': '#6F7A8A'}
    o = ell(72, 104, 56, 4, 'fill="#1E3A40" opacity=".14"')
    # body (foot) facing right, head up at the right
    body = smooth_d([(16, 100), (40, 92), (84, 92), (104, 80), (106, 56), (118, 44), (132, 52), (134, 74),
                     (126, 94), (112, 102), (60, 104)])
    o += path(body, filled(S['body'], S['bodyLn'], 3.6))
    o += path('M24,100 Q70,104 116,98', stroke(S['bodySh'], 4))
    # eye stalks
    for bx, by, tx, ty in ((114, 50, 106, 22), (124, 48, 128, 18)):
        o += path(f'M{bx},{by} Q{(bx + tx) / 2 - 2},{(by + ty) / 2} {tx},{ty}', stroke(S['bodyLn'], 4.6 + 3.6))
        o += path(f'M{bx},{by} Q{(bx + tx) / 2 - 2},{(by + ty) / 2} {tx},{ty}', stroke(S['body'], 4.6))
        o += circ(tx, ty, 6.4, filled(S['white'] if 'white' in S else '#FFFFFF', S['bodyLn'], 2.6))
        o += circ(tx + 1.2, ty + 0.6, 3.6, f'fill="{P["eye"]}"') + circ(tx, ty - 0.8, 1.3, 'fill="#FFFFFF"')
    o += path('M114,72 Q122,80 130,70', stroke(S['bodyLn'], 3))                    # smile
    o += ell(121, 66, 4, 2.6, f'fill="{P["cheek"]}" opacity=".9"')
    # shell
    sh = smooth_d([(28, 90), (22, 60), (40, 30), (70, 20), (96, 34), (104, 62), (92, 88), (60, 96)])
    o += path(sh, filled(S['shell'], S['shellLn'], 3.8))
    o += path('M30,80 Q56,98 92,84', stroke(S['shellSh'], 6) + ' opacity=".9"')
    spiral = 'M64,58 m4,0 a4,4 0 1 1 -8,-2 a10,10 0 1 1 18,6 a18,18 0 1 1 -32,-10 a26,26 0 0 1 44,-20'
    o += path(spiral, stroke(S['shellLn'], 3.6))
    o += path('M42,36 Q56,24 74,26', stroke('#FFF6EC', 4.4))
    # bell hanging from a ribbon loop at the shell front
    bx, by = 100, 58
    a = 24 if ring else 0
    g = path(f'M{bx},{by} L{bx},{by + 8}', stroke('#C76E8C', 2.8))
    bell = smooth_d([(bx - 3, by + 8), (bx + 3, by + 8), (bx + 8, by + 18), (bx + 11, by + 26, 'c'), (bx - 11, by + 26, 'c'),
                     (bx - 8, by + 18)])
    g += path(bell, filled(S['silver'], S['silverLn'], 2.6))
    g += path(f'M{bx - 5},{by + 14} Q{bx - 6},{by + 20} {bx - 7},{by + 23}', stroke('#FFFFFF', 2.2))
    g += circ(bx, by + 28, 2.8, filled(S['silverSh'], S['silverLn'], 1.8))
    o += ell(bx, by - 1, 5, 3.4, filled('#F29BB8', '#C76E8C', 2.2))                 # little bow
    if ring:
        o += f'<g transform="rotate({a} {bx} {by}) translate({bx} {by}) scale(1.3) translate({-bx} {-by})">{g}</g>'
        for x1, y1, x2, y2 in ((84, 70, 76, 66), (82, 82, 72, 82), (84, 94, 76, 99)):
            o += path(f'M{x1},{y1} L{x2},{y2}', stroke('#9FB6CC', 2.6))
        o += path('M122,90 l3,-8 l3,8 l8,3 l-8,3 l-3,8 l-3,-8 l-8,-3 Z', 'fill="#FFFFFF" stroke="#9FB6CC" stroke-width="1.6"')
    else:
        o += f'<g transform="translate({bx} {by}) scale(1.3) translate({-bx} {-by})">{g}</g>'
    return o


# ======================================================================= UMBRELLA LEAF (spare)
def umbrella_leaf():
    can, (ox, oy) = leaf_canopy(110, 62, 206, 92)
    stalk = f'M{f(ox)},{f(oy)} C{f(ox - 4)},{f(oy + 30)} {f(ox + 6)},{f(oy + 54)} {f(ox - 8)},{f(oy + 70)}'
    o = path(stalk, stroke('#2F7A47', 8 + 2 * 3.4)) + path(stalk, stroke('#6DB86C', 8))
    return o + can


# ======================================================================= ICON
def drum(cx, top, w, h, base, dark, light):
    """Side-view toy drum, top skin ellipse centre (cx, top)."""
    ry = w * 0.16
    o = path(f'M{f(cx - w / 2)},{f(top)} L{f(cx - w / 2)},{f(top + h)} A{f(w / 2)},{f(ry)} 0 0 0 {f(cx + w / 2)},{f(top + h)} '
             f'L{f(cx + w / 2)},{f(top)} Z', filled(base, dark, 5))
    o += path(f'M{f(cx - w / 2 + 10)},{f(top + 14)} L{f(cx - w / 2 + 10)},{f(top + h - 4)}', stroke(light, 8) + ' opacity=".8"')
    # zig-zag cord
    n = 5
    pts = []
    for i in range(n * 2 + 1):
        x = cx - w / 2 + 8 + (w - 16) * i / (n * 2)
        t = (x - cx) / (w / 2)
        bow = ry * math.sqrt(max(0, 1 - t * t))
        y = (top + 10 + bow) if i % 2 == 0 else (top + h - 8 + bow)
        pts.append(f'{f(x)},{f(y)}')
    o += path('M' + ' L'.join(pts), stroke('#FFF6E4', 4))
    # bottom rim + top rim + skin
    o += path(f'M{f(cx - w / 2)},{f(top + h - 8)} A{f(w / 2)},{f(ry)} 0 0 0 {f(cx + w / 2)},{f(top + h - 8)}', stroke(dark, 10))
    o += ell(cx, top, w / 2, ry, filled(dark, dark, 5))
    o += ell(cx, top - 3, w / 2 - 6, ry - 4, filled('#FFF6E4', '#E3D2AE', 2.5))
    o += ell(cx - w * 0.16, top - 6, w * 0.14, ry * 0.3, 'fill="#FFFFFF" opacity=".8"')
    return o


def icon():
    defs = ('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9D4EA"/>'
            '<stop offset="1" stop-color="#E9F3EC"/></linearGradient>')
    o = '<rect width="512" height="512" fill="url(#isky)"/>'
    # soft rain clouds
    for cx, cy, s in ((96, 40, 1.0), (300, 22, 1.2), (470, 54, 0.9)):
        o += ''.join(circ(cx + dx * s, cy + dy * s, r * s, 'fill="#F4F8FB"') for dx, dy, r in
                     ((-46, 10, 34), (0, -6, 46), (48, 8, 36), (0, 22, 40)))
        o += ell(cx, cy + 34 * s, 74 * s, 12 * s, 'fill="#C9D8E6"')
    # raindrops
    for x, y in ((40, 120), (150, 104), (226, 150), (330, 112), (420, 140), (490, 106), (70, 210), (380, 214),
                 (470, 220), (262, 92), (190, 196)):
        o += path(f'M{x},{y} q-7,12 0,16 q7,-4 0,-16 Z', 'fill="#5FA8DC" stroke="#3F86BE" stroke-width="2"')
        o += ell(x - 1.5, y + 11, 1.6, 2.4, 'fill="#FFFFFF"')
    # lawn
    o += path('M0,392 C120,372 260,384 380,374 C440,370 480,376 512,372 L512,512 L0,512 Z', 'fill="#8CC47A"')
    o += path('M0,446 C140,430 300,442 512,428 L512,512 L0,512 Z', 'fill="#6FAE66"')
    for x, y in ((36, 470), (220, 488), (480, 466)):
        o += circ(x, y, 7, 'fill="#FFF4DA"') + circ(x, y, 3, 'fill="#F6C96B"')
    # drums on the right: blue back, yellow back, red front
    o += drum(440, 250, 112, 118, '#3C8DE8', '#1F5BA8', '#A6CCF5')
    o += drum(426, 322, 112, 96, '#FFD23F', '#C99A12', '#FFEB9C')
    o += drum(356, 414, 150, 96, '#E84A4A', '#A8282E', '#F7A0A0')
    # Bop (drumming, happy) in front, scaled: stick tips land on the red drum's skin
    d, b, _ = bop('icon', 'i')
    defs += d
    o += f'<g transform="translate(-30 176) scale(1.12)">{b}</g>'
    return defs, o


# ======================================================================= main
def main():
    tips = {}
    for m in ('idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'drum', 'drum_up', 'umbrella'):
        d, b, t = bop(m)
        tips[m] = t
        write(f'characters/bop_{m}.svg', svg(300, 300, b, d))
    d, b, t = bop('wave')
    tips['full_wave'] = t
    write('characters/bop_full_wave.svg', svg(300, 300, b, d))
    write('characters/snail.svg', svg(140, 110, snail(False)))
    write('characters/snail_ring.svg', svg(140, 110, snail(True)))
    write('characters/umbrella_leaf.svg', svg(220, 160, umbrella_leaf()))
    d, b = icon()
    write('icon.svg', svg(512, 512, b, d))
    for k, v in tips.items():
        print(k, 'stick tips', ' '.join(f'({f(x)},{f(y)})' for x, y in v))


if __name__ == '__main__':
    main()
