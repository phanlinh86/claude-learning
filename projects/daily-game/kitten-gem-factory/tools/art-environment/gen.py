#!/usr/bin/env python3
"""Environment art generator for Comet's Gem Factory.

Writes (into game/assets/default/):
  levels/<season>/outside.svg   0 0 960 540, opaque, tileable
  levels/palette.json
  room/wall.svg                 0 0 1200 540, tileable, transparent windows
  room/floor.svg                0 0 600 70, tileable
  room/gear.svg                 0 0 100 100
  particles/*.svg

100 % original geometry, Python stdlib only. Usage: python3 tools/art-environment/gen.py
Tileability: every wavy outline uses sine terms with whole cycles per tile, and every
object that crosses an edge is also drawn shifted by one tile width.
"""
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'game', 'assets', 'default'))


def f(v):
    """Compact number formatting."""
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


# ---------------------------------------------------------------- helpers
class Wave:
    """Periodic outline y(x) = base + sum a*sin(2pi k x / W + ph), k whole numbers."""

    def __init__(self, W, base, terms):
        self.W, self.base, self.terms = W, base, terms

    def y(self, x):
        return self.base + sum(a * math.sin(2 * math.pi * k * x / self.W + ph) for a, k, ph in self.terms)

    def path(self, bottom, step=8):
        pts = ['M0 %s' % f(bottom)]
        n = int(self.W / step)
        for i in range(n + 1):
            x = i * self.W / n
            pts.append('L%s %s' % (f(x), f(self.y(x))))
        pts.append('L%s %s Z' % (f(self.W), f(bottom)))
        return ''.join(pts)


def wrap(W, x, ext, fn, out):
    """Call fn(x') for every copy of x (x-W, x, x+W) that touches [0, W]."""
    for dx in (-W, 0, W):
        xx = x + dx
        if xx + ext >= 0 and xx - ext <= W:
            out.append(fn(xx))


def lin_grad(gid, stops, x1=0, y1=0, x2=0, y2=1):
    s = ''.join('<stop offset="%s" stop-color="%s"%s/>' % (
        f(o), c, (' stop-opacity="%s"' % f(a)) if a is not None else '')
        for o, c, a in [(t + (None,))[:3] for t in stops])
    return ('<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>'
            % (gid, f(x1), f(y1), f(x2), f(y2), s))


def rad_grad(gid, stops):
    s = ''.join('<stop offset="%s" stop-color="%s" stop-opacity="%s"/>' % (f(o), c, f(a)) for o, c, a in stops)
    return '<radialGradient id="%s" cx="0.5" cy="0.5" r="0.5">%s</radialGradient>' % (gid, s)


def circle(x, y, r, fill, extra=''):
    return '<circle cx="%s" cy="%s" r="%s" fill="%s"%s/>' % (f(x), f(y), f(r), fill, extra)


def ellipse(x, y, rx, ry, fill, extra=''):
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s"%s/>' % (f(x), f(y), f(rx), f(ry), fill, extra)


def rect(x, y, w, h, fill, rx=0, extra=''):
    r = (' rx="%s"' % f(rx)) if rx else ''
    return '<rect x="%s" y="%s" width="%s" height="%s"%s fill="%s"%s/>' % (f(x), f(y), f(w), f(h), r, fill, extra)


def poly(pts, fill, extra=''):
    return '<path d="M%sZ" fill="%s"%s/>' % ('L'.join('%s %s' % (f(a), f(b)) for a, b in pts), fill, extra)


def rrect_path(x, y, w, h, r):
    return ('M%s %sH%sA%s %s 0 0 1 %s %sV%sA%s %s 0 0 1 %s %sH%sA%s %s 0 0 1 %s %sV%sA%s %s 0 0 1 %s %sZ' % (
        f(x + r), f(y), f(x + w - r), f(r), f(r), f(x + w), f(y + r), f(y + h - r), f(r), f(r),
        f(x + w - r), f(y + h), f(x + r), f(r), f(r), f(x), f(y + h - r), f(y + r), f(r), f(r), f(x + r), f(y)))


# ---------------------------------------------------------------- outside
W_OUT = 960

SEASONS = {
    'spring': dict(
        sky=[(0, '#a9d8f0'), (0.55, '#d6ecf5'), (1, '#fbe3ec')],
        far='#b9dcc4', far_hi='#cbe6d2', mid='#93cc9a', mid_hi='#a9d9ac', near='#79bb7e', near_hi='#8ccb8d',
        field='#6cae72', cloud='#ffffff', cloud_sh='#e9eef8',
        roofs=['#e98a8a', '#f0a96b', '#8fb3e0', '#c79ad8'], walls=['#fff4e0', '#fde7d4', '#f2f0e6'],
        win='#9cc8e6', win_glow=False),
    'summer': dict(
        sky=[(0, '#4fa8e8'), (0.6, '#8fd0f4'), (1, '#d4f0fb')],
        far='#8cc79a', far_hi='#9fd3aa', mid='#5fae6a', mid_hi='#71bc78', near='#3f9450', near_hi='#4fa35c',
        field='#3a8a4a', cloud='#ffffff', cloud_sh='#dceaf6',
        roofs=['#e8665a', '#f2a03c', '#4f8fd6', '#e07aa8'], walls=['#fff6df', '#fdeed2', '#f6f3ea'],
        win='#7cc0ec', win_glow=False),
    'autumn': dict(
        sky=[(0, '#8cbad8'), (0.5, '#e8d2b0'), (1, '#f8c98e')],
        far='#d9b98a', far_hi='#e4c79c', mid='#d6a65a', mid_hi='#e2b66c', near='#c08a3e', near_hi='#cf9a4c',
        field='#b97f36', cloud='#fff3e2', cloud_sh='#f2d6b8',
        roofs=['#b8553c', '#8a5a3c', '#5f7fa6', '#9c4f5a'], walls=['#fbe9cf', '#f6dcbc', '#efe4d2'],
        win='#ffd890', win_glow=False),
    'winter': dict(
        sky=[(0, '#2f3570'), (0.45, '#5a5596'), (0.8, '#9a7fb8'), (1, '#d6a9c4')],
        far='#aab4dc', far_hi='#bcc5e6', mid='#c8d0ee', mid_hi='#d9dff4', near='#e4e9f8', near_hi='#f2f5fc',
        field='#dbe2f5', cloud='#c9c2ea', cloud_sh='#a9a2d6',
        roofs=['#7b5a8e', '#5f6aa0', '#8a5f72', '#6f7fa8'], walls=['#c9c3e0', '#d3c8dc', '#c2c8e2'],
        win='#ffcf6e', win_glow=True),
}


