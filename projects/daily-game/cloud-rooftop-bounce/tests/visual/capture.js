// Visual QA capture: every screen at 5 sizes, the four zones in play, the descend transition, the magnet (field,
// ring timer, gem pull streaks, a stuck pearl with the aim guide), slow-motion contact sheets of the juice
// (Wisp squash, block break, gem catch, magnet get, stick → release, pearl lost, net save), HUD crops, colour-blind
// brick sheets, custom pictures, the rotate card.
// Run: node tests/visual/capture.js   → tests/out/visual/*.png     (ONLY=screens,zones,magnet,bursts,hud,cb,custom)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const SIZES = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  pro: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  ipadp: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  port: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
};
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const run = k => !ONLY.length || ONLY.includes(k);
let GAME = '';

async function open(b, size, q) {
  const ctx = await b.newContext(SIZES[size]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(size + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(size + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&adaptive=0&' + (q || 'seed=7'));
  await p.waitForFunction(() => window.WRB && WRB.debug && WRB.debug.mode && WRB.debug.mode !== 'boot', null, { timeout: 15000 });
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: OUT + '/' + name + '.png', clip });
async function sheet(b, name, frames, cols) {
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const html = `<body style="margin:0;background:#222;font:14px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(${cols || 4},1fr);gap:4px;padding:4px">` +
    frames.map(f => `<div><img src="data:image/png;base64,${f.img}" style="width:100%;display:block"><div>${f.label}</div></div>`).join('') + '</div></body>';
  await p.setContent(html); await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '/sheet_' + name + '.png', fullPage: true });
  await p.context().close();
}
// slow motion: game speed 0.1 → ~43 ms game time per frame
async function burst(b, p, name, setup, n, clipFn) {
  await p.evaluate(() => WRB.debug.setSpeed(0.1));
  await p.evaluate(setup);
  const frames = [];
  const t0 = await p.evaluate(() => WRB.debug.world.time);
  for (let i = 0; i < n; i++) {
    const clip = clipFn ? await p.evaluate(clipFn) : undefined;
    const img = (await p.screenshot({ clip })).toString('base64');
    const t = await p.evaluate(() => WRB.debug.world.time);
    frames.push({ img, label: name + ' +' + Math.round((t - t0) * 1000) + ' ms' });
    await sleep(430);
  }
  await p.evaluate(() => WRB.debug.setSpeed(1));
  await sheet(b, name, frames, 4);
}
// a clip around world point (x, y) of w × h units, in CSS px
const clipAt = (x, y, w, h) => new Function(`const R = WRB.Game.renderer, r = R.canvas.getBoundingClientRect(), k = r.width / R.VW;
  return { x: Math.max(0, r.left + (R.sx(${x}) - ${w / 2} * R.unit) * k), y: Math.max(0, r.top + (R.sy(${y}) - ${h / 2} * R.unit) * k), width: ${w} * R.unit * k, height: ${h} * R.unit * k };`);
const stickPearl = off => `(() => { const w = WRB.debug.world; WRB.debug.giveMagnet(); if (w.phase === 'serve') w.serve(); const b = w.ball; b.x = b.px = w.paddle.x + ${off}; b.y = b.py = 2.3; b.vx = 0; b.vy = -4; })()`;

