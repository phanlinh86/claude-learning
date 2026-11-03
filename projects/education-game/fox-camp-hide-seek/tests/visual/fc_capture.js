// Visual QA capture for Pip's Camp Hide & Seek: every screen × device × language (notch insets emulated), every phase of a
// round (gather, count, ask, peek/boo, found/hop, seated, party), Talk time, chapter banner, session done; the 4 seasons;
// every topic × age (ask frame + party frame of the biggest round).
//   node tests/visual/fc_capture.js [section ...]   sections: screens seasons topics short  (default: all)
// Output: tests/out/visual/<section>/*.png + *.jsonl (geometry, DOM rects, pixel probes). Analyse: node tests/visual/fc_analyze.js
const path = require('path'), fs = require('fs');
const V = require('./fc_lib');
const { OUT, mk, AGE_TOPICS, sleep, jl, open, shot, geom, probe } = V;
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const reset = f => { try { fs.unlinkSync(f); } catch (e) {} };
// wait two frames so main.js drains the events of the hand-stepped world (count numerals, puffs …), then clear the fx
const clearFx = async page => { await sleep(150); await page.evaluate(() => { FC.debug.render().fx = []; }); };

// DOM rects of the given selectors in logical px + text overflow
const domRects = (page, sels) => page.evaluate(sels => {
  const v = FC.debug.view(), o = {};
  for (const s of sels) { const e = document.querySelector(s); if (!e) continue; const b = e.getBoundingClientRect(); if (!b.width) continue;
    o[s] = { css: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)],
      over: [e.scrollWidth - e.clientWidth, e.scrollHeight - e.clientHeight], txt: (e.textContent || '').trim().slice(0, 60) }; }
  const cs = getComputedStyle(document.documentElement), sa = k => parseFloat(cs.getPropertyValue(k)) || 0;
  return { W: v.W, H: v.H, s: v.s, ins: v.ins, vw: innerWidth, vh: innerHeight, sa: [sa('--sa-t'), sa('--sa-r'), sa('--sa-b'), sa('--sa-l')], rects: o };
}, sels);
const roundShot = async (page, J, tag, f, name) => { await clearFx(page); await sleep(250); await shot(page, f(name)); jl(J, { tag, screen: name, g: await geom(page), pr: await probe(page) }); };

async function screens() {
  const dir = mk(path.join(OUT, 'screens')), J = path.join(dir, 'screens.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await sleep(600); await shot(page, f('01-title'));
    jl(J, { tag, screen: 'title', ...(await domRects(page, ['.logo', '#logo1', '#logo2', '#tagline', '#btnPlay', '.title-info', '.lang-switch', '#btnParents'])) });
    await page.evaluate(() => { FC.UI.refreshSettings(); FC.UI.only('scrSettings'); });
    await sleep(450); await shot(page, f('02-settings'));
    jl(J, { tag, screen: 'settings', ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel') || document.querySelector('#scrSettings .panel'), r = p.getBoundingClientRect();
      const clipped = [...p.querySelectorAll('label, .toggle span, button, h2')].map(e => ({ t: e.textContent.trim().slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth })).filter(e => e.sw > e.cw + 1);
      const small = [...p.querySelectorAll('button, input, .toggle')].map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.className || e.textContent.trim().slice(0, 12), w: Math.round(b.width), h: Math.round(b.height) }; }).filter(e => e.w && (e.h < 44 || e.w < 44));
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], scroll: p.scrollHeight - p.clientHeight, clipped, small }; })) });
    await page.evaluate(() => FC.UI.only('scrTitle'));
    // chapter banner (intro of chapter 1)
    await page.evaluate(() => { const D = FC.debug; D.startGame(); D.freeze(); D.weather.setWeather(0, { instant: true }); D.adv(0.8); D.season(); });
    await sleep(500); await shot(page, f('03-banner'));
    // round 3 (index 3: 4 places at age 4) of colours
    await page.evaluate(() => FC.debug.toRound(0, 'colors', 3));
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.adv(0.75); });
    await roundShot(page, J, tag, f, '04-gather');
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.until(() => w.phase === 'count'); D.adv(0.2); });
    await roundShot(page, J, tag, f, '05-count');
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.adv(0.9); });
    await roundShot(page, J, tag, f, '06-count-run');
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.until(() => w.phase === 'ask'); D.adv(0.5); });
    await roundShot(page, J, tag, f, '07-ask');
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.tap(D.wrongId()); D.adv(0.45); });
    await roundShot(page, J, tag, f, '08-boo');
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.until(() => w.phase === 'ask' && w.places.every(p => p.open < 0.05) && !w._locked(), 5); D.adv(0.1); D.tapAnswer(); D.adv(0.2); });
    await roundShot(page, J, tag, f, '09-peek-right');
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.adv(0.35); });
    await roundShot(page, J, tag, f, '10-found-hop');
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.until(() => w.phase === 'ask'); D.adv(0.6); });
    await roundShot(page, J, tag, f, '11-ask2-seated');
    // pause
    await clearFx(page);
    await page.click('#btnPause'); await sleep(450); await shot(page, f('13-pause'));
    jl(J, { tag, screen: 'pause', ...(await domRects(page, ['#scrPause .panel', '#btnResume', '#btnVolDown', '#btnVolUp', '#btnHome', '#volLevel'])) });
    await page.click('#btnResume'); await sleep(150);
    await page.evaluate(() => { const D = FC.debug, w = D.world;
      for (let k = 0; k < 4000 && w.phase !== 'party'; k++) { if (w.phase === 'ask') D.tapAnswer(); D.adv(0.05); }
      D.adv(1.4); });
    await roundShot(page, J, tag, f, '12-party');
    // Talk time
    await page.evaluate(() => { const D = FC.debug, w = D.world; if (!D.until(() => w.state === 'talk', 12)) w._startTalk(); });
    await sleep(900); await shot(page, f('14-talk'));
    jl(J, { tag, screen: 'talk', ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel') || document.querySelector('#scrTalk .panel'), r = p.getBoundingClientRect();
      const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height), b.scrollWidth > b.clientWidth + 1, b.textContent.trim()]; });
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], overflow: p.scrollHeight - p.clientHeight, choices: ch, q: document.getElementById('talkQ').textContent }; })) });
    // chapter stars banner
    await page.evaluate(() => { const D = FC.debug, w = D.world; w.talkAnswer(w.talk.answerId); D.until(() => w.state === 'levelDone', 6); D.adv(0.6); });
    await sleep(500); await shot(page, f('15-chapter-stars'));
    // next chapter banner (summer)
    await page.evaluate(() => { const D = FC.debug, w = D.world; D.until(() => w.state === 'intro', 6); D.adv(0.8); D.weather.setWeather(1, { instant: true }); D.season(); });
    await sleep(400); await shot(page, f('16-banner-summer'));
    // session done: the winter-night campfire party
    await page.evaluate(() => { const D = FC.debug, w = D.world;
      w.met = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'];
      w.level = w.levels.length - 1; w._levelDone(); D.until(() => w.state === 'sessionDone', 4); D.thaw(); });
    await sleep(2200); await shot(page, f('17-done'));
    jl(J, { tag, screen: 'done', ...(await domRects(page, ['#scrDone .done-panel', '#doneTitle', '#btnAgain', '#btnDoneHome', '.done-stars'])) });
    await ctx.close();
    console.log('screens', tag);
  }
}

