// Contact sheets + scene mock for Pebble's Oasis Run characters/items.
// Usage: node sheet.js [assetDir] [outDir]
// Writes characters_sheet_light.png, characters_sheet_dark.png, characters_scene.png and validates every SVG.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');
const PEB = ['pebble_0', 'pebble_1', 'pebble_2', 'pebble_3', 'pebble_jump', 'pebble_ouch', 'pebble_happy'];
const FIZ = ['fizz_0', 'fizz_1', 'fizz_throw', 'fizz_hmph'];
const ITEMS = ['shell_0', 'shell_1', 'shell_2', 'pots', 'log', 'tumble', 'pillow', 'heart', 'heart_empty', 'book'];
const NAMES = [...PEB, ...FIZ, ...ITEMS, 'icon'];
const VB = {};
const src = n => fs.readFileSync(`${DIR}/${n}.svg`, 'utf8');
const uri = n => 'data:image/svg+xml;base64,' + Buffer.from(src(n)).toString('base64');
NAMES.forEach(n => { const m = src(n).match(/viewBox="0 0 (\d+) (\d+)"/); VB[n] = [+m[1], +m[2]]; });
// in-game widths (DESIGN §4.1) with laneW0 ≈ 130 px (phone-ish) — the hero at z=0 is 1.0·laneW0
const L = 130;
const W = { pebble: 1.0, shell: 0.42, pots: 0.86, log: 0.95, tumble: 0.62, pillow: 0.8, fizz: 1.5 };
const inW = n => n.startsWith('heart') ? 28 : n === 'book' ? 44 : n === 'icon' ? 64 : W[n.split('_')[0]] * L;
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${f(w)}" height="${f(w * VB[n][1] / VB[n][0])}" style="${st}">`;
const f = x => Math.round(x * 10) / 10;
const row = (bg, html) => `<div class="p" style="background:${bg}">${html}</div>`;
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:14px;padding:12px;align-items:flex-end}</style>`;

function sheet(bg, bg2) {
  const inGame = row(bg, PEB.map(n => img(n, 110)).join('') + FIZ.map(n => img(n, 70)).join('') + FIZ.slice(0, 1).map(n => img(n, 120)).join('') +
    ITEMS.map(n => img(n, inW(n))).join('') + img('icon', 32) + img('icon', 64));
  const strip = row(bg, [0, 1, 2, 3, 0, 1, 2, 3].map(i => img('pebble_' + i, 120)).join('') + '<span style="width:30px"></span>' + [0, 1, 0, 1].map(i => img('fizz_' + i, 150)).join(''));
  const dash = 'outline:1px dashed #0003';
  const four = row(bg2, PEB.map(n => img(n, 512 / 2 * 1, dash)).join('')) +
    row(bg2, FIZ.map(n => img(n, 384, dash)).join('')) +
    row(bg2, ['shell_0', 'shell_1', 'shell_2'].map(n => img(n, 256, dash)).join('') + img('pots', 384, dash) + img('tumble', 288, dash)) +
    row(bg2, img('log', 480, dash) + img('pillow', 384, dash) + ['heart', 'heart_empty'].map(n => img(n, 192, dash)).join('') + img('book', 288, dash)) +
    row(bg2, img('icon', 256, dash) + img('icon', 128) + img('icon', 48) + img('icon', 32));
  // anchor check: pebble feet line y=120 + body centre (64,72), body width 80; fizz carpet centre (96,130); base lines
  const ov = (n, s, marks) => `<span style="position:relative;display:inline-block">${img(n, s)}` +
    `<svg style="position:absolute;left:0;top:0" width="${s}" height="${f(s * VB[n][1] / VB[n][0])}" viewBox="0 0 ${VB[n][0]} ${VB[n][1]}">${marks}</svg></span>`;
  const hl = (y, w) => `<line x1="0" x2="${w}" y1="${y}" y2="${y}" stroke="red" stroke-width="0.6"/>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.4" fill="red"/>`;
  const anchors = row(bg2, PEB.map(n => ov(n, 200, hl(120, 128) + dot(64, 72) + `<rect x="24" y="0" width="80" height="128" fill="none" stroke="#06f" stroke-width="0.5"/>`)).join('') +
    FIZ.map(n => ov(n, 240, dot(96, 130) + (n === 'fizz_throw' ? `<rect x="60" y="0" width="72" height="44" fill="none" stroke="#06f" stroke-width="0.8"/>` : ''))).join('') +
    ov('pots', 160, hl(154, 128)) + ov('log', 200, hl(74, 160)) + ov('pillow', 160, hl(88, 128) + dot(64, 50)) + ov('tumble', 160, `<circle cx="48" cy="48" r="42" fill="none" stroke="red" stroke-width="0.6"/>`) +
    ['shell_0', 'shell_1', 'shell_2'].map(n => ov(n, 128, `<circle cx="32" cy="34" r="26" fill="none" stroke="red" stroke-width="0.5"/>`)).join(''));
  const gray = row(bg, `<div class="p" style="filter:grayscale(1)">${PEB.slice(0, 1).map(n => img(n, 110)).join('')}${ITEMS.slice(0, 7).map(n => img(n, inW(n))).join('')}${img('fizz_0', 90)}</div>`);
  return inGame + strip + four + anchors + gray;
}

