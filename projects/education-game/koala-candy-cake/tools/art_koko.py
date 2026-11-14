#!/usr/bin/env python3
"""Character / UI art generator for Koko's Cake Tower (character artist A).

Writes (relative to game/assets/default/):
  characters/koko_{idle,blink,talk,happy,cheer,think,oops,hold,blow}.svg   0 0 300 400
        Koko the little koala baker, 3/4 view facing RIGHT (towards the cake). FEET anchor (150, 392).
        Body, apron and feet are IDENTICAL in every frame; only the head (own local frame, origin = head centre)
        and the two arms change.
          idle · blink · talk (mouth open) · happy (big smile) · cheer (both arms up, eyes-closed smile)
          think (head tilt, eyes up, paw on chin) · oops ("hmm?" tilt, one brow up, never sad)
          hold (both paws forward-right, near palm at ≈ (285, 150))
          blow (head leaning forward-right, puffed cheeks, eyes closed, round "o" lips — see BLOW_LIPS)
  characters/koko_full_wave.svg   0 0 300 400   title pose: near paw raised and waving, happy face
  characters/cherry.svg           0 0 80 90     glossy cherry, bottom anchor (40, 86)
  characters/bee.svg, bee_up.svg  0 0 96 80     round honey bee, wings open / wings up (flap frames)
  characters/candle.svg           0 0 24 72     striped birthday candle, wick top (12, 4)
  icon.svg                        0 0 512 512   full bleed: Koko's head in the chef's hat + a red/yellow/blue cake

Usage: python3 tools/art_koko.py [outDir]
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
    'fur': '#A9B1BC', 'shade': '#8C95A3', 'line': '#56606E', 'hi': '#C4CAD3',
    'belly': '#E6E8EC', 'bellySh': '#D3D7DE',
    'ear': '#F4F1EC', 'earSh': '#E2DDD4',
    'nose': '#3B3946', 'noseLn': '#2A2833',
    'eye': '#2F2A3A', 'white': '#FFFFFF', 'cheek': '#F6B1A0',
    'mouth': '#6E3446', 'tongue': '#F2909F',
    'hat': '#FFFDF6', 'hatSh': '#F1EADC', 'hatLn': '#C9BBA3',
    'apron': '#9ED8CB', 'apronDk': '#5FA597', 'apronHi': '#C6EAE1',
    'pocket': '#FFF8EC', 'claw': '#56606E',
}
LW = 4.5                 # outline width at viewBox 300×400
FEET_Y = 392
HEAD_C = (150, 158)      # head centre in the default pose
SH_NEAR = (194, 262)     # shoulders (fixed, part of the shared body)
SH_FAR = (104, 262)
ARM_W = 32


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


def ell_d(cx, cy, rx, ry):
    return (f'M{f(cx - rx)},{f(cy)} a{f(rx)},{f(ry)} 0 1,0 {f(2 * rx)},0 '
            f'a{f(rx)},{f(ry)} 0 1,0 {f(-2 * rx)},0 Z')


def rot(p, a, o=(0, 0)):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    x, y = p[0] - o[0], p[1] - o[1]
    return (o[0] + x * c - y * s, o[1] + x * s + y * c)


def cel(cid, shape_d, base, shade, dx, dy, k=1.0, hi=None, hi_xy=None):
    """Clip to shape: shade everywhere, base on a copy shifted up-left (one-step cel), optional soft highlight."""
    out = f'<clipPath id="{cid}"><path d="{shape_d}"/></clipPath>'
    out += f'<g clip-path="url(#{cid})"><path d="{shape_d}" fill="{shade}"/>'
    out += f'<path d="{shape_d}" fill="{base}" transform="translate({f(dx)} {f(dy)})"/>'
    if hi:
        x, y, rx, ry, r = hi_xy
        out += ell(x, y, rx, ry, f'fill="{hi}" opacity="0.55"', r)
    out += '</g>'
    return out


# ======================================================================= KOKO
# ---------------------------------------------------------------- head (local frame, origin = head centre)
HEAD_PTS = [(0, -68), (52, -62), (84, -34), (90, 6), (78, 44), (44, 66), (0, 72), (-46, 66),
            (-80, 42), (-90, 4), (-82, -36), (-50, -62)]
HEAD_D = smooth_d(HEAD_PTS)
EAR_NEAR = (-80, -34, 44)
EAR_FAR = (74, -42, 38)


def ear(x, y, r, far, cid):
    """Big round ear with a fluffy cream inside whose tufts poke out past the rim on the outer side."""
    sd = 1 if far else -1                     # outer side of the head
    out = circ(x, y, r, filled(P['shade'] if far else P['fur'], P['line']))
    cx, cy = x + sd * r * 0.16, y + r * 0.06
    pts = []
    n = 18
    for i in range(n):
        a = 2 * math.pi * i / n
        outer = math.cos(a) * sd > 0.2       # tufts stick out more on the outer side
        rr = r * ((0.9 if outer else 0.74) if i % 2 == 0 else (0.70 if outer else 0.60))
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    fluff = P['earSh'] if far else P['ear']
    out += path(smooth_d(pts), f'fill="{fluff}" stroke="{P["hatLn"] if not far else P["line"]}" stroke-width="1.6" stroke-opacity="0.5"')
    for k in (-0.5, 0, 0.5):                  # a few fur strokes inside
        a = math.atan2(0, sd) + k
        out += path(f'M{f(cx + r * 0.18 * math.cos(a))},{f(cy + r * 0.18 * math.sin(a))} '
                    f'L{f(cx + r * 0.5 * math.cos(a))},{f(cy + r * 0.5 * math.sin(a))}', stroke(P['earSh'] if not far else P['ear'], 3))
    return out


def eye(x, y, mode, look=(0, 0), s=1.0):
    if mode == 'closed':          # happy closed arc  ^
        return path(f'M{f(x - 10 * s)},{f(y + 3 * s)} Q{f(x)},{f(y - 9 * s)} {f(x + 10 * s)},{f(y + 3 * s)}',
                    stroke(P['eye'], 4.2 * s))
    if mode == 'shut':            # blink / blow: gentle down-curve
        return path(f'M{f(x - 10 * s)},{f(y)} Q{f(x)},{f(y + 7 * s)} {f(x + 10 * s)},{f(y)}',
                    stroke(P['eye'], 4.2 * s))
    lx, ly = look
    out = ell(x + lx, y + ly, 9.5 * s, 11.5 * s, f'fill="{P["eye"]}"')
    out += circ(x + lx + 3.2 * s, y + ly - 4.2 * s, 3.8 * s, f'fill="{P["white"]}"')
    out += circ(x + lx - 3 * s, y + ly + 4.5 * s, 1.7 * s, f'fill="{P["white"]}" opacity="0.9"')
    return out


def head(face, cid='h'):
    """face: dict(eyes, look, mouth, cheeks_puff, brow, turn)."""
    t = face.get('turn', 0)          # extra shift of the face features to the right (more profile)
    out = ''
    out += ear(EAR_FAR[0] + t * 0.3, EAR_FAR[1], EAR_FAR[2], True, cid + 'ef')
    out += ear(*EAR_NEAR, False, cid + 'en')
    # head shape + cel
    out += cel(cid + 'c', HEAD_D, P['fur'], P['shade'], -7, -8, hi=P['hi'], hi_xy=(-44, -38, 26, 15, -30))
    # chin / muzzle fur (lighter)
    out += cel(cid + 'm', ell_d(20 + t, 40, 52, 30), P['belly'], P['bellySh'], -3, -4)
    out += path(HEAD_D, filled('none', P['line']))
    # little fur tuft on the crown is hidden by the hat; cheek fluff on the near side
    out += path(f'M-89,8 l-8,6 l9,4 l-6,8 l9,0', stroke(P['line'], 3.4, P['fur']))
    # cheeks
    puff = face.get('puff', 0)
    out += ell(-40 + t * 0.5, 28, 15 + puff, 9 + puff * 0.6, f'fill="{P["cheek"]}" opacity="0.85"')
    out += ell(70 + t, 22, 12 + puff * 0.8, 8 + puff * 0.5, f'fill="{P["cheek"]}" opacity="0.85"')
    # eyes
    em = face.get('eyes', 'open')
    look = face.get('look', (0, 0))
    out += eye(-16 + t * 0.6, -10, em, look)
    out += eye(52 + t, -12, em, look, 0.92)
    br = face.get('brow')
    if br == 'up':                 # "hmm?" one brow up on the far eye
        out += path(f'M{f(40 + t)},-36 Q{f(52 + t)},-46 {f(64 + t)},-38', stroke(P['line'], 3.6))
        out += path(f'M{f(-28 + t)},-30 Q{f(-16 + t)},-33 {f(-4 + t)},-30', stroke(P['line'], 3.6))
    if face.get('mouth') == 'o':   # puffed-up cheek/muzzle bulge, behind the nose
        lx, ly = BLOW_LIPS_LOCAL
        out += ell(lx - 20, ly - 3, 24, 20, filled(P['belly'], P['line']))
        out += ell(lx - 24, ly - 14, 10, 6, f'fill="{P["white"]}" opacity="0.6"', -20)
        out += ell(lx - 14, ly - 20, 12, 7, f'fill="{P["cheek"]}" opacity="0.85"')
    # nose (big oval spoon nose)
    nx, ny = 20 + t, 14
    out += ell(nx, ny, 22, 27, filled(P['nose'], P['noseLn'], 3.5))
    out += ell(nx - 8, ny - 9, 6.5, 9, f'fill="{P["white"]}" opacity="0.5"', -20)
    out += ell(nx + 9, ny + 13, 3.5, 2.5, f'fill="{P["white"]}" opacity="0.22"')
    # mouth
    m = face.get('mouth', 'smile')
    mx, my = 22 + t, 50
    if m == 'smile':
        out += path(f'M{f(mx - 12)},{f(my)} Q{f(mx)},{f(my + 10)} {f(mx + 12)},{f(my - 1)}', stroke(P['mouth'], 3.6))
    elif m == 'talk':
        d = f'M{f(mx - 11)},{f(my - 2)} Q{f(mx)},{f(my - 4)} {f(mx + 11)},{f(my - 3)} Q{f(mx + 9)},{f(my + 15)} {f(mx)},{f(my + 15)} Q{f(mx - 10)},{f(my + 14)} {f(mx - 11)},{f(my - 2)} Z'
        out += path(d, filled(P['mouth'], P['mouth'], 2.5))
        out += ell(mx + 1, my + 9, 6.5, 4, f'fill="{P["tongue"]}"')
    elif m == 'big':
        d = f'M{f(mx - 18)},{f(my - 4)} Q{f(mx)},{f(my - 1)} {f(mx + 18)},{f(my - 6)} Q{f(mx + 14)},{f(my + 20)} {f(mx)},{f(my + 20)} Q{f(mx - 15)},{f(my + 19)} {f(mx - 18)},{f(my - 4)} Z'
        out += path(d, filled(P['mouth'], P['mouth'], 2.5))
        out += ell(mx + 1, my + 13, 9, 5, f'fill="{P["tongue"]}"')
    elif m == 'hmm':
        out += ell(mx + 2, my + 3, 5, 5.5, filled(P['mouth'], P['mouth'], 2))
    elif m == 'o':                 # blowing: puffed muzzle bulge + round lips pushed forward-right
        lx, ly = BLOW_LIPS_LOCAL
        out += ell(lx - 2, ly, 7.5, 8.5, filled('#D97C84', P['mouth'], 3))
        out += ell(lx - 1, ly, 3.2, 4, f'fill="{P["mouth"]}"')
    out += hat(cid)
    return out


def hat(cid):
    """Cream chef's toque sitting on the crown, between the ears."""
    out = ''
    puffs = [(-36, -92, 27), (-6, -112, 31), (28, -108, 27), (44, -86, 22), (-50, -76, 18)]
    for x, y, r in puffs:
        out += circ(x, y, r, filled(P['hat'], P['hatLn'], LW))
    # cover inner outlines
    for x, y, r in puffs:
        out += circ(x, y, r - LW / 2, f'fill="{P["hat"]}"')
    # soft shade at the lower right of the puff + pleats
    out += path('M18,-84 Q40,-80 56,-92', stroke(P['hatSh'], 9))
    out += path('M-14,-86 Q-12,-104 -2,-116', stroke(P['hatSh'], 4))
    out += path('M16,-84 Q20,-100 30,-110', stroke(P['hatSh'], 4))
    out += ell(-14, -124, 10, 6, f'fill="{P["white"]}" opacity="0.9"', -20)
    # band (slightly curved, tilted with the 3/4 view)
    band = 'M-54,-72 Q-6,-80 50,-74 L52,-52 Q-4,-58 -52,-50 Z'
    out += path(band, filled(P['hat'], P['hatLn'], LW))
    out += path('M-48,-58 Q-4,-64 46,-60', stroke(P['hatSh'], 5))
    return out


