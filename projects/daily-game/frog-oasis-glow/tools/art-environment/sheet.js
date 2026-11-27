// Visual QA for the environment art (DESIGN.md §2, §4). Renders with Playwright into docs/art/:
//   env_<chapter>.png  composed 960×540 scene: sky (cover), far (tiled, offset ~300 px), floor centred
//                      (stage x480 = file x960), holes at the §2 layout (burrow_back, a grey friend
//                      silhouette 140×150 clipped to y < by+4s, burrow_front), a lily pad placeholder
//                      ellipse at (480,136), near frame on top, plus faint guides (HUD y70, clear box).
//   env_seams.png      every far/floor layer: the end of one copy next to the start of the next (the seam
//                      is at the centre of each cell, marked by small red ticks at the top and bottom).
//   env_parts.png      burrows at 2× (empty and with friend) + all particles at 3× on light and dark.
// Usage: node tools/art-environment/sheet.js   (after node tools/art-environment/gen.js)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = path.resolve(__dirname, '../../game/assets/default');
const OUT = path.resolve(__dirname, '../../docs/art');
fs.mkdirSync(OUT, { recursive: true });
const CHS = ['spring', 'palms', 'dunes', 'night'];
const LAYOUT = {
  spring: [[330, 0.86, [280, 480, 680]], [460, 1, [230, 480, 730]]],
  palms: [[315, 0.84, [225, 395, 565, 735]], [460, 1, [165, 375, 585, 795]]],
  dunes: [[280, 0.74, [330, 480, 630]], [375, 0.87, [250, 480, 710]], [480, 1, [190, 480, 770]]],
};
LAYOUT.night = LAYOUT.dunes;
const PARTS = ['dragonfly', 'butterfly_0', 'butterfly_1', 'petal', 'tumbleweed', 'glow', 'sparkle', 'star_tw', 'sandwisp'];

const lib = `
const A = ${JSON.stringify('file://' + A)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const loadC = async b => { const o = {}; for (const l of ['sky','far','floor','near','burrow_back','burrow_front']) o[l] = await load(A + '/levels/' + b + '/' + l + '.svg'); return o; };
function friend(c, bx, by, s, h) {
  // grey placeholder friend in the 140x150 box, bottom-centre at (bx, by+25s+(1-h)140s), clipped to y < by+4s
  const bot = by + 25*s + (1-h)*140*s, left = bx - 70*s, top = bot - 150*s;
  c.save(); c.beginPath(); c.rect(bx - 100*s, -10, 200*s, by + 4*s + 10); c.clip();
  c.fillStyle = '#9a9aa2'; c.strokeStyle = '#5e5e66'; c.lineWidth = 3*s;
  c.beginPath(); c.ellipse(left + 70*s, top + 102*s, 52*s, 50*s, 0, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.arc(left + 70*s, top + 50*s, 40*s, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(left + 40*s, top + 18*s, 11*s, 20*s, -0.3, 0, 7); c.ellipse(left + 100*s, top + 18*s, 11*s, 20*s, 0.3, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(left + 56*s, top + 46*s, 8*s, 0, 7); c.arc(left + 84*s, top + 46*s, 8*s, 0, 7); c.fill();
  c.fillStyle = '#ffe066'; c.beginPath(); c.arc(left + 70*s, top + 94*s, 20*s, 0, 7); c.fill();
  c.restore();
}
function scene(c, L, layout, farOff, guides) {
  c.drawImage(L.sky, 0, 0, 960, 540);
  for (let x = -(((farOff % 1920) + 1920) % 1920); x < 960; x += 1920) c.drawImage(L.far, x, 0, 1920, 540);
  c.drawImage(L.floor, 480 - 960, 0, 1920, 540);
  // lily pad placeholder (render draws lilypad.svg 200x70 at (480,136))
  c.fillStyle = 'rgba(110,170,110,.85)'; c.strokeStyle = '#4c7a4c'; c.lineWidth = 3;
  c.beginPath(); c.ellipse(480, 136, 90, 22, 0, 0, 7); c.fill(); c.stroke();
  const hs = [1, 0.6, 1, 0.3, 1, 0.85, 0, 1, 0.5];
  let k = 0;
  for (const [by, s, xs] of layout) for (const bx of xs) {
    c.drawImage(L.burrow_back, bx - 85*s, by - 45*s, 170*s, 90*s);
    if (hs[k % hs.length] > 0) friend(c, bx, by, s, hs[k % hs.length]);
    c.drawImage(L.burrow_front, bx - 85*s, by - 45*s, 170*s, 90*s);
    k++;
  }
  c.drawImage(L.near, 0, 0, 960, 540);
  if (guides) {
    c.save(); c.setLineDash([6, 6]); c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,0,255,.55)'; c.beginPath(); c.moveTo(0, 70.5); c.lineTo(960, 70.5); c.stroke();
    c.strokeStyle = 'rgba(255,140,0,.55)'; c.strokeRect(120.5, 70.5, 720, 469);
    c.strokeStyle = 'rgba(0,200,255,.55)'; c.beginPath(); c.moveTo(0, 260.5); c.lineTo(960, 260.5); c.stroke();
    c.restore();
  }
}
`;

