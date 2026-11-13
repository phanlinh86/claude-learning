// Visual QA: in-game sizes in CSS px (bubble, thing box, star outer diameter for n = 1–12 in a countSel round, star gap,
// tile glyph cap height) per device × age, from the live layout + PB.BubbleArt.starLayout.
//   node tests/qa/visual_sizes.js
const { chromium } = require('playwright'); const serve = require('../e2e/serve'); const G = require('./visual_geom');
(async () => {
  const srv = await serve(); const browser = await chromium.launch();
  for (const dev of Object.keys(G.DEVS)) {
    const { page, ctx } = await G.open(browser, srv, dev, 'en', 4, 5);
    const rows = await page.evaluate(() => {
      const out = [], w = PB.debug.world, v = PB.debug.view();
      for (const age of [3, 4, 5, 6, 7]) {
        w.age = age; w._pendingAge = age; w.cur = { n: 4, k: 1 }; w._relayout(false);
        const L = w.layout, size = 1.2 * L.R, u = size / 100 * v.s;   // CSS px per design unit
        const maxN = age <= 4 ? 5 : age === 5 ? 10 : 12;
        const st = [];
        for (let n = 1; n <= maxN; n++) { const S = PB.BubbleArt.starLayout(n, maxN); let gap = 1e9; for (let i = 0; i < S.pts.length; i++) for (let j = i + 1; j < S.pts.length; j++) gap = Math.min(gap, Math.hypot(S.pts[i][0] - S.pts[j][0], S.pts[i][1] - S.pts[j][1]) - 2 * S.rs); st.push({ n, dia: +(2 * S.rs * u).toFixed(1), gap: S.pts.length > 1 ? +(gap * u).toFixed(1) : null }); }
        out.push({ age, d: Math.round(L.d * v.s), thing: Math.round(size * v.s), hit: Math.round(2 * L.hitR * v.s), bao: Math.round(L.bao.h * v.s), tile1: +(42 * u).toFixed(1), tile3: +(30 * u).toFixed(1), tile4: +(24 * u).toFixed(1), starsMax: st[st.length - 1], stars4: st[Math.min(3, st.length - 1)] });
      }
      return out;
    });
    for (const r of rows) console.log(dev, JSON.stringify(r));
    await ctx.close();
  }
  await browser.close(); srv.close();
})();
