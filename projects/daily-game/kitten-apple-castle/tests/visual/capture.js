// Visual QA capture for Ziggy's Apple Castle. Serves game/ over http (python3 -m http.server, free port) and
// screenshots: every screen at 3 viewports, every time of day early/late (with and without lanterns) + colour-blind
// simulations, Granny Boo's goal show and the level transition, motion contact sheets, custom pictures.
// Output: tests/out/visual/*.png (gitignored).   Run: node tests/visual/capture.js [only=screens,zones,goal,motion,custom]
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), net = require('net'), { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '../../game');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv.find(a => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
const want = n => !only.length || only.includes(n);
const VIEWS = {
  land: { viewport: { width: 960, height: 540 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  ipad: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};
const ZONES = ['dawn', 'noon', 'sunset', 'night'];
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
let BASE;

// Colour-vision simulation matrices (Machado et al. 2009, severity 1.0)
const CVD = {
  deutan: '0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0',
  protan: '0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0'
};

async function open(b, view, q) {
  const ctx = await b.newContext(VIEWS[view]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(view + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(view + ': ' + m.text()); });
  await p.goto(BASE + '/index.html?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.AC && AC.debug && AC.Game && AC.Game.mode !== 'boot', null, { timeout: 20000 });
  await p.evaluate(cvd => {
    window._ev = [];
    const R = AC.Game.renderer, o = R.onEvents.bind(R);
    R.onEvents = evts => { for (const e of evts) window._ev.push({ type: e.type, t: performance.now() }); return o(evts); };
    document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="deutan"><feColorMatrix type="matrix" values="' + cvd.deutan +
      '"/></filter><filter id="protan"><feColorMatrix type="matrix" values="' + cvd.protan + '"/></filter></svg>');
    window.VQ = {
      dropWhen(src, timeout) {
        const pred = new Function('p', 'w', 'return (' + src + ')');
        return new Promise(res => {
          const t0 = performance.now();
          const tick = () => {
            const w = AC.debug.world, p = w.phase === 'swing' && w.held && w.predictLanding();
            if (p && pred(p, w)) { AC.debug.drop(); return res(true); }
            if (performance.now() - t0 > (timeout || 9000)) return res(false);
            requestAnimationFrame(tick);
          };
          tick();
        });
      },
      // a tower of n crates at the current zone, light eased to where it would be, frozen
      tower(n, lanterns, jitter) {
        const w = AC.debug.world, dx = []; for (let i = 0; i < n; i++) dx.push(jitter ? ((i * 37) % 11 - 5) * 0.03 : 0);
        w.setTower(dx, { lanterns: !!lanterns });
        for (let i = 0; i < 40; i++) w._lightStep(1);
        w.hearts = w.maxHearts;
      }
    };
  }, CVD);
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: OUT + '/' + name + '.png', clip });
const cvdShot = async (p, name, f) => {
  await p.evaluate(f => { document.getElementById('game').style.filter = 'url(#' + f + ')'; }, f); await sleep(80);
  await shot(p, name + '_' + f);
  await p.evaluate(() => { document.getElementById('game').style.filter = ''; });
};
const freeze = p => p.evaluate(() => AC.debug.setSpeed(0.0001));
const run = p => p.evaluate(() => AC.debug.setSpeed(1));

async function sheet(p, name, n, gap, clip, cols) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = await p.evaluate(() => AC.debug.world.time.toFixed(2));
    frames.push({ t, b64: (await p.screenshot(clip ? { clip } : {})).toString('base64') });
    if (gap) await sleep(gap);
  }
  const vp = p.viewportSize(), cl = clip || { width: vp.width, height: vp.height };
  const c = cols || Math.min(6, n), sc = Math.min(1, 1800 / (c * cl.width)), w = Math.round(cl.width * sc);
  const html = '<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(' + c + ',' + w + 'px);gap:4px">' +
    frames.map(f => '<div style="position:relative"><img style="width:' + w + 'px;display:block" src="data:image/png;base64,' + f.b64 +
      '"><span style="position:absolute;left:4px;top:2px;color:#0f0;font:12px monospace;background:#000a">t=' + f.t + '</span></div>').join('') + '</body>';
  const q = await p.context().browser().newPage({ viewport: { width: Math.round(c * (w + 4)), height: 200 } });
  await q.setContent(html); await q.waitForTimeout(150);
  await q.screenshot({ path: OUT + '/sheet_' + name + '.png', fullPage: true }); await q.close();
}
// clip around the tower top (CSS px)
async function clipTop(p, wu, hu) {
  return p.evaluate(([wu, hu]) => {
    const w = AC.debug.world, c = document.getElementById('game').getBoundingClientRect(), k = c.width / AC.Game.renderer.VW, L = w.layout;
    const x = c.left + (L.cx - L.unit * wu / 2) * k, y = c.top + (w.tower.topY - w.cam.y - L.unit * hu * 0.62) * k;
    const X = Math.max(0, Math.round(x)), Y = Math.max(0, Math.round(y));
    return { x: X, y: Y, width: Math.round(Math.min(innerWidth - X, L.unit * wu * k)), height: Math.round(Math.min(innerHeight - Y, L.unit * hu * k)) };
  }, [wu || 6, hu || 5]);
}

