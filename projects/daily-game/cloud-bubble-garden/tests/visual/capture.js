// Visual QA capture: every screen at 3 sizes, every time of day, the level-up transition, motion contact sheets,
// size-5 Nimbus at the edges / under the HUD, custom pictures, portrait + iPad gameplay.
// Run: node tests/visual/capture.js   (Playwright + the Chromium already installed; never `playwright install`)
// Output: tests/out/visual/*.png (gitignored).
// Motion is captured deterministically: the game runs at speed 0 and we advance it in-page with NB.Game.step().
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const errs = [];
const SIZES = {
  desk: { viewport: { width: 1280, height: 720 } },
  ipadL: { viewport: { width: 1024, height: 768 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  ipadP: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};

let browser;
async function newPage(size, query) {
  const ctx = await browser.newContext(SIZES[size]);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(size + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(size + ': ' + e));
  await p.goto(GAME + '?mute=1&seed=7&adaptive=0' + (query ? '&' + query : ''));
  await p.waitForFunction(() => window.NB && NB.debug && NB.debug.mode && NB.debug.mode !== 'boot', null, { timeout: 20000 });
  await p.evaluate(() => {
    // deterministic stepping helpers
    window.__adv = (s) => {
      const G = NB.Game, n = Math.max(1, Math.round(s * 60));
      for (let i = 0; i < n; i++) { G.step(1 / 60); G.renderer.update(1 / 60); }
      G.renderer.draw(G.mode);
    };
    window.__clear = () => { const w = NB.debug.world; w.bubbles.length = 0; w.burrs.length = 0; NB.Game.renderer.texts.length = 0; NB.Game.renderer.fx.length = 0; NB.Game.renderer.flyers.length = 0; };
    window.__hero = (x, y, size) => {
      const w = NB.debug.world, h = w.hero;
      if (size) { h.size = size; h.r = h.prevR = w.rFor(size); }
      h.x = h.prevX = h.tx = x; h.y = h.prevY = h.ty = y; h.vx = h.vy = 0;
    };
    window.__bubbleAt = (x, y, gem) => { const w = NB.debug.world, b = w.spawnBubble(x, gem); b.y = b.prevY = y; b.born = w.time - 1; return b.id; };
  });
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: OUT + '/' + name + '.png', clip });
const freeze = p => p.evaluate(() => NB.debug.setSpeed(0));
const adv = (p, s) => p.evaluate(s => window.__adv(s), s);

/** Contact sheet: frames = [{buf, label}] composed in a blank page. */
async function sheet(name, frames, cols, cellW, title) {
  const ctx = await browser.newContext({ viewport: { width: cols * (cellW + 8) + 16, height: 400 } });
  const p = await ctx.newPage();
  const cells = frames.map(f => `<figure><img src="data:image/png;base64,${f.buf.toString('base64')}"><figcaption>${f.label}</figcaption></figure>`).join('');
  await p.setContent(`<style>body{margin:8px;background:#222;font:12px sans-serif;color:#eee}h1{font-size:14px;margin:0 0 6px}
    .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:8px}figure{margin:0}img{width:${cellW}px;display:block;border:1px solid #555}
    figcaption{padding:2px 0}</style><h1>${title || name}</h1><div class="g">${cells}</div>`);
  await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/' + name + '.png', fullPage: true });
  await ctx.close();
}
/** Capture n frames, advancing dt between each, optional clip fn evaluated per frame. */
async function frames(p, n, dt, clipFn, labelFn) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const clip = clipFn ? await clipFn() : undefined;
    out.push({ buf: await p.screenshot({ clip }), label: labelFn ? await labelFn(i) : ('t=' + (i * dt).toFixed(2) + 's') });
    await adv(p, dt);
  }
  return out;
}
/** css-pixel clip around a logical point (the canvas may be letterboxed). */
async function clipAround(p, lx, ly, lw, lh) {
  return p.evaluate(([lx, ly, lw, lh]) => {
    const c = document.getElementById('game').getBoundingClientRect(), R = NB.Game.renderer, s = c.width / R.VW;
    let x = c.left + (lx - lw / 2) * s, y = c.top + (ly - lh / 2) * s, w = lw * s, h = lh * s;
    x = Math.max(c.left, Math.min(x, c.right - w)); y = Math.max(c.top, Math.min(y, c.bottom - h));
    return { x, y, width: Math.min(w, c.width), height: Math.min(h, c.height) };
  }, [lx, ly, lw, lh]);
}
const L = p => p.evaluate(() => { const l = NB.debug.world.layout; return { W: l.width, H: l.height, u: l.unit, g: l.groundY, top: l.topY, portrait: l.portrait }; });

