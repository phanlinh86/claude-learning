#!/usr/bin/env node
// Tupi's Bakery Delivery — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_tupi.py && node tools/tupi_sheet.js
//   → docs/art/tupi_frames.png   every seated frame at in-game size (150 px = 0.5×) on the tablecloth #F6ECD8, the road
//                                #8C5E3F and dark #3A4048, then at 3× (1.5×) with marks: seat (red), mouth (magenta),
//                                trunkTip on spray / trunkHold on hand (blue), the box dashed, the cart front line (y 198)
//     docs/art/tupi_cart.png     "Tupi in her cart" composed (cart_back → Tupi → cupcake → cart_front → wheels) facing
//                                right and mirrored, at in-game size (cart 180 px wide) on the three backgrounds and at 3×,
//                                plus every mood in the cart at in-game size
//     docs/art/tupi_extras.png   cart halves, wheel, mouse(+wave), bird(+sing), title, icon at 512 / 180 / 60
// Prints JSON: the union bbox of the seated frames, the torso-region pixel diff vs idle (must be 0), and the composed bbox.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game', 'assets', 'default');
const CH = path.join(A, 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
require(path.join(ROOT, 'game', 'js', 'tupi_points.js'));
const TP = globalThis.BD.TUPI_POINTS;
const FR = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'honk', 'spray', 'wave', 'giggle', 'hand'];
const BG = { cloth: '#F6ECD8', road: '#8C5E3F', dark: '#3A4048' };
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
const ch = n => uri(path.join(CH, n + '.svg'));
const CUP = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M12,36 L52,36 L46,62 L18,62 Z" fill="#D29A5F" stroke="#7A4C27" stroke-width="3" stroke-linejoin="round"/>' +
  '<ellipse cx="32" cy="32" rx="24" ry="10" fill="#E84A4A" stroke="#A8282E" stroke-width="3"/><ellipse cx="32" cy="22" rx="16" ry="9" fill="#E84A4A" stroke="#A8282E" stroke-width="3"/><circle cx="32" cy="10" r="6" fill="#A8282E"/></svg>').toString('base64');

