// Renders tools/block_sheet.html (JT.BlockArt) → docs/art/blocks_sheet.png (--panels: also blocks_sheet_<green|light|night>.png).
// Every block kind and value at S = 112 and S = 84 on jungle green, light and night; glow/lift states; the animal
// stickers at 128 and 60 px; ghost hand, flower bloom stages, leaf pad, glow.
// Usage: node tools/block_sheet.js [--panels]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const shoot = async (q, file) => {
    await p.goto('file://' + path.join(ROOT, 'tools/block_sheet.html') + q);
    await p.waitForFunction(() => document.title === 'done', null, { timeout: 15000 });
    const h = await p.evaluate(() => window.SHEET_H);
    await p.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: 1600, height: h }, fullPage: true });
    console.log('wrote docs/art/' + file, 1600 + 'x' + h);
  };
  await shoot('', 'blocks_sheet.png');
  // per-panel sheets (easier to inspect) only on request: node tools/block_sheet.js --panels
  if (process.argv.includes('--panels'))
    for (const n of ['green', 'light', 'night']) await shoot('?panel=' + n, 'blocks_sheet_' + n + '.png');
  await b.close();
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
})();
