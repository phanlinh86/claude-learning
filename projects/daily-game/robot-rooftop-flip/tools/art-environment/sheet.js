// Visual QA for Bolt's Rooftop Flip environment art.
// Renders (into docs/art/):
//  env_<zone>.png    a composed 960x540 scene: sky + far + mid (offset as if scrolled), rail spans tiled at ceilY 141
//                    (y 144 of rail.svg on 141) with a gap and rail_end caps (right cap mirrored for the left end),
//                    building spans tiled at the roof line 431 (y 16 of building.svg on 431) with a gap and darker side
//                    walls; stand-in Bolt + firefly glow dots (pink / yellow / cyan) to judge corridor contrast.
//                    Below: the same scene with the corridor band (141..431) outlined and edge ticks at 141 / 431.
//  env_seams.png     every tiled layer of every zone drawn twice side by side, cropped around the seam (magenta ticks).
//  env_portrait.png  the night (and dawn) scene at 560x1000 (unit 93, midY 500).
//  env_particles.png all particles at 4x and 1x on dark and light backgrounds.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-env-'));
fs.mkdirSync(OUT, { recursive: true });
const ZONES = ['dawn', 'noon', 'sunset', 'night'];
const PARTS = ['mist', 'seed', 'mote', 'leaf', 'star', 'sparkle', 'puff', 'spark', 'bit_pink', 'bit_yellow', 'bit_cyan', 'shoot'];
const PAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)};
const PAL = ${JSON.stringify(PAL)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const LAYERS = ['sky', 'far', 'mid', 'building', 'rail', 'rail_end'];
const loadZone = async z => { const o = {}; for (const l of LAYERS) o[l] = await load(A + '/levels/' + z + '/' + l + '.svg'); return o; };
const shade = (hex, t) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * (1 - t))); return 'rgb(' + c.join(',') + ')'; };
// draw like the renderer is expected to
function scene(c, L, z, VW, VH, o) {
  const s = VH / 540, tw = 960 * s, u = o.unit;
  const ceilY = o.midY - 1.45 * u, floorY = o.midY + 1.45 * u;
  const tile = (im, off) => { let x = -((off * s) % tw); for (; x < VW; x += tw) c.drawImage(im, x, 0, tw, VH); };
  tile(L.sky, o.skyOff || 0); tile(L.far, o.farOff || 0); tile(L.mid, o.midOff || 0);
  // rails: tiles 2.4u x 1.6u, y144 at ceilY
  const rw = 2.4 * u, rh = 1.6 * u, ry = ceilY - 1.44 * u, ew = 0.4 * u;
  for (const [x0, x1] of o.rails) {
    c.save(); c.beginPath(); c.rect(x0, ry - 1, x1 - x0, rh + 2); c.clip();
    for (let x = x0 - ((x0 + (o.railOff || 0)) % rw + rw) % rw; x < x1; x += rw) c.drawImage(L.rail, x, ry, rw, rh);
    c.restore();
    c.drawImage(L.rail_end, x1, ry, ew, rh);
    c.save(); c.translate(x0, 0); c.scale(-1, 1); c.drawImage(L.rail_end, 0, ry, ew, rh); c.restore();
  }
  // buildings: tiles 2.4u x 4u, y16 at floorY
  const bw = 2.4 * u, bh = 4 * u, by = floorY - 0.16 * u;
  for (const [x0, x1] of o.roofs) {
    c.save(); c.beginPath(); c.rect(x0, by, x1 - x0, VH); c.clip();
    for (let x = x0 - ((x0 + (o.roofOff || 0)) % bw + bw) % bw; x < x1; x += bw) c.drawImage(L.building, x, by, bw, bh);
    c.fillStyle = PAL[z].bottom; c.fillRect(x0, by + bh - 1, x1 - x0, VH);
    // side walls at gaps (slightly darker facade colour)
    c.fillStyle = shade(PAL[z].wall, 0.25); const sw = 0.1 * u;
    c.fillRect(x0, by, sw, VH); c.fillRect(x1 - sw, by, sw, VH);
    c.restore();
  }
  // stand-ins: Bolt + fireflies with additive glow
  const glowDot = (x, y, col) => { const r = 0.22 * u; c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.2, 0, 7); c.fill(); c.restore(); c.fillStyle = col; c.beginPath(); c.arc(x, y, r * 0.55, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r * 0.22, 0, 7); c.fill(); };
  const hx = o.heroX, hy = floorY - 0.42 * u;
  c.fillStyle = '#eef2f8'; c.strokeStyle = '#2a3350'; c.lineWidth = 3; c.beginPath(); c.arc(hx, hy, 0.4 * u, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#1d2440'; c.beginPath(); c.arc(hx - 0.03 * u, hy + 0.06 * u, 0.1 * u, 0, 7); c.fill();
  (o.ff || []).forEach(([fx, fy, k]) => glowDot(fx * u / 100 + (o.ffDX || 0), ceilY + fy * (floorY - ceilY), ['#ff5fa2', '#ffd23f', '#39e1ff'][k]));
  return { ceilY, floorY };
}
`;
const FF = [[400, 0.2, 0], [460, 0.2, 0], [520, 0.2, 0], [620, 0.5, 1], [680, 0.42, 1], [740, 0.5, 2], [820, 0.8, 2], [880, 0.8, 1]];

const zonePage = z => `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;flex-direction:column;gap:8px;padding:8px"><canvas id="a" width="960" height="540"></canvas><canvas id="b" width="960" height="540"></canvas></div>
<script>${common}
(async () => {
  const z = ${JSON.stringify(z)}; const L = await loadZone(z);
  const base = { unit: 100, midY: 0.53 * 540, heroX: 0.26 * 960, ff: ${JSON.stringify(FF)} };
  const A1 = Object.assign({}, base, { skyOff: 0, farOff: 0, midOff: 0, rails: [[-60, 330], [470, 1020]], roofs: [[-40, 560], [700, 1010]] });
  const B1 = Object.assign({}, base, { skyOff: 610, farOff: 380, midOff: 520, railOff: 90, roofOff: 130, rails: [[-60, 600], [760, 1020]], roofs: [[-40, 300], [430, 1010]], ffDX: -200 });
  let c = document.getElementById('a').getContext('2d'); scene(c, L, z, 960, 540, A1);
  c = document.getElementById('b').getContext('2d'); const g = scene(c, L, z, 960, 540, B1);
  c.strokeStyle = 'rgba(255,0,255,.6)'; c.setLineDash([6, 6]); c.lineWidth = 1; c.strokeRect(0.5, g.ceilY, 959, g.floorY - g.ceilY); c.setLineDash([]);
  c.fillStyle = '#f0f'; for (const y of [g.ceilY, g.floorY]) { c.fillRect(0, y - 0.5, 14, 1); c.fillRect(946, y - 0.5, 14, 1); }
  document.title = 'done';
})();
</script></body></html>`;

const portraitPage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;gap:8px;padding:8px"><canvas id="p" width="560" height="1000"></canvas><canvas id="q" width="560" height="1000"></canvas></div>
<script>${common}
(async () => {
  for (const [id, z] of [['p', 'night'], ['q', 'dawn']]) {
    const L = await loadZone(z); const c = document.getElementById(id).getContext('2d');
    scene(c, L, z, 560, 1000, { unit: 93, midY: 500, heroX: 0.22 * 560, skyOff: 200, farOff: 90, midOff: 160, rails: [[-40, 260], [380, 600]], roofs: [[-40, 330], [450, 600]],
      ff: [[220, 0.25, 0], [280, 0.25, 0], [340, 0.5, 1], [420, 0.75, 2]] });
  }
  document.title = 'done';
})();
</script></body></html>`;

