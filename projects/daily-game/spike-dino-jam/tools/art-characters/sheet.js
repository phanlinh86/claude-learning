// Contact sheet for Spike's Dino Jam characters/items (QA only).
// Usage: node sheet.js [assetDir] [outPng]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art/characters_sheet.png');
const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const SPIKE = ['idle', 'happy', 'ouch', 'jump'].map(n => 'spike_' + n);
const PTERA = ['fly1', 'fly2', 'throw'].map(n => 'ptera_' + n);
const NOTES = ['note_0', 'note_1', 'note_2', 'note_3', 'note_gold'];
const ITEMS = [...NOTES, 'pillow', 'heart_full', 'heart_empty', 'flip', 'songbar'];
// in-game drawn sizes (DESIGN §4.1)
const SIZE = { spike: [64, 64], board: [60, 25], note: [30, 30], note_gold: [34, 34], ptera: [112, 80], pillow: [44, 33],
  heart_full: [28, 28], heart_empty: [28, 28], flip: [40, 40], songbar: [44, 44], icon: [64, 64] };
const sz = n => SIZE[n] || SIZE[n.split('_')[0]];
const img = (n, s = 1, st = '') => { const [w, h] = sz(n); return `<img src="${uri(n)}" width="${w * s}" height="${h * s}" style="${st}">`; };
const BGS = [['green', '#9fd77f'], ['sand', '#e6c58e'], ['snow', '#f4f7fb'], ['dark', '#1f2a36']];

// Spike on his board, exactly like the renderer: board centre under feet line (y=88 of the 64 px box), rotated by heading
function rider(s = 1, frame = 'spike_idle', heading = 0, z = 0) {
  const W = 80, H = 80, sx = 8, sy = 4 - z;           // spike box at (8,4) 64x64
  const fx = sx + 50 * .64, fy = 4 + 88 * .64;        // feet point (board centre)
  return `<svg width="${W * s}" height="${H * s}" viewBox="0 0 ${W} ${H}">
<ellipse cx="${fx}" cy="${fy + 2}" rx="${20 - z * .2}" ry="7" fill="#0003"/>
<image href="${uri('board')}" x="${fx - 30}" y="${fy - 12.5 - z * .5}" width="60" height="25" transform="rotate(${heading} ${fx} ${fy - z * .5})"/>
<image href="${uri(frame)}" x="${sx}" y="${sy}" width="64" height="64"/>
</svg>`;
}
const row = (bg, html) => `<div class="p" style="background:${bg}">${html}</div>`;
const small = ([, bg]) => row(bg, SPIKE.map(n => img(n)).join('') + img('board') + PTERA.map(n => img(n)).join('') + ITEMS.map(n => img(n)).join('')
  + rider(1, 'spike_idle', 0) + rider(1, 'spike_happy', -30) + rider(1, 'spike_ouch', 25) + rider(1, 'spike_jump', 0, 10)
  + `<img src="${uri('icon')}" width="32" height="32"><img src="${uri('icon')}" width="64" height="64">`
  + `<span style="display:inline-flex;gap:0">${['note_0', 'note_1', 'note_2', 'note_3', 'note_0', 'note_gold'].map(n => img(n, .8)).join('')}</span>`);
const big = ([, bg]) => row(bg, SPIKE.map(n => img(n, 4 * .75)).join('') + img('board', 4)) +
  row(bg, PTERA.map(n => img(n, 3)).join('')) + row(bg, ITEMS.map(n => img(n, 4)).join(''));
const dot = (x, y, c) => `<div style="position:absolute;left:${x - 3}px;top:${y - 3}px;width:6px;height:6px;border-radius:50%;background:${c}"></div>`;
const hline = (y) => `<div style="position:absolute;left:0;right:0;top:${y}px;height:1px;background:#f00a"></div>`;
const anchors = row('#eef7e8', SPIKE.map(n => `<div style="position:relative"><img src="${uri(n)}" width="300" height="300" style="outline:1px dashed #0004">${hline(264)}${dot(150, 168, 'red')}</div>`).join('')
  + `<div style="position:relative"><img src="${uri('board')}" width="288" height="120" style="outline:1px dashed #0004">${dot(144, 60, 'blue')}</div>`
  + PTERA.map(n => `<div style="position:relative"><img src="${uri(n)}" width="280" height="200" style="outline:1px dashed #0004">${dot(140, 100, 'red')}</div>`).join('')
  + NOTES.map(n => `<div style="position:relative"><img src="${uri(n)}" width="144" height="144" style="outline:1px dashed #0004">${dot(72, 78, 'red')}</div>`).join(''));
const strips = row('#9fd77f', `<div class="p" style="gap:0">${SPIKE.map(n => img(n, 2)).join('')}</div><div class="p" style="gap:0">${PTERA.map(n => img(n, 2)).join('')}</div>`);
const composed = BGS.map(([, bg]) => row(bg, rider(3, 'spike_idle', 0) + rider(3, 'spike_happy', -35) + rider(3, 'spike_jump', 15, 12)
  + `<img src="${uri('icon')}" width="256" height="256"><img src="${uri('icon')}" width="48" height="48"><img src="${uri('icon')}" width="32" height="32">`)).join('');
const gray = row('#9fd77f', `<div class="p" style="filter:grayscale(1)">${NOTES.map(n => img(n, 2)).join('')}${img('pillow', 2)}${rider(2)}</div>`);
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:12px;padding:10px;align-items:center}</style>`;

(async () => {
  const which = process.argv[4] || 'all';
  const parts = { small: BGS.map(small).join('') + strips, big: big(BGS[0]) + big(BGS[3]), anchors, composed: composed + gray };
  const body = which === 'all' ? Object.values(parts).join('') : parts[which];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 400 } });
  await p.setContent(`<html><body>${css}${body}</body></html>`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT, fullPage: true });
  await b.close();
  console.log(OUT);
})();
