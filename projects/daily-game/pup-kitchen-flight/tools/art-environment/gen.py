#!/usr/bin/env python3
"""Environment art generator for Biscuit's Kitchen Flight.

Writes 100 % original SVGs into game/assets/default/ (see docs/DESIGN.md §3-4):
  levels/<zone>/outside.svg  960x540, opaque, tileable
  levels/palette.json
  room/wall.svg 1200x540 (two transparent windows per tile), room/counter.svg 600x70,
  room/curtain.svg 120x300, room/frost.svg 300x220
  particles/*.svg

Run:  python3 tools/art-environment/gen.py
Deterministic (fixed seeds), no dependencies.
"""
import json
import math
import os
import random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "game", "assets", "default")


# ---------------------------------------------------------------- helpers
def hx(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def tohex(rgb):
    return "#" + "".join("%02x" % max(0, min(255, int(round(v)))) for v in rgb)


def mix(a, b, t):
    a, b = hx(a), hx(b)
    return tohex([a[i] + (b[i] - a[i]) * t for i in range(3)])


def dark(c, f=0.25):
    return mix(c, "#2a1a10", f)


def light(c, f=0.25):
    return mix(c, "#ffffff", f)


def f1(v):
    s = "%.1f" % v
    return s[:-2] if s.endswith(".0") else s


def svg(w, h, body, defs=""):
    d = "<defs>%s</defs>" % defs if defs else ""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">%s%s</svg>\n'
            % (w, h, w, h, d, body))


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as fh:
        fh.write(text)
    print("wrote", rel, len(text), "bytes")


def wrap(el, x, half, W):
    """Return el (absolute coords around x) plus copies shifted by ±W when it crosses an edge."""
    out = el
    if x + half > W:
        out += '<g transform="translate(%d 0)">%s</g>' % (-W, el)
    if x - half < 0:
        out += '<g transform="translate(%d 0)">%s</g>' % (W, el)
    return out


def circle(cx, cy, r, fill, extra=""):
    return '<circle cx="%s" cy="%s" r="%s" fill="%s"%s/>' % (f1(cx), f1(cy), f1(r), fill, extra)


def blob_path(cx, cy, rx, ry, bumps, rng, jag=0.18):
    """A soft bumpy blob (cloud / canopy) as a closed path of quadratic bumps."""
    pts = []
    for i in range(bumps):
        a = 2 * math.pi * i / bumps
        k = 1 + rng.uniform(-jag, jag)
        pts.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k))
    d = "M%s %s" % (f1(pts[0][0]), f1(pts[0][1]))
    for i in range(bumps):
        p0, p1 = pts[i], pts[(i + 1) % bumps]
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        # push control outwards for a bump
        ox, oy = mx - cx, my - cy
        ln = math.hypot(ox, oy) or 1
        c = (mx + ox / ln * 0.35 * math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
             my + oy / ln * 0.35 * math.hypot(p1[0] - p0[0], p1[1] - p0[1]))
        d += " Q%s %s %s %s" % (f1(c[0]), f1(c[1]), f1(p1[0]), f1(p1[1]))
    return d + "Z"


# ---------------------------------------------------------------- zones
ZONES = {
    "sunny": dict(
        sky=["#6fc3ef", "#9fd8f4", "#d9f1f7"], sun=("#fff6c9", "#ffe27a"), sunpos=(170, 165),
        cloud="#ffffff", cloudSh="#d6ecf6", cloudA=1.0,
        houseFar=["#c9d7e2", "#d7d0e0", "#e2d6c6"], roofFar=["#9fb1c9", "#b6a3bf", "#c79c8c"],
        house=["#f1d9b0", "#e9c3a8", "#d9e2c7", "#f0e2c4"], roof=["#c96f55", "#8a7aa8", "#6f8fb0", "#b7855a"],
        win="#bfe3f2", winLit=False,
        tree="#5fae4e", treeSh="#3f8a3d", trunk="#8a5a3a",
        hedge="#4f9a48", hedgeSh="#3a7c3a", hedgeHi="#78c063",
        fence="#fbf3e2", fenceSh="#d8cbb0",
        lawn="#8ccf5f", lawnSh="#6fb24c", flowers=["#ffffff", "#ffd54a", "#f59ab0"],
        puddles=False, snow=False, stars=False, bend=0.0,
        tint="#ffe3a3", tintAlpha=0.06, music="warm", banner="#f2b33d", skyKey="#8fd3f4"),
    "rainy": dict(
        sky=["#6d7f95", "#8d9cad", "#b3bdc6"], sun=None,
        cloud="#9aa6b3", cloudSh="#7a8796", cloudA=1.0,
        houseFar=["#97a3ae", "#a39fac", "#a8a197"], roofFar=["#76849a", "#857891", "#8f7468"],
        house=["#c8b89c", "#bba08e", "#aab79f", "#c4b89f"], roof=["#9a5a48", "#6c6488", "#55718c", "#8c6a4a"],
        win="#7f93a3", winLit=False,
        tree="#3f7c46", treeSh="#2c5f36", trunk="#5e4030",
        hedge="#376e3d", hedgeSh="#285530", hedgeHi="#4f8c52",
        fence="#d9d6cc", fenceSh="#a9a69c",
        lawn="#5f9a4e", lawnSh="#4a7f40", flowers=["#e8e4f0", "#d9c86a"],
        puddles=True, snow=False, stars=False, bend=0.0,
        tint="#8a9bb0", tintAlpha=0.14, music="soft", banner="#5c8db8", skyKey="#8d9cad"),
    "windy": dict(
        sky=["#6a5b9e", "#e7799a", "#ffb36b"], sun=("#ffe7a8", "#ff9f4a"), sunpos=(520, 226),
        cloud="#f6a3a8", cloudSh="#c97a9a", cloudA=0.9,
        houseFar=["#9b7aa6", "#a77c9a", "#b38a8e"], roofFar=["#7c5f93", "#8a5f86", "#935f72"],
        house=["#e6b48a", "#d99a84", "#cbb08a", "#e3bf8f"], roof=["#a24f42", "#6e5486", "#5f6a90", "#94603f"],
        win="#ffd59a", winLit=False,
        tree="#e0812f", treeSh="#b65a24", trunk="#6a4230",
        hedge="#8f9a3e", hedgeSh="#6c7a30", hedgeHi="#b9b34f",
        fence="#f6dcc0", fenceSh="#c9a58a",
        lawn="#b5a84a", lawnSh="#958a3a", flowers=["#f2c14e", "#e86a3a"],
        puddles=False, snow=False, stars=False, bend=1.0,
        tint="#ff9a5c", tintAlpha=0.18, music="breezy", banner="#e8704a", skyKey="#f59e6b"),
    "snowy": dict(
        sky=["#121a44", "#22306a", "#3d4f8e"], sun=None, moon=(720, 165),
        cloud="#3b4a82", cloudSh="#2c3a6c", cloudA=0.75,
        houseFar=["#2f3b6c", "#363d6e", "#3a3f6a"], roofFar=["#e3ebf7", "#e3ebf7", "#e3ebf7"],
        house=["#5a5e8a", "#5f5778", "#4f6380", "#665e7e"], roof=["#e9f0fa", "#e9f0fa", "#e9f0fa", "#e9f0fa"],
        win="#ffd36b", winLit=True,
        tree="#2f5a5a", treeSh="#244848", trunk="#4a3a40",
        hedge="#2e5552", hedgeSh="#234342", hedgeHi="#eef4fb",
        fence="#c9d2e6", fenceSh="#98a3c2",
        lawn="#dfe8f6", lawnSh="#b9c7e2", flowers=[],
        puddles=False, snow=True, stars=True, bend=0.0,
        tint="#3a4e8c", tintAlpha=0.22, music="lullaby", banner="#6f7fd6", skyKey="#22306a"),
}