def cloud(x, y, s, fill, shade, alpha=0.92):
    parts = [ellipse(x, y + 6 * s, 46 * s, 12 * s, shade),
             circle(x - 24 * s, y, 15 * s, fill), circle(x - 4 * s, y - 9 * s, 21 * s, fill),
             circle(x + 20 * s, y - 2 * s, 16 * s, fill), ellipse(x, y + 4 * s, 44 * s, 11 * s, fill)]
    return '<g opacity="%s">%s</g>' % (f(alpha), ''.join(parts))


def house(x, gy, w, h, wall, roof, win, glow, snow, rnd):
    """A small cottage standing on ground y=gy, centred at x."""
    o = []
    x0 = x - w / 2
    top = gy - h
    o.append(rect(x0, top, w, h + 4, wall))
    o.append(rect(x0, top, w * 0.22, h + 4, '#000', extra=' opacity="0.06"'))
    # chimney (no smoke)
    if rnd.random() < 0.5:
        o.append(rect(x + w * 0.18, top - h * 0.55, w * 0.14, h * 0.4, roof))
        if snow:
            o.append(rect(x + w * 0.16, top - h * 0.6, w * 0.18, 3, '#ffffff'))
    o.append(poly([(x0 - 3, top + 1), (x, top - h * 0.62), (x0 + w + 3, top + 1)], roof))
    if snow:
        o.append(poly([(x0 - 3, top + 1), (x, top - h * 0.62), (x0 + w + 3, top + 1),
                       (x0 + w - 2, top + 3), (x + 2, top - h * 0.42), (x0 + 1, top + 4)], '#f6f8ff'))
    ww = max(3.0, w * 0.2)
    for wx in (x0 + w * 0.2, x0 + w * 0.6):
        if glow:
            o.append(circle(wx + ww / 2, top + h * 0.42, ww * 1.9, '#ffd77e', ' opacity="0.32"'))
        o.append(rect(wx, top + h * 0.3, ww, ww * 1.1, win, rx=1))
    return ''.join(o)


def tree_round(x, gy, s, trunk, leaf, leaf_hi, extra_dots=None):
    o = [rect(x - 2.2 * s, gy - 14 * s, 4.4 * s, 16 * s, trunk, rx=1.5 * s),
         circle(x, gy - 24 * s, 13 * s, leaf), circle(x - 9 * s, gy - 18 * s, 9 * s, leaf),
         circle(x + 9 * s, gy - 18 * s, 9 * s, leaf),
         circle(x - 4 * s, gy - 28 * s, 6 * s, leaf_hi)]
    if extra_dots:
        for dx, dy, c in extra_dots:
            o.append(circle(x + dx * s, gy + dy * s, 2.2 * s, c))
    return ''.join(o)


def tree_pine(x, gy, s, trunk, leaf, snow):
    o = [rect(x - 2 * s, gy - 8 * s, 4 * s, 10 * s, trunk)]
    for i, (yy, ww) in enumerate(((-12, 13), (-22, 10.5), (-31, 7.5))):
        pts = [(x - ww * s, gy + yy * s), (x, gy + (yy - 14) * s), (x + ww * s, gy + yy * s)]
        o.append(poly(pts, leaf))
        if snow:
            o.append(poly([(x - ww * 0.55 * s, gy + (yy - 6) * s), (x, gy + (yy - 14) * s),
                           (x + ww * 0.55 * s, gy + (yy - 6) * s), (x, gy + (yy - 9) * s)], '#f4f7ff'))
    return ''.join(o)


def blossom_tree(x, gy, s):
    o = [poly([(x - 3 * s, gy + 2), (x - 1.5 * s, gy - 22 * s), (x + 1.5 * s, gy - 22 * s), (x + 3 * s, gy + 2)], '#8a6450'),
         poly([(x, gy - 16 * s), (x + 10 * s, gy - 26 * s), (x + 11 * s, gy - 24 * s), (x + 1 * s, gy - 13 * s)], '#8a6450')]
    for dx, dy, r, c in ((0, -32, 14, '#f4b6cc'), (-12, -24, 10, '#f4b6cc'), (12, -26, 11, '#f7c4d6'),
                         (-6, -38, 8, '#f9d2e0'), (6, -36, 7, '#fbdbe7'), (-14, -30, 6, '#f9d2e0')):
        o.append(circle(x + dx * s, gy + dy * s, r * s, c))
    for dx, dy in ((-4, -30), (8, -24), (-10, -22), (3, -40)):
        o.append(circle(x + dx * s, gy + dy * s, 1.6 * s, '#ffffff', ' opacity="0.8"'))
    return ''.join(o)


