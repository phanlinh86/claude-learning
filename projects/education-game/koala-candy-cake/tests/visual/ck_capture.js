// Visual QA capture for Lulu's Jungle Tower: every screen × device × language (notch insets emulated), every phase of a
// round (ask, drag, wrong bounce, hint, count glow, bloom + monkey), Talk time, chapter banner/stars, session done; the 4
// times of day (+ the breeze hold pose); every topic × age (ask frame + tower-done frame); a contrast probe per mood.
//   node tests/visual/ck_capture.js [section ...]   sections: screens tod topics contrast talk  (default: all)
// Output: docs/reports/visual/<section>/*.png + *.jsonl. Analyse: node tests/visual/ck_analyze.js
const path = require('path'), fs = require('fs');
const V = require('./ck_lib');
const { OUT, mk, AGE_TOPICS, sleep, jl, open, shot, settle, geom, domRects } = V;
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const reset = f => { try { fs.unlinkSync(f); } catch (e) {} };
const DEVS = ['iphoneP', 'iphoneL', 'ipadP', 'ipadL'];
const roundShot = async (page, J, tag, f, name, keepFx) => { await settle(page, keepFx); await shot(page, f(name)); jl(J, { tag, screen: name, g: await geom(page) }); };

async function screens() {
  const dir = mk(path.join(OUT, 'screens')), J = path.join(dir, 'screens.jsonl'); reset(J);
  for (const dev of DEVS) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await sleep(500); await shot(page, f('01-title'));
    jl(J, { tag, screen: 'title', ...(await domRects(page, ['.logo', '#logo1', '#logo2', '#tagline', '#btnPlay', '.title-info', '.lang-switch', '#btnParents'])) });
    await page.evaluate(() => { CK.UI.refreshSettings && CK.UI.refreshSettings(); CK.UI.only('scrSettings'); });
    await sleep(450); await shot(page, f('02-settings'));
    jl(J, { tag, screen: 'settings', ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel'), r = p.getBoundingClientRect();
      const clipped = [...p.querySelectorAll('label, .toggle span, button, h2')].map(e => ({ t: e.textContent.trim().slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth })).filter(e => e.sw > e.cw + 1);
      const small = [...p.querySelectorAll('button, input, .toggle')].map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.className || e.textContent.trim().slice(0, 12), w: Math.round(b.width), h: Math.round(b.height) }; }).filter(e => e.w && (e.h < 44 || e.w < 44));
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], scroll: p.scrollHeight - p.clientHeight, clipped, small }; })) });
    await page.evaluate(() => CK.UI.only('scrTitle'));
    // chapter banner (intro of chapter 1)
    await page.evaluate(() => { const D = CK.debug; D.startGame(); D.freeze(); D.tod(0); D.adv(0.9); });
    await sleep(400); await shot(page, f('03-banner'));
    // round 3 of colours (4 blocks at age 4), 2nd ask
    await page.evaluate(() => CK.debug.toAsk(0, 'colors', 3, 1));
    await roundShot(page, J, tag, f, '04-ask');
    // drag in progress (60 % of the way, still held)
    await page.evaluate(() => { const D = CK.debug; D.drag(D.rightP(), 8, true, 0.6); D.adv(0.05); });
    await roundShot(page, J, tag, f, '05-drag');
    await page.evaluate(() => { const D = CK.debug, w = D.world; w.cancelDrag(); D.restAll(); });
    // wrong block: dropped over the tower, bounce frame
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.drag(D.wrongP()); D.until(() => w.phase === 'bounce', 3); D.adv(0.12); });
    await roundShot(page, J, tag, f, '06-wrong-bounce', true);
    // 2nd wrong → hint with the ghost hand
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.restAll(); D.adv(0.3); D.drag(D.wrongP()); D.until(() => !!w.hintHand, 4); D.adv(0.55); });
    await roundShot(page, J, tag, f, '07-hint', true);
    // pause
    await page.evaluate(() => { CK.debug.render().fx = []; });
    await page.click('#btnPause'); await sleep(450); await shot(page, f('08-pause'));
    jl(J, { tag, screen: 'pause', ...(await domRects(page, ['#scrPause .panel', '#btnResume', '#btnVolDown', '#btnVolUp', '#btnHome', '#volLevel'])) });
    await page.click('#btnResume'); await sleep(200);
    // tower done: count glow in the middle, then flowers + the monkey grabbing the bananas
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.thaw(); D.freeze(); D.restAll(); D.finishTower(); D.adv(0.95); });
    await roundShot(page, J, tag, f, '09-count-glow', true);
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.until(() => w.monkey && w.monkey.state === 'grab', 5); D.adv(0.15); });
    await roundShot(page, J, tag, f, '10-monkey-grab', true);
    // Talk time
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.until(() => w.state !== 'round', 4); if (w.state !== 'talk') w._startTalk(); });
    await sleep(900); await shot(page, f('11-talk'));
    jl(J, { tag, screen: 'talk', ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect();
      const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height), b.scrollWidth > b.clientWidth + 1, b.textContent.trim()]; });
      const cv = document.getElementById('talkShow').getBoundingClientRect();
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight], overflow: p.scrollHeight - p.clientHeight, choices: ch, show: [Math.round(cv.width), Math.round(cv.height)], q: document.getElementById('talkQ').textContent, title: document.getElementById('talkTitle').textContent }; })) });
    // chapter stars banner
    await page.evaluate(() => { const D = CK.debug, w = D.world; w.talkAnswer(w.talk.answerId); D.until(() => w.state === 'levelDone', 6); D.adv(0.6); });
    await sleep(500); await shot(page, f('12-chapter-stars'));
    // session done: starry-night party
    await page.evaluate(() => { const D = CK.debug, w = D.world; w.level = w.levels.length - 1; w._levelDone(); D.until(() => w.state === 'sessionDone', 5); D.thaw(); });
    await sleep(2400); await shot(page, f('13-done'));
    jl(J, { tag, screen: 'done', ...(await domRects(page, ['#scrDone .done-panel', '#doneTitle', '#btnAgain', '#btnDoneHome', '.done-stars'])) });
    await ctx.close();
    console.log('screens', tag);
  }
}

