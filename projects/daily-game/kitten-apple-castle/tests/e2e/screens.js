// Screenshot tour for visual review: title, every time of day mid-play (bot at ×8, night with lanterns), Granny Boo's
// goal show, game over, Change Pictures and Settings, at 960×540 landscape and 390×844 portrait. → tests/out/shot_*.png
// Run: node tests/e2e/screens.js
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const errs = [];
  for (const [tag, vp, mobile] of [['land', { width: 960, height: 540 }, false], ['port', { width: 390, height: 844 }, true]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(tag + ': ' + m.text()); });
    p.on('pageerror', e => errs.push(tag + ': ' + e));
    await p.goto(GAME + '?mute=1&seed=7');
    await p.waitForFunction(() => window.AC && AC.debug && AC.debug.mode === 'title', null, { timeout: 15000 });
    await sleep(2500);
    await p.screenshot({ path: `${OUT}/shot_${tag}_title.png` });
    await p.evaluate(() => { AC.Game.startGame(); AC.debug.setBot(true, 1); });
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { if (l) AC.debug.gotoLevel(l); AC.debug.world.hearts = 99; AC.debug.setSpeed(8); }, lv);
      await p.waitForFunction(() => AC.debug.world.placed >= 9, null, { timeout: 40000 }).catch(() => errs.push(tag + ': zone ' + lv + ' slow'));
      await p.evaluate(() => AC.debug.setSpeed(1));
      await sleep(900);
      await p.screenshot({ path: `${OUT}/shot_${tag}_zone${lv}.png` });
    }
    // goal show on Night: Granny Boo waving beside the top
    await p.evaluate(() => { const w = AC.debug.world; w.goal = w.tower.list.length + 1; AC.debug.setSpeed(2); });
    await p.waitForFunction(() => { const w = AC.debug.world; return w.ghost && w.ghost.wave; }, null, { timeout: 20000 }).catch(() => errs.push(tag + ': no ghost wave'));
    await p.evaluate(() => AC.debug.setSpeed(1));
    await sleep(150);
    await p.screenshot({ path: `${OUT}/shot_${tag}_goal.png` });
    // game over
    await p.evaluate(() => { AC.debug.setBot(true, 0); AC.debug.world.hearts = 1; AC.debug.setSpeed(8); });
    await p.waitForFunction(() => { const w = AC.debug.world; if (w.hearts > 1) w.hearts = 1; return AC.debug.mode === 'over'; }, null, { timeout: 60000, polling: 100 }).catch(() => errs.push(tag + ': no game over'));
    await p.evaluate(() => AC.debug.setSpeed(1));
    await sleep(900);
    await p.screenshot({ path: `${OUT}/shot_${tag}_over.png` });
    for (const s of ['scrCustom', 'scrSettings', 'scrHow']) {
      await p.evaluate(s => AC.UI.open(s, 'scrTitle'), s); await sleep(700);
      await p.screenshot({ path: `${OUT}/shot_${tag}_${s}.png` });
    }
    await ctx.close();
  }
  await b.close();
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'screens ok, no console errors');
  process.exit(errs.length ? 1 : 0);
})();
