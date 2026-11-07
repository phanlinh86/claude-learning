// Visual QA capture: every screen at 3 sizes, every chapter in play (landscape + portrait), the chapter change,
// Fizz's visit, motion contact sheets, custom pictures and colour-blind simulations. Report-only: writes PNGs to
// tests/out/visual/ (gitignored). Run:  NODE_PATH=$(npm root -g) node tests/visual/capture.js [group...]
// groups: screens chapters change fizz motion custom cvd   (default: all)
//
// The game is frozen with PO.debug.setSpeed(0) and advanced by hand with fixed 1/120 s steps (Game.step +
// Renderer.update), then drawn synchronously, so every frame is deterministic for the seed.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2); const on = g => !want.length || want.includes(g);

// device profiles. `safe` = simulated safe-area insets in CSS px (Chromium has no env(safe-area-inset-*)).
const DEV = {
  desk:    { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, safe: [0, 0, 0, 0] },
  phone:   { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, safe: [47, 0, 34, 0], notch: 'portrait' },
  phoneL:  { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, safe: [0, 47, 21, 47], notch: 'landscape' },
  ipad:    { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, safe: [24, 0, 20, 0], notch: 'bar' },
  ipadP:   { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, safe: [24, 0, 20, 0], notch: 'bar' }
};
const errs = [];
let browser;

async function open(dev, query) {
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, hasTouch: !!d.hasTouch, isMobile: !!d.isMobile });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(dev + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(dev + ' console: ' + m.text()); });
  await p.goto(GAME + '?mute=1&adaptive=0&seed=7' + (query ? '&' + query : ''));
  await p.waitForFunction(() => window.PO && PO.debug && PO.debug.mode !== 'boot' && PO.Game.world, null, { timeout: 20000 });
  const [t, r, b, l] = d.safe;
  await p.addStyleTag({ content: `#safeProbe{padding:${t}px ${r}px ${b}px ${l}px !important}
    .screen{padding:${t}px ${r}px ${b}px ${l}px !important}` });
  // draw the device furniture so overlaps are visible (pointer-events none, above everything)
  if (d.notch) await p.evaluate(kind => {
    const css = 'position:fixed;z-index:9999;pointer-events:none;background:rgba(0,0,0,.92);';
    const add = s => { const e = document.createElement('div'); e.style.cssText = css + s; document.body.appendChild(e); };
    if (kind === 'portrait') { add('top:11px;left:50%;width:126px;height:37px;margin-left:-63px;border-radius:20px'); add('bottom:8px;left:50%;width:134px;height:5px;margin-left:-67px;border-radius:3px'); }
    if (kind === 'landscape') { add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px'); add('bottom:7px;left:50%;width:200px;height:5px;margin-left:-100px;border-radius:3px'); }
    if (kind === 'bar') add('bottom:7px;left:50%;width:300px;height:5px;margin-left:-150px;border-radius:3px');
  }, d.notch);
  await p.evaluate(() => {
    PO.Game.relayout();
    const G = PO.Game;
    window.__adv = (sec, until) => {          // advance game time by `sec` (or until predicate) in 1/120 s steps
      const h = 1 / 120, n = Math.round(sec / h);
      for (let i = 0; i < n; i++) { G.step(h); G.renderer.update(h); if (until && until()) return true; }
      return false;
    };
    window.__draw = () => G.renderer.draw(G.mode);
    // crop a logical rect of the canvas (null = whole canvas), scaled to `outW` css px wide
    window.__grab = (rect, outW) => {
      const R = G.renderer, c = R.canvas, px = R.px;
      const [x, y, w, h] = rect || [0, 0, R.VW, R.VH];
      const o = document.createElement('canvas'), k = outW / w; o.width = outW; o.height = Math.round(h * k);
      o.getContext('2d').drawImage(c, x * px, y * px, w * px, h * px, 0, 0, o.width, o.height);
      return o.toDataURL('image/png');
    };
    window.__heroRect = (wU, up, down) => {   // rect around Pebble in logical px
      const R = G.renderer, L = R.laneW0, cx = Math.max(wU * L, Math.min(R.VW - wU * L, R.proj(G.world.hero.x, 0, 0, R.camX()).sx));
      return [cx - wU * L, R.footY - up * L, 2 * wU * L, (up + down) * L];
    };
    window.__clear = () => { const w = G.world; w.objects.length = 0; w.boss.state = 'away'; w.boss.nextT = 999; };
    window.__sheet = (frames, cols, labels, title) => {   // compose data-URL frames into a labelled grid
      return Promise.all(frames.map(src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; }))).then(ims => {
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
    };
  });
  return p;
}
const save = (name, dataUrl) => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
const shot = async (p, name) => { await p.evaluate(() => window.__draw && __draw()); await p.screenshot({ path: path.join(OUT, name + '.png') }); };
const freezePlay = async (p, opts) => {
  await p.evaluate(o => {
    const G = PO.Game; G.speed = 1; G.startGame(); PO.debug.setSpeed(0);
    if (o && o.bot) PO.debug.setBot(true, o.bot); else PO.debug.setBot(false);
    if (o && o.level) PO.debug.gotoLevel(o.level);
  }, opts || {});
};

