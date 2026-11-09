// Visual QA sweep (Pom's Puzzle Town): every screen x 4 device shapes x EN/VI with emulated notch insets, every topic per
// age (3..7), all 4 seasons x 3 board scenes, and in-page geometry measurements (overlaps, safe area, target sizes).
//   node tests/visual/screens.js            -> tests/out/visual/*.png + geometry[-DEV].json + issues[-DEV].txt
//   (≈ 9 min per device; run the 4 devices in parallel with DEV=ip-p / ip-l / pad-p / pad-l)
//   DEV=ip-p,pad-l  LANGS=en  PART=screens,topics,seasons   (subsets)
// Report-only: drives the page through PZ.debug / PZ.UI and world input calls, never edits game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'out', 'visual'); fs.mkdirSync(OUT, { recursive: true });
// insets in CSS px: notch phones 47/0/34/0 portrait, 0/47/21/47 landscape; iPad: status bar + home indicator
const DEVS = {
  'ip-p': { vp: [393, 852], ins: [47, 0, 34, 0], dpr: 2 }, 'ip-l': { vp: [852, 393], ins: [0, 47, 21, 47], dpr: 2 },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0], dpr: 1 }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0], dpr: 1 }
};
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'], 5: ['shapes', 'count', 'letters', 'animals'],
  6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const env = (k, d) => (process.env[k] ? process.env[k].split(',') : d);
const DEV_LIST = env('DEV', Object.keys(DEVS)), LANGS = env('LANGS', ['en', 'vi']), PARTS = new Set(env('PART', ['screens', 'topics', 'seasons']));
const until = (page, fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const geo = {};

async function open(browser, srv, dev, lang, age, seed = 5) {
  const d = DEVS[dev];
  const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page._errs = []; page.on('pageerror', e => page._errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page._errs.push(m.text()); });
  await page.goto(srv.url + `?mute=1&novoice=1&seed=${seed}&age=${age}&lang=${lang}`);
  await until(page, () => window.PZ && PZ.debug && PZ.debug.mode === 'title');
  await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(450);
  await page.evaluate(installProbe);
  return { ctx, page };
}

