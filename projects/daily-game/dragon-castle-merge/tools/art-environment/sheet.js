// Visual QA for Ember's Glow Castle environment art.
// Renders (into docs/art/):
//  env_<zone>.png      the composed scene at 960x540 (top) and 1280x540 (bottom): sky + far tiled with a few hundred px
//                      offset (proves tiling), near centred and repeated left/right, the dark board panel placeholder and
//                      sample lights (tier colours) inside it, plus the protected near zone (x 300–660, y < 500) dashed.
//  env_portrait.png    the four zones at 560x1200: sky/far scaled so their height covers the screen (aspect kept, tiled),
//                      near at native size anchored to the bottom and centred, board 480x672 at y 468.
//  env_seams.png       each layer of each zone drawn twice side by side, the seam (magenta tick) at x 480.
//  env_particles.png   the particles at 4x and 1x on dark and light backgrounds.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egc-env-'));
fs.mkdirSync(OUT, { recursive: true });
const ZONES = ['courtyard', 'cellar', 'library', 'tower'];
const PARTS = ['glow', 'leaf', 'drip', 'sparkle', 'dust', 'page', 'star', 'puff', 'heart', 'spark'];
// suggested renderer overlays (kept in sync with the report)
const TINT = { courtyard: null, cellar: null, library: null, tower: null };
const VIGNETTE = { courtyard: null, cellar: null, library: null, tower: null };
const ITEMS = ['#b6f04a', '#5cc8ff', '#ff7ac8', '#ffd44a', '#ff9a3c', '#ff5a5a', '#ffe14d', '#e9e2ff'];

const common = `
const A = ${JSON.stringify('file://' + A)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const TINT = ${JSON.stringify(TINT)}, VIG = ${JSON.stringify(VIGNETTE)}, ITEMS = ${JSON.stringify(ITEMS)};
// draw one scene the way the renderer is expected to
function scene(c, L, z, VW, VH, off, board) {
  const s = VH / 540, tw = 960 * s;
  const tile = (im, o) => { let x = -((o * s) % tw); for (; x < VW; x += tw) c.drawImage(im, x, 0, tw, VH); };
  tile(L.sky, off); tile(L.far, off * 0.4 + 90);
  const nx = Math.round(VW / 2 - 480), ny = VH - 540;
  for (let x = nx; x > -960; x -= 960) c.drawImage(L.near, x, ny, 960, 540);
  for (let x = nx + 960; x < VW; x += 960) c.drawImage(L.near, x, ny, 960, 540);
  if (TINT[z]) { c.fillStyle = TINT[z]; c.fillRect(0, 0, VW, VH); }
  if (VIG[z]) { const g = c.createRadialGradient(VW / 2, VH * 0.55, Math.min(VW, VH) * 0.35, VW / 2, VH * 0.55, Math.max(VW, VH) * 0.8); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, VIG[z]); c.fillStyle = g; c.fillRect(0, 0, VW, VH); }
  // board placeholder
  const [bx, by, bw, bh] = board, cell = bw / 5;
  c.fillStyle = 'rgba(27,20,56,0.8)'; c.beginPath(); c.roundRect(bx - 6, by - 6, bw + 12, bh + 12, 14); c.fill();
  c.strokeStyle = 'rgba(200,180,255,0.25)'; c.lineWidth = 2; c.stroke();
  for (let i = 0; i < 8; i++) { const col = i % 5, row = Math.floor(i / 5) + (i % 2); const x = bx + (col + 0.5) * cell, y = by + bh - (row + 0.5) * cell, r = cell * 0.36;
    const g = c.createRadialGradient(x, y, 0, x, y, r * 1.4); g.addColorStop(0, ITEMS[i]); g.addColorStop(0.6, ITEMS[i]); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.4, 0, 7); c.fill(); }
  // Ember placeholder above the board
  c.fillStyle = 'rgba(127,216,200,0.9)'; c.beginPath(); c.arc(bx + bw * 0.5, by - cell * 0.95, cell * 0.6, 0, 7); c.fill();
}
const loadZone = async z => { const d = A + '/levels/' + z + '/'; return { sky: await load(d + 'sky.svg'), far: await load(d + 'far.svg'), near: await load(d + 'near.svg') }; };
`;

