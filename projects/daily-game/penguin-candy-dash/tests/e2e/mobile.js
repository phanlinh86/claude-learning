// Pip's Candy Dash: iPhone / iPad checks (Chromium in mobile emulation: hasTouch + isMobile, DPR 2–3).
// usage: node tests/e2e/mobile.js            (serves game/ itself on a free port)
//        node tests/e2e/mobile.js <baseUrl>  (an already running server, e.g. http://127.0.0.1:8801/index.html)
// Per size (844×390, 390×844, 1024×768, 1366×1024 and an upright iPad): zero console errors, every menu panel fits
// the screen (scrollable if needed), real CDP touch steering moves Pip, the HUD stays inside a simulated notch /
// home-bar safe area, the canvas fills the window with scenery (no black bars). Plus: a second finger taps Pause,
// the rotate prompt on upright phones, ghost clicks, app switch (visibilitychange), rotation mid-game, kid-proofing.
// Screenshots go to tests/out/mobile/. Exits 1 on any FAIL.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'game');
const OUT = path.join(__dirname, '..', 'out', 'mobile');
fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

let fails = 0, passes = 0;
const check = (name, ok, detail) => { if (ok) passes++; else fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

// [width, height, dpr, name, notch insets (iPhone-like), phone?]
const SIZES = [
  [844, 390, 3, 'iphone_land', { top: 0, right: 47, bottom: 21, left: 47 }, true],
  [390, 844, 3, 'iphone_port', { top: 47, right: 0, bottom: 34, left: 0 }, true],
  [1024, 768, 2, 'ipad_land', { top: 24, right: 0, bottom: 20, left: 0 }, false],
  [1366, 1024, 2, 'ipadpro_land', { top: 24, right: 0, bottom: 20, left: 0 }, false],
  [820, 1180, 2, 'ipadair_port', { top: 24, right: 0, bottom: 20, left: 0 }, false]
];

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
      if (!p.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
      fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
    });
    srv.listen(0, () => res(srv));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* simulate a notch / home bar: env(safe-area-inset-*) is 0 in Chromium, so pad the probe + screens like iOS would */
async function setNotch(page, i) {
  await page.evaluate(i => {
    let st = document.getElementById('__notch'); if (!st) { st = document.createElement('style'); st.id = '__notch'; document.head.appendChild(st); }
    const pad = `${i.top}px ${i.right}px ${i.bottom}px ${i.left}px`;
    // (on iOS the same env() values also shrink the panels' max size: mirror that too)
    st.textContent = `#safeProbe{padding:${pad} !important} .screen{padding:${pad} !important}
      .panel{max-width:calc(100vw - 16px - ${i.left + i.right}px) !important;max-height:calc(100dvh - 16px - ${i.top + i.bottom}px) !important}`;
    CD.Game.relayout();
  }, i);
  await sleep(60);
}

/* every visible panel / button inside the viewport; a panel taller than the screen must scroll */
const menuReport = page => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight, scr = CD.UI.current && document.getElementById(CD.UI.current);
  if (!scr) return { ok: false, why: 'no screen' };
  const panel = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
  const pr = panel.getBoundingClientRect(), bad = [];
  if (pr.left < -0.5 || pr.top < -0.5 || pr.right > vw + 0.5 || pr.bottom > vh + 0.5) bad.push('panel ' + [pr.left, pr.top, pr.right, pr.bottom].map(Math.round).join(','));
  const scrolls = panel.scrollHeight > panel.clientHeight + 1;
  const ov = getComputedStyle(panel).overflowY;
  if (scrolls && !/auto|scroll/.test(ov)) bad.push('content cut off (no scroll)');
  if (panel.scrollWidth > panel.clientWidth + 1) bad.push('sideways overflow ' + panel.scrollWidth + '>' + panel.clientWidth);
  const btns = [...scr.querySelectorAll('button')].filter(b => b.offsetParent !== null);
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    if (r.left < pr.left - 1 || r.right > pr.right + 1) bad.push('button sticks out: ' + (b.id || b.textContent.trim().slice(0, 16)));
    if (!scrolls && (r.top < -0.5 || r.bottom > vh + 0.5)) bad.push('off screen: ' + (b.id || b.textContent.trim().slice(0, 16)));
    if (r.height < 30 && !b.closest('.shape')) bad.push('tiny button: ' + (b.id || b.textContent.trim().slice(0, 16)) + ' ' + Math.round(r.height));
  }
  return { ok: bad.length === 0, bad, scrolls };
});

