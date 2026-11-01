#!/usr/bin/env python3
"""Generate Mầm's Treasure Reef sea-friend sprites (character artist B).

Writes
  game/assets/default/items/animal_{crab,octopus,seahorse,clownfish,dolphin,jellyfish,starfish,whale,puffer}.svg
      (0 0 128 128, centred, ~110 px, white sticker border + faint drop shadow)
  game/assets/default/characters/fish_photobomb_a.svg / _b.svg   (0 0 256 128, silly fish facing right)
  game/assets/default/characters/crab_dance_a.svg / _b.svg       (0 0 128 128, the giggling crab, no sticker)

All art is original and built from primitives: every part = fill + one-step cel shade (the part shifted
up-left and clipped leaves a darker crescent lower-right) + outline in a darker tone of the fill (never
black) + one soft highlight. The sticker border is one <use> of the merged silhouette stroked white, with a
second faint, offset copy as the drop shadow. No filters, text, fonts, scripts or external refs.

Usage: python3 tools/art_sea.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITEMS = os.path.join(ROOT, 'game', 'assets', 'default', 'items')
CHARS = os.path.join(ROOT, 'game', 'assets', 'default', 'characters')

EYE = '#2E2638'
CHEEK = '#F7A3B8'
STICKER_SW = 15          # 7.5 px beyond geometry = 6 px beyond a 3 px outline
SHADOW = '#1F4A6E'       # faint deep-water drop shadow


def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def hexrgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def mix(a, b, t):
    ca, cb = hexrgb(a), hexrgb(b)
    return '#%02X%02X%02X' % tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))


# ---------- shape builders (strings with an {A} slot for paint attributes) ----------
def E(cx, cy, rx, ry, rot=0):
    tr = ' transform="rotate(%s %s %s)"' % (f(rot), f(cx), f(cy)) if rot else ''
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s"%s {A}/>' % (f(cx), f(cy), f(rx), f(ry), tr)


def C(cx, cy, r):
    return '<circle cx="%s" cy="%s" r="%s" {A}/>' % (f(cx), f(cy), f(r))


def P(d):
    return '<path d="%s" {A}/>' % ' '.join(d.split())


def R(x, y, w, h, rx=0):
    return '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" {A}/>' % (f(x), f(y), f(w), f(h), f(rx))


def paint(shape, attrs):
    return shape.replace('{A}', attrs)


def mirror_d(d, cx=64):
    """Mirror an absolute path made of M/L/C/Q/Z commands with x,y pairs around x=cx."""
    out, toks = [], d.replace(',', ' ').split()
    i = 0
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            out.append(t)
            i += 1
            continue
        x, y = float(toks[i]), float(toks[i + 1])
        out.append('%s %s' % (f(2 * cx - x), f(y)))
        i += 2
    return ' '.join(out)


def bumpy(cx, cy, rx, ry, n, bump, start=0.0):
    """Closed path: n soft bumps bulging outward around an ellipse (puffer, jelly skirt)."""
    pts = []
    for k in range(n):
        a = start + 2 * math.pi * k / n
        pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    d = 'M %s %s' % (f(pts[0][0]), f(pts[0][1]))
    for k in range(n):
        p0, p1 = pts[k], pts[(k + 1) % n]
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        dx, dy = mx - cx, my - cy
        L = math.hypot(dx, dy) or 1
        qx, qy = mx + dx / L * bump * 2, my + dy / L * bump * 2
        d += ' Q %s %s %s %s' % (f(qx), f(qy), f(p1[0]), f(p1[1]))
    return d + ' Z'


class Art:
    def __init__(self, name, w=128, h=128):
        self.name = name
        self.w, self.h = w, h
        self.defs = []
        self.sil = []
        self.body = []
        self.n = 0

    def cid(self):
        self.n += 1
        return '%s_c%d' % (self.name, self.n)

    def add(self, s):
        self.body.append(s)

    def silhouette(self, shape, sw=None):
        if sw:   # thin strokes (tentacles, legs) join the silhouette as strokes
            self.sil.append(paint(shape, 'fill="none" stroke-width="%s"' % f(sw + STICKER_SW)))
        else:
            self.sil.append(paint(shape, ''))

    def part(self, shape, fill, dark, shade=True, off=(-4, -5), sw=3.0, sil=True, hl=None,
             shade_t=0.38, inner=None, shade_col=None, opacity=None):
        """Draw one cel-shaded outlined part. Returns its clip id."""
        if sil:
            self.silhouette(shape)
        cid = self.cid()
        self.defs.append('<clipPath id="%s">%s</clipPath>' % (cid, paint(shape, '')))
        if opacity is not None:
            self.add('<g opacity="%s">' % f(opacity))
        if shade:
            self.add(paint(shape, 'fill="%s"' % (shade_col or mix(fill, dark, shade_t))))
            self.add('<g clip-path="url(#%s)"><g transform="translate(%s %s)">%s</g>' % (
                cid, f(off[0]), f(off[1]), paint(shape, 'fill="%s"' % fill)))
        else:
            self.add(paint(shape, 'fill="%s"' % fill))
            self.add('<g clip-path="url(#%s)">' % cid)
        if inner:
            self.add(inner)
        if hl:
            cx, cy, rx, ry = hl[:4]
            rot = hl[4] if len(hl) > 4 else 0
            self.add(paint(E(cx, cy, rx, ry, rot), 'fill="#FFFFFF" opacity=".5"'))
        self.add('</g>')
        if sw:
            self.add(paint(shape, 'fill="none" stroke="%s" stroke-width="%s" stroke-linejoin="round"' % (dark, f(sw))))
        if opacity is not None:
            self.add('</g>')
        return cid

    def flat(self, shape, fill, dark=None, sw=2.4, sil=False, opacity=None):
        if sil:
            self.silhouette(shape)
        a = 'fill="%s"' % fill
        if dark:
            a += ' stroke="%s" stroke-width="%s" stroke-linejoin="round"' % (dark, f(sw))
        if opacity is not None:
            a += ' opacity="%s"' % f(opacity)
        self.add(paint(shape, a))

    def line(self, d, color, sw, sil=False, opacity=None):
        shape = P(d)
        if sil:
            self.silhouette(shape, sw)
        a = 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"' % (color, f(sw))
        if opacity is not None:
            a += ' opacity="%s"' % f(opacity)
        self.add(paint(shape, a))

    def limb(self, d, fill, dark, sw, sil=True, opacity=None):
        """A thick rounded stroke drawn as an outlined limb (tentacle, leg, stalk)."""
        self.line(d, dark, sw + 5.5, sil=sil, opacity=opacity)
        self.line(d, fill, sw, opacity=opacity)

    # ----- face helpers -----
    def eye(self, cx, cy, r, look=(0, 0)):
        x, y = cx + look[0], cy + look[1]
        self.add(paint(E(x, y, r, r * 1.14), 'fill="%s"' % EYE))
        self.add(paint(C(x - r * .32, y - r * .42, r * .44), 'fill="#FFFFFF"'))
        self.add(paint(C(x + r * .38, y + r * .4, r * .18), 'fill="#FFFFFF" opacity=".9"'))

    def eye_white(self, cx, cy, R_, r, dark, look=(0, 0), sw=2.4):
        self.add(paint(C(cx, cy, R_), 'fill="#FFFFFF" stroke="%s" stroke-width="%s"' % (dark, f(sw))))
        self.eye(cx, cy, r, look)

    def happy_eye(self, cx, cy, w, color, sw=3.2):
        self.line('M %s %s Q %s %s %s %s' % (f(cx - w / 2), f(cy), f(cx), f(cy - w * .7), f(cx + w / 2), f(cy)), color, sw)

    def cheek(self, cx, cy, rx=6, ry=None, opacity=.6):
        self.add(paint(E(cx, cy, rx, ry or rx * .62), 'fill="%s" opacity="%s"' % (CHEEK, f(opacity))))

    def smile(self, cx, cy, w, color, sw=2.6, depth=None):
        d = depth if depth is not None else w * .55
        self.line('M %s %s Q %s %s %s %s' % (f(cx - w / 2), f(cy), f(cx), f(cy + d), f(cx + w / 2), f(cy)), color, sw)

    def open_smile(self, cx, cy, w, dark, depth=None, tongue=True):
        d = depth if depth is not None else w * .8
        mouth = P('M %s %s Q %s %s %s %s Z' % (f(cx - w / 2), f(cy), f(cx), f(cy + d * 1.6), f(cx + w / 2), f(cy)))
        cid = self.cid()
        self.defs.append('<clipPath id="%s">%s</clipPath>' % (cid, paint(mouth, '')))
        self.add(paint(mouth, 'fill="#5A2E3C"'))
        if tongue:
            self.add('<g clip-path="url(#%s)">%s</g>' % (cid, paint(E(cx, cy + d * 1.1, w * .36, d * .5), 'fill="#F08AA0"')))
        self.add(paint(mouth, 'fill="none" stroke="%s" stroke-width="2.4" stroke-linejoin="round"' % dark))

    def svg(self, sticker=True):
        out = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
               'width="%d" height="%d" viewBox="0 0 %d %d">' % (self.w, self.h, self.w, self.h)]
        defs = list(self.defs)
        if sticker:
            defs.append('<g id="%s_sil">%s</g>' % (self.name, ''.join(self.sil)))
        out.append('<defs>%s</defs>' % ''.join(defs))
        if sticker:
            ref = '#%s_sil' % self.name
            out.append('<use href="%s" xlink:href="%s" transform="translate(0 3)" fill="%s" stroke="%s" '
                       'stroke-width="%d" stroke-linejoin="round" stroke-linecap="round" opacity=".18"/>' % (
                           ref, ref, SHADOW, SHADOW, STICKER_SW))
            out.append('<use href="%s" xlink:href="%s" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
                       'stroke-linejoin="round" stroke-linecap="round"/>' % (ref, ref, STICKER_SW))
        out.extend(self.body)
        out.append('</svg>')
        return '\n'.join(out) + '\n'


def mirror(d):
    return mirror_d(d)


# =====================================================================================
#                                     SEA FRIENDS
# =====================================================================================
def draw_crab(a, pose='badge', lean=0.0):
    """Round coral crab, front view: wide oval shell, eyes on short stalks, round mitten claws, 3 stubby legs a side.
    pose 'badge' = claws at the sides; 'dance' = claws up; lean rotates the whole body (deg)."""
    b, dk = '#F08A5D', '#A8512F'
    light = '#F7B38F'
    if lean:
        a.add('<g transform="rotate(%s 64 74)">' % f(lean))
    # legs: three stubby rounded legs a side, slanting down
    if pose == 'badge':
        legs = (('M 40 92 Q 30 98 24 110', 1), ('M 50 98 Q 44 106 42 116', 1), ('M 36 86 Q 24 88 14 96', 1))
    else:   # dance: legs kick out
        legs = (('M 40 92 Q 26 96 18 104', 1), ('M 50 98 Q 42 108 44 118', 1), ('M 36 84 Q 22 80 12 86', 1))
    for d, _ in legs:
        a.limb(d, b, dk, 6.5)
        a.limb(mirror(d), b, dk, 6.5)
    # claw arms + mitten claws
    if pose == 'badge':
        arm_l, claw_l = 'M 36 72 Q 24 70 18 62', (16, 54)
    else:
        arm_l, claw_l = 'M 36 68 Q 26 58 22 44', (20, 34)
    for d, (cx, cy) in ((arm_l, claw_l), (mirror(arm_l), (128 - claw_l[0], claw_l[1]))):
        a.limb(d, b, dk, 7.5)
    for (cx, cy) in (claw_l, (128 - claw_l[0], claw_l[1])):
        s = -1 if cx < 64 else 1
        # mitten: thumb bump on the inner-top side, then the round palm, then a short gap line
        a.part(C(cx + s * 7, cy - 9, 6.5), b, dk, shade=False, sw=2.6)
        a.part(C(cx, cy, 13), b, dk, hl=(cx - 5, cy - 6, 4.5, 2.6, -30), off=(-3, -4))
        a.line('M %s %s Q %s %s %s %s' % (f(cx + s * 3), f(cy - 12), f(cx + s * 7), f(cy - 6), f(cx + s * 12), f(cy - 4)), dk, 2.4)
    # eye stalks
    a.limb('M 50 50 L 50 36', b, dk, 6)
    a.limb('M 78 50 L 78 36', b, dk, 6)
    # body shell
    a.part(E(64, 76, 38, 27), b, dk, hl=(44, 60, 11, 5.5, -25),
           inner=paint(E(64, 92, 24, 9), 'fill="%s" opacity=".55"' % light) +
           paint(P('M 40 58 Q 46 54 52 58 M 76 58 Q 82 54 88 58'), 'fill="none" stroke="%s" stroke-width="2" opacity=".35"' % dk))
    # eyes on stalks (white ball, big pupil)
    for x in (50, 78):
        a.eye_white(x, 36, 9.5, 5.6, dk, look=(0, .4))
    a.cheek(40, 76, 6)
    a.cheek(88, 76, 6)
    if pose == 'badge':
        a.open_smile(64, 74, 16, dk, depth=7)
    else:
        a.open_smile(64, 72, 20, dk, depth=9)
    if lean:
        a.add('</g>')


def crab():
    a = Art('crab')
    draw_crab(a, 'badge')
    return a


def crab_dance(which):
    a = Art('crabdance_' + which)
    draw_crab(a, 'dance', lean=-11 if which == 'a' else 11)
    return a


def octopus():
    """Lilac octopus: big round dome head, six curly tentacles with pale suckers, big eyes low on the head."""
    a = Art('octopus')
    b, dk = '#B48AD6', '#6E4F9A'
    pale = '#E8D6F6'
    # tentacles (back ones first)
    tents = ('M 40 84 C 30 96 16 100 10 90 C 6 82 12 76 18 80',
             'M 52 92 C 46 106 34 114 24 108 C 18 104 20 96 28 98',
             'M 64 94 C 64 108 56 118 46 118 C 40 118 38 112 44 110')
    for d in tents:
        a.limb(d, b, dk, 9)
        a.limb(mirror(d), b, dk, 9)
    # suckers on the tentacles
    for (x, y) in ((16, 92), (24, 86), (30, 108), (38, 102), (48, 116), (56, 110)):
        a.flat(C(x, y, 2.2), pale, opacity=.9)
        a.flat(C(128 - x, y, 2.2), pale, opacity=.9)
    # head (tall dome)
    a.part(P('M 24 66 C 20 34 40 14 64 14 C 88 14 108 34 104 66 C 102 84 86 94 64 94 C 42 94 26 84 24 66 Z'),
           b, dk, hl=(42, 32, 11, 6, -30),
           inner=paint(E(64, 90, 30, 9), 'fill="%s" opacity=".5"' % pale) +
           paint(C(48, 30, 2.4), 'fill="%s" opacity=".35"' % dk) + paint(C(80, 26, 2), 'fill="%s" opacity=".35"' % dk) +
           paint(C(66, 22, 1.8), 'fill="%s" opacity=".35"' % dk))
    a.eye(49, 66, 8)
    a.eye(79, 66, 8)
    a.cheek(38, 78, 6.5)
    a.cheek(90, 78, 6.5)
    a.smile(64, 80, 14, dk, sw=2.8)
    return a


def seahorse():
    """Golden seahorse in profile facing left: round head, soft tube snout, crown bumps, plump belly with ridges,
    a tail that curls under, small back fin."""
    a = Art('seahorse')
    b, dk = '#E9B949', '#9C6E1A'
    belly = '#F6DC9A'
    # back fin (behind the body)
    a.part(P('M 84 58 C 98 50 108 60 102 76 C 96 84 86 82 82 76 Z'), mix(b, belly, .55), dk, shade=False, sw=2.6,
           inner=paint(P('M 90 60 L 92 76 M 97 62 L 97 74'), 'fill="none" stroke="%s" stroke-width="1.8" opacity=".5"' % dk))
    # curled tail: thick limb from the belly bottom, curling under and back up
    tail = 'M 62 102 C 56 114 60 126 72 124 C 82 122 82 110 72 110 C 66 110 66 118 72 118'
    a.limb(tail, b, dk, 11)
    # tail ridges
    a.line('M 58 106 L 64 108 M 58 116 L 64 116', dk, 1.8, opacity=.45)
    # neck + body: chest bulges forward, back slopes to the fin
    body = ('M 48 46 C 46 56 54 62 56 68 C 50 72 44 80 46 90 C 48 100 58 106 70 104 C 84 100 90 80 86 62 '
            'C 84 52 76 46 66 44 Z')
    a.part(P(body), b, dk, hl=(58, 72, 6, 10, 15),
           inner=paint(P('M 56 66 C 48 76 50 94 60 104 C 72 106 78 96 76 84 C 74 74 66 68 56 66 Z'), 'fill="%s"' % belly) +
           paint(P('M 52 78 Q 64 76 74 82 M 52 88 Q 64 86 74 92 M 56 98 Q 66 96 72 100'),
                 'fill="none" stroke="%s" stroke-width="2" opacity=".4"' % dk))
    # snout: soft rounded tube pointing left (behind the head)
    a.part(P('M 50 36 C 40 36 26 38 16 42 C 12 44 12 50 16 52 C 26 54 40 54 50 52 Z'), b, dk, hl=(28, 42, 6, 2, -5),
           off=(-3, -4))
    # head
    a.part(C(58, 38, 22), b, dk, hl=(48, 26, 8, 4.5, -30))
    # crown bumps
    for (x, y, r) in ((48, 16, 5), (58, 12, 5.5), (68, 15, 4.5)):
        a.part(C(x, y, r), b, dk, shade=False, sw=2.4)
    a.eye(52, 40, 8, look=(-1, 0))
    a.cheek(42, 52, 5)
    a.smile(24, 46, 7, dk, sw=2.2, depth=3)
    return a


def clownfish():
    """Muted-orange clownfish facing left: chubby oval body, three white bands with dark edges, rounded fins."""
    a = Art('clownfish')
    b, dk = '#F2925A', '#A4502A'
    w, wdk = '#FFFFFF', '#6B4B40'
    fin = '#F6B088'
    # tail + fins behind the body
    a.part(P('M 100 64 C 108 48 120 40 124 48 C 122 56 118 60 118 64 C 118 68 122 72 124 80 C 120 88 108 80 100 64 Z'),
           fin, dk, shade=False, sw=2.6)
    a.part(P('M 54 36 C 60 24 80 22 92 36 C 86 38 68 40 54 36 Z'), fin, dk, shade=False, sw=2.6)   # dorsal
    a.part(P('M 58 92 C 62 100 76 102 88 94 C 80 92 68 92 58 92 Z'), fin, dk, shade=False, sw=2.6)   # ventral
    body = E(66, 64, 44, 30)
    bands = (paint(P('M 44 38 C 56 46 56 82 44 90 C 36 82 36 46 44 38 Z'), 'fill="%s" stroke="%s" stroke-width="2.2"' % (w, wdk)) +
             paint(P('M 76 36 C 86 46 86 82 76 92 C 68 82 68 46 76 36 Z'), 'fill="%s" stroke="%s" stroke-width="2.2"' % (w, wdk)) +
             paint(P('M 100 48 C 108 56 108 72 100 80 C 96 72 96 56 100 48 Z'), 'fill="%s" stroke="%s" stroke-width="2.2"' % (w, wdk)))
    a.part(body, b, dk, hl=(40, 48, 8, 4, -25), inner=bands)
    # pectoral fin
    a.part(E(62, 70, 9, 6, 20), fin, dk, shade=False, sw=2.4, sil=False)
    a.eye(36, 60, 7.8, look=(-1, 0))
    a.cheek(44, 72, 5)
    a.smile(26, 70, 8, dk, sw=2.4, depth=3.5)
    return a


def dolphin():
    """Blue-grey dolphin leaping in an arc, facing left: slim banana body, short rounded bottle-nose beak,
    curved dorsal fin, narrow tail stalk and a wide fluke, pale belly."""
    a = Art('dolphin')
    b, dk = '#7FA8C9', '#3E5E80'
    belly = '#D9E8F3'
    # fluke (behind)
    a.part(P('M 108 90 C 104 82 110 76 118 76 C 120 82 118 88 116 92 C 122 92 126 98 124 106 C 116 104 110 100 108 90 Z'),
           b, dk, shade=False, sw=2.6)
    # body: head at the left, back arching over to the top-right, tail stalk sweeping down to the fluke
    body = ('M 10 62 C 8 48 22 34 44 30 C 70 26 94 34 104 50 C 110 60 108 72 104 80 C 110 84 112 90 112 96 '
            'C 104 96 98 92 94 86 C 82 92 66 92 54 86 C 36 80 20 76 10 62 Z')
    a.part(P(body), b, dk, hl=(44, 40, 12, 5, -15),
           inner=paint(P('M 8 66 C 20 80 40 86 60 86 C 76 86 90 82 100 74 L 104 100 L 4 100 Z'), 'fill="%s"' % belly))
    # beak: short, round, slightly below the eye line
    a.part(P('M 14 58 C 8 60 4 66 8 72 C 12 76 22 78 30 74 C 28 66 22 60 14 58 Z'), b, dk, shade=False, sw=2.8,
           hl=(12, 64, 3, 1.6, -20))
    # dorsal fin (curved back)
    a.part(P('M 62 30 C 66 18 78 12 86 16 C 80 22 78 28 80 34 Z'), b, dk, shade=False, sw=2.6)
    # flipper
    a.part(P('M 46 72 C 52 82 60 88 70 86 C 64 78 58 74 46 72 Z'), mix(b, dk, .15), dk, shade=False, sw=2.4, sil=False)
    a.eye(36, 54, 7.4, look=(-.8, 0))
    a.line('M 16 70 Q 26 78 40 72', dk, 2.6)
    a.cheek(44, 64, 5)
    return a


def jellyfish():
    """Pink translucent jellyfish: dome bell with a scalloped skirt, six wavy tentacles, face on the bell."""
    a = Art('jellyfish')
    b, dk = '#F4A6C4', '#B45C86'
    pale = '#FCE0EC'
    # tentacles (translucent, wavy)
    tents = ('M 34 76 C 28 86 36 94 30 104 C 26 110 30 116 28 120',
             'M 48 82 C 44 92 52 100 46 110 C 42 116 48 120 46 124',
             'M 64 84 C 68 94 60 102 66 112 C 70 118 64 122 66 124')
    for d in tents:
        a.limb(d, b, dk, 5, opacity=.8)
    for d in tents[:2]:
        a.limb(mirror(d), b, dk, 5, opacity=.8)
    # bell: dome + scalloped bottom
    bell = ('M 16 64 C 14 30 36 10 64 10 C 92 10 114 30 112 64 '
            'Q 106 72 100 64 Q 94 72 88 64 Q 82 72 76 64 Q 70 72 64 64 Q 58 72 52 64 Q 46 72 40 64 Q 34 72 28 64 Q 22 72 16 64 Z')
    a.part(P(bell), b, dk, hl=(40, 28, 12, 6.5, -30), opacity=.92,
           inner=paint(P('M 24 60 C 26 38 42 22 64 22 C 86 22 102 38 104 60 Z'), 'fill="%s" opacity=".45"' % pale) +
           paint(P('M 30 60 Q 64 52 98 60'), 'fill="none" stroke="%s" stroke-width="2" opacity=".35"' % dk))
    a.eye(50, 44, 7.6)
    a.eye(78, 44, 7.6)
    a.cheek(38, 54, 6)
    a.cheek(90, 54, 6)
    a.smile(64, 54, 12, dk, sw=2.6)
    return a


def starfish():
    """Pink-peach starfish: five chunky rounded arms, pale dots, happy face in the middle."""
    a = Art('starfish')
    b, dk = '#F7B29A', '#C9704F'
    dot = '#FBD7C6'
    d = star_rounded(64, 68, 56, 27)
    dots = ''
    for k in range(5):
        ang = math.radians(-90 + 72 * k)
        for t in (.45, .68, .88):
            x, y = 64 + 56 * t * math.cos(ang), 68 + 56 * t * math.sin(ang)
            dots += paint(C(x, y, 2.6 - t * 1.2), 'fill="%s" opacity=".9"' % dot)
    a.part(P(d), b, dk, hl=(48, 40, 7, 4, -30), inner=dots, off=(-3, -4))
    a.eye(54, 64, 7)
    a.eye(74, 64, 7)
    a.cheek(44, 74, 5.5)
    a.cheek(84, 74, 5.5)
    a.open_smile(64, 76, 14, dk, depth=6)
    return a


def star_rounded(cx, cy, ro, ri, n=5):
    """Five-arm star whose tips and valleys are both rounded (quadratic through control points)."""
    pts = []
    for k in range(2 * n):
        r = ro if k % 2 == 0 else ri
        ang = math.radians(-90 + 180.0 * k / n)
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    # midpoints between consecutive vertices are the on-curve points; vertices are controls
    mids = [((pts[k][0] + pts[(k + 1) % (2 * n)][0]) / 2, (pts[k][1] + pts[(k + 1) % (2 * n)][1]) / 2) for k in range(2 * n)]
    d = 'M %s %s' % (f(mids[-1][0]), f(mids[-1][1]))
    for k in range(2 * n):
        # pull the control a little toward the midpoint so arms stay fat (tips) and valleys open
        cxk, cyk = pts[k]
        t = 1.12 if k % 2 == 0 else 0.92
        cxk, cyk = cx + (cxk - cx) * t, cy + (cyk - cy) * t
        d += ' Q %s %s %s %s' % (f(cxk), f(cyk), f(mids[k][0]), f(mids[k][1]))
    return d + ' Z'


def whale():
    """Blue-grey whale facing left: huge rounded body, flat broad head, belly grooves, fluke up at the right, spout."""
    a = Art('whale')
    b, dk = '#8EA6BE', '#465F78'
    belly = '#DCE6EE'
    # spout
    spout = 'M 44 40 L 44 24 C 40 18 32 17 28 22 M 44 24 C 48 18 56 17 60 22'
    a.limb(spout, '#C9E6F6', '#6A9CC2', 3.4)
    for (x, y) in ((26, 14), (62, 14)):
        a.part(C(x, y, 4.2), '#C9E6F6', '#6A9CC2', shade=False, sw=2)
    # fluke behind the body
    a.part(P('M 98 68 C 98 56 104 46 112 42 C 116 48 116 56 112 62 C 118 58 124 58 126 64 C 124 74 114 82 104 84 Z'),
           mix(b, dk, .1), dk, shade=False)
    # body: big and chunky
    body = ('M 8 74 C 6 52 26 40 54 40 C 82 40 100 52 104 70 C 106 82 100 96 86 102 C 66 110 36 108 20 100 '
            'C 10 94 8 86 8 74 Z')
    a.part(P(body), b, dk, hl=(30, 52, 12, 5.5, -20),
           inner=paint(P('M 8 80 C 20 94 50 100 86 92 C 94 90 100 86 104 80 L 104 112 L 4 112 Z'), 'fill="%s"' % belly) +
           paint(P('M 14 88 Q 40 100 72 96 M 20 94 Q 44 104 70 100'),
                 'fill="none" stroke="%s" stroke-width="1.8" opacity=".35"' % '#8BA0B4'))
    # flipper
    a.part(E(60, 94, 12, 6, 24), mix(b, dk, .15), dk, shade=False, sw=2.4, sil=False)
    a.eye(34, 66, 7.4, look=(-.6, 0))
    a.line('M 16 80 Q 30 90 48 82', dk, 2.8)
    a.cheek(44, 76, 6)
    return a


def puffer():
    """Yellow-green pufferfish: round ball body with soft bumps, tiny fins, pale belly, puckered lips, huge eyes."""
    a = Art('puffer')
    b, dk = '#CFD36A', '#7F8630'
    belly = '#EEF0B8'
    fin = '#E3E59A'
    # tail + fins behind
    a.part(P('M 106 56 C 116 48 124 52 122 64 C 124 76 116 80 106 72 Z'), fin, dk, shade=False, sw=2.6)
    a.part(P('M 56 24 C 60 12 72 10 78 18 C 72 20 64 22 56 24 Z'), fin, dk, shade=False, sw=2.6)
    a.part(P('M 60 106 C 64 116 76 118 82 110 C 76 110 68 108 60 106 Z'), fin, dk, shade=False, sw=2.6)
    # bumpy ball body
    body = bumpy(62, 66, 44, 42, 14, 3.0, start=0.2)
    a.part(P(body), b, dk, hl=(40, 40, 11, 6, -30),
           inner=paint(E(60, 92, 34, 16), 'fill="%s"' % belly) +
           ''.join(paint(C(x, y, 2.2), 'fill="%s" opacity=".3"' % dk) for (x, y) in
                   ((44, 32), (62, 28), (80, 36), (88, 54), (30, 54), (86, 72), (34, 76))))
    # side fin
    a.part(E(78, 76, 10, 6, -20), fin, dk, shade=False, sw=2.4, sil=False)
    a.eye_white(40, 56, 13, 7.6, dk, look=(-.8, .4))
    a.eye_white(74, 54, 13, 7.6, dk, look=(-.8, .4))
    a.cheek(30, 74, 5.5)
    a.cheek(70, 72, 5.5)
    # puckered lips: two stacked rounded lips
    lipc, lipd = '#E89AA8', '#A85A6E'
    a.flat(E(22, 76, 7, 4.2), lipc, lipd, sw=2)
    a.flat(E(22, 82, 7, 4.2), lipc, lipd, sw=2)
    a.flat(E(19.5, 75, 2, 1), '#FFFFFF', opacity=.7)
    return a


# =====================================================================================
#                                 PHOTOBOMB FISH (256 x 128)
# =====================================================================================
def fish_photobomb(which):
    """Silly wide-eyed fish facing RIGHT: fat oval body, forked tail at the left, two huge overlapping eyes,
    enormous pouty lips on the snout. a = lips closed, b = round open 'O' mouth. Same body in both frames.
    Mouth centre (for a bubble / sound anchor): (218, 84) in the 256x128 viewBox."""
    a = Art('fishbomb_' + which, 256, 128)
    b, dk = '#E884AE', '#9E3F6B'
    belly = '#F8C9DC'
    fin = '#F3A8C8'
    lipc, lipd = '#D64E82', '#8B2A54'
    # tail (forked, rounded lobes)
    a.part(P('M 58 68 C 42 48 20 40 8 46 C 18 56 20 64 20 68 C 20 72 18 80 8 90 C 20 96 42 88 58 68 Z'),
           fin, dk, shade=False, sw=2.8, inner=paint(P('M 22 54 L 40 64 M 22 82 L 40 72'),
                                                     'fill="none" stroke="%s" stroke-width="2" opacity=".4"' % dk))
    # dorsal + ventral fins (stick out above / below the body)
    a.part(P('M 84 34 C 94 8 134 2 158 20 C 134 20 108 26 84 34 Z'), fin, dk, shade=False, sw=2.8,
           inner=paint(P('M 104 22 L 100 32 M 122 14 L 120 26 M 140 12 L 140 22'),
                       'fill="none" stroke="%s" stroke-width="2" opacity=".4"' % dk))
    a.part(P('M 96 104 C 104 122 128 126 144 112 C 128 110 110 108 96 104 Z'), fin, dk, shade=False, sw=2.8)
    # body
    body = P('M 48 68 C 48 42 80 24 130 24 C 170 24 200 42 212 68 C 200 94 170 112 130 112 C 80 112 48 94 48 68 Z')
    a.part(body, b, dk, hl=(100, 40, 18, 7, -12),
           inner=paint(P('M 60 88 C 90 108 170 108 206 80 L 220 124 L 40 124 Z'), 'fill="%s"' % belly) +
           ''.join(paint(P('M %s %s q 6 -6 12 0' % (f(x), f(y))), 'fill="none" stroke="%s" stroke-width="2" opacity=".35"' % dk)
                   for (x, y) in ((104, 64), (120, 58), (136, 64), (112, 76), (128, 74))))
    # pectoral fin
    a.part(P('M 138 76 C 126 84 122 98 132 104 C 142 100 148 88 148 80 Z'), fin, dk, shade=False, sw=2.6, sil=False)
    # gill line
    a.line('M 160 46 Q 154 68 162 90', dk, 2.4, opacity=.45)
    # huge overlapping googly eyes (the near eye in front, slightly lower and bigger)
    a.eye_white(172, 50, 22, 11, dk, look=(3, 1), sw=3)
    a.eye_white(196, 58, 25, 13, dk, look=(3, 1.5), sw=3)
    a.cheek(182, 86, 8, opacity=.55)
    # lips on the snout (overlapping the body edge so they stick out a little)
    if which == 'a':
        a.part(E(218, 78, 16, 8), lipc, lipd, shade=False, sw=2.6, hl=(211, 75, 4.5, 2.2, -20))
        a.part(E(218, 90, 16, 8), lipc, lipd, shade=False, sw=2.6)
        a.line('M 204 84 Q 218 88 232 84', lipd, 2)
    else:
        a.part(C(218, 84, 17), lipc, lipd, shade=False, sw=2.6, hl=(210, 75, 4.5, 2.4, -30))
        a.flat(C(218, 84, 8.5), '#5A2E3C', lipd, sw=2)
        a.flat(E(215, 81, 2.6, 1.7), '#FFFFFF', opacity=.5)
    return a


ANIMALS = {
    'animal_crab': crab, 'animal_octopus': octopus, 'animal_seahorse': seahorse, 'animal_clownfish': clownfish,
    'animal_dolphin': dolphin, 'animal_jellyfish': jellyfish, 'animal_starfish': starfish, 'animal_whale': whale,
    'animal_puffer': puffer,
}
CHARACTERS = {
    'fish_photobomb_a': lambda: fish_photobomb('a'), 'fish_photobomb_b': lambda: fish_photobomb('b'),
    'crab_dance_a': lambda: crab_dance('a'), 'crab_dance_b': lambda: crab_dance('b'),
}


def main():
    os.makedirs(ITEMS, exist_ok=True)
    os.makedirs(CHARS, exist_ok=True)
    for name, fn in ANIMALS.items():
        with open(os.path.join(ITEMS, name + '.svg'), 'w') as fh:
            fh.write(fn().svg(sticker=True))
    for name, fn in CHARACTERS.items():
        with open(os.path.join(CHARS, name + '.svg'), 'w') as fh:
            fh.write(fn().svg(sticker=False))
    print('wrote %d animals to %s and %d characters to %s' % (len(ANIMALS), ITEMS, len(CHARACTERS), CHARS))


if __name__ == '__main__':
    main()