W_OUT, H_OUT = 960, 540
HORIZON = 300      # where far houses stand
HEDGE_TOP = 300
FENCE_TOP = 318
LAWN_Y = 352


def gen_outside(name, z, seed):
    rng = random.Random(seed)
    W, H = W_OUT, H_OUT
    defs = ('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="%s"/><stop offset="0.55" stop-color="%s"/>'
            '<stop offset="1" stop-color="%s"/></linearGradient>' % tuple(z["sky"]))
    b = []
    b.append('<rect width="%d" height="%d" fill="url(#sky)"/>' % (W, H))

    # stars
    if z["stars"]:
        for i in range(70):
            x, y = rng.uniform(0, W), rng.uniform(10, 280)
            r = rng.choice([1, 1, 1.4, 1.8])
            a = rng.uniform(0.45, 0.95)
            b.append(wrap(circle(x, y, r, "#fff7dc", ' opacity="%.2f"' % a), x, r, W))
        for i in range(6):  # a few twinkle crosses
            x, y = rng.uniform(20, W - 20), rng.uniform(30, 240)
            b.append('<path d="M%s %sv10M%s %sh10" stroke="#fff7dc" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>'
                     % (f1(x), f1(y - 5), f1(x - 5), f1(y)))

    # sun / moon
    if z.get("sun"):
        sx, sy = z["sunpos"]
        core, glow = z["sun"]
        defs += ('<radialGradient id="sunglow"><stop offset="0" stop-color="%s" stop-opacity="0.85"/>'
                 '<stop offset="0.35" stop-color="%s" stop-opacity="0.45"/>'
                 '<stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>' % (core, glow, glow))
        R = 46 if name == "sunny" else 62
        b.append(circle(sx, sy, R * 3.2, "url(#sunglow)"))
        b.append(circle(sx, sy, R, glow))
        b.append(circle(sx - R * 0.12, sy - R * 0.12, R * 0.82, core))
    if z.get("moon"):
        mx, my = z["moon"]
        defs += ('<radialGradient id="moonglow"><stop offset="0" stop-color="#fff4cf" stop-opacity="0.45"/>'
                 '<stop offset="1" stop-color="#fff4cf" stop-opacity="0"/></radialGradient>')
        b.append(circle(mx, my, 120, "url(#moonglow)"))
        b.append(circle(mx, my, 38, "#fff1c2", ' stroke="#e6d39a" stroke-width="3"'))
        b.append(circle(mx + 10, my - 8, 7, "#f0dfa6"))
        b.append(circle(mx - 12, my + 10, 5, "#f0dfa6"))
        b.append(circle(mx + 6, my + 16, 4, "#f0dfa6"))
        b.append(circle(mx - 14, my - 14, 9, "#fffbe8", ' opacity="0.7"'))

    # clouds (soft, bumpy, with a one-step shadow underside)
    nclouds = {"sunny": 5, "rainy": 8, "windy": 5, "snowy": 4}[name]
    for i in range(nclouds):
        x = (i + rng.uniform(0.1, 0.9)) * W / nclouds
        y = rng.uniform(140, 225) if name != "rainy" else rng.uniform(110, 210)
        if z.get("moon") and abs(x - z["moon"][0]) < 170:
            x = (z["moon"][0] + 200 + x) % W  # keep the moon clear
        rx = rng.uniform(60, 95) * (1.4 if name == "rainy" else 1.0)
        ry = rx * (0.32 if name == "windy" else 0.42)
        if name == "windy":
            rx *= 1.5
        g = '<g opacity="%.2f">' % z["cloudA"]
        g += '<path d="%s" fill="%s"/>' % (blob_path(x, y + ry * 0.25, rx, ry * 0.9, 11, rng), z["cloudSh"])
        g += '<path d="%s" fill="%s"/>' % (blob_path(x - rx * 0.05, y, rx * 0.92, ry * 0.8, 11, rng), z["cloud"])
        g += '</g>'
        b.append(wrap(g, x, rx * 1.4, W))
    if name == "rainy":  # a low heavy band of cloud across the whole width
        d = "M0 120 "
        for i in range(25):
            x0 = i * 40
            d += "Q%d %d %d 120 " % (x0 + 20, 96 if i % 2 else 104, x0 + 40)
        d += "L960 0 L0 0Z"
        b.append('<path d="%s" fill="#7a8796" opacity="0.7"/>' % d)

    # far houses (atmospheric, simple)
    fx = 0
    k = 0
    while fx < W:
        w = rng.uniform(70, 110)
        h = rng.uniform(34, 56)
        x = fx + w / 2
        col = z["houseFar"][k % 3]
        rc = z["roofFar"][k % 3]
        top = HORIZON - h
        el = '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"/>' % (f1(x - w / 2), f1(top), f1(w), f1(h + 30), col)
        el += '<path d="M%s %sL%s %sL%s %sZ" fill="%s"/>' % (f1(x - w / 2 - 6), f1(top + 2), f1(x), f1(top - h * 0.55),
                                                             f1(x + w / 2 + 6), f1(top + 2), rc)
        if z["winLit"]:
            el += '<rect x="%s" y="%s" width="9" height="9" rx="1.5" fill="#ffd36b" opacity="0.8"/>' % (f1(x - 14), f1(top + 12))
        el += '<rect x="%s" y="%s" width="9" height="16" fill="%s"/>' % (f1(x + w * 0.22), f1(top - h * 0.5), col)
        b.append(wrap(el, x, w / 2 + 8, W))
        fx += w + rng.uniform(-8, 6)
        k += 1

    # near houses (outlined)
    nh = 4
    for i in range(nh):
        x = (i + 0.5) * W / nh + rng.uniform(-40, 40)
        w = rng.uniform(120, 150)
        h = rng.uniform(62, 76)
        col = z["house"][i % 4]
        rc = z["roof"][i % 4]
        ol = dark(col, 0.35)
        rol = dark(rc, 0.3) if not z["snow"] else "#a9b6d0"
        base = HORIZON + 12
        top = base - h
        el = '<g stroke-linejoin="round" stroke-linecap="round">'
        # chimney
        el += '<rect x="%s" y="%s" width="14" height="34" fill="%s" stroke="%s" stroke-width="3"/>' % (
            f1(x + w * 0.2), f1(top - 40), dark(col, 0.15), ol)
        el += '<rect x="%s" y="%s" width="%s" height="%s" fill="%s" stroke="%s" stroke-width="3"/>' % (
            f1(x - w / 2), f1(top), f1(w), f1(h + 20), col, ol)
        el += '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"/>' % (
            f1(x + w * 0.18), f1(top + 2), f1(w * 0.3 - 2), f1(h + 18), dark(col, 0.1))  # one-step shadow
        roofd = 'M%s %sL%s %sL%s %sZ' % (f1(x - w / 2 - 10), f1(top + 3), f1(x), f1(top - h * 0.6), f1(x + w / 2 + 10), f1(top + 3))
        el += '<path d="%s" fill="%s" stroke="%s" stroke-width="3"/>' % (roofd, rc, rol)
        if z["snow"]:
            # snow drip edge
            el += '<path d="M%s %s Q%s %s %s %s Q%s %s %s %s" fill="none" stroke="#ffffff" stroke-width="5"/>' % (
                f1(x - w / 2 - 8), f1(top + 3), f1(x - w / 4), f1(top + 9), f1(x), f1(top + 4), f1(x + w / 4), f1(top + 10), f1(x + w / 2 + 8), f1(top + 3))
            el += '<rect x="%s" y="%s" width="18" height="7" rx="3.5" fill="#ffffff"/>' % (f1(x + w * 0.2 - 2), f1(top - 44))
        # windows
        for wx in (x - w * 0.28, x + w * 0.08):
            wy = top + 14
            if z["winLit"]:
                el += circle(wx + 11, wy + 11, 22, "url(#litglow)", ' stroke="none"')
                el += '<rect x="%s" y="%s" width="22" height="22" rx="2" fill="#ffd36b" stroke="%s" stroke-width="3"/>' % (f1(wx), f1(wy), ol)
                el += '<rect x="%s" y="%s" width="10" height="9" fill="#ffe9a8"/>' % (f1(wx + 2), f1(wy + 2))
            else:
                el += '<rect x="%s" y="%s" width="22" height="22" rx="2" fill="%s" stroke="%s" stroke-width="3"/>' % (f1(wx), f1(wy), z["win"], ol)
                el += '<path d="M%s %sl6 -6" stroke="#ffffff" stroke-width="2.5" opacity="0.7"/>' % (f1(wx + 5), f1(wy + 12))
            el += '<path d="M%s %sv22M%s %sh22" stroke="%s" stroke-width="2"/>' % (f1(wx + 11), f1(wy), f1(wx), f1(wy + 11), ol)
        el += '</g>'
        b.append(wrap(el, x, w / 2 + 14, W))
    if z["winLit"]:
        defs += ('<radialGradient id="litglow"><stop offset="0" stop-color="#ffd36b" stop-opacity="0.55"/>'
                 '<stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>')

    # trees
    trees = [(300, 1.0), (790, 0.75)]
    for tx, s in trees:
        base = HEDGE_TOP + 30
        th = 120 * s
        bend = z["bend"]
        el = '<g stroke-linejoin="round" stroke-linecap="round">'
        if z["snow"]:
            # snowy evergreen with snow shelves
            tw = 62 * s
            el += '<rect x="%s" y="%s" width="%s" height="40" fill="%s" stroke="%s" stroke-width="3"/>' % (
                f1(tx - 6 * s), f1(base - 34), f1(12 * s), z["trunk"], dark(z["trunk"], 0.3))
            for j in range(3):
                yb = base - 26 - j * 40 * s
                wj = tw * (1 - j * 0.24)
                el += '<path d="M%s %sL%s %sL%s %sZ" fill="%s" stroke="%s" stroke-width="3"/>' % (
                    f1(tx - wj), f1(yb), f1(tx), f1(yb - 62 * s), f1(tx + wj), f1(yb), z["tree"], z["treeSh"])
                el += '<path d="M%s %sQ%s %s %s %sQ%s %s %s %s" fill="none" stroke="#f4f8ff" stroke-width="6"/>' % (
                    f1(tx - wj + 4), f1(yb - 2), f1(tx - wj / 2), f1(yb + 4), f1(tx), f1(yb - 1),
                    f1(tx + wj / 2), f1(yb + 5), f1(tx + wj - 4), f1(yb - 2))
            el += '<path d="M%s %sL%s %sL%s %sZ" fill="#f4f8ff"/>' % (
                f1(tx - 9 * s), f1(base - 26 - 80 * s - 50 * s), f1(tx), f1(base - 26 - 80 * s - 64 * s), f1(tx + 9 * s), f1(base - 26 - 80 * s - 50 * s))
            half = tw + 6
        else:
            lean = 28 * s * bend
            tdx = 6 * s
            el += '<path d="M%s %s Q%s %s %s %s L%s %s Q%s %s %s %sZ" fill="%s" stroke="%s" stroke-width="3"/>' % (
                f1(tx - 9 * s), f1(base), f1(tx - 8 * s + lean * 0.2), f1(base - th * 0.5), f1(tx - tdx + lean), f1(base - th),
                f1(tx + tdx + lean), f1(base - th), f1(tx + 8 * s + lean * 0.3), f1(base - th * 0.5), f1(tx + 9 * s), f1(base),
                z["trunk"], dark(z["trunk"], 0.3))
            cx, cy = tx + lean * 1.5, base - th - 20 * s
            rx, ry = (78 * s, 62 * s) if not bend else (86 * s, 50 * s)
            el += '<path d="%s" fill="%s" stroke="%s" stroke-width="3"/>' % (blob_path(cx, cy, rx, ry, 13, rng, 0.12), z["tree"], z["treeSh"])
            el += '<path d="%s" fill="%s"/>' % (blob_path(cx + rx * 0.18, cy + ry * 0.28, rx * 0.7, ry * 0.55, 11, rng, 0.1), z["treeSh"])
            el += '<path d="%s" fill="%s" opacity="0.8"/>' % (blob_path(cx - rx * 0.3, cy - ry * 0.35, rx * 0.35, ry * 0.25, 9, rng, 0.1), light(z["tree"], 0.25))
            if name == "sunny":  # a few apples
                for a in range(4):
                    ax, ay = cx + rng.uniform(-rx * 0.6, rx * 0.6), cy + rng.uniform(-ry * 0.4, ry * 0.5)
                    el += circle(ax, ay, 5 * s + 1, "#e8553f", ' stroke="#b33a2a" stroke-width="2"')
            half = rx * 1.3 + lean * 1.5
        el += '</g>'
        b.append(wrap(el, tx, half, W))

    # hedge: bumps on a period of 48 px (960/48 = 20) so it tiles
    d = "M0 %d " % (HEDGE_TOP + 70)
    d += "L0 %d " % (HEDGE_TOP + 12)
    hi = ""
    for i in range(20):
        x0 = i * 48
        dy = 10 if i % 3 else 16
        d += "Q%d %d %d %d " % (x0 + 24, HEDGE_TOP + 12 - dy * 2, x0 + 48, HEDGE_TOP + 12)
        hi += '<path d="M%d %d Q%d %d %d %d" fill="none" stroke="%s" stroke-width="%d" stroke-linecap="round"/>' % (
            x0 + 10, HEDGE_TOP + 8, x0 + 22, HEDGE_TOP + 12 - dy * 1.6, x0 + 36, HEDGE_TOP + 6, z["hedgeHi"], 7 if z["snow"] else 4)
    d += "L960 %d Z" % (HEDGE_TOP + 70)
    b.append('<path d="%s" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>' % (d, z["hedge"], z["hedgeSh"]))
    b.append('<rect x="0" y="%d" width="960" height="30" fill="%s" opacity="0.6"/>' % (HEDGE_TOP + 34, z["hedgeSh"]))
    b.append(hi)

    # fence: pickets on a 32 px period (960/32 = 30)
    fc, fs = z["fence"], z["fenceSh"]
    b.append('<rect x="-4" y="%d" width="968" height="8" fill="%s" stroke="%s" stroke-width="2.5"/>' % (FENCE_TOP + 10, fc, fs))
    b.append('<rect x="-4" y="%d" width="968" height="8" fill="%s" stroke="%s" stroke-width="2.5"/>' % (FENCE_TOP + 28, fc, fs))
    pk = ""
    for i in range(30):
        x0 = i * 32 + 6
        pk += '<path d="M%d %d L%d %d L%d %d L%d %d L%d %dZ" fill="%s" stroke="%s" stroke-width="2.5" stroke-linejoin="round"/>' % (
            x0, FENCE_TOP + 46, x0, FENCE_TOP + 6, x0 + 9, FENCE_TOP - 2, x0 + 18, FENCE_TOP + 6, x0 + 18, FENCE_TOP + 46, fc, fs)
        pk += '<rect x="%d" y="%d" width="5" height="38" fill="%s"/>' % (x0 + 12, FENCE_TOP + 7, fs)
        if z["snow"]:
            pk += '<path d="M%d %d L%d %d L%d %d" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' % (
                x0 + 1, FENCE_TOP + 5, x0 + 9, FENCE_TOP - 1, x0 + 17, FENCE_TOP + 5)
    b.append(pk)
    if z["snow"]:
        b.append('<rect x="-4" y="%d" width="968" height="4" rx="2" fill="#ffffff"/>' % (FENCE_TOP + 9))
        b.append('<rect x="-4" y="%d" width="968" height="4" rx="2" fill="#ffffff"/>' % (FENCE_TOP + 27))

    # lawn / snow ground with a gentle wavy top on a 120 px period
    d = "M0 540 L0 %d " % LAWN_Y
    for i in range(8):
        x0 = i * 120
        d += "Q%d %d %d %d " % (x0 + 60, LAWN_Y - 6, x0 + 120, LAWN_Y)
    d += "L960 540Z"
    b.append('<path d="%s" fill="%s"/>' % (d, z["lawn"]))
    b.append('<rect x="0" y="%d" width="960" height="6" fill="%s" opacity="0.7"/>' % (LAWN_Y, z["lawnSh"]))
    # grass tufts / flowers / puddles
    for i in range(26):
        x, y = rng.uniform(0, W), rng.uniform(LAWN_Y + 14, 520)
        if z["snow"]:
            b.append(wrap('<path d="M%s %s q14 -8 28 0" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"/>' % (f1(x - 14), f1(y), z["lawnSh"]), x, 16, W))
        else:
            b.append(wrap('<path d="M%s %s l4 -10 l3 9 l4 -12 l3 13" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' % (f1(x - 7), f1(y), z["lawnSh"]), x, 10, W))
    for i in range(len(z["flowers"]) * 6):
        x, y = rng.uniform(0, W), rng.uniform(LAWN_Y + 8, 420)
        c = z["flowers"][i % len(z["flowers"])]
        el = ""
        for a in range(5):
            ang = a * 2 * math.pi / 5
            el += circle(x + math.cos(ang) * 4, y + math.sin(ang) * 4, 3.4, c)
        el += circle(x, y, 2.6, "#f7b733" if c != "#ffd54a" else "#e98a2a")
        b.append(wrap(el, x, 9, W))
    if z["puddles"]:
        for x, y, rx in [(140, 366, 40), (470, 372, 54), (760, 364, 34), (930, 374, 46)]:
            el = '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#8fa3b6" stroke="#5f7489" stroke-width="3"/>' % (x, y, rx, rx * 0.22)
            el += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" stroke="#c9d6e2" stroke-width="2" opacity="0.8"/>' % (x - rx * 0.2, y - 1, rx * 0.35, rx * 0.07)
            b.append(wrap(el, x, rx + 3, W))
    if z["snow"]:
        # soft blue shadow drifts at the fence foot
        b.append('<rect x="0" y="%d" width="960" height="10" fill="#c3d0ea" opacity="0.8"/>' % (LAWN_Y + 4))

    write("levels/%s/outside.svg" % name, svg(W, H, "".join(b), defs))


