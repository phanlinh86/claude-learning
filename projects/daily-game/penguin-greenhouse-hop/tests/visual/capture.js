// Visual QA capture for Puddle's Greenhouse Hop (report-only; never edits game/).
// Every screen at 5 viewports (simulated notch / home-indicator safe areas on touch devices), every floor in play,
// floor transitions (banner, crossfade, iron beam, shrink-back), motion contact sheets (bounce, leaf bend + wobble,
// basket swing, mushroom, umbrella rescue, growth 1.0/1.3/1.6, firefly pickup + fly-to-jar), readability + colour-blind
// checks per floor, text-over-Puddle sampling, and custom pictures (photo hero sticker growing, photo floor background).
// Output: tests/out/visual/*.png   Run: node tests/visual/capture.js [only=screens,floors,fade,motion,grow,cvd,text,custom]
// Motion sheets freeze the game (setSpeed(0)) and step it by exact 1/120 s world steps.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv.find(a => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
const want = n => !only.length || only.includes(n);
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 } },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  ipadL: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};
// simulated safe areas [top, right, bottom, left] (iPhone notch / Dynamic Island + home indicator; iPad home indicator)
const SAFE = { desk: null, ipad: [24, 0, 20, 0], ipadL: [24, 0, 20, 0], phone: [47, 0, 34, 0], phoneL: [0, 47, 21, 47] };
const errs = [], notes = [];

