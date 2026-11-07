#!/usr/bin/env python3
"""Character art generator for Nini's Sea Painting (character artist A). 100 % original vector art.

Writes (relative to game/assets/default/):
  characters/nini_{idle,blink,talk,happy,cheer,think,oops,wave,paint,point}.svg + nini_full_wave.svg
        0 0 300 300, FEET ANCHOR (150,292). Nini (a baby sea turtle in a cream painter's beret) faces RIGHT in
        3/4 view, eyes on the viewer. Shell / plastron / hind flippers / tail are identical in every frame; only the
        eyes, mouth, brows, front flippers and (think / oops) a small head tilt around the neck change.
        The brush is NOT drawn here: docs/art/nini_hand.json gives, per frame, the point where the near (right)
        front flipper grips the brush handle and a suggested brush angle.
  characters/fishy.svg, fishy_happy.svg   0 0 160 120, centre anchor, facing right (soft lilac + cream stripes)
  characters/clam.svg, clam_open.svg      0 0 160 140, bottom anchor (80,136)
  characters/pearl.svg                    0 0 64 64
  icon.svg                                0 0 512 512, full bleed, opaque

Usage: python3 tools/art_nini.py [outDir]
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
HAND_JSON = os.path.join(ROOT, 'docs', 'art', 'nini_hand.json')
LW = 4.6  # outline width at viewBox 300 (= 4 px at 256)

N = {  # Nini palette (DESIGN.md section 3)
    'shell': '#5FB3B3', 'shellSh': '#3F8E90', 'shellLine': '#2C6467', 'scute': '#9AD6CF',
    'skin': '#F0CF98', 'skinSh': '#D3A96A', 'skinLine': '#8A6435', 'skinHi': '#FBE6C2',
    'cream': '#FFF1DC', 'creamSh': '#EBD5B4', 'creamLine': '#B08A5E',
    'white': '#FFFFFF', 'pupil': '#2F2A3A', 'cheek': '#F6B1A0',
    'mouth': '#7C3B33', 'tongue': '#F28F86',
    'beret': '#F4EBDD', 'beretSh': '#DCCDB8', 'beretLine': '#8C7D69', 'stalk': '#7D8FA8', 'stalkLine': '#56657C',
    'brow': '#8A6435',
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

    def __init__(self, prefix='n'):
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


# ======================================================================= NINI
HEAD = (160, 104, 80, 68)          # x 80-240, y 36-172
NECK = (156, 180)                  # tilt pivot
SHELL = (136, 232, 74, 58)         # x 62-210, y 174-290
PLAST = (164, 236, 44, 46)         # cream belly, x 120-208
EYE_N = (144, 110, 25)             # near eye (viewer's left, bigger)
EYE_F = (205, 106, 20)             # far eye (towards the snout)
MOUTH = (186, 146)
SH_F = (106, 202)                  # far front flipper shoulder (behind the body)
SH_N = (204, 200)                  # near (right) front flipper shoulder (in front)
# flipper hanging straight down from the shoulder (0,0); length ~70
FLIP = ('M-15,-4 C-21,20 -17,46 -5,64 C-1,71 8,71 11,63 C17,42 19,18 15,-4 C9,-15 -9,-15 -15,-4 Z')
GRIP = (2, 50)                     # where the brush handle sits in the flipper (local)
TIP = (3, 68)


def flipper(doc, sh, ang, scale=1.0, spots=True):
    """Front flipper; ang 0 = hanging down, > 0 swings the tip to the viewer's LEFT, < 0 to the RIGHT."""
    tf = f'translate({f(sh[0])},{f(sh[1])}) rotate({f(ang)}) scale({f(scale)})'
    tpl = f'<path d="{FLIP}" transform="{tf}" {{a}}/>'
    hi = f'<path d="M-9,4 C-12,22 -10,40 -4,54" transform="{tf}" {st(N["skinHi"], 5)} opacity=".8"/>'
    o = doc.shaded(tpl, N['skin'], N['skinSh'], N['skinLine'], dx=-6, dy=-5, hi=hi)
    if spots:
        o += (f'<g transform="{tf}" fill="{N["skinSh"]}" opacity=".75">'
              + ell(6, 30, 4.2, 5.2) + ell(1, 46, 3.4, 4.2) + '</g>')
    return o


