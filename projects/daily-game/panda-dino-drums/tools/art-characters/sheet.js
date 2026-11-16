#!/usr/bin/env node
// Contact sheet for the character art (DESIGN §4.1): every asset at in-game size and 4x,
// on light and dark backgrounds; Momo frame strip on the swing and Pip flap strip with
// anchor markers (body geometry must line up); gem readability row on warm/green/violet.
// Output: docs/art/characters_sheet.png and docs/art/characters_zoom.png
// Usage: node tools/art-characters/sheet.js
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = path.join(ROOT, 'docs/art/characters_sheet.png');
const ZOOM = path.join(ROOT, 'docs/art/characters_zoom.png');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');

const ITEMS = [ // name, drawn w, drawn h
  ['momo_idle.svg', 96, 96], ['momo_reach.svg', 96, 96], ['momo_happy.svg', 96, 96], ['momo_dizzy.svg', 96, 96],
  ['swing.svg', 96, 32], ['gem.svg', 40, 40], ['gem_gold.svg', 44, 44],
  ['pip_fly1.svg', 84, 70], ['pip_fly2.svg', 84, 70], ['pip_cheer.svg', 84, 70],
  ['ring.svg', 72, 72], ['groove.svg', 40, 40], ['tap_up.svg', 52, 52], ['tap_down.svg', 52, 52], ['icon.svg', 32, 32],
];
const BG = { light: '#f3e0c2', dark: '#2b2452' };
const dot = (x, y, c) => `<div style="position:absolute;left:${x - 3.5}px;top:${y - 3.5}px;width:7px;height:7px;background:${c};border-radius:50%;outline:1px solid #000"></div>`;
const hline = (y, w, c) => `<div style="position:absolute;left:0;top:${y}px;width:${w}px;height:1px;background:${c}"></div>`;
const vline = (x, h, c) => `<div style="position:absolute;left:${x}px;top:0;width:1px;height:${h}px;background:${c}"></div>`;

// Momo (viewBox 120 -> s px) sitting on the swing (viewBox 120 -> same scale); swing seat top y=10 on seat line y=104
function momoOnSwing(frame, s, marks) {
  const k = s / 120;
  const swTop = 104 * k - 10 * k;
  let h = `<div style="position:relative;display:inline-block;margin:4px;width:${s}px;height:${swTop + 40 * k}px">`;
  h += `<img src="${uri('swing.svg')}" style="position:absolute;left:0;top:${swTop}px;width:${s}px;height:${40 * k}px">`;
  h += `<img src="${uri('momo_' + frame + '.svg')}" style="position:absolute;left:0;top:0;width:${s}px;height:${s}px">`;
  if (marks) {
    h += hline(104 * k, s, '#e0f') + hline(12 * k, s, '#08f');
    h += dot(58 * k, 62 * k, '#0f0') + dot(14 * k, swTop + 2 * k, '#f80') + dot(106 * k, swTop + 2 * k, '#f80');
    if (frame === 'reach') h += dot(106 * k, 76 * k, '#0ff');
  }
  return h + `</div>`;
}
function pip(frame, s, marks) {
  const k = s / 120;
  let h = `<div style="position:relative;display:inline-block;margin:4px;width:${s}px;height:${100 * k}px">`;
  h += `<img src="${uri('pip_' + frame + '.svg')}" style="position:absolute;left:0;top:0;width:${s}px;height:${100 * k}px">`;
  if (marks) h += dot(60 * k, 56 * k, '#0f0') + dot(60 * k, 92 * k, '#f0f') + vline(60 * k, 100 * k, 'rgba(255,0,255,.4)');
  return h + `</div>`;
}
const title = (t) => `<div style="font:bold 14px sans-serif;margin:10px 0 4px">${t}</div>`;