def sunflower(x, gy, s):
    o = ['<path d="M%s %sQ%s %s %s %s" stroke="#3f8a3c" stroke-width="%s" fill="none" stroke-linecap="round"/>' % (
        f(x), f(gy), f(x + 2 * s), f(gy - 14 * s), f(x), f(gy - 26 * s), f(2.4 * s)),
        ellipse(x + 5 * s, gy - 12 * s, 5 * s, 2.2 * s, '#4fa048', ' transform="rotate(-25 %s %s)"' % (f(x + 5 * s), f(gy - 12 * s)))]
    cy = gy - 28 * s
    for i in range(10):
        a = i * math.pi / 5
        o.append(ellipse(x + math.cos(a) * 6 * s, cy + math.sin(a) * 6 * s, 4 * s, 2.2 * s, '#ffc928',
                         ' transform="rotate(%s %s %s)"' % (f(math.degrees(a)), f(x + math.cos(a) * 6 * s), f(cy + math.sin(a) * 6 * s))))
    o.append(circle(x, cy, 4.6 * s, '#8a5a2a'))
    o.append(circle(x - 1.2 * s, cy - 1.2 * s, 1.6 * s, '#a87440'))
    return ''.join(o)


def candy_chimney(x, gy, h, c1, c2, snow=False):
    o = [rect(x - 7, gy - h, 14, h + 4, c1, rx=2)]
    yy = gy - h + 8
    while yy < gy:
        o.append(rect(x - 7, yy, 14, 5, c2))
        yy += 12
    o.append(rect(x - 9, gy - h - 4, 18, 6, c2, rx=2))
    if snow:
        o.append(rect(x - 9, gy - h - 6, 18, 3, '#f6f8ff', rx=1.5))
    # a little round friendly top light instead of smoke
    o.append(circle(x, gy - h - 8, 3, '#ffe08a'))
    return ''.join(o)