def local_pt(sh, ang, scale, p):
    x, y = rot(p[0] * scale, p[1] * scale, ang)
    return sh[0] + x, sh[1] + y


def eye(cx, cy, r, mode='open', look=(-3, 3)):
    o = ''
    if mode in ('open', 'wide', 'look'):
        rr = r * (1.08 if mode == 'wide' else 1)
        o += circ(cx, cy, rr, fl(N['white'], N['skinLine'], 3.8))
        px, py = cx + look[0], cy + look[1]
        pr = r * (0.66 if mode == 'wide' else 0.62)
        o += circ(px, py, pr, f'fill="{N["pupil"]}"')
        o += circ(px - pr * 0.34, py - pr * 0.38, pr * 0.38, 'fill="#FFFFFF"')
        o += circ(px + pr * 0.4, py + pr * 0.4, pr * 0.15, 'fill="#FFFFFF"')
    elif mode == 'closed':          # gentle U: blink
        o += path(f'M{f(cx - r * 0.82)},{f(cy - 1)} Q{f(cx)},{f(cy + r * 0.62)} {f(cx + r * 0.82)},{f(cy - 1)}',
                  st(N['pupil'], 5))
    elif mode == 'happy':           # ^ arcs
        o += path(f'M{f(cx - r * 0.8)},{f(cy + r * 0.32)} Q{f(cx)},{f(cy - r * 0.8)} {f(cx + r * 0.8)},{f(cy + r * 0.32)}',
                  st(N['pupil'], 5.6))
    return o


def mouth(mode):
    mx, my = MOUTH
    if mode == 'closed':
        return path(f'M{mx - 15},{my - 3} Q{mx},{my + 8} {mx + 14},{my - 5}', st(N['skinLine'], 4))
    if mode == 'talk':
        o = path(f'M{mx - 15},{my - 4} Q{mx},{my - 1} {mx + 14},{my - 6} Q{mx + 11},{my + 15} {mx},{my + 16} '
                 f'Q{mx - 13},{my + 14} {mx - 15},{my - 4} Z', fl(N['mouth'], N['skinLine'], 3.4))
        o += ell(mx - 1, my + 10, 7.5, 4.2, f'fill="{N["tongue"]}"')
        return o
    if mode in ('smile', 'big'):
        k = 1.3 if mode == 'big' else 1.0
        w, h = 17 * k, 15 * k
        o = path(f'M{f(mx - w)},{f(my - 5)} Q{mx},{f(my)} {f(mx + w)},{f(my - 8)} '
                 f'Q{f(mx + w * 0.8)},{f(my + h)} {mx},{f(my + h)} Q{f(mx - w * 0.8)},{f(my + h)} {f(mx - w)},{f(my - 5)} Z',
                 fl(N['mouth'], N['skinLine'], 3.4))
        o += ell(mx - 1, my + h - 5 * k, 9 * k, 4.6 * k, f'fill="{N["tongue"]}"')
        return o
    if mode == 'o':                 # curious "hmm?"
        return ell(mx + 2, my + 3, 6, 7, fl(N['mouth'], N['skinLine'], 3.2))
    if mode == 'hmm':               # little wavy curious mouth
        return path(f'M{mx - 12},{my + 1} Q{mx - 6},{my - 4} {mx},{my + 1} Q{mx + 6},{my + 5} {mx + 12},{my - 1}',
                    st(N['skinLine'], 4))
    return ''


