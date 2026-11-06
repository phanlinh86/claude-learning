#!/usr/bin/env python3
"""Character / toy art generator for Momo's Toy Train (character artist A). 100% original vector art.

Writes (relative to game/assets/default/):
  characters/momo_{idle,blink,talk,happy,cheer,think,oops,wave,whistle,point}.svg + momo_full_wave.svg
        0 0 300 300, FEET ANCHOR (150,292). Momo faces LEFT in 3/4 view, eyes on the viewer.
        The body / belly / kerchief / feet are identical in every frame; only eyes, beak, brows, wings
        and (think / oops) a small head tilt around the neck (148,186) change.
        Everything that matters (cap, eyes, beak, raised wings) sits above y = 165, so Momo reads well
        when the lower 45 % is hidden by the cab wall.
        Beak centre ~ (133,148) (talk mouth opens below it, to y ~168).
        whistle: the near wing holds a wooden pull knob at (WHISTLE_KNOB); the cord runs straight up
        from the knob to the top edge at x = 204 (y 0) -> code continues it to the whistle.
        point: the near wing points down-right (tip ~ (288,182)), pupils look right.
  characters/bunny_toy.svg, bunny_toy_wave.svg   0 0 140 140, bottom anchor (70,136)
  characters/balloon.svg                         0 0 120 220, string end anchor (60,216)
  items/cargo_{teddy,ball,duckie,rocket,boat,drum}.svg   0 0 160 160, bottom anchor (80,156), white sticker border
  icon.svg                                       0 0 512 512, full bleed, opaque

Usage: python3 tools/art_momo.py [outDir]
Style rules (docs/DESIGN.md section 3): flat cartoon, ~4 px outline (at 256) in a darker tone, one-step cel shade
(lower right) + one soft highlight (upper left), no <text>/fonts/scripts/external refs, no filters.
Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

M = {  # Momo palette (DESIGN.md section 3)
    'fill': '#C98F5A', 'shade': '#A06C3E', 'line': '#6E4526', 'hi': '#E2B484',
    'wing': '#B67D49', 'wingSh': '#94613A',
    'cream': '#FFF1DC', 'creamSh': '#F0D8B6', 'creamLine': '#B98A5C',
    'ring': '#C9B6E4', 'ringDk': '#A08BC6', 'white': '#FFFFFF', 'pupil': '#2F2A3A',
    'beak': '#F2A65A', 'beakSh': '#D98840', 'beakLine': '#A8642A', 'mouth': '#7C3B33', 'tongue': '#F28F86',
    'cheek': '#F6B1A0',
    'cap': '#F4EBDD', 'capSh': '#DCCFBC', 'capLine': '#8C7D69', 'stripe': '#7D8FA8',
    'kerch': '#7D8FA8', 'kerchSh': '#617390', 'kerchLine': '#46546B',
    'feet': '#F2A65A', 'feetLine': '#A8642A', 'brow': '#7A4E2C',
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
    """Collects <defs> with unique ids (prefix lets several drawings share one file, e.g. the icon)."""

    def __init__(self, prefix='m'):
        self.prefix, self.defs, self.n = prefix, [], 0

    def clip(self, inner):
        self.n += 1
        cid = f'{self.prefix}c{self.n}'
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


# ======================================================================= MOMO
HEAD = (146, 102, 90, 82)          # x 56-236, y 20-184
FACE_DY = -10                      # face disc / eyes / beak drawn 10 px higher (so the mouth clears the cab wall)
NECK = (148, 186)                  # tilt pivot
BODY = (150, 224, 82, 62)          # x 68-232, y 162-286
EYE_F = (104, 116, 24)             # far eye (viewer's left), smaller: 3/4 view facing left
EYE_N = (167, 113, 28)             # near eye
BEAK_C = (133, 148)
SH_F = (80, 190)                   # far wing shoulder
SH_N = (220, 186)                  # near wing shoulder
WING = ('M-22,-8 C-33,24 -28,60 -9,84 C-5,90 2,92 5,88 C8,92 13,88 13,82 C18,82 22,74 21,66 '
        'C30,40 30,12 21,-8 C12,-20 -13,-20 -22,-8 Z')
WING_TIP = (2, 90)


def wing(doc, sh, ang, scale=1.0):
    """Wing hanging down (ang 0) from shoulder sh; ang > 0 swings the tip to the viewer's left."""
    tf = f'translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)}) scale({f(scale)})'
    tpl = f'<path d="{WING}" transform="{tf}" {{a}}/>'
    out = doc.shaded(tpl, M['wing'], M['wingSh'], M['line'], dx=-7, dy=-6, w=LW / 1)
    # feather tips
    lines = ('M-14,58 Q-6,66 -2,78 M2,52 Q8,64 8,78 M15,44 Q18,54 17,66')
    out += f'<path d="{lines}" transform="{tf}" fill="none" stroke="{M["wingSh"]}" stroke-width="3.2" stroke-linecap="round"/>'
    return out


def wing_tip(sh, ang, scale=1.0):
    x, y = rot(WING_TIP[0] * scale, WING_TIP[1] * scale, ang)
    return sh[0] + x, sh[1] + y


