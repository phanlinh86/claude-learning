// Visual QA capture for Dee's Forest Memory: every screen × device × language, every topic × age (peek frame, biggest
// round), the 4 seasons, rewards late in a chapter, notch insets, short landscape phones, half-flipped cards.
//   node tests/visual/capture.js [section ...]   sections: screens topics seasons rewards notch short flip  (default: all)
// Output: tests/out/visual/<section>/*.png + *.jsonl (geometry + background samples). Analyse: node tests/visual/analyze.js
const path = require('path'), fs = require('fs');
const V = require('./lib');
const { OUT, mk, AGE_TOPICS, sleep, jl, open, shot, geom, bgProbe } = V;
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const reset = f => { try { fs.unlinkSync(f); } catch (e) {} };
const RICH = [   // a full session's worth of rewards for the winter party
  ...['fox', 'deer', 'hedgehog', 'squirrel', 'bunny', 'frog', 'bear', 'owl', 'mouse'].map(a => ({ kind: 'animal', sprite: 'animal_' + a })),
  ...['red', 'blue', 'yellow', 'green', 'purple'].map(c => ({ kind: 'butterfly', color: c })),
  ...[['heart', 'red'], ['star', 'yellow'], ['circle', 'blue'], ['triangle', 'green']].map(([s, c]) => ({ kind: 'lantern', shape: s, color: c })),
  { kind: 'acorns', n: 3 }, { kind: 'star', text: 'A' }];

