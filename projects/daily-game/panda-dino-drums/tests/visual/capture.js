// Visual QA capture for Momo's Dino Drums.
// Run: node tests/visual/capture.js [section ...]
//   sections: screens floors trans pip bursts custom cvd measure   (default: all)
// Output: tests/out/visual/*.png (+ contact sheets) and tests/out/visual/metrics.json.
// The game clock is frozen (setSpeed(0)) and advanced by hand (Game.step + Renderer.update), so frames are exact.
// Never runs `playwright install`: uses the chromium already on the machine.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const SIZES = {
  desk: { viewport: { width: 1280, height: 720 } },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phoneP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};
const FLOORS = ['river', 'ferns', 'nests', 'sky'];
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const metrics = {};
const errors = [];
const MF = OUT + '/metrics.json';
if (fs.existsSync(MF)) Object.assign(metrics, JSON.parse(fs.readFileSync(MF, 'utf8')));

let browser, sheetPage;
async function open(size, query) {
  const ctx = await browser.newContext(SIZES[size]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(size + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errors.push(size + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&seed=7' + (query ? '&' + query : ''));
  await p.waitForFunction(() => window.DD && DD.debug && (DD.debug.mode === 'title' || DD.debug.mode === 'playing' || (DD.Game && DD.Game.mode === 'title')), null, { timeout: 20000 });
  await p.waitForTimeout(600);
  return p;
}
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function adv(p, sec) {
  await p.evaluate(sec => {
    const G = DD.Game; let t = 0; const st = 1 / 120;
    while (t < sec - 1e-9) { const h = Math.min(st, sec - t); if (G.mode !== 'paused') { G.step(h); G.renderer.update(h); } t += h; }
  }, sec);
  await raf(p);
}
async function advUntil(p, pred, maxSec = 90) {
  const ok = await p.evaluate(([pred, maxSec]) => {
    const G = DD.Game, f = new Function('w', 'G', 'return (' + pred + ')'); let t = 0; const st = 1 / 120;
    while (t < maxSec) { if (f(G.world, G)) return true; G.step(st); G.renderer.update(st); t += st; }
    return false;
  }, [pred, maxSec]);
  await raf(p);
  if (!ok) console.warn('advUntil timed out:', pred);
  return ok;
}
async function shot(p, name, clip) { const file = OUT + '/' + name + '.png'; await p.screenshot({ path: file, clip: clip || undefined }); return file; }
async function clipOf(p, lx, ly, lw, lh) {
  return p.evaluate(([lx, ly, lw, lh]) => {
    const R = DD.Game.renderer, r = R.canvas.getBoundingClientRect(), k = r.width / R.VW;
    const x = Math.max(0, r.left + lx * k), y = Math.max(0, r.top + ly * k);
    return { x, y, width: Math.min(innerWidth - x, lw * k), height: Math.min(innerHeight - y, lh * k) };
  }, [lx, ly, lw, lh]);
}
const L = p => p.evaluate(() => { const l = DD.Game.renderer.layout; return { VW: l.VW, VH: l.VH, ringX: l.ringX, kitX: l.kitX, coinY: l.coinY, laneY: l.laneY, hudH: l.hudH, s: l.s, gs: l.gs, win: l.win, split: l.split, floorTop: l.floorTop }; });

async function sheet(files, labels, out, cols, cellW) {
  const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const data = await sheetPage.evaluate(async ([imgs, labels, cols, cellW]) => {
    const els = await Promise.all(imgs.map(src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; })));
    const cw = cellW, ch = Math.round(cw * els[0].height / els[0].width), lh = 22;
    const rows = Math.ceil(els.length / cols);
    const c = document.createElement('canvas'); c.width = cols * (cw + 6) + 6; c.height = rows * (ch + lh + 6) + 6;
    const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
    els.forEach((im, i) => {
      const x = 6 + (i % cols) * (cw + 6), y = 6 + Math.floor(i / cols) * (ch + lh + 6);
      g.drawImage(im, x, y, cw, ch);
      g.fillStyle = '#fff'; g.font = '13px monospace'; g.fillText(labels[i] || '', x + 4, y + ch + 16);
    });
    return c.toDataURL('image/png');
  }, [imgs, labels, cols, cellW]);
  fs.writeFileSync(OUT + '/' + out + '.png', Buffer.from(data.split(',')[1], 'base64'));
  files.forEach(f => { if (f.includes('/_f_')) fs.unlinkSync(f); });
}

/* start a fresh, frozen run on floor `level` */
async function startRun(p, opts = {}) {
  await p.evaluate(o => {
    const G = DD.Game; G.speed = 0;
    G.urlDiff = o.diff || 'normal';
    G.startGame();
    if (o.level) { G.world.startLevel(o.level); G._setLevelVisuals(G.world.tod, true); }
    DD.debug.setBot(o.bot !== false, o.skill == null ? 1 : o.skill);
    if (o.bot === false) G.bot = null;
  }, opts);
  await raf(p);
  await p.waitForTimeout(150);   // let the floor background pre-render
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  sheetPage = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  await sheetPage.setContent('<html><body></body></html>');

  // ---------------- every screen at every size ----------------
  if (on('screens')) {
    for (const size of Object.keys(SIZES)) {
      const p = await open(size);
      const files = [], labels = [];
      const add = async (n) => { files.push(await shot(p, 'scr_' + size + '_' + n)); labels.push(n); };
      await p.waitForTimeout(2000); await add('title');
      for (const [btn, n] of [['#btnHow', 'how'], ['#btnSettings', 'settings'], ['#btnCustomize', 'custom']]) {
        await p.click(btn); await p.waitForTimeout(500); await add(n);
        await p.evaluate(() => DD.UI.back()); await p.waitForTimeout(300);
      }
      metrics['panels_' + size] = await p.evaluate(() => {
        const r = {};
        for (const id of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
          const s = document.getElementById(id); const was = s.classList.contains('hidden'); s.classList.remove('hidden');
          const pn = s.querySelector('.panel') || s.querySelector('.title-wrap');
          const b = pn.getBoundingClientRect();
          r[id] = { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), scroll: pn.scrollHeight > pn.clientHeight + 2, vw: innerWidth, vh: innerHeight,
            minBtnH: Math.round(Math.min(...[...s.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.getBoundingClientRect().height).concat([999]))),
            minFont: Math.round(Math.min(...[...s.querySelectorAll('p,span,b,button,h2,h3,label,div,small')].filter(x => x.offsetParent && [...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(x => parseFloat(getComputedStyle(x).fontSize))) * 10) / 10 };
          if (was) s.classList.add('hidden');
        }
        return r;
      });
      await startRun(p, { bot: false });
      await adv(p, 0.5); await add('banner');
      await advUntil(p, 'w.songTime >= -2 * w.beatLen + 0.08'); await add('count2');
      await advUntil(p, 'w.songTime >= 0.08'); await add('go');
      await p.evaluate(() => DD.debug.setBot(true, 0.9));
      await adv(p, 9); await add('play');
      await p.evaluate(() => DD.Game.pause()); await p.waitForTimeout(400); await add('pause');
      await p.evaluate(() => DD.Game.resume()); await raf(p);
      await p.evaluate(() => { DD.Game.bot = null; DD.Game.world._die(); });
      await advUntil(p, 'G.mode === "over"', 5); await p.waitForTimeout(900); await add('over');
      metrics['hud_' + size] = await p.evaluate(() => {
        const R = DD.Game.renderer, k = R.cssScale, K = R._hudK;
        const pb = document.getElementById('btnPause').getBoundingClientRect();
        const c = R.canvas.getBoundingClientRect();
        return { cssScale: +k.toFixed(3), hudK: +K.toFixed(2), scoreCssPx: +(Math.round(28 * K) * k).toFixed(1), comboCssPx: +(Math.round(15 * K) * k).toFixed(1), floorNameCssPx: +(Math.round(15 * K) * k).toFixed(1),
          judgeCssPx: +(26 * Math.sqrt(R.layout.gs) * k).toFixed(1), missCssPx: +(20 * k).toFixed(1), pointsCssPx: +(17 * Math.sqrt(R.layout.gs) * k).toFixed(1), x2BadgeCssPx: +(12 * R.layout.gs * k).toFixed(1),
          pauseBtn: [Math.round(pb.width), Math.round(pb.height)], VW: R.VW, VH: R.VH, gs: R.layout.gs, touch: DD.Game.isTouch,
          letterbox: { left: Math.round(c.left), top: Math.round(c.top), right: Math.round(innerWidth - c.right), bottom: Math.round(innerHeight - c.bottom) } };
      });
      await sheet(files, labels, 'sheet_screens_' + size, size === 'phoneP' ? 5 : 4, size === 'phoneP' ? 260 : 420);
      await p.context().close();
    }
  }

  // ---------------- every floor in play (bot), Normal at all sizes + Easy one-button ----------------
  if (on('floors')) {
    for (const size of Object.keys(SIZES)) {
      const p = await open(size);
      for (const diff of ['normal', 'easy']) {
        if (diff === 'easy' && size === 'phoneL') continue;
        const files = [], labels = [];
        for (let t = 0; t < 4; t++) {
          await startRun(p, { diff, level: t, skill: 0.85 });
          await advUntil(p, 'w.songTime > 7.3');
          files.push(await shot(p, 'floor_' + size + '_' + diff + '_' + FLOORS[t])); labels.push(diff + ' ' + FLOORS[t]);
        }
        await sheet(files, labels, 'sheet_floors_' + size + '_' + diff, size === 'phoneP' ? 4 : 2, size === 'phoneP' ? 300 : 620);
      }
      await p.context().close();
    }
  }

  // ---------------- floor crossfade (song cleared → next floor) + game over / sleepy ----------------
  if (on('trans')) {
    for (const size of ['desk', 'phoneP']) {
      const p = await open(size);
      await startRun(p, { diff: 'normal', skill: 1 });
      await advUntil(p, 'w.state === "cleared"', 120);
      const files = [], labels = [];
      for (let i = 0; i < 16; i++) {
        const st = await p.evaluate(() => { const G = DD.Game; return G.world.state + ' L' + G.world.level + ' fade' + G.renderer.vis.t.toFixed(2); });
        files.push(await shot(p, '_f_' + i)); labels.push(st);
        await adv(p, i < 5 ? 0.5 : 0.12);
      }
      await sheet(files, labels, 'trans_' + size + '_clear', 4, size === 'phoneP' ? 230 : 400);
      await p.context().close();
    }
  }

  // ---------------- Pip: entering, perched, swooping on a save (each floor) ----------------
  if (on('pip')) {
    for (const size of Object.keys(SIZES)) {
      const p = await open(size);
      const files = [], labels = [];
      for (let t = 0; t < 4; t++) {
        await startRun(p, { diff: 'normal', level: t, skill: 1 });
        await advUntil(p, 'w.songTime > 3');
        await p.evaluate(() => DD.debug.helperNow());
        await adv(p, 0.45);
        files.push(await shot(p, 'pip_' + size + '_' + FLOORS[t] + '_enter')); labels.push(FLOORS[t] + ' enter');
        await advUntil(p, 'w.helper.state === "with"', 5); await adv(p, 1.3);
        files.push(await shot(p, 'pip_' + size + '_' + FLOORS[t] + '_perch')); labels.push(FLOORS[t] + ' perched');
        await p.evaluate(() => { DD.Game.bot = null; });
        await advUntil(p, 'w.helper.state === "save"', 8); await adv(p, 0.22);
        files.push(await shot(p, 'pip_' + size + '_' + FLOORS[t] + '_save')); labels.push(FLOORS[t] + ' save swoop');
      }
      await sheet(files, labels, 'sheet_pip_' + size, 3, size === 'phoneP' ? 260 : 420);
      // Pip motion burst (one floor): entry + save swoop frames on the play band
      if (size !== 'phoneL') {
        await startRun(p, { diff: 'normal', level: 0, skill: 1 });
        await advUntil(p, 'w.songTime > 3');
        await p.evaluate(() => DD.debug.helperNow());
        const full = await clipOf(p, 0, 0, (await L(p)).VW, (await L(p)).VH);
        const f2 = [], l2 = [];
        for (let i = 0; i < 8; i++) { f2.push(await shot(p, '_f_' + i, full)); l2.push('enter t+' + (i * 0.14).toFixed(2)); await adv(p, 0.14); }
        await p.evaluate(() => { DD.Game.bot = null; });
        await advUntil(p, 'w.helper.state === "save"', 8);
        for (let i = 0; i < 8; i++) { const st = await p.evaluate(() => DD.Game.world.helper.state); f2.push(await shot(p, '_f_' + (8 + i), full)); l2.push(st + ' +' + (i * 0.1).toFixed(1)); await adv(p, 0.1); }
        await sheet(f2, l2, 'burst_' + size + '_pip', 4, size === 'phoneP' ? 230 : 380);
      }
      await p.context().close();
    }
  }

  // ---------------- motion bursts (contact sheets) ----------------
  if (on('bursts')) {
    for (const size of ['desk', 'phoneP']) {
      const p = await open(size);
      await startRun(p, { diff: 'normal', skill: 1 });
      const lay = await L(p);
      const band = await clipOf(p, Math.max(0, lay.kitX - 90), lay.coinY[0] - 150, Math.min(lay.VW, 520), lay.coinY[1] - lay.coinY[0] + 260);
      async function burst(name, n, dt, clip) {
        const files = [], labels = [];
        for (let i = 0; i < n; i++) {
          const info = await p.evaluate(() => { const w = DD.Game.world, n = w.notes.find(n => n.state === 'live'); return { t: w.songTime.toFixed(3), f: w.kit.frame, pos: w.kit.pos.toFixed(2), bl: n ? ((n.time - w.songTime) / w.beatLen).toFixed(2) : '-' }; });
          files.push(await shot(p, '_f_' + i, clip || band)); labels.push('t=' + info.t + ' ' + info.f + ' p' + info.pos + ' b' + info.bl);
          await adv(p, dt);
        }
        await sheet(files, labels, 'burst_' + size + '_' + name, size === 'phoneP' ? 6 : 4, size === 'phoneP' ? 220 : 330);
      }
      // gem hop sequence over one beat: 9 frames across a beat, wide clip of the lanes
      await advUntil(p, 'w.songTime > 5 && Math.abs(((w.songTime / w.beatLen) % 1)) < 0.01');
      const bl = await p.evaluate(() => DD.Game.world.beatLen);
      const wide = await clipOf(p, lay.ringX - 60, lay.coinY[0] - 110, lay.VW - lay.ringX + 60, lay.coinY[1] - lay.coinY[0] + 170);
      await burst('hop', 9, bl / 8, wide);
      // catch: reach → happy
      await advUntil(p, 'w.notes.some(n => n.state === "live" && n.time - w.songTime > 0.22 && n.time - w.songTime < 0.235)');
      await burst('hit', 12, 0.05);
      // lane switch on the swing
      await advUntil(p, '(() => { const l = w.notes.filter(n => n.state === "live"); return l.length > 1 && l[0].lane !== w.kit.lane && l[0].time - w.songTime > 0.10 && l[0].time - w.songTime < 0.115 && Math.abs(w.kit.pos - w.kit.lane) < 0.02; })()', 40);
      await burst('laneswitch', 12, 0.025);
      // miss tumble: bot off
      await p.evaluate(() => { DD.Game.bot = null; });
      await advUntil(p, 'w.helper.state === "away" && w.notes.some(n => n.state === "live" && n.time - w.songTime > 0.1 && n.time - w.songTime < 0.115)', 20);
      await burst('miss', 12, 0.05);
      // death / sleepy
      await p.evaluate(() => { DD.Game.world._die(); });
      const full = await clipOf(p, 0, 0, lay.VW, lay.VH);
      const f2 = [], l2 = [];
      for (const dt of [0, 0.1, 0.25, 0.4, 0.5, 0.8, 1.0]) { await adv(p, dt); f2.push(await shot(p, '_f_' + f2.length, full)); l2.push('after die +' + dt); }
      await advUntil(p, 'G.mode === "over"', 5); await p.waitForTimeout(300); f2.push(await shot(p, '_f_' + f2.length)); l2.push('over +300ms');
      await p.waitForTimeout(700); f2.push(await shot(p, '_f_' + f2.length)); l2.push('over +1s');
      await sheet(f2, l2, 'burst_' + size + '_sleepy', 3, size === 'phoneP' ? 240 : 420);
      await p.context().close();
    }
  }

  // ---------------- custom pictures (generated photo + transparent sticker) ----------------
  if (on('custom')) {
    const mk = await sheetPage.evaluate(() => {
      const a = document.createElement('canvas'); a.width = 1200; a.height = 900; const g = a.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 1200, 900); gr.addColorStop(0, '#6aa0d8'); gr.addColorStop(0.5, '#f0d27a'); gr.addColorStop(1, '#3a6b3a'); g.fillStyle = gr; g.fillRect(0, 0, 1200, 900);
      for (let i = 0; i < 260; i++) { g.fillStyle = 'hsla(' + (i * 37 % 360) + ',55%,' + (35 + (i * 13) % 45) + '%,.55)'; g.beginPath(); g.arc((i * 211) % 1200, (i * 97) % 900, 10 + (i * 7) % 70, 0, 7); g.fill(); }
      g.fillStyle = '#c98a4a'; g.beginPath(); g.ellipse(600, 470, 260, 300, 0, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(510, 400, 34, 0, 7); g.arc(690, 400, 34, 0, 7); g.fill();
      const b = document.createElement('canvas'); b.width = 600; b.height = 400; const h = b.getContext('2d');
      h.fillStyle = '#ff5fa0'; h.beginPath(); h.moveTo(300, 380); h.bezierCurveTo(-120, 120, 160, -60, 300, 110); h.bezierCurveTo(440, -60, 720, 120, 300, 380); h.fill();
      h.lineWidth = 14; h.strokeStyle = '#8a1f50'; h.stroke();
      return [a.toDataURL('image/png'), b.toDataURL('image/png')];
    });
    const photo = OUT + '/_in_photo.png', sticker = OUT + '/_in_sticker.png';
    fs.writeFileSync(photo, Buffer.from(mk[0].split(',')[1], 'base64'));
    fs.writeFileSync(sticker, Buffer.from(mk[1].split(',')[1], 'base64'));
    for (const size of ['desk', 'phoneP']) {
      const p = await open(size);
      await p.click('#btnCustomize'); await p.waitForTimeout(400);
      const pick = async (idx, file) => {
        const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.slot [data-act=pick]').nth(idx).click()]);
        await fc.setFiles(file); await p.waitForTimeout(1200);
      };
      await pick(0, photo);     // Momo = photo
      await pick(1, sticker);   // gem = transparent heart
      await pick(2, sticker);   // Pip = sticker
      await pick(3, photo);     // river wall = photo
      await pick(6, photo);     // sky wall = photo
      await shot(p, 'custom_' + size + '_screen');
      await p.evaluate(() => DD.UI.back()); await p.waitForTimeout(300);
      const files = [], labels = [];
      for (const t of [0, 3]) {
        await startRun(p, { diff: 'normal', level: t, skill: 1 });
        await advUntil(p, 'w.songTime > 3'); await p.evaluate(() => DD.debug.helperNow());
        await advUntil(p, 'w.helper.state === "with"', 5); await adv(p, 0.8);
        files.push(await shot(p, 'custom_' + size + '_' + FLOORS[t])); labels.push(FLOORS[t] + ' custom');
      }
      const lay = await L(p);
      const kc = await clipOf(p, Math.max(0, lay.kitX - 80), lay.coinY[0] - 150, 360, lay.coinY[1] - lay.coinY[0] + 220);
      for (let i = 0; i < 8; i++) { files.push(await shot(p, '_f_' + i, kc)); labels.push('alive f' + i); await adv(p, 0.07); }
      await sheet(files.slice(0, 2), labels.slice(0, 2), 'custom_' + size + '_play', 2, size === 'phoneP' ? 380 : 640);
      await sheet(files.slice(2), labels.slice(2), 'custom_' + size + '_alive', 4, 260);
      await p.evaluate(() => DD.Assets.SLOTS.forEach(s => DD.Assets.clearCustom(s.id)));
      await p.context().close();
    }
  }

  // ---------------- colour-blind simulation ----------------
  if (on('cvd')) {
    const M = {
      deutan: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
      protan: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0'
    };
    const p = await open('desk');
    await p.evaluate(M => {
      document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="deutan"><feColorMatrix type="matrix" values="' + M.deutan + '"/></filter><filter id="protan"><feColorMatrix type="matrix" values="' + M.protan + '"/></filter></svg>');
    }, M);
    const files = [], labels = [];
    for (const t of [0, 1, 2, 3]) {
      await startRun(p, { diff: 'normal', level: t, skill: 0.8 });
      await advUntil(p, 'w.songTime > 3'); await p.evaluate(() => DD.debug.helperNow());
      await advUntil(p, 'w.songTime > 6 && w.notes.some(n => n.kind === "gold" && n.state === "live" && n.time - w.songTime < 1.4 && n.time - w.songTime > 0.2)', 50);
      for (const f of ['none', 'deutan', 'protan']) {
        await p.evaluate(f => { document.getElementById('stage').style.filter = f === 'none' ? '' : 'url(#' + f + ')'; }, f);
        await raf(p);
        files.push(await shot(p, 'cvd_' + FLOORS[t] + '_' + f)); labels.push(FLOORS[t] + ' ' + f);
      }
      await p.evaluate(() => { document.getElementById('stage').style.filter = ''; });
    }
    await p.evaluate(() => { DD.Game.world.groove = 0.2; DD.Game.bot = null; });
    await adv(p, 0.05);
    for (const f of ['none', 'deutan', 'protan']) {
      await p.evaluate(f => { document.getElementById('stage').style.filter = f === 'none' ? '' : 'url(#' + f + ')'; }, f);
      await raf(p);
      files.push(await shot(p, 'cvd_hud_' + f, { x: 0, y: 0, width: 640, height: 120 })); labels.push('groove 0.2 ' + f);
    }
    await sheet(files.slice(0, 12), labels.slice(0, 12), 'sheet_cvd', 3, 420);
    await sheet(files.slice(12), labels.slice(12), 'sheet_cvd_hud', 3, 420);
    await p.context().close();
  }

  // ---------------- measurements: gem contrast vs every wall/rail, overlay overlaps (Momo, drums, Pip) ----------------
  if (on('measure')) {
    for (const size of Object.keys(SIZES)) {
      const p = await open(size);
      await startRun(p, { diff: 'normal', skill: 0.85 });
      await adv(p, 0.5);
      for (let b = 0; b < 4; b++) await p.evaluate(b => DD.Game.renderer.background(b), b);
      await p.waitForTimeout(300);
      metrics['contrast_' + size] = await p.evaluate(() => {
        const R = DD.Game.renderer, L = R.layout, out = {};
        const lum = (r, g, b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const mean = (key) => {
          const c = DD.Assets.sprite(key, 40, 40); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let s = [0, 0, 0], n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
          return s.map(v => Math.round(v / n));
        };
        const gem = mean('coin'), gold = mean('coin_gold');
        const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
        for (let b = 0; b < 4; b++) {
          const bg = R.background(b); if (!bg) { out[b] = 'not ready'; continue; }
          const g = bg.getContext('2d'), px = R.px; const res = {};
          for (const lane of [0, 1]) {
            // band the gem hops through: ringX..VW, from coinY − HOP − 20 to coinY + 20
            const x0 = Math.round(L.ringX * px), w0 = Math.round((L.VW - L.ringX) * px), y0 = Math.round((L.coinY[lane] - 30 * L.gs - 20) * px), h0 = Math.round((30 * L.gs + 40) * px);
            const d = g.getImageData(x0, y0, w0, h0).data; let a = [0, 0, 0], m = 0, minC = 99, minCg = 99;
            for (let i = 0; i < d.length; i += 16) { a[0] += d[i]; a[1] += d[i + 1]; a[2] += d[i + 2]; m++; const l = lum(d[i], d[i + 1], d[i + 2]); minC = Math.min(minC, cr(lum(...gem), l)); minCg = Math.min(minCg, cr(lum(...gold), l)); }
            const rgb = a.map(v => Math.round(v / m));
            res['lane' + lane] = { bgMean: hex(rgb), gemRatio: +cr(lum(...gem), lum(...rgb)).toFixed(2), goldRatio: +cr(lum(...gold), lum(...rgb)).toFixed(2), gemWorstPx: +minC.toFixed(2), goldWorstPx: +minCg.toFixed(2) };
          }
          out[['river', 'ferns', 'nests', 'sky'][b]] = res;
        }
        out.gemMean = hex(gem); out.goldMean = hex(gold);
        return out;
      });
      metrics['overlap_' + size] = await p.evaluate(() => {
        const G = DD.Game, R = G.renderer, L = R.layout, g = R.ctx; const st = 1 / 120;
        const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
        const hits = {}; let frames = 0, pipCalls = 0, pipOverKit = 0, pipOverDrum = 0, pipOverGem = 0, pipFrames = 0;
        const inter = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        const gs = L.gs;
        for (let t = 0; t < 50; t += st) {
          G.step(st); R.update(st);
          if (G.world.state === 'playing' && G.world.helper.state === 'away' && G.world.songTime > 4 && pipCalls < 3) { if (DD.debug.helperNow()) pipCalls++; }
          if (Math.round(t / st) % 4) continue; frames++;
          const w = G.world, kxy = R._kitXY || [L.kitX, L.coinY[0]];
          const kit = { x: kxy[0] - 58 * gs, y: kxy[1] - 52 * gs, w: 96 * gs, h: 96 * gs };
          const rings = [0, 1].map(l => ({ x: L.ringX - 36 * gs, y: L.coinY[l] - 22 * gs, w: 72 * gs, h: 44 * gs }));
          let pip = null;
          if (w.helper.state !== 'away') {
            const [hx, hy] = R.helperXY(); pip = { x: hx - 30 * gs, y: hy - 26 * gs, w: 60 * gs, h: 52 * gs }; pipFrames++;
            if (inter(pip, kit)) pipOverKit++; if (rings.some(r => inter(pip, r))) pipOverDrum++;
            if (w.helper.state === 'with') for (const n of w.notes) { if (n.state !== 'live') continue; const x = R.noteX(n, w); if (x > L.VW) break; const gb = { x: x - 20 * gs, y: L.coinY[n.lane] - 30 * gs - 20 * gs, w: 40 * gs, h: 70 * gs }; if (inter(pip, gb)) { pipOverGem++; break; } }
          }
          for (const tx of R.texts) {
            const kk = tx.life / tx.max, a = kk > 0.7 ? (1 - kk) / 0.3 : 1; if (a < 0.35) continue;
            g.font = '900 ' + tx.size + 'px ' + FONT; const tw = g.measureText(tx.text).width;
            const cx = Math.min(Math.max(tx.x, 80), R.VW - 80), cy = Math.max(tx.y, L.ins.top + L.hudH + tx.size * 0.6);
            const box = { x: cx - tw / 2, y: cy - tx.size * 0.5, w: tw, h: tx.size };
            const key = tx.text.replace(/\d+/g, 'N');
            const o = hits[key] = hits[key] || { n: 0, kit: 0, ring0: 0, ring1: 0, pip: 0, offscreen: 0, example: null };
            o.n++;
            if (box.x < 0 || box.x + box.w > R.VW) o.offscreen++;
            if (inter(box, kit)) { o.kit++; o.example = o.example || { box: Object.values(box).map(Math.round), kit: Object.values(kit).map(Math.round) }; }
            if (inter(box, rings[0])) o.ring0++; if (inter(box, rings[1])) o.ring1++;
            if (pip && inter(box, pip)) o.pip++;
          }
        }
        const [px0, py0] = (() => { const h = G.world.helper; const s = { x01: h.x01, y01: h.y01 }; h.x01 = h._px01 = 0.14; h.y01 = h._py01 = 0.12; const r = R.helperXY(); h.x01 = h._px01 = s.x01; h.y01 = h._py01 = s.y01; return r; })();
        return { frames, pipFrames, pipOverKit, pipOverDrum, pipOverGemWhilePerched: pipOverGem, perchXY: [Math.round(px0), Math.round(py0)], layout: { ringX: L.ringX, kitX: Math.round(L.kitX), coinY: L.coinY, laneY: L.laneY, VW: L.VW, VH: L.VH, gs: L.gs, hudH: L.hudH, win: L.win }, texts: hits };
      });
      await p.context().close();
    }
  }

  fs.writeFileSync(MF, JSON.stringify(metrics, null, 1));
  console.log(JSON.stringify(metrics, null, 1).slice(0, 9000));
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