/* the canvas covers the whole window and its edges / corners are painted (not black, not empty) */
const blackBars = page => page.evaluate(() => {
  const c = document.getElementById('game'), r = c.getBoundingClientRect(), g = c.getContext('2d');
  const full = Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1 && r.left === 0 && r.top === 0;
  const W = c.width, H = c.height, dark = [];
  for (const [fx, fy] of [[0.01, 0.01], [0.99, 0.01], [0.01, 0.99], [0.99, 0.99], [0.5, 0.01], [0.5, 0.99], [0.01, 0.5], [0.99, 0.5]]) {
    const d = g.getImageData(Math.floor(fx * (W - 1)), Math.floor(fy * (H - 1)), 1, 1).data;
    if (d[0] + d[1] + d[2] < 120) dark.push([fx, fy, d[0], d[1], d[2]]);
  }
  return { full, dark };
});

/* where the in-canvas HUD band and the DOM buttons sit, in client px */
const hudReport = page => page.evaluate(() => {
  const R = CD.Game.renderer, b = R._hudBox; if (!b) return null;
  const [l, t] = R.toClient(b.l, b.t), [r] = R.toClient(b.r, b.b);
  const h = document.getElementById('hud').getBoundingClientRect(), a = document.getElementById('btnAction');
  const ar = a.classList.contains('hidden') ? null : a.getBoundingClientRect();
  return { band: { l: Math.round(l), t: Math.round(t), r: Math.round(r) }, btns: { l: Math.round(h.left), t: Math.round(h.top), r: Math.round(h.right), b: Math.round(h.bottom) },
    act: ar && { l: Math.round(ar.left), t: Math.round(ar.top), r: Math.round(ar.right), b: Math.round(ar.bottom) }, vw: innerWidth, vh: innerHeight, gap: Math.round(h.left - r) };
});

