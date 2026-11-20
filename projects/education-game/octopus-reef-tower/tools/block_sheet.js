// Renders tools/block_sheet.html (RT.BlockArt shell blocks) → docs/art/blocks_sheet.png, and the sea-animal sticker sheet
// (tools/art_animals_sheet.js) → docs/art/animals_sheet.png.
// Blocks at age-4 size (LW 139 × LH 99) and 3x on sand, teal water and deep-sea dark: every kind, all colours, shapes,
// dots 1–10, numbers, animals, letters, text, parity, big/small, a stacked tower on the shell tray with pearls, pearl
// lit/out states (1x + 3x), bubbles, a block in its lift bubble, glow/lift, fish confetti, tapping ghost hand.
// --panels also writes blocks_sheet_<sand|water|dark>.png.
// Usage: node tools/block_sheet.js [--panels]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1800, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const shoot = async (q, file) => {
    await p.goto('file://' + path.join(ROOT, 'tools/block_sheet.html') + q);
    await p.waitForFunction(() => document.title === 'done', null, { timeout: 15000 });
    const h = await p.evaluate(() => window.SHEET_H);
    await p.setViewportSize({ width: 1800, height: Math.ceil(h) });
    await p.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: 1800, height: h } });
    console.log('wrote docs/art/' + file, 1800 + 'x' + h);
  };
  await shoot('', 'blocks_sheet.png');
  if (process.argv.includes('--panels'))
    for (const n of ['sand', 'water', 'dark']) await shoot('?panel=' + n, 'blocks_sheet_' + n + '.png');
  await b.close();
  // the missing 'zebra' sticker is deliberate (placeholder test) → ignore its 404
  const real = errs.filter(e => !/animal_zebra|ERR_FILE_NOT_FOUND/.test(e));
  if (real.length) { console.error(real.join('\n')); process.exit(1); }
  require('child_process').execFileSync('node', [path.join(__dirname, 'art_animals_sheet.js')], { stdio: 'inherit' });
})();
