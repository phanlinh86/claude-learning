// Visual QA capture for Bolt's Rooftop Flip: every screen at 5 viewports, each time of day in play, the crossfade,
// frame-stepped motion contact sheets (flip up/down, vent + sign bump, gap fall + drone rescue, catch + wrong-colour
// flee, gate), a firefly line-up per time of day in colour / greyscale / deuteranopia, and custom pictures.
// Output: tests/out/visual/*.png (gitignored).   Run: node tests/visual/capture.js [only=screens,zones,fade,motion,ff,custom]
// Motion sheets freeze the game (setSpeed(0)) and advance it by exact fixed steps, so every frame is reproducible.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv.find(a => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
const want = n => !only.length || only.includes(n);
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 } },
  ipadL: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  ipadP: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(b, view, q) {
  const ctx = await b.newContext(VIEWS[view]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(view + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(view + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.RF && RF.debug && RF.Game && RF.Game.mode !== 'boot', null, { timeout: 15000 });
  await p.evaluate(() => {
    // frame-exact stepping helpers (game frozen with setSpeed(0))
    window.VQ = {
      adv(sec) {
        const G = RF.Game, h = 1 / 120; let n = Math.round(sec / h);
        while (n-- > 0) G.step(h);
        G.renderer.update(sec);
      },
      frame() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); },
      // clip (CSS px) around a logical rect
      clip(x, y, w, h) {
        const R = RF.Game.renderer, c = R.canvas.getBoundingClientRect(), s = c.width / R.VW;
        const X = Math.max(0, c.left + x * s), Y = Math.max(0, c.top + y * s);
        return { x: Math.round(X), y: Math.round(Y), width: Math.round(Math.min(innerWidth - X, w * s)), height: Math.round(Math.min(innerHeight - Y, h * s)) };
      },
      heroClip(bw, ah, bh, fw) {   // units: before/after Bolt horizontally, whole corridor + margins vertically
        const L = RF.debug.world.layout, u = L.unit;
        return VQ.clip(L.heroX - (bw || 1.2) * u, L.ceilY - (ah || 0.6) * u, ((bw || 1.2) + (fw || 2.4)) * u, L.corridorH + ((ah || 0.6) + (bh || 0.6)) * u);
      },
      // solid track, Bolt standing on `side`, full batteries, no blink
      toSide(side) {
        const w = RF.debug.world; w.setTrack({}); w.hearts = w.maxHearts; w.phase = 'run';
        if (w.hero.state === 'rescue') VQ.adv(2.5);
        if (w.hero.side !== side) { w.flip(); VQ.adv(0.9); }
        w.hero.invuln = 0; VQ.adv(0.4); w.hero.invuln = 0;
      },
      st() { const w = RF.debug.world, h = w.hero; return 't=' + w.time.toFixed(2) + ' ft=' + h.flipT.toFixed(2) + ' ' + h.state + (h.squash > 0.02 ? ' sq' + h.squash.toFixed(2) : ''); }
    };
  });
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: OUT + '/' + name + '.png', clip });

// frames (b64 + label) → one contact sheet PNG
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
// n frames, dt seconds of game time between them (game frozen and stepped)
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
async function freshRun(b, view, extra) {
  const p = await open(b, view, '&autostart=1&diff=normal' + (extra || ''));
  await p.waitForTimeout(400);
  await p.evaluate(() => { RF.debug.setSpeed(0); const R = RF.Game.renderer; R.banner = null; R.hintOn = false; VQ.adv(0.2); });
  return p;
}

