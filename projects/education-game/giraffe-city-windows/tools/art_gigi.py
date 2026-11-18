#!/usr/bin/env python3
"""Character / UI art generator for Gigi's Peekaboo Windows (character artist A).

Writes (relative to game/assets/default/):
  characters/gigi_body_{stand,walk_a,walk_b,hop}.svg   0 0 256 256
        Gigi the giraffe calf, 3/4 view facing RIGHT: torso, 4 short legs, tail, mint scarf and a short neck stub.
        Feet anchor (128,244). Neck socket (172,96) = centre of the round top of the neck stub (radius NECK_W/2 = 24).
        The torso / stub / scarf are byte-identical in every frame; only legs and tail move.
  characters/gigi_head_{idle,blink,talk,happy,cheer,think,oops}.svg   0 0 192 192
        Head + ossicones + ears + mane tuft, facing RIGHT. Neck joint (70,160): the round end of the code-drawn neck
        (radius <= 22 head units) sits completely under the round jowl, so the head can be rotated about the joint
        (GW.GigiArt.headAngle) and the neck still disappears under the head outline.
  characters/gigi_title.svg   0 0 320 480   full Gigi waving (neck drawn with the same maths as game/js/gigi_art.js)
  characters/pigeon.svg, pigeon_flap.svg   0 0 128 128, feet anchor (64,120), facing right
  ui/star.svg, ui/star_empty.svg   0 0 64 64
  icon.svg   0 0 512 512 full bleed: Gigi's head peeking into an open window with shutters, sky-blue background

Usage: python3 tools/art_gigi.py [outDir]
Rules (docs/DESIGN.md §3): 100% original art, flat cartoon, ~4 px outline in a darker tone of the fill (never black),
one-step cel shading + one soft highlight upper-left, no <text>/fonts/scripts/external refs, no filters.
width/height = viewBox. Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md §3)
G = {
    'coat': '#F3CE85', 'shade': '#E3B465', 'patch': '#B97A3F', 'patchSh': '#A86C35', 'line': '#7E5226',
    'muzzle': '#FBEBCB', 'muzzleSh': '#F0D7AA', 'knob': '#6B4421', 'mane': '#9C6532', 'hoof': '#6B4421',
    'hoofHi': '#8A5C33', 'eye': '#2F2622', 'eyeLo': '#5A4438', 'white': '#FFFFFF', 'cheek': '#F5AFB4',
    'earIn': '#F5AFB4', 'hi': '#FFF1CF', 'mouth': '#8E3B33', 'tongue': '#F2899A',
    'scarf': '#7CCFB8', 'scarfDk': '#4C9C88', 'scarfHi': '#B4E8D8', 'scarfSh': '#62B7A0',
}
LW = 4.2          # outline width at viewBox 256 (body); the head uses the same number in its own units
NECK_W = 56       # neck width at the socket, body units  (thick = NECK_W * h / 256 in game px)
SOCKET = (172, 96)
FEET = (128, 244)
JOINT = (70, 160)
HEAD_BOX = 0.62   # head box side / body h  (DESIGN §2)
BASE_DIR = (0.09 / math.hypot(0.09, 1), -1 / math.hypot(0.09, 1))   # stub axis (up, slightly right)
REST = (0.12, -0.6)   # head joint at socket + REST * h (DESIGN §6.2)


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


def poly(pts, close=True):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + (' Z' if close else '')


def smooth(pts):
    """Closed smooth path through the midpoints of a polygon (rounded blob)."""
    n = len(pts)
    mids = [((pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2) for i in range(n)]
    d = f'M{f(mids[-1][0])},{f(mids[-1][1])}'
    for i in range(n):
        d += f' Q{f(pts[i][0])},{f(pts[i][1])} {f(mids[i][0])},{f(mids[i][1])}'
    return d + ' Z'


def blob(cx, cy, r, seed, n=6, sx=1.0, sy=1.0, rot=0.0):
    """Rounded giraffe patch: an irregular polygon smoothed at the corners (deterministic jitter)."""
    pts = []
    for i in range(n):
        j = math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
        j = j - math.floor(j)
        a = rot + (i + 0.25 * (j - 0.5)) * 2 * math.pi / n
        rr = r * (0.82 + 0.3 * j)
        pts.append((cx + math.cos(a) * rr * sx, cy + math.sin(a) * rr * sy))
    return smooth(pts)


def rounded_star(cx, cy, ro, ri, rr=0.18, rot=-90):
    pts = []
    for i in range(10):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d = ''
    for i in range(10):
        p = pts[i]
        if i % 2 == 0:
            a, b = pts[i - 1], pts[(i + 1) % 10]
            s = (p[0] + (a[0] - p[0]) * rr, p[1] + (a[1] - p[1]) * rr)
            e = (p[0] + (b[0] - p[0]) * rr, p[1] + (b[1] - p[1]) * rr)
            d += ('M' if not d else ' L') + f'{f(s[0])},{f(s[1])} Q{f(p[0])},{f(p[1])} {f(e[0])},{f(e[1])}'
        else:
            d += f' L{f(p[0])},{f(p[1])}'
    return d + ' Z'


def union(shapes, fill, line, lw=LW, uid=None):
    """Outline of the union of several shapes: thick strokes behind, fills on top."""
    g = ''.join(path(d, f'fill="{line}" stroke="{line}" stroke-width="{f(lw * 2)}" stroke-linejoin="round"') for d in shapes)
    g += ''.join(path(d, f'fill="{fill}"') for d in shapes)
    return g


# ======================================================================= BODY (0 0 256 256)
TORSO_D = ('M70,124 C90,109 140,103 168,108 C190,113 201,142 193,164 C185,186 154,193 124,193 '
           'C96,193 72,187 62,167 C55,151 58,134 70,124 Z')
# neck stub: round top (radius 24) centred on the socket; the bottom disappears inside the torso
STUB_D = ('M144,96 A28,28 0 0 1 200,96 C200,110 200,122 200,134 C190,148 156,148 136,138 C141,124 144,110 144,96 Z')
TORSO_PATCHES = [
    (88, 134, 12, 1), (114, 123, 11, 2), (142, 124, 10, 3), (166, 136, 10, 4), (74, 158, 10, 5),
    (102, 156, 13, 6), (132, 150, 12, 7), (160, 162, 10, 8), (118, 181, 9, 9), (90, 179, 9, 10),
]
HIP = {'nf': (164, 170), 'nb': (90, 168), 'ff': (180, 166), 'fb': (106, 164)}
L1, L2, HOOF = 34, 28, 12      # upper leg, lower leg, hoof length  (hip 170 → ground 244)


def leg(hip, a1, a2, far=False):
    """Two-segment chunky leg: a1 / a2 = angles of the upper / lower segment from straight down (+ = forward/right)."""
    hx, hy = hip
    kx, ky = hx + L1 * math.sin(a1), hy + L1 * math.cos(a1)
    ex, ey = kx + L2 * math.sin(a2), ky + L2 * math.cos(a2)
    col = G['shade'] if far else G['coat']
    w1, w2 = 21, 17
    g = path(f'M{f(hx)},{f(hy - 8)} L{f(kx)},{f(ky)}', stroke(G['line'], w1 + 2 * LW))
    g += path(f'M{f(kx)},{f(ky)} L{f(ex)},{f(ey)}', stroke(G['line'], w2 + 2 * LW))
    # hoof: rounded block along the lower segment, bottom at the foot point
    ux, uy = math.sin(a2), math.cos(a2)
    px, py = uy, -ux
    fx, fy = ex + ux * HOOF, ey + uy * HOOF
    hw0, hw1 = 9.5, 11.5
    hoof = [(ex - px * hw0 - ux * 2, ey - py * hw0 - uy * 2), (ex + px * hw0 - ux * 2, ey + py * hw0 - uy * 2),
            (fx + px * hw1, fy + py * hw1), (fx - px * hw1, fy - py * hw1)]
    hd = smooth([hoof[0], hoof[1], ((hoof[1][0] + hoof[2][0]) / 2 + px * 1.5, (hoof[1][1] + hoof[2][1]) / 2 + py * 1.5),
                 hoof[2], (fx + ux * 1.5, fy + uy * 1.5), hoof[3],
                 ((hoof[3][0] + hoof[0][0]) / 2 - px * 1.5, (hoof[3][1] + hoof[0][1]) / 2 - py * 1.5)])
    g += path(f'M{f(hx)},{f(hy - 8)} L{f(kx)},{f(ky)}', stroke(col, w1))
    g += path(f'M{f(kx)},{f(ky)} L{f(ex)},{f(ey)}', stroke(col, w2))
    # knee knob + a small caramel spot on the upper leg
    g += circ(kx, ky, w1 * 0.5, f'fill="{col}"')
    sx, sy = hx + (kx - hx) * 0.45, hy + (ky - hy) * 0.45
    g += ell(sx - px * 2, sy - py * 2, 5, 6.5, f'fill="{G["patch"]}" opacity="{0.8 if far else 1}"')
    g += path(hd, filled(mix(G['hoof'], '#3E2612', 0.25) if far else G['hoof'], mix(G['hoof'], '#2A180A', 0.45), 3.2))
    g += path(f'M{f(ex - px * 6)},{f(ey - py * 6 + uy * 3)} L{f(ex + px * 4)},{f(ey + py * 4 + uy * 3)}',
              stroke(G['hoofHi'], 2.4) + ' opacity="0.9"')
    return g


def tail(ang=0.0):
    """Thin tail from the rump with a dark tuft; ang swings it (radians, + = back/up)."""
    bx, by = 64, 136
    # control for a soft curve
    cx, cy = bx - 16, by + 6
    tip = (bx - 22 - 10 * math.sin(ang), by + 36 - 14 * math.sin(ang))
    g = path(f'M{bx},{by} Q{f(cx)},{f(cy)} {f(tip[0])},{f(tip[1])}', stroke(G['line'], 6 + 2 * 2.6))
    g += path(f'M{bx},{by} Q{f(cx)},{f(cy)} {f(tip[0])},{f(tip[1])}', stroke(G['coat'], 6))
    tx, ty = tip
    tuft = blob(tx - 1, ty + 7, 8.5, 21, 5, 0.8, 1.15)
    g += path(tuft, filled(G['mane'], G['line'], 3))
    g += path(f'M{f(tx - 3)},{f(ty + 3)} L{f(tx - 2)},{f(ty + 12)}', stroke(mix(G['mane'], G['line'], 0.5), 1.8))
    return g


def torso_block(uid):
    defs = f'<clipPath id="{uid}t"><path d="{TORSO_D}"/><path d="{STUB_D}"/></clipPath>'
    g = union([TORSO_D, STUB_D], G['coat'], G['line'])
    g += f'<g clip-path="url(#{uid}t)">'
    # cel shade: belly + chest underside (lower right)
    g += path('M40,170 C70,196 160,200 210,150 L220,230 L30,230 Z', f'fill="{G["shade"]}"')
    g += path('M186,118 C200,130 204,150 196,168 L230,170 L230,100 Z', f'fill="{G["shade"]}"')
    # front-edge shade of the stub, same band as the code neck (0.36 * NECK_W wide, centred on the edge)
    g += path('M200,60 L200,140', stroke(G['shade'], NECK_W * 0.36))
    for (x, y, r, s) in TORSO_PATCHES:
        g += path(blob(x, y, r, s, 6, 1.12, 0.92), f'fill="{G["patch"]}"')
    # stub patches (low on the stub, far from the socket disc the code neck covers)
    g += path(blob(186, 126, 8, 31, 5, 0.9, 1.1), f'fill="{G["patch"]}"')
    g += '</g>'
    # outline again on top of the stub/torso boundary would show a seam -> none; soft highlight upper-left
    g += path('M70,128 C88,117 116,112 140,112', stroke(G['hi'], 5) + ' opacity="0.75"')
    # mane strip down the back of the stub (continues the code neck's mane)
    # straight strip along the stub axis, centred where the code neck's mane starts (half width + 0.06 * thick)
    r = NECK_W * 0.56
    x0, y0 = SOCKET[0] + BASE_DIR[1] * r, SOCKET[1] - BASE_DIR[0] * r
    md = f'M{f(x0)},{f(y0)} L{f(x0 - BASE_DIR[0] * 40)},{f(y0 - BASE_DIR[1] * 40)}'
    g += path(md, stroke(G['line'], NECK_W * 0.2 + 2 * LW).replace('stroke-linecap="round"', 'stroke-linecap="butt"'))
    g += path(md, stroke(G['mane'], NECK_W * 0.2))
    g += path(md, stroke(G['line'], NECK_W * 0.2 * 0.55).replace('stroke-linecap="round"', 'stroke-linecap="butt"') + f' stroke-dasharray="{f(LW * 0.8)} {f(NECK_W * 0.3)}" '
              f'transform="translate({f(-NECK_W * 0.05)},0)"')
    return defs, g


def scarf():
    """Mint scarf wrapped round the base of the neck, knot + a hanging end on the chest."""
    band = 'M137,121 C156,131 184,133 203,124 L205,138 C186,148 156,147 135,135 Z'
    g = ''
    # hanging end (behind the band)
    end = 'M186,134 C190,148 192,160 190,172 L200,176 C206,162 204,146 198,132 Z'
    g += path(end, filled(G['scarfSh'], G['scarfDk'], 3.4))
    g += path('M188,170 L201,174', stroke(G['scarfHi'], 2) + ' opacity="0.8"')
    g += path('M191,174 L190,180 M195,175 L195,181 M199,176 L200,181', stroke(G['scarfDk'], 2.2))
    g += path(band, filled(G['scarf'], G['scarfDk'], 3.6))
    g += path('M146,126 C162,134 182,136 196,130', stroke(G['scarfHi'], 2.6) + ' opacity="0.9"')
    g += path('M150,137 C164,142 180,142 192,138', stroke(G['scarfSh'], 2.4))
    # knot
    g += path(blob(193, 132, 7.5, 41, 6, 1.05, 0.95), filled(G['scarf'], G['scarfDk'], 3.2))
    g += circ(191, 130, 2, f'fill="{G["scarfHi"]}"')
    return g


LEG_POSES = {
    #          near front     near back      far front      far back      tail
    'stand':  ((0.04, 0.0), (-0.03, 0.02), (0.06, 0.02), (-0.02, 0.0), 0.0),
    'walk_a': ((0.42, 0.18), (-0.36, -0.12), (-0.30, 0.18), (0.38, 0.08), 0.18),
    'walk_b': ((-0.30, 0.20), (0.40, 0.10), (0.40, 0.16), (-0.34, -0.10), -0.12),
    'hop':    ((0.75, -0.55), (-0.85, 0.30), (0.55, -0.75), (-0.70, 0.45), 0.45),
}
# wave pose for the title: near front leg raised and waving
WAVE = ((1.95, 2.75), (-0.03, 0.02), (0.06, 0.02), (-0.02, 0.0), 0.25)


def body_parts(pose, uid):
    nf, nb, ff, fb, ta = pose
    g = leg(HIP['ff'], *ff, far=True) + leg(HIP['fb'], *fb, far=True)
    g += tail(ta)
    g += leg(HIP['nb'], *nb)
    wave = nf[0] > 1.0
    if not wave:
        g += leg(HIP['nf'], *nf)
    d, tg = torso_block(uid)
    g += tg + scarf()
    if wave:   # title only: the raised front leg swings from the shoulder, hoof up beside the chest
        g += leg((176, 150), *nf)
    return d, g


def gen_body():
    for name, pose in LEG_POSES.items():
        d, g = body_parts(pose, 'b' + name[-2:])
        write(f'characters/gigi_body_{name}.svg', svg(256, 256, g, d))


# ======================================================================= HEAD (0 0 192 192)
CRANIUM_D = ('M36,100 C34,62 58,40 92,40 C126,40 150,60 152,92 L148,122 C128,136 112,150 104,168 '
             'C98,183 88,189 70,189 C50,189 39,177 38,160 C37,140 36,120 36,100 Z')
MUZZLE_D = ('M104,108 C112,94 140,90 162,96 C180,101 188,116 186,132 C184,150 168,160 146,160 C126,160 108,154 100,140 '
            'C96,130 98,118 104,108 Z')
EYE_N = (98, 86, 14, 17)
EYE_F = (142, 80, 10, 14)


def ossicone(x, y, h, tilt, far=False):
    """Little horn: a coat stalk + dark-brown knob, base at (x, y) (hidden behind the head)."""
    a = math.radians(tilt)
    tx, ty = x + math.sin(a) * h, y - math.cos(a) * h
    col = G['shade'] if far else G['coat']
    g = path(f'M{f(x)},{f(y)} L{f(tx)},{f(ty)}', stroke(G['line'], 11 + 2 * 3.6))
    g += path(f'M{f(x)},{f(y)} L{f(tx)},{f(ty)}', stroke(col, 11))
    g += circ(tx, ty - 2, 8.5, filled(mix(G['knob'], '#3E2612', 0.2) if far else G['knob'], mix(G['knob'], '#2A180A', 0.5), 3.2))
    g += circ(tx - 2.6, ty - 4.6, 2.6, f'fill="{G["hoofHi"]}"')
    return g


def ear(base, ang, L, W, far=False):
    """Leaf ear, base at `base`, pointing along `ang` degrees (0 = right, -90 = up)."""
    bx, by = base
    g = f'<g transform="translate({f(bx)},{f(by)}) rotate({f(ang)})">'
    d = f'M0,{f(-W * 0.55)} C{f(L * 0.4)},{f(-W * 0.75)} {f(L * 0.86)},{f(-W * 0.35)} {f(L)},0 C{f(L * 0.86)},{f(W * 0.35)} {f(L * 0.4)},{f(W * 0.75)} 0,{f(W * 0.55)} Z'
    di = f'M{f(L * 0.12)},{f(-W * 0.28)} C{f(L * 0.4)},{f(-W * 0.42)} {f(L * 0.72)},{f(-W * 0.2)} {f(L * 0.84)},0 C{f(L * 0.72)},{f(W * 0.2)} {f(L * 0.4)},{f(W * 0.42)} {f(L * 0.12)},{f(W * 0.28)} Z'
    g += path(d, filled(G['shade'] if far else G['coat'], G['line'], 3.8))
    g += path(di, f'fill="{G["earIn"]}" opacity="{0.75 if far else 1}"')
    g += '</g>'
    return g


def mane_tuft():
    """Mane tufts at the back of the head, between the ossicones and behind the near ear."""
    d = 'M60,52 C54,40 58,30 66,28 C66,36 70,40 74,42 C74,32 80,26 88,26 C86,34 88,40 92,44 L76,62 Z'
    return path(d, filled(G['mane'], G['line'], 3.6))


def eye_open(e, look=(1.5, -1.5), wide=1.0):
    cx, cy, rx, ry = e
    rx *= wide
    ry *= wide
    px, py = cx + look[0], cy + look[1]
    g = ell(px, py, rx, ry, f'fill="{G["eye"]}"')
    g += ell(px + 1, py + ry * 0.45, rx * 0.66, ry * 0.34, f'fill="{G["eyeLo"]}" opacity="0.9"')
    g += ell(px - rx * 0.28 + look[0] * 0.2, py - ry * 0.36 + look[1] * 0.2, rx * 0.44, ry * 0.36, f'fill="{G["white"]}"')
    g += circ(px + rx * 0.4, py + ry * 0.42, rx * 0.18, f'fill="{G["white"]}"')
    return g


def lashes(e, lift=0):
    cx, cy, rx, ry = e
    # two little lashes at the outer-top corner (towards the back of the head for the near eye)
    x0, y0 = cx - rx * 0.78, cy - ry * 0.62 - lift
    return path(f'M{f(x0)},{f(y0)} l-6,-4 M{f(x0 + 4)},{f(y0 - 4)} l-4,-6', stroke(G['eye'], 2.8))


def eye_closed(e, kind):
    cx, cy, rx, ry = e
    w = rx * 1.05
    if kind == 'happy':   # ^ ^
        d = f'M{f(cx - w)},{f(cy + 5)} Q{f(cx)},{f(cy - 14)} {f(cx + w)},{f(cy + 5)}'
        return path(d, stroke(G['eye'], 5))
    d = f'M{f(cx - w)},{f(cy + 1)} Q{f(cx)},{f(cy + 10)} {f(cx + w)},{f(cy + 1)}'   # closed lid, gentle smile curve
    return path(d, stroke(G['eye'], 4.6))


def brows(up=0, tilt=0, only=None):
    g = ''
    for (cx, cy, rx, ry), side in ((EYE_N, -1), (EYE_F, 1)):
        if only is not None and only != side:
            continue
        y = cy - ry - 8 - up
        hw = rx * 0.8
        d = f'M{f(cx - hw)},{f(y + 3 + tilt * side)} Q{f(cx)},{f(y - 4)} {f(cx + hw)},{f(y + 3 - tilt * side)}'
        g += path(d, stroke(G['line'], 3.6))
    return g


def nostrils():
    return (ell(160, 116, 3.6, 2.6, f'fill="{G["line"]}" transform="rotate(-20 160 116)"') +
            ell(178, 111, 2.6, 2.2, f'fill="{G["line"]}" opacity="0.85"'))


def mouth(kind):
    if kind == 'smile':
        return path('M132,138 Q150,150 170,138', stroke(G['line'], 3.8)) + path('M130,136 l-2,3', stroke(G['line'], 3))
    if kind == 'talk':
        d = 'M134,137 C138,152 162,154 168,137 C158,140 144,140 134,137 Z'
        return (path(d, filled(G['mouth'], G['line'], 3.4)) +
                ell(151, 147, 8, 3.6, f'fill="{G["tongue"]}"'))
    if kind == 'big':   # happy: wide open D smile
        d = 'M126,134 C130,160 170,162 176,132 C160,138 140,138 126,134 Z'
        return (path(d, filled(G['mouth'], G['line'], 3.6)) +
                path('M140,152 C146,146 160,146 166,150 C160,156 146,157 140,152 Z', f'fill="{G["tongue"]}"'))
    if kind == 'cheer':  # big round open mouth
        d = 'M130,134 C130,162 172,164 174,134 C160,140 142,140 130,134 Z'
        return (path(d, filled(G['mouth'], G['line'], 3.6)) +
                path('M140,153 C146,147 160,147 165,152 C159,159 146,160 140,153 Z', f'fill="{G["tongue"]}"'))
    if kind == 'hmm':   # think: small sideways mouth
        return path('M140,141 Q152,145 164,138', stroke(G['line'], 3.8))
    if kind == 'o':     # oops: gentle "hm?" little o
        return ell(152, 143, 6, 6.5, filled(G['mouth'], G['line'], 3.2))
    return ''


def cheeks(k=1.0):
    return (ell(86, 114, 12 * k, 7.5 * k, f'fill="{G["cheek"]}" opacity="0.9"') +
            ell(170, 128, 7 * k, 5 * k, f'fill="{G["cheek"]}" opacity="0.85"'))


def head_parts(face, uid, cheek=1.0):
    defs = (f'<clipPath id="{uid}h"><path d="{CRANIUM_D}"/><path d="{MUZZLE_D}"/></clipPath>'
            f'<clipPath id="{uid}m"><path d="{MUZZLE_D}"/></clipPath>')
    g = ''
    # behind the head: far ear, ossicones, mane tuft, near ear
    g += ear((136, 58), -38, 34, 20, far=True)
    g += ossicone(114, 52, 30, 10, far=True)
    g += mane_tuft()
    g += ossicone(80, 52, 32, -8)
    g += ear((50, 74), 200, 40, 23)
    g += union([CRANIUM_D, MUZZLE_D], G['coat'], G['line'], 4.2)
    g += f'<g clip-path="url(#{uid}h)">'
    # cel shade: lower-right + throat
    g += path('M30,150 C70,168 130,170 196,128 L196,196 L30,196 Z', f'fill="{G["shade"]}"')
    # caramel spots on the crown / cheek
    g += path(blob(64, 70, 10, 51, 6, 1.0, 1.1), f'fill="{G["patch"]}"')
    g += path(blob(52, 100, 7.5, 52, 5), f'fill="{G["patch"]}"')
    g += path(blob(116, 56, 7, 53, 5, 1.2, 0.85), f'fill="{G["patch"]}"')
    g += path(blob(70, 162, 9, 54, 6, 1.1, 0.9), f'fill="{G["patch"]}" opacity="0.9"')
    g += '</g>'
    # cream muzzle with its own soft edge
    g += f'<g clip-path="url(#{uid}m)">'
    g += path(MUZZLE_D, f'fill="{G["muzzle"]}"')
    g += path('M96,150 C130,166 170,160 196,124 L196,196 L96,196 Z', f'fill="{G["muzzleSh"]}"')
    g += '</g>'
    g += path('M104,108 C112,94 140,90 162,96', stroke(mix(G['line'], G['coat'], 0.35), 2.6) + ' opacity="0.8"')
    # re-stroke the outer outline of the muzzle (fills above covered nothing outside, but keep the edge crisp)
    g += ell(60, 66, 11, 5.5, 'fill="#FFFFFF" opacity="0.38" transform="rotate(-50 60 66)"')   # highlight upper-left
    g += cheeks(cheek)
    g += nostrils()
    g += face
    return defs, g


HEAD_POSES = {
    'idle':  (eye_open(EYE_N) + eye_open(EYE_F) + lashes(EYE_N) + mouth('smile'), 1.0),
    'blink': (eye_closed(EYE_N, 'blink') + eye_closed(EYE_F, 'blink') + lashes(EYE_N, -6) + mouth('smile'), 1.0),
    'talk':  (eye_open(EYE_N) + eye_open(EYE_F) + lashes(EYE_N) + mouth('talk'), 1.0),
    'happy': (eye_open(EYE_N, (1.5, -1), 1.06) + eye_open(EYE_F, (1.5, -1), 1.06) + lashes(EYE_N) + mouth('big'), 1.2),
    'cheer': (eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy') + mouth('cheer'), 1.3),
    'think': (eye_open(EYE_N, (3, -6)) + eye_open(EYE_F, (3, -6)) + lashes(EYE_N) + brows(2, 3, only=1) + mouth('hmm'), 1.0),
    'oops':  (eye_open(EYE_N, (0, 0), 1.08) + eye_open(EYE_F, (0, 0), 1.08) + lashes(EYE_N, 1) + brows(4, -2) + mouth('o'), 1.0),
}


def gen_head():
    for name, (face, ck) in HEAD_POSES.items():
        d, g = head_parts(face, 'h' + name[:2], ck)
        write(f'characters/gigi_head_{name}.svg', svg(192, 192, g, d))


# ======================================================================= NECK (python port of gigi_art.js drawNeck)
NECK_PATCHES = [(0.12, 0.30, 1.0, 1.0), (0.30, -0.32, 0.9, 1.1), (0.48, 0.36, 1.1, 0.9), (0.66, -0.28, 0.95, 1.0),
                (0.84, 0.30, 0.85, 0.9), (1.0, -0.3, 0.8, 0.9)]


def neck_svg(bx, by, hx, hy, thick, uid, bend=0.25):
    dx, dy = hx - bx, hy - by
    ln = math.hypot(dx, dy)
    ux, uy = dx / ln, dy / ln
    nx, ny = -uy, ux
    k = bend * ln * 0.13
    # the neck leaves the socket along the stub (BASE_DIR) and then curves towards the head
    c1 = (bx + (ux * 0.4 + BASE_DIR[0] * 0.6) * ln * 0.38 + nx * k, by + (uy * 0.4 + BASE_DIR[1] * 0.6) * ln * 0.38 + ny * k)
    c2 = (bx + dx * 2 / 3 - nx * k, by + dy * 2 / 3 - ny * k)
    lw = thick * LW / NECK_W
    N = 16
    P, T, W = [], [], []
    for i in range(N + 1):
        t = i / N
        mt = 1 - t
        x = mt ** 3 * bx + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t ** 3 * hx
        y = mt ** 3 * by + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t ** 3 * hy
        tx = 3 * mt * mt * (c1[0] - bx) + 6 * mt * t * (c2[0] - c1[0]) + 3 * t * t * (hx - c2[0])
        ty = 3 * mt * mt * (c1[1] - by) + 6 * mt * t * (c2[1] - c1[1]) + 3 * t * t * (hy - c2[1])
        tl = math.hypot(tx, ty) or 1
        P.append((x, y))
        T.append((tx / tl, ty / tl))
        W.append(thick * 0.5 * (1 - 0.28 * t))
    Lp = [(P[i][0] + T[i][1] * W[i], P[i][1] - T[i][0] * W[i]) for i in range(N + 1)]   # back side (-n)
    Rp = [(P[i][0] - T[i][1] * W[i], P[i][1] + T[i][0] * W[i]) for i in range(N + 1)]   # front side (+n)
    body = poly(Lp + Rp[::-1])
    mo = thick * 0.06
    ext = thick * 0.6

    def mstart(r):
        return (bx - BASE_DIR[0] * ext + BASE_DIR[1] * r, by - BASE_DIR[1] * ext - BASE_DIR[0] * r)
    mane = poly([mstart(thick * 0.5 + mo)] + [(Lp[i][0] + T[i][1] * mo, Lp[i][1] - T[i][0] * mo) for i in range(N + 1)], False)
    mw = thick * 0.2
    defs = f'<clipPath id="{uid}n"><path d="{body}"/></clipPath>'
    g = path(mane, stroke(G['line'], mw + 2 * lw).replace('stroke-linecap="round"', 'stroke-linecap="butt"'))
    g += path(mane, stroke(G['mane'], mw))
    mane2 = poly([mstart(thick * 0.5 + mo + mw * 0.25)] + [(Lp[i][0] + T[i][1] * (mo + mw * 0.25), Lp[i][1] - T[i][0] * (mo + mw * 0.25)) for i in range(N + 1)], False)
    g += path(mane2, stroke(G['line'], mw * 0.55).replace('stroke-linecap="round"', 'stroke-linecap="butt"') +
              f' stroke-dasharray="{f(lw * 0.8)} {f(thick * 0.3)}"')
    g += path(body, f'fill="{G["coat"]}"')
    g += circ(bx, by, thick * 0.5 - lw * 0.5, f'fill="{G["coat"]}"')
    g += f'<g clip-path="url(#{uid}n)">'
    g += path(poly(Rp, False), stroke(G['shade'], thick * 0.36))
    for (pt, side, ka, kb) in NECK_PATCHES:
        i = min(N, round(pt * N))
        x, y = P[i]
        w = W[i]
        a = max(w * 0.52, 0.36 * ln / len(NECK_PATCHES)) * ka
        b = w * 0.52 * kb
        cx, cy = x - T[i][1] * side * w, y + T[i][0] * side * w
        ang = math.degrees(math.atan2(T[i][1], T[i][0]))
        g += path(f'M{f(a)},0 Q{f(a * 0.95)},{f(b * 0.95)} 0,{f(b)} Q{f(-a * 0.95)},{f(b * 0.95)} {f(-a)},0 '
                  f'Q{f(-a * 0.95)},{f(-b * 0.95)} 0,{f(-b)} Q{f(a * 0.95)},{f(-b * 0.95)} {f(a)},0 Z',
                  f'fill="{G["patch"]}" transform="translate({f(cx)},{f(cy)}) rotate({f(ang)})"')
    hl = [(P[i][0] + T[i][1] * W[i] * 0.55, P[i][1] - T[i][0] * W[i] * 0.55) for i in range(2, N - 3)]
    g += path(poly(hl, False), stroke(G['hi'], thick * 0.08) + ' opacity="0.6"')
    g += '</g>'
    o = lw * 0.5
    Lo = [(P[i][0] + T[i][1] * (W[i] + o), P[i][1] - T[i][0] * (W[i] + o)) for i in range(N + 1)]
    Ro = [(P[i][0] - T[i][1] * (W[i] + o), P[i][1] + T[i][0] * (W[i] + o)) for i in range(N + 1)]
    g += path(poly(Lo, False), stroke(G['line'], lw)) + path(poly(Ro, False), stroke(G['line'], lw))
    return defs, g


def head_angle(bx, by, hx, hy):
    lean = math.atan2(hx - bx, -(hy - by))
    rest = math.atan2(REST[0], -REST[1])
    return max(-0.35, min(0.35, 0.55 * (lean - rest)))


def gigi_group(fx, fy, h, body_pose, head_face, uid, head_off=REST, cheek=1.0):
    """Full Gigi (body + neck + head) as an SVG group, feet anchor at (fx, fy), body height h px."""
    s = h / 256
    hs = HEAD_BOX * h / 192
    bd, bg = body_parts(body_pose, uid + 'b')
    bx, by = fx + (SOCKET[0] - FEET[0]) * s, fy + (SOCKET[1] - FEET[1]) * s
    hx, hy = bx + head_off[0] * h, by + head_off[1] * h
    nd, ng = neck_svg(bx, by, hx, hy, NECK_W * s, uid)
    hd, hg = head_parts(head_face, uid + 'h', cheek)
    a = math.degrees(head_angle(bx, by, hx, hy))
    g = f'<g transform="translate({f(fx - FEET[0] * s)},{f(fy - FEET[1] * s)}) scale({f(s)})">{bg}</g>'
    g += ng
    g += (f'<g transform="translate({f(hx)},{f(hy)}) rotate({f(a)}) scale({f(hs)}) '
          f'translate({-JOINT[0]},{-JOINT[1]})">{hg}</g>')
    return bd + nd + hd, g


def gen_title():
    face = eye_open(EYE_N, (1.5, -1), 1.06) + eye_open(EYE_F, (1.5, -1), 1.06) + lashes(EYE_N) + mouth('big')
    defs, g = gigi_group(128, 468, 262, WAVE, face, 'tt', head_off=(0.13, -0.6), cheek=1.2)
    shadow = ell(128, 468, 92, 9, f'fill="#3B2A1A" opacity="0.16"')
    # little sparkles around the waving hoof
    sp = ''
    for x, y, r in ((252, 300, 8), (262, 330, 5.5), (236, 280, 4.5)):
        sp += path(rounded_star(x, y, r, r * 0.42, 0.15), 'fill="#FFF3B0" stroke="#E0A818" stroke-width="1.8" stroke-linejoin="round"')
    write('characters/gigi_title.svg', svg(320, 480, shadow + g + sp, defs))


# ======================================================================= PIGEON (0 0 128 128, feet (64,120))
P = {'body': '#B6AFCB', 'shade': '#9A92B3', 'line': '#5F5780', 'wing': '#A49CBE', 'bar': '#6E668F',
     'neckG': '#7CC4A8', 'neckP': '#A387C9', 'head': '#ADA6C4', 'beak': '#5F5780', 'cere': '#F2EEF6',
     'feet': '#E8909E', 'feetLn': '#B0566A', 'eyeRing': '#F2A65A', 'belly': '#C9C3DB'}


def pigeon(flap):
    uid = 'pf' if flap else 'pg'
    body = 'M30,82 C30,62 48,52 68,54 C86,56 96,68 94,84 C92,100 78,108 60,107 C42,106 30,98 30,82 Z'
    tailp = 'M36,84 L8,92 C6,96 8,100 12,100 L40,98 Z'
    head = 'M70,58 C64,44 70,30 84,28 C98,27 106,38 104,50 C103,58 98,64 92,68 Z'
    defs = f'<clipPath id="{uid}b"><path d="{body}"/><path d="{head}"/></clipPath>'
    g = ''
    # feet
    for x in (56, 70):
        g += path(f'M{x},104 L{x + 1},117', stroke(P['feetLn'], 6)) + path(f'M{x},104 L{x + 1},117', stroke(P['feet'], 3))
        g += path(f'M{x - 6},120 L{x + 9},120 M{x + 1},120 L{x + 4},117', stroke(P['feetLn'], 5.4))
        g += path(f'M{x - 6},120 L{x + 9},120', stroke(P['feet'], 2.6))
    g += path(tailp, filled(P['shade'], P['line'], 3.4))
    g += path('M8,92 C6,96 8,100 12,100 L18,99 L16,91 Z', f'fill="{P["bar"]}"')
    if flap:   # far wing raised behind
        g += path('M60,64 C52,40 40,22 22,14 C26,30 30,44 38,58 C30,52 22,50 14,52 C24,62 38,70 54,74 Z',
                  filled(P['shade'], P['line'], 3.4))
    g += union([body, head], P['body'], P['line'], 3.6)
    g += f'<g clip-path="url(#{uid}b)">'
    g += path('M20,92 C50,112 90,104 100,80 L110,120 L20,120 Z', f'fill="{P["shade"]}"')
    g += ell(78, 88, 14, 14, f'fill="{P["belly"]}" opacity="0.7"')
    # iridescent neck: green with a purple sheen
    g += path('M66,52 C74,66 88,72 100,62 L102,76 C90,86 70,82 60,66 Z', f'fill="{P["neckG"]}"')
    g += path('M70,62 C78,72 88,74 98,68 L100,74 C90,80 76,78 66,68 Z', f'fill="{P["neckP"]}" opacity="0.85"')
    g += path(head, f'fill="{P["head"]}"')
    g += '</g>'
    g += path(head, f'fill="none" stroke="{P["line"]}" stroke-width="3.6" stroke-linejoin="round"')
    # beak + cere
    g += path('M102,46 L116,51 L102,55 Z', filled(P['beak'], P['line'], 2.4))
    g += ell(102, 47, 4, 3, f'fill="{P["cere"]}"')
    # eye: orange ring, big dark pupil, catch-light
    g += circ(88, 42, 7.5, f'fill="{P["eyeRing"]}"')
    g += circ(88.6, 42, 5.6, f'fill="{G["eye"]}"')
    g += circ(86.6, 39.8, 2.2, 'fill="#FFFFFF"')
    g += circ(90.6, 44.6, 1, 'fill="#FFFFFF"')
    g += ell(97, 52, 4, 2.6, f'fill="{G["cheek"]}" opacity="0.7"')
    g += path('M80,32 C84,30 90,30 94,32', stroke('#FFFFFF', 2.4) + ' opacity="0.5"')
    if flap:   # near wing up
        g += path('M58,70 C54,48 46,28 32,16 C34,32 36,44 42,56 C34,50 26,48 18,50 C28,62 42,72 58,78 Z',
                  filled(P['wing'], P['line'], 3.4))
        g += path('M46,48 C42,40 38,34 34,28 M40,60 C34,56 28,54 24,54', stroke(P['bar'], 3.4))
    else:      # folded wing with two dark bars
        wing = 'M40,70 C52,62 74,62 84,74 C88,84 80,94 66,96 C52,98 36,94 28,90 C30,82 34,76 40,70 Z'
        g += path(wing, filled(P['wing'], P['line'], 3.4))
        g += path('M48,80 C56,76 66,76 74,80', stroke(P['bar'], 3.6))
        g += path('M42,88 C52,84 62,84 70,88', stroke(P['bar'], 3.6))
        g += path('M46,72 C56,67 68,67 76,72', stroke('#D9D4E6', 2.2) + ' opacity="0.8"')
    return defs, g


def gen_pigeon():
    for name, flap in (('pigeon', False), ('pigeon_flap', True)):
        d, g = pigeon(flap)
        write(f'characters/{name}.svg', svg(128, 128, g, d))


# ======================================================================= STARS
def gen_stars():
    sp = rounded_star(32, 34, 29, 14, 0.16)
    defs = f'<clipPath id="st"><path d="{sp}"/></clipPath>'
    g = path(sp, 'fill="#FFC83A"')
    g += '<g clip-path="url(#st)">' + path('M32,34 L64,36 L64,64 L0,64 L0,48 Z', 'fill="#F5A623" opacity="0.65"') + '</g>'
    g += path(sp, f'fill="none" stroke="#C98612" stroke-width="{LW}" stroke-linejoin="round"')
    g += ell(24, 25, 4.5, 8, 'fill="#FFFFFF" opacity="0.75" transform="rotate(35 24 25)"')
    g += circ(19, 36, 2.2, 'fill="#FFFFFF" opacity="0.6"')
    write('ui/star.svg', svg(64, 64, g, defs))
    g = path(sp, f'fill="#E8EDF3" fill-opacity="0.9" stroke="#8E9BAE" stroke-width="{LW}" stroke-linejoin="round"')
    g += path(rounded_star(32, 34, 17, 8.5, 0.2), 'fill="none" stroke="#C4CDD8" stroke-width="2.2" stroke-linejoin="round" stroke-dasharray="3 4"')
    write('ui/star_empty.svg', svg(64, 64, g))


# ======================================================================= ICON
def gen_icon():
    defs = ('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#6EC3F0"/><stop offset="1" stop-color="#BFE9FB"/></linearGradient>'
            '<radialGradient id="iglow" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#FFF4C8"/>'
            '<stop offset="1" stop-color="#FFE29A"/></radialGradient>')
    g = '<rect width="512" height="512" fill="url(#isky)"/>'
    for (x, y, s) in ((96, 70, 1.0), (430, 470, 0.8)):
        g += (f'<g transform="translate({x},{y}) scale({s})" fill="#FFFFFF" opacity="0.85">'
              + ell(0, 0, 46, 22) + circ(-18, -10, 22) + circ(16, -16, 26) + '</g>')
    # facade strip behind the window (sage)
    g += rect(236, -20, 300, 552, 0, 'fill="#C9D8B6"')
    g += path('M236,-20 L236,532', stroke('#9DAF89', 5))
    for y in (40, 470):
        g += rect(236, y, 300, 10, 0, 'fill="#B9CBA3"')
    # window: frame + lit interior + open shutters (teal) + sill + flower box
    wx, wy, ww, wh = 268, 118, 196, 250
    g += rect(wx - 14, wy - 14, ww + 28, wh + 28, 14, filled('#FBF7EE', '#B7AE98', 5))
    g += rect(wx, wy, ww, wh, 8, filled('url(#iglow)', '#B7AE98', 4))
    # cosy interior: a lamp + a picture frame shape
    g += path(f'M{wx + 150},{wy} L{wx + 150},{wy + 46}', stroke('#B7AE98', 3))
    g += path(f'M{wx + 132},{wy + 70} L{wx + 168},{wy + 70} L{wx + 160},{wy + 46} L{wx + 140},{wy + 46} Z', filled('#FF9A2E', '#C4650C', 3))
    g += ell(wx + 150, wy + 84, 30, 10, 'fill="#FFFFFF" opacity="0.45"')
    g += rect(wx + 120, wy + 150, 52, 40, 4, filled('#FBF7EE', '#C9B48C', 3))
    g += path(f'M{wx + 126},{wy + 182} L{wx + 140},{wy + 166} L{wx + 150},{wy + 176} L{wx + 158},{wy + 162} L{wx + 166},{wy + 182} Z', 'fill="#7CCFB8"')
    # right shutter swung open against the wall (perspective trapezoid)
    rx0 = wx + ww + 14
    g += path(f'M{rx0},{wy - 6} L{rx0 + 46},{wy - 22} L{rx0 + 46},{wy + wh + 22} L{rx0},{wy + wh + 6} Z', filled('#5E9E97', '#3E6E69', 4))
    for i in range(1, 7):
        yy = wy - 6 + i * (wh + 12) / 7
        g += path(f'M{rx0 + 6},{f(yy)} L{rx0 + 40},{f(yy - 8 + 16 * i / 7)}', stroke('#4A847E', 3))
    # sill + flower box
    g += rect(wx - 24, wy + wh + 10, ww + 48, 14, 6, filled('#FFFFFF', '#B7AE98', 4))
    g += rect(wx - 6, wy + wh + 24, ww + 12, 36, 6, filled('#A8744A', '#74492A', 4))
    g += path(f'M{wx + 4},{wy + wh + 38} L{wx + ww - 4},{wy + wh + 38}', stroke('#C48E5E', 3))
    for i, (x, c, d) in enumerate(((290, '#E84A4A', '#A8282E'), (330, '#FFD23F', '#C99A12'), (372, '#FF8FC0', '#C9558A'),
                                     (414, '#9B6BE0', '#6840A8'), (450, '#E84A4A', '#A8282E'))):
        y = wy + wh + 16 - (i % 2) * 8
        g += path(f'M{x},{y} L{x},{wy + wh + 26}', stroke('#2A8343', 4))
        for k in range(5):
            a = k * 72 - 90
            g += circ(x + 9 * math.cos(math.radians(a)), y + 9 * math.sin(math.radians(a)), 6.5, f'fill="{c}" stroke="{d}" stroke-width="2"')
        g += circ(x, y, 5, 'fill="#FFF3B0" stroke="#C99A12" stroke-width="1.6"')
    # Gigi: neck from the bottom-left, head peeking into the window (muzzle over the left frame)
    s = 1.55
    hx, hy = 128, 384      # head joint
    bx, by = 70, 580
    # left shutter swung open towards the viewer (mostly behind Gigi's head)
    lx0 = wx - 14
    g += path(f'M{lx0},{wy - 6} L{lx0 - 46},{wy - 22} L{lx0 - 46},{wy + wh + 22} L{lx0},{wy + wh + 6} Z', filled('#5E9E97', '#3E6E69', 4))
    for i in range(1, 7):
        yy = wy - 6 + i * (wh + 12) / 7
        g += path(f'M{lx0 - 6},{f(yy)} L{lx0 - 40},{f(yy - 8 + 16 * i / 7)}', stroke('#4A847E', 3))
    nd, ng = neck_svg(bx, by, hx, hy, NECK_W * 192 / (256 * HEAD_BOX) * s, 'icn', bend=0.3)
    face = eye_open(EYE_N, (5, -1), 1.06) + eye_open(EYE_F, (5, -1), 1.06) + lashes(EYE_N) + mouth('big')
    hd, hg = head_parts(face, 'ich', 1.2)
    g += ng
    g += f'<g transform="translate({hx},{hy}) rotate(4) scale({s}) translate({-JOINT[0]},{-JOINT[1]})">{hg}</g>'
    # left shutter, swung open towards the viewer, overlapping Gigi's neck a little (she peeks between)
    for x, y, r in ((470, 70, 12), (60, 210, 9), (200, 40, 8)):
        g += path(rounded_star(x, y, r, r * 0.42, 0.15), 'fill="#FFF3B0" stroke="#E0A818" stroke-width="2" stroke-linejoin="round"')
    write('icon.svg', svg(512, 512, g, defs + nd + hd))


if __name__ == '__main__':
    gen_body()
    gen_head()
    gen_title()
    gen_pigeon()
    gen_stars()
    gen_icon()
    print('wrote art to', OUT)
