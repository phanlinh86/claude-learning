// Tupi's Bakery Delivery: bakery-table environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{wall_<m>, bakery, flour, rollingpin, jar, plant_<m>}.svg and the NEW particles
// particles/{crumb, heart}.svg (the other particles are kept as they are). Any other (old) env file is deleted.
// Usage: node tools/art_env.js      Preview scenes + RECIPE: node tools/env_scenes.js        (DESIGN §3, §4.4)
//
// Look (references studied: cosy bakery interiors, gingham café cloths, gingerbread-village boards, piped bead borders —
// only for mood, every shape here is our own): a warm plaster back wall with one big ARCHED window (two-pane arch on top of
// two square panes, cream painted frame, tied-back caramel-gingham curtains on a brass rod, a deep wooden sill where the bird
// can land), a long wooden shelf of jars / loaves / plates, hanging copper pans, a cream subway-tile backsplash and the
// wooden back rim of the table along the bottom edge. The season lives OUTSIDE the window only.
//
// wall_<m>  0 0 1600 400. Window centre x = 800. Opening (glass) = arch: sides x 630 / 970, arch centre y 216, r 170
//           (top y 46), bottom y 316; mullions x 794..806 and y 210..222; frame to r 188 (x 612..988, top y 28); curtains
//           x 572..650 / 950..1028; sill y 312..332 (x 598..1002, bird perch y 312); table rim y 372..400.
//           TILEABLE STRIPS: x 0..400 and x 1200..1600 are each periodic (period 400) — the renderer repeats the left strip
//           to the left and the right strip to the right (BD.TableArt.drawWall / RECIPE.wallLayout).
//           The sky is in a comment <!-- sky #top #bottom -->.
// bakery    0 0 260 240, bottom-centre anchor (130, 236) = the door step. Oven window centre (192, 170) r 21, chimney top
//           (196, 30), door x 110..150 y 150..234.
// flour 0 0 120 60 (60,56) · rollingpin 0 0 200 60 (100,54) · jar 0 0 90 110 (45,106) · plant_<m> 0 0 120 140 (60,136)
// Colour rule: nothing in a saturated answer hue (red #E84A4A, blue #3C8DE8, yellow #FFD23F, green #4CC26B, orange
// #FF9A2E, purple #8E44AD, pink #FF8FC0). Woods are caramel/brown, copper is muted, flowers pale.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const S = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const OL = (col, w) => ` stroke="${col}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = '') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
const V = ' x1="0" y1="0" x2="0" y2="1"';
const op = a => ` opacity="${a}"`;
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const hsh = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------- palettes (DESIGN §3) ----------------
// sky inside the window: top → bottom (DESIGN: spring pale #CFE6F5, summer #8CCBEA, autumn #F1C893, winter #B9C8E2)
const SKY = {
  spring: ['#BFDDF2', '#E9F2F4'],
  summer: ['#8CCBEA', '#D3ECF3'],
  autumn: ['#F1C893', '#F8E3C4'],
  winter: ['#B9C8E2', '#E4EAF3'],
};
// sun / moon-ish disc in wall units (inside the window), r, colour, glow
const SUN = {
  spring: { x: 700, y: 118, r: 22, c: '#FFF4D6', glow: '#FFF8E6' },
  summer: { x: 892, y: 104, r: 28, c: '#FFEBA8', glow: '#FFF6D2' },
  autumn: { x: 742, y: 214, r: 30, c: '#FFD9A6', glow: '#FFE8C8' },
  winter: { x: 868, y: 132, r: 20, c: '#F6F3EA', glow: '#FFFFFF' },
};
const WALL = { plaster: '#F2DFC4', plasterTop: '#F6E8D3', plasterDark: '#E7CFAE', tile: '#F4EAD9', grout: '#DCC7A8', tileShade: '#E8DAC3',
  wood: '#B98552', woodShade: '#946238', woodLight: '#D2A06C', woodOl: '#7A4C27', frame: '#FBF3E6', frameShade: '#E6D6BF', frameOl: '#B79A7A',
  copper: '#C98A62', copperShade: '#A66A47', copperLight: '#E8B48F', copperOl: '#7E4E33', brass: '#C9A26B', brassOl: '#8E6E42' };
const OUT = {   // outside the window per season: far hill, near hill, trees, roofs
  spring: { far: '#C9DDB8', near: '#A9C99A', nearOl: '#8EB07F', tree: '#F2CFD9', treeShade: '#E3B2C1', treeOl: '#C995A6', trunk: '#9A7660', roof: '#D9A88A', roofSnow: null, bush: '#B5D2A2' },
  summer: { far: '#A9CC98', near: '#8DBB82', nearOl: '#73A068', tree: '#86B474', treeShade: '#6E9C60', treeOl: '#5C8650', trunk: '#8E6A50', roof: '#CF9B7E', roofSnow: null, bush: '#9AC487' },
  autumn: { far: '#E4C08E', near: '#CDA772', nearOl: '#AE8B5B', tree: '#D9A06A', treeShade: '#C08350', treeOl: '#9E6A40', trunk: '#7E5A44', roof: '#B98468', roofSnow: null, bush: '#C99564' },
  winter: { far: '#EEF2F7', near: '#F6F8FB', nearOl: '#C9D4E2', tree: '#E9EEF4', treeShade: '#C3CFDD', treeOl: '#9FB0C2', trunk: '#8C7A6A', roof: '#B9A08E', roofSnow: '#FBFCFE', bush: '#DDE5EE' },
};
// gingham curtain + pastel sprinkles (≤ 0.5 saturation)
const CURTAIN = { base: '#FBF1E1', check: '#E6C9A0', checkDark: '#D9B486', ol: '#B48E66' };
const PASTEL = ['#F4D9C4', '#EED7E3', '#DCE6D2', '#F2E8C4', '#D9E2EC', '#FFFFFF'];

