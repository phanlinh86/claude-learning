// Edge cases: Pip (size 5) at the top edge under the HUD, at the bottom edge under edge.svg, and next to the gate (depth).
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8802/index.html', OUT = __dirname + '/../out/visual/';
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base + '?mute=1&seed=42'); await page.waitForFunction(() => window.CD && CD.debug && CD.debug.mode === 'title');
  for (const lv of [0, 3]) {
    await page.evaluate(lv => { CD.debug.startGame(); if (lv) CD.debug.gotoLevel(lv); const G = CD.Game; G.speed = 0; G.bot = null;
      const adv = s => { for (let i = 0; i < s * 120; i++) G.step(1 / 120); G.renderer.update(s); G.renderer.draw(G.mode); };
      adv(1.7); const w = G.world; w.size = 5; w.pip.radius = w.pipRadiusFor(5); adv(1);
      const P = (o, x, y) => { o.x = x; o.y = y; o._px = x; o._py = y; o.vx = o.vy = 0; };
      P(w.pip, 860, 60); w.bears.forEach((bb, i) => { bb.spawnT = 1; P(bb, 200 + i * 150, 516); }); w.pip.invuln = 0;
      const g = w.gems[0]; if (g) { P(g, 820, 110); g.appear = 1; }
      window.__adv = adv; adv(0.05); }, lv);
    await page.screenshot({ path: OUT + `edge_top_bottom_l${lv}.png` });
    await page.evaluate(() => { const w = CD.Game.world, P = (o, x, y) => { o.x = x; o.y = y; o._px = x; o._py = y; }; w.pip.invuln = 9; P(w.pip, 890, 345); const bb = w.bears[0]; P(bb, 900, 280); __adv(0.05); });
    await page.screenshot({ path: OUT + `edge_gate_depth_l${lv}.png`, clip: { x: 1000, y: 260, width: 280, height: 260 } });
  }
  await b.close();
})();
