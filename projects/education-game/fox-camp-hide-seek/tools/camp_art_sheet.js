// Renders tools/camp_art_sheet.html (FC.CampArt test page) to docs/art/camp_art_sheet.png.
// Usage: node tools/camp_art_sheet.js [outDir]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const OUT = process.argv[2] || path.join(__dirname, '..', 'docs', 'art');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1960, height: 900 } });
  p.on('console', m => console.log('[sheet]', m.text()));
  p.on('pageerror', e => console.log('[sheet error]', e.message));
  await p.goto('file://' + path.join(__dirname, 'camp_art_sheet.html'));
  await p.waitForFunction(() => document.title === 'done', null, { timeout: 20000 });
  await p.locator('#c').screenshot({ path: path.join(OUT, 'camp_art_sheet.png') });
  await b.close();
  console.log(path.join(OUT, 'camp_art_sheet.png'));
})();
