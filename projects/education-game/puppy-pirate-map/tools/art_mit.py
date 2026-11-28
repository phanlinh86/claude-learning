#!/usr/bin/env python3
"""Character art generator for Mit's Treasure Map (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/mit_{idle,blink,talk,happy,cheer,think,oops,wave,point,woof}.svg + mit_full_wave.svg
        0 0 300 300, SEAT/FEET ANCHOR (150,292). Mit = a round chubby cream puppy sitting up, 3/4 view facing RIGHT
        (towards the board), eyes on the viewer: floppy brown ears, a brown fur patch round the near eye, a folded
        paper pirate hat with a small anchor, a cream/brown striped collar. Body, haunch, tail, collar and the far hind
        foot are identical in every frame; only the face, the two front paws, the ears and the hat change.
        docs/art/mit_hand.json gives per frame the active paw point, the mouth, the hat top and the near eye.
  characters/crab.svg, crab_flap.svg      0 0 160 140, bottom anchor (80,136), frontal, flap = both claws up
  icon.svg                                0 0 512 512, full bleed, opaque, no text

Usage: python3 tools/art_mit.py [outDir]
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
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'mit_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

P = {  # Mit palette (DESIGN.md 0.1) — never an answer colour
    'fur': '#EFD9B4', 'sh': '#D9BC8E', 'line': '#8E6A45', 'light': '#F9ECD3',
    'ear': '#9C6B45', 'earSh': '#83552F', 'earLine': '#6A4528',
    'pupil': '#2F2A3A', 'white': '#FFFFFF', 'nose': '#4A3428', 'cheek': '#F4B0A3',
    'mouth': '#7C3B33', 'tongue': '#F28F86', 'pad': '#C98B76',
    'hat': '#F6EEDC', 'hatSh': '#E6D8B8', 'hatLine': '#B9A27A', 'anchor': '#8E6A45',
    'collar': '#F6EEDC', 'stripe': '#9C6B45', 'collarLine': '#7E5A38',
    'brass': '#C9A86A', 'brassSh': '#A6844A', 'brassLine': '#7A5C2E', 'brassHi': '#EBD39C',
    'map': '#F3E3BF', 'mapSh': '#E3CD9C', 'mapLine': '#A9844F', 'mapX': '#8E5A2C',
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
    return d + ' Z'


# ======================================================================= MIT
HEAD = (158, 128, 66, 57)           # x 92-224, y 71-185
NECK = (160, 190)                   # tilt pivot
MUZZLE = (202, 150, 31, 23)         # x 171-233
NOSE = (227, 137)
MOUTH = (218, 160)
EYE_N = (144, 120, 15.5)            # near eye (viewer's left, in the fur patch)
EYE_F = (190, 113, 12.5)            # far eye
SH_N = (140, 208)                   # near front-leg shoulder (drawn in front of the chest)
SH_F = (190, 206)                   # far front-leg shoulder (behind the chest when resting)
EAR_N_ROOT = (114, 86)
EAR_F_ROOT = (204, 78)


def arm_d(L):
    """Front leg from the shoulder (0,0) straight down to a round paw at (0,L); paw bottom at L+13."""
    return (f'M-16,-6 C-17,{f(L * 0.4)} -16,{f(L - 12)} -17,{f(L - 4)} C-21,{f(L + 4)} -18,{f(L + 13)} -6,{f(L + 13)} L6,{f(L + 13)} '
            f'C18,{f(L + 13)} 21,{f(L + 4)} 17,{f(L - 4)} C16,{f(L - 12)} 15,{f(L * 0.4)} 15,-6 C10,-16 -10,-16 -16,-6 Z')


def arm(doc, sh, ang, L, far=False, pad=False):
    """ang 0 = hanging down; > 0 swings the paw to the viewer's LEFT, < 0 to the RIGHT. pad = show the paw pads."""
    tf = f'translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)})'
    tpl = f'<path d="{arm_d(L)}" transform="{tf}" {{a}}/>'
    base, shade = (P['sh'], '#C8A777') if far else (P['fur'], P['sh'])
    hi = None if far else f'<path d="M-8,4 L-8,{f(L - 10)}" transform="{tf}" {st("#FFFFFF", 4)} opacity=".4"/>'
    o = doc.shaded(tpl, base, shade, P['line'], dx=-5, dy=-4, hi=hi)
    o += f'<g transform="{tf}">'
    if pad:
        o += ell(0, L + 4, 8.5, 6.5, f'fill="{P["pad"]}"')
        for x, y in ((-9, L - 4), (0, L - 7), (9, L - 4)):
            o += circ(x, y, 3.4, f'fill="{P["pad"]}"')
    else:
        for x in (-5, 5):
            o += path(f'M{x},{f(L + 5)} L{x},{f(L + 12)}', st(P['line'], 2.6))
    o += '</g>'
    return o