// the 4 times of day (chapter 1–4), + a tower-done at night and the breeze "hold" pose
async function tod() {
  const dir = mk(path.join(OUT, 'tod')), J = path.join(dir, 'tod.jsonl'); reset(J);
  for (const dev of DEVS) {
    const { ctx, page } = await open(dev, 'age=5&lang=en', { seed: 9 });
    const names = ['morning', 'noon', 'sunset', 'night'];
    for (let lv = 0; lv < 4; lv++) {
      const ok = await page.evaluate(lv => CK.debug.toAsk(lv, 'colors', 3, 2), lv);
      await settle(page); const tag = `${dev}-L${lv}-${names[lv]}`;
      await shot(page, path.join(dir, tag + '.png')); jl(J, { tag, ok, g: await geom(page) });
    }
    // night tower done (all blocks glowing + flowers)
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.finishTower(); D.adv(2.0); });
    await settle(page, true); await shot(page, path.join(dir, `${dev}-night-done.png`));
    // hold pose: the breeze surprise (forced: gust on a 2-block tower, Lulu holds)
    await page.evaluate(() => { const D = CK.debug, w = D.world; D.toAsk(1, 'colors', 2, 2); D.tod(1); w._mood('hold', 30); w.tower.omega += 0.6; D.adv(0.25); });
    await settle(page); await shot(page, path.join(dir, `${dev}-hold.png`));
    jl(J, { tag: dev + '-hold', g: await geom(page), mood: await page.evaluate(() => CK.debug.world.lulu.mood) });
    await ctx.close(); console.log('tod', dev);
  }
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics')), J = path.join(dir, 'topics.jsonl'); reset(J);
  for (const dev of DEVS) for (const lang of ['en', 'vi']) for (const age of [3, 4, 5, 6, 7]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`, { seed: 11 + age });
    for (let k = 0; k < 4; k++) {
      const topic = AGE_TOPICS[age][k];
      const ok = await page.evaluate(([k, topic]) => CK.debug.toAsk(k, topic, 3, 1), [k, topic]);
      await settle(page);
      const tag = `${dev}-${lang}-a${age}-${topic}`;
      await shot(page, path.join(dir, tag + '.png'));
      jl(J, { tag, ok, g: await geom(page) });
      if (lang === 'en') {
        await page.evaluate(() => { const D = CK.debug; D.finishTower(); D.adv(2.1); });
        await settle(page, true);
        await shot(page, path.join(dir, tag + '-done.png'));
        jl(J, { tag: tag + '-done', ok, g: await geom(page) });
      }
    }
    await ctx.close(); console.log('topics', dev, lang, age);
  }
}

// contrast probe: every palette colour as the tray blocks, on every mood, sampled from the real canvas
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
        for (const col of Object.keys(CK.PALETTE)) {
          ps.forEach(p => { p.block = Object.assign({}, p.block, { kind: 'color', color: col, value: col }); });
          r.draw(w, wx, { dt: 0, lang: 'en', title: false, done: false });
          const p = ps[0], h = p.side / 2;
          const face = avg(p.x - h * 0.4, p.y - h * 0.1, p.x + h * 0.4, p.y + h * 0.5);
          // ring 8–26 px around the block, excluding other blocks
          const inAny = (x, y) => ps.some(q => Math.abs(x - q.x) < q.side / 2 + 8 && Math.abs(y - q.y) < q.side / 2 + 8);
          const bg = avg(p.x - h - 26, p.y - h - 26, p.x + h + 26, p.y + h + 26, inAny);
          out[col] = { face, bg };
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

// Talk time for every topic of every age (picture readability, VI fitting)
async function talks() {
  const dir = mk(path.join(OUT, 'talk')), J = path.join(dir, 'talk.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadL']) for (const lang of ['vi', 'en']) for (const age of [3, 4, 5, 6, 7]) {
    if (lang === 'en' && dev !== 'iphoneL') continue;
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`, { seed: 21 + age });
    await page.evaluate(() => { const D = CK.debug; D.startGame(); D.freeze(); D.adv(3); });
    for (const topic of AGE_TOPICS[age]) {
      await page.evaluate(t => { const D = CK.debug, w = D.world; w.state = 'round'; w.topic = t; w._startTalk(); D.adv(0.2); }, topic);
      await sleep(700);
      const tag = `${dev}-${lang}-a${age}-${topic}`;
      await shot(page, path.join(dir, tag + '.png'));
      jl(J, { tag, ...(await page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect();
        const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height), b.scrollWidth > b.clientWidth + 1, b.textContent.trim()]; });
        return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight].map(Math.round), overflow: p.scrollHeight - p.clientHeight, choices: ch, q: document.getElementById('talkQ').textContent }; })) });
    }
    await ctx.close(); console.log('talk', dev, lang, age);
  }
}

(async () => {
  await V.start();
  try {
    if (on('talk')) await talks();
    if (on('screens')) await screens();
    if (on('tod')) await tod();
    if (on('contrast')) await contrast();
    if (on('topics')) await topics();
  } catch (e) { console.log('FAILED', e); }
  await V.stop();
  console.log('done');
})();
