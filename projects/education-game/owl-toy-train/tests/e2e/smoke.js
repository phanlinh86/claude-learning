// Smoke test (Momo's Toy Train): boot on phone + tablet viewports, ONE real CDP touch drag of a toy into its car (the bot
// bypasses the input layer), then a full session with the bot at high speed, screenshots along the way, fail on any
// console error.   node tests/e2e/smoke.js   (ONLY=iphone-portrait to run one device)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
];
async function drag(cdp, page, a, b, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
  await page.waitForTimeout(60);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
module.exports = { drag };
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
    page.on('crash', () => console.log('PAGE CRASH', d.name));
    await page.goto(srv.url + '?mute=1&seed=3&age=4');
    await page.waitForFunction(() => window.TT && TT.debug && TT.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, d.name + '-0-title.png') });
    await page.evaluate(() => { TT.debug.setSpeed(3); TT.debug.startGame(); });
    await page.waitForFunction(() => TT.debug.world.state === 'round' && TT.debug.world.phase === 'load' && TT.debug.world.items.every(i => i.state === 'rest'), null, { timeout: 20000 });
    await page.evaluate(() => TT.debug.setSpeed(1));
    const tgt = await page.evaluate(() => {
      const it = TT.debug.world.items.find(i => i.state === 'rest'), car = TT.debug.answerCarId(it.id);
      return { id: it.id, a: TT.debug.itemScreen(it.id), b: TT.debug.carScreen(car) };
    });
    const cdp = await ctx.newCDPSession(page);
    await drag(cdp, page, tgt.a, { x: tgt.b.x, y: tgt.b.y - tgt.b.h * 0.3 });
    await page.waitForTimeout(900);
    const st = await page.evaluate(id => TT.debug.world.items.find(i => i.id === id).state, tgt.id);
    if (st !== 'in') errors.push('real touch drag did not load the toy: ' + st + ' ' + JSON.stringify(tgt));
    await page.screenshot({ path: path.join(OUT, d.name + '-0b-drag.png') });
    await page.evaluate(() => { TT.debug.setBot(true, 0.7); TT.debug.setSpeed(6); });
    const shots = [1500, 4000, 9000];
    const t0 = Date.now(); let i = 1;
    for (const at of shots) { const w = at - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); await page.screenshot({ path: path.join(OUT, `${d.name}-${i++}-play.png`) }); }
    try {
      await page.waitForFunction(() => TT.debug.mode === 'done', null, { timeout: 180000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, d.name + '-9-done.png') });
    } catch (e) { errors.push('session did not finish: ' + JSON.stringify(await page.evaluate(() => TT.debug.getState()))); }
    const res = await page.evaluate(() => TT.debug.stats);
    const ok = errors.length === 0;
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + d.name, JSON.stringify(res), ok ? '' : errors.slice(0, 5).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
