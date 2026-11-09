// Contact sheets for Finn's Island Fling characters & items (QA loop).
// Usage: node tools/art-characters/sheet.js [assetDir] [outDir]
// Validates every SVG (DESIGN §3/§4) and writes tests/out/art-characters/{ingame,4x,frames}.png
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../tests/out/art-characters');

const FINN = ['finn_sit', 'finn_pull', 'finn_fly', 'finn_flutter', 'finn_land', 'finn_splash', 'finn_bonk'];
const VB = {
  leaf: [64, 64], leaf_moon: [64, 64], raft: [256, 112], sling: [160, 256], gull_0: [96, 64], gull_1: [96, 64],
  heart: [64, 64], heart_empty: [64, 64], icon: [256, 256],
};
FINN.forEach(n => { VB[n] = [128, 128]; });

// ---- validation ----
const errs = [];
for (const [n, [w, h]] of Object.entries(VB)) {
  const f = `${DIR}/${n}.svg`;
  if (!fs.existsSync(f)) { errs.push(n + ': missing'); continue; }
  const s = fs.readFileSync(f, 'utf8');
  const head = s.match(/<svg[^>]*>/)[0];
  if (!head.includes('xmlns="http://www.w3.org/2000/svg"')) errs.push(n + ': xmlns');
  if (!head.includes(`viewBox="0 0 ${w} ${h}"`) || !head.includes(`width="${w}"`) || !head.includes(`height="${h}"`)) errs.push(n + ': size/viewBox');
  if (/<text|<image|<script|<filter|xlink:href|href="http|@import|font-family|NaN|undefined/i.test(s)) errs.push(n + ': forbidden content');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) errs.push(n + ': duplicate ids');
  for (const m of s.matchAll(/url\(#([^)]+)\)/g)) if (!ids.includes(m[1])) errs.push(n + ': missing ref ' + m[1]);
}
if (errs.length) { console.error('VALIDATION FAILED\n' + errs.join('\n')); process.exitCode = 1; }
else console.log('validation ok (' + Object.keys(VB).length + ' files)');

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${w}" height="${(w * VB[n][1] / VB[n][0]).toFixed(1)}" style="${st}">`;
// in-game: unit = 540/9 = 60 px → Finn 1.3 u = 78, leaf 0.8 u = 48, gull 1.2 u = 72, sling 1.6 u = 96, raft ≈ (2·1.3+0.3) u = 174
const U = 60;
const SZ = { finn: 1.3 * U, leaf: 0.8 * U, leaf_moon: 0.8 * U, gull: 1.2 * U, sling: 1.6 * U, raft: 2.9 * U, heart: 30, heart_empty: 30, icon: 64 };
const sz = n => SZ[n] || SZ[n.split('_')[0]];
const BGS = [['day sky', 'linear-gradient(#bfe9ff,#eaf8ff)'], ['teal sea', '#1aa0a8'], ['night', 'linear-gradient(#141a3a,#25305e)']];
const css = `<style>body{margin:0;background:#777;font:12px sans-serif}.p{display:flex;flex-wrap:wrap;gap:16px;padding:22px 14px 14px;align-items:flex-end;position:relative}
.lab{position:absolute;left:6px;top:4px;color:#0008}.dk .lab{color:#fffa}</style>`;

// mini scene: sea strip, rock, sling with Finn sitting in it, raft with Finn landed, leaves + gulls in the air
function scene(bg, dark) {
  const W = 960, H = 420, sea = 340;
  const ab = (n, cx, cy, w, ax, ay, extra = '') => { // place image so that viewBox point (ax,ay) lands at (cx,cy)
    const k = w / VB[n][0];
    return `<img src="${uri(n)}" width="${w}" style="position:absolute;left:${(cx - ax * k).toFixed(1)}px;top:${(cy - ay * k).toFixed(1)}px;${extra}">`;
  };
  const slX = 2.3 * U, slY = sea - 2.9 * U, kS = sz('sling') / 160;
  let h = `<div style="position:relative;width:${W}px;height:${H}px;background:${bg};overflow:hidden">` +
    `<div style="position:absolute;left:0;top:${sea}px;width:${W}px;height:${H - sea}px;background:#1aa0a8"></div>` +
    `<div style="position:absolute;left:0;top:${sea - 1.2 * U}px;width:${4.8 * U}px;height:${H}px;background:#e9d29a;border-radius:0 60px 0 0"></div>`;
  h += ab('sling', slX, slY, sz('sling'), 80, 50);
  h += `<svg style="position:absolute;left:0;top:0" width="${W}" height="${H}"><path d="M${slX - 46 * kS},${slY - 4 * kS} L${slX - 0.4 * U},${slY + 0.3 * U} L${slX + 46 * kS},${slY - 4 * kS}" fill="none" stroke="#7a3d1d" stroke-width="5" stroke-linecap="round"/></svg>`;
  h += ab('finn_pull', slX - 0.4 * U, slY + 0.3 * U, sz('finn'), 64, 64);
  // flight
  h += ab('finn_fly', 330, 120, sz('finn'), 64, 64);
  h += ab('finn_flutter', 450, 90, sz('finn'), 64, 64);
  h += ab('leaf', 260, 150, sz('leaf'), 32, 32) + ab('leaf', 395, 100, sz('leaf'), 32, 32) + ab('leaf_moon', 520, 110, sz('leaf'), 32, 32);
  h += ab('leaf', 610, 300, sz('leaf'), 32, 32, 'transform:rotate(40deg)') + ab('leaf_moon', 670, 312, sz('leaf'), 32, 32);
  h += ab('gull_0', 620, 160, sz('gull'), 48, 32) + ab('gull_1', 720, 200, sz('gull'), 48, 32);
  // raft: deck top y34 at sea − 0.35 u
  const rX = 12.5 * U, rTop = sea - 0.35 * U;
  h += ab('raft', rX, rTop, sz('raft'), 128, 34);
  h += ab('finn_land', rX + 10, rTop - (112 - 64) * sz('finn') / 128, sz('finn'), 64, 64);
  h += ab('finn_splash', 880, sea, sz('finn'), 64, 84);
  h += ab('finn_bonk', 790, 110, sz('finn'), 64, 64);
  if (dark) h += `<div style="position:absolute;inset:0;background:radial-gradient(circle at 330px 120px,#0000 0,#0000 120px,#000a 170px)"></div>`;
  return h + `<div style="position:absolute;left:0;top:${sea}px;width:${W}px;height:${H - sea}px;background:#1aa0a855"></div></div>`;
}

function inGame() {
  return BGS.map(([name, bg], i) => `<div class="p ${i ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — in-game size (unit 60 px)</span>` +
    FINN.map(n => img(n, sz('finn'))).join('') + img('leaf', sz('leaf')) + img('leaf_moon', sz('leaf')) +
    img('gull_0', sz('gull')) + img('gull_1', sz('gull')) + img('raft', sz('raft')) + img('sling', sz('sling')) +
    img('heart', 30) + img('heart', 30) + img('heart_empty', 30) + img('icon', 40) + img('icon', 64) + `</div>`).join('') +
    `<div class="p" style="background:#555;gap:10px"><span class="lab">scenes</span>${scene('linear-gradient(#bfe9ff,#fff4dc)', false)}${scene('linear-gradient(#141a3a,#2b3a6e)', true)}</div>`;
}
function four() {
  const o = 'outline:1px dashed #0003';
  return [BGS[0], BGS[2]].map(([name, bg], i) => `<div class="p ${i ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — 4×</span>` +
    FINN.map(n => img(n, 312, o)).join('') + img('leaf', 192, o) + img('leaf_moon', 192, o) + img('gull_0', 288, o) + img('gull_1', 288, o) +
    img('raft', 696, o) + img('sling', 384, o) + img('heart', 120) + img('heart_empty', 120) + img('icon', 256) + `</div>`).join('');
}
// frames 2× with guides: feet line y=112, body centre (64,64), water line y 84 (splash), hit circle r 0.45/1.3·128
function frames() {
  const s = 256;
  const guide = `<svg style="position:absolute;left:0;top:0" width="${s}" height="${s}" viewBox="0 0 128 128">` +
    `<line x1="0" x2="128" y1="112" y2="112" stroke="red" stroke-width=".6"/><line x1="0" x2="128" y1="84" y2="84" stroke="#0a0" stroke-width=".4" stroke-dasharray="2 2"/>` +
    `<circle cx="64" cy="64" r="1.6" fill="#00f"/><circle cx="64" cy="64" r="${(0.45 / 1.3 * 128).toFixed(1)}" fill="none" stroke="#00f" stroke-width=".4"/></svg>`;
  return `<div class="p" style="background:#cfeeff;gap:0"><span class="lab">frames 2× — feet line y112 (red), water y84 (green), body centre + hit circle (blue)</span>` +
    FINN.map(n => `<span style="position:relative;display:inline-block;width:${s}px;height:${s}px;outline:1px solid #0002">${img(n, s)}${guide}</span>`).join('') + `</div>` +
    `<div class="p" style="background:#1aa0a8;gap:0"><span class="lab">animation strip (in-game size)</span>` +
    ['finn_sit', 'finn_pull', 'finn_pull', 'finn_fly', 'finn_fly', 'finn_flutter', 'finn_fly', 'finn_land', 'finn_land', 'finn_bonk', 'finn_splash'].map(n => img(n, sz('finn'))).join('') +
    `<span style="width:30px"></span>` + ['gull_0', 'gull_1', 'gull_0', 'gull_1'].map(n => img(n, sz('gull'))).join('') + `</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  for (const [file, html] of [['ingame.png', inGame()], ['4x.png', four()], ['frames.png', frames()]]) {
    await page.setContent(`<!doctype html><html><head>${css}</head><body>${html}</body></html>`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', path.join(OUT, file));
  }
  await browser.close();
})();
