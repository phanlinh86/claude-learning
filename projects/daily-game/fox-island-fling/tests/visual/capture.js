// Visual QA capture: every screen at 4 viewports, each island at day / dusk / night (landscape + portrait),
// the aiming state, frame-by-frame motion contact sheets (1/30 s), custom pictures in play, and a deuteranopia
// simulation. Report-only: writes PNGs to tests/out/visual/ (gitignored). Run: node tests/visual/capture.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phoneP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
};
const ZONES = ['cove', 'jungle', 'lagoon', 'lantern'];
const DAYS = { day: 0.3, dusk: 0.62, night: 0.8 };
const errs = [];
const shot = (p, name, opt) => p.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, opt || {}));
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(b, view, q) {
  const ctx = await b.newContext(VIEWS[view]);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(view + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(view + ': ' + e));
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.FIF && FIF.debug && FIF.debug.mode && FIF.debug.mode !== 'boot', null, { timeout: 15000 });
  return { ctx, p };
}
// freeze the sim (speed 0) and advance it by hand: n frames of 1/30 s each
const freeze = p => p.evaluate(() => FIF.debug.setSpeed(0));
async function adv(p, frames) {
  await p.evaluate(n => { const G = FIF.Game; for (let i = 0; i < n; i++) { G.step(1 / 60); G.step(1 / 60); G.renderer.update(1 / 30); } }, frames || 1);
  await raf(p);
}
// advance until Finn is about to come down near the raft (or the flight ends)
async function advNearRaft(p, du) {
  await p.evaluate(du => { const G = FIF.Game, w = G.world; let i = 0;
    while (i++ < 600 && w.phase === 'fly' && !(w.fox.vy < 0 && w.fox.y - w.raft.top < du)) { G.step(1 / 60); G.step(1 / 60); G.renderer.update(1 / 30); } }, du || 2.4);
  await raf(p);
}
const ONLY = process.env.ONLY || '';
async function sheet(b, name, files, cols, label) {
  const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }), p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;background:#222;font:12px sans-serif;color:#fff"><div style="padding:4px">${label}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:3px;width:1600px">${imgs.map((s, i) =>
      `<div style="position:relative"><img src="${s}" style="width:100%;display:block"><span style="position:absolute;left:3px;top:2px;background:#000a;padding:1px 4px">${i}</span></div>`).join('')}</div></body>`);
  await shot(p, name, { fullPage: true });
  await ctx.close();
}

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
    await p.click('#btnPlay'); await p.waitForTimeout(2600); await shot(p, `screen_${v}_play`);
    await p.click('#btnPause'); await p.waitForTimeout(400); await shot(p, `screen_${v}_pause`);
    await p.click('#btnResume'); await p.waitForTimeout(300);
    await p.evaluate(() => { FIF.debug.setBot(true, 0.15); FIF.debug.setSpeed(24); });
    await p.waitForFunction(() => FIF.debug.mode === 'over', null, { timeout: 90000 });
    await p.waitForTimeout(900); await shot(p, `screen_${v}_over`);
    await ctx.close();
  }

  // ---------- 2. islands × day / dusk / night, idle + aiming (preview dots) ----------
  if (!ONLY || ONLY === 'islands') for (const v of ['desk', 'phoneP', 'ipad']) {
    const { ctx, p } = await open(b, v, '&autostart=1');
    await p.waitForFunction(() => FIF.debug.mode === 'playing');
    for (let z = 0; z < 4; z++) {
      if (z) await p.evaluate(i => FIF.debug.gotoLevel(i), z);
      await p.waitForTimeout(3000);   // let the banner + crossfade finish
      for (const [dn, d] of Object.entries(DAYS)) {
        if (v === 'ipad' && dn === 'dusk') continue;
        await p.evaluate(t => FIF.debug.setDay(t), d); await p.waitForTimeout(250);
        await shot(p, `island_${v}_${z}${ZONES[z]}_${dn}`);
        await p.evaluate(() => { const w = FIF.debug.world; w.aim(-0.6, -0.4); w.aim(-1.3, -0.95); });
        await p.waitForTimeout(150); await shot(p, `aim_${v}_${z}${ZONES[z]}_${dn}`);
        await p.evaluate(() => FIF.debug.world.cancelAim());
      }
    }
    await ctx.close();
  }

  // ---------- 3. motion contact sheets (desk, frame by frame at 1/30 s) ----------
  if (!ONLY || ONLY === 'motion') {
  const bursts = async (v, tag, zone, day, setup, frames, cols) => {
    const { ctx, p } = await open(b, v, '&autostart=1&level=' + zone + '&day=' + day);
    await p.waitForFunction(() => FIF.debug.mode === 'playing');
    await p.waitForTimeout(3000); await freeze(p);
    const files = [];
    const grab = async () => { const f = path.join(OUT, `mo_${tag}_${String(files.length).padStart(2, '0')}.png`); await p.screenshot({ path: f }); files.push(f); };
    await setup(p, grab);
    for (let i = 0; i < frames; i++) { await adv(p, 1); await grab(); }
    await sheet(b, `sheet_${tag}`, files, cols || 6, `${tag} (${v}, zone ${zone}, day ${day}) — 1/30 s per frame`);
    await ctx.close();
  };
  // perfect "solution" shot with the raft pinned: passes the leaves and lands on the X
  const pinRaft = (p, off) => p.evaluate(o => { const r = FIF.debug.world.raft; r.amp = 0; r.fromX = r.baseX = r.x = r.px = r.baseX + o * r.hw; }, off || 0);
  const solAim = p => p.evaluate(() => { const w = FIF.debug.world, s = w.solution.pull; w.aim(s.x * 0.5, s.y * 0.5); w.aim(s.x, s.y); });
  await bursts('desk', 'fling_bull', 0, 0.3, async (p, grab) => { await pinRaft(p, 0); await solAim(p); await adv(p, 1); await grab(); await p.evaluate(() => FIF.debug.world.release()); }, 23, 6);
  await bursts('desk', 'bull_land', 0, 0.3, async (p, grab) => { await pinRaft(p, 0); await solAim(p); await p.evaluate(() => FIF.debug.world.release()); await advNearRaft(p); await grab(); }, 35, 6);
  await bursts('desk', 'land_edge', 1, 0.3, async (p, grab) => { await solAim(p); await pinRaft(p, 0.75); await p.evaluate(() => FIF.debug.world.release()); await advNearRaft(p); await grab(); }, 29, 6);
  await bursts('desk', 'flutter', 0, 0.3, async (p, grab) => {
    await p.evaluate(() => { const w = FIF.debug.world; w.aim(-0.6, -0.4); w.aim(-1.0, -0.9); w.release(); }); await adv(p, 9); await grab();
    await p.evaluate(() => FIF.debug.world.flutter());
  }, 17, 6);
  await bursts('desk', 'bonk', 2, 0.3, async (p, grab) => {
    await p.evaluate(() => { const w = FIF.debug.world; w.aim(-0.6, -0.4); w.aim(-1.3, -0.9); w.release(); }); await adv(p, 10);
    // put the gull right in Finn's path
    await p.evaluate(() => { const w = FIF.debug.world, C = FIF.World.CONFIG, f = w.fox, g = w.gulls[0]; if (!g) return; const t = 0.3;
      const tx = f.x + f.vx * t, ty = f.y + f.vy * t - 0.5 * C.G * t * t; g.x0 = tx - g.vx * (g.t + t); g.baseY = ty; g.ph = -2 * Math.PI * (g.t + t) / C.GULL_BOB_T; });
    await grab();
  }, 17, 6);
  await bursts('desk', 'splash', 0, 0.3, async (p, grab) => {
    await p.evaluate(() => { const w = FIF.debug.world, r = w.raft; r.amp = 0; r.fromX = r.baseX = r.x = r.px = 14.5; w.aim(-0.6, -0.4); w.aim(-1.0, -0.55); w.release(); }); await advNearRaft(p, 1.6); await grab();
  }, 29, 6);
  await bursts('desk', 'flop', 0, 0.3, async (p, grab) => { await p.evaluate(() => { const w = FIF.debug.world; w.aim(-0.3, -0.1); w.aim(-0.42, -0.12); w.release(); }); await grab(); }, 29, 6);
  await bursts('desk', 'fling_night', 3, 0.8, async (p, grab) => { await pinRaft(p, 0); await solAim(p); await adv(p, 1); await grab(); await p.evaluate(() => FIF.debug.world.release()); await adv(p, 8); }, 17, 6);
  await bursts('desk', 'night_land', 3, 0.8, async (p, grab) => { await pinRaft(p, 0.5); await solAim(p); await p.evaluate(() => FIF.debug.world.release()); await advNearRaft(p); await grab(); }, 23, 6);
  await bursts('phoneP', 'fling_portrait', 2, 0.3, async (p, grab) => { await pinRaft(p, 0); await solAim(p); await adv(p, 1); await grab(); await p.evaluate(() => FIF.debug.world.release()); await advNearRaft(p); await grab(); }, 23, 8);
  }

  // ---------- 4. custom pictures through the Change Pictures file input ----------
  if (!ONLY || ONLY === 'custom') {
    const gen = await b.newPage();
    const pngs = await gen.evaluate(() => {
      const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c.toDataURL('image/png').split(',')[1]; };
      const photo = mk(800, 600, (g, w, h) => {   // a "pet photo": warm wall, brown dog-ish blob, noise
        let gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c8b49a'); gr.addColorStop(1, '#6e5a48'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#8b5a2b'; g.beginPath(); g.ellipse(400, 330, 210, 190, 0, 0, 7); g.fill();
        g.fillStyle = '#5b3a1b'; g.beginPath(); g.ellipse(250, 220, 60, 110, -0.4, 0, 7); g.ellipse(550, 220, 60, 110, 0.4, 0, 7); g.fill();
        g.fillStyle = '#111'; [[340, 300], [460, 300]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill(); });
        g.beginPath(); g.ellipse(400, 380, 34, 24, 0, 0, 7); g.fill();
        const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 40; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
      });
      const sticker = mk(512, 512, (g) => {   // transparent cartoon: purple star with a face
        g.fillStyle = '#8a4fd8'; g.strokeStyle = '#3d1a70'; g.lineWidth = 14; g.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 110 : 230, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(256 + r * Math.cos(a), 270 + r * Math.sin(a)); }
        g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(215, 250, 24, 0, 7); g.arc(300, 250, 24, 0, 7); g.fill();
      });
      const beach = mk(1600, 900, (g, w, h) => {   // a holiday photo: bright sky, sand, people-ish blobs
        let gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3a8fe0'); gr.addColorStop(0.55, '#bfe3ff'); gr.addColorStop(0.56, '#e8d29a'); gr.addColorStop(1, '#c9a868'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${Math.random() * 360},70%,${30 + Math.random() * 40}%)`; g.fillRect(Math.random() * w, 450 + Math.random() * 400, 30 + Math.random() * 80, 60 + Math.random() * 120); }
        const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 30; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
      });
      return { photo, sticker, beach };
    });
    await gen.close();
    for (const [n, b64] of Object.entries(pngs)) fs.writeFileSync(path.join(OUT, `input_${n}.png`), Buffer.from(b64, 'base64'));
    const ctx = await b.newContext(VIEWS.desk), p = await ctx.newPage();
    p.on('pageerror', e => errs.push('custom: ' + e));
    await p.goto(GAME + '?mute=1&seed=7'); await p.waitForFunction(() => FIF.debug && FIF.debug.mode === 'title');
    await p.click('#btnCustomize'); await p.waitForTimeout(400);
    const setSlot = async (idx, file) => {
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#slotGrid .slot [data-act=pick]').nth(idx).click()]);
      await fc.setFiles(path.join(OUT, file)); await p.waitForTimeout(1500);
    };
    await setSlot(0, 'input_photo.png'); await setSlot(1, 'input_sticker.png'); await setSlot(2, 'input_beach.png');
    await shot(p, 'custom_screen_set');
    // Round shape for the photo hero
    await p.locator('#slotGrid .slot').nth(0).locator('[data-shape=circle]').click(); await p.waitForTimeout(500);
    await shot(p, 'custom_screen_round');
    await p.evaluate(() => [...document.querySelectorAll('#scrCustom .btn-back')][0].click()); await p.waitForTimeout(300);
    await p.click('#btnPlay'); await p.waitForTimeout(3000);
    for (const [dn, d] of Object.entries(DAYS)) {
      await p.evaluate(t => FIF.debug.setDay(t), d); await p.waitForTimeout(250);
      await p.evaluate(() => { const w = FIF.debug.world; w.aim(-0.6, -0.4); w.aim(-1.3, -0.95); }); await p.waitForTimeout(100);
      await shot(p, `custom_play_${dn}_aim`);
      await p.evaluate(() => FIF.debug.world.release()); await p.waitForTimeout(450); await shot(p, `custom_play_${dn}_fly`);
      await p.waitForTimeout(2500);
    }
    // sticker as the hero (transparent PNG), photo as leaf
    await p.evaluate(() => FIF.Game.pause && FIF.Game.pause());
    await ctx.close();
    const ctx2 = await b.newContext(VIEWS.desk), p2 = await ctx2.newPage();
    await p2.goto(GAME + '?mute=1&seed=7'); await p2.waitForFunction(() => FIF.debug && FIF.debug.mode === 'title');
    await p2.click('#btnCustomize'); await p2.waitForTimeout(400);
    const set2 = async (idx, file) => { const [fc] = await Promise.all([p2.waitForEvent('filechooser'), p2.locator('#slotGrid .slot [data-act=pick]').nth(idx).click()]); await fc.setFiles(path.join(OUT, file)); await p2.waitForTimeout(1500); };
    await set2(0, 'input_sticker.png'); await set2(1, 'input_photo.png');
    await p2.evaluate(() => [...document.querySelectorAll('#scrCustom .btn-back')][0].click()); await p2.waitForTimeout(300);
    await p2.click('#btnPlay'); await p2.waitForTimeout(3000);
    await p2.evaluate(() => { const w = FIF.debug.world; w.aim(-0.6, -0.4); w.aim(-1.3, -0.95); }); await p2.waitForTimeout(100);
    await shot(p2, 'custom2_play_aim');
    await p2.evaluate(() => FIF.debug.world.release()); await p2.waitForTimeout(450); await shot(p2, 'custom2_play_fly');
    await p2.evaluate(() => FIF.debug.setDay(0.8)); await p2.waitForTimeout(2500); await shot(p2, 'custom2_play_night');
    await ctx2.close();
  }

  // ---------- 5. deuteranopia simulation (Machado 2009 matrix as an SVG filter on the canvas + page) ----------
  if (!ONLY || ONLY === 'deut') {
    const { ctx, p } = await open(b, 'desk', '&autostart=1');
    await p.waitForFunction(() => FIF.debug.mode === 'playing'); await p.waitForTimeout(3000);
    await p.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="deut"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>');
      document.getElementById('stage').style.filter = 'url(#deut)';
    });
    for (let z = 0; z < 4; z++) {
      if (z) { await p.evaluate(i => FIF.debug.gotoLevel(i), z); await p.waitForTimeout(3000); }
      await p.evaluate(() => { FIF.debug.setDay(0.3); const w = FIF.debug.world; w.aim(-0.6, -0.4); w.aim(-1.3, -0.95); }); await p.waitForTimeout(150);
      await shot(p, `deut_${z}${ZONES[z]}_day`);
      await p.evaluate(() => { FIF.debug.setDay(0.8); }); await p.waitForTimeout(200);
      await shot(p, `deut_${z}${ZONES[z]}_night`);
      await p.evaluate(() => FIF.debug.world.cancelAim());
    }
    await ctx.close();
  }

  await b.close();
  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no console errors');
  console.log('screenshots in ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
