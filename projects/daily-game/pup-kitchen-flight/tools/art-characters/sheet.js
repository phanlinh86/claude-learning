// Contact sheet + pup frame diff for the character art.
// Usage: node tools/art-characters/sheet.js   -> tools/art-characters/out/*.png
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ASSETS = path.resolve(__dirname, '../../game/assets/default');
const OUT = path.resolve(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const SPRITES = [
  ['pup_0', 120, 110], ['pup_1', 120, 110], ['pup_2', 120, 110], ['pup_hurt', 120, 110], ['pup_sleep', 120, 110],
  ['leaf_mint', 44, 44], ['leaf_basil', 44, 44], ['leaf_bay', 44, 44],
  ['hang_ladle', 120, 200], ['hang_whisk', 120, 200], ['hang_pan', 120, 200],
  ['stack_pot', 150, 90], ['stack_mug', 110, 90], ['stack_jar', 100, 120], ['stack_bowl', 150, 70],
  ['kettle', 140, 120], ['battery_full', 48, 30], ['battery_empty', 48, 30], ['icon', 128, 128],
];
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ASSETS, n + '.svg')).toString('base64');

function sheetHtml(bg, scale) {
  const cells = SPRITES.map(([n, w, h]) =>
    `<div class="c"><img src="${uri(n)}" style="width:${w * scale}px;height:${h * scale}px"><span>${n}</span></div>`).join('');
  return `<html><body style="margin:0;background:${bg};font:12px sans-serif;color:${bg === '#1d2240' ? '#ccd' : '#553'}">
  <style>.c{display:inline-flex;flex-direction:column;align-items:center;margin:8px;vertical-align:bottom;outline:1px dashed rgba(128,128,128,.35)}
  img{display:block}</style><div style="padding:8px;width:${scale === 1 ? 1100 : 2200}px">${cells}</div></body></html>`;
}

function stripHtml() {
  const row = (bg, s) => `<div style="background:${bg};padding:10px;display:flex;gap:16px;align-items:center">` +
    ['pup_0', 'pup_1', 'pup_2', 'pup_hurt', 'pup_sleep'].map(n =>
      `<img src="${uri(n)}" style="width:${120 * s}px;height:${110 * s}px">`).join('') +
    ['pup_0', 'leaf_mint', 'leaf_basil', 'leaf_bay'].map(n =>
      `<img src="${uri(n)}" style="width:${n.startsWith('pup') ? 60 : 44}px">`).join('') + '</div>';
  return `<html><body style="margin:0">${row('#f6ead2', 3)}${row('#1d2240', 3)}</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const shots = [['sheet_cream_1x', '#f6ead2', 1], ['sheet_navy_1x', '#1d2240', 1], ['sheet_cream_4x', '#f6ead2', 4], ['sheet_navy_4x', '#1d2240', 4]];
  for (const [name, bg, s] of shots) {
    await page.setContent(sheetHtml(bg, s));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  }
  await page.setContent(stripHtml());
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'pup_strip.png'), fullPage: true });

  // Pixel diff of the three pup frames outside the propeller band (y < 26).
  await page.setContent('<html><body></body></html>');
  const res = await page.evaluate(async (srcs) => {
    const S = 4, W = 120 * S, H = 110 * S;
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const data = [];
    for (const s of srcs) {
      const img = await load(s);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
      data.push(x.getImageData(0, 0, W, H).data);
    }
    const out = [];
    for (let k = 1; k < data.length; k++) {
      let diff = 0, minY = H;
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        const i = (y * W + xx) * 4;
        let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(data[0][i + c] - data[k][i + c]));
        if (d > 0) { if (y >= 26 * S) diff++; minY = Math.min(minY, y); }
      }
      out.push({ frame: k, diffPixelsBelowY26: diff, maxDiffY: null, firstDiffRow: minY / S });
    }
    return out;
  }, ['pup_0', 'pup_1', 'pup_2'].map(uri));
  console.log(JSON.stringify(res));
  await browser.close();
})();
