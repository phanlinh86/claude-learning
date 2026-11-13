// Visual capture for art-direction review.
// Usage: node tests/visual/capture.js [outDir]    (default tests/out/visual, gitignored)
// Serves game/ with `python3 -m http.server` on a free port, drives the game through CGF.debug and
// freezes time (speed 0) so every motion frame is stepped exactly with Game.step(1/120).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const net = require('net'), fs = require('fs'), path = require('path');

const GAME = path.join(__dirname, '..', '..', 'game');
const OUT = process.argv[2] || path.join(__dirname, '..', 'out', 'visual');
fs.mkdirSync(OUT, { recursive: true });

const SIZES = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipadP: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function waitHttp(url, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return; } catch (e) {} await new Promise(r => setTimeout(r, 150)); }
  throw new Error('server did not start');
}

// ---- in-page helpers ----------------------------------------------------------------------------
const HELPERS = () => {
  window.__adv = (sec) => {          // advance the frozen game exactly `sec` seconds
    const G = CGF.Game, h = 1 / 120, n = Math.max(1, Math.round(sec / h));
    for (let i = 0; i < n; i++) { G.step(h); G.renderer.update(h); }
  };
  window.__freeze = () => { CGF.debug.setSpeed(0); };
  window.__until = (pred, max = 30) => {   // step until pred() true (max seconds)
    const G = CGF.Game, h = 1 / 120; let t = 0;
    while (!pred() && t < max) { G.step(h); G.renderer.update(h); t += h; }
    return t;
  };
  window.__pair = (same) => {             // indices of two down cards that match (same) or differ
    const cs = CGF.debug.world.cards, d = cs.map((c, i) => [c, i]).filter(([c]) => c.state === 'down');
    for (const [a, i] of d) for (const [b, j] of d) if (i < j && (a.kind === b.kind) === same) return [i, j];
    return null;
  };
};