def paw_pt(sh, ang, L, extra=6):
    x, y = rot(0, L + extra, ang)
    return sh[0] + x, sh[1] + y


def tail(doc):
    d = 'M98,250 C80,246 66,232 62,214 C60,204 70,200 76,208 C82,222 92,232 106,236 Z'
    return doc.shaded(f'<path d="{d}" {{a}}/>', P['fur'], P['sh'], P['line'], dx=-3, dy=-3)


def body(doc):
    o = tail(doc)
    # chest/tummy (sitting pear)
    tpl = '<path d="M100,206 C92,236 94,276 118,288 C138,296 176,296 196,286 C214,272 212,228 200,200 C184,186 116,186 100,206 Z" {a}/>'
    hi = ell(118, 222, 12, 20, 'fill="#FFFFFF" opacity=".35" transform="rotate(14 118 222)"')
    o += doc.shaded(tpl, P['fur'], P['sh'], P['line'], dx=-10, dy=-6, hi=hi)
    # lighter tummy
    o += ell(166, 252, 26, 30, f'fill="{P["light"]}"')
    # near haunch (hind leg, viewer's left) + its foot
    ht = '<path d="M84,262 C84,236 104,226 124,230 C144,234 152,252 148,270 C144,286 124,292 104,290 C90,288 84,278 84,262 Z" {a}/>'
    o += doc.shaded(ht, P['fur'], P['sh'], P['line'], dx=-6, dy=-6,
                    hi=ell(104, 246, 9, 6, 'fill="#FFFFFF" opacity=".35" transform="rotate(-30 104 246)"'))
    ft = '<path d="M96,282 C96,272 116,270 136,272 C150,274 154,282 150,288 C146,293 104,293 98,290 C96,288 96,285 96,282 Z" {a}/>'
    o += doc.shaded(ft, P['fur'], P['sh'], P['line'], dx=-3, dy=-3)
    for x in (140, 132):
        o += path(f'M{x},282 L{x + 2},290', st(P['line'], 2.4))
    return o


def collar(doc):
    band = 'M104,184 C130,200 186,202 212,180 C216,186 217,194 214,200 C188,220 128,220 102,202 C98,196 99,190 104,184 Z'
    cid = doc.clip(f'<path d="{band}"/>')
    o = path(band, f'fill="{P["collar"]}"')
    o += f'<g clip-path="url(#{cid})">'
    for x in range(104, 222, 18):
        o += rect(x, 170, 8, 60, 0, f'fill="{P["stripe"]}" transform="rotate(-8 {x} 200)"')
    o += path('M98,204 C130,222 190,222 220,198 L220,230 L98,230 Z', f'fill="{P["collarLine"]}" opacity=".2"')
    o += '</g>'
    o += path(band, f'fill="none" stroke="{P["collarLine"]}" stroke-width="{f(LW * 0.85)}" stroke-linejoin="round"')
    # a little brass ring tag
    o += circ(170, 214, 7.5, fl(P['brass'], P['brassLine'], 2.6)) + circ(168, 212, 2.4, f'fill="{P["brassHi"]}"')
    return o


EARS = {'rest': (0, 0), 'perk': (18, -14), 'flap': (48, -40), 'back': (8, 10), 'droop': (-6, 6)}


def ear_near(doc, a):
    rx, ry = EAR_N_ROOT
    d = 'M122,80 C100,74 84,94 82,122 C80,150 88,170 102,170 C116,170 122,152 122,132 C122,112 132,92 122,80 Z'
    tf = f' transform="rotate({f(a)} {rx} {ry})"'
    return doc.shaded(f'<path d="{d}"{tf} {{a}}/>', P['ear'], P['earSh'], P['earLine'], dx=-5, dy=-5,
                      hi=f'<path d="M96,104 C92,118 92,134 94,146"{tf} {st("#FFFFFF", 4)} opacity=".25"/>')


