// Visual QA for Nimbus's Bubble Garden environment art.
// Renders (into docs/art/):
//  env_<zone>.png     the composed 960x540 scene the way the renderer draws it (DESIGN.md §2, §4.2): sky gradient (§4.4),
//                     sky top-anchored, far + mid with their bottom at groundY + 0.3u, ground with y 40 on groundY; every layer
//                     tiled with a different x offset so the seams fall on screen (coloured ticks on the top edge mark them).
//                     Stand-ins for Nimbus, bubbles+gems and a burr judge play-area contrast; dashed lines at topY / groundY.
//  env_portrait.png   dawn + night composed at 720x1280 (unit 120, scale 1.2): the gradient fills the gap between the sky
//                     and the far/mid layers.
//  env_seams.png      every layer of every zone drawn twice side by side, cropped ±80 px around the join, at 1.5x.
//  env_particles.png  all particles at 4x on a light and a dark background.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nbg-env-'));
fs.mkdirSync(OUT, { recursive: true });
const ZONES = ['dawn', 'noon', 'sunset', 'night'];
const PARTS = ['drop', 'streak', 'ripple', 'splash', 'shard', 'sparkle', 'petal', 'leaf', 'mist', 'glow', 'star', 'puff'];
const PAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)};
const PAL = ${JSON.stringify(PAL)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const LAYERS = ['sky', 'far', 'mid', 'ground'];
const loadZone = async z => { const o = {}; for (const l of LAYERS) o[l] = await load(A + '/levels/' + z + '/' + l + '.svg'); return o; };
const GEMS = ['#ff4d6d', '#3d8bff', '#2fd07a', '#ffc531', '#b26bff'];
function scene(c, L, z, VW, VH, unit, off, o = {}) {
  const k = unit / 100, tw = 960 * k, P = PAL[z];
  const groundY = VH - 0.95 * unit, topY = 0.85 * unit;
  const g = c.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, P.skyTop); g.addColorStop(1, P.skyBottom);
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  const tile = (im, ox, y, h) => { let x = -(((ox * k) % tw) + tw) % tw; for (; x < VW; x += tw) c.drawImage(im, x, y, tw, h); };
  tile(L.sky, off.sky, 0, 540 * k);
  const fy = groundY + 0.3 * unit - 540 * k;
  tile(L.far, off.far, fy, 540 * k);
  tile(L.mid, off.mid, fy, 540 * k);
  c.fillStyle = P.lawn; c.fillRect(0, groundY - 0.4 * unit + 199 * k, VW, VH);
  tile(L.ground, off.ground, groundY - 0.4 * unit, 200 * k);
  if (o.standins !== false) {
    // stand-ins: Nimbus, bubbles with gems, a falling burr
    const bub = (x, y, r, gi) => {
      c.save(); c.globalAlpha = 0.9; c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.fillStyle = 'rgba(220,240,255,.12)';
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,170,220,.7)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r - 3, 2.2, 4.2); c.stroke(); c.restore();
      c.fillStyle = GEMS[gi]; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r * 0.45, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - r * 0.15, y - r * 0.15, r * 0.1, 0, 7); c.fill();
    };
    const u = unit;
    [[0.18, 0.55, 0], [0.42, 0.35, 1], [0.6, 0.7, 2], [0.75, 0.25, 3], [0.88, 0.58, 4]].forEach(([fx, fy2, gi]) => bub(fx * VW, topY + fy2 * (groundY - topY), 0.36 * u, gi));
    const hx = 0.3 * VW, hy = topY + 0.45 * (groundY - topY), hr = 0.42 * u;
    c.fillStyle = '#cfe3f7'; c.strokeStyle = '#5a7aa6'; c.lineWidth = 3;
    c.beginPath(); for (const [dx, dy, rr] of [[0, 0, 1], [-0.6, 0.2, 0.6], [0.6, 0.2, 0.6], [0, -0.45, 0.6]]) { c.moveTo(hx + dx * hr + rr * hr, hy + dy * hr); c.arc(hx + dx * hr, hy + dy * hr, rr * hr, 0, 7); } c.stroke(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(hx - 0.08 * hr, hy - 0.1 * hr, 0.85 * hr, 0, 7); c.fill();
    c.fillStyle = '#2b3a5c'; c.beginPath(); c.arc(hx - 0.25 * hr, hy, 0.1 * hr, 0, 7); c.arc(hx + 0.25 * hr, hy, 0.1 * hr, 0, 7); c.fill();
    const bx = 0.52 * VW, by = topY + 0.2 * (groundY - topY), br = 0.3 * u;
    c.fillStyle = '#6b4226'; c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; c.lineTo(bx + Math.cos(a) * br * (i % 2 ? 0.75 : 1.25), by + Math.sin(a) * br * (i % 2 ? 0.75 : 1.25)); } c.fill();
    c.fillStyle = '#8a5a3a'; c.strokeStyle = '#4a2c18'; c.beginPath(); c.arc(bx, by, br * 0.7, 0, 7); c.fill(); c.stroke();
  }
  if (o.marks !== false) {
    c.save(); c.setLineDash([6, 6]); c.strokeStyle = 'rgba(255,0,255,.55)'; c.lineWidth = 1;
    for (const y of [topY, groundY]) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(VW, y + 0.5); c.stroke(); }
    c.restore();
    const cols = { sky: '#ff00ff', far: '#00e5ff', mid: '#ffea00', ground: '#00ff6a' };
    for (const l of LAYERS) { let x = -(((off[l] * k) % tw) + tw) % tw; for (; x <= VW; x += tw) { c.fillStyle = cols[l]; c.fillRect(x - 1, 0, 3, 10); } }
  }
  return { groundY, topY };
}
`;
const OFF = { sky: 300, far: 610, mid: 170, ground: 450 };

const zonePage = z => `<!doctype html><html><body style="margin:0;background:#222">
<canvas id="a" width="960" height="540"></canvas>
<script>${common}
(async () => { const z = ${JSON.stringify(z)}; const L = await loadZone(z);
  scene(document.getElementById('a').getContext('2d'), L, z, 960, 540, 100, ${JSON.stringify(OFF)});
  document.title = 'done'; })();
