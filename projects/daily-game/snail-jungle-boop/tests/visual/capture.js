// Visual QA capture: every screen on 4 viewports, every biome with critters in every state, colour-change moments,
// banner + biome crossfade, Zippy flight / dizzy contact sheets, colour-blind simulations, HUD vs notch, custom pictures.
// Output: tests/out/visual/*.png.  Run: node tests/visual/capture.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const errs = [];

const VIEWS = [
  { id: 'desk', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { id: 'phone', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { id: 'ipad', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { id: 'portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
];

// ---- in-page helpers (installed once per page) ----
const HELPERS = () => {
  const G = ZJB.Game;
  window.QA = {
    // deterministic advance: freeze the real-time loop and step the sim ourselves
    adv(sec) {
      G.speed = 0; const n = Math.round(sec * 60);
      for (let i = 0; i < n; i++) { G.step(1 / 60); G.renderer.update(1 / 60); }
    },
    clear() { const w = G.world; w.holes.forEach(h => { h.critter = null; }); },
    put(i, kind, colour, state, h = 1, t = 0.05) {
      const w = G.world; if (!w.holes[i]) return;
      w.holes[i].critter = { kind, colour, state, h, hPrev: h, hs: h, v: 0, t, upFor: 999, id: 100 + i };
    },
    // a mixed tableau: every state, every colour, every kind
    tableau(keepFx) {
      const w = G.world, n = w.holes.length, kinds = ['monkey', 'frog', 'toucan'], states = ['up', 'rise', 'booped', 'wow', 'up', 'up', 'rise', 'up', 'up'];
      QA.clear();
      for (let i = 0; i < n; i++) QA.put(i, kinds[i % 3], i % 4, states[i], states[i] === 'rise' ? 0.55 : 1, states[i] === 'booped' ? 0.06 : 0.05);
      w.leaves = 3; w.score = 1230; w.combo = 6; w.mult = 2; w.levelBoops = 9;
      if (!keepFx) { G.renderer.texts.length = 0; G.renderer.banner = null; }
    },
    grab(x, y, w, h) {   // logical-rect crop of the canvas → dataURL
      const R = G.renderer, c = R.canvas, k = R.k, o = document.createElement('canvas');
      o.width = Math.round(w * k); o.height = Math.round(h * k);
      o.getContext('2d').drawImage(c, R.ox + x * k, R.oy + y * k, w * k, h * k, 0, 0, o.width, o.height);
      return o;
    },
    sheet(frames, cols, labels) {
      const fw = frames[0].width, fh = frames[0].height, rows = Math.ceil(frames.length / cols);
      const s = document.createElement('canvas'); s.width = cols * fw; s.height = rows * (fh + 22);
      const g = s.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, s.width, s.height);
      frames.forEach((f, i) => {
        const x = (i % cols) * fw, y = Math.floor(i / cols) * (fh + 22);
        g.drawImage(f, x, y + 22); g.fillStyle = '#fff'; g.font = '14px monospace'; g.fillText(labels[i] || String(i), x + 6, y + 16);
        g.strokeStyle = '#555'; g.strokeRect(x + .5, y + 22.5, fw - 1, fh - 1);
      });
      return s.toDataURL('image/png');
    },
    raf() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
  };
};
const save = (dataUrl, name) => fs.writeFileSync(path.join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));

async function open(b, v, q) {
  const ctx = await b.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, hasTouch: !!v.hasTouch, isMobile: !!v.isMobile });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(v.id + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(v.id + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&seed=7&adaptive=0' + (q || ''));
  await p.waitForFunction(() => window.ZJB && ZJB.debug && (ZJB.debug.mode === 'title' || ZJB.debug.mode === 'playing'), null, { timeout: 15000 });
  await p.evaluate(HELPERS);
  return p;
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name) });
const raf = p => p.evaluate(() => QA.raf());

// colour-vision simulation (Viénot/Brettel-style matrices) applied to the whole page with an SVG filter
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

