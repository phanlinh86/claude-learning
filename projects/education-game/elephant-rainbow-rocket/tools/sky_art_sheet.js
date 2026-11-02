// Renders tools/sky_art_sheet.html (RR.SkyArt test page) to docs/art/sky_art_sheet.png (#islands) and
// docs/art/sky_art_sheet_2.png (#tokens: tokens, effects, rocket composite). Usage: node tools/sky_art_sheet.js [outDir]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const OUT = process.argv[2] || path.join(__dirname, '..', 'docs', 'art');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [name, hash] of [['sky_art_sheet.png', '#islands'], ['sky_art_sheet_2.png', '#tokens']]) {
    const p = await b.newPage({ viewport: { width: 1960, height: 900 } });
    p.on('console', m => console.log('[sheet]', m.text()));
    p.on('pageerror', e => console.log('[sheet error]', e.message));
    await p.goto('file://' + path.join(__dirname, 'sky_art_sheet.html') + hash);
    await p.waitForFunction(() => document.title === 'done', null, { timeout: 20000 });
    await p.locator('#c').screenshot({ path: path.join(OUT, name) });
    await p.close();
    console.log(path.join(OUT, name));
  }
  await b.close();
})();
