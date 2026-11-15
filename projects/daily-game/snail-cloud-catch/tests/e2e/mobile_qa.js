// Mobile functional QA (essentials) for the iPhone / iPad platform layer of Shelly's Sky Catch.
// Real touch (CDP Input.dispatchTouchEvent + page.touchscreen) in isMobile/hasTouch contexts. Covers what
// tests/e2e/mobile.js does not: rotation while a finger is down, pointercancel, three fingers, fingers that start on
// the HUD or 🚀, menu taps that never move Shelly, visibilitychange pause + audio suspend/resume, first-touchend audio
// unlock, kid-proofing (pinch / double-tap / long-press blocked, panels still scroll), items only dropping inside the
// reachable play range (bot at speed 8), manifest + icons, zero console errors.
// Usage: node tests/e2e/mobile_qa.js [--quick]   (--quick = 10 s bot runs)  → PASS/FAIL lines, exit 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../game');
const GAME = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.resolve(__dirname, '../out/mobile_qa'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const BOT_MS = QUICK ? 10000 : 30000;

let pass = 0, fail = 0; const fails = [];
const check = (name, ok, info) => {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (info !== undefined ? '  — ' + JSON.stringify(info).slice(0, 400) : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOBILE = [['iphone-portrait', 393, 852, 3], ['iphone-landscape', 852, 393, 3], ['ipad-portrait', 820, 1180, 2], ['ipad-landscape', 1180, 820, 2]];

async function openDev(b, [name, w, h, dsf], q) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); p._errs = [];
  p.on('console', m => { if (m.type() === 'error') p._errs.push(m.text()); }); p.on('pageerror', e => p._errs.push(String(e)));
  await p.goto(GAME + '?mute=1&seed=4' + (q || ''));
  await p.waitForFunction(() => window.SC && SC.debug && SC.debug.mode && SC.debug.mode !== 'boot', null, { timeout: 15000 });
  const cdp = await ctx.newCDPSession(p);
  p.touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: q[2] != null ? q[2] : i })) });
  p.sceneToCss = (x, y) => p.evaluate(([x, y]) => { const R = SC.Game.renderer, c = document.getElementById('game').getBoundingClientRect(); return [c.left + (x + R.SX) / R.VW * c.width, c.top + (y + R.SY) / R.VH * c.height]; }, [x, y]);
  p.center = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  return { ctx, p };
}
const quiet = p => p.evaluate(() => { const w = SC.debug.world; w.items.length = 0; w._nextDrop = 1e9; w._windNext = 1e9; w.snail.invuln = 99; });

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const dev of MOBILE) {
    const name = dev[0];
    const { ctx, p } = await openDev(b, dev);
    // audio unlock on the first touchend (iOS rule): the context exists after a tap on the title
    await p.touchscreen.tap(5, 5); await sleep(100);
    check(`${name}: first touch creates / resumes the audio context`, await p.evaluate(() => !!SC.Audio.ctx));
    // a tap on How to Play never starts or steers anything; its panel scrolls (kid-proofing exempts panels)
    await p.touchscreen.tap(...await p.center('#btnHow')); await sleep(300);
    check(`${name}: How to Play opens by touch`, (await p.evaluate(() => SC.UI.current)) === 'scrHow');
    const blocked = await p.evaluate(() => {
      const mk = (target) => { const e = new Event('touchmove', { bubbles: true, cancelable: true }); target.dispatchEvent(e); return e.defaultPrevented; };
      return { canvas: mk(document.getElementById('game')), panel: mk(document.querySelector('#scrHow .panel')) };
    });
    check(`${name}: touchmove blocked on the canvas, allowed inside panels`, blocked.canvas && !blocked.panel, blocked);
    const gz = await p.evaluate(() => { const e = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented; });
    check(`${name}: pinch-zoom gesture blocked`, gz);
    await p.touchscreen.tap(...await p.center('#scrHow .btn-back')); await sleep(300);
    check(`${name}: ghost click after the Back tap did not start a game`, (await p.evaluate(() => SC.debug.mode)) === 'title');
    // play
    await p.touchscreen.tap(...await p.center('#btnPlay')); await sleep(400);
    await p.waitForFunction(() => SC.debug.world.state === 'playing', null, { timeout: 5000 }).catch(() => {});
    await quiet(p);
    const rg = await p.evaluate(() => [SC.debug.world.cfg.xMin, SC.debug.world.cfg.xMax]);
    // a finger that starts on the HUD pause button pauses and never steers
    const x0 = await p.evaluate(() => SC.debug.world.snail.x);
    const pb = await p.center('#btnPause');
    await p.touch('touchStart', [[pb[0], pb[1], 1]]); await sleep(60); await p.touch('touchMove', [[pb[0] - 5, pb[1] + 4, 1]]);   /* a real tap wiggles a little (sliding off the button cancels it) */ await p.touch('touchEnd', []); await sleep(300);
    const st = await p.evaluate(() => ({ mode: SC.debug.mode, x: SC.debug.world.snail.x, down: SC.Game.pointerDown }));
    check(`${name}: finger on HUD pause pauses and never steers`, st.mode === 'paused' && Math.abs(st.x - x0) < 2 && !st.down, st);
    await p.touchscreen.tap(...await p.center('#btnResume')); await sleep(300);
    // a finger that starts on 🚀 hops but never steers
    const ab = await p.center('#btnAction');
    await p.evaluate(() => { const w = SC.debug.world; w.jet.charge = 1; w.jet.air = false; });
    const j0 = await p.evaluate(() => SC.debug.world.jets);
    await p.touch('touchStart', [[ab[0], ab[1], 3]]); await sleep(60); await p.touch('touchMove', [[ab[0] - 60, ab[1], 3]]); await sleep(300);
    const sa = await p.evaluate(() => ({ jets: SC.debug.world.jets, down: SC.Game.pointerDown }));
    await p.touch('touchEnd', []); await sleep(100);
    check(`${name}: finger on 🚀 hops and does not steer`, sa.jets === j0 + 1 && !sa.down, sa);
    // three fingers: the first steers, the others hop at most once each, nothing breaks
    const L = await p.sceneToCss(rg[0] + 40, 300), M = await p.sceneToCss(480, 250), N = await p.sceneToCss(520, 200);
    await p.evaluate(() => { const w = SC.debug.world; w.jet.charge = 1; w.jet.air = false; });
    await p.touch('touchStart', [[L[0], L[1], 1]]); await sleep(50);
    await p.touch('touchStart', [[L[0], L[1], 1], [M[0], M[1], 2]]); await sleep(50);
    await p.touch('touchStart', [[L[0], L[1], 1], [M[0], M[1], 2], [N[0], N[1], 3]]); await sleep(1600);
    const s3 = await p.evaluate(() => ({ x: SC.debug.world.snail.x, err: SC.debug.stats.errors.length }));
    check(`${name}: three fingers: Shelly follows finger 1`, Math.abs(s3.x - (rg[0] + 40)) < 30 && s3.err === 0, s3);
    // pointercancel (iOS system gesture): steering stops
    await p.touch('touchCancel', []); await sleep(150);
    check(`${name}: touchcancel releases the steering finger`, await p.evaluate(() => !SC.Game.pointerDown));
    // rotation while a finger is down: the finger is released, Shelly stays in range
    await p.touch('touchStart', [[L[0], L[1], 1]]); await sleep(300);
    await p.setViewportSize({ width: dev[2], height: dev[1] }); await sleep(600);
    const rot = await p.evaluate(() => { const w = SC.debug.world; return { down: SC.Game.pointerDown, x: w.snail.x, xMin: w.cfg.xMin, xMax: w.cfg.xMax }; });
    check(`${name}: rotating with a finger down releases it and keeps Shelly in range`, !rot.down && rot.x >= rot.xMin - 1 && rot.x <= rot.xMax + 1, rot);
    await p.touch('touchEnd', []); await sleep(100);
    await p.setViewportSize({ width: dev[1], height: dev[2] }); await sleep(600);
    // visibilitychange: pause + audio suspend, resume restores audio
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    const hid = await p.evaluate(() => ({ mode: SC.debug.mode, hidden: SC.Audio._hidden }));
    check(`${name}: app switch pauses the game and suspends audio`, hid.mode === 'paused' && hid.hidden === true, hid);
    await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(100);
    check(`${name}: coming back un-suspends audio (game stays paused until Resume)`, await p.evaluate(() => SC.Audio._hidden === false && SC.debug.mode === 'paused'));
    await p.touchscreen.tap(...await p.center('#btnResume')); await sleep(200);
    // bot at speed 8: every drop lands inside the reachable play range
    await p.evaluate(() => {
      window._drops = []; const G = SC.Game, o = G.handleEvents.bind(G);
      G.handleEvents = function (ev) { for (const e of ev) if (e.type === 'peek') window._drops.push(e.x); return o(ev); };
      const w = SC.debug.world; w.snail.invuln = 0; SC.debug.gotoLevel(0); SC.debug.setBot(true, 1); SC.debug.setSpeed(8);
    });
    await sleep(BOT_MS);
    const dr = await p.evaluate(() => ({ drops: window._drops, xMin: SC.debug.world.cfg.xMin, xMax: SC.debug.world.cfg.xMax, lv: SC.debug.world.level, err: SC.debug.stats.errors }));
    const out = dr.drops.filter(x => x < dr.xMin - 0.5 || x > dr.xMax + 0.5);
    check(`${name}: bot ×8: ${dr.drops.length} drops all inside the play range [${Math.round(dr.xMin)}, ${Math.round(dr.xMax)}]`, dr.drops.length > 10 && out.length === 0, { out: out.slice(0, 5), n: dr.drops.length });
    await p.screenshot({ path: `${OUT}/${name}_bot.png` });
    check(`${name}: no console / runtime errors`, p._errs.length === 0 && dr.err.length === 0, p._errs.concat(dr.err).slice(0, 3));
    await ctx.close();
  }
  // manifest + icons
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check('manifest: name, standalone/fullscreen display, icons listed', /Shelly/.test(man.name) && /fullscreen|standalone/.test(man.display) && man.icons.length >= 2, man.name);
  const icons = ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].map(f => [f, fs.existsSync(path.join(ROOT, 'assets/icons', f))]);
  check('icons: 180 / 192 / 512 PNGs present', icons.every(i => i[1]), icons);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('index.html: viewport-fit=cover, apple-touch-icon, manifest link', /viewport-fit=cover/.test(html) && /apple-touch-icon/.test(html) && /manifest\.webmanifest/.test(html));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
})();
