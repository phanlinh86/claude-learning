// Pip's Camp Hide & Seek: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{mountains,forest,meadow}_{spring,summer,autumn,winter}.svg, campfire, bench, tent_bg,
// lantern, sun, cloud_a..c  and  game/assets/default/particles/{petal, leaf_a, leaf_b, snow, seed, sparkle, star, puff,
// dust, confetti_a, confetti_b}.svg                                                                  (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: every object that crosses the left/right edge of a tileable file is drawn again at x±1200 (wrap()); edge
// curves use whole-number periods over 1200 px, so the left and right edges match exactly. The four seasons share ONE
// layout per layer (same seed); only colours and season details (snow caps, blossoms, leaves, snow) change.
// Colour rule (DESIGN §3): everything is calm and less saturated than the answer colours (red #E84A4A, blue #3C8DE8,
// yellow #FFD23F, green #4CC26B, orange #FF9A2E, purple #9B6BE0): mountains blue-grey, hills sage, autumn trees muted
// ochre/rust, the meadow pale sage / straw / snow. The forest's front band uses the meadow's ground colour (GROUND), so
// forest → meadow has no visible seam and the renderer can fill any gap between them with GROUND[season].
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const cp = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`;
const ep = (x, y, rx, ry) => `M${f(x - rx)} ${f(y)}a${f(rx)} ${f(ry)} 0 1 1 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 1 ${f(-2 * rx)} 0Z`;
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
function wrap(x, half, fn) { let o = fn(x, 0); if (x + half > W) o += fn(x - W, 1); if (x - half < 0) o += fn(x + W, 2); return o; }
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
const lgr = (id, stops, extra = '') => `<linearGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';

// ---------------- season palettes (calm, muted) ----------------
// GROUND = the meadow colour = the forest's front band (renderer fills gaps with it).
const GROUND = { spring: '#BED7A2', summer: '#B1CD91', autumn: '#CDC898', winter: '#EEF3F7' };
const PAL = {
  spring: {
    m: { far: '#C7D5E2', farSh: '#B6C6D6', near: '#AEBFD0', nearSh: '#9AADC1', rim: '#91A4B9', snow: '#F6F9FC', snowSh: '#DCE4EE', cap: [0.24, 0.16] },
    fo: { far: '#C6DBBA', farSh: '#B6CFAA', farTree: '#A8C6A2', farTreeSh: '#98B993', mid: '#AFCC98', midSh: '#A1C08A', midLine: '#97B682',
      con: '#7FA58A', conSh: '#6E957A', conHi: '#94B89D', leaf: ['#A6C98E', '#B4D19A', '#EBD0D6'], leafSh: ['#93B97D', '#A1C189', '#D9B9C2'], trunk: '#9A806B', trunkSh: '#836A58', front: GROUND.spring, frontLine: '#ABC891' },
    me: { base: GROUND.spring, hi: '#CCE0B2', rim: '#A6C38C', tuft: '#9FBD86', deco: 'flowers' },
  },
  summer: {
    m: { far: '#BACDDD', farSh: '#A9BED1', near: '#A0B7CB', nearSh: '#8CA4BB', rim: '#839CB3', snow: '#F6F9FC', snowSh: '#DBE4ED', cap: [0.13, 0] },
    fo: { far: '#BCD4B0', farSh: '#ADC9A0', farTree: '#9DC097', farTreeSh: '#8DB387', mid: '#A1C28B', midSh: '#93B67D', midLine: '#88AC74',
      con: '#6F9B7D', conSh: '#5F8B6D', conHi: '#86AE91', leaf: ['#8FBA7B', '#9DC386', '#A9C98C'], leafSh: ['#7DAA69', '#8AB375', '#97BA7A'], trunk: '#957B66', trunkSh: '#7E6654', front: GROUND.summer, frontLine: '#9FBF80' },
    me: { base: GROUND.summer, hi: '#C1DAA4', rim: '#9BBA7E', tuft: '#93B378', deco: 'clover' },
  },
  autumn: {
    m: { far: '#CAC5D3', farSh: '#BAB5C7', near: '#B1ADC1', nearSh: '#9F9AB2', rim: '#958FA9', snow: '#F7F7FA', snowSh: '#DFDDE8', cap: [0.17, 0.08] },
    fo: { far: '#D5D2B9', farSh: '#C8C5A9', farTree: '#C4B994', farTreeSh: '#B6AA85', mid: '#C4BF90', midSh: '#B7B282', midLine: '#ABA677',
      con: '#6F8F7A', conSh: '#5F7F6B', conHi: '#84A28E', leaf: ['#D3B06C', '#C68D69', '#D8C489'], leafSh: ['#BF9A58', '#B07855', '#C5B075'], trunk: '#8F7462', trunkSh: '#785F50', front: GROUND.autumn, frontLine: '#BDB886' },
    me: { base: GROUND.autumn, hi: '#DAD6AB', rim: '#B8B383', tuft: '#ADA878', deco: 'leaves' },
  },
  winter: {
    m: { far: '#DCE5EF', farSh: '#CCD8E6', near: '#C7D5E4', nearSh: '#B3C3D6', rim: '#A9BBD0', snow: '#FAFCFE', snowSh: '#E0E8F1', cap: [0.55, 0.45] },
    fo: { far: '#E5ECF2', farSh: '#D9E2EB', farTree: '#A9BDB8', farTreeSh: '#99AFAA', mid: '#DAE4EC', midSh: '#CBD7E2', midLine: '#BFCDDA',
      con: '#7F9D95', conSh: '#6E8C85', conHi: '#93AFA7', leaf: null, leafSh: null, trunk: '#9E8C7F', trunkSh: '#86766B', snow: '#F8FBFD', snowSh: '#DCE5EE', front: GROUND.winter, frontLine: '#D3DEE8' },
    me: { base: GROUND.winter, hi: '#FAFCFE', rim: '#CFDBE6', tuft: '#B7A88F', deco: 'snow' },
  },
};

