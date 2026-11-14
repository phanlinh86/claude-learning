#!/usr/bin/env python3
"""Environment art generator for Tofu's Volcano Melody.

Writes (into game/assets/default/):
  levels/<season>/ground.svg      0 0 960 540, opaque top-down island
  levels/sea.svg                  0 0 240 240, opaque, tiles in x and y
  levels/palette.json
  props/volcano.svg, props/volcano_winter.svg            0 0 240 200
  props/{palm,rock,bush}_<season>.svg
  particles/*.svg

100 % original geometry, Python stdlib only. Usage: python3 tools/art-environment/gen.py
The script also checks the island contract (coast encloses ARENA + 20 px, sea at the
stage edges) and fails loudly if a change breaks it.
"""
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'game', 'assets', 'default'))

SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter']
SEA = '#4cb8c4'          # flat sea colour: ground.svg edges == sea.svg base
SEA_SHALLOW = '#79cfd2'
SEA_FOAM = '#e9f8f4'
ARENA = (40, 92, 920, 512)          # x0, y0, x1, y1
VOL_C = (480, 305)                  # volcano footprint circle centre
VOL_R = 104


# ---------------------------------------------------------------- svg helpers
def f(v):
    s = ('%.1f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def f2(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def svg(w, h, body, defs=''):
    d = '<defs>%s</defs>' % defs if defs else ''
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">'
            '%s%s</svg>\n' % (w, h, w, h, d, ''.join(body)))


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as fh:
        fh.write(text)
    return len(text.encode('utf-8'))


def circle(x, y, r, fill, extra=''):
    return '<circle cx="%s" cy="%s" r="%s" fill="%s"%s/>' % (f2(x), f2(y), f2(r), fill, extra)


def ellipse(x, y, rx, ry, fill, extra=''):
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s"%s/>' % (f2(x), f2(y), f2(rx), f2(ry), fill, extra)


def path(d, fill, extra=''):
    return '<path d="%s" fill="%s"%s/>' % (d, fill, extra)


def stroke(col, w, extra=''):
    return ' stroke="%s" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round"%s' % (col, f2(w), extra)


def rad_grad(gid, stops, cx=0.5, cy=0.5, r=0.5):
    s = ''.join('<stop offset="%s" stop-color="%s" stop-opacity="%s"/>' % (f2(o), c, f2(a)) for o, c, a in stops)
    return '<radialGradient id="%s" cx="%s" cy="%s" r="%s">%s</radialGradient>' % (gid, f2(cx), f2(cy), f2(r), s)


def poly_d(pts, close=True):
    d = 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in pts)
    return d + ('Z' if close else '')


def smooth_d(pts):
    """Closed Catmull-Rom spline through pts as cubic beziers (compact, soft)."""
    n = len(pts)
    out = ['M%s %s' % (f(pts[0][0]), f(pts[0][1]))]
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        out.append('C%s %s %s %s %s %s' % (f(c1[0]), f(c1[1]), f(c2[0]), f(c2[1]), f(p2[0]), f(p2[1])))
    return ''.join(out) + 'Z'


# ---------------------------------------------------------------- island shapes
def rounded_rect_samples(x0, y0, x1, y1, r, step):
    """Points + outward normals along a rounded rect, clockwise (y down)."""
    segs = []
    L = 0
    # (kind, data, length)
    parts = [
        ('line', ((x0 + r, y0), (x1 - r, y0), (0, -1))),
        ('arc', ((x1 - r, y0 + r), -math.pi / 2, 0)),
        ('line', ((x1, y0 + r), (x1, y1 - r), (1, 0))),
        ('arc', ((x1 - r, y1 - r), 0, math.pi / 2)),
        ('line', ((x1 - r, y1), (x0 + r, y1), (0, 1))),
        ('arc', ((x0 + r, y1 - r), math.pi / 2, math.pi)),
        ('line', ((x0, y1 - r), (x0, y0 + r), (-1, 0))),
        ('arc', ((x0 + r, y0 + r), math.pi, 1.5 * math.pi)),
    ]
    for kind, d in parts:
        ln = math.dist(d[0], d[1]) if kind == 'line' else r * (d[2] - d[1])
        segs.append((kind, d, L, ln))
        L += ln
    n = int(L / step)
    out = []
    for i in range(n):
        s = i * L / n
        for kind, d, s0, ln in segs:
            if s0 <= s < s0 + ln or (kind, d) == (segs[-1][0], segs[-1][1]):
                t = (s - s0) / ln if ln else 0
                if kind == 'line':
                    (ax, ay), (bx, by), nrm = d
                    out.append((ax + (bx - ax) * t, ay + (by - ay) * t, nrm[0], nrm[1], s / L))
                else:
                    (cx, cy), a0, a1 = d
                    a = a0 + (a1 - a0) * t
                    out.append((cx + r * math.cos(a), cy + r * math.sin(a), math.cos(a), math.sin(a), s / L))
                break
    return out


def wobble_outline(base, amp_fn, terms):
    """Displace samples outward by amp(x,y,nx,ny) * (0..1 smooth periodic)."""
    gmax = sum(abs(a) for a, k, ph in terms)
    pts = []
    for x, y, nx, ny, u in base:
        g = sum(a * math.sin(2 * math.pi * k * u + ph) for a, k, ph in terms) / gmax
        d = amp_fn(x, y, nx, ny) * (0.5 + 0.5 * g)
        pts.append((x + nx * d, y + ny * d))
    return pts


def point_in_poly(px, py, pts):
    inside = False
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        if (y1 > py) != (y2 > py):
            xi = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
            if px < xi:
                inside = not inside
    return inside


