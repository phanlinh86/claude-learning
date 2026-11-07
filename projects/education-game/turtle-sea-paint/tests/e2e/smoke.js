// Smoke test (Nini's Sea Painting): boot on iPhone landscape / portrait + iPad, ONE real CDP touch tap sequence that
// paints a part (shell, then the glowing part — the bot bypasses the input layer), then bot sessions per age at
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
    await page.waitForFunction(() => window.SP && SP.debug && SP.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
    // a colour round: real touch taps on the right shell, then on the glowing part
    await page.evaluate(() => { SP.debug.startGame(); const w = SP.debug.world; w.levels[0] = 'colors'; w.startLevel(0); SP.debug.setSpeed(4); });
    await page.waitForFunction(() => SP.debug.world.interactive && SP.debug.answer() && SP.debug.answer().shell, null, { timeout: 20000 });
    await page.evaluate(() => SP.debug.setSpeed(1));
    const cdp = await ctx.newCDPSession(page);
    const a1 = await page.evaluate(() => { const a = SP.debug.answer(); return { color: a.shell, p: SP.debug.shellScreen(a.shell) }; });
    await tap(cdp, page, a1.p);
    await page.waitForTimeout(500);
    const loaded = await page.evaluate(() => SP.debug.world.brush.color);
    if (loaded !== a1.color) errors.push('real touch tap on the shell did not load the brush: ' + loaded + ' ' + JSON.stringify(a1));
    const a2 = await page.evaluate(() => { const a = SP.debug.answer(); return a && a.part ? { id: a.part, p: SP.debug.partScreen(a.part) } : null; });
    if (!a2) errors.push('no part to tap after the shell');
    else {
      await tap(cdp, page, a2.p);
      await page.waitForTimeout(1000);
      const st = await page.evaluate(id => { const s = SP.debug.world.st[id]; return { painted: s.painted, t: s.t, color: s.color }; }, a2.id);
      if (!st.painted || !(st.t > 0.9)) errors.push('real touch tap on the part did not paint it: ' + JSON.stringify(st));
      await page.screenshot({ path: path.join(OUT, d.name + '-1-painted.png') });
    }
    // bot sessions per age at speed 8
    for (const age of d.ages) {
      await page.goto(srv.url + `?mute=1&seed=${10 + age}&age=${age}&speed=8&bot=1&autostart=1`);
      try {
        await page.waitForFunction(() => window.SP && SP.debug && SP.debug.mode === 'done', null, { timeout: 240000, polling: 250 });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUT, `${d.name}-9-done-age${age}.png`) });
        const res = await page.evaluate(() => SP.debug.stats);
        console.log(`  ${d.name} age ${age}: rounds ${res.rounds}, pictures ${res.pictures}, right ${res.correct}, wrong ${res.wrong}, talks ${res.talks}`);
      } catch (e) { errors.push(`age ${age} session did not finish: ` + JSON.stringify(await page.evaluate(() => SP.debug.getState()))); }
    }
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
