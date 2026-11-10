// Visual QA capture: every screen at 4 sizes, the four seasons in play, crossfade + banner, the clear celebration,
// slow-motion contact sheets of the juice (cap squash, block break, star catch, pillow → sleepy, Hoot hit/tickle,
// ball lost, vine save), colour-blind brick sheets, custom pictures, the rotate card.
// Run: node tests/visual/capture.js   → tests/out/visual/*.png
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const SIZES = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  port: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
};
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);   // e.g. ONLY=bursts,cb,hoot node capture.js
const run = k => !ONLY.length || ONLY.includes(k);

async function open(b, size, q) {
  const ctx = await b.newContext(SIZES[size]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(size + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(size + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&adaptive=0&' + (q || 'seed=7'));
  await p.waitForFunction(() => window.MFB && MFB.debug && MFB.debug.mode && MFB.debug.mode !== 'boot', null, { timeout: 15000 });
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: OUT + '/' + name + '.png', clip });

// contact sheet from base64 frames
async function sheet(b, name, frames, cols) {
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  cols = cols || 4;
  const html = `<body style="margin:0;background:#222;font:14px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px">` +
    frames.map(f => `<div><img src="data:image/png;base64,${f.img}" style="width:100%;display:block"><div>${f.label}</div></div>`).join('') + '</div></body>';
  await p.setContent(html); await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '/sheet_' + name + '.png', fullPage: true });
  await p.context().close();
}
// slow motion: game speed 0.1 → 50 ms game time ≈ 500 ms real time
async function burst(b, p, name, setup, n, clipFn) {
  await p.evaluate(() => MFB.debug.setSpeed(0.1));
  await p.evaluate(setup);
  const frames = [];
  const t0 = await p.evaluate(() => MFB.debug.world.time);
  for (let i = 0; i < n; i++) {
    const clip = clipFn ? await p.evaluate(clipFn) : undefined;
    const img = (await p.screenshot({ clip })).toString('base64');
    const t = await p.evaluate(() => MFB.debug.world.time);
    frames.push({ img, label: name + ' +' + Math.round((t - t0) * 1000) + ' ms' });
    await sleep(430);
  }
  await p.evaluate(() => MFB.debug.setSpeed(1));
  await sheet(b, name, frames, 4);
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------- screens at every size ----------
  if (run('screens')) for (const size of Object.keys(SIZES)) {
    const p = await open(b, size, 'seed=7');
    await p.waitForTimeout(2500);
    await shot(p, size + '_title');
    for (const s of ['scrHow', 'scrSettings', 'scrCustom']) {
      await p.evaluate(s => MFB.UI.open(s, 'scrTitle'), s); await p.waitForTimeout(500);
      await shot(p, size + '_' + s);
      await p.evaluate(() => MFB.UI.back()); await p.waitForTimeout(200);
    }
    await p.evaluate(() => { MFB.Game._rotOk = false; MFB.debug.startGame(); });
    await p.waitForTimeout(900);
    await shot(p, size + '_play_banner');               // portrait touch → the rotate card
    if (size === 'port') {
      await p.evaluate(() => { MFB.Game._rotOk = true; MFB.Game.syncRotate(); });
      await p.waitForTimeout(600);
      await shot(p, size + '_play_upright');
    }
    await p.evaluate(() => { MFB.debug.serve(); MFB.debug.setBot(true, 1); });
    await p.waitForTimeout(2500);
    await shot(p, size + '_play');
    await p.evaluate(() => { MFB.Game.pause(); }); await p.waitForTimeout(500);
    await shot(p, size + '_pause');
    await p.evaluate(() => { MFB.Game.resume(); MFB.debug.setBot(false); MFB.debug.setSpeed(8); const w = MFB.debug.world; w.net.saves = 0; w.hearts = 1;
      window._t = setInterval(() => { MFB.debug.setPaddle(0.5); MFB.debug.serve(); }, 100); });
    await p.waitForFunction(() => MFB.debug.mode === 'over', null, { timeout: 60000 }).catch(() => errs.push(size + ' no game over'));
    await p.evaluate(() => { clearInterval(window._t); MFB.debug.setSpeed(1); });
    await p.waitForTimeout(900);
    await shot(p, size + '_over');
    await p.context().close();
  }

  // ---------- seasons, crossfade, banner, clear (desktop + phone) ----------
  if (run('seasons')) for (const size of ['desk', 'phone', 'ipad']) {
    const p = await open(b, size, 'seed=5&autostart=1&diff=easy');
    await p.waitForFunction(() => MFB.debug.mode === 'playing');
    await p.evaluate(() => { MFB.debug.serve(); MFB.debug.setBot(true, 1); });
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => MFB.debug.gotoLevel(l), lv);
      if (size === 'desk' && lv > 0) {
        await p.waitForTimeout(350); await shot(p, size + '_xfade' + lv + '_a');
        await p.waitForTimeout(350); await shot(p, size + '_xfade' + lv + '_b');
      }
      await p.waitForTimeout(1300); await shot(p, size + '_season' + lv + '_banner');
      await p.waitForTimeout(3000); await shot(p, size + '_season' + lv);
    }
    await p.evaluate(() => { MFB.debug.gotoLevel(1); });
    await p.waitForTimeout(2000);
    await p.evaluate(() => MFB.debug.clearBricks(1));
    await p.waitForFunction(() => MFB.debug.world.phase === 'clear', null, { timeout: 30000 }).catch(() => errs.push('no clear'));
    await p.waitForTimeout(150); await shot(p, size + '_clear_a');
    await p.waitForTimeout(700); await shot(p, size + '_clear_b');
    await p.waitForTimeout(1500); await shot(p, size + '_clear_c');
    await p.context().close();
  }

  // ---------- motion bursts (desktop) ----------
  if (run('bursts')) {
    const p = await open(b, 'desk', 'seed=9&autostart=1&diff=easy');
    await p.waitForFunction(() => MFB.debug.mode === 'playing');
    await p.evaluate(() => { MFB.debug.setBot(false); MFB.debug.setPaddle(8); MFB.debug.serve(); });
    await p.waitForTimeout(3200);   // let the season banner finish first
    const around = (wx, wy, ww, wh) => `(() => { const R = MFB.Game.renderer, r = R.canvas.getBoundingClientRect(), s = r.width / R.VW;
      const x = r.left + R.sx(${wx}) * s, y = r.top + R.sy(${wy}) * s, u = R.unit * s; return { x: Math.max(0, x - ${ww / 2} * u), y: Math.max(0, y - ${wh / 2} * u), width: ${ww} * u, height: ${wh} * u }; })()`;
    const clipAt = (wx, wy, ww, wh) => new Function('return ' + around(wx, wy, ww, wh));
    // 1 cap squash
    await burst(b, p, 'cap_squash', () => { const w = MFB.debug.world, b = w.ball, pd = w.paddle; pd.target = 8; pd.x = pd.px = 8;
      Object.assign(b, { x: 8.1, px: 8.1, y: 2.6, py: 2.6, vx: 0, vy: -6, onPaddle: false }); w.phase = 'play'; }, 8, clipAt(8, 1.6, 6, 3.4));
    // 2 block break: shoot up into the lowest brick
    await burst(b, p, 'block_break', () => { const w = MFB.debug.world, b = w.ball;
      const k = w.bricks.filter(k => k.alive && k.kind !== 'tough').sort((a, c) => a.y - c.y)[0]; window._k = k;
      w.paddle.target = 2; Object.assign(b, { x: k.x, px: k.x, y: k.y - 1.2, py: k.y - 1.2, vx: 0, vy: 6, onPaddle: false }); w.phase = 'play'; }, 10,
      () => { const R = MFB.Game.renderer, r = R.canvas.getBoundingClientRect(), s = r.width / R.VW, k = window._k, u = R.unit * s;
        return { x: Math.max(0, r.left + R.sx(k.x) * s - 3 * u), y: Math.max(0, r.top + R.sy(k.y) * s - 2 * u), width: 6 * u, height: 4 * u }; });
    // 3 star caught
    await burst(b, p, 'star_catch', () => { const w = MFB.debug.world; w.paddle.target = 8; w.paddle.x = w.paddle.px = 8; w.ball && (w.ball.y = 6, w.ball.vy = 4, w.ball.vx = 3);
      w._spawnStar(8, 2.1); }, 10, clipAt(8, 2, 6, 4));
    // 4 pillow → sleepy Mochi
    await burst(b, p, 'pillow_sleepy', () => { const w = MFB.debug.world; w.paddle.target = 8; w.paddle.x = w.paddle.px = 8; w.debugThrow();
      const pl = w.pillows[w.pillows.length - 1]; Object.assign(pl, { x: 8, px: 8, y: 3.2, py: 3.2, vx: 0, vy: -2.5, landX: 8 }); }, 14, clipAt(8, 2.2, 6, 4.4));
    // 5 Hoot hit, then tickled
    await burst(b, p, 'hoot_hit', () => { const w = MFB.debug.world, b = w.ball, s = w.boss; s.hits = 0;
      Object.assign(b, { x: s.x, px: s.x, y: s.y - 0.8, py: s.y - 0.8, vx: 0, vy: 6, onPaddle: false }); w.phase = 'play'; window._bx = s.x; }, 8,
      () => { const R = MFB.Game.renderer, r = R.canvas.getBoundingClientRect(), s = r.width / R.VW, u = R.unit * s, w = MFB.debug.world;
        return { x: Math.max(0, r.left + R.sx(window._bx) * s - 3 * u), y: Math.max(0, r.top + R.sy(8.6) * s), width: 6 * u, height: 3.6 * u }; });
    await burst(b, p, 'hoot_tickle', () => { const w = MFB.debug.world, b = w.ball, s = w.boss; s.hits = 2; w.debugClear(0); w.combo = 0; s.state = 'float';
      Object.assign(b, { x: s.x, px: s.x, y: s.y - 0.8, py: s.y - 0.8, vx: 0, vy: 6, onPaddle: false }); w.phase = 'play'; window._bx = s.x; }, 10,
      () => { const R = MFB.Game.renderer, r = R.canvas.getBoundingClientRect(), s = r.width / R.VW, u = R.unit * s;
        return { x: Math.max(0, r.left + R.sx(window._bx) * s - 3.5 * u), y: Math.max(0, r.top + R.sy(8.6) * s), width: 7 * u, height: 4 * u }; });
    // 6 vine save (easy, saves left)
    await burst(b, p, 'vine_save', () => { const w = MFB.debug.world, b = w.ball; w.net.saves = 2; w.paddle.target = 14; w.paddle.x = w.paddle.px = 14;
      Object.assign(b, { x: 4, px: 4, y: 1.6, py: 1.6, vx: 0.5, vy: -6, onPaddle: false }); w.phase = 'play'; }, 8, clipAt(4.5, 1.4, 8, 3.2));
    // 7 ball lost (no saves)
    await burst(b, p, 'ball_lost', () => { const w = MFB.debug.world, b = w.ball; w.net.saves = 0; w.hearts = 3; w.paddle.target = 14;
      Object.assign(b, { x: 4, px: 4, y: 1.4, py: 1.4, vx: 0.5, vy: -6, onPaddle: false }); w.phase = 'play'; }, 10);
    await p.context().close();
  }

  // ---------- HUD crops for each season at phone + desk ----------
  if (run('hud')) for (const size of ['desk', 'phone', 'port']) {
    const p = await open(b, size, 'seed=4&autostart=1&diff=easy');
    await p.evaluate(() => { MFB.Game._rotOk = true; MFB.Game.syncRotate(); MFB.debug.serve(); MFB.debug.setBot(true, 1); });
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { MFB.debug.gotoLevel(l); const w = MFB.debug.world; w.score = 12340; w.starCount = 7; w.hearts = 5; }, lv);
      await p.waitForTimeout(3200);
      const vp = SIZES[size].viewport;
      await shot(p, size + '_hud' + lv, { x: 0, y: 0, width: vp.width, height: Math.round(vp.height * (size === 'port' ? 0.5 : 0.3)) });
    }
    await p.context().close();
  }

  // ---------- Hoot vs the HUD at both ends of his drift ----------
  if (run('hoot')) for (const size of ['desk', 'phone', 'ipad']) {
    const p = await open(b, size, 'seed=4&autostart=1&diff=easy');
    await p.evaluate(() => { MFB.debug.serve(); MFB.debug.setBot(true, 1); });
    await p.waitForTimeout(3000);
    for (const x of [2, 14]) {
      await p.evaluate(x => { const w = MFB.debug.world; w.score = 123450; w.hearts = 5; w.boss.x = w.boss.px = x; MFB.debug.setSpeed(0.0001); }, x);
      await p.waitForTimeout(300);
      const vp = SIZES[size].viewport;
      await shot(p, size + '_hoot_x' + x, { x: 0, y: 0, width: vp.width, height: Math.round(vp.height * 0.3) });
      await p.evaluate(() => MFB.debug.setSpeed(1));
    }
    await p.context().close();
  }

  // ---------- colour-blind brick sheet ----------
  if (run('cb')) {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    const base = 'file://' + path.resolve(__dirname, '../../game/assets/default/bricks') + '/';
    const rows = ['spring', 'summer', 'autumn', 'winter'].map(s => [s, s + '_tough', s + '_crack', 'star']);
    const cell = f => `<img src="${base}${f}.svg" style="width:140px;height:50px;margin:4px">`;
    const grid = filt => `<div style="filter:${filt};display:inline-block;padding:8px;background:linear-gradient(#b8dcef,#fce9ee)">` + rows.map(r => '<div>' + r.map(cell).join('') + '</div>').join('') + '</div>';
    const tmp = path.resolve(__dirname, '../out/visual/_cb.html');
    fs.writeFileSync(tmp, `<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <svg width="0" height="0"><filter id="deut"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter>
      <filter id="prot"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter></svg>
      <div>normal (bud / tough / cracked / star)</div>${grid('none')}<div>deuteranopia</div>${grid('url(#deut)')}<div>greyscale</div>${grid('grayscale(1)')}</body>`);
    await p.goto('file://' + tmp);
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + '/cb_bricks.png', fullPage: true });
    // in-game: each season frame through the filters
    await p.context().close();
    const g = await open(b, 'desk', 'seed=4&autostart=1&diff=hard&level=4');
    await g.evaluate(() => MFB.debug.gotoLevel(4)); // round 2 → more tough blocks
    for (const lv of [4, 5, 6, 7]) {
      await g.evaluate(l => MFB.debug.gotoLevel(l), lv); await g.waitForTimeout(2200);
      for (const [n, f] of [['norm', 'none'], ['deut', 'url(#deutx)'], ['grey', 'grayscale(1)']]) {
        await g.evaluate(f => { if (!document.getElementById('deutsvg')) document.body.insertAdjacentHTML('beforeend', '<svg id="deutsvg" width="0" height="0" style="position:absolute"><filter id="deutx"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>');
          document.getElementById('game').style.filter = f; }, f);
        await g.waitForTimeout(150);
        await shot(g, 'cb_season' + (lv - 4) + '_' + n, { x: 0, y: 0, width: 1280, height: 470 });
      }
      await g.evaluate(() => { document.getElementById('game').style.filter = ''; });
    }
    await g.context().close();
  }

  // ---------- custom pictures ----------
  if (run('custom')) for (const size of ['desk', 'phone']) {
    const p = await open(b, size, 'seed=6');
    await p.evaluate(async () => {
      const mk = (w, h, draw) => new Promise(res => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); c.toBlob(bl => res(new File([bl], 'x.png', { type: 'image/png' })), 'image/png'); });
      // opaque "photo" of a pet (busy) for the hero
      const hero = await mk(400, 300, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c86'); gr.addColorStop(1, '#353'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#eee'; g.beginPath(); g.arc(200, 160, 100, 0, 7); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(165, 140, 14, 0, 7); g.arc(235, 140, 14, 0, 7); g.fill(); g.fillRect(185, 190, 30, 10); });
      // transparent cut-out ball
      const ball = await mk(200, 200, (g) => { g.fillStyle = '#e33'; g.beginPath(); g.arc(100, 100, 80, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(20, 92, 160, 16); });
      // very tall star
      const star = await mk(120, 360, (g) => { g.fillStyle = '#39f'; g.fillRect(20, 0, 80, 360); });
      // busy background photo
      const bg = await mk(1600, 900, (g, w, h) => { for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i * 13) % 50}%)`; g.fillRect((i * 97) % w, (i * 53) % h, 120, 90); } });
      for (const [s, f] of [['hero', hero], ['ball', ball], ['star', star], ['bg_spring', bg], ['bg_winter', bg]]) await MFB.UI.applyFile(s, f);
    });
    await p.evaluate(() => MFB.UI.open('scrCustom', 'scrTitle')); await p.waitForTimeout(700);
    await shot(p, size + '_custom_screen');
    await p.evaluate(() => MFB.UI.back());
    await p.evaluate(() => { MFB.debug.startGame(); }); await p.waitForTimeout(1000);
    await p.evaluate(() => { MFB.debug.serve(); MFB.debug.setBot(true, 1); const w = MFB.debug.world; w._spawnStar(6, 3); w._spawnStar(10, 5); });
    await p.waitForTimeout(1200); await shot(p, size + '_custom_play');
    await p.evaluate(() => MFB.debug.gotoLevel(3)); await p.waitForTimeout(3500);
    await shot(p, size + '_custom_winter');
    await p.context().close();
  }

  await b.close();
  fs.writeFileSync(OUT + '/errors.txt', errs.join('\n'));
  console.log('done; errors: ' + errs.length + (errs.length ? '\n' + errs.join('\n') : ''));
})();
