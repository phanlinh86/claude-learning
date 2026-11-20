#!/usr/bin/env node
// Contact sheets for the character art of Ollie's Lighthouse Flip (Playwright + Chromium).
// - characters_sheet_light.png / _dark.png / _night.png: every asset at in-game size (unit = 100) and enlarged,
//   on a light background, a dark grey-brown and a deep night blue; Ollie frames get anchor marks
//   (green = body centre 64,74; magenta = headlamp lens 92,44; orange line = feet line y 120);
//   run-cycle strip, leaf flutter strip (+ greyscale row), Ollie upside-down (scaleY -1) under a ceiling beam.
// - characters_scene.png: 960x540 mock corridor (floor y 431, ceiling underside y 141) with dimming.
// Usage: node tools/art-characters/sheet.js        (QA_DIR=dir also writes a big close-up of Ollie)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUTD = path.join(ROOT, 'docs/art');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');

const U = 100, CORR = 290;
const OL = 0.95 * U, LF = 0.42 * U;
const BG = { light: '#eef0f6', dark: '#2e2a2a', night: '#0e1638' };
const LEAFC = ['#5fd35a', '#ffc53d', '#ff6b3d'];
const OLLIES = ['ollie_run_0', 'ollie_run_1', 'ollie_run_2', 'ollie_run_3', 'ollie_air', 'ollie_bump', 'ollie_happy'];
// [file, w, h, enlarge]
const ITEMS = [
  ...OLLIES.map((n) => [n + '.svg', OL, OL, 4]),
  ...[0, 1, 2].map((i) => [`leaf_${i}.svg`, LF, LF, 4]),
  ['vent_0.svg', 80, 62, 3], ['vent_1.svg', 50, 78, 3], ['sign_0.svg', 80, 66, 3], ['sign_1.svg', 55, 70, 3],
  ['drone.svg', 100, 75, 3], ['finish.svg', 140, CORR, 1.5],
  ['battery.svg', 28, 28, 4], ['battery_empty.svg', 28, 28, 4], ['icon.svg', 32, 32, 8],
];
const T = (t, c) => `<div style="font:bold 14px sans-serif;color:${c};margin:14px 0 6px">${t}</div>`;
const cross = (x, y, c) =>
  `<div style="position:absolute;left:${x - 6}px;top:${y - 0.5}px;width:12px;height:1px;background:${c}"></div>` +
  `<div style="position:absolute;left:${x - 0.5}px;top:${y - 6}px;width:1px;height:12px;background:${c}"></div>`;
const img = (n, x, y, w, h, extra = '') => `<img src="${uri(n)}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">`;

