// Quick fps comparison: node tests/perf/quick_fps.js url [url2...]   (1920×1080, bot playing, 8 s, spring then season change)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const url of process.argv.slice(2)) {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto(url + '?mute=1&seed=42'); await p.waitForTimeout(1500);
    await p.evaluate(() => { FF.debug.startGame(); FF.debug.setBot(true, 1); FF.debug.flap(); });
    const rec = ms => p.evaluate(ms => new Promise(res => { const t = []; let last = performance.now(); const end = last + ms;
      const f = now => { t.push(now - last); last = now; now < end ? requestAnimationFrame(f) : res(t.slice(1)); }; requestAnimationFrame(f); }), ms);
    const stat = t => { const s = [...t].sort((a, c) => a - c); return { fps: +(1000 * t.length / t.reduce((a, c) => a + c, 0)).toFixed(1), p95: +s[Math.floor(.95 * (s.length - 1))].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
    const a = await rec(5000);
    await p.evaluate(() => { FF.debug.world.score = 9; });
    const c = await rec(5000);
    console.log(url, 'play', JSON.stringify(stat(a)), 'seasonChange', JSON.stringify(stat(c)));
    await p.close();
  }
  await b.close();
})();