def beret(doc):
    """Slouchy painter's beret, tilted down to the back (viewer's left), perched on the head."""
    o = ''
    # stalk (little stem on top)
    o += path('M152,22 Q152,10 160,4', st(N['stalkLine'], 10))
    o += path('M152,22 Q152,10 160,4', st(N['stalk'], 5.2))
    cap = ('M58,74 C40,62 52,36 92,26 C126,16 182,12 216,20 C244,28 250,48 238,60 '
           'C228,70 200,66 166,68 C130,70 100,78 82,84 C70,86 62,80 58,74 Z')
    hi = ell(108, 32, 32, 8, 'fill="#FFFFFF" opacity=".6" transform="rotate(-10 108 32)"')
    o += doc.shaded(f'<path d="{cap}" {{a}}/>', N['beret'], N['beretSh'], N['beretLine'], dx=-5, dy=-9, hi=hi)
    # soft fold on top
    o += path('M120,40 C150,30 196,28 222,34', st(N['beretSh'], 3.4))
    # stitched rim where it hugs the head
    o += path('M84,76 C120,64 180,58 230,60', st(N['beretSh'], 2.6) + ' stroke-dasharray="1 7"')
    return o


def head(doc, eyes='open', mo='closed', brows=None, look=(-3, 3)):
    hx, hy, hrx, hry = HEAD
    o = ''
    hi = ell(116, 84, 26, 14, 'fill="#FFFFFF" opacity=".28" transform="rotate(-30 116 84)"')
    o += doc.shaded(f'<ellipse cx="{hx}" cy="{hy}" rx="{hrx}" ry="{hry}" {{a}}/>',
                    N['skin'], N['skinSh'], N['skinLine'], dx=-12, dy=-10, hi=hi)
    # soft turtle head patches at the back of the head
    o += ell(98, 120, 9, 7, f'fill="{N["skinSh"]}" opacity=".55"')
    o += ell(92, 100, 6, 5, f'fill="{N["skinSh"]}" opacity=".55"')
    # nostrils on the snout
    o += ell(226, 124, 2.4, 2.8, f'fill="{N["skinLine"]}"') + ell(234, 122, 2, 2.4, f'fill="{N["skinLine"]}"')
    # cheeks
    o += ell(116, 142, 15, 9, f'fill="{N["cheek"]}" opacity=".9"')
    o += ell(226, 140, 9, 7, f'fill="{N["cheek"]}" opacity=".9"')
    lf = (look[0] * 0.8, look[1] * 0.8)
    o += eye(*EYE_N, mode=eyes, look=look)
    o += eye(*EYE_F, mode=eyes, look=lf)
    if brows:
        for (cx, cy, r), lift in zip((EYE_N, EYE_F), brows):
            y = cy - r - 12 - lift
            o += path(f'M{f(cx - 10)},{f(y + 3)} Q{f(cx)},{f(y - 4)} {f(cx + 10)},{f(y + 3)}', st(N['brow'], 4.2))
    o += mouth(mo)
    o += beret(doc)
    return o


