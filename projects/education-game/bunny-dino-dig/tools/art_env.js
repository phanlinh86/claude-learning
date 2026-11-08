// Bun's Dino Dig: dinosaur-valley environment + particle art generator (100 % original, hand-laid flat-cartoon SVG).
// Writes game/assets/default/env/{far,mid,ground}_{morning,noon,sunset,night}.svg, env/{sun,moon,cloud_a,cloud_b,
// smoke}.svg and game/assets/default/particles/{sand,dust,leaf_a,leaf_b,sparkle,star,firefly,mote,confetti_a,
// confetti_b,dot,feather}.svg; any other (old) particle file is deleted.                          (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Tiling: every layer is 1200 wide. Height fields are sums of periodic bumps whose distance is measured modulo 1200,
// and every prop that crosses x = 0 / 1200 is drawn twice (at x and x -/+ 1200), so both edges match pixel for pixel.
// Colour rule (DESIGN §3): calm, slightly desaturated valley; no answer hue (red/blue/yellow/green/orange/purple/pink)
// in a saturated form anywhere; the dig sand is a muted beige a touch darker / greyer than the mound sand #E9CF9A.
//
// Layer anchors (see env_scenes.js envLayout() for the screen maths):
//   far    0 0 1200 720 : mesas, mountains, volcano (crater centre VOLCANO = (836, 318)), long-neck dinos, araucaria
//                         trees; the content starts at y ≈ 250 (smoke) / 300 (peaks); above is transparent.
//                         FAR_BASE = 690 is the line that sits on the dig-site horizon (sandY); below it is hidden.
//   mid    0 0 1200 300 : tree ferns, cycads, palms, horsetails, rocks; bases on MID_BASE = 290.
//   ground 0 0 1200 260 : the dig site. Transparent above a soft grass / sand edge (y ≈ 10…34); GROUND_LINE = 30 is
//                         the nominal horizon; rope posts with pennants stand on y ≈ 50; the sand fades to
//                         SAND_BOTTOM[m] at the bottom row (the render fills below the tile with that colour).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const FAR_BASE = 690, MID_BASE = 290, GROUND_LINE = 30;
const VOLCANO = { x: 836, y: 318 };   // crater centre in far-tile coordinates (for the render's animated smoke)
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
// periodic height field: base + Σ h·bump(dist / w); bump = smooth gaussian, or 'mesa' (flat top, steep sides)
const field = (bumps, base) => x => base + bumps.reduce((s, [c, h, w, kind]) => {
  const d = pd(x, c) / w;
  return s + h * (kind === 'mesa' ? 1 / (1 + Math.pow(d, 8)) : Math.exp(-d * d));
}, 0);
const fillUnder = (y, yb, step = 4) => { const p = [[0, yb]]; for (let x = 0; x <= W; x += step) p.push([x, y(x)]); p.push([W, yb]); return poly(p); };
const edge = (y, dy = 0, step = 4) => { const p = []; for (let x = 0; x <= W; x += step) p.push([x, y(x) + dy]); return line(p); };

// ---------------- palettes ----------------
// sky gradient stops per mood (render paints them from y 0 to the dig-site horizon sandY; below that, the last stop)
const SKY = {
  morning: [[0, '#BFE6F2'], [1, '#FBE9C9']],
  noon: [[0, '#7CC7EE'], [1, '#CDEBF6']],
  sunset: [[0, '#B98BB5'], [0.42, '#F6A86B'], [1, '#F9D7A0']],
  night: [[0, '#1F2A55'], [1, '#3E4C7E']],
};
// dig-site sand (top of the ground tile, near the horizon) and its bottom colour (fill below the tile)
const SAND = { morning: '#E3CDA2', noon: '#E4CB98', sunset: '#E0BE96', night: '#7F86A2' };
const SAND_BOTTOM = { morning: '#D8BC8A', noon: '#D9B984', sunset: '#D3AB82', night: '#697090' };
// mood grading: every base colour is mixed toward TINT[m] by t, then far things are hazed toward HAZE[m]
const TINT = { morning: ['#F4E4CC', 0.14], noon: ['#FFFFFF', 0.0], sunset: ['#7E5378', 0.34], night: ['#3A4A76', 0.56] };
const HAZE = { morning: '#F6E7CF', noon: '#CFE6EE', sunset: '#F4C49A', night: '#46557F' };
const RIM = { morning: '#FFF3DC', noon: '#FFFFFF', sunset: '#FFD9A8', night: '#BFD0F2' };
const tone = (m, c, haze = 0) => mix(mix(c, TINT[m][0], TINT[m][1]), HAZE[m], haze);
const dk = (c, t = 0.3) => mix(c, '#2E3A3A', t), lt = (c, t = 0.3) => mix(c, '#FFFFFF', t);
// base (noon) colours, all muted
const BASE = {
  range: '#B7C3CC', mesa: '#D9B9A0', mesaShade: '#C49F88', volcano: '#A89AA0', volcanoTop: '#94868E', crater: '#D99A80',
  hillMid: '#AFC6A0', hillNear: '#9DB98E', dino: '#7FA496', dinoBelly: '#A9C6B6', dinoSpot: '#97B9AA', tree: '#88A889',
  fern: '#88AE80', fern2: '#9FC08E', cycad: '#7EA37A', palm: '#94B37F', trunk: '#A98C6E', trunk2: '#8F7459',
  rock: '#B9AFA4', rockShade: '#A0958B', horsetail: '#9BB487', cone: '#C7A574',
};