# blow lips in head-local coordinates (pushed out at the right edge of the muzzle)
BLOW_LIPS_LOCAL = (84, 40)


# ---------------------------------------------------------------- body (shared by every frame)
BODY_PTS = [(150, 222), (205, 240), (226, 290), (224, 345), (198, 376), (150, 383), (104, 377),
            (76, 348), (72, 292), (94, 242)]
BODY_D = smooth_d(BODY_PTS)


def feet_back():
    return (ell(194, 381, 26, 11, filled(P['shade'], P['line'])) +
            path('M206,377 l0,7 M214,376 l0,7', stroke(P['line'], 2.6)))


def feet_front():
    out = ell(128, 379, 31, 13, filled(P['fur'], P['line']))
    out += ell(118, 375, 12, 4, f'fill="{P["hi"]}" opacity="0.7"')
    out += path('M144,375 l0,8 M153,374 l0,8', stroke(P['line'], 2.6))
    return out


def body():
    out = cel('bd', BODY_D, P['fur'], P['shade'], -9, -6, hi=P['hi'], hi_xy=(104, 270, 14, 26, 15))
    # apron (clipped to the body): bib + skirt seen 3/4 (front of Koko is towards +x)
    apron = smooth_d([(124, 236), (196, 236), (214, 290), (222, 350), (196, 382), (128, 384), (108, 350), (112, 290)])
    out += f'<g clip-path="url(#bd)">'
    out += cel('ap', apron, P['apron'], P['apronDk'], -6, -4)
    out += path(apron, filled('none', P['apronDk'], 3.6))
    # waist tie
    out += path('M106,300 Q160,312 226,298', stroke(P['apronDk'], 6))
    out += path('M106,300 Q160,312 226,298', stroke(P['apronHi'], 2))
    out += '</g>'
    # little bow behind on the left
    out += path('M84,300 q-16,-12 -18,2 q4,12 18,-2 Z', filled(P['apron'], P['apronDk'], 3))
    out += path('M84,302 q-14,6 -10,18 q8,-2 10,-18 Z', filled(P['apron'], P['apronDk'], 3))
    # heart pocket
    hx, hy = 176, 336
    heart = (f'M{hx},{hy + 14} C{hx - 22},{hy} {hx - 16},{hy - 16} {hx},{hy - 7} '
             f'C{hx + 16},{hy - 16} {hx + 22},{hy} {hx},{hy + 14} Z')
    out += path(heart, filled(P['pocket'], P['apronDk'], 3.2))
    out += path(f'M{hx - 9},{hy - 6} q3,-4 7,-1', stroke(P['white'], 2.5))
    out += path(BODY_D, filled('none', P['line']))
    return out