def body(doc):
    o = ''
    # tiny tail (back, viewer's left)
    o += path('M70,262 Q50,268 44,280 Q60,282 76,274 Z', fl(N['skin'], N['skinLine']))
    sx, sy, srx, sry = SHELL
    shell_t = f'<ellipse cx="{sx}" cy="{sy}" rx="{srx}" ry="{sry}" {{a}}/>'
    cid = doc.clip(shell_t.format(a=''))
    o += shell_t.format(a=f'fill="{N["shellSh"]}"')
    o += f'<g clip-path="url(#{cid})">'
    o += f'<g transform="translate(-12,-10)">{shell_t.format(a=chr(102) + "ill=" + chr(34) + N["shell"] + chr(34))}</g>'
    # scute patches (lighter), visible on the back half of the shell
    for (cx, cy, r) in ((96, 210, 20), (78, 250, 17), (114, 250, 15), (124, 190, 13), (102, 280, 13)):
        pts = ' '.join(f'{f(cx + r * math.cos(math.radians(30 + 60 * i)))},{f(cy + r * math.sin(math.radians(30 + 60 * i)))}'
                       for i in range(6))
        o += (f'<polygon points="{pts}" fill="{N["scute"]}" stroke="{N["shellSh"]}" stroke-width="3" '
              f'stroke-linejoin="round"/>')
    o += ell(84, 196, 12, 6, 'fill="#FFFFFF" opacity=".35" transform="rotate(-30 84 196)"')
    o += '</g>'
    o += shell_t.format(a=f'fill="none" stroke="{N["shellLine"]}" stroke-width="{f(LW)}"')
    # shell rim line (marginal scutes edge)
    o += path('M68,252 Q80,284 132,288', st(N['shellLine'], 2.6) + ' opacity=".5"')
    # hind flippers (feet) peeking under the shell
    for cx, a in ((112, 6), (184, -6)):
        o += doc.shaded(f'<ellipse cx="{cx}" cy="282" rx="23" ry="10" transform="rotate({a} {cx} 282)" {{a}}/>',
                        N['skin'], N['skinSh'], N['skinLine'], dx=-4, dy=-4)
        o += path(f'M{cx - 6},{287} L{cx - 6},{283} M{cx + 4},{288} L{cx + 4},{284}', st(N['skinSh'], 2.6))
    # neck (plastron and head overlap it, so it reads as one soft neck, not a collar)
    o += doc.shaded('<ellipse cx="162" cy="182" rx="30" ry="22" {a}/>', N['skin'], N['skinSh'], N['skinLine'],
                    dx=-5, dy=-5)
    # plastron (cream belly)
    px, py, prx, pry = PLAST
    o += doc.shaded(f'<ellipse cx="{px}" cy="{py}" rx="{prx}" ry="{pry}" {{a}}/>', N['cream'], N['creamSh'],
                    N['creamLine'], dx=-7, dy=-6, w=3.8)
    for d in (f'M{px - 40},220 Q{px},230 {px + 40},218', f'M{px - 43},244 Q{px},254 {px + 43},242',
              f'M{px - 34},266 Q{px},274 {px + 34},264', f'M{px + 2},196 L{px + 2},280'):
        o += path(d, st(N['creamSh'], 3.2))
    return o


F_REST, N_REST = (SH_F, 22, 1), (SH_N, -20, 1)
POSES = {
    #          eyes      mouth     far flipper             near (right) flipper       tilt brows    look
    'idle':    ('open',  'closed', F_REST,                 N_REST,                    0, None,     (-3, 3)),
    'blink':   ('closed', 'closed', F_REST,                N_REST,                    0, None,     (-3, 3)),
    'talk':    ('open',  'talk',   (SH_F, 30, 1),          (SH_N, -34, 1),            0, None,     (-3, 3)),
    'happy':   ('wide',  'smile',  (SH_F, 52, 1),          (SH_N, -52, 1),            0, None,     (-3, 2)),
    'cheer':   ('happy', 'big',    ((102, 194), 148, 1),   ((208, 192), -146, 1),     0, None,     (0, 0)),
    'think':   ('look',  'hmm',    F_REST,                 ((222, 210), 150, 0.82),   7, (0, 6),   (5, -6)),
    'oops':    ('wide',  'o',      (SH_F, 40, 0.95),       ((206, 196), -72, 0.92),  -7, (9, 0),   (-2, 1)),
    'wave':    ('open',  'smile',  F_REST,                 ((210, 190), -164, 1),     0, None,     (-3, 3)),
    'paint':   ('open',  'smile',  F_REST,                 ((206, 196), -104, 1),     0, None,     (-1, 3)),
    'point':   ('look',  'talk',   F_REST,                 ((208, 192), -132, 1),     0, (4, 4),   (6, -5)),
    'full_wave': ('wide', 'smile', ((104, 198), 62, 1),    ((210, 190), -164, 1),     0, None,     (-3, 3)),
}
# suggested brush angle per frame: degrees, canvas convention (0 = pointing right, -90 = pointing up), the
# direction from the grip point towards the bristle tip.
BRUSH_ANG = {'idle': -62, 'blink': -62, 'talk': -58, 'happy': -50, 'cheer': -70, 'think': -15, 'oops': -55,
             'wave': -40, 'paint': -18, 'point': -40, 'full_wave': -40}


