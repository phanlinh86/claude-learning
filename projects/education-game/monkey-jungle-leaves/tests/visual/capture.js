// Visual QA capture for Lolo's Jungle Leaf Match (report-only: never changes game code).
//   node tests/visual/capture.js [section ...]   sections: screens moods critters talk notch   (default: all)
// Output: tests/out/visual/<section>/*.png + geometry.jsonl (CSS-px rects of leaves / bubble / HUD / Lolo + overlap checks).
// The world is frozen by swapping world.update for a no-op (the renderer and main's event handling keep running);
// D.adv(s) steps it by hand, D.sync() copies every _p partner so interpolation never smears a hand-set state.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
// emulated safe areas (CSS px): iPhone 15/16 portrait / landscape, iPad Pro 11"
const NOTCH = { P: [47, 0, 34, 0], L: [0, 47, 21, 47], PAD: [24, 0, 20, 0] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jl = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
let srv, browser;

async function open(dev, q, opts = {}) {
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  pageerror', dev, String(e)));
  page.on('console', m => { if (m.type() === 'error') console.log('  console.error', dev, m.text()); });
  if (opts.notch) {
    // main.js readInsets() reads the computed padding of #safeProbe = var(--sa-*). Override the vars on :root before boot
    // (this DOMContentLoaded listener is registered before main.js's, so it runs first).
    const [t, r, b, l] = NOTCH[opts.notch];
    await page.addInitScript(([t, r, b, l]) => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = `:root{--sa-t:${t}px !important;--sa-r:${r}px !important;--sa-b:${b}px !important;--sa-l:${l}px !important}`;
        document.head.appendChild(s);
      });
    }, [t, r, b, l]);
  }
  await page.goto(srv.url + '?mute=1&novoice=1&seed=' + (opts.seed || 5) + '&' + q);
  await page.waitForFunction(() => window.LL && LL.debug && LL.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(500);
  if (opts.notch) await page.evaluate(([n, ins]) => {   // paint the unsafe zones (+ island / home indicator) so they show
    const add = st => { const e = document.createElement('div'); e.className = 'qa-notch'; e.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(e); };
    const [t, r, b, l] = ins, red = 'background:rgba(255,0,0,.16)';
    if (t) add(`left:0;right:0;top:0;height:${t}px;${red}`);
    if (b) add(`left:0;right:0;bottom:0;height:${b}px;${red}`);
    if (l) add(`left:0;top:0;bottom:0;width:${l}px;${red}`);
    if (r) add(`right:0;top:0;bottom:0;width:${r}px;${red}`);
    if (n === 'P') add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
    if (n === 'L') add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
    if (n !== 'PAD') add(`left:50%;bottom:8px;width:${n === 'L' ? 200 : 140}px;height:5px;margin-left:-${n === 'L' ? 100 : 70}px;border-radius:3px;background:#000`);
  }, [opts.notch, NOTCH[opts.notch]]);
  await page.evaluate(() => {
    const D = LL.debug;
    D.freeze = () => { const w = D.world; if (!w._upd) { w._upd = w.update; w.update = function () {}; } };
    D.adv = s => { const w = D.world, u = w._upd || w.update; for (let t = 0; t < s - 1e-9; t += 0.05) u.call(w, Math.min(0.05, s - t)); };
    D.sync = () => { const w = D.world; w.alpha = 1; w._pscroll = w.scroll; w._pscrollT = w.scrollT;
      for (const c of w.cards) { c._px = c.x; c._py = c.y; c._prot = c.rot; c._popen = c.open; c._pflip = c.flip; c._pbloom = c.bloom; c._pbounce = c.bounce; }
      const G = w.lolo; if (G) { G._phx = G.headX; G._phy = G.headY; G._phop = G.hop; }
      const k = w.critter; if (k) { k._px = k.x; k._py = k.y; k._prot = k.rot; }
      for (const t of w.traffic || []) { t._px = t.x; t._py = t.y; } };
    D.until = (f, max = 20) => { for (let t = 0; t < max; t += 0.05) { if (f()) return true; D.adv(0.05); } return false; };
    D.toRound = (level, topic, ri) => {   // frozen game at chapter `level`, topic, round index; stops at the start of the scroll
      const w = D.world; D.startGame(); D.freeze();
      if (topic) w.levels[level] = topic;
      w.startLevel(level); D.weather.setWeather(level, { instant: true });
      D.until(() => w.state === 'round');
      if (ri > 0) { w.round = ri; w._beginRound(); }
    };
    D.peekUp = () => { const w = D.world; D.until(() => w.phase === 'peek'); D.until(() => w.cards.every(c => c.open >= 0.97 && Math.abs(c.open - 1) < 0.03), 6); D.adv(0.1); D.sync(); };
    D.toPlay = () => { const w = D.world; D.until(() => w.phase === 'play', 30); D.until(() => w.cards.every(c => c.open < 0.01), 3); D.adv(0.3); D.sync(); };
    D.tap = c => D.world.pointerDown(c.x, c.y);
    D.pair = () => { const w = D.world, free = w.cards.filter(c => c.state === 'down'); const a = free[0]; return [a, free.find(c => c !== a && c.key === a.key)]; };
    D.matchOne = () => { const w = D.world, [a, b] = D.pair(); D.tap(a); D.adv(0.4); D.tap(b); D.until(() => a.bloom > 0.9 && b.bloom > 0.9, 4); D.adv(0.3); return [a, b]; };
    D.solve = () => { const w = D.world; for (let g = 0; g < 60 && !w.solved; g++) { D.until(() => w.phase === 'play', 5); if (w.solved) break; const [a, b] = D.pair(); if (!a) break; D.tap(a); D.adv(0.35); D.tap(b); D.adv(0.6); } };
  });
  return { ctx, page };
}
const shot = (page, f) => page.screenshot({ path: f });

