// Visual QA for the environment art (DESIGN.md §2, §4). Renders into tools/art-environment/out/:
//   scene_<biome>.png   composed 960×540 scene: sky (cover), far (tiled, offset), floor centred (stage x480 = file x960),
//                       burrows at the §2 layout with a placeholder critter + star between back and front, near on top,
//                       and the HUD band check (lines at y 70 / 120 + stand-in score pill and buttons).
//   seam_<biome>.png    far and floor each tiled twice with the seam marked, plus a 2× crop around the seam.
//   burrows.png         all burrows at 2× with critters at several pop heights.
//   particles.png       all particles at 3× on light and dark.
// Usage: node tools/art-environment/sheet.js
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = path.resolve(__dirname, '../../game/assets/default');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const BIOMES = ['riverbank', 'bamboo', 'canopy', 'ruins'];
const LAYOUT = {
  riverbank: [[330, 0.86, [280, 480, 680]], [460, 1, [230, 480, 730]]],
  bamboo: [[315, 0.84, [225, 395, 565, 735]], [460, 1, [165, 375, 585, 795]]],
  canopy: [[280, 0.74, [330, 480, 630]], [375, 0.87, [250, 480, 710]], [480, 1, [190, 480, 770]]],
};
LAYOUT.ruins = LAYOUT.canopy;
const PARTS = ['dragonfly', 'leaf', 'butterfly_0', 'butterfly_1', 'firefly', 'mist', 'sparkle', 'drop'];

const lib = `
const A = ${JSON.stringify('file://' + A)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const loadB = async b => { const o = {}; for (const l of ['sky','far','floor','near','burrow_back','burrow_front']) o[l] = await load(A + '/levels/' + b + '/' + l + '.svg'); return o; };
const KIND = [['#8b5a2b','#5e3a18'],['#2fb3a3','#1d7a70'],['#2a2a2a','#000000']];
const STAR = ['#ff5d73','#ffc93c','#3fa7ff','#a46bff'];
function critter(c, bx, by, s, h, k) {
  // placeholder critter in the 140x150 box, bottom-centre at (bx, by+25s+(1-h)140s), clipped to y < by+4s
  const bot = by + 25*s + (1-h)*140*s, left = bx - 70*s, top = bot - 150*s;
  c.save(); c.beginPath(); c.rect(bx - 100*s, 0, 200*s, by + 4*s); c.clip();
  const [fill, line] = KIND[k % 3];
  c.fillStyle = fill; c.strokeStyle = line; c.lineWidth = 3*s;
  c.beginPath(); c.ellipse(left + 70*s, top + 100*s, 50*s, 52*s, 0, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.arc(left + 70*s, top + 48*s, 38*s, 0, 7); c.fill(); c.stroke();
  if (k % 3 === 2) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(left + 70*s, top + 108*s, 32*s, 36*s, 0, 0, 7); c.fill(); c.fillStyle='#ff9b2f'; c.beginPath(); c.ellipse(left+100*s, top+52*s, 26*s, 12*s, 0, 0, 7); c.fill(); }
  c.fillStyle = '#fff'; c.beginPath(); c.arc(left + 56*s, top + 44*s, 9*s, 0, 7); c.arc(left + 84*s, top + 44*s, 9*s, 0, 7); c.fill();
  c.fillStyle = '#222'; c.beginPath(); c.arc(left + 57*s, top + 45*s, 4.5*s, 0, 7); c.arc(left + 85*s, top + 45*s, 4.5*s, 0, 7); c.fill();
  // star (simple 5-point) at (70,96) 58s
  const sx = left + 70*s, sy = top + 96*s, R = 29*s;
  c.fillStyle = STAR[k % 4]; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2*s; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI/2 + i*Math.PI/5, r = i % 2 ? R*0.5 : R; c.lineTo(sx + Math.cos(a)*r, sy + Math.sin(a)*r); }
  c.closePath(); c.fill(); c.stroke();
  c.restore();
}
function drawScene(c, L, layout, farOff, opts = {}) {
  c.drawImage(L.sky, 0, 0, 960, 540);
  for (let x = -((farOff % 1920) + 1920) % 1920; x < 960; x += 1920) c.drawImage(L.far, x, 0, 1920, 540);
  c.drawImage(L.floor, 480 - 960, 0, 1920, 540);
  let k = 0;
  const hs = opts.hs || [1, 0.7, 1, 0.4, 1, 0.85, 1, 0.55, 1];
  for (const [by, s, xs] of layout) for (const bx of xs) {
    c.drawImage(L.burrow_back, bx - 85*s, by - 45*s, 170*s, 90*s);
    if (opts.critters !== false) critter(c, bx, by, s, hs[k % hs.length], k);
    c.drawImage(L.burrow_front, bx - 85*s, by - 45*s, 170*s, 90*s);
    if (opts.zones) { c.save(); c.strokeStyle = 'rgba(255,0,255,.6)'; c.setLineDash([4,4]); c.beginPath(); c.arc(bx, by - 45*s, 88*s, 0, 7); c.stroke(); c.restore(); }
    k++;
  }
  c.drawImage(L.near, 0, 0, 960, 540);
  if (opts.hud !== false) {
    c.save();
    c.fillStyle = 'rgba(255,255,255,.92)'; c.strokeStyle = '#2d4a2d'; c.lineWidth = 3;
    const pill = (x, y, w, h) => { c.beginPath(); c.roundRect(x, y, w, h, h/2); c.fill(); c.stroke(); };
    pill(16, 14, 170, 44); pill(560, 14, 200, 44); pill(830, 14, 52, 44); pill(892, 14, 52, 44);
    c.fillStyle = '#2d4a2d'; c.fillRect(36, 30, 80, 12); c.fillRect(580, 30, 160, 12);
    c.setLineDash([8, 6]); c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(255,0,255,.8)'; c.beginPath(); c.moveTo(0, 70.5); c.lineTo(960, 70.5); c.stroke();
    c.strokeStyle = 'rgba(0,200,255,.8)'; c.beginPath(); c.moveTo(0, 120.5); c.lineTo(960, 120.5); c.stroke();
    c.strokeStyle = 'rgba(255,140,0,.8)'; c.strokeRect(120.5, 70.5, 720, 469);
    c.restore();
  }
}
`;

