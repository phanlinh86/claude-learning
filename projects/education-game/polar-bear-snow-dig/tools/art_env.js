// Nuka's Snow Dig: arctic-snowfield environment + particle art generator (100 % original, hand-laid flat-cartoon SVG).
// Writes game/assets/default/env/{far,mid,ground}_{spring,summer,autumn,winter}.svg, env/{sun,moon,cloud_a,cloud_b}.svg
// and game/assets/default/particles/{snow,sand,dust,petal,fluff,leaf_a,leaf_b,sparkle,star,mote,confetti_a,confetti_b,
// dot,feather}.svg. Old env files (morning/noon/sunset/night layers, smoke) and any other particle file are deleted.
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js      (DESIGN §4.3)
//
// Tiling: every layer is 1200 wide. Height fields are sums of periodic bumps whose distance is measured modulo 1200,
// and every prop that crosses x = 0 / 1200 is drawn twice (at x and x -/+ 1200), so both edges match pixel for pixel.
// Colour rule (DESIGN §3): calm, slightly desaturated arctic; no answer hue (red/blue/yellow/green/orange/purple/pink)
// in a saturated form anywhere. The dig-site snow is a touch darker / bluer than the code-drawn drifts (#F4F8FC; winter
// #C9D6EA) so the drifts separate from the ground.
//
// Layer anchors (see env_scenes.js envLayout() for the screen maths):
//   far    0 0 1200 720 : snowy mountain ranges (peaks from y ≈ 310), the sea from SEA_Y = 572 down, icebergs and floes;
//                         above the peaks it is transparent. FAR_BASE = 690 sits on the dig-site horizon (sandY).
//                         FAR_ANCHOR = the summit of the big twin peak (268, 272), the render places it at a screen fraction.
//   mid    0 0 1200 300 : a continuous low snow bank (the near shore), ice ridges, an igloo, a stone stack, tundra
//                         tufts, rocks; bases on MID_BASE = 290.
//   ground 0 0 1200 260 : the snowy dig site. Transparent above a soft fluffy edge (y ≈ 14…34); GROUND_LINE = 30 is the
//                         nominal horizon; the snow fades to GROUND_BOTTOM[m] at the bottom row (render fills below).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['spring', 'summer', 'autumn', 'winter'];
const FAR_BASE = 690, MID_BASE = 290, GROUND_LINE = 30, SEA_Y = 572;
const FAR_ANCHOR = { x: 268, y: 272 };   // the big twin peak's summit = highest far pixel (far-tile coords) — envLayout puts it at a screen fraction
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
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = '') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
const V = ' x1="0" y1="0" x2="0" y2="1"';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) once, plus a wrapped copy if it crosses an edge (half = half width of the thing)
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pd = (x, c) => { const d = Math.abs(x - c) % W; return Math.min(d, W - d); };
const sd = (x, c) => { let d = (x - c) % W; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };   // signed periodic
// periodic height field: base + Σ h·bump(dist / w); kinds: gaussian (default), 'peak' (pointed, rounded tip)
const field = (bumps, base) => x => base + bumps.reduce((s, [c, h, w, kind]) => {
  const d = pd(x, c) / w;
  return s + h * (kind === 'peak' ? Math.exp(-Math.pow(d * d + 0.004, 0.62)) : Math.exp(-d * d));
}, 0);
const fillUnder = (y, yb, step = 4) => { const p = [[0, yb]]; for (let x = 0; x <= W; x += step) p.push([x, y(x)]); p.push([W, yb]); return poly(p); };
const band = (yTop, yBot, step = 4) => { const p = []; for (let x = 0; x <= W; x += step) p.push([x, yTop(x)]); for (let x = W; x >= 0; x -= step) p.push([x, yBot(x)]); return poly(p); };
const edge = (y, dy = 0, step = 4) => { const p = []; for (let x = 0; x <= W; x += step) p.push([x, y(x) + dy]); return line(p); };

// ---------------- palettes ----------------
// sky gradient stops per mood (render paints them from y 0 to the dig-site horizon sandY; below that, the last stop)
const SKY = {
  spring: [[0, '#BFE3F5'], [1, '#EAF6FB']],
  summer: [[0, '#86CBEF'], [1, '#D4EEF8']],
  autumn: [[0, '#C6A9C4'], [0.45, '#F3C79A'], [1, '#F8E3C4']],
  winter: [[0, '#1E2A52'], [1, '#3B4F7E']],
};
// dig-site snow (top of the ground tile, near the horizon) and its bottom colour (fill below the tile)
const SNOW = { spring: '#E2EBF3', summer: '#E4EDF5', autumn: '#E6E8EE', winter: '#A9B9D5' };
const GROUND_BOTTOM = { spring: '#D2DFEB', summer: '#D4E1ED', autumn: '#D6DBE5', winter: '#8D9DBF' };
// mood grading: base colours mixed toward TINT[m] by t, then far things hazed toward HAZE[m]
const TINT = { spring: ['#F2F8FC', 0.06], summer: ['#FFFFFF', 0.0], autumn: ['#B48A8E', 0.16], winter: ['#2E3F70', 0.52] };
const HAZE = { spring: '#E2F1F8', summer: '#CFE8F4', autumn: '#F2D6BE', winter: '#3F5384' };
const RIM = { spring: '#FFFFFF', summer: '#FFFFFF', autumn: '#FFE7C9', winter: '#C9D9F5' };
const tone = (m, c, haze = 0) => mix(mix(c, TINT[m][0], TINT[m][1]), HAZE[m], haze);
const dk = (c, t = 0.3) => mix(c, '#27344A', t), lt = (c, t = 0.3) => mix(c, '#FFFFFF', t);
// base colours, all muted
const BASE = {
  rock: '#8E9CAD', rockShade: '#76849A', snow: '#F2F6FA', snowShade: '#C6D5E3', ice: '#D7E8F1', iceShade: '#A9C6D8',
  iceDeep: '#8FB6CB', seaTop: '#A9CCDD', sea: '#7FA7BF', bank: '#EDF2F7', bankShade: '#C9D7E4', stone: '#A3A7AB',
  stoneShade: '#888D93', tundra: '#9AA58B', tundraDk: '#7F8A72', rust: '#B98361', ochre: '#C9A86A', lilac: '#B9A6C9',
};
const SEA = {   // [near-horizon, deep]
  spring: ['#B7D5E2', '#86AABF'], summer: ['#A6CFE2', '#6F9DBA'], autumn: ['#D3C3BE', '#8C9CAE'], winter: ['#4C6090', '#243258'],
};
// how far down the mountains are snowed (snow line y in the far tile; bigger = more snow)
const SNOWLINE = { spring: 520, summer: 438, autumn: 452, winter: 640 };