// ---------------- wall pieces ----------------
const shelfY = 150;           // top of the shelf board (things stand on it)
function jarSvg(x, base, w, h, content, lid) {
  // a glass jar standing on y = base, centre x
  const x0 = x - w / 2, top = base - h;
  let o = E(x, base + 1, w * 0.52, 3, '#000', op(0.08));
  o += P(`M${f(x0 + 4)} ${f(top + 10)}Q${f(x0)} ${f(top + 14)} ${f(x0)} ${f(top + 22)}L${f(x0)} ${f(base - 5)}Q${f(x0)} ${f(base)} ${f(x0 + 5)} ${f(base)}L${f(x0 + w - 5)} ${f(base)}Q${f(x0 + w)} ${f(base)} ${f(x0 + w)} ${f(base - 5)}L${f(x0 + w)} ${f(top + 22)}Q${f(x0 + w)} ${f(top + 14)} ${f(x0 + w - 4)} ${f(top + 10)}Z`,
    '#EAF1EE', OL('#A89C8C', 3));
  // content (fills the lower part)
  const ch = (h - 16) * 0.72, cy = base - 3 - ch;
  if (content === 'flour') o += P(`M${f(x0 + 3)} ${f(cy + 4)}Q${f(x)} ${f(cy - 4)} ${f(x0 + w - 3)} ${f(cy + 4)}L${f(x0 + w - 3)} ${f(base - 5)}Q${f(x0 + w - 3)} ${f(base - 3)} ${f(x0 + w - 6)} ${f(base - 3)}L${f(x0 + 6)} ${f(base - 3)}Q${f(x0 + 3)} ${f(base - 3)} ${f(x0 + 3)} ${f(base - 5)}Z`, '#FFFDF8');
  else if (content === 'cookies') { for (let i = 0; i < 4; i++) { const yy = base - 8 - i * (ch / 4.2); o += E(x + (i % 2 ? 3 : -3), yy, w * 0.36, ch / 9, '#C9945E', OL('#93643A', 1.6)); o += C(x - 4 + (i % 2) * 6, yy - 1, 1.6, '#6E4630'); } }
  else {   // sprinkles: layered pastel bands with flecks
    o += R(x0 + 3, cy, w - 6, ch, PASTEL[0], ' rx="3"');
    for (let b = 1; b < 4; b++) o += P(`M${f(x0 + 3)} ${f(cy + b * ch / 4)}Q${f(x)} ${f(cy + b * ch / 4 - 4)} ${f(x0 + w - 3)} ${f(cy + b * ch / 4 + 1)}L${f(x0 + w - 3)} ${f(cy + (b + 1) * ch / 4)}L${f(x0 + 3)} ${f(cy + (b + 1) * ch / 4)}Z`, PASTEL[b]);
    for (let i = 0; i < 9; i++) o += R(x0 + 6 + hsh(i, x) * (w - 14), cy + 4 + hsh(x, i) * (ch - 10), 4, 1.8, PASTEL[(i + 2) % 5 === 4 ? 1 : (i % 4)], ` rx="0.9" transform="rotate(${f(hsh(i, i + x) * 180)} ${f(x0 + 8 + hsh(i, x) * (w - 14))} ${f(cy + 5 + hsh(x, i) * (ch - 10))})"`);
  }
  // glass shine
  o += P(`M${f(x0 + 6)} ${f(top + 22)}L${f(x0 + 6)} ${f(base - 10)}`, 'none', OL('#FFFFFF', 3.2) + op(0.75));
  // lid
  if (lid === 'cloth') {
    o += P(`M${f(x0 - 3)} ${f(top + 12)}Q${f(x)} ${f(top - 2)} ${f(x0 + w + 3)} ${f(top + 12)}L${f(x0 + w + 6)} ${f(top + 22)}Q${f(x)} ${f(top + 17)} ${f(x0 - 6)} ${f(top + 22)}Z`, CURTAIN.base, OL(CURTAIN.ol, 2.4));
    for (let i = 0; i < 4; i++) o += R(x0 + 2 + i * (w / 4), top + 8, w / 9, 12, CURTAIN.check, op(0.8));
    o += S(`M${f(x0 + 1)} ${f(top + 13)}Q${f(x)} ${f(top + 9)} ${f(x0 + w - 1)} ${f(top + 13)}`, '#C98E4E', 2.4);
  } else {
    o += R(x0 + 2, top + 2, w - 4, 11, '#C99A68', ` rx="3"${OL('#8A6440', 2.4)}`) + R(x0 + 5, top + 4, w - 14, 3, '#E2BC8E', ' rx="1.5"');
  }
  return o;
}
function loafSvg(x, base, w, h) {
  let o = E(x, base, w * 0.52, 3.4, '#000', op(0.1));
  o += P(`M${f(x - w / 2)} ${f(base)}Q${f(x - w / 2 - 2)} ${f(base - h)} ${f(x)} ${f(base - h)}Q${f(x + w / 2 + 2)} ${f(base - h)} ${f(x + w / 2)} ${f(base)}Z`, '#DCA368', OL('#8A5A33', 3));
  o += P(`M${f(x - w / 2 + 3)} ${f(base - 2)}Q${f(x)} ${f(base - h * 0.35)} ${f(x + w / 2 - 3)} ${f(base - 2)}Z`, '#C58A52', op(0.6));
  for (let i = -1; i <= 1; i++) o += S(`M${f(x + i * w * 0.24 - 5)} ${f(base - h * 0.62)}Q${f(x + i * w * 0.24)} ${f(base - h * 0.8)} ${f(x + i * w * 0.24 + 6)} ${f(base - h * 0.7)}`, '#F2D2A4', 3);
  o += E(x - w * 0.2, base - h * 0.78, w * 0.12, h * 0.1, '#F4D7AE', op(0.8));
  return o;
}
function plateSvg(x, base, r) {   // a plate standing on its rim, leaning against the wall
  return E(x, base - r, r, r, '#FBF4E8', OL('#B79A7A', 3)) + E(x, base - r, r * 0.68, r * 0.68, 'none', OL('#D9B98E', 2.4)) +
    E(x, base - r, r * 0.5, r * 0.5, '#F4E6D0') + E(x - r * 0.4, base - r * 1.35, r * 0.18, r * 0.1, '#FFFFFF', ` transform="rotate(-35 ${f(x - r * 0.4)} ${f(base - r * 1.35)})"`);
}
function panSvg(x, top, r) {   // hanging copper pan: hook under the shelf, handle up, pan face round
  let o = S(`M${f(x)} ${f(top)}L${f(x)} ${f(top + 10)}`, '#8E6E42', 2.4) + C(x, top + 12, 3.2, 'none', OL('#8E6E42', 2.2));
  o += R(x - 5, top + 14, 10, 34, WALL.copperShade, ` rx="5"${OL(WALL.copperOl, 2.6)}`) + C(x, top + 20, 2, '#F2D6BE');
  const cy = top + 48 + r;
  o += C(x, cy, r, WALL.copper, OL(WALL.copperOl, 3));
  o += C(x, cy, r * 0.74, WALL.copperShade, op(0.55));
  o += P(`M${f(x - r * 0.62)} ${f(cy - r * 0.2)}A${f(r * 0.66)} ${f(r * 0.66)} 0 0 1 ${f(x + r * 0.2)} ${f(cy - r * 0.62)}`, 'none', OL(WALL.copperLight, 4) + op(0.9));
  return o;
}
function rollingPinWall(x, base) {   // lying on the shelf
  return E(x, base, 56, 3.6, '#000', op(0.1)) + R(x - 62, base - 8, 18, 7, '#C9945E', ` rx="3.5"${OL('#7A4C27', 2.4)}`) + R(x + 44, base - 8, 18, 7, '#C9945E', ` rx="3.5"${OL('#7A4C27', 2.4)}`) +
    R(x - 44, base - 14, 88, 14, '#E2B783', ` rx="7"${OL('#7A4C27', 2.8)}`) + R(x - 38, base - 12, 70, 3.6, '#F4D5AB', ' rx="1.8"');
}
function crockSvg(x, base) {   // a cream crock with wooden spoons + a whisk
  let o = S(`M${f(x - 8)} ${f(base - 40)}L${f(x - 16)} ${f(base - 74)}`, '#B98552', 5) + E(x - 17, base - 78, 6, 9, '#C9945E', OL('#7A4C27', 2.2) + ` transform="rotate(-14 ${f(x - 17)} ${f(base - 78)})"`);
  o += S(`M${f(x + 6)} ${f(base - 40)}L${f(x + 12)} ${f(base - 62)}`, '#A9A39B', 4);
  o += P(`M${f(x + 12)} ${f(base - 62)}Q${f(x + 2)} ${f(base - 82)} ${f(x + 16)} ${f(base - 92)}Q${f(x + 30)} ${f(base - 80)} ${f(x + 12)} ${f(base - 62)}Z`, 'none', OL('#A9A39B', 2.2));
  o += P(`M${f(x + 12)} ${f(base - 62)}Q${f(x + 10)} ${f(base - 82)} ${f(x + 16)} ${f(base - 92)}Q${f(x + 20)} ${f(base - 80)} ${f(x + 12)} ${f(base - 62)}`, 'none', OL('#A9A39B', 1.8));
  o += E(x, base, 24, 3.4, '#000', op(0.1));
  o += P(`M${f(x - 20)} ${f(base - 42)}L${f(x + 20)} ${f(base - 42)}Q${f(x + 22)} ${f(base - 20)} ${f(x + 16)} ${f(base)}L${f(x - 16)} ${f(base)}Q${f(x - 22)} ${f(base - 20)} ${f(x - 20)} ${f(base - 42)}Z`, '#F1E3CC', OL('#A88E70', 3));
  o += R(x - 21, base - 32, 42, 6, '#C98E4E', op(0.85)) + S(`M${f(x - 14)} ${f(base - 38)}L${f(x - 14)} ${f(base - 8)}`, '#FFFFFF', 3, op(0.6));
  return o;
}
function basketSvg(x, base) {   // a woven basket of baguettes
  let o = '';
  for (const [dx, a] of [[-12, -16], [2, -6], [14, 10]]) o += `<g transform="rotate(${a} ${f(x + dx)} ${f(base - 20)})">` + R(x + dx - 7, base - 74, 14, 60, '#DCA368', ` rx="7"${OL('#8A5A33', 2.6)}`) +
    S(`M${f(x + dx - 3)} ${f(base - 62)}L${f(x + dx + 3)} ${f(base - 58)}M${f(x + dx - 3)} ${f(base - 48)}L${f(x + dx + 3)} ${f(base - 44)}M${f(x + dx - 3)} ${f(base - 34)}L${f(x + dx + 3)} ${f(base - 30)}`, '#F2D2A4', 2.4) + '</g>';
  o += E(x, base, 34, 3.6, '#000', op(0.1));
  o += P(`M${f(x - 32)} ${f(base - 32)}L${f(x + 32)} ${f(base - 32)}L${f(x + 26)} ${f(base)}L${f(x - 26)} ${f(base)}Z`, '#C8995F', OL('#7E5A34', 3));
  for (let i = 0; i < 3; i++) o += S(`M${f(x - 30 + i)} ${f(base - 24 + i * 8)}L${f(x + 30 - i)} ${f(base - 24 + i * 8)}`, '#A57A47', 2);
  for (let i = -2; i <= 2; i++) o += S(`M${f(x + i * 12)} ${f(base - 31)}L${f(x + i * 10.6)} ${f(base - 1)}`, '#E0B57E', 2.2, op(0.8));
  o += R(x - 34, base - 36, 68, 7, '#D7AA70', ` rx="3.5"${OL('#7E5A34', 2.6)}`);
  return o;
}
function cupsSvg(x, base) {   // a little stack of cream cups
  let o = E(x, base, 22, 3, '#000', op(0.1));
  for (let i = 0; i < 3; i++) { const y = base - i * 15; o += P(`M${f(x - 18)} ${f(y - 15)}L${f(x + 18)} ${f(y - 15)}L${f(x + 14)} ${f(y)}L${f(x - 14)} ${f(y)}Z`, i === 1 ? '#EED7C7' : '#FBF3E6', OL('#A88E70', 2.6)); }
  o += P(`M${f(x + 17)} ${f(base - 10)}Q${f(x + 28)} ${f(base - 8)} ${f(x + 15)} ${f(base - 2)}`, 'none', OL('#A88E70', 2.6));
  return o;
}
function seasonalShelf(m, x, base) {   // one small seasonal touch on the shelf, right of the window
  if (m === 'spring') {   // a little jug of pale tulips
    let o = '';
    for (const [dx, a, c] of [[-10, -14, '#F3C6C9'], [0, 0, '#F6D8C9'], [10, 14, '#EFC0CB']]) {
      const tx = x + dx * 1.6, ty = base - 62 - (dx === 0 ? 8 : 0);
      o += S(`M${f(x)} ${f(base - 24)}Q${f(x + dx * 0.4)} ${f(base - 44)} ${f(tx)} ${f(ty + 6)}`, '#8EAE7E', 3);
      o += P(`M${f(tx - 7)} ${f(ty - 6)}Q${f(tx - 8)} ${f(ty + 8)} ${f(tx)} ${f(ty + 8)}Q${f(tx + 8)} ${f(ty + 8)} ${f(tx + 7)} ${f(ty - 6)}L${f(tx + 3.5)} ${f(ty - 2)}L${f(tx)} ${f(ty - 8)}L${f(tx - 3.5)} ${f(ty - 2)}Z`, c, OL('#C995A6', 2) + ` transform="rotate(${a} ${f(tx)} ${f(ty)})"`);
    }
    o += P(`M${f(x - 10)} ${f(base - 30)}L${f(x + 10)} ${f(base - 30)}Q${f(x + 18)} ${f(base - 14)} ${f(x + 12)} ${f(base)}L${f(x - 12)} ${f(base)}Q${f(x - 18)} ${f(base - 14)} ${f(x - 10)} ${f(base - 30)}Z`, '#E8EEF0', OL('#A0A8AC', 2.6));
    return o;
  }
  if (m === 'summer') {   // a bowl of pale lemons / peaches
    let o = E(x, base, 30, 3, '#000', op(0.1));
    for (const [dx, dy, c] of [[-12, -16, '#F3DC93'], [10, -15, '#F4C9A4'], [0, -26, '#F0D98C']]) o += E(x + dx, base + dy, 11, 10, c, OL('#B99A5A', 2.2)) + E(x + dx - 3, base + dy - 4, 3, 2, '#FFF6D8');
    o += P(`M${f(x - 28)} ${f(base - 16)}L${f(x + 28)} ${f(base - 16)}Q${f(x + 26)} ${f(base)} ${f(x)} ${f(base)}Q${f(x - 26)} ${f(base)} ${f(x - 28)} ${f(base - 16)}Z`, '#FBF3E6', OL('#A88E70', 2.8));
    o += S(`M${f(x - 22)} ${f(base - 10)}Q${f(x)} ${f(base - 6)} ${f(x + 22)} ${f(base - 10)}`, '#C98E4E', 2.4);
    return o;
  }
  if (m === 'autumn') {   // two little pumpkins (muted)
    let o = E(x, base, 32, 3.4, '#000', op(0.1));
    for (const [dx, r, c] of [[-12, 16, '#D9935A'], [14, 12, '#E4B074']]) {
      const cx = x + dx, cy = base - r * 0.9;
      o += E(cx, cy, r * 1.2, r * 0.9, c, OL('#9E6A40', 2.6)) + S(`M${f(cx)} ${f(cy - r * 0.85)}Q${f(cx - r * 0.35)} ${f(cy)} ${f(cx)} ${f(cy + r * 0.85)}M${f(cx)} ${f(cy - r * 0.85)}Q${f(cx + r * 0.35)} ${f(cy)} ${f(cx)} ${f(cy + r * 0.85)}`, '#9E6A40', 1.8, op(0.7));
      o += S(`M${f(cx)} ${f(cy - r * 0.85)}L${f(cx + 2)} ${f(cy - r * 1.25)}`, '#7E6A44', 3.4) + E(cx - r * 0.5, cy - r * 0.3, r * 0.18, r * 0.12, '#F4D2A8');
    }
    return o;
  }
  // winter: a cream candle in a holder + a sprig
  let o = E(x, base, 24, 3, '#000', op(0.1));
  o += E(x, base - 4, 20, 5, '#C9A26B', OL('#8E6E42', 2.4)) + R(x - 8, base - 44, 16, 40, '#FBF4E8', ` rx="3"${OL('#B9A58C', 2.4)}`);
  o += P(`M${f(x)} ${f(base - 62)}Q${f(x + 7)} ${f(base - 52)} ${f(x)} ${f(base - 46)}Q${f(x - 7)} ${f(base - 52)} ${f(x)} ${f(base - 62)}Z`, '#FFD9A0', OL('#E0A867', 1.6));
  o += S(`M${f(x - 30)} ${f(base - 3)}Q${f(x - 18)} ${f(base - 12)} ${f(x - 8)} ${f(base - 6)}M${f(x + 30)} ${f(base - 3)}Q${f(x + 18)} ${f(base - 12)} ${f(x + 8)} ${f(base - 6)}`, '#6F8E74', 4);
  o += C(x - 18, base - 9, 3, '#E8C9C9') + C(x + 20, base - 9, 3, '#E8C9C9');
  return o;
}
function shelf(x0, x1) {
  let o = R(x0, shelfY + 12, x1 - x0, 6, '#000', op(0.08));
  o += R(x0, shelfY, x1 - x0, 13, WALL.wood, OL(WALL.woodOl, 3)) + R(x0, shelfY + 1.5, x1 - x0, 3, WALL.woodLight, op(0.9));
  return o;
}
function bracket(x) {
  return P(`M${f(x - 6)} ${f(shelfY + 13)}L${f(x + 6)} ${f(shelfY + 13)}L${f(x + 6)} ${f(shelfY + 22)}Q${f(x + 6)} ${f(shelfY + 40)} ${f(x - 6)} ${f(shelfY + 46)}Z`, WALL.woodShade, OL(WALL.woodOl, 2.6));
}
/** the left tileable strip (x 0..400): two jars, a loaf, a plate; a copper pan hanging under the shelf */
function stripLeft() {
  let o = shelf(0, 400) + bracket(100) + bracket(300);
  o += plateSvg(44, shelfY, 26) + jarSvg(110, shelfY, 44, 70, 'sprinkles', 'cloth') + jarSvg(160, shelfY, 34, 52, 'flour', 'wood') +
    loafSvg(236, shelfY, 76, 34) + cupsSvg(330, shelfY);
  o += panSvg(205, shelfY + 13, 30);
  return o;
}
/** the right tileable strip (x 1200..1600) */
function stripRight() {
  let o = shelf(1200, 1600) + bracket(1300) + bracket(1500);
  o += basketSvg(1252, shelfY) + jarSvg(1336, shelfY, 40, 60, 'cookies', 'wood') + rollingPinWall(1430, shelfY) + plateSvg(1548, shelfY, 24);
  o += panSvg(1400, shelfY + 13, 24) + panSvg(1468, shelfY + 13, 32);
  return o;
}
/** the plaster + backsplash + rim (periodic background, full width) */
function background() {
  let o = R(0, 0, 1600, 300, 'url(#pl)');
  // a soft painted band just under the ceiling + a wooden rail above the backsplash
  o += R(0, 0, 1600, 10, WALL.plasterDark, op(0.5));
  // backsplash subway tiles 50×22, staggered (period 50 → every strip tiles)
  o += R(0, 300, 1600, 72, WALL.tile);
  for (let r = 0; r < 4; r++) {
    const y = 300 + r * 18;
    o += R(0, y, 1600, 1.6, WALL.grout);
    o += R(0, y + 2, 1600, 3, '#FFFFFF', op(0.35));
    let d = '';
    for (let x = (r % 2 ? 25 : 0); x <= 1600; x += 50) d += `M${f(x)} ${f(y)}L${f(x)} ${f(y + 18)}`;
    o += `<path d="${d}" fill="none" stroke="${WALL.grout}" stroke-width="1.6"/>`;
  }
  o += R(0, 290, 1600, 12, WALL.wood, OL(WALL.woodOl, 2.6)) + R(0, 291.5, 1600, 3, WALL.woodLight, op(0.9));
  // table rim (the table's back edge)
  o += R(0, 368, 1600, 8, '#000', op(0.1));
  o += R(0, 372, 1600, 30, '#A87346') + R(0, 372, 1600, 4, '#D2A06C') + R(0, 372, 1600, 1.6, WALL.woodOl) + R(0, 394, 1600, 6, '#8C5E3F');
  let g = '';
  for (let x = 0; x < 1600; x += 100) g += `M${f(x + 12)} ${f(381)}Q${f(x + 40)} ${f(379)} ${f(x + 70)} ${f(382)}`;
  o += S(g, '#946238', 1.6, op(0.6));
  return o;
}
const OPEN = 'M630 316L630 216A170 170 0 0 1 970 216L970 316Z';
function outside(m) {
  const O = OUT[m], s = SUN[m];
  let o = R(600, 30, 400, 300, 'url(#sky)');
  // sun + glow
  o += C(s.x, s.y, s.r * 2.6, 'url(#sg)') + C(s.x, s.y, s.r, s.c);
  if (m === 'summer') { let d = ''; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; d += `M${f(s.x + Math.cos(a) * s.r * 1.3)} ${f(s.y + Math.sin(a) * s.r * 1.3)}L${f(s.x + Math.cos(a) * s.r * 1.7)} ${f(s.y + Math.sin(a) * s.r * 1.7)}`; } o += S(d, '#FFF1C0', 4); }
  // a static soft cloud (others drift in canvas)
  if (m !== 'autumn') o += `<g${op(m === 'winter' ? 0.75 : 0.9)}>` + E(760, 96, 34, 14, '#FFFFFF') + E(738, 100, 20, 11, '#FFFFFF') + E(784, 101, 22, 10, '#FFFFFF') + E(760, 104, 40, 7, '#F2F6FA') + '</g>';
  // far hills
  o += P('M600 262Q660 222 720 240Q790 260 850 232Q920 206 1000 238L1000 330L600 330Z', O.far);
  // a far wood line (little round tree tops / pines in winter)
  let tl = '';
  for (let i = 0; i < 12; i++) { const x = 612 + i * 34 + hsh(i, 3) * 10, y = 246 - Math.sin(i * 0.9) * 6 + (i > 6 ? -8 : 0); tl += C(x, y, 12 + hsh(i, 9) * 5, O.bush); }
  o += `<g${op(0.85)}>${tl}</g>`;
  // the near hill
  o += P('M600 290Q690 262 780 282Q880 304 1000 274L1000 330L600 330Z', O.near, OL(O.nearOl, 2));
  // two cottage roofs peeking over the near hill (snowy in winter)
  for (const [x, w, y] of [[866, 64, 288], [932, 44, 296]]) {
    o += R(x - w * 0.42, y, w * 0.84, 30, '#F1E3CC', OL('#B89C7E', 2)) + R(x - 6, y + 10, 12, 12, '#FFE3AE', OL('#B89C7E', 1.6));
    o += P(`M${f(x - w / 2 - 4)} ${f(y + 2)}L${f(x)} ${f(y - w * 0.42)}L${f(x + w / 2 + 4)} ${f(y + 2)}Z`, O.roof, OL('#8C6E5A', 2.2));
    if (O.roofSnow) o += P(`M${f(x - w / 2 - 6)} ${f(y + 2)}L${f(x)} ${f(y - w * 0.46)}L${f(x + w / 2 + 6)} ${f(y + 2)}Q${f(x + w * 0.25)} ${f(y - 4)} ${f(x + w * 0.1)} ${f(y - 2)}Q${f(x - w * 0.15)} ${f(y - 6)} ${f(x - w / 2 - 6)} ${f(y + 2)}Z`, O.roofSnow, OL('#C9D4E2', 1.6));
    o += R(x + w * 0.16, y - w * 0.4, 8, 14, '#C9A48A', OL('#8C6E5A', 1.8));
  }
  // the big tree on the left (season canopy) — a pine in winter
  if (m === 'winter') {
    for (const [x, y, k] of [[676, 300, 1], [726, 306, 0.7]]) {
      o += R(x - 4, y - 10, 8, 14, O.trunk);
      for (let j = 0; j < 3; j++) { const w = (46 - j * 11) * k, yy = y - 8 - j * 26 * k; o += P(`M${f(x - w)} ${f(yy)}L${f(x)} ${f(yy - 42 * k)}L${f(x + w)} ${f(yy)}Q${f(x)} ${f(yy - 8 * k)} ${f(x - w)} ${f(yy)}Z`, j % 2 ? O.tree : '#F7F9FC', OL(O.treeOl, 2.2)); o += P(`M${f(x - w * 0.8)} ${f(yy - 3)}Q${f(x)} ${f(yy - 10 * k)} ${f(x + w * 0.8)} ${f(yy - 3)}`, 'none', OL('#A9BACB', 1.6) + op(0.6)); }
    }
  } else {
    o += P('M676 316L672 250Q668 236 660 228M672 250Q680 236 692 230', 'none', OL(O.trunk, 9));
    o += P('M676 316L672 250', 'none', OL(O.trunk, 12));
    const bl = [[650, 214, 34], [690, 200, 38], [722, 222, 28], [662, 182, 26], [700, 170, 24]];
    for (const [x, y, r] of bl) o += C(x, y, r + 2.5, O.treeOl);
    for (const [x, y, r] of bl) o += C(x, y, r, O.tree);
    for (const [x, y, r] of bl) o += C(x + r * 0.2, y + r * 0.3, r * 0.6, O.treeShade, op(0.6));
    for (const [x, y, r] of bl) o += C(x - r * 0.3, y - r * 0.35, r * 0.28, '#FFFFFF', op(0.35));
    if (m === 'spring') for (let i = 0; i < 14; i++) o += C(640 + hsh(i, 7) * 110, 160 + hsh(7, i) * 80, 2.6, '#FFFFFF', op(0.85));
    if (m === 'autumn') for (let i = 0; i < 6; i++) o += E(660 + hsh(i, 5) * 100, 300 + hsh(5, i) * 12, 5, 2.4, '#C27E4E', op(0.8));
  }
  // a little round bush on the right (summer: soft green, autumn amber)
  if (m !== 'winter') o += C(988, 300, 26, O.treeOl) + C(988, 300, 24, O.tree) + C(980, 292, 8, '#FFFFFF', op(0.25));
  else o += E(990, 306, 30, 14, '#FFFFFF', OL('#C9D4E2', 2));
  return o;
}
function windowAndCurtains(m) {
  let o = '';
  // frame shadow on the plaster
  o += P('M606 340L606 216A194 194 0 0 1 994 216L994 340Z', '#000', op(0.07) + ' transform="translate(4 5)"');
  // frame (cream painted wood)
  o += P('M612 334L612 216A188 188 0 0 1 988 216L988 334Z', WALL.frame, OL(WALL.frameOl, 4));
  o += P('M619 330L619 216A181 181 0 0 1 981 216', 'none', OL(WALL.frameShade, 3));
  // keystone at the top of the arch
  o += P('M786 24L814 24L810 48L790 48Z', WALL.frame, OL(WALL.frameOl, 3)) + R(793, 30, 14, 3, '#FFFFFF', op(0.8));
  // the outside view (clipped)
  o += `<g clip-path="url(#glass)">${outside(m)}</g>`;
  // inner bevel / shadow at the top of the glass
  o += P(OPEN, 'none', OL('#9C8064', 4));
  o += P('M636 316L636 216A164 164 0 0 1 964 216', 'none', OL('#000', 6) + op(0.06));
  // mullions
  o += R(794, 46, 12, 270, WALL.frame, OL(WALL.frameOl, 2.4)) + R(630, 210, 340, 12, WALL.frame, OL(WALL.frameOl, 2.4)) + R(795.5, 211.5, 9, 9, WALL.frame);
  // sill (deep wooden ledge)
  o += R(594, 330, 412, 10, '#000', op(0.09));
  o += R(598, 312, 404, 20, '#D8B48A', ` rx="4"${OL('#8E6A48', 3)}`) + R(602, 314, 396, 4, '#F0D3AE') + R(604, 326, 392, 4, '#B48D62', op(0.6));
  // brass rod + finials
  o += R(560, 18, 480, 7, WALL.brass, ` rx="3.5"${OL(WALL.brassOl, 2.4)}`) + C(558, 21.5, 7, WALL.brass, OL(WALL.brassOl, 2.4)) + C(1042, 21.5, 7, WALL.brass, OL(WALL.brassOl, 2.4));
  // curtains (gingham, tied back with a caramel ribbon). Left: x 572..650 at the top, pinched at y 210, flare to the sill.
  const cur = (sx) => {
    const X = x => 800 + (x - 800) * sx;   // mirror for the right curtain
    const d = `M${f(X(572))} 24L${f(X(650))} 24Q${f(X(640))} 140 ${f(X(612))} 206Q${f(X(628))} 250 ${f(X(626))} 306Q${f(X(600))} 312 ${f(X(570))} 304Q${f(X(580))} 250 ${f(X(586))} 210Q${f(X(570))} 120 ${f(X(572))} 24Z`;
    let c = P(d, 'url(#ging)', OL(CURTAIN.ol, 3));
    c += S(`M${f(X(592))} 30Q${f(X(596))} 120 ${f(X(598))} 200M${f(X(616))} 30Q${f(X(616))} 120 ${f(X(604))} 204M${f(X(604))} 222Q${f(X(606))} 260 ${f(X(598))} 300`, CURTAIN.ol, 1.8, op(0.45));
    // ribbon tie-back
    c += P(`M${f(X(580))} 206Q${f(X(600))} 214 ${f(X(620))} 204L${f(X(622))} 214Q${f(X(600))} 224 ${f(X(580))} 216Z`, '#C98E4E', OL('#8A5A33', 2));
    c += E(X(586), 212, 7, 6, '#D9A066', OL('#8A5A33', 2));
    // rings on the rod
    for (let i = 0; i < 4; i++) c += C(X(578 + i * 22), 24, 4.4, 'none', OL(WALL.brassOl, 2));
    return c;
  };
  o += cur(1) + cur(-1);
  if (m === 'winter') {   // a pine garland across the rod with cream baubles
    let d = 'M566 26';
    for (let i = 0; i < 8; i++) d += `Q${f(596 + i * 60)} ${f(46)} ${f(626 + i * 60)} 26`;
    o += S(d, '#5E7E66', 9) + S(d, '#7E9E84', 4, op(0.8));
    for (let i = 0; i < 8; i++) o += C(626 + i * 60 - 30, 39, 5, i % 2 ? '#F4E6D0' : '#E8C9C9', OL('#A88E70', 1.6));
  }
  return o;
}
function wall(m) {
  const defs = lg('pl', [[0, WALL.plasterTop], [1, WALL.plaster]], V) + lg('sky', [[0, SKY[m][0]], [1, SKY[m][1]]], ' x1="0" y1="0.05" x2="0" y2="0.95"') +
    rg('sg', [[0, SUN[m].glow, 0.8], [1, SUN[m].glow, 0]]) + `<clipPath id="glass"><path d="${OPEN}"/></clipPath>` +
    `<pattern id="ging" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${CURTAIN.base}"/><rect width="10" height="20" fill="${CURTAIN.check}" opacity="0.55"/><rect width="20" height="10" fill="${CURTAIN.check}" opacity="0.55"/></pattern>`;
  let o = background();
  o += stripLeft() + stripRight();
  // middle part of the shelf (left and right of the window) + its things
  o += shelf(400, 560) + shelf(1040, 1200) + bracket(470) + bracket(1130);
  o += jarSvg(432, shelfY, 36, 58, 'sprinkles', 'wood') + jarSvg(478, shelfY, 42, 76, 'cookies', 'cloth') + loafSvg(528, shelfY, 48, 26);
  o += crockSvg(1076, shelfY) + seasonalShelf(m, 1150, shelfY);
  o += panSvg(512, shelfY + 13, 22);
  o += windowAndCurtains(m);
  return svg(1600, 400, o, defs, `sky ${SKY[m][0]} ${SKY[m][1]}`);
}

