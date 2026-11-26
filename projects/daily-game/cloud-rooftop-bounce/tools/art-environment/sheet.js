#!/usr/bin/env node
// Visual QA sheets for the environment art (Playwright + Chromium, already installed — never run `playwright install`).
// Serves game/assets/default over a tiny local HTTP server (so canvases are not tainted) and writes to docs/art/:
//   seams.png        every far/near layer tiled twice side by side over its sky, plus a 4x zoom on the seam (magenta tick)
//   scene_<z>.png    960x540 composed scene: sky cover-fit, far (bottom = groundPx - 40), near (art y 150 at groundPx = 516),
//                    layers offset so a seam is visible, a 10x6 brick wall in the band y 4.3..8.0 u, sample particles,
//                    a white 180x75 cloud placeholder (Wisp) and a white 36 px circle (the pearl) for contrast
//   scenes.png       the four scenes in a 2x2 grid with guides (play area y 1 u and 8 u, groundPx)
//   bricks.png       all blocks at 1x and 2x on each zone sky, in colour and greyscale
//   particles.png    all particles at 1x and 4x on light and dark
// Also prints a numeric seam check (max channel delta across the seam vs. a normal neighbour column pair).
// Usage: node tools/art-environment/sheet.js
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const ZONES = ['cloud', 'spires', 'gardens', 'lanes'];
const PARTS = { cloud: ['twinkle', 'mist'], spires: ['twinkle', 'shooting'], gardens: ['firefly', 'petal'], lanes: ['ember', 'firefly'] };

