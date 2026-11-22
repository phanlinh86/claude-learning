// Contact sheets + scene mock for Otto's Playroom Dash characters/items.
// Usage: node sheet.js [assetDir] [outDir]
// Writes characters_sheet_light.png, characters_sheet_dark.png, characters_scene.png and validates every SVG.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');
const OTTO = ['otto_0', 'otto_1', 'otto_2', 'otto_3', 'otto_jump', 'otto_ouch', 'otto_happy'];
const ACORN = ['acorn_0', 'acorn_1', 'acorn_2'];
const OBST = ['tower_0', 'tower_1', 'blocks', 'ball'];
const HUD = ['heart', 'heart_empty', 'grav_0', 'grav_1', 'grav_2', 'grav_3'];
const NAMES = [...OTTO, ...ACORN, ...OBST, ...HUD, 'icon'];
const VB = {};
const src = n => fs.readFileSync(`${DIR}/${n}.svg`, 'utf8');
const uri = n => 'data:image/svg+xml;base64,' + Buffer.from(src(n)).toString('base64');
NAMES.forEach(n => { const m = src(n).match(/viewBox="0 0 (\d+) (\d+)"/); VB[n] = [+m[1], +m[2]]; });
// in-game widths (DESIGN §4.1) with laneW0 ≈ 95 px (Otto ≈ 90 px)
const L = 95;
const W = { otto: 0.95, acorn: 0.42, tower: 0.86, blocks: 0.95, ball: 0.6 };
const inW = n => n.startsWith('heart') ? 28 : n.startsWith('grav') ? 30 : n === 'icon' ? 64 : W[n.split('_')[0]] * L;
const f = x => Math.round(x * 10) / 10;
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${f(w)}" height="${f(w * VB[n][1] / VB[n][0])}" style="${st}">`;
const row = (bg, html) => `<div class="p" style="background:${bg}">${html}</div>`;
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:14px;padding:12px;align-items:flex-end}</style>`;

function sheet(bg) {
  const inGame = row(bg, NAMES.filter(n => n !== 'icon').map(n => img(n, inW(n))).join('') + img('icon', 32) + img('icon', 64));
  const strip = row(bg, [0, 1, 2, 3, 0, 1, 2, 3].map(i => img('otto_' + i, 90)).join('') + '<span style="width:30px"></span>' +
    [0, 1, 2, 3].map(i => img('otto_' + i, 180)).join(''));
  const dash = 'outline:1px dashed #8886';
  const four = row(bg, OTTO.map(n => img(n, 360, dash)).join('')) +
    row(bg, ACORN.map(n => img(n, 160, dash)).join('') + img('tower_0', 344, dash) + img('tower_1', 344, dash) + img('ball', 230, dash)) +
    row(bg, img('blocks', 360, dash) + HUD.map(n => img(n, 120, dash)).join('') + img('icon', 256, dash));
  // anchor check: otto feet line y=120, body centre (64,72), body width 80; base lines; acorn circle
  const ov = (n, s, marks) => `<span style="position:relative;display:inline-block">${img(n, s)}` +
    `<svg style="position:absolute;left:0;top:0" width="${s}" height="${f(s * VB[n][1] / VB[n][0])}" viewBox="0 0 ${VB[n][0]} ${VB[n][1]}">${marks}</svg></span>`;
  const hl = (y, w) => `<line x1="0" x2="${w}" y1="${y}" y2="${y}" stroke="red" stroke-width="0.6"/>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.4" fill="red"/>`;
  const anchors = row(bg, OTTO.map(n => ov(n, 180, hl(120, 128) + dot(64, 72) + `<rect x="24" y="0" width="80" height="128" fill="none" stroke="#06f" stroke-width="0.5"/>`)).join('') +
    ov('tower_0', 140, hl(154, 128)) + ov('tower_1', 140, hl(154, 128)) + ov('blocks', 180, hl(74, 160)) + ov('ball', 110, `<circle cx="48" cy="48" r="42" fill="none" stroke="red" stroke-width="0.6"/>`) +
    ACORN.map(n => ov(n, 110, `<circle cx="32" cy="34" r="26" fill="none" stroke="red" stroke-width="0.5"/>`)).join(''));
  const gray = row(bg, `<div class="p" style="filter:grayscale(1)">${['otto_0', ...ACORN, ...OBST].map(n => img(n, inW(n))).join('')}</div>`);
  return inGame + strip + four + anchors + gray;
}

