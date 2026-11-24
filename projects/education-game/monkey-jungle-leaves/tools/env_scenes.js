// Lolo's Jungle Leaf Match: environment preview scenes + seam proof + particle/prop sheet (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "night", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<morning|noon|sunset|night>.png, docs/art/env_seams.png,
// docs/art/env_particles.png and prints a seam score + opacity check per layer.
//
// ================================== DRAW RECIPE (paste into render.js; logical px) ==================================
// const ENV_SKY = {   // matches LL.Weather ambient (skyTop → skyBottom over 0..groundY; sunset has a pink middle stop)
//   morning: { stops: ['#A9D2EE', '#D8E6EA', '#FBE3BC'], horizon: '#FFE6C4' },
//   noon:    { stops: ['#62B4EA', '#9DD0F0', '#D6EEF8'], horizon: '#EEF8F0' },
//   sunset:  { stops: ['#9A8ED0', '#F0A6BC', '#FFBF88'], horizon: '#FFD2A0' },
//   night:   { stops: ['#1E2A4A', '#2A3A62', '#3A4F7A'], horizon: '#4E6694' },
// };
// const ENV_GROUND_FILL = GROUND_FILL from tools/art_env.js (only needed if H > ground bottom; never at k = 1).
// function envLayers(layout, mood, scroll) {          // layout = world.layout (W, H, groundY); scroll = w.scroll (px)
//   const W = layout.W, H = layout.H, gy = layout.groundY;
//   const k = H > W * 1.6 ? 1.36 : 1;                  // tall portrait: layers ×1.36, else ×1
//   const lay = (n, h, y, par) => ({ n: n + '_' + mood, w: 1200 * k, h: h * k, y, x0: -(((scroll * par) % (1200 * k)) + 1200 * k) % (1200 * k) });
//   return {
//     k,
//     far:    lay('far', 420, gy - 20 - 120 * k - 420 * k, 0.15), // bottom hidden behind mid's opaque bush band (mid svg y 240)
//     mid:    lay('mid', 360, gy - 20 - 360 * k, 0.4),             // bottom = gy − 20 (hidden under the ground's moss)
//     ground: lay('ground', 260, gy - 30 - 40 * k, 1.0),           // svg y 40 (moss edge) lands exactly on gy − 30
//     fillY:  gy - 30 + 220 * k,                                    // below this fill ENV_GROUND_FILL[mood] to H (if < H)
//     log:    (lolo) => ({ s: 1.3 * lolo.h / 320, x: lolo.x - 160 * s, y: lolo.y - 34 * s }),  // env/log.svg seat (160,34) at feet
//   };
// }
// Draw: for each of far, mid, ground: for (x = L.x0; x < W; x += L.w) drawImage(tile, round(x), round(L.y), round(L.w) + 1, round(L.h)).
// Order: sky gradient (0 → gy) + horizon glow band (gy − 560k … gy − 120k) → stars (night) → sun / moon → clouds → far → mid →
// ground → tree → log → Lolo → particles. Crossfade: both stacks (old at 1, new at the mix alpha) — layers are opaque below
// their silhouettes (far y ≥ 300, mid y ≥ 232, ground y ≥ 44).
// Heights (svg): far giant tree crowns y 90..190, waterfall cliff top y 156; mid palm crowns y 10..90, bush band tops y 195..230;
// ground grass tips up to y 22.
// =====================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const { GROUND_FILL, MOODS } = require('./art_env.js');