def ear_far(doc, a):
    rx, ry = EAR_F_ROOT
    d = 'M198,76 C218,66 236,80 240,106 C244,130 240,148 228,150 C216,152 212,136 212,120 C212,104 206,88 198,76 Z'
    tf = f' transform="rotate({f(a)} {rx} {ry})"'
    return doc.shaded(f'<path d="{d}"{tf} {{a}}/>', P['earSh'], '#744A28', P['earLine'], dx=-4, dy=-4)


def eye(cx, cy, r, mode='open', look=(-1, 1.5)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.1 if mode == 'wide' else 1)
        o += ell(cx, cy, rr * 0.88, rr, fl(P['white'], P['earLine'] if r > 14 else P['line'], 3))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.68 if mode == 'wide' else 0.7)
        o += ell(px, py, pr * 0.9, pr, f'fill="{P["pupil"]}"')
        o += circ(px - pr * 0.34, py - pr * 0.4, pr * 0.42, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.4, py + pr * 0.42, pr * 0.17, 'fill="#FFFFFF"')
    elif mode == 'closed':
        o += path(f'M{f(cx - r * 0.8)},{f(cy)} Q{f(cx)},{f(cy + r * 0.65)} {f(cx + r * 0.8)},{f(cy)}', st(P['pupil'], 4.6))
    elif mode == 'happy':
        o += path(f'M{f(cx - r * 0.8)},{f(cy + r * 0.32)} Q{f(cx)},{f(cy - r * 0.9)} {f(cx + r * 0.8)},{f(cy + r * 0.32)}',
                  st(P['pupil'], 5.2))
    return o


def mouth(mode):
    mx, my = MOUTH
    ln = P['line']
    nose_line = path(f'M{NOSE[0] - 2},{NOSE[1] + 8} L{mx},{my - 6}', st(ln, 3))
    if mode == 'closed':   # little "w"
        return nose_line + path(f'M{mx - 12},{my - 4} Q{mx - 6},{my + 3} {mx},{my - 5} Q{mx + 6},{my + 3} {mx + 11},{my - 5}', st(ln, 3.4))
    if mode == 'talk':
        o = nose_line + path(f'M{mx - 11},{my - 5} Q{mx},{my - 2} {mx + 11},{my - 6} Q{mx + 10},{my + 12} {mx},{my + 12} '
                             f'Q{mx - 10},{my + 12} {mx - 11},{my - 5} Z', fl(P['mouth'], ln, 3))
        return o + ell(mx, my + 7, 6, 3.6, f'fill="{P["tongue"]}"')
    if mode in ('smile', 'big', 'woof'):
        k = {'smile': 0.9, 'big': 1.1, 'woof': 1.3}[mode]
        w, h = 13 * k, 15 * k
        o = path(f'M{f(mx - w)},{f(my - 6)} Q{mx},{f(my - 1)} {f(mx + w)},{f(my - 8)} '
                 f'Q{f(mx + w * 0.9)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.9)},{f(my + h)} {f(mx - w)},{f(my - 6)} Z',
                 fl(P['mouth'], ln, 3))
        o += ell(mx, my + h - 5 * k, 7.5 * k, 4.4 * k, f'fill="{P["tongue"]}"')
        return path(f'M{NOSE[0] - 2},{NOSE[1] + 8} L{mx},{my - 4}', st(ln, 3)) + o
    if mode == 'o':
        return nose_line + ell(mx, my + 2, 5.5, 6.5, fl(P['mouth'], ln, 3))
    if mode == 'hmm':
        return nose_line + path(f'M{mx - 11},{my} Q{mx - 5},{my - 5} {mx},{my - 1} Q{mx + 5},{my + 3} {mx + 10},{my - 3}', st(ln, 3.4))
    return ''


def hat(doc, lift=0, ang=-6):
    """Folded paper pirate hat sitting on the head top, with a small brown anchor."""
    tri = 'M94,98 C112,76 134,54 152,38 C156,34 162,34 166,38 C186,54 210,72 226,92 Z'
    band = 'M90,100 C126,76 196,72 230,92 L232,106 C196,88 130,92 92,114 Z'
    o = doc.shaded(f'<path d="{tri}" {{a}}/>', P['hat'], P['hatSh'], P['hatLine'], dx=-9, dy=-4, w=4,
                   hi=path('M116,78 C126,66 138,54 148,46', st('#FFFFFF', 4) + ' opacity=".7"'))
    # the centre fold line
    o += path('M159,40 L160,84', st(P['hatSh'], 2.4))
    # anchor
    ax, ay = 176, 70
    o += circ(ax, ay - 13, 3.6, f'fill="none" stroke="{P["anchor"]}" stroke-width="2.6"')
    o += path(f'M{ax},{ay - 9} L{ax},{ay + 10} M{ax - 6},{ay - 4} L{ax + 6},{ay - 4} '
              f'M{ax - 10},{ay + 3} Q{ax - 8},{ay + 12} {ax},{ay + 11} Q{ax + 8},{ay + 12} {ax + 10},{ay + 3}', st(P['anchor'], 3))
    o += doc.shaded(f'<path d="{band}" {{a}}/>', P['hat'], P['hatSh'], P['hatLine'], dx=0, dy=-4, w=4)
    return f'<g transform="translate(0,{f(-lift)}) rotate({f(ang)} 160 92)">{o}</g>'


