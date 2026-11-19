// Visual QA for Ziggy's Apple Castle environment art. Renders into docs/art/:
//  env_<zone>.png       two 960x540 scenes: (a) camera at rest: sky + far + ground (line at y 448), stand-in plinth and
//                       4 honey crates + apples, calm column dashed; (b) camera risen (camY -400): sky/far offset, far sunk
//                       60 px, ground off-screen, 10 crates running off the bottom.
//  env_night_dark.png   the night scene (a)/(b) with the darkness overlay rgba(12,14,48,0.55); (c) the same + the glints
//                       the renderer is expected to add on top (lit windows, lamps, pumpkins, moon) from lights.json.
//  env_seams.png        each layer drawn twice side by side (seam at x 480, magenta ticks) + a 4x zoom of the seam.
//  env_portrait.png     each zone at 560x1000 (sky/far scaled by VH/540, ground at unit 93).
//  env_particles.png    all particles at 4x and 1x on dark and light backgrounds.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kac-env-'));
fs.mkdirSync(OUT, { recursive: true });
const ZONES = ['dawn', 'noon', 'sunset', 'night'];
const PARTS = ['star', 'sparkle', 'puff', 'heart', 'spark', 'applebit', 'petal', 'leaf', 'mist', 'bat_0', 'bat_1', 'firefly', 'wisp'];
const GROUND_BOTTOM = { dawn: '#668f5c', noon: '#548f4c', sunset: '#525e40', night: '#2b3450' };
const BANDS = ['#ff5a5a', '#4ccf6a', '#ffc93c', '#58b4ff'];
const LIGHTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'lights.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)};
const GB = ${JSON.stringify(GROUND_BOTTOM)}, BANDS = ${JSON.stringify(BANDS)}, LIGHTS = ${JSON.stringify(LIGHTS)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const loadZone = async z => { const d = A + '/levels/' + z + '/'; return { sky: await load(d + 'sky.svg'), far: await load(d + 'far.svg'), ground: await load(d + 'ground.svg') }; };
// draw the way the renderer is expected to. o.unit: ground scale; o.groundY: screen y of the surface line; farDY: far sink
function scene(c, L, z, VW, VH, o) {
  const s = VH / 540, tw = 960 * s, unit = o.unit, gw = 960 * unit / 100, gh = 180 * unit / 100;
  const tile = (im, off, dy) => { let x = -((off * s) % tw); for (; x < VW; x += tw) c.drawImage(im, x, dy, tw, VH); };
  tile(L.sky, o.skyOff || 0, 0);
  tile(L.far, o.farOff || 0, (o.farDY || 0) * s);
  const gy = o.groundY - 40 * unit / 100;
  if (gy < VH) {
    const gx0 = VW / 2 - gw / 2; let x = gx0; while (x > 0) x -= gw;
    for (; x < VW; x += gw) c.drawImage(L.ground, x, gy, gw, gh);
    c.fillStyle = GB[z]; c.fillRect(0, gy + gh - 1, VW, VH);
  }
  // stand-in plinth + honey crates with a coloured band
  const bw = 2.4 * unit, bh = 0.64 * unit, cw = 1.1 * unit, ch = 0.73 * unit, cx = VW / 2;
  let top = o.groundY - bh;
  c.lineWidth = 3;
  if (o.groundY < VH + 10) { c.fillStyle = '#9a92c0'; c.strokeStyle = '#5a5288'; c.beginPath(); c.roundRect(cx - bw / 2, top, bw, bh, 8); c.fill(); c.stroke(); }
  for (let i = 0; i < o.n; i++) {
    const y = top - ch * (i + 1), dx = Math.sin(i * 1.7) * 6 * (i > 3 ? 1 : 0), x = cx - cw / 2 + dx;
    c.fillStyle = '#d9a066'; c.strokeStyle = '#6b3f1f'; c.beginPath(); c.roundRect(x, y, cw, ch, 7); c.fill(); c.stroke();
    c.fillStyle = '#a86a3a'; c.fillRect(x + 4, y + 4, 9, ch - 8); c.fillRect(x + cw - 13, y + 4, 9, ch - 8);
    c.fillStyle = BANDS[i % 4]; c.fillRect(x + 13, y + ch * 0.42, cw - 26, ch * 0.2);
  }
  for (const [x, y] of o.apples || []) { c.fillStyle = '#ff4d4d'; c.strokeStyle = '#7a1b26'; c.beginPath(); c.arc(x, y, 0.21 * unit, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#5ccf5c'; c.beginPath(); c.ellipse(x + 6, y - 0.24 * unit, 7, 3.5, -0.5, 0, 7); c.fill(); }
}
function overlay(c, VW, VH) { c.fillStyle = 'rgba(12,14,48,0.55)'; c.fillRect(0, 0, VW, VH); }
// glints like the renderer would add above the darkness: soft additive glows at the lit window / lamp / moon spots
function glints(c, VW, VH, o) {
  const s = VH / 540, tw = 960 * s;
  const spot = (x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = -1; k <= 1; k++) {
    const m = LIGHTS.night_moon; spot((m.x - (o.skyOff || 0)) * s + k * tw, m.y * s, m.r * 1.6 * s, 'rgba(255,240,190,A)', 0.55);
    for (const w of LIGHTS.night_far) spot((w.x - (o.farOff || 0)) * s + k * tw, (w.y + (o.farDY || 0)) * s, w.r * 1.3 * s, 'rgba(255,200,90,A)', 0.6);
  }
  if (o.groundY < VH + 60) {
    const u = o.unit / 100, gy = o.groundY - 40 * u, gw = 960 * u, gx0 = VW / 2 - gw / 2;
    for (let k = -1; k <= 1; k++) for (const p of LIGHTS.night_ground) spot(gx0 + k * gw + p.x * u, gy + p.y * u, p.r * 1.2 * u, 'rgba(255,200,90,A)', 0.5);
  }
  c.restore();
}
const OPTS = { a: { unit: 100, groundY: 448, n: 4, apples: [[360, 170], [610, 215]] },
               b: { unit: 100, groundY: 848, n: 10, farDY: 60, skyOff: 520, farOff: 260, apples: [[420, 170], [610, 120]] } };
`;

const zonePage = z => `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;flex-direction:column;gap:8px;padding:8px"><canvas id="a" width="960" height="540"></canvas><canvas id="b" width="960" height="540"></canvas></div>
<script>${common}
(async () => {
  const L = await loadZone(${JSON.stringify(z)}), z = ${JSON.stringify(z)};
  for (const id of ['a', 'b']) {
    const c = document.getElementById(id).getContext('2d');
    scene(c, L, z, 960, 540, OPTS[id]);
    if (id === 'a') { c.strokeStyle = 'rgba(255,0,255,.45)'; c.setLineDash([5, 5]); c.lineWidth = 1; c.strokeRect(380, 150, 200, 390); c.setLineDash([]); }
  }
  document.title = 'done';
})();
</script></body></html>`;

const darkPage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;flex-direction:column;gap:8px;padding:8px"><canvas id="a" width="960" height="540"></canvas><canvas id="b" width="960" height="540"></canvas><canvas id="c" width="960" height="540"></canvas></div>
<script>${common}
(async () => {
  const L = await loadZone('night');
  for (const [id, o, gl] of [['a', OPTS.a, false], ['b', OPTS.b, false], ['c', OPTS.a, true]]) {
    const c = document.getElementById(id).getContext('2d');
    scene(c, L, 'night', 960, 540, o); overlay(c, 960, 540); if (gl) glints(c, 960, 540, o);
  }
  document.title = 'done';
})();
</script></body></html>`;

const portraitPage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;gap:8px;padding:8px">${ZONES.map(z => `<canvas id="p_${z}" width="560" height="1000"></canvas>`).join('')}</div>
<script>${common}
(async () => {
  for (const z of ${JSON.stringify(ZONES)}) {
    const L = await loadZone(z); const c = document.getElementById('p_' + z).getContext('2d');
    const unit = 93, groundY = 1000 - 140 * unit / 100;
    scene(c, L, z, 560, 1000, { unit, groundY, n: 4, skyOff: 329, farOff: 329, apples: [[200, 360], [380, 420]] });
  }
  document.title = 'done';
})();
</script></body></html>`;

// each layer twice side by side: copy 1 at x -480 and copy 2 at x 480 -> the seam sits at canvas x 480; + 4x zoom of x 440..520
const seamPage = `<!doctype html><html><body style="margin:0;background:#fff">
<div id="w" style="display:flex;flex-direction:column;gap:10px;padding:10px"></div>
<script>${common}
(async () => {
  const Wd = document.getElementById('w');
  for (const z of ${JSON.stringify(ZONES)}) {
    const L = await loadZone(z);
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:flex-start'; Wd.appendChild(row);
    const layers = [['sky', L.sky, 540, 0], ['far', L.far, 260, -280], ['ground', L.ground, 180, 0]];
    for (const [n, im, h, y] of layers) {
      const cv = document.createElement('canvas'); cv.width = 960; cv.height = h; const c = cv.getContext('2d');
      c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, 960, h); c.drawImage(im, -480, y); c.drawImage(im, 480, y);
      const zc = document.createElement('canvas'); zc.width = 320; zc.height = Math.min(h, 240) ; const zz = zc.getContext('2d'); zz.imageSmoothingEnabled = false;
      const sy = Math.max(0, Math.floor(h / 2 - zc.height / 8));
      zz.drawImage(cv, 440, sy, 80, zc.height / 4, 0, 0, 320, zc.height);
      c.fillStyle = '#f0f'; c.fillRect(479, 0, 2, 8); c.fillRect(479, h - 8, 2, 8);
      zz.fillStyle = '#f0f'; zz.fillRect(159, 0, 2, 8);
      cv.style.cssText = n === 'sky' ? 'width:480px;height:270px' : 'width:480px';
      row.appendChild(cv); row.appendChild(zc);
    }
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:96px;height:96px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:24px;height:24px"></div>`).join('') + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#1b1e4a')}${row('#7cc8ff')}${row('#fdf3e6')}</body></html>`;
};

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, w, h) => {
    fs.writeFileSync(TMP + '/p.html', html); await pg.setViewportSize({ width: w, height: h });
    await pg.goto('file://' + TMP + '/p.html'); if (html.includes("document.title = 'done'")) await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
  };
  for (const z of ZONES) await shot(zonePage(z), `env_${z}.png`, 976, 1110);
  await shot(darkPage, 'env_night_dark.png', 976, 1660);
  await shot(portraitPage, 'env_portrait.png', 2280, 1016);
  await shot(seamPage, 'env_seams.png', 2600, 1200);
  await shot(partPage(), 'env_particles.png', 1600, 480);
  await br.close(); console.log('rendered into', OUT);
})();
