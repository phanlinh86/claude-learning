#!/usr/bin/env python3
"""Character / UI art generator for Pip's Camp Hide & Seek (character artist A).

Writes (relative to game/assets/default/):
  characters/pip_{idle,blink,talk,happy,cheer,think,oops,cover,peek}.svg   0 0 256 300
        Pip the baby fox standing, facing the viewer turned slightly right. FEET anchor (128, 292) (bottom of the feet).
        The body (tail, legs, torso, backpack straps, bandana) is IDENTICAL in every frame; the head is identical too
        (only rotated about the neck (128,172) in `oops`); eyes, brows, mouth and arms change.
          idle · blink (eyes shut) · talk (open mouth) · happy (big smile) · cheer (both paws up) · think (paw to chin)
          oops (head tilt "hmm?", never sad) · cover (both paws over the eyes: counting) · peek (one paw lowered, one eye peeks)
  characters/pip_full_wave.svg   0 0 256 300   title pose: waving, happy face (same body, feet (128,292))
  characters/critter.svg, characters/critter_pop.svg   0 0 128 128   a little grey-brown squirrel; pop = arms up
        feet bottom ≈ y 122, centre x ≈ 60
  icon.svg   0 0 512 512   full bleed: Pip peeking out from behind a bush, camp tent and mountains behind

Usage: python3 tools/art_pip.py [outDir]
Rules (docs/DESIGN.md §3): 100 % original (no famous cartoon fox), flat cartoon, ≈4 px outline in a darker tone of the
fill (never black), one-step cel shading + one soft highlight upper-left, no <text>/fonts/scripts/external refs, no filters.
width/height = viewBox. Deterministic: re-running gives byte-identical files.
"""
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md §3)
P = {
    'fur': '#D27B4E', 'shade': '#B5603A', 'line': '#7E3F25', 'hi': '#E8A07A',
    'cream': '#FFF1DE', 'creamSh': '#F0D9BE',
    'dark': '#5B3A2E', 'darkSh': '#4A2E24', 'darkLn': '#3B241B', 'darkHi': '#7A5446',
    'eye': '#2F2A3A', 'white': '#FFFFFF', 'cheek': '#F6B1A0', 'mouth': '#7A3346', 'tongue': '#F08AA0',
    'nose': '#3A2A2E',
    'teal': '#2FA7A0', 'tealDk': '#1E7A74', 'tealLn': '#16564F', 'tealHi': '#6CCBC3',
    'strap': '#8A6E4E', 'strapLn': '#5E4A33', 'buckle': '#D9C7A0',
}
SQ = {'fur': '#9C8574', 'shade': '#846D5E', 'line': '#5E4A3E', 'hi': '#B9A595', 'belly': '#EEE0CC', 'bellySh': '#DCCAB2',
      'inner': '#E9B8B0'}
LW = 4.2  # outline width at viewBox 256
NECK = (128, 172)


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


def ell(cx, cy, rx, ry, extra='', rot=0):
    t = f' transform="rotate({f(rot)} {f(cx)} {f(cy)})"' if rot else ''
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}"{t} {extra}/>'


def circ(cx, cy, r, extra=''):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {extra}/>'


def path(d, extra=''):
    return f'<path d="{d}" {extra}/>'


def stroke(col, w, fill='none'):
    return f'fill="{fill}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"'


def filled(fill, line, w=LW):
    return f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"'


def smooth_d(pts, close=True):
    """Smooth path through pts (Catmull-Rom → cubic Bézier). Points given as (x, y) or (x, y, 'c') for a sharp corner."""
    n = len(pts)
    d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        if not close:
            p0 = pts[max(0, i - 1)]
            p3 = pts[min(n - 1, i + 2)]
        k1 = 0 if len(p1) > 2 else 1 / 6
        k2 = 0 if len(p2) > 2 else 1 / 6
        c1 = (p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1)
        c2 = (p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if close else '')


def mirror(pts):
    return [(256 - p[0], p[1]) + tuple(p[2:]) for p in pts]


def clip(cid, d):
    return f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'


def g_clip(cid, inner):
    return f'<g clip-path="url(#{cid})">{inner}</g>'