async function perSize(browser, base, [w, h, dpr, name, notch, phone]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: dpr });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  const tag = `${name} ${w}×${h}@${dpr}`;
  await page.goto(base + 'mute=1&seed=7');
  await page.waitForFunction(() => window.CD && CD.debug && CD.debug.mode === 'title', null, { timeout: 15000 });
  await sleep(500);
  check(`${tag}: touch layout detected (body.touch)`, await page.evaluate(() => document.body.classList.contains('touch') && CD.Game.isTouch));
  await setNotch(page, notch);

  // ---- menus fit (title, How to Play, Settings, Change Pictures, Pause, Game over)
  for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
    await page.evaluate(s => {
      const G = CD.Game;
      if (s === 'scrPause') { G._rotOk = true; G.startGame(); G.world.state = 'playing'; G.pause(); }
      else if (s === 'scrOver') { G._rotOk = true; G.startGame(); G.world.score = 4321; G.gameOver(); }
      else { G.toTitle(); if (s !== 'scrTitle') CD.UI.open(s, 'scrTitle'); }
    }, scr);
    await sleep(450);
    const r = await menuReport(page);
    check(`${tag}: ${scr} fits the screen${r.scrolls ? ' (scrolls)' : ''}`, r.ok, r.bad && r.bad.join('; '));
    await page.screenshot({ path: path.join(OUT, `${name}_${scr}.png`) });
  }

  // ---- play
  await page.evaluate(() => { const G = CD.Game; G._rotOk = false; G.toTitle(); });
  await sleep(200);
  await page.locator('#btnPlay').tap();
  await sleep(300);
  check(`${tag}: tapping Play starts the game`, (await page.evaluate(() => CD.debug.mode)) === 'playing');
  const rot = await page.evaluate(() => !document.getElementById('rotate').classList.contains('hidden'));
  if (phone && h > w) {
    check(`${tag}: upright phone shows the "turn sideways" card`, rot);
    const t0 = await page.evaluate(() => CD.debug.world.time); await sleep(400);
    check(`${tag}: the game waits while the card is up`, (await page.evaluate(() => CD.debug.world.time)) === t0);
    await page.screenshot({ path: path.join(OUT, `${name}_rotate.png`) });
    await page.locator('#btnRotOk').tap(); await sleep(250);
    check(`${tag}: "Play upright anyway" hides the card`, await page.evaluate(() => document.getElementById('rotate').classList.contains('hidden') && CD.debug.mode === 'playing'));
  } else check(`${tag}: no rotate card`, !rot);
  // skip the intro, park Pip, freeze sim time
  await page.evaluate(() => {
    const G = CD.Game, w = G.world; let i = 0; while (w.state !== 'playing' && i++ < 3000) G.step(1 / 60);
    G.renderer.banner = null; G.speed = 0;
    w.bears.length = 0; w.gems.length = 0; w.gemsWanted = 0;
    const p = w.pip; p.x = p._px = 300; p.y = p._py = 300; p.vx = p.vy = 0; p.invuln = 99;
  });
  await sleep(150);
  const bb = await blackBars(page);
  check(`${tag}: canvas fills the window, no black bars`, bb.full && bb.dark.length === 0, bb);

  // ---- HUD inside the safe area
  const hr = await hudReport(page);
  const inside = hr && hr.band.l >= notch.left && hr.band.t >= notch.top - 1 && hr.band.r <= w - notch.right &&
    hr.btns.t >= notch.top && hr.btns.r <= w - notch.right && hr.btns.l > hr.band.r - 2 &&
    (!hr.act || (hr.act.r <= w - notch.right && hr.act.b <= h - notch.bottom));
  check(`${tag}: HUD (hearts, score, jar, buttons, ★) inside the notch-safe area, jar left of the buttons`, inside, hr);
  check(`${tag}: HUD buttons ≥ 44 px`, hr && hr.btns.b - hr.btns.t >= 43.5, hr && hr.btns);

  // ---- real touch steering (CDP): hold a finger, drag it; Pip follows, aimed above the finger
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const cl = (x, y) => page.evaluate(([x, y]) => CD.Game.renderer.toClient(x, y), [x, y]);
  const [ax, ay] = await cl(320, 330), [bx, by] = await cl(640, 380);
  await touch('touchStart', [{ x: ax, y: ay, id: 1 }]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: ax + (bx - ax) * i / 6, y: ay + (by - ay) * i / 6, id: 1 }]);
  await sleep(80);
  await page.evaluate(() => { const G = CD.Game; for (let i = 0; i < 240; i++) G.step(1 / 60); });
  const st = await page.evaluate(() => ({ p: { x: CD.debug.world.pip.x, y: CD.debug.world.pip.y }, t: CD.debug.world._target, aim: CD.Game.TOUCH_AIM, held: CD.Game.pointerDown }));
  check(`${tag}: a held, dragged finger steers Pip to it`, st.held && Math.hypot(st.p.x - 640, st.p.y - (380 + st.aim)) < 30, st);
  check(`${tag}: Pip aims above the finger (finger never hides him)`, st.t && st.t.y < 380 - 10, st.t);
  await page.screenshot({ path: path.join(OUT, `${name}_steer.png`) });
  // a second finger on Pause while the first still steers
  const pb = await page.locator('#btnPause').boundingBox();
  await touch('touchStart', [{ x: bx, y: by, id: 1 }, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2, id: 2 }]);
  await touch('touchEnd', [{ x: pb.x + pb.width / 2, y: pb.y + pb.height / 2, id: 2 }]);   // CDP: touchEnd lists the lifted finger
  await sleep(120);
  check(`${tag}: a second finger can tap Pause mid-steer`, (await page.evaluate(() => CD.debug.mode)) === 'paused');
  await touch('touchEnd', [{ x: bx, y: by, id: 1 }]); await sleep(80);
  check(`${tag}: pausing lets go of the steering finger`, await page.evaluate(() => !CD.Game.pointerDown && CD.debug.world._target === null));
  await page.locator('#btnResume').tap(); await sleep(200);
  check(`${tag}: Resume by touch`, (await page.evaluate(() => CD.debug.mode)) === 'playing');
  await page.screenshot({ path: path.join(OUT, `${name}_game.png`) });

  check(`${tag}: zero console errors`, errors.length === 0, errors.slice(0, 4).join(' | '));
  await ctx.close();
}

