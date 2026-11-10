// Visual QA sweep (Kiki's Camp Chimes): every screen x 4 device shapes x EN/VI with emulated notch insets, every topic per
// age (3..7) in its chapter mood (level i -> morning / noon / sunset / night), and in-page geometry measurements
// (chime sizes in CSS px, overlaps with Kiki / fire / bubble / HUD / notch, lanterns visible, colour-pair rule).
//   node tests/visual/screens.js            -> tests/out/visual/*.png + geometry[-DEV].json + issues[-DEV].txt
//   DEV=ip-p,pad-l  LANGS=en  PART=screens,topics,moods  (subsets; run the 4 devices in parallel with DEV=…)
// Report-only: drives the page through CC.debug / CC.UI and world input calls, never edits game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'out', 'visual'); fs.mkdirSync(OUT, { recursive: true });
// insets in CSS px [top, right, bottom, left]: notch iPhone 59/0/34/0 portrait, 0/59/21/59 landscape; iPad status bar + home bar
const DEVS = {
  'ip-p': { vp: [393, 852], ins: [59, 0, 34, 0], dpr: 3 }, 'ip-l': { vp: [852, 393], ins: [0, 59, 21, 59], dpr: 3 },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0], dpr: 2 }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0], dpr: 2 }
};
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'], 5: ['shapes', 'count', 'letters', 'animals'],
  6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const env = (k, d) => (process.env[k] ? process.env[k].split(',') : d);
const DEV_LIST = env('DEV', Object.keys(DEVS)), LANGS = env('LANGS', ['en', 'vi']), PARTS = new Set(env('PART', ['screens', 'topics', 'moods']));
const AGES = env('AGES', ['3', '4', '5', '6', '7']).map(Number);
const until = (page, fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const geo = {};

async function open(browser, srv, dev, lang, age, seed = 5) {
  const d = DEVS[dev];
  const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page._errs = []; page.on('pageerror', e => page._errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page._errs.push(m.text()); });
  await page.goto(srv.url + `?mute=1&novoice=1&seed=${seed}&age=${age}&lang=${lang}`);
  await until(page, () => window.CC && CC.debug && CC.debug.mode === 'title');
  // notch emulation: the safe-area vars drive #safeProbe (main.js readInsets) and every CSS inset
  await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(450);
  await page.evaluate(installProbe);
  return { ctx, page };
}