function cell(n, w, h, fg, k = 1, marks = false, label = true) {
  w *= k; h *= k;
  let s = `<div style="text-align:center;font:10px sans-serif;color:${fg}"><div style="position:relative;width:${w}px;height:${h}px;outline:1px dashed rgba(128,128,160,.35)">`;
  s += img(n, 0, 0, w, h);
  if (marks && n.startsWith('ollie')) {
    const sx = w / 128;
    s += `<div style="position:absolute;left:0;top:${120 * sx}px;width:${w}px;height:1px;background:#f80"></div>`;
    s += cross(64 * sx, 74 * sx, '#0c0') + cross(92 * sx, 44 * sx, '#f0f');
  }
  if (marks && n === 'drone.svg') s += cross(64 * w / 128, 36 * w / 128, '#0c0') + cross(64 * w / 128, 92 * w / 128, '#f0f');
  if (marks && n === 'finish.svg') s += cross(80 * w / 160, 60 * h / 300, '#f0f');
  return s + `</div>${label ? n.replace('.svg', '') : ''}</div>`;
}
function panel(bg) {
  const dark = bg !== BG.light, fg = dark ? '#ddd' : '#222';
  let h = `<div style="background:${bg};padding:14px;width:1872px">` + T('in-game size (unit = 100; Ollie 95 px, leaf 42 px, finish stretched to corridor 290 px)', fg);
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px">`;
  for (const [n, w, hh] of ITEMS) h += cell(n, w, hh, fg, 1, false);
  h += `</div>` + T('enlarged (Ollie marks: green body centre 64,74 / magenta headlamp lens 92,44 / orange feet line 120; drone: body centre + hook 64,92; finish: lamp 80,60)', fg);
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px">`;
  for (const [n, w, hh, k] of ITEMS) h += cell(n, w, hh, fg, k, true, false);
  h += `</div>`;
  h += T('run cycle 0-1-2-3-0-1-2-3 at 2x (identical body; feet on the line)', fg) + `<div style="position:relative;height:${OL * 2 + 10}px;width:${8 * OL * 1.6}px">`;
  for (let i = 0; i < 8; i++) h += img(`ollie_run_${i % 4}.svg`, i * OL * 1.6, 0, OL * 2, OL * 2);
  h += `<div style="position:absolute;left:0;top:${(120 / 128) * OL * 2}px;width:100%;height:2px;background:${dark ? '#6a78b0' : '#8a93b0'}"></div></div>`;
  // leaves: flutter (rotated / flipped like the renderer does), colour + greyscale
  h += T('leaves fluttering (rot -40..40, mirrored), 2x, colour and greyscale, with the night glow', fg) + `<div style="display:flex;gap:30px">`;
  for (const gs of [false, true]) {
    h += `<div style="display:flex;flex-direction:column;gap:6px;${gs ? 'filter:grayscale(1)' : ''}">`;
    for (let c = 0; c < 3; c++) {
      h += `<div style="display:flex;gap:8px">`;
      [-40, -15, 15, 40].forEach((r, i) => {
        h += `<div style="position:relative;width:84px;height:84px;background:${dark ? `radial-gradient(circle, ${LEAFC[c]}55 0, transparent 60%)` : 'none'}">` +
          img(`leaf_${c}.svg`, 0, 0, 84, 84, `transform:rotate(${r}deg) scaleX(${i % 2 ? -1 : 1})`) + `</div>`;
      });
      h += `</div>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  h += T('upside-down on the ceiling beam (scaleY -1), in-game size and 2x', fg);
  const RH = 40, W = 1400;
  h += `<div style="position:relative;height:${RH + OL * 2 + 20}px;width:${W}px;background:#3a4560">`;
  h += `<div style="position:absolute;left:0;top:0;width:${W}px;height:${RH}px;background:linear-gradient(#8a6440,#6b4a2c);border-bottom:3px solid #4a2e18"></div>`;
  let x = 10;
  for (const n of OLLIES) { h += img(n + '.svg', x, RH + 3 - (8 / 128) * OL, OL, OL, 'transform:scaleY(-1)'); x += OL + 6; }
  for (const n of ['ollie_run_0', 'ollie_run_2', 'ollie_happy']) { h += img(n + '.svg', x, RH + 3 - (8 / 128) * OL * 2, OL * 2, OL * 2, 'transform:scaleY(-1)'); x += OL * 2 + 6; }
  return h + `</div></div>`;
}
function scene(dark) {
  const W = 960, H = 540, FLOOR = 431, CEIL = 141, k = OL / 128;
  let h = `<div style="position:relative;width:${W}px;height:${H}px;background:${dark ? '#3a4560' : '#a9b6c8'};overflow:hidden">`;
  for (const wx of [200, 640]) h += `<div style="position:absolute;left:${wx}px;top:170px;width:170px;height:160px;background:${dark ? 'linear-gradient(#0e1638,#263a6a)' : 'linear-gradient(#ffc8b0,#d9b8e8)'};border:10px solid #6b4a2c;box-sizing:border-box"></div>`;
  for (const [x0, x1] of [[0, 520], [640, W]]) h += `<div style="position:absolute;left:${x0}px;top:${FLOOR}px;width:${x1 - x0}px;height:${H - FLOOR}px;background:#b07a4f;border-top:6px solid #8a5a34;box-sizing:border-box"></div>`;
  for (const [x0, x1] of [[0, 330], [440, W]]) h += `<div style="position:absolute;left:${x0}px;top:0;width:${x1 - x0}px;height:${CEIL}px;background:linear-gradient(#5a3a22,#8a6440);border-bottom:4px solid #4a2e18;box-sizing:border-box"></div>`;
  const leaf = (c, x, y, r) => img(`leaf_${c}.svg`, x - LF / 2, y - LF / 2, LF, LF, `transform:rotate(${r}deg)`);
  [[320, 395], [365, 400], [410, 395]].forEach(([x, y], i) => { h += leaf(0, x, y, [-20, 10, 30][i]); });
  [[620, 360], [660, 300], [690, 240]].forEach(([x, y], i) => { h += leaf(1, x, y, [20, -10, 15][i]); });
  [[760, 180], [800, 175], [840, 185]].forEach(([x, y], i) => { h += leaf(2, x, y, [-30, 0, 25][i]); });
  h += img('vent_0.svg', 780, FLOOR - 62, 80, 62) + img('vent_1.svg', 900, FLOOR - 78, 50, 78);
  h += img('sign_0.svg', 160, CEIL, 80, 66) + img('sign_1.svg', 590, CEIL, 55, 70);
  h += img('ollie_run_1.svg', 250 - 64 * k, FLOOR - 120 * k, OL, OL);
  h += img('ollie_run_3.svg', 80 - 64 * k, CEIL - 8 * k, OL, OL, 'transform:scaleY(-1)');
  const dx = 560, dy = 230, dk = 100 / 128;
  h += img('ollie_bump.svg', dx - 64 * k, dy + (92 - 36) * dk - 14 * k, OL, OL);
  h += img('drone.svg', dx - 64 * dk, dy - 36 * dk, 100, 75);
  h += img('finish.svg', 880 - 70, CEIL, 140, FLOOR - CEIL);
  if (dark) h += `<div style="position:absolute;inset:0;background:rgba(10,14,38,.55)"></div>` +
    `<div style="position:absolute;left:${250 + 28 * k - 40}px;top:${FLOOR - 76 * k - 40}px;width:80px;height:80px;border-radius:50%;background:radial-gradient(#fff2a866,transparent 70%)"></div>`;
  [0, 1, 2].forEach((i) => { h += img(i < 2 ? 'battery.svg' : 'battery_empty.svg', 14 + i * 32, 14, 28, 28); });
  return h + `</div>`;
}

(async () => {
  fs.mkdirSync(OUTD, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1900, height: 800 } });
  const shot = async (html, name) => {
    await page.setContent(`<!doctype html><html><body style="margin:0;display:inline-block">${html}</body></html>`);
    await page.waitForTimeout(300);
    await (await page.$('body > div')).screenshot({ path: path.isAbsolute(name) ? name : path.join(OUTD, name) });
    console.log('wrote ' + name);
  };
  await shot(panel(BG.light), 'characters_sheet_light.png');
  await shot(panel(BG.dark), 'characters_sheet_dark.png');
  await shot(panel(BG.night), 'characters_sheet_night.png');
  await shot(`<div style="display:flex;flex-direction:column">${scene(false)}${scene(true)}</div>`, 'characters_scene.png');
  if (process.env.QA_DIR) {
    const big = (names, k, bg) => `<div style="background:${bg};padding:10px;display:flex;gap:10px;flex-wrap:wrap;width:1800px">` +
      names.map((n) => `<img src="${uri(n)}" style="width:${k}px;height:${k}px;background:#c8cede">`).join('') + '</div>';
    await shot(big(OLLIES.map((b) => b + '.svg'), 420, BG.light), path.resolve(process.env.QA_DIR, 'ollie_big.png'));
    await shot(big(['leaf_0.svg', 'leaf_1.svg', 'leaf_2.svg', 'drone.svg', 'icon.svg'], 340, BG.light), path.resolve(process.env.QA_DIR, 'items_big.png'));
  }
  await browser.close();
})();
