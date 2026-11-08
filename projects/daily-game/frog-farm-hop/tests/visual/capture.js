// Visual QA capture for Clover's Farm Hop (report-only; never edits game/).
// Every screen at 4 viewports (with simulated notch safe areas on the touch devices), each weather level (start with
// the farmyard, mid-level, wind warning, gust), the level crossfade + banner, event moments (fall + trampoline rescue,
// spring, puff poof, firefly +10 and flyer to the jar, lantern full), motion contact sheets, colour-blind checks of
// fireflies vs platforms vs sky, and a run with custom pictures (opaque photo + transparent cut-out).
// Output: tests/out/visual/*.png   Run: node tests/visual/capture.js [only=screens,zones,fade,events,motion,cvd,custom]
// Motion sheets freeze the game (setSpeed(0)) and step it by exact 1/120 s world steps: each 1/40 s sheet step equals
// ~2.4 consecutive display frames at speed 0.25 (sampled so a whole bounce fits one sheet).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv.find(a => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
const want = n => !only.length || only.includes(n);
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 } },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
};
// simulated safe areas (iPhone 14/15 notch / Dynamic Island + home indicator; iPad home indicator)
const SAFE = { desk: null, ipad: [24, 0, 20, 0], phone: [47, 0, 34, 0], phoneL: [0, 47, 21, 47] };
const errs = [];

async function open(b, view, q) {
  const ctx = await b.newContext(VIEWS[view]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(view + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(view + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.FH && FH.debug && FH.Game && FH.Game.mode !== 'boot', null, { timeout: 15000 });
  const sa = SAFE[view];
  if (sa) {
    const pad = sa.map(v => v + 'px').join(' ');
    await p.addStyleTag({ content: `#safeProbe{padding:${pad} !important} .screen{padding:${pad} !important}
      body::after{content:"";position:fixed;z-index:99;pointer-events:none;inset:0;
        border-style:solid;border-color:rgba(255,0,255,.28);border-width:${pad}}` });
    await p.evaluate(() => FH.Game.relayout());
  }
  await p.evaluate(() => {
    window.VQ = {
      adv(sec) {   // exact world steps; renderer juice advanced in step
        const G = FH.Game, h = 1 / 120; let n = Math.round(sec / h);
        while (n-- > 0) { G.step(h); G.renderer.update(h); }
      },
      frame() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); },
      clip(x, y, w, h) {   // CSS-px clip around a logical rect
        const R = FH.Game.renderer, c = R.canvas.getBoundingClientRect(), s = c.width / R.VW;
        const X = Math.max(0, c.left + x * s), Y = Math.max(0, c.top + y * s);
        return { x: Math.round(X), y: Math.round(Y), width: Math.round(Math.min(innerWidth - X, w * s)), height: Math.round(Math.min(innerHeight - Y, h * s)) };
      },
      full() { const R = FH.Game.renderer; return VQ.clip(0, 0, R.VW, R.VH); },
      // a fixed box (units) around a world point
      box(xw, yw, wu, hu) {
        const R = FH.Game.renderer, cam = R.cam(), u = R.unit;
        return VQ.clip(R.sx(xw) - wu / 2 * u, R.sy(yw, cam) - hu * u, wu * u, hu * u + 0.6 * u);
      },
      quiet() { const R = FH.Game.renderer; R.banner = null; R.hintOn = false; R._windMsg = 0; const w = FH.debug.world; w.wind.state = 'calm'; w.wind.next = 999; w.wind.strength = 0; },
      // clear platforms around Clover and put her above one platform (or none) of `kind`
      stage(kind, opts, dy) {
        const w = FH.debug.world, h = w.hero;
        FH.debug.setBot(false); w.steer(0);
        const y0 = w.camY + 3.0;
        w.platforms = w.platforms.filter(p => Math.abs(p.y - y0) > 7);
        w.fireflies = w.fireflies.filter(f => Math.abs(f.y - y0) > 7);
        let p = null;
        if (kind) p = w.spawn(kind, 6, y0, opts || {});
        h.x = h.prevX = 6; h.y = h.prevY = y0 + (dy == null ? 1.6 : dy); h.vx = 0; h.vy = 0; h.invuln = 0; h.rescueT = 0; h.mood = 'fall';
        return p ? p.y : y0;
      },
      st() { const w = FH.debug.world, h = w.hero; return 't' + w.time.toFixed(2) + ' ' + h.mood + ' vy' + h.vy.toFixed(1) + (h.squash > 0.02 ? ' sq' + h.squash.toFixed(2) : '') + (h.stretch > 0.02 ? ' st' + h.stretch.toFixed(2) : ''); }
    };
  });
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: OUT + '/' + name + '.png', clip });

