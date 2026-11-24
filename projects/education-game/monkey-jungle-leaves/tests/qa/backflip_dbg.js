// QA: does the backflip event fire in the real game loop? (speed 1 and speed 20)
const { chromium } = require('playwright'); const serve = require('../e2e/serve');
(async () => { const srv = await serve(), b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true })).newPage();
  for (const sp of [1, 20]) {
  await page.goto(srv.url + process.env.Q || '?mute=1&age=3&seed=4'); await page.waitForFunction(() => window.LL && LL.debug && LL.debug.mode === 'title');
  await page.evaluate(s => { window.__e = []; const w = LL.debug.world, o = w._emit; w._emit = function (e) { if (['cheer', 'backflip', 'roundDone'].includes(e.type)) window.__e.push(e.type + '@' + this.time.toFixed(2) + ' fd=' + this.lolo._flipDelay.toFixed(3) + ' ft=' + this.lolo._flipT.toFixed(2)); return o.call(this, e); };
    LL.debug.setBot(true, 1); LL.debug.setSpeed(s); LL.debug.startGame(); }, sp);
  await page.waitForFunction(() => window.__e.filter(x => x.startsWith('roundDone')).length >= 2, null, { timeout: 120000 });
  console.log(sp, JSON.stringify(await page.evaluate(() => window.__e)));
  }
  await b.close(); srv.close(); })();
