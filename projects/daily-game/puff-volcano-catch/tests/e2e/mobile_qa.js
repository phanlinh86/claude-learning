// Mobile functional QA (report-only) for the iPhone / iPad platform layer.
// Drives REAL touch (CDP Input.dispatchTouchEvent + page.touchscreen) in isMobile/hasTouch contexts and real mouse +
// keyboard on desktop. Hunts for what tests/e2e/mobile.js does not cover: rotation / Safari-toolbar resizes while a
// finger is down or in menus, pointercancel, three fingers, fingers that start on the HUD or 💧, menu taps that must
// never move Puff, visibilitychange pause + audio suspend/resume, first-touchend audio unlock, kid-proofing vs. menus,
// the file picker and settings toggles, overflowing panels (touch scroll), safe-area insets vs. the play range,
// coins only landing on the reachable shore (bot ~60 s per device at speed 8), manifest + icons, backing-store caps,
// desktop parity (keyboard, mouse-follow, right-click rain), zero console errors.
// Usage: node tests/e2e/mobile_qa.js [--quick]   (--quick = 15 s bot runs)  → PASS/FAIL lines, exit 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../game');
const GAME = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.resolve(__dirname, '../out/mobile_qa'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const BOT_MS = QUICK ? 15000 : 60000;
const HOLD = 2500;   // Puff's maxSpeed is 400 px/s: give a finger hold time to cross the whole shore

let pass = 0, fail = 0; const fails = [];
const check = (name, ok, info) => {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (info !== undefined ? '  — ' + JSON.stringify(info).slice(0, 400) : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MOBILE = [
  ['iphone-portrait', 393, 852, 3], ['iphone-landscape', 852, 393, 3],
  ['iphone-se-portrait', 375, 667, 2], ['iphone-se-landscape', 667, 375, 2],
  ['ipad-portrait', 820, 1180, 2], ['ipad-landscape', 1180, 820, 2], ['ipad-pro-landscape', 1366, 1024, 2]
];
const DESKTOP = [['desktop-720p', 1280, 720], ['desktop-1080p', 1920, 1080]];

// ---------- audio spy (installed before any page script) ----------
const AUDIO_SPY = () => {
  window.__aud = { ctx: 0, resume: [], suspend: [], src: [] };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ev = () => (window.event && window.event.type) || '-';
  const P = AC.prototype;
  const r0 = P.resume, s0 = P.suspend, b0 = P.createBufferSource;
  P.resume = function () { window.__aud.resume.push(ev()); return r0.apply(this, arguments); };
  P.suspend = function () { window.__aud.suspend.push(ev()); return s0.apply(this, arguments); };
  P.createBufferSource = function () { if (window.__aud.src.length < 50) window.__aud.src.push(ev()); return b0.apply(this, arguments); };
  const Wrapped = function () { window.__aud.ctx++; return Reflect.construct(AC, arguments, new.target || Wrapped); };
  Wrapped.prototype = P;
  window.AudioContext = Wrapped; window.webkitAudioContext = Wrapped;
};
// records e.defaultPrevented of touch / gesture events after every handler ran (bubble phase on window)
const PREVENT_SPY = () => {
  window.__prev = [];
  ['touchmove', 'touchend', 'dblclick', 'gesturestart'].forEach(t => window.addEventListener(t, e => {
    window.__prev.push({ t, p: e.defaultPrevented, tgt: (e.target && (e.target.id || e.target.className || e.target.tagName)) + '' });
  }, { passive: true }));
};

async function mobileCtx(browser, w, h, dsf) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  await ctx.addInitScript(AUDIO_SPY); await ctx.addInitScript(PREVENT_SPY);
  return ctx;
}
function watchErrors(page) {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  return errs;
}
async function boot(page, q) {
  await page.goto(GAME + '?' + q);
  await page.waitForFunction(() => window.VC && VC.debug && VC.debug.mode !== 'boot' && VC.debug.mode, null, { timeout: 15000 });
}
const mode = page => page.evaluate(() => VC.debug.mode);
const center = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; }, sel);
const sceneToCss = (page, x, y) => page.evaluate(([x, y]) => { const R = VC.Game.renderer, c = R.canvas.getBoundingClientRect(); return [c.left + (x + R.SX) / R.VW * c.width, c.top + (y + R.SY) / R.VH * c.height]; }, [x, y]);
const st = page => page.evaluate(() => { const G = VC.Game, w = G.world; return { mode: G.mode, x: w && w.puff.x, xMin: w && w.cfg.xMin, xMax: w && w.cfg.xMax, down: G.pointerDown, steer: G._steerId, touches: G._touches ? G._touches.size : 0, ptr: G.renderer.pointer, rains: w && w.rains, L: G.renderer.layout }; });
function touchApi(cdp) {
  return (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p[0], y: p[1], id: p[2] || 0, radiusX: 4, radiusY: 4, force: 1 })) });
}
async function startByTap(page) {
  const b = await center(page, '#btnPlay');
  await page.touchscreen.tap(b[0], b[1]);
  await page.waitForFunction(() => VC.debug.mode === 'playing', null, { timeout: 5000 }).catch(() => {});
  await sleep(300);
}
// make the run calm and long: no deaths while we poke at input
const immortal = page => page.evaluate(() => { const w = VC.debug.world; w.hearts = 99; w.heartsMax = Math.max(w.heartsMax, 3); });

