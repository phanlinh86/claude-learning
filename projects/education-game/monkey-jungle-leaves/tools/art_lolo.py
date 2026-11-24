#!/usr/bin/env python3
"""Character / UI art generator for Lolo's Jungle Leaf Match (character artist A). 100 % original art.

Writes (relative to game/assets/default/):
  characters/lolo_body_{sit,hop,hang}.svg   0 0 256 256
        Lolo the little monkey, 3/4 view facing RIGHT, no head, no right arm, no tail (code draws arm + tail).
        The torso path is byte-identical in every frame (head / arm / tail anchors never jump).
        sit/hop: feet-seat (128,244), neck socket (128,118), shoulder (152,136), tail root (84,220).
        hang: hand point (128,18) (both hands on the vine), socket (128,118), tail root (84,200).
  characters/lolo_head_{idle,blink,talk,happy,cheer,think,oops}.svg   0 0 192 192
        Same skull + ears + tuft + leaf bow in every mood; neck joint (96,172) sits just inside the round chin.
        Head box side in game = HEAD_SCALE * body h  (LL.LoloArt.ANCHORS.headScale).
  characters/lolo_title.svg   0 0 320 480   Lolo hanging by her tail from a vine, waving
  characters/toucan.svg, toucan_flap.svg    0 0 128 128   feet (64,120), facing right
  characters/frog.svg, frog_jump.svg        0 0 128 128   feet (64,118), facing right
  ui/star.svg, ui/star_empty.svg            0 0 64 64
  icon.svg                                  0 0 512 512   Lolo peeking from behind a big flipped leaf

Usage: python3 tools/art_lolo.py [outDir]
Rules (docs/DESIGN.md §3): flat cartoon, ~4 px outline (viewBox 256) in a darker tone of the fill (never black),
one-step cel shading + one soft highlight upper-left, no <text>/fonts/scripts/external refs, no filters,
width/height = viewBox. Deterministic: re-running gives byte-identical files.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game', 'assets', 'default')

# ---------------------------------------------------------------- palette (DESIGN.md §3)
G = {
    'fur': '#9A6A45', 'shade': '#7E5534', 'line': '#5A3A22', 'furHi': '#B88A63',
    'peach': '#F6D2A8', 'peachSh': '#E8B988', 'peachLn': '#B07A4E',
    'eye': '#2F2622', 'white': '#FFFFFF', 'cheek': '#F5AFB4',
    'mouth': '#7A2E2A', 'tongue': '#F2899A',
    'bow': '#5FC7C9', 'bowDk': '#2F8D90', 'bowHi': '#A6E4E4',
    'vine': '#6E8F3A', 'vineDk': '#46612A', 'vineHi': '#94B45A',
}
LW = 4.2                 # outline in body units (viewBox 256)
HEAD_SCALE = 0.52        # head box side / body h
HK = HEAD_SCALE * 256 / 192   # body units per head unit (0.693)
LWH = round(LW / HK, 2)  # head outline in head units so it matches the body outline on screen
FEET, SOCKET, SHOULDER, TAIL = (128, 244), (128, 118), (152, 136), (84, 220)
HAND, HANG_TAIL = (128, 18), (84, 200)
JOINT = (96, 172)


def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join('%02X' % round(pa[i] + (pb[i] - pa[i]) * t) for i in range(3))


def svg(w, h, body, defs=''):
    d = f'<defs>{defs}</defs>' if defs else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{d}{body}</svg>\n')


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as fh:
        fh.write(text)


def ell(cx, cy, rx, ry, extra=''):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" {extra}/>'


def circ(cx, cy, r, extra=''):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {extra}/>'


def path(d, extra=''):
    return f'<path d="{d}" {extra}/>'


def stroke(col, w, fill='none'):
    return f'fill="{fill}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"'


def filled(fill, line, w=LW):
    return f'fill="{fill}" stroke="{line}" stroke-width="{f(w)}" stroke-linejoin="round"'


def poly(pts, close=True):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + (' Z' if close else '')


def union(shapes, fill, line, lw=LW):
    """Outline of the union of several shapes: thick strokes behind, fills on top."""
    g = ''.join(path(d, f'fill="{line}" stroke="{line}" stroke-width="{f(lw * 2)}" stroke-linejoin="round"') for d in shapes)
    g += ''.join(path(d, f'fill="{fill}"') for d in shapes)
    return g


def ell_d(cx, cy, rx, ry):
    return (f'M{f(cx - rx)},{f(cy)} A{f(rx)},{f(ry)} 0 1 0 {f(cx + rx)},{f(cy)} '
            f'A{f(rx)},{f(ry)} 0 1 0 {f(cx - rx)},{f(cy)} Z')


def limb(pts, w, fill, line=G['line'], lw=LW):
    """Chunky round-capped limb through pts (quadratic through the middle points): outline stroke + fill stroke."""
    if len(pts) == 2:
        d = f'M{f(pts[0][0])},{f(pts[0][1])} L{f(pts[1][0])},{f(pts[1][1])}'
    else:
        d = f'M{f(pts[0][0])},{f(pts[0][1])} Q{f(pts[1][0])},{f(pts[1][1])} {f(pts[2][0])},{f(pts[2][1])}'
    return path(d, stroke(line, w + 2 * lw)) + path(d, stroke(fill, w))


def tapered(pts, w0, w1, fill, line, lw, cap_tip=True):
    """Tapered ribbon along a polyline (closed polygon) with a round tip, filled + outlined."""
    n = len(pts)
    L, R = [], []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        tl = math.hypot(tx, ty) or 1
        tx, ty = tx / tl, ty / tl
        w = (w0 + (w1 - w0) * i / (n - 1)) / 2
        L.append((pts[i][0] + ty * w, pts[i][1] - tx * w))
        R.append((pts[i][0] - ty * w, pts[i][1] + tx * w))
    d = poly(L + R[::-1])
    g = path(d, filled(fill, line, lw))
    if cap_tip:
        g += circ(pts[-1][0], pts[-1][1], w1 / 2, filled(fill, line, lw))
        g += circ(pts[-1][0], pts[-1][1], w1 / 2 - lw * 0.5, f'fill="{fill}"')
    return g


def catmull(pts, k=8):
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2 = pts[max(0, i - 1)], pts[i], pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        for j in range(k):
            t = j / k
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 +
                                    (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3) for c in (0, 1)))
    out.append(pts[-1])
    return out


def rounded_star(cx, cy, ro, ri, rr=0.18, rot=-90):
    pts = []
    for i in range(10):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d = ''
    for i in range(10):
        p = pts[i]
        if i % 2 == 0:
            a, b = pts[i - 1], pts[(i + 1) % 10]
            s = (p[0] + (a[0] - p[0]) * rr, p[1] + (a[1] - p[1]) * rr)
            e = (p[0] + (b[0] - p[0]) * rr, p[1] + (b[1] - p[1]) * rr)
            d += ('M' if not d else ' L') + f'{f(s[0])},{f(s[1])} Q{f(p[0])},{f(p[1])} {f(e[0])},{f(e[1])}'
        else:
            d += f' L{f(p[0])},{f(p[1])}'
    return d + ' Z'


def hand(x, y, r, ang=0.0, far=False, grip=False):
    """Peach mitten hand at (x, y), radius r, fingers toward ang (deg)."""
    fill = G['peachSh'] if far else G['peach']
    g = circ(x, y, r, filled(fill, G['line'], LW))
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    # two tiny finger creases near the finger end
    for o in (-0.32, 0.32):
        px, py = x + ca * r * 0.35 - sa * r * o, y + sa * r * 0.35 + ca * r * o
        qx, qy = x + ca * r * 0.95 - sa * r * o * 1.05, y + sa * r * 0.95 + ca * r * o * 1.05
        g += path(f'M{f(px)},{f(py)} L{f(qx)},{f(qy)}', stroke(G['peachLn'], 2.2) + ' opacity="0.8"')
    if grip:
        g += path(f'M{f(x - r * 0.7)},{f(y + r * 0.2)} Q{f(x)},{f(y + r * 0.75)} {f(x + r * 0.7)},{f(y + r * 0.2)}',
                  stroke(G['peachLn'], 2.2) + ' opacity="0.8"')
    return g


def foot(x, y, rx, ry, rot, far=False):
    fill = G['peachSh'] if far else G['peach']
    g = ell(x, y, rx, ry, filled(fill, G['line'], LW) + f' transform="rotate({f(rot)} {f(x)} {f(y)})"')
    # toe creases
    for o in (-0.25, 0.2):
        g += path(f'M{f(x + rx * 0.55)},{f(y + ry * o - 1)} l{f(rx * 0.35)},{f(ry * 0.1)}',
                  stroke(G['peachLn'], 2) + f' opacity="0.7" transform="rotate({f(rot)} {f(x)} {f(y)})"')
    return g


# ======================================================================= BODY (0 0 256 256)
# pear torso, round neck top under the head (socket 128,118), right shoulder on the right edge at (152,136)
TORSO_D = ('M128,112 C145,112 155,122 156,138 C158,156 172,174 177,198 C183,228 164,247 128,247 '
           'C93,247 72,231 78,203 C83,178 99,158 100,138 C101,122 111,112 128,112 Z')


def torso(uid):
    """Torso with cel shade, belly and highlight; identical in every frame (clipPath id = uid + 't')."""
    defs = f'<clipPath id="{uid}t"><path d="{TORSO_D}"/></clipPath>'
    g = path(TORSO_D, filled(G['fur'], G['line'], LW))
    g += f'<g clip-path="url(#{uid}t)">'
    g += path('M160,118 C170,160 186,200 172,236 C160,252 120,256 96,252 C140,244 166,218 160,180 Z', f'fill="{G["shade"]}"')
    g += ell(141, 196, 27, 37, f'fill="{G["peach"]}"')
    g += path('M160,176 C166,200 162,224 146,234 C158,214 160,196 154,180 Z', f'fill="{G["peachSh"]}"')
    g += ell(108, 150, 7, 15, f'fill="{G["furHi"]}" opacity="0.6" transform="rotate(18 108 150)"')
    g += '</g>'
    # belly button + tiny fur notch for the chest
    g += path('M138,206 q3,3 6,0', stroke(G['peachLn'], 2.2) + ' opacity="0.6"')
    return defs, g


def leg(hip, knee, ankle, w, far=False):
    fill = G['shade'] if far else G['fur']
    return limb([hip, knee, ankle], w, fill)


def body_parts(pose, uid):
    defs, tg = torso(uid)
    g = ''
    if pose == 'sit':
        # far leg (behind), torso, near leg, near (left) arm resting on the knee
        g += limb([(150, 226), (190, 202), (204, 232)], 25, G['shade'])
        g += foot(210, 234, 13, 8, 10, far=True)
        g += tg
        g += limb([(112, 232), (176, 220), (194, 240)], 28, G['fur'])
        g += foot(201, 241, 15, 8.5, 4)
        g += limb([(108, 146), (110, 190), (166, 206)], 18, G['fur'])
        g += hand(172, 205, 10.5, 15)
    elif pose == 'hop':
        # crouched jump: knees tucked up, feet under, near arm up and out ("wheee")
        g += limb([(150, 224), (186, 192), (184, 228)], 25, G['shade'])
        g += foot(192, 230, 12, 7.5, -12, far=True)
        g += tg
        g += limb([(114, 230), (172, 200), (166, 236)], 28, G['fur'])
        g += foot(174, 238, 14, 8, -6)
        g += limb([(106, 144), (74, 134), (50, 104)], 18, G['fur'])
        g += hand(46, 98, 10.5, -125)
    elif pose == 'hang':
        # both arms up around the head to the vine (hands stacked on the vine at the hand point)
        g += limb([(150, 138), (204, 70), (134, 12)], 17, G['shade'])
        g += limb([(108, 144), (52, 72), (124, 26)], 18, G['fur'])
        g += limb([(146, 228), (160, 240), (170, 246)], 23, G['shade'])
        g += foot(176, 247, 11, 7, 30, far=True)
        g += tg
        g += limb([(116, 232), (140, 240), (152, 246)], 25, G['fur'])
        g += foot(158, 248, 13, 7.5, 24)
        g += hand(130, 12, 10, -10, far=True, grip=True)
        g += hand(126, 29, 10.5, -10, grip=True)
    elif pose == 'title':
        # hanging below the tail, legs dangling, near hand holding the tail, far arm drawn separately
        g += limb([(146, 228), (160, 242), (170, 250)], 23, G['shade'])
        g += foot(175, 250, 11, 7, 30, far=True)
        g += tg
        g += limb([(116, 232), (140, 242), (150, 250)], 25, G['fur'])
        g += foot(156, 251, 13, 7.5, 24)
    return defs, g


def gen_body():
    for pose in ('sit', 'hop', 'hang'):
        d, g = body_parts(pose, 'b' + pose[:2])
        write(f'characters/lolo_body_{pose}.svg', svg(256, 256, g, d))


# ======================================================================= HEAD (0 0 192 192)
SKULL_D = ell_d(98, 110, 67, 64)
MASK = [ell_d(88, 106, 27, 27), ell_d(132, 102, 23, 24), ell_d(114, 141, 38, 29)]
EYE_N = (90, 106, 11, 14)
EYE_F = (133, 102, 9.5, 13)
TUFT_D = ('M70,62 C64,46 70,30 84,24 C80,34 84,42 92,44 C92,32 100,20 114,20 C106,30 108,42 116,50 '
          'C106,58 84,62 70,62 Z')


def ear(cx, cy, r, far=False):
    fill = G['shade'] if far else G['fur']
    g = circ(cx, cy, r, filled(fill, G['line'], LWH))
    g += circ(cx + (2 if not far else 3), cy + 2, r * 0.58, f'fill="{G["peachSh"] if far else G["peach"]}"')
    if not far:
        g += path(f'M{f(cx - r * 0.25)},{f(cy - r * 0.25)} q{f(r * 0.3)},{f(-r * 0.1)} {f(r * 0.45)},{f(r * 0.2)}',
                  stroke(G['peachSh'], 2.6))
    return g


def leaf_bow(cx, cy, rot):
    """Small cyan-teal leaf bow: two leaf loops and a round knot, on the near ear."""
    def leaf(a, L, W):
        return (f'M0,0 C{f(W)},{f(-W * 0.9)} {f(L * 0.8)},{f(-W)} {f(L)},0 C{f(L * 0.8)},{f(W)} {f(W)},{f(W * 0.9)} 0,0 Z',
                f'rotate({f(a)})')
    g = f'<g transform="translate({f(cx)},{f(cy)}) rotate({f(rot)})">'
    for a, L, W in ((-160, 29, 12), (-20, 29, 12), (110, 13, 6)):
        d, t = leaf(a, L, W)
        g += path(d, filled(G['bow'], G['bowDk'], 3.4) + f' transform="{t}"')
        g += path(f'M3,0 L{f(L * 0.8)},0', stroke(G['bowDk'], 2) + f' opacity="0.7" transform="{t}"')
    g += path('M-12,-3 C-8,-6 -4,-6 -2,-5', stroke(G['bowHi'], 2.4) + ' transform="rotate(-160) translate(-10,0) rotate(160)"')
    g += circ(0, 0, 5.6, filled(G['bow'], G['bowDk'], 3.2))
    g += circ(-1.5, -1.6, 1.8, f'fill="{G["bowHi"]}"')
    g += '</g>'
    return g


def eye_open(e, look=(1.5, -1.0), wide=1.0):
    cx, cy, rx, ry = e
    rx, ry = rx * wide, ry * wide
    px, py = cx + look[0], cy + look[1]
    g = ell(px, py, rx, ry, f'fill="{G["eye"]}"')
    g += ell(px - rx * 0.3, py - ry * 0.36, rx * 0.42, ry * 0.32, f'fill="{G["white"]}"')
    g += circ(px + rx * 0.38, py + ry * 0.42, rx * 0.17, f'fill="{G["white"]}" opacity="0.9"')
    return g


def eye_closed(e, kind):
    cx, cy, rx, ry = e
    w = rx * 1.1
    if kind == 'happy':   # ^ ^
        d = f'M{f(cx - w)},{f(cy + 5)} Q{f(cx)},{f(cy - 13)} {f(cx + w)},{f(cy + 5)}'
    else:                 # closed lids (gentle down curve)
        d = f'M{f(cx - w)},{f(cy + 1)} Q{f(cx)},{f(cy + 9)} {f(cx + w)},{f(cy + 1)}'
    return path(d, stroke(G['eye'], 5.2))


def brow(e, up=0.0, tilt=0.0):
    cx, cy, rx, ry = e
    y = cy - ry - 7 - up
    hw = rx * 0.8
    return path(f'M{f(cx - hw)},{f(y + tilt)} Q{f(cx)},{f(y - 4)} {f(cx + hw)},{f(y - tilt)}', stroke(G['shade'], 3.6))


def nose():
    return (ell(115, 127, 3.2, 2.4, f'fill="{G["line"]}"') + ell(126, 126, 2.8, 2.2, f'fill="{G["line"]}"'))


def mouth(kind):
    ln = G['mouth']
    if kind == 'smile':
        return path('M106,141 Q119,152 134,140', stroke(ln, 3.8))
    if kind == 'talk':
        return (ell(120, 147, 8.5, 9.5, filled(G['mouth'], ln, 3.4)) + ell(120, 152, 5.5, 3.4, f'fill="{G["tongue"]}"'))
    if kind == 'big':     # happy: open D smile
        d = 'M102,138 C106,163 136,163 140,136 C127,141 114,141 102,138 Z'
        return (path(d, filled(G['mouth'], ln, 3.6)) +
                path('M110,153 C115,147 128,147 133,151 C127,158 116,159 110,153 Z', f'fill="{G["tongue"]}"'))
    if kind == 'cheer':   # wide open laugh
        d = 'M100,136 C100,168 140,168 142,134 C128,140 113,140 100,136 Z'
        return (path(d, filled(G['mouth'], ln, 3.6)) +
                path('M108,156 C114,148 129,148 135,154 C128,162 115,163 108,156 Z', f'fill="{G["tongue"]}"'))
    if kind == 'hmm':     # mouth pushed to one side
        return path('M116,147 Q127,149 136,141', stroke(ln, 3.8))
    if kind == 'o':       # gentle "hm?" — small round o, a tiny bit lopsided
        return ell(122, 147, 5.2, 5.8, filled(G['mouth'], ln, 3.2))
    return ''


def cheeks(k=1.0):
    return (ell(84, 136, 10 * k, 6.5 * k, f'fill="{G["cheek"]}" opacity="0.9"') +
            ell(147, 130, 7 * k, 5 * k, f'fill="{G["cheek"]}" opacity="0.85"'))


def head_parts(face, uid, cheek=1.0):
    defs = (f'<clipPath id="{uid}s"><path d="{SKULL_D}"/></clipPath>'
            f'<clipPath id="{uid}m">' + ''.join(f'<path d="{d}"/>' for d in MASK) + '</clipPath>')
    g = ''
    g += ear(164, 94, 19, far=True)
    g += path(TUFT_D, filled(G['fur'], G['line'], LWH))
    g += path('M84,30 C80,40 84,48 94,52 M112,24 C104,34 106,44 114,52', stroke(G['shade'], 3) + ' opacity="0.7"')
    g += ear(29, 110, 26)
    g += path(SKULL_D, filled(G['fur'], G['line'], LWH))
    g += f'<g clip-path="url(#{uid}s)">'
    g += path('M168,92 C170,150 130,184 60,178 L60,196 L196,196 L196,92 Z', f'fill="{G["shade"]}"')
    g += ell(64, 74, 16, 9, f'fill="{G["furHi"]}" opacity="0.75" transform="rotate(-38 64 74)"')
    g += '</g>'
    # the tuft's lower edge re-drawn on the skull so the hair reads as one lock
    g += path('M72,58 C84,62 104,58 116,50', stroke(G['line'], LWH * 0.8) + ' opacity="0.0"')
    # peach face mask (one peanut-heart shape: two eye lobes + muzzle)
    g += f'<g clip-path="url(#{uid}s)">'
    g += ''.join(path(d, f'fill="{G["line"]}" stroke="{G["line"]}" stroke-width="{f(LWH * 1.6)}" stroke-linejoin="round"')
                 for d in MASK)
    g += ''.join(path(d, f'fill="{G["peach"]}"') for d in MASK)
    g += '</g>'
    g += f'<g clip-path="url(#{uid}m)">'
    g += path('M150,96 C160,130 140,168 96,176 L196,196 L196,90 Z', f'fill="{G["peachSh"]}"')
    g += ell(80, 92, 9, 5, f'fill="#FFFFFF" opacity="0.35" transform="rotate(-30 80 92)"')
    g += '</g>'
    g += leaf_bow(22, 86, -24)
    g += cheeks(cheek)
    g += nose()
    g += face
    return defs, g


HEAD_POSES = {
    'idle':  (eye_open(EYE_N) + eye_open(EYE_F) + mouth('smile'), 1.0),
    'blink': (eye_closed(EYE_N, 'blink') + eye_closed(EYE_F, 'blink') + mouth('smile'), 1.0),
    'talk':  (eye_open(EYE_N) + eye_open(EYE_F) + mouth('talk'), 1.0),
    'happy': (eye_open(EYE_N, (1.5, -1), 1.06) + eye_open(EYE_F, (1.5, -1), 1.06) + mouth('big'), 1.2),
    'cheer': (eye_closed(EYE_N, 'happy') + eye_closed(EYE_F, 'happy') + mouth('cheer'), 1.3),
    'think': (eye_open(EYE_N, (3, -5)) + eye_open(EYE_F, (3, -5)) + brow(EYE_F, 2, 2) + mouth('hmm'), 1.0),
    'oops':  (eye_open(EYE_N, (0.5, 0), 1.08) + eye_open(EYE_F, (0.5, 0), 1.08) + brow(EYE_N, 3, 1.5) +
              brow(EYE_F, 6, -2.5) + mouth('o'), 1.0),
}


def gen_head():
    for name, (face, ck) in HEAD_POSES.items():
        d, g = head_parts(face, 'h' + name[:2], ck)
        write(f'characters/lolo_head_{name}.svg', svg(192, 192, g, d))


# ======================================================================= TAIL + ARM (python ports of lolo_art.js)
def tail_points(x, y, s, phase, side=-1, hang=False, n=28):
    """Centre line of the curly tail (same maths as LL.LoloArt.drawTail). s = px per body unit."""
    L = (150 if hang else 176) * s
    th = (math.pi / 2 + 0.55) if hang else (math.pi - 0.18)
    pts = [(x, y)]
    ds = L / n
    for i in range(1, n + 1):
        t = i / n
        if hang:
            k = -0.3 + 11.0 * t ** 4 + 0.35 * math.sin(phase - 3 * t) * t
        else:
            k = 1.35 + 9.0 * t ** 4 + 0.45 * math.sin(phase - 2.6 * t) * t
        th += k / n
        x += math.cos(th) * ds
        y += math.sin(th) * ds
        pts.append((x, y))
    if side > 0:
        x0 = pts[0][0]
        pts = [(2 * x0 - px, py) for px, py in pts]
    return pts


def tail_svg(pts, s):
    return tapered(pts, 13 * s, 7.5 * s, G['fur'], G['line'], LW * s)


def arm_svg(sx, sy, ang, ln, s, point=False):
    """Code arm (as LL.LoloArt.drawArm) in body units × s."""
    dx, dy = math.cos(ang), math.sin(ang)
    nx, ny = -dy, dx
    if ny < -0.3:
        nx, ny = -nx, -ny
    up = max(0.0, min(1.0, (-dy - 0.45) / 0.5))
    bend = 0.14 * ln * (1 + 1.3 * up)
    ex, ey = sx + dx * ln * 0.5 + nx * bend * 2, sy + dy * ln * 0.5 + ny * bend * 2
    hx, hy = sx + dx * ln, sy + dy * ln
    g = limb([(sx, sy), (ex, ey), (hx, hy)], 18 * s, G['fur'], lw=LW * s)
    r = 10.5 * s
    if point:
        fx, fy = hx + dx * r * 1.45, hy + dy * r * 1.45
        g += path(f'M{f(hx)},{f(hy)} L{f(fx)},{f(fy)}', stroke(G['line'], r * 0.62 + 2 * LW * s))
        g += path(f'M{f(hx)},{f(hy)} L{f(fx)},{f(fy)}', stroke(G['peach'], r * 0.62))
    g += hand(hx, hy, r, math.degrees(ang))
    return g


# ======================================================================= TITLE (0 0 320 480)
def vine_svg(d, w=9):
    return (path(d, stroke(G['vineDk'], w + 5)) + path(d, stroke(G['vine'], w)) +
            path(d, stroke(G['vineHi'], w * 0.28) + ' opacity="0.8" transform="translate(-1,-2)"'))


def vine_leaf(x, y, L, rot, col='#4CA05E', dk='#2E6E3E'):
    d = f'M0,0 C{f(L * 0.3)},{f(-L * 0.35)} {f(L * 0.8)},{f(-L * 0.3)} {f(L)},0 C{f(L * 0.8)},{f(L * 0.3)} {f(L * 0.3)},{f(L * 0.35)} 0,0 Z'
    return (f'<g transform="translate({f(x)},{f(y)}) rotate({f(rot)})">' + path(d, filled(col, dk, 3)) +
            path(f'M2,0 L{f(L * 0.85)},0', stroke(dk, 1.8) + ' opacity="0.6"') + '</g>')


def head_group(face, uid, cx, cy, scale, rot=0.0):
    """Head svg content placed with its joint at (cx, cy), scale = px per head unit."""
    d, g = head_parts(face, uid)
    return d, (f'<g transform="translate({f(cx)},{f(cy)}) rotate({f(rot)}) scale({f(scale)}) '
               f'translate({-JOINT[0]},{-JOINT[1]})">{g}</g>')


def gen_title():
    s = 1.05                               # px per body unit
    ox, oy = 160 - 128 * s, 240 - 118 * s  # body box origin (socket at 160,240)
    vine = 'M-10,50 Q170,118 330,40'
    defs, body = body_parts('title', 'tt')
    hd, head = head_group(face_title(), 'th', 160, 240, HK * s, -6)
    g = vine_svg(vine)
    g += vine_leaf(40, 66, 30, 130) + vine_leaf(286, 58, 34, 40, '#5BAE62') + vine_leaf(258, 64, 24, -30)
    # tail from the root up behind her, over the vine and wrapping back round it in front
    W = lambda bx, by: (ox + bx * s, oy + by * s)
    tp = catmull([W(84, 210), W(40, 196), W(16, 140), W(24, 70), W(60, 14), W(104, -22), W(134, -48),
                  W(158, -40), W(156, -14), W(136, -8), W(128, -22)], 8)
    g += tapered(tp, 13 * s, 8 * s, G['fur'], G['line'], LW * s)
    g += f'<g transform="translate({f(ox)},{f(oy)}) scale({f(s)})">{body}</g>'
    # near arm down-left holding the tail, far arm waving
    g += limb([W(108, 146), W(64, 150), W(26, 126)], 18 * s, G['fur'], lw=LW * s)
    g += head
    sh = W(152, 136)
    g += arm_svg(sh[0], sh[1], -0.95, 92 * s, s, point=False)
    hx, hy = sh[0] + math.cos(-0.95) * 92 * s, sh[1] + math.sin(-0.95) * 92 * s
    # little wave motion marks
    g += path(f'M{f(hx + 16)},{f(hy - 18)} q8,6 4,16 M{f(hx + 24)},{f(hy - 26)} q12,10 6,26',
              stroke('#FFFFFF', 3.4) + ' opacity="0.85"')
    hx2, hy2 = W(22, 124)
    g += hand(hx2, hy2, 10.5 * s, -150, grip=True)
    write('characters/lolo_title.svg', svg(320, 480, g, defs + hd))


def face_title():
    return eye_open(EYE_N, (1.5, -1), 1.06) + eye_open(EYE_F, (1.5, -1), 1.06) + mouth('big')


# ======================================================================= TOUCAN (0 0 128 128)
T = {'body': '#2D3A5C', 'bodyHi': '#45557E', 'line': '#18203A', 'bib': '#FFF1C9', 'bibSh': '#F1DCA6',
     'beak': '#FFC23D', 'beakTip': '#FF8A3D', 'beakLn': '#B9661E', 'ring': '#7FD3F2', 'ringLn': '#3B8FB8',
     'feet': '#7E8AA6', 'tail': '#243050', 'red': '#E8604F'}


def toucan(flap):
    lw = 3.2
    g = ''
    # tail feathers (behind)
    g += path('M40,82 C26,92 18,104 16,114 C26,112 36,104 46,92 Z', filled(T['tail'], T['line'], lw))
    # feet
    for x in (58, 70):
        g += path(f'M{x},104 L{x},118 M{x - 5},120 L{x},117 L{x + 5},120', stroke(T['feet'], 3.6))
    wing_back = ''
    if flap:
        wing_back = path('M50,62 C40,40 30,24 18,16 C24,34 30,52 44,72 Z', filled(T['tail'], T['line'], lw))
    g += wing_back
    # round body
    g += ell(60, 78, 30, 30, filled(T['body'], T['line'], lw))
    # cream bib
    g += path('M74,52 C92,58 94,84 80,98 C70,104 60,100 58,92 C66,82 66,64 74,52 Z', f'fill="{T["bib"]}"')
    g += path('M84,70 C90,84 86,94 78,99 C84,90 86,80 82,70 Z', f'fill="{T["bibSh"]}"')
    g += path('M62,96 C68,102 76,104 82,98', stroke(T['red'], 3.2) + ' opacity="0.9"')
    # head
    g += circ(72, 46, 20, filled(T['body'], T['line'], lw))
    g += path('M76,32 C88,30 94,42 90,54 C84,58 74,56 72,48 C70,40 72,34 76,32 Z', f'fill="{T["bib"]}"')
    # big rounded beak
    beak = 'M84,36 C100,30 118,36 122,52 C123,60 118,64 112,60 C104,56 94,56 86,58 C80,52 80,42 84,36 Z'
    g += path(beak, filled(T['beak'], T['beakLn'], lw))
    g += path('M112,40 C120,44 123,52 122,56 C118,62 112,60 108,56 C112,52 114,46 112,40 Z', f'fill="{T["beakTip"]}"')
    g += path('M86,50 C96,48 108,50 118,56', stroke(T['beakLn'], 2.2) + ' opacity="0.7"')
    g += ell(94, 40, 6, 2.6, 'fill="#FFFFFF" opacity="0.6" transform="rotate(-14 94 40)"')
    # eye with blue ring + catch-light
    g += circ(76, 42, 7.5, filled(T['ring'], T['ringLn'], 2.2))
    g += circ(77, 42, 4.4, f'fill="{G["eye"]}"')
    g += circ(75.4, 40.2, 1.7, 'fill="#FFFFFF"')
    g += ell(68, 52, 4, 2.6, f'fill="{G["cheek"]}" opacity="0.75"')
    # near wing
    if flap:
        g += path('M58,66 C52,42 46,22 36,10 C52,18 66,38 70,62 C68,70 62,72 58,66 Z', filled(T['bodyHi'], T['line'], lw))
        g += path('M48,26 C54,36 58,46 62,58 M42,18 C48,26 52,34 56,44', stroke(T['line'], 2) + ' opacity="0.5"')
    else:
        g += path('M40,72 C42,60 56,58 66,66 C72,78 66,94 50,98 C40,94 36,82 40,72 Z', filled(T['bodyHi'], T['line'], lw))
        g += path('M48,80 C52,86 56,90 62,90 M46,88 C50,92 54,94 58,94', stroke(T['line'], 2) + ' opacity="0.5"')
    g += ell(46, 64, 6, 3.5, 'fill="#FFFFFF" opacity="0.18" transform="rotate(-40 46 64)"')
    return g


def gen_toucan():
    write('characters/toucan.svg', svg(128, 128, toucan(False)))
    write('characters/toucan_flap.svg', svg(128, 128, toucan(True)))


# ======================================================================= FROG (0 0 128 128)
F = {'skin': '#7CCB5A', 'shade': '#5FAE43', 'line': '#3D7A2C', 'hi': '#A8E08A', 'belly': '#F4F1C8',
     'bellySh': '#E4DFA8', 'toe': '#FF9F45', 'toeLn': '#C4650C', 'mouth': '#3D7A2C'}


def frog_toe_pads(pts, r=4.6):
    return ''.join(circ(x, y, r, filled(F['toe'], F['toeLn'], 2.2)) for x, y in pts)


def frog(jump):
    lw = 3.4
    g = ''
    if not jump:
        # folded back leg (big haunch) + feet on the ground
        g += ell(40, 96, 20, 16, filled(F['shade'], F['line'], lw))
        g += path('M28,112 C38,108 54,108 62,114', stroke(F['line'], 10)) + path('M28,112 C38,108 54,108 62,114', stroke(F['shade'], 4))
        g += frog_toe_pads([(24, 114), (31, 117), (38, 118)])
        body = ell(64, 86, 34, 28, filled(F['skin'], F['line'], lw))
        g += body
        g += ell(70, 96, 20, 15, f'fill="{F["belly"]}"')
        g += ell(40, 96, 17, 13, filled(F['skin'], F['line'], lw))
        # front legs
        g += limb([(80, 100), (86, 110), (86, 114)], 7, F['skin'], F['line'], 3)
        g += limb([(60, 104), (62, 112), (60, 115)], 7, F['skin'], F['line'], 3)
        g += frog_toe_pads([(82, 117), (88, 117), (94, 116), (55, 117), (61, 118)], 3.8)
        g += frog_toe_pads([(20, 112), (27, 116), (34, 118)])
        top = 0
    else:
        # stretched: back legs straight out behind and down, front arms reaching forward
        g += limb([(44, 88), (24, 102), (8, 112)], 10, F['shade'], F['line'], 3.2)
        g += limb([(50, 94), (34, 110), (20, 122)], 11, F['skin'], F['line'], 3.2)
        g += frog_toe_pads([(4, 110), (6, 116), (11, 117), (16, 122), (18, 127), (24, 125)], 3.8)
        g += ell(64, 80, 32, 25, filled(F['skin'], F['line'], lw) + ' transform="rotate(-12 64 80)"')
        g += ell(72, 88, 18, 12, f'fill="{F["belly"]}" transform="rotate(-12 72 88)"')
        g += limb([(84, 92), (98, 96), (108, 94)], 7, F['skin'], F['line'], 3)
        g += frog_toe_pads([(111, 90), (113, 96), (110, 101)], 3.6)
        top = -8
    # head with two big eye domes
    y0 = 64 + top
    g += ell(74, y0, 30, 20, filled(F['skin'], F['line'], lw))
    for ex, er in ((60, 13), (88, 14)):
        g += circ(ex, y0 - 14, er, filled(F['skin'], F['line'], lw))
    g += ell(74, y0 + 2, 27, 16, f'fill="{F["skin"]}"')   # hide the dome outlines inside the head
    for ex, er in ((60, 10), (88, 11)):
        g += circ(ex, y0 - 14, er, f'fill="#FFFFFF"')
        g += circ(ex + 1.5, y0 - 13, er * 0.62, f'fill="{G["eye"]}"')
        g += circ(ex - 1.5, y0 - 16.5, er * 0.24, 'fill="#FFFFFF"')
    g += ell(56, y0 - 27, 5, 2.4, f'fill="{F["hi"]}" opacity="0.9" transform="rotate(-20 56 {f(y0 - 27)})"')
    # smile + cheeks + nostrils
    g += path(f'M58,{f(y0 + 4)} Q76,{f(y0 + 16)} 94,{f(y0 + 3)}', stroke(F['mouth'], 3.2))
    g += ell(52, y0 + 3, 6, 3.6, f'fill="{G["cheek"]}" opacity="0.85"')
    g += ell(97, y0 + 1, 5, 3.2, f'fill="{G["cheek"]}" opacity="0.85"')
    g += circ(80, y0 - 4, 1.5, f'fill="{F["line"]}"') + circ(87, y0 - 5, 1.5, f'fill="{F["line"]}"')
    # back spots
    g += circ(46, y0 + 16, 3.4, f'fill="{F["shade"]}"') + circ(54, y0 + 22, 2.4, f'fill="{F["shade"]}"')
    return g


def gen_frog():
    write('characters/frog.svg', svg(128, 128, frog(False)))
    write('characters/frog_jump.svg', svg(128, 128, frog(True)))


# ======================================================================= STARS (0 0 64 64)
def gen_stars():
    d = rounded_star(32, 34, 28, 13.5, 0.22)
    g = path(d, filled('#FFD23F', '#C99A12', 4))
    g += path(rounded_star(32, 34, 28, 13.5, 0.22), 'fill="#F2B82A" clip-path="url(#sh)"')
    g += path(rounded_star(29, 31, 13, 6.5, 0.3), 'fill="#FFE98A" opacity="0.9"')
    g += ell(22, 22, 4, 2.4, 'fill="#FFFFFF" opacity="0.8" transform="rotate(-35 22 22)"')
    defs = '<clipPath id="sh"><path d="M32,40 L64,22 L64,64 L0,64 L0,52 Z"/></clipPath>'
    write('ui/star.svg', svg(64, 64, g, defs))
    g = path(d, filled('#E9E6DE', '#A39C90', 4))
    g += path(rounded_star(32, 34, 17, 8, 0.3), 'fill="none" stroke="#CFC9BD" stroke-width="2.4" stroke-linejoin="round"')
    write('ui/star_empty.svg', svg(64, 64, g))


# ======================================================================= ICON (0 0 512 512)
def leaf_d(w, h):
    return (f'M0,{f(-h * 0.42)} C{f(w * 0.18)},{f(-h * 0.56)} {f(w * 0.56)},{f(-h * 0.5)} {f(w * 0.5)},{f(-h * 0.12)} '
            f'C{f(w * 0.46)},{f(h * 0.18)} {f(w * 0.2)},{f(h * 0.38)} 0,{f(h * 0.5)} '
            f'C{f(-w * 0.2)},{f(h * 0.38)} {f(-w * 0.46)},{f(h * 0.18)} {f(-w * 0.5)},{f(-h * 0.12)} '
            f'C{f(-w * 0.56)},{f(-h * 0.5)} {f(-w * 0.18)},{f(-h * 0.56)} 0,{f(-h * 0.42)} Z')


def butterfly(cx, cy, s):
    red, dk = '#E84A4A', '#A8282E'
    g = f'<g transform="translate({f(cx)},{f(cy)}) scale({f(s)})">'
    for sx in (-1, 1):
        g += path(f'M0,-4 C{f(sx * 18)},-34 {f(sx * 52)},-30 {f(sx * 46)},-4 C{f(sx * 42)},8 {f(sx * 16)},6 0,0 Z',
                  filled(red, dk, 4))
        g += path(f'M0,2 C{f(sx * 14)},6 {f(sx * 38)},14 {f(sx * 30)},32 C{f(sx * 20)},42 {f(sx * 6)},26 0,6 Z', filled(red, dk, 4))
        g += circ(sx * 28, -14, 6, 'fill="#FFFFFF" opacity="0.55"')
        g += circ(sx * 18, 20, 4, 'fill="#FFFFFF" opacity="0.45"')
    g += ell(0, 2, 5.5, 18, filled('#5A3A2E', '#3A241C', 3))
    g += path('M-2,-14 C-6,-26 -12,-30 -16,-32 M2,-14 C6,-26 12,-30 16,-32', stroke('#3A241C', 3))
    g += circ(-16, -32, 3, 'fill="#3A241C"') + circ(16, -32, 3, 'fill="#3A241C"')
    g += '</g>'
    return g


def gen_icon():
    defs = ('<linearGradient id="ib" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5DB777"/>'
            '<stop offset="1" stop-color="#2E7D4E"/></linearGradient>'
            '<radialGradient id="ig" cx="0.3" cy="0.25" r="0.7"><stop offset="0" stop-color="#FFF6C8" stop-opacity="0.55"/>'
            '<stop offset="1" stop-color="#FFF6C8" stop-opacity="0"/></radialGradient>')
    g = '<rect x="0" y="0" width="512" height="512" fill="url(#ib)"/>'
    g += '<rect x="0" y="0" width="512" height="512" fill="url(#ig)"/>'
    # background jungle leaves (calm, darker)
    for (x, y, w, h, r, c) in ((40, 470, 220, 300, -40, '#2F7A48'), (480, 80, 200, 260, 140, '#3A8A56'),
                               (470, 500, 240, 300, 30, '#286B40'), (20, 60, 160, 220, -150, '#3E9A5E')):
        g += f'<g transform="translate({x},{y}) rotate({r})">' + path(leaf_d(w, h), f'fill="{c}"') + \
             path(f'M0,{f(-h * 0.4)} L0,{f(h * 0.45)}', stroke(mix(c, '#FFFFFF', 0.25), 5)) + '</g>'
    # a vine across the top with the leaf's stem
    # artwork inset ~8 % on every side (iOS rounded mask); background + vine still bleed to the edges
    g += '<g transform="translate(256,256) scale(0.84) translate(-256,-256)">'
    g += vine_svg('M-120,6 Q260,110 640,0', 14)
    # Lolo's head peeking from behind the leaf (left), joint hidden behind the leaf
    hd, head = head_group(eye_open(EYE_N, (2.5, -1), 1.06) + eye_open(EYE_F, (2.5, -1), 1.06) + mouth('big'),
                          'ic', 168, 404, 1.38, -6)
    defs += hd
    g += head
    # the big flipped leaf: pale underside with the picture
    lx, ly, lwid, lh = 372, 312, 236, 316
    g += path('M372,70 Q374,116 370,158', stroke(G['vineDk'], 12)) + path('M372,70 Q374,116 370,158', stroke(G['vine'], 7))
    g += f'<g transform="translate({lx},{ly}) rotate(8)">'
    g += path(leaf_d(lwid, lh), filled('#F3F6DF', '#9FB57A', 7))
    g += path(leaf_d(lwid * 0.9, lh * 0.9), 'fill="none" stroke="#C9D9A8" stroke-width="8" opacity="0.8"')
    g += path(f'M0,{f(-lh * 0.4)} L0,{f(lh * 0.44)}', stroke('#DCE6C0', 5))
    for k in (-0.2, 0.05, 0.28):
        y = lh * k
        g += path(f'M0,{f(y)} Q{f(lwid * 0.2)},{f(y - 24)} {f(lwid * 0.36)},{f(y - 34)} M0,{f(y)} '
                  f'Q{f(-lwid * 0.2)},{f(y - 24)} {f(-lwid * 0.36)},{f(y - 34)}', stroke('#E3EBCB', 4))
    g += butterfly(0, -4, 1.6)
    g += '</g>'
    # Lolo's hands holding the leaf edge
    g += hand(262, 286, 18, -10)
    g += hand(266, 330, 18, 0)
    # sparkles
    for (x, y, r) in ((450, 210, 12), (470, 250, 6), (260, 120, 8)):
        g += path(f'M{x},{y - r} Q{x},{y} {x + r},{y} Q{x},{y} {x},{y + r} Q{x},{y} {x - r},{y} Q{x},{y} {x},{y - r} Z',
                  'fill="#FFF6C8"')
    g += '</g>'
    write('icon.svg', svg(512, 512, g, defs))


def main():
    # remove leftovers of the giraffe game
    for rel in ('characters/pigeon.svg', 'characters/pigeon_flap.svg', 'characters/lolo_body_stand.svg',
                'characters/lolo_body_walk_a.svg', 'characters/lolo_body_walk_b.svg'):
        p = os.path.join(OUT, rel)
        if os.path.exists(p):
            os.remove(p)
    gen_body()
    gen_head()
    gen_title()
    gen_toucan()
    gen_frog()
    gen_stars()
    gen_icon()


if __name__ == '__main__':
    main()
