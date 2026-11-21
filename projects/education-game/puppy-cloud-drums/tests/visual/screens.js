// Visual QA sweep (Bibi's Cloud Drums): every screen x 5 device shapes x EN/VI with emulated notch insets, every pool topic
// per age (3..7) in its chapter mood (chapter i -> morning / noon / sunset / night), the colour drums on all 4 moods, and
// in-page measurements (drum / hit sizes in CSS px, overlaps with Bibi / cymbal / bubble / HUD / garland / card / notch,
// cushion and drum contrast against the real rendered background, colour-pair rule, colour-blind distance).
//   node tests/visual/screens.js            -> tests/out/visual/*.png + geometry[-DEV].json + issues[-DEV].txt
//   DEV=ip-p,pad-l  LANGS=en  PART=screens,topics,moods  AGES=3,4  DPR=1|native  (subsets; run devices in parallel with DEV=…)
// Report-only: drives the page through CD.debug and world input calls, never edits game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'out', 'visual'); fs.mkdirSync(OUT, { recursive: true });
// insets in CSS px [top, right, bottom, left]: notch iPhone 59/0/34/0 portrait, 0/59/21/59 landscape; iPad status bar + home bar
const DEVS = {
  'ip-p': { vp: [393, 852], ins: [59, 0, 34, 0], dpr: 3 }, 'ip-l': { vp: [852, 393], ins: [0, 59, 21, 59], dpr: 3 },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0], dpr: 2 }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0], dpr: 2 },
  'tall': { vp: [360, 880], ins: [48, 0, 34, 0], dpr: 3 }   // a tall narrow portrait phone (H/W 2.44)
};
const POOLS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'size', 'shapes', 'count', 'animals'],
  5: ['colors', 'shapes', 'count', 'letters', 'animals'], 6: ['letters', 'lower', 'initial', 'add', 'count'],
  7: ['count', 'initial', 'add', 'sub', 'oddeven'] };
const env = (k, d) => (process.env[k] ? process.env[k].split(',') : d);
const DEV_LIST = env('DEV', ['ip-p', 'ip-l', 'pad-p', 'pad-l']), LANGS = env('LANGS', ['en', 'vi']);
const PARTS = new Set(env('PART', ['screens', 'topics', 'moods'])), AGES = env('AGES', ['3', '4', '5', '6', '7']).map(Number);
const NATIVE = process.env.DPR === 'native';
const until = (page, fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const geo = {};

async function open(browser, srv, dev, lang, age, seed = 5) {
  const d = DEVS[dev];
  const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: NATIVE ? d.dpr : 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page._errs = []; page.on('pageerror', e => page._errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page._errs.push(m.text()); });
  await page.goto(srv.url + `?mute=1&novoice=1&seed=${seed}&age=${age}&lang=${lang}`);
  await until(page, () => window.CD && CD.debug && CD.debug.mode === 'title');
  // notch emulation: the safe-area vars drive #safeProbe (main.js readInsets) and every CSS inset
  await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(450);
  await page.evaluate(installProbe);
  return { ctx, page };
}

