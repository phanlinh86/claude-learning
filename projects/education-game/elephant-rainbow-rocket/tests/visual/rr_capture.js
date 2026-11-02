// Visual QA capture for Bim's Rainbow Rocket: every screen × device × language (notch insets emulated), the 4 times of day,
// every topic × age (ask frame of round 4, hop 2), short SE landscape.
//   node tests/visual/rr_capture.js [section ...]   sections: screens chapters topics short  (default: all)
// Output: tests/out/visual/<section>/*.png + *.jsonl (geometry, DOM rects, sky samples). Analyse: node tests/visual/rr_analyze.js
const path = require('path'), fs = require('fs');
const V = require('./rr_lib');
const { OUT, mk, AGE_TOPICS, sleep, jl, open, shot, geom, skyProbe } = V;
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const reset = f => { try { fs.unlinkSync(f); } catch (e) {} };
const clearFx = page => page.evaluate(() => { RR.debug.render().fx = []; });

// DOM rects of the given selectors in logical px + text overflow
const domRects = (page, sels) => page.evaluate(sels => {
  const v = RR.debug.view(), o = {};
  for (const s of sels) { const e = document.querySelector(s); if (!e) continue; const b = e.getBoundingClientRect(); if (!b.width) continue;
    o[s] = { x: (b.left - v.left) / v.s, y: (b.top - v.top) / v.s, w: b.width / v.s, h: b.height / v.s, css: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
      over: [e.scrollWidth - e.clientWidth, e.scrollHeight - e.clientHeight], txt: (e.textContent || '').trim().slice(0, 60) }; }
  return { W: v.W, H: v.H, s: v.s, left: v.left, top: v.top, ins: v.ins, vw: innerWidth, vh: innerHeight, rects: o };
}, sels);

async function screens() {
  const dir = mk(path.join(OUT, 'screens')), J = path.join(dir, 'screens.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await shot(page, f('01-title'));
    jl(J, { tag, screen: 'title', ...(await domRects(page, ['.logo', '#logo1', '#logo2', '#tagline', '#btnPlay', '.title-info', '.lang-switch', '#btnParents', '.lang-switch .chip'])) });
    await page.evaluate(() => { RR.UI.refreshSettings(); RR.UI.only('scrSettings'); });
    await sleep(450); await shot(page, f('02-settings'));
    jl(J, { tag, screen: 'settings', ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel'), r = p.getBoundingClientRect();
      const clipped = [...p.querySelectorAll('label, .toggle span, button, h2')].map(e => ({ t: e.textContent.trim().slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth })).filter(e => e.sw > e.cw + 1);
      const small = [...p.querySelectorAll('button, input, .toggle')].map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.className || e.textContent.trim().slice(0, 12), w: Math.round(b.width), h: Math.round(b.height) }; }).filter(e => e.w && (e.h < 44 || e.w < 44));
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], scroll: p.scrollHeight - p.clientHeight, clipped, small }; })) });
    await page.evaluate(() => RR.UI.only('scrTitle'));
    // chapter banner (intro of chapter 1)
    await page.evaluate(() => { const D = RR.debug; D.startGame(); D.freeze(); D.weather.setWeather(0, { instant: true }); D.adv(0.8); D.sync(); });
    await sleep(500); await shot(page, f('03-banner'));
    // the ask phase: round 3, hop 1 of colours (3 islands at age 4)
    await page.evaluate(() => RR.debug.toAsk(0, 'colors', 2, 0)); await clearFx(page);
    await sleep(450); await shot(page, f('04-ask'));
    jl(J, { tag, screen: 'ask', g: await geom(page), sky: await skyProbe(page) });
    // drag aim line from the rocket toward an island (no release)
    await page.evaluate(() => { const D = RR.debug, w = D.world, rb = w.rocketHit(), i = w.islandById(w.answerId());
      w.pointerDown(rb.x, rb.y); w.pointerMove((rb.x + i.x) / 2, (rb.y + i.y - w.camY) / 2); w.pointerMove(i.x, i.y - w.camY - 20); D.sync(); });
    await sleep(300); await shot(page, f('05-aim'));
    // mid-flight (release over the island)
    await page.evaluate(() => { const D = RR.debug, w = D.world, i = w.islandById(w.answerId()); w.pointerUp(i.x, i.y - w.camY - 20);
      D.until(() => w.phase === 'fly'); D.adv(0.45); D.sync(); });
    await sleep(120); await shot(page, f('06-fly'));
    jl(J, { tag, screen: 'fly', g: await geom(page) });
    await page.evaluate(() => { const D = RR.debug, w = D.world; D.until(() => w.phase === 'land'); D.adv(0.06); D.sync(); });
    await sleep(120); await shot(page, f('07-land'));
    await page.evaluate(() => { const D = RR.debug, w = D.world; D.until(() => w.flyers.length > 0, 2); D.adv(0.18); D.sync(); });
    await sleep(120); await shot(page, f('08-collect'));
    jl(J, { tag, screen: 'collect', g: await geom(page) });
    // finish the round → boostReady
    await page.evaluate(() => { const D = RR.debug, w = D.world;
      for (let k = 0; k < 3000 && !(w.state === 'roundDone' && w.phase === 'boostReady'); k++) { if (w.state === 'round' && w.phase === 'ask') D.tapAnswer(); D.adv(0.05); }
      D.adv(0.8); D.sync(); });
    await sleep(400); await shot(page, f('09-boostReady'));
    jl(J, { tag, screen: 'boostReady', g: await geom(page), btn: await page.evaluate(() => { const w = RR.debug.world, L = w.layout;
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      return { x: clamp(L.boost.x + (L.rocket.w || 120) * 0.95, L.ins.left + 90, L.W - L.ins.right - 90), y: clamp(L.boost.y, 120, L.H - L.ins.bottom - 90), r: 62 }; }) });
    await page.evaluate(() => { const D = RR.debug, w = D.world; w.pointerDown(w.layout.W / 2, w.layout.H / 2); D.adv(0.75); D.sync(); });
    await sleep(80); await shot(page, f('10-boost'));
    await page.evaluate(() => { const D = RR.debug; D.adv(0.6); D.sync(); });
    await sleep(80); await shot(page, f('11-boost-late'));
    // pause
    await page.evaluate(() => { const D = RR.debug; D.until(() => D.world.phase === 'ask', 15); D.sync(); });
    await clearFx(page);
    await page.click('#btnPause'); await sleep(450); await shot(page, f('12-pause'));
    jl(J, { tag, screen: 'pause', ...(await domRects(page, ['#scrPause .panel', '#btnResume', '#btnVolDown', '#btnVolUp', '#btnHome', '#volLevel'])) });
    await page.click('#btnResume'); await sleep(150);
    // Talk time
    await page.evaluate(() => { const D = RR.debug; D.world._startTalk(); });
    await sleep(800); await shot(page, f('13-talk'));
    jl(J, { tag, screen: 'talk', ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect();
      const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height), b.scrollWidth > b.clientWidth + 1, b.textContent.trim()]; });
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], overflow: p.scrollHeight - p.clientHeight, choices: ch, q: document.getElementById('talkQ').textContent }; })) });
    // chapter stars banner
    await page.evaluate(() => { const D = RR.debug, w = D.world; w.talkAnswer(w.talk.answerId); D.until(() => w.state === 'levelDone', 6); D.adv(0.6); D.sync(); });
    await sleep(500); await shot(page, f('14-chapter-stars'));
    // session done: the moon party
    await page.evaluate(() => { const D = RR.debug, w = D.world;
      w.collected = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'].map(a => ({ kind: 'animal', value: a }));
      w.level = w.levels.length - 1; w._levelDone(); D.until(() => w.state === 'sessionDone', 4); D.thaw(); });
    await sleep(1600); await shot(page, f('15-done'));
    jl(J, { tag, screen: 'done', ...(await domRects(page, ['#scrDone .done-panel', '#doneTitle', '#btnAgain', '#btnDoneHome'])) });
    await ctx.close();
    console.log('screens', tag);
  }
}

