// Contact sheets for Nubi's Farm Fling characters & items (QA loop).
// Usage: node tools/art-characters/sheet.js [assetDir] [outDir]
// Validates every SVG (DESIGN §3/§4) and writes docs/art/{chars_ingame,chars_4x,chars_frames,chars_scene}.png
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');

const NUBI = ['nubi_sit', 'nubi_pull', 'nubi_fly', 'nubi_puff', 'nubi_rain', 'nubi_plop', 'nubi_bonk'];
const CROPS = ['crop_spring', 'crop_summer', 'crop_autumn', 'crop_winter'];
const VB = {
  firefly: [64, 64], firefly_gold: [64, 64], wagon: [256, 128], sling: [160, 256], bale: [480, 220],
  crow_0: [96, 64], crow_1: [96, 64], heart: [64, 64], heart_empty: [64, 64], icon: [256, 256],
};
NUBI.forEach(n => { VB[n] = [128, 128]; });
CROPS.forEach(n => { VB[n] = [64, 96]; });

// ---- validation ----
const errs = [];
for (const [n, [w, h]] of Object.entries(VB)) {
  const f = `${DIR}/${n}.svg`;
  if (!fs.existsSync(f)) { errs.push(n + ': missing'); continue; }
  const s = fs.readFileSync(f, 'utf8');
  const head = s.match(/<svg[^>]*>/)[0];
  if (!head.includes('xmlns="http://www.w3.org/2000/svg"')) errs.push(n + ': xmlns');
  if (!head.includes(`viewBox="0 0 ${w} ${h}"`) || !head.includes(`width="${w}"`) || !head.includes(`height="${h}"`)) errs.push(n + ': size/viewBox');
  if (/<text|<image|<script|<filter|<foreignObject|xlink:href|href="http|@import|font-family|NaN|undefined/i.test(s)) errs.push(n + ': forbidden content');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) errs.push(n + ': duplicate ids');
  for (const m of s.matchAll(/url\(#([^)]+)\)/g)) if (!ids.includes(m[1])) errs.push(n + ': missing ref ' + m[1]);
  // yellow/amber is reserved for fireflies (hue 38–70°, saturated, bright)
  if (!n.startsWith('firefly') && n !== 'icon') {
    for (const m of s.matchAll(/#([0-9a-f]{6})\b/gi)) {
      const v = parseInt(m[1], 16), r = (v >> 16) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) continue;
      let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue *= 60; if (hue < 0) hue += 360;
      if (hue > 40 && hue < 68 && d / mx > 0.55 && mx > 0.75) errs.push(n + ': firefly-yellow colour #' + m[1]);
    }
  }
}
const old = fs.readdirSync(DIR).filter(f => /^(finn_|leaf|raft|rock|gull_)/.test(f));
if (old.length) errs.push('obsolete files left: ' + old.join(', '));
if (errs.length) { console.error('VALIDATION FAILED\n' + errs.join('\n')); process.exitCode = 1; }
else console.log('validation ok (' + Object.keys(VB).length + ' files)');

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${r(w)}" height="${r(w * VB[n][1] / VB[n][0])}" style="${st}">`;
const r = v => +(+v).toFixed(1);
// in-game: unit = 540/9 = 60 px
const U = 60;
const SZ = { nubi: 1.3 * U, firefly: 0.8 * U, firefly_gold: 0.8 * U, crow: 1.2 * U, sling: 1.6 * U, wagon: 3.3 * U, crop: 0.6 * U, bale: 4.8 * U, heart: 30, heart_empty: 30, icon: 64 };
const sz = n => SZ[n] || SZ[n.split('_')[0]];
const LIGHT = ['light sky', 'linear-gradient(#bfe4ff,#eef8ff)'];
const MID = ['mid-blue sky', 'linear-gradient(#4f8fd0,#7fb6e6)'];
const css = `<style>body{margin:0;background:#777;font:12px sans-serif}.p{display:flex;flex-wrap:wrap;gap:16px;padding:22px 14px 14px;align-items:flex-end;position:relative}
.lab{position:absolute;left:6px;top:4px;color:#000a}.dk .lab{color:#fffd}</style>`;

const all = () => NUBI.map(n => img(n, sz('nubi'))).join('') + img('firefly', sz('firefly')) + img('firefly_gold', sz('firefly')) +
  img('crow_0', sz('crow')) + img('crow_1', sz('crow')) + CROPS.map(n => img(n, sz('crop'))).join('') + img('wagon', sz('wagon')) +
  img('sling', sz('sling')) + img('bale', sz('bale')) + img('heart', 30) + img('heart', 30) + img('heart_empty', 30) + img('icon', 40) + img('icon', 64);
function inGame() {
  return [LIGHT, MID].map(([name, bg], i) => `<div class="p ${i ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — in-game size (unit 60 px)</span>${all()}</div>`).join('');
}
function four() {
  const o = 'outline:1px dashed #0003';
  return [LIGHT, MID].map(([name, bg], i) => `<div class="p ${i ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — 4×</span>` +
    NUBI.map(n => img(n, 4 * sz('nubi'), o)).join('') + img('firefly', 192, o) + img('firefly_gold', 192, o) + img('crow_0', 288, o) + img('crow_1', 288, o) +
    CROPS.map(n => img(n, 4 * sz('crop'), o)).join('') + img('wagon', 4 * sz('wagon'), o) + img('sling', 4 * sz('sling'), o) +
    img('bale', 2 * sz('bale'), o) + img('heart', 120) + img('heart_empty', 120) + img('icon', 256) + `</div>`).join('');
}
// frames 2× with guides: bottom line y 108, body centre (64,64), hit circle r 0.45/1.3·128; then the animation strip at size 1.0 and 1.7
function frames() {
  const s = 256;
  const guide = `<svg style="position:absolute;left:0;top:0" width="${s}" height="${s}" viewBox="0 0 128 128">` +
    `<line x1="0" x2="128" y1="108" y2="108" stroke="red" stroke-width=".6"/><line x1="0" x2="128" y1="126" y2="126" stroke="#0a0" stroke-width=".4" stroke-dasharray="2 2"/>` +
    `<line x1="0" x2="128" y1="70" y2="70" stroke="#a0a" stroke-width=".4" stroke-dasharray="1 2"/><line x1="0" x2="128" y1="112" y2="112" stroke="#a0a" stroke-width=".4" stroke-dasharray="1 2"/>` +
    `<circle cx="64" cy="64" r="1.6" fill="#00f"/><circle cx="64" cy="64" r="${(0.45 / 1.3 * 128).toFixed(1)}" fill="none" stroke="#00f" stroke-width=".4"/></svg>`;
  const strip = k => ['nubi_sit', 'nubi_pull', 'nubi_pull', 'nubi_fly', 'nubi_fly', 'nubi_puff', 'nubi_fly', 'nubi_rain', 'nubi_rain', 'nubi_bonk', 'nubi_plop']
    .map(n => img(n, sz('nubi') * k)).join('');
  return `<div class="p" style="background:#dfefff;gap:0"><span class="lab">frames 2× — bottom y108 (red), rain end y126 (green), plop y70–112 (magenta), centre + hit circle (blue)</span>` +
    NUBI.map(n => `<span style="position:relative;display:inline-block;width:${s}px;height:${s}px;outline:1px solid #0002">${img(n, s)}${guide}</span>`).join('') + `</div>` +
    `<div class="p dk" style="background:${MID[1]};gap:0"><span class="lab">animation strip, size 1.0 (mid-blue sky)</span>${strip(1)}<span style="width:30px"></span>` +
    ['crow_0', 'crow_1', 'crow_0', 'crow_1'].map(n => img(n, sz('crow'))).join('') + `</div>` +
    `<div class="p dk" style="background:${MID[1]};gap:0"><span class="lab">animation strip, size 1.7</span>${strip(1.7)}</div>` +
    `<div class="p" style="background:${LIGHT[1]};gap:0"><span class="lab">animation strip, size 1.0 / 1.7 (light sky)</span>${strip(1)}</div>` +
    `<div class="p" style="background:${LIGHT[1]};gap:0">${strip(1.7)}</div>`;
}
// mini scene: grass, bale + sling with Nubi pulling, wagon with Nubi raining + crops, fireflies + crows in the air
function scene(bg, label) {
  const W = 1000, H = 560, gy = 470; // ground line = world y 0
  const ab = (n, cx, cy, w, ax, ay, extra = '') => { const k = w / VB[n][0]; return `<img src="${uri(n)}" width="${r(w)}" style="position:absolute;left:${r(cx - ax * k)}px;top:${r(cy - ay * k)}px;${extra}">`; };
  const wx = x => x * U, wy = y => gy - y * U;
  let h = `<div style="position:relative;width:${W}px;height:${H}px;background:${bg};overflow:hidden"><span class="lab" style="color:#fff">${label}</span>` +
    `<div style="position:absolute;left:0;top:${gy}px;width:${W}px;height:${H - gy}px;background:#5fae47;border-top:3px solid #3c7f2e"></div>`;
  h += ab('bale', 0, wy(1.2), sz('bale'), 0, 40);
  const slX = wx(2.3), slY = wy(2.9), kS = sz('sling') / 160;
  h += ab('sling', slX, slY, sz('sling'), 80, 50);
  const pX = slX - 0.6 * U, pY = slY + 0.3 * U;
  h += `<svg style="position:absolute;left:0;top:0" width="${W}" height="${H}"><path d="M${slX - 46 * kS},${slY - 4 * kS} L${pX},${pY} L${slX + 46 * kS},${slY - 4 * kS}" fill="none" stroke="#8a4a2a" stroke-width="5" stroke-linecap="round"/></svg>`;
  h += ab('nubi_pull', pX, pY, sz('nubi'), 64, 64);
  h += ab('nubi_fly', wx(5.4), wy(5.4), sz('nubi') * 1.2, 64, 64) + ab('nubi_puff', wx(7.6), wy(6.2), sz('nubi') * 1.5, 64, 64);
  h += ab('firefly', wx(4.6), wy(5), sz('firefly'), 32, 32) + ab('firefly', wx(6.4), wy(6.3), sz('firefly'), 32, 32) + ab('firefly_gold', wx(9), wy(6.4), sz('firefly'), 32, 32) + ab('firefly', wx(10.2), wy(5.6), sz('firefly'), 32, 32);
  h += ab('crow_0', wx(9.6), wy(3.8), sz('crow'), 48, 32) + ab('crow_1', wx(14.6), wy(6.6), sz('crow'), 48, 32);
  const hw = 1.5, wX = wx(12.4), wTop = wy(0.55), wW = (2 * hw + 0.3) * U, k = wW / 256;
  h += ab('wagon', wX, wTop, wW, 128, 40);
  [-1.1, -0.4, 0.35, 1.05].forEach((dx, i) => { h += ab(CROPS[i], wX + dx * U, wTop + 2 * k, sz('crop'), 32, 96); });
  h += ab('nubi_rain', wX, wTop - 1.0 * U - (108 - 64) / 128 * sz('nubi') * 1.4, sz('nubi') * 1.4, 64, 64);
  h += ab('nubi_plop', wx(8.2), gy - (110 - 64) / 128 * sz('nubi'), sz('nubi'), 64, 64) + ab('nubi_bonk', wx(15.2), wy(3.2), sz('nubi'), 64, 64);
  h += ab('nubi_sit', wx(1.0), wy(1.2) - (108 - 64) / 128 * sz('nubi'), sz('nubi'), 64, 64, 'opacity:.9');
  return h + `</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  const sheets = [
    ['chars_ingame.png', inGame()], ['chars_4x.png', four()], ['chars_frames.png', frames()],
    ['chars_scene.png', `<div class="p" style="background:#555;gap:10px">${scene('linear-gradient(#4f8fd0,#8cc0ea)', 'mid-blue sky')}${scene('linear-gradient(#8aa3bf,#c3d0dc)', 'dusty winter blue-grey')}</div>`],
  ];
  for (const [file, html] of sheets) {
    await page.setContent(`<!doctype html><html><head>${css}</head><body>${html}</body></html>`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', path.join(OUT, file));
  }
  await browser.close();
})();
