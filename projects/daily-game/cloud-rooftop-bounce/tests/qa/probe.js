#!/usr/bin/env node
// QA probes beyond tests/e2e/functional.js (report-only; see docs/reports/functional.md).
// Run: node tests/qa/probe.js   (SOAK=seconds to change the long bot run, default 150 s wall clock)
'use strict';
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = [];
const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d != null ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); };
let GAME, browser;
async function open(q, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts));
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(GAME + (q ? '?' + q : ''));
  await p.waitForFunction(() => window.WRB && WRB.debug && (WRB.debug.mode === 'title' || WRB.debug.mode === 'playing'), null, { timeout: 15000 });
  await p.evaluate(() => { window._ev = []; const G = WRB.Game, he = G.handleEvents; G.handleEvents = function (e) { if (_ev.length < 20000) _ev.push(...e.map(x => Object.assign({}, x))); return he.apply(this, arguments); }; });
  return { ctx, p, errs };
}
const W = (p, fn, a) => p.evaluate(fn, a);
const holdServe = p => W(p, () => { const w = WRB.debug.world; if (w.phase === 'serve') w.serveT = -1e6; });
const stick = p => W(p, () => {
  const w = WRB.debug.world; if (w.phase === 'serve') w.serve(); WRB.debug.giveMagnet();
  const b = w.ball; w.paddle.target = w.paddle.x = w.paddle.px = 8; w.paddle.vx = 0; b.x = b.px = 8.4; b.y = b.py = 2.2; b.vx = 0; b.vy = -5;
}).then(() => p.waitForFunction(() => WRB.debug.world.ball && WRB.debug.world.ball.stuck, null, { timeout: 4000 }).then(() => true, () => false));
async function forceOver(p) {
  await W(p, () => { const w = WRB.debug.world; w.hearts = 1; if (w.phase === 'serve') w.serve(); w.net.saves = 0; const b = w.ball; b.x = w.paddle.x > 8 ? 2 : 14; b.y = 0.9; b.vx = 0; b.vy = -6; });
  await p.waitForFunction(() => WRB.debug.mode === 'over', null, { timeout: 10000 });
}

