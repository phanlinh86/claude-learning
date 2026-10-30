// Visual QA capture: menus at 3 sizes, every biome mid-game, banner/crossfade/gate, motion contact sheets,
// custom pictures. Usage: node tests/visual/capture.js [baseUrl]   (serve game/ first, e.g. port 8802)
// Motion frames are deterministic: the game loop is frozen (speed 0) and we step the world by hand
// (CD.Game.step at 1/120 s) between screenshots, so each frame is exactly `dt` apart in game time.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const base = process.argv[2] || 'http://127.0.0.1:8802/index.html';
const OUT = path.join(__dirname, '../out/visual'); const FR = path.join(OUT, 'frames');
fs.mkdirSync(FR, { recursive: true });
const FIX = path.join(__dirname, 'fixtures');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const want = k => !only || only.includes(k);

const HELPERS = () => {
  window.__adv = (sec, dt = 1 / 120) => {
    const G = CD.Game, n = Math.max(1, Math.round(sec / dt));
    for (let i = 0; i < n; i++) G.step(dt);
    G.renderer.update(sec); G.renderer.draw(G.mode);
  };
  window.__freeze = () => { CD.Game.speed = 0; };
  window.__manual = () => { CD.Game.bot = null; CD.Game.botMode = false; };
  window.__pip = () => { const p = CD.Game.world.pip; return { x: p.x, y: p.y, scale: p.scale, radius: p.radius, frame: p.frame, facing: p.facing, z: p.z, squash: p.squash, sliding: p.sliding }; };
  window.__place = (o, x, y) => { o.x = x; o.y = y; o._px = x; o._py = y; o.vx = 0; o.vy = 0; };
  window.__clearBears = () => { CD.Game.world.bears.length = 0; };
  window.__clearGems = () => { CD.Game.world.gems.length = 0; };
  window.__move = (mx, my) => { const k = {}; if (mx > 0) k.ArrowRight = true; if (mx < 0) k.ArrowLeft = true; if (my > 0) k.ArrowDown = true; if (my < 0) k.ArrowUp = true; CD.Game.keys = k; CD.Game.pointerDown = false; };
  window.__target = (x, y) => { CD.Game.keys = {}; if (x == null) { CD.Game.pointerDown = false; CD.Game.renderer.pointer = null; } else { CD.Game.pointerDown = true; CD.Game.renderer.pointer = [x, y]; } };
};

async function newPage(browser, w, h, q = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(base + '?mute=1&seed=42' + q);
  await page.waitForFunction(() => window.CD && CD.debug && CD.debug.mode === 'title');
  await page.evaluate(HELPERS);
  await page.waitForTimeout(1200);
  return page;
}
const K = 1280 / 960;   // css px per logical px at 1280×720
const clipL = (x, y, w, h) => ({ x: Math.max(0, x * K), y: Math.max(0, y * K), width: w * K, height: h * K });

