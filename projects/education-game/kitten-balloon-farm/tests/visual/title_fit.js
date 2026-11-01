// Title-screen fit check: does the logo / ▶ / star pill clear Miu and the balloon bunch drawn on the canvas?
//   node tests/visual/title_fit.js ["<extra css to try>"]
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const DEV = { iphoneP: [393, 852, 3], ipadP: [820, 1180, 2], iphoneL: [852, 393, 3], ipadL: [1180, 820, 2], seL: [667, 375, 2], miniL: [812, 375, 3], seP: [375, 667, 2] };
const extra = process.argv[2] || '';
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  for (const [dev, [w, h, dpr]] of Object.entries(DEV)) for (const lang of ['en', 'vi']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(srv.url + `?mute=1&novoice=1&lang=${lang}`);
    await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title');
    if (extra) await page.addStyleTag({ content: extra });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const v = KB.debug.view(), L = KB.debug.world.layout, W = v.W, H = v.H, portrait = H > W;
      const mh = portrait ? Math.min(330, H * 0.22) : Math.min(290, H * 0.4);
      const mx = portrait ? W * 0.32 : L.ins.left + W * 0.15, miuTop = L.groundY + 10 - mh - 18;          // incl. the 18 px hop
      const bx = portrait ? W * 0.7 : W - L.ins.right - Math.max(150, W * 0.12), bs = portrait ? 86 : 80, sp = 200;   // mirrors render.js _titleScene
      const bunchTop = L.groundY - (portrait ? 10 : -10) - bs * 2.95 - bs * 0.6;
      const css = (x, y) => ({ x: v.left + x * v.s, y: v.top + y * v.s });
      const R = s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const miu = { l: css(mx - mh * 0.45, 0).x, r: css(mx + mh * 0.45, 0).x, t: css(0, miuTop).y };
      const bunch = { l: css(bx - sp / 2 - bs / 2, 0).x, r: css(bx + sp / 2 + bs / 2, 0).x, t: css(0, bunchTop).y };
      const out = {};
      for (const [k, s] of [['logo', '.logo'], ['tag', '#tagline'], ['play', '#btnPlay'], ['info', '.title-info']]) {
        const e = R(s), hit = [];
        const hx = (a) => !(e.r <= a.l || e.l >= a.r) && e.b > a.t;
        if (hx(miu)) hit.push('Miu by ' + Math.round(e.b - miu.t));
        if (hx(bunch)) hit.push('bunch by ' + Math.round(e.b - bunch.t));
        if (e.b > innerHeight) hit.push('off-screen by ' + Math.round(e.b - innerHeight));
        out[k] = hit.join(', ') || 'ok';
      }
      return out;
    });
    console.log(dev.padEnd(8), lang, JSON.stringify(r));
    await ctx.close();
  }
  await browser.close(); srv.close();
})();
