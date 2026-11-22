// Visual QA (Nim's River Hop): catch the worst moments the sampler found and screenshot them —
//   A) Nim standing on a stone while his art box leaves the screen (edge stones, portrait),
//   B) Nim standing on a stone under the visible speech bubble (landscape top row),
//   C) Nim mid-hop under the visible speech bubble.
//   node tests/qa/visual_edges.js <device> [lang] [notch 0|1]  → tests/out/qa_visual/edges-<device>-<lang>/*.png + .json
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const { PAGE_JS } = require('./visual_lib');
const DEV = {
  'iphone-portrait': { viewport: { width: 393, height: 852 }, dpr: 2, notch: { t: 59, b: 34, l: 0, r: 0 } },
  'iphone-landscape': { viewport: { width: 852, height: 393 }, dpr: 2, notch: { t: 0, b: 21, l: 59, r: 59 } },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, dpr: 1, notch: { t: 24, b: 20, l: 0, r: 0 } },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, dpr: 1, notch: { t: 24, b: 20, l: 0, r: 0 } }
};
const [device = 'iphone-portrait', lang = 'en', notchArg = '0'] = process.argv.slice(2);
const D = DEV[device], sa = notchArg === '1' ? D.notch : null;
const tag = `edges-${device}-${lang}${sa ? '-notch' : ''}`;
const OUT = path.join(__dirname, '..', 'out', 'qa_visual', tag); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: D.viewport, deviceScaleFactor: D.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(({ js, sa }) => {
    (0, eval)(js);
    if (sa) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `:root{--sa-t:${sa.t}px !important;--sa-r:${sa.r}px !important;--sa-b:${sa.b}px !important;--sa-l:${sa.l}px !important}`; document.head.appendChild(st); });
  }, { js: PAGE_JS, sa });
  const page = await ctx.newPage(), data = { tag, cases: {} };
  // in-page: worst values while a bot plays
  const cond = {
    edge: `(() => { const w = DK.debug.world, n = w.nim, L = w.layout; if (DK.debug.mode !== 'play' || w.state !== 'round' || !(n.onRow >= 0 && n.onRow < (w.cur ? w.cur.k : 9)) || (n.state !== 'stand' && n.state !== 'land')) return 0;
      const b = __qa.nimArt(w); return Math.max(L.ins.left - b.x, b.x + b.w - (L.W - L.ins.right)); })()`,
    bubble: `(() => { const w = DK.debug.world, n = w.nim, L = w.layout; if (DK.debug.mode !== 'play' || w.state !== 'round' || !__qa.bubbleOn() || n.state === 'air' || !(n.onRow >= 0)) return 0;
      const b = __qa.nimArt(w), r = document.getElementById('bubble').getBoundingClientRect(), v = DK.debug.view(); const by = (r.bottom - v.top) / v.s, bx0 = (r.left - v.left) / v.s, bx1 = (r.right - v.left) / v.s;
      if (b.x > bx1 || b.x + b.w < bx0) return 0; return by - b.y; })()`,
    air: `(() => { const w = DK.debug.world, n = w.nim; if (DK.debug.mode !== 'play' || w.state !== 'round' || !__qa.bubbleOn() || n.state !== 'air') return 0;
      const b = __qa.nimArt(w), r = document.getElementById('bubble').getBoundingClientRect(), v = DK.debug.view(); const by = (r.bottom - v.top) / v.s, bx0 = (r.left - v.left) / v.s, bx1 = (r.right - v.left) / v.s;
      if (b.x > bx1 || b.x + b.w < bx0) return 0; return by - b.y; })()`
  };
  for (const [name, expr] of Object.entries(cond)) {
    let best = { v: 0 };
    for (const [age, seed] of [[7, 51], [6, 52], [4, 53], [3, 54], [5, 55]]) {
      await page.goto(`${srv.url}?mute=1&seed=${seed}&age=${age}&lang=${lang}&bot=1&speed=3&autostart=1`);
      await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'play', null, { timeout: 30000 });
      const thr = name === 'edge' ? 12 : 10;
      try {
        await page.waitForFunction(([e, t]) => (0, eval)(e) > t, [expr, Math.max(thr, best.v + 2)], { timeout: 45000, polling: 'raf' });
        await page.evaluate(() => DK.debug.setSpeed(0.1));
        const v = await page.evaluate(e => (0, eval)(e), expr);
        if (v > best.v) {
          const file = `${name}-age${age}.png`;
          await page.screenshot({ path: path.join(OUT, file) });
          const m = await page.evaluate(() => __qa.measure('x'));
          best = { v, file, age, seed, nim: m.nim, bubble: m.bubble, s: m.s, viewport: m.viewport, sa: m.sa, row: m.nimRow, state: m.nimState, W: m.W, H: m.H };
        }
      } catch (e) { /* not reached in this session */ }
    }
    data.cases[name] = best;
    console.log(tag, name, JSON.stringify(best));
  }
  fs.writeFileSync(path.join(OUT, '..', tag + '.json'), JSON.stringify(data, null, 1));
  await browser.close(); srv.close();
})();