def outside(season):
    P = SEASONS[season]
    W = W_OUT
    rnd = random.Random('outside-' + season)
    defs = lin_grad('sky', P['sky'])
    o = [rect(0, 0, W, 540, 'url(#sky)')]

    # sun / moon / stars
    if season == 'winter':
        for i in range(34):
            sx, sy = rnd.uniform(0, W), rnd.uniform(8, 190)
            r = rnd.choice((0.9, 1.2, 1.5, 2.0))
            def star(xx, sy=sy, r=r):
                if r >= 1.5:
                    return poly([(xx, sy - r * 2.4), (xx + r * 0.6, sy - r * 0.6), (xx + r * 2.4, sy), (xx + r * 0.6, sy + r * 0.6),
                                 (xx, sy + r * 2.4), (xx - r * 0.6, sy + r * 0.6), (xx - r * 2.4, sy), (xx - r * 0.6, sy - r * 0.6)],
                                '#fff6d6', ' opacity="0.9"')
                return circle(xx, sy, r, '#fff6d6', ' opacity="0.75"')
            wrap(W, sx, 6, star, o)
        # crescent moon (cream disc minus a sky-coloured disc)
        o.append(circle(720, 120, 34, '#fff2c4', ' opacity="0.18"'))
        o.append(circle(720, 120, 22, '#fff2c4'))
        o.append(circle(731, 113, 19, '#3d4080'))
    elif season == 'summer':
        o.append(circle(250, 118, 58, '#fff3a8', ' opacity="0.35"'))
        o.append(circle(250, 118, 40, '#ffe25e'))
        o.append(circle(240, 108, 14, '#fff3b0'))
    elif season == 'autumn':
        o.append(circle(640, 170, 70, '#ffd9a0', ' opacity="0.35"'))
        o.append(circle(640, 170, 42, '#ffc46a'))
    else:  # spring: soft morning sun
        o.append(circle(180, 120, 50, '#fff6cf', ' opacity="0.45"'))
        o.append(circle(180, 120, 32, '#ffeeb0'))

    # clouds
    ncl = {'spring': 7, 'summer': 5, 'autumn': 6, 'winter': 4}[season]
    for i in range(ncl):
        cx = (i + rnd.uniform(0.1, 0.9)) * W / ncl
        cy = rnd.uniform(96, 160)
        sun_x = {'spring': 180, 'summer': 250, 'autumn': 640, 'winter': 720}[season]
        if abs(cx - sun_x) < 110:
            cx = sun_x + (130 if cx >= sun_x else -130)
        s = rnd.uniform(0.7, 1.15)
        a = 0.45 if season == 'winter' else 0.92
        wrap(W, cx, 60 * s, lambda xx, cy=cy, s=s, a=a: cloud(xx, cy, s, P['cloud'], P['cloud_sh'], a), o)

    snow = season == 'winter'
    far = Wave(W, 218, [(10, 2, 0.4), (6, 5, 1.7), (3, 9, 0.2)])
    mid = Wave(W, 250, [(12, 3, 2.1), (5, 7, 0.9)])
    near = Wave(W, 284, [(10, 2, 3.3), (6, 4, 0.5), (2.5, 11, 1.1)])

    # far hills + distant candy chimneys
    o.append('<path d="%s" fill="%s"/>' % (far.path(540), P['far']))
    for cx, h in ((120, 46), (138, 34), (560, 40)):
        gy = far.y(cx) + 6
        c2 = {'spring': '#f3b0c0', 'summer': '#f2a2a0', 'autumn': '#d8836a', 'winter': '#c99ab8'}[season]
        wrap(W, cx, 12, lambda xx, gy=gy, h=h, c2=c2: '<g opacity="0.75">%s</g>' % candy_chimney(xx, gy, h, '#f4efe6' if not snow else '#d8d6ea', c2, snow), o)
    # far tree silhouettes
    for i in range(26):
        tx = rnd.uniform(0, W)
        gy = far.y(tx) + 4
        s = rnd.uniform(0.45, 0.65)
        col = P['far_hi'] if season != 'winter' else '#97a3d0'
        if season == 'winter':
            wrap(W, tx, 10, lambda xx, gy=gy, s=s: tree_pine(xx, gy, s, '#8a8fb8', '#8e9ccb', True), o)
        else:
            wrap(W, tx, 10, lambda xx, gy=gy, s=s, col=col: circle(xx, gy - 8 * s, 10 * s, col), o)

    # mid hills + the little town
    o.append('<path d="%s" fill="%s"/>' % (mid.path(540), P['mid']))
    o.append('<path d="%s" fill="%s" opacity="0.5"/>' % (Wave(W, 258, [(12, 3, 2.1), (5, 7, 0.9)]).path(264), P['mid_hi']))
    for tx0 in (300, 760):
        n = 5 if tx0 == 300 else 4
        for j in range(n):
            hx = tx0 + j * 26 + rnd.uniform(-3, 3)
            gy = mid.y(hx) + 6
            w, h = rnd.uniform(18, 24), rnd.uniform(14, 20)
            roof, wall = rnd.choice(P['roofs']), rnd.choice(P['walls'])
            seed = rnd.random()
            wrap(W, hx, 20, lambda xx, gy=gy, w=w, h=h, roof=roof, wall=wall, seed=seed:
                 house(xx, gy, w, h, wall, roof, P['win'], P['win_glow'], snow, random.Random(seed)), o)
    # mid trees
    for i in range(16):
        tx = (i + rnd.uniform(0, 1)) * W / 16
        if any(abs(tx - t) < 70 or abs(tx - t - 60) < 70 for t in (300, 760)):
            continue
        gy = mid.y(tx) + 6
        s = rnd.uniform(0.75, 1.0)
        if season == 'spring':
            fn = lambda xx, gy=gy, s=s: blossom_tree(xx, gy, s * 0.9)
        elif season == 'summer':
            fn = lambda xx, gy=gy, s=s: tree_round(xx, gy, s, '#7a5a3a', '#3f9450', '#58aa60')
        elif season == 'autumn':
            leaf, hi = rnd.choice((('#e0762c', '#f2984a'), ('#c9482e', '#e0683e'), ('#e8a432', '#f6c25a')))
            fn = lambda xx, gy=gy, s=s, leaf=leaf, hi=hi: tree_round(xx, gy, s, '#7a5236', leaf, hi)
        else:
            fn = lambda xx, gy=gy, s=s: tree_pine(xx, gy, s * 1.05, '#6a5a7a', '#5f7aa0', True)
        wrap(W, tx, 24, fn, o)

    # near hill with seasonal foreground
    o.append('<path d="%s" fill="%s"/>' % (near.path(540), P['near']))
    o.append('<path d="%s" fill="%s" opacity="0.6"/>' % (Wave(W, 290, [(10, 2, 3.3), (6, 4, 0.5), (2.5, 11, 1.1)]).path(298), P['near_hi']))
    # soft field stripes below (rarely seen)
    for k, yy in enumerate((340, 390, 450)):
        o.append('<path d="%s" fill="%s" opacity="%s"/>' % (Wave(W, yy, [(6, 2, k * 1.3), (3, 5, k)]).path(540), P['field'], f(0.35 + 0.15 * k)))

    if season == 'spring':
        for i in range(9):
            tx = (i + rnd.uniform(0.1, 0.9)) * W / 9
            gy = near.y(tx) + 10
            wrap(W, tx, 30, lambda xx, gy=gy: blossom_tree(xx, gy, 1.35), o)
        for i in range(60):
            tx = rnd.uniform(0, W)
            gy = near.y(tx) + rnd.uniform(14, 60)
            c = rnd.choice(('#ffffff', '#ffe27a', '#f9c2d6'))
            wrap(W, tx, 4, lambda xx, gy=gy, c=c: circle(xx, gy, 2.2, c), o)
    elif season == 'summer':
        for i in range(30):
            tx = (i + rnd.uniform(0, 1)) * W / 30
            gy = near.y(tx) + rnd.uniform(16, 30)
            s = rnd.uniform(0.95, 1.25)
            wrap(W, tx, 16, lambda xx, gy=gy, s=s: sunflower(xx, gy, s), o)
        for i in range(5):
            tx = (i + 0.5) * W / 5 + 40
            gy = near.y(tx) + 8
            wrap(W, tx, 30, lambda xx, gy=gy: tree_round(xx, gy, 1.5, '#6a4a2e', '#2f7d40', '#4a9a52'), o)
    elif season == 'autumn':
        for i in range(8):
            tx = (i + rnd.uniform(0.1, 0.9)) * W / 8
            gy = near.y(tx) + 10
            leaf, hi = rnd.choice((('#e0762c', '#f2984a'), ('#c9482e', '#e0683e'), ('#e8a432', '#f6c25a')))
            dots = [(rnd.uniform(-12, 12), rnd.uniform(-34, -14), hi) for _ in range(4)]
            wrap(W, tx, 30, lambda xx, gy=gy, leaf=leaf, hi=hi, dots=dots: tree_round(xx, gy, 1.45, '#6e4a30', leaf, hi, dots), o)
        for i in range(14):  # hay bales
            tx = (i + rnd.uniform(0.2, 0.8)) * W / 14
            gy = near.y(tx) + rnd.uniform(22, 50)
            wrap(W, tx, 10, lambda xx, gy=gy: ellipse(xx, gy, 8, 6, '#e8c25a') + ellipse(xx - 2, gy - 1, 3, 3, '#f4d67c'), o)
    else:
        for i in range(10):
            tx = (i + rnd.uniform(0.1, 0.9)) * W / 10
            gy = near.y(tx) + 8
            wrap(W, tx, 24, lambda xx, gy=gy: tree_pine(xx, gy, 1.4, '#6a5a7a', '#4f6f96', True), o)
        # one cozy cottage in front
        for hx in (480,):
            gy = near.y(hx) + 8
            wrap(W, hx, 30, lambda xx, gy=gy: house(xx, gy, 38, 28, '#d6c6de', '#7b5a8e', '#ffcf6e', True, True, random.Random(3)), o)
        for i in range(40):
            tx = rnd.uniform(0, W)
            gy = near.y(tx) + rnd.uniform(16, 70)
            wrap(W, tx, 4, lambda xx, gy=gy: ellipse(xx, gy, 5, 1.6, '#c9d2ee'), o)

    return svg(W, 540, o, defs)


