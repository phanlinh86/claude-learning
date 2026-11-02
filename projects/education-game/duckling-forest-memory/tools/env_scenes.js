// Dee's Forest Memory: environment preview scenes (Playwright + canvas, same layer maths as render.js _landscape).
// Run after tools/art_env.js:  node tools/env_scenes.js [filter]
// Writes docs/art/scene_<ipadL|iphoneL|iphoneP>_<spring|summer|autumn|winter>.png and docs/art/env_seams.png
// (each layer of each season: 2 tiles side by side with the seam marked + a 4x zoom on the join) and prints seam scores.
// SKY below = the proposed DM.Weather ambient per season. Layer placement (k = 1.36 on tall portrait, else 1; gy = groundY):
//   far    1200k x 420k, bottom at gy - 120          (top gy - 540)
//   mid    1200k x 360k, bottom at gy - 10           (top gy - 370; pond band svg y ≈ 314..340, lip hides y > 340)
//   ground 1200k x 260k, top at gy - 30 - 40k        (its grass lip, svg y ≈ 40, lands on gy - 30)
// Foreground stand-ins: the mossy clearing panel (DESIGN §3 colours), a 12-card grid (cream fronts / teal backs) laid out
// per DESIGN §2 (bubble, board, Dee box), Dee as a yellow blob at the bottom-left, lantern dots on the reported branches.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const BRANCHES = require('./art_env.js').branches();   // lantern hang points (mid svg coords), computed by the generator

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const PARTS = ['sparkle', 'star', 'firefly', 'petal', 'leaf_a', 'leaf_b', 'snow1', 'snow2', 'puff', 'confetti_a', 'confetti_b'];
const NAMES = ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3', ...PARTS.map(p => 'particles/' + p)];
for (const s of SEASONS) NAMES.push('env/far_' + s, 'env/mid_' + s, 'env/ground_' + s);
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

const SKY = {
  spring: { skyTop: '#9FD3F0', skyBottom: '#E6F4FA', horizon: '#FBE9EF', panel: ['#CFE3B8', 0.4], parts: ['petal', 'petal', 'sparkle', 'petal', 'petal'], fill: '#A3CF84' },
  summer: { skyTop: '#7FC3EC', skyBottom: '#DBF0FA', horizon: '#EEF8EC', panel: ['#CFE3B8', 0.4], parts: ['sparkle', 'firefly', 'sparkle', 'star'], fill: '#96C677' },
  autumn: { skyTop: '#A6C6DE', skyBottom: '#F3E8D6', horizon: '#FAE6CB', panel: ['#E8D7B5', 0.4], parts: ['leaf_a', 'leaf_b', 'leaf_a', 'leaf_b', 'leaf_a'], fill: '#B5BE85' },
  winter: { skyTop: '#A7BFD8', skyBottom: '#E7EEF5', horizon: '#F3F6FA', panel: ['#EAF2F8', 0.4], parts: ['snow1', 'snow2', 'snow1', 'snow1', 'snow2', 'snow1'], fill: '#DFE9F1' },
};
const DEVICES = [['ipadL', 1036, 720], ['iphoneL', 1556, 720], ['iphoneP', 720, 1556]];
const FACES = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0'];

