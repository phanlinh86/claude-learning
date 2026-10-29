// Visual QA: deterministic frame bursts (game clock frozen, stepped manually at 60 fps)
// → tests/out/visual/frames/<name>_NN.png + meta json; contact sheets built by motion_sheets.py
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual', 'frames');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8772/index.html?mute=1&seed=42';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(BASE);
  await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  // manual stepping helper
  await page.evaluate(() => {
    window.__adv = (n, bot) => {
      const G = FF.Game;
      for (let i = 0; i < n; i++) { G.step(1 / 60); G.renderer.update(1 / 60); }
      G.renderer.draw(G.mode);
      const w = G.world, b = w.bird;
      return { hits: w.hits || 0, misses: w.misses || 0, state: w.state, mode: G.mode,
        bird: { x: b.x, y: b.y, a: b.angle, f: b.frame, sq: b.squash, wp: b.wingPhase },
        turtles: w.turtles.map(t => ({ x: t.x, y: t.y, f: t.frame })), drops: w.drops.map(d => ({ x: d.x, y: d.y, landed: !!d.landed })) };
    };
  });
  const meta = {};
  const shot = async (name, i) => {
    const buf = await page.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(OUT, `${name}_${String(i).padStart(2, '0')}.png`), buf);
  };
  const start = async (seasonIdx) => {
    await page.evaluate((s) => {
      FF.debug.setSpeed(0); FF.debug.startGame(); FF.debug.setBot(true, 1); FF.debug.flap();
      const G = FF.Game, w = G.world;
      if (s) { w.score = s * 10; w.seasonIndex = s; w.season = s; G.weather.setSeason(s, { instant: true }); G.renderer.setSeason(s, true); }
      // warm the weather up so particles fill the screen
      for (let i = 0; i < 240; i++) { G.step(1 / 60); G.renderer.update(1 / 60); }
    }, seasonIdx);
  };

  // A. flap cycle: bot off, flap once, 30 frames at 60fps
  await start(0);
  await page.evaluate(() => { FF.debug.setBot(false); const b = FF.Game.world.bird; b.y = 260; b.vy = 150; });
  await page.evaluate(() => __adv(10));
  await page.evaluate(() => FF.Game.world.flap());
  meta.flap = [];
  for (let i = 0; i < 30; i++) { meta.flap.push(await page.evaluate(() => __adv(1))); await shot('flap', i); }

  // A2. glide / fall with no input (wing frames + nose-down), 20 frames every 2 steps
  meta.fall = [];
  for (let i = 0; i < 20; i++) { meta.fall.push(await page.evaluate(() => __adv(2))); await shot('fall', i); }

  // B. hit sequence: run bot until a hit, keep the last 30 frames + 30 after
  async function capEvent(name, key, seasonIdx, every, before, after, botOn = true) {
    await start(seasonIdx);
    if (!botOn) await page.evaluate(() => FF.debug.setBot(false));
    const ring = [];
    let s0 = await page.evaluate(() => __adv(0));
    const base = s0[key];
    let got = false;
    for (let i = 0; i < 4000 && !got; i++) {
      const s = await page.evaluate((e) => __adv(e), every);
      ring.push({ s, buf: await page.screenshot() }); if (ring.length > before) ring.shift();
      if (s[key] !== base) got = true;
    }
    if (!got) { console.log('no event', name); return; }
    for (let i = 0; i < after; i++) { const s = await page.evaluate((e) => __adv(e), every); ring.push({ s, buf: await page.screenshot() }); }
    ring.forEach((r, i) => fs.writeFileSync(path.join(OUT, `${name}_${String(i).padStart(2, '0')}.png`), r.buf));
    meta[name] = ring.map(r => r.s);
    console.log(name, 'captured', ring.length);
  }
  await capEvent('hit', 'hits', 0, 2, 16, 26);
  await capEvent('hitw', 'hits', 3, 2, 10, 20);
  // miss: bot with low skill
  await start(0);
  await page.evaluate(() => FF.debug.setBot(true, 0.2));
  {
    const ring = []; let base = (await page.evaluate(() => __adv(0))).misses, got = false;
    for (let i = 0; i < 3000 && !got; i++) { const s = await page.evaluate(() => __adv(2)); ring.push({ s, buf: await page.screenshot() }); if (ring.length > 12) ring.shift(); if (s.misses !== base) got = true; }
    for (let i = 0; i < 14; i++) { const s = await page.evaluate(() => __adv(2)); ring.push({ s, buf: await page.screenshot() }); }
    ring.forEach((r, i) => fs.writeFileSync(path.join(OUT, `miss_${String(i).padStart(2, '0')}.png`), r.buf));
    meta.miss = ring.map(r => r.s);
  }
  // death: bot off, fall to ground
  await capEvent('death', 'state', 2, 2, 10, 40, false);

  // E. turtles walking + parallax: 24 frames every 3 steps, autumn & winter
  for (const [nm, s] of [['walk', 0], ['parallax_autumn', 2], ['parallax_winter', 3], ['parallax_summer', 1]]) {
    await start(s);
    meta[nm] = [];
    for (let i = 0; i < 24; i++) { meta[nm].push(await page.evaluate(() => __adv(3))); await shot(nm, i); }
  }
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
  await browser.close();
})();