function panel(bg) {
  let h = `<div style="background:${BG[bg]};padding:10px;color:${bg === 'dark' ? '#fff' : '#333'}">`;
  h += title(`${bg} - in-game size`) + `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px">`;
  for (const [n, w, hh] of ITEMS) h += `<div style="text-align:center;font:10px sans-serif"><img src="${uri(n)}" width="${w}" height="${hh}"><br>${n.replace('.svg', '')}</div>`;
  h += `</div>`;
  h += title('Momo on swing, 1x and 2.5x (green = body centre, magenta = seat line y104, blue = head top y12, orange = rope x14/106, cyan = reach tip) | Pip 1x and 2.5x (green = body centre, magenta = feet)');
  h += `<div style="display:flex;align-items:flex-end;flex-wrap:wrap">`;
  for (const fr of ['idle', 'reach', 'happy', 'dizzy']) h += momoOnSwing(fr, 96, false);
  for (const fr of ['fly1', 'fly2', 'cheer']) h += pip(fr, 84, false);
  h += `</div><div style="display:flex;align-items:flex-end;flex-wrap:wrap">`;
  for (const fr of ['idle', 'reach', 'happy', 'dizzy']) h += momoOnSwing(fr, 240, true);
  for (const fr of ['fly1', 'fly2', 'cheer']) h += pip(fr, 210, true);
  h += `</div>` + title('4x (icon at 1x 256)') + `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px">`;
  for (const [n, w, hh] of ITEMS) {
    if (/^(momo|pip)_/.test(n)) continue;
    const s = n === 'icon.svg' ? 8 : 4;
    h += `<img src="${uri(n)}" width="${w * s}" height="${hh * s}">`;
  }
  return h + `</div></div>`;
}
function gemRow() {
  const bgs = ['#f3e0c2', '#e9c79a', '#c99a6a', '#8cc66a', '#4f8f45', '#7a68b0', '#3d3270', '#bfeaff', '#1d2350'];
  let h = `<div style="padding:10px;background:#fff">` + title('gem readability (40/44 px) on warm / green / violet / sky / night walls, and on the drum') + `<div style="display:flex;gap:0">`;
  for (const b of bgs) h += `<div style="background:${b};padding:12px;display:flex;gap:6px;align-items:center"><img src="${uri('gem.svg')}" width="40" height="40"><img src="${uri('gem_gold.svg')}" width="44" height="44"></div>`;
  h += `<div style="background:#8cc66a;padding:4px;position:relative;width:80px;height:80px"><img src="${uri('ring.svg')}" width="72" height="72" style="position:absolute;left:4px;top:4px"><img src="${uri('gem.svg')}" width="40" height="40" style="position:absolute;left:20px;top:16px"></div>`;
  return h + `</div></div>`;
}

(async () => {
  const html = `<!doctype html><html><body style="margin:0;width:1500px">${panel('light')}${gemRow()}${panel('dark')}</body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 800 } });
  await page.setContent(html);
  await page.waitForTimeout(300);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, fullPage: true });
  const z = `<!doctype html><body style="margin:0;background:${BG.light};width:1500px">` +
    ['idle', 'reach', 'happy', 'dizzy'].map((n) => `<img src="${uri('momo_' + n + '.svg')}" width="360" height="360">`).join('') +
    `<br>` + ['fly1', 'fly2', 'cheer'].map((n) => `<img src="${uri('pip_' + n + '.svg')}" width="360" height="300">`).join('') +
    `<img src="${uri('swing.svg')}" width="360" height="120">` +
    `<br><img src="${uri('icon.svg')}" width="256" height="256"><img src="${uri('icon.svg')}" width="32" height="32"> ` +
    `<img src="${uri('gem.svg')}" width="256"><img src="${uri('gem_gold.svg')}" width="256"><img src="${uri('ring.svg')}" width="256"></body>`;
  await page.setContent(z);
  await page.waitForTimeout(200);
  await page.screenshot({ path: ZOOM, fullPage: true });
  await browser.close();
  console.log('wrote', OUT, 'and', ZOOM);
})();