def head(doc, eyes='open', mo='closed', brows=None, look=(-1, 1.5), ears='rest', hat_lift=0, hat_ang=-6):
    hx, hy, hrx, hry = HEAD
    ea, fa = EARS[ears]
    o = ear_far(doc, fa)
    tpl = f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>'
    hi = ell(122, 92, 18, 9, 'fill="#FFFFFF" opacity=".45" transform="rotate(-32 122 92)"')
    o += doc.shaded(tpl, P['fur'], P['sh'], P['line'], dx=-11, dy=-9, hi=hi)
    # brown fur patch round the near eye (soft blob, no hard outline)
    o += path('M124,106 C124,92 142,88 156,94 C168,100 168,120 164,132 C158,144 138,146 128,136 C120,128 120,114 124,106 Z',
              f'fill="{P["ear"]}"')
    # muzzle (lighter cream)
    mx, my, mrx, mry = MUZZLE
    o += ell(mx, my, mrx, mry, f'fill="{P["light"]}" stroke="{P["sh"]}" stroke-width="2.4"')
    # cheeks
    o += ell(122, 150, 13, 8, f'fill="{P["cheek"]}" opacity=".9"')
    o += ell(178, 162, 8, 5.5, f'fill="{P["cheek"]}" opacity=".85"')
    o += mouth(mo)
    # nose (rounded triangle) + shine
    nx, ny = NOSE
    o += path(f'M{nx - 11},{ny - 5} Q{nx},{ny - 10} {nx + 10},{ny - 5} Q{nx + 9},{ny + 6} {nx - 1},{ny + 8} Q{nx - 11},{ny + 6} {nx - 11},{ny - 5} Z',
              fl(P['nose'], P['nose'], 2))
    o += ell(nx - 4, ny - 4, 3.6, 2, 'fill="#FFFFFF" opacity=".7"')
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=(look[0] * 0.8, look[1] * 0.8))
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 7 - lift
            o += path(f'M{f(cx - 8)},{f(y + 3)} Q{f(cx)},{f(y - 3)} {f(cx + 8)},{f(y + 3)}',
                      st(P['earLine'] if cx < 160 else P['line'], 3.6))
    o += ear_near(doc, ea)
    o += hat(doc, hat_lift, hat_ang)
    return o


ARM_REST_N = (SH_N, 0, 71)
ARM_REST_F = (SH_F, -4, 72)
POSES = {
    #             eyes      mouth     near arm (sh, ang, L)    far arm (sh, ang, L)      tilt brows    look        ears    hat(lift, ang)
    'idle':      ('open',   'closed', ARM_REST_N,              ARM_REST_F,               0, None,     (-1, 1.5),  'rest', (0, -6)),
    'blink':     ('closed', 'closed', ARM_REST_N,              ARM_REST_F,               0, None,     (-1, 1.5),  'rest', (0, -6)),
    'talk':      ('open',   'talk',   ARM_REST_N,              ARM_REST_F,               0, None,     (-1, 1.5),  'rest', (0, -6)),
    'happy':     ('wide',   'big',    ARM_REST_N,              ARM_REST_F,               0, None,     (-1, 1),    'perk', (2, -6)),
    'cheer':     ('happy',  'big',    ((136, 206), 132, 58),   ((196, 204), -132, 58),   0, None,     (0, 0),     'flap', (12, -14)),
    'think':     ('look',   'hmm',    ARM_REST_N,              ((194, 204), 168, 30),    6, (0, 6),   (4, -5),    'droop', (0, -6)),
    'oops':      ('wide',   'o',      ARM_REST_N,              ARM_REST_F,              -6, (8, 0),   (-1, 1),    'back', (0, -2)),
    'wave':      ('open',   'smile',  ARM_REST_N,              ((204, 200), -120, 64),   0, None,     (-1, 1.5),  'perk', (0, -6)),
    'point':     ('look',   'talk',   ARM_REST_N,              ((194, 206), -112, 66),   0, (4, 4),   (4, -3),    'perk', (0, -6)),
    'woof':      ('happy',  'woof',   ARM_REST_N,              ARM_REST_F,               0, None,     (0, 0),     'flap', (6, -10)),
    'full_wave': ('wide',   'smile',  ((140, 208), -38, 44),   ((204, 200), -120, 64),   0, None,     (-1, 1.5),  'perk', (0, -6)),
}
RAISED_F = ('cheer', 'think', 'wave', 'point', 'full_wave', 'icon')   # far paw drawn in front of everything
PAD = ('cheer', 'wave', 'full_wave', 'icon')