(async () => {
  GAME = (await serve()).url;
  browser = await chromium.launch();

  // ---------- 1. keyboard double-trigger on a mouse-focused HUD button ----------
  {
    const { ctx, p } = await open('mute=1&seed=4&autostart=1');
    await holdServe(p);
    const mb = await p.locator('#btnMuteHud').boundingBox();
    await p.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2); await sleep(150);
    const a = await W(p, () => ({ f: document.activeElement.id, m: WRB.Audio.muted }));
    await p.keyboard.press('Space'); await sleep(150);
    const b = await W(p, () => ({ m: WRB.Audio.muted, ph: WRB.debug.world.phase }));
    check('Space after clicking HUD Mute serves and does not toggle mute again', b.m === a.m && b.ph === 'play', { a, b });
    await W(p, () => WRB.debug.startGame()); await holdServe(p);
    await p.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2); await sleep(150);
    const c = await W(p, () => WRB.Audio.muted);
    await p.keyboard.press('Enter'); await sleep(150);
    const d = await W(p, () => ({ m: WRB.Audio.muted, ph: WRB.debug.world.phase }));
    check('Enter after clicking HUD Mute serves and does not toggle mute again', d.m === c && d.ph === 'play', { c, d });
    await ctx.close();
  }

  // ---------- 2. magnet flows ----------
  {
    const { ctx, p, errs } = await open('mute=1&seed=5&autostart=1&diff=easy');
    check('pearl sticks with the magnet', await stick(p));
    await W(p, () => { WRB.debug.world.ball.stuckT = 1.2; });
    await p.keyboard.press('Escape'); await sleep(600);
    const s1 = await W(p, () => ({ mode: WRB.debug.mode, st: WRB.debug.world.ball.stuckT, stuck: WRB.debug.world.ball.stuck, m: WRB.debug.world.magnet.t }));
    await sleep(600);
    const s2 = await W(p, () => ({ st: WRB.debug.world.ball.stuckT, m: WRB.debug.world.magnet.t }));
    check('stuck + pause: stuck timer and magnet timer frozen', s1.mode === 'paused' && s1.stuck && s1.st === s2.st && s1.m === s2.m, { s1, s2 });
    await p.keyboard.press('Escape'); await sleep(100);
    await p.keyboard.press('Space'); await sleep(100);
    const s3 = await W(p, () => ({ stuck: WRB.debug.world.ball.stuck, vy: WRB.debug.world.ball.vy }));
    check('resume then Space lets go upward', !s3.stuck && s3.vy > 0, s3);
    // magnet ends while stuck
    await W(p, () => WRB.debug.startGame()); await holdServe(p);
    await stick(p);
    await W(p, () => { WRB.debug.world.ball.stuckT = 5; WRB.debug.world.magnet.t = 0.25; window._ev.length = 0; });
    await sleep(500);
    const e = await W(p, () => ({ b: WRB.debug.world.ball && { stuck: WRB.debug.world.ball.stuck, vy: WRB.debug.world.ball.vy }, ev: _ev.filter(x => /magnet|release/.test(x.type)).map(x => x.type + (x.auto ? ':auto' : '')) }));
    check('magnet ending while stuck releases the pearl at once (auto)', e.b && !e.b.stuck && e.b.vy > 0 && e.ev.includes('release:auto') && e.ev.includes('magnetEnd'), e);
    // no stick in the last 0.3 s
    await W(p, () => { const w = WRB.debug.world; WRB.debug.giveMagnet(); w.magnet.t = 0.25; const b = w.ball; w.paddle.target = w.paddle.x = 8; b.x = 8.3; b.y = 1.9; b.vx = 0; b.vy = -5; });
    await sleep(250);
    check('no sticking during the magnet\'s last 0.3 s', await W(p, () => !WRB.debug.world.ball.stuck));
    // tap / click on the HUD gap while stuck must not release (touch context below), mouse: HUD button click
    await W(p, () => WRB.debug.startGame()); await holdServe(p); await stick(p);
    await W(p, () => { WRB.debug.world.ball.stuckT = 6; });
    const pb = await p.locator('#btnMuteHud').boundingBox();
    await p.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(100);
    check('mouse click on HUD Mute while stuck does not release', await W(p, () => WRB.debug.world.ball.stuck));
    // game over while magnet on
    await W(p, () => WRB.debug.startGame()); await holdServe(p);
    await W(p, () => { WRB.debug.giveMagnet(); });
    await forceOver(p);
    const go = await W(p, () => ({ m: WRB.debug.world.magnet.t, face: WRB.debug.world.paddle.face, items: WRB.debug.world.gems.length + WRB.debug.world.powerups.length }));
    check('game over while magnet on: magnet off, face not "magnet"', go.m === 0 && go.face !== 'magnet', go);
    // zone clear (last block) while magnet on, then the next zone: pearl can still stick and release
    await W(p, () => WRB.debug.startGame()); await holdServe(p);
    await W(p, () => { const w = WRB.debug.world; w.serve(); WRB.debug.giveMagnet(); w.debugClear(1); const k = w.bricks.find(b => b.alive); const b = w.ball; b.x = k.x; b.y = k.y - 0.8; b.vx = 0; b.vy = 6; });
    await p.waitForFunction(() => WRB.debug.world.phase === 'clear', null, { timeout: 4000 }).catch(() => {});
    await p.waitForFunction(() => WRB.debug.world.phase === 'serve' && WRB.debug.world.level === 1, null, { timeout: 8000 }).catch(() => {});
    const z = await W(p, () => ({ ph: WRB.debug.world.phase, lv: WRB.debug.world.level, m: WRB.debug.world.magnet.t, ball: !!WRB.debug.world.ball }));
    check('zone clear with magnet on → next zone serves normally', z.ph === 'serve' && z.lv === 1 && z.ball, z);
    // debug hook: clearBricks(0) while the pearl is stuck → zone never clears (soft-lock of the hook)
    await stick(p);
    await W(p, () => { WRB.debug.world.ball.stuckT = 0.05; WRB.debug.clearBricks(0); });
    await sleep(1500);
    const dz = await W(p, () => ({ ph: WRB.debug.world.phase, left: WRB.debug.world.bricksLeft() }));
    check('debug clearBricks(0) leads to a zone clear', dz.ph !== 'play' || dz.left > 0, dz);
    check('magnet probes: zero errors', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  // ---------- 3. touch: tap on the HUD gap while stuck ----------
  {
    const { ctx, p } = await open('mute=1&seed=6&autostart=1', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await holdServe(p); await stick(p); await W(p, () => { WRB.debug.world.ball.stuckT = 6; });
    const a = await p.locator('#btnPause').boundingBox(), b = await p.locator('#btnMuteHud').boundingBox();
    await p.touchscreen.tap((a.x + a.width + b.x) / 2, a.y + a.height / 2); await sleep(120);
    check('touch: tap in the HUD gap while stuck does not release', await W(p, () => WRB.debug.world.ball.stuck)); await W(p, () => WRB.Game.resume());
    await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(120);
    check('touch: tap on HUD Mute while stuck does not release', await W(p, () => WRB.debug.world.ball.stuck));
    // HUD inside the safe area: simulate 47 px side insets (iPhone landscape) via the probe element
    await W(p, () => WRB.Game.resume()); await sleep(200);   // (Chromium touch adjustment turns a HUD-gap tap into a Pause tap)
    await p.addStyleTag({ content: '#safeProbe{padding:0 47px 21px 47px!important}' });
    await W(p, () => WRB.Game.relayout());
    const hb = await W(p, () => document.getElementById('hud').getBoundingClientRect().toJSON());
    console.log('  state', JSON.stringify(await W(p, () => ({ mode: WRB.debug.mode, ui: WRB.UI.current, hud: document.getElementById('hud').className }))));
    check('landscape phone: HUD stays inside a 47 px right inset', hb.x + hb.width <= 844 - 47, hb);
    check('landscape phone: HUD buttons ≥ 44 px', a.width >= 44 && a.height >= 44, a);
    const fld = await W(p, () => { const R = WRB.Game.renderer, r = R.canvas.getBoundingClientRect(); return { l: r.left + R.sx(0) / R.VW * r.width, rgt: r.left + R.sx(16) / R.VW * r.width }; });
    check('landscape phone: the play field clears the notch insets', fld.l >= 47 && fld.rgt <= 844 - 47, fld);
    await ctx.close();
  }

  // ---------- 4. rotate card on iPad portrait ----------
  for (const vp of [{ w: 768, h: 1024, name: 'iPad portrait 768×1024' }, { w: 1024, h: 1366, name: 'iPad Pro portrait 1024×1366' }]) {
    const { ctx, p } = await open('mute=1&seed=2', { viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await p.locator('#btnPlay').tap(); await sleep(400);
    const r = await W(p, () => ({ rot: !document.getElementById('rotate').classList.contains('hidden'), portrait: WRB.Game.renderer.portrait }));
    check(vp.name + ': no "turn your phone" card (DESIGN: portrait iPads play letterboxed)', !r.rot, r);
    await ctx.close();
  }
  // rotate card + blur / pause interplay on a phone
  {
    const { ctx, p } = await open('mute=1&seed=2', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await p.locator('#btnPlay').tap(); await sleep(400);
    const on = await W(p, () => !document.getElementById('rotate').classList.contains('hidden'));
    await W(p, () => window.dispatchEvent(new Event('blur'))); await sleep(200);
    const pz = await W(p, () => ({ mode: WRB.debug.mode, rot: !document.getElementById('rotate').classList.contains('hidden'), ui: WRB.UI.current }));
    check('portrait phone: blur behind the rotate card pauses and shows the Pause menu', on && pz.mode === 'paused' && !pz.rot && pz.ui === 'scrPause', pz);
    await p.locator('#btnResume').tap(); await sleep(300);
    check('…Resume brings the rotate card back', await W(p, () => !document.getElementById('rotate').classList.contains('hidden')));
    await p.locator('#btnRotateOk').tap(); await sleep(700);
    const up = await W(p, () => ({ rot: !document.getElementById('rotate').classList.contains('hidden'), ph: WRB.debug.world.phase, mode: WRB.debug.mode }));
    check('"Play upright anyway" by touch: card hides, no ghost serve, stays dismissed', !up.rot && up.mode === 'playing', up);
    await W(p, () => WRB.debug.startGame()); await sleep(200);
    check('…and stays dismissed for a new run this session', await W(p, () => document.getElementById('rotate').classList.contains('hidden')));
    await ctx.close();
  }

  // ---------- 5. Score Card keyboard: Enter on the focused "Save picture" link ----------
  {
    const { ctx, p } = await open('mute=1&seed=8&autostart=1');
    await holdServe(p); await forceOver(p); await sleep(900);
    await p.locator('#btnScoreCard').click();
    await p.waitForFunction(() => { const m = document.getElementById('scScreen'); return m && !m.classList.contains('hidden'); }, null, { timeout: 8000 });
    await sleep(200);
    const f = await W(p, () => ({ id: document.activeElement.id, tag: document.activeElement.tagName }));
    await p.keyboard.press('Enter'); await sleep(300);
    const s = await W(p, () => ({ mode: WRB.debug.mode, card: !document.getElementById('scScreen').classList.contains('hidden') }));
    check('Score Card open: Enter on the focused Save link does not start a game behind the card', s.mode === 'over', { focus: f, after: s });
    if (s.mode === 'playing') {
      // the card still covers the running game; Space also restarts
      check('…the Score Card stays over a running game', !s.card, s);
    }
    await p.keyboard.press('Escape'); await sleep(100);
    await W(p, () => WRB.debug.startGame()); await holdServe(p); await forceOver(p); await sleep(900);
    await p.locator('#btnScoreCard').click();
    await p.waitForFunction(() => !document.getElementById('scScreen').classList.contains('hidden'), null, { timeout: 8000 }); await sleep(150);
    await p.keyboard.press('Escape'); await sleep(150);
    check('Score Card: Esc closes it and stays on game over', await W(p, () => document.getElementById('scScreen').classList.contains('hidden') && WRB.debug.mode === 'over'));
    // open / close many times: no leaks or errors
    for (let i = 0; i < 6; i++) {
      await p.locator('#btnScoreCard').click();
      await p.waitForFunction(() => !document.getElementById('scScreen').classList.contains('hidden'), null, { timeout: 8000 });
      await p.locator('#scClose').click(); await sleep(60);
    }
    check('Score Card opened/closed 6× fine', await W(p, () => !!window.__scoreCard && window.__scoreCard.w === 1080));
    await ctx.close();
  }

  // ---------- 6. ?mute=1 + settings changes never save muted; volume persists ----------
  {
    const { ctx, p } = await open('mute=1&seed=1');
    await p.locator('#btnSettings').click(); await sleep(100);
    await p.locator('label:has(#setSfx)').click(); await p.locator('label:has(#setSfx)').click();
    await p.locator('.vol-step[data-d="-1"]').click(); await p.locator('.vol-step[data-d="-1"]').click();
    const s = await W(p, () => ({ set: JSON.parse(localStorage.getItem('wrb:settings') || '{}'), vol: localStorage.getItem('wrb:volume'), muted: WRB.Audio.muted }));
    check('?mute=1 + toggling settings: muted not saved, audio still muted', s.set.muted !== true && s.muted === true, s);
    await p.goto(GAME + '?seed=1'); await p.waitForFunction(() => WRB.debug && WRB.debug.mode === 'title');
    const r = await W(p, () => ({ muted: WRB.Audio.muted, vol: localStorage.getItem('wrb:volume'), shown: (document.querySelector('.set-volume b') || {}).textContent }));
    check('a normal visit after ?mute=1 is unmuted, volume 80% kept (2 × −10 %)', !r.muted && r.vol === '0.80', r);
    await ctx.close();
  }

  // ---------- 7. Change Pictures edge files ----------
  {
    const { ctx, p, errs } = await open('mute=1&seed=1');
    await p.locator('#btnCustomize').click(); await sleep(150);
    const pick = async (idx, file) => {
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#slotGrid .slot').nth(idx).locator('[data-act=pick]').click()]);
      await fc.setFiles(file);
      await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && !/Saving/.test(t.textContent); }, null, { timeout: 15000 });
      return W(p, () => document.getElementById('toast').textContent);
    };
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>');
    const m1 = await pick(0, { name: 'x.svg', mimeType: 'image/svg+xml', buffer: svg });
    const h = await W(p, () => WRB.Assets.custom.hero ? { w: WRB.Assets.custom.hero.width, h: WRB.Assets.custom.hero.height } : null);
    check('an SVG with no width/height → saved with a sane size, or a friendly error', /saved/i.test(m1) ? (h && h.w > 0 && h.h > 0) : !/undefined|NaN/.test(m1), { m1, h });
    const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const m2 = await pick(1, { name: 't.png', mimeType: 'image/png', buffer: tiny });
    check('a 1×1 PNG is handled (saved or friendly error)', /saved|picture/i.test(m2), m2);
    const zero = Buffer.alloc(0);
    const m3 = await pick(2, { name: 'e.png', mimeType: 'image/png', buffer: zero });
    check('an empty .png → friendly error, nothing saved', !/saved/i.test(m3) && !(await W(p, () => WRB.Assets.hasCustom('gem'))), m3);
    await p.locator('.btn-back:visible').click(); await sleep(100);
    await p.locator('#btnPlay').click(); await sleep(800);
    check('game runs with the edge pictures (no errors)', errs.length === 0 && (await W(p, () => WRB.debug.stats.errors.length)) === 0, errs.slice(0, 2));
    await ctx.close();
  }

  // ---------- 8. pause during the descend, blur on title / settings ----------
  {
    const { ctx, p, errs } = await open('mute=1&seed=9&autostart=1');
    await W(p, () => { const w = WRB.debug.world; w.serve(); w.debugClear(1); const k = w.bricks.find(b => b.alive); const b = w.ball; b.x = k.x; b.y = k.y - 0.8; b.vx = 0; b.vy = 6; });
    await p.waitForFunction(() => WRB.debug.world.phase === 'clear', null, { timeout: 4000 });
    await sleep(500);
    await p.keyboard.press('KeyP'); await sleep(800);
    const a = await W(p, () => ({ mode: WRB.debug.mode, ph: WRB.debug.world.phase, d: WRB.debug.getState().descend }));
    await p.keyboard.press('KeyP');
    await p.waitForFunction(() => WRB.debug.world.phase === 'serve', null, { timeout: 5000 }).catch(() => {});
    const b = await W(p, () => ({ ph: WRB.debug.world.phase, lv: WRB.debug.world.level, scene: WRB.debug.getState().scene }));
    check('pause during the descend freezes it; resume finishes into zone 2', a.mode === 'paused' && a.ph === 'clear' && b.ph === 'serve' && b.lv === 1 && b.scene === 1, { a, b });
    await W(p, () => WRB.Game.toTitle());
    await W(p, () => window.dispatchEvent(new Event('blur'))); await sleep(200);
    check('blur on the title keeps the title (no pause screen)', await W(p, () => WRB.debug.mode === 'title' && WRB.UI.current === 'scrTitle'));
    check('descend probes: zero errors', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  // ---------- 9. long bot run at speed 16: memory + caches ----------
  {
    const SOAK = +(process.env.SOAK || 150);
    const { ctx, p, errs } = await open('mute=1&seed=12&autostart=1&autorestart=1&bot=1&skill=0.7&speed=16', { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
    const cdp = await ctx.newCDPSession(p); await cdp.send('HeapProfiler.enable');
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6; };
    await sleep(8000); const h0 = await heap();
    let max = { p: 0, fx: 0, spr: 0, bg: 0, gems: 0, ev: 0 };
    const t0 = Date.now();
    while (Date.now() - t0 < SOAK * 1000) {
      await sleep(3000);
      const s = await W(p, () => { const R = WRB.Game.renderer, w = WRB.debug.world, s = WRB.debug.getState(); window._ev.length = 0;
        return { p: s.particles, fx: s.fx, spr: R._spr.size, bg: R._bg.size, gems: w.gems.length + w.powerups.length, ev: w.events.length, trail: R.trail.length }; });
      for (const k in max) max[k] = Math.max(max[k], s[k] || 0);
    }
    const h1 = await heap();
    const st = await W(p, () => ({ games: WRB.debug.stats.games, errors: WRB.debug.stats.errors, best: Object.keys(localStorage).filter(k => /best/.test(k)) }));
    check('soak ' + SOAK + ' s @16×: zero errors', errs.length === 0 && st.errors.length === 0, [...errs, ...st.errors].slice(0, 2));
    check('soak: heap bounded (after GC grows < 15 MB)', h1 - h0 < 15, { h0: h0.toFixed(1), h1: h1.toFixed(1) });
    check('soak: particles ≤ 90, sprite cache ≤ 500, items bounded', max.p <= 90 && max.spr <= 501 && max.gems < 60, max);
    check('soak: no best saved by the bot', st.best.length === 0, st);
    await ctx.close();
  }

  const f = res.filter(r => !r.ok);
  console.log('\n' + (res.length - f.length) + ' passed, ' + f.length + ' failed (of ' + res.length + ')');
  f.forEach(r => console.log('  FAIL ' + r.n));
  await browser.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