(async () => {
  const srv = await serve(); GAME = srv.url;
  const b = await chromium.launch();

  // ---------- screens at every size ----------
  if (run('screens')) for (const size of Object.keys(SIZES)) {
    const p = await open(b, size, 'seed=7');
    await p.waitForTimeout(2500);
    await shot(p, size + '_title');
    for (const s of ['scrHow', 'scrSettings', 'scrCustom']) {
      await p.evaluate(s => WRB.UI.open(s, 'scrTitle'), s); await p.waitForTimeout(500);
      await shot(p, size + '_' + s);
      await p.evaluate(() => WRB.UI.back()); await p.waitForTimeout(200);
    }
    await p.evaluate(() => { WRB.Game._rotOk = false; WRB.debug.startGame(); });
    await p.waitForTimeout(900);
    await shot(p, size + '_play_banner');
    if (size === 'port') { await p.evaluate(() => { WRB.Game._rotOk = true; WRB.Game.syncRotate(); }); await p.waitForTimeout(600); await shot(p, size + '_play_upright'); }
    await p.evaluate(() => { WRB.debug.serve(); WRB.debug.setBot(true, 1); });
    await p.waitForTimeout(2500);
    await shot(p, size + '_play');
    await p.evaluate(() => { WRB.debug.setBot(false); }); await p.evaluate(stickPearl(0.8));
    await p.waitForTimeout(500);
    await shot(p, size + '_magnet_stuck');
    await p.evaluate(() => WRB.Game.pause()); await p.waitForTimeout(500);
    await shot(p, size + '_pause');
    await p.evaluate(() => { WRB.Game.resume(); WRB.debug.setBot(false); WRB.debug.setSpeed(8); const w = WRB.debug.world; w.magnet.t = 0; w.net.saves = 0; w.hearts = 1;
      window._t = setInterval(() => { WRB.debug.setPaddle(0.5); WRB.debug.serve(); }, 100); });
    await p.waitForFunction(() => WRB.debug.mode === 'over', null, { timeout: 60000 }).catch(() => errs.push(size + ' no game over'));
    await p.evaluate(() => { clearInterval(window._t); WRB.debug.setSpeed(1); });
    await p.waitForTimeout(900);
    await shot(p, size + '_over');
    await p.context().close();
  }

  // ---------- zones, banner, the descend transition ----------
  if (run('zones')) for (const size of ['desk', 'phone', 'ipad', 'ipadp']) {
    const p = await open(b, size, 'seed=5&autostart=1&diff=easy');
    await p.evaluate(() => { WRB.Game._rotOk = true; });
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => WRB.debug.gotoLevel(l), lv);
      await p.waitForTimeout(1300); await shot(p, size + '_zone' + lv + '_banner');
      await p.evaluate(() => { WRB.debug.serve(); WRB.debug.setBot(true, 1); });
      await p.waitForTimeout(2500); await shot(p, size + '_zone' + lv);
      await p.evaluate(() => WRB.debug.setBot(false));
    }
    // descend: clear the last block with the bot, then frames through the 2.3 s transition
    await p.evaluate(() => { WRB.debug.gotoLevel(0); });
    await p.waitForTimeout(400);
    await p.evaluate(() => { WRB.debug.clearBricks(1); WRB.debug.serve(); WRB.debug.setBot(true, 1); WRB.debug.setSpeed(3); });
    await p.waitForFunction(() => WRB.debug.world.phase === 'clear', null, { timeout: 60000 }).catch(() => errs.push(size + ' no clear'));
    await p.evaluate(() => WRB.debug.setSpeed(0.25));
    const frames = [];
    for (let i = 0; i < 8; i++) { frames.push({ img: (await p.screenshot()).toString('base64'), label: 'descend t=' + (await p.evaluate(() => WRB.Game.renderer.vis.t.toFixed(2))) }); await sleep(1100); }
    await sheet(b, size + '_descend', frames, 4);
    await p.evaluate(() => WRB.debug.setSpeed(1));
    await p.context().close();
  }

  // ---------- the magnet ----------
  if (run('magnet')) for (const size of ['desk', 'phone']) {
    const p = await open(b, size, 'seed=8&autostart=1&diff=easy');
    await p.waitForTimeout(2800);
    await p.evaluate(() => { const w = WRB.debug.world; WRB.debug.serve(); WRB.debug.giveMagnet(); w.ball.x = w.ball.px = 14; w.ball.y = w.ball.py = 7.5; w.ball.vx = 0; w.ball.vy = 0.01;
      for (const [x, y] of [[3, 4.5], [5, 5.5], [12, 4], [10, 6]]) { WRB.debug.drop('gem'); const g = w.gems[w.gems.length - 1]; g.x = g.px = x; g.y = g.py = y; }
      WRB.debug.drop('magnet'); const m = w.powerups[w.powerups.length - 1]; m.x = m.px = 13; m.y = m.py = 5; WRB.debug.setSpeed(0.3); });
    await p.waitForTimeout(1200); await shot(p, size + '_magnet_pull');
    await p.evaluate(() => WRB.debug.setSpeed(1));
    await p.evaluate(stickPearl(-1.0)); await p.waitForTimeout(400); await shot(p, size + '_magnet_aim_left');
    await p.evaluate(() => { WRB.debug.world.magnet.t = 1.6; WRB.debug.world.ball.stuckT = 9; }); await p.waitForTimeout(200); await shot(p, size + '_magnet_warn');
    await p.context().close();
  }

  // ---------- slow-motion bursts ----------
  if (run('bursts')) {
    const p = await open(b, 'desk', 'seed=9&autostart=1&diff=easy');
    await p.waitForTimeout(3200);
    await p.evaluate(() => WRB.debug.serve());
    await burst(b, p, 'wisp_squash', () => { const w = WRB.debug.world; w.paddle.target = 8; w.paddle.x = w.paddle.px = 8; const b = w.ball; b.x = b.px = 8.4; b.y = b.py = 2.6; b.vx = 0; b.vy = -6; }, 12, clipAt(8, 1.4, 6, 3));
    await burst(b, p, 'block_break', () => { const w = WRB.debug.world, br = w.bricks.filter(q => q.alive).sort((a, c) => a.y - c.y)[0]; const b = w.ball; b.x = b.px = br.x; b.y = b.py = br.y - 1; b.vx = 0; b.vy = 6; window._bx = br.x; window._by = br.y; }, 12, clipAt(8, 5, 16, 5));
    await burst(b, p, 'gem_catch', () => { const w = WRB.debug.world; w.paddle.target = 8; w.paddle.x = w.paddle.px = 8; w.ball && (w.ball.y = 7, w.ball.vy = 4, w.ball.vx = 3); WRB.debug.drop('gem'); const g = w.gems[w.gems.length - 1]; g.x = g.px = 8.3; g.y = g.py = 3.2; }, 12, clipAt(8, 2, 6, 4));
    await burst(b, p, 'magnet_get', () => { const w = WRB.debug.world; w.magnet.t = 0; w.paddle.target = 8; w.paddle.x = w.paddle.px = 8; WRB.debug.drop('magnet'); const m = w.powerups[w.powerups.length - 1]; m.x = m.px = 8; m.y = m.py = 2.8; }, 14, clipAt(8, 2.2, 8, 4.4));
    await burst(b, p, 'stick_release', () => { const w = WRB.debug.world; WRB.debug.giveMagnet(); const b = w.ball; b.x = b.px = w.paddle.x + 0.6; b.y = b.py = 2.3; b.vx = 0; b.vy = -5; setTimeout(() => WRB.debug.serve(), 3000); }, 14, clipAt(8, 2.5, 8, 5));
    await burst(b, p, 'pearl_lost', () => { const w = WRB.debug.world; w.magnet.t = 0; w.net.saves = 0; w.paddle.target = 14; const b = w.ball; if (!b) return; b.x = b.px = 2; b.y = b.py = 1; b.vx = 0; b.vy = -6; }, 10, clipAt(4, 1.5, 8, 4));
    await p.evaluate(() => WRB.debug.startGame()); await p.waitForTimeout(300); await p.evaluate(() => WRB.debug.serve());
    await burst(b, p, 'net_save', () => { const w = WRB.debug.world; w.paddle.target = 14; const b = w.ball; b.x = b.px = 2; b.y = b.py = 1; b.vx = 0; b.vy = -6; }, 10, clipAt(4, 1.5, 8, 4));
    await p.context().close();
  }

  // ---------- HUD crops ----------
  if (run('hud')) for (const size of ['desk', 'phone', 'port']) {
    const p = await open(b, size, 'seed=4&autostart=1&diff=easy');
    await p.evaluate(() => { WRB.Game._rotOk = true; WRB.Game.syncRotate(); });
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { WRB.debug.gotoLevel(l); const w = WRB.debug.world; w.score = 12340; w.gemCount = 7; w.hearts = 5; WRB.debug.giveMagnet(); }, lv);
      await p.waitForTimeout(2800);
      const vw = SIZES[size].viewport;
      await shot(p, size + '_hud' + lv, { x: 0, y: 0, width: Math.min(vw.width, 520), height: Math.min(vw.height, 140) });
    }
    await p.context().close();
  }

  // ---------- colour-blind brick sheet ----------
  if (run('cb')) {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    const base = GAME.replace('index.html', 'assets/default/bricks/');
    const rows = ['cloud', 'spires', 'gardens', 'lanes'].map(s => [s, s + '_tough', s + '_crack', 'gem', 'magnet']);
    const cell = f => `<img src="${base}${f}.svg" style="width:140px;height:50px;margin:4px">`;
    const grid = filt => `<div style="filter:${filt};display:inline-block;padding:8px;background:linear-gradient(#141a4a,#3b3f86)">` + rows.map(r => '<div>' + r.map(cell).join('') + '</div>').join('') + '</div>';
    await p.goto(GAME.replace('index.html', 'manifest.webmanifest'));
    await p.setContent(`<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <svg width="0" height="0"><filter id="prot"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter><filter id="deut"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>
      <div>normal (block / tough / cracked / gem / magnet)</div>${grid('none')}<div>deuteranopia</div>${grid('url(#deut)')}<div>protanopia</div>${grid('url(#prot)')}<div>greyscale</div>${grid('grayscale(1)')}</body>`);
    await p.waitForTimeout(800);
    await p.screenshot({ path: OUT + '/cb_bricks.png', fullPage: true });
    await p.context().close();
    const g = await open(b, 'desk', 'seed=4&autostart=1&diff=hard&level=4');
    for (const lv of [4, 5, 6, 7]) {
      await g.evaluate(l => WRB.debug.gotoLevel(l), lv); await g.waitForTimeout(2600);
      for (const [n, f] of [['norm', 'none'], ['deut', 'url(#deutx)'], ['prot', 'url(#protx)'], ['grey', 'grayscale(1)']]) {
        await g.evaluate(f => { if (!document.getElementById('deutsvg')) document.body.insertAdjacentHTML('beforeend', '<svg id="deutsvg" width="0" height="0" style="position:absolute"><filter id="protx"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter><filter id="deutx"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>');
          document.getElementById('game').style.filter = f; }, f);
        await g.waitForTimeout(150);
        await shot(g, 'cb_zone' + (lv - 4) + '_' + n, { x: 0, y: 0, width: 1280, height: 470 });
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
      const hero = await mk(400, 300, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c86'); gr.addColorStop(1, '#353'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#eee'; g.beginPath(); g.arc(200, 160, 100, 0, 7); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(165, 140, 14, 0, 7); g.arc(235, 140, 14, 0, 7); g.fill(); g.fillRect(185, 190, 30, 10); });
      const ball = await mk(200, 200, (g) => { g.fillStyle = '#e33'; g.beginPath(); g.arc(100, 100, 80, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(20, 92, 160, 16); });
      const gem = await mk(120, 360, (g) => { g.fillStyle = '#39f'; g.fillRect(20, 0, 80, 360); });
      const bg = await mk(1600, 900, (g, w, h) => { for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i * 13) % 50}%)`; g.fillRect((i * 97) % w, (i * 53) % h, 120, 90); } });
      for (const [s, f] of [['hero', hero], ['ball', ball], ['gem', gem], ['bg_cloud', bg], ['bg_lanes', bg]]) await WRB.UI.applyFile(s, f);
    });
    await p.evaluate(() => WRB.UI.open('scrCustom', 'scrTitle')); await p.waitForTimeout(700);
    await shot(p, size + '_custom_screen');
    await p.evaluate(() => WRB.UI.back());
    await p.evaluate(() => { WRB.debug.startGame(); }); await p.waitForTimeout(1000);
    await p.evaluate(() => { WRB.debug.serve(); WRB.debug.setBot(true, 1); WRB.debug.drop('gem'); WRB.debug.drop('gem'); });
    await p.waitForTimeout(1200); await shot(p, size + '_custom_play');
    await p.evaluate(() => WRB.debug.gotoLevel(3)); await p.waitForTimeout(3500);
    await shot(p, size + '_custom_lanes');
    await p.context().close();
  }

  await b.close(); srv.close();
  fs.writeFileSync(OUT + '/errors.txt', errs.join('\n'));
  console.log('done; errors: ' + errs.length + (errs.length ? '\n' + errs.join('\n') : ''));
})();
