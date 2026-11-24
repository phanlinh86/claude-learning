// Visual QA capture for Nubi's Farm Fling. Report-only: writes PNGs to tests/out/visual/ (gitignored).
// Run: node tests/visual/capture.js            (all)   ONLY=screens|seasons|sizes|events|motion|deut node ...
// Covers: every screen at 4 viewports; every season (levels 0–3) during aim / flight / landing (rain, winter snow);
// Nubi at size 1.0 / 1.4 / 1.7 in flight and landing; a plop; a crow bonk; a season crossfade + banner; frame-by-frame
// motion contact sheets (launch, puff, landing squash, plop) at 1/30 s; a deuteranopia simulation of every season.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  phoneP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  ipad: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const ONLY = process.env.ONLY || '';
const errs = [];
const shot = (p, name, opt) => p.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, opt || {}));
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(b, view, q) {
  const ctx = await b.newContext(VIEWS[view]);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(view + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(view + ': ' + e));
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.CFF && CFF.debug && CFF.debug.mode && CFF.debug.mode !== 'boot', null, { timeout: 15000 });
  if (/autostart/.test(q || '')) {
    await p.waitForFunction(() => CFF.debug.mode === 'playing', null, { timeout: 15000 });
    // portrait phones show a "turn sideways" card; dismiss it so the play field is visible
    await p.evaluate(() => { const b = document.getElementById('btnRotateOk'); if (b && !document.getElementById('rotate').classList.contains('hidden')) b.click(); });
  }
  return { ctx, p };
}
// freeze the sim (speed 0) and advance it by hand: n frames of 1/30 s each
const freeze = p => p.evaluate(() => CFF.debug.setSpeed(0));
async function adv(p, frames) {
  await p.evaluate(n => { const G = CFF.Game; for (let i = 0; i < n; i++) { G.step(1 / 60); G.step(1 / 60); G.renderer.update(1 / 30); } }, frames || 1);
  await raf(p);
}
// advance (≤ max frames) until a condition on the world holds
async function advUntil(p, cond, max) {
  await p.evaluate(([c, m]) => { const G = CFF.Game, f = new Function('w', 'return ' + c); let i = 0;
    while (i++ < m && !f(G.world)) { G.step(1 / 60); G.step(1 / 60); G.renderer.update(1 / 30); } }, [cond, max || 400]);
  await raf(p);
}
// in-page installer: pin the wagon, find a pull that lands on it (or plops on the grass at ~x)
const helpers = p => p.evaluate(() => {
  const D = CFF.debug;
  D.pin = (x) => { const r = D.world.wagon; r.amp = 0; if (x != null) r.baseX = x; r.fromX = r.x = r.px = r.baseX; r.t = 99; };
  D.find = (want, gx) => {
    const w = D.world; let best = null;
    for (let a = 20; a <= 70; a += 1) for (let m = 0.4; m <= 1.8; m += 0.04) {
      const pull = { x: -m * Math.cos(a * Math.PI / 180), y: -m * Math.sin(a * Math.PI / 180) };
      const r = w.predictShot(pull, 0); if (!r) continue;
      let sc;
      if (want === 'land') { if (r.type !== 'land') continue; sc = Math.abs(r.off) - 0.3 * r.flies; }
      else { if (r.type !== 'plop') continue; sc = Math.abs(r.x - gx); }
      if (!best || sc < best.sc) best = { sc, pull, r };
    }
    return best;
  };
  D.shoot = (want, gx) => { const b = D.find(want, gx); if (!b) return null; const w = D.world; w.aim(b.pull.x * 0.5, b.pull.y * 0.5); w.aim(b.pull.x, b.pull.y); return b.r.type; };
});
async function sheet(b, name, files, cols, label) {
  const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }), p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;background:#222;font:12px sans-serif;color:#fff"><div style="padding:4px">${label}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:3px;width:1600px">${imgs.map((s, i) =>
      `<div style="position:relative"><img src="${s}" style="width:100%;display:block"><span style="position:absolute;left:3px;top:2px;background:#000a;padding:1px 4px">${i}</span></div>`).join('')}</div></body>`);
  await shot(p, name, { fullPage: true });
  await ctx.close();
}
const DEUT = '<svg width="0" height="0" style="position:absolute"><filter id="deut"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>';

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------- 1. every screen at every viewport ----------
  if (!ONLY || ONLY === 'screens') for (const v of Object.keys(VIEWS)) {
    const { ctx, p } = await open(b, v);
    await p.waitForTimeout(2500); await shot(p, `screen_${v}_title`);
    for (const [btn, n] of [['btnHow', 'how'], ['btnSettings', 'settings'], ['btnCustomize', 'custom']]) {
      await p.click('#' + btn); await p.waitForTimeout(500); await shot(p, `screen_${v}_${n}`);
      await p.evaluate(() => { const bb = [...document.querySelectorAll('.screen:not(.hidden) .btn-back')][0]; bb && bb.click(); });
      await p.waitForTimeout(400);
    }
    await p.click('#btnPlay'); await p.waitForTimeout(900); await shot(p, `screen_${v}_play_banner`);
    await p.evaluate(() => { const b = document.getElementById('btnRotateOk'); if (b && !document.getElementById('rotate').classList.contains('hidden')) b.click(); });
    await p.waitForTimeout(2000); await shot(p, `screen_${v}_play_hint`);
    await p.click('#btnPause'); await p.waitForTimeout(400); await shot(p, `screen_${v}_pause`);
    await p.click('#btnResume'); await p.waitForTimeout(300);
    await p.evaluate(() => { CFF.debug.setBot(true, 0.2); CFF.debug.setSpeed(24); });
    await p.waitForFunction(() => CFF.debug.mode === 'over', null, { timeout: 120000 });
    await p.waitForTimeout(1200); await shot(p, `screen_${v}_over`);
    await ctx.close();
  }

  // ---------- 2. every season: aim, flight (apex), landing (rain / snow) ----------
  if (!ONLY || ONLY === 'seasons') for (const v of Object.keys(VIEWS)) for (let z = 0; z < 4; z++) {
    const { ctx, p } = await open(b, v, '&autostart=1&diff=normal&level=' + z);
    await p.waitForTimeout(3200); await freeze(p); await helpers(p);
    await p.evaluate(() => CFF.debug.pin());
    await p.evaluate(() => CFF.debug.shoot('land')); await adv(p, 1);
    await shot(p, `season_${v}_${z}${SEASONS[z]}_aim`);
    await p.evaluate(() => CFF.debug.world.release());
    await advUntil(p, 'w.nubi.vy < 0.3', 200); await shot(p, `season_${v}_${z}${SEASONS[z]}_fly`);
    await advUntil(p, "w.phase !== 'fly'", 400); await adv(p, 10);
    await shot(p, `season_${v}_${z}${SEASONS[z]}_land`);
    await ctx.close();
  }

  // ---------- 3. Nubi at size 1.0 / 1.4 / 1.7, flight + landing ----------
  if (!ONLY || ONLY === 'sizes') for (const v of ['desk', 'phoneL', 'phoneP']) for (const s of [1, 1.4, 1.7]) {
    const { ctx, p } = await open(b, v, '&autostart=1&diff=normal&level=1&size=' + s);
    await p.waitForTimeout(3200); await freeze(p); await helpers(p);
    await p.evaluate(s => { CFF.debug.pin(); CFF.debug.setSize(s); }, s);
    await p.evaluate(() => CFF.debug.shoot('land')); await adv(p, 1);
    await shot(p, `size_${v}_${s}_aim`);
    await p.evaluate(() => CFF.debug.world.release());
    await advUntil(p, 'w.nubi.vy < 0.3', 200); await shot(p, `size_${v}_${s}_fly`);
    await advUntil(p, "w.phase !== 'fly'", 400); await adv(p, 8);
    await shot(p, `size_${v}_${s}_land`);
    await ctx.close();
  }

  // ---------- 4. events: plop on the grass, crow bonk, season crossfade + banner ----------
  if (!ONLY || ONLY === 'events') for (const v of ['desk', 'phoneL', 'ipad']) {
    { // plop
      const { ctx, p } = await open(b, v, '&autostart=1&diff=normal&level=0');
      await p.waitForTimeout(3200); await freeze(p); await helpers(p);
      await p.evaluate(() => { CFF.debug.pin(14.2); CFF.debug.shoot('plop', 8.5); CFF.debug.world.release(); });
      await advUntil(p, "w.phase !== 'fly'", 400); await adv(p, 3); await shot(p, `plop_${v}_a`);
      await adv(p, 9); await shot(p, `plop_${v}_b`);
      await ctx.close();
    }
    { // crow bonk (autumn: one crow)
      const { ctx, p } = await open(b, v, '&autostart=1&diff=normal&level=2');
      await p.waitForTimeout(3200); await freeze(p); await helpers(p);
      await p.evaluate(() => { CFF.debug.pin(); CFF.debug.shoot('land'); CFF.debug.world.release(); });
      await adv(p, 9);
      const ok = await p.evaluate(() => { const w = CFF.debug.world, C = CFF.World.CONFIG, f = w.nubi, g = w.crows[0]; if (!g) return false; const t = 0.3;
        const tx = f.x + f.vx * t + 0.25, ty = f.y + f.vy * t - 0.5 * C.G * t * t; g.x0 = tx - g.vx * (g.t + t); g.baseY = ty; g.ph = -2 * Math.PI * (g.t + t) / C.CROW_BOB_T; return true; });
      if (!ok) errs.push(v + ': no crow in autumn');
      await advUntil(p, 'w.stats.bumps > 0', 40); await shot(p, `bonk_${v}_a`);
      await adv(p, 4); await shot(p, `bonk_${v}_b`);
      await ctx.close();
    }
    { // crossfade spring → summer and the banner
      const { ctx, p } = await open(b, v, '&autostart=1&diff=normal&level=0');
      await p.waitForTimeout(3500); await freeze(p);
      await p.evaluate(() => CFF.debug.gotoLevel(1));
      for (const [f, n] of [[6, '0.2s'], [15, '0.5s'], [24, '0.8s'], [45, '1.5s']]) { await adv(p, f - (n === '0.2s' ? 0 : 0)); await shot(p, `xfade_${v}_${n}`); }
      await ctx.close();
    }
  }

  // ---------- 5. motion contact sheets (desk, 1/30 s per frame) ----------
  if (!ONLY || ONLY === 'motion') {
    const bursts = async (v, tag, q, setup, frames, cols) => {
      const { ctx, p } = await open(b, v, '&autostart=1&diff=normal' + q);
      await p.waitForTimeout(3200); await freeze(p); await helpers(p);
      const files = [];
      const grab = async () => { const f = path.join(OUT, `mo_${tag}_${String(files.length).padStart(2, '0')}.png`); await p.screenshot({ path: f }); files.push(f); };
      await setup(p, grab);
      for (let i = 0; i < frames; i++) { await adv(p, 1); await grab(); }
      await sheet(b, `sheet_${tag}`, files, cols || 6, `${tag} (${v}) — 1/30 s per frame`);
      await ctx.close();
    };
    await bursts('desk', 'launch', '&level=0', async (p, grab) => { await p.evaluate(() => { CFF.debug.pin(); CFF.debug.shoot('land'); }); await adv(p, 1); await grab(); await p.evaluate(() => CFF.debug.world.release()); }, 17, 6);
    await bursts('desk', 'puff', '&level=0&size=1.3', async (p, grab) => {
      await p.evaluate(() => { CFF.debug.pin(); CFF.debug.shoot('land'); CFF.debug.world.release(); });
      await advUntil(p, 'w.nubi.vy < 1', 200); await grab(); await p.evaluate(() => CFF.debug.world.puff());
    }, 17, 6);
    await bursts('desk', 'land', '&level=1&size=1.5', async (p, grab) => {
      await p.evaluate(() => { CFF.debug.pin(); CFF.debug.shoot('land'); CFF.debug.world.release(); });
      await advUntil(p, "w.phase !== 'fly' || (w.nubi.vy < 0 && w.nubi.y - w.wagon.top < 2.2)", 400); await grab();
    }, 35, 6);
    await bursts('desk', 'land_winter', '&level=3&size=1.2', async (p, grab) => {
      await p.evaluate(() => { CFF.debug.pin(); CFF.debug.shoot('land'); CFF.debug.world.release(); });
      await advUntil(p, "w.phase !== 'fly'", 400); await grab();
    }, 23, 6);
    await bursts('desk', 'plop', '&level=0', async (p, grab) => {
      await p.evaluate(() => { CFF.debug.pin(14.2); CFF.debug.shoot('plop', 8.5); CFF.debug.world.release(); });
      await advUntil(p, "w.phase !== 'fly' || (w.nubi.vy < 0 && w.nubi.y < 2.0)", 400); await grab();
    }, 29, 6);
    await bursts('phoneL', 'launch_phone', '&level=2', async (p, grab) => { await p.evaluate(() => { CFF.debug.pin(); CFF.debug.shoot('land'); }); await adv(p, 1); await grab(); await p.evaluate(() => CFF.debug.world.release()); }, 23, 6);
  }

  // ---------- 6. deuteranopia simulation (Machado 2009 matrix as an SVG filter on the stage) ----------
  if (!ONLY || ONLY === 'deut') for (const v of ['desk', 'phoneL']) for (let z = 0; z < 4; z++) {
    const { ctx, p } = await open(b, v, '&autostart=1&diff=normal&level=' + z + '&size=1.3');
    await p.waitForTimeout(3200); await freeze(p); await helpers(p);
    await p.evaluate(d => { document.body.insertAdjacentHTML('beforeend', d); document.getElementById('stage').style.filter = 'url(#deut)'; }, DEUT);
    await p.evaluate(() => { CFF.debug.pin(); CFF.debug.shoot('land'); }); await adv(p, 1);
    await shot(p, `deut_${v}_${z}${SEASONS[z]}_aim`);
    await p.evaluate(() => CFF.debug.world.release()); await advUntil(p, 'w.nubi.vy < 0.3', 200);
    await shot(p, `deut_${v}_${z}${SEASONS[z]}_fly`);
    await ctx.close();
  }

  await b.close();
  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no console errors');
  console.log('screenshots in ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
