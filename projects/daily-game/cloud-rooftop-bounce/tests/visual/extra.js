// Visual QA extras (round 2): pearl lost (magnet off, no net), close-up sparkle / chip colours, the HUD vs the top
// brick row in every zone at desktop 16:9, popups stacking over the stuck pearl, iPad portrait rotate card.
// Run: node tests/visual/extra.js   → tests/out/visual/x_*.png
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve(), b = await chromium.launch();
  const open = async (vp, q, extra) => {
    const ctx = await b.newContext(Object.assign({ viewport: vp, deviceScaleFactor: 1 }, extra || {}));
    const p = await ctx.newPage();
    await p.goto(srv.url + '?mute=1&adaptive=0&' + q);
    await p.waitForFunction(() => window.WRB && WRB.debug && WRB.debug.mode && WRB.debug.mode !== 'boot');
    return p;
  };
  const clipAt = (p, x, y, w, h) => p.evaluate(([x, y, w, h]) => { const R = WRB.Game.renderer, r = R.canvas.getBoundingClientRect(), k = r.width / R.VW;
    return { x: Math.max(0, r.left + (R.sx(x) - w / 2 * R.unit) * k), y: Math.max(0, r.top + (R.sy(y) - h / 2 * R.unit) * k), width: w * R.unit * k, height: h * R.unit * k }; }, [x, y, w, h]);
  async function sheet(name, frames) {
    const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    await p.setContent(`<body style="margin:0;background:#222;font:14px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px">` +
      frames.map(f => `<div><img src="data:image/png;base64,${f.img}" style="width:100%;display:block"><div>${f.label}</div></div>`).join('') + '</div></body>');
    await p.waitForTimeout(200); await p.screenshot({ path: OUT + '/x_sheet_' + name + '.png', fullPage: true }); await p.context().close();
  }
  async function burst(p, name, setup, n, clip) {
    await p.evaluate(() => WRB.debug.setSpeed(0.1)); await p.evaluate(setup);
    const frames = [];
    for (let i = 0; i < n; i++) { frames.push({ img: (await p.screenshot({ clip })).toString('base64'), label: name + ' ' + i }); await sleep(430); }
    await p.evaluate(() => WRB.debug.setSpeed(1)); await sheet(name, frames);
  }

  // pearl lost: magnet off, net empty, Wisp far away (Normal: 1 net save, spend it first)
  let p = await open({ width: 1280, height: 720 }, 'seed=9&autostart=1&diff=hard', { deviceScaleFactor: 2 });
  await p.waitForTimeout(3000); await p.evaluate(() => WRB.debug.serve()); await p.waitForTimeout(300);
  await burst(p, 'pearl_lost', () => { const w = WRB.debug.world; w.magnet.t = 0; w.net.saves = 0; w.paddle.target = 14; w.paddle.x = w.paddle.px = 14;
    const b = w.ball; b.onPaddle = false; b.stuck = false; b.x = b.px = 3; b.y = b.py = 1.6; b.vx = 0; b.vy = -5; }, 12, await clipAt(p, 5, 1.8, 10, 4.5));
  // close-up: gem catch + block break at 2x
  await burst(p, 'gem_close', () => { const w = WRB.debug.world; w.paddle.target = 8; w.paddle.x = w.paddle.px = 8; WRB.debug.drop('gem'); const g = w.gems[w.gems.length - 1]; g.x = g.px = 8.3; g.y = g.py = 2.6; }, 8, await clipAt(p, 8, 2.2, 4, 2.6));
  await burst(p, 'break_close', () => { const w = WRB.debug.world, br = w.bricks.filter(q => q.alive).sort((a, c) => a.y - c.y)[0]; const b = w.ball; b.onPaddle = false; b.stuck = false; b.x = b.px = br.x; b.y = b.py = br.y - 0.8; b.vx = 0; b.vy = 6; window._br = [br.x, br.y]; }, 8,
    await p.evaluate(() => { const w = WRB.debug.world, br = w.bricks.filter(q => q.alive).sort((a, c) => a.y - c.y)[0]; return [br.x, br.y]; }).then(([x, y]) => clipAt(p, x, y - 0.3, 4, 2.6)));
  await p.context().close();

  // HUD vs top row: each zone, desktop + iPad landscape + phone, crop of the top band
  for (const [nm, vp, ex] of [['desk', { width: 1280, height: 720 }, {}], ['ipad', { width: 1024, height: 768 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['phone', { width: 844, height: 390 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 3 }]]) {
    p = await open(vp, 'seed=4&autostart=1&diff=hard', ex);
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { WRB.debug.gotoLevel(l); WRB.debug.world.score = 12340; WRB.debug.world.hearts = 5; }, lv);
      await p.waitForTimeout(2900);
      const r = await p.evaluate(() => { const R = WRB.Game.renderer, c = R.canvas.getBoundingClientRect(); return { top: c.top + (R.sy(8.6)) * c.width / R.VW, k: c.width / R.VW, h: c.height }; });
      await p.screenshot({ path: OUT + '/x_top_' + nm + lv + '.png', clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, Math.max(140, (await p.evaluate(() => { const R = WRB.Game.renderer, c = R.canvas.getBoundingClientRect(); return c.top + R.sy(6.8) * c.width / R.VW; })))) } });
    }
    await p.context().close();
  }

  // iPad portrait: the rotate card on an iPad (DESIGN says portrait iPads play letterboxed)
  p = await open({ width: 768, height: 1024 }, 'seed=4', { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await p.evaluate(() => WRB.debug.startGame()); await p.waitForTimeout(900);
  const rot = await p.evaluate(() => !document.getElementById('rotate').classList.contains('hidden'));
  await p.screenshot({ path: OUT + '/x_ipadp_start.png' });
  console.log('iPad portrait rotate card shown:', rot);
  await p.context().close();

  // a second magnet while one is active: popup stacking
  p = await open({ width: 1280, height: 720 }, 'seed=9&autostart=1&diff=easy');
  await p.waitForTimeout(3000); await p.evaluate(() => WRB.debug.serve());
  await p.evaluate(() => { const w = WRB.debug.world; w.paddle.target = 8; w.paddle.x = w.paddle.px = 8; WRB.debug.giveMagnet(); });
  await p.waitForTimeout(250);
  await p.evaluate(() => { WRB.debug.giveMagnet(); const w = WRB.debug.world, b = w.ball; b.onPaddle = false; b.stuck = false; b.x = b.px = 8.6; b.y = b.py = 2.0; b.vx = 0; b.vy = -4; });
  await p.waitForTimeout(350);
  await p.screenshot({ path: OUT + '/x_magnet_twice.png', clip: await clipAt(p, 8, 3, 10, 5.5) });
  await p.context().close();

  await b.close(); srv.close(); console.log('done');
})();
