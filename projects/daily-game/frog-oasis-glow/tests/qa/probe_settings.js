// QA probe: which element makes the Settings panel wider than itself on an 844×390 phone (safe-area insets 47/47/21)?
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const ins of [null, { top: 0, left: 47, right: 47, bottom: 21 }]) {
    const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    if (ins) { const c = await ctx.newCDPSession(p); await c.send('Emulation.setSafeAreaInsetsOverride', { insets: ins }); }
    await p.goto(GAME + '?mute=1'); await p.waitForFunction(() => window.POG && POG.debug && POG.debug.mode === 'title');
    await p.evaluate(() => document.getElementById('btnSettings').click()); await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const pn = document.querySelector('#scrSettings .panel'), pr = pn.getBoundingClientRect(), cs = getComputedStyle(pn);
      const right = pr.left + pn.clientWidth - parseFloat(cs.paddingRight);
      const wide = [...pn.querySelectorAll('*')].map(e => ({ e, r: e.getBoundingClientRect() })).filter(o => o.r.right > pr.left + pn.clientWidth + 0.5)
        .map(o => (o.e.id || o.e.className || o.e.tagName) + ' right=' + Math.round(o.r.right) + ' w=' + Math.round(o.r.width));
      return { insets: !!document, panel: [Math.round(pr.left), Math.round(pr.width), pn.scrollWidth, pn.clientWidth], contentRight: Math.round(right), wide };
    });
    console.log(ins ? 'with insets' : 'no insets', JSON.stringify(r));
    await p.screenshot({ path: path.resolve(__dirname, '../out/functional/probe_settings_' + (ins ? 'insets' : 'plain') + '.png') });
    await ctx.close();
  }
  await b.close();
})();