async function shot(page, html, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  const f = path.join(OUT, '_page.html');
  fs.writeFileSync(f, `<!doctype html><html><body style="margin:0;background:#222">${html}</body></html>`);
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
  for (const b of BIOMES) {
    await shot(page, `<canvas id="c" width="960" height="540"></canvas><script>${lib}
      (async () => { const L = await loadB(${JSON.stringify(b)}); drawScene(document.getElementById('c').getContext('2d'), L, ${JSON.stringify(LAYOUT[b])}, 700); document.title='done'; })();</script>`,
      `scene_${b}.png`, 960, 540);
    await shot(page, `<canvas id="c" width="960" height="540"></canvas><script>${lib}
      (async () => { const L = await loadB(${JSON.stringify(b)}); drawScene(document.getElementById('c').getContext('2d'), L, ${JSON.stringify(LAYOUT[b])}, 1500, { critters: false, hud: false, zones: true }); document.title='done'; })();</script>`,
      `scene_${b}_empty.png`, 960, 540);
    // seams: far and floor tiled twice (scaled 0.5), plus 2x crop around the seam
    await shot(page, `<canvas id="c" width="1920" height="1080"></canvas><script>${lib}
      (async () => { const L = await loadB(${JSON.stringify(b)}); const c = document.getElementById('c').getContext('2d');
        c.fillStyle = '#556'; c.fillRect(0,0,1920,1080);
        c.drawImage(L.far, 0, 0, 960, 270); c.drawImage(L.far, 960, 0, 960, 270);
        c.drawImage(L.floor, 0, 270, 960, 270); c.drawImage(L.floor, 960, 270, 960, 270);
        // 2x crops around the seam (file x 1920-240 .. 1920+240)
        const crop = (im, y0, sy, sh) => { c.drawImage(im, 1920-240, sy, 240, sh, 0, y0, 480, sh*2); c.drawImage(im, 0, sy, 240, sh, 480, y0, 480, sh*2); };
        crop(L.far, 540, 60, 130); crop(L.floor, 810, 220, 135);
        c.drawImage(L.far, 1920-240, 190, 240, 135, 960, 540, 480, 270); c.drawImage(L.far, 0, 190, 240, 135, 1440, 540, 480, 270);
        c.drawImage(L.floor, 1920-240, 355, 240, 135, 960, 810, 480, 270); c.drawImage(L.floor, 0, 355, 240, 135, 1440, 810, 480, 270);
        c.strokeStyle = 'rgba(255,0,0,.7)'; c.setLineDash([6,8]); c.lineWidth = 1;
        for (const x of [960, 480, 1440]) { c.beginPath(); c.moveTo(x+.5, x===960?0:540); c.lineTo(x+.5, x===960?540:1080); c.stroke(); }
        document.title='done'; })();</script>`,
      `seam_${b}.png`, 1920, 1080);
  }
  // burrows sheet
  await shot(page, `<canvas id="c" width="1440" height="880"></canvas><script>${lib}
    (async () => { const c = document.getElementById('c').getContext('2d'); const B = ${JSON.stringify(BIOMES)};
      for (let r = 0; r < 4; r++) { const L = await loadB(B[r]); c.drawImage(L.floor, 800, 300, 1440/2, 220, 0, r*220, 1440, 220);
        [0, 0.3, 0.7, 1].forEach((h, i) => { const bx = 180 + i*340, by = r*220 + 160, s = 1.6;
          c.drawImage(L.burrow_back, bx-85*s, by-45*s, 170*s, 90*s); if (i) critter(c, bx, by, s, h, i+r); c.drawImage(L.burrow_front, bx-85*s, by-45*s, 170*s, 90*s); }); }
      document.title='done'; })();</script>`, 'burrows.png', 1440, 880);
  // particles
  await shot(page, `<canvas id="c" width="1200" height="400"></canvas><script>${lib}
    (async () => { const c = document.getElementById('c').getContext('2d'); c.fillStyle='#cfe3c0'; c.fillRect(0,0,1200,200); c.fillStyle='#3a3350'; c.fillRect(0,200,1200,200);
      const P = ${JSON.stringify(PARTS)}; let x = 10;
      for (const p of P) { const im = await load(A + '/particles/' + p + '.svg'); const k = p === 'mist' ? 0.8 : 3; const w = im.naturalWidth*k, h = im.naturalHeight*k;
        c.drawImage(im, x, 100 - h/2, w, h); c.drawImage(im, x, 300 - h/2, w, h); x += w + 14; }
      document.title='done'; })();</script>`, 'particles.png', 1200, 400);
  fs.unlinkSync(path.join(OUT, '_page.html'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
