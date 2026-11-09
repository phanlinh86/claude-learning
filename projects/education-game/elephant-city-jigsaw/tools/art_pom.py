#!/usr/bin/env python3
"""Character art generator for Pom's Puzzle Town (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/pom_{idle,blink,talk,happy,cheer,think,oops,wave,point,toot}.svg + pom_full_wave.svg
        0 0 300 300, FEET ANCHOR (150,292). Pom (a round chubby baby elephant in a cream knitted scarf with brown
        stripes) faces RIGHT in 3/4 view, eyes on the viewer. Body, belly, legs, scarf and tail are identical in every
        frame; only eyes, mouth, brows, ears, front legs ("arms"), the trunk and (think / oops) a small head tilt change.
        docs/art/pom_hand.json gives per frame the trunk tip, the near front-foot point and the head top.
  characters/pigeon.svg, pigeon_flap.svg      0 0 160 140, bottom anchor (80,136), facing right
  icon.svg                                    0 0 512 512, full bleed, opaque, no text

Usage: python3 tools/art_pom.py [outDir]
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
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'pom_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Pom palette (DESIGN.md section 3) — never an answer colour
    'skin': '#B9BAC6', 'sh': '#9C9DAC', 'line': '#6F7082', 'hi': '#FFFFFF', 'belly': '#CACBD5',
    'blush': '#F1C7C2', 'blushSh': '#E2AFAA', 'cheek': '#F4B0A3',
    'pupil': '#2F2A3A', 'white': '#FFFFFF', 'mouth': '#7C3B33', 'tongue': '#F28F86', 'nail': '#F3EDE3',
    'nailLine': '#A9A6AE', 'tuft': '#7D7E90',
    'scarf': '#F1E6CF', 'scarfSh': '#DDCCAA', 'stripe': '#A27B55', 'scarfLine': '#8A6A4A',
}


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

    def __init__(self, prefix='p'):
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


def spline(pts, per=10):
    """Sample an open Catmull-Rom spline through pts."""
    out = []
    ext = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def star4(x, y, s, fill='#FFF6C8', line='#E2C86A', w=1.6):
    return path(f'M{f(x)},{f(y - s)} L{f(x + s * 0.3)},{f(y - s * 0.3)} L{f(x + s)},{f(y)} L{f(x + s * 0.3)},{f(y + s * 0.3)} '
                f'L{f(x)},{f(y + s)} L{f(x - s * 0.3)},{f(y + s * 0.3)} L{f(x - s)},{f(y)} L{f(x - s * 0.3)},{f(y - s * 0.3)} Z',
                f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"')


# ------------------------------------------------------------------ jigsaw piece outline
KNOB = [((0.36, 0), (0.41, 0), (0.43, 0.05), (0.40, 0.10)), (None, (0.36, 0.19), (0.42, 0.27), (0.5, 0.27)),
        (None, (0.58, 0.27), (0.64, 0.19), (0.60, 0.10)), (None, (0.57, 0.05), (0.59, 0), (0.64, 0))]


def piece_d(cx, cy, s, tabs=(1, 1, -1, 0), ang=0):
    """Classic jigsaw piece: square of side s around (cx,cy); tabs (top,right,bottom,left): 1 knob out, -1 in, 0 flat."""
    h = s / 2
    corners = [(-h, -h), (h, -h), (h, h), (-h, h)]
    outs = [(0, -1), (1, 0), (0, 1), (-1, 0)]

    def T(x, y):
        x, y = rot(x, y, ang)
        return f'{f(cx + x)},{f(cy + y)}'
    d = f'M{T(*corners[0])}'
    for e in range(4):
        a, b, o, sg = corners[e], corners[(e + 1) % 4], outs[e], tabs[e]

        def E(u, v):
            return (a[0] + (b[0] - a[0]) * u + o[0] * v * s * sg, a[1] + (b[1] - a[1]) * u + o[1] * v * s * sg)
        if sg:
            d += f' L{T(*E(0.36, 0))}'
            for seg in KNOB:
                pts = [E(*p) for p in seg[1:]]
                d += ' C' + ' '.join(T(*p) for p in pts)
            d += f' L{T(*b)}'
        else:
            d += f' L{T(*b)}'
    return d + ' Z'


# ======================================================================= POM
BODY = (150, 230, 55, 44)          # x 95-205, y 186-274
BELLY = (166, 240, 30, 27)
HEAD = (160, 140, 70, 60)          # x 90-230, y 80-200
NECK = (160, 204)                  # tilt pivot
EYE_N = (152, 138, 17)             # near eye (viewer's left, bigger)
EYE_F = (194, 132, 13.5)           # far eye (towards the trunk)
MOUTH = (186, 180)
TRUNK0 = (200, 150)                # trunk root (hidden under the snout patch)
SH_F = (110, 212)                  # far front leg shoulder (behind the body)
SH_N = (194, 216)                  # near front leg shoulder (in front)
ARM_L = 30

# trunk centre lines (root first) per pose — short and curly
TRUNKS = {
    'idle':  [TRUNK0, (218, 160), (234, 170), (246, 166), (250, 154), (244, 146)],
    'talk':  [TRUNK0, (218, 156), (236, 160), (250, 152), (254, 140), (247, 132)],
    'happy': [TRUNK0, (220, 154), (240, 150), (254, 138), (256, 122), (247, 114)],
    'cheer': [TRUNK0, (220, 148), (238, 136), (250, 116), (250, 98), (240, 90)],
    'think': [TRUNK0, (214, 164), (220, 182), (210, 196), (196, 196), (192, 186)],
    'oops':  [TRUNK0, (214, 164), (226, 180), (238, 190), (250, 188)],
    'wave':  [TRUNK0, (220, 148), (238, 128), (248, 102), (244, 78), (232, 70)],
    'point': [TRUNK0, (222, 152), (244, 144), (266, 132), (284, 120)],
    'toot':  [TRUNK0, (222, 146), (238, 124), (248, 98), (256, 72)],
}
TRUNKS['blink'] = TRUNKS['idle']
TRUNKS['hold'] = [TRUNK0, (222, 148), (240, 132), (256, 116), (270, 104)]   # icon: holds the piece up
TRUNKS['full_wave'] = TRUNKS['wave']


def tube_pts(pts, w0, w1, flare=0.0):
    """Outline of a tapering tube along a spline (rounded tip). flare > 0 widens the very end (trumpet)."""
    cl = spline(pts, 8)
    n = len(cl)
    L, R = [], []
    for i, (x, y) in enumerate(cl):
        a = cl[max(i - 1, 0)]
        b = cl[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        u = i / (n - 1)
        w = w0 + (w1 - w0) * u
        if flare:
            w += flare * max(0.0, (u - 0.8) / 0.2) ** 2
        L.append((x + nx * w, y + ny * w))
        R.append((x - nx * w, y - ny * w))
    # rounded cap at the tip
    x, y = cl[-1]
    a = cl[-2]
    dx, dy = x - a[0], y - a[1]
    ln = math.hypot(dx, dy) or 1
    tx, ty = dx / ln, dy / ln
    wend = w1 + flare
    cap = []
    for k in range(1, 6):
        t = math.pi * k / 6
        # from L side over the tip to R side
        nx, ny = -ty, tx
        cap.append((x + nx * wend * math.cos(t) + tx * wend * 0.7 * math.sin(t),
                    y + ny * wend * math.cos(t) + ty * wend * 0.7 * math.sin(t)))
    return L + cap + R[::-1], cl, (tx, ty), wend


def trunk(doc, pose):
    pts = TRUNKS[pose]
    flare = {'toot': 4.5, 'hold': 2.0}.get(pose, 0.0)
    outline, cl, (tx, ty), wend = tube_pts(pts, 16, 9.5, flare)
    d = ptsd(outline)
    o = doc.shaded(f'<path d="{d}" {{a}}/>', P['skin'], P['sh'], P['line'], dx=-4, dy=-4)
    # wrinkles across the trunk
    n = len(cl)
    for u in (0.42, 0.56, 0.7, 0.82):
        i = int(u * (n - 1))
        x, y = cl[i]
        a, b = cl[i - 1], cl[i + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        w = (16 + (9.5 - 16) * u) * 0.62
        o += path(f'M{f(x + nx * w)},{f(y + ny * w)} Q{f(x + dx / ln * 2.5)},{f(y + dy / ln * 2.5)} '
                  f'{f(x - nx * w)},{f(y - ny * w)}', st(P['sh'], 2.4))
    # nostril opening at the tip (seen end-on)
    ex, ey = cl[-1]
    cx, cy = ex + tx * wend * 0.32, ey + ty * wend * 0.32
    angd = math.degrees(math.atan2(ty, tx))
    o += ell(cx, cy, wend * 0.36, wend * 0.7, fl(P['blush'], P['line'], 2.6) + f' transform="rotate({f(angd)} {f(cx)} {f(cy)})"')
    o += ell(cx, cy, wend * 0.12, wend * 0.26, f'fill="{P["blushSh"]}" transform="rotate({f(angd)} {f(cx)} {f(cy)})"')
    tip = (cx + tx * wend * 0.4, cy + ty * wend * 0.4)
    return o, tip


def eye(cx, cy, r, mode='open', look=(-1, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.08 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.9, rr, fl(P['white'], P['line'], 3.4))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.7 if mode == 'wide' else 0.66)
        o += ell(px, py, pr * 0.9, pr, f'fill="{P["pupil"]}"')
        o += circ(px - pr * 0.32, py - pr * 0.4, pr * 0.42, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.4, py + pr * 0.42, pr * 0.17, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.8)},{f(cy)} Q{f(cx)},{f(cy + r * 0.6)} {f(cx + r * 0.8)},{f(cy)}', st(P['pupil'], 4.8))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.78)},{f(cy + r * 0.3)} Q{f(cx)},{f(cy - r * 0.85)} {f(cx + r * 0.78)},{f(cy + r * 0.3)}',
                  st(P['pupil'], 5.4))
    # eyelash flick (near eye only, gives the face a baby look)
    return o


def mouth(mode):
    mx, my = MOUTH
    line = P['line']
    if mode == 'closed':
        return path(f'M{mx - 9},{my - 2} Q{mx - 1},{my + 7} {mx + 8},{my - 3}', st(line, 3.6))
    if mode == 'talk':
        o = path(f'M{mx - 9},{my - 3} Q{mx},{my - 4} {mx + 9},{my - 4} Q{mx + 9},{my + 11} {mx},{my + 12} '
                 f'Q{mx - 9},{my + 10} {mx - 9},{my - 3} Z', fl(P['mouth'], line, 3.2))
        o += ell(mx, my + 7.5, 5.5, 3.2, f'fill="{P["tongue"]}"')
        return o
    if mode in ('smile', 'big'):
        k = 1.25 if mode == 'big' else 1.0
        w, h = 12 * k, 13 * k
        o = path(f'M{f(mx - w)},{f(my - 4)} Q{mx},{f(my)} {f(mx + w)},{f(my - 6)} '
                 f'Q{f(mx + w * 0.8)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.8)},{f(my + h)} {f(mx - w)},{f(my - 4)} Z',
                 fl(P['mouth'], line, 3.2))
        o += ell(mx, my + h - 4.5 * k, 7 * k, 3.6 * k, f'fill="{P["tongue"]}"')
        return o
    if mode == 'o':
        return ell(mx + 1, my + 3, 5, 6, fl(P['mouth'], line, 3))
    if mode == 'hmm':
        return path(f'M{mx - 9},{my + 2} Q{mx - 4},{my - 3} {mx},{my + 1} Q{mx + 4},{my + 5} {mx + 9},{my}', st(line, 3.6))
    if mode == 'pucker':            # toot: little round mouth under the trunk
        return ell(mx, my + 1, 4.2, 4.6, fl(P['mouth'], line, 2.8))
    return ''


EARS = {   # (cx, cy, rx, ry, rot) for the near ear (left of the head) and the far ear (top right, behind the head)
    'rest': ((100, 134, 44, 50, -12), (214, 92, 24, 27, 20)),
    'perk': ((98, 128, 45, 51, -20), (216, 88, 25, 28, 28)),
    'flap': ((86, 122, 52, 54, -32), (224, 84, 28, 30, 36)),
    'back': ((104, 138, 40, 48, 0), (210, 96, 22, 25, 10)),
}


def ear(doc, spec, near):
    cx, cy, rx, ry, a = spec
    tpl = f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" transform="rotate({f(a)} {f(cx)} {f(cy)})" {{a}}/>'
    o = doc.shaded(tpl, P['skin'] if near else P['sh'], P['sh'] if near else '#8D8E9E', P['line'], dx=-7, dy=-6)
    k = 0.66
    ix, iy = (cx - rx * 0.1, cy + ry * 0.04) if near else (cx + rx * 0.12, cy - ry * 0.06)
    o += ell(ix, iy, rx * k, ry * k, f'fill="{P["blush"]}" transform="rotate({f(a)} {f(ix)} {f(iy)})"')
    if near:  # a soft fold line inside the ear
        o += path(f'M{f(ix - rx * 0.36)},{f(iy - ry * 0.3)} Q{f(ix - rx * 0.5)},{f(iy)} {f(ix - rx * 0.3)},{f(iy + ry * 0.36)}',
                  st(P['blushSh'], 3))
    return o


def head(doc, pose, eyes='open', mo='closed', brows=None, look=(-1, 2), ears='rest', tpose=None):
    hx, hy, hrx, hry = HEAD
    eN, eF = EARS[ears]
    o = ear(doc, eF, False)
    o += ear(doc, eN, True)
    hi = ell(124, 108, 22, 11, 'fill="#FFFFFF" opacity=".5" transform="rotate(-34 124 108)"')
    tpl = f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>'
    o += doc.shaded(tpl, P['skin'], P['sh'], P['line'], dx=-11, dy=-9, hi=hi)
    # little hair tuft on top
    o += path('M150,84 Q144,70 152,64 M160,82 Q160,64 170,60 M170,84 Q176,72 186,72', st(P['tuft'], 3.6))
    # cheeks (the far one sits between the far eye and the trunk)
    o += ell(132, 166, 14, 8.5, f'fill="{P["cheek"]}" opacity=".9"')
    o += ell(214, 166, 6, 5, f'fill="{P["cheek"]}" opacity=".9"')
    o += mouth(mo)
    t, tip = trunk(doc, tpose or pose)
    o += t
    # snout patch: blends the trunk root into the face (no outline)
    o += ell(199, 152, 16, 15.5, f'fill="{P["skin"]}"')
    # the brow line over the trunk root (a little bridge between the eyes)
    o += path('M206,140 Q212,146 213,152', st(P['sh'], 2.6))
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if eyes in ('open', 'wide', 'look'):  # tiny lashes at the outer corner of the near eye
        x, y, r = EYE_N
        o += path(f'M{f(x - r * 0.86)},{f(y - r * 0.5)} L{f(x - r * 1.18)},{f(y - r * 0.74)}', st(P['line'], 3))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 8 - lift
            o += path(f'M{f(cx - 8)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 8)},{f(y + 3)}', st(P['line'], 3.6))
    return o, tip


def arm_d(L):
    return (f'M-13,-6 C-15,8 -16,{f(L - 12)} -15,{f(L - 2)} C-14,{f(L + 13)} 14,{f(L + 13)} 15,{f(L - 2)} '
            f'C16,{f(L - 12)} 15,8 13,-6 C6,-14 -6,-14 -13,-6 Z')


def arm(doc, sh, ang, L=ARM_L, sole=False, nails=True, far=False):
    """Stubby front leg of length L (shoulder → foot centre); ang 0 = hanging down, > 0 swings the foot to the viewer's
    LEFT, < 0 to the RIGHT. sole = show the soft sole (raised legs)."""
    tf = f'translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)})'
    tpl = f'<path d="{arm_d(L)}" transform="{tf}" {{a}}/>'
    hi = f'<path d="M-7,0 C-9,{f(L * 0.4)} -9,{f(L * 0.8)} -7,{f(L + 2)}" transform="{tf}" {st("#FFFFFF", 4)} opacity=".45"/>'
    base = P['sh'] if far else P['skin']
    o = doc.shaded(tpl, base, '#8D8E9E' if far else P['sh'], P['line'], dx=-5, dy=-4, hi=None if far else hi)
    if sole:
        o += f'<g transform="{tf}">' + ell(0, L + 4, 10, 6.5, f'fill="{P["blush"]}"') + '</g>'
    if nails:
        o += f'<g transform="{tf}">'
        for x in (-8, 0, 8):
            o += path(f'M{x - 3.8},{f(L + 9)} Q{x - 3.8},{f(L + 2)} {x},{f(L + 2)} Q{x + 3.8},{f(L + 2)} {x + 3.8},{f(L + 9)} Z',
                      fl(P['nail'], P['nailLine'], 1.5))
        o += '</g>'
    return o


def local_pt(sh, ang, p):
    x, y = rot(p[0], p[1], ang)
    return sh[0] + x, sh[1] + y


def scarf_band():
    return 'M102,194 C128,210 190,212 216,192 C220,198 221,206 218,212 C192,232 126,230 100,212 C97,206 98,199 102,194 Z'


def body(doc):
    o = ''
    # tail with a little tuft (back, viewer's left)
    o += path('M98,236 C88,240 84,248 82,256', st(P['line'], 7.4)) + path('M98,236 C88,240 84,248 82,256', st(P['skin'], 3.2))
    o += path('M83,252 C76,256 74,264 80,268 C82,264 86,264 88,266 C90,260 88,254 83,252 Z', fl(P['tuft'], '#5F6072', 2.4))
    # back (far) hind leg, then the body, then the near hind leg
    o += doc.shaded(f'<path d="M100,244 L100,280 C100,288 104,290 112,290 L132,290 C140,290 142,286 142,280 L142,244 Z" {{a}}/>',
                    P['sh'], '#8D8E9E', P['line'], dx=-4, dy=-4)
    bx, by, brx, bry = BODY
    tpl = f'<ellipse cx="{bx}" cy="{by}" rx="{brx}" ry="{bry}" {{a}}/>'
    hi = ell(116, 216, 13, 8, 'fill="#FFFFFF" opacity=".45" transform="rotate(-30 116 216)"')
    o += doc.shaded(tpl, P['skin'], P['sh'], P['line'], dx=-12, dy=-9, hi=hi)
    px, py, prx, pry = BELLY
    o += ell(px, py, prx, pry, f'fill="{P["belly"]}"')
    leg = 'M156,246 L156,278 C156,288 160,290 168,290 L194,290 C202,290 206,288 206,278 L206,246 C196,256 166,256 156,246 Z'
    o += doc.shaded(f'<path d="{leg}" {{a}}/>', P['skin'], P['sh'], P['line'], dx=-5, dy=-4)
    for x in (169, 181, 193):
        o += path(f'M{x - 5},287 Q{x - 5},279 {x},279 Q{x + 5},279 {x + 5},287 Z', fl(P['nail'], P['nailLine'], 1.6))
    for x in (111, 121, 131):
        o += path(f'M{x - 4.4},287 Q{x - 4.4},280 {x},280 Q{x + 4.4},280 {x + 4.4},287 Z', fl(P['nail'], P['nailLine'], 1.6))
    # knitted scarf: band around the neck (cream with brown stripes), hanging end in front of the chest
    band = scarf_band()
    cid = doc.clip(f'<path d="{band}"/>')
    o += path(band, f'fill="{P["scarf"]}"')
    o += f'<g clip-path="url(#{cid})">'
    for x in range(110, 222, 24):
        o += rect(x, 180, 10, 60, 0, f'fill="{P["stripe"]}" transform="rotate(-10 {x} 210)"')
    o += path('M96,214 C126,234 194,236 222,210 L222,240 L96,240 Z', f'fill="{P["scarfSh"]}" opacity=".55"')
    o += '</g>'
    o += path(band, f'fill="none" stroke="{P["scarfLine"]}" stroke-width="{f(LW * 0.85)}" stroke-linejoin="round"')
    tail = 'M150,212 C148,226 146,240 144,252 L170,256 C171,244 172,228 174,214 Z'
    cid2 = doc.clip(f'<path d="{tail}"/>')
    o += path(tail, f'fill="{P["scarf"]}"')
    o += (f'<g clip-path="url(#{cid2})">' + rect(130, 222, 60, 8, 0, f'fill="{P["stripe"]}"')
          + rect(130, 238, 60, 8, 0, f'fill="{P["stripe"]}"') + path('M164,212 L160,258 L180,258 L180,212 Z', f'fill="{P["scarfSh"]}"') + '</g>')
    o += path(tail, f'fill="none" stroke="{P["scarfLine"]}" stroke-width="{f(LW * 0.85)}" stroke-linejoin="round"')
    for x in (147, 153, 159, 165):    # fringe
        o += path(f'M{x},{254 + (x - 147) * 0.2} L{x - 1},{263 + (x - 147) * 0.2}', st(P['scarfLine'], 2.6))
    return o


R_F, R_N = (SH_F, 18), (SH_N, -12)
POSES = {
    #             eyes      mouth     far leg (sh, ang, L)       near leg (sh, ang, L)          tilt brows   look      ears
    'idle':      ('open',   'closed', (SH_F, 18, 30),          (SH_N, -12, 30),               0, None,    (-1, 2),  'rest'),
    'blink':     ('closed', 'closed', (SH_F, 18, 30),          (SH_N, -12, 30),               0, None,    (-1, 2),  'rest'),
    'talk':      ('open',   'talk',   (SH_F, 30, 30),          (SH_N, -30, 30),               0, None,    (-1, 2),  'rest'),
    'happy':     ('wide',   'big',    (SH_F, 56, 32),          (SH_N, -60, 32),               0, None,    (-1, 1),  'perk'),
    'cheer':     ('happy',  'big',    ((114, 208), 128, 50),   ((194, 210), -126, 50),        0, None,    (0, 0),   'flap'),
    'think':     ('look',   'hmm',    (SH_F, 18, 30),          (SH_N, -12, 30),               7, (0, 6),  (4, -5),  'rest'),
    'oops':      ('wide',   'o',      (SH_F, 38, 30),          ((194, 214), -64, 30),        -6, (8, 0),  (-1, 1),  'back'),
    'wave':      ('open',   'smile',  (SH_F, 18, 30),          (SH_N, -16, 30),               0, None,    (-1, 2),  'perk'),
    'point':     ('look',   'talk',   (SH_F, 18, 30),          (SH_N, -30, 30),               0, (4, 4),  (4, -3),  'perk'),
    'toot':      ('happy',  'pucker', (SH_F, 50, 32),          (SH_N, -54, 32),               0, None,    (0, 0),   'flap'),
    'full_wave': ('wide',   'smile',  (SH_F, 30, 30),          ((196, 214), -64, 34),         0, None,    (-1, 2),  'perk'),
}
BEHIND_HEAD = ('cheer',)


def foot_pt(spec, tip=0):
    sh, ang, L = spec
    return local_pt(sh, ang, (0, L + tip))


def pom(doc, pose, near_arm=True, tpose=None):
    eyes, mo, aF, aN, tilt, brows, look, ears = POSES[pose]
    o = ''
    if pose not in BEHIND_HEAD:
        o += arm(doc, *aF, far=True)
    o += body(doc)
    hd, tip = head(doc, pose, eyes, mo, brows, look, ears, tpose)
    if tilt:
        hd = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{hd}</g>'
        tip = rot(tip[0], tip[1], tilt, *NECK)
    o += hd
    if pose in ('wave', 'full_wave'):   # motion lines beside the waving trunk
        o += path('M262,64 Q274,74 276,90 M270,48 Q288,62 290,88', st(P['line'], 3.6) + ' opacity=".7"')
    if pose == 'toot':                  # puff lines out of the raised trunk
        tx, ty = tip
        for (dx, dy, ex, ey) in ((-12, -10, -20, -26), (2, -14, 4, -32), (14, -6, 26, -18)):
            o += path(f'M{f(tx + dx)},{f(ty + dy)} L{f(tx + ex)},{f(ty + ey)}', st(P['line'], 4) + ' opacity=".75"')
        o += circ(tx - 30, ty - 14, 4, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".7"')
        o += circ(tx + 32, ty - 30, 3.2, f'fill="none" stroke="{P["line"]}" stroke-width="2.4" opacity=".7"')
    if pose == 'cheer':
        for (x, y, r) in ((40, 110, 5), (272, 150, 5), (30, 82, 3.4), (282, 122, 3.4)):
            o += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'oops':
        o += path('M250,62 Q250,50 260,50 Q270,50 268,60 Q266,68 258,70 L258,76', st(P['line'], 4) + ' opacity=".8"')
        o += circ(258, 86, 2.8, f'fill="{P["line"]}" opacity=".8"')
    if pose == 'think':
        for (x, y, r) in ((236, 92, 3.4), (248, 76, 5), (264, 58, 7)):
            o += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".75"')
    if pose == 'full_wave':             # holding a big neutral puzzle piece in front of the tummy
        d = piece_d(178, 236, 60, (1, 1, -1, 1), -8)
        o += doc.shaded(f'<path d="{d}" {{a}}/>', '#EBD7AE', '#D3B989', '#97764C', dx=-5, dy=-5, w=4.2,
                        hi=ell(162, 220, 10, 5, 'fill="#FFFFFF" opacity=".6" transform="rotate(-30 162 220)"'))
    if pose in BEHIND_HEAD:          # cheer: both front legs up and out ("hooray"), soles to the viewer
        o += arm(doc, *aF, sole=True, far=True)
        o += arm(doc, *aN, sole=True)
    elif near_arm:
        o += arm(doc, *aN)
    return o, tip


def hand_table(tips):
    out = {}
    for pose, p in POSES.items():
        fx, fy = foot_pt(p[3])
        top = 60 + (3 if p[4] else 0)
        out[pose] = {'trunkTip': [round(tips[pose][0]), round(tips[pose][1])], 'foot': [round(fx), round(fy)],
                     'headTop': top, 'eye': [EYE_N[0], EYE_N[1]]}
    return out


def write_pom():
    tips = {}
    for pose in POSES:
        d = Doc('p')
        b, tip = pom(d, pose)
        tips[pose] = tip
        write(f'characters/pom_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
    tbl = hand_table(tips)
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        json.dump({'_about': ('Pom per frame, in the 0 0 300 300 viewBox (feet anchor 150,292). trunkTip = the end of the '
                              'trunk (point: aim the hint from here; toot: where the trumpet puff starts); foot = centre of '
                              'the near front foot; headTop = y of the hair tuft top (speech-bubble tail / stars over the '
                              'head); eye = near eye centre; bbox = measured opaque box (added by tools/pom_sheet.js).'),
                   **tbl}, fh, indent=1)
        fh.write('\n')
    return tbl


# ======================================================================= PIGEON
PG = {'body': '#A9A6B8', 'sh': '#918EA2', 'line': '#646176', 'light': '#C6C3D3', 'neck': '#8FB3B0', 'neckHi': '#B4D0CC',
      'wing': '#B8B5C6', 'bar': '#7E7B90', 'feet': '#E7B6B0', 'feetLine': '#B8837D', 'beak': '#6E6A7A', 'cere': '#F1EEF4'}


def pigeon(flap=False):
    d = Doc('g')
    o = ''
    # tail (left)
    o += d.shaded('<path d="M44,92 L10,82 C6,86 6,96 10,100 L46,108 Z" {a}/>', PG['sh'], PG['bar'], PG['line'], dx=-3, dy=-3, w=3.6)
    o += path('M12,86 L12,96', st(PG['line'], 3) + ' opacity=".55"')
    # far wing up (flap only)
    if flap:
        fw = 'M86,84 C82,58 66,34 40,16 C36,30 38,40 44,46 C36,50 36,60 46,64 C40,70 44,78 56,80 C58,88 70,94 86,94 Z'
        o += d.shaded(f'<path d="{fw}" transform="translate(14,-6) rotate(8 86 90)" {{a}}/>', PG['sh'], PG['bar'], PG['line'], dx=-3, dy=3, w=3.6)
    # feet
    for x in (72, 92):
        o += path(f'M{x},116 L{x},132', st(PG['feetLine'], 6)) + path(f'M{x},116 L{x},132', st(PG['feet'], 3))
        o += path(f'M{x - 7},134 L{x + 9},134 M{x},134 L{x + 4},128', st(PG['feetLine'], 5.6))
        o += path(f'M{x - 7},134 L{x + 9},134', st(PG['feet'], 2.6))
    # body (round)
    bt = '<ellipse cx="80" cy="96" rx="44" ry="30" {a}/>'
    hi = ell(62, 80, 12, 6, 'fill="#FFFFFF" opacity=".45" transform="rotate(-25 62 80)"')
    o += d.shaded(bt, PG['body'], PG['sh'], PG['line'], dx=-7, dy=-6, w=4, hi=hi)
    o += ell(96, 106, 22, 14, f'fill="{PG["light"]}"')
    # neck + head
    nt = '<path d="M90,84 C88,64 96,48 112,44 C128,42 136,54 134,70 C132,86 122,98 104,100 Z" {a}/>'
    cidn = d.clip(nt.format(a=''))
    o += nt.format(a=f'fill="{PG["sh"]}"')
    o += (f'<g clip-path="url(#{cidn})"><g transform="translate(-4,-4)">{nt.format(a=chr(102) + "ill=" + chr(34) + PG["body"] + chr(34))}</g>'
          f'<path d="M86,64 C100,74 120,78 140,72 L140,100 L86,100 Z" fill="{PG["neck"]}"/>'
          f'<path d="M96,72 C108,78 120,80 132,77" {st(PG["neckHi"], 3)}/></g>')
    o += nt.format(a=f'fill="none" stroke="{PG["line"]}" stroke-width="4" stroke-linejoin="round"')
    # beak
    o += path('M130,54 C138,54 146,57 150,61 C144,64 136,64 130,62 Z', fl(PG['beak'], PG['line'], 2.6))
    o += ell(133, 54.5, 3.4, 2.2, f'fill="{PG["cere"]}"')
    # eye (big, cute) + cheek
    o += circ(118, 54, 8.4, fl('#FFFFFF', PG['line'], 2.6))
    o += circ(119.4, 55, 5.4, 'fill="#2F2A3A"') + circ(117.4, 52.6, 2.1, 'fill="#FFFFFF"') + circ(121.4, 57.4, 0.9, 'fill="#FFFFFF"')
    o += ell(124, 66, 5, 3.4, 'fill="#F4B0A3" opacity=".85"')
    # near wing
    if flap:
        w = 'M86,84 C82,58 66,34 40,16 C36,30 38,40 44,46 C36,50 36,60 46,64 C40,70 44,78 56,80 C58,88 70,94 86,94 Z'
        o += d.shaded(f'<path d="{w}" {{a}}/>', PG['wing'], PG['sh'], PG['line'], dx=4, dy=4, w=3.8)
        o += path('M58,48 C66,58 72,68 76,80 M52,64 C60,70 66,76 70,84', st(PG['bar'], 3))
    else:
        w = 'M46,90 C50,76 66,72 82,76 C96,80 104,92 100,104 C86,112 60,110 46,90 Z'
        o += d.shaded(f'<path d="{w}" {{a}}/>', PG['wing'], PG['sh'], PG['line'], dx=-4, dy=-4, w=3.8)
        o += path('M60,90 C68,96 80,98 90,96 M58,98 C66,104 78,106 88,104', st(PG['bar'], 3.2))
    return svg(160, 140, o, ''.join(d.defs))


# ======================================================================= ICON
def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE3F5"/>'
                  f'<stop offset=".75" stop-color="#FDEFF4"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # clouds
    for (x, y, k) in ((90, 70, 1.0), (420, 50, 0.8)):
        o += (ell(x, y, 46 * k, 18 * k, 'fill="#FFFFFF" opacity=".9"') + circ(x - 14 * k, y - 12 * k, 20 * k, 'fill="#FFFFFF" opacity=".9"')
              + circ(x + 14 * k, y - 16 * k, 24 * k, 'fill="#FFFFFF" opacity=".9"'))
    # far rooftops + clock tower (calm, desaturated)
    far = ('M0,300 L0,236 L40,236 L40,212 L70,196 L100,212 L100,240 L130,240 L130,206 L150,206 L150,170 L166,152 L182,170 '
           'L182,226 L210,226 L210,204 L250,204 L250,232 L290,232 L290,196 L316,182 L342,196 L342,236 L380,236 L380,214 '
           'L420,214 L420,196 L436,196 L436,214 L470,214 L470,236 L512,236 L512,300 Z')
    o += path(far, 'fill="#D7D9EA"')
    o += circ(166, 186, 9, 'fill="#F6F2E6" stroke="#B7B9CF" stroke-width="3"')
    # shopfronts (mid) with soft striped awnings
    shops = [(0, 250, 120, '#EAD9CC', '#D9A9A6'), (120, 262, 130, '#E7E2CF', '#A9C2A2'), (380, 256, 132, '#EADCC4', '#D8C29A')]
    for (x, y, w, wall, aw) in shops:
        o += rect(x, y, w, 230, 0, f'fill="{wall}" stroke="#BBA995" stroke-width="3"')
        o += rect(x + 18, y + 60, w - 36, 60, 6, 'fill="#F7E7B9" stroke="#BBA995" stroke-width="3"')
        aw_d = f'M{x - 4},{y + 20} L{x + w + 4},{y + 20} L{x + w + 4},{y + 44} '
        n = 6
        for k in range(n, 0, -1):
            xx = x + w + 4 - (w + 8) * (n - k + 1) / n
            aw_d += f'Q{f(xx + (w + 8) / n / 2)},{y + 58} {f(xx)},{y + 44} '
        aw_d += 'Z'
        cid = d.clip(f'<path d="{aw_d}"/>')
        o += path(aw_d, 'fill="#FBF6EC"')
        o += f'<g clip-path="url(#{cid})">'
        for k in range(0, w + 16, 22):
            o += rect(x - 4 + k, y + 10, 11, 60, 0, f'fill="{aw}"')
        o += '</g>' + path(aw_d, 'fill="none" stroke="#B49C8A" stroke-width="3" stroke-linejoin="round"')
    # blossom tree behind Pom
    o += path('M66,420 C70,360 64,320 74,290', st('#9C7A64', 14)) + path('M70,330 L96,306', st('#9C7A64', 8))
    for (x, y, r) in ((52, 262, 40), (96, 248, 44), (128, 280, 34), (30, 300, 30), (82, 296, 36)):
        o += circ(x, y, r, 'fill="#F7DDE6" stroke="#E6BCCB" stroke-width="3"')
    for (x, y) in ((60, 250), (100, 236), (120, 272), (40, 296), (86, 284), (110, 300), (70, 230)):
        o += circ(x, y, 4, 'fill="#FFFFFF" opacity=".9"')
    # pavement + kerb
    o += rect(0, 430, 512, 82, 0, 'fill="#D9CFC0"')
    o += rect(0, 424, 512, 10, 0, 'fill="#E8E1D4"')
    for x in range(-20, 520, 64):
        o += path(f'M{x},434 L{x - 16},512', st('#C7BBA9', 3))
    o += path('M0,470 L512,470', st('#C7BBA9', 3))
    # the picture board (wooden frame) with a calm picture and one dark shadow slot
    bx, by, bw, bh = 236, 128, 252, 220
    o += rect(bx - 6, by + 10, bw + 12, bh + 12, 30, 'fill="#5E4A3A" opacity=".18"')
    o += rect(bx - 22, by - 22, bw + 44, bh + 44, 30, fl('#C98D52', '#8E5A2C', 5))
    o += rect(bx - 22, by - 22, bw + 44, 18, 9, 'fill="#E6B47E" opacity=".7"')
    cidb = d.clip(rect(bx, by, bw, bh, 12))
    o += f'<g clip-path="url(#{cidb})">' + rect(bx, by, bw, bh, 0, 'fill="#DDF0F8"')
    o += circ(bx + 200, by + 46, 22, 'fill="#FFF1B8"')
    o += path(f'M{bx},{by + 160} C{bx + 70},{by + 120} {bx + 160},{by + 130} {bx + bw},{by + 150} L{bx + bw},{by + bh} L{bx},{by + bh} Z',
              'fill="#BFDDB4"')
    o += rect(bx + 30, by + 104, 64, 64, 4, 'fill="#F3E6D2" stroke="#C9B49A" stroke-width="3"')
    o += path(f'M{bx + 22},{by + 108} L{bx + 62},{by + 74} L{bx + 102},{by + 108} Z', 'fill="#D9B7B0" stroke="#B9948C" stroke-width="3" stroke-linejoin="round"')
    o += rect(bx + 54, by + 136, 18, 32, 3, 'fill="#C9B49A"')
    o += '</g>' + rect(bx, by, bw, bh, 12, 'fill="none" stroke="#8E5A2C" stroke-width="4"')
    for (x, y) in ((bx - 11, by - 11), (bx + bw + 11, by - 11), (bx - 11, by + bh + 11), (bx + bw + 11, by + bh + 11)):
        o += circ(x, y, 5, 'fill="#E6B47E" stroke="#8E5A2C" stroke-width="2"')
    # the shadow slot (same piece silhouette as the held piece)
    sx, sy, ss = bx + 172, by + 128, 66
    slot = piece_d(sx, sy, ss, (1, 1, -1, 1))
    o += path(slot, 'fill="rgba(40,36,60,0.34)" stroke="rgba(40,36,60,0.5)" stroke-width="6" stroke-linejoin="round"')
    o += path(slot, 'fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-dasharray="10 8" stroke-linejoin="round"')
    # Pom (happy) bottom-left, holding the red piece up with the trunk (the piece rests on the curled tip)
    sc = 1.22
    tx, ty = 150 - 150 * sc, 504 - 292 * sc
    pd = Doc('ip')
    pb, tip = pom(pd, 'happy', tpose='hold')
    d.defs.extend(pd.defs)
    tipx, tipy = tx + tip[0] * sc, ty + tip[1] * sc
    px, py = tipx + 22, tipy - 46
    pdd = piece_d(px, py, ss, (1, 1, -1, 1), -10)
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{pb}</g>'
    o += d.shaded(f'<path d="{pdd}" {{a}}/>', '#E84A4A', '#C23A3D', '#A8282E', dx=-6, dy=-6, w=5,
                  hi=ell(px - 14, py - 14, 12, 6, f'fill="#F7A0A0" transform="rotate(-40 {f(px - 14)} {f(py - 14)})"'))
    # dotted arc from the piece to the slot + sparkles
    o += path(f'M{f(px + 44)},{f(py - 30)} Q{f((px + sx) / 2 + 20)},{f(min(py, sy) - 90)} {f(sx)},{f(sy - 56)}',
              st('#FFFFFF', 6) + ' stroke-dasharray="1 14"')
    o += star4(px - 46, py - 40, 14, w=2.4) + star4(px + 52, py + 30, 10, w=2) + star4(sx + 60, sy - 70, 12, w=2)
    return svg(512, 512, o, ''.join(dict.fromkeys(d.defs)))


def main():
    tbl = write_pom()
    write('characters/pigeon.svg', pigeon(False))
    write('characters/pigeon_flap.svg', pigeon(True))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:10s} {v}')


if __name__ == '__main__':
    main()
