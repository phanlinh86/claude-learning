// Visual QA capture: every screen at 4 viewports, every planet mid-tower, the goal sequence, motion contact sheets,
// custom pictures, and a deuteranopia simulation of the Easy drop guide. Output: tests/out/visual/*.png (gitignored).
// Run: node tests/visual/capture.js   [only=<name,...>]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv.find(a => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
const want = n => !only.length || only.includes(n);
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 } },
  ipadL: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  ipadP: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(b, view, q) {
  const ctx = await b.newContext(VIEWS[view]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(view + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(view + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.MS && MS.debug && MS.Game && MS.Game.mode !== 'boot', null, { timeout: 15000 });
  await p.evaluate(() => {
    window._ev = [];
    const R = MS.Game.renderer, o = R.onEvents.bind(R);
    R.onEvents = evts => { for (const e of evts) window._ev.push({ type: e.type, t: performance.now() }); return o(evts); };
    // drop the held crate as soon as pred(predictLanding(), world) is true
    window.VQ = {
      dropWhen(src, timeout) {
        const pred = new Function('p', 'w', 'return (' + src + ')');
        return new Promise(res => {
          const t0 = performance.now();
          const tick = () => {
            const w = MS.debug.world, p = w.phase === 'swing' && w.held && w.predictLanding();
            if (p && pred(p, w)) { MS.debug.drop(); return res(true); }
            if (performance.now() - t0 > (timeout || 8000)) return res(false);
            requestAnimationFrame(tick);
          };
          tick();
        });
      }
    };
  });
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: OUT + '/' + name + '.png', clip });
const waitPhase = (p, ph, t) => p.waitForFunction(x => MS.debug.world.phase === x, ph, { timeout: t || 20000 }).catch(() => errs.push('phase ' + ph + ' timeout'));

// burst of frames → one contact sheet
async function sheet(p, name, n, gap, clip, cols) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = await p.evaluate(() => MS.debug.world.time.toFixed(3));
    frames.push({ t, b64: (await p.screenshot({ clip })).toString('base64') });
    if (gap) await sleep(gap);
  }
  const c = cols || Math.min(6, n), w = clip.width, h = clip.height, sc = Math.min(1, 1800 / (c * w));
  const html = '<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(' + c + ',' + Math.round(w * sc) + 'px);gap:4px">' +
    frames.map(f => '<div style="position:relative"><img style="width:' + Math.round(w * sc) + 'px;display:block" src="data:image/png;base64,' + f.b64 +
      '"><span style="position:absolute;left:4px;top:2px;color:#0f0;font:12px monospace;background:#000a">t=' + f.t + '</span></div>').join('') + '</body>';
  const q = await p.context().browser().newPage({ viewport: { width: Math.round(c * (w * sc + 4)), height: 200 } });
  await q.setContent(html); await q.waitForTimeout(100);
  await q.screenshot({ path: OUT + '/sheet_' + name + '.png', fullPage: true }); await q.close();
}

async function clipAt(pg) {
      const r = await pg.evaluate(() => { const w = MS.debug.world, R = MS.Game.renderer, k = 1280 / R.VW; return { x: (w.layout.cx) * k, y: (w.tower.topY - w.cam.y) * k, u: w.layout.unit * k }; });
      const x = Math.max(0, Math.round(r.x - r.u * 3)), y = Math.max(0, Math.round(r.y - r.u * 3.2));
      return { x, y, width: Math.min(1280 - x, Math.round(r.u * 6)), height: Math.min(720 - y, Math.round(r.u * 4.5)) };
}