// in-page measurements (logical px; DOM rects converted with CD.debug.view())
function installProbe() {
  const W = () => CD.debug.world, V = () => CD.debug.view();
  const rectL = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || el.classList.contains('hidden') || el.closest('.hidden')) return null; const v = V(); return { x: (r.left - v.left) / v.s, y: (r.top - v.top) / v.s, w: r.width / v.s, h: r.height / v.s }; };
  const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
  const rnd = b => b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : null;
  const BAD = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const cr = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  // sample the rendered canvas at logical (x, y): average of a 5x5 css-px patch
  function sample(x, y) {
    const cv = document.getElementById('game'), v = V(), r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const px = Math.round(((v.left + x * v.s) - r.left) * k), py = Math.round(((v.top + y * v.s) - r.top) * k), n = Math.max(2, Math.round(2 * k));
    if (![px, py, n].every(Number.isFinite)) { window.__nan = [x, y, v.left, v.s, k]; return null; }
    if (px < n || py < n || px >= cv.width - n || py >= cv.height - n) return null;
    const d = cv.getContext('2d').getImageData(px - n, py - n, 2 * n + 1, 2 * n + 1).data; let s = [0, 0, 0], c = 0;
    for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; c++; }
    return s.map(q => Math.round(q / c));
  }
  window.QA = {
    geom() {
      const w = W(), L = w.layout, v = V(), iss = [], phone = Math.min(innerWidth, innerHeight) < 500;
      const hud = rectL(document.getElementById('hud')), bubble = rectL(document.getElementById('bubble'));
      const kb = L.bibiBox, cb = L.cymbalBox, P = CD.PALETTE || {};
      const ch = (w.drums || []).filter(c => c.state === 'stand' || c.state === 'enter').map(c => {
        const box = { x: c.cx - c.bw / 2, y: c.cy - c.bh / 2, w: c.bw, h: c.bh };
        const cush = { x: c.padX - c.cushionW / 2, y: c.padY, w: c.cushionW, h: c.cushionH };
        return { id: c.id, cx: c.cx, cy: c.cy, bh: c.bh, kind: c.thing.kind, color: c.thing.color || null, shape: c.thing.shape || null, animal: c.thing.animal || null, text: c.thing.text || null, n: c.thing.n,
          size: Math.round(c.size), box, cush, visCss: Math.round(Math.max(c.bw, c.bh) * v.s), sizeCss: Math.round(c.size * v.s), hitCss: Math.round(2 * w._hitR(c) * v.s) };
      });
      // background samples: beside the drum band (no drum) at body height and under each cushion's side
      for (const c of ch) {
        const a = c.box.w * c.box.h;
        if (ov(c.box, kb) > 0) iss.push(`drum ${c.id} (${c.kind}) overlaps Bibi box ${Math.round(100 * ov(c.box, kb) / a)}%`);
        if (ov(c.box, cb) > 0 || ov(c.cush, cb) > 0) iss.push(`drum/cushion ${c.id} overlaps cymbal box`);
        if (hud && ov(c.box, hud) > 0) iss.push(`drum ${c.id} under HUD`);
        if (bubble && ov(c.box, bubble) > 0) iss.push(`drum ${c.id} under bubble`);
        if (w.card && ov(c.box, { x: w.card.x - w.card.w / 2, y: w.card.y - w.card.h / 2, w: w.card.w, h: w.card.h }) > 0) iss.push(`drum ${c.id} overlaps card`);
        if (c.box.x < L.ins.left || c.box.x + c.box.w > L.W - L.ins.right || c.cush.y + c.cush.h > L.groundY) iss.push(`drum ${c.id} outside safe/ground`);
        if (c.box.y < L.ins.top) iss.push(`drum ${c.id} top under notch`);
        if (phone && c.hitCss < 100) iss.push(`drum ${c.id} hit ${c.hitCss} css px < 100`);
        if (c.visCss < 60) iss.push(`drum ${c.id} visible ${c.visCss} css px < 60`);
        // contrast: drum colour vs background beside it, cushion vs floor/sky below it
        const bgL = sample(c.box.x - 14, c.box.y + c.box.h * 0.5), bgR = sample(c.box.x + c.box.w + 14, c.box.y + c.box.h * 0.5);
        const body = sample(c.cx, c.cy + c.bh * 0.25), cushMid = sample(c.cush.x + c.cush.w / 2, c.cush.y + c.cush.h * 0.55), below = sample(c.cush.x + c.cush.w / 2, c.cush.y + c.cush.h + 16);
        c.samples = { bgL, bgR, body, cushMid, below };
        if (c.color && P[c.color]) {
          const base = hex(Array.isArray(P[c.color]) ? P[c.color][0] : (P[c.color].base || P[c.color]));
          const bgs = [bgL, bgR].filter(Boolean); if (bgs.length) { c.colCR = +Math.min(...bgs.map(b => cr(base, b))).toFixed(2); c.colDist = Math.min(...bgs.map(b => dist(base, b))); }
        }
        if (cushMid && below) { c.cushCR = +cr(cushMid, below).toFixed(2); c.cushDist = dist(cushMid, below); if (c.cushDist < 30) iss.push(`cushion ${c.id} blends with what is under it (dist ${c.cushDist}, CR ${c.cushCR})`); }
      }
      const lan = (w.lanterns || []).map(l => ({ x: Math.round(l.x), y: Math.round(l.y) }));
      for (const l of lan) {
        const lb = { x: l.x - 24, y: l.y - 30, w: 48, h: 60 };
        if (hud && ov(lb, hud) > 0) iss.push(`lantern at ${l.x},${l.y} under HUD`);
        if (bubble && ov(lb, bubble) > 0) iss.push(`lantern at ${l.x},${l.y} under bubble`);
        if (lb.y < L.ins.top) iss.push(`lantern at ${l.x},${l.y} under notch/top inset`);
        for (const c of ch) if (ov(lb, c.box) > 0) iss.push(`lantern at ${l.x},${l.y} overlaps drum ${c.id}`);
      }
      let card = null;
      if (w.card) {
        const cbx = { x: w.card.x - w.card.w / 2, y: w.card.y - w.card.h / 2, w: w.card.w, h: w.card.h }; card = Object.assign(rnd(cbx), { mode: w.card.mode, n: w.card.n, hCss: Math.round(w.card.h * v.s) });
        if (bubble && ov(cbx, bubble) > 0) iss.push('card under bubble'); if (hud && ov(cbx, hud) > 0) iss.push('card under HUD');
        if (ov(cbx, kb) > 0) iss.push('card overlaps Bibi'); if (cbx.x < L.ins.left || cbx.x + cbx.w > L.W - L.ins.right) iss.push('card off screen');
        for (const l of lan) if (ov({ x: l.x - 24, y: l.y - 30, w: 48, h: 60 }, cbx) > 0) iss.push('card overlaps a lantern');
      }
      if (bubble && hud && ov(bubble, hud) > 0) iss.push('bubble overlaps HUD');
      if (bubble && ov(bubble, kb) > 0) iss.push('bubble overlaps Bibi');
      if (ov(kb, cb) > 0) iss.push(`Bibi box overlaps cymbal box by ${Math.round(ov(kb, cb))} px²`);
      if (bubble && bubble.y < L.ins.top) iss.push('bubble under top inset');
      if (bubble && bubble.y + bubble.h > L.garland.y - 20) iss.push(`garland (y ${Math.round(L.garland.y)}) within 20 px of bubble bottom ${Math.round(bubble.y + bubble.h)}`);
      const cols = ch.map(c => c.color).filter(Boolean);
      if (w.age < 5) for (const [p, q] of BAD) if (cols.includes(p) && cols.includes(q)) iss.push(`colour pair ${p}+${q} at age ${w.age}`);
      const low = ch.length ? Math.max(...ch.map(c => c.cush.y + c.cush.h)) : 0;
      return { W: L.W, H: L.H, s: +v.s.toFixed(3), ins: L.ins, item: L.item, zig: L.zig, tight: L.tight, hitPad: L.hitPad, mood: CD.debug.weather.ambient && CD.debug.weather.ambient.mood,
        garlandY: Math.round(L.garland.y), groundY: Math.round(L.groundY), bibi: rnd(kb), cymbal: rnd(cb), hud: rnd(hud), bubble: rnd(bubble), card,
        lowestCushion: Math.round(low), gapCushionToGround: Math.round(L.groundY - low), gapToBibiHead: Math.round(kb.y - low),
        drums: ch.map(c => ({ id: c.id, kind: c.kind, color: c.color, shape: c.shape, animal: c.animal, text: c.text, n: c.n, size: c.size, sizeCss: c.sizeCss, visCss: c.visCss, hitCss: c.hitCss,
          colCR: c.colCR, colDist: c.colDist, cushCR: c.cushCR, cushDist: c.cushDist, box: rnd(c.box), cush: rnd(c.cush), samples: c.samples })),
        lanterns: lan, issues: iss };
    },
    dom() {
      const iss = [], vw = innerWidth, vh = innerHeight, cs = getComputedStyle(document.getElementById('safeProbe')), phone = Math.min(vw, vh) < 500;
      const S = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
      const btns = [];
      document.querySelectorAll('.screen:not(.hidden) button, .screen:not(.hidden) h2, .screen:not(.hidden) h1, .screen:not(.hidden) p, #bubble:not(.hidden), #hud:not(.hidden) button, #hud:not(.hidden) > *').forEach(el => {
        const r = el.getBoundingClientRect(); if (!r.width || el.offsetParent === null) return;
        const name = (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 24) + '"';
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') iss.push(`${name} text overflows x (${el.scrollWidth} > ${el.clientWidth})`);
        if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && getComputedStyle(el).overflowY !== 'visible' && !el.classList.contains('scroll')) iss.push(`${name} text overflows y (${el.scrollHeight} > ${el.clientHeight})`);
        if (r.left < S.l - 1 || r.right > vw - S.r + 1 || r.top < S.t - 1 || r.bottom > vh - S.b + 1) iss.push(`${name} outside safe area [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
        if (el.tagName === 'BUTTON') { btns.push([name, Math.round(r.width), Math.round(r.height)]); if (r.width < 44 || r.height < 44) iss.push(`${name} small target ${Math.round(r.width)}x${Math.round(r.height)}`); }
      });
      const bt = document.getElementById('bubbleText'), bub = document.getElementById('bubble');
      const choices = [...document.querySelectorAll('#scrTalk:not(.hidden) #talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      if (phone) choices.forEach(([cw, chh], i) => { if (Math.min(cw, chh) < 100) iss.push(`talk choice ${i} ${cw}x${chh} < 100 css px on a phone`); });
      const panel = document.querySelector('.screen:not(.hidden) .panel'), pr = panel && panel.getBoundingClientRect();
      if (panel && panel.scrollHeight > panel.clientHeight + 2) iss.push(`panel scrolls (${panel.scrollHeight} > ${panel.clientHeight})`);
      const bubVis = bt && !bub.classList.contains('hidden');
      if (bubVis && (bt.scrollHeight > bub.clientHeight + 2)) iss.push(`bubble text taller than bubble (${bt.scrollHeight} > ${bub.clientHeight})`);
      return { issues: iss, buttons: btns, choices, panel: pr ? [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)] : null,
        bubbleFont: bubVis ? parseFloat(getComputedStyle(bt).fontSize) : null, bubbleText: bt ? bt.textContent : '',
        bubbleBox: bubVis ? (r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)])(bub.getBoundingClientRect()) : null,
        bubbleTextH: bubVis ? Math.round(bt.scrollHeight) : null };
    },
    tap(id, dx = 0) { const w = W(), c = w.drumHit(id); w.pointerDown(c.x + dx, c.y); w.pointerUp(c.x + dx, c.y); },
    other() { const w = W(), a = w.answer(); const o = w.drums.find(c => c.state === 'stand' && !c.done && c.id !== (a && a.drum)); return o ? o.id : null; }
  };
}

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png') }); }
const G = (page, key, extra = {}) => page.evaluate(() => ({ geom: QA.geom(), dom: QA.dom() })).then(r => { geo[key] = Object.assign(r, extra); return r; });
const quiet = page => page.evaluate(() => { const w = CD.debug.world; w.hintHand = null; w._idleT = -1e6; w._lambNext = -1; w._birdNext = -1; w._firefliesNext = -1; w.lamb = null; w.bird = null; w.fireflies = []; });
const waitEv = (page, type, t = 15000) => until(page, ty => CD.debug.events.some(e => e.type === ty && e.t > (window.__evT || 0)), type, t);
const markEv = page => page.evaluate(() => { window.__evT = CD.debug.world.time; });

/** Start chapter `level` with `topic`, bot-play `skip` rounds fast, stop at the first open ask of the next round. */
async function round(page, topic, level = 0, skip = 1) {
  await page.evaluate(([t, l]) => {
    const w = CD.debug.world;
    if (CD.debug.mode !== 'play') CD.debug.startGame();
    w.levels[l] = t; w.startLevel(l); CD.debug.setSpeed(8);
  }, [topic, level]);
  for (let k = 0; k < skip; k++) {
    await until(page, () => CD.debug.world.interactive && CD.debug.answer(), null, 40000);
    const r0 = await page.evaluate(() => { CD.debug.setBot(true, 1); return CD.debug.world.round; });
    await until(page, r => CD.debug.world.round > r || CD.debug.world.state === 'talk', r0, 60000);
    await page.evaluate(() => CD.debug.setBot(false));
  }
  await until(page, () => CD.debug.world.interactive && CD.debug.answer(), null, 40000);
  await page.evaluate(() => CD.debug.setSpeed(1)); await quiet(page);
  await sleep(2700);   // weather crossfade 2.5 s; drums settle
  await quiet(page);
}

async function step(page, k, name, fn) { try { await fn(); } catch (e) { geo[`${k}-${name}-fatal`] = e.message.split('\n')[0]; console.log('  ERR', k, name, e.message.split('\n')[0]); } }

async function screens(browser, srv, dev, lang) {
  const { ctx, page } = await open(browser, srv, dev, lang, 4);
  const k = `${dev}-${lang}`;
  await sleep(600); await shot(page, `${k}-01-title`); geo[k + '-title'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => { CD.UI.refreshSettings && CD.UI.refreshSettings(); CD.UI.only('scrSettings'); }); await sleep(450);
  await shot(page, `${k}-02-settings`); geo[k + '-settings'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => CD.UI.only('scrTitle'));
  await page.evaluate(() => { CD.debug.startGame(); const w = CD.debug.world; w.levels[0] = 'colors'; w.startLevel(0); }); await sleep(1000);
  await shot(page, `${k}-03-banner`);
  await step(page, k, 'play', async () => {
    await round(page, 'colors', 0, 1);
    await shot(page, `${k}-04-play`); await G(page, k + '-play');
    const oid = await page.evaluate(() => QA.other());
    if (oid != null) { await page.evaluate(id => QA.tap(id, -30), oid); await sleep(200); await shot(page, `${k}-05-wrong`); await sleep(1600); }
    const aid = await page.evaluate(() => CD.debug.answer() && CD.debug.answer().drum);
    if (aid != null) {
      await page.evaluate(id => QA.tap(id, -30), aid); await sleep(170); await shot(page, `${k}-06-right-bounce`);
      await sleep(800); await shot(page, `${k}-07-lantern`);
    }
    await until(page, () => CD.debug.world.interactive && CD.debug.answer(), null, 15000).catch(() => {});
    await page.evaluate(() => { const w = CD.debug.world; w._lastHintT = -1e9; w.hint(); }); await sleep(700);
    await shot(page, `${k}-08-hint`);
    await page.evaluate(() => { CD.debug.world.hintHand = null; });
  });
  await step(page, k, 'surprises', async () => {
    await page.evaluate(() => { const w = CD.debug.world; w.surprise = 'lamb'; w._lambNext = 0.02; });
    await until(page, () => { const h = CD.debug.world.lamb; return h && h.state === 'sniff'; }, null, 20000);
    await shot(page, `${k}-09-lamb`);
    await page.evaluate(() => { const w = CD.debug.world, h = w.lambHit(); if (h) { w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); } }); await sleep(300);
    await shot(page, `${k}-09b-lamb-ball`);
    await quiet(page);
    await page.evaluate(() => { const w = CD.debug.world; w.surprise = 'bird'; w._birdNext = 0.02; });
    await until(page, () => { const b = CD.debug.world.bird; return b && b.state === 'perch'; }, null, 20000);
    await sleep(300); await shot(page, `${k}-10-bird`);
    await quiet(page); await page.evaluate(() => { CD.debug.world.surprise = null; });
  });
  await step(page, k, 'pause', async () => {
    await page.evaluate(() => document.getElementById('btnPause').click()); await sleep(450);
    await shot(page, `${k}-11-pause`); geo[k + '-pause'] = { dom: await page.evaluate(() => QA.dom()) };
    await page.evaluate(() => document.getElementById('btnResume').click()); await sleep(300);
  });
  await step(page, k, 'song', async () => {
    await page.evaluate(() => CD.debug.setBot(true, 1));
    await until(page, () => CD.debug.world.phase === 'song', null, 30000);
    await page.evaluate(() => CD.debug.setBot(false));
    await sleep(1300); await shot(page, `${k}-12-songask`);
    await markEv(page);
    await page.evaluate(() => { const w = CD.debug.world, c = w.drums.filter(q => q.state === 'stand'); const a = w.drumHit(c[0].id); w.pointerDown(a.x, a.y); w.pointerUp(a.x, a.y); });
    await sleep(380); await shot(page, `${k}-13-wave`);
    await waitEv(page, 'cymbal'); await sleep(120); await shot(page, `${k}-14-cymbal`);
  });
  await step(page, k, 'beat', async () => {   // age-4 beat mode (count) in chapter 2 = sunset
    await round(page, 'count', 2, 1);
    await shot(page, `${k}-15-beat`); await G(page, k + '-beat');
    const cid = await page.evaluate(() => CD.debug.answer() && CD.debug.answer().drum);
    if (cid != null) { await page.evaluate(id => QA.tap(id), cid); await sleep(320); await page.evaluate(id => QA.tap(id), cid); await sleep(160); await shot(page, `${k}-16-beat-lit`); }
  });
  await step(page, k, 'night', async () => {
    await round(page, 'animals', 3, 1);
    await page.evaluate(() => { const w = CD.debug.world; w.surprise = 'fireflies'; w._firefliesNext = 0.02; }); await sleep(2600);
    await shot(page, `${k}-17-night-stars`); await G(page, k + '-night');
    await quiet(page);
  });
  await step(page, k, 'talk', async () => {
    await page.evaluate(() => { CD.debug.world._startTalk(); }); await sleep(1100);
    await shot(page, `${k}-18-talk`); geo[k + '-talk'] = { dom: await page.evaluate(() => QA.dom()) };
    await page.evaluate(() => { const w = CD.debug.world; w.talkAnswer(w.talk.answer); }); await sleep(700);
    await shot(page, `${k}-19-talk-right`);
    await until(page, () => CD.debug.world.state === 'levelDone', null, 8000).catch(() => {}); await sleep(700);
    await shot(page, `${k}-20-leveldone`);
  });
  await step(page, k, 'done', async () => {
    await page.evaluate(() => { const w = CD.debug.world; if (w.songs.length < 6) for (let i = 0; i < 12; i++) w.songs.push({ level: i >> 2, notes: [0, 1, 2], colors: [['red', 'blue', 'yellow'], [null, null, null], ['green', 'purple', 'pink'], [null, 'pink', null]][i % 4] });
      w.level = w.levels.length - 1; w._levelDone(); CD.debug.setSpeed(4); });
    await until(page, () => CD.debug.mode === 'done', null, 30000); await page.evaluate(() => CD.debug.setSpeed(1)); await sleep(4500);
    await shot(page, `${k}-21-done`); geo[k + '-done'] = { dom: await page.evaluate(() => QA.dom()) };
  });
  if (page._errs.length) geo[k + '-errors'] = page._errs.slice(0, 10);
  await ctx.close();
}

async function topics(browser, srv, dev, lang) {
  for (const age of AGES) {
    const { ctx, page } = await open(browser, srv, dev, lang, age, 20 + age);
    for (const [i, t] of POOLS[age].entries()) {
      const lv = i % 4, k = `${dev}-${lang}-age${age}-${i}-${t}`;
      try { await round(page, t, lv, 2); await shot(page, k); await G(page, k, { mood: lv }); }
      catch (e) { geo[k + '-fatal'] = e.message.split('\n')[0]; console.log('  ERR', k, e.message.split('\n')[0]); }
    }
    if (page._errs.length) geo[`${dev}-${lang}-age${age}-errors`] = page._errs.slice(0, 10);
    await ctx.close();
  }
}

// every mood x the colour-critical drums: age-4 colours (≤ 3 safe colours), age-5 colours (pink / purple), age-5 shapes, age-4 beat
async function moods(browser, srv, dev) {
  for (const [age, t, seed] of [[4, 'colors', 31], [5, 'colors', 32], [5, 'shapes', 33], [4, 'count', 34], [3, 'animals', 35]]) {
    const { ctx, page } = await open(browser, srv, dev, 'en', age, seed);
    for (const lv of [0, 1, 2, 3]) {
      const k = `${dev}-mood${lv}-age${age}-${t}`;
      try { await round(page, t, lv, 1); await shot(page, k); await G(page, k, { mood: lv }); } catch (e) { geo[k + '-fatal'] = e.message.split('\n')[0]; }
    }
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
      if (PARTS.has('topics')) for (const lang of LANGS) { console.log('topics', dev, lang); await topics(browser, srv, dev, lang).catch(e => console.log('  ERR', e.message.split('\n')[0])); }
      if (PARTS.has('moods')) { console.log('moods', dev); await moods(browser, srv, dev).catch(e => console.log('  ERR', e.message.split('\n')[0])); }
    }
  } finally {
    const tag = process.env.DEV ? '-' + DEV_LIST.join('_') + (NATIVE ? '-native' : '') : '';
    const gf = path.join(OUT, `geometry${tag}.json`);
    const prev = fs.existsSync(gf) ? JSON.parse(fs.readFileSync(gf, 'utf8')) : {};
    const all = Object.assign(prev, geo);
    fs.writeFileSync(gf, JSON.stringify(all, null, 1));
    const issues = Object.entries(all).flatMap(([k, v]) => [...((v.geom && v.geom.issues) || []), ...((v.dom && v.dom.issues) || [])].map(i => k + ': ' + i));
    Object.entries(all).filter(([k]) => /errors|fatal/.test(k)).forEach(([k, v]) => issues.push(k + ': ' + JSON.stringify(v)));
    fs.writeFileSync(path.join(OUT, `issues${tag}.txt`), issues.join('\n') + '\n');
    await browser.close(); srv.close();
    console.log('done in', Math.round((Date.now() - t0) / 1000), 's ->', OUT, '|', issues.length, 'issues');
  }
})();
