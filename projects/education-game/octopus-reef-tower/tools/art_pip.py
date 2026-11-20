#!/usr/bin/env python3
"""Character / UI art generator for Pip's Reef Tower (character artist A).

Writes (relative to game/assets/default/):
  characters/pip_{idle,blink,talk,happy,cheer,think,oops,hold,blow}.svg   0 0 300 400
        Pip, a round little peach octopus with a mint diving mask pushed up on her forehead, 3/4 view facing RIGHT
        (towards the tower). FEET anchor (150, 392) = the bottom of the curled arms.
        The six "leg" arms (4 front, 2 back peeking) are IDENTICAL in every frame; the head/mantle (own transform
        around the pivot HEAD_PIVOT) and the two side "hand" arms change.
          idle · blink · talk (mouth open) · happy (big smile) · cheer (both hand arms up waving, eyes-closed smile)
          think (head tilt, eyes up, arm tip on the chin) · oops ("hmm?" tilt, one brow up, never sad)
          hold (both hand arms reaching forward-right, tips at x ≈ 290, y ≈ 150..176)
          blow (leans forward, puffed cheeks, eyes closed, round "o" lips at BLOW_LIPS = (265, 150), pointing right)
  characters/pip_full_wave.svg   0 0 300 400   title pose: near arm raised and waving, happy face
  characters/crown.svg           0 0 80 90     chubby golden-amber starfish, bottom anchor (40, 86)
  characters/puffer.svg          0 0 120 100   friendly puffer fish, facing LEFT (normal, oval)
  characters/puffer_up.svg       0 0 120 100   puffed round with soft round spikes, surprised happy face
  characters/pearl.svg           0 0 48 48     glowing pearl on a tiny open shell, pearl centre (24, 22), bottom (24, 46)
  icon.svg                       0 0 512 512   full bleed: Pip beside a red/yellow/blue shell tower with the starfish

Usage: python3 tools/art_pip.py [outDir]
Rules (docs/DESIGN.md §3): 100 % original, flat cartoon, outline in a darker tone (never black), one-step cel
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
    'body': '#F6B08E', 'shade': '#E09372', 'line': '#A85E45', 'hi': '#FCCDB4',
    'spot': '#FCE3D2', 'sucker': '#FCD9C6',
    'eye': '#2F2A3A', 'white': '#FFFFFF', 'cheek': '#F58C8C',
    'mouth': '#7A3440', 'tongue': '#F2909F',
    'mask': '#9ED8CB', 'strap': '#5FA597', 'maskLn': '#468A7D', 'glass': '#E4F6F2', 'glassSh': '#C3E9E0',
}
LW = 4.5                 # outline width at viewBox 300×400 (≈ 4 px at 256)
FEET_Y = 392
HEAD_PIVOT = (150, 250)  # head/mantle transforms rotate around this point
BLOW_LIPS = (265, 150)   # contract: round "o" lips in the blow frame


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
    """Smooth path through pts (Catmull-Rom → cubic Bézier)."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        if not close:
            p0 = pts[max(0, i - 1)]
            p3 = pts[min(n - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if close else '')


def poly_d(pts, close=True):
    d = 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts)
    return d + (' Z' if close else '')


def ell_d(cx, cy, rx, ry):
    return (f'M{f(cx - rx)},{f(cy)} a{f(rx)},{f(ry)} 0 1,0 {f(2 * rx)},0 '
            f'a{f(rx)},{f(ry)} 0 1,0 {f(-2 * rx)},0 Z')


def rot(p, a, o=(0, 0)):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    x, y = p[0] - o[0], p[1] - o[1]
    return (o[0] + x * c - y * s, o[1] + x * s + y * c)


def cel(cid, shape_d, base, shade, dx, dy, hi=None, hi_xy=None, hi_op=0.6):
    """Clip to shape: shade everywhere, base on a copy shifted up-left (one-step cel), optional soft highlight."""
    out = f'<clipPath id="{cid}"><path d="{shape_d}"/></clipPath>'
    out += f'<g clip-path="url(#{cid})"><path d="{shape_d}" fill="{shade}"/>'
    out += f'<path d="{shape_d}" fill="{base}" transform="translate({f(dx)} {f(dy)})"/>'
    if hi:
        x, y, rx, ry, r = hi_xy
        out += ell(x, y, rx, ry, f'fill="{hi}" opacity="{hi_op}"', r)
    out += '</g>'
    return out


# ======================================================================= TENTACLES
def catmull(pts, per=10):
    """Sample an open Catmull-Rom spline through pts."""
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(n - 1, i + 2)]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(pts[-1])
    return out


