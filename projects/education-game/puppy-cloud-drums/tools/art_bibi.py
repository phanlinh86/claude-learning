#!/usr/bin/env python3
"""Character art generator for Bibi's Cloud Drums (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/bibi_{idle,blink,talk,happy,cheer,think,oops,wave,point,dance,beat}.svg + bibi_full_wave.svg
        0 0 300 300, FEET ANCHOR (150,292). Bibi (a small round apricot puppy with floppy darker ears, a cream muzzle and
        belly, a fur tuft on top, a short tail and a white sailor collar with slate trim) sits facing RIGHT in 3/4 view,
        eyes on the viewer, and holds two wooden drumsticks with cream ball tips.
        Head, body, collar and feet are IDENTICAL in every frame; only eyes, mouth, brows, the ear flop, the front paws +
        sticks and the tail change. beat = both sticks down mid-strike; full_wave = title pose with a small wood drum.
        docs/art/bibi_hand.json gives per frame the near stick tip, the far stick tip, both paws, the head top and the eye.
  characters/lamb.svg, lamb_ball.svg   0 0 160 120, bottom anchor (80,116), facing right (a fluffy cloud lamb)
  characters/bird.svg, bird_sing.svg   0 0 120 100, feet anchor (60,96), facing LEFT
  icon.svg                             0 0 512 512, full bleed, opaque, no text: Bibi drumming on a red cloud drum

Usage: python3 tools/art_bibi.py [outDir]
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
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'bibi_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Bibi palette (DESIGN.md section 3) — never an answer colour
    'fur': '#E7B07A', 'sh': '#C98E57', 'line': '#8A5A34', 'farFur': '#D9A068', 'farSh': '#BC834E',
    'ear': '#B9784A', 'earSh': '#9C6038', 'earIn': '#C98E62',
    'cream': '#FBEBD3', 'creamSh': '#E8D2B2', 'creamLine': '#B98A5E',
    'cheek': '#F2A99A', 'pupil': '#2F2A3A', 'white': '#FFFFFF', 'mouth': '#7A3A2C', 'tongue': '#EE8F84',
    'nose': '#4A3226',
    'collar': '#FFFFFF', 'collarSh': '#E6E8F0', 'slate': '#5B6478', 'slateD': '#434A5C',
    'wood': '#D9B48A', 'woodSh': '#BF9466', 'woodLine': '#8E6640', 'tip': '#FFF6E6', 'tipLine': '#B89B72',
    'brass': '#D8B26A', 'brassD': '#9C7838', 'brassL': '#F3DFAE',
}
DRUM_WOOD = ('#C99466', '#8E5F3A', '#E9C29A')
SKIN = ('#FFF6E6', '#EADBC0', '#B89B72')
HOOP = ('#E4E6EE', '#9AA0B4', '#FFFFFF')


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


class Doc:
    """Collects <defs> with unique ids (the prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='k'):
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