// in-page measurements (logical px; DOM rects converted with PZ.debug.view())
function installProbe() {
  const W = () => PZ.debug.world, V = () => PZ.debug.view();
  const rectL = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || el.closest('.hidden')) return null; const v = V(); return { x: (r.left - v.left) / v.s, y: (r.top - v.top) / v.s, w: r.width / v.s, h: r.height / v.s }; };
  const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
  const rnd = b => b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : null;
  window.QA = {
    geom() {
      const w = W(), L = w.layout, v = V(), iss = [];
      const fr = L.frame, B = L.board, boardF = { x: B.x - fr, y: B.y - fr, w: B.w + 2 * fr, h: B.h + 2 * fr };
      const hud = rectL(document.getElementById('hud')), bubble = rectL(document.getElementById('bubble'));
      const pom = L.pomBox;
      const pcs = (w.pieces || []).filter(p => p.state === 'rest' || p.state === 'drop').map(p => ({ id: p.id, x: p.homeX, y: p.homeY, s: p.size,
        box: { x: p.homeX - (p.boxW || p.size) / 2, y: p.homeY - (p.boxH || p.size) / 2, w: p.boxW || p.size, h: p.boxH || p.size }, hitCss: Math.round(2 * w._hitR(p) * v.s), visCss: Math.round(p.size * v.s) }));
      const slots = (w.slots || []).map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), size: Math.round(s.size), css: Math.round(s.size * v.s),
        box: { x: s.x - s.size / 2, y: s.y - s.size / 2, w: s.size, h: s.size } }));
      for (const p of pcs) {
        if (ov(p.box, pom) > 0.05 * p.s * p.s) iss.push(`piece ${p.id} overlaps Pom box ${Math.round(100 * ov(p.box, pom) / (p.s * p.s))}%`);
        if (ov(p.box, boardF) > 0) iss.push(`tray piece ${p.id} overlaps board frame`);
        if (p.box.x < L.ins.left || p.box.x + p.box.w > L.W - L.ins.right || p.box.y + p.box.h > L.H - L.ins.bottom) iss.push(`piece ${p.id} outside safe area`);
        if (p.hitCss < 100) iss.push(`piece ${p.id} hit ${p.hitCss} css px < 100`);
        if (p.visCss < 70) iss.push(`piece ${p.id} drawn ${p.visCss} css px`);
      }
      for (const s of slots) {
        if (hud && ov(s.box, hud) > 0) iss.push(`slot ${s.id} under HUD`);
        if (bubble && ov(s.box, bubble) > 0) iss.push(`slot ${s.id} under bubble`);
      }
      if (hud && ov(hud, boardF) > 0) iss.push(`HUD overlaps board frame by ${Math.round(ov(hud, boardF))} px²`);
      if (bubble && ov(bubble, boardF) > 0) iss.push('bubble overlaps board frame');
      if (bubble && hud && ov(bubble, hud) > 0) iss.push('bubble overlaps HUD');
      if (bubble && ov(bubble, pom) > 0) iss.push('bubble overlaps Pom');
      if (ov(pom, boardF) > 0) iss.push(`Pom box overlaps board frame by ${Math.round(ov(pom, boardF))} px²`);
      const g = w.pigeon;
      let pigeon = null;
      if (g) {
        const pb = { x: g.x - g.size / 2, y: g.y - g.size * 0.875, w: g.size, h: g.size * 0.875 };
        pigeon = rnd(pb);
        for (const p of pcs) if (ov(pb, p.box) > 0) iss.push(`pigeon overlaps tray piece ${p.id} by ${Math.round(100 * ov(pb, p.box) / (p.s * p.s))}%`);
        for (const r of L.tray.rows) { const ledge = { x: r.x0, y: r.y - 6, w: r.x1 - r.x0, h: 22 }; if (ov(pb, ledge) > 0 && r.y < L.groundY - 4) iss.push(`pigeon crosses tray shelf at y ${Math.round(r.y)}`); }
        if (ov(pb, pom) > 0) iss.push('pigeon overlaps Pom');
      }
      const gap = Math.round(L.tray.y - (B.y + B.h + fr));
      return { W: L.W, H: L.H, s: +v.s.toFixed(3), ins: L.ins, item: L.item, board: rnd(B), tray: rnd(L.tray), rows: L.tray.rows.map(r => ({ x0: Math.round(r.x0), x1: Math.round(r.x1), y: Math.round(r.y) })),
        pom: rnd(pom), hud: rnd(hud), bubble: rnd(bubble), pigeon, pieces: pcs.map(p => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), s: p.s, hitCss: p.hitCss, visCss: p.visCss })), slots: slots.map(s => ({ id: s.id, x: s.x, y: s.y, css: s.css })),
        boardToTrayGap: gap, issues: iss };
    },
    dom() {
      const iss = [], vw = innerWidth, vh = innerHeight, cs = getComputedStyle(document.getElementById('safeProbe'));
      const S = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
      document.querySelectorAll('.screen:not(.hidden) button, .screen:not(.hidden) h2, .screen:not(.hidden) h1, .screen:not(.hidden) p, #bubble:not(.hidden), #hud:not(.hidden) button, #hud:not(.hidden) > *').forEach(el => {
        const r = el.getBoundingClientRect(); if (!r.width || el.offsetParent === null) return;
        const name = (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 24) + '"';
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') iss.push(`${name} text overflows x (${el.scrollWidth} > ${el.clientWidth})`);
        if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && getComputedStyle(el).overflowY !== 'visible' && !el.classList.contains('scroll')) iss.push(`${name} text overflows y`);
        if (r.left < S.l - 1 || r.right > vw - S.r + 1 || r.top < S.t - 1 || r.bottom > vh - S.b + 1) iss.push(`${name} outside safe area [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
        if (el.tagName === 'BUTTON' && (r.width < 60 || r.height < 60)) iss.push(`${name} small target ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      const bt = document.getElementById('bubbleText'), bub = document.getElementById('bubble');
      const choices = [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      const panel = document.querySelector('.screen:not(.hidden) .panel'), pr = panel && panel.getBoundingClientRect();
      return { issues: iss, choices, panel: pr ? [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)] : null,
        bubbleFont: bt && !bub.classList.contains('hidden') ? parseFloat(getComputedStyle(bt).fontSize) : null, bubbleText: bt ? bt.textContent : '',
        bubbleLines: bt && !bub.classList.contains('hidden') ? Math.round(bt.getBoundingClientRect().height / (parseFloat(getComputedStyle(bt).lineHeight) || parseFloat(getComputedStyle(bt).fontSize) * 1.2)) : null };
    },
    // drag helpers through the world (logical px)
    grab(id, dx = 0, dy = -140) { const w = W(), c = w.pieceHit(id); w.pointerDown(c.x, c.y); for (let k = 1; k <= 6; k++) w.pointerMove(c.x + dx * k / 6, c.y + dy * k / 6); },
    drop(id, x, y) { const w = W(), c = w.pieceHit(id); w.pointerDown(c.x, c.y); for (let k = 1; k <= 8; k++) w.pointerMove(c.x + (x - c.x) * k / 8, c.y + (y - c.y) * k / 8); w.pointerUp(x, y); },
    nearPoint() {   // a board point outside the asked slot's zone, far from it
      const w = W(), a = w.answer(), B = w.layout.board, z = w.slotZone(a.slot);
      const cands = [[B.x + 40, B.y + B.h - 30], [B.x + B.w - 40, B.y + B.h - 30], [B.x + 40, B.y + 30], [B.x + B.w - 40, B.y + 30], [B.x + B.w / 2, B.y + B.h - 20]];
      const out = cands.filter(([x, y]) => !(x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h));
      out.sort((p, q) => Math.hypot(q[0] - z.x - z.w / 2, q[1] - z.y - z.h / 2) - Math.hypot(p[0] - z.x - z.w / 2, p[1] - z.y - z.h / 2));
      return out[0];
    },
    otherPiece() { const w = W(), a = w.answer(); const o = w.pieces.find(p => p.state === 'rest' && p.id !== a.piece); return o ? o.id : null; },
    fillGallery(n) {
      const w = W(), P = w.pictures.length ? w.pictures : [];
      const scenes = ['street', 'shapes', 'balloons', 'park'], th = [{ kind: 'obj', obj: 'car', color: 'red' }, { kind: 'shape', shape: 'star', color: 'yellow' }, { kind: 'animal', animal: 'duck' }, { kind: 'obj', obj: 'balloon', color: 'blue' }];
      const out = P.slice();
      for (let i = out.length; i < n; i++) out.push(P.length ? Object.assign({}, P[i % P.length], { season: (i >> 2) % 4 }) :
        { scene: scenes[i % 4], season: (i >> 2) % 4, level: i >> 2, round: i % 4, topic: 'colors', pieces: [{ thing: th[i % 4], u: 0.3, v: 0.55, rs: 0.4 }, { thing: th[(i + 1) % 4], u: 0.7, v: 0.5, rs: 0.4 }] });
      w.pictures = out;
    }
  };
}

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png') }); }
const G = (page, key, extra = {}) => page.evaluate(() => ({ geom: QA.geom(), dom: QA.dom() })).then(r => { geo[key] = Object.assign(r, extra); return r; });
const quiet = page => page.evaluate(() => { const w = PZ.debug.world; w.pigeon = null; w._pigeonNext = -1; w.bubbles = []; w._bubbleNext = -1; w._bubblesLeft = 0; w.hintHand = null; w._idleT = -1e6; });