def eye(cx, cy, r, mode='open', look=(3, 3)):
    o = circ(cx, cy, r * 1.3, f'fill="{M["ring"]}" stroke="{M["ringDk"]}" stroke-width="2.6"')
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.06 if mode == 'wide' else 1)
        o += circ(cx, cy, rr, fl(M['white'], M['line'], 3.6))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.62 if mode == 'wide' else 0.58)
        o += circ(px, py, pr, f'fill="{M["pupil"]}"')
        o += circ(px - pr * 0.36, py - pr * 0.4, pr * 0.36, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.42, py + pr * 0.38, pr * 0.15, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.82)},{f(cy - 2)} Q{f(cx)},{f(cy + r * 0.62)} {f(cx + r * 0.82)},{f(cy - 2)}',
                  st(M['pupil'], 5))
    elif mode == 'happy':           # ^ arcs: cheer / whistle
        o += path(f'M{f(cx - r * 0.8)},{f(cy + r * 0.3)} Q{f(cx)},{f(cy - r * 0.75)} {f(cx + r * 0.8)},{f(cy + r * 0.3)}',
                  st(M['pupil'], 5.4))
    return o


def beak(mode):
    up = ('M117,139 Q133,129 150,138 Q145,152 133,164 Q121,152 117,139 Z')
    o = ''
    if mode == 'closed':
        o += path(up, fl(M['beak'], M['beakLine'], 3.4))
        o += path('M124,140 Q133,135 142,139', st('#FFD2A0', 3))
        return o
    if mode == 'talk':
        o += path('M119,146 Q133,152 147,145 Q146,166 133,171 Q120,165 119,146 Z', fl(M['mouth'], M['beakLine'], 3.2))
        o += ell(133, 164, 7, 4, f'fill="{M["tongue"]}"')
        o += path('M117,138 Q133,128 150,137 Q143,148 133,155 Q122,148 117,138 Z', fl(M['beak'], M['beakLine'], 3.4))
    elif mode in ('smile', 'big'):
        k = 1.25 if mode == 'big' else 1.0
        y2 = 148 + 25 * k
        o += path(f'M{f(133 - 25 * k)},145 Q133,{f(150 + 4 * k)} {f(133 + 25 * k)},143 '
                  f'Q{f(133 + 20 * k)},{f(y2)} 133,{f(y2)} Q{f(133 - 20 * k)},{f(y2)} {f(133 - 25 * k)},145 Z',
                  fl(M['mouth'], M['beakLine'], 3.2))
        o += ell(133, y2 - 7 * k, 12 * k, 6 * k, f'fill="{M["tongue"]}"')
        o += path('M116,137 Q133,127 151,136 Q144,148 133,155 Q122,148 116,137 Z', fl(M['beak'], M['beakLine'], 3.4))
    elif mode == 'o':
        o += ell(134, 161, 6.5, 7.5, fl(M['mouth'], M['beakLine'], 3))
        o += path('M118,138 Q133,129 149,137 Q142,148 133,155 Q124,148 118,138 Z', fl(M['beak'], M['beakLine'], 3.4))
    o += path('M124,138 Q133,134 142,137', st('#FFD2A0', 3))
    return o


def head(doc, eyes='open', bk='closed', brows=None, look=(3, 3)):
    o = ''
    # ear tufts (poke out from under the cap)
    o += path('M78,78 Q58,58 50,30 Q70,42 92,58 Z', fl(M['fill'], M['line']))
    o += path('M206,60 Q232,46 250,22 Q244,56 226,84 Z', fl(M['fill'], M['line']))
    o += path('M210,64 Q230,52 242,36', st(M['shade'], 3))
    hx, hy, hrx, hry = HEAD
    hi = ell(110, 70, 34, 20, 'fill="#FFFFFF" opacity=".22" transform="rotate(-24 110 70)"')
    o += doc.shaded(f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>',
                    M['fill'], M['shade'], M['line'], dx=-12, dy=-10, hi=hi)
    # face disc (heart-ish, shifted left = 3/4 facing left)
    fd = ('M136,70 C104,50 58,66 58,112 C58,156 96,178 136,178 C178,178 214,156 214,112 '
          'C214,66 168,50 136,70 Z')
    o += f'<g transform="translate(0,{FACE_DY})">'
    o += doc.shaded(f'<path d="{fd}" {{a}}/>', M['cream'], M['creamSh'], M['creamLine'], dx=-7, dy=-8, w=3.4)
    # cheeks
    o += ell(76, 150, 13, 8, f'fill="{M["cheek"]}" opacity=".9"')
    o += ell(198, 147, 14, 9, f'fill="{M["cheek"]}" opacity=".9"')
    # eyes
    lf = (look[0] * 0.85, look[1] * 0.85)
    o += eye(*EYE_F, mode=eyes, look=lf)
    o += eye(*EYE_N, mode=eyes, look=look)
    if brows:
        for (cx, cy, r), lift in zip((EYE_F, EYE_N), brows):
            y = cy - r * 1.3 - 9 - lift
            o += path(f'M{f(cx - 11)},{f(y + 3 + lift * 0.3)} Q{f(cx)},{f(y - 4)} {f(cx + 11)},{f(y + 3 - lift * 0.3)}',
                      st(M['brow'], 4.4))
    o += beak(bk)
    o += '</g>'
    o += cap(doc)
    return o