def palette(cx, cy):
    """A small wooden-cream painter's palette for the title pose (held in the far flipper)."""
    o = path(f'M{cx - 34},{cy + 4} C{cx - 36},{cy - 22} {cx + 6},{cy - 30} {cx + 30},{cy - 16} '
             f'C{cx + 42},{cy - 8} {cx + 34},{cy + 4} {cx + 24},{cy + 6} C{cx + 14},{cy + 8} {cx + 16},{cy + 20} '
             f'{cx + 4},{cy + 24} C{cx - 14},{cy + 30} {cx - 32},{cy + 22} {cx - 34},{cy + 4} Z',
             fl('#EBD3A8', '#8A6435', 4))
    for (dx, dy, c) in ((-20, -2, '#E84A4A'), (-12, -16, '#FFD23F'), (6, -18, '#3C8DE8'), (20, -6, '#4CC26B'),
                        (-18, 14, '#FF8FC0')):
        o += circ(cx + dx, cy + dy, 6.2, f'fill="{c}"') + circ(cx + dx - 2, cy + dy - 2, 1.8, 'fill="#FFFFFF" opacity=".7"')
    return o


def nini(doc, pose):
    eyes, mo, fF, fN, tilt, brows, look = POSES[pose]
    o = ''
    if pose != 'full_wave':
        o += flipper(doc, *fF)
    o += body(doc)
    if pose == 'full_wave':
        tx, ty = local_pt(*fF, (2, 58))
        o += palette(tx - 8, ty + 4)
        o += flipper(doc, *fF)
    hd = head(doc, eyes, mo, brows, look)
    if tilt:
        hd = f'<g transform="rotate({tilt} {NECK[0]} {NECK[1]})">{hd}</g>'
    o += hd
    if pose in ('wave', 'full_wave'):
        o += path('M262,40 Q276,52 278,70 M280,30 Q294,48 292,74', st(N['skinSh'], 3.6) + ' opacity=".7"')
    if pose == 'cheer':
        for (x, y, r) in ((40, 120, 5), (258, 112, 5), (30, 92, 3.4), (270, 84, 3.4)):
            o += circ(x, y, r, f'fill="none" stroke="{N["shellSh"]}" stroke-width="2.6" opacity=".7"')
    o += flipper(doc, *fN)
    return o


def hand_table():
    out = {}
    for pose, p in POSES.items():
        sh, ang, sc = p[3]
        x, y = local_pt(sh, ang, sc, GRIP)
        out[pose] = {'hand': [round(x), round(y)], 'angle': BRUSH_ANG[pose]}
    return out


def write_nini():
    for pose in POSES:
        d = Doc('n')
        b = nini(d, pose)
        write(f'characters/nini_{pose}.svg', svg(300, 300, b, ''.join(d.defs)))
    tbl = hand_table()
    os.makedirs(os.path.dirname(HAND_JSON), exist_ok=True)
    with open(HAND_JSON, 'w') as fh:
        json.dump({'_about': ('Nini right (near) front flipper grip point per frame, in the 0 0 300 300 viewBox '
                              '(feet anchor 150,292). angle = suggested brush direction in degrees, canvas convention '
                              '(0 = pointing right, -90 = up), from the grip towards the bristle tip. The handle may '
                              'stick out ~16 px behind the grip; bristle tip ~60 px ahead at in-SVG scale.'),
                   **tbl}, fh, indent=1)
        fh.write('\n')
    return tbl


# ======================================================================= FISHY
FI = {'fill': '#C9B6E4', 'shade': '#A994CC', 'line': '#6A5690', 'fin': '#B7A2D9', 'stripe': '#FFF1DC'}


