#!/usr/bin/env node
// Nini's Sea Painting — DEEP high-speed headless playtest (report-only; never edits game/js).
//   node tests/sim/hs_deep.js [--n 300] [--ages 3,4,5,6,7] [--models typical,slow3,tapper,spammer2,shellsOnly,confused,dragger]
//                             [--config '{…}'] [--jobs 4] [--tag name]
// Adds to hs_playtest.js: new child models (spammer with double taps, a child who only taps the paint shells, a colour-
// confused child (wrong shell 50 %), a "drag-er" who moves the finger > 40 px on 35 % of taps) and extra metrics:
// steps with no progress > 30 s, assist / hint frequency, needPaint / notThis / already per round, surprise appearance /
// taps, content variety (same template twice in a row across the whole session, repeated prompt lines, same colour asked
// twice in a row), and the first chapter at each age (is it trivially easy?).
// Output: stdout + tests/sim/out/deep_<tag>.md / .json (git-ignored).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const SP = L.SP;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 300), config = JSON.parse(get('config', '{}'));
const MODELS = get('models', 'typical,slow3,tapper,spammer2,shellsOnly,confused,dragger').split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'deep'), JOBS = +get('jobs', 4);
// --content '{…}': SIM-ONLY content-rule experiments (wraps SP.Content.makeRound in this process; game files untouched):
//   l0MaxSteps n  — first chapter of the session: at most n steps per round (ages in l0Ages, default [3, 4])
//   l0Palette n, l0PaletteRounds k — first chapter: rounds < k show only n paint shells (the step colours + others)
//   sessionPics true — avoid every template already used in the session (fallback: the last 2, as now)
const CONTENT = JSON.parse(get('content', '{}'));
let CUR = null;
// CONTENT.offTap 'hint' | 'assist' (SIM-ONLY World patch): a tap on the empty sand / water during a step counts as a
// no-progress tap (2 → the hint hand; with 'assist' also the assist after assistAfter taps, which then paints the answer).
if (CONTENT.offTap) {
  const P = SP.World.prototype, tap0 = P.tap;
  P.tap = function (x, y) {
    const pre = this._noProg, r = tap0.call(this, x, y);
    if (r === null && this.state === 'round' && this.interactive && this._noProg === pre) {
      if (CONTENT.offTap === 'assist' && this._noProg >= this._assistAfter()) return this._assist(x, y);
      this._noProgress();
    }
    return r;
  };
}
if (Object.keys(CONTENT).length) {
  const mk = SP.Content.makeRound.bind(SP.Content), ages = CONTENT.l0Ages || [3, 4];
  SP.Content.makeRound = function (topic, opt) {
    const w = CUR;
    let r;
    if (CONTENT.sessionPics && w) {
      r = mk(topic, Object.assign({}, opt, { prevPics: w._prevPics.slice() }));
      if (opt.prevPics && opt.prevPics.indexOf(r.templateId) >= 0) r = mk(topic, opt);
    } else r = mk(topic, opt);
    if (w && w.level === 0 && ages.indexOf(opt.age) >= 0) {
      if (CONTENT.l0MaxSteps && r.steps.length > CONTENT.l0MaxSteps) r.steps = r.steps.slice(0, CONTENT.l0MaxSteps);
      if (CONTENT.l0Palette && r.palette && opt.roundIndex < (CONTENT.l0PaletteRounds || 4) && r.palette.length > CONTENT.l0Palette) {
        const need = r.steps.map(x => x.color).filter(Boolean), rest = r.palette.filter(c => need.indexOf(c) < 0);
        const keep = need.concat(rest.slice(0, Math.max(0, CONTENT.l0Palette - need.length)));
        r.palette = r.palette.filter(c => keep.indexOf(c) >= 0);
      }
    }
    return r;
  };
}
const VPS = Object.keys(L.VIEWPORTS);