# ---------------------------------------------------------------- wall
W_WALL = 1200
WINDOWS = [(70, 100, 260, 196), (470, 100, 260, 196), (870, 100, 260, 196)]  # x, y, w, h openings
WIN_R = 10
GEARS = [{'x': 36, 'y': 250, 'r': 32}, {'x': 934, 'y': 408, 'r': 40}, {'x': 1062, 'y': 392, 'r': 54}]
VENTS = [{'x': 32, 'y': 318}, {'x': 935, 'y': 330}]

C = dict(cream='#f2e4c4', cream_dk='#e6d4ae', cream_lo='#ead9b6', teal='#7db8af', teal_dk='#5e9a92',
         teal_lo='#a9cdc4', rivet='#d9c49a', rivet_t='#b9dcd5', frame='#5f9e96', frame_dk='#3f7670',
         frame_hi='#8cc4bb', sill='#d99a5b', sill_dk='#b37840', pipe='#e3b05a', pipe_dk='#b7843a',
         pipe_hi='#f4d48e', wood='#d8a56a', wood_dk='#b27e48')


def rivets(xs, y, col, r=2.6):
    return ''.join(circle(x, y, r, col) + circle(x - 0.8, y - 0.8, r * 0.4, '#ffffff', ' opacity="0.5"') for x in xs)


def toy_block(x, y, s, c, letter_c):
    return rect(x, y - s, s, s, c, rx=2) + rect(x + s * 0.25, y - s * 0.75, s * 0.5, s * 0.5, letter_c, rx=1.5)


def toys_on_shelf(cx, sy, rnd):
    """Tiny finished toys standing on a shelf whose top is at y=sy, centred at cx."""
    o = []
    x = cx - 50
    # stacked blocks
    o.append(toy_block(x, sy, 14, '#e98a7a', '#fff1d6'))
    o.append(toy_block(x + 15, sy, 14, '#7fb7e0', '#fff1d6'))
    o.append(toy_block(x + 7, sy - 14, 14, '#f2c94c', '#fff1d6'))
    # little robot toy
    rx = cx + 4
    o.append(rect(rx - 8, sy - 18, 16, 16, '#8fc6e8', rx=3))
    o.append(rect(rx - 6, sy - 30, 12, 11, '#bfe0f2', rx=3))
    o.append(circle(rx - 2.5, sy - 25, 1.6, '#3a5a74') + circle(rx + 2.5, sy - 25, 1.6, '#3a5a74'))
    o.append(rect(rx - 0.8, sy - 35, 1.6, 5, '#3a5a74') + circle(rx, sy - 36, 2, '#ff7a59'))
    o.append(rect(rx - 5, sy - 14, 10, 6, '#ffffff', rx=1.5, extra=' opacity="0.5"'))
    # ball
    o.append(circle(cx + 26, sy - 8, 8, '#ff9a7a'))
    o.append('<path d="M%s %sA8 8 0 0 1 %s %s" stroke="#fff1d6" stroke-width="2.4" fill="none"/>' % (f(cx + 18.5), f(sy - 10), f(cx + 33.5), f(sy - 10)))
    o.append(circle(cx + 23, sy - 11, 2, '#ffffff', ' opacity="0.7"'))
    # tiny rocket
    kx = cx + 44
    o.append(poly([(kx - 5, sy - 2), (kx - 5, sy - 18), (kx, sy - 26), (kx + 5, sy - 18), (kx + 5, sy - 2)], '#f4efe6'))
    o.append(poly([(kx - 5, sy - 8), (kx - 9, sy - 1), (kx - 5, sy - 2)], '#e8665a') + poly([(kx + 5, sy - 8), (kx + 9, sy - 1), (kx + 5, sy - 2)], '#e8665a'))
    o.append(circle(kx, sy - 15, 2.4, '#7fb7e0'))
    return ''.join(o)


def shelf(cx, sy, rnd):
    o = [toys_on_shelf(cx, sy, rnd),
         rect(cx - 62, sy, 124, 7, C['wood'], rx=2), rect(cx - 62, sy + 5, 124, 2, C['wood_dk']),
         poly([(cx - 48, sy + 7), (cx - 40, sy + 7), (cx - 48, sy + 18)], C['wood_dk']),
         poly([(cx + 48, sy + 7), (cx + 40, sy + 7), (cx + 48, sy + 18)], C['wood_dk'])]
    return ''.join(o)