def fishy(happy=False):
    d = Doc('f')
    o = ''
    # tail
    o += d.shaded('<path d="M40,60 C28,44 16,34 8,32 C12,48 12,72 8,88 C16,86 28,76 40,60 Z" {a}/>',
                  FI['fin'], FI['shade'], FI['line'], -3, -3, 3.8)
    # dorsal + belly fin
    o += path('M64,32 C70,14 96,12 108,28 Z', fl(FI['fin'], FI['line'], 3.8))
    o += path('M72,88 C76,100 90,102 96,90 Z', fl(FI['fin'], FI['line'], 3.6))
    body_t = '<ellipse cx="82" cy="60" rx="48" ry="33" {a}/>'
    cid = d.clip(body_t.format(a=''))
    o += body_t.format(a=f'fill="{FI["shade"]}"')
    o += f'<g clip-path="url(#{cid})"><g transform="translate(-7,-6)">{body_t.format(a="fill=" + chr(34) + FI["fill"] + chr(34))}</g>'
    for x in (58, 86):
        o += path(f'M{x},20 C{x + 10},44 {x + 10},76 {x},100 L{x + 12},100 C{x + 22},76 {x + 22},44 {x + 12},20 Z',
                  f'fill="{FI["stripe"]}"')
    o += ell(62, 40, 14, 6, 'fill="#FFFFFF" opacity=".45" transform="rotate(-22 62 40)"')
    o += '</g>'
    o += body_t.format(a=f'fill="none" stroke="{FI["line"]}" stroke-width="3.8"')
    # side fin
    o += path('M92,62 C80,60 70,68 68,78 C78,80 90,74 92,62 Z', fl(FI['fin'], FI['line'], 3))
    # face
    o += ell(118, 70, 6.5, 4.5, 'fill="#F6B1A0" opacity=".9"')
    if happy:
        o += path('M100,52 Q108,40 116,52', st('#2F2A3A', 4.4))
        o += path('M108,72 Q118,74 126,68 Q124,82 114,82 Q106,80 108,72 Z', fl('#7C3B33', FI['line'], 2.6))
        o += ell(116, 78, 4.4, 2.4, 'fill="#F28F86"')
    else:
        o += circ(108, 50, 11, fl('#FFFFFF', FI['line'], 3))
        o += circ(110, 51, 6.6, 'fill="#2F2A3A"') + circ(108, 48.5, 2.4, 'fill="#FFFFFF"')
        o += path('M110,72 Q118,78 126,70', st(FI['line'], 3.2))
    return svg(160, 120, o, ''.join(d.defs))


# ======================================================================= CLAM / PEARL
CL = {'fill': '#E4C9C2', 'shade': '#C9A79F', 'line': '#8E6A63', 'light': '#F3E2DD', 'inside': '#F8E6E0'}


def clam_base(d):
    """Lower shell half, a fan on the sand; rim at y ~ 96."""
    t = '<path d="M14,96 C14,124 44,134 80,134 C116,134 146,124 146,96 C126,104 104,106 80,106 C56,106 34,104 14,96 Z" {a}/>'
    o = ell(80, 134, 64, 5, 'fill="#5A4A44" opacity=".14"')
    o += d.shaded(t, CL['fill'], CL['shade'], CL['line'], -5, -4, 4)
    for x in (40, 60, 80, 100, 120):
        o += path(f'M{x},{108 if x != 80 else 109} Q{80 + (x - 80) * 1.12},122 {80 + (x - 80) * 0.9},131',
                  st(CL['shade'], 2.6))
    return o


def lid(d, open_=False):
    t = ('<path d="M12,96 C10,58 42,30 80,30 C118,30 150,58 148,96 C126,104 104,106 80,106 '
         'C56,106 34,104 12,96 Z" {a}/>')
    hi = ell(52, 52, 20, 9, 'fill="#FFFFFF" opacity=".45" transform="rotate(-28 52 52)"')
    o = d.shaded(t, CL['fill'], CL['shade'], CL['line'], -7, -6, 4, hi)
    for x in (36, 58, 80, 102, 124):
        o += path(f'M80,{f(98)} Q{80 + (x - 80) * 0.9},{60} {80 + (x - 80) * 1.25},{f(42 + abs(x - 80) * 0.5)}',
                  st(CL['shade'], 2.8))
    # scalloped rim
    o += path('M16,98 Q26,92 36,100 Q46,94 58,103 Q69,96 80,105 Q91,96 102,103 Q114,94 124,100 Q134,92 144,98',
              st(CL['line'], 2.6) + ' opacity=".55"')
    o += circ(80, 32, 0.1, '')
    if open_:
        inner = ell(80, 100, 64, 11, fl(CL['inside'], CL['line'], 3))
        return f'<g transform="translate(0,-27) rotate(-5 80 96)">{o}{inner}</g>'
    return o


