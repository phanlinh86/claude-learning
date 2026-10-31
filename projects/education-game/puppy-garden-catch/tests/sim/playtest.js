#!/usr/bin/env node
// High-speed playtester (report-only; never edits game code). Extends lib.js with the metrics the playtest asks for:
//   stuck rounds (no right catch for > 40 s), only-wrong-in-the-air time, wrong catches into a STATIONARY basket,
//   catches while the child's hands are off the screen, content repetition between consecutive rounds,
//   hint frequency / cooldown, stars distribution, rounds per chapter, Talk-time correctness.
// Child models: bot0.3/bot0.6/bot0.9 (PG.Bot), tapper, slowKid (slow 3-year-old: long reactions, short drags),
// lateKid (NEW: waits, then steers late and overshoots), spammer, idleKid (walks away 30 s once per chapter),
// absent (never touches; capped at 600 s).
//   node tests/sim/playtest.js --n 24 --name pt_base
//   node tests/sim/playtest.js --n 10 --name pt_prop --variant proposal
//   node tests/sim/playtest.js --n 10 --name pt_x --config '{"spawnGap":2}' --drivers bot0.6,slowKid --ages 3,4
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const DRIVERS = ['bot0.3', 'bot0.6', 'bot0.9', 'tapper', 'slowKid', 'lateKid', 'spammer', 'idleKid', 'absent'];

/* ------------------------------------------------------------------ late / overshooting child */
function makeLateKid(L, w, seed) {
  const PG = L.PG, TAU = Math.PI * 2;
  const r = new PG.RNG(seed);
  const st = { steers: 0, overs: 0 };
  let f = { x: w.pup.x, y: 0, down: false }, pth = null, t = r.float(1, 1.8), target = null, phase = 0, talkT = -1;
  const fy = () => Math.min(w.layout.groundY + 24, w.layout.H - w.layout.ins.bottom - 6);
  const air = (right) => w.items.filter(i => (i.state === 'fall' || i.state === 'appear') && i.right === right && i.y < w.basket.y + 10);
  const landX = (it) => { const vy = Math.max(it.vy, 20), tt = Math.max(0, (w.basket.y - it.y) / vy); const p = it.xb + it.ub * tt + w.cfg.swayAmp * Math.sin(it.phase + TAU / it._swP * tt); return it.x + (p - it.x) * 0.3; };
  return {
    stats: st,
    step(dt) {
      if (w.state === 'talk') {
        if (f.down) { w.pointerUp(f.x, f.y); f.down = false; }
        if (w.talkAnswered) return;
        if (talkT < 0) talkT = r.float(2, 5);
        talkT -= dt;
        if (talkT <= 0) { talkT = -1; const tk = w.talk; let pick = tk.answerId; if (!r.chance(0.7)) pick = r.pick(tk.choices.filter(c => c.id !== tk.answerId)).id; w.talkAnswer(pick); }
        return;
      }
      if (w.state !== 'round' || w._roundEnded) { target = null; pth = null; return; }
      t -= dt;
      const ok = target && (target.state === 'fall' || target.state === 'appear') && target.y < w.basket.y + 10;
      if (!ok) {
        const R = air(true), Wr = air(false);
        target = Wr.length && r.chance(0.15) ? r.pick(Wr) : R.reduce((b, x) => (!b || x.y > b.y ? x : b), null);
        phase = 0;
      }
      if (!target) return;
      const prog = (target.y - w.layout.spawnY) / Math.max(1, w.basket.y - w.layout.spawnY);
      if (phase === 0 && prog > r.float(0.5, 0.7)) {         // notices late, lunges past the goal
        phase = 1; const gx = landX(target), dir = Math.sign(gx - w.pup.x) || 1;
        const over = r.chance(0.6) ? dir * r.float(60, 160) : 0; if (over) st.overs++;
        if (!f.down) { f.x = w.pup.x; f.y = fy(); f.down = true; w.pointerDown(f.x, f.y); st.steers++; }
        pth = { x0: f.x, x1: gx + over, T: Math.max(0.12, Math.abs(gx + over - f.x) / r.float(800, 1200)), t: 0 };
        t = r.float(0.7, 1.3);
      } else if (phase === 1 && t <= 0) {                     // corrects back after a reaction time
        phase = 2; const gx = landX(target);
        pth = { x0: f.x, x1: gx, T: Math.max(0.12, Math.abs(gx - f.x) / r.float(500, 800)), t: 0 };
      }
      if (f.down && pth) {
        pth.t = Math.min(pth.T, pth.t + dt); const u = pth.t / pth.T, e = u * u * (3 - 2 * u);
        f.x = pth.x0 + (pth.x1 - pth.x0) * e; f.y = fy(); w.pointerMove(f.x, f.y);
        if (pth.t >= pth.T) pth = null;
      }
      if (w.counters.catches !== this._c) { this._c = w.counters.catches; if (f.down && r.chance(0.5)) { w.pointerUp(f.x, f.y); f.down = false; } }
    }
  };
}

