// Visual QA (report-only): every answer colour on every mood — a colours round whose members are re-painted to
// red/blue/yellow/green/orange/purple/pink (kept on their wagons), then one member hopped onto the hay stage (yellow on hay).
// Also samples the rendered canvas pixels (path behind the line, hay, member body) for contrast numbers.
//   node tests/qa/visual_colors.js  DEV=ip-l
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const { OUT, sleep, until, env, open } = require('./visual_lib');
const DEV_LIST = env('DEV', ['ip-l', 'ip-p']);
const SETS = [['red', 'blue', 'yellow', 'green'], ['orange', 'purple', 'pink', 'yellow']];
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const res = {};
  for (const dev of DEV_LIST) {
    const { ctx, page } = await open(browser, srv, dev, 'en', 5, 3);
    await page.evaluate(() => FP.debug.startGame());
    for (let lv = 0; lv < 4; lv++) {
      await page.evaluate(lv => { const w = FP.debug.world; w.levels[lv] = 'shapes'; w.startLevel(lv); FP.debug.weather.setWeather(lv, { instant: true }); FP.debug.setSpeed(4); }, lv);
      const standing = () => until(page, () => { const w = FP.debug.world; return w.state === 'round' && w.interactive && w.members.length && w.members.every(m => m.state === 'stand' && !m.walking); });
      await standing();
      // skip to a 4-member round
      for (let k = 0; k < 2; k++) {
        const n = await page.evaluate(() => FP.debug.world.members.length); if (n >= 4) break;
        await page.evaluate(() => { FP.debug.setBot(true, 1); FP.debug.setSpeed(8); });
        const r0 = await page.evaluate(() => FP.debug.world.round);
        await until(page, r0 => FP.debug.world.state === 'round' && FP.debug.world.round !== r0, r0);
        await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(4); }); await standing();
      }
      for (let si = 0; si < SETS.length; si++) {
        await page.evaluate(set => { FP.debug.world.members.forEach((m, i) => { m.thing = Object.assign({}, m.thing, { color: set[i % set.length] }); }); FP.debug.setSpeed(1); }, SETS[si]);
        await sleep(400);
        const name = `colors-${dev}-${lv}-${si}`;
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        res[name] = await page.evaluate(() => {
          const c = document.getElementById('game'), g = c.getContext('2d'), w = FP.debug.world, k = c.width / w.layout.W;
          const px = (x, y) => { const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); };
          const L = w.layout, ms = w.members;
          const gapX = (ms[0].x + ms[1].x) / 2;
          return { pathBehind: px(gapX, L.line.y - 30), pathAtFeet: px(gapX, L.line.y + 4), hay: px(w.stage.x - 40, w.stage.y + 30), sky: px(L.W / 2, L.bubble.y + L.bubble.h + 40),
            bodies: ms.map(m => ({ c: m.thing.color, px: px(m.x, m.y - m.size * 0.55) })) };
        });
      }
      // a yellow member on the hay stage
      await page.evaluate(() => { const w = FP.debug.world, a = w.answer(); const m = w.memberById(a.member); m.thing = Object.assign({}, m.thing, { color: 'yellow' }); const h = w.memberHit(a.member); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
      await sleep(1500);
      await page.screenshot({ path: path.join(OUT, `colors-${dev}-${lv}-stage-yellow.png`) });
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'colors.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 0));
})();