async function seasons() {
  const dir = mk(path.join(OUT, 'seasons')), J = path.join(dir, 'seasons.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const [topic, age] of [['colors', 4], ['colors', 5], ['shapes', 4], ['count', 4]]) {
    if (topic !== 'colors' && dev !== 'iphoneP' && dev !== 'ipadL') continue;
    const { ctx, page } = await open(dev, `age=${age}&lang=en`, { seed: 7 + age });
    for (let lv = 0; lv < 4; lv++) {
      const ok = await page.evaluate(([lv, topic]) => FC.debug.toAsk(lv, topic, 3, 0), [lv, topic]);
      await clearFx(page); await sleep(300);
      const tag = `${dev}-${topic}${age}-L${lv}`;
      await shot(page, path.join(dir, tag + '.png'));
      jl(J, { tag, ok, g: await geom(page), pr: await probe(page) });
    }
    await ctx.close(); console.log('seasons', dev, topic, age);
  }
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics')), J = path.join(dir, 'topics.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const lang of ['en', 'vi']) for (const age of [3, 4, 5, 6, 7]) {
    if ((dev === 'ipadP' || dev === 'ipadL') && lang === 'vi') continue;
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`, { seed: 11 + age });
    for (let k = 0; k < 4; k++) {
      const topic = AGE_TOPICS[age][k];
      const ok = await page.evaluate(([k, topic]) => FC.debug.toAsk(k, topic, 3, 1), [k, topic]);
      await clearFx(page); await sleep(300);
      const tag = `${dev}-${lang}-a${age}-${topic}`;
      await shot(page, path.join(dir, tag + '.png'));
      jl(J, { tag, ok, g: await geom(page), pr: await probe(page) });
      await page.evaluate(() => { const D = FC.debug, w = D.world;
        for (let i = 0; i < 4000 && w.state === 'round' && w.phase !== 'party'; i++) { if (w.phase === 'ask') D.tapAnswer(); D.adv(0.05); }
        D.until(() => w.friends.every(f => f.state === 'seated' || f.state === 'dance'), 6); D.adv(0.3); });
      await clearFx(page); await sleep(250);
      await shot(page, path.join(dir, tag + '-party.png'));
      jl(J, { tag: tag + '-party', ok, g: await geom(page), pr: await probe(page) });
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
      await page.evaluate(([lv, topic]) => FC.debug.toAsk(lv, topic, 3, 1), [lv, topic]);
      await clearFx(page); await sleep(300);
      await shot(page, path.join(dir, `seL-${lang}-${topic}.png`));
      jl(J, { tag: `seL-${lang}-${topic}`, g: await geom(page), pr: await probe(page) });
    }
    await page.evaluate(() => FC.debug.world._startTalk()); await sleep(800);
    await shot(page, path.join(dir, `seL-${lang}-talk.png`));
    await ctx.close();
  }
}

(async () => {
  await V.start();
  try {
    if (on('screens')) await screens();
    if (on('seasons')) await seasons();
    if (on('topics')) await topics();
    if (on('short')) await short();
  } finally { await V.stop(); }
})();