async function screens(size) {
  const p = await newPage(size);
  await p.waitForTimeout(3000);
  await shot(p, `screen_title_${size}`);
  for (const [btn, name] of [['#btnHow', 'how'], ['#btnSettings', 'settings'], ['#btnCustomize', 'custom']]) {
    await p.click(btn); await p.waitForTimeout(500);
    await shot(p, `screen_${name}_${size}`);
    await p.click(`#scr${name === 'how' ? 'How' : name === 'settings' ? 'Settings' : 'Custom'} .btn-back`); await p.waitForTimeout(300);
  }
  await p.click('#btnPlay'); await p.waitForTimeout(900);
  await shot(p, `screen_play_start_${size}`);
  await p.waitForTimeout(1800);
  await p.click('#btnPause'); await p.waitForTimeout(400);
  await shot(p, `screen_pause_${size}`);
  await p.click('#btnResume'); await p.waitForTimeout(200);
  await p.evaluate(() => { NB.debug.setSpeed(4); window._bt = setInterval(() => { const w = NB.debug.world; if (w && w.phase === 'play' && w.burrs.filter(b => b.state !== 'gone').length < 2) w.spawnBurr(w.hero.x); }, 300); });
  await p.waitForFunction(() => NB.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push(size + ': no game over'));
  await p.evaluate(() => { clearInterval(window._bt); NB.debug.setSpeed(1); });
  await p.waitForTimeout(900);
  await shot(p, `screen_over_${size}`);
  await p.context().close();
}

async function zones(size, tag) {
  const p = await newPage(size, 'autostart=1&bot=1&skill=0.9&diff=normal');
  await freeze(p);
  for (let z = 0; z < 4; z++) {
    await p.evaluate(z => NB.debug.gotoLevel(z), z);
    await adv(p, 5);
    // burrs: one hanging, one falling, so "avoid" can be judged in every light
    const l = await L(p);
    await p.evaluate(([a, b]) => { const w = NB.debug.world; w.spawnBurr(a); }, [l.W * 0.25]);
    await adv(p, 1.25);
    await p.evaluate(([b]) => { NB.debug.world.spawnBurr(b); }, [l.W * 0.72]);
    await adv(p, 0.4);
    await shot(p, `zone${z}_${tag}`);
  }
  await p.context().close();
}

async function levelUp() {
  const p = await newPage('desk', 'autostart=1&bot=1&skill=0.9&diff=normal');
  await freeze(p); await adv(p, 4);
  await p.evaluate(() => { const w = NB.debug.world; w.gems = w.goal - 1; window.__bubbleAt(w.hero.x, w.hero.y, 3); });
  const f = await frames(p, 14, 0.25, null, i => 't=' + (i * 0.25).toFixed(2) + 's');
  await sheet('seq_levelup', f, 4, 400, 'Level-up Dawn→Noon: rainbow + crossfade + banner (0.25 s steps)');
  await p.context().close();
}

