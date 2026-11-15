#!/usr/bin/env python3
"""Character art generator for Nim's River Hop (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/nim_{idle,blink,talk,happy,cheer,think,oops,crouch,jump,roll,wave,giggle,dance}.svg + nim_title.svg
        0 0 300 300, FEET ANCHOR (150,290). Nim = a small round baby hedgehog standing on 4 tiny paws, 3/4 view facing
        RIGHT, eyes on the child, a mustard scarf. The spine coat, face, chest, scarf and ears are identical in every
        standing frame; only the face features (eyes, mouth, brows, a small tilt of the features), the front paws and
        (dance) one foot change. crouch = the same Nim squashed (scale 1.02 x 0.88 about the feet); jump = stretched,
        tilted up, paws tucked, spines flowing back; roll = a round spiky ball centred (150,200), r 88, face peeking.
  characters/fish.svg, fish_flip.svg      0 0 140 100, centre anchor (70,50), facing RIGHT
  characters/frog.svg, frog_croak.svg     0 0 140 120, feet anchor (70,112), on a lily pad
  icon.svg                                0 0 512 512, full bleed, opaque, no text
Also writes game/js/nim_points.js (NH.NIM_POINTS).

Usage: python3 tools/art_nim.py   then   node tools/nim_sheet.js
Style (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone (never black), one-step cel shade
(lower right) + one soft highlight (upper left); no <text>/fonts/scripts/external refs, no filters.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
JS_OUT = os.path.join(ROOT, 'game', 'js', 'nim_points.js')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Nim palette (DESIGN.md section 3, exact hex) — never an answer colour
    'sp': '#8A5A3C', 'spSh': '#6B4229', 'spLine': '#4E2F1D', 'spTip': '#B88760',
    'face': '#F6E3C8', 'faceSh': '#E2C9A6', 'faceLine': '#9C7A5A',
    'nose': '#5A3A2E', 'pupil': '#2A1E1A', 'white': '#FFFFFF', 'cheek': '#F4A7A0',
    'paw': '#D9B48F', 'pawSh': '#C49D76', 'pawLine': '#8E6A48',
    'scarf': '#E3B65A', 'scarfSh': '#CDA04A', 'scarfLine': '#A9812E',
    'mouth': '#7A3E3A', 'tongue': '#EE9A92', 'ear': '#E9C9A6', 'earIn': '#E7A79C',
    'apple': '#E77A6E', 'appleSh': '#CF6257', 'appleLine': '#A9473F', 'leaf': '#8DBB82', 'leafLine': '#5F8A57',
    'stem': '#7A5236',
}

FEET = (150, 290)
COAT = (128, 168, 92, 90)          # spine-coat base ellipse cx, cy, rx, ry
PIVOT = (232, 176)                 # face-feature tilt pivot
EYE_N = (203, 156, 14.5)
EYE_F = (246, 150, 11)
NOSE = (279, 176)
MOUTH = (264, 198)
SH_N = (192, 240)                  # near shoulder (under the scarf)
SH_F = (236, 238)                  # far shoulder
CROUCH = (1.02, 0.88)              # crouch scale (x, y) about the feet
JUMP_T = 'rotate(-7 140 175) translate(140 175) scale(0.95 1.07) translate(-140 -175)'
ROLL_C, ROLL_R = (150, 200), 88

# back slots: on the spines (fruit centre ~10 px inside the tuft tips), angle on the coat ellipse
SLOT_ANG = (-80, -110, -140, -166)
SLOT_RX, SLOT_RY = 88, 86
ROLL_SLOT_ANG = (-95, -150, -35, 160)
ROLL_SLOT_R = 70


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


def ell_d(cx, cy, rx, ry):
    """Ellipse as a clockwise path (same winding as the tufts, so a nonzero union never has holes)."""
    return (f'M{f(cx - rx)},{f(cy)} A{f(rx)},{f(ry)} 0 1 1 {f(cx + rx)},{f(cy)} '
            f'A{f(rx)},{f(ry)} 0 1 1 {f(cx - rx)},{f(cy)} Z')


class Doc:
    """Collects <defs> with unique ids (the prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='n'):
        self.prefix, self.defs, self.n = prefix, [], 0

    def uid(self, k='g'):
        self.n += 1
        return f'{self.prefix}{k}{self.n}'

    def add(self, kind, inner, attrs=''):
        i = self.uid(kind[0])
        self.defs.append(f'<{kind} id="{i}" {attrs}>{inner}</{kind}>')
        return i

    def clip(self, inner):
        return self.add('clipPath', inner)

    def solid(self, d, base, shade, line, dx=-10, dy=-9, w=LW, hi='', inner=''):
        """Union-outlined cel-shaded shape from a (possibly multi-subpath) path d: a thick stroke underneath (so only
        the silhouette shows), then the shade colour, then the base colour shifted up-left inside a clip."""
        cid = self.clip(f'<path d="{d}"/>')
        o = path(d, f'fill="{line}" stroke="{line}" stroke-width="{f(2 * w)}" stroke-linejoin="round"') if w else ''
        o += path(d, f'fill="{shade}"')
        o += (f'<g clip-path="url(#{cid})"><path d="{d}" fill="{base}" transform="translate({f(dx)},{f(dy)})"/>'
              f'{hi}{inner}</g>')
        return o