/* ------------------------------------------------------------------ talk correctness (pure content check) */
function talkCheck(PG, talk, age, lang) {
  const C = PG.Content, I = PG.I18N, errs = [];
  const ids = talk.choices.map(c => c.id), vals = talk.choices.map(c => String(c.value));
  if (!talk.answerId || ids.indexOf(talk.answerId) < 0) errs.push('answer not in choices');
  if (new Set(vals).size !== vals.length) errs.push('duplicate choices');
  const ans = (talk.choices.find(c => c.id === talk.answerId) || {}).value, s = talk.show;
  let ok = true;
  switch (talk.topic) {
    case 'colors': ok = s.color === ans; break;
    case 'shapes': ok = s.shape === ans; break;
    case 'size': ok = Math.abs(s.scale - C.SIZE_SCALE[ans]) < 1e-9; break;
    case 'count': ok = s.count === ans; break;
    case 'animals': ok = talk.params.sound === ans; break;
    case 'letters': case 'lower': ok = String(s.text).toUpperCase() === ans; break;
    case 'initial': { const w0 = PG.WORDS[lang].find(x => x.sprite === s.sprite); ok = !!w0 && w0.initial === ans; break; }
    case 'add': { const [a, b] = s.text.split('+').map(Number); ok = a + b === ans; break; }
    case 'sub': { const [a, b] = s.text.split('−').map(Number); ok = a - b === ans; break; }
    case 'oddeven': ok = (+s.text % 2 ? 'odd' : 'even') === ans; break;
  }
  if (!ok) errs.push('answer does not match the picture');
  if (talk.topic === 'colors' && age < 5) { const cs = vals; if ((cs.includes('red') && cs.includes('green')) || (cs.includes('blue') && cs.includes('purple'))) errs.push('cvd-clash'); }
  if (talk.topic === 'count' && s.count > { 3: 3, 4: 5 }[age]) errs.push('count above round range');
  if (I) {
    try { const q = I.t(lang, talk.promptKey, talk.params || {}); if (!q || q === talk.promptKey || /\{|undefined/.test(q)) errs.push('prompt missing'); } catch (e) { errs.push('prompt throws'); }
    for (const c of talk.choices) { try { const n = I.name(lang, c.kind, c.value); if (!n || /undefined/.test(n)) errs.push('name missing ' + c.kind); } catch (e) { errs.push('name throws'); } }
  }
  return errs;
}

/* ------------------------------------------------------------------ one session */
function run(L, o) {
  // proxy for a proposed lane-width cap (≈ 800 px of lanes on iPhone landscape, like iPad landscape): wider side insets
  if (!L.VIEWPORTS.iphoneLcap) L.VIEWPORTS.iphoneLcap = { W: 1556, H: 720, ins: { top: 0, right: 258, bottom: 38, left: 258 } };
  const PG = L.PG, vp = L.VIEWPORTS[o.vp], dt = 1 / 30;
  const w = new PG.World({ seed: o.seed, age: o.age, lang: o.lang, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  // input tracking (wrap the public API)
  let lastInput = 0, lastFx = null;
  for (const k of ['pointerDown', 'pointerUp', 'pointerMove', 'cancelDrag']) {
    const f = w[k].bind(w);
    w[k] = function (x, y) {
      if (k !== 'pointerMove' || lastFx === null || Math.abs(x - lastFx) > 3) lastInput = w.time;
      if (x !== undefined) lastFx = x;
      return f(x, y);
    };
  }
  const drv = o.driver === 'lateKid' ? makeLateKid(L, w, o.seed * 31 + 7) : L.makeDriver(o.driver, w, o.age, o.seed * 7919 + 13);
  const maxTime = o.driver === 'absent' ? 600 : 1500;
  const m = { age: o.age, lang: o.lang, vp: o.vp, driver: o.driver, seed: o.seed, done: false, T: null, stars: 0, maxStars: 0,
    rounds: [], chapters: [], wrongStill: 0, rightStill: 0, handsOff: 0, wrongs: 0, corrects: 0, misses: 0, hints: 0, hintGapMin: 1e9,
    onlyWrong: 0, roundTime: 0, onlyWrongEp: 0, talks: [], talkErr: [], rep: { target: 0, pool: 0, pairs: 0 }, stuck: 0, activeStuck: 0, errors: [] };
  let rd = null, ch = null, lastMoveT = 0, owRun = 0, prevRound = null, lastHintT = -1e9;
  const ev = (e) => {
    switch (e.type) {
      case 'level': ch = { topic: e.topic, start: w.time, end: null, rounds: 0, stars: 0 }; m.chapters.push(ch); prevRound = null; break;
      case 'round': {
        const tgt = String(w.cur.target.value), pool = w.cur.pool.map(t => t.nameValue + (t.right ? '+' : '-')).sort().join(',');
        if (prevRound) { m.rep.pairs++; if (prevRound.tgt === tgt) m.rep.target++; if (prevRound.pool === pool) m.rep.pool++; }
        prevRound = { tgt, pool };
        rd = { topic: e.topic, need: e.need, r: e.round, start: w.time, lastProg: w.time, act: 0, maxGap: 0, dur: null, stars: 0, wrong: 0, miss: 0, hints: 0, idles: 0, fc: null };
        m.rounds.push(rd); lastHintT = -1e9; break;
      }
      case 'correct': m.corrects++; if (rd) { if (rd.fc === null) rd.fc = w.time - rd.start; rd.maxGap = Math.max(rd.maxGap, w.time - rd.lastProg); rd.lastProg = w.time; rd.act = 0; }
        if (w.time - lastMoveT > 1.0) m.rightStill++;
        if (!w.finger.down && w.time - lastInput > 3.0) m.handsOff++; break;
      case 'wrong': m.wrongs++; if (rd) rd.wrong++; if (w.time - lastMoveT > 1.0) m.wrongStill++; if (!w.finger.down && w.time - lastInput > 3.0) m.handsOff++; break;
      case 'miss': m.misses++; if (rd) rd.miss++; break;
      case 'hint': m.hints++; if (rd) rd.hints++; m.hintGapMin = Math.min(m.hintGapMin, w.time - lastHintT); lastHintT = w.time; break;
      case 'idle': if (rd) rd.idles++; break;
      case 'roundDone': if (rd) { rd.dur = w.time - rd.start; rd.stars = e.stars; rd.maxGap = Math.max(rd.maxGap, w.time - rd.lastProg); if (rd.maxGap > 40) m.stuck++; }
        if (ch) { ch.rounds++; ch.stars += e.stars; } m.maxStars += 3; break;
      case 'talk': { m.talks.push({ topic: e.talk.topic, start: w.time, correct: null, ans: null }); const er = talkCheck(PG, e.talk, w.age, w.lang); if (er.length) m.talkErr.push(...er.map(x => e.talk.topic + ': ' + x)); m.maxStars += 1; break; }
      case 'talkResult': { const t = m.talks[m.talks.length - 1]; t.correct = e.correct; t.ans = w.time - t.start; if (ch && e.correct) ch.stars++; break; }
      case 'levelDone': if (ch) ch.end = w.time; break;
      case 'sessionDone': m.done = true; m.T = w.time; m.stars = e.stars; break;
    }
  };
  try {
    w.newSession();
    for (const e of w.drainEvents()) ev(e);
    let t = 0;
    while (t < maxTime && w.state !== 'sessionDone') {
      drv.step(dt); w.update(dt); t += dt;
      if (Math.abs(w.pup.vx) > 25) lastMoveT = w.time;
      for (const e of w.drainEvents()) ev(e);
      if (w.state === 'round' && rd && !w._roundEnded) {
        m.roundTime += dt;
        const air = w.items.filter(i => i.state === 'fall' || i.state === 'appear');
        if (air.length && !air.some(i => i.right)) { m.onlyWrong += dt; owRun += dt; } else { if (owRun > 1) m.onlyWrongEp++; owRun = 0; }
        if (w.time - lastInput < 10) rd.act += dt; if (rd.act > 40 && !rd.stuckLive) { rd.stuckLive = true; m.activeStuck++; }
      }
    }
    m.simT = t;
    // a round still open at the cap (absent child)
    if (rd && rd.dur === null) { rd.maxGap = Math.max(rd.maxGap, w.time - rd.lastProg); if (rd.maxGap > 40) m.stuck++; }
  } catch (err) { m.errors.push(String(err && err.stack || err)); }
  m.endState = w.state;
  m.rounds = m.rounds.map(r => ({ t: r.topic, n: r.need, i: r.r, d: r.dur, s: r.stars, w: r.wrong, m: r.miss, h: r.hints, id: r.idles, g: r.maxGap, fc: r.fc }));
  m.chapters = m.chapters.map(c => ({ t: c.topic, d: c.end !== null ? c.end - c.start : null, r: c.rounds, s: c.stars }));
  return m;
}

/* ------------------------------------------------------------------ variants (config overrides only) */
const PV = require('./playtest_variants'), VARIANTS = PV.VARIANTS;

if (isMainThread && require.main === module) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const variant = get('variant', 'baseline');
  if (!VARIANTS[variant]) throw new Error('unknown variant ' + variant);
  const config = Object.assign({}, VARIANTS[variant].config || {}, JSON.parse(get('config', '{}')));
  const n = +get('n', 24), name = get('name', 'pt_' + variant);
  const drivers = get('drivers', DRIVERS.join(',')).split(',');
  const ages = get('ages', '3,4,5,6,7').split(',').map(Number);
  const vps = get('vps', 'iphoneL,iphoneP,ipadL,ipadP').split(',');
  const jobs = []; let seed = +get('seed0', 5000);
  for (const driver of drivers) for (const age of ages) for (const vp of vps) for (let k = 0; k < n; k++) {
    const nn = driver === 'absent' ? Math.max(2, Math.round(n / 6)) : n; if (k >= nn) { seed++; continue; }
    jobs.push({ age, vp, driver, seed: seed, lang: seed % 2 ? 'vi' : 'en', config, variant }); seed++;
  }
  const nw = Math.max(1, os.cpus().length), t0 = Date.now(), res = []; let left = nw, next = 0;
  for (let k = 0; k < nw; k++) {
    const wk = new Worker(__filename);
    const feed = () => wk.postMessage(next < jobs.length ? jobs[next++] : null);
    wk.on('message', (r) => { if (r === 'bye') { if (--left === 0) finish(); return; } res.push(r); feed(); });
    wk.on('error', (e) => { console.error(e); process.exit(1); });
    feed();
  }
  function finish() {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ name, variant, config, n, sessions: res }));
    console.log(`${res.length} sessions in ${((Date.now() - t0) / 1000).toFixed(0)} s → tests/sim/out/${name}.json`);
  }
} else if (!isMainThread) {
  const L = require('./lib');
  parentPort.on('message', (j) => { if (j === null) { parentPort.postMessage('bye'); parentPort.close(); return; } PV.apply(j.variant || 'baseline', L.PG); parentPort.postMessage(run(L, j)); });
}
module.exports = { run, talkCheck, DRIVERS };