async function motion() {
  const p = await newPage('desk', 'autostart=1&diff=normal');
  await freeze(p); await adv(p, 3);
  let l = await L(p);
  // 1. bubble spawn from a puddle
  await p.evaluate(() => window.__clear());
  await p.evaluate(([x, y]) => window.__hero(x, y, 1), [l.W * 0.85, l.top + 2 * l.u]);
  await adv(p, 0.5); await p.evaluate(() => window.__clear());
  const px = await p.evaluate(() => { const k = NB.debug.world.layout.unit / 100; return 360 * k; });
  await p.evaluate(x => NB.debug.world.spawnBubble(x, 0), px);
  let f = await frames(p, 12, 0.1, () => clipAround(p, px, l.g - 1.2 * l.u, 3 * l.u, 3 * l.u));
  await sheet('motion_bubble_spawn', f, 6, 200, 'Bubble born at a puddle (0.1 s steps)');
  // 2. pop + shards + gem to jar
  await p.evaluate(() => window.__clear());
  await p.evaluate(([x, y]) => { window.__hero(x, y, 2); }, [l.W * 0.5, l.g - 1.6 * l.u]);
  await adv(p, 0.3);
  await p.evaluate(([x, y]) => { window.__bubbleAt(x, y, 4); NB.debug.world.hero.tx = x + 60; }, [l.W * 0.5 + 0.75 * l.u, l.g - 1.6 * l.u]);
  f = await frames(p, 12, 0.05, () => clipAround(p, l.W * 0.5, l.g - 1.6 * l.u, 3.2 * l.u, 2.4 * l.u));
  await sheet('motion_pop_closeup', f, 6, 220, 'Pop: membrane + shards + drops + ring (0.05 s)');
  await p.evaluate(() => window.__clear());
  await p.evaluate(([x, y]) => { window.__hero(x, y, 2); window.__bubbleAt(x + 30, y, 1); }, [l.W * 0.7, l.g - 1.3 * l.u]);
  f = await frames(p, 10, 0.1);
  await sheet('motion_pop_gemflight', f, 5, 320, 'Pop → +points → gem flies to the jar (0.1 s)');
  // 3. sizes 1..5 (static) + grow puff
  const sz = [];
  for (let s = 1; s <= 5; s++) {
    await p.evaluate(() => window.__clear());
    await p.evaluate(([x, y, s]) => window.__hero(x, y, s), [l.W * 0.5, (l.top + l.g) / 2, s]);
    await adv(p, 0.6);
    sz.push({ buf: await p.screenshot({ clip: await clipAround(p, l.W * 0.5, (l.top + l.g) / 2, 2.4 * l.u, 2.4 * l.u) }), label: 'size ' + s });
  }
  await sheet('motion_sizes', sz, 5, 220, 'Nimbus size 1→5 (same scale)');
  await p.evaluate(() => window.__clear());
  await p.evaluate(([x, y]) => { window.__hero(x, y, 2); const h = NB.debug.world.hero; h.grow = 0.75; h.gemsInSize = 3; window.__bubbleAt(x + 20, y, 2); }, [l.W * 0.5, (l.top + l.g) / 2]);
  f = await frames(p, 12, 0.05, () => clipAround(p, l.W * 0.5, (l.top + l.g) / 2, 3.4 * l.u, 2.6 * l.u));
  await sheet('motion_grow', f, 6, 220, 'Grow 2→3: puff-up, squash, pips, callout (0.05 s)');
  // 4. rain shower
  await p.evaluate(() => window.__clear());
  await p.evaluate(([W, l]) => {
    window.__hero(W * 0.5, (l.top + l.g) / 2, 5); const h = NB.debug.world.hero; h.grow = 0.75; h.gemsInSize = 3;
    for (let i = 0; i < 7; i++) window.__bubbleAt(W * (0.1 + i * 0.13), l.top + (1 + (i % 3)) * l.u, i % 5);
    window.__bubbleAt(W * 0.5 + 30, (l.top + l.g) / 2, 0);
  }, [l.W, l]);
  f = await frames(p, 12, 0.25);
  fs.writeFileSync(OUT + '/motion_shower_full_t050.png', f[2].buf);   // full-size frame mid-shower
  await sheet('motion_shower', f, 4, 400, 'Rain shower at size 5 (0.25 s)');
  // 5. burr life: dangle → drop → bounce → roll
  await p.evaluate(() => window.__clear());
  await p.evaluate(([x, y]) => window.__hero(x, y, 1), [l.W * 0.1, l.top + 1.5 * l.u]);
  await p.evaluate(x => NB.debug.world.spawnBurr(x), l.W * 0.55);
  f = await frames(p, 18, 0.15, () => clipAround(p, l.W * 0.55, l.H / 2, 5 * l.u, l.H), async () => p.evaluate(() => { const b = NB.debug.world.burrs[0]; return b ? b.state + ' t' + NB.debug.world.time.toFixed(2) : '-'; }));
  await sheet('motion_burr', f, 9, 150, 'Burr: hang wiggle → drop → bounce → roll (0.15 s)');
  // 6. bump with knock-back + blink
  await p.evaluate(() => window.__clear());
  await p.evaluate(([x, y]) => { window.__hero(x, y, 3); NB.debug.world.hero.invuln = 0; }, [l.W * 0.5, l.top + 2.2 * l.u]);
  await p.evaluate(x => NB.debug.world.spawnBurr(x + 8), l.W * 0.5);
  await p.evaluate(() => { const w = NB.debug.world; for (let i = 0; i < 400; i++) { const b = w.burrs[0]; if (!b || (b.state === 'fall' && b.y > w.hero.y - w.hero.r * 2.6)) break; window.__adv(1 / 60); } });
  f = await frames(p, 18, 0.07, () => clipAround(p, l.W * 0.5, l.top + 2.2 * l.u, 4.6 * l.u, 3.4 * l.u),
    async () => p.evaluate(() => { const h = NB.debug.world.hero; return h.mood + ' s' + h.size + ' inv' + h.invuln.toFixed(1); }));
  await sheet('motion_bump', f, 6, 220, 'Bump: ouch, knock-back, shrink, blink (0.07 s)');
  // 7. Nimbus size 5 at edges and under the HUD (+ callouts near the top)
  const spots = [['tl', 0, 0], ['tc', l.W / 2, 0], ['tr', l.W, 0], ['bl', 0, l.H], ['br', l.W, l.H], ['ml', 0, l.H / 2]];
  for (const [n, x, y] of spots) {
    await p.evaluate(() => window.__clear());
    await p.evaluate(([x, y]) => { window.__hero(NB.debug.world.layout.width / 2, NB.debug.world.layout.height / 2, 5); NB.debug.target(x, y); }, [x, y]);
    await adv(p, 2.5);
    await shot(p, `edge_size5_${n}`);
  }
  // callouts + popups with Nimbus up at the top-left (grow 4→5 there)
  await p.evaluate(() => window.__clear());
  await p.evaluate(() => { const w = NB.debug.world; window.__hero(0, 0, 4); NB.debug.target(0, 0); });
  await adv(p, 1.5);
  await p.evaluate(() => { const h = NB.debug.world.hero; h.grow = 0.75; h.gemsInSize = 3; window.__bubbleAt(h.x + 20, h.y + 10, 3); });
  await adv(p, 0.15); await shot(p, 'edge_callout_top_a');
  await adv(p, 0.3); await shot(p, 'edge_callout_top_b');
  await p.context().close();
}