async function shot(page, body, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  const f = path.join(OUT, '_page.html');
  fs.writeFileSync(f, `<!doctype html><html><body style="margin:0;background:#222"><canvas id="c" width="${w}" height="${h}"></canvas><script>${lib}
    (async () => { const c = document.getElementById('c').getContext('2d'); ${body}; document.title = 'done'; })();</script></body></html>`);
  await page.goto('file://' + f);
  await page.waitForFunction(() => document.title === 'done', null, { timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } });
  console.log('wrote', file);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  for (const ch of CHS)
    await shot(page, `const L = await loadC(${JSON.stringify(ch)}); scene(c, L, ${JSON.stringify(LAYOUT[ch])}, 300, true);`, `env_${ch}.png`, 960, 540);
  // seams: each cell = last 240 px of the layer + first 240 px (the wrap point), 480×(y range) at 1×
  await shot(page, `
    const CH = ${JSON.stringify(CHS)};
    c.fillStyle = '#556'; c.fillRect(0, 0, 1920, 720);
    for (let i = 0; i < 4; i++) { const L = await loadC(CH[i]); const x0 = i * 480;
      c.drawImage(L.sky, 0, 0, 960, 540, x0, 0, 480, 270);  // backdrop behind far
      c.drawImage(L.far, 1680, 60, 240, 270, x0, 0, 240, 270); c.drawImage(L.far, 0, 60, 240, 270, x0 + 240, 0, 240, 270);
      c.drawImage(L.floor, 1680, 90, 240, 450, x0, 270, 240, 450); c.drawImage(L.floor, 0, 90, 240, 450, x0 + 240, 270, 240, 450);
      c.fillStyle = 'red'; for (const y of [0, 262, 270, 712]) c.fillRect(x0 + 239, y, 2, 8);
      c.fillStyle = '#fff'; c.fillRect(x0, 268, 480, 2); }`, 'env_seams.png', 1920, 720);
  // burrows + particles
  await shot(page, `
    const CH = ${JSON.stringify(CHS)};
    for (let r = 0; r < 4; r++) { const L = await loadC(CH[r]);
      c.drawImage(L.floor, 860, 250, 600, 150, 0, r * 200, 1200, 200);
      [0, 1].forEach(i => { const bx = 200 + i * 400, by = r * 200 + 120, s = 1.6;
        c.drawImage(L.burrow_back, bx - 85*s, by - 45*s, 170*s, 90*s); if (i) friend(c, bx, by, s, 0.8); c.drawImage(L.burrow_front, bx - 85*s, by - 45*s, 170*s, 90*s); }); }
    c.fillStyle = '#e8d4a8'; c.fillRect(1200, 0, 600, 400); c.fillStyle = '#2f3570'; c.fillRect(1200, 400, 600, 400);
    const P = ${JSON.stringify(PARTS)}; let x = 1210, y = 20;
    for (const p of P) { const im = await load(A + '/particles/' + p + '.svg'); if (!im) continue;
      const k = p === 'sandwisp' ? 1 : 2.5, w = im.naturalWidth * k, h = im.naturalHeight * k;
      if (x + w > 1795) { x = 1210; y += 130; }
      c.drawImage(im, x, y, w, h); c.drawImage(im, x, y + 400, w, h); x += w + 12; }`, 'env_parts.png', 1800, 800);
  fs.unlinkSync(path.join(OUT, '_page.html'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
