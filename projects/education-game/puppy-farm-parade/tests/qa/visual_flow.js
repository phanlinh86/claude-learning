// Visual QA flow capture (report-only): every screen and the key motion moments × devices × languages × 4 moods.
//   node tests/qa/visual_flow.js            DEV=ip-p,pad-l LANGS=en  (subsets)   MOODS=0,3
// -> tests/out/qa_visual/flow-<dev>-<lang>-*.png + flow-<dev>-<lang>.json (geometry per shot, logical px)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const { DEVS, OUT, sleep, until, env, open, geomSnap } = require('./visual_lib');
const DEV_LIST = env('DEV', Object.keys(DEVS)), LANGS = env('LANGS', ['en', 'vi']), MOODS = env('MOODS', ['0', '1', '2', '3']).map(Number);
const TOPICS = ['colors', 'shapes', 'count', 'animals'];
const PAR = +(process.env.PAR || 3);

async function run(browser, srv, dev, lang) {
  const { ctx, page } = await open(browser, srv, dev, lang);
  const tag = `flow-${dev}-${lang}`, geo = {}, errs = [];
  const shot = async (name, g = true) => {
    await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
    if (g) geo[name] = await page.evaluate(geomSnap);
  };
  const freeze = () => page.evaluate(() => FP.debug.setSpeed(0.1));
  const speed = n => page.evaluate(n => FP.debug.setSpeed(n), n);
  const standing = () => until(page, () => { const w = FP.debug.world; return w.state === 'round' && w.interactive && w.members.length && w.members.every(m => m.state === 'stand' && !m.walking); });
  try {
    await sleep(600); await shot('00-title', false);
    await page.evaluate(() => { FP.UI.refreshSettings(); FP.UI.only('scrSettings'); }); await sleep(400); await shot('01-settings', false);
    await page.evaluate(() => FP.UI.only('scrTitle')); await sleep(200);
    await page.evaluate(() => FP.debug.startGame());
    for (const lv of MOODS) {
      const topic = TOPICS[lv], p = `${lv + 1}${['m', 'n', 's', 'x'][lv]}`;
      await page.evaluate(([lv, t]) => { const w = FP.debug.world; w.levels[lv] = t; w.startLevel(lv); FP.debug.weather.setWeather(lv, { instant: true }); FP.debug.setSpeed(4); }, [lv, topic]);
      // skip the warm-up round with the bot → round 1 (4 members)
      await standing();
      await page.evaluate(() => { FP.debug.setBot(true, 1); FP.debug.setSpeed(8); });
      const r0 = await page.evaluate(() => FP.debug.world.round);
      await until(page, r0 => FP.debug.world.state === 'round' && FP.debug.world.round !== r0, r0);
      await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
      // enter mid-motion
      await until(page, () => FP.debug.world.members.some(m => m.walking), null, 6000).catch(() => errs.push('enter: no walking member seen'));
      await sleep(lv === 0 ? 650 : 900); await freeze(); await shot(`${p}-a-enter`); await speed(4);
      await standing(); await speed(1); await sleep(500);
      await shot(`${p}-b-play`);
      // wrong wiggle
      await page.evaluate(() => { const w = FP.debug.world, m = w.members.find(m => !m.odd && m.state === 'stand'); w.pointerDown(m.cx, m.cy); w.pointerUp(m.cx, m.cy); });
      await sleep(110); await freeze(); await shot(`${p}-c-wrong`); await speed(1);
      await sleep(1200);
      // hint hand
      await page.evaluate(() => { const w = FP.debug.world; w._lastHintT = -1e9; w.hint(); });
      await sleep(900); await freeze(); await shot(`${p}-d-hint`); await speed(1);
      await until(page, () => !FP.debug.world.hintHand, null, 8000).catch(() => {});
      // hop apex
      await page.evaluate(() => { const w = FP.debug.world, a = w.answer(), h = w.memberHit(a.member); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
      await until(page, () => FP.debug.world.members.some(m => m.state === 'hop'));
      await sleep(300); await freeze();
      const apex = await page.evaluate(() => { const m = FP.debug.world.members.find(m => m.state === 'hop'); return m ? { y: m.y - m.bob, cy: m.cy, top: m.cy - m.size / 2 } : null; });
      await shot(`${p}-e-hop`); geo[`${p}-e-hop`].apex = apex; await speed(1);
      await sleep(1500); await shot(`${p}-f-stage`);
      // gate with ghost hand
      await until(page, () => { const w = FP.debug.world; return w.phase === 'gate' && w.hintHand && w.hintHand.mode === 'door'; }, null, 15000).catch(() => {});
      await sleep(500); await shot(`${p}-g-gate`);
      await page.evaluate(() => { const w = FP.debug.world, d = w.doorHit(); w.pointerDown(d.cx, d.cy); w.pointerUp(d.cx, d.cy); });
      await sleep(550); await freeze(); await shot(`${p}-h-doors`); await speed(1);
      await sleep(900); await freeze(); await shot(`${p}-i-march`); await speed(1);
      if (lv === 1) { await sleep(300); await page.click('#btnPause'); await sleep(400); await shot('p-pause', false); await page.click('#btnResume'); await sleep(200); }
    }
    // Talk time of the last chapter
    await page.evaluate(() => { FP.debug.setBot(true, 1); FP.debug.setSpeed(8); });
    await until(page, () => FP.debug.mode === 'talk', null, 150000);
    await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
    await sleep(900); await shot('t-talk', false);
    geo['t-talk'] = await page.evaluate(() => { const p = document.querySelector('.talk-panel').getBoundingClientRect(); const q = document.getElementById('talkQ'); return { panel: { t: p.top, b: p.bottom, l: p.left, r: p.right, ih: innerHeight, iw: innerWidth }, q: q.textContent, qH: q.getBoundingClientRect().height, choices: [...document.querySelectorAll('#talkChoices > *')].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }; });
    // celebration: last chapter to the end
    await page.evaluate(() => { FP.debug.setBot(true, 1); FP.debug.setSpeed(8); });
    await until(page, () => FP.debug.mode === 'done', null, 200000).catch(() => errs.push('no done screen'));
    await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
    await sleep(2500); await shot('z-done', false); await sleep(2500); await shot('z-done2', false);
  } catch (e) { errs.push(e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }); }
  errs.push(...page._errs);
  fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify({ geo, errs }, null, 1));
  await ctx.close();
  console.log('done', tag, errs.length ? errs : '');
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const jobs = []; for (const d of DEV_LIST) for (const l of LANGS) jobs.push([d, l]);
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (i < jobs.length) { const j = jobs[i++]; await run(browser, srv, ...j); } }));
  await browser.close(); srv.close();
})();
