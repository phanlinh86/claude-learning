// Visual QA capture for Bop's Rainy Band: every screen × device × language (notch insets emulated), every phase of a
// round (ask, flying note, wrong wobble, hint hand, song playback), counting (drum card, listen), Talk time, chapter stars,
// session done; the 4 seasons; every topic × age; snail + shower surprises; a contrast probe per season.
//   RB_VIS_OUT=/some/dir node tests/visual/rb_capture.js [section ...]
//   sections: screens count seasons topics surprise talk contrast   (default: all)
// Output: $RB_VIS_OUT/<section>/*.png + *.jsonl. Analyse: node tests/visual/rb_analyze.js
const path = require('path'), fs = require('fs');
const V = require('./rb_lib');
const { OUT, mk, AGE_TOPICS, sleep, jl, open, shot, settle, geom, domRects } = V;
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const reset = f => { try { fs.unlinkSync(f); } catch (e) {} };
const DEVS = ['iphoneP', 'iphoneL', 'ipadP', 'ipadL'];
const roundShot = async (page, J, tag, f, name, keepFx) => { await settle(page, keepFx); await shot(page, f(name)); jl(J, { tag, screen: name, g: await geom(page) }); };
const talkInfo = page => page.evaluate(() => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect();
  const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const q = b.getBoundingClientRect(), cv = b.querySelector('canvas'), cr = cv && cv.getBoundingClientRect(), sm = b.querySelector('small');
    return { w: Math.round(q.width), h: Math.round(q.height), clip: b.scrollWidth > b.clientWidth + 1, txt: b.textContent.trim(), pic: cr ? [Math.round(cr.width), Math.round(cr.height)] : null, smallFs: sm ? getComputedStyle(sm).fontSize : null, fs: getComputedStyle(b).fontSize }; });
  const cv = document.getElementById('talkShow').getBoundingClientRect();
  return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight].map(Math.round), overflow: p.scrollHeight - p.clientHeight, choices: ch, show: [Math.round(cv.width), Math.round(cv.height)],
    q: document.getElementById('talkQ').textContent, title: document.getElementById('talkTitle').textContent, mic: !document.getElementById('btnMic').classList.contains('hidden') }; });