# ======================================================================= spines
def tuft_d(bx, by, ang, T, h):
    """A soft petal-like tuft: base centre (bx,by), pointing at angle ang (deg), length T, half-width h.
    Clockwise like ell_d."""
    loc = [(0, -h), (T * 0.5, -h * 1.15), (T * 0.95, -h * 0.55), (T, 0), (T * 0.95, h * 0.55), (T * 0.5, h * 1.15), (0, h)]
    pts = [rot(x, y, ang) for x, y in loc]
    pts = [(bx + x, by + y) for x, y in pts]
    p = pts
    return (f'M{f(p[0][0])},{f(p[0][1])} C{f(p[1][0])},{f(p[1][1])} {f(p[2][0])},{f(p[2][1])} {f(p[3][0])},{f(p[3][1])} '
            f'C{f(p[4][0])},{f(p[4][1])} {f(p[5][0])},{f(p[5][1])} {f(p[6][0])},{f(p[6][1])} Z')


def tuft_mark(bx, by, ang, T, h):
    """Open tuft outline (texture inside the coat)."""
    loc = [(0, -h), (T * 0.55, -h * 1.1), (T, -h * 0.35), (T, 0), (T, h * 0.35), (T * 0.55, h * 1.1), (0, h)]
    p = [(bx + x, by + y) for x, y in (rot(a, b, ang) for a, b in loc)]
    return (f'M{f(p[0][0])},{f(p[0][1])} C{f(p[1][0])},{f(p[1][1])} {f(p[2][0])},{f(p[2][1])} {f(p[3][0])},{f(p[3][1])} '
            f'C{f(p[4][0])},{f(p[4][1])} {f(p[5][0])},{f(p[5][1])} {f(p[6][0])},{f(p[6][1])}')


def coat(doc, bend=0.0):
    """The spine coat: base ellipse + a ring of tufts from the forehead over the back to the rump."""
    cx, cy, rx, ry = COAT
    d = ell_d(cx, cy, rx, ry)
    tips = []
    n = 24
    a0, a1 = -34, -262
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        r = math.radians(a)
        bx, by = cx + (rx - 12) * math.cos(r), cy + (ry - 12) * math.sin(r)
        lower = max(0.0, math.sin(r))                # 0 on the top half, -> 1 at the bottom
        T = 34 - 18 * lower ** 1.5
        h = 15.5 - 3 * lower
        ang = a + bend * (1 - lower)
        d += ' ' + tuft_d(bx, by, ang, T, h)
        tips.append((bx, by, ang, T, h, a))
    # texture: two inner rows of open tuft marks (offset half a step), skipping the face zone
    marks = ''
    for (k, Tm, hm, off) in ((0.70, 22, 9, 0.5), (0.42, 18, 8, 0.0)):
        m = 14 if k > 0.5 else 11
        span = -210 if k > 0.5 else -330
        for i in range(m):
            a = -40 + span * (i + off) / (m - 0.5)
            r = math.radians(a)
            bx, by = cx + rx * k * math.cos(r), cy + ry * k * math.sin(r)
            if bx > 152 and by > 100:      # under the face
                continue
            if by > 228:                   # near the bottom edge
                continue
            marks += tuft_mark(bx, by, a + bend * 0.6, Tm, hm) + ' '
    inner = path(marks, st(P['spSh'], 3.2) + ' opacity=".85"') if marks else ''
    # tip highlights on the upper tufts
    hl = ''
    for (bx, by, ang, T, h, a) in tips:
        if math.sin(math.radians(a)) < -0.15 or math.cos(math.radians(a)) < -0.6:
            x0, y0 = bx + rot(T * 0.45, 0, ang)[0], by + rot(T * 0.45, 0, ang)[1]
            x1, y1 = bx + rot(T * 0.8, 0, ang)[0], by + rot(T * 0.8, 0, ang)[1]
            hl += f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)} '
    inner += path(hl, st(P['spTip'], 3.6))
    hi = ell(88, 104, 34, 18, f'fill="{P["spTip"]}" opacity=".45" transform="rotate(-38 88 104)"')
    return doc.solid(d, P['sp'], P['spSh'], P['spLine'], dx=-5, dy=-12, hi=hi, inner=inner)


def fringe(doc, bend=0.0):
    """Forehead fringe: a few tufts that come down over the top of the face."""
    d = ''
    base = [(166, 140, -128, 30, 13), (186, 124, -112, 31, 13.5), (208, 114, -96, 28, 13), (230, 112, -76, 22, 11.5)]
    for (bx, by, a, T, h) in base:
        d += tuft_d(bx, by, a + bend, T, h) + ' '
    d += ptsd([(156, 150), (178, 124), (206, 110), (236, 108), (240, 122), (210, 130), (182, 144), (162, 160)])
    hl = ''
    for (bx, by, a, T, h) in base[:3]:
        x0, y0 = bx + rot(T * 0.45, 0, a + bend)[0], by + rot(T * 0.45, 0, a + bend)[1]
        x1, y1 = bx + rot(T * 0.8, 0, a + bend)[0], by + rot(T * 0.8, 0, a + bend)[1]
        hl += f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)} '
    return doc.solid(d, P['sp'], P['spSh'], P['spLine'], dx=-6, dy=-6, inner=path(hl, st(P['spTip'], 3.4)))


# ======================================================================= face + body
FACE_PTS = [(160, 124), (196, 104), (230, 104), (254, 122), (268, 148), (283, 164), (290, 178), (282, 192), (264, 205),
            (244, 215), (220, 223), (192, 225), (166, 214), (152, 190), (150, 156)]
CHEST_PTS = [(156, 212), (198, 224), (236, 220), (248, 244), (238, 268), (200, 280), (160, 276), (140, 256), (142, 232)]


def ears(doc, which):
    o = ''
    if which == 'far':
        o += ell(246, 114, 9, 10.5, fl(P['ear'], P['faceLine'], 3.6) + ' transform="rotate(20 246 114)"')
        o += ell(246, 115, 4.2, 5.5, f'fill="{P["earIn"]}" transform="rotate(20 246 115)"')
    else:
        o += ell(166, 140, 12, 14, fl(P['ear'], P['faceLine'], 4) + ' transform="rotate(-25 166 140)"')
        o += ell(167, 141, 6, 8, f'fill="{P["earIn"]}" transform="rotate(-25 167 141)"')
    return o