// CSS-px geometry + overlap checks for the current frame
const geom = page => page.evaluate(() => {
  const D = LL.debug, w = D.world, v = D.view(), L = w.layout;
  const box = e => { if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };
  const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
  // NB: cardScreen(id) returns the window CENTRE in x/y (+ w/h), not a top-left rect: convert
  const wins = (w.cards || []).map(c => { const s = D.cardScreen(c.id); return { id: c.id, state: c.state, open: +(+c.open).toFixed(2), x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h }; });
  const bubble = box(document.getElementById('bubble')), hud = box(document.getElementById('hud')), gs = D.loloScreen && D.loloScreen();
  const head = gs && gs.head, sa = (() => { const cs = getComputedStyle(document.getElementById('safeProbe')); return [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat); })();
  const unsafe = { x: sa[3], y: sa[0], w: innerWidth - sa[1] - sa[3], h: innerHeight - sa[0] - sa[2] };
  const outside = r => r ? +(r.w * r.h - ov(r, unsafe)).toFixed(0) : 0;
  const bt = document.getElementById('bubbleText');
  const G = L.grid;
  return { W: L.W, H: L.H, s: +v.s.toFixed(4), ins: L.ins, sa, state: w.state, phase: w.phase, topic: w.topic, age: w.age,
    grid: G && { cols: G.cols, rows: G.rows, cw: +G.cw.toFixed(1), ch: +G.ch.toFixed(1), gap: +G.gap.toFixed(1), cssW: +(G.cw * v.s).toFixed(1) },
    groundY: L.groundY, lolo: L.lolo,
    bubble, hud, head, loloBody: gs && gs.body, bubbleText: bt.textContent, bubbleOverflow: document.getElementById('bubble').scrollHeight - document.getElementById('bubble').clientHeight,
    bubbleOverWin: wins.map(c => ov(bubble, c)).reduce((a, b) => a + b, 0) | 0,
    hudOverWin: wins.map(c => ov(hud, c)).reduce((a, b) => a + b, 0) | 0,
    headOverWin: wins.map(c => ov(head, c)).reduce((a, b) => a + b, 0) | 0,
    headWinGap: head && wins.length ? +Math.min(...wins.map(c => Math.max(c.x - (head.x + head.w), head.x - (c.x + c.w), c.y - (head.y + head.h), head.y - (c.y + c.h)))).toFixed(1) : null,
    hudOutsideSafe: outside(hud), bubbleOutsideSafe: outside(bubble), winOutsideSafe: wins.reduce((a, c) => a + outside(c), 0),
    headOutsideScreen: head ? +(head.w * head.h - ov(head, { x: 0, y: 0, w: innerWidth, h: innerHeight })).toFixed(0) : 0,
    wins, critter: w.critter && { type: w.critter.type, state: w.critter.state, x: w.critter.x, y: w.critter.y, rect: D.critterScreen && D.critterScreen() },
    traffic: (w.traffic || []).map(t => ({ kind: t.kind, lane: t.lane, x: t.x | 0, y: t.y | 0 })) };
});