// =====================================================================================================
// FAR (0 0 1200 720), bottom anchored
// =====================================================================================================
// one mountain range: rock body, snow above a wavy snow line (with drips), shaded right facets per peak, rim light
function range(m, peaks, base, haze, snowLine, id, rnd) {
  const y = field(peaks, base);
  const rockC = tone(m, BASE.rock, Math.min(0.8, haze * 1.3)), rockS = tone(m, BASE.rockShade, Math.min(0.8, haze * 1.2));
  let snowC = tone(m, BASE.snow, haze * 0.85), snowS = tone(m, BASE.snowShade, haze * 0.85);
  if (m === 'winter') { snowC = mix(snowC, '#C9D6EA', 0.45 - haze * 0.5); snowS = mix(snowS, '#7E90B6', 0.3); }   // moonlit snow caps
  let o = '', defs = '';
  defs += `<clipPath id="${id}"><path d="${fillUnder(y, 720)}"/></clipPath>`;
  o += P(fillUnder(y, 720), rockC);
  // snow: everything above the wavy snow line, plus a cap of at least ~26 px under every crest, with little drips
  const sl = x => snowLine + 10 * Math.sin(2 * Math.PI * x / 300 + id.length) + 7 * Math.sin(2 * Math.PI * x / 75 + 1.3) + 9 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * x / 40 + 0.4)), 6);
  const lower = x => Math.max(y(x) + 26 + 8 * Math.sin(2 * Math.PI * x / 60), sl(x));
  o += `<g clip-path="url(#${id})">`;
  o += P(band(y, lower), snowC);
  // shaded right facets per peak: from the apex down-right to the foot, back to a point under the apex
  for (const [c, h, w] of peaks) {
    if (h > -40) continue;
    const ax = c, ay = y(c);
    const facet = xx => {
      const pts = [[xx, ay]];
      for (let t = 0; t <= 1.0001; t += 0.05) pts.push([xx + t * w * 1.5, y(ax + t * w * 1.5) + 0]);
      pts.push([xx + w * 0.55, 720]);
      pts.push([xx + w * 0.22, ay + (720 - ay) * 0.45]); pts.push([xx + w * 0.05, ay + (720 - ay) * 0.18]);
      return P(poly(pts), 'sh');
    };
    o += both(facet, c, w * 1.6);
  }
  o = o.replace(/fill="sh"/g, `fill="${rockS}" opacity="0.55"`);
  // re-draw the shaded side of the snow (snow shade) as a second clip so snow facets get the cool snow shade
  o += `</g>`;
  // snow-shade facets: same facets but filled with the snow shade, clipped to the snow band
  defs += `<clipPath id="${id}s"><path d="${band(y, lower)}"/></clipPath>`;
  let fs2 = '';
  for (const [c, h, w] of peaks) {
    if (h > -40) continue;
    const ay = y(c);
    fs2 += both(xx => {
      const pts = [[xx, ay]];
      for (let t = 0; t <= 1.0001; t += 0.05) pts.push([xx + t * w * 1.5, y(c + t * w * 1.5)]);
      pts.push([xx + w * 0.55, 720]);
      pts.push([xx + w * 0.22, ay + (720 - ay) * 0.45]); pts.push([xx + w * 0.05, ay + (720 - ay) * 0.18]);
      return P(poly(pts), snowS);
    }, c, w * 1.6);
  }
  o += `<g clip-path="url(#${id}s)" opacity="0.8">${fs2}</g>`;
  // a few rock streaks showing through the snow (gullies)
  let gl = '';
  for (const [c, h, w] of peaks) {
    if (h > -70) continue;
    const ay = y(c);
    for (const k of [-0.5, 0.35]) {
      const gx = c + k * w, gy = y(gx);
      gl += both(xx => S(`M${f(xx)} ${f(gy + 14)}Q${f(xx + 6)} ${f(gy + 40)} ${f(xx + 2)} ${f(gy + 70)}`, rockC, 5, ' opacity="0.55"'), gx, 10);
    }
    void ay; void rnd;
  }
  o += `<g clip-path="url(#${id}s)">${gl}</g>`;
  o += S(edge(y, 2.2), RIM[m], 2.6, ` opacity="${m === 'winter' ? 0.55 : 0.7}"`);
  return { o, defs, y };
}
// an iceberg: chunky flat-topped / faceted, with a light face, cool shade facet, waterline and a pale underwater skirt
function iceberg(x, wl, w, h, m, kind, haze) {
  const iceC = tone(m, '#F1F7FB', haze), shadeC = tone(m, BASE.iceShade, haze), deep = tone(m, BASE.iceDeep, haze);
  const olC = tone(m, '#8FAFC4', haze);
  const X = v => x + v * w / 2, Yv = v => wl - v * h;
  let top;
  if (kind === 'table') top = [[-1, 0], [-0.94, 0.62], [-0.7, 0.96], [-0.2, 1], [0.4, 0.98], [0.78, 0.9], [0.95, 0.5], [1, 0]];
  else if (kind === 'twin') top = [[-1, 0], [-0.86, 0.48], [-0.55, 0.95], [-0.32, 1], [-0.1, 0.7], [0.18, 0.78], [0.5, 0.62], [0.86, 0.36], [1, 0]];
  else top = [[-1, 0], [-0.7, 0.45], [-0.3, 0.92], [0, 1], [0.32, 0.84], [0.7, 0.4], [1, 0]];
  const pts = top.map(([u, v]) => [X(u), Yv(v)]);
  let o = '';
  // underwater skirt (wider, pale, translucent)
  o += P(`M${f(X(-1.05))} ${f(wl)}Q${f(X(-0.7))} ${f(wl + h * 0.32)} ${f(x)} ${f(wl + h * 0.36)}Q${f(X(0.7))} ${f(wl + h * 0.32)} ${f(X(1.08))} ${f(wl)}Z`, deep, ' opacity="0.45"');
  o += P(poly(pts), iceC, OL(olC, 2.4));
  // shade facet: right part from the summit down
  const sIdx = top.reduce((bi, p, i) => p[1] > top[bi][1] ? i : bi, 0);
  const sp = [[X(top[sIdx][0] + 0.05), Yv(top[sIdx][1])], ...pts.slice(sIdx + 1), [X(top[sIdx][0] + 0.25), wl]];
  o += P(poly(sp), shadeC, ' opacity="0.75"');
  // soft highlight upper-left + a crack line
  o += P(`M${f(X(-0.75))} ${f(Yv(0.5))}Q${f(X(-0.55))} ${f(Yv(0.86))} ${f(X(-0.25))} ${f(Yv(0.9))}`, 'none', OL(lt(iceC, 0.6), 3) + ' opacity="0.8"');
  o += S(`M${f(X(0.1))} ${f(Yv(0.55))}l${f(w * 0.04)} ${f(h * 0.18)}l${f(-w * 0.03)} ${f(h * 0.14)}`, olC, 1.6, ' opacity="0.5"');
  // waterline: light ripple ring
  o += S(`M${f(X(-1.12))} ${f(wl + 2)}Q${f(x)} ${f(wl + 7)} ${f(X(1.12))} ${f(wl + 2)}`, lt(iceC, 0.4), 2.2, ' opacity="0.75"');
  return o;
}
function far(m) {
  const r = rng(11 + MOODS.indexOf(m));
  const sky = SKY[m];
  let o = '', defs = '';
  const winter = m === 'winter';
  // 1 back range (hazy, tall): the big twin peak at FAR_ANCHOR.x
  const back = range(m, [[266, -262, 82, 'peak'], [358, -214, 70, 'peak'], [540, -150, 90, 'peak'], [700, -196, 80, 'peak'],
    [880, -120, 90, 'peak'], [1040, -218, 78, 'peak'], [1150, -140, 70, 'peak'], [120, -150, 80, 'peak']], 600, m === 'winter' ? 0.4 : 0.42, SNOWLINE[m] - 40, 'rb', r);
  o += back.o; defs += back.defs;
  // soft haze band at the foot of the back range
  defs += lg('hz', [[0, HAZE[m], 0], [0.6, HAZE[m], winter ? 0.45 : 0.6], [1, HAZE[m], 0.2]], V);
  o += R(0, 470, W, 110, 'url(#hz)');
  // 2 front range (lower, nearer, less haze)
  const front = range(m, [[40, -110, 90, 'peak'], [200, -70, 80, 'peak'], [480, -118, 80, 'peak'], [620, -80, 70, 'peak'], [820, -134, 90, 'peak'],
    [990, -84, 80, 'peak'], [1110, -60, 60, 'peak']], 610, 0.22, SNOWLINE[m] + 40, 'rf', r);
  o += front.o; defs += front.defs;
  // 3 the sea
  const [s0, s1] = SEA[m];
  defs += lg('sea', [[0, s0], [0.35, mix(s0, s1, 0.55)], [1, s1]], V);
  o += R(0, SEA_Y, W, 720 - SEA_Y, 'url(#sea)');
  // horizon light line + soft reflection bands of the far shore
  o += R(0, SEA_Y, W, 3, lt(s0, 0.5), ' opacity="0.8"');
  let wv = '';
  for (let i = 0; i < 34; i++) {
    const y = SEA_Y + 10 + Math.pow(r(), 1.3) * 140, x = r() * W, l = 20 + r() * 60 * (0.5 + (y - SEA_Y) / 140);
    wv += both(xx => `M${f(xx - l / 2)} ${f(y)}L${f(xx + l / 2)} ${f(y)}`, x, l / 2 + 2);
  }
  o += S(wv, lt(s0, winter ? 0.25 : 0.55), 2.2, ` opacity="${winter ? 0.45 : 0.7}"`);
  // moonlit / sun path glitter in the sea (winter: under the moon; others: soft)
  // 4 icebergs (the anchor iceberg right under the twin peak) + flat floes
  const bergs = [[450, 628, 150, 64, 'table'], [640, 606, 70, 34, 'peak'], [905, 640, 120, 72, 'twin'], [70, 612, 80, 38, 'peak'], [1090, 602, 54, 22, 'table']];
  for (const [x, wl, w, h, k] of bergs) o += both(xx => iceberg(xx, wl, w, h, m, k, (690 - wl) < 60 ? 0.18 : 0.08), x, w * 0.6);
  // floes: flat pale ellipses with a darker waterline edge, nearer = bigger
  let fl = '';
  for (let i = 0; i < 14; i++) {
    const y = 640 + r() * 70, x = r() * W, w = 18 + (y - 640) * 0.9 + r() * 30, h = 4 + (y - 640) * 0.06;
    const fc = tone(m, '#EEF5FA', 0.08), fe = tone(m, BASE.iceShade, 0.08);
    fl += both(xx => E(xx, y + h * 0.5, w, h, fe, ' opacity="0.8"') + E(xx, y, w, h, fc), x, w + 2);
  }
  o += fl;
  return svg(1200, 720, o, defs, `sky ${sky[0][1]} ${sky[sky.length - 1][1]}${sky.length > 2 ? ' (stops ' + sky.map(s => s[0] + ':' + s[1]).join(' ') + ')' : ''}`);
}

