#!/usr/bin/env python3
"""Character / core-item art generator for Dino Nest Sort (artist A).

Writes (relative to game/assets/default/):
  characters/bo_{idle,blink,talk,happy,cheer,think,oops}.svg   (0 0 256 256, feet anchor 128,244)
  items/egg_{red,blue,yellow,green,orange,purple,plain}.svg     (0 0 128 128, egg centre 64,68, 86x110)
  items/nest_back.svg, items/nest_front.svg                     (0 0 256 160, opening centre 128,62, rim top y=70)
  items/sign.svg                                                (0 0 128 112, board x12-116 y8-78, stake to 64,112)
  ui/star.svg, ui/star_empty.svg                                (0 0 64 64)
  icon.svg                                                      (0 0 512 512, full bleed, opaque)

Usage: python3 tools/art_characters.py [outDir]
Rules (docs/DESIGN.md section 3): original art, flat cartoon, ~4px outline in a darker tone,
one-step cel shading lower/right + a soft highlight upper-left, no <text>/fonts/scripts/filters.
Everything is deterministic (seeded random) so re-running gives identical files.
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
BO = {
    'fill': '#5FD3B4', 'shade': '#47BE9E', 'line': '#2E8C78', 'spot': '#8DE6CF', 'hi': '#E9FFF8',
    'belly': '#FFF1C9', 'bellyShade': '#F3DDA5', 'bellyLine': '#E9CF92',
    'plate': '#3DB495', 'plateHi': '#6FD9BE',
    'eye': '#22343C', 'white': '#FFFFFF', 'cheek': '#FF9EB1', 'mouth': '#8A2F44', 'tongue': '#FF8C9E',
}
LW = 4.2  # outline width at viewBox scale


def f(v):
    """Compact number formatting."""
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def mix(a, b, t):
    """Mix hex colour a towards b by t (0..1)."""
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


def star_path(cx, cy, ro, ri, rot=-90, round_=False):
    pts = []
    for i in range(10):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'


# ======================================================================= BO
# Geometry shared by every frame (idle/blink/talk use it unchanged).
HEAD_C = (138, 96)       # cranium circle centre
HEAD_R = 60
SNOUT = (180, 114, 38, 30)  # ellipse cx, cy, rx, ry
BODY = (120, 184, 55, 47)   # ellipse
BELLY = (142, 192, 32, 36)
EYE_NEAR = (172, 96)
EYE_FAR = (126, 94)
NECK = (132, 150)        # pivot for head tilt


def head_shapes(extra=''):
    cx, cy = HEAD_C
    sx, sy, srx, sry = SNOUT
    return circ(cx, cy, HEAD_R, extra) + ell(sx, sy, srx, sry, extra)


def plate(x, y, ang, s=1.0):
    d = 'M-17,4 C-14,-14 -6,-27 0,-28 C6,-27 14,-14 17,4 Z'
    t = f'transform="translate({f(x)},{f(y)}) rotate({f(ang)}) scale({f(s)})"'
    hi = 'M-7,-4 C-5,-14 -2,-20 0,-21'
    return (f'<g {t}>' + path(d, f'fill="{BO["plate"]}" stroke="{BO["line"]}" stroke-width="{LW}" stroke-linejoin="round"')
            + path(hi, stroke(BO['plateHi'], 3)) + '</g>')


def limb(x1, y1, x2, y2, w=13, bend=0.0):
    """Stubby arm as a thick stroked curve (outline underlay + fill) with a round hand."""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    qx, qy = mx - dy / L * bend, my + dx / L * bend
    d = f'M{f(x1)},{f(y1)} Q{f(qx)},{f(qy)} {f(x2)},{f(y2)}'
    return (path(d, stroke(BO['line'], w + 2 * LW)) + path(d, stroke(BO['fill'], w))
            + circ(x2, y2, w * 0.62, f'fill="{BO["fill"]}"')
            + path(f'M{f(x2 - 3)},{f(y2 + 1)} q3,3 6,0', stroke(BO['shade'], 2.2)))


def far_limb(x1, y1, x2, y2, w=12, bend=0.0):
    """Arm behind the body: slightly darker so it reads as further away."""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    qx, qy = mx - dy / L * bend, my + dx / L * bend
    d = f'M{f(x1)},{f(y1)} Q{f(qx)},{f(qy)} {f(x2)},{f(y2)}'
    return path(d, stroke(BO['line'], w + 2 * LW)) + path(d, stroke(BO['shade'], w))


def foot(cx, cy=233):
    out = ell(cx, cy, 22, 11, f'fill="{BO["fill"]}" stroke="{BO["line"]}" stroke-width="{LW}"')
    out += path(f'M{f(cx - 17)},{f(cy + 4)} Q{f(cx)},{f(cy + 10)} {f(cx + 17)},{f(cy + 4)}', stroke(BO['shade'], 3))
    for i, dx in enumerate((-9, 0, 9)):  # three soft toe pads (rounded, no claws)
        out += ell(cx + dx + 4, cy - 1, 3.6, 3, f'fill="{BO["belly"]}"')
    return out


def eyes_open(look=(2, 0), wide=1.0):
    out = ''
    for (ex, ey), s in ((EYE_FAR, 0.86), (EYE_NEAR, 1.0)):
        rx, ry = 15 * s, 18.5 * s * wide
        out += ell(ex, ey, rx, ry, f'fill="{BO["white"]}" stroke="{BO["line"]}" stroke-width="3.2"')
        ix, iy = ex + look[0] * s, ey + look[1] * s + 1
        out += ell(ix, iy, 11.6 * s, 14.2 * s * min(wide, 1.05), f'fill="{BO["eye"]}"')
        out += circ(ix - 4 * s, iy - 5.5 * s, 4.8 * s, f'fill="{BO["white"]}"')
        out += circ(ix + 4.2 * s, iy + 5 * s, 2.2 * s, f'fill="{BO["white"]}"')
    return out


def eyes_closed(kind='happy'):
    out = ''
    for (ex, ey), s in ((EYE_FAR, 0.86), (EYE_NEAR, 1.0)):
        w = 12 * s
        if kind == 'happy':   # upward arcs  ^ ^
            d = f'M{f(ex - w)},{f(ey + 5)} Q{f(ex)},{f(ey - 11 * s)} {f(ex + w)},{f(ey + 5)}'
        else:                 # gentle closed lids (blink) — downward curve with lashes
            d = f'M{f(ex - w)},{f(ey + 1)} Q{f(ex)},{f(ey + 10 * s)} {f(ex + w)},{f(ey + 1)}'
        out += path(d, stroke(BO['eye'], 4.6))
    return out


def eyes_star():
    out = ''
    for (ex, ey), s in ((EYE_FAR, 0.86), (EYE_NEAR, 1.0)):
        out += path(star_path(ex + 1, ey + 1, 17 * s, 8 * s), f'fill="#FFD23F" stroke="{BO["eye"]}" stroke-width="3.2" stroke-linejoin="round"')
        out += circ(ex - 3 * s, ey - 3 * s, 3.2 * s, f'fill="#FFFFFF"')
    return out


def brows(raise_=0, tilt=0):
    out = ''
    for (ex, ey), s, side in ((EYE_FAR, 0.86, -1), (EYE_NEAR, 1.0, 1)):
        y = ey - 27 * s - raise_
        d = f'M{f(ex - 9 * s)},{f(y + 2 + tilt * side)} Q{f(ex)},{f(y - 5)} {f(ex + 9 * s)},{f(y + 2 - tilt * side)}'
        out += path(d, stroke(BO['line'], 3.6))
    return out


MOUTH_C = (175, 128)


def mouth(kind):
    mx, my = MOUTH_C
    if kind == 'smile':
        return path(f'M{f(mx - 13)},{f(my - 3)} Q{f(mx)},{f(my + 9)} {f(mx + 13)},{f(my - 4)}', stroke(BO['mouth'], 3.8))
    if kind == 'talk':
        o = ell(mx, my + 2, 10, 9, f'fill="{BO["mouth"]}"')
        t = path(f'M{f(mx - 7)},{f(my + 6)} Q{f(mx)},{f(my - 1)} {f(mx + 7)},{f(my + 6)} Q{f(mx)},{f(my + 12)} {f(mx - 7)},{f(my + 6)} Z', f'fill="{BO["tongue"]}"')
        return (f'<clipPath id="mc"><ellipse cx="{f(mx)}" cy="{f(my + 2)}" rx="10" ry="9"/></clipPath>' + o
                + f'<g clip-path="url(#mc)">{t}</g>' + ell(mx, my + 2, 10, 9, stroke(BO['mouth'], 3)))
    if kind == 'big':     # D-shaped open grin
        d = f'M{f(mx - 17)},{f(my - 5)} Q{f(mx)},{f(my - 1)} {f(mx + 17)},{f(my - 6)} Q{f(mx + 14)},{f(my + 17)} {f(mx)},{f(my + 17)} Q{f(mx - 15)},{f(my + 17)} {f(mx - 17)},{f(my - 5)} Z'
        t = ell(mx, my + 15, 10, 7, f'fill="{BO["tongue"]}"')
        return (f'<clipPath id="mc">{path(d)}</clipPath>' + path(d, f'fill="{BO["mouth"]}"')
                + f'<g clip-path="url(#mc)">{t}</g>' + path(d, stroke(BO['mouth'], 3)))
    if kind == 'o':
        return ell(mx - 1, my + 2, 5.5, 6.5, f'fill="{BO["mouth"]}" stroke="{BO["mouth"]}" stroke-width="2.4"') + ell(mx - 1, my + 5, 3, 2.4, f'fill="{BO["tongue"]}"')
    if kind == 'hmm':     # small sideways thinking mouth
        return path(f'M{f(mx - 8)},{f(my + 1)} Q{f(mx + 2)},{f(my + 5)} {f(mx + 10)},{f(my - 2)}', stroke(BO['mouth'], 3.6))
    return ''


def head(eyes, mouth_kind, brow=None, cheek=0.6):
    cx, cy = HEAD_C
    sx, sy, srx, sry = SNOUT
    base_fill = f'fill="{BO["fill"]}"'
    out = head_shapes(f'fill="none" stroke="{BO["line"]}" stroke-width="{2 * LW}"')   # union outline underlay
    out += head_shapes(f'fill="{BO["fill"]}"')
    # cel shade: lower/right crescent = shade fill, then base fill shifted up-left
    out += ('<g clip-path="url(#hd)">' + f'<rect x="60" y="20" width="180" height="160" fill="{BO["shade"]}"/>'
            + f'<g transform="translate(-6,-8)">{head_shapes(base_fill)}</g>'
            # lighter spots on the crown
            + circ(112, 58, 6.5, f'fill="{BO["spot"]}"') + circ(98, 76, 4.5, f'fill="{BO["spot"]}"')
            + circ(126, 46, 3.8, f'fill="{BO["spot"]}"')
            + '</g>')
    # soft highlight upper-left
    out += ell(118, 60, 22, 12, f'fill="{BO["hi"]}" opacity="0.45" transform="rotate(-30 118 60)"')
    # cheeks
    out += ell(199, 123, 11, 7, f'fill="{BO["cheek"]}" opacity="{min(1, cheek + 0.25)}"')
    out += ell(110, 119, 8.5, 6, f'fill="{BO["cheek"]}" opacity="{min(1, cheek + 0.15)}"')
    # nostrils
    out += ell(208, 104, 2.4, 1.8, f'fill="{BO["line"]}"') + ell(199, 102, 2.0, 1.5, f'fill="{BO["line"]}"')
    out += eyes
    if brow:
        out += brow
    out += mouth(mouth_kind)
    return out


def body():
    bx, by, brx, bry = BODY
    out = ell(bx, by, brx, bry, f'fill="{BO["fill"]}" stroke="{BO["line"]}" stroke-width="{LW}"')
    out += ('<g clip-path="url(#bd)">' + f'<rect x="60" y="130" width="120" height="110" fill="{BO["shade"]}"/>'
            + ell(bx - 7, by - 8, brx, bry, f'fill="{BO["fill"]}"')
            + circ(82, 168, 5, f'fill="{BO["spot"]}"') + circ(92, 152, 3.6, f'fill="{BO["spot"]}"')
            + circ(76, 190, 3.4, f'fill="{BO["spot"]}"')
            # belly patch
            + ell(*BELLY, f'fill="{BO["bellyShade"]}"')
            + ell(BELLY[0] - 4, BELLY[1] - 6, BELLY[2] - 2, BELLY[3] - 3, f'fill="{BO["belly"]}"')
            + ''.join(path(f'M{f(BELLY[0] - 20 + k)},{f(y)} Q{f(BELLY[0] + 2)},{f(y + 5)} {f(BELLY[0] + 22 - k)},{f(y - 1)}', stroke(BO['bellyLine'], 2.6))
                      for k, y in ((6, 176), (2, 192), (5, 208)))
            + '</g>')
    out += ell(bx, by, brx, bry, stroke(BO['line'], LW))  # crisp outline on top of interior
    return out


def tail():
    d = 'M80,170 C62,176 44,170 30,154 C24,147 15,150 16,159 C20,186 48,210 88,212 Z'
    out = path(d, f'fill="{BO["fill"]}" stroke="{BO["line"]}" stroke-width="{LW}" stroke-linejoin="round"')
    out += path('M28,168 C40,186 58,198 82,202', stroke(BO['shade'], 4))
    out += circ(48, 184, 3.5, f'fill="{BO["spot"]}"')
    return out


def bo_svg(pose):
    """Build one Bo frame. pose keys: dy (hop), arms, eyes, mouth, brow, tilt."""
    dy = pose.get('dy', 0)
    tilt = pose.get('tilt', 0)
    defs = (f'<clipPath id="hd">{head_shapes()}</clipPath>'
            f'<clipPath id="bd">{ell(*BODY)}</clipPath>')
    g = ''
    # far arm (behind everything)
    if pose.get('far'):
        g += far_limb(*pose['far'])
    g += tail()
    g += plate(76, 132, -82, 0.8) + plate(82, 92, -62, 0.95) + plate(104, 54, -38, 1.08)
    g += foot(104, 233 - pose.get('footLift', 0)) + foot(152, 233 - pose.get('footLift', 0))
    g += body()
    # head (optional tilt around neck)
    h = head(pose['eyes'], pose['mouth'], pose.get('brow'), pose.get('cheek', 0.6))
    if tilt:
        h = f'<g transform="rotate({f(tilt)} {NECK[0]} {NECK[1]})">{h}</g>'
    g += h
    # near arm over body (and over head when touching the chin)
    g += limb(*pose['near'])
    if dy:
        g = f'<g transform="translate(0,{f(-dy)})">{g}</g>'
    return svg(256, 256, g, defs)


IDLE_NEAR = (160, 174, 182, 194, 13, -3)
IDLE_FAR = None

POSES = {
    'idle':  dict(eyes=eyes_open(), mouth='smile', near=IDLE_NEAR),
    'blink': dict(eyes=eyes_closed('blink'), mouth='smile', near=IDLE_NEAR),
    'talk':  dict(eyes=eyes_open(), mouth='talk', near=IDLE_NEAR),
    'happy': dict(dy=10, eyes=eyes_closed('happy'), mouth='big', near=(162, 172, 206, 154, 13, 5),
                  far=(104, 168, 80, 142, 12, -4), cheek=0.8, footLift=2),
    'cheer': dict(dy=16, eyes=eyes_star(), mouth='big', near=(164, 170, 230, 126, 13, 10),
                  far=(100, 164, 54, 116, 12, -8), cheek=0.85, footLift=3),
    'think': dict(tilt=-7, eyes=eyes_open(look=(4, -5)), mouth='hmm', near=(158, 172, 182, 150, 13, -10),
                  brow=brows(0, 2)),
    'oops':  dict(eyes=eyes_open(look=(1, 1), wide=1.08), mouth='o', near=(162, 178, 192, 186, 13, -4),
                  far=(100, 176, 76, 186, 12, 4), brow=brows(4, -1)),
}


def gen_bo():
    for name, pose in POSES.items():
        write(f'characters/bo_{name}.svg', bo_svg(pose))


# ======================================================================= EGGS
EGG_D = 'M64,13 C88,13 107,50 107,80 C107,107 88,123 64,123 C40,123 21,107 21,80 C21,50 40,13 64,13 Z'


def egg_svg(key, seed):
    fill, dark = PALETTE[key]
    rnd = random.Random(seed)
    plain = key == 'cream'
    shade = mix(fill, dark, 0.38 if not plain else 0.22)
    spot = mix(fill, '#FFFFFF', 0.5 if key != 'yellow' else 0.62)
    if plain:
        spot = '#F7E6C2'
    defs = f'<clipPath id="eg">{path(EGG_D)}</clipPath>'
    g = path(EGG_D, f'fill="{fill}"')
    g += '<g clip-path="url(#eg)">'
    g += f'<rect x="0" y="0" width="128" height="128" fill="{shade}"/>'
    base_fill = f'fill="{fill}"'
    g += f'<g transform="translate(-7,-7) scale(1.02)">{path(EGG_D, base_fill)}</g>'
    # spots: poisson-ish random, avoiding the highlight; plain egg keeps centre clear
    spots = []
    tries = 0
    want = 7 if not plain else 6
    while len(spots) < want and tries < 500:
        tries += 1
        x, y = rnd.uniform(26, 102), rnd.uniform(20, 120)
        r = rnd.uniform(4.5, 9.5) if not plain else rnd.uniform(3, 5.5)
        # inside egg (approx ellipse) with margin
        if ((x - 64) / 40) ** 2 + ((y - 72) / 52) ** 2 > 0.92:
            continue
        if math.hypot(x - 46, y - 40) < 18:  # highlight zone
            continue
        if plain and ((x - 64) / 34) ** 2 + ((y - 72) / 38) ** 2 < 1:
            continue
        if any(math.hypot(x - sx, y - sy) < r + sr + 6 for sx, sy, sr in spots):
            continue
        spots.append((x, y, r))
    for x, y, r in spots:
        rot = rnd.uniform(0, 180)
        g += ell(x, y, r, r * rnd.uniform(0.72, 0.95), f'fill="{spot}" transform="rotate({f(rot)} {f(x)} {f(y)})"' + (' opacity="0.8"' if plain else ''))
    g += '</g>'
    g += ell(46, 40, 10, 16, f'fill="#FFFFFF" opacity="{0.55 if not plain else 0.75}" transform="rotate(28 46 40)"')
    g += circ(40, 60, 3.5, 'fill="#FFFFFF" opacity="0.5"')
    g += path(EGG_D, f'fill="none" stroke="{dark}" stroke-width="{LW}"')
    return svg(128, 128, g, defs)


def gen_eggs():
    for i, key in enumerate(['red', 'blue', 'yellow', 'green', 'orange', 'purple']):
        write(f'items/egg_{key}.svg', egg_svg(key, 100 + i * 17))
    write('items/egg_plain.svg', egg_svg('cream', 999))


# ======================================================================= NEST
NEST = {'base': '#B87A45', 'mid': '#9A6233', 'dark': '#6E431F', 'line': '#6A3F1C', 'light': '#D9A365',
        'inner': '#7A4A24', 'deep': '#5A3318', 'straw': '#F2D27A', 'strawDk': '#D9B054'}
# Opening ellipse (inside of the bowl) — centre (128,62)
OPEN = (128, 62, 100, 26)
# Whole silhouette (outer): rim around the opening + bowl underneath
OUTER = ('M14,60 C12,40 60,26 128,26 C196,26 244,40 242,60 C244,76 236,96 220,114 '
         'C198,140 162,152 128,152 C94,152 58,140 36,114 C20,96 12,76 14,60 Z')
# Front rim + bowl (drawn over the items): top edge is the front lip of the rim, y=70 at x=128
FRONT = ('M14,60 C22,64 40,66 52,67 C80,70 104,71 128,70 C152,71 176,70 204,67 C216,66 234,64 242,60 '
         'C244,76 236,96 220,114 C198,140 162,152 128,152 C94,152 58,140 36,114 C20,96 12,76 14,60 Z')


def twigs(rnd, n, region, cols, wmin, wmax, curv=0.25, ang=(-0.25, 0.25), length=(26, 60)):
    """Random slightly curved twig strokes inside a box region (x0,y0,x1,y1)."""
    x0, y0, x1, y1 = region
    out = ''
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        a = rnd.uniform(*ang)
        L = rnd.uniform(*length)
        dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
        bend = rnd.uniform(-curv, curv) * L
        qx, qy = x - math.sin(a) * bend, y + math.cos(a) * bend
        col = rnd.choice(cols)
        out += path(f'M{f(x - dx)},{f(y - dy)} Q{f(qx)},{f(qy)} {f(x + dx)},{f(y + dy)}', stroke(col, rnd.uniform(wmin, wmax)))
    return out


def bowl_twigs(rnd, ytop, n):
    """Twigs following the bowl curvature: angle depends on x so they wrap around."""
    out = ''
    for i in range(n):
        x = rnd.uniform(20, 236)
        y = rnd.uniform(ytop, 146)
        # bowl tangent: near the sides strokes tilt toward the bottom centre
        t = (x - 128) / 128
        a = t * 0.5 * (y - 60) / 80 + rnd.uniform(-0.18, 0.18)
        L = rnd.uniform(30, 64)
        dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
        bend = rnd.uniform(0.05, 0.16) * L  # sag downward (round bowl)
        qx, qy = x, y + bend
        col = rnd.choice([NEST['mid'], NEST['dark'], NEST['light'], NEST['mid'], NEST['base']])
        out += path(f'M{f(x - dx)},{f(y - dy)} Q{f(qx)},{f(qy)} {f(x + dx)},{f(y + dy)}', stroke(col, rnd.uniform(2.6, 4.6)))
    return out


def stray_twigs(rnd, spots):
    out = ''
    for (x, y, a, L) in spots:
        dx, dy = math.cos(a) * L, math.sin(a) * L
        d = f'M{f(x)},{f(y)} q{f(dx * 0.5)},{f(dy * 0.5 - 3)} {f(dx)},{f(dy)}'
        out += path(d, stroke(NEST['line'], 6.4)) + path(d, stroke(NEST['mid'], 3))
    return out


def straw(rnd, spots):
    out = ''
    for (x, y, a, L) in spots:
        dx, dy = math.cos(a) * L, math.sin(a) * L
        d = f'M{f(x)},{f(y)} q{f(dx * 0.5)},{f(dy * 0.5 - 5)} {f(dx)},{f(dy)}'
        out += path(d, stroke(NEST['strawDk'], 3.6)) + path(d, stroke(NEST['straw'], 2.2))
    return out


def gen_nest():
    # ---- back: full silhouette + hollow inside + back rim twigs
    rnd = random.Random(7)
    defs = (f'<clipPath id="no">{path(OUTER)}</clipPath>'
            f'<clipPath id="ni"><ellipse cx="{OPEN[0]}" cy="{OPEN[1]}" rx="{OPEN[2]}" ry="{OPEN[3]}"/></clipPath>')
    g = stray_twigs(rnd, [(30, 44, math.pi + 0.5, 22), (226, 44, -0.5, 22), (90, 30, math.pi + 1.1, 14), (176, 30, -1.2, 13)])
    g += straw(rnd, [(60, 32, math.pi + 0.6, 18), (196, 33, -0.4, 20)])
    g += path(OUTER, f'fill="{NEST["base"]}" stroke="{NEST["line"]}" stroke-width="{LW}"')
    g += '<g clip-path="url(#no)">'
    g += twigs(rnd, 34, (20, 26, 236, 60), [NEST['mid'], NEST['dark'], NEST['light'], NEST['base']], 2.6, 4.4, 0.15, (-0.35, 0.35), (24, 50))
    g += bowl_twigs(rnd, 70, 50)
    g += '</g>'
    # hollow
    ox, oy, orx, ory = OPEN
    g += ell(ox, oy, orx, ory, f'fill="{NEST["inner"]}"')
    g += '<g clip-path="url(#ni)">'
    g += ell(ox, oy + 10, orx - 6, ory - 2, f'fill="{NEST["deep"]}"')
    g += twigs(rnd, 22, (40, 44, 216, 80), [NEST['dark'], '#8A5A2E', NEST['deep']], 2.2, 3.2, 0.2, (-0.3, 0.3), (24, 46))
    g += ell(ox, oy - 22, orx + 4, 12, f'fill="{NEST["dark"]}" opacity="0.55"')  # inner shadow under back rim
    g += '</g>'
    g += ell(ox, oy, orx, ory, stroke(NEST['line'], 3.2))
    # back rim highlight twigs (in front of the hollow edge)
    g += path('M50,40 Q128,22 206,40', stroke(NEST['light'], 3.2) + ' opacity="0.8"')
    write('items/nest_back.svg', svg(256, 160, g, defs))

    # ---- front: rim lip + bowl, drawn over the items
    rnd = random.Random(11)
    defs = f'<clipPath id="nf">{path(FRONT)}</clipPath>'
    g = path(FRONT, f'fill="{NEST["base"]}"')
    g += '<g clip-path="url(#nf)">'
    g += bowl_twigs(rnd, 74, 70)
    # cel shading: darker lower-right band
    g += path('M250,70 C246,110 210,150 128,156 C60,156 30,140 20,128 C70,146 170,146 212,112 C234,92 244,78 250,70 Z', f'fill="{NEST["dark"]}" opacity="0.42"')
    g += path('M14,60 C22,64 40,66 52,67 C80,70 104,71 128,70 C152,71 176,70 204,67 C216,66 234,64 242,60 L242,86 C180,96 76,96 14,86 Z', f'fill="{NEST["light"]}" opacity="0.22"')
    # rim twigs that wrap across the lip (the chunky front rim)
    g += twigs(rnd, 26, (24, 70, 232, 92), [NEST['light'], NEST['mid'], NEST['base'], NEST['dark']], 3, 5, 0.12, (-0.12, 0.12), (36, 70))
    g += '</g>'
    # chunky rolled rim (the lip) — its own lighter band with wrapped twigs
    lip = 'M14,60 C22,64 40,66 52,67 C80,70 104,71 128,70 C152,71 176,70 204,67 C216,66 234,64 242,60'
    rim = lip + ' C240,78 228,88 204,91 C176,94 152,95 128,95 C104,95 80,94 52,91 C28,88 16,78 14,60 Z'
    g += f'<clipPath id="nr">{path(rim)}</clipPath>'
    g += path(rim, f'fill="{NEST["base"]}"')
    g += '<g clip-path="url(#nr)">'
    g += path('M10,80 C40,96 90,100 128,100 C170,100 216,96 246,80 L246,100 L10,100 Z', f'fill="{NEST["mid"]}" opacity="0.7"')
    for i in range(30):   # diagonal wrapped twigs across the roll
        x = 18 + i * 7.6 + rnd.uniform(-2, 2)
        a = rnd.choice((0.9, -0.9, 1.1)) + rnd.uniform(-0.2, 0.2)
        L = rnd.uniform(18, 30)
        y = 80 + rnd.uniform(-4, 4)
        dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
        col = rnd.choice([NEST['light'], NEST['light'], NEST['mid'], NEST['dark']])
        g += path(f'M{f(x - dx)},{f(y - dy)} Q{f(x + 3)},{f(y)} {f(x + dx)},{f(y + dy)}', stroke(col, rnd.uniform(2.6, 3.8)))
    g += path('M30,72 C60,77 100,79 128,78 C156,79 196,77 226,72', stroke('#E8BC82', 3.4) + ' opacity="0.9"')
    g += '</g>'
    g += path('M242,60 C240,78 228,88 204,91 C176,94 152,95 128,95 C104,95 80,94 52,91 C28,88 16,78 14,60', stroke(NEST['line'], 2.6) + ' opacity="0.8"')
    g += path(lip, stroke(NEST['line'], LW))
    g += path(FRONT, f'fill="none" stroke="{NEST["line"]}" stroke-width="{LW}" stroke-linejoin="round"')
    g += stray_twigs(rnd, [(18, 84, math.pi + 0.35, 16), (238, 86, -0.3, 16)])
    g += straw(rnd, [(46, 72, math.pi + 0.3, 20), (150, 80, 0.25, 22), (214, 72, -0.2, 18), (92, 84, 2.9, 16)])
    write('items/nest_front.svg', svg(256, 160, g, defs))


# ======================================================================= SIGN
def gen_sign():
    wood, woodDk, woodLn, board, boardSh = '#C98B4F', '#A06A36', '#6E431F', '#FFF3D9', '#F3DFB8'
    g = ''
    # stake (behind board)
    g += path('M57,80 L71,80 L70,107 Q64,113 58,107 Z', f'fill="{wood}" stroke="{woodLn}" stroke-width="{LW}" stroke-linejoin="round"')
    g += path('M66,84 L66,104', stroke(woodDk, 3))
    # grass tuft at the stake foot (small, fits inside the box)
    g += path('M50,112 Q53,103 56,111 Q60,101 63,112 Z', f'fill="#7DBA4E"')
    g += path('M66,112 Q70,102 72,111 Q76,104 78,112 Z', f'fill="#7DBA4E"')
    # frame
    g += f'<rect x="5" y="2" width="118" height="83" rx="13" fill="{wood}" stroke="{woodLn}" stroke-width="{LW}"/>'
    g += path('M9,74 Q64,80 119,74 L119,72 Q119,81 110,82 L18,82 Q9,81 9,72 Z', f'fill="{woodDk}" opacity="0.6"')
    # board (the code draws the label inside x12-116, y8-78)
    g += f'<rect x="12" y="8" width="104" height="70" rx="8" fill="{board}" stroke="{woodDk}" stroke-width="2.4"/>'
    g += path('M14,70 Q64,76 114,70 L114,72 Q114,76 110,76 L18,76 Q14,76 14,72 Z', f'fill="{boardSh}"')
    # tiny nail heads on frame corners
    for x, y in ((9, 6), (119, 6), (9, 80), (119, 80)):
        g += circ(x, y, 1.9, f'fill="{woodLn}"')
    # frame grain hints
    g += path('M28,4.8 L52,4.8 M80,4.8 L96,4.8', stroke('#E0AA70', 1.8))
    return write('items/sign.svg', svg(128, 112, g))


# ======================================================================= STARS
def gen_stars():
    sp = star_path(32, 34, 28, 13.5)
    defs = f'<clipPath id="st">{path(sp)}</clipPath>'
    g = path(sp, f'fill="#FFC83A" stroke="#C98612" stroke-width="{LW}" stroke-linejoin="round"')
    g += ('<g clip-path="url(#st)">' + path('M32,34 L64,40 L64,64 L0,64 L0,48 Z', 'fill="#F5A623" opacity="0.6"')
          + '</g>')
    g += path(sp, f'fill="none" stroke="#C98612" stroke-width="{LW}" stroke-linejoin="round"')
    g += ell(24, 24, 5, 8, 'fill="#FFFFFF" opacity="0.7" transform="rotate(35 24 24)"')
    g += circ(20, 34, 2.2, 'fill="#FFFFFF" opacity="0.6"')
    write('ui/star.svg', svg(64, 64, g, defs))
    g = path(sp, f'fill="#E8EDF3" fill-opacity="0.9" stroke="#9AA7B8" stroke-width="{LW}" stroke-linejoin="round"')
    g += path(star_path(32, 34, 18, 8.5), 'fill="none" stroke="#C4CDD8" stroke-width="2.2" stroke-linejoin="round" stroke-dasharray="3 4"')
    write('ui/star_empty.svg', svg(64, 64, g))


# ======================================================================= ICON
def gen_icon():
    defs = ('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#8FD3FF"/><stop offset="1" stop-color="#DDF3FF"/></linearGradient>'
            f'<clipPath id="hd">{head_shapes()}</clipPath><clipPath id="bd">{ell(*BODY)}</clipPath>'
            f'<clipPath id="eg">{path(EGG_D)}</clipPath>')
    g = '<rect width="512" height="512" fill="url(#sky)"/>'
    g += circ(430, 92, 44, 'fill="#FFF3B0"') + circ(430, 92, 32, 'fill="#FFE37A"')
    g += path('M40,120 q18,-26 44,-10 q22,-20 44,4 q18,2 16,18 l-108,0 q-14,-4 4,-12 Z', 'fill="#FFFFFF" opacity="0.9"')
    # hill
    g += path('M0,400 C120,360 260,370 512,392 L512,512 L0,512 Z', 'fill="#A8D36F"')
    g += path('M0,440 C150,412 330,420 512,440 L512,512 L0,512 Z', 'fill="#92C45E"')
    # egg (blue: contrasts with teal Bo and the sky? -> use red for punch)
    egg = egg_svg('red', 105)
    egg_inner = egg[egg.index('</defs>') + 7:egg.rindex('</svg>')]
    # Bo, big friendly face filling the left/centre; body runs off the bottom edge
    bo_inner = head(eyes_open(look=(3, 0)), 'big', None, 0.8)
    plates = plate(82, 92, -62, 0.95) + plate(104, 54, -38, 1.08)
    bo_g = f'<g transform="translate(-168,-46) scale(2.6)">{plates}{body()}{bo_inner}</g>'
    egg_g = f'<g transform="translate(300,268) scale(1.75) rotate(10 64 68)">{egg_inner}</g>'
    g += egg_g + bo_g
    write('icon.svg', svg(512, 512, g, defs))


if __name__ == '__main__':
    gen_bo()
    gen_eggs()
    gen_nest()
    gen_sign()
    gen_stars()
    gen_icon()
    print('wrote art to', OUT)
