// Visual QA capture for Kitten's Balloon Farm: every screen × device × language, the 4 times of day, every topic × age,
// notch insets, short landscape phones, hit circles (debug=1) and a background-contrast probe for every balloon.
//   node tests/visual/capture.js [section ...]   sections: screens moods topics notch short hits  (default: all)
// Output: tests/out/visual/<section>/*.png + *.jsonl (geometry + contrast samples). Analyse: node tests/visual/analyze.js
// Time is frozen by swapping world.update for a no-op (the renderer keeps drawing); the world is advanced by hand.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 },
  seL: { viewport: { width: 667, height: 375 }, dpr: 2 },      // iPhone SE landscape (shortest phone)
  miniL: { viewport: { width: 812, height: 375 }, dpr: 3 }     // iPhone 13 mini landscape
};
const AGE_TOPICS = { 3: ['colors', 'size', 'shapes', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jl = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');

let srv, browser;
async function open(dev, q, opts = {}) {
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  pageerror', dev, String(e)));
  page.on('console', m => { if (m.type() === 'error') console.log('  console.error', dev, m.text()); });
  if (opts.notch) {   // main.js readInsets() reads the computed padding of #safeProbe (= the --sa-* custom properties)
    const css = opts.notch === 'P'
      ? ':root{--sa-t:59px !important;--sa-b:34px !important}'
      : ':root{--sa-l:59px !important;--sa-r:59px !important;--sa-b:21px !important}';
    await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }); }, css);
  }
  await page.goto(srv.url + '?mute=1&novoice=1&seed=' + (opts.seed || 5) + '&' + q);
  await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(400);
  if (opts.notch) await page.evaluate(n => {   // overlay the unsafe zones (Dynamic Island + home bar) so they show in shots
    const add = st => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(d); };
    if (n === 'P') { add('left:0;right:0;top:0;height:59px;background:rgba(255,0,0,.18)'); add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
      add('left:0;right:0;bottom:0;height:34px;background:rgba(255,0,0,.18)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else { add('left:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
      add('right:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.18)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
  }, opts.notch);
  await page.evaluate(() => {   // freeze / manual-step helpers
    const D = KB.debug;
    D.freeze = () => { const w = D.world; if (!w._upd) { w._upd = w.update; w.update = function () {}; } };
    D.thaw = () => { const w = D.world; if (w._upd) { w.update = w._upd; delete w._upd; } };
    D.adv = s => { const w = D.world, u = w._upd || w.update; for (let t = 0; t < s - 1e-9; t += 0.05) u.call(w, Math.min(0.05, s - t)); };
  });
  return { ctx, page };
}
// start a game, force (level, topic, round), step until every balloon floats, then freeze
async function toRound(page, level = 0, topic = null, roundIdx = 1, until = 'float') {
  await page.evaluate(([level, topic, ri]) => {
    const D = KB.debug;
    D.startGame(); D.freeze();
    const w = D.world;
    if (topic) w.levels[level] = topic;
    w.startLevel(level);
    D.adv(2.6);                          // intro → round 0
    if (ri > 0) { w.round = ri; w._beginRound(); }
    D.weather.setWeather(level, { instant: true });
  }, [level, topic, roundIdx]);
  await page.evaluate(until => {
    const D = KB.debug, w = D.world;
    for (let i = 0; i < 80; i++) { if (w.balloons.length && w.balloons.every(b => b.state === 'float')) break; D.adv(0.1); }
    D.adv(0.6);
  }, until);
  await sleep(250);
}
const shot = (page, f) => page.screenshot({ path: f });

// geometry of everything on screen, logical px (DOM rects converted)
const geom = page => page.evaluate(() => {
  const w = KB.debug.world, v = KB.debug.view(), L = w.layout, A = KB.BalloonArt;
  const R = id => { const e = document.getElementById(id); if (!e || e.offsetParent === null || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect();
    return { l: (b.left - v.left) / v.s, t: (b.top - v.top) / v.s, r: (b.right - v.left) / v.s, b: (b.bottom - v.top) / v.s }; };
  const GEO = { circle: [-0.6, 0.595, 0.5], heart: [-0.47, 0.47, 0.52], star: [-0.53, 0.519, 0.55], square: [-0.48, 0.48, 0.5], triangle: [-0.5, 0.38, 0.5], rect: [-0.32, 0.32, 0.62] };
  return { W: L.W, H: L.H, s: v.s, ins: L.ins, groundY: L.groundY, play: L.play, miu: L.miu, sign: L.sign, yard: L.yard, bubbleL: L.bubble,
    shrink: w.packShrink, ok: w.packOk, topic: w.topic, state: w.state, mode: w.cur && w.cur.mode, signState: { type: w.sign.type, value: w.sign.value, need: w.sign.need, filled: w.sign.filled },
    balloons: w.balloons.filter(b => b.state !== 'gone').map(b => { const g = GEO[b.shape] || GEO.circle; return { id: b.id, state: b.state, shape: b.shape, color: b.color, text: b.text, sprite: b.sprite, answer: b.answer,
      x: b.x, y: b.y, size: b.size, top: b.y + g[0] * b.size, bot: b.y + g[1] * b.size, hw: g[2] * b.size, hitR: 0.6 * b.size + 14,
      strEnd: b.string ? b.string[b.string.length - 1] : null, textCol: A.textColor(b.color) }; }),
    friends: w.friends.map(f => ({ x: f.x, y: f.y, size: f.size, state: f.state, sprite: f.sprite })),
    bubble: R('bubble'), hud: R('hud'), bubbleFont: parseFloat(getComputedStyle(document.getElementById('bubbleText')).fontSize) || null,
    bubbleOverflow: (() => { const b = document.getElementById('bubble'); return b ? b.scrollHeight - b.clientHeight : 0; })(),
    bubbleText: (document.getElementById('bubbleText') || {}).textContent, vw: innerWidth, vh: innerHeight };
});
// background probe: redraw the frame with no balloons and sample the pixels behind every balloon body (and the whole band)
const bgProbe = page => page.evaluate(() => {
  const D = KB.debug, w = D.world, r = D.render(), cv = document.getElementById('game'), g = cv.getContext('2d');
  const keep = w.balloons; const live = keep.filter(b => b.state === 'float' || b.state === 'rise');
  w.balloons = [];
  r.draw(w, D.weather, { dt: 0, lang: 'en', title: false, done: false });
  const rs = cv.width / w.layout.W;
  const img = g.getImageData(0, 0, cv.width, cv.height).data;
  const px = (x, y) => { const X = Math.max(0, Math.min(cv.width - 1, Math.round(x * rs))), Y = Math.max(0, Math.min(cv.height - 1, Math.round(y * rs))), i = (Y * cv.width + X) * 4; return [img[i], img[i + 1], img[i + 2]]; };
  const out = live.map(b => { const s = []; for (let a = 0; a < 16; a++) for (const k of [0, 0.25, 0.45]) s.push(px(b.x + Math.cos(a / 16 * 6.283) * b.size * k, b.y + Math.sin(a / 16 * 6.283) * b.size * k * 1.15)); return { id: b.id, color: b.color, x: b.x, y: b.y, samples: s }; });
  const P = w.layout.play, band = [];
  for (let iy = 0; iy <= 12; iy++) for (let ix = 0; ix <= 20; ix++) band.push(px(P.x + P.w * ix / 20, P.y + P.h * iy / 12));
  w.balloons = keep;
  r.draw(w, D.weather, { dt: 0, lang: 'en', title: false, done: false });
  return { balloons: out, band, amb: { skyTop: D.weather.ambient.skyTop, skyBottom: D.weather.ambient.skyBottom, sun: D.weather.ambient.sun, sunX: D.weather.ambient.sunX, sunY: D.weather.ambient.sunY } };
});

async function screens() {
  const dir = mk(path.join(OUT, 'screens')), J = path.join(dir, 'screens.jsonl');
  try { fs.unlinkSync(J); } catch (e) {}
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`;
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await sleep(500);
    await shot(page, path.join(dir, `${tag}-01-title.png`));
    await page.evaluate(() => { KB.UI.refreshSettings(); KB.UI.only('scrSettings'); });
    await sleep(450);
    await shot(page, path.join(dir, `${tag}-02-settings.png`));
    jl(J, { tag, screen: 'settings', ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel'); const r = p.getBoundingClientRect(); const lab = [...p.querySelectorAll('label, .toggle span, button')].map(e => ({ t: e.textContent.trim().slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth })).filter(e => e.sw > e.cw + 1);
      return { panel: [r.top, r.bottom, innerHeight], scroll: p.scrollHeight - p.clientHeight, clipped: lab }; })) });
    await page.evaluate(() => KB.UI.only('scrTitle'));
    // chapter banner (intro, frozen half-way)
    await page.evaluate(() => { const D = KB.debug; D.startGame(); D.freeze(); D.adv(1.0); });
    await sleep(500);
    await shot(page, path.join(dir, `${tag}-03-banner.png`));
    // play mid-round (colors, level 0 morning), round 1
    await toRound(page, 0, 'colors', 1);
    await shot(page, path.join(dir, `${tag}-04-play.png`));
    jl(J, { tag, screen: 'play', ...(await geom(page)) });
    // wrong tap wobble
    await page.evaluate(() => { const D = KB.debug, w = D.world; const b = w.balloons.find(b => b.state === 'float' && !b.answer); if (b) w.pointerDown(b.x, b.y); D.adv(0.12); D.setSpeed(0.1); });
    await sleep(200);
    await shot(page, path.join(dir, `${tag}-05-wrong.png`));
    await page.evaluate(() => { KB.debug.setSpeed(1); KB.debug.adv(1.2); });
    // pop moment with confetti
    await page.evaluate(() => { const D = KB.debug, w = D.world; const b = w.balloons.find(b => b.state === 'float' && b.answer); if (b) w.pointerDown(b.x, b.y); D.adv(0.1); });
    await page.evaluate(() => KB.debug.setSpeed(0.6));
    await sleep(260);
    await page.evaluate(() => KB.debug.setSpeed(0.1));
    await shot(page, path.join(dir, `${tag}-06-pop.png`));
    await page.evaluate(() => KB.debug.setSpeed(1));
    // count round, 2 pops in
    await toRound(page, 2, 'count', 2);
    await page.evaluate(() => { const D = KB.debug, w = D.world;
      for (let i = 0; i < 40 && (w.sign.need || 0) < 4; i++) { w.round = 2; w._hist = []; w._beginRound(); }
      for (let i = 0; i < 80; i++) { if (w.balloons.every(b => b.state === 'float')) break; D.adv(0.1); }
      for (let k = 0; k < 2; k++) { const b = w.balloons.find(b => b.state === 'float'); if (b) { w.pointerDown(b.x, b.y); D.adv(0.6); } } D.adv(0.6); });
    await sleep(300);
    await shot(page, path.join(dir, `${tag}-07-count.png`));
    jl(J, { tag, screen: 'count', ...(await geom(page)) });
    // animals round with friends on the grass (pop all but the last target)
    await toRound(page, 3, 'animals', 2);
    await page.evaluate(() => { const D = KB.debug, w = D.world; for (let k = 0; k < 6 && w.queue && w.queue.length > 1; k++) { const b = w.balloonById(w.target); if (!b) break; w.pointerDown(b.x, b.y); D.adv(3.2); } });
    await sleep(300);
    await shot(page, path.join(dir, `${tag}-08-animals.png`));
    jl(J, { tag, screen: 'animals', ...(await geom(page)) });
    // pause
    await page.evaluate(() => KB.debug.thaw());
    await page.click('#btnPause'); await sleep(450);
    await shot(page, path.join(dir, `${tag}-09-pause.png`));
    await page.click('#btnResume'); await sleep(150);
    // Talk time
    await page.evaluate(() => { KB.debug.freeze(); KB.debug.world._startTalk(); });
    await sleep(700);
    await shot(page, path.join(dir, `${tag}-10-talk.png`));
    jl(J, { tag, screen: 'talk', ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect(), q = document.getElementById('talkQ');
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], scroll: p.scrollHeight - p.clientHeight, q: q.textContent, qLines: Math.round(q.getBoundingClientRect().height / parseFloat(getComputedStyle(q).lineHeight || 30)),
        choices: [...document.querySelectorAll('#talkChoices button')].map(b => { const c = b.getBoundingClientRect(); return [c.left, c.top, c.width, c.height, b.scrollWidth - b.clientWidth]; }) }; })) });
    // chapter stars banner (levelDone)
    await page.evaluate(() => { const D = KB.debug, w = D.world; w.talkAnswer(w.talk.answerId); D.adv(2.1); D.adv(0.5); });
    await sleep(400);
    await shot(page, path.join(dir, `${tag}-11-chapterstars.png`));
    // long Vietnamese topic names on the banner: count/animals/shapes
    await page.evaluate(() => { const D = KB.debug, w = D.world; w.levels[1] = 'animals'; w.startLevel(1); D.adv(1.0); });
    await sleep(350);
    await shot(page, path.join(dir, `${tag}-12-banner2.png`));
    // done
    await page.evaluate(() => { const D = KB.debug, w = D.world; w.level = w.levels.length - 1; w._levelDone(); D.thaw(); D.setSpeed(6); });
    await page.waitForFunction(() => KB.debug.mode === 'done', null, { timeout: 20000 }).catch(() => console.log('  done not reached', tag));
    await page.evaluate(() => KB.debug.setSpeed(1)); await sleep(1600);
    await shot(page, path.join(dir, `${tag}-13-done.png`));
    jl(J, { tag, screen: 'done', ...(await page.evaluate(() => { const p = document.querySelector('.done-panel').getBoundingClientRect(); return { panel: [p.left, p.top, p.right, p.bottom], vw: innerWidth, vh: innerHeight }; })) });
    await ctx.close();
    console.log('screens', tag);
  }
}

// all 4 times of day: colour rounds at age 3 / 5 (+ shapes at 5), with a background-contrast probe
async function moods() {
  const dir = mk(path.join(OUT, 'moods')), J = path.join(dir, 'moods.jsonl');
  try { fs.unlinkSync(J); } catch (e) {}
  for (const dev of ['iphoneL', 'iphoneP', 'ipadL', 'ipadP']) for (const [age, topic] of [[3, 'colors'], [5, 'shapes'], [4, 'colors']]) for (let lv = 0; lv < 4; lv++) {
    for (const seed of (dev === 'iphoneL' ? [5, 9] : [5])) {
      const { ctx, page } = await open(dev, `age=${age}&lang=en`, { seed });
      await toRound(page, lv, topic, 2);
      const f = `${dev}-a${age}-${topic}-L${lv}-s${seed}.png`;
      await shot(page, path.join(dir, f));
      jl(J, { dev, age, topic, lv, seed, file: f, geom: await geom(page), bg: await bgProbe(page) });
      await ctx.close();
    }
  }
  console.log('moods done');
}

// every topic of every age, both languages spread over the 4 devices; night (worst case) and noon
async function topics() {
  const dir = mk(path.join(OUT, 'topics')), J = path.join(dir, 'topics.jsonl');
  try { fs.unlinkSync(J); } catch (e) {}
  const plan = [['iphoneL', 'en', 3], ['iphoneP', 'vi', 1], ['ipadP', 'en', 1], ['ipadL', 'vi', 3]];
  for (const [dev, lang, lv] of plan) for (const age of [3, 4, 5, 6, 7]) for (const topic of AGE_TOPICS[age]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`);
    await toRound(page, lv, topic, 3);
    const f = `${dev}-${lang}-a${age}-${topic}.png`;
    await shot(page, path.join(dir, f));
    jl(J, { dev, lang, age, topic, lv, file: f, geom: await geom(page), bg: await bgProbe(page) });
    await ctx.close();
  }
  console.log('topics done');
}

