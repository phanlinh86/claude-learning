// Visual QA: hitch bunny + balloon surprises on all 4 viewports (load, after tap, departing) + edge/overlap measurements;
// hi-res crops of Momo in the cab and the train in motion (couplings, puffs).
const L = require('./lib');
const path = require('path'), fs = require('fs');
const sharp = require('sharp');
(async () => {
  const { srv, browser } = await L.launch();
  const out = [];
  for (const vp of Object.keys(L.VIEWPORTS)) for (const sp of ['hitch', 'balloon']) {
    const { ctx, page } = await L.open(browser, vp, `seed=8&age=4&lang=en`, { url: srv.url });
    await L.startTopic(page, { topic: 'colors', lvl: 0, surprise: sp, round: 2 });
    await L.toLoad(page);
    if (sp === 'hitch') { await page.evaluate(() => TT.debug.setSpeed(3)); await L.until(page, () => TT.debug.world.hitch && TT.debug.world.hitch.state === 'ride', null, 20000); await page.evaluate(() => TT.debug.setSpeed(1)); }
    await page.waitForTimeout(900);
    await L.shot(page, `sur-${vp}-${sp}-1`);
    const m = await page.evaluate(sp => {
      const D = TT.debug, b = sp === 'hitch' ? D.hitchScreen() : D.balloonScreen();
      const hud = document.getElementById('hud').getBoundingClientRect(), bub = document.getElementById('bubble').getBoundingClientRect();
      const r = b ? { x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.h / 2, y1: b.y + b.h / 2 } : null;
      const inter = (a, c) => a && !(a.x1 <= c.left || c.right <= a.x0 || a.y1 <= c.top || c.bottom <= a.y0);
      const items = D.world.items.filter(i => i.state === 'rest').map(i => D.itemScreen(i.id));
      const ovItems = r ? items.filter(h => !(h.x + h.w / 2 < r.x0 || r.x1 < h.x - h.w / 2 || h.y + h.h / 2 < r.y0 || r.y1 < h.y - h.h / 2)).length : null;
      return { box: r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)])), vw: innerWidth, vh: innerHeight, hitCss: b && Math.round(b.w), hitLogical: b && Math.round(b.w / D.view().s),
        overHud: inter(r, hud), overBubble: inter(r, bub), overItems: ovItems, offRight: r ? Math.round(r.x1 - innerWidth) : null, offTop: r ? Math.round(-r.y0) : null };
    }, sp);
    // tap it
    const b = await page.evaluate(sp => sp === 'hitch' ? TT.debug.hitchScreen() : TT.debug.balloonScreen(), sp);
    const cdp = await ctx.newCDPSession(page);
    if (b) { await L.touch(cdp, 'touchStart', b.x, b.y); await page.waitForTimeout(60); await L.touch(cdp, 'touchEnd'); }
    await page.waitForTimeout(350);
    await L.shot(page, `sur-${vp}-${sp}-2-tap`);
    // depart with it
    await L.solve(page);
    await L.until(page, () => TT.debug.world.phase === 'whistle' || TT.debug.world.phase === 'depart', null, 30000);
    const wh = await page.evaluate(() => TT.debug.whistleScreen());
    await L.touch(cdp, 'touchStart', wh.x, wh.y); await page.waitForTimeout(60); await L.touch(cdp, 'touchEnd');
    await page.waitForTimeout(700);
    await L.shot(page, `sur-${vp}-${sp}-3-depart`);
    out.push({ vp, sp, ...m, errors: page.errors });
    console.log(vp, sp, JSON.stringify(m));
    await ctx.close();
  }
  // hi-res: Momo in the cab @3 (phone portrait) and @2 (iPad landscape); motion frames during arrive/depart @2
  for (const [vp, dpr] of [['ip-p', 3], ['ip-l', 3], ['pad-l', 2]]) {
    const { ctx, page } = await L.open(browser, vp, `seed=8&age=4&lang=en`, { url: srv.url, dpr });
    await page.evaluate(() => { TT.debug.world.cfg.surpriseRound = 99; });
    await L.startTopic(page, { topic: 'count', lvl: 3, round: 2 });
    await L.until(page, () => TT.debug.world.phase === 'arrive', null, 20000);
    const frames = [];
    for (let k = 0; k < 6; k++) { await page.waitForTimeout(170); frames.push(await page.screenshot()); }
    await L.toLoad(page);
    await page.waitForTimeout(800);
    const mb = await page.evaluate(() => TT.debug.momoScreen());
    const full = await page.screenshot();
    const pad = 30, left = Math.max(0, Math.round((mb.x - mb.w / 2 - pad) * dpr)), top = Math.max(0, Math.round((mb.y - mb.h / 2 - pad) * dpr));
    await sharp(full).extract({ left, top, width: Math.round((mb.w + 2 * pad) * dpr), height: Math.round((mb.h + 2 * pad) * dpr) }).toFile(path.join(L.OUT, `hires-${vp}-momo-night.png`));
    await L.solve(page);
    await L.until(page, () => TT.debug.world.phase === 'whistle' || TT.debug.world.phase === 'depart', null, 30000);
    const cdp = await ctx.newCDPSession(page);
    const wh = await page.evaluate(() => TT.debug.whistleScreen());
    await L.touch(cdp, 'touchStart', wh.x, wh.y); await page.waitForTimeout(60); await L.touch(cdp, 'touchEnd');
    for (let k = 0; k < 6; k++) { await page.waitForTimeout(150); frames.push(await page.screenshot()); }
    const tr = await page.evaluate(() => { const D = TT.debug, w = D.world; const a = D.toScreen(0, w.layout.engine.y0 - 40), b = D.toScreen(0, w.layout.trackY + 20); return [a.y, b.y]; });
    const vpw = L.VIEWPORTS[vp].width;
    const crops = await Promise.all(frames.map(f => sharp(f).extract({ left: 0, top: Math.round(tr[0] * dpr), width: vpw * dpr, height: Math.round((tr[1] - tr[0]) * dpr) }).resize(Math.min(900, vpw * dpr)).png().toBuffer()));
    const hs = await Promise.all(crops.map(async c => (await sharp(c).metadata()).height));
    let y = 0; const comp = crops.map((c, i) => { const o = { input: c, left: 0, top: y }; y += hs[i] + 4; return o; });
    await sharp({ create: { width: Math.min(900, vpw * dpr), height: y, channels: 3, background: '#222' } }).composite(comp).png().toFile(path.join(L.OUT, `motion-${vp}-arrive-depart.png`));
    await ctx.close();
  }
  fs.writeFileSync(path.join(L.OUT, 'surprises-measure.json'), JSON.stringify(out, null, 1));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