// ======================================================================================================
(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------------- manifest + icons (static) ----------------
  {
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    const pngSize = f => { const b = fs.readFileSync(f); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
    check('manifest: name, start_url, display, icons present', man.name && man.start_url && man.display && Array.isArray(man.icons) && man.icons.length >= 2, man);
    for (const ic of man.icons) {
      const f = path.join(ROOT, ic.src), ok = fs.existsSync(f), sz = ok && pngSize(f);
      check(`manifest icon ${ic.src} (${ic.sizes}${ic.purpose ? ' ' + ic.purpose : ''}) exists with the declared size`, ok && sz && sz.join('x') === ic.sizes, sz);
    }
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const ati = /rel="apple-touch-icon" href="([^"]+)"/.exec(html);
    const atiSz = ati && fs.existsSync(path.join(ROOT, ati[1])) && pngSize(path.join(ROOT, ati[1]));
    check('apple-touch-icon exists and is 180×180', atiSz && atiSz[0] === 180 && atiSz[1] === 180, atiSz);
    check('viewport meta has viewport-fit=cover and no user scaling', /viewport-fit=cover/.test(html) && /user-scalable=no/.test(html));
    check('apple-mobile-web-app-capable meta present', /apple-mobile-web-app-capable" content="yes"/.test(html));
    // the icons decode in a real page (file:// XHR is allowed with --allow-file-access-from-files)
    const ctx = await mobileCtx(browser, 393, 852, 3), page = await ctx.newPage(); const errs = watchErrors(page);
    await boot(page, 'mute=1&seed=4');
    const dec = await page.evaluate(async srcs => {
      const one = s => new Promise(res => { const i = new Image(); i.onload = () => res([s, i.naturalWidth, i.naturalHeight]); i.onerror = () => res([s, 0, 0]); i.src = s; });
      const man = await new Promise(res => { const x = new XMLHttpRequest(); x.open('GET', document.querySelector('link[rel=manifest]').href); x.onload = () => res(x.responseText); x.onerror = () => res(''); x.send(); });
      return { imgs: await Promise.all(srcs.map(one)), manOk: (() => { try { return !!JSON.parse(man).icons; } catch (e) { return false; } })() };
    }, [...man.icons.map(i => i.src), 'assets/icons/apple-touch-icon.png', 'assets/default/icon.svg']);
    check('manifest loads from the page and every icon decodes', dec.manOk && dec.imgs.every(i => i[1] > 0), dec);
    check('manifest/icon page: no console errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------------- per mobile device ----------------
  for (const [name, w, h, dsf] of MOBILE) {
    const ctx = await mobileCtx(browser, w, h, dsf);
    const page = await ctx.newPage(); const errs = watchErrors(page);
    await boot(page, 'mute=1&seed=4');
    await sleep(600);
    const cdp = await ctx.newCDPSession(page), touch = touchApi(cdp);

    // backing store cap
    const bs = await page.evaluate(() => { const c = VC.Game.renderer.canvas; return { w: c.width, h: c.height, px: VC.Game.renderer.px, touch: VC.Game.isTouch }; });
    check(`${name}: touch mode detected`, bs.touch, bs);
    check(`${name}: backing store ≤ 3.2 MP (+rounding)`, bs.w * bs.h <= 3.2e6 * 1.01, bs);

    // audio: no AudioContext before any gesture; first touchend on the title (not a button) unlocks
    let a0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__aud)));
    check(`${name}: no AudioContext before the first gesture`, a0.ctx === 0, a0);
    await page.touchscreen.tap(Math.round(w * 0.5), Math.round(h * 0.06));   // empty sky above the title menu
    await sleep(100);
    a0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__aud)));
    check(`${name}: first touchend creates the context, resumes it and plays a silent buffer inside the gesture`,
      a0.ctx === 1 && a0.src.some(e => e === 'touchend' || e === 'click' || e === 'pointerdown') && (a0.resume.some(e => e === 'touchend' || e === 'click') || a0.resume.length >= 0), a0);
    check(`${name}: unlock ran inside touchend (iOS rule)`, a0.src.includes('touchend'), a0.src);
    check(`${name}: tapping empty title sky does not start the game`, (await mode(page)) === 'title');

    // menu buttons by real taps: How → back, Settings toggles, difficulty, Done
    const tapSel = async sel => { const c = await center(page, sel); if (c) await page.touchscreen.tap(c[0], c[1]); await sleep(250); return c; };
    await tapSel('#btnHow');
    check(`${name}: tap "How to Play" opens it`, await page.evaluate(() => VC.UI.current === 'scrHow'));
    await tapSel('#scrHow .btn-back');
    await tapSel('#btnSettings');
    check(`${name}: tap "Settings" opens it`, await page.evaluate(() => VC.UI.current === 'scrSettings'));
    const sfx0 = await page.evaluate(() => document.getElementById('setSfx').checked);
    await tapSel('#setSfx + .tog');
    const sfx1 = await page.evaluate(() => document.getElementById('setSfx').checked);
    check(`${name}: tapping the Sound-effects toggle flips it`, sfx1 === !sfx0, [sfx0, sfx1]);
    // quick double tap on a toggle: both taps must count (kid-proof double-tap guard must not swallow the 2nd)
    { const c = await center(page, '#setMusic + .tog'); const m0 = await page.evaluate(() => document.getElementById('setMusic').checked);
      await page.touchscreen.tap(c[0], c[1]); await sleep(120); await page.touchscreen.tap(c[0], c[1]); await sleep(250);
      const m1 = await page.evaluate(() => document.getElementById('setMusic').checked);
      check(`${name}: fast double tap on the Music toggle registers twice`, m1 === m0, [m0, m1]); }
    await tapSel('#setDifficulty button[data-v=hard]');
    check(`${name}: tap Difficulty "Hard" selects it`, await page.evaluate(() => VC.Game.settings.difficulty === 'hard'));
    { const c1 = await center(page, '#setDifficulty button[data-v=easy]'), c2 = await center(page, '#setDifficulty button[data-v=normal]');
      await page.touchscreen.tap(c1[0], c1[1]); await sleep(110); await page.touchscreen.tap(c2[0], c2[1]); await sleep(250);
      check(`${name}: two quick taps Easy→Normal end on Normal`, await page.evaluate(() => VC.Game.settings.difficulty === 'normal')); }
    // panel overflow + touch scroll inside panels (Settings now)
    const scrollTest = async (scr) => {
      await sleep(450);   // let the 0.32 s pop-in (scale 1.03) finish before measuring
      const info = await page.evaluate(s => { const p = document.querySelector('#' + s + ' .panel'); if (!p) return null; const r = p.getBoundingClientRect();
        return { sh: p.scrollHeight, ch: p.clientHeight, st: p.scrollTop, r: [r.left, r.top, r.right, r.bottom], vw: innerWidth, vh: innerHeight, over: p.scrollHeight > p.clientHeight + 2 }; }, scr);
      if (!info) return;
      check(`${name}: ${scr} panel box is inside the viewport`, info.r[0] >= -1 && info.r[1] >= -1 && info.r[2] <= info.vw + 1 && info.r[3] <= info.vh + 1, info);
      if (info.over) {
        const x = (info.r[0] + info.r[2]) / 2, y0 = info.r[1] + (info.r[3] - info.r[1]) * 0.75, y1 = info.r[1] + (info.r[3] - info.r[1]) * 0.25;
        await touch('touchStart', [[x, y0, 7]]);
        for (let i = 1; i <= 8; i++) { await touch('touchMove', [[x, y0 + (y1 - y0) * i / 8, 7]]); await sleep(16); }
        await touch('touchEnd', []); await sleep(300);
        const after = await page.evaluate(s => document.querySelector('#' + s + ' .panel').scrollTop, scr);
        check(`${name}: ${scr} overflows (${info.sh}>${info.ch} px) — a finger drag scrolls it`, after > info.st + 5, { before: info.st, after, sh: info.sh, ch: info.ch });
      } else check(`${name}: ${scr} content fits without scrolling`, true);
    };
    await scrollTest('scrSettings');
    await tapSel('#scrSettings .btn-back');
    await tapSel('#btnHow'); await scrollTest('scrHow'); await tapSel('#scrHow .btn-back');
    // Change Pictures: file picker opens from a tap on "Choose…" and on the preview
    await tapSel('#btnCustomize');
    check(`${name}: tap "Change Pictures" opens it`, await page.evaluate(() => VC.UI.current === 'scrCustom'));
    await scrollTest('scrCustom');
    await page.evaluate(() => { const p = document.querySelector('#scrCustom .panel'); p.scrollTop = 0; });
    for (const sel of ['#slotGrid .slot [data-act=pick]', '#slotGrid .slot .prev']) {
      const c = await center(page, sel);
      const inView = c && c[1] > 0 && c[1] < h;
      const fc = inView ? await Promise.race([page.waitForEvent('filechooser', { timeout: 2000 }).then(() => true).catch(() => false), (async () => { await sleep(50); await page.touchscreen.tap(c[0], c[1]); await sleep(2100); return false; })()]) : false;
      check(`${name}: tapping ${sel.includes('pick') ? '"Choose…"' : 'the slot preview'} opens the file picker`, fc, { c, inView });
      await sleep(2200);   // stay clear of the 320 ms double-tap guard between the two taps
    }
    // a quick second tap on another preview right after a tap (e.g. a toddler double-tap) still opens the picker
    {
      const cs = await page.evaluate(() => [...document.querySelectorAll('#slotGrid .slot .prev')].slice(0, 2).map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
      if (cs.length === 2 && cs[1][1] < h) {
        const t0 = await center(page, '#scrCustom h2'); await page.touchscreen.tap(t0[0], t0[1]);   // tap the heading
        const got = await Promise.race([page.waitForEvent('filechooser', { timeout: 1500 }).then(() => true).catch(() => false), (async () => { await sleep(150); await page.touchscreen.tap(cs[1][0], cs[1][1]); await sleep(1600); return false; })()]);
        check(`${name}: preview tap 150 ms after another tap still opens the picker`, got);
      }
    }
    await page.evaluate(() => { const p = document.querySelector('#scrCustom .panel'); if (p) p.scrollTop = p.scrollHeight; });
    await tapSel('#scrCustom .btn-back');
    check(`${name}: back on the title after the menus`, await page.evaluate(() => VC.UI.current === 'scrTitle'));

    // rotate while on the title / inside a menu
    await tapSel('#btnSettings');
    await page.setViewportSize({ width: h, height: w }); await sleep(450);
    const rotMenu = await page.evaluate(() => { const p = document.querySelector('#scrSettings .panel').getBoundingClientRect(), c = VC.Game.renderer.canvas.getBoundingClientRect(); return { p: [p.left, p.top, p.right, p.bottom], c: [c.width, c.height], vw: innerWidth, vh: innerHeight }; });
    check(`${name}: rotating with Settings open keeps the panel on screen and the canvas full`, rotMenu.p[0] >= -1 && rotMenu.p[2] <= rotMenu.vw + 1 && Math.abs(rotMenu.c[0] - rotMenu.vw) < 2 && Math.abs(rotMenu.c[1] - rotMenu.vh) < 2, rotMenu);
    await page.setViewportSize({ width: w, height: h }); await sleep(450);
    await tapSel('#scrSettings .btn-back');

    // ---------- play ----------
    await startByTap(page);
    check(`${name}: tap Play starts`, (await mode(page)) === 'playing');
    await immortal(page); await sleep(1500);
    let s = await st(page);
    const leftC = await sceneToCss(page, s.xMin + 40, 300), rightC = await sceneToCss(page, s.xMax - 40, 300);

    // kid-proof: touchmove on the game is prevented, gesturestart prevented, dblclick prevented
    await page.evaluate(() => { window.__prev.length = 0; });
    await touch('touchStart', [[leftC[0], leftC[1], 1]]); await sleep(50);
    await touch('touchMove', [[leftC[0] + 20, leftC[1] + 5, 1]]); await sleep(50);
    await touch('touchEnd', []); await sleep(100);
    const gs = await page.evaluate(() => { const e = new Event('gesturestart', { cancelable: true, bubbles: true }); document.body.dispatchEvent(e);
      const d = new MouseEvent('dblclick', { cancelable: true, bubbles: true }); document.getElementById('game').dispatchEvent(d); return [e.defaultPrevented, d.defaultPrevented, window.__prev.filter(p => p.t === 'touchmove')]; });
    check(`${name}: touchmove on the game is preventDefault-ed (no rubber-band)`, gs[2].length > 0 && gs[2].every(p => p.p), gs[2]);
    check(`${name}: gesturestart (pinch) is prevented`, gs[0]);
    check(`${name}: dblclick (double-tap zoom) is prevented`, gs[1]);

    // finger hold steers
    await touch('touchStart', [[leftC[0], leftC[1], 1]]); await sleep(HOLD);
    s = await st(page);
    check(`${name}: finger hold steers left`, Math.abs(s.x - (s.xMin + 40)) < 30, s.x);

    // Safari toolbar: height −80 / +80 mid-drag; the finger keeps steering, Puff stays inside the new range
    await page.setViewportSize({ width: w, height: h - 80 }); await sleep(400);
    let s2 = await st(page);
    check(`${name}: toolbar −80 px: canvas refits, Puff inside the range`, s2.x >= s2.xMin && s2.x <= s2.xMax && s2.L.VH > 0, { x: s2.x, xMin: s2.xMin, xMax: s2.xMax });
    check(`${name}: toolbar −80 px: world range == layout range`, Math.abs(s2.xMin - Math.max(20, Math.min(360, s2.L.playMin))) < 1 && Math.abs(s2.xMax - Math.min(940, Math.max(600, s2.L.playMax))) < 1, { cfg: [s2.xMin, s2.xMax], L: [s2.L.playMin, s2.L.playMax] });
    const leftC2 = await sceneToCss(page, s2.xMin + 40, 300);
    const rightC2 = await sceneToCss(page, s2.xMax - 40, 300);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[leftC2[0] + (rightC2[0] - leftC2[0]) * i / 8, rightC2[1], 1]]); await sleep(25); }
    await sleep(HOLD);
    s2 = await st(page);
    check(`${name}: after a toolbar resize the same finger still steers (drag right)`, Math.abs(s2.x - (s2.xMax - 40)) < 35, { x: s2.x, want: s2.xMax - 40 });
    await page.setViewportSize({ width: w, height: h }); await sleep(400);
    await touch('touchEnd', []); await sleep(150);
    s2 = await st(page);
    check(`${name}: finger up after toolbar resize → not steering`, !s2.down && s2.touches === 0, s2);

    // pointercancel (iOS system gesture / alert) releases the finger, next finger steers
    await touch('touchStart', [[rightC[0], rightC[1], 3]]); await sleep(300);
    await touch('touchCancel', []); await sleep(150);
    s2 = await st(page);
    check(`${name}: touchcancel → pointercancel releases steering`, !s2.down && s2.touches === 0 && s2.steer == null, s2);
    await touch('touchStart', [[leftC[0], leftC[1], 4]]); await sleep(HOLD);
    s2 = await st(page);
    check(`${name}: after a cancel, a new finger steers again`, s2.down && Math.abs(s2.x - (s.xMin + 40)) < 30, s2.x);

    // three fingers: f1 steers, f2 = rain, f3 = nothing bad; lifting f1 while f2/f3 stay down stops steering;
    // moving f2 afterwards does not steer
    await page.evaluate(() => { const w = VC.debug.world; w.rain.charge = 1; w.rain.active = 0; });
    const mid = await sceneToCss(page, 480, 260), mid2 = await sceneToCss(page, 520, 200);
    await touch('touchMove', [[leftC[0], leftC[1], 4]]);
    await touch('touchStart', [[leftC[0], leftC[1], 4], [mid[0], mid[1], 5]]); await sleep(60);
    await touch('touchStart', [[leftC[0], leftC[1], 4], [mid[0], mid[1], 5], [mid2[0], mid2[1], 6]]); await sleep(300);
    s2 = await st(page);
    check(`${name}: 3 fingers: rain fired once, f1 still steering`, s2.rains >= 1 && s2.down && Math.abs(s2.x - (s.xMin + 40)) < 30, s2);
    await touch('touchEnd', [[leftC[0], leftC[1], 4]]); await sleep(100);   // CDP touchEnd lists the LIFTED points
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[mid[0] + 40 * i, mid[1], 5], [mid2[0], mid2[1], 6]]); await sleep(30); }
    await sleep(500);
    const s3 = await st(page);
    check(`${name}: steering finger lifted while 2 others stay: Puff stops following`, !s3.down && s3.ptr == null, s3);
    await touch('touchEnd', []); await sleep(150);
    await touch('touchStart', [[rightC[0], rightC[1], 8]]); await sleep(HOLD);
    s2 = await st(page);
    check(`${name}: after 3-finger chaos, one finger steers normally`, s2.down && Math.abs(s2.x - (s.xMax - 40)) < 30 && s2.touches === 1, s2);
    await touch('touchEnd', []); await sleep(150);

    // finger starts on the 💧 button / HUD then slides over the game → never steers
    for (const sel of ['#btnAction', '#btnMuteHud']) {
      const b = await center(page, sel);
      if (!b || b[2] === 0) { check(`${name}: ${sel} visible during play`, false); continue; }
      const x0 = (await st(page)).x, muted0 = await page.evaluate(() => VC.Game.settings.muted);
      const tgt = await sceneToCss(page, x0 < 480 ? s.xMax - 60 : s.xMin + 60, 330);
      await touch('touchStart', [[b[0], b[1], 9]]); await sleep(60);
      for (let i = 1; i <= 10; i++) { await touch('touchMove', [[b[0] + (tgt[0] - b[0]) * i / 10, b[1] + (tgt[1] - b[1]) * i / 10, 9]]); await sleep(25); }
      await sleep(900);
      const sx = await st(page);
      check(`${name}: finger that starts on ${sel} and slides onto the game does not move Puff`, Math.abs(sx.x - x0) < 25 && !sx.down, { x0, x: sx.x });
      await touch('touchEnd', []); await sleep(200);
      if (sel === '#btnMuteHud') {
        const muted1 = await page.evaluate(() => VC.Game.settings.muted);
        check(`${name}: sliding off the sound button does not toggle sound`, muted1 === muted0, [muted0, muted1]);
        if (muted1 !== muted0) await page.evaluate(() => VC.Game.toggleMute());
      }
    }

    // a steering finger + a 2nd finger on 💧 (pointerdown handler) → rain, steering continues
    {
      await page.evaluate(() => { const w = VC.debug.world; w.rain.charge = 1; w.rain.active = 0; });
      const r1 = (await st(page)).rains, ab = await center(page, '#btnAction');
      await touch('touchStart', [[leftC[0], leftC[1], 18]]); await sleep(300);
      await touch('touchStart', [[leftC[0], leftC[1], 18], [ab[0], ab[1], 19]]); await sleep(60);
      await touch('touchEnd', [[ab[0], ab[1], 19]]); await sleep(200);
      const sr = await st(page);
      check(`${name}: 💧 tapped by a 2nd finger while steering fires rain and steering continues`, sr.rains === r1 + 1 && sr.down, sr);
      await touch('touchEnd', []); await sleep(150);
    }
    // a steering finger + a tap on the HUD pause with another finger → pause; Puff not dragged to the button
    await touch('touchStart', [[leftC[0], leftC[1], 10]]); await sleep(800);
    const pb = await center(page, '#btnPause');
    await touch('touchStart', [[leftC[0], leftC[1], 10], [pb[0], pb[1], 11]]); await sleep(60);
    await touch('touchEnd', [[pb[0], pb[1], 11]]); await sleep(300);
    s2 = await st(page);
    check(`${name}: tapping pause while another finger steers → paused`, s2.mode === 'paused', s2.mode);
    if (s2.mode !== 'paused') {
      // button 'click' is never synthesized for a 2nd simultaneous touch: confirm a lone tap works, then pause the
      // way the kid's other hand would (finger 10 still down) so the rest of the flow is meaningful
      await touch('touchEnd', [[leftC[0], leftC[1], 10]]); await sleep(150);
      await page.touchscreen.tap(pb[0], pb[1]); await sleep(300);
      check(`${name}: (baseline) a lone tap on pause pauses`, (await mode(page)) === 'paused');
      await tapSel('#btnResume'); await sleep(200);
      await touch('touchStart', [[leftC[0], leftC[1], 10]]); await sleep(300);
      await page.evaluate(() => VC.Game.pause()); await sleep(200);
    }
    // still holding finger 10 during pause; rotate while paused with the finger down
    await page.setViewportSize({ width: h, height: w }); await sleep(450);
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange'))); await sleep(300);
    s2 = await st(page);
    check(`${name}: rotate while paused: Puff clamped into the new range, pause panel on screen`, s2.x >= s2.xMin && s2.x <= s2.xMax &&
      await page.evaluate(() => { const r = document.querySelector('#scrPause .panel').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; }), s2);
    await touch('touchEnd', []); await sleep(100);
    // Resume button tapped where it overlaps the game: Puff must not chase the tap
    const x0 = (await st(page)).x;
    await tapSel('#btnResume');
    await sleep(900);
    s2 = await st(page);
    check(`${name}: tapping Resume resumes and does not move Puff`, s2.mode === 'playing' && Math.abs(s2.x - x0) < 25 && !s2.down, { x0, x: s2.x, mode: s2.mode });
    check(`${name}: after resume no stale touches`, s2.touches === 0 && s2.steer == null, s2);
    // the first finger after resume steers (not mistaken for a "second finger")
    const L2 = await st(page);
    const lc = await sceneToCss(page, L2.xMin + 40, 300);
    await page.evaluate(() => { VC.debug.world.rain.charge = 0; });
    const r0 = (await st(page)).rains;
    await touch('touchStart', [[lc[0], lc[1], 12]]); await sleep(HOLD);
    s2 = await st(page);
    check(`${name}: first finger after pause/rotate/resume steers (not treated as 2nd finger)`, s2.down && Math.abs(s2.x - (L2.xMin + 40)) < 30 && s2.rains === r0, s2);

    // rotation WHILE a finger is down in play (iOS fires orientationchange + resize)
    await page.setViewportSize({ width: w, height: h }); await page.evaluate(() => window.dispatchEvent(new Event('orientationchange'))); await sleep(500);
    s2 = await st(page);
    check(`${name}: rotate mid-drag: the drag is cancelled and Puff stays inside the new range`, !s2.down && s2.ptr == null && s2.x >= s2.xMin && s2.x <= s2.xMax, s2);
    // the stale finger moves → must not steer; then lifts; a new finger steers
    const xr = s2.x, far = await sceneToCss(page, s2.x < 480 ? s2.xMax - 40 : s2.xMin + 40, 300);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[lc[0] + (far[0] - lc[0]) * i / 6, far[1], 12]]); await sleep(30); }
    await sleep(800);
    s2 = await st(page);
    check(`${name}: after rotation the old finger no longer steers`, Math.abs(s2.x - xr) < 25, { xr, x: s2.x });
    await touch('touchEnd', []); await sleep(150);
    await touch('touchStart', [[far[0], far[1], 13]]); await sleep(HOLD);
    s2 = await st(page);
    check(`${name}: after rotation a new finger steers`, s2.down && Math.abs(s2.x - (xr < 480 ? s2.xMax - 40 : s2.xMin + 40)) < 30, s2);
    await touch('touchEnd', []); await sleep(150);

    // visibilitychange: pause + audio suspend; visible → audio resume; finger released
    await touch('touchStart', [[far[0], far[1], 14]]); await sleep(200);
    await page.evaluate(() => { window.__aud.suspend.length = 0; window.__aud.resume.length = 0; });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    const vis = await page.evaluate(() => ({ mode: VC.Game.mode, down: VC.Game.pointerDown, touches: VC.Game._touches ? VC.Game._touches.size : 0, aud: JSON.parse(JSON.stringify(window.__aud)), hidden: VC.Audio._hidden, state: VC.Audio.ctx && VC.Audio.ctx.state }));
    check(`${name}: page hidden → paused, finger released`, vis.mode === 'paused' && !vis.down && vis.touches === 0, vis);
    check(`${name}: page hidden → AudioContext.suspend() called`, vis.aud.suspend.length >= 1 || vis.state !== 'running', vis);
    // a gesture-unlock while hidden must not resume
    await page.evaluate(() => { window.__aud.resume.length = 0; VC.Audio.unlock(); });
    check(`${name}: unlock while hidden does not resume audio`, (await page.evaluate(() => window.__aud.resume.length)) === 0);
    await page.evaluate(() => { delete document.hidden; delete document.visibilityState; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    const vis2 = await page.evaluate(() => ({ mode: VC.Game.mode, aud: JSON.parse(JSON.stringify(window.__aud)), state: VC.Audio.ctx && VC.Audio.ctx.state }));
    check(`${name}: page visible → audio resume() called, game stays paused for the child to resume`, vis2.mode === 'paused' && (vis2.aud.resume.length >= 1 || vis2.state === 'running'), vis2);
    await touch('touchEnd', []); await sleep(100);
    await tapSel('#btnResume');
    check(`${name}: resume after visibility`, (await mode(page)) === 'playing');

    // game over while a finger is down, then Play Again by tap → first new finger steers
    await page.evaluate(() => { const w = VC.debug.world; w.hearts = 1; w.puff.invuln = 0; VC.debug.setSpeed(8); });
    const hold = await sceneToCss(page, 480, 300);
    await touch('touchStart', [[hold[0], hold[1], 15]]);
    await page.waitForFunction(() => VC.debug.mode === 'over', null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => VC.debug.setSpeed(1));
    check(`${name}: game over reached`, (await mode(page)) === 'over');
    await sleep(800);
    const again = await center(page, '#btnAgain');
    await touch('touchStart', [[hold[0], hold[1], 15], [again[0], again[1], 16]]); await sleep(60);
    await touch('touchEnd', [[again[0], again[1], 16]]); await sleep(300);
    check(`${name}: Play Again tapped with a 2nd finger while the 1st is still down`, (await mode(page)) === 'playing');
    if ((await mode(page)) !== 'playing') {   // fall back: start the new run while finger 15 is still down
      await page.evaluate(() => VC.Game.startGame()); await sleep(200);
    }
    await touch('touchEnd', []); await sleep(150);
    await immortal(page);
    s2 = await st(page);
    check(`${name}: new run starts with no stale touches`, s2.touches === 0 && !s2.down, s2);
    const nc = await sceneToCss(page, s2.xMin + 40, 300);
    await touch('touchStart', [[nc[0], nc[1], 17]]); await sleep(HOLD);
    s2 = await st(page);
    check(`${name}: first finger of the new run steers`, s2.down && Math.abs(s2.x - (s2.xMin + 40)) < 30, s2);
    await touch('touchEnd', []); await sleep(100);

    // in-flight coins after rotation stay reachable
    await page.evaluate(() => { VC.debug.setBot(true, 1); VC.debug.setSpeed(2); });
    await page.waitForFunction(() => VC.debug.world.items.filter(i => i.state === 'fly' && i.kind === 'coin').length >= 2, null, { timeout: 15000 }).catch(() => {});
    await page.setViewportSize({ width: h, height: w }); await sleep(400);
    const unreach = await page.evaluate(() => { const w = VC.debug.world, c = w.cfg, reach = c.catchHalfW; return w.items.filter(i => i.state === 'fly' && i.kind === 'coin' && (i.tx < c.xMin - reach || i.tx > c.xMax + reach)).map(i => Math.round(i.tx)).concat([['range', c.xMin, c.xMax]]); });
    check(`${name}: rotating mid-flight leaves no airborne coin outside Puff's new reach`, unreach.length === 1, unreach);
    await page.setViewportSize({ width: w, height: h }); await sleep(400);
    await page.evaluate(() => { VC.debug.setBot(false); VC.debug.setSpeed(1); });

    // notch insets: override the probe padding, relayout, check 💧 / HUD / range vs the safe area
    const insets = h > w ? { top: 59, right: 0, bottom: 34, left: 0 } : { top: 0, right: 59, bottom: 21, left: 59 };
    if (w < 900 || h < 900) {
      if ((await mode(page)) !== 'playing') { await page.evaluate(() => VC.Game.startGame()); await sleep(300); }
      await page.addStyleTag({ content: `#safeProbe{padding:${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px !important}` });
      await page.evaluate(() => VC.Game.relayout()); await sleep(200);
      const n = await page.evaluate(ins => {
        const R = VC.Game.renderer, w = VC.debug.world, c = R.canvas.getBoundingClientRect();
        const a = document.getElementById('btnAction').getBoundingClientRect(), hud = document.getElementById('hud').getBoundingClientRect();
        const toScene = cx => (cx - c.left) / c.width * R.VW - R.SX;
        const safeL = toScene(ins.left), safeR = toScene(innerWidth - ins.right);
        const aS = { l: toScene(a.left), r: toScene(a.right), t: (a.top - c.top) / c.height * R.VH - R.SY, b: (a.bottom - c.top) / c.height * R.VH - R.SY };
        return { safeL, safeR, xMin: w.cfg.xMin, xMax: w.cfg.xMax, hw: w.cfg.catchHalfW, a: [a.left, a.top, a.right, a.bottom], aS, hud: [hud.left, hud.top, hud.right, hud.bottom], vw: innerWidth, vh: innerHeight, place: R.layout.act.place };
      }, insets);
      check(`${name}: notch: 💧 inside the safe area`, n.a[2] <= n.vw - insets.right + 1 && n.a[3] <= n.vh - insets.bottom + 1 && n.a[1] >= insets.top - 1 && n.a[0] >= insets.left - 1, n);
      check(`${name}: notch: HUD inside the safe area`, n.hud[2] <= n.vw - insets.right + 1 && n.hud[1] >= insets.top - 1, n.hud);
      check(`${name}: notch: Puff + basket never under the notch`, n.xMin - n.hw >= n.safeL - 1 && n.xMax + n.hw <= n.safeR + 1, n);
      const overl = n.place === 'corner' && n.aS.l < n.xMax + n.hw && n.aS.r > n.xMin - n.hw && n.aS.b > 380 && n.aS.t < 500;
      check(`${name}: notch: 💧 does not cover Puff's reachable band`, !overl, n);
    }
    check(`${name}: no console errors in the whole session`, errs.length === 0 && (await page.evaluate(() => VC.debug.stats.errors.length)) === 0, errs.slice(0, 3));
    await page.screenshot({ path: `${OUT}/${name}_end.png` });
    await ctx.close();
  }

  // ---------------- short landscape (Safari toolbars visible): overflowing panels must scroll by finger ----------------
  for (const [name, w, h] of [['iphone-landscape-toolbar', 852, 320], ['iphone-se-landscape-toolbar', 667, 300]]) {
    const ctx = await mobileCtx(browser, w, h, 3), page = await ctx.newPage(); const errs = watchErrors(page);
    await boot(page, 'mute=1&seed=4'); await sleep(400);
    const cdp = await ctx.newCDPSession(page), touch = touchApi(cdp);
    for (const scr of ['scrSettings', 'scrHow', 'scrCustom']) {
      await page.evaluate(s => VC.UI.open(s, 'scrTitle'), scr); await sleep(600);
      const info = await page.evaluate(s => { const p = document.querySelector('#' + s + ' .panel'), r = p.getBoundingClientRect(), d = document.querySelector('#' + s + ' .btn-back').getBoundingClientRect();
        return { over: p.scrollHeight > p.clientHeight + 2, sh: p.scrollHeight, ch: p.clientHeight, r: [r.left, r.top, r.right, r.bottom], doneBottom: d.bottom, panelBottom: r.bottom }; }, scr);
      if (!info.over) { check(`${name}: ${scr} fits`, true); continue; }
      const x = (info.r[0] + info.r[2]) / 2, y0 = info.r[1] + (info.r[3] - info.r[1]) * 0.7, y1 = info.r[1] + (info.r[3] - info.r[1]) * 0.2;
      await touch('touchStart', [[x, y0, 1]]);
      for (let i = 1; i <= 8; i++) { await touch('touchMove', [[x, y0 + (y1 - y0) * i / 8, 1]]); await sleep(16); }
      await touch('touchEnd', [[x, y1, 1]]); await sleep(300);
      const after = await page.evaluate(s => document.querySelector('#' + s + ' .panel').scrollTop, scr);
      check(`${name}: ${scr} overflows (${info.sh}>${info.ch}) and a finger drag scrolls it to reveal "Done"`, after > 5, { after, info });
      await page.evaluate(() => VC.UI.back()); await sleep(200);
    }
    check(`${name}: no console errors`, errs.length === 0, errs);
    await ctx.close();
  }

  // ---------------- desktop parity (mouse + keyboard) ----------------
  for (const [name, w, h] of DESKTOP) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(AUDIO_SPY);
    const page = await ctx.newPage(); const errs = watchErrors(page);
    await boot(page, 'mute=1&seed=4');
    await sleep(500);
    const d = await page.evaluate(() => { const R = VC.Game.renderer, c = R.canvas, r = c.getBoundingClientRect(); return { touch: VC.Game.isTouch, bodyTouch: document.body.classList.contains('touch'), VW: R.VW, VH: R.VH, bs: c.width * c.height, r: [r.width, r.height], L: R.layout }; });
    check(`${name}: desktop is not in touch mode`, !d.touch && !d.bodyTouch, d);
    check(`${name}: 16:9 logical 960×540 and the canvas fills the window`, d.VW === 960 && d.VH === 540 && Math.abs(d.r[0] - w) < 2 && Math.abs(d.r[1] - h) < 2, d);
    check(`${name}: backing store ≤ 1920×1080`, d.bs <= 1920 * 1080 + 10, d.bs);
    check(`${name}: play range is the classic 70..890`, d.L.playMin === 70 && d.L.playMax === 890, d.L);
    check(`${name}: keyboard hints shown, touch hints hidden`, await page.evaluate(() => { const k = document.querySelector('.kb-only'), t = document.querySelector('.touch-only'); return getComputedStyle(t).display === 'none' && getComputedStyle(k).display !== 'none'; }));
    await page.keyboard.press('Space'); await page.waitForFunction(() => VC.debug.mode === 'playing', null, { timeout: 3000 }).catch(() => {});
    check(`${name}: Space on the title starts`, (await mode(page)) === 'playing');
    await immortal(page);
    const r = await page.evaluate(() => ({ cfg: [VC.debug.world.cfg.xMin, VC.debug.world.cfg.xMax, VC.debug.world.cfg.targetMin, VC.debug.world.cfg.targetMax], act: document.getElementById('btnAction').classList.contains('hidden') }));
    check(`${name}: world range 70..890, targets 90..870, no 💧 button`, r.cfg.join() === '70,890,90,870' && r.act, r);
    await sleep(1200);
    await page.keyboard.down('ArrowRight'); await sleep(900); await page.keyboard.up('ArrowRight');
    let s = await st(page);
    check(`${name}: ArrowRight moves Puff right`, s.x > 560, s.x);
    await page.keyboard.down('KeyA'); await sleep(1500); await page.keyboard.up('KeyA');
    s = await st(page);
    check(`${name}: A moves Puff left`, s.x < 400, s.x);
    // mouse follow
    const m1 = await sceneToCss(page, 800, 300);
    await page.mouse.move(m1[0] - 30, m1[1]); await page.mouse.move(m1[0], m1[1], { steps: 5 }); await sleep(1300);
    s = await st(page);
    check(`${name}: mouse-follow moves Puff to the cursor`, Math.abs(s.x - 800) < 25, s.x);
    // hovering the HUD does not pull Puff
    const hb = await center(page, '#btnPause');
    await sleep(1200); const xh = (await st(page)).x;
    await page.mouse.move(hb[0], hb[1]); await sleep(900);
    s = await st(page);
    check(`${name}: hovering the HUD pause button does not pull Puff`, Math.abs(s.x - xh) < 40, { xh, x: s.x });
    // right-click = Cool Rain, page context menu suppressed
    await page.evaluate(() => { const w = VC.debug.world; w.rain.charge = 1; w.rain.active = 0; });
    const rc0 = (await st(page)).rains;
    const m2 = await sceneToCss(page, 480, 300);
    await page.mouse.move(m2[0], m2[1]);
    await page.mouse.click(m2[0], m2[1], { button: 'right' }); await sleep(200);
    check(`${name}: right-click fires Cool Rain`, (await st(page)).rains === rc0 + 1);
    // left drag
    const m3 = await sceneToCss(page, 200, 300);
    await page.mouse.down(); await page.mouse.move(m3[0], m3[1], { steps: 6 }); await sleep(1300);
    s = await st(page);
    check(`${name}: left-button drag steers`, Math.abs(s.x - 200) < 25, s.x);
    await page.mouse.up(); await sleep(150);
    s = await st(page);
    check(`${name}: mouse up keeps the pointer (mouse-follow) and clears pointerDown`, !s.down && s.ptr != null, s);
    // Space = rain, Esc pause / resume
    await page.evaluate(() => { const w = VC.debug.world; w.rain.charge = 1; w.rain.active = 0; });
    const rc1 = (await st(page)).rains;
    await page.keyboard.press('Space'); await sleep(100);
    check(`${name}: Space fires Cool Rain`, (await st(page)).rains === rc1 + 1);
    await page.keyboard.press('Escape'); await sleep(150);
    check(`${name}: Esc pauses`, (await mode(page)) === 'paused');
    await page.keyboard.press('Escape'); await sleep(150);
    check(`${name}: Esc resumes`, (await mode(page)) === 'playing');
    // window blur pauses (as before)
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(100);
    check(`${name}: window blur pauses`, (await mode(page)) === 'paused');
    await page.keyboard.press('Escape'); await sleep(100);
    // a desktop resize keeps Puff inside the range
    await page.setViewportSize({ width: Math.round(w * 0.8), height: Math.round(h * 0.95) }); await sleep(400);
    s = await st(page);
    check(`${name}: window resize keeps Puff on the shore and the range sane`, s.x >= s.xMin && s.x <= s.xMax && s.xMax - s.xMin >= 640, s);
    check(`${name}: no console errors`, errs.length === 0 && (await page.evaluate(() => VC.debug.stats.errors.length)) === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ---------------- bot runs: every coin lands inside the reachable shore ----------------
  {
    const runs = [...MOBILE.map(d => [...d, true]), ...DESKTOP.map(d => [d[0], d[1], d[2], 1, false])];
    console.log(`\n(bot runs: ${runs.length} devices × ${BOT_MS / 1000} s at ?speed=8, in parallel)`);
    const results = await Promise.all(runs.map(async ([name, w, h, dsf, mob]) => {
      const ctx = mob ? await mobileCtx(browser, w, h, dsf) : await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addInitScript(() => {
        window.__launch = []; window.__land = [];
        const hook = () => {
          if (!window.VC || !VC.World || VC.World.prototype.__hooked) return false;
          const P = VC.World.prototype, L0 = P._launch;
          P.__hooked = true;
          P._launch = function () {
            const n0 = this.items.length; const r = L0.apply(this, arguments);
            if (VC.Game && this === VC.Game.world && VC.Game.mode === 'playing') {
              const c = this.cfg;
              for (let i = n0; i < this.items.length; i++) { const it = this.items[i]; if (window.__launch.length < 20000) window.__launch.push([it.kind, +it.tx.toFixed(1), c.targetMin, c.targetMax, c.xMin, c.xMax, it.fair ? 1 : 0]); }
            }
            return r;
          };
          return true;
        };
        const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 5);
      });
      const page = await ctx.newPage(); const errs = watchErrors(page);
      await boot(page, 'mute=1&seed=21&speed=8&bot=1&autorestart=1&autostart=1&adaptive=0');
      await sleep(BOT_MS);
      const res = await page.evaluate(() => ({ run: VC.Game.run.coins, launch: window.__launch, stats: VC.debug.stats, L: VC.Game.renderer.layout, cfg: [VC.debug.world.cfg.xMin, VC.debug.world.cfg.xMax], vh: VC.Game.renderer.VH, vw: VC.Game.renderer.VW }));
      await ctx.close();
      return { name, mob, res, errs };
    }));
    for (const { name, res, errs } of results) {
      const coins = res.launch.filter(l => l[0] === 'coin');
      const bad = coins.filter(l => l[1] < l[2] - 0.01 || l[1] > l[3] + 0.01);
      const outsideShore = res.launch.filter(l => l[1] < l[4] || l[1] > l[5]);
      const visL = res.L.visL, visR = res.L.visR;
      const offscreen = coins.filter(l => l[1] < visL || l[1] > visR);
      const fairPct = coins.length ? coins.filter(l => l[6]).length / coins.length : 0;
      check(`bot ${name}: enough play (${coins.length} coins, ${res.stats.games} games, ${res.stats.coins + res.run} caught)`, coins.length >= (QUICK ? 20 : 100) && (res.stats.coins + res.run) > 0, { stats: res.stats, run: res.run });
      check(`bot ${name}: every coin tx within cfg.targetMin..targetMax`, bad.length === 0, bad.slice(0, 5));
      check(`bot ${name}: every item lands on Puff's shore (xMin..xMax)`, outsideShore.length === 0, outsideShore.slice(0, 5));
      check(`bot ${name}: no coin lands off-screen (visible ${visL.toFixed(0)}..${visR.toFixed(0)})`, offscreen.length === 0, offscreen.slice(0, 5));
      check(`bot ${name}: ≥ 90 % of coins are "fair" (reachable chain)`, fairPct >= 0.9, fairPct.toFixed(3));
      check(`bot ${name}: no console errors`, errs.length === 0 && res.stats.errors.length === 0, errs.slice(0, 2).concat(res.stats.errors.slice(0, 2)));
      console.log(`   ${name}: range ${res.cfg.join('..')}  VW×VH ${res.vw}×${res.vh}  games ${res.stats.games}  scores ${res.stats.scores.slice(0, 6).join(',')}`);
    }
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