async function sheet(page, name, n, dt, clipFn, before, arg) {
  const files = [];
  for (let i = 0; i < n; i++) {
    if (before) await page.evaluate(before, i);
    await page.evaluate(d => __adv(d), dt);
    const c = await page.evaluate(clipFn, arg);
    const f = path.join(FR, `${name}_${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: f, clip: clipL(c[0], c[1], c[2], c[3]) });
    files.push(f);
  }
  execSync(`montage ${files.join(' ')} -tile ${Math.min(n, 8)}x -geometry +2+2 -background '#222' ${path.join(OUT, 'sheet_' + name + '.png')}`);
  console.log('sheet', name);
}
async function startManual(page, level, opts = {}) {
  await page.evaluate(({ level }) => { CD.debug.startGame(); if (level) CD.debug.gotoLevel(level); __freeze(); __manual(); }, { level });
  await page.evaluate(() => __adv(1.6));      // past the 'ready' intro
  if (opts.noBears) await page.evaluate(() => __clearBears());
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. menus at 3 resolutions ----------
  if (want('menus')) for (const [w, h] of [[1280, 720], [1920, 1080], [800, 600]]) {
    const page = await newPage(browser, w, h);
    const tag = `${w}x${h}`;
    await page.screenshot({ path: `${OUT}/menu_title_${tag}.png` });
    for (const [btn, name] of [['#btnHow', 'how'], ['#btnSettings', 'settings'], ['#btnCustomize', 'custom']]) {
      await page.click(btn); await page.waitForTimeout(450);
      await page.screenshot({ path: `${OUT}/menu_${name}_${tag}.png` });
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    }
    await page.click('#btnPlay'); await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/menu_banner_${tag}.png` });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/menu_ingame_${tag}.png` });
    await page.keyboard.press('Escape'); await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/menu_pause_${tag}.png` });
    await page.click('#btnResume'); await page.waitForTimeout(200);
    await page.evaluate(() => { CD.debug.setBot(true, 0.02); CD.debug.setSpeed(20); });
    await page.waitForFunction(() => CD.debug.mode === 'over', null, { timeout: 60000 });
    await page.evaluate(() => CD.debug.setSpeed(1)); await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/menu_over_${tag}.png` });
    await page.close();
  }

  // ---------- 2. every biome mid-game with the bot (normal + debug zones) ----------
  if (want('biomes')) for (const dbg of [0, 1]) {
    const page = await newPage(browser, 1280, 720, dbg ? '&debug=1' : '');
    for (let b = 0; b < 4; b++) {
      await page.evaluate(b => { CD.debug.startGame(); if (b) CD.debug.gotoLevel(b); CD.debug.setBot(true, 0.9); }, b);
      await page.waitForTimeout(500);
      if (!dbg) await page.screenshot({ path: `${OUT}/biome${b}_banner.png` });
      await page.waitForTimeout(4500);
      await page.screenshot({ path: `${OUT}/biome${b}_mid${dbg ? '_debug' : ''}.png` });
      if (!dbg) { await page.evaluate(() => CD.debug.setSpeed(4)); await page.waitForTimeout(3000); await page.evaluate(() => CD.debug.setSpeed(1)); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/biome${b}_later.png` }); }
    }
    await page.close();
  }

  // ---------- 3. motion contact sheets ----------
  if (want('motion')) {
    const page = await newPage(browser, 1280, 720);
    const pipClip = () => { const p = CD.Game.world.pip; return [p.x - 80, p.y - 130, 160, 160]; };

    // waddle right then reverse (facing flip)
    await startManual(page, 0, { noBears: true });
    await page.evaluate(() => { __clearGems(); __place(CD.Game.world.pip, 300, 350); __move(1, 0); __adv(0.5); });
    await sheet(page, 'waddle_right', 16, 0.04, pipClip);
    await page.evaluate(() => __move(-1, 0));
    await sheet(page, 'waddle_flip', 16, 0.04, pipClip);
    await page.evaluate(() => __move(0, 0));
    await sheet(page, 'waddle_stop', 8, 0.04, pipClip);

    // growth 1→5 with hitbox overlay (static, settled) at a fixed spot
    await page.evaluate(() => { CD.Game.renderer.debug = true; });
    for (let s = 1; s <= 5; s++) {
      await page.evaluate(s => { const w = CD.Game.world; w.size = s; w.pip.radius = w.pipRadiusFor(s); __place(w.pip, 480, 360); __move(0, 0); __adv(1.0); }, s);
      await page.screenshot({ path: `${FR}/grow_${s}.png`, clip: clipL(400, 220, 160, 160) });
    }
    execSync(`montage ${[1, 2, 3, 4, 5].map(s => `${FR}/grow_${s}.png`).join(' ')} -tile 5x -geometry +2+2 -background '#222' ${OUT}/sheet_growth_hitbox.png`);
    // growth transition (animated): collect gems in a row
    await page.evaluate(() => { const w = CD.Game.world; w.size = 1; w.pip.radius = w.pipRadiusFor(1); w.pip.scale = 1; __place(w.pip, 480, 360); __adv(0.2); CD.Game.renderer.debug = false;
      const g = w._spawnGem(); __place(g, 480, 360); g.appear = 1; });
    await sheet(page, 'grow_anim', 16, 0.04, () => [400, 220, 160, 160]);
    // walking at size 5
    await page.evaluate(() => { const w = CD.Game.world; w.size = 5; w.pip.radius = w.pipRadiusFor(5); __adv(1); __place(w.pip, 300, 400); __move(1, 0); __adv(0.4); });
    await sheet(page, 'waddle_size5', 12, 0.04, () => { const p = CD.Game.world.pip; return [p.x - 90, p.y - 150, 180, 180]; });

    // dash / belly slide
    await page.evaluate(() => { const w = CD.Game.world; w.size = 2; w.pip.radius = w.pipRadiusFor(2); w.pip.dashCd = 0; __place(w.pip, 200, 360); __move(1, 0); __adv(0.3); w.action(); });
    await sheet(page, 'dash', 16, 0.04, () => { const p = CD.Game.world.pip; return [140, p.y - 130, 520, 170]; });

    // Pop! with bears around
    await startManual(page, 0);
    await page.evaluate(() => { const w = CD.Game.world; w.size = 5; w.pip.radius = w.pipRadiusFor(5); __place(w.pip, 480, 330); __move(0, 0);
      w.bears.forEach((b, i) => { __place(b, 480 + Math.cos(i * 2.1) * 110, 330 + Math.sin(i * 2.1) * 80); b.spawnT = 1; }); w.pip.invuln = 5; __adv(0.6); });
    await page.screenshot({ path: `${OUT}/pop_before.png` });
    await page.evaluate(() => { CD.Game.world.pip.invuln = 0; CD.Game.world.action(); });
    await sheet(page, 'pop', 16, 0.04, () => [280, 120, 400, 300]);
    await sheet(page, 'pop_stun_after', 8, 0.15, () => [280, 120, 400, 300]);

    // bump: bear walks into Pip
    await startManual(page, 0);
    await page.evaluate(() => { const w = CD.Game.world; w.size = 3; w.jar = 5; w.pip.radius = w.pipRadiusFor(3); __adv(0.8); __place(w.pip, 480, 330); __move(0, 0);
      w.bears.length = 1; const b = w.bears[0]; b.spawnT = 1; __place(b, 520, 332); });
    await sheet(page, 'bump', 24, 0.04, () => [300, 160, 360, 280]);

    // gem telegraph → appear → pickup
    await startManual(page, 0, { noBears: true });
    await page.evaluate(() => { const w = CD.Game.world; __clearGems(); __place(w.pip, 380, 340); __move(0, 0); w.gemsWanted = 0; const g = w._spawnGem(); __place(g, 480, 340); g.appear = 0; window.__g = g; });
    await sheet(page, 'gem_appear', 16, 0.04, () => [400, 260, 160, 120]);
    await page.evaluate(() => __target(490, 340));
    await sheet(page, 'gem_pickup', 16, 0.04, () => [330, 220, 260, 160]);

    // bears' behaviours (wide frames, sampled sparsely) + waddle closeups
    await startManual(page, 0);
    await page.evaluate(() => { const w = CD.Game.world; w.pip.invuln = 99; __target(null); __adv(2); });
    await sheet(page, 'bears_wide', 8, 0.5, () => [0, 0, 960, 540]);
    for (const kind of ['red', 'green', 'orange']) {
      await sheet(page, 'bear_' + kind, 12, 0.04, k => { const b = CD.Game.world.bears.find(b => b.kind === k) || CD.Game.world.bears[0]; return [b.x - 50, b.y - 80, 100, 100]; }, null, kind);
    }

    // puff bounce (clouds): walk into puff at (300,200,r70) from the left
    await startManual(page, 2, { noBears: true });
    await page.evaluate(() => { const w = CD.Game.world; __clearGems(); w.gemsWanted = 0; __place(w.pip, 150, 210); __move(1, 0); __adv(0.2); });
    await sheet(page, 'puff_bounce', 24, 0.04, () => [100, 90, 360, 240]);

    // ice slide (glacier): run across the ice patch (160,140,260,140) and release
    await startManual(page, 3, { noBears: true });
    await page.evaluate(() => { const w = CD.Game.world; __clearGems(); w.gemsWanted = 0; __place(w.pip, 120, 220); __move(1, 0); __adv(0.6); __move(0, 0); });
    await sheet(page, 'ice_slide', 16, 0.05, () => [60, 90, 520, 220]);

    // river slow: cross band at x≈200 (slow) vs bridge x≈330
    await startManual(page, 1, { noBears: true });
    await page.evaluate(() => { const w = CD.Game.world; __clearGems(); w.gemsWanted = 0; __place(w.pip, 200, 200); __move(0, 1); __adv(0.1); });
    await sheet(page, 'river_slow', 16, 0.1, () => [100, 150, 300, 300]);

    // gate: jar full → open → walk-through → cleared → next biome crossfade + banner
    await startManual(page, 0, { noBears: true });
    await page.evaluate(() => { const w = CD.Game.world; __clearGems(); w.jar = w.jarTarget - 1; __place(w.pip, 700, 300); const g = w._spawnGem(); __place(g, 712, 300); g.appear = 1; });
    await sheet(page, 'gate_open', 12, 0.06, () => [560, 140, 400, 280]);
    await page.evaluate(() => __target(905, 300));
    await sheet(page, 'gate_walk', 16, 0.06, () => [560, 140, 400, 280]);
    await sheet(page, 'transition', 16, 0.18, () => [0, 0, 960, 540]);
    await page.close();
  }

  // ---------- 4. custom pictures ----------
  if (want('custom')) {
    const page = await newPage(browser, 1280, 720);
    for (const [slot, file] of [['hero', 'hero_photo.jpg'], ['gem', 'gem_cutout.png'], ['bear', 'bear_photo.jpg'], ['bg_meadow', 'ground_busy.jpg']]) {
      await page.evaluate(s => { CD.UI._pickSlot = s; }, slot);
      await page.setInputFiles('#filePick', path.join(FIX, file));
      await page.waitForTimeout(900);
    }
    await page.click('#btnCustomize'); await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/custom_screen.png` });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.evaluate(() => { CD.debug.startGame(); CD.debug.setBot(true, 0.9); });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/custom_ingame.png` });
    await page.evaluate(() => { __freeze(); __manual(); __place(CD.Game.world.pip, 300, 360); __move(1, 0); CD.Game.world.pip.invuln = 0; });
    await sheet(page, 'custom_hero_walk', 12, 0.04, () => { const p = CD.Game.world.pip; return [p.x - 80, p.y - 130, 160, 160]; });
    await sheet(page, 'custom_bears', 6, 0.04, () => { const b = CD.Game.world.bears[0]; return [b.x - 60, b.y - 90, 120, 110]; });
    await page.evaluate(() => { CD.debug.gotoLevel(2); __adv(1.6); });
    await page.screenshot({ path: `${OUT}/custom_clouds.png` });
    await page.close();
  }
  await browser.close();
})();