// ================= mountains_<s>.svg (0 0 1200 420) =================
function mountainLayout() {
  const r = rng(11);
  const far = [], near = [];
  for (let i = 0; i < 6; i++) far.push({ x: i * 200 + 40 + r() * 120, top: 118 + r() * 70, b: 175 + r() * 55, j: [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5] });
  for (let i = 0; i < 5; i++) near.push({ x: i * 240 + 70 + r() * 100, top: 205 + r() * 55, b: 165 + r() * 50, j: [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5] });
  // taller peaks first so the lower ones overlap them
  far.sort((a, b) => a.top - b.top); near.sort((a, b) => a.top - b.top);
  return { far, near };
}
const MLAY = mountainLayout();
function peakGeom(p, base) {
  const x = p.x, t = p.top, h = base - t, b = p.b;
  const L1 = [x - b * 0.52, t + h * (0.5 + p.j[0] * 0.12)], R1 = [x + b * 0.48, t + h * (0.46 + p.j[1] * 0.12)];
  const body = `M${f(x - b)} ${f(base)}L${f(L1[0])} ${f(L1[1])}L${f(x - 11)} ${f(t + 9)}Q${f(x)} ${f(t - 3)} ${f(x + 11)} ${f(t + 9)}L${f(R1[0])} ${f(R1[1])}L${f(x + b)} ${f(base)}Z`;
  const ridge = [[x + 1, t + 2], [x + b * 0.06, t + h * 0.3], [x - b * 0.04 + p.j[2] * 8, t + h * 0.55], [x + b * 0.12, t + h * 0.8], [x + b * 0.05, base + 4]];
  const shade = poly([...ridge, [x + b + 8, base + 4], [x + b + 8, t - 6], [x + 1, t - 6]]);
  return { body, shade, ridge, h };
}
function capPoly(p, depth) {
  // wide zig-zag band from above the peak to `depth` px below it (clipped by the body)
  const x = p.x, t = p.top, b = p.b, pts = [[x - b, t - 10], [x + b, t - 10]];
  const n = 7;
  for (let i = n; i >= 0; i--) { const u = i / n; pts.push([x + b * (u * 2 - 1) * 0.9, t + depth * (i % 2 ? 0.78 : 1.06) + (i === 3 || i === 4 ? depth * 0.12 : 0)]); }
  return poly(pts);
}
function genMountains(s) {
  const C = PAL[s].m;
  let defs = '', o = '';
  let id = 0;
  const range = (peaks, base, fill, sh, capFrac, rimW) => {
    o += P(`M0 ${base - 50}H${W}V420H0Z`, fill);
    for (const p of peaks) {
      const capD = capFrac > 0 ? (base - p.top) * capFrac : 0;
      o += wrap(p.x, p.b + 10, xx => {
        const q = { ...p, x: xx }, g = peakGeom(q, base + 30), k = id++;
        defs += `<clipPath id="k${k}"><path d="${g.body}"/></clipPath>`;
        let s2 = P(g.body, fill);
        s2 += `<g clip-path="url(#k${k})">${P(g.shade, sh)}`;
        if (capD > 0) {
          defs += `<clipPath id="c${k}"><path d="${capPoly(q, capD)}"/></clipPath>`;
          s2 += `<g clip-path="url(#c${k})">${P(`M${f(xx - p.b - 10)} 0H${f(xx + p.b + 10)}V420H${f(xx - p.b - 10)}Z`, C.snow)}${P(g.shade, C.snowSh)}</g>`;
        }
        s2 += '</g>';
        if (rimW) s2 += strokeP(g.body.replace(/Z$/, ''), C.rim, rimW, ' opacity="0.45"');
        return s2;
      });
    }
  };
  range(MLAY.far, 420, C.far, C.farSh, C.cap[0], 0);
  range(MLAY.near, 420, C.near, C.nearSh, C.cap[1], 2.5);
  // soft haze at the foot (the forest covers the bottom anyway)
  defs += `<linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.far}" stop-opacity="0"/><stop offset="1" stop-color="${C.far}" stop-opacity="0.65"/></linearGradient>`;
  o += `<rect x="0" y="330" width="${W}" height="90" fill="url(#hz)"/>`;
  return svg(1200, 420, o, defs);
}