async function makePictures(p) {
  const imgs = await p.evaluate(() => {
    const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c.toDataURL('image/png'); };
    return {
      hero: mk(400, 400, (g, w, h) => { g.fillStyle = '#5a8f3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c98a4b'; g.beginPath(); g.arc(200, 210, 140, 0, 7); g.fill();
        g.fillStyle = '#7a4a22'; g.beginPath(); g.ellipse(85, 120, 45, 80, -0.4, 0, 7); g.ellipse(315, 120, 45, 80, 0.4, 0, 7); g.fill();
        g.fillStyle = '#222'; g.beginPath(); g.arc(150, 180, 18, 0, 7); g.arc(250, 180, 18, 0, 7); g.fill(); g.fillStyle = '#e66'; g.beginPath(); g.arc(200, 260, 30, 0, 3.14); g.fill(); }),
      firefly: mk(300, 300, (g) => { g.fillStyle = '#334'; g.fillRect(0, 0, 300, 300); g.fillStyle = '#9ad'; g.beginPath(); g.ellipse(150, 150, 110, 70, 0.3, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(110, 130, 22, 0, 7); g.fill(); }),
      bg_dawn: mk(1600, 900, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#87ceeb'); gr.addColorStop(1, '#f0e68c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2f855a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(150 + i * 260, 820, 160, 0, 7); g.fill(); }
        g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(200 + i * 300, 180 + (i % 2) * 90, 110, 40, 0, 0, 7); g.fill(); } }),
      bg_night: mk(1200, 1600, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff7a00'); gr.addColorStop(0.5, '#ff2d87'); gr.addColorStop(1, '#00c8ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); })
    };
  });
  const dir = OUT + '/_pics'; fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [k, v] of Object.entries(imgs)) { files[k] = dir + '/' + k + '.png'; fs.writeFileSync(files[k], Buffer.from(v.split(',')[1], 'base64')); }
  return files;
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------- 1. every screen at every viewport ----------
  if (want('screens')) for (const v of Object.keys(VIEWS)) {
    const p = await open(b, v);
    await p.waitForTimeout(2500);
    await shot(p, v + '_title');
    for (const [btn, name] of [['btnHow', 'how'], ['btnSettings', 'settings'], ['btnCustomize', 'custom']]) {
      await p.click('#' + btn); await p.waitForTimeout(400); await shot(p, v + '_' + name);
      await p.evaluate(() => { const s = document.querySelector('.screen:not(.hidden)'); if (s) s.scrollTop = 1e5; const pn = document.querySelector('.screen:not(.hidden) .panel'); if (pn) pn.scrollTop = 1e5; });
      await p.waitForTimeout(200); await shot(p, v + '_' + name + '_bottom');
      await p.click('.screen:not(.hidden) .btn-back'); await p.waitForTimeout(300);
    }
    await p.click('#btnPlay'); await p.waitForTimeout(250); await shot(p, v + '_start_hint');
    await p.waitForTimeout(900); await shot(p, v + '_banner');
    await p.evaluate(() => { RF.debug.setBot(true, 0.9); RF.debug.setSpeed(2); });
    await p.waitForTimeout(5000);
    await p.evaluate(() => RF.debug.setSpeed(1)); await p.waitForTimeout(400); await shot(p, v + '_play');
    // Bolt on the rail (HUD fade check)
    await p.evaluate(() => { RF.debug.setBot(false); const w = RF.debug.world; w.setTrack({}); if (w.hero.side !== 'ceil') w.flip(); });
    await p.waitForTimeout(900); await shot(p, v + '_play_rail');
    await p.click('#btnPause'); await p.waitForTimeout(400); await shot(p, v + '_pause');
    await p.click('#btnResume'); await p.waitForTimeout(200);
    await p.evaluate(() => { const w = RF.debug.world; w.score = 1234; w.stats.caught = 37; w.maxCombo = 12; w.hearts = 1; w._loseHeart(); });
    await p.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 15000 }).catch(() => errs.push(v + ' no over'));
    await p.waitForTimeout(1200); await shot(p, v + '_over');
    await p.context().close();
  }

  // ---------- 2. each time of day in play ----------
  if (want('zones')) for (const v of ['desk', 'ipadP', 'phone', 'phoneL']) {
    const p = await open(b, v, '&autostart=1&bot=1&skill=0.9&diff=normal');
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { RF.debug.gotoLevel(l); RF.debug.setSpeed(3); }, lv);
      await p.waitForTimeout(3600);
      await p.evaluate(() => RF.debug.setSpeed(1)); await p.waitForTimeout(500);
      await shot(p, v + '_zone' + lv);
      if (v === 'desk') {   // greyscale of the same moment
        await p.evaluate(() => RF.debug.setSpeed(0));
        await p.evaluate(() => { document.getElementById('game').style.filter = 'grayscale(1)'; });
        await p.waitForTimeout(80); await shot(p, v + '_zone' + lv + '_grey');
        await p.evaluate(() => { document.getElementById('game').style.filter = ''; RF.debug.setSpeed(1); });
      }
    }
    await p.context().close();
  }

  // ---------- 3. crossfade between levels ----------
  if (want('fade')) {
    const p = await freshRun(b, 'desk');
    for (const [from, to] of [[0, 1], [2, 3]]) {
      await p.evaluate(l => { RF.debug.world.gotoLevel(l); RF.Game._setLevelVisuals(l, true); RF.Game.renderer.banner = null; VQ.adv(0.5); }, from);
      await p.evaluate(l => { RF.debug.gotoLevel(l); }, to);
      await stepSheet(b, p, 'fade_' + from + to, 12, 0.18, { x: 0, y: 0, width: 1280, height: 720 }, 4);
    }
    await p.context().close();
  }

  // ---------- 4. motion contact sheets ----------
  if (want('motion')) for (const v of ['desk', 'phone']) {
    const p = await freshRun(b, v);
    const clip = await p.evaluate(() => VQ.heroClip());
    const wide = await p.evaluate(() => VQ.heroClip(1.2, 0.6, 0.6, 4.6));
    const dt = 1 / 40;
    // flip up / flip down
    await p.evaluate(() => { RF.debug.world.setTrack({}); VQ.adv(0.3); });
    await stepSheet(b, p, v + '_flip_up', 18, dt, clip, 6, () => RF.debug.world.flip());
    await p.evaluate(() => VQ.adv(0.5));
    await stepSheet(b, p, v + '_flip_down', 18, dt, clip, 6, () => RF.debug.world.flip());
    if (v === 'desk') {
      // vent bump (on the roof)
      await p.evaluate(() => { VQ.toSide('floor'); RF.debug.world.setTrack({ obstacles: [{ kind: 'vent', variant: 0, x: 1.4 }, { kind: 'vent', variant: 1, x: 7 }] }); });
      await stepSheet(b, p, 'bump_vent', 18, 1 / 30, wide, 6);
      // sign bump (on the rail)
      await p.evaluate(() => { VQ.toSide('ceil'); RF.debug.world.setTrack({ obstacles: [{ kind: 'sign', variant: 0, x: 1.4 }, { kind: 'sign', variant: 1, x: 7 }] }); });
      await stepSheet(b, p, 'bump_sign', 18, 1 / 30, wide, 6);
      // obstacle line-up at rest (vents on the roof, signs on the rail) + a gap on each surface: readability
      await p.evaluate(() => { VQ.toSide('floor'); RF.debug.world.setTrack({ obstacles: [{ kind: 'vent', variant: 0, x: 2.2 }, { kind: 'vent', variant: 1, x: 4 }, { kind: 'sign', variant: 0, x: 6 }, { kind: 'sign', variant: 1, x: 8 }], roofs: [[-50, 9], [11, 5000]], rails: [[-50, 9.5], [11.5, 5000]] }); VQ.adv(0.05); });
      await p.evaluate(() => VQ.frame()); await shot(p, 'desk_obstacles');
      // gap fall + drone rescue (full screen)
      const full = await p.evaluate(() => VQ.clip(0, 0, RF.Game.renderer.VW, RF.Game.renderer.VH));
      await p.evaluate(() => { VQ.toSide('floor'); RF.debug.world.setTrack({ roofs: [[-50, 1.2], [6, 5000]], rails: [[-50, 5000]] }); });
      await stepSheet(b, p, 'gap_rescue', 30, 0.07, full, 5);
      // gap fall from the rail
      await p.evaluate(() => { VQ.toSide('ceil'); RF.debug.world.setTrack({ rails: [[-50, 1.2], [6, 5000]], roofs: [[-50, 0.5], [3, 3.6], [8, 5000]] }); });
      await stepSheet(b, p, 'gap_rescue_rail', 30, 0.07, full, 5);
      // catch + wrong colour
      await p.evaluate(() => { VQ.toSide('floor'); const w = RF.debug.world;
        const c = w.hero.color, o = (c + 1) % 3; w.setTrack({ fireflies: [{ x: 1.2, side: 'floor', color: c }, { x: 1.8, side: 'floor', color: c }, { x: 2.6, side: 'floor', color: o }, { x: 3.3, side: 'floor', color: (c + 2) % 3 }] }); });
      await stepSheet(b, p, 'catch_wrong', 24, 1 / 30, wide, 6);
      // gate
      await p.evaluate(() => { VQ.toSide('floor'); const w = RF.debug.world; w.setTrack({ gates: [{ x: 1.6, color: (w.hero.color + 1) % 3 }] }); });
      await stepSheet(b, p, 'gate', 18, 1 / 30, wide, 6);
      // finish arch
      await p.evaluate(() => { VQ.toSide('floor'); RF.debug.world.setTrack({ finish: 2.2 }); });
      await stepSheet(b, p, 'finish', 12, 0.1, await p.evaluate(() => VQ.clip(0, 0, RF.Game.renderer.VW, RF.Game.renderer.VH)), 4);
    }
    // night flip (glow + dark rail)
    if (v === 'desk') {
      await p.evaluate(() => { const w = RF.debug.world; w.gotoLevel(3); RF.Game._setLevelVisuals(3, true); RF.Game.renderer.banner = null; w.setTrack({}); VQ.adv(1); w.hero.invuln = 0; });
      await stepSheet(b, p, 'night_flip_up', 12, 1 / 30, clip, 6, () => { const w = RF.debug.world; if (w.hero.side === 'floor') w.flip(); });
    }
    await p.context().close();
  }

  // ---------- 5. firefly line-up per time of day: colour / grey / deuteranopia ----------
  if (want('ff')) {
    const p = await freshRun(b, 'desk');
    await p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="cvd"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>'));
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { const w = RF.debug.world; w.gotoLevel(l); RF.Game._setLevelVisuals(l, true); RF.Game.renderer.banner = null;
        w.setTrack({ fireflies: [0, 1, 2, 0, 1, 2].map((c, i) => ({ x: 1.6 + i * 0.7, side: i < 3 ? 'floor' : 'ceil', color: c })).concat([0, 1, 2].map((c, i) => ({ x: 2.2 + i * 0.9, side: 'mid', color: c }))) });
        VQ.adv(0.02); }, lv);
      const clip = await p.evaluate(() => VQ.heroClip(1.0, 0.6, 0.6, 5.2));
      await p.evaluate(() => VQ.frame());
      await shot(p, 'ff_zone' + lv, clip);
      for (const [f, n] of [['grayscale(1)', 'grey'], ['url(#cvd)', 'deutan']]) {
        await p.evaluate(x => { document.getElementById('game').style.filter = x; }, f);
        await p.waitForTimeout(80); await shot(p, 'ff_zone' + lv + '_' + n, clip);
      }
      await p.evaluate(() => { document.getElementById('game').style.filter = ''; });
    }
    await p.context().close();
  }

  // ---------- 6. custom pictures ----------
  if (want('custom')) for (const v of ['desk', 'phone']) {
    const p = await open(b, v);
    const files = await makePictures(p);
    await p.click('#btnCustomize'); await p.waitForTimeout(300);
    const ids = await p.evaluate(() => RF.Assets.SLOTS.map(s => s.id));
    for (const id of ['hero', 'firefly', 'bg_dawn', 'bg_night']) {
      const i = ids.indexOf(id);
      const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#slotGrid .slot').nth(i).locator('[data-act=pick]').click()]);
      await chooser.setFiles(files[id]); await p.waitForTimeout(600);
    }
    await shot(p, v + '_custom_filled');
    await p.click('#scrCustom .btn-back'); await p.waitForTimeout(300);
    await p.click('#btnPlay'); await p.waitForTimeout(400);
    await p.evaluate(() => { RF.debug.setBot(true, 0.9); RF.debug.setSpeed(2); });
    await p.waitForTimeout(4500);
    await p.evaluate(() => RF.debug.setSpeed(1)); await p.waitForTimeout(300);
    await shot(p, v + '_custom_play');
    // custom flip sheet
    await p.evaluate(() => { RF.debug.setBot(false); RF.debug.setSpeed(0); const w = RF.debug.world; w.setTrack({ fireflies: [0, 1, 2].map((c, i) => ({ x: 2.2 + i * 0.8, side: 'mid', color: c })) }); VQ.adv(0.6); });
    if (v === 'desk') {
      const clip = await p.evaluate(() => VQ.heroClip());
      await stepSheet(b, p, 'custom_flip', 12, 1 / 30, clip, 6, () => { const w = RF.debug.world; if (w.hero.side === 'floor') w.flip(); });
    }
    await p.evaluate(() => { RF.debug.gotoLevel(3); RF.debug.setBot(true, 0.9); RF.debug.setSpeed(2); });
    await p.waitForTimeout(3500);
    await p.evaluate(() => RF.debug.setSpeed(1)); await p.waitForTimeout(300);
    await shot(p, v + '_custom_night');
    await p.context().close();
  }

  console.log(errs.length ? 'NOTES/ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})();
