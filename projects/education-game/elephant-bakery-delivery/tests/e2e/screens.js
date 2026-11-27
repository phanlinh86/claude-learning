// Visual QA screenshots (Tupi's Bakery Delivery): title, settings, play (every age-4 topic, one season each; colours in all 4
// seasons; ages 3/5/6/7), a cart mid-drive, a delivery (door open + friend + hearts), a wrong house, the hint (glowing route +
// ghost hand), the party sprinkle fountain, the wipe, Talk time, pause, the chapter banner and the session-done screen —
// on iPhone portrait / landscape and iPad portrait / landscape, in EN and VI, with realistic notch / home-bar safe-area
// insets (the --sa-* CSS variables on :root are overridden, which feeds both the CSS and the #safeProbe read by main.js).
// CSS-px screenshots (deviceScaleFactor 1). Writes tests/out/screens/<device>-<lang>-<name>.png and prints overlap checks.
//   node tests/e2e/screens.js [devices] [langs]     e.g.  node tests/e2e/screens.js iphone-portrait en
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'screens'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, ins: { t: 59, r: 0, b: 34, l: 0 } },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, ins: { t: 0, r: 59, b: 21, l: 59 } },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, ins: { t: 24, r: 0, b: 20, l: 0 } },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, ins: { t: 24, r: 0, b: 20, l: 0 } }
];
const wantD = (process.argv[2] || '').split(',').filter(Boolean);
const wantL = (process.argv[3] || 'en,vi').split(',').filter(Boolean);
const waitFor = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const SEASON = ['spring', 'summer', 'autumn', 'winter'];

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  let errors = 0;
  const report = [];
  for (const d of DEVICES) for (const lang of wantL) {
    if (wantD.length && !wantD.includes(d.name)) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    const tag = `${d.name}-${lang}`;
    const shot = async name => { await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); const m = await measure(page); report.push(`${tag}-${name} ${JSON.stringify(m)}`); };
    const insets = async on => {
      await page.evaluate(([i, on]) => {
        const r = document.documentElement.style;
        for (const [k, v] of [['--sa-t', i.t], ['--sa-r', i.r], ['--sa-b', i.b], ['--sa-l', i.l]]) r.setProperty(k, (on ? v : 0) + 'px');
        window.dispatchEvent(new Event('resize'));
      }, [d.ins, on]);
      await page.waitForTimeout(400);
    };
    const fresh = async (q = {}) => {
      await page.goto(`${srv.url}?mute=1&seed=${q.seed || 3}&age=${q.age || 4}&lang=${lang}`);
      await waitFor(page, () => window.BD && BD.debug && BD.debug.mode === 'title', null, 20000);
      await insets(q.noInsets ? false : true);
    };
    const start = async (topic, level) => {
      await page.evaluate(([t, lv]) => { BD.debug.startGame(); const w = BD.debug.world; w.levels[lv] = t; w.startLevel(lv); BD.debug.setSpeed(6); }, [topic, level]);
      await waitFor(page, () => BD.debug.world.interactive && BD.debug.world.phaseTime > 0.8);
      await page.evaluate(() => BD.debug.setSpeed(1));
      await page.waitForTimeout(level % 4 === 0 ? 400 : 2600);   // let the season crossfade finish
    };
    const tapHouse = (wantRight) => page.evaluate(r => {
      const w = BD.debug.world, a = w.answer(), h = w.houses.find(x => r ? x.id === a.houseId : x.id !== a.houseId);
      const b = w.houseHit(h.id); w.pointerDown(b.cx, b.cy); w.pointerUp(b.cx, b.cy); return h.id;
    }, wantRight);
    try {
      // ---- title, settings
      await fresh({});
      await page.waitForTimeout(1500);
      await shot('00-title');
      const gear = await page.$('#btnParents'); const gb = await gear.boundingBox();
      await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up();
      await page.waitForTimeout(400);
      await shot('01-settings');
      // ---- the chapter banner + play, age 4, each topic in its own season
      const topics4 = ['colors', 'shapes', 'count', 'animals'];
      for (let lv = 0; lv < 4; lv++) {
        await fresh({ seed: 3 + lv });
        if (lv === 0) {
          await page.evaluate(() => { BD.debug.startGame(); const w = BD.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
          await waitFor(page, () => BD.debug.world.state === 'intro' && BD.debug.world.stateTime > 0.7);
          await page.evaluate(() => BD.debug.setSpeed(0.05));
          await page.waitForTimeout(200);
          await shot('02-banner');
          await page.evaluate(() => BD.debug.setSpeed(6));
          await waitFor(page, () => BD.debug.world.interactive && BD.debug.world.phaseTime > 0.8);
          await page.evaluate(() => BD.debug.setSpeed(1)); await page.waitForTimeout(400);
        } else await start(topics4[lv], lv);
        await shot(`10-play-age4-${topics4[lv]}-${SEASON[lv]}`);
      }
      // colours in the other 3 seasons (yellow vs the tablecloth tint)
      for (let lv = 1; lv < 4; lv++) { await fresh({ seed: 20 + lv }); await start('colors', lv); await shot(`11-play-colors-${SEASON[lv]}`); }
      // other ages
      const ageTopic = { 3: 'size', 5: 'letters', 6: 'add', 7: 'oddeven' };
      for (const age of [3, 5, 6, 7]) { await fresh({ seed: 30 + age, age }); await start(ageTopic[age], age % 4); await shot(`12-play-age${age}-${ageTopic[age]}`); }
      // no-insets play (for comparison)
      await fresh({ seed: 3, noInsets: true }); await start('shapes', 0); await shot('13-play-noinsets');
      // ---- wrong house, then the hint
      await fresh({ seed: 6 });
      await start('colors', 0);
      await tapHouse(false);
      await waitFor(page, () => BD.debug.events.some(e => e.type === 'wrong'), null, 20000);
      await page.waitForTimeout(500);
      await page.evaluate(() => BD.debug.setSpeed(0.05)); await page.waitForTimeout(150);
      await shot('20-wrong');
      await page.evaluate(() => BD.debug.setSpeed(3));
      await waitFor(page, () => BD.debug.world.interactive, null, 20000);
      await page.evaluate(() => { BD.debug.setSpeed(1); BD.debug.world.hint(); });
      await waitFor(page, () => { const w = BD.debug.world; return w.hintHand && w.hintHand.alpha > 0.8 && (w.hintGlow || 0) > 0.5; }, null, 10000).catch(() => {});
      await shot('21-hint');
      // ---- mid-drive, delivery, party
      await page.evaluate(() => BD.debug.setSpeed(0.6));
      await tapHouse(true);
      await waitFor(page, () => { const w = BD.debug.world, c = w.cart; return c.state !== 'wait' && w.cart.edge !== 'trunk'; }, null, 15000).catch(() => {});
      await page.evaluate(() => BD.debug.setSpeed(0.05)); await page.waitForTimeout(150);
      await shot('22-drive');
      await page.evaluate(() => BD.debug.setSpeed(1));
      await waitFor(page, () => BD.debug.events.some(e => e.type === 'hearts'), null, 20000).catch(() => {});
      await page.waitForTimeout(250);
      await page.evaluate(() => BD.debug.setSpeed(0.05)); await page.waitForTimeout(150);
      await shot('23-deliver');
      await page.evaluate(() => { BD.debug.setSpeed(3); BD.debug.setBot(true, 1); });
      await waitFor(page, () => { const w = BD.debug.world; return w.phase === 'party' && (w.sprinkles || []).length > 25; }, null, 60000);
      await page.evaluate(() => { BD.debug.setBot(false); BD.debug.setSpeed(0.05); }); await page.waitForTimeout(150);
      await shot('24-party');
      await page.evaluate(() => BD.debug.setSpeed(1));
      await waitFor(page, () => { const p = BD.debug.world.wipe; return p && p.t > 0.32 && p.t < 0.45; }, null, 30000);
      await page.evaluate(() => BD.debug.setSpeed(0.02)); await page.waitForTimeout(150);
      await shot('25-wipe');
      // ---- pause
      await page.evaluate(() => BD.debug.setSpeed(4));
      await waitFor(page, () => BD.debug.world.interactive, null, 30000);
      await page.evaluate(() => BD.debug.setSpeed(1));
      await page.click('#btnPause'); await page.waitForTimeout(500);
      await shot('26-pause');
      // ---- Talk time + session done: start the last chapter, the bot plays it
      await fresh({ seed: 9 });
      await page.evaluate(() => { BD.debug.startGame(); const w = BD.debug.world; w.levels[3] = 'animals'; w.startLevel(w.levels.length - 1); BD.debug.setBot(true, 1); BD.debug.setSpeed(8);
        const b = BD.debug.bot, st = b.step.bind(b); b.step = s => { if (BD.debug.world.state === 'talk' && !window.__talkOk) return; st(s); }; });
      await waitFor(page, () => BD.debug.world.state === 'talk' && BD.debug.mode === 'talk', null, 240000);
      await page.evaluate(() => BD.debug.setSpeed(1));
      await page.waitForTimeout(1200);
      await shot('30-talk');
      await page.evaluate(() => { window.__talkOk = true; BD.debug.setSpeed(8); });
      await waitFor(page, () => BD.debug.mode === 'done', null, 240000);
      await page.evaluate(() => BD.debug.setSpeed(1));
      await page.waitForTimeout(2500);
      await shot('31-done');
    } catch (e) { errs.push('exception: ' + e.message.split('\n')[0]); }
    console.log(tag, errs.length ? 'ERRORS ' + errs.slice(0, 4).join(' | ') : 'ok');
    errors += errs.length;
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, `measure-${wantD.join('_') || 'all'}-${wantL.join('_')}.txt`), report.join('\n') + '\n');
  await browser.close(); srv.close();
  process.exit(errors ? 1 : 0);
})();