# ======================================================================= PIP
# ---------------------------------------------------------------- tail (behind everything)
TAIL = [(150, 252), (172, 272), (210, 272), (236, 250), (249, 214), (246, 176), (232, 148, 'c'),
        (218, 160), (212, 186), (206, 218), (186, 238), (160, 238)]


def tail(p):
    d = smooth_d(TAIL)
    cid = p + 'tail'
    defs = clip(cid, d)
    out = path(d, filled(P['fur'], P['line']))
    inner = ell(196, 258, 42, 26, f'fill="{P["shade"]}"', -25)
    # cream tip with a soft zigzag edge
    tip = smooth_d([(196, 190), (214, 186), (226, 196), (240, 186), (256, 196), (256, 130), (196, 130)])
    inner += path(tip, f'fill="{P["cream"]}"')
    inner += path('M214,186 Q220,166 232,150', stroke(P['creamSh'], 3.2))
    inner += ell(222, 214, 9, 22, f'fill="{P["hi"]}" opacity=".55"', 20)
    out += g_clip(cid, inner) + path(d, stroke(P['line'], LW))
    # fur flicks
    out += path('M226,234 q8,-2 12,-8', stroke(P['line'], 2.6) + ' opacity=".6"')
    out += path('M204,256 q8,0 13,-6', stroke(P['line'], 2.6) + ' opacity=".5"')
    out += path('M226,196 q8,-1 12,-6', stroke(P['creamSh'], 2.6))
    return defs, out


# ---------------------------------------------------------------- legs / torso / straps / bandana
def legs():
    out = ''
    for x in (106, 150):
        d = f'M{x - 15},250 L{x - 15},280 Q{x},289 {x + 15},280 L{x + 15},250 Z'
        out += path(d, filled(P['dark'], P['darkLn']))
        out += path(f'M{x + 6},252 L{x + 7},282 Q{x + 12},283 {x + 14},280 L{x + 14},252 Z', f'fill="{P["darkSh"]}"')
    for x in (104, 152):   # feet (bottom y = 291 + half stroke ≈ 292)
        out += ell(x, 284, 19, 7.4, filled(P['dark'], P['darkLn'], 3.4))
        out += ell(x - 5, 281.5, 7, 2.6, f'fill="{P["darkHi"]}" opacity=".8"')
        for k in (-1, 1):
            out += path(f'M{x + k * 6},286 l{f(k * 0.8)},4', stroke(P['darkLn'], 2))
    return out


TORSO = 'M128,162 C162,162 180,196 180,232 C180,262 158,277 128,277 C98,277 76,262 76,232 C76,196 94,162 128,162 Z'


def torso(p):
    cid = p + 'tor'
    defs = clip(cid, TORSO)
    out = path(TORSO, filled(P['fur'], P['line']))
    inner = ell(184, 248, 42, 60, f'fill="{P["shade"]}"')
    inner += ell(126, 240, 30, 33, f'fill="{P["cream"]}"')
    inner += ell(150, 252, 16, 26, f'fill="{P["creamSh"]}"', -10)
    inner += ell(100, 204, 14, 22, f'fill="{P["hi"]}" opacity=".55"', 20)
    out += g_clip(cid, inner) + path(TORSO, stroke(P['line'], LW))
    # backpack straps over both shoulders + a little buckle
    for (a, b, c) in (((98, 172), (90, 206), (94, 246)), ((158, 172), (166, 206), (162, 246))):
        d = f'M{f(a[0])},{f(a[1])} Q{f(b[0])},{f(b[1])} {f(c[0])},{f(c[1])}'
        out += path(d, stroke(P['strapLn'], 11)) + path(d, stroke(P['strap'], 6.6))
    out += f'<rect x="85" y="222" width="14" height="10" rx="3" {filled(P["buckle"], P["strapLn"], 2.2)}/>'
    out += f'<rect x="157" y="222" width="14" height="10" rx="3" {filled(P["buckle"], P["strapLn"], 2.2)}/>'
    return defs, out


