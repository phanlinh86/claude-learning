#!/usr/bin/env node
// Contact sheets for the character art of Ember's Glow Castle (Playwright + Chromium).
// - characters_sheet_dark.png / _light.png: every asset at in-game size (landscape cell 55)
//   and at 4x, on the board colour #1b1438 and on a light background
// - characters_ember.png: Ember's strip idle/flap/drop/happy/oops (1x and 3x) with crosshairs
//   at the body centre (80,78) and hold point (80,138), plus a held light drawn at the hold point
// - characters_tiers.png: the 8 light tiers in a row at 55 px cells on the board, plus a
//   mock board with mixed tiers and pumpkins
// Usage: node tools/art-characters/sheet.js
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUTD = path.join(ROOT, 'docs/art');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');

const CELL = 55, ITEM = Math.round(CELL * 0.86), EMB = Math.round(CELL * 1.75), BOO = Math.round(CELL * 1.4);
const BOARD = '#1b1438', LIGHT = '#efe9fb';
const FRAMES = ['idle', 'flap', 'drop', 'happy', 'oops'];
const ITEMS = [
  ...FRAMES.map((k) => [`ember_${k}.svg`, EMB]),
  ['boo.svg', BOO], ['boo_carry.svg', BOO], ['pumpkin.svg', ITEM], ['pumpkin_awake.svg', ITEM],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((t) => [`item_${t}.svg`, t === 8 ? Math.round(ITEM * 1.08) : ITEM]),
  ['goal_ring.svg', 52], ['icon.svg', 32],
];
const T = (t, c) => `<div style="font:bold 14px sans-serif;color:${c};margin:10px 0 6px">${t}</div>`;
const cross = (x, y, c) =>
  `<div style="position:absolute;left:${x - 7}px;top:${y - 0.5}px;width:14px;height:1px;background:${c}"></div>` +
  `<div style="position:absolute;left:${x - 0.5}px;top:${y - 7}px;width:1px;height:14px;background:${c}"></div>`;

function panel(bg) {
  const fg = bg === BOARD ? '#ddd' : '#222';
  let h = `<div style="background:${bg};padding:12px;width:1376px">` + T('in-game size (cell 55)', fg);
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px">`;
  for (const [n, s] of ITEMS) h += `<div style="text-align:center;font:10px sans-serif;color:${fg}"><img src="${uri(n)}" width="${s}" height="${s}"><br>${n.replace('.svg', '')}</div>`;
  h += `</div>` + T('4x (characters 2x)', fg) + `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px">`;
  for (const [n, s] of ITEMS) {
    const k = n.startsWith('ember') || n.startsWith('boo') ? 2 : n === 'icon.svg' ? 6 : 4;
    h += `<img src="${uri(n)}" width="${s * k}" height="${s * k}">`;
  }
  return h + `</div></div>`;
}
function emberStrip(scale, held) {
  const sz = EMB * scale, k = sz / 160;
  let h = `<div style="display:flex;gap:10px">`;
  for (const fr of FRAMES) {
    h += `<div style="position:relative;width:${sz}px;height:${sz + ITEM * scale * 0.5}px;outline:1px dashed rgba(255,255,255,.2)">`;
    h += `<img src="${uri('ember_' + fr + '.svg')}" style="position:absolute;left:0;top:0;width:${sz}px;height:${sz}px">`;
    if (held) {
      const is = ITEM * scale;
      h += `<img src="${uri('item_' + held + '.svg')}" style="position:absolute;left:${80 * k - is / 2}px;top:${138 * k - is / 2}px;width:${is}px;height:${is}px">`;
    } else {
      h += cross(80 * k, 78 * k, '#0f0') + cross(80 * k, 138 * k, '#f0f');
    }
    h += `</div>`;
  }
  return h + `</div>`;
}
function board() {
  // 5 x 7 mock board at landscape size; columns listed bottom-up
  const cols = [[1, 2, 3, 4, 'p'], [5, 6, 1, 1], [7, 8, 2, 'pa'], [3, 3, 4, 5, 6, 7], [2, 1]];
  const W = CELL * 5, H = CELL * 7;
  let h = `<div style="position:relative;width:${W + 160}px;height:${H + 120}px;background:linear-gradient(#3a2766,#20163f)">`;
  h += `<div style="position:absolute;left:80px;top:110px;width:${W}px;height:${H}px;background:rgba(27,20,56,.8);border-radius:8px"></div>`;
  cols.forEach((col, c) => col.forEach((t, r) => {
    const x = 80 + (c + 0.5) * CELL, y = 110 + H - (r + 0.5) * CELL;
    const n = t === 'p' ? 'pumpkin.svg' : t === 'pa' ? 'pumpkin_awake.svg' : `item_${t}.svg`;
    const s = t === 8 ? ITEM * 1.08 : ITEM;
    h += `<img src="${uri(n)}" style="position:absolute;left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px">`;
  }));
  // Ember above column 2, holding a tier-3 light
  const ex = 80 + 2.5 * CELL, ey = 110 - CELL * 0.95, k = EMB / 160;
  h += `<img src="${uri('ember_idle.svg')}" style="position:absolute;left:${ex - 80 * k}px;top:${ey - 78 * k}px;width:${EMB}px">`;
  h += `<img src="${uri('item_3.svg')}" style="position:absolute;left:${ex - ITEM / 2}px;top:${ey - 78 * k + 138 * k - ITEM / 2}px;width:${ITEM}px">`;
  h += `<img src="${uri('boo_carry.svg')}" style="position:absolute;left:${W + 80 - BOO / 2}px;top:20px;width:${BOO}px">`;
  return h + `</div>`;
}

(async () => {
  fs.mkdirSync(OUTD, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const shot = async (html, name) => {
    await page.setContent(`<!doctype html><html><body style="margin:0;display:inline-block">${html}</body></html>`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUTD, name), fullPage: true });
    console.log('wrote docs/art/' + name);
  };
  await shot(panel(BOARD), 'characters_sheet_dark.png');
  await shot(panel(LIGHT), 'characters_sheet_light.png');
  await shot(`<div style="background:${BOARD};padding:12px">${T('Ember 1x (green = body centre, magenta = hold point)', '#ddd')}${emberStrip(1)}` +
    `${T('Ember 3x', '#ddd')}${emberStrip(3)}${T('Ember 2x holding tiers 1 / 4 / 7', '#ddd')}${emberStrip(2, 1)}${emberStrip(2, 4)}${emberStrip(2, 7)}</div>` +
    `<div style="background:${LIGHT};padding:12px">${emberStrip(2)}</div>`, 'characters_ember.png');
  let tiers = `<div style="background:${BOARD};padding:12px">${T('tiers 1-8 at 55 px cells', '#ddd')}<div style="display:flex">`;
  for (let t = 1; t <= 8; t++) {
    const s = t === 8 ? ITEM * 1.08 : ITEM;
    tiers += `<div style="width:${CELL}px;height:${CELL}px;display:flex;align-items:center;justify-content:center;outline:1px solid rgba(255,255,255,.08)"><img src="${uri('item_' + t + '.svg')}" width="${s}"></div>`;
  }
  tiers += `</div>${T('greyscale check', '#ddd')}<div style="display:flex;filter:grayscale(1)">`;
  for (let t = 1; t <= 8; t++) tiers += `<div style="width:${CELL}px;height:${CELL}px;display:flex;align-items:center;justify-content:center"><img src="${uri('item_' + t + '.svg')}" width="${ITEM}"></div>`;
  tiers += `</div>${T('mock board', '#ddd')}${board()}</div>`;
  await shot(tiers, 'characters_tiers.png');
  await browser.close();
})();
