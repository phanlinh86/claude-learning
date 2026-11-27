// Visual QA capture for Pip's Oasis Glow: every screen on 4 viewports, every chapter with firefly / gold / sleepy
// friends, the page-turn transition and chapter banner, motion contact sheets (hop arc, squash, tongue, return,
// dizzy, friend pop / booped / woken, firefly → jar, ripples, tumbleweed, night fireflies), colour-vision sims and
// custom pictures.  Output: tests/out/visual/*.png.  Run: node tests/visual/capture.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const errs = [];
const only = process.argv[2] || '';   // optional: run one section ("screens", "moments", "motion", "cvd", "custom")

const VIEWS = [
  { id: 'desk', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { id: 'phone', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { id: 'ipad', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { id: 'ipadP', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
];

// ---- in-page helpers ----
const HELPERS = () => {
  const G = POG.Game;
  window.QA = {
    // deterministic advance: freeze real time and step the sim + renderer ourselves
    adv(sec) { G.speed = 0; const n = Math.round(sec * 120); for (let i = 0; i < n; i++) { G.step(1 / 120); G.renderer.update(1 / 120); } },
    clear() { G.world.holes.forEach(h => { h.critter = null; }); },
    put(i, kind, type, state, h = 1, t = 0.05) {
      const w = G.world; if (!w.holes[i]) return null;
      return (w.holes[i].critter = { kind, type, state, h, hPrev: h, hs: h, v: 0, t, upFor: 999, id: 100 + i, bounceAt: -1 });
    },
    // every row gets a firefly holder, a gold, a napper; one booped and one woken
    tableau(keep) {
      const w = G.world, n = w.holes.length, K = ['fennec', 'jerboa', 'tortoise'];
      const T = n === 6 ? ['firefly', 'sleepy', 'gold', 'sleepy', 'firefly', 'firefly']
        : n === 8 ? ['firefly', 'sleepy', 'gold', 'firefly', 'sleepy', 'firefly', 'sleepy', 'gold']
        : ['firefly', 'sleepy', 'gold', 'sleepy', 'gold', 'firefly', 'gold', 'firefly', 'sleepy'];
      QA.clear();
      for (let i = 0; i < n; i++) QA.put(i, K[i % 3], T[i], 'up');
      w.leaves = 3; w.score = 1230; w.combo = 6; w.mult = 2; w.levelBoops = 9;
      if (!keep) { G.renderer.texts.length = 0; G.renderer.banner = null; G.renderer.flyers.length = 0; G.renderer.rings.length = 0; }
    },
    grab(x, y, w, h, sc) {   // logical rect → canvas (optionally scaled)
      const R = G.renderer, c = R.canvas, k = R.k, o = document.createElement('canvas');
      sc = sc || 1; o.width = Math.round(w * sc); o.height = Math.round(h * sc);
      o.getContext('2d').drawImage(c, R.ox + x * k, R.oy + y * k, w * k, h * k, 0, 0, o.width, o.height);
      return o;
    },
    sheet(frames, cols, labels) {
      const fw = frames[0].width, fh = frames[0].height, rows = Math.ceil(frames.length / cols);
      const s = document.createElement('canvas'); s.width = cols * fw; s.height = rows * (fh + 20);
      const g = s.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, s.width, s.height);
      frames.forEach((f, i) => {
        const x = (i % cols) * fw, y = Math.floor(i / cols) * (fh + 20);
        g.drawImage(f, x, y + 20); g.fillStyle = '#fff'; g.font = '13px monospace'; g.fillText(labels[i] || String(i), x + 4, y + 15);
        g.strokeStyle = '#555'; g.strokeRect(x + .5, y + 20.5, fw - 1, fh - 1);
      });
      return s.toDataURL('image/jpeg', 0.82);
    },
    draw() { G.renderer.draw(G.mode); },
    raf() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
  };
};
const save = (d, name) => fs.writeFileSync(path.join(OUT, name), Buffer.from(d.split(',')[1], 'base64'));

async function open(b, v, q) {
  const ctx = await b.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, hasTouch: !!v.hasTouch, isMobile: !!v.isMobile });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(v.id + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(v.id + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&seed=7&adaptive=0' + (q || ''));
  await p.waitForFunction(() => window.POG && POG.debug && (POG.debug.mode === 'title' || POG.debug.mode === 'playing'), null, { timeout: 15000 });
  await p.evaluate(HELPERS);
  return p;
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name) });
const raf = p => p.evaluate(() => QA.raf());

async function cvd(p, kind) {
  const M = {
    protan: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
    deutan: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
    gray: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0'
  };
  await p.evaluate(([k, m]) => {
    let s = document.getElementById('qa-cvd');
    if (!s) { s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.id = 'qa-cvd'; s.setAttribute('width', 0); s.setAttribute('height', 0); s.style.position = 'absolute'; document.body.appendChild(s); }
    s.innerHTML = k ? `<filter id="f-${k}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${m}"/></filter>` : '';
    document.getElementById('stage').style.filter = k ? `url(#f-${k})` : '';
  }, [kind, M[kind]]);
}

async function photoPng(p, w, h, seed) {
  const d = await p.evaluate(([w, h, seed]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${200 + seed % 40},60%,70%)`); gr.addColorStop(1, `hsl(${30 + seed % 60},45%,45%)`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = `hsla(${r() * 360},50%,${50 + r() * 30}%,.25)`; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * w / 8, 0, 7); g.fill(); }
    g.fillStyle = '#8a5a3a'; g.beginPath(); g.ellipse(w / 2, h * 0.6, w * 0.28, h * 0.3, 0, 0, 7); g.fill();
    g.fillStyle = '#c99a6a'; g.beginPath(); g.arc(w / 2, h * 0.35, w * 0.18, 0, 7); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(w * 0.45, h * 0.33, w * 0.02, 0, 7); g.arc(w * 0.55, h * 0.33, w * 0.02, 0, 7); g.fill();
    return c.toDataURL('image/png');
  }, [w, h, seed]);
  return Buffer.from(d.split(',')[1], 'base64');
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ===== 1. every screen × viewport, every chapter in play =====
  if (!only || only === 'screens') for (const v of VIEWS) {
    const p = await open(b, v);
    await p.waitForTimeout(3500);
    await shot(p, `${v.id}_title.png`);
    for (const [scr, name] of [['scrHow', 'how'], ['scrSettings', 'settings'], ['scrCustom', 'custom']]) {
      await p.evaluate(s => POG.UI.open(s, 'scrTitle'), scr); await p.waitForTimeout(450);
      await shot(p, `${v.id}_${name}.png`);
    }
    await p.evaluate(() => { POG.UI.show('scrTitle'); POG.debug.startGame(); POG.Game._rotOk = true; });
    for (let lv = 0; lv < 4; lv++) {
      await p.evaluate(l => { if (l) POG.debug.gotoLevel(l); QA.adv(3.2); QA.tableau(); QA.adv(0.02); }, lv);
      await raf(p);
      await shot(p, `${v.id}_play_L${lv}.png`);
    }
    await p.evaluate(() => { POG.Game.speed = 1; POG.Game.pause(); }); await p.waitForTimeout(450);
    await shot(p, `${v.id}_pause.png`);
    await p.evaluate(() => { POG.Game.resume(); const w = POG.debug.world; Object.assign(w.stats, { boops: 23, golds: 2, wrong: 3, missed: 4, bestCombo: 9 }); POG.Game.gameOver(); });
    await p.waitForTimeout(900);
    await shot(p, `${v.id}_over.png`);
    await p.context().close();
  }

  // ===== 2. banner + page turn (desk + phone) =====
  if (!only || only === 'moments') for (const v of [VIEWS[0], VIEWS[1]]) {
    const p = await open(b, v, '&autostart=1&diff=easy');
    await p.waitForFunction(() => POG.debug.mode === 'playing');
    for (const lv of [0, 2, 3]) {
      for (const t of [0.15, 0.6, 1.3]) {
        await p.evaluate(([l, t]) => { POG.debug.gotoLevel(l); QA.adv(1.2); QA.tableau(true); POG.Game.renderer.showBanner(l); QA.adv(t); }, [lv, t]);
        await raf(p); await shot(p, `${v.id}_banner_L${lv}_${t}.png`);
      }
    }
    for (const [a, z] of [[0, 1], [2, 3]]) {
      await p.evaluate(a => { POG.debug.gotoLevel(a); QA.adv(3); QA.tableau(); }, a);
      const sh = await p.evaluate(async z => {
        const out = []; POG.debug.gotoLevel(z); let tt = 0;
        for (const t of [0.2, 0.5, 0.8]) { QA.adv(t - tt); tt = t; QA.draw(); out.push(QA.grab(0, 0, 960, 540, 0.5)); }
        return QA.sheet(out, 3, ['0.2s', '0.5s', '0.8s']);
      }, z);
      save(sh, `${v.id}_pageturn_${a}to${z}.jpg`);
    }
    // boop text + combo over the back row; wrong text
    await p.evaluate(() => { POG.debug.gotoLevel(2); QA.adv(3); QA.tableau(); QA.put(1, 'jerboa', 'firefly', 'up'); POG.debug.tap(1); QA.adv(0.35); });
    await raf(p); await shot(p, `${v.id}_boop_backrow.png`);
    await p.evaluate(() => { QA.adv(1.5); QA.tableau(); QA.put(4, 'fennec', 'sleepy', 'up'); POG.debug.tap(4); QA.adv(0.3); });
    await raf(p); await shot(p, `${v.id}_wrong_mid.png`);
    await p.context().close();
  }

  // ===== 3. motion contact sheets (desktop) =====
  if (!only || only === 'motion') {
    const p = await open(b, VIEWS[0], '&autostart=1&diff=easy');
    await p.waitForFunction(() => POG.debug.mode === 'playing');
    const run = (fn, name) => p.evaluate(fn).then(d => save(d, name));
    // hop to front-left (230,460), land squash, tongue, return hop, home squash
    await run(async () => {
      QA.adv(3); QA.clear(); const w = POG.debug.world; w.leaves = 4;
      QA.put(3, 'fennec', 'firefly', 'up'); POG.debug.tap(3);
      const fr = [], lb = []; let t = 0;
      for (let i = 0; i < 25; i++) { QA.draw(); fr.push(QA.grab(120, 40, 480, 450, 0.5)); lb.push(t.toFixed(2) + ' ' + w.pip.state + ' sq' + (w.pip.squash || 0).toFixed(2)); QA.adv(0.05); t += 0.05; }
      return QA.sheet(fr, 5, lb);
    }, 'desk_pip_hop_front_sheet.jpg');
    // fine-grained landing: squash + tongue every 1/60
    await run(async () => {
      QA.adv(2); QA.clear(); const w = POG.debug.world;
      QA.put(4, 'jerboa', 'gold', 'up'); POG.debug.tap(4);
      let n = 0; while (w.pip.state !== 'boop' && n++ < 400) QA.adv(1 / 120);
      QA.adv(-0); const fr = [], lb = [];
      for (let i = 0; i < 15; i++) { QA.draw(); fr.push(QA.grab(360, 220, 240, 240, 1)); lb.push((i / 60).toFixed(3) + ' ' + w.pip.state + ' ' + (w.pip.squash || 0).toFixed(2)); QA.adv(1 / 60); }
      return QA.sheet(fr, 5, lb);
    }, 'desk_pip_land_tongue_sheet.jpg');
    // full-frame trajectory overlay: hop to back-right then return (trail of Pip feet)
    await run(async () => {
      QA.adv(2); QA.clear(); const w = POG.debug.world;
      QA.put(2, 'tortoise', 'firefly', 'up'); POG.debug.tap(2);
      const pts = []; for (let i = 0; i < 240; i++) { QA.adv(1 / 120); pts.push([w.pip.x, w.pip.y, w.pip.state]); }
      QA.draw(); const c = QA.grab(0, 0, 960, 540, 1), g = c.getContext('2d');
      for (const [x, y, s] of pts) { g.fillStyle = s === 'hop' ? '#f0f' : s === 'return' ? '#0ff' : '#ff0'; g.fillRect(x - 2, y - 2, 4, 4); }
      return QA.sheet([c], 1, ['feet trail: magenta hop, cyan return, yellow boop/home']);
    }, 'desk_pip_trail.jpg');
    // dizzy (wake a napper in the back row)
    await run(async () => {
      QA.adv(2); QA.clear(); const w = POG.debug.world; w.leaves = 4;
      QA.put(1, 'jerboa', 'sleepy', 'up'); POG.debug.tap(1);
      const fr = [], lb = []; let t = 0;
      for (let i = 0; i < 15; i++) { QA.draw(); fr.push(QA.grab(300, 40, 360, 330, 0.66)); lb.push(t.toFixed(2) + ' ' + w.pip.state + ' ' + (w.holes[1].critter ? w.holes[1].critter.state : '-')); QA.adv(0.1); t += 0.1; }
      return QA.sheet(fr, 5, lb);
    }, 'desk_pip_dizzy_sheet.jpg');
    // friend pop (real rise physics), booped bounce, woken
    await run(async () => {
      QA.adv(2); QA.clear(); const w = POG.debug.world;
      POG.debug.spawn(4, 'firefly');
      const fr = [], lb = []; let t = 0;
      for (let i = 0; i < 10; i++) { QA.draw(); const c = w.holes[4].critter; fr.push(QA.grab(380, 240, 200, 260, 0.8)); lb.push('pop ' + t.toFixed(2) + ' h' + (c ? c.h.toFixed(2) : '-')); QA.adv(0.04); t += 0.04; }
      POG.debug.tap(4); t = 0;
      for (let i = 0; i < 10; i++) { QA.draw(); const c = w.holes[4].critter; fr.push(QA.grab(380, 240, 200, 260, 0.8)); lb.push('boop ' + t.toFixed(2) + ' ' + (c ? c.state : '-')); QA.adv(0.06); t += 0.06; }
      QA.adv(2); QA.clear(); QA.put(4, 'tortoise', 'sleepy', 'up'); QA.adv(0.02); POG.debug.tap(4); t = 0;
      for (let i = 0; i < 10; i++) { QA.draw(); const c = w.holes[4].critter; fr.push(QA.grab(380, 240, 200, 260, 0.8)); lb.push('wake ' + t.toFixed(2) + ' ' + (c ? c.state : '-')); QA.adv(0.08); t += 0.08; }
      return QA.sheet(fr, 10, lb);
    }, 'desk_friend_pop_boop_wake_sheet.jpg');
    // firefly flying to the jar (full stage, half size)
    await run(async () => {
      QA.adv(2); QA.clear(); const w = POG.debug.world;
      QA.put(5, 'fennec', 'firefly', 'up'); POG.debug.tap(5);
      let n = 0; while (!POG.Game.renderer.flyers.length && n++ < 400) QA.adv(1 / 120);
      const fr = [], lb = [];
      for (let i = 0; i < 8; i++) { QA.draw(); fr.push(QA.grab(240, 0, 720, 540, 0.5)); lb.push('flyer ' + (i * 0.08).toFixed(2)); QA.adv(0.08); }
      return QA.sheet(fr, 4, lb);
    }, 'desk_firefly_to_jar_sheet.jpg');
    // ripples on the pool (spring) after pipHome + ambient
    await run(async () => {
      QA.adv(1); QA.clear(); const w = POG.debug.world;
      QA.put(0, 'jerboa', 'firefly', 'up'); POG.debug.tap(0);
      let n = 0; while (w.pip.state !== 'home' && n++ < 1200) QA.adv(1 / 120);
      const fr = [], lb = [];
      for (let i = 0; i < 8; i++) { QA.draw(); fr.push(QA.grab(330, 60, 300, 130, 1)); lb.push('home+' + (i * 0.12).toFixed(2) + ' rip' + POG.Game.weather.ripples.length); QA.adv(0.12); }
      return QA.sheet(fr, 4, lb);
    }, 'desk_ripples_sheet.jpg');
    // tumbleweed in the dunes: run until one is on screen, then crop around it
    await run(async () => {
      POG.debug.gotoLevel(2); QA.adv(3); QA.clear(); const wx = POG.Game.weather;
      const tw = () => wx.particles.find(q => q.sprite === 'tumbleweed' && q.x > 60 && q.x < 900);
      let n = 0; while (!tw() && n++ < 60 * 40) QA.adv(1 / 60);
      const fr = [], lb = [];
      for (let i = 0; i < 10; i++) { const q = tw(); QA.draw(); if (q) { fr.push(QA.grab(Math.max(0, Math.min(760, q.x - 100)), Math.max(0, Math.min(340, q.y - 120)), 200, 200, 1)); lb.push('x' + q.x.toFixed(0) + ' y' + q.y.toFixed(0) + ' r' + q.rot.toFixed(1)); } QA.adv(0.1); }
      if (!fr.length) { QA.draw(); fr.push(QA.grab(0, 0, 960, 540, 0.4)); lb.push('no tumbleweed after 40 s'); }
      return QA.sheet(fr, 5, lb);
    }, 'desk_tumbleweed_sheet.jpg');
    // night ambient fireflies + stars (empty board, full stage)
    await run(async () => {
      POG.debug.gotoLevel(3); QA.adv(4); QA.clear(); const fr = [], lb = [];
      for (let i = 0; i < 4; i++) { QA.draw(); fr.push(QA.grab(0, 0, 960, 540, 0.5)); lb.push('night +' + (i * 0.5) + 's p' + POG.Game.weather.particles.length); QA.adv(0.5); }
      return QA.sheet(fr, 2, lb);
    }, 'desk_night_ambient_sheet.jpg');
    // spring + palms ambient
    await run(async () => {
      const fr = [], lb = [];
      for (const z of [0, 1]) { POG.debug.gotoLevel(z); QA.adv(4); QA.clear(); for (let i = 0; i < 2; i++) { QA.draw(); fr.push(QA.grab(0, 0, 960, 540, 0.5)); lb.push('zone ' + z + ' +' + i); QA.adv(0.7); } }
      return QA.sheet(fr, 2, lb);
    }, 'desk_day_ambient_sheet.jpg');
    // debug hit zones
    await p.goto(GAME + '?mute=1&seed=7&autostart=1&debug=1&adaptive=0'); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'playing'); await p.evaluate(HELPERS);
    for (const lv of [0, 2]) { await p.evaluate(l => { if (l) POG.debug.gotoLevel(l); QA.adv(3.2); QA.tableau(); QA.adv(0.02); }, lv); await raf(p); await shot(p, `desk_debug_L${lv}.png`); }
    await p.context().close();
  }

  // ===== 4. phone readability awake vs napping + colour-vision sims =====
  if (!only || only === 'cvd') {
    const p = await open(b, VIEWS[1], '&autostart=1&diff=normal');
    await p.waitForFunction(() => POG.debug.mode === 'playing');
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { if (l) POG.debug.gotoLevel(l); QA.adv(3.2); QA.tableau(); QA.adv(0.02); }, lv);
      await raf(p);
      for (const k of ['deutan', 'gray']) { await cvd(p, k); await raf(p); await shot(p, `phone_L${lv}_${k}.png`); }
      await cvd(p, '');
    }
    // "rise" h 0.45: a half-up napper vs half-up holder (the moment a child decides)
    await p.evaluate(() => { POG.debug.gotoLevel(2); QA.adv(3.2); QA.clear(); const K = ['fennec', 'jerboa', 'tortoise'];
      for (let i = 0; i < 9; i++) QA.put(i, K[i % 3], i % 2 ? 'sleepy' : 'firefly', 'rise', 0.45); QA.adv(0.01); POG.debug.world.holes.forEach(h => { if (h.critter) { h.critter.h = h.critter.hPrev = 0.45; h.critter.upFor = 999; } }); });
    await raf(p); await shot(p, 'phone_half_up.png');
    await p.context().close();
  }

  // ===== 5. custom pictures (via the customise screen's file input) =====
  if (!only || only === 'custom') for (const v of [VIEWS[0], VIEWS[1]]) {
    const p = await open(b, v);
    const hero = await photoPng(p, 900, 1200, 11), friend = await photoPng(p, 1200, 900, 23), bg = await photoPng(p, 1600, 900, 37);
    await p.evaluate(() => POG.UI.open('scrCustom', 'scrTitle')); await p.waitForTimeout(300);
    for (const [slot, buf, nm] of [['hero', hero, 'hero.png'], ['critter', friend, 'friend.png'], ['bg_spring', bg, 'bg.png'], ['bg_night', bg, 'bg2.png']]) {
      await p.evaluate(s => { POG.UI._pickSlot = s; }, slot);
      await p.setInputFiles('#filePick', { name: nm, mimeType: 'image/png', buffer: buf });
      await p.waitForFunction(s => POG.Assets.hasCustom(s), slot, { timeout: 8000 }).catch(() => errs.push('custom save timeout ' + slot));
      await p.waitForTimeout(300);
    }
    await p.evaluate(() => POG.UI.open('scrCustom', 'scrTitle')); await p.waitForTimeout(400);
    await shot(p, `${v.id}_custom_filled.png`);
    await p.evaluate(() => { POG.UI.back(); POG.debug.startGame(); POG.Game._rotOk = true; });
    for (const lv of [0, 2, 3]) {
      await p.evaluate(l => { if (l) POG.debug.gotoLevel(l); QA.adv(3.2); QA.tableau(); QA.adv(0.02); }, lv);
      await raf(p); await shot(p, `${v.id}_custom_play_L${lv}.png`);
    }
    await p.evaluate(() => { QA.tableau(); QA.put(3, 'fennec', 'firefly', 'up'); POG.debug.tap(3); QA.adv(0.22); });
    await raf(p); await shot(p, `${v.id}_custom_hop.png`);
    await p.context().close();
  }

  await b.close();
  if (errs.length) console.log('ERRORS\n' + errs.join('\n'));
  console.log('wrote', fs.readdirSync(OUT).length, 'files to', OUT);
})();