def bandana(p):
    d = 'M88,170 Q128,186 168,170 Q160,196 136,216 Q128,222 120,216 Q96,196 88,170 Z'
    cid = p + 'ban'
    defs = clip(cid, d)
    out = path(d, filled(P['teal'], P['tealLn']))
    inner = path('M128,180 Q150,182 168,170 L170,230 L128,230 Z', f'fill="{P["tealDk"]}" opacity=".55"')
    for (x, y) in ((108, 186), (128, 196), (146, 186), (120, 207), (137, 207), (98, 178), (158, 178)):
        inner += circ(x, y, 2.6, f'fill="{P["tealHi"]}"')
    inner += path('M94,176 Q110,184 124,186', stroke(P['tealHi'], 3) + ' opacity=".8"')
    out += g_clip(cid, inner) + path(d, stroke(P['tealLn'], 3.6))
    # rolled band peeking at the sides of the neck
    out += path('M84,170 Q90,178 96,176', stroke(P['tealLn'], 9)) + path('M84,170 Q90,178 96,176', stroke(P['teal'], 5))
    out += path('M172,170 Q166,178 160,176', stroke(P['tealLn'], 9)) + path('M172,170 Q166,178 160,176', stroke(P['teal'], 5))
    return defs, out


# ---------------------------------------------------------------- head
HEAD = [(128, 50), (166, 54), (194, 72), (207, 100), (207, 124), (222, 146, 'c'), (199, 150), (200, 160, 'c'),
        (172, 176), (128, 182), (84, 176), (56, 160, 'c'), (57, 150), (34, 146, 'c'), (49, 124), (49, 100), (62, 72),
        (90, 54)]
EAR_L = 'M68,92 Q50,44 58,10 Q60,6 64,8 Q100,26 116,62 Z'
EAR_L_IN = 'M76,82 Q66,50 67,24 Q92,40 104,64 Z'
EYES = [(101, 112), (160, 112)]   # turned slightly right: features shifted +2..5 px
EYE_R = (12.5, 15.5)
MUZZLE_C = (132, 146)


def mirror_d(d):
    """Mirror an absolute M/Q/L/C/Z path about x = 128."""
    toks = re.findall(r'[A-Za-z]|-?\d+(?:\.\d+)?', d)
    res, i = [], 0
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            res.append(t)
            i += 1
            continue
        res.append(f'{f(256 - float(t))},{f(float(toks[i + 1]))}')
        i += 2
    return ' '.join(res)


def ears(p):
    out, defs = '', ''
    for side, (d, din) in enumerate(((EAR_L, EAR_L_IN), (mirror_d(EAR_L), mirror_d(EAR_L_IN)))):
        cid = p + 'ear' + str(side)
        defs += clip(cid, d)
        out += path(d, filled(P['fur'], P['line']))
        inner = path(din, f'fill="{P["cream"]}"')
        # fluffy inner tufts
        bx = 84 if side == 0 else 172
        sgn = 1 if side == 0 else -1
        inner += path(f'M{bx - sgn * 4},70 q{sgn * 6},-12 {sgn * 2},-24 q{sgn * 6},10 {sgn * 10},4', stroke(P['creamSh'], 2.6))
        # dark-chocolate ear tip / back edge
        if side == 0:
            inner += path('M40,40 Q66,42 92,24 L92,-4 L40,-4 Z', f'fill="{P["dark"]}"')
            inner += path('M48,40 Q56,60 70,94 L56,94 Z', f'fill="{P["dark"]}"')
        else:
            inner += path('M216,40 Q190,42 164,24 L164,-4 L216,-4 Z', f'fill="{P["dark"]}"')
            inner += path('M208,40 Q200,60 186,94 L200,94 Z', f'fill="{P["dark"]}"')
        out += g_clip(cid, inner) + path(d, stroke(P['line'], LW))
    return defs, out


