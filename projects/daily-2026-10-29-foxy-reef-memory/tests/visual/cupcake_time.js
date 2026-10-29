// Visual QA: how long does a released cupcake hover over the card tray, and does Foxy's body cross into the card columns?
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:8792/index.html?mute=1&seed=42');
  await p.waitForFunction(() => window.RF && RF.World);
  const r = await p.evaluate(() => {
    const out = [];
    for (const L of [0, 1, 2, 3]) {
      const w = new RF.World({ seed: 42 }); w.startLevel(L);
      while (w.state !== 'playing') w.update(1 / 120);
      const leftCol = Math.min(...w.cards.map(c => c.x)) - 38;
      let overT = 0, eatT = null, foxIntoCards = 0;
      const d = w.cards.filter(c => c.state === 'down');
      const by = {}; d.forEach(c => (by[c.face] = by[c.face] || []).push(c));
      // pick a pair in the rightmost column region (worst case: longest trip)
      const pair = Object.values(by).sort((a, b) => (b[0].x + b[1].x) - (a[0].x + a[1].x))[0];
      w.select(pair[0].id); w.select(pair[1].id);
      for (let t = 0; t < 12; t += 1 / 120) {
        w.update(1 / 120);
        for (const k of w.cupcakes) if (k.alive && k.x > w.tray.x && k.x < w.tray.x + w.tray.w && k.y > w.tray.y - 10 && k.y < w.tray.y + w.tray.h) { overT += 1 / 120; break; }
        const nose = w.fox.x + (w.fox.flipX > 0 ? 58 : 52);
        if (nose > leftCol) foxIntoCards = Math.max(foxIntoCards, nose - leftCol);
        if (eatT == null && w.cupcakesEaten > 0) eatT = t;
      }
      out.push({ level: L, cupcakeOverTraySec: +overT.toFixed(2), eatenAfterSec: eatT && +eatT.toFixed(2), foxNoseIntoCardColumnPx: Math.round(foxIntoCards) });
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  require('fs').writeFileSync(__dirname + '/../out/visual/cupcake_timing.json', JSON.stringify(r, null, 1));
  await b.close();
})();