async function screens() {
  const dir = mk(path.join(OUT, 'screens')), J = path.join(dir, 'screens.jsonl'); reset(J);
  for (const dev of DEVS) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await sleep(500); await shot(page, f('01-title'));
    jl(J, { tag, screen: 'title', ...(await domRects(page, ['.logo', '#logo1', '#logo2', '#tagline', '#btnPlay', '.title-info', '.lang-switch', '#btnParents'])) });
    await page.evaluate(() => { RB.UI.refreshSettings && RB.UI.refreshSettings(); RB.UI.only('scrSettings'); });
    await sleep(450); await shot(page, f('02-settings'));
    jl(J, { tag, screen: 'settings', ...(await page.evaluate(() => { const p = document.querySelector('.settings-panel'), r = p.getBoundingClientRect();
      const clipped = [...p.querySelectorAll('label, .toggle span, button, h2')].map(e => ({ t: e.textContent.trim().slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth })).filter(e => e.sw > e.cw + 1);
      const small = [...p.querySelectorAll('button, input, .toggle')].map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.className || e.textContent.trim().slice(0, 12), w: Math.round(b.width), h: Math.round(b.height) }; }).filter(e => e.w && (e.h < 44 || e.w < 44));
      return { panel: [r.top, r.bottom, r.left, r.right, innerWidth, innerHeight].map(Math.round), scroll: p.scrollHeight - p.clientHeight, clipped, small }; })) });
    await page.evaluate(() => RB.UI.only('scrTitle'));
    // chapter banner (intro of chapter 1)
    await page.evaluate(() => { const D = RB.debug; D.startGame(); D.freeze(); D.tod(0); D.adv(0.9); });
    await sleep(400); await shot(page, f('03-banner'));
    jl(J, { tag, screen: 'banner', g: await geom(page) });
    // round 1 of colours (3 members at age 4), 2nd ask
    await page.evaluate(() => RB.debug.toAsk(0, 'colors', 1, 1));
    await roundShot(page, J, tag, f, '04-ask');
    // right tap: the note is in the air
    await page.evaluate(() => { const D = RB.debug; D.tapRight(); D.adv(0.25); });
    await roundShot(page, J, tag, f, '05-flynote', true);
    // next ask: wrong tap (wobble), then the 2nd wrong → hint with the ghost hand
    await page.evaluate(() => { const D = RB.debug, w = D.world; D.until(() => w.phase === 'ask' && w.ask === 2, 4); D.restAll(); D.adv(0.3); D.tapWrong(); D.adv(0.1); });
    await roundShot(page, J, tag, f, '06-wrong', true);
    await page.evaluate(() => { const D = RB.debug, w = D.world; D.adv(0.8); D.restAll(); D.tapWrong(); D.until(() => !!w.hintHand, 3); D.adv(0.45); });
    await roundShot(page, J, tag, f, '07-hint', true);
    // pause
    await page.evaluate(() => { RB.debug.render().fx = []; });
    await page.click('#btnPause'); await sleep(450); await shot(page, f('08-pause'));
    jl(J, { tag, screen: 'pause', ...(await domRects(page, ['#scrPause .panel', '#btnResume', '#btnVolDown', '#btnVolUp', '#btnHome', '#volLevel'])) });
    await page.click('#btnResume'); await sleep(200);
    // song playback: the band plays the sheet back (mid-song)
    await page.evaluate(() => { const D = RB.debug, w = D.world; D.thaw(); D.freeze(); D.adv(0.8); D.restAll(); D.finishAsks(); D.adv(1.15); });
    await roundShot(page, J, tag, f, '09-song', true);
    // Talk time
    await page.evaluate(() => { const D = RB.debug, w = D.world; D.until(() => w.state !== 'round', 6); w.state = 'round'; w._startTalk(); D.adv(0.1); });
    await sleep(900); await shot(page, f('10-talk'));
    jl(J, { tag, screen: 'talk', ...(await talkInfo(page)) });
    // chapter stars (level done)
    await page.evaluate(() => { const D = RB.debug, w = D.world; w.talkAnswer(w.talk.answerId); D.until(() => w.state === 'levelDone', 6); D.adv(0.6); });
    await sleep(500); await shot(page, f('11-chapter-done'));
    jl(J, { tag, screen: 'levelDone', g: await geom(page) });
    // session done: winter party
    await page.evaluate(() => { const D = RB.debug, w = D.world; w.level = w.levels.length - 1; w._levelDone(); D.until(() => w.state === 'sessionDone', 5); D.thaw(); });
    await sleep(2400); await shot(page, f('12-done'));
    jl(J, { tag, screen: 'done', ...(await domRects(page, ['#scrDone .done-panel', '#doneTitle', '#btnAgain', '#btnDoneHome', '.done-stars'])) });
    await ctx.close();
    console.log('screens', tag);
  }
}

