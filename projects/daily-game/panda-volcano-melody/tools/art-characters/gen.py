#!/usr/bin/env python3
"""Character art generator for Tofu's Volcano Melody.

Writes every character / note / pickup / HUD / icon SVG into game/assets/default/.
100 % original, hand-built geometry. Python 3 stdlib only.

    python3 tools/art-characters/gen.py

Contract (docs/DESIGN.md, section 4):
  tofu_*.svg   viewBox 0 0 120 120, drawn 72x72, ground point (60,114), faces right
  crab_*.svg   viewBox 0 0 100 80,  drawn 56x45, ground point (50,76), symmetric
  coco_*.svg   viewBox 0 0 120 100, drawn 64x53, body centre (60,50), faces right
  note_*.svg   viewBox 0 0 64 64,   drawn 40x40, centre (32,32)
  mango.svg    viewBox 0 0 64 64,   drawn 36x36, centre (32,32)
  heart_*.svg  viewBox 0 0 40 36,   drawn 26x24
  icon.svg     viewBox 0 0 256 256

Style: outline = darker shade of the fill (never pure black), ~3.5-4 px at
drawn size, one shadow shape + one highlight per part, round joins/caps.
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "game", "assets", "default"))


# ------------------------------------------------------------------ helpers --
def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def svg(w, h, body, defs=""):
    d = f"<defs>{defs}</defs>" if defs else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}">{d}{body}</svg>\n')


def write(name, content):
    for bad in ("<text", "<script", "<image", "href=\"http", "font"):
        assert bad not in content, (name, bad)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
        fh.write(content)


def ell(cx, cy, rx, ry, fill, ol=None, sw=0, rot=0, extra=""):
    t = f' transform="rotate({f(rot)} {f(cx)} {f(cy)})"' if rot else ""
    s = f' stroke="{ol}" stroke-width="{f(sw)}"' if ol else ""
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{fill}"{s}{t}{extra}/>'


def path(d, fill="none", ol=None, sw=0, extra=""):
    s = f' stroke="{ol}" stroke-width="{f(sw)}" stroke-linejoin="round" stroke-linecap="round"' if ol else ""
    return f'<path d="{d}" fill="{fill}"{s}{extra}/>'


def line(d, col, w, extra=""):
    return (f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{f(w)}" '
            f'stroke-linecap="round" stroke-linejoin="round"{extra}/>')


def outlined(shapes, fill, ol, sw):
    """Union outline: every shape stroked thick in `ol` first, then all filled.
    `shapes` are (tag-without-paint) strings like '<ellipse cx=.. />'."""
    under = "".join(s.replace("/>", f' fill="{ol}" stroke="{ol}" stroke-width="{f(sw * 2)}" '
                                     f'stroke-linejoin="round" stroke-linecap="round"/>') for s in shapes)
    over = "".join(s.replace("/>", f' fill="{fill}"/>') for s in shapes)
    return under + over


def g(body, tf=""):
    return f'<g transform="{tf}">{body}</g>' if tf else body


def spiral(cx, cy, r, turns, col, w):
    p = []
    n = 28
    for i in range(n + 1):
        t = i / n
        a = t * turns * 2 * math.pi
        rr = r * (0.12 + 0.88 * t)
        p.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = "M" + " L".join(f"{f(x)},{f(y)}" for x, y in p)
    return line(d, col, w)


def zz(x, y, s, col, ol, w):
    d = f"M{f(x)},{f(y)} h{f(s)} l{f(-s)},{f(s)} h{f(s)}"
    return line(d, ol, w + 2.6) + line(d, col, w)


# -------------------------------------------------------------------- Tofu --
T = dict(
    fur="#f7f5f0", fur_sh="#dcd8d2", fur_hl="#ffffff", fur_ol="#7b7884",
    ink="#2b2d3a", ink_sh="#1f2029", ink_hl="#4b4f63", ink_ol="#15161f",
    red="#e8423f", red_sh="#b92f31", red_hl="#ff7d70", red_ol="#8c1d22",
    blush="#ff9aa6", eye="#15161f", eye_w="#ffffff", mouth="#c8404a", tongue="#ff8f9c",
)
SW_T = 6.4                     # 0.6 px/unit -> 3.85 px drawn
BODY = (60, 85, 30, 25)      # cx, cy, rx, ry  (bottom y 109.5)
HEAD = (62, 45, 33, 28.5)      # top y 16.5, bottom y 73.5
SH_BACK, SH_FRONT = (37, 74), (85, 74)


def tofu_arm(shoulder, rot, front):
    sx, sy = shoulder
    fill = T["ink"] if front else T["ink_sh"]
    a = ell(sx, sy + 11, 8, 12.5, fill, T["ink_ol"], SW_T)
    hl = ell(sx + 3, sy + 6, 2.6, 4.5, T["ink_hl"]) if front else ""
    return g(a + hl, f"rotate({f(rot)} {f(sx)} {f(sy)})")


def tofu_leg(cx, cy, front, sit=False):
    fill = T["ink"] if front else T["ink_sh"]
    if sit:   # leg stuck out forward, sole visible
        o = ell(cx, cy, 12, 9.5, fill, T["ink_ol"], SW_T)
        o += ell(cx + 2, cy + 0.5, 6, 5.2, "#5b5f72")
        for dx in (-3.5, 2, 7):
            o += ell(cx + dx, cy - 5, 1.8, 1.6, "#5b5f72")
        return o
    o = ell(cx, cy, 9.8, 8.5, fill, T["ink_ol"], SW_T)
    if front:
        o += ell(cx + 3, cy - 4, 3, 2.2, T["ink_hl"])
    return o


def tofu_body(dy=0):
    cx, cy, rx, ry = BODY
    cy += dy
    o = ell(cx, cy, rx, ry, T["fur"], T["fur_ol"], SW_T)
    # one-step shadow: lower-left crescent (light from upper right)
    o += (f'<clipPath id="bc"><ellipse cx="{cx}" cy="{f(cy)}" rx="{rx - 2}" ry="{f(ry - 2)}"/></clipPath>'
          f'<g clip-path="url(#bc)">{ell(cx + 9, cy - 7, rx, ry, T["fur_sh"])}'
          f'{ell(cx + 9, cy - 7, rx, ry, T["fur"])}</g>')
    # belly patch highlight
    o += ell(cx + 9, cy - 6, 8, 6, T["fur_hl"], rot=-20)
    return o


def tofu_scarf_tail(phase, dy=0):
    # tail trails behind (left) from the knot; phase -1..1 flutters it
    kx, ky = 40, 75 + dy
    tx, ty = 20 - 3 * phase, 95 + dy + 3 * phase
    d = (f"M{kx},{f(ky - 4)} Q{f(kx - 12)},{f(ky + 2 + 2 * phase)} {f(tx)},{f(ty - 4)} "
         f"L{f(tx + 2)},{f(ty + 5)} L{f(tx + 7)},{f(ty + 1)} "
         f"Q{f(kx - 6)},{f(ky + 12)} {kx + 4},{f(ky + 5)} Z")
    return path(d, T["red_sh"], T["red_ol"], SW_T * 0.85)


def tofu_scarf_band(dy=0):
    d = (f"M34,{69 + dy} Q62,{84 + dy} 89,{67 + dy} L90,{75 + dy} "
         f"Q62,{92 + dy} 33,{77 + dy} Z")
    o = path(d, T["red"], T["red_ol"], SW_T * 0.85)
    o += line(f"M40,{f(77.5 + dy)} Q62,{f(88 + dy)} 84,{f(76.5 + dy)}", T["red_sh"], 3.2)
    o += line(f"M70,{f(78 + dy)} Q78,{f(76 + dy)} 84,{f(72 + dy)}", T["red_hl"], 2.4)
    # knot on the shoulder side
    o += ell(40, 76 + dy, 6.5, 6, T["red"], T["red_ol"], SW_T * 0.7)
    o += ell(41.5, 74 + dy, 2, 1.6, T["red_hl"])
    return o


def tofu_head(expr, dy=0, rot=0):
    hx, hy, rx, ry = HEAD
    hy += dy
    o = ""
    # ears (behind the head)
    for (ex, ey, r) in ((37, 21, 11), (84, 18, 11.5)):
        o += ell(ex, ey + dy, r, r, T["ink"], T["ink_ol"], SW_T)
        o += ell(ex + 1.5, ey + dy + 1.5, r * 0.45, r * 0.45, T["ink_hl"])
    o += ell(hx, hy, rx, ry, T["fur"], T["fur_ol"], SW_T)
    o += (f'<clipPath id="hc"><ellipse cx="{hx}" cy="{f(hy)}" rx="{rx - 2}" ry="{f(ry - 2)}"/></clipPath>'
          f'<g clip-path="url(#hc)">{ell(hx, hy, rx, ry, T["fur_sh"])}'
          f'{ell(hx + 7, hy - 5, rx - 1, ry - 1, T["fur"])}</g>')
    o += ell(hx + 14, hy - 17, 7, 3.6, T["fur_hl"], rot=18)
    # eye patches (3/4 view: face centre shifted right)
    pL, pR = (53, 46 + dy), (79, 45 + dy)
    o += ell(*pL, 9.5, 11.5, T["ink"], rot=28)
    o += ell(*pR, 8.8, 11, T["ink"], rot=-26)
    eL, eR = (54.5, 44 + dy), (79.5, 43 + dy)
    if expr == "open":
        for (x, y) in (eL, eR):
            o += ell(x, y, 4.8, 5.2, T["eye_w"])
            o += ell(x + 1.2, y + 0.6, 3.2, 3.7, T["eye"])
            o += ell(x + 2.2, y - 0.9, 1.3, 1.3, T["eye_w"])
    elif expr == "happy":
        for (x, y) in (eL, eR):
            o += line(f"M{f(x - 4.8)},{f(y + 2.5)} Q{f(x)},{f(y - 5.5)} {f(x + 4.8)},{f(y + 2.5)}", T["eye_w"], 3)
    elif expr == "dizzy":
        o += spiral(eL[0], eL[1], 5.2, 1.7, T["eye_w"], 1.9)
        o += spiral(eR[0], eR[1], 5.0, 1.7, T["eye_w"], 1.9)
    else:  # sleep
        for (x, y) in (eL, eR):
            o += line(f"M{f(x - 4.5)},{f(y)} Q{f(x)},{f(y + 4.5)} {f(x + 4.5)},{f(y)}", T["eye_w"], 2.8)
    # blush
    o += ell(44, 60 + dy, 5, 3, T["blush"], extra=' opacity="0.75"')
    o += ell(90, 58 + dy, 4, 2.8, T["blush"], extra=' opacity="0.75"')
    # nose
    nx, ny = 68.5, 55 + dy
    o += path(f"M{f(nx - 5)},{f(ny - 2)} Q{nx},{f(ny - 4)} {f(nx + 5)},{f(ny - 2)} "
              f"Q{f(nx + 4)},{f(ny + 3)} {nx},{f(ny + 3.6)} Q{f(nx - 4)},{f(ny + 3)} {f(nx - 5)},{f(ny - 2)} Z",
              T["ink"])
    o += ell(nx + 1.5, ny - 1.6, 1.6, 0.9, T["ink_hl"])
    # mouth
    my = ny + 4
    if expr == "happy":
        o += path(f"M{f(nx - 6)},{f(my + 1)} Q{nx},{f(my + 2)} {f(nx + 6)},{f(my + 0.5)} "
                  f"Q{f(nx + 5)},{f(my + 9)} {nx},{f(my + 9)} Q{f(nx - 5)},{f(my + 9)} {f(nx - 6)},{f(my + 1)} Z",
                  T["mouth"], T["ink"], 1.6)
        o += path(f"M{f(nx - 3)},{f(my + 6.4)} Q{nx},{f(my + 4)} {f(nx + 3)},{f(my + 6.2)} "
                  f"Q{nx},{f(my + 8.6)} {f(nx - 3)},{f(my + 6.4)} Z", T["tongue"])
    elif expr == "dizzy":
        o += line(f"M{f(nx - 6)},{f(my + 4)} q2,-2.5 4,0 q2,2.5 4,0 q2,-2.5 4,0", T["ink"], 1.9)
    elif expr == "sleep":
        o += ell(nx, my + 3.2, 2.2, 2.0, T["mouth"], T["ink"], 1.4)
    else:
        o += line(f"M{nx},{f(my - 0.6)} q-1.5,3.6 -5,2.2 M{nx},{f(my - 0.6)} q1.5,3.6 5,2.2", T["ink"], 1.9)
    return g(o, f"rotate({f(rot)} 62 {f(74 + dy)})" if rot else "")


def tofu(pose):
    """pose: idle | walk1 | walk2 | happy | hurt | sleep"""
    legs = {"idle": ((46, 105.5), (73, 105.5)),
            "walk1": ((40, 105.5), (79, 101.5)),
            "walk2": ((47, 101), (69, 105.5))}
    arms = {"idle": (16, -16), "walk1": (36, -36), "walk2": (-4, 6),
            "happy": (128, -128), "hurt": (70, -70), "sleep": (10, 30)}
    tail = {"idle": 0, "walk1": 1, "walk2": -1, "happy": 0.6, "hurt": -0.6, "sleep": 0}
    expr = {"idle": "open", "walk1": "open", "walk2": "open", "happy": "happy",
            "hurt": "dizzy", "sleep": "sleep"}[pose]
    ab, af = arms[pose]
    o = ""
    if pose == "sleep":
        dy = 4.5   # sat down: body rests on the ground at y 114
        o += tofu_arm((SH_BACK[0], SH_BACK[1] + dy), ab, False)
        o += tofu_body(dy)
        o += tofu_leg(41, 106.5, False, sit=True)
        o += tofu_leg(80, 106.5, True, sit=True)
        o += tofu_scarf_tail(tail[pose], dy)
        o += tofu_scarf_band(dy)
        o += tofu_head(expr, dy + 2, rot=-7)
        o += tofu_arm((SH_FRONT[0], SH_FRONT[1] + dy), af, True)
        o += zz(94, 6, 8, "#cfe3ff", "#5a7aa8", 2.6)
        o += zz(105, 0, 5.5, "#cfe3ff", "#5a7aa8", 2.0)
        return svg(120, 120, o)
    lb, lf = legs.get(pose, legs["idle"])
    o += tofu_arm(SH_BACK, ab, False)
    o += tofu_body()
    o += tofu_leg(*lb, False)
    o += tofu_leg(*lf, True)
    o += tofu_scarf_tail(tail[pose])
    o += tofu_scarf_band()
    o += tofu_head(expr)
    o += tofu_arm(SH_FRONT, af, True)
    return svg(120, 120, o)


# -------------------------------------------------------------------- crab --
C = dict(
    shell="#a3abb5", shell_sh="#7f8893", shell_hl="#d3d9df", shell_ol="#4e5661", spot="#8d96a1",
    claw="#ff8a3d", claw_sh="#e2672a", claw_hl="#ffc08f", claw_ol="#a2441a",
    eye_w="#ffffff", eye="#2b2d3a", brow="#3c434d", blush="#ff9e9e",
)
SW_C = 6.6   # 0.56 px/unit -> 3.7 px drawn


def crab_claw(cx, cy, side, open_, down=False):
    """side -1 = left, +1 = right. A round pincer with a wedge mouth."""
    o = ""
    # arm from shell to claw
    ax = 50 + side * 22
    o += line(f"M{ax},{50} Q{f(cx - side * 4)},{f(cy + 10)} {f(cx)},{f(cy + 4)}", C["claw_ol"], 7 + 2 * SW_C * 0.7)
    o += line(f"M{ax},{50} Q{f(cx - side * 4)},{f(cy + 10)} {f(cx)},{f(cy + 4)}", C["claw"], 7)
    r = 11.5
    gap = 52 if open_ else 10
    base = -90 + side * 18 if not down else 90 - side * 25   # mouth direction
    a1 = math.radians(base + gap / 2)
    a2 = math.radians(base - gap / 2 + 360)
    p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
    p2 = (cx + r * math.cos(a2), cy + r * math.sin(a2))
    inner = (cx + 2.5 * math.cos(math.radians(base)), cy + 2.5 * math.sin(math.radians(base)))
    d = (f"M{f(inner[0])},{f(inner[1])} L{f(p1[0])},{f(p1[1])} "
         f"A{r},{r} 0 1 1 {f(p2[0])},{f(p2[1])} Z")
    o += path(d, C["claw"], C["claw_ol"], SW_C * 0.8)
    o += ell(cx - side * 3, cy + 4, 5, 3.5, C["claw_sh"], rot=side * 20)
    o += ell(cx + side * 3.5, cy - 3.5 if not down else cy + 1, 2.6, 1.8, C["claw_hl"], rot=side * -30)
    return o


def crab(frame):
    """frame: 1 | 2 | dizzy"""
    o = ""
    # legs: three per side, thin orange sticks; frames alternate lift
    for side in (-1, 1):
        for i, (bx, by) in enumerate(((27, 58), (31, 64), (37, 68))):
            lift = 0
            if frame == 1:
                lift = 3 if i % 2 == 0 else 0
            elif frame == 2:
                lift = 0 if i % 2 == 0 else 3
            x0 = 50 + side * (50 - bx)
            kx = 50 + side * (50 - bx + 10 - i * 2)
            ky = by + 2 - lift
            fx = 50 + side * (50 - bx + 9 - i * 3)
            fy = 76 - lift
            d = f"M{f(x0)},{by} L{f(kx)},{f(ky)} L{f(fx)},{f(fy)}"
            o += line(d, C["claw_ol"], 4.2 + 2 * SW_C * 0.55)
            o += line(d, C["claw_sh"] if i == 0 else C["claw"], 4.2)
    # shell (pebble)
    o += ell(50, 51, 31, 21, C["shell"], C["shell_ol"], SW_C)
    o += (f'<clipPath id="sc"><ellipse cx="50" cy="51" rx="29" ry="19"/></clipPath>'
          f'<g clip-path="url(#sc)">{ell(50, 51, 31, 21, C["shell_sh"])}{ell(53, 46, 30, 19, C["shell"])}</g>')
    o += ell(63, 38, 7, 3.4, C["shell_hl"], rot=12)
    for (sx, sy, r) in ((33, 47, 2.8), (40, 60, 2.2), (67, 59, 2.6), (59, 48, 1.8)):
        o += ell(sx, sy, r, r * 0.8, C["spot"])
    # claws
    if frame == "dizzy":
        o += crab_claw(13, 63, -1, False, down=True) + crab_claw(87, 63, 1, False, down=True)
    else:
        op = frame == 1
        o += crab_claw(13, 30, -1, op) + crab_claw(87, 30, 1, op)
    # eye stalks + eyes
    for side in (-1, 1):
        sx, ex = 50 + side * 8, 50 + side * 12
        o += line(f"M{sx},36 L{ex},17", C["shell_ol"], 4 + 2 * SW_C * 0.55)
        o += line(f"M{sx},36 L{ex},17", C["shell"], 4)
        o += ell(ex, 14, 7.2, 7.2, C["eye_w"], C["shell_ol"], SW_C * 0.7)
        if frame == "dizzy":
            o += spiral(ex, 14, 5, 1.6, C["eye"], 1.7)
        else:
            o += ell(ex - side * 1.2, 15.5, 3.6, 3.8, C["eye"])
            o += ell(ex - side * 1.2 + 1.2, 14.2, 1.3, 1.3, C["eye_w"])
            # grumpy brow: inner end low
            o += line(f"M{ex - side * 7},{f(7.5)} L{ex + side * 6},{f(3.5)}", C["brow"], 3.2)
    # face on the shell
    o += ell(37, 55, 4, 2.4, C["blush"], extra=' opacity="0.8"')
    o += ell(63, 55, 4, 2.4, C["blush"], extra=' opacity="0.8"')
    if frame == "dizzy":
        o += line("M43,57 q2.3,-2.5 4.6,0 q2.3,2.5 4.6,0 q2.3,-2.5 4.6,0", C["brow"], 2.4)
    else:
        o += line("M44,58 Q50,53 56,58", C["brow"], 2.6)   # small pout
    return svg(100, 80, o)


# -------------------------------------------------------------------- Coco --
P = dict(
    grn="#3cc24a", grn_sh="#2a9a3a", grn_hl="#8fe68a", grn_ol="#1b6a28",
    blue="#2f7de0", blue_ol="#174f9a",
    yel="#ffd23a", yel_sh="#f0ad1e", yel_hl="#fff0a0", yel_ol="#a8730c",
    red="#ec3b3f", red_sh="#c02a30", red_ol="#8c1d22",
    beak="#f5ead2", beak_sh="#d6c6a4", beak_ol="#7f6d4c",
    eye="#2b2d3a", eye_w="#ffffff", cheek="#ffffff", feet="#9aa3ad", feet_ol="#4e5661",
)
SW_P = 7.0   # 0.533 px/unit -> 3.7 px drawn


def coco_wing(up, near):
    """Wing hinged at the shoulder (60,44). up=True raised, else lowered."""
    # drawn as the raised wing; the lowered wing is the same shape flipped
    # about the shoulder line y=46 (so geometry is identical between frames)
    d = ("M50,48 C44,36 36,22 26,8 C30,6 36,6 40,9 C42,5 48,4 52,8 "
         "C55,5 61,6 63,11 C68,20 70,34 68,48 Z")
    tips = "M20,0 L66,0 L66,17 C56,15 44,18 30,22 Z"
    fill = P["grn"] if near else P["grn_sh"]
    cid = "wn" if near else "wf"
    o = path(d, fill, P["grn_ol"], SW_P)
    o += (f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'
          f'<g clip-path="url(#{cid})">{path(tips, P["blue"])}'
          f'{line("M40,9 C42,14 43,17 44,19 M52,8 C53,12 54,15 54,17", P["blue_ol"], 1.8)}</g>')
    if near:
        o += line("M57,42 C55,34 52,28 48,22", P["grn_hl"], 2.6)
    tf = "" if up else "matrix(1 0 0 -1 0 94)"
    o = g(o, tf)
    return o if near else g(o, "translate(9 -3)")


def coco(frame):
    up = frame == 1
    o = ""
    # far wing (opposite phase, peeks out behind)
    o += coco_wing(up, False)
    # tail: three red feathers trailing back-left
    for (dx, dy, l) in ((0, -3, 1.0), (0, 4, 0.9), (2, 9, 0.75)):
        tx, ty = 34 - 30 * l, 60 + dy + 10 * l
        d = (f"M40,{54 + dy * 0.3} Q{f(26 - 4 * l)},{f(56 + dy)} {f(tx)},{f(ty)} "
             f"Q{f(26)},{f(66 + dy)} 42,{62 + dy * 0.3} Z")
        o += path(d, P["red"] if dy != 4 else P["red_sh"], P["red_ol"], SW_P * 0.8)
    o += line("M38,58 Q26,60 12,63", P["red_sh"], 1.8)
    # body
    o += ell(60, 52, 25, 16, P["grn"], P["grn_ol"], SW_P, rot=-14)
    o += (f'<clipPath id="pc"><ellipse cx="60" cy="52" rx="23" ry="14" transform="rotate(-14 60 52)"/></clipPath>'
          f'<g clip-path="url(#pc)">{ell(60, 52, 25, 16, P["grn_sh"], rot=-14)}'
          f'{ell(62, 47, 25, 14, P["grn"], rot=-14)}</g>')
    # feet tucked
    o += ell(56, 68, 4, 2.6, P["feet"], P["feet_ol"], 2.2)
    o += ell(64, 67, 4, 2.6, P["feet"], P["feet_ol"], 2.2)
    # head (yellow)
    o += ell(84, 37, 15.5, 14.5, P["yel"], P["yel_ol"], SW_P)
    o += (f'<clipPath id="ph"><ellipse cx="84" cy="37" rx="13.5" ry="12.5"/></clipPath>'
          f'<g clip-path="url(#ph)">{ell(84, 37, 15.5, 14.5, P["yel_sh"])}{ell(87, 34, 15, 14, P["yel"])}</g>')
    o += ell(88, 27.5, 4.5, 2.4, P["yel_hl"], rot=-15)
    # cheek patch + beak
    o += ell(92, 42, 5.5, 4.5, P["cheek"], extra=' opacity="0.9"')
    o += path("M96,32 C104,31 110,36 109,45 C108,49 105,50 104,47 C103,43 101,42 97,43 Z",
              P["beak"], P["beak_ol"], SW_P * 0.6)
    o += path("M97,43 C101,42 103,44 104,47 C102,49 99,48 97,46 Z", P["beak_sh"])
    # eye
    o += ell(88, 34, 4.4, 4.8, P["eye_w"], P["yel_ol"], 1.4)
    o += ell(89.2, 34.6, 2.7, 3.1, P["eye"])
    o += ell(90, 33.3, 1, 1, P["eye_w"])
    # near wing
    o += coco_wing(up, True)
    return svg(120, 100, o)


# ------------------------------------------------------------------- notes --
N = [("#e8383c", "#9c1f26", "#ff8f8a"),   # 0 red quarter
     ("#2f7de0", "#174f9a", "#8fc0ff"),   # 1 blue eighth
     ("#2fae4a", "#17702c", "#8fe39a"),   # 2 green beamed pair
     ("#9b4fd6", "#5e2590", "#d4a6ff")]   # 3 purple half
SW_N = 6.0   # 0.625 px/unit -> 3.75 px drawn
HALO = ('<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">'
        '<stop offset="0" stop-color="#fff6dc" stop-opacity="0.95"/>'
        '<stop offset="0.62" stop-color="#fff6dc" stop-opacity="0.85"/>'
        '<stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient>')


def note_head(cx, cy):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="10" ry="7.6" transform="rotate(-24 {cx} {cy})"/>'


def stem(x, y0, y1, w=5):
    return f'<rect x="{f(x - w / 2)}" y="{y0}" width="{w}" height="{y1 - y0}" rx="2"/>'


def note(kind):
    fill, ol, hl = N[kind]
    shapes = []
    hls = ""
    if kind in (0, 1, 3):
        hx, hy = 27, 45
        shapes += [note_head(hx, hy), stem(35.5, 12, 45)]
        if kind == 1:
            shapes.append('<path d="M33,12 C36,20 46,20 46,30 C46,35 44,38 42,40 '
                          'C43,34 41,28 33,26 Z"/>')
        hls += ell(hx - 3, hy - 2.5, 3.2, 1.8, hl, rot=-24)
        hls += f'<rect x="34.5" y="15" width="1.8" height="16" rx="0.9" fill="{hl}"/>'
    else:
        shapes += [note_head(19, 47), note_head(43, 43), stem(27.5, 16, 47), stem(51.5, 12, 43),
                   '<path d="M25,14 L54,9 L54,19 L25,24 Z"/>']
        hls += ell(16, 44.5, 3.2, 1.8, hl, rot=-24) + ell(40, 40.5, 3.2, 1.8, hl, rot=-24)
        hls += line("M28,16 L51,12", hl, 1.8)
    o = f'<circle cx="32" cy="32" r="31" fill="url(#halo)"/>'
    o += outlined(shapes, fill, ol, SW_N / 2 + 0.2)
    if kind == 3:   # hollow head
        o += f'<ellipse cx="27" cy="45" rx="5.2" ry="2.6" transform="rotate(-24 27 45)" fill="#fff6dc"/>'
        hls = hls.replace(ell(24, 42.5, 3.2, 1.8, hl, rot=-24), "")
    o += hls
    return svg(64, 64, o, HALO)


# ------------------------------------------------------------------- mango --
def mango():
    M = dict(f="#ffb428", sh="#f0891a", blush="#ff6a3d", ol="#a8520e", hl="#fff1b8",
             leaf="#4caf50", leaf_sh="#2e8a36", leaf_ol="#1e5e25", stem="#7a5230")
    # kidney-shaped, tilted: fat bottom-left, stem shoulder top-right
    body = ("M12,47 C5,38 9,24 21,17 C32,10 46,9 52,14 C56,18 54,23 51,27 "
            "C47,33 47,42 41,50 C35,57 19,57 12,47 Z")
    o = path(body, M["f"], M["ol"], 6.2)
    o += (f'<clipPath id="mc"><path d="{body}"/></clipPath><g clip-path="url(#mc)">'
          f'{ell(20, 46, 24, 16, M["sh"], rot=-40)}{ell(27, 37, 24, 17, M["f"], rot=-40)}'
          f'{ell(43, 18, 13, 9, M["blush"], rot=-30, extra=" opacity=\"0.8\"")}</g>')
    # tiny heart highlight
    hx, hy = 26, 26
    o += path(f"M{hx},{hy + 3.5} C{hx - 5.5},{hy} {hx - 4.5},{hy - 4.5} {hx},{hy - 2} "
              f"C{hx + 4.5},{hy - 4.5} {hx + 5.5},{hy} {hx},{hy + 3.5} Z", M["hl"])
    o += line("M49,14 Q51,9 54,7", M["stem"], 3.2)
    o += path("M52,9 C52,3 44,0 37,3 C40,9 47,11 52,9 Z", M["leaf"], M["leaf_ol"], 3.2)
    o += line("M50,8 C46,6 42,4 39,4", M["leaf_sh"], 1.4)
    return svg(64, 64, o)


# ------------------------------------------------------------------ hearts --
HEART = "M20,32 C9,25 3,18 3,11.5 C3,6 7,3 11.5,3 C15.5,3 18.5,5.5 20,9 C21.5,5.5 24.5,3 28.5,3 C33,3 37,6 37,11.5 C37,18 31,25 20,32 Z"


def heart(full):
    if full:
        o = path(HEART, "#ff4d6a", "#a8213b", 5.4)
        o += (f'<clipPath id="hc"><path d="{HEART}"/></clipPath><g clip-path="url(#hc)">'
              f'{ell(14, 24, 18, 14, "#d9344f")}{ell(18, 16, 19, 14, "#ff4d6a")}</g>')
        o += ell(11.5, 10, 4, 2.6, "#ffb3c1", rot=-30)
    else:
        o = path(HEART, "#efe2e6", "#9e8890", 5.4, extra=' fill-opacity="0.85"')
        o += path("M20,26 C13,21 9,17 9,12.5", fill="none", ol="#d2c0c6", sw=2.2)
    return svg(40, 36, o)


# -------------------------------------------------------------------- icon --
def icon():
    o = '<circle cx="128" cy="128" r="120" fill="#3cc8c8" stroke="#1f8a8f" stroke-width="10"/>'
    o += '<circle cx="128" cy="128" r="100" fill="none" stroke="#86e3df" stroke-width="6" opacity="0.8"/>'
    o += ell(150, 70, 34, 18, "#5fd8d4", rot=-25, extra=' opacity="0.7"')
    # Tofu's head + scarf, scaled up
    head = tofu_scarf_band() + tofu_head("open")
    o += g(head, "translate(10 58) scale(1.75)")
    # a red quarter note bubble at the top-right
    nb = note(0).split(">", 1)[1].rsplit("</svg>", 1)[0]
    o += g(nb, "translate(160 30) scale(1.2)")
    return svg(256, 256, o)


# -------------------------------------------------------------------- main --
def main():
    os.makedirs(OUT, exist_ok=True)
    for p in ("idle", "walk1", "walk2", "happy", "hurt", "sleep"):
        write(f"tofu_{p}.svg", tofu(p))
    write("crab_1.svg", crab(1))
    write("crab_2.svg", crab(2))
    write("crab_dizzy.svg", crab("dizzy"))
    write("coco_1.svg", coco(1))
    write("coco_2.svg", coco(2))
    for k in range(4):
        write(f"note_{k}.svg", note(k))
    write("mango.svg", mango())
    write("heart_full.svg", heart(True))
    write("heart_empty.svg", heart(False))
    write("icon.svg", icon())
    print("wrote character SVGs to", OUT)


if __name__ == "__main__":
    main()