const zonePage = z => `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:10px"><canvas id="a" width="960" height="540"></canvas><canvas id="b" width="1280" height="540"></canvas></div>
<script>${common}
(async () => {
  const L = await loadZone(${JSON.stringify(z)});
  for (const [id, VW, off] of [['a', 960, 0], ['b', 1280, 310]]) {
    const c = document.getElementById(id).getContext('2d');
    const bx = Math.round((VW - 275) / 2);
    scene(c, L, ${JSON.stringify(z)}, VW, 540, off, [bx, 133, 275, 385]);
    c.strokeStyle = 'rgba(255,0,255,.5)'; c.setLineDash([5, 5]); c.lineWidth = 1; c.strokeRect(VW / 2 - 180, 0, 360, 500); c.setLineDash([]);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '700 13px Arial'; c.fillText(${JSON.stringify(z)} + ' ' + VW + 'x540  sky/far offset ' + off, 8, 16);
  }
  document.title = 'done';
})();
</script></body></html>`;

const portraitPage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;gap:10px;padding:10px">${ZONES.map(z => `<canvas id="P_${z}" width="560" height="1200"></canvas>`).join('')}</div>
<script>${common}
(async () => {
  for (const z of ${JSON.stringify(ZONES)}) {
    const L = await loadZone(z); const c = document.getElementById('P_' + z).getContext('2d');
    scene(c, L, z, 560, 1200, 120, [40, 468, 480, 672]);
  }
  document.title = 'done';
})();
</script></body></html>`;

const seamPage = `<!doctype html><html><body style="margin:0;background:#fff">
<div id="w" style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:10px"></div>
<script>${common}
(async () => {
  const Wd = document.getElementById('w');
  for (const z of ${JSON.stringify(ZONES)}) {
    const L = await loadZone(z);
    const col = document.createElement('div'); col.style.cssText = 'display:flex;flex-direction:column;gap:4px'; Wd.appendChild(col);
    const mk = h => { const cv = document.createElement('canvas'); cv.width = 960; cv.height = h; col.appendChild(cv); return cv.getContext('2d'); };
    const two = (c, im, y) => { c.drawImage(im, -480, y, 960, 540); c.drawImage(im, 480, y, 960, 540); };
    const tick = c => { c.fillStyle = '#f0f'; c.fillRect(479, 0, 2, 12); c.fillRect(479, c.canvas.height - 12, 2, 12); };
    let c = mk(270); c.scale(1, 0.5); two(c, L.sky, 0); c.setTransform(1, 0, 0, 1, 0, 0); tick(c);
    c = mk(270); c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, 960, 270); c.scale(1, 0.5); two(c, L.far, 0); c.setTransform(1, 0, 0, 1, 0, 0); tick(c);
    c = mk(160); c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, 960, 160); two(c, L.near, -380); tick(c);
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:128px;height:128px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:24px;height:24px"></div>`).join('') + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#1b1438')}${row('#0b1030')}${row('#e9e4f5')}</body></html>`;
};

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, w, h) => {
    fs.writeFileSync(TMP + '/p.html', html); await pg.setViewportSize({ width: w, height: h });
    await pg.goto('file://' + TMP + '/p.html'); if (html.includes("document.title = 'done'")) await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
  };
  for (const z of ZONES) await shot(zonePage(z), `env_${z}.png`, 1300, 1110);
  await shot(portraitPage, 'env_portrait.png', 2290, 1220);
  await shot(seamPage, 'env_seams.png', 1950, 1500);
  await shot(partPage(), 'env_particles.png', 1500, 600);
  await br.close(); console.log('rendered into', OUT);
})();