# ---------------------------------------------------------------- arms
def arm(sh, el, paw, far=False, claws_dir=None):
    fill = P['shade'] if far else P['fur']
    palm = len(paw) > 2
    # a flat palm sits at the side of the wrist (wrist bent back, palm facing right)
    end = (paw[0] - 15, paw[1] + 10) if palm else paw
    d = f'M{f(sh[0])},{f(sh[1])} Q{f(el[0])},{f(el[1])} {f(end[0])},{f(end[1])}'
    w = ARM_W - 2 if palm else ARM_W
    out = path(d, stroke(P['line'], w + 2 * LW))
    out += path(d, stroke(fill, w))
    # paw (round, slightly bigger) with two claw marks
    if palm:     # flat paw pressed forward (steadying): taller than wide, roughly vertical
        out += ell(paw[0], paw[1], 14.5, 23, filled(fill, P['line']), -6)
        out += ell(paw[0] + 4, paw[1] + 2, 6.5, 13, f'fill="{P["nose"]}" opacity="0.4"', -6)
        out += ell(paw[0] - 4, paw[1] - 8, 4, 7, f'fill="{P["hi"]}" opacity="0.6"', -6)
    else:
        out += circ(paw[0], paw[1], 17.5, filled(fill, P['line']))
    a = claws_dir if claws_dir is not None else math.degrees(math.atan2(paw[1] - el[1], paw[0] - el[0]))
    if palm:
        a = -10
    for k in ((-0.45, 0, 0.45) if palm else (-0.35, 0.35)):
        c, s = math.cos(math.radians(a) + k), math.sin(math.radians(a) + k)
        out += path(f'M{f(paw[0] + 8 * c)},{f(paw[1] + 8 * s)} L{f(paw[0] + 14 * c)},{f(paw[1] + 14 * s)}',
                    stroke(P['claw'], 2.6))
    if not far and not palm:
        out += circ(paw[0] - 5, paw[1] - 6, 5, f'fill="{P["hi"]}" opacity="0.6"')
    return out