// perspective scene using DESIGN §2 projection (VW 960 × VH 540 landscape)
let SC = 0;
function scene(pal, night) {
  const u = 's' + (SC++);
  const VW = 960, VH = 540, lw = Math.min(0.19 * VW, 0.36 * VH), footY = VH - Math.max(0.13 * VH, 70), hz = Math.round(VH * 0.40);
  const camX = 0, CAM = { d: 3.2 };
  const pr = (x, y, z) => { const k = CAM.d / (z + CAM.d); return { sx: VW / 2 + (x - camX) * lw * k, sy: hz + (footY - hz) * k - y * lw * k, k }; };
  let h = `<svg style="position:absolute;left:0;top:0" width="${VW}" height="${VH}">` +
    `<defs><linearGradient id="${u}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.skyTop}"/><stop offset="1" stop-color="${pal.skyBot}"/></linearGradient>` +
    `<linearGradient id="${u}sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.sandFar}"/><stop offset="1" stop-color="${pal.sandNear}"/></linearGradient></defs>` +
    `<rect width="${VW}" height="${hz}" fill="url(#${u}sky)"/><rect y="${hz}" width="${VW}" height="${VH - hz}" fill="url(#${u}sand)"/>`;
  const a = pr(-1.5, 0, 36), b = pr(1.5, 0, 36), c = pr(1.5, 0, -1.2), d = pr(-1.5, 0, -1.2);
  h += `<polygon points="${a.sx},${a.sy} ${b.sx},${b.sy} ${c.sx},${c.sy} ${d.sx},${d.sy}" fill="${pal.path}"/>`;
  for (let z = 0; z < 36; z += 2) for (const x of [-0.5, 0.5]) { const p = pr(x, 0, z); h += `<ellipse cx="${p.sx}" cy="${p.sy}" rx="${6 * p.k}" ry="${2.5 * p.k}" fill="${pal.divider}"/>`; }
  for (let z = 0; z < 36; z += 1) for (const x of [-1.5, 1.5]) { const p = pr(x, 0, z); h += `<ellipse cx="${p.sx}" cy="${p.sy}" rx="${9 * p.k}" ry="${4 * p.k}" fill="${pal.edge}"/>`; }
  h += '</svg>';
  const objs = [
    ['tumble', -1, 0.31, 13], ['fizz_throw', 0.6, 2.4, 11], ['pillow', 1, 0, 9], ['log', 0, 0, 7], ['pots', -1, 0, 4.5],
    ['shell_1', 1, 0.25, 6], ['shell_0', 1, 0.25, 4.6], ['shell_2', 1, 0.25, 3.2], ['shell_0', 0, 0.25, 2.2], ['pebble_0', 0, 0, 0],
  ];
  // anchor (in viewBox units) of the point that sits on (x,y,z): pebble feet (64,120), pots (64,154), log (80,74), pillow (64,88), shells/tumble centre, fizz carpet (96,130)
  const AN = { pebble_0: [64, 120], pots: [64, 154], log: [80, 74], pillow: [64, 88], tumble: [48, 48], fizz_throw: [96, 130], shell_0: [32, 34], shell_1: [32, 34], shell_2: [32, 34] };
  objs.forEach(([n, x, y, z]) => {
    const p = pr(x, y, z), w = W[n.split('_')[0]] * lw * p.k, s = w / VB[n][0], an = AN[n];
    if (n !== 'fizz_throw' && y === 0 || n === 'pebble_0') { const g = pr(x, 0, z); h += `<div style="position:absolute;left:${g.sx - w * 0.38}px;top:${g.sy - w * 0.06}px;width:${w * 0.76}px;height:${w * 0.12}px;border-radius:50%;background:#0003"></div>`; }
    if (n === 'fizz_throw') { // pillow held between the paws (renderer job) + pillow shadow on the path
      const hs = 72 / 128 * w / 1.5 * 1.5 * 0.5;
      h += `<div style="position:absolute;left:${p.sx - w * 0.3}px;top:${pr(x, 0, z).sy - w * 0.04}px;width:${w * 0.6}px;height:${w * 0.08}px;border-radius:50%;background:#0002"></div>`;
      h += `<img src="${uri(n)}" style="position:absolute;left:${p.sx - an[0] * s}px;top:${p.sy - an[1] * s}px" width="${w}">`;
      const pw = 72 * s; h += `<img src="${uri('pillow')}" style="position:absolute;left:${p.sx - 96 * s + (96 - 36) * s}px;top:${p.sy - 130 * s + 22 * s - pw * 0.375 * 0.9}px;transform:rotate(-8deg)" width="${pw}">`;
      return;
    }
    h += `<img src="${uri(n)}" style="position:absolute;left:${p.sx - an[0] * s}px;top:${p.sy - an[1] * s}px" width="${w}">`;
  });
  h += `<div style="position:absolute;left:14px;top:10px;display:flex;gap:4px">${img('heart', 28)}${img('heart', 28)}${img('heart_empty', 28)}</div>` +
    `<div style="position:absolute;right:14px;top:4px">${img('book', 44)}</div>`;
  if (night) h += `<div style="position:absolute;inset:0;background:#10164a;mix-blend-mode:multiply;opacity:0.35"></div>`;
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
  await shot(sheet('#f1d9a6', '#e8c98c'), 'characters_sheet_light.png', 1800);
  await shot(sheet('#26305e', '#18204a'), 'characters_sheet_dark.png', 1800);
  const day = { skyTop: '#9fd8ea', skyBot: '#fde9c0', sandFar: '#efd6a2', sandNear: '#e3bf7c', path: '#f4e0b4', divider: '#d8b67a', edge: '#c9a46a' };
  const nite = { skyTop: '#141c46', skyBot: '#3b4a8a', sandFar: '#5a5f8a', sandNear: '#6e6a8c', path: '#8a86a6', divider: '#6c6890', edge: '#5c5880' };
  await shot(`<div class="p" style="background:#555">${scene(day)}${scene(nite)}</div>`, 'characters_scene.png', 1960);
  await b.close();
})();
