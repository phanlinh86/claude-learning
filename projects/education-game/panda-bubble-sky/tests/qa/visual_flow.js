// Visual QA flow capture (Bao's Bubble Sky): every screen of a session on one device × language, DPR 1, notch insets.
//   DEV=ip-p LANG=vi node tests/qa/visual_flow.js   -> tests/out/qa_visual/<dev>-<lang>-*.png + geom JSON lines on stdout
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const G = require('./visual_geom');
const OUT = path.join(__dirname, '..', 'out', 'qa_visual'); fs.mkdirSync(OUT, { recursive: true });
const DEV = process.env.DEV || 'ip-p', LANG = process.env.LANG2 || process.env.QLANG || 'en';
const AGE = +(process.env.AGE || 4), SEED = +(process.env.SEED || 5);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve(); const browser = await chromium.launch();
  const { page, ctx } = await G.open(browser, srv, DEV, LANG, AGE, SEED);
  const tag = `${DEV}-${LANG}`, shot = async n => { await page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) }); const g = await page.evaluate(G.geom); const iss = g.iss.filter(x => !/btnPause text overflow/.test(x)); console.log(tag, n, n === '04-ask' ? JSON.stringify({ s: g.s, W: g.W, H: g.H, d: g.dCss, thing: g.thingCss, hit: g.hitCss, bao: g.bao.hCss, sbFont: g.sbFont, sb: g.sb, rbTop: g.rbTop, rbOverBaoX: g.rbOverBaoX }) : '', iss.length ? 'ISSUES ' + iss.join(' | ') : ''); };
  const until = (fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 20 });
  try {
    await sleep(700); await shot('00-title');
    await page.evaluate(() => { PB.UI.refreshSettings(); PB.UI.only('scrSettings'); }); await sleep(400); await shot('01-settings');
    await page.evaluate(() => PB.UI.only('scrTitle'));
    await page.evaluate(() => PB.debug.startGame());
    await sleep(900); await shot('02-banner');
    await until(() => PB.debug.world.phase === 'blow' && PB.debug.world.phaseTime > 1.1); await shot('03-blow');
    await until(() => PB.debug.world.interactive); await sleep(900); await shot('04-ask');
    // wrong squish
    await page.evaluate(() => { const w = PB.debug.world, b = w.bubbles.find(q => !q.target && q.state === 'float'); w.pointerDown(b.x, b.y); w.pointerUp(b.x, b.y); });
    await sleep(120); await shot('05-wrong');
    await page.evaluate(() => { const w = PB.debug.world; w.hint(); }); await sleep(900); await shot('06-hint');
    // right pop in slow motion
    await page.evaluate(() => { PB.debug.setSpeed(0.25); const w = PB.debug.world, a = w.answer(), b = w.bubbleById(a.bubble != null ? a.bubble : a.id); w.pointerDown(b.x, b.y); w.pointerUp(b.x, b.y); });
    await sleep(160); await shot('07-pop');
    await until(() => PB.debug.world.bubbles.some(b => b.fstate === 'fly' && b.ft > 0.15));
    await page.evaluate(() => PB.debug.setSpeed(0.1)); await sleep(500); await shot('08-flight');
    await page.evaluate(() => PB.debug.setSpeed(1));
    // finish the round
    for (let i = 0; i < 4; i++) {
      const done = await page.evaluate(() => { const w = PB.debug.world; if (!w.interactive) return true; const a = w.answer(); if (!a) return false; const b = w.bubbleById(a.bubble != null ? a.bubble : a.id); if (b) { w.pointerDown(b.x, b.y); w.pointerUp(b.x, b.y); } return false; });
      if (done) break; await sleep(300);
    }
    await until(() => PB.debug.world.phase === 'rainbow'); await sleep(500); await shot('09-rainbow');
    await until(() => PB.debug.world.phase === 'whoosh'); await sleep(600); await shot('10-whoosh');
    // pause
    await page.click('#btnPause'); await sleep(400); await shot('11-pause'); await page.click('#btnResume'); await sleep(300);
    // talk
    await page.evaluate(() => { PB.debug.setBot(true, 1); PB.debug.setSpeed(8); });
    await until(() => PB.debug.world.state === 'talk', null, 90000);
    await page.evaluate(() => { PB.debug.setBot(false); PB.debug.setSpeed(1); }); await sleep(900); await shot('12-talk');
    if (!process.env.NODONE) {
      await page.evaluate(() => { const w = PB.debug.world; w.startLevel(w.levels.length - 1); PB.debug.setBot(true, 1); PB.debug.setSpeed(8); });
      await until(() => PB.debug.mode === 'done', null, 100000);
      await page.evaluate(() => { PB.debug.setBot(false); PB.debug.setSpeed(1); }); await sleep(1600); await shot('13-done');
    }
  } catch (e) { console.log('EXC', tag, e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }); }
  for (const e of page._errs) console.log('PAGEERR', tag, e);
  await ctx.close(); await browser.close(); srv.close();
})();
