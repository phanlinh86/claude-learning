// Foxy's Reef Memory — mobile test: iPhone / iPad sizes, portrait + landscape, emulated touch (isMobile + hasTouch)
// and REAL touch events (Playwright touchscreen + CDP multi-touch).
// Checks: full-screen canvas with the letterbox filled by scenery (no black bars), menus fit, finger taps flip cards,
// HUD buttons ≥ 44 px inside the safe area (simulated notch), second-finger Pause, ghost-click guard, rotate prompt,
// rotation mid-game, pause on app switch, zero console errors.
// Usage: node tests/e2e/mobile.js            → PASS/FAIL lines, screenshots in tests/out/mobile/
'use strict';
const { chromium } = require('playwright');
const http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../game');
const OUT = path.resolve(__dirname, '../out/mobile'); fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
});
let pass = 0, fail = 0; const fails = [];
const check = (name, ok, info) => { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; fails.push(name); console.log('FAIL ' + name + (info !== undefined ? '  — ' + JSON.stringify(info) : '')); } };
const DEVICES = [
  ['iphone-landscape', 844, 390, 3], ['iphone-portrait', 390, 844, 3],
  ['ipad-landscape', 1024, 768, 2], ['ipad-pro-landscape', 1366, 1024, 2],
  ['ipad-portrait', 820, 1180, 2], ['iphone-se-landscape', 667, 375, 2]
];

/* stage (logical) → client css px */
const stageToClient = (page, x, y) => page.evaluate(([x, y]) => { const s = RF.Game.renderer.stageRect(); return [s.left + x * s.k, s.top + y * s.k]; }, [x, y]);
/* no black / empty pixels anywhere on the canvas (a 24×24 sample grid + the band centres) */
const blackScan = page => page.evaluate(() => {
  const c = document.getElementById('game'), g = c.getContext('2d'), R = RF.Game.renderer, bad = [];
  const pts = [];
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) pts.push([Math.floor((i + 0.5) / 24 * c.width), Math.floor((j + 0.5) / 24 * c.height)]);
  pts.push([2, 2], [c.width - 3, 2], [2, c.height - 3], [c.width - 3, c.height - 3]);
  for (const [x, y] of pts) { const d = g.getImageData(x, y, 1, 1).data; if (d[0] < 14 && d[1] < 14 && d[2] < 14) bad.push([x, y]); }
  return { bad: bad.slice(0, 5), n: bad.length, OX: R.OX, OY: R.OY };
});
/* every visible button / row of the current screen inside the viewport; panel fits or scrolls */
const menuFit = page => page.evaluate(() => {
  const scr = RF.UI.current && document.getElementById(RF.UI.current); if (!scr) return { ok: false, why: 'no screen' };
  const vw = innerWidth, vh = innerHeight, out = [];
  const panel = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
  const pr = panel.getBoundingClientRect();
  const scrolls = panel.scrollHeight > panel.clientHeight + 1;
  const canScroll = scrolls && /auto|scroll/.test(getComputedStyle(panel).overflowY);
  if (pr.left < -0.5 || pr.top < -0.5 || pr.right > vw + 0.5 || pr.bottom > vh + 0.5) out.push('panel ' + [pr.left, pr.top, pr.right, pr.bottom].map(Math.round));
  if (panel.scrollWidth > panel.clientWidth + 1) out.push('panel scrolls sideways');
  for (const b of scr.querySelectorAll('button, .set')) {
    if (b.offsetParent === null) continue;
    const r = b.getBoundingClientRect();
    if (r.left < -0.5 || r.right > vw + 0.5) out.push('x:' + (b.id || b.textContent.trim().slice(0, 14)));
    if (!scrolls && (r.top < -0.5 || r.bottom > vh + 0.5)) out.push('y:' + (b.id || b.textContent.trim().slice(0, 14)));
  }
  if (scrolls && !canScroll) out.push('overflows but cannot scroll');
  return { ok: out.length === 0, out, scrolls };
});

