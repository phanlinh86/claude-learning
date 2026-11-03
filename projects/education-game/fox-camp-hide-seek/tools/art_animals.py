#!/usr/bin/env python3
"""Bim's Rainbow Rocket - animal-friend stickers (character artist B).

Writes game/assets/default/items/animal_<name>.svg and animal_<name>_wave.svg for
name in cat, dog, cow, pig, sheep, duck, lion, frog  (16 files).

Every sticker: viewBox 0 0 128 128 (width/height = viewBox), a baby animal sitting, full body, facing
right (3/4 view), ~110 px tall, sitting on the line y = GROUND.  100 % original art built from simple
primitives:
  * each body part = outline (a stroke drawn UNDER the fill, so a group of shapes gets one merged outer
    outline) in a darker tone of the fill + shade fill + the base fill shifted up-left and clipped to the
    part (= one-step cel shade, a crescent lower-right) + one soft highlight upper-left;
  * a white sticker border (~6 px outside the outline) and a faint drop shadow (opacity .18, +3 y),
    both made from <use> of one merged silhouette group;
  * big eyes with a white catch-light, rosy cheeks.
The *_wave variant is the same body with the near front paw (duck: wing) raised and waving.
No <text>, fonts, scripts, filters or external refs.

Usage: python3 tools/art_animals.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'default', 'items')

GROUND = 117          # y where paws/feet rest (sticker border reaches ~124, shadow ~127)
OUTLINE = 2.2         # visible outline width (px at 128)
STICKER = 7           # sticker reach beyond the shapes' geometry (~6 px beyond the outline)
EYE = '#2F2A3A'
CHEEK = '#F590A8'
SHADOW = '#26304F'


def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def hexrgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def mix(a, b, t):
    ca, cb = hexrgb(a), hexrgb(b)
    return '#%02X%02X%02X' % tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))


# ---------- shapes: strings with an {A} slot for paint attributes ----------
def E(cx, cy, rx, ry, rot=0):
    tr = ' transform="rotate(%s %s %s)"' % (f(rot), f(cx), f(cy)) if rot else ''
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s"%s {A}/>' % (f(cx), f(cy), f(rx), f(ry), tr)


def C(cx, cy, r):
    return '<circle cx="%s" cy="%s" r="%s" {A}/>' % (f(cx), f(cy), f(r))


def P(d):
    return '<path d="%s" {A}/>' % ' '.join(d.split())


def CAP(x1, y1, x2, y2, w):
    """Capsule (rounded limb) from (x1,y1) to (x2,y2) of width w."""
    import math
    L = math.hypot(x2 - x1, y2 - y1)
    a = math.degrees(math.atan2(y2 - y1, x2 - x1))
    return ('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" transform="rotate(%s %s %s)" {A}/>'
            % (f(x1 - w / 2), f(y1 - w / 2), f(L + w), f(w), f(w / 2), f(a), f(x1), f(y1)))


def paint(shape, attrs=''):
    return shape.replace(' {A}', (' ' + attrs) if attrs else '')


class Part:
    """A filled body part (one or more shapes merged), or a stroked part (tail/whisker-like)."""

    def __init__(self, shapes, base, line, shade=None, details=(), hl=None, over=(), sticker=True,
                 stroke=None, cel=True):
        self.shapes = shapes if isinstance(shapes, (list, tuple)) else [shapes]
        self.base, self.line = base, line
        self.shade = shade or mix(base, line, 0.32)
        self.details = list(details)   # svg drawn clipped to the part (stripes, spots, patches)
        self.hl = hl                   # (cx, cy, rx, ry[, rot]) soft highlight, clipped
        self.over = list(over)         # svg drawn after the part, unclipped (eyes, mouth ...)
        self.sticker = sticker
        self.stroke = stroke           # width -> the shapes are open paths drawn as strokes
        self.cel = cel


def render_part(p, uid):
    out = []
    if p.stroke:
        w = p.stroke
        for s in p.shapes:
            out.append(paint(s, 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" '
                                'stroke-linejoin="round"' % (p.line, f(w + 2 * OUTLINE))))
        for s in p.shapes:
            out.append(paint(s, 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" '
                                'stroke-linejoin="round"' % (p.base, f(w))))
        out.extend(p.over)
        return '\n'.join(out)
    cid = 'c%d' % uid
    out.append('<clipPath id="%s">%s</clipPath>' % (cid, ''.join(paint(s) for s in p.shapes)))
    out.append('<g fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round">%s</g>'
               % (p.line, p.line, f(2 * OUTLINE), ''.join(paint(s) for s in p.shapes)))
    if p.cel:
        out.append('<g fill="%s">%s</g>' % (p.shade, ''.join(paint(s) for s in p.shapes)))
    inner = []
    inner.append('<g fill="%s"%s>%s</g>' % (p.base, ' transform="translate(-2.6 -3)"' if p.cel else '',
                                           ''.join(paint(s) for s in p.shapes)))
    inner.extend(p.details)
    if p.hl:
        cx, cy, rx, ry = p.hl[:4]
        rot = p.hl[4] if len(p.hl) > 4 else -25
        inner.append(paint(E(cx, cy, rx, ry, rot), 'fill="#FFFFFF" opacity=".26"'))
    out.append('<g clip-path="url(#%s)">%s</g>' % (cid, ''.join(inner)))
    out.extend(p.over)
    return '\n'.join(out)


def silhouette(parts):
    s = []
    for p in parts:
        if not p.sticker:
            continue
        for sh in p.shapes:
            if p.stroke:
                s.append(paint(sh, 'fill="none" stroke-width="%s" stroke-linecap="round"'
                                   % f(p.stroke + 2 * STICKER)))
            else:
                s.append(paint(sh))
    return ''.join(s)


def build(parts):
    sil = silhouette(parts)
    body = '\n'.join(render_part(p, i) for i, p in enumerate(parts))
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="128" height="128" viewBox="0 0 128 128">\n'
            '<defs><g id="sil">%s</g></defs>\n'
            '<use href="#sil" xlink:href="#sil" transform="translate(0 3)" fill="%s" stroke="%s" '
            'stroke-width="%d" stroke-linejoin="round" opacity=".18"/>\n'
            '<use href="#sil" xlink:href="#sil" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="%d" '
            'stroke-linejoin="round"/>\n%s\n</svg>\n' % (sil, SHADOW, SHADOW, 2 * STICKER, 2 * STICKER, body))


# ---------- shared face bits ----------
def eye(cx, cy, s=1.0):
    return (paint(E(cx, cy, 5.4 * s, 6.6 * s), 'fill="%s"' % EYE) +
            paint(C(cx - 1.7 * s, cy - 2.4 * s, 2.2 * s), 'fill="#FFFFFF"') +
            paint(C(cx + 1.9 * s, cy + 2.4 * s, 1 * s), 'fill="#FFFFFF"'))


def eyes(x1, x2, y, s=1.0):
    return [eye(x1, y, s), eye(x2, y, s * 1.04)]


def cheeks(x1, x2, y, col=CHEEK, r=5.2):
    return [paint(E(x1, y, r, r * .62), 'fill="%s" opacity=".75"' % col),
            paint(E(x2, y, r * .85, r * .58), 'fill="%s" opacity=".75"' % col)]


def mouth_w(cx, cy, col, w=4.2):
    """Kitten/lion style 'w' mouth under the nose."""
    return paint(P('M%s %s Q%s %s %s %s Q%s %s %s %s' % (
        f(cx - w), f(cy), f(cx - w / 2), f(cy + 3.6), f(cx), f(cy), f(cx + w / 2), f(cy + 3.6), f(cx + w), f(cy))),
        'fill="none" stroke="%s" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' % col)


def smile(x1, y1, x2, y2, depth, col, w=1.8):
    mx = (x1 + x2) / 2
    return paint(P('M%s %s Q%s %s %s %s' % (f(x1), f(y1), f(mx), f((y1 + y2) / 2 + depth), f(x2), f(y2))),
                 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"' % (col, f(w)))


def line(x1, y1, x2, y2, col, w=1.5, op=1):
    return paint(P('M%s %s L%s %s' % (f(x1), f(y1), f(x2), f(y2))),
                 'fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"%s'
                 % (col, f(w), (' opacity="%s"' % f(op)) if op != 1 else ''))


def toes(x, y, col, n=2, gap=4.2):
    return [line(x + (i - (n - 1) / 2) * gap, y - 4, x + (i - (n - 1) / 2) * gap, y - 0.5, col, 1.4)
            for i in range(n)]


# ---------- standard quadruped skeleton (sitting, facing right) ----------
HEAD = (70, 46)


def legs(base, line_c, wave, paw_pad=None, far=None, foot=None, paw_at=(105.5, 61), shoulder=(84, 88)):
    """Hind foot + far front leg + near front leg (or raised waving arm). Returns (before_head, after_head)."""
    far = far or mix(base, line_c, 0.18)
    foot = foot or base
    hind_foot = Part(E(47, GROUND - 5, 13, 6.2), foot, line_c, hl=(43, GROUND - 8, 6, 2.4, 0),
                     over=toes(56, GROUND - 0.5, line_c))
    far_leg = Part(CAP(71, 86, 72, GROUND - 6, 12.5), far, line_c)
    before, after = [hind_foot, far_leg], []
    if not wave:
        near = Part(CAP(85, 84, 86, GROUND - 6.5, 14), foot, line_c,
                    over=toes(87, GROUND - 0.5, line_c, 3, 3.6))
        before.append(near)
    else:
        px, py = paw_at
        arm = Part(CAP(shoulder[0], shoulder[1], px - 1.5, py + 5, 13.5), base, line_c)
        pc = paw_pad or '#F6A9B9'
        pad = [paint(E(px, py + 2.5, 3.6, 3.1), 'fill="%s"' % pc)] + [
            paint(C(px + dx, py + dy, 1.6), 'fill="%s"' % pc) for dx, dy in ((-4.5, -2.8), (0.1, -4.4), (4.5, -2.4))]
        paw = Part(C(px, py, 8.6), foot, line_c, hl=(px - 3, py - 3.5, 3, 2), over=pad)
        # motion arcs are left to the renderer (keeps the sticker silhouette clean)
        after += [arm, paw]
    return before, after


# =====================================================================================
def cat(wave):
    B, L = '#E0954F', '#98572A'
    S = mix(B, L, 0.55)          # tabby stripe tone
    CREAM = '#FCE6C8'
    tail = Part(P('M40 106 C20 108 12 92 16 76 C18 68 24 62 28 58'), B, L, stroke=8.5,
                over=[line(16.8, 84, 23, 85, S, 2.4), line(18.5, 72, 24.5, 75, S, 2.4)])
    tail_tip = Part(C(28.5, 57.5, 5.4), S, L)
    body = Part(E(58, 92, 29, 25), B, L, hl=(48, 78, 10, 6),
                details=[paint(P('M34 82 Q41 86 40 94'), 'fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"' % S),
                         paint(P('M38 72 Q46 77 45 85'), 'fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"' % S),
                         paint(P('M45 66 Q52 70 52 77'), 'fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"' % S),
                         paint(E(76, 94, 11, 17), 'fill="%s"' % CREAM)])
    haunch = Part(E(46, 100, 17, 15, -15), B, L, hl=(42, 92, 7, 4),
                  details=[paint(P('M36 95 Q44 92 50 97'), 'fill="none" stroke="%s" stroke-width="2.8" stroke-linecap="round"' % S)])
    before, after = legs(B, L, wave, foot=mix(B, CREAM, .25))
    ear_l = Part(P('M45 34 L47.5 11 Q49 8 51.5 10 L66 21 Z'), B, L, over=[paint(P('M50 27 L50.8 15.5 L60 22 Z'), 'fill="#F6B2C0"')])
    ear_r = Part(P('M79 20 L96.5 11 Q99.5 9 100 12.5 L98 34 Z'), B, L, over=[paint(P('M84 21 L96 15.5 L95 28 Z'), 'fill="#F6B2C0"')])
    face = []
    face += eyes(62, 85, 46)
    face += cheeks(53, 96, 58)
    face += [paint(P('M78.5 54 L84.5 54 Q82.2 58.4 81.5 58.4 Q80.8 58.4 78.5 54 Z'), 'fill="#E8788F" stroke="%s" stroke-width=".8"' % mix('#E8788F', L, .4)),
             mouth_w(81.5, 59.2, L, 4)]
    wh = mix(L, '#FFFFFF', 0.15)
    face += [line(92, 57, 106, 54, wh, 1.2, .8), line(92, 60, 106, 61, wh, 1.2, .8),
             line(68, 57, 56.5, 54.5, wh, 1.2, .55)]
    head = Part(E(HEAD[0], HEAD[1], 31, 27), B, L, hl=(57, 30, 11, 6),
                details=[paint(E(81.5, 60, 13, 9.5), 'fill="%s"' % CREAM),
                         paint(P('M66 19 Q67 26 66.5 31'), 'fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"' % S),
                         paint(P('M74 19 Q74.5 26 74 32'), 'fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"' % S),
                         paint(P('M82 21 Q81 27 80.5 32'), 'fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"' % S),
                         paint(P('M39 44 Q45 45 48 49'), 'fill="none" stroke="%s" stroke-width="2.8" stroke-linecap="round"' % S)],
                over=face)
    return [tail, tail_tip, body, haunch] + before + [ear_l, ear_r, head] + after


def dog(wave):
    B, L = '#C99A6B', '#86603C'
    EAR = '#8E6440'
    CREAM = '#F6E3C7'
    tail = Part(P('M36 100 C26 96 21 84 24 72'), B, L, stroke=9)
    body = Part(E(58, 92, 29, 25), B, L, hl=(48, 78, 10, 6), details=[paint(E(77, 95, 11, 17), 'fill="%s"' % CREAM)])
    haunch = Part(E(46, 100, 17, 15, -15), B, L, hl=(42, 92, 7, 4))
    before, after = legs(B, L, wave, paw_pad='#8B5E3C', foot=CREAM, paw_at=(106, 72), shoulder=(80, 100))
    face = eyes(63, 85, 44)
    face += cheeks(54, 97, 58)
    face += [paint(E(92, 51.5, 6.4, 4.8), 'fill="#4A3328"'), paint(E(90.4, 50, 2.2, 1.3), 'fill="#FFFFFF" opacity=".7"'),
             smile(81, 58, 95, 59, 5.5, '#5A3E2C', 1.8),
             paint(P('M86 61.5 Q88.5 69 92 61.5 Z'), 'fill="#F07C8E" stroke="#B9505F" stroke-width="1"')]
    head = Part(E(HEAD[0], HEAD[1] + 1, 30, 27), B, L, hl=(57, 30, 11, 6),
                details=[paint(C(63, 44, 10.5), 'fill="%s"' % mix(B, EAR, .55))],
                over=face)
    snout = Part(E(91, 56, 13, 10, -8), CREAM, L)
    snout.over = face[-4:]
    head.over = face[:-4]
    # floppy ears hang down both sides of the head (drawn over the head)
    ear_l = Part(P('M50 24 C40 22 33 34 35 50 C36 60 41 66 46 63 C51 58 52 44 56 30 Z'), EAR, mix(EAR, '#3A2414', .35),
                 hl=(41, 36, 3, 8, 15))
    ear_r = Part(P('M84 21 C96 16 107 26 108 42 C109 52 105 58 100 56 C95 52 94 42 88 32 Z'), EAR, mix(EAR, '#3A2414', .35))
    return [tail, body, haunch] + before + [ear_r, head, snout, ear_l] + after


def cow(wave):
    B, L = '#FBFAF7', '#6D6878'
    SPOT = '#3B3743'
    PINK, PINKL = '#F7B3C0', '#C9707F'
    tail = Part(P('M36 104 C24 106 18 96 20 84'), B, L, stroke=5,
                over=[])
    tuft = Part(P('M20 86 C14 82 14 74 19 71 C22 74 25 79 23 86 Z'), SPOT, mix(SPOT, '#000000', .2), cel=False)
    body = Part(E(58, 92, 29, 25), B, L, hl=(48, 78, 10, 6),
                details=[paint(P('M36 74 C42 66 54 70 52 80 C50 88 38 90 34 84 Z'), 'fill="%s"' % SPOT),
                         paint(E(70, 108, 10, 7, 15), 'fill="%s"' % SPOT)])
    haunch = Part(E(46, 100, 17, 15, -15), B, L, hl=(42, 92, 7, 4),
                  details=[paint(E(38, 106, 9, 7, 20), 'fill="%s"' % SPOT)])
    before, after = legs(B, L, wave, paw_pad='#5A5560', paw_at=(106, 74), shoulder=(80, 100))
    # dark hooves
    hoof = '#5A5560'
    if not wave:
        before[2].details.append(paint(E(86, GROUND - 3, 9, 5), 'fill="%s"' % hoof))
        before[2].over = []
    before[1].details.append(paint(E(72, GROUND - 3, 8, 5), 'fill="%s"' % hoof))
    before[0].details.append(paint(E(55, GROUND - 5, 6, 7), 'fill="%s"' % hoof))
    before[0].over = []
    if wave:
        after[1].over = [paint(C(106, 74, 6.4), 'fill="%s"' % hoof)]
        after[1].details = []
    horn_l = Part(P('M55 24 C53 16 54 11 58 9 C61 13 62 19 61 24 Z'), '#F4E2B4', '#A88B4E', cel=False)
    horn_r = Part(P('M80 23 C81 15 84 11 88 10 C89 15 88 20 86 25 Z'), '#F4E2B4', '#A88B4E', cel=False)
    ear_l = Part(E(37, 38, 11, 6, -20), B, L, over=[paint(E(37.5, 38.5, 6, 2.8, -20), 'fill="#F6B8C6"')])
    ear_r = Part(E(102, 34, 10, 5.6, 25), B, L, details=[paint(E(104, 32, 10, 8), 'fill="%s"' % SPOT)])
    face = eyes(61, 83, 41)
    face += [paint(E(52, 51, 4.6, 2.8), 'fill="%s" opacity=".75"' % CHEEK)]
    head = Part(E(HEAD[0], HEAD[1], 30, 26), B, L, hl=(57, 30, 11, 6),
                details=[paint(P('M48 22 C56 18 64 26 64 36 C64 46 54 52 46 48 C40 42 41 28 48 22 Z'), 'fill="%s"' % SPOT)],
                over=face)
    muzzle = Part(E(83, 59, 19, 12.5, -6), PINK, PINKL, hl=(76, 53, 6, 2.6, -6),
                  over=[paint(E(78, 58, 2.4, 3.3, -15), 'fill="%s"' % PINKL),
                        paint(E(92, 56.5, 2.4, 3.3, 15), 'fill="%s"' % PINKL),
                        smile(80, 65, 92, 64.5, 3.2, PINKL, 1.6)])
    return [tail, tuft, body, haunch] + before + [horn_l, horn_r, ear_l, ear_r, head, muzzle] + after


def pig(wave):
    B, L = '#F7B3B8', '#C46A78'
    SN = '#F28E9C'
    tail = Part(P('M34 100 C24 102 22 92 28 90 C33 89 33 96 28 97 C21 98 18 92 19 86'), B, L, stroke=4.4)
    body = Part(E(58, 92, 30, 25), B, L, hl=(48, 78, 10, 6))
    haunch = Part(E(46, 100, 17, 15, -15), B, L, hl=(42, 92, 7, 4))
    before, after = legs(B, L, wave, paw_pad='#D9788A', paw_at=(106, 72), shoulder=(80, 100))
    before[0].over = [line(56, GROUND - 9, 56, GROUND - 1, L, 1.5)]
    if not wave:
        before[2].over = [line(86, GROUND - 7, 86, GROUND - 1, L, 1.5)]
    else:
        after[1].over = [line(106, 65.5, 106, 72, L, 1.5)]
    # floppy ears: rise from the head top then fold forward, tips pointing down-right
    ear_l = Part(P('M44 30 C42 20 46 12 52 12 C60 12 66 18 66 30 C62 28 57 30 54 34 Z'), B, L, hl=(50, 17, 4, 2))
    ear_r = Part(P('M76 21 C80 11 90 8 98 10 C104 12 106 22 104 34 C100 30 94 29 90 31 Z'), B, L, hl=(88, 14, 4, 2))
    face = eyes(60, 81, 42)
    face += cheeks(50, 79, 57, '#EE7F96', 5.6)
    face += [smile(66, 62, 76, 61, 4, mix(L, '#7A3040', .3), 1.8)]
    head = Part(E(HEAD[0], HEAD[1] + 3, 33, 26), B, L, hl=(57, 32, 11, 6), over=face)
    snout = Part(E(94, 53, 11, 12.5, 8), SN, L, hl=(91, 47, 3.4, 2.4),
                 over=[paint(E(90.8, 53, 2.2, 3.8, 8), 'fill="%s"' % mix(L, '#7A3040', .2)),
                       paint(E(97.6, 54, 2.2, 3.8, 8), 'fill="%s"' % mix(L, '#7A3040', .2))])
    return [tail, body, haunch] + before + [head, ear_l, ear_r, snout] + after


def sheep(wave):
    F, FL = '#FFF5DE', '#B8A27A'          # fleece
    G, GL = '#8F8B9B', '#5B5767'          # grey face / legs
    fleece_shapes = [E(56, 83, 28, 22)]
    for cx, cy, r in ((31, 77, 9), (32, 91, 9.5), (39, 103, 9), (53, 106, 9), (67, 105, 8.5), (79, 94, 9),
                      (80, 78, 9), (72, 65, 9.5), (58, 60, 10), (43, 65, 9.5)):
        fleece_shapes.append(C(cx, cy, r))
    fleece = Part(fleece_shapes, F, FL, hl=(46, 68, 12, 6),
                  details=[paint(P('M42 82 q4 -5 8 0 M56 90 q4 -5 8 0 M44 98 q4 -5 8 0'),
                                 'fill="none" stroke="%s" stroke-width="1.5" stroke-linecap="round" opacity=".7"' % FL)])
    tail = Part(C(24, 88, 7), F, FL)
    HOOF = '#4E4A58'
    hind = Part(E(46, GROUND - 4.6, 11, 5.4), G, GL, details=[paint(E(53, GROUND - 3, 5, 6), 'fill="%s"' % HOOF)])
    far_leg = Part(CAP(71, 92, 71, GROUND - 5, 10), mix(G, GL, .25), GL,
                   details=[paint(E(71, GROUND - 2, 7, 5), 'fill="%s"' % HOOF)])
    parts = [tail, hind, fleece, far_leg]
    after = []
    if not wave:
        parts.append(Part(CAP(85, 90, 85, GROUND - 5, 11), G, GL, details=[paint(E(85, GROUND - 2, 7.5, 5), 'fill="%s"' % HOOF)]))
    else:
        arm = Part(CAP(84, 86, 102, 68, 10.5), G, GL)
        paw = Part(C(103, 64, 7.4), G, GL, hl=(100, 61, 2.6, 1.8), details=[paint(E(105, 61, 5, 5), 'fill="%s"' % HOOF)])
        after = [arm, paw]
    ear_l = Part(E(53, 38, 10, 5.4, -25), G, GL, over=[paint(E(52.5, 38.5, 6, 2.4, -25), 'fill="#F3B1C2"')])
    ear_r = Part(E(104, 36, 10, 5.2, 22), G, GL, over=[paint(E(104, 36.5, 6, 2.3, 22), 'fill="#F3B1C2"')])
    face = eyes(70, 88, 41)
    face += cheeks(63, 98, 53, '#F4A3B8', 4.6)
    face += [paint(P('M84 53 L91 53 Q88 57 87.5 57 Q87 57 84 53 Z'), 'fill="#4A4553"'),
             smile(83, 58, 92, 58, 3.6, '#3E3A48', 1.6)]
    head = Part(E(78, 46, 21, 23, -10), G, GL, hl=(70, 36, 6, 4), over=face)
    tuft = Part([C(65, 27, 8), C(75, 21, 9), C(86, 23, 8.5), C(93, 30, 5.8)], F, FL, hl=(70, 20, 5, 3))
    return parts + [ear_l, head, ear_r, tuft] + after


def duck(wave):
    B, L = '#FFE07A', '#C49A2E'
    BILL, BILLL = '#F5973C', '#B8611C'
    feet = [Part(P('M60 114 L70 110 L78 113 L74 117 L66 117 Z'), mix(BILL, BILLL, .15), BILLL, cel=False),
            Part(P('M74 114 L86 109 L95 113 L90 118 L80 118 Z'), BILL, BILLL, cel=False)]
    body = Part(P('M30 86 C24 78 21 68 24 62 C28 64 32 67 38 68 C46 68 52 67 60 67 C82 67 92 82 90 98 C88 112 74 116 58 116 '
                  'C40 116 30 108 30 96 Z'), B, L, hl=(52, 76, 12, 6), details=[paint(E(70, 102, 14, 10), 'fill="%s"' % mix(B, '#FFFFFF', .45))])
    parts = [feet[0], body, feet[1]]
    after = []
    W = mix(B, L, 0.12)
    if not wave:
        parts.append(Part(P('M38 84 C44 76 60 76 66 86 C70 94 62 102 50 100 C42 99 36 96 34 92 Z'), W, L, hl=(48, 82, 6, 3, -10),
                          over=[smile(42, 92, 56, 95, -1, L, 1.4)]))
    else:
        after.append(Part(P('M50 80 C44 72 40 60 42 48 C44 44 48 46 49 50 C52 46 55 47 55 52 C59 50 61 54 59 60 '
                            'C60 68 60 76 58 82 Z'), W, L, hl=(47, 58, 2.5, 6, 10)))
    tuft = Part(P('M66 22 C64 14 68 9 72 12 C73 8 79 8 79 14 C82 12 86 15 83 21 Z'), B, L, cel=False)
    face = eyes(66, 84, 39)
    face += cheeks(58, 92, 51, '#F7A08E', 5)
    head = Part(C(72, 42, 23), B, L, hl=(62, 30, 9, 5), over=face)
    bill = Part(P('M83 48 C91 42 105 43 110 48 C112 52 108 57 100 58 C93 59 87 57 83 54 Z'), BILL, BILLL, hl=(96, 47, 6, 1.6, 0),
                over=[smile(86, 53.5, 106, 52.5, 1.2, BILLL, 1.3)])
    return parts + [tuft, head, bill] + after


def lion(wave):
    B, L = '#EDBA6A', '#A06E2A'
    M, ML = '#C8732E', '#82461A'
    CREAM = '#FBE7C4'
    tail = Part(P('M38 106 C22 108 15 98 18 86'), B, L, stroke=6)
    tuft = Part(P('M18 90 C11 87 10 77 16 73 C20 75 24 80 23 89 Z'), M, ML, cel=False)
    body = Part(E(58, 92, 29, 25), B, L, hl=(48, 78, 10, 6), details=[paint(E(77, 95, 11, 17), 'fill="%s"' % CREAM)])
    haunch = Part(E(46, 100, 17, 15, -15), B, L, hl=(42, 92, 7, 4))
    before, after = legs(B, L, wave, paw_pad='#C98A5A')
    mane_shapes = [C(70, 47, 29)]
    import math
    for i in range(11):
        a = math.radians(-90 + i * 360 / 11 + 8)
        mane_shapes.append(C(70 + 29 * math.cos(a), 47 + 29 * math.sin(a), 8.6))
    mane = Part(mane_shapes, M, ML, hl=(52, 22, 10, 5))
    ear_l = Part(C(55, 24, 7.5), B, L, over=[paint(C(55, 24.5, 3.8), 'fill="#E08E7A"')])
    ear_r = Part(C(87, 24, 7.5), B, L, over=[paint(C(87, 24.5, 3.8), 'fill="#E08E7A"')])
    face = eyes(63, 83, 44)
    face += cheeks(55, 93, 56)
    face += [paint(P('M77.5 52.5 L86.5 52.5 Q83 58 82 58 Q81 58 77.5 52.5 Z'), 'fill="#7A4A2A"'),
             mouth_w(82, 58.6, '#7A4A2A', 4.2)]
    head = Part(E(73, 48, 23, 21), B, L, hl=(63, 36, 7, 4), over=face,
                details=[paint(E(82, 59, 11, 8), 'fill="%s"' % CREAM)])
    return [tail, tuft, body, haunch] + before + [mane, ear_l, ear_r, head] + after


def frog(wave):
    B, L = '#8CCB5E', '#4C862B'
    BELLY = '#E2F4B8'
    D = mix(B, L, 0.25)
    thigh = Part(E(40, 100, 20, 14, -20), B, L, hl=(34, 93, 7, 3),
                 details=[paint(C(34, 102, 3), 'fill="%s"' % D), paint(C(45, 94, 2.4), 'fill="%s"' % D)])
    foot_back = Part(P('M30 116 C34 108 50 108 60 112 L66 109 L67 114 L68 117 L30 117 Z'), D, L, cel=False)
    body = Part(E(64, 88, 30, 27), B, L, hl=(52, 76, 10, 5), details=[paint(E(76, 96, 15, 18), 'fill="%s"' % BELLY)])
    arm_far = Part(CAP(70, 92, 72, GROUND - 4, 9.5), D, L)
    hand_far = Part(P('M64 117 C64 112 68 110 72 110 C76 110 80 112 80 117 Z'), D, L, cel=False,
                    over=[paint(C(x, 116.5, 2.2), 'fill="%s"' % D) for x in (65, 72, 79)])
    parts = [foot_back, thigh, body, arm_far, hand_far]
    after = []
    if not wave:
        parts.append(Part(CAP(86, 90, 88, GROUND - 4, 10), B, L, hl=(85, 98, 2, 6, 0)))
        parts.append(Part(P('M80 117 C80 112 84 110 88 110 C92 110 97 112 97 117 Z'), B, L, cel=False,
                          over=[paint(C(x, 116.6, 2.4), 'fill="%s"' % B) for x in (81, 88.5, 96)] +
                          [paint(C(x, 116.6, 2.4), 'fill="none" stroke="%s" stroke-width="1.2"' % L) for x in (81, 88.5, 96)]))
    else:
        after.append(Part(CAP(86, 86, 103, 66, 10), B, L, hl=(93, 77, 2, 6, 40)))
        fingers = [(97, 54), (104, 51), (111, 55), (113, 63)]
        after.append(Part([C(104, 62, 7)] + [C(x, y, 3.6) for x, y in fingers], B, L, hl=(101, 59, 2.4, 1.6)))
    face = eyes(57, 82, 30, 1.0)
    face += cheeks(49, 93, 54, '#F59AA8', 5.2)
    face += [smile(56, 54, 94, 51, 9, '#3E6E22', 2),
             paint(C(83, 43, 1.2), 'fill="%s"' % L), paint(C(88, 42.5, 1.2), 'fill="%s"' % L)]
    head = Part([E(70, 48, 32, 19), C(57, 31, 13), C(82, 30, 13)], B, L, hl=(50, 24, 5, 3), over=face,
                details=[paint(E(73, 59, 22, 8), 'fill="%s"' % mix(BELLY, B, .3))])
    return parts + [head] + after


ANIMALS = {'cat': cat, 'dog': dog, 'cow': cow, 'pig': pig, 'sheep': sheep, 'duck': duck, 'lion': lion, 'frog': frog}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ANIMALS.items():
        for wave in (False, True):
            fn_out = os.path.join(OUT, 'animal_%s%s.svg' % (name, '_wave' if wave else ''))
            with open(fn_out, 'w') as fh:
                fh.write(build(fn(wave)))
    print('wrote %d stickers to %s' % (2 * len(ANIMALS), OUT))


if __name__ == '__main__':
    main()