</script></body></html>`;

const portraitPage = () => `<!doctype html><html><body style="margin:0;background:#222">
<div id="w" style="display:flex;gap:0"><canvas id="a" width="720" height="1280"></canvas><canvas id="b" width="720" height="1280"></canvas></div>
<script>${common}
(async () => {
  for (const [id, z] of [['a', 'dawn'], ['b', 'night']]) { const L = await loadZone(z); scene(document.getElementById(id).getContext('2d'), L, z, 720, 1280, 120, ${JSON.stringify(OFF)}); }
  document.title = 'done'; })();
</script></body></html>`;

const seamPage = () => `<!doctype html><html><body style="margin:0;background:#222">
<canvas id="a" width="1000" height="10"></canvas>
<script>${common}
(async () => {
  const S = 1.5, HW = 80, bands = { sky: [0, 320, 540], far: [200, 540, 540], mid: [280, 540, 540], ground: [0, 200, 200] };
  const cw = 2 * HW * S, gap = 10, rowH = 340 * S + gap;
  const cv = document.getElementById('a'); cv.width = 4 * (cw + gap) + gap; cv.height = 4 * rowH + gap;
  const c = cv.getContext('2d'); c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
  for (let zi = 0; zi < 4; zi++) {
    const z = ${JSON.stringify(ZONES)}[zi], L = await loadZone(z), P = PAL[z];
    ${JSON.stringify(['sky', 'far', 'mid', 'ground'])}.forEach((l, li) => {
      const [y0, y1, th] = bands[l], X = gap + li * (cw + gap), Y = gap + zi * rowH, h = (y1 - y0) * S;
      c.save(); c.beginPath(); c.rect(X, Y, cw, h); c.clip();
      const g = c.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, P.skyTop); g.addColorStop(1, P.skyBottom); c.fillStyle = g; c.fillRect(X, Y, cw, h);
      // tile A covers [-HW, 0) (its right edge), tile B covers [0, HW) (its left edge)
      c.drawImage(L[l], 960 - HW, y0, HW, y1 - y0, X, Y, HW * S, h);
      c.drawImage(L[l], 0, y0, HW, y1 - y0, X + HW * S, Y, HW * S, h);
      c.restore();
      c.fillStyle = '#ff00ff'; c.fillRect(X + HW * S - 1, Y, 2, 8); c.fillRect(X + HW * S - 1, Y + h - 8, 2, 8);
    });
  }
  document.title = 'done'; })();
</script></body></html>`;

const partPage = () => `<!doctype html><html><body style="margin:0;background:#222">
<canvas id="a" width="10" height="10"></canvas>
<script>${common}
(async () => {
  const names = ${JSON.stringify(PARTS)};
  const ims = []; for (const n of names) ims.push(await load(A + '/particles/' + n + '.svg'));
  const cell = 270, cv = document.getElementById('a'); cv.width = cell * 6; cv.height = cell * 4;
  const c = cv.getContext('2d');
  for (let row = 0; row < 4; row++) {
    const dark = row >= 2; c.fillStyle = dark ? '#1e2540' : '#e9eef4'; c.fillRect(0, row * cell, cv.width, cell);
  }
  names.forEach((n, i) => {
    const im = ims[i]; if (!im) return; const w = im.width * 4, h = im.height * 4;
    for (const half of [0, 2]) {
      const col = i % 6, row = Math.floor(i / 6) + half, cx = col * cell + cell / 2, cy = row * cell + cell / 2;
      c.strokeStyle = 'rgba(128,128,160,.35)'; c.strokeRect(cx - w / 2, cy - h / 2, w, h);
      c.drawImage(im, cx - w / 2, cy - h / 2, w, h); c.drawImage(im, col * cell + 8, row * cell + 8);
    }
  });
  document.title = 'done'; })();
</script></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name) => {
    const f = path.join(TMP, name + '.html'); fs.writeFileSync(f, html);
    await page.goto('file://' + f); await page.waitForFunction(() => document.title === 'done', null, { timeout: 30000 });
    const el = await page.$(name === 'env_portrait' ? '#w' : '#a');
    await el.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('wrote', path.join(OUT, name + '.png'));
  };
  for (const z of ZONES) await shot(zonePage(z), 'env_' + z);
  await page.setViewportSize({ width: 1500, height: 1400 });
  await shot(portraitPage(), 'env_portrait');
  await page.setViewportSize({ width: 1100, height: 2200 });
  await shot(seamPage(), 'env_seams');
  await page.setViewportSize({ width: 1700, height: 1200 });
  await shot(partPage(), 'env_particles');
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
