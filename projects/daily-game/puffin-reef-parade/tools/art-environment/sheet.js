// Visual QA for Dottie's Reef Parade environment art. Writes into tests/out/art/ (gitignored):
//  env_<season>_seam.png   ground tiled 3x3 at 512 (seams at the magenta ticks) + edge tiled 3x horizontally
//  env_<season>_scene.png  960x540 scene mirroring render.js: ground as 384 px tiles, border strips on all
//                          4 sides (strip bottom on the arena edge, 3 rows stacked outward 52 px apart),
//                          decor at the renderer's spots, placeholder sea stars + a navy/white hero blob
//  env_<season>_decor.png  the 4 props big and at 84 px on the sand
//  env_particles.png       every particle at 4x and 1x on the 4 sands
// Usage: node sheet.js [assetsDir] [outDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../tests/out/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'prp-env-'));
fs.mkdirSync(OUT, { recursive: true });
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const PARTS = ['bubble', 'spawn', 'fish', 'ray', 'kelp', 'snow', 'jelly', 'sparkle', 'sand'];
const SPART = { spring: ['spawn', 'spawn', 'fish'], summer: ['bubble', 'bubble', 'fish'], autumn: ['kelp', 'kelp', 'sand'], winter: ['snow', 'snow', 'jelly'] };