async function compose(b, name, frames, cols) {
  const c = cols || Math.min(6, frames.length);
  const w0 = frames[0].w, sc = Math.min(1, 1900 / (c * w0)), W = Math.round(w0 * sc);
  const html = '<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(' + c + ',' + W + 'px);gap:4px">' +
    frames.map(f => '<div style="position:relative"><img style="width:' + W + 'px;display:block" src="data:image/png;base64,' + f.b64 +
      '"><span style="position:absolute;left:3px;top:2px;color:#0f0;font:11px monospace;background:#000b;padding:0 2px">' + f.label + '</span></div>').join('') + '</body>';
  const q = await b.newPage({ viewport: { width: Math.round(c * (W + 4)), height: 200 } });
  await q.setContent(html); await q.waitForTimeout(150);
  await q.screenshot({ path: OUT + '/sheet_' + name + '.png', fullPage: true }); await q.close();
}
async function stepSheet(b, p, name, n, dt, clip, cols, before) {
  const frames = [];
  if (before) await p.evaluate(before);
  for (let i = 0; i < n; i++) {
    await p.evaluate(() => VQ.frame());
    const label = await p.evaluate(() => VQ.st());
    frames.push({ label, w: clip.width, b64: (await p.screenshot({ clip })).toString('base64') });
    await p.evaluate(d => VQ.adv(d), dt);
  }
  await compose(b, name, frames, cols);
}
async function frozenRun(b, view, extra) {
  const p = await open(b, view, '&autostart=1&diff=easy' + (extra || ''));
  await p.evaluate(() => { FH.debug.setSpeed(0); });
  await p.evaluate(() => { FH.debug.setBot(true, 1); VQ.adv(6); VQ.quiet(); });
  return p;
}