def coast_points():
    # coast base = ARENA offset by 22 (corners rounded r 26: still >= 20 px from ARENA)
    base = rounded_rect_samples(18, 70, 942, 532.5, 22, 8)

    def amp(x, y, nx, ny):
        # room to the stage edge, keeping >= 7 px of flat sea (shallow ring is 4.5 px)
        room = min(x - 0, 960 - x, y - 0, 540 - y) - 8
        top = 14 if ny < -0.5 else 9
        return max(0.0, min(top, room))

    terms = [(1, 3, 0.4), (0.8, 5, 1.9), (0.6, 8, 4.1), (0.35, 13, 2.2)]
    return wobble_outline(base, amp, terms)


def meadow_points():
    base = rounded_rect_samples(36, 88, 924, 516, 10, 14)

    def amp(x, y, nx, ny):
        return 8 if ny < -0.5 else 6

    terms = [(1, 4, 2.0), (0.7, 7, 0.3), (0.5, 11, 5.0), (0.3, 17, 1.0)]
    return wobble_outline(base, amp, terms)


def check_contract(coast, meadow):
    x0, y0, x1, y1 = ARENA
    bad = []
    # points on ARENA offset by 20 px (a rect with r-20 corners) must be inside the coast
    samples = []
    for k in range(0, 101):
        u = k / 100
        samples += [(x0 + (x1 - x0) * u, y0 - 20), (x0 + (x1 - x0) * u, y1 + 20),
                    (x0 - 20, y0 + (y1 - y0) * u), (x1 + 20, y0 + (y1 - y0) * u)]
    for cx, cy in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        for k in range(24):
            a = 2 * math.pi * k / 24
            samples.append((cx + 19.6 * math.cos(a), cy + 19.6 * math.sin(a)))
    for px, py in samples:
        if not point_in_poly(px, py, coast):
            bad.append(('coast', px, py))
    # ARENA must be inside the meadow
    for k in range(0, 201):
        u = k / 200
        for px, py in ((x0 + (x1 - x0) * u, y0), (x0 + (x1 - x0) * u, y1),
                       (x0, y0 + (y1 - y0) * u), (x1, y0 + (y1 - y0) * u)):
            if not point_in_poly(px, py, meadow):
                bad.append(('meadow', px, py))
    # coast must stay >= 7 px from the stage edges
    for x, y in coast:
        if min(x, 960 - x, y, 540 - y) < 7:
            bad.append(('edge', x, y))
    if bad:
        raise SystemExit('island contract broken: %r' % bad[:8])


# ---------------------------------------------------------------- season styles
GROUND = {
    'spring': dict(meadow='#a8cc8c', dk='#98bf7e', lt='#b6d69a', edge='#93b97a', tuft='#8db475',
                   sand='#efdcae', sand_dk='#e1c995', wet='#d9c391',
                   flowers=[('#f4dfe6', '#e9c27c'), ('#f7f2dd', '#e7c873'), ('#e9dcef', '#e6c57d')], nflow=54),
    'summer': dict(meadow='#98c47c', dk='#88b66d', lt='#a7cf8b', edge='#83ae68', tuft='#7ea865',
                   sand='#f1dca4', sand_dk='#e3c98c', wet='#d9c088',
                   flowers=[('#f6f3e4', '#ecc86a')], nflow=28),
    'autumn': dict(meadow='#c9bb7f', dk='#bead73', lt='#d3c78e', edge='#b0a167', tuft='#ab9b62',
                   sand='#ead7a8', sand_dk='#dcc493', wet='#d2bb8b',
                   leaves=['#cf9a64', '#d6b06a', '#bf8f5e', '#c9a36f'], nflow=0),
    'winter': dict(meadow='#cfdbe5', dk='#bfcddb', lt='#dde6ee', edge='#b9c8d6', tuft='#a6b5a8',
                   sand='#ddd6c6', sand_dk='#cec6b4', wet='#c3bba9', nflow=0),
}


