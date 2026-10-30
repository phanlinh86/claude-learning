// Contact sheet for Puff's Volcano Catch characters/items.
// Usage: node sheet.js [assetDir] [outPng]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art/characters_sheet.png');
const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const PUFF = ['idle', 'happy', 'ouch', 'blow'].map(n => 'puff_' + n);
const COINS = ['copper', 'silver', 'gold'].map(n => 'coin_' + n);
const ITEMS = [...COINS, 'rock', 'rock_2', 'heart_full', 'heart_empty', 'drop', 'pouch'];
// in-game drawn sizes (DESIGN §4.1)
const SIZE = { puff: [96, 80], basket: [76, 57], basket_front: [76, 57], coin_copper: [28, 28], coin_silver: [30, 30], coin_gold: [34, 34],
  rock: [34, 34], rock_2: [34, 34], heart_full: [28, 28], heart_empty: [28, 28], drop: [28, 28], pouch: [46, 52], icon: [64, 64] };
const sz = n => SIZE[n] || SIZE[n.split('_')[0]];
const img = (n, s = 1, st = '') => { const [w, h] = sz(n); return `<img src="${uri(n)}" width="${w * s}" height="${h * s}" style="${st}">`; };
const BGS = [['light', '#eaf6ff'], ['sky', '#7cc7e8'], ['sunset', '#f2a46b'], ['dark', '#1b2340']];

// Puff + ropes + basket composed exactly like the game: body centre (cx,cy); Puff 0.8 scale; basket 76/96 scale, rim 54 px below.
function combo(s = 1, face = 'puff_idle', coin = 'coin_gold', swing = 0) {
  const W = 150, H = 150, cx = 75, cy = 50, ps = 0.8, bs = 76 / 96;
  const px = cx - 60 * ps, py = cy - 50 * ps;
  const rimX = cx + swing, rimY = cy + 54, bx = rimX - 48 * bs, by = rimY - 16 * bs;
  const a = [[34, 72], [86, 72]].map(([x, y]) => [px + x * ps, py + y * ps]);
  const h = [[10, 16], [86, 16]].map(([x, y]) => [bx + x * bs, by + y * bs]);
  const ab = (n, x, y, w, hh) => `<image href="${uri(n)}" x="${x}" y="${y}" width="${w}" height="${hh}"/>`;
  return `<svg width="${W * s}" height="${H * s}" viewBox="0 0 ${W} ${H}">
${ab('basket', bx, by, 76, 57)}
${coin ? ab(coin, rimX - 14, rimY - 12, 28, 28) : ''}
${ab('basket_front', bx, by, 76, 57)}
${a.map((p, i) => `<line x1="${p[0]}" y1="${p[1]}" x2="${h[i][0]}" y2="${h[i][1]}" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/>`).join('')}
${ab(face, px, py, 96, 80)}
</svg>`;
}
const row = (bg, html) => `<div class="p" style="background:${bg}">${html}</div>`;
const small = ([name, bg]) => row(bg, PUFF.map(n => img(n)).join('') + img('basket') + img('basket_front') + ITEMS.map(n => img(n)).join('')
  + combo(1, 'puff_idle', 'coin_copper') + combo(1, 'puff_happy', 'coin_gold', 6) + combo(1, 'puff_ouch', 'rock', -6) + combo(1, 'puff_blow', null)
  + `<img src="${uri('icon')}" width="32" height="32"><img src="${uri('icon')}" width="64" height="64">`);
const big = ([name, bg]) => row(bg, PUFF.map(n => img(n, 4 * 0.6)).join('') + img('basket', 3) + img('basket_front', 3)) +
  row(bg, ITEMS.map(n => img(n, 4)).join(''));
// anchor check at 3x: body centre + rope attach points (red) / rim centre + hang points (blue)
const dot = (x, y, c) => `<div style="position:absolute;left:${x - 3}px;top:${y - 3}px;width:6px;height:6px;border-radius:50%;background:${c}"></div>`;
const anchors = row('#eaf6ff', PUFF.map(n => `<div style="position:relative"><img src="${uri(n)}" width="360" height="300" style="outline:1px dashed #0004">${dot(180, 150, 'red')}${dot(102, 216, 'red')}${dot(258, 216, 'red')}</div>`).join('')
  + `<div style="position:relative"><img src="${uri('basket')}" width="288" height="216" style="outline:1px dashed #0004">${dot(144, 48, 'blue')}${dot(30, 48, 'blue')}${dot(258, 48, 'blue')}</div>`);
const composed = BGS.map(([, bg]) => row(bg, combo(3, 'puff_idle', 'coin_silver') + combo(3, 'puff_happy', 'coin_gold', 8)
  + `<img src="${uri('icon')}" width="256" height="256"><img src="${uri('icon')}" width="48" height="48"><img src="${uri('icon')}" width="32" height="32">`)).join('');
const gray = row('#7cc7e8', `<div class="p" style="filter:grayscale(1)">${ITEMS.slice(0, 5).map(n => img(n, 2)).join('')}${combo(1.5, 'puff_idle', 'coin_copper')}</div>`);
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:12px;padding:10px;align-items:center}</style>`;

(async () => {
  const body = BGS.map(small).join('') + big(BGS[1]) + big(BGS[3]) + anchors + composed + gray;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 400 } });
  await p.setContent(`<html><body>${css}${body}</body></html>`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT, fullPage: true });
  await b.close();
  console.log(OUT);
})();
