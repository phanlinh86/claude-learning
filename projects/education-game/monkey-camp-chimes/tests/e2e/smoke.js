// Smoke test (Kiki's Camp Chimes): boot on iPhone portrait + landscape with no console errors, start a round, ONE REAL
// CDP touch TAP on the asked chime (must give a 'right' event — the bot bypasses the input layer, so this is the only
// proof that fingers work), ONE real tap on another chime (→ 'wrong'), ONE real swipe across the beam in song time (→ a
// non-auto cascade), then a fast bot session (?speed=8&bot=1&autostart=1&mute=1) until the session-done screen.
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
const evCount = (page, type) => page.evaluate(t => CC.debug.events.filter(e => e.type === t).length, type);
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
      await page.waitForFunction(() => window.CC && CC.debug && CC.debug.mode === 'title', null, { timeout: 15000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
      // a colour round (3 pieces at age 4, first chapter): wait until the first ask is open
      await page.evaluate(() => { CC.debug.startGame(); const w = CC.debug.world; w.levels[0] = 'colors'; w.startLevel(0); CC.debug.setSpeed(4); });
      await page.waitForFunction(() => CC.debug.world.interactive && CC.debug.answer(), null, { timeout: 20000 });
      await page.evaluate(() => CC.debug.setSpeed(1));
      await page.waitForTimeout(300);
      const cdp = await ctx.newCDPSession(page);
      // 1) tap the RIGHT chime
      const a1 = await page.evaluate(() => { const a = CC.debug.answer(); return { a, at: CC.debug.chimeScreen(a.chime) }; });
      const right0 = await evCount(page, 'right');
      await tap(cdp, page, { x: Math.round(a1.at.x), y: Math.round(a1.at.y) });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, d.name + '-1-right.png') });
      if (await evCount(page, 'right') <= right0) errors.push('real tap on the asked chime gave no right event: ' + JSON.stringify(a1));
      // 2) tap a WRONG chime at the next ask (the warm-up round may have no distractor: then the next round)
      const ready = () => { const w = CC.debug.world, a = CC.debug.answer(); return w.state === 'round' && w.interactive && a && a.chime != null && w.chimes.some(c => c.state === 'hang' && c.id !== a.chime && !c.done); };
      try { await page.waitForFunction(ready, null, { timeout: 6000 }); } catch (e) {
        await page.evaluate(() => { CC.debug.setBot(true, 1); CC.debug.setSpeed(6); });
        await page.waitForFunction(() => CC.debug.world.state === 'roundDone', null, { timeout: 30000 });
        await page.evaluate(() => CC.debug.setBot(false));
        await page.waitForFunction(ready, null, { timeout: 30000 });
        await page.evaluate(() => CC.debug.setSpeed(1));
      }
      await page.waitForTimeout(300);
      const a2 = await page.evaluate(() => {
        const w = CC.debug.world, a = CC.debug.answer();
        const other = w.chimes.find(c => c.state === 'hang' && c.id !== a.chime && !c.done);
        return other ? { id: other.id, at: CC.debug.chimeScreen(other.id) } : null;
      });
      if (!a2) errors.push('no other chime for the wrong tap');
      else {
        const wrong0 = await evCount(page, 'wrong');
        await tap(cdp, page, { x: Math.round(a2.at.x), y: Math.round(a2.at.y) });
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, d.name + '-2-wrong.png') });
        if (await evCount(page, 'wrong') <= wrong0) errors.push('real tap on another chime gave no wrong event: ' + JSON.stringify(a2));
      }
      // 3) finish the round with real taps, then a real swipe across the chimes in song time
      for (let k = 0; k < 12; k++) {
        try { await page.waitForFunction(() => CC.debug.world.state === 'roundDone' || (CC.debug.world.interactive && CC.debug.answer() && CC.debug.answer().chime != null), null, { timeout: 8000 }); } catch (e) { /* retry */ }
        if (await page.evaluate(() => CC.debug.world.state === 'roundDone')) break;
        await page.waitForTimeout(500);
        const at = await page.evaluate(() => { const a = CC.debug.answer(); return CC.debug.world.interactive && a && a.chime != null ? CC.debug.chimeScreen(a.chime) : null; });
        if (at) { await tap(cdp, page, { x: Math.round(at.x), y: Math.round(at.y) }); await page.waitForTimeout(900); }
      }
      try {
        await page.waitForFunction(() => { const a = CC.debug.answer(); return a && a.song && CC.debug.world.phase === 'song'; }, null, { timeout: 15000 });
        await page.waitForTimeout(700);
        const B = await page.evaluate(() => { const w = CC.debug.world, ys = w.chimes.filter(c => c.state === 'hang').map(c => CC.debug.chimeScreen(c.id)); return { ys, b: CC.debug.beamScreen() }; });
        const y = Math.round(B.ys.reduce((s, c) => s + c.y, 0) / B.ys.length);
        await drag(cdp, page, { x: B.b.x0 + 4, y }, { x: B.b.x1 - 4, y }, 16, 500);
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUT, d.name + '-3-song.png') });
        const ev = await page.evaluate(() => CC.debug.events.filter(e => e.type === 'songNote').length);
        if (!ev) errors.push('real swipe in song time gave no cascade');
      } catch (e) { errors.push('song phase not reached: ' + JSON.stringify(await page.evaluate(() => CC.debug.getState()))); }
      // 3) fast bot sessions per age
      for (const age of d.ages) {
        await page.goto(srv.url + `?mute=1&seed=${10 + age}&age=${age}&speed=8&bot=1&autostart=1`);
        try {
          await page.waitForFunction(() => window.CC && CC.debug && CC.debug.mode === 'done', null, { timeout: 300000, polling: 250 });
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(OUT, `${d.name}-9-done-age${age}.png`) });
          const res = await page.evaluate(() => CC.debug.stats);
          console.log(`  ${d.name} age ${age}: rounds ${res.rounds}, right ${res.correct}, wrong ${res.wrong}, brushes ${res.brushes}, hints ${res.hints}, songs ${res.songs}, talks ${res.talks}`);
          if (!(res.rounds >= 12 && res.correct >= 24)) errors.push('bot session too short: ' + JSON.stringify(res));
        } catch (e) { errors.push(`age ${age} session did not finish: ` + JSON.stringify(await page.evaluate(() => CC.debug.getState()))); }
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