def ground_svg(season, coast, meadow):
    st = GROUND[season]
    rnd = random.Random('pvm-ground-' + season)
    coast_d = smooth_d(coast[::3])
    meadow_d = smooth_d(meadow[::2])
    defs = ('<clipPath id="m"><path d="%s"/></clipPath><clipPath id="i"><path d="%s"/></clipPath>' % (meadow_d, coast_d))
    b = [path('M0 0H960V540H0Z', SEA)]
    # shallow water ring + foam on the coast line
    b.append(path(coast_d, st['sand'], stroke(SEA_SHALLOW, 9)))
    # wet sand band just inside the coast (clipped to the island)
    b.append('<path d="%s" fill="none" stroke="%s" stroke-width="10" stroke-opacity="0.6" clip-path="url(#i)"/>'
             % (coast_d, st['wet']))
    b.append(path(coast_d, 'none', stroke(SEA_FOAM, 2.4, ' stroke-opacity="0.9"')))
    # beach details: tiny pebbles / shells on the sand band
    beach = []
    shells = []
    for i in range(0, len(coast), 3):
        x, y = coast[i]
        mx, my = meadow[min(len(meadow) - 1, int(i * len(meadow) / len(coast)))]
        t = rnd.uniform(0.35, 0.75)
        px, py = x + (mx - x) * t, y + (my - y) * t
        if rnd.random() < 0.28:
            beach.append((px, py, rnd.uniform(1.2, 2.2)))
        elif rnd.random() < 0.05:
            shells.append((px, py))
    b.append('<g fill="%s">' % st['sand_dk'] + ''.join(
        '<circle cx="%s" cy="%s" r="%s"/>' % (f(x), f(y), f(r)) for x, y, r in beach) + '</g>')
    for x, y in shells:
        b.append(path('M%s %sq3 -5 6 0z' % (f(x - 3), f(y + 1.5)), '#f6ead3', stroke(st['sand_dk'], 1)))

    # meadow
    b.append(path(meadow_d, st['meadow'], stroke(st['edge'], 3)))
    g = ['<g clip-path="url(#m)">']
    # soft mottling blobs (never in the volcano footprint)
    blobs = []
    tries = 0
    while len(blobs) < 26 and tries < 2000:
        tries += 1
        x, y = rnd.uniform(30, 930), rnd.uniform(80, 525)
        rx, ry = rnd.uniform(40, 95), rnd.uniform(20, 42)
        if math.hypot(x - VOL_C[0], (y - VOL_C[1]) * 1.0) < VOL_R + rx + 6:
            continue
        blobs.append((x, y, rx, ry, rnd.choice([st['lt'], st['dk']])))
    for x, y, rx, ry, c in blobs:
        g.append(ellipse(x, y, rx, ry, c, ' opacity="0.55" transform="rotate(%s %s %s)"'
                         % (f(rnd.uniform(-12, 12)), f(x), f(y))))

    def free(x, y, pad=0):
        if math.hypot(x - VOL_C[0], y - VOL_C[1]) < VOL_R + 8 + pad:
            return False
        return point_in_poly(x, y, meadow)

    # grass tufts
    tufts = []
    n_tuft = 150 if season != 'winter' else 70
    while len(tufts) < n_tuft:
        x, y = rnd.uniform(40, 920), rnd.uniform(92, 515)
        if free(x, y):
            tufts.append((x, y, rnd.uniform(0.8, 1.25)))
    td = ''.join('M%s %sl-%s -%sM%s %sl0 -%sM%s %sl%s -%s' % (
        f(x - 1.5), f(y), f(2.6 * s), f(5.5 * s), f(x), f(y), f(7 * s), f(x + 1.5), f(y), f(2.6 * s), f(5.5 * s))
        for x, y, s in tufts)
    g.append(path(td, 'none', stroke(st['tuft'], 1.6)))

    if season == 'winter':
        # snow drifts: soft lighter mounds with a blue-grey lower rim
        for _ in range(16):
            for _t in range(200):
                x, y = rnd.uniform(60, 900), rnd.uniform(105, 505)
                if free(x, y, 40):
                    break
            w = rnd.uniform(30, 60)
            h = rnd.uniform(7, 12)
            g.append(path('M%s %sQ%s %s %s %sZ' % (f(x - w), f(y), f(x), f(y - 2 * h), f(x + w), f(y)), st['lt']))
            g.append(path('M%s %sQ%s %s %s %s' % (f(x - w * 0.8), f(y + 1), f(x), f(y + 4), f(x + w * 0.8), f(y + 1)),
                          'none', stroke(st['dk'], 2)))
        # sparse frosty sparkles (tiny, low contrast)
        dots = []
        while len(dots) < 60:
            x, y = rnd.uniform(40, 920), rnd.uniform(92, 515)
            if free(x, y):
                dots.append((x, y))
        g.append('<g fill="#eef4f8">' + ''.join('<circle cx="%s" cy="%s" r="1.6"/>' % (f(x), f(y)) for x, y in dots) + '</g>')
    if season == 'autumn':
        leaves = []
        while len(leaves) < 46:
            x, y = rnd.uniform(40, 920), rnd.uniform(92, 515)
            if free(x, y):
                leaves.append((x, y, rnd.uniform(0, 360), rnd.choice(st['leaves'])))
        for x, y, a, c in leaves:
            g.append(path('M%s %sq4.5 -6 0 -12q-4.5 6 0 12z' % (f(x), f(y)), c,
                          ' opacity="0.7" transform="rotate(%s %s %s)"' % (f(a), f(x), f(y - 6))))
    # flowers (pale, tiny, low contrast)
    flowers = []
    while len(flowers) < st['nflow']:
        x, y = rnd.uniform(44, 916), rnd.uniform(96, 510)
        if free(x, y):
            flowers.append((x, y, rnd.choice(st['flowers'])))
    by_col = {}
    for x, y, (pc, cc) in flowers:
        by_col.setdefault(pc, []).append((x, y))
        by_col.setdefault(cc + '_c', []).append((x, y))
    for col, pts in by_col.items():
        if col.endswith('_c'):
            g.append('<g fill="%s">' % col[:-2] + ''.join(
                '<circle cx="%s" cy="%s" r="1"/>' % (f(x), f(y)) for x, y in pts) + '</g>')
        else:
            g.append('<g fill="%s">' % col + ''.join(
                ''.join('<circle cx="%s" cy="%s" r="1.7"/>' % (f(x + 2 * math.cos(a)), f(y + 2 * math.sin(a)))
                        for a in (0.3, 1.55, 2.8, 4.05, 5.3)) for x, y in pts) + '</g>')
    # small flat pebbles
    peb = []
    while len(peb) < 26:
        x, y = rnd.uniform(44, 916), rnd.uniform(96, 510)
        if free(x, y):
            peb.append((x, y, rnd.uniform(2.2, 3.6)))
    g.append('<g fill="%s" opacity="0.8">' % st['dk'] + ''.join(
        '<ellipse cx="%s" cy="%s" rx="%s" ry="%s"/>' % (f(x), f(y), f(r), f(r * 0.65)) for x, y, r in peb) + '</g>')
    g.append('</g>')
    b += g
    return svg(960, 540, b, defs)


