// Mobile test for Otto's Playroom Dash: iPhone / iPad, portrait + landscape, emulated touch (isMobile + hasTouch) and REAL
// touch events via CDP. Checks: full-screen canvas (no black letterbox bars), backing store cap, finger-sized menus, the HUD
// inside the safe areas (simulated notch), canvas HUD pills not under the Pause/Sound buttons, swipes (left / right / up = jump)
// and taps by thirds, panels fit (or scroll with their main button reachable), rotate mid-game (no rotate prompt: both
// orientations are playable), Otto's moon-jump apex on screen, zero console errors.
// Usage: node tests/e2e/mobile.js [--quick]   → PASS/FAIL lines, exit 1 on any FAIL; screenshots in tests/out/mobile/
// (adapted from ../hedgehog-moon-pop/tests/e2e/mobile.js)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/mobile'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
let pass = 0, fail = 0, warn = 0; const fails = [];
const check = (name, ok, info) => {
  if (ok === 'warn') { warn++; console.log('WARN ' + name + (info !== undefined ? '  — ' + JSON.stringify(info).slice(0, 400) : '')); return; }
  if (ok) { pass++; console.log('PASS ' + name); } else { fail++; fails.push(name); console.log('FAIL ' + name + (info !== undefined ? '  — ' + JSON.stringify(info).slice(0, 400) : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DEVICES_ALL = [
  ['iphone-landscape', 844, 390, 3], ['iphone-portrait', 390, 844, 3],
  ['ipad-landscape', 1024, 768, 2], ['ipad-pro-landscape', 1366, 1024, 2],
  ['ipad-portrait', 768, 1024, 2], ['iphone-se-portrait', 375, 667, 2]
];
const DEVICES = QUICK ? DEVICES_ALL.slice(0, 4) : DEVICES_ALL;

// canvas HUD pills (render.js drawHud) vs the DOM HUD buttons, in logical px
const HUD_OVERLAP = () => {
  const R = OD.Game.renderer, c = document.getElementById('game').getBoundingClientRect(), I = R.ins, w = OD.debug.world;
  const toL = r => ({ x0: (r.left - c.left) / c.width * R.VW, y0: (r.top - c.top) / c.height * R.VH, x1: (r.right - c.left) / c.width * R.VW, y1: (r.bottom - c.top) / c.height * R.VH });
  const btns = ['btnPause', 'btnMuteHud'].map(id => toL(document.getElementById(id).getBoundingClientRect()));
  const x0 = I.left + 12, y0 = I.top + 10, bw = Math.min(250, R.VW * (R.portrait ? 0.5 : 0.3));
  const bx = R.portrait ? R.VW - I.right - 12 - bw - 8 : R.VW / 2 - bw / 2, by = R._biomePill ? R._biomePill.y0 + 4 : (R.portrait ? y0 + 64 : y0 + 4);   // the renderer's real pill (it moves under the button row)
  const pills = [{ n: 'hearts', x0, y0, x1: x0 + w.maxHearts * 30 + 14, y1: y0 + 38 }, { n: 'acorns', x0, y0: y0 + 46, x1: x0 + 156, y1: y0 + 84 }, { n: 'biome', x0: bx - 8, y0: by - 4, x1: bx + bw + 8, y1: by + 34 }];
  const hits = [];
  for (const pl of pills) for (const b of btns) if (pl.x0 < b.x1 && pl.x1 > b.x0 && pl.y0 < b.y1 && pl.y1 > b.y0) hits.push(pl.n + ' under a HUD button by ' + Math.round(Math.min(pl.y1, b.y1) - Math.max(pl.y0, b.y0)) + ' px');
  return { hits, pills, VW: R.VW, VH: R.VH, ins: R.ins };
};

(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [name, w, h, dsf] of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(GAME + '?mute=1&seed=4&diff=easy');
    await page.waitForFunction(() => window.OD && OD.debug && OD.debug.mode === 'title', null, { timeout: 15000 });
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/${name}_title.png` });
    check(`${name}: touch device detected (body.touch, keyboard hints hidden)`, await page.evaluate(() => document.body.classList.contains('touch') && getComputedStyle(document.querySelector('.kb-only')).display === 'none'));
    const lay = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(), R = OD.Game.renderer; return { cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight, VW: R.VW, VH: R.VH, bs: [R.canvas.width, R.canvas.height] }; });
    check(`${name}: canvas fills the screen (no black letterbox)`, Math.abs(lay.cw - lay.vw) < 2 && Math.abs(lay.ch - lay.vh) < 2, lay);
    check(`${name}: backing store ≤ 3.3 MP`, lay.bs[0] * lay.bs[1] <= 3.3e6, lay.bs);
    const rp = await page.evaluate(() => { const r = document.getElementById('rotate'); return r ? getComputedStyle(r).display !== 'none' : false; });
    check(`${name}: no rotate prompt blocks the game (both orientations are playable)`, !rp);
    const bh = await page.evaluate(() => ['btnPlay', 'btnCustomize', 'btnHow', 'btnSettings'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [id, Math.round(r.width), Math.round(r.height), r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight]; }));
    check(`${name}: title buttons ≥ 40 px tall and on screen`, bh.every(b => b[2] >= 40 && b[3]), bh);
    // start with a real tap on Play
    const pb = await page.evaluate(() => { const r = document.getElementById('btnPlay').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.touchscreen.tap(pb[0], pb[1]);
    await page.waitForFunction(() => OD.debug.mode === 'playing', null, { timeout: 5000 }).catch(() => {});
    check(`${name}: tapping Play starts the game`, await page.evaluate(() => OD.debug.mode === 'playing'));
    await page.evaluate(() => { clearInterval(window._sbx); window._sbx = setInterval(() => { const w = OD.debug.world; if (w && OD.debug.mode === 'playing' && !OD.Game.bot) w.objects = []; }, 30); });
    await sleep(1500);
    const hb = await page.evaluate(() => ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(), c = document.getElementById('game').getBoundingClientRect(); return { id, w: r.width, h: r.height, in: r.left >= c.left && r.right <= c.right + 0.5 && r.top >= c.top && r.bottom <= c.bottom }; }));
    check(`${name}: HUD buttons ≥ 44 css px and inside the canvas`, hb.every(b => b.w >= 43.5 && b.h >= 43.5 && b.in), hb);
    const ov = await page.evaluate(HUD_OVERLAP);
    check(`${name}: hearts / acorn / biome pills not under the Pause/Sound buttons`, ov.hits.length === 0, ov.hits);
    // real touch via CDP: swipes and taps by thirds
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] != null ? p[2] : i })) });
    const swipe = async (x0, y0, x1, y1) => { await touch('touchStart', [[x0, y0, 1]]); for (let i = 1; i <= 5; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / 5, y0 + (y1 - y0) * i / 5, 1]]); await sleep(16); } await touch('touchEnd', []); };
    const lane = () => page.evaluate(() => OD.debug.world.hero.lane);
    const X = f => w * f, Y = h * 0.65;
    await page.evaluate(() => OD.debug.world.setLane(0));
    await swipe(X(0.5), Y, X(0.5) - 80, Y); await sleep(300);
    check(`${name}: swipe left → left lane`, (await lane()) === -1);
    await swipe(X(0.5), Y, X(0.5) + 80, Y); await sleep(300);
    check(`${name}: swipe right → middle lane`, (await lane()) === 0);
    await page.waitForFunction(() => OD.debug.world.hero.onGround, null, { timeout: 3000 }).catch(() => {});
    await swipe(X(0.5), Y, X(0.5), Y - 80); await sleep(120);
    check(`${name}: swipe up → jump`, (await page.evaluate(() => OD.debug.world.hero.y)) > 0.15);
    await sleep(900);
    await page.touchscreen.tap(X(0.9), Y); await sleep(300);
    check(`${name}: tap right third → right lane`, (await lane()) === 1);
    await page.touchscreen.tap(X(0.1), Y); await sleep(300);
    check(`${name}: tap left third → middle lane`, (await lane()) === 0);
    await page.waitForFunction(() => OD.debug.world.hero.onGround, null, { timeout: 3000 }).catch(() => {});
    await page.touchscreen.tap(X(0.5), Y); await sleep(120);
    check(`${name}: tap middle → jump`, (await page.evaluate(() => OD.debug.world.hero.y)) > 0.15);
    // tiny swipe (< 24 px) is a tap, not a swipe
    await sleep(900); await page.evaluate(() => OD.debug.world.setLane(0));
    await touch('touchStart', [[X(0.85), Y, 1]]); await touch('touchMove', [[X(0.85) - 8, Y, 1]]); await touch('touchMove', [[X(0.85) - 15, Y + 2, 1]]); await touch('touchEnd', []); await sleep(300);   // quick: CDP round trips at DPR 3 can exceed the 450 ms tap window
    check(`${name}: a 15 px wiggle in the right third counts as a tap (right lane)`, (await lane()) === 1);
    // Otto at a moon-jump apex in an edge lane stays on screen
    await page.evaluate(() => OD.debug.gotoLevel(3)); await sleep(400);
    const ap = await page.evaluate(() => { const R = OD.Game.renderer, out = []; for (const x of [-1, 1]) { const pr = R.proj(x, 1.25, 0, 0.35 * x); out.push({ top: pr.sy - 0.95 * pr.u * 120 / 128, l: pr.sx - 0.475 * pr.u, r: pr.sx + 0.475 * pr.u }); } return { out, VW: R.VW }; });
    check(`${name}: moon-jump apex in the edge lanes stays on screen`, ap.out.every(o => o.top > 0 && o.l > 0 && o.r < ap.VW), ap);
    // bot play screenshots in every biome
    await page.evaluate(() => { clearInterval(window._sbx); OD.debug.setBot(true, 1); OD.debug.gotoLevel(0); });
    for (let z = 0; z < 4; z++) { if (z) await page.evaluate(z => OD.debug.gotoLevel(z), z); await sleep(z ? 3300 : 2500); await page.screenshot({ path: `${OUT}/${name}_biome${z + 1}.png` }); }
    // pause panel
    await page.evaluate(() => OD.Game.pause()); await sleep(600);
    const pf = await page.evaluate(() => { const r = document.querySelector('#scrPause .panel').getBoundingClientRect(), b = document.getElementById('btnResume').getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { fits: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, resume: !!hit && document.getElementById('btnResume').contains(hit) }; });
    check(`${name}: pause panel fits and Resume is tappable`, pf.fits && pf.resume, pf);
    await page.screenshot({ path: `${OUT}/${name}_pause.png` });
    await page.evaluate(() => OD.Game.resume());
    // rotate mid-game
    const lane0 = await lane();
    await page.setViewportSize({ width: h, height: w }); await sleep(700);
    const rot = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(), R = OD.Game.renderer; return { cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight, portrait: R.portrait, mode: OD.debug.mode, lane: OD.debug.world.hero.lane }; });
    check(`${name}: after rotating, the canvas refills the screen, run continues`, Math.abs(rot.cw - rot.vw) < 2 && Math.abs(rot.ch - rot.vh) < 2 && rot.portrait === (w > h) && rot.mode === 'playing', rot);
    const ov2 = await page.evaluate(HUD_OVERLAP);
    check(`${name}: after rotating, HUD pills still clear of the buttons`, ov2.hits.length === 0, ov2.hits);
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/${name}_rotated.png` });
    await page.setViewportSize({ width: w, height: h }); await sleep(500);
    // game over screen
    await page.evaluate(() => { OD.debug.setBot(false); const wd = OD.debug.world; wd.objects = []; wd.hearts = 1; wd.hero.invuln = 0; wd.spawn('tower', wd.hero.lane, 0.6); });
    await page.waitForFunction(() => OD.debug.mode === 'over', null, { timeout: 8000 }).catch(() => {});
    await sleep(700);
    await page.screenshot({ path: `${OUT}/${name}_over.png` });
    const og = await page.evaluate(() => { const r = document.querySelector('#scrOver .panel').getBoundingClientRect(), b = document.getElementById('btnAgain').getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { fits: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, again: !!hit && document.getElementById('btnAgain').contains(hit) }; });
    check(`${name}: game-over panel fits, Play Again tappable`, og.fits && og.again, og);
    // panels from the title
    await page.evaluate(() => OD.Game.toTitle()); await sleep(400);
    for (const id of ['scrHow', 'scrSettings', 'scrCustom']) {
      await page.evaluate(id => OD.UI.open(id, 'scrTitle'), id); await sleep(700);
      const f = await page.evaluate(id => {
        const pnl = document.querySelector('#' + id + ' .panel'), r = pnl.getBoundingClientRect(), back = pnl.querySelector('.btn-back'), b = back.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const off = [...pnl.querySelectorAll('button')].filter(x => x.offsetParent && !x.closest('.hidden')).map(x => [x.textContent.trim().slice(0, 12), x.getBoundingClientRect()]).filter(([, q]) => q.right > innerWidth + 1 || q.left < -1).map(x => x[0]);
        return { inView: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, sideways: pnl.scrollWidth > pnl.clientWidth + 2, scrolls: pnl.scrollHeight > pnl.clientHeight + 2, backTappable: !!hit && back.contains(hit), off };
      }, id);
      check(`${name}: ${id} fits (no sideways scroll, every button on screen, Done/OK tappable)`, f.inView && !f.sideways && f.off.length === 0 && (f.backTappable || (f.scrolls ? 'warn' : false)), f);
      await page.screenshot({ path: `${OUT}/${name}_${id}.png` });
      await page.evaluate(() => OD.UI.back());
    }
    check(`${name}: no console errors`, errs.length === 0 && (await page.evaluate(() => OD.debug.stats.errors.length)) === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // notch / home indicator: simulate safe-area insets by overriding the probe padding (and the screens' padding)
  for (const [name, w, h, pad] of [['notch-landscape', 844, 390, '0 47px 21px 47px'], ['notch-portrait', 390, 844, '47px 0 34px 0']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(pad => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#safeProbe,.screen{padding:' + pad + ' !important}'; document.head.appendChild(st); }); }, pad);
    await page.goto(GAME + '?mute=1&seed=4&autostart=1');
    await page.waitForFunction(() => OD.debug && OD.debug.mode === 'playing');
    await sleep(1500);
    const [t, r, b, l] = pad.split(' ').map(parseFloat);
    const s = await page.evaluate(() => {
      const R = OD.Game.renderer, c = document.getElementById('game').getBoundingClientRect(), k = c.width / R.VW, hud = document.getElementById('hud').getBoundingClientRect();
      return { ins: R.ins, k, hud: { top: hud.top, right: hud.right }, heartsLeftCss: c.left + (R.ins.left + 12) * k, heartsTopCss: c.top + (R.ins.top + 10) * k, footCss: c.top + R.footY * k, vw: innerWidth, vh: innerHeight };
    });
    check(`${name}: insets read by the renderer`, (l ? s.ins.left > 0 : true) && (t ? s.ins.top > 0 : true) && s.ins.bottom > 0, s.ins);
    check(`${name}: Pause/Sound buttons clear of the notch`, s.hud.right <= w - r + 1 && s.hud.top >= t - 1, s.hud);
    check(`${name}: hearts pill clear of the notch`, s.heartsLeftCss >= l && s.heartsTopCss >= t, { x: s.heartsLeftCss, y: s.heartsTopCss });
    check(`${name}: Otto's feet above the home indicator`, s.footCss <= h - b, { foot: s.footCss, limit: h - b });
    const ov = await page.evaluate(HUD_OVERLAP);
    check(`${name}: HUD pills not under the buttons`, ov.hits.length === 0, ov.hits);
    await page.evaluate(() => OD.Game.pause()); await sleep(500);
    const pp = await page.evaluate(() => { const r = document.querySelector('#scrPause .panel').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    check(`${name}: pause panel inside the safe area`, pp[0] >= l - 1 && pp[1] >= t - 1 && pp[2] <= w - r + 1 && pp[3] <= h - b + 1, pp);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    check(`${name}: no errors`, errs.length === 0, errs);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed, ${warn} warnings`);
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
})();