const SKY = {
  morning: { stops: ['#A9D2EE', '#D8E6EA', '#FBE3BC'], horizon: '#FFE6C4', sun: [0.2, 0.32], moon: 0, clouds: 0.95 },
  noon: { stops: ['#62B4EA', '#9DD0F0', '#D6EEF8'], horizon: '#EEF8F0', sun: [0.75, 0.12], moon: 0, clouds: 1 },
  sunset: { stops: ['#9A8ED0', '#F0A6BC', '#FFBF88'], horizon: '#FFD2A0', sun: [0.82, 0.42], moon: 0, clouds: 0.85 },
  night: { stops: ['#1E2A4A', '#2A3A62', '#3A4F7A'], horizon: '#4E6694', sun: null, moon: [0.78, 0.16], clouds: 0.25 },
};
const PARTS = ['petal_a', 'petal_b', 'leaf_a', 'leaf_b', 'pollen', 'firefly', 'sparkle', 'star', 'puff', 'confetti_a', 'confetti_b'];
const NAMES = ['env/sun', 'env/moon', 'env/cloud1', 'env/cloud2', 'env/cloud3', 'env/log', ...PARTS.map(p => 'particles/' + p)];
for (const m of MOODS) NAMES.push('env/far_' + m, 'env/mid_' + m, 'env/ground_' + m);
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const SIZES = [[1556, 720], [960, 720], [720, 1556]];