def cap(doc):
    crown = 'M62,76 C52,34 96,10 150,12 C206,14 240,36 232,72 Q146,58 62,76 Z'
    cid = doc.clip(f'<path d="{crown}"/>')
    o = path(crown, f'fill="{M["cap"]}"')
    o += f'<g clip-path="url(#{cid})">'
    for x in range(76, 236, 22):
        o += path(f'M{x},4 Q{x + 6},40 {x + 2},80', st(M['stripe'], 6.4))
    o += path('M40,96 C80,60 200,50 250,70 L250,110 L40,110 Z', f'fill="{M["capSh"]}" opacity=".55"')
    o += ell(108, 28, 30, 10, 'fill="#FFFFFF" opacity=".35" transform="rotate(-14 108 28)"')
    o += '</g>'
    o += path(crown, fl('none', M['capLine']))
    # band
    band = 'M60,72 Q146,54 234,68 L234,82 Q146,68 62,88 Z'
    o += path(band, fl(M['capSh'], M['capLine'], 4))
    # brim, pointing left (direction of travel)
    o += path('M70,76 Q34,80 18,98 Q24,104 34,102 Q62,94 92,84 Z', fl(M['cap'], M['capLine']))
    o += path('M30,98 Q56,90 86,82', st(M['capSh'], 3))
    # little brass button
    o += circ(194, 72, 6, fl('#E2B24C', '#A9822F', 2.6))
    return o


def body(doc):
    bx, by, brx, bry = BODY
    o = ''
    # feet (behind body edge so toes peek out)
    for cx in (124, 174):
        for dx in (-9, 0, 9):
            o += ell(cx + dx, 284, 6.2, 6, fl(M['feet'], M['feetLine'], 3.2))
    o += doc.shaded(f'<ellipse cx="{bx}" cy="{by}" rx="{brx}" ry="{bry}" {{a}}/>',
                    M['fill'], M['shade'], M['line'], dx=-14, dy=-10)
    # belly
    o += doc.shaded('<ellipse cx="140" cy="240" rx="52" ry="40" {a}/>', M['cream'], M['creamSh'], M['creamLine'],
                    dx=-6, dy=-6, w=3.2)
    for (x, y) in ((124, 230), (150, 228), (112, 252), (138, 250), (162, 252), (130, 270)):
        o += path(f'M{x - 5},{y - 3} L{x},{y + 3} L{x + 5},{y - 3}', st(M['creamSh'], 3.4))
    # toes in front of body bottom
    for cx in (124, 174):
        for dx in (-9, 0, 9):
            o += ell(cx + dx, 285, 5.6, 5.4, f'fill="{M["feet"]}"')
            o += path(f'M{cx + dx - 5},{287} Q{cx + dx},{290.2} {cx + dx + 5},{287}', st(M['feetLine'], 2.6))
    # neckerchief
    o += path('M84,182 Q148,204 216,178 L214,196 Q148,220 88,198 Z', fl(M['kerch'], M['kerchLine'], 4))
    o += path('M102,196 Q118,236 132,244 Q148,226 162,204 Z', fl(M['kerch'], M['kerchLine'], 4))
    o += path('M110,204 Q122,226 132,234', st(M['kerchSh'], 3))
    o += circ(150, 202, 4, f'fill="{M["cap"]}" opacity=".9"')
    o += circ(122, 210, 3, f'fill="{M["cap"]}" opacity=".9"')
    o += circ(186, 194, 3.4, f'fill="{M["cap"]}" opacity=".9"')
    return o


# wing spec: (shoulder, angle, scale); angle 0 = hanging, > 0 swings the tip to the viewer's left.
# Raised wings use a higher shoulder so they stay visible above the cab wall.
WF_REST, WN_REST = ((80, 190), 10, 1), ((220, 186), -10, 1)
POSES = {
    #          eyes      beak     far wing                 near wing                tilt brows   look
    'idle':    ('open', 'closed', WF_REST,                 WN_REST,                 0, None,   (3, 3)),
    'blink':   ('closed', 'closed', WF_REST,               WN_REST,                 0, None,   (3, 3)),
    'talk':    ('open', 'talk',   ((80, 190), 16, 1),      ((220, 186), -16, 1),    0, None,   (3, 3)),
    'happy':   ('wide', 'smile',  ((80, 186), 36, 1),      ((220, 182), -36, 1),    0, None,   (3, 2)),
    'cheer':   ('happy', 'big',   ((84, 166), 138, 1),     ((214, 162), -138, 1),   0, None,   (0, 0)),
    'think':   ('look', 'closed', WF_REST,                 ((222, 168), 100, 0.86),  7, (0, 7), (-4, -6)),
    'oops':    ('wide', 'o',      ((84, 172), 50, 0.86),   ((216, 168), -50, 0.86),  -6, (8, 0), (2, 1)),
    'wave':    ('open', 'smile',  WF_REST,                 ((222, 160), -140, 1),   0, None,   (3, 3)),
    'whistle': ('happy', 'o',     WF_REST,                 ((228, 166), 170, 0.9),  0, None,   (0, 0)),
    'point':   ('look', 'talk',   WF_REST,                 ((210, 142), -78, 0.85), 0, None,   (8, 5)),
    'icon':    ('wide', 'smile',  WF_REST,                 WN_REST,                 0, None,   (3, 2)),   # icon only
    'full_wave': ('wide', 'smile', ((80, 188), 34, 1),     ((222, 160), -140, 1),   0, None,   (3, 3)),
}
CORD_X = 214


