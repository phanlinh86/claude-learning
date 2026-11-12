// Visual QA (report-only): every topic of every age 3–7 in play (round 1 and the last round), chapter mood = level.
//   node tests/qa/visual_ages.js   DEV=ip-p,pad-l LANGS=en,vi AGES=3,4,5,6,7
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const { DEVS, OUT, sleep, until, env, open, geomSnap } = require('./visual_lib');
const DEV_LIST = env('DEV', ['ip-p', 'pad-l', 'and-p']), LANGS = env('LANGS', ['en', 'vi']), AGES = env('AGES', ['3', '4', '5', '6', '7']).map(Number);
const PAR = +(process.env.PAR || 4);

async function run(browser, srv, dev, lang, age) {
  const { ctx, page } = await open(browser, srv, dev, lang, age, 9);
  const tag = `age${age}-${dev}-${lang}`, geo = {}, errs = [];
  const standing = () => until(page, () => { const w = FP.debug.world; return w.state === 'round' && w.interactive && w.members.length && w.members.every(m => m.state === 'stand' && !m.walking); });
  const skip = async () => {
    await page.evaluate(() => { FP.debug.setBot(true, 1); FP.debug.setSpeed(8); });
    const r0 = await page.evaluate(() => FP.debug.world.round);
    await until(page, r0 => FP.debug.world.state === 'round' && FP.debug.world.round !== r0, r0);
    await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(4); });
    await standing();
  };
  try {
    await page.evaluate(() => FP.debug.startGame());
    const topics = await page.evaluate(a => FP.AGE_TOPICS[a], age);
    for (let lv = 0; lv < 4; lv++) {
      await page.evaluate(([lv, t]) => { const w = FP.debug.world; w.levels[lv] = t; w.startLevel(lv); FP.debug.weather.setWeather(lv, { instant: true }); FP.debug.setSpeed(4); }, [lv, topics[lv]]);
      await standing(); await skip();
      for (const r of ['r1', 'r3']) {
        if (r === 'r3') { await skip(); await skip(); }
        await page.evaluate(() => FP.debug.setSpeed(1)); await sleep(500);
        const n = `${lv + 1}-${topics[lv]}-${r}`;
        await page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) });
        geo[n] = await page.evaluate(geomSnap);
        geo[n].bubbleTxt = await page.evaluate(() => document.getElementById('bubbleText').textContent);
        geo[n].bubbleOver = await page.evaluate(() => document.getElementById('bubbleText').getBoundingClientRect().height - document.getElementById('bubble').clientHeight);
      }
    }
  } catch (e) { errs.push(e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }); }
  errs.push(...page._errs);
  fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify({ geo, errs }, null, 1));
  await ctx.close();
  console.log('done', tag, errs.length ? errs : '');
}
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const jobs = []; for (const a of AGES) for (const d of DEV_LIST) for (const l of LANGS) jobs.push([d, l, a]);
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (i < jobs.length) { const j = jobs[i++]; await run(browser, srv, ...j); } }));
  await browser.close(); srv.close();
})();
