// Visual QA capture for Otto's Playroom Dash: every screen at 3 sizes, every biome in play (incl. the jump apex in each
// gravity), the biome change (arch, crossfade, banner, gravity hint), obstacles (towers, foam blocks, bouncing balls),
// acorn arcs, motion contact sheets, custom pictures and colour-blind simulations. Report-only: writes PNGs to
// tests/out/visual/ (gitignored). Run:  node tests/visual/capture.js [group...]
// groups: screens biomes apex change objects motion custom cvd   (default: all)
//
// The game is frozen with OD.debug.setSpeed(0) and advanced by hand with fixed 1/120 s steps (Game.step +
// Renderer.update), then drawn synchronously, so every frame is deterministic for the seed.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2); const on = g => !want.length || want.includes(g);

// device profiles (all DPR 2). `safe` = simulated safe-area insets in CSS px (Chromium has no env(safe-area-inset-*)).
const DEV = {
  desk:   { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, safe: [0, 0, 0, 0] },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, safe: [0, 47, 21, 47], notch: 'landscape' },
  phone:  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, safe: [47, 0, 34, 0], notch: 'portrait' }
};
const errs = [];
let browser;

async function open(dev, query) {
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, hasTouch: !!d.hasTouch, isMobile: !!d.isMobile });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(dev + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(dev + ' console: ' + m.text()); });
  await p.goto(GAME + '?mute=1&seed=7' + (query ? '&' + query : ''));
  await p.waitForFunction(() => window.OD && OD.debug && OD.debug.mode !== 'boot' && OD.Game.world, null, { timeout: 20000 });
  const [t, r, b, l] = d.safe;
  await p.addStyleTag({ content: `#safeProbe{padding:${t}px ${r}px ${b}px ${l}px !important}
    .screen{padding:${t}px ${r}px ${b}px ${l}px !important}` });
  if (d.notch) await p.evaluate(kind => {
    const css = 'position:fixed;z-index:9999;pointer-events:none;background:rgba(0,0,0,.92);';
    const add = s => { const e = document.createElement('div'); e.style.cssText = css + s; document.body.appendChild(e); };
    if (kind === 'portrait') { add('top:11px;left:50%;width:126px;height:37px;margin-left:-63px;border-radius:20px'); add('bottom:8px;left:50%;width:134px;height:5px;margin-left:-67px;border-radius:3px'); }
    if (kind === 'landscape') { add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px'); add('bottom:7px;left:50%;width:200px;height:5px;margin-left:-100px;border-radius:3px'); }
  }, d.notch);
  await p.evaluate(() => {
    OD.Game.relayout();
    const G = OD.Game;
    window.__adv = (sec, until) => {
      const h = 1 / 120, n = Math.round(sec / h);
      for (let i = 0; i < n; i++) { G.step(h); G.renderer.update(h); if (until && until()) return true; }
      return false;
    };
    window.__draw = () => G.renderer.draw(G.mode);
    window.__grab = (rect, outW) => {
      const R = G.renderer, c = R.canvas, px = R.px;
      const [x, y, w, h] = rect || [0, 0, R.VW, R.VH];
      const o = document.createElement('canvas'), k = outW / w; o.width = outW; o.height = Math.round(h * k);
      o.getContext('2d').drawImage(c, x * px, y * px, w * px, h * px, 0, 0, o.width, o.height);
      return o.toDataURL('image/png');
    };
    window.__heroRect = (wU, up, down) => {   // rect around Otto in logical px
      const R = G.renderer, L = R.laneW0, cx = Math.max(wU * L, Math.min(R.VW - wU * L, R.proj(G.world.hero.x, 0, 0, R.camX()).sx));
      return [cx - wU * L, R.footY - up * L, 2 * wU * L, (up + down) * L];
    };
    window.__clear = () => { G.world.objects.length = 0; };
    window.__sheet = (frames, cols, labels, title) => Promise.all(frames.map(src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; }))).then(ims => {
      const fw = ims[0].width, fh = ims[0].height, rows = Math.ceil(ims.length / cols), pad = 6, top = 30, lab = 18;
      const c = document.createElement('canvas'); c.width = cols * (fw + pad) + pad; c.height = top + rows * (fh + lab + pad) + pad;
      const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.fillText(title, pad, 21);
      ims.forEach((im, i) => {
        const x = pad + (i % cols) * (fw + pad), y = top + Math.floor(i / cols) * (fh + lab + pad);
        g.fillStyle = '#ccc'; g.font = '12px monospace'; g.fillText(labels[i] || '', x, y + 13);
        g.drawImage(im, x, y + lab);
      });
      return c.toDataURL('image/png');
    });
    // geometry probe for the report: HUD pill bottoms vs Otto's head at the apex
    window.__probe = () => {
      const R = G.renderer, w = G.world, h = w.hero, cx = R.camX(), p = R.proj(h.x, h.y, 0, cx), W = 0.95 * p.u;
      const headTop = p.sy - W * (120 - 8) / 128;   // otto art: feet 120, head top ≈ 8
      const hud = document.getElementById('hud').getBoundingClientRect(), cr = R.canvas.getBoundingClientRect();
      return { VW: R.VW, VH: R.VH, laneW0: +R.laneW0.toFixed(1), footY: +R.footY.toFixed(1), horizonY: R.horizonY, heroY: +h.y.toFixed(3), heroFeetY: +p.sy.toFixed(1), heroHeadTop: +headTop.toFixed(1),
        insTop: +R.ins.top.toFixed(1), hudBtnBottomLogical: +((hud.bottom - cr.top) / cr.height * R.VH).toFixed(1), gk: +(w.gk || 1).toFixed(2), zone: w.zone };
    };
  });
  return p;
}
const save = (name, dataUrl) => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
const shot = async (p, name) => { await p.evaluate(() => window.__draw && __draw()); await p.screenshot({ path: path.join(OUT, name + '.png') }); };
const freezePlay = async (p, opts) => {
  await p.evaluate(o => {
    const G = OD.Game; G.speed = 1; G.startGame(); OD.debug.setSpeed(0);
    if (o && o.bot) OD.debug.setBot(true, o.bot); else OD.debug.setBot(false);
    if (o && o.level) OD.debug.gotoLevel(o.level);
  }, opts || {});
};
const probes = {};