function pageScene({ W, H, mood, sky, src, fill, scroll }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const portrait = H > W, gy = H - 90, k = H > W * 1.6 ? 1.36 : 1;
    const lay = (n, h, y, par) => ({ n: 'env/' + n + '_' + mood, w: 1200 * k, h: h * k, y, x0: -(((scroll * par) % (1200 * k)) + 1200 * k) % (1200 * k) });
    const L = { far: lay('far', 420, gy - 20 - 120 * k - 420 * k, 0.15), mid: lay('mid', 360, gy - 20 - 360 * k, 0.4), ground: lay('ground', 260, gy - 30 - 40 * k, 1), fillY: gy - 30 + 220 * k };
    // sky
    const sk = g.createLinearGradient(0, 0, 0, gy); sky.stops.forEach((s, i) => sk.addColorStop(i / (sky.stops.length - 1), s));
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const hz = g.createLinearGradient(0, gy - 560 * k, 0, gy - 120 * k);
    hz.addColorStop(0, sky.horizon + '00'); hz.addColorStop(0.7, sky.horizon + '77'); hz.addColorStop(1, sky.horizon + 'AA');
    g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 560 * k), W, 440 * k);
    const spr = (n, x, y, w, a = 1, rot = 0) => { const i = im[n]; const h = w * i.height / i.width; g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot); g.drawImage(i, -w / 2, -h / 2, w, h); g.restore(); };
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    if (mood === 'night') for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * gy * 0.6, r = 0.8 + rnd() * 1.6; g.fillStyle = `rgba(255,250,225,${0.5 + rnd() * 0.5})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    if (sky.sun) spr('env/sun', sky.sun[0] * W, sky.sun[1] * H, portrait ? 150 : 160);
    if (sky.moon) spr('env/moon', sky.moon[0] * W, sky.moon[1] * H, portrait ? 140 : 150);
    ['cloud1', 'cloud3', 'cloud2'].forEach((n, i) => spr('env/' + n, ((i + 0.4) / 3) * W, (portrait ? 170 : 60) + (i % 2) * 50, 280 * (1.05 - (i % 3) * 0.12), sky.clouds));
    for (const nm of ['far', 'mid', 'ground']) { const l = L[nm]; for (let x = l.x0; x < W; x += l.w) g.drawImage(im[l.n], Math.round(x), Math.round(l.y), Math.round(l.w) + 1, Math.round(l.h)); }
    if (L.fillY < H) { g.fillStyle = fill; g.fillRect(0, L.fillY - 1, W, H - L.fillY + 1); }
    // tree placeholder (DESIGN §2: two trunks + branch band + row vines + leaf cards in the 4 leaf greens)
    const bx = portrait ? 150 : 300, bw = portrait ? W - 190 : W - 300 - 60, by = portrait ? 300 : 120;
    const bark = '#8A6A4E', barkD = '#5E4532';
    g.fillStyle = bark; g.strokeStyle = barkD; g.lineWidth = 4;
    for (const tx of [bx, bx + bw - 34]) { g.beginPath(); g.roundRect(tx, by, 34, gy + 4 - by, 8); g.fill(); g.stroke(); }
    g.beginPath(); g.roundRect(bx - 20, by - 30, bw + 40, 34, 16); g.fill(); g.stroke();
    const greens = [['#3E9A5E', '#286B40'], ['#3A9488', '#23645B'], ['#7AA845', '#52762A'], ['#4F8F3C', '#33622A']];
    const cols = portrait ? 3 : 4, rows = portrait ? 4 : 3, cw = portrait ? 140 : 118, ch = cw / 0.78, gapX = Math.max(18, 0.16 * cw), gapY = Math.max(30, 0.26 * cw);
    const gx0 = bx + (bw - (cols * cw + (cols - 1) * gapX)) / 2, gy0 = by + 60;
    for (let r = 0; r < rows; r++) {
      const ry = gy0 + r * (ch + gapY);
      g.strokeStyle = '#46612A'; g.lineWidth = 5; g.beginPath(); g.moveTo(bx + 10, ry - 0.62 * gapY); g.quadraticCurveTo(bx + bw / 2, ry - 0.62 * gapY + bw * 0.06, bx + bw - 10, ry - 0.62 * gapY); g.stroke();
      for (let q = 0; q < cols; q++) {
        const cx = gx0 + q * (cw + gapX) + cw / 2, cy = ry + ch / 2, [fc, dc] = greens[(r * cols + q) % 4], under = (r + q) % 5 === 2;
        g.beginPath(); g.moveTo(cx, cy - ch / 2); g.bezierCurveTo(cx + cw * 0.62, cy - ch * 0.55, cx + cw * 0.55, cy + ch * 0.2, cx, cy + ch / 2); g.bezierCurveTo(cx - cw * 0.55, cy + ch * 0.2, cx - cw * 0.62, cy - ch * 0.55, cx, cy - ch / 2);
        g.fillStyle = under ? '#F3F6DF' : fc; g.fill(); g.strokeStyle = under ? '#C9D9A8' : dc; g.lineWidth = 4; g.stroke();
        if (mood === 'night' && !under) { g.strokeStyle = 'rgba(190,215,255,0.55)'; g.lineWidth = 2; g.stroke(); }
        if (under) { g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(cx, cy, cw * 0.22, 0, 7); g.fill(); }
        else { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy - ch * 0.4); g.lineTo(cx, cy + ch * 0.4); g.stroke(); }
      }
    }
    // log + Lolo stand-in (cocoa blob) on it
    const lo = portrait ? { x: 100, y: gy + 12, h: 140 } : { x: 110, y: gy + 10, h: 150 };
    const ls = 1.3 * lo.h / 320, li = im['env/log'];
    g.drawImage(li, lo.x - 160 * ls, lo.y - 34 * ls, 320 * ls, 140 * ls);
    g.fillStyle = '#9A6A45'; g.strokeStyle = '#5A3A22'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(lo.x, lo.y - lo.h * 0.3, lo.h * 0.28, lo.h * 0.3, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(lo.x + 6, lo.y - lo.h * 0.78, lo.h * 0.24, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#F6D2A8'; g.beginPath(); g.ellipse(lo.x + 14, lo.y - lo.h * 0.74, lo.h * 0.15, lo.h * 0.12, 0, 0, 7); g.fill();
    // particles per mood
    const parts = { morning: ['pollen', 'sparkle', 'pollen', 'pollen', 'sparkle'], noon: ['leaf_a', 'leaf_b', 'sparkle', 'leaf_a'], sunset: ['petal_a', 'petal_b', 'pollen'], night: [] }[mood];
    parts.forEach((p, j) => spr('particles/' + p, 80 + j * (W - 160) / Math.max(1, parts.length - 1), (portrait ? 360 : 120) + ((j * 137) % 260), 28, 1, j * 0.8));
    if (mood === 'night') for (let i = 0; i < 26; i++) spr('particles/firefly', rnd() * W, gy * 0.4 + rnd() * gy * 0.62, 22 + rnd() * 10, 0.6 + rnd() * 0.4);
    if (mood === 'sunset') { g.strokeStyle = 'rgba(60,40,70,0.75)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const x = W * 0.3 + i * 34, y = (portrait ? 230 : 90) + (i % 2) * 14; g.beginPath(); g.moveTo(x - 9, y - 4); g.quadraticCurveTo(x - 4, y - 7, x, y); g.quadraticCurveTo(x + 4, y - 7, x + 9, y - 4); g.stroke(); } }
    // ground line marker
    g.save(); g.setLineDash([10, 8]); g.strokeStyle = 'rgba(200,0,120,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke(); g.restore();
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, moods }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const Ls = [['far', 420, 300], ['mid', 360, 232], ['ground', 260, 44]];   // name, height, opaque-from y
    const rowOf = h => h / 2 + 12;
    let total = 0; for (const m of moods) for (const [, h] of Ls) total += rowOf(h);
    const out = document.createElement('canvas'); out.width = 1800; out.height = total;
    const o = out.getContext('2d'); o.fillStyle = '#E04AC0'; o.fillRect(0, 0, out.width, out.height);   // magenta: holes show
    const scores = []; let y = 0;
    for (const m of moods) for (const [ln, h, op] of Ls) {
      const n = 'env/' + ln + '_' + m, im = await load(src[n]), rowH = rowOf(h);
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.drawImage(im, 0, 0, 1200, h); g.drawImage(im, 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0; for (let x = 100; x < 1100; x++) sum += col(x, x + 1);
      let holes = 0; for (let yy = op; yy < h; yy++) for (let x = 0; x < 1200; x++) if (d[(yy * 2400 + x) * 4 + 3] < 250) holes++;
      scores.push(`${n.padEnd(20)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}  holes(y≥${op})=${holes}`);
      o.drawImage(c, 0, y, 1200, h / 2);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + h / 2); o.stroke(); o.restore();
      const zh = (rowH - 12) / 4, zy = ln === 'ground' ? 20 : 150;
      o.imageSmoothingEnabled = false; o.drawImage(c, 1126, zy, 148, zh, 1210, y, 592, zh * 4); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1506, y); o.lineTo(1506, y + zh * 4); o.stroke(); o.restore();
      y += rowH;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageSheet({ src, parts }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1500; c.height = 900; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, '#62B4EA'); gr.addColorStop(1, '#D6EEF8'); g.fillStyle = gr; g.fillRect(0, 0, 1100, 240);
    g.fillStyle = '#26365C'; g.fillRect(1100, 0, 400, 240);
    let x = 10; for (const n of ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3']) { const i = await load(src[n]); const s = n === 'env/sun' ? 1 : 0.85; g.drawImage(i, x, 30, i.width * s, i.height * s); x += i.width * s + 10; }
    g.drawImage(await load(src['env/moon']), 1200, 20);
    g.fillStyle = '#B9C89A'; g.fillRect(0, 240, 1500, 220);
    const lgI = await load(src['env/log']); g.drawImage(lgI, 40, 280); g.drawImage(lgI, 420, 330, 160, 70);
    g.strokeStyle = 'red'; g.lineWidth = 2; g.beginPath(); g.moveTo(40 + 150, 280 + 34); g.lineTo(40 + 170, 280 + 34); g.moveTo(200, 304); g.lineTo(200, 324); g.stroke();
    const bgs = ['#D6EEF8', '#26365C', '#F0A6BC'];
    for (let r = 0; r < 3; r++) { g.fillStyle = bgs[r]; g.fillRect(0, 470 + r * 140, 1500, 140); for (let i = 0; i < parts.length; i++) g.drawImage(await load(src['particles/' + parts[i]]), 14 + i * 134, 488 + r * 140, 104, 104); }
    return c.toDataURL('image/png');
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  for (const [W, H] of SIZES) for (const m of MOODS) {
    const tag = `${W}x${H}_${m}`; if (only && !tag.includes(only)) continue;
    save(await pg.evaluate(pageScene, { W, H, mood: m, sky: SKY[m], src: SRC, fill: GROUND_FILL[m], scroll: 700 }), path.join(ART, `env_${tag}.png`));
  }
  if (!only || only === 'seams') { const sm = await pg.evaluate(pageSeams, { src: SRC, moods: MOODS }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n')); }
  if (!only || only === 'sheet') save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS }), path.join(ART, 'env_particles.png'));
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