def head_base(p):
    d = smooth_d(HEAD)
    cid = p + 'head'
    defs = clip(cid, d)
    out = path(d, filled(P['fur'], P['line']))
    inner = ell(214, 150, 50, 60, f'fill="{P["shade"]}"')
    # forehead highlight (upper-left)
    inner += ell(96, 74, 26, 12, f'fill="{P["hi"]}" opacity=".7"', -18)
    # cream mask: cheeks + muzzle (fox face)
    mask = smooth_d([(30, 150), (52, 128), (80, 126), (104, 134), (122, 126), (132, 118), (142, 126), (160, 134),
                     (184, 126), (210, 128), (230, 150), (210, 176), (128, 190), (46, 176)])
    inner += path(mask, f'fill="{P["cream"]}"')
    inner += path('M146,178 Q190,170 214,148 L226,190 L140,196 Z', f'fill="{P["creamSh"]}"')
    # forehead fur flick
    inner += path('M120,54 q6,10 3,20 M132,54 q4,9 0,18', stroke(P['shade'], 3))
    out += g_clip(cid, inner) + path(d, stroke(P['line'], LW))
    # a lock of fur on the crown
    out += path('M114,56 Q120,38 132,44 Q130,50 138,50 Q132,56 126,58 Z', filled(P['fur'], P['line'], 3.4))
    # muzzle bump and nose
    mx, my = MUZZLE_C
    out += path(f'M{mx - 22},{my - 2} Q{mx},{my - 16} {mx + 22},{my - 2}', stroke(P['creamSh'], 2.4) + ' opacity=".9"')
    nose = f'M{mx - 10},{my - 12} Q{mx},{my - 16} {mx + 10},{my - 12} Q{mx + 9},{my - 4} {mx},{my - 1} Q{mx - 9},{my - 4} {mx - 10},{my - 12} Z'
    out += path(nose, filled(P['nose'], P['nose'], 2))
    out += ell(mx - 3.5, my - 11.5, 3.6, 1.8, 'fill="#FFFFFF" opacity=".8"')
    return defs, out


def eyes(kind, which=(0, 1)):
    out = ''
    rx, ry = EYE_R
    for i, (x, y) in enumerate(EYES):
        if i not in which:
            continue
        if kind in ('open', 'look', 'up', 'wide', 'side'):
            dx, dy = {'look': (2, 0), 'up': (4, -4), 'wide': (0, 0), 'side': (-2, 0)}.get(kind, (0, 0))
            k = 1.1 if kind == 'wide' else 1.0
            out += ell(x + dx, y + dy, rx * k, ry * k, f'fill="{P["eye"]}"')
            out += circ(x + dx - 3.8, y + dy - 6, 5, 'fill="#FFFFFF"')
            out += circ(x + dx + 4.2, y + dy + 5.6, 2.2, 'fill="#FFFFFF" opacity=".85"')
        elif kind == 'closed':
            out += path(f'M{f(x - 12)},{f(y + 1)} Q{f(x)},{f(y + 10)} {f(x + 12)},{f(y + 1)}', stroke(P['eye'], 4.4))
            out += path(f'M{f(x + (-13 if i == 0 else 13))},{f(y + 1)} l{f(-4 if i == 0 else 4)},-3', stroke(P['eye'], 3))
        elif kind == 'happy':
            out += path(f'M{f(x - 12)},{f(y + 5)} Q{f(x)},{f(y - 12)} {f(x + 12)},{f(y + 5)}', stroke(P['eye'], 5.2))
    return out


def brows(kind):
    c = P['shade']
    if kind == 'up':      # "hmm?" — left brow raised high, right level
        return path('M88,88 Q100,76 114,84', stroke(P['line'], 4)) + path('M148,92 Q160,89 172,92', stroke(P['line'], 4))
    if kind == 'think':
        return path('M90,90 Q101,85 113,89', stroke(P['line'], 4)) + path('M148,86 Q160,79 173,86', stroke(P['line'], 4))
    if kind == 'happy':
        return path('M90,88 Q101,82 112,86', stroke(c, 3.6)) + path('M149,86 Q160,82 171,88', stroke(c, 3.6))
    return ''


def cheeks():
    return (ell(80, 140, 11.5, 7, f'fill="{P["cheek"]}" opacity=".85"') +
            ell(184, 140, 11.5, 7, f'fill="{P["cheek"]}" opacity=".85"'))