// Overlaps in CSS px: houses / cart box vs the speech bubble and HUD, cart (when parked) vs houses, things off-screen.
function measure(page) {
  return page.evaluate(() => {
    const w = BD.debug.world, v = BD.debug.view(), L = w.layout;
    const r = el => { const e = document.getElementById(el); if (!e || e.classList.contains('hidden') || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
    const toW = b => b && { x0: (b.left - v.left) / v.s, y0: (b.top - v.top) / v.s, x1: (b.right - v.left) / v.s, y1: (b.bottom - v.top) / v.s };
    const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) : 0;
    const bub = toW(r('bubble')), hud = toW(r('hud'));
    const out = { mode: BD.debug.mode, state: w.state, phase: w.phase, W: L.W, H: L.H, s: +v.s.toFixed(3), ins: L.ins, bubbleFaded: document.getElementById('bubble').classList.contains('under') };
    const houses = (w.houses || []).filter(h => (h.appear || 0) > 0.5).map(h => { return { id: h.id, S: h.S, box: w._houseBox(h) }; });
    out.houseS = houses.map(h => h.S);
    out.houseUnderBubble = houses.map(h => Math.round(ov(h.box, bub))).filter(Boolean);
    out.houseUnderHud = houses.map(h => Math.round(ov(h.box, hud))).filter(Boolean);
    out.houseOff = houses.map(h => Math.round(Math.max(0, L.ins.left - h.box.x0, h.box.x1 - (L.W - L.ins.right), L.ins.top - h.box.y0, h.box.y1 - (L.H - L.ins.bottom)))).filter(Boolean);
    if (w.cartBox && w.cart && w.cart.alpha > 0.5) {
      const cb = w.cartBox(), c = cb && (cb.x0 != null ? cb : { x0: cb.x, y0: cb.y, x1: cb.x + cb.w, y1: cb.y + cb.h });
      if (c) {
        out.cartState = w.cart.state;
        out.cartUnderBubble = Math.round(ov(c, bub));
        out.cartOverHouse = houses.map(h => Math.round(ov(c, h.box))).filter(Boolean);
        out.cartOff = Math.round(Math.max(0, L.ins.left - c.x0, c.x1 - (L.W - L.ins.right), c.y1 - (L.H - L.ins.bottom)));
      }
    }
    // DOM overflow (text clipped in buttons / bubble / panels)
    const clip = [];
    for (const e of document.querySelectorAll('.screen:not(.hidden) *, #bubble:not(.hidden) *, #hud:not(.hidden) *')) {
      if (!e.offsetParent) continue;
      if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && e.clientWidth) clip.push((e.id || e.className || e.tagName) + ' ' + e.scrollWidth + '>' + e.clientWidth);
      const b = e.getBoundingClientRect();
      if (b.width && (b.right > innerWidth + 1 || b.left < -1 || b.bottom > innerHeight + 1)) clip.push('OFF ' + (e.id || e.className || e.tagName) + ' ' + [b.left, b.top, b.right, b.bottom].map(Math.round).join(','));
    }
    out.domClip = clip.slice(0, 6);
    return out;
  });
}