// counting at age 4: drum ask with the count card, listen ask (beats, then the number drums), card after the right pick
async function count() {
  const dir = mk(path.join(OUT, 'count')), J = path.join(dir, 'count.jsonl'); reset(J);
  for (const dev of DEVS) for (const lang of ['en', 'vi']) {
    if (lang === 'en' && dev.startsWith('ipad')) continue;
    const tag = `${dev}-${lang}`, f = n => path.join(dir, `${tag}-${n}.png`);
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`, { seed: 8 });
    await page.evaluate(() => RB.debug.toAsk(2, 'count', 1, 0));
    await page.evaluate(() => { const D = RB.debug; D.tapRight(); D.adv(0.12); });
    await roundShot(page, J, tag, f, 'a-drum-ask', true);
    await page.evaluate(() => RB.debug.toAsk(2, 'count', 3, 1));
    await page.evaluate(() => { const D = RB.debug, w = D.world; w.replayBeats(); D.adv(1.0); });
    await roundShot(page, J, tag, f, 'b-listen-beats', true);
    await page.evaluate(() => { const D = RB.debug, w = D.world; D.until(() => w.phase === 'ask', 8); D.adv(0.4); });
    await roundShot(page, J, tag, f, 'c-listen-ask');
    await page.evaluate(() => { const D = RB.debug; D.tapRight(); D.adv(0.3); });
    await roundShot(page, J, tag, f, 'd-listen-right', true);
    await ctx.close(); console.log('count', tag);
  }
}

// the 4 seasons (chapter 1–4) on every device: an ask frame and a song frame
async function seasons() {
  const dir = mk(path.join(OUT, 'seasons')), J = path.join(dir, 'seasons.jsonl'); reset(J);
  const names = ['spring', 'summer', 'autumn', 'winter'];
  for (const dev of DEVS) {
    const { ctx, page } = await open(dev, 'age=5&lang=vi', { seed: 9 });
    for (let lv = 0; lv < 4; lv++) {
      const ok = await page.evaluate(lv => RB.debug.toAsk(lv, 'colors', 3, 1), lv);
      await page.evaluate(() => RB.debug.adv(0.5));
      const tag = `${dev}-L${lv}-${names[lv]}`;
      await settle(page); await shot(page, path.join(dir, tag + '.png')); jl(J, { tag, ok, g: await geom(page) });
      await page.evaluate(() => { const D = RB.debug; D.finishAsks(); D.adv(0.9); });
      await settle(page, true); await shot(page, path.join(dir, tag + '-song.png')); jl(J, { tag: tag + '-song', ok, g: await geom(page) });
    }
    await ctx.close(); console.log('seasons', dev);
  }
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics')), J = path.join(dir, 'topics.jsonl'); reset(J);
  const plan = [['iphoneP', 'vi'], ['iphoneL', 'vi'], ['ipadP', 'vi'], ['ipadL', 'vi'], ['iphoneP', 'en'], ['iphoneL', 'en']];
  for (const [dev, lang] of plan) for (const age of [3, 4, 5, 6, 7]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`, { seed: 11 + age });
    for (let k = 0; k < 4; k++) {
      const topic = AGE_TOPICS[age][k];
      // the last round has the most members (4 at 6–7); ask 1 so a note is already on the sheet
      const ok = await page.evaluate(([k, topic]) => RB.debug.toAsk(k, topic, 3, 1), [k, topic]);
      await settle(page);
      const tag = `${dev}-${lang}-a${age}-${topic}`;
      await shot(page, path.join(dir, tag + '.png'));
      jl(J, { tag, ok, g: await geom(page) });
    }
    await ctx.close(); console.log('topics', dev, lang, age);
  }
}

// surprise rounds forced through the config (round 2 of the chapter): snail after the 1st note, shower after the 2nd
async function surprise() {
  const dir = mk(path.join(OUT, 'surprise')), J = path.join(dir, 'surprise.jsonl'); reset(J);
  for (const dev of DEVS) for (const sp of ['snail', 'shower']) {
    const lang = dev === 'iphoneL' ? 'vi' : 'en';
    const { ctx, page } = await open(dev, `age=5&lang=${lang}`, { seed: 31 });
    const ok = await page.evaluate(sp => { const D = RB.debug, w = D.world; D.startGame(); w.cfg.surpriseTypes = [sp]; return D.toAsk(sp === 'snail' ? 1 : 2, 'shapes', 2, sp === 'snail' ? 1 : 2); }, sp);
    if (sp === 'snail') {
      await page.evaluate(() => { const D = RB.debug, w = D.world; D.adv(2.5); });
      await roundShot(page, J, `${dev}-${sp}`, n => path.join(dir, `${dev}-${n}.png`), 'snail-in', true);
      await page.evaluate(() => { const D = RB.debug, w = D.world; D.adv(3.0); const s = w.snailHit(); if (s) D.tap(s.x, s.y); D.adv(0.2); });
      await roundShot(page, J, `${dev}-${sp}`, n => path.join(dir, `${dev}-${n}.png`), 'snail-tap', true);
      await page.evaluate(() => { const D = RB.debug; D.finishAsks(); D.adv(0.95); });
      await roundShot(page, J, `${dev}-${sp}`, n => path.join(dir, `${dev}-${n}.png`), 'snail-song', true);
    } else {
      await page.evaluate(() => { const D = RB.debug, w = D.world; D.until(() => !!w._shower, 3); D.adv(1.4); });
      await roundShot(page, J, `${dev}-${sp}`, n => path.join(dir, `${dev}-${n}.png`), 'shower', true);
    }
    jl(J, { tag: `${dev}-${sp}`, ok, surprise: await page.evaluate(() => RB.debug.world.surprise) });
    await ctx.close(); console.log('surprise', dev, sp, ok);
  }
}

