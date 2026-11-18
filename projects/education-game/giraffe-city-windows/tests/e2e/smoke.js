// Smoke test for Gigi's Peekaboo Windows: boot on phone + tablet viewports, open one window with a REAL touch tap,
// play a full session with the bot at high speed, screenshot along the way, fail on any console error.
//   node tests/e2e/smoke.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 }
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
    await page.waitForFunction(() => window.GW && GW.debug && GW.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
    // scroll → peek → hide fast, then one REAL touch tap on a closed window (the bot bypasses the input layer)
    await page.evaluate(() => { GW.debug.setSpeed(4); GW.debug.startGame(); });
    await page.waitForFunction(() => { const w = GW.debug.world; return w.state === 'round' && w.phase === 'play' && w.cards.every(c => c.state !== 'down' || c.open < 0.5); }, null, { timeout: 20000 });
    await page.evaluate(() => GW.debug.setSpeed(1));
    const tgt = await page.evaluate(() => { const c = GW.debug.world.cards.find(c => c.state === 'down'); return c ? Object.assign({ id: c.id }, GW.debug.cardScreen(c.id)) : null; });
    if (tgt) await page.touchscreen.tap(tgt.x, tgt.y);   // cardScreen() is the window's centre in CSS px
    await page.waitForTimeout(300);
    const up = tgt && await page.evaluate(id => { const c = GW.debug.world.cardById(id); return c && c.state === 'up' && c.open > 0.9; }, tgt.id);
    if (!up) errors.push('real touch tap did not open the window ' + JSON.stringify(tgt));
    await page.screenshot({ path: path.join(OUT, d.name + '-0b-tap.png') });
    await page.evaluate(() => { GW.debug.setBot(true, 0.7); GW.debug.setSpeed(8); });
    const shots = [1500, 4000, 9000];
    const t0 = Date.now(); let i = 1;
    for (const at of shots) { await page.waitForTimeout(Math.max(0, at - (Date.now() - t0))); await page.screenshot({ path: path.join(OUT, `${d.name}-${i++}-play.png`) }); }
    try {
      await page.waitForFunction(() => GW.debug.mode === 'done', null, { timeout: 120000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, d.name + '-9-done.png') });
    } catch (e) { errors.push('session did not finish: ' + JSON.stringify(await page.evaluate(() => GW.debug.getState()))); }
    const st = await page.evaluate(() => ({ s: GW.debug.getState(), stats: GW.debug.bot && GW.debug.bot.stats }));
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, 'stars', st.s.stars, JSON.stringify(st.stats), ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
