// Visual QA for Juno's Moon Stack environment art.
// Renders (into docs/art/):
//  env_<zone>.png    three 960x540 scenes: (a) camera at rest: sky + far + ground (line y 448) + stand-in tower
//                    (base 240x64, 4 crates 110x73 coral/sunflower/sky/mint at x 480);
//                    (b) the same with far shifted down 60 px (the camera has risen);
//                    (c) camY = -400: far +60, ground off-screen, a taller stand-in tower running off the bottom.
//                    The calm column (x 380–580, y > 150) is outlined dashed in (a).
//  env_seams.png     each tileable layer of each zone drawn twice side by side, cropped around the seam (magenta ticks).
//  env_portrait.png  the moon scene at 560x1000 (sky/far scaled by VH/540, ground at unit 93).
//  env_particles.png all particles at 4x (and 1x) on dark and light backgrounds.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jms-env-'));
fs.mkdirSync(OUT, { recursive: true });
const ZONES = ['moon', 'dunes', 'rings', 'comet'];
const PARTS = ['star', 'sparkle', 'puff', 'dust', 'ice', 'snow', 'heart', 'spark', 'coinbit', 'petal'];
const GROUND_BOTTOM = { moon: '#4a4c7e', dunes: '#6e3028', rings: '#2c5a6c', comet: '#5e4589' };
const CRATES = ['#ff6b6b', '#ffc93c', '#4fb8ff', '#3fd6a0'];

const common = `
const A = ${JSON.stringify('file://' + A)};
const GB = ${JSON.stringify(GROUND_BOTTOM)}, CR = ${JSON.stringify(CRATES)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const loadZone = async z => { const d = A + '/levels/' + z + '/'; return { sky: await load(d + 'sky.svg'), far: await load(d + 'far.svg'), ground: await load(d + 'ground.svg') }; };
// draw the way the renderer is expected to. unit: ground scale; groundY: screen y of the surface line; farDY: far shift
function scene(c, L, z, VW, VH, o) {
  const s = VH / 540, tw = 960 * s, unit = o.unit, gw = 960 * unit / 100, gh = 180 * unit / 100;
  const tile = (im, off, dy) => { let x = -((off * s) % tw); for (; x < VW; x += tw) c.drawImage(im, x, dy, tw, VH); };
  tile(L.sky, o.skyOff || 0, 0);
  tile(L.far, o.farOff || 0, o.farDY || 0);
  const gy = o.groundY - 40 * unit / 100;
  if (gy < VH) {
    const gx0 = VW / 2 - gw / 2; let x = gx0; while (x > 0) x -= gw;
    for (; x < VW; x += gw) c.drawImage(L.ground, x, gy, gw, gh);
    c.fillStyle = GB[z]; c.fillRect(0, gy + gh - 1, VW, VH);
  }
  // stand-in tower
  const bw = 2.4 * unit, bh = 0.64 * unit, cw = 1.1 * unit, ch = 0.73 * unit, cx = VW / 2;
  let top = o.groundY - bh;
  c.fillStyle = '#b9b1e8'; c.strokeStyle = '#5d5a96'; c.lineWidth = 3;
  if (o.groundY < VH + 10) { c.beginPath(); c.roundRect(cx - bw / 2, top, bw, bh, 8); c.fill(); c.stroke(); }
  for (let i = 0; i < o.n; i++) {
    const y = top - ch * (i + 1), col = CR[i % 4], dx = Math.sin(i * 1.7) * 6 * (i > 3 ? 1 : 0);
    c.fillStyle = col; c.strokeStyle = 'rgba(40,20,40,.75)'; c.beginPath(); c.roundRect(cx - cw / 2 + dx, y, cw, ch, 7); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(cx - cw / 2 + dx + 6, y + 5, cw - 12, 6);
  }
  // a couple of coins
  for (const [x, y] of o.coins || []) { c.fillStyle = '#ffd23f'; c.strokeStyle = '#e0a400'; c.beginPath(); c.arc(x, y, 0.21 * unit, 0, 7); c.fill(); c.stroke(); }
}
`;

