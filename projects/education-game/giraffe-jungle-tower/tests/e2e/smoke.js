// Smoke test: boot on phone + tablet viewports, play a full session with the bot at high speed,
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
    await page.waitForFunction(() => window.JT && JT.debug && JT.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
    // one REAL touch drag of the right block onto the tower (the bot bypasses the input layer — sister-game lesson)
    await page.evaluate(() => { JT.debug.setSpeed(3); JT.debug.startGame(); });
    await page.waitForFunction(() => JT.debug.world.state === 'round' && JT.debug.world.phase === 'ask', null, { timeout: 20000 });
    await page.evaluate(() => JT.debug.setSpeed(1));
    const tgt = await page.evaluate(() => { const id = JT.debug.answerId(); return id != null ? { id, from: JT.debug.pieceScreen(id), to: JT.debug.dropScreen() } : null; });
    const before = await page.evaluate(() => JT.debug.world.tower.blocks.length);
    if (tgt) {
      const cdp = await ctx.newCDPSession(page);
      const pt = (x, y) => [{ x, y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(tgt.from.x, tgt.from.y) });
      for (let k = 1; k <= 12; k++) {
        const u = k / 12;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(tgt.from.x + (tgt.to.x - tgt.from.x) * u, tgt.from.y + (tgt.to.y - tgt.from.y) * u) });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => JT.debug.world.tower.blocks.length);
    if (!tgt || after !== before + 1) errors.push('real touch drag did not stack the block ' + JSON.stringify({ tgt, before, after }));
    await page.screenshot({ path: path.join(OUT, d.name + '-0b-tap.png') });
    await page.evaluate(() => { JT.debug.setBot(true, 0.7); JT.debug.setSpeed(6); });
    const shots = [1500, 4000, 9000];
    let t0 = Date.now(), i = 1;
    for (const at of shots) { await page.waitForTimeout(at - (Date.now() - t0) > 0 ? at - (Date.now() - t0) : 0); await page.screenshot({ path: path.join(OUT, `${d.name}-${i++}-play.png`) }); }
    try {
      await page.waitForFunction(() => JT.debug.mode === 'done', null, { timeout: 120000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, d.name + '-9-done.png') });
    } catch (e) { errors.push('session did not finish: ' + JSON.stringify(await page.evaluate(() => JT.debug.getState()))); }
    const st = await page.evaluate(() => ({ s: JT.debug.getState(), stats: JT.debug.stats }));
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, JSON.stringify(st.stats), ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
