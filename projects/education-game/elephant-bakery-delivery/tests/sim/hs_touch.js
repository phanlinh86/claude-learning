#!/usr/bin/env node
// Tupi's Bakery Delivery — the REAL page in Playwright, driven by a scripted "child" through REAL CDP touch events (no bot):
// imprecise drags (± 30 CSS px wobble, a still pause mid-drag, a 70 px swing into the wrong branch at a fork, an 80 px overshoot past
// the door, a lift half way + a new press where the finger was), 15 % wrong picks, Talk time answered by tapping a picture button.
// Records every frame (world time, finger, cart, interactive) + every voice line (world time, tag, interrupt) + events.
//   node tests/sim/hs_touch.js [--speed 4] [--sessions 1] [--vp iphone-portrait,ipad-landscape] [--age 4] [--fakevoice]
// --fakevoice: speed 1 (real time) with a fake speechSynthesis (72 ms per character at rate 0.9 + 250 ms) → which lines are cut /
// dropped and when the question ends vs when the cart can be driven. Writes tests/sim/out/touch_<tag>.json and prints a summary.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FAKE = args.includes('--fakevoice');
const SPEED = FAKE ? 1 : +get('speed', 4), SESS = +get('sessions', 1), AGE = +get('age', 4), TAG = get('tag', FAKE ? 'voice' : 'speed' + SPEED);
const ALLVP = { 'iphone-portrait': { viewport: { width: 393, height: 852 }, dpr: 3 }, 'ipad-landscape': { viewport: { width: 1180, height: 820 }, dpr: 2 } };
const VPS = get('vp', 'iphone-portrait,ipad-landscape').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let seedR = 12345; const rnd = () => ((seedR = (seedR * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff), U = (a, b) => a + (b - a) * rnd();

const FAKE_TTS = `(() => {
  const rec = window.__tts = []; let cur = null, q = [];
  const wt = () => (window.BD && BD.debug && BD.debug.world ? BD.debug.world.time : -1);
  function done(u, cut) { clearTimeout(u._timer); rec.push({ text: u.text, st: u._st, en: performance.now(), wt0: u._wt, wt1: wt(), cut }); }
  function next() {
    if (cur || !q.length) return; const u = cur = q.shift(); u._st = performance.now(); u._wt = wt();
    setTimeout(() => { if (cur === u && u.onstart) u.onstart({}); }, 30);
    const dur = u.volume === 0 ? 50 : 250 + 72 * u.text.length * (0.9 / (u.rate || 0.9));
    u._timer = setTimeout(() => { if (cur !== u) return; done(u, false); cur = null; if (u.onend) u.onend({}); next(); }, dur);
  }
  const synth = { paused: false, pending: false, onvoiceschanged: null,
    speak(u) { q.push(u); setTimeout(next, 0); },
    cancel() { const c = cur, qq = q; q = []; cur = null; if (c) { done(c, true); if (c.onerror) c.onerror({ error: 'interrupted' }); } qq.forEach(u => { if (u.onerror) u.onerror({ error: 'canceled' }); }); },
    pause() {}, resume() {}, addEventListener() {},
    getVoices() { return [{ name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 's' }, { name: 'Linh', lang: 'vi-VN', localService: true, voiceURI: 'l' }]; } };
  Object.defineProperty(synth, 'speaking', { get: () => !!cur });
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.lang = ''; };
})();`;

const INSTRUMENT = () => {
  const w = BD.debug.world, emit = w._emit.bind(w);
  window.__ev = []; window.__fr = []; window.__say = [];
  w._emit = e => { window.__ev.push({ type: e.type, t: w.time, houseId: e.houseId, left: e.left, n: e.n, demo: e.demo, idle: e.idle, correct: e.correct, auto: e.auto, stars: e.stars }); return emit(e); };
  const say = BD.Voice.say.bind(BD.Voice);
  BD.Voice.say = (text, o) => { o = o || {}; window.__say.push({ t: w.time, rt: performance.now(), text: String(text), tag: o.tag || null, interrupt: !!o.interrupt, priority: !!o.priority, prompt: !!o.prompt, state: w.state, phase: w.phase }); return say(text, o); };
  const loop = () => {
    const c = w.cart; let lag = null;
    if (c && c.state === 'drag' && c.tgt && w.roads) { const e1 = w._edge(c.edge), e2 = w._edge(c.tgt.edge); if (e1 && e2) lag = BD.Roads.path(w.roads, e1, c.s, e2, c.tgt.s).len; }
    window.__fr.push([w.time, w.finger.down ? 1 : 0, w.finger.x, w.finger.y, c ? c.x : 0, c ? c.y : 0, c ? c.state : '', c ? c.spd : 0, c ? c.mdir : 0, w.interactive ? 1 : 0, w.state, w.phase, lag, performance.now(), c ? c.face : 0]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

/** the child's finger way (screen px) to house `id`, built in the page from the real road */
const PLAN = ([id, wobCss]) => {
  const w = BD.debug.world, v = BD.debug.view(), s = v.s, R = w.roads, ch = w.cartHit();
  const pts = w.route(id); if (!pts || !pts.length) return null;
  const forks = R.nodes.filter(n => n.kind === 'fork'), out = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    for (const f of forks) if (Math.hypot(pts[i][0] - f.x, pts[i][1] - f.y) < 10) {
      const nxt = pts[Math.min(pts.length - 1, i + 3)]; let wr = null, wd = -1;
      for (const e of R.edges.filter(e => e.from === f.id)) { const q = BD.Roads.at(e, Math.min(e.len, 70)); const d = Math.hypot(q.x - nxt[0], q.y - nxt[1]); if (d > wd) { wd = d; wr = q; } }
      if (wr && wd > 20) { out.push([wr.x, wr.y]); out.push([f.x, f.y]); }
    }
  }
  const a = out[out.length - 2], b = out[out.length - 1];
  if (a && b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; out.push([b[0] + dx / l * 80, b[1] + dy / l * 80]); }
  // start on the cart (± 0.3 r), then the road; wobble ± wobCss across, as CSS px
  const st = [ch.x + (Math.random() - 0.5) * 0.6 * ch.r, ch.y + (Math.random() - 0.5) * 0.6 * ch.r];
  const all = [st].concat(out), ph = Math.random() * 6.28, res = []; let cum = 0;
  for (let i = 0; i < all.length; i++) {
    if (i) cum += Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]);
    const j = Math.min(all.length - 1, i + 1), k = Math.max(0, j - 1), tx = all[j][0] - all[k][0], ty = all[j][1] - all[k][1], tl = Math.hypot(tx, ty) || 1;
    const wb = i === 0 ? 0 : (wobCss / s) * Math.sin(ph + cum / 55);
    res.push([v.left + (all[i][0] - ty / tl * wb) * s, v.top + (all[i][1] + tx / tl * wb) * s]);
  }
  return { pts: res, s, len: cum };
};

async function touch(cdp, type, p) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p[0], y: p[1], id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
}
/** slide along screen pts at `v` logical px/s (game time) */
async function slide(page, cdp, pts, v, s, opt) {
  const stepMs = 16, pxPerMs = v * SPEED / 1000 * s;   // CSS px per real ms (paced by the real elapsed time)
  let last = pts[0], total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  await touch(cdp, 'touchStart', pts[0]);
  let i = 1, done = 0, paused = false, lifted = false, tPrev = Date.now(), n = 0;
  while (i < pts.length) {
    const now = Date.now(); let left = Math.min(120, now - tPrev) * pxPerMs; tPrev = now;
    while (left > 0 && i < pts.length) {
      const seg = Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]);
      if (seg <= left) { left -= seg; done += seg; last = pts[i]; i++; } else { last = [last[0] + (pts[i][0] - last[0]) * left / seg, last[1] + (pts[i][1] - last[1]) * left / seg]; done += left; left = 0; }
    }
    await touch(cdp, 'touchMove', last); await sleep(stepMs);
    if (!paused && opt.pauseAt && done > opt.pauseAt * total) { paused = true; await sleep(opt.pauseDur * 1000 / SPEED); tPrev = Date.now(); }
    if (!lifted && opt.liftAt && done > opt.liftAt * total) {
      lifted = true; await touch(cdp, 'touchEnd'); await sleep(U(0.5, 1.2) * 1000 / SPEED);
      await touch(cdp, 'touchStart', last); tPrev = Date.now();
    }
    if (++n % 4) continue;
    const st = await page.evaluate(() => BD.debug.world.state + ':' + BD.debug.world.phase + ':' + (BD.debug.world.cart && BD.debug.world.cart.state));
    if (!/^round:play:drag/.test(st) && !/^round:play:(coast|wait)/.test(st)) break;   // arrived / auto-rolled
  }
  await sleep(U(0.1, 0.4) * 1000 / SPEED);
  await touch(cdp, 'touchEnd');
}