def face_shape(doc):
    hi = ell(196, 128, 20, 9, 'fill="#FFFFFF" opacity=".55" transform="rotate(-20 196 128)"')
    return doc.solid(ptsd(FACE_PTS), P['face'], P['faceSh'], P['faceLine'], dx=-8, dy=-8, hi=hi)


def chest(doc):
    return doc.solid(ptsd(CHEST_PTS), P['face'], P['faceSh'], P['faceLine'], dx=-9, dy=-8)


def scarf(doc):
    o = ''
    # tails behind the knot, fluttering back (left)
    o += path(ptsd([(176, 226), (150, 238), (128, 250), (124, 262), (138, 262), (160, 250), (182, 236)]),
              fl(P['scarfSh'], P['scarfLine'], 3.6))
    o += path(ptsd([(178, 230), (160, 248), (150, 268), (160, 274), (172, 258), (186, 238)]),
              fl(P['scarf'], P['scarfLine'], 3.6))
    o += path('M156,266 L165,256 M144,256 L156,248', st(P['scarfSh'], 2.4))
    # the band around the neck
    band = ptsd([(150, 206), (200, 220), (250, 210), (256, 222), (248, 236), (200, 244), (148, 228), (144, 216)])
    o += doc.solid(band, P['scarf'], P['scarfSh'], P['scarfLine'], dx=-4, dy=-5, w=3.6)
    o += path('M156,222 Q200,236 246,224', st(P['scarfSh'], 2.6))
    for (x, y) in ((168, 222), (196, 230), (226, 228), (243, 220)):
        o += circ(x, y, 2.4, 'fill="#F3D48E"')
    # knot
    o += ell(182, 232, 11, 9.5, fl(P['scarf'], P['scarfLine'], 3.4))
    o += path('M176,229 Q182,234 188,229', st(P['scarfSh'], 2.2))
    return o


def foot(x, y, rx=17, ry=9.5, a=0):
    tr = f' transform="rotate({f(a)} {f(x)} {f(y)})"' if a else ''
    o = ell(x, y, rx, ry, fl(P['paw'], P['pawLine'], 3.8) + tr)
    o += path(f'M{f(x + rx * 0.2)},{f(y + ry * 0.1)} L{f(x + rx * 0.25)},{f(y + ry * 0.85)} '
              f'M{f(x + rx * 0.55)},{f(y)} L{f(x + rx * 0.6)},{f(y + ry * 0.75)}', st(P['pawLine'], 2) + tr)
    return o


def feet_far():
    return foot(86, 279.5, 15, 8.5) + foot(232, 279.5, 15, 8.5)


def feet_near(lift=False):
    o = foot(112, 279)
    o += foot(206, 268, 17, 9.5, -16) if lift else foot(206, 279)
    return o


# ----------------------------------------------------------------- face features
EYE_MODES = {}


def eye(cx, cy, r, mode, look):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.1 if mode == 'wide' else 1)
        o += circ(cx, cy, rr, f'fill="{P["pupil"]}"')
        px, py = cx + look[0] * r / 12, cy + look[1] * r / 12
        o += circ(px - rr * 0.3, py - rr * 0.34, rr * 0.36, 'fill="#FFFFFF"')
        o += circ(px + rr * 0.34, py + rr * 0.36, rr * 0.15, 'fill="#FFFFFF"')
    elif mode == 'closed':
        o += path(f'M{f(cx - r * 0.9)},{f(cy)} Q{f(cx)},{f(cy + r * 0.8)} {f(cx + r * 0.9)},{f(cy)}', st(P['pupil'], 4))
    elif mode == 'happy':
        o += path(f'M{f(cx - r * 0.9)},{f(cy + r * 0.35)} Q{f(cx)},{f(cy - r * 0.95)} {f(cx + r * 0.9)},{f(cy + r * 0.35)}',
                  st(P['pupil'], 4.4))
    return o


def mouth(mode, mx=MOUTH[0], my=MOUTH[1], k=1.0):
    ln = P['nose']
    o = path(f'M{f(NOSE[0] - 3)},{f(NOSE[1] + 7)} Q{f(mx + 1)},{f(my - 7)} {f(mx)},{f(my - 3)}', st(ln, 2.6)) if k == 1 else ''
    if mode == 'smile':
        o += path(f'M{f(mx - 12 * k)},{f(my - 3 * k)} Q{f(mx - 6 * k)},{f(my + 5 * k)} {f(mx)},{f(my - 3 * k)} '
                  f'Q{f(mx + 5 * k)},{f(my + 4 * k)} {f(mx + 10 * k)},{f(my - 4 * k)}', st(ln, 3))
    elif mode == 'talk':
        o += path(f'M{mx - 11},{my - 3} Q{mx},{my - 1} {mx + 9},{my - 5} Q{mx + 8},{my + 10} {mx},{my + 10} '
                  f'Q{mx - 9},{my + 9} {mx - 11},{my - 3} Z', fl(P['mouth'], ln, 2.6))
        o += ell(mx - 1, my + 6, 5, 2.8, f'fill="{P["tongue"]}"')
    elif mode == 'big':
        w, h = 14 * k, 14 * k
        o += path(f'M{f(mx - w)},{f(my - 4 * k)} Q{f(mx)},{f(my)} {f(mx + w - 2)},{f(my - 6 * k)} '
                  f'Q{f(mx + w * 0.8)},{f(my + h)} {f(mx)},{f(my + h)} Q{f(mx - w * 0.8)},{f(my + h)} {f(mx - w)},{f(my - 4 * k)} Z',
                  fl(P['mouth'], ln, 2.6))
        o += path(f'M{f(mx - 6 * k)},{f(my + h - 3 * k)} Q{f(mx)},{f(my + 5 * k)} {f(mx + 6 * k)},{f(my + h - 3 * k)} '
                  f'Q{f(mx)},{f(my + h + 1)} {f(mx - 6 * k)},{f(my + h - 3 * k)} Z', f'fill="{P["tongue"]}"')
    elif mode == 'o':
        o += ell(mx, my + 3, 5, 6, fl(P['mouth'], ln, 2.6))
    elif mode == 'hmm':
        o += path(f'M{mx - 11},{my + 1} Q{mx - 5},{my - 4} {mx},{my + 1} Q{mx + 5},{my + 5} {mx + 9},{my}', st(ln, 3))
    return o


