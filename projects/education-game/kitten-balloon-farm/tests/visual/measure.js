// DOM geometry checks (overflow / overlap) for the visual report — Kitten's Balloon Farm.   node tests/visual/measure.js
// Per device × language × age: the speech bubble (font, overflow, real bottom vs world.layout.bubble, highest balloon body
// over 30 re-rolled rounds, with and without notch insets), the Talk panel (overflow, choice rows, empty preview column)
// and the settings panel (hidden rows behind the sticky Done button).
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const DEV = { iphoneP: [393, 852, 3], iphoneL: [852, 393, 3], ipadP: [820, 1180, 2], ipadL: [1180, 820, 2], seL: [667, 375, 2] };
const NOTCH = { iphoneP: ':root{--sa-t:59px !important;--sa-b:34px !important}', iphoneL: ':root{--sa-l:59px !important;--sa-r:59px !important;--sa-b:21px !important}' };
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  for (const [dev, [w, h, dpr]] of Object.entries(DEV)) for (const notch of NOTCH[dev] ? [false, true] : [false]) for (const lang of ['en', 'vi']) for (const age of [3, 5, 7]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    if (notch) await page.addInitScript(c => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }), NOTCH[dev]);
    await page.goto(srv.url + `?mute=1&novoice=1&seed=5&age=${age}&lang=${lang}`);
    await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title');
    await page.evaluate(() => { KB.debug.startGame(); KB.debug.setSpeed(6); });
    await page.waitForFunction(() => KB.debug.world.state === 'round' && KB.debug.world.interactive, null, { timeout: 20000 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const v = KB.debug.view(), w = KB.debug.world, L = w.layout;
      const b = document.getElementById('bubble').getBoundingClientRect(), bt = document.getElementById('bubbleText');
      let top = 1e9;   // highest balloon body top over many re-rolls of every topic of this age
      const lv = w.levels.slice();
      for (let k = 0; k < lv.length; k++) for (let i = 0; i < 8; i++) { w.topic = lv[k]; w.round = 3; w._hist = []; w._beginRound(); for (const x of w.balloons) top = Math.min(top, x.hy - 0.6 * x.size); }
      const out = { bubbleFont: +parseFloat(bt.style.fontSize).toFixed(1), bubbleOverflow: document.getElementById('bubble').scrollHeight - document.getElementById('bubble').clientHeight,
        bubbleBottom: +((b.bottom - v.top) / v.s).toFixed(1), layoutBubbleBottom: L.bubble.y + L.bubble.h, highestBody: +top.toFixed(1),
        coveredBy: +Math.max(0, (b.bottom - v.top) / v.s - top).toFixed(1), s: +v.s.toFixed(3), balloonCss: Math.round(L.balloonSize * v.s) };
      w._startTalk();
      return out;
    });
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => {
      const p = document.querySelector('.talk-panel'), pr = p.getBoundingClientRect(), show = document.getElementById('talkShow');
      const ch = [...document.querySelectorAll('#talkChoices button')].map(b => b.getBoundingClientRect());
      const cols = getComputedStyle(p).gridTemplateColumns;
      return { overflow: p.scrollHeight - p.clientHeight, top: Math.round(pr.top), bottom: Math.round(pr.bottom), vh: innerHeight, rows: new Set(ch.map(c => Math.round(c.top))).size,
        emptyPreviewColumn: show.classList.contains('hidden') && cols.split(' ').length > 1 ? cols : null };
    });
    const s = await page.evaluate(() => { KB.UI.only('scrSettings'); const p = document.querySelector('.settings-panel'); return { scroll: p.scrollHeight - p.clientHeight }; });
    console.log(JSON.stringify({ dev, notch, lang, age, ...r, talk: t, settings: s }));
    await ctx.close();
  }
  await browser.close(); srv.close();
})();
