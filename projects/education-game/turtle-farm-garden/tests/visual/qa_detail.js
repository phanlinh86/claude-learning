// Visual-QA detail probe (report-only, never edits game/): dpr-3 close-ups of Tumi + the watering can at rest, carrots,
// the rosette hop (frame strip), finish butterflies, an animal walking home, the hay bale room per viewport/choice count.
//   OUT=dir node tests/visual/qa_detail.js   → <OUT>/det-<vp>-*.png + <OUT>/det.json
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = process.env.OUT || path.join(__dirname, '..', 'out', 'visual_qa'); fs.mkdirSync(OUT, { recursive: true });
const VPS = {
  'ip-p': { vp: [393, 852], ins: [59, 0, 34, 0] }, 'ip-l': { vp: [852, 393], ins: [0, 59, 21, 59] },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0] }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0] }
};
const until = (page, fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 20 });
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const out = {};
  for (const [vp, d] of Object.entries(VPS)) {
    if (process.env.VP && !process.env.VP.split(',').includes(vp)) continue;
    const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const R = out[vp] = {};
    const clip = async (name, x, y, w, h) => {
      x = Math.max(0, x); y = Math.max(0, y); w = Math.min(w, d.vp[0] - x); h = Math.min(h, d.vp[1] - y);
      await page.screenshot({ path: path.join(OUT, `det-${vp}-${name}.png`), clip: { x, y, width: w, height: h } });
    };
    try {
      await page.goto(srv.url + '?mute=1&novoice=1&seed=5&age=4&lang=en');
      await until(page, () => window.FT && FT.debug && FT.debug.mode === 'title');
      await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
      await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(400);
      // hay bale room: plan with n choices + sack
      R.sackRoom = await page.evaluate(() => { const w = FT.debug.world, L = w.layout, o = {};
        for (const n of [2, 3, 4, 5]) { const c = FT.World.computeLayout(L.W, L.H, L.ins, {}, { n, sack: true }, null); o[n] = !!c.sack; } return o; });
      await page.evaluate(() => { FT.debug.startGame(); const w = FT.debug.world; w.cfg.surpriseTypes = []; w.levels[0] = 'colors'; w.startLevel(0); FT.debug.setSpeed(4); });
      await until(page, () => FT.debug.world.interactive);
      await page.evaluate(() => FT.debug.setSpeed(1)); await page.waitForTimeout(700);
      const tumi = await page.evaluate(() => FT.debug.mochiScreen());
      const trayR = await page.evaluate(() => { const w = FT.debug.world, v = FT.debug.view(), L = w.layout, F = L.frame || 0; return { x: v.left + (L.tray.x - F) * v.s, y: v.top + (L.tray.y - F) * v.s, w: (L.tray.w + 2 * F) * v.s, h: (L.tray.h + 2 * F) * v.s, groundY: v.top + (L.groundY || 0) * v.s }; });
      R.tumi = tumi; R.tray = trayR;
      R.canRest = await page.evaluate(() => { const r = FT.render; const v = r && r._bagV; return v ? { x: v.x, y: v.y, a: v.a, s: v.s } : null; });
      await clip('tumi-rest', tumi.x - tumi.w, tumi.y - tumi.h * 0.7, tumi.w * 2.4, tumi.h * 1.5);
      // carrots: count round → chips step
      await page.evaluate(() => { const w = FT.debug.world; w.levels[2] = 'count'; w.startLevel(2); FT.debug.setBot(true, 1); FT.debug.setSpeed(4); });
      await until(page, () => { const w = FT.debug.world; return w.stepInfo && w.stepInfo.mode === 'chips' && w.chips.length >= 2; });
      await page.evaluate(() => { FT.debug.setBot(false); FT.debug.setSpeed(1); }); await page.waitForTimeout(700);
      await clip('carrots', trayR.x, trayR.y, trayR.w, trayR.h);
      await clip('tumi-chips', tumi.x - tumi.w, tumi.y - tumi.h * 0.7, tumi.w * 2.4, tumi.h * 1.5);
      R.chips = await page.evaluate(() => { const w = FT.debug.world, s = FT.debug.view().s * w.layout.tray.s; return w.chips.map(c => ({ r: c.r, screenR: +(c.r * s).toFixed(1) })); });
      // finish + hop strip
      await page.evaluate(() => { FT.debug.setBot(true, 1); FT.debug.setSpeed(1); });
      await until(page, () => FT.debug.world.phase === 'finish' && FT.debug.world.phaseTime > 0.45);
      await page.evaluate(() => FT.debug.setSpeed(0.1)); await page.waitForTimeout(150);
      R.butterflies = await page.evaluate(() => (FT.debug.world.butterflies || []).map(b => ({ x: Math.round(b.x), y: Math.round(b.y), hex: b.hex, a: +(b.alpha || 0).toFixed(2) })));
      await clip('finish', trayR.x - 20, trayR.y - 140, trayR.w + 40, trayR.h + 160);
      await page.evaluate(() => FT.debug.setSpeed(1));
      await until(page, () => FT.debug.world.phase === 'hop');
      await page.evaluate(() => FT.debug.setSpeed(0.15));
      R.hop = [];
      for (let k = 0; k < 8; k++) {
        const it = await page.evaluate(() => { const w = FT.debug.world, v = FT.debug.view(), it = w.cookie || (w.rackCookies || [])[w.rackCookies.length - 1];
          return it ? { t: +w.phaseTime.toFixed(2), x: Math.round(v.left + it.x * v.s), y: Math.round(v.top + it.y * v.s), size: Math.round((it.size || 0) * (it.sx || 1) * v.s), slot: w.layout.rack && w.layout.rack.slots ? Math.round(FT.debug.view().s * (w.layout.rack.slotSize || 0)) : null } : null; });
        R.hop.push(it);
        await page.screenshot({ path: path.join(OUT, `det-${vp}-hop${k}.jpg`), type: 'jpeg', quality: 70, scale: 'css' });
        await page.waitForTimeout(220);
      }
      await page.evaluate(() => FT.debug.setSpeed(1));
      // animals walk home
      await page.evaluate(() => { const w = FT.debug.world; w.levels[3] = 'animals'; w.startLevel(3); FT.debug.setBot(true, 1); FT.debug.setSpeed(4); });
      await until(page, () => FT.debug.world.topic === 'animals' && FT.debug.world.phase === 'hop' && !!FT.debug.world.walker, null, 40000).catch(() => {});
      await page.evaluate(() => FT.debug.setSpeed(0.25));
      for (let k = 0; k < 3; k++) { await page.waitForTimeout(250); await clip('walk' + k, trayR.x, trayR.y, trayR.w, trayR.h); }
      await page.evaluate(() => FT.debug.setSpeed(1));
      // butterfly surprise close-up
      await page.evaluate(() => { FT.debug.setBot(false); const w = FT.debug.world; w.cfg.surpriseTypes = ['bird']; w.levels[1] = 'shapes'; w.startLevel(1); w._surpriseRound = 1; w.round = 1; FT.debug.setSpeed(6); });
      await until(page, () => FT.debug.world.state === 'round' && FT.debug.world.interactive, null, 20000).catch(() => {});
      await until(page, () => !!FT.debug.world.bird && FT.debug.world.bird.x > 150, null, 10000).catch(() => {});
      await page.evaluate(() => FT.debug.setSpeed(0.2));
      R.bird = await page.evaluate(() => { const b = FT.debug.birdScreen(); const ch = (FT.debug.world.choices || []).map(c => FT.debug.choiceScreen(c.id)); return { bird: b, choices: ch }; });
      if (R.bird.bird) await clip('bird', R.bird.bird.x - 90, R.bird.bird.y - 70, 180, 140);
    } catch (e) { R.error = e.message.split('\n')[0]; }
    await ctx.close(); console.log('detail', vp, R.error || 'ok');
  }
  fs.writeFileSync(path.join(OUT, 'det.json'), JSON.stringify(out, null, 1));
  await browser.close(); srv.close();
})();
