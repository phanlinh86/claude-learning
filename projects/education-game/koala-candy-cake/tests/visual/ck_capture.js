// Visual QA capture for Koko's Cake Tower: every screen × device × language (notch insets emulated), every phase of a
// round (ask, drag, falling layer, jelly landing, wrong bounce, hint, cherry + lit candles, Koko blowing), Talk time,
// chapter banner/stars, session done (rainbow party); the 4 weathers (+ breeze hold pose, bee); every topic × age (ask frame
// + done frame on the tallest cake); a contrast probe of every answer colour per weather mood.
//   VQA_OUT=/some/scratch node tests/visual/ck_capture.js [section ...]   sections: screens weather topics contrast  (default: all)
// Output: $VQA_OUT/<section>/*.png + *.jsonl (default docs/reports/visual). Analyse: node tests/visual/ck_analyze.js
const path = require('path'), fs = require('fs');
const V = require('./ck_lib');
const { OUT, mk, AGE_TOPICS, sleep, jl, open, shot, settle, geom, domRects } = V;
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const reset = f => { try { fs.unlinkSync(f); } catch (e) {} };
const DEVS = (process.env.VQA_DEVS || 'iphoneP,iphoneL,ipadP,ipadL').split(',');
const roundShot = async (page, J, tag, f, name, keepFx) => { await settle(page, keepFx); await shot(page, f(name)); jl(J, { tag, screen: name, g: await geom(page) }); };
// done sequence: step to phaseTime ≥ t (0.15 cherry hop, 0.65 + 0.45·i count/candle i, blow ≈ count n + 0.45)
const DONE_AT = `(function (D, w, t) { D.finishTower(); D.until(() => w.phase !== 'done' || w.phaseTime >= t, 8); })`;

async function screens() {
  const dir = mk(path.join(OUT, 'screens')), J = path.join(dir, 'screens.jsonl'); reset(J);
  for (const dev of DEVS) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await sleep(500); await shot(page, f('01-title'));
    jl(J, { tag, screen: 'title', ...(await domRects(page, ['.logo', '#logo1', '#logo2', '#tagline', '#btnPlay', '.title-info', '#titleStars', '#titleAge', '#btnParents'])) });
    // real parent gate: hold the gear 2.2 s
    const gb = await page.locator('#btnParents').boundingBox();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down(); await sleep(1000);
    await shot(page, f('02a-gear-holding'));
    await sleep(1300); await page.mouse.up();
    const opened = await page.evaluate(() => !document.getElementById('scrSettings').classList.contains('hidden'));
    if (!opened) await page.evaluate(() => { CK.UI.refreshSettings && CK.UI.refreshSettings(); CK.UI.only('scrSettings'); });
    await sleep(450); await shot(page, f('02-settings'));
    jl(J, { tag, screen: 'settings', gateOpened: opened, ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel'), r = p.getBoundingClientRect();
      const clipped = [...p.querySelectorAll('label, .toggle span, button, h2, p, span')].map(e => ({ t: e.textContent.trim().slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth })).filter(e => e.cw && e.sw > e.cw + 1);
      const small = [...p.querySelectorAll('button, input, .toggle')].map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.className || e.textContent.trim().slice(0, 12), w: Math.round(b.width), h: Math.round(b.height) }; }).filter(e => e.w && (e.h < 44 || e.w < 44));
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight].map(Math.round), scroll: p.scrollHeight - p.clientHeight, clipped, small }; })) });
    await page.evaluate(() => CK.UI.only('scrTitle'));
    await page.evaluate(() => { const D = CK.debug; D.startGame(); D.freeze(); D.tod(0); D.adv(0.9); });
    await sleep(400); await shot(page, f('03-banner'));
    await page.evaluate(() => CK.debug.toAsk(0, 'colors', 3, 1));
    await roundShot(page, J, tag, f, '04-ask');
    await page.evaluate(() => { const D = CK.debug; D.drag(D.rightP(), 8, true, 0.6); D.adv(0.05); });
    await roundShot(page, J, tag, f, '05-drag');
    await page.evaluate(() => { const D = CK.debug, w = D.world; w.cancelDrag(); D.restAll(); });
    // wrong block dropped over the cake → bounce
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.drag(D.wrongP()); D.until(() => w.phase === 'bounce', 3); D.adv(0.12); });
    await roundShot(page, J, tag, f, '06-wrong-bounce', true);
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.restAll(); D.adv(0.3); D.drag(D.wrongP()); D.until(() => !!w.hintHand, 4); D.adv(0.55); });
    await roundShot(page, J, tag, f, '07-hint', true);
    await page.evaluate(() => { CK.debug.render().fx = []; });
    await page.click('#btnPause'); await sleep(450); await shot(page, f('08-pause'));
    jl(J, { tag, screen: 'pause', ...(await domRects(page, ['#scrPause .panel', '#btnResume', '#btnVolDown', '#btnVolUp', '#btnHome', '#volLevel'])) });
    await page.click('#btnResume'); await sleep(200);
    // falling layer (released, mid-air) + jelly landing
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.thaw(); D.freeze(); D.restAll(); D.adv(0.2); D.restAll(); D.drag(D.rightP()); D.adv(0.06); });
    await roundShot(page, J, tag, f, '09-falling', true);
    await page.evaluate(() => { const D = CK.debug, w = D.world, n0 = w.tower.blocks.length; D.until(() => w.tower.blocks.length > n0, 3); D.adv(0.04); });
    await roundShot(page, J, tag, f, '10-landing', true);
    // done: cherry on + all candles lit, then Koko blowing
    await page.evaluate(DONE_AT + '(CK.debug, CK.debug.world, 0)');
    await page.evaluate(() => { const D = CK.debug, w = D.world, n = w._liveCount(); D.until(() => w.phaseTime >= 0.65 + 0.45 * (n - 1) + 0.35, 6); });
    await roundShot(page, J, tag, f, '11-candles-lit', true);
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.until(() => w.koko.mood === 'blow', 3); D.adv(0.3); });
    await roundShot(page, J, tag, f, '12-blow', true);
    // Talk time
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.until(() => w.state !== 'round', 4); if (w.state !== 'talk') { w.state = 'round'; w._startTalk(); } });
    await sleep(900); await shot(page, f('13-talk'));
    jl(J, { tag, screen: 'talk', ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect();
      const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height), b.scrollWidth > b.clientWidth + 1, b.textContent.trim()]; });
      const cv = document.getElementById('talkShow').getBoundingClientRect();
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight].map(Math.round), overflow: p.scrollHeight - p.clientHeight, choices: ch, show: [Math.round(cv.width), Math.round(cv.height)], q: document.getElementById('talkQ').textContent, title: document.getElementById('talkTitle').textContent }; })) });
    await page.evaluate(() => { const D = CK.debug, w = D.world; w.talkAnswer(w.talk.answerId); D.until(() => w.state === 'levelDone', 6); D.adv(0.6); });
    await sleep(500); await shot(page, f('14-chapter-stars'));
    await page.evaluate(() => { const D = CK.debug, w = D.world; w.level = w.levels.length - 1; w._levelDone(); D.until(() => w.state === 'sessionDone', 5); D.thaw(); });
    await sleep(2400); await shot(page, f('15-session-done'));
    jl(J, { tag, screen: 'done', ...(await domRects(page, ['#scrDone .done-panel', '#doneTitle', '#doneStars', '#btnAgain', '#btnDoneHome'])) });
    await ctx.close();
    console.log('screens', tag);
  }
}