ARMS_REST = {
    'far': (SH_FAR, (84, 288), (82, 322)),
    'near': (SH_NEAR, (214, 288), (214, 322)),
}


def frame(face, head_tf=(0, 0, 0), arms=None, extra_front=''):
    """head_tf = (dx, dy, angle°) applied to the head around its centre."""
    arms = arms or {}
    far = arms.get('far', ARMS_REST['far'] + ('back',))
    near = arms.get('near', ARMS_REST['near'] + ('front',))
    dx, dy, a = head_tf
    hx, hy = HEAD_C[0] + dx, HEAD_C[1] + dy
    hd = f'<g transform="translate({f(hx)} {f(hy)}) rotate({f(a)})">{head(face)}</g>'
    layers = {'back': '', 'mid': '', 'front': ''}
    layers[far[3]] += arm(*far[:3], far=True)
    layers[near[3]] += arm(*near[:3])
    # soft ground shadow
    out = ell(160, 390, 92, 8, 'fill="#3B3946" opacity="0.12"')
    out += layers['back'] + feet_back() + body() + feet_front()
    out += layers['mid'] + hd + layers['front'] + extra_front
    return svg(300, 400, out)


def head_pt(local, head_tf):
    dx, dy, a = head_tf
    p = rot(local, a)
    return (HEAD_C[0] + dx + p[0], HEAD_C[1] + dy + p[1])