def ptsd(pts, close=True):
    """Smooth path through points (Catmull-Rom → cubic Bézier)."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if close or i > 0 else pts[0]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if close or i + 2 < n else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if close else '')


def tube(d, wout, col_line, col_fill, lw=LW):
    """A round-capped tube along path d: outline stroke underneath, fill stroke on top."""
    return path(d, st(col_line, wout)) + path(d, st(col_fill, wout - 2 * lw))


def star4(x, y, s, fill='#FFF6C8', line='#E2C86A', w=1.6):
    return path(f'M{f(x)},{f(y - s)} L{f(x + s * 0.3)},{f(y - s * 0.3)} L{f(x + s)},{f(y)} L{f(x + s * 0.3)},{f(y + s * 0.3)} '
                f'L{f(x)},{f(y + s)} L{f(x - s * 0.3)},{f(y + s * 0.3)} L{f(x - s)},{f(y)} L{f(x - s * 0.3)},{f(y - s * 0.3)} Z',
                f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')


def scallop(cx, cy, rx, ry, n, bulge=0.62, a0=-90):
    """A puffy cloud / wool outline: n points on an ellipse joined by outward arcs."""
    pts = [(cx + rx * math.cos(math.radians(a0 + 360 * i / n)), cy + ry * math.sin(math.radians(a0 + 360 * i / n)))
           for i in range(n)]
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        r = math.hypot(x1 - x0, y1 - y0) * bulge
        d += f' A{f(r)},{f(r)} 0 0 1 {f(x1)},{f(y1)}'
    return d + ' Z'


def poly(pts):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'


# ======================================================================= BIBI
# head: a wide soft puppy head (cheeks fuller low), centre ≈ (150,128), y 62..198
HEAD = [(150, 62), (186, 66), (214, 82), (229, 108), (232, 138), (224, 166), (202, 189), (170, 199), (134, 198),
        (102, 188), (79, 166), (70, 136), (76, 106), (96, 80), (120, 66)]
TUFT = 'M134,68 C130,56 140,48 150,54 C152,44 166,42 170,52 C178,52 182,60 178,68 C164,74 148,74 134,68 Z'
TUFT_TOP = 44
MUZZLE = (181, 163, 35, 25)        # cream snout, x 146-216, y 138-188
NOSE = (193, 149)
MOUTH = (190, 168)
EYE_N = (136, 122, 17)             # near eye (viewer's left, bigger)
EYE_F = (199, 117, 13.5)           # far eye (towards the drums)
BODY = (148, 242, 48, 45)          # x 100-196, y 197-287
BELLY = (166, 254, 25, 24)
SH_F = (170, 216)                  # far shoulder (behind the body)
SH_N = (178, 220)                  # near shoulder (in front)
ARM_W = 23                         # arm tube outer width
PAW_R = 12.5
STICK_L = 68                       # paw centre → tip centre
STICK_BACK = 13                    # butt end behind the paw
STICK_W = 10
TIP_R = 7

# ear: local shape hanging DOWN from its root (0,0); rotated per pose (+ = clockwise on screen)
EAR = [(0, -2), (13, 2), (19, 20), (16, 46), (7, 72), (-8, 83), (-23, 77), (-29, 55), (-25, 27), (-14, 6)]
EAR_N = (96, 86)
EAR_F = (206, 78)

# arms: [shoulder, elbow, paw] + stick angle (deg, 0 = right, -90 = up); kind 'stick' | 'open' | 'two' (both sticks)
#               far arm                                         near arm
ARMS = {
    'idle':  ([SH_F, (204, 220), (226, 226)], -58,  [SH_N, (188, 242), (200, 256)], -26, 'stick'),
    'talk':  ([SH_F, (200, 226), (218, 236)], -52,  [SH_N, (204, 232), (222, 218)], -68, 'stick'),
    'happy': ([SH_F, (204, 222), (224, 218)], -66,  [SH_N, (198, 236), (214, 238)], -44, 'stick'),
    'cheer': ([(122, 214), (96, 186), (82, 152)], -100, [SH_N, (212, 190), (226, 154)], -72, 'stick'),
    'think': ([SH_F, (200, 226), (218, 236)], -52,  [SH_N, (204, 240), (222, 238)], -120, 'stick'),
    'oops':  ([SH_F, (200, 226), (218, 236)], -52,  [SH_N, (210, 214), (230, 198)], -58, 'stick'),
    'wave':  ([SH_F, (200, 228), (218, 238)], -40,  [SH_N, (218, 194), (234, 150)], 0, 'open'),
    'point': ([SH_F, (200, 226), (218, 236)], -52,  [SH_N, (210, 210), (228, 196)], -38, 'stick'),
    'dance': ([SH_F, (204, 230), (224, 240)], -12,  [SH_N, (214, 192), (224, 156)], -84, 'stick'),
    'beat':  ([SH_F, (206, 220), (228, 222)], 30,   [SH_N, (194, 240), (210, 246)], 36, 'stick'),
    'full_wave': ([SH_F, (200, 228), (214, 242)], -8, [SH_N, (214, 192), (228, 152)], -64, 'stick'),
    'icon':  ([SH_F, (208, 208), (234, 204)], 10,   [SH_N, (204, 226), (226, 228)], 16, 'stick'),
}
ARMS['blink'] = ARMS['idle']

POSES = {
    #             eyes      mouth     brows    look      ears (near, far)  tail
    'idle':      ('open',   'smile',  None,    (1, 2),   (0, 0),           'rest'),
    'blink':     ('closed', 'smile',  None,    (1, 2),   (0, 0),           'rest'),
    'talk':      ('open',   'talk',   None,    (1, 2),   (4, -4),          'rest'),
    'happy':     ('wide',   'tongue', None,    (0, 1),   (14, -12),        'up'),
    'cheer':     ('happy',  'big',    None,    (0, 0),   (26, -24),        'up'),
    'think':     ('look',   'hmm',    (0, 6),  (4, -5),  (6, -2),          'rest'),
    'oops':      ('wide',   'o',      (7, 0),  (-1, 1),  (-4, -34),        'rest'),
    'wave':      ('open',   'big',    None,    (1, 2),   (10, -8),         'up'),
    'point':     ('look',   'talk',   (4, 4),  (5, -3),  (4, -6),          'rest'),
    'dance':     ('happy',  'tongue', None,    (0, 0),   (52, -50),        'wag'),
    'beat':      ('wide',   'smile',  (3, 3),  (4, 3),   (-8, 8),          'up'),
    'full_wave': ('wide',   'big',    None,    (1, 2),   (12, -10),        'up'),
    'icon':      ('happy',  'big',    None,    (0, 0),   (-6, 10),         'up'),
}


def eye(cx, cy, r, mode='open', look=(0, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.06 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.92, rr * 1.04, f'fill="{P["pupil"]}"')
        px, py = cx + look[0] * 0.5, cy + look[1] * 0.5
        # big dark eyes with two catch-lights (no white sclera: rounder, younger puppy look)
        o += circ(px - rr * 0.3, py - rr * 0.36, rr * 0.36, 'fill="#FFFFFF"')
        o += circ(px + rr * 0.34, py + rr * 0.34, rr * 0.15, 'fill="#FFFFFF"')
        o += ell(cx, cy + rr * 0.55, rr * 0.5, rr * 0.2, 'fill="#6C6488" opacity=".55"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.85)},{f(cy)} Q{f(cx)},{f(cy + r * 0.7)} {f(cx + r * 0.85)},{f(cy)}', st(P['pupil'], 4.8))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.85)},{f(cy + r * 0.34)} Q{f(cx)},{f(cy - r * 0.95)} {f(cx + r * 0.85)},{f(cy + r * 0.34)}',
                  st(P['pupil'], 5.4))
    return o


def mouth(mode):
    mx, my = MOUTH
    line = P['line']
    w = f'M{mx - 13},{my - 3} Q{mx - 7},{my + 5} {mx},{my - 2} Q{mx + 7},{my + 5} {mx + 13},{my - 4}'
    if mode == 'smile':     # the puppy "w"
        return path(w, st(line, 3.6))
    if mode == 'talk':
        o = path(f'M{mx - 11},{my - 3} Q{mx},{my - 5} {mx + 11},{my - 4} Q{mx + 10},{my + 12} {mx},{my + 13} '
                 f'Q{mx - 10},{my + 12} {mx - 11},{my - 3} Z', fl(P['mouth'], line, 3.2))
        o += ell(mx, my + 8, 6.4, 3.6, f'fill="{P["tongue"]}"')
        return o
    if mode in ('big', 'tongue'):
        ww, h = 16, 15
        o = path(f'M{f(mx - ww)},{f(my - 4)} Q{mx},{f(my - 1)} {f(mx + ww)},{f(my - 6)} '
                 f'Q{f(mx + ww * 0.8)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - ww * 0.8)},{f(my + h)} {f(mx - ww)},{f(my - 4)} Z',
                 fl(P['mouth'], line, 3.2))
        if mode == 'tongue':   # tongue hanging out a little below the mouth
            o += path(f'M{mx - 8},{my + 6} Q{mx - 9},{my + 24} {mx},{my + 24} Q{mx + 9},{my + 24} {mx + 8},{my + 6} Z',
                      fl(P['tongue'], '#C9645A', 2.8))
            o += path(f'M{mx},{my + 9} L{mx},{my + 17}', st('#C9645A', 2.2))
        else:
            o += ell(mx, my + h - 5, 8, 4, f'fill="{P["tongue"]}"')
        return o
    if mode == 'o':
        return ell(mx + 1, my + 3, 5.8, 7, fl(P['mouth'], line, 3))
    if mode == 'hmm':
        return path(f'M{mx - 11},{my + 2} Q{mx - 5},{my - 3} {mx},{my + 1} Q{mx + 5},{my + 5} {mx + 11},{my}', st(line, 3.6))
    return ''


def ear(doc, root, ang, far=False):
    sx = -0.86 if far else 1      # the far ear is mirrored (hangs to the right) and a bit smaller
    pts = [rot(root[0] + x * sx, root[1] + y * abs(sx), ang, *root) for (x, y) in EAR]
    d = ptsd(pts)
    base, sh = (P['earSh'], '#8C5632') if far else (P['ear'], P['earSh'])
    return doc.shaded(f'<path d="{d}" {{a}}/>', base, sh, P['line'], dx=-5 * sx, dy=-4)


def head(doc, pose):
    eyes, mo, brows, look, (ean, eaf), _ = POSES[pose]
    o = ''
    tuft = doc.shaded(f'<path d="{TUFT}" {{a}}/>', P['fur'], P['sh'], P['line'], dx=-4, dy=-3, w=4)
    o += tuft
    hd = ptsd(HEAD)
    hi = ell(108, 98, 15, 7.5, 'fill="#FFFFFF" opacity=".32" transform="rotate(-42 108 98)"')
    o += doc.shaded(f'<path d="{hd}" {{a}}/>', P['fur'], P['sh'], P['line'], dx=-12, dy=-11, hi=hi)
    # a soft cream blaze between the eyes running into the muzzle
    mx, my, mrx, mry = MUZZLE
    o += doc.shaded(f'<ellipse cx="{mx}" cy="{my}" rx="{mrx}" ry="{mry}" {{a}}/>', P['cream'], P['creamSh'], P['creamLine'],
                    dx=-6, dy=-6, w=3)
    # cheeks
    o += ell(118, 152, 13, 8, f'fill="{P["cheek"]}" opacity=".8"')
    o += ell(222, 146, 6.5, 5.5, f'fill="{P["cheek"]}" opacity=".8"')
    # nose: a rounded button + shine, philtrum to the mouth
    nx, ny = NOSE
    o += path(f'M{nx - 11},{ny - 4} Q{nx},{ny - 10} {nx + 11},{ny - 4} Q{nx + 10},{ny + 7} {nx},{ny + 8} Q{nx - 10},{ny + 7} {nx - 11},{ny - 4} Z',
              f'fill="{P["nose"]}"')
    o += ell(nx - 3, ny - 3, 3.8, 2, 'fill="#FFFFFF" opacity=".6"')
    o += path(f'M{nx},{ny + 8} L{MOUTH[0]},{MOUTH[1] - 2}', st(P['line'], 3))
    o += mouth(mo)
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 8 - lift
            o += path(f'M{f(cx - 7)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 7)},{f(y + 3)}', st(P['line'], 3.6))
    # far ear behind the head, near ear in front (both flop per pose)
    far_ear = ear(doc, EAR_F, eaf, far=True)
    near_ear = ear(doc, EAR_N, ean)
    return far_ear, o + near_ear


def stick(px, py, ang):
    """A wooden drumstick gripped at (px, py) pointing at ang. Returns svg and the tip centre."""
    a = math.radians(ang)
    tx, ty = math.cos(a), math.sin(a)
    bx, by = px - tx * STICK_BACK, py - ty * STICK_BACK
    ex, ey = px + tx * (STICK_L - TIP_R * 0.6), py + ty * (STICK_L - TIP_R * 0.6)
    d = f'M{f(bx)},{f(by)} L{f(ex)},{f(ey)}'
    o = path(d, st(P['woodLine'], STICK_W + 3.6)) + path(d, st(P['wood'], STICK_W - 0.6))
    # a light grain line along the upper edge
    nx, ny = ty, -tx
    if ny > 0:
        nx, ny = -nx, -ny
    o += path(f'M{f(bx + tx * 4 + nx * 1.8)},{f(by + ty * 4 + ny * 1.8)} L{f(ex - tx * 6 + nx * 1.8)},{f(ey - ty * 6 + ny * 1.8)}',
              st('#F1D9B6', 2.2))
    cx, cy = px + tx * STICK_L, py + ty * STICK_L
    o += circ(cx, cy, TIP_R, fl(P['tip'], P['tipLine'], 3)) + circ(cx - 2, cy - 2.2, 2.2, 'fill="#FFFFFF"')
    return o, (cx, cy)


def paw(hx, hy, tx, ty, far=False, line_dir=None):
    fur = P['farFur'] if far else P['fur']
    o = circ(hx, hy, PAW_R, fl(fur, P['line'], 3.8))
    # two toe lines on the front of the gripping paw
    lx, ly = line_dir or (tx, ty)
    for s in (-1, 1):
        ox, oy = hx + lx * 5 + (-ly) * s * 3.2, hy + ly * 5 + lx * s * 3.2
        o += path(f'M{f(ox)},{f(oy)} L{f(ox + lx * 5)},{f(oy + ly * 5)}', st(P['line'], 2.4) + ' opacity=".8"')
    return o


def arm(pts, ang, kind, far=False):
    """Front leg tube through pts + paw (+ stick). Returns svg (stick behind paw) and the tip used for the hand table."""
    d = ptsd(pts, close=False)
    fur = P['farFur'] if far else P['fur']
    o = tube(d, ARM_W, P['line'], fur)
    hx, hy = pts[-1]
    ex, ey = pts[-2]
    ln = math.hypot(hx - ex, hy - ey) or 1
    tx, ty = (hx - ex) / ln, (hy - ey) / ln
    if kind == 'open':
        # waving paw: a round pad with three toe beans, slightly bigger
        o += circ(hx, hy, PAW_R + 2.5, fl(fur, P['line'], 3.8))
        o += ell(hx, hy + 2.5, 6.4, 5, f'fill="{P["earIn"]}"')
        for a in (-40, 0, 40):
            c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
            dx, dy = tx * c - ty * s, tx * s + ty * c
            o += circ(hx + dx * 8.6, hy + dy * 8.6 + 1, 2.6, f'fill="{P["earIn"]}"')
        return o, (hx + tx * (PAW_R + 3), hy + ty * (PAW_R + 3))
    sk, tip = stick(hx, hy, ang)
    if kind == 'two':
        sk2, _ = stick(hx, hy, ang - 18)
        sk = sk2 + sk
    o += sk
    o += paw(hx, hy, tx, ty, far)
    return o, tip


TAILS = {
    'rest': [(104, 258), (86, 254), (74, 240), (74, 224)],
    'up':   [(104, 256), (88, 246), (82, 228), (88, 212)],
    'wag':  [(104, 256), (84, 238), (86, 218), (100, 206)],
}


def tail(kind):
    pts = TAILS[kind]
    d = ptsd(pts, close=False)
    o = tube(d, 19, P['line'], P['fur'])
    # cream tip
    x, y = pts[-1]
    o += circ(x, y, 5.4, f'fill="{P["cream"]}"')
    if kind == 'wag':
        o += path('M70,206 Q64,218 68,232 M80,190 Q70,198 70,210', st(P['line'], 3.2) + ' opacity=".7"')
    return o


def legs(doc):
    """(far foot behind the body, near haunch + near foot in front). Identical in every frame."""
    far = ell(196, 284, 16, 8, fl(P['farFur'], P['line'], 3.8))
    hi = ell(116, 250, 8, 4.5, 'fill="#FFFFFF" opacity=".22" transform="rotate(-36 116 250)"')
    near = doc.shaded('<ellipse cx="126" cy="262" rx="27" ry="25" {a}/>', P['fur'], P['sh'], P['line'], dx=-6, dy=-7, hi=hi)
    near += ell(150, 284, 23, 8.4, fl(P['fur'], P['line'], 3.8))
    near += path('M162,280 L164,287 M154,279 L155,287', st(P['line'], 2.4) + ' opacity=".8"')
    return far, near


def collar(doc):
    """White sailor collar with a slate trim line + a small slate neckerchief knot in front."""
    shape = 'M98,196 C122,216 176,218 200,194 C206,204 206,216 200,222 C178,242 120,242 96,220 C91,210 92,200 98,196 Z'
    cid = doc.clip(f'<path d="{shape}"/>')
    o = path(shape, f'fill="{P["collar"]}"')
    o += f'<g clip-path="url(#{cid})">'
    o += path('M90,222 C124,246 176,246 208,218 L208,256 L90,256 Z', f'fill="{P["collarSh"]}"')
    o += '</g>'
    o += path('M102,213 C128,231 172,233 196,213', st(P['slate'], 3.6))
    o += path(shape, f'fill="none" stroke="{P["slate"]}" stroke-width="{f(LW * 0.75)}" stroke-linejoin="round"')
    # neckerchief tails + knot (slate)
    o += path('M170,228 L160,248 L172,244 Z M176,228 L184,248 L188,236 Z', fl(P['slate'], P['slateD'], 2.6))
    o += ell(173, 227, 7.5, 6, fl(P['slate'], P['slateD'], 2.6))
    o += ell(171, 225, 2.6, 1.6, 'fill="#FFFFFF" opacity=".45"')
    return o


def body(doc):
    bx, by, brx, bry = BODY
    tpl = f'<ellipse cx="{bx}" cy="{by}" rx="{brx}" ry="{bry}" {{a}}/>'
    o = doc.shaded(tpl, P['fur'], P['sh'], P['line'], dx=-11, dy=-9)
    px, py, prx, pry = BELLY
    o += doc.shaded(f'<ellipse cx="{px}" cy="{py}" rx="{prx}" ry="{pry}" {{a}}/>', P['cream'], P['creamSh'], P['creamSh'],
                    dx=-5, dy=-5, w=0.1)
    return o


def wood_drum(doc, cx, bottom, w, h, body_col=DRUM_WOOD, cord=True):
    """A small standing drum: barrel body, silver hoops top + bottom, cream skin ellipse on top, tension cords."""
    base, dark, light = body_col
    ry = w * 0.2
    top = bottom - h
    o = ''
    shell = (f'M{f(cx - w / 2)},{f(top)} L{f(cx - w / 2 + 1)},{f(bottom - ry * 0.6)} '
             f'A{f(w / 2)},{f(ry)} 0 0 0 {f(cx + w / 2 - 1)},{f(bottom - ry * 0.6)} L{f(cx + w / 2)},{f(top)} Z')
    hi = path(f'M{f(cx - w * 0.36)},{f(top + h * 0.2)} L{f(cx - w * 0.36)},{f(bottom - h * 0.24)}', st(light, max(3, w * 0.05)) + ' opacity=".9"')
    o += doc.shaded(f'<path d="{shell}" {{a}}/>', base, dark, dark, dx=-w * 0.14, dy=0, w=max(3, w * 0.04), hi=hi)
    if cord:   # zig-zag cream cords between the hoops
        n = 6
        ys, ye = top + ry * 0.9, bottom - ry * 0.9
        d = ''
        for i in range(n + 1):
            a = math.pi * (0.08 + 0.84 * i / n)
            x = cx - math.cos(a) * w * 0.5
            yy = (ye if i % 2 else ys) + math.sin(a) * ry * 0.5
            d += ('M' if i == 0 else 'L') + f'{f(x)},{f(yy)} '
        o += path(d, st('#F6EBD3', max(2.2, w * 0.03)))
    # bottom hoop
    bh = max(5, h * 0.12)
    o += path(f'M{f(cx - w / 2 - 1)},{f(bottom - bh - ry * 0.6)} A{f(w / 2 + 1)},{f(ry)} 0 0 0 {f(cx + w / 2 + 1)},{f(bottom - bh - ry * 0.6)} '
              f'L{f(cx + w / 2 + 1)},{f(bottom - ry * 0.6)} A{f(w / 2 + 1)},{f(ry)} 0 0 1 {f(cx - w / 2 - 1)},{f(bottom - ry * 0.6)} Z',
              fl(HOOP[0], HOOP[1], max(2.4, w * 0.03)))
    # skin + top hoop
    o += ell(cx, top, w / 2 + 2, ry + 2, fl(HOOP[0], HOOP[1], max(2.6, w * 0.035)))
    o += ell(cx, top - 1, w / 2 - w * 0.04, ry - w * 0.035, fl(SKIN[0], SKIN[2], max(1.6, w * 0.02)))
    o += ell(cx - w * 0.14, top - ry * 0.25, w * 0.14, ry * 0.3, f'fill="#FFFFFF" opacity=".75"')
    return o


def bibi(doc, pose):
    eyes, mo, brows, look, ears_, tail_kind = POSES[pose]
    aF, angF, aN, angN, near_kind = ARMS[pose]
    o = tail(tail_kind)
    far_ear, head_svg = head(doc, pose)
    far_kind = 'two' if near_kind == 'open' else 'stick'
    far_arm, far_tip = arm(aF, angF, far_kind, far=True)
    far_leg, near_leg = legs(doc)
    o += far_ear + far_leg + far_arm
    o += body(doc) + near_leg
    o += collar(doc)
    if pose == 'full_wave':   # the little drum beside him, the far stick resting on its skin
        o += wood_drum(doc, 252, 284, 64, 46)
        o += arm(aF, angF, 'stick', far=True)[0]
    o += head_svg
    near_arm, near_tip = arm(aN, angN, near_kind)
    # pose extras (drawn in the line colour, soft)
    soft = st(P['line'], 3.6) + ' opacity=".75"'
    ex = ''
    if pose in ('wave', 'full_wave'):
        hx, hy = near_tip
        ex += path(f'M{f(hx + 20)},{f(hy - 10)} Q{f(hx + 30)},{f(hy + 2)} {f(hx + 28)},{f(hy + 18)} '
                   f'M{f(hx + 30)},{f(hy - 26)} Q{f(hx + 44)},{f(hy - 8)} {f(hx + 40)},{f(hy + 14)}', soft)
    if pose == 'cheer':
        for (x, y, r) in ((40, 116, 5), (270, 100, 5), (30, 88, 3.4), (282, 72, 3.4)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'dance':
        ex += path('M264,150 Q278,162 276,178', soft)
        ex += circ(268, 132, 3.6, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'oops':
        ex += path('M246,58 Q246,46 256,46 Q266,46 264,56 Q262,64 254,66 L254,72', st(P['line'], 4) + ' opacity=".8"')
        ex += circ(254, 82, 2.8, f'fill="{P["line"]}" opacity=".8"')
    if pose == 'think':
        for (x, y, r) in ((232, 84, 3.4), (246, 68, 5), (262, 50, 7)):
            ex += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".75"')
    if pose == 'beat':   # little "whack" ticks above the two tips
        for (x, y) in (far_tip, near_tip):
            ex += path(f'M{f(x - 4)},{f(y - 14)} L{f(x - 7)},{f(y - 24)} M{f(x + 6)},{f(y - 12)} L{f(x + 12)},{f(y - 20)}', soft)
    if ex:   # a soft cream halo under the motion marks so they also read on the night sky
        halo = (ex.replace(f'stroke="{P["line"]}"', 'stroke="#FFF4E0"').replace(f'fill="{P["line"]}"', 'fill="#FFF4E0"')
                .replace('stroke-width="2.6"', 'stroke-width="6"').replace('stroke-width="3.6"', 'stroke-width="7"')
                .replace('stroke-width="4"', 'stroke-width="7.4"'))
        o += f'<g opacity=".55">{halo}</g>' + ex
    o += near_arm
    paws = {'nearPaw': list(aN[-1]), 'farPaw': list(aF[-1])}
    return o, near_tip, far_tip, paws


def write_bibi():
    out = {}
    for pose in POSES:
        if pose == 'icon':
            continue
        d = Doc('k')
        b, tip, ftip, paws = bibi(d, pose)
        write(f'characters/bibi_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
        out[pose] = {'hand': [round(tip[0]), round(tip[1])], 'farHand': [round(ftip[0]), round(ftip[1])],
                     'nearPaw': paws['nearPaw'], 'farPaw': paws['farPaw'],
                     'headTop': [154, TUFT_TOP], 'eye': [EYE_N[0], EYE_N[1]]}
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        json.dump({'_about': ('Bibi per frame, in the 0 0 300 300 viewBox (feet anchor 150,292). hand = centre of the NEAR '
                              'drumstick ball tip (wave: the top of the waving paw; point: the stick tip to aim the hint / '
                              'sparkle from); farHand = centre of the FAR drumstick tip; nearPaw / farPaw = paw centres; '
                              'headTop = [x, y] of the fur-tuft top (speech-bubble tail / stars over the head; the round '
                              'head itself starts at y 62); eye = near eye centre; bbox = measured opaque box [x0, y0, x1, y1] '
                              '(added by tools/bibi_sheet.js).'),
                   **out}, fh, indent=1)
        fh.write('\n')
    return out


# ======================================================================= LAMB (cloud lamb, faces RIGHT)
LB = {'wool': '#F4F1FA', 'woolSh': '#D9D2EC', 'woolLine': '#A99FC8', 'face': '#8C8AA0', 'faceSh': '#77758C',
      'faceLine': '#5E5C74', 'hoof': '#6E6C84', 'nose': '#F2B8C0', 'cheek': '#F2A9B4'}


def lamb(ball=False):
    d = Doc('h')
    o = ''
    if not ball:
        o += ell(80, 113.5, 46, 3, 'fill="#5E5C74" opacity=".14"')
        # legs (far pair darker, behind)
        for x, far in ((60, True), (100, True), (48, False), (90, False)):
            col = LB['faceSh'] if far else LB['face']
            o += path(f'M{x},92 L{x},108', st(LB['faceLine'], 12.5)) + path(f'M{x},92 L{x},108', st(col, 6.5))
            o += rect(x - 6, 106, 12, 7, 3.5, fl(LB['hoof'], LB['faceLine'], 2.4))
        # tail puff
        o += d.shaded(scallop(30, 66, 9, 9, 6, 0.7).join(['<path d="', '" {a}/>']), LB['wool'], LB['woolSh'], LB['woolLine'],
                      dx=-2, dy=-2, w=3)
        # woolly body (puffy scallops)
        body = scallop(72, 72, 40, 26, 13, 0.64)
        o += d.shaded(f'<path d="{body}" {{a}}/>', LB['wool'], LB['woolSh'], LB['woolLine'], dx=-5, dy=-6, w=3.4,
                      hi=ell(52, 54, 13, 6, 'fill="#FFFFFF" opacity=".8" transform="rotate(-20 52 54)"'))
        for (x, y) in ((60, 74), (80, 64), (90, 82), (70, 88)):
            o += path(f'M{x - 5},{y} Q{x},{y - 6} {x + 5},{y}', st(LB['woolSh'], 2.4))
        # head: grey face, ear, wool cap
        o += d.shaded('<ellipse cx="124" cy="62" rx="9" ry="5" transform="rotate(-20 124 62)" {a}/>', LB['face'], LB['faceSh'],
                      LB['faceLine'], dx=-1, dy=-1, w=2.4)
        o += d.shaded('<ellipse cx="126" cy="72" rx="17" ry="19" transform="rotate(-18 126 72)" {a}/>', LB['face'],
                      LB['faceSh'], LB['faceLine'], dx=-3, dy=-3, w=3)
        o += d.shaded('<ellipse cx="104" cy="62" rx="11" ry="6" transform="rotate(30 104 62)" {a}/>', LB['face'],
                      LB['faceSh'], LB['faceLine'], dx=-1, dy=-1, w=2.6)
        o += ell(104, 62, 6, 3, f'fill="{LB["nose"]}" opacity=".8" transform="rotate(30 104 62)"')
        cap = scallop(116, 54, 13, 9, 7, 0.7)
        o += d.shaded(f'<path d="{cap}" {{a}}/>', LB['wool'], LB['woolSh'], LB['woolLine'], dx=-2, dy=-2, w=2.8)
        # eye, cheek, nose, smile
        o += ell(129, 68, 4.4, 5, 'fill="#2F2A3A"') + circ(127.6, 66.2, 1.8, 'fill="#FFFFFF"')
        o += ell(124, 80, 5, 3, f'fill="{LB["cheek"]}" opacity=".9"')
        o += ell(139, 79, 3.4, 2.6, f'fill="{LB["nose"]}"')
        o += path('M133,85 Q137,88 141,85', st('#4E4C62', 2.2))
    else:
        o += ell(80, 114, 36, 3, 'fill="#5E5C74" opacity=".16"')
        # tiny hooves peeking underneath
        for x in (64, 96):
            o += rect(x - 6, 104, 12, 8, 3.5, fl(LB['hoof'], LB['faceLine'], 2.4))
        ballp = scallop(80, 70, 42, 40, 15, 0.62)
        o += d.shaded(f'<path d="{ballp}" {{a}}/>', LB['wool'], LB['woolSh'], LB['woolLine'], dx=-6, dy=-7, w=3.4,
                      hi=ell(62, 48, 14, 7, 'fill="#FFFFFF" opacity=".85" transform="rotate(-35 62 48)"'))
        for (x, y) in ((64, 70), (86, 56), (96, 88), (72, 92), (56, 86)):
            o += path(f'M{x - 5},{y} Q{x},{y - 6} {x + 5},{y}', st(LB['woolSh'], 2.4))
        # a little face peeking at the front
        o += ell(108, 82, 14, 13, fl('#A3A1B6', LB['faceLine'], 2.8))
        for x in (102, 113):
            o += ell(x, 79, 2.8, 3.2, 'fill="#2F2A3A"') + circ(x - 0.9, 77.8, 1.1, 'fill="#FFFFFF"')
        o += path('M105,90 Q108,92 111,90', st('#4E4C62', 1.8))
        o += ell(118, 86, 2.8, 2.2, f'fill="{LB["nose"]}"') + ell(99, 86, 3.6, 2.2, f'fill="{LB["cheek"]}" opacity=".9"')
        cap = scallop(106, 64, 12, 5, 6, 0.7)
        o += d.shaded(f'<path d="{cap}" {{a}}/>', LB['wool'], LB['woolSh'], LB['woolLine'], dx=-2, dy=-2, w=2.6)
    return svg(160, 120, o, ''.join(d.defs))


# ======================================================================= BIRD (faces LEFT)
BD = {'back': '#A9B4C2', 'sh': '#8E9AAB', 'line': '#5D6878', 'belly': '#F3E7D3', 'bellySh': '#E2D2B8', 'wing': '#97A3B4',
      'wingBar': '#76839A', 'cap': '#8995A8'}


def bird(sing=False):
    d = Doc('b')
    o = ''
    # tail (up-right, behind)
    o += d.shaded('<path d="M84,62 L110,40 C114,44 114,50 110,54 L92,74 Z" {a}/>', BD['wing'], BD['wingBar'], BD['line'],
                  dx=-3, dy=-3, w=3.2)
    # legs + toes (brass)
    for x in (54, 66):
        o += path(f'M{x},84 L{x},94', st(P['brassD'], 3.2))
        o += path(f'M{x - 6},95 L{x + 4},95 M{x},95 L{x - 3},91', st(P['brassD'], 3))
    # body (round)
    bt = '<ellipse cx="64" cy="64" rx="30" ry="25" {a}/>'
    o += d.shaded(bt, BD['back'], BD['sh'], BD['line'], dx=-5, dy=-5, w=3.6)
    o += path('M40,70 C46,88 74,94 88,78 C80,86 54,86 40,70 Z', f'fill="{BD["bellySh"]}"')
    o += ell(56, 72, 20, 14, f'fill="{BD["belly"]}"')
    # head (overlaps the body front-left); sing: tilted up
    h = ''
    h += d.shaded('<circle cx="44" cy="44" r="20" {a}/>', BD['back'], BD['sh'], BD['line'], dx=-4, dy=-4, w=3.6,
                  hi=ell(38, 32, 7, 4, 'fill="#FFFFFF" opacity=".4" transform="rotate(-30 38 32)"'))
    h += path('M30,52 C34,62 48,64 56,56 C50,60 38,60 30,52 Z', f'fill="{BD["belly"]}"')
    if sing:   # open beak (two brass triangles)
        h += path('M27,40 L12,34 L28,46 Z', fl(P['brass'], P['brassD'], 2.2))
        h += path('M28,48 L13,52 L27,52 Z', fl(P['brass'], P['brassD'], 2.2))
        h += path('M27,44 L18,44 L28,49 Z', 'fill="#B5615A"')
        h += path('M38,40 Q42,35 47,40', st('#2F2A3A', 2.8))   # happy closed eye
    else:
        h += path('M27,42 L14,46 L27,51 Z', fl(P['brass'], P['brassD'], 2.2))
        h += circ(39, 42, 5, 'fill="#2F2A3A"') + circ(37.6, 40.4, 1.9, 'fill="#FFFFFF"') + circ(41, 44, 0.8, 'fill="#FFFFFF"')
    h += ell(42, 53, 4.4, 2.8, 'fill="#F2A99A" opacity=".85"')
    if sing:
        h = f'<g transform="rotate(14 54 58)">{h}</g>'
    o += h
    # wing
    o += d.shaded('<path d="M58,60 C66,50 86,52 92,62 C94,72 84,82 70,80 C62,78 56,70 58,60 Z" {a}/>', BD['wing'], BD['wingBar'],
                  BD['line'], dx=-3, dy=-3, w=3.2)
    o += path('M66,66 C72,70 80,70 86,66 M68,73 C74,76 80,76 84,73', st(BD['wingBar'], 2.4))
    if sing:   # two tiny curved song lines in front of the open beak
        o += path('M8,24 Q2,32 6,42 M16,14 Q6,26 10,38', st(BD['line'], 2.6) + ' opacity=".75"')
    return svg(120, 100, o, ''.join(d.defs))


# ======================================================================= ICON
def cloud(doc, cx, cy, w, h, base='#FFFFFF', shade='#E3DDF2', line='#C4BBE0', lw=4):
    """A flat-bottomed puffy cloud (bumps on top, soft flat base)."""
    n = 7
    pts = []
    for i in range(n + 1):
        t = i / n
        x = cx - w / 2 + w * t
        y = cy - h * (0.35 + 0.65 * math.sin(math.pi * t)) * (0.92 if i % 2 else 1)
        pts.append((x, y))
    d = f'M{f(cx - w / 2)},{f(cy)}'
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        r = math.hypot(x1 - x0, y1 - y0) * 0.58
        d += f' A{f(r)},{f(r)} 0 0 1 {f(x1)},{f(y1)}'
    d += f' L{f(cx + w / 2)},{f(cy)} Q{f(cx)},{f(cy + h * 0.32)} {f(cx - w / 2)},{f(cy)} Z'
    return doc.shaded(f'<path d="{d}" {{a}}/>', base, shade, line, dx=-w * 0.03, dy=-h * 0.12, w=lw)


def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD3F2"/>'
                  f'<stop offset=".55" stop-color="#D9EEFA"/><stop offset="1" stop-color="#FBE3EC"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # faint pastel rainbow
    for i, col in enumerate(('#F7B8C4', '#FBD3A8', '#FBEAA8', '#BFE5C4', '#B9D7F2', '#D4C6F0')):
        r = 300 - i * 15
        o += path(f'M{f(256 - r)},430 A{r},{r} 0 0 1 {f(256 + r)},430', st(col, 15) + ' opacity=".7"')
    # sun
    o += circ(430, 78, 52, 'fill="#FFF3C4" opacity=".6"') + circ(430, 78, 36, fl('#FFE58A', '#F2C65A', 4))
    # background clouds
    o += cloud(d, 92, 130, 150, 52, lw=3.4) + cloud(d, 330, 70, 120, 40, lw=3.2)
    o += cloud(d, 470, 250, 140, 54, lw=3.4) + cloud(d, 40, 330, 130, 56, lw=3.4)
    # cloud floor
    o += cloud(d, 256, 470, 620, 120, base='#F8F6FC', shade='#DCD6EC', line='#BDB4DC', lw=4.4)
    o += rect(0, 470, 512, 42, 0, 'fill="#DCD6EC"')
    o += path('M0,470 Q256,500 512,470', st('#BDB4DC', 4.4))
    for (x, y) in ((40, 488), (468, 486), (120, 500)):
        o += star4(x, y, 7, fill='#FFF6C8', line='#E2C86A', w=1.8)
    # Bibi (drumming pose), scaled up, standing on the floor on the left
    sc = 1.25
    tx, ty = 140 - 150 * sc, 452 - 292 * sc
    kd = Doc('ik')
    kb, tip, ftip, _ = bibi(kd, 'icon')
    d.defs.extend(kd.defs)

    def T(p):
        return tx + p[0] * sc, ty + p[1] * sc
    t1, t2 = T(tip), T(ftip)
    # the red cloud drum: skin centred under the two stick tips, standing on a small cloud cushion
    dw, dh = 164, 74
    dcx = (t1[0] + t2[0]) / 2 + 6
    dtop = max(t1[1], t2[1]) + 8
    if dcx + dw / 2 > 500:
        dcx = 500 - dw / 2
    o += cloud(d, dcx, dtop + dh + 14, dw * 1.25, 40, lw=3.8)
    o += wood_drum(d, dcx, dtop + dh, dw, dh, body_col=('#E84A4A', '#A8282E', '#F7A0A0'))
    o += ell(140, 452, 100, 9, 'fill="#8A7FB0" opacity=".2"')
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{kb}</g>'
    # "boom" ticks round the struck skin + sparkles
    for ang in (-160, -135, -45, -20):
        a = math.radians(ang)
        x0, y0 = dcx + 96 * math.cos(a), dtop + 30 * math.sin(a) - 10
        x1, y1 = dcx + 118 * math.cos(a), dtop + 46 * math.sin(a) - 22
        o += path(f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)}', st('#FFFFFF', 9)) + path(f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)}', st('#F7A0A0', 4))
    o += star4(dcx + 98, dtop - 74, 14, w=2.4) + star4(dcx - 30, dtop - 96, 10, w=2.2) + star4(40, 250, 10, w=2.2)
    return svg(512, 512, o, ''.join(d.defs))


def main():
    tbl = write_bibi()
    write('characters/lamb.svg', lamb(False))
    write('characters/lamb_ball.svg', lamb(True))
    write('characters/bird.svg', bird(False))
    write('characters/bird_sing.svg', bird(True))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:10s} {v}')


if __name__ == '__main__':
    main()
