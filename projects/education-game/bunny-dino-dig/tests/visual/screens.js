// Visual QA sweep (Bun's Dino Dig): every screen x 6 device shapes x EN/VI with emulated notch insets, every topic per
// age, all 4 moods, surprises, frame sequences (dig / hatch / hop) and in-page geometry + colour measurements.
//   node tests/visual/screens.js            -> tests/out/visual/*.png (all) + geometry.json; curated copies -> docs/reports/visual/
//   DEV=ip-p,pad-l  LANGS=en  PART=screens,topics,moods,seq,hero   (subsets)
// Report-only: drives the page through DD.debug / DD.UI, never edits game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'out', 'visual'); fs.mkdirSync(OUT, { recursive: true });
const REP = path.join(ROOT, 'docs', 'reports', 'visual');
// insets in CSS px (task: 47/0/34/0 portrait, 0/47/21/47 landscape notch phones; iPad: status bar + home indicator; SE: status bar)
const DEVS = {
  'ip-p': { vp: [393, 852], ins: [47, 0, 34, 0] }, 'ip-l': { vp: [852, 393], ins: [0, 47, 21, 47] },
  'se-p': { vp: [375, 667], ins: [20, 0, 0, 0] },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0] }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0] },
  'pro-l': { vp: [1366, 1024], ins: [24, 0, 20, 0] }
};
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'], 5: ['shapes', 'count', 'letters', 'animals'],
  6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const env = (k, d) => (process.env[k] ? process.env[k].split(',') : d);
const DEV_LIST = env('DEV', Object.keys(DEVS)), LANGS = env('LANGS', ['en', 'vi']), PARTS = new Set(env('PART', ['screens', 'topics', 'moods', 'seq', 'hero']));
const until = (page, fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const geo = {};

async function open(browser, srv, dev, lang, age, dpr = 1, seed = 5) {
  const d = DEVS[dev];
  const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page._errs = []; page.on('pageerror', e => page._errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page._errs.push(m.text()); });
  await page.goto(srv.url + `?mute=1&novoice=1&seed=${seed}&age=${age}&lang=${lang}`);
  await until(page, () => window.DD && DD.debug && DD.debug.mode === 'title');
  await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(450);
  await page.evaluate(installProbe);
  return { ctx, page };
}