// ---------------- the bakery (start building) ----------------
function bakery() {
  const ol = '#7E4E2A';
  let o = '';
  o += E(130, 234, 112, 8, '#000', op(0.12));
  // chimney (behind the roof)
  o += R(184, 30, 24, 46, '#C9A48A', OL('#7E5A44', 3)) + R(180, 26, 32, 10, '#B98F74', ` rx="2"${OL('#7E5A44', 3)}`);
  // walls (cream plaster) with timber corners
  o += R(34, 100, 192, 134, '#F3E2C6', OL('#9C7A5A', 4));
  o += R(38, 104, 184, 10, '#E2CCAB', op(0.8)) + R(34, 210, 192, 24, '#E8D3B3', op(0.7));
  o += R(34, 100, 10, 134, '#C99A68', OL('#9C7A5A', 3)) + R(216, 100, 10, 134, '#C99A68', OL('#9C7A5A', 3));
  // roof: a cookie-tile roof (scalloped rows, caramel), big and round
  o += P('M14 108L130 22L246 108Q246 116 238 116L22 116Q14 116 14 108Z', '#B8794A', OL(ol, 4));
  let sc = '';
  for (let r = 0; r < 3; r++) {
    const y = 58 + r * 20, half = 40 + r * 27;
    for (let x = 130 - half + 9; x <= 130 + half - 9; x += 18) sc += `M${f(x - 9)} ${f(y)}Q${f(x)} ${f(y + 12)} ${f(x + 9)} ${f(y)}`;
  }
  o += S(sc, '#94603A', 2.6);
  o += P('M30 104L130 30L230 104', 'none', OL('#D49A66', 3) + op(0.8));
  // icing drips along the roof edge
  let dr = 'M16 110';
  for (let i = 0; i < 12; i++) { const x = 16 + i * 19; dr += `L${f(x + 6)} 110Q${f(x + 9.5)} ${f(124 + (i % 3) * 4)} ${f(x + 13)} 110`; }
  dr += 'L244 110L244 116L16 116Z';
  o += P(dr, '#FFF8EC', OL('#D8C6AE', 2));
  o += P('M18 110L130 25L242 110', 'none', OL('#FFF8EC', 5));
  // the round bread sign in the gable
  o += C(130, 74, 21, '#FBF3E6', OL('#9C7A5A', 3.4)) + E(130, 77, 13, 8, '#DCA368', OL('#8A5A33', 2.2)) +
    S('M122 74Q125 71 128 73M130 73Q133 70 136 72', '#F2D2A4', 2) + E(126, 73, 3, 1.6, '#F4D7AE');
  // striped awning over the front (cream / caramel), scalloped hem
  let aw = '';
  for (let i = 0; i < 8; i++) { const x = 28 + i * 25.5; aw += P(`M${f(x)} 124L${f(x + 25.5)} 124L${f(x + 25.5 + 2)} 146L${f(x + 2)} 146Z`, i % 2 ? '#FFF2DC' : '#C98E4E'); }
  o += P('M26 124L234 124L238 146L22 146Z', '#FFF2DC', OL(ol, 3)) + aw;
  let hem = 'M22 146';
  for (let i = 0; i < 8; i++) { const x = 22 + i * 27; hem += `Q${f(x + 13.5)} 160 ${f(x + 27)} 146`; }
  o += P(hem + 'Z', '#FFF2DC', OL(ol, 3));
  for (let i = 0; i < 8; i++) if (i % 2 === 0) o += P(`M${f(22 + i * 27)} 146Q${f(22 + i * 27 + 13.5)} 160 ${f(22 + i * 27 + 27)} 146Z`, '#C98E4E');
  o += P(hem, 'none', OL(ol, 3)) + R(24, 124, 212, 4, '#FFFFFF', op(0.4));
  // display window (left) with loaves on a shelf
  o += R(48, 166, 48, 46, '#FFE4B8', ` rx="5"${OL('#9C7A5A', 3.4)}`) + R(52, 170, 40, 20, '#FFEFD2', ' rx="3"');
  o += loafSvg(62, 196, 20, 11) + loafSvg(82, 196, 20, 13) + R(50, 196, 44, 4, '#B98552');
  o += R(70.5, 166, 3, 46, '#9C7A5A', op(0.6)) + R(44, 210, 56, 6, '#C99A68', ` rx="2"${OL('#9C7A5A', 2.4)}`);
  // flower box under the display window
  o += C(56, 208, 4, '#F3C6C9') + C(66, 207, 4, '#FBF1E1') + C(78, 208, 4, '#F3C6C9') + C(88, 207, 4, '#FBF1E1');
  // round oven window (right): warm glow #FFC977, a little cake inside
  o += C(192, 170, 25, '#C99A68', OL('#7E5A44', 3.4)) + C(192, 170, 21, 'url(#ov)') + C(192, 170, 21, 'none', OL('#9C7A5A', 2.4));
  o += P('M180 181L204 181L201 172L183 172Z', '#E8B06C', OL('#B07A44', 1.6)) + E(192, 171, 9, 3, '#FFF2DC');
  o += P('M178 162A16 16 0 0 1 190 155', 'none', OL('#FFFFFF', 2.6) + op(0.7));
  // door (caramel, arched, with a round window + a tiny bell)
  o += P('M108 234L108 170A22 22 0 0 1 152 170L152 234Z', '#B5773F', OL(ol, 4));
  o += P('M114 234L114 172A16 16 0 0 1 146 172L146 234', 'none', OL('#9A6234', 2.4));
  o += C(130, 172, 8, '#FFE0A8', OL(ol, 2.6)) + C(143, 204, 3.2, '#F1D8A4', OL(ol, 1.6));
  o += P('M152 154Q160 154 160 160', 'none', OL('#8E6E42', 2)) + P('M156 160L164 160L163 166L157 166Z', '#D9B36E', OL('#8E6E42', 1.6));
  // door step
  o += R(100, 230, 60, 8, '#D8C6AE', ` rx="3"${OL('#9C7A5A', 2.4)}`);
  const defs = rg('ov', [[0, '#FFF0C8'], [0.55, '#FFC977'], [1, '#F2A85E']]);
  return svg(260, 240, o, defs);
}

