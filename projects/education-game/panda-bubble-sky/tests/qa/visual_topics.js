// Visual QA topic sweep: every topic of one age in play (a late round = most bubbles) on one device × language, each topic
// in a different season; plus the freed-thing moment (countSel counting / animal home badge / flight) and a k≥2 rainbow.
//   AGE=5 DEV=ip-p QLANG=vi node tests/qa/visual_topics.js   -> tests/out/qa_visual/t-<dev>-<lang>-a<age>-*.png
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const G = require('./visual_geom');
const OUT = path.join(__dirname, '..', 'out', 'qa_visual'); fs.mkdirSync(OUT, { recursive: true });
const DEV = process.env.DEV || 'ip-p', LANG = process.env.QLANG || 'vi', AGE = +(process.env.AGE || 4);
const ROUNDS = (process.env.ROUNDS || '3').split(',').map(Number);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve(); const browser = await chromium.launch();
  const { page, ctx } = await G.open(browser, srv, DEV, LANG, AGE, 11 + AGE);
  const tag = `t-${DEV}-${LANG}-a${AGE}`;
  const shot = async n => {
    await page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) });
    const g = await page.evaluate(G.geom);
    const info = await page.evaluate(() => { const w = PB.debug.world, c = w.cur; return c ? { mode: c.mode, n: c.n, k: c.k, things: w.bubbles.map(b => (b.thing.kind === 'stars' ? 'S' + b.thing.n : b.thing.text || b.thing.animal || ((b.thing.color || '') + ':' + (b.thing.obj || b.thing.shape || '')) + (b.thing.big === false ? '(s)' : '')) + (b.target ? '*' : '')).join(' ') } : null; });
    console.log(tag, n, JSON.stringify(info), 'd', g.dCss, 'thing', g.thingCss, g.iss.filter(x => !/btnPause/.test(x)).join(' | '));
  };
  const until = (fn, arg, t = 40000) => page.waitForFunction(fn, arg, { timeout: t, polling: 20 });
  try {
    await page.evaluate(() => PB.debug.startGame());
    const topics = await page.evaluate(a => PB.AGE_TOPICS[a].slice(), AGE);
    for (let j = 0; j < topics.length; j++) for (const R of ROUNDS) {
      const season = (j + AGE) % 4, topic = topics[j];
      await page.evaluate(([lv, t, R]) => { const w = PB.debug.world; w.levels[lv] = t; w.startLevel(lv); w.round = R; PB.debug.weather.setWeather(lv, { instant: true }); PB.debug.setSpeed(6); }, [season, topic, R]);
      await until(() => PB.debug.world.interactive && PB.debug.world.bubbles.every(b => b.state === 'float' && Math.hypot(b.x - b.hx, b.y - b.hy) < 40));
      await page.evaluate(() => PB.debug.setSpeed(1)); await sleep(500);
      await shot(`${topic}-r${R}-s${season}`);
      // tap a target in slow motion → the freed-thing moment
      await page.evaluate(() => { PB.debug.setSpeed(0.3); const w = PB.debug.world, a = w.answer(), b = w.bubbleById(a.bubble); w.pointerDown(b.x, b.y); w.pointerUp(b.x, b.y); });
      const fs2 = await page.waitForFunction(() => { const b = PB.debug.world.bubbles.find(q => q.fstate === 'count' || q.fstate === 'badge' || (q.fstate === 'fly' && q.ft > 0.3)); return b && b.fstate; }, null, { timeout: 20000, polling: 20 }).then(h => h.jsonValue()).catch(() => null);
      if (fs2 === 'count' || fs2 === 'badge') { await sleep(fs2 === 'count' ? 1500 : 500); await page.evaluate(() => PB.debug.setSpeed(0.05)); await sleep(200); await shot(`${topic}-r${R}-${fs2}`); }
      // k ≥ 2: pop the rest, catch a half-painted rainbow
      const k = await page.evaluate(() => PB.debug.world.cur && PB.debug.world.cur.k);
      if (k >= 2 && j === 0) {
        await page.evaluate(() => PB.debug.setSpeed(1));
        await until(() => PB.debug.world.rainbow.filled >= 0.95, null, 20000);
        await page.evaluate(() => { PB.debug.setSpeed(0.3); const w = PB.debug.world, a = w.answer(); if (a) { const b = w.bubbleById(a.bubble); w.pointerDown(b.x, b.y); w.pointerUp(b.x, b.y); } });
        await until(() => PB.debug.world.bubbles.some(b => b.fstate === 'fly' && b.ft > 0.6), null, 20000).catch(() => {});
        await page.evaluate(() => PB.debug.setSpeed(0.03)); await sleep(200);
        await shot(`${topic}-r${R}-paint2`);
      }
      await page.evaluate(() => PB.debug.setSpeed(1));
    }
  } catch (e) { console.log('EXC', tag, e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }); }
  for (const e of page._errs) console.log('PAGEERR', tag, e);
  await ctx.close(); await browser.close(); srv.close();
})();