# head transforms per frame
TF = {
    'think': (-2, 2, -8),
    'oops': (2, 0, 9),
    'blow': (24, -14, -14),
    'hold': (-16, 6, 7),
    'cheer': (0, -4, -3),
}


def koko():
    frames = {}
    frames['idle'] = frame({'eyes': 'open'})
    frames['blink'] = frame({'eyes': 'shut'})
    frames['talk'] = frame({'eyes': 'open', 'mouth': 'talk'})
    frames['happy'] = frame({'eyes': 'open', 'mouth': 'big', 'puff': 2})
    frames['cheer'] = frame({'eyes': 'closed', 'mouth': 'big', 'puff': 2}, TF['cheer'], {
        'far': (SH_FAR, (62, 232), (30, 184), 'back'),
        'near': (SH_NEAR, (238, 214), (250, 150), 'front'),
    })
    # think: near paw on the chin
    chin = head_pt((40, 78), TF['think'])
    frames['think'] = frame({'eyes': 'open', 'look': (2, -4), 'mouth': 'smile'}, TF['think'], {
        'near': (SH_NEAR, (236, 268), (chin[0] + 4, chin[1] + 6), 'front'),
    })
    frames['oops'] = frame({'eyes': 'open', 'look': (1, -1), 'mouth': 'hmm', 'brow': 'up'}, TF['oops'], {
        'near': (SH_NEAR, (232, 280), (236, 254), 'front'),
    })
    # hold: both paws forward-right steadying the cake (near palm ≈ (285,150))
    frames['hold'] = frame({'eyes': 'open', 'look': (3, -2), 'mouth': 'talk', 'turn': 6}, TF['hold'], {
        'far': ((210, 246), (232, 168), (272, 128, 'palm'), 'mid'),
        'near': (SH_NEAR, (284, 264), (280, 152, 'palm'), 'front'),
    })
    frames['blow'] = frame({'eyes': 'shut', 'mouth': 'o', 'puff': 7, 'turn': 10}, TF['blow'], {
        'far': ARMS_REST['far'] + ('back',),
        'near': (SH_NEAR, (226, 290), (222, 316), 'front'),
    })
    for k, v in frames.items():
        write(f'characters/koko_{k}.svg', v)
    # title wave: near paw raised beside the head, with two little motion arcs
    arcs = (path('M262,96 q14,10 12,28', stroke('#FFFFFF', 5)) + path('M262,96 q14,10 12,28', stroke(P['line'], 2.2)) +
            path('M276,82 q20,16 16,42', stroke('#FFFFFF', 5)) + path('M276,82 q20,16 16,42', stroke(P['line'], 2.2)))
    wave = frame({'eyes': 'open', 'mouth': 'big', 'puff': 2}, (0, 0, -3), {
        'near': (SH_NEAR, (250, 232), (250, 166), 'front'),
    }, arcs)
    write('characters/koko_full_wave.svg', wave)
    lips = head_pt(BLOW_LIPS_LOCAL, TF['blow'])
    print('blow lips at', tuple(round(v) for v in lips))


