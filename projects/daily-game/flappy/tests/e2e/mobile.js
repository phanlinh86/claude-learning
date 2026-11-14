// Mobile (iPhone / iPad) checks with real touch input (Playwright hasTouch / isMobile, CDP touch events).
// Starts its own static server for game/. Screenshots → tests/out/mobile/.
// Usage: node tests/e2e/mobile.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'game');
const OUT = path.join(__dirname, '..', 'out', 'mobile');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
});
let fails = 0, passes = 0;
const check = (ok, name, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra != null && !ok ? '  ' + extra : '')); if (ok) passes++; else fails++; };

const DEVICES = [
  { n: 'iphone_land', w: 844, h: 390, dpr: 3, notch: { top: 0, right: 47, bottom: 21, left: 47 } },
  { n: 'iphone_port', w: 390, h: 844, dpr: 3, notch: { top: 47, right: 0, bottom: 34, left: 0 } },
  { n: 'ipad_land', w: 1024, h: 768, dpr: 2, notch: { top: 24, right: 0, bottom: 20, left: 0 } },
  { n: 'ipad_pro_land', w: 1366, h: 1024, dpr: 2, notch: { top: 24, right: 0, bottom: 20, left: 0 } },
  { n: 'ipad_port', w: 820, h: 1180, dpr: 2, notch: { top: 24, right: 0, bottom: 20, left: 0 } }
];

