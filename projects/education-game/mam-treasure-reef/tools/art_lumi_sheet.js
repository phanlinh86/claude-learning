// Contact sheets for artist A's sprites (Lumi, seeds, pots, planter, sign, stars, icon).
// Usage: node tools/art_lumi_sheet.js [outDir]   (default docs/art)
// Writes lumi_sheet.png / items_sheet.png (in-game sizes on snow / grass / night navy),
// lumi_sheet_3x.png / items_sheet_3x.png (3x zoom on the same three backgrounds),
// lumi_frames.png (7 frames at 256 px with the feet-anchor cross).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const LUMI = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'].map(n => `characters/lumi_${n}.svg`);
const SEEDS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'plain'].map(n => `items/seed_${n}.svg`);
const BGS = ['#F6FAFF', '#9CC36E', '#1C2546'];
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const abs = (rel, x, y, w, h, extra = '') => img(rel, w, h, `position:absolute;left:${x}px;top:${y}px;${extra}`);
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;

// fake code-drawn flower: stem + 2 leaves + 6 petals + cream centre (stem base at (x, y))
function flowerSvg(color, h) {
  const w = h * 0.8, cx = w / 2, top = h * 0.3, r = h * 0.2;
  let petals = '';
  for (let i = 0; i < 6; i++) {
    const a = -90 + i * 60, rad = a * Math.PI / 180, px = cx + r * 0.62 * Math.cos(rad), py = top + r * 0.62 * Math.sin(rad);
    petals += `<ellipse cx="${px}" cy="${py}" rx="${r * 0.5}" ry="${r * 0.36}" fill="${color}" stroke="rgba(0,0,0,.3)" stroke-width="2" transform="rotate(${a} ${px} ${py})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="M${cx},${h} C${cx - 4},${h * 0.7} ${cx + 4},${h * 0.5} ${cx},${top}" stroke="#2A8343" stroke-width="7" fill="none"/>
    <path d="M${cx},${h} C${cx - 4},${h * 0.7} ${cx + 4},${h * 0.5} ${cx},${top}" stroke="#4CC26B" stroke-width="4" fill="none"/>
    <ellipse cx="${cx + 12}" cy="${h * 0.68}" rx="12" ry="5" fill="#4CC26B" stroke="#2A8343" stroke-width="2" transform="rotate(-25 ${cx + 12} ${h * 0.68})"/>
    <ellipse cx="${cx - 12}" cy="${h * 0.78}" rx="12" ry="5" fill="#4CC26B" stroke="#2A8343" stroke-width="2" transform="rotate(25 ${cx - 12} ${h * 0.78})"/>
    ${petals}<circle cx="${cx}" cy="${top}" r="${r * 0.34}" fill="#FFF4DC" stroke="#C9A877" stroke-width="2"/></svg>`;
}
const flowerImg = (color, h, x, y) => `<img src="data:image/svg+xml;base64,${Buffer.from(flowerSvg(color, h)).toString('base64')}" style="position:absolute;left:${x - h * 0.4}px;top:${y - h}px">`;

// pot of width w: back, a half-sunk seed + a flower stem rising from the soil, front; sign stuck in front
function pot(w, seed = 'items/seed_red.svg', color = '#E84A4A', sign = true) {
  const s = w / 256, h = 200 * s, pad = 110 * s;
  const soilY = pad + 48 * s, cx = w / 2;
  const ss = 0.42 * w;
  return `<div style="position:relative;width:${w}px;height:${h + pad}px">
    ${abs('items/pot_back.svg', 0, pad, w, h)}
    ${flowerImg(color, 140 * s, cx + 46 * s, soilY + 2 * s)}
    ${abs(seed, cx - 40 * s - ss / 2, soilY - ss * 0.42, ss, ss)}
    ${abs('items/pot_front.svg', 0, pad, w, h)}
    ${sign ? abs('items/sign.svg', cx - 0.275 * w, pad + h * 0.48, 0.55 * w, 0.55 * w * 112 / 128) : ''}</div>`;
}
function planter(w, n = 3) {
  const s = w / 512, h = 200 * s, pad = 120 * s, soilY = pad + 54 * s;
  let fl = '';
  for (let i = 0; i < n; i++) fl += flowerImg(['#FFD23F', '#9B6BE0', '#3C8DE8'][i % 3], 150 * s, w * (0.2 + 0.6 * i / (n - 1)), soilY + 2);
  return `<div style="position:relative;width:${w}px;height:${h + pad}px">
    ${abs('items/planter_back.svg', 0, pad, w, h)}${fl}
    ${abs('items/seed_orange.svg', w * 0.88 - 30 * s, soilY - 46 * s, 90 * s, 90 * s)}
    ${abs('items/planter_front.svg', 0, pad, w, h)}</div>`;
}

const lumiRow = (bg, sz) => panel(bg, LUMI.map(p => img(p, sz, sz)).join(''));
const itemsRow = (bg, k) => panel(bg, SEEDS.map(x => img(x, 110 * k, 110 * k)).join('') +
  img('ui/star.svg', 56 * k, 56 * k) + img('ui/star_empty.svg', 56 * k, 56 * k) +
  img('items/sign.svg', 126 * k, 110 * k) +
  img('icon.svg', 60 * k, 60 * k, 'border-radius:13px') + img('icon.svg', 120 * k, 120 * k, 'border-radius:26px')) +
  panel(bg, pot(220 * k) + pot(220 * k, 'items/seed_blue.svg', '#3C8DE8', false) + planter(420 * k, 3));

const frames = panel('#F6FAFF', LUMI.map(p => `<div style="position:relative">${img(p, 256, 256, 'outline:1px dashed rgba(0,0,0,.3)')}
  <div style="position:absolute;left:0;right:0;top:244px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:128px;border-left:1px solid red"></div></div>`).join(''));

const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-items:flex-end}</style>`;
(async () => {
  const b = await chromium.launch();
  const shots = [
    ['lumi_sheet.png', 1400, BGS.map(c => lumiRow(c, 180)).join('')],
    ['items_sheet.png', 1400, BGS.map(c => itemsRow(c, 1)).join('')],
    ['lumi_sheet_3x.png', 1900, BGS.map(c => panel(c, LUMI.slice(0, 4).map(x => img(x, 440, 440)).join('')) +
      panel(c, LUMI.slice(4).map(x => img(x, 440, 440)).join(''))).join('')],
    ['items_sheet_3x.png', 2000, BGS.map(c => panel(c, SEEDS.map(x => img(x, 330, 330)).join(''))).join('') +
      BGS.map(c => panel(c, pot(660) + img('items/sign.svg', 384, 336) + img('ui/star.svg', 168, 168) + img('ui/star_empty.svg', 168, 168))).join('') +
      panel(BGS[2], planter(1260, 3)) + panel(BGS[0], img('icon.svg', 512, 512, 'border-radius:110px'))],
    ['lumi_frames.png', 1900, frames],
  ];
  for (const [name, width, body] of shots) {
    const p = await b.newPage({ viewport: { width, height: 400 } });
    await p.setContent(`<html><body>${css}${body}</body></html>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, name), fullPage: true });
    await p.close();
    console.log(path.join(OUT, name));
  }
  await b.close();
})();
