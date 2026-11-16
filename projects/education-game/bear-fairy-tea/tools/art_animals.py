#!/usr/bin/env python3
"""Animal art generator for Bo's Farm Parade (character artist C). 100 % original vector art.

Writes (relative to game/assets/default/):
  animals/<a>.svg and animals/<a>_step.svg  for a in
      farm:      cow pig sheep duck hen horse goat
      not farm:  crab penguin lion monkey fishbowl
  viewBox 0 0 200 200, FEET ANCHOR (100, 194): the lowest point of the feet / wheels (outline included) touches y = 194.
  Every animal faces RIGHT (the parade walks right), baby proportions (big head, short legs), body box ~140-180 tall.
  The two frames share an identical body / head; only the legs change (alternating the frames = walking).
  crab: legs shuffle; penguin: waddle feet; fishbowl: a goldfish in a round glass bowl on a little wooden cart with two
  wheels — the step frame flicks the fish's tail and turns the wheel spokes by half a spoke.

Usage: python3 tools/art_animals.py [outDir]
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline in a darker tone of the fill (never black), one-step cel
shade (lower right) + one soft highlight (upper left), white sticker outline ~6 px round the whole silhouette.
No <text>/fonts/scripts/external refs, no filters. Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
LW = 4.0          # outline width (viewBox 200)
STK = 6.0         # white sticker margin beyond the outline
GY = 192.0        # geometry ground line: outline (LW/2) reaches 194
W = 200

PUPIL = '#2F2A3A'
WHITE = '#FFFFFF'
CHEEK = '#F2A99A'
MOUTH = '#7A3A32'
TONGUE = '#EE8F84'


# ------------------------------------------------------------------ tiny SVG helpers
def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def ell(cx, cy, rx, ry, rotd=0, a='{a}'):
    t = f' transform="rotate({f(rotd)} {f(cx)} {f(cy)})"' if rotd else ''
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}"{t} {a}/>'


def circ(cx, cy, r, a='{a}'):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {a}/>'


def rect(x, y, w, h, r=0, a='{a}'):
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(r)}" {a}/>'


def path(d, a='{a}'):
    return f'<path d="{d}" {a}/>'


def fill(c, op=None):
    return f'fill="{c}"' + (f' opacity="{f(op)}"' if op is not None else '')


def st(col, w, fc='none'):
    return f'fill="{fc}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"'


def rot(x, y, ang, cx=0, cy=0):
    a = math.radians(ang)
    dx, dy = x - cx, y - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


def ptsd(pts, close=True):
    """Smooth path through points (Catmull-Rom -> cubic Bezier)."""
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


def scallop(cx, cy, rx, ry, n, bump=0.62, a0=0.0):
    """A cloud / wool / mane outline: n round bumps on an ellipse (clockwise on screen, bumps outward)."""
    pts = []
    for i in range(n):
        t = math.radians(a0) + 2 * math.pi * i / n
        pts.append((cx + rx * math.cos(t), cy + ry * math.sin(t)))
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    for i in range(n):
        p, q = pts[i], pts[(i + 1) % n]
        r = math.hypot(q[0] - p[0], q[1] - p[1]) * bump
        d += f' A{f(r)},{f(r)} 0 0 1 {f(q[0])},{f(q[1])}'
    return d + ' Z'


class Art:
    """One drawing. Each piece registers its silhouette for the white sticker layer drawn underneath everything."""

    def __init__(self, prefix):
        self.prefix, self.defs, self.n, self.sil, self.body = prefix, [], 0, [], []

    def uid(self, k='g'):
        self.n += 1
        return f'{self.prefix}{k}{self.n}'

    def clip(self, inner):
        cid = self.uid('c')
        self.defs.append(f'<clipPath id="{cid}">{inner}</clipPath>')
        return cid

    def add(self, tpl, base, shade, line, dx=-8, dy=-8, w=LW, inner='', hi=None, sticker=True):
        """One-step cel-shaded shape: shape in shade colour, base colour shifted up-left inside it (shade stays lower
        right), extra inner details clipped to the shape, then the outline on top. tpl has '{a}' for the attributes."""
        if tpl.startswith('M'):          # a bare path d
            tpl = path(tpl)
        if sticker:
            self.sil.append(tpl.format(a=''))
        cid = self.clip(tpl.format(a=''))
        out = tpl.format(a=f'fill="{shade}"')
        out += (f'<g clip-path="url(#{cid})"><g transform="translate({f(dx)},{f(dy)})">'
                f'{tpl.format(a=fill(base))}</g>{inner}')
        if hi:
            out += hi
        out += '</g>'
        out += tpl.format(a=f'fill="none" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')
        self.body.append(out)

    def flat(self, tpl, col, line=None, w=LW, sticker=False):
        if sticker:
            self.sil.append(tpl.format(a=''))
        a = fill(col) + (f' stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"' if line else '')
        self.body.append(tpl.format(a=a))

    def raw(self, s):
        self.body.append(s)

    def tube(self, d, wout, line, col, sticker=True):
        """Round-capped tube along d (tails, crab legs, stalks)."""
        if sticker:
            self.sil.append(f'<path d="{d}" fill="none" stroke-width="{f(wout + 2 * STK)}"/>')
        self.body.append(path(d, st(line, wout)) + path(d, st(col, wout - 2 * LW + 0.6)))

    def svg(self):
        sw = LW + 2 * STK
        stick = (f'<g fill="#FFFFFF" stroke="#FFFFFF" stroke-width="{f(sw)}" stroke-linejoin="round" '
                 f'stroke-linecap="round">{"".join(self.sil)}</g>')
        d = f'<defs>{"".join(self.defs)}</defs>' if self.defs else ''
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{W}" viewBox="0 0 {W} {W}">'
                f'{d}{stick}{"".join(self.body)}</svg>\n')


# ------------------------------------------------------------------ shared face / body parts
def hi_blob(cx, cy, rx, ry, rotd=-25, op=0.35):
    return ell(cx, cy, rx, ry, rotd, fill(WHITE, op))


def eye(A, x, y, s=1.0, ring=None):
    """Big glossy cartoon eye: dark oval with two catch-lights. ring = colour of a light rim (dark faces)."""
    o = ''
    if ring:
        o += ell(x, y, 7.6 * s, 9.2 * s, 0, fill(ring))
    o += ell(x, y, 6.0 * s, 7.6 * s, 0, fill(PUPIL))
    o += circ(x + 1.9 * s, y - 2.8 * s, 2.5 * s, fill(WHITE))
    o += circ(x - 2.0 * s, y + 2.9 * s, 1.15 * s, fill(WHITE, 0.9))
    A.raw(o)


def cheek(A, x, y, rx=7.0, ry=4.4, op=0.7):
    A.raw(ell(x, y, rx, ry, 0, fill(CHEEK, op)))


def smile(A, x, y, wd, line, deep=4.5, open_=False):
    if open_:
        d = f'M{f(x - wd)},{f(y)} Q{f(x)},{f(y + deep * 2.4)} {f(x + wd)},{f(y)} Z'
        A.raw(path(d, f'fill="{MOUTH}" stroke="{line}" stroke-width="2.6" stroke-linejoin="round"'))
        A.raw(ell(x + wd * 0.1, y + deep * 1.3, wd * 0.45, deep * 0.55, 0, fill(TONGUE)))
    else:
        A.raw(path(f'M{f(x - wd)},{f(y)} Q{f(x)},{f(y + deep * 2)} {f(x + wd)},{f(y)}', st(line, 2.8)))


def leg_d(hx, hy, fx, wt, wb, gy=GY):
    """Leg from a hip (hidden under the body) down to a flat foot whose bottom sits on the ground line."""
    r = min(wb * 0.36, 6.5)
    return (f'M{f(hx - wt / 2)},{f(hy)} L{f(hx + wt / 2)},{f(hy)} L{f(fx + wb / 2)},{f(gy - r)} '
            f'Q{f(fx + wb / 2)},{f(gy)} {f(fx + wb / 2 - r)},{f(gy)} L{f(fx - wb / 2 + r)},{f(gy)} '
            f'Q{f(fx - wb / 2)},{f(gy)} {f(fx - wb / 2)},{f(gy - r)} Z')


def leg(A, hx, hy, fx, wt, wb, C, far=False, hoof=None, hoof_h=11, toes=False):
    base, sh, line = (C['sh'], C['sh2'], C['line']) if far else (C['base'], C['sh'], C['line'])
    inner = ''
    if hoof:
        hc = hoof if not far else C.get('hoof_far', hoof)
        inner += rect(fx - wb, GY - hoof_h, wb * 2, hoof_h + 6, 0, fill(hc))
        inner += path(f'M{f(fx - wb)},{f(GY - hoof_h)} L{f(fx + wb)},{f(GY - hoof_h)}', st(line, 3))
    if toes:
        for k in (-0.17, 0.17):
            x = fx + wb * k
            inner += path(f'M{f(x)},{f(GY - 1)} L{f(x)},{f(GY - 7)}', st(line, 2.4))
    A.add(path(leg_d(hx, hy, fx, wt, wb)), base, sh, line, dx=-4, dy=0, inner=inner)


def quad_legs(A, C, step, front, back, hy, wt, wb, stride=9, far_dx=11, far_dy=-3, **kw):
    """Four legs: far pair (darker, behind) then the near pair is drawn later via the returned function.
    Phase 0: near front forward / near back back; far pair opposite. Phase 1 swaps."""
    sgn = 1 if step == 0 else -1
    # far legs
    leg(A, front + far_dx, hy + far_dy, front + far_dx - sgn * stride, wt, wb, C, far=True, **kw)
    leg(A, back + far_dx, hy + far_dy, back + far_dx + sgn * stride, wt, wb, C, far=True, **kw)

    def near():
        leg(A, back, hy, back - sgn * stride, wt, wb, C, **kw)
        leg(A, front, hy, front + sgn * stride, wt, wb, C, **kw)
    return near


# ======================================================================= FARM
def cow(step):
    A = Art('cw')
    C = dict(base='#F8F3EA', sh='#E3D8C6', sh2='#CFC2AE', line='#8E7A68')
    patch = '#6E5649'
    pink, pinkSh, pinkLine = '#F4C3B5', '#E3A797', '#B07767'
    hoof = '#6E5649'
    # tail (behind the body)
    A.tube('M36,124 C22,128 18,142 20,158', 8, C['line'], C['base'])
    A.add(ptsd([(20, 152), (27, 160), (24, 172), (15, 170), (12, 160)]), patch, '#55423A', '#4A3A32', dx=-3, dy=-3)
    near = quad_legs(A, C, step, front=120, back=56, hy=158, wt=21, wb=23, hoof=hoof)
    # body with patches
    body = ell(86, 134, 56, 36)
    patches = (path(ptsd([(56, 102), (82, 100), (88, 118), (72, 134), (50, 128), (44, 112)]), fill(patch)) +
               path(ptsd([(104, 140), (124, 132), (140, 146), (130, 164), (108, 162)]), fill(patch)) +
               ell(46, 150, 12, 10, 20, fill(patch)))
    A.add(body, C['base'], C['sh'], C['line'], inner=patches, hi=hi_blob(62, 112, 20, 9))
    near()
    # small udder hint? (no — keep it simple) ; ears behind the head
    A.add(ell(98, 72, 17, 9, -18), C['base'], C['sh'], C['line'], dx=-3, dy=-3,
          inner=ell(99, 73, 10, 4.6, -18, fill(pink)))
    A.add(ell(176, 66, 15, 8.5, 22), C['base'], C['sh'], C['line'], dx=-3, dy=-3,
          inner=ell(176, 66, 9, 4.4, 22, fill(pink)))
    # horns
    A.add(path('M118,52 C112,42 112,32 118,26 C124,32 128,42 126,50 Z'), '#F3E3C2', '#DCC69C', '#9C8358', dx=-2, dy=-2)
    A.add(path('M152,48 C152,38 156,30 164,26 C166,34 164,44 160,50 Z'), '#F3E3C2', '#DCC69C', '#9C8358', dx=-2, dy=-2)
    # head + eye patch + forelock
    head = ell(140, 80, 41, 37)
    hpatch = path(ptsd([(104, 64), (122, 54), (136, 66), (130, 88), (112, 92), (100, 82)]), fill(patch))
    A.add(head, C['base'], C['sh'], C['line'], inner=hpatch, hi=hi_blob(150, 56, 13, 6))
    A.raw(path('M132,46 C136,38 144,38 148,44 C144,42 140,44 138,48', st(C['line'], 2.6, C['base'])))
    # muzzle
    A.add(ell(150, 106, 29, 19), pink, pinkSh, pinkLine, dx=-5, dy=-5, hi=hi_blob(140, 98, 9, 4, -10, 0.45))
    A.raw(ell(140, 104, 3.6, 4.6, -10, fill(pinkLine)) + ell(162, 103, 3.6, 4.6, 10, fill(pinkLine)))
    smile(A, 151, 113, 7, pinkLine, 2.6)
    eye(A, 124, 78, 0.92, ring=WHITE)
    eye(A, 158, 76, 1.0)
    cheek(A, 112, 94, 6, 3.8)
    cheek(A, 174, 92, 6, 3.8)
    return A.svg()


def pig(step):
    A = Art('pg')
    C = dict(base='#F2B8B0', sh='#DFA098', sh2='#CC8C85', line='#B26E68')
    snout, snoutSh = '#F7CBC4', '#E8AFA7'
    hoof = '#B98078'
    A.tube('M34,128 C22,126 18,114 26,110 C34,106 36,118 28,120', 6.5, C['line'], C['base'])
    near = quad_legs(A, C, step, front=118, back=58, hy=164, wt=22, wb=24, stride=8, hoof=hoof, hoof_h=9)
    A.add(ell(86, 138, 56, 40), C['base'], C['sh'], C['line'], hi=hi_blob(60, 114, 20, 9))
    near()
    # ears: soft triangles flopping forward
    A.add(path('M108,64 C100,48 100,36 106,28 C118,32 128,42 132,52 Z'), C['base'], C['sh'], C['line'], dx=-3, dy=-3,
          inner=path('M112,56 C108,46 108,40 110,36 C116,40 122,46 124,52 Z', fill(snoutSh)))
    A.add(path('M150,52 C156,40 166,32 178,30 C180,42 176,54 168,62 Z'), C['base'], C['sh'], C['line'], dx=-3, dy=-3,
          inner=path('M156,52 C162,44 168,40 174,38 C174,46 170,52 166,56 Z', fill(snoutSh)))
    A.add(circ(140, 86, 48), C['base'], C['sh'], C['line'], hi=hi_blob(122, 60, 14, 7))
    # snout
    A.add(ell(160, 104, 21, 15, -6), snout, snoutSh, C['line'], dx=-4, dy=-4)
    A.raw(ell(153, 104, 3.4, 5.2, -6, fill(C['line'])) + ell(166, 103, 3.4, 5.2, -6, fill(C['line'])))
    eye(A, 124, 82, 0.95)
    eye(A, 156, 78, 1.0)
    cheek(A, 112, 100, 7, 4.6)
    cheek(A, 182, 90, 5, 3.6)
    smile(A, 150, 122, 7, C['line'], 2.4)
    return A.svg()


def sheep(step):
    A = Art('sp')
    wool, woolSh, woolLine = '#F6F1E7', '#E3DACA', '#A69683'
    C = dict(base='#86695C', sh='#6F5649', sh2='#5E483D', line='#4A372F')
    face_c = '#9A7D6E'
    near = quad_legs(A, C, step, front=116, back=58, hy=160, wt=16, wb=17, stride=8, far_dx=10,
                     hoof='#4A372F', hoof_h=8)
    A.add(path(scallop(86, 126, 56, 40, 13, 0.64, 8)), wool, woolSh, woolLine,
          hi=hi_blob(62, 100, 20, 9))
    near()
    # ears (behind the face)
    A.add(ell(114, 86, 16, 7.5, 24), face_c, C['sh'], C['line'], dx=-3, dy=-3,
          inner=ell(113, 86, 9, 3.2, 24, fill('#E9B4A8')))
    A.add(ell(176, 84, 14, 7.5, -24), face_c, C['sh'], C['line'], dx=-3, dy=-3,
          inner=ell(176, 84, 8, 3.2, -24, fill('#E9B4A8')))
    A.add(ell(147, 92, 29, 33), face_c, C['sh'], C['line'], hi=hi_blob(136, 80, 8, 4))
    # muzzle lighter
    A.raw(ell(152, 110, 16, 11, 0, fill('#B89A8A')))
    A.raw(path('M147,106 Q152,110 157,106 Q152,104 147,106 Z', st('#5A443A', 2.4, '#5A443A')))
    A.raw(path('M152,109 L152,114 M146,115 Q152,120 158,115', st('#5A443A', 2.4)))
    # wool tuft on the head
    A.add(path(scallop(144, 60, 26, 14, 9, 0.66, 0)), wool, woolSh, woolLine, dx=-4, dy=-4)
    eye(A, 136, 88, 0.92, ring='#F6F1E7')
    eye(A, 160, 88, 0.98, ring='#F6F1E7')
    cheek(A, 128, 104, 5.5, 3.6, 0.8)
    cheek(A, 170, 104, 5.5, 3.6, 0.8)
    return A.svg()


def horse(step):
    A = Art('hs')
    C = dict(base='#B98A62', sh='#9F7150', sh2='#8C6246', line='#6A4832')
    mane, maneSh, maneLine = '#5E4231', '#4A3325', '#35251B'
    muz, muzSh = '#E4C6A6', '#CFAD8B'
    hoof = '#4A3A30'
    # tail
    A.add(ptsd([(34, 104), (22, 112), (12, 134), (14, 158), (22, 166), (26, 146), (34, 126), (42, 112)]),
          mane, maneSh, maneLine, dx=-3, dy=-3)
    near = quad_legs(A, C, step, front=112, back=50, hy=140, wt=21, wb=18, stride=10, far_dx=11,
                     hoof=hoof, hoof_h=11)
    A.add(ell(80, 122, 52, 31), C['base'], C['sh'], C['line'], hi=hi_blob(56, 104, 18, 7))
    near()
    # neck
    A.add(ptsd([(98, 110), (104, 80), (116, 56), (134, 44), (154, 54), (150, 82), (140, 110), (122, 124)]),
          C['base'], C['sh'], C['line'], dx=-5, dy=-5)
    # ears
    A.add(path('M124,36 C122,24 124,14 130,8 C136,16 138,26 136,36 Z'), C['base'], C['sh'], C['line'], dx=-2, dy=-2,
          inner=path('M128,32 C127,24 128,18 130,14 C133,20 134,26 133,32 Z', fill('#D9A994')))
    A.add(path('M146,36 C148,24 152,16 160,12 C162,20 160,30 156,38 Z'), C['base'], C['sh'], C['line'], dx=-2, dy=-2,
          inner=path('M150,34 C152,26 155,20 158,17 C159,23 157,29 154,34 Z', fill('#D9A994')))
    # head: cranium + muzzle
    A.add(ell(140, 60, 30, 28), C['base'], C['sh'], C['line'], hi=hi_blob(130, 44, 10, 5))
    A.add(ell(160, 88, 25, 20, 18), muz, muzSh, '#8A6A4E', dx=-5, dy=-5)
    A.raw(ell(162, 85, 3.2, 4.4, 20, fill('#8A6A4E')) + ell(176, 92, 3.0, 4.2, 20, fill('#8A6A4E')))
    smile(A, 160, 100, 6, '#8A6A4E', 2.4)
    # blaze
    A.raw(path('M148,40 C152,48 152,62 150,72 C147,64 144,52 148,40 Z', fill('#F6EBDD')))
    # mane along the neck + forelock
    A.add(ptsd([(126, 34), (132, 46), (120, 58), (112, 74), (106, 92), (102, 110), (92, 114), (84, 104), (90, 94),
                (86, 84), (94, 74), (92, 62), (102, 54), (104, 42), (116, 38)]), mane, maneSh, maneLine, dx=-3, dy=-3)
    A.add(ptsd([(132, 34), (144, 28), (152, 36), (150, 48), (144, 42), (138, 50), (134, 42)]), mane, maneSh, maneLine,
          dx=-2, dy=-2)
    eye(A, 132, 62, 0.9)
    eye(A, 156, 60, 0.95)
    cheek(A, 128, 76, 5.5, 3.4)
    return A.svg()


def goat(step):
    A = Art('gt')
    C = dict(base='#C9C1B8', sh='#ACA399', sh2='#978E85', line='#6E6660')
    muz = '#EFEAE3'
    horn, hornSh, hornLine = '#E9DABB', '#CDB98F', '#8F7B55'
    hoof = '#57504A'
    # short perky tail
    A.add(path('M40,112 C32,104 28,94 32,88 C38,92 44,100 46,108 Z'), C['base'], C['sh'], C['line'], dx=-2, dy=-2)
    near = quad_legs(A, C, step, front=116, back=56, hy=152, wt=17, wb=18, stride=9, hoof=hoof, hoof_h=10)
    A.add(ell(84, 130, 52, 33), C['base'], C['sh'], C['line'],
          inner=ell(92, 152, 34, 10, 0, fill('#DED8D0')), hi=hi_blob(60, 110, 18, 7))
    near()
    # horns curving back
    A.add(path('M120,54 C112,40 104,30 92,26 C98,24 112,26 122,34 C128,40 132,48 130,54 Z'),
          horn, hornSh, hornLine, dx=-2, dy=-3, inner=path('M108,32 L113,38 M118,38 L121,44', st(hornLine, 2)))
    A.add(path('M140,50 C136,36 132,26 122,18 C130,18 140,22 146,32 C150,40 152,46 150,52 Z'),
          horn, hornSh, hornLine, dx=-2, dy=-3, inner=path('M134,24 L136,31 M142,32 L141,39', st(hornLine, 2)))
    # floppy ears
    A.add(ell(104, 78, 18, 7.5, 28), C['base'], C['sh'], C['line'], dx=-3, dy=-3,
          inner=ell(104, 78, 10, 3, 28, fill('#E9C2B4')))
    A.add(ell(174, 80, 15, 7.5, -26), C['base'], C['sh'], C['line'], dx=-3, dy=-3,
          inner=ell(174, 80, 8.5, 3, -26, fill('#E9C2B4')))
    # beard behind the chin
    A.add(path('M146,112 C150,124 150,134 146,142 C140,134 136,124 136,114 Z'), muz, '#DAD3C9', C['line'], dx=-2, dy=-2)
    A.add(ell(140, 80, 33, 31), C['base'], C['sh'], C['line'], hi=hi_blob(128, 62, 11, 5))
    A.add(ell(152, 102, 22, 15), muz, '#DAD3C9', C['line'], dx=-4, dy=-4)
    A.raw(ell(146, 98, 2.8, 3.8, -10, fill(C['line'])) + ell(160, 97, 2.8, 3.8, 10, fill(C['line'])))
    smile(A, 153, 107, 6, C['line'], 2.4)
    # forehead tuft
    A.raw(path('M132,52 C136,46 142,46 146,50 C142,50 138,52 136,56', st(C['line'], 2.6, C['base'])))
    eye(A, 126, 78, 0.92)
    eye(A, 156, 76, 1.0)
    cheek(A, 116, 92, 5.5, 3.6)
    cheek(A, 172, 90, 5.5, 3.6)
    return A.svg()


def duck(step):
    A = Art('dk')
    C = dict(base='#FAF6EE', sh='#E6DCCB', line='#A89A85')
    bill, billSh, billLine = '#F0A65A', '#DA8D44', '#A8642A'
    F = dict(base=bill, sh=billSh, sh2='#C47C38', line=billLine)
    sgn = 1 if step == 0 else -1

    def foot(hx, fx, far):
        cc = F['sh'] if far else F['base']
        A.tube(f'M{f(hx)},160 L{f((hx + fx) / 2)},182', 9, F['line'], cc)
        d = (f'M{f(fx - 9)},{f(GY)} L{f(fx - 4)},{f(GY - 9)} Q{f(fx + 2)},{f(GY - 12)} {f(fx + 8)},{f(GY - 8)} '
             f'L{f(fx + 16)},{f(GY - 2)} Q{f(fx + 17)},{f(GY)} {f(fx + 14)},{f(GY)} Z')
        A.add(path(d), cc, F['sh2'], F['line'], dx=-2, dy=-2)

    foot(78, 76 - 8 * sgn, True)
    # tail (behind the body)
    A.add(path('M50,126 C36,120 26,108 24,94 C36,98 50,104 60,112 Z'), C['base'], C['sh'], C['line'], dx=-3, dy=-3)
    A.add(ell(90, 138, 54, 33, -4), C['base'], C['sh'], C['line'], hi=hi_blob(70, 118, 20, 8))
    # neck
    A.add(ell(126, 112, 20, 26, 10), C['base'], C['sh'], C['line'], dx=-4, dy=-4, sticker=True)
    # wing
    A.add(ptsd([(56, 126), (82, 118), (110, 126), (118, 142), (100, 154), (78, 154), (58, 146), (48, 134)]),
          C['base'], C['sh'], C['line'], dx=-3, dy=-4,
          inner=path('M62,144 Q70,138 78,146 M74,148 Q82,142 90,150', st(C['line'], 2.4)))
    foot(112, 112 + 8 * sgn, False)
    # head
    A.add(circ(134, 78, 38), C['base'], C['sh'], C['line'], hi=hi_blob(120, 58, 12, 6))
    # head curl
    A.raw(path('M126,42 C124,32 132,26 138,30 C142,34 138,40 134,38', st(C['line'], 3.4, 'none')))
    # bill
    A.add(path('M156,88 C166,82 182,82 190,88 C192,94 186,100 176,102 C166,104 156,102 152,98 Z'),
          bill, billSh, billLine, dx=-3, dy=-3)
    A.raw(path('M156,95 Q172,97 188,92', st(billLine, 2.4)))
    A.raw(ell(170, 88, 2.2, 1.4, 0, fill(billLine)))
    eye(A, 124, 72, 0.92)
    eye(A, 152, 70, 1.0)
    cheek(A, 116, 90, 6, 3.8)
    cheek(A, 160, 106, 5, 3.4, 0.6)
    return A.svg()


def hen(step):
    A = Art('hn')
    C = dict(base='#BE7F55', sh='#A26544', line='#6E4028')
    chest = '#DDAA82'
    tail, tailSh, tailLine = '#8A5A3C', '#734730', '#4E301E'
    comb, combSh, combLine = '#E07A6A', '#C45E50', '#94443A'
    beak, beakSh, beakLine = '#EDB65E', '#D59C44', '#A06C2A'
    legc = '#E2B062'
    sgn = 1 if step == 0 else -1

    def foot(hx, fx, far):
        cc = '#C99848' if far else legc
        A.tube(f'M{f(hx)},160 L{f(fx)},{f(GY - 3)}', 7.5, beakLine, cc)
        A.tube(f'M{f(fx - 9)},{f(GY - 2)} L{f(fx + 13)},{f(GY - 2)} M{f(fx + 1)},{f(GY - 2)} L{f(fx + 10)},{f(GY - 9)}',
               7, beakLine, cc)

    foot(80, 80 - 7 * sgn, True)
    # tail feathers
    A.add(ptsd([(62, 116), (40, 100), (26, 76), (30, 62), (40, 70), (44, 54), (54, 50), (58, 66), (68, 58),
                (76, 66), (78, 104)]),
          tail, tailSh, tailLine, dx=-3, dy=-3,
          inner=path('M38,74 Q48,90 58,106 M54,62 Q60,84 66,104', st(tailLine, 2.2)))
    A.add(ell(94, 132, 50, 38), C['base'], C['sh'], C['line'],
          inner=ell(124, 142, 26, 26, 0, fill(chest)), hi=hi_blob(72, 110, 18, 8))
    A.add(ptsd([(60, 124), (90, 116), (112, 128), (108, 148), (86, 156), (64, 146)]), C['base'], C['sh'], C['line'],
          dx=-3, dy=-4, inner=path('M74,142 Q82,136 90,144 M86,148 Q94,142 102,148', st(C['line'], 2.2)))
    foot(110, 110 + 7 * sgn, False)
    # comb
    A.add(path(scallop(134, 46, 19, 10, 6, 0.8, 180)), comb, combSh, combLine, dx=-2, dy=-2)
    A.add(circ(136, 80, 33), C['base'], C['sh'], C['line'], inner=ell(150, 92, 20, 16, 0, fill(chest)),
          hi=hi_blob(124, 62, 11, 5))
    # wattle
    A.add(ell(162, 104, 6, 9), comb, combSh, combLine, dx=-2, dy=-2)
    # beak
    A.add(path('M158,82 L180,90 L158,98 Z'), beak, beakSh, beakLine, dx=-2, dy=-2)
    A.raw(path('M159,90 L176,90', st(beakLine, 2)))
    eye(A, 126, 76, 0.9)
    eye(A, 150, 74, 0.98)
    cheek(A, 120, 92, 5.5, 3.6)
    cheek(A, 154, 100, 4.5, 3, 0.6)
    return A.svg()


# ======================================================================= NOT FARM
def crab(step):
    A = Art('cb')
    base, sh, sh2, line = '#EEA38C', '#D8876F', '#C77762', '#A65A48'
    light = '#F8C9B8'
    # legs: three per side, shuffle by phase
    sgn = 1 if step == 0 else -1
    for side in (-1, 1):
        for k in range(3):
            hx = 100 + side * (40 + k * 6)
            hy = 150 + k * 8
            kx = 100 + side * (62 + k * 8) + sgn * side * (4 if k != 1 else -4)
            ky = hy - 6 + (4 if (k + (0 if step == 0 else 1)) % 2 == 0 else 0)
            fx = 100 + side * (66 + k * 6) + sgn * (4 if k % 2 == 0 else -4)
            A.tube(f'M{f(hx)},{f(hy)} Q{f(kx)},{f(ky - 10)} {f(fx)},{f(GY - 3)}', 10, line, sh2 if k != 1 else sh)
    # claw arms
    A.tube('M54,142 Q32,128 32,84', 13, line, base)
    A.tube('M146,142 Q168,128 168,84', 13, line, base)
    # eye stalks
    A.tube('M88,126 L83,82', 9, line, base)
    A.tube('M114,126 L119,82', 9, line, base)
    # body
    A.add(ell(100, 148, 60, 36), base, sh, line, hi=hi_blob(76, 128, 20, 8))
    # pincers (open, friendly): lower jaw + upper jaw
    for side in (-1, 1):
        cx = 100 + side * 68
        px, py, r = cx, 70, 17
        a1, a2 = (-28, -78) if side > 0 else (-102, -152)
        P = lambda a: (px + r * math.cos(math.radians(a)), py + r * math.sin(math.radians(a)))
        p1, p2 = P(a1), P(a2)
        apx, apy = px + 3 * side, py - 1
        claw = path(f'M{f(p1[0])},{f(p1[1])} L{f(apx)},{f(apy)} L{f(p2[0])},{f(p2[1])} '
                    f'A{f(r)},{f(r)} 0 1 0 {f(p1[0])},{f(p1[1])} Z')
        A.add(claw, base, sh, line, dx=-3, dy=-3, hi=ell(px - 6 * side, py + 4, 5, 3, -30, fill(WHITE, 0.4)))
    # eyes on stalks
    for x, s in ((82, 0.95), (120, 1.0)):
        A.add(circ(x, 72, 15), WHITE, '#EFE6E2', line, dx=-2, dy=-2)
        eye(A, x + 2.5, 73, 1.0 * s)
    cheek(A, 76, 152, 7, 4.4, 0.8)
    cheek(A, 126, 152, 7, 4.4, 0.8)
    smile(A, 103, 144, 16, line, 7.5, open_=True)
    return A.svg()


def penguin(step):
    A = Art('pn')
    slate, slateSh, slateLine = '#4A5568', '#3B4455', '#262D3A'
    wh, whSh = '#F7F6F1', '#E2E1DA'
    org, orgSh, orgLine = '#F0A65A', '#DA8D44', '#A8642A'
    sgn = 1 if step == 0 else -1
    # feet: waddle — one foot forward & turned out, the other tucked back
    def foot(fx, far, out):
        cc = orgSh if far else org
        d = (f'M{f(fx - 14)},{f(GY)} Q{f(fx - 16)},{f(GY - 10)} {f(fx - 4)},{f(GY - 12)} '
             f'Q{f(fx + 12)},{f(GY - 12)} {f(fx + 18 + out)},{f(GY - 4)} Q{f(fx + 20 + out)},{f(GY)} {f(fx + 14 + out)},{f(GY)} Z')
        A.add(path(d), cc, '#C47C38', orgLine, dx=-2, dy=-2)

    foot(80 - 6 * sgn, True, 0)
    # far flipper
    A.add(ell(50, 124, 13, 34, 18), slateSh, '#323A49', slateLine, dx=-2, dy=-2)
    body = ell(98, 110, 54, 76)
    belly = ell(108, 132, 38, 54, 0, fill(wh))
    face = (circ(94, 78, 20, fill(wh)) + circ(122, 78, 20, fill(wh)) + ell(108, 94, 30, 20, 0, fill(wh)))
    A.add(body, slate, slateSh, slateLine, inner=belly + face +
          path('M142,132 C142,160 128,182 104,184 C128,170 138,152 142,132 Z', fill(whSh)),
          hi=hi_blob(70, 62, 16, 8, -30, 0.25))
    foot(118 - 6 * sgn, False, 2)
    # near flipper
    A.add(ell(150, 120, 12, 32, -22), slate, slateSh, slateLine, dx=-3, dy=-3)
    # beak
    A.add(path('M110,90 Q126,82 142,94 Q128,106 112,100 Z'), org, orgSh, orgLine, dx=-2, dy=-2)
    eye(A, 96, 78, 0.95)
    eye(A, 124, 76, 1.0)
    cheek(A, 88, 98, 6, 4)
    cheek(A, 136, 106, 5, 3.4)
    # little head tuft
    A.raw(path('M94,36 C92,28 98,22 104,26 C100,28 98,32 100,36', st(slateLine, 3.2, slate)))
    return A.svg()


def lion(step):
    A = Art('ln')
    C = dict(base='#DDB47E', sh='#C69A63', sh2='#B4895A', line='#8C6438')
    mane, maneSh, maneLine = '#C0844C', '#A66D3A', '#7A4C26'
    muz = '#F6E5C8'
    # tail with tuft
    A.tube('M36,128 C18,126 12,108 20,96', 8, C['line'], C['base'])
    A.add(ptsd([(20, 98), (12, 92), (14, 80), (24, 80), (28, 90)]), mane, maneSh, maneLine, dx=-2, dy=-2)
    near = quad_legs(A, C, step, front=116, back=56, hy=160, wt=21, wb=24, stride=8, toes=True)
    A.add(ell(84, 138, 52, 33), C['base'], C['sh'], C['line'],
          inner=ell(92, 160, 34, 9, 0, fill('#EBCB9E')), hi=hi_blob(60, 118, 18, 7))
    near()
    # mane
    A.add(path(scallop(138, 86, 46, 45, 12, 0.6, 10)), mane, maneSh, maneLine, dx=-5, dy=-5,
          hi=hi_blob(116, 54, 10, 5, -30, 0.3))
    # ears
    A.add(circ(118, 58, 10), C['base'], C['sh'], C['line'], dx=-2, dy=-2, inner=circ(119, 59, 5, fill('#E9B49A')))
    A.add(circ(164, 56, 10), C['base'], C['sh'], C['line'], dx=-2, dy=-2, inner=circ(163, 57, 5, fill('#E9B49A')))
    A.add(circ(142, 90, 33), C['base'], C['sh'], C['line'], hi=hi_blob(130, 72, 10, 5))
    # muzzle lobes + nose
    A.flat(ell(138, 106, 12, 9), muz)
    A.flat(ell(158, 106, 12, 9), muz)
    A.raw(path('M140,96 Q148,92 156,96 Q152,104 148,105 Q144,104 140,96 Z',
               f'fill="#8A5A48" stroke="#6A4032" stroke-width="2" stroke-linejoin="round"'))
    A.raw(path('M148,105 L148,109 M140,111 Q148,117 156,111', st(C['line'], 2.4)))
    A.raw(circ(132, 106, 1.3, fill(C['line'])) + circ(136, 110, 1.3, fill(C['line'])) +
          circ(160, 110, 1.3, fill(C['line'])) + circ(164, 106, 1.3, fill(C['line'])))
    eye(A, 130, 86, 0.92)
    eye(A, 158, 84, 1.0)
    cheek(A, 120, 100, 5.5, 3.6)
    cheek(A, 172, 98, 5.5, 3.6)
    return A.svg()


def monkey(step):
    A = Art('mk')
    C = dict(base='#94603E', sh='#7A4D31', sh2='#6A4129', line='#4E2F1F')
    face, faceSh, faceLine = '#F2D9B8', '#DFC29E', '#9C6E4A'
    sgn = 1 if step == 0 else -1
    # long curly tail behind
    A.tube('M76,160 C50,170 26,156 26,128 C26,108 44,102 52,112 C58,120 50,130 42,124', 9, C['line'], C['base'])

    def leg_(hx, fx, far):
        Cc = dict(C)
        leg(A, hx, 160, fx, 18, 20, Cc, far=far)
        cc = faceSh if far else face
        A.add(ell(fx + 4, GY - 6, 13, 6), cc, faceSh if not far else '#C9AA86', faceLine, dx=-2, dy=-2)

    leg_(92, 92 - 9 * sgn, True)
    # far arm
    A.tube('M76,128 C64,138 60,150 62,162', 13, C['line'], C['sh'])
    A.add(circ(62, 164, 7.5), faceSh, '#C9AA86', faceLine, dx=-2, dy=-2)
    # near leg BEFORE the body: its hip is hidden under the belly (drawn after, its flat top cut across the belly)
    leg_(110, 110 + 9 * sgn, False)
    A.add(ell(100, 144, 34, 34), C['base'], C['sh'], C['line'],
          inner=ell(110, 150, 21, 24, 0, fill(face)), hi=hi_blob(80, 122, 12, 6))
    # near arm
    A.tube('M124,126 C138,134 144,146 142,158', 13, C['line'], C['base'])
    A.add(circ(142, 160, 7.5), face, faceSh, faceLine, dx=-2, dy=-2)
    # ears
    A.add(circ(58, 82, 17), C['base'], C['sh'], C['line'], dx=-3, dy=-3, inner=circ(60, 83, 10, fill(face)))
    A.add(circ(154, 78, 16), C['base'], C['sh'], C['line'], dx=-3, dy=-3, inner=circ(152, 79, 9.5, fill(face)))
    # head + heart face
    facep = (circ(94, 72, 19, fill(face)) + circ(122, 72, 19, fill(face)) + ell(110, 98, 30, 20, 0, fill(face)) +
             ell(108, 86, 26, 16, 0, fill(face)))
    A.add(circ(104, 80, 46), C['base'], C['sh'], C['line'], inner=facep, hi=hi_blob(78, 52, 13, 6, -30, 0.28))
    # face outline (soft) for the mask
    A.raw(path('M80,84 C70,66 82,50 96,54 C102,56 106,60 108,62 C112,56 122,50 132,54 C146,60 144,80 138,90 '
               'C142,104 128,118 110,118 C92,118 78,108 80,92', st(faceLine, 2.2)))
    # hair tuft
    A.raw(path('M98,36 C96,24 106,18 112,24 C114,28 110,32 106,30', st(C['line'], 3.4, C['base'])))
    eye(A, 96, 76, 0.95)
    eye(A, 122, 74, 1.0)
    A.raw(ell(106, 92, 2.0, 1.6, 0, fill(faceLine)) + ell(114, 92, 2.0, 1.6, 0, fill(faceLine)))
    smile(A, 110, 100, 12, faceLine, 4, open_=True)
    cheek(A, 86, 96, 6, 4)
    cheek(A, 134, 94, 5.5, 3.8)
    return A.svg()


def fishbowl(step):
    A = Art('fb')
    wood, woodD, woodL = '#B98552', '#7A5130', '#DDB07E'
    hub, hubD = '#9AA4AE', '#636C75'
    glassLine = '#7FA3AE'
    water, waterSh = '#DCEFF3', '#C4E1E8'
    fish, fishSh, fishLine, fishL = '#F2B04E', '#DC9536', '#A8661E', '#F9D08A'
    weed, weedLine = '#93B98E', '#5F8A5C'
    # cart: tray + wheels
    for wx in (68, 132):
        r = 14
        wy = GY - r
        spokes = ''
        a0 = 0 if step == 0 else 30
        for k in range(3):
            a = math.radians(a0 + k * 60)
            spokes += f'M{f(wx - r * 0.8 * math.cos(a))},{f(wy - r * 0.8 * math.sin(a))} L{f(wx + r * 0.8 * math.cos(a))},{f(wy + r * 0.8 * math.sin(a))} '
        A.add(circ(wx, wy, r), wood, '#9C6C40', woodD, dx=-3, dy=-3,
              inner=path(spokes, st(woodD, 2.6)) + circ(wx, wy, 4.4, f'fill="{hub}" stroke="{hubD}" stroke-width="2"'))
    A.add(rect(46, 156, 108, 18, 7), wood, '#9C6C40', woodD, dx=-3, dy=-4,
          inner=path('M60,160 L60,170 M140,160 L140,170', st(woodD, 2.2)) + rect(50, 158, 100, 3, 1.5, fill(woodL)))
    # bowl
    bowl = path('M64,36 A70,70 0 1 0 136,36 Z')
    pebbles = ''
    cols = ['#CDBA9E', '#B6A68E', '#DCCFBA', '#C2AE90']
    for i, (px, py, pr) in enumerate([(62, 150, 9), (78, 155, 8), (94, 152, 9), (110, 156, 8), (126, 152, 9),
                                      (140, 148, 8), (70, 144, 6), (118, 146, 6), (100, 147, 6)]):
        pebbles += circ(px, py, pr, fill(cols[i % 4]))
    weeds = (path('M76,148 C70,128 82,118 76,98 C86,112 84,128 86,146 Z', f'fill="{weed}" stroke="{weedLine}" '
                  f'stroke-width="2.4" stroke-linejoin="round"') +
             path('M88,148 C90,134 98,128 96,114 C104,126 98,138 96,148 Z', f'fill="{weed}" stroke="{weedLine}" '
                  f'stroke-width="2.4" stroke-linejoin="round"'))
    inner = (rect(20, 54, 160, 120, 0, fill(water)) +
             path('M28,54 Q64,48 100,54 Q136,60 172,54', st('#A9D3DD', 3)) +
             path('M150,70 A60,60 0 0 1 150,150 L180,150 L180,70 Z', fill(waterSh, 0.8)) +
             weeds + pebbles)
    hi = (path('M50,70 A52,52 0 0 0 46,120', st(WHITE, 6)) + circ(56, 132, 3.4, fill(WHITE, 0.9)))
    A.add(bowl, '#F2F9FA', '#E6F2F4', glassLine, dx=0, dy=0, inner=inner)
    # fish (inside the bowl, drawn after the water)
    tail_ang = 0 if step == 0 else -22
    tx, ty = 82, 104
    tp = [rot(x, y, tail_ang, tx, ty) for x, y in [(84, 104), (62, 88), (56, 96), (62, 104), (56, 112), (62, 120)]]
    A.add(ptsd(tp), fish, fishSh, fishLine, dx=-2, dy=-2, sticker=False)
    A.add(path('M98,88 C102,74 116,72 124,82 Z'), fish, fishSh, fishLine, dx=-2, dy=-2, sticker=False)
    A.add(ell(108, 104, 28, 21), fish, fishSh, fishLine, dx=-4, dy=-4, sticker=False,
          hi=hi_blob(100, 94, 9, 4, -15, 0.5))
    A.raw(path('M100,106 Q108,112 104,118', st(fishLine, 2.4)))   # side fin
    eye(A, 122, 98, 0.95)
    cheek(A, 120, 110, 4.5, 3)
    A.raw(path('M130,108 Q134,111 136,107', st(fishLine, 2.4)))
    # bubbles
    for bx, by, br in ((142, 80, 4), (148, 66, 3), (140, 58, 2.4)):
        A.raw(circ(bx, by, br, f'fill="{WHITE}" fill-opacity="0.5" stroke="#8FBCC8" stroke-width="1.6"'))
    # glass highlight + rim on top
    A.raw(hi)
    A.add(ell(100, 36, 38, 8), '#EAF6F8', '#D3EAEE', glassLine, dx=0, dy=-2,
          inner=ell(100, 37, 30, 4.5, 0, fill('#C4E1E8')))
    return A.svg()


ANIMALS = dict(cow=cow, pig=pig, sheep=sheep, duck=duck, hen=hen, horse=horse, goat=goat,
               crab=crab, penguin=penguin, lion=lion, monkey=monkey, fishbowl=fishbowl)


def main():
    d = os.path.join(OUT, 'animals')
    os.makedirs(d, exist_ok=True)
    for name, fn in ANIMALS.items():
        for step, suf in ((0, ''), (1, '_step')):
            s = fn(step)
            assert '<text' not in s and 'href' not in s and '<script' not in s
            with open(os.path.join(d, f'{name}{suf}.svg'), 'w') as fh:
                fh.write(s)
    print('wrote', len(ANIMALS) * 2, 'animal SVGs to', d)


if __name__ == '__main__':
    main()