def mit(doc, pose, hold=None):
    """hold(doc, paw) -> svg drawn just before the raised far paw (the icon's puzzle piece)."""
    eyes, mo, aN, aF, tilt, brows, look, ears, (hl, ha) = POSES[pose]
    o = ''
    if pose not in RAISED_F:
        o += arm(doc, *aF, far=True)
    o += body(doc)
    o += collar(doc)
    hd = head(doc, eyes, mo, brows, look, ears, hl, ha)
    if tilt:
        hd = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{hd}</g>'
    o += hd
    if pose == 'full_wave':
        o += belt_and_spyglass(doc)
    if pose == 'full_wave':
        o += map_roll(doc)
    o += arm(doc, *aN, pad=(pose == 'cheer'))
    paw = paw_pt(*aF) if pose in RAISED_F else paw_pt(*aN)
    if hold:
        o += hold(doc, paw)
    if pose in RAISED_F:
        o += arm(doc, *aF, pad=pose in PAD)
    ln = f'{st(P["line"], 3.6)} opacity=".7"'
    if pose in ('wave', 'full_wave'):     # motion lines beside the waving paw
        x, y = paw
        o += path(f'M{f(x + 18)},{f(y - 26)} Q{f(x + 27)},{f(y - 12)} {f(x + 24)},{f(y + 2)} '
                  f'M{f(x - 14)},{f(y - 34)} Q{f(x)},{f(y - 46)} {f(x + 14)},{f(y - 40)}', ln)
    if pose == 'woof':                    # happy puff lines out of the mouth
        mx, my = MOUTH
        for (dx, dy, ex, ey) in ((18, -6, 38, -18), (20, 6, 44, 6), (16, 16, 34, 30)):
            o += path(f'M{mx + dx},{my + dy} L{mx + ex},{my + ey}', st(P['line'], 4) + ' opacity=".75"')
    if pose == 'cheer':
        for (x, y, s) in ((38, 120, 9), (270, 112, 9), (30, 76, 6), (282, 70, 6)):
            o += star4(x, y, s, w=1.8)
    if pose == 'oops':
        o += path('M246,50 Q246,36 258,36 Q270,36 268,48 Q266,56 258,58 L258,66', st(P['line'], 4.4) + ' opacity=".8"')
        o += circ(258, 78, 3, f'fill="{P["line"]}" opacity=".8"')
    if pose == 'think':
        for (x, y, r) in ((240, 92, 3.4), (252, 74, 5), (268, 54, 7)):
            o += circ(x, y, r, f'fill="none" stroke="{P["line"]}" stroke-width="2.6" opacity=".75"')
    if pose == 'point':                   # a tiny spark at the pointing paw
        x, y = paw
        o += star4(x + 18, y - 14, 7, w=1.6)
    return o, paw


def belt_and_spyglass(doc):
    """Title pose: a brown sash belt round the tummy with a brass spyglass tucked in at the near hip."""
    belt = 'M98,250 C130,266 180,266 208,248'
    o = doc.shaded('<path d="M90,214 L106,204 L140,262 L124,272 Z" {a}/>', P['brass'], P['brassSh'], P['brassLine'], dx=-3, dy=-2, w=3.4,
                   hi=path('M100,210 L128,258', st(P['brassHi'], 3)))
    o += doc.shaded('<path d="M84,206 L104,194 L112,206 L92,218 Z" {a}/>', P['brassSh'], P['brassLine'], P['brassLine'], dx=-2, dy=-2, w=3.4)
    o += path('M110,228 L124,220', st(P['brassLine'], 3))
    o += path(belt, st('#6A4528', 10)) + path(belt, st('#9C6B45', 5.4))
    o += rect(176, 254, 16, 14, 3, fl(P['brass'], P['brassLine'], 2.4) + ' transform="rotate(-14 184 261)"')
    return o