def clam(open_=False):
    d = Doc('k')
    o = ''
    if open_:
        g = d.uid('r')
        d.defs.append(f'<radialGradient id="{g}"><stop offset="0" stop-color="#FFFBEA" stop-opacity="1"/>'
                      f'<stop offset=".45" stop-color="#FFF1C0" stop-opacity=".75"/>'
                      f'<stop offset="1" stop-color="#FFF1C0" stop-opacity="0"/></radialGradient>')
        o += lid(d, True)
        # inside of the shell
        o += path('M18,96 C30,86 56,82 80,82 C104,82 130,86 142,96 C122,104 102,106 80,106 C58,106 38,104 18,96 Z',
                  fl(CL['inside'], CL['line'], 3.2))
        o += clam_base(d)
        o += ell(80, 94, 40, 22, f'fill="url(#{g})"')
        for (x, y, s) in ((50, 70, 6), (112, 64, 5), (92, 54, 4)):
            o += path(f'M{x},{y - s} L{x + s * 0.3},{y - s * 0.3} L{x + s},{y} L{x + s * 0.3},{y + s * 0.3} L{x},{y + s} '
                      f'L{x - s * 0.3},{y + s * 0.3} L{x - s},{y} L{x - s * 0.3},{y - s * 0.3} Z', 'fill="#FFF6C8"')
    else:
        o += clam_base(d)
        o += lid(d)
    return svg(160, 140, o, ''.join(d.defs))


def pearl():
    g = 'pg1'
    defs = (f'<radialGradient id="{g}" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#FFFFFF"/>'
            f'<stop offset=".55" stop-color="#F6EFF4"/><stop offset="1" stop-color="#D9CBE0"/></radialGradient>')
    o = circ(32, 33, 23, f'fill="url(#{g})" stroke="#9C8AA6" stroke-width="3.4"')
    o += path('M16,40 Q26,52 44,48', st('#E9D6EC', 3) + ' opacity=".9"')
    o += ell(24, 24, 7, 4.5, 'fill="#FFFFFF" transform="rotate(-35 24 24)"')
    o += path('M50,6 L52,12 L58,14 L52,16 L50,22 L48,16 L42,14 L48,12 Z', 'fill="#FFF6C8" stroke="#E2C86A" stroke-width="1.2"')
    return svg(64, 64, o, defs)


# ======================================================================= ICON
def brush(x, y, ang, length=96, color='#3C8DE8'):
    """Brush whose handle is gripped at (x,y), pointing along ang (degrees, canvas convention)."""
    o = f'<g transform="translate({f(x)},{f(y)}) rotate({f(ang)})">'
    o += rect(-24, -5.5, length - 20, 11, 5.5, fl('#C98F5A', '#6E4526', 3.4))
    o += rect(length - 48, -7.5, 18, 15, 3, fl('#C9CED6', '#6B7380', 3))
    o += path(f'M{length - 31},-8 C{length - 14},-10 {length - 4},-4 {length},0 C{length - 4},4 {length - 14},10 '
              f'{length - 31},8 Z', fl(color, '#A8282E', 3))
    return o + '</g>'


