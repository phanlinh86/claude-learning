// Visual QA probe: where the sun / moon sit versus the aurora ribbon (layout.shelf) and the bubble, per device.
//   node tests/visual/sky_probe.js   -> prints a table (logical px) + tests/out/visual/sky_probe.json
// Report-only: reads NK.render._env and NK.debug.world.layout, never edits game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual'); fs.mkdirSync(OUT, { recursive: true });
const DEVS = {
  'ip-p': { vp: [393, 852], ins: [47, 0, 34, 0] }, 'ip-l': { vp: [852, 393], ins: [0, 47, 21, 47] },
  'se-p': { vp: [375, 667], ins: [20, 0, 0, 0] },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0] }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0] },
  'pro-l': { vp: [1366, 1024], ins: [24, 0, 20, 0] }
};
(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = {};
  for (const [dev, d] of Object.entries(DEVS)) {
    const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(srv.url + '?mute=1&novoice=1&seed=5&age=4&lang=en');
    await page.waitForFunction(() => window.NK && NK.debug && NK.debug.mode === 'title');
    await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); NK.debug.startGame(); });
    await page.waitForFunction(() => NK.debug.world.state === 'round' && NK.debug.world.phase === 'dig', null, { timeout: 30000 });
    await new Promise(r => setTimeout(r, 400));
    res[dev] = await page.evaluate(() => {
      const L = NK.debug.world.layout, E = NK.render._env, sh = L.shelf, out = {};
      const r = b => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
      for (const m of ['spring', 'summer', 'autumn', 'winter']) {
        const s = E.sun[m], b = { x: s.x - s.size * 0.25, y: s.y - s.size * 0.25, w: s.size * 0.5, h: s.size * 0.5 };   // the disc ≈ half the image
        const ov = Math.max(0, Math.min(b.x + b.w, sh.x + sh.w) - Math.max(b.x, sh.x)) * Math.max(0, Math.min(b.y + b.h, sh.y + sh.h) - Math.max(b.y, sh.y));
        out[m] = { x: Math.round(s.x), y: Math.round(s.y), size: Math.round(s.size), discOverlapsRibbonPx2: Math.round(ov) };
      }
      return { W: L.W, H: L.H, shelf: r(sh), slots: sh.slots.length, slotSize: Math.round(sh.size), bubble: r(L.bubble), hillTop: Math.round(E.hillTop), sun: out };
    });
    console.log(dev, JSON.stringify(res[dev]));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'sky_probe.json'), JSON.stringify(res, null, 1));
  await browser.close(); srv.close();
})();