async function screens() {
  const dir = mk(path.join(OUT, 'screens')), J = path.join(dir, 'geometry.jsonl'); try { fs.unlinkSync(J); } catch (e) {}
  for (const dev of Object.keys(DEV)) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await shot(page, f('01-title'));
    jl(J, { tag, screen: 'title', ...(await page.evaluate(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left | 0, b.top | 0, b.width | 0, b.height | 0, e.scrollWidth > e.clientWidth + 1]; };
      return { logo: q('.logo'), logo1: q('#logo1'), logo2: q('#logo2'), tagline: q('#tagline'), play: q('#btnPlay'), info: q('.title-info'), lang: q('.title-top .lang-switch'), gear: q('#btnParents'), vw: innerWidth, vh: innerHeight, groundY: LL.debug.world.layout.groundY, s: LL.debug.view().s }; })) });
    await page.evaluate(() => { LL.UI.refreshSettings(); LL.UI.only('scrSettings'); });
    await sleep(400); await shot(page, f('02-settings'));
    jl(J, { tag, screen: 'settings', ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel'), r = p.getBoundingClientRect();
      const clipped = [...p.querySelectorAll('label, .toggle span, button, h2, p')].map(e => ({ t: e.textContent.trim().slice(0, 40), sw: e.scrollWidth, cw: e.clientWidth })).filter(e => e.sw > e.cw + 1);
      return { panel: [r.top | 0, r.bottom | 0, r.left | 0, r.right | 0, innerWidth, innerHeight], scroll: p.scrollHeight - p.clientHeight, clipped }; })) });
    await page.evaluate(() => LL.UI.only('scrTitle'));
    // chapter banner + pause during play
    await page.evaluate(() => { const D = LL.debug; D.startGame(); D.freeze(); D.adv(0.8); });
    await sleep(400); await shot(page, f('03-banner'));
    await page.evaluate(() => { const D = LL.debug; D.toPlay(); });
    await page.click('#btnPause'); await sleep(400); await shot(page, f('04-pause'));
    jl(J, { tag, screen: 'pause', ...(await page.evaluate(() => { const p = document.querySelector('#scrPause .panel').getBoundingClientRect();
      return { panel: [p.top | 0, p.bottom | 0, innerHeight], buttons: [...document.querySelectorAll('#scrPause button')].map(e => { const r = e.getBoundingClientRect(); return [e.id, r.width | 0, r.height | 0, e.scrollWidth > e.clientWidth + 1]; }) }; })) });
    await page.click('#btnResume');
    // chapter stars banner, then session done
    await page.evaluate(() => { const D = LL.debug, w = D.world; D.solve(); w._startTalk(); });
    await sleep(500);
    await page.evaluate(() => { const D = LL.debug, w = D.world; w.talkAnswer(w.talk.answerId); D.adv(2.4); D.sync(); });
    await sleep(500); await shot(page, f('05-chapter-stars'));
    await page.evaluate(() => { const D = LL.debug, w = D.world; w.level = w.levels.length - 1; w._levelDone(); D.adv(2.2); });
    await sleep(1500); await shot(page, f('06-done'));
    jl(J, { tag, screen: 'done', ...(await page.evaluate(() => { const p = document.querySelector('.done-panel').getBoundingClientRect(), t = document.getElementById('doneTitle');
      return { panel: [p.top | 0, p.bottom | 0, p.left | 0, p.right | 0, innerWidth, innerHeight], title: t.textContent, titleClip: t.scrollWidth > t.clientWidth + 1, groundY: LL.debug.world.layout.groundY, s: LL.debug.view().s }; })) });
    await ctx.close();
    console.log('screens', tag);
  }
}

