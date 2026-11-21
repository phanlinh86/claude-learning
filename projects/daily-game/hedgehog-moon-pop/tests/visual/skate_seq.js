// Skate push / turn contact sheet: 200×140 crop following Bristle, 50 ms apart, 2× pixels. Output tests/out/visual/m_skate2.png
const { chromium } = require('playwright'); const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html'), OUT = path.resolve(__dirname, '../out/visual');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1'); await p.waitForFunction(() => MP.debug && MP.debug.mode === 'playing');
  await p.evaluate(() => { const G = MP.Game, w = G.world; MP.debug.setSpeed(0); window.adv = s => { for (let i = Math.round(s * 120); i-- > 0;) { G.step(1 / 120); G.renderer.update(1 / 120); } };
    adv(2); w._nextSpawn = 1e9; w._nextPebble = 1e9; w.items.length = 0; G.renderer.texts.length = 0; w.hog.x = w.hog._px = w.hog.board.x = w.hog.board._px = 150; G.keys.ArrowRight = true; });
  const imgs = [];
  for (let i = 0; i < 32; i++) {
    if (i === 20) await p.evaluate(() => (MP.Game.keys.ArrowRight = false, MP.Game.keys.ArrowLeft = true));
    const x = await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(MP.Game.world.hog.x)))));
    imgs.push('data:image/png;base64,' + (await p.screenshot({ clip: { x: Math.max(0, Math.min(760, x - 100)), y: 380, width: 200, height: 130 } })).toString('base64'));
    await p.evaluate(() => adv(0.05));
  }
  const pg = await b.newPage({ viewport: { width: 8 * 200, height: 4 * 130 } });
  await pg.setContent('<body style="margin:0;display:flex;flex-wrap:wrap">' + imgs.map(s => `<img src="${s}" style="width:200px;height:130px">`).join('') + '</body>');
  await pg.waitForTimeout(200); await pg.screenshot({ path: OUT + '/m_skate2.png' }); await b.close();
})();