def wall():
    W = W_WALL
    rnd = random.Random('wall')
    o = []
    holes = ''.join(rrect_path(x, y, w, h, WIN_R) for x, y, w, h in WINDOWS)
    # base wall, windows cut out with even-odd
    o.append('<path d="M0 0H%dV540H0Z%s" fill="%s" fill-rule="evenodd"/>' % (W, holes, C['cream']))

    # top band 0-64 (behind the HUD): soft teal plates with rivets
    o.append(rect(0, 0, W, 64, C['teal']))
    for i in range(6):
        x = i * 200
        o.append(rect(x + 6, 6, 188, 50, C['teal_lo'], rx=8, extra=' opacity="0.35"'))
        o.append(rivets((x + 14, x + 186), 14, C['rivet_t']) + rivets((x + 14, x + 186), 48, C['rivet_t']))
    o.append(rect(0, 58, W, 6, C['teal_dk']))

    # pipe run y 64-90
    o.append(rect(0, 64, W, 26, C['pipe']))
    o.append(rect(0, 68, W, 5, C['pipe_hi']))
    o.append(rect(0, 84, W, 6, C['pipe_dk']))
    for i in range(8):
        x = i * 150 + 40
        o.append(rect(x - 6, 62, 12, 30, C['pipe_dk'], rx=3) + rect(x - 4, 64, 3, 26, C['pipe_hi'], extra=' opacity="0.7"'))
        o.append(circle(x, 69, 1.6, C['pipe_hi']) + circle(x, 85, 1.6, C['pipe_hi']))
    # a little valve wheel on the pipe
    for vx in (400, 800):
        o.append(circle(vx, 77, 9, '#e8665a') + circle(vx, 77, 4, '#f4efe6') + circle(vx, 77, 1.8, '#b84a40'))

    # upper zone panels between windows (teal plates) incl. the seam gap 1130..1270
    for gx in (400, 800, 0):
        def gap_panel(xx):
            return (rect(xx - 56, 104, 112, 188, C['teal_lo'], rx=10) +
                    rect(xx - 56, 104, 112, 188, 'none', rx=10, extra=' stroke="%s" stroke-width="3"' % C['teal'] + '') +
                    rivets((xx - 46, xx + 46), 114, C['rivet_t']) + rivets((xx - 46, xx + 46), 282, C['rivet_t']))
        wrap(W, gx, 60, gap_panel, o)
    o.append(shelf(400, 158, rnd))
    o.append(shelf(800, 158, rnd))
    # pressure dial at the seam gap (top), gear socket lower
    def dial(xx):
        return (circle(xx, 150, 19, C['frame_dk']) + circle(xx, 150, 15, '#fff7e6') +
                '<path d="M%s 150L%s 140" stroke="#e8665a" stroke-width="3" stroke-linecap="round"/>' % (f(xx), f(xx + 7)) +
                circle(xx, 150, 2.5, C['frame_dk']) +
                ''.join(circle(xx + 11 * math.cos(a), 150 + 11 * math.sin(a), 1.3, C['teal_dk'])
                        for a in (math.pi * 0.8, math.pi * 1.1, math.pi * 1.5, math.pi * 1.9, math.pi * 2.2)))
    wrap(W, 1166, 22, dial, o)
    o.append(rect(1166 - 2, 168, 4, 12, C['frame_dk']))

    # window frames, mullions, sills
    for x, y, w, h in WINDOWS:
        t = 11
        o.append('<path d="%s%s" fill="%s" fill-rule="evenodd"/>' % (
            rrect_path(x - t, y - t + 1, w + 2 * t, h + 2 * t - 1, WIN_R + t), rrect_path(x, y, w, h, WIN_R), C['frame']))
        o.append('<path d="%s" fill="none" stroke="%s" stroke-width="2"/>' % (rrect_path(x - t + 1, y - t + 2, w + 2 * t - 2, h + 2 * t - 3, WIN_R + t - 1), C['frame_dk']))
        o.append('<path d="%s" fill="none" stroke="%s" stroke-width="2"/>' % (rrect_path(x - 1, y - 1, w + 2, h + 2, WIN_R + 1), C['frame_hi']))
        # mullions: one vertical, one horizontal (opaque bars; panes stay transparent)
        o.append(rect(x + w / 2 - 4, y, 8, h, C['frame']))
        o.append(rect(x, y + h * 0.42 - 4, w, 8, C['frame']))
        o.append(rect(x + w / 2 - 1.5, y, 3, h, C['frame_hi'], extra=' opacity="0.6"'))
        o.append(rivets((x - 5, x + w + 5), y + 8, C['rivet_t'], 2.2) + rivets((x - 5, x + w + 5), y + h - 8, C['rivet_t'], 2.2))
        # sill
        o.append(rect(x - 20, y + h + 6, w + 40, 10, C['sill'], rx=4))
        o.append(rect(x - 20, y + h + 13, w + 40, 3, C['sill_dk'], rx=1.5))

    # lower zone y 316..462: calm low-contrast panels
    for i in range(6):
        x = i * 200
        o.append(rect(x + 8, 324, 184, 128, C['cream_lo'], rx=14))
        o.append(rect(x + 8, 324, 184, 128, 'none', rx=14, extra=' stroke="%s" stroke-width="2" opacity="0.7"' % C['cream_dk']))
        o.append(rivets((x + 20, x + 180), 336, C['rivet'], 2.2) + rivets((x + 20, x + 180), 440, C['rivet'], 2.2))
    # wainscot rail + skirting
    o.append(rect(0, 314, W, 4, C['cream_dk']))
    o.append(rect(0, 456, W, 14, C['teal']))
    o.append(rect(0, 456, W, 3, C['teal_lo']))
    for i in range(12):
        o.append(rivets((i * 100 + 50,), 464, C['rivet_t'], 2))

    # gear sockets
    for g in GEARS:
        y, r = g['y'], g['r']
        wrap(W, g['x'], r + 8, lambda x, y=y, r=r: (
            circle(x, y, r + 7, C['cream_dk']) + circle(x, y, r + 4, C['teal_dk'], ' opacity="0.55"') +
            circle(x, y, r - 2, C['teal_dk'], ' opacity="0.25"') + circle(x, y, 5, C['frame_dk'])), o)
    # vents
    for v in VENTS:
        x, y = v['x'], v['y']
        o.append(rect(x - 20, y - 10, 40, 20, C['teal_dk'], rx=6))
        o.append(rect(x - 17, y - 7, 34, 14, C['frame_dk'], rx=4))
        for k in range(3):
            o.append(rect(x - 14, y - 5 + k * 4.5, 28, 2.2, C['teal_lo'], rx=1))
        o.append(circle(x - 17, y - 7, 1.4, C['rivet_t']) + circle(x + 17, y - 7, 1.4, C['rivet_t']))
    return svg(W, 540, o)