// each chapter mood mid-play: closed, peek (all open), a matched pair (lit + flower boxes), a mismatch
async function moods() {
  const dir = mk(path.join(OUT, 'moods')), J = path.join(dir, 'geometry.jsonl'); try { fs.unlinkSync(J); } catch (e) {}
  const topics = ['colors', 'shapes', 'count', 'food'];
  for (const dev of Object.keys(DEV)) for (let m = 0; m < 4; m++) {
    const lang = m === 2 ? 'vi' : 'en', tag = `${dev}-m${m}-${topics[m]}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`, { seed: 7 + m });
    const g = async (n) => jl(J, { tag, shot: n, ...(await geom(page)) });
    await page.evaluate(([m, t]) => { const D = LL.debug; D.toRound(m, t, 2); D.peekUp(); }, [m, topics[m]]);
    await sleep(350); await shot(page, f('1-peek')); await g('peek');
    await page.evaluate(() => LL.debug.toPlay());
    await sleep(300); await shot(page, f('2-closed')); await g('closed');
    await page.evaluate(() => { const D = LL.debug; D.matchOne(); D.sync(); });
    await sleep(300); await shot(page, f('3-matched')); await g('matched');
    await page.evaluate(() => { const D = LL.debug, w = D.world; D.until(() => w.phase === 'play', 4);
      const free = w.cards.filter(c => c.state === 'down'), a = free[0], b = free.find(c => c.key !== a.key);
      D.tap(a); D.adv(0.4); D.tap(b); D.until(() => w._mis, 3); D.adv(0.25); D.sync(); });
    await sleep(300); await shot(page, f('4-mismatch')); await g('mismatch');
    if (m === 0 || m === 2) {
      // Lolo pointing at the farthest leaf (top-right)
      await page.evaluate(() => { const D = LL.debug, w = D.world; D.until(() => !w._mis && w.phase === 'play', 4); D.adv(0.3);
        const free = w.cards.filter(c => c.state === 'down').sort((p, q) => (q.x - q.y) - (p.x - p.y)); D.tap(free[0]); D.adv(0.9); D.sync(); });
      await sleep(300); await shot(page, f('5-stretch-far')); await g('stretch');
      await page.evaluate(() => { const D = LL.debug, w = D.world; D.adv(0.6); for (const c of w.cards) if (c.state === 'up') { /* finish it */ }
        D.until(() => w.phase === 'play' || w._mis, 3); });
      // cheer, then the vine swing mid-way
      await page.evaluate(() => { const D = LL.debug, w = D.world; D.adv(1.5); w.open = []; for (const c of w.cards) if (c.state === 'up') w._close(c); w._mis = null; D.adv(0.6); D.solve(); D.until(() => w.phase === 'cheer', 6); D.adv(0.55); D.sync(); });
      await sleep(250); await shot(page, f('6-cheer')); await g('cheer');
      await page.evaluate(() => { const D = LL.debug, w = D.world; D.until(() => w.phase === 'scroll', 6); D.until(() => w.scrollT >= 0.5, 3); D.sync(); });
      await sleep(250); await shot(page, f('7-scroll-mid')); await g('scroll');
    }
    await ctx.close();
    console.log('moods', tag);
  }
}

async function critters() {
  const dir = mk(path.join(OUT, 'critters')), J = path.join(dir, 'geometry.jsonl'); try { fs.unlinkSync(J); } catch (e) {}
  for (const dev of Object.keys(DEV)) for (const [type, m] of [['toucan', 0], ['frog', 1], ['butterfly', 2]]) {
    const tag = `${dev}-${type}`;
    const { ctx, page } = await open(dev, 'age=4&lang=en', { seed: 3 });
    await page.evaluate(([type, m]) => { const D = LL.debug, w = D.world; D.toRound(m, 'colors', 2); D.toPlay(); w.surprise = type; w._critterAt = -2; w._spawnCritter();
      const k = w.critter;
      if (type === 'toucan') D.until(() => k.state === 'sit', 6);
      if (type === 'frog') D.until(() => k.state === 'stop' || k.state === 'sit', 12);
      if (type === 'butterfly') D.until(() => k.y < w.layout.grid.rect.y + w.layout.grid.rect.h * 0.5, 30);
      D.adv(0.3); D.sync(); }, [type, m]);
    await sleep(300); await shot(page, path.join(dir, `${tag}.png`));
    jl(J, { tag, ...(await geom(page)) });
    if (type === 'toucan') {   // in flight too
      await page.evaluate(() => { const D = LL.debug, w = D.world; w.critter = null; w._spawnCritter(); D.adv(0.5); D.sync(); });
      await sleep(250); await shot(page, path.join(dir, `${tag}-flying.png`));
    }
    await ctx.close();
  }
  console.log('critters done');
}