/** Start chapter `level` with `topic`, bot-play `skip` rounds fast, stop at the first open ask of the next round. */
async function round(page, topic, level = 0, skip = 1) {
  await page.evaluate(([t, l]) => {
    const w = PZ.debug.world;
    if (PZ.debug.mode !== 'play') PZ.debug.startGame();
    w.levels[l] = t; w.startLevel(l); PZ.debug.setSpeed(8);
  }, [topic, level]);
  for (let k = 0; k < skip; k++) {
    await until(page, () => PZ.debug.world.interactive && PZ.debug.answer(), null, 40000);
    const r0 = await page.evaluate(() => { PZ.debug.setBot(true, 1); return PZ.debug.world.round; });
    await until(page, r => PZ.debug.world.round > r || PZ.debug.world.state === 'talk', r0, 60000);
    await page.evaluate(() => PZ.debug.setBot(false));
  }
  await until(page, () => PZ.debug.world.interactive && PZ.debug.answer(), null, 40000);
  await page.evaluate(() => PZ.debug.setSpeed(1)); await quiet(page);
  await sleep(2700);   // weather crossfade 2.5 s
  await quiet(page);
}

async function screens(browser, srv, dev, lang) {
  const { ctx, page } = await open(browser, srv, dev, lang, 4);
  const k = `${dev}-${lang}`;
  await sleep(600); await shot(page, `${k}-01-title`); geo[k + '-title'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => { PZ.UI.refreshSettings && PZ.UI.refreshSettings(); PZ.UI.only('scrSettings'); }); await sleep(450);
  await shot(page, `${k}-02-settings`); geo[k + '-settings'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => PZ.UI.only('scrTitle'));
  // chapter banner (intro)
  await page.evaluate(() => { PZ.debug.startGame(); const w = PZ.debug.world; w.levels[0] = 'colors'; w.startLevel(0); }); await sleep(1100);
  await shot(page, `${k}-03-banner`);
  await round(page, 'colors', 0, 1);
  await shot(page, `${k}-04-play`); await G(page, k + '-play');
  // held piece (lifted 140 px toward the board)
  const aid = await page.evaluate(() => PZ.debug.answer().piece);
  await page.evaluate(id => QA.grab(id), aid); await sleep(250);
  await shot(page, `${k}-05-held`);
  await page.evaluate(() => PZ.debug.world.cancelDrag()); await sleep(900);
  // near miss: the asked piece dropped on the board away from its shadow → shadow glows, piece hops home
  await page.evaluate(id => { const p = QA.nearPoint(); QA.drop(id, p[0], p[1]); }, aid); await sleep(380);
  await shot(page, `${k}-06-nearmiss`);
  await sleep(1600); await page.evaluate(() => { PZ.debug.world.magnet = false; });
  // wrong piece on the board
  const oid = await page.evaluate(() => QA.otherPiece());
  if (oid != null) {
    await page.evaluate(([id, sid]) => { const s = PZ.debug.world.slotDrop(sid); QA.drop(id, s.x, s.y); }, [oid, await page.evaluate(() => PZ.debug.answer().slot)]);
    await sleep(160); await shot(page, `${k}-07-wrong`);
    await sleep(1500);
  }
  // hint hand
  await page.evaluate(() => { const w = PZ.debug.world; w._lastHintT = -1e9; w.hint(); }); await sleep(650);
  await shot(page, `${k}-08-hint`);
  await page.evaluate(() => { PZ.debug.world.hintHand = null; });
  // pigeon pecking on the pavement
  await page.evaluate(() => { const w = PZ.debug.world; w.surprise = 'pigeon'; w._pigeonTimes = 0; w._pigeonNext = 0.02; });
  await until(page, () => { const g = PZ.debug.world.pigeon; return g && g.state === 'walk' && g.stopT > 0.3; }, null, 20000).catch(() => {});
  await shot(page, `${k}-09-pigeon`); await G(page, k + '-pigeon');
  // a walking pigeon mid-way (crossing the tray)
  await page.evaluate(() => { const w = PZ.debug.world; w.pigeon = null; w._pigeonNext = 0.02; });
  await until(page, () => { const w = PZ.debug.world, g = w.pigeon; return g && g.x < w.layout.W * 0.75; }, null, 20000).catch(() => {});
  await shot(page, `${k}-09b-pigeon-walk`); geo[k + '-pigeonwalk'] = { geom: await page.evaluate(() => QA.geom()) };
  await quiet(page); await page.evaluate(() => { PZ.debug.world.surprise = null; });
  // bubbles
  await page.evaluate(() => { const w = PZ.debug.world; w.surprise = 'bubbles'; w._bubbleWaves = 0; w._bubbleNext = 0.02; });
  await sleep(2200); await shot(page, `${k}-10-bubbles`);
  await quiet(page); await page.evaluate(() => { PZ.debug.world.surprise = null; });
  // pause
  await page.evaluate(() => document.getElementById('btnPause').click()); await sleep(450);
  await shot(page, `${k}-11-pause`); geo[k + '-pause'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => document.getElementById('btnResume').click()); await sleep(300);
  // finish → alive
  await page.evaluate(() => PZ.debug.setBot(true, 1));
  await until(page, () => PZ.debug.world.phase === 'alive' && PZ.debug.world.phaseTime > 0.9, null, 30000).catch(() => {});
  await page.evaluate(() => PZ.debug.setBot(false));
  await shot(page, `${k}-12-alive`);
  await until(page, () => PZ.debug.world.phase === 'turn' && PZ.debug.world.phaseTime > 0.25, null, 15000).catch(() => {});
  await shot(page, `${k}-13-pageturn`);
  // Talk time
  await sleep(1500);
  await page.evaluate(() => { const w = PZ.debug.world; w._startTalk(); }); await sleep(1100);
  await shot(page, `${k}-14-talk`); geo[k + '-talk'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => { const w = PZ.debug.world; w.talkAnswer(w.talk.answer); }); await sleep(700);
  await shot(page, `${k}-15-talk-right`);
  // session done (gallery)
  await page.evaluate(() => { const w = PZ.debug.world; QA.fillGallery(16); w.level = w.levels.length - 1; w._levelDone(); PZ.debug.setSpeed(4); });
  await until(page, () => PZ.debug.mode === 'done', null, 30000).catch(() => {}); await page.evaluate(() => PZ.debug.setSpeed(1)); await sleep(5200);
  await shot(page, `${k}-16-done`); geo[k + '-done'] = { dom: await page.evaluate(() => QA.dom()), gallery: await page.evaluate(() => PZ.render.gallery.length) };
  if (page._errs.length) geo[k + '-errors'] = page._errs.slice(0, 10);
  await ctx.close();
}