async function session(browser, srv, vpName, k) {
  const vp = ALLVP[vpName];
  const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
  if (FAKE) await ctx.addInitScript(FAKE_TTS);
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const lang = k % 2 ? 'vi' : 'en';
  await page.goto(`${srv.url}?speed=${SPEED}${FAKE ? '' : '&mute=1'}&age=${AGE}&seed=${21 + k * 11}&lang=${lang}`);
  await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'title', null, { timeout: 20000 });
  await page.evaluate(INSTRUMENT);
  const bp = await page.locator('#btnPlay').boundingBox();
  await page.touchscreen.tap(bp.x + bp.width / 2, bp.y + bp.height / 2);
  const t0 = Date.now(), acts = [];
  let actAt = null, lastAskT = -1, talkKey = null, talkAt = null;
  while (Date.now() - t0 < (FAKE ? 720000 : 300000)) {
    const st = await page.evaluate(() => { const w = BD.debug.world, a = BD.debug.answer(); const ev = window.__ev; let lastAsk = -1; for (let i = ev.length - 1; i >= 0; i--) if (ev[i].type === 'ask') { lastAsk = ev[i].t; break; }
      return { mode: BD.debug.mode, state: w.state, inter: w.interactive, cs: w.cart && w.cart.state, t: w.time, a: a && a.houseId, houses: w.houses.map(h => h.id), lastAsk, talk: w.talk && !w.talkAnswered ? { answer: w.talk.answer, n: w.talk.choices.length, lvl: w.level } : null }; });
    if (st.mode === 'done') break;
    if (st.talk) {
      const key = 'L' + st.talk.lvl;
      if (talkKey !== key) { talkKey = key; talkAt = st.t + U(3, 5.5); }
      if (st.t >= talkAt) {
        const pick = rnd() < 0.8 ? st.talk.answer : null;
        const btns = await page.$$('#talkChoices button');
        let el = null; for (const b of btns) { const id = await b.getAttribute('data-id'); if ((pick != null && id === String(pick)) || (pick == null && id !== String(st.talk.answer))) { el = b; break; } }
        if (el) { const bb = await el.boundingBox(); if (bb) await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
        talkAt = st.t + 4;
      }
      await sleep(30); continue;
    }
    if (st.inter && st.cs === 'wait' && st.a) {
      if (st.lastAsk !== lastAskT) { lastAskT = st.lastAsk; actAt = st.lastAsk + 2.6 + U(1.3, 2.6); }
      else if (actAt == null) actAt = st.t + U(1.2, 2.4);
      if (st.t >= actAt) {
        actAt = null;
        const id = rnd() < 0.85 || st.houses.length < 2 ? st.a : st.houses.filter(h => h !== st.a)[Math.floor(rnd() * (st.houses.length - 1))];
        const plan = await page.evaluate(PLAN, [id, 30]);
        if (plan) {
          const opt = { pauseAt: rnd() < 0.5 ? U(0.2, 0.6) : 0, pauseDur: U(0.5, 1.5), liftAt: rnd() < 0.25 ? U(0.35, 0.6) : 0 };
          acts.push({ t: st.t, id, right: id === st.a, opt });
          await slide(page, cdp, plan.pts, U(260, 500), plan.s, opt);
        }
      }
    }
    await sleep(25);
  }
  const data = await page.evaluate(() => ({ ev: window.__ev, fr: window.__fr, say: window.__say, tts: window.__tts || null, stats: BD.debug.stats, mode: BD.debug.mode, time: BD.debug.world.time, scale: BD.debug.view().s }));
  data.errors = errors; data.vp = vpName; data.acts = acts; data.wall = (Date.now() - t0) / 1000; data.lang = lang;
  await ctx.close();
  return data;
}