async function talk() {
  const dir = mk(path.join(OUT, 'talk')), J = path.join(dir, 'talk.jsonl'); try { fs.unlinkSync(J); } catch (e) {}
  const plan = [
    ['iphoneP', 'en', 4, ['colors', 'shapes', 'count', 'food']],
    ['ipadL', 'en', 4, ['colors', 'shapes', 'count', 'food']],
    ['iphoneL', 'vi', 4, ['colors', 'shapes', 'count', 'food']],
    ['ipadP', 'vi', 4, ['food', 'count']],
    ['iphoneP', 'vi', 3, ['size', 'animals', 'colors']],
    ['iphoneL', 'en', 3, ['size', 'animals']],
    ['iphoneP', 'en', 5, ['letters', 'food']],
    ['iphoneL', 'vi', 5, ['letters', 'shapes']],
    ['iphoneP', 'vi', 6, ['lower', 'initial', 'add']],
    ['ipadL', 'en', 6, ['initial', 'add']],
    ['iphoneP', 'en', 7, ['oddeven', 'sub', 'add']],
    ['iphoneL', 'vi', 7, ['oddeven', 'initial', 'sub']]
  ];
  for (const [dev, lang, age, tops] of plan) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`);
    for (const t of tops) {
      await page.evaluate(t => { const D = LL.debug, w = D.world; D.toRound(0, t, 0); D.adv(1); w._startTalk(); }, t);
      await sleep(700); await shot(page, path.join(dir, `${dev}-${lang}-a${age}-${t}.png`));
      jl(J, { dev, lang, age, topic: t, ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect();
        const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const q = b.getBoundingClientRect(); return { w: q.width | 0, h: q.height | 0, clip: b.scrollWidth > b.clientWidth + 1, text: b.textContent.trim(), pic: !!b.querySelector('canvas,img,svg') }; });
        const q = document.getElementById('talkQ');
        return { panel: [r.top | 0, r.bottom | 0, r.left | 0, r.right | 0, innerWidth, innerHeight], overflow: p.scrollHeight - p.clientHeight, q: q.textContent, qClip: q.scrollWidth > q.clientWidth + 1, choices: ch }; })) });
    }
    // answered (right) state once per run
    await page.evaluate(() => { const w = LL.debug.world; w.talkAnswer(w.talk.answerId); });
    await sleep(500); await shot(page, path.join(dir, `${dev}-${lang}-a${age}-answered.png`));
    await ctx.close();
    console.log('talk', dev, lang, age);
  }
}

async function notch() {
  const dir = mk(path.join(OUT, 'notch')), J = path.join(dir, 'geometry.jsonl'); try { fs.unlinkSync(J); } catch (e) {}
  for (const [dev, n] of [['iphoneP', 'P'], ['iphoneL', 'L'], ['ipadP', 'PAD'], ['ipadL', 'PAD']]) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`, f = s => path.join(dir, `${tag}-${s}.png`);
    const { ctx, page } = await open(dev, `age=7&lang=${lang}`, { notch: n });
    await shot(page, f('1-title'));
    await page.evaluate(() => { const D = LL.debug; D.toRound(3, 'oddeven', 3); D.peekUp(); });
    await sleep(300); await shot(page, f('2-peek-a7')); jl(J, { tag, shot: 'peek', ...(await geom(page)) });
    await page.evaluate(() => { const D = LL.debug, w = D.world; D.toPlay(); const c = w.cards.slice().sort((p, q) => p.y - q.y || q.x - p.x)[0]; D.tap(c); D.adv(0.9); D.sync(); });
    await sleep(300); await shot(page, f('3-stretch')); jl(J, { tag, shot: 'stretch', ...(await geom(page)) });
    await page.evaluate(() => { const D = LL.debug, w = D.world; D.adv(1); w.open = []; for (const c of w.cards) if (c.state === 'up') w._close(c); D.adv(0.5); D.solve(); D.until(() => w.phase === 'cheer', 6); D.adv(0.5); D.sync(); });
    await sleep(300); await shot(page, f('4-cheer'));
    await page.evaluate(() => { const D = LL.debug, w = D.world; w._startTalk(); });
    await sleep(600); await shot(page, f('5-talk'));
    await page.evaluate(() => { const D = LL.debug, w = D.world; w.skipTalk(); w.level = 3; w._levelDone(); D.adv(2.2); });
    await sleep(1200); await shot(page, f('6-done'));
    await ctx.close();
    console.log('notch', tag);
  }
}

(async () => {
  srv = await serve(); browser = await chromium.launch();
  try {
    if (on('screens')) await screens();
    if (on('moods')) await moods();
    if (on('critters')) await critters();
    if (on('talk')) await talk();
    if (on('notch')) await notch();
  } finally { await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