function pageScene({ W, H, season, sky, src, faces, branches, panelOverride }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const tall = H > W * 1.6, k = tall ? 1.36 : 1, portrait = H > W;
    const gy = H - 90 - (tall ? Math.min(140, 0.3 * (H - 1.6 * W)) : 0);   // DESIGN §2 groundY (no insets) + Kitten's tall raise
    const sk = g.createLinearGradient(0, 0, 0, gy); sk.addColorStop(0, sky.skyTop); sk.addColorStop(1, sky.skyBottom);
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
    hz.addColorStop(0, sky.horizon + '00'); hz.addColorStop(0.6, sky.horizon + '88'); hz.addColorStop(1, sky.horizon + 'CC');
    g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 620 * k), W, 620 * k);
    const spr = (n, x, y, w, a = 1, rot = 0) => { const i = im[n]; const h = w * i.height / i.width; g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot); g.drawImage(i, -w / 2, -h / 2, w, h); g.restore(); };
    spr('env/sun', W * 0.62, portrait ? 210 : 80, 150, season === 'winter' ? 0.8 : 1);
    ['cloud1', 'cloud3', 'cloud2'].forEach((cl, i) => spr('env/' + cl, (i * 0.34 + 0.18) * W, (portrait ? 150 : 60) + (i % 2) * 50, 300 * (1.05 - i * 0.12), 0.95));
    const layers = [['env/far_' + season, 420, gy - 120], ['env/mid_' + season, 360, gy - 10], ['env/ground_' + season, 260, gy - 30 - 40 * k + 260 * k]];
    let midY = 0;
    for (const [n, h, bottom] of layers) {
      const tw = 1200 * k, th = h * k, y = bottom - th;
      if (n.includes('mid')) midY = y;
      for (let x = 0; x < W; x += tw) g.drawImage(im[n], Math.round(x), Math.round(y), Math.round(tw), Math.round(th));
      if (n.includes('ground') && y + th < H) { g.fillStyle = sky.fill; g.fillRect(0, y + th - 2, W, H - y - th + 2); }
    }
    // lantern stand-ins on the branch points (mid svg coords → screen)
    for (const [bx, by] of branches) for (let x0 = 0; x0 < W + 1200 * k; x0 += 1200 * k) {
      const x = x0 + bx * k, y = midY + by * k;
      g.strokeStyle = 'rgba(110,90,70,0.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 14); g.stroke();
      g.fillStyle = 'rgba(255,240,190,0.55)'; g.beginPath(); g.arc(x, y + 24, 16, 0, 7); g.fill();
      g.fillStyle = '#FFE9A8'; g.strokeStyle = '#B98A4A'; g.lineWidth = 2; g.beginPath(); g.roundRect(x - 7, y + 14, 14, 18, 4); g.fill(); g.stroke();
    }
    // DESIGN §2 layout (no insets)
    const dee = portrait ? { x: 100, y: gy + 20, h: 170 } : { x: 110, y: gy + 16, h: 180 };
    const bub = portrait ? { x: 24, y: 120, h: 124 } : { x: 24, y: 20, h: 122 };
    bub.w = Math.min(640, W - bub.x - (portrait ? 24 : 160));
    let board;
    if (portrait) board = { x: 24, y: bub.y + bub.h + 24, w: W - 48 }; else board = { x: dee.x + 120, y: bub.y + bub.h + 24 };
    if (portrait) board.h = Math.min(gy - 10, dee.y - dee.h - 10) - board.y; else { board.w = W - 24 - board.x; board.h = gy - 10 - board.y; }
    const cols = portrait ? 3 : 4, rows = portrait ? 4 : 3, ar = 0.78;
    let cw = Math.min((board.w) / (cols + 0.12 * (cols - 1)), (board.h) / ((rows + 0.12 * (rows - 1)) / ar));
    cw = Math.min(cw, 170);
    const ch = cw / ar, gap = 0.12 * cw, gw = cols * cw + (cols - 1) * gap, gh = rows * ch + (rows - 1) * gap;
    const x0 = board.x + (board.w - gw) / 2, y0 = board.y + (board.h - gh) / 2;
    // clearing panel
    const [pc, pa] = panelOverride || sky.panel;
    g.save(); g.globalAlpha = pa; g.fillStyle = pc; g.beginPath(); g.roundRect(x0 - 26, y0 - 22, gw + 52, gh + 44, 40); g.fill(); g.restore();
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.beginPath(); g.roundRect(x0 - 26, y0 - 22, gw + 52, gh + 44, 40); g.stroke(); g.restore();
    // bubble stand-in
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.roundRect(bub.x, bub.y, bub.w, bub.h, 26); g.fill();
    g.fillStyle = '#7A6A5A'; g.font = 'bold 28px sans-serif'; g.fillText('Find two the same!  · ' + season, bub.x + 26, bub.y + 70);
    // cards
    let i = 0;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++, i++) {
      const x = x0 + q * (cw + gap), y = y0 + r * (ch + gap), rr = 0.12 * cw;
      g.fillStyle = 'rgba(40,50,30,0.22)'; g.beginPath(); g.roundRect(x + 2, y + 5, cw, ch, rr); g.fill();
      const up = i % 3 === 0;
      if (up) {
        g.fillStyle = '#FFF8EA'; g.strokeStyle = '#9A774C'; g.lineWidth = 3; g.beginPath(); g.roundRect(x, y, cw, ch, rr); g.fill(); g.stroke();
        g.strokeStyle = '#E7D3AE'; g.lineWidth = 3; g.beginPath(); g.roundRect(x + 8, y + 8, cw - 16, ch - 16, rr * 0.6); g.stroke();
        g.fillStyle = faces[(i / 3) % faces.length]; g.beginPath(); g.arc(x + cw / 2, y + ch / 2, cw * 0.28, 0, 7); g.fill();
      } else {
        g.fillStyle = '#2F7D73'; g.strokeStyle = '#1F5A52'; g.lineWidth = 3; g.beginPath(); g.roundRect(x, y, cw, ch, rr); g.fill(); g.stroke();
        g.strokeStyle = '#4FA393'; g.lineWidth = 3; g.beginPath(); g.roundRect(x + 8, y + 8, cw - 16, ch - 16, rr * 0.6); g.stroke();
        g.strokeStyle = '#8CCFB8'; g.lineWidth = 2; g.beginPath(); g.arc(x + cw / 2, y + ch / 2, cw * 0.22, 0, 7); g.stroke();
        g.fillStyle = '#E2B65A'; g.beginPath(); g.ellipse(x + cw / 2, y + ch / 2 + 3, cw * 0.08, cw * 0.1, 0, 0, 7); g.fill();
        g.fillStyle = '#9C7346'; g.beginPath(); g.ellipse(x + cw / 2, y + ch / 2 - cw * 0.07, cw * 0.1, cw * 0.05, 0, 0, 7); g.fill();
      }
    }
    // Dee stand-in
    g.fillStyle = 'rgba(70,90,50,0.25)'; g.beginPath(); g.ellipse(dee.x, dee.y, 56, 10, 0, 0, 7); g.fill();
    g.fillStyle = '#FFE27A'; g.strokeStyle = '#B9862A'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(dee.x, dee.y - dee.h * 0.3, dee.h * 0.3, dee.h * 0.28, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(dee.x + 10, dee.y - dee.h * 0.72, dee.h * 0.2, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#F59A3B'; g.beginPath(); g.ellipse(dee.x + 10 + dee.h * 0.22, dee.y - dee.h * 0.68, 18, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#7DB37A'; g.beginPath(); g.ellipse(dee.x - 20, dee.y - dee.h * 0.32, 30, 40, 0.4, 0, 7); g.fill();
    // weather particles
    sky.parts.forEach((p, j) => {
      const x = 80 + j * (W - 160) / Math.max(1, sky.parts.length - 1), y = (portrait ? 280 : 160) + ((j * 137) % 260);
      if (p === 'firefly') { g.save(); g.globalCompositeOperation = 'lighter'; spr('particles/' + p, x, y, 34, 0.9); g.restore(); }
      else spr('particles/' + p, x, y, 30, 1, j * 0.7);
    });
    // ground line marker
    g.save(); g.setLineDash([10, 8]); g.strokeStyle = 'rgba(200,0,120,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke(); g.restore();
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, seasons }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const L = [['far', 420], ['mid', 360], ['ground', 260]];
    const rows = seasons.length * L.length, rowOf = h => h / 2 + 12;
    let total = 0; for (const s of seasons) for (const [, h] of L) total += rowOf(h);
    const out = document.createElement('canvas'); out.width = 1800; out.height = total;
    const o = out.getContext('2d'); o.fillStyle = '#BFE2FA'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const s of seasons) for (const [ln, h] of L) {
      const n = 'env/' + ln + '_' + s, im = await load(src[n]), rowH = rowOf(h);
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.drawImage(im, 0, 0, 1200, h); g.drawImage(im, 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0; for (let x = 100; x < 1100; x++) sum += col(x, x + 1);
      scores.push(`${n.padEnd(18)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}`);
      // overview: 2 tiles at half size, seam (x 600) marked
      o.drawImage(c, 0, y, 1200, h / 2);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + h / 2); o.stroke(); o.restore();
      // 4x zoom on the join where the layer has content
      const zh = (rowH - 12) / 4, zy = ln === 'ground' ? 20 : ln === 'mid' ? 270 : 200;
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
    const c = document.createElement('canvas'); c.width = 1500; c.height = 600; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 220); gr.addColorStop(0, '#7FC3EC'); gr.addColorStop(1, '#DBF0FA'); g.fillStyle = gr; g.fillRect(0, 0, 1500, 220);
    let x = 10; for (const n of ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3']) { const i = await load(src[n]); g.drawImage(i, x, 20); x += i.width + 20; }
    const bgs = ['#B6DB97', '#A6C6DE', '#24304F'];
    for (let r = 0; r < 3; r++) { g.fillStyle = bgs[r]; g.fillRect(0, 220 + r * 126, 1500, 126); for (let i = 0; i < parts.length; i++) g.drawImage(await load(src['particles/' + parts[i]]), 14 + i * 134, 230 + r * 126, 104, 104); }
    return c.toDataURL('image/png');
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  const br = BRANCHES.map(p => [((p.x % 1200) + 1200) % 1200, p.y]);
  const panelOverride = process.env.PANEL ? JSON.parse(process.env.PANEL) : null;
  for (const [dn, W, H] of DEVICES) for (const s of SEASONS) {
    if (only && !`${dn}_${s}`.includes(only)) continue;
    save(await pg.evaluate(pageScene, { W, H, season: s, sky: SKY[s], src: SRC, faces: FACES, branches: br, panelOverride }), path.join(ART, `scene_${dn}_${s}.png`));
  }
  const sm = await pg.evaluate(pageSeams, { src: SRC, seasons: SEASONS }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  const sheet = process.env.SHEET || path.join(require('os').tmpdir(), 'dm_env_sheet.png');
  save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS }), sheet);
  await b.close(); console.log('wrote', ART, '(+', sheet + ')');
})().catch(e => { console.error(e); process.exit(1); });
