// Visual QA capture: every screen at three sizes, every castle place with a busy board, Ember's frames,
// merge / cascade / Boo / pumpkin / goal contact sheets, tier readability + colour-blind simulation, custom pictures.
// Usage: node tests/visual/capture.js   → PNGs in tests/out/visual/
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const VIEWS = [
  { tag: 'L1280', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { tag: 'I1024', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { tag: 'P390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
];
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- in-page helpers (installed after boot) ----
function install() {
  const G = EG.Game;
  window.QA = {
    freeze() { EG.debug.setSpeed(0); },
    adv(sec) {   // deterministic advance in 1/120 s steps, then draw
      const n = Math.round(sec * 120);
      for (let i = 0; i < n; i++) { G.step(1 / 120); G.renderer.update(1 / 120); }
      G.renderer.draw(G.mode);
    },
    busy(zone) {   // a full-ish board of every tier with no equal neighbours (+ pumpkins from the cellar on)
      const H = [5, 3, 6, 4, 2], cols = [];
      for (let c = 0; c < 5; c++) { const a = []; for (let r = 0; r < H[c]; r++) a.push(((c * 3 + r) % 8) + 1); cols.push(a); }
      if (zone >= 1) { cols[1].push(0); cols[4].push(0); }
      EG.debug.fillBoard(cols);
    },
    held(t, kind) { G.world.held = { tier: t, kind: kind || 'light' }; },
    aimNow(c) { const w = G.world; w.aim(c); for (let i = 0; i < 240 && Math.abs(w.ember.x - w.colX(c)) > 1; i++) QA.adv(1 / 120); },
    layout() { const L = G.world.layout, r = G.renderer.canvas.getBoundingClientRect(); return { L, r, VW: G.renderer.VW, VH: G.renderer.VH }; },
    cbFilters() {
      if (document.getElementById('cbsvg')) return;
      document.body.insertAdjacentHTML('beforeend', '<svg id="cbsvg" width="0" height="0" style="position:absolute"><defs>' +
        '<filter id="deut" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter>' +
        '<filter id="prot" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter>' +
        '<filter id="gray"><feColorMatrix type="saturate" values="0"/></filter></defs></svg>');
    },
    photo(w, h, hue, kind) {   // a generated photo-like picture (gradients + noise + blobs), as a File
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${hue},55%,62%)`); gr.addColorStop(1, `hsl(${(hue + 60) % 360},45%,30%)`);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { g.fillStyle = `hsla(${(hue + i * 9) % 360},50%,${30 + (i * 7) % 50}%,.35)`; g.beginPath(); g.ellipse((i * 97) % w, (i * 53) % h, w * 0.08 + (i % 5) * 9, h * 0.06 + (i % 7) * 7, i, 0, 6.3); g.fill(); }
      if (kind === 'face') { g.fillStyle = '#f2c9a0'; g.beginPath(); g.ellipse(w / 2, h * 0.48, w * 0.28, h * 0.34, 0, 0, 6.3); g.fill();
        g.fillStyle = '#3a2a20'; g.beginPath(); g.arc(w * 0.4, h * 0.42, w * 0.035, 0, 6.3); g.arc(w * 0.6, h * 0.42, w * 0.035, 0, 6.3); g.fill();
        g.strokeStyle = '#7a3a30'; g.lineWidth = w * 0.02; g.beginPath(); g.arc(w / 2, h * 0.55, w * 0.1, 0.3, 2.8); g.stroke(); }
      const id = g.getImageData(0, 0, w, h), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 30; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      g.putImageData(id, 0, 0);
      return new Promise(res => c.toBlob(b => res(new File([b], kind + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9));
    }
  };
}

async function boot(ctx, q) {
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.EG && EG.debug && EG.Game && (EG.debug.mode === 'title' || EG.debug.mode === 'playing'), null, { timeout: 15000 });
  await p.evaluate(install);
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: OUT + '/' + name + '.png', clip });

// board clip in CSS px (plus margin; optional extra above for Ember)
async function boardClip(p, mTop, m) {
  const { L, r, VW, VH } = await p.evaluate(() => QA.layout());
  const k = r.width / VW; m = m == null ? 0.6 : m;
  const x = r.left + (L.boardX - L.cell * m) * k, y = r.top + (L.boardY - L.cell * (mTop || m)) * k;
  return { x: Math.max(0, x), y: Math.max(0, y), width: (L.boardW + L.cell * m * 2) * k, height: (L.boardH + L.cell * ((mTop || m) + m)) * k };
}

async function sheet(b, name, frames, cols, labels) {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const cells = frames.map((f, i) => `<figure><img src="data:image/png;base64,${f.toString('base64')}"><figcaption>${labels ? labels[i] : i}</figcaption></figure>`).join('');
  await p.setContent(`<style>body{margin:0;background:#111;font:12px monospace;color:#ddd}div{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px}
    figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 4px}</style><div>${cells}</div>`);
  await p.screenshot({ path: OUT + '/' + name + '.png', fullPage: true });
  await p.close();
}

async function frames(p, clip, n, dt) {
  const out = [];
  for (let i = 0; i < n; i++) { out.push(await p.screenshot({ clip })); await p.evaluate(d => QA.adv(d), dt); }
  return out;
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------------- screens at three sizes ----------------
  for (const V of VIEWS) {
    const ctx = await b.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, hasTouch: !!V.hasTouch, isMobile: !!V.isMobile });
    const p = await boot(ctx);
    await sleep(3000); await shot(p, V.tag + '_title');
    for (const s of ['scrHow', 'scrSettings', 'scrCustom']) { await p.evaluate(s => EG.UI.show(s), s); await sleep(500); await shot(p, V.tag + '_' + s); }
    await p.evaluate(() => EG.UI.show('scrTitle'));
    await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
    await p.waitForFunction(() => EG.debug && EG.debug.mode === 'playing'); await p.evaluate(install);
    await sleep(700); await shot(p, V.tag + '_banner');
    await sleep(2400); await shot(p, V.tag + '_play_start');
    await p.evaluate(() => { EG.debug.setBot(true, 0.9); EG.debug.setSpeed(4); });
    await p.waitForFunction(() => EG.debug.world.stats.merges >= 10, null, { timeout: 30000 }).catch(() => errs.push(V.tag + ' bot merges timeout'));
    await p.evaluate(() => { EG.debug.setSpeed(1); EG.debug.setBot(false); });
    await sleep(300); await shot(p, V.tag + '_play_bot');
    for (let z = 0; z < 4; z++) {
      await p.evaluate(z => { EG.debug.gotoLevel(z); }, z);
      await sleep(1000); await p.evaluate(z => QA.busy(z), z); await shot(p, V.tag + '_zone' + z + '_banner');
      await sleep(2400); await shot(p, V.tag + '_zone' + z);
    }
    await p.evaluate(() => EG.Game.pause()); await sleep(500); await shot(p, V.tag + '_pause');
    await p.evaluate(() => EG.Game.resume());
    // game over
    await p.evaluate(() => { const w = EG.debug.world, cols = [];
      for (let c = 0; c < w.cols; c++) { const col = []; for (let r = 0; r < w.rows; r++) col.push(((c * 3 + r) % 7) + 2); cols.push(col); }
      w.setBoard(cols); QA.held(1); });
    for (let c = 0; c < 5; c++) { await p.evaluate(c => EG.debug.drop(c), c); await sleep(250); }
    await p.waitForFunction(() => EG.debug.world.phase === 'over', null, { timeout: 10000 }).catch(() => errs.push(V.tag + ' no over phase'));
    await sleep(500); await shot(p, V.tag + '_over_moment');
    await p.waitForFunction(() => EG.debug.mode === 'over', null, { timeout: 10000 }).catch(() => errs.push(V.tag + ' no game over'));
    await sleep(900); await shot(p, V.tag + '_over');
    await ctx.close();
  }

  // ---------------- detailed captures at 1280×720 (and portrait for some) ----------------
  for (const V of [VIEWS[0], VIEWS[2]]) {
    const ctx = await b.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, hasTouch: !!V.hasTouch, isMobile: !!V.isMobile });
    const p = await boot(ctx, '&autostart=1&diff=normal');
    await p.waitForFunction(() => EG.debug.mode === 'playing');
    await sleep(3000);
    await p.evaluate(() => QA.freeze());
    const T = V.tag;

    // tiers on every background: rows of tiers 1..8 + pumpkins, no equal neighbours
    await p.evaluate(() => QA.cbFilters());
    for (let z = 0; z < 4; z++) {
      await p.evaluate(z => { EG.debug.gotoLevel(z); QA.adv(3.2);
        EG.debug.fillBoard([[1, 5, 1, 5, 0], [2, 6, 2, 6], [3, 7, 3, 7, 0], [4, 8, 4, 8], [5, 1, 6, 2, 7]]); QA.adv(0.05); }, z);
      const clip = await boardClip(p, 2.2, 0.8);
      await shot(p, T + '_tiers_zone' + z, clip);
      if (z === 0 && T === 'L1280') {
        await shot(p, T + '_tiers_full');
        for (const f of ['deut', 'prot', 'gray']) {
          await p.evaluate(f => { document.getElementById('game').style.filter = 'url(#' + f + ')'; }, f); await sleep(150);
          await shot(p, T + '_tiers_' + f, clip); await shot(p, T + '_full_' + f);
        }
        await p.evaluate(() => { document.getElementById('game').style.filter = ''; });
      }
    }
    await p.evaluate(() => { EG.debug.gotoLevel(0); QA.adv(3.2); });

    // Ember frames: idle, flap, drop, happy, oops (+ refuse on a full column)
    await p.evaluate(() => EG.debug.fillBoard([[2, 3], [], [1], [], []]));
    const eclip = await (async () => { const { L, r, VW } = await p.evaluate(() => QA.layout()); const k = r.width / VW;
      return { x: r.left + (L.boardX - L.cell) * k, y: Math.max(0, r.top + (L.emberY - L.cell * 1.3) * k), width: (L.boardW + 2 * L.cell) * k, height: L.cell * 2.8 * k }; })();
    const ef = [], el = [];
    for (const a of ['idle', 'flap', 'drop', 'happy', 'oops']) {
      await p.evaluate(a => { const R = EG.Game.renderer, w = EG.debug.world; QA.held(3);
        if (a === 'flap') { w.ember.anim = 'idle'; R.time = 0.15; } else if (a === 'idle') { w.ember.anim = 'idle'; R.time = 0.02; } else { w.ember.anim = a; w.ember.animT = 0; }
        R.draw(EG.Game.mode); }, a);
      ef.push(await p.screenshot({ clip: eclip })); el.push(a);
    }
    await sheet(b, T + '_ember_frames', ef, 5, el);
    // refuse
    await p.evaluate(() => { EG.debug.fillBoard([[1, 2, 3, 4, 5, 6, 7], [], [2], [], []]); QA.held(2); QA.aimNow(0); EG.debug.drop(0); QA.adv(0.05); });
    const rf = await frames(p, await boardClip(p, 2.4, 0.6), 8, 0.08);
    await sheet(b, T + '_refuse', rf, 8, rf.map((_, i) => (i * 80) + 'ms'));

    // merge + cascade + pumpkin wake: col0 [3,2] + drop 2 → 3 falls → triple 3 → jar; pumpkin next to it rolls
    await p.evaluate(() => { EG.debug.gotoLevel(1); QA.adv(3.2); EG.debug.fillBoard([[3, 2], [3, 5], [0, 1], [4], []]); QA.held(2); QA.aimNow(0); EG.debug.drop(0); QA.adv(1 / 120); });
    const mclip = await boardClip(p, 2.4, 0.6);
    const mf = await frames(p, mclip, 32, 0.05);
    await sheet(b, T + '_merge_cascade', mf, 8, mf.map((_, i) => (i * 50) + 'ms'));

    // Boo at combo 5: small lights + pumpkins on top
    await p.evaluate(() => { EG.debug.fillBoard([[2, 1, 0], [3, 4, 1], [5, 0], [1, 2, 1], [6, 3]]); const w = EG.debug.world; w.combo = 4; QA.held(1); QA.aimNow(2); EG.debug.drop(2); QA.adv(1 / 120); });
    const bclip = await boardClip(p, 3.5, 1.4);
    const bf = await frames(p, bclip, 24, 0.15);
    await sheet(b, T + '_boo', bf, 6, bf.map((_, i) => (i * 150) + 'ms'));

    // pumpkins rising from the bottom (night creep)
    await p.evaluate(() => { EG.debug.fillBoard([[2, 3], [4], [1, 5], [], [6]]); const w = EG.debug.world; w.riseEvery = w.riseEvery || 6; w.riseIn = 1; QA.held(5); QA.aimNow(3); EG.debug.drop(3); QA.adv(1 / 120); });
    const pf = await frames(p, await boardClip(p, 2.4, 0.6), 16, 0.08);
    await sheet(b, T + '_pumpkin_rise', pf, 8, pf.map((_, i) => (i * 80) + 'ms'));

    // goal light ascending (courtyard goal = candle): 4 + 4
    await p.evaluate(() => { EG.debug.gotoLevel(0); QA.adv(3.2); EG.debug.fillBoard([[4], [2, 3], [1], [3], []]); QA.held(4); QA.aimNow(0); EG.debug.drop(0); QA.adv(1 / 120); });
    const gclip = await (async () => { const { r } = await p.evaluate(() => QA.layout()); return { x: r.left, y: r.top, width: r.width, height: r.height }; })();
    const gf = await frames(p, gclip, 18, 0.12);
    await sheet(b, T + '_goal', gf, 6, gf.map((_, i) => (i * 120) + 'ms'));
    await p.evaluate(() => QA.adv(3.5)); await shot(p, T + '_after_goal');
    // full-resolution stills of the busiest text moments
    await p.evaluate(() => { EG.debug.gotoLevel(0); QA.adv(3.2); EG.debug.fillBoard([[4], [2, 3], [1], [3], []]); QA.held(4); QA.aimNow(0); EG.debug.drop(0); QA.adv(1.25); });
    await shot(p, T + '_goal_texts');
    await p.evaluate(() => { EG.debug.gotoLevel(1); QA.adv(3.2); EG.debug.fillBoard([[2, 1, 0], [3, 4, 1], [5, 0], [1, 2, 1], [6, 3]]); EG.debug.world.combo = 4; QA.held(1); QA.aimNow(2); EG.debug.drop(2); QA.adv(1.5); });
    await shot(p, T + '_boo_texts');
    await p.evaluate(() => QA.adv(0.5)); await shot(p, T + '_boo_texts2');
    await p.evaluate(() => QA.adv(0.6)); await shot(p, T + '_boo_carry');

    // floating texts stacking: big triple cascade with combo + new tier
    await p.evaluate(() => { EG.debug.gotoLevel(2); QA.adv(3.2); EG.debug.fillBoard([[4, 3], [4, 3], [5], [], []]); const w = EG.debug.world; w.combo = 2; QA.held(3); QA.aimNow(2); EG.debug.drop(2); QA.adv(1 / 120); });
    const tf = await frames(p, gclip, 12, 0.12);
    await sheet(b, T + '_texts', tf, 4, tf.map((_, i) => (i * 120) + 'ms'));
    await ctx.close();
  }

  // ---------------- custom pictures ----------------
  for (const V of [VIEWS[0], VIEWS[2]]) {
    const ctx = await b.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, hasTouch: !!V.hasTouch, isMobile: !!V.isMobile });
    const p = await boot(ctx);
    await p.evaluate(async () => {
      await EG.Assets.setCustom('hero', await QA.photo(640, 640, 30, 'face'));
      await EG.Assets.setCustom('item', await QA.photo(400, 400, 200, 'face'));
      await EG.Assets.setCustom('helper', await QA.photo(500, 500, 280, 'blob'));
      await EG.Assets.setCustom('bg_courtyard', await QA.photo(1600, 1000, 100, 'land'));
      await EG.Assets.setCustom('bg_cellar', await QA.photo(1600, 1000, 40, 'land'));
      EG.Assets._ver = (EG.Assets._ver || 0) + 1;
    });
    await p.evaluate(() => EG.UI.show('scrCustom')); await sleep(600); await shot(p, V.tag + '_custom_screen');
    await p.evaluate(() => EG.Game.startGame()); await sleep(3000);
    await p.evaluate(() => { QA.freeze(); EG.debug.fillBoard([[1, 2, 3, 4, 5], [6, 7, 8], [2, 1], [3, 4, 3], [5]]); QA.held(2); QA.adv(0.05); });
    await shot(p, V.tag + '_custom_play');
    await p.evaluate(() => { EG.debug.fillBoard([[2, 1, 0], [3, 4, 1], [5, 0], [1, 2, 1], [6, 3]]); EG.debug.world.combo = 4; QA.held(1); QA.aimNow(2); EG.debug.drop(2); QA.adv(1.0); });
    await shot(p, V.tag + '_custom_boo');
    await p.evaluate(() => { EG.debug.gotoLevel(1); QA.adv(3.2); QA.busy(1); QA.adv(0.05); }); await shot(p, V.tag + '_custom_cellar');
    await p.evaluate(() => { EG.debug.gotoLevel(2); QA.adv(3.2); QA.busy(2); QA.adv(0.05); }); await shot(p, V.tag + '_custom_library_default');
    await ctx.close();
  }

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})();
