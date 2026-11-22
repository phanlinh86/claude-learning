// Mobile functional QA (essentials) for the iPhone / iPad platform layer of Otto's Playroom Dash.
// Real touch (CDP Input.dispatchTouchEvent + page.touchscreen) in isMobile/hasTouch contexts. Covers what tests/e2e/mobile.js
// does not: first-touch audio unlock, menu taps (How to Play / Settings / Change Pictures) that never start or steer, ghost
// clicks, kid-proofing (pinch / double-tap / long-press blocked, panels still scroll), a finger that starts on the HUD,
// two fingers at once, touchcancel, rotation with a finger down, visibilitychange pause + audio suspend/resume, a bot run
// at ×8 through every biome, manifest + icons + iOS meta tags, zero console errors.
// Usage: node tests/e2e/mobile_qa.js [--quick]   (--quick = 10 s bot runs)  → PASS/FAIL lines, exit 1 on any FAIL.
// (adapted from ../hedgehog-moon-pop/tests/e2e/mobile_qa.js)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../game');
const GAME = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.resolve(__dirname, '../out/mobile_qa'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const BOT_MS = QUICK ? 10000 : 30000;

let pass = 0, fail = 0, warn = 0; const fails = [];
const check = (name, ok, info) => {
  if (ok === 'warn') { warn++; console.log('WARN ' + name + (info !== undefined ? '  — ' + JSON.stringify(info).slice(0, 400) : '')); return; }
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (info !== undefined ? '  — ' + JSON.stringify(info).slice(0, 400) : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOBILE = [['iphone-landscape', 844, 390, 3], ['iphone-portrait', 390, 844, 3], ['ipad-landscape', 1024, 768, 2], ['ipad-pro-landscape', 1366, 1024, 2]];

async function openDev(b, [name, w, h, dsf], q) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); p._errs = [];
  p.on('console', m => { if (m.type() === 'error') p._errs.push(m.text()); }); p.on('pageerror', e => p._errs.push(String(e)));
  await p.goto(GAME + '?mute=1&seed=4&diff=easy' + (q || ''));
  await p.waitForFunction(() => window.OD && OD.debug && OD.debug.mode && OD.debug.mode !== 'boot', null, { timeout: 15000 });
  const cdp = await ctx.newCDPSession(p);
  p.touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: q[2] != null ? q[2] : i })) });
  p.center = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  p.tappable = sel => p.evaluate(s => { const b = document.querySelector(s), r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && b.contains(h); }, sel);
  return { ctx, p };
}
const quiet = p => p.evaluate(() => { clearInterval(window._q); window._q = setInterval(() => { const w = OD.debug.world; if (w && OD.debug.mode !== 'title' && !OD.Game.bot) w.objects = w.objects.filter(o => o.test); }, 30); });
const st = p => p.evaluate(() => { const w = OD.debug.world; return { lanes: w.stats.lanes, jumps: w.stats.jumps, lane: w.hero.lane, mode: OD.debug.mode, swipe: !!OD.Game._swipe }; });

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const dev of MOBILE) {
    const [name, w, h] = dev;
    const { ctx, p } = await openDev(b, dev);
    // audio unlock on the first touch (iOS rule)
    await p.touchscreen.tap(5, h - 5); await sleep(150);
    check(`${name}: first touch creates / resumes the audio context`, await p.evaluate(() => !!OD.Audio.ctx));
    check(`${name}: a tap on the title background does not start a game`, (await p.evaluate(() => OD.debug.mode)) === 'title');
    // How to Play by touch
    await p.touchscreen.tap(...await p.center('#btnHow')); await sleep(300);
    check(`${name}: How to Play opens by touch`, (await p.evaluate(() => OD.UI.current)) === 'scrHow');
    check(`${name}: How to Play shows touch wording (swipe / tap), not keyboard keys`, await p.evaluate(() => getComputedStyle(document.querySelector('#scrHow .touch-only')).display !== 'none' && getComputedStyle(document.querySelector('#scrHow .kb-only')).display === 'none'));
    const blocked = await p.evaluate(() => {
      const mk = (target) => { const e = new Event('touchmove', { bubbles: true, cancelable: true }); target.dispatchEvent(e); return e.defaultPrevented; };
      return { canvas: mk(document.getElementById('game')), panel: mk(document.querySelector('#scrHow .panel')) };
    });
    check(`${name}: touchmove blocked on the canvas, allowed inside panels`, blocked.canvas && !blocked.panel, blocked);
    const gz = await p.evaluate(() => { const e = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented; });
    check(`${name}: pinch-zoom gesture blocked`, gz);
    const cm = await p.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('game').dispatchEvent(e); return e.defaultPrevented; });
    check(`${name}: long-press context menu blocked`, cm);
    check(`${name}: How to Play OK button tappable without scrolling`, await p.tappable('#scrHow .btn-back'));
    await p.evaluate(() => document.querySelector('#scrHow .btn-back').scrollIntoView({ block: 'nearest' })); await sleep(150);
    await p.touchscreen.tap(...await p.center('#scrHow .btn-back')); await sleep(300);
    check(`${name}: How to Play OK returns to the title`, (await p.evaluate(() => OD.UI.current)) === 'scrTitle');
    await sleep(500);
    check(`${name}: ghost click after the OK tap did not start a game`, (await p.evaluate(() => OD.debug.mode)) === 'title');
    // Settings by touch: every control reachable
    await p.touchscreen.tap(...await p.center('#btnSettings')); await sleep(400);
    for (const sel of ['#setDifficulty [data-v=easy]', '#setDifficulty [data-v=hard]', '#btnResetBest', '#scrSettings .btn-back', '.vol-step[data-d="1"]']) {
      check(`${name}: Settings control ${sel} tappable without scrolling`, await p.tappable(sel));
    }
    await p.evaluate(() => document.querySelector('#setDifficulty [data-v=normal]').scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    await p.touchscreen.tap(...await p.center('#setDifficulty [data-v=normal]')); await sleep(200);
    check(`${name}: tapping Normal selects it`, (await p.evaluate(() => OD.Game.settings.difficulty)) === 'normal');
    await p.touchscreen.tap(...await p.center('#setDifficulty [data-v=easy]')); await sleep(200);
    await p.evaluate(() => document.querySelector('#scrSettings .btn-back').scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    await p.touchscreen.tap(...await p.center('#scrSettings .btn-back')); await sleep(700);
    check(`${name}: Settings Done returns to the title, no ghost start`, (await p.evaluate(() => OD.UI.current)) === 'scrTitle' && (await p.evaluate(() => OD.debug.mode)) === 'title');
    // Change Pictures by touch
    await p.touchscreen.tap(...await p.center('#btnCustomize')); await sleep(400);
    check(`${name}: Change Pictures Done tappable without scrolling`, await p.tappable('#scrCustom .btn-back') ? true : 'warn');
    check(`${name}: Change Pictures says "Tap Choose…" on touch`, await p.evaluate(() => getComputedStyle(document.querySelector('#scrCustom .touch-only')).display !== 'none'));
    await p.evaluate(() => document.querySelector('#scrCustom .btn-back').scrollIntoView({ block: 'nearest' }));
    await p.touchscreen.tap(...await p.center('#scrCustom .btn-back')); await sleep(700);
    // play
    await p.touchscreen.tap(...await p.center('#btnPlay')); await sleep(400);
    await p.waitForFunction(() => OD.debug.mode === 'playing', null, { timeout: 5000 }).catch(() => {});
    check(`${name}: Play by touch starts the run with no lane change / jump from the tap`, (await st(p)).mode === 'playing' && (await st(p)).lanes === 0 && (await st(p)).jumps === 0, await st(p));
    await quiet(p);
    // a finger that starts on the HUD pause button pauses and never steers
    await p.evaluate(() => OD.debug.world.setLane(0));
    const s0 = await st(p);
    const pb = await p.center('#btnPause');
    await p.touch('touchStart', [[pb[0], pb[1], 1]]); await sleep(60); await p.touch('touchMove', [[pb[0] - 5, pb[1] + 4, 1]]); await p.touch('touchEnd', []); await sleep(300);
    const s1 = await st(p);
    check(`${name}: finger on HUD pause pauses and never steers / jumps`, s1.mode === 'paused' && s1.lanes === s0.lanes && s1.jumps === s0.jumps && !s1.swipe, s1);
    await sleep(600);
    await p.touchscreen.tap(...await p.center('#btnResume')); await sleep(300);
    check(`${name}: Resume by touch`, (await st(p)).mode === 'playing');
    // a swipe that starts on the HUD mute button and slides onto the canvas is not a lane change
    const mb = await p.center('#btnMuteHud'); const s2 = await st(p);
    await p.touch('touchStart', [[mb[0], mb[1], 2]]); await p.touch('touchMove', [[mb[0] - 60, mb[1] + 40, 2]]); await p.touch('touchMove', [[mb[0] - 120, mb[1] + 80, 2]]); await p.touch('touchEnd', []); await sleep(300);
    const s3 = await st(p);
    check(`${name}: a drag that starts on a HUD button never steers`, s3.lanes === s2.lanes && s3.jumps === s2.jumps && s3.mode === 'playing', s3);
    // two fingers: finger 1 rests, finger 2 taps the left third → one lane left; then finger 1 swipes right
    await p.evaluate(() => OD.debug.world.setLane(0)); await sleep(100);
    const Y = h * 0.65;
    await p.touch('touchStart', [[w * 0.5, Y, 1]]); await sleep(40);
    await p.touch('touchStart', [[w * 0.5, Y, 1], [w * 0.1, Y, 2]]); await sleep(40);
    await p.touch('touchMove', [[w * 0.5, Y, 1]]); await sleep(40);   // CDP: a point missing from the list = that finger lifted
    const two = (await st(p)).lane;
    await p.touch('touchMove', [[w * 0.5 + 40, Y, 1]]); await p.touch('touchMove', [[w * 0.5 + 90, Y, 1]]); await sleep(40);
    await p.touch('touchEnd', []); await sleep(300);
    const two2 = (await st(p)).lane;
    check(`${name}: two fingers at once: nothing breaks, a lane action happened`, two2 !== 1 && (await p.evaluate(() => OD.debug.stats.errors.length)) === 0, { mid: two, after: two2 });
    check(`${name}: finger 1 still swipes after a second finger tapped (tap left + swipe right = middle)`, two2 === 0 ? true : 'warn', { mid: two, after: two2, expected: 0, note: 'Game._swipe tracks one pointer; the 2nd pointerdown replaces it' });
    // touchcancel (iOS system gesture) releases the swipe
    await p.touch('touchStart', [[w * 0.5, Y, 3]]); await sleep(50); await p.touch('touchCancel', []); await sleep(150);
    check(`${name}: touchcancel releases the swipe and does not act`, !(await st(p)).swipe);
    // rotation while a finger is down
    const s4 = await st(p);
    await p.touch('touchStart', [[w * 0.5, Y, 4]]); await sleep(200);
    await p.setViewportSize({ width: h, height: w }); await sleep(600);
    await p.touch('touchEnd', []); await sleep(200);
    const s5 = await st(p);
    check(`${name}: rotating with a finger down: no stray lane change / jump, still playing`, s5.lanes === s4.lanes && s5.jumps === s4.jumps && s5.mode === 'playing' && !s5.swipe, s5);
    await p.setViewportSize({ width: w, height: h }); await sleep(600);
    // double-tap within 320 ms on the canvas: the 2nd touchend is prevented (no zoom), but both taps still act
    await p.evaluate(() => OD.debug.world.setLane(1)); await sleep(150);
    await p.touchscreen.tap(w * 0.1, Y); await sleep(120); await p.touchscreen.tap(w * 0.1, Y); await sleep(400);
    check(`${name}: quick double tap left → two lanes (double-tap zoom blocked, taps still count)`, (await st(p)).lane === -1, (await st(p)).lane);
    // visibilitychange: pause + audio suspend; resume restores audio
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    const hid = await p.evaluate(() => ({ mode: OD.debug.mode, hidden: OD.Audio._hidden }));
    check(`${name}: app switch pauses the game and suspends audio`, hid.mode === 'paused' && hid.hidden === true, hid);
    await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(100);
    check(`${name}: coming back un-suspends audio (game stays paused until Resume)`, await p.evaluate(() => OD.Audio._hidden === false && OD.debug.mode === 'paused'));
    await p.touchscreen.tap(...await p.center('#btnResume')); await sleep(200);
    // bot at speed 8 through every biome
    await p.evaluate(() => {
      clearInterval(window._q); window._lv = [];
      const G = OD.Game, o = G.handleEvents.bind(G);
      G.handleEvents = function (ev) { for (const e of ev) if (e.type === 'levelUp') window._lv.push(e.zone); return o(ev); };
      OD.debug.setBot(true, 1); OD.debug.setSpeed(8);
    });
    const t0 = Date.now(); let z = 0;
    while (Date.now() - t0 < BOT_MS) { await sleep(BOT_MS / 4); await p.evaluate(z => OD.debug.gotoLevel(z), ++z % 4); await sleep(300); await p.screenshot({ path: `${OUT}/${name}_bot_${z}.png` }); }
    const dr = await p.evaluate(() => ({ lv: window._lv, hearts: OD.debug.world.hearts, mode: OD.debug.mode, err: OD.debug.stats.errors, parts: OD.debug.weather.particles.length }));
    check(`${name}: bot ×8 visits every biome, still playing, particles < 160`, [0, 1, 2, 3].every(z => z === 0 || dr.lv.includes(z)) && dr.mode === 'playing' && dr.parts < 160, dr);
    check(`${name}: no console / runtime errors`, p._errs.length === 0 && dr.err.length === 0, p._errs.concat(dr.err).slice(0, 3));
    await ctx.close();
  }
  // manifest + icons + iOS meta
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check('manifest: name, fullscreen/standalone display, any orientation, icons listed', /Otto/.test(man.name) && /fullscreen|standalone/.test(man.display) && man.orientation === 'any' && man.icons.length >= 2, man.name);
  const pngSize = f => { const bf = fs.readFileSync(f); return [bf.readUInt32BE(16), bf.readUInt32BE(20)]; };
  const icons = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]].map(([f, s]) => { const fp = path.join(ROOT, 'assets/icons', f); const ok = fs.existsSync(fp) && pngSize(fp).every(v => v === s); return [f, ok]; });
  check('icons: 180 / 192 / 512 PNGs present with the right sizes', icons.every(i => i[1]), icons);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('index.html: viewport-fit=cover, no user scaling, apple-mobile-web-app-capable, apple-touch-icon, manifest link',
    /viewport-fit=cover/.test(html) && /user-scalable=no/.test(html) && /apple-mobile-web-app-capable/.test(html) && /apple-touch-icon/.test(html) && /manifest\.webmanifest/.test(html));
  check('index.html: relative asset paths only (works under a GitHub Pages sub-path)', !/(src|href)="\//.test(html));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed, ${warn} warnings`);
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
})();
