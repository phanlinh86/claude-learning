// Visual QA capture for Kit's Toybox Beat.
// Run: node tests/visual/capture.js [section ...]   (sections: screens tods boss bursts trans cvd custom measure; default all)
// Output: tests/out/visual/*.png (+ contact sheets) and tests/out/visual/metrics.json.
// The game clock is frozen (setSpeed(0)) and advanced by hand (Game.step + Renderer.update), so frames are exact.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const SIZES = {
  desk: { viewport: { width: 1280, height: 720 } },
  phoneP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};
const TODS = ['dawn', 'noon', 'sunset', 'night'];
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
  await p.waitForFunction(() => window.KB && KB.debug && (KB.debug.mode === 'title' || KB.debug.mode === 'playing'), null, { timeout: 20000 });
  await p.waitForTimeout(400);
  return p;
}
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function freeze(p) { await p.evaluate(() => KB.debug.setSpeed(0)); await raf(p); }
/* advance the game by `sec` seconds of game time in fixed 1/120 s steps */
async function adv(p, sec) {
  await p.evaluate(sec => {
    const G = KB.Game; let t = 0; const st = 1 / 120;
    while (t < sec - 1e-9) { const h = Math.min(st, sec - t); if (G.mode !== 'paused') { G.step(h); G.renderer.update(h); } t += h; }
  }, sec);
  await raf(p);
}
/* advance until predicate (string, evaluated with w = world, G = game) is true or maxSec passes */
async function advUntil(p, pred, maxSec = 90) {
  const ok = await p.evaluate(([pred, maxSec]) => {
    const G = KB.Game, f = new Function('w', 'G', 'return (' + pred + ')'); let t = 0; const st = 1 / 120;
    while (t < maxSec) { if (f(G.world, G)) return true; G.step(st); G.renderer.update(st); t += st; }
    return false;
  }, [pred, maxSec]);
  await raf(p);
  if (!ok) console.warn('advUntil timed out:', pred);
  return ok;
}
async function shot(p, name, clip) {
  const file = OUT + '/' + name + '.png';
  await p.screenshot({ path: file, clip: clip || undefined });
  return file;
}
/* logical rect → css clip */
async function clipOf(p, lx, ly, lw, lh) {
  return p.evaluate(([lx, ly, lw, lh]) => {
    const R = KB.Game.renderer, r = R.canvas.getBoundingClientRect(), k = r.width / R.VW;
    const x = Math.max(0, r.left + lx * k), y = Math.max(0, r.top + ly * k);
    return { x, y, width: Math.min(innerWidth - x, lw * k), height: Math.min(innerHeight - y, lh * k) };
  }, [lx, ly, lw, lh]);
}
const L = p => p.evaluate(() => { const l = KB.Game.renderer.layout; return { VW: l.VW, VH: l.VH, ringX: l.ringX, kitX: l.kitX, coinY: l.coinY, laneY: l.laneY, hudH: l.hudH, s: l.s, win: l.win, split: l.split, floorTop: l.floorTop }; });

/* composite PNG files into one contact sheet (labels under each frame) */
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
      g.fillStyle = '#fff'; g.font = '14px monospace'; g.fillText(labels[i] || '', x + 4, y + ch + 16);
    });
    return c.toDataURL('image/png');
  }, [imgs, labels, cols, cellW]);
  fs.writeFileSync(OUT + '/' + out + '.png', Buffer.from(data.split(',')[1], 'base64'));
  files.forEach(f => { if (f.includes('/_f_')) fs.unlinkSync(f); });
}