// perspective scene using DESIGN §2 projection (VW 960 × VH 540 landscape)
function scene(pal, night) {
  const VW = 960, VH = 540, lw = Math.min(0.19 * VW, 0.36 * VH) * 0.55, footY = VH - Math.max(0.13 * VH, 70), hz = Math.round(VH * 0.40);
  const CAM = { d: 3.2 };
  const pr = (x, y, z) => { const k = CAM.d / (z + CAM.d); return { sx: VW / 2 + x * lw * 1.8 * k, sy: hz + (footY - hz) * k - y * lw * 1.8 * k, k }; };
  const lwz = 1.8 * lw;
  let h = `<svg style="position:absolute;left:0;top:0" width="${VW}" height="${VH}">` +
    `<rect width="${VW}" height="${hz}" fill="${pal.sky}"/><rect y="${hz}" width="${VW}" height="${VH - hz}" fill="${pal.floor}"/>`;
  const a = pr(-1.5, 0, 36), b = pr(1.5, 0, 36), c = pr(1.5, 0, -1.2), d = pr(-1.5, 0, -1.2);
  h += `<polygon points="${a.sx},${a.sy} ${b.sx},${b.sy} ${c.sx},${c.sy} ${d.sx},${d.sy}" fill="${pal.path}"/>`;
  for (let z = 0; z < 36; z += 2) for (const x of [-0.5, 0.5]) { const p = pr(x, 0, z); h += `<ellipse cx="${p.sx}" cy="${p.sy}" rx="${6 * p.k}" ry="${2.5 * p.k}" fill="${pal.divider}"/>`; }
  h += '</svg>';
  const objs = [['tower_1', -1, 0, 12], ['ball', 1, 0.6, 10], ['blocks', 0, 0, 7], ['tower_0', 1, 0, 5],
    ['acorn_1', -1, 0.3, 5], ['acorn_0', -1, 0.3, 3.6], ['acorn_2', -1, 0.3, 2.2], ['acorn_0', 0, 0.3, 2.6], ['otto_0', 0, 0, 0]];
  const AN = { otto_0: [64, 120], tower_0: [64, 154], tower_1: [64, 154], blocks: [80, 74], ball: [48, 48], acorn_0: [32, 34], acorn_1: [32, 34], acorn_2: [32, 34] };
  objs.forEach(([n, x, y, z]) => {
    const p = pr(x, y, z), w = W[n.split('_')[0]] * lwz * p.k, s = w / VB[n][0], an = AN[n];
    const g = pr(x, 0, z);
    if (!n.startsWith('acorn')) h += `<div style="position:absolute;left:${g.sx - w * 0.38}px;top:${g.sy - w * 0.06}px;width:${w * 0.76}px;height:${w * 0.12}px;border-radius:50%;background:#0003"></div>`;
    h += `<img src="${uri(n)}" style="position:absolute;left:${p.sx - an[0] * s}px;top:${p.sy - an[1] * s}px" width="${w}">`;
  });
  h += `<div style="position:absolute;left:14px;top:10px;display:flex;gap:4px">${img('heart', 28)}${img('heart', 28)}${img('heart_empty', 28)}</div>` +
    `<div style="position:absolute;right:14px;top:8px">${img(night ? 'grav_3' : 'grav_0', 30)}</div>`;
  return `<div style="position:relative;width:${VW}px;height:${VH}px;overflow:hidden">${h}</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1800, height: 400 } });
  const bad = [];
  for (const n of NAMES) {
    const s = src(n);
    if (/<(text|script|image|foreignObject|style)\b|font|href=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(s)) bad.push(n + ': forbidden element/ref');
    const m = s.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/);
    if (!m || m[1] !== m[3] || m[2] !== m[4]) bad.push(n + ': width/height != viewBox');
    const err = await p.evaluate(t => {
      const d = new DOMParser().parseFromString(t, 'image/svg+xml');
      return d.querySelector('parsererror') ? d.querySelector('parsererror').textContent.slice(0, 200) : null;
    }, s);
    if (err) bad.push(n + ': ' + err);
  }
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1; } else console.log('all', NAMES.length, 'SVGs valid');
  const shot = async (html, file, w) => {
    await p.setViewportSize({ width: w, height: 400 });
    await p.setContent(`<html><body>${css}${html}</body></html>`);
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log(path.join(OUT, file));
  };
  await shot(sheet('#f4ead0'), 'characters_sheet_light.png', 1600);
  await shot(sheet('#1d2350'), 'characters_sheet_dark.png', 1600);
  const day = { sky: '#cfe6d8', floor: '#8cc26a', path: '#f1e4c4', divider: '#d8c49a' };
  const nite = { sky: '#1a2050', floor: '#2c3570', path: '#5a6aa8', divider: '#4a5890' };
  await shot(`<div class="p" style="background:#555">${scene(day)}${scene(nite, true)}</div>`, 'characters_scene.png', 1960);
  await b.close();
})();