# ---------------------------------------------------------------- sea tile
def sea_svg():
    rnd = random.Random('pvm-sea')
    T = 240
    b = [path('M0 0H240V240H0Z', SEA)]
    waves = []
    # jittered grid so the spacing is even and the tile reads as random
    for gy in range(4):
        for gx in range(3):
            x = gx * 80 + rnd.uniform(10, 70) + (40 if gy % 2 else 0)
            y = gy * 60 + rnd.uniform(10, 50)
            w = rnd.uniform(10, 16)
            waves.append((x % T, y % T, w))
    d = []
    for x, y, w in waves:
        for dx in (-T, 0, T):
            for dy in (-T, 0, T):
                xx, yy = x + dx, y + dy
                if -30 < xx < T + 30 and -12 < yy < T + 12:
                    d.append('M%s %sq%s -5 %s 0t%s 0' % (f(xx - w), f(yy), f(w / 2), f(w), f(w)))
    b.append(path(''.join(d), 'none', stroke('#7dd3d8', 2.4, ' stroke-opacity="0.7"')))
    dots = []
    for _ in range(10):
        x, y = rnd.uniform(0, T), rnd.uniform(0, T)
        for dx in (-T, 0, T):
            for dy in (-T, 0, T):
                if -4 < x + dx < T + 4 and -4 < y + dy < T + 4:
                    dots.append((x + dx, y + dy))
    b.append('<g fill="#9fe0e1" opacity="0.6">' + ''.join(
        '<circle cx="%s" cy="%s" r="1.5"/>' % (f(x), f(y)) for x, y in dots) + '</g>')
    return svg(T, T, b)


# ---------------------------------------------------------------- volcano
def volcano_svg(winter):
    sw = 4.4   # ~4 px at 0.9 scale
    ol = '#5b3324'
    body = '#c57552'
    shade = '#a65d41'
    skirt = '#8e5540'
    hi = '#df9a76'
    cone = ('M14 184C40 168 64 122 80 64Q84 54 92 52L148 52Q156 54 160 64'
            'C176 122 200 168 226 184Q232 190 222 193Q120 206 18 193Q8 190 14 184Z')
    defs = ('<clipPath id="c"><path d="%s"/></clipPath>' % cone
            + rad_grad('g', [(0, '#ffe2c2', 1), (0.45, '#ffb48f', 1), (0.8, '#f08a7a', 1), (1, '#b2584a', 1)], 0.5, 0.65, 0.6)
            + rad_grad('h', [(0, '#ffc9a6', 0.55), (1, '#ffc9a6', 0)]))
    b = [ellipse(120, 191, 108, 11, '#2e3a22', ' opacity="0.16"')]
    b.append(path(cone, body, stroke(ol, sw)))
    cl = ['<g clip-path="url(#c)">']
    # right-hand shadow side
    cl.append(path('M130 52C150 110 168 160 240 200L240 0Z', shade))
    # chocolate skirt at the base
    cl.append(path('M0 168Q60 158 120 162Q180 158 240 168L240 210L0 210Z', skirt))
    cl.append(path('M0 168Q60 158 120 162Q180 158 240 168', 'none', stroke('#a06450', 2.4)))
    # soft gullies down the slope
    for d in ('M100 60Q94 96 82 128', 'M144 62Q150 92 160 118'):
        cl.append(path(d, 'none', stroke(shade if 'M100' in d else '#8f4f38', 3, ' stroke-opacity="0.7"')))
    # highlight on the lit left slope
    cl.append(path('M88 66Q80 100 66 132Q74 128 84 104Q92 84 94 66Z', hi, ' opacity="0.85"'))
    if not winter:
        # green patches (moss / grass) on the lower slopes
        for d in ('M14 190Q24 172 44 170Q60 168 66 182Q70 194 40 196Z',
                  'M176 180Q190 168 208 172Q226 178 228 190Q200 198 178 194Z',
                  'M62 150Q70 140 82 144Q88 152 80 158Q68 160 62 150Z',
                  'M164 140Q174 134 182 142Q184 152 172 154Q162 150 164 140Z'):
            cl.append(path(d, '#8fbf6e', stroke('#6a9a50', 2.6)))
        cl.append(path('M22 186Q34 178 48 178', 'none', stroke('#a9d388', 2.4)))
        cl.append(path('M186 182Q198 176 212 180', 'none', stroke('#a9d388', 2.4)))
    else:
        # snow cap with a soft wavy hem, plus snowy base drifts
        cap = ('M70 96C74 84 78 72 82 62Q86 52 94 50L146 50Q154 52 158 62C162 72 166 84 172 98'
               'Q162 92 154 100Q146 92 136 98Q128 90 120 96Q110 90 102 98Q94 92 86 100Q78 92 70 96Z')
        cl.append(path(cap, '#f3f7fb', stroke('#9fb3c4', 2.6)))
        cl.append(path('M130 54Q150 70 162 88Q156 90 152 94Q146 74 128 56Z', '#d7e3ee'))
        for d in ('M4 194Q30 174 60 182Q74 188 70 198Z', 'M172 196Q186 176 214 178Q236 184 238 196Z'):
            cl.append(path(d, '#eef4f9', stroke('#9fb3c4', 2.4)))
    cl.append('</g>')
    b += cl
    b.append(path(cone, 'none', stroke(ol, sw)))
    # crater: rim lip, glowing mouth (soft pink-orange, no flames)
    b.append(ellipse(120, 50, 32, 11, '#7a4433', stroke(ol, sw)))
    b.append(ellipse(120, 51, 25, 7.5, 'url(#g)'))
    b.append(ellipse(120, 44, 34, 12, 'url(#h)'))
    b.append(path('M92 48Q120 40 148 48', 'none', stroke('#e8a283' if not winter else '#ffffff', 2.2, ' stroke-opacity="0.9"')))
    # sleepy happy face
    face = '#4a281c'
    for ex in (98, 142):
        b.append(path('M%s 118Q%s 127 %s 118' % (f(ex - 9), f(ex), f(ex + 9)), 'none', stroke(face, 4)))
    for cx in (84, 156):
        b.append(ellipse(cx, 134, 9, 5.5, '#f2958a', ' opacity="0.75"'))
    b.append(path('M111 134Q120 143 129 134', 'none', stroke(face, 3.6)))
    return svg(240, 200, b, defs)