#            eyes      mouth   tilt  brows     look      near paw / far paw   lift
POSES = {
    'idle':   ('open',   'smile',  0,  None,     (-1, 1),  'rest', 'rest',  False),
    'blink':  ('closed', 'smile',  0,  None,     (-1, 1),  'rest', 'rest',  False),
    'talk':   ('open',   'talk',   0,  None,     (-1, 1),  'rest', 'rest',  False),
    'happy':  ('wide',   'big',    0,  None,     (0, 0),   'rest', 'rest',  False),
    'cheer':  ('happy',  'big',    0,  None,     (0, 0),   'up',   'up',    False),
    'think':  ('look',   'hmm',    7,  (6, 1),   (3, -4),  'chin', 'rest',  False),
    'oops':   ('wide',   'o',     -8,  (1, 6),   (-1, 0),  'up2',  'rest',  False),
    'wave':   ('open',   'big',    0,  None,     (-1, 1),  'wave', 'rest',  False),
    'giggle': ('happy',  'big',    5,  None,     (0, 0),   'mouth', 'rest', False),
    'dance':  ('happy',  'big',   -6,  None,     (0, 0),   'up',   'out',   True),
    'title':  ('wide',   'big',   -4,  None,     (-1, 1),  'wave', 'rest',  False),
    'crouch': ('look',   'smile',  0,  (3, 3),   (4, -1),  'rest', 'rest',  False),
}
PAW_N = {'rest': (198, 254), 'up': (150, 186), 'up2': (156, 196), 'chin': (246, 214), 'wave': (144, 176),
         'mouth': (258, 208), 'out': (160, 250)}
PAW_F = {'rest': (240, 252), 'up': (278, 202), 'out': (282, 246)}


def head_pt(x, y, tilt):
    return rot(x, y, tilt, *PIVOT) if tilt else (x, y)


