// Smoke test (Bop's Rainy Band): boot on phone + tablet viewports, play a full session with the bot at high speed,
// screenshot along the way, fail on any console error.   node tests/e2e/smoke.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-landscape', skip: !!process.env.ONLY, viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
];
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let fails = 0;
  for (const d of DEVICES) { if (process.env.ONLY && d.name !== process.env.ONLY) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('crash', () => console.log('PAGE CRASH', d.name));
    await page.goto(srv.url + '?mute=1&seed=3&age=4');
    await page.waitForFunction(() => window.RB && RB.debug && RB.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
    // one REAL touch tap on the right band member (or the big drum in a drum ask) — the bot bypasses the input layer
    await page.evaluate(() => { RB.debug.setSpeed(3); RB.debug.startGame(); });
    await page.waitForFunction(() => RB.debug.world.state === 'round' && RB.debug.world.phase === 'ask', null, { timeout: 20000 });
    await page.evaluate(() => RB.debug.setSpeed(1));
    const tgt = await page.evaluate(() => {
      const w = RB.debug.world, drum = w._mode() === 'drum', id = RB.debug.answerId();
      return { drum, n: drum ? (w._askObj().n || 1) : 1, at: drum ? RB.debug.bigDrumScreen() : (id != null ? RB.debug.memberScreen(id) : null) };
    });
    const notes = () => page.evaluate(() => (RB.debug.world.sheet && RB.debug.world.sheet.notes ? RB.debug.world.sheet.notes.filter(Boolean).length : 0));
    const before = await notes();
    if (tgt.at) {
      const cdp = await ctx.newCDPSession(page);
      if (tgt.drum) await page.waitForTimeout(900);   // drumGuard: the first 0.7 s of a drum ask are free booms
      for (let k = 0; k < tgt.n; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tgt.at.x, y: tgt.at.y, id: 1 }] });
        await page.waitForTimeout(70);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(450);
      }
    }
    await page.waitForTimeout(1500);
    const after = await notes();
    if (!tgt.at || after !== before + 1) errors.push('real touch tap did not add a note ' + JSON.stringify({ tgt, before, after }));
    await page.screenshot({ path: path.join(OUT, d.name + '-0b-tap.png') });
    await page.evaluate(() => { RB.debug.setBot(true, 0.7); RB.debug.setSpeed(6); });
    const shots = [1500, 4000, 9000];
    let t0 = Date.now(), i = 1;
    for (const at of shots) { await page.waitForTimeout(at - (Date.now() - t0) > 0 ? at - (Date.now() - t0) : 0); await page.screenshot({ path: path.join(OUT, `${d.name}-${i++}-play.png`) }); }
    try {
      await page.waitForFunction(() => RB.debug.mode === 'done', null, { timeout: 120000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, d.name + '-9-done.png') });
    } catch (e) { errors.push('session did not finish: ' + JSON.stringify(await page.evaluate(() => RB.debug.getState()))); }
    const st = await page.evaluate(() => ({ s: RB.debug.getState(), stats: RB.debug.stats }));
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, JSON.stringify(st.stats), ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