# ---------------------------------------------------------------- props
def shadow(cx, cy, rx, ry):
    return ellipse(cx, cy, rx, ry, '#2e3a22', ' opacity="0.18"')


PALM = {
    'spring': dict(fr='#86c46e', fr_dk='#68a756', ol='#3f7a3a', rib='#5b9a4b', nuts=False, snow=False, flowers=True),
    'summer': dict(fr='#4fae5a', fr_dk='#3d9449', ol='#2a6a36', rib='#36873f', nuts=True, snow=False, flowers=False),
    'autumn': dict(fr='#a3b356', fr_dk='#8c9a45', ol='#5f6a2c', rib='#7d8a3b', nuts=True, snow=False, flowers=False,
                   gold=('#d3b24e', '#7f6624', '#b0922f')),
    'winter': dict(fr='#5e9a68', fr_dk='#4b8255', ol='#2f5a3a', rib='#447a4e', nuts=False, snow=True, flowers=False),
}


def frond(bx, by, ang, ln, droop, w):
    a = math.radians(ang)
    tx, ty = bx + ln * math.cos(a), by + ln * math.sin(a) + droop
    # control point of the arch: along the direction, lifted (the frond rises, then droops)
    mx, my = bx + 0.55 * ln * math.cos(a), by + 0.55 * ln * math.sin(a) - abs(droop) * 0.35
    dx, dy = tx - bx, ty - by
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    p1 = (mx + nx * w, my + ny * w)
    p2 = (mx - nx * w, my - ny * w)
    leaf = 'M%s %sQ%s %s %s %sQ%s %s %s %sZ' % (f(bx), f(by), f(p1[0]), f(p1[1]), f(tx), f(ty),
                                                f(p2[0]), f(p2[1]), f(bx), f(by))
    rib = 'M%s %sQ%s %s %s %s' % (f(bx), f(by), f(mx), f(my), f(tx), f(ty))

    def q(t, p):   # point on base->p->tip quadratic
        return ((1 - t) ** 2 * bx + 2 * (1 - t) * t * p[0] + t * t * tx,
                (1 - t) ** 2 * by + 2 * (1 - t) * t * p[1] + t * t * ty)
    # feathery leaflet cuts from the midrib to both edges
    cuts = []
    for t in (0.35, 0.55, 0.75):
        m = q(t, (mx, my))
        for p in (p1, p2):
            e = q(t + 0.08, p)
            cuts.append('M%s %sL%s %s' % (f(m[0]), f(m[1]), f(e[0]), f(e[1])))
    up = p1 if p1[1] < p2[1] else p2
    snow = 'M%s %sQ%s %s %s %sQ%s %s %s %sZ' % (f(bx), f(by), f(up[0]), f(up[1]), f(tx), f(ty),
                                                f(mx), f(my), f(bx), f(by))
    return leaf, rib, ''.join(cuts), snow


def palm_svg(season):
    st = PALM[season]
    sw = 4.6
    b = [shadow(60, 146, 26, 5)]
    trunk = 'M50 147Q48 120 56 90Q62 66 65 50L74 51Q72 70 68 92Q62 120 66 147Q58 150 50 147Z'
    b.append(path(trunk, '#b98a5a', stroke('#7a5434', sw)))
    rings = ''.join('M%s %sq5 3 %s -1' % (f(x), f(y), f(w)) for x, y, w in
                    ((52, 136, 13), (53, 122, 12), (55, 108, 11), (58, 94, 10), (61, 80, 10), (64, 66, 9)))
    b.append(path(rings, 'none', stroke('#946a42', 2.4)))
    b.append(path('M55 140Q53 116 60 92', 'none', stroke('#d4a979', 2.4, ' stroke-opacity="0.8"')))
    cx, cy = 67, 46
    back = [(-155, 44, 10, 10), (-25, 44, 10, 10), (-115, 36, -2, 9), (-65, 36, -2, 9)]
    front = [(-90, 30, 0, 8.5), (180, 48, 20, 11), (0, 46, 20, 11), (152, 42, 22, 10), (28, 42, 22, 10),
             (124, 32, 18, 9), (58, 32, 18, 9)]
    gold = st.get('gold')
    for i, (ang, ln, dr, w) in enumerate(back):
        leaf, rib, cuts, snow = frond(cx, cy, ang, ln, dr, w)
        b.append(path(leaf, st['fr_dk'], stroke(st['ol'], sw)))
        b.append(path(cuts, 'none', stroke(st['ol'], 1.6)))
    for i, (ang, ln, dr, w) in enumerate(front):
        leaf, rib, cuts, snow = frond(cx, cy, ang, ln, dr, w)
        g = gold and i in (1, 4, 5)
        fill, ol, rb = (gold[0], gold[1], gold[2]) if g else (st['fr'], st['ol'], st['rib'])
        b.append(path(leaf, fill, stroke(ol, sw)))
        b.append(path(cuts, 'none', stroke(rb, 1.6)))
        b.append(path(rib, 'none', stroke(rb, 2)))
    if st['snow']:
        # soft snow lumps resting on the arch of the side fronds
        for ang, ln, dr, w in front[1:5]:
            a = math.radians(ang)
            px = cx + 0.52 * ln * math.cos(a)
            py = cy + 0.52 * ln * math.sin(a) - 2
            rot = max(-30, min(30, math.degrees(math.atan2(math.sin(a) * 0.4, math.cos(a))) if math.cos(a) > 0
                               else -math.degrees(math.atan2(math.sin(a) * 0.4, -math.cos(a)))))
            b.append(path('M%s %sQ%s %s %s %sQ%s %s %s %sZ' % (f(px - 12), f(py + 2), f(px), f(py - 9), f(px + 12), f(py + 2),
                                                             f(px), f(py + 5), f(px - 12), f(py + 2)),
                          '#f3f7fb', stroke('#9fb3c4', 1.8) + ' transform="rotate(%s %s %s)"' % (f(rot), f(px), f(py))))
    b.append(circle(cx, cy, 7, st['fr_dk'], stroke(st['ol'], 3)))
    if st['snow']:
        b.append(ellipse(cx, cy - 3, 8, 4.5, '#f3f7fb', stroke('#9fb3c4', 1.6)))
    if st['nuts']:
        for nx, ny in ((62, 56), (76, 56), (69, 61)):
            b.append(circle(nx, ny, 6.2, '#7b4a2b', stroke('#4c2b18', 3)))
            b.append(circle(nx - 2, ny - 2, 1.8, '#a7744d'))
    if st['flowers']:
        for fx, fy in ((42, 146), (78, 146)):
            for a in range(5):
                aa = a * 2 * math.pi / 5
                b.append(circle(fx + 3.2 * math.cos(aa), fy - 3 + 3.2 * math.sin(aa), 2.6, '#f6c9d7', stroke('#c98aa0', 1)))
            b.append(circle(fx, fy - 3, 1.8, '#f0c75e'))
    if st['snow']:
        b.append(ellipse(58, 145, 18, 4.5, '#f3f7fb', stroke('#9fb3c4', 1.8)))
    return svg(120, 150, b)