# ======================================================================= CHERRY
def cherry():
    red, dk, sh = '#C8243A', '#7E1124', '#A51A30'
    out = ell(40, 86, 20, 3.5, 'fill="#3B3946" opacity="0.15"')
    # stem + leaf
    out += path('M40,42 Q40,22 52,8', stroke('#5B3A22', 8))
    out += path('M40,42 Q40,22 52,8', stroke('#8A6A3A', 4))
    leaf = 'M50,14 Q62,2 75,12 Q65,25 50,14 Z'
    out += path(leaf, filled('#79B957', '#3F7A2C', 3))
    out += path('M53,14 Q63,11 71,12', stroke('#3F7A2C', 2))
    # fruit: slightly heart-topped ball
    body_d = 'M40,42 C28,34 14,40 14,58 C14,76 28,86 40,86 C52,86 66,76 66,58 C66,40 52,34 40,42 Z'
    out += cel('ch', body_d, red, sh, -5, -5)
    out += path(body_d, filled('none', dk, 3.5))
    out += ell(28, 52, 7, 11, 'fill="#FFFFFF" opacity="0.75"', 25)
    out += circ(25, 67, 3, 'fill="#FFFFFF" opacity="0.5"')
    out += path('M54,76 Q60,70 61,62', stroke('#E85A6E', 3))
    write('characters/cherry.svg', svg(80, 90, out))


# ======================================================================= BEE
def bee(up):
    amber, amberSh, line, brown = '#F2B64A', '#D9962C', '#7A4A1E', '#6B4022'
    out = ''
    # wings (behind), pale translucent
    if up:
        wings = [(38, 20, 11, 16, -18), (55, 18, 10, 15, 20)]
    else:
        wings = [(28, 28, 18, 11, -28), (48, 20, 16, 10, -55)]
    for x, y, rx, ry, r in wings:
        out += ell(x, y, rx, ry, f'fill="#EAF6FF" fill-opacity="0.85" stroke="#8DB3CF" stroke-width="3"', r)
        out += ell(x - 3, y - 3, rx * 0.4, ry * 0.3, 'fill="#FFFFFF" opacity="0.8"', r)
    # stinger nub (rounded, friendly)
    out += path('M16,50 L6,52 L16,57 Z', filled(brown, brown, 3))
    # body
    bd = ell_d(46, 52, 32, 25)
    stripes = (f'<clipPath id="bs"><path d="{bd}"/></clipPath><g clip-path="url(#bs)">'
               + path(bd, f'fill="{amberSh}"') + path(bd, f'fill="{amber}"', ) .replace('/>', ' transform="translate(-4 -4)"/>')
               + path('M28,20 q-8,32 2,64', stroke(brown, 10))
               + path('M46,20 q-8,32 2,64', stroke(brown, 10))
               + ell(30, 40, 9, 5, 'fill="#FFE2A0" opacity="0.7"', -25) + '</g>')
    out += stripes
    out += path(bd, filled('none', line, 3.5))
    # face on the right of the body
    out += circ(62, 47, 4.6, f'fill="{P["eye"]}"') + circ(63.6, 45.2, 1.7, 'fill="#FFFFFF"')
    out += circ(74, 46, 4.2, f'fill="{P["eye"]}"') + circ(75.4, 44.4, 1.5, 'fill="#FFFFFF"')
    out += ell(58, 57, 5, 3, f'fill="{P["cheek"]}"') + ell(76, 56, 4, 2.6, f'fill="{P["cheek"]}"')
    out += path('M64,57 Q68,62 72,56', stroke(line, 2.6))
    # antennae
    out += path('M60,30 Q60,16 52,10', stroke(line, 3)) + circ(52, 10, 3.6, f'fill="{brown}"')
    out += path('M68,30 Q72,16 80,12', stroke(line, 3)) + circ(80, 12, 3.6, f'fill="{brown}"')
    # little legs
    out += path('M38,76 l-2,4 M52,76 l1,4', stroke(line, 3))
    write(f'characters/bee{"_up" if up else ""}.svg', svg(96, 80, out))