// =====================================================================================================
// MID (0 0 1200 300): the near shore — snow banks, ice ridges, igloo, stone stack, tundra tufts, rocks
// =====================================================================================================
function mid(m) {
  const r = rng(101 + MOODS.indexOf(m)), Y = MID_BASE, hz = m === 'winter' ? 0.05 : 0.1;
  const c = k => tone(m, BASE[k], hz);
  const winter = m === 'winter', spring = m === 'spring', summer = m === 'summer', autumn = m === 'autumn';
  const bankC = c('bank'), bankS = c('bankShade'), iceC = c('ice'), iceS = c('iceShade');
  const stoneC = c('stone'), stoneS = c('stoneShade');
  const rim = RIM[m];
  let o = '', defs = '';
  // --- tundra tufts colour per mood
  const tuftC = spring ? c('tundra') : summer ? tone(m, '#8FA684', hz) : autumn ? c('rust') : tone(m, '#8D99AA', hz);
  const tuftC2 = spring ? c('tundraDk') : summer ? tone(m, '#A3B58F', hz) : autumn ? c('ochre') : tone(m, '#A3AEBD', hz);
  // 1 back bank: rolling drifts (continuous shore), with an ice ridge field behind it
  const yR = field([[150, -70, 60], [210, -40, 40], [760, -58, 50], [820, -36, 40], [1150, -30, 40]], 268);
  // ice pressure ridge (blocky slabs) behind the bank
  const slabs = [];
  for (const [cx, n, hh] of [[180, 6, 62], [790, 5, 54], [1150, 3, 34]]) for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * 22 + (r() - 0.5) * 8, h = hh * (0.55 + 0.45 * Math.sin(Math.PI * (i + 0.5) / n)) * (0.8 + r() * 0.3), w = 22 + r() * 12, tilt = (r() - 0.5) * 0.5;
    slabs.push([x, h, w, tilt]);
  }
  for (const [x, h, w, tilt] of slabs) o += both(xx => {
    const b = Y - 22, t = b - h, dx = tilt * h;
    const pts = [[xx - w / 2, b], [xx - w / 2 + dx, t + 6], [xx - w * 0.1 + dx, t], [xx + w / 2 + dx, t + 8], [xx + w / 2, b]];
    return P(poly(pts), iceC, OL(dk(iceC, 0.32), 2.2)) + P(poly([[xx + w * 0.08 + dx, t + 2], [xx + w / 2 + dx, t + 8], [xx + w / 2, b], [xx + w * 0.12, b]]), iceS, ' opacity="0.7"') +
      S(`M${f(xx - w / 2 + dx + 3)} ${f(t + 9)}L${f(xx - w * 0.12 + dx)} ${f(t + 3)}`, lt(iceC, 0.7), 2.4, ' opacity="0.9"');
  }, x, w);
  // 2 the igloo (on the left half) and the stone stack (right half) sit on the bank
  const igloo = x => {
    const rx = 62, ry = 54, b = Y - 14;
    const snowC = tone(m, '#F1F5F9', hz), sh = tone(m, '#C3D2E0', hz), ol = dk(sh, 0.3);
    let s = '';
    s += E(x + 8, b + 2, rx + 12, 7, dk(bankS, 0.1), ' opacity="0.5"');
    s += P(`M${f(x - rx)} ${f(b)}A${rx} ${ry} 0 0 1 ${f(x + rx)} ${f(b)}Z`, snowC, OL(ol, 2.6));
    // right side shade
    s += P(`M${f(x + 6)} ${f(b - ry + 1)}A${rx} ${ry} 0 0 1 ${f(x + rx)} ${f(b)}L${f(x + 22)} ${f(b)}Q${f(x + 30)} ${f(b - ry * 0.6)} ${f(x + 6)} ${f(b - ry + 1)}Z`, sh, ' opacity="0.7"');
    // block rows
    let rows = '';
    for (let k = 1; k <= 3; k++) {
      const yy = b - ry * k / 4, hw = rx * Math.sqrt(1 - Math.pow(k / 4, 2));
      rows += `M${f(x - hw)} ${f(yy)}Q${f(x)} ${f(yy - 5)} ${f(x + hw)} ${f(yy)}`;
      const n = 6 - k;
      for (let j = 0; j < n; j++) { const u = -1 + (j + 0.5 + (k % 2) * 0.5) * 2 / (n + 0.5), bx = x + u * hw * 0.92; rows += `M${f(bx)} ${f(yy)}L${f(bx)} ${f(yy + ry / 4 - 1)}`; }
    }
    { const yy = b, hw = rx; for (let j = 0; j < 6; j++) { const bx = x - hw + (j + 0.7) * 2 * hw / 6.2; rows += `M${f(bx)} ${f(yy - ry / 4 + 1)}L${f(bx)} ${f(yy)}`; } void yy; }
    s += S(rows, ol, 1.6, ' opacity="0.45"');
    // highlight upper-left
    s += S(`M${f(x - rx * 0.72)} ${f(b - ry * 0.55)}Q${f(x - rx * 0.45)} ${f(b - ry * 0.95)} ${f(x - rx * 0.05)} ${f(b - ry * 0.98)}`, '#FFFFFF', 4, ' opacity="0.8"');
    // entrance tunnel (front-right) with a dark cool opening
    const ex = x + 30, er = 24;
    s += P(`M${f(ex - er)} ${f(b)}L${f(ex - er)} ${f(b - er * 0.7)}A${er} ${er} 0 0 1 ${f(ex + er + 10)} ${f(b - er * 0.7)}L${f(ex + er + 10)} ${f(b)}Z`, snowC, OL(ol, 2.4));
    s += P(`M${f(ex - er + 4)} ${f(b - er * 0.7)}A${er} ${er} 0 0 1 ${f(ex + er + 6)} ${f(b - er * 0.7)}L${f(ex + er + 10)} ${f(b)}L${f(ex + er - 6)} ${f(b)}Z`, sh, ' opacity="0.55"');
    s += P(`M${f(ex - 6)} ${f(b)}L${f(ex - 6)} ${f(b - 12)}A12 12 0 0 1 ${f(ex + 18)} ${f(b - 12)}L${f(ex + 18)} ${f(b)}Z`, tone(m, '#5B7290', hz));
    if (winter) s += P(`M${f(ex - 3)} ${f(b)}L${f(ex - 3)} ${f(b - 11)}A9 9 0 0 1 ${f(ex + 15)} ${f(b - 11)}L${f(ex + 15)} ${f(b)}Z`, '#F2D9A6', ' opacity="0.55"');
    // icicles (spring melt)
    if (spring) { let ic = ''; for (const dx of [-14, -7, 2]) ic += `M${f(ex + dx + 4)} ${f(b - er * 0.7 - er + 3 + Math.abs(dx) * 0.3)}l3 ${f(9 + (dx % 3 + 3))}l3 ${f(-9 - (dx % 3 + 3))}Z`; s += P(ic, tone(m, '#D9EEF7', 0), OL(tone(m, '#8FB0C6', 0), 1.2)); }
    return s;
  };
  const stack = x => {   // an inuksuk-like stack of muted grey stones with snow on the slabs
    const b = Y - 16;
    const st = (d, c1 = stoneC) => P(d, c1, OL(dk(stoneC, 0.35), 2.2));
    const snowCap = (x0, x1, y0) => P(`M${f(x0)} ${f(y0 + 1)}Q${f(x0 + 2)} ${f(y0 - 5)} ${f((x0 + x1) / 2)} ${f(y0 - 6)}Q${f(x1 - 2)} ${f(y0 - 5)} ${f(x1)} ${f(y0 + 1)}Q${f((x0 + x1) / 2)} ${f(y0 + 4)} ${f(x0)} ${f(y0 + 1)}Z`, tone(m, '#F3F7FA', hz), OL(tone(m, '#AFC2D3', hz), 1.4));
    let s = '';
    s += E(x + 6, b + 2, 40, 6, dk(bankS, 0.1), ' opacity="0.5"');
    // legs
    s += st(`M${f(x - 26)} ${f(b)}Q${f(x - 30)} ${f(b - 18)} ${f(x - 22)} ${f(b - 30)}L${f(x - 10)} ${f(b - 30)}Q${f(x - 6)} ${f(b - 14)} ${f(x - 8)} ${f(b)}Z`);
    s += st(`M${f(x + 8)} ${f(b)}Q${f(x + 6)} ${f(b - 16)} ${f(x + 10)} ${f(b - 30)}L${f(x + 22)} ${f(b - 30)}Q${f(x + 30)} ${f(b - 16)} ${f(x + 26)} ${f(b)}Z`, stoneS);
    // hip slab
    s += st(`M${f(x - 32)} ${f(b - 30)}Q${f(x - 34)} ${f(b - 42)} ${f(x - 26)} ${f(b - 42)}L${f(x + 28)} ${f(b - 43)}Q${f(x + 36)} ${f(b - 40)} ${f(x + 32)} ${f(b - 30)}Z`);
    // body stone
    s += st(`M${f(x - 16)} ${f(b - 42)}Q${f(x - 20)} ${f(b - 58)} ${f(x - 12)} ${f(b - 64)}L${f(x + 12)} ${f(b - 64)}Q${f(x + 20)} ${f(b - 56)} ${f(x + 16)} ${f(b - 42)}Z`, mix(stoneC, stoneS, 0.4));
    // arms slab
    s += st(`M${f(x - 44)} ${f(b - 64)}Q${f(x - 46)} ${f(b - 74)} ${f(x - 38)} ${f(b - 75)}L${f(x + 40)} ${f(b - 76)}Q${f(x + 48)} ${f(b - 72)} ${f(x + 44)} ${f(b - 64)}Z`);
    // head
    s += st(`M${f(x - 11)} ${f(b - 75)}Q${f(x - 14)} ${f(b - 90)} ${f(x - 2)} ${f(b - 93)}Q${f(x + 13)} ${f(b - 92)} ${f(x + 11)} ${f(b - 75)}Z`, mix(stoneC, stoneS, 0.2));
    // highlights + snow caps
    s += S(`M${f(x - 34)} ${f(b - 69)}L${f(x - 10)} ${f(b - 70)}M${f(x - 26)} ${f(b - 37)}L${f(x - 4)} ${f(b - 38)}`, lt(stoneC, 0.45), 2.4, ' opacity="0.8"');
    if (!summer) { s += snowCap(x - 40, x + 10, b - 75); s += snowCap(x - 28, x + 6, b - 42); s += snowCap(x - 8, x + 9, b - 92); }
    else s += snowCap(x - 6, x + 8, b - 92);
    return s;
  };
  // tufts: a little tussock of blades; spring adds lilac saxifrage dots, summer cotton-grass heads, winter a snow cap
  const tuft = (sc, n) => x => {
    const b = Y - 12;
    let bl = '';
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) / ((n - 1) / 2 || 1), h = (14 + 8 * (1 - Math.abs(u))) * sc, lx = x + u * 10 * sc, tx = lx + u * 7 * sc;
      bl += `M${f(lx - 2.6 * sc)} ${f(b)}Q${f(lx)} ${f(b - h * 0.6)} ${f(tx)} ${f(b - h)}Q${f(lx + 0.6)} ${f(b - h * 0.5)} ${f(lx + 2.6 * sc)} ${f(b)}Z`;
    }
    let s = P(bl, tuftC, OL(dk(tuftC, 0.3), 1.4)) + P(bl, tuftC2, ' opacity="0.5" transform="translate(2 0)"');
    if (spring) for (let i = 0; i < 3; i++) { const dx = (i - 1) * 7 * sc, dy = -6 - (i % 2) * 5; s += C(x + dx, b + dy * sc, 2.6 * sc, BASE.lilac, OL(mix(BASE.lilac, '#5E5470', 0.35), 0.9)) + C(x + dx, b + dy * sc, 0.9 * sc, '#F1EBD5'); }
    if (summer) for (let i = 0; i < 3; i++) { const dx = (i - 1) * 8 * sc, hh = (26 + (i % 2) * 8) * sc; s += S(`M${f(x + dx * 0.5)} ${f(b)}Q${f(x + dx * 0.8)} ${f(b - hh * 0.6)} ${f(x + dx)} ${f(b - hh)}`, dk(tuftC, 0.2), 1.3) + C(x + dx, b - hh - 3 * sc, 4.4 * sc, '#FBFCFA', OL('#C9D1C6', 1)) + C(x + dx - 1.4 * sc, b - hh - 4.4 * sc, 1.6 * sc, '#FFFFFF'); }
    if (winter || autumn) s += P(`M${f(x - 13 * sc)} ${f(b - (winter ? 10 : 4) * sc)}Q${f(x)} ${f(b - (winter ? 22 : 14) * sc)} ${f(x + 13 * sc)} ${f(b - (winter ? 10 : 4) * sc)}Q${f(x)} ${f(b - (winter ? 6 : 1) * sc)} ${f(x - 13 * sc)} ${f(b - (winter ? 10 : 4) * sc)}Z`, tone(m, '#F2F6FA', hz), autumn ? ' opacity="0.85"' : '');
    return s;
  };
  const rock = (w, h) => x => {
    const b = Y - 10;
    const d = `M${f(x - w / 2)} ${f(b + 2)}Q${f(x - w / 2 - 3)} ${f(b - h * 0.7)} ${f(x - w * 0.15)} ${f(b - h)}Q${f(x + w * 0.3)} ${f(b - h * 1.04)} ${f(x + w / 2)} ${f(b - h * 0.4)}Q${f(x + w / 2 + 3)} ${f(b)} ${f(x + w / 2 - 4)} ${f(b + 2)}Z`;
    let s = P(d, stoneC, OL(dk(stoneC, 0.35), 2.2)) +
      P(`M${f(x + w * 0.05)} ${f(b + 1)}Q${f(x + w * 0.35)} ${f(b - h * 0.45)} ${f(x + w * 0.3)} ${f(b - h * 0.9)}Q${f(x + w / 2 + 2)} ${f(b - h * 0.4)} ${f(x + w / 2 - 4)} ${f(b + 1)}Z`, stoneS, ' opacity="0.8"');
    if (!summer) s += P(`M${f(x - w * 0.44)} ${f(b - h * 0.62)}Q${f(x - w * 0.2)} ${f(b - h * 1.16)} ${f(x + w * 0.38)} ${f(b - h * 0.55)}Q${f(x)} ${f(b - h * 0.72)} ${f(x - w * 0.44)} ${f(b - h * 0.62)}Z`, tone(m, '#F2F6FA', hz), OL(tone(m, '#AFC2D3', hz), 1.4));
    else s += E(x - w * 0.18, b - h * 0.7, w * 0.14, h * 0.1, lt(stoneC, 0.4), ' opacity="0.8"');
    return s;
  };
  // 3 the continuous snow bank (front of the ridges): rolling, bottom anchored, rim light, soft shade under each roll
  const yB = field([[60, -34, 90], [300, -20, 80], [430, -46, 100], [640, -28, 90], [900, -40, 110], [1080, -24, 80]], 262);
  // the bank
  defs += lg('bk', [[0, bankC], [0.7, mix(bankC, bankS, 0.35)], [1, mix(bankC, bankS, 0.6)]], V);
  o += P(fillUnder(yB, 300), 'url(#bk)', OL(dk(bankS, 0.18), 2.4));
  // cool shade under each roll crest (right side)
  let shd = '';
  for (const [cx, h, w] of [[60, -34, 90], [430, -46, 100], [900, -40, 110]]) shd += both(xx => P(`M${f(xx + w * 0.15)} ${f(yB(cx + w * 0.15) + 4)}Q${f(xx + w * 0.7)} ${f(yB(cx + w * 0.7) + 2)} ${f(xx + w * 1.3)} ${f(yB(cx + w * 1.3) + 6)}L${f(xx + w * 1.1)} ${f(296)}L${f(xx + w * 0.2)} 296Z`, bankS), cx, w * 1.4);
  defs += `<clipPath id="bc"><path d="${fillUnder(yB, 300)}"/></clipPath>`;
  o += `<g clip-path="url(#bc)" opacity="0.55">${shd}</g>`;
  o += S(edge(yB, 2.4), rim, 3, ` opacity="${winter ? 0.6 : 0.95}"`);
  // spring: melted patches showing tundra on the bank + little meltwater pools
  if (spring || autumn) {
    let pt = '';
    for (const [x, w] of [[220, 70], [470, 44], [760, 90], [1140, 60]]) {
      const y = yB(x) + 10;
      pt += both(xx => P(`M${f(xx - w / 2)} ${f(y + 6)}Q${f(xx - w * 0.3)} ${f(y - 4)} ${f(xx)} ${f(y - 3)}Q${f(xx + w * 0.35)} ${f(y - 5)} ${f(xx + w / 2)} ${f(y + 5)}Q${f(xx + w * 0.1)} ${f(y + 13)} ${f(xx - w / 2)} ${f(y + 6)}Z`, spring ? tone(m, '#A8B09A', hz) : tone(m, '#B89577', hz), OL(spring ? tone(m, '#8D967F', hz) : tone(m, '#98775C', hz), 1.6)), x, w / 2 + 2);
    }
    o += pt;
  }
  // the igloo and the stone stack stand ON the bank (drawn after it so they read clearly)
  o += both(xx => `<g transform="translate(0 ${f(yB(560) + 9 - (Y - 14))})">` + igloo(xx) + '</g>', 560, 80);
  o += both(xx => `<g transform="translate(0 ${f(yB(960) + 8 - (Y - 16))})">` + stack(xx) + '</g>', 960, 50);
  // tufts + rocks on the bank
  const tufts = [[110, 1, 5], [255, 0.85, 4], [330, 1.1, 5], [640, 0.9, 4], [700, 1.05, 5], [815, 0.8, 4], [1040, 1, 5], [1175, 0.9, 4]];
  for (const [x, sc, n] of tufts) { const fn = tuft(sc, n); o += both(xx => `<g transform="translate(0 ${f(yB(x) - (Y - 12) + 6)})">` + fn(xx) + '</g>', x, 30); }
  for (const [x, w, h] of [[470, 40, 24], [1110, 52, 30], [20, 30, 18]]) { const fn = rock(w, h); o += both(xx => `<g transform="translate(0 ${f(yB(x) - (Y - 10) + 8)})">` + fn(xx) + '</g>', x, w); }
  void r;
  return svg(1200, 300, o, defs);
}