// ---------------- table decorations ----------------
function flour() {
  const a = [[60, 36, 46, 16, 0.55], [38, 32, 22, 10, 0.5], [84, 40, 24, 9, 0.45], [60, 38, 30, 9, 0.7], [56, 34, 16, 6, 0.8]];
  let o = a.map(([x, y, rx, ry, al]) => E(x, y, rx, ry, '#FFFDF8', op(al))).join('');
  for (let i = 0; i < 16; i++) o += C(10 + hsh(i, 2) * 100, 20 + hsh(2, i) * 34, 0.8 + hsh(i, 4) * 1.8, '#FFFFFF', op(0.8));
  o += E(70, 33, 6, 2.6, '#FFFFFF', op(0.9));
  return svg(120, 60, o);
}
function rollingpin() {
  let o = E(100, 50, 92, 6, '#5A3826', op(0.16));
  o += R(4, 30, 30, 12, '#C9945E', ` rx="6"${OL('#7A4C27', 3)}`) + R(166, 30, 30, 12, '#C9945E', ` rx="6"${OL('#7A4C27', 3)}`);
  o += R(30, 20, 140, 30, '#E2B783', ` rx="14"${OL('#7A4C27', 3.4)}`) + R(38, 24, 120, 6, '#F4D5AB', ' rx="3"') + R(38, 40, 124, 5, '#C9945E', ' rx="2.5"' + op(0.7));
  o += E(70, 35, 16, 4, '#FFFDF8', op(0.55)) + E(124, 37, 10, 3, '#FFFDF8', op(0.45));
  return svg(200, 60, o);
}
function jar() {
  let o = E(45, 104, 36, 5, '#5A3826', op(0.15));
  o += jarSvg(45, 103, 62, 90, 'sprinkles', 'cloth');
  return svg(90, 110, o);
}
function plant(m) {
  let o = E(60, 134, 40, 5, '#5A3826', op(0.15));
  if (m === 'spring') {   // tulips
    for (const [x, y, a, c] of [[42, 46, -12, '#F3C6C9'], [62, 34, 0, '#F6D8C9'], [80, 48, 12, '#EFC0CB']]) {
      o += S(`M60 96Q${f((60 + x) / 2)} 76 ${f(x)} ${f(y + 10)}`, '#86A876', 4);
      o += P(`M${f(x - 10)} ${f(y - 8)}Q${f(x - 12)} ${f(y + 12)} ${f(x)} ${f(y + 12)}Q${f(x + 12)} ${f(y + 12)} ${f(x + 10)} ${f(y - 8)}L${f(x + 5)} ${f(y - 2)}L${f(x)} ${f(y - 11)}L${f(x - 5)} ${f(y - 2)}Z`, c, OL('#C995A6', 2.6) + ` transform="rotate(${a} ${f(x)} ${f(y)})"`);
    }
    o += P('M46 98Q30 70 38 60Q50 76 52 96Z', '#9CBF8C', OL('#6F8E64', 2.4)) + P('M74 98Q90 72 84 62Q70 78 68 96Z', '#9CBF8C', OL('#6F8E64', 2.4));
  } else if (m === 'summer') {   // a sunflower (muted honey, not answer yellow)
    o += S('M60 96Q58 70 60 46', '#86A876', 5) + P('M60 82Q40 70 34 80Q46 90 60 86Z', '#9CBF8C', OL('#6F8E64', 2.4)) + P('M60 72Q80 60 86 70Q74 80 60 76Z', '#9CBF8C', OL('#6F8E64', 2.4));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; o += E(60 + Math.cos(a) * 18, 40 + Math.sin(a) * 18, 10, 5.4, '#EBC873', OL('#B99A4E', 1.8) + ` transform="rotate(${f(a * 180 / Math.PI)} ${f(60 + Math.cos(a) * 18)} ${f(40 + Math.sin(a) * 18)})"`); }
    o += C(60, 40, 13, '#8E6A4A', OL('#6E4E36', 2.4));
    for (let i = 0; i < 7; i++) o += C(55 + hsh(i, 1) * 10, 35 + hsh(1, i) * 10, 1.4, '#B9946A');
  } else if (m === 'autumn') {   // a bushy sage / rosemary herb with amber tips
    for (let i = 0; i < 9; i++) {
      const x = 28 + i * 8, h = 40 + hsh(i, 6) * 28;
      o += S(`M60 96Q${f((60 + x) / 2)} ${f(96 - h * 0.5)} ${f(x)} ${f(96 - h)}`, '#7E9070', 3);
      for (let j = 0; j < 4; j++) { const t = 0.35 + j * 0.18, px = 60 + (x - 60) * t, py = 96 - h * t; o += E(px - 4, py, 5, 2.6, j === 3 ? '#D9A06A' : '#A3AE8C', ` transform="rotate(-30 ${f(px - 4)} ${f(py)})"`) + E(px + 4, py - 2, 5, 2.6, j === 3 ? '#D9A06A' : '#A3AE8C', ` transform="rotate(30 ${f(px + 4)} ${f(py - 2)})"`); }
    }
  } else {   // winter: a pine sprig with cream baubles
    o += S('M60 96L60 24', '#7E6A54', 4);
    for (let j = 0; j < 6; j++) { const y = 34 + j * 11, w = 12 + j * 5; o += S(`M60 ${f(y)}L${f(60 - w)} ${f(y + 10)}M60 ${f(y)}L${f(60 + w)} ${f(y + 10)}`, j % 2 ? '#6F8E74' : '#5E7E66', 6); }
    o += C(46, 60, 5, '#F4E6D0', OL('#A88E70', 1.8)) + C(76, 72, 5, '#E8C9C9', OL('#A88E70', 1.8)) + C(56, 84, 4.6, '#F4E6D0', OL('#A88E70', 1.8));
    o += P('M60 14L63 22L60 20L57 22Z', '#F1E3B9', OL('#B99A4E', 1.6));
    o += E(48, 46, 6, 2.4, '#FFFFFF', op(0.85)) + E(72, 60, 7, 2.4, '#FFFFFF', op(0.85));
  }
  // the pot: cream ceramic with a caramel band
  o += P('M30 96L90 96L84 134L36 134Z', '#EFE2CC', OL('#A88E70', 3.4)) + R(26, 90, 68, 12, '#F6EBDA', ` rx="4"${OL('#A88E70', 3)}`);
  o += R(33, 112, 54, 6, '#C98E4E', op(0.85)) + S('M40 104L42 128', '#FFFFFF', 3.4, op(0.6));
  return svg(120, 140, o);
}

