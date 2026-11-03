// Title-screen fit check for Dee's Forest Memory: do the logo / tagline / ▶ / star pill clear Dee and the three
// self-flipping cards drawn on the canvas (geometry mirrors render.js _titleScene)?   node tests/visual/title_fit.js ["<extra css>"]
const V = require('./lib');
const extra = process.argv[2] || '';
(async () => {
  await V.start();
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL', 'seL', 'miniL', 'seP']) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await V.open(dev, `lang=${lang}`);
    if (extra) await page.addStyleTag({ content: extra });
    await V.sleep(250);
    const r = await page.evaluate(() => {
      const v = FC.debug.view(), L = FC.debug.world.layout, W = v.W, H = v.H, portrait = H > W;
      const h = portrait ? Math.min(300, H * 0.2) : Math.min(260, H * 0.38), box = h * 256 / 234;
      const dx = portrait ? W * 0.3 : L.ins.left + W * 0.15, dy = L.groundY + 10 - 18;   // incl. the 18 px hop
      const cw = portrait ? 92 : 84, ch = cw / 0.78, cx0 = portrait ? W * 0.68 : W - L.ins.right - Math.max(170, W * 0.14), cy = L.groundY - ch * 0.62;
      const css = (x, y) => ({ x: v.left + x * v.s, y: v.top + y * v.s });
      const dee = { l: css(dx - box * 0.42, 0).x, r: css(dx + box * 0.42, 0).x, t: css(0, dy - box * 0.92).y };
      const cards = { l: css(cx0 - cw * 1.5 - 12, 0).x, r: css(cx0 + cw * 1.5 + 12, 0).x, t: css(0, cy - 14 - ch / 2).y };
      const R = s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, h: b.height }; };
      const out = {};
      for (const [k, s] of [['logo', '.logo'], ['tag', '#tagline'], ['play', '#btnPlay'], ['info', '.title-info'], ['lang', '.lang-switch']]) {
        const e = R(s), hit = [];
        const hx = a => !(e.r <= a.l || e.l >= a.r) && e.b > a.t;
        if (hx(dee)) hit.push('Dee by ' + Math.round(e.b - dee.t));
        if (hx(cards)) hit.push('cards by ' + Math.round(e.b - cards.t));
        if (e.b > innerHeight || e.t < 0) hit.push('off-screen');
        out[k] = hit.join(', ') || 'ok';
      }
      const lg = document.querySelector('.logo'); out.logoLines = Math.round(lg.getBoundingClientRect().height / parseFloat(getComputedStyle(lg).lineHeight || 1)) || null;
      return out;
    });
    console.log(dev.padEnd(8), lang, JSON.stringify(r));
    await ctx.close();
  }
  await V.stop();
})();
