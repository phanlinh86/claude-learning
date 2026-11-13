// Visual QA contrast probe: a colours round in every season with every answer colour forced onto the bubbles; screenshot +
// bubble geometry → tests/out/qa_visual/contrast/*.png + bubbles.json (measured by tests/qa/contrast.py).
//   DEV=ip-p node tests/qa/visual_contrast.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const G = require('./visual_geom');
const OUT = path.join(__dirname, '..', 'out', 'qa_visual', 'contrast'); fs.mkdirSync(OUT, { recursive: true });
const DEV = process.env.DEV || 'ip-p';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve(); const browser = await chromium.launch();
  const { page, ctx } = await G.open(browser, srv, DEV, 'en', 5, 21);
  const all = [];
  try {
    await page.evaluate(() => PB.debug.startGame());
    for (let s = 0; s < 4; s++) for (let pass = 0; pass < 2; pass++) {
      await page.evaluate(([lv]) => { const w = PB.debug.world; w.levels[lv] = 'colors'; w.startLevel(lv); w.round = 3; PB.debug.weather.setWeather(lv, { instant: true }); PB.debug.setSpeed(6); }, [s]);
      await page.waitForFunction(() => PB.debug.world.interactive && PB.debug.world.bubbles.every(b => b.state === 'float' && Math.hypot(b.x - b.hx, b.y - b.hy) < 30), null, { timeout: 40000, polling: 20 });
      const info = await page.evaluate(([pass]) => {
        const C = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'], w = PB.debug.world, v = PB.debug.view();
        w.bubbles.forEach((b, i) => { b.thing = Object.assign({}, b.thing, { kind: 'toy', obj: 'ball', color: C[(i + pass * 4) % 7] }); });
        PB.debug.setSpeed(0.1);
        return w.bubbles.map(b => ({ color: b.thing.color, x: v.left + b.x * v.s, y: v.top + b.y * v.s, r: b.r * v.s, ts: w.layout.thingSize * v.s }));
      }, [pass]);
      await sleep(60);
      // re-read positions right at the shot (bubbles still drift slowly)
      const pos = await page.evaluate(() => { const w = PB.debug.world, v = PB.debug.view(); return w.bubbles.map(b => ({ x: v.left + b.x * v.s, y: v.top + b.y * v.s })); });
      const f = `${DEV}-s${s}-p${pass}.png`;
      await page.screenshot({ path: path.join(OUT, f) });
      info.forEach((b, i) => { b.x = pos[i].x; b.y = pos[i].y; b.file = f; b.season = s; all.push(b); });
    }
  } catch (e) { console.log('EXC', e.message.split('\n')[0]); }
  fs.writeFileSync(path.join(OUT, `${DEV}-bubbles.json`), JSON.stringify(all));
  console.log('bubbles', all.length, page._errs.join('\n'));
  await ctx.close(); await browser.close(); srv.close();
})();