# ======================================================================= CANDLE
def candle():
    line = '#C9A98A'
    bd = 'M6,14 Q6,10 10,10 L14,10 Q18,10 18,14 L18,68 Q18,70 16,70 L8,70 Q6,70 6,68 Z'
    out = f'<clipPath id="cd"><path d="{bd}"/></clipPath><g clip-path="url(#cd)">'
    out += path(bd, 'fill="#FFF8EC"')
    cols = ['#F7C6D9', '#BFE3F0', '#F7C6D9', '#BFE3F0', '#F7C6D9', '#BFE3F0']
    for i, c in enumerate(cols):
        y = 8 + i * 11
        out += path(f'M0,{y + 8} L24,{y} L24,{y + 5} L0,{y + 13} Z', f'fill="{c}"')
    out += path('M14,10 L18,10 L18,70 L14,70 Z', 'fill="#000000" opacity="0.06"')
    out += path('M8,14 L8,66', stroke('#FFFFFF', 1.6).replace('stroke=', 'opacity="0.8" stroke='))
    out += '</g>'
    out += path(bd, filled('none', line, 2))
    out += path('M12,10 Q12,7 12.6,4', stroke('#4A3A30', 2))
    write('characters/candle.svg', svg(24, 72, out))


# ======================================================================= ICON
ANS = {'red': ('#E84A4A', '#A8282E', '#F7A0A0'), 'yellow': ('#FFD23F', '#C99A12', '#FFEB9C'),
       'blue': ('#3C8DE8', '#1F5BA8', '#A6CCF5')}


def cake_layer(cx, top, w, h, col, seed):
    base, dk, lt = ANS[col]
    x0, x1 = cx - w / 2, cx + w / 2
    r = 0.18 * h
    out = path(f'M{f(x0)},{f(top + r)} Q{f(x0)},{f(top)} {f(x0 + r)},{f(top)} L{f(x1 - r)},{f(top)} '
               f'Q{f(x1)},{f(top)} {f(x1)},{f(top + r)} L{f(x1)},{f(top + h - r)} Q{f(x1)},{f(top + h)} {f(x1 - r)},{f(top + h)} '
               f'L{f(x0 + r)},{f(top + h)} Q{f(x0)},{f(top + h)} {f(x0)},{f(top + h - r)} Z', filled(lt, dk, 5))
    # cream filling band
    out += path(f'M{f(x0 + 3)},{f(top + h * 0.66)} L{f(x1 - 3)},{f(top + h * 0.66)}', stroke('#FFF8EC', 7))
    # frosting with drips
    n = 5
    d = f'M{f(x0 - 3)},{f(top + 8)} Q{f(x0 - 3)},{f(top - 6)} {f(x0 + 10)},{f(top - 6)} L{f(x1 - 10)},{f(top - 6)} Q{f(x1 + 3)},{f(top - 6)} {f(x1 + 3)},{f(top + 8)}'
    xs = [x1 + 3 - (w + 6) * (i + 0.5) / n for i in range(n)]
    lens = [(seed * 7 + i * 13) % 4 for i in range(n)]
    cur = x1 + 3
    for i, xm in enumerate(xs):
        dl = 10 + lens[i] * 7
        hw = (w + 6) / n / 2 * 0.62
        d += f' L{f(xm + hw + 3)},{f(top + 10)} Q{f(xm + hw)},{f(top + 10 + dl)} {f(xm)},{f(top + 10 + dl)} Q{f(xm - hw)},{f(top + 10 + dl)} {f(xm - hw - 3)},{f(top + 10)}'
    d += f' L{f(x0 - 3)},{f(top + 8)} Z'
    out += path(d, filled(base, dk, 5))
    out += path(f'M{f(x0 + 12)},{f(top - 1)} L{f(x0 + w * 0.4)},{f(top - 1)}', stroke('#FFFFFF', 5).replace('stroke=', 'opacity="0.55" stroke='))
    return out


