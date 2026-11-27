// Smoke test (Tupi's Bakery Delivery): boot on iPhone portrait + landscape with no console errors, start a colour round, ONE
// REAL touch DRAG (CDP touch events) from the cart along BD.debug.routeScreen(answer) to the right house → 'grab' + 'right' +
// 'deliver' events (the bot bypasses the input layer, so this is the proof that fingers work), a real short tap on the cart →
// 'honk' (a tap is not a drive), then a fast bot session (?speed=8&bot=1&autostart=1&mute=1) until the session-done screen.
//   node tests/e2e/smoke.js        (ONLY=iphone-portrait to run one device)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, ages: [4] },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, ages: [3] }
];
const evCount = (page, type) => page.evaluate(t => BD.debug.events.filter(e => e.type === t).length, type);
async function touchDrag(page, cdp, pts, stepMs) {
  const tp = p => [{ x: p[0], y: p[1], id: 1, radiusX: 8, radiusY: 8, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) });
  for (let i = 1; i < pts.length; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(pts[i]) }); await page.waitForTimeout(stepMs); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let fails = 0;
  for (const d of DEVICES) {
    if (process.env.ONLY && d.name !== process.env.ONLY) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    page.on('crash', () => errors.push('PAGE CRASH'));
    try {
      await page.goto(srv.url + '?mute=1&seed=3&age=4');
      await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'title', null, { timeout: 15000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
      const missing = await page.evaluate(() => BD.Assets.missing.slice());
      if (missing.length) errors.push('assets missing: ' + missing.join(', '));
      await page.evaluate(() => { BD.debug.startGame(); const w = BD.debug.world; w.levels[0] = 'colors'; w.startLevel(0); BD.debug.setSpeed(4); });
      await page.waitForFunction(() => { const w = BD.debug.world, a = BD.debug.answer(); return w.interactive && a && BD.debug.cartScreen() && w.phaseTime > 0.3; }, null, { timeout: 20000 });
      await page.evaluate(() => BD.debug.setSpeed(1));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, d.name + '-1-play.png') });
      // a real short tap on the cart → honk (not a drive)
      const c0 = await page.evaluate(() => BD.debug.cartScreen());
      const honk0 = await evCount(page, 'honk');
      await page.touchscreen.tap(Math.round(c0.x), Math.round(c0.y));
      await page.waitForTimeout(250);
      if (await evCount(page, 'honk') <= honk0) errors.push('a short tap on the cart gave no honk: ' + JSON.stringify(c0));
      // a real touch drag along the route to the right house
      const r = await page.evaluate(() => { const a = BD.debug.answer(); return { a, pts: BD.debug.routeScreen(a.houseId), cart: BD.debug.cartScreen() }; });
      const grab0 = await evCount(page, 'grab'), right0 = await evCount(page, 'right'), del0 = await evCount(page, 'deliver');
      const pts = [[r.cart.x, r.cart.y]].concat(r.pts || []);
      await touchDrag(page, cdp, pts, 16);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, d.name + '-2-drive.png') });
      if (await evCount(page, 'grab') <= grab0) errors.push('real touch on the cart gave no grab: ' + JSON.stringify(r.cart));
      try { await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'right').length > n, right0, { timeout: 6000 }); }
      catch (e) { errors.push('the real drag never reached the right house: ' + JSON.stringify(await page.evaluate(() => BD.debug.getState().cart))); }
      try { await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'deliver').length > n, del0, { timeout: 6000 }); }
      catch (e) { errors.push('no delivery after the right house'); }
      await page.screenshot({ path: path.join(OUT, d.name + '-3-deliver.png') });
      // fast bot sessions
      for (const age of (process.env.NOBOT ? [] : d.ages)) {
        await page.goto(srv.url + `?mute=1&seed=${10 + age}&age=${age}&speed=8&bot=1&autostart=1`);
        try {
          await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'done', null, { timeout: 300000, polling: 250 });
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(OUT, `${d.name}-9-done-age${age}.png`) });
          const res = await page.evaluate(() => BD.debug.stats);
          console.log(`  ${d.name} age ${age}: rounds ${res.rounds}, right ${res.correct}, wrong ${res.wrong}, deliveries ${res.deliveries}, grabs ${res.grabs}, wipes ${res.wipes}, hints ${res.hints}, talks ${res.talks}, surprises ${res.surprises}`);
          if (!(res.rounds >= 12 && res.correct >= 14 && res.deliveries >= 14 && res.talks >= 4)) errors.push('bot session too short: ' + JSON.stringify(res));
        } catch (e) { errors.push(`age ${age} session did not finish: ` + JSON.stringify(await page.evaluate(() => BD.debug.getState()))); }
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