# ---------------------------------------------------------------- floor
def floor():
    W = 600
    o = []
    # base (steel rail + warm wood)
    o.append(rect(0, 0, W, 70, '#c99560'))
    for i in range(4):
        x = i * 150
        o.append(rect(x, 30, 150, 40, '#cf9c66' if i % 2 == 0 else '#c59058'))
        o.append(rect(x, 30, 2, 40, '#a87644'))
        o.append(rect(x + 10, 46, 130, 2, '#b98552', extra=' opacity="0.6"'))
        o.append(rect(x + 20, 58, 100, 2, '#b98552', extra=' opacity="0.5"'))
        o.append(rivets((x + 12, x + 138), 38, '#e8c08a', 2.2))
    o.append(rect(0, 22, W, 8, '#5f9e96'))
    o.append(rect(0, 22, W, 2, '#8cc4bb'))
    o.append(rect(0, 28, W, 2, '#3f7670'))
    # belt
    o.append(rect(0, 0, W, 16, '#55636e'))
    o.append(rect(0, 0, W, 3, '#77858f'))
    for i in range(20):
        x = i * 30
        o.append(rect(x + 2, 4, 14, 3, '#6b7882', rx=1.5))
        o.append(rect(x + 2, 10, 14, 2, '#47545e', rx=1))
    # rollers peeking under the belt (y 14..22)
    o.append(rect(0, 14, W, 8, '#3f4b55'))
    for i in range(12):
        x = i * 50 + 25
        o.append(circle(x, 18, 4.6, '#b9c4cc') + circle(x, 18, 2, '#7c8a94') + circle(x - 1.4, 16.6, 1, '#ffffff', ' opacity="0.7"'))
    return svg(W, 70, o)


# ---------------------------------------------------------------- gear
def gear():
    cx = cy = 50
    teeth, ro, ri = 12, 46, 37
    pts = []
    for i in range(teeth):
        a0 = 2 * math.pi * i / teeth
        da = 2 * math.pi / teeth
        for frac, r in ((0.0, ri), (0.12, ro), (0.38, ro), (0.5, ri)):
            a = a0 + frac * da
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        a = a0 + 0.75 * da
        pts.append((cx + ri * math.cos(a), cy + ri * math.sin(a)))
    body = 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in pts) + 'Z'
    holes = ''
    for i in range(5):
        a = 2 * math.pi * i / 5 - math.pi / 2
        hx, hy = cx + 22 * math.cos(a), cy + 22 * math.sin(a)
        holes += 'M%s %sa7 7 0 1 0 0.01 0Z' % (f(hx + 7), f(hy))
    o = ['<path d="%s%s" fill="#6aa8a0" fill-rule="evenodd" stroke="#3f716c" stroke-width="3.5" stroke-linejoin="round"/>' % (body, holes),
         '<path d="M%s %sA34 34 0 0 1 %s %s" stroke="#8fc6be" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9"/>' % (f(cx - 33), f(cy - 8), f(cx - 8), f(cy - 33)),
         circle(cx, cy, 31, 'none', ' stroke="#4f8a84" stroke-width="2.5"'),
         circle(cx, cy, 11, '#d9b26a', ' stroke="#9c7a3a" stroke-width="3"'),
         circle(cx, cy, 4, '#9c7a3a'),
         circle(cx - 3.5, cy - 3.5, 2.2, '#f4dca0')]
    return svg(100, 100, o)


