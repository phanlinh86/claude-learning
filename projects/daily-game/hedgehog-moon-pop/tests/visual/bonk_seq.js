// Pebble shadow -> bonk -> dizzy contact sheet (frames 60 ms apart from 1.2 s before the hit). Output tests/out/visual/m_bonk2.png
const { chromium } = require('playwright'); const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html'), OUT = path.resolve(__dirname, '../out/visual');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1'); await p.waitForFunction(() => MP.debug && MP.debug.mode === 'playing');
  const t = await p.evaluate(() => { const G = MP.Game, w = G.world; MP.debug.setSpeed(0); window.adv = s => { for (let i = Math.round(s * 120); i-- > 0;) { G.step(1 / 120); G.renderer.update(1 / 120); } };
    adv(2); w._nextSpawn = 1e9; w._nextPebble = 1e9; w.items.length = 0; G.renderer.texts.length = 0;
    w.hog.x = w.hog._px = w.hog.board.x = w.hog.board._px = 600; w.setTarget(600); w.hog.invuln = 0;
    const pb = w._newPebble(600); pb._A = 0; pb.x = pb._bx = 600; w._predictLand(pb); w.items.push(pb); return pb.te - w.time; });
  await p.evaluate(t => adv(Math.max(0, t - 1.2)), t);
  const imgs = [];
  for (let i = 0; i < 32; i++) { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    imgs.push('data:image/png;base64,' + (await p.screenshot({ clip: { x: 440, y: 100, width: 320, height: 440 } })).toString('base64')); await p.evaluate(() => adv(0.06)); }
  const pg = await b.newPage({ viewport: { width: 8 * 200, height: 4 * 275 } });
  await pg.setContent('<body style="margin:0;display:flex;flex-wrap:wrap">' + imgs.map(s => `<img src="${s}" style="width:200px;height:275px">`).join('') + '</body>');
  await pg.waitForTimeout(200); await pg.screenshot({ path: OUT + '/m_bonk2.png' });
  console.log('hit in', t.toFixed(2), 's'); await b.close();
})();