function analyse(d) {
  const ev = d.ev, fr = d.fr, out = { vp: d.vp, lang: d.lang, done: d.mode === 'done', simMin: +(d.time / 60).toFixed(2), wall: d.wall, errors: d.errors.slice(0, 3) };
  const cnt = t => ev.filter(e => e.type === t).length;
  Object.assign(out, { rounds: cnt('roundDone'), right: cnt('right'), wrong: cnt('wrong'), grabs: cnt('grab'), hints: ev.filter(e => e.type === 'hint' && !e.demo).length, assists: cnt('assist'), honks: cnt('honk'), autoDrives: cnt('autoDrive'), talks: cnt('talk'), talkRight: ev.filter(e => e.type === 'talkResult' && e.correct).length });
  out.grabsPerDelivery = +(out.grabs / Math.max(1, out.right)).toFixed(2);
  out.wrongPicks = d.acts.filter(a => !a.right).length; out.acts = d.acts.length;
  // drag feel from frames: [t, down, fx, fy, cx, cy, cs, spd, mdir, inter, state, phase, lag, rt, face]
  let drags = [], cur = null, deadMax = 0, dead = 0, deadList = [], lastT = null, stall = 0;
  for (const f of fr) {
    const [t, down, fx, fy, cx, cy, cs, spd, mdir, inter, state] = f, lag = f[12];
    const dt = lastT == null ? 0 : t - lastT; lastT = t;
    if (cs === 'drag' && down) {
      if (!cur) cur = { lag: [], flips: 0, run: 0, mdir, pend: false, faceFl: 0, face: f[14], frames: 0, jerk: 0, prevSpd: spd, stall: 0 };
      cur.frames++; if (lag != null) cur.lag.push(lag);
      if (spd > 1 && mdir) { if (mdir === cur.mdir) cur.run += spd * dt; else { if (cur.run >= 12) cur.pend = true; cur.mdir = mdir; cur.run = spd * dt; } if (cur.pend && cur.run >= 12) { cur.flips++; cur.pend = false; } }
      if (f[14] !== cur.face) { cur.faceFl++; cur.face = f[14]; }
      if (lag != null && lag > 60 && spd < 5) cur.stall += dt;   // the finger is ahead but the cart stands still
      cur.prevSpd = spd;
    } else if (cur) { drags.push(cur); cur = null; }
    if (state === 'round') { if (inter) { if (dead > 0) deadList.push(dead); dead = 0; } else dead += dt; }
  }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const lags = drags.flatMap(x => x.lag);
  Object.assign(out, { drags: drags.length, lagMean: +mean(lags).toFixed(1), lagP90: +pct(lags, 0.9).toFixed(1), dragsWithTurn: drags.filter(x => x.flips).length, dragsFaceFlip2: drags.filter(x => x.faceFl >= 2).length,
    stallS: +drags.reduce((a, x) => a + x.stall, 0).toFixed(2), deadP90: +pct(deadList, 0.9).toFixed(1), deadMax: +Math.max(0, ...deadList).toFixed(1) });
  // frame pacing (real ms between frames)
  const gaps = []; for (let i = 1; i < fr.length; i++) gaps.push(fr[i][13] - fr[i - 1][13]);
  out.frameP99ms = +pct(gaps, 0.99).toFixed(1);
  // voice: requested lines
  const say = d.say, mins = Math.max(0.1, d.time / 60);
  out.linesPerMin = +(say.length / mins).toFixed(1);
  const tags = {}; say.forEach(s => { tags[s.tag || '-'] = (tags[s.tag || '-'] || 0) + 1; }); out.lineTags = tags;
  // asks: when the question was requested vs when the cart became drivable vs the child's first grab
  const asks = ev.filter(e => e.type === 'ask');
  const interAfter = t => { for (const f of fr) if (f[0] >= t - 1e-6 && f[9]) return f[0]; return null; };
  out.askToInteractive = +mean(asks.map(a => (interAfter(a.t) ?? a.t) - a.t)).toFixed(2);
  if (d.tts) {
    const tts = d.tts.filter(x => x.text.trim());
    out.tts = { spoken: tts.length, cut: tts.filter(x => x.cut).length, perMin: +(tts.length / mins).toFixed(1),
      cutLines: tts.filter(x => x.cut).map(x => x.text.slice(0, 60)).slice(0, 12),
      requested: say.length, neverSpoken: say.filter(s => !tts.some(x => x.text === s.text || x.text.includes(s.text.slice(0, 12)))).map(s => (s.tag || '-') + ': ' + s.text.slice(0, 50)).slice(0, 15) };
    // the question: spoken start / end in world time vs the first grab after it
    const prompts = say.filter(s => s.prompt);
    const pr = prompts.map(p => { const sp = tts.find(x => x.wt0 >= p.t - 0.05 && (x.text.includes(p.text.slice(0, 14)) || p.text.includes(x.text.slice(0, 14)))); const g = ev.find(e => (e.type === 'grab' || e.type === 'autoDrive') && e.t > p.t);
      return { start: sp ? sp.wt0 - p.t : null, end: sp ? sp.wt1 - p.t : null, cut: sp ? sp.cut : null, act: g ? g.t - p.t : null, len: p.text.length }; });
    out.prompt = { n: pr.length, notSpoken: pr.filter(p => p.start == null).length, cut: pr.filter(p => p.cut).length, startMean: +mean(pr.filter(p => p.start != null).map(p => p.start)).toFixed(2),
      endMean: +mean(pr.filter(p => p.end != null).map(p => p.end)).toFixed(2), endMax: +Math.max(0, ...pr.filter(p => p.end != null).map(p => p.end)).toFixed(2),
      actBeforeEnd: pr.filter(p => p.end != null && p.act != null && p.act < p.end).length };
    // silence vs talk: share of play time Tupi is talking
    const talkS = tts.reduce((a, x) => a + Math.max(0, x.wt1 - x.wt0), 0); out.tts.talkShare = +(talkS / Math.max(1, d.time) * 100).toFixed(1);
  } else {
    // speed run: estimate overlaps — a line requested before the previous one could have ended (72 ms/char + 0.25 s, game time)
    let endT = -1, over = 0, cutByInterrupt = 0;
    for (const s of say) { const dur = 0.25 + 0.072 * s.text.length; if (s.t < endT) { over++; if (s.interrupt) cutByInterrupt++; endT = s.interrupt ? s.t + dur : endT + dur; } else endT = s.t + dur; }
    out.estOverlap = over; out.estCutByInterrupt = cutByInterrupt;
  }
  return out;
}

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const jobs = []; for (let k = 0; k < SESS; k++) for (const v of VPS) jobs.push([v, k]);
  const raw = [];
  const res = await Promise.all(jobs.map(([v, k]) => session(browser, srv, v, k).then(d => { raw.push({ vp: d.vp, lang: d.lang, ev: d.ev, say: d.say, tts: d.tts, acts: d.acts }); return analyse(d); }).catch(e => ({ vp: v, error: String(e && e.stack) }))));
  for (const r of res) console.log(JSON.stringify(r));
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'touch_' + TAG + '.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(__dirname, 'out', 'touch_' + TAG + '_raw.json'), JSON.stringify(raw));
  process.exit(0);
})();
