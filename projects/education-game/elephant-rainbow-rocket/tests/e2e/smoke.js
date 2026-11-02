// Smoke test: boot on phone + tablet viewports, play a full session with the bot at high speed,
// screenshot along the way, fail on any console error.   node tests/e2e/smoke.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
];
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let fails = 0;
  for (const d of DEVICES) {
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(srv.url + '?mute=1&seed=3&age=4');
    await page.waitForFunction(() => window.RR && RR.debug && RR.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
    // one REAL touch tap on the right island (the bot bypasses the input layer — sister-game lesson)
    await page.evaluate(() => { RR.debug.setSpeed(3); RR.debug.startGame(); });
    await page.waitForFunction(() => RR.debug.world.state === 'round' && RR.debug.world.phase === 'ask', null, { timeout: 20000 });
    await page.evaluate(() => RR.debug.setSpeed(1));
    const tgt = await page.evaluate(() => { const id = RR.debug.answerId(); return id != null ? Object.assign({ id }, RR.debug.islandScreen(id)) : null; });
    if (tgt) await page.touchscreen.tap(tgt.x, tgt.y);
    await page.waitForTimeout(300);
    const went = tgt && await page.evaluate(() => ['ignite', 'fly', 'land', 'climb'].includes(RR.debug.world.phase));
    if (!went) errors.push('real touch tap did not launch the rocket ' + JSON.stringify(tgt));
    await page.screenshot({ path: path.join(OUT, d.name + '-0b-tap.png') });
    await page.evaluate(() => { RR.debug.setBot(true, 0.7); RR.debug.setSpeed(6); });
    const shots = [1500, 4000, 9000];
    let t0 = Date.now(), i = 1;
    for (const at of shots) { await page.waitForTimeout(at - (Date.now() - t0) > 0 ? at - (Date.now() - t0) : 0); await page.screenshot({ path: path.join(OUT, `${d.name}-${i++}-play.png`) }); }
    try {
      await page.waitForFunction(() => RR.debug.mode === 'done', null, { timeout: 120000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, d.name + '-9-done.png') });
    } catch (e) { errors.push('session did not finish: ' + JSON.stringify(await page.evaluate(() => RR.debug.getState()))); }
    const st = await page.evaluate(() => ({ s: RR.debug.getState(), stats: RR.debug.stats }));
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, JSON.stringify(st.stats), ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