// the 4 weathers (chapter 0–3) mid-round, + the breeze hold pose and the bee surprise
async function weather() {
  const dir = mk(path.join(OUT, 'weather')), J = path.join(dir, 'weather.jsonl'); reset(J);
  const names = ['sunny', 'breezy', 'rain', 'rainbow'];
  for (const dev of DEVS) {
    const { ctx, page } = await open(dev, 'age=4&lang=en', { seed: 9 });
    for (let lv = 0; lv < 4; lv++) {
      const ok = await page.evaluate(lv => { const D = CK.debug; const r = D.toAsk(lv, 'colors', 3, 2); D.thaw(); return r; }, lv);
      await sleep(1500);   // let weather particles run (thawed; the bot is off, so no stack happens)
      await page.evaluate(() => CK.debug.freeze());
      await settle(page, true); const tag = `${dev}-L${lv}-${names[lv]}`;
      await shot(page, path.join(dir, tag + '.png')); jl(J, { tag, ok, mood: await page.evaluate(() => CK.debug.weather.ambient.mood), g: await geom(page) });
    }
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.toAsk(1, 'colors', 2, 1); D.tod(1); w.tower.omega += 0.6; D.adv(0.25); });
    await settle(page); await page.evaluate(() => { CK.debug.world._mood('hold', 30); }); await sleep(150); await shot(page, path.join(dir, `${dev}-hold.png`));
    jl(J, { tag: dev + '-hold', g: await geom(page), moodAfter: await page.evaluate(() => CK.debug.world.koko.mood) });
    const bee = await page.evaluate(() => { const D = CK.debug, w = D.world; D.toAsk(2, 'colors', 2, 1); w._beeDone = false; w.bee = null; w._beeAt = w.time + 0.01; D.until(() => w.bee && w.bee.state === 'sit', 6); return w.bee && w.bee.state; });
    await settle(page); await shot(page, path.join(dir, `${dev}-bee.png`)); jl(J, { tag: dev + '-bee', bee, g: await geom(page) });
    await ctx.close(); console.log('weather', dev);
  }
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics')), J = path.join(dir, 'topics.jsonl'); reset(J);
  for (const dev of DEVS) for (const lang of ['en', 'vi']) for (const age of [3, 4, 5, 6, 7]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`, { seed: 11 + age });
    for (let k = 0; k < AGE_TOPICS[age].length; k++) {
      const topic = AGE_TOPICS[age][k];
      // last round (the tallest cake), 2nd ask
      const ok = await page.evaluate(([k, topic]) => { const D = CK.debug, w = D.world; D.startGame(); D.freeze(); const ri = w.roundsPerLevel - 1; return D.toAsk(Math.min(k, 3), topic, ri, 1); }, [k, topic]);
      await settle(page);
      const tag = `${dev}-${lang}-a${age}-${topic}`;
      await shot(page, path.join(dir, tag + '.png'));
      jl(J, { tag, ok, g: await geom(page) });
      if (lang === 'en' || dev === 'iphoneL') {
        await page.evaluate(() => { const D = CK.debug, w = D.world; D.finishTower(); const n = w._liveCount(); D.until(() => w.phase !== 'done' || w.phaseTime >= 0.65 + 0.45 * (n - 1) + 0.35, 8); });
        await settle(page, true);
        await shot(page, path.join(dir, tag + '-done.png'));
        jl(J, { tag: tag + '-done', ok, g: await geom(page) });
      }
    }
    await ctx.close(); console.log('topics', dev, lang, age);
  }
}

// contrast probe: every palette colour as the tray layers, on every mood, sampled from the real canvas
async function contrast() {
  const dir = mk(path.join(OUT, 'contrast')), J = path.join(dir, 'contrast.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'ipadL']) {
    const { ctx, page } = await open(dev, 'age=5&lang=en', { seed: 3 });
    for (let lv = 0; lv < 4; lv++) {
      await page.evaluate(lv => CK.debug.toAsk(lv, 'colors', 1, 0), lv);
      await settle(page);
      const res = await page.evaluate(() => {
        const D = CK.debug, w = D.world, r = D.render(), wx = D.weather, cv = document.getElementById('game'), g = cv.getContext('2d');
        const rs = cv.width / w.layout.W, keepP = wx.particles; wx.particles = [];
        const ps = w.pieces.filter(p => p.askIdx === w.ask && p.state === 'rest');
        const keep = ps.map(p => p.block), out = {};
        const avg = (x0, y0, x1, y1, skip) => { x0 = Math.max(0, Math.round(x0 * rs)); y0 = Math.max(0, Math.round(y0 * rs)); x1 = Math.min(cv.width, Math.round(x1 * rs)); y1 = Math.min(cv.height, Math.round(y1 * rs));
          const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, n = [0, 0, 0]; let c = 0;
          for (let y = 0; y < y1 - y0; y += 2) for (let x = 0; x < x1 - x0; x += 2) { if (skip && skip((x0 + x) / rs, (y0 + y) / rs)) continue; const i = (y * (x1 - x0) + x) * 4; n[0] += d[i]; n[1] += d[i + 1]; n[2] += d[i + 2]; c++; }
          return c ? n.map(v => Math.round(v / c)) : null; };
        const inAny = (x, y) => ps.some(q => Math.abs(x - q.x) < q.bw / 2 + 8 && Math.abs(y - q.y) < q.bh / 2 + 8);
        for (const col of Object.keys(CK.PALETTE)) {
          ps.forEach(p => { p.block = Object.assign({}, p.block, { kind: 'color', color: col, value: col }); });
          r.draw(w, wx, { dt: 0, lang: 'en', title: false, done: false });
          const p = ps[0], hw = p.bw / 2, hh = p.bh / 2;
          const frost = avg(p.x - hw * 0.5, p.y - hh * 0.78, p.x + hw * 0.5, p.y - hh * 0.5);   // frosting band on top
          const face = avg(p.x - hw * 0.5, p.y + hh * 0.05, p.x + hw * 0.5, p.y + hh * 0.6);  // sponge front
          const bg = avg(p.x - hw - 26, p.y - hh - 26, p.x + hw + 26, p.y + hh + 26, inAny);
          out[col] = { face, frost, bg };
        }
        ps.forEach((p, i) => { p.block = keep[i]; });
        wx.particles = keepP;
        return { mood: wx.ambient.mood, out };
      });
      jl(J, { dev, lv, ...res });
      await shot(page, path.join(dir, `${dev}-L${lv}.png`));
    }
    await ctx.close(); console.log('contrast', dev);
  }
}

(async () => {
  await V.start();
  try {
    if (on('screens')) await screens();
    if (on('weather')) await weather();
    if (on('contrast')) await contrast();
    if (on('topics')) await topics();
  } catch (e) { console.log('FAILED', e); }
  await V.stop();
  console.log('done');
})();