const mode = p => p.evaluate(() => FF.debug.mode);
const wstate = p => p.evaluate(() => FF.debug.world.state);
async function waitTitle(p) { await p.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title', null, { timeout: 15000 }); await p.waitForTimeout(400); }

/* every visible panel / title block lies inside the viewport; overflowing content is scrollable */
async function fits(p, sel) {
  return p.evaluate(sel => {
    const el = document.querySelector(sel); if (!el) return { ok: false, why: 'missing' };
    const r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const inside = r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1;
    const cs = getComputedStyle(el), over = el.scrollHeight > el.clientHeight + 2;
    const scrollable = !over || /(auto|scroll)/.test(cs.overflowY);
    return { ok: inside && scrollable, why: JSON.stringify({ l: r.left | 0, t: r.top | 0, r: r.right | 0, b: r.bottom | 0, vw, vh, over, oy: cs.overflowY }) };
  }, sel);
}
/* the game canvas covers the whole screen and its edges are scenery, not black */
async function noBars(p) {
  return p.evaluate(() => {
    const c = document.getElementById('game'), r = c.getBoundingClientRect();
    const full = Math.abs(r.left) < 1 && Math.abs(r.top) < 1 && Math.abs(r.width - innerWidth) < 1.5 && Math.abs(r.height - innerHeight) < 1.5;
    const g = c.getContext('2d'), W = c.width, H = c.height, pts = [];
    for (const fx of [0.002, 0.25, 0.5, 0.75, 0.998]) for (const fy of [0.002, 0.15, 0.5, 0.85, 0.998]) {
      if (fx !== 0.002 && fx !== 0.998 && fy !== 0.002 && fy !== 0.998) continue;   // edges only
      const d = g.getImageData(Math.floor(fx * (W - 1)), Math.floor(fy * (H - 1)), 1, 1).data;
      pts.push(d[0] + d[1] + d[2]);
    }
    const dark = pts.filter(v => v < 60).length;
    return { ok: full && dark === 0, why: JSON.stringify({ full, w: r.width, h: r.height, dark, pts }) };
  });
}
async function cdpTouch(cdp, type, points) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }); }
async function center(p, sel) { const b = await p.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  try {
    for (const D of DEVICES) {
      const ctx = await browser.newContext({ viewport: { width: D.w, height: D.h }, deviceScaleFactor: D.dpr, hasTouch: true, isMobile: true });
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const cdp = await ctx.newCDPSession(p);
      await p.goto(base + '?seed=3&mute=1');
      await waitTitle(p);
      const N = D.n + ': ';
      check(await p.evaluate(() => document.body.classList.contains('touch') && FF.Game.isTouch), N + 'touch layout detected');
      const nb = await noBars(p); check(nb.ok, N + 'title: canvas fills the screen, no black bars', nb.why);
      const tf = await fits(p, '.title-wrap'); check(tf.ok, N + 'title menu fits', tf.why);
      await p.screenshot({ path: path.join(OUT, D.n + '_title.png') });

      // menus open with a finger tap and fit the screen
      for (const [btn, scr, sel] of [['#btnHow', 'scrHow', '#scrHow .panel'], ['#btnSettings', 'scrSettings', '#scrSettings .panel'], ['#btnCustomize', 'scrCustom', '#scrCustom .panel']]) {
        await p.locator(btn).tap(); await p.waitForTimeout(700);
        check(await p.evaluate(s => FF.UI.current === s, scr), N + 'tap ' + btn + ' opens ' + scr + ' (and the ghost click does not close it)');
        const f = await fits(p, sel); check(f.ok, N + scr + ' fits the screen (scrolls if needed)', f.why);
        const tb = await p.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [...document.querySelectorAll(sel + ' .btn, ' + sel + ' .seg button')].filter(b => b.offsetParent).every(b => { const k = b.getBoundingClientRect(); return k.height >= 30; }); }, sel);
        check(tb, N + scr + ' buttons are finger-sized');
        await p.screenshot({ path: path.join(OUT, D.n + '_' + scr + '.png') });
        await p.locator(sel + ' .btn-back').last().scrollIntoViewIfNeeded();
        await p.locator(sel + ' .btn-back').last().tap(); await p.waitForTimeout(500);
        check(await p.evaluate(() => FF.UI.current === 'scrTitle'), N + scr + ' back button (tap) returns to the title');
      }

      // play: tap Play → Get Ready (playing / world ready) → finger taps flap
      await p.locator('#btnPlay').tap(); await p.waitForTimeout(700);
      check(await mode(p) === 'playing' && await wstate(p) === 'ready', N + 'tap Play → Get Ready', await mode(p) + '/' + await wstate(p));
      await p.screenshot({ path: path.join(OUT, D.n + '_ready.png') });
      const nb2 = await noBars(p); check(nb2.ok, N + 'in game: no black bars', nb2.why);
      const flaps0 = await p.evaluate(() => FF.debug.world.flaps || 0);
      for (let i = 0; i < 16; i++) { await p.touchscreen.tap(D.w * (0.3 + 0.4 * (i % 2)), D.h * 0.55); await p.waitForTimeout(230); }
      const st = await p.evaluate(() => ({ s: FF.debug.world.state, f: FF.debug.world.flaps || 0, drops: FF.debug.world.drops_made }));
      check(st.f - flaps0 >= 12 && st.s === 'playing', N + 'the game plays with finger taps (bird kept flying, treats dropped)', JSON.stringify(st));
      await p.evaluate(() => FF.debug.setBot(true, 1));   // autopilot keeps the bird flying through the next checks
      await p.screenshot({ path: path.join(OUT, D.n + '_play.png') });
      // the bird can use the screen: soft ceiling at or above the classic one and below the top of the screen
      const v = await p.evaluate(() => ({ c: FF.debug.world.cfg.ceilingY, SY: FF.Game.renderer.SY, L: FF.debug.world.cfg.viewL, R: FF.debug.world.cfg.viewR, VW: FF.Game.renderer.VW, SX: FF.Game.renderer.SX }));
      check(v.c <= 0 && v.c >= -v.SY && Math.abs(v.L + v.SX) < 1 && Math.abs(v.R - (v.VW - v.SX)) < 1, N + 'world knows the visible range + ceiling', JSON.stringify(v));

      // a second finger can press Pause while the first is still down
      const pc = await center(p, '#btnPause');
      await cdpTouch(cdp, 'touchStart', [{ x: D.w * 0.4, y: D.h * 0.6, id: 1 }]);
      await p.waitForTimeout(60);
      await cdpTouch(cdp, 'touchStart', [{ x: D.w * 0.4, y: D.h * 0.6, id: 1 }, { x: pc.x, y: pc.y, id: 2 }]);
      await p.waitForTimeout(60);
      await cdpTouch(cdp, 'touchEnd', [{ x: D.w * 0.4, y: D.h * 0.6, id: 1 }]);
      await p.waitForTimeout(60);
      await cdpTouch(cdp, 'touchEnd', []);
      await p.waitForTimeout(400);
      check(await mode(p) === 'paused', N + 'second finger on Pause pauses the game', await mode(p));
      const pf = await fits(p, '#scrPause .panel'); check(pf.ok, N + 'pause panel fits', pf.why);
      await p.screenshot({ path: path.join(OUT, D.n + '_pause.png') });
      await p.locator('#btnResume').tap(); await p.waitForTimeout(400);
      check(await mode(p) === 'playing', N + 'Resume (tap) continues');
      await p.evaluate(() => FF.debug.setBot(true, 1));   // autopilot keeps the bird flying through the layout checks

      // safe area: simulate a notch / home bar and check the HUD stays inside it
      await p.addStyleTag({ content: `#safeProbe{padding:${D.notch.top}px ${D.notch.right}px ${D.notch.bottom}px ${D.notch.left}px !important}` });
      await p.evaluate(() => FF.Game.relayout());
      await p.waitForTimeout(250);
      const hud = await p.evaluate(() => { const r = document.getElementById('hud').getBoundingClientRect(); const R = FF.Game.renderer; return { top: r.top, right: r.right, ins: R.ins, s: R.cssScale }; });
      check(hud.top >= D.notch.top && hud.right <= D.w - D.notch.right, N + 'pause / sound buttons inside the safe area', JSON.stringify(hud));
      check(Math.abs(hud.ins.left * hud.s - D.notch.left) < 1 && Math.abs(hud.ins.top * hud.s - D.notch.top) < 1, N + 'canvas HUD uses the safe-area insets', JSON.stringify(hud.ins));
      await p.evaluate(n => { const d = document.createElement('div'); d.id = 'fakeNotch'; d.style.cssText = 'position:fixed;z-index:99;background:rgba(0,0,0,.85);pointer-events:none;border-radius:0 0 18px 18px;' +
        (n.left ? `left:0;top:30%;width:${n.left - 10}px;height:40%;border-radius:0 18px 18px 0` : `left:30%;top:0;width:40%;height:${Math.max(0, n.top - 10)}px`); document.body.appendChild(d); }, D.notch);
      await p.waitForTimeout(250);
      await p.screenshot({ path: path.join(OUT, D.n + '_notch.png') });
      await p.evaluate(() => document.getElementById('fakeNotch').remove());

      // app switch: pause + audio suspended
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      await p.waitForTimeout(150);
      check(await mode(p) === 'paused' && await p.evaluate(() => FF.Audio._hidden === true), N + 'hidden page → paused + audio suspended');
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
      await p.locator('#btnResume').tap(); await p.waitForTimeout(300);

      // rotate mid-game: layout + world view follow, no errors
      await p.setViewportSize({ width: D.h, height: D.w });
      await p.waitForTimeout(700);
      const rv = await p.evaluate(() => ({ R: FF.debug.world.cfg.viewR, VW: FF.Game.renderer.VW, SX: FF.Game.renderer.SX, m: FF.debug.mode }));
      check(Math.abs(rv.R - (rv.VW - rv.SX)) < 1, N + 'rotation re-lays out the world', JSON.stringify(rv));
      const nb3 = await noBars(p); check(nb3.ok, N + 'after rotation: no black bars', nb3.why);
      await p.screenshot({ path: path.join(OUT, D.n + '_rotated.png') });
      await p.setViewportSize({ width: D.w, height: D.h }); await p.waitForTimeout(500);

      // game over panel fits; Play Again by tap
      await p.evaluate(() => { FF.debug.setBot(false); const G = FF.Game; G.world.score = 27; G.gameOver(); });
      await p.waitForTimeout(1000);
      const of = await fits(p, '#scrOver .panel'); check(of.ok, N + 'game over panel fits', of.why);
      await p.screenshot({ path: path.join(OUT, D.n + '_over.png') });
      await p.locator('#btnAgain').tap(); await p.waitForTimeout(500);
      check(await mode(p) === 'playing' && await wstate(p) === 'ready', N + 'Play Again (tap) → new round, Get Ready');

      // kid-proofing: pinch / double-tap zoom off
      const zoom = await p.evaluate(() => { const ev = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(ev); return ev.defaultPrevented; });
      check(zoom, N + 'pinch gesture is blocked');
      check(await p.evaluate(() => /user-scalable=no/.test(document.querySelector('meta[name=viewport]').content) && /viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content)), N + 'viewport: no zoom, edge to edge');

      check(errors.length === 0, N + 'zero console errors', errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    // home-screen app files
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    check(man.icons.every(i => fs.existsSync(path.join(ROOT, i.src))) && fs.existsSync(path.join(ROOT, 'assets/icons/apple-touch-icon.png')), 'manifest + home-screen icons exist');
  } catch (e) { check(false, 'exception', String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); }
  await browser.close(); srv.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
});
