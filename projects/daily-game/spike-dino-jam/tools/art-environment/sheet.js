// Visual QA for Spike's Dino Jam environment art.
// For each biome renders docs/art/env_<biome>.png containing:
//  (a) a seam test: ground.svg tiled 3x2 with the grid offset by half a tile (seams at the magenta ticks),
//  (b) a 960x540 landscape scene: ground tiled, edge strips on all 4 sides of the arena (28,76)-(932,516),
//      decor on the border/margins, particles, placeholder notes + a brown hero blob,
//  (c) a 560x1100 portrait scene, plus a row of the 4 decor props at 1x and a particles row.
// Also docs/art/env_particles.png (each particle at 4x and 1x on light and dark backgrounds).
// The strip drawing mirrors what the renderer should do: translate to the strip origin, rotate
// (0 top, 90 right, 180 bottom, 270 left: clockwise), draw strip tiles at local y -72..0 so the
// strip's bottom edge lies on the arena edge.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sdj-env-'));
fs.mkdirSync(OUT, { recursive: true });
const BIOMES = ['meadow', 'swamp', 'canyon', 'snow'];
const PARTS = ['leaf', 'butterfly', 'firefly', 'mist', 'dust', 'snow', 'sparkle', 'feather', 'petal'];
const BPART = { meadow: ['butterfly', 'petal', 'leaf'], swamp: ['mist', 'firefly', 'firefly'], canyon: ['dust', 'dust', 'sparkle'], snow: ['snow', 'snow', 'sparkle'] };

