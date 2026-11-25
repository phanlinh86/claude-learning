// Prints the in-browser layout decision (row vs column, tray scale, hudKeep) per viewport — visual-QA helper, report-only.
const { chromium } = require('playwright'); const serve = require('../e2e/serve');
(async () => {
  const srv = await serve(), b = await chromium.launch();
  for (const [w, h, ins] of [[852, 393, [0, 47, 21, 47]], [852, 393, [0, 0, 0, 0]], [667, 375, [0, 0, 0, 0]], [1180, 820, [24, 0, 20, 0]]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
    await p.goto(srv.url + '?mute=1&novoice=1&seed=5&age=4');
    await p.waitForFunction(() => window.FT && FT.debug && FT.debug.mode === 'title');
    await p.addStyleTag({ content: `:root{--sa-t:${ins[0]}px!important;--sa-r:${ins[1]}px!important;--sa-b:${ins[2]}px!important;--sa-l:${ins[3]}px!important}` });
    await p.evaluate(() => window.dispatchEvent(new Event('resize'))); await p.waitForTimeout(400);
    await p.evaluate(() => { FT.debug.startGame(); FT.debug.world.startLevel(0); FT.debug.setSpeed(4); });
    await p.waitForFunction(() => FT.debug.world.interactive); 
    console.log(w + 'x' + h, JSON.stringify(ins), await p.evaluate(() => { const w = FT.debug.world, L = w.layout; const c = FT.World.computeLayout(L.W, L.H, L.ins, {}, w._plan(), null);
      return JSON.stringify({ column: L.choices.column, s: +L.tray.s.toFixed(2), hudKeep: w.hudKeep, noKeep: { column: c.choices.column, s: +c.tray.s.toFixed(2) }, W: L.W, ins: L.ins }); }));
    await ctx.close();
  }
  await b.close(); srv.close();
})();
