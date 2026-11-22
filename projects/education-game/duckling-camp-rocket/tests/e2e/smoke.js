// Smoke test (Mimi's Splash Rocket): boot on iPhone portrait + landscape with no console errors, start a colour round, ONE REAL
// touch tap (page.touchscreen.tap) on the right mat at DK.debug.matScreen(answer) → 'right', then 3 REAL touch taps for the
// pump at DK.debug.pumpScreen() → 'pump' × 3 (none auto), 'launch', 'land' (the bot bypasses the input layer, so this is the proof
// that fingers work), then a fast bot session (?speed=8&bot=1&autostart=1&mute=1) until the session-done screen.
//   node tests/e2e/smoke.js        (ONLY=iphone-portrait to run one device)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, ages: [4] },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, ages: [3] }
];
const evCount = (page, type) => page.evaluate(t => DK.debug.events.filter(e => e.type === t).length, type);
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let fails = 0;
  for (const d of DEVICES) {
    if (process.env.ONLY && d.name !== process.env.ONLY) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    // every world event with its fields (DK.debug.events keeps type + id only)
    await ctx.addInitScript(() => { window.__ev = []; });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    page.on('crash', () => errors.push('PAGE CRASH'));
    try {
      await page.goto(srv.url + '?mute=1&seed=3&age=4');
      await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title', null, { timeout: 15000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
      const missing = await page.evaluate(() => DK.Assets.missing.slice());
      if (missing.length) errors.push('assets missing: ' + missing.join(', '));
      await page.evaluate(() => {
        DK.debug.startGame(); const w = DK.debug.world; w.levels[0] = 'colors'; w.startLevel(0); DK.debug.setSpeed(4);
        const o = w._emit; w._emit = function (e) { window.__ev.push(Object.assign({}, e)); return o.call(this, e); };
      });
      await page.waitForFunction(() => { const w = DK.debug.world, a = DK.debug.answer(); return w.interactive && w.phase === 'play' && a && a.id != null && DK.debug.matScreen(a.id) && w.phaseTime > 0.8; }, null, { timeout: 20000 });
      await page.evaluate(() => DK.debug.setSpeed(1));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, d.name + '-1-play.png') });
      // a real touch tap on the right mat (where its hit circle is right now)
      const a1 = await page.evaluate(() => { const a = DK.debug.answer(); return { id: a.id, at: DK.debug.matScreen(a.id) }; });
      const right0 = await evCount(page, 'right'), land0 = await evCount(page, 'land');
      await page.touchscreen.tap(Math.round(a1.at.x), Math.round(a1.at.y));
      await page.waitForTimeout(200);
      if (await evCount(page, 'right') <= right0) errors.push('real tap on the right mat gave no right event: ' + JSON.stringify(a1));
      // the pump: 3 REAL touch taps on the pump, ≥ 0.3 s apart (the world merges presses < 0.22 s)
      try { await page.waitForFunction(() => DK.debug.world.phase === 'pump' && DK.debug.world.interactive, null, { timeout: 8000 }); }
      catch (e) { errors.push('the pump phase never started: ' + JSON.stringify(await page.evaluate(() => DK.debug.getState().phase))); }
      for (let k = 0; k < 3; k++) {
        const p = await page.evaluate(() => DK.debug.pumpScreen());
        await page.touchscreen.tap(Math.round(p.x), Math.round(p.y));
        await page.waitForTimeout(320);
        if (k === 1) await page.screenshot({ path: path.join(OUT, d.name + '-2-pump.png') });
      }
      try { await page.waitForFunction(n => DK.debug.events.filter(e => e.type === 'land').length > n, land0, { timeout: 10000 }); }
      catch (e) { errors.push('the rocket never landed'); }
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, d.name + '-3-land.png') });
      const seq = await page.evaluate(() => window.__ev.map(e => ({ type: e.type, id: e.id, n: e.n, auto: !!e.auto })));
      const pumps = seq.filter(e => e.type === 'pump');
      const order = seq.filter(e => ['right', 'pump', 'launch', 'land'].includes(e.type)).map(e => e.type).join(',');
      if (order.indexOf('right,pump,pump,pump,launch') < 0 || !/launch.*land/.test(order)) errors.push('event order: ' + order);
      if (pumps.length !== 3 || pumps.some(p => p.auto) || pumps.map(p => p.n).join() !== '1,2,3') errors.push('pumps: ' + JSON.stringify(pumps));
      const landed = seq.find(e => e.type === 'land');
      if (!landed || landed.id !== a1.id) errors.push('landed on ' + (landed && landed.id) + ', not the tapped mat ' + a1.id);
      // fast bot sessions
      for (const age of d.ages) {
        await page.goto(srv.url + `?mute=1&seed=${10 + age}&age=${age}&speed=8&bot=1&autostart=1`);
        try {
          await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'done', null, { timeout: 300000, polling: 250 });
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(OUT, `${d.name}-9-done-age${age}.png`) });
          const res = await page.evaluate(() => DK.debug.stats);
          console.log(`  ${d.name} age ${age}: rounds ${res.rounds}, right ${res.correct}, wrong ${res.wrong}, pumps ${res.pumps} (auto ${res.autoPumps}), launches ${res.launches}, lands ${res.lands}, pennants ${res.pennants}, camps ${res.camps}, wipes ${res.wipes}, hints ${res.hints}, talks ${res.talks}, surprises ${res.surprises}`);
          if (!(res.rounds >= 12 && res.correct >= 24 && res.launches >= 24 && res.lands >= 24 && res.pennants >= 24 && res.camps >= 12 && res.talks >= 4)) errors.push('bot session too short: ' + JSON.stringify(res));
        } catch (e) { errors.push(`age ${age} session did not finish: ` + JSON.stringify(await page.evaluate(() => DK.debug.getState()))); }
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
