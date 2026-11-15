// Contact sheets for Shelly's Sky Catch characters/items.
// Usage: node sheet.js [assetDir] [outDir]
// Writes docs/art/characters_sheet.png (overview), characters_sheet_big.png (4x), characters_sheet_check.png (anchors/overlay/grey).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUTD = process.argv[3] || path.join(__dirname, '../../docs/art');
const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const FRAMES = ['idle', 'happy', 'zap', 'jet'].map(n => 'shelly_' + n);
const ITEMS = ['star_yellow', 'star_pink', 'star_blue', 'star_gold', 'thunder', 'thunder_2', 'heart_full', 'heart_empty', 'jar', 'rocket', 'windsock'];
// in-game drawn sizes (DESIGN §4.1)
const SIZE = { shelly: [96, 80], basket: [64, 48], basket_front: [64, 48], star_yellow: [32, 32], star_pink: [32, 32], star_blue: [32, 32],
  star_gold: [44, 44], thunder: [46, 40], thunder_2: [46, 40], heart_full: [28, 28], heart_empty: [28, 28], jar: [46, 52], rocket: [28, 28],
  windsock: [46, 34], icon: [64, 64] };
const sz = n => SIZE[n] || SIZE[n.split('_')[0]];
const img = (n, s = 1, st = '') => { const [w, h] = sz(n); return `<img src="${uri(n)}" width="${w * s}" height="${h * s}" style="${st}">`; };
const BGS = [['sky', '#bfe6ff'], ['violet', '#3b2a5e']];

// Shelly + basket composed exactly like the game: body centre (x,y); Shelly 96x80 with centre at (60,58)*0.8;
// basket 64x48 with rim centre (40,14)*0.8 at (x + sway, y - 46). item = optional item resting in the basket.
function combo(s = 1, frame = 'shelly_idle', item = 'star_yellow', sway = 0, hop = 0) {
  const W = 130, H = 130, x = 65, y = 96 - hop;
  const sx = x - 48, sy = y - 46.4, rx = x + sway, ry = y - 46, bx = rx - 32, by = ry - 11.2;
  const im = (n, X, Y, w, h) => `<image href="${uri(n)}" x="${X}" y="${Y}" width="${w}" height="${h}"/>`;
  const [iw, ih] = item ? sz(item) : [0, 0];
  return `<svg width="${W * s}" height="${H * s}" viewBox="0 0 ${W} ${H}">
${im(frame, sx, sy, 96, 80)}
${im('basket', bx, by, 64, 48)}
${item ? im(item, rx - iw / 2, ry - ih * 0.55, iw, ih) : ''}
${im('basket_front', bx, by, 64, 48)}
</svg>`;
}
const row = (bg, html, extra = '') => `<div class="p" style="background:${bg};${extra}">${html}</div>`;
const small = ([, bg]) => row(bg, FRAMES.map(n => img(n)).join('') + img('basket') + img('basket_front') + ITEMS.map(n => img(n)).join('')
  + combo(1, 'shelly_idle', 'star_pink') + combo(1, 'shelly_happy', 'star_gold', 6) + combo(1, 'shelly_zap', 'thunder', -6) + combo(1, 'shelly_jet', null, 0, 30)
  + `<img src="${uri('icon')}" width="32" height="32"><img src="${uri('icon')}" width="64" height="64">`);
const big = ([, bg]) => row(bg, FRAMES.map(n => img(n, 4)).join('')) + row(bg, img('basket', 4) + img('basket_front', 4) + ['star_yellow', 'star_pink', 'star_blue', 'star_gold'].map(n => img(n, 4)).join(''))
  + row(bg, ['thunder', 'thunder_2', 'heart_full', 'heart_empty', 'jar', 'rocket', 'windsock'].map(n => img(n, 4)).join(''));
const dot = (x, y, c) => `<div style="position:absolute;left:${x - 4}px;top:${y - 4}px;width:8px;height:8px;border-radius:50%;background:${c};outline:1px solid #fff"></div>`;
// frame strip: the 4 frames overlaid at 4x (each 30 % opacity): body/shell/jetpack must look crisp (identical)
const overlay = `<div style="position:relative;width:480px;height:400px;outline:1px dashed #0006">${FRAMES.map(n => `<img src="${uri(n)}" width="480" height="400" style="position:absolute;left:0;top:0;opacity:.32">`).join('')}
${dot(240, 232, 'red')}${dot(88, 312, 'orange')}<div style="position:absolute;left:0;top:96px;width:480px;height:1px;background:#f00a"></div></div>`;
const anchors = row('#bfe6ff', FRAMES.map(n => `<div style="position:relative"><img src="${uri(n)}" width="360" height="300" style="outline:1px dashed #0004">${dot(180, 174, 'red')}${dot(66, 234, 'orange')}<div style="position:absolute;left:0;top:72px;width:360px;height:1px;background:#f00a"></div></div>`).join(''))
  + row('#bfe6ff', overlay + `<div style="position:relative"><img src="${uri('basket')}" width="320" height="240" style="outline:1px dashed #0004">${dot(160, 56, 'blue')}<div style="position:absolute;left:0;top:156px;width:320px;height:1px;background:#00fa"></div></div>`
    + `<img src="${uri('basket_front')}" width="320" height="240" style="outline:1px dashed #0004">`);
const composed = BGS.map(([, bg]) => row(bg, combo(3, 'shelly_idle', 'star_blue') + combo(3, 'shelly_happy', 'star_gold', 8) + combo(3, 'shelly_zap', null, -8)
  + `<img src="${uri('icon')}" width="256" height="256"><img src="${uri('icon')}" width="48" height="48"><img src="${uri('icon')}" width="32" height="32">`)).join('');
const gray = row('#bfe6ff', ['star_yellow', 'star_pink', 'star_blue', 'star_gold', 'thunder', 'thunder_2'].map(n => img(n, 2)).join('') + combo(1.5, 'shelly_idle', 'star_yellow'), 'filter:grayscale(1)');
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:14px;padding:12px;align-items:center}</style>`;

async function shot(b, name, body, width = 1500) {
  const p = await b.newPage({ viewport: { width, height: 400 } });
  await p.setContent(`<html><body>${css}${body}</body></html>`);
  await p.waitForTimeout(400);
  const out = path.join(OUTD, name);
  await p.screenshot({ path: out, fullPage: true });
  await p.close();
  console.log(out);
}
(async () => {
  fs.mkdirSync(OUTD, { recursive: true });
  const b = await chromium.launch();
  await shot(b, 'characters_sheet.png', BGS.map(small).join('') + composed);
  await shot(b, 'characters_sheet_big.png', big(BGS[0]) + big(BGS[1]), 1700);
  await shot(b, 'characters_sheet_check.png', anchors + gray);
  await b.close();
})();