// =====================================================================================================
// FAR (0 0 1200 720), bottom anchored
// =====================================================================================================
// friendly long-neck dinosaur (original): plump body, gently S-curved neck, small round head with a smile, facing right.
// origin = ground point under the body centre, s = scale (s = 1 → ~190 tall)
function longNeck(x, y, s, col, belly, spot, eyeCol, flip = false) {
  const X = v => x + (flip ? -v : v) * s, Y = v => y + v * s;
  let o = '';
  // tail (thick wedge that tapers to a rounded tip, sweeping low behind)
  o += P(`M${f(X(-40))} ${f(Y(-70))}C${f(X(-90))} ${f(Y(-66))} ${f(X(-125))} ${f(Y(-40))} ${f(X(-150))} ${f(Y(-22))}` +
    `C${f(X(-158))} ${f(Y(-16))} ${f(X(-152))} ${f(Y(-10))} ${f(X(-142))} ${f(Y(-14))}C${f(X(-110))} ${f(Y(-26))} ${f(X(-80))} ${f(Y(-36))} ${f(X(-40))} ${f(Y(-36))}Z`, col);
  // legs (stumpy, rounded feet)
  for (const [lx, w] of [[-44, 21], [-20, 20], [26, 21], [48, 20]]) o += P(`M${f(X(lx - w / 2))} ${f(Y(-40))}L${f(X(lx - w / 2 - 1))} ${f(Y(-6))}Q${f(X(lx - w / 2))} ${f(Y(0))} ${f(X(lx))} ${f(Y(0))}Q${f(X(lx + w / 2))} ${f(Y(0))} ${f(X(lx + w / 2 + 1))} ${f(Y(-6))}L${f(X(lx + w / 2))} ${f(Y(-40))}Z`, col);
  // neck: from the shoulder up to the head
  o += P(`M${f(X(30))} ${f(Y(-86))}C${f(X(64))} ${f(Y(-104))} ${f(X(70))} ${f(Y(-150))} ${f(X(88))} ${f(Y(-180))}` +
    `L${f(X(112))} ${f(Y(-174))}C${f(X(96))} ${f(Y(-146))} ${f(X(90))} ${f(Y(-96))} ${f(X(62))} ${f(Y(-50))}Z`, col);
  // body
  o += E(X(0), Y(-62), 70 * s, 40 * s, col);
  // belly, back spots
  o += P(`M${f(X(-52))} ${f(Y(-44))}Q${f(X(0))} ${f(Y(-14))} ${f(X(56))} ${f(Y(-42))}Q${f(X(0))} ${f(Y(-30))} ${f(X(-52))} ${f(Y(-44))}Z`, belly, ' opacity="0.8"');
  for (const [sx, sy, r] of [[-26, -88, 7], [-4, -94, 8], [18, -90, 6.5], [-40, -76, 5]]) o += E(X(sx), Y(sy), r * s, r * 0.72 * s, spot);
  // head
  o += E(X(104), Y(-182), 23 * s, 15 * s, col);
  o += C(X(110), Y(-186), 3.4 * s, eyeCol);
  o += S(`M${f(X(112))} ${f(Y(-176))}Q${f(X(118))} ${f(Y(-172))} ${f(X(124))} ${f(Y(-177))}`, eyeCol, 2 * s);
  return o;
}
// araucaria (monkey-puzzle) tree silhouette: thin trunk, tiers of tufted branches, umbrella crown
function araucaria(x, y, h, col) {
  let o = S(`M${f(x)} ${f(y)}L${f(x)} ${f(y - h * 0.92)}`, col, Math.max(2.2, h * 0.035));
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const ty = y - h * (0.42 + i * 0.13), w = h * (0.26 - i * 0.035);
    o += P(`M${f(x - w)} ${f(ty + 4)}Q${f(x - w * 0.5)} ${f(ty - 9)} ${f(x)} ${f(ty - 6)}Q${f(x + w * 0.5)} ${f(ty - 9)} ${f(x + w)} ${f(ty + 4)}Q${f(x)} ${f(ty)} ${f(x - w)} ${f(ty + 4)}Z`, col);
  }
  o += E(x, y - h * 0.97, h * 0.16, h * 0.07, col);
  return o;
}
function far(m) {
  const r = rng(11 + MOODS.indexOf(m)), q = c => tone(m, c);
  const sky = SKY[m];
  let o = '', defs = '';
  const rim = (y, alpha) => S(edge(y, 2.5), RIM[m], 3, ` opacity="${alpha}"`);
  // 1 back range: rounded mountains + two flat-topped sandstone mesas (very hazy)
  const yR = field([[90, -210, 70], [250, -150, 90], [470, -230, 60], [600, -130, 80], [1010, -250, 75], [1120, -140, 70]], 560);
  o += P(fillUnder(yR, 720), tone(m, BASE.range, 0.55)) + rim(yR, m === 'night' ? 0.35 : 0.3);
  const yM = field([[330, -150, 70, 'mesa'], [1180, -120, 55, 'mesa'], [640, -60, 120]], 590);
  const mesaC = tone(m, BASE.mesa, 0.5), mesaS = tone(m, BASE.mesaShade, 0.5);
  o += P(fillUnder(yM, 720), mesaC);
  // mesa strata: two soft horizontal bands clipped to the mesa shape
  defs += `<clipPath id="mc"><path d="${fillUnder(yM, 720)}"/></clipPath>`;
  o += `<g clip-path="url(#mc)" opacity="0.55">` + R(0, 482, W, 10, mesaS) + R(0, 506, W, 6, mesaS) + R(0, 528, W, 12, mesaS) + `</g>`;
  o += rim(yM, 0.35);
  // morning mist band over the back range
  if (m === 'morning' || m === 'noon') {
    defs += lg('mist', [[0, HAZE[m], 0], [0.5, HAZE[m], m === 'morning' ? 0.75 : 0.45], [1, HAZE[m], 0]], V);
    o += R(0, 520, W, 110, 'url(#mist)');
  }
  // 2 the volcano: a squat rounded cone with a soft crater, gentle smoke puff above (white, low alpha)
  const vx = VOLCANO.x, vy = VOLCANO.y;
  const volc = xx => {
    const vc = tone(m, BASE.volcano, 0.32), vt = tone(m, BASE.volcanoTop, 0.32);
    let s = '';
    s += P(`M${f(xx - 250)} 640C${f(xx - 170)} 600 ${f(xx - 110)} ${f(vy + 70)} ${f(xx - 62)} ${f(vy + 8)}Q${f(xx - 50)} ${f(vy - 4)} ${f(xx - 34)} ${f(vy)}` +
      `Q${f(xx)} ${f(vy + 10)} ${f(xx + 34)} ${f(vy)}Q${f(xx + 50)} ${f(vy - 4)} ${f(xx + 62)} ${f(vy + 8)}C${f(xx + 110)} ${f(vy + 70)} ${f(xx + 170)} 600 ${f(xx + 250)} 640Z`, vc);
    // shadow side + cap
    s += P(`M${f(xx + 8)} ${f(vy + 8)}Q${f(xx + 34)} ${f(vy)} ${f(xx + 62)} ${f(vy + 8)}C${f(xx + 110)} ${f(vy + 70)} ${f(xx + 170)} 600 ${f(xx + 250)} 640L${f(xx + 60)} 640C${f(xx + 70)} 520 ${f(xx + 40)} ${f(vy + 70)} ${f(xx + 8)} ${f(vy + 8)}Z`, vt, ' opacity="0.55"');
    s += P(`M${f(xx - 62)} ${f(vy + 8)}Q${f(xx - 50)} ${f(vy - 4)} ${f(xx - 34)} ${f(vy)}Q${f(xx)} ${f(vy + 10)} ${f(xx + 34)} ${f(vy)}Q${f(xx + 50)} ${f(vy - 4)} ${f(xx + 62)} ${f(vy + 8)}` +
      `Q${f(xx + 74)} ${f(vy + 30)} ${f(xx + 52)} ${f(vy + 36)}Q${f(xx + 30)} ${f(vy + 26)} ${f(xx + 14)} ${f(vy + 40)}Q${f(xx - 6)} ${f(vy + 28)} ${f(xx - 26)} ${f(vy + 42)}Q${f(xx - 46)} ${f(vy + 28)} ${f(xx - 70)} ${f(vy + 34)}Q${f(xx - 72)} ${f(vy + 20)} ${f(xx - 62)} ${f(vy + 8)}Z`, vt);
    // crater lip with a faint warm glow inside
    s += E(xx, vy + 3, 30, 6, tone(m, BASE.crater, m === 'night' ? 0 : 0.35), ` opacity="${m === 'night' ? 0.85 : m === 'sunset' ? 0.7 : 0.45}"`);
    s += S(`M${f(xx - 52)} ${f(vy + 2)}Q${f(xx)} ${f(vy + 16)} ${f(xx + 52)} ${f(vy + 2)}`, RIM[m], 3, ' opacity="0.45"');
    return s;
  };
  o += both(volc, vx, 260);
  // soft static smoke puff (radial gradient, no blur)
  defs += rg('sm', [[0, '#FFFFFF', m === 'night' ? 0.42 : 0.7], [0.6, '#FFFFFF', m === 'night' ? 0.2 : 0.35], [1, '#FFFFFF', 0]]);
  o += both(xx => C(xx - 6, vy - 26, 26, 'url(#sm)') + C(xx + 14, vy - 58, 32, 'url(#sm)') + C(xx + 2, vy - 92, 26, 'url(#sm)') + C(xx + 30, vy - 112, 20, 'url(#sm)'), vx, 60);
  // 3 rolling mid hills with araucaria trees and the long-neck dinosaurs
  const yH = field([[60, -60, 140], [300, -70, 150], [560, -40, 110], [760, -70, 140], [960, -36, 90], [1130, -80, 120]], 650);
  const hillC = tone(m, BASE.hillMid, 0.28);
  o += P(fillUnder(yH, 720), hillC) + rim(yH, m === 'night' ? 0.55 : 0.4);
  const treeC = tone(m, BASE.tree, 0.26);
  for (const [tx, th] of [[40, 90], [74, 66], [300, 96], [336, 70], [470, 84], [640, 96], [672, 70]]) o += both(xx => araucaria(xx, yH(tx) + 4, th, treeC), tx, th * 0.3);
  // dinos: a parent walking right on the big hill, a little one following
  const dc = tone(m, BASE.dino, 0.18), db = tone(m, BASE.dinoBelly, 0.18), ds = tone(m, BASE.dinoSpot, 0.18), de = dk(dc, 0.5);
  // (placed right of the volcano so they are on screen whenever the volcano is)
  o += both(xx => longNeck(xx, yH(1120) + 8, 1.12, dc, db, ds, de), 1120, 160);
  o += longNeck(966, yH(966) + 8, 0.56, dc, db, ds, de);
  // night: soft moonlit rim on the dinos' backs
  if (m === 'night' || m === 'sunset') o += both(xx => S(`M${f(xx - 56)} ${f(yH(1120) + 8 - 97)}Q${f(xx - 3)} ${f(yH(1120) + 8 - 123)} ${f(xx + 50)} ${f(yH(1120) + 8 - 101)}`, RIM[m], 3.5, ' opacity="0.6"'), 1120, 160);
  // 4 near hills (darker, warmer), with soft bushes
  const yN = field([[120, -40, 160], [430, -28, 120], [700, -46, 170], [980, -30, 130]], 700);
  const nearC = tone(m, BASE.hillNear, 0.12);
  o += P(fillUnder(yN, 720), nearC) + rim(yN, m === 'night' ? 0.5 : 0.35);
  let bush = '';
  for (let i = 0; i < 16; i++) { const bx = (i + r() * 0.7) * W / 16, by = yN(bx) + 6, br = 9 + r() * 9; bush += both(xx => C(xx - br * 0.7, by, br * 0.75, 'c') + C(xx, by - br * 0.4, br, 'c') + C(xx + br * 0.8, by, br * 0.7, 'c'), bx, br * 2); }
  o += bush.replace(/fill="c"/g, `fill="${dk(nearC, 0.12)}"`);
  return svg(1200, 720, o, defs, `sky ${sky[0][1]} ${sky[sky.length - 1][1]}${sky.length > 2 ? ' (stops ' + sky.map(s => s[0] + ':' + s[1]).join(' ') + ')' : ''}`);
}

