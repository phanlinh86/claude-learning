// Bim's Rainbow Rocket: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{hills_<mood>, cloud_a..e, cloudbank, rainbow, sun, moon, planet_a..c}.svg and
// game/assets/default/particles/{sparkle, star, puff, dust, confetti_a, confetti_b}.svg     (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: every object that crosses the left/right edge of a tileable file (hills_*, cloudbank) is drawn again at x±W
// (wrap()), so the left and right edges match exactly. Moods share ONE layout (same seed); only colours change.
// Colour rule (DESIGN §3): everything is pale and less saturated than the answer colours (red #E84A4A, blue #3C8DE8,
// yellow #FFD23F, green #4CC26B, orange #FF9A2E, purple #9B6BE0) so answer-coloured islands always pop.
// Background clouds have NO dark outline (only a faint lavender rim) so they read as background against the outlined
// foreground islands. Clouds, cloudbank and particles are near-white / neutral: the renderer tints them per mood.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''} fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
// circle / ellipse as path pieces, all drawn CLOCKWISE (sweep 1) like the rects, so unions never cancel under nonzero fill
const cp = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`;
const ep = (x, y, rx, ry) => `M${f(x - rx)} ${f(y)}a${f(rx)} ${f(ry)} 0 1 1 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 1 ${f(-2 * rx)} 0Z`;
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
function wrap(x, half, fn, Wd = W) { let o = fn(x); if (x + half > Wd) o += fn(x - Wd); if (x - half < 0) o += fn(x + Wd); return o; }
const lg = (id, x1, y1, x2, y2, stops) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';

// ---------------- mood palettes for the take-off hills (pale, calm) ----------------
const MOODS = {
  morning: {
    far: '#D3E9E0', farSh: '#C4DFD5', farHi: '#E6F3EC',
    mid: '#C3E4CB', midSh: '#B2D9BC', midHi: '#D8EED9', midLine: '#A5CDAF',
    front: '#B6DDB9', frontSh: '#A4D1A9', frontHi: '#CDE9CC', frontLine: '#97C39C', fill: '#A4D1A9',
    floss: [['#FAD3DE', '#EEBCCB'], ['#E4DCF6', '#D1C6EC'], ['#FFE6CC', '#F3D2B1'], ['#D3EFE6', '#BCE2D6']], flossHi: '#FFFFFF', stem: '#D9C3AA', stemSh: '#C6AE94',
    tower: '#F4F1EA', towerSh: '#DCD6CA', towerLine: '#A9A08E', towerTeal: '#A9D9D3', towerTealSh: '#86C2BA', flag: '#F6C9D5', beacon: '#FFF1C7', beaconGlow: 0,
    dot: ['#FFFFFF', '#FBE3EA', '#FFF4D6', '#EEE7FA'], path: '#EFE7D6', pathSh: '#E1D6C1',
  },
  noon: {
    far: '#CBE8DD', farSh: '#BBDDD1', farHi: '#E0F3EA',
    mid: '#B6E0C1', midSh: '#A5D4B2', midHi: '#CFEDD3', midLine: '#98C8A4',
    front: '#A9D9AF', frontSh: '#97CC9E', frontHi: '#C4E7C3', frontLine: '#89BC91', fill: '#97CC9E',
    floss: [['#F9CCDA', '#EDB4C6'], ['#DED5F5', '#CABFEB'], ['#FFE2C4', '#F2CDA8'], ['#CBEDE2', '#B2E0D1']], flossHi: '#FFFFFF', stem: '#D6BFA4', stemSh: '#C2A98E',
    tower: '#F7F5EF', towerSh: '#DFDACF', towerLine: '#A79E8B', towerTeal: '#A3D7D0', towerTealSh: '#7FBFB6', flag: '#F6C2D1', beacon: '#FFF1C7', beaconGlow: 0,
    dot: ['#FFFFFF', '#FBE3EA', '#FFF4D6', '#EEE7FA'], path: '#F0E8D7', pathSh: '#E2D7C2',
  },
  sunset: {
    far: '#E1C9DA', farSh: '#D6BBD0', farHi: '#EDDAE5',
    mid: '#D7C2CF', midSh: '#C9B2C3', midHi: '#E8D5DC', midLine: '#B9A0B3',
    front: '#CDB6C4', frontSh: '#BEA5B7', frontHi: '#E2CCD2', frontLine: '#AA8FA4', fill: '#BEA5B7',
    floss: [['#F4C4CF', '#E5ADBC'], ['#D9C8EA', '#C6B3DD'], ['#F8D5BF', '#EBC0A6'], ['#D7DDE6', '#C3CAD8']], flossHi: '#FFF1EC', stem: '#C9AA9A', stemSh: '#B49485',
    tower: '#F2E4E0', towerSh: '#DCC9C6', towerLine: '#A08988', towerTeal: '#B5CCCF', towerTealSh: '#97B2B6', flag: '#F2BFC9', beacon: '#FFE6B8', beaconGlow: 0.5,
    dot: ['#FFF3EE', '#F8D9E1', '#FCE6D2', '#E7DDF1'], path: '#E8D6D2', pathSh: '#D8C3C1',
  },
  night: {
    far: '#3E477C', farSh: '#39417343', farHi: '#4A5489',
    mid: '#36406F', midSh: '#303963', midHi: '#434E80', midLine: '#2A3258',
    front: '#2E3762', frontSh: '#283057', frontHi: '#3B4572', frontLine: '#232A4D', fill: '#283057',
    floss: [['#6A5D93', '#5A4E82'], ['#4E5F93', '#435383'], ['#7A6290', '#68527E'], ['#4A6E8C', '#3F607C']], flossHi: '#8C86B8', stem: '#5B5679', stemSh: '#4E4A6B',
    tower: '#7D82A8', towerSh: '#676C93', towerLine: '#4B4F74', towerTeal: '#5E8A99', towerTealSh: '#4D7584', flag: '#9B83AE', beacon: '#FFE9A8', beaconGlow: 1,
    dot: ['#FFF1BE', '#D9E4FF', '#FFF1BE', '#E8DCFF'], path: '#545A86', pathSh: '#484D78',
  },
};
MOODS.night.farSh = '#373F70';

// ================= hills_<mood>.svg (0 0 1200 420): bottom-anchored, tileable, transparent above =================
// layout (shared by all moods)
function hillLayout() {
  const r = rng(42);
  const far = [], mid = [], front = [], trees = [], dots = [];
  // far hills: low wide bumps, tops ≈ y 175..215
  for (let i = 0; i < 6; i++) far.push({ x: i * 200 + 60 + r() * 60, top: 172 + r() * 40, rx: 150 + r() * 50 });
  // mid hills: round, tops ≈ y 235..275
  for (let i = 0; i < 5; i++) mid.push({ x: i * 240 + 20 + r() * 80, top: 232 + r() * 38, rx: 140 + r() * 40 });
  // front hills: tops ≈ y 305..330
  for (let i = 0; i < 4; i++) front.push({ x: i * 300 + 110 + r() * 80, top: 304 + r() * 26, rx: 190 + r() * 40 });
  // candy-floss trees on the mid band (avoid the tower slot around x 820..930)
  const tx = [70, 175, 300, 395, 520, 610, 705, 1000, 1085, 1160];
  tx.forEach((x, i) => { trees.push({ x: x + (r() - 0.5) * 20, s: 0.7 + r() * 0.45, c: i % 4, layer: i % 3 === 1 ? 'far' : 'mid' }); });
  for (let i = 0; i < 46; i++) dots.push({ x: r() * W, y: 340 + r() * 66, s: 0.8 + r() * 0.6, c: i % 4 });
  return { far, mid, front, trees, dots };
}
const LAYOUT = hillLayout();
// y of the hill surface for a list of bumps (max of ellipse tops) -> used to sit trees on the ground
function surfY(bumps, x, base) {
  let y = base;
  for (const b of bumps) for (const dx of [0, -W, W]) {
    const u = (x - (b.x + dx)) / b.rx; if (Math.abs(u) < 1) { const ry = base - b.top; y = Math.min(y, base - ry * Math.sqrt(1 - u * u)); }
  }
  return y;
}
function hillBand(bumps, base, C, k) {
  // bumps = ellipses centred on y = base with ry = base - top; plus a solid rect below base
  let fill = `M0 ${base}H${W}V420H0Z`, sh = '', hi = '', line = '';
  for (const b of bumps) {
    const ry = base - b.top;
    fill += wrap(b.x, b.rx, x => ep(x, base, b.rx, ry));
    // shade: right lower part of each bump (a smaller ellipse offset right, clipped visually by being same-band)
    sh += wrap(b.x, b.rx, x => ep(x + b.rx * 0.32, base + ry * 0.18, b.rx * 0.7, ry * 0.86));
    // highlight: a soft crescent upper-left
    hi += wrap(b.x, b.rx, x => `M${f(x - b.rx * 0.72)} ${f(base - ry * 0.55)}Q${f(x - b.rx * 0.45)} ${f(b.top + ry * 0.04)} ${f(x - b.rx * 0.02)} ${f(b.top + ry * 0.07)}Q${f(x - b.rx * 0.4)} ${f(b.top + ry * 0.2)} ${f(x - b.rx * 0.72)} ${f(base - ry * 0.55)}Z`);
  }
  // rim line along the band's top silhouette (sampled; tileable because the silhouette is)
  const pts = []; for (let x = 0; x <= W; x += 6) pts.push([x, surfY(bumps, x, base)]);
  line = 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
  return { fill, sh, hi, line, pts };
}
function flossTree(x, y, s, C, ci) {
  // candy-floss tree: thin wavy stem + 3–4 overlapping puffs, two-tone, white highlight
  const [c1, c2] = C.floss[ci];
  let o = '';
  o += P(`M${f(x - 3 * s)} ${f(y + 2)}Q${f(x - 5 * s)} ${f(y - 22 * s)} ${f(x - 1 * s)} ${f(y - 44 * s)}L${f(x + 3 * s)} ${f(y - 44 * s)}Q${f(x)} ${f(y - 22 * s)} ${f(x + 3 * s)} ${f(y + 2)}Z`, C.stem);
  o += P(`M${f(x + 0.5 * s)} ${f(y + 2)}Q${f(x - 1.5 * s)} ${f(y - 22 * s)} ${f(x + 1.5 * s)} ${f(y - 44 * s)}L${f(x + 3 * s)} ${f(y - 44 * s)}Q${f(x)} ${f(y - 22 * s)} ${f(x + 3 * s)} ${f(y + 2)}Z`, C.stemSh);
  const puffs = [[-14, -52, 15], [12, -54, 16], [0, -68, 18], [-4, -48, 14]];
  o += P(puffs.map(([u, v, r]) => cp(x + u * s, y + v * s, r * s)).join(''), c1);
  o += P(puffs.map(([u, v, r]) => cp(x + (u + r * 0.25) * s, y + (v + r * 0.3) * s, r * 0.72 * s)).join(''), c2);
  o += P(puffs.slice(1, 3).map(([u, v, r]) => cp(x + (u - r * 0.25) * s, y + (v - r * 0.2) * s, r * 0.6 * s)).join(''), c1);
  o += ell(x - 8 * s, y - 72 * s, 6 * s, 3.5 * s, C.flossHi, ' opacity="0.75" transform="rotate(-25 ' + f(x - 8 * s) + ' ' + f(y - 72 * s) + ')"');
  return o;
}
function launchTower(x, y, C) {
  // tiny launch tower: lattice mast with a round platform, a striped flag and a beacon on top (pale, never answer colours)
  let o = '';
  if (C.beaconGlow) o += circ(x + 14, y - 108, 26, 'url(#beam)');
  // base pad (a flat disc)
  o += ell(x, y + 2, 46, 9, C.towerSh) + ell(x, y - 1, 46, 8, C.tower) + ell(x, y - 1, 46, 8, 'none', ` stroke="${C.towerLine}" stroke-width="2"`);
  // mast: two rails + cross braces
  const top = y - 100;
  o += strokeP(`M${f(x + 6)} ${f(y - 4)}L${f(x + 8)} ${f(top)}M${f(x + 22)} ${f(y - 4)}L${f(x + 20)} ${f(top)}`, C.towerLine, 6);
  o += strokeP(`M${f(x + 6)} ${f(y - 4)}L${f(x + 8)} ${f(top)}M${f(x + 22)} ${f(y - 4)}L${f(x + 20)} ${f(top)}`, C.towerTeal, 3.2);
  let br = ''; for (let k = 0; k < 4; k++) { const y0 = y - 6 - k * 24, y1 = y0 - 24; br += `M${f(x + 7)} ${f(y0)}L${f(x + 21)} ${f(y1)}M${f(x + 21)} ${f(y0)}L${f(x + 7)} ${f(y1)}`; }
  o += strokeP(br, C.towerTealSh, 1.8);
  // arm reaching to the pad
  o += strokeP(`M${f(x + 8)} ${f(y - 58)}L${f(x - 10)} ${f(y - 58)}`, C.towerLine, 5) + strokeP(`M${f(x + 8)} ${f(y - 58)}L${f(x - 10)} ${f(y - 58)}`, C.towerTeal, 2.4);
  // cap + beacon
  o += rect(x + 3, top - 6, 22, 8, C.tower, 3, ` stroke="${C.towerLine}" stroke-width="2"`);
  o += circ(x + 14, top - 10, 5.5, C.beacon, ` stroke="${C.towerLine}" stroke-width="1.6"`);
  // flag pole + flag
  o += strokeP(`M${f(x + 14)} ${f(top - 14)}L${f(x + 14)} ${f(top - 36)}`, C.towerLine, 2);
  o += P(`M${f(x + 15)} ${f(top - 36)}Q${f(x + 26)} ${f(top - 38)} ${f(x + 36)} ${f(top - 31)}Q${f(x + 26)} ${f(top - 27)} ${f(x + 15)} ${f(top - 25)}Z`, C.flag);
  return o;
}
function genHills(C, mood) {
  const L = LAYOUT;
  const defs = rg('beam', [[0, '#FFF2C4', 0.75 * C.beaconGlow], [0.5, '#FFE9A8', 0.3 * C.beaconGlow], [1, '#FFE9A8', 0]]);
  let o = '';
  // far band (base y 260)
  const far = hillBand(L.far, 262, C);
  o += P(far.fill, C.far) + P(far.hi, C.farHi, ' opacity="0.7"');
  for (const t of L.trees.filter(t => t.layer === 'far')) { const y = surfY(L.far, t.x, 262) + 4; o += wrap(t.x, 30, xx => flossTree(xx, y, t.s * 0.7, C, t.c), W); }
  // mid band (base y 330)
  const mid = hillBand(L.mid, 330, C);
  o += P(mid.fill, C.mid) + `<g opacity="0.55">${P(mid.sh, C.midSh)}</g>` + P(mid.hi, C.midHi, ' opacity="0.8"') + strokeP(mid.line, C.midLine, 2.5, ' opacity="0.55"');
  for (const t of L.trees.filter(t => t.layer === 'mid')) { const y = surfY(L.mid, t.x, 330) + 5; o += wrap(t.x, 40, xx => flossTree(xx, y, t.s, C, t.c)); }
  // launch tower on the mid band at x ≈ 870
  const tX = 872, tY = surfY(L.mid, tX, 330) + 6;
  o += launchTower(tX, tY, C);
  // front band (base y 380) + bottom
  const fr = hillBand(L.front, 380, C);
  o += P(fr.fill, C.front) + `<g opacity="0.5">${P(fr.sh, C.frontSh)}</g>` + P(fr.hi, C.frontHi, ' opacity="0.8"') + strokeP(fr.line, C.frontLine, 3, ' opacity="0.6"');
  // a winding path to the tower (pale ribbon) on the front band
  o += strokeP(`M780 420Q830 388 846 360Q858 340 872 ${f(tY + 4)}`, C.pathSh, 16, ' opacity="0.8"') + strokeP(`M780 420Q830 388 846 360Q858 340 872 ${f(tY + 4)}`, C.path, 11);
  // tiny flower dots / night glow-dots on the front band
  for (const d of L.dots) {
    const sy = surfY(L.front, d.x, 380); if (d.y < sy + 10) continue;
    const col = C.dot[d.c];
    o += wrap(d.x, 6, xx => circ(xx, d.y, 2.6 * d.s, col, mood === 'night' ? ' opacity="0.75"' : '') + (mood === 'night' ? '' : circ(xx, d.y, 1 * d.s, '#FFF6D8')));
  }
  return svg(1200, 420, o, C.beaconGlow ? defs : '');
}

// ================= background clouds cloud_a..e (0 0 320 170) =================
// white puffs, lavender underside, faint lavender rim (no dark outline) – tinted by code per mood.
const CL = { base: '#FFFFFF', sh: '#E6E8F7', sh2: '#D9DDF2', rim: '#CDD3EE', hi: '#FFFFFF' };
function cloudShape(puffs, bottom) {
  // union path of puffs + a flat-ish rounded base pill that stays inside the puffs' extent
  const left = puffs.reduce((m, p) => (p[0] - p[2] < m[0] - m[2] ? p : m)), right = puffs.reduce((m, p) => (p[0] + p[2] > m[0] + m[2] ? p : m));
  const hb = 36, x0 = left[0] - left[2] * 0.55, x1 = right[0] + right[2] * 0.55;
  return puffs.map(([x, y, r]) => cp(x, y, r)).join('') + `M${f(x0 + hb / 2)} ${f(bottom - hb)}H${f(x1 - hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${hb}H${f(x0 + hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${-hb}Z`;
}
function genCloud(puffs, bottom) {
  // lavender silhouette, then (clipped to it) a mid-lavender copy raised 5 px and a white copy raised 11 px:
  // the underside shows two soft lavender steps, the top stays white. Faint rim only (no dark outline).
  const d = cloudShape(puffs, bottom);
  let o = `<clipPath id="cc"><path d="${d}"/></clipPath>`;
  o += `<path d="${d}" fill="${CL.sh2}" stroke="${CL.rim}" stroke-width="3" stroke-linejoin="round"/>`;
  o += `<g clip-path="url(#cc)"><path d="${d}" fill="${CL.sh}" transform="translate(0 -6)"/><path d="${d}" fill="${CL.base}" transform="translate(0 -13)"/></g>`;
  return svg(320, 170, o);
}
function genClouds() {
  return {
    cloud_a: genCloud([[70, 108, 34], [124, 82, 46], [186, 74, 52], [242, 100, 38], [160, 114, 36]], 150),
    cloud_b: genCloud([[56, 118, 26], [98, 100, 36], [150, 98, 40], [204, 104, 32], [254, 118, 24]], 148),
    cloud_c: genCloud([[84, 104, 38], [142, 70, 56], [204, 86, 44], [248, 112, 30], [130, 116, 34]], 152),
    cloud_d: genCloud([[66, 122, 24], [104, 108, 32], [148, 92, 42], [196, 110, 30], [232, 124, 20]], 150), // small low wisp
    cloud_e: genCloud([[60, 112, 30], [110, 86, 44], [164, 64, 54], [222, 84, 44], [266, 112, 30], [170, 116, 36]], 152), // tall puffy
  };
}

// ================= cloudbank.svg (0 0 1200 300): tileable dense wall the rocket boosts through =================
function genCloudbank() {
  // rows of white domes over a pale-lavender core; each row first paints a lavender copy 7 px lower, so a soft crease
  // shows under every dome (layered, dense cloud). Every row has an integer number of puffs per tile + wrap() => tileable.
  const r = rng(7);
  const row = (n, yc, yj, r0, rj, dx = 0) => { const a = []; for (let i = 0; i < n; i++) a.push([(i + 0.5) * W / n + dx + (r() - 0.5) * 18, yc + (r() - 0.5) * yj, r0 + r() * rj]); return a; };
  const back = row(13, 74, 16, 44, 18, 30);       // lavender domes peeking above
  const top = row(14, 96, 18, 48, 20);             // top edge domes
  const mid = row(12, 168, 14, 50, 14, 40);        // middle row (creases)
  const bot = row(16, 214, 12, 46, 14, 20);        // hanging bottom puffs
  const shade = row(16, 236, 10, 40, 14, 0);       // lavender underside
  const dset = (pu, dy = 0) => pu.map(([x, y, rr]) => wrap(x, rr + 2, xx => cp(xx, y + dy, rr))).join('');
  let o = '';
  o += P(dset(back), '#E4E7F7');
  o += P(dset(shade), '#D9DEF3');
  o += P(`M0 104H${W}V214H0Z`, '#ECEEFA');
  for (const pu of [bot, mid, top]) o += P(dset(pu, 7), '#E3E6F7') + P(dset(pu), '#FFFFFF');
  o += P(top.map(([x, y, rr]) => wrap(x, rr, xx => ep(xx - rr * 0.3, y - rr * 0.55, rr * 0.3, rr * 0.11))).join(''), '#FFFFFF');
  return svg(1200, 300, o);
}

// ================= rainbow, sun, moon, planets =================
function genRainbow() {
  // 6 muted bands, whole arc at 70 % alpha; soft cloud puffs at both feet hide the ends
  const bands = ['#F2A3A3', '#F7C79A', '#F6E3A0', '#B5DDB0', '#A9CBEE', '#C4B2E6'];
  const cx = 300, cy = 300, R0 = 270, bw = 17;
  let arcs = '';
  bands.forEach((c, i) => { const r = R0 - i * bw - bw / 2; arcs += `<path d="M${f(cx - r)} ${cy}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${cy}" fill="none" stroke="${c}" stroke-width="${bw + 0.6}"/>`; });
  // a thin white inner glow line
  arcs += `<path d="M${f(cx - (R0 - 6 * bw))} ${cy}A${f(R0 - 6 * bw)} ${f(R0 - 6 * bw)} 0 0 1 ${f(cx + R0 - 6 * bw)} ${cy}" fill="none" stroke="#FFFFFF" stroke-width="4" opacity="0.5"/>`;
  let o = `<g opacity="0.7">${arcs}</g>`;
  const foot = (x) => {
    const pu = [[x - 44, 300, 26], [x - 14, 284, 34], [x + 22, 290, 30], [x + 48, 304, 22]];
    return P(pu.map(([a, b, r]) => cp(a, b + 6, r)).join(''), '#E3E6F6') + P(pu.map(([a, b, r]) => cp(a - 1, b, r)).join(''), '#FFFFFF') + ell(x - 20, 266, 14, 6, '#FFFFFF');
  };
  o += foot(cx - R0 + 3 * bw) + foot(cx + R0 - 3 * bw);
  return svg(600, 320, o);
}
function genSun() {
  // pale buttery disc (much lighter than yellow #FFD23F) + soft rounded rays, no face
  const defs = rg('glow', [[0, '#FFF8DE', 0.9], [0.45, '#FFF0C2', 0.45], [1, '#FFF0C2', 0]]) + rg('disc', [[0, '#FFFBE6'], [0.7, '#FFF2C4'], [1, '#FBE6AA']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 90; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFEFC0', 10, ' opacity="0.9"');
  o += circ(100, 100, 55, '#F4E0A6') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFEF6', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
function genMoon() {
  // crescent (big disc minus offset disc via even-odd-free path), gentle radial glow, two soft craters
  const defs = rg('mg', [[0, '#FFF6D8', 0.55], [0.5, '#F3ECFF', 0.22], [1, '#F3ECFF', 0]]);
  let o = circ(100, 100, 98, 'url(#mg)');
  // crescent path: outer arc r=54 centred (100,100), inner arc r=46 centred (124,88)
  // intersection points computed numerically
  const C1 = [100, 100, 54], C2 = [126, 86, 48];
  const [x1, y1, r1] = C1, [x2, y2, r2] = C2;
  const d = Math.hypot(x2 - x1, y2 - y1), a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(r1 * r1 - a * a);
  const mx = x1 + a * (x2 - x1) / d, my = y1 + a * (y2 - y1) / d;
  const pA = [mx + h * (y2 - y1) / d, my - h * (x2 - x1) / d], pB = [mx - h * (y2 - y1) / d, my + h * (x2 - x1) / d];
  const cres = `M${f(pA[0])} ${f(pA[1])}A${r1} ${r1} 0 1 0 ${f(pB[0])} ${f(pB[1])}A${r2} ${r2} 0 0 1 ${f(pA[0])} ${f(pA[1])}Z`;
  o += P(cres, '#F6E6B6') + `<path d="${cres}" fill="#FFF6D6" transform="translate(-3 -2) scale(1)" opacity="0.95"/>`;
  o += `<path d="${cres}" fill="none" stroke="#E8D49A" stroke-width="2.5" stroke-linejoin="round"/>`;
  o += circ(70, 118, 6, '#F1DFAA') + circ(84, 140, 4, '#F1DFAA') + circ(62, 92, 3.5, '#F1DFAA');
  o += ell(66, 78, 9, 4.5, '#FFFFFF', ' opacity="0.7" transform="rotate(-50 66 78)"');
  return svg(200, 200, o, defs);
}
function genPlanet(kind) {
  // distant decorative planets (0 0 160 160), desaturated so they never compete with the answer-coloured island planets
  const S = {
    a: { base: '#B7B2D6', sh: '#9E99C3', hi: '#D2CEE8', line: '#8A85B0', ring: '#D8CFE6', ringSh: '#B9AFD0' },  // ringed lilac
    b: { base: '#A9C7CF', sh: '#8FB0BA', hi: '#C9E0E4', line: '#7C9DA7', band: '#BCD6DC' },                    // banded sea-glass
    c: { base: '#D6BBAF', sh: '#C1A396', hi: '#E9D6CD', line: '#A88B7F', crater: '#C8AA9D' },                  // cratered clay
  }[kind];
  const cx = 80, cy = 80, R = kind === 'a' ? 40 : kind === 'b' ? 50 : 44;
  let o = '';
  const ringBack = `M${cx - 74} ${cy + 6}A74 20 -12 0 1 ${cx + 74} ${cy - 6}`;
  const ringFront = `M${cx - 74} ${cy + 6}A74 20 -12 0 0 ${cx + 74} ${cy - 6}`;
  if (kind === 'a') o += strokeP(ringBack, S.ringSh, 9) + strokeP(ringBack, S.ring, 5);
  o += circ(cx, cy, R, S.base, ` stroke="${S.line}" stroke-width="3"`);
  // shade crescent bottom-right
  const shD = `M${f(cx + R * 0.95)} ${f(cy - R * 0.3)}A${R} ${R} 0 0 1 ${f(cx - R * 0.3)} ${f(cy + R * 0.95)}A${R * 1.05} ${R * 1.05} 0 0 0 ${f(cx + R * 0.95)} ${f(cy - R * 0.3)}Z`;
  if (kind === 'b') {
    o += `<clipPath id="pc"><circle cx="${cx}" cy="${cy}" r="${R - 1.5}"/></clipPath>`;
    o += `<g clip-path="url(#pc)">${P(`M${cx - R} ${cy - 22}Q${cx} ${cy - 30} ${cx + R} ${cy - 18}L${cx + R} ${cy - 8}Q${cx} ${cy - 18} ${cx - R} ${cy - 12}Z`, S.band)}${P(`M${cx - R} ${cy + 8}Q${cx} ${cy} ${cx + R} ${cy + 12}L${cx + R} ${cy + 24}Q${cx} ${cy + 14} ${cx - R} ${cy + 20}Z`, S.band)}</g>`;
  }
  if (kind === 'c') for (const [u, v, r] of [[-14, -10, 9], [14, 14, 7], [-6, 22, 5], [18, -16, 4.5]]) o += circ(cx + u, cy + v, r, S.crater) + `<path d="M${f(cx + u - r)} ${f(cy + v)}a${r} ${r} 0 0 1 ${f(2 * r)} 0" fill="none" stroke="${S.sh}" stroke-width="2"/>`;
  o += P(shD, S.sh, ' opacity="0.8"');
  o += ell(cx - R * 0.4, cy - R * 0.45, R * 0.28, R * 0.14, S.hi, ` opacity="0.9" transform="rotate(-35 ${f(cx - R * 0.4)} ${f(cy - R * 0.45)})"`);
  // the ring's front half passes in front of the planet
  if (kind === 'a') {
    o += `<clipPath id="rf"><path d="M0 ${cy - 4}L160 ${cy - 20}L160 160L0 160Z"/></clipPath>`;
    o += `<g clip-path="url(#rf)">${strokeP(ringFront, S.ringSh, 9)}${strokeP(ringFront, S.ring, 5)}</g>`;
  }
  return svg(160, 160, o);
}

// ================= particles (0 0 32 32, centred; neutral white/grey so code can tint) =================
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#F2F2F2')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#EDEDED" stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFFFF"/>`);
  p.puff = S(`${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#F2F2F4', 0.8], [1, '#E4E4EA', 0]]));
  p.dust = S(circ(16, 16, 9, 'url(#ds)') + circ(16, 16, 3.2, '#FFFFFF'), rg('ds', [[0, '#FFFFFF', 0.9], [0.45, '#FFFFFF', 0.4], [1, '#FFFFFF', 0]]));
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D9D9D9"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#DADADA', 4.4)}${strokeP('M5 19.4Q9 9.4 13 17.4T21 15.4T27 9.4', '#FFFFFF', 2.6)}`);
  return p;
}

// ---------------- write ----------------
function build() {
  const env = { ...genClouds(), cloudbank: genCloudbank(), rainbow: genRainbow(), sun: genSun(), moon: genMoon(), planet_a: genPlanet('a'), planet_b: genPlanet('b'), planet_c: genPlanet('c') };
  for (const m of Object.keys(MOODS)) env['hills_' + m] = genHills(MOODS[m], m);
  return { env, particles: genParticles() };
}
if (require.main === module) {
  const { env, particles } = build();
  const envD = path.join(A, 'env'), parD = path.join(A, 'particles');
  fs.mkdirSync(envD, { recursive: true }); fs.mkdirSync(parD, { recursive: true });
  for (const [k, v] of Object.entries(env)) fs.writeFileSync(path.join(envD, k + '.svg'), v);
  for (const [k, v] of Object.entries(particles)) fs.writeFileSync(path.join(parD, k + '.svg'), v);
  let bad = 0;
  for (const [k, v] of [...Object.entries(env).map(([k, v]) => ['env/' + k, v]), ...Object.entries(particles).map(([k, v]) => ['particles/' + k, v])]) {
    const kb = Buffer.byteLength(v) / 1024, blur = (v.match(/feGaussianBlur/g) || []).length;
    const m = v.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/), okBox = m && m[1] === m[3] && m[2] === m[4];
    const forb = /<text|<script|href=|@import|font|NaN|undefined/.test(v) || blur > 1;
    if (forb || !okBox || kb > 90) bad++;
    console.log(`${k.padEnd(22)} ${kb.toFixed(1)} KB${kb > 90 ? '  TOO BIG' : ''}${forb ? '  FORBIDDEN' : ''}${okBox ? '' : '  BAD VIEWBOX'}`);
  }
  if (bad) { console.error(bad, 'file(s) failed checks'); process.exit(1); }
}
module.exports = { MOODS, build };
