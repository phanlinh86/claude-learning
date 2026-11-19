// Visual QA screenshots (Mochi's Icing Bakery): title, settings, each chapter mid-trace (colours, shapes, counting chips,
// animals road + letters), a surprise (mouse / bird), Talk time, session done (gallery) — on iPhone portrait / landscape and
// iPad portrait / landscape (emulated safe-area insets), in English and Vietnamese.
//   node tests/visual/screens.js        → docs/reports/visual/<vp>-<lang>-NN-<name>.jpg   (ONLY=ip-l, LANGS=en to narrow)
// Report-only: drives the page through IB.debug, never edits game/. Exits 1 on console errors.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', '..', 'docs', 'reports', 'visual'); fs.mkdirSync(OUT, { recursive: true });
// insets in CSS px (iPhone 15 Dynamic Island; iPad home indicator)
const VPS = {
  'ip-p': { vp: [393, 852], dpr: 3, ins: [59, 0, 34, 0] }, 'ip-l': { vp: [852, 393], dpr: 3, ins: [0, 59, 21, 59] },
  'pad-p': { vp: [820, 1180], dpr: 2, ins: [24, 0, 20, 0] }, 'pad-l': { vp: [1180, 820], dpr: 2, ins: [24, 0, 20, 0] }
};
const LANGS = (process.env.LANGS || 'en,vi').split(',');
const until = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
/** jump to a chapter topic and let the world (not the bot) trace part of the path — mid-trace with the bag under the "finger" */
async function midTrace(page, topic, age, frac) {
  await page.evaluate(({ topic, age }) => {
    IB.debug.setBot(false); const w = IB.debug.world; w.setAge(age); w.age = age; w.cfg.surpriseTypes = [];
    w.levels[1] = topic; w.startLevel(1); IB.debug.setSpeed(6);
  }, { topic, age });
  for (let k = 0; k < 4; k++) {   // picks via world taps until the trace step
    await until(page, () => IB.debug.world.interactive);
    const m = await page.evaluate(() => IB.debug.world.stepInfo.mode);
    if (m === 'trace') break;
    await page.evaluate(() => { const w = IB.debug.world, a = w.answer(); if (a && a.choice) { const h = w.choiceHit(a.choice); w.tap(h.x, h.y); } });
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => IB.debug.setSpeed(1));
  await page.evaluate(f => {   // press at the start and slide part of the way (finger stays down)
    const w = IB.debug.world, pts = w.pathScreen(); if (!pts.length) return;
    w.pointerDown(pts[0][0], pts[0][1]);
    const n = Math.floor(pts.length * f);
    for (let i = 1; i <= n; i++) w.pointerMove(pts[i][0], pts[i][1]);
    window.__finger = pts[n];
  }, frac);
  await page.waitForTimeout(250);
  // a little more slide while the frame renders (the bag spring catches up)
  await page.evaluate(() => { const w = IB.debug.world, p = window.__finger; if (p) w.pointerMove(p[0] + 0.5, p[1] + 0.5); });
}
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const errors = [];
  for (const [vp, d] of Object.entries(VPS)) for (const lang of LANGS) { if (process.env.ONLY && process.env.ONLY !== vp) continue;
    const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(vp + ' ' + m.text()); });
    page.on('pageerror', e => errors.push(vp + ' ' + String(e)));
    const key = vp + '-' + lang;
    const shot = n => page.screenshot({ path: path.join(OUT, `${key}-${n}.jpg`), type: 'jpeg', quality: 55 });   // dpr 1 + JPEG: the set stays < 6 MB
    await page.goto(srv.url + `?mute=1&novoice=1&seed=5&age=4&lang=${lang}`);
    await until(page, () => window.IB && IB.debug && IB.debug.mode === 'title');
    await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
    await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(500);
    await shot('01-title');
    await page.evaluate(() => { document.getElementById('scrTitle').classList.add('hidden'); IB.UI.refreshSettings(); document.getElementById('scrSettings').classList.remove('hidden'); });
    await page.waitForTimeout(400); await shot('02-settings');
    await page.evaluate(() => { document.getElementById('scrSettings').classList.add('hidden'); });
    // chapter banner, then a colour round waiting for the bag
    await page.evaluate(() => { IB.debug.startGame(); const w = IB.debug.world; w.cfg.surpriseTypes = []; w.levels[0] = 'colors'; w.startLevel(0); });
    await page.waitForTimeout(700); await shot('03-banner');
    await page.evaluate(() => IB.debug.setSpeed(4));
    await until(page, () => IB.debug.world.interactive);
    await page.evaluate(() => IB.debug.setSpeed(1)); await page.waitForTimeout(400); await shot('04-pick');
    // each chapter mid-trace
    const chapters = [['colors', 4, 0.5], ['shapes', 4, 0.6], ['count', 4, 0.55], ['animals', 4, 0.5], ['letters', 5, 0.45]];
    let i = 5;
    for (const [topic, age, f] of chapters) {
      await midTrace(page, topic, age, f);
      await shot(String(i++).padStart(2, '0') + '-trace-' + topic);
      await page.evaluate(() => { const w = IB.debug.world; if (w._press) w.pointerUp(window.__finger[0], window.__finger[1]); });
    }
    // chips: finish the count trace with the bot, catch the chips step
    await page.evaluate(() => { const w = IB.debug.world; w.levels[2] = 'count'; w.startLevel(2); IB.debug.setBot(true, 1); IB.debug.setSpeed(4); });
    await until(page, () => { const w = IB.debug.world; return w.stepInfo && w.stepInfo.mode === 'chips' && w.chips.length >= 2; });
    await page.evaluate(() => { IB.debug.setBot(false); IB.debug.setSpeed(1); }); await page.waitForTimeout(500); await shot('10-chips');
    // the hop onto the rack
    await page.evaluate(() => { IB.debug.setBot(true, 1); IB.debug.setSpeed(1); });
    try {
      await until(page, () => IB.debug.world.phase === 'finish' && IB.debug.world.phaseTime > 0.5, null, 20000);
      await page.evaluate(() => IB.debug.setSpeed(0.15)); await page.waitForTimeout(300); await shot('11-finish');
      await page.evaluate(() => IB.debug.setSpeed(1));
      await until(page, () => IB.debug.world.phase === 'hop' && IB.debug.world.phaseTime > 0.7, null, 20000);
      await page.evaluate(() => IB.debug.setSpeed(0.1)); await page.waitForTimeout(200); await shot('12-hop');
    } catch (e) { console.log('  (missed the finish / hop moment on ' + key + ')'); }
    // a mouse round (sack) and a bird round
    for (const sp of ['mouse', 'bird']) {
      await page.evaluate(sp => { IB.debug.setBot(false); const w = IB.debug.world; w.cfg.surpriseTypes = [sp]; w.levels[3] = 'animals'; w.startLevel(3); w._surpriseRound = 1; w.round = 1; IB.debug.setSpeed(6); }, sp);
      await until(page, () => IB.debug.world.state === 'round' && IB.debug.world.interactive, null, 20000)
        .catch(async () => console.log('  (no interactive ' + sp + ' round on ' + key + ': ' + JSON.stringify(await page.evaluate(() => IB.debug.getState())).slice(0, 300) + ')'));
      if (sp === 'bird') await until(page, () => !!IB.debug.world.bird && IB.debug.world.bird.x > 250 && IB.debug.world.bird.x < IB.debug.world.layout.W - 250, null, 8000).catch(() => {});
      else await until(page, () => IB.debug.world.sack && IB.debug.world.sack.mouse > 0.9, null, 8000).catch(() => {});   // short: a minute of no touch auto-pauses the game
      await page.evaluate(() => IB.debug.setSpeed(0.2)); await page.waitForTimeout(300); await shot('13-' + sp);
    }
    // Talk time
    await page.evaluate(() => { IB.debug.setSpeed(1); const w = IB.debug.world; w.levels[1] = 'shapes'; w.startLevel(1); IB.debug.setSpeed(6); });
    await until(page, () => IB.debug.world.state === 'round');
    await page.evaluate(() => { IB.debug.world._startTalk(); IB.debug.setSpeed(1); });
    await page.waitForTimeout(800); await shot('14-talk');
    // session done: bot at high speed
    await page.evaluate(() => { IB.debug.setBot(true, 0.85); IB.debug.setSpeed(30); IB.debug.startGame(); });
    await until(page, () => IB.debug.mode === 'done', null, 300000);
    await page.evaluate(() => IB.debug.setSpeed(1)); await page.waitForTimeout(1500); await shot('15-done');
    await ctx.close();
    console.log('screens', key);
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no console errors', '→', OUT);
  process.exit(errors.length ? 1 : 0);
})();