// ================= forest_<s>.svg (0 0 1200 360) =================
function forestLayout() {
  const r = rng(23);
  const far = [], mid = [], front = [], farTrees = [], midTrees = [];
  for (let i = 0; i < 6; i++) far.push({ x: i * 200 + 50 + r() * 100, top: 146 + r() * 34, rx: 150 + r() * 50 });
  for (let i = 0; i < 5; i++) mid.push({ x: i * 240 + 40 + r() * 120, top: 200 + r() * 30, rx: 170 + r() * 50 });
  for (let i = 0; i < 4; i++) front.push({ x: i * 300 + 80 + r() * 140, top: 288 + r() * 16, rx: 230 + r() * 60 });
  // far: dense little conifers in clusters
  for (let i = 0; i < 34; i++) farTrees.push({ x: r() * W, s: 0.36 + r() * 0.16, kind: r() < 0.75 ? 'con' : 'leaf', c: Math.floor(r() * 3) });
  // mid: groves with gaps (calm space)
  const groves = [[60, 5], [330, 4], [560, 3], [800, 5], [1060, 4]];
  for (const [gx, n] of groves) for (let i = 0; i < n; i++) midTrees.push({ x: gx + (i - n / 2) * 34 + (r() - 0.5) * 20, s: 0.62 + r() * 0.32, kind: r() < 0.5 ? 'con' : 'leaf', c: Math.floor(r() * 3), dy: r() * 10 });
  farTrees.sort((a, b) => a.s - b.s); midTrees.sort((a, b) => a.dy - b.dy);
  return { far, mid, front, farTrees, midTrees };
}
const FLAY = forestLayout();
function surfY(bumps, x, base) {
  let y = base;
  for (const b of bumps) for (const dx of [0, -W, W]) {
    const u = (x - (b.x + dx)) / b.rx; if (Math.abs(u) < 1) { const ry = base - b.top; y = Math.min(y, base - ry * Math.sqrt(1 - u * u)); }
  }
  return y;
}
function band(bumps, base) {
  let fill = `M0 ${base}H${W}V360H0Z`, hi = '';
  for (const b of bumps) {
    const ry = base - b.top;
    fill += wrap(b.x, b.rx, x => ep(x, base, b.rx, ry));
    hi += wrap(b.x, b.rx, x => `M${f(x - b.rx * 0.7)} ${f(base - ry * 0.55)}Q${f(x - b.rx * 0.45)} ${f(b.top + ry * 0.04)} ${f(x - b.rx * 0.02)} ${f(b.top + ry * 0.07)}Q${f(x - b.rx * 0.4)} ${f(b.top + ry * 0.2)} ${f(x - b.rx * 0.7)} ${f(base - ry * 0.55)}Z`);
  }
  const pts = []; for (let x = 0; x <= W; x += 6) pts.push([x, surfY(bumps, x, base)]);
  return { fill, hi, rim: line(pts) };
}
function conifer(x, y, s, c, sh, hi, trunk, snow) {
  let o = P(poly([[x - 4 * s, y + 2], [x - 3 * s, y - 16 * s], [x + 3 * s, y - 16 * s], [x + 4 * s, y + 2]]), trunk);
  for (let i = 0; i < 3; i++) {
    const w = (34 - i * 8) * s, yb = y - 10 * s - i * 25 * s, yt = yb - 40 * s;
    const body = `M${f(x - w)} ${f(yb)}L${f(x - 4 * s)} ${f(yt + 3 * s)}Q${f(x)} ${f(yt - 2 * s)} ${f(x + 4 * s)} ${f(yt + 3 * s)}L${f(x + w)} ${f(yb)}Q${f(x)} ${f(yb + 7 * s)} ${f(x - w)} ${f(yb)}Z`;
    o += P(body, c);
    o += P(`M${f(x + 1 * s)} ${f(yt + 1 * s)}L${f(x + 4 * s)} ${f(yt + 3 * s)}L${f(x + w)} ${f(yb)}Q${f(x + w * 0.5)} ${f(yb + 5.5 * s)} ${f(x + w * 0.05)} ${f(yb + 6.8 * s)}Z`, sh);
    if (hi && i === 2) o += P(`M${f(x - 3 * s)} ${f(yt + 6 * s)}L${f(x - w * 0.55)} ${f(yb - 4 * s)}L${f(x - w * 0.35)} ${f(yb - 4 * s)}Z`, hi, ' opacity="0.7"');
    if (snow) {
      const d = 17 * s;
      o += P(`M${f(x - w * 0.42)} ${f(yt + d)}L${f(x - 3.5 * s)} ${f(yt + 3 * s)}Q${f(x)} ${f(yt - 2 * s)} ${f(x + 3.5 * s)} ${f(yt + 3 * s)}L${f(x + w * 0.42)} ${f(yt + d)}Q${f(x + w * 0.25)} ${f(yt + d - 5 * s)} ${f(x + w * 0.1)} ${f(yt + d + 2 * s)}Q${f(x - w * 0.12)} ${f(yt + d - 5 * s)} ${f(x - w * 0.42)} ${f(yt + d)}Z`, snow[0]);
      o += P(`M${f(x - w * 0.88)} ${f(yb - 1)}Q${f(x)} ${f(yb + 5 * s)} ${f(x + w * 0.88)} ${f(yb - 1)}Q${f(x)} ${f(yb + 1 * s)} ${f(x - w * 0.88)} ${f(yb - 1)}Z`, snow[1]);
    }
  }
  return o;
}
function broadleaf(x, y, s, c, sh, trunk, trunkSh, hiCol) {
  let o = P(`M${f(x - 5 * s)} ${f(y + 2)}Q${f(x - 3 * s)} ${f(y - 18 * s)} ${f(x - 2.5 * s)} ${f(y - 36 * s)}L${f(x + 2.5 * s)} ${f(y - 36 * s)}Q${f(x + 3 * s)} ${f(y - 18 * s)} ${f(x + 5 * s)} ${f(y + 2)}Z`, trunk);
  o += P(`M${f(x + 0.5 * s)} ${f(y + 2)}Q${f(x + 1 * s)} ${f(y - 18 * s)} ${f(x + 0.8 * s)} ${f(y - 36 * s)}L${f(x + 2.5 * s)} ${f(y - 36 * s)}Q${f(x + 3 * s)} ${f(y - 18 * s)} ${f(x + 5 * s)} ${f(y + 2)}Z`, trunkSh);
  const puffs = [[-15, -44, 16], [14, -46, 17], [0, -62, 20], [-2, -40, 15]];
  o += P(puffs.map(([u, v, r]) => cp(x + u * s, y + v * s, r * s)).join(''), sh);
  o += P(puffs.map(([u, v, r]) => cp(x + (u - 2.5) * s, y + (v - 3.5) * s, r * 0.86 * s)).join(''), c);
  if (hiCol) o += ell(x - 7 * s, y - 70 * s, 6 * s, 3.4 * s, hiCol, ` opacity="0.55" transform="rotate(-25 ${f(x - 7 * s)} ${f(y - 70 * s)})"`);
  return o;
}
function bareTree(x, y, s, trunk, trunkSh, snow) {
  let o = P(`M${f(x - 5 * s)} ${f(y + 2)}Q${f(x - 3 * s)} ${f(y - 24 * s)} ${f(x - 2 * s)} ${f(y - 44 * s)}L${f(x + 2 * s)} ${f(y - 44 * s)}Q${f(x + 3 * s)} ${f(y - 24 * s)} ${f(x + 5 * s)} ${f(y + 2)}Z`, trunk);
  const br = `M${f(x)} ${f(y - 26 * s)}Q${f(x - 10 * s)} ${f(y - 36 * s)} ${f(x - 18 * s)} ${f(y - 56 * s)}M${f(x - 10 * s)} ${f(y - 40 * s)}L${f(x - 4 * s)} ${f(y - 58 * s)}M${f(x + 1 * s)} ${f(y - 32 * s)}Q${f(x + 12 * s)} ${f(y - 42 * s)} ${f(x + 17 * s)} ${f(y - 60 * s)}M${f(x + 11 * s)} ${f(y - 44 * s)}L${f(x + 22 * s)} ${f(y - 50 * s)}M${f(x)} ${f(y - 44 * s)}L${f(x + 2 * s)} ${f(y - 66 * s)}`;
  o += strokeP(br, trunk, 3.6 * s) + strokeP(`M${f(x + 1.5 * s)} ${f(y)}L${f(x + 1.5 * s)} ${f(y - 40 * s)}`, trunkSh, 2 * s);
  o += ell(x - 18 * s, y - 57 * s, 5 * s, 2.6 * s, snow) + ell(x + 17 * s, y - 61 * s, 5 * s, 2.6 * s, snow) + ell(x + 2 * s, y - 67 * s, 4.5 * s, 2.4 * s, snow) + ell(x - 6 * s, y - 41 * s, 6 * s, 2.4 * s, snow);
  return o;
}
function genForest(s) {
  const C = PAL[s].fo, L = FLAY, wint = s === 'winter';
  let o = '';
  const far = band(L.far, 250);
  o += P(far.fill, C.far) + P(far.hi, '#FFFFFF', ' opacity="0.12"');
  for (const t of L.farTrees) {
    const y = surfY(L.far, t.x, 250) + 6;
    o += wrap(t.x, 30, xx => t.kind === 'con' || wint
      ? conifer(xx, y, t.s, C.farTree, C.farTreeSh, null, C.farTreeSh, wint ? [C.snow, C.snow] : null)
      : broadleaf(xx, y, t.s, C.farTree, C.farTreeSh, C.farTreeSh, C.farTreeSh, null));
  }
  const mid = band(L.mid, 300);
  o += P(mid.fill, C.mid) + P(mid.hi, '#FFFFFF', ' opacity="0.16"') + strokeP(mid.rim, C.midLine, 2.5, ' opacity="0.6"');
  for (const t of L.midTrees) {
    const y = surfY(L.mid, t.x, 300) + 8 + t.dy;
    o += wrap(t.x, 40, xx => {
      if (t.kind === 'con') return conifer(xx, y, t.s, C.con, C.conSh, C.conHi, C.trunk, wint ? [C.snow, C.snowSh] : null);
      if (wint) return bareTree(xx, y, t.s, C.trunk, C.trunkSh, C.snow);
      return broadleaf(xx, y, t.s, C.leaf[t.c], C.leafSh[t.c], C.trunk, C.trunkSh, '#FFFFFF');
    });
  }
  const fr = band(L.front, 360);
  o += P(fr.fill, C.front) + strokeP(fr.rim, C.frontLine, 3, ' opacity="0.8"');
  return svg(1200, 360, o);
}