// =====================================================================================================
// GROUND (0 0 1200 260): the snowy dig site
// =====================================================================================================
function ground(m) {
  const r = rng(201 + MOODS.indexOf(m));
  const snow = SNOW[m], bot = GROUND_BOTTOM[m], winter = m === 'winter', spring = m === 'spring', summer = m === 'summer', autumn = m === 'autumn';
  let o = '', defs = '';
  defs += lg('sd', [[0, lt(snow, winter ? 0.08 : 0.35)], [0.12, snow], [1, bot]], V);
  // soft fluffy top edge (small bumps, period 1200)
  const yT = x => 26 + 3 * Math.sin(2 * Math.PI * x / 400 + 0.7) + 2.2 * Math.sin(2 * Math.PI * x / 150 + 2.1) + 1.4 * Math.sin(2 * Math.PI * x / 60);
  // tundra fringe peeking behind the edge (spring / summer / autumn), muted
  if (!winter) {
    const fc = spring ? tone(m, '#9AA58B', 0.05) : summer ? tone(m, '#93A887', 0.05) : tone(m, '#B98361', 0.05);
    const fc2 = autumn ? tone(m, '#C9A86A', 0.05) : lt(fc, 0.15);
    let gr = '', gr2 = '';
    const NF = autumn ? 46 : 70;
    for (let i = 0; i < NF; i++) {
      const x = (i + r() * 0.8) * W / NF, y = yT(x) + 6, h = (autumn ? 4 : 6) + r() * (summer ? 12 : autumn ? 6 : 9), w = 3.5 + r() * 3, lean = (r() - 0.5) * 6;
      const d = both(xx => `M${f(xx - w)} ${f(y)}Q${f(xx - 1)} ${f(y - h * 0.6)} ${f(xx + lean)} ${f(y - h)}Q${f(xx + 1)} ${f(y - h * 0.5)} ${f(xx + w)} ${f(y)}Z`, x, 10);
      if (i % 3) gr += d; else gr2 += d;
    }
    o += P(gr, fc, OL(dk(fc, 0.25), 1.4)) + P(gr2, fc2, OL(dk(fc2, 0.25), 1.4));
    if (summer) { let ch = ''; for (let i = 0; i < 16; i++) { const x = (i + r()) * W / 16, y = yT(x) - 8 - r() * 8; ch += both(xx => S(`M${f(xx)} ${f(yT(x) + 4)}L${f(xx + 1)} ${f(y)}`, dk(fc, 0.2), 1.1) + C(xx + 1, y - 2.5, 3.6, '#FBFCFA', OL('#C9D1C6', 0.9)), x, 6); } o += ch; }
    if (spring) { let lf = ''; for (let i = 0; i < 18; i++) { const x = (i + r()) * W / 18, y = yT(x) - 2 - r() * 6; lf += both(xx => C(xx, y, 2.4, BASE.lilac, OL(mix(BASE.lilac, '#5E5470', 0.35), 0.8)), x, 4); } o += lf; }
  }
  const pts = [[0, 260]]; for (let x = 0; x <= W; x += 5) pts.push([x, yT(x)]); pts.push([W, 260]);
  o += P(poly(pts), 'url(#sd)');
  // fluffy rounded lumps along the edge (soft cushion look)
  let lumps = '';
  for (let i = 0; i < 30; i++) { const x = (i + 0.5) * W / 30 + (r() - 0.5) * 14, rr = 10 + r() * 10; lumps += both(xx => E(xx, yT(x) + rr * 0.55, rr * 1.6, rr * 0.55, 'l'), x, rr * 1.7); }
  o += lumps.replace(/fill="l"/g, `fill="${lt(snow, winter ? 0.12 : 0.4)}" opacity="0.55"`);
  o += S(edge(yT, 1.2, 5), lt(snow, winter ? 0.3 : 0.75), 2.4, ` opacity="${winter ? 0.6 : 0.9}"`);
  // wind ripples / sastrugi (low contrast: light crest + cool shade under)
  let rp = '';
  for (let i = 0; i < 24; i++) {
    const x = r() * W, y = 66 + r() * 176, l = 50 + r() * 80;
    rp += both(xx => `M${f(xx - l / 2)} ${f(y)}Q${f(xx - l * 0.1)} ${f(y - 6)} ${f(xx + l / 2)} ${f(y - 1)}`, x, l / 2 + 2);
  }
  o += S(rp, lt(snow, 0.6), 2.4, ` opacity="${winter ? 0.25 : 0.55}"`);
  o += `<g transform="translate(0 3)">` + S(rp, dk(snow, 0.14), 1.6, ` opacity="${winter ? 0.25 : 0.3}"`) + `</g>`;
  // spring: meltwater puddles (pale cool grey-blue, light rim) — never answer blue
  if (spring) {
    let pu = '';
    for (const [x, y, w] of [[300, 120, 46], [760, 186, 60], [1060, 92, 34]]) pu += both(xx => E(xx, y, w, w * 0.22, '#B9CCD9', OL('#9DB2C2', 1.6)) + E(xx - w * 0.3, y - w * 0.05, w * 0.35, w * 0.05, '#E6EFF5', ' opacity="0.9"'), x, w + 2);
    o += pu;
  }
  // footprints: a little bear-cub trail (pad + 4 toe beans) and a tiny bird trail, very faint cool blue-grey
  const fp = dk(snow, winter ? 0.16 : 0.13), fpA = winter ? 0.45 : 0.5;
  let prints = '';
  const bearPrint = (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})">` + E(x, y, 7, 6, fp) + C(x - 6.4, y - 7.6, 2.3, fp) + C(x - 2.2, y - 10, 2.4, fp) + C(x + 2.2, y - 10, 2.4, fp) + C(x + 6.4, y - 7.6, 2.3, fp) + `</g>`;
  const birdPrint = (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})">` + S(`M${f(x)} ${f(y)}L${f(x)} ${f(y - 9)}M${f(x)} ${f(y - 2)}L${f(x - 5)} ${f(y - 8)}M${f(x)} ${f(y - 2)}L${f(x + 5)} ${f(y - 8)}`, fp, 1.6) + `</g>`;
  for (let i = 0; i < 8; i++) { const x = 70 + i * 30, y = 214 - i * 14 + (i % 2) * 10; prints += both(xx => bearPrint(xx, y, 62), x, 14); }
  for (let i = 0; i < 9; i++) { const x = 660 + i * 26, y = 96 + (i % 2) * 9 + i * 2; prints += both(xx => birdPrint(xx, y, 84), x, 8); }
  o += `<g opacity="${fpA}">${prints}</g>`;
  // small rocks half buried in snow (grey, snow cap) + a couple of ice chunks
  const rkC = tone(m, '#A3A7AB', 0), rkS = tone(m, '#888D93', 0);
  let rk = '';
  for (let i = 0; i < 14; i++) {
    const y = 50 + Math.pow(r(), 1.4) * 190, x = r() * W, s = (4 + r() * 6) * (0.7 + (y - 40) / 220 * 0.6);
    rk += both(xx => E(xx + 2, y + s * 0.4, s * 1.3, s * 0.4, dk(snow, 0.18), ' opacity="0.4"') +
      P(`M${f(xx - s * 1.2)} ${f(y + s * 0.3)}Q${f(xx - s * 1.1)} ${f(y - s * 0.7)} ${f(xx)} ${f(y - s * 0.8)}Q${f(xx + s * 1.2)} ${f(y - s * 0.6)} ${f(xx + s * 1.2)} ${f(y + s * 0.3)}Z`, rkC, OL(dk(rkC, 0.32), 1.3)) +
      P(`M${f(xx + s * 0.1)} ${f(y - s * 0.78)}Q${f(xx + s * 1.2)} ${f(y - s * 0.6)} ${f(xx + s * 1.2)} ${f(y + s * 0.3)}L${f(xx + s * 0.3)} ${f(y + s * 0.3)}Z`, rkS, ' opacity="0.6"') +
      (summer ? '' : P(`M${f(xx - s * 1.0)} ${f(y - s * 0.3)}Q${f(xx - s * 0.2)} ${f(y - s * 1.2)} ${f(xx + s * 0.9)} ${f(y - s * 0.4)}Q${f(xx)} ${f(y - s * 0.55)} ${f(xx - s * 1.0)} ${f(y - s * 0.3)}Z`, lt(snow, 0.5))) +
      E(xx, y + s * 0.3, s * 1.5, s * 0.32, snow), x, s * 1.6 + 2);
  }
  o += rk;
  // autumn: a few tundra patches showing through thin first snow
  if (autumn) {
    let pt = '';
    for (const [x, y, w] of [[240, 150, 40], [880, 210, 54], [560, 84, 30]]) pt += both(xx => P(`M${f(xx - w)} ${f(y)}Q${f(xx - w * 0.5)} ${f(y - w * 0.2)} ${f(xx)} ${f(y - w * 0.16)}Q${f(xx + w * 0.6)} ${f(y - w * 0.22)} ${f(xx + w)} ${f(y + 2)}Q${f(xx)} ${f(y + w * 0.22)} ${f(xx - w)} ${f(y)}Z`, tone(m, '#C9B09A', 0.25), OL(tone(m, '#B0977F', 0.25), 1.2) + ' opacity="0.75"') + E(xx - w * 0.2, y - 1, w * 0.4, w * 0.07, lt(snow, 0.3), ' opacity="0.9"'), x, w + 2);
    o = o.replace('<g opacity="' + fpA + '">', pt + '<g opacity="' + fpA + '">');
  }
  // snow sparkle: soft blue-grey dots + tiny white glints
  let dots = '', gl = '';
  for (let i = 0; i < 60; i++) { const x = r() * W, y = 40 + r() * 216, s = 1 + r() * 1.6; dots += both(xx => C(xx, y, s, 'd'), x, 3); }
  for (let i = 0; i < 22; i++) { const x = r() * W, y = 40 + r() * 216, s = 2.5 + r() * 2.5; gl += both(xx => P(`M${f(xx)} ${f(y - s)}L${f(xx + s * 0.25)} ${f(y - s * 0.25)}L${f(xx + s)} ${f(y)}L${f(xx + s * 0.25)} ${f(y + s * 0.25)}L${f(xx)} ${f(y + s)}L${f(xx - s * 0.25)} ${f(y + s * 0.25)}L${f(xx - s)} ${f(y)}L${f(xx - s * 0.25)} ${f(y - s * 0.25)}Z`, 'g'), x, s + 1); }
  o += dots.replace(/fill="d"/g, `fill="${dk(snow, 0.2)}" opacity="0.35"`) + gl.replace(/fill="g"/g, `fill="#FFFFFF" opacity="${winter ? 0.7 : 0.9}"`);
  // winter: a faint cool moon sheen near the horizon
  if (winter) { defs += lg('ms', [[0, '#D9E4F8', 0.28], [1, '#D9E4F8', 0]], V); o += R(0, 24, W, 80, 'url(#ms)'); }
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// SUN, MOON, CLOUDS
// =====================================================================================================
function sun() {   // a soft pale midnight sun (warm cream, no rays)
  const d = rg('h', [[0, '#FFF7DE', 0.9], [0.45, '#FFF3D2', 0.42], [1, '#FFF3D2', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 46, '#FFF5D6', OL('#F2DDA6', 4)) + C(100, 100, 38, '#FFFAEA') + E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-35 86 84)"'), d);
}
function moon() {
  const d = rg('h', [[0, '#E6EEFF', 0.55], [0.5, '#DCE6FA', 0.22], [1, '#DCE6FA', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 44, '#F4F3EA', OL('#C9CED8', 4)) +
    P('M100 56a44 44 0 0 1 0 88a30 44 0 0 0 0 -88Z', '#E2E3DD', ' opacity="0.8"') +
    C(84, 88, 7, '#E3E4DE') + C(110, 116, 9, '#E3E4DE') + C(116, 80, 5, '#E3E4DE') + C(88, 120, 4, '#E3E4DE') +
    E(82, 74, 10, 6, '#FFFFFF', ' opacity="0.7" transform="rotate(-35 82 74)"'), d);
}
function cloud(type) {
  const blobs = type === 'a' ? [[70, 92, 38], [118, 70, 50], [172, 62, 44], [214, 84, 36], [250, 100, 26], [40, 108, 22]] : [[60, 96, 28], [100, 80, 36], [148, 74, 40], [196, 86, 32], [236, 100, 24], [34, 108, 18]];
  let body = '';
  for (const [x, y, rr] of blobs) body += `M${x - rr} ${y}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0Z`;
  body += `M20 106Q20 124 44 124L262 124Q282 124 280 108L276 98L22 98Z`;
  const shade = `M20 112Q24 128 46 128L260 128Q282 128 282 112Q270 118 250 116Q200 122 150 116Q100 122 60 116Q34 118 20 112Z`;
  return svg(300, 140, P(body, '#FFFFFF') + P(shade, '#DCE6F0', ' opacity="0.9"') + E(108, 58, 22, 9, '#FFFFFF', ' opacity="0.9"'));
}

// =====================================================================================================
// PARTICLES (0 0 32 32)
// =====================================================================================================
function particles() {
  const out = {};
  // snow: a soft six-armed snowflake with a faint glow (white, cool outline)
  {
    let arms = '';
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a), X = (u, v) => [16 + ca * u - sa * v, 16 + sa * u + ca * v];
      const p0 = X(0, 0), p1 = X(11.5, 0), b1 = X(6.5, 0), b2 = X(9.5, 3.2), b3 = X(9.5, -3.2);
      arms += `M${f(p0[0])} ${f(p0[1])}L${f(p1[0])} ${f(p1[1])}M${f(b1[0])} ${f(b1[1])}L${f(b2[0])} ${f(b2[1])}M${f(b1[0])} ${f(b1[1])}L${f(b3[0])} ${f(b3[1])}`;
    }
    out.snow = svg(32, 32, C(16, 16, 15, 'url(#g)') + S(arms, '#B9CCE0', 4) + S(arms, '#FFFFFF', 2.2) + C(16, 16, 2.6, '#FFFFFF'),
      rg('g', [[0, '#FFFFFF', 0.55], [0.6, '#FFFFFF', 0.18], [1, '#FFFFFF', 0]]));
  }
  // sand = a flung snow clump (white with a blue-grey shade)
  out.sand = svg(32, 32, P('M7 20Q4 14 9 11Q11 6 17 8Q23 6 25 12Q29 15 26 21Q24 26 17 25Q9 27 7 20Z', '#F4F8FC', OL('#8FA9BF', 2)) +
    P('M26 21Q24 26 17 25Q11 26 8 22Q14 23 19 20Q24 18 27 15Q28 18 26 21Z', '#CFDDEA') + C(19, 17, 2.2, '#DCE6F0') + E(13, 11.5, 3.6, 2, '#FFFFFF'));
  out.dust = svg(32, 32, C(13, 18, 10, 'url(#d)') + C(20, 14, 10, 'url(#d)') + C(19, 21, 9, 'url(#d)'), rg('d', [[0, '#FFFFFF', 0.9], [0.6, '#EEF4FA', 0.45], [1, '#EEF4FA', 0]]));
  // spring petal: a tiny muted lilac saxifrage petal
  out.petal = svg(32, 32, `<g transform="rotate(-24 16 16)">` + P('M16 4Q24 9 22 19Q20 27 16 28Q12 27 10 19Q8 9 16 4Z', '#C3B2D2', OL('#8E7CA2', 1.6)) +
    P('M16 4Q24 9 22 19Q20 25 17 27Q19 15 16 4Z', '#AE9CC0', ' opacity="0.8"') + E(13.5, 12, 2.2, 4, '#E6DDF0', ' opacity="0.9"') + `</g>`);
  // summer fluff: cotton-grass tuft (white silky hairs fanning from a tiny stem tip)
  {
    let hairs = '';
    for (let i = 0; i < 11; i++) { const a = -Math.PI * 0.95 + i * Math.PI * 0.9 / 10, l = 10 + (i % 3) * 1.6; hairs += `M16 21Q${f(16 + Math.cos(a) * l * 0.5)} ${f(21 + Math.sin(a) * l * 0.62)} ${f(16 + Math.cos(a) * l)} ${f(21 + Math.sin(a) * l)}`; }
    out.fluff = svg(32, 32, C(16, 15, 13, 'url(#c)') + S(hairs, '#E1E7E3', 2.2) + S(hairs, '#FFFFFF', 1.2) + S('M16 21L16 30', '#A9B39A', 1.4) + C(16, 21, 1.8, '#D9DECF'),
      rg('c', [[0, '#FFFFFF', 0.6], [1, '#FFFFFF', 0]]));
  }
  // autumn: tiny dwarf-birch leaves (round, crenate), muted ochre / rust
  const birch = (fill, ol, vein) => {
    const pts = []; const n = 14;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n, rr = (i % 2 ? 9.2 : 10.6); pts.push([16 + Math.cos(a) * rr * 0.92, 15 + Math.sin(a) * rr]); }
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`; for (let i = 1; i < pts.length; i++) { const p = pts[i], q = pts[i - 1]; d += `Q${f((p[0] + q[0]) / 2 + (p[0] - 16) * 0.12)} ${f((p[1] + q[1]) / 2 + (p[1] - 15) * 0.12)} ${f(p[0])} ${f(p[1])}`; } d += 'Z';
    return P(d, fill, OL(ol, 1.6)) + S('M16 30L16 6M16 14L11 10M16 14L21 10M16 20L10 16M16 20L22 16', vein, 1.1);
  };
  out.leaf_a = svg(32, 32, `<g transform="rotate(14 16 16)">` + birch('#C9A86A', '#8E7342', '#A88A50') + `</g>`);
  out.leaf_b = svg(32, 32, `<g transform="rotate(-20 16 16)">` + birch('#B98361', '#835A3F', '#9C6C4D') + `</g>`);
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#EAF4FF') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#F0F7FF', 0.6], [1, '#F0F7FF', 0]]));
  const starPts = (cx, cy, ro, ri) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : ro; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return p; };
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P(poly(starPts(16, 16.8, 11.5, 5.4)), '#FFF6DA', OL('#FFF6DA', 2.4)) + P(poly(starPts(15.6, 16.2, 6.5, 3)), '#FFFFFF'),
    rg('t', [[0, '#FFF8E4', 0.45], [1, '#FFF8E4', 0]]));
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFFFF', ' opacity="0.9"'),
    rg('m', [[0, '#FFFBF0', 0.8], [0.4, '#F4F8FF', 0.3], [1, '#F4F8FF', 0]]));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // feather: tiny white tern feather with a soft grey vane
  out.feather = svg(32, 32, `<g transform="rotate(-38 16 16)">` + P('M16 3Q23 9 22 18Q21 25 16 29Q11 25 10 18Q9 9 16 3Z', '#F8F8F6', OL('#A3AEB9', 1.6)) +
    P('M16 3Q23 9 22 18Q21 21 19 23Q18 12 16 3Z', '#D3DAE1', ' opacity="0.9"') + S('M16 6L16 31M16 14L12 11M16 18L11.5 15.5M16 14L20 11M16 18L20.5 15.5', '#A3AEB9', 1.1) + `</g>`);
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  const keepEnv = new Set(['sun', 'moon', 'cloud_a', 'cloud_b', ...MOODS.flatMap(m => ['far', 'mid', 'ground'].map(l => l + '_' + m))]);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg') && !keepEnv.has(fn.slice(0, -4))) { fs.unlinkSync(path.join(env, fn)); console.log('removed old env', fn); }
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); }
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b'));
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 3 + ' layers + sun, moon, clouds) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, SNOW, GROUND_BOTTOM, FAR_BASE, MID_BASE, GROUND_LINE, SEA_Y, FAR_ANCHOR, RIM };
if (require.main === module) main();