// =====================================================================================================
// MID (0 0 1200 300): ferns, cycads, palms, horsetails, rocks; bases on MID_BASE
// =====================================================================================================
// a pinnate frond: spine from (x, y) at angle a (rad, 0 = right, -PI/2 = up) bending by curl over its length.
// notch 0..1: how deep the leaflet notches are (0.15 = feathery palm, 0.4 = fern).
function frondPts(x, y, a, len, curl, wid, notch, n = 14) {
  const sp = [[x, y]]; let ang = a, px = x, py = y;
  for (let i = 1; i <= n; i++) { ang += curl / n; px += Math.cos(ang) * len / n; py += Math.sin(ang) * len / n; sp.push([px, py]); }
  const L = [], Rr = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = sp[i], nx = sp[Math.min(i + 1, n)], pv = sp[Math.max(i - 1, 0)];
    const dx = nx[0] - pv[0], dy = nx[1] - pv[1], d = Math.hypot(dx, dy) || 1;
    const wt = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)), 0.7) * (1 - 0.25 * t);
    const w = i % 2 ? wt : wt * notch;
    const sweep = i % 2 ? len / n * 0.6 : 0;  // leaflet tips lean towards the frond tip
    L.push([p[0] - dy / d * w + dx / d * sweep, p[1] + dx / d * w + dy / d * sweep]);
    Rr.push([p[0] + dy / d * w + dx / d * sweep, p[1] - dx / d * w + dy / d * sweep]);
  }
  return { sp, outline: [...L, sp[n], ...Rr.reverse()] };
}
function frond(x, y, a, len, curl, wid, notch, col, ol, rib) {
  const { sp, outline } = frondPts(x, y, a, len, curl, wid, notch);
  return P(poly(outline), col, OL(ol, 2)) + S(line(sp), rib, 1.6, ' opacity="0.6"');
}
function mid(m) {
  const r = rng(101 + MOODS.indexOf(m)), Y = MID_BASE, hz = m === 'sunset' ? 0.06 : 0.16;
  const c = k => tone(m, BASE[k], hz);
  const fernC = c('fern'), fern2 = c('fern2'), cyc = c('cycad'), palmC = c('palm'), trunk = c('trunk'), trunk2 = c('trunk2');
  const rockC = c('rock'), rockS = c('rockShade'), hors = c('horsetail'), cone = c('cone');
  const rim = RIM[m], rimA = m === 'night' ? 0.55 : 0.35;
  const parts = [];   // [x, half, fn]
  // --- tree fern: gently curved trunk + a crown of arching fronds
  const treeFern = (h, lean) => x => {
    let s = '';
    const top = [x + lean, Y - h];
    const tr = `M${f(x - 9)} ${f(Y)}Q${f(x - 6 + lean * 0.3)} ${f(Y - h * 0.5)} ${f(top[0] - 6)} ${f(top[1])}L${f(top[0] + 6)} ${f(top[1])}Q${f(x + 6 + lean * 0.3)} ${f(Y - h * 0.5)} ${f(x + 9)} ${f(Y)}Z`;
    s += P(tr, trunk, OL(dk(trunk, 0.35), 2.4));
    for (let k = 1; k < 6; k++) { const ty = Y - h * k / 6, tx = x + lean * k / 6 * 0.8; s += S(`M${f(tx - 6)} ${f(ty)}q6 4 12 0`, dk(trunk, 0.3), 1.8, ' opacity="0.7"'); }
    const fr = [[-2.9, 1.1, 0.9], [-2.4, 0.9, 1], [-1.9, 0.6, 1], [-1.25, -0.6, 1], [-0.7, -0.9, 1], [-0.25, -1.1, 0.9]];
    fr.forEach(([a, cu, k], i) => { const col = i % 2 ? fernC : fern2; s += frond(top[0], top[1] + 2, a, 92 * k, cu, 15, 0.38, col, dk(col, 0.32), lt(col, 0.25)); });
    s += C(top[0], top[1] + 2, 7, dk(fernC, 0.15));
    return s;
  };
  // --- cycad: stout scaly trunk, stiff fan of fronds, a little cone
  const cycad = (h, sc) => x => {
    let s = '';
    const tw = 22 * sc;
    s += P(`M${f(x - tw)} ${f(Y)}Q${f(x - tw * 1.1)} ${f(Y - h * 0.6)} ${f(x - tw * 0.8)} ${f(Y - h)}L${f(x + tw * 0.8)} ${f(Y - h)}Q${f(x + tw * 1.1)} ${f(Y - h * 0.6)} ${f(x + tw)} ${f(Y)}Z`, trunk2, OL(dk(trunk2, 0.35), 2.4));
    let sc2 = ''; for (let yy = Y - 8; yy > Y - h + 4; yy -= 10 * sc) for (let xx = -1; xx <= 1; xx++) sc2 += `M${f(x + xx * tw * 0.55 - 5)} ${f(yy)}l5 -5l5 5`;
    s += S(sc2, dk(trunk2, 0.28), 1.6, ' opacity="0.7"');
    const angs = [-3.0, -2.6, -2.2, -1.85, -1.29, -0.94, -0.54, -0.14];
    angs.forEach((a, i) => { const col = i % 2 ? cyc : mix(cyc, fern2, 0.4); s += frond(x, Y - h + 2, a, 70 * sc * (i === 3 || i === 4 ? 1.05 : 1), a < -1.57 ? 0.35 : -0.35, 9 * sc, 0.2, col, dk(col, 0.32), lt(col, 0.2)); });
    s += E(x, Y - h - 4, 9 * sc, 13 * sc, cone, OL(dk(cone, 0.35), 2));
    s += S(`M${f(x - 6 * sc)} ${f(Y - h - 8)}l${f(6 * sc)} 4l${f(6 * sc)} -4M${f(x - 6 * sc)} ${f(Y - h)}l${f(6 * sc)} 4l${f(6 * sc)} -4`, dk(cone, 0.3), 1.4);
    return s;
  };
  // --- palm: slender curved ringed trunk, drooping feathery leaves
  const palm = (h, lean) => x => {
    let s = '';
    const tp = [x + lean, Y - h];
    const pts = []; for (let t = 0; t <= 1.0001; t += 0.1) pts.push([x + lean * t * t, Y - h * t]);
    const L = pts.map(([px, py], i) => [px - 8 + i * 0.35, py]), Rr = pts.map(([px, py], i) => [px + 8 - i * 0.35, py]).reverse();
    s += P(poly([...L, ...Rr]), trunk, OL(dk(trunk, 0.35), 2.4));
    let rings = ''; for (let i = 1; i < pts.length - 1; i++) rings += `M${f(pts[i][0] - 7)} ${f(pts[i][1] + 2)}q7 -4 14 0`;
    s += S(rings, dk(trunk, 0.3), 1.8, ' opacity="0.75"');
    const lv = [[-3.0, -1.4], [-2.55, -1.1], [-2.0, -0.6], [-1.15, 0.6], [-0.6, 1.1], [-0.15, 1.4]];
    lv.forEach(([a, cu], i) => { const col = i % 2 ? palmC : mix(palmC, fern2, 0.35); s += frond(tp[0], tp[1], a, 96, cu, 13, 0.14, col, dk(col, 0.32), lt(col, 0.25)); });
    s += C(tp[0], tp[1] + 2, 6, dk(palmC, 0.2)) + C(tp[0] - 7, tp[1] + 9, 5, dk(trunk, 0.1)) + C(tp[0] + 5, tp[1] + 10, 5, dk(trunk, 0.15));
    return s;
  };
  // --- horsetail clump: segmented stems with whorl ticks
  const horsetail = (n, h) => x => {
    let s = '', ticks = '';
    for (let i = 0; i < n; i++) {
      const sx = x + (i - (n - 1) / 2) * 9, sh = h * (0.7 + 0.3 * ((i * 7) % 5) / 4), bend = (i - (n - 1) / 2) * 4;
      s += S(`M${f(sx)} ${f(Y)}Q${f(sx)} ${f(Y - sh * 0.6)} ${f(sx + bend)} ${f(Y - sh)}`, dk(hors, 0.25), 6.4) + S(`M${f(sx)} ${f(Y)}Q${f(sx)} ${f(Y - sh * 0.6)} ${f(sx + bend)} ${f(Y - sh)}`, hors, 3.6);
      for (let k = 1; k < 5; k++) { const t = k / 5, yy = Y - sh * t, xx = sx + bend * t * t; ticks += `M${f(xx - 7)} ${f(yy + 3)}L${f(xx)} ${f(yy)}L${f(xx + 7)} ${f(yy + 3)}`; }
      s += E(sx + bend, Y - sh - 4, 3, 6, dk(hors, 0.18));
    }
    return s + S(ticks, dk(hors, 0.2), 1.8);
  };
  // --- rock: rounded boulder, one-step shade + soft highlight upper-left
  const rock = (w, h) => x => {
    const d = `M${f(x - w / 2)} ${f(Y + 2)}Q${f(x - w / 2 - 4)} ${f(Y - h * 0.7)} ${f(x - w * 0.15)} ${f(Y - h)}Q${f(x + w * 0.3)} ${f(Y - h * 1.04)} ${f(x + w / 2)} ${f(Y - h * 0.4)}Q${f(x + w / 2 + 4)} ${f(Y)} ${f(x + w / 2 - 4)} ${f(Y + 2)}Z`;
    return P(d, rockC, OL(dk(rockC, 0.35), 2.4)) +
      P(`M${f(x + w * 0.05)} ${f(Y + 1)}Q${f(x + w * 0.35)} ${f(Y - h * 0.45)} ${f(x + w * 0.3)} ${f(Y - h * 0.9)}Q${f(x + w / 2 + 2)} ${f(Y - h * 0.4)} ${f(x + w / 2 - 4)} ${f(Y + 1)}Z`, rockS, ' opacity="0.8"') +
      E(x - w * 0.18, Y - h * 0.7, w * 0.14, h * 0.1, lt(rockC, 0.4), ' opacity="0.8"');
  };
  // --- low fern bush
  const bush = sc => x => {
    let s = '';
    [[-2.85, 0.8], [-2.35, 0.7], [-1.9, 0.5], [-1.24, -0.5], [-0.79, -0.7], [-0.29, -0.8]].forEach(([a, cu], i) => {
      const col = i % 2 ? fernC : fern2; s += frond(x, Y + 2, a, 56 * sc, cu, 10 * sc, 0.38, col, dk(col, 0.32), lt(col, 0.25));
    });
    return s;
  };
  // layout (back to front), period 1200
  const add = (x, half, fn) => parts.push([x, half, fn]);
  add(80, 150, palm(196, 22)); add(800, 150, palm(170, -18));
  add(330, 120, treeFern(118, -10)); add(1010, 120, treeFern(106, 12));
  add(560, 100, cycad(54, 1.15)); add(1140, 100, cycad(40, 0.95)); add(240, 90, cycad(30, 0.85));
  add(440, 40, horsetail(5, 80)); add(920, 40, horsetail(4, 70));
  add(170, 50, rock(72, 46)); add(500, 50, rock(96, 58)); add(705, 50, rock(58, 34)); add(1080, 50, rock(84, 50));
  for (const [x, sc] of [[30, 0.9], [400, 1], [640, 0.85], [880, 1], [1190, 0.8]]) add(x, 70 * sc, bush(sc));
  let o = '';
  for (const [x, half, fn] of parts) o += both(fn, x, half);
  // moon / sun rim: one soft light stroke along everything's top is too costly; use a gentle overall wash instead
  void r; void rim; void rimA;
  return svg(1200, 300, o);
}

