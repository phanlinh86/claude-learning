// Visual QA capture for Spike's Dino Jam: every screen at 6 viewports, gameplay per biome with a long trail,
// banners, crossfade, Mumbles + pillows, motion contact sheets, readability / colour-blind lineups, custom pictures.
// Output: tests/out/visual/*.png      Run: node tests/visual/capture.js [section ...]
//   sections: screens play events bursts lineup custom   (default: all)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual');
const FIX = path.join(OUT, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });

const TOUCH = { isMobile: true, hasTouch: true };
const VIEWPORTS = {
  '1280': { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  '1920': { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  '800': { viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 },
  'iphoneP': Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 }, TOUCH),
  'iphoneL': Object.assign({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 }, TOUCH),
  'ipad': Object.assign({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 }, TOUCH)
};
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, name, opts) => { await p.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, opts || {})); console.log('  ' + name); };
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(b, vp, q) {
  const ctx = await b.newContext(VIEWPORTS[vp]);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(vp + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(vp + ': ' + String(e)));
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.DJ && DJ.debug && DJ.debug.mode !== 'boot', null, { timeout: 15000 });
  await installHelpers(p);
  return { ctx, p };
}

async function installHelpers(p) {
  await p.evaluate(() => {
    const G = DJ.Game;
    window.QA = {
      advance(t) { const h = 1 / 120; let n = Math.round(t / h); while (n-- > 0) { G.step(h); G.renderer.update(h); } G.renderer.draw(G.mode); },
      noBoss() { const b = G.world.boss; b.next = 1e9; },
      clearFx() { G.renderer.fx.length = 0; G.renderer.texts.length = 0; G.renderer.banner = null; },
      longSong() { const w = G.world; w.songTarget = 99; },
      keepAlive() { clearInterval(QA._ka); QA._ka = setInterval(() => { const w = G.world; if (w.hearts < 2) w.hearts = w.heartsMax; if (w.songTarget < 99 && w.state === 'playing') w.songTarget = 99; }, 100); },
      stopKeepAlive() { clearInterval(QA._ka); },
      L() { const R = G.renderer; return { VW: R.VW, VH: R.VH, arena: R.layout.arena }; },
      rect() { const r = document.getElementById('game').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, VW: G.renderer.VW, VH: G.renderer.VH }; },
      note(x, y, kind, gold, state) {
        const w = G.world; const n = { id: w._nextId++, x, y, kind, gold: !!gold, t: 1, state: state || 'idle', life: 3, vx: 0, vy: 0, z: 0, vz: 0, _px: x, _py: y };
        w.notes.push(n); return n.id;
      },
      place(x, y, heading) { const s = G.world.spike; s.x = s._px = x; s.y = s._py = y; s.heading = heading || 0; },
      pillow(x, y, frac) {   // a falling pillow at `frac` of its flight (0 = thrown, 1 = landing)
        const w = G.world, c = w.cfg, b = w.boss;
        const pl = { id: w._nextId++, x, y, sx: x - 160, sy: y - 200, t: 0, dur: c.pillowDur, z: c.pillowZ0, z0: c.pillowZ0,
          vz0: (0.5 * c.pillowG * c.pillowDur * c.pillowDur - c.pillowZ0) / c.pillowDur, zMax: 0, rot: 0, spin: 3, state: 'fall', life: c.pillowLife, _px: x, _py: y };
        const tA = Math.max(0, Math.min(pl.dur, pl.vz0 / c.pillowG)); pl.zMax = pl.z0 + pl.vz0 * tA - 0.5 * c.pillowG * tA * tA;
        pl.t = frac * pl.dur; w._pillowPos(pl); pl._pcx = pl.cx; pl._pcy = pl.cy; pl._pz = pl.z; pl.rot = 0.4;
        w.pillows.push(pl); return pl;
      }
    };
  });
}
async function clipL(p, x, y, w, h) {
  const r = await p.evaluate(() => QA.rect());
  const k = r.width / r.VW;
  x = Math.max(0, Math.min(r.VW - w, x)); y = Math.max(0, Math.min(r.VH - h, y));
  return { x: r.left + x * k, y: r.top + y * k, width: w * k, height: h * k };
}
// freeze in a given level (bot off, speed 0, banner done, no boss)
async function freeze(p, level) {
  await p.evaluate(l => { DJ.debug.setBot(false); DJ.debug.setSpeed(1); if (l != null) DJ.debug.gotoLevel(l); }, level);
  await sleep(2300);
  await p.evaluate(() => { DJ.debug.setSpeed(0); QA.noBoss(); QA.clearFx(); });
}