const page = biome => `<!doctype html><html><body style="margin:0;background:#fff;font:700 14px Arial">
<div style="display:flex;gap:12px;padding:12px;align-items:flex-start">
 <div style="display:flex;flex-direction:column;gap:12px">
  <canvas id="seam" width="1024" height="768"></canvas>
  <canvas id="land" width="960" height="540"></canvas>
  <canvas id="decor" width="960" height="200"></canvas>
 </div>
 <canvas id="port" width="560" height="1100"></canvas>
</div>
<script>
const A = ${JSON.stringify('file://' + A)}, B = ${JSON.stringify(biome)};
const PART = ${JSON.stringify(BPART[biome])};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });
(async () => {
  const d = A + '/biomes/' + B + '/';
  const ground = await load(d + 'ground.svg'), edge = await load(d + 'edge.svg');
  const decor = []; for (let i = 0; i < 4; i++) decor.push(await load(d + 'decor_' + i + '.svg'));
  const parts = {}; for (const p of new Set(PART)) parts[p] = await load(A + '/particles/' + p + '.svg');
  // (a) seam test: 1024x768 window, tile grid offset by half a tile
  let c = document.getElementById('seam').getContext('2d');
  for (let ty = -1; ty < 2; ty++) for (let tx = -1; tx < 2; tx++) c.drawImage(ground, 256 + tx * 512, 256 + ty * 512 - 128, 512, 512);
  c.fillStyle = '#f0f'; for (const x of [256, 768]) { c.fillRect(x - 1, 0, 2, 10); c.fillRect(x - 1, 758, 2, 10); } for (const y of [128, 640]) { c.fillRect(0, y - 1, 10, 2); c.fillRect(1014, y - 1, 10, 2); }
  c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.strokeText(B + ' ground seam test', 14, 30); c.fillText(B + ' ground seam test', 14, 30);
  function strips(c, x0, y0, x1, y1) {
    const w = x1 - x0, h = y1 - y0;
    const side = (ox, oy, ang, L) => { c.save(); c.translate(ox, oy); c.rotate(ang * Math.PI / 180); for (let x = 0; x < L; x += 512) c.drawImage(edge, x, -72, 512, 72); c.restore(); };
    side(x0 - 72, y0, 0, w + 144);        // top
    side(x1, y0 - 72, 90, h + 144);       // right
    side(x1 + 72, y1, 180, w + 144);      // bottom
    side(x0, y1 + 72, 270, h + 144);      // left
  }
  const prop = (c, i, x, y, s) => c.drawImage(decor[i], x - s / 2, y - s * 112 / 128, s, s); // (x,y) = base point
  const disc = (c, x, y, r, f, s) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = f; c.fill(); c.lineWidth = 3; c.strokeStyle = s; c.stroke(); };
  function actors(c, cx, cy) {
    const notes = [['#ff7eb6', '#b03a74'], ['#5ab8ff', '#1f6aa8'], ['#4fd8a0', '#1f8a5e'], ['#ffa63d', '#a85e10'], ['#ffd23a', '#a8801a']];
    // trail behind the hero
    for (let i = 0; i < 7; i++) { const [f, s] = notes[i % 4]; disc(c, cx - 30 - i * 24, cy + Math.sin(i * 0.7) * 16, 13, f, s); }
    notes.forEach(([f, s], i) => disc(c, cx + 120 + (i % 3) * 90, cy - 110 + i * 50 + (i % 2) * 30, 14, f, s));
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(cx, cy + 22, 26, 8, 0, 0, 7); c.fill();
    disc(c, cx, cy - 2, 22, '#b8673a', '#6a3418'); disc(c, cx + 8, cy + 2, 11, '#fbe8c8', '#a8805a');
  }
  function particles(c, W, H, seed) {
    let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 18; i++) { const p = parts[PART[i % PART.length]], sz = p === parts.mist ? 70 + r() * 40 : 14 + r() * 12; c.globalAlpha = p === parts.mist ? 0.5 : 0.95; c.drawImage(p, r() * W, r() * H, sz, sz); }
    c.globalAlpha = 1;
  }
  function scene(id, W, H, x0, y0, x1, y1, decs) {
    const c = document.getElementById(id).getContext('2d');
    for (let y = 0; y < H; y += 512) for (let x = 0; x < W; x += 512) c.drawImage(ground, x, y, 512, 512);
    strips(c, x0, y0, x1, y1);
    for (const [i, x, y, s] of decs) prop(c, i, x, y, s);
    actors(c, (x0 + x1) / 2, (y0 + y1) / 2 + 20);
    particles(c, W, H, 7);
    // HUD band mock
    c.fillStyle = 'rgba(255,255,255,.0)';
    c.fillStyle = '#ff5a7a'; for (let i = 0; i < 3; i++) disc(c, 30 + i * 34, 32, 11, '#ff5a7a', '#8a1830');
    c.fillStyle = '#fff'; c.strokeStyle = '#3a2a5a'; c.lineWidth = 4; c.font = '900 26px Arial'; c.strokeText('1250', W / 2 - 30, 42); c.fillText('1250', W / 2 - 30, 42);
    c.strokeStyle = 'rgba(255,0,255,.6)'; c.lineWidth = 1; c.setLineDash([4, 4]); c.strokeRect(x0, y0, x1 - x0, y1 - y0); c.setLineDash([]);
  }
  scene('land', 960, 540, 28, 76, 932, 516, [[3, 250, 74, 96], [0, 26, 112, 84], [1, 940, 120, 80], [2, 30, 530, 84], [0, 930, 534, 84], [2, 700, 70, 72], [1, 480, 546, 70]]);
  scene('port', 560, 1100, 28, 76, 532, 1072, [[3, 160, 74, 96], [0, 26, 140, 84], [1, 538, 300, 76], [2, 22, 700, 76], [0, 534, 1090, 84], [1, 30, 1094, 76], [2, 420, 70, 70], [0, 540, 760, 76]]);
  // decor row on ground
  c = document.getElementById('decor').getContext('2d');
  c.drawImage(ground, 0, 0, 512, 512); c.drawImage(ground, 512, 0, 512, 512);
  decor.forEach((im, i) => { c.drawImage(im, 10 + i * 170, 10, 180, 180); c.drawImage(im, 700 + i * 64, 100, 64, 64); });
  document.title = 'done';
})();
</script></body></html>`;

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  for (const b of BIOMES) {
    fs.writeFileSync(TMP + '/t.html', page(b));
    await pg.setViewportSize({ width: 1620, height: 1560 });
    await pg.goto('file://' + TMP + '/t.html'); await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(OUT, `env_${b}.png`), clip: { x: 0, y: 0, width: 1620, height: 1560 } });
    for (const id of ['land', 'port', 'seam', 'decor']) await (await pg.$('#' + id)).screenshot({ path: path.join(OUT, `env_${b}_${id}.png`) });
  }
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:128px;height:128px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px"></div>`).join('') + '</div>';
  fs.writeFileSync(TMP + '/p.html', `<html><body style="margin:0;background:#fff">${row('#eef4f8')}${row('#8dbf5f')}${row('#2f4a5a')}</body></html>`);
  await pg.setViewportSize({ width: 1300, height: 560 }); await pg.goto('file://' + TMP + '/p.html'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(OUT, 'env_particles.png') });
  await br.close(); console.log('rendered into', OUT);
})();