async function screens() {
  const dir = mk(path.join(OUT, 'screens')), J = path.join(dir, 'screens.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await sleep(300); await shot(page, f('01-title'));
    await page.evaluate(() => { RR.UI.refreshSettings(); RR.UI.only('scrSettings'); document.getElementById('optVolume').value = 70; });
    await sleep(400); await shot(page, f('02-settings'));
    jl(J, { tag, screen: 'settings', ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel'), r = p.getBoundingClientRect();
      const clipped = [...p.querySelectorAll('label, .toggle span, button, h2')].map(e => ({ t: e.textContent.trim().slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth, h: e.getBoundingClientRect().height })).filter(e => e.sw > e.cw + 1);
      const sl = document.getElementById('optVolume').getBoundingClientRect();
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], scroll: p.scrollHeight - p.clientHeight, clipped, slider: [sl.width, sl.height] }; })) });
    await page.evaluate(() => RR.UI.only('scrTitle'));
    // chapter banner
    await page.evaluate(() => { const D = RR.debug; D.startGame(); D.freeze(); D.adv(1.0); });
    await sleep(500); await shot(page, f('03-banner'));
    // deal (cards mid-flight), round 2 (3 pairs at age 4)
    await page.evaluate(() => { const D = RR.debug; D.toRound(0, 'colors', 2); D.adv(0.3); D.sync(); });
    await sleep(250); await shot(page, f('04-deal'));
    await page.evaluate(() => RR.debug.peekUp());
    await sleep(250); await shot(page, f('05-peek'));
    jl(J, { tag, screen: 'peek', ...(await geom(page)), probe: await bgProbe(page) });
    // one card up
    await page.evaluate(() => { const D = RR.debug, w = D.world; D.toPlay(); D.tap(w.cards[0]); D.adv(0.5); D.sync(); });
    await sleep(250); await shot(page, f('06-one-up'));
    // two up (mismatch, shake finished, still face up)
    await page.evaluate(() => { const D = RR.debug, w = D.world; const a = w.cards[0], b = w.cards.find(c => c.key !== a.key && c.state === 'down');
      D.tap(b); D.until(() => w._mis); D.adv(0.12); D.sync(); w._shotB = b.id; });
    await sleep(250); await shot(page, f('07-mismatch-shake'));
    await page.evaluate(() => { const D = RR.debug; D.adv(0.5); D.sync(); });
    await sleep(200); await shot(page, f('08-two-up'));
    // match: spin half-way, confetti burst slowed down
    await page.evaluate(() => { const D = RR.debug, w = D.world; D.until(() => !w._mis && w.cards.every(c => c.flip < 0.02), 4); D.adv(0.1);
      const a = w.cards.find(c => c.state === 'down'), b = w.cards.find(c => c !== a && c.key === a.key);
      D.tap(a); D.adv(0.35); D.tap(b); D.until(() => w._anims.length); D.adv(0.5); D.sync(); D.setSpeed(0.1); });
    await sleep(1600); await shot(page, f('09-match'));
    await page.evaluate(() => RR.debug.setSpeed(1));
    // rewards late in the chapter (round 3, one pair left)
    await page.evaluate(() => { const D = RR.debug, w = D.world; w.startLevel(0); w.levels[0] = 'colors'; D.adv(2.6); D.playTo(3, 1); });
    await sleep(300); await shot(page, f('10-rewards-late'));
    jl(J, { tag, screen: 'rewards', ...(await geom(page)), probe: await bgProbe(page) });
    // pause with − / +
    await page.click('#btnPause'); await page.click('#btnVolDown'); await sleep(350); await shot(page, f('11-pause'));
    jl(J, { tag, screen: 'pause', ...(await page.evaluate(() => { const p = document.querySelector('#scrPause .panel').getBoundingClientRect();
      const b = [...document.querySelectorAll('#scrPause button')].map(e => { const r = e.getBoundingClientRect(); return [e.id, Math.round(r.width), Math.round(r.height), e.scrollWidth > e.clientWidth + 1]; });
      return { panel: [p.top, p.bottom, innerHeight], buttons: b }; })) });
    await page.click('#btnVolUp'); await page.click('#btnResume');
    // Talk time
    await page.evaluate(() => { const D = RR.debug, w = D.world; w._startTalk(); });
    await sleep(700); await shot(page, f('12-talk'));
    jl(J, { tag, screen: 'talk', ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect();
      const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height), b.scrollWidth > b.clientWidth + 1, b.textContent.trim()]; });
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], overflow: p.scrollHeight - p.clientHeight, choices: ch, q: document.getElementById('talkQ').textContent }; })) });
    // chapter-done banner (stars)
    await page.evaluate(() => { const D = RR.debug, w = D.world; w.talkAnswer(w.talk.answerId); D.adv(2.2); });
    await sleep(500); await shot(page, f('13-chapter-stars'));
    // session done: the winter party
    await page.evaluate(rich => { const D = RR.debug, w = D.world; w.collected = rich; w.level = w.levels.length - 1; w._levelDone(); D.adv(2.1); }, RICH);
    await sleep(900); await shot(page, f('14-done'));
    jl(J, { tag, screen: 'done', ...(await page.evaluate(() => { const p = document.querySelector('.done-panel').getBoundingClientRect(), v = RR.debug.view();
      return { panel: [p.top, p.bottom, p.left, p.right, innerWidth, innerHeight], s: v.s, left: v.left, top: v.top, groundY: RR.debug.world.layout.groundY, W: v.W, H: v.H }; })) });
    await ctx.close();
    console.log('screens', tag);
  }
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics')), J = path.join(dir, 'topics.jsonl'); reset(J);
  const runs = [['iphoneP', 'en'], ['iphoneL', 'en'], ['ipadP', 'en'], ['ipadL', 'en'], ['iphoneP', 'vi'], ['iphoneL', 'vi']];
  for (const [dev, lang] of runs) for (const age of [3, 4, 5, 6, 7]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`);
    for (let k = 0; k < 4; k++) {
      const topic = AGE_TOPICS[age][k];
      await page.evaluate(([k, t]) => { const D = RR.debug; D.toRound(k, t, 3); D.peekUp(); }, [k, topic]);
      await sleep(200);
      await shot(page, path.join(dir, `${dev}-${lang}-a${age}-${k}-${topic}.png`));
      jl(J, { dev, lang, age, topic, ...(await geom(page)) });
      // grid size sweep for this viewport (2..6 pairs) without drawing
      if (lang === 'en' && k === 0) jl(path.join(dir, 'grids.jsonl'), { dev, age, ...(await page.evaluate(a => { const w = RR.debug.world, L = w.layout, out = {};
        for (let p = 2; p <= 6; p++) { const g = RR.World.chooseGrid(L, 2 * p, a); out[p] = { cols: g.cols, rows: g.rows, cw: +g.cw.toFixed(1), gap: +g.gap.toFixed(1), minOk: g.minOk, css: +(g.cw * RR.debug.view().s).toFixed(1) }; }
        return { sweep: out, W: L.W, H: L.H }; }, age)) });
    }
    await ctx.close();
    console.log('topics', dev, lang, age);
  }
}

async function seasons() {
  const dir = mk(path.join(OUT, 'seasons')), J = path.join(dir, 'seasons.jsonl'); reset(J);
  for (const dev of ['iphoneL', 'ipadP', 'iphoneP', 'ipadL']) {
    const { ctx, page } = await open(dev, 'age=4&lang=en');
    for (let s = 0; s < 4; s++) {
      await page.evaluate(s => { const D = RR.debug; D.toRound(s, 'colors', 2); D.peekUp(); }, s);
      await sleep(300); await shot(page, path.join(dir, `${dev}-s${s}-colors-peek.png`));
      jl(J, { dev, season: s, screen: 'peek', ...(await geom(page)), probe: await bgProbe(page) });
      await page.evaluate(() => { const D = RR.debug; D.toPlay(); });
      await sleep(200); await shot(page, path.join(dir, `${dev}-s${s}-backs.png`));
      // card backs identical? crop every back on the canvas and compare with the first
      jl(J, { dev, season: s, screen: 'backs', backs: await page.evaluate(() => {
        const w = RR.debug.world, cv = document.getElementById('game'), g = cv.getContext('2d'), rs = cv.width / w.layout.W;
        for (const c of w.cards) { c.sx = c.sy = 1; c.rot = c._prot = 0; c.lift = 0; }
        RR.debug.render().draw(w, { ...RR.debug.weather, particles: [] }, { dt: 0, lang: 'en' });
        const grab = c => { const x = Math.round((c.hx - c.w / 2 + 4) * rs), y = Math.round((c.hy - c.h / 2 + 4) * rs), W = Math.floor((c.w - 8) * rs), H = Math.floor((c.h - 8) * rs); return { d: g.getImageData(x, y, W, H).data, W, H }; };
        const ref = grab(w.cards[0]);
        return w.cards.slice(1).map(c => { const o = grab(c); const n = Math.min(o.d.length, ref.d.length); let s = 0; for (let i = 0; i < n; i += 4) s += Math.abs(o.d[i] - ref.d[i]) + Math.abs(o.d[i + 1] - ref.d[i + 1]) + Math.abs(o.d[i + 2] - ref.d[i + 2]); return +(s / (n / 4) / 3).toFixed(2); });
      }) });
    }
    await ctx.close();
    console.log('seasons', dev);
  }
}

async function rewards() {
  const dir = mk(path.join(OUT, 'rewards')), J = path.join(dir, 'rewards.jsonl'); reset(J);
  const plays = [[4, 0, 'colors'], [4, 1, 'shapes'], [4, 2, 'count'], [4, 3, 'animals'], [3, 1, 'size'], [7, 1, 'add']];
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const [age, lv, topic] of plays) {
    const { ctx, page } = await open(dev, `age=${age}&lang=en`, { seed: 9 });
    await page.evaluate(([lv, t]) => { const D = RR.debug, w = D.world; D.startGame(); D.freeze(); w.levels[lv] = t; w.startLevel(lv); D.weather.setWeather(lv, { instant: true }); D.adv(2.6); D.playTo(3, 1); }, [lv, topic]);
    await sleep(300); await shot(page, path.join(dir, `${dev}-a${age}-${topic}-late.png`));
    jl(J, { dev, age, topic, ...(await geom(page)), probe: await bgProbe(page) });
    await ctx.close();
  }
  console.log('rewards done');
}

async function notch() {
  const dir = mk(path.join(OUT, 'notch')), J = path.join(dir, 'notch.jsonl'); reset(J);
  for (const [dev, n] of [['iphoneP', 'P'], ['iphoneL', 'L'], ['ipadP', 'PAD'], ['ipadL', 'PAD']]) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open(dev, `age=7&lang=${lang}`, { notch: n });
    const f = s => path.join(dir, `${dev}-${lang}-${s}.png`);
    await shot(page, f('title'));
    await page.evaluate(() => { const D = RR.debug; D.toRound(3, 'oddeven', 3); D.peekUp(); });
    await sleep(250); await shot(page, f('peek-a7'));
    jl(J, { dev, lang, screen: 'peek', ...(await geom(page)) });
    await page.evaluate(() => { const D = RR.debug, w = D.world; w.startLevel(1); D.adv(2.6); D.playTo(3, 1); });
    await sleep(250); await shot(page, f('rewards'));
    jl(J, { dev, lang, screen: 'rewards', ...(await geom(page)) });
    await page.evaluate(() => RR.debug.world._startTalk()); await sleep(600); await shot(page, f('talk'));
    await page.evaluate(rich => { const D = RR.debug, w = D.world; w.skipTalk(); w.collected = rich; w.level = 3; w._levelDone(); D.adv(2.1); }, RICH);
    await sleep(800); await shot(page, f('done'));
    await ctx.close();
  }
  console.log('notch done');
}

async function short() {
  const dir = mk(path.join(OUT, 'short')), J = path.join(dir, 'short.jsonl'); reset(J);
  for (const dev of ['seL', 'miniL', 'seP']) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open(dev, `age=3&lang=${lang}`);
    const f = s => path.join(dir, `${dev}-${lang}-${s}.png`);
    await shot(page, f('title'));
    await page.evaluate(() => { RR.UI.refreshSettings(); RR.UI.only('scrSettings'); }); await sleep(350); await shot(page, f('settings'));
    jl(J, { dev, lang, screen: 'settings', ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel'), r = p.getBoundingClientRect(), d = document.getElementById('btnSettingsDone').getBoundingClientRect();
      return { panel: [r.top, r.bottom, innerHeight], scroll: p.scrollHeight - p.clientHeight, done: [d.top, d.bottom] }; })) });
    await page.evaluate(() => RR.UI.only('scrTitle'));
    await page.evaluate(() => { const D = RR.debug; D.toRound(3, 'animals', 3); D.peekUp(); });
    await sleep(250); await shot(page, f('peek-a3'));
    jl(J, { dev, lang, screen: 'peek-a3', ...(await geom(page)) });
    { const o7 = await open(dev, `age=7&lang=${lang}`);
      await o7.page.evaluate(() => { const D = RR.debug; D.toRound(3, 'oddeven', 3); D.peekUp(); });
      await sleep(250); await shot(o7.page, f('peek-a7'));
      jl(J, { dev, lang, screen: 'peek-a7', ...(await geom(o7.page)) });
      await o7.ctx.close(); }
    await page.evaluate(() => { const D = RR.debug, w = D.world; w.startLevel(1); D.adv(2.6); D.playTo(3, 1); });
    await sleep(250); await shot(page, f('rewards'));
    jl(J, { dev, lang, screen: 'rewards', ...(await geom(page)) });
    await page.click('#btnPause'); await sleep(300); await shot(page, f('pause'));
    jl(J, { dev, lang, screen: 'pause', ...(await page.evaluate(() => { const p = document.querySelector('#scrPause .panel').getBoundingClientRect(); return { panel: [p.top, p.bottom, innerHeight] }; })) });
    await page.click('#btnResume');
    await page.evaluate(() => RR.debug.world._startTalk()); await sleep(600); await shot(page, f('talk'));
    jl(J, { dev, lang, screen: 'talk', ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect(); return { panel: [r.top, r.bottom, innerHeight], overflow: p.scrollHeight - p.clientHeight }; })) });
    await page.evaluate(rich => { const D = RR.debug, w = D.world; w.skipTalk(); w.collected = rich; w.level = 3; w._levelDone(); D.adv(2.1); }, RICH);
    await sleep(800); await shot(page, f('done'));
    jl(J, { dev, lang, screen: 'done', ...(await page.evaluate(() => { const p = document.querySelector('.done-panel').getBoundingClientRect(); return { panel: [p.top, p.bottom, p.left, p.right, innerWidth, innerHeight] }; })) });
    await ctx.close();
  }
  console.log('short done');
}

async function flip() {   // half-flipped cards close up + hint glow
  const dir = mk(path.join(OUT, 'flip'));
  for (const dev of ['ipadL', 'iphoneP']) {
    const { ctx, page } = await open(dev, 'age=4&lang=en');
    await page.evaluate(() => { const D = RR.debug, w = D.world; D.toRound(3, 'animals', 3); D.toPlay();
      const F = [0.15, 0.35, 0.45, 0.55, 0.65, 0.85]; w.cards.forEach((c, i) => { c.flip = c._pflip = F[i % F.length]; c.lift = Math.sin(Math.PI * c.flip); }); D.sync(); });
    await sleep(250); await shot(page, path.join(dir, `${dev}-halfflip.png`));
    const r = await page.evaluate(() => RR.debug.world.layout.grid.rect);
    const v = await page.evaluate(() => RR.debug.view());
    await page.screenshot({ path: path.join(dir, `${dev}-halfflip-zoom.png`), clip: { x: v.left + (r.x - 20) * v.s, y: v.top + (r.y - 20) * v.s, width: (r.w + 40) * v.s, height: (r.h + 40) * v.s } });
    await page.evaluate(() => { const D = RR.debug, w = D.world; w.cards.forEach(c => { c.flip = c._pflip = 0; c.lift = 0; }); w.cards[0].glowT = 1.2; w.cards[1].glowT = 1.2; D.adv(0.01); D.sync(); });
    await sleep(200); await shot(page, path.join(dir, `${dev}-hint.png`));
    await ctx.close();
  }
}

(async () => {
  await V.start();
  try {
    if (on('screens')) await screens();
    if (on('topics')) await topics();
    if (on('seasons')) await seasons();
    if (on('rewards')) await rewards();
    if (on('notch')) await notch();
    if (on('short')) await short();
    if (on('flip')) await flip();
  } catch (e) { console.error(e); process.exitCode = 1; }
  await V.stop();
})();
