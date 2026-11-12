// Independent QA extras: double-tap Resume (tap-through to the canvas), double-tap Play, gear spam. node tests/qa/qa_extra.js
const L = require('./qa_lib');
const center = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
(async () => {
  const srv = await L.serve(), browser = await L.chromium.launch();
  for (const k of ['ipp', 'ipl', 'padp', 'padl']) {
    const errors = []; const { ctx, page, cdp } = await L.newPage(browser, L.DEVICES[k], errors);
    // 1) double-tap Resume: does the 2nd tap reach a member under the button?
    await L.setupRound(page, srv.url, { topic: 'colors' });
    await L.tap(cdp, page, await center(page, '#btnPause')); await page.waitForTimeout(300);
    const rb = await center(page, '#btnResume');
    const under = await page.evaluate(([x, y]) => { const v = FP.debug.view(), lx = (x - v.left) / v.s, ly = (y - v.top) / v.s; const w = FP.debug.world; const m = w._memberAt(lx, ly); return { lx: Math.round(lx), ly: Math.round(ly), member: m && m.id, bo: lx >= w.layout.boBox.x && lx <= w.layout.boBox.x + w.layout.boBox.w && ly >= w.layout.boBox.y && ly <= w.layout.boBox.y + w.layout.boBox.h }; }, [rb.x, rb.y]);
    const n0 = await L.evLen(page);
    await L.tap(cdp, page, rb, 40); await page.waitForTimeout(60); await L.tap(cdp, page, rb, 40);
    await page.waitForTimeout(300);
    const ev = (await L.evSince(page, n0)).filter(e => /right|wrong|soft|wiggle|pokeBo/.test(e.type)).map(e => e.type + (e.id ? ':' + e.id : ''));
    console.log(L.DEVICES[k].name, 'double-tap Resume → under button', JSON.stringify(under), 'events', ev.join(','));
    // 2) double-tap Play on the title
    await L.gotoTitle(page, srv.url + '?mute=1&seed=3&age=4&lang=en');
    const pb = await center(page, '#btnPlay');
    const s0 = await L.saidLen(page);
    await L.tap(cdp, page, pb, 40); await page.waitForTimeout(50); await L.tap(cdp, page, pb, 40);
    await page.waitForTimeout(800);
    const st = await page.evaluate(() => ({ sessions: FP.debug.stats.sessions, levels: window.__ev.filter(e => e.type === 'level').length }));
    const said = (await L.saidSince(page, s0)).map(s => s.text);
    console.log(L.DEVICES[k].name, 'double-tap Play →', JSON.stringify(st), JSON.stringify(said), errors.join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
})();