// generated custom pictures (photo-like opaque + transparent cut-out)
async function makePictures(p) {
  const imgs = await p.evaluate(() => {
    const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c.toDataURL('image/png'); };
    return {
      hero: mk(400, 400, (g, w, h) => { g.fillStyle = '#5a8f3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c98a4b'; g.beginPath(); g.arc(200, 210, 140, 0, 7); g.fill();
        g.fillStyle = '#222'; g.beginPath(); g.arc(150, 180, 18, 0, 7); g.arc(250, 180, 18, 0, 7); g.fill(); g.fillStyle = '#e66'; g.beginPath(); g.arc(200, 260, 30, 0, 3.14); g.fill(); }),
      crate: mk(600, 400, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2b6cb0'); gr.addColorStop(1, '#f6ad55'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; g.font = 'bold 160px sans-serif'; g.fillText('ABC', 80, 260); }),
      coin: mk(200, 200, (g) => { g.fillStyle = '#e53e3e'; g.beginPath(); g.arc(100, 100, 90, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(100, 100, 40, 0, 7); g.fill(); }),
      bg_moon: mk(1600, 900, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#87ceeb'); gr.addColorStop(1, '#f0e68c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2f855a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(150 + i * 260, 820, 160, 0, 7); g.fill(); } })
    };
  });
  const dir = OUT + '/_pics'; fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [k, v] of Object.entries(imgs)) { files[k] = dir + '/' + k + '.png'; fs.writeFileSync(files[k], Buffer.from(v.split(',')[1], 'base64')); }
  return files;
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------- 1. screens at every viewport ----------
  if (want('screens')) for (const v of Object.keys(VIEWS)) {
    const p = await open(b, v);
    await p.waitForTimeout(2500);
    await shot(p, v + '_title');
    for (const [btn, name] of [['btnHow', 'how'], ['btnSettings', 'settings'], ['btnCustomize', 'custom']]) {
      await p.click('#' + btn); await p.waitForTimeout(400); await shot(p, v + '_' + name);
      if (name === 'how' || name === 'custom') { // scrolled bottom too
        await p.evaluate(() => { const s = document.querySelector('.screen:not(.hidden)'); if (s) s.scrollTop = 1e5; const pn = document.querySelector('.screen:not(.hidden) .panel'); if (pn) pn.scrollTop = 1e5; });
        await p.waitForTimeout(200); await shot(p, v + '_' + name + '_bottom');
      }
      await p.click('.screen:not(.hidden) .btn-back'); await p.waitForTimeout(300);
    }
    await p.click('#btnPlay'); await p.waitForTimeout(700); await shot(p, v + '_banner');
    await p.evaluate(() => { MS.debug.setBot(true, 0.9); MS.debug.setSpeed(3); });
    await p.waitForFunction(() => MS.debug.world.placed >= 6, null, { timeout: 30000 }).catch(() => errs.push(v + ' slow'));
    await p.evaluate(() => MS.debug.setSpeed(1)); await p.waitForTimeout(300); await shot(p, v + '_play');
    await p.click('#btnPause'); await p.waitForTimeout(400); await shot(p, v + '_pause');
    await p.click('#btnResume'); await p.waitForTimeout(200);
    await p.evaluate(() => { MS.debug.setBot(true, 0); MS.debug.setSpeed(8); });
    await p.waitForFunction(() => MS.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push(v + ' no over'));
    await p.evaluate(() => MS.debug.setSpeed(1)); await p.waitForTimeout(1200); await shot(p, v + '_over');
    await p.context().close();
  }

  // ---------- 2. every planet mid-tower (desk + phone) + guide on easy ----------
  if (want('planets')) for (const v of ['desk', 'phone', 'ipadL']) {
    const p = await open(b, v, '&autostart=1&bot=1&skill=0.8&diff=easy');
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => { MS.debug.gotoLevel(l); MS.debug.setSpeed(3); }, lv);
      await p.waitForFunction(() => MS.debug.world.placed >= 7, null, { timeout: 40000 }).catch(() => errs.push(v + ' planet ' + lv));
      await p.evaluate(() => MS.debug.setSpeed(1)); await p.waitForTimeout(700);
      await shot(p, v + '_planet' + lv);
    }
    await p.context().close();
  }

  // ---------- 3. goal sequence ----------
  if (want('goal')) {
    const p = await open(b, 'desk', '&autostart=1&bot=1&skill=1&diff=easy');
    await p.evaluate(() => MS.debug.setSpeed(4));
    await p.waitForFunction(() => MS.debug.world.placed >= MS.debug.world.goal - 1, null, { timeout: 60000 });
    await p.evaluate(() => MS.debug.setSpeed(1));
    await waitPhase(p, 'goal');
    await sheet(p, 'goal', 12, 200, { x: 0, y: 0, width: 1280, height: 720 }, 4);
    await sheet(p, 'travel', 12, 120, { x: 0, y: 0, width: 1280, height: 720 }, 4);
    await p.waitForTimeout(300); await shot(p, 'desk_newplanet_banner');
    await p.context().close();
    const q = await open(b, 'phone', '&autostart=1&bot=1&skill=1&diff=easy');
    await q.evaluate(() => MS.debug.setSpeed(4));
    await q.waitForFunction(() => MS.debug.world.placed >= MS.debug.world.goal - 1, null, { timeout: 60000 });
    await q.evaluate(() => MS.debug.setSpeed(1));
    await waitPhase(q, 'goal'); await q.waitForTimeout(1500); await shot(q, 'phone_goal');
    await waitPhase(q, 'swing'); await q.waitForTimeout(300); await shot(q, 'phone_newplanet');
    await q.context().close();
  }

  // ---------- 4. motion contact sheets (manual drops) ----------
  if (want('motion') || want('guide')) {
    if (want('motion')) {
    const p = await open(b, 'desk', '&autostart=1&diff=normal');
    await p.waitForTimeout(2600); // banner gone
    // stack 3 perfect crates first
    for (let i = 0; i < 3; i++) { await p.evaluate(() => VQ.dropWhen('p.perfect && Math.abs(p.dx)<2')); await p.waitForTimeout(1300); }
    await p.evaluate(() => MS.debug.setSpeed(0.35));
    let clip = await clipAt(p);
    await p.evaluate(() => VQ.dropWhen('p.perfect && Math.abs(p.dx)<2'));
    await sheet(p, 'perfect', 12, 40, clip, 6);
    await p.evaluate(() => MS.debug.setSpeed(1)); await p.waitForTimeout(1200);
    await p.evaluate(() => MS.debug.setSpeed(0.35)); clip = await clipAt(p);
    await p.evaluate(() => VQ.dropWhen('p.ok && !p.perfect && Math.abs(p.dx) > w.held.w*0.33'));
    await sheet(p, 'edge_sway', 18, 60, clip, 6);
    await p.evaluate(() => MS.debug.setSpeed(1)); await p.waitForTimeout(1500);
    await p.evaluate(() => MS.debug.setSpeed(0.35)); clip = await clipAt(p); clip.y = Math.max(0, clip.y - 0); clip.height = Math.min(720 - clip.y, clip.height + 200);
    await p.evaluate(() => VQ.dropWhen('!p.ok && Math.abs(p.dx) < w.held.w*0.75'));
    await sheet(p, 'miss', 18, 60, clip, 6);
    await p.evaluate(() => MS.debug.setSpeed(1)); await p.waitForTimeout(2500);
    // topple: keep landing edges on the right; every drop is captured slowly, the one that topples is kept
    let toppled = false;
    for (let i = 0; i < 9 && !toppled; i++) {
      if (await p.evaluate(() => MS.debug.mode === 'over')) break;
      await p.evaluate(() => { window._ev = []; MS.debug.setSpeed(0.35); });
      clip = { x: 240, y: 0, width: 800, height: 720 };
      await p.evaluate(() => VQ.dropWhen('p.ok && p.dx > w.held.w*0.4'));
      await sheet(p, 'topple', 18, 70, clip, 6);
      await p.evaluate(() => MS.debug.setSpeed(1));
      toppled = await p.evaluate(() => window._ev.some(e => e.type === 'topple'));
      await p.waitForTimeout(1500);
    }
    if (!toppled) errs.push('could not provoke a topple');
    await p.context().close();

    }
    // coin collect + grow
    const q = await open(b, 'desk', '&autostart=1&diff=easy');
    await q.waitForTimeout(2600);
    let got = false;
    for (let i = 0; i < 14 && !got && want('motion'); i++) {
      const has = await q.evaluate(() => MS.debug.world.coinList.some(c => c.state === 'float'));
      if (has) {
        await q.evaluate(() => { MS.debug.world.growCoins = 4; MS.debug.setSpeed(0.4); });
        await q.evaluate(() => VQ.dropWhen('p.ok && w.coinList.some(c => c.state==="float" && Math.abs(c.x - p.x) < c.r*0.6 && c.y < w.tower.topY)', 6000));
        await sheet(q, 'coin_grow', 24, 40, { x: 0, y: 0, width: 1280, height: 720 }, 6);
        await q.evaluate(() => MS.debug.setSpeed(1));
        got = await q.evaluate(() => window._ev.some(e => e.type === 'coin'));
      } else {
        await q.evaluate(() => VQ.dropWhen('p.perfect')); await q.waitForTimeout(1300);
      }
    }
    if (!got) errs.push('no coin captured');
    await q.waitForTimeout(800); await shot(q, 'desk_after_grow');
    // Easy drop guide, three colours + deuteranopia
    for (const [name, cond] of [['green', 'p.perfect'], ['white', 'p.ok && !p.perfect && Math.abs(p.dx)>w.held.w*0.3'], ['red', '!p.ok']]) {
      await q.evaluate(() => MS.debug.setSpeed(1));
      // freeze the moment the prediction matches (checked every frame at normal speed)
      const okc = await q.evaluate(c => new Promise(res => {
        const pred = new Function('p', 'w', 'return (' + c + ')'), t0 = performance.now();
        const tick = () => { const w = MS.debug.world, p = w.phase === 'swing' && w.held && w.predictLanding();
          if (p && pred(p, w)) { MS.debug.setSpeed(0.0001); return res(true); }
          if (performance.now() - t0 > 20000) return res(false); requestAnimationFrame(tick); };
        tick(); }), cond);
      if (!okc) errs.push('guide ' + name);
      await q.waitForTimeout(120);
      const r = await clipAt(q);
      const cl = { x: r.x, y: Math.max(0, r.y - 120), width: r.width, height: Math.min(720 - Math.max(0, r.y - 120), r.height + 120) };
      await shot(q, 'guide_' + name, cl);
      await q.evaluate(() => {
        if (!document.getElementById('cvd')) document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="cvd"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>');
        document.getElementById('game').style.filter = 'url(#cvd)';
      });
      await q.waitForTimeout(80); await shot(q, 'guide_' + name + '_deutan', cl);
      await q.evaluate(() => { document.getElementById('game').style.filter = ''; MS.debug.setSpeed(1); });
      await q.waitForTimeout(1600);
    }
    await q.context().close();
  }

  // ---------- 5. custom pictures ----------
  if (want('custom')) for (const v of ['desk', 'phone']) {
    const p = await open(b, v);
    const files = await makePictures(p);
    await p.click('#btnCustomize'); await p.waitForTimeout(300);
    const ids = await p.evaluate(() => MS.Assets.SLOTS.map(s => s.id));
    for (const id of ['hero', 'crate', 'coin', 'bg_moon']) {
      const i = ids.indexOf(id);
      const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#slotGrid .slot').nth(i).locator('[data-act=pick]').click()]);
      await chooser.setFiles(files[id]); await p.waitForTimeout(500);
    }
    await shot(p, v + '_custom_filled');
    await p.click('#scrCustom .btn-back'); await p.waitForTimeout(300);
    await p.click('#btnPlay'); await p.waitForTimeout(400);
    await p.evaluate(() => { MS.debug.setBot(true, 0.85); MS.debug.setSpeed(3); });
    await p.waitForFunction(() => MS.debug.world.placed >= 6, null, { timeout: 40000 }).catch(() => errs.push('custom slow'));
    await p.evaluate(() => MS.debug.setSpeed(1)); await p.waitForTimeout(400);
    await shot(p, v + '_custom_play');
    await p.context().close();
  }

  // ---------- 6. particle sprites close-up per planet ----------
  if (want('particles')) {
    const p = await open(b, 'desk', '&autostart=1&diff=easy');
    for (const lv of [0, 1, 2, 3]) {
      await p.evaluate(l => MS.debug.gotoLevel(l), lv); await p.waitForTimeout(3500);
      await p.evaluate(() => { const w = MS.debug.world, L = w.layout; ['star', 'sparkle', 'puff', 'coinbit', 'dust', 'ice', 'snow', 'petal', 'spark', 'heart'].forEach((s, i) =>
        MS.Game.weather.burst(s, L.cx - 300 + i * 66, L.groundY - L.unit * 2.4, 4, { speed: 30, life: 3, size: 26, gravity: 0, layer: 'front' })); });
      await p.waitForTimeout(250); await shot(p, 'particles_' + lv, { x: 260, y: 200, width: 760, height: 400 });
    }
    await p.context().close();
  }

  console.log(errs.length ? 'NOTES/ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})();
