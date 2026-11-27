// Visual QA for the fix-round-1 layout cases: landscape phone — Nim mid-hop to and standing on a TOP-row stone (must stay
// below the speech bubble); portrait — Nim on an EDGE-column stone (whole face on screen) and a shown thing beside him.
//   node tests/e2e/screens_edges.js   → tests/out/screens/edge-*.png (+ printed measurements, exit 1 on an overlap)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'screens'); fs.mkdirSync(OUT, { recursive: true });
const CASES = [
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, want: 'top', lang: 'vi', topic: 'colors' },
  { name: 'iphone-landscape-animals', viewport: { width: 852, height: 393 }, want: 'top', lang: 'en', topic: 'animals' },
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, want: 'edge', lang: 'en', topic: 'animals' },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, want: 'edge', lang: 'en', topic: 'colors' }
];
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  let bad = 0;
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: c.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      await page.goto(`${srv.url}?mute=1&seed=${seed}&age=5&lang=${c.lang}`);
      await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'title');
      await page.evaluate(t => { BD.debug.startGame(); const w = BD.debug.world; w.levels[1] = t; w.startLevel(1); BD.debug.setSpeed(6); }, c.topic);
      await page.waitForFunction(() => BD.debug.world.interactive && BD.debug.world.phaseTime > 0.5, null, { timeout: 30000 });
      await page.evaluate(() => BD.debug.setSpeed(1));
      const ok = await page.evaluate(want => {
        const w = BD.debug.world, row = w.stones.filter(s => s.row === 0 && s.state === 'rest'), t = row.find(s => s.target);
        if (want === 'top') return row.every(s => s.hy >= t.hy - 1);
        const xs = row.map(s => s.hx); return t.hx <= Math.min(...xs) + 1 || t.hx >= Math.max(...xs) - 1;
      }, c.want);
      if (!ok) continue;
      found = true;
      await page.waitForTimeout(600);
      await page.evaluate(() => { BD.debug.setSpeed(0.2); const w = BD.debug.world, a = BD.debug.answer(), h = w.stoneHit(a.id); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
      await page.waitForFunction(() => { const H = BD.debug.world._hop; return H && H.phase === 'air' && H.p && H.t > H.p.T * 0.45; }, null, { timeout: 20000, polling: 'raf' });
      const m1 = await measure(page);
      await page.screenshot({ path: path.join(OUT, `edge-${c.name}-midair.png`) });
      await page.evaluate(() => BD.debug.setSpeed(1));
      await page.waitForFunction(() => BD.debug.world.nim.state === 'stand' && BD.debug.world.nim.onRow === 0, null, { timeout: 20000, polling: 'raf' });
      await page.waitForTimeout(c.topic === 'animals' ? 250 : 400);
      const m2 = await measure(page);
      await page.screenshot({ path: path.join(OUT, `edge-${c.name}-stand.png`) });
      console.log(c.name, 'seed', seed, 'mid-air', JSON.stringify(m1), 'standing', JSON.stringify(m2));
      for (const m of [m1, m2]) if ((c.want === 'top' && m.underBubble > 2 && !m.faded) || m.offScreen > 2) bad++;
    }
    if (!found) { console.log(c.name, 'no case found'); bad++; }
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(bad ? 1 : 0);
})();
function measure(page) {
  return page.evaluate(() => {
    const w = BD.debug.world, n = w.nim, P = BD.NIM_POINTS, k = n.h / 300, v = BD.debug.view();
    const box = { x0: n.x - (P.feet[0] - P.box[0]) * k, x1: n.x + (P.box[2] - P.feet[0]) * k, y0: n.y - (P.feet[1] - P.box[1]) * k * Math.max(1, n.sy) };
    const b = document.getElementById('bubble').getBoundingClientRect(), bb = (b.bottom - v.top) / v.s, bx0 = (b.left - v.left) / v.s, bx1 = (b.right - v.left) / v.s;
    const under = box.x1 > bx0 && box.x0 < bx1 ? Math.max(0, bb - box.y0) : 0;
    const off = Math.max(0, w.layout.ins.left - box.x0, box.x1 - (w.layout.W - w.layout.ins.right));
    return { underBubble: Math.round(under), offScreen: Math.round(off), faded: document.getElementById('bubble').classList.contains('under') };
  });
}