/* start a fresh, frozen run */
async function startRun(p, opts = {}) {
  await p.evaluate(o => {
    const G = KB.Game; G.speed = 0;
    if (o.diff) G.urlDiff = o.diff;
    G.startGame();
    if (o.level) G.world.startLevel(o.level);
    if (o.level) { G._setLevelVisuals(G.world.tod, true); }
    KB.debug.setBot(o.bot !== false, o.skill == null ? 1 : o.skill);
    if (o.bot === false) G.bot = null;
  }, opts);
  await raf(p);
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
      await p.waitForTimeout(2500); await add('title');
      for (const [btn, n] of [['#btnHow', 'how'], ['#btnSettings', 'settings'], ['#btnCustomize', 'custom']]) {
        await p.click(btn); await p.waitForTimeout(500); await add(n);
        await p.evaluate(() => KB.UI.back()); await p.waitForTimeout(300);
      }
      // overflow check for each panel
      metrics['panels_' + size] = await p.evaluate(() => {
        const r = {};
        for (const id of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
          const s = document.getElementById(id); const was = s.classList.contains('hidden'); s.classList.remove('hidden');
          const pn = s.querySelector('.panel') || s.querySelector('.title-wrap');
          const b = pn.getBoundingClientRect();
          r[id] = { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), scroll: pn.scrollHeight > pn.clientHeight + 2, vw: innerWidth, vh: innerHeight,
            minBtnH: Math.round(Math.min(...[...s.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.getBoundingClientRect().height).concat([999]))),
            minFont: Math.round(Math.min(...[...s.querySelectorAll('p,span,b,button,h2,h3,label,div')].filter(x => x.offsetParent && x.childNodes.length && [...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(x => parseFloat(getComputedStyle(x).fontSize))) * 10) / 10 };
          if (was) s.classList.add('hidden');
        }
        return r;
      });
      // level banner + count-in
      await startRun(p, { bot: false });
      await adv(p, 0.5); await add('banner');
      await advUntil(p, 'w.songTime >= -2 * w.beatLen + 0.08'); await add('count2');
      await advUntil(p, 'w.songTime >= 0.08'); await add('go');
      // playing (bot), HUD
      await p.evaluate(() => KB.debug.setBot(true, 0.9));
      await adv(p, 9); await add('play');
      // pause
      await p.evaluate(() => KB.Game.pause()); await p.waitForTimeout(400); await add('pause');
      await p.evaluate(() => KB.Game.resume()); await raf(p);
      // game over
      await p.evaluate(() => { KB.Game.bot = null; KB.Game.world._die(); });
      await advUntil(p, 'G.mode === "over"', 5); await p.waitForTimeout(900); await add('over');
      metrics['hud_' + size] = await p.evaluate(() => {
        const R = KB.Game.renderer, k = R.cssScale, K = R._hudK;
        const pb = document.getElementById('btnPause').getBoundingClientRect();
        return { cssScale: +k.toFixed(3), hudK: +K.toFixed(2), scoreCssPx: +(Math.round(28 * K) * k).toFixed(1), comboCssPx: +(Math.round(15 * K) * k).toFixed(1), todNameCssPx: +(Math.round(15 * K) * k).toFixed(1), grooveBarCssH: +(Math.round(14 * K) * k).toFixed(1), pauseBtn: [Math.round(pb.width), Math.round(pb.height)], VW: R.VW, VH: R.VH, touch: KB.Game.isTouch };
      });
      await sheet(files, labels, 'sheet_screens_' + size, size === 'phoneP' ? 5 : 4, size === 'phoneP' ? 300 : 460);
      await p.context().close();
    }
  }

  // ---------------- every time of day, Easy + Normal, at all sizes ----------------
  if (on('tods')) {
    for (const size of Object.keys(SIZES)) {
      const p = await open(size);
      for (const diff of ['easy', 'normal']) {
        const files = [], labels = [];
        for (let t = 0; t < 4; t++) {
          await startRun(p, { diff, level: t, skill: 0.85 });
          await advUntil(p, 'w.songTime > 7.3');
          files.push(await shot(p, 'tod_' + size + '_' + diff + '_' + TODS[t])); labels.push(diff + ' ' + TODS[t]);
        }
        await sheet(files, labels, 'sheet_tods_' + size + '_' + diff, 2, size === 'phoneP' ? 380 : 640);
      }
      await p.context().close();
    }
  }

  // ---------------- Baron Fluff: pillow in flight, bounce back + oof, poof on Kit (each tod) ----------------
  if (on('boss')) {
    for (const size of ['desk', 'phoneP', 'ipad', 'phoneL']) {
      const p = await open(size);
      const files = [], labels = [];
      for (let t = 0; t < 4; t++) {
        const diff = t % 2 ? 'easy' : 'normal';
        await startRun(p, { diff, level: t, skill: 1 });
        await advUntil(p, 'w.songTime > 3');
        await p.evaluate(() => KB.debug.bossNow());
        await advUntil(p, 'w.boss.state === "hover"', 5);
        files.push(await shot(p, 'boss_' + size + '_' + TODS[t] + '_hover')); labels.push(TODS[t] + ' hover ' + diff);
        // pillow 1 in flight (middle of the lob)
        await advUntil(p, 'w.notes.some(n => n.kind === "pillow" && n.state === "live" && n.tThrow != null && w.songTime > n.tThrow + (n.time - n.tThrow) * 0.45)', 10);
        files.push(await shot(p, 'boss_' + size + '_' + TODS[t] + '_flight')); labels.push(TODS[t] + ' pillow mid-air');
        // bot bops it → pillow flies back, Fluff oof
        await advUntil(p, 'w.boss.frame === "oof"', 5); await adv(p, 0.18);
        files.push(await shot(p, 'boss_' + size + '_' + TODS[t] + '_bounce')); labels.push(TODS[t] + ' bounce +oof');
        // next pillow: bot off → poof
        await p.evaluate(() => { KB.Game.bot = null; });
        await advUntil(p, 'w.kit.dizzy > 0', 6); await adv(p, 0.12);
        files.push(await shot(p, 'boss_' + size + '_' + TODS[t] + '_poof')); labels.push(TODS[t] + ' poof on Kit');
      }
      await sheet(files, labels, 'sheet_boss_' + size, 4, size === 'phoneP' ? 260 : 420);
      await p.context().close();
    }
  }

  // ---------------- motion bursts (contact sheets) ----------------
  if (on('bursts')) {
    for (const size of ['desk', 'phoneP']) {
      const p = await open(size);
      const lay = await L(p);
      const band = await clipOf(p, Math.max(0, lay.kitX - 90), lay.coinY[0] - 130, Math.min(lay.VW, 470), lay.coinY[1] - lay.coinY[0] + 230);
      async function burst(name, n, dt, labelFn) {
        const files = [], labels = [];
        for (let i = 0; i < n; i++) {
          const info = await p.evaluate(() => { const w = KB.Game.world; return { t: w.songTime.toFixed(3), f: w.kit.frame, pos: w.kit.pos.toFixed(2) }; });
          files.push(await shot(p, '_f_' + i, band)); labels.push((labelFn ? labelFn(i) : '') + ' t=' + info.t + ' ' + info.f + ' p' + info.pos);
          await adv(p, dt);
        }
        await sheet(files, labels, 'burst_' + size + '_' + name, size === 'phoneP' ? 6 : 4, size === 'phoneP' ? 230 : 330);
      }
      // catch: reach → happy (bot skill 1, normal)
      await startRun(p, { diff: 'normal', skill: 1 });
      await advUntil(p, 'w.songTime > 6 && w.notes.some(n => n.state === "live" && n.kind === "coin" && n.time - w.songTime > 0.22 && n.time - w.songTime < 0.24)');
      await burst('catch', 12, 0.05);
      // lane switch: two consecutive notes in different lanes
      await advUntil(p, '(() => { const l = w.notes.filter(n => n.state === "live"); return l.length > 1 && l[0].lane !== w.kit.lane && l[0].time - w.songTime > 0.10 && l[0].time - w.songTime < 0.115 && Math.abs(w.kit.pos - w.kit.lane) < 0.02; })()', 40);
      await burst('laneswitch', 12, 0.025);
      // miss: bot off, coin rolls past
      await p.evaluate(() => { KB.Game.bot = null; });
      await advUntil(p, 'w.notes.some(n => n.state === "live" && n.kind !== "pillow" && n.time - w.songTime > 0.1 && n.time - w.songTime < 0.115)', 10);
      await burst('miss', 12, 0.05);
      // coin rolling mid-track (wider clip, no bot)
      await p.evaluate(() => KB.debug.setBot(true, 1));
      await advUntil(p, 'w.notes.some(n => n.state === "live" && n.time - w.songTime > 0.9 && n.time - w.songTime < 0.91)', 20);
      await burst('roll', 10, 0.05);
      // pillow throw arc (12 frames over the lob) + bounce
      await startRun(p, { diff: 'normal', level: 1, skill: 1 });
      await advUntil(p, 'w.songTime > 3'); await p.evaluate(() => KB.debug.bossNow());
      await advUntil(p, 'w.notes.some(n => n.kind === "pillow" && n.state === "live" && n.tThrow != null && w.songTime >= n.tThrow)', 8);
      const air = await p.evaluate(() => { const w = KB.Game.world, n = w.notes.find(n => n.kind === 'pillow' && n.state === 'live'); return n.time - n.tThrow; });
      const full = await clipOf(p, 0, 0, lay.VW, lay.VH);
      {
        const files = [], labels = [];
        for (let i = 0; i < 16; i++) {
          files.push(await shot(p, '_f_' + i, full)); labels.push('k=' + (i < 12 ? (i / 11).toFixed(2) : 'after+' + ((i - 11) * 60) + 'ms'));
          await adv(p, i < 11 ? air / 11 : 0.06);
        }
        await sheet(files, labels, 'burst_' + size + '_pillow', 4, size === 'phoneP' ? 230 : 360);
      }
      await p.context().close();
    }
  }

  // ---------------- level-clear transition + game over moment ----------------
  if (on('trans')) {
    for (const size of ['desk', 'phoneP']) {
      const p = await open(size);
      await startRun(p, { diff: 'normal', skill: 1 });
      await advUntil(p, 'w.state === "cleared"', 120);
      const files = [], labels = [];
      for (let i = 0; i < 16; i++) {
        const st = await p.evaluate(() => { const G = KB.Game; return G.world.state + ' L' + G.world.level + ' fade' + G.renderer.vis.t.toFixed(2); });
        files.push(await shot(p, '_f_' + i)); labels.push(st);
        await adv(p, i < 6 ? 0.45 : 0.15);
      }
      await sheet(files, labels, 'trans_' + size + '_clear', 4, size === 'phoneP' ? 230 : 400);
      // game over moment
      await p.evaluate(() => { KB.Game.bot = null; KB.Game.world._die(); });
      const f2 = [], l2 = [];
      for (const dt of [0, 0.1, 0.25, 0.5, 0.8, 1.2, 1.5]) { await adv(p, dt); f2.push(await shot(p, '_f_' + f2.length)); l2.push('after die ' + dt); }
      await advUntil(p, 'G.mode === "over"', 4); await p.waitForTimeout(250); f2.push(await shot(p, '_f_' + f2.length)); l2.push('over +250ms');
      await p.waitForTimeout(700); f2.push(await shot(p, '_f_' + f2.length)); l2.push('over +950ms');
      await sheet(f2, l2, 'trans_' + size + '_over', 3, size === 'phoneP' ? 260 : 420);
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
    for (const t of [0, 3]) {
      await startRun(p, { diff: 'normal', level: t, skill: 0.8 });
      await advUntil(p, 'w.songTime > 3'); await p.evaluate(() => KB.debug.bossNow());
      // a moment with a gold coin visible, a judgement word, groove meter
      await advUntil(p, 'w.songTime > 9 && w.notes.some(n => n.kind === "gold" && n.state === "live" && n.time - w.songTime < 1.2 && n.time - w.songTime > 0.3)', 50);
      for (const f of ['none', 'deutan', 'protan']) {
        await p.evaluate(f => { document.getElementById('stage').style.filter = f === 'none' ? '' : 'url(#' + f + ')'; }, f);
        await raf(p);
        files.push(await shot(p, 'cvd_' + TODS[t] + '_' + f)); labels.push(TODS[t] + ' ' + f);
      }
      await p.evaluate(() => { document.getElementById('stage').style.filter = ''; });
    }
    // low groove meter under deutan
    await p.evaluate(() => { KB.Game.world.groove = 0.2; KB.Game.bot = null; });
    for (const f of ['none', 'deutan', 'protan']) {
      await p.evaluate(f => { document.getElementById('stage').style.filter = f === 'none' ? '' : 'url(#' + f + ')'; }, f);
      await raf(p);
      files.push(await shot(p, 'cvd_hud_' + f, { x: 0, y: 0, width: 640, height: 120 })); labels.push('groove 0.2 ' + f);
    }
    await sheet(files.slice(0, 6), labels.slice(0, 6), 'sheet_cvd', 3, 420);
    await sheet(files.slice(6), labels.slice(6), 'sheet_cvd_hud', 3, 420);
    await p.context().close();
  }

  // ---------------- custom pictures ----------------
  if (on('custom')) {
    // make a photo-like JPEG-ish PNG (no alpha, busy, bright) and a transparent PNG (sticker)
    const mk = await sheetPage.evaluate(() => {
      const a = document.createElement('canvas'); a.width = 1200; a.height = 900; const g = a.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 1200, 900); gr.addColorStop(0, '#6aa0d8'); gr.addColorStop(0.5, '#f0d27a'); gr.addColorStop(1, '#3a6b3a'); g.fillStyle = gr; g.fillRect(0, 0, 1200, 900);
      for (let i = 0; i < 260; i++) { g.fillStyle = 'hsla(' + (i * 37 % 360) + ',55%,' + (35 + (i * 13) % 45) + '%,.55)'; g.beginPath(); g.arc((i * 211) % 1200, (i * 97) % 900, 10 + (i * 7) % 70, 0, 7); g.fill(); }
      g.fillStyle = '#c98a4a'; g.beginPath(); g.ellipse(600, 470, 260, 300, 0, 0, 7); g.fill(); // a "pet face"
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
      await pick(0, photo);     // hero = photo
      await pick(1, sticker);   // coin = transparent heart
      await pick(2, photo);     // pillow = photo
      await pick(6, photo);     // night wallpaper = photo
      await shot(p, 'custom_' + size + '_screen');
      await p.evaluate(() => KB.UI.back()); await p.waitForTimeout(300);
      const files = [], labels = [];
      for (const t of [0, 3]) {
        await startRun(p, { diff: 'normal', level: t, skill: 1 });
        await advUntil(p, 'w.songTime > 3'); await p.evaluate(() => KB.debug.bossNow());
        await advUntil(p, 'w.notes.some(n => n.kind === "pillow" && n.state === "live" && n.tThrow != null && w.songTime > n.tThrow + 0.4)', 10);
        files.push(await shot(p, 'custom_' + size + '_' + TODS[t])); labels.push(TODS[t] + ' custom');
      }
      // hero alive? bob/flame frames
      const lay = await L(p);
      const kc = await clipOf(p, Math.max(0, lay.kitX - 80), lay.coinY[0] - 90, 300, lay.coinY[1] - lay.coinY[0] + 180);
      for (let i = 0; i < 8; i++) { files.push(await shot(p, '_f_' + i, kc)); labels.push('hero f' + i); await adv(p, 0.07); }
      await sheet(files.slice(0, 2), labels.slice(0, 2), 'custom_' + size + '_play', 2, size === 'phoneP' ? 380 : 640);
      await sheet(files.slice(2), labels.slice(2), 'custom_' + size + '_alive', 4, 260);
      await p.evaluate(() => KB.Assets.SLOTS.forEach(s => KB.Assets.clearCustom(s.id)));
      await p.context().close();
    }
  }

  // ---------------- measurements: coin contrast vs wallpaper/track, overlay overlaps ----------------
  if (on('measure')) {
    for (const size of ['desk', 'phoneP', 'phoneL', 'ipad']) {
      const p = await open(size);
      await startRun(p, { diff: 'normal', skill: 0.85 });
      await adv(p, 0.5);
      // luminance contrast: coin mean colour vs background strip behind the coin path for each tod
      metrics['contrast_' + size] = await p.evaluate(() => {
        const R = KB.Game.renderer, L = R.layout, out = {};
        const lum = (r, g, b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const coin = KB.Assets.sprite('coin', 40, 40);
        const cd = coin.getContext('2d').getImageData(0, 0, coin.width, coin.height).data;
        let s = [0, 0, 0], n = 0; for (let i = 0; i < cd.length; i += 4) if (cd[i + 3] > 200) { s[0] += cd[i]; s[1] += cd[i + 1]; s[2] += cd[i + 2]; n++; }
        const coinRGB = s.map(v => Math.round(v / n)), cl = lum(...coinRGB);
        for (let b = 0; b < 4; b++) {
          const bg = R.background(b); if (!bg) continue;
          const g = bg.getContext('2d'), px = R.px; const res = {};
          for (const lane of [0, 1]) {
            // band the coin travels through: ringX..VW, coinY ± 20 (behind the coin, i.e. wall + track top)
            const x0 = Math.round(L.ringX * px), w0 = Math.round((L.VW - L.ringX) * px), y0 = Math.round((L.coinY[lane] - 20) * px), h0 = Math.round(40 * px);
            const d = g.getImageData(x0, y0, w0, h0).data; let a = [0, 0, 0], m = 0, minC = 99;
            for (let i = 0; i < d.length; i += 16) { a[0] += d[i]; a[1] += d[i + 1]; a[2] += d[i + 2]; m++; minC = Math.min(minC, cr(cl, lum(d[i], d[i + 1], d[i + 2]))); }
            const rgb = a.map(v => Math.round(v / m));
            res['lane' + lane] = { bgMean: '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''), ratioMean: +cr(cl, lum(...rgb)).toFixed(2), ratioWorstPx: +minC.toFixed(2) };
          }
          out[['dawn', 'noon', 'sunset', 'night'][b]] = res;
        }
        out.coinMean = '#' + coinRGB.map(v => v.toString(16).padStart(2, '0')).join('');
        return out;
      });
      // overlay overlap: run 40 s of play (bot 0.85 + a boss visit); each frame check texts vs Kit and rings
      metrics['overlap_' + size] = await p.evaluate(() => {
        const G = KB.Game, R = G.renderer, L = R.layout, g = R.ctx; const st = 1 / 120;
        const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
        const hits = {}; let frames = 0, bossDone = false;
        const inter = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        for (let t = 0; t < 45; t += st) {
          G.step(st); R.update(st);
          if (!bossDone && G.world.songTime > 14 && G.world.boss.state === 'away') { bossDone = KB.debug.bossNow() !== false; KB.Game.world.bossNow && (bossDone = true); }
          if (Math.round(t / st) % 4) continue; frames++;
          const w = G.world, k = w.kit, ky = L.coinY[0] + (L.coinY[1] - L.coinY[0]) * k.pos;
          const kit = { x: L.kitX - 46, y: ky - 50, w: 96, h: 96 };
          const rings = [0, 1].map(l => ({ x: L.ringX - 36, y: L.coinY[l] - 36, w: 72, h: 72 }));
          for (const tx of R.texts) {
            const kk = tx.life / tx.max, a = kk > 0.7 ? (1 - kk) / 0.3 : 1; if (a < 0.35) continue;
            g.font = '900 ' + tx.size + 'px ' + FONT; const tw = g.measureText(tx.text).width;
            const cx = Math.min(Math.max(tx.x, 80), R.VW - 80), cy = Math.max(tx.y, L.ins.top + L.hudH + tx.size * 0.6);
            const box = { x: cx - tw / 2, y: cy - tx.size * 0.5, w: tw, h: tx.size };
            const key = tx.text.replace(/\d+/g, 'N');
            const o = hits[key] = hits[key] || { n: 0, kit: 0, ring0: 0, ring1: 0, example: null };
            o.n++;
            if (inter(box, kit)) { o.kit++; o.example = o.example || { box: Object.values(box).map(Math.round), kit: Object.values(kit).map(Math.round) }; }
            if (inter(box, rings[0])) o.ring0++; if (inter(box, rings[1])) o.ring1++;
          }
        }
        return { frames, layout: { ringX: L.ringX, kitX: L.kitX, coinY: L.coinY, VW: L.VW, VH: L.VH }, texts: hits };
      });
      await p.context().close();
    }
  }

  fs.writeFileSync(MF, JSON.stringify(metrics, null, 1));
  console.log(JSON.stringify(metrics, null, 1).slice(0, 6000));
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