// =====================================================================================================
// GROUND (0 0 1200 260): the sandy dig site
// =====================================================================================================
function ground(m) {
  const r = rng(201 + MOODS.indexOf(m));
  const sand = SAND[m], bot = SAND_BOTTOM[m], night = m === 'night';
  const grassC = tone(m, '#A9BE8C', 0.05);
  let o = '', defs = '';
  defs += lg('sd', [[0, lt(sand, 0.06)], [0.25, sand], [1, bot]], V);
  // soft sand top edge (small bumps, period 1200) and grass fringe
  const yT = x => 26 + 3 * Math.sin(2 * Math.PI * x / 400 + 0.7) + 2 * Math.sin(2 * Math.PI * x / 150 + 2.1) + 1.2 * Math.sin(2 * Math.PI * x / 60);
  // grass fringe behind the sand edge
  let gr = '';
  for (let i = 0; i < 90; i++) {
    const x = (i + r() * 0.8) * W / 90, y = yT(x) + 6, h = 8 + r() * 12, w = 4 + r() * 3;
    gr += both(xx => `M${f(xx - w)} ${f(y)}Q${f(xx - 1)} ${f(y - h * 0.6)} ${f(xx + (r() - 0.5) * 6)} ${f(y - h)}Q${f(xx + 1)} ${f(y - h * 0.5)} ${f(xx + w)} ${f(y)}Z`, x, 10);
  }
  o += P(gr, grassC, OL(dk(grassC, 0.25), 1.6));
  const pts = [[0, 260]]; for (let x = 0; x <= W; x += 5) pts.push([x, yT(x)]); pts.push([W, 260]);
  o += P(poly(pts), 'url(#sd)');
  // edge highlight (light from the sky)
  o += S(edge(yT, 1.5, 5), lt(sand, night ? 0.22 : 0.4), 2.4, ` opacity="${night ? 0.5 : 0.7}"`);
  // soft wind ripples (low contrast)
  let rp = '';
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = 70 + r() * 170, l = 40 + r() * 70;
    rp += both(xx => `M${f(xx - l / 2)} ${f(y)}Q${f(xx)} ${f(y - 5)} ${f(xx + l / 2)} ${f(y)}`, x, l / 2 + 2);
  }
  o += S(rp, lt(sand, 0.35), 2.4, ` opacity="${night ? 0.25 : 0.45}"`);
  o += `<g transform="translate(0 2.6)">` + S(rp, dk(sand, 0.12), 1.6, ` opacity="${night ? 0.18 : 0.28}"`) + `</g>`;
  // footprints: a little bunny trail (oval pad + 3 toes) and a three-toed dino trail, very faint
  const fp = dk(sand, night ? 0.1 : 0.12), fpA = night ? 0.4 : 0.5;
  let prints = '';
  const bunnyPrint = (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})">` + E(x, y, 5, 7.5, fp) + C(x - 4.6, y - 9.5, 2.2, fp) + C(x, y - 11.5, 2.3, fp) + C(x + 4.6, y - 9.5, 2.2, fp) + `</g>`;
  const dinoPrint = (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})">` + E(x, y, 7, 6, fp) + P(`M${f(x - 5)} ${f(y - 3)}L${f(x - 13)} ${f(y - 15)}L${f(x - 8)} ${f(y - 16)}L${f(x - 1)} ${f(y - 5)}ZM${f(x - 2.5)} ${f(y - 5)}L${f(x)} ${f(y - 20)}L${f(x + 2.5)} ${f(y - 5)}ZM${f(x + 1)} ${f(y - 5)}L${f(x + 8)} ${f(y - 16)}L${f(x + 13)} ${f(y - 15)}L${f(x + 5)} ${f(y - 3)}Z`, fp) + `</g>`;
  for (let i = 0; i < 7; i++) { const x = 60 + i * 34, y = 200 - i * 14 + (i % 2) * 9; prints += both(xx => bunnyPrint(xx, y, 64), x, 14); }
  for (let i = 0; i < 6; i++) { const x = 660 + i * 52, y = 96 + (i % 2) * 18 + i * 3; prints += both(xx => dinoPrint(xx, y, 80 + (i % 2) * 14), x, 20); }
  o += `<g opacity="${fpA}">${prints}</g>`;
  // pebbles (muted, small, sparse lower down)
  const pebC = [tone(m, '#BDB2A6', 0.0), tone(m, '#C9BCA4', 0.0), tone(m, '#A9A39E', 0.0)];
  let pb = '';
  for (let i = 0; i < 46; i++) {
    const y = 44 + Math.pow(r(), 1.6) * 200, x = r() * W, s = (2.2 + r() * 4.2) * (0.7 + (y - 40) / 220 * 0.5), col = pebC[i % 3];
    pb += both(xx => E(xx + 1, y + s * 0.45, s * 1.1, s * 0.45, dk(sand, 0.16), ' opacity="0.45"') + E(xx, y, s * 1.15, s * 0.78, col, OL(dk(col, 0.28), 1.1)) + E(xx - s * 0.35, y - s * 0.3, s * 0.4, s * 0.22, lt(col, 0.45)), x, s * 1.4 + 2);
  }
  o += pb;
  // rope posts with little pennants along the far edge (muted dusty tones, NOT answer colours)
  const postC = tone(m, '#A3835F', 0.0), ropeC = tone(m, '#C9B48F', 0.0);
  const flagC = [tone(m, '#D3A497'), tone(m, '#9FBFB9'), tone(m, '#DCCB9C'), tone(m, '#B8A9C4')];
  const posts = [90, 390, 690, 990], top = 6, base = 52;
  let rope = '', flags = '', postsS = '';
  for (let i = 0; i < posts.length; i++) {
    const x0 = posts[i] + 6, x1 = posts[(i + 1) % posts.length] + 6 + (i === posts.length - 1 ? W : 0), sag = 18;
    const ry = t => top + 8 + sag * 4 * t * (1 - t) - 2;
    const seg = []; for (let t = 0; t <= 1.0001; t += 0.05) seg.push([x0 + (x1 - x0) * t, ry(t)]);
    rope += line(seg) + line(seg.map(([x, y]) => [x - W, y]));
    for (let k = 1; k < 10; k++) {
      const t = k / 10, fx = (x0 + (x1 - x0) * t) % W, fy = ry(t), col = flagC[(i * 9 + k) % 4];
      const fl = xx => P(`M${f(xx - 7)} ${f(fy)}L${f(xx + 7)} ${f(fy)}L${f(xx + 0.5)} ${f(fy + 15)}Z`, col, OL(dk(col, 0.28), 1.5));
      flags += both(fl, fx, 9);
    }
  }
  for (const x of posts) postsS += both(xx => E(xx + 6, base + 1, 11, 3.2, dk(sand, 0.18), ' opacity="0.5"') + R(xx, top, 12, base - top, postC, ` rx="4"${OL(dk(postC, 0.35), 2)}`) + R(xx + 2.5, top + 4, 3, base - top - 10, lt(postC, 0.3), ' rx="1.5" opacity="0.8"'), x, 14);
  o += postsS + S(rope, dk(ropeC, 0.2), 3.4) + S(rope, ropeC, 1.8) + flags;
  // night: a faint cool moon sheen near the horizon
  if (night) { defs += lg('ms', [[0, '#C9D6F2', 0.22], [1, '#C9D6F2', 0]], V); o += R(0, 24, W, 70, 'url(#ms)'); }
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// SUN, MOON, CLOUDS, SMOKE
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF6D8', 0.9], [0.45, '#FFF1C8', 0.45], [1, '#FFF1C8', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 46, '#FFF4CF', OL('#F4DA9C', 4)) + C(100, 100, 38, '#FFF9E4') + E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-35 86 84)"'), d);
}
function moon() {
  const d = rg('h', [[0, '#E6EEFF', 0.55], [0.5, '#DCE6FA', 0.22], [1, '#DCE6FA', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 44, '#F4F1E4', OL('#C9CBD8', 4)) +
    P('M100 56a44 44 0 0 1 0 88a30 44 0 0 0 0 -88Z', '#E2E0D6', ' opacity="0.8"') +
    C(84, 88, 7, '#E3E1D6') + C(110, 116, 9, '#E3E1D6') + C(116, 80, 5, '#E3E1D6') + C(88, 120, 4, '#E3E1D6') +
    E(82, 74, 10, 6, '#FFFFFF', ' opacity="0.7" transform="rotate(-35 82 74)"'), d);
}
function cloud(type) {
  const blobs = type === 'a' ? [[70, 92, 38], [118, 70, 50], [172, 62, 44], [214, 84, 36], [250, 100, 26], [40, 108, 22]] : [[60, 96, 28], [100, 80, 36], [148, 74, 40], [196, 86, 32], [236, 100, 24], [34, 108, 18]];
  let body = '', shade = '';
  for (const [x, y, rr] of blobs) body += `M${x - rr} ${y}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0Z`;
  body += `M20 106Q20 124 44 124L262 124Q282 124 280 108L276 98L22 98Z`;
  shade = `M20 112Q24 128 46 128L260 128Q282 128 282 112Q270 118 250 116Q200 122 150 116Q100 122 60 116Q34 118 20 112Z`;
  return svg(300, 140, P(body, '#FFFFFF') + P(shade, '#E4ECF4', ' opacity="0.9"') + E(108, 58, 22, 9, '#FFFFFF', ' opacity="0.9"'));
}
function smoke() {
  const d = rg('s', [[0, '#FFFFFF', 0.85], [0.55, '#FFFFFF', 0.5], [1, '#FFFFFF', 0]]);
  return svg(120, 120, C(46, 70, 34, 'url(#s)') + C(72, 52, 38, 'url(#s)') + C(64, 82, 30, 'url(#s)'), d);
}

// =====================================================================================================
// PARTICLES (0 0 32 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.sand = svg(32, 32, P('M7 20Q4 14 9 11Q11 6 17 8Q23 6 25 12Q29 15 26 21Q24 26 17 25Q9 27 7 20Z', '#E2C590', OL('#B08C58', 2)) +
    C(19, 18, 3.6, '#CFAE72') + C(11, 16, 2.4, '#CFAE72') + E(13, 11.5, 3.6, 2, '#F6E3B9'));
  out.dust = svg(32, 32, C(13, 18, 10, 'url(#d)') + C(20, 14, 10, 'url(#d)') + C(19, 21, 9, 'url(#d)'), rg('d', [[0, '#FBF1DE', 0.85], [0.6, '#F3E4C6', 0.45], [1, '#F3E4C6', 0]]));
  { const { sp, outline } = frondPts(5, 28, -0.95, 30, 0.5, 6.5, 0.32, 10);
    out.leaf_a = svg(32, 32, P(poly(outline), '#93B884', OL('#5F8656', 1.6)) + S(line(sp), '#C3DBB4', 1.2)); }
  // ginkgo-like fan leaf (prehistoric) in muted olive
  out.leaf_b = svg(32, 32, `<g transform="rotate(-18 16 16)">` + P('M16 27L16 18Q6 17 4.5 9Q10 3 16 7Q22 3 27.5 9Q26 17 16 18Z', '#B9BC79', OL('#7F8143', 1.8)) +
    P('M16 18Q24 16 27.5 9Q26 17 16 18Z', '#A3A766', ' opacity="0.8"') + S('M16 30L16 17M16 17L9 10M16 17L23 10M16 17L16 8', '#7F8143', 1.1) + `</g>`);
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF6DA') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#FFF8E0', 0.6], [1, '#FFF8E0', 0]]));
  const starPts = (cx, cy, ro, ri) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : ro; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return p; };
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P(poly(starPts(16, 16.8, 11.5, 5.4)), '#FFF3CF', OL('#FFF3CF', 2.4)) + P(poly(starPts(15.6, 16.2, 6.5, 3)), '#FFFFFF'),
    rg('t', [[0, '#FFF6DA', 0.45], [1, '#FFF6DA', 0]]));
  out.firefly = svg(32, 32, C(16, 16, 15.5, 'url(#g)') + C(16, 16, 4.4, '#FFF2B0') + C(15, 15, 1.8, '#FFFFFF'),
    rg('g', [[0, '#FFE58A', 0.95], [0.3, '#FFD978', 0.5], [1, '#FFD978', 0]]));
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFBEE', ' opacity="0.9"'),
    rg('m', [[0, '#FFF7E2', 0.8], [0.4, '#FFF1D4', 0.3], [1, '#FFF1D4', 0]]));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  out.feather = svg(32, 32, `<g transform="rotate(-38 16 16)">` + P('M16 3Q23 9 22 18Q21 25 16 29Q11 25 10 18Q9 9 16 3Z', '#F3EEE2', OL('#8DB0AE', 1.6)) +
    P('M16 3Q23 9 22 18Q21 21 19 23Q18 12 16 3Z', '#B5D0CE', ' opacity="0.9"') + S('M16 6L16 31M16 14L12 11M16 18L11.5 15.5M16 14L20 11M16 18L20.5 15.5', '#8DB0AE', 1.1) + `</g>`);
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); }
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b')); wr(env, 'smoke', smoke());
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 3 + ' layers + sun, moon, clouds, smoke) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, SAND, SAND_BOTTOM, FAR_BASE, MID_BASE, GROUND_LINE, VOLCANO, RIM };
if (require.main === module) main();