// motion sheet: run `setup` (in page), then capture `n` frames `dt` apart around Pebble (or whole canvas)
async function motion(p, name, title, setup, { n = 16, dt = 0.06, cols = 8, rect = 'hero', outW = 220, pre = 0 } = {}) {
  await p.evaluate(setup);
  if (pre) await p.evaluate(s => __adv(s), pre);
  const frames = [], labels = [];
  for (let i = 0; i < n; i++) {
    const f = await p.evaluate(([r, w]) => {
      __draw();
      const rect = r === 'hero' ? __heroRect(1.2, 2.6, 0.4) : r === 'wide' ? __heroRect(2.6, 3.4, 0.5) : r;
      return __grab(rect, w);
    }, [rect, outW]);
    const st = await p.evaluate(() => { const h = PO.Game.world.hero; return 'x' + h.x.toFixed(2) + ' y' + h.y.toFixed(2); });
    frames.push(f); labels.push(Math.round(i * dt * 1000) + 'ms ' + st);
    await p.evaluate(s => __adv(s), dt);
  }
  save(name, await p.evaluate(([f, c, l, t]) => __sheet(f, c, l, t), [frames, cols, labels, title]));
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------------------------------------------------------------- screens × 3 sizes
  if (on('screens')) for (const dev of ['desk', 'phone', 'ipad', 'phoneL']) {
    const p = await open(dev);
    await p.waitForTimeout(2500);
    await shot(p, `screen_${dev}_title`);
    for (const [id, nm] of [['scrHow', 'how'], ['scrSettings', 'settings'], ['scrCustom', 'custom']]) {
      await p.evaluate(i => PO.UI.open(i, 'scrTitle'), id); await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(OUT, `screen_${dev}_${nm}.png`) });
      // scrolled-to-bottom too, when the panel scrolls
      const scrolls = await p.evaluate(i => { const el = document.querySelector('#' + i + ' .panel'); if (el && el.scrollHeight > el.clientHeight + 4) { el.scrollTop = 1e5; return true; } return false; }, id);
      if (scrolls) { await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, `screen_${dev}_${nm}_scrolled.png`) }); }
    }
    await p.evaluate(() => PO.UI.show('scrTitle'));
    await freezePlay(p, { bot: 0.9 });
    await p.evaluate(() => __adv(0.5)); await shot(p, `screen_${dev}_play_banner`);
    await p.evaluate(() => __adv(6)); await shot(p, `screen_${dev}_play_hints`);
    await p.evaluate(() => PO.Game.pause()); await p.waitForTimeout(500); await shot(p, `screen_${dev}_pause`);
    await p.evaluate(() => PO.Game.resume());
    await p.evaluate(() => {
      PO.debug.setBot(false); const w = PO.Game.world; w.hearts = 1; w.shells = 37; w.score = 1240;
      w.spawn('pots', Math.round(w.hero.x), 3); __adv(5, () => PO.Game.mode === 'over');
    });
    await p.waitForTimeout(800); await shot(p, `screen_${dev}_over`);
    await p.context().close();
  }

  // ---------------------------------------------------------------- every chapter in play
  if (on('chapters')) for (const dev of ['desk', 'phoneL', 'phone', 'ipad', 'ipadP']) {
    const p = await open(dev);
    await freezePlay(p, { bot: 0.95 });
    for (let lv = 0; lv < 4; lv++) {
      await p.evaluate(l => { PO.debug.gotoLevel(l); __adv(4.5); PO.Game.renderer.hintOn = false; }, lv);
      await shot(p, `chapter${lv}_${dev}`);
    }
    // a busy moment: shells + pots + log + tumble in view at night, with Fizz hovering (clutter / contrast check)
    await p.evaluate(() => {
      const w = PO.Game.world; w.objects.length = 0; PO.debug.setBot(false);
      w.spawn('pots', -1, 6); w.spawn('log', 1, 9); w.spawn('tumble', 0, 14); w.spawn('pots', 0, 20); w.spawn('log', -1, 26);
      for (let i = 0; i < 5; i++) w.spawn('shell', 0, 4 + i * 0.9, { variant: i });
      for (let i = 0; i < 4; i++) w.spawn('shell', 1, 13 + i * 0.9, { variant: i + 1 });
      w.boss.nextT = 0; __adv(1.5);
    });
    await shot(p, `busy_night_${dev}`);
    await p.evaluate(() => { PO.debug.gotoLevel(0); __adv(2); const w = PO.Game.world; w.objects.length = 0;
      w.spawn('pots', -1, 6); w.spawn('log', 1, 9); w.spawn('pots', 0, 20); for (let i = 0; i < 5; i++) w.spawn('shell', 0, 4 + i * 0.9, { variant: i });
      for (let i = 0; i < 4; i++) w.spawn('shell', 1, 13 + i * 0.9, { variant: i + 1 }); __adv(0.05); PO.Game.renderer.banner = null; });
    await shot(p, `busy_grove_${dev}`);
    await p.context().close();
  }

  // ---------------------------------------------------------------- chapter change, arch, banner
  if (on('change')) for (const dev of ['desk', 'phone']) {
    const p = await open(dev);
    await freezePlay(p, { bot: 1 });
    await p.evaluate(() => { __adv(3); const w = PO.Game.world; w.levelDist = w.goal - 22; w.endS = w.dist + 22; __clear(); PO.Game.renderer.hintOn = false; });
    for (const [z, nm] of [[20, 'arch_far'], [10, 'arch_mid'], [4, 'arch_near'], [1.2, 'arch_through']]) {
      await p.evaluate(zz => { const w = PO.Game.world; __adv(5, () => w.endS - w.dist <= zz || w.level > 0); }, z);
      await shot(p, `change_${dev}_${nm}`);
    }
    await p.evaluate(() => { const w = PO.Game.world; __adv(3, () => w.level > 0); });
    for (const [t, nm] of [[0.05, 't0.05'], [0.3, 't0.35'], [0.35, 't0.7'], [0.5, 't1.2'], [1.6, 't2.8']]) {
      await p.evaluate(s => __adv(s), t); await shot(p, `change_${dev}_xfade_${nm}`);
    }
    // night → book 2 loop banner
    await p.evaluate(() => { PO.debug.gotoLevel(3); __adv(3); const w = PO.Game.world; w.levelDist = w.goal - 3; w.endS = w.dist + 3; __adv(3, () => w.level > 3); __adv(0.6); });
    await shot(p, `change_${dev}_loop_banner`);
    await p.context().close();
  }

  // ---------------------------------------------------------------- Fizz's visit
  if (on('fizz')) for (const dev of ['desk', 'phone', 'phoneL']) {
    const p = await open(dev);
    await freezePlay(p, { bot: 1 });
    await p.evaluate(() => { __adv(4); __clear(); PO.Game.renderer.hintOn = false; PO.Game.renderer.banner = null; PO.Game.world.boss.nextT = 2.4; __adv(0.2); });
    await shot(p, `fizz_${dev}_0coming`);
    const B = 'PO.Game.world.boss';
    const steps = [
      ['1enter', `${B}.state==='enter' && ${B}.t>0.7`],
      ['2windup', `${B}.state==='hover' && ${B}.windup>0.7`],
      ['3flight_early', `PO.Game.world.objects.some(o=>o.kind==='pillow'&&o.state==='fly'&&o.p>0.25)`],
      ['4flight_late', `PO.Game.world.objects.some(o=>o.kind==='pillow'&&o.state==='fly'&&o.p>0.8)`],
      ['5landed', `PO.Game.world.objects.some(o=>o.kind==='pillow'&&o.state==='live')`],
      ['6hover_more', `${B}.thrown>=3`],
      ['7leave', `${B}.state==='leave' && ${B}.t>0.25`],
      ['8bonus', `${B}.state==='away'`]
    ];
    for (const [nm, cond] of steps) {
      const ok = await p.evaluate(c => __adv(25, new Function('return ' + c)), cond);
      if (!ok) errs.push(dev + ' fizz step never reached ' + nm);
      await shot(p, `fizz_${dev}_${nm}`);
    }
    // the pillow arc as a contact sheet (wide frame)
    if (dev === 'desk') {
      await motion(p, 'motion_pillow_flight', 'Pillow thrown into Pebble\'s lane (shadow warning → land), 80 ms', () => {
        __clear(); PO.debug.setBot(false); const w = PO.Game.world; w.boss.nextT = 0; __adv(1.4);
      }, { n: 24, dt: 0.08, cols: 6, rect: null, outW: 400, pre: 0.6 });
    }
    await p.context().close();
  }

  // ---------------------------------------------------------------- motion contact sheets
  if (on('motion')) {
    const p = await open('desk');
    await freezePlay(p);
    await p.evaluate(() => { __adv(4); __clear(); PO.Game.renderer.hintOn = false; PO.Game.renderer.banner = null; });
    const reset = 'const w = PO.Game.world, h = w.hero; __clear(); h.invuln = 0; w.hearts = 3; ';
    await motion(p, 'motion_lane_change', 'Lane change centre → left → right right (lean), 60 ms', new Function(reset + 'PO.debug.move(-1);'), { n: 16, rect: 'wide', outW: 260 });
    // double swipe right: the second move is issued mid-change (queued)
    await p.evaluate(new Function(reset + '__adv(0.5);'));
    {
      const frames = [], labels = [];
      for (let i = 0; i < 16; i++) {
        if (i === 0) await p.evaluate(() => PO.debug.move(1));
        if (i === 3) await p.evaluate(() => PO.debug.move(1));
        frames.push(await p.evaluate(() => { __draw(); return __grab(__heroRect(2.6, 3.4, 0.5), 260); }));
        labels.push(i * 60 + 'ms ' + await p.evaluate(() => { const h = PO.Game.world.hero; return 'x' + h.x.toFixed(2) + ' tilt' + (h.tilt || 0).toFixed(2); }));
        await p.evaluate(() => __adv(0.06));
      }
      save('motion_lane_double', await p.evaluate(([f, l]) => __sheet(f, 8, l, 'Double swipe right (queued) from left lane, 60 ms'), [frames, labels]));
    }
    await motion(p, 'motion_jump', 'Jump arc: stretch on take-off, squash on landing, 60 ms', new Function(reset + 'PO.debug.jump();'), { n: 16 });
    await motion(p, 'motion_bump_pots', 'Bump into pots (no jump), 60 ms', new Function(reset + 'w.spawn("pots", Math.round(h.x), 2.4);'), { n: 16, rect: 'wide', outW: 260 });
    await p.evaluate(() => __adv(2));
    await motion(p, 'motion_bump_log', 'Bump into a log (no jump), 60 ms', new Function(reset + 'w.spawn("log", Math.round(h.x), 2.4);'), { n: 16, rect: 'wide', outW: 260 });
    await p.evaluate(() => __adv(2));
    await motion(p, 'motion_bump_pillow', 'Bump into a resting pillow, 60 ms', new Function(reset + 'w.spawn("pillow", Math.round(h.x), 2.4);'), { n: 16, rect: 'wide', outW: 260 });
    await p.evaluate(() => __adv(2));
    await motion(p, 'motion_jump_log', 'Jump over a log, 60 ms', new Function(reset + 'w.spawn("log", Math.round(h.x), 3.6); PO.debug.jump();'), { n: 16, rect: 'wide', outW: 260 });
    await motion(p, 'motion_shells', 'Shell pickup → flyer to the HUD counter, 60 ms', new Function(reset + 'for (let i=0;i<4;i++) w.spawn("shell", Math.round(h.x), 1.5 + i*0.9, {variant:i});'), { n: 16, rect: null, outW: 320 });
    await p.evaluate(() => PO.debug.gotoLevel(2)); await p.evaluate(() => __adv(3.4));
    await motion(p, 'motion_tumble', 'Tumbleweed waking, rolling across and bouncing (bazaar), 60 ms', new Function(reset + 'PO.Game.renderer.banner = null; w.spawn("tumble", 1, 9, {wake: 0.2});'), { n: 24, cols: 6, rect: 'wide', outW: 300 });
    await p.context().close();
  }

  // ---------------------------------------------------------------- custom pictures
  if (on('custom')) for (const dev of ['desk', 'phone']) {
    const p = await open(dev);
    await p.evaluate(async () => {
      const mk = (w, h, draw) => new Promise(r => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); c.toBlob(b => r(new File([b], 'x.png', { type: 'image/png' })), 'image/png'); });
      // a "pet photo": opaque, busy background, a face
      const photo = await mk(800, 600, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a6b35'); gr.addColorStop(1, '#c9d66b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 37 % 360},50%,${40 + i % 30}%)`; g.fillRect((i * 97) % w, (i * 53) % h, 60, 40); }
        g.fillStyle = '#8b5a2b'; g.beginPath(); g.ellipse(400, 320, 200, 180, 0, 0, 7); g.fill();
        g.fillStyle = '#5a3a1e'; g.beginPath(); g.ellipse(250, 180, 60, 100, -0.4, 0, 7); g.ellipse(550, 180, 60, 100, 0.4, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(330, 290, 30, 0, 7); g.arc(470, 290, 30, 0, 7); g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(335, 295, 15, 0, 7); g.arc(475, 295, 15, 0, 7); g.arc(400, 380, 25, 0, 7); g.fill();
      });
      // a transparent cut-out drawing (shell)
      const cut = await mk(300, 300, (g) => {
        g.fillStyle = '#ffd400'; g.strokeStyle = '#b07a00'; g.lineWidth = 12;
        g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 60 : 135; g.lineTo(150 + r * Math.cos(a), 155 + r * Math.sin(a)); } g.closePath(); g.fill(); g.stroke();
      });
      // a photo background (landscape)
      const bg = await mk(1600, 900, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d4e89'); gr.addColorStop(0.6, '#f79256'); gr.addColorStop(1, '#2d6a4f'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#183a37'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(i * 150, h); g.lineTo(i * 150 + 75, h * 0.45 + (i % 3) * 60); g.lineTo(i * 150 + 150, h); g.fill(); }
        g.fillStyle = '#fff6'; g.beginPath(); g.arc(1200, 200, 90, 0, 7); g.fill();
      });
      await PO.Assets.setCustom('hero', photo);
      await PO.Assets.setCustom('shell', cut);
      await PO.Assets.setCustom('bg_grove', bg);
      await PO.Assets.setCustom('bg_night', bg);
      PO.Game.picturesChanged();
    });
    await p.evaluate(() => PO.UI.open('scrCustom', 'scrTitle')); await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `custom_${dev}_screen.png`) });
    await p.evaluate(() => PO.UI.show('scrTitle'));
    await freezePlay(p, { bot: 0.95 });
    await p.evaluate(() => { __adv(4); PO.Game.renderer.hintOn = false; const w = PO.Game.world; for (let i = 0; i < 4; i++) w.spawn('shell', Math.round(w.hero.x), 3 + i, { variant: i }); w.spawn('shell', -1, 8); __adv(0.05); });
    await shot(p, `custom_${dev}_play_grove`);
    await p.evaluate(() => { PO.debug.jump(); __adv(0.25); });
    await shot(p, `custom_${dev}_play_jump`);
    await p.evaluate(() => { PO.debug.gotoLevel(3); __adv(4); });
    await shot(p, `custom_${dev}_play_night`);
    // transparent hero cut-out too ("Whole picture")
    await p.evaluate(async () => { PO.Assets.setShape('hero', 'fit'); PO.Game.picturesChanged(); __adv(0.1); });
    await shot(p, `custom_${dev}_play_hero_fit`);
    await p.evaluate(() => { PO.Assets.SLOTS.forEach(s => PO.Assets.clearCustom(s.id)); PO.Game.picturesChanged(); });
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
    const srcs = fs.readdirSync(OUT).filter(f => /^(busy_(grove|night)_(desk|phone)|chapter[0-3]_desk|fizz_desk_4flight_late|fizz_phone_3flight_early)\.png$/.test(f));
    for (const f of srcs) {
      const data = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
      const out = await p.evaluate(async ([src, M]) => {
        const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const k = Math.min(1, 640 / im.width), w = Math.round(im.width * k), h = Math.round(im.height * k);
        const c = document.createElement('canvas'); c.width = w * 4 + 15; c.height = h + 24; const g = c.getContext('2d');
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
          g.drawImage(t, 3 + j * (w + 4), 22); g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText(names[j], 6 + j * (w + 4), 16);
        });
        return c.toDataURL('image/png');
      }, [data, M]);
      save('cvd_' + f.replace('.png', ''), out);
    }
  }

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
  console.log('wrote', fs.readdirSync(OUT).length, 'files to', OUT);
  await browser.close();
})();
