// Mimi's frames through one stomp, slowed down (speed 0.1): tests/out/qa_visual/pumpseq/<dev>-<i>.png
const { chromium } = require('playwright'); const path = require('path'); const serve = require('../e2e/serve');
(async () => {
  const srv = await serve(); const b = await chromium.launch();
  for (const d of [{ n: 'iphone-landscape', v: { width: 852, height: 393 } }, { n: 'iphone-portrait', v: { width: 393, height: 852 } }]) {
    const ctx = await b.newContext({ viewport: d.v, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
    await p.goto(`${srv.url}?mute=1&seed=5&age=4&lang=en`);
    await p.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title');
    await p.evaluate(() => { DK.debug.startGame(); DK.debug.setSpeed(6); });
    await p.waitForFunction(() => { const w = DK.debug.world; return w.state === 'round' && w.phase === 'play' && w.answer(); }, null, { timeout: 60000, polling: 'raf' });
    await p.evaluate(() => { const w = DK.debug.world, h = w.matHit(w.answer().id); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
    await p.waitForFunction(() => DK.debug.world.phase === 'pump' && DK.debug.world.phaseTime > 0.2, null, { polling: 'raf' });
    await p.evaluate(() => { DK.debug.setSpeed(0.1); const w = DK.debug.world, q = w.layout.pump; w.pointerDown(q.x, q.y); w.pointerUp(q.x, q.y); });
    const info = [];
    for (let i = 0; i < 8; i++) { await p.screenshot({ path: path.join(__dirname, '..', 'out', 'qa_visual', 'pumpseq', `${d.n}-${i}.png`) });
      info.push(await p.evaluate(() => { const w = DK.debug.world; return [w.mimi.frame, w.mimi.sy.toFixed(2), w.pump.press.toFixed(2)].join(' '); })); await p.waitForTimeout(350); }
    console.log(d.n, info.join(' | ')); await ctx.close();
  }
  await b.close(); srv.close();
})();