// in-page measuring helpers (logical px; DOM rects converted with DD.debug.view())
function installProbe() {
  const W = () => DD.debug.world, V = () => DD.debug.view();
  const rectL = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || getComputedStyle(el).visibility === 'hidden' || el.closest('.hidden')) return null; const v = V(); return { x: (r.left - v.left) / v.s, y: (r.top - v.top) / v.s, w: r.width / v.s, h: r.height / v.s }; };
  const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
  const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const cr = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const lab = c => { let [r, g, b] = c.map(v => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; });
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; x = f(x); y = f(y); z = f(z); return [116 * y - 16, 500 * (x - y), 200 * (y - z)]; };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  // median colour of a 7x7 logical-px patch on the game canvas
  const sample = (x, y, r = 3) => {
    const cv = document.getElementById('game'), g = cv.getContext('2d'), k = cv.width / W().layout.W;
    const px = Math.round(x * k), py = Math.round(y * k), rr = Math.max(1, Math.round(r * k));
    const d = g.getImageData(Math.max(0, px - rr), Math.max(0, py - rr), 2 * rr + 1, 2 * rr + 1).data, rs = [], gs = [], bs = [];
    for (let i = 0; i < d.length; i += 4) { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
    const med = a => a.sort((p, q) => p - q)[a.length >> 1]; return [med(rs), med(gs), med(bs)];
  };
  const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  window.QA = {
    geom() {
      const w = W(), L = w.layout, cfg = DD.CONFIG, v = V();
      const B = w.bunHit(), bun = { x: B.x - B.w / 2, y: B.y - B.h / 2, w: B.w, h: B.h };
      const shelf = { x: L.shelf.x, y: L.shelf.y, w: L.shelf.w, h: L.shelf.h };
      const bubble = rectL(document.getElementById('bubble')), hud = rectL(document.getElementById('hud'));
      const ms = (w.mounds || []).map(m => {
        const tw = (cfg.thingW && cfg.thingW[m.thing.kind]) || 0.8, top = Math.min(m.y - m.h0, m.state === 'empty' ? 1e9 : m.thingY - m.size);
        const vis = { x: m.x - m.w / 2, y: top, w: m.w, h: m.y - top }, c = w.moundHit(m.id);
        return { id: m.id, kind: m.thing.kind, v: m.thing.color || m.thing.shape || m.thing.animal || m.thing.text || m.thing.size, x: Math.round(m.x), y: Math.round(m.y), row: m.row,
          vis, hit: { x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.r) }, peekPx: Math.round(Math.max(0, m.clipY - (m.thingY - m.size))), size: Math.round(m.size), state: m.state };
      });
      const issues = [];
      for (const m of ms) {
        if (ov(m.vis, bun) > 0) issues.push(`mound ${m.id} vis overlaps Bun box by ${Math.round(ov(m.vis, bun))} px²`);
        const hb = { x: m.hit.x - m.hit.r, y: m.hit.y - m.hit.r, w: 2 * m.hit.r, h: 2 * m.hit.r };
        if (ov(m.vis, shelf) > 0) issues.push(`mound ${m.id} vis overlaps shelf (${Math.round(m.vis.y)} < shelf bottom ${Math.round(shelf.y + shelf.h)})`);
        if (bubble && ov(m.vis, bubble) > 0) issues.push(`mound ${m.id} vis overlaps bubble`);
        if (hud && ov(hb, hud) > 0) issues.push(`mound ${m.id} hit overlaps HUD`);
        if (m.vis.x < L.ins.left || m.vis.x + m.vis.w > L.W - L.ins.right) issues.push(`mound ${m.id} outside safe x`);
      }
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j], o = ov(a.vis, b.vis);
        if (o > 0.08 * a.vis.w * a.vis.h) issues.push(`mounds ${a.id}/${b.id} visual boxes overlap ${Math.round(100 * o / (a.vis.w * a.vis.h))}%`);
      }
      if (bubble && ov(bubble, shelf) > 0) issues.push('bubble overlaps shelf');
      if (bubble && hud && ov(bubble, hud) > 0) issues.push('bubble overlaps HUD');
      if (ov(bun, shelf) > 0) issues.push(`Bun box overlaps shelf by ${Math.round(ov(bun, shelf))} px²`);
      if (bubble && ov(bun, bubble) > 0) issues.push('Bun overlaps bubble');
      // vertical use of the screen (portrait emptiness): field top of the highest mound vs the shelf bottom
      const topMost = ms.length ? Math.min(...ms.map(m => m.vis.y)) : null;
      const gapAbove = topMost != null ? Math.round(topMost - (shelf.y + shelf.h)) : null;
      return { W: L.W, H: L.H, s: +v.s.toFixed(3), ins: L.ins, portrait: L.portrait, item: L.item, hitR: L.hitR, hitCss: Math.round(2 * L.hitR * v.s), groundY: L.groundY,
        bun: rnd(bun), shelf: rnd(shelf), bubble: rnd(bubble), hud: rnd(hud), rows: (L.rows || []).length, mounds: ms, gapAboveField: gapAbove,
        gapPct: gapAbove != null ? Math.round(100 * gapAbove / L.H) : null, issues };
      function rnd(b) { return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : null; }
    },
    // the colour of each buried thing's visible part vs the sand around it
    colours() {
      const w = W(), out = [];
      for (const m of w.mounds || []) {
        if (m.state !== 'buried') continue;
        const vt = m.thingY - m.size, cy = (vt + m.clipY) / 2;
        const t = sample(m.x + (m.thing.kind === 'egg' ? m.size * 0.08 : 0), cy, 2);
        const sand = sample(m.x + m.w * 0.3, m.y - m.h0 * 0.35, 3);
        const sky = sample(m.x, vt - 18, 3);
        out.push({ id: m.id, kind: m.thing.kind, v: m.thing.color || m.thing.shape || m.thing.animal || m.thing.text, thing: hex(t), sand: hex(sand), behind: hex(sky),
          crSand: +cr(t, sand).toFixed(2), dESand: Math.round(dE(t, sand)), dEBehind: Math.round(dE(t, sky)), peekPx: Math.round(m.clipY - vt) });
      }
      const pair = [];
      for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) pair.push({ a: out[i].v, b: out[j].v, dE: Math.round(dE(hex2(out[i].thing), hex2(out[j].thing))) });
      return { mood: DD.debug.weather.ambient.mood, things: out, pairs: pair };
    },
    // DOM text fit: overflowing elements, things outside the safe area, small targets
    dom() {
      const v = V(), sa = DD.debug.getState().ins, iss = [];
      const vw = innerWidth, vh = innerHeight, cs = getComputedStyle(document.getElementById('safeProbe'));
      const S = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
      document.querySelectorAll('.screen:not(.hidden) button, .screen:not(.hidden) h2, .screen:not(.hidden) .talk-q, #bubble:not(.hidden), #hud:not(.hidden) button, .screen:not(.hidden) .logo, .screen:not(.hidden) .set-row label, .screen:not(.hidden) .toggle').forEach(el => {
        const r = el.getBoundingClientRect(); if (!r.width || el.offsetParent === null) return;
        const name = (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 24) + '"';
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') iss.push(`${name} text overflows x (${el.scrollWidth} > ${el.clientWidth})`);
        if (el.tagName !== 'H2' && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && getComputedStyle(el).overflowY !== 'visible' && !el.classList.contains('scroll')) iss.push(`${name} text overflows y`);
        if (r.left < S.l - 1 || r.right > vw - S.r + 1 || r.top < S.t - 1 || r.bottom > vh - S.b + 1) iss.push(`${name} outside safe area [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
        if (el.tagName === 'BUTTON' && (r.width < 44 || r.height < 44)) iss.push(`${name} small target ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      const sc = document.querySelector('.screen:not(.hidden) .scroll');
      if (sc && sc.scrollHeight > sc.clientHeight + 2) iss.push(`panel needs scrolling: ${sc.scrollHeight} > ${sc.clientHeight}`);
      const panel = document.querySelector('.screen:not(.hidden) .panel');
      const pr = panel && panel.getBoundingClientRect();
      const bt = document.getElementById('bubbleText');
      return { issues: iss, panel: pr ? { x: Math.round(pr.left), y: Math.round(pr.top), w: Math.round(pr.width), h: Math.round(pr.height) } : null,
        bubbleFont: bt && !document.getElementById('bubble').classList.contains('hidden') ? parseFloat(getComputedStyle(bt).fontSize) : null,
        bubbleText: bt ? bt.textContent : '', choices: [...document.querySelectorAll('.talk-choices button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) };
    },
    tapMound(id) { const w = W(), p = w.moundTap(id); w.pointerDown(p.x, p.y); w.pointerUp(p.x, p.y); },
    wrongId() { const w = W(), a = w.answer(); const s = w.stepInfo; const t = s ? s.targets : []; const m = (w.mounds || []).find(q => q.state === 'buried' && !t.includes(q.id)); return m ? m.id : null; },
    fillShelf() {
      const w = W(), L = w.layout, T = [{ kind: 'egg', color: 'red' }, { kind: 'stone', shape: 'star', color: 'blue' }, { kind: 'toy', animal: 'duck' }, { kind: 'bone' },
        { kind: 'tablet', text: 'B' }, { kind: 'stone', shape: 'heart', color: 'pink' }, { kind: 'toy', animal: 'elephant' }, { kind: 'egg', color: 'green' },
        { kind: 'stone', shape: 'rect', color: 'orange' }, { kind: 'toy', animal: 'lion' }, { kind: 'tablet', text: '12' }, { kind: 'egg', color: 'purple' }];
      const dinos = { 0: 'red', 7: 'green', 11: 'purple' };
      w.shelfItems = T.map((thing, k) => { const sl = L.shelf.slots[k]; return { id: 900 + k, thing, dino: dinos[k] || null, slot: k, x: sl.x, y: sl.y, _px: sl.x, _py: sl.y, s: L.shelf.size, sx: 1, sy: 1, q: 0, qv: 0, bounce: 0, leave: 0, leaving: false, alpha: 1, _bT: -1 }; });
    },
    treasures() {
      const w = W(); const T = [['egg', 'red', 'red'], ['stone', 'star', null, 'yellow'], ['toy', 'duck'], ['bone'], ['egg', 'blue', 'blue'], ['tablet', 'A'], ['toy', 'cat'], ['stone', 'heart', null, 'pink'], ['egg', 'green', 'green'], ['toy', 'lion'], ['bone'], ['tablet', '7']];
      w.treasures = T.map(t => ({ thing: t[0] === 'egg' ? { kind: 'egg', color: t[1] } : t[0] === 'stone' ? { kind: 'stone', shape: t[1], color: t[3] } : t[0] === 'toy' ? { kind: 'toy', animal: t[1] } : t[0] === 'tablet' ? { kind: 'tablet', text: t[1] } : { kind: 'bone' }, dino: t[2] || null, level: 3, round: 1 }));
    },
    // per-frame motion trace at the current speed (for smoothness: the largest per-frame step and any reversals)
    trace(ms) {
      return new Promise(res => {
        const w = W(), rows = [], t0 = performance.now();
        const f = () => {
          const d = w.dig && w.moundById ? w.moundById(w.dig.id) : null, fl = w.flying[0], sh = w.shovel;
          rows.push({ t: Math.round(performance.now() - t0), dig: d ? +d.dig.toFixed(3) : null, thingY: d ? Math.round(d.thingY) : null, rise: d ? +d.rise.toFixed(2) : null,
            tsy: d ? +d.tsy.toFixed(2) : null, crack: d ? +d.crack.toFixed(2) : null, shx: sh ? Math.round(sh.x) : null, shy: sh ? Math.round(sh.y) : null, sha: sh ? +sh.angle.toFixed(2) : null, shs: sh ? sh.state : null,
            fx: fl ? Math.round(fl.x) : null, fy: fl ? Math.round(fl.y) : null, fs: fl ? Math.round(fl.s) : null, fsy: fl ? +fl.sy.toFixed(2) : null, sand: w.sand.length, phase: w.phase, shelf: w.shelfItems.length });
          if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(rows);
        };
        requestAnimationFrame(f);
      });
    }
  };
}

async function shot(page, name, opt = {}) { await page.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, opt)); }
async function round(page, topic, level = 0, roundIdx = 1) {
  await page.evaluate(([t, l, r]) => {
    const w = DD.debug.world;
    if (DD.debug.mode !== 'play') DD.debug.startGame();
    w.levels[l] = t; w.startLevel(l); DD.debug.setSpeed(8);
    if (r > 0) { w._skipToRound = r; }
  }, [topic, level, roundIdx]);
  // play the warm-up round with the bot so the round under test is a full one (more mounds)
  for (let k = 0; k < roundIdx; k++) {
    await until(page, () => DD.debug.world.state === 'round' && DD.debug.world.phase === 'dig' && DD.debug.answer(), null, 40000);
    await page.evaluate(() => { DD.debug.setBot(true, 1); });
    const r0 = await page.evaluate(() => DD.debug.world.round);
    await until(page, r => DD.debug.world.round > r || DD.debug.world.state === 'talk', r0, 60000);
    await page.evaluate(() => DD.debug.setBot(false));
  }
  await until(page, () => DD.debug.world.state === 'round' && DD.debug.world.phase === 'dig' && DD.debug.answer(), null, 40000);
  await page.evaluate(() => { DD.debug.setSpeed(1); DD.debug.world.mole = null; DD.debug.world.ptero = null; DD.debug.world._moleNext = -1; DD.debug.world._pteroNext = -1; });
  await sleep(500);
}
const G = (page, key) => page.evaluate(() => ({ geom: QA.geom(), dom: QA.dom() })).then(r => { geo[key] = r; return r; });

async function screens(browser, srv, dev, lang) {
  const { ctx, page } = await open(browser, srv, dev, lang, 4);
  const k = `${dev}-${lang}`;
  await sleep(600); await shot(page, `${k}-01-title`); geo[k + '-title'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => { DD.UI.refreshSettings && DD.UI.refreshSettings(); DD.UI.only('scrSettings'); }); await sleep(400);
  await shot(page, `${k}-02-settings`); geo[k + '-settings'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => DD.UI.only('scrTitle'));
  // chapter banner
  await page.evaluate(() => { DD.debug.startGame(); DD.debug.world.levels[0] = 'colors'; DD.debug.world.startLevel(0); }); await sleep(900);
  await shot(page, `${k}-03-banner`);
  await round(page, 'colors', 0, 1);
  await shot(page, `${k}-04-round`); await G(page, k + '-round');
  geo[k + '-round'].colours = await page.evaluate(() => QA.colours());
  // pause
  await page.evaluate(() => document.getElementById('btnPause').click()); await sleep(400);
  await shot(page, `${k}-05-pause`); geo[k + '-pause'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => document.getElementById('btnResume').click()); await sleep(300);
  // wrong dig → dimmed thing
  const wid = await page.evaluate(() => QA.wrongId());
  if (wid != null) {
    await page.evaluate(id => QA.tapMound(id), wid);
    await sleep(500); await shot(page, `${k}-06-digging`);
    await until(page, id => { const m = DD.debug.world.mounds.find(q => q.id === id); return m && m.dim > 0.3; }, wid, 15000); await sleep(300);
    await shot(page, `${k}-07-wrongdim`); await G(page, k + '-wrong');
  }
  // hint hand
  await page.evaluate(() => { const w = DD.debug.world; w._hintCool = 0; w.hint(); }); await sleep(700);
  await shot(page, `${k}-08-hint`);
  // right dig: reveal + hatch + hop
  const aid = await page.evaluate(() => DD.debug.answer().mound);
  await page.evaluate(id => QA.tapMound(id), aid);
  await until(page, id => { const m = DD.debug.world.mounds.find(q => q.id === id); return m && m.rise > 0.9; }, aid, 15000);
  await shot(page, `${k}-09-reveal`);
  await until(page, () => DD.debug.world.flying.length > 0, null, 15000); await sleep(120);
  await shot(page, `${k}-10-hop`);
  await until(page, () => DD.debug.world.shelfItems.length > 0, null, 15000);
  // full shelf
  await page.evaluate(() => QA.fillShelf()); await sleep(250);
  await shot(page, `${k}-11-fullshelf`); await G(page, k + '-fullshelf');
  // surprises
  await round(page, 'shapes', 0, 0);
  await page.evaluate(() => { const w = DD.debug.world; w.surprise = 'mole'; w._moleTimes = 0; w._moleNext = 0.05; });
  await until(page, () => DD.debug.world.mole && DD.debug.world.mole.up > 0.95, null, 15000).catch(() => {});
  await shot(page, `${k}-12-mole`);
  geo[k + '-mole'] = { mole: await page.evaluate(() => { const m = DD.debug.world.mole; return m ? { x: Math.round(m.x), y: Math.round(m.y), h: Math.round(m.h), hit: DD.debug.world.moleHit() } : null; }) };
  await page.evaluate(() => { const w = DD.debug.world; w.mole = null; w._moleNext = -1; w.surprise = 'ptero'; w._pteroPasses = 0; w._pteroNext = 0.05; });
  await until(page, () => { const p = DD.debug.world.ptero; return p && Math.abs(p.x - DD.debug.world.layout.W / 2) < 120; }, null, 20000).catch(() => {});
  await shot(page, `${k}-13-ptero`);
  geo[k + '-ptero'] = { ptero: await page.evaluate(() => { const w = DD.debug.world, p = w.ptero; return p ? { x: Math.round(p.x), y: Math.round(p.y), pteroY: w.layout.pteroY, shelfBottom: w.layout.shelf.y + w.layout.shelf.h, hit: w.pteroHit() } : null; }) };
  // Talk time
  await page.evaluate(() => { const w = DD.debug.world; w.ptero = null; w._pteroNext = -1; w._startTalk(); }); await sleep(900);
  await shot(page, `${k}-14-talk`); geo[k + '-talk'] = { dom: await page.evaluate(() => QA.dom()) };
  // session done (gallery of treasures)
  await page.evaluate(() => { const w = DD.debug.world; QA.treasures(); w.level = w.levels.length - 1; w._levelDone(); DD.debug.setSpeed(4); });
  await until(page, () => DD.debug.mode === 'done', null, 30000); await page.evaluate(() => DD.debug.setSpeed(1)); await sleep(1500);
  await shot(page, `${k}-15-done`); geo[k + '-done'] = { dom: await page.evaluate(() => QA.dom()) };
  if (page._errs.length) geo[k + '-errors'] = page._errs.slice(0, 10);
  await ctx.close();
}

async function topics(browser, srv, dev, lang) {
  for (const age of [3, 4, 5, 6, 7]) {
    const { ctx, page } = await open(browser, srv, dev, lang, age, 1, 20 + age);
    for (const [i, t] of AGE_TOPICS[age].entries()) {
      await round(page, t, i, 1);
      const k = `${dev}-${lang}-age${age}-${t}`;
      await shot(page, `${k}`); await G(page, k);
      geo[k].colours = await page.evaluate(() => QA.colours());
      geo[k].bubbleText = geo[k].dom.bubbleText;
    }
    if (page._errs.length) geo[`${dev}-${lang}-age${age}-errors`] = page._errs.slice(0, 10);
    await ctx.close();
  }
}

async function moods(browser, srv, dev) {
  const { ctx, page } = await open(browser, srv, dev, 'en', 4, 1, 9);
  for (const lv of [0, 1, 2, 3]) {
    await round(page, 'colors', lv, 1);
    await sleep(2600);   // weather crossfade 2.5 s
    const k = `${dev}-mood${lv}`;
    await shot(page, k); await G(page, k);
    geo[k].colours = await page.evaluate(() => QA.colours());
    // shapes too (the peeking clue of every stone on this mood)
    await round(page, 'shapes', lv, 1); await sleep(300);
    geo[k + '-shapes'] = { colours: await page.evaluate(() => QA.colours()) };
    await shot(page, k + '-shapes');
  }
  await ctx.close();
}

// frame sequences: the dig → reveal → hatch → hop of a right egg at 1/4 speed, clipped around the action, + a 1x trace
async function seq(browser, srv, dev) {
  const { ctx, page } = await open(browser, srv, dev, 'en', 4, 1, 5);
  await round(page, 'colors', 0, 1);
  const aid = await page.evaluate(() => DD.debug.answer().mound);
  const box = await page.evaluate(id => { const w = DD.debug.world, m = w.moundById(id), v = DD.debug.view(), L = w.layout;
    const x0 = Math.min(m.x - 230, L.shelf.x + 0), y0 = Math.min(L.shelf.y - 20, m.y - 400), x1 = m.x + 230, y1 = m.y + 30;
    return { x: Math.max(0, v.left + x0 * v.s), y: Math.max(0, v.top + y0 * v.s), width: Math.min(innerWidth, (x1 - x0) * v.s), height: Math.min(innerHeight, (y1 - y0) * v.s) }; }, aid);
  // 1x trace for motion numbers
  const trP = page.evaluate(() => QA.trace(4200));
  await page.evaluate(id => QA.tapMound(id), aid);
  geo[`${dev}-trace`] = await trP;
  // slow-mo frames of the next right dig (next round)
  await round(page, 'colors', 0, 1);
  const bid = await page.evaluate(() => DD.debug.answer().mound);
  const box2 = await page.evaluate(id => { const w = DD.debug.world, m = w.moundById(id), v = DD.debug.view(), L = w.layout;
    const x0 = Math.max(0, Math.min(m.x - 240, L.shelf.x)), y0 = Math.max(0, Math.min(L.shelf.y - 30, m.y - 420)), x1 = Math.min(L.W, Math.max(m.x + 240, L.field.x1)), y1 = Math.min(L.H, m.y + 40);
    return { x: v.left + x0 * v.s, y: v.top + y0 * v.s, width: (x1 - x0) * v.s, height: (y1 - y0) * v.s }; }, bid);
  await page.evaluate(id => { DD.debug.setSpeed(0.2); QA.tapMound(id); }, bid);
  const frames = [], shelf0 = await page.evaluate(() => DD.debug.world.shelfItems.length);
  for (let i = 0; i < 30; i++) {
    const b = await page.screenshot({ clip: box2 });
    const st = await page.evaluate(id => { const w = DD.debug.world, m = w.moundById(id); return { t: +w.time.toFixed(2), dig: m ? +m.dig.toFixed(2) : 0, rise: m ? +m.rise.toFixed(2) : 0, fly: w.flying.length, shelf: w.shelfItems.length, crack: m ? +m.crack.toFixed(2) : 0 }; }, bid);
    frames.push({ b, st });
    if (st.shelf > shelf0 && i > 4) break;
    await sleep(240);
  }
  await page.evaluate(() => DD.debug.setSpeed(1));
  await montage(browser, frames, path.join(OUT, `${dev}-seq-dig-hatch-hop.png`), 6);
  await ctx.close();
}
async function montage(browser, frames, file, cols) {
  const p = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const imgs = frames.map(f => ({ src: 'data:image/png;base64,' + f.b.toString('base64'), cap: `t ${f.st.t} dig ${f.st.dig} rise ${f.st.rise} crack ${f.st.crack} fly ${f.st.fly}` }));
  await p.setContent(`<body style="margin:0;background:#222;font:11px sans-serif;color:#fff"><div id=g style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:3px;width:1600px">${imgs.map(i => `<figure style="margin:0"><img src="${i.src}" style="width:100%"><figcaption>${i.cap}</figcaption></figure>`).join('')}</div></body>`);
  await sleep(300);
  await (await p.$('#g')).screenshot({ path: file, type: 'png' });
  await p.context().close();
}

async function hero(browser, srv) {
  for (const [dev, dpr, lv, lang] of [['ip-p', 3, 3, 'vi'], ['ip-l', 3, 2, 'en'], ['pad-p', 2, 1, 'vi']]) {
    const { ctx, page } = await open(browser, srv, dev, lang, 4, dpr, 7);
    await round(page, lv === 3 ? 'colors' : lv === 2 ? 'animals' : 'shapes', lv, 1); await sleep(2600);
    await shot(page, `hero-${dev}@${dpr}-mood${lv}-${lang}`);
    await ctx.close();
  }
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const t0 = Date.now();
  try {
    for (const dev of DEV_LIST) {
      if (PARTS.has('screens')) for (const lang of LANGS) { console.log('screens', dev, lang); await screens(browser, srv, dev, lang).catch(e => { console.log('  ERR', e.message.split('\n')[0]); geo[`${dev}-${lang}-fatal`] = e.message.split('\n')[0]; }); }
      if (PARTS.has('topics') && ['ip-p', 'ip-l', 'pad-p'].includes(dev)) for (const lang of LANGS) { console.log('topics', dev, lang); await topics(browser, srv, dev, lang).catch(e => { console.log('  ERR', e.message.split('\n')[0]); }); }
      if (PARTS.has('moods')) { console.log('moods', dev); await moods(browser, srv, dev).catch(e => console.log('  ERR', e.message.split('\n')[0])); }
      if (PARTS.has('seq') && ['ip-p', 'ip-l', 'pad-l'].includes(dev)) { console.log('seq', dev); await seq(browser, srv, dev).catch(e => console.log('  ERR', e.message.split('\n')[0])); }
    }
    if (PARTS.has('hero')) await hero(browser, srv);
  } finally {
    const gf = path.join(OUT, 'geometry.json');
    const prev = fs.existsSync(gf) ? JSON.parse(fs.readFileSync(gf, 'utf8')) : {};
    fs.writeFileSync(gf, JSON.stringify(Object.assign(prev, geo), null, 1));
    await browser.close(); srv.close();
    console.log('done in', Math.round((Date.now() - t0) / 1000), 's ->', OUT);
  }
  // curated copies for the report (KEEP list in tests/visual/keep.txt, one PNG name per line)
  const keepF = path.join(__dirname, 'keep.txt');
  if (fs.existsSync(keepF)) {
    fs.mkdirSync(REP, { recursive: true });
    for (const n of fs.readFileSync(keepF, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)) {
      const f = path.join(OUT, n.endsWith('.png') ? n : n + '.png'); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(REP, path.basename(f)));
    }
  }
})();
