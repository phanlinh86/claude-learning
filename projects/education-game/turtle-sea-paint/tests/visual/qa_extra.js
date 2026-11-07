// Extra visual QA captures: hint glow + ghost hand on a multi-step round, a float/bob rise sequence vs the DOM bubble,
// and @2 close-ups (Nini + brush, shells, VI bubble). node tests/visual/qa_extra.js -> docs/reports/visual/x-*.png
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', '..', 'docs', 'reports', 'visual'); fs.mkdirSync(OUT, { recursive: true });
const DEVS = { 'ip-p': { vp: [393, 852], ins: [59, 0, 34, 0] }, 'ip-l': { vp: [852, 393], ins: [0, 59, 21, 59] }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0] } };
const until = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
(async () => {
  const srv = await serve(), browser = await chromium.launch(), log = {};
  for (const [dev, d] of Object.entries(DEVS)) for (const lang of ['en', 'vi']) {
    const key = dev + '-' + lang, dpr = lang === 'vi' && dev !== 'pad-l' ? 2 : 1;
    const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const ev = (f, a) => page.evaluate(f, a);
    await page.goto(srv.url + `?mute=1&novoice=1&seed=9&age=4&lang=${lang}`);
    await until(page, () => window.SP && SP.debug && SP.debug.mode === 'title');
    await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
    await ev(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(300);
    const shot = (n, clip) => page.screenshot({ path: path.join(OUT, `x-${key}-${n}.png`), clip });
    await ev(() => { SP.debug.startGame(); const w = SP.debug.world; w.cfg.surpriseTypes = []; });
    // a colours round with >= 2 steps, then the hint
    for (let k = 0; k < 15; k++) {
      await ev(() => { const w = SP.debug.world; w.levels[0] = 'colors'; w.startLevel(0); SP.debug.setSpeed(6); });
      await until(page, () => SP.debug.world.interactive);
      if (await ev(() => SP.debug.world.cur.steps.length >= 2)) break;
    }
    await ev(() => { SP.debug.setSpeed(1); SP.debug.world.hint(); }); await page.waitForTimeout(900); await shot('hint-shell');
    // load the brush, then hint for the part
    await ev(() => { const w = SP.debug.world, a = w.answer(); const h = w.shellHit(a.shell); w.tap(h.x, h.y); }); await page.waitForTimeout(1300);
    await ev(() => SP.debug.world.hint()); await page.waitForTimeout(900); await shot('hint-part');
    if (dpr === 2 || dev === 'pad-l') {
      const v = await ev(() => { const w = SP.debug.world, V = SP.debug.view(), L = w.layout; return { V, n: L.nini, sl: L.palette.slots, r: w.cfg.shellR, b: document.getElementById('bubble').getBoundingClientRect().toJSON() }; });
      const sc = (x, y) => ({ x: v.V.left + x * v.V.s, y: v.V.top + y * v.V.s });
      const n0 = sc(v.n.x - v.n.w, v.n.y - v.n.h - 10), n1 = sc(v.n.x + v.n.w, v.n.y + 10);
      await shot('close-nini', { x: Math.max(0, n0.x), y: Math.max(0, n0.y), width: n1.x - Math.max(0, n0.x), height: n1.y - Math.max(0, n0.y) });
      if (v.sl.length) { const a = sc(v.sl[0].x - v.r - 10, v.sl[0].y - v.r - 20), b = sc(v.sl[v.sl.length - 1].x + v.r + 10, v.sl[0].y + v.r + 15); await shot('close-shells', { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }); }
      await shot('close-bubble', { x: v.b.x, y: Math.max(0, v.b.y - 4), width: v.b.width, height: v.b.height + 16 });
    }
    // float / bob rise vs the DOM bubble
    if (lang === 'en') for (const kind of ['float', 'bob']) {
      let ok = false;
      for (let k = 0; k < 30 && !ok; k++) {
        await ev(() => { SP.debug.setBot(false); const w = SP.debug.world; w.levels[0] = 'colors'; w.startLevel(0); SP.debug.setSpeed(8); });
        await until(page, () => SP.debug.world.state === 'round' && SP.debug.world.picture);
        ok = await ev(kd => SP.debug.world.picture.alive === kd, kind);
      }
      if (!ok) continue;
      await ev(() => { SP.debug.setBot(true, 1); SP.debug.setSpeed(4); });
      await until(page, () => SP.debug.world.phase === 'alive');
      await ev(() => SP.debug.setSpeed(0.5));
      const T = await ev(() => SP.debug.world.cfg.aliveMove); log.aliveMove = T;
      for (const f of [0.5, 0.7, 0.85]) {
        await until(page, tt => SP.debug.world.phaseTime >= tt, f * T);
        await ev(() => SP.debug.setSpeed(0.1));
        log[`${key}-${kind}-${f}`] = await ev(() => { const w = SP.debug.world, V = SP.debug.view(), C = w.layout.canvas; return { picTop: +(V.top + (C.y + w.pic.y) * V.s).toFixed(0), picBottom: +(V.top + (C.y + C.h + w.pic.y) * V.s).toFixed(0), bubble: document.getElementById('bubble').getBoundingClientRect().toJSON(), t: w.phaseTime }; });
        await shot(`rise-${kind}-${f}`);
        await ev(() => SP.debug.setSpeed(0.5));
      }
      await ev(() => SP.debug.setBot(false));
    }
    await ctx.close(); console.log(key);
  }
  fs.writeFileSync(path.join(OUT, 'extra.json'), JSON.stringify(log, null, 1));
  await browser.close(); srv.close();
})();