ROCK = {
    'spring': dict(top='moss', moss='#9cc77a', moss_ol='#6f9b55'),
    'summer': dict(top='moss', moss='#80b866', moss_ol='#5a8f47'),
    'autumn': dict(top='leaves', moss='#b5ad62', moss_ol='#8a8445'),
    'winter': dict(top='snow'),
}


def rock_svg(season):
    st = ROCK[season]
    sw = 5.4
    ol = '#7b6149'
    body = '#cdae86'
    shade = '#ae8f6b'
    hi = '#e6d2b2'
    big = 'M14 74Q8 56 18 40Q28 18 50 16Q72 14 82 32Q92 48 86 74Q50 80 14 74Z'
    small = 'M76 76Q74 62 84 58Q94 58 96 68Q98 76 90 78Z'
    defs = '<clipPath id="r"><path d="%s"/></clipPath>' % big
    b = [shadow(52, 76, 44, 5)]
    b.append(path(big, body, stroke(ol, sw)))
    b.append('<g clip-path="url(#r)">')
    b.append(path('M58 16Q90 30 88 76L100 80L100 0Z', shade))
    b.append(path('M8 66Q50 72 92 64L100 90L0 90Z', shade, ' opacity="0.6"'))
    b.append(path('M24 40Q30 26 46 22Q34 32 30 46Z', hi))
    b.append(path('M48 46Q56 50 60 60', 'none', stroke(shade, 2.6)))
    if st['top'] == 'moss':
        b.append(path('M20 36Q30 18 50 17Q68 16 78 28Q66 30 58 26Q48 34 38 30Q30 38 20 36Z', st['moss'],
                      stroke(st['moss_ol'], 2.6)))
    elif st['top'] == 'leaves':
        b.append(path('M24 32Q34 18 50 17Q66 16 76 28Q62 28 50 26Q36 32 24 32Z', st['moss'], stroke(st['moss_ol'], 2.4)))
    else:
        b.append(path('M12 44Q20 18 50 14Q78 14 88 40Q78 34 70 40Q62 32 52 38Q42 32 32 40Q22 36 12 44Z', '#f3f7fb',
                      stroke('#9fb3c4', 2.6)))
        b.append(path('M60 18Q80 22 86 36Q78 32 70 36Q66 26 60 18Z', '#d7e3ee'))
    b.append('</g>')
    b.append(path(big, 'none', stroke(ol, sw)))
    b.append(path(small, shade, stroke(ol, sw - 1)))
    b.append(path('M80 66Q83 61 88 60', 'none', stroke(hi, 2)))
    if st['top'] == 'leaves':
        for x, y, a, c in ((40, 22, 30, '#d18a4a'), (60, 21, -40, '#c9a14e')):
            b.append(path('M%s %sq5 -6 0 -12q-5 6 0 12z' % (f(x), f(y + 6)), c,
                          stroke('#8f5a2c', 1.4) + ' transform="rotate(%s %s %s)"' % (f(a), f(x), f(y))))
    if season == 'winter':
        b.append(path('M77 62Q84 54 93 60Q90 62 86 61Q80 63 77 62Z', '#f3f7fb', stroke('#9fb3c4', 1.6)))
    return svg(100, 80, b, defs)


BUSH = {
    'spring': dict(c='#86c26c', dk='#6ca657', ol='#447a3a', hi='#a3d488', bloom=('#f7c8d8', '#e79bb4', '#f0c75e', 9)),
    'summer': dict(c='#56a95c', dk='#43904b', ol='#2b6634', hi='#73c074', bloom=('#fbf6e6', '#d8cfb0', '#efc75a', 5)),
    'autumn': dict(c='#de9a50', dk='#c27b3c', ol='#8a5226', hi='#efb871', bloom=None),
    'winter': dict(c='#558f63', dk='#457a52', ol='#2c5638', hi='#6ea67a', bloom=None),
}