// ================= meadow_<s>.svg (0 0 1200 300) =================
const TAU = Math.PI * 2;
const edgeY = x => 40 + 9 * Math.sin(TAU * x / W * 2 + 0.7) + 6 * Math.sin(TAU * x / W * 3 + 1.9) + 3 * Math.sin(TAU * x / W * 7 + 0.3);
function meadowLayout() {
  const r = rng(57);
  const tufts = [], decos = [], fringe = [];
  for (let i = 0; i < 46; i++) tufts.push({ x: r() * W, v: r(), s: 0.8 + r() * 0.6 });
  for (let i = 0; i < 64; i++) decos.push({ x: r() * W, v: r(), s: 0.8 + r() * 0.5, c: Math.floor(r() * 3), a: r() * 360 });
  for (let x = 6; x < W; x += 15 + Math.floor(r() * 3) * 0) fringe.push({ x: x + (r() - 0.5) * 6, h: 5 + r() * 6, l: r() < 0.5 });
  return { tufts, decos, fringe };
}
const MEL = meadowLayout();
function tuft(x, y, s, col) {
  return strokeP(`M${f(x - 7 * s)} ${f(y - 7 * s)}Q${f(x - 3 * s)} ${f(y - 2 * s)} ${f(x - 1 * s)} ${f(y)}M${f(x)} ${f(y - 11 * s)}L${f(x)} ${f(y)}M${f(x + 7 * s)} ${f(y - 8 * s)}Q${f(x + 3 * s)} ${f(y - 2 * s)} ${f(x + 1 * s)} ${f(y)}`, col, 2.4 * s);
}
function genMeadow(s) {
  const C = PAL[s].me, L = MEL;
  let o = '', defs = '';
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, edgeY(x)]);
  o += P(line(pts) + `L${W} 300L0 300Z`, C.base);
  // soft light band just under the edge
  const hiPts = pts.map(([x, y]) => [x, y + 3]), loPts = pts.map(([x, y]) => [x, y + 24]).reverse();
  o += P(poly([...hiPts, ...loPts]), C.hi, ' opacity="0.7"');
  // rim + grass fringe (or a smooth snow lip in winter)
  if (C.deco === 'snow') {
    o += strokeP(line(pts), C.rim, 3);
    defs += `<linearGradient id="sd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCE6F0" stop-opacity="0"/><stop offset="1" stop-color="#DCE6F0" stop-opacity="0.55"/></linearGradient>`;
    o += `<rect x="0" y="200" width="${W}" height="100" fill="url(#sd)"/>`;
  } else {
    let fr = '';
    for (const b of L.fringe) {
      const y = edgeY(b.x) + 2;
      fr += wrap(b.x, 6, xx => `M${f(xx - 4)} ${f(y)}Q${f(xx + (b.l ? -2 : 2))} ${f(y - b.h * 0.6)} ${f(xx + (b.l ? -3 : 3))} ${f(y - b.h)}Q${f(xx + (b.l ? 1 : -1))} ${f(y - b.h * 0.4)} ${f(xx + 4)} ${f(y)}Z`);
    }
    o += P(fr, C.base) + strokeP(line(pts), C.rim, 2.5, ' opacity="0.75"');
  }
  // tufts (sparse, calm)
  for (const t of L.tufts) {
    const y = edgeY(t.x) + 34 + t.v * 230; if (y > 292) continue;
    o += wrap(t.x, 10, xx => tuft(xx, y, t.s * (s === 'winter' ? 0.8 : 1), C.tuft));
  }
  // season details
  for (const [i, d] of L.decos.entries()) {
    const y = edgeY(d.x) + 30 + d.v * 236; if (y > 294) continue;
    if (C.deco === 'flowers' && i % 2 === 0) {
      const cols = ['#FFFFFF', '#F6DCE3', '#FBF1CC'][d.c];
      o += wrap(d.x, 10, xx => { let q = ''; for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + d.a; q += circ(xx + Math.cos(a) * 3.6 * d.s, y + Math.sin(a) * 3.6 * d.s, 2.8 * d.s, cols); } return q + circ(xx, y, 1.9 * d.s, '#E9D59A'); });
    } else if (C.deco === 'clover' && i % 2 === 0) {
      if (d.c === 0) o += wrap(d.x, 10, xx => { let q = ''; for (let k = 0; k < 8; k++) { const a = k * TAU / 8; q += ell(xx + Math.cos(a) * 3.8 * d.s, y + Math.sin(a) * 3.8 * d.s, 2.6 * d.s, 1.7 * d.s, '#FFFFFF', ` transform="rotate(${f(k * 45)} ${f(xx + Math.cos(a) * 3.8 * d.s)} ${f(y + Math.sin(a) * 3.8 * d.s)})"`); } return q + circ(xx, y, 2.2 * d.s, '#EFD98E'); });
      else o += wrap(d.x, 10, xx => [0, 1, 2].map(k => { const a = -Math.PI / 2 + k * TAU / 3; return circ(xx + Math.cos(a) * 3.3 * d.s, y + Math.sin(a) * 3.3 * d.s, 3.2 * d.s, '#9DBE80'); }).join(''));
    } else if (C.deco === 'leaves' && i % 3 !== 2) {
      const ls = d.s * 1.5;
      const [c, cd] = [['#D2B06E', '#B9965A'], ['#C79473', '#AE7B5C'], ['#D6C48E', '#BDAA77']][d.c];
      o += wrap(d.x, 14, xx => `<g transform="rotate(${f(d.a)} ${f(xx)} ${f(y)})">${P(`M${f(xx - 7 * ls)} ${f(y)}Q${f(xx)} ${f(y - 5.5 * ls)} ${f(xx + 7 * ls)} ${f(y)}Q${f(xx)} ${f(y + 5.5 * ls)} ${f(xx - 7 * ls)} ${f(y)}Z`, c)}${strokeP(`M${f(xx - 6 * ls)} ${f(y)}L${f(xx + 6 * ls)} ${f(y)}`, cd, 1.1)}</g>`);
    } else if (C.deco === 'snow') {
      if (i % 3 === 0) o += wrap(d.x, 30, xx => ell(xx, y, 26 * d.s, 4 * d.s, '#DFE8F1', ' opacity="0.8"'));
      else if (i % 3 === 1 && i % 2 === 0) o += wrap(d.x, 6, xx => circ(xx, y, 1.6, '#FFFFFF') + circ(xx + 9, y - 3, 1.1, '#FFFFFF'));
    }
  }
  return svg(1200, 300, o, defs);
}