# ---------------------------------------------------------------- wall
WALL_W = 1200
# window geometry (per 600 px half-tile), shared with the report
WIN_OPEN = [(110, 490), (710, 1090)]
WIN_Y = (120, 390)
FRAME = 16


def herb_pot(x, base, kind, rng):
    """A little herb pot standing on a sill at bottom y = base. Muted greens so they never read as collectible leaves."""
    pot_cols = ["#e9e4d8", "#d77d5f", "#9db4c8", "#e6c86e"]
    pc = pot_cols[kind % 4]
    po = dark(pc, 0.35)
    g = '<g stroke-linejoin="round" stroke-linecap="round">'
    leaf = "#7d9a6a"
    leafo = "#56704a"
    # plant
    if kind % 3 == 0:  # bushy (round leaves)
        for i in range(7):
            lx = x + rng.uniform(-16, 16)
            ly = base - 30 - rng.uniform(4, 22)
            g += '<ellipse cx="%s" cy="%s" rx="8" ry="6" fill="%s" stroke="%s" stroke-width="2.5" transform="rotate(%d %s %s)"/>' % (
                f1(lx), f1(ly), leaf, leafo, rng.randint(-40, 40), f1(lx), f1(ly))
    elif kind % 3 == 1:  # spiky chives
        for i in range(8):
            a = -1.2 + i * 0.34
            g += '<path d="M%s %s q%s %s %s %s" fill="none" stroke="%s" stroke-width="3.5"/>' % (
                f1(x), f1(base - 26), f1(math.sin(a) * 8), -18, f1(math.sin(a) * 20), f1(-34 + abs(a) * 6), leafo)
    else:  # sprigs
        for sx in (-8, 0, 9):
            g += '<path d="M%s %s v-30" stroke="%s" stroke-width="2.5"/>' % (f1(x + sx), f1(base - 26), leafo)
            for j in range(3):
                yy = base - 34 - j * 8
                g += '<ellipse cx="%s" cy="%s" rx="5" ry="3" fill="%s" stroke="%s" stroke-width="1.8"/>' % (f1(x + sx - 4), f1(yy), leaf, leafo)
                g += '<ellipse cx="%s" cy="%s" rx="5" ry="3" fill="%s" stroke="%s" stroke-width="1.8"/>' % (f1(x + sx + 4), f1(yy - 3), leaf, leafo)
    # pot (tapered) + rim + shade
    g += '<path d="M%s %s L%s %s L%s %s L%s %sZ" fill="%s" stroke="%s" stroke-width="3"/>' % (
        f1(x - 15), f1(base - 24), f1(x + 15), f1(base - 24), f1(x + 11), f1(base), f1(x - 11), f1(base), pc, po)
    g += '<path d="M%s %s L%s %s L%s %s L%s %sZ" fill="%s"/>' % (
        f1(x + 4), f1(base - 22), f1(x + 13), f1(base - 22), f1(x + 10), f1(base - 2), f1(x + 2), f1(base - 2), dark(pc, 0.12))
    g += '<rect x="%s" y="%s" width="36" height="8" rx="3" fill="%s" stroke="%s" stroke-width="3"/>' % (f1(x - 18), f1(base - 30), light(pc, 0.12), po)
    g += '</g>'
    return g