const page = season => `<!doctype html><html><body style="margin:0;background:#fff">
<canvas id="seam" width="1536" height="1536"></canvas><br>
<canvas id="edge" width="1536" height="216"></canvas><br>
<canvas id="scene" width="960" height="540"></canvas><br>
<canvas id="decor" width="1000" height="260"></canvas>
<script>
const A = ${JSON.stringify('file://' + A)}, B = ${JSON.stringify(season)}, PART = ${JSON.stringify(SPART[season])};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });
(async () => {
  const d = A + '/biomes/' + B + '/';
  const ground = await load(d + 'ground.svg'), edge = await load(d + 'edge.svg');
  const decor = []; for (let i = 0; i < 4; i++) decor.push(await load(d + 'decor_' + i + '.svg'));
  const parts = {}; for (const p of new Set(PART)) parts[p] = await load(A + '/particles/' + p + '.svg');
  // (1) seam test 3x3
  let c = document.getElementById('seam').getContext('2d');
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) c.drawImage(ground, x * 512, y * 512, 512, 512);
  c.fillStyle = '#f0f'; for (const v of [512, 1024]) { c.fillRect(v - 1, 0, 2, 14); c.fillRect(0, v - 1, 14, 2); }
  c = document.getElementById('edge').getContext('2d');
  c.fillStyle = '#888'; c.fillRect(0, 0, 1536, 216);
  for (let x = 0; x < 3; x++) { c.drawImage(edge, x * 512, 0, 512, 72); c.drawImage(edge, x * 512, 72, 512, 72); }
  // mimic the renderer's outward stacking on the bottom row pair
  for (let row = 2; row >= 0; row--) { const off = (row * 173) % 512; for (let x = -off; x < 1536; x += 512) c.drawImage(edge, x, 144 - row * 52 + 0, 512, 72); }
  c.fillStyle = '#f0f'; for (const v of [512, 1024]) c.fillRect(v - 1, 0, 2, 10);
  // (2) scene (mirror render.js background())
  const W = 960, H = 540, ar = { x0: 28, y0: 76, x1: 932, y1: 516 };
  c = document.getElementById('scene').getContext('2d');
  c.fillStyle = '#333'; c.fillRect(0, 0, W, H);
  const t = document.createElement('canvas'); t.width = t.height = 384; t.getContext('2d').drawImage(ground, 0, 0, 384, 384);
  c.fillStyle = c.createPattern(t, 'repeat'); c.fillRect(0, 0, W, H);
  const sides = [[ar.x0 - 72, ar.y0, 0, ar.x1 - ar.x0 + 144], [ar.x1, ar.y0 - 72, Math.PI / 2, ar.y1 - ar.y0 + 144], [ar.x1 + 72, ar.y1, Math.PI, ar.x1 - ar.x0 + 144], [ar.x0, ar.y1 + 72, -Math.PI / 2, ar.y1 - ar.y0 + 144]];
  for (const [ox, oy, a, len] of sides) for (let row = 0; row < 3; row++) { c.save(); c.translate(ox, oy); c.rotate(a); const off = (row * 173) % 512; for (let x = -off; x < len; x += 512) c.drawImage(edge, x, -72 - row * 52, 512, 72); c.restore(); }
  const AW = ar.x1 - ar.x0, AH = ar.y1 - ar.y0, s = 84, spots = [];
  const nS = Math.max(1, Math.round(AH / 260));
  for (let i = 0; i < nS; i++) { const y = ar.y0 + AH * (i + 0.6) / (nS + 0.2); spots.push([Math.max(ar.x0 - 30, 24), y, i % 2 === 0 ? 3 : 0, s, false]); spots.push([Math.min(ar.x1 + 30, W - 24), y + 40, i % 2 === 0 ? 1 : 2, s * 0.9, true]); }
  const nB = Math.max(1, Math.round(AW / 330));
  for (let i = 0; i < nB; i++) spots.push([ar.x0 + AW * (i + 0.5) / nB, ar.y1 + 50, [0, 2, 1][i % 3], s, i % 2 === 1]);
  spots.push([ar.x0 + AW * 0.30, ar.y0 - 18, 0, s * 0.8, false]); spots.push([ar.x0 + AW * 0.68, ar.y0 - 18, 2, s * 0.8, true]);
  for (const [x, y, k, sz, fl] of spots) { c.save(); c.translate(x, y); if (fl) c.scale(-1, 1); c.drawImage(decor[k], -sz / 2, -sz * 112 / 128, sz, sz); c.restore(); }
  c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 6; c.strokeRect(ar.x0 + 3, ar.y0 + 3, AW - 6, AH - 6);
  // placeholder stars + hero
  const star = (x, y, r, fill, out) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.5 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 3; c.strokeStyle = out; c.lineJoin = 'round'; c.stroke(); };
  const S = [['#ff7aa8', '#a83a64'], ['#5ec8ff', '#1f6aa0'], ['#5fe0a8', '#1f8a5e'], ['#b48cff', '#5a3aa8']];
  const cx = 470, cy = 310;
  for (let i = 0; i < 7; i++) star(cx - 40 - i * 30, cy + Math.sin(i * 0.8) * 20, 15, S[i % 4][0], S[i % 4][1]);
  [[640, 170], [760, 260], [600, 420], [820, 450], [200, 150], [330, 450]].forEach(([x, y], i) => star(x, y, 15, S[i % 4][0], S[i % 4][1]));
  star(700, 340, 18, '#ffd23f', '#a8801a');
  c.fillStyle = 'rgba(20,30,40,.18)'; c.beginPath(); c.ellipse(cx, cy + 26, 24, 8, 0, 0, 7); c.fill();
  c.fillStyle = '#1f2a44'; c.beginPath(); c.ellipse(cx, cy, 30, 22, 0, 0, 7); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(cx + 12, cy + 4, 15, 14, 0, 0, 7); c.fill();
  c.fillStyle = '#ff8a3d'; c.beginPath(); c.moveTo(cx + 26, cy - 6); c.lineTo(cx + 42, cy + 2); c.lineTo(cx + 26, cy + 8); c.fill();
  c.fillRect(cx - 40, cy + 6, 12, 8);
  // particles
  let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 16; i++) { const p = parts[PART[i % PART.length]], sz = 12 + r() * 12; c.globalAlpha = 0.9; c.drawImage(p, r() * W, r() * H, sz, sz); }
  c.globalAlpha = 1;
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, 0, W, 64);   // HUD band mock
  // (3) decor
  c = document.getElementById('decor').getContext('2d');
  c.drawImage(ground, 0, 0, 512, 512); c.drawImage(ground, 512, 0, 512, 512);
  decor.forEach((im, i) => { c.drawImage(im, 10 + i * 170, 20, 170, 170); c.drawImage(im, 700 + (i % 2) * 140, 10 + Math.floor(i / 2) * 120, 84, 84); });
  document.title = 'done';
})();
</script></body></html>`;

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  await pg.setViewportSize({ width: 1540, height: 2600 });
  for (const b of SEASONS) {
    fs.writeFileSync(TMP + '/t.html', page(b));
    await pg.goto('file://' + TMP + '/t.html'); await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(150);
    await (await pg.$('#seam')).screenshot({ path: path.join(OUT, `env_${b}_seam.png`) });
    await (await pg.$('#edge')).screenshot({ path: path.join(OUT, `env_${b}_edge.png`) });
    await (await pg.$('#scene')).screenshot({ path: path.join(OUT, `env_${b}_scene.png`) });
    await (await pg.$('#decor')).screenshot({ path: path.join(OUT, `env_${b}_decor.png`) });
  }
  const sands = { spring: '#e9cf9f', summer: '#dcefe6', autumn: '#cf9f62', winter: '#bac6d1' };
  const cell = p => p === 'ray' ? `<img src="file://${A}/particles/ray.svg" style="width:32px;height:128px"><img src="file://${A}/particles/ray.svg" style="width:16px;height:64px">`
    : `<img src="file://${A}/particles/${p}.svg" style="width:128px;height:128px;outline:1px dashed rgba(0,0,0,.15)"><img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px">`;
  const row = s => `<div style="display:flex;gap:10px;align-items:center;background:url(file://${A}/biomes/${s}/ground.svg) 0 0/384px;padding:8px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">${cell(p)}</div>`).join('') + '</div>';
  fs.writeFileSync(TMP + '/p.html', `<html><body style="margin:0;background:#fff">${SEASONS.map(row).join('')}</body></html>`);
  await pg.setViewportSize({ width: 1300, height: 760 }); await pg.goto('file://' + TMP + '/p.html'); await pg.waitForTimeout(400);
  await pg.screenshot({ path: path.join(OUT, 'env_particles.png'), fullPage: true });
  await br.close(); console.log('rendered into', OUT, Object.keys(sands).length, 'seasons');
})();