// in-page measurements (logical px; DOM rects converted with CC.debug.view())
function installProbe() {
  const W = () => CC.debug.world, V = () => CC.debug.view();
  const rectL = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || el.classList.contains('hidden') || el.closest('.hidden')) return null; const v = V(); return { x: (r.left - v.left) / v.s, y: (r.top - v.top) / v.s, w: r.width / v.s, h: r.height / v.s }; };
  const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
  const rnd = b => b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : null;
  const BAD = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
  window.QA = {
    geom() {
      const w = W(), L = w.layout, v = V(), iss = [];
      const hud = rectL(document.getElementById('hud')), bubble = rectL(document.getElementById('bubble'));
      const kb = L.kikiBox, fb = L.fireBox;
      const ch = (w.chimes || []).filter(c => c.state === 'hang' || c.state === 'enter').map(c => {
        const box = { x: c.cx - c.bw / 2, y: c.cy - c.bh / 2, w: c.bw, h: c.bh };
        return { id: c.id, kind: c.thing.kind, color: c.thing.color || null, size: Math.round(c.size), box,
          visCss: Math.round(Math.max(c.bw, c.bh) * v.s), sizeCss: Math.round(c.size * v.s), hitCss: Math.round(2 * w._hitR(c) * v.s), cord: Math.round(c.cord) };
      });
      for (const c of ch) {
        const a = c.bw * c.bh || c.box.w * c.box.h;
        if (ov(c.box, kb) > 0) iss.push(`chime ${c.id} (${c.kind}) overlaps Kiki box ${Math.round(100 * ov(c.box, kb) / a)}%`);
        if (ov(c.box, fb) > 0) iss.push(`chime ${c.id} overlaps fire box`);
        if (hud && ov(c.box, hud) > 0) iss.push(`chime ${c.id} under HUD`);
        if (bubble && ov(c.box, bubble) > 0) iss.push(`chime ${c.id} under bubble`);
        if (c.box.x < L.ins.left || c.box.x + c.box.w > L.W - L.ins.right || c.box.y + c.box.h > L.groundY) iss.push(`chime ${c.id} outside safe/ground`);
        if (c.sizeCss < 100) iss.push(`chime ${c.id} size ${c.sizeCss} css px < 100 (visible ${c.visCss})`);
        if (c.hitCss < 100) iss.push(`chime ${c.id} hit ${c.hitCss} css px < 100`);
      }
      const lan = (w.lanterns || []).map(l => ({ x: Math.round(l.x), y: Math.round(l.y) }));
      for (const l of lan) {
        const lb = { x: l.x - 24, y: l.y - 30, w: 48, h: 60 };
        if (hud && ov(lb, hud) > 0) iss.push(`lantern at ${l.x},${l.y} under HUD`);
        if (bubble && ov(lb, bubble) > 0) iss.push(`lantern at ${l.x},${l.y} under bubble`);
        if (lb.y < L.ins.top) iss.push(`lantern at ${l.x},${l.y} under notch/top inset`);
      }
      if (bubble && hud && ov(bubble, hud) > 0) iss.push('bubble overlaps HUD');
      if (bubble && ov(bubble, kb) > 0) iss.push('bubble overlaps Kiki');
      if (ov(kb, fb) > 0) iss.push(`Kiki box overlaps fire box by ${Math.round(ov(kb, fb))} px²`);
      if (bubble && bubble.y < L.ins.top) iss.push('bubble under top inset');
      const B = L.beam, postTop = L.posts[0].top;
      if (bubble && bubble.y + bubble.h > L.garland.y - 30) iss.push(`garland (y ${Math.round(L.garland.y)}) within 30 px of bubble bottom ${Math.round(bubble.y + bubble.h)}`);
      const cols = ch.map(c => c.color).filter(Boolean);
      if (w.age < 5) for (const [p, q] of BAD) if (cols.includes(p) && cols.includes(q)) iss.push(`colour pair ${p}+${q} at age ${w.age}`);
      const low = ch.length ? Math.max(...ch.map(c => c.box.y + c.box.h)) : 0, top = Math.min(postTop, L.garland.y - 30);
      const sky = Math.round(top - (bubble ? bubble.y + bubble.h : L.ins.top));
      return { W: L.W, H: L.H, s: +v.s.toFixed(3), ins: L.ins, item: L.item, tier: L.tier, beam: { x0: Math.round(B.x0), x1: Math.round(B.x1), y: Math.round(B.y) },
        garlandY: Math.round(L.garland.y), groundY: Math.round(L.groundY), kiki: rnd(kb), fire: rnd(fb), hud: rnd(hud), bubble: rnd(bubble),
        lowestChime: Math.round(low), gapChimeToGround: Math.round(L.groundY - low), gapChimeToKikiHead: Math.round(kb.y - low), skyAboveGarland: sky,
        chimes: ch.map(c => ({ id: c.id, kind: c.kind, color: c.color, size: c.size, sizeCss: c.sizeCss, visCss: c.visCss, hitCss: c.hitCss, cord: c.cord, box: rnd(c.box) })),
        lanterns: lan, issues: iss };
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
        if (el.tagName === 'BUTTON' && (r.width < 44 || r.height < 44)) iss.push(`${name} small target ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      const bt = document.getElementById('bubbleText'), bub = document.getElementById('bubble');
      const choices = [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      const panel = document.querySelector('.screen:not(.hidden) .panel'), pr = panel && panel.getBoundingClientRect();
      if (panel && panel.scrollHeight > panel.clientHeight + 2) iss.push(`panel scrolls (${panel.scrollHeight} > ${panel.clientHeight})`);
      return { issues: iss, choices, panel: pr ? [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)] : null,
        bubbleFont: bt && !bub.classList.contains('hidden') ? parseFloat(getComputedStyle(bt).fontSize) : null, bubbleText: bt ? bt.textContent : '',
        bubbleLines: bt && !bub.classList.contains('hidden') ? Math.round(bt.getBoundingClientRect().height / (parseFloat(getComputedStyle(bt).lineHeight) || parseFloat(getComputedStyle(bt).fontSize) * 1.2)) : null };
    },
    tap(id, dx = 0) { const w = W(), c = w.chimeHit(id); w.pointerDown(c.x + dx, c.y); w.pointerUp(c.x + dx, c.y); },
    other() { const w = W(), a = w.answer(); const o = w.chimes.find(c => c.state === 'hang' && !c.done && c.id !== (a && a.chime)); return o ? o.id : null; }
  };
}

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png') }); }
const G = (page, key, extra = {}) => page.evaluate(() => ({ geom: QA.geom(), dom: QA.dom() })).then(r => { geo[key] = Object.assign(r, extra); return r; });
const quiet = page => page.evaluate(() => { const w = CC.debug.world; w.hintHand = null; w._idleT = -1e6; w._hedgehogNext = -1; w._birdNext = -1; w._firefliesNext = -1; w.hedgehog = null; w.bird = null; w.fireflies = []; });

/** Start chapter `level` with `topic`, bot-play `skip` rounds fast, stop at the first open ask of the next round. */
async function round(page, topic, level = 0, skip = 1) {
  await page.evaluate(([t, l]) => {
    const w = CC.debug.world;
    if (CC.debug.mode !== 'play') CC.debug.startGame();
    w.levels[l] = t; w.startLevel(l); CC.debug.setSpeed(8);
  }, [topic, level]);
  for (let k = 0; k < skip; k++) {
    await until(page, () => CC.debug.world.interactive && CC.debug.answer(), null, 40000);
    const r0 = await page.evaluate(() => { CC.debug.setBot(true, 1); return CC.debug.world.round; });
    await until(page, r => CC.debug.world.round > r || CC.debug.world.state === 'talk', r0, 60000);
    await page.evaluate(() => CC.debug.setBot(false));
  }
  await until(page, () => CC.debug.world.interactive && CC.debug.answer(), null, 40000);
  await page.evaluate(() => CC.debug.setSpeed(1)); await quiet(page);
  await sleep(2700);   // weather crossfade 2.5 s; chimes settle
  await quiet(page);
}

async function screens(browser, srv, dev, lang) {
  const { ctx, page } = await open(browser, srv, dev, lang, 4);
  const k = `${dev}-${lang}`;
  await sleep(600); await shot(page, `${k}-01-title`); geo[k + '-title'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => { CC.UI.refreshSettings && CC.UI.refreshSettings(); CC.UI.only('scrSettings'); }); await sleep(450);
  await shot(page, `${k}-02-settings`); geo[k + '-settings'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => CC.UI.only('scrTitle'));
  // chapter banner (intro)
  await page.evaluate(() => { CC.debug.startGame(); const w = CC.debug.world; w.levels[0] = 'colors'; w.startLevel(0); }); await sleep(1000);
  await shot(page, `${k}-03-banner`);
  await round(page, 'colors', 0, 1);
  await shot(page, `${k}-04-play`); await G(page, k + '-play');
  // wrong chime → dull swing + Kiki oops
  const oid = await page.evaluate(() => QA.other());
  if (oid != null) { await page.evaluate(id => QA.tap(id, -30), oid); await sleep(180); await shot(page, `${k}-05-wrong`); await sleep(1600); }
  // right chime → ring arcs + note flying, then the lantern lit
  const aid = await page.evaluate(() => CC.debug.answer() && CC.debug.answer().chime);
  if (aid != null) {
    await page.evaluate(id => QA.tap(id, -30), aid); await sleep(260); await shot(page, `${k}-06-right`);
    await sleep(700); await shot(page, `${k}-07-lantern`);
  }
  await until(page, () => CC.debug.world.interactive && CC.debug.answer(), null, 15000).catch(() => {});
  // hint hand
  await page.evaluate(() => { const w = CC.debug.world; w._lastHintT = -1e9; w.hint(); }); await sleep(700);
  await shot(page, `${k}-08-hint`);
  await page.evaluate(() => { CC.debug.world.hintHand = null; });
  // surprises: hedgehog walking, bird on the beam
  await page.evaluate(() => { const w = CC.debug.world; w.surprise = 'hedgehog'; w._hedgehogNext = 0.02; });
  await until(page, () => { const h = CC.debug.world.hedgehog; return h && h.state === 'sniff'; }, null, 20000).catch(() => {});
  await shot(page, `${k}-09-hedgehog`);
  await quiet(page);
  await page.evaluate(() => { const w = CC.debug.world; w.surprise = 'bird'; w._birdNext = 0.02; });
  await until(page, () => { const b = CC.debug.world.bird; return b && b.state === 'perch'; }, null, 20000).catch(() => {});
  await sleep(300); await shot(page, `${k}-10-bird`);
  await quiet(page); await page.evaluate(() => { CC.debug.world.surprise = null; });
  // pause
  await page.evaluate(() => document.getElementById('btnPause').click()); await sleep(450);
  await shot(page, `${k}-11-pause`); geo[k + '-pause'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => document.getElementById('btnResume').click()); await sleep(300);
  // finish the round → song ask (ghost swipe) → cascade
  await page.evaluate(() => CC.debug.setBot(true, 1));
  await until(page, () => CC.debug.world.phase === 'song', null, 30000).catch(() => {});
  await page.evaluate(() => CC.debug.setBot(false));
  await sleep(1300); await shot(page, `${k}-12-songask`);
  await page.evaluate(() => { const w = CC.debug.world, c = w.chimes.filter(q => q.state === 'hang'); const a = w.chimeHit(c[0].id), b = w.chimeHit(c[c.length - 1].id);
    w.pointerDown(a.x - a.r - 10, a.y); for (let i = 1; i <= 12; i++) w.pointerMove(a.x - a.r - 10 + (b.x - a.x + 2 * a.r + 20) * i / 12, a.y); w.pointerUp(b.x + b.r + 10, a.y); });
  await sleep(450); await shot(page, `${k}-13-cascade`);
  // counting: age-4 chapter 2 = count (sunset)
  await round(page, 'count', 2, 1);
  await shot(page, `${k}-14-count-play`); await G(page, k + '-count');
  const cid = await page.evaluate(() => CC.debug.answer() && CC.debug.answer().chime);
  if (cid != null) { await page.evaluate(id => QA.tap(id, -30), cid); await sleep(1250); await shot(page, `${k}-15-counting`); }
  // night mood + fireflies
  await round(page, 'animals', 3, 1);
  await page.evaluate(() => { const w = CC.debug.world; w.surprise = 'fireflies'; w._firefliesNext = 0.02; }); await sleep(2400);
  await shot(page, `${k}-16-night-fireflies`); await G(page, k + '-night');
  await quiet(page);
  // Talk time
  await page.evaluate(() => { CC.debug.world._startTalk(); }); await sleep(1100);
  await shot(page, `${k}-17-talk`); geo[k + '-talk'] = { dom: await page.evaluate(() => QA.dom()) };
  await page.evaluate(() => { const w = CC.debug.world; w.talkAnswer(w.talk.answer); }); await sleep(700);
  await shot(page, `${k}-18-talk-right`);
  // level done banner (stars)
  await until(page, () => CC.debug.world.state === 'levelDone', null, 8000).catch(() => {}); await sleep(700);
  await shot(page, `${k}-19-leveldone`);
  // session done
  await page.evaluate(() => { const w = CC.debug.world; if (w.songs.length < 6) for (let i = 0; i < 12; i++) w.songs.push({ level: i >> 2, notes: [0, 1, 2], colors: [['red', 'blue', 'yellow'], [null, null, null], ['green', 'purple', 'orange'], [null, 'pink', null]][i % 4] });
    w.level = w.levels.length - 1; w._levelDone(); CC.debug.setSpeed(4); });
  await until(page, () => CC.debug.mode === 'done', null, 30000).catch(() => {}); await page.evaluate(() => CC.debug.setSpeed(1)); await sleep(4500);
  await shot(page, `${k}-20-done`); geo[k + '-done'] = { dom: await page.evaluate(() => QA.dom()) };
  if (page._errs.length) geo[k + '-errors'] = page._errs.slice(0, 10);
  await ctx.close();
}

async function topics(browser, srv, dev, lang) {
  for (const age of AGES) {
    const { ctx, page } = await open(browser, srv, dev, lang, age, 20 + age);
    for (const [i, t] of AGE_TOPICS[age].entries()) {
      const k = `${dev}-${lang}-age${age}-${i}-${t}`;
      try { await round(page, t, i, 2); await shot(page, k); await G(page, k, { mood: i }); }
      catch (e) { geo[k + '-fatal'] = e.message.split('\n')[0]; console.log('  ERR', k, e.message.split('\n')[0]); }
    }
    if (page._errs.length) geo[`${dev}-${lang}-age${age}-errors`] = page._errs.slice(0, 10);
    await ctx.close();
  }
}

// every mood x the colour-critical chimes: age-5 colour bells (4 colours, pink/purple possible) and age-4 bell strings (brass)
async function moods(browser, srv, dev) {
  for (const [age, t] of [[5, 'colors'], [4, 'count'], [5, 'shapes']]) {
    const { ctx, page } = await open(browser, srv, dev, 'en', age, 31);
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
    const tag = process.env.DEV ? '-' + DEV_LIST.join('_') : '';
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