def features(pose):
    eyes, mo, tilt, brows, look, _n, _f, _l = POSES[pose]
    o = ''
    o += ell(214, 186, 13, 8, f'fill="{P["cheek"]}" opacity=".9"')
    o += ell(255, 181, 6, 4, f'fill="{P["cheek"]}" opacity=".7"')
    o += mouth(mo)
    nx, ny = NOSE
    o += ell(nx, ny, 9.5, 7.5, fl(P['nose'], '#3E2820', 2))
    o += ell(nx - 3, ny - 3, 3.4, 2, 'fill="#FFFFFF" opacity=".6"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 9 - lift
            o += path(f'M{f(cx - 6)},{f(y + 2)} Q{f(cx)},{f(y - 3)} {f(cx + 6)},{f(y + 2)}', st(P['spSh'], 3.4))
    if tilt:
        o = f'<g transform="rotate({tilt} {PIVOT[0]} {PIVOT[1]})">{o}</g>'
    return o


def arm(sh, paw_xy, waving=False):
    mx, my = (sh[0] + paw_xy[0]) / 2, (sh[1] + paw_xy[1]) / 2 + 4
    d = f'M{f(sh[0])},{f(sh[1])} Q{f(mx)},{f(my)} {f(paw_xy[0])},{f(paw_xy[1])}'
    o = path(d, st(P['pawLine'], 22)) + path(d, st(P['paw'], 22 - 2 * 3.8))
    x, y = paw_xy
    o += circ(x, y, 12.5, fl(P['paw'], P['pawLine'], 3.8))
    o += circ(x - 3.5, y - 4, 4.5, 'fill="#EBD0B2"')
    if waving:
        o += path(f'M{f(x - 24)},{f(y - 14)} Q{f(x - 30)},{f(y)} {f(x - 24)},{f(y + 12)} '
                  f'M{f(x - 34)},{f(y - 20)} Q{f(x - 42)},{f(y)} {f(x - 34)},{f(y + 18)}', st('#FFFFFF', 3.4) + ' opacity=".9"')
    return o


def apple(cx, cy, w=46, ang=0):
    """The fruit reward (same look as StoneArt's apple)."""
    s = w / 46
    o = ''
    body = ptsd([(0, -15), (12, -20), (22, -10), (22, 6), (12, 20), (0, 17), (-12, 20), (-22, 6), (-22, -10), (-12, -20)])
    o += path(body, fl(P['apple'], P['appleLine'], 3.6 / s))
    o += path('M10,-12 Q19,-4 17,8', st('#FFFFFF', 3.6 / s) + ' opacity=".55"')
    o += path('M-6,14 Q4,18 14,12', st(P['appleSh'], 3 / s))
    o += path('M0,-15 Q1,-23 4,-27', st(P['stem'], 3.4 / s))
    o += path('M3,-23 Q12,-32 20,-25 Q12,-18 3,-23 Z', fl(P['leaf'], P['leafLine'], 2.4 / s))
    return f'<g transform="translate({f(cx)},{f(cy)}) rotate({f(ang)}) scale({f(s)})">{o}</g>'


def slot_pts():
    cx, cy = COAT[0], COAT[1]
    out = []
    for a in SLOT_ANG:
        r = math.radians(a)
        out.append((round(cx + SLOT_RX * math.cos(r)), round(cy + SLOT_RY * math.sin(r)), round(math.radians(a + 90), 2)))
    return out


def nim_body(doc, pose, extra=''):
    eyes, mo, tilt, brows, look, na, fa, lift = POSES[pose]
    o = feet_far()
    o += coat(doc)
    o += chest(doc)
    o += face_shape(doc)
    o += fringe(doc)
    o += ears(doc, 'far') + ears(doc, 'near')
    o += features(pose)
    o += extra                                   # fruits sit on the spines, under the front paws
    o += scarf(doc)
    o += feet_near(lift)
    fp = PAW_F[fa]
    o += arm(SH_F, fp)
    npaw = PAW_N[na]
    if na in ('chin', 'mouth'):
        npaw = head_pt(*npaw, tilt)
    o += arm(SH_N, npaw, waving=(na == 'wave'))
    return o


def nim_svg(pose):
    doc = Doc('n')
    extra = ''
    if pose == 'title':
        x, y, r = slot_pts()[0]
        extra = apple(x, y, 46, math.degrees(r))
    body = nim_body(doc, pose, extra)
    if pose == 'crouch':
        sx, sy = CROUCH
        body = (f'<g transform="translate({FEET[0]} {FEET[1]}) scale({sx} {sy}) translate({-FEET[0]} {-FEET[1]})">'
                f'{body}</g>')
    return svg(300, 300, body, ''.join(doc.defs))


# ----------------------------------------------------------------- jump + roll
def nim_jump_inner(doc, extra=''):
    o = ''
    # hind paws tucked under the rump, front paws tucked under the chin
    o += foot(104, 262, 15, 9, -30) + foot(150, 268, 15, 9, -20)
    o += coat(doc, bend=-16)
    o += chest(doc)
    o += face_shape(doc)
    o += fringe(doc, bend=-14)
    o += ears(doc, 'far') + ears(doc, 'near')
    eye_l = eye(*EYE_N, mode='wide', look=(1, -1)) + eye(*EYE_F, mode='wide', look=(1, -1))
    o += ell(214, 186, 13, 8, f'fill="{P["cheek"]}" opacity=".9"') + ell(255, 181, 6, 4, f'fill="{P["cheek"]}" opacity=".7"')
    o += mouth('big')
    o += ell(NOSE[0], NOSE[1], 9.5, 7.5, fl(P['nose'], '#3E2820', 2)) + ell(NOSE[0] - 3, NOSE[1] - 3, 3.4, 2, 'fill="#FFFFFF" opacity=".6"')
    o += eye_l
    o += extra
    o += scarf_flutter(doc)
    o += foot(200, 262, 15, 9, -40) + foot(238, 254, 13, 8, -50)
    o += arm(SH_F, (262, 236)) + arm(SH_N, (224, 252))
    return f'<g transform="{JUMP_T}">{o}</g>'


def scarf_flutter(doc):
    """Scarf with the tails streaming back in the air."""
    o = path(ptsd([(176, 226), (146, 226), (110, 226), (90, 216), (100, 232), (132, 240), (182, 238)]),
             fl(P['scarfSh'], P['scarfLine'], 3.6))
    o += path(ptsd([(178, 230), (148, 240), (114, 250), (98, 246), (108, 258), (146, 254), (186, 238)]),
              fl(P['scarf'], P['scarfLine'], 3.6))
    band = ptsd([(150, 206), (200, 220), (250, 210), (256, 222), (248, 236), (200, 244), (148, 228), (144, 216)])
    o += doc.solid(band, P['scarf'], P['scarfSh'], P['scarfLine'], dx=-4, dy=-5, w=3.6)
    o += path('M156,222 Q200,236 246,224', st(P['scarfSh'], 2.6))
    for (x, y) in ((168, 222), (196, 230), (226, 228), (243, 220)):
        o += circ(x, y, 2.4, 'fill="#F3D48E"')
    o += ell(182, 232, 11, 9.5, fl(P['scarf'], P['scarfLine'], 3.4))
    return o


def nim_jump_svg():
    doc = Doc('n')
    return svg(300, 300, nim_jump_inner(doc), ''.join(doc.defs))


def nim_roll_svg():
    doc = Doc('r')
    cx, cy = ROLL_C
    R0 = 66
    d = ell_d(cx, cy, R0, R0)
    tips = []
    n = 20
    for i in range(n):
        a = -90 + 360 * i / n
        r = math.radians(a)
        bx, by = cx + (R0 - 10) * math.cos(r), cy + (R0 - 10) * math.sin(r)
        d += ' ' + tuft_d(bx, by, a + 10, 32, 16)
        tips.append((bx, by, a + 10))
    marks = ''
    for (k, m, off) in ((0.66, 14, 0.5), (0.34, 7, 0.0)):
        for i in range(m):
            a = -90 + 360 * (i + off) / m
            r = math.radians(a)
            bx, by = cx + R0 * k * math.cos(r), cy + R0 * k * math.sin(r)
            if bx > cx + 2 and by > cy + 4:
                continue
            marks += tuft_mark(bx, by, a + 10, 18, 8) + ' '
    inner = path(marks, st(P['spSh'], 3.2) + ' opacity=".85"')
    hl = ''
    for (bx, by, a) in tips:
        if math.sin(math.radians(a)) < 0.2 and math.cos(math.radians(a)) < 0.5:
            x0, y0 = bx + rot(14, 0, a)[0], by + rot(14, 0, a)[1]
            x1, y1 = bx + rot(25, 0, a)[0], by + rot(25, 0, a)[1]
            hl += f'M{f(x0)},{f(y0)} L{f(x1)},{f(y1)} '
    inner += path(hl, st(P['spTip'], 3.6))
    hi = ell(cx - 30, cy - 34, 28, 15, f'fill="{P["spTip"]}" opacity=".45" transform="rotate(-40 {cx - 30} {cy - 34})"')
    o = doc.solid(d, P['sp'], P['spSh'], P['spLine'], dx=-12, dy=-12, hi=hi, inner=inner)
    # the face peeking out lower-right
    fpts = [(160, 214), (184, 204), (212, 206), (228, 220), (230, 240), (216, 256), (190, 262), (166, 252), (156, 234)]
    o += doc.solid(ptsd(fpts), P['face'], P['faceSh'], P['faceLine'], dx=-5, dy=-5, w=4)
    # a little fringe over the face
    fr = tuft_d(176, 214, -150, 22, 11) + ' ' + tuft_d(196, 206, -118, 22, 11) + ' ' + tuft_d(216, 210, -80, 18, 9.5)
    o += doc.solid(fr, P['sp'], P['spSh'], P['spLine'], dx=-4, dy=-4)
    o += ell(178, 242, 8, 5, f'fill="{P["cheek"]}" opacity=".9"') + ell(222, 240, 5, 4, f'fill="{P["cheek"]}" opacity=".8"')
    o += eye(186, 228, 8.5, 'open', (0, 0)) + eye(212, 226, 7, 'open', (0, 0))
    o += path('M192,244 Q199,251 206,244', st(P['nose'], 3))
    o += ell(222, 232, 5.5, 4.5, fl(P['nose'], '#3E2820', 1.6))
    # tiny paws hugging the ball
    o += circ(170, 264, 9, fl(P['paw'], P['pawLine'], 3.4)) + circ(204, 268, 9, fl(P['paw'], P['pawLine'], 3.4))
    return svg(300, 300, o, ''.join(doc.defs))


def roll_slots():
    cx, cy = ROLL_C
    return [(round(cx + ROLL_SLOT_R * math.cos(math.radians(a))), round(cy + ROLL_SLOT_R * math.sin(math.radians(a))))
            for a in ROLL_SLOT_ANG]


# ======================================================================= FISH (0 0 140 100, centre (70,50), facing RIGHT)
FISH = {'b': '#F2A68A', 'sh': '#DE8A6E', 'line': '#B4654C', 'belly': '#FBE3CF', 'fin': '#F7BFA6', 'drop': '#D9F0EC',
        'dropLine': '#7FB8B4'}


def fish_inner(doc, flip):
    F = FISH
    o = ''
    tail = 'M36,50 C26,40 16,30 8,30 C12,42 12,58 8,70 C16,70 26,60 36,50 Z'
    o += path(tail, fl(F['fin'], F['line'], 3.4))
    o += path('M14,40 L26,48 M14,60 L26,52', st(F['sh'], 2.2))
    o += path('M58,24 C64,10 82,10 90,22 Z', fl(F['fin'], F['line'], 3.2))            # top fin
    bd = ptsd([(34, 50), (46, 30), (72, 20), (100, 26), (116, 44), (114, 60), (98, 74), (70, 80), (46, 70)])
    belly = path(ptsd([(52, 66), (76, 58), (104, 58), (98, 72), (72, 79), (52, 72)]), f'fill="{F["belly"]}"')
    hi = ell(70, 32, 14, 6, 'fill="#FFFFFF" opacity=".5" transform="rotate(-12 70 32)"')
    for x in (58, 70):
        hi += path(f'M{x},38 Q{x + 6},46 {x},54', st(F['sh'], 2.4) + ' opacity=".8"')
    o += doc.solid(bd, F['b'], F['sh'], F['line'], dx=-5, dy=-5, w=3.4, hi=hi, inner=belly)
    o += path('M72,58 C62,58 54,64 52,72 C60,72 70,68 74,62 Z', fl(F['fin'], F['line'], 2.6))   # side fin
    if flip:
        o += eye(96, 40, 7, 'happy', (0, 0))
        o += ell(106, 54, 4, 4.6, fl('#C25A52', F['line'], 2.2))
    else:
        o += eye(96, 40, 7.5, 'open', (0, 0))
        o += path('M102,56 Q108,60 113,54', st(F['line'], 2.8))
    o += ell(90, 54, 6, 3.6, f'fill="{P["cheek"]}" opacity=".9"')
    return o


def fish_svg(flip):
    doc = Doc('f')
    o = fish_inner(doc, flip)
    if flip:
        o = f'<g transform="rotate(-24 70 50) translate(70 50) scale(0.92 1) translate(-70 -50)">{o}</g>'
        for (x, y, r) in ((18, 82, 5), (34, 92, 3.6), (8, 66, 3), (122, 84, 4)):
            o += path(f'M{f(x)},{f(y - r * 1.7)} Q{f(x + r)},{f(y - r * 0.2)} {f(x)},{f(y + r)} Q{f(x - r)},{f(y - r * 0.2)} {f(x)},{f(y - r * 1.7)} Z',
                      fl(FISH['drop'], FISH['dropLine'], 1.8))
    return svg(140, 100, o, ''.join(doc.defs))


# ======================================================================= FROG (0 0 140 120, feet (70,112))
FROG = {'b': '#9FBF7A', 'sh': '#86A863', 'line': '#5C7B44', 'belly': '#E7EDC6', 'pad': '#7FA86A', 'padSh': '#6A9156',
        'padLine': '#4F7340', 'sac': '#F1EBC8'}


def frog_svg(croak):
    doc = Doc('g')
    G = FROG
    o = ''
    # lily pad (a notch towards the viewer-right)
    pad = 'M70,100 L118,106 C116,116 96,120 70,120 C38,120 8,116 8,108 C8,99 38,95 70,95 C96,95 128,98 130,104 Z'
    o += path(pad, fl(G['pad'], G['padLine'], 3.4))
    o += path('M70,108 L24,104 M70,108 L40,116 M70,108 L98,116 M70,108 L56,98', st(G['padSh'], 2.2))
    # back legs folded at the sides
    for (x, s) in ((36, 1), (104, -1)):
        o += ell(x, 96, 18, 12, fl(G['b'], G['line'], 3.4) + f' transform="rotate({-14 * s} {x} 96)"')
        o += ell(x - 8 * s, 107, 12, 5, fl(G['b'], G['line'], 3))
    # body + head as one chubby blob
    bd = ptsd([(70, 30), (100, 38), (106, 62), (100, 92), (70, 106), (40, 92), (34, 62), (40, 38)])
    hi = ell(50, 50, 12, 6, 'fill="#FFFFFF" opacity=".45" transform="rotate(-30 50 50)"')
    belly = ell(70, 86, 22, 17, f'fill="{G["belly"]}"')
    o += doc.solid(bd, G['b'], G['sh'], G['line'], dx=-5, dy=-5, w=3.4, hi=hi, inner=belly)
    # eye bumps
    for (x, r) in ((50, 13), (90, 13)):
        o += circ(x, 32, r, fl(G['b'], G['line'], 3.4))
        if croak:
            o += eye(x, 32, 8, 'happy', (0, 0))
        else:
            o += circ(x, 32, 9, 'fill="#FFFFFF"') + eye(x + 1, 33, 6.5, 'open', (0, 0))
    o += ell(46, 64, 7, 4.5, f'fill="{P["cheek"]}" opacity=".85"') + ell(94, 64, 7, 4.5, f'fill="{P["cheek"]}" opacity=".85"')
    if croak:
        o += ell(70, 80, 20, 15, fl(G['sac'], '#B9AE82', 3))
        o += ell(64, 75, 7, 4, 'fill="#FFFFFF" opacity=".7"')
        o += path('M54,62 Q70,70 86,62', st(G['line'], 3))
    else:
        o += path('M52,60 Q70,74 88,60', st(G['line'], 3.2))
    o += circ(64, 52, 1.8, f'fill="{G["line"]}"') + circ(76, 52, 1.8, f'fill="{G["line"]}"')
    # front feet on the pad
    for x in (56, 84):
        o += ell(x, 106, 9, 5, fl(G['b'], G['line'], 3))
        o += path(f'M{x - 4},104 L{x - 6},109 M{x + 4},104 L{x + 6},109', st(G['line'], 1.8))
    return svg(140, 120, o, ''.join(doc.defs))


# ======================================================================= ICON (512, full bleed)
def stone(cx, cy, w, gold=False):
    top, side, line, hi = ('#F4D27A', '#C9A043', '#9C7A2E', '#FBE6A8') if gold else ('#B9B2A6', '#8E877C', '#6C665D', '#D8D2C7')
    h = w * 0.36
    o = ell(cx, cy + w * 0.2, w * 0.56, h * 0.62, 'fill="#3F7A80" opacity=".35"')
    o += path(f'M{f(cx - w / 2)},{f(cy)} L{f(cx - w / 2)},{f(cy + w * 0.16)} Q{f(cx)},{f(cy + w * 0.36)} '
              f'{f(cx + w / 2)},{f(cy + w * 0.16)} L{f(cx + w / 2)},{f(cy)} Z', fl(side, line, 4))
    o += path(f'M{f(cx - w / 2)},{f(cy + w * 0.12)} Q{f(cx)},{f(cy + w * 0.3)} {f(cx + w / 2)},{f(cy + w * 0.12)}',
              st('#5F6A66' if not gold else '#A9822F', 4) + ' opacity=".55"')
    o += ell(cx, cy, w / 2, h / 2, fl(top, line, 4))
    o += ell(cx - w * 0.12, cy - h * 0.12, w * 0.24, h * 0.18, f'fill="{hi}"')
    return o


def ripple(cx, cy, r, a=0.5):
    return ell(cx, cy, r, r * 0.38, f'fill="none" stroke="#D9F0EC" stroke-width="4" opacity="{a}"')


def icon_svg():
    doc = Doc('i')
    sky = doc.add('linearGradient', '<stop offset="0" stop-color="#CFE6F5"/><stop offset="1" stop-color="#F6F1E4"/>',
                  'x1="0" y1="0" x2="0" y2="1"')
    water = doc.add('linearGradient', '<stop offset="0" stop-color="#7FB8B4"/><stop offset=".45" stop-color="#4E8E95"/>'
                    '<stop offset="1" stop-color="#7FB8B4"/>', 'x1="0" y1="0" x2="0" y2="1"')
    o = f'<rect width="512" height="512" fill="url(#{sky})"/>'
    # far tree line
    for (x, y, r, c) in ((20, 120, 54, '#9EC690'), (100, 100, 60, '#8DBB82'), (190, 118, 50, '#9EC690'),
                         (300, 104, 62, '#8DBB82'), (400, 116, 52, '#9EC690'), (490, 98, 62, '#8DBB82')):
        o += circ(x, y, r, f'fill="{c}"')
    for (x, y) in ((150, 70), (350, 64), (450, 76)):
        o += path(f'M{x},{y} L{x + 30},{y + 90} L{x - 30},{y + 90} Z', 'fill="#79A672"')
    # far bank
    o += path('M0,150 Q256,136 512,150 L512,196 Q256,182 0,196 Z', 'fill="#9CC98A"')
    o += path('M0,190 Q256,176 512,190 L512,204 Q256,192 0,204 Z', 'fill="#9A7B58"')
    # brook
    o += f'<rect x="0" y="200" width="512" height="312" fill="url(#{water})"/>'
    for (x, y, w) in ((40, 250, 120), (300, 236, 150), (380, 330, 110), (60, 350, 90), (220, 470, 140), (420, 470, 80)):
        o += path(f'M{x},{y} q{w / 2},-8 {w},0', st('#D9F0EC', 5) + ' opacity=".45"')
    # stepping stones (the one he left is golden; he hops to the next one)
    o += ripple(128, 430, 96, 0.4) + ripple(128, 430, 124, 0.22)
    o += stone(128, 414, 156, gold=True)
    o += stone(448, 262, 104)
    o += ripple(392, 398, 84, 0.3)
    o += stone(392, 384, 148)
    # hop arc (dotted)
    o += path('M140,384 Q256,150 384,352', 'fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" '
              'stroke-dasharray="0.1 22" opacity=".9"')
    # droplets from the take-off
    for (x, y, r) in ((84, 380, 8), (176, 374, 7), (104, 356, 5)):
        o += path(f'M{f(x)},{f(y - r * 1.7)} Q{f(x + r)},{f(y - r * 0.2)} {f(x)},{f(y + r)} Q{f(x - r)},{f(y - r * 0.2)} {f(x)},{f(y - r * 1.7)} Z',
                  fl('#D9F0EC', '#7FB8B4', 2.4))
    # Nim mid-hop (jump frame, scaled), an apple on his spines
    x, y, r = slot_pts()[0]
    inner = nim_jump_inner(doc, extra=apple(x, y, 50, math.degrees(r)))
    k = 1.12
    cx, cy = 252, 222           # where the body centre (140,175) lands
    o += f'<g transform="translate({f(cx - 140 * k)},{f(cy - 175 * k)}) scale({k})">{inner}</g>'
    return svg(512, 512, o, ''.join(doc.defs))


# ======================================================================= main
FRAMES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'crouch', 'jump', 'roll', 'wave', 'giggle', 'dance']