def bush_svg(season):
    st = BUSH[season]
    sw = 4.8
    lobes = [(28, 54, 20), (50, 44, 25), (72, 54, 20), (40, 62, 18), (62, 62, 18), (50, 66, 16)]
    b = [shadow(50, 77, 42, 5)]
    # union outline trick: stroke every lobe, then fill every lobe on top
    b.append('<g fill="%s"%s>' % (st['ol'], stroke(st['ol'], sw * 2)) +
             ''.join(circle(x, y, r, st['ol']) for x, y, r in lobes) + '</g>')
    b.append(''.join(circle(x, y, r, st['c']) for x, y, r in lobes))
    clip = ''.join('<circle cx="%s" cy="%s" r="%s"/>' % (x, y, r) for x, y, r in lobes)
    defs = '<clipPath id="b">%s</clipPath>' % clip
    b.append('<g clip-path="url(#b)">')
    b.append(path('M0 62Q50 76 100 60L100 90L0 90Z', st['dk']))
    b.append(path('M54 30Q80 36 94 56L100 0Z', st['dk'], ' opacity="0.55"'))
    for x, y, r in ((40, 34, 7), (24, 44, 5), (60, 30, 4)):
        b.append(ellipse(x, y, r, r * 0.7, st['hi']))
    # leafy inner arcs
    b.append(path('M20 60q5 -5 10 -1M60 48q6 -4 10 1M44 72q6 -5 12 -1M72 66q4 -4 8 0', 'none', stroke(st['dk'], 2.2)))
    if season == 'winter':
        b.append(path('M8 50Q14 30 30 32Q36 18 50 18Q66 18 72 32Q88 30 92 50Q84 44 76 48Q70 40 62 44Q54 36 46 42'
                      'Q38 36 32 44Q24 40 18 48Q12 44 8 50Z', '#f3f7fb', stroke('#9fb3c4', 2.4)))
    b.append('</g>')
    if season == 'autumn':
        for x, y, a, c in ((26, 50, 20, '#b8582f'), (60, 32, -30, '#c27a3a'), (76, 58, 60, '#b8582f'), (44, 66, -70, '#c27a3a')):
            b.append(path('M%s %sq4 -5 0 -10q-4 5 0 10z' % (f(x), f(y + 5)), c,
                          stroke(st['ol'], 1.2) + ' transform="rotate(%s %s %s)"' % (f(a), f(x), f(y))))
    if st['bloom']:
        pc, po, cc, n = st['bloom']
        rnd = random.Random('bush-' + season)
        spots = [(34, 40), (58, 34), (70, 50), (44, 56), (24, 54), (62, 64), (48, 42), (80, 58), (36, 68)][:n]
        for x, y in spots:
            x += rnd.uniform(-2, 2)
            y += rnd.uniform(-2, 2)
            for a in range(5):
                aa = a * 2 * math.pi / 5 + 0.3
                b.append(circle(x + 3 * math.cos(aa), y + 3 * math.sin(aa), 2.5, pc, stroke(po, 0.9)))
            b.append(circle(x, y, 1.6, cc))
    # lift the bush 8 units (the shadow stays on the ground) so the bottom outline is never cut by the viewBox
    b = [b[0], '<g transform="translate(0,-8)">'] + b[1:] + ['</g>']
    return svg(100, 80, b, defs)


