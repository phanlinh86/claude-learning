// Extra visual QA captures (round 2): longer zap / catch-popup / miss sheets, strong gust + telegraph,
// basket-on-shell check for all 4 Shelly frames facing both ways, star size vs Shelly on phones,
// the portrait cloud-bank / 🚀 button layout, and HUD at narrow widths. Output: tests/out/visual/extra_*.png
// Run: node tests/visual/extra_capture.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errs = [];
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(b, opts, q) {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.SC && SC.debug && SC.debug.mode !== 'boot', null, { timeout: 15000 });
  await p.evaluate(() => {
    const G = SC.Game;
    window.QA = {
      advance(t) { const h = 1 / 120; let n = Math.round(t / h); while (n-- > 0) { G.step(h); G.renderer.update(h); } },
      noDrops() { const w = G.world; w._nextDrop = 1e9; w._windNext = 1e9; },
      clearItems() { G.world.items.length = 0; G.renderer.fx.length = 0; G.renderer.texts.length = 0; },
      spawn(kind, x, y, vx, vy, extra) {
        const w = G.world, it = w._newItem(kind, x);
        Object.assign(it, { _A: 0, _bx: x, x, _px: x, y, _py: y, vx: vx || 0, vy: vy || 0, state: 'fall', t: 0, alpha: 1 }, extra || {});
        w.items.push(it); return it.id;
      },
      target(x) { G.renderer.pointer = [x, 400]; G._mouseFollow = true; },
      snail() { const s = G.world.snail; return { x: s.x, rimX: s.rimX, rimY: s.rimY, y: s.y }; },
      rect() { const r = document.getElementById('game').getBoundingClientRect(); const R = G.renderer; return { left: r.left, top: r.top, width: r.width, VW: R.VW, SX: R.SX, SY: R.SY }; }
    };
  });
  return { ctx, p };
}
async function clip(p, x, y, w, h) {   // scene coords → page clip
  const r = await p.evaluate(() => QA.rect()), k = r.width / r.VW;
  return { x: r.left + (x + r.SX) * k, y: r.top + (y + r.SY) * k, width: w * k, height: h * k };
}
async function freeze(p, level) {
  await p.evaluate(l => { SC.debug.setBot(false); SC.debug.setSpeed(1); SC.debug.gotoLevel(l); }, level);
  await sleep(2400);
  await p.evaluate(() => { SC.debug.setSpeed(0); QA.noDrops(); QA.clearItems(); });
}
async function sheet(b, name, title, imgs, dt, cols = 4) {
  const cp = await b.newPage({ viewport: { width: 1600, height: 400 } });
  await cp.setContent(`<html><body style="margin:0;background:#222;font:600 14px system-ui;color:#fff">
    <div style="padding:8px 12px;font-size:18px">${title}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">
    ${imgs.map((d, i) => `<div style="position:relative"><img style="width:100%;display:block" src="data:image/png;base64,${d.img || d}"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 5px;border-radius:4px">${d.label || ('#' + i + ' +' + Math.round(i * dt * 1000) + 'ms')}</span></div>`).join('')}
    </div></body></html>`);
  await cp.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); console.log('  ' + name);
  await cp.close();
}
async function burst(b, p, name, title, { frames = 12, dt = 0.06, region, setup }) {
  if (setup) await p.evaluate(setup);
  const imgs = [];
  for (let i = 0; i < frames; i++) {
    if (i) await p.evaluate(t => QA.advance(t), dt);
    await raf(p);
    imgs.push((await p.screenshot({ clip: await clip(p, ...region) })).toString('base64'));
  }
  await sheet(b, name, title, imgs, dt);
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const desk = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
  {
    const { ctx, p } = await open(b, desk, '&autostart=1');
    await freeze(p, 0);
    await p.evaluate(() => { QA.target(420); QA.advance(2.5); });
    const P = await p.evaluate(() => QA.snail());
    const reg = [P.rimX - 150, P.rimY - 150, 300, 260];
    await burst(b, p, 'extra_zap_long', 'Zap, full sequence (puff caught → pop, Bzzt!, Shelly zap frame, blink)', { frames: 16, dt: 0.07, region: reg,
      setup: `QA.clearItems(); SC.Game.world.snail.invuln=0; (()=>{const p=QA.snail(); QA.spawn('puff',p.rimX,p.rimY-30,0,160);})()` });
    await p.evaluate(() => QA.advance(2));
    await burst(b, p, 'extra_catch_popup', 'Catch → "+10" popup life (0.9 s)', { frames: 12, dt: 0.08, region: reg,
      setup: `QA.clearItems(); (()=>{const p=QA.snail(); QA.spawn('star',p.rimX,p.rimY-30,0,200);})()` });
    await p.evaluate(() => QA.advance(1.5));
    await burst(b, p, 'extra_gold_popup', 'Gold catch → burst + "+50" + GOLDEN STAR!', { frames: 12, dt: 0.08, region: [180, 100, 600, 420],
      setup: `QA.clearItems(); (()=>{const p=QA.snail(); QA.spawn('gold',p.rimX,p.rimY-30,0,250);})()` });
    await p.evaluate(() => QA.advance(1.5));
    await burst(b, p, 'extra_miss', 'Miss with streak 6 (bounce, fade, Streak lost)', { frames: 12, dt: 0.1, region: [560, 330, 300, 200],
      setup: `QA.clearItems(); SC.Game.world.combo=6; QA.spawn('star',720,420,10,180);` });
    // basket on shell: each frame, facing right and left, standing still and full tilt
    const imgs = [];
    for (const fr of ['idle', 'happy', 'zap', 'jet']) for (const face of [1, -1]) {
      await p.evaluate(([fr, face]) => {
        QA.clearItems(); const s = SC.Game.world.snail; s.face = face; s.frame = fr; s.tilt = 0; s.sway = 0; s.squash = 0; s.invuln = 0;
        s.rimX = s.x; s._prx = s.x; s._px = s.x; SC.Game.world._qaFrame = fr;
        // keep the frame while drawing: patch for one frame
        const R = SC.Game.renderer, orig = R.drawShelly.bind(R);
        R.drawShelly = (m) => { s.frame = fr; s.face = face; return orig(m); };
        R._qaRestore = () => { R.drawShelly = orig; };
      }, [fr, face]);
      await raf(p);
      imgs.push({ img: (await p.screenshot({ clip: await clip(p, P.x - 70, P.y - 100, 140, 150) })).toString('base64'), label: fr + (face > 0 ? ' →' : ' ←') });
      await p.evaluate(() => SC.Game.renderer._qaRestore());
    }
    await sheet(b, 'extra_basket_frames', 'Basket on the shell: 4 frames × facing right / left', imgs, 0, 4);
    await ctx.close();
  }
  // wind: telegraph + strong gust at full scene
  {
    const { ctx, p } = await open(b, desk, '&autostart=1');
    await freeze(p, 2);
    await p.evaluate(() => { QA.target(480); QA.advance(1.5); QA.clearItems(); const w = SC.Game.world; w._windNext = (w.cfg.gustWarn || 1.2) + 0.2; [200, 360, 520, 680].forEach(x => QA.spawn('star', x, 130, 0, 40)); });
    const shots = [];
    for (let i = 0; i < 12; i++) {
      if (i) await p.evaluate(() => QA.advance(0.25));
      await raf(p);
      const wd = await p.evaluate(() => { const w = SC.Game.world.wind; return 'warn ' + (w.warn || 0).toFixed(2) + ' x ' + (w.x || 0).toFixed(0); });
      shots.push({ img: (await p.screenshot()).toString('base64'), label: '+' + i * 250 + 'ms ' + wd });
    }
    await sheet(b, 'extra_gust', 'Windy Heights: gust telegraph → strong gust (full 1280×720 frame)', shots, 0.25, 3);
    await ctx.close();
  }
  // portrait: frozen frame at 390×844 showing star sizes vs Shelly + bank + 🚀
  for (const [nm, vw, vh] of [['p390', 390, 844], ['ipadp', 820, 1180], ['l844', 844, 390], ['l1024', 1024, 768]]) {
    const { ctx, p } = await open(b, { viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '&autostart=1');
    for (const z of [0, 3]) {
      await freeze(p, z);
      await p.evaluate(() => {
        QA.target(480); QA.advance(2); QA.clearItems();
        QA.spawn('star', 330, 300, 0, 0, { color: 0 }); QA.spawn('star', 420, 250, 0, 0, { color: 1 }); QA.spawn('gold', 560, 300, 0, 0); QA.spawn('puff', 640, 230, 0, 0);
        const w = SC.Game.world; [['star', 380], ['puff', 600]].forEach(([k, x]) => { const it = w._newItem(k, x); it.t = 0.45; it.alpha = 1; w.items.push(it); });
      });
      await raf(p);
      await p.screenshot({ path: path.join(OUT, `extra_frozen_${nm}_z${z}.png`) }); console.log('  extra_frozen_' + nm + '_z' + z);
    }
    await ctx.close();
  }
  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no console errors');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