async function makePictures(p) {
  const imgs = await p.evaluate(() => {
    const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c.toDataURL('image/png'); };
    const photo = (g, w, h, sky) => {   // photo-like: gradients, noise, a big subject
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { g.fillStyle = 'rgba(' + (Math.random() * 255 | 0) + ',' + (Math.random() * 255 | 0) + ',' + (Math.random() * 255 | 0) + ',.08)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    };
    return {
      hero_photo: mk(600, 450, (g, w, h) => { photo(g, w, h, ['#6d8f5a', '#3a4a2a']);
        g.fillStyle = '#c98a4b'; g.beginPath(); g.ellipse(300, 240, 150, 140, 0, 0, 7); g.fill();
        g.fillStyle = '#7a4a22'; g.beginPath(); g.ellipse(170, 140, 50, 90, -0.4, 0, 7); g.ellipse(430, 140, 50, 90, 0.4, 0, 7); g.fill();
        g.fillStyle = '#222'; g.beginPath(); g.arc(250, 210, 20, 0, 7); g.arc(350, 210, 20, 0, 7); g.fill();
        g.fillStyle = '#3a2418'; g.beginPath(); g.ellipse(300, 275, 30, 20, 0, 0, 7); g.fill(); }),
      hero_cut: mk(400, 500, (g) => {   // transparent cut-out: a kid drawing of a cat
        g.lineWidth = 10; g.strokeStyle = '#4a2a10'; g.fillStyle = '#ffa94d';
        g.beginPath(); g.ellipse(200, 330, 130, 150, 0, 0, 7); g.fill(); g.stroke();
        g.beginPath(); g.arc(200, 170, 110, 0, 7); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(110, 110); g.lineTo(120, 20); g.lineTo(180, 80); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(290, 110); g.lineTo(280, 20); g.lineTo(220, 80); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#222'; g.beginPath(); g.arc(160, 160, 14, 0, 7); g.arc(240, 160, 14, 0, 7); g.fill(); }),
      firefly_cut: mk(300, 300, (g) => { g.fillStyle = '#e8559a'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 60 : 140; g.lineTo(150 + r * Math.cos(a), 150 + r * Math.sin(a)); } g.closePath(); g.fill();
        g.lineWidth = 8; g.strokeStyle = '#7a1f4a'; g.stroke(); }),
      firefly_photo: mk(320, 240, (g, w, h) => { photo(g, w, h, ['#223', '#556']); g.fillStyle = '#9ad'; g.beginPath(); g.ellipse(160, 120, 100, 70, 0.3, 0, 7); g.fill(); }),
      bg_photo: mk(1600, 1067, (g, w, h) => { photo(g, w, h, ['#87ceeb', '#f0e68c']);
        g.fillStyle = '#2f855a'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(120 + i * 240, 1000, 200, 0, 7); g.fill(); }
        g.fillStyle = '#d9534f'; g.fillRect(700, 620, 260, 220); g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(200 + i * 300, 180 + (i % 2) * 90, 110, 40, 0, 0, 7); g.fill(); } }),
      bg_busy: mk(1200, 1600, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(0.5, '#ff6b2d'); gr.addColorStop(1, '#ffe27a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i++) { g.fillStyle = ['#fff27a', '#ffb627', '#7ed957', '#ffffff'][i % 4]; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 18, 0, 7); g.fill(); } })
    };
  });
  const dir = OUT + '/_pics'; fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [k, v] of Object.entries(imgs)) { files[k] = dir + '/' + k + '.png'; fs.writeFileSync(files[k], Buffer.from(v.split(',')[1], 'base64')); }
  return files;
}
async function setPic(p, slot, file) {
  await p.evaluate(s => { FH.UI._pickSlot = s; }, slot);
  await p.setInputFiles('#filePick', file);
  await p.waitForTimeout(900);
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------- 1. every screen at every viewport ----------
  if (want('screens')) for (const v of Object.keys(VIEWS)) {
    const p = await open(b, v);
    await p.waitForTimeout(2500);
    await shot(p, v + '_title');
    for (const [btn, name] of [['btnHow', 'how'], ['btnSettings', 'settings'], ['btnCustomize', 'custom']]) {
      await p.click('#' + btn); await p.waitForTimeout(450); await shot(p, v + '_' + name);
      const ov = await p.evaluate(() => { const pn = document.querySelector('.screen:not(.hidden) .panel'); return pn ? { sh: pn.scrollHeight, ch: pn.clientHeight, sw: pn.scrollWidth, cw: pn.clientWidth } : null; });
      if (ov && (ov.sh > ov.ch + 2 || ov.sw > ov.cw + 2)) {
        errs.push(v + ' ' + name + ' panel scrolls ' + JSON.stringify(ov));
        await p.evaluate(() => { const pn = document.querySelector('.screen:not(.hidden) .panel'); pn.scrollTop = 1e5; });
        await p.waitForTimeout(200); await shot(p, v + '_' + name + '_bottom');
      }
      await p.click('.screen:not(.hidden) .btn-back'); await p.waitForTimeout(300);
    }
    await p.click('#btnPlay'); await p.waitForTimeout(300); await shot(p, v + '_start');
    await p.waitForTimeout(2600); await shot(p, v + '_start_hint');
    await p.evaluate(() => { FH.debug.setBot(true, 0.9); FH.debug.setSpeed(2); });
    await p.waitForTimeout(5000);
    await p.evaluate(() => FH.debug.setSpeed(1)); await p.waitForTimeout(400); await shot(p, v + '_play');
    await p.click('#btnPause'); await p.waitForTimeout(450); await shot(p, v + '_pause');
    await p.click('#btnResume'); await p.waitForTimeout(200);
    await p.evaluate(() => { FH.debug.setBot(false); const w = FH.debug.world; w.score = 1234; w.fireflyCount = 37; w.stats.lanterns = 1; w.stats.springs = 3; w.hearts = 1; w._fall(); });
    await p.waitForFunction(() => FH.debug.mode === 'over', null, { timeout: 15000 }).catch(() => errs.push(v + ' no over'));
    await p.waitForTimeout(1200); await shot(p, v + '_over');
    await p.context().close();
  }

  // ---------- 2. each weather level: start (farmyard), mid, warning, gust ----------
  if (want('zones')) for (const v of Object.keys(VIEWS)) {
    for (const lv of [0, 1, 2, 3]) {
      const p = await open(b, v, '&autostart=1&diff=normal&level=' + lv);
      await p.waitForTimeout(700); await shot(p, v + '_z' + lv + '_start');
      await p.evaluate(() => { FH.debug.setBot(true, 0.9); FH.debug.setSpeed(3); });
      await p.waitForTimeout(4000);
      await p.evaluate(() => { FH.debug.setSpeed(1); const w = FH.debug.world; w.wind.state = 'calm'; w.wind.next = 999; FH.Game.renderer.banner = null; });
      await p.waitForTimeout(500); await shot(p, v + '_z' + lv + '_mid');
      await p.evaluate(d => FH.debug.gust(d), lv % 2 ? -1 : 1);
      await p.waitForTimeout(650); await shot(p, v + '_z' + lv + '_warn');
      await p.waitForFunction(() => FH.debug.world.wind.state === 'blow', null, { timeout: 6000 }).catch(() => errs.push(v + ' z' + lv + ' no gust'));
      await p.waitForTimeout(800); await shot(p, v + '_z' + lv + '_gust');
      await p.context().close();
    }
  }

  // ---------- 3. level crossfade + banner ----------
  if (want('fade')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    for (const [from, to] of [[0, 1], [2, 3]]) {
      await p.evaluate(l => { FH.debug.world.gotoLevel(l); FH.Game._setLevelVisuals(l, true); VQ.adv(0.4); VQ.quiet(); }, from);
      await p.evaluate(l => { FH.debug.gotoLevel(l); }, to);
      await stepSheet(b, p, v + '_fade_' + from + to, 12, 0.25, await p.evaluate(() => VQ.full()), v === 'phone' ? 6 : 4);
    }
    await p.context().close();
  }

  // ---------- 4. event moments ----------
  if (want('events')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    const full = await p.evaluate(() => VQ.full());
    // fall + trampoline rescue
    await p.evaluate(() => { const w = FH.debug.world; VQ.stage(null, null, 1); w.platforms = w.platforms.filter(q => q.y > w.camY + 12); w.hearts = 3; });
    await stepSheet(b, p, v + '_fall_rescue', 20, 0.09, full, v === 'phone' ? 5 : 4);
    await p.evaluate(() => VQ.adv(2));
    // spring bounce
    await p.evaluate(() => { VQ.quiet(); VQ.stage('hay', { spring: true }, 1.2); });
    await stepSheet(b, p, v + '_spring', 16, 0.06, full, v === 'phone' ? 8 : 4);
    // puff poof
    await p.evaluate(() => { VQ.quiet(); const y = VQ.stage('puff', {}, 1.2); window._py = y; });
    const pc = await p.evaluate(() => VQ.box(6, window._py, 6, 5));
    await stepSheet(b, p, v + '_puff', 18, 1 / 30, pc, 6);
    // firefly pickups: +10, ring, flyer to the jar
    await p.evaluate(() => { VQ.quiet(); const y = VQ.stage('hay', {}, 0.6); const w = FH.debug.world; w.lantern = 3;
      for (let i = 0; i < 4; i++) w.spawn('firefly', 6 + (i % 2 ? 0.25 : -0.25), y + 1.4 + i * 0.6); });
    await stepSheet(b, p, v + '_fireflies', 16, 0.05, full, v === 'phone' ? 8 : 4);
    // lantern full
    await p.evaluate(() => { VQ.quiet(); const y = VQ.stage('hay', {}, 0.6); const w = FH.debug.world; w.lantern = 19; w.hearts = 2; w.spawn('firefly', 6, y + 1.6); });
    await stepSheet(b, p, v + '_lantern', 12, 0.12, full, v === 'phone' ? 6 : 4);
    await p.context().close();
  }

  // ---------- 5. motion contact sheets (frame-stepped, zoomed on Clover) ----------
  if (want('motion')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    // bounce on hay: fall → land (squash) → take off (stretch) → rise → apex → fall
    await p.evaluate(() => { const y = VQ.stage('hay', {}, 1.4); window._py = y; });
    let clip = await p.evaluate(() => VQ.box(6, window._py, 4, 4.8));
    await stepSheet(b, p, v + '_bounce', 36, 1 / 40, clip, 9);
    // steering + wall bump (left fence post)
    await p.evaluate(() => { const y = VQ.stage('plank', {}, 1.0); const w = FH.debug.world; w.platforms[w.platforms.length - 1].x = 1.6; w.platforms[w.platforms.length - 1].prevX = 1.6;
      w.hero.x = w.hero.prevX = 3.2; window._py = y; w.steer(-1); });
    clip = await p.evaluate(() => VQ.box(2.2, window._py, 5, 4.8));
    await stepSheet(b, p, v + '_wall', 24, 1 / 30, clip, 8);
    await p.evaluate(() => FH.debug.world.steer(0));
    // steering tilt in the air (right)
    await p.evaluate(() => { const y = VQ.stage('hay', {}, 1.4); window._py = y; FH.debug.world.steer(1); });
    clip = await p.evaluate(() => VQ.box(7.5, window._py, 6, 4.8));
    await stepSheet(b, p, v + '_steer', 18, 1 / 30, clip, 9);
    await p.evaluate(() => FH.debug.world.steer(0));
    // rescue close-up
    await p.evaluate(() => { const w = FH.debug.world; VQ.stage(null, null, 0.5); w.platforms = w.platforms.filter(q => q.y > w.camY + 12); w.hearts = 3; });
    clip = await p.evaluate(() => { const R = FH.Game.renderer; return VQ.clip(R.sx(6) - 3.5 * R.unit, R.VH - 7 * R.unit, 7 * R.unit, 7 * R.unit); });
    await stepSheet(b, p, v + '_rescue', 24, 1 / 25, clip, 8);
    await p.context().close();
  }

  // ---------- 6. colour-blind: fireflies vs platforms vs sky in every level ----------
  if (want('cvd')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    await p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="deu"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter><filter id="pro"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter></svg>'));
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { const w = FH.debug.world; w.gotoLevel(l); FH.Game._setLevelVisuals(l, true); VQ.adv(0.3); VQ.quiet();
        const y = VQ.stage('hay', {}, 0.2); w.hero.vy = 0;
        w.spawn('plank', 3, y + 2.2); w.spawn('cart', 9, y + 2.4, { speed: 0 }); if (l) w.spawn('puff', 3.5, y + 4.6);
        for (let i = 0; i < 6; i++) w.spawn('firefly', 2 + i * 1.6, y + 3.5 + (i % 2) * 0.8);
        VQ.adv(1 / 120); }, lv);
      await p.evaluate(() => VQ.frame());
      const clip = await p.evaluate(() => VQ.full());
      const frames = [];
      for (const [f, n] of [['', 'normal'], ['url(#deu)', 'deuteranopia'], ['url(#pro)', 'protanopia'], ['grayscale(1)', 'grey']]) {
        await p.evaluate(x => { document.getElementById('game').style.filter = x; }, f);
        await p.waitForTimeout(80);
        frames.push({ label: 'z' + lv + ' ' + n, w: clip.width, b64: (await p.screenshot({ clip })).toString('base64') });
      }
      await p.evaluate(() => { document.getElementById('game').style.filter = ''; });
      await compose(b, v + '_cvd_z' + lv, frames, v === 'phone' ? 4 : 2);
    }
    await p.context().close();
  }

  // ---------- 7. custom pictures ----------
  if (want('custom')) for (const v of ['desk', 'phone']) {
    const p = await open(b, v);
    const files = await makePictures(p);
    await p.click('#btnCustomize'); await p.waitForTimeout(300);
    await setPic(p, 'hero', files.hero_photo);
    await setPic(p, 'firefly', files.firefly_cut);
    await setPic(p, 'bg_sunny', files.bg_photo);
    await setPic(p, 'bg_wind', files.bg_busy);
    await shot(p, v + '_custom_filled');
    await p.click('#scrCustom .btn-back'); await p.waitForTimeout(300);
    await p.click('#btnPlay'); await p.waitForTimeout(700); await shot(p, v + '_custom_start');
    await p.evaluate(() => { FH.debug.setBot(true, 0.9); FH.debug.setSpeed(2); });
    await p.waitForTimeout(4000);
    await p.evaluate(() => FH.debug.setSpeed(1)); await p.waitForTimeout(300);
    await shot(p, v + '_custom_play');
    // custom hero bounce sheet (photo, round sticker)
    await p.evaluate(() => { FH.debug.setSpeed(0); VQ.quiet(); const y = VQ.stage('hay', {}, 1.4); window._py = y; const w = FH.debug.world; w.spawn('firefly', 7.2, y + 2.2); w.spawn('firefly', 4.8, y + 2.6); });
    let clip = await p.evaluate(() => VQ.box(6, window._py, 5, 4.8));
    await stepSheet(b, p, v + '_custom_bounce', 18, 1 / 30, clip, 9);
    // the busy custom wind background with default-style fireflies? (firefly is custom here) + a gust
    await p.evaluate(() => { FH.debug.gotoLevel(2); FH.debug.setBot(true, 0.9); FH.debug.setSpeed(2); });
    await p.waitForTimeout(3000);
    await p.evaluate(() => { FH.debug.setSpeed(1); FH.Game.renderer.banner = null; }); await p.waitForTimeout(300);
    await shot(p, v + '_custom_wind');
    // swap to the transparent cut-out hero + photo firefly
    await p.click('#btnPause'); await p.waitForTimeout(300);
    await p.click('#btnPauseMenu'); await p.waitForTimeout(400);
    await p.click('#btnCustomize'); await p.waitForTimeout(300);
    await setPic(p, 'hero', files.hero_cut);
    await setPic(p, 'firefly', files.firefly_photo);
    await shot(p, v + '_custom_filled2');
    await p.click('#scrCustom .btn-back'); await p.waitForTimeout(300);
    await p.click('#btnPlay'); await p.waitForTimeout(400);
    await p.evaluate(() => { FH.debug.setSpeed(0); VQ.adv(0.5); VQ.quiet(); const y = VQ.stage('hay', {}, 1.4); window._py = y; const w = FH.debug.world; w.spawn('firefly', 7.2, y + 2.2); w.spawn('firefly', 4.8, y + 2.6); });
    clip = await p.evaluate(() => VQ.box(6, window._py, 5, 4.8));
    await stepSheet(b, p, v + '_custom_bounce_cut', 18, 1 / 30, clip, 9);
    await p.evaluate(() => VQ.frame()); await shot(p, v + '_custom_cut_full');
    await p.context().close();
  }

  console.log(errs.length ? 'NOTES/ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})();
