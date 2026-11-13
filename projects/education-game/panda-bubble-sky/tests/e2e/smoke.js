// Smoke test (Bao's Bubble Sky): boot on iPhone portrait + landscape with no console errors, start a colour round, ONE REAL
// touch tap (page.touchscreen.tap) on a target bubble at PB.debug.bubbleScreen → 'right' + 'pop' events (the bot bypasses the
// input layer, so this is the proof that fingers work), then a fast bot session (?speed=8&bot=1&autostart=1&mute=1) until the
// session-done screen.
//   node tests/e2e/smoke.js        (ONLY=iphone-portrait to run one device)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, ages: [4] },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, ages: [3] }
];
const evCount = (page, type) => page.evaluate(t => PB.debug.events.filter(e => e.type === t).length, type);
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let fails = 0;
  for (const d of DEVICES) {
    if (process.env.ONLY && d.name !== process.env.ONLY) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    page.on('crash', () => errors.push('PAGE CRASH'));
    try {
      await page.goto(srv.url + '?mute=1&seed=3&age=4');
      await page.waitForFunction(() => window.PB && PB.debug && PB.debug.mode === 'title', null, { timeout: 15000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
      const missing = await page.evaluate(() => PB.Assets.missing.slice());
      if (missing.length) errors.push('assets missing: ' + missing.join(', '));
      await page.evaluate(() => { PB.debug.startGame(); const w = PB.debug.world; w.levels[0] = 'colors'; w.startLevel(0); PB.debug.setSpeed(4); });
      await page.waitForFunction(() => PB.debug.world.interactive && PB.debug.answer(), null, { timeout: 20000 });
      await page.evaluate(() => PB.debug.setSpeed(1));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, d.name + '-1-play.png') });
      // a real touch tap on a target bubble (where it floats right now)
      const a1 = await page.evaluate(() => { const a = PB.debug.answer(); return { a, at: PB.debug.bubbleScreen(a.bubble) }; });
      const right0 = await evCount(page, 'right'), pop0 = await evCount(page, 'pop');
      await page.touchscreen.tap(Math.round(a1.at.x), Math.round(a1.at.y));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, d.name + '-2-right.png') });
      if (await evCount(page, 'right') <= right0) errors.push('real tap on the target bubble gave no right event: ' + JSON.stringify(a1));
      if (await evCount(page, 'pop') <= pop0) errors.push('real tap on the target bubble gave no pop');
      try {
        await page.waitForFunction(() => PB.debug.events.some(e => e.type === 'paint'), null, { timeout: 8000 });
      } catch (e) { errors.push('the freed thing never painted the rainbow'); }
      // fast bot sessions
      for (const age of d.ages) {
        await page.goto(srv.url + `?mute=1&seed=${10 + age}&age=${age}&speed=8&bot=1&autostart=1`);
        try {
          await page.waitForFunction(() => window.PB && PB.debug && PB.debug.mode === 'done', null, { timeout: 300000, polling: 250 });
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(OUT, `${d.name}-9-done-age${age}.png`) });
          const res = await page.evaluate(() => PB.debug.stats);
          console.log(`  ${d.name} age ${age}: rounds ${res.rounds}, right ${res.correct}, wrong ${res.wrong}, pops ${res.pops}, paints ${res.paints}, rainbows ${res.rainbows}, whooshes ${res.whooshes}, hints ${res.hints}, talks ${res.talks}, surprises ${res.surprises}`);
          if (!(res.rounds >= 12 && res.correct >= 12 && res.rainbows >= 12 && res.paints >= res.rainbows && res.talks >= 4)) errors.push('bot session too short: ' + JSON.stringify(res));
        } catch (e) { errors.push(`age ${age} session did not finish: ` + JSON.stringify(await page.evaluate(() => PB.debug.getState()))); }
      }
    } catch (e) { errors.push('exception: ' + (e && e.message)); }
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
