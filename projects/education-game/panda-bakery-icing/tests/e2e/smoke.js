// Smoke test (Mochi's Icing Bakery): boot on iPhone landscape / portrait + iPad, ONE real CDP touch sequence (tap the right
// icing bag, then a real finger drag along IB.debug.tracePoints() that completes the trace — the bot bypasses the input
// layer, this does not), then bot sessions per age at ?speed=8 until the session-done screen, failing on any console error.
//   node tests/e2e/smoke.js        (ONLY=iphone-portrait to run one device)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, ages: [4, 7] },
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, ages: [3] },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2, ages: [5] }
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function tap(cdp, page, p, hold = 70) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** A real finger: press on the first point, slide through the points (every `every`-th, ~8 ms apart), lift. */
async function drag(cdp, pts, { every = 2, gap = 8, lift = true } = {}) {
  if (!pts || !pts.length) return;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1], id: 1 }] });
  await sleep(40);
  for (let i = 1; i < pts.length; i += every) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[i][0], y: pts[i][1], id: 1 }] });
    await sleep(gap);
  }
  const L = pts[pts.length - 1];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: L[0], y: L[1], id: 1 }] });
  await sleep(30);
  if (lift) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Trace the whole current trace step with real touch drags (one drag per stroke). Returns the number of drags. */
async function traceAll(cdp, page, max = 6) {
  let n = 0;
  for (; n < max; n++) {
    const st = await page.evaluate(() => { const w = IB.debug.world, s = w.stepInfo; return s && s.mode === 'trace' && w.traceState && !w.traceState.complete ? IB.debug.tracePoints() : null; });
    if (!st || !st.length) break;
    await drag(cdp, st);
    await sleep(120);
  }
  return n;
}
module.exports = { tap, drag, traceAll };
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
    await page.waitForFunction(() => window.IB && IB.debug && IB.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const missing = await page.evaluate(() => IB.Assets.missing);
    if (missing.length) errors.push('missing assets: ' + missing.join(', '));
    await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
    // a colour round: a real touch tap on the right icing bag, then a real finger drag along the dots
    await page.evaluate(() => { IB.debug.startGame(); const w = IB.debug.world; w.levels[0] = 'colors'; w.startLevel(0); IB.debug.setSpeed(4); });
    await page.waitForFunction(() => IB.debug.world.interactive && IB.debug.answer() && IB.debug.answer().choice, null, { timeout: 20000 });
    await page.evaluate(() => IB.debug.setSpeed(1));
    await page.waitForTimeout(250);
    const cdp = await ctx.newCDPSession(page);
    const a1 = await page.evaluate(() => { const a = IB.debug.answer(); const c = IB.debug.world.choiceById(a.choice); return { id: a.choice, color: c.color, p: IB.debug.choiceScreen(a.choice) }; });
    await tap(cdp, page, a1.p);
    try { await page.waitForFunction(() => { const w = IB.debug.world, s = w.stepInfo; return w.interactive && s && s.mode === 'trace'; }, null, { timeout: 8000 }); }
    catch (e) { errors.push('real touch tap on the bag did not lead to the trace step: ' + JSON.stringify(await page.evaluate(() => IB.debug.getState()))); }
    const bag = await page.evaluate(() => IB.debug.world.bag.color);
    if (bag !== a1.color) errors.push('the bag is not the picked colour: ' + bag + ' vs ' + a1.color);
    const drags = await traceAll(cdp, page);
    await page.waitForTimeout(300);
    const tr = await page.evaluate(() => { const w = IB.debug.world; return { done: !!(w.traceState && w.traceState.complete) || w.phase === 'finish' || w.phase === 'hop' || w.state !== 'round' || (w.stepInfo && w.stepInfo.mode !== 'trace'), icing: w.icing.length, magic: w.magic }; });
    if (!tr.done || !drags) errors.push('the real touch drag did not complete the trace: ' + JSON.stringify(tr));
    else if (tr.magic) errors.push('the trace needed magic icing (the drag missed the dots)');
    await page.screenshot({ path: path.join(OUT, d.name + '-1-traced.png') });
    console.log(`  ${d.name}: real tap + ${drags} real drag(s) → trace complete ${tr.done}`);
    // bot sessions per age at speed 8
    for (const age of d.ages) {
      await page.goto(srv.url + `?mute=1&seed=${10 + age}&age=${age}&speed=8&bot=1&autostart=1`);
      try {
        await page.waitForFunction(() => window.IB && IB.debug && IB.debug.mode === 'done', null, { timeout: 300000, polling: 250 });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUT, `${d.name}-9-done-age${age}.png`) });
        const res = await page.evaluate(() => Object.assign({}, IB.debug.stats, { gallery: IB.debug.world.gallery.length, stars: IB.debug.world.stars }));
        console.log(`  ${d.name} age ${age}: rounds ${res.rounds}, cookies ${res.cookies} (gallery ${res.gallery}), traces ${res.traces}, chips ${res.chips}, right ${res.correct}, wrong ${res.wrong}, talks ${res.talks}, stars ${res.stars}`);
        if (!(res.rounds >= 12 && res.gallery >= 12)) errors.push(`age ${age}: too few rounds / cookies ` + JSON.stringify(res));
      } catch (e) { errors.push(`age ${age} session did not finish: ` + JSON.stringify(await page.evaluate(() => IB.debug.getState()))); }
    }
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