def mouth(kind):
    mx, my = MUZZLE_C
    ln = P['line']
    out = path(f'M{mx},{my - 1} L{mx},{my + 4}', stroke(ln, 3))
    if kind == 'smile':
        out += path(f'M{mx - 14},{my + 3} Q{mx - 7},{my + 11} {mx},{my + 4} Q{mx + 7},{my + 11} {mx + 14},{my + 3}', stroke(ln, 3.4))
    elif kind in ('talk', 'open', 'big'):
        w, h = {'talk': (11, 15), 'open': (13, 19), 'big': (18, 24)}[kind]
        d = f'M{mx - w},{my + 4} Q{mx},{my + 4 + h * 2} {mx + w},{my + 4} Q{mx},{my + 8} {mx - w},{my + 4} Z'
        out += path(d, filled(P['mouth'], ln, 3.2))
        out += f'<clipPath id="mclip{kind}"><path d="{d}"/></clipPath>'
        out += g_clip('mclip' + kind, ell(mx + 1, my + 4 + h * 0.95, w * 0.62, h * 0.4, f'fill="{P["tongue"]}"'))
        out += path(d, stroke(ln, 3.2))
        if kind == 'big':
            out += path(f'M{mx - w + 3},{my + 6} Q{mx},{my + 11} {mx + w - 3},{my + 6} L{mx + w - 5},{my + 9} Q{mx},{my + 14} {mx - w + 5},{my + 9} Z', 'fill="#FFFFFF"')
    elif kind == 'o':
        out += ell(mx + 6, my + 12, 5.6, 6.6, filled(P['mouth'], ln, 3))
    elif kind == 'side':
        out += path(f'M{mx - 8},{my + 9} Q{mx + 6},{my + 13} {mx + 16},{my + 6}', stroke(ln, 3.4))
    elif kind == 'wobble':
        out += path(f'M{mx - 10},{my + 11} q5,-4 10,0 q5,4 10,0', stroke(ln, 3.4))
    return out


FACES = {
    #        eyes      brows    mouth
    'idle': ('open', '', 'smile'), 'blink': ('closed', '', 'smile'), 'talk': ('look', '', 'talk'),
    'happy': ('happy', 'happy', 'big'), 'cheer': ('happy', 'happy', 'big'), 'think': ('up', 'think', 'side'),
    'oops': ('wide', 'up', 'o'), 'cover': ('closed', '', 'open'), 'peek': ('open', 'up', 'smile'),
    'wave': ('open', 'happy', 'open'),
}


def pip_head(p, mood):
    d1, e = ears(p)
    d2, h = head_base(p)
    ek, bk, mk = FACES[mood]
    face = cheeks()
    if mood == 'peek':
        face += eyes('look', (0,))   # left eye peeks, right one is under the paw (drawn shut below it)
        face += eyes('closed', (1,))
    else:
        face += eyes(ek)
    face += brows(bk) + mouth(mk)
    return d1 + d2, e + h + face


# ---------------------------------------------------------------- arms
def paw(x, y, r=12.5, ang=0):
    out = circ(x, y, r, filled(P['dark'], P['darkLn'], 3.6))
    out += ell(x - r * 0.3, y - r * 0.35, r * 0.42, r * 0.26, f'fill="{P["darkHi"]}" opacity=".8"', ang - 20)
    a = math.radians(ang)
    for k in (-1, 0, 1):
        px, py = k * r * 0.42, r * 0.62
        qx = x + px * math.cos(a) - py * math.sin(a)
        qy = y + px * math.sin(a) + py * math.cos(a)
        q2x = x + px * 0.8 * math.cos(a) - (py - 4) * math.sin(a)
        q2y = y + px * 0.8 * math.sin(a) + (py - 4) * math.cos(a)
        if k != 0:
            out += path(f'M{f(qx)},{f(qy)} L{f(q2x)},{f(q2y)}', stroke(P['darkLn'], 1.8))
    return out