// each layer twice side by side, seam at canvas x 480
const seamPage = `<!doctype html><html><body style="margin:0;background:#fff">
<div id="w" style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:10px"></div>
<script>${common}
(async () => {
  const Wd = document.getElementById('w');
  for (const z of ${JSON.stringify(ZONES)}) {
    const L = await loadZone(z);
    const col = document.createElement('div'); col.style.cssText = 'display:flex;flex-direction:column;gap:4px'; Wd.appendChild(col);
    const mk = h => { const cv = document.createElement('canvas'); cv.width = 960; cv.height = h; col.appendChild(cv); return cv.getContext('2d'); };
    const tick = c => { c.fillStyle = '#f0f'; c.fillRect(479, 0, 2, 8); c.fillRect(479, c.canvas.height - 8, 2, 8); };
    const bg = (c, h) => { c.fillStyle = '#7a7a7a'; c.fillRect(0, 0, 960, h); };
    // sky (half scale), far/mid cropped y 200..540
    let c = mk(270); c.drawImage(L.sky, 480, 0, 480, 540, 0, 0, 480, 270); c.drawImage(L.sky, 0, 0, 480, 540, 480, 0, 480, 270); tick(c);
    for (const l of ['far', 'mid']) { c = mk(170); bg(c, 170); c.drawImage(L[l], 480, 200, 480, 340, 0, 0, 480, 170); c.drawImage(L[l], 0, 200, 480, 340, 480, 0, 480, 170); tick(c); }
    // building / rail: 2 tiles at 2x, seam at 480
    c = mk(260); bg(c, 260); c.drawImage(L.building, 0, 0, 240, 130, 0, 0, 480, 260); c.drawImage(L.building, 0, 0, 240, 130, 480, 0, 480, 260); tick(c);
    c = mk(160); bg(c, 160); c.drawImage(L.rail, 0, 80, 240, 80, 0, 0, 480, 160); c.drawImage(L.rail, 0, 80, 240, 80, 480, 0, 480, 160); tick(c);
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => { const w = p === 'shoot' ? 256 : 128, h = p === 'shoot' ? 64 : 128; return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:${w}px;height:${h}px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:${w / 4}px;height:${h / 4}px"></div>`; }).join('') + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#0e1638')}${row('#7d4e5e')}${row('#d4f0ff')}</body></html>`;
};

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, w, h) => {
    fs.writeFileSync(TMP + '/p.html', html); await pg.setViewportSize({ width: w, height: h });
    await pg.goto('file://' + TMP + '/p.html'); if (html.includes("document.title = 'done'")) await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
  };
  for (const z of ZONES) await shot(zonePage(z), `env_${z}.png`, 976, 1104);
  await shot(portraitPage, 'env_portrait.png', 1144, 1016);
  await shot(seamPage, 'env_seams.png', 1950, 1600);
  await shot(partPage(), 'env_particles.png', 2000, 560);
  await br.close(); console.log('rendered into', OUT);
})();