async function makePictures(p) {
  const imgs = await p.evaluate(() => {
    const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c.toDataURL('image/png'); };
    return {
      hero: mk(400, 400, (g, w, h) => { g.fillStyle = '#5a8f3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c98a4b'; g.beginPath(); g.arc(200, 210, 140, 0, 7); g.fill();
        g.fillStyle = '#222'; g.beginPath(); g.arc(150, 180, 18, 0, 7); g.arc(250, 180, 18, 0, 7); g.fill(); g.fillStyle = '#e66'; g.beginPath(); g.arc(200, 260, 30, 0, 3.14); g.fill(); }),
      crate: mk(600, 400, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2b6cb0'); gr.addColorStop(1, '#f6ad55'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; g.font = 'bold 160px sans-serif'; g.fillText('ABC', 80, 260); }),
      apple: mk(200, 200, g => { g.fillStyle = '#e53e3e'; g.beginPath(); g.arc(100, 100, 90, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(100, 100, 40, 0, 7); g.fill(); }),
      bg_night: mk(1600, 900, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#87ceeb'); gr.addColorStop(1, '#f0e68c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2f855a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(150 + i * 260, 820, 160, 0, 7); g.fill(); } })
    };
  });
  const dir = OUT + '/_pics'; fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [k, v] of Object.entries(imgs)) { files[k] = dir + '/' + k + '.png'; fs.writeFileSync(files[k], Buffer.from(v.split(',')[1], 'base64')); }
  return files;
}

(async () => {
  const port = await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  BASE = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 50; i++) { try { await new Promise((ok, no) => { const s = net.connect(port, '127.0.0.1', () => { s.end(); ok(); }); s.on('error', no); }); break; } catch (e) { await sleep(100); } }
  const b = await chromium.launch();
  try {
    // ---------- 1. every screen at every viewport ----------
    if (want('screens')) for (const v of Object.keys(VIEWS)) {
      const p = await open(b, v);
      await sleep(2500); await shot(p, v + '_title');
      for (const [btn, name] of [['btnHow', 'how'], ['btnSettings', 'settings'], ['btnCustomize', 'custom']]) {
        await p.click('#' + btn); await sleep(450); await shot(p, v + '_' + name);
        await p.evaluate(() => { const s = document.querySelector('.screen:not(.hidden)'); if (s) s.scrollTop = 1e5; const pn = document.querySelector('.screen:not(.hidden) .panel'); if (pn) pn.scrollTop = 1e5; });
        await sleep(200); await shot(p, v + '_' + name + '_bottom');
        await p.click('.screen:not(.hidden) .btn-back'); await sleep(350);
      }
      await p.click('#btnPlay'); await sleep(800); await shot(p, v + '_banner');
      await sleep(2000); await shot(p, v + '_play_start');
      await p.evaluate(() => { AC.debug.setBot(true, 0.9); AC.debug.setSpeed(3); });
      await p.waitForFunction(() => AC.debug.world.placed >= 6, null, { timeout: 40000 }).catch(() => errs.push(v + ' slow'));
      await run(p); await sleep(300); await shot(p, v + '_play');
      await p.click('#btnPause'); await sleep(450); await shot(p, v + '_pause');
      await p.click('#btnResume'); await sleep(200);
      await p.evaluate(() => { AC.debug.setBot(true, 0); AC.debug.setSpeed(8); });
      await p.waitForFunction(() => AC.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push(v + ' no over'));
      await run(p); await sleep(1300); await shot(p, v + '_over');
      await p.context().close();
    }

    // ---------- 2. every zone early / late, with and without lanterns, + colour-blind ----------
    if (want('zones')) for (const v of Object.keys(VIEWS)) for (const diff of (v === 'land' ? ['normal', 'easy'] : ['normal'])) {
      const p = await open(b, v, '&autostart=1&diff=' + diff);
      const tag = v + (diff === 'easy' ? '_easy' : '');
      for (let z = 0; z < 4; z++) {
        await p.evaluate(z => { AC.debug.gotoLevel(z); }, z); await sleep(2700);   // crossfade + banner gone
        const goal = await p.evaluate(() => AC.debug.world.goal);
        for (const [nm, n, lan] of [['early', 2, false], ['late', goal - 1, false], ['late_lanterns', goal - 1, true]]) {
          if (diff === 'easy' && nm !== 'late') continue;
          await run(p); await p.evaluate(([n, lan]) => VQ.tower(n, lan, !lan), [n, lan]); await sleep(500);
          await freeze(p); await sleep(120);
          const L = await p.evaluate(() => AC.debug.world.light.toFixed(2));
          await shot(p, tag + '_zone_' + ZONES[z] + '_' + nm);
          console.log(tag, ZONES[z], nm, 'light', L);
          if (v === 'land' && diff === 'normal' && z >= 2 && nm !== 'early') { await cvdShot(p, tag + '_zone_' + ZONES[z] + '_' + nm, 'deutan'); await cvdShot(p, tag + '_zone_' + ZONES[z] + '_' + nm, 'protan'); }
        }
        await run(p);
      }
      await p.context().close();
    }

    // ---------- 3. goal show + level transition ----------
    if (want('goal')) for (const v of ['land', 'phone']) {
      for (const z of [0, 3]) {
        const p = await open(b, v, '&autostart=1&diff=easy&level=' + z);
        await sleep(2600);
        await p.evaluate(() => { const w = AC.debug.world; VQ.tower(w.goal - 2, true); AC.debug.setBot(true, 1); });
        await p.waitForFunction(() => AC.debug.world.phase === 'goal', null, { timeout: 30000 }).catch(() => errs.push(v + ' no goal'));
        await p.evaluate(() => AC.debug.setBot(false));
        await sheet(p, v + '_goal_' + ZONES[z], 12, 260, null, 4);
        await p.waitForFunction(() => { const g = AC.debug.world.ghost; return g && g.wave; }, null, { timeout: 8000 }).catch(() => {});
        await shot(p, v + '_goal_wave_' + ZONES[z]);
        await p.waitForFunction(() => AC.debug.world.phase === 'travel', null, { timeout: 15000 }).catch(() => errs.push(v + ' no travel'));
        await sheet(p, v + '_travel_' + ZONES[z], 12, 140, null, 4);
        await p.waitForFunction(() => AC.debug.world.phase === 'swing', null, { timeout: 15000 }).catch(() => {});
        await sleep(300); await shot(p, v + '_next_banner_' + ZONES[z]);
        await p.context().close();
      }
    }

    // ---------- 4. motion bursts ----------
    if (want('motion')) for (const z of [0, 3]) {
      const p = await open(b, 'land', '&autostart=1&diff=normal&level=' + z);
      const Z = ZONES[z];
      await sleep(2700);
      await p.evaluate(() => VQ.tower(3, false)); await sleep(300);
      // drop + perfect + lantern pop
      await p.evaluate(() => AC.debug.setSpeed(0.35));
      let clip = await clipTop(p, 6, 6);
      await p.evaluate(() => VQ.dropWhen('p.perfect && Math.abs(p.dx)<2'));
      await sheet(p, Z + '_perfect', 18, 35, clip, 6);
      await run(p); await sleep(1400);
      await p.evaluate(() => AC.debug.setSpeed(0.35)); clip = await clipTop(p, 6, 5);
      await p.evaluate(() => VQ.dropWhen('p.ok && !p.perfect && Math.abs(p.dx) > w.held.w*0.33'));
      await sheet(p, Z + '_edge', 18, 60, clip, 6);
      await run(p); await sleep(1500);
      await p.evaluate(() => AC.debug.setSpeed(0.35)); clip = await clipTop(p, 7, 7);
      await p.evaluate(() => VQ.dropWhen('!p.ok && Math.abs(p.dx) < w.held.w*0.75'));
      await sheet(p, Z + '_miss', 18, 60, clip, 6);
      await run(p); await sleep(2500);
      let toppled = false;
      for (let i = 0; i < 9 && !toppled; i++) {
        if (await p.evaluate(() => AC.debug.mode === 'over')) break;
        await p.evaluate(() => { window._ev = []; AC.debug.world.hearts = AC.debug.world.maxHearts; AC.debug.setSpeed(0.35); });
        await p.evaluate(() => VQ.dropWhen('p.ok && p.dx > w.held.w*0.4'));
        await sheet(p, Z + '_topple', 18, 70, { x: 180, y: 0, width: 600, height: 540 }, 6);
        await run(p);
        toppled = await p.evaluate(() => window._ev.some(e => e.type === 'topple'));
        await sleep(1500);
      }
      if (!toppled) errs.push(Z + ': could not provoke a topple');
      // apple collect (+ pie toast: 4 apples already in the pie)
      let got = false;
      await p.evaluate(() => VQ.tower(3, z => 0));
      for (let i = 0; i < 14 && !got; i++) {
        const has = await p.evaluate(() => AC.debug.world.appleList.some(c => c.state === 'float'));
        if (has) {
          await p.evaluate(() => { window._ev = []; AC.debug.world.pieApples = 4; AC.debug.world.hearts = 1; AC.debug.setSpeed(0.4); });
          const ok = await p.evaluate(() => VQ.dropWhen('p.ok && w.appleList.some(c => c.state==="float" && Math.abs(c.x - p.x) < c.r*0.6 && c.y < w.tower.topY)', 6000));
          if (ok) {
            await sheet(p, Z + '_apple_pie', 24, 45, null, 6);
            got = await p.evaluate(() => window._ev.some(e => e.type === 'apple'));
          }
          await run(p); await sleep(1200);
        } else { await p.evaluate(() => VQ.dropWhen('p.perfect')); await sleep(1300); }
      }
      if (!got) errs.push(Z + ': no apple captured');
      await p.context().close();
    }

    // ---------- 5. custom pictures ----------
    if (want('custom')) for (const v of ['land', 'phone']) {
      const p = await open(b, v);
      const files = await makePictures(p);
      await p.click('#btnCustomize'); await sleep(300);
      const ids = await p.evaluate(() => AC.Assets.SLOTS.map(s => s.id));
      for (const id of ['hero', 'crate', 'apple', 'bg_night']) {
        const i = ids.indexOf(id);
        const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#slotGrid .slot').nth(i).locator('[data-act=pick]').click()]);
        await chooser.setFiles(files[id]); await sleep(700);
      }
      await shot(p, v + '_custom_filled');
      await p.click('#scrCustom .btn-back'); await sleep(300);
      await p.click('#btnPlay'); await sleep(2600);
      for (const z of [0, 3]) {
        await p.evaluate(z => AC.debug.gotoLevel(z), z); await sleep(2600);
        await p.evaluate(z => VQ.tower(z ? 13 : 5, z === 3, true), z); await sleep(1200);
        await freeze(p); await sleep(100); await shot(p, v + '_custom_play_' + ZONES[z]); await run(p);
      }
      await p.evaluate(() => { for (const s of AC.Assets.SLOTS) AC.Assets.clearCustom && AC.Assets.clearCustom(s.id); });
      await p.context().close();
    }
  } finally {
    console.log(errs.length ? 'NOTES/ERRORS:\n' + errs.join('\n') : 'no console errors');
    await b.close(); srv.kill();
  }
})();