def icon():
    d = Doc('i')
    g = d.uid('w')
    d.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FD3D8"/>'
                  f'<stop offset="1" stop-color="#2E8FA8"/></linearGradient>')
    o = rect(0, 0, 512, 512, 0, f'fill="url(#{g})"')
    # god rays
    for x0 in (90, 230, 380):
        o += path(f'M{x0},0 L{x0 + 60},0 L{x0 - 20},420 L{x0 - 90},420 Z', 'fill="#FFFFFF" opacity=".10"')
    # far reef / kelp silhouettes
    o += path('M0,400 C40,360 80,380 110,350 C140,320 170,370 210,360 L210,512 L0,512 Z', 'fill="#3E9AAE" opacity=".6"')
    o += path('M30,420 C20,360 46,330 36,280 M60,420 C70,370 52,340 64,300', st('#4FA59B', 12) + ' opacity=".6"')
    # sand
    o += path('M0,440 C120,420 260,428 512,410 L512,512 L0,512 Z', fl('#EAD7AE', '#C9B07E', 4))
    o += ell(420, 470, 30, 6, 'fill="#D8C08E"') + ell(140, 490, 40, 6, 'fill="#D8C08E"')
    # bubbles
    for (x, y, r) in ((470, 70, 12), (440, 40, 7), (300, 52, 9), (60, 70, 8)):
        o += circ(x, y, r, 'fill="#FFFFFF" fill-opacity=".25" stroke="#FFFFFF" stroke-width="3" opacity=".8"')
    # canvas board (shell-ish frame) with a half-painted fish
    o += path('M296,410 L280,470 M440,410 L456,470', st('#8A6435', 10))
    o += rect(232, 120, 262, 296, 34, fl('#F3D9C6', '#9E7166', 6))
    o += rect(252, 140, 222, 256, 20, fl('#FFF8EC', '#C9A79F', 4))
    fish_body = 'M300,268 C300,222 344,196 386,196 C428,196 452,232 452,268 C452,304 428,338 386,338 C344,338 300,312 300,268 Z'
    fish_tail = 'M304,268 L262,224 C270,252 270,284 262,312 Z'
    cid = d.clip(f'<path d="{fish_body}"/>')
    o += path(fish_tail, 'fill="#FFFFFF"')
    o += path(fish_body, 'fill="#FFFFFF"')
    # painted part of the body (left half, blue) with the wobbly fill edge
    o += (f'<g clip-path="url(#{cid})"><path d="M290,180 L372,180 C356,214 386,236 366,268 C350,296 384,316 370,350 '
          f'L290,350 Z" fill="#E84A4A"/><path d="M290,180 L340,180 C316,200 312,220 300,250 Z" fill="#F7A0A0" '
          f'opacity=".7"/></g>')
    o += path(fish_tail, st('#33405E', 6))
    o += path(fish_body, st('#33405E', 6))
    o += path('M372,200 C392,174 420,176 432,208 Z', 'fill="#FFD23F"')
    o += path('M372,200 C392,174 420,176 432,208', st('#33405E', 6))
    o += circ(420, 252, 11, 'fill="#33405E"') + circ(417, 248, 3.6, 'fill="#FFFFFF"')
    o += path('M428,292 Q440,296 446,286', st('#33405E', 5))
    # paint drops
    o += circ(352, 372, 6, 'fill="#E84A4A"')
    # Nini (paint pose), scaled
    sc = 1.1
    tx, ty = -10, 470 - 292 * sc
    nd = Doc('in')
    nb = nini(nd, 'paint')
    d.defs.extend(nd.defs)
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">{nb}</g>'
    hx, hy = hand_table()['paint']['hand']
    o += brush(tx + hx * sc, ty + hy * sc, -24, 112, '#E84A4A')
    # re-draw near flipper tip over the handle so it's gripped
    sh, ang, s2 = POSES['paint'][3]
    o += f'<g transform="translate({f(tx)},{f(ty)}) scale({sc})">'
    o += f'<g clip-path="url(#{d.clip(circ(*local_pt(sh, ang, s2, GRIP), 16))})">{flipper(d, sh, ang, s2)}</g></g>'
    return svg(512, 512, o, ''.join(d.defs))


def main():
    tbl = write_nini()
    write('characters/fishy.svg', fishy(False))
    write('characters/fishy_happy.svg', fishy(True))
    write('characters/clam.svg', clam(False))
    write('characters/clam_open.svg', clam(True))
    write('characters/pearl.svg', pearl())
    write('icon.svg', icon())
    for k, v in tbl.items():
        print(f'{k:10s} hand={v["hand"]} angle={v["angle"]}')


if __name__ == '__main__':
    main()
