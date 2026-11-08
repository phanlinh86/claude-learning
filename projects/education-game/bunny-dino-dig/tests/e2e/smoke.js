// Smoke test (Bun's Dino Dig): boot on iPhone landscape / portrait + iPad, ONE real CDP touch tap sequence that
// digs the right mound (the bot bypasses the input layer), then bot sessions per age at
// ?speed=8 until the session-done screen, failing on any console error.
//   node tests/e2e/smoke.js        (ONLY=iphone-portrait to run one device)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, ages: [4, 7] },
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, ages: [3, 6] },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2, ages: [5] }
];
async function tap(cdp, page, p, hold = 70) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
module.exports = { tap };
if (require.main === module) (async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let fails = 0;
  for (const d of DEVICES) { if (process.env.ONLY && d.name !== process.env.ONLY) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    page.on('crash', () => errors.push('PAGE CRASH'));
    await page.goto(srv.url + '?mute=1&seed=3&age=4');
    await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
    // a colour round: ONE real touch tap on the right mound → it is dug, the thing is found and lands on the shelf
    await page.evaluate(() => { DD.debug.startGame(); const w = DD.debug.world; w.levels[0] = 'colors'; w.startLevel(0); DD.debug.setSpeed(4); });
    await page.waitForFunction(() => DD.debug.world.interactive && DD.debug.answer() && DD.debug.answer().mound != null, null, { timeout: 20000 });
    await page.evaluate(() => DD.debug.setSpeed(1));
    const cdp = await ctx.newCDPSession(page);
    const a1 = await page.evaluate(() => { const a = DD.debug.answer(); return { id: a.mound, p: DD.debug.moundScreen(a.mound) }; });
    await tap(cdp, page, a1.p);
    await page.waitForTimeout(600);
    const digging = await page.evaluate(() => !!DD.debug.world.dig);
    if (!digging) errors.push('real touch tap on the mound did not start a dig: ' + JSON.stringify(a1));
    await page.screenshot({ path: path.join(OUT, d.name + '-1-digging.png') });
    await page.waitForTimeout(3600);
    const st = await page.evaluate(id => { const w = DD.debug.world, m = w.mounds.find(q => q.id === id); return { state: m && m.state, shelf: w.shelfItems.length, flying: w.flying.length, phase: w.phase, st: w.state }; }, a1.id);
    if (!(st.shelf >= 1 || st.flying >= 1 || st.st === 'roundDone')) errors.push('the dug thing did not reach the shelf: ' + JSON.stringify(st));
    await page.screenshot({ path: path.join(OUT, d.name + '-2-found.png') });
    // bot sessions per age at speed 8
    for (const age of d.ages) {
      await page.goto(srv.url + `?mute=1&seed=${10 + age}&age=${age}&speed=8&bot=1&autostart=1`);
      try {
        await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'done', null, { timeout: 240000, polling: 250 });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUT, `${d.name}-9-done-age${age}.png`) });
        const res = await page.evaluate(() => DD.debug.stats);
        console.log(`  ${d.name} age ${age}: rounds ${res.rounds}, digs ${res.digs}, right ${res.correct}, wrong ${res.wrong}, talks ${res.talks}`);
      } catch (e) { errors.push(`age ${age} session did not finish: ` + JSON.stringify(await page.evaluate(() => DD.debug.getState()))); }
    }
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
