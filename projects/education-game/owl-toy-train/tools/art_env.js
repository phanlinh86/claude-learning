// Momo's Toy Train: toy-room environment + particle art generator (100 % original, hand-laid flat-cartoon SVG).
// Writes game/assets/default/env/{far,mid,ground}_{morning,noon,sunset,night}.svg, sun, moon, cloud_a, cloud_b and
// game/assets/default/particles/{mote,bubble,feather,puff,star,sparkle,confetti_a,confetti_b}.svg     (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: every tileable layer is 1200 wide; repeating details use periods that divide 1200 (wallpaper 50, wainscot
// panels 200, floorboards 75) and anything crossing x = 0/1200 is drawn twice (x and x - 1200), so edges match.
// Colour rule (DESIGN §3): the room is calm, creamy and desaturated so the answer colours pop; no answer hue in a
// large area. The four moods share one layout; only the palette (and small dressing: sunbeam, night-light) changes.
//
// Layer anchors (see env_scenes.js RECIPE for the screen maths):
//   far    0 0 1200 720 : floor line = y 720 (bottom edge). Window glass = transparent hole x 404–796, y 168–440.
//   mid    0 0 1200 300 : props stand on y 292 (that row sits 8 px below the floor line, on the back floor band).
//   ground 0 0 1200 260 : floor line = y 0 (top edge). Vertical 5-slice:
//            A 0–96 back floor (0–22) + rug top fringe/border (22–64) + rug top (64–96)   — fixed
//            B 96–104 flat rug colour                                                     — stretch
//            C 104–168 rug bottom (104–124) + border (124–162) + floor (162–168)           — fixed
//            D 168–184 floorboards, vertical seams only                                   — stretch
//            E 184–260 front floor                                                         — fixed, bottom = screen bottom
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const RR = (x, y, w, h, r, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" fill="${fill}"${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const S = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const rectP = (x, y, w, h) => `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
const rrP = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}H${f(x + r)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
const starPts = (cx, cy, ro, ri, n = 5, rot = -Math.PI / 2) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? ri : ro; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; };
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
const lg = (id, stops, extra = '') => `<linearGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');

// ---------------- palettes ----------------
// exact wall colours (DESIGN §3) + sky gradients for the renderer
const WALL = { morning: '#F3E6CF', noon: '#F6EBD8', sunset: '#F2D6C0', night: '#4B4F78' };
const SKY = { morning: ['#BFE3F5', '#FFF3D6'], noon: ['#86CBF0', '#DFF2FB'], sunset: ['#F7A86B', '#FCD9A8'], night: ['#1D2350', '#3B3F7A'] };
// mood tint for every detail colour (designed in morning colours)
function tint(m, c, s = 1) {
  if (m === 'noon') return mix(c, '#FFFFFF', 0.07 * s);
  if (m === 'sunset') return mix(c, '#EE9F78', 0.17 * s);
  if (m === 'night') return mix(c, '#262A5A', Math.min(0.9, 0.7 * s));
  return c;
}
const BASE = {
  wall: '#F3E6CF', stripe: '#EEDDC2', rail: '#E2CCA8', wains: '#E7D3B4', wainsDk: '#D6BE99', wainsLt: '#F1E2C8', chair: '#F6ECD9',
  skirt: '#CCAE86', floor: '#D8B88E', floorDk: '#C9A577', floorLt: '#E0C39C', seam: '#B9966A',
  rug: '#CFE3D8', rugDk: '#B6D0C2', rugB: '#F6EEDC', rugBDk: '#E2D3B5', fringe: '#EADFC6',
  frame: '#F8F2E6', frameDk: '#D9C9AA', sill: '#EFE4CF', curtain: '#EBD9C8', curtainDk: '#D6BFA9', curtainLt: '#F4E8DB',
  shelf: '#CFAA7C', shelfDk: '#A98458', shadow: '#5A4128',
};
const NIGHT = {
  wall: '#4B4F78', stripe: '#484C74', rail: '#41446B', wains: '#40446B', wainsDk: '#363A5E', wainsLt: '#4B5079', chair: '#555A86',
  skirt: '#33365A', floor: '#5E5A78', floorDk: '#524E6C', floorLt: '#67638A', seam: '#46425F',
  rug: '#6C8A92', rugDk: '#5F7C86', rugB: '#8F93AE', rugBDk: '#7A7E9A', fringe: '#8589A4',
  frame: '#737AA2', frameDk: '#575D86', sill: '#6A7099', curtain: '#5F5E88', curtainDk: '#4F4E76', curtainLt: '#6C6C95',
  shelf: '#57526F', shelfDk: '#46425D', shadow: '#151834',
};
function pal(m) {
  if (m === 'night') return { ...NIGHT };
  const p = {}; for (const k of Object.keys(BASE)) p[k] = k === 'shadow' ? BASE.shadow : tint(m, BASE[k]);
  p.wall = WALL[m];
  if (m === 'noon') { p.stripe = '#F1E3CB'; }
  if (m === 'sunset') { p.stripe = '#EDCDB4'; p.rug = '#D3E0CF'; p.rugDk = '#BECDB8'; }
  return p;
}
// floor / rug / wall colours the renderer needs for fills (exported)
const FLOOR = {}, RUG = {}; for (const m of MOODS) { const p = pal(m); FLOOR[m] = p.floor; RUG[m] = p.rug; }

// =====================================================================================================
// FAR: the back wall (0 0 1200 720), floor line = bottom edge
// =====================================================================================================
const GLASS = { x0: 404, x1: 796, y0: 168, y1: 440 };
function far(m) {
  const p = pal(m), t = c => tint(m, c), night = m === 'night';
  const G = GLASS;
  let defs = '', o = '';
  // wall with the glass cut out (evenodd) — the sky shows through
  const hole = rectP(G.x0, G.y0, G.x1 - G.x0, G.y1 - G.y0);
  o += P(rectP(0, 0, W, 720) + hole, p.wall, ' fill-rule="evenodd"');
  // picture rail + soft wallpaper stripes (period 50) between rail (104) and chair rail (552), never over the glass
  o += R(0, 96, W, 8, p.rail);
  let st = '';
  for (let x = 14; x < W; x += 50) {
    const segs = (x + 22 > G.x0 && x < G.x1) ? [[108, G.y0], [G.y1, 548]] : [[108, 548]];
    for (const [a, b] of segs) st += rectP(x, a, 22, b - a);
  }
  o += P(st, p.stripe);
  // tiny wallpaper dots in the light stripes (period 50 / 64)
  let dots = '';
  for (let x = 14 + 36 + 25; x < W; x += 50) for (let y = 140; y < 540; y += 64) {
    const yy = y + ((x / 50) % 2 ? 32 : 0); if (yy > 540) continue;
    if (x > G.x0 - 6 && x < G.x1 + 6 && yy > G.y0 - 6 && yy < G.y1 + 6) continue;
    dots += `M${f(x - 3)} ${f(yy)}a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z`;
  }
  o += P(dots, night ? '#555A84' : mix(p.wall, p.rail, 0.55), ' opacity="0.7"');

  // light on the wall below the window (morning sunbeam / sunset warm slant / night moonlight patch)
  if (m === 'morning') {
    defs += lg('beam', [[0, '#FFF6D8', 0.55], [1, '#FFF6D8', 0]], ' x1="0" y1="0" x2="0" y2="1"');
    o += P(poly([[G.x0 + 10, G.y1 + 30], [G.x1 - 10, G.y1 + 30], [G.x1 + 150, 720], [G.x0 + 120, 720]]), 'url(#beam)');
  } else if (m === 'sunset') {
    defs += lg('beam', [[0, '#FFD3A0', 0.5], [1, '#FFC08A', 0]], ' x1="0" y1="0" x2="0" y2="1"');
    o += P(poly([[G.x0 + 10, G.y1 + 30], [G.x1 - 10, G.y1 + 30], [G.x1 + 330, 720], [G.x0 + 300, 720]]), 'url(#beam)');
  } else if (m === 'night') {
    defs += lg('beam', [[0, '#B9C6FF', 0.22], [1, '#B9C6FF', 0]], ' x1="0" y1="0" x2="0" y2="1"');
    o += P(poly([[G.x0 + 10, G.y1 + 30], [G.x1 - 10, G.y1 + 30], [G.x1 + 60, 720], [G.x0 + 40, 720]]), 'url(#beam)');
  }

  // bunting garland across the seam (pins at x = ±260 around x 0) — drawn at 0 and 1200
  const flags = night ? ['#6A6A92', '#5F7488', '#7A6E8A', '#6E7A86'] : ['#F1C9AE', '#C6DDCD', '#F3E1A8', '#D9CDE6'].map(t);
  const bunt = cx => {
    let s = '';
    const x0 = cx - 262, x1 = cx + 262, y = 92, cy = 166; // quadratic M x0 y Q cx cy x1 y
    s += S(`M${f(x0)} ${y}Q${f(cx)} ${cy} ${f(x1)} ${y}`, night ? '#7B7FA6' : t('#CDB18A'), 3);
    const n = 11;
    for (let i = 1; i < n; i++) {
      const u = i / n, x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * cx + u * u * x1, yy = (1 - u) * (1 - u) * y + 2 * u * (1 - u) * cy + u * u * y;
      const dx = 2 * (1 - u) * (cx - x0) + 2 * u * (x1 - cx), dy = 2 * (1 - u) * (cy - y) + 2 * u * (y - cy), L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const a = [x - ux * 15, yy - uy * 15], b = [x + ux * 15, yy + uy * 15]; // tip hangs straight down
      s += P(poly([a, b, [x, yy + 30]]), flags[i % 4]);
      s += P(poly([a, [x - ux * 4, yy - uy * 4], [x, yy + 30]]), '#000000', ' opacity="0.05"');
    }
    for (const px of [x0, x1]) s += C(px, y, 5, night ? '#7B7FA6' : t('#C9A577'));
    return s;
  };
  o += bunt(0) + bunt(W);

  // ---- window: curtain rod, frame (with glass hole), mullions, sill ----
  const F = { x0: 380, x1: 820, y0: 145, y1: 465 };
  o += E((F.x0 + F.x1) / 2, F.y1 + 26, 250, 10, p.shadow, ' opacity="0.08"');
  o += P(rrP(F.x0 + 6, F.y0 + 8, F.x1 - F.x0, F.y1 - F.y0, 18) + rectP(G.x0 + 6, G.y0 + 8, G.x1 - G.x0 - 12, G.y1 - G.y0 - 16), p.shadow, ' fill-rule="evenodd" opacity="0.10"');
  o += P(rrP(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0, 18) + rectP(G.x0, G.y0, G.x1 - G.x0, G.y1 - G.y0), p.frame, ' fill-rule="evenodd"');
  o += S(rrP(F.x0 + 2, F.y0 + 2, F.x1 - F.x0 - 4, F.y1 - F.y0 - 4, 16), p.frameDk, 4);
  o += S(rectP(G.x0, G.y0, G.x1 - G.x0, G.y1 - G.y0), p.frameDk, 3);
  // mullions: one vertical + one horizontal bar
  const mx = (G.x0 + G.x1) / 2, my = 300;
  o += R(mx - 7, G.y0, 14, G.y1 - G.y0, p.frame) + R(G.x0, my - 6, G.x1 - G.x0, 12, p.frame);
  o += S(`M${mx - 7} ${G.y0}V${G.y1}M${mx + 7} ${G.y0}V${G.y1}M${G.x0} ${my - 6}H${G.x1}M${G.x0} ${my + 6}H${G.x1}`, p.frameDk, 2, ' opacity="0.6"');
  if (night) { // moonlight catching the inner frame edges
    o += S(`M${G.x0 + 2} ${G.y1 - 2}V${G.y0 + 2}H${G.x1 - 2}`, '#C9D3FF', 4, ' opacity="0.75"');
    o += S(`M${mx + 7} ${G.y0 + 3}V${G.y1 - 3}M${G.x0 + 3} ${my - 6}H${G.x1 - 3}`, '#C9D3FF', 2.5, ' opacity="0.55"');
    o += S(`M${F.x0 + 6} ${F.y1 - 18}V${F.y0 + 18}Q${F.x0 + 6} ${F.y0 + 6} ${F.x0 + 18} ${F.y0 + 6}H${F.x1 - 18}`, '#AEB9F0', 3, ' opacity="0.5"');
  } else { // soft highlight upper-left of the frame
    o += S(`M${F.x0 + 8} ${F.y1 - 24}V${F.y0 + 22}Q${F.x0 + 8} ${F.y0 + 8} ${F.x0 + 22} ${F.y0 + 8}H${F.x1 - 30}`, '#FFFFFF', 3, ' opacity="0.6"');
  }
  // sill
  o += RR(F.x0 - 22, F.y1 - 6, F.x1 - F.x0 + 44, 22, 8, p.sill) + S(`M${F.x0 - 18} ${F.y1 + 14}H${F.x1 + 18}`, p.frameDk, 3);
  // a little potted sprout on the sill (left pane corner) — muted
  const px0 = 450;
  o += P(`M${px0 - 18} ${F.y1 - 30}H${px0 + 18}L${px0 + 13} ${F.y1 - 6}H${px0 - 13}Z`, night ? '#6A6488' : t('#D7A98A'));
  o += S(`M${px0} ${F.y1 - 30}Q${px0 - 2} ${F.y1 - 52} ${px0 + 2} ${F.y1 - 62}`, night ? '#5F7A7E' : t('#8FB39A'), 4);
  o += E(px0 - 11, F.y1 - 52, 11, 6, night ? '#5F7A7E' : t('#9EC2A6'), ` transform="rotate(-25 ${px0 - 11} ${F.y1 - 52})"`);
  o += E(px0 + 12, F.y1 - 60, 11, 6, night ? '#5F7A7E' : t('#9EC2A6'), ` transform="rotate(20 ${px0 + 12} ${F.y1 - 60})"`);

  // curtains (gathered with tie-backs) + scalloped valance + rod
  const curtain = mirror => {
    const X = x => mirror ? W - x : x;
    const d = `M${X(332)} 140L${X(458)} 140Q${X(448)} 262 ${X(422)} 372Q${X(452)} 440 ${X(462)} 508L${X(326)} 508Q${X(322)} 440 ${X(340)} 372Q${X(328)} 262 ${X(332)} 140Z`;
    let s = P(d, p.shadow, ` opacity="0.08" transform="translate(${mirror ? -5 : 5} 6)"`);
    s += P(d, p.curtain);
    s += S(`M${X(372)} 150Q${X(370)} 270 ${X(372)} 368M${X(410)} 150Q${X(404)} 270 ${X(398)} 368M${X(366)} 384Q${X(360)} 450 ${X(356)} 504M${X(404)} 384Q${X(414)} 450 ${X(424)} 504`, p.curtainDk, 4, ' opacity="0.75"');
    s += S(`M${X(346)} 152Q${X(344)} 262 ${X(352)} 360`, p.curtainLt, 5, ' opacity="0.8"');
    s += S(`M${X(328)} 506H${X(460)}`, p.curtainDk, 4); // hem
    s += RR(Math.min(X(334), X(430)), 362, 96, 18, 9, night ? '#6E6A90' : t('#D8B9A2')); // tie-back
    s += C(X(382), 371, 7, night ? '#7E7AA0' : t('#E9CDB6'));
    return s;
  };
  o += curtain(false) + curtain(true);
  // valance
  let val = `M330 128H870V162`;
  for (let i = 0; i < 9; i++) { const x1 = 870 - (i + 1) * 60; val += `Q${f(x1 + 30)} 186 ${f(x1)} 162`; }
  val += 'Z';
  o += P(val, p.shadow, ' opacity="0.08" transform="translate(0 6)"') + P(val, p.curtainLt) + S('M336 158H864', p.curtainDk, 2.5, ' opacity="0.45"');
  o += RR(318, 120, 564, 12, 6, night ? '#6A6890' : t('#C9A577')) + C(318, 126, 11, night ? '#7A78A0' : t('#D9B88A')) + C(882, 126, 11, night ? '#7A78A0' : t('#D9B88A'));

  // ---- framed kid drawings (muted) ----
  const frameBox = (x, y, w, h, rot, inner) => {
    let s = `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">`;
    s += RR(x + 5, y + 7, w, h, 6, p.shadow, ' opacity="0.10"');
    s += RR(x, y, w, h, 6, night ? '#625E80' : t('#D1AE80')) + RR(x + 9, y + 9, w - 18, h - 18, 3, night ? '#7A7E9E' : t('#FFFBF2'));
    s += inner(x + 9, y + 9, w - 18, h - 18) + S(rrP(x + 1.5, y + 1.5, w - 3, h - 3, 5), night ? '#4D4A6A' : t('#A9845A'), 3) + '</g>';
    return s;
  };
  const dn = c => night ? mix(c, '#3A3E68', 0.62) : t(c); // drawing colours (crayon-muted)
  // A: sun over a little house (left of the window)
  o += frameBox(96, 196, 168, 136, -3, (x, y, w, h) =>
    C(x + w - 34, y + 30, 16, dn('#F5D58A')) + S(`M${x + w - 34} ${y + 6}v-0M${x + w - 58} ${y + 30}h-6M${x + w - 50} ${y + 12}l-5 -5M${x + w - 50} ${y + 48}l-5 5`, dn('#F0C873'), 3) +
    R(x + 22, y + 58, 62, 44, dn('#E8B9A8')) + P(poly([[x + 16, y + 60], [x + 53, y + 30], [x + 90, y + 60]]), dn('#C9A7C8')) + R(x + 46, y + 76, 16, 26, dn('#B9A28A')) +
    S(`M${x + 4} ${y + h - 10}Q${x + w / 2} ${y + h - 22} ${x + w - 4} ${y + h - 12}`, dn('#A9CFA8'), 5));
  // B: small round frame with a flower (lower left)
  o += `<g>` + C(214, 430, 44, p.shadow, ' opacity="0.10" transform="translate(4 6)"') + C(214, 430, 44, night ? '#625E80' : t('#D1AE80')) + C(214, 430, 35, night ? '#7A7E9E' : t('#FFFBF2')) +
    S('M214 448V420', dn('#9EC2A6'), 4) + [0, 72, 144, 216, 288].map(a => C(214 + 9 * Math.cos(a * Math.PI / 180), 416 + 9 * Math.sin(a * Math.PI / 180), 6.5, dn('#F0B8C2'))).join('') + C(214, 416, 5, dn('#F5D58A')) +
    S('M214 430Q204 428 202 436', dn('#9EC2A6'), 3) + C(214, 430, 42.5, 'none', ` stroke="${night ? '#4D4A6A' : t('#A9845A')}" stroke-width="3"`) + `</g>`;
  // C: rainbow + cloud (above the shelf, right of the window)
  o += frameBox(936, 186, 176, 128, 2, (x, y, w, h) => {
    let s = ''; const cx = x + w / 2, cy = y + h - 22;
    ['#F2B3AE', '#F3D59A', '#B9DDB8', '#AFCBEA'].forEach((c, i) => { s += S(`M${f(cx - 58 + i * 11)} ${cy}A${f(58 - i * 11)} ${f(58 - i * 11)} 0 0 1 ${f(cx + 58 - i * 11)} ${cy}`, dn(c), 9); });
    s += C(cx - 56, cy + 2, 12, dn('#FFFFFF')) + C(cx - 42, cy + 4, 10, dn('#FFFFFF')) + C(cx + 46, cy + 4, 11, dn('#FFFFFF')) + C(cx + 59, cy + 2, 9, dn('#FFFFFF'));
    return s;
  });

  // ---- shelf with soft, blurred, desaturated toys (right of the window) ----
  const sy = 420; // shelf top
  o += E(1030, sy + 26, 140, 6, p.shadow, ' opacity="0.08"');
  o += RR(898, sy, 264, 16, 5, p.shelf) + R(898, sy + 12, 264, 4, p.shelfDk, ' opacity="0.6"');
  o += P(`M926 ${sy + 16}h14v14q0 10 -10 12h-4z`, p.shelfDk) + P(`M1134 ${sy + 16}h14v26h-4q-10 -2 -10 -12z`, p.shelfDk);
  const td = c => night ? mix(c, '#30345E', 0.66) : t(c); // shelf-toy colours, very desaturated
  defs += `<filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"/></filter>`;
  let toys = '';
  // stacking rings
  toys += R(938, sy - 70, 6, 70, td('#C9AE88'));
  [['#D9B7B0', 34], ['#E5D3A6', 28], ['#BFD3C2', 22], ['#C6C9DD', 16]].forEach(([c, r], i) => { toys += E(941, sy - 8 - i * 15, r, 8, td(c)); });
  toys += C(941, sy - 72, 7, td('#E3C59B'));
  // little wooden car
  toys += RR(980, sy - 34, 66, 24, 8, td('#D4BFA0')) + RR(992, sy - 50, 36, 20, 6, td('#E2D4BC')) + C(994, sy - 8, 9, td('#8E8AA0')) + C(1032, sy - 8, 9, td('#8E8AA0'));
  if (!night) {
    // books
    toys += R(1066, sy - 56, 14, 56, td('#BCCBD8')) + R(1082, sy - 50, 12, 50, td('#E1C8A8')) + P(`M1096 ${sy}l10 -48l12 3l-10 45z`, td('#C8D8C0'));
    // plush ball
    toys += C(1134, sy - 18, 18, td('#EDE2D0')) + S(`M1118 ${sy - 24}Q1134 ${sy - 14} 1150 ${sy - 24}M1134 ${sy - 36}V${sy}`, td('#C2C8D6'), 3);
  } else {
    toys += R(1066, sy - 56, 14, 56, td('#BCCBD8')) + R(1082, sy - 50, 12, 50, td('#E1C8A8'));
  }
  o += `<g filter="url(#soft)">${toys}</g>`;
  if (night) { // the glowing star night-light (crisp, not blurred)
    defs += rg('nl', [[0, '#FFE9A8', 0.75], [0.35, '#FFE29A', 0.35], [1, '#FFE29A', 0]]);
    o += both(x => C(x, sy - 30, 110, 'url(#nl)'), 1128, 110);
    o += RR(1112, sy - 10, 32, 10, 4, '#7C7898');
    o += P(poly(starPts(1128, sy - 34, 26, 12)), '#FFE6A0', ' stroke="#E8C46A" stroke-width="3" stroke-linejoin="round"');
    o += P(poly(starPts(1124, sy - 38, 11, 5)), '#FFF7D8', ' opacity="0.9"');
  }

  // ---- wainscot (period 200) + chair rail + skirting, floor line at 720 ----
  o += R(0, 556, W, 164, p.wains);
  for (let i = 0; i < 6; i++) {
    const x = i * 200 + 24;
    o += RR(x + 3, 584, 152, 92, 8, p.wainsDk, ' opacity="0.55"') + RR(x, 580, 152, 92, 8, p.wains) + S(rrP(x, 580, 152, 92, 8), p.wainsDk, 3) + S(`M${x + 8} 664V590Q${x + 8} 588 ${x + 12} 588H${x + 140}`, p.wainsLt, 3, ' opacity="0.8"');
  }
  o += R(0, 546, W, 14, p.chair) + R(0, 558, W, 4, p.wainsDk, ' opacity="0.7"');
  o += R(0, 690, W, 30, p.skirt) + R(0, 690, W, 4, p.wainsLt, ' opacity="0.5"');
  // repeat the light on the wainscot (beam reaches the floor)
  if (m === 'morning' || m === 'sunset' || m === 'night') {
    const dx = m === 'morning' ? 150 : m === 'sunset' ? 330 : 60, dx0 = m === 'morning' ? 120 : m === 'sunset' ? 300 : 40, k = (546 - (G.y1 + 30)) / (720 - (G.y1 + 30));
    o += P(poly([[G.x0 + 10 + (dx0 - 10) * k, 546], [G.x1 - 10 + (dx + 10) * k, 546], [G.x1 + dx, 720], [G.x0 + dx0, 720]]), 'url(#beam)', ' opacity="0.7"');
  }
  return svg(1200, 720, o, defs, `wall ${WALL[m]}`);
}