let page, shotN = 0;
async function frame() { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function shot(name) { await frame(); await page.screenshot({ path: path.join(OUT, name + '.png') }); shotN++; }
async function ev(fn, arg) { return page.evaluate(fn, arg); }
async function open(ctx, base, q) {
  page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', String(e)));
  await page.goto(base + q);
  await page.waitForFunction(() => window.CGF && CGF.debug && CGF.Game && CGF.Game.mode !== 'boot', null, { timeout: 15000 });
  await page.evaluate(HELPERS);
  await page.waitForTimeout(400);
}

// contact sheet: stitch several screenshots (clip) into one PNG via an HTML page
async function contact(ctx, name, files, cols, label) {
  const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const p = await ctx.newPage({ viewport: { width: 1400, height: 900 } });
  await p.setContent(`<body style="margin:0;background:#222;font:14px sans-serif;color:#fff">
    <div style="padding:6px">${label}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px">
    ${imgs.map((s, i) => `<div style="position:relative"><img src="${s}" style="width:100%;display:block"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 4px">${i}</span></div>`).join('')}
    </div></body>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  await p.close();
  files.forEach(f => fs.unlinkSync(f));
}
async function clipShot(file, clip) { await frame(); await page.screenshot({ path: file, clip }); }
// logical stage rect → CSS px clip
async function toClip(x, y, w, h) {
  return ev(([x, y, w, h]) => { const R = CGF.Game.renderer, s = R.cssScale; return { x: (x + R.ox) * s, y: (y + R.oy) * s, width: w * s, height: h * s }; }, [x, y, w, h]);
}

(async () => {
  const port = await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '-d', GAME], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/`;
  await waitHttp(base);
  const b = await chromium.launch();
  try {
    // ================= 1. menu screens at 3 sizes =================
    for (const [sz, opt] of Object.entries(SIZES)) {
      const ctx = await b.newContext(opt);
      await open(ctx, base, '?mute=1&seed=7');
      await page.waitForTimeout(2200);
      await shot(`scr_${sz}_title`);
      for (const [btn, scr] of [['#btnHow', 'how'], ['#btnSettings', 'settings'], ['#btnCustomize', 'custom']]) {
        await page.click(btn); await page.waitForTimeout(450);
        await shot(`scr_${sz}_${scr}`);
        await page.click(`#scr${scr === 'how' ? 'How' : scr === 'settings' ? 'Settings' : 'Custom'} .btn-back`); await page.waitForTimeout(300);
      }
      // play → pause
      await page.goto(base + '?mute=1&seed=7&autostart=1');
      await page.waitForFunction(() => CGF.debug && CGF.debug.world && CGF.debug.world.phase === 'playing', null, { timeout: 15000 });
      await page.evaluate(HELPERS);
      await shot(`scr_${sz}_playing`);
      await ev(() => CGF.Game.pause()); await page.waitForTimeout(400);
      await shot(`scr_${sz}_pause`);
      await ev(() => CGF.Game.resume());
      await ev(() => { CGF.debug.world.timeLeft = 0.05; });
      await page.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 15000 });
      await page.waitForTimeout(700);
      await shot(`scr_${sz}_over`);
      // iPhone upright (rotate prompt)
      await ctx.close();
    }
    {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await open(ctx, base, '?mute=1&seed=7');
      await page.waitForTimeout(1500); await shot('scr_iphoneP_title');
      await page.click('#btnPlay'); await page.waitForTimeout(1500); await shot('scr_iphoneP_rotate');
      const has = await page.isVisible('#btnRotateOk');
      if (has) { await page.click('#btnRotateOk'); await page.waitForTimeout(2500); await shot('scr_iphoneP_upright_play'); }
      await ctx.close();
    }

    // ================= 2. every season: deal / peek / open pair / wiggle / match / clear =================
    for (const [sz, opt] of [['iphone', SIZES.iphone], ['desk', SIZES.desk], ['ipadP', SIZES.ipadP]]) {
      const ctx = await b.newContext(opt);
      for (let lv = 0; lv < 4; lv++) {
        if (sz !== 'iphone' && lv !== 0 && lv !== 3) continue;   // phone gets all seasons; others the smallest + biggest
        await open(ctx, base, `?mute=1&seed=${11 + lv}&autostart=1&level=${lv}`);
        await ev(() => window.__freeze());
        const P = `s${lv}_${sz}`;
        await ev(() => window.__adv(0.35)); await shot(`${P}_1deal`);
        await ev(() => window.__until(() => CGF.debug.world.phase === 'peek')); await ev(() => window.__adv(0.5)); await shot(`${P}_2peek`);
        await ev(() => window.__until(() => CGF.debug.world.phase === 'playing')); await ev(() => window.__adv(0.6));
        await shot(`${P}_3play`);
        // one card open (Comet goes to it)
        const wrong = await ev(() => window.__pair(false));
        await ev(i => CGF.debug.tap(i), wrong[0]); await ev(() => window.__adv(0.5));
        await shot(`${P}_4oneopen`);
        await ev(i => CGF.debug.tap(i), wrong[1]); await ev(() => window.__adv(0.24 + 0.12));
        await shot(`${P}_5wiggle`);
        await ev(() => window.__adv(1.2));
        const same = await ev(() => window.__pair(true));
        await ev(i => CGF.debug.tap(i), same[0]); await ev(() => window.__adv(0.3));
        await ev(i => CGF.debug.tap(i), same[1]); await ev(() => window.__adv(0.22 + 0.2));
        await shot(`${P}_6match`);
        await ev(() => window.__adv(0.25)); await shot(`${P}_7flyers`);
        // clear the rest instantly via the bot (skill 1), then capture confetti
        await ev(() => { CGF.debug.setBot(true, 1); });
        await ev(() => window.__until(() => CGF.debug.world.phase === 'clear', 60));
        await ev(() => window.__adv(0.5)); await shot(`${P}_8clear`);
        await ev(() => window.__adv(0.9)); await shot(`${P}_9clear2`);
        if (lv === 3 || (sz === 'iphone' && lv === 1)) {
          // time's up: start a fresh level, let the clock run out
          await ev(() => { CGF.debug.setBot(false); window.__until(() => CGF.debug.world.phase === 'playing', 30); CGF.debug.world.timeLeft = 9; });
          await ev(() => window.__adv(1.0)); await shot(`${P}_Ahurry`);
          await ev(() => window.__adv(5.2)); await shot(`${P}_Blow`);
          await ev(() => window.__until(() => CGF.debug.world.phase === 'over', 20)); await ev(() => window.__adv(0.8));
          await shot(`${P}_Ctimesup`);
        }
        await page.close();
      }
      await ctx.close();
    }

    // ================= 3. colour-blind / greyscale of the full 12-gem board =================
    {
      const ctx = await b.newContext(SIZES.iphone);
      await open(ctx, base, '?mute=1&seed=4&autostart=1&level=3');
      await ev(() => { window.__freeze(); window.__until(() => CGF.debug.world.phase === 'peek'); window.__adv(0.4); });
      await ev(() => document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><filter id="deut"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter><filter id="prot"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter><filter id="trit"><feColorMatrix type="matrix" values="1.256 -0.077 -0.179 0 0  -0.078 0.931 0.148 0 0  0.005 0.691 0.304 0 0  0 0 0 1 0"/></filter></svg>`));
      await shot('cb_normal');
      for (const [n, f] of [['grey', 'grayscale(1)'], ['deuter', 'url(#deut)'], ['protan', 'url(#prot)'], ['tritan', 'url(#trit)']]) {
        await ev(f => { document.getElementById('game').style.filter = f; }, f);
        await shot('cb_' + n);
      }
      await ctx.close();
    }

    // ================= 4. motion contact sheets =================
    {
      const ctx = await b.newContext(SIZES.desk);
      await open(ctx, base, '?mute=1&seed=21&autostart=1&level=0');
      await ev(() => window.__freeze());
      // deal slide-in
      let files = [];
      const boardClip = await toClip(150, 60, 810, 420);
      for (let i = 0; i < 12; i++) { const f = path.join(OUT, `_d${i}.png`); await clipShot(f, boardClip); files.push(f); await ev(() => window.__adv(1 / 15)); }
      await contact(ctx, 'motion_deal', files, 4, 'Deal slide-in, 1/15 s per frame');
      await ev(() => window.__until(() => CGF.debug.world.phase === 'playing')); await ev(() => window.__adv(2.5));
      // flip sequence of one card (zoomed)
      const pr = await ev(() => window.__pair(false));
      const card = await ev(i => { const c = CGF.debug.world.cards[i]; return [c.x, c.y, c.w, c.h]; }, pr[0]);
      const cClip = await toClip(card[0] - 30, card[1] - 30, card[2] + 60, card[3] + 60);
      files = [];
      await ev(i => CGF.debug.tap(i), pr[0]);
      for (let i = 0; i < 12; i++) { const f = path.join(OUT, `_f${i}.png`); await clipShot(f, cClip); files.push(f); await ev(() => window.__adv(1 / 50)); }
      await contact(ctx, 'motion_flip', files, 6, 'Flip, 20 ms per frame (flipTime 0.22 s)');
      // wiggle of the wrong pair
      await ev(i => CGF.debug.tap(i), pr[1]); await ev(() => window.__adv(0.22));
      files = [];
      for (let i = 0; i < 12; i++) { const f = path.join(OUT, `_w${i}.png`); await clipShot(f, cClip); files.push(f); await ev(() => window.__adv(1 / 30)); }
      await contact(ctx, 'motion_wiggle', files, 6, 'Wrong pair wiggle, 33 ms per frame (card A)');
      // comet oops + flying across the board: full-stage frames
      files = [];
      const full = await toClip(0, 0, 960, 540);
      await ev(() => window.__adv(1.2));
      const far = await ev(() => { const cs = CGF.debug.world.cards; let best = -1, bx = -1; cs.forEach((c, i) => { if (c.state === 'down' && c.x > bx) { bx = c.x; best = i; } }); return best; });
      await ev(() => window.__adv(2.2));   // Comet goes home
      await ev(i => CGF.debug.tap(i), far);
      for (let i = 0; i < 12; i++) { const f = path.join(OUT, `_c${i}.png`); await clipShot(f, full); files.push(f); await ev(() => window.__adv(0.08)); }
      await contact(ctx, 'motion_comet_fly', files, 4, 'Comet flying HOME → far card, 80 ms per frame (banking)');
      // match: flyer arc + comet happy loop
      const twin = await ev(i => { const cs = CGF.debug.world.cards; const k = cs[i].kind; return cs.findIndex((c, j) => j !== i && c.kind === k && c.state === 'down'); }, far);
      await ev(i => CGF.debug.tap(i), twin);
      await ev(() => window.__adv(0.2));
      files = [];
      for (let i = 0; i < 16; i++) { const f = path.join(OUT, `_m${i}.png`); await clipShot(f, full); files.push(f); await ev(() => window.__adv(0.06)); }
      await contact(ctx, 'motion_match_flyers', files, 4, 'Match → gems arc to Gizmo + Comet happy loop, 60 ms per frame');
      // comet oops close-up
      await ev(() => window.__adv(1));
      const w2 = await ev(() => window.__pair(false));
      await ev(i => CGF.debug.tap(i), w2[0]); await ev(() => window.__adv(0.6));
      await ev(i => CGF.debug.tap(i), w2[1]); await ev(() => window.__adv(0.2));
      files = [];
      for (let i = 0; i < 12; i++) {
        const cm = await ev(() => { const m = CGF.debug.world.comet; return [m.x, m.y]; });
        const f = path.join(OUT, `_o${i}.png`); await clipShot(f, await toClip(Math.max(0, cm[0] - 90), Math.max(0, cm[1] - 80), 180, 170)); files.push(f); await ev(() => window.__adv(0.05));
      }
      await contact(ctx, 'motion_comet_oops', files, 6, 'Comet oops (wrong pair), 50 ms per frame, tracking crop');
      await ctx.close();
    }

    // ================= 5. custom pictures in gameplay =================
    {
      const ctx = await b.newContext(SIZES.iphone);
      // make a test PNG (a photo-like gradient with a face) in the browser
      const tp = await ctx.newPage();
      const png = await tp.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 600; c.height = 450; const g = c.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 600, 450); gr.addColorStop(0, '#4a90d9'); gr.addColorStop(1, '#f5c26b'); g.fillStyle = gr; g.fillRect(0, 0, 600, 450);
        g.fillStyle = '#ffd9b3'; g.beginPath(); g.arc(300, 230, 150, 0, 7); g.fill();
        g.fillStyle = '#333'; g.beginPath(); g.arc(250, 200, 18, 0, 7); g.arc(350, 200, 18, 0, 7); g.fill();
        g.strokeStyle = '#c0392b'; g.lineWidth = 12; g.beginPath(); g.arc(300, 260, 70, 0.2, Math.PI - 0.2); g.stroke();
        return c.toDataURL('image/png').split(',')[1];
      });
      await tp.close();
      const pngFile = path.join(OUT, '_custom_test.png'); fs.writeFileSync(pngFile, Buffer.from(png, 'base64'));
      await open(ctx, base, '?mute=1&seed=7');
      await page.click('#btnCustomize'); await page.waitForTimeout(400);
      const slots = await page.$$('#slotGrid .slot [data-act=pick]');
      for (let i = 0; i < slots.length; i++) {
        const [fc] = await Promise.all([page.waitForEvent('filechooser'), (await page.$$('#slotGrid .slot [data-act=pick]'))[i].click()]);
        await fc.setFiles(pngFile); await page.waitForTimeout(900);
      }
      await shot('custom_screen_filled');
      await page.goto(base + '?mute=1&seed=7&autostart=1');
      await page.waitForFunction(() => CGF.debug && CGF.debug.world && CGF.debug.world.phase !== 'deal', null, { timeout: 15000 });
      await page.evaluate(HELPERS);
      await ev(() => { window.__freeze(); window.__until(() => CGF.debug.world.phase === 'peek'); window.__adv(0.4); });
      await shot('custom_peek');
      await ev(() => window.__until(() => CGF.debug.world.phase === 'playing'));
      const cp = await ev(() => { const cs = CGF.debug.world.cards; const a = cs.findIndex(c => c.kind === 'custom'); const b2 = cs.findIndex((c, j) => j !== a && c.kind === 'custom'); return [a, b2]; });
      if (cp[0] >= 0) { await ev(i => CGF.debug.tap(i), cp[0]); await ev(() => window.__adv(0.4)); await ev(i => CGF.debug.tap(i), cp[1]); await ev(() => window.__adv(0.45)); await shot('custom_match'); }
      fs.unlinkSync(pngFile);
      await ctx.close();
    }

    // ================= 6. letterbox fill: ultra-wide and very tall =================
    for (const [n, w, h, d] of [['ultrawide', 2560, 900, 1], ['ipadL', 1180, 820, 2], ['iphoneSE_L', 667, 375, 2], ['tall_phoneP', 390, 844, 3]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: d, isMobile: d > 1, hasTouch: d > 1 });
      await open(ctx, base, '?mute=1&seed=9&autostart=1&level=2&bot=1');
      await ev(() => { window.__freeze(); window.__until(() => CGF.debug.world.phase === 'playing'); window.__adv(3); });
      await page.evaluate(() => { const r = document.getElementById('rotate'); if (r) r.classList.add('hidden'); });
      await shot('box_' + n);
      await ctx.close();
    }
  } finally {
    await b.close();
    srv.kill();
  }
  console.log('captured', shotN, 'screens + contact sheets into', OUT);
})().catch(e => { console.error(e); process.exit(1); });
