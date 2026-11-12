#!/usr/bin/env python3
"""Character art generator for Biscuit's Kitchen Flight.

Writes every character / obstacle / HUD SVG listed in docs/DESIGN.md section 4
("Characters") into game/assets/default/. 100 % hand-written vector shapes:
no text, fonts, images, scripts, blur filters or external references.

Run:  python3 tools/art-characters/gen.py
Then: node tools/art-characters/sheet.js   (contact sheet + pup frame diff)
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "game", "assets", "default"))

# ---------------------------------------------------------------- palette
P = {
    # Biscuit
    "teal": "#3fb8b0", "teal_sh": "#2d968f", "teal_ln": "#1d6763", "teal_hi": "#9be6de",
    "cream": "#fff3dc", "cream_sh": "#ecd6b0", "cream_ln": "#a88a5c",
    "steel": "#6f8ca3", "steel_sh": "#57728a", "steel_ln": "#3d5266", "steel_hi": "#b4c8d8",
    "red": "#e5483c", "red_sh": "#b8332a", "red_ln": "#87241b", "red_hi": "#ff9b8c",
    "lamp": "#ffe27a", "lamp_ln": "#b88d1e", "lamp_glow": "#fff3a8", "lamp_off": "#d9cfa3",
    "eye": "#ffffff", "pupil": "#27324d", "eye_ln": "#1d4f52", "blush": "#ff9e8a",
    # leaves
    "mint": "#49c76a", "mint_sh": "#32a352", "mint_ln": "#1c7436", "mint_vein": "#d2f7cf",
    "basil": "#2fae4a", "basil_sh": "#228c3a", "basil_ln": "#145f26", "basil_vein": "#c8f0b8",
    "bay": "#78c23c", "bay_sh": "#5ea12b", "bay_ln": "#3a6f17", "bay_vein": "#e6f7bd",
    "halo": "#fffbe0",
    # metals
    "copper": "#d98a5a", "copper_sh": "#b56a3f", "copper_ln": "#7a4222", "copper_hi": "#f6c9a0",
    "stl": "#b9c5ce", "stl_sh": "#93a2ad", "stl_ln": "#596773", "stl_hi": "#eef4f8",
    "pan_in": "#6e7a84", "pan_in_sh": "#5a646d",
    "wood": "#c98f55", "wood_sh": "#a8713c", "wood_ln": "#6e4521",
    # ceramics / glass
    "mug": "#a9dcc6", "mug_sh": "#86c2a9", "mug_ln": "#4a8a70", "dot": "#fff6ea", "dot2": "#f59c8b",
    "bowl": "#9cc7e6", "bowl_sh": "#7aa9cc", "bowl_ln": "#3f6d92", "bowl_band": "#fff3dc",
    "glass": "#d6eef3", "glass_sh": "#b5d9e2", "glass_ln": "#5e8f9c",
    "bean": "#a8452f", "bean_sh": "#83321f", "bean_ln": "#5a2013", "bean2": "#f0d9a8", "bean2_ln": "#9c8250",
    "jarlid": "#e5483c", "jarlid_sh": "#b8332a", "jarlid_ln": "#87241b",
    # kettle
    "ket": "#e8553f", "ket_sh": "#c33f2d", "ket_ln": "#8a2a1c", "ket_hi": "#ffb3a3",
    "knob": "#3a3f5c", "knob_ln": "#22263a",
    # HUD
    "bat_g": "#5fd16a", "bat_g_sh": "#41ad4e", "bat_ln": "#2f6e3a", "bat_case": "#f4f7f9",
    "bat_e_ln": "#8f99a4", "bat_e_fill": "#dde2e7",
    "badge": "#ffd36b", "badge_sh": "#f3bb43", "badge_ln": "#c48a24",
}

ROUND = 'stroke-linejoin="round" stroke-linecap="round"'


def svg(vb_w, vb_h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w} {vb_h}" '
            f'width="{vb_w}" height="{vb_h}">\n{body}\n</svg>\n')


def sh(tag, fill, ln=None, sw=4, extra=""):
    """A shape string with fill + outline."""
    s = f'fill="{fill}"'
    if ln:
        s += f' stroke="{ln}" stroke-width="{sw}" {ROUND}'
    else:
        s += ' stroke="none"'
    return f"<{tag} {s} {extra}/>"


def f(x):
    return f"{x:.2f}".rstrip("0").rstrip(".")


# ================================================================ Biscuit
# Body geometry is shared by every pup file. Everything at y >= 26 is the body;
# the propeller (blades + hub) lives strictly in y < 24.

def pup_body(eyes="open", ears="perky", lamp=True, pid="p"):
    g = []
    # --- far ear (peeks behind the head, right side)
    if ears == "perky":
        g.append(sh("path", P["steel_sh"], P["steel_ln"], 4,
                    'd="M80,30 C90,24 100,30 100,40 C100,48 94,52 89,47 C86,43 84,36 80,30 Z"'))
    else:
        g.append(sh("path", P["steel_sh"], P["steel_ln"], 4,
                    'd="M80,32 C90,30 97,38 97,48 C97,56 91,58 88,53 C85,47 84,39 80,32 Z"'))
    # --- tail: short spring with a cream bobble
    g.append(f'<path d="M30,70 C24,68 22,62 26,58 C30,55 24,51 20,52" fill="none" '
             f'stroke="{P["steel_ln"]}" stroke-width="7" {ROUND}/>')
    g.append(f'<path d="M30,70 C24,68 22,62 26,58 C30,55 24,51 20,52" fill="none" '
             f'stroke="{P["steel"]}" stroke-width="3" {ROUND}/>')
    g.append(sh("circle", P["red"], P["red_ln"], 3.5, 'cx="19" cy="51" r="5"'))
    # --- antenna mast (head covers its base)
    g.append(sh("rect", P["steel"], P["steel_ln"], 3.5, 'x="56.5" y="17" width="7" height="16" rx="3"'))
    # --- feet
    for cx in (38, 64):
        g.append(sh("ellipse", P["cream"], P["cream_ln"], 4, f'cx="{cx}" cy="95" rx="10" ry="6.5"'))
        g.append(f'<ellipse cx="{cx}" cy="97.5" rx="7" ry="2.6" fill="{P["cream_sh"]}"/>')
    # --- body
    g.append(f'<clipPath id="{pid}body"><ellipse cx="50" cy="76" rx="28" ry="19"/></clipPath>')
    g.append(f'<ellipse cx="50" cy="76" rx="28" ry="19" fill="{P["teal"]}"/>')
    g.append(f'<g clip-path="url(#{pid}body)"><ellipse cx="44" cy="90" rx="34" ry="13" fill="{P["teal_sh"]}"/></g>')
    g.append(f'<ellipse cx="55" cy="81" rx="15" ry="10" fill="{P["cream"]}"/>')
    g.append(f'<path d="M42,86 Q55,93 68,85" fill="none" stroke="{P["cream_sh"]}" stroke-width="3" {ROUND}/>')
    g.append(f'<ellipse cx="50" cy="76" rx="28" ry="19" fill="none" stroke="{P["teal_ln"]}" stroke-width="4"/>')
    g.append(f'<circle cx="31" cy="72" r="2.6" fill="{P["teal_hi"]}" stroke="{P["teal_ln"]}" stroke-width="1.6"/>')
    g.append(f'<ellipse cx="36" cy="64" rx="7" ry="3" fill="{P["teal_hi"]}" transform="rotate(-25 36 64)"/>')
    # --- collar + tag
    g.append(f'<path d="M48,70 Q62,80 80,70" fill="none" stroke="{P["red_ln"]}" stroke-width="9" {ROUND}/>')
    g.append(f'<path d="M48,70 Q62,80 80,70" fill="none" stroke="{P["red"]}" stroke-width="4.5" {ROUND}/>')
    g.append(sh("circle", P["lamp"], P["lamp_ln"], 2.5, 'cx="63" cy="79.5" r="4"'))
    # --- head
    g.append(f'<clipPath id="{pid}head"><circle cx="68" cy="50" r="26"/></clipPath>')
    g.append(f'<circle cx="68" cy="50" r="26" fill="{P["teal"]}"/>')
    g.append(f'<g clip-path="url(#{pid}head)"><circle cx="76" cy="40" r="30" fill="none" '
             f'stroke="{P["teal_sh"]}" stroke-width="14"/></g>')
    g.append(f'<circle cx="68" cy="50" r="26" fill="none" stroke="{P["teal_ln"]}" stroke-width="4"/>')
    g.append(f'<ellipse cx="57" cy="33" rx="8" ry="4" fill="{P["teal_hi"]}" transform="rotate(-30 57 33)"/>')
    # head seam + rivet (robot detail)
    g.append(f'<path d="M48,38 Q56,30 66,29" fill="none" stroke="{P["teal_sh"]}" stroke-width="2" {ROUND}/>')
    # --- muzzle
    g.append(sh("ellipse", P["cream"], P["cream_ln"], 4, 'cx="85" cy="61" rx="15" ry="11"'))
    g.append(f'<path d="M73,66 Q84,73 97,66" fill="none" stroke="{P["cream_sh"]}" stroke-width="3" {ROUND}/>')
    # smile
    g.append(f'<path d="M84,64 Q89,69 94,64" fill="none" stroke="{P["eye_ln"]}" stroke-width="2.6" {ROUND}/>')
    # --- nose lamp
    if lamp:
        g.append(f'<circle cx="97" cy="56" r="10" fill="{P["lamp_glow"]}" opacity="0.45"/>')
        g.append(sh("circle", P["lamp"], P["lamp_ln"], 3, 'cx="97" cy="56" r="5.5"'))
        g.append('<circle cx="95.4" cy="54.3" r="1.8" fill="#ffffff"/>')
    else:
        g.append(sh("circle", P["lamp_off"], P["lamp_ln"], 3, 'cx="97" cy="56" r="5.5"'))
    # --- blush
    g.append(f'<ellipse cx="62" cy="62" rx="5.5" ry="3.2" fill="{P["blush"]}" opacity="0.7"/>')
    # --- eyes
    g.append(eyes_svg(eyes))
    # --- near ear (floppy, hangs off the back of the head)
    if ears == "perky":
        ear = "M54,30 C40,26 30,38 30,52 C30,64 38,70 44,64 C50,58 54,44 54,30 Z"
        inner = "M50,35 C42,34 36,42 36,52 C36,58 40,61 43,58"
        g.append(sh("path", P["steel"], P["steel_ln"], 4, f'd="{ear}"'))
        g.append(f'<path d="{inner}" fill="none" stroke="{P["steel_sh"]}" stroke-width="4" {ROUND}/>')
        g.append(f'<ellipse cx="44" cy="33" rx="4.5" ry="2.2" fill="{P["steel_hi"]}" transform="rotate(-20 44 33)"/>')
    else:  # droopy: hangs straight down, flatter
        ear = "M54,32 C44,32 38,42 38,56 C38,68 42,74 47,71 C52,67 55,48 54,32 Z"
        inner = "M50,38 C45,40 42,48 42,57 C42,63 44,66 46,65"
        g.append(sh("path", P["steel"], P["steel_ln"], 4, f'd="{ear}"'))
        g.append(f'<path d="{inner}" fill="none" stroke="{P["steel_sh"]}" stroke-width="4" {ROUND}/>')
    return "\n".join(g)


def spiral(cx, cy, r, turns=2.2, steps=40):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = t * turns * 2 * math.pi
        rr = r * t
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return "M" + " L".join(f"{f(x)},{f(y)}" for x, y in pts)


def eyes_svg(mode):
    g = []
    eyes = [(67, 46, 8.5, 10.5), (86, 45, 6.5, 9.5)]  # near (big), far (smaller)
    if mode == "closed":
        for cx, cy, rx, ry in eyes:
            g.append(f'<path d="M{cx-rx+1},{cy+1} Q{cx},{cy+ry*0.65} {cx+rx-1},{cy+1}" fill="none" '
                     f'stroke="{P["pupil"]}" stroke-width="3.2" {ROUND}/>')
        return "\n".join(g)
    for cx, cy, rx, ry in eyes:
        g.append(sh("ellipse", P["eye"], P["eye_ln"], 3, f'cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"'))
    if mode == "open":
        for (cx, cy, rx, ry) in eyes:
            pr = rx * 0.68
            px, py = cx + rx * 0.22, cy + ry * 0.12
            g.append(f'<ellipse cx="{f(px)}" cy="{f(py)}" rx="{f(pr)}" ry="{f(pr*1.12)}" fill="{P["pupil"]}"/>')
            g.append(f'<circle cx="{f(px+pr*0.35)}" cy="{f(py-pr*0.45)}" r="{f(pr*0.42)}" fill="#ffffff"/>')
            g.append(f'<circle cx="{f(px-pr*0.4)}" cy="{f(py+pr*0.5)}" r="{f(pr*0.18)}" fill="#ffffff"/>')
    elif mode == "dizzy":
        for (cx, cy, rx, ry) in eyes:
            g.append(f'<path d="{spiral(cx, cy+0.5, rx*0.82, 2.3)}" fill="none" stroke="{P["pupil"]}" '
                     f'stroke-width="2.2" {ROUND}/>')
    return "\n".join(g)


def propeller(frame):
    """Blades + hub, entirely within y < 24."""
    g = []
    r, rs, ln, hi = P["red"], P["red_sh"], P["red_ln"], P["red_hi"]
    if frame == 0:      # blades wide, side to side
        for cx in (41, 79):
            g.append(sh("ellipse", r, ln, 3.5, f'cx="{cx}" cy="13" rx="19" ry="5.2"'))
            g.append(f'<path d="M{cx-14},15.2 Q{cx},18 {cx+14},15.2" fill="none" stroke="{rs}" stroke-width="2.4" {ROUND}/>')
            g.append(f'<ellipse cx="{cx-5}" cy="11.4" rx="6" ry="1.5" fill="{hi}"/>')
    elif frame == 1:    # three-quarter turn: one blade forward, one back
        g.append(f'<ellipse cx="60" cy="14" rx="36" ry="7" fill="none" stroke="{r}" stroke-width="2" opacity="0.25"/>')
        g.append(sh("ellipse", rs, ln, 3.5, 'cx="73" cy="11.5" rx="13" ry="4" transform="rotate(-8 73 11.5)"'))
        g.append(sh("ellipse", r, ln, 3.5, 'cx="46" cy="16" rx="15" ry="5.2" transform="rotate(-8 46 16)"'))
        g.append(f'<ellipse cx="42" cy="14.6" rx="5" ry="1.4" fill="{hi}" transform="rotate(-8 42 14.6)"/>')
    else:               # edge-on blur with a faint motion arc
        g.append(f'<ellipse cx="60" cy="14" rx="37" ry="7.5" fill="{r}" opacity="0.16"/>')
        g.append(f'<path d="M24,15 Q60,24 96,15" fill="none" stroke="{r}" stroke-width="2.4" opacity="0.45" {ROUND}/>')
        g.append(f'<path d="M30,10 Q60,4 90,10" fill="none" stroke="{r}" stroke-width="1.8" opacity="0.3" {ROUND}/>')
        g.append(sh("ellipse", r, ln, 3.5, 'cx="60" cy="14" rx="9" ry="3.6"'))
    # hub cap at (60,14)
    g.append(sh("circle", r, ln, 3.5, 'cx="60" cy="14" r="5"'))
    g.append(f'<circle cx="58.6" cy="12.6" r="1.6" fill="{hi}"/>')
    return "\n".join(g)


def pup(frame=0, eyes="open", ears="perky", lamp=True, pid="p"):
    # draw order: body first, then the propeller on top (they never overlap anyway)
    return svg(120, 110, pup_body(eyes, ears, lamp, pid) + "\n" + propeller(frame))


def pup_sleep():
    # propeller still, parked slightly tilted, no motion marks
    body = pup_body("closed", "droopy", False, "s")
    r, ln, rs = P["red"], P["red_ln"], P["red_sh"]
    prop = [
        sh("ellipse", r, ln, 3.5, 'cx="42" cy="15" rx="19" ry="5" transform="rotate(6 42 15)"'),
        sh("ellipse", r, ln, 3.5, 'cx="78" cy="13" rx="19" ry="5" transform="rotate(6 78 13)"'),
        sh("circle", r, ln, 3.5, 'cx="60" cy="14" r="5"'),
        f'<circle cx="58.6" cy="12.6" r="1.6" fill="{P["red_hi"]}"/>',
    ]
    return svg(120, 110, body + "\n" + "\n".join(prop))


# ================================================================ leaves
LEAF_SW = 4 * 64 / 44  # 4 px outline at the 44 px drawn size


def leaf_mint():
    c = ("mint", "mint_sh", "mint_ln", "mint_vein")
    # round serrated leaf: polar shape with saw teeth, tip at upper right
    pts = []
    n = 18
    for i in range(n * 2):
        a = i / (n * 2) * 2 * math.pi
        base = 22 + 3.5 * math.cos(a)            # slightly egg-shaped
        tip = 5.0 * max(0, math.cos(a)) ** 6      # pointed tip at a = 0
        rr = base + tip + (2.4 if i % 2 == 0 else -0.6)
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    rot = math.radians(-40)
    pts = [(32 + x * math.cos(rot) - y * math.sin(rot), 33 + x * math.sin(rot) + y * math.cos(rot)) for x, y in pts]
    d = "M" + " L".join(f"{f(x)},{f(y)}" for x, y in pts) + " Z"
    return leaf_common(d, c, vein=[
        "M14,51 L49,16",
        "M24,41 L18,31", "M24,41 L34,47", "M32,33 L27,22", "M32,33 L43,38", "M40,25 L44,32",
    ], stem="M14,51 L7,58", shadow='d="M14,51 L49,16 C58,30 54,48 38,54 C28,58 18,56 14,51 Z"', mid_clip=d)


def leaf_basil():
    c = ("basil", "basil_sh", "basil_ln", "basil_vein")
    d = "M12,52 C4,36 12,12 34,7 C48,4 60,10 58,18 C56,40 40,58 12,52 Z"
    return leaf_common(d, c, vein=[
        "M12,52 C26,38 38,24 54,13",
        "M22,42 C18,34 18,26 22,20", "M30,34 C28,26 30,18 36,13",
        "M24,40 C32,44 40,44 46,40", "M34,30 C42,32 48,30 52,26",
    ], stem="M12,52 L6,59",
        shadow='d="M12,52 C26,38 38,24 54,13 C60,22 50,44 36,52 C28,56 18,56 12,52 Z"',
        mid_clip=d, cup="M18,47 C26,30 40,18 52,14")


def leaf_bay():
    c = ("bay", "bay_sh", "bay_ln", "bay_vein")
    d = "M8,57 C6,42 22,18 42,9 C52,5 59,4 59,6 C59,9 56,18 50,28 C40,46 22,58 8,57 Z"
    return leaf_common(d, c, vein=[
        "M8,57 C24,42 40,24 58,6",
        "M18,48 L16,40", "M18,48 L26,49", "M28,38 L27,29", "M28,38 L37,38",
        "M38,27 L38,20", "M38,27 L46,26",
    ], stem="M8,57 L4,61",
        shadow='d="M8,57 C24,42 40,24 58,6 C58,12 54,22 48,30 C38,46 22,58 8,57 Z"', mid_clip=d)


def leaf_common(d, c, vein, stem, shadow, mid_clip, cup=None):
    fill, shc, ln, vc = (P[k] for k in c)
    sw = LEAF_SW
    cid = c[0] + "clip"
    g = [
        f'<radialGradient id="{cid}h"><stop offset="0.55" stop-color="{P["halo"]}" stop-opacity="0.45"/>'
        f'<stop offset="1" stop-color="{P["halo"]}" stop-opacity="0"/></radialGradient>',
        f'<circle cx="32" cy="32" r="32" fill="url(#{cid}h)"/>',
        f'<path d="{stem}" fill="none" stroke="{ln}" stroke-width="{f(sw*1.6)}" {ROUND}/>',
        f'<path d="{stem}" fill="none" stroke="{shc}" stroke-width="{f(sw*0.6)}" {ROUND}/>',
        f'<clipPath id="{cid}"><path d="{mid_clip}"/></clipPath>',
        f'<path d="{d}" fill="{fill}"/>',
        f'<g clip-path="url(#{cid})"><path {shadow} fill="{shc}"/></g>',
    ]
    if cup:
        g.append(f'<g clip-path="url(#{cid})"><path d="{cup}" fill="none" stroke="{shc}" stroke-width="{f(sw*1.3)}" {ROUND}/></g>')
    for v in vein:
        w = sw * 0.75 if v is vein[0] else sw * 0.45
        g.append(f'<path d="{v}" fill="none" stroke="{vc}" stroke-width="{f(w)}" {ROUND} opacity="0.95"/>')
    g.append(f'<path d="{d}" fill="none" stroke="{ln}" stroke-width="{f(sw)}" {ROUND}/>')
    # highlight
    g.append(f'<ellipse cx="22" cy="22" rx="5" ry="2.2" fill="#ffffff" opacity="0.55" transform="rotate(-45 22 22)"/>')
    return svg(64, 64, "\n".join(g))


# ================================================================ hanging utensils
def ring(metal="stl"):
    m, ln = P[metal], P[metal + "_ln"]
    # ring top edge at y = 6 (outer edge of the stroke)
    return (f'<circle cx="60" cy="13" r="5.5" fill="none" stroke="{ln}" stroke-width="7"/>\n'
            f'<circle cx="60" cy="13" r="5.5" fill="none" stroke="{m}" stroke-width="2.6"/>')


def handle(y0, y1, metal, w=10):
    m, s, ln, hi = P[metal], P[metal + "_sh"], P[metal + "_ln"], P[metal + "_hi"] if metal + "_hi" in P else "#ffffff"
    x = 60 - w / 2
    return "\n".join([
        sh("rect", m, ln, 4, f'x="{f(x)}" y="{y0}" width="{w}" height="{y1-y0}" rx="{f(w/2)}"'),
        f'<rect x="{f(60+w/2-4)}" y="{y0+4}" width="2.6" height="{y1-y0-8}" rx="1.3" fill="{s}"/>',
        f'<rect x="{f(x+2.4)}" y="{y0+6}" width="2" height="{(y1-y0)*0.5:.0f}" rx="1" fill="{hi}"/>',
        f'<circle cx="60" cy="{y0+9}" r="2.4" fill="{P["stl_ln"]}" opacity="0.6"/>',
    ])


def hang_ladle():
    g = [ring("stl"), handle(17, 132, "copper", 11)]
    # deep bowl seen from the side: rim ellipse on top, round belly below
    bowl = "M18,128 C18,162 38,180 60,180 C82,180 102,162 102,128 Z"
    g.append(f'<clipPath id="ladb"><path d="{bowl}"/></clipPath>')
    g.append(f'<path d="{bowl}" fill="{P["stl"]}"/>')
    g.append(f'<g clip-path="url(#ladb)"><ellipse cx="78" cy="170" rx="40" ry="34" fill="{P["stl_sh"]}"/></g>')
    g.append(f'<path d="{bowl}" fill="none" stroke="{P["stl_ln"]}" stroke-width="4" {ROUND}/>')
    g.append(f'<path d="M30,140 Q34,160 48,168" fill="none" stroke="{P["stl_hi"]}" stroke-width="5" {ROUND}/>')
    # rim and the dark inside
    g.append(sh("ellipse", P["stl"], P["stl_ln"], 4, 'cx="60" cy="128" rx="42" ry="10"'))
    g.append(f'<ellipse cx="60" cy="129" rx="35" ry="6" fill="{P["pan_in"]}"/>')
    # handle meets the rim at the back with a copper rivet plate
    g.append(sh("rect", P["copper"], P["copper_ln"], 3, 'x="53" y="112" width="14" height="14" rx="4"'))
    g.append(f'<circle cx="60" cy="119" r="2.2" fill="{P["copper_ln"]}"/>')
    return svg(120, 200, "\n".join(g))


def hang_whisk():
    g = [ring("stl")]
    # wooden handle
    g.append(sh("rect", P["wood"], P["wood_ln"], 4, 'x="53" y="18" width="14" height="72" rx="7"'))
    g.append(f'<rect x="61.5" y="23" width="3" height="62" rx="1.5" fill="{P["wood_sh"]}"/>')
    g.append(f'<rect x="56" y="25" width="2.4" height="34" rx="1.2" fill="#f1c592"/>')
    # wires: ellipses through top (60,100) and bottom (60,196)
    wires = [42, 27, 11]
    for rx in wires:
        g.append(f'<ellipse cx="60" cy="149" rx="{rx}" ry="47" fill="none" stroke="{P["stl_ln"]}" stroke-width="6.5"/>')
    for rx in wires:
        g.append(f'<ellipse cx="60" cy="149" rx="{rx}" ry="47" fill="none" stroke="{P["stl"]}" stroke-width="2.6"/>')
    g.append(f'<path d="M26,128 Q32,112 44,106" fill="none" stroke="{P["stl_hi"]}" stroke-width="2.4" {ROUND}/>')
    # ferrule
    g.append(sh("rect", P["stl"], P["stl_ln"], 4, 'x="51" y="86" width="18" height="18" rx="5"'))
    g.append(f'<rect x="54" y="90" width="3" height="10" rx="1.5" fill="{P["stl_hi"]}"/>')
    g.append(f'<rect x="63" y="90" width="3" height="10" rx="1.5" fill="{P["stl_sh"]}"/>')
    return svg(120, 200, "\n".join(g))


def hang_pan():
    g = [ring("stl")]
    # dark heat-proof handle with a hanging hole
    g.append(sh("rect", P["wood"], P["wood_ln"], 4, 'x="53.5" y="18" width="13" height="80" rx="6.5"'))
    g.append(f'<rect x="61.5" y="24" width="2.6" height="68" rx="1.3" fill="{P["wood_sh"]}"/>')
    g.append('<rect x="56.2" y="28" width="2.4" height="40" rx="1.2" fill="#f1c592"/>')
    g.append(sh("rect", P["copper"], P["copper_ln"], 3.5, 'x="54" y="94" width="12" height="20" rx="3"'))
    # pan face: copper rim, steel cooking surface
    g.append(sh("circle", P["copper"], P["copper_ln"], 4, 'cx="60" cy="150" r="42"'))
    g.append(f'<path d="M24,158 A36,36 0 0 0 96,158" fill="none" stroke="{P["copper_sh"]}" stroke-width="6"/>')
    g.append(sh("circle", P["pan_in"], P["copper_ln"], 2.5, 'cx="60" cy="150" r="32"'))
    g.append(f'<clipPath id="panin"><circle cx="60" cy="150" r="32"/></clipPath>')
    g.append(f'<g clip-path="url(#panin)"><circle cx="70" cy="160" r="32" fill="{P["pan_in_sh"]}"/></g>')
    g.append(f'<circle cx="60" cy="150" r="32" fill="none" stroke="{P["copper_ln"]}" stroke-width="2.5"/>')
    g.append(f'<path d="M38,138 Q42,126 54,122" fill="none" stroke="#a3adb5" stroke-width="3.5" {ROUND}/>')
    g.append(f'<path d="M26,132 Q32,116 46,110" fill="none" stroke="{P["copper_hi"]}" stroke-width="4" {ROUND}/>')
    return svg(120, 200, "\n".join(g))


# ================================================================ stack pieces
def stack_pot():
    c, s, ln, hi = P["copper"], P["copper_sh"], P["copper_ln"], P["copper_hi"]
    g = []
    # side handles (loops)
    for d in ('M20,44 C8,44 8,60 20,60', 'M130,44 C142,44 142,60 130,60'):
        g.append(f'<path d="{d}" fill="none" stroke="{ln}" stroke-width="9" {ROUND}/>')
        g.append(f'<path d="{d}" fill="none" stroke="{P["stl"]}" stroke-width="4" {ROUND}/>')
    # body
    g.append('<clipPath id="potb"><path d="M18,34 L132,34 L130,80 Q129,88 120,88 L30,88 Q21,88 20,80 Z"/></clipPath>')
    g.append(f'<path d="M18,34 L132,34 L130,80 Q129,88 120,88 L30,88 Q21,88 20,80 Z" fill="{c}"/>')
    g.append(f'<g clip-path="url(#potb)"><rect x="96" y="30" width="40" height="62" fill="{s}"/>'
             f'<rect x="10" y="74" width="130" height="20" fill="{s}"/></g>')
    g.append(f'<path d="M18,34 L132,34 L130,80 Q129,88 120,88 L30,88 Q21,88 20,80 Z" fill="none" stroke="{ln}" stroke-width="4" {ROUND}/>')
    g.append(f'<rect x="30" y="42" width="6" height="28" rx="3" fill="{hi}"/>')
    # rim band
    g.append(sh("rect", c, ln, 4, 'x="14" y="30" width="122" height="9" rx="4.5"'))
    g.append(f'<rect x="22" y="32.5" width="40" height="3" rx="1.5" fill="{hi}"/>')
    # lid
    g.append(sh("path", P["stl"], P["stl_ln"], 4, 'd="M20,31 Q24,13 75,12 Q126,13 130,31 Z"'))
    g.append(f'<path d="M40,22 Q56,16 72,15.5" fill="none" stroke="{P["stl_hi"]}" stroke-width="3.5" {ROUND}/>')
    g.append(f'<path d="M96,27 Q112,25 122,28" fill="none" stroke="{P["stl_sh"]}" stroke-width="3" {ROUND}/>')
    g.append(sh("rect", P["knob"], P["knob_ln"], 4, 'x="64" y="4" width="22" height="10" rx="5"'))
    return svg(150, 90, "\n".join(g))


def stack_mug():
    c, s, ln = P["mug"], P["mug_sh"], P["mug_ln"]
    g = []
    # handle on the right
    d = "M80,30 C104,28 104,70 80,68"
    g.append(f'<path d="{d}" fill="none" stroke="{ln}" stroke-width="14" {ROUND}/>')
    g.append(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="6" {ROUND}/>')
    body = "M10,14 L84,14 L82,78 Q81,88 70,88 L24,88 Q13,88 12,78 Z"
    g.append(f'<clipPath id="mugb"><path d="{body}"/></clipPath>')
    g.append(f'<path d="{body}" fill="{c}"/>')
    g.append(f'<g clip-path="url(#mugb)"><rect x="62" y="10" width="30" height="82" fill="{s}"/>')
    # dots
    for i, (x, y) in enumerate([(24, 32), (44, 26), (64, 34), (32, 52), (54, 50), (74, 56), (22, 72), (44, 72), (64, 76)]):
        col = P["dot"] if i % 3 else P["dot2"]
        g.append(f'<circle cx="{x}" cy="{y}" r="4.2" fill="{col}"/>')
    g.append('</g>')
    g.append(f'<path d="{body}" fill="none" stroke="{ln}" stroke-width="4" {ROUND}/>')
    # rim / opening
    g.append(sh("ellipse", P["mug_sh"], ln, 4, 'cx="47" cy="14" rx="39" ry="6"'))
    g.append(f'<ellipse cx="47" cy="15.5" rx="31" ry="3" fill="#8a5a3c"/>')  # cocoa inside
    g.append(f'<rect x="18" y="24" width="5" height="40" rx="2.5" fill="#ffffff" opacity="0.6"/>')
    return svg(110, 90, "\n".join(g))


def stack_jar():
    g = []
    body = "M14,34 Q10,30 14,26 L86,26 Q90,30 86,34 L88,104 Q88,116 76,116 L24,116 Q12,116 12,104 Z"
    g.append(f'<clipPath id="jarb"><path d="{body}"/></clipPath>')
    g.append(f'<path d="{body}" fill="{P["glass"]}" opacity="0.85"/>')
    # beans inside (bottom ~60 %)
    beans = []
    import random
    rnd = random.Random(7)
    for row in range(6):
        y = 111 - row * 9
        for k in range(7):
            x = 16 + k * 12.5 + (6 if row % 2 else 0) + rnd.uniform(-1.5, 1.5)
            a = rnd.uniform(-40, 40)
            two = rnd.random() < 0.3
            fc, lc = (P["bean2"], P["bean2_ln"]) if two else (P["bean"], P["bean_ln"])
            beans.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="7" ry="4.6" fill="{fc}" stroke="{lc}" stroke-width="2" '
                         f'transform="rotate({f(a)} {f(x)} {f(y)})"/>')
    g.append(f'<g clip-path="url(#jarb)">' + "".join(beans) +
             f'<rect x="66" y="20" width="30" height="100" fill="{P["glass_sh"]}" opacity="0.45"/></g>')
    g.append(f'<path d="{body}" fill="none" stroke="{P["glass_ln"]}" stroke-width="4" {ROUND}/>')
    # glass highlights
    g.append(f'<rect x="20" y="40" width="6" height="56" rx="3" fill="#ffffff" opacity="0.75"/>')
    g.append(f'<rect x="30" y="40" width="3" height="20" rx="1.5" fill="#ffffff" opacity="0.6"/>')
    # lid
    g.append(sh("rect", P["jarlid"], P["jarlid_ln"], 4, 'x="12" y="8" width="76" height="20" rx="6"'))
    g.append(f'<rect x="12" y="20" width="76" height="8" rx="4" fill="{P["jarlid_sh"]}"/>')
    g.append(f'<rect x="12" y="8" width="76" height="20" rx="6" fill="none" stroke="{P["jarlid_ln"]}" stroke-width="4"/>')
    for x in range(24, 84, 12):
        g.append(f'<rect x="{x}" y="12" width="4" height="8" rx="2" fill="#ffffff" opacity="0.55"/>')
    return svg(100, 120, "\n".join(g))


def stack_bowl():
    c, s, ln = P["bowl"], P["bowl_sh"], P["bowl_ln"]
    g = []
    body = "M10,16 L140,16 C138,44 116,60 98,62 L52,62 C34,60 12,44 10,16 Z"
    g.append(sh("rect", s, ln, 4, 'x="48" y="56" width="54" height="12" rx="5"'))
    g.append(f'<clipPath id="bowlb"><path d="{body}"/></clipPath>')
    g.append(f'<path d="{body}" fill="{c}"/>')
    g.append(f'<g clip-path="url(#bowlb)"><path d="M10,46 Q75,62 140,30 L140,70 L10,70 Z" fill="{s}"/>'
             f'<path d="M6,30 Q75,38 144,30" fill="none" stroke="{P["bowl_band"]}" stroke-width="7"/></g>')
    g.append(f'<path d="{body}" fill="none" stroke="{ln}" stroke-width="4" {ROUND}/>')
    g.append(sh("rect", c, ln, 4, 'x="8" y="8" width="134" height="11" rx="5.5"'))
    g.append(f'<rect x="16" y="10.5" width="46" height="3" rx="1.5" fill="#ffffff" opacity="0.7"/>')
    g.append(f'<path d="M22,26 Q26,38 36,46" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.6" {ROUND}/>')
    return svg(150, 70, "\n".join(g))


def kettle():
    c, s, ln, hi = P["ket"], P["ket_sh"], P["ket_ln"], P["ket_hi"]
    g = []
    # handle arch (behind)
    d = "M34,54 C30,16 94,16 90,54"
    g.append(f'<path d="{d}" fill="none" stroke="{P["wood_ln"]}" stroke-width="13" {ROUND}/>')
    g.append(f'<path d="{d}" fill="none" stroke="{P["wood"]}" stroke-width="6" {ROUND}/>')
    g.append(f'<path d="M42,30 C50,22 62,20 72,21" fill="none" stroke="#f1c592" stroke-width="2" {ROUND}/>')
    # spout: from body side up to the tip at (128,40)
    spout = "M98,88 C114,82 120,62 125,45"
    g.append(f'<path d="{spout}" fill="none" stroke="{ln}" stroke-width="16" {ROUND}/>')
    g.append(f'<path d="{spout}" fill="none" stroke="{c}" stroke-width="8.5" {ROUND}/>')
    g.append(f'<path d="M108,82 C116,74 120,62 123,52" fill="none" stroke="{s}" stroke-width="3" {ROUND}/>')
    g.append(sh("ellipse", s, ln, 3, 'cx="127" cy="41.5" rx="6.5" ry="3.6" transform="rotate(-62 127 41.5)"'))
    # base foot
    g.append(sh("rect", s, ln, 4, 'x="30" y="108" width="64" height="10" rx="4"'))
    # body
    g.append('<clipPath id="ketb"><ellipse cx="62" cy="80" rx="48" ry="34"/></clipPath>')
    g.append(f'<ellipse cx="62" cy="80" rx="48" ry="34" fill="{c}"/>')
    g.append(f'<g clip-path="url(#ketb)"><ellipse cx="74" cy="98" rx="52" ry="26" fill="{s}"/>'
             f'<path d="M10,84 Q62,96 114,84" fill="none" stroke="#fff3dc" stroke-width="7"/>'
             f'<circle cx="62" cy="88" r="7" fill="#fff3dc"/><circle cx="62" cy="88" r="3.5" fill="{c}"/></g>')
    g.append(f'<ellipse cx="62" cy="80" rx="48" ry="34" fill="none" stroke="{ln}" stroke-width="4"/>')
    g.append(f'<ellipse cx="36" cy="66" rx="10" ry="5" fill="{hi}" transform="rotate(-35 36 66)"/>')
    g.append(f'<circle cx="28" cy="78" r="2.5" fill="{hi}"/>')
    # lid + knob
    g.append(sh("path", c, ln, 4, 'd="M40,50 Q42,38 62,37 Q82,38 84,50 Z"'))
    g.append(f'<path d="M48,44 Q54,40 62,40" fill="none" stroke="{hi}" stroke-width="2.6" {ROUND}/>')
    g.append(sh("ellipse", P["knob"], P["knob_ln"], 3.5, 'cx="62" cy="34" rx="7" ry="5"'))
    return svg(140, 120, "\n".join(g))


# ================================================================ HUD
BAT_SW = 4 * 64 / 48


def battery(full=True):
    sw = BAT_SW
    g = []
    if full:
        case, ln = P["bat_case"], P["bat_ln"]
        g.append(sh("rect", ln, ln, f(sw * 0.8), 'x="52" y="14" width="8" height="12" rx="3"'))
        g.append(sh("rect", case, ln, f(sw), 'x="5" y="5" width="48" height="30" rx="8"'))
        for i in range(3):
            x = 11 + i * 13.5
            g.append(f'<rect x="{f(x)}" y="11" width="11" height="18" rx="3" fill="{P["bat_g"]}"/>')
            g.append(f'<rect x="{f(x)}" y="22" width="11" height="7" rx="3" fill="{P["bat_g_sh"]}"/>')
            g.append(f'<rect x="{f(x+2)}" y="13" width="3" height="6" rx="1.5" fill="#ffffff" opacity="0.7"/>')
        g.append(f'<rect x="10" y="7.5" width="22" height="2.4" rx="1.2" fill="#ffffff" opacity="0.9"/>')
    else:
        ln = P["bat_e_ln"]
        g.append(f'<rect x="52" y="14" width="8" height="12" rx="3" fill="{ln}" opacity="0.8"/>')
        g.append(f'<rect x="5" y="5" width="48" height="30" rx="8" fill="{P["bat_e_fill"]}" fill-opacity="0.35" '
                 f'stroke="{ln}" stroke-width="{f(sw)}" stroke-dasharray="0"/>')
        g.append(f'<rect x="11" y="11" width="9" height="18" rx="3" fill="{ln}" opacity="0.35"/>')
    return svg(64, 40, "\n".join(g))


def icon():
    g = [
        sh("circle", P["badge"], P["badge_ln"], 10, 'cx="128" cy="128" r="118"'),
        f'<path d="M30,150 A100,100 0 0 0 226,150" fill="none" stroke="{P["badge_sh"]}" stroke-width="14" {ROUND}/>',
        f'<circle cx="128" cy="128" r="100" fill="none" stroke="#ffe7a6" stroke-width="5"/>',
    ]
    # Biscuit's head only, scaled up: ears, mast, head, muzzle, eyes, nose, propeller
    head = []
    head.append(sh("path", P["steel_sh"], P["steel_ln"], 4,
                   'd="M80,30 C90,24 100,30 100,40 C100,48 94,52 89,47 C86,43 84,36 80,30 Z"'))
    head.append(sh("rect", P["steel"], P["steel_ln"], 3.5, 'x="56.5" y="17" width="7" height="16" rx="3"'))
    head.append('<clipPath id="ichead"><circle cx="68" cy="50" r="26"/></clipPath>')
    head.append(f'<circle cx="68" cy="50" r="26" fill="{P["teal"]}"/>')
    head.append(f'<g clip-path="url(#ichead)"><circle cx="76" cy="40" r="30" fill="none" stroke="{P["teal_sh"]}" stroke-width="14"/></g>')
    head.append(f'<circle cx="68" cy="50" r="26" fill="none" stroke="{P["teal_ln"]}" stroke-width="4"/>')
    head.append(f'<ellipse cx="57" cy="33" rx="8" ry="4" fill="{P["teal_hi"]}" transform="rotate(-30 57 33)"/>')
    head.append(sh("ellipse", P["cream"], P["cream_ln"], 4, 'cx="85" cy="61" rx="15" ry="11"'))
    head.append(f'<path d="M73,66 Q84,73 97,66" fill="none" stroke="{P["cream_sh"]}" stroke-width="3" {ROUND}/>')
    head.append(f'<path d="M84,64 Q89,69 94,64" fill="none" stroke="{P["eye_ln"]}" stroke-width="2.6" {ROUND}/>')
    head.append(f'<circle cx="97" cy="56" r="10" fill="{P["lamp_glow"]}" opacity="0.5"/>')
    head.append(sh("circle", P["lamp"], P["lamp_ln"], 3, 'cx="97" cy="56" r="5.5"'))
    head.append('<circle cx="95.4" cy="54.3" r="1.8" fill="#ffffff"/>')
    head.append(f'<ellipse cx="62" cy="62" rx="5.5" ry="3.2" fill="{P["blush"]}" opacity="0.7"/>')
    head.append(eyes_svg("open"))
    head.append(sh("path", P["steel"], P["steel_ln"], 4,
                   'd="M54,30 C40,26 30,38 30,52 C30,64 38,70 44,64 C50,58 54,44 54,30 Z"'))
    head.append(f'<path d="M50,35 C42,34 36,42 36,52 C36,58 40,61 43,58" fill="none" stroke="{P["steel_sh"]}" stroke-width="4" {ROUND}/>')
    head.append(propeller(0))
    # head group spans x 21..107, y 6..80 -> centre (64,43); scale 2.55 into the badge
    s = 2.4
    tx, ty = 128 - 64 * s, 130 - 43 * s
    g.append(f'<g transform="translate({f(tx)} {f(ty)}) scale({s})">' + "\n".join(head) + "</g>")
    return svg(256, 256, "\n".join(g))


# ================================================================ main
FILES = {
    "pup_0.svg": lambda: pup(0, pid="a"),
    "pup_1.svg": lambda: pup(1, pid="b"),
    "pup_2.svg": lambda: pup(2, pid="c"),
    "pup_hurt.svg": lambda: pup(1, eyes="dizzy", pid="h"),
    "pup_sleep.svg": pup_sleep,
    "leaf_mint.svg": leaf_mint,
    "leaf_basil.svg": leaf_basil,
    "leaf_bay.svg": leaf_bay,
    "hang_ladle.svg": hang_ladle,
    "hang_whisk.svg": hang_whisk,
    "hang_pan.svg": hang_pan,
    "stack_pot.svg": stack_pot,
    "stack_mug.svg": stack_mug,
    "stack_jar.svg": stack_jar,
    "stack_bowl.svg": stack_bowl,
    "kettle.svg": kettle,
    "battery_full.svg": lambda: battery(True),
    "battery_empty.svg": lambda: battery(False),
    "icon.svg": icon,
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in FILES.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
            fh.write(fn())
    print(f"wrote {len(FILES)} files to {OUT}")