/* ------------------------------------------------------------- extra models */
/** Spammer with double taps: 3–4 taps/s, 40 % of them followed 90–160 ms later by a second tap at the same spot. */
class Spammer2 extends L.Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.25, 0.33);
    this.t -= dt; if (this.t > 0) return;
    let pt;
    if (this.dbl) { pt = this.dbl; this.dbl = null; this.t = r.float(0.25, 0.33); }
    else {
      if (w.shells.length && r.chance(0.35)) { const s = r.pick(w.shells); pt = { x: s.x + r.float(-20, 20), y: s.y + r.float(-20, 20) }; }
      else if (w.parts.length && w.picture && w.phase === 'paint') pt = this.jit(w.partTap(r.pick(w.parts).id));
      else { const C = w.layout.canvas; pt = { x: C.x + r.float(0, C.w), y: C.y + r.float(0, C.h) }; }
      if (r.chance(0.4)) { this.dbl = pt; this.t = r.float(0.09, 0.16); } else this.t = r.float(0.25, 0.33);
    }
    this.f.tap(pt.x, pt.y, r.float(0.03, 0.07), r.float(0, 6), 0);
    this.stats.taps++;
  }
}
/** Only ever taps the paint shells (a random one every 0.8–2 s; where the shells would be when there are none). */
class ShellsOnly extends L.Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.8, 2.0);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.8, 2.0);
    let pt;
    if (w.shells.length) { const s = r.pick(w.shells); pt = { x: s.x + r.float(-25, 25), y: s.y + r.float(-25, 25) }; }
    else { const sl = w.layout.palette.slots, s = sl.length ? r.pick(sl) : { x: w.layout.W / 2, y: w.layout.palette.y }; pt = { x: s.x, y: s.y }; }
    this.doTap(pt);
  }
}
/** Typical child of that age, but picks a wrong paint shell 50 % of the time (unless the hint glows). */
class Confused extends L.Kid {
  aim() {
    const w = this.w, a = w.answer();
    if (a && a.shell && !w.hintHand && this.r.chance(0.5)) {
      const o = w.shells.filter(q => q.color !== a.shell);
      if (o.length) { const h = w.shellHit(this.r.pick(o).color); return { x: h.x, y: h.y }; }
    }
    return super.aim();
  }
}
function makeModel(name, w, age, seed) {
  if (name === 'spammer2') return new Spammer2(w, L.typicalProfile(age), seed);
  if (name === 'shellsOnly') return new ShellsOnly(w, L.typicalProfile(age), seed);
  if (name === 'confused') return new Confused(w, L.typicalProfile(age), seed);
  if (name === 'dragger') return new L.Kid(w, Object.assign(L.typicalProfile(age), { pDrag: 0.35, pLong: 0.05 }), seed);
  return L.makeModel(name, w, age, seed);
}

/* ------------------------------------------------------------- one session */
function runOne(o) {
  const w = L.mkWorld(o), d = makeModel(o.model, w, o.age, o.seed + 1);
  CUR = w;
  const S = { model: o.model, age: o.age, lang: o.lang, done: false, time: 0, stuckState: false, rounds: [], chapters: [], steps: [],
    tplSeq: [], promptSeq: [], colorSeq: [], fishyShown: 0, fishyTap: 0, pearlShown: 0, pearlTap: 0, assists: 0, talks: 0, talkAuto: 0, talkRight: 0 };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1800;
  let R = null, chap = null, t = 0, lastChange = 0, sig = '', step = null;
  const endStep = () => { if (step) { step.dur = w.time - step.t0; step.maxGap = Math.max(step.maxGap, w.time - step.lastProg); S.steps.push(step); step = null; } };
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.step + ':' + w.parts.filter(p => p.painted).length;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (t - lastChange > 200) { S.stuckState = s2; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'level': chap = { topic: e.topic, level: e.level, t0: w.time, rounds: 0, wrong: 0, hints: 0 }; break;
        case 'round':
          R = { level: w.level, topic: w.topic, ri: e.round, t0: w.time, steps: e.steps, mode: e.mode, short: e.short, wrong: 0, needPaint: 0, notThis: 0, already: 0,
            hint: 0, assist: 0, idle: 0, surprise: e.surprise, tpl: e.templateId, palette: e.palette ? e.palette.length : 0 };
          S.tplSeq.push(e.templateId); break;
        case 'ask':
          if (!e.follow) {
            endStep();
            step = { level: w.level, topic: w.topic, mode: e.mode, ri: e.round, t0: w.time, lastProg: w.time, maxGap: 0 };
            S.promptSeq.push(e.promptKey + JSON.stringify(e.params || {}));
            if (e.color && (e.mode === 'pickColor')) S.colorSeq.push(e.color);
          }
          break;
        case 'wrong': if (R) R.wrong++; break;
        case 'needPaint': if (R) R.needPaint++; break;
        case 'notThis': if (R) R.notThis++; break;
        case 'already': if (R) R.already++; break;
        case 'paint': case 'pick':
          if (step && !(e.type === 'pick' && e.again)) { step.maxGap = Math.max(step.maxGap, w.time - step.lastProg); step.lastProg = w.time; }
          break;
        case 'stepDone': endStep(); break;
        case 'idle': if (R) R.idle++; break;
        case 'hint': if (R) R.hint++; break;
        case 'assist': if (R) R.assist++; S.assists++; break;
        case 'fishy': S.fishyShown++; break;
        case 'fishyTap': S.fishyTap++; break;
        case 'pearl': S.pearlShown++; break;
        case 'pearlTap': if (e.taps === 1) S.pearlTap++; break;
        case 'roundDone':
          endStep();
          if (R) { R.dur = w.time - R.t0; R.stars = e.stars; S.rounds.push(R); if (chap) { chap.rounds++; chap.wrong += R.wrong; chap.hints += R.hint; } }
          R = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; S.chapters.push(chap); } chap = null; break;
        case 'sessionDone': S.done = true; break;
      }
    }
  }
  S.time = w.time;
  return S;
}