def momo(doc, pose):
    global WHISTLE_KNOB
    eyes, bk, wf, wn, tilt, brows, look = POSES[pose]
    o = wing(doc, *wf)
    o += body(doc)
    hd = head(doc, eyes, bk, brows, look)
    if tilt:
        hd = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{hd}</g>'
    o += hd
    if pose in ('wave', 'full_wave'):
        o += path('M266,34 Q278,46 280,62 M282,26 Q294,44 291,66', st(M['wingSh'], 3.4) + ' opacity=".6"')
    if pose == 'whistle':
        tx, ty = wing_tip(*wn)
        ky = ty - 8
        o += path(f'M{CORD_X},0 L{CORD_X},{f(ky - 8)}', st('#8C6A3E', 3.6))
        o += rect(CORD_X - 7, ky - 12, 14, 18, 6, fl('#E3BE88', '#7A5530', 3))
        WHISTLE_KNOB = (CORD_X, round(ky - 3))
    o += wing(doc, *wn)
    return o


WHISTLE_KNOB = None


def write_momo():
    for pose in POSES:
        if pose == 'icon':
            continue
        d = Doc('m')
        b = momo(d, pose)
        write(f'characters/momo_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))



# ======================================================================= BUNNY TOY
B = {'fill': '#CFC6DD', 'shade': '#B2A7C6', 'line': '#7C7193', 'cream': '#FFF5E6', 'creamSh': '#EADCC6',
     'ear': '#F5C9D6', 'eye': '#2F2A3A', 'nose': '#E98AA6', 'cheek': '#F6B1C0', 'stitch': '#9E93B5'}


def bunny(wave=False):
    d = Doc('b')
    lw = 3.6
    o = ''
    # ears
    for cx, ang in ((50, -14), (88, 16)):
        tf = f'rotate({ang} {cx} 44)'
        o += f'<g transform="{tf}">'
        o += d.shaded(f'<ellipse cx="{cx}" cy="27" rx="12" ry="24" {{a}}/>', B['fill'], B['shade'], B['line'], -4, -3, lw)
        o += ell(cx, 30, 6, 16, f'fill="{B["ear"]}"')
        o += '</g>'
    # body
    o += d.shaded('<ellipse cx="70" cy="108" rx="36" ry="27" {a}/>', B['fill'], B['shade'], B['line'], -7, -5, lw)
    o += d.shaded('<ellipse cx="68" cy="112" rx="21" ry="17" {a}/>', B['cream'], B['creamSh'], B['line'], -3, -3, 2.6)
    o += path('M68,96 L68,128', st(B['stitch'], 1.8) + ' stroke-dasharray="3 4"')
    # feet
    for cx in (48, 92):
        o += ell(cx, 126.5, 14, 7.5, fl(B['fill'], B['line'], lw))
        o += ell(cx, 126.5, 7, 3.6, f'fill="{B["ear"]}"')
    # paws
    if wave:
        o += f'<g transform="rotate(-150 100 98)">' + ell(100, 112, 9, 15, fl(B['fill'], B['line'], lw)) + '</g>'
        o += path('M118,62 Q126,68 126,78 M126,56 Q136,66 134,80', st(B['stitch'], 2.6))
    else:
        o += ell(100, 108, 9, 13, fl(B['fill'], B['line'], lw) + ' transform="rotate(-18 100 108)"')
    o += ell(40, 108, 9, 13, fl(B['fill'], B['line'], lw) + ' transform="rotate(18 40 108)"')
    # head
    hi = ell(56, 52, 13, 8, 'fill="#FFFFFF" opacity=".35" transform="rotate(-20 56 52)"')
    o += d.shaded('<ellipse cx="70" cy="66" rx="36" ry="30" {a}/>', B['fill'], B['shade'], B['line'], -7, -6, lw, hi)
    o += ell(70, 78, 15, 10, f'fill="{B["cream"]}"')
    o += ell(48, 78, 7, 4.5, f'fill="{B["cheek"]}"') + ell(92, 78, 7, 4.5, f'fill="{B["cheek"]}"')
    if wave:  # giggling ^^ + open mouth
        for cx in (56, 84):
            o += path(f'M{cx - 7},68 Q{cx},59 {cx + 7},68', st(B['eye'], 3.6))
        o += path('M62,80 Q70,84 78,80 Q76,92 70,92 Q64,92 62,80 Z', fl('#8C3B4E', B['line'], 2.2))
        o += ell(70, 89, 4, 2.2, 'fill="#F59AAE"')
    else:
        for cx in (56, 84):
            o += circ(cx, 66, 5.4, f'fill="{B["eye"]}"') + circ(cx - 1.8, 64, 1.9, 'fill="#FFFFFF"')
        o += path('M63,82 Q66.5,86 70,82 Q73.5,86 77,82', st(B['line'], 2.4))
    o += path('M65,74 L75,74 L70,79 Z', f'fill="{B["nose"]}" stroke="{B["nose"]}" stroke-width="2" stroke-linejoin="round"')
    # tiny bow at the neck (cream + slate)
    o += path('M58,92 L70,98 L58,104 Z M82,92 L70,98 L82,104 Z', fl('#9DB0C8', '#617390', 2.4))
    o += circ(70, 98, 3.4, fl('#9DB0C8', '#617390', 2))
    return svg(140, 140, o, ''.join(d.defs))


# ======================================================================= BALLOON
def balloon():
    d = Doc('l')
    hi = (ell(38, 46, 13, 22, 'fill="#FFFFFF" opacity=".55" transform="rotate(24 38 46)"') +
          ell(48, 24, 5, 4, 'fill="#FFFFFF" opacity=".7"'))
    o = path('M60,138 C54,152 70,160 62,172 C54,184 50,190 58,198 C64,204 56,210 60,216', st('#8C8FA6', 2.4))
    o += path('M53,140 L67,140 L63,130 L57,130 Z', fl('#7CC0AA', '#4E9A83', 3))
    o += d.shaded('<path d="M60,130 C24,128 8,96 10,68 C12,36 34,12 60,12 C86,12 108,36 110,68 C112,96 96,128 60,130 Z" {a}/>',
                  '#9ED9C5', '#7CC0AA', '#4E9A83', -9, -8, 4, hi)
    return svg(120, 220, o, ''.join(d.defs))


# ======================================================================= CARGO
def sticker(prims, w=15):
    """White sticker border behind the union of silhouette primitives (element templates with {a})."""
    rim = ''.join(p.format(a=f'fill="#B8A890" stroke="#B8A890" stroke-width="{w + 3}" stroke-linejoin="round" opacity="1"') for p in prims)
    white = ''.join(p.format(a=f'fill="#FFFFFF" stroke="#FFFFFF" stroke-width="{w}" stroke-linejoin="round"') for p in prims)
    return f'<g opacity=".35">{rim}</g>{white}'


LC = 3.8  # cargo outline


def cargo_teddy():
    d = Doc('t')
    T = ('#D9A066', '#B9824C', '#7E5530')
    head = '<circle cx="80" cy="62" r="33" {a}/>'
    bodyp = '<ellipse cx="80" cy="114" rx="36" ry="32" {a}/>'
    ears = ['<circle cx="53" cy="36" r="13" {a}/>', '<circle cx="107" cy="36" r="13" {a}/>']
    legs = ['<ellipse cx="54" cy="134" rx="17" ry="13" {a}/>', '<ellipse cx="106" cy="134" rx="17" ry="13" {a}/>']
    arms = ['<ellipse cx="44" cy="104" rx="12" ry="18" transform="rotate(28 44 104)" {a}/>',
            '<ellipse cx="116" cy="104" rx="12" ry="18" transform="rotate(-28 116 104)" {a}/>']
    o = sticker([head, bodyp] + ears + legs + arms)
    for e in ears:
        o += d.shaded(e, T[0], T[1], T[2], -4, -4, LC)
    o += ell(53, 37, 6, 6, 'fill="#F3D2A6"') + ell(107, 37, 6, 6, 'fill="#F3D2A6"')
    o += d.shaded(bodyp, T[0], T[1], T[2], -8, -6, LC)
    o += ell(80, 118, 18, 16, 'fill="#F3D2A6"')
    for a in arms:
        o += d.shaded(a, T[0], T[1], T[2], -4, -4, LC)
    for l in legs:
        o += d.shaded(l, T[0], T[1], T[2], -4, -4, LC)
    o += ell(54, 136, 8, 7, 'fill="#F3D2A6"') + ell(106, 136, 8, 7, 'fill="#F3D2A6"')
    hi = ell(66, 46, 12, 7, 'fill="#FFFFFF" opacity=".35" transform="rotate(-25 66 46)"')
    o += d.shaded(head, T[0], T[1], T[2], -7, -6, LC, hi)
    o += ell(80, 76, 16, 12, fl('#F6E3C4', T[2], 2.6))
    o += path('M73,71 Q80,67 87,71 Q84,78 80,78 Q76,78 73,71 Z', 'fill="#5A3B2A"')
    o += path('M80,78 L80,82 M73,84 Q80,89 87,84', st('#5A3B2A', 2.6))
    o += circ(67, 58, 4.6, 'fill="#3A2A22"') + circ(93, 58, 4.6, 'fill="#3A2A22"')
    o += circ(65.6, 56.6, 1.6, 'fill="#FFFFFF"') + circ(91.6, 56.6, 1.6, 'fill="#FFFFFF"')
    o += ell(58, 72, 6, 3.6, 'fill="#F2A9A0" opacity=".8"') + ell(102, 72, 6, 3.6, 'fill="#F2A9A0" opacity=".8"')
    # slate bow tie
    o += path('M66,92 L80,98 L66,104 Z M94,92 L80,98 L94,104 Z', fl('#9DB0C8', '#5C6E8A', 2.6))
    o += circ(80, 98, 3.6, fl('#9DB0C8', '#5C6E8A', 2))
    return svg(160, 160, o, ''.join(d.defs))


def cargo_ball():
    d = Doc('a')
    c = '<circle cx="80" cy="94" r="54" {a}/>'
    o = sticker([c])
    cid = d.clip('<circle cx="80" cy="94" r="54"/>')
    o += circ(80, 94, 54, 'fill="#FFF4E0"')
    o += f'<g clip-path="url(#{cid})">'
    o += path('M80,40 C46,62 46,126 80,148 C62,124 62,64 80,40 Z', 'fill="#7D8FA8"')
    o += path('M80,40 C130,58 140,118 112,146 C122,116 112,66 80,40 Z', 'fill="#C9D3DF"')
    o += path('M80,40 C30,58 20,118 48,146 C38,116 48,66 80,40 Z', 'fill="#C9D3DF"')
    o += path('M80,40 C114,62 114,126 80,148 C98,124 98,64 80,40 Z', 'fill="#7D8FA8"')
    o += circ(102, 118, 64, 'fill="none" stroke="#2F3A4E" stroke-opacity=".14" stroke-width="22"')
    o += ell(58, 66, 15, 9, 'fill="#FFFFFF" opacity=".6" transform="rotate(-35 58 66)"')
    o += '</g>'
    o += circ(80, 42, 6, fl('#FFF4E0', '#56657E', 2.6))
    o += circ(80, 94, 54, fl('none', '#56657E', LC))
    return svg(160, 160, o, ''.join(d.defs))


def cargo_duckie():
    d = Doc('d')
    Y = ('#FBE38E', '#E7C562', '#B08A2E')
    bodyp = '<path d="M30,112 C30,90 54,84 84,90 C104,94 118,84 132,72 C142,84 144,104 136,122 C126,144 104,148 80,148 C50,148 30,134 30,112 Z" {a}/>'
    headp = '<circle cx="62" cy="66" r="28" {a}/>'
    beakp = '<path d="M38,70 C26,66 18,70 16,76 C22,84 32,84 40,80 Z" {a}/>'
    o = sticker([bodyp, headp, beakp])
    o += d.shaded(bodyp, Y[0], Y[1], Y[2], -8, -7, LC)
    o += path('M74,108 C88,98 108,100 116,110 C106,124 86,126 74,108 Z', fl(Y[1], Y[2], 3) + ' opacity=".9"')
    o += path('M84,112 Q96,108 106,113', st('#FFF4C4', 2.6))
    hi = ell(52, 52, 9, 6, 'fill="#FFFFFF" opacity=".5" transform="rotate(-25 52 52)"')
    o += d.shaded(headp, Y[0], Y[1], Y[2], -6, -6, LC, hi)
    o += d.shaded(beakp, '#F2A65A', '#D98840', '#A8642A', -3, -3, 3.4)
    o += path('M20,76 Q28,78 38,76', st('#A8642A', 2.2))
    o += circ(56, 62, 5.4, 'fill="#2F2A3A"') + circ(54.2, 60.2, 2, 'fill="#FFFFFF"')
    o += ell(72, 76, 7, 4.2, 'fill="#F6B1A0" opacity=".9"')
    o += path('M64,40 Q66,30 74,30 M66,40 Q60,30 66,26', st(Y[2], 3))
    return svg(160, 160, o, ''.join(d.defs))


def cargo_rocket():
    d = Doc('r')
    bodyp = '<path d="M80,12 C110,32 114,80 106,124 L54,124 C46,80 50,32 80,12 Z" {a}/>'
    finl = '<path d="M56,90 C40,100 30,118 30,146 L58,128 Z" {a}/>'
    finr = '<path d="M104,90 C120,100 130,118 130,146 L102,128 Z" {a}/>'
    noz = '<path d="M62,122 L98,122 L92,146 L68,146 Z" {a}/>'
    o = sticker([bodyp, finl, finr, noz])
    o += d.shaded(finl, '#7D8FA8', '#617390', '#46546B', -4, -4, LC)
    o += d.shaded(finr, '#7D8FA8', '#617390', '#46546B', -4, -4, LC)
    o += d.shaded(noz, '#9DB0C8', '#7D8FA8', '#46546B', -3, -3, LC)
    hi = ell(66, 60, 6, 22, 'fill="#FFFFFF" opacity=".6" transform="rotate(8 66 60)"')
    o += d.shaded(bodyp, '#F4EBDD', '#DCCFBC', '#8C7D69', -7, -5, LC, hi)
    cid = d.clip(bodyp.format(a=''))
    o += f'<g clip-path="url(#{cid})">' + rect(30, 0, 100, 40, 0, 'fill="#7D8FA8"') + rect(30, 102, 100, 10, 0, 'fill="#9DB0C8"') + '</g>'
    o += path('M54,40 Q80,34 106,40', st('#46546B', 3))
    o += bodyp.format(a=fl('none', '#8C7D69', LC))
    o += path('M80,12 C96,22 104,34 106,40 Q80,34 54,40 C56,34 64,22 80,12 Z', fl('none', '#46546B', LC))
    o += circ(80, 72, 16, fl('#7D8FA8', '#46546B', 3.4))
    o += circ(80, 72, 10, 'fill="#D7E6EF"') + ell(76, 68, 4, 3, 'fill="#FFFFFF"')
    return svg(160, 160, o, ''.join(d.defs))


def cargo_boat():
    d = Doc('o')
    hull = '<path d="M16,104 L144,104 C138,130 124,148 102,148 L58,148 C36,148 22,130 16,104 Z" {a}/>'
    sail = '<path d="M84,20 C112,40 128,70 132,94 L84,94 Z" {a}/>'
    jib = '<path d="M76,34 L76,94 L38,94 C46,72 60,50 76,34 Z" {a}/>'
    mast = '<rect x="77" y="12" width="7" height="94" rx="3" {a}/>'
    flag = '<path d="M84,12 L104,18 L84,24 Z" {a}/>'
    o = sticker([hull, sail, jib, mast, flag])
    o += d.shaded(mast, '#D9B27E', '#B88A55', '#7A5530', -2, -2, 3)
    o += flag.format(a=fl('#7D8FA8', '#46546B', 3))
    o += d.shaded(sail, '#FFF6E4', '#EADBC0', '#A8926B', -6, -5, LC)
    o += path('M96,46 L96,94 M110,64 L110,94', st('#E2D2B4', 2.6))
    o += d.shaded(jib, '#FFF6E4', '#EADBC0', '#A8926B', -5, -4, LC)
    o += d.shaded(hull, '#A9C9B0', '#88AE91', '#557A5F', -8, -7, LC)
    o += path('M20,114 L140,114', st('#FFF6E4', 5))
    for cx in (54, 80, 106):
        o += circ(cx, 130, 6.5, fl('#FFF6E4', '#557A5F', 3))
    return svg(160, 160, o, ''.join(d.defs))


def cargo_drum():
    d = Doc('u')
    W = ('#D9B27E', '#B88A55', '#7A5530')
    shell = '<path d="M24,70 L24,130 C24,148 136,148 136,130 L136,70 Z" {a}/>'
    top = '<ellipse cx="80" cy="70" rx="56" ry="17" {a}/>'
    st1 = '<path d="M50,58 L22,22" {a}/>'
    st2 = '<path d="M106,56 L130,20" {a}/>'
    o = sticker([shell, top, '<circle cx="22" cy="22" r="9" {a}/>', '<circle cx="130" cy="20" r="9" {a}/>',
                 ] + [f'<circle cx="{f(x1 + (x2 - x1) * t / 4)}" cy="{f(y1 + (y2 - y1) * t / 4)}" r="5" {{a}}/>'
                      for (x1, y1, x2, y2) in ((50, 58, 22, 22), (106, 56, 130, 20)) for t in range(5)])
    o += d.shaded(shell, W[0], W[1], W[2], -12, -4, LC)
    cid = d.clip(shell.format(a=''))
    o += f'<g clip-path="url(#{cid})">'
    o += path('M24,128 C24,146 136,146 136,128 L136,150 L24,150 Z', 'fill="#9DB0C8"')
    o += path('M24,84 C40,96 120,96 136,84 L136,74 L24,74 Z', 'fill="#9DB0C8"')
    zz = 'M28,92 L46,126 L62,94 L80,128 L98,94 L114,126 L132,92'
    o += path(zz, st('#FFF6E4', 4))
    for x in (46, 80, 114):
        o += circ(x, 126, 3.4, 'fill="#E2B24C"')
    o += path('M34,104 Q36,118 34,130 M126,104 Q124,118 126,130', st(W[1], 2.4))
    o += '</g>'
    o += shell.format(a=fl('none', W[2], LC))
    o += path('M24,130 C24,148 136,148 136,130', st('#46546B', 3.2))
    o += top.format(a=fl('#FFF6E4', '#A8926B', LC))
    o += ell(68, 66, 22, 6, 'fill="#FFFFFF" opacity=".7"')
    o += top.format(a=fl('none', '#7A5530', 3.4))
    # sticks
    for (x1, y1, x2, y2) in ((50, 58, 22, 22), (106, 56, 130, 20)):
        o += path(f'M{x1},{y1} L{x2},{y2}', st('#7A5530', 9))
        o += path(f'M{x1},{y1} L{x2},{y2}', st('#E3BE88', 4.6))
        o += circ(x2, y2, 8, fl('#F4EBDD', '#8C7D69', 3))
    o = f'<g transform="translate(0,3)">{o}</g>'
    return svg(160, 160, o, ''.join(d.defs))


# ======================================================================= ICON
def icon():
    d = Doc('i')
    defs_extra = ('<linearGradient id="ibg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE6B0"/>'
                  '<stop offset="1" stop-color="#FFC77E"/></linearGradient>'
                  '<radialGradient id="isun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF7DC"/>'
                  '<stop offset="1" stop-color="#FFF7DC" stop-opacity="0"/></radialGradient>')
    o = rect(0, 0, 512, 512, 0, 'fill="url(#ibg)"')
    o += circ(240, 200, 220, 'fill="url(#isun)"')
    for (x, y, r) in ((430, 70, 7), (470, 130, 5), (380, 40, 4), (60, 470, 0)):
        if r:
            o += circ(x, y, r, 'fill="#FFFFFF" opacity=".7"')
    # floor + track
    TY = 440
    o += rect(0, TY - 8, 512, 90, 0, 'fill="#D8B88E"')
    o += path(f'M0,{TY + 34} L512,{TY + 34} M0,{TY + 62} L512,{TY + 62}', st('#C9A577', 4))
    o += rect(0, TY - 4, 512, 16, 0, fl('#D9B27E', '#A97D48', 3.4))
    o += path(f'M0,{TY + 4} L512,{TY + 4}', st('#B88A55', 3))
    # steam puffs from the chimney
    for (x, y, r, op) in ((62, 196, 20, .95), (40, 150, 26, .9), (66, 104, 30, .8), (40, 56, 24, .65)):
        o += circ(x, y, r, f'fill="#FFFFFF" opacity="{op}" stroke="#E8D8BE" stroke-width="3"')
    # ---- cars (right, red / yellow / blue) with blocks
    cars = [('#E84A4A', '#A8282E', '#F7A0A0', 346), ('#FFD23F', '#C99A12', '#FFEB9C', 402),
            ('#3C8DE8', '#1F5BA8', '#A6CCF5', 458)]
    for (base, dark, light, x) in cars:
        w, h = 50, 54
        y0 = TY - 22 - h
        o += rect(x + 4, y0 - 22, 24, 24, 4, fl(light, dark, 3.4))
        o += rect(x + 24, y0 - 16, 22, 22, 4, fl(base, dark, 3.4))
        o += circ(x + 22, y0 - 32, 10, fl(base, dark, 3.4))
        o += rect(x, y0, w, h, 8, fl(base, dark, 4))
        o += rect(x + 5, y0 + 6, w - 10, 10, 4, f'fill="{light}" opacity=".9"')
        o += rect(x - 2, y0 - 4, w + 4, 10, 5, fl(base, dark, 3.4))
        for wx in (x + 13, x + w - 13):
            o += circ(wx, TY - 12, 12, fl('#56607A', '#353B4E', 3.4)) + circ(wx, TY - 12, 4.4, 'fill="#F4EBDD"')
    for x in (342, 398, 454):
        o += rect(x - 8, TY - 34, 14, 8, 4, fl('#E3BE88', '#7A5530', 3))
    # ---- engine (faces left): x 14..336
    o += rect(14, TY - 70, 322, 50, 12, fl('#E3BE88', '#7A5530', 4.6))           # chassis
    o += path(f'M22,{TY - 60} L326,{TY - 60}', st('#F3D9B0', 4))
    o += rect(24, TY - 154, 150, 88, 42, fl('#6F86A6', '#3F5170', 4.6))           # boiler
    o += rect(38, TY - 144, 120, 16, 8, 'fill="#93A7C2"')
    for bx in (84, 128):
        o += rect(bx, TY - 156, 12, 92, 5, fl('#E3BE88', '#7A5530', 3))
    o += circ(36, TY - 110, 22, fl('#FFE7A3', '#B98E57', 4))                       # headlamp
    o += circ(32, TY - 114, 7, 'fill="#FFFFFF"')
    o += path(f'M56,{TY - 154} L50,{TY - 214} L102,{TY - 214} L94,{TY - 154} Z', fl('#56607A', '#353B4E', 4.6))  # chimney
    o += rect(40, TY - 232, 72, 22, 10, fl('#6F86A6', '#3F5170', 4.6))
    o += circ(146, TY - 164, 14, fl('#E2B24C', '#A9822F', 3.6))                    # brass dome
    # cab back wall (darker wood) with a round back window
    o += rect(166, TY - 276, 170, 220, 12, fl('#B98E57', '#7A5530', 4.6))
    # Momo inside the cab
    s = 0.92
    mx, my = 252, TY - 10
    o += f'<g transform="translate({f(mx - 150 * s)},{f(my - 292 * s)}) scale({s})">{momo(d, "icon")}</g>'
    # cab front wall (hides Momo below the chest) + roof
    o += rect(156, TY - 116, 186, 82, 12, fl('#E3BE88', '#7A5530', 4.6))
    o += rect(170, TY - 104, 158, 12, 6, 'fill="#F3D9B0"')
    o += rect(186, TY - 84, 126, 34, 10, fl('#F4EBDD', '#B98E57', 3.4))
    o += rect(148, TY - 304, 202, 30, 14, fl('#F4EBDD', '#8C7D69', 4.6))
    o += rect(162, TY - 300, 174, 8, 4, 'fill="#FFFFFF" opacity=".7"')
    # brass whistle on the roof
    o += rect(262, TY - 332, 20, 32, 6, fl('#E2B24C', '#A9822F', 3.6))
    o += ell(272, TY - 334, 16, 7, fl('#E2B24C', '#A9822F', 3.6))
    # painted smile on the buffer beam
    o += path(f'M22,{TY - 52} Q36,{TY - 40} 50,{TY - 52}', st('#7A5530', 4))
    # wheels
    for wx in (62, 136, 222, 296):
        o += circ(wx, TY - 16, 30, fl('#56607A', '#353B4E', 4.6))
        o += circ(wx, TY - 16, 11, fl('#F4EBDD', '#8C7D69', 3))
    o += rect(58, TY - 22, 168, 10, 5, fl('#9DB0C8', '#46546B', 3))
    return svg(512, 512, o, defs_extra + ''.join(d.defs))


def main():
    write_momo()
    write('characters/bunny_toy.svg', bunny(False))
    write('characters/bunny_toy_wave.svg', bunny(True))
    write('characters/balloon.svg', balloon())
    for name, fn in (('teddy', cargo_teddy), ('ball', cargo_ball), ('duckie', cargo_duckie),
                     ('rocket', cargo_rocket), ('boat', cargo_boat), ('drum', cargo_drum)):
        write(f'items/cargo_{name}.svg', fn())
    write('icon.svg', icon())
    print('art written to', OUT, '| whistle knob', WHISTLE_KNOB)


if __name__ == '__main__':
    main()
