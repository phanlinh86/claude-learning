// Visual QA mock-up (does not change the game): what the portrait cloud bank looks like with the proposed fix.
// BEFORE = current build; AFTER = renderer.bank() monkey-patched in the page:
//   no mirrored bank copy; instead a puffy cloud-shelf top (a row of soft circles in the bank's own top colour, plus a
//   faint lighter highlight row) rising ~44 px above scene y 0, and the 🚀 button lifted clear of it.
// Output: tests/out/visual/mock_portrait_{before,after}_<dev>_z<zone>.png
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PATCH = () => {
  const R = SC.Game.renderer, A = SC.Assets, TAU = Math.PI * 2;
  const TOP = { sunny: ['#f4f9ff', '#ffffff'], rain: ['#d9d8ea', '#ecebf6'], wind: ['#fbe9e2', '#fff6f0'], snow: ['#dfe2f6', '#f4f5ff'] };
  R.bank = function (z, alpha) {
    if (alpha <= 0) return;
    const n = A.SEASONS[z], spr = A.sprite(n + '_bank', 960, 150);
    if (!spr) return;
    if (this.SY > 0) {   // puffy shelf top instead of the mirrored copy
      const g = this.ctx, [c0, c1] = TOP[n] || TOP.sunny, x0 = -this.SX - 40, x1 = this.VW - this.SX + 40;
      const off = ((this._bankOff % 120) + 120) % 120;
      g.globalAlpha = alpha;
      g.fillStyle = c0;
      for (let x = x0 - off, i = 0; x < x1 + 120; x += 60, i++) { const r = 34 + 14 * ((i * 7) % 3) / 2; g.beginPath(); g.arc(x, 30 - r * 0.35, r, 0, TAU); g.fill(); }
      g.fillStyle = c1; g.globalAlpha = alpha * 0.7;
      for (let x = x0 - off + 30, i = 0; x < x1 + 120; x += 60, i++) { const r = 16 + 6 * (i % 2); g.beginPath(); g.arc(x, 20 - r * 0.6, r, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      g.fillStyle = c0; g.fillRect(x0, 20, x1 - x0, 30);
    }
    this.tiled(spr, 0, this._bankOff, alpha);
  };
  // 🚀: keep it above the shelf (shelf top ≈ scene y −44) with a 24 px gap
  const act = document.getElementById('btnAction'), L = R.layout;
  if (act && L.act && L.act.place === 'sky') {
    const B = L.act.w, y = R.SY - 44 - 24 - B;
    act.style.top = (parseFloat(R.canvas.style.top) + y * L.s) + 'px';
  }
};

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [nm, vw, vh] of [['p390', 390, 844], ['ipadp', 820, 1180]]) {
    for (const z of [0, 1, 3]) {
      const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      await p.goto(GAME + `?mute=1&seed=7&autostart=1&bot=1&level=${z}`);
      await p.waitForFunction(() => window.SC && SC.debug && SC.debug.mode !== 'boot');
      await sleep(4500);
      await p.evaluate(() => SC.debug.setSpeed(0));
      await sleep(100);
      await p.screenshot({ path: path.join(OUT, `mock_portrait_before_${nm}_z${z}.png`) });
      await p.evaluate(PATCH); await sleep(150);
      await p.screenshot({ path: path.join(OUT, `mock_portrait_after_${nm}_z${z}.png`) });
      console.log('  ' + nm + ' z' + z);
      await ctx.close();
    }
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