// ================= campfire.svg (0 0 200 140, anchor (100,132)) =================
function genCampfire() {
  const st = { c: '#A9A49C', sh: '#8F8A82', hi: '#C3BFB8', ln: '#6F6A63' };
  const stone = (x, y, rx, ry) => ell(x, y, rx, ry, st.c, ` stroke="${st.ln}" stroke-width="3"`) + P(`M${f(x - rx * 0.85)} ${f(y + ry * 0.2)}Q${f(x)} ${f(y + ry * 1.15)} ${f(x + rx * 0.85)} ${f(y + ry * 0.2)}Q${f(x)} ${f(y + ry * 0.75)} ${f(x - rx * 0.85)} ${f(y + ry * 0.2)}Z`, st.sh) + ell(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.25, st.hi, ' opacity="0.8"');
  const wd = { c: '#9A6B4A', sh: '#7F553A', ln: '#5E3D29', end: '#DDB98E', ring: '#B88B60' };
  const log = (x1, y1, x2, y2, r) => {
    // rounded log: outline stroke, wood stroke, a shade stroke along the lower side, bark lines, end grain at (x2, y2)
    const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a), ny = Math.cos(a), dg = a * 180 / Math.PI;
    const seg = `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
    let o = strokeP(seg, wd.ln, 2 * r + 5) + strokeP(seg, wd.c, 2 * r);
    o += strokeP(`M${f(x1 + nx * r * 0.45)} ${f(y1 + ny * r * 0.45)}L${f(x2 + nx * r * 0.45)} ${f(y2 + ny * r * 0.45)}`, wd.sh, r * 0.8);
    o += strokeP(`M${f(x1 + (x2 - x1) * 0.25 - nx * r * 0.3)} ${f(y1 + (y2 - y1) * 0.25 - ny * r * 0.3)}l${f((x2 - x1) * 0.22)} ${f((y2 - y1) * 0.22)}M${f(x1 + (x2 - x1) * 0.55 + nx * r * 0.1)} ${f(y1 + (y2 - y1) * 0.55 + ny * r * 0.1)}l${f((x2 - x1) * 0.18)} ${f((y2 - y1) * 0.18)}`, wd.sh, 1.8);
    o += ell(x2, y2, r * 0.6, r + 1, wd.end, ` stroke="${wd.ln}" stroke-width="2.6" transform="rotate(${f(dg)} ${f(x2)} ${f(y2)})"`) + ell(x2, y2, r * 0.28, r * 0.5, 'none', ` stroke="${wd.ring}" stroke-width="1.5" transform="rotate(${f(dg)} ${f(x2)} ${f(y2)})"`);
    return o;
  };
  let o = ell(100, 128, 86, 11, '#000000', ' opacity="0.10"');
  // back stones
  o += stone(46, 110, 17, 11) + stone(78, 102, 16, 10) + stone(122, 102, 16, 10) + stone(154, 110, 17, 11);
  // ash bed + ember glow (flames are drawn by code above (100, 92))
  o += ell(100, 112, 50, 12, '#6E6259') + ell(100, 110, 36, 8, '#E9A866', ' opacity="0.55"') + ell(100, 109, 20, 5, '#F7D08E', ' opacity="0.7"');
  // crossed logs (teepee-ish X): lower ends hide behind the front stones, upper end grains stick out
  o += log(52, 120, 136, 84, 9.5) + log(148, 120, 64, 84, 9.5);
  // front stones
  o += stone(30, 122, 18, 11) + stone(66, 126, 19, 11) + stone(100, 128, 19, 10) + stone(134, 126, 19, 11) + stone(170, 122, 18, 11);
  return svg(200, 140, o);
}

// ================= bench.svg (0 0 360 90, anchor (180,84)) =================
function genBench() {
  const wd = { c: '#A57A57', sh: '#8B6345', ln: '#634430', top: '#D9B88F', topSh: '#C9A47A', ring: '#B88E65', end: '#E2C49C' };
  let o = ell(180, 84, 170, 6, '#000000', ' opacity="0.10"');
  // stump legs
  for (const x of [72, 288]) {
    o += P(`M${x - 26} 84L${x - 23} 42H${x + 23}L${x + 26} 84Z`, wd.c, ` stroke="${wd.ln}" stroke-width="3.5" stroke-linejoin="round"`);
    o += P(`M${x + 6} 82L${x + 8} 44H${x + 22}L${x + 24} 82Z`, wd.sh);
    o += strokeP(`M${x - 12} 50L${x - 13} 76M${x - 2} 48L${x - 2} 80`, wd.sh, 2.2);
  }
  // split log seat (bark side + flat light top)
  o += P('M18 42Q14 28 26 24H334Q346 28 342 42Q340 56 326 58H34Q20 56 18 42Z', wd.c, ` stroke="${wd.ln}" stroke-width="4" stroke-linejoin="round"`);
  o += P('M22 46Q24 56 34 57H326Q338 56 340 46Q300 52 180 52Q60 52 22 46Z', wd.sh);
  o += P('M28 24H332Q322 32 300 33H60Q38 32 28 24Z', wd.top, ` stroke="${wd.ln}" stroke-width="2.5" stroke-linejoin="round"`);
  o += strokeP('M80 28H150M190 29H270', wd.topSh, 2);
  o += strokeP('M70 44Q90 41 110 45M200 46Q230 42 262 46M140 40Q150 38 160 41', wd.sh, 2.4);
  // end grain
  for (const [x, s] of [[24, 1], [336, -1]]) {
    o += ell(x, 40, 9, 16, wd.end, ` stroke="${wd.ln}" stroke-width="3"`) + ell(x, 40, 5, 9, 'none', ` stroke="${wd.ring}" stroke-width="1.6"`) + circ(x, 40, 1.6, wd.ring);
    void s;
  }
  // a little moss tuft
  o += P('M240 25Q246 18 252 24Q257 19 262 25Z', '#9FB98A');
  return svg(360, 90, o);
}

// ================= tent_bg.svg (0 0 260 200) =================
function genTent() {
  const T = { c: '#DCCFB4', sh: '#C3B497', ln: '#8E8068', hi: '#EAE1CD', door: '#8F806B', doorSh: '#77695A', flap: '#CDBF9F', rope: '#A8977C', peg: '#7A6B58' };
  let o = ell(130, 194, 118, 7, '#000000', ' opacity="0.10"');
  // guy ropes + pegs
  o += strokeP('M128 34L18 192M134 34L246 192', T.rope, 2) + P('M14 186h8l-3 9h-2Z', T.peg) + P('M242 186h8l-3 9h-2Z', T.peg);
  // body (A-frame seen from the front, slight 3/4 side on the right)
  o += P('M130 30L34 192H226Z', T.c, ` stroke="${T.ln}" stroke-width="4" stroke-linejoin="round"`);
  o += P('M130 30L226 192H186Z', T.sh);
  o += P('M130 30L238 186L226 192Z', T.sh, ` stroke="${T.ln}" stroke-width="3" stroke-linejoin="round"`);
  o += P('M126 40L74 132L86 132Z', T.hi, ' opacity="0.8"');
  // door opening + tied-back flap
  o += P('M130 82L96 192H164Z', T.door) + P('M130 82L164 192H146Z', T.doorSh);
  o += P('M130 82L96 192H112Q118 150 130 82Z', T.flap, ` stroke="${T.ln}" stroke-width="2.5" stroke-linejoin="round"`);
  o += strokeP('M108 150Q114 148 118 152', T.ln, 2.4);
  // ridge pole tip + seam line + ground hem
  o += strokeP('M130 30L130 18', T.ln, 4) + circ(130, 16, 4, T.peg);
  o += strokeP('M38 188H224', T.ln, 3, ' opacity="0.6"');
  // a tiny pennant on the pole (muted sage, never an answer colour)
  o += P('M131 18L150 23L131 28Z', '#A9BF9A', ` stroke="${T.ln}" stroke-width="1.5" stroke-linejoin="round"`);
  return svg(260, 200, o);
}

// ================= lantern.svg (0 0 48 80) =================
function genLantern() {
  const m = { c: '#6F6A66', sh: '#57524F', hi: '#8C8783' };
  const defs = rg('lg', [[0, '#FFF6D6', 1], [0.6, '#FFE3A3', 0.95], [1, '#F2C77A', 0.9]], ' cx="0.45" cy="0.45" r="0.6"') + rg('lh', [[0, '#FFE9B0', 0.5], [1, '#FFE9B0', 0]]);
  let o = circ(24, 46, 23, 'url(#lh)');
  o += strokeP('M24 2a6 6 0 1 1 -0.1 0', m.c, 3);         // hook ring
  o += strokeP('M24 14V18', m.c, 3);
  o += P('M12 26Q12 18 24 18Q36 18 36 26Z', m.c, ` stroke="${m.sh}" stroke-width="2" stroke-linejoin="round"`); // cap
  o += P('M14 28H34Q38 46 34 64H14Q10 46 14 28Z', 'url(#lg)', ` stroke="${m.sh}" stroke-width="2.4" stroke-linejoin="round"`); // glass
  o += strokeP('M24 28V64M14.5 46H33.5', m.c, 2, ' opacity="0.7"');
  o += P('M17 32Q15 40 16 48', 'none', ' stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity="0.7"');
  o += ell(24, 47, 3.6, 5.5, '#FFF9E6');                  // little flame core
  o += P('M10 64H38Q38 72 30 74H18Q10 72 10 64Z', m.c, ` stroke="${m.sh}" stroke-width="2" stroke-linejoin="round"`); // base
  o += strokeP('M14 70H34', m.hi, 1.6);
  return svg(48, 80, o, defs);
}

// ================= sun + clouds =================
function genSun() {
  const defs = rg('glow', [[0, '#FFF8DE', 0.9], [0.45, '#FFF0C2', 0.45], [1, '#FFF0C2', 0]]) + rg('disc', [[0, '#FFFBE6'], [0.7, '#FFF2C4'], [1, '#FBE6AA']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 90; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFEFC0', 10, ' opacity="0.9"');
  o += circ(100, 100, 55, '#F4E0A6') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFEF6', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
const CL = { base: '#FFFFFF', sh: '#E8ECF5', sh2: '#DCE2EF', rim: '#D0D8E8' };
function cloudShape(puffs, bottom) {
  const left = puffs.reduce((m, p) => (p[0] - p[2] < m[0] - m[2] ? p : m)), right = puffs.reduce((m, p) => (p[0] + p[2] > m[0] + m[2] ? p : m));
  const hb = 36, x0 = left[0] - left[2] * 0.55, x1 = right[0] + right[2] * 0.55;
  return puffs.map(([x, y, r]) => cp(x, y, r)).join('') + `M${f(x0 + hb / 2)} ${f(bottom - hb)}H${f(x1 - hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${hb}H${f(x0 + hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${-hb}Z`;
}
function genCloud(puffs, bottom) {
  const d = cloudShape(puffs, bottom);
  let o = `<clipPath id="cc"><path d="${d}"/></clipPath>`;
  o += `<path d="${d}" fill="${CL.sh2}" stroke="${CL.rim}" stroke-width="3" stroke-linejoin="round"/>`;
  o += `<g clip-path="url(#cc)"><path d="${d}" fill="${CL.sh}" transform="translate(0 -6)"/><path d="${d}" fill="${CL.base}" transform="translate(0 -13)"/></g>`;
  return svg(320, 170, o);
}
const genClouds = () => ({
  cloud_a: genCloud([[70, 108, 34], [124, 82, 46], [186, 74, 52], [242, 100, 38], [160, 114, 36]], 150),
  cloud_b: genCloud([[56, 118, 26], [98, 100, 36], [150, 98, 40], [204, 104, 32], [254, 118, 24]], 148),
  cloud_c: genCloud([[84, 104, 38], [142, 70, 56], [204, 86, 44], [248, 112, 30], [130, 116, 34]], 152),
});

// ================= particles (0 0 32 32, centred) =================
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  // season particles: own colours (muted)
  p.petal = S(P('M16 3Q25 9 24 19Q22 28 16 29Q10 28 8 19Q7 9 16 3Z', '#F5C6D3', ' stroke="#DDA2B4" stroke-width="1.6"') + P('M16 3Q14 7 16 9Q18 7 16 3Z', '#DDA2B4') + P('M12 13Q12 20 15 24', 'none', ' stroke="#FCE4EB" stroke-width="2.4" stroke-linecap="round"'));
  p.leaf_a = S(`<g transform="rotate(-20 16 16)">${P('M16 2Q26 8 26 17Q25 26 16 29Q7 26 6 17Q6 8 16 2Z', '#D3AD63', ' stroke="#A8853F" stroke-width="1.8"')}${strokeP('M16 5V30M16 13L11 9M16 13L21 9M16 20L10 16M16 20L22 16', '#A8853F', 1.4)}</g>`);
  // a soft three-lobed maple-ish leaf
  p.leaf_b = S(`<g transform="rotate(15 16 16)">${P('M16 3Q19 7 19 10Q23 7 27 9Q25 13 23 15Q27 17 27 20Q22 21 19 20Q19 24 16 26Q13 24 13 20Q10 21 5 20Q5 17 9 15Q7 13 5 9Q9 7 13 10Q13 7 16 3Z', '#C58A66', ' stroke="#995F42" stroke-width="1.6" stroke-linejoin="round"')}${strokeP('M16 8V30M16 17L9 12M16 17L23 12', '#995F42', 1.3)}</g>`);
  p.snow = S(circ(16, 16, 14, 'url(#sn)') + circ(16, 16, 6.5, '#FFFFFF') + strokeP('M16 10.5V21.5M11.2 13.2L20.8 18.8M11.2 18.8L20.8 13.2', '#E3ECF5', 1.2), rg('sn', [[0, '#FFFFFF', 0.9], [0.5, '#F4F8FC', 0.5], [1, '#EAF1F8', 0]]));
  let rays = ''; for (let i = 0; i < 11; i++) { const a = -Math.PI * 0.95 + i * Math.PI * 0.9 / 10; rays += `M16 14L${f(16 + Math.cos(a) * 10)} ${f(14 + Math.sin(a) * 9)}`; }
  p.seed = S(strokeP(rays, '#FFFFFF', 1.3) + strokeP(rays, '#E6E3DA', 0.5) + strokeP('M16 14V26', '#D9D2C3', 1.3) + ell(16, 27, 1.6, 2.6, '#A89577'));
  // tinted-by-code particles (neutral white/grey)
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
  const env = { ...genClouds(), sun: genSun(), campfire: genCampfire(), bench: genBench(), tent_bg: genTent(), lantern: genLantern() };
  for (const s of SEASONS) { env['mountains_' + s] = genMountains(s); env['forest_' + s] = genForest(s); env['meadow_' + s] = genMeadow(s); }
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
    if (forb || !okBox || kb > 120) bad++;
    console.log(`${k.padEnd(24)} ${kb.toFixed(1)} KB${kb > 120 ? '  TOO BIG' : ''}${forb ? '  FORBIDDEN' : ''}${okBox ? '' : '  BAD VIEWBOX'}`);
  }
  if (bad) { console.error(bad, 'file(s) failed checks'); process.exit(1); }
}
module.exports = { PAL, GROUND, SEASONS, build };