def main():
    for pose in FRAMES + ['title']:
        name = 'nim_' + pose
        if pose == 'jump':
            s = nim_jump_svg()
        elif pose == 'roll':
            s = nim_roll_svg()
        else:
            s = nim_svg(pose)
        write(f'characters/{name}.svg', s)
    write('characters/fish.svg', fish_svg(False))
    write('characters/fish_flip.svg', fish_svg(True))
    write('characters/frog.svg', frog_svg(False))
    write('characters/frog_croak.svg', frog_svg(True))
    write('icon.svg', icon_svg())

    slots = slot_pts()
    mean_y = sum(s[1] for s in slots) / len(slots)
    crouch_dy = round((1 - CROUCH[1]) * (FEET[1] - mean_y))
    # jump: where the slot centres move to under JUMP_T (rotate -7 about (140,175) of the 0.95 x 1.07 stretch)
    jdy = []
    for (x, y, _r) in slots:
        sx, sy = 140 + (x - 140) * 0.95, 175 + (y - 175) * 1.07
        jx, jy = rot(sx, sy, -7, 140, 175)
        jdy.append(jy - y)
    jump_dy = round(sum(jdy) / len(jdy))
    box = [14, 50, 296, 292]
    sl = ', '.join(f'[{x}, {y}, {r}]' for x, y, r in slots)
    rs = ', '.join(f'[{x}, {y}]' for x, y in roll_slots())
    js = ("/* Nim's River Hop — NH.NIM_POINTS (written by tools/art_nim.py; do not edit by hand).\n"
          " * Points in Nim's 300x300 viewBox. Scale by (h / 300) and place by the feet.\n"
          " *   feet       feet anchor of every standing frame (crouch / jump too)\n"
          " *   backSlots  [x, y, rot] fruit centres ON the spines (fruit ~46 units wide), rot in RADIANS (outward tilt);\n"
          " *              the same in every standing frame (idle blink talk happy cheer think oops wave giggle dance title)\n"
          " *   crouchDy   how far the slots move DOWN in nim_crouch (the art is squashed 1.02 x 0.88 about the feet)\n"
          " *   jumpDy     how far the slots move (negative = up) in nim_jump (stretched + tilted up)\n"
          " *   rollC / rollR  ball centre + radius in nim_roll; rollSlots = fruit centres on the ball (rotate with rollRot)\n"
          " *   mouth      mouth centre (rest); box = hit box [x0, y0, x1, y1] */\n"
          "(function (NH) {\n  'use strict';\n"
          f"  NH.NIM_POINTS = {{ feet: [{FEET[0]}, {FEET[1]}], backSlots: [{sl}], crouchDy: {crouch_dy}, jumpDy: {jump_dy},\n"
          f"    rollC: [{ROLL_C[0]}, {ROLL_C[1]}], rollR: {ROLL_R}, rollSlots: [{rs}], mouth: [{MOUTH[0]}, {MOUTH[1]}],\n"
          f"    box: [{box[0]}, {box[1]}, {box[2]}, {box[3]}] }};\n"
          "})(typeof window !== 'undefined' ? (window.NH = window.NH || {}) : (globalThis.NH = globalThis.NH || {}));\n")
    with open(JS_OUT, 'w') as fh:
        fh.write(js)
    print('wrote', len(FRAMES) + 1, 'Nim frames, fish x2, frog x2, icon, nim_points.js')
    print(js)


if __name__ == '__main__':
    main()