const abs = (x, y, w, h, extra = '') => `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}`;
function cross(x, y, k, col = 'red') {
  const s = 8;
  return `<div style="${abs(x * k - s, y * k - 1, 2 * s, 2, 'background:' + col)}"></div><div style="${abs(x * k - 1, y * k - s, 2, 2 * s, 'background:' + col)}"></div>`;
}
function cell(src, w, h, marks = '') {
  return `<div style="position:relative;width:${w}px;height:${h}px;outline:1px dashed rgba(0,0,0,.12)"><img src="${src}" style="width:${w}px;height:${h}px;display:block">${marks}</div>`;
}
function row(bg, cells, pad = 12) {
  return `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:${pad}px;padding:${pad}px;background:${bg}">${cells.join('')}</div>`;
}
// composed cart: k = px per cart unit. Box spans cart x -10..350, y -90..240
function composed(frame, k, flip, cargo = true) {
  const X0 = -10, Y0 = -90, W = 360, H = 330;
  const off = [TP.cart.seat[0] - TP.seat[0], TP.cart.seat[1] - TP.seat[1]];
  const im = (src, x, y, w, h) => `<img src="${src}" style="${abs((x - X0) * k, (y - Y0) * k, w * k, h * k)}">`;
  let h = '';
  h += `<div style="${abs((TP.cart.ground[0] - 150 - X0) * k, (TP.cart.ground[1] - 10 - Y0) * k, 300 * k, 20 * k, 'border-radius:50%;background:rgba(40,20,10,.25)')}"></div>`;
  h += im(ch('cart_back'), 0, 0, 340, 240);
  h += im(ch('tupi_' + frame), off[0], off[1], 300, 300);
  if (cargo) h += im(CUP, TP.cart.tray[0] - 32, TP.cart.tray[1] - 64, 64, 64);
  h += im(ch('cart_front'), 0, 0, 340, 240);
  for (const [x, y, r] of TP.cart.wheels) h += im(ch('wheel'), x - r * 40 / 38, y - r * 40 / 38, 80 * r / 38, 80 * r / 38);
  if (frame === 'spray') h += cross(TP.trunkTip[0] + off[0] - X0, TP.trunkTip[1] + off[1] - Y0, k, '#06f');
  if (frame === 'hand') h += `<img src="${CUP}" style="${abs((TP.trunkHold[0] + off[0] - 24 - X0) * k, (TP.trunkHold[1] + off[1] - 48 - Y0) * k, 48 * k, 48 * k)}">`;
  return `<div style="position:relative;width:${W * k}px;height:${H * k}px;${flip ? 'transform:scaleX(-1)' : ''}">${h}</div>`;
}
async function shot(page, html, name, width) {
  await page.setContent(`<html><body style="margin:0;display:inline-block;width:${width}px">${html}</body></html>`);
  await page.waitForTimeout(300);
  await (await page.$('body')).screenshot({ path: path.join(OUT, name) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 2600, height: 1400 } });
  const srcs = FR.map(p => ch('tupi_' + p));

  // ---- frames
  const k3 = 1.5;
  const marks = (p) => {
    let m = cross(TP.seat[0], TP.seat[1], k3) + cross(TP.mouth[0], TP.mouth[1], k3, '#c0f');
    if (p === 'spray') m += cross(TP.trunkTip[0], TP.trunkTip[1], k3, '#06f');
    if (p === 'hand') m += cross(TP.trunkHold[0], TP.trunkHold[1], k3, '#06f');
    const [x0, y0, x1, y1] = TP.box;
    m += `<div style="${abs(x0 * k3, y0 * k3, (x1 - x0) * k3, (y1 - y0) * k3, 'border:2px dashed rgba(0,0,0,.35);box-sizing:border-box')}"></div>`;
    const fy = 116 - (TP.cart.seat[1] - TP.seat[1]);
    m += `<div style="${abs(0, fy * k3, 300 * k3, 2, 'background:rgba(0,120,0,.5)')}"></div>`;
    return m;
  };
  const small = ['cloth', 'road', 'dark'].map(k => row(BG[k], srcs.map(s => cell(s, 150, 150)), 6)).join('');
  const big = row(BG.cloth, FR.map((p, i) => cell(srcs[i], 300 * k3, 300 * k3, marks(p))));
  await shot(page, small + big, 'tupi_frames.png', 1950);

  // ---- composed
  const kIn = 180 / 340;
  let html = ['cloth', 'road', 'dark'].map(k => row(BG[k], [composed('idle', kIn, false), composed('idle', kIn, true),
    composed('happy', kIn, false), composed('hand', kIn, true)])).join('');
  html += row(BG.cloth, [composed('idle', kIn * 3, false), composed('spray', kIn * 3, true)]);
  html += row(BG.road, FR.map(p => composed(p, kIn, false)), 4);
  await shot(page, html, 'tupi_cart.png', 1950);

  // ---- metrics
  const res = await page.evaluate(async ({ list, idle }) => {
    const load = async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 300, 300); return x.getImageData(0, 0, 300, 300).data; };
    const base = await load(idle);
    const out = {}; const U = [300, 300, 0, 0];
    for (const [name, src] of list) {
      const d = await load(src);
      let diff = 0;
      for (let y = 214; y < 256; y++) for (let x = 84; x < 196; x++) {
        const i = (y * 300 + x) * 4;
        if (Math.abs(d[i] - base[i]) + Math.abs(d[i + 1] - base[i + 1]) + Math.abs(d[i + 2] - base[i + 2]) + Math.abs(d[i + 3] - base[i + 3]) > 8) diff++;
      }
      let y1 = 0, x0 = 300, x1 = 0, y0 = 300;
      for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) if (d[(y * 300 + x) * 4 + 3] > 8) { y1 = Math.max(y1, y); y0 = Math.min(y0, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      out[name] = { torsoDiffPx: diff, bbox: [x0, y0, x1 + 1, y1 + 1] };
      U[0] = Math.min(U[0], x0); U[1] = Math.min(U[1], y0); U[2] = Math.max(U[2], x1 + 1); U[3] = Math.max(U[3], y1 + 1);
    }
    out.union = U;
    return out;
  }, { list: FR.map((p, i) => [p, srcs[i]]), idle: srcs[0] });
  console.log(JSON.stringify(res));

  // ---- extras
  const sz = (n, w, h, k) => cell(ch(n), w * k, h * k);
  const ex = (k) => [sz('cart_back', 340, 240, k), sz('cart_front', 340, 240, k), sz('wheel', 80, 80, k), sz('mouse', 140, 120, k),
    sz('mouse_wave', 140, 120, k), sz('bird', 120, 100, k), sz('bird_sing', 120, 100, k)];
  const icon = uri(path.join(A, 'icon.svg'));
  html = ['cloth', 'road', 'dark'].map(k => row(BG[k], ex(0.6))).join('') + row(BG.cloth, ex(1.6)) +
    row('#F2DFC4', [cell(ch('tupi_title'), 150, 180), cell(ch('tupi_title'), 450, 540), cell(icon, 512, 512), cell(icon, 180, 180), cell(icon, 60, 60)]);
  await shot(page, html, 'tupi_extras.png', 1950);
  await b.close();
})();
