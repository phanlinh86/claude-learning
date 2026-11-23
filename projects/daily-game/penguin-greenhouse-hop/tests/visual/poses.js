// Static pose probes (report-only): leaf at fixed bends on both stem sides, basket at fixed angles (chain/rim alignment).
// Output: tests/out/visual/sheet_poses_*.png    Run: node tests/visual/poses.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal&level=1');
  await p.waitForFunction(() => window.PH && PH.debug && PH.Game && PH.Game.mode === 'playing');
  await p.evaluate(() => { PH.debug.setSpeed(0); PH.debug.setBot(false); const R = PH.Game.renderer; R.banner = null; R.hintOn = false; });
  const grab = async (setup, arg) => {
    const clip = await p.evaluate(setup, arg);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    return (await p.screenshot({ clip })).toString('base64');
  };
  const frames = [];
  for (const side of [-1, 1]) for (const bend of [-0.2, 0, 0.2, 0.35]) {
    frames.push({ label: 'leaf side ' + side + ' bend ' + bend, b64: await grab(([side, bend]) => {
      const w = PH.debug.world, R = PH.Game.renderer; const y = w.camY + 4; w.platforms = []; w.fireflies = [];
      const lp = w.spawn('leaf', 6, y, { side, bend }); lp.prevBend = bend; w.hero.y = w.hero.prevY = w.camY + 20;
      const c = R.canvas.getBoundingClientRect(), s = c.width / R.VW, cam = R.cam(), u = R.unit;
      return { x: c.left + (R.sx(6) - 3 * u) * s, y: c.top + (R.sy(y, cam) - 2 * u) * s, width: 6 * u * s, height: 3.5 * u * s };
    }, [side, bend]) });
  }
  for (const ang of [-0.45, 0, 0.45]) {
    frames.push({ label: 'basket ang ' + ang, b64: await grab((ang) => {
      const w = PH.debug.world, R = PH.Game.renderer; const y = w.camY + 3; w.platforms = []; w.fireflies = [];
      const bp = w.spawn('basket', 6, y, { ang, angV: 0, len: 2.6 }); w.hero.y = w.hero.prevY = w.camY + 20;
      const c = R.canvas.getBoundingClientRect(), s = c.width / R.VW, cam = R.cam(), u = R.unit;
      return { x: c.left + (R.sx(6) - 3 * u) * s, y: c.top + (R.sy(y + 2.9, cam)) * s, width: 6 * u * s, height: 5 * u * s };
    }, ang) });
  }
  const html = '<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(4,460px);gap:4px">' +
    frames.map(f => '<div style="position:relative"><img style="width:460px;display:block" src="data:image/png;base64,' + f.b64 + '"><span style="position:absolute;left:3px;top:2px;color:#0f0;font:12px monospace;background:#000b">' + f.label + '</span></div>').join('') + '</body>';
  const q = await b.newPage({ viewport: { width: 1860, height: 300 } });
  await q.setContent(html); await q.waitForTimeout(200);
  await q.screenshot({ path: OUT + '/sheet_poses.png', fullPage: true });
  await b.close();
})();