# ---------------------------------------------------------------- particles
def particles():
    P = {}
    P['blossom'] = svg(20, 20, [
        '<g transform="rotate(-28 10 10)">'
        '<path d="M10 19C6.2 16.5 5 11 5.6 6.5C6 3.4 7.6 1.6 8.8 1.6L10 3.4L11.2 1.6C12.4 1.6 14 3.4 14.4 6.5C15 11 13.8 16.5 10 19Z" fill="#f7b3c9" stroke="#e48aa8" stroke-width="1.2" stroke-linejoin="round"/>'
        '<path d="M8.4 15C7.4 12 7.3 8.5 8 6" stroke="#fde0ea" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
        '<path d="M10 17.5V12" stroke="#ec9cb7" stroke-width="0.9" fill="none" stroke-linecap="round"/></g>'])
    P['sunmote'] = svg(16, 16, [circle(8, 8, 8, 'url(#g)'), circle(8, 8, 2.4, '#fffbe6')],
                       rad_grad('g', [(0, '#fff6c0', 0.95), (0.35, '#ffe68a', 0.6), (1, '#ffd65a', 0)]))
    P['butterfly'] = svg(24, 20, [
        '<path d="M12 9C9 2 3 0.8 1.8 4C0.8 7 4 10 11 10Z" fill="#ffb35c" stroke="#d6803a" stroke-width="1.3" stroke-linejoin="round"/>',
        '<path d="M12 9C15 2 21 0.8 22.2 4C23.2 7 20 10 13 10Z" fill="#ffb35c" stroke="#d6803a" stroke-width="1.3" stroke-linejoin="round"/>',
        '<path d="M11.5 10.5C7 11 3.5 13.5 4.8 16.5C6 18.8 9.5 16.5 11.5 12.5Z" fill="#ff8f7a" stroke="#d6803a" stroke-width="1.3" stroke-linejoin="round"/>',
        '<path d="M12.5 10.5C17 11 20.5 13.5 19.2 16.5C18 18.8 14.5 16.5 12.5 12.5Z" fill="#ff8f7a" stroke="#d6803a" stroke-width="1.3" stroke-linejoin="round"/>',
        circle(6, 5, 1.6, '#fff1d6') + circle(18, 5, 1.6, '#fff1d6'),
        ellipse(12, 11, 1.5, 5.5, '#6a4a3a'),
        '<path d="M11.4 6C10.5 4 9.5 3 8.6 2.6M12.6 6C13.5 4 14.5 3 15.4 2.6" stroke="#6a4a3a" stroke-width="1" fill="none" stroke-linecap="round"/>'])
    # maple-ish leaf
    lp = []
    for i, (ang, r) in enumerate(((-90, 9), (-55, 5.5), (-30, 8.5), (5, 5), (35, 7), (70, 3.5),
                                   (110, 3.5), (145, 7), (175, 5), (210, 8.5), (235, 5.5))):
        a = math.radians(ang)
        lp.append((10 + r * math.cos(a), 10.5 + r * math.sin(a)))
    P['leaf'] = svg(20, 20, [
        poly(lp, '#ee8a32', ' stroke="#c25a22" stroke-width="1.2" stroke-linejoin="round"'),
        '<path d="M10 18.5V10.5M10 10.5L5 6.5M10 10.5L15 6.5M10 10.5V3" stroke="#c25a22" stroke-width="1" fill="none" stroke-linecap="round"/>',
        circle(7.5, 8.5, 1.3, '#f8b45c')])
    arms = []
    for i in range(6):
        a = math.radians(i * 60 - 90)
        ca, sa = math.cos(a), math.sin(a)
        x1, y1 = 12 + 10 * ca, 12 + 10 * sa
        arms.append('M12 12L%s %s' % (f(x1), f(y1)))
        for d, ln in ((5.5, 3.2), (8, 2.2)):
            bx, by = 12 + d * ca, 12 + d * sa
            for s in (-1, 1):
                b = a + s * math.radians(50)
                arms.append('M%s %sL%s %s' % (f(bx), f(by), f(bx + ln * math.cos(b)), f(by + ln * math.sin(b))))
    d = ''.join(arms)
    P['snowflake'] = svg(24, 24, [
        '<path d="%s" stroke="#a9c4ea" stroke-width="3.2" fill="none" stroke-linecap="round"/>' % d,
        '<path d="%s" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round"/>' % d,
        circle(12, 12, 2, '#ffffff')])
    P['steam'] = svg(64, 64, [
        circle(24, 38, 16, 'url(#s)'), circle(40, 36, 18, 'url(#s)'), circle(32, 24, 17, 'url(#s)'),
        circle(30, 30, 10, '#ffffff', ' opacity="0.35"')],
        rad_grad('s', [(0, '#ffffff', 0.9), (0.55, '#eef3f9', 0.6), (0.85, '#c9d4e2', 0.25), (1, '#c9d4e2', 0)]))
    P['sparkle'] = svg(32, 32, [
        circle(16, 16, 9, 'url(#k)'),
        '<path d="M16 1.5Q17.6 14.4 30.5 16Q17.6 17.6 16 30.5Q14.4 17.6 1.5 16Q14.4 14.4 16 1.5Z" fill="#ffe066" stroke="#f2b632" stroke-width="1.4" stroke-linejoin="round"/>',
        '<path d="M16 8Q16.8 15.2 24 16Q16.8 16.8 16 24Q15.2 16.8 8 16Q15.2 15.2 16 8Z" fill="#fffbe0"/>'],
        rad_grad('k', [(0, '#fff6c0', 0.9), (1, '#ffe066', 0)]))
    P['spark'] = svg(12, 12, [circle(6, 6, 5, '#ffc93c', ' stroke="#e8902a" stroke-width="1.2"'),
                              circle(4.6, 4.6, 1.7, '#fff6d0')])
    for k, v in P.items():
        write('particles/%s.svg' % k, v)


# ---------------------------------------------------------------- palette
PALETTE = {
    'spring': {'tint': '#ffd6e6', 'tintAlpha': 0.08, 'bench': '#dcb9a8', 'accent': '#ff6f9f'},
    'summer': {'tint': '#ffe38a', 'tintAlpha': 0.08, 'bench': '#d6b27c', 'accent': '#ffad1f'},
    'autumn': {'tint': '#ffb062', 'tintAlpha': 0.12, 'bench': '#c9976c', 'accent': '#e8642c'},
    'winter': {'tint': '#6f78c8', 'tintAlpha': 0.16, 'bench': '#aeb5d8', 'accent': '#7fc8ff'},
    'gears': GEARS,
    'vents': VENTS,
}


def main():
    for s in SEASONS:
        write('levels/%s/outside.svg' % s, outside(s))
    write('room/wall.svg', wall())
    write('room/floor.svg', floor())
    write('room/gear.svg', gear())
    particles()
    with open(os.path.join(OUT, 'levels', 'palette.json'), 'w', encoding='utf-8') as fh:
        json.dump(PALETTE, fh, indent=2)
        fh.write('\n')
    print('wrote environment art to', OUT)


if __name__ == '__main__':
    main()
