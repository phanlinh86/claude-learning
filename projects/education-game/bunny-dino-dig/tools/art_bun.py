#!/usr/bin/env python3
"""Character art generator for Bun's Dino Dig (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/bun_{idle,blink,talk,happy,cheer,think,oops,wave,point,dig}.svg + bun_full_wave.svg
        0 0 300 300, FEET ANCHOR (150,292). Bun (a round cream bunny explorer in a khaki explorer hat, a brown
        satchel across the chest) faces RIGHT in 3/4 view, eyes on the viewer. Body, belly, satchel, feet and tail are
        identical in every frame; only eyes, mouth, brows, ears, arms and (think / oops) a small head tilt change.
        Bun holds no tool; docs/art/bun_hand.json gives per frame the near (right) paw point and the head top.
  characters/mole.svg, mole_happy.svg        0 0 160 140, bottom anchor (80,136)
  characters/ptero.svg, ptero_flap.svg       0 0 200 140, centre anchor (100,70), facing right
  characters/dino_baby_<colour>.svg          0 0 160 160, bottom anchor (80,156), facing right, identical bodies
  icon.svg                                   0 0 512 512, full bleed, opaque

Usage: python3 tools/art_bun.py [outDir]
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
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'bun_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

B = {  # Bun palette (DESIGN.md section 3)
    'fur': '#F4ECDF', 'furSh': '#DCCDB6', 'furLine': '#9C8A70', 'furHi': '#FFFFFF', 'belly': '#FFF9F0',
    'blush': '#F2C1BC', 'blushSh': '#E3A7A1', 'cheek': '#F6B1A0',
    'pupil': '#2F2A3A', 'white': '#FFFFFF', 'mouth': '#7C3B33', 'tongue': '#F28F86',
    'hat': '#C9B48A', 'hatSh': '#AE9869', 'hatLine': '#7A6644', 'hatHi': '#E3D4B0', 'band': '#7D6A4A',
    'bag': '#9A6B43', 'bagSh': '#7E5332', 'bagLine': '#5B3A21', 'buckle': '#D8C08A', 'brow': '#8A765C',
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


def mix(c1, c2, t):
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join('%02X' % round(a[i] + (b[i] - a[i]) * t) for i in range(3))


class Doc:
    """Collects <defs> with unique ids (prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='b'):
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
    """Smooth closed path through points (Catmull-Rom → cubic Bézier)."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0, p1 = pts[(i - 1) % n] if close or i > 0 else pts[0], pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if close or i + 2 < n else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if close else '')


# ======================================================================= BUN
BODY = (150, 246, 56, 44)          # x 94-206, y 202-290 (+ outline = 292)
BELLY = (166, 254, 30, 31)
HEAD = (160, 150, 66, 54)          # x 94-226, y 96-204
NECK = (160, 202)                  # tilt pivot
EYE_N = (148, 152, 17.5)           # near eye (viewer's left, bigger)
EYE_F = (190, 148, 14)             # far eye (towards the snout)
NOSE = (205, 166)
MOUTH = (204, 176)
SH_F = (108, 218)                  # far arm shoulder (behind the body)
SH_N = (194, 220)                  # near (right) arm shoulder (in front)
EAR_W = 16                         # ear half width
# arm hanging straight down from the shoulder (0,0); paw centre at (0,40)
ARM_L = 32                         # default arm length (shoulder → paw centre)


def arm_d(L):
    return (f'M-12,-6 C-14,8 -16,{f(L - 12)} -15,{f(L - 3)} C-14,{f(L + 13)} 14,{f(L + 13)} 15,{f(L - 3)} '
            f'C16,{f(L - 12)} 14,8 12,-6 C6,-14 -6,-14 -12,-6 Z')

EARS = {  # (base, ctrl, tip) for far ear and near ear; bases sit in slits on the hat crown
    'rest':  (((180, 78), (184, 22), (218, 34)), ((142, 80), (138, 44), (122, 10))),
    'up':    (((178, 78), (182, 42), (188, 8)), ((142, 80), (140, 44), (132, 8))),
    'perk':  (((180, 78), (186, 26), (212, 22)), ((142, 80), (138, 44), (126, 8))),
    'droop': (((180, 78), (190, 34), (226, 52)), ((142, 80), (130, 48), (108, 22))),
}


def ear_pts(base, ctrl, tip, wmax, n=22, t0=0.0, t1=1.0):
    """Outline points of a leaf-shaped ear along a quadratic centre line."""
    left, right = [], []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        x = (1 - t) ** 2 * base[0] + 2 * (1 - t) * t * ctrl[0] + t * t * tip[0]
        y = (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * ctrl[1] + t * t * tip[1]
        dx = 2 * (1 - t) * (ctrl[0] - base[0]) + 2 * t * (tip[0] - ctrl[0])
        dy = 2 * (1 - t) * (ctrl[1] - base[1]) + 2 * t * (tip[1] - ctrl[1])
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        u = (t - t0) / (t1 - t0) if t1 > t0 else 0
        w = wmax * math.sqrt(max(0.0, 1 - u ** 3)) * (0.8 + 0.34 * math.sin(math.pi * u))
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return left + right[::-1][1:-1]


def ear(doc, spec):
    base, ctrl, tip = spec
    outer = ptsd(ear_pts(base, ctrl, tip, EAR_W))
    # inner ear: a narrower leaf from 18 % to 92 % of the length
    inner = ptsd(ear_pts(base, ctrl, tip, EAR_W * 0.5, t0=0.18, t1=0.9))
    o = ''
    # only the part above the slit shows (the ear comes out of the crown)
    cid = doc.clip(rect(0, 0, 300, base[1]) + ell(base[0], base[1], 15.5, 5))
    o += f'<g clip-path="url(#{cid})">'
    o += doc.shaded(f'<path d="{outer}" {{a}}/>', B['fur'], B['furSh'], B['furLine'], dx=-5, dy=-3)
    o += path(inner, f'fill="{B["blush"]}"')
    o += '</g>'
    return o


def eye(cx, cy, r, mode='open', look=(-2, 2)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.08 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.92, rr, fl(B['white'], B['furLine'], 3.6))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.68 if mode == 'wide' else 0.64)
        o += ell(px, py, pr * 0.92, pr, f'fill="{B["pupil"]}"')
        o += circ(px - pr * 0.32, py - pr * 0.4, pr * 0.4, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.4, py + pr * 0.42, pr * 0.16, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.8)},{f(cy)} Q{f(cx)},{f(cy + r * 0.6)} {f(cx + r * 0.8)},{f(cy)}',
                  st(B['pupil'], 5))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.78)},{f(cy + r * 0.3)} Q{f(cx)},{f(cy - r * 0.85)} {f(cx + r * 0.78)},{f(cy + r * 0.3)}',
                  st(B['pupil'], 5.6))
    return o


def nose():
    nx, ny = NOSE
    return (path(f'M{nx - 7},{ny - 3} Q{nx},{ny - 7} {nx + 7},{ny - 3} Q{nx + 6},{ny + 3} {nx},{ny + 5} '
                 f'Q{nx - 6},{ny + 3} {nx - 7},{ny - 3} Z', fl(B['blush'], B['blushSh'], 2.6).replace(
                     B['blushSh'], '#C98B85'))
            + ell(nx - 2.5, ny - 2.5, 2.4, 1.4, 'fill="#FFFFFF" opacity=".8"'))


def teeth(mx, y, k=1.0):
    return (rect(mx - 5.6 * k, y - 1, 5.2 * k, 6.5 * k, 1.4, fl('#FFFFFF', '#C9B9A6', 1.6))
            + rect(mx + 0.4 * k, y - 1, 5.2 * k, 6.5 * k, 1.4, fl('#FFFFFF', '#C9B9A6', 1.6)))


def mouth(mode):
    mx, my = MOUTH
    line = B['furLine']
    stem = path(f'M{mx + 1},{NOSE[1] + 5} L{mx + 1},{my - 1}', st(line, 3.4))
    if mode == 'closed':           # bunny "w" smile
        return stem + path(f'M{mx - 10},{my - 2} Q{mx - 5},{my + 5} {mx + 1},{my - 1} Q{mx + 7},{my + 5} {mx + 12},{my - 3}',
                           st(line, 3.6))
    if mode == 'talk':
        o = stem
        o += path(f'M{mx - 9},{my} Q{mx + 1},{my - 3} {mx + 11},{my - 1} Q{mx + 10},{my + 16} {mx + 1},{my + 17} '
                  f'Q{mx - 9},{my + 15} {mx - 9},{my} Z', fl(B['mouth'], line, 3.2))
        o += ell(mx + 1, my + 12, 6, 3.6, f'fill="{B["tongue"]}"')
        o += teeth(mx + 1, my - 0.5, 0.85)
        return o
    if mode in ('smile', 'big'):
        k = 1.25 if mode == 'big' else 1.0
        w, h = 14 * k, 15 * k
        o = stem
        o += path(f'M{f(mx - w)},{f(my - 3)} Q{mx + 1},{f(my + 1)} {f(mx + w + 1)},{f(my - 5)} '
                  f'Q{f(mx + w * 0.8)},{f(my + h)} {mx + 1},{f(my + h)} Q{f(mx - w * 0.8)},{f(my + h)} {f(mx - w)},{f(my - 3)} Z',
                  fl(B['mouth'], line, 3.2))
        o += ell(mx + 1, my + h - 4.5 * k, 7.5 * k, 3.8 * k, f'fill="{B["tongue"]}"')
        o += teeth(mx + 1, my - 1.2, k)
        return o
    if mode == 'o':                 # curious "hmm?"
        return stem + ell(mx + 2, my + 5, 5.5, 6.5, fl(B['mouth'], line, 3))
    if mode == 'hmm':               # little wavy curious mouth
        return stem + path(f'M{mx - 9},{my + 3} Q{mx - 4},{my - 2} {mx + 1},{my + 2} Q{mx + 6},{my + 6} {mx + 11},{my}',
                           st(line, 3.6))
    return ''


def hat(doc, ears):
    """Khaki explorer hat: brim, domed crown with a band; the ears come out of two slits on the crown."""
    o = ''
    brim = '<ellipse cx="158" cy="108" rx="86" ry="17" transform="rotate(-5 158 108)" {a}/>'
    o += doc.shaded(brim, B['hat'], B['hatSh'], B['hatLine'], dx=-4, dy=-6)
    crown = 'M108,108 C104,80 126,60 158,60 C190,60 212,78 210,104 C182,112 136,114 108,108 Z'
    hi = ell(130, 74, 16, 7, 'fill="#FFFFFF" opacity=".45" transform="rotate(-24 130 74)"')
    cid = doc.clip(f'<path d="{crown}"/>')
    o += path(crown, f'fill="{B["hatSh"]}"')
    o += (f'<g clip-path="url(#{cid})"><path d="{crown}" transform="translate(-7,-6)" fill="{B["hat"]}"/>'
          f'<path d="M100,96 C140,104 180,100 220,90 L220,120 L100,120 Z" fill="{B["band"]}"/>{hi}</g>')
    o += path('M106,97 C140,105 180,101 212,91', st('#5F4F35', 2) + ' opacity=".5"')
    o += path(crown, f'fill="none" stroke="{B["hatLine"]}" stroke-width="{f(LW)}" stroke-linejoin="round"')
    # ear slits (dark) and the ears out of them, far ear first
    for spec in ears:
        bx, by = spec[0]
        o += ell(bx, by, 15.5, 5, fl('#5F4F35', B['hatLine'], 2.4))
    for spec in ears:
        o += ear(doc, spec)
    # stitched brim edge
    o += path('M76,118 C110,132 200,128 240,104', st(B['hatHi'], 2.4) + ' stroke-dasharray="1 7" opacity=".9"')
    return o


def head(doc, eyes='open', mo='closed', brows=None, look=(-2, 2), ears='rest'):
    hx, hy, hrx, hry = HEAD
    o = ''
    hi = ell(118, 128, 22, 12, 'fill="#FFFFFF" opacity=".55" transform="rotate(-32 118 128)"')
    tpl = f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>'
    cid = doc.clip(tpl.format(a=''))
    o += tpl.format(a=f'fill="{B["furSh"]}"')
    o += (f'<g clip-path="url(#{cid})"><g transform="translate(-11,-9)">{tpl.format(a=chr(102) + "ill=" + chr(34) + B["fur"] + chr(34))}</g>'
          f'{ell(201, 176, 25, 19, chr(102) + "ill=" + chr(34) + B["belly"] + chr(34))}{hi}</g>')
    o += tpl.format(a=f'fill="none" stroke="{B["furLine"]}" stroke-width="{f(LW)}"')
    # cheek fluff tuft at the back of the head
    o += path('M95,166 Q86,172 92,178 Q88,186 98,186', st(B['furLine'], 3.2))
    # cheeks
    o += ell(124, 178, 14, 8.5, f'fill="{B["cheek"]}" opacity=".85"')
    o += ell(216, 174, 6.5, 6, f'fill="{B["cheek"]}" opacity=".85"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    o += nose()
    o += mouth(mo)
    o += hat(doc, EARS[ears])
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 9 - lift
            o += path(f'M{f(cx - 9)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 9)},{f(y + 3)}', st(B['brow'], 4))
    # whisker dots on the muzzle
    for (x, y) in ((193, 176), (189, 170), (217, 178)):
        o += circ(x, y, 1.5, f'fill="{B["furLine"]}" opacity=".6"')
    return o


def arm(doc, sh, ang, L=ARM_L, finger=False, beans=False):
    """Stubby arm of length L (shoulder → paw centre); ang 0 = hanging down, > 0 swings the paw to the viewer's
    LEFT, < 0 to the RIGHT. beans = show the palm with little pads (waving / cheering)."""
    tf = f'translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)})'
    o = ''
    if finger:
        o += (f'<g transform="{tf}">' + rect(-5, L - 6, 10, 31, 5, fl(B['fur'], B['furLine'], 3.6)) + '</g>')
    tpl = f'<path d="{arm_d(L)}" transform="{tf}" {{a}}/>'
    hi = f'<path d="M-6,0 C-8,{f(L * 0.4)} -8,{f(L * 0.8)} -6,{f(L + 2)}" transform="{tf}" {st("#FFFFFF", 4)} opacity=".6"/>'
    o += doc.shaded(tpl, B['fur'], B['furSh'], B['furLine'], dx=-5, dy=-4, hi=hi)
    if beans:
        o += (f'<g transform="{tf}" fill="{B["blush"]}">' + ell(0, L + 3, 6.5, 5) + circ(-8, L - 6, 2.8) + circ(0, L - 9, 2.8)
              + circ(8, L - 6, 2.8) + '</g>')
    else:
        o += f'<path d="M-7,{f(L + 6)} Q0,{f(L + 9)} 7,{f(L + 6)}" transform="{tf}" {st(B["furSh"], 2.6)}/>'
    return o


def local_pt(sh, ang, L, p):
    x, y = rot(p[0], p[1], ang)
    return sh[0] + x, sh[1] + y


def body(doc):
    o = ''
    # cotton tail (back, viewer's left)
    tail = ptsd([(84 + 16 * math.cos(a) * (1 + 0.07 * math.cos(6 * a)), 240 + 15 * math.sin(a) * (1 + 0.07 * math.cos(6 * a)))
                 for a in [i * math.pi / 12 for i in range(24)]])
    o += doc.shaded(f'<path d="{tail}" {{a}}/>', B['belly'], B['furSh'], B['furLine'], dx=-4, dy=-4, w=3.8)
    o += path('M80,236 Q84,232 88,236 M76,246 Q80,243 84,246', st(B['furSh'], 2.4))
    bx, by, brx, bry = BODY
    tpl = f'<ellipse cx="{bx}" cy="{by}" rx="{brx}" ry="{bry}" {{a}}/>'
    hi = ell(118, 222, 14, 8, 'fill="#FFFFFF" opacity=".5" transform="rotate(-30 118 222)"')
    o += doc.shaded(tpl, B['fur'], B['furSh'], B['furLine'], dx=-12, dy=-9, hi=hi)
    # belly patch (lighter, no outline)
    px, py, prx, pry = BELLY
    o += ell(px, py, prx, pry, f'fill="{B["belly"]}"')
    # feet: big bunny feet pointing right
    for (cx, cy, rx, a) in ((116, 281, 24, 4), (180, 281, 30, -3)):
        o += doc.shaded(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="9" transform="rotate({a} {cx} {cy})" {{a}}/>',
                        B['fur'], B['furSh'], B['furLine'], dx=-4, dy=-4)
        o += ell(cx + rx * 0.45, cy + 1, 6, 4, f'fill="{B["blush"]}" opacity=".9"')
    # satchel strap: over the near shoulder, down across the chest to the bag at the back hip
    o += path('M196,206 C182,226 160,238 136,248', st(B['bagLine'], 11))
    o += path('M196,206 C182,226 160,238 136,248', st(B['bag'], 6.4))
    # bag (front of the near hip)
    o += '<g transform="translate(10,-1)">'
    bag = 'M96,246 C96,238 102,236 110,236 L138,236 C146,236 150,240 150,248 L148,272 C147,280 142,282 134,282 L110,282 C102,282 98,280 97,272 Z'
    o += doc.shaded(f'<path d="{bag}" {{a}}/>', B['bag'], B['bagSh'], B['bagLine'], dx=-5, dy=-4, w=4)
    flap = 'M95,244 C95,236 102,234 110,234 L138,234 C147,234 151,238 151,246 L150,256 C140,262 106,262 96,256 Z'
    o += doc.shaded(f'<path d="{flap}" {{a}}/>', '#AE7D52', B['bag'], B['bagLine'], dx=-3, dy=-3, w=3.6)
    o += path('M100,252 C112,257 134,257 146,252', st('#C99A6C', 2) + ' stroke-dasharray="1 5"')
    o += rect(117, 252, 12, 11, 3, fl(B['buckle'], '#8E7440', 2.6))
    o += '</g>'
    return o


R_F, R_N = (SH_F, 16, 32), (SH_N, -14, 32)
POSES = {
    #           eyes      mouth     far arm (sh, ang, L)     near (right) arm             tilt brows    look      ears
    'idle':    ('open',   'closed', R_F,                     R_N,                         0, None,     (-2, 2),  'rest'),
    'blink':   ('closed', 'closed', R_F,                     R_N,                         0, None,     (-2, 2),  'rest'),
    'talk':    ('open',   'talk',   (SH_F, 28, 32),          (SH_N, -32, 32),             0, None,     (-2, 2),  'rest'),
    'happy':   ('wide',   'big',    (SH_F, 56, 34),          (SH_N, -62, 34),             0, None,     (-2, 1),  'perk'),
    'cheer':   ('happy',  'big',    ((112, 212), 142, 66),   ((198, 212), -142, 66),      0, None,     (0, 0),   'up'),
    'think':   ('look',   'hmm',    R_F,                     ((200, 222), 174, 27),       6, (0, 6),   (4, -5),  'rest'),
    'oops':    ('wide',   'o',      (SH_F, 40, 30),          ((196, 216), -72, 30),      -6, (8, 0),   (-2, 1),  'droop'),
    'wave':    ('open',   'smile',  R_F,                     ((200, 214), -140, 62),      0, None,     (-2, 2),  'perk'),
    'point':   ('look',   'talk',   R_F,                     ((198, 216), -108, 35),      0, (4, 4),   (4, -3),  'perk'),
    'dig':     ('wide',   'big',    ((184, 212), -100, 36),  ((198, 224), -76, 36),       0, None,     (-1, 2),  'up'),
    'full_wave': ('wide', 'smile',  ((108, 214), 128, 35),   ((200, 214), -140, 62),      0, None,     (-2, 2),  'perk'),
}
BEHIND_HEAD = ('cheer', 'wave', 'full_wave')   # raised near arm drawn behind the head: only the paw shows beside it


def paw_pt(spec, tip=0):
    sh, ang, L = spec
    return local_pt(sh, ang, L, (0, L + tip))


def magnifier(cx, cy, r=19, ang=-40):
    """Little magnifying glass: lens centre (cx,cy), handle pointing along ang (degrees) away from the lens."""
    a = math.radians(ang)
    hx, hy = cx + math.cos(a) * (r + 2), cy + math.sin(a) * (r + 2)
    ex, ey = cx + math.cos(a) * (r + 30), cy + math.sin(a) * (r + 30)
    o = path(f'M{f(hx)},{f(hy)} L{f(ex)},{f(ey)}', st('#5B3A21', 12))
    o += path(f'M{f(hx)},{f(hy)} L{f(ex)},{f(ey)}', st('#9A6B43', 7))
    o += circ(cx, cy, r, 'fill="#DDF1F7" fill-opacity=".85" stroke="#6B7380" stroke-width="5"')
    o += circ(cx, cy, r - 3.5, 'fill="none" stroke="#B9C3CC" stroke-width="2.4"')
    o += path(f'M{f(cx - r * 0.55)},{f(cy - r * 0.1)} Q{f(cx - r * 0.5)},{f(cy - r * 0.55)} {f(cx - r * 0.1)},{f(cy - r * 0.6)}',
              st('#FFFFFF', 3.4))
    return o


def bun(doc, pose, near_arm=True):
    eyes, mo, aF, aN, tilt, brows, look, ears = POSES[pose]
    o = ''
    if pose not in ('full_wave', 'dig'):
        o += arm(doc, *aF, beans=(pose == 'cheer'))
    o += body(doc)
    if pose == 'dig':                     # both paws forward: the far one shows above the near one
        o += arm(doc, *aF)
    if pose in BEHIND_HEAD:
        o += arm(doc, *aN, beans=True)
    if pose == 'full_wave':
        px, py = paw_pt(aF)
        o += magnifier(px - 22, py - 30, 19, 54)
        o += arm(doc, *aF)
    hd = head(doc, eyes, mo, brows, look, ears)
    if tilt:
        hd = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{hd}</g>'
    o += hd
    if pose in ('wave', 'full_wave'):
        o += path('M262,104 Q276,116 278,134 M276,88 Q294,106 292,138', st(B['hatLine'], 3.6) + ' opacity=".75"')
    if pose == 'cheer':
        for (x, y, r) in ((50, 120, 5), (262, 122, 5), (40, 92, 3.4), (272, 94, 3.4)):
            o += circ(x, y, r, f'fill="none" stroke="{B["hatLine"]}" stroke-width="2.6" opacity=".8"')
    if pose == 'dig':
        o += path('M252,206 L266,200 M256,222 L272,222 M252,238 L266,244', st(B['hatLine'], 3.6) + ' opacity=".75"')
    if pose == 'oops':
        o += path('M246,84 Q246,72 256,72 Q266,72 264,82 Q262,90 254,92 L254,98', st(B['hatSh'], 4))
        o += circ(254, 108, 2.6, f'fill="{B["hatSh"]}"')
    if near_arm and pose not in BEHIND_HEAD:
        o += arm(doc, *aN, finger=(pose == 'point'))
    return o


def hand_table():
    out = {}
    for pose, p in POSES.items():
        px, py = paw_pt(p[3])
        tx, ty = paw_pt(p[3], 25 if pose == 'point' else 10)
        top = min(e[2][1] for e in EARS[p[7]]) - EAR_W * 0.2
        if p[4]:
            top += 4
        out[pose] = {'paw': [round(px), round(py)], 'tip': [round(tx), round(ty)], 'earTop': round(top),
                     'hatTop': 58 + (3 if p[4] else 0), 'eye': [EYE_N[0], EYE_N[1]]}
    return out


def write_bun():
    for pose in POSES:
        d = Doc('b')
        b = bun(d, pose)
        write(f'characters/bun_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
    tbl = hand_table()
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        json.dump({'_about': ('Bun per frame, in the 0 0 300 300 viewBox (feet anchor 150,292). paw = centre of the near '
                              '(right) paw; tip = the paw / finger tip (point: the pointing finger tip, use it for the '
                              'hint direction); earTop = y of the highest ear tip; hatTop = y of the hat crown top '
                              '(use it for a speech-bubble tail / stars over the head); eye = near eye centre; bbox = measured opaque box '
                              '(added by tools/bun_sheet.js).'),
                   **tbl}, fh, indent=1)
        fh.write('\n')
    return tbl


# ======================================================================= MOLE
MO = {'fur': '#8F7E74', 'sh': '#76665D', 'line': '#55473F', 'light': '#B3A398', 'nose': '#F2B8B0',
      'noseLine': '#C27E77', 'dirt': '#8E6A3E', 'dirtSh': '#6E5130', 'dirtLine': '#4E3A22', 'dirtHi': '#A9834A'}


def mole(happy=False):
    d = Doc('m')
    o = ''
    # dirt ring back half + hole
    o += ell(80, 124, 64, 15, fl(MO['dirt'], MO['dirtLine'], 4))
    o += ell(80, 122, 46, 9, 'fill="#5E4426"')
    # body, clipped above the ring line
    bt = '<path d="M38,124 C36,70 54,34 80,34 C106,34 124,70 122,124 Z" {a}/>'
    hi = ell(60, 56, 12, 8, 'fill="#FFFFFF" opacity=".35" transform="rotate(-35 60 56)"')
    o += d.shaded(bt, MO['fur'], MO['sh'], MO['line'], dx=-8, dy=-6, hi=hi)
    # lighter face patch
    o += ell(80, 86, 30, 22, f'fill="{MO["light"]}"')
    # tiny ears
    o += circ(46, 54, 6, fl(MO['fur'], MO['line'], 3.4)) + circ(114, 54, 6, fl(MO['fur'], MO['line'], 3.4))
    # eyes
    if happy:
        for x in (64, 96):
            o += path(f'M{x - 8},{68} Q{x},{56} {x + 8},{68}', st('#2F2A3A', 5))
    else:
        for x in (64, 96):
            o += circ(x, 64, 10, fl('#FFFFFF', MO['line'], 3))
            o += circ(x + 1, 66, 6.6, 'fill="#2F2A3A"') + circ(x - 1.4, 63, 2.6, 'fill="#FFFFFF"')
            o += circ(x + 3, 69, 1.1, 'fill="#FFFFFF"')
    # cheeks
    o += ell(52, 86, 7, 5, 'fill="#F6B1A0" opacity=".9"') + ell(108, 86, 7, 5, 'fill="#F6B1A0" opacity=".9"')
    # big pink nose
    o += ell(80, 82, 11, 8, fl(MO['nose'], MO['noseLine'], 3)) + ell(76, 79, 3.4, 2, 'fill="#FFFFFF" opacity=".8"')
    # mouth
    if happy:
        o += path('M68,94 Q80,96 92,94 Q90,108 80,108 Q70,108 68,94 Z', fl('#7C3B33', MO['line'], 2.8))
        o += ell(80, 104, 6, 3, 'fill="#F28F86"')
    else:
        o += path('M72,94 Q76,99 80,95 Q84,99 88,94', st(MO['line'], 3))
    # whiskers
    for s in (-1, 1):
        o += path(f'M{80 + s * 18},{86} L{80 + s * 34},{82} M{80 + s * 18},{90} L{80 + s * 34},{92}', st(MO['line'], 2) + ' opacity=".6"')
    # front ring lip of dirt (in front of the body)
    lip = 'M16,124 C16,134 44,140 80,140 C116,140 144,134 144,124 C130,130 108,132 80,132 C52,132 30,130 16,124 Z'
    o += path(lip, fl(MO['dirt'], MO['dirtLine'], 3.6))
    # paws on the rim
    for x in (54, 106):
        o += ell(x, 120, 12, 8, fl(MO['nose'], MO['noseLine'], 3))
        o += path(f'M{x - 6},{124} L{x - 6},{128} M{x},{125} L{x},{129} M{x + 6},{124} L{x + 6},{128}', st('#F7E6DD', 2.4))
    # dirt crumbs
    for (x, y, r) in ((24, 120, 4), (136, 118, 4.5), (34, 112, 3), (128, 110, 2.6)):
        o += circ(x, y, r, fl(MO['dirtHi'], MO['dirtLine'], 2))
    if happy:
        for (x, y) in ((20, 40), (140, 36)):
            o += path(f'M{x},{y - 8} L{x + 2.4},{y - 2.4} L{x + 8},{y} L{x + 2.4},{y + 2.4} L{x},{y + 8} L{x - 2.4},{y + 2.4} '
                      f'L{x - 8},{y} L{x - 2.4},{y - 2.4} Z', 'fill="#FFF6C8" stroke="#E2C86A" stroke-width="1.4"')
    return svg(160, 140, o, ''.join(d.defs))


# ======================================================================= PTEROSAUR
PT = {'skin': '#7FB2B0', 'sh': '#5F908E', 'line': '#44706E', 'light': '#B3D6D3', 'belly': '#F6EBD3',
      'bellyLine': '#B9A57E', 'wing': '#9CC6C3', 'wingSh': '#7FAAA7', 'beak': '#E8C99A', 'beakLine': '#9E7E4F'}


def wing(d, up, far=False):
    """Broad bat-like wing membrane from the shoulder (98,66) with a scalloped trailing edge. up = wings raised."""
    if up:
        lead = 'M98,62 C92,42 78,28 62,22 C48,16 34,13 18,12'
        pts = lead + ' C24,24 28,32 36,38 C42,36 50,42 50,50 C58,48 64,54 64,60 C72,60 78,66 80,76 Z'
    else:
        lead = 'M100,68 C100,92 86,116 58,134'
        pts = lead + ' C54,122 46,112 34,106 C42,102 48,98 50,92 C58,92 64,86 64,80 C70,82 76,80 82,76 Z'
    tf = ('translate(20,-6)' if up else 'translate(18,-8)') if far else ''
    fill, sh = (PT['wingSh'], PT['sh']) if far else (PT['wing'], PT['wingSh'])
    o = d.shaded(f'<path d="{pts}" transform="{tf}" {{a}}/>', fill, sh, PT['line'], dx=-4, dy=4 if not up else -4, w=4)
    # wing finger along the leading edge + a little claw at the wrist
    o += path(lead, f'transform="{tf}" ' + st(PT['skin'], 3.4) + ' opacity=".9"')
    return o


def ptero(flap=False):
    d = Doc('p')
    o = ''
    up = not flap
    o += wing(d, up, far=True)
    # tail with a little diamond tip
    o += path('M72,80 C58,86 46,88 34,86', st(PT['line'], 8)) + path('M72,80 C58,86 46,88 34,86', st(PT['skin'], 4))
    o += path('M36,86 L26,80 L20,88 L28,94 Z', fl(PT['light'], PT['line'], 3))
    # tiny feet tucked
    o += path('M88,96 L84,106 M100,96 L98,106', st(PT['line'], 4))
    # body
    bt = '<ellipse cx="96" cy="76" rx="30" ry="23" {a}/>'
    hi = ell(84, 64, 9, 5, 'fill="#FFFFFF" opacity=".4" transform="rotate(-25 84 64)"')
    o += d.shaded(bt, PT['skin'], PT['sh'], PT['line'], dx=-6, dy=-5, hi=hi)
    o += ell(104, 84, 18, 12, f'fill="{PT["belly"]}"')
    # head crest (points back-up) then head
    o += path('M122,42 C110,20 92,10 68,12 C84,22 100,36 116,52 Z', fl(PT['light'], PT['line'], 3.6))
    ht = '<circle cx="134" cy="54" r="23" {a}/>'
    hi2 = ell(126, 42, 8, 5, 'fill="#FFFFFF" opacity=".45" transform="rotate(-30 126 42)"')
    # beak first so the head overlaps its base
    o += path('M148,48 C164,44 182,50 190,60 C182,70 164,74 150,72 Z', fl(PT['beak'], PT['beakLine'], 3.6))
    o += path('M154,61 C166,62 178,61 188,60', st(PT['beakLine'], 2.2))
    o += d.shaded(ht, PT['skin'], PT['sh'], PT['line'], dx=-5, dy=-5, hi=hi2)
    o += ell(146, 62, 6, 4, 'fill="#F6B1A0" opacity=".9"')
    o += circ(136, 50, 10, fl('#FFFFFF', PT['line'], 3))
    o += circ(138, 51, 6.4, 'fill="#2F2A3A"') + circ(135.6, 48, 2.5, 'fill="#FFFFFF"') + circ(140.4, 54, 1, 'fill="#FFFFFF"')
    # near wing on top
    o += wing(d, up)
    return svg(200, 140, o, ''.join(d.defs))


# ======================================================================= BABY DINO
PALETTE = {
    'red': ('#E84A4A', '#A8282E', '#F7A0A0'), 'blue': ('#3C8DE8', '#1F5BA8', '#A6CCF5'),
    'yellow': ('#FFD23F', '#C99A12', '#FFEB9C'), 'green': ('#4CC26B', '#2A8343', '#A8E6B8'),
    'orange': ('#FF9A2E', '#C4650C', '#FFCB8E'), 'purple': ('#8E44AD', '#6840A8', '#D2BDF3'),
    'pink': ('#FF8FC0', '#C9558A', '#FFCCE2'),
}


def dino_body(d, base, dark, light, ox=0, oy=0, happy=False):
    """The hatchling drawn in 0 0 160 160, bottom anchor (80,156), facing right."""
    sh = mix(base, dark, 0.38)
    o = ''
    # back spikes (light, behind the body/head)
    for (x, y, a, s) in ((40, 92, -50, 1.0), (52, 78, -30, 1.1), (66, 50, -40, 1.15), (68, 32, -10, 1.0)):
        o += (f'<path d="M-9,4 C-6,-8 -2,-14 0,-16 C3,-12 8,-6 9,4 Z" transform="translate({x},{y}) rotate({a}) scale({s})" '
              f'{fl(light, dark, 3.4)}/>')
    # tail
    tail = 'M48,118 C34,124 20,128 8,124 C14,132 30,138 48,138 Z'
    o += d.shaded(f'<path d="{tail}" {{a}}/>', base, sh, dark, dx=-3, dy=-3, w=4)
    # far leg
    o += d.shaded('<ellipse cx="102" cy="148" rx="15" ry="9" {a}/>', base, sh, dark, dx=-3, dy=-3, w=4)
    # body
    bt = '<ellipse cx="76" cy="118" rx="38" ry="33" {a}/>'
    o += d.shaded(bt, base, sh, dark, dx=-8, dy=-7, w=4)
    o += ell(86, 124, 22, 22, f'fill="{light}"')
    for (y) in (114, 124, 134):
        o += path(f'M{72},{y} Q86,{y + 3} {100},{y}', st(mix(light, base, 0.45), 2.4))
    # near leg
    o += d.shaded('<ellipse cx="68" cy="148" rx="17" ry="9.5" {a}/>', base, sh, dark, dx=-3, dy=-3, w=4)
    for x in (76, 82):
        o += circ(x, 150, 2.2, f'fill="{light}"')
    # spots on the back
    for (x, y, r) in ((50, 108, 5), (58, 126, 4), (46, 124, 3)):
        o += circ(x, y, r, f'fill="{sh}"')
    # head
    ht = '<path d="M50,58 C48,30 70,14 94,16 C122,18 140,34 140,56 C140,80 120,92 94,92 C68,92 52,82 50,58 Z" {a}/>'
    hi = ell(70, 34, 12, 7, 'fill="#FFFFFF" opacity=".45" transform="rotate(-30 70 34)"')
    o += d.shaded(ht, base, sh, dark, dx=-8, dy=-7, w=4, hi=hi)
    # muzzle light
    o += ell(116, 70, 20, 14, f'fill="{light}" opacity=".9"')
    # nostrils
    o += ell(132, 56, 2, 2.6, f'fill="{dark}"')
    # cheek
    o += ell(98, 74, 8, 5, 'fill="#F6B1A0" opacity=".8"')
    # eyes
    for (cx, cy, r) in ((92, 50, 13), (122, 46, 10)):
        if happy:
            o += path(f'M{cx - r * 0.8},{cy + 3} Q{cx},{cy - r} {cx + r * 0.8},{cy + 3}', st('#2F2A3A', 4.6))
        else:
            o += ell(cx, cy, r * 0.94, r, fl('#FFFFFF', dark, 3))
            pr = r * 0.64
            o += ell(cx + 1, cy + 2, pr * 0.92, pr, 'fill="#2F2A3A"')
            o += circ(cx - pr * 0.25, cy + 2 - pr * 0.42, pr * 0.42, 'fill="#FFFFFF"')
            o += circ(cx + pr * 0.5, cy + 2 + pr * 0.4, pr * 0.16, 'fill="#FFFFFF"')
    # smile
    o += path('M104,74 Q118,84 132,72 Q128,88 116,88 Q106,86 104,74 Z', fl('#7C3B33', dark, 2.8))
    o += ell(118, 84, 6, 2.6, 'fill="#F28F86"')
    # tiny arms
    o += path('M106,112 C114,108 120,110 122,114 C120,118 114,120 108,120 Z', fl(base, dark, 3.4))
    o += path('M117,110 L121,107 M120,114 L125,113', st(dark, 2))
    return o


def dino(color):
    base, dark, light = PALETTE[color]
    d = Doc('d')
    o = ell(80, 155, 52, 4, f'fill="{dark}" opacity=".18"')
    o += dino_body(d, base, dark, light)
    return svg(160, 160, o, ''.join(d.defs))


# ======================================================================= ICON
def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ED8EE"/>'
                  f'<stop offset=".7" stop-color="#FBE9C9"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # pale sun
    o += circ(70, 70, 40, 'fill="#FFF4CF" opacity=".95"')
    # volcano with a smoke puff
    o += path('M300,300 L360,196 C368,186 384,186 392,196 L452,300 Z', 'fill="#B79C93"')
    o += path('M360,196 C368,206 384,206 392,196 C384,186 368,186 360,196 Z', 'fill="#9C7F76"')
    for (x, y, r) in ((376, 170, 18), (392, 150, 22), (370, 132, 16), (404, 120, 18)):
        o += circ(x, y, r, 'fill="#FFFFFF" opacity=".8"')
    # far hills
    o += path('M0,320 C60,270 130,262 200,292 C260,318 330,268 400,262 C450,258 490,280 512,290 L512,512 L0,512 Z',
              'fill="#A9C9A4"')
    # long-neck dino silhouette on the far hill
    o += path('M408,276 C404,256 408,236 418,222 C424,212 436,210 440,218 C444,226 434,226 428,232 C420,244 422,262 432,272 '
              'C448,270 470,272 478,280 L470,280 C462,282 452,280 446,282 L444,294 L438,294 L436,284 L416,284 L414,294 '
              'L408,294 Z', 'fill="#86AE88"')
    # mid ferns
    o += path('M0,370 C80,340 150,350 230,372 C320,396 420,350 512,360 L512,512 L0,512 Z', 'fill="#86B98A"')
    for (x, s) in ((40, 1), (470, 1.1)):
        for k in range(5):
            a = -70 + k * 35
            o += path(f'M{x},380 Q{x + 30 * s * math.cos(math.radians(a - 20))},{380 - 50 * s} '
                      f'{x + 56 * s * math.cos(math.radians(a))},{380 - 56 * s * math.sin(math.radians(abs(a) + 40))}',
                      st('#5E9A66', 9))
    # sand ground + mound
    o += path('M0,420 C120,404 300,410 512,398 L512,512 L0,512 Z', fl('#E9CF9A', '#CFAE72', 0))
    mound = 'M250,480 C258,430 300,404 352,402 C410,402 452,432 466,484 Z'
    o += d.shaded(f'<path d="{mound}" {{a}}/>', '#E9CF9A', '#CFAE72', '#A9834A', dx=-10, dy=-8, w=5,
                  hi=ell(330, 420, 34, 8, 'fill="#F6E3B9" transform="rotate(-8 330 420)"'))
    for (x, y, r) in ((60, 470, 6), (200, 492, 5), (480, 500, 7), (130, 446, 4)):
        o += ell(x, y, r * 1.4, r, fl('#CBB89A', '#9C8A70', 2.4))
    # Bun (happy, without the near arm) on the left; the egg is drawn over, then the near arm holds it up
    sc = 1.38
    tx, ty = 160 - 150 * sc, 500 - 292 * sc
    bd = Doc('ib')
    bb = bun(bd, 'happy', near_arm=False)
    d.defs.extend(bd.defs)
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{bb}</g>'
    # the egg held up, with a baby dino peeking out
    ex, ey = 352, 236
    dd = Doc('id')
    dk = dino_body(dd, *PALETTE['green'], happy=False)
    d.defs.extend(dd.defs)
    egg_top = ey - 30
    # jagged crack line on the egg top
    jag = ' '.join(f'L{f(ex - 66 + i * 11)},{f(egg_top + (9 if i % 2 else -5))}' for i in range(13))
    # clip: everything above the jagged rim (the dino's lower body hides inside the egg)
    jag_rev = ' '.join(f'L{f(ex - 66 + i * 11)},{f(egg_top + (9 if i % 2 else -5))}' for i in range(12, -1, -1))
    cid = d.clip(f'<path d="M{ex - 140},{egg_top - 260} L{ex + 140},{egg_top - 260} L{ex + 140},{egg_top} {jag_rev} '
                 f'L{ex - 140},{egg_top} Z"/>')
    o += (f'<g clip-path="url(#{cid})"><g transform="translate({ex - 100},{ey - 180}) scale(1.3)">'
          f'{dk}</g></g>')
    egg = (f'M{ex - 66},{egg_top} {" ".join(f"L{f(ex - 66 + i * 11)},{f(egg_top + (9 if i % 2 else -5))}" for i in range(13))} '
           f'C{ex + 72},{ey + 30} {ex + 52},{ey + 96} {ex},{ey + 96} C{ex - 52},{ey + 96} {ex - 72},{ey + 30} {ex - 66},{egg_top} Z')
    o += d.shaded(f'<path d="{egg}" {{a}}/>', '#F6EEDB', '#E1D2B2', '#A8946A', dx=-10, dy=-8, w=5,
                  hi=ell(ex - 34, ey + 12, 12, 20, 'fill="#FFFFFF" opacity=".7" transform="rotate(20 ' + f'{ex - 34} {ey + 12})"'))
    for (dx_, dy_, r) in ((-20, 30, 7), (24, 18, 6), (10, 60, 8), (-36, 56, 5), (38, 52, 5), (-4, 8, 4)):
        o += circ(ex + dx_, ey + dy_, r, 'fill="#4CC26B" opacity=".75"')
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{arm(bd, (196, 214), -124, 46)}</g>'
    d.defs.extend(bd.defs)  # the arm added clip paths to bd (duplicates are dropped when writing)
    # sparkles
    for (x, y, s) in ((440, 260, 14), (276, 248, 10), (456, 340, 9)):
        o += path(f'M{x},{y - s} L{x + s * 0.3},{y - s * 0.3} L{x + s},{y} L{x + s * 0.3},{y + s * 0.3} L{x},{y + s} '
                  f'L{x - s * 0.3},{y + s * 0.3} L{x - s},{y} L{x - s * 0.3},{y - s * 0.3} Z',
                  'fill="#FFF6C8" stroke="#E2C86A" stroke-width="2"')
    return svg(512, 512, o, ''.join(dict.fromkeys(d.defs)))


def main():
    tbl = write_bun()
    write('characters/mole.svg', mole(False))
    write('characters/mole_happy.svg', mole(True))
    write('characters/ptero.svg', ptero(False))
    write('characters/ptero_flap.svg', ptero(True))
    for c in PALETTE:
        write(f'characters/dino_baby_{c}.svg', dino(c))
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:10s} {v}')


if __name__ == '__main__':
    main()
