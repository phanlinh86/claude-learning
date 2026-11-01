// Contact sheets for artist A's sprites (Miu, sign, stars, icon).
// Usage: node tools/art_miu_sheet.js [outDir]   (default docs/art)
// Writes miu_sheet.png / items_sheet.png (in-game sizes on light sky / grass / night navy),
// miu_sheet_3x.png (3x zoom on the same three backgrounds) and miu_frames.png (7 frames at 256 px
// with the feet-anchor cross, to check that the bodies line up) and balloons_sheet.png (tools/balloon_sheet.html).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const MIU = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'].map(n => `characters/miu_${n}.svg`);
const BGS = ['#DDF1FF', '#9CCB7C', '#1C2546'];
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;

// in game Miu is drawn 190-200 px tall: the 256 viewBox is scaled so the drawn height (~240/256) is 190
const MIU_PX = Math.round(190 * 256 / 240);
const miuRow = (bg, sz) => panel(bg, MIU.map(p => img(p, sz, sz)).join(''));
// sign with a fake red colour swatch in its blank area (x 12-116, y 8-76)
const signWithSwatch = (w) => `<div style="position:relative;width:${w}px;height:${w * 112 / 128}px">${img('items/sign.svg', w, w * 112 / 128)}
  <div style="position:absolute;left:${w * 40 / 128}px;top:${w * 18 / 128}px;width:${w * 48 / 128}px;height:${w * 48 / 128}px;border-radius:50%;background:#E84A4A;border:${w * 3 / 128}px solid #A8282E"></div></div>`;
const itemsRow = (bg, k) => panel(bg,
  img('ui/star.svg', 28 * k, 28 * k) + img('ui/star_empty.svg', 28 * k, 28 * k) +
  img('ui/star.svg', 56 * k, 56 * k) + img('ui/star_empty.svg', 56 * k, 56 * k) +
  img('ui/star.svg', 120 * k, 120 * k) + img('ui/star_empty.svg', 120 * k, 120 * k) +
  img('items/sign.svg', 150 * k, 150 * k * 112 / 128) + signWithSwatch(150 * k) +
  img('icon.svg', 60 * k, 60 * k, 'border-radius:13px') + img('icon.svg', 180 * k, 180 * k, 'border-radius:40px'));

const frames = panel('#F6FAFF', MIU.map(p => `<div style="position:relative">${img(p, 256, 256, 'outline:1px dashed rgba(0,0,0,.3)')}
  <div style="position:absolute;left:0;right:0;top:244px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:128px;border-left:1px solid red"></div></div>`).join(''));

const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-items:flex-end}</style>`;
(async () => {
  const b = await chromium.launch();
  const shots = [
    ['miu_sheet.png', 1560, BGS.map(c => miuRow(c, MIU_PX)).join('')],
    ['items_sheet.png', 1400, BGS.map(c => itemsRow(c, 1)).join('') + panel(BGS[0], itemsRow(BGS[0], 2.4)) +
      panel('#FFFFFF', img('icon.svg', 512, 512, 'border-radius:110px'))],
    ['miu_sheet_3x.png', 1900, BGS.map(c => panel(c, MIU.slice(0, 4).map(x => img(x, 440, 440)).join('')) +
      panel(c, MIU.slice(4).map(x => img(x, 440, 440)).join(''))).join('')],
    ['miu_frames.png', 1900, frames],
  ];
  for (const [name, width, body] of shots) {
    const p = await b.newPage({ viewport: { width, height: 400 } });
    await p.setContent(`<html><body>${css}${body}</body></html>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, name), fullPage: true });
    await p.close();
    console.log(path.join(OUT, name));
  }
  // balloon sheet (KB.BalloonArt test page)
  const p = await b.newPage({ viewport: { width: 1240, height: 800 } });
  await p.goto('file://' + path.join(__dirname, 'balloon_sheet.html'));
  await p.waitForFunction(() => document.title === 'done');
  await p.locator('#c').screenshot({ path: path.join(OUT, 'balloons_sheet.png') });
  console.log(path.join(OUT, 'balloons_sheet.png'));
  await b.close();
})();