async function chapters() {
  const dir = mk(path.join(OUT, 'chapters')), J = path.join(dir, 'chapters.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const [topic, age] of [['colors', 4], ['shapes', 4], ['count', 4]]) {
    if (topic !== 'colors' && dev !== 'iphoneP' && dev !== 'ipadL') continue;
    const { ctx, page } = await open(dev, `age=${age}&lang=en`);
    for (let lv = 0; lv < 4; lv++) {
      const ok = await page.evaluate(([lv, topic]) => { const D = RR.debug; if (D.mode !== 'play') D.startGame(); return D.toAsk(lv, topic, 3, 1); }, [lv, topic]);
      await clearFx(page); await sleep(500);
      const fn = path.join(dir, `${dev}-${topic}-L${lv}.png`); await shot(page, fn);
      jl(J, { tag: `${dev}-${topic}-L${lv}`, ok, g: await geom(page), sky: await skyProbe(page) });
    }
    await ctx.close(); console.log('chapters', dev, topic);
  }
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics')), J = path.join(dir, 'topics.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP']) for (const lang of ['en', 'vi']) for (const age of [3, 4, 5, 6, 7]) {
    if (dev === 'ipadP' && lang === 'vi') continue;
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`, { seed: 11 + age });
    for (let k = 0; k < 4; k++) {
      const topic = AGE_TOPICS[age][k];
      const ok = await page.evaluate(([k, topic]) => { const D = RR.debug; if (D.mode !== 'play') D.startGame(); return D.toAsk(k, topic, 3, 1); }, [k, topic]);
      await clearFx(page); await sleep(450);
      const tag = `${dev}-${lang}-a${age}-${topic}`;
      await shot(page, path.join(dir, tag + '.png'));
      jl(J, { tag, ok, g: await geom(page) });
    }
    await ctx.close(); console.log('topics', dev, lang, age);
  }
}

async function short() {
  const dir = mk(path.join(OUT, 'short')), J = path.join(dir, 'short.jsonl'); reset(J);
  for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open('seL', `age=6&lang=${lang}`);
    await shot(page, path.join(dir, `seL-${lang}-title.png`));
    for (const [lv, topic] of [[0, 'add'], [1, 'initial']]) {
      await page.evaluate(([lv, topic]) => { const D = RR.debug; if (D.mode !== 'play') D.startGame(); return D.toAsk(lv, topic, 3, 1); }, [lv, topic]);
      await clearFx(page); await sleep(450);
      await shot(page, path.join(dir, `seL-${lang}-${topic}.png`));
      jl(J, { tag: `seL-${lang}-${topic}`, g: await geom(page) });
    }
    await page.evaluate(() => RR.debug.world._startTalk()); await sleep(800);
    await shot(page, path.join(dir, `seL-${lang}-talk.png`));
    await ctx.close();
  }
}

(async () => {
  await V.start();
  try {
    if (on('screens')) await screens();
    if (on('chapters')) await chapters();
    if (on('topics')) await topics();
    if (on('short')) await short();
  } finally { await V.stop(); }
})();
