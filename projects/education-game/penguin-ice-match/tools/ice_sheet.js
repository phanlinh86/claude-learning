#!/usr/bin/env node
// Contact sheets for IM.IceArt (tools/ice_sheet.html) → docs/art/ice_blocks_sheet.png + ice_rewards_sheet.png.
// Run from the game folder:  node tools/ice_sheet.js [--dpr 2]
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'docs', 'art');
const dpr = +(process.argv.find((a, i, A) => A[i - 1] === '--dpr') || 1);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [name, hash] of [['ice_blocks_sheet', '#blocks'], ['ice_rewards_sheet', '#rewards']]) {
    const q = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: dpr });
    q.on('console', m => console.log('[sheet]', m.text()));
    q.on('pageerror', e => { console.log('[sheet error]', e.message); process.exitCode = 1; });
    await q.goto('file://' + path.join(__dirname, 'ice_sheet.html') + hash);
    await q.waitForFunction(() => document.title === 'done', null, { timeout: 20000 });
    const file = path.join(OUT, name + (dpr > 1 ? '_' + dpr + 'x' : '') + '.png');
    await q.locator('#c').screenshot({ path: file });
    await q.close();
    console.log(file);
  }
  await b.close();
})();