// ---------------- new particles ----------------
function crumb() {
  return svg(32, 32, P('M8 17L12 9L20 7.5L26 13L24.5 21L17 25.5L10 23Z', '#C9945E', OL('#8C5E3F', 1.8)) +
    P('M12 9L20 7.5L23 11L14 13Z', '#E2B783', op(0.9)) + C(17, 17, 1.6, '#8C5E3F', op(0.7)) + C(12.5, 19, 1.1, '#8C5E3F', op(0.6)) + C(21, 15, 1, '#FFF4E2', op(0.9)));
}
function heart() {
  return svg(32, 32, C(16, 16, 15, 'url(#h)') + P('M16 26.5Q6.5 20 5.5 13.6Q5 8.4 9.8 7.6Q13.8 7.2 16 11Q18.2 7.2 22.2 7.6Q27 8.4 26.5 13.6Q25.5 20 16 26.5Z', '#F7B8CC', OL('#D58AA4', 1.8)) +
    P('M16 26.5Q25.5 20 26.5 13.6Q25 19 16 24Z', '#EC9FB8', op(0.8)) + E(11, 12, 2.6, 1.8, '#FFFFFF', ` transform="rotate(-35 11 12)"` + op(0.9)),
  rg('h', [[0, '#FFE6EE', 0.7], [0.6, '#FFE6EE', 0.25], [1, '#FFE6EE', 0]]));
}

module.exports = { SEASONS, SKY, SUN, WALL, OUT, OPEN, shelfY };
if (require.main === module) {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const files = {};
  for (const m of SEASONS) { files['wall_' + m] = wall(m); files['plant_' + m] = plant(m); }
  files.bakery = bakery(); files.flour = flour(); files.rollingpin = rollingpin(); files.jar = jar();
  for (const fn of fs.readdirSync(env)) if (!files[fn.replace(/\.svg$/, '')]) fs.unlinkSync(path.join(env, fn));
  let kb = 0;
  for (const [k, v] of Object.entries(files)) { fs.writeFileSync(path.join(env, k + '.svg'), v); kb += v.length; }
  fs.writeFileSync(path.join(par, 'crumb.svg'), crumb()); fs.writeFileSync(path.join(par, 'heart.svg'), heart());
  console.log('wrote env (' + Object.keys(files).length + ' files, ' + Math.round(kb / 1024) + ' KB) and particles: crumb, heart');
}