async function portrait(size) {
  const p = await newPage(size, 'autostart=1&bot=1&skill=0.9&diff=normal');
  await freeze(p); await adv(p, 0.8);
  await shot(p, `${size}_play_banner`);
  await adv(p, 8);
  await shot(p, `${size}_play_dawn`);
  await p.evaluate(() => NB.debug.gotoLevel(3)); await adv(p, 6);
  await p.evaluate(() => NB.debug.world.spawnBurr(NB.debug.world.layout.width * 0.3)); await adv(p, 1.3);
  await shot(p, `${size}_play_night`);
  await p.evaluate(() => { const w = NB.debug.world; window.__hero(w.layout.width / 2, 0, 5); NB.debug.setBot(false); NB.debug.target(w.layout.width / 2, 0); });
  await adv(p, 2); await shot(p, `${size}_size5_top`);
  await p.context().close();
}

async function custom() {
  const p = await newPage('desk');
  const imgs = await p.evaluate(async () => {
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL('image/png').split(',')[1]; };
    const photo = mk(800, 600, (g, w, h) => {      // photo-like: sky, hills, a dog-ish face, noise
      let gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6fa9d8'); gr.addColorStop(0.6, '#cfe3c8'); gr.addColorStop(1, '#4f7a3a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3f6a2f'; g.beginPath(); g.ellipse(200, 520, 420, 160, 0, 0, 7); g.fill();
      g.fillStyle = '#b07a48'; g.beginPath(); g.arc(400, 300, 170, 0, 7); g.fill();
      g.fillStyle = '#7a4f2a'; g.beginPath(); g.ellipse(260, 220, 60, 110, -0.4, 0, 7); g.ellipse(540, 220, 60, 110, 0.4, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(340, 270, 30, 0, 7); g.arc(460, 270, 30, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(345, 275, 15, 0, 7); g.arc(455, 275, 15, 0, 7); g.ellipse(400, 350, 34, 24, 0, 0, 7); g.fill();
      const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 30; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
    });
    const cut = mk(400, 400, (g) => {               // transparent cut-out: a cat sticker
      g.fillStyle = '#ff9f40'; g.strokeStyle = '#7a3f00'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(90, 160); g.lineTo(120, 40); g.lineTo(190, 120); g.lineTo(210, 120); g.lineTo(280, 40); g.lineTo(310, 160);
      g.arc(200, 230, 130, -0.3, Math.PI + 0.3); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(150, 210, 26, 0, 7); g.arc(250, 210, 26, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(152, 214, 13, 0, 7); g.arc(248, 214, 13, 0, 7); g.fill();
      g.fillStyle = '#e0607a'; g.beginPath(); g.moveTo(185, 260); g.lineTo(215, 260); g.lineTo(200, 278); g.fill();
    });
    const scene = mk(1600, 900, (g, w, h) => {      // busy, saturated "holiday photo" background
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff7a1a'); gr.addColorStop(0.5, '#ffd23a'); gr.addColorStop(1, '#1a6aa8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${(i * 47) % 360},80%,55%)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 80, 0, 7); g.fill(); }
    });
    return { photo, cut, scene };
  });
  const pick = async (slotIdx, name, b64) => {
    await p.evaluate(i => { NB.UI._pickSlot = NB.Assets.SLOTS[i].id; }, slotIdx);
    await p.setInputFiles('#filePick', { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await p.waitForTimeout(1500);
  };
  await p.click('#btnCustomize'); await p.waitForTimeout(400);
  await pick(0, 'dog.png', imgs.photo);
  await pick(1, 'cat.png', imgs.cut);
  await pick(2, 'dawn.png', imgs.scene);
  await pick(5, 'night.png', imgs.photo);
  await p.evaluate(() => NB.UI.renderSlots()); await p.waitForTimeout(400);
  await shot(p, 'custom_screen_filled');
  await p.click('#scrCustom .btn-back'); await p.waitForTimeout(300);
  await p.evaluate(() => { NB.debug.setBot(true, 0.9); });
  await p.click('#btnPlay');
  await p.evaluate(() => { NB.debug.setBot(true, 0.9); NB.debug.setSpeed(0); });
  await adv(p, 6); await shot(p, 'custom_play_dawn');
  await p.evaluate(() => NB.debug.gotoLevel(3)); await adv(p, 5); await shot(p, 'custom_play_night');
  // swap: hero = cut-out, gem = photo
  await p.evaluate(() => NB.debug.setSpeed(1));
  await p.click('#btnPause'); await p.waitForTimeout(300); await p.click('#btnPauseMenu'); await p.waitForTimeout(300);
  await p.click('#btnCustomize'); await p.waitForTimeout(300);
  await pick(0, 'cat.png', imgs.cut);
  await pick(1, 'dog.png', imgs.photo);
  await p.click('#scrCustom .btn-back'); await p.waitForTimeout(300);
  await p.click('#btnPlay');
  await p.evaluate(() => { NB.debug.setBot(true, 0.9); NB.debug.setSpeed(0); });
  await adv(p, 6); await shot(p, 'custom_play_dawn_b');
  await p.evaluate(() => { const w = NB.debug.world; window.__clear(); window.__hero(w.layout.width / 2, w.layout.height / 2, 4); NB.debug.setBot(false); for (let i = 0; i < 5; i++) window.__bubbleAt(w.layout.width * (0.2 + i * 0.15), w.layout.groundY - 1.5 * w.layout.unit, i); });
  await adv(p, 0.3); await shot(p, 'custom_gems_closeup', await clipAround(p, (await L(p)).W / 2, (await L(p)).H * 0.6, 900, 300));
  await p.context().close();
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const only = process.argv[2];
  const jobs = {
    screens: async () => { for (const s of ['desk', 'ipadL', 'phone']) await screens(s); },
    zones: async () => { await zones('desk', 'desk'); await zones('phone', 'phone'); },
    levelup: levelUp, motion, custom,
    portrait: async () => { await portrait('phone'); await portrait('ipadP'); }
  };
  for (const [k, fn] of Object.entries(jobs)) {
    if (only && only !== k) continue;
    const t = Date.now();
    try { await fn(); } catch (e) { errs.push(k + ': ' + (e.stack || e)); }
    console.log(k, 'done', ((Date.now() - t) / 1000).toFixed(1) + 's');
  }
  await browser.close();
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
  console.log('out:', OUT);
})();
