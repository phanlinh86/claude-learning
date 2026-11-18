// Gigi's Peekaboo Windows: environment preview scenes + seam proof + particle sheet (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "rain", "720x1556", "seams")
// NOBLD=<dir> node tools/env_scenes.js 1556   → the same scenes WITHOUT the building placeholder, written to <dir>.
// Writes docs/art/env_<1556x720|960x720|720x1556>_<sunny|breezy|rain|rainbow>.png, docs/art/env_seams.png,
// docs/art/env_particles.png and prints a seam score per layer.
//
// ================================== DRAW RECIPE (paste into render.js; logical px) ==================================
// const ENV_SKY = {   // GW.Weather ambient per mood (crossfade 2.5 s)
//   sunny:   { skyTop: '#8CCBEF', skyBottom: '#E4F3FA', horizon: '#FFF4E2', tint: null },
//   breezy:  { skyTop: '#93CDEA', skyBottom: '#E8F5F3', horizon: '#F2F7E8', tint: null },
//   rain:    { skyTop: '#9AADC6', skyBottom: '#DCE2EA', horizon: '#F0E8DC', tint: 'rgba(70,80,120,0.06)' },
//   rainbow: { skyTop: '#88C6EC', skyBottom: '#F0F3F1', horizon: '#FFF0E4', tint: 'rgba(255,236,220,0.05)' },
// };
// const ENV_ROAD_FILL = { sunny: '#82858B', breezy: '#82858B', rain: '#737880', rainbow: '#7E8288' };  // below the ground tile
// function envLayers(layout, mood, scroll) {          // layout = world.layout (W, H, groundY); scroll = w.scroll (px)
//   const W = layout.W, H = layout.H, gy = layout.groundY;
//   const k = H > W * 1.6 ? 1.36 : 1;                  // skill rule: tall portrait layers ×1.36, else 1
//   const lay = (n, h, y, par) => ({ n: n + '_' + mood, w: 1200 * k, h: h * k, y, x0: -(((scroll * par) % (1200 * k)) + 1200 * k) % (1200 * k) });
//   return {
//     k,
//     far:    lay('far', 420, gy - 26 - 100 * k - 420 * k, 0.15),  // bottom = gy − 26 − 100k (hidden behind mid's back row)
//     mid:    lay('mid', 360, gy - 26 - 360 * k, 0.4),             // bottom = gy − 26 (shop bases meet the pavement back edge)
//     ground: lay('ground', 260, gy - 30 - 40 * k, 1.0),           // svg y 40 (pavement top) lands exactly on gy − 30
//     roadTop: gy - 30 + 70 * k,                                    // svg y 110; = gy + 40 when k = 1 (DESIGN §2)
//     fillY: gy - 30 + 220 * k,                                     // below this fill ENV_ROAD_FILL[mood] to H
//     car:  { s: 0.4 * k,  wheelY: gy - 30 + 114 * k },             // car_a/b (240×120): draw w 240s, bottom of wheels (svg 113) on wheelY
//     bus:  { s: 0.42 * k, wheelY: gy - 30 + 116 * k },             // bus (480×200): wheels bottom svg 197
//   };
// }
// Draw: for each of far, mid, ground: for (x = L.x0; x < W; x += L.w) drawImage(tile, x, L.y, L.w, L.h)  (x0 ≤ 0).
// Order: sky gradient (0 → gy, horizon band gy − 620k … gy − 140 as now) → sun (sunny 1, breezy 1, rain 0, rainbow 0.8) →
// rainbow.svg (1200×600, feet at its bottom; w = min(1.1·W, 1300k), bottom on mid.y + 250k, alpha = ambient.rainbow) →
// clouds (rain: rain_cloud, alpha .95) → far → mid → ground → road fill → cars (behind Gigi) → building → Gigi → particles.
// Crossfade: both stacks (old at 1, new at the mix alpha) — far/mid/ground are opaque below their silhouettes.
// Mid heights (svg, top 0 of the 360 tile): shop roofs y 156 (florist) / 170 (narrow) / 184 (cafe) / 194 (books) / 202 (bakery),
// tree tops y 116..180, lamp heads y 188, back row tops y 218..242 (opaque 242 → 360). Far: spire tip y 40, blocks y 150..280,
// hills y ≈ 315..345.
// =====================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const { ROAD_FILL } = require('./art_env.js');