const lib = `
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = '/a/' + s; });
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const U = 60, GROUND = 540 - 0.4 * U, sx = x => (960 - 16 * U) / 2 + x * U, sy = y => GROUND - y * U;
async function scene(c, z, opt = {}) {
  const g = c.getContext('2d');
  const sky = await load('levels/' + z + '/sky.svg'), far = await load('levels/' + z + '/far.svg'), near = await load('levels/' + z + '/near.svg');
  g.drawImage(sky, 0, 0, 960, 540);
  const tile = (im, h, top, off) => { let x = off % 960; if (x > 0) x -= 960; for (; x < 960; x += 960) g.drawImage(im, x, top, 960, h); };
  tile(far, 300, GROUND - 40 - 300, 233);
  tile(near, 200, GROUND - 150, -310);
  // brick wall: 10 cols x 6 rows, 1.4 x 0.5 u, centres x = 1.0 + 1.55 c, rows in y 4.3..8.0
  const B = {}; for (const k of ['', '_tough', '_crack']) B[k] = await load('bricks/' + z + k + '.svg');
  B.g = await load('bricks/gem.svg'); B.m = await load('bricks/magnet.svg');
  const layout = ['bbtbbbbtbb', 'bgbbmbbbgb', 'tbbcbbcbbt', 'bb.bbbb.bb', '.btbgbbtb.', 'b..bbbb..b'];
  for (let r = 0; r < 6; r++) for (let i = 0; i < 10; i++) {
    const ch = layout[r][i]; if (ch === '.') continue;
    const im = ch === 'b' ? B[''] : ch === 't' ? B._tough : ch === 'c' ? B._crack : ch === 'g' ? B.g : B.m;
    const cx = sx(1.0 + 1.55 * i), cy = sy(7.7 - r * 0.6);
    g.drawImage(im, cx - 0.7 * U, cy - 0.25 * U, 1.4 * U, 0.5 * U);
  }
  // particles
  const ps = []; for (const p of ${JSON.stringify(PARTS)}[z]) ps.push(await load('particles/' + p + '.svg'));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 22; i++) { const im = ps[i % ps.length], sz = 12 + rnd() * 14; g.globalAlpha = .5 + rnd() * .5; g.drawImage(im, rnd() * 940, rnd() * 470, sz, sz); }
  g.globalAlpha = 1;
  const chip = await load('particles/chip_' + z + '.svg'); for (let i = 0; i < 5; i++) g.drawImage(chip, sx(11) + i * 16, sy(3.6) + (i % 2) * 12, 18, 18);
  // white stand-ins for Wisp (180x75, top = bounce line y 1.35) and the pearl (36 px)
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(480 - 90, sy(1.35), 180, 75, 36); g.fill();
  g.beginPath(); g.arc(sx(9.6), sy(3.1), 18, 0, 7); g.fill();
  if (opt.guides) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.setLineDash([5, 5]); for (const y of [sy(1), sy(8), GROUND]) { g.beginPath(); g.moveTo(0, y); g.lineTo(960, y); g.stroke(); } g.setLineDash([]); }
  // HUD pill mock in the zone palette
  const p = opt.pal; g.fillStyle = p.bar; g.globalAlpha = .92; g.beginPath(); g.roundRect(12, 10, 180, 32, 16); g.fill(); g.globalAlpha = 1;
  g.fillStyle = p.ink; g.font = '700 17px sans-serif'; g.fillText(z + '  1234', 28, 32); g.fillStyle = p.glow; g.beginPath(); g.arc(176, 26, 7, 0, 7); g.fill();
}
`;

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') { rsp.writeHead(200, { 'content-type': 'text/html' }); return rsp.end(`<!doctype html><html><body style="margin:0"><script>${lib}</script></body></html>`); }
      if (u.startsWith('/a/')) {
        const p = path.join(A, u.slice(3));
        if (p.startsWith(A) && fs.existsSync(p)) { rsp.writeHead(200, { 'content-type': p.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' }); return rsp.end(fs.readFileSync(p)); }
      }
      rsp.writeHead(404); rsp.end();
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function main() {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  const pal = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));
  const save = async (name, js) => {
    const url = await page.evaluate(js);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, path.join(OUT, name)));
  };
  for (const z of ZONES) await save(`scene_${z}.png`, `(async () => { const c = canvas(960, 540); await scene(c, '${z}', { pal: ${JSON.stringify(pal[z])} }); return c.toDataURL(); })()`);
  await save('scenes.png', `(async () => { const c = canvas(1930, 1090); const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, 1930, 1090);
    const Z = ${JSON.stringify(ZONES)}, P = ${JSON.stringify(pal)};
    for (let i = 0; i < 4; i++) { const t = canvas(960, 540); await scene(t, Z[i], { pal: P[Z[i]], guides: true }); g.drawImage(t, (i % 2) * 970, Math.floor(i / 2) * 550); }
    return c.toDataURL(); })()`);
  // seams: per zone and layer, the layer tiled twice (half scale) + a 4x zoom (80 px wide) around the seam
  await save('seams.png', `(async () => { const Z = ${JSON.stringify(ZONES)}; const c = canvas(960 + 20 + 320, 4 * (360 + 280 + 12) + 20); const g = c.getContext('2d');
    g.fillStyle = '#333'; g.fillRect(0, 0, c.width, c.height); let y = 10;
    for (const z of Z) for (const L of ['far', 'near']) {
      const H = L === 'far' ? 300 : 200, sky = await load('levels/' + z + '/sky.svg'), im = await load('levels/' + z + '/' + L + '.svg');
      const t = canvas(1920, H), tg = t.getContext('2d'); for (let k = 0; k < 2; k++) { tg.drawImage(sky, 0, 540 - H, 960, H, k * 960, 0, 960, H); tg.drawImage(im, k * 960, 0, 960, H); }
      const hh = 150; g.drawImage(t, 0, 0, 1920, H, 0, y, 960, H / 2);
      g.imageSmoothingEnabled = false; const y0 = L === 'far' ? 120 : 60, zh = L === 'far' ? 180 : 140;
      g.drawImage(t, 960 - 40, y0, 80, zh * 0.5, 980, y, 320, zh * 2); g.imageSmoothingEnabled = true;
      g.fillStyle = '#f0f'; g.fillRect(1139, y, 2, 10); g.fillRect(479, y, 2, 8);
      y += Math.max(H / 2, zh * 2) + 6; }
    return c.toDataURL(); })()`);
  const rep = await page.evaluate(`(async () => { const out = {};
    for (const z of ${JSON.stringify(ZONES)}) for (const L of ['far', 'near']) { const H = L === 'far' ? 300 : 200, im = await load('levels/' + z + '/' + L + '.svg');
      const t = canvas(1920, H), g = t.getContext('2d'); g.drawImage(im, 0, 0, 960, H); g.drawImage(im, 960, 0, 960, H);
      const col = x => g.getImageData(x, 0, 1, H).data; const d = (a, b) => { let mx = 0; for (let i = 0; i < a.length; i++) mx = Math.max(mx, Math.abs(a[i] - b[i])); return mx; };
      out[z + '/' + L] = { seam: d(col(959), col(960)), left: d(col(957), col(958)), right: d(col(961), col(962)) }; }
    return out; })()`);
  console.log('seam check (max channel delta between adjacent columns):');
  for (const [k, v] of Object.entries(rep)) console.log('  ' + k.padEnd(14), 'seam', String(v.seam).padEnd(5), 'neighbours', v.left, v.right);
  await save('bricks.png', `(async () => { const Z = ${JSON.stringify(ZONES)}; const c = canvas(1420, 4 * 130 + 10); const g = c.getContext('2d');
    for (let half = 0; half < 2; half++) for (let i = 0; i < 4; i++) {
      const sky = await load('levels/' + Z[i] + '/sky.svg'); g.filter = 'none'; g.drawImage(sky, 0, 40, 960, 200, half * 710, i * 130, 710, 130);
      g.filter = half ? 'grayscale(1)' : 'none';
      const names = [Z[i], Z[i] + '_tough', Z[i] + '_crack', 'gem', 'magnet'];
      for (let j = 0; j < 5; j++) { const im = await load('bricks/' + names[j] + '.svg'); const x = half * 710 + 10 + j * 140;
        g.drawImage(im, x, i * 130 + 10, 84, 30); g.drawImage(im, x, i * 130 + 50, 132, 47); } }
    g.filter = 'none'; return c.toDataURL(); })()`);
  await save('particles.png', `(async () => { const N = ['twinkle','mist','shooting','firefly','petal','ember','glow','chip_cloud','chip_spires','chip_gardens','chip_lanes'];
    const c = canvas(N.length * 140, 300); const g = c.getContext('2d'); g.fillStyle = '#e8e4ee'; g.fillRect(0, 0, c.width, 150); g.fillStyle = '#1d2550'; g.fillRect(0, 150, c.width, 150);
    for (let i = 0; i < N.length; i++) { const im = await load('particles/' + N[i] + '.svg'); if (!im) continue; for (const y of [0, 150]) { g.drawImage(im, i * 140 + 4, y + 10, 128, 128); g.drawImage(im, i * 140 + 104, y + 110, 32, 32); } }
    return c.toDataURL(); })()`);
  await browser.close();
  srv.close();
}
main().catch(e => { console.error(e); process.exit(1); });