# ---------------------------------------------------------------- particles
def particles():
    out = {}
    out['blossom'] = svg(20, 20, [
        path('M8.6 2.6Q10 4.4 11.4 2.6C16 5 16.5 12.5 10 18C3.5 12.5 4 5 8.6 2.6Z', '#f8c3d3', stroke('#e08aa6', 1.3)),
        path('M10 16Q9 11 10 8', 'none', stroke('#f2a3bb', 1)),
        ellipse(7.5, 8, 1.6, 2.6, '#fde3ec')])
    wings = ''.join([
        path('M12 10C8 2 2 1 2 6C2 10 6 11 12 10Z', '#fbe7a0', stroke('#c99a3c', 1.3)),
        path('M12 10C16 2 22 1 22 6C22 10 18 11 12 10Z', '#fbe7a0', stroke('#c99a3c', 1.3)),
        path('M12 10C8 12 4 16 6 18C8 19 11 15 12 10Z', '#f6d27a', stroke('#c99a3c', 1.3)),
        path('M12 10C16 12 20 16 18 18C16 19 13 15 12 10Z', '#f6d27a', stroke('#c99a3c', 1.3)),
        circle(6, 6, 1.4, '#f2a35a'), circle(18, 6, 1.4, '#f2a35a')])
    out['butterfly'] = svg(24, 20, [wings, ellipse(12, 11, 1.4, 5, '#6b4a3a'),
                                    path('M12 6Q10 2 8.5 1.5M12 6Q14 2 15.5 1.5', 'none', stroke('#6b4a3a', 0.9))])
    out['sunmote'] = svg(16, 16, [circle(8, 8, 8, 'url(#s)'), circle(8, 8, 2.2, '#fffbe6')],
                         rad_grad('s', [(0, '#fff6c8', 0.95), (0.45, '#ffe58a', 0.55), (1, '#ffe58a', 0)]))
    out['leaf'] = svg(20, 20, [
        path('M10 19L10 15C6 16 2 14 2 10Q5 10 6 8Q3 5 5 3Q8 4 10 1Q12 4 15 3Q17 5 14 8Q15 10 18 10C18 14 14 16 10 15Z',
             '#e0883e', stroke('#9a4f22', 1.3)),
        path('M10 15L10 5M10 11L6 8M10 11L14 8', 'none', stroke('#b5622a', 1)),
        ellipse(7, 7, 1.4, 2, '#f2ae66')])
    arm = ''.join('M12 12L%s %sM%s %sL%s %sM%s %sL%s %s' % (
        f(12 + 10 * math.cos(a)), f(12 + 10 * math.sin(a)),
        f(12 + 6 * math.cos(a)), f(12 + 6 * math.sin(a)), f(12 + 6 * math.cos(a) + 3 * math.cos(a + 0.9)),
        f(12 + 6 * math.sin(a) + 3 * math.sin(a + 0.9)),
        f(12 + 6 * math.cos(a)), f(12 + 6 * math.sin(a)), f(12 + 6 * math.cos(a) + 3 * math.cos(a - 0.9)),
        f(12 + 6 * math.sin(a) + 3 * math.sin(a - 0.9))) for a in [i * math.pi / 3 - math.pi / 2 for i in range(6)])
    out['snowflake'] = svg(24, 24, [path(arm, 'none', stroke('#a9c4dc', 3.4)), path(arm, 'none', stroke('#ffffff', 1.7)),
                                    circle(12, 12, 2.2, '#ffffff')])
    out['smoke'] = svg(64, 64, [
        circle(32, 32, 30, 'url(#k)'),
        circle(24, 36, 14, '#f6efe6', ' opacity="0.75"'), circle(38, 30, 15, '#f8f2ea', ' opacity="0.8"'),
        circle(32, 40, 12, '#ebe2d8', ' opacity="0.6"'), circle(36, 26, 7, '#ffffff', ' opacity="0.55"')],
        rad_grad('k', [(0, '#efe6dc', 0.7), (0.6, '#e6dcd2', 0.4), (1, '#e6dcd2', 0)]))
    out['dust'] = svg(32, 32, [circle(16, 16, 15, 'url(#d)'), circle(12, 18, 6, '#f1e1bd', ' opacity="0.6"'),
                               circle(19, 15, 6.5, '#f4e7c8', ' opacity="0.6"')],
                      rad_grad('d', [(0, '#e8d3a6', 0.75), (0.6, '#e8d3a6', 0.35), (1, '#e8d3a6', 0)]))
    star = 'M16 1Q18 14 31 16Q18 18 16 31Q14 18 1 16Q14 14 16 1Z'
    out['sparkle'] = svg(32, 32, [circle(16, 16, 9, 'url(#p)'), path(star, '#fff3b0', stroke('#f2c14e', 1.4)),
                                  circle(16, 16, 3, '#ffffff')],
                         rad_grad('p', [(0, '#fff8d0', 0.9), (1, '#fff8d0', 0)]))
    out['spark'] = svg(12, 12, [circle(6, 6, 6, 'url(#q)'), circle(6, 6, 3, '#fff2c4')],
                       rad_grad('q', [(0, '#ffd38a', 1), (0.6, '#ffb26b', 0.6), (1, '#ffb26b', 0)]))
    out['ripple'] = svg(48, 24, [ellipse(24, 12, 21, 9, 'none', stroke('#ffffff', 2.6, ' stroke-opacity="0.8"')),
                                 ellipse(24, 12, 14, 5.5, 'none', stroke('#ffffff', 1.4, ' stroke-opacity="0.45"'))])
    return out


# ---------------------------------------------------------------- palette
PALETTE = {
    'spring': {'banner': '#f28fb0', 'accent': '#7cc46a', 'tint': '#fff0f5', 'tintAlpha': 0.05, 'sea': SEA, 'hud': '#3f6f57'},
    'summer': {'banner': '#f5b335', 'accent': '#2fb3a6', 'tint': '#fff4c8', 'tintAlpha': 0.07, 'sea': SEA, 'hud': '#2f6a5f'},
    'autumn': {'banner': '#e0773a', 'accent': '#c4552d', 'tint': '#ffdcae', 'tintAlpha': 0.07, 'sea': SEA, 'hud': '#6b4a35'},
    'winter': {'banner': '#6fa8dc', 'accent': '#9d8ee0', 'tint': '#e8f1ff', 'tintAlpha': 0.08, 'sea': SEA, 'hud': '#3d5675'},
}


def main():
    coast = coast_points()
    meadow = meadow_points()
    check_contract(coast, meadow)
    sizes = {}
    for s in SEASON_NAMES:
        sizes['levels/%s/ground.svg' % s] = write('levels/%s/ground.svg' % s, ground_svg(s, coast, meadow))
        sizes['props/palm_%s.svg' % s] = write('props/palm_%s.svg' % s, palm_svg(s))
        sizes['props/rock_%s.svg' % s] = write('props/rock_%s.svg' % s, rock_svg(s))
        sizes['props/bush_%s.svg' % s] = write('props/bush_%s.svg' % s, bush_svg(s))
    sizes['levels/sea.svg'] = write('levels/sea.svg', sea_svg())
    sizes['props/volcano.svg'] = write('props/volcano.svg', volcano_svg(False))
    sizes['props/volcano_winter.svg'] = write('props/volcano_winter.svg', volcano_svg(True))
    for k, v in particles().items():
        sizes['particles/%s.svg' % k] = write('particles/%s.svg' % k, v)
    write('levels/palette.json', json.dumps(PALETTE, indent=2) + '\n')
    for k in sorted(sizes):
        print('%7d  %s' % (sizes[k], k))
    for k in sizes:
        if k.endswith('ground.svg') and sizes[k] > 60000:
            raise SystemExit('ground too heavy: %s' % k)


if __name__ == '__main__':
    main()