const zonePage = z => `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;flex-direction:column;gap:8px;padding:8px"><canvas id="a" width="960" height="540"></canvas><canvas id="b" width="960" height="540"></canvas><canvas id="c" width="960" height="540"></canvas></div>
<script>${common}
(async () => {
  const L = await loadZone(${JSON.stringify(z)});
  const z = ${JSON.stringify(z)};
  const opts = { a: { unit: 100, groundY: 448, n: 4, coins: [[380, 160], [600, 210]] },
                 b: { unit: 100, groundY: 448, n: 4, farDY: 60, skyOff: 300, farOff: 120, coins: [[560, 150]] },
                 c: { unit: 100, groundY: 848, n: 10, farDY: 60, skyOff: 520, farOff: 260, coins: [[420, 170], [610, 120]] } };
  for (const id of ['a', 'b', 'c']) {
    const c = document.getElementById(id).getContext('2d');
    scene(c, L, z, 960, 540, opts[id]);
    if (id === 'a') { c.strokeStyle = 'rgba(255,0,255,.45)'; c.setLineDash([5, 5]); c.lineWidth = 1; c.strokeRect(380, 150, 200, 390); c.setLineDash([]); }
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '700 13px Arial'; c.fillText(z + ' (' + id + ')', 8, 16);
  }
  document.title = 'done';
})();
</script></body></html>`;

const portraitPage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="padding:8px"><canvas id="p" width="560" height="1000"></canvas></div>
<script>${common}
(async () => {
  const L = await loadZone('moon'); const c = document.getElementById('p').getContext('2d');
  const unit = 93, groundY = 1000 - 140 * unit / 100;
  scene(c, L, 'moon', 560, 1000, { unit, groundY, n: 4, skyOff: 100, farOff: 40, coins: [[200, 360], [380, 420]] });
  document.title = 'done';
})();
</script></body></html>`;

// each layer twice side by side: copy 1 at x -480 and copy 2 at x 480 -> the seam sits at canvas x 480; crop 960 wide
const seamPage = `<!doctype html><html><body style="margin:0;background:#fff">
<div id="w" style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:10px"></div>
<script>${common}
(async () => {
  const Wd = document.getElementById('w');
  for (const z of ${JSON.stringify(ZONES)}) {
    const L = await loadZone(z);
    const col = document.createElement('div'); col.style.cssText = 'display:flex;flex-direction:column;gap:4px'; Wd.appendChild(col);
    const mk = h => { const cv = document.createElement('canvas'); cv.width = 960; cv.height = h; col.appendChild(cv); return cv.getContext('2d'); };
    const two = (c, im, w, h, y) => { c.drawImage(im, -480, y, w, h); c.drawImage(im, 480, y, w, h); };
    const tick = c => { c.fillStyle = '#f0f'; c.fillRect(479, 0, 2, 10); c.fillRect(479, c.canvas.height - 10, 2, 10); };
    let c = mk(270); c.scale(1, 0.5); two(c, L.sky, 960, 540, 0); c.setTransform(1, 0, 0, 1, 0, 0); tick(c);
    c = mk(150); c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, 960, 150); two(c, L.far, 960, 540, -300); tick(c);
    c = mk(180); c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, 960, 180); two(c, L.ground, 960, 180, 0); tick(c);
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:128px;height:128px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px"></div>`).join('') + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#1a1f4a')}${row('#2a1638')}${row('#e9e4f5')}</body></html>`;
};

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, w, h) => {
    fs.writeFileSync(TMP + '/p.html', html); await pg.setViewportSize({ width: w, height: h });
    await pg.goto('file://' + TMP + '/p.html'); if (html.includes("document.title = 'done'")) await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
  };
  for (const z of ZONES) await shot(zonePage(z), `env_${z}.png`, 976, 1660);
  await shot(portraitPage, 'env_portrait.png', 576, 1016);
  await shot(seamPage, 'env_seams.png', 1950, 1300);
  await shot(partPage(), 'env_particles.png', 1500, 560);
  await br.close(); console.log('rendered into', OUT);
})();
