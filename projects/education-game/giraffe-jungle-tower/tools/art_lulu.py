#!/usr/bin/env python3
"""Character / UI art generator for Lulu's Jungle Tower (character artist A).

Writes (relative to game/assets/default/):
  characters/lulu_{idle,blink,talk,happy,cheer,think,oops,hold}.svg   0 0 300 440
        Lulu the baby giraffe, 3/4 view facing RIGHT (towards the tower). FEET anchor (150, 432).
        Body, legs, tail and neckerchief are IDENTICAL in every frame (cheer only flicks the tail up).
        The neck is a bent tube from the fixed neck base NECK_BASE to the head joint; the head (drawn in its own
        local frame, origin = head joint) moves/rotates per frame (see HEAD below).
          idle · blink · talk (mouth open) · happy (big smile) · cheer (head up, eyes-closed smile, tail flick)
          think (head tilt, eyes up) · oops ("hmm?" tilt, one brow up, never sad)
          hold (neck leaning right, the front of the head pressing gently at x≈285, y≈60)
  characters/lulu_full_wave.svg   0 0 300 440   title pose: near front leg raised and waving, happy face
  characters/monkey_{swing,grab,cheer}.svg   0 0 160 200   vine-hand anchor (80, 6)
  characters/bananas.svg      0 0 120 130   stem top at (60, 6)
  characters/butterfly.svg, characters/butterfly_up.svg   0 0 96 80   wings open / wings up (flap frames)
  icon.svg   0 0 512 512   full bleed: Lulu's head + neck beside a red/blue/yellow 3-block tower under jungle leaves

Usage: python3 tools/art_lulu.py [outDir]
Rules (docs/DESIGN.md §3): 100 % original, flat cartoon, ≈4 px outline in a darker tone (never black), one-step cel
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
    'fur': '#EDCB92', 'shade': '#D6AE6E', 'line': '#8A5A32', 'hi': '#F8E3BC',
    'patch': '#B9773F', 'patchSh': '#A4652F',
    'muzzle': '#FFF0D8', 'muzzleSh': '#F2DDBC',
    'tuft': '#6B4326', 'tuftHi': '#8C5E3B', 'hoof': '#6B4326', 'hoofHi': '#8C5E3B',
    'eye': '#2F2A3A', 'white': '#FFFFFF', 'cheek': '#F6B1A0', 'mouth': '#7A3346', 'tongue': '#F08AA0',
    'innerEar': '#F3C2A8',
    'kerch': '#7CCBB5', 'kerchDk': '#4E9C88', 'kerchLn': '#3A7868', 'kerchHi': '#B4E4D6',
}
LW = 4.5            # outline width at viewBox 300×440
NECK_BASE = (186, 272)
FEET_Y = 432


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


def clip(cid, d):
    return f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'


def g_clip(cid, inner):
    return f'<g clip-path="url(#{cid})">{inner}</g>'


def blob(pts, fill, extra=''):
    """A rounded patch: polygon filled and stroked in the same colour (round joins round the corners)."""
    d = 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'
    return path(d, f'fill="{fill}" stroke="{fill}" stroke-width="7" stroke-linejoin="round" {extra}')


def rot(p, a, o=(0, 0)):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    x, y = p[0] - o[0], p[1] - o[1]
    return (o[0] + x * c - y * s, o[1] + x * s + y * c)


# ======================================================================= LULU
# ---------------------------------------------------------------- legs
# leg = (top x, top y, upper angle, lower angle (relative to the upper), near?)  angle 0 = straight down, + = towards +x
UP_LEN, LO_LEN, HOOF_H = 44, 50, 16
LEGS_STAND = {
    'backFar': (114, 322, 0, 0, False),
    'frontFar': (206, 318, 0, 0, False),
    'backNear': (94, 324, 0, 0, True),
    'frontNear': (182, 320, 0, 0, True),
}


def leg(p, x, y, a1, a2, near, cid):
    fill = P['fur'] if near else P['shade']
    k = (x - UP_LEN * math.sin(math.radians(a1)) * -1, y + UP_LEN * math.cos(math.radians(a1)))
    at = a1 + a2
    e = (k[0] + LO_LEN * math.sin(math.radians(at)), k[1] + LO_LEN * math.cos(math.radians(at)))
    w1, w2 = 27, 22
    o = ''
    # outlines (thick strokes), then fills
    o += path(f'M{f(x)},{f(y - 30)} L{f(x)},{f(y)} L{f(k[0])},{f(k[1])}', stroke(P['line'], w1 + 2 * LW))
    o += path(f'M{f(k[0])},{f(k[1])} L{f(e[0])},{f(e[1])}', stroke(P['line'], w2 + 2 * LW))
    o += circ(k[0], k[1], 14.5 + LW, f'fill="{P["line"]}"')
    o += path(f'M{f(x)},{f(y - 30)} L{f(x)},{f(y)} L{f(k[0])},{f(k[1])}', stroke(fill, w1))
    o += path(f'M{f(k[0])},{f(k[1])} L{f(e[0])},{f(e[1])}', stroke(fill, w2))
    o += circ(k[0], k[1], 14.5, f'fill="{fill}"')
    # shading stripe on the back side of the leg + a knee highlight
    if near:
        o += path(f'M{f(k[0] + 6)},{f(k[1] + 6)} L{f(e[0] + 5)},{f(e[1] - 4)}', stroke(P['shade'], 7) + ' opacity=".8"')
        o += ell(k[0] - 4, k[1] - 4, 5, 4, f'fill="{P["hi"]}" opacity=".8"')
        # a toffee patch on the thigh
        o += blob([(x - 8, y - 2), (x + 6, y - 6), (x + 9, y + 10), (x - 4, y + 14)], P['patch'])
    # hoof (drawn in the lower segment's frame)
    hp = [(-13, -2), (13, -2), (14, HOOF_H - 4), (10, HOOF_H), (-10, HOOF_H), (-14, HOOF_H - 4)]
    hp = [rot((e[0] + px, e[1] + py), -at, e) for px, py in hp]
    d = 'M' + ' L'.join(f'{f(px)},{f(py)}' for px, py in hp) + ' Z'
    o += path(d, filled(P['hoof'], P['line'], LW * 0.8))
    hl = rot((e[0] - 7, e[1] + 4), -at, e)
    o += ell(hl[0], hl[1], 4, 2.4, f'fill="{P["hoofHi"]}"', -at)
    return o


def legs(p, pose):
    L = dict(LEGS_STAND)
    if pose == 'wave':
        x, y, _, _, n = L['frontNear']
        L['frontNear'] = (x, y, 74, -52, n)    # knee lifted forward, hoof raised off the grass: a hoof wave
    far = leg(p, *L['backFar'], p + 'lbf') + leg(p, *L['frontFar'], p + 'lff')
    near_back = leg(p, *L['backNear'], p + 'lbn')
    near_front = leg(p, *L['frontNear'], p + 'lfn')
    return far, near_back, near_front


# ---------------------------------------------------------------- torso, tail
TORSO = [(70, 290), (92, 262), (140, 254), (188, 252), (222, 270), (228, 300), (212, 336), (160, 346),
         (110, 344), (72, 330)]
TORSO_D = smooth_d(TORSO)


def torso(p):
    cid = p + 'torso'
    defs = clip(cid, TORSO_D)
    o = path(TORSO_D, f'fill="{P["fur"]}"')
    inner = ell(150, 352, 96, 30, f'fill="{P["shade"]}"')           # belly shade
    inner += ell(70, 315, 18, 40, f'fill="{P["shade"]}" opacity=".7"')
    for pts in ([(96, 270), (122, 264), (128, 284), (106, 294), (92, 286)],
                [(140, 266), (166, 262), (172, 282), (150, 292), (136, 284)],
                [(118, 300), (142, 296), (146, 318), (122, 324), (112, 314)],
                [(160, 302), (186, 298), (194, 318), (170, 328), (158, 318)],
                [(78, 300), (92, 298), (96, 318), (80, 322)],
                [(198, 286), (214, 282), (220, 300), (204, 306)]):
        inner += blob(pts, P['patch'])
    inner += ell(116, 266, 30, 8, f'fill="{P["hi"]}" opacity=".75"', -6)
    o += g_clip(cid, inner) + path(TORSO_D, stroke(P['line'], LW))
    return defs, o


def tail(pose):
    if pose == 'flick':
        d = 'M76,282 C58,272 46,250 52,226'
        tip = (52, 222, -20)
    else:
        d = 'M74,286 C56,296 50,318 52,346'
        tip = (52, 352, 10)
    o = path(d, stroke(P['line'], 9 + 2 * LW * 0.8)) + path(d, stroke(P['fur'], 9))
    x, y, a = tip
    tuft = smooth_d([(x - 9, y - 6), (x, y - 12), (x + 9, y - 6), (x + 8, y + 10), (x + 2, y + 18, 'c'),
                     (x - 3, y + 12), (x - 9, y + 16, 'c'), (x - 10, y + 6)])
    o += f'<g transform="rotate({f(a)} {f(x)} {f(y)})">' + path(tuft, filled(P['tuft'], P['line'], LW * 0.8))
    o += path(f'M{f(x - 2)},{f(y - 4)} q2,8 -1,14', stroke(P['tuftHi'], 2.2)) + '</g>'
    return o


# ---------------------------------------------------------------- neck
def neck_geom(J, bend):
    """Sampled tube from NECK_BASE to joint J. Returns (left edge, right edge, centre points)."""
    B = NECK_BASE
    mx, my = (B[0] + J[0]) / 2, (B[1] + J[1]) / 2
    dx, dy = J[0] - B[0], J[1] - B[1]
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln, dx / ln               # left normal
    C = (mx + nx * bend, my + ny * bend)
    left, right, cen = [], [], []
    N = 14
    for i in range(N + 1):
        t = i / N
        x = (1 - t) ** 2 * B[0] + 2 * (1 - t) * t * C[0] + t * t * J[0]
        y = (1 - t) ** 2 * B[1] + 2 * (1 - t) * t * C[1] + t * t * J[1]
        tx = 2 * (1 - t) * (C[0] - B[0]) + 2 * t * (J[0] - C[0])
        ty = 2 * (1 - t) * (C[1] - B[1]) + 2 * t * (J[1] - C[1])
        tl = math.hypot(tx, ty)
        ux, uy = -ty / tl, tx / tl           # normal pointing to the back of the neck (viewer's left)
        w = 30 - 10 * t
        left.append((x - ux * w, y - uy * w))
        right.append((x + ux * w, y + uy * w))
        cen.append((x, y, ux, uy, w))
    return left, right, cen


def neck(p, J, bend):
    left, right, cen = neck_geom(J, bend)
    # extend the base down into the torso so it joins smoothly
    pts = [(left[0][0] - 6, left[0][1] + 26)] + left + right[::-1] + [(right[0][0] + 4, right[0][1] + 30)]
    d = smooth_d(pts)
    cid = p + 'neck'
    defs = clip(cid, d)
    # mane: rounded bumps along the back edge
    mane = ''
    for i in range(2, 14, 2):
        x, y, ux, uy, w = cen[i]
        mx, my = x - ux * (w + 3), y - uy * (w + 3)
        mane += circ(mx, my, 7.5, filled(P['patch'], P['line'], LW * 0.75))
    o = mane + path(d, f'fill="{P["fur"]}"')
    inner = ''
    # back-side shade strip
    sh = left + [(c[0] - c[2] * c[4] * 0.35, c[1] - c[3] * c[4] * 0.35) for c in cen[::-1]]
    inner += path('M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in sh) + ' Z', f'fill="{P["shade"]}" opacity=".75"')
    # patches along the neck
    for t_i, side, s in ((3, 0.15, 1.0), (7, -0.25, 0.85), (10, 0.3, 0.75), (12, -0.35, 0.6)):
        x, y, ux, uy, w = cen[t_i]
        px, py = x + ux * w * side, y + uy * w * side
        r = 11 * s
        pts = [(px - r, py - r * 0.6), (px + r * 0.5, py - r), (px + r, py + r * 0.3), (px - r * 0.2, py + r)]
        inner += blob(pts, P['patch'])
    # front highlight
    hl = [(c[0] + c[2] * c[4] * 0.45, c[1] + c[3] * c[4] * 0.45) for c in cen[2:10]]
    inner += path('M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in hl), stroke(P['hi'], 5) + ' opacity=".7"')
    o += g_clip(cid, inner)
    o += path(smooth_d(left, close=False), stroke(P['line'], LW))
    o += path(smooth_d(right, close=False), stroke(P['line'], LW))
    return defs, o


# ---------------------------------------------------------------- neckerchief (fixed, around the neck base)
def kerchief(p):
    bx, by = NECK_BASE
    band = smooth_d([(bx - 34, by - 6), (bx - 6, by + 4), (bx + 24, by - 2), (bx + 33, by + 8), (bx + 6, by + 18),
                     (bx - 30, by + 10)])
    tri = smooth_d([(bx + 2, by + 8), (bx + 34, by + 2), (bx + 30, by + 26), (bx + 18, by + 44, 'c'),
                    (bx + 6, by + 30)])
    o = path(tri, filled(P['kerch'], P['kerchLn']))
    o += path(f'M{f(bx + 12)},{f(by + 14)} L{f(bx + 20)},{f(by + 34)}', stroke(P['kerchDk'], 3.2))
    o += path(band, filled(P['kerch'], P['kerchLn']))
    o += path(f'M{f(bx - 26)},{f(by + 6)} Q{f(bx)},{f(by + 14)} {f(bx + 26)},{f(by + 8)}', stroke(P['kerchDk'], 3.4))
    o += path(f'M{f(bx - 22)},{f(by - 2)} Q{f(bx - 4)},{f(by + 6)} {f(bx + 10)},{f(by + 3)}', stroke(P['kerchHi'], 3))
    # little white dots on the cloth
    for dx, dy in ((-16, 4), (2, 10), (20, 22), (14, 6)):
        o += circ(bx + dx, by + dy, 2.2, f'fill="{P["white"]}" opacity=".85"')
    # knot
    o += ell(bx + 30, by + 4, 7.5, 6.5, filled(P['kerchDk'], P['kerchLn'], LW * 0.8))
    return '', o


# ---------------------------------------------------------------- head (local frame: origin = head joint)
CRAN = (6, -50, 50, 46)       # cx, cy, rx, ry
MUZ = (50, -30, 33, 25)
EYE_N = (14, -56)
EYE_F = (43, -60)


def head_outline_pts():
    pts = []
    for cx, cy, rx, ry in (CRAN, MUZ):
        for i in range(72):
            a = i * math.pi / 36
            pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    return pts


def ossicone(x, y, a, far):
    fill = P['shade'] if far else P['fur']
    o = f'<g transform="rotate({f(a)} {f(x)} {f(y)})">'
    o += path(f'M{f(x - 5.5)},{f(y + 8)} L{f(x - 4)},{f(y - 16)} L{f(x + 4)},{f(y - 16)} L{f(x + 5.5)},{f(y + 8)} Z',
              filled(fill, P['line'], LW * 0.8))
    o += circ(x, y - 19, 8, filled(P['tuft'], P['line'], LW * 0.75))
    o += circ(x - 2.5, y - 21.5, 2.5, f'fill="{P["tuftHi"]}"')
    return o + '</g>'


def ear(x, y, a, far):
    o = f'<g transform="rotate({f(a)} {f(x)} {f(y)})">'
    d = smooth_d([(x, y - 9), (x - 20, y - 6), (x - 30, y, 'c'), (x - 20, y + 7), (x, y + 8)])
    o += path(d, filled(P['shade'] if far else P['fur'], P['line'], LW * 0.85))
    o += path(smooth_d([(x - 2, y - 4), (x - 16, y - 3), (x - 23, y, 'c'), (x - 16, y + 3), (x - 2, y + 4)]),
              f'fill="{P["innerEar"]}"')
    return o + '</g>'


def eye(kind, cx, cy, s, look=(0, 0), near=True):
    rx, ry = 10.5 * s, 13.5 * s
    o = ''
    lash = P['eye']
    if kind in ('open', 'wide', 'up'):
        if kind == 'wide':
            ry *= 1.08
        lx, ly = look
        if kind == 'up':
            ly = -3.2 * s
        o += ell(cx, cy, rx, ry, f'fill="{P["eye"]}"')
        o += circ(cx - 3.6 * s + lx, cy - 4.8 * s + ly, 4.3 * s, f'fill="{P["white"]}"')
        o += circ(cx + 3.6 * s + lx, cy + 4.4 * s + ly * 0.4, 2 * s, f'fill="{P["white"]}"')
        # lashes on the outer-top edge
        if near:
            o += path(f'M{f(cx - rx * 0.7)},{f(cy - ry * 0.75)} l{f(-5 * s)},{f(-5 * s)}', stroke(lash, 2.6 * s))
            o += path(f'M{f(cx - rx * 0.15)},{f(cy - ry * 0.98)} l{f(-2.5 * s)},{f(-6.5 * s)}', stroke(lash, 2.6 * s))
            o += path(f'M{f(cx - rx * 0.95)},{f(cy - ry * 0.3)} l{f(-6.5 * s)},{f(-2 * s)}', stroke(lash, 2.6 * s))
        else:
            o += path(f'M{f(cx + rx * 0.5)},{f(cy - ry * 0.85)} l{f(3 * s)},{f(-5 * s)}', stroke(lash, 2.4 * s))
            o += path(f'M{f(cx + rx * 0.9)},{f(cy - ry * 0.45)} l{f(5 * s)},{f(-3 * s)}', stroke(lash, 2.4 * s))
    elif kind == 'blink':       # relaxed shut lid  ‿
        o += path(f'M{f(cx - rx)},{f(cy)} Q{f(cx)},{f(cy + ry * 0.75)} {f(cx + rx)},{f(cy)}', stroke(P['eye'], 3.4 * s))
        if near:
            o += path(f'M{f(cx - rx)},{f(cy)} l{f(-5 * s)},{f(2 * s)}', stroke(lash, 2.6 * s))
            o += path(f'M{f(cx - rx * 0.5)},{f(cy + ry * 0.33)} l{f(-3 * s)},{f(5 * s)}', stroke(lash, 2.6 * s))
    elif kind == 'smile':       # happy shut  ∩
        o += path(f'M{f(cx - rx)},{f(cy + 3 * s)} Q{f(cx)},{f(cy - ry * 0.95)} {f(cx + rx)},{f(cy + 3 * s)}',
                  stroke(P['eye'], 3.8 * s))
        if near:
            o += path(f'M{f(cx - rx)},{f(cy + 3 * s)} l{f(-5 * s)},{f(-2 * s)}', stroke(lash, 2.6 * s))
    return o


def brow(cx, cy, a, s=1.0):
    return path(f'M{f(cx - 7 * s)},{f(cy + 1)} Q{f(cx)},{f(cy - 4 * s)} {f(cx + 7 * s)},{f(cy + 1)}',
                stroke(P['line'], 3.2) + f' transform="rotate({f(a)} {f(cx)} {f(cy)})"')


def mouth(kind):
    mx, my = 0, 0
    o = ''
    if kind == 'smile':
        o += path(f'M{f(mx - 12)},{f(my - 3)} Q{f(mx)},{f(my + 7)} {f(mx + 12)},{f(my - 4)}', stroke(P['line'], 3.4))
    elif kind == 'talk':
        d = smooth_d([(mx - 10, my - 4), (mx, my - 6), (mx + 10, my - 4), (mx + 7, my + 8), (mx, my + 11),
                      (mx - 7, my + 8)])
        o += path(d, filled(P['mouth'], P['line'], 3))
        o += ell(mx, my + 6, 5.5, 3.2, f'fill="{P["tongue"]}"')
    elif kind == 'big':
        d = smooth_d([(mx - 15, my - 6, 'c'), (mx, my - 3), (mx + 15, my - 7, 'c'), (mx + 10, my + 7), (mx, my + 12),
                      (mx - 10, my + 7)])
        o += path(d, filled(P['mouth'], P['line'], 3.2))
        o += ell(mx + 1, my + 7, 7, 3.6, f'fill="{P["tongue"]}"')
        o += path(f'M{f(mx - 12)},{f(my - 5)} Q{f(mx)},{f(my - 1)} {f(mx + 12)},{f(my - 6)}', stroke(P['white'], 2.4))
    elif kind == 'o':
        o += ell(mx - 2, my, 5, 6, filled(P['mouth'], P['line'], 3))
    elif kind == 'hmm':
        o += path(f'M{f(mx - 9)},{f(my)} Q{f(mx - 2)},{f(my - 4)} {f(mx + 3)},{f(my)} T{f(mx + 11)},{f(my - 2)}',
                  stroke(P['line'], 3.2))
    elif kind == 'push':        # cheeks puffed, closed determined smile
        o += path(f'M{f(mx - 9)},{f(my - 1)} Q{f(mx)},{f(my + 5)} {f(mx + 10)},{f(my - 2)}', stroke(P['line'], 3.4))
        o += path(f'M{f(mx - 11)},{f(my - 4)} q-1,3 1,6', stroke(P['line'], 2.4))
    return f'<g transform="translate(56 -16) scale(1.22)">{o}</g>'


HEAD = {   # mood: eyes, mouth, brows, look, cheeks scale
    'idle': ('open', 'smile', None, (1, 0), 1.0),
    'blink': ('blink', 'smile', None, (0, 0), 1.0),
    'talk': ('open', 'talk', None, (1, 0), 1.0),
    'happy': ('open', 'big', None, (1, 0), 1.15),
    'cheer': ('smile', 'big', None, (0, 0), 1.25),
    'think': ('up', 'hmm', 'think', (0, 0), 0.9),
    'oops': ('wide', 'o', 'oops', (0, 0), 1.0),
    'hold': ('open', 'push', 'push', (2.5, 0), 1.25),
    'wave': ('open', 'big', None, (0, 0), 1.15),
}


def head(p, mood):
    ek, mk, bk, look, chk = HEAD[mood]
    cx, cy, rx, ry = CRAN
    o = ''
    # far side parts behind the cranium
    o += ear(-22, -82, 30, True)
    o += ossicone(20, -90, 14, True)
    o += ossicone(-6, -88, -12, False)
    o += ear(-30, -64, -14, False)
    # cranium
    cd = (f'M{f(cx - rx)},{f(cy)} a{f(rx)},{f(ry)} 0 1 0 {f(2 * rx)},0 a{f(rx)},{f(ry)} 0 1 0 {f(-2 * rx)},0 Z')
    cid = p + 'cran'
    defs = clip(cid, cd)
    o += path(cd, f'fill="{P["fur"]}"')
    inner = ell(cx - 12, cy + 34, 52, 24, f'fill="{P["shade"]}"', 10)
    inner += blob([(-30, -72), (-14, -78), (-10, -64), (-24, -58)], P['patch'])
    inner += blob([(-40, -50), (-30, -48), (-32, -36), (-42, -40)], P['patch'])
    inner += ell(-14, -78, 18, 9, f'fill="{P["hi"]}" opacity=".9"', -25)
    o += g_clip(cid, inner) + path(cd, stroke(P['line'], LW))
    # muzzle
    mx, my, mrx, mry = MUZ
    md = (f'M{f(mx - mrx)},{f(my)} a{f(mrx)},{f(mry)} 0 1 0 {f(2 * mrx)},0 a{f(mrx)},{f(mry)} 0 1 0 {f(-2 * mrx)},0 Z')
    mid = p + 'muz'
    defs += clip(mid, md)
    o += path(md, f'fill="{P["muzzle"]}"')
    o += g_clip(mid, ell(mx - 4, my + 20, 34, 12, f'fill="{P["muzzleSh"]}"') +
                ell(mx - 10, my - 14, 12, 5, f'fill="{P["white"]}" opacity=".7"', -15))
    o += path(md, stroke(P['line'], LW))
    # nostrils
    o += ell(70, -38, 3.2, 2.2, f'fill="{P["line"]}"', -20) + ell(79, -35, 2.6, 2, f'fill="{P["line"]}"', -20)
    # cheeks
    o += ell(0, -30, 11 * chk, 7 * chk, f'fill="{P["cheek"]}" opacity=".85"')
    o += ell(32, -26, 6 * chk, 4.5 * chk, f'fill="{P["cheek"]}" opacity=".7"')
    # eyes
    o += eye(ek, EYE_F[0], EYE_F[1], 0.72, look, near=False)
    o += eye(ek, EYE_N[0], EYE_N[1], 1.0, look, near=True)
    if bk == 'think':
        o += brow(EYE_N[0] - 1, EYE_N[1] - 22, -12) + brow(EYE_F[0] + 1, EYE_F[1] - 17, 10, 0.7)
    elif bk == 'oops':
        o += brow(EYE_N[0], EYE_N[1] - 25, -16) + brow(EYE_F[0], EYE_F[1] - 16, 4, 0.7)
    elif bk == 'push':
        o += brow(EYE_N[0] + 1, EYE_N[1] - 20, 8) + brow(EYE_F[0], EYE_F[1] - 15, -6, 0.7)
    o += mouth(mk)
    return defs, o


# head joint + rotation + neck bend per frame
def solve_hold():
    """Place the head so its front-most point sits at (285, 60): Lulu stretches up and presses her forehead
    gently against the tower top. Smallest nose-down tilt that keeps the ossicone tufts inside the viewBox."""
    tips = [(-6 + 3, -116), (20 - 4, -118)]
    for a in range(30, 80):
        pts = [rot(q, a) for q in head_outline_pts()]
        pts += [(q[0] + 8, q[1]) for q in (rot(t, a) for t in tips)]   # tuft balls (r 8) must not poke past the contact
        best = max(pts, key=lambda q: q[0])
        J = (285 - best[0], 60 - best[1])
        top = min(J[1] + rot(q, a)[1] for q in tips + head_outline_pts())
        if top >= 6:
            return (J[0], J[1]), a
    raise SystemExit('no hold pose')


HOLD_J, HOLD_A = solve_hold()
POSE = {   # mood: (joint, head rotation, neck bend)
    'idle': ((196, 150), 0, 8),
    'blink': ((196, 150), 0, 8),
    'talk': ((196, 150), -2, 8),
    'happy': ((197, 148), -4, 8),
    'cheer': ((190, 140), -16, 12),
    'think': ((192, 152), -12, 10),
    'oops': ((198, 152), 12, 6),
    'hold': (HOLD_J, HOLD_A, 22),
    'wave': ((194, 148), -6, 9),
}


def lulu(mood, p='l'):
    J, a, bend = POSE[mood]
    defs = ''
    body = ''
    far, nb, nf = legs(p, 'wave' if mood == 'wave' else 'stand')
    body += tail('flick' if mood == 'cheer' else 'down')
    body += far + nb + nf
    d, t = torso(p)
    defs += d
    body += t
    d, n = neck(p, J, bend)
    defs += d
    body += n
    d, k = kerchief(p)
    body += k
    d, h = head(p, mood)
    defs += d
    body += f'<g transform="translate({f(J[0])} {f(J[1])}) rotate({f(a)})">{h}</g>'
    return defs, body


def head_box(mood):
    J, a, _ = POSE[mood]
    pts = [rot(q, a) for q in head_outline_pts()]
    xs = [J[0] + q[0] for q in pts]
    ys = [J[1] + q[1] for q in pts]
    mx, my = rot((MUZ[0], MUZ[1] + 14), a)
    return (round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))), (round(J[0] + mx), round(J[1] + my))


# ======================================================================= MONKEY
M = {'fur': '#9A6A48', 'shade': '#83573A', 'line': '#5E3A24', 'hi': '#B88A66', 'face': '#F3DDBF',
     'faceSh': '#E3C7A2', 'mouth': '#7A3346', 'tongue': '#F08AA0', 'vine': '#5E8E4A', 'vineLn': '#3E6533'}
MLW = 3.6


def limb(pts, w, fill=None):
    d = 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts)
    return path(d, stroke(M['line'], w + 2 * MLW)), path(d, stroke(fill or M['fur'], w))


def mhand(x, y, r=7.5):
    return circ(x, y, r, filled(M['face'], M['line'], MLW * 0.8))


def mini_bananas(x, y, s=0.55):
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(s)}) translate(-60 -6)">{bananas_body("mb")[1]}</g>', \
        bananas_body('mb')[0]


def monkey(kind):
    defs = ''
    o = ''
    A = (80, 6)
    # vine stub above the hand
    o += path('M80,0 L80,10', stroke(M['vineLn'], 9)) + path('M80,0 L80,10', stroke(M['vine'], 5))
    # tail: long curl
    td = 'M96,150 C126,160 140,130 128,112 C120,100 104,108 112,120' if kind != 'cheer' else \
        'M96,150 C130,150 146,124 136,104 C128,90 112,98 120,110'
    o += path(td, stroke(M['line'], 6 + 2 * MLW)) + path(td, stroke(M['fur'], 6))
    sh = (82, 70)
    # legs
    if kind == 'cheer':
        legL = [(72, 150), (52, 164), (40, 156)]
        legR = [(90, 152), (110, 166), (124, 160)]
    else:
        legL = [(72, 152), (66, 172), (70, 188)]
        legR = [(88, 152), (94, 172), (90, 188)]
    for lp in (legL, legR):
        a, b = limb(lp, 12)
        o += a + b
        o += ell(lp[-1][0], lp[-1][1] + 2, 8, 5.5, filled(M['face'], M['line'], MLW * 0.8))
    # holding arm up to the vine
    a, b = limb([sh, (84, 40), A], 11)
    o += a + b
    # body
    bd = smooth_d([(64, 92), (80, 80), (98, 92), (102, 124), (94, 152), (80, 158), (66, 152), (58, 124)])
    o += path(bd, filled(M['fur'], M['line'], MLW))
    o += ell(80, 126, 14, 20, f'fill="{M["face"]}"')
    o += ell(70, 100, 6, 10, f'fill="{M["hi"]}" opacity=".8"', 20)
    # other arm
    if kind == 'swing':
        arm = [(66, 96), (46, 110), (38, 128)]
        hand = arm[-1]
    elif kind == 'grab':
        arm = [(68, 96), (44, 104), (28, 92)]
        hand = arm[-1]
    else:
        arm = [(66, 96), (40, 86), (26, 64)]
        hand = arm[-1]
    a, b = limb(arm, 10)
    o += a + b
    # head (hanging beside the holding arm)
    hx, hy = 66, 66
    o += circ(hx - 30, hy, 11, filled(M['fur'], M['line'], MLW)) + circ(hx - 30, hy, 6, f'fill="{M["face"]}"')
    o += circ(hx + 30, hy - 2, 10, filled(M['fur'], M['line'], MLW)) + circ(hx + 30, hy - 2, 5.5,
                                                                             f'fill="{M["face"]}"')
    o += circ(hx, hy, 29, filled(M['fur'], M['line'], MLW))
    o += path(f'M{hx - 20},{hy - 22} q6,-8 14,-6 q-4,-6 4,-8', stroke(M['line'], 3) + ' opacity=".0"')
    # tuft of hair on top
    o += path(f'M{hx - 6},{hy - 28} q4,-10 12,-8 q-6,2 -4,8', filled(M['fur'], M['line'], MLW * 0.8))
    # heart-ish face mask
    face = smooth_d([(hx - 20, hy - 6), (hx - 10, hy - 18), (hx, hy - 10, 'c'), (hx + 10, hy - 18), (hx + 21, hy - 6),
                     (hx + 18, hy + 14), (hx, hy + 24), (hx - 18, hy + 14)])
    o += path(face, filled(M['face'], M['line'], MLW * 0.7))
    o += ell(hx - 14, hy - 16, 7, 4, f'fill="{M["hi"]}" opacity=".8"', -30)
    # eyes
    if kind == 'cheer':
        for ex in (hx - 9, hx + 9):
            o += path(f'M{ex - 5},{hy - 3} Q{ex},{hy - 10} {ex + 5},{hy - 3}', stroke(P['eye'], 3))
    else:
        for ex in (hx - 9, hx + 9):
            o += ell(ex, hy - 4, 4.2, 5.5, f'fill="{P["eye"]}"') + circ(ex - 1.5, hy - 6, 1.8, f'fill="{P["white"]}"')
    o += ell(hx - 3, hy + 5, 1.6, 1.2, f'fill="{M["line"]}"') + ell(hx + 3, hy + 5, 1.6, 1.2, f'fill="{M["line"]}"')
    o += ell(hx - 15, hy + 7, 4.5, 3, f'fill="{P["cheek"]}" opacity=".8"') + \
        ell(hx + 15, hy + 7, 4.5, 3, f'fill="{P["cheek"]}" opacity=".8"')
    if kind == 'swing':
        o += path(f'M{hx - 8},{hy + 11} Q{hx},{hy + 18} {hx + 8},{hy + 11}', stroke(M['line'], 2.8))
    else:
        md = smooth_d([(hx - 11, hy + 10, 'c'), (hx, hy + 12), (hx + 11, hy + 10, 'c'), (hx + 6, hy + 19),
                       (hx, hy + 21), (hx - 6, hy + 19)])
        o += path(md, filled(M['mouth'], M['line'], 2.4)) + ell(hx, hy + 18, 4, 2, f'fill="{M["tongue"]}"')
        o += path(f'M{hx - 9},{hy + 11} Q{hx},{hy + 13.5} {hx + 9},{hy + 11}', stroke(P['white'], 2))
    # bananas in the free hand (grab)
    if kind == 'grab':
        g, dd = mini_bananas(hand[0] + 2, hand[1] - 4, 0.6)
        defs += dd
        o += g
    o += mhand(*hand)
    o += mhand(*A, 8)
    return defs, o


# ======================================================================= BANANAS
B = {'y': '#F6D45A', 'sh': '#DDB43C', 'ln': '#A07A22', 'hi': '#FBE9A6', 'tip': '#8DBF4A', 'tipLn': '#5E8A30',
     'end': '#6B4A26', 'stem': '#7FA046', 'stemLn': '#55742E'}


def banana(cx, cy, a, L=62, W=17):
    """A banana hanging from (cx, cy), curving outward, angle a (deg, 0 = down)."""
    # local: base at (0,0), body down to (0,L), curving to +x
    outer = [(-5, 0), (-W * 0.55, L * 0.35), (-W * 0.35, L * 0.75), (4, L * 0.98, 'c'), (W * 0.55, L * 0.7),
             (W * 0.45, L * 0.3), (5, 0, 'c')]
    d = smooth_d(outer)
    o = f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(a)})">'
    o += path(d, filled(B['y'], B['ln'], 3.4))
    o += path(f'M{f(W * 0.32)},{f(L * 0.2)} Q{f(W * 0.48)},{f(L * 0.55)} {f(W * 0.05)},{f(L * 0.88)}',
              stroke(B['sh'], 4.5))
    o += path(f'M{f(-W * 0.3)},{f(L * 0.25)} Q{f(-W * 0.35)},{f(L * 0.55)} {f(-W * 0.15)},{f(L * 0.7)}',
              stroke(B['hi'], 3.5))
    # green tip at the stem end, brown nub at the flower end
    o += path(f'M-6,{f(L * 0.02)} L6,{f(L * 0.02)} L{f(W * 0.48)},{f(L * 0.2)} L{f(-W * 0.48)},{f(L * 0.2)} Z',
              filled(B['tip'], B['tipLn'], 2.6))
    o += circ(3.5, L * 0.97, 3.4, filled(B['end'], B['end'], 1))
    return o + '</g>'


def bananas_body(p):
    o = path('M60,6 C60,14 61,20 60,30', stroke(B['stemLn'], 10)) + path('M60,6 C60,14 61,20 60,30', stroke(B['stem'], 6))
    cy = 30
    for a, L in ((48, 60), (-48, 60)):
        o += banana(60, cy, a, L)
    for a, L in ((22, 66), (-22, 66)):
        o += banana(60, cy, a, L)
    o += banana(60, cy, 0, 72, 18)
    o += ell(60, cy, 13, 8, filled(B['stem'], B['stemLn'], 3))
    o += ell(56, cy - 2, 5, 2.5, f'fill="#A8C870"')
    return '', o


# ======================================================================= BUTTERFLY
BF = {'w': '#6FC7C0', 'wDk': '#3F9A94', 'ln': '#2E6E6A', 'cream': '#FFF4DC', 'body': '#4A4058', 'dot': '#F3B6A6'}


def butterfly(up):
    o = ''
    cx, cy = 48, 44
    if not up:
        for sx in (-1, 1):
            top = smooth_d([(cx, cy - 4), (cx + sx * 14, cy - 28), (cx + sx * 34, cy - 34), (cx + sx * 42, cy - 18),
                            (cx + sx * 30, cy - 2)])
            bot = smooth_d([(cx, cy), (cx + sx * 28, cy + 4), (cx + sx * 32, cy + 22), (cx + sx * 16, cy + 30),
                            (cx + sx * 4, cy + 14)])
            o += path(bot, filled(BF['w'], BF['ln'], 3)) + path(top, filled(BF['w'], BF['ln'], 3))
            o += ell(cx + sx * 26, cy - 18, 9, 7, f'fill="{BF["cream"]}"', sx * -20)
            o += ell(cx + sx * 20, cy + 16, 6, 5, f'fill="{BF["cream"]}"')
            o += circ(cx + sx * 34, cy - 24, 2.6, f'fill="{BF["dot"]}"')
            o += path(f'M{cx + sx * 6},{cy - 8} Q{cx + sx * 18},{cy - 22} {cx + sx * 30},{cy - 26}',
                      stroke(BF['wDk'], 2) + ' opacity=".6"')
    else:
        for sx in (-1, 1):
            top = smooth_d([(cx, cy - 2), (cx + sx * 6, cy - 30), (cx + sx * 16, cy - 40), (cx + sx * 20, cy - 26),
                            (cx + sx * 8, cy - 2)])
            bot = smooth_d([(cx, cy), (cx + sx * 12, cy + 2), (cx + sx * 16, cy + 18), (cx + sx * 8, cy + 24),
                            (cx + sx * 2, cy + 12)])
            o += path(bot, filled(BF['w'], BF['ln'], 3)) + path(top, filled(BF['w'], BF['ln'], 3))
            o += ell(cx + sx * 13, cy - 26, 4, 7, f'fill="{BF["cream"]}"', sx * 15)
            o += ell(cx + sx * 9, cy + 13, 3.5, 4, f'fill="{BF["cream"]}"')
    o += ell(cx, cy + 4, 4.2, 15, filled(BF['body'], BF['body'], 1))
    o += circ(cx, cy - 13, 5.5, f'fill="{BF["body"]}"')
    o += path(f'M{cx - 2},{cy - 17} Q{cx - 8},{cy - 30} {cx - 13},{cy - 32}', stroke(BF['body'], 2))
    o += path(f'M{cx + 2},{cy - 17} Q{cx + 8},{cy - 30} {cx + 13},{cy - 32}', stroke(BF['body'], 2))
    o += circ(cx - 13, cy - 32, 2.6, f'fill="{BF["body"]}"') + circ(cx + 13, cy - 32, 2.6, f'fill="{BF["body"]}"')
    o += circ(cx - 1.6, cy - 15, 1.4, f'fill="{P["white"]}"')
    return '', o


# ======================================================================= ICON
BLK = {'red': ('#E84A4A', '#A8282E', '#F7A0A0'), 'blue': ('#3C8DE8', '#1F5BA8', '#A6CCF5'),
       'yellow': ('#FFD23F', '#C99A12', '#FFEB9C')}


def block(x, y, s, col):
    base, dk, lt = BLK[col]
    r = 0.14 * s
    top = s * 0.14
    o = f'<rect x="{f(x)}" y="{f(y)}" width="{f(s)}" height="{f(s)}" rx="{f(r)}" fill="{base}" stroke="{dk}" stroke-width="7"/>'
    o += path(f'M{f(x + r)},{f(y + 3)} L{f(x + s - r)},{f(y + 3)} Q{f(x + s - 4)},{f(y + 4)} {f(x + s - 5)},{f(y + top)} '
              f'L{f(x + 5)},{f(y + top)} Q{f(x + 4)},{f(y + 4)} {f(x + r)},{f(y + 3)} Z', f'fill="{lt}"')
    o += path(f'M{f(x + 5)},{f(y + top)} L{f(x + s - 5)},{f(y + top)}', stroke(dk, 3) + ' opacity=".6"')
    for gy in (0.42, 0.7):
        o += path(f'M{f(x + s * 0.18)},{f(y + s * gy)} q{f(s * 0.2)},{f(-s * 0.05)} {f(s * 0.4)},0 t{f(s * 0.25)},{f(s * 0.02)}',
                  stroke(dk, 3) + ' opacity=".35"')
    o += f'<rect x="{f(x + 10)}" y="{f(y + top + 8)}" width="{f(s * 0.12)}" height="{f(s * 0.38)}" rx="{f(s * 0.06)}" fill="#FFFFFF" opacity=".35"/>'
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(s)}" height="{f(s)}" rx="{f(r)}" fill="{dk}" opacity=".25" transform="translate(6 7)"/>' + o


def leaf(x, y, L, a, col, ln):
    d = smooth_d([(0, 0, 'c'), (L * 0.3, -L * 0.2), (L * 0.75, -L * 0.16), (L, 0, 'c'), (L * 0.75, L * 0.16),
                  (L * 0.3, L * 0.2)])
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(a)})">' + path(d, filled(col, ln, 5)) +
            path(f'M{f(L * 0.05)},0 L{f(L * 0.9)},0', stroke(ln, 3.5) + ' opacity=".6"') + '</g>')


def icon():
    defs = ('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE6F2"/>'
            '<stop offset="1" stop-color="#F4EFD6"/></linearGradient>')
    o = '<rect width="512" height="512" fill="url(#isky)"/>'
    # far jungle
    o += path('M0,300 C40,250 90,270 120,240 C160,200 210,250 250,230 C300,205 340,250 380,225 C430,195 470,240 512,220 '
              'L512,512 L0,512 Z', 'fill="#8DBF98"')
    o += path('M0,360 C60,330 110,350 170,330 C240,310 300,345 360,325 C420,305 470,330 512,320 L512,512 L0,512 Z',
              'fill="#5E9E6A"')
    o += path('M0,430 C100,410 220,425 320,415 C400,408 460,418 512,412 L512,512 L0,512 Z', 'fill="#4C8A5A"')
    # stump + tower (right)
    o += path('M300,460 L306,420 L470,420 L476,460 Q388,476 300,460 Z', filled('#8B5E3C', '#5E3D24', 5))
    o += ell(388, 420, 82, 14, filled('#D9B27C', '#8B5E3C', 4))
    o += ell(388, 420, 48, 8, stroke('#B58A55', 3))
    s = 104
    bx = 336
    o += block(bx, 420 - s - 6, s, 'red')
    o += block(bx + 4, 420 - 2 * s - 8, s, 'blue')
    o += block(bx - 2, 420 - 3 * s - 10, s, 'yellow')
    # Lulu head + neck (left), scaled up
    sc = 1.55
    J = (152, 304)
    pdefs, h = head('i', 'happy')
    left, right, cen = [], [], []
    # simple neck tube in icon space
    nb = (120, 560)
    nd = smooth_d([(nb[0] - 52, nb[1]), (J[0] - 46, J[1] + 40), (J[0] - 30, J[1] - 10), (J[0] + 30, J[1] - 6),
                   (J[0] + 26, J[1] + 50), (nb[0] + 64, nb[1])])
    defs += pdefs + clip('ineck', nd)
    mane = ''.join(circ(J[0] - 40 - i * 4, J[1] + 30 + i * 38, 12, filled(P['patch'], P['line'], 5)) for i in range(6))
    o += mane + path(nd, f'fill="{P["fur"]}"')
    o += g_clip('ineck', ell(60, 420, 50, 200, f'fill="{P["shade"]}" opacity=".8"') +
                blob([(130, 330), (160, 322), (168, 352), (138, 362)], P['patch']) +
                blob([(100, 400), (136, 394), (142, 430), (106, 436)], P['patch']) +
                blob([(150, 450), (178, 446), (180, 478), (152, 482)], P['patch']))
    o += path(nd, stroke(P['line'], 6))
    # kerchief at the bottom
    o += path('M30,462 Q120,492 222,456 L232,512 L24,512 Z', filled(P['kerch'], P['kerchLn'], 6))
    o += path('M36,480 Q120,506 222,474', stroke(P['kerchDk'], 4))
    o += path('M40,470 Q120,496 214,464', stroke(P['kerchHi'], 4))
    o += ''.join(circ(x, y, 4, 'fill="#FFFFFF" opacity=".85"') for x, y in ((70, 492), (120, 500), (170, 494), (210, 484)))
    o += f'<g transform="translate({f(J[0])} {f(J[1])}) scale({f(sc)}) rotate(-6)">{h}</g>'
    # jungle leaves along the top
    for x, y, L, a, c in ((-20, 30, 170, 20, '#3F7F57'), (90, -10, 150, 60, '#5E9E6A'), (200, -20, 160, 80, '#4C8A5A'),
                          (330, -10, 170, 110, '#3F7F57'), (532, 40, 180, 160, '#5E9E6A'), (520, -10, 160, 135, '#4C8A5A'),
                          (-30, -20, 160, 45, '#5E9E6A')):
        o += leaf(x, y, L, a, c, '#2F6447')
    # liana
    o += path('M256,0 C250,40 268,70 258,110', stroke('#2F6447', 9) + ' opacity=".9"')
    o += leaf(258, 108, 50, 60, '#76B47F', '#2F6447')
    return defs, o


# ======================================================================= main
def main():
    for m in ('idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'hold'):
        d, b = lulu(m)
        write(f'characters/lulu_{m}.svg', svg(300, 440, b, d))
    d, b = lulu('wave')
    write('characters/lulu_full_wave.svg', svg(300, 440, b, d))
    for k in ('swing', 'grab', 'cheer'):
        d, b = monkey(k)
        write(f'characters/monkey_{k}.svg', svg(160, 200, b, d))
    d, b = bananas_body('b')
    write('characters/bananas.svg', svg(120, 130, b, d))
    d, b = butterfly(False)
    write('characters/butterfly.svg', svg(96, 80, b, d))
    d, b = butterfly(True)
    write('characters/butterfly_up.svg', svg(96, 80, b, d))
    d, b = icon()
    write('icon.svg', svg(512, 512, b, d))
    print('wrote Lulu ×9 / monkey ×3 / bananas / butterfly ×2 / icon to', OUT)
    for m in POSE:
        box, mouth_pt = head_box(m)
        print(f'  {m:6s} joint {tuple(round(v) for v in POSE[m][0])} rot {POSE[m][1]:>4} head box {box} mouth {mouth_pt}')


if __name__ == '__main__':
    main()
