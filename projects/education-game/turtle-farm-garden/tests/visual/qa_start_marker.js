// Visual QA helper: the trace step BEFORE the first press (start marker + all guide dots) for a few topics, iPhone portrait.
//   OUT=dir node tests/visual/qa_start_marker.js
const { chromium } = require('playwright'); const path = require('path'); const serve = require('../e2e/serve');
const OUT = process.env.OUT || path.join(__dirname, '..', 'out', 'visual_qa');
(async () => {
  const srv = await serve(), b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
  await p.goto(srv.url + '?mute=1&novoice=1&seed=5&age=4');
  await p.waitForFunction(() => window.FT && FT.debug && FT.debug.mode === 'title');
  await p.addStyleTag({ content: ':root{--sa-t:59px!important;--sa-b:34px!important}' });
  await p.evaluate(() => { window.dispatchEvent(new Event('resize')); FT.debug.startGame(); });
  for (const [topic, age] of [['colors', 4], ['animals', 4], ['letters', 5], ['shapes', 3]]) {
    await p.evaluate(({ topic, age }) => { const w = FT.debug.world; w.setAge(age); w.age = age; w.cfg.surpriseTypes = []; w.levels[1] = topic; w.startLevel(1); FT.debug.setSpeed(6); }, { topic, age });
    for (let k = 0; k < 5; k++) {
      await p.waitForFunction(() => FT.debug.world.interactive, null, { timeout: 20000 });
      if (await p.evaluate(() => FT.debug.world.stepInfo.mode) === 'trace') break;
      await p.evaluate(() => { const w = FT.debug.world, a = w.answer(); if (a && a.choice) { const h = w.choiceHit(a.choice); w.tap(h.x, h.y); } });
      await p.waitForTimeout(150);
    }
    await p.evaluate(() => FT.debug.setSpeed(1)); await p.waitForTimeout(900);
    await p.screenshot({ path: path.join(OUT, `ip-p-start-${topic}.jpg`), type: 'jpeg', quality: 75 });
  }
  await b.close(); srv.close();
})();