/* ------------------------------------------------------------- summary */
const mean = L.mean, pct = L.pct, f1 = L.f1;
function rep(seq) { let n = 0; for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) n++; return n; }
function dupes(seq) { const m = {}; let n = 0; for (const x of seq) { if (m[x]) n++; m[x] = 1; } return n; }
function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|'), rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), steps = ss.flatMap(s => s.steps);
    const done = ss.filter(s => s.done), nr = Math.max(1, rounds.length);
    const c0 = chaps.filter(c => c.level === 0), r0 = rounds.filter(r => r.level === 0);
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100, stuckState: ss.filter(s => s.stuckState).length,
      sess: mean(done.map(s => s.time)) / 60, sessP90: pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...ss.map(s => s.time)) / 60,
      chap: mean(chaps.map(c => c.dur)), chapP10: pct(chaps.map(c => c.dur), 0.1), chapP90: pct(chaps.map(c => c.dur), 0.9),
      inBand: chaps.filter(c => c.dur >= 60 && c.dur <= 100).length / Math.max(1, chaps.length) * 100,
      round: mean(rounds.map(r => r.dur)), roundP90: pct(rounds.map(r => r.dur), 0.9), stuckRounds: rounds.filter(r => r.dur > 120).length, maxRound: Math.max(0, ...rounds.map(r => r.dur)),
      step30: steps.filter(s => s.maxGap > 30).length / Math.max(1, steps.length) * 100, step30n: steps.filter(s => s.maxGap > 30).length, maxGap: Math.max(0, ...steps.map(s => s.maxGap)),
      st3: rounds.filter(r => r.stars === 3).length / nr * 100, st2: rounds.filter(r => r.stars === 2).length / nr * 100, st1: rounds.filter(r => r.stars === 1).length / nr * 100,
      wrong: mean(rounds.map(r => r.wrong)), needPaint: mean(rounds.map(r => r.needPaint)), notThis: mean(rounds.map(r => r.notThis)), already: mean(rounds.map(r => r.already)),
      hintR: rounds.filter(r => r.hint > 0).length / nr * 100, assistR: rounds.filter(r => r.assist > 0).length / nr * 100, idle: mean(rounds.map(r => r.idle)),
      fishyShown: mean(ss.map(s => s.fishyShown)), fishyTap: mean(ss.map(s => s.fishyTap)), pearlShown: mean(ss.map(s => s.pearlShown)), pearlTap: mean(ss.map(s => s.pearlTap)),
      surpRounds: rounds.filter(r => r.surprise).length / nr * 100,
      tplRep: mean(ss.map(s => rep(s.tplSeq))), tplDup: mean(ss.map(s => dupes(s.tplSeq) / Math.max(1, s.tplSeq.length) * 100)), tplUniq: mean(ss.map(s => new Set(s.tplSeq).size)),
      promptDup: mean(ss.map(s => dupes(s.promptSeq))), colRep: mean(ss.map(s => rep(s.colorSeq) / Math.max(1, s.colorSeq.length - 1) * 100)),
      c0: mean(c0.map(c => c.dur)), c0round: mean(r0.map(r => r.dur)), c0wrong: mean(r0.map(r => r.wrong)), c0st3: r0.filter(r => r.stars === 3).length / Math.max(1, r0.length) * 100,
      c0steps: mean(r0.map(r => r.steps)), c0pal: mean(r0.map(r => r.palette)), c0topic: c0.length ? c0[0].topic : '',
      talkAuto: ss.reduce((a, s) => a + s.talkAuto, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100 });
  }
  rows.sort((a, b) => MODELS.indexOf(a.model) - MODELS.indexOf(b.model) || a.age - b.age);
  return rows;
}
function tables(rows) {
  const o = [];
  o.push('### A. Durations and flow', '', '| model | age | n | done % | stuck states | session min mean (p90, max) | chapter s mean [p10–p90] | chapters in 60–100 s % | round s (p90) | rounds > 120 s (max) | steps with a > 30 s no-progress gap % (n, max gap s) | Talk auto-answered % |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.n} | ${f1(r.done)} | ${r.stuckState} | ${f1(r.sess)} (${f1(r.sessP90)}, ${f1(r.sessMax)}) | ${f1(r.chap)} [${f1(r.chapP10)}–${f1(r.chapP90)}] | ${f1(r.inBand)} | ${f1(r.round)} (${f1(r.roundP90)}) | ${r.stuckRounds} (${f1(r.maxRound)}) | ${f1(r.step30)} (${r.step30n}, ${f1(r.maxGap)}) | ${f1(r.talkAuto)} |`);
  o.push('', '### B. Feedback, help and stars (per round)', '', '| model | age | stars 3/2/1 % | wrong | needPaint | notThis | already | rounds with a hint % | rounds with an assist % | idle nudges |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${f1(r.st3)}/${f1(r.st2)}/${f1(r.st1)} | ${r.wrong.toFixed(2)} | ${r.needPaint.toFixed(2)} | ${r.notThis.toFixed(2)} | ${r.already.toFixed(2)} | ${f1(r.hintR)} | ${f1(r.assistR)} | ${r.idle.toFixed(2)} |`);
  o.push('', '### C. Surprises and variety (per session)', '', '| model | age | surprise rounds % | fishy shown / tapped | pearl shown / tapped | templates distinct (of 16) | same template back-to-back | template reused in session % | identical prompt lines repeated | same colour asked twice in a row % |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${f1(r.surpRounds)} | ${r.fishyShown.toFixed(2)} / ${r.fishyTap.toFixed(2)} | ${r.pearlShown.toFixed(2)} / ${r.pearlTap.toFixed(2)} | ${f1(r.tplUniq)} | ${r.tplRep.toFixed(2)} | ${f1(r.tplDup)} | ${r.promptDup.toFixed(2)} | ${f1(r.colRep)} |`);
  o.push('', '### D. First chapter', '', '| model | age | topic | chapter s | round s | steps / round | shells | wrong / round | 3★ % |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.c0topic} | ${f1(r.c0)} | ${f1(r.c0round)} | ${r.c0steps.toFixed(2)} | ${r.c0pal.toFixed(1)} | ${r.c0wrong.toFixed(2)} | ${f1(r.c0st3)} |`);
  return o.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('session failed', JSON.stringify(j), e.stack); res.push({ failed: String(e), model: j.model, age: j.age }); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) for (let i = 0; i < N; i++)
    jobs.push({ model, age, seed: 5000 + i * 41 + age * 11, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
  const parts = Array.from({ length: JOBS }, () => []);
  jobs.forEach((j, i) => parts[i % JOBS].push(j));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, ['--worker', '--content', JSON.stringify(CONTENT)]); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej);
    c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code)); });
    c.send(p);
  }))).then(rs => {
    const list = rs.flat(), failed = list.filter(s => s.failed), rows = summarize(list.filter(s => !s.failed));
    const head = `# hs_deep ${TAG} — ${list.length} sessions (${failed.length} failed), config ${JSON.stringify(config)} content ${JSON.stringify(CONTENT)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    const md = head + tables(rows);
    console.log(md);
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'deep_' + TAG + '.md'), md + '\n');
    fs.writeFileSync(path.join(dir, 'deep_' + TAG + '.json'), JSON.stringify({ config, rows }, null, 1));
  }).catch(e => { console.error(e); process.exit(1); });
}
