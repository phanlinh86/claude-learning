// Visual QA probe: aurora-ribbon slot geometry (slot order, item tops vs the bubble / HUD) per device. Report-only.
//   node tests/visual/ribbon_probe.js -> prints one line per device (logical px)
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const DEVS = { 'ip-p': [393, 852, 47, 0, 34, 0], 'ip-l': [852, 393, 0, 47, 21, 47], 'se-p': [375, 667, 20, 0, 0, 0], 'pad-p': [820, 1180, 24, 0, 20, 0], 'pad-l': [1180, 820, 24, 0, 20, 0], 'pro-l': [1366, 1024, 24, 0, 20, 0] };
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  for (const [dev, d] of Object.entries(DEVS)) {
    const ctx = await browser.newContext({ viewport: { width: d[0], height: d[1] }, isMobile: true, hasTouch: true }), page = await ctx.newPage();
    await page.goto(srv.url + '?mute=1&novoice=1&seed=5&age=4&lang=vi');
    await page.waitForFunction(() => window.NK && NK.debug && NK.debug.mode === 'title');
    await page.addStyleTag({ content: `:root{--sa-t:${d[2]}px!important;--sa-r:${d[3]}px!important;--sa-b:${d[4]}px!important;--sa-l:${d[5]}px!important}` });
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); NK.debug.startGame(); });
    await page.waitForFunction(() => NK.debug.world.state === 'round' && NK.debug.world.phase === 'dig', null, { timeout: 30000 });
    await new Promise(r => setTimeout(r, 300));
    const r = await page.evaluate(() => {
      const L = NK.debug.world.layout, sh = L.shelf, b = L.bubble, hud = L.hud, s = sh.size;
      const hatH = NK.DigArt.thingBox({ kind: 'hat', color: 'red' }, s).h, tabH = NK.DigArt.thingBox({ kind: 'tablet', text: '12' }, s).h;
      const sl = sh.slots.map(q => Math.round(q.x));
      const topY = Math.min(...sh.slots.map(q => q.y)) - Math.max(hatH, tabH);
      const tail = 21;
      return { slots: sl.length, firstSlotX: sl[0], lastSlotX: sl[sl.length - 1], slotY: Math.round(sh.slots[0].y), size: Math.round(s), pitch: Math.round(Math.abs(sl[1] - sl[0])),
        itemTop: Math.round(topY), bubbleBottom: Math.round(b.y + b.h), bubbleTailBottom: Math.round(b.y + b.h + tail), gapToBubble: Math.round(topY - (b.y + b.h)),
        hud: hud ? { x: Math.round(hud.x), bottom: Math.round(hud.y + hud.h) } : null };
    });
    console.log(dev, JSON.stringify(r));
    await ctx.close();
  }
  await browser.close(); srv.close();
})();