// =====================================================================================================
// MID: floor-back props (0 0 1200 300), standing on y 292
// =====================================================================================================
function mid(m) {
  const p = pal(m), night = m === 'night';
  const c = (h, s = 1) => night ? mix(h, '#2C3062', 0.66) : tint(m, h, s); // desaturated prop colours
  const out = (h) => night ? mix(h, '#20234A', 0.7) : tint(m, h);
  const B = 292;
  let o = '';
  const shadowE = (x, w) => E(x, B + 2, w, 7, p.shadow, ' opacity="0.13"');
  // ---- toy box (x 70–300) ----
  o += shadowE(185, 128);
  o += RR(72, 176, 226, 116, 14, c('#CBB8A0')) + RR(72, 248, 226, 44, 12, c('#BBA68C'));
  o += RR(84, 196, 202, 34, 10, c('#D9CBB5')) + P(poly(starPts(185, 213, 15, 7)), c('#B9CFC2'));
  o += C(120, 213, 9, c('#E3C9A9')) + C(250, 213, 9, c('#C9C6DA'));
  o += RR(64, 156, 242, 30, 12, c('#D5C3AA')) + S(rrP(64, 156, 242, 30, 12), out('#A48F72'), 3.5) + S(rrP(72, 176, 226, 116, 14), out('#A48F72'), 3.5);
  o += S('M80 166H200', c('#EFE4D2'), 4, ' opacity="0.8"');
  // a plush ear + a ball peeking out of the lid
  o += C(258, 150, 16, c('#D8C3D2')) + S('M244 150A16 16 0 0 1 274 148', out('#A693A5'), 3);
  // ---- block tower (x 326–432) ----
  o += shadowE(380, 60);
  const blk = (x, y, s, col, rot = 0) => `<g transform="rotate(${rot} ${x + s / 2} ${y + s / 2})">` + RR(x, y, s, s, 7, c(col)) + RR(x + 6, y + 6, s - 12, s - 12, 4, c(mix(col, '#FFFFFF', 0.18))) + S(rrP(x, y, s, s, 7), out(mix(col, '#5A4A3A', 0.35)), 3.2) + `</g>`;
  o += blk(350, B - 64, 64, '#C2CDD6') + blk(355, B - 120, 56, '#E3CDAE', 3) + blk(361, B - 168, 48, '#C9D7C2', -2);
  o += P(poly([[358, B - 168], [385, B - 206], [412, B - 168]]), c('#E2C2B8')) + S(poly([[358, B - 168], [385, B - 206], [412, B - 168]]), out('#A88C84'), 3.2);
  // a loose block lying beside it
  o += blk(426, B - 38, 38, '#E6D7B6', 12);
  // ---- low things under the window (≤ 60 tall): floor cushion + a soft ball ----
  o += shadowE(560, 70);
  o += E(560, B - 22, 70, 26, c('#D9CDBB')) + E(560, B - 30, 62, 16, c('#E6DCCB')) + S('M502 280Q560 300 618 280', out('#AFA08A'), 3, ' opacity="0.5"') + C(560, B - 30, 4, c('#C9B9A2'));
  o += E(690, B + 1, 26, 5, p.shadow, ' opacity="0.13"') + C(690, B - 24, 24, c('#ECE3D3')) + S('M668 262Q690 276 712 262M690 244V292', c('#BFC6D4'), 4) + C(690, B - 24, 24, 'none', ` stroke="${out('#AFA28E')}" stroke-width="3"`);
  // ---- sitting teddy (x 780–900) ----
  const tx = 840, tb = c('#C9AD8E'), tl = c('#E3D0B8'), to = out('#94765A');
  o += shadowE(tx, 56);
  o += E(tx - 34, B - 12, 22, 14, tb) + E(tx + 34, B - 12, 22, 14, tb); // feet
  o += E(tx, B - 46, 44, 46, tb) + E(tx, B - 42, 26, 30, tl); // body + tummy
  o += E(tx - 42, B - 62, 13, 26, tb, ` transform="rotate(25 ${tx - 42} ${B - 62})"`) + E(tx + 42, B - 62, 13, 26, tb, ` transform="rotate(-25 ${tx + 42} ${B - 62})"`);
  o += C(tx - 28, B - 140, 15, tb) + C(tx + 28, B - 140, 15, tb) + C(tx - 28, B - 140, 8, tl) + C(tx + 28, B - 140, 8, tl); // ears
  o += C(tx, B - 112, 38, tb) + E(tx, B - 100, 17, 13, tl);
  o += C(tx - 13, B - 118, 4.5, out('#5D4A3C')) + C(tx + 13, B - 118, 4.5, out('#5D4A3C')) + E(tx, B - 104, 6, 4.5, out('#6D5646'));
  o += S(`M${tx - 6} ${B - 97}Q${tx} ${B - 92} ${tx + 6} ${B - 97}`, out('#6D5646'), 2.5);
  o += S(`M${tx - 26} ${B - 70}Q${tx} ${B - 58} ${tx + 26} ${B - 70}`, c('#B9CDC6'), 7); // little scarf
  o += C(tx, B - 112, 38, 'none', ` stroke="${to}" stroke-width="3" opacity="0.8"`) + E(tx, B - 46, 44, 46, 'none', ` stroke="${to}" stroke-width="3" opacity="0.8"`);
  // ---- play tent / teepee (x 930–1170) ----
  o += shadowE(1050, 122);
  const ap = [1050, 34];
  const tent = poly([ap, [1170, B], [930, B]]);
  o += P(tent, c('#EEE3CD'));
  // stripes clipped by drawing triangles from the apex
  const stripe = (u0, u1, col) => P(poly([ap, [930 + 240 * u0, B], [930 + 240 * u1, B]]), c(col));
  o += stripe(0.0, 0.14, '#C9D6C6') + stripe(0.29, 0.43, '#C9D6C6') + stripe(0.57, 0.71, '#C9D6C6') + stripe(0.86, 1.0, '#C9D6C6');
  // door opening + flap
  o += P(`M1050 120L1098 ${B}H1002Z`, night ? '#24264A' : tint(m, '#8C7C6E'));
  o += P(`M1050 120L1002 ${B}H1036Q1040 200 1050 120Z`, c('#E8DBC2')) + S(`M1050 120L1002 ${B}`, out('#A49378'), 3);
  o += S(tent, out('#A49378'), 3.5);
  o += S('M1050 34L1030 4M1050 34L1068 6M1050 34L1056 0', c('#B79A72'), 6); // poles
  o += P('M1056 0L1084 10L1058 20Z', c('#E2C2B8'));
  o += S(`M970 ${B - 40}L1050 40`, '#FFFFFF', 3, ' opacity="0.25"');
  return svg(1200, 300, o);
}