def icon():
    defs = ('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#A9DDF5"/><stop offset="1" stop-color="#FFF4DA"/></linearGradient>')
    out = '<rect width="512" height="512" fill="url(#sky)"/>'
    # soft sun + clouds
    out += circ(430, 86, 44, 'fill="#FFF0B8"') + circ(430, 86, 32, 'fill="#FFE58A"')
    for x, y, s in ((96, 70, 1), (300, 120, 0.8)):
        out += (ell(x, y, 46 * s, 20 * s, 'fill="#FFFFFF"') + circ(x - 16 * s, y - 12 * s, 20 * s, 'fill="#FFFFFF"')
                + circ(x + 12 * s, y - 16 * s, 24 * s, 'fill="#FFFFFF"'))
    # pastel candy hills
    out += path('M0,330 Q90,250 190,300 Q290,240 380,290 Q450,250 512,280 L512,512 L0,512 Z', 'fill="#CDEAD0"')
    out += path('M0,360 Q120,300 250,350 Q380,300 512,340 L512,512 L0,512 Z', 'fill="#F6D9EA"')
    # lollipop trees + gumdrops
    for x, y, c1, c2 in ((40, 300, '#FFD6E6', '#F2A7C3'), (480, 296, '#D8E8FF', '#A9C6EE'), (250, 300, '#FFF0C2', '#F2D48A')):
        out += path(f'M{x},{y} L{x},{y + 70}', stroke('#E9DCC8', 8))
        out += circ(x, y, 24, filled(c1, c2, 4)) + path(f'M{x - 12},{y} a12,12 0 1,1 12,12', stroke(c2, 4))
    for x, c in ((120, '#BFE6D9'), (440, '#E9D5F5')):
        out += path(f'M{x - 26},{372} Q{x - 24},{340} {x},{338} Q{x + 24},{340} {x + 26},{372} Z', filled(c, '#C5B6CF', 3))
    # cream plaza
    out += path('M0,400 Q256,382 512,400 L512,512 L0,512 Z', 'fill="#F3E2C0"')
    out += path('M0,440 Q256,426 512,440 L512,512 L0,512 Z', 'fill="#E6CC9E"')
    for x, y, c, a in ((60, 470, '#F7A8C4', 20), (210, 490, '#A9D6F2', -30), (470, 476, '#F7E08A', 50), (300, 500, '#B9E3C8', 10)):
        out += f'<path d="M{x - 7},{y} L{x + 7},{y}" {stroke(c, 6)} transform="rotate({a} {x} {y})"/>'
    # cake stand
    out += path('M346,472 L410,472 L398,444 L358,444 Z', filled('#FFF8EC', '#9BCBBE', 5))
    out += ell(378, 440, 92, 12, filled('#FFF8EC', '#9BCBBE', 5))
    # 3-layer cake (red bottom, yellow, blue top) + cherry
    cx, w, h = 378, 150, 64
    out += cake_layer(cx, 432 - h, w, h, 'red', 1)
    out += cake_layer(cx, 432 - 2 * h + 4, w * 0.92, h, 'yellow', 2)
    out += cake_layer(cx, 432 - 3 * h + 8, w * 0.84, h, 'blue', 3)
    top = 432 - 3 * h + 8 - 6
    # cherry
    out += f'<g transform="translate({cx - 26} {top - 64}) scale(0.66)">'
    out += path('M40,42 Q40,22 52,8', stroke('#5B3A22', 8)) + path('M50,12 Q64,-2 76,10 Q66,24 50,12 Z', filled('#79B957', '#3F7A2C', 3))
    out += path('M40,42 C28,34 14,40 14,58 C14,76 28,86 40,86 C52,86 66,76 66,58 C66,40 52,34 40,42 Z', filled('#C8243A', '#7E1124', 4))
    out += ell(28, 52, 7, 11, 'fill="#FFFFFF" opacity="0.75"', 25) + '</g>'
    # Koko's head with hat (left), plus his shoulders peeking from below
    out += f'<g transform="translate(-24 47) scale(1.32)">' + body() + '</g>'
    out += f'<g transform="translate(174 262) scale(1.32)">{head({"eyes": "open", "mouth": "big", "puff": 2}, "ih")}</g>'
    write('icon.svg', svg(512, 512, out, defs))


if __name__ == '__main__':
    koko()
    cherry()
    bee(False)
    bee(True)
    candle()
    icon()
    print('written to', OUT)
