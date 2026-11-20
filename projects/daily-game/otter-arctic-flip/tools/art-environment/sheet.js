// Visual QA for Ollie's Lighthouse Flip environment art.
// Renders (into docs/art/ unless a second arg is given):
//  env_<zone>.png    3 composed 960x540 scenes: (1) day look, (2) scrolled further with the corridor band outlined,
//                    (3) darkened with rgba(10,14,38,0.6) + a few lamp cut-outs (sunset / night look).
//                    sky (parallax 0.03) → far (0.12) → mid (0.6) → floor spans (building.svg 2.4u×4u, y16 at floorY 431)
//                    with one hatch gap → ceiling spans (rail.svg 2.4u×1.6u, y144 at ceilY 141) with one gap + rail_end caps.
//                    Stand-in Ollie (chestnut + teal scarf) and leaves (green / gold / red) to judge corridor contrast.
//  env_portrait.png  every floor at 560x1000 (unit 93.3, midY 470), normal + darkened.
//  env_seams.png     every tiled layer of every zone drawn twice side by side, cropped around the seam (magenta ticks).
//  env_particles.png all particles at 4x and 1x on dark, warm and light backgrounds.
// Usage: node sheet.js [assetsDir] [outDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'olf-env-'));
fs.mkdirSync(OUT, { recursive: true });
const ZONES = ['dawn', 'noon', 'sunset', 'night'];
const PARTS = ['snow', 'flake', 'mote', 'sparkle', 'star', 'puff', 'bit_0', 'bit_1', 'bit_2', 'aurora', 'glow'];
const PAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)};
const PAL = ${JSON.stringify(PAL)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const LAYERS = ['sky', 'far', 'mid', 'building', 'rail', 'rail_end'];
const loadZone = async z => { const o = {}; for (const l of LAYERS) o[l] = await load(A + '/levels/' + z + '/' + l + '.svg'); return o; };
const shade = (hex, t) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * (1 - t))); return 'rgb(' + c.join(',') + ')'; };
function scene(c, L, z, VW, VH, o) {
  const s = VH / 540, tw = 960 * s, u = o.unit, cam = o.cam || 0;
  const ceilY = o.midY - 1.45 * u, floorY = o.midY + 1.45 * u;
  const tile = (im, par) => { let x = -((cam * par) % tw); for (; x < VW; x += tw) c.drawImage(im, x, 0, tw, VH); };
  tile(L.sky, 0.03); tile(L.far, 0.12); tile(L.mid, 0.6);
  const P = PAL[z];
  // floor spans (screen x), hatch gaps between them
  const bw = 2.4 * u, bh = 4 * u, by = floorY - 0.16 * u;
  for (const [x0, x1] of o.floors) {
    c.save(); c.beginPath(); c.rect(x0, by, x1 - x0, VH); c.clip();
    for (let x = x0 - ((x0 + cam) % bw + bw) % bw; x < x1; x += bw) c.drawImage(L.building, x, by, bw, bh);
    c.fillStyle = P.bottom; c.fillRect(x0, by + bh - 1, x1 - x0, VH);
    c.restore();
  }
  for (let i = 0; i + 1 < o.floors.length; i++) {      // hatch opening: dark hole with slab-coloured sides
    const g0 = o.floors[i][1], g1 = o.floors[i + 1][0], sw = 0.12 * u;
    c.fillStyle = shade(P.bottom, 0.4); c.fillRect(g0, floorY, g1 - g0, VH);
    c.fillStyle = P.slab; c.fillRect(g0, floorY, sw, 0.9 * u); c.fillRect(g1 - sw, floorY, sw, 0.9 * u);
    c.fillStyle = shade(P.slab, 0.3); c.fillRect(g0, floorY + 0.9 * u, sw, VH); c.fillRect(g1 - sw, floorY + 0.9 * u, sw, VH);
  }
  // ceiling spans
  const rw = 2.4 * u, rh = 1.6 * u, ry = ceilY - 1.44 * u, ew = 0.4 * u;
  for (const [x0, x1] of o.ceils) {
    c.save(); c.beginPath(); c.rect(x0, Math.min(0, ry), x1 - x0, ry + rh - Math.min(0, ry)); c.clip();
    if (ry > 0) { c.fillStyle = P.ceil; c.fillRect(x0, 0, x1 - x0, ry + 1); }
    for (let x = x0 - ((x0 + cam) % rw + rw) % rw; x < x1; x += rw) c.drawImage(L.rail, x, ry, rw, rh);
    c.restore();
    c.drawImage(L.rail_end, x1, ry, ew, rh);
    c.save(); c.translate(x0, 0); c.scale(-1, 1); c.drawImage(L.rail_end, 0, ry, ew, rh); c.restore();
  }
  // stand-in Ollie: chestnut body, cream face, teal scarf
  const hx = o.heroX, S = 0.95 * u, hy = floorY - S * 0.42;
  c.lineWidth = 3; c.strokeStyle = '#3b2417';
  c.fillStyle = '#8a5a3c'; c.beginPath(); c.ellipse(hx - S * 0.08, hy + S * 0.08, S * 0.36, S * 0.26, 0, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.arc(hx + S * 0.22, hy - S * 0.12, S * 0.22, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#f3dfc1'; c.beginPath(); c.arc(hx + S * 0.3, hy - S * 0.06, S * 0.12, 0, 7); c.fill();
  c.fillStyle = '#2ec4b6'; c.fillRect(hx + S * 0.02, hy - S * 0.02, S * 0.2, S * 0.1); c.fillRect(hx - S * 0.26, hy - S * 0.05, S * 0.3, S * 0.07);
  c.fillStyle = '#fff2a8'; c.beginPath(); c.arc(hx + S * 0.34, hy - S * 0.3, S * 0.05, 0, 7); c.fill();
  // stand-in leaves
  const leaf = (x, y, col) => { const r = 0.21 * u; c.save(); c.translate(x, y); c.rotate(-0.6); c.fillStyle = col; c.strokeStyle = 'rgba(40,30,10,.55)'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, r, r * 0.55, 0, 0, 7); c.fill(); c.stroke(); c.restore(); };
  (o.leaves || []).forEach(([lx, ly, k]) => leaf(lx * u / 100, ceilY + ly * (floorY - ceilY), ['#5fd35a', '#ffc53d', '#ff6b3d'][k]));
  if (o.dark) {
    const d = document.createElement('canvas'); d.width = VW; d.height = VH; const g = d.getContext('2d');
    g.fillStyle = 'rgba(10,14,38,0.6)'; g.fillRect(0, 0, VW, VH);
    g.globalCompositeOperation = 'destination-out';
    const cut = (x, y, r, a = 1) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    cut(hx, hy, 1.1 * u); cut(hx + 1.8 * u, hy - 0.2 * u, 1.6 * u, 0.7);
    for (const lx of o.lamps || []) cut(lx, ceilY + 0.5 * u, 1.3 * u);
    c.drawImage(d, 0, 0);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const lx of o.lamps || []) { const gr = c.createRadialGradient(lx, ceilY + 0.5 * u, 0, lx, ceilY + 0.5 * u, 0.6 * u); gr.addColorStop(0, 'rgba(255,220,150,.5)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); c.fillStyle = gr; c.fillRect(lx - u, ceilY - 0.5 * u, 2 * u, 2 * u); c.fillStyle = '#ffe9a8'; c.fillRect(lx - 4, ceilY + 0.45 * u, 8, 10); }
    c.restore();
  }
  return { ceilY, floorY };
}
`;
const LEAVES = [[420, 0.12, 0], [470, 0.12, 0], [520, 0.12, 0], [620, 0.5, 1], [680, 0.42, 1], [740, 0.5, 1], [820, 0.86, 2], [880, 0.86, 2]];

const zonePage = z => `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:flex;flex-direction:column;gap:8px;padding:8px"><canvas id="a" width="960" height="540"></canvas><canvas id="b" width="960" height="540"></canvas><canvas id="c" width="960" height="540"></canvas></div>
<script>${common}
(async () => {
  const z = ${JSON.stringify(z)}; const L = await loadZone(z);
  const base = { unit: 100, midY: 0.53 * 540, heroX: 0.26 * 960, leaves: ${JSON.stringify(LEAVES)} };
  scene(document.getElementById('a').getContext('2d'), L, z, 960, 540, Object.assign({}, base, { cam: 0, ceils: [[-60, 330], [470, 1020]], floors: [[-40, 560], [700, 1010]] }));
  const c = document.getElementById('b').getContext('2d');
  const g = scene(c, L, z, 960, 540, Object.assign({}, base, { cam: 1730, ceils: [[-60, 600], [760, 1020]], floors: [[-40, 300], [430, 1010]] }));
  c.strokeStyle = 'rgba(255,0,255,.6)'; c.setLineDash([6, 6]); c.lineWidth = 1; c.strokeRect(0.5, g.ceilY, 959, g.floorY - g.ceilY); c.setLineDash([]);
  scene(document.getElementById('c').getContext('2d'), L, z, 960, 540, Object.assign({}, base, { cam: 900, dark: true, lamps: [120, 560], ceils: [[-60, 330], [470, 1020]], floors: [[-40, 560], [700, 1010]] }));
  document.title = 'done';
})();
</script></body></html>`;

const portraitPage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:grid;grid-template-columns:repeat(4,560px);gap:8px;padding:8px">${ZONES.map(z => `<canvas id="p_${z}" width="560" height="1000"></canvas>`).join('')}${ZONES.map(z => `<canvas id="d_${z}" width="560" height="1000"></canvas>`).join('')}</div>
<script>${common}
(async () => {
  for (const z of ${JSON.stringify(ZONES)}) {
    const L = await loadZone(z); const u = Math.min(560 / 6, 1000 / 8);
    for (const dk of [false, true]) {
      const c = document.getElementById((dk ? 'd_' : 'p_') + z).getContext('2d');
      scene(c, L, z, 560, 1000, { unit: u, midY: 0.47 * 1000, heroX: 0.22 * 560, cam: 600, dark: dk, lamps: [300], ceils: [[-40, 260], [380, 600]], floors: [[-40, 330], [450, 600]],
        leaves: [[230, 0.15, 0], [290, 0.15, 0], [350, 0.5, 1], [430, 0.85, 2]] });
    }
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
    const tick = c => { c.fillStyle = '#f0f'; c.fillRect(479, 0, 2, 8); c.fillRect(479, c.canvas.height - 8, 2, 8); };
    const bg = (c, h) => { c.fillStyle = '#7a7a7a'; c.fillRect(0, 0, 960, h); };
    let c = mk(270); c.drawImage(L.sky, 480, 0, 480, 540, 0, 0, 480, 270); c.drawImage(L.sky, 0, 0, 480, 540, 480, 0, 480, 270); tick(c);
    c = mk(170); bg(c, 170); c.drawImage(L.far, 480, 180, 480, 340, 0, 0, 480, 170); c.drawImage(L.far, 0, 180, 480, 340, 480, 0, 480, 170); tick(c);
    c = mk(270); bg(c, 270); c.drawImage(L.mid, 480, 0, 480, 540, 0, 0, 480, 270); c.drawImage(L.mid, 0, 0, 480, 540, 480, 0, 480, 270); tick(c);
    c = mk(260); bg(c, 260); c.drawImage(L.building, 0, 0, 240, 130, 0, 0, 480, 260); c.drawImage(L.building, 0, 0, 240, 130, 480, 0, 480, 260); tick(c);
    c = mk(320); bg(c, 320); c.drawImage(L.rail, 0, 0, 240, 160, 0, 0, 480, 320); c.drawImage(L.rail, 0, 0, 240, 160, 480, 0, 480, 320); tick(c);
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => { const w = p === 'aurora' ? 256 : 128; return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:${w}px;height:128px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:${w / 4}px;height:32px"></div>`; }).join('') + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#0e1638')}${row('#6e4f5a')}${row('#dfe9e4')}</body></html>`;
};

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, w, h) => {
    fs.writeFileSync(TMP + '/p.html', html); await pg.setViewportSize({ width: w, height: h });
    await pg.goto('file://' + TMP + '/p.html'); if (html.includes("document.title = 'done'")) await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
  };
  for (const z of ZONES) await shot(zonePage(z), `env_${z}.png`, 976, 1656);
  await shot(portraitPage, 'env_portrait.png', 2280, 2024);
  await shot(seamPage, 'env_seams.png', 1950, 1300);
  await shot(partPage(), 'env_particles.png', 2000, 560);
  await br.close(); console.log('rendered into', OUT);
})();