// crowded rounds with hit circles + play band drawn (debug=1)
async function hits() {
  const dir = mk(path.join(OUT, 'hits')), J = path.join(dir, 'hits.jsonl');
  try { fs.unlinkSync(J); } catch (e) {}
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL', 'seL']) for (const [age, topic] of [[7, 'oddeven'], [6, 'count'], [5, 'count'], [3, 'size'], [5, 'animals']]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=en&debug=1`);
    await toRound(page, 1, topic, 3);
    if (topic === 'count') {   // re-roll until the biggest count (N ≥ 9)
      await page.evaluate(() => { const D = KB.debug, w = D.world; for (let i = 0; i < 60 && (w.sign.need || 0) < 10; i++) { w.round = 3; w._hist = []; w._beginRound(); }
        for (let i = 0; i < 80; i++) { if (w.balloons.every(b => b.state === 'float')) break; D.adv(0.1); } D.adv(0.6); });
      await sleep(250);
    }
    const f = `${dev}-a${age}-${topic}.png`;
    await shot(page, path.join(dir, f));
    jl(J, { dev, age, topic, file: f, geom: await geom(page) });
    await ctx.close();
  }
  console.log('hits done');
}

async function notch() {
  const dir = mk(path.join(OUT, 'notch')), J = path.join(dir, 'notch.jsonl');
  try { fs.unlinkSync(J); } catch (e) {}
  for (const [dev, n] of [['iphoneP', 'P'], ['iphoneL', 'L']]) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`, { notch: n });
    await shot(page, path.join(dir, `${dev}-${lang}-title.png`));
    jl(J, { dev, lang, screen: 'title', ...(await page.evaluate(() => { const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      return { lang: r('scrTitle') && document.querySelector('.lang-switch').getBoundingClientRect().toJSON(), gear: r('btnParents'), ins: KB.debug.getState().ins }; })) });
    await toRound(page, 0, 'animals', 2);
    await page.evaluate(() => { const D = KB.debug, w = D.world; const b = w.balloonById(w.target); if (b) { w.pointerDown(b.x, b.y); D.adv(3.2); } });
    await sleep(250);
    await shot(page, path.join(dir, `${dev}-${lang}-round.png`));
    jl(J, { dev, lang, screen: 'round', ...(await geom(page)) });
    await page.evaluate(() => { KB.debug.world._startTalk(); }); await sleep(700);
    await shot(page, path.join(dir, `${dev}-${lang}-talk.png`));
    await page.evaluate(() => { const D = KB.debug, w = D.world; w._levelDone(); D.adv(0.1); KB.UI.only(); });
    await page.evaluate(() => KB.debug.thaw());
    await page.click('#btnPause').catch(() => {}); await sleep(400);
    await shot(page, path.join(dir, `${dev}-${lang}-pause.png`));
    await page.click('#btnResume').catch(() => {});
    await page.evaluate(() => { const D = KB.debug, w = D.world; w.level = w.levels.length - 1; w._levelDone(); D.setSpeed(6); });
    await page.waitForFunction(() => KB.debug.mode === 'done', null, { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => KB.debug.setSpeed(1)); await sleep(1500);
    await shot(page, path.join(dir, `${dev}-${lang}-done.png`));
    await ctx.close();
  }
  console.log('notch done');
}

// short landscape phones: title / play / talk / done
async function short() {
  const dir = mk(path.join(OUT, 'short')), J = path.join(dir, 'short.jsonl');
  try { fs.unlinkSync(J); } catch (e) {}
  for (const dev of ['seL', 'miniL']) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await shot(page, path.join(dir, `${dev}-${lang}-title.png`));
    jl(J, { dev, lang, screen: 'title', ...(await page.evaluate(() => { const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
      return { logo: r('.logo'), tagline: r('#tagline'), play: r('#btnPlay'), info: r('.title-info'), lang: r('.lang-switch'), gear: r('#btnParents'), vh: innerHeight, vw: innerWidth }; })) });
    await page.evaluate(() => { KB.UI.refreshSettings(); KB.UI.only('scrSettings'); }); await sleep(400);
    await shot(page, path.join(dir, `${dev}-${lang}-settings.png`));
    await page.evaluate(() => KB.UI.only('scrTitle'));
    await toRound(page, 1, 'shapes', 2);
    await shot(page, path.join(dir, `${dev}-${lang}-play.png`));
    jl(J, { dev, lang, screen: 'play', ...(await geom(page)) });
    await page.evaluate(() => KB.debug.world._startTalk()); await sleep(700);
    await shot(page, path.join(dir, `${dev}-${lang}-talk.png`));
    await page.evaluate(() => { const D = KB.debug, w = D.world; w.level = w.levels.length - 1; w._levelDone(); D.thaw(); D.setSpeed(6); });
    await page.waitForFunction(() => KB.debug.mode === 'done', null, { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => KB.debug.setSpeed(1)); await sleep(1500);
    await shot(page, path.join(dir, `${dev}-${lang}-done.png`));
    jl(J, { dev, lang, screen: 'done', ...(await page.evaluate(() => { const p = document.querySelector('.done-panel').getBoundingClientRect(); return { panel: [p.left, p.top, p.right, p.bottom], vw: innerWidth, vh: innerHeight }; })) });
    await ctx.close();
  }
  console.log('short done');
}

(async () => {
  srv = await serve(); browser = await chromium.launch();
  mk(OUT);
  try {
    if (on('screens')) await screens();
    if (on('moods')) await moods();
    if (on('topics')) await topics();
    if (on('hits')) await hits();
    if (on('notch')) await notch();
    if (on('short')) await short();
  } catch (e) { console.error(e); process.exitCode = 1; }
  await browser.close(); srv.close();
})();
