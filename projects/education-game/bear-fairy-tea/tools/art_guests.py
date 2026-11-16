#!/usr/bin/env python3
"""Guest art generator for Moka's Fairy Tea Party (character artist C). 100 % original vector art.

Writes (relative to game/assets/default/):
  guests/<a>.svg and guests/<a>_hop.svg  for a in
      forest:     bunny fox deer squirrel owl raccoon mouse hedgehog
      not forest: penguin crab camel goldfish lion
  viewBox 0 0 200 200, BOTTOM ANCHOR (100, 196): the lowest point of the sitting body (outline included) touches y = 196
  (geometry ground line GY = 194 + half the 4 px outline). Each guest SITS like a little plush toy on its leaf placemat,
  front view (camel slight 3/4), baby proportions (big head), body box ~150-186 tall incl. ears.
  The two frames share an identical body / head; `_hop` only changes the arms (paws / wings / claws up) and the face
  (^^ eyes + open happy mouth) — used in the chime wave. goldfish = a goldfish in a round glass bowl (the bowl sits; the
  fish jumps up inside it in _hop).

Usage: python3 tools/art_guests.py [outDir]
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline in a darker tone of the fill (never black), one-step cel
shade (lower right) + one soft highlight (upper left), white sticker outline 6 px round the whole silhouette, muted
natural colours (never the saturated answer colours). No <text>/fonts/scripts/external refs, no filters.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
LW = 4.0          # outline width (viewBox 200)
STK = 6.0         # white sticker margin beyond the outline
GY = 194.0        # geometry ground line: outline (LW/2) reaches 196 = the bottom anchor
W = 200

PUPIL = '#2F2A3A'
WHITE = '#FFFFFF'
CHEEK = '#F2A99A'
MOUTH = '#7A3A32'
TONGUE = '#EE8F84'
NOSE = '#3A2B2B'


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


def mirror(pts):
    return [(200 - x, y) for x, y in pts]


def scallop(cx, cy, rx, ry, n, bump=0.62, a0=0.0):
    """Cloud / mane outline: n round bumps on an ellipse (bumps outward)."""
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
        """One-step cel-shaded shape: shade colour, base colour shifted up-left inside it (shade stays lower right),
        inner details clipped to the shape, then the outline. tpl has '{a}' for the attributes (or is a bare path d)."""
        if tpl.startswith('M'):
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
        """Round-capped tube along d (arms, tails, legs, stalks)."""
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
        o += ell(x, y, 7.8 * s, 9.4 * s, 0, fill(ring))
    o += ell(x, y, 6.2 * s, 7.8 * s, 0, fill(PUPIL))
    o += circ(x + 2.0 * s, y - 2.9 * s, 2.6 * s, fill(WHITE))
    o += circ(x - 2.1 * s, y + 3.0 * s, 1.2 * s, fill(WHITE, 0.9))
    A.raw(o)


def eyes(A, xs, y, s, hop, ring=None, hopcol=PUPIL):
    """Idle: glossy eyes. Hop: happy closed ^^ arcs."""
    for x in xs:
        if hop:
            A.raw(path(f'M{f(x - 7.5 * s)},{f(y + 3 * s)} Q{f(x)},{f(y - 9.5 * s)} {f(x + 7.5 * s)},{f(y + 3 * s)}',
                       st(hopcol, 4.4 * s)))
        else:
            eye(A, x, y, s, ring)


def cheeks(A, xs, y, rx=8.0, ry=5.0, op=0.72):
    for x in xs:
        A.raw(ell(x, y, rx, ry, 0, fill(CHEEK, op)))


def mouth(A, x, y, line, hop, wd=8.0, kind='smile'):
    """Idle: a small smile (or a 'w' cat mouth). Hop: a big open happy mouth with a tongue."""
    if hop:
        w2 = wd * 1.35
        d = f'M{f(x - w2)},{f(y - 1)} Q{f(x)},{f(y + w2 * 1.55)} {f(x + w2)},{f(y - 1)} Z'
        A.raw(path(d, f'fill="{MOUTH}" stroke="{line}" stroke-width="2.8" stroke-linejoin="round"'))
        A.raw(ell(x, y + w2 * 0.62, w2 * 0.5, w2 * 0.3, 0, fill(TONGUE)))
    elif kind == 'w':
        A.raw(path(f'M{f(x - wd)},{f(y)} Q{f(x - wd / 2)},{f(y + 5.5)} {f(x)},{f(y)} '
                   f'Q{f(x + wd / 2)},{f(y + 5.5)} {f(x + wd)},{f(y)}', st(line, 2.8)))
    else:
        A.raw(path(f'M{f(x - wd)},{f(y)} Q{f(x)},{f(y + wd * 0.75)} {f(x + wd)},{f(y)}', st(line, 2.8)))


def nose(A, x, y, w=7.0, h=5.5, col=NOSE):
    A.raw(path(f'M{f(x - w)},{f(y - h * 0.6)} Q{f(x)},{f(y - h * 1.1)} {f(x + w)},{f(y - h * 0.6)} '
               f'Q{f(x + w * 0.4)},{f(y + h)} {f(x)},{f(y + h)} Q{f(x - w * 0.4)},{f(y + h)} {f(x - w)},{f(y - h * 0.6)} Z',
               fill(col)) + ell(x - w * 0.3, y - h * 0.35, w * 0.3, h * 0.22, -10, fill(WHITE, 0.55)))


def feet(A, col, sh, line, pad=None, xs=(74, 126), rx=18, ry=10.5, toes=False):
    """Two round feet, soles towards the viewer, bottoms on the ground line."""
    for x in xs:
        inner = ''
        if pad:
            inner += ell(x, GY - ry + 1.5, rx * 0.5, ry * 0.5, 0, fill(pad))
            if toes:
                for k in (-0.55, 0, 0.55):
                    inner += circ(x + rx * k, GY - ry * 1.55, 2.6, fill(pad))
        A.add(ell(x, GY - ry, rx, ry), col, sh, line, dx=-3, dy=-3, inner=inner)


def body(A, col, sh, line, belly=None, cx=100, cy=162, rx=44, ry=32, extra=''):
    inner = (ell(cx, cy + 6, rx * 0.62, ry * 0.68, 0, fill(belly)) if belly else '') + extra
    A.add(ell(cx, cy, rx, ry), col, sh, line, inner=inner, hi=hi_blob(cx - rx * 0.5, cy - ry * 0.5, 12, 6))


def arms(A, col, line, paw, pawsh, hop, sy=138, w=19, reach=68, lift=44, rest=(21, 158), pr=11.5):
    """Idle: little paws resting on the tummy. Hop: both arms thrown up beside the head."""
    for side in (-1, 1):
        sx = 100 + side * 36
        if hop:
            px, py = 100 + side * reach, sy - lift
            A.tube(f'M{f(sx)},{f(sy + 4)} Q{f(100 + side * (reach - 4))},{f(sy - 4)} {f(px)},{f(py)}', w, line, col)
            A.add(circ(px, py - 3, pr), paw, pawsh, line, dx=-3, dy=-3)
        else:
            px, py = 100 + side * rest[0], rest[1]
            A.tube(f'M{f(100 + side * 36)},{f(sy + 6)} Q{f(100 + side * 36)},{f(py)} {f(px + side * 4)},{f(py)}', w, line, col)
            A.add(ell(px, py, pr + 1, pr - 1.5), paw, pawsh, line, dx=-3, dy=-3)


# ======================================================================= FOREST
def bunny(hop):
    A = Art('bn')
    base, sh, line = '#E8DED2', '#D0C2B2', '#8F7D6A'
    pink, cream = '#EFBDB4', '#FAF5EE'
    A.add(circ(146, 180, 13), cream, '#E8E0D4', line, dx=-3, dy=-3)                   # cotton tail peeking out
    for x, r in ((78, -9), (122, 9)):                                                   # long ears
        A.add(ell(x, 46, 15, 38, r), base, sh, line, dx=-4, dy=-4, inner=ell(x, 50, 7.5, 27, r, fill(pink)))
    body(A, base, sh, line, belly=cream)
    feet(A, base, sh, line, pad=pink, rx=20, toes=True)
    arms(A, base, line, base, sh, hop)
    A.add(ell(100, 102, 50, 45), base, sh, line, hi=hi_blob(76, 78, 13, 6))
    A.raw(ell(91, 121, 12, 9.5, 0, fill(cream)) + ell(109, 121, 12, 9.5, 0, fill(cream)))
    if not hop:
        A.raw(rect(95.5, 125, 9, 8, 2, f'fill="{WHITE}" stroke="{line}" stroke-width="2"'))
    nose(A, 100, 113, 6, 4.6, '#D98E86')
    eyes(A, (79, 121), 98, 1.3, hop)
    cheeks(A, (68, 132), 116)
    mouth(A, 100, 121, line, hop, 7, 'w')
    return A.svg()


def fox(hop):
    A = Art('fx')
    base, sh, line = '#D58A52', '#BB703E', '#7E4524'
    cream, creamSh = '#F7EDE0', '#E6D6C2'
    dark, darkSh, darkLine = '#6E4A3A', '#5A3C2E', '#44302A'
    # bushy tail with a white tip, curling up on the right
    tail = ptsd([(122, 188), (158, 190), (184, 170), (194, 136), (188, 102), (172, 86), (160, 100), (164, 128),
                 (152, 154), (128, 166)])
    A.add(tail, base, sh, line, dx=-5, dy=-5,
          inner=path('M150,104 Q170,112 196,98 L196,70 L150,70 Z', fill(cream)))
    for d, tip in (('M56,86 L48,24 Q47,10 60,14 L106,58 Z', (52, 22)),
                   ('M144,86 L152,24 Q153,10 140,14 L94,58 Z', (148, 22))):
        A.add(d, base, sh, line, dx=-4, dy=-4,
              inner=circ(tip[0], tip[1], 15, fill(dark)) +
              path(('M60,72 L56,34 L90,60 Z' if tip[0] < 100 else 'M140,72 L144,34 L110,60 Z'), fill('#F1D5BC')))
    body(A, base, sh, line, belly=cream)
    feet(A, dark, darkSh, darkLine, pad='#8C6656')
    arms(A, base, line, dark, darkSh, hop)
    mask = path('M44,104 Q72,94 100,116 Q128,94 156,104 Q154,142 100,150 Q46,142 44,104 Z', fill(cream))
    A.add(ell(100, 102, 55, 46), base, sh, line, inner=mask, hi=hi_blob(74, 76, 13, 6))
    nose(A, 100, 117, 7.5, 5.5)
    eyes(A, (77, 123), 95, 1.3, hop)
    cheeks(A, (64, 136), 118)
    mouth(A, 100, 126, darkLine, hop, 7, 'w')
    return A.svg()


def deer(hop):
    A = Art('dr')
    base, sh, line = '#C69468', '#AC7A50', '#6E4C30'
    cream, muz, muzSh = '#F6EBDA', '#ECD7BA', '#D8BF9E'
    nub, nubLine = '#E3CEA8', '#8C7250'
    # little antler nubs (two tiny forks)
    for s in (-1, 1):
        A.tube(f'M{f(100 + s * 18)},66 Q{f(100 + s * 22)},44 {f(100 + s * 30)},24', 11, nubLine, nub)
        A.tube(f'M{f(100 + s * 23)},44 L{f(100 + s * 38)},38', 9, nubLine, nub)
    # leaf ears out to the sides
    for x, r in ((46, -26), (154, 26)):
        A.add(ell(x, 80, 28, 13, r), base, sh, line, dx=-3, dy=-4, inner=ell(x, 81, 18, 6.5, r, fill('#EDC9B6')))
    spots = ''.join(circ(x, y, r, fill(cream)) for x, y, r in
                    ((72, 146, 4.5), (128, 146, 4.5), (62, 166, 3.8), (138, 166, 3.8), (84, 138, 3.2), (116, 138, 3.2)))
    body(A, base, sh, line, belly=cream, extra=spots)
    feet(A, base, sh, line, pad='#6E5040', rx=16)
    arms(A, base, line, '#6E5040', '#5A4032', hop, w=17, pr=10)
    fspots = ''.join(circ(x, y, r, fill(cream)) for x, y, r in ((88, 66, 3.6), (100, 61, 4.2), (112, 66, 3.6)))
    A.add(ell(100, 102, 48, 46), base, sh, line, inner=fspots, hi=hi_blob(78, 76, 12, 6))
    A.add(ell(100, 126, 23, 17), muz, muzSh, line, dx=-4, dy=-4)
    nose(A, 100, 118, 8, 5.5)
    eyes(A, (78, 122), 98, 1.32, hop)
    if not hop:   # tiny lashes
        for x, s in ((78, -1), (122, 1)):
            A.raw(path(f'M{f(x + s * 7)},{f(91)} L{f(x + s * 12)},{f(86)}', st(PUPIL, 2.4)))
    cheeks(A, (64, 136), 116)
    mouth(A, 100, 130, line, hop, 6)
    return A.svg()


def squirrel(hop):
    A = Art('sq')
    base, sh, line = '#B97A4E', '#9E6238', '#653A20'
    cream, creamSh = '#F3E3CC', '#E2CDB0'
    tailc, tailSh = '#C68A5C', '#A86E44'
    # big curled tail rising behind the right side, curling over at the top
    tail = ptsd([(118, 186), (156, 186), (184, 160), (196, 118), (192, 70), (174, 34), (148, 16), (124, 18),
                 (114, 34), (124, 48), (142, 44), (156, 58), (160, 88), (154, 126), (138, 154), (120, 166)])
    fur = path('M178,150 Q186,110 180,72 M168,46 Q150,30 132,30', st(tailSh, 3))
    A.add(tail, tailc, tailSh, line, dx=-6, dy=-6, inner=fur)
    for d, tuft in (('M60,82 L56,36 Q58,26 66,32 L94,62 Z', 'M56,38 Q50,24 58,16 Q60,26 64,30 Z'),
                    ('M140,82 L144,36 Q142,26 134,32 L106,62 Z', 'M144,38 Q150,24 142,16 Q140,26 136,30 Z')):
        A.add(tuft, tailSh, '#8A5030', line, dx=-2, dy=-2)
        A.add(d, base, sh, line, dx=-3, dy=-3, inner=path(d, fill('#E2B494') +
                                                         ' transform="translate(100 60) scale(0.6) translate(-100 -60)"'))
    body(A, base, sh, line, belly=cream)
    feet(A, base, sh, line, pad=creamSh, rx=17)
    if hop:
        arms(A, base, line, base, sh, True)
    else:
        # paws hugging an acorn
        A.add(ell(100, 160, 11, 12), '#C9A06A', '#AE8450', '#7A5630', dx=-3, dy=-3)
        A.add(path('M86,152 Q100,140 114,152 Q100,156 86,152 Z'), '#8A6A44', '#735634', '#5A4026', dx=-2, dy=-2)
        A.raw(path('M100,146 L102,140', st('#5A4026', 3)))
        arms(A, base, line, base, sh, False, rest=(14, 160), pr=10)
    A.add(ell(100, 102, 48, 44), base, sh, line, hi=hi_blob(78, 78, 12, 6),
          inner=ell(100, 124, 30, 20, 0, fill(cream)))
    if not hop:
        A.raw(rect(95.5, 127, 9, 8, 2, f'fill="{WHITE}" stroke="{line}" stroke-width="2"'))
    nose(A, 100, 116, 6, 4.6, '#6A3A2A')
    eyes(A, (78, 122), 97, 1.3, hop)
    cheeks(A, (64, 136), 114)
    mouth(A, 100, 123, line, hop, 7, 'w')
    return A.svg()


def owl(hop):
    A = Art('ow')
    base, sh, line = '#A98B6B', '#8F7253', '#5E4630'
    disc, discSh = '#ECDDC6', '#D9C5A8'
    belly = '#D9C3A4'
    beak, beakSh, beakLine = '#D7A866', '#BD8E4E', '#8A5E2A'
    for d in ('M44,78 L36,20 Q36,12 46,16 L90,52 Z', 'M156,78 L164,20 Q164,12 154,16 L110,52 Z'):   # feather tufts
        A.add(d, base, sh, line, dx=-3, dy=-3)
    # one egg body; belly feathers + facial disc clipped inside
    feathers = ''.join(path(f'M{f(x - 6)},{f(y)} Q{f(x)},{f(y + 6)} {f(x + 6)},{f(y)}', st(sh, 2.6))
                       for x, y in ((86, 150), (100, 146), (114, 150), (80, 164), (93, 162), (107, 162), (120, 164),
                                    (88, 176), (100, 174), (112, 176)))
    discs = (circ(77, 98, 30, fill(disc)) + circ(123, 98, 30, fill(disc)) +
             path('M54,112 Q100,140 146,112', st(discSh, 3)))
    A.add(ell(100, 120, 66, 74), base, sh, line,
          inner=ell(100, 164, 40, 30, 0, fill(belly)) + feathers + discs, hi=hi_blob(66, 70, 12, 6, -35, 0.25))
    # wings
    for s in (-1, 1):
        if hop:
            A.add(ell(100 + s * 70, 104, 14, 34, s * 34), base, sh, line, dx=-3, dy=-3,
                  inner=path(f'M{f(100 + s * 64)},{f(96)} L{f(100 + s * 78)},{f(116)}', st(sh, 2.4)))
        else:
            A.add(ell(100 + s * 60, 146, 15, 34, -s * 12), base, sh, line, dx=-3, dy=-3,
                  inner=path(f'M{f(100 + s * 58)},{f(140)} L{f(100 + s * 62)},{f(162)}', st(sh, 2.4)))
    # feet
    for x in (82, 118):
        A.add(ell(x, GY - 6, 13, 6), beak, beakSh, beakLine, dx=-2, dy=-2,
              inner=path(f'M{f(x - 4)},{f(GY - 6)} L{f(x - 4)},{f(GY - 1)} M{f(x + 4)},{f(GY - 6)} L{f(x + 4)},{f(GY - 1)}',
                         st(beakLine, 2)))
    # big eyes
    for x in (77, 123):
        if hop:
            A.raw(circ(x, 98, 20, f'fill="{WHITE}" stroke="{discSh}" stroke-width="2.5"'))
        else:
            A.raw(circ(x, 98, 20, f'fill="{WHITE}" stroke="{discSh}" stroke-width="2.5"') +
                  circ(x, 98, 15, fill('#D8B577')))
    eyes(A, (77, 123), 98, 1.45, hop)
    A.add('M90,114 Q100,110 110,114 L102,130 Q100,133 98,130 Z', beak, beakSh, beakLine, dx=-2, dy=-2)
    cheeks(A, (58, 142), 122, 7, 4.5)
    if hop:
        mouth(A, 100, 136, line, True, 6)
    return A.svg()


def raccoon(hop):
    A = Art('rc')
    base, sh, line = '#A8A29C', '#8D8781', '#57514D'
    mask, white, belly = '#4F4A49', '#F4F0EB', '#D6D0CA'
    ring = '#5A5452'
    # striped tail on the right
    tail = ptsd([(120, 188), (160, 188), (186, 166), (194, 128), (186, 92), (170, 82), (162, 100), (164, 132),
                 (150, 158), (126, 168)])
    stripes = (path('M146,150 L140,196', st(ring, 11)) + path('M162,138 L200,160', st(ring, 11)) +
               path('M160,112 L200,116', st(ring, 11)) + circ(176, 82, 16, fill(ring)))
    A.add(tail, base, sh, line, dx=-5, dy=-5, inner=stripes)
    for x in (60, 140):
        A.add(ell(x, 52, 20, 22), base, sh, line, dx=-3, dy=-3, inner=ell(x, 55, 11, 13, 0, fill(mask)))
    body(A, base, sh, line, belly=belly)
    feet(A, mask, '#3E3A39', '#2E2A2A', pad='#6E6866')
    arms(A, base, line, mask, '#3E3A39', hop)
    face = (path('M44,108 Q72,100 100,118 Q128,100 156,108 Q154,144 100,150 Q46,144 44,108 Z', fill(white)) +
            ell(78, 76, 16, 7, -8, fill(white)) + ell(122, 76, 16, 7, 8, fill(white)) +
            path('M46,100 Q58,82 80,88 Q96,94 100,100 Q104,94 120,88 Q142,82 154,100 Q148,116 124,116 '
                 'Q108,114 100,106 Q92,114 76,116 Q52,116 46,100 Z', fill(mask)))
    A.add(ell(100, 102, 54, 46), base, sh, line, inner=face, hi=hi_blob(74, 72, 12, 5))
    nose(A, 100, 120, 7.5, 5.5)
    eyes(A, (78, 122), 100, 1.25, hop, ring=None if hop else WHITE, hopcol=WHITE)
    cheeks(A, (64, 136), 126, 7, 4.5)
    mouth(A, 100, 129, line, hop, 7, 'w')
    return A.svg()


def mouse(hop):
    A = Art('ms')
    base, sh, line = '#BFB4AC', '#A4988F', '#6E625A'
    pink, pinkSh = '#EDBBB3', '#D9A096'
    belly = '#F0E9E3'
    A.tube('M128,186 Q168,194 182,170 Q192,148 172,140 Q160,138 162,150', 7.5, '#B58079', pink)    # thin tail
    for x in (52, 148):
        A.add(circ(x, 54, 33), base, sh, line, dx=-4, dy=-4, inner=circ(x + (3 if x < 100 else -3), 57, 21, fill(pink)))
    body(A, base, sh, line, belly=belly)
    feet(A, pink, pinkSh, '#B58079', rx=16, ry=9.5)
    arms(A, base, line, pink, pinkSh, hop, w=17, pr=10)
    A.add(ell(100, 106, 48, 43), base, sh, line, hi=hi_blob(78, 84, 12, 6),
          inner=ell(100, 126, 22, 15, 0, fill(belly)))
    for s in (-1, 1):                 # whiskers
        for dy in (-4, 4):
            A.raw(path(f'M{f(100 + s * 22)},{f(122 + dy * 0.5)} L{f(100 + s * 46)},{f(118 + dy * 1.6)}', st(line, 2.2)))
    nose(A, 100, 118, 6.5, 5, '#D98E86')
    eyes(A, (79, 121), 102, 1.25, hop)
    cheeks(A, (64, 136), 120, 7, 4.5)
    mouth(A, 100, 127, line, hop, 6, 'w')
    return A.svg()


def hedgehog(hop):
    A = Art('hh')
    face, faceSh, faceLine = '#EAD5B6', '#D3BB98', '#8C6A4C'
    sp, spSh, spLine, spTip = '#8F6E54', '#76583F', '#4E3828', '#B59478'
    # spiky ball behind everything
    pts = []
    N = 26
    for i in range(N * 2):
        a = math.pi / 2 + 2 * math.pi * i / (N * 2)
        r = 90 if i % 2 == 0 else 72
        x, y = 100 + r * math.cos(a), 104 + r * 0.94 * math.sin(a)
        pts.append((x, min(y, 178)))
    d = 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'
    tips = ''.join(path(f'M{f(100 + 64 * math.cos(math.pi / 2 + 2 * math.pi * i / N))},'
                        f'{f(104 + 60 * math.sin(math.pi / 2 + 2 * math.pi * i / N))} '
                        f'L{f(100 + 82 * math.cos(math.pi / 2 + 2 * math.pi * i / N))},'
                        f'{f(104 + 77 * math.sin(math.pi / 2 + 2 * math.pi * i / N))}', st(spTip, 3))
                   for i in range(N))
    A.add(path(d), sp, spSh, spLine, dx=-6, dy=-6, inner=tips)
    body(A, face, faceSh, faceLine, belly='#F6EADA', rx=42, ry=30, cy=164)
    feet(A, face, faceSh, faceLine, pad='#C9A988', rx=16)
    arms(A, face, faceLine, face, faceSh, hop, w=17, pr=10, reach=72, lift=40)
    for x in (66, 134):
        A.add(circ(x, 80, 11), face, faceSh, faceLine, dx=-2, dy=-2, inner=circ(x, 81, 5.5, fill('#E8B4A4')))
    A.add(ell(100, 110, 42, 38), face, faceSh, faceLine, hi=hi_blob(82, 90, 10, 5))
    A.add(ell(100, 128, 15, 11), '#F6EADA', faceSh, faceLine, dx=-3, dy=-3)
    nose(A, 100, 123, 8, 6)
    eyes(A, (82, 118), 106, 1.2, hop)
    cheeks(A, (70, 130), 122, 6.5, 4.2)
    mouth(A, 100, 135, faceLine, hop, 6)
    return A.svg()


# ======================================================================= NOT FOREST
def penguin(hop):
    A = Art('pn')
    slate, slateSh, slateLine = '#5B6676', '#4A5463', '#2F3744'
    wh, whSh = '#F7F6F1', '#E3E2DA'
    bk, bkSh, bkLine = '#E2A462', '#C98A48', '#94602A'
    A.raw('')
    A.add('M94,40 C92,24 102,18 108,24 C104,26 102,32 104,40 Z', slate, slateSh, slateLine, dx=-2, dy=-2)   # tuft
    white = (ell(100, 152, 44, 42, 0, fill(wh)) + circ(80, 96, 25, fill(wh)) + circ(120, 96, 25, fill(wh)) +
             ell(100, 116, 36, 26, 0, fill(wh)) + path('M138,140 C138,170 124,190 100,192 C124,180 134,162 138,140 Z',
                                                       fill(whSh)))
    A.add(ell(100, 114, 62, 80), slate, slateSh, slateLine, inner=white, hi=hi_blob(66, 62, 13, 6, -35, 0.25))
    for s in (-1, 1):
        if hop:
            A.add(ell(100 + s * 68, 102, 12, 32, s * 36), slate, slateSh, slateLine, dx=-3, dy=-3)
        else:
            A.add(ell(100 + s * 60, 140, 13, 34, -s * 14), slate, slateSh, slateLine, dx=-3, dy=-3)
    for x in (80, 120):
        A.add(ell(x, GY - 7, 17, 7), bk, bkSh, bkLine, dx=-2, dy=-2)
    eyes(A, (80, 121), 96, 1.3, hop)
    A.add('M86,112 Q100,104 114,112 Q100,126 86,112 Z', bk, bkSh, bkLine, dx=-2, dy=-2)
    cheeks(A, (64, 136), 114)
    if hop:
        mouth(A, 100, 126, slateLine, True, 6)
    return A.svg()


def crab(hop):
    A = Art('cb')
    base, sh, sh2, line = '#E39C86', '#CB826C', '#BC7662', '#9A5644'
    # legs: three per side, the crab sits on them
    for s in (-1, 1):
        for k in range(3):
            hx, hy = 100 + s * (36 + k * 9), 156 + k * 5
            kx, ky = 100 + s * (68 + k * 9), 138 + k * 10
            fx = 100 + s * (74 + k * 7)
            A.tube(f'M{f(hx)},{f(hy)} Q{f(kx)},{f(ky - 8)} {f(fx)},{f(GY - 4)}', 11, line, sh2 if k == 1 else sh)
    # claw arms + eye stalks
    if hop:
        arm_end = {-1: (34, 58), 1: (166, 58)}
        for s in (-1, 1):
            A.tube(f'M{f(100 + s * 40)},140 Q{f(100 + s * 82)},116 {f(arm_end[s][0])},{f(arm_end[s][1] + 14)}', 14, line, base)
    else:
        arm_end = {-1: (28, 122), 1: (172, 122)}
        for s in (-1, 1):
            A.tube(f'M{f(100 + s * 40)},150 Q{f(100 + s * 66)},150 {f(arm_end[s][0])},{f(arm_end[s][1] + 14)}', 14, line, base)
    A.tube('M86,128 L80,70', 10, line, base)
    A.tube('M114,128 L120,70', 10, line, base)
    A.add(ell(100, 152, 62, 38), base, sh, line, hi=hi_blob(74, 132, 20, 8),
          inner=path('M50,170 Q100,196 150,170', st(sh2, 3)))
    # pincers (open, friendly)
    for s in (-1, 1):
        px, py, r = arm_end[s][0], arm_end[s][1], 19
        a1, a2 = ((-28, -82) if s > 0 else (-98, -152)) if hop else ((-20, -74) if s > 0 else (-106, -160))
        P = lambda a: (px + r * math.cos(math.radians(a)), py + r * math.sin(math.radians(a)))
        p1, p2 = P(a1), P(a2)
        apx, apy = px + 3 * s, py - 1
        claw = path(f'M{f(p1[0])},{f(p1[1])} L{f(apx)},{f(apy)} L{f(p2[0])},{f(p2[1])} '
                    f'A{f(r)},{f(r)} 0 1 0 {f(p1[0])},{f(p1[1])} Z')
        A.add(claw, base, sh, line, dx=-3, dy=-3, hi=ell(px - 6 * s, py + 5, 6, 3.4, -30, fill(WHITE, 0.4)))
    for x in (78, 122):
        A.add(circ(x, 62, 17), WHITE, '#EFE6E2', line, dx=-2, dy=-2)
    eyes(A, (79, 121), 63, 1.15, hop)
    cheeks(A, (72, 128), 156, 8, 5)
    mouth(A, 100, 150, line, hop, 10)
    return A.svg()


def camel(hop):
    A = Art('cm')
    base, sh, line = '#D4AF82', '#BA956A', '#7E6042'
    light, tuft, tuftSh = '#EFDCBE', '#A67C52', '#8A6440'
    hoof, hoofSh, hoofLine = '#8C6E52', '#74583F', '#56402C'
    # body + one big hump in a single silhouette (sitting kush pose, slight 3/4 facing right)
    A.tube('M30,160 Q16,166 18,184', 7, line, base)                                   # little tail
    A.add(ell(18, 186, 6, 8), tuft, tuftSh, '#6A4C30', dx=-2, dy=-2)
    sil = ptsd([(26, 178), (30, 150), (44, 120), (58, 90), (80, 74), (102, 86), (114, 118), (132, 136), (156, 150),
                (162, 172), (150, 190), (100, 192), (44, 192)])
    A.add(sil, base, sh, line, inner=ell(96, 182, 46, 13, 0, fill(light)) +
          path('M50,124 Q72,96 100,104', st(sh, 2.6)), hi=hi_blob(64, 92, 13, 6, -35))
    # neck in front, rising to the head
    A.add(ptsd([(116, 156), (120, 114), (130, 92), (160, 92), (166, 120), (162, 160)]), base, sh, line, dx=-5, dy=-5,
          inner=ell(142, 140, 14, 22, 0, fill(light)))
    feet(A, base, sh, line, pad=hoof, xs=(86, 136), rx=17)
    if hop:
        for sx, sy, px, py in ((110, 152, 80, 108), (166, 150, 186, 104)):
            A.tube(f'M{f(sx)},{f(sy)} Q{f((sx + px) / 2 + (8 if px > 100 else -8))},{f(sy - 8)} {f(px)},{f(py)}', 17, line, base)
            A.add(ell(px, py - 4, 10, 9), hoof, hoofSh, hoofLine, dx=-2, dy=-2)
    for x, r in ((112, -32), (176, 32)):
        A.add(ell(x, 48, 14, 7, r), base, sh, line, dx=-2, dy=-2, inner=ell(x, 49, 8, 3, r, fill('#E8BFA8')))
    A.add(ell(144, 68, 37, 34), base, sh, line, hi=hi_blob(126, 50, 10, 5))
    A.add(path(scallop(144, 37, 18, 9, 7, 0.75, 180)), tuft, tuftSh, '#6A4C30', dx=-2, dy=-2)
    A.add(ell(148, 96, 27, 19), light, '#DCC5A2', line, dx=-4, dy=-4)
    A.raw(ell(138, 90, 3.4, 2.2, 20, fill(line)) + ell(158, 90, 3.4, 2.2, -20, fill(line)))
    eyes(A, (130, 158), 66, 1.15, hop)
    if not hop:   # long camel lashes at the outer corners
        for x, s in ((130, -1), (158, 1)):
            A.raw(path(f'M{f(x + s * 6)},{f(61)} L{f(x + s * 11)},{f(58)} M{f(x + s * 7)},{f(65)} L{f(x + s * 12)},{f(64)}',
                       st(PUPIL, 2.2)))
    cheeks(A, (118, 172), 82, 6.5, 4.2)
    mouth(A, 148, 103, line, hop, 8)
    return A.svg()


def goldfish(hop):
    A = Art('gf')
    glassLine = '#7FA3AE'
    water, waterSh = '#D7ECF1', '#C1DFE7'
    fish, fishSh, fishLine, fishL = '#F0B880', '#D99D66', '#A8693A', '#F9D9B4'
    weed, weedLine = '#9DBE94', '#5F8A5C'
    # stand + bowl (the bowl SITS; identical in both frames)
    A.add(rect(66, 182, 68, 12, 5), '#CDBFA8', '#B6A68C', '#857358', dx=-3, dy=-3)
    R, CY = 82, 110
    top, bot = 40, 186
    hwt, hwb = math.sqrt(R * R - (CY - top) ** 2), math.sqrt(R * R - (bot - CY) ** 2)
    bowl = (f'M{f(100 - hwt)},{f(top)} A{R},{R} 0 0 0 {f(100 - hwb)},{f(bot)} '
            f'L{f(100 + hwb)},{f(bot)} A{R},{R} 0 0 0 {f(100 + hwt)},{f(top)} Z')
    pebbles = ''.join(circ(px, py, pr, fill(c)) for px, py, pr, c in
                      ((60, 178, 10, '#CDBA9E'), (78, 182, 9, '#B6A68E'), (96, 180, 10, '#DCCFBA'),
                       (114, 183, 9, '#C2AE90'), (132, 179, 10, '#CDBA9E'), (148, 176, 8, '#B6A68E'),
                       (70, 172, 6, '#DCCFBA'), (124, 172, 6, '#DCCFBA')))
    weeds = (path('M58,176 C50,150 64,136 56,110 C68,126 68,150 68,174 Z',
                  f'fill="{weed}" stroke="{weedLine}" stroke-width="2.4" stroke-linejoin="round"') +
             path('M142,176 C146,156 156,148 150,128 C162,144 156,160 152,176 Z',
                  f'fill="{weed}" stroke="{weedLine}" stroke-width="2.4" stroke-linejoin="round"'))
    inner = (rect(0, 58, 200, 140, 0, fill(water)) + path('M20,58 Q60,52 100,58 Q140,64 180,58', st('#A9D3DD', 3)) +
             path('M160,70 A70,70 0 0 1 150,176 L200,176 L200,70 Z', fill(waterSh, 0.8)) + weeds + pebbles)
    A.add(path(bowl), '#F2F9FA', '#E6F2F4', glassLine, dx=0, dy=0, inner=inner)
    # the fish (front-ish 3/4 facing right); jumps up in _hop
    fy = 92 if hop else 116
    ta = -18 if hop else 0
    tp = [(80, fy), (54, fy - 24), (46, fy - 10), (54, fy), (46, fy + 12), (54, fy + 24)]
    ca, sa = math.cos(math.radians(ta)), math.sin(math.radians(ta))
    tp = [(80 + (x - 80) * ca - (y - fy) * sa, fy + (x - 80) * sa + (y - fy) * ca) for x, y in tp]
    A.add(ptsd(tp), fish, fishSh, fishLine, dx=-2, dy=-2, sticker=False)
    A.add(f'M88,{f(fy - 22)} C92,{f(fy - 42)} 116,{f(fy - 44)} 124,{f(fy - 22)} Z', fish, fishSh, fishLine, dx=-2, dy=-2,
          sticker=False)
    A.add(ell(104, fy, 36, 28), fish, fishSh, fishLine, dx=-5, dy=-5, sticker=False,
          inner=path(f'M76,{f(fy - 12)} Q84,{f(fy)} 76,{f(fy + 12)}', st(fishSh, 2.6)),
          hi=hi_blob(94, fy - 14, 11, 5, -15, 0.5))
    if hop:
        A.add(ell(98, fy + 18, 7, 12, -40), fish, fishSh, fishLine, dx=-2, dy=-2, sticker=False)
    else:
        A.add(ell(100, fy + 14, 6, 11, 30), fish, fishSh, fishLine, dx=-2, dy=-2, sticker=False)
    eyes(A, (104, 126), fy - 4, 1.05, hop)
    cheeks(A, (96, 134), fy + 9, 5, 3.4)
    if hop:
        mouth(A, 118, fy + 12, fishLine, True, 5)
    else:
        A.raw(ell(122, fy + 13, 3.6, 3.0, 0, f'fill="{MOUTH}" stroke="{fishLine}" stroke-width="2"'))
    for bx, by, br in (((146, 74, 4), (154, 60, 3), (140, 50, 2.4)) if not hop else
                       ((60, 30, 4.5), (140, 26, 4), (100, 18, 3.4))):
        A.raw(circ(bx, by, br, f'fill="{WHITE}" fill-opacity="0.55" stroke="#8FBCC8" stroke-width="1.6"'))
    A.raw(path('M44,78 A62,62 0 0 0 40,140', st(WHITE, 6)) + circ(46, 152, 3.6, fill(WHITE, 0.9)))
    A.add(ell(100, top, hwt + 2, 7), '#EAF6F8', '#D3EAEE', glassLine, dx=0, dy=-2,
          inner=ell(100, top + 1, hwt - 7, 3.8, 0, fill('#C4E1E8')))
    return A.svg()


def lion(hop):
    A = Art('ln')
    base, sh, line = '#DDB47E', '#C59A64', '#8A6238'
    mane, maneSh, maneLine = '#B98450', '#9E6C3C', '#6E4524'
    muz = '#F6E6CA'
    A.tube('M126,184 Q172,190 182,156 Q188,134 180,120', 9, line, base)
    A.add(ptsd([(180, 128), (170, 118), (174, 102), (188, 102), (192, 116)]), mane, maneSh, maneLine, dx=-2, dy=-2)
    A.add(path(scallop(100, 100, 64, 60, 14, 0.62, 0)), mane, maneSh, maneLine, dx=-6, dy=-6,
          hi=hi_blob(66, 58, 12, 6, -30, 0.3))
    body(A, base, sh, line, belly='#EED3A8')
    feet(A, base, sh, line, pad='#EBCB9E', toes=True)
    arms(A, base, line, base, sh, hop, reach=74, lift=40)
    for x in (66, 134):
        A.add(circ(x, 62, 13), base, sh, line, dx=-2, dy=-2, inner=circ(x, 63, 6.5, fill('#E9B49A')))
    A.add(circ(100, 104, 44), base, sh, line, hi=hi_blob(82, 82, 11, 5))
    A.flat(ell(90, 122, 13, 10), muz)
    A.flat(ell(110, 122, 13, 10), muz)
    nose(A, 100, 114, 8, 5.5, '#8A5A48')
    for x, y in ((84, 122), (88, 127), (112, 127), (116, 122)):
        A.raw(circ(x, y, 1.4, fill(line)))
    eyes(A, (82, 118), 100, 1.25, hop)
    cheeks(A, (70, 130), 116, 6.5, 4.2)
    mouth(A, 100, 128, line, hop, 7, 'w')
    return A.svg()


GUESTS = dict(bunny=bunny, fox=fox, deer=deer, squirrel=squirrel, owl=owl, raccoon=raccoon, mouse=mouse,
              hedgehog=hedgehog, penguin=penguin, crab=crab, camel=camel, goldfish=goldfish, lion=lion)
BANNED = ('#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0')


def main():
    d = os.path.join(OUT, 'guests')
    os.makedirs(d, exist_ok=True)
    for name, fn in GUESTS.items():
        for hop, suf in ((False, ''), (True, '_hop')):
            s = fn(hop)
            assert '<text' not in s and 'href' not in s and '<script' not in s, name
            assert not any(c.lower() in s.lower() for c in BANNED), name
            with open(os.path.join(d, f'{name}{suf}.svg'), 'w') as fh:
                fh.write(s)
    print('wrote', len(GUESTS) * 2, 'guest SVGs to', d)


if __name__ == '__main__':
    main()