async function open(b, view, q) {
  const ctx = await b.newContext(VIEWS[view]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(view + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(view + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.PH && PH.debug && PH.Game && PH.Game.mode !== 'boot', null, { timeout: 15000 });
  const sa = SAFE[view];
  if (sa) {
    const pad = sa.map(v => v + 'px').join(' ');
    await p.addStyleTag({ content: `#safeProbe{padding:${pad} !important} .screen{padding:${pad} !important}
      body::after{content:"";position:fixed;z-index:99;pointer-events:none;inset:0;
        border-style:solid;border-color:rgba(255,0,255,.28);border-width:${pad}}` });
    await p.evaluate(() => PH.Game.relayout());
  }
  await p.evaluate(() => {
    window.VQ = {
      adv(sec) { const G = PH.Game, h = 1 / 120; let n = Math.round(sec / h); while (n-- > 0) { G.step(h); G.renderer.update(h); } },
      frame() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); },
      clip(x, y, w, h) {
        const R = PH.Game.renderer, c = R.canvas.getBoundingClientRect(), s = c.width / R.VW;
        const X = Math.max(0, c.left + x * s), Y = Math.max(0, c.top + y * s);
        return { x: Math.round(X), y: Math.round(Y), width: Math.round(Math.min(innerWidth - X, w * s)), height: Math.round(Math.min(innerHeight - Y, h * s)) };
      },
      full() { const R = PH.Game.renderer; return VQ.clip(0, 0, R.VW, R.VH); },
      box(xw, yw, wu, hu) {   // a fixed box (units) around a world point (yw = bottom-ish)
        const R = PH.Game.renderer, cam = R.cam(), u = R.unit;
        return VQ.clip(R.sx(xw) - wu / 2 * u, R.sy(yw, cam) - hu * u, wu * u, hu * u + 1.0 * u);
      },
      quiet() { const R = PH.Game.renderer; R.banner = null; R.hintOn = false; R.texts.length = 0; },
      // clear everything around the camera and put Puddle above one platform (or none) of `kind`
      stage(kind, opts, dy, x) {
        const w = PH.debug.world, h = w.hero;
        PH.debug.setBot(false); w.steer(0);
        const y0 = w.camY + 3.0;
        w.platforms = w.platforms.filter(p => Math.abs((p.y0 != null ? p.y0 : p.y) - y0) > 8 && p.kind !== 'rescue');
        w.fireflies = w.fireflies.filter(f => Math.abs(f.y - y0) > 8);
        let p = null;
        if (kind) p = w.spawn(kind, x == null ? 6 : x, y0, opts || {});
        h.x = h.prevX = (x == null ? 6 : x); h.y = h.prevY = y0 + (dy == null ? 1.6 : dy); h.vx = 0; h.vy = 0; h.invuln = 0; h.rescueT = 0; h.mood = 'fall';
        window._plat = p;
        return p ? p.y : y0;
      },
      st() { const w = PH.debug.world, h = w.hero, p = window._plat;
        return 't' + w.time.toFixed(2) + ' ' + h.mood + ' vy' + h.vy.toFixed(1) + (h.squash > 0.02 ? ' sq' + h.squash.toFixed(2) : '') + (h.stretch > 0.02 ? ' st' + h.stretch.toFixed(2) : '') +
          (p && p.kind === 'leaf' ? ' bend' + p.bend.toFixed(2) : '') + (p && p.kind === 'basket' ? ' ang' + p.ang.toFixed(2) : '') + ' s' + h.size.toFixed(2); }
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
  const p = await open(b, view, '&autostart=1&diff=normal' + (extra || ''));
  await p.evaluate(() => { PH.debug.setSpeed(0); });
  await p.evaluate(() => { PH.debug.setBot(true, 1); VQ.adv(6); VQ.quiet(); });
  return p;
}
const CVD = '<svg width="0" height="0" style="position:absolute"><filter id="deu"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter><filter id="pro"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter></svg>';

async function makePictures(p) {
  const imgs = await p.evaluate(() => {
    const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c.toDataURL('image/png'); };
    const photo = (g, w, h, sky) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { g.fillStyle = 'rgba(' + (Math.random() * 255 | 0) + ',' + (Math.random() * 255 | 0) + ',' + (Math.random() * 255 | 0) + ',.08)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    };
    return {
      hero_photo: mk(600, 450, (g, w, h) => { photo(g, w, h, ['#6d8f5a', '#3a4a2a']);   // a dog photo, landscape aspect
        g.fillStyle = '#c98a4b'; g.beginPath(); g.ellipse(300, 240, 150, 140, 0, 0, 7); g.fill();
        g.fillStyle = '#7a4a22'; g.beginPath(); g.ellipse(170, 140, 50, 90, -0.4, 0, 7); g.ellipse(430, 140, 50, 90, 0.4, 0, 7); g.fill();
        g.fillStyle = '#222'; g.beginPath(); g.arc(250, 210, 20, 0, 7); g.arc(350, 210, 20, 0, 7); g.fill();
        g.fillStyle = '#3a2418'; g.beginPath(); g.ellipse(300, 275, 30, 20, 0, 0, 7); g.fill(); }),
      bg_photo: mk(1600, 1067, (g, w, h) => { photo(g, w, h, ['#87ceeb', '#f0e68c']);   // a busy holiday photo
        g.fillStyle = '#2f855a'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(120 + i * 240, 1000, 200, 0, 7); g.fill(); }
        g.fillStyle = '#d9534f'; g.fillRect(700, 620, 260, 220); g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(200 + i * 300, 180 + (i % 2) * 90, 110, 40, 0, 0, 7); g.fill(); } })
    };
  });
  const dir = OUT + '/_pics'; fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [k, v] of Object.entries(imgs)) { files[k] = dir + '/' + k + '.png'; fs.writeFileSync(files[k], Buffer.from(v.split(',')[1], 'base64')); }
  return files;
}
async function setPic(p, slot, file) {
  await p.evaluate(s => { PH.UI._pickSlot = s; }, slot);
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
        notes.push(v + ' ' + name + ' panel scrolls ' + JSON.stringify(ov));
        await p.evaluate(() => { const pn = document.querySelector('.screen:not(.hidden) .panel'); pn.scrollTop = 1e5; });
        await p.waitForTimeout(200); await shot(p, v + '_' + name + '_bottom');
      }
      await p.click('.screen:not(.hidden) .btn-back'); await p.waitForTimeout(300);
    }
    await p.click('#btnPlay'); await p.waitForTimeout(300); await shot(p, v + '_start');
    await p.waitForTimeout(2600); await shot(p, v + '_start_hint');
    await p.evaluate(() => { PH.debug.setBot(true, 0.9); PH.debug.setSpeed(2); });
    await p.waitForTimeout(5000);
    await p.evaluate(() => PH.debug.setSpeed(1)); await p.waitForTimeout(400); await shot(p, v + '_play');
    await p.click('#btnPause'); await p.waitForTimeout(450); await shot(p, v + '_pause');
    await p.click('#btnResume'); await p.waitForTimeout(200);
    await p.evaluate(() => { PH.debug.setBot(false); const w = PH.debug.world; w.score = 1234; w.fireflyCount = 37; w.hearts = 1; w._fall(); });
    await p.waitForFunction(() => PH.debug.mode === 'over', null, { timeout: 15000 }).catch(() => errs.push(v + ' no over'));
    await p.waitForTimeout(1200); await shot(p, v + '_over');
    if (await p.$('#btnScoreCard')) {
      await p.click('#btnScoreCard'); await p.waitForTimeout(1500); await shot(p, v + '_scorecard');
      const img = await p.evaluate(() => { const i = document.getElementById('scImg'); return i && i.src; });
      if (img && v === 'desk') { const r = await p.evaluate(async u => { const bl = await (await fetch(u)).blob(); return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(bl); }); }, img).catch(() => null);
        if (r) fs.writeFileSync(OUT + '/scorecard_image.png', Buffer.from(r.split(',')[1], 'base64')); }
    } else notes.push(v + ' no #btnScoreCard');
    await p.context().close();
  }

  // ---------- 2. every floor: start (banner), mid-floor ----------
  if (want('floors')) for (const v of Object.keys(VIEWS)) {
    for (const lv of [0, 1, 2, 3]) {
      const p = await open(b, v, '&autostart=1&diff=normal&level=' + lv);
      await p.waitForTimeout(700); await shot(p, v + '_f' + lv + '_start');
      await p.evaluate(() => { PH.debug.setBot(true, 0.9); PH.debug.setSpeed(3); });
      await p.waitForTimeout(4000);
      await p.evaluate(() => { PH.debug.setSpeed(1); PH.Game.renderer.banner = null; });
      await p.waitForTimeout(500); await shot(p, v + '_f' + lv + '_mid');
      await p.context().close();
    }
  }

  // ---------- 3. floor transitions: real crossing of the floor line (beam, banner, crossfade, shrink-back) ----------
  if (want('fade')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    for (const from of [0, 2]) {
      await p.evaluate(l => { const w = PH.debug.world; if (l) { w.gotoLevel(l); PH.Game._setLevelVisuals(l, true); } VQ.adv(0.4); VQ.quiet();
        PH.debug.setBot(true, 1); PH.debug.setSize(1.5); w.goal = (w.maxY - w.levelY0) + 3.5; }, from);
      await stepSheet(b, p, v + '_fade_' + from + (from + 1), 16, 0.2, await p.evaluate(() => VQ.full()), v === 'phone' ? 8 : 4);
    }
    // the beam close-up at rest, after crossing
    await p.evaluate(() => VQ.quiet()); await p.evaluate(() => VQ.frame()); await shot(p, v + '_beam_after');
    await p.context().close();
  }

  // ---------- 4. motion contact sheets ----------
  if (want('motion')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    let clip;
    // bounce on a pot
    await p.evaluate(() => { window._py = VQ.stage('pot', {}, 1.4); });
    clip = await p.evaluate(() => VQ.box(6, window._py, 4.5, 4.8));
    await stepSheet(b, p, v + '_bounce', 36, 1 / 40, clip, 9);
    // leaf bend + wobble, stem left, big Puddle
    for (const [side, sz] of [[-1, 1.6], [1, 1.6], [-1, 1.0]]) {
      await p.evaluate(([s, z]) => { PH.debug.setSize(z); window._py = VQ.stage('leaf', { side: s }, 1.3, 6); }, [side, sz]);
      clip = await p.evaluate(() => VQ.box(6, window._py, 5.5, 4.2));
      await stepSheet(b, p, v + '_leaf_' + (side < 0 ? 'L' : 'R') + '_s' + sz, 30, 1 / 30, clip, 10);
    }
    await p.evaluate(() => PH.debug.setSize(1));
    // basket swing over one period (hero far away), then a landing push
    await p.evaluate(() => { window._py = VQ.stage('basket', { amp: 0.42 }, 9, 6); const w = PH.debug.world; w.hero.y = w.hero.prevY = w.camY + 9; w.hero.vy = 0; window._noHero = 1; });
    clip = await p.evaluate(() => { const P = window._plat; return VQ.box(6, window._py, 6, P.len + 1.5); });
    await stepSheet(b, p, v + '_basket_swing', 16, 0.13, clip, 8, () => { const w = PH.debug.world; w.hero.x = w.hero.prevX = 1; });
    await p.evaluate(() => { window._py = VQ.stage('basket', { amp: 0.3 }, 1.4, 6); });
    clip = await p.evaluate(() => { const P = window._plat; return VQ.box(6, window._py, 6, P.len + 1.5); });
    await stepSheet(b, p, v + '_basket_land', 18, 1 / 30, clip, 9);
    // mushroom bounce
    await p.evaluate(() => { window._py = VQ.stage('pot', { spring: true }, 1.2); });
    clip = await p.evaluate(() => VQ.box(6, window._py, 4.5, 6));
    await stepSheet(b, p, v + '_mushroom', 20, 1 / 30, clip, 10);
    // umbrella rescue (full screen)
    await p.evaluate(() => { const w = PH.debug.world; VQ.stage(null, null, 0.5); w.platforms = w.platforms.filter(q => q.y > w.camY + 12); w.hearts = 3; });
    await stepSheet(b, p, v + '_rescue', 20, 0.08, await p.evaluate(() => VQ.full()), v === 'phone' ? 10 : 5);
    // firefly pickup + fly-to-jar (full screen)
    await p.evaluate(() => { VQ.quiet(); const y = VQ.stage('pot', {}, 0.6); const w = PH.debug.world; w.lantern = 3;
      for (let i = 0; i < 4; i++) w.spawn('firefly', 6 + (i % 2 ? 0.25 : -0.25), y + 1.4 + i * 0.6); });
    await stepSheet(b, p, v + '_fireflies', 16, 0.05, await p.evaluate(() => VQ.full()), v === 'phone' ? 8 : 4);
    await p.context().close();
  }

  // ---------- 5. growth: size 1.0 / 1.3 / 1.6 on the same pot, all three poses ----------
  if (want('grow')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    const frames = [];
    for (const s of [1.0, 1.3, 1.6]) for (const mood of ['idle', 'crouch', 'up']) {
      const label = await p.evaluate(([s, m]) => { PH.debug.setSize(s); const y = VQ.stage('pot', {}, 0); const h = PH.debug.world.hero; h.y = h.prevY = y; h.mood = m; h.squash = m === 'crouch' ? 0.6 : 0; h.stretch = m === 'up' ? 0.6 : 0; h.big = s >= 1.3; window._py = y; return 's' + s + ' ' + m; }, [s, mood]);
      await p.evaluate(() => VQ.frame());
      const clip = await p.evaluate(() => VQ.box(6, window._py, 4.5, 3.6));
      frames.push({ label, w: clip.width, b64: (await p.screenshot({ clip })).toString('base64') });
    }
    await compose(b, v + '_grow', frames, 3);
    // the HUD size meter at 1.0 / 1.29 / 1.3 / 1.6
    const hud = [];
    for (const s of [1.0, 1.29, 1.3, 1.6]) {
      await p.evaluate(s => { PH.debug.setSize(s); VQ.adv(1 / 120); }, s); await p.evaluate(() => VQ.frame());
      const clip = await p.evaluate(() => VQ.clip(0, 0, 420, 190));
      hud.push({ label: 'size ' + s, w: clip.width, b64: (await p.screenshot({ clip })).toString('base64') });
    }
    await compose(b, v + '_hud_size', hud, 4);
    await p.context().close();
  }

  // ---------- 6. readability + colour-blind: every floor with every platform kind, fireflies and Puddle ----------
  if (want('cvd')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    await p.evaluate(h => document.body.insertAdjacentHTML('beforeend', h), CVD);
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { const w = PH.debug.world; if (l) w.gotoLevel(l); PH.Game._setLevelVisuals(l, true); VQ.adv(1.0); VQ.quiet(); PH.debug.setSize(1.3);
        const y = VQ.stage('pot', {}, 0.2); w.hero.vy = 0;
        w.spawn('shelf', 2.6, y + 2.2); w.spawn('leaf', 9.2, y + 2.5, { side: 1 }); w.spawn('basket', 3.2, y + 4.6, { amp: 0.0 }); w.spawn('leaf', 2.5, y + 6.6, { side: -1 }); w.spawn('pot', 8.5, y + 5.2, { spring: true });
        for (let i = 0; i < 6; i++) w.spawn('firefly', 1.6 + i * 1.8, y + 3.6 + (i % 2) * 1.0);
        VQ.adv(1 / 120); }, lv);
      await p.evaluate(() => VQ.frame());
      const clip = await p.evaluate(() => VQ.full());
      const frames = [];
      for (const [f, n] of [['', 'normal'], ['url(#deu)', 'deuteranopia'], ['url(#pro)', 'protanopia'], ['grayscale(1)', 'grey']]) {
        await p.evaluate(x => { document.getElementById('game').style.filter = x; }, f);
        await p.waitForTimeout(80);
        frames.push({ label: 'f' + lv + ' ' + n, w: clip.width, b64: (await p.screenshot({ clip })).toString('base64') });
      }
      await p.evaluate(() => { document.getElementById('game').style.filter = ''; });
      await compose(b, v + '_cvd_f' + lv, frames, v === 'phone' ? 4 : 2);
    }
    await p.context().close();
  }

  // ---------- 7. text never covering Puddle: sample every frame of a bot run (pop-ups, banner) ----------
  if (want('text')) for (const v of ['desk', 'phone']) {
    const p = await frozenRun(b, v);
    const res = await p.evaluate(() => {
      const R = PH.Game.renderer, w = PH.debug.world, out = { frames: 0, overFull: 0, samples: [] };
      PH.debug.setBot(true, 0.7); w.goal = (w.maxY - w.levelY0) + 30;
      for (let i = 0; i < 120 * 60; i++) {
        PH.Game.step(1 / 120); R.update(1 / 120);
        if (i % 4) continue;
        R.draw('playing'); out.frames++;
        const H = R._heroScr; if (!H) continue;
        for (const t of R.texts) {
          const life = t.big ? 1.8 : 0.8, k = t.t / life, by = t.ay ? R.VH * t.ay + (R.ins.top || 0) : t.y;
          const y = by + (t.down ? 14 : -(t.big ? 18 : 30)) * Math.min(1, t.t / 0.5);
          const g = R.ctx; g.font = '900 ' + (t.big ? 28 : 21) + 'px sans-serif'; const tw = g.measureText(t.s).width / 2, th = t.big ? 16 : 12;
          const hit = Math.abs(t.x - H.x) < tw + H.r * 0.7 && Math.abs(y - H.y) < th + H.r * 0.8;
          const faded = Math.abs(t.x - H.x) < (t.big ? 200 : 60) && Math.abs(y - H.y) < 0.9 * R.unit * R.hs() + 14;
          if (hit && !faded && k < 0.7) { out.overFull++; if (out.samples.length < 8) out.samples.push(t.s + ' @t' + w.time.toFixed(1)); }
        }
      }
      return out;
    });
    notes.push(v + ' text-over-Puddle (unfaded) ' + JSON.stringify(res));
    await p.context().close();
  }

  // ---------- 8. custom pictures: photo hero (round sticker grows with size) + photo floor background ----------
  if (want('custom')) for (const v of ['desk', 'phone']) {
    const p = await open(b, v);
    const files = await makePictures(p);
    await p.click('#btnCustomize'); await p.waitForTimeout(300);
    await setPic(p, 'hero', files.hero_photo);
    await setPic(p, 'bg_potting', files.bg_photo);
    await shot(p, v + '_custom_filled');
    await p.click('#scrCustom .btn-back'); await p.waitForTimeout(300);
    await p.click('#btnPlay'); await p.waitForTimeout(700); await shot(p, v + '_custom_start');
    await p.evaluate(() => { PH.debug.setBot(true, 0.9); PH.debug.setSpeed(2); });
    await p.waitForTimeout(4000);
    await p.evaluate(() => PH.debug.setSpeed(1)); await p.waitForTimeout(300);
    await shot(p, v + '_custom_play');
    await p.evaluate(() => { PH.debug.setSpeed(0); VQ.quiet(); });
    const frames = [];
    for (const s of [1.0, 1.3, 1.6]) {
      await p.evaluate(s => { PH.debug.setSize(s); const y = VQ.stage('pot', {}, 0); const h = PH.debug.world.hero; h.y = h.prevY = y; h.mood = 'idle'; h.squash = 0; h.stretch = 0; window._py = y; VQ.adv(1 / 120); }, s);
      await p.evaluate(() => VQ.frame());
      const clip = await p.evaluate(() => VQ.box(6, window._py, 4.5, 3.6));
      frames.push({ label: 'custom s' + s, w: clip.width, b64: (await p.screenshot({ clip })).toString('base64') });
    }
    await compose(b, v + '_custom_grow', frames, 3);
    await p.evaluate(() => { PH.debug.setSize(1.2); window._py = VQ.stage('pot', {}, 1.4); });
    const clip = await p.evaluate(() => VQ.box(6, window._py, 4.5, 4.8));
    await stepSheet(b, p, v + '_custom_bounce', 18, 1 / 30, clip, 9);
    await p.context().close();
  }

  console.log(notes.join('\n'));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})();