def arm(sx, sy, hx, hy, bend=0.0, glove=0.62):
    mx, my = (sx + hx) / 2, (sy + hy) / 2
    nx, ny = -(hy - sy), (hx - sx)
    L = math.hypot(nx, ny) or 1
    cx, cy = mx + nx / L * bend, my + ny / L * bend
    d = f'M{f(sx)},{f(sy)} Q{f(cx)},{f(cy)} {f(hx)},{f(hy)}'
    # the forearm turns dark-chocolate near the paw (fox "gloves")
    t = glove
    gx = (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t * t * hx
    gy = (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t * t * hy
    c2x, c2y = (1 - t) * cx + t * hx, (1 - t) * cy + t * hy
    d2 = f'M{f(gx)},{f(gy)} Q{f(c2x)},{f(c2y)} {f(hx)},{f(hy)}'
    return path(d, stroke(P['line'], 24)) + path(d, stroke(P['fur'], 16)) + path(d2, stroke(P['dark'], 16))


SH_L, SH_R = (94, 190), (162, 190)
ARMS = {
    # (hand, bend, paw r, paw angle) for viewer-left and viewer-right arms
    'rest':  [((84, 244), 6, 12.5, 10), ((172, 244), -6, 12.5, -10)],
    'cheer': [((36, 120), 16, 13.5, 150), ((220, 120), -16, 13.5, -150)],
    'think': [((84, 244), 6, 12.5, 10), ((150, 168), -28, 12.5, -160)],
    'cover': [((101, 110), 24, 18, 170), ((160, 110), -24, 18, -170)],
    'peek':  [((90, 158), 12, 14, 150), ((160, 110), -24, 18, -170)],
    'wave':  [((84, 244), 6, 12.5, 10), ((220, 116), -14, 13.5, -150)],
}
ARMS_OF = {'cheer': 'cheer', 'think': 'think', 'cover': 'cover', 'peek': 'peek', 'wave': 'wave'}


def arms(kind, over):
    """Returns the arm SVG; `over` = arms drawn after the head (raised arms)."""
    out = ''
    for (h, bend, r, ang), sh in zip(ARMS[kind], (SH_L, SH_R)):
        raised = h[1] < 200
        if raised != over:
            continue
        out += arm(sh[0], sh[1], h[0], h[1], bend, 0.5 if h[1] < 130 else 0.62) + paw(h[0], h[1], r, ang)
    return out


def pip(mood, p='p'):
    kind = ARMS_OF.get(mood, 'rest')
    defs, out = '', ''
    d, t = tail(p)
    defs += d
    out += t + legs()
    d, t = torso(p)
    defs += d
    out += t
    out += arms(kind, False)
    d, t = bandana(p)
    defs += d
    out += t
    d, h = pip_head(p, mood)
    defs += d
    if mood == 'oops':
        h = f'<g transform="rotate(-10 {NECK[0]} {NECK[1]})">{h}</g>'
    out += h
    out += arms(kind, True)
    if mood == 'wave':
        out += path('M236,94 q8,8 6,18', stroke(P['line'], 3) + ' opacity=".55"')
        out += path('M244,84 q12,12 8,28', stroke(P['line'], 3) + ' opacity=".4"')
    return defs, out


# ======================================================================= SQUIRREL (128 × 128)
def critter(pop):
    p = 'c'
    defs, out = '', ''
    # big bushy tail curling up behind (viewer's right)
    td = smooth_d([(70, 112), (94, 108), (112, 88), (118, 58), (112, 30), (96, 16), (78, 20), (72, 34, 'c'), (86, 32), (98, 40),
                   (100, 60), (92, 82), (74, 96)])
    defs += clip(p + 't', td)
    out += path(td, filled(SQ['fur'], SQ['line'], 3.2))
    out += g_clip(p + 't', ell(112, 90, 18, 30, f'fill="{SQ["shade"]}"') + ell(92, 28, 14, 10, f'fill="{SQ["hi"]}" opacity=".8"') +
                  path('M100,46 q8,16 4,34', stroke(SQ['shade'], 2.4)))
    out += path(td, stroke(SQ['line'], 3.2))
    # feet
    for x in (50, 72):
        out += ell(x, 119, 10, 4.6, filled(SQ['shade'], SQ['line'], 2.6))
    # body
    bd = 'M60,70 C78,70 84,90 82,104 C80,118 70,121 60,121 C50,121 40,118 38,104 C36,90 42,70 60,70 Z'
    defs += clip(p + 'b', bd)
    out += path(bd, filled(SQ['fur'], SQ['line'], 3.2))
    out += g_clip(p + 'b', ell(84, 110, 18, 26, f'fill="{SQ["shade"]}"') + ell(60, 102, 14, 17, f'fill="{SQ["belly"]}"'))
    out += path(bd, stroke(SQ['line'], 3.2))
    # arms
    def sarm(sx, sy, hx, hy):
        d = f'M{sx},{sy} Q{(sx + hx) / 2 + (6 if hx < 60 else -6)},{(sy + hy) / 2} {hx},{hy}'
        return path(d, stroke(SQ['line'], 11)) + path(d, stroke(SQ['fur'], 6)) + circ(hx, hy, 5, filled(SQ['shade'], SQ['line'], 2.4))
    if not pop:
        # holding an acorn at the chest
        out += sarm(48, 82, 54, 94) + sarm(72, 82, 66, 94)
        out += ell(60, 96, 7, 8, filled('#B98552', '#7E5630', 2.4))
        out += path('M52,92 Q60,84 68,92 Z', filled('#8C6A44', '#5E4426', 2.2))
        out += path('M60,85 l1,-4', stroke('#5E4426', 2))
    # head
    hd = smooth_d([(58, 34), (76, 38), (84, 54), (80, 70), (66, 78), (52, 78), (38, 70), (34, 54), (42, 38)])
    # ears with tufts
    for (ex, ey, sgn) in ((44, 30, -1), (72, 30, 1)):
        ed = f'M{ex - 7},{ey + 12} Q{ex - 4 + sgn * 2},{ey - 10} {ex + sgn * 2},{ey - 14} Q{ex + 8},{ey - 4} {ex + 8},{ey + 10} Z'
        out += path(ed, filled(SQ['fur'], SQ['line'], 3))
        out += path(f'M{ex - 3},{ey + 8} Q{ex - 1},{ey - 2} {ex + sgn * 1.5},{ey - 7} Q{ex + 4},{ey} {ex + 4},{ey + 8} Z', f'fill="{SQ["inner"]}"')
        out += path(f'M{ex + sgn * 2},{ey - 13} l{sgn * 2},-6 M{ex + sgn * 2},{ey - 13} l{sgn * -2},-5', stroke(SQ['line'], 2.4))
    defs += clip(p + 'h', hd)
    out += path(hd, filled(SQ['fur'], SQ['line'], 3.2))
    out += g_clip(p + 'h', ell(84, 70, 18, 22, f'fill="{SQ["shade"]}"') + ell(46, 44, 10, 5, f'fill="{SQ["hi"]}" opacity=".7"', -20) +
                  ell(60, 70, 18, 11, f'fill="{SQ["belly"]}"'))
    out += path(hd, stroke(SQ['line'], 3.2))
    # face
    for x in (50, 68):
        if pop:
            out += path(f'M{x - 6},{57} Q{x},{48} {x + 6},{57}', stroke('#2F2A3A', 3.4))
        else:
            out += ell(x, 54, 5.4, 6.6, 'fill="#2F2A3A"') + circ(x - 1.8, 51.6, 2.2, 'fill="#FFFFFF"') + circ(x + 2, 57, 1, 'fill="#FFFFFF"')
    out += ell(44, 63, 4.6, 3, 'fill="#F6B1A0" opacity=".85"') + ell(75, 63, 4.6, 3, 'fill="#F6B1A0" opacity=".85"')
    out += ell(59, 62, 3.4, 2.4, 'fill="#5A3A3A"')
    if pop:
        out += path('M52,66 Q59,78 66,66 Q59,69 52,66 Z', filled('#7A3346', SQ['line'], 2.2))
        out += f'<rect x="56.5" y="66" width="5" height="4" rx="1" fill="#FFFFFF"/>'
        # arms up
        out += sarm(44, 84, 22, 58) + sarm(76, 84, 98, 58)
        out += path('M14,48 l-6,-5 M18,42 l-2,-8 M104,42 l2,-8 M108,48 l6,-5', stroke(SQ['line'], 2.4) + ' opacity=".6"')
    else:
        out += path('M54,67 Q56.5,70 59,67 Q61.5,70 64,67', stroke(SQ['line'], 2.2))
        out += f'<rect x="57" y="67.5" width="4" height="3.4" rx="1" fill="#FFFFFF" stroke="{SQ["line"]}" stroke-width="1"/>'
    return defs, out


# ======================================================================= ICON (512 × 512)
def icon():
    defs = ('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD6F5"/>'
            '<stop offset="1" stop-color="#F6F0D8"/></linearGradient>')
    out = '<rect width="512" height="512" fill="url(#isky)"/>'
    out += circ(404, 92, 40, 'fill="#FFE59A"') + circ(404, 92, 30, 'fill="#FFF3C4"')
    # mountains
    out += path('M-10,300 L96,150 L150,212 L240,104 L344,236 L404,176 L522,300 Z', filled('#93A8C4', '#71869F', 4))
    out += path('M96,150 L76,180 L94,176 L108,190 L118,170 Z', 'fill="#F4F8FC"')
    out += path('M240,104 L210,146 L232,138 L246,156 L262,136 L276,150 Z', 'fill="#F4F8FC"')
    out += path('M404,176 L384,204 L402,198 L414,210 L426,194 Z', 'fill="#F4F8FC"')
    # hills
    out += path('M-10,330 Q110,250 240,300 Q360,250 522,300 L522,512 L-10,512 Z', filled('#9CC08C', '#7FA371', 4))
    # firs
    for (x, y, s) in ((60, 300, 1), (104, 292, 0.8), (456, 290, 0.9)):
        out += path(f'M{x},{y - 70 * s} L{x + 26 * s},{y} L{x - 26 * s},{y} Z', filled('#5E8E6A', '#456F52', 3))
    # tent (muted canvas)
    out += path('M300,372 L380,214 L466,372 Z', filled('#E9DCC0', '#9C8A6A', 5))
    out += path('M380,214 L426,372 L466,372 Z', 'fill="#D8C8A6"')
    out += path('M380,214 L356,372 L404,372 Z', filled('#8C7556', '#6E5A40', 4))
    out += path('M380,214 L380,196', stroke('#6E5A40', 5))
    out += path('M380,198 l22,8 l-22,6 z', filled('#2FA7A0', '#1E7A74', 2.4))
    # meadow front
    out += path('M-10,396 Q256,360 522,396 L522,512 L-10,512 Z', filled('#B7D99C', '#8DB676', 4))
    # Pip's head peeking over the bush (head group scaled ×1.55, neck at (196, 440))
    d, h = pip_head('i', 'idle')
    defs += d
    s = 1.7
    out += f'<g transform="translate(222 404) rotate(-6) scale({s}) translate(-128 -150)">{h}</g>'
    # bush in front
    bd = smooth_d([(40, 520), (30, 452), (70, 404), (120, 392), (160, 404), (206, 388), (256, 396), (300, 384), (346, 400),
                   (380, 430), (392, 470), (400, 520)])
    defs += clip('ib', bd)
    out += path(bd, filled('#8DB27A', '#5F8452', 5))
    out += g_clip('ib', ell(380, 500, 120, 80, 'fill="#769F66"') + ell(130, 420, 60, 18, 'fill="#A9C995" opacity=".8"'))
    out += path(bd, stroke('#5F8452', 5))
    for (x, y) in ((92, 440), (170, 470), (300, 430), (250, 480), (352, 470)):
        for k in range(5):
            a = math.radians(k * 72 - 90)
            out += circ(x + 6 * math.cos(a), y + 6 * math.sin(a), 4.2, 'fill="#FFFFFF" stroke="#C9CDB8" stroke-width="1"')
        out += circ(x, y, 3, 'fill="#FFD95A"')
    # two paws on top of the bush
    out += paw(118, 402, 22, 0) + paw(318, 396, 22, 0)
    return defs, out


MOODS = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'cover', 'peek']


def main():
    for mood in MOODS:
        d, b = pip(mood)
        write(f'characters/pip_{mood}.svg', svg(256, 300, b, d))
    d, b = pip('wave')
    write('characters/pip_full_wave.svg', svg(256, 300, b, d))
    d, b = critter(False)
    write('characters/critter.svg', svg(128, 128, b, d))
    d, b = critter(True)
    write('characters/critter_pop.svg', svg(128, 128, b, d))
    d, b = icon()
    write('icon.svg', svg(512, 512, b, d))
    print('wrote Pip ×10 / critter ×2 / icon to', OUT)


if __name__ == '__main__':
    main()
