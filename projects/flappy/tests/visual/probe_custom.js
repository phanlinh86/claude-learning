const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w,h] of [[1280,720],[1920,1080],[800,600],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://localhost:8772/index.html?mute=1&seed=42');
    await p.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
    await p.click('#btnCustomize'); await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const pn = document.querySelector('#scrCustom .panel'), g = document.getElementById('slotGrid');
      const can = document.getElementById('game').getBoundingClientRect(), hud = document.getElementById('hud');
      return { panel: [pn.clientWidth, pn.scrollWidth, pn.clientHeight, pn.scrollHeight], grid: [g.getBoundingClientRect().width, g.scrollWidth],
        canvas: [can.left, can.top, can.width, can.height] };
    });
    console.log(w, h, JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