// =====================================================================================================
// GROUND: floorboards + soft sage rug runner (0 0 1200 260), floor line = top edge, vertical 5-slice
// =====================================================================================================
const SLICES = { A: [0, 96], B: [96, 104], C: [104, 168], D: [168, 184], E: [184, 260], rugTop: 22, rugBottom: 162 };
function ground(m) {
  const p = pal(m), night = m === 'night';
  let o = '', defs = '';
  // floor base + boards (75 wide, vertical seams = boards run towards the viewer; stretches cleanly)
  o += R(0, 0, W, 260, p.floor);
  for (let i = 0; i < 16; i++) { if (i % 3 === 1) o += R(i * 75, 0, 75, 260, p.floorLt, ' opacity="0.55"'); if (i % 4 === 2) o += R(i * 75, 0, 75, 260, p.floorDk, ' opacity="0.35"'); }
  let seams = ''; for (let i = 0; i <= 16; i++) seams += `M${i * 75} 0V260`; // seam centred on x 0 / 1200 (half drawn each side)
  o += S(seams, p.seam, 2.5, ' opacity="0.65"');
  // butt joints + grain only in the fixed slices (back floor 0–20, front floor 190–260)
  let joints = '', grain = '';
  for (let i = 0; i < 16; i++) {
    const x = i * 75;
    const jy = 196 + ((i * 37) % 58); joints += `M${x + 2} ${jy}H${x + 74}`;
    if (i % 2 === 0) joints += `M${x + 2} ${8 + (i * 5) % 10}H${x + 74}`;
    grain += `M${x + 24} ${200 + (i * 13) % 26}q5 14 0 30M${x + 52} ${222 + (i * 11) % 20}q-4 10 0 22`;
  }
  o += S(joints, p.seam, 2.2, ' opacity="0.5"') + S(grain, p.floorDk, 1.8, ' opacity="0.3"');
  // soft wall-floor contact shadow
  defs += lg('wallsh', [[0, p.shadow, night ? 0.35 : 0.18], [1, p.shadow, 0]], ' x1="0" y1="0" x2="0" y2="1"');
  o += R(0, 0, W, 14, 'url(#wallsh)');
  // ---- rug runner: fringe 18–22, border 22–60, inner stitch, sage interior 60–124, border 124–162, fringe 162–166 ----
  o += R(0, 24, W, 140, p.shadow, ' opacity="0.08"'); // lift shadow under the rug
  let fr = ''; for (let x = 4; x < W; x += 8) fr += `M${x} 16V23M${x} 161V168`;
  o += S(fr, p.fringe, 2.2, ' opacity="0.7"');
  o += R(0, 22, W, 140, p.rugB);
  o += R(0, 60, W, 64, p.rug);
  // soft vertical tufting stripes (period 60) — vertical, so the stretched slice B keeps them clean
  let tuft = ''; for (let x = 15; x < W; x += 60) tuft += rectP(x, 60, 30, 64);
  o += P(tuft, mix(p.rug, '#FFFFFF', night ? 0.06 : 0.22), ' opacity="0.8"');
  // border pattern: small soft diamonds (period 40) on both borders
  let dia = ''; for (let x = 20; x < W; x += 40) { dia += poly([[x, 33], [x + 8, 41], [x, 49], [x - 8, 41]]); dia += poly([[x, 135], [x + 8, 143], [x, 151], [x - 8, 143]]); }
  o += P(dia, p.rugDk, ' opacity="0.85"');
  o += R(0, 54, W, 6, p.rugBDk, ' opacity="0.8"') + R(0, 124, W, 6, p.rugBDk, ' opacity="0.8"');
  o += R(0, 22, W, 3, '#FFFFFF', ' opacity="0.35"') + R(0, 159, W, 3, p.rugBDk);
  // stitched lines inside the interior (in fixed slices only: 72 and 112)
  o += S('M0 72H1200M0 112H1200', p.rugDk, 2.5, ' stroke-dasharray="10 9"');
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// SKY THINGS: sun, moon (0 0 160 160), clouds (0 0 320 170)
// =====================================================================================================
function sun() {
  let o = '', defs = rg('sg', [[0, '#FFF4C2', 0.9], [0.5, '#FFE89A', 0.45], [1, '#FFE08A', 0]]);
  o += C(80, 80, 80, 'url(#sg)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r0 = 46, r1 = 64; rays += `M${f(80 + r0 * Math.cos(a))} ${f(80 + r0 * Math.sin(a))}L${f(80 + r1 * Math.cos(a))} ${f(80 + r1 * Math.sin(a))}`; }
  o += S(rays, '#FFD976', 9);
  o += C(80, 80, 40, '#FFE07A') + C(80, 80, 40, 'none', ' stroke="#F2BE4E" stroke-width="4"');
  o += C(80, 84, 34, '#FFD764', ' opacity="0.5"') + E(68, 66, 14, 9, '#FFF6CF', ' opacity="0.8" transform="rotate(-30 68 66)"');
  // gentle face: closed happy eyes + smile + cheeks
  o += S('M64 80q5 -6 10 0M86 80q5 -6 10 0M70 92q10 9 20 0', '#C98A2E', 3.5) + C(62, 92, 5, '#F6B08A', ' opacity="0.7"') + C(98, 92, 5, '#F6B08A', ' opacity="0.7"');
  return svg(160, 160, o, defs);
}
function moon() {
  let defs = rg('mg', [[0, '#F4F1FF', 0.45], [0.55, '#DDE3FF', 0.16], [1, '#DDE3FF', 0]]);
  let o = C(80, 80, 80, 'url(#mg)');
  // crescent: big disc minus offset disc (evenodd)
  o += `<path d="M80 30A50 50 0 1 0 128 94A46 46 0 0 1 80 30Z" fill="#FFF3C4" stroke="#E2CB82" stroke-width="4" stroke-linejoin="round"/>`;
  o += C(58, 96, 6, '#EDD9A0', ' opacity="0.8"') + C(70, 118, 4, '#EDD9A0', ' opacity="0.8"') + C(48, 74, 4, '#EDD9A0', ' opacity="0.7"');
  o += S('M74 84q6 5 12 0', '#B99A55', 3) + C(90, 96, 4.5, '#F6B8A8', ' opacity="0.7"'); // sleepy eye + cheek
  return svg(160, 160, o, defs);
}
function cloud(v) {
  const cs = v === 'a' ? [[80, 112, 46], [130, 84, 58], [190, 76, 52], [240, 104, 44], [160, 116, 50]] : [[86, 108, 40], [138, 90, 50], [196, 98, 46], [242, 116, 32], [150, 120, 40]];
  const base = v === 'a' ? [70, 104, 190, 50] : [80, 104, 172, 44];
  const body = col => cs.map(([x, y, r]) => C(x, y, r, col)).join('') + RR(base[0], base[1], base[2], base[3], base[3] / 2, col);
  let o = `<g transform="translate(0 7)">${body('#D9E3F0')}</g>` + body('#FFFFFF');
  o += E(126, 66, 22, 11, '#F4F8FF');
  return svg(320, 170, o);
}

// =====================================================================================================
// PARTICLES (0 0 32 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#mg)') + P('M16 6Q17 15 26 16Q17 17 16 26Q15 17 6 16Q15 15 16 6Z', '#FFF2C8') + C(16, 16, 2.6, '#FFFFFF'),
    rg('mg', [[0, '#FFE7A8', 0.75], [0.5, '#FFDC8A', 0.25], [1, '#FFDC8A', 0]]));
  out.bubble = svg(32, 32, C(16, 16, 13.5, 'url(#bf)') + C(16, 16, 13.5, 'none', ' stroke="url(#br)" stroke-width="2.2"') +
    P('M9 12Q10 8 14 7', 'none', ' stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"') + C(21, 22, 1.8, '#FFFFFF', ' opacity="0.8"'),
    rg('bf', [[0, '#FFFFFF', 0.05], [0.8, '#E6F3FF', 0.18], [1, '#FFFFFF', 0.35]]) +
    lg('br', [[0, '#FFB3D1'], [0.33, '#FFE59A'], [0.66, '#A8E6CF'], [1, '#A9C8FF']], ' x1="0" y1="0" x2="1" y2="1"'));
  out.feather = svg(32, 32, `<g transform="rotate(-30 16 16)">` + P('M16 3Q24 10 22 20Q20 27 16 30Q12 27 10 20Q8 10 16 3Z', '#FFF4E2') +
    P('M16 3Q24 10 22 20Q20 27 16 30Z', '#F1E0C6') + S('M16 6V31', '#D9C3A0', 1.6) + S('M16 12L20 9M16 17L21 14M16 22L20 19M16 12L12 9M16 17L11 14M16 22L12 19', '#E8D6B8', 1.2) + `</g>`);
  out.puff = svg(32, 32, C(11, 19, 8.5, 'url(#pf)') + C(19, 14, 10.5, 'url(#pf)') + C(22, 21, 7.5, 'url(#pf)') + C(15, 12, 3, '#FFFFFF', ' opacity="0.9"'),
    rg('pf', [[0, '#FFFFFF', 0.97], [0.62, '#F3F4F7', 0.85], [1, '#DADDE6', 0]]));
  // tintable white shapes (code tints them)
  out.star = svg(32, 32, P(poly(starPts(16, 16.8, 14, 6.4)), '#EDEDED', ' stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"') + P(poly(starPts(15.4, 16, 8, 3.7)), '#FFFFFF'));
  out.sparkle = svg(32, 32, P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#F1F1F1') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)">` + RR(8, 11, 16, 10, 2.5, '#FFFFFF') + RR(8, 16.5, 16, 4.5, 2, '#D8D8D8') + `</g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); }
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b'));
  const ps = particles(); for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 3 + ' layers + sun, moon, 2 clouds) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, WALL, SKY, FLOOR, RUG, GLASS, SLICES };
if (require.main === module) main();
