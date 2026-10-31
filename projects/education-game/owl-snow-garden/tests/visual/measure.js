// DOM geometry checks (overflow / overlap) for the visual report.   node tests/visual/measure.js
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const DEV = { iphoneP: [393, 852, 3], iphoneL: [852, 393, 3], ipadP: [820, 1180, 2], ipadL: [1180, 820, 2], iphoneSE_L: [667, 375, 2] };
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  for (const [dev, [w, h, dpr]] of Object.entries(DEV)) for (const lang of ['en', 'vi']) for (const age of [3, 6]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(srv.url + `?mute=1&novoice=1&seed=5&age=${age}&lang=${lang}`);
    await page.waitForFunction(() => window.SG && SG.debug && SG.debug.mode === 'title');
    await page.evaluate(() => { SG.debug.startGame(); SG.debug.setSpeed(6); });
    await page.waitForFunction(() => SG.debug.world.state === 'round' && SG.debug.world.interactive);
    const r = await page.evaluate(() => {
      const R = id => { const b = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
      const bubble = R('bubble'), hud = R('hud'), bt = document.getElementById('bubbleText');
      const v = SG.debug.view(), w = SG.debug.world;
      const itemsTopCss = Math.min(...w.items.map(i => v.top + (i.homeY - i.size / 2) * v.s));
      const out = { bubble, hud, bubbleFont: parseFloat(bt.style.fontSize), bubbleText: bt.textContent.length, itemsTopCss: Math.round(itemsTopCss),
        overlapHud: !(bubble.r <= hud.l || bubble.b <= hud.t || bubble.t >= hud.b), s: +v.s.toFixed(3), itemCss: Math.round(w.items[0].size * v.s), boCss: Math.round(w.layout.bo.h * v.s) };
      w._startTalk();
      return out;
    });
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => {
      const p = document.querySelector('.talk-panel').getBoundingClientRect(), m = document.getElementById('btnMic').getBoundingClientRect();
      const ch = [...document.querySelectorAll('#talkChoices button')].map(b => b.getBoundingClientRect());
      const rows = new Set(ch.map(c => Math.round(c.top))).size;
      return { panelTop: Math.round(p.top), panelBottom: Math.round(p.bottom), scrollH: document.querySelector('.talk-panel').scrollHeight, clientH: document.querySelector('.talk-panel').clientHeight,
        micBottom: Math.round(m.bottom), micVisible: m.height > 0, vh: innerHeight, choiceRows: rows, nChoices: ch.length };
    });
    console.log(JSON.stringify({ dev, lang, age, ...r, talk: t }));
    await ctx.close();
  }
  await browser.close(); srv.close();
})();