async function topics(browser, srv, dev, lang) {
  for (const age of [3, 4, 5, 6, 7]) {
    const { ctx, page } = await open(browser, srv, dev, lang, age, 20 + age);
    for (const [i, t] of AGE_TOPICS[age].entries()) {
      const k = `${dev}-${lang}-age${age}-${t}`;
      try { await round(page, t, i, 1); await shot(page, k); await G(page, k, { season: i }); }
      catch (e) { geo[k + '-fatal'] = e.message.split('\n')[0]; console.log('  ERR', k, e.message.split('\n')[0]); }
    }
    if (page._errs.length) geo[`${dev}-${lang}-age${age}-errors`] = page._errs.slice(0, 10);
    await ctx.close();
  }
}

// every season x every board scene used by the age 3-5 topics (street, shapes, size, balloons, park, letters)
async function seasons(browser, srv, dev) {
  const { ctx, page } = await open(browser, srv, dev, 'en', 5, 9);
  for (const lv of [0, 1, 2, 3]) for (const t of ['colors', 'shapes', 'count', 'animals', 'letters']) {
    const k = `${dev}-season${lv}-${t}`;
    try { await round(page, t, lv, 1); await shot(page, k); await G(page, k); } catch (e) { geo[k + '-fatal'] = e.message.split('\n')[0]; }
  }
  await ctx.close();
  const c3 = await open(browser, srv, dev, 'en', 3, 9);
  for (const lv of [0, 1, 2, 3]) { const k = `${dev}-season${lv}-size`; try { await round(c3.page, 'size', lv, 1); await shot(c3.page, k); await G(c3.page, k); } catch (e) { geo[k + '-fatal'] = e.message.split('\n')[0]; } }
  await c3.ctx.close();
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const t0 = Date.now();
  try {
    for (const dev of DEV_LIST) {
      if (PARTS.has('screens')) for (const lang of LANGS) { console.log('screens', dev, lang); await screens(browser, srv, dev, lang).catch(e => { console.log('  ERR', e.message.split('\n')[0]); geo[`${dev}-${lang}-fatal`] = e.message.split('\n')[0]; }); }
      if (PARTS.has('topics')) for (const lang of LANGS) { console.log('topics', dev, lang); await topics(browser, srv, dev, lang).catch(e => console.log('  ERR', e.message.split('\n')[0])); }
      if (PARTS.has('seasons')) { console.log('seasons', dev); await seasons(browser, srv, dev).catch(e => console.log('  ERR', e.message.split('\n')[0])); }
    }
  } finally {
    const tag = process.env.DEV ? '-' + DEV_LIST.join('_') : '';
    const gf = path.join(OUT, `geometry${tag}.json`);
    const prev = fs.existsSync(gf) ? JSON.parse(fs.readFileSync(gf, 'utf8')) : {};
    fs.writeFileSync(gf, JSON.stringify(Object.assign(prev, geo), null, 1));
    const issues = Object.entries(Object.assign(prev, geo)).flatMap(([k, v]) => [...((v.geom && v.geom.issues) || []), ...((v.dom && v.dom.issues) || [])].map(i => k + ': ' + i));
    fs.writeFileSync(path.join(OUT, `issues${tag}.txt`), issues.join('\n') + '\n');
    await browser.close(); srv.close();
    console.log('done in', Math.round((Date.now() - t0) / 1000), 's ->', OUT, '|', issues.length, 'issues');
  }
})();
