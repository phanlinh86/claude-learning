// Magnet pickup + field, escape, and box-full → cleared contact sheets (4 columns, half size). Output tests/out/visual/m_*2.png
const { chromium } = require('playwright'); const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html'), OUT = path.resolve(__dirname, '../out/visual');
const MK = `(kind,x,y,color)=>({ id: Math.random()*1e6|0, kind, color: color||0, x, y, vx: 0, vy: 0, r: 30, wob: 0, squish: 0, rot: 0, spin: 0, vent: 0, state: 'rise', t: 1, alpha: 1, _px: x, _py: y, _R: 30, _sw: 0, _evx: 0, _puff: 1, _k: 1.2, _vR: 45 })`;
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  async function run(name, lv, setup, n, dt, cols, clip) {
    const p = await b.newPage({ viewport: { width: 960, height: 540 } });
    await p.goto(GAME + '?mute=1&seed=7&autostart=1&level=' + lv); await p.waitForFunction(() => MP.debug && MP.debug.mode === 'playing');
    await p.evaluate(({ setup, MK }) => { const G = MP.Game, w = G.world; MP.debug.setSpeed(0); window.adv = s => { for (let i = Math.round(s * 120); i-- > 0;) { G.step(1 / 120); G.renderer.update(1 / 120); } };
      adv(2); w._nextSpawn = 1e9; w._nextPebble = 1e9; w.items.length = 0; G.renderer.texts.length = 0; G.renderer.fx.length = 0; const M = eval(MK); new Function('G', 'w', 'M', setup)(G, w, M); }, { setup, MK });
    const imgs = [];
    for (let i = 0; i < n; i++) { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      imgs.push('data:image/png;base64,' + (await p.screenshot({ clip })).toString('base64')); await p.evaluate(dt => adv(dt), dt); }
    const cw = clip.width / 2, ch = clip.height / 2;
    const pg = await b.newPage({ viewport: { width: cols * cw, height: Math.ceil(n / cols) * (ch + 14) } });
    await pg.setContent('<body style="margin:0;display:flex;flex-wrap:wrap;background:#222;color:#fff;font:10px sans-serif">' + imgs.map((s, i) => `<div><img src="${s}" style="width:${cw}px;height:${ch}px;display:block">${Math.round(i * dt * 1000)}ms</div>`).join('') + '</body>');
    await pg.waitForTimeout(200); await pg.screenshot({ path: OUT + '/' + name + '.png' }); await pg.close(); await p.close(); console.log(name);
  }
  const full = { x: 0, y: 0, width: 960, height: 540 };
  await run('m_magnet2', 0, `w.hog.x=w.hog._px=w.hog.board.x=w.hog.board._px=400; w.items.push(M('magnet',430,440), M('cupcake',700,300,0), M('cupcake',200,250,1), M('cupcake',560,160,2), M('cupcake',850,380,1));`, 16, 0.12, 4, full);
  await run('m_magnet_noon', 1, `w.hog.x=w.hog._px=w.hog.board.x=w.hog.board._px=400; w.items.push(M('magnet',430,440), M('cupcake',700,300,0), M('cupcake',200,250,1), M('cupcake',560,160,2));`, 4, 0.5, 4, full);
  await run('m_escape2', 3, `w.hog.x=w.hog._px=w.hog.board.x=w.hog.board._px=100; w.combo=5; w.items.push(M('cupcake',600,140,0), M('magnet',760,170));`, 16, 0.08, 4, { x: 440, y: 0, width: 480, height: 300 });
  await run('m_boxfull2', 2, `w.hearts=2; w.box=w.boxTarget-1; w.hog.x=w.hog._px=w.hog.board.x=w.hog.board._px=480; w.items.push(M('cupcake',470,440,0), M('cupcake',700,250,1)); const pb=w._newPebble(300); w.items.push(pb);`, 20, 0.25, 4, full);
  await b.close();
})();