srv.listen(0, async () => {
  const BASE = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await chromium.launch();
  try {
    for (const [name, w, h, dsf] of DEVICES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); const errs = [];
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push(String(e)));
      await page.goto(BASE + '?mute=1&seed=4');
      await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title', null, { timeout: 15000 });
      await page.evaluate(() => RF.Game.setSetting('peek', 0));
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${name}_1title.png` });
      const lay = await page.evaluate(() => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { cw: r.width, ch: r.height, vw: innerWidth, vh: innerHeight, bs: [c.width, c.height], touch: document.body.classList.contains('touch') }; });
      check(`${name}: canvas fills the screen`, Math.abs(lay.cw - lay.vw) < 2 && Math.abs(lay.ch - lay.vh) < 2, lay);
      check(`${name}: backing store ≤ 3.3 MP`, lay.bs[0] * lay.bs[1] <= 3.3e6, lay.bs);
      check(`${name}: touch layout active`, lay.touch);
      const bk = await blackScan(page);
      check(`${name}: title — letterbox filled with scenery (no black bars)`, bk.n === 0, bk);
      check(`${name}: title menu fits`, (await menuFit(page)).ok, await menuFit(page));
      const bh = await page.evaluate(() => ['btnPlay', 'btnCustomize', 'btnHow', 'btnSettings'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.height), r.top >= 0 && r.bottom <= innerHeight]; }));
      check(`${name}: title buttons ≥ 44 px tall and on screen`, bh.every(b => b[0] >= 44 && b[1]), bh);
      // menus: tap through Settings / How / Change Pictures with real taps (ghost-click guard: nothing toggles)
      for (const [btn, scr] of [['btnSettings', 'scrSettings'], ['btnHow', 'scrHow'], ['btnCustomize', 'scrCustom']]) {
        const s0 = await page.evaluate(() => JSON.stringify(RF.Game.settings));
        const r = await page.locator('#' + btn).boundingBox();
        await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
        await page.waitForTimeout(450);
        check(`${name}: tap ${btn} opens ${scr}`, await page.evaluate(s => RF.UI.current === s, scr));
        check(`${name}: ${scr} — the tap's ghost click changed nothing`, (await page.evaluate(() => JSON.stringify(RF.Game.settings))) === s0);
        const f = await menuFit(page);
        check(`${name}: ${scr} fits on screen${f.scrolls ? ' (scrolls)' : ''}`, f.ok, f);
        await page.screenshot({ path: `${OUT}/${name}_2${scr}.png` });
        const back = await page.locator(`#${scr} .btn-back`).last().boundingBox();
        await page.evaluate(s => { const p = document.querySelector('#' + s + ' .panel'); if (p) p.scrollTop = p.scrollHeight; }, scr);
        const back2 = await page.locator(`#${scr} .btn-back`).last().boundingBox();
        await page.touchscreen.tap(back2.x + back2.width / 2, back2.y + back2.height / 2);
        await page.waitForTimeout(400);
        check(`${name}: ${scr} back button returns to the title`, await page.evaluate(() => RF.UI.current === 'scrTitle'), back);
      }
      // start with a real tap on Play
      const pb = await page.locator('#btnPlay').boundingBox();
      await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2);
      await page.waitForTimeout(300);
      check(`${name}: tapping Play starts the game`, await page.evaluate(() => RF.debug.mode === 'playing'));
      const rot = await page.evaluate(() => !document.getElementById('rotate').classList.contains('hidden'));
      const wantRot = h > w && Math.min(w, h) < 600;
      check(`${name}: rotate prompt ${wantRot ? 'shown' : 'not shown'}`, rot === wantRot, rot);
      if (rot) {
        await page.screenshot({ path: `${OUT}/${name}_3rotate.png` });
        const t0 = await page.evaluate(() => RF.debug.world.time);
        await page.waitForTimeout(400);
        check(`${name}: game waits behind the rotate prompt`, (await page.evaluate(() => RF.debug.world.time)) === t0);
        const ok = await page.locator('#btnRotateOk').boundingBox();
        await page.touchscreen.tap(ok.x + ok.width / 2, ok.y + ok.height / 2);
        await page.waitForTimeout(200);
        check(`${name}: "Play upright anyway" hides it`, await page.evaluate(() => document.getElementById('rotate').classList.contains('hidden') && RF.debug.mode === 'playing'));
      }
      await page.waitForFunction(() => RF.debug.world.state === 'playing', null, { timeout: 8000 }).catch(() => {});
      await page.evaluate(() => { RF.Game.renderer.banner = null; });
      await page.waitForTimeout(300);
      // real finger taps flip cards
      const ids = await page.evaluate(() => RF.debug.world.cards.filter(c => c.state === 'down').slice(0, 2).map(c => c.id));
      for (const id of ids) {
        const c = await page.evaluate(id => { const k = RF.debug.world.card(id); return [k.x, k.y]; }, id);
        const p = await stageToClient(page, c[0], c[1]);
        await page.touchscreen.tap(p[0], p[1]);
        await page.waitForTimeout(260);
      }
      const st = await page.evaluate(ids => ids.map(id => { const k = RF.debug.world.card(id); return k.state + ':' + (k.flip || 0).toFixed(2); }), ids);
      check(`${name}: two finger taps flip two cards`, st.every(s => /^(up|matched|gone|down):/.test(s) && !/^down:0\.00/.test(s)), st);
      await page.waitForTimeout(1300);
      // HUD: buttons ≥ 44 px inside the screen; air meter clear of the buttons; canvas HUD inside the screen
      const hud = await page.evaluate(() => {
        const R = RF.Game.renderer, L = R.hudLayout, B = R.btnRect, s = R.stageRect();
        const bs = ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, r: r.right, t: r.top, b: r.bottom }; });
        const hs = L.hs || 1, by = 104 + L.hy;   // lifted HUD groups grow around their bottom edge
        const meter = { l: s.left + (L.mx + L.mw - L.mw * hs) * s.k, r: s.left + (L.mx + L.mw) * s.k, t: s.top + (by - (by - L.my) * hs) * s.k, b: s.top + (by - (by - L.my - 22) * hs) * s.k };
        const pill = { l: s.left + (16 * hs + L.hx) * s.k, t: s.top + (by - (by - 16 - L.hy) * hs) * s.k };
        const tray = RF.debug.world.tray;
        return { bs, meter, pill, B, L, trayTop: s.top + tray.y * s.k, vw: innerWidth, vh: innerHeight };
      });
      check(`${name}: HUD buttons ≥ 44 px and on screen`, hud.bs.every(b => b.w >= 43.5 && b.h >= 43.5 && b.l >= 0 && b.r <= hud.vw && b.t >= 0), hud.bs);
      const ov = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      check(`${name}: air meter does not touch the HUD buttons`, hud.bs.every(b => !ov(hud.meter, b)), { m: hud.meter, b: hud.bs });
      check(`${name}: canvas HUD inside the screen and above the board`, hud.meter.l >= 0 && hud.meter.r <= hud.vw && hud.meter.t >= 0 && hud.pill.l >= 0 && hud.pill.t >= 0 && hud.meter.b <= hud.trayTop + 2, hud);
      await page.screenshot({ path: `${OUT}/${name}_4play.png` });
      const bk2 = await blackScan(page);
      check(`${name}: playing — no black bars`, bk2.n === 0, bk2);
      // second finger: one finger rests on the board, another taps Pause
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p[0], y: p[1], id: p[2] })) });
      const rest = await stageToClient(page, 140, 300);
      const pz = await page.locator('#btnPause').boundingBox(), pc = [pz.x + pz.width / 2, pz.y + pz.height / 2];
      await touch('touchStart', [[rest[0], rest[1], 1]]);
      await touch('touchStart', [[rest[0], rest[1], 1], [pc[0], pc[1], 2]]);
      await page.waitForTimeout(60);
      await touch('touchEnd', [[rest[0], rest[1], 1]]);
      await page.waitForTimeout(60);
      await touch('touchEnd', []);
      await page.waitForTimeout(300);
      check(`${name}: second finger on Pause pauses the game`, await page.evaluate(() => RF.debug.mode === 'paused'));
      const pf = await menuFit(page);
      check(`${name}: pause menu fits`, pf.ok, pf);
      await page.screenshot({ path: `${OUT}/${name}_5pause.png` });
      const rb = await page.locator('#btnResume').boundingBox();
      await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2);
      await page.waitForTimeout(300);
      check(`${name}: tap Resume resumes`, await page.evaluate(() => RF.debug.mode === 'playing'));
      // app switch → pause
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      check(`${name}: hiding the page pauses`, await page.evaluate(() => RF.debug.mode === 'paused'));
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); RF.Game.resume(); });
      // winter board (6×4) — the smallest cards
      await page.evaluate(() => { RF.debug.gotoLevel(3); const G = RF.Game; G.weather.setSeason(3, { instant: true }); G.renderer.setSeason(3, true); let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.banner = null; });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: `${OUT}/${name}_6winter.png` });
      const cw = await page.evaluate(() => { const s = RF.Game.renderer.stageRect(); return RF.debug.world.cfg.cardW * s.k; });
      check(`${name}: winter cards ≥ ${wantRot ? 28 : 40} css px wide`, cw >= (wantRot ? 28 : 40), +cw.toFixed(1));
      const bk3 = await blackScan(page);
      check(`${name}: winter — no black bars`, bk3.n === 0, bk3);
      // rotate the device mid-game
      await page.setViewportSize({ width: h, height: w }); await page.waitForTimeout(600);
      const r2 = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(); return { cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight, mode: RF.debug.mode }; });
      check(`${name}: after rotating, the canvas refills the screen`, Math.abs(r2.cw - r2.vw) < 2 && Math.abs(r2.ch - r2.vh) < 2, r2);
      await page.evaluate(() => { RF.Game._rotOk = true; RF.Game.syncRotate(); });
      const id2 = await page.evaluate(() => { const c = RF.debug.world.cards.find(c => c.state === 'down'); return c && c.id; });
      if (id2 != null) {
        await page.waitForTimeout(900);
        const c = await page.evaluate(id => { const k = RF.debug.world.card(id); return [k.x, k.y]; }, id2);
        const p = await stageToClient(page, c[0], c[1]);
        await page.touchscreen.tap(p[0], p[1]); await page.waitForTimeout(250);
        check(`${name}: after rotating, a finger tap still flips the right card`, await page.evaluate(id => { const k = RF.debug.world.card(id); return k.state !== 'down' || k.flip > 0; }, id2));
      }
      await page.screenshot({ path: `${OUT}/${name}_7rotated.png` });
      const bk4 = await blackScan(page);
      check(`${name}: rotated — no black bars`, bk4.n === 0, bk4);
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400);
      // game over panel
      await page.evaluate(() => { RF.debug.world.air = 0.001; });
      await page.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
      const of = await menuFit(page);
      check(`${name}: game-over panel fits`, RF_ok(of), of);
      await page.screenshot({ path: `${OUT}/${name}_8over.png` });
      check(`${name}: no console errors`, errs.length === 0 && (await page.evaluate(() => RF.debug.stats.errors.length)) === 0, errs.slice(0, 3));
      await ctx.close();
    }
    // notch: simulated safe-area insets (iPhone landscape: 47 px each side + 21 px home indicator; portrait iPad: 24 top)
    for (const [name, w, h, pad] of [['notch-landscape-left', 844, 390, '0 47px 21px 47px'], ['notch-portrait', 390, 844, '47px 0 34px 0'], ['notch-ipad', 1180, 820, '24px 0 20px 0']]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(); const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      await page.addInitScript(p => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#safeProbe{padding:' + p + ' !important}'; document.head.appendChild(st); }); }, pad);
      await page.goto(BASE + '?mute=1&seed=4&autostart=1');
      await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'playing', null, { timeout: 15000 });
      await page.evaluate(() => { RF.Game._rotOk = true; RF.Game.relayout(); });
      await page.waitForTimeout(1800);
      const r = await page.evaluate(() => {
        const R = RF.Game.renderer, L = R.hudLayout, s = R.stageRect(), i = R.insets;
        const hb = document.getElementById('hud').getBoundingClientRect();
        const hs = L.hs || 1, by = 104 + L.hy, Y = y => s.top + (by - (by - y) * hs) * s.k;
        return { i, hs, hud: { l: hb.left, r: hb.right, t: hb.top }, pillL: s.left + (16 * hs + L.hx) * s.k, pillT: Y(16 + L.hy), meterR: s.left + (L.mx + L.mw) * s.k, meterT: Y(L.my), scoreT: Y(46 + L.hy - 26), vw: innerWidth };
      });
      check(`${name}: insets read from #safeProbe`, r.i.left + r.i.right + r.i.top > 20, r.i);
      check(`${name}: HUD buttons inside the safe area`, r.hud.r <= r.vw - r.i.right + 0.5 && r.hud.t >= r.i.top - 0.5, r);
      check(`${name}: canvas HUD inside the safe area`, r.pillL >= r.i.left - 0.5 && r.pillT >= r.i.top - 0.5 && r.meterR <= r.vw - r.i.right + 0.5 && r.meterT >= r.i.top - 0.5 && r.scoreT >= r.i.top - 0.5, r);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      check(`${name}: no errors`, errs.length === 0, errs.slice(0, 3));
      await ctx.close();
    }
  } catch (e) { check('exception', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); }
  await browser.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
});
function RF_ok(f) { return f && f.ok; }
