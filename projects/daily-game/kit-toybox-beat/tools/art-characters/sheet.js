#!/usr/bin/env node
// Contact sheet for the character art: every asset at in-game size and 4x,
// on light (dawn wallpaper) and dark (night) backgrounds, plus kit+flame and
// Baron Fluff frame strips. Output: docs/art/characters_sheet.png
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = path.join(ROOT, 'docs/art/characters_sheet.png');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');

const ITEMS = [ // name, drawn w, drawn h
  ['kit_idle.svg', 96, 96], ['kit_reach.svg', 96, 96], ['kit_happy.svg', 96, 96], ['kit_dizzy.svg', 96, 96],
  ['flame_1.svg', 26, 31], ['flame_2.svg', 26, 31], ['coin.svg', 40, 40], ['coin_gold.svg', 44, 44],
  ['pillow.svg', 48, 36], ['fluff_idle.svg', 112, 140], ['fluff_throw.svg', 112, 140], ['fluff_oof.svg', 112, 140],
  ['ring.svg', 72, 72], ['groove.svg', 40, 40], ['tap_up.svg', 52, 52], ['tap_down.svg', 52, 52], ['icon.svg', 32, 32],
];
const BG = { light: '#f6dccb', dark: '#1d2350' };

function kitWithFlame(frame, flame, scale) {
  const k = 0.8 * scale; // px per kit unit
  const fw = 26 * scale, fh = 31 * scale, fu = 0.65 * scale;
  const nx = 30 * k, ny = 96 * k;
  return `<div style="position:relative;width:${96 * scale}px;height:${(96 + 26) * scale}px;display:inline-block;margin:4px">
    <img src="${uri(flame)}" style="position:absolute;left:${nx - 20 * fu}px;top:${ny - 2 * fu}px;width:${fw}px;height:${fh}px">
    <img src="${uri('kit_' + frame + '.svg')}" style="position:absolute;left:0;top:0;width:${96 * scale}px;height:${96 * scale}px">
    <div style="position:absolute;left:${58 * k - 3.5}px;top:${62 * k - 3.5}px;width:7px;height:7px;background:#0f0;${scale > 1 ? '' : 'display:none'}"></div>
    <div style="position:absolute;left:${nx - 3.5}px;top:${ny - 3.5}px;width:7px;height:7px;background:#f0f;${scale > 1 ? '' : 'display:none'}"></div>
    ${frame === 'reach' && scale > 1 ? `<div style="position:absolute;left:${104 * k - 3.5}px;top:${62 * k - 3.5}px;width:7px;height:7px;background:#0ff"></div>` : ''}
  </div>`;
}

function panel(bg) {
  let h = `<div style="background:${BG[bg]};padding:10px;color:${bg === 'dark' ? '#fff' : '#333'}">`;
  h += `<div style="font:bold 14px sans-serif">${bg} - in-game size</div><div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px">`;
  for (const [n, w, hh] of ITEMS) h += `<div style="text-align:center;font:10px sans-serif"><img src="${uri(n)}" width="${w}" height="${hh}"><br>${n.replace('.svg', '')}</div>`;
  h += `</div><div style="font:bold 14px sans-serif;margin-top:8px">kit + flame (1x, 3x; green = body centre, magenta = nozzle, cyan = reach anchor)</div><div>`;
  for (const fr of ['idle', 'reach', 'happy', 'dizzy']) h += kitWithFlame(fr, fr === 'reach' ? 'flame_2.svg' : 'flame_1.svg', 1);
  for (const fr of ['idle', 'reach', 'happy', 'dizzy']) h += kitWithFlame(fr, fr === 'reach' ? 'flame_2.svg' : 'flame_1.svg', 3);
  h += `</div><div style="font:bold 14px sans-serif;margin-top:8px">4x</div><div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px">`;
  for (const [n, w, hh] of ITEMS) {
    if (n.startsWith('kit_') || n.startsWith('fluff_')) continue;
    const s = n === 'icon.svg' ? 1 : 4;
    h += `<img src="${uri(n)}" width="${w * s}" height="${hh * s}">`;
  }
  h += `</div><div style="font:bold 14px sans-serif;margin-top:8px">Baron Fluff 1x and 2.5x</div><div style="display:flex;align-items:flex-end;gap:10px">`;
  for (const fr of ['idle', 'throw', 'oof']) h += `<img src="${uri('fluff_' + fr + '.svg')}" width="112" height="140">`;
  for (const fr of ['idle', 'throw', 'oof']) h += `<img src="${uri('fluff_' + fr + '.svg')}" width="280" height="350">`;
  h += `</div></div>`;
  return h;
}

(async () => {
  const html = `<!doctype html><html><body style="margin:0;width:1500px">${panel('light')}${panel('dark')}</body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 800 } });
  await page.setContent(html);
  await page.waitForTimeout(300);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, fullPage: true });
  // optional crop helper: node sheet.js crop  -> writes zoomed kit/fluff close-ups
  if (process.argv[2] === 'zoom') {
    const z = `<!doctype html><body style="margin:0;background:${BG.light}">` +
      ['kit_idle', 'kit_reach', 'kit_happy', 'kit_dizzy'].map((n) => `<img src="${uri(n + '.svg')}" width="360" height="360">`).join('') +
      `<br>` + ['fluff_idle', 'fluff_throw', 'fluff_oof'].map((n) => `<img src="${uri(n + '.svg')}" width="320" height="400">`).join('') +
      `<img src="${uri('icon.svg')}" width="256" height="256"><img src="${uri('coin.svg')}" width="256"><img src="${uri('coin_gold.svg')}" width="256">` + `</body>`;
    await page.setViewportSize({ width: 1500, height: 800 });
    await page.setContent(z);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(ROOT, 'docs/art/characters_zoom.png'), fullPage: true });
  }
  await browser.close();
  console.log('wrote', OUT);
})();