// Talk time for every topic of every age (picture readability, VI fitting)
async function talks() {
  const dir = mk(path.join(OUT, 'talk')), J = path.join(dir, 'talk.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'iphoneL', 'ipadL']) for (const lang of ['vi', 'en']) for (const age of [3, 4, 5, 6, 7]) {
    if (lang === 'en' && dev !== 'iphoneL') continue;
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`, { seed: 21 + age });
    await page.evaluate(() => { const D = RB.debug; D.startGame(); D.freeze(); D.adv(3); });
    for (const topic of AGE_TOPICS[age]) {
      await page.evaluate(t => { const D = RB.debug, w = D.world; w.state = 'round'; w.topic = t; w._startTalk(); D.adv(0.2); }, topic);
      await sleep(700);
      const tag = `${dev}-${lang}-a${age}-${topic}`;
      await shot(page, path.join(dir, tag + '.png'));
      jl(J, { tag, ...(await talkInfo(page)) });
    }
    await ctx.close(); console.log('talk', dev, lang, age);
  }
}

// contrast probe: every palette colour as the band's drums, on every season, sampled from the real canvas.
// shell = the drum's front between the rims; wood = the stage plank under the stools; bg = the garden around the drum.
async function contrast() {
  const dir = mk(path.join(OUT, 'contrast')), J = path.join(dir, 'contrast.jsonl'); reset(J);
  for (const dev of ['iphoneP', 'ipadL']) {
    const { ctx, page } = await open(dev, 'age=5&lang=en', { seed: 3 });
    for (let lv = 0; lv < 4; lv++) {
      await page.evaluate(lv => RB.debug.toAsk(lv, 'colors', 1, 0), lv);
      await settle(page);
      const res = await page.evaluate(() => {
        const D = RB.debug, w = D.world, r = D.render(), wx = D.weather, cv = document.getElementById('game'), g = cv.getContext('2d');
        const L = w.layout, S = L.S, rs = cv.width / L.W, keepP = wx.particles; wx.particles = [];
        const keepClouds = wx.clouds; const keepAmb = wx.ambient;
        const ms = w.members.filter(m => m.state === 'rest'), keep = ms.map(m => m.item), out = {};
        const avg = (x0, y0, x1, y1, skip) => { x0 = Math.max(0, Math.round(x0 * rs)); y0 = Math.max(0, Math.round(y0 * rs)); x1 = Math.min(cv.width, Math.round(x1 * rs)); y1 = Math.min(cv.height, Math.round(y1 * rs));
          if (x1 <= x0 || y1 <= y0) return null;
          const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, n = [0, 0, 0]; let c = 0;
          for (let y = 0; y < y1 - y0; y += 2) for (let x = 0; x < x1 - x0; x += 2) { if (skip && skip((x0 + x) / rs, (y0 + y) / rs)) continue; const i = (y * (x1 - x0) + x) * 4; n[0] += d[i]; n[1] += d[i + 1]; n[2] += d[i + 2]; c++; }
          return c ? n.map(v => Math.round(v / c)) : null; };
        const m = ms[Math.floor(ms.length / 2)];
        const inMember = (x, y) => ms.some(q => Math.abs(x - q.homeX) < 0.46 * S && y > q.homeY - 0.42 * S && y < L.stage.y + 2);
        let wood = null, bg = null;
        for (const col of Object.keys(RB.PALETTE)) {
          ms.forEach(q => { q.item = Object.assign({}, q.item, { kind: 'color', color: col, value: col, shape: null, animal: null, text: null }); });
          r.draw(w, wx, { dt: 0, lang: 'en', title: false, done: false });
          const shell = avg(m.homeX - 0.3 * S, m.homeY + 0.0 * S, m.homeX + 0.3 * S, m.homeY + 0.3 * S);
          if (!wood) {
            wood = avg(L.stage.x0 + 70, L.stage.y + 2, L.stage.x1 - 70, L.stage.y + 16, (x) => ms.some(q => Math.abs(x - q.homeX) < 0.4 * S));
            // the garden right behind the band: a band 0.4 S above the drums' tops + the gaps between members, above the plank
            bg = avg(L.stage.x0, m.homeY - 0.42 * S - 0.4 * S, L.stage.x1, L.stage.y - 4, inMember);
          }
          out[col] = { shell };
        }
        ms.forEach((q, i) => { q.item = keep[i]; });
        wx.particles = keepP;
        return { season: wx.ambient.season, wood, bg, out };
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
    if (on('count')) await count();
    if (on('seasons')) await seasons();
    if (on('surprise')) await surprise();
    if (on('talk')) await talks();
    if (on('contrast')) await contrast();
    if (on('topics')) await topics();
  } catch (e) { console.log('FAILED', e); }
  await V.stop();
  console.log('done');
})();