async function motion(p, name, title, setup, { n = 16, dt = 0.06, cols = 8, rect = 'hero', outW = 220, pre = 0 } = {}) {
  await p.evaluate(setup);
  if (pre) await p.evaluate(s => __adv(s), pre);
  const frames = [], labels = [];
  for (let i = 0; i < n; i++) {
    const f = await p.evaluate(([r, w]) => {
      __draw();
      const rect = r === 'hero' ? __heroRect(1.2, 2.8, 0.4) : r === 'wide' ? __heroRect(2.6, 3.4, 0.5) : r;
      return __grab(rect, w);
    }, [rect, outW]);
    const st = await p.evaluate(() => { const h = OD.Game.world.hero; return 'y' + h.y.toFixed(2) + ' ' + h.mood; });
    frames.push(f); labels.push(Math.round(i * dt * 1000) + 'ms ' + st);
    await p.evaluate(s => __adv(s), dt);
  }
  save(name, await p.evaluate(([f, c, l, t]) => __sheet(f, c, l, t), [frames, cols, labels, title]));
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------------------------------------------------------------- screens × 3 sizes
  if (on('screens')) for (const dev of Object.keys(DEV)) {
    const p = await open(dev);
    await p.waitForTimeout(2500);
    await shot(p, `screen_${dev}_title`);
    for (const [id, nm] of [['scrHow', 'how'], ['scrSettings', 'settings'], ['scrCustom', 'custom']]) {
      await p.evaluate(i => OD.UI.open(i, 'scrTitle'), id); await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(OUT, `screen_${dev}_${nm}.png`) });
      const scrolls = await p.evaluate(i => { const el = document.querySelector('#' + i + ' .panel'); if (el && el.scrollHeight > el.clientHeight + 4) { el.scrollTop = 1e5; return true; } return false; }, id);
      if (scrolls) { await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, `screen_${dev}_${nm}_scrolled.png`) }); }
    }
    await p.evaluate(() => OD.UI.show('scrTitle'));
    await freezePlay(p, { bot: 0.9 });
    await p.evaluate(() => __adv(0.5)); await shot(p, `screen_${dev}_play_banner`);
    await p.evaluate(() => __adv(4)); await shot(p, `screen_${dev}_play_hints`);
    await p.evaluate(() => OD.Game.pause()); await p.waitForTimeout(500); await shot(p, `screen_${dev}_pause`);
    await p.evaluate(() => OD.Game.resume());
    await p.evaluate(() => {
      OD.debug.setBot(false); const w = OD.Game.world; w.hearts = 1; w.acorns = 37; w.score = 1240; w.hero.invuln = 0;
      __clear(); w.spawn('tower', Math.round(w.hero.x), 3); __adv(6, () => OD.Game.mode === 'over');
    });
    await p.waitForTimeout(900); await shot(p, `screen_${dev}_over`);
    await p.context().close();
  }

  // ---------------------------------------------------------------- every biome in play + busy scene
  if (on('biomes')) for (const dev of Object.keys(DEV)) {
    const p = await open(dev);
    await freezePlay(p, { bot: 0.95 });
    for (let lv = 0; lv < 4; lv++) {
      await p.evaluate(l => { OD.debug.gotoLevel(l); __adv(4.5); OD.Game.renderer.hintOn = false; }, lv);
      await shot(p, `biome${lv}_${dev}`);
      // a busy, staged scene: towers, foam blocks, a ball, acorn rows and an arc
      await p.evaluate(() => {
        const w = OD.Game.world; w.objects.length = 0; OD.debug.setBot(false); w.hero.invuln = 0;
        w.spawn('tower', -1, 7, { variant: 0 }); w.spawn('tower', 1, 12, { variant: 1 }); w.spawn('blocks', 0, 16); w.spawn('blocks', -1, 22);
        w.spawn('ball', 1, 9, { vx: -1.5 }); w.spawn('tower', 0, 26, { variant: 1 });
        for (let i = 0; i < 5; i++) w.spawn('acorn', 0, 3 + i * 0.9, { variant: i % 3 });
        for (let i = 0; i < 6; i++) { const s = i / 5; w.spawn('acorn', -1, 9 + i * 1.0, { variant: (i + 1) % 3, y: 0.35 + 3.2 * s * (1 - s) }); }
        __adv(0.4); OD.Game.renderer.banner = null; OD.Game.renderer.gravMsg = 0;
      });
      await shot(p, `busy${lv}_${dev}`);
      await p.evaluate(() => OD.debug.setBot(true, 0.95));
    }
    await p.context().close();
  }

  // ---------------------------------------------------------------- jump apex per gravity (moon must stay on screen, clear of the HUD)
  if (on('apex')) for (const dev of Object.keys(DEV)) {
    const p = await open(dev);
    await freezePlay(p);
    for (let lv = 0; lv < 4; lv++) {
      await p.evaluate(l => { OD.debug.gotoLevel(l); __adv(3.5); __clear(); const R = OD.Game.renderer; R.hintOn = false; R.banner = null; R.gravMsg = 0; OD.debug.jump(); }, lv);
      let prev = -1;
      await p.evaluate(() => { let last = -1; __adv(2, () => { const y = OD.Game.world.hero.y; const r = y < last; last = y; return r; }); });
      await shot(p, `apex${lv}_${dev}`);
      probes[`apex${lv}_${dev}`] = await p.evaluate(() => __probe());
      await p.evaluate(() => __adv(1.5));
      void prev;
    }
    await p.context().close();
  }

  // ---------------------------------------------------------------- biome change, arch, banner, crossfade, gravity hint
  if (on('change')) for (const dev of ['desk', 'phone', 'phoneL']) {
    const p = await open(dev);
    await freezePlay(p, { bot: 1 });
    await p.evaluate(() => { __adv(3); const w = OD.Game.world; w.levelDist = w.goal - 22; w.endS = w.dist + 22; __clear(); OD.Game.renderer.hintOn = false; });
    for (const [z, nm] of [[20, 'arch_far'], [10, 'arch_mid'], [4, 'arch_near'], [1.2, 'arch_through']]) {
      await p.evaluate(zz => { const w = OD.Game.world; __adv(5, () => w.endS == null || w.endS - w.dist <= zz || w.level > 0); }, z);
      await shot(p, `change_${dev}_${nm}`);
    }
    await p.evaluate(() => { const w = OD.Game.world; __adv(3, () => w.level > 0); });
    for (const [t, nm] of [[0.05, 't0.05'], [0.3, 't0.35'], [0.35, 't0.7'], [0.5, 't1.2'], [1.3, 't2.5'], [0.6, 't3.1'], [1.0, 't4.1']]) {
      await p.evaluate(s => __adv(s), t); await shot(p, `change_${dev}_xfade_${nm}`);
    }
    await p.evaluate(() => { OD.debug.gotoLevel(3); __adv(3); const w = OD.Game.world; w.levelDist = w.goal - 3; w.endS = w.dist + 3; __adv(3, () => w.level > 3); __adv(0.6); });
    await shot(p, `change_${dev}_loop_banner`);
    await p.context().close();
  }

  // ---------------------------------------------------------------- objects: bouncing ball sheet, acorn arc jump
  if (on('objects')) {
    const p = await open('desk');
    await freezePlay(p);
    const R0 = 'const w = OD.Game.world, h = w.hero; __clear(); h.invuln = 0; w.hearts = 3; const R = OD.Game.renderer; R.banner = null; R.gravMsg = 0; R.hintOn = false;';
    for (const lv of [2, 3]) {
      await p.evaluate(l => { OD.debug.gotoLevel(l); __adv(3.5); }, lv);
      await motion(p, `objects_ball_z${lv}`, `Bouncing ball rolling across (biome ${lv + 1}), shadow on the floor, 100 ms`,
        new Function(R0 + 'w.spawn("ball", 1, 11, {vx: -1.5}); h.x = h.prevX = -1; h.lane = -1; OD.debug.move(-1);'), { n: 18, dt: 0.1, cols: 6, rect: null, outW: 420 });
      await motion(p, `objects_arc_z${lv}`, `Acorn arc in Otto's lane, jump timed to it (biome ${lv + 1}), 80 ms`,
        new Function(R0 + 'OD.debug.setBot(true, 1); w.spawn("tower", -1, 30); __adv(0.05); OD.debug.setBot(false); ' +
          'const v = w.speed, T = 2 * w.jumpV / w.g; for (let i = 0; i < 7; i++) { const t = T * i / 6; w.spawn("acorn", Math.round(h.x), 5 + v * t, {variant: i % 3, y: 0.35 + w.jumpV * t - 0.5 * w.g * t * t}); }'),
        { n: 18, dt: 0.08, cols: 6, rect: null, outW: 420, pre: 0 });
    }
    await p.context().close();
  }

  // ---------------------------------------------------------------- motion contact sheets
  if (on('motion')) {
    const p = await open('desk');
    await freezePlay(p);
    await p.evaluate(() => { __adv(4); __clear(); const R = OD.Game.renderer; R.hintOn = false; R.banner = null; R.gravMsg = 0; });
    const reset = 'const w = OD.Game.world, h = w.hero; __clear(); h.invuln = 0; w.hearts = 3; ';
    await motion(p, 'motion_run', 'Run cycle (meadow), 40 ms', new Function(reset), { n: 16, dt: 0.04 });
    await motion(p, 'motion_lane_change', 'Lane change centre -> left (lean), 60 ms', new Function(reset + 'OD.debug.move(-1);'), { n: 16, rect: 'wide', outW: 260 });
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { OD.debug.gotoLevel(l); __adv(3.5); __clear(); const R = OD.Game.renderer; R.banner = null; R.gravMsg = 0; }, lv);
      await motion(p, `motion_jump_z${lv}`, `Jump arc in biome ${lv + 1} gravity, 70 ms`, new Function(reset + 'OD.debug.jump();'), { n: 18, dt: 0.07, cols: 9 });
    }
    await p.evaluate(() => { OD.debug.gotoLevel(0); __adv(3.5); });
    await motion(p, 'motion_bump_tower', 'Bump into a tower (ouch), 60 ms', new Function(reset + 'w.spawn("tower", Math.round(h.x), 2.4);'), { n: 16, rect: 'wide', outW: 260 });
    await p.evaluate(() => __adv(2));
    await motion(p, 'motion_bump_blocks', 'Bump into foam blocks (no jump), 60 ms', new Function(reset + 'w.spawn("blocks", Math.round(h.x), 2.4);'), { n: 16, rect: 'wide', outW: 260 });
    await p.evaluate(() => __adv(2));
    await motion(p, 'motion_jump_blocks', 'Jump over foam blocks, 60 ms', new Function(reset + 'w.spawn("blocks", Math.round(h.x), 3.6); OD.debug.jump();'), { n: 16, rect: 'wide', outW: 260 });
    await motion(p, 'motion_acorns', 'Acorn pickup -> flyer to the HUD counter, 60 ms', new Function(reset + 'for (let i=0;i<4;i++) w.spawn("acorn", Math.round(h.x), 1.5 + i*0.9, {variant:i%3});'), { n: 16, rect: null, outW: 320 });
    await motion(p, 'motion_happy', 'Happy (biome done) pose, 80 ms', new Function(reset + 'h.mood = "happy"; h.moodT = 1.2;'), { n: 16, dt: 0.08 });
    await p.context().close();
  }

  // ---------------------------------------------------------------- custom pictures
  if (on('custom')) for (const dev of ['desk', 'phone']) {
    const p = await open(dev);
    await p.evaluate(async () => {
      const mk = (w, h, draw) => new Promise(r => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); c.toBlob(b => r(new File([b], 'x.png', { type: 'image/png' })), 'image/png'); });
      const photo = await mk(800, 600, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a6b35'); gr.addColorStop(1, '#c9d66b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 37 % 360},50%,${40 + i % 30}%)`; g.fillRect((i * 97) % w, (i * 53) % h, 60, 40); }
        g.fillStyle = '#8b5a2b'; g.beginPath(); g.ellipse(400, 320, 200, 180, 0, 0, 7); g.fill();
        g.fillStyle = '#5a3a1e'; g.beginPath(); g.ellipse(250, 180, 60, 100, -0.4, 0, 7); g.ellipse(550, 180, 60, 100, 0.4, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(330, 290, 30, 0, 7); g.arc(470, 290, 30, 0, 7); g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(335, 295, 15, 0, 7); g.arc(475, 295, 15, 0, 7); g.arc(400, 380, 25, 0, 7); g.fill();
      });
      const cut = await mk(300, 300, (g) => {
        g.fillStyle = '#ffd400'; g.strokeStyle = '#b07a00'; g.lineWidth = 12;
        g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 60 : 135; g.lineTo(150 + r * Math.cos(a), 155 + r * Math.sin(a)); } g.closePath(); g.fill(); g.stroke();
      });
      const bg = await mk(1600, 900, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d4e89'); gr.addColorStop(0.6, '#f79256'); gr.addColorStop(1, '#2d6a4f'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#183a37'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(i * 150, h); g.lineTo(i * 150 + 75, h * 0.45 + (i % 3) * 60); g.lineTo(i * 150 + 150, h); g.fill(); }
        g.fillStyle = '#fff6'; g.beginPath(); g.arc(1200, 200, 90, 0, 7); g.fill();
      });
      await OD.Assets.setCustom('hero', photo);
      await OD.Assets.setCustom('acorn', cut);
      await OD.Assets.setCustom('bg_meadow', bg);
      await OD.Assets.setCustom('bg_stars', bg);
      OD.Game.picturesChanged();
    });
    await p.evaluate(() => OD.UI.open('scrCustom', 'scrTitle')); await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `custom_${dev}_screen.png`) });
    await p.evaluate(() => OD.UI.show('scrTitle'));
    await freezePlay(p, { bot: 0.95 });
    await p.evaluate(() => { __adv(4); OD.Game.renderer.hintOn = false; const w = OD.Game.world; for (let i = 0; i < 4; i++) w.spawn('acorn', Math.round(w.hero.x), 3 + i, { variant: i % 3 }); w.spawn('acorn', -1, 8); __adv(0.05); });
    await shot(p, `custom_${dev}_play_meadow`);
    await p.evaluate(() => { OD.debug.setBot(false); OD.debug.jump(); __adv(0.3); });
    await shot(p, `custom_${dev}_play_jump`);
    await p.evaluate(() => { OD.debug.gotoLevel(3); __adv(4); });
    await shot(p, `custom_${dev}_play_stars`);
    await p.evaluate(async () => { OD.Assets.setShape && OD.Assets.setShape('hero', 'fit'); OD.Game.picturesChanged(); __adv(0.1); });
    await shot(p, `custom_${dev}_play_hero_fit`);
    await p.evaluate(() => { OD.Assets.SLOTS.forEach(s => OD.Assets.clearCustom && OD.Assets.clearCustom(s.id)); OD.Game.picturesChanged(); });
    await p.context().close();
  }

  // ---------------------------------------------------------------- colour-blind simulation of play shots
  if (on('cvd')) {
    const p = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
    const M = {
      deut: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
      prot: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
      gray: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114]
    };
    const srcs = fs.readdirSync(OUT).filter(f => /^busy[0-3]_(desk|phone)\.png$/.test(f));
    for (const f of srcs) {
      const data = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
      const out = await p.evaluate(async ([src, M]) => {
        const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const k = Math.min(1, 640 / im.width), w = Math.round(im.width * k), h = Math.round(im.height * k);
        const c = document.createElement('canvas'); c.width = w * 2 + 9; c.height = h * 2 + 48; const g = c.getContext('2d');
        g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
        const names = ['original', 'deuteranopia', 'protanopia', 'grey (value)'];
        const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const enc = v => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
        ['orig', 'deut', 'prot', 'gray'].forEach((m, j) => {
          const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d'); tg.drawImage(im, 0, 0, w, h);
          if (m !== 'orig') {
            const d = tg.getImageData(0, 0, w, h), a = d.data, X = M[m], L = m !== 'gray';
            for (let i = 0; i < a.length; i += 4) {
              const r = L ? lin(a[i]) : a[i] / 255, gg = L ? lin(a[i + 1]) : a[i + 1] / 255, b = L ? lin(a[i + 2]) : a[i + 2] / 255;
              const R = X[0] * r + X[1] * gg + X[2] * b, G = X[3] * r + X[4] * gg + X[5] * b, B = X[6] * r + X[7] * gg + X[8] * b;
              a[i] = L ? enc(R) : R * 255; a[i + 1] = L ? enc(G) : G * 255; a[i + 2] = L ? enc(B) : B * 255;
            }
            tg.putImageData(d, 0, 0);
          }
          const ox = 3 + (j % 2) * (w + 3), oy = 22 + Math.floor(j / 2) * (h + 24);
          g.drawImage(t, ox, oy); g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText(names[j], ox + 3, oy - 6);
        });
        return c.toDataURL('image/png');
      }, [data, M]);
      save('cvd_' + f.replace('.png', ''), out);
    }
  }

  if (Object.keys(probes).length) fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(probes, null, 1));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
  console.log('wrote', fs.readdirSync(OUT).length, 'files to', OUT);
  await browser.close();
})();