def jar(x, base, w, h, glass, lid, fill_col, fill_h):
    o = dark(glass, 0.45)
    g = '<g stroke-linejoin="round">'
    g += '<rect x="%s" y="%s" width="%s" height="%s" rx="5" fill="%s" stroke="%s" stroke-width="3"/>' % (f1(x - w / 2), f1(base - h), f1(w), f1(h), glass, o)
    g += '<rect x="%s" y="%s" width="%s" height="%s" rx="3" fill="%s"/>' % (f1(x - w / 2 + 3), f1(base - fill_h), f1(w - 6), f1(fill_h - 3), fill_col)
    g += '<rect x="%s" y="%s" width="4" height="%s" rx="2" fill="#ffffff" opacity="0.6"/>' % (f1(x - w / 2 + 5), f1(base - h + 7), f1(h * 0.45))
    g += '<rect x="%s" y="%s" width="%s" height="8" rx="2" fill="%s" stroke="%s" stroke-width="3"/>' % (f1(x - w / 2 - 2), f1(base - h - 6), f1(w + 4), lid, dark(lid, 0.35))
    g += '</g>'
    return g


def gen_wall():
    rng = random.Random(1207)
    W, H = WALL_W, 540
    paper = "#e8d7a2"       # muted butter
    stripe = "#e1cd92"
    motif = "#b9c08e"       # sage sprig
    motif2 = "#d9b98a"
    wood = "#b98a55"
    woodo = "#7e5a34"
    woodh = "#d4a873"
    defs = (
        '<pattern id="paper" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">'
        '<rect width="60" height="60" fill="%s"/>'
        '<rect x="0" y="0" width="18" height="60" fill="%s"/>'
        '<path d="M39 14 q3 -6 0 -10 q-3 4 0 10z M39 14 q6 -2 8 -7 q-6 0 -8 7z M39 14 q-6 -2 -8 -7 q6 0 8 7z" fill="%s"/>'
        '<circle cx="39" cy="46" r="2.2" fill="%s"/>'
        '<circle cx="9" cy="30" r="1.6" fill="%s"/>'
        '</pattern>' % (paper, stripe, motif, motif2, motif2)
        + '<linearGradient id="wallshade" x1="0" y1="0" x2="0" y2="1">'
          '<stop offset="0" stop-color="#5a3a20" stop-opacity="0.16"/>'
          '<stop offset="0.25" stop-color="#5a3a20" stop-opacity="0"/>'
          '<stop offset="0.8" stop-color="#5a3a20" stop-opacity="0"/>'
          '<stop offset="1" stop-color="#5a3a20" stop-opacity="0.12"/></linearGradient>'
        + '<linearGradient id="copper" x1="0" y1="0" x2="0" y2="1">'
          '<stop offset="0" stop-color="#f0b07a"/><stop offset="0.45" stop-color="#c97a45"/>'
          '<stop offset="1" stop-color="#94512b"/></linearGradient>'
        + '<pattern id="tiles" x="0" y="0" width="30" height="20" patternUnits="userSpaceOnUse">'
          '<rect width="30" height="20" fill="#cbd4b8"/>'
          '<rect x="1.5" y="1.5" width="27" height="17" rx="2" fill="#e6ead9"/>'
          '<rect x="3" y="3" width="10" height="3" rx="1.5" fill="#ffffff" opacity="0.6"/>'
          '</pattern>'
    )
    b = []
    # wall shape = full rect minus the window openings (evenodd => holes stay transparent)
    holes = "".join("M%d %dH%dV%dH%dZ" % (x0, WIN_Y[0], x1, WIN_Y[1], x0) for x0, x1 in WIN_OPEN)
    wall_d = "M0 0H%dV%dH0Z" % (W, H) + holes
    b.append('<path d="%s" fill="url(#paper)" fill-rule="evenodd"/>' % wall_d)
    b.append('<path d="%s" fill="url(#wallshade)" fill-rule="evenodd"/>' % wall_d)

    # backsplash tiles behind the counter (y 432-540) with a wooden trim rail
    b.append('<rect x="0" y="432" width="%d" height="108" fill="url(#tiles)"/>' % W)
    b.append('<rect x="-4" y="424" width="%d" height="10" fill="%s" stroke="%s" stroke-width="3"/>' % (W + 8, woodh, woodo))

    # crown moulding at the very top
    b.append('<rect x="-4" y="0" width="%d" height="14" fill="%s"/>' % (W + 8, wood))
    b.append('<rect x="-4" y="12" width="%d" height="5" fill="%s"/>' % (W + 8, woodo))
    b.append('<rect x="-4" y="2" width="%d" height="3" fill="%s"/>' % (W + 8, woodh))

    # --- windows
    for x0, x1 in WIN_OPEN:
        y0, y1 = WIN_Y
        fx0, fx1, fy0, fy1 = x0 - FRAME, x1 + FRAME, y0 - FRAME, y1
        cx = (x0 + x1) / 2
        # soft shadow cast on the wallpaper around the frame
        b.append('<path d="M%d %dH%dV%dH%dZM%d %dH%dV%dH%dZ" fill="#5a3a20" opacity="0.10" fill-rule="evenodd"/>' % (
            fx0 - 2, fy0 + 4, fx1 + 6, fy1 + 30, fx0 - 2, x0, y0, x1, y1, x0))
        # frame ring
        ring = "M%d %dH%dV%dH%dZM%d %dH%dV%dH%dZ" % (fx0, fy0, fx1, fy1, fx0, x0, y0, x1, y1, x0)
        b.append('<path d="%s" fill="%s" fill-rule="evenodd" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (ring, wood, woodo))
        # one-step shading: lighter top/left face, darker right inner face
        b.append('<rect x="%d" y="%d" width="%d" height="4" fill="%s"/>' % (fx0 + 3, fy0 + 3, fx1 - fx0 - 6, woodh))
        b.append('<rect x="%d" y="%d" width="5" height="%d" fill="%s"/>' % (x1 - 1, y0, y1 - y0, dark(wood, 0.18)))
        b.append('<rect x="%d" y="%d" width="%d" height="5" fill="%s"/>' % (x0, y0 - 1, x1 - x0, dark(wood, 0.18)))
        # mullions (cross)
        mx, my = cx, (y0 + y1) / 2
        b.append('<rect x="%s" y="%d" width="10" height="%d" fill="%s" stroke="%s" stroke-width="3"/>' % (f1(mx - 5), y0, y1 - y0, wood, woodo))
        b.append('<rect x="%d" y="%s" width="%d" height="10" fill="%s" stroke="%s" stroke-width="3"/>' % (x0, f1(my - 5), x1 - x0, wood, woodo))
        b.append('<rect x="%s" y="%s" width="12" height="12" fill="%s"/>' % (f1(mx - 6), f1(my - 6), wood))
        b.append('<rect x="%s" y="%d" width="3" height="%d" fill="%s"/>' % (f1(mx - 3), y0 + 2, y1 - y0 - 4, woodh))
        # curtain rod with finials (curtains pivot here)
        b.append('<rect x="%d" y="94" width="%d" height="7" rx="3.5" fill="url(#copper)" stroke="#7a4424" stroke-width="2.5"/>' % (fx0 - 16, fx1 - fx0 + 32))
        for ex in (fx0 - 18, fx1 + 18):
            b.append(circle(ex, 97.5, 8, "#c97a45", ' stroke="#7a4424" stroke-width="2.5"'))
            b.append(circle(ex - 2, 95, 2.5, "#f3c497"))
        # sill
        sx0, sx1 = fx0 - 14, fx1 + 14
        b.append('<rect x="%d" y="%d" width="%d" height="26" fill="#5a3a20" opacity="0.14"/>' % (sx0 + 4, y1 + 14, sx1 - sx0))
        b.append('<rect x="%d" y="%d" width="%d" height="8" rx="2" fill="%s" stroke="%s" stroke-width="3"/>' % (sx0, y1 - 2, sx1 - sx0, woodh, woodo))
        b.append('<rect x="%d" y="%d" width="%d" height="14" rx="2" fill="%s" stroke="%s" stroke-width="3"/>' % (sx0 + 6, y1 + 5, sx1 - sx0 - 12, wood, woodo))
        b.append('<rect x="%d" y="%d" width="%d" height="4" fill="%s"/>' % (sx0 + 9, y1 + 14, sx1 - sx0 - 18, dark(wood, 0.15)))
        # herb pots on the sill (bottom at y1-2)
        for i, px in enumerate((x0 + 46, x0 + 110, x1 - 60)):
            b.append(herb_pot(px, y1 - 1, (i + (0 if x0 < 600 else 1)) % 4 + (i == 2) * 0, rng))

    # --- clock in the middle gap (x = 600), up high
    cx, cy, r = 600, 78, 27
    b.append(circle(cx + 2, cy + 4, r + 4, "#5a3a20", ' opacity="0.13"'))
    b.append(circle(cx, cy, r + 4, "#d77d5f", ' stroke="#9a4f38" stroke-width="4"'))
    b.append(circle(cx, cy, r - 3, "#fbf3df", ' stroke="#c9b48a" stroke-width="2"'))
    for i in range(12):
        a = i * math.pi / 6
        rr = r - 8 if i % 3 else r - 10
        b.append('<path d="M%s %sL%s %s" stroke="#9a7a58" stroke-width="%s" stroke-linecap="round"/>' % (
            f1(cx + math.cos(a) * rr), f1(cy + math.sin(a) * rr), f1(cx + math.cos(a) * (r - 6)), f1(cy + math.sin(a) * (r - 6)),
            "3" if i % 3 == 0 else "2"))
    b.append('<path d="M%d %dL%d %d" stroke="#5c4632" stroke-width="3.5" stroke-linecap="round"/>' % (cx, cy, cx + 9, cy - 9))
    b.append('<path d="M%d %dL%d %d" stroke="#5c4632" stroke-width="3" stroke-linecap="round"/>' % (cx, cy, cx - 3, cy + 15))
    b.append(circle(cx, cy, 3.5, "#d77d5f"))
    b.append(circle(cx - 10, cy - 12, 4, "#ffffff", ' opacity="0.7"'))
    # a small hanging tea towel below the clock area? keep the band calm: only a tiny hook rail lower on the wall
    # little row of cookbooks on a low ledge above the backsplash (centre gap)
    ledge = ""
    ledge += '<rect x="548" y="410" width="104" height="8" rx="2" fill="%s" stroke="%s" stroke-width="3"/>' % (woodh, woodo)
    bx = 556
    for wdt, hgt, col in [(12, 30, "#c9675a"), (10, 26, "#7f9fb4"), (14, 32, "#e3b75a"), (11, 24, "#9ab07f"), (13, 29, "#b48aa8")]:
        ledge += '<rect x="%d" y="%d" width="%d" height="%d" rx="1.5" fill="%s" stroke="%s" stroke-width="2.5"/>' % (bx, 410 - hgt, wdt, hgt, col, dark(col, 0.35))
        ledge += '<rect x="%d" y="%d" width="%d" height="3" fill="%s"/>' % (bx + 2, 410 - hgt + 6, wdt - 4, light(col, 0.35))
        bx += wdt + 2
    ledge += jar(634, 410, 18, 22, "#e9eef0", "#d77d5f", "#e8c98a", 14)
    b.append(ledge)

    # --- high open shelf over the seam gap (centre x = 1200 == 0)
    shelf = '<g>'
    shelf += '<rect x="1140" y="104" width="120" height="10" rx="2" fill="%s" stroke="%s" stroke-width="3"/>' % (woodh, woodo)
    shelf += '<rect x="1144" y="112" width="112" height="4" fill="%s" opacity="0.6"/>' % dark(wood, 0.2)
    for bx2 in (1154, 1246):
        shelf += '<path d="M%d 114 v14 l10 -14z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>' % (bx2 if bx2 < 1200 else bx2 - 10, wood, woodo)
    shelf += circle(1164, 84, 20, "#9fbfd2", ' stroke="%s" stroke-width="3"' % dark("#9fbfd2", 0.35))
    shelf += circle(1164, 84, 12, "none", ' stroke="%s" stroke-width="2"' % dark("#9fbfd2", 0.18))
    shelf += jar(1198, 104, 22, 32, "#e9eef0", "#d77d5f", "#e6c57a", 21)   # pasta
    shelf += jar(1226, 104, 18, 24, "#e9eef0", "#8fa77f", "#c96a52", 13)   # beans
    shelf += jar(1248, 104, 16, 28, "#e9eef0", "#e3b75a", "#f4efe0", 18)   # flour
    shelf += '</g>'
    b.append(wrap(shelf, 1200, 64, W))

    # --- copper hanging rail across the full width at y 34-46 (centre y = 40), brackets every 300 px
    b.append('<rect x="-4" y="46" width="%d" height="5" fill="#5a3a20" opacity="0.16"/>' % (W + 8))
    for bxp in (150, 450, 750, 1050):
        b.append('<path d="M%d 22 h16 v8 h-5 v20 h-6 v-20 h-5z" fill="#a8683c" stroke="#6e3c20" stroke-width="3" stroke-linejoin="round"/>' % (bxp - 8))
        b.append(circle(bxp, 26, 2.4, "#f3c497"))
    b.append('<rect x="-4" y="34" width="%d" height="12" fill="url(#copper)"/>' % (W + 8))
    b.append('<path d="M-4 34H%dM-4 46H%d" stroke="#7a4424" stroke-width="3"/>' % (W + 4, W + 4))
    b.append('<rect x="-4" y="37" width="%d" height="2.5" fill="#ffd9b0" opacity="0.8"/>' % (W + 8))

    write("room/wall.svg", svg(W, H, "".join(b), defs))


# ---------------------------------------------------------------- counter
def gen_counter():
    W, H = 600, 70
    top = "#e2b57a"
    topo = "#9c6b3c"
    edge = "#c68e52"
    cab = "#8fa77f"
    cabo = "#5f7752"
    cabh = "#a9bf98"
    knob = "#e0b04a"
    b = []
    b.append('<rect x="0" y="0" width="%d" height="%d" fill="%s"/>' % (W, H, dark(cab, 0.3)))  # carcass
    # drawers: 3 per tile on a 200 px period
    for i in range(3):
        x0 = i * 200 + 8
        b.append('<rect x="%d" y="25" width="184" height="50" rx="4" fill="%s" stroke="%s" stroke-width="4"/>' % (x0, cab, cabo))
        b.append('<rect x="%d" y="33" width="168" height="34" rx="3" fill="none" stroke="%s" stroke-width="2.5"/>' % (x0 + 8, cabo))
        b.append('<rect x="%d" y="30" width="172" height="3" fill="%s"/>' % (x0 + 6, cabh))
        b.append('<rect x="%d" y="35" width="6" height="30" fill="%s" opacity="0.7"/>' % (x0 + 166, dark(cab, 0.15)))
        kx = x0 + 92
        b.append('<rect x="%d" y="44" width="36" height="9" rx="4.5" fill="%s" stroke="%s" stroke-width="3"/>' % (kx - 18, knob, dark(knob, 0.4)))
        b.append('<rect x="%d" y="46" width="14" height="2.5" rx="1.2" fill="#fff1c0"/>' % (kx - 13))
    # top: 10 px lighter lip + front edge band
    b.append('<rect x="-4" y="0" width="%d" height="20" fill="%s"/>' % (W + 8, edge))
    b.append('<rect x="-4" y="0" width="%d" height="10" fill="%s"/>' % (W + 8, top))
    b.append('<rect x="-4" y="1" width="%d" height="2.5" fill="#f6d8a8"/>' % (W + 8))
    b.append('<path d="M-4 10H%dM-4 20H%d" stroke="%s" stroke-width="2.5"/>' % (W + 4, W + 4, topo))
    b.append('<rect x="-4" y="21" width="%d" height="4" fill="#3a2a1a" opacity="0.25"/>' % (W + 8))
    # butcher-block seams on the front band (period 75)
    for i in range(8):
        x = i * 75 + 30
        b.append('<path d="M%d 11v8" stroke="%s" stroke-width="2" opacity="0.6"/>' % (x, topo))
    rng = random.Random(77)
    for i in range(10):
        x = rng.uniform(0, W)
        w = rng.uniform(30, 70)
        el = '<path d="M%s 6h%s" stroke="%s" stroke-width="1.5" stroke-linecap="round" opacity="0.45"/>' % (f1(x), f1(w), topo)
        b.append(wrap(el, x + w / 2, w / 2 + 2, W))
        x2 = rng.uniform(0, W)
        el = '<path d="M%s 15h%s" stroke="%s" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>' % (f1(x2), f1(w * 0.7), topo)
        b.append(wrap(el, x2 + w * 0.35, w * 0.35 + 2, W))
    write("room/counter.svg", svg(W, H, "".join(b)))


# ---------------------------------------------------------------- curtain
def gen_curtain():
    W, H = 120, 300
    base = "#e59a8a"   # dusty rose
    band = "#cf7f70"
    o = "#a85a4e"
    defs = ('<pattern id="ging" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">'
            '<rect width="16" height="16" fill="#fbeee6"/>'
            '<rect x="0" y="0" width="8" height="16" fill="%s" opacity="0.55"/>'
            '<rect x="0" y="0" width="16" height="8" fill="%s" opacity="0.55"/>'
            '</pattern>'
            '<linearGradient id="folds" x1="0" y1="0" x2="1" y2="0">' % (base, base))
    # fold shading as a repeating gradient across the width
    n = 5
    for i in range(n * 2 + 1):
        t = i / (n * 2)
        defs += '<stop offset="%.3f" stop-color="#7a3a30" stop-opacity="%s"/>' % (t, "0" if i % 2 == 0 else "0.22")
    defs += '</linearGradient>'
    # outline: gathered top (narrow), flares down, wavy hem
    hem = ""
    pts = [(14, 288), (32, 296), (50, 289), (70, 297), (88, 289), (106, 296)]
    d = "M38 8 C30 60 6 150 4 284 "
    for i, (x, y) in enumerate(pts):
        d += "Q%d %d %d %d " % (x - 9, y + (6 if i % 2 else -2), x, y)
    d += "Q112 292 116 284 C114 150 90 60 82 8 Z"
    clip = '<clipPath id="cc"><path d="%s"/></clipPath>' % d
    defs += clip
    b = []
    b.append('<path d="%s" fill="url(#ging)"/>' % d)
    b.append('<g clip-path="url(#cc)"><rect x="0" y="0" width="120" height="300" fill="url(#folds)"/>'
             '<path d="M70 10 C78 80 98 170 106 296 L120 296 L120 0Z" fill="#7a3a30" opacity="0.12"/></g>')
    b.append('<path d="%s" fill="none" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (d, o))
    # fold lines
    for fx in (46, 60, 74):
        b.append('<path d="M%d 22 C%d 100 %d 200 %d 286" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>' % (
            fx, fx + (fx - 60) * 0.3, fx + (fx - 60) * 1.0, fx + (fx - 60) * 1.6, o))
    # ruffled header gathered at top
    b.append('<path d="M30 2 Q36 16 44 6 Q52 18 60 6 Q68 18 76 6 Q84 16 90 2 Z" fill="%s" stroke="%s" stroke-width="3.5" stroke-linejoin="round"/>' % (band, o))
    b.append('<rect x="34" y="0" width="52" height="7" rx="3.5" fill="%s" stroke="%s" stroke-width="3"/>' % (band, o))
    # rings
    for rx in (42, 60, 78):
        b.append(circle(rx, 2, 3.5, "#d9945a", ' stroke="#8a5530" stroke-width="2"'))
    write("room/curtain.svg", svg(W, H, "".join(b), defs))


# ---------------------------------------------------------------- frost
def gen_frost():
    """Soft frosted corner: a milky gradient, a scalloped frost crust along the corner and
    small six-armed crystals. No long radial lines (they read as cobwebs)."""
    W, H = 300, 220
    rng = random.Random(42)
    defs = ('<radialGradient id="fr" cx="0" cy="0" r="1" gradientTransform="scale(1 1)">'
            '<stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/>'
            '<stop offset="0.45" stop-color="#eef6ff" stop-opacity="0.3"/>'
            '<stop offset="1" stop-color="#eef6ff" stop-opacity="0"/></radialGradient>')
    b = ['<rect width="%d" height="%d" fill="url(#fr)"/>' % (W, H)]
    # scalloped crust: a quarter-ellipse edge made of bumps
    for layer, (rx, ry, op) in enumerate([(190, 140, 0.28), (130, 96, 0.38), (78, 58, 0.5)]):
        n = 9
        d = "M0 0 L%s 0 " % f1(rx)
        prev = (rx, 0.0)
        for i in range(1, n + 1):
            t = (math.pi / 2) * i / n
            p = (rx * math.cos(t), ry * math.sin(t))
            mx, my = (prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2
            k = 1.16 + rng.uniform(-0.04, 0.06)
            d += "Q%s %s %s %s " % (f1(mx * k), f1(my * k), f1(p[0]), f1(p[1]))
            prev = p
        d += "Z"
        b.append('<path d="%s" fill="#ffffff" opacity="%.2f"/>' % (d, op))
    # crystals
    def crystal(cx, cy, r, op):
        g = '<g stroke="#ffffff" stroke-width="%s" stroke-linecap="round" opacity="%.2f">' % (f1(max(1.2, r / 7)), op)
        for i in range(6):
            a = i * math.pi / 3 + 0.2
            g += '<path d="M%s %sL%s %s"/>' % (f1(cx), f1(cy), f1(cx + math.cos(a) * r), f1(cy + math.sin(a) * r))
            px, py = cx + math.cos(a) * r * 0.55, cy + math.sin(a) * r * 0.55
            for sgn in (-1, 1):
                bb = a + sgn * 0.75
                g += '<path d="M%s %sL%s %s"/>' % (f1(px), f1(py), f1(px + math.cos(bb) * r * 0.32), f1(py + math.sin(bb) * r * 0.32))
        return g + '</g>'
    spots = [(34, 28, 12), (86, 18, 8), (22, 78, 9), (70, 58, 10), (140, 26, 7), (30, 130, 7),
             (120, 70, 6), (176, 16, 5), (14, 170, 5), (96, 100, 5)]
    for cx, cy, r in spots:
        b.append(crystal(cx, cy, r, 0.85 if r > 7 else 0.6))
    for i in range(26):
        x, y = rng.uniform(0, 210), rng.uniform(0, 160)
        if (x / 210) ** 2 + (y / 160) ** 2 < 1:
            b.append(circle(x, y, rng.choice([1.2, 1.6, 2.2]), "#ffffff", ' opacity="0.75"'))
    write("room/frost.svg", svg(W, H, "".join(b), defs))


# ---------------------------------------------------------------- particles
def gen_particles():
    write("particles/dust.svg", svg(16, 16,
        '<circle cx="8" cy="8" r="8" fill="url(#g)"/>',
        '<radialGradient id="g"><stop offset="0" stop-color="#fffbe6" stop-opacity="1"/>'
        '<stop offset="0.35" stop-color="#fff1b8" stop-opacity="0.7"/>'
        '<stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>'))
    write("particles/raindrop.svg", svg(10, 30,
        '<path d="M8 2 L2.5 27" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>'
        '<circle cx="2.6" cy="26.6" r="1.9" fill="#eef6ff"/>',
        '<linearGradient id="g" x1="8" y1="2" x2="2.5" y2="27" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#dbe9f7" stop-opacity="0"/><stop offset="1" stop-color="#eef6ff" stop-opacity="0.95"/></linearGradient>'))
    arms = ""
    for i in range(6):
        a = i * math.pi / 3 - math.pi / 2
        x2, y2 = 12 + math.cos(a) * 10, 12 + math.sin(a) * 10
        arms += '<path d="M12 12L%s %s" />' % (f1(x2), f1(y2))
        for t, l in ((0.55, 3.6),):
            px, py = 12 + math.cos(a) * 10 * t, 12 + math.sin(a) * 10 * t
            for s in (-1, 1):
                b2 = a + s * 0.8
                arms += '<path d="M%s %sL%s %s"/>' % (f1(px), f1(py), f1(px + math.cos(b2) * l), f1(py + math.sin(b2) * l))
    write("particles/snowflake.svg", svg(24, 24,
        '<circle cx="12" cy="12" r="12" fill="url(#g)"/>'
        '<g stroke="#ffffff" stroke-width="2" stroke-linecap="round">%s</g>'
        '<circle cx="12" cy="12" r="2.4" fill="#ffffff"/>' % arms,
        '<radialGradient id="g"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>'
        '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>'))
    write("particles/steam.svg", svg(64, 64,
        '<circle cx="32" cy="36" r="26" fill="url(#g)"/>'
        '<circle cx="22" cy="28" r="16" fill="url(#g)"/>'
        '<circle cx="42" cy="26" r="15" fill="url(#g)"/>'
        '<circle cx="32" cy="20" r="13" fill="url(#g)"/>'
        '<circle cx="32" cy="32" r="22" fill="none" stroke="#9db8c9" stroke-opacity=".45" stroke-width="2"/>',
        '<radialGradient id="g"><stop offset="0" stop-color="#eef6fb" stop-opacity="0.85"/>'
        '<stop offset="0.55" stop-color="#e2eef6" stop-opacity="0.45"/>'
        '<stop offset="1" stop-color="#d8e7f1" stop-opacity="0"/></radialGradient>'))
    write("particles/wind.svg", svg(120, 16,
        '<path d="M4 10 C30 4 60 14 86 8 C100 5 108 6 112 9 C116 12 110 15 106 12" fill="none" stroke="url(#g)" stroke-width="4" stroke-linecap="round"/>'
        '<path d="M24 13 C44 10 60 14 76 12" fill="none" stroke="url(#g)" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>',
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0" stop-color="#6f9fc0" stop-opacity="0"/><stop offset="0.5" stop-color="#6f9fc0" stop-opacity="0.9"/>'
        '<stop offset="1" stop-color="#6f9fc0" stop-opacity="0.6"/></linearGradient>'))
    star = "M16 2 Q18.5 13.5 30 16 Q18.5 18.5 16 30 Q13.5 18.5 2 16 Q13.5 13.5 16 2Z"
    write("particles/sparkle.svg", svg(32, 32,
        '<circle cx="16" cy="16" r="15" fill="url(#g)"/>'
        '<path d="%s" fill="#ffd54a" stroke="#e0a21c" stroke-width="2" stroke-linejoin="round"/>'
        '<path d="M16 8 Q17 15 22 16 Q17 17 16 22 Q15 17 10 16 Q15 15 16 8Z" fill="#fff4b8"/>' % star,
        '<radialGradient id="g"><stop offset="0" stop-color="#fff2a8" stop-opacity="0.6"/>'
        '<stop offset="1" stop-color="#fff2a8" stop-opacity="0"/></radialGradient>'))
    write("particles/bit.svg", svg(16, 16,
        '<path d="M2 13 C2 6 7 2 14 2 C14 9 9 14 2 13Z" fill="#4cb944" stroke="#2f8a2e" stroke-width="1.6" stroke-linejoin="round"/>'
        '<path d="M3.5 12 L11 5" stroke="#d9f5c8" stroke-width="1.3" stroke-linecap="round"/>'))
    # outside_leaf: a small maple-ish autumn leaf
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * 2 * math.pi / 10
        r = 8.6 if i % 2 == 0 else 4.4
        if i in (4, 6):
            r = 6.4
        pts.append((10 + math.cos(a) * r, 9.5 + math.sin(a) * r))
    d = "M" + " L".join("%s %s" % (f1(x), f1(y)) for x, y in pts) + "Z"
    write("particles/outside_leaf.svg", svg(20, 20,
        '<path d="%s" fill="#e8822e" stroke="#b85a1a" stroke-width="1.5" stroke-linejoin="round"/>'
        '<path d="M10 9.5 L10 19 M10 10 L5 6 M10 10 L15 6" stroke="#f7c27a" stroke-width="1.2" stroke-linecap="round"/>' % d))


def gen_palette():
    pal = {}
    for k, z in ZONES.items():
        pal[k] = {"tint": z["tint"], "tintAlpha": z["tintAlpha"], "sky": z["skyKey"], "music": z["music"], "banner": z["banner"]}
    write("levels/palette.json", json.dumps(pal, indent=2) + "\n")


if __name__ == "__main__":
    for i, (name, z) in enumerate(ZONES.items()):
        gen_outside(name, z, 100 + i)
    gen_wall()
    gen_counter()
    gen_curtain()
    gen_frost()
    gen_particles()
    gen_palette()