async function sheet(b, name, title, imgs, dt, cols = 4) {
  const cp = await b.newPage({ viewport: { width: 1600, height: 400 } });
  await cp.setContent(`<html><body style="margin:0;background:#222;font:600 14px system-ui;color:#fff">
    <div style="padding:8px 12px;font-size:18px">${title} — ${imgs.length} frames${dt ? ', ' + Math.round(dt * 1000) + ' ms game-time apart' : ''}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">
    ${imgs.map((d, i) => `<div style="position:relative"><img style="width:100%;display:block" src="data:image/png;base64,${d.img || d}"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 5px;border-radius:4px">${d.label || ('#' + i + ' +' + Math.round(i * dt * 1000) + 'ms')}</span></div>`).join('')}
    </div></body></html>`);
  await shot(cp, name, { fullPage: true });
  await cp.close();
}
async function burst(b, p, name, { frames = 8, dt = 0.06, region, setup, title }) {
  const imgs = [];
  if (setup) await p.evaluate(setup);
  for (let i = 0; i < frames; i++) {
    if (i) await p.evaluate(t => QA.advance(t), dt);
    await raf(p);
    const reg = typeof region === "string" || typeof region === "function" ? await p.evaluate(region) : region;
    if (!reg || reg.some(v => !isFinite(v))) console.log("   bad region", JSON.stringify(reg), await p.evaluate(() => JSON.stringify(DJ.debug.getState())));
    imgs.push((await p.screenshot({ clip: await clipL(p, ...reg) })).toString('base64'));
  }
  await sheet(b, name, title || name, imgs, dt);
}

// ---------------------------------------------------------------- sections
async function screens(b) {
  for (const vp of Object.keys(VIEWPORTS)) {
    console.log('screens @' + vp);
    let { ctx, p } = await open(b, vp);
    await sleep(2500);
    await shot(p, `screen_title_${vp}`);
    for (const [id, nm] of [['scrHow', 'how'], ['scrSettings', 'settings'], ['scrCustom', 'custom']]) {
      await p.evaluate(i => DJ.UI.open(i, 'scrTitle'), id); await sleep(700);
      await shot(p, `screen_${nm}_${vp}`);
      if (nm === 'custom') {   // is everything reachable? (scroll height vs client height)
        const ov = await p.evaluate(() => { const e = document.querySelector('#scrCustom .panel'); return { sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }; });
        console.log('   custom panel overflow', JSON.stringify(ov));
      }
    }
    await ctx.close();
    ({ ctx, p } = await open(b, vp, '&autostart=1&bot=1'));
    await sleep(900); await shot(p, `play_banner_${vp}`);
    await sleep(5000); await shot(p, `play_meadow_${vp}`);
    await p.evaluate(() => DJ.Game.pause()); await sleep(600);
    await shot(p, `screen_pause_${vp}`);
    await p.evaluate(() => DJ.Game.resume()); await sleep(800);
    await p.evaluate(() => { const w = DJ.debug.world; w.score = 1234; w.level = 2; DJ.Game.run.notes = 31; DJ.Game.run.longest = 14; w._die(); });
    await sleep(2400);
    await shot(p, `screen_over_${vp}`);
    await ctx.close();
  }
}

async function play(b) {
  // each biome with a long trail: bot plays ~20 s real at speed 3, song never ends
  for (const vp of ['1280', 'iphoneP', 'iphoneL', 'ipad']) {
    for (let lv = 0; lv < 4; lv++) {
      const { ctx, p } = await open(b, vp, `&autostart=1&bot=1&speed=3&level=${lv}`);
      await p.evaluate(() => { QA.keepAlive(); });
      await sleep(lv === 0 || vp === '1280' ? 20000 : 12000);
      const st = await p.evaluate(() => DJ.debug.getState());
      console.log(`   ${vp} lv${lv} trail=${st.trail} state=${st.state} boss=${st.boss}`);
      await p.evaluate(() => DJ.debug.setSpeed(0)); await raf(p);
      await shot(p, `biome${lv}_long_${vp}`);
      await ctx.close();
    }
  }
  // debug overlay once
  const { ctx, p } = await open(b, '1280', '&autostart=1&bot=1&speed=3&debug=1');
  await p.evaluate(() => QA.keepAlive()); await sleep(8000); await shot(p, 'biome0_debug_1280'); await ctx.close();
}

async function events(b) {
  for (const vp of ['1280', 'iphoneP']) {
    const { ctx, p } = await open(b, vp, '&autostart=1');
    // banners for every biome (frozen at 0.6 s)
    for (let lv = 0; lv < 4; lv++) {
      await p.evaluate(l => { DJ.debug.setBot(false); DJ.debug.setSpeed(0); DJ.debug.gotoLevel(l); QA.advance(0.6); }, lv); await raf(p);
      await shot(p, `banner${lv}_${vp}`);
    }
    await p.evaluate(() => { DJ.debug.gotoLevel(4); QA.advance(0.6); }); await raf(p); await shot(p, `banner_lap2_${vp}`);
    // crossfades
    for (const [f, t] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
      await p.evaluate(f => { DJ.debug.gotoLevel(f); QA.advance(2.5); QA.clearFx(); }, f);
      await p.evaluate(t => { DJ.debug.gotoLevel(t); QA.advance(0.5); }, t); await raf(p);
      await shot(p, `crossfade_${f}to${t}_${vp}`);
    }
    // Mumbles visit with the bot (long trail), shots through the visit
    await p.evaluate(() => { DJ.debug.gotoLevel(0); DJ.debug.setBot(true, 1); QA.longSong(); QA.advance(25); QA.longSong(); DJ.debug.world.hearts = 3; QA.clearFx(); DJ.debug.bossNow(); });
    for (const t of [0.6, 1.0, 1.4, 0.5, 0.5, 0.6, 1.2]) {
      await p.evaluate(t => QA.advance(t), t); await raf(p);
      const st = await p.evaluate(() => DJ.debug.getState());
      await shot(p, `boss_${vp}_${st.boss}_${st.pillows}p_${Math.round(st.time * 10)}`);
    }
    // warning icon before a visit
    await p.evaluate(() => { const w = DJ.debug.world; w.boss.state = 'away'; w.boss.next = 2; w.pillows.length = 0; QA.advance(0.05); });
    await raf(p); await shot(p, `boss_warning_${vp}`);
    // song complete + cleared
    await p.evaluate(() => { const w = DJ.debug.world; DJ.debug.setBot(true, 1); w.songTarget = w.trail.length + 1; QA.advance(6); });
    let st = await p.evaluate(() => DJ.debug.getState());
    if (st.state !== 'cleared') { await p.evaluate(() => { const w = DJ.debug.world; w._clear(); }); }
    await p.evaluate(() => QA.advance(0.35)); await raf(p); await shot(p, `songdone_${vp}`);
    await p.evaluate(() => QA.advance(0.8)); await raf(p); await shot(p, `cleared_${vp}`);
    // loose notes blinking
    await p.evaluate(() => { DJ.debug.setBot(false); DJ.debug.gotoLevel(1); QA.advance(2); });
    await p.evaluate(() => { DJ.debug.setBot(true, 1); QA.longSong(); QA.advance(20); DJ.debug.setBot(false); const w = DJ.debug.world; const n = w.trail.length; if (n > 6) w._bonk(Math.floor(n / 2)); });
    await p.evaluate(() => QA.advance(0.45)); await raf(p); await shot(p, `bonk_${vp}`);
    await p.evaluate(() => QA.advance(2.6)); await raf(p); await shot(p, `loose_blink_a_${vp}`);
    await p.evaluate(() => QA.advance(0.065)); await raf(p); await shot(p, `loose_blink_b_${vp}`);
    // game over flash
    await p.evaluate(() => { const w = DJ.debug.world; w.hearts = 0; w._die(); QA.advance(0.3); }); await raf(p); await shot(p, `dead_${vp}`);
    await ctx.close();
  }
}

async function bursts(b) {
  const { ctx, p } = await open(b, '1280', '&autostart=1');
  await freeze(p, 0);
  const sp = () => { const s = DJ.debug.world.spike; return [s.x - 130, s.y - 150, 260, 220]; };
  // build a medium trail for context
  await p.evaluate(() => { DJ.debug.setBot(true, 1); QA.longSong(); QA.advance(12); DJ.debug.setBot(false); QA.noBoss(); DJ.debug.world.notes.length = 0; QA.clearFx(); DJ.debug.world.setDir(1, 0); QA.advance(0.4); });
  await burst(b, p, 'burst_kickflip', { title: 'Kickflip (board spin, hop, shadow, land puffs)', dt: 0.06, frames: 12, region: sp,
    setup: `(()=>{const w=DJ.debug.world; w.notes.length=0; w.spike.flip=1; w.action();})()` });
  await p.evaluate(() => QA.advance(1));
  // note pickup: place a note right ahead of Spike
  await burst(b, p, 'burst_pickup', { title: 'Note pickup (sparks, ring, +points, join pop)', dt: 0.06, frames: 8,
    region: `(()=>{const s=DJ.debug.world.spike; return [s.x-100, s.y-160, 300, 220];})()`,
    setup: `(()=>{const w=DJ.debug.world,s=w.spike; w.notes.length=0; QA.note(s.x+Math.cos(s.heading)*40, s.y+Math.sin(s.heading)*40, 1, false);})()` });
  // trail joining, wider region, more frames
  await p.evaluate(() => QA.advance(0.4));
  await burst(b, p, 'burst_join', { title: 'Trail joining (new note hops to the end of the train)', dt: 0.06, frames: 12,
    region: `(()=>{const s=DJ.debug.world.spike; return [s.x-260, s.y-160, 420, 300];})()`,
    setup: `(()=>{const w=DJ.debug.world,s=w.spike; w.notes.length=0; QA.note(s.x+Math.cos(s.heading)*30, s.y+Math.sin(s.heading)*30, 3, true);})()` });
  // edge bounce: right edge
  await p.evaluate(() => { const w = DJ.debug.world, A = w.arena; QA.place(A.x1 - 70, (A.y0 + A.y1) / 2, 0.3); w.setDir(1, 0.3); QA.advance(0.05); QA.clearFx(); });
  await burst(b, p, 'burst_bounce', { title: 'Edge bounce (right bush)', dt: 0.06, frames: 8,
    region: `(()=>{const w=DJ.debug.world,A=w.arena; return [A.x1-260, (A.y0+A.y1)/2-140, 300, 260];})()` });
  // bonk
  await p.evaluate(() => { const w = DJ.debug.world; w.setDir(-1, 0); QA.advance(1.2); QA.clearFx(); });
  await burst(b, p, 'burst_bonk', { title: 'Bonk (trail cut, notes scatter, Boing!, shake, red flash)', dt: 0.06, frames: 8,
    region: `(()=>{const s=DJ.debug.world.spike; return [s.x-220, s.y-200, 440, 340];})()`,
    setup: `(()=>{const w=DJ.debug.world; const n=w.trail.length; w._bonk(Math.max(w.cfg.safeNeck, Math.floor(n/2)));})()` });
  await p.evaluate(() => QA.advance(2));
  // pillow fall + land on Spike (grounded)
  await p.evaluate(() => { const w = DJ.debug.world, A = w.arena; QA.place((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2 + 40, 0); w.spike.invuln = 0; w.spike.speed = 1; w.cfg.speed0 = 0.01; QA.clearFx(); });
  await burst(b, p, 'burst_pillow', { title: 'Pillow fall + land on Spike (shadow grows, Poof!, dizzy)', dt: 0.12, frames: 12,
    region: `(()=>{const s=DJ.debug.world.spike; return [s.x-200, s.y-260, 400, 340];})()`,
    setup: `(()=>{const w=DJ.debug.world,s=w.spike; QA.pillow(s.x, s.y, 0.0);})()` });
  await p.evaluate(() => QA.advance(1.5));
  await burst(b, p, 'burst_pillow_settle', { title: 'Landed pillow sits, then puffs into feathers', dt: 0.1, frames: 8,
    region: `(()=>{const s=DJ.debug.world.spike; return [s.x-200, s.y-200, 400, 300];})()` });
  await ctx.close();
}

async function lineup(b) {
  const { ctx, p } = await open(b, '1280', '&autostart=1');
  await p.evaluate(() => {
    const s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><filter id="deut"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter><filter id="prot"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter><filter id="trit"><feColorMatrix type="matrix" values="1.256 -0.077 -0.179 0 0  -0.078 0.931 0.148 0 0  0.005 0.691 0.304 0 0  0 0 0 1 0"/></filter></svg>';
    document.body.insertAdjacentHTML('beforeend', s);
  });
  const rows = [];
  for (let lv = 0; lv < 4; lv++) {
    await freeze(p, lv);
    await p.evaluate(() => {
      const w = DJ.debug.world, A = w.arena, cy = (A.y0 + A.y1) / 2;
      w.notes.length = 0; w.trail.length = 0; w.pillows.length = 0;
      const x0 = (A.x0 + A.x1) / 2 - 250;
      for (let k = 0; k < 4; k++) QA.note(x0 + k * 60, cy, k, false);
      QA.note(x0 + 240, cy, 0, true);
      QA.place(x0 + 330, cy + 10, 0);
      QA.pillow(x0 + 420, cy, 0.25); QA.pillow(x0 + 500, cy, 0.85);
      QA.advance(1 / 60);
    });
    for (const f of ['none', 'grayscale(1)', 'url(#deut)', 'url(#prot)', 'url(#trit)']) {
      await p.evaluate(f => { document.getElementById('game').style.filter = f; }, f); await raf(p);
      const reg = await p.evaluate(() => { const A = DJ.debug.world.arena; return [(A.x0 + A.x1) / 2 - 290, (A.y0 + A.y1) / 2 - 90, 580, 150]; });
      rows.push({ label: `biome ${lv} · ${f}`, img: (await p.screenshot({ clip: await clipL(p, ...reg) })).toString('base64') });
    }
    await p.evaluate(() => { document.getElementById('game').style.filter = ''; });
    // HUD crop with some state
    await p.evaluate(() => { const w = DJ.debug.world; w.hearts = 2; w.song = 6; w.score = 4820; w.spike.flip = 0.55; QA.advance(1 / 60); });
    await raf(p);
    await shot(p, `hud_biome${lv}_1280`, { clip: await clipL(p, 0, 0, 1280, 110) });
  }
  await sheet(b, 'lineup_colorblind', 'Notes (pink, blue, mint, orange, gold) · Spike · pillow shadows (early / late) per biome & filter', rows, 0, 2);
  await ctx.close();
  // phone HUD crops
  for (const vp of ['iphoneP', 'iphoneL']) {
    const { ctx, p } = await open(b, vp, '&autostart=1');
    for (let lv = 0; lv < 4; lv += 3) {
      await freeze(p, lv);
      await p.evaluate(() => { const w = DJ.debug.world; w.hearts = 2; w.song = 6; w.score = 14820; w.boss.next = 2; QA.advance(1 / 60); });
      await raf(p);
      const L = await p.evaluate(() => QA.L());
      await shot(p, `hud_biome${lv}_${vp}`, { clip: await clipL(p, 0, 0, L.VW, 130) });
    }
    await ctx.close();
  }
}

async function makeFixtures(p) {
  const data = await p.evaluate(() => {
    const out = {};
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
    let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    { // photo-like park landscape (opaque JPEG): background
      const [c, g] = mk(1600, 1000);
      let gr = g.createLinearGradient(0, 0, 0, 500); gr.addColorStop(0, '#5f9fe0'); gr.addColorStop(1, '#e8f2ff'); g.fillStyle = gr; g.fillRect(0, 0, 1600, 1000);
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(rnd() * 1600, 80 + rnd() * 300, 80 + rnd() * 160, 30 + rnd() * 40, 0, 0, 7); g.fill(); }
      gr = g.createLinearGradient(0, 480, 0, 1000); gr.addColorStop(0, '#7fbf4a'); gr.addColorStop(1, '#2f5a1c'); g.fillStyle = gr; g.fillRect(0, 480, 1600, 520);
      for (let i = 0; i < 30; i++) { g.fillStyle = ['#ff7fb0', '#ffd23f', '#ffffff', '#5ec2ff'][i % 4]; g.beginPath(); g.arc(rnd() * 1600, 520 + rnd() * 460, 6 + rnd() * 10, 0, 7); g.fill(); }  // flowers in note colours (camouflage)
      g.fillStyle = '#8a5a2a'; g.fillRect(1100, 300, 40, 260); g.fillStyle = '#3d7a2a'; g.beginPath(); g.arc(1120, 280, 130, 0, 7); g.fill();
      const id = g.getImageData(0, 0, 1600, 1000), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * 30; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      g.putImageData(id, 0, 0);
      out.photo_bg = c.toDataURL('image/jpeg', 0.85);
    }
    { // opaque photo portrait of a pet (JPEG)
      const [c, g] = mk(600, 800);
      g.fillStyle = '#7a8c5a'; g.fillRect(0, 0, 600, 800);
      g.fillStyle = '#c98a4a'; g.beginPath(); g.ellipse(300, 420, 210, 240, 0, 0, 7); g.fill();
      g.fillStyle = '#9a6030'; g.beginPath(); g.ellipse(140, 230, 70, 120, -0.4, 0, 7); g.ellipse(460, 230, 70, 120, 0.4, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(230, 380, 26, 0, 7); g.arc(370, 380, 26, 0, 7); g.fill();
      g.fillStyle = '#3a2416'; g.beginPath(); g.ellipse(300, 480, 40, 28, 0, 0, 7); g.fill();
      out.photo_pet = c.toDataURL('image/jpeg', 0.88);
    }
    { // transparent PNG drawing (hero)
      const [c, g] = mk(512, 512);
      g.lineWidth = 10; g.strokeStyle = '#2a2a6a'; g.fillStyle = '#ff7ab6';
      g.beginPath(); g.arc(256, 280, 170, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(120, 170); g.lineTo(150, 40); g.lineTo(220, 120); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(392, 170); g.lineTo(362, 40); g.lineTo(292, 120); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(200, 260, 34, 0, 7); g.arc(312, 260, 34, 0, 7); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(205, 265, 15, 0, 7); g.arc(317, 265, 15, 0, 7); g.fill();
      g.strokeStyle = '#2a2a6a'; g.beginPath(); g.arc(256, 330, 50, 0.2, Math.PI - 0.2); g.stroke();
      out.draw_png = c.toDataURL('image/png');
    }
    { // transparent PNG star (pillow / note) — low-contrast green on purpose
      const [c, g] = mk(300, 300);
      g.fillStyle = '#6aa04a'; g.strokeStyle = '#3a5a2a'; g.lineWidth = 10; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 60 : 140; g.lineTo(150 + Math.cos(a) * r, 150 + Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
      out.star_png = c.toDataURL('image/png');
    }
    return out;
  });
  const files = {};
  for (const [k, v] of Object.entries(data)) {
    const f = path.join(FIX, k + (v.startsWith('data:image/png') ? '.png' : '.jpg'));
    fs.writeFileSync(f, Buffer.from(v.split(',')[1], 'base64')); files[k] = f;
  }
  return files;
}

async function custom(b) {
  for (const vp of ['1280', 'iphoneP']) {
    for (const pass of ['A', 'B']) {
      const { ctx, p } = await open(b, vp);
      const F = await makeFixtures(p);
      const sets = pass === 'A'
        ? [['hero', F.draw_png], ['note', F.photo_pet], ['pillow', F.star_png], ['bg_meadow', F.photo_bg], ['bg_swamp', F.photo_pet]]
        : [['hero', F.photo_pet], ['note', F.star_png], ['pillow', F.photo_pet]];
      await p.evaluate(() => DJ.UI.open('scrCustom', 'scrTitle')); await sleep(500);
      for (const [slot, file] of sets) {
        await p.evaluate(s => { DJ.UI._pickSlot = s; }, slot);
        await p.setInputFiles('#filePick', file);
        await p.waitForFunction(() => /saved|Could not|use/i.test(document.getElementById('toast').textContent) && !/Saving/.test(document.getElementById('toast').textContent), null, { timeout: 10000 }).catch(() => console.log('   no toast for ' + slot));
        console.log('   ' + slot + ': ' + await p.evaluate(() => document.getElementById('toast').textContent));
      }
      if (pass === 'B') { // round shape for hero
        await p.evaluate(() => { DJ.Assets.setShape && DJ.Assets.setShape('note', 'circle'); DJ.UI.renderSlots(); }); await sleep(400);
      }
      await sleep(600); await shot(p, `custom_screen_${pass}_${vp}`);
      await p.evaluate(() => DJ.UI.back()); await sleep(1500); await shot(p, `custom_title_${pass}_${vp}`);
      await p.evaluate(() => DJ.debug.startGame()); await sleep(300);
      await p.evaluate(() => { DJ.debug.setBot(true, 1); QA.keepAlive(); DJ.debug.setSpeed(3); });
      await sleep(9000);
      await p.evaluate(() => { DJ.debug.bossNow(); }); await sleep(2600);
      await p.evaluate(() => DJ.debug.setSpeed(0)); await raf(p);
      await shot(p, `custom_play_${pass}_${vp}`);
      if (pass === 'A') {
        await p.evaluate(() => { DJ.debug.setSpeed(1); DJ.debug.gotoLevel(1); }); await sleep(1100);
        await shot(p, `custom_play_swamp_${pass}_${vp}`);
      }
      await ctx.close();
    }
  }
}

(async () => {
  const want = process.argv.slice(2);
  const run = n => !want.length || want.includes(n);
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  try {
    if (run('screens')) await screens(b);
    if (run('play')) await play(b);
    if (run('events')) await events(b);
    if (run('bursts')) await bursts(b);
    if (run('lineup')) await lineup(b);
    if (run('custom')) await custom(b);
  } catch (e) { console.error('CAPTURE FAILED', e); errs.push(String(e)); }
  await b.close();
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
})();