def map_roll(doc):
    """A rolled treasure map held against the chest by the near paw (paw at about 167,258)."""
    tf = 'rotate(-14 166 246)'
    o = doc.shaded(f'<rect x="126" y="234" width="84" height="26" rx="13" transform="{tf}" {{a}}/>', P['map'], P['mapSh'],
                   P['mapLine'], dx=-3, dy=-4, w=3.6)
    o += f'<g transform="{tf}">' + ell(205, 247, 7, 12, fl(P['mapSh'], P['mapLine'], 3)) + ell(205, 247, 2.6, 5.4, f'fill="{P["mapLine"]}"')
    o += path('M186,234 L186,260 M192,234 L192,260', st('#9C6B45', 2.8))
    o += path('M140,242 L148,250 M148,242 L140,250', st(P['mapX'], 2.6)) + '</g>'
    return o


def hand_table(paws):
    out = {}
    for pose, p in POSES.items():
        hl = p[8][0]
        out[pose] = {'paw': [round(paws[pose][0]), round(paws[pose][1])], 'mouth': list(MOUTH),
                     'hatTop': 34 - hl + (4 if p[4] else 0), 'eye': [EYE_N[0], EYE_N[1]]}
    return out


def write_mit():
    paws = {}
    for pose in POSES:
        d = Doc('p')
        b, paw = mit(d, pose)
        paws[pose] = paw
        write(f'characters/mit_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
    tbl = hand_table(paws)
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        json.dump({'_about': ('Mit per frame, in the 0 0 300 300 viewBox (seat anchor 150,292). paw = the active front paw '
                              '(point / wave / cheer / think: the raised one); mouth = mouth centre (woof puffs start here); '
                              'hatTop = y of the paper hat peak (speech-bubble tail / stars over the head); eye = near eye '
                              'centre; bbox = measured opaque box (added by tools/mit_sheet.js).'),
                   **tbl}, fh, indent=1)
        fh.write('\n')
    return tbl


# ======================================================================= CRAB
CR = {'body': '#F3B39A', 'sh': '#DD9378', 'line': '#A8604A', 'light': '#FAD3C2', 'belly': '#F8C9B4'}


def claw(doc, x, y, ang, s=1.0):
    """A round pincer claw centred at (x,y), opening pointing up when ang = 0."""
    tf = f'translate({f(x)},{f(y)}) rotate({f(ang)}) scale({f(s)})'
    d = ('M-15,4 C-18,-10 -12,-22 -2,-24 L-2,-10 C2,-12 4,-18 4,-24 C14,-22 18,-10 15,4 C12,14 -12,14 -15,4 Z')
    return doc.shaded(f'<path d="{d}" transform="{tf}" {{a}}/>', CR['body'], CR['sh'], CR['line'], dx=-3, dy=-3, w=3.6,
                      hi=f'<ellipse cx="-8" cy="-6" rx="3.6" ry="6" fill="#FFFFFF" opacity=".5" transform="{tf}"/>')


def crab(flap=False):
    d = Doc('g')
    o = ''
    # legs: 3 per side, little bent sticks to the ground (y 134)
    for side in (-1, 1):
        for k, (x0, x1, kx) in enumerate(((50, 26, 30), (58, 38, 38), (66, 52, 50))):
            X0, X1, KX = 80 + side * (80 - x0), 80 + side * (80 - x1), 80 + side * (80 - kx)
            dd = f'M{X0},{108 + k * 3} Q{KX},{112 + k * 2} {X1},{134 - k}'
            o += path(dd, st(CR['line'], 8.6)) + path(dd, st(CR['sh'], 4.2))
    # arms + claws
    if flap:
        for side in (-1, 1):
            X0, XE = 80 + side * 40, 80 + side * 50
            o += path(f'M{X0},92 Q{80 + side * 56},78 {XE},54', st(CR['line'], 10)) + path(f'M{X0},92 Q{80 + side * 56},78 {XE},54', st(CR['sh'], 5.4))
            o += claw(d, XE + side * 4, 44, side * 16, 0.92)
    else:
        for side in (-1, 1):
            X0, XE = 80 + side * 40, 80 + side * 52
            o += path(f'M{X0},104 Q{80 + side * 56},106 {XE},96', st(CR['line'], 10)) + path(f'M{X0},104 Q{80 + side * 56},106 {XE},96', st(CR['sh'], 5.4))
            o += claw(d, XE + side * 4, 88, side * 20, 0.92)
    # eye stalks
    for x in (64, 96):
        dd = f'M{x},74 L{x + (x - 80) * 0.25},44'
        o += path(dd, st(CR['line'], 9)) + path(dd, st(CR['body'], 4.4))
    # shell
    tpl = '<path d="M34,96 C34,72 54,62 80,62 C106,62 126,72 126,96 C126,114 108,124 80,124 C52,124 34,114 34,96 Z" {a}/>'
    hi = ell(60, 76, 13, 6, 'fill="#FFFFFF" opacity=".5" transform="rotate(-18 60 76)"')
    o += d.shaded(tpl, CR['body'], CR['sh'], CR['line'], dx=-6, dy=-6, w=4, hi=hi)
    o += ell(80, 110, 30, 9, f'fill="{CR["belly"]}" opacity=".9"')
    # little shell spots
    for (x, y, r) in ((98, 72, 3), (106, 80, 2.2), (54, 86, 2.2)):
        o += circ(x, y, r, f'fill="{CR["sh"]}"')
    # smile + cheeks
    o += path('M68,98 Q80,110 92,98', st(CR['line'], 3.4))
    o += path('M70,99.5 Q80,108 90,99.5 Q80,104 70,99.5 Z', f'fill="#B5574A"')
    o += ell(56, 98, 7, 4.4, 'fill="#F08A84" opacity=".55"') + ell(104, 98, 7, 4.4, 'fill="#F08A84" opacity=".55"')
    # eyes on the stalks (look at the child)
    for x in (56, 104):
        o += circ(x, 38, 11, fl('#FFFFFF', CR['line'], 3.2))
        o += circ(x + (1 if x < 80 else -1), 40, 6.6, 'fill="#2F2A3A"')
        o += circ(x - 1.6, 37.4, 2.6, 'fill="#FFFFFF"') + circ(x + 2.6, 42.6, 1, 'fill="#FFFFFF"')
    if flap:  # tiny joy marks
        o += path('M70,22 L68,15 M80,20 L80,12 M90,22 L92,15', st(CR['line'], 2.6) + ' opacity=".7"')
    return svg(160, 140, o, ''.join(d.defs))


# ======================================================================= ICON
def icon():
    d = Doc('i')
    g = d.uid('s')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7CC8F0"/>'
                  f'<stop offset="1" stop-color="#D8F1FB"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # sun + clouds
    o += circ(440, 70, 34, 'fill="#FFF1B8"') + circ(440, 70, 48, 'fill="#FFF6D2" opacity=".45"')
    for (x, y, k) in ((90, 66, 1.0), (300, 46, 0.75)):
        o += (ell(x, y, 46 * k, 18 * k, 'fill="#FFFFFF" opacity=".92"') + circ(x - 14 * k, y - 12 * k, 20 * k, 'fill="#FFFFFF" opacity=".92"')
              + circ(x + 14 * k, y - 16 * k, 24 * k, 'fill="#FFFFFF" opacity=".92"'))
    # sea + a little island + sparkles
    o += rect(0, 222, 512, 140, 0, 'fill="#5CC3D6"')
    o += path('M0,222 L512,222 L512,236 L0,236 Z', 'fill="#8FDCE0"')
    o += path('M30,226 C50,206 90,204 110,226 Z', 'fill="#BFD7A8"') + path('M66,210 L66,190', st('#9C7A64', 4))
    o += path('M66,190 Q54,186 48,194 M66,190 Q78,184 86,192 M66,190 Q62,180 54,178', st('#8FBF8A', 5))
    for (x, y) in ((150, 262), (400, 250), (470, 300), (60, 300), (300, 330)):
        o += path(f'M{x - 14},{y} Q{x},{y - 6} {x + 14},{y}', st('#FFFFFF', 4) + ' opacity=".75"')
    # sand with foam edge
    o += path('M0,350 C120,330 260,346 380,334 C440,328 480,334 512,330 L512,512 L0,512 Z', 'fill="#F1DDB0"')
    o += path('M0,350 C120,330 260,346 380,334 C440,328 480,334 512,330', st('#FFFFFF', 8) + ' opacity=".85"')
    o += path('M0,420 C150,410 300,440 512,420 L512,512 L0,512 Z', 'fill="#DEC28C" opacity=".45"')
    for (x, y) in ((330, 470), (470, 450), (250, 492)):
        o += path(f'M{x - 10},{y + 6} Q{x},{y - 12} {x + 10},{y + 6} Z', fl('#FBE7DA', '#D9B79F', 2.4))
    # parchment map (right) with a dotted trail, an X and one piece-shaped shadow
    bx, by, bw, bh = 232, 116, 256, 236
    mp = (f'M{bx},{by + 10} Q{bx + 64},{by - 6} {bx + 128},{by + 6} Q{bx + 196},{by - 8} {bx + bw},{by + 8} '
          f'L{bx + bw - 6},{by + bh - 10} Q{bx + 190},{by + bh + 8} {bx + 128},{by + bh - 4} Q{bx + 60},{by + bh + 6} {bx + 6},{by + bh - 6} Z')
    o += f'<g transform="rotate(4 360 234)">'
    o += path(mp, 'fill="#5E4A3A" opacity=".2" transform="translate(6,10)"')
    o += d.shaded(f'<path d="{mp}" {{a}}/>', P['map'], P['mapSh'], '#C9A46A', dx=-8, dy=-8, w=5)
    o += ell(bx + 60, by + 180, 26, 14, f'fill="{P["mapSh"]}" opacity=".7"')
    o += path(f'M{bx + 30},{by + 200} C{bx + 70},{by + 140} {bx + 40},{by + 80} {bx + 110},{by + 70} S{bx + 200},{by + 120} {bx + 214},{by + 46}',
              st(P['mapX'], 4) + ' stroke-dasharray="2 12" opacity=".75"')
    o += path(f'M{bx + 204},{by + 36} L{bx + 226},{by + 58} M{bx + 226},{by + 36} L{bx + 204},{by + 58}', st(P['mapX'], 7))
    o += path(f'M{bx + 30},{by + 40} C{bx + 46},{by + 24} {bx + 76},{by + 26} {bx + 84},{by + 44} C{bx + 70},{by + 56} {bx + 44},{by + 56} {bx + 30},{by + 40} Z',
              'fill="#BFD7A8" opacity=".8"')
    sx, sy, ss = bx + 160, by + 150, 70
    slot = piece_d(sx, sy, ss, (1, 1, -1, 1))
    o += path(slot, 'fill="rgba(40,36,60,0.36)" stroke="rgba(40,36,60,0.5)" stroke-width="6" stroke-linejoin="round"')
    o += path(slot, 'fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="3" stroke-dasharray="10 8" stroke-linejoin="round"')
    o += '</g>'
    # Mit (happy) bottom-left, holding the red piece up with the raised far paw (piece between body and paw)
    sc = 1.15
    tx, ty = 116 - 150 * sc, 506 - 292 * sc
    pd = Doc('ip')
    held = {}

    def hold(doc, paw):
        px, py = paw[0] + 16, paw[1] - 34
        held['p'] = (px, py)
        dd = piece_d(px, py, ss / sc, (1, 1, -1, 1), -10)
        return doc.shaded(f'<path d="{dd}" {{a}}/>', '#E84A4A', '#C23A3D', '#A8282E', dx=-5, dy=-5, w=4,
                          hi=ell(px - 11, py - 11, 9, 4.6, f'fill="#F7A0A0" transform="rotate(-40 {f(px - 11)} {f(py - 11)})"'))
    pb, _ = mit(pd, 'icon', hold)
    d.defs.extend(pd.defs)
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{pb}</g>'
    px, py = tx + held['p'][0] * sc, ty + held['p'][1] * sc
    o += star4(px - 50, py - 30, 14, w=2.4) + star4(px + 52, py - 40, 10, w=2) + star4(sx + 70, sy - 110, 12, w=2)
    return svg(512, 512, o, ''.join(d.defs))


POSES['icon'] = ('wide', 'big', ARM_REST_N, ((204, 200), -108, 66), 0, None, (-1, 1), 'perk', (2, -6))


def main():
    poses = [p for p in POSES if p != 'icon']
    icon_spec = POSES.pop('icon')
    tbl = write_mit()
    POSES['icon'] = icon_spec
    write('characters/crab.svg', crab(False))
    write('characters/crab_flap.svg', crab(True))
    write('icon.svg', icon())
    for k in poses:
        print(f'{k:10s} {tbl[k]}')


if __name__ == '__main__':
    main()
