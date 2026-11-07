// Visual QA screenshots (Nini's Sea Painting): title, gameplay (iPhone landscape / portrait, iPad portrait / landscape),
// brush in flight, the picture coming alive, a pearl + a fishy surprise, Talk time, session done (gallery).
//   node tests/visual/screens.js            → docs/reports/integration/*.png   (ONLY=ip-l to narrow; LANG=vi)
// Report-only: drives the page through SP.debug, never edits game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', '..', 'docs', 'reports', 'integration'); fs.mkdirSync(OUT, { recursive: true });
const VPS = {
  'ip-l': { viewport: { width: 852, height: 393 }, dpr: 3 }, 'ip-p': { viewport: { width: 393, height: 852 }, dpr: 3 },
  'pad-p': { viewport: { width: 820, height: 1180 }, dpr: 2 }, 'pad-l': { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const until = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
(async () => {
  const srv = await serve(), browser = await chromium.launch(), lang = process.env.LANG_GAME || process.env.LANG2 || 'en';
  const errors = [];
  for (const [vp, d] of Object.entries(VPS)) { if (process.env.ONLY && process.env.ONLY !== vp) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(vp + ' ' + m.text()); });
    page.on('pageerror', e => errors.push(vp + ' ' + String(e)));
    const shot = n => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`) });
    await page.goto(srv.url + `?mute=1&novoice=1&seed=5&age=4&lang=${lang}`);
    await until(page, () => window.SP && SP.debug && SP.debug.mode === 'title');
    await page.waitForTimeout(700); await shot('01-title');
    // chapter banner, then a colour round waiting for the shell
    await page.evaluate(() => { SP.debug.startGame(); const w = SP.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
    await page.waitForTimeout(700); await shot('02-banner');
    await page.evaluate(() => SP.debug.setSpeed(4));
    await until(page, () => SP.debug.world.interactive);
    await page.evaluate(() => SP.debug.setSpeed(1)); await page.waitForTimeout(500); await shot('03-paint');
    // the brush flies to the shell, then to the part (world taps)
    await page.evaluate(() => { const w = SP.debug.world, a = w.answer(); const h = w.shellHit(a.shell); w.tap(h.x, h.y); });
    await page.waitForTimeout(120); await shot('04-brush-fly');
    await page.waitForTimeout(700);
    await page.evaluate(() => { const w = SP.debug.world, a = w.answer(); if (a && a.part) { const p = w.partTap(a.part); w.tap(p.x, p.y); } });
    await page.waitForTimeout(330); await shot('05-fill');
    // the rest with the bot, catch 'alive'
    await page.evaluate(() => { SP.debug.setBot(true, 1); SP.debug.setSpeed(2); });
    await until(page, () => SP.debug.world.phase === 'alive' && SP.debug.world.phaseTime > 0.7);
    await page.evaluate(() => SP.debug.setSpeed(0.1)); await page.waitForTimeout(150); await shot('06-alive');
    // a pearl round (clam on the sand) and a fishy round
    for (const sp of ['pearl', 'fishy']) {
      await page.evaluate(sp => { SP.debug.setBot(false); const w = SP.debug.world; w.cfg.surpriseTypes = [sp]; w.levels[1] = 'animals'; w.startLevel(1); w._surpriseRound = 1; w.round = 1; SP.debug.setSpeed(6); }, sp);
      await until(page, () => SP.debug.world.state === 'round' && SP.debug.world.interactive);
      if (sp === 'fishy') await until(page, () => !!SP.debug.world.fishy && SP.debug.world.fishy.x > 350 && SP.debug.world.fishy.x < SP.debug.world.layout.W - 350).catch(() => {});
      await page.evaluate(() => { SP.debug.setSpeed(1); const c = SP.debug.world.clamHit && SP.debug.world.clamHit(); if (c) SP.debug.world.pointerDown(c.x, c.y); });
      await page.waitForTimeout(600); await shot('07-' + sp);
    }
    // Talk time
    await page.evaluate(() => { const w = SP.debug.world; w.levels[2] = 'shapes'; w.startLevel(2); SP.debug.setSpeed(6); });
    await until(page, () => SP.debug.world.state === 'round');
    await page.evaluate(() => { SP.debug.world._startTalk(); SP.debug.setSpeed(1); });
    await page.waitForTimeout(800); await shot('08-talk');
    // session done: bot at high speed
    await page.evaluate(() => { SP.debug.setBot(true, 0.85); SP.debug.setSpeed(40); SP.debug.startGame(); });
    await until(page, () => SP.debug.mode === 'done', null, 240000);
    await page.evaluate(() => SP.debug.setSpeed(1)); await page.waitForTimeout(1500); await shot('09-done');
    await ctx.close();
    console.log('screens', vp);
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no console errors', '→', OUT);
  process.exit(errors.length ? 1 : 0);
})();