const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
const SKY = {
  sunny: { skyTop: '#8CCBEF', skyBottom: '#E4F3FA', horizon: '#FFF4E2', tint: null },
  breezy: { skyTop: '#93CDEA', skyBottom: '#E8F5F3', horizon: '#F2F7E8', tint: null },
  rain: { skyTop: '#9AADC6', skyBottom: '#DCE2EA', horizon: '#F0E8DC', tint: 'rgba(70,80,120,0.06)' },
  rainbow: { skyTop: '#88C6EC', skyBottom: '#F0F3F1', horizon: '#FFF0E4', tint: 'rgba(255,236,220,0.05)' },
};
const PARTS = ['drop', 'splash', 'leaf_a', 'leaf_b', 'paper', 'sparkle', 'star', 'puff', 'confetti_a', 'confetti_b'];
const NAMES = ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3', 'env/rain_cloud', 'env/rainbow', 'env/car_a', 'env/car_b', 'env/bus', 'env/kite', ...PARTS.map(p => 'particles/' + p)];
for (const m of MOODS) NAMES.push('env/far_' + m, 'env/mid_' + m, 'env/ground_' + m);
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const SIZES = [[1556, 720], [960, 720], [720, 1556]];

function pageScene({ W, H, mood, sky, src, roadFill, scroll, noBuilding }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const portrait = H > W, gy = H - 90, k = H > W * 1.6 ? 1.36 : 1;
    // --- recipe (same as header) ---
    const lay = (n, h, y, par) => ({ n: 'env/' + n + '_' + mood, w: 1200 * k, h: h * k, y, x0: -(((scroll * par) % (1200 * k)) + 1200 * k) % (1200 * k) });
    const L = { far: lay('far', 420, gy - 26 - 100 * k - 420 * k, 0.15), mid: lay('mid', 360, gy - 26 - 360 * k, 0.4), ground: lay('ground', 260, gy - 30 - 40 * k, 1),
      roadTop: gy - 30 + 70 * k, fillY: gy - 30 + 220 * k, car: { s: 0.4 * k, wheelY: gy - 30 + 114 * k }, bus: { s: 0.42 * k, wheelY: gy - 30 + 116 * k } };
    // sky
    const sk = g.createLinearGradient(0, 0, 0, gy); sk.addColorStop(0, sky.skyTop); sk.addColorStop(1, sky.skyBottom);
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
    hz.addColorStop(0, sky.horizon + '00'); hz.addColorStop(0.6, sky.horizon + '88'); hz.addColorStop(1, sky.horizon + 'CC');
    g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 620 * k), W, 620 * k);
    const spr = (n, x, y, w, a = 1, rot = 0) => { const i = im[n]; const h = w * i.height / i.width; g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot); g.drawImage(i, -w / 2, -h / 2, w, h); g.restore(); };
    const sunA = { sunny: 1, breezy: 1, rain: 0, rainbow: 0.8 }[mood];
    if (sunA) spr('env/sun', W * (portrait ? 0.82 : 0.88), portrait ? 340 : 170, portrait ? 130 : 140, sunA);
    if (mood === 'rainbow') { const rw = Math.min(1.1 * W, 1300 * k); g.globalAlpha = 0.9; g.drawImage(im['env/rainbow'], W * 0.55 - rw / 2, L.mid.y + 250 * k - rw / 2, rw, rw / 2); g.globalAlpha = 1; }
    const cl = mood === 'rain' ? ['rain_cloud', 'rain_cloud', 'rain_cloud', 'rain_cloud'] : ['cloud1', 'cloud3', 'cloud2'];
    cl.forEach((n, i) => spr('env/' + n, ((i + 0.4) / cl.length) * W, (portrait ? 190 : 50) + (i % 2) * 46, 300 * (1.05 - (i % 3) * 0.12), mood === 'rain' ? 0.95 : 0.95));
    if (mood === 'breezy') { spr('env/kite', W * 0.7, portrait ? 420 : 150, 70, 1, 0.25); g.strokeStyle = 'rgba(120,100,90,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W * 0.7, (portrait ? 420 : 150) + 5); g.quadraticCurveTo(W * 0.82, H * 0.5, W + 20, H * 0.62); g.stroke(); }
    // layers
    for (const nm of ['far', 'mid', 'ground']) { const l = L[nm]; for (let x = l.x0; x < W; x += l.w) g.drawImage(im[l.n], Math.round(x), Math.round(l.y), Math.round(l.w) + 1, Math.round(l.h)); }
    if (L.fillY < H) { g.fillStyle = roadFill; g.fillRect(0, L.fillY - 1, W, H - L.fillY + 1); }
    if (sky.tint) { g.fillStyle = sky.tint; g.fillRect(0, 0, W, H); }
    // cars on the road (behind Gigi)
    const veh = (n, x, s, wheelY, wb) => { const i = im[n]; g.drawImage(i, x, wheelY - wb * s, i.width * s, i.height * s); };
    veh('env/car_a', W * 0.58, L.car.s, L.car.wheelY, 113);
    veh('env/bus', W * 0.12, L.bus.s, L.bus.wheelY, 197);
    veh('env/car_b', W * 0.86, L.car.s, L.car.wheelY, 113);
    // building placeholder (DESIGN §2: facade down to gy + 4)
    if (!noBuilding) {
    const bx = portrait ? 70 : 250, bw = portrait ? W - 140 : W - 250 - 60, by = portrait ? 290 : 150;
    g.fillStyle = 'rgba(150,150,150,0.85)'; g.fillRect(bx, by, bw, gy + 4 - by);
    g.fillStyle = 'rgba(120,120,120,0.9)'; g.fillRect(bx - 12, by - 26, bw + 24, 28);
    const cw = portrait ? 150 : 128, ch = cw / 0.78, cols = portrait ? 3 : 4, rows = portrait ? 4 : 3, gap = Math.max(18, 0.16 * cw);
    const gx = bx + (bw - (cols * cw + (cols - 1) * gap)) / 2;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { g.fillStyle = (r + q) % 3 ? '#9C9C9C' : '#FFF6E2'; g.fillRect(gx + q * (cw + gap), by + 30 + r * (ch + gap), cw, ch); }
    }
    // Gigi stand-in (sand coat, caramel patches, outline) on the pavement
    const gig = portrait ? { x: 100, y: gy + 24, h: 140 } : { x: 110, y: gy + 22, h: 150 };
    g.fillStyle = 'rgba(60,50,40,0.2)'; g.beginPath(); g.ellipse(gig.x, gig.y, 50, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#F3CE85'; g.strokeStyle = '#7E5226'; g.lineWidth = 4;
    for (const dx of [-30, -14, 16, 32]) { g.beginPath(); g.roundRect(gig.x + dx - 6, gig.y - gig.h * 0.45, 12, gig.h * 0.45, 5); g.fill(); g.stroke(); }
    g.beginPath(); g.ellipse(gig.x, gig.y - gig.h * 0.52, 48, 28, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(gig.x + 26, gig.y - gig.h * 0.6); g.lineTo(gig.x + 46, gig.y - gig.h * 1.25); g.lineTo(gig.x + 62, gig.y - gig.h * 1.22); g.lineTo(gig.x + 46, gig.y - gig.h * 0.52); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(gig.x + 66, gig.y - gig.h * 1.3, 30, 22, 0.3, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#B97A3F'; for (const [dx, dy] of [[-20, -0.56], [6, -0.48], [24, -0.58]]) { g.beginPath(); g.arc(gig.x + dx, gig.y + dy * gig.h, 7, 0, 7); g.fill(); }
    // particles
    const parts = { sunny: ['sparkle', 'sparkle', 'sparkle'], breezy: ['leaf_a', 'leaf_b', 'paper', 'leaf_a', 'paper'], rain: [], rainbow: ['sparkle', 'star', 'sparkle', 'sparkle'] }[mood];
    parts.forEach((p, j) => spr('particles/' + p, 80 + j * (W - 160) / Math.max(1, parts.length - 1), (portrait ? 360 : 120) + ((j * 137) % 260), 28, 1, j * 0.8));
    if (mood === 'rain') {
      let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 90; i++) spr('particles/drop', rnd() * W, rnd() * gy, 26, 0.75, 0.12);
      for (let i = 0; i < 10; i++) spr('particles/splash', rnd() * W, gy - 30 + 60 * k * rnd() + 10, 24, 0.8);
    }
    // ground line marker
    g.save(); g.setLineDash([10, 8]); g.strokeStyle = 'rgba(200,0,120,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke(); g.restore();
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, moods }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const Ls = [['far', 420], ['mid', 360], ['ground', 260]];
    const rowOf = h => h / 2 + 12;
    let total = 0; for (const m of moods) for (const [, h] of Ls) total += rowOf(h);
    const out = document.createElement('canvas'); out.width = 1800; out.height = total;
    const o = out.getContext('2d'); o.fillStyle = '#BFE2FA'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const m of moods) for (const [ln, h] of Ls) {
      const n = 'env/' + ln + '_' + m, im = await load(src[n]), rowH = rowOf(h);
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.drawImage(im, 0, 0, 1200, h); g.drawImage(im, 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0; for (let x = 100; x < 1100; x++) sum += col(x, x + 1);
      scores.push(`${n.padEnd(20)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}`);
      o.drawImage(c, 0, y, 1200, h / 2);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + h / 2); o.stroke(); o.restore();
      const zh = (rowH - 12) / 4, zy = ln === 'ground' ? 30 : ln === 'mid' ? 150 : 150;
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
    const c = document.createElement('canvas'); c.width = 1500; c.height = 880; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, '#8CCBEF'); gr.addColorStop(1, '#E4F3FA'); g.fillStyle = gr; g.fillRect(0, 0, 1500, 240);
    let x = 10; for (const n of ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3', 'env/rain_cloud']) { const i = await load(src[n]); const s = n === 'env/sun' ? 1 : 0.9; g.drawImage(i, x, 30, i.width * s, i.height * s); x += i.width * s + 10; }
    g.fillStyle = '#8F9298'; g.fillRect(0, 240, 1500, 230);
    x = 10; for (const n of ['env/car_a', 'env/car_b', 'env/bus', 'env/kite']) { const i = await load(src[n]); g.drawImage(i, x, 260 + (n.includes('kite') ? 20 : 200 - i.height)); x += i.width + 30; }
    const bgs = ['#D9D3C9', '#93A6BE', '#E8C8B0'];
    for (let r = 0; r < 3; r++) { g.fillStyle = bgs[r]; g.fillRect(0, 470 + r * 136, 1500, 136); for (let i = 0; i < parts.length; i++) g.drawImage(await load(src['particles/' + parts[i]]), 18 + i * 146, 486 + r * 136, 104, 104); }
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
    save(await pg.evaluate(pageScene, { W, H, mood: m, sky: SKY[m], src: SRC, roadFill: ROAD_FILL[m], scroll: 700, noBuilding: !!process.env.NOBLD }), path.join(process.env.NOBLD || ART, `env_${tag}.png`));
  }
  if (!only || only === 'seams') { const sm = await pg.evaluate(pageSeams, { src: SRC, moods: MOODS }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n')); }
  if (!only || only === 'sheet') save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS }), path.join(ART, 'env_particles.png'));
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
