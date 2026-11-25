// Contact sheets for Mossy's Egg Grove characters & items (QA loop).
// Usage: node tools/art-characters/sheet.js [assetDir] [outDir]
// Validates every SVG (DESIGN §3/§4) and writes docs/art/{chars_ingame,chars_4x,chars_eggs,chars_mossy,chars_scene}.png
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');

const EGGS = [1, 2, 3, 4, 5, 6, 7, 8].map(k => 'egg_' + k);
const MOSSY = ['mossy_0', 'mossy_1', 'mossy_drop', 'mossy_happy', 'mossy_worry'];
const VB = { egg_crack: [128, 128], shell_l: [64, 64], shell_r: [64, 64], baby: [128, 128], fairy: [96, 96],
  windsock: [128, 96], windsock_calm: [128, 96], bubble: [128, 128], icon: [256, 256] };
EGGS.forEach(n => { VB[n] = [128, 128]; });
MOSSY.forEach(n => { VB[n] = [160, 160]; });
const RADII = [0.50, 0.66, 0.84, 1.04, 1.26, 1.50, 1.78, 2.10];
const U = 38;                                        // px per world unit on a 960×540 screen

// ---------- validation ----------
const errs = [];
const hue = h => {
  const v = parseInt(h, 16), r = (v >> 16) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; if (H < 0) H += 360;
  return { H, S: d / mx, V: mx };
};
const GOLD_OK = new Set(['egg_8', 'egg_crack', 'shell_l', 'shell_r', 'icon']);
for (const [n, [w, h]] of Object.entries(VB)) {
  const f = `${DIR}/${n}.svg`;
  if (!fs.existsSync(f)) { errs.push(n + ': missing'); continue; }
  const s = fs.readFileSync(f, 'utf8');
  const head = s.match(/<svg[^>]*>/)[0];
  if (!head.includes('xmlns="http://www.w3.org/2000/svg"')) errs.push(n + ': xmlns');
  if (!head.includes(`viewBox="0 0 ${w} ${h}"`)) errs.push(n + ': viewBox');
  if (/<text|<image|<script|<filter|<foreignObject|xlink:href|href=|@import|font-family|NaN|undefined|Infinity/i.test(s)) errs.push(n + ': forbidden content');
  if (/#000000|#000"|"black"/i.test(s)) errs.push(n + ': pure black');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) errs.push(n + ': duplicate ids');
  for (const m of s.matchAll(/url\(#([^)]+)\)/g)) if (!ids.includes(m[1])) errs.push(n + ': missing ref ' + m[1]);
  if (!GOLD_OK.has(n)) for (const m of s.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const c = hue(m[1]);
    if (c && c.H > 38 && c.H < 62 && c.S > 0.45 && c.V > 0.7) errs.push(n + ': gold/yellow colour #' + m[1] + ' (reserved for egg 8)');
  }
}
if (errs.length) { console.error('VALIDATION FAILED\n' + errs.join('\n')); process.exitCode = 1; }
else console.log('validation ok (' + Object.keys(VB).length + ' files)');

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const r1 = v => +(+v).toFixed(1);
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${r1(w)}" height="${r1(w * VB[n][1] / VB[n][0])}" style="${st}">`;
const eggPx = k => 2 * RADII[k - 1] * 128 / 116 * U;
const SZ = { mossy: 2.2 * U, baby: 1.8 * U, fairy: 1.4 * U, windsock: 1.9 * U, bubble: 2.6 * U, shell: 0.8 * U, icon: 64 };
const sz = n => n.startsWith('egg_') && n !== 'egg_crack' ? eggPx(+n[4]) : n === 'egg_crack' ? eggPx(8) : SZ[n] || SZ[n.split('_')[0]];
const BGS = [['light', '#e9f1e4'], ['dark forest green', '#1f3a26']];
const css = `<style>body{margin:0;background:#666;font:13px sans-serif}.p{display:flex;flex-wrap:wrap;gap:14px;padding:24px 14px 14px;align-items:flex-end;position:relative}
.lab{position:absolute;left:6px;top:4px;color:#000b}.dk .lab{color:#fffd}.cell{display:flex;flex-direction:column;align-items:center;gap:4px}</style>
<svg width="0" height="0" style="position:absolute"><filter id="deut" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>`;
const ALL = [...EGGS, 'egg_crack', 'shell_l', 'shell_r', ...MOSSY, 'baby', 'fairy', 'windsock', 'windsock_calm', 'bubble', 'icon'];
const panel = (i, label, inner, st = '') => `<div class="p ${i ? 'dk' : ''}" style="background:${BGS[i][1]};${st}"><span class="lab">${BGS[i][0]} — ${label}</span>${inner}</div>`;

const inGame = () => BGS.map((_, i) => panel(i, 'in-game size (38 px/u)', ALL.map(n => img(n, sz(n))).join(''))).join('');
const four = () => BGS.map((_, i) => panel(i, '4× (eggs at 4× of kind-1 size = 168 px each)', ALL.map(n => img(n, n.startsWith('egg') ? 168 : n === 'icon' ? 256 : Math.min(4 * sz(n), 340), 'outline:1px dashed #8884')).join(''))).join('');
function eggs() {
  let h = '';
  BGS.forEach((_, i) => {
    h += panel(i, 'eggs in-game size, rotated 0/45/90/180°', EGGS.map(n => `<div class="cell">${[0, 45, 90, 180].map(a => img(n, sz(n), `transform:rotate(${a}deg)`)).join('')}</div>`).join(''), 'align-items:flex-start');
    h += panel(i, 'eggs 2.5×, rotated 0/45/90/180°', EGGS.map(n => `<div class="cell">${[0, 45, 90, 180].map(a => img(n, 100, `transform:rotate(${a}deg)`)).join('')}</div>`).join(''), 'align-items:flex-start');
  });
  const row = st => EGGS.map(n => img(n, sz(n), st)).join('');
  h += panel(1, 'the 8 kinds in a row (normal vision)', row(''));
  h += panel(1, 'deuteranopia simulation', row('filter:url(#deut)'));
  h += panel(0, 'normal / deuteranopia', row('') + '<span style="width:30px"></span>' + row('filter:url(#deut)'));
  return h;
}
function mossy() {
  const s = 300;
  const guide = `<svg style="position:absolute;left:0;top:0" width="${s}" height="${s}" viewBox="0 0 160 160">` +
    `<circle cx="80" cy="70" r="2" fill="#f0f"/><circle cx="80" cy="132" r="2" fill="#f00"/>` +
    `<line x1="0" x2="160" y1="132" y2="132" stroke="#f00" stroke-width=".5" stroke-dasharray="2 2"/></svg>`;
  let h = panel(0, 'Mossy frames ~3.6× — magenta = body centre (80,70), red = claws (80,132)',
    MOSSY.map(n => `<span style="position:relative;display:inline-block;width:${s}px;height:${s}px;outline:1px solid #0002">${img(n, s)}${guide}</span>`).join(''), 'gap:0');
  // Mossy holding eggs at in-game size: held egg centre 1.3 u under Mossy's body centre
  const hold = (k, fr) => {
    const W = 2.2 * U, ex = eggPx(k), cy = 70 / 160 * W + 1.3 * U;
    return `<span style="position:relative;display:inline-block;width:${r1(Math.max(W, ex))}px;height:${r1(cy + ex / 2 + 4)}px">` +
      `<img src="${uri('egg_' + k)}" width="${r1(ex)}" style="position:absolute;left:${r1(Math.max(W, ex) / 2 - ex / 2)}px;top:${r1(cy - ex / 2)}px">` +
      `<img src="${uri(fr)}" width="${r1(W)}" style="position:absolute;left:${r1(Math.max(W, ex) / 2 - W / 2)}px;top:0"></span>`;
  };
  BGS.forEach((_, i) => {
    h += panel(i, 'Mossy in-game, holding eggs 1–5', MOSSY.map(n => img(n, sz('mossy'))).join('') + [1, 2, 3, 4, 5].map((k, j) => hold(k, MOSSY[j % 2])).join(''));
    h += panel(i, 'Mossy 2× holding eggs', [1, 3, 5].map(k => `<span style="zoom:2">${hold(k, 'mossy_0')}</span>`).join('') + `<span style="zoom:2">${hold(2, 'mossy_drop')}</span>`);
  });
  return h;
}
function scene() {
  // a mock nest with a pile of eggs, Mossy above, bubble + windsock + baby + fairy
  const W = 960, H = 540, unit = 34, left = 480 - 4.5 * unit, gy = H - 0.6 * unit;
  const sx = x => left + x * unit, sy = y => gy - y * unit;
  const at = (n, x, y, w, rot = 0) => `<img src="${uri(n)}" width="${r1(w)}" style="position:absolute;left:${r1(x - w / 2)}px;top:${r1(y - w * VB[n][1] / VB[n][0] / 2)}px;transform:rotate(${rot}deg)">`;
  const ew = k => 2 * RADII[k - 1] * 128 / 116 * unit;
  let h = `<div style="position:relative;width:${W}px;height:${H}px;background:linear-gradient(#3f6b4a,#22402c);overflow:hidden">`;
  h += `<div style="position:absolute;left:${sx(-0.7)}px;top:${sy(11.2)}px;width:${10.4 * unit}px;height:${11.2 * unit + 0.6 * unit}px;background:#4a3a2a;border-radius:8px"></div>` +
       `<div style="position:absolute;left:${sx(0)}px;top:${sy(11.2)}px;width:${9 * unit}px;height:${11.2 * unit}px;background:#2f3f2e"></div>`;
  const pile = [[7, 2.0, 1.78, 10], [6, 5.4, 1.5, -30], [5, 7.7, 1.26, 60], [8, 4.1, 4.9, 15], [4, 1.1, 4.4, 120], [3, 7.9, 3.4, -80], [2, 6.6, 3.9, 200], [1, 8.2, 4.8, 40], [1, 2.4, 6.0, -60], [2, 6.4, 5.6, 90], [3, 0.9, 6.6, 180], [4, 7.6, 6.3, 30]];
  pile.forEach(([k, x, y, a]) => { h += at('egg_' + k, sx(x), sy(y), ew(k), a); });
  const mx = sx(3.2), my = sy(12.6);
  h += at('egg_3', mx, sy(11.3), ew(3)) + at('mossy_0', mx, my + (80 - 70) / 160 * 2.2 * unit, 2.2 * unit);
  h += at('bubble', sx(-2.4), sy(10.5), 2.6 * unit) + at('egg_2', sx(-2.4), sy(10.5) + 0.12 * unit, ew(2));
  h += at('windsock', sx(11.4), sy(10.5), 1.9 * unit) + at('windsock_calm', sx(11.4), sy(8.3), 1.9 * unit);
  h += at('baby', sx(-2.2), sy(4), 1.8 * unit) + at('fairy', sx(11.2), sy(5), 1.4 * unit) + at('egg_crack', sx(4.1), sy(4.9), ew(8), 15) +
       at('shell_l', sx(10.6), sy(2.4), 0.8 * unit) + at('shell_r', sx(11.6), sy(2.4), 0.8 * unit) + at('mossy_worry', sx(-2.2), sy(1.6), 2.2 * unit);
  return h + '</div>';
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 400 } });
  const sheets = [['chars_ingame.png', inGame()], ['chars_4x.png', four()], ['chars_eggs.png', eggs()], ['chars_mossy.png', mossy()], ['chars_scene.png', scene()]];
  for (const [file, html] of sheets) {
    await page.setContent(`<!doctype html><html><head>${css}</head><body>${html}</body></html>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', path.join(OUT, file));
  }
  await browser.close();
})();
