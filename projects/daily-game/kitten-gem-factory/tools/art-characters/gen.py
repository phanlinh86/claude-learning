#!/usr/bin/env python3
"""Character art generator for Comet's Gem Factory.

Writes every character / gem / emblem / icon SVG into game/assets/default/.
100 % original, hand-written geometry. Python 3 stdlib only.

    python3 tools/art-characters/gen.py

Contract (docs/DESIGN.md, section 4):
  kitten_*.svg  viewBox 0 0 120 110, body centre (60,58), faces right, nozzle (24,86)
  gizmo_*.svg   viewBox 0 0 160 220, feet bottom-centre (80,220), hopper mouth (80,25)
  gem_*.svg     viewBox 0 0 100 100, centre (50,50), ~80 % of the box
  card_emblem   0 0 64 64,  icon 0 0 256 256
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "game", "assets", "default"))


def f(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def pts(points):
    return " ".join(f"{f(x)},{f(y)}" for x, y in points)


def svg(vb_w, vb_h, body, defs=""):
    d = f"<defs>{defs}</defs>" if defs else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w} {vb_h}" '
            f'width="{vb_w}" height="{vb_h}">{d}{body}</svg>\n')


def write(name, content):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
        fh.write(content)


def sparkle(x, y, s, col="#ffffff", op=1.0):
    p = []
    for k in range(8):
        a = -math.pi / 2 + k * math.pi / 4
        r = s if k % 2 == 0 else s * 0.24
        p.append((x + r * math.cos(a), y + r * math.sin(a)))
    return f'<polygon points="{pts(p)}" fill="{col}" opacity="{op}" stroke-linejoin="round"/>'


def zz(x, y, s, col, ol, sw):
    """A little 'Z' drawn as a stroked path (no text)."""
    d = f"M{f(x)},{f(y)} h{f(s)} l{f(-s)},{f(s)} h{f(s)}"
    return (f'<path d="{d}" fill="none" stroke="{ol}" stroke-width="{f(sw + 2.4)}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{f(sw)}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')


def limb(d, w, fill, ol, sw):
    """A thick rounded limb: outline stroke under a fill stroke."""
    return (f'<path d="{d}" fill="none" stroke="{ol}" stroke-width="{f(w + 2 * sw)}" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="{f(w)}" stroke-linecap="round"/>')


# ---------------------------------------------------------------- Comet ----
K = dict(
    fur="#f8a13f", fur_sh="#e07b22", ol="#9a4a12", stripe="#d0661a",
    cream="#fff3dc", cream_sh="#f3d7ac", pink="#ff8fa3", blush="#ff9e8f",
    eye="#3a2417", white="#ffffff",
    gog="#ffd23f", gog_sh="#e8ad12", gog_ol="#9c6a00", lens="#bff0ff", lens_sh="#7fd3ee",
    strap="#8a5a2b",
    red="#ec4a3f", red_sh="#bf3029", red_ol="#7a1c17", steel="#a9b8c4", steel_ol="#4f5d69",
    port="#9fe3ff",
    fl_out="#ff7f3a", fl_mid="#ffbf3a", fl_core="#fff4b8",
)
SW_K = 5.0          # outline at 0.7 px/unit -> 3.5 px drawn
PACK_C = (34.4, 65.5)
PACK_ROT = 26.8      # degrees; local +y points to the nozzle (down-left)


def kitten_head(sw, expr):
    """Head in kitten coords (centre ~ (76,42)). expr: open|happy|oops|sleep."""
    o = []
    # ears
    for ear, inner in (([(51, 34), (52, 9), (71, 22)], [(55, 30), (55.5, 16), (66, 23.5)]),
                       ([(83, 20), (99, 7), (102, 33)], [(87, 21), (97.5, 13), (99, 28)])):
        o.append(f'<polygon points="{pts(ear)}" fill="{K["fur"]}" stroke="{K["ol"]}" '
                 f'stroke-width="{f(sw)}" stroke-linejoin="round"/>')
        o.append(f'<polygon points="{pts(inner)}" fill="{K["pink"]}" stroke-linejoin="round" '
                 f'stroke="{K["pink"]}" stroke-width="2"/>')
    # head
    o.append(f'<ellipse cx="76" cy="43" rx="28" ry="23.5" fill="{K["fur"]}" stroke="{K["ol"]}" stroke-width="{f(sw)}"/>')
    # one-step shadow on the lower back of the head
    o.append(f'<path d="M50.5,47 C54,60 66,66.5 80,66 C66,62 56,56 50.5,47 Z" fill="{K["fur_sh"]}"/>')
    # tabby marks on the back of the head
    for d in ("M50,38 q5,1 8,4", "M50.5,46 q4,0 7,2.5", "M52,30 q4,2 6,5"):
        o.append(f'<path d="{d}" fill="none" stroke="{K["stripe"]}" stroke-width="{f(sw * 0.7)}" stroke-linecap="round"/>')
    # muzzle + cheeks
    o.append(f'<ellipse cx="89" cy="54.5" rx="13" ry="8.5" fill="{K["cream"]}"/>')
    o.append(f'<ellipse cx="66" cy="54" rx="5" ry="3.2" fill="{K["blush"]}" opacity="0.7"/>')
    o.append(f'<ellipse cx="101" cy="53" rx="3.6" ry="3" fill="{K["blush"]}" opacity="0.7"/>')
    # eyes
    e1, e2 = (73, 42), (92, 42)
    if expr == "open":
        for (x, y) in (e1, e2):
            o.append(f'<ellipse cx="{x}" cy="{y}" rx="5.6" ry="7" fill="{K["eye"]}"/>')
            o.append(f'<circle cx="{x + 1.6}" cy="{y - 2.6}" r="2.3" fill="#fff"/>')
            o.append(f'<circle cx="{x - 1.9}" cy="{y + 2.6}" r="1.1" fill="#fff"/>')
    elif expr == "oops":
        for (x, y) in (e1, e2):
            o.append(f'<circle cx="{x}" cy="{y}" r="6.4" fill="#fff" stroke="{K["eye"]}" stroke-width="2"/>')
            o.append(f'<circle cx="{x + 1}" cy="{y + 0.5}" r="3.2" fill="{K["eye"]}"/>')
            o.append(f'<circle cx="{x + 2}" cy="{y - 0.8}" r="1.1" fill="#fff"/>')
    elif expr == "happy":
        for (x, y) in (e1, e2):
            o.append(f'<path d="M{x - 5.5},{y + 2.5} Q{x},{y - 6.5} {x + 5.5},{y + 2.5}" fill="none" '
                     f'stroke="{K["eye"]}" stroke-width="3.4" stroke-linecap="round"/>')
    else:  # sleep
        for (x, y) in (e1, e2):
            o.append(f'<path d="M{x - 5.5},{y} Q{x},{y + 5} {x + 5.5},{y}" fill="none" '
                     f'stroke="{K["eye"]}" stroke-width="3" stroke-linecap="round"/>')
    # nose + mouth
    o.append(f'<path d="M89.5,48.5 h6 q0,3 -3,4.4 q-3,-1.4 -3,-4.4 Z" fill="{K["pink"]}" '
             f'stroke="{K["ol"]}" stroke-width="1.4" stroke-linejoin="round"/>')
    if expr == "oops":
        o.append(f'<ellipse cx="92.5" cy="58.4" rx="2.5" ry="3" fill="{K["eye"]}"/>')
    elif expr == "happy":
        o.append(f'<path d="M86,55 Q92.5,55.5 99,54.5 Q97.5,62.5 92.5,62.5 Q87.5,62.5 86,55 Z" '
                 f'fill="#c2453f" stroke="{K["eye"]}" stroke-width="1.6" stroke-linejoin="round"/>')
        o.append(f'<path d="M89,59.8 Q92.5,57.6 96,59.6 Q94.5,62 92.5,62 Q90.5,62 89,59.8 Z" fill="{K["pink"]}"/>')
    else:
        o.append(f'<path d="M92.5,53 q-1.2,4 -5,2.8 M92.5,53 q1.2,4 5,2.8" fill="none" '
                 f'stroke="{K["eye"]}" stroke-width="1.8" stroke-linecap="round"/>')
    # whiskers (very light, only short ones)
    for d in ("M103,51 l7,-2", "M103,55 l7,1"):
        o.append(f'<path d="{d}" stroke="{K["ol"]}" stroke-width="1.3" stroke-linecap="round" opacity="0.6"/>')
    # goggles pushed up on the forehead
    o.append(f'<path d="M50.5,30 Q76,17 103,26" fill="none" stroke="{K["strap"]}" stroke-width="{f(sw * 0.95)}" stroke-linecap="round"/>')
    for cx in (70, 88):
        o.append(f'<circle cx="{cx}" cy="23.5" r="8.4" fill="{K["gog"]}" stroke="{K["gog_ol"]}" stroke-width="{f(sw * 0.75)}"/>')
        o.append(f'<circle cx="{cx}" cy="23.5" r="5.2" fill="{K["lens"]}"/>')
        o.append(f'<path d="M{cx - 5.2},23.5 a5.2,5.2 0 0 0 10.4,0 Z" fill="{K["lens_sh"]}"/>')
        o.append(f'<circle cx="{cx - 1.9}" cy="21.3" r="1.6" fill="#fff"/>')
    o.append(f'<rect x="77.2" y="21.3" width="3.6" height="4.4" rx="1.2" fill="{K["gog_sh"]}" stroke="{K["gog_ol"]}" stroke-width="1.4"/>')
    return "".join(o)


def kitten_pack(flame_len):
    sw = SW_K
    o = [f'<g transform="translate({PACK_C[0]},{PACK_C[1]}) rotate({PACK_ROT})">']
    if flame_len > 0:
        L = flame_len
        o.append(f'<path d="M-7,22 Q-8.5,{f(22 + L * 0.55)} 0,{f(22 + L)} Q8.5,{f(22 + L * 0.55)} 7,22 Z" fill="{K["fl_out"]}"/>')
        o.append(f'<path d="M-4.6,22 Q-5.4,{f(22 + L * 0.45)} 0,{f(22 + L * 0.74)} Q5.4,{f(22 + L * 0.45)} 4.6,22 Z" fill="{K["fl_mid"]}"/>')
        o.append(f'<path d="M-2.4,22 Q-2.8,{f(22 + L * 0.3)} 0,{f(22 + L * 0.44)} Q2.8,{f(22 + L * 0.3)} 2.4,22 Z" fill="{K["fl_core"]}"/>')
    # fins
    o.append(f'<path d="M-7,5 L-13.5,16 L-7,14 Z" fill="{K["red_sh"]}" stroke="{K["red_ol"]}" stroke-width="{f(sw * 0.8)}" stroke-linejoin="round"/>')
    o.append(f'<path d="M7,5 L13.5,16 L7,14 Z" fill="{K["red_sh"]}" stroke="{K["red_ol"]}" stroke-width="{f(sw * 0.8)}" stroke-linejoin="round"/>')
    # nozzle (exit at local (0,23) == world (24,86))
    o.append(f'<path d="M-4.5,14 L4.5,14 L6.5,22.5 L-6.5,22.5 Z" fill="{K["steel"]}" stroke="{K["steel_ol"]}" '
             f'stroke-width="{f(sw * 0.7)}" stroke-linejoin="round"/>')
    # body capsule
    o.append(f'<rect x="-8" y="-12" width="16" height="28" rx="8" fill="{K["red"]}" stroke="{K["red_ol"]}" stroke-width="{f(sw * 0.9)}"/>')
    o.append(f'<path d="M3,-9.5 Q6.5,-6 6.5,0 L6.5,10 Q6.5,14 3,14.5 Z" fill="{K["red_sh"]}"/>')
    o.append(f'<path d="M-4.8,-6 Q-4.8,-9 -2.5,-10.2" fill="none" stroke="#ffb3a8" stroke-width="2.2" stroke-linecap="round"/>')
    o.append(f'<circle cx="0" cy="0" r="3.8" fill="{K["port"]}" stroke="{K["red_ol"]}" stroke-width="1.8"/>')
    o.append(f'<circle cx="-1.1" cy="-1.2" r="1.1" fill="#fff"/>')
    o.append(f'<rect x="-8" y="8" width="16" height="3.2" fill="{K["gog"]}" stroke="{K["red_ol"]}" stroke-width="1.4"/>')
    o.append('</g>')
    return "".join(o)


def kitten(state, flame_len):
    sw = SW_K
    o = []
    # tail (behind everything)
    if state == "sleep":
        tail = "M40,78 C24,92 46,100 70,93"
    else:
        tail = "M40,62 C22,58 12,42 20,30 C25,23 33,26 30,33"
    o.append(limb(tail, 8.5, K["fur"], K["ol"], sw * 0.9))
    if state != "sleep":
        for d in ("M17.5,44 l5.5,-1.5", "M17,35 l6,1.2"):
            o.append(f'<path d="{d}" stroke="{K["stripe"]}" stroke-width="{f(sw * 0.75)}" stroke-linecap="round"/>')
    else:
        o.append(f'<path d="M50,94.5 l1,-5 M58,96 l0.5,-5" stroke="{K["stripe"]}" stroke-width="{f(sw * 0.7)}" stroke-linecap="round"/>')
    # hind leg
    o.append(f'<ellipse cx="42" cy="84" rx="7.5" ry="6" fill="{K["fur"]}" stroke="{K["ol"]}" stroke-width="{f(sw)}"/>')
    # body
    o.append(f'<ellipse cx="57" cy="70" rx="25" ry="17" fill="{K["fur"]}" stroke="{K["ol"]}" stroke-width="{f(sw)}"/>')
    o.append(f'<path d="M36,76 C44,86.5 62,89 76,82 C64,84 46,82 36,76 Z" fill="{K["fur_sh"]}"/>')
    o.append(f'<ellipse cx="64" cy="77.5" rx="13.5" ry="7.2" fill="{K["cream"]}"/>')
    for d in ("M45,54.5 q2,5 0.5,9", "M53,53.2 q2,5 0.5,9", "M61,53.4 q1.5,4.5 0.4,8"):
        o.append(f'<path d="{d}" fill="none" stroke="{K["stripe"]}" stroke-width="{f(sw * 0.75)}" stroke-linecap="round"/>')
    # pack + strap
    o.append(kitten_pack(flame_len))
    belt = "M41,62 Q56,73 77,70"
    o.append(f'<path d="{belt}" fill="none" stroke="{K["red_ol"]}" stroke-width="5.6" stroke-linecap="round"/>')
    o.append(f'<path d="{belt}" fill="none" stroke="{K["red"]}" stroke-width="2.8" stroke-linecap="round"/>')
    o.append(f'<rect x="60.5" y="68" width="6" height="5.4" rx="1.4" fill="{K["gog"]}" stroke="{K["gog_ol"]}" stroke-width="1.4"/>')
    # front paws
    if state in ("fly", "oops", "sleep"):
        paws = [(68, 87), (78, 85)] if state != "oops" else [(68, 87)]
        for (x, y) in paws:
            o.append(f'<ellipse cx="{x}" cy="{y}" rx="6.2" ry="5.2" fill="{K["fur"]}" stroke="{K["ol"]}" stroke-width="{f(sw)}"/>')
            o.append(f'<path d="M{x - 2.5},{y + 3.5} v-2 M{x + 1},{y + 3.6} v-2" stroke="{K["ol"]}" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>')
    if state == "happy":   # raised paw: arm behind the head, paw pops out up-right
        o.append(limb("M80,74 Q100,64 111,40", 7, K["fur"], K["ol"], sw * 0.85))
        o.append(f'<circle cx="111.5" cy="37.5" r="5.6" fill="{K["cream"]}" stroke="{K["ol"]}" stroke-width="{f(sw * 0.8)}"/>')
    if state == "oops":
        o.append(limb("M78,78 Q96,76 102,60", 7, K["fur"], K["ol"], sw * 0.85))
    # head
    expr = {"fly": "open", "happy": "happy", "oops": "oops", "sleep": "sleep"}[state]
    o.append(kitten_head(sw, expr))
    if state == "happy":   # second paw: forward and low, in front
        o.append(limb("M72,80 Q88,83 101,77", 7, K["fur"], K["ol"], sw * 0.85))
        o.append(f'<circle cx="103" cy="76" r="5.4" fill="{K["cream"]}" stroke="{K["ol"]}" stroke-width="{f(sw * 0.8)}"/>')
    if state == "oops":    # paw on the cheek (arm hidden behind the head)
        o.append(f'<ellipse cx="102" cy="58" rx="6" ry="6.6" fill="{K["cream"]}" stroke="{K["ol"]}" stroke-width="{f(sw * 0.8)}"/>')
    if state == "sleep":
        o.append(zz(103, 4, 6, "#ffffff", "#6a7fb0", 2.2))
        o.append(zz(112, 13, 4.2, "#ffffff", "#6a7fb0", 1.8))
    return svg(120, 110, "".join(o))


# ---------------------------------------------------------------- Gizmo ----
G = dict(
    blue="#6cc6f0", blue_sh="#45a3d4", ol="#2a6a90", white="#f6fbff", white_sh="#d2e5f0",
    coral="#ff7a6b", coral_sh="#e0544a", coral_ol="#a3352c", hole="#7d2a24",
    screen="#203a52", screen_sleep="#1a2b3b", face="#7ff3dd", steel="#9fb3c2",
    glow="#ffe066", off="#d3dde4", belly="#c4ebfa",
)
SW_G = 5.0


def gizmo(state):
    sw = SW_G
    o = []
    defs = ('<radialGradient id="gzGlow"><stop offset="0" stop-color="#fff3a8" stop-opacity="0.95"/>'
            '<stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient>')
    # arms behind/at body
    arms = {
        "idle": (("M44,146 Q30,160 30,180", (30, 182)), ("M116,146 Q132,158 134,178", (134, 181))),
        "eat": (("M44,146 Q30,160 30,180", (30, 182)), ("M116,146 Q128,166 110,170", (106, 170))),
        "happy": (("M44,146 Q26,134 22,112", (21, 107)), ("M116,146 Q136,134 139,112", (140, 107))),
        "sleep": (("M44,148 Q36,168 36,188", (36, 190)), ("M116,148 Q126,168 126,188", (126, 190))),
    }[state]
    back, front = arms
    o.append(limb(back[0], 10, G["blue"], G["ol"], sw * 0.9))
    o.append(f'<circle cx="{back[1][0]}" cy="{back[1][1]}" r="8.5" fill="{G["white"]}" stroke="{G["ol"]}" stroke-width="{f(sw)}"/>')
    # legs + feet (feet bottom edge at y=220 incl. stroke)
    for x in (56, 90):
        o.append(f'<rect x="{x}" y="192" width="14" height="16" fill="{G["steel"]}" stroke="{G["ol"]}" stroke-width="{f(sw * 0.8)}"/>')
    for x in (49, 83):
        o.append(f'<rect x="{x}" y="203.5" width="28" height="14" rx="7" fill="{G["blue"]}" stroke="{G["ol"]}" stroke-width="{f(sw)}"/>')
        o.append(f'<rect x="{x + 4}" y="212" width="20" height="3" rx="1.5" fill="{G["blue_sh"]}"/>')
    # body
    o.append(f'<rect x="40" y="132" width="80" height="66" rx="20" fill="{G["white"]}" stroke="{G["ol"]}" stroke-width="{f(sw)}"/>')
    o.append(f'<path d="M44,170 Q46,192 62,195 L100,195 Q116,192 117,176 Q104,190 80,190 Q56,190 44,170 Z" fill="{G["white_sh"]}"/>')
    o.append(f'<rect x="56" y="144" width="54" height="38" rx="11" fill="{G["belly"]}" stroke="{G["ol"]}" stroke-width="{f(sw * 0.6)}"/>')
    # heart badge + lights on the belly
    o.append(f'<path d="M83,175 C75,169 70,165 70,159.5 C70,155.5 73,153 76.5,153 C79.5,153 81.5,155 83,157 '
             f'C84.5,155 86.5,153 89.5,153 C93,153 96,155.5 96,159.5 C96,165 91,169 83,175 Z" '
             f'fill="{G["coral"]}" stroke="{G["coral_ol"]}" stroke-width="2.4" stroke-linejoin="round"/>')
    o.append(f'<ellipse cx="77" cy="158.5" rx="2.6" ry="2" fill="#ffc4bb"/>')
    lit = state in ("happy", "eat")
    for i, c in enumerate(("#ffe066", "#7ff3dd", "#ff9fd0")):
        o.append(f'<circle cx="{101}" cy="{152 + i * 9}" r="2.9" fill="{c if (lit or state == "idle") else "#9fb3c2"}" '
                 f'stroke="{G["ol"]}" stroke-width="1.3"/>')
    # neck
    o.append(f'<rect x="68" y="126" width="24" height="10" fill="{G["steel"]}" stroke="{G["ol"]}" stroke-width="{f(sw * 0.8)}"/>')
    # front arm
    o.append(limb(front[0], 10, G["blue"], G["ol"], sw * 0.9))
    o.append(f'<circle cx="{front[1][0]}" cy="{front[1][1]}" r="8.5" fill="{G["white"]}" stroke="{G["ol"]}" stroke-width="{f(sw)}"/>')
    # antenna (behind head top-right)
    on = state in ("happy", "eat")
    if state == "sleep":
        ant, ball = "M116,64 Q138,50 146,68", (146, 72)
    else:
        ant, ball = "M116,64 Q126,50 132,38", (133, 34)
    o.append(f'<path d="{ant}" fill="none" stroke="{G["ol"]}" stroke-width="{f(3 + 2 * sw * 0.7)}" stroke-linecap="round"/>')
    o.append(f'<path d="{ant}" fill="none" stroke="{G["steel"]}" stroke-width="3" stroke-linecap="round"/>')
    if on:
        o.append(f'<circle cx="{ball[0]}" cy="{ball[1]}" r="15" fill="url(#gzGlow)"/>')
    o.append(f'<circle cx="{ball[0]}" cy="{ball[1]}" r="6.4" fill="{G["glow"] if on else G["off"]}" stroke="{G["ol"]}" stroke-width="{f(sw * 0.8)}"/>')
    o.append(f'<circle cx="{ball[0] - 2}" cy="{ball[1] - 2}" r="1.8" fill="#fff"/>')
    # ear discs
    o.append(f'<circle cx="27" cy="97" r="10" fill="{G["coral"]}" stroke="{G["coral_ol"]}" stroke-width="{f(sw)}"/>')
    o.append(f'<circle cx="27" cy="97" r="3.6" fill="{G["coral_sh"]}"/>')
    # head
    o.append(f'<rect x="28" y="60" width="104" height="70" rx="24" fill="{G["blue"]}" stroke="{G["ol"]}" stroke-width="{f(sw)}"/>')
    o.append(f'<path d="M31,104 Q34,126 54,127 L108,127 Q128,126 129,108 Q118,122 80,122 Q42,122 31,104 Z" fill="{G["blue_sh"]}"/>')
    o.append(f'<path d="M40,72 Q46,66 58,65" fill="none" stroke="#bfe9fb" stroke-width="3.4" stroke-linecap="round"/>')
    # screen (shifted right: he looks at the board)
    scr = G["screen_sleep"] if state == "sleep" else G["screen"]
    o.append(f'<rect x="48" y="73" width="77" height="45" rx="14" fill="{scr}" stroke="{G["ol"]}" stroke-width="{f(sw * 0.8)}"/>')
    o.append(f'<path d="M55,79 Q58,76 64,76" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2.6" stroke-linecap="round"/>')
    fc = G["face"]
    ex = (83, 107)
    if state == "idle":
        for x in ex:
            o.append(f'<rect x="{x - 5}" y="85" width="10" height="16" rx="5" fill="{fc}"/>')
            o.append(f'<circle cx="{x + 1.6}" cy="89" r="1.8" fill="#ffffff"/>')
        o.append(f'<path d="M89,107 Q95,112 101,107" fill="none" stroke="{fc}" stroke-width="3" stroke-linecap="round"/>')
    elif state == "happy":
        for x in ex:
            o.append(f'<path d="M{x - 6},96 Q{x},86 {x + 6},96" fill="none" stroke="{fc}" stroke-width="3.6" stroke-linecap="round"/>')
        o.append(f'<path d="M86,104 L104,104 Q103,113.5 95,113.5 Q87,113.5 86,104 Z" fill="{fc}"/>')
        o.append(f'<ellipse cx="66" cy="104" rx="5" ry="2.6" fill="#ff9fb0" opacity="0.75"/>')
        o.append(f'<ellipse cx="119" cy="104" rx="3.4" ry="2.4" fill="#ff9fb0" opacity="0.75"/>')
    elif state == "eat":
        for x, s in ((ex[0], 1), (ex[1], -1)):
            o.append(f'<path d="M{x - 5 * s},86 L{x + 5 * s},92 L{x - 5 * s},98" fill="none" stroke="{fc}" '
                     f'stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>')
        o.append(f'<ellipse cx="95" cy="107.5" rx="10" ry="7" fill="{fc}"/>')
        o.append(f'<ellipse cx="95" cy="109" rx="6" ry="4" fill="{scr}"/>')
    else:  # sleep
        for x in ex:
            o.append(f'<path d="M{x - 6},93 Q{x},99 {x + 6},93" fill="none" stroke="{fc}" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>')
        o.append(f'<ellipse cx="95" cy="108" rx="3" ry="2.4" fill="{fc}" opacity="0.7"/>')
    # hopper (coral funnel), mouth centre (80,25)
    o.append(f'<rect x="71" y="48" width="18" height="15" fill="{G["steel"]}" stroke="{G["ol"]}" stroke-width="{f(sw * 0.8)}"/>')
    if state == "eat":
        o.append('<ellipse cx="80" cy="25" rx="46" ry="20" fill="url(#gzGlow)"/>')
    o.append(f'<path d="M47,25 L69,51 Q80,55 91,51 L113,25 Z" fill="{G["coral"]}" stroke="{G["coral_ol"]}" '
             f'stroke-width="{f(sw)}" stroke-linejoin="round"/>')
    o.append(f'<path d="M95,30 L109,30 L89,51 Q86,52.5 83,53 Z" fill="{G["coral_sh"]}"/>')
    o.append(f'<path d="M58,36 L101,36" stroke="#ffb0a6" stroke-width="3" stroke-linecap="round"/>')
    o.append(f'<ellipse cx="80" cy="25" rx="33" ry="9" fill="{G["coral"]}" stroke="{G["coral_ol"]}" stroke-width="{f(sw)}"/>')
    o.append(f'<ellipse cx="80" cy="25.8" rx="25" ry="5.2" fill="{"#ffe066" if state == "eat" else G["hole"]}"/>')
    if state == "eat":
        o.append('<ellipse cx="80" cy="26.5" rx="15" ry="2.8" fill="#fff6c4"/>')
        for x1, y1, x2, y2 in ((62, 10, 58, 3), (80, 8, 80, 0), (98, 10, 102, 3)):
            o.append(f'<path d="M{x1},{y1} L{x2},{y2}" stroke="#ffcf3a" stroke-width="3.2" stroke-linecap="round"/>')
    if state == "sleep":
        o.append(zz(138, 6, 8, "#ffffff", "#6a7fb0", 2.6))
        o.append(zz(150, 20, 5.5, "#ffffff", "#6a7fb0", 2.2))
    return svg(160, 220, "".join(o), defs)


# ----------------------------------------------------------------- Gems ----
GEMC = {  # base, light facet, dark facet, outline
    "heart":    ("#ec3a52", "#ff7b8b", "#b51f38", "#7a1124"),
    "drop":     ("#2f7de1", "#72adff", "#1c56ad", "#103a78"),
    "square":   ("#20a95a", "#5fd88d", "#157d40", "#0b5229"),
    "star":     ("#ffc91f", "#ffe57a", "#e09a00", "#946200"),
    "diamond":  ("#9a4ce0", "#c58dff", "#6e2db0", "#461a78"),
    "hexagon":  ("#ff8320", "#ffb066", "#d65d08", "#8a3a04"),
    "round":    ("#ff8fc6", "#ffc8e4", "#e15ea2", "#a0306c"),
    "triangle": ("#13aa9b", "#5ad8ca", "#0b7e73", "#064f48"),
    "moon":     ("#fff08a", "#fffbe0", "#ecd04a", "#a88a12"),
    "clover":   ("#8fd61c", "#c4f26a", "#63a70d", "#3c6a06"),
    "octagon":  ("#8a5a2b", "#b07a3a", "#66401c", "#3e250d"),
    "bolt":     ("#24d2f4", "#8cedff", "#0fa0c8", "#0a6683"),
}
SW_GEM = 5.0
LIGHT = (-0.6, -0.8)


def poly_area(P):
    return 0.5 * sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))


def tone_for(n, cols):
    d = n[0] * LIGHT[0] + n[1] * LIGHT[1]
    return cols[1] if d > 0.3 else (cols[2] if d < -0.3 else cols[0])


def outward_normal(a, b, c):
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy) or 1
    n = (dy / ln, -dx / ln)
    mx, my = (a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1]
    if n[0] * mx + n[1] * my < 0:
        n = (-n[0], -n[1])
    return n


def facets_radial(P, c, ts, cols):
    """Sector facets between rays from c through P_i; table = P scaled by ts (None = wedges)."""
    o = []
    n = len(P)
    E = [(c[0] + (x - c[0]) * 1.6, c[1] + (y - c[1]) * 1.6) for x, y in P]
    T = [(c[0] + (x - c[0]) * ts, c[1] + (y - c[1]) * ts) for x, y in P] if ts else None
    lines = []
    for i in range(n):
        j = (i + 1) % n
        tone = tone_for(outward_normal(P[i], P[j], c), cols)
        quad = [E[i], E[j], T[j], T[i]] if T else [c, E[i], E[j]]
        o.append(f'<polygon points="{pts(quad)}" fill="{tone}"/>')
        lines.append((T[i] if T else c, E[i]))
    if T:
        o.append(f'<polygon points="{pts(T)}" fill="{cols[0]}"/>')
        o.append(f'<polygon points="{pts(T)}" fill="none" stroke="{cols[3]}" stroke-opacity="0.35" stroke-width="1.6" stroke-linejoin="round"/>')
    for a, b in lines:
        o.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="{cols[3]}" stroke-opacity="0.3" stroke-width="1.6"/>')
    return "".join(o)


def facets_inset(P, d, cols):
    """Bevel facets from each edge to an inset copy (works for concave shapes)."""
    sgn = 1 if poly_area(P) > 0 else -1
    n = len(P)
    N = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy)
        N.append((sgn * -dy / ln, sgn * dx / ln))   # inward normal
    I = []
    for i in range(n):
        n1, n2 = N[i - 1], N[i]
        bx, by = n1[0] + n2[0], n1[1] + n2[1]
        bl = math.hypot(bx, by) or 1
        cos_h = (bx / bl) * n2[0] + (by / bl) * n2[1]
        k = d / max(cos_h, 0.35)
        I.append((P[i][0] + bx / bl * k, P[i][1] + by / bl * k))
    o = []
    for i in range(n):
        j = (i + 1) % n
        tone = tone_for((-N[i][0], -N[i][1]), cols)
        o.append(f'<polygon points="{pts([P[i], P[j], I[j], I[i]])}" fill="{tone}" stroke="{tone}" stroke-width="0.6" stroke-linejoin="round"/>')
    o.append(f'<polygon points="{pts(I)}" fill="{cols[0]}" stroke="{cols[3]}" stroke-opacity="0.35" stroke-width="1.6" stroke-linejoin="round"/>')
    for i in range(n):
        o.append(f'<line x1="{f(P[i][0])}" y1="{f(P[i][1])}" x2="{f(I[i][0])}" y2="{f(I[i][1])}" stroke="{cols[3]}" stroke-opacity="0.3" stroke-width="1.6"/>')
    return "".join(o)


def reg_poly(cx, cy, r, n, start_deg):
    return [(cx + r * math.cos(math.radians(start_deg + 360 * k / n)),
             cy + r * math.sin(math.radians(start_deg + 360 * k / n))) for k in range(n)]


def star_pts(cx, cy, R, r):
    return [(cx + (R if k % 2 == 0 else r) * math.cos(math.radians(-90 + 36 * k)),
             cy + (R if k % 2 == 0 else r) * math.sin(math.radians(-90 + 36 * k))) for k in range(10)]


def moon_path():
    # outer circle (50,52) r40, bite circle (68,38) r31 -> crescent opening to the upper-right
    c1, r1, c2, r2 = (48, 53), 39.0, (67, 37), 30.0
    dx, dy = c2[0] - c1[0], c2[1] - c1[1]
    dd = math.hypot(dx, dy)
    a = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd)
    h = math.sqrt(r1 * r1 - a * a)
    px, py = c1[0] + a * dx / dd, c1[1] + a * dy / dd
    p1 = (px + h * dy / dd, py - h * dx / dd)
    p2 = (px - h * dy / dd, py + h * dx / dd)
    # big arc along outer circle from p1 to p2 the long way, back along bite circle
    return (f"M{f(p1[0])},{f(p1[1])} A{r1},{r1} 0 1 0 {f(p2[0])},{f(p2[1])} "
            f"A{r2},{r2} 0 0 1 {f(p1[0])},{f(p1[1])} Z"), c1, r1


def gem(kind):
    cols = GEMC[kind]
    base, lt, dk, ol = cols
    sw = SW_GEM
    defs = ""
    inner = ""
    spark = (34, 30, 9)
    if kind == "heart":
        d = ("M50,87 C33,74 10,60 10,37 C10,22 21,13 32.5,13 C41,13 47,18.5 50,25 "
             "C53,18.5 59,13 67.5,13 C79,13 90,22 90,37 C90,60 67,74 50,87 Z")
        P = [(50, 87), (24, 65), (10, 38), (19, 18), (36, 13), (50, 25), (64, 13), (81, 18), (90, 38), (76, 65)]
        inner = facets_radial(P, (50, 47), 0.5, cols)
        shape = f'<path d="{d}"/>'
        spark = (28, 30, 9)
    elif kind == "drop":
        d = ("M50,7 C58,24 82,43 82,62 C82,80 68,92 50,92 C32,92 18,80 18,62 C18,43 42,24 50,7 Z")
        P = [(50, 7), (66, 28), (81, 50), (79, 76), (62, 91), (38, 91), (21, 76), (19, 50), (34, 28)]
        inner = facets_radial(P, (50, 63), 0.5, cols)
        shape = f'<path d="{d}"/>'
        spark = (33, 56, 8)
    elif kind == "square":
        P = [(15, 15), (85, 15), (85, 85), (15, 85)]
        inner = facets_inset(P, 13, cols)
        shape = f'<polygon points="{pts(P)}"/>'
        spark = (30, 29, 9)
    elif kind == "star":
        P = star_pts(50, 54, 45, 21)
        inner = facets_radial(P, (50, 54), None, cols)
        shape = f'<polygon points="{pts(P)}" stroke-linejoin="round"/>'
        spark = (36, 42, 7)
    elif kind == "diamond":
        A, B, C, D, E = (29, 18), (71, 18), (91, 40), (50, 88), (9, 40)
        t1, t2, g1, g2, g3 = (40, 31), (60, 31), (29, 40), (50, 40), (71, 40)
        P = [A, B, C, D, E]
        fac = [([A, B, t2, t1], lt), ([A, t1, g1, E], lt), ([t1, t2, g2], base), ([t1, g2, g1], lt),
               ([t2, g3, g2], base), ([B, C, g3, t2], base), ([E, g1, D], lt), ([g1, g2, D], base),
               ([g2, g3, D], dk), ([g3, C, D], dk)]
        inner = "".join(f'<polygon points="{pts(p)}" fill="{c}" stroke="{ol}" stroke-opacity="0.35" '
                        f'stroke-width="1.6" stroke-linejoin="round"/>' for p, c in fac)
        shape = f'<polygon points="{pts(P)}"/>'
        spark = (31, 28, 8)
    elif kind == "hexagon":
        P = reg_poly(50, 50, 43, 6, -90)
        inner = facets_radial(P, (50, 50), 0.56, cols)
        shape = f'<polygon points="{pts(P)}"/>'
        spark = (36, 30, 8)
    elif kind == "round":
        defs = ('<radialGradient id="pearl" cx="0.38" cy="0.34" r="0.72">'
                f'<stop offset="0" stop-color="#fff4fa"/><stop offset="0.42" stop-color="{base}"/>'
                f'<stop offset="1" stop-color="{dk}"/></radialGradient>')
        inner = ('<circle cx="50" cy="50" r="38" fill="url(#pearl)"/>'
                 f'<path d="M26,66 Q50,86 76,64 Q66,80 50,81 Q34,81 26,66 Z" fill="{lt}" opacity="0.55"/>')
        shape = '<circle cx="50" cy="50" r="38"/>'
        spark = (36, 33, 8)
    elif kind == "triangle":
        P = [(50, 9), (92, 84), (8, 84)]
        inner = facets_radial(P, (50, 60), 0.46, cols)
        shape = f'<polygon points="{pts(P)}" stroke-linejoin="round"/>'
        spark = (40, 46, 7)
    elif kind == "moon":
        d, c1, r1 = moon_path()
        inner = (f'<polygon points="0,0 100,0 0,100" fill="{lt}"/>'
                 f'<polygon points="100,0 100,100 0,100" fill="{dk}"/>'
                 f'<circle cx="{c1[0]}" cy="{c1[1]}" r="{r1 - 9}" fill="{base}" stroke="{ol}" '
                 f'stroke-opacity="0.35" stroke-width="1.6"/>'
                 f'<path d="M30,30 L42,40 M24,80 L33,72 M60,88 L57,77" stroke="{ol}" stroke-opacity="0.3" stroke-width="1.6"/>')
        shape = f'<path d="{d}"/>'
        spark = (22, 52, 7)
    elif kind == "clover":
        cx, cy, dist, r = 47, 45, 17.5, 17.5
        leaves = [(cx, cy - dist), (cx + dist, cy), (cx, cy + dist), (cx - dist, cy)]
        stem = "M54,58 Q68,78 82,86"
        circles = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}"/>' for x, y in leaves)
        shape = circles
        stem_ol = f'<path d="{stem}" fill="none" stroke="{ol}" stroke-width="{f(8 + 2 * sw)}" stroke-linecap="round"/>'
        stem_in = f'<path d="{stem}" fill="none" stroke="{dk}" stroke-width="8" stroke-linecap="round"/>'
        P = reg_poly(cx, cy, 40, 8, -90)
        inner = facets_radial(P, (cx, cy), None, cols)
        # leaf veins toward the centre + small centre dot
        inner += "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="6.5" fill="{lt}" opacity="0.0"/>' for x, y in leaves)
        inner += f'<circle cx="{cx}" cy="{cy}" r="5" fill="{dk}"/>'
        spark = (34, 22, 7)
    elif kind == "octagon":
        # tall cushion / emerald cut (w/h 0.72, corners cut 22 %): its outline can't be mistaken for the round-ish hexagon
        x0, x1, y0, y1 = 19, 81, 7, 93
        k = 0.22 * (x1 - x0)
        P = [(x0 + k, y0), (x1 - k, y0), (x1, y0 + k), (x1, y1 - k), (x1 - k, y1), (x0 + k, y1), (x0, y1 - k), (x0, y0 + k)]
        inner = facets_radial(P, (50, 50), 0.55, cols)
        shape = f'<polygon points="{pts(P)}"/>'
        spark = (36, 26, 7)
    elif kind == "bolt":
        P = [(60, 5), (18, 56), (45, 56), (35, 95), (84, 40), (57, 40), (75, 5)]
        inner = facets_inset(P, 7, cols)
        shape = f'<polygon points="{pts(P)}" stroke-linejoin="round"/>'
        spark = (56, 16, 7)
    else:
        raise ValueError(kind)

    cid = f"clip_{kind}"
    defs += f'<clipPath id="{cid}">{shape}</clipPath>'
    o = []
    if kind == "clover":
        o.append(stem_ol)
    # outer outline: double-width stroke under the fill -> only the outer half shows
    o.append(f'<g fill="{ol}" stroke="{ol}" stroke-width="{f(sw * 2)}" stroke-linejoin="round">{shape}</g>')
    if kind == "clover":
        o.append(stem_in)
    o.append(f'<g fill="{base}">{shape}</g>')
    o.append(f'<g clip-path="url(#{cid})">{inner}</g>')
    x, y, s = spark
    o.append(f'<ellipse cx="{x}" cy="{y}" rx="{f(s * 0.9)}" ry="{f(s * 0.55)}" fill="#ffffff" opacity="0.35" '
             f'transform="rotate(-35 {x} {y})"/>')
    o.append(sparkle(x, y, s))
    o.append(f'<circle cx="{f(x + s * 1.1)}" cy="{f(y + s * 0.9)}" r="{f(s * 0.22)}" fill="#ffffff"/>')
    return svg(100, 100, "".join(o), defs), "".join(o), defs


GEM_KINDS = ['heart', 'drop', 'square', 'star', 'diamond', 'hexagon', 'round', 'triangle',
             'moon', 'clover', 'octagon', 'bolt']


# ------------------------------------------------------- emblem / icon ----
def gear_path(cx, cy, r_out, r_in, teeth, hole):
    """Gear silhouette (outer teeth polygon + inner hole, even-odd)."""
    p = []
    n = teeth * 4
    for k in range(n):
        a = 2 * math.pi * (k - 0.5) / n
        r = r_out if (k % 4) in (1, 2) else r_in
        p.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d = "M" + " L".join(f"{f(x)},{f(y)}" for x, y in p) + " Z"
    d += (f" M{f(cx + hole)},{f(cy)} A{hole},{hole} 0 1 0 {f(cx - hole)},{f(cy)}"
          f" A{hole},{hole} 0 1 0 {f(cx + hole)},{f(cy)} Z")
    return d


def card_emblem():
    ring, ring_sh, ol, paw = "#bfe9e4", "#8fd0c9", "#0e4f50", "#fff7e6"
    g = gear_path(32, 32, 29, 24, 10, 17.5)
    o = [f'<path d="{g}" fill-rule="evenodd" fill="{ol}" stroke="{ol}" stroke-width="4.4" stroke-linejoin="round"/>',
         f'<path d="{g}" fill-rule="evenodd" fill="{ring}"/>',
         f'<path d="M32,49.5 A17.5,17.5 0 0 0 49.5,32 L53,32 A21,21 0 0 1 32,53 Z" fill="{ring_sh}"/>',
         f'<circle cx="32" cy="32" r="17.5" fill="none" stroke="{ol}" stroke-width="2.2"/>']
    pad = "M32,47 C24.5,47 20.5,43 20.5,38.5 C20.5,33.5 25.5,29.5 32,29.5 C38.5,29.5 43.5,33.5 43.5,38.5 C43.5,43 39.5,47 32,47 Z"
    o.append(f'<path d="{pad}" fill="{paw}" stroke="{ol}" stroke-width="2.2"/>')
    for x, y, rx, ry, rot in ((20, 27.5, 3.9, 5, -24), (27, 20.5, 4.1, 5.3, -8), (37, 20.5, 4.1, 5.3, 8), (44, 27.5, 3.9, 5, 24)):
        o.append(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" transform="rotate({rot} {x} {y})" '
                 f'fill="{paw}" stroke="{ol}" stroke-width="2.2"/>')
    return svg(64, 64, "".join(o))


def icon(gem_body, gem_defs):
    o = ['<circle cx="128" cy="128" r="120" fill="#f2b631"/>',
         '<circle cx="128" cy="128" r="110" fill="#ffd96a"/>',
         '<path d="M40,104 A92,92 0 0 1 180,38" fill="none" stroke="#ffeaa6" stroke-width="10" stroke-linecap="round"/>']
    # Comet's head: kitten coords centre (76,43) -> (122,136), scale 2.9
    s = 2.9
    tx, ty = 122 - 76 * s, 136 - 43 * s
    o.append(f'<g transform="translate({f(tx)} {f(ty)}) scale({s})">{kitten_head(2.4, "open")}</g>')
    # the gem, bottom right
    gs = 0.62
    o.append(f'<g transform="translate({f(196 - 50 * gs)} {f(192 - 50 * gs)}) scale({gs})">{gem_body}</g>')
    return svg(256, 256, "".join(o), gem_defs)


def main():
    os.makedirs(OUT, exist_ok=True)
    write("kitten_0.svg", kitten("fly", 22))
    write("kitten_1.svg", kitten("fly", 13))
    write("kitten_happy.svg", kitten("happy", 24))
    write("kitten_oops.svg", kitten("oops", 12))
    write("kitten_sleep.svg", kitten("sleep", 0))
    for st in ("idle", "eat", "happy", "sleep"):
        write(f"gizmo_{st}.svg", gizmo(st))
    bodies = {}
    for k in GEM_KINDS:
        full, body, defs = gem(k)
        bodies[k] = (body, defs)
        write(f"gem_{k}.svg", full)
    write("card_emblem.svg", card_emblem())
    write("icon.svg", icon(*bodies["diamond"]))
    print("wrote", len(GEM_KINDS) + 11, "SVGs to", OUT)


if __name__ == "__main__":
    main()