// photo-like PNG made in the page (gradient sky, bokeh, a blob "pet")
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
    const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (r() - .5) * 30; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; }
    g.putImageData(id, 0, 0);
    return c.toDataURL('image/png');
  }, [w, h, seed]);
  return Buffer.from(d.split(',')[1], 'base64');
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ===== 1. every screen × every viewport, every biome in play =====
  for (const v of VIEWS) {
    const p = await open(b, v);
    await p.waitForTimeout(2500);
    await shot(p, `${v.id}_title.png`);
    for (const [scr, name] of [['scrHow', 'how'], ['scrSettings', 'settings'], ['scrCustom', 'custom']]) {
      await p.evaluate(s => ZJB.UI.open(s, 'scrTitle'), scr); await p.waitForTimeout(450);
      await shot(p, `${v.id}_${name}.png`);
    }
    await p.evaluate(() => { ZJB.UI.show('scrTitle'); ZJB.debug.startGame(); });
    await p.waitForTimeout(400);
    if (v.id === 'portrait') {
      await shot(p, 'portrait_rotate_prompt.png');
      await p.evaluate(() => { ZJB.Game._rotOk = true; ZJB.Game.syncRotate(); });
    }
    for (let lv = 0; lv < 4; lv++) {
      await p.evaluate(l => { if (l) ZJB.debug.gotoLevel(l); QA.adv(3.2); QA.tableau(); QA.adv(0.02); }, lv);
      await raf(p);
      await shot(p, `${v.id}_play_L${lv}.png`);
    }
    // pause + game over
    await p.evaluate(() => { ZJB.Game.speed = 1; ZJB.Game.pause(); }); await p.waitForTimeout(450);
    await shot(p, `${v.id}_pause.png`);
    await p.evaluate(() => { ZJB.Game.resume(); const w = ZJB.debug.world; w.stats.boops = 23; w.stats.bestCombo = 9; ZJB.Game.gameOver(); });
    await p.waitForTimeout(900);
    await shot(p, `${v.id}_over.png`);
    // simulated notch (iPhone landscape 47 px / portrait 47 px top) with the HUD
    if (v.id === 'phone' || v.id === 'portrait') {
      await p.addStyleTag({ content: v.id === 'phone'
        ? '#safeProbe{padding:0 47px 21px 47px !important} .screen{padding:0 47px 21px 47px !important}'
        : '#safeProbe{padding:47px 0 34px 0 !important} .screen{padding:47px 0 34px 0 !important}' });
      await p.evaluate(() => { ZJB.debug.startGame(); ZJB.Game.relayout(); });
      await p.waitForTimeout(300);
      await p.evaluate(() => { QA.adv(3.2); QA.tableau(); QA.adv(0.02); });
      await p.evaluate(() => {   // draw the simulated notch / home bar so it shows on the shot
        const d = document.createElement('div'); d.id = 'qa-notch';
        d.style.cssText = 'position:fixed;z-index:99;pointer-events:none;background:rgba(0,0,0,.85);' + (innerWidth > innerHeight
          ? 'right:0;top:calc(50% - 105px);width:34px;height:210px;border-radius:20px 0 0 20px'
          : 'top:0;left:calc(50% - 63px);width:126px;height:37px;border-radius:0 0 20px 20px');
        document.body.appendChild(d);
      });
      await raf(p);
      await shot(p, `${v.id}_notch_hud.png`);
    }
    await p.context().close();
  }

  // ===== 2. desktop + phone: moments =====
  for (const v of [VIEWS[0], VIEWS[1]]) {
    const p = await open(b, v, '&autostart=1&diff=easy');
    await p.waitForFunction(() => ZJB.debug.mode === 'playing');
    // level banner over the canopy back row (L2) and the ruins (L3)
    for (const lv of [2, 3]) {
      await p.evaluate(l => { ZJB.debug.gotoLevel(l); QA.adv(0.05); QA.tableau(true); QA.adv(0.6); QA.tableau(true); }, lv);
      await raf(p); await shot(p, `${v.id}_banner_L${lv}.png`);
    }
    // crossfade frames L0→L1
    await p.evaluate(() => { ZJB.debug.gotoLevel(0); QA.adv(3); });
    const frames = await p.evaluate(async () => {
      const out = []; ZJB.debug.gotoLevel(1);
      for (const t of [0, 0.15, 0.3, 0.45, 0.6, 0.9]) { QA.adv(t - (out.t || 0)); out.t = t; await QA.raf(); out.push(QA.grab(0, 0, 960, 540)); }
      const scaled = out.map(c => { const s = document.createElement('canvas'); s.width = 480; s.height = 270; s.getContext('2d').drawImage(c, 0, 0, 480, 270); return s; });
      return QA.sheet(scaled, 3, ['0.00s', '0.15s', '0.30s', '0.45s', '0.60s', '0.90s']);
    });
    save(frames, `${v.id}_crossfade_sheet.png`);
    // colour-change warning and "New colour!"
    await p.evaluate(() => { ZJB.debug.gotoLevel(2); QA.adv(3); QA.tableau(); const w = ZJB.debug.world; w.nextColourIn = 0; QA.tableau(true); QA.adv(0.2); });
    await raf(p); await shot(p, `${v.id}_colour_warn_a.png`);
    await p.evaluate(() => { ZJB.Game.renderer.time += 0.125; }); await raf(p); await shot(p, `${v.id}_colour_warn_b.png`);
    await p.evaluate(() => { QA.adv(0.95); QA.tableau(true); QA.adv(0.15); }); await raf(p);
    await shot(p, `${v.id}_new_colour.png`);
    // combo + boop texts and Zippy on top of the back row
    await p.evaluate(() => { QA.tableau(); const w = ZJB.debug.world; w.colour = 1; QA.put(1, 'frog', 1, 'up'); ZJB.debug.tap(1); QA.adv(0.32); });
    await raf(p); await shot(p, `${v.id}_boop_backrow.png`);
    await p.context().close();
  }

  // ===== 3. Zippy flight / boop / return / dizzy contact sheets (desktop) =====
  {
    const p = await open(b, VIEWS[0], '&autostart=1&diff=easy');
    await p.waitForFunction(() => ZJB.debug.mode === 'playing');
    const sheet = await p.evaluate(async () => {
      QA.adv(3); QA.clear(); const w = ZJB.debug.world; w.colour = 0;
      QA.put(3, 'monkey', 0, 'up');   // front-left (230,460)
      ZJB.debug.tap(3);
      const fr = [], lb = []; let t = 0;
      for (let i = 0; i < 20; i++) { await QA.raf(); fr.push(QA.grab(100, 30, 480, 450)); lb.push(t.toFixed(2) + 's ' + w.zippy.state); QA.adv(0.06); t += 0.06; }
      const sc = fr.map(c => { const s = document.createElement('canvas'); s.width = 240; s.height = 225; s.getContext('2d').drawImage(c, 0, 0, 240, 225); return s; });
      return QA.sheet(sc, 5, lb);
    });
    save(sheet, 'desk_zippy_flight_sheet.png');
    const dz = await p.evaluate(async () => {
      QA.adv(1.2); QA.clear(); const w = ZJB.debug.world; w.colour = 0;
      QA.put(1, 'frog', 1, 'up');
      ZJB.debug.tap(1);
      const fr = [], lb = []; let t = 0;
      for (let i = 0; i < 10; i++) { await QA.raf(); fr.push(QA.grab(300, 30, 360, 330)); lb.push(t.toFixed(2) + 's ' + w.zippy.state + ' ' + (w.holes[1].critter ? w.holes[1].critter.state : '-')); QA.adv(0.08); t += 0.08; }
      const sc = fr.map(c => { const s = document.createElement('canvas'); s.width = 240; s.height = 220; s.getContext('2d').drawImage(c, 0, 0, 240, 220); return s; });
      return QA.sheet(sc, 5, lb);
    });
    save(dz, 'desk_zippy_dizzy_sheet.png');
    // flight to the far-right back burrow in the canopy: does Zippy cover the HUD / leave the stage?
    const far = await p.evaluate(async () => {
      ZJB.debug.gotoLevel(2); QA.adv(3); QA.clear(); const w = ZJB.debug.world; w.colour = 2;
      QA.put(2, 'toucan', 2, 'up'); QA.put(6, 'monkey', 2, 'up');
      ZJB.debug.tap(2); const fr = [], lb = [];
      for (let i = 0; i < 8; i++) { await QA.raf(); fr.push(QA.grab(0, 0, 960, 540)); lb.push(w.zippy.state); QA.adv(0.08); if (i === 3) ZJB.debug.tap(6); }
      const sc = fr.map(c => { const s = document.createElement('canvas'); s.width = 384; s.height = 216; s.getContext('2d').drawImage(c, 0, 0, 384, 216); return s; });
      return QA.sheet(sc, 4, lb.map((l, i) => i + ' ' + l + (i === 4 ? ' (retarget)' : '')));
    });
    save(far, 'desk_zippy_retarget_sheet.png');
    // ?debug=1 hit zones over the tableau in each biome
    await p.goto(GAME + '?mute=1&seed=7&autostart=1&debug=1&adaptive=0'); await p.waitForFunction(() => ZJB.debug && ZJB.debug.mode === 'playing'); await p.evaluate(HELPERS);
    for (let lv = 0; lv < 4; lv++) { await p.evaluate(l => { if (l) ZJB.debug.gotoLevel(l); QA.adv(3.2); QA.tableau(); QA.adv(0.02); }, lv); await raf(p); await shot(p, `desk_debug_L${lv}.png`); }
    await p.context().close();
  }

  // ===== 4. readability of the 4 stars at phone size + colour-blind sims =====
  {
    const p = await open(b, VIEWS[1], '&autostart=1&diff=normal');
    await p.waitForFunction(() => ZJB.debug.mode === 'playing');
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { if (l) ZJB.debug.gotoLevel(l); QA.adv(3.2); QA.clear(); const n = ZJB.debug.world.holes.length, k = ['monkey', 'frog', 'toucan'];
        for (let i = 0; i < n; i++) QA.put(i, k[i % 3], i % 4, 'up'); ZJB.Game.renderer.texts.length = 0; QA.adv(0.02); }, lv);
      await raf(p);
      for (const k of ['', 'deutan', 'protan', 'gray']) { await cvd(p, k); await raf(p); await shot(p, `phone_stars_L${lv}${k ? '_' + k : ''}.png`); }
      await cvd(p, '');
    }
    // 1:1 crop strip at real phone pixels: the 4 star sprites from canopy back row + front row
    await p.context().close();
  }

  // ===== 5. custom pictures =====
  for (const v of [VIEWS[0], VIEWS[1]]) {
    const p = await open(b, v);
    const hero = await photoPng(p, 900, 1200, 11), friend = await photoPng(p, 1200, 900, 23), bg = await photoPng(p, 1600, 900, 37);
    for (const [slot, buf, nm] of [['hero', hero, 'hero.png'], ['critter', friend, 'friend.png'], ['bg_riverbank', bg, 'bg.png'], ['bg_ruins', bg, 'bg2.png']]) {
      await p.evaluate(s => { ZJB.UI._pickSlot = s; }, slot);
      await p.setInputFiles('#filePick', { name: nm, mimeType: 'image/png', buffer: buf });
      await p.waitForFunction(() => !document.getElementById('toast').textContent.includes('Saving'), null, { timeout: 8000 }).catch(() => errs.push('custom save timeout ' + slot));
      await p.waitForTimeout(300);
    }
    await p.evaluate(() => ZJB.UI.open('scrCustom', 'scrTitle')); await p.waitForTimeout(400);
    await shot(p, `${v.id}_custom_filled.png`);
    await p.evaluate(() => { ZJB.UI.back(); ZJB.debug.startGame(); ZJB.Game._rotOk = true; });
    for (const lv of [0, 3]) {
      await p.evaluate(l => { if (l) ZJB.debug.gotoLevel(l); QA.adv(3.2); QA.tableau(); QA.adv(0.02); }, lv);
      await raf(p); await shot(p, `${v.id}_custom_play_L${lv}.png`);
    }
    // round shape
    await p.evaluate(() => { ZJB.Assets.setShape('hero', 'circle'); ZJB.Assets.setShape('critter', 'circle'); ZJB.Game.picturesChanged(); QA.tableau(); const w = ZJB.debug.world; w.colour = 0; QA.put(3, 'monkey', 0, 'up'); ZJB.debug.tap(3); QA.adv(0.25); });
    await raf(p); await shot(p, `${v.id}_custom_round_flight.png`);
    await p.context().close();
  }

  await b.close();
  if (errs.length) { console.log('ERRORS\n' + errs.join('\n')); }
  console.log('wrote', fs.readdirSync(OUT).length, 'files to', OUT);
})();
