// Renders tools/band_sheet.html (RB.BandArt + animal stickers) → docs/art/band_sheet.png and docs/art/animals_sheet.png.
// Every drum kind/colour/shape, dots 1–10, numbers, letters, text, size, hit/glow, the big drum (hit 0 / 1), notes, the
// song sheet, number cards and the ghost hand at in-game size (S = 150) on wood #D9A86C, lawn #8CC47A and snow #EEF2F7,
// plus a 3x section; all animals (rest + sing) at S = 150 on stools, plus ~3x.
// Usage: node tools/band_sheet.js [--panels <dir>]   (--panels: also one PNG per background / zoom into <dir>)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1800, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const shoot = async (q, file) => {
    await p.goto('file://' + path.join(ROOT, 'tools/band_sheet.html') + q);
    await p.waitForFunction(() => document.title === 'done', null, { timeout: 20000 });
    const h = await p.evaluate(() => window.SHEET_H);
    await p.setViewportSize({ width: 1800, height: Math.min(12000, h) });
    await p.screenshot({ path: file, clip: { x: 0, y: 0, width: 1800, height: h } });
    console.log('wrote ' + path.relative(ROOT, file), 1800 + 'x' + h);
  };
  await shoot('?sheet=band', path.join(OUT, 'band_sheet.png'));
  await shoot('?sheet=animals', path.join(OUT, 'animals_sheet.png'));
  const i = process.argv.indexOf('--panels');
  if (i > 0) {
    const dir = path.resolve(process.argv[i + 1] || OUT);
    fs.mkdirSync(dir, { recursive: true });
    for (const s of ['band', 'animals']) {
      for (const bg of ['wood', 'lawn', 'snow']) await shoot(`?sheet=${s}&bg=${bg}`, path.join(dir, `${s}_${bg}.png`));
      await shoot(`?sheet=${s}&zoom=1`, path.join(dir, `${s}_zoom.png`));
    }
  }
  await b.close();
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
})();