def tentacle(pts, w0, w1, curl=0, curl_r=14, curl_turn=250, fill=None, line=None, shade=None,
             suckers=True, n_suck=4, cid=None):
    """A tapered octopus arm along pts (root first). curl = +1 / -1 rolls the tip up into a little spiral
    (+1: heading angle increases, i.e. turns clockwise on screen). The root end has no outline (it hides under the
    head or blends into it). Returns (svg, tip_point)."""
    fill = fill or P['body']
    line = line or P['line']
    shade = shade or P['shade']
    c = catmull(pts)
    if curl:
        a = math.atan2(c[-1][1] - c[-2][1], c[-1][0] - c[-2][0])
        steps = 16
        tot = math.radians(curl_turn)
        x, y = c[-1]
        for i in range(1, steps + 1):
            r = curl_r * (1 - 0.5 * i / steps)
            da = tot / steps
            a += curl * da
            x += r * da * math.cos(a)
            y += r * da * math.sin(a)
            c.append((x, y))
    # cumulative length → width
    L = [0.0]
    for i in range(1, len(c)):
        L.append(L[-1] + math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]))
    tot = L[-1] or 1
    W = [w0 + (w1 - w0) * (l / tot) ** 0.85 for l in L]
    left, right, norms = [], [], []
    for i, p in enumerate(c):
        a, b = c[max(0, i - 1)], c[min(len(c) - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        m = math.hypot(tx, ty) or 1
        nx, ny = -ty / m, tx / m
        norms.append((nx, ny))
        left.append((p[0] + nx * W[i] / 2, p[1] + ny * W[i] / 2))
        right.append((p[0] - nx * W[i] / 2, p[1] - ny * W[i] / 2))
    # round tip cap
    tx, ty = c[-1][0] - c[-2][0], c[-1][1] - c[-2][1]
    ang = math.atan2(ty, tx)
    cap = []
    r = W[-1] / 2
    for k in range(1, 8):
        aa = ang + math.pi / 2 - math.pi * k / 8
        cap.append((c[-1][0] + r * math.cos(aa), c[-1][1] + r * math.sin(aa)))
    outline = left + cap + right[::-1]
    out = path(poly_d(outline), f'fill="{fill}"')
    # one-step cel: the underside (inner side of the curl, or the right side) in shade
    side = -1 if curl >= 0 else 1      # +n side is the inner side for curl=+1 … pick the opposite edge for shade
    side = 1 if curl > 0 else -1
    inner = [(p[0] + side * nx * W[i] / 2, p[1] + side * ny * W[i] / 2) for i, (p, (nx, ny)) in enumerate(zip(c, norms))]
    mid = [(p[0] + side * nx * W[i] * 0.12, p[1] + side * ny * W[i] * 0.12) for i, (p, (nx, ny)) in enumerate(zip(c, norms))]
    if shade != fill:
        out += path(poly_d(mid + inner[::-1]), f'fill="{shade}"')
    # suckers along the inner side near the tip
    if suckers:
        i0 = int(len(c) * 0.42)
        idx = [int(i0 + (len(c) - 3 - i0) * k / max(1, n_suck - 1)) for k in range(n_suck)]
        for i in idx:
            nx, ny = norms[i]
            rr = max(2.2, W[i] * 0.19)
            px, py = c[i][0] + side * nx * (W[i] / 2 - rr * 0.9), c[i][1] + side * ny * (W[i] / 2 - rr * 0.9)
            out += circ(px, py, rr, f'fill="{P["sucker"]}" stroke="{line}" stroke-width="1.6" stroke-opacity="0.55"')
    # soft highlight along the outer side of the first half
    hl = [(p[0] - side * nx * W[i] * 0.26, p[1] - side * ny * W[i] * 0.26)
          for i, (p, (nx, ny)) in enumerate(zip(c, norms))][int(len(c) * 0.12):int(len(c) * 0.5)]
    if len(hl) > 2 and fill == P['body']:
        out += path(poly_d(hl, False), stroke(P['hi'], 3.2).replace('fill="none"', 'fill="none" opacity="0.8"'))
    out += path(poly_d(outline[1:-1], False), stroke(line, LW))
    return out, c[-1]


# ======================================================================= PIP
# Mantle (head) in rest coordinates.
MANTLE_PTS = [(142, 64), (196, 72), (238, 102), (258, 150), (257, 198), (240, 236), (200, 258), (150, 264),
              (100, 258), (60, 236), (43, 196), (45, 146), (66, 100), (100, 74)]
MANTLE_D = smooth_d(MANTLE_PTS)

# Six leg arms, identical in every frame (drawn behind the mantle, emerging below it).
#   (centreline, root width, tip width, curl, curl radius, fill)
LEGS_BACK = [
    ([(116, 220), (104, 300), (96, 350)], 34, 10, 1, 11, 'shade'),
    ([(186, 220), (200, 300), (208, 350)], 34, 10, -1, 11, 'shade'),
]
LEGS_FRONT = [
    ([(98, 222), (74, 298), (60, 346)], 46, 13, 1, 16, 'body'),
    ([(134, 232), (128, 306), (122, 352)], 46, 13, 1, 14, 'body'),
    ([(168, 232), (176, 306), (184, 352)], 46, 13, -1, 14, 'body'),
    ([(204, 222), (230, 298), (244, 346)], 46, 13, -1, 16, 'body'),
]


def legs():
    out = ''
    for pts, w0, w1, cu, cr, col in LEGS_BACK:
        s, _ = tentacle(pts, w0, w1, cu, cr, fill=P['shade'], shade='#D4866A', suckers=True, n_suck=3)
        out += s
    for pts, w0, w1, cu, cr, col in LEGS_FRONT:
        s, _ = tentacle(pts, w0, w1, cu, cr)
        out += s
    return out


def eye(x, y, mode, look=(0, 0), s=1.0):
    if mode == 'closed':          # happy closed arc  ^
        return path(f'M{f(x - 11 * s)},{f(y + 4 * s)} Q{f(x)},{f(y - 10 * s)} {f(x + 11 * s)},{f(y + 4 * s)}',
                    stroke(P['eye'], 4.6 * s))
    if mode == 'shut':            # blink / blow: gentle down-curve with a lash
        return (path(f'M{f(x - 11 * s)},{f(y)} Q{f(x)},{f(y + 8 * s)} {f(x + 11 * s)},{f(y)}', stroke(P['eye'], 4.6 * s)) +
                path(f'M{f(x + 10 * s)},{f(y)} l{f(5 * s)},{f(-4 * s)}', stroke(P['eye'], 3.2 * s)))
    lx, ly = look
    out = ell(x + lx, y + ly, 14 * s, 17.5 * s, f'fill="{P["eye"]}"')
    out += circ(x + lx + 4.6 * s, y + ly - 6 * s, 5.6 * s, f'fill="{P["white"]}"')
    out += circ(x + lx - 4.5 * s, y + ly + 6.5 * s, 2.5 * s, f'fill="{P["white"]}" opacity="0.9"')
    # one little lash flick at the outer top (a girl, a bit of sparkle)
    out += path(f'M{f(x + 11 * s)},{f(y - 11 * s)} l{f(6 * s)},{f(-5 * s)}', stroke(P['eye'], 3.2 * s))
    return out


def mask():
    """Mint diving mask pushed up on the forehead (3/4 view), strap running round the back of the head."""
    out = ''
    # strap: clipped to the mantle so it wraps the dome
    out += '<g clip-path="url(#mc)">'
    sd = 'M150,104 Q96,92 30,130'
    out += path(sd, stroke(P['maskLn'], 17)) + path(sd, stroke(P['strap'], 11))
    out += path('M150,100 Q96,88 34,124', stroke('#86C3B6', 3))
    out += '</g>'
    g = '<g transform="rotate(-7 196 104)">'
    # frame (two lenses + bridge)
    fr = ell_d(170, 104, 27, 21)
    fr2 = ell_d(224, 104, 18, 19)
    g += path('M186,98 Q197,92 210,98 L210,112 Q197,108 186,112 Z', filled(P['mask'], P['maskLn'], 3.6))
    g += path(fr, filled(P['mask'], P['maskLn'], LW)) + path(fr2, filled(P['mask'], P['maskLn'], LW))
    # glass
    g += ell(170, 104, 19, 14, filled(P['glass'], P['strap'], 2.6)) + ell(225, 104, 11.5, 12.5, filled(P['glass'], P['strap'], 2.6))
    g += path('M156,112 Q170,120 186,108', stroke(P['glassSh'], 4))
    g += path('M160,99 L172,93', stroke(P['white'], 4.4)) + path('M166,106 L176,100', stroke(P['white'], 3).replace('fill="none"', 'fill="none" opacity="0.8"'))
    g += path('M219,98 L226,95', stroke(P['white'], 3.4))
    # little rim highlight
    g += path('M148,96 Q156,86 170,84', stroke('#C9EDE5', 3.2))
    g += '</g>'
    return out + g


def head(face):
    """face: dict(eyes, look, mouth, puff, brow). Drawn in rest coordinates (the caller transforms)."""
    out = cel('mc', MANTLE_D, P['body'], P['shade'], -9, -10, hi=P['hi'], hi_xy=(92, 104, 30, 16, -38), hi_op=0.75)
    # cream spots on the back of the head (clipped)
    out += '<g clip-path="url(#mc)">'
    for x, y, r in ((78, 164, 11), (106, 192, 6.5), (60, 200, 6), (118, 146, 5.5), (88, 136, 4.5), (70, 226, 5)):
        out += circ(x, y, r, f'fill="{P["spot"]}"')
    out += ell(118, 80, 7, 4, f'fill="{P["white"]}" opacity="0.7"', -20)
    out += '</g>'
    out += path(MANTLE_D, filled('none', P['line']))
    puff = face.get('puff', 0)
    # cheeks
    out += ell(150, 184, 15 + puff, 9 + puff * 0.6, f'fill="{P["cheek"]}" opacity="0.8"')
    out += ell(246, 178, 9 + puff * 0.6, 7 + puff * 0.4, f'fill="{P["cheek"]}" opacity="0.8"')
    em = face.get('eyes', 'open')
    look = face.get('look', (0, 0))
    out += eye(176, 152, em, look)
    out += eye(230, 148, em, look, 0.84)
    br = face.get('brow')
    if br == 'up':                 # "hmm?" one brow up on the far eye, the other flat
        out += path('M218,120 Q230,110 242,118', stroke(P['line'], 3.8))
        out += path('M162,126 Q176,123 190,127', stroke(P['line'], 3.8))
    m = face.get('mouth', 'smile')
    mx, my = 206, 184
    if m == 'smile':
        out += path(f'M{f(mx - 11)},{f(my)} Q{f(mx)},{f(my + 10)} {f(mx + 11)},{f(my - 1)}', stroke(P['mouth'], 3.8))
    elif m == 'talk':
        d = (f'M{f(mx - 10)},{f(my - 2)} Q{f(mx)},{f(my - 4)} {f(mx + 10)},{f(my - 3)} Q{f(mx + 9)},{f(my + 14)} '
             f'{f(mx)},{f(my + 14)} Q{f(mx - 9)},{f(my + 13)} {f(mx - 10)},{f(my - 2)} Z')
        out += path(d, filled(P['mouth'], P['mouth'], 2.5))
        out += ell(mx + 1, my + 8.5, 5.5, 3.6, f'fill="{P["tongue"]}"')
    elif m == 'big':
        d = (f'M{f(mx - 16)},{f(my - 4)} Q{f(mx)},{f(my - 1)} {f(mx + 16)},{f(my - 6)} Q{f(mx + 13)},{f(my + 18)} '
             f'{f(mx)},{f(my + 18)} Q{f(mx - 14)},{f(my + 17)} {f(mx - 16)},{f(my - 4)} Z')
        out += path(d, filled(P['mouth'], P['mouth'], 2.5))
        out += ell(mx + 1, my + 11, 8, 4.6, f'fill="{P["tongue"]}"')
    elif m == 'hmm':
        out += ell(mx + 2, my + 3, 4.6, 5.2, filled(P['mouth'], P['mouth'], 2))
    out += mask()
    return out


def blow_mouth(lips_local):
    """Puffed cheek bulge at the front of the face with round 'o' lips pointing right (head-local coords)."""
    lx, ly = lips_local
    out = ell(lx - 13, ly + 2, 19, 16, filled(P['body'], P['line']))
    out += ell(lx - 18, ly - 7, 7, 4, f'fill="{P["white"]}" opacity="0.6"', -20)
    out += ell(lx - 17, ly + 7, 9, 5.5, f'fill="{P["cheek"]}" opacity="0.85"')
    out += ell(lx + 1, ly, 6, 8.5, filled('#EE7F86', P['mouth'], 3))
    out += ell(lx + 2, ly, 2.4, 4.2, f'fill="{P["mouth"]}"')
    return out


def head_pt(p, tf):
    dx, dy, a = tf
    q = rot(p, a, HEAD_PIVOT)
    return (q[0] + dx, q[1] + dy)


def head_inv(p, tf):
    dx, dy, a = tf
    return rot((p[0] - dx, p[1] - dy), -a, HEAD_PIVOT)


# hand-arm roots on the mantle (rest coordinates; moved with the head)
ROOT_FAR = (70, 206)
ROOT_NEAR = (232, 208)


def hand_rest(side, tf):
    if side == 'far':
        r = head_pt(ROOT_FAR, tf)
        return ([r, (44, 246), (32, 290)], 30, 9, -1, 12)
    r = head_pt(ROOT_NEAR, tf)
    return ([r, (258, 246), (270, 290)], 30, 9, 1, 12)


def frame(face, tf=(0, 0, 0), far=None, near=None, near_front=False, extra=''):
    far = far or hand_rest('far', tf)
    near = near or hand_rest('near', tf)
    out = ell(152, 390, 104, 8, 'fill="#2F4A5A" opacity="0.13"')
    s_far, _ = tentacle(*far, fill=P['shade'], shade='#D4866A', n_suck=3)
    s_near, tip = tentacle(*near)
    out += s_far + legs()
    if not near_front:
        out += s_near
    dx, dy, a = tf
    g = f'<g transform="translate({f(dx)} {f(dy)}) rotate({f(a)} {HEAD_PIVOT[0]} {HEAD_PIVOT[1]})">'
    g += head(face)
    if face.get('mouth') == 'o':
        g += blow_mouth(head_inv(BLOW_LIPS, tf))
    g += '</g>'
    out += g
    if near_front:
        out += s_near
    out += extra
    return svg(300, 400, out)


TF = {
    'think': (-2, 0, -6),
    'oops': (2, 0, 7),
    'cheer': (0, -6, -3),
    'hold': (-10, 2, -4),
    'blow': (24, -12, -6),
    'wave': (0, 0, -3),
}


def motion_arcs(pts):
    out = ''
    for d in pts:
        out += path(d, stroke('#FFFFFF', 5.5)) + path(d, stroke(P['line'], 2.4))
    return out


def pip_frames():
    fr = {}
    fr['idle'] = frame({'eyes': 'open'})
    fr['blink'] = frame({'eyes': 'shut'})
    fr['talk'] = frame({'eyes': 'open', 'mouth': 'talk'})
    fr['happy'] = frame({'eyes': 'open', 'mouth': 'big', 'puff': 2})
    t = TF['cheer']
    fr['cheer'] = frame({'eyes': 'closed', 'mouth': 'big', 'puff': 2}, t,
                        far=([head_pt(ROOT_FAR, t), (40, 168), (30, 118)], 30, 9, -1, 12),
                        near=([head_pt(ROOT_NEAR, t), (266, 164), (272, 112)], 30, 9, 1, 12),
                        extra=motion_arcs(['M14,96 q-8,14 -4,30', 'M286,92 q10,14 6,32']))
    t = TF['think']
    chin = head_pt((214, 204), t)
    fr['think'] = frame({'eyes': 'open', 'look': (2, -5), 'mouth': 'smile'}, t,
                        near=([(222, 268), (256, 262), (262, 236), (chin[0] + 10, chin[1] + 4)], 26, 10, 1, 7),
                        near_front=True)
    t = TF['oops']
    fr['oops'] = frame({'eyes': 'open', 'look': (1, -2), 'mouth': 'hmm', 'brow': 'up'}, t,
                       near=([head_pt(ROOT_NEAR, t), (270, 236), (280, 206)], 30, 9, -1, 10))
    t = TF['hold']
    fr['hold'] = frame({'eyes': 'open', 'look': (3, -1), 'mouth': 'talk'}, t,
                       far=([head_pt((228, 168), t), (262, 154), (284, 148)], 28, 13, -1, 5, 140),
                       near=([head_pt((226, 214), t), (258, 204), (276, 190), (286, 174)], 32, 14, -1, 5, 140))
    t = TF['blow']
    fr['blow'] = frame({'eyes': 'closed', 'mouth': 'o', 'puff': 5}, t)
    for k, v in fr.items():
        write(f'characters/pip_{k}.svg', v)
    t = TF['wave']
    wave = frame({'eyes': 'open', 'mouth': 'big', 'puff': 2}, t,
                 near=([head_pt(ROOT_NEAR, t), (268, 168), (266, 112)], 30, 9, 1, 13),
                 extra=motion_arcs(['M244,86 q12,-12 30,-10', 'M240,70 q18,-20 44,-16']))
    write('characters/pip_full_wave.svg', wave)


# ======================================================================= CROWN (golden starfish)
GOLD, GOLD_DK, GOLD_LT = '#F5B83D', '#B67A16', '#FFE29A'


def star_d(cx, cy, R, r, rot_deg=-90, n=5):
    pts = []
    for i in range(2 * n):
        a = math.radians(rot_deg + 180 * i / n)
        rr = R if i % 2 == 0 else r
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return smooth_d(pts)


def starfish(cx, cy, R, cid, face=True, sparkles=True):
    d = star_d(cx, cy, R, R * 0.56)
    out = cel(cid, d, GOLD, '#E09A2A', -R * 0.09, -R * 0.1, hi=GOLD_LT, hi_xy=(cx - R * 0.32, cy - R * 0.36, R * 0.2, R * 0.1, -35), hi_op=0.8)
    # texture dots along the arms
    out += f'<g clip-path="url(#{cid})">'
    for i in range(5):
        a = math.radians(-90 + 72 * i)
        for k, rr in ((0.52, 0.075), (0.75, 0.055)):
            out += circ(cx + R * k * math.cos(a), cy + R * k * math.sin(a), R * rr, f'fill="{GOLD_LT}" opacity="0.9"')
    out += '</g>'
    out += path(d, filled('none', GOLD_DK, max(2.6, R * 0.09)))
    if face:
        s = R / 36
        out += ell(cx - 7 * s, cy - 1 * s, 3.4 * s, 4.2 * s, f'fill="{P["eye"]}"') + circ(cx - 6 * s, cy - 2.6 * s, 1.3 * s, 'fill="#FFFFFF"')
        out += ell(cx + 7 * s, cy - 1 * s, 3.4 * s, 4.2 * s, f'fill="{P["eye"]}"') + circ(cx + 8 * s, cy - 2.6 * s, 1.3 * s, 'fill="#FFFFFF"')
        out += ell(cx - 12 * s, cy + 6 * s, 3.6 * s, 2.2 * s, f'fill="{P["cheek"]}" opacity="0.8"')
        out += ell(cx + 12 * s, cy + 6 * s, 3.6 * s, 2.2 * s, f'fill="{P["cheek"]}" opacity="0.8"')
        out += path(f'M{f(cx - 4 * s)},{f(cy + 5 * s)} Q{f(cx)},{f(cy + 9 * s)} {f(cx + 4 * s)},{f(cy + 5 * s)}', stroke('#8A5410', 2 * s))
    if sparkles:
        for x, y, r in ((cx - R * 0.86, cy - R * 0.66, R * 0.12), (cx + R * 0.84, cy - R * 0.8, R * 0.15), (cx + R * 0.82, cy + R * 0.12, R * 0.09)):
            out += sparkle(x, y, r)
    return out


def sparkle(x, y, r, col='#FFFFFF', line=GOLD_DK):
    d = (f'M{f(x)},{f(y - r)} Q{f(x + r * 0.18)},{f(y - r * 0.18)} {f(x + r)},{f(y)} Q{f(x + r * 0.18)},{f(y + r * 0.18)} '
         f'{f(x)},{f(y + r)} Q{f(x - r * 0.18)},{f(y + r * 0.18)} {f(x - r)},{f(y)} Q{f(x - r * 0.18)},{f(y - r * 0.18)} {f(x)},{f(y - r)} Z')
    return path(d, f'fill="{col}" stroke="{line}" stroke-width="1.2" stroke-opacity="0.6"')


def crown():
    out = ell(40, 86, 22, 3, 'fill="#2F4A5A" opacity="0.15"')
    out += starfish(40, 52, 37, 'cs')
    write('characters/crown.svg', svg(80, 90, out))


# ======================================================================= PUFFER
PB, PBSH, PBEL, PLN, PSPK = '#E8E2A4', '#D3CB86', '#FFF6DE', '#8F8448', '#A88A57'


def puffer(up):
    out = ''
    if not up:
        cx, cy, rx, ry = 58, 52, 40, 30
        # tail fin (right)
        out += path('M94,52 Q108,34 116,38 Q110,52 116,66 Q108,70 94,52 Z', filled(PBSH, PLN, 3.2))
        out += path('M101,48 l9,-4 M101,56 l9,4', stroke(PLN, 1.8))
        # dorsal + belly fins
        out += path('M62,24 Q72,10 82,18 Q78,26 72,28 Z', filled(PBSH, PLN, 3))
        out += path('M64,80 Q70,92 80,86 Q76,80 72,78 Z', filled(PBSH, PLN, 3))
        bd = ell_d(cx, cy, rx, ry)
        out += f'<clipPath id="pb"><path d="{bd}"/></clipPath><g clip-path="url(#pb)">'
        out += path(bd, f'fill="{PBSH}"') + path(bd, f'fill="{PB}" transform="translate(-3 -4)"')
        out += path('M10,60 Q58,48 104,60 L104,90 L10,90 Z', f'fill="{PBEL}"')
        out += path('M10,60 Q58,48 104,60', stroke('#E6DBB4', 2.4))
        for x, y, r in ((60, 32, 2.6), (74, 36, 2.2), (86, 44, 2.4), (52, 40, 1.8), (68, 46, 1.8), (80, 30, 1.6), (90, 54, 1.8)):
            out += circ(x, y, r, f'fill="{PSPK}"')
        out += ell(40, 32, 12, 6, 'fill="#FFFFFF" opacity="0.55"', -25)
        out += '</g>'
        out += path(bd, filled('none', PLN, 3.6))
        # side (pectoral) fin
        out += path('M62,58 Q74,50 80,58 Q74,66 62,62 Z', filled(PB, PLN, 2.6))
        # face (left = front)
        out += circ(36, 46, 10, filled('#FFFFFF', PLN, 2.4))
        out += circ(34, 46, 6.4, f'fill="{P["eye"]}"') + circ(32, 43.6, 2.4, 'fill="#FFFFFF"')
        out += ell(34, 62, 5.2, 3.2, f'fill="{P["cheek"]}" opacity="0.8"')
        out += ell(20, 56, 4.5, 4, filled('#F2A08F', PLN, 2.2))
        out += path('M18.5,56 q1.5,1.6 3,0', stroke(PLN, 1.6))
    else:
        cx, cy, R = 60, 50, 38
        # tail fin
        out += path('M94,50 Q108,36 115,40 Q110,50 115,60 Q108,64 94,50 Z', filled(PBSH, PLN, 3.2))
        # soft round spikes around the ball
        for i in range(16):
            a = 2 * math.pi * (i + 0.5) / 16
            if math.cos(a) > 0.86:
                continue           # leave room for the tail
            bx, by = cx + R * 0.92 * math.cos(a), cy + R * 0.92 * math.sin(a)
            tx, ty = cx + (R + 10) * math.cos(a), cy + (R + 10) * math.sin(a)
            nx, ny = -math.sin(a) * 5, math.cos(a) * 5
            d = f'M{f(bx + nx)},{f(by + ny)} Q{f(tx + nx * 0.2)},{f(ty + ny * 0.2)} {f(tx)},{f(ty)} Q{f(tx - nx * 0.2)},{f(ty - ny * 0.2)} {f(bx - nx)},{f(by - ny)} Z'
            col = PBEL if math.sin(a) > 0.25 else PB
            out += path(d, filled(col, PLN, 2.6))
        bd = ell_d(cx, cy, R, R)
        out += f'<clipPath id="pu"><path d="{bd}"/></clipPath><g clip-path="url(#pu)">'
        out += path(bd, f'fill="{PBSH}"') + path(bd, f'fill="{PB}" transform="translate(-3 -4)"')
        out += path('M10,58 Q60,44 110,58 L110,96 L10,96 Z', f'fill="{PBEL}"')
        out += path('M10,58 Q60,44 110,58', stroke('#E6DBB4', 2.4))
        for x, y, r in ((62, 22, 2.6), (78, 28, 2.2), (88, 40, 2.4), (52, 30, 1.8), (70, 38, 1.8), (90, 54, 1.6), (40, 22, 1.6)):
            out += circ(x, y, r, f'fill="{PSPK}"')
        out += ell(42, 26, 12, 7, 'fill="#FFFFFF" opacity="0.6"', -30)
        out += '</g>'
        out += path(bd, filled('none', PLN, 3.6))
        # tiny fins sticking out
        out += path('M74,58 Q88,52 92,60 Q86,68 74,62 Z', filled(PB, PLN, 2.6))
        # surprised happy face
        for x, s in ((32, 1.0), (54, 0.86)):
            out += circ(x, 42, 10 * s, filled('#FFFFFF', PLN, 2.4))
            out += circ(x - 1, 42, 6.8 * s, f'fill="{P["eye"]}"') + circ(x - 3, 39.4, 2.5 * s, 'fill="#FFFFFF"')
        out += path('M22,28 q8,-6 14,-1', stroke(PLN, 2.4)) + path('M48,27 q6,-4 12,0', stroke(PLN, 2.4))
        out += ell(26, 58, 5, 3.4, f'fill="{P["cheek"]}" opacity="0.8"') + ell(60, 58, 4.4, 3, f'fill="{P["cheek"]}" opacity="0.8"')
        out += ell(40, 62, 6, 6.8, filled(P['mouth'], PLN, 2.2)) + ell(40, 65, 3.6, 2.4, f'fill="{P["tongue"]}"')
    write(f'characters/puffer{"_up" if up else ""}.svg', svg(120, 100, out))


# ======================================================================= PEARL
def pearl():
    defs = ('<radialGradient id="pg" cx="0.36" cy="0.32" r="0.75">'
            '<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.45" stop-color="#F6F3FF"/>'
            '<stop offset="0.78" stop-color="#E4DDF6"/><stop offset="1" stop-color="#CFC6EA"/></radialGradient>'
            '<radialGradient id="pw" cx="0.5" cy="0.5" r="0.5">'
            '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>')
    sh, shd, shl = '#F8E6D0', '#C9A47E', '#EED3B6'
    out = circ(24, 22, 22, 'fill="url(#pw)"')
    # open lid behind the pearl (fan, tilted back)
    lid = 'M8,26 Q6,8 24,4 Q42,8 40,26 Q24,22 8,26 Z'
    out += path(lid, filled(shl, shd, 2.4))
    for x in (14, 19, 24, 29, 34):
        out += path(f'M24,24 L{x},{8 if x == 24 else 9}', stroke(shd, 1.2).replace('fill="none"', 'fill="none" opacity="0.6"'))
    # pearl
    out += circ(24, 22, 11, 'fill="url(#pg)" stroke="#9C95B8" stroke-width="1.8"')
    out += path('M16,27 Q22,32 31,28', stroke('#F7C9DE', 2).replace('fill="none"', 'fill="none" opacity="0.8"'))
    out += path('M28,14 Q32,17 33,21', stroke('#BFE3F2', 2).replace('fill="none"', 'fill="none" opacity="0.9"'))
    out += ell(20, 17, 3.8, 2.6, 'fill="#FFFFFF"', -30)
    # lower shell (scalloped dish)
    d = 'M4,30 Q24,34 44,30 Q42,42 32,45 Q28,47 24,46 Q20,47 16,45 Q6,42 4,30 Z'
    out += path(d, filled(sh, shd, 2.6))
    for x in (11, 17.5, 24, 30.5, 37):
        out += path(f'M24,45 L{x},33', stroke(shl, 1.8))
    out += path('M7,31 Q24,35 41,31', stroke('#FFF6EA', 1.8))
    out += sparkle(41, 9, 4, '#FFFFFF', '#9C95B8')
    write('characters/pearl.svg', svg(48, 48, out, defs))


# ======================================================================= ICON
ANS = {'red': ('#E84A4A', '#A8282E', '#F7A0A0'), 'yellow': ('#FFD23F', '#C99A12', '#FFEB9C'),
       'blue': ('#3C8DE8', '#1F5BA8', '#A6CCF5')}


def shell_block(cx, top, w, h, col, seed):
    """Colour shell block for the icon (front face + thin top face + scalloped ridge + fanning ridge lines)."""
    base, dk, lt = ANS[col]
    x0, x1 = cx - w / 2, cx + w / 2
    r = 0.2 * h
    body = (f'M{f(x0)},{f(top + r)} Q{f(x0)},{f(top)} {f(x0 + r)},{f(top)} L{f(x1 - r)},{f(top)} '
            f'Q{f(x1)},{f(top)} {f(x1)},{f(top + r)} L{f(x1)},{f(top + h - r)} Q{f(x1)},{f(top + h)} {f(x1 - r)},{f(top + h)} '
            f'L{f(x0 + r)},{f(top + h)} Q{f(x0)},{f(top + h)} {f(x0)},{f(top + h - r)} Z')
    out = path(body, f'fill="{base}"')
    # top face band
    th = 0.14 * h
    out += path(f'M{f(x0 + r * 0.6)},{f(top + 2)} L{f(x1 - r * 0.6)},{f(top + 2)} L{f(x1 - 3)},{f(top + th)} L{f(x0 + 3)},{f(top + th)} Z', f'fill="{lt}"')
    # scalloped ridge
    n = 5 + seed % 3
    bw = (w - 2 * r * 0.4) / n
    d = f'M{f(x0 + r * 0.4)},{f(top + th)}'
    for i in range(n):
        xa = x0 + r * 0.4 + bw * i
        d += f' Q{f(xa + bw / 2)},{f(top - th * 1.3)} {f(xa + bw)},{f(top + th)}'
    out += path(d + ' Z', filled(lt, dk, 3.4))
    # fanning ridge lines
    fx, fy = cx, top + h * 1.05
    for k in (-0.5, 0, 0.5):
        ex = cx + k * w * 0.62
        out += path(f'M{f(fx + k * 12)},{f(top + h * 0.86)} Q{f((fx + ex) / 2)},{f(top + h * 0.5)} {f(ex)},{f(top + th + 8)}',
                    stroke(lt, 4).replace('fill="none"', 'fill="none" opacity="0.85"'))
    # tiny pearl detail in a corner
    out += circ(x1 - 15, top + h - 15, 5, f'fill="#FFFFFF" stroke="{dk}" stroke-width="2"')
    out += path(body, filled('none', dk, 5))
    return out


def icon():
    defs = ('<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#7FD0E3"/><stop offset="1" stop-color="#DDF4EC"/></linearGradient>'
            '<linearGradient id="ray" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.42"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>')
    out = '<rect width="512" height="512" fill="url(#sea)"/>'
    # light rays from the surface
    for x0, w, x1, w1 in ((60, 40, 150, 90), (200, 30, 300, 80), (330, 46, 450, 110), (450, 30, 560, 80)):
        out += path(f'M{x0},0 L{x0 + w},0 L{x1 + w1},420 L{x1},420 Z', 'fill="url(#ray)"')
    # wavy surface band
    out += path('M0,18 Q32,8 64,18 T128,18 T192,18 T256,18 T320,18 T384,18 T448,18 T512,18 L512,0 L0,0 Z', 'fill="#B9EAF2" opacity="0.8"')
    # far reef silhouettes
    out += path('M0,360 Q40,300 90,330 Q130,280 180,320 Q240,290 290,330 Q350,296 400,326 Q460,290 512,320 L512,512 L0,512 Z', 'fill="#A9DCD6" opacity="0.8"')
    # seaweed
    for x, h, c in ((470, 120, '#8FBF9F'), (492, 90, '#A6CDB0'), (30, 70, '#A6CDB0')):
        out += path(f'M{x},440 Q{x - 14},{440 - h * 0.35} {x + 2},{440 - h * 0.6} Q{x + 14},{440 - h * 0.8} {x},{440 - h}', stroke(c, 12))
    # sand
    out += path('M0,430 Q256,410 512,428 L512,512 L0,512 Z', 'fill="#F1E2BE"')
    out += path('M0,470 Q256,456 512,470 L512,512 L0,512 Z', 'fill="#E3CC9C"')
    # rising bubbles
    for x, y, r in ((300, 130, 9), (318, 92, 6), (290, 60, 4.5), (160, 40, 6), (176, 18, 4)):
        out += circ(x, y, r, 'fill="#FFFFFF" fill-opacity="0.25" stroke="#FFFFFF" stroke-width="2.6" stroke-opacity="0.9"')
        out += circ(x - r * 0.35, y - r * 0.35, r * 0.25, 'fill="#FFFFFF"')
    # rock
    out += path('M318,446 Q316,428 334,424 L476,424 Q494,428 492,446 Q480,458 404,458 Q330,458 318,446 Z', filled('#C9C3D6', '#8F86A6', 5))
    out += path('M330,432 L480,432', stroke('#DCD7E6', 5))
    # tower: red (bottom), yellow, blue (top)
    cx, w, h = 405, 136, 94
    tops = [424 - h, 424 - 2 * h + 2, 424 - 3 * h + 4]
    out += shell_block(cx, tops[0], w, h, 'red', 1)
    out += shell_block(cx, tops[1], w, h, 'yellow', 2)
    out += shell_block(cx, tops[2], w, h, 'blue', 3)
    # starfish crown on top
    out += starfish(cx, tops[2] - 36, 42, 'ic', face=True, sparkles=True)
    # Pip (waving) on the left
    pip_svg = open(os.path.join(OUT, 'characters', 'pip_full_wave.svg')).read()
    inner = pip_svg[pip_svg.index('>') + 1:pip_svg.rindex('</svg>')]
    inner = inner.replace('id="mc"', 'id="imc"').replace('url(#mc)', 'url(#imc)')
    out += f'<g transform="translate(-16 58) scale(1.1)">{inner}</g>'
    write('icon.svg', svg(512, 512, out, defs))


if __name__ == '__main__':
    pip_frames()
    crown()
    puffer(False)
    puffer(True)
    pearl()
    icon()
    t = TF['blow']
    print('blow lips at', BLOW_LIPS, '· local', tuple(round(v, 1) for v in head_inv(BLOW_LIPS, t)))
    print('written to', OUT)