async function extras(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(base + 'mute=1&seed=9');
  await page.waitForFunction(() => window.CD && CD.debug && CD.debug.mode === 'title', null, { timeout: 15000 });
  await sleep(400);
  // head: home-screen app metas + manifest + icons
  const head = await page.evaluate(async () => {
    const m = n => { const e = document.querySelector(`meta[name="${n}"]`); return e && e.content; };
    const man = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
    const ok = async u => (await fetch(u)).ok;
    return { vp: m('viewport'), cap: m('apple-mobile-web-app-capable'), theme: m('theme-color'), man: man.name, icons: await Promise.all(man.icons.map(i => ok(i.src))), touchIcon: await ok(document.querySelector('link[rel=apple-touch-icon]').href) };
  });
  check('head: viewport-fit=cover, no user scaling, web-app metas, manifest + icons load', /viewport-fit=cover/.test(head.vp) && /user-scalable=no/.test(head.vp) && head.cap === 'yes' && !!head.theme && !!head.man && head.icons.every(Boolean) && head.touchIcon, head);
  // ghost click: a tap that opens How to Play must not also press the button now under the finger
  const hb = await page.locator('#btnHow').boundingBox();
  await page.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2); await sleep(700);
  check('ghost click: tapping "How to Play" opens it and it stays open', (await page.evaluate(() => CD.UI.current)) === 'scrHow');
  await page.locator('#scrHow .btn-back').tap(); await sleep(300);
  check('touch: How to Play → OK back to the title', (await page.evaluate(() => CD.UI.current)) === 'scrTitle');
  // kid-proofing: pinch / scroll / double-tap gestures are cancelled outside the scrollable panels
  const kp = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = new Event('gesturestart', { cancelable: true, bubbles: true }); c.dispatchEvent(g);
    const t = new TouchEvent('touchmove', { cancelable: true, bubbles: true, touches: [] }); c.dispatchEvent(t);
    const d = new MouseEvent('dblclick', { cancelable: true, bubbles: true }); c.dispatchEvent(d);
    CD.UI.open('scrHow', 'scrTitle');
    const p = document.querySelector('#scrHow .panel'), t2 = new TouchEvent('touchmove', { cancelable: true, bubbles: true, touches: [] }); p.dispatchEvent(t2);
    CD.UI.show('scrTitle');
    const cs = getComputedStyle(c);
    return { gesture: g.defaultPrevented, move: t.defaultPrevented, dbl: d.defaultPrevented, panelScroll: !t2.defaultPrevented, touchAction: cs.touchAction, callout: getComputedStyle(document.body).webkitTouchCallout };
  });
  check('kid-proof: pinch, rubber-band scroll and double-tap zoom blocked; panels still scroll', kp.gesture && kp.move && kp.dbl && kp.panelScroll && kp.touchAction === 'none', kp);
  // app switch: pause + audio suspended, back: audio resumes (game stays paused)
  await page.evaluate(() => { CD.Game.startGame(); CD.Audio.unlock(); });
  await sleep(300);
  const vis = async hidden => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  await vis(true); await sleep(150);
  const away = await page.evaluate(() => ({ mode: CD.debug.mode, hidden: CD.Audio._hidden, ctx: CD.Audio.ctx && CD.Audio.ctx.state }));
  check('app switch: game pauses and the audio clock stops', away.mode === 'paused' && away.hidden === true && away.ctx !== 'running', away);
  await vis(false); await sleep(150);
  const back = await page.evaluate(() => ({ mode: CD.debug.mode, hidden: CD.Audio._hidden }));
  check('back to the app: still paused (child taps Resume), audio allowed again', back.mode === 'paused' && back.hidden === false, back);
  // rotation mid-game: landscape → portrait → landscape, steering finger released, layout follows
  await page.evaluate(() => CD.Game.resume());
  await page.evaluate(() => { CD.Game.pointerDown = true; CD.Game._steerId = 5; CD.Game.renderer.pointer = [500, 300]; });
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  const p1 = await page.evaluate(() => ({ portrait: CD.Game.renderer.portrait, held: CD.Game.pointerDown, rot: !document.getElementById('rotate').classList.contains('hidden') }));
  check('rotate to portrait mid-game: re-layout, finger released, turn-sideways card', p1.portrait && !p1.held && p1.rot, p1);
  await page.screenshot({ path: path.join(OUT, 'rotate_mid_game.png') });
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(400);
  const p2 = await page.evaluate(() => ({ portrait: CD.Game.renderer.portrait, rot: !document.getElementById('rotate').classList.contains('hidden'), mode: CD.debug.mode, cw: document.getElementById('game').getBoundingClientRect().width }));
  check('rotate back to landscape: card gone, game goes on, canvas fills the window', !p2.portrait && !p2.rot && p2.mode === 'playing' && Math.abs(p2.cw - 844) < 1, p2);
  check('extras: zero console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await ctx.close();
}

(async () => {
  let srv = null, base = process.argv[2];
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port + '/index.html'; }
  base += base.includes('?') ? '&' : '?';
  const browser = await chromium.launch();
  try {
    for (const s of SIZES) { console.log('== ' + s[3]); await perSize(browser, base, s); }
    console.log('== extras'); await extras(browser, base);
  } catch (e) { check('exception', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); }
  await browser.close(); if (srv) srv.close();
  console.log(`\n${passes}/${passes + fails} checks passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
