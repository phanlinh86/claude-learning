// Smoke test (Pom's Puzzle Town): boot on iPhone portrait + landscape with no console errors, start a round, ONE REAL
// CDP touch DRAG of the asked piece from the tray into its shadow (must give a 'placed' event — the bot bypasses the input
// layer, so this is the only proof that fingers work), ONE real wrong drag (another piece onto the board → 'wrong'),
// then a fast bot session (?speed=8&bot=1&autostart=1&mute=1) until the session-done screen. Exits 1 on any failure.
//   node tests/e2e/smoke.js        (ONLY=iphone-portrait to run one device)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, ages: [4] },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, ages: [3] }
];
/** a real finger: touchStart at a, n touchMoves along a slight curve to b, touchEnd */
async function drag(cdp, page, a, b, n = 14, ms = 600) {
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 8, radiusY: 8, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(a.x, a.y) });
  await page.waitForTimeout(90);
  for (let i = 1; i <= n; i++) {
    const u = i / n, bow = Math.sin(u * Math.PI) * 30;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(a.x + (b.x - a.x) * u + bow * 0.3, a.y + (b.y - a.y) * u - bow) });
    await page.waitForTimeout(ms / n);
  }
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function tap(cdp, page, p, hold = 70) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
module.exports = { tap, drag };
const evCount = (page, type) => page.evaluate(t => PZ.debug.events.filter(e => e.type === t).length, type);
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
    try {
      await page.goto(srv.url + '?mute=1&seed=3&age=4');
      await page.waitForFunction(() => window.PZ && PZ.debug && PZ.debug.mode === 'title', null, { timeout: 15000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
      // a colour round (3 pieces at age 4, first chapter): wait until the first ask is open
      await page.evaluate(() => { PZ.debug.startGame(); const w = PZ.debug.world; w.levels[0] = 'colors'; w.startLevel(0); PZ.debug.setSpeed(4); });
      await page.waitForFunction(() => PZ.debug.world.interactive && PZ.debug.answer(), null, { timeout: 20000 });
      await page.evaluate(() => PZ.debug.setSpeed(1));
      await page.waitForTimeout(300);
      const cdp = await ctx.newCDPSession(page);
      // 1) the RIGHT piece → its shadow
      const a1 = await page.evaluate(() => { const a = PZ.debug.answer(); return { a, from: PZ.debug.pieceScreen(a.piece), to: PZ.debug.slotScreen(a.slot) }; });
      const placed0 = await evCount(page, 'placed');
      await drag(cdp, page, a1.from, a1.to);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, d.name + '-1-dropped.png') });
      await page.waitForTimeout(500);
      const placed1 = await evCount(page, 'placed');
      const p1 = await page.evaluate(id => PZ.debug.world.pieceById(id).state, a1.a.piece);
      if (placed1 <= placed0) errors.push('real touch drag of the asked piece gave no placed event: ' + JSON.stringify({ a1, state: p1 }));
      // 2) a WRONG piece → the board (wait for the next ask first)
      // (the warm-up round has no spare piece: let the bot finish it fast, then take the next round with another piece in the tray)
      const ready = () => { const w = PZ.debug.world, a = PZ.debug.answer(); return w.interactive && a && w.pieces.some(p => p.state === 'rest' && p.id !== a.piece); };
      if (!(await page.evaluate(ready))) {
        await page.evaluate(() => { PZ.debug.setBot(true, 1); PZ.debug.setSpeed(6); });
        await page.waitForFunction(() => PZ.debug.world.state === 'roundDone', null, { timeout: 30000 });
        await page.evaluate(() => PZ.debug.setBot(false));
        await page.waitForFunction(ready, null, { timeout: 30000 });
        await page.evaluate(() => PZ.debug.setSpeed(1));
      }
      await page.waitForTimeout(300);
      const a2 = await page.evaluate(() => {
        const w = PZ.debug.world, a = PZ.debug.answer();
        const other = w.pieces.find(p => p.state === 'rest' && p.id !== a.piece);
        if (!other) return null;
        // drop it in the asked slot: another piece on the board is a (gentle) mistake
        return { id: other.id, from: PZ.debug.pieceScreen(other.id), to: PZ.debug.slotScreen(a.slot) };
      });
      if (!a2) errors.push('no other piece in the tray for the wrong drag');
      else {
        const wrong0 = await evCount(page, 'wrong');
        await drag(cdp, page, a2.from, a2.to);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, d.name + '-2-wrong.png') });
        if (await evCount(page, 'wrong') <= wrong0) errors.push('real touch drag of another piece onto the board gave no wrong event: ' + JSON.stringify(a2));
        await page.waitForTimeout(1300);
        const st = await page.evaluate(id => PZ.debug.world.pieceById(id).state, a2.id);
        if (st !== 'rest' && st !== 'home') errors.push('the wrong piece did not fly home: ' + st);
      }
      // 3) fast bot sessions per age
      for (const age of d.ages) {
        await page.goto(srv.url + `?mute=1&seed=${10 + age}&age=${age}&speed=8&bot=1&autostart=1`);
        try {
          await page.waitForFunction(() => window.PZ && PZ.debug && PZ.debug.mode === 'done', null, { timeout: 300000, polling: 250 });
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(OUT, `${d.name}-9-done-age${age}.png`) });
          const res = await page.evaluate(() => PZ.debug.stats);
          console.log(`  ${d.name} age ${age}: rounds ${res.rounds}, placed ${res.correct}, wrong ${res.wrong}, near ${res.nearMiss}, hints ${res.hints}, talks ${res.talks}`);
          if (!(res.rounds >= 12 && res.correct >= 24)) errors.push('bot session too short: ' + JSON.stringify(res));
        } catch (e) { errors.push(`age ${age} session did not finish: ` + JSON.stringify(await page.evaluate(() => PZ.debug.getState()))); }
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
