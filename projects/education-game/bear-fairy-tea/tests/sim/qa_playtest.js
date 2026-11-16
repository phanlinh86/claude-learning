#!/usr/bin/env node
// Moka's Fairy Tea Party — QA high-speed playtest (report-only; never edits game/js). Complements hs_playtest.js with the QA
// child models and the rule checks of the education skill:
//   node tests/sim/qa_playtest.js [--n 150] [--ages 3,4,5,6,7] [--models …] [--config '{…}'] [--jobs 2] [--tag base]
// Models (all through world.pointerDown / pointerMove / pointerUp + talkAnswer only):
//   bot0.5 / bot0.8 / bot0.95 (FT.Bot) · kid0.5 / kid0.8 / kid0.95 (lib.js typical child of that age with skill overridden)
//   rtap    random tapper: a tap every 0.15–0.6 s anywhere (Moka 20 %, the critter 15 %, a thing 30 %, else anywhere), every phase
//   slow    slow 3-year-old: thinks 4–15 s, 4–15 s between tries, 20 % of the time looks away 30 s
//   nbr     "taps the wrong neighbour": typical child whose aim error reaches 1.2 × the hit radius
//   spam8   8 presses / s on things / the table band / Moka, in EVERY phase (fall, rise, chime, cheers, clear) and Talk
//   chaos   two-finger chaos: a 2nd pointerDown while the 1st is still down (no up), random lifts, 3 presses / s
// Measures: round / chapter / session durations, per-phase times, stuck rounds (> 60 s without the right answer), stars, hints,
// assists, misses caused by presses outside play (must be 0), spam luck (rounds solved by mashing, time to solve), repeated sets
// in a chapter, odd slot spread, colour pairs below age 5, Talk answer position, topic rotation over 6 chained sessions.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const FT = L.FT;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 150), config = JSON.parse(get('config', '{}')), PATCH = JSON.parse(get('patch', '{}'));
// --patch '{"assistMinPlay": 10}': a proposed CODE change, monkey-patched onto this world only (game code untouched): the assist
// arms only once the round has been in play for ≥ assistMinPlay s (mashing no longer buys an auto-solve in < 1 s).
// --patch '{"talkLock": 1}': Talk choices ignore answers for the first talkLock s after Talk opens (the question is heard first).
const MODELS = get('models', 'bot0.5,bot0.8,bot0.95,kid0.5,kid0.8,kid0.95,rtap,slow,nbr,spam8,chaos').split(',');
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), TAG = get('tag', 'base'), JOBS = +get('jobs', 2), CHAIN = +get('chain', 6);
const VPS = Object.keys(L.VIEWPORTS);
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];

/* ------------------------------------------------------------ extra child models */
class RTap extends L.Kid {   // very fast random tapper, every phase
  onEvent() {}   // never listens to Moka (the Kid base would wait prompt + think after every ask)
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talkRandom(dt);
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.15, 0.6);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.15, 0.6);
    const Lw = w.layout, ms = w.members.filter(m => w.memberHit(m.id)), c = w.critterHit(), u = r.next();
    let x, y;
    if (u < 0.2) { const b = w.mokaHit(); x = b.x + r.float(0, b.w); y = b.y + r.float(0, b.h); }
    else if (u < 0.35 && c) { x = c.x + r.float(-0.8, 0.8) * c.r; y = c.y + r.float(-0.8, 0.8) * c.r; }
    else if (u < 0.65 && ms.length) { const h = w.memberHit(r.pick(ms).id); x = h.x + r.float(-1, 1) * h.r; y = h.y + r.float(-1, 1) * h.r; }
    else { x = r.float(0, Lw.W); y = r.float(0, Lw.H); }
    this.stats.taps++;
    this.f.gesture(x, y, x, y, 0, r.float(0.03, 0.12));
  }
  talkRandom(dt) {
    const w = this.w; if (!w.talk || w.talkAnswered) return;
    if (this.talkT < 0) this.talkT = this.r.float(0.5, 2.5);
    this.talkT -= dt; if (this.talkT <= 0) { this.talkT = -1; w.talkAnswer(this.r.pick(w.talk.choices).id); }
  }
}
class Spam8 extends RTap {   // 8 presses per second, every phase, Talk too
  step(dt) {
    const w = this.w, r = this.r;
    if (this.t < 0) this.t = 0.125;
    this.t -= dt; if (this.t > 0) { if (this.f.busy) this.f.step(dt); return; }
    this.t += 0.125;
    if (w.state === 'talk') { if (w.talk && !w.talkAnswered) w.talkAnswer(r.pick(w.talk.choices).id); return; }
    if (this.f.busy) { this.f.step(1); }   // lift the previous finger first (8 / s = press 0.06 s, lift)
    const ms = w.members.filter(m => w.memberHit(m.id)), B = w.layout.band, u = r.next();
    let x, y;
    if (u < 0.65 && ms.length) { const h = w.memberHit(r.pick(ms).id); x = h.x + r.float(-0.5, 0.5) * h.r; y = h.y + r.float(-0.5, 0.5) * h.r; }
    else if (u < 0.9) { x = r.float(B.x, B.x + B.w); y = r.float(B.y, B.y + B.h); }
    else { const b = w.mokaHit(); x = b.cx; y = b.cy; }
    this.stats.taps++;
    this.f.gesture(x, y, x, y, 0, 0.06);
  }
}
class Chaos extends RTap {   // two fingers: overlapping downs without ups
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talkRandom(dt);
    this.up = (this.up || 0) - dt;
    if (this.down && this.up <= 0) { w.pointerUp(); this.down = false; }
    if (this.t < 0) this.t = r.float(0.15, 0.5);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.15, 0.5);
    const ms = w.members.filter(m => w.memberHit(m.id)), B = w.layout.band;
    let x, y;
    if (ms.length && r.chance(0.6)) { const h = w.memberHit(r.pick(ms).id); x = h.x + r.float(-0.7, 0.7) * h.r; y = h.y + r.float(-0.7, 0.7) * h.r; }
    else { x = r.float(B.x, B.x + B.w); y = r.float(B.y, B.y + B.h); }
    this.stats.taps++;
    w.pointerDown(x, y);                     // a second finger lands while the first is still down (no up in between)
    if (r.chance(0.5)) w.pointerMove(x + r.float(-90, 90), y + r.float(-60, 60));
    this.down = true; if (this.up <= 0) this.up = r.float(0.05, 1.5);
    if (r.chance(0.1)) w.cancelDrag();       // touchcancel now and then
  }
}
function model(name, w, age, seed) {
  if (/^bot/.test(name)) return L.makeModel(name, w, age, seed);
  if (/^kid/.test(name)) return new L.Kid(w, Object.assign(L.typicalProfile(age), { skill: +name.slice(3) }), seed);
  if (name === 'rtap') return new RTap(w, L.typicalProfile(age), seed);
  if (name === 'spam8') return new Spam8(w, L.typicalProfile(age), seed);
  if (name === 'chaos') return new Chaos(w, L.typicalProfile(age), seed);
  if (name === 'nbr') return new L.Kid(w, Object.assign(L.typicalProfile(age), { aim: 1.2, pFlick: 0 }), seed);
  if (name === 'slow') return new L.Kid(w, Object.assign(L.slowProfile(), { think: [4, 15], between: [4, 15], pDistract: 0.2, distract: [30, 30] }), seed);
  return L.makeModel(name, w, age, seed);
}

/* ------------------------------------------------------------ one chain of sessions (same world, lastTopics carried) */
function runChain(o) {
  const w = L.mkWorld(o);
  const d = model(o.model, w, o.age, o.seed + 1);
  const out = [];
  let lastTopics = null;
  // presses judged outside play: a right / wrong emitted from a pointer call that started while the world was NOT interactive
  let call = null, badJudge = 0, badWhat = '';
  for (const k of ['pointerDown', 'pointerMove']) { const f = w[k].bind(w); w[k] = (x, y) => { const prev = call; call = { inter: w.interactive, ph: w.state + ':' + w.phase }; try { return f(x, y); } finally { call = prev; } }; }
  const PATCH = o.patch || {};
  if (PATCH.assistMinPlay) {
    const ask = w._ask.bind(w), np = w._noProgress.bind(w);
    w._ask = first => { if (first) w._askT0 = w.time; return ask(first); };
    w._noProgress = miss => { const save = w.cfg.assistAfter; if (w.time - (w._askT0 || 0) < PATCH.assistMinPlay) w.cfg.assistAfter = 1e9; try { return np(miss); } finally { w.cfg.assistAfter = save; } };
  }
  if (PATCH.hardLimit) {   // a 2nd chapter limit: past hardLimit s, Talk after >= 2 rounds (the 75 s / >= 3 rounds rule stays)
    const ac = w._afterClear.bind(w);
    w._afterClear = () => { const save = w.cfg.chapterMinRounds, save2 = w.cfg.chapterTimeLimit; if (w.time - w.levelStartTime > PATCH.hardLimit) { w.cfg.chapterMinRounds = 2; w.cfg.chapterTimeLimit = PATCH.hardLimit; } try { return ac(); } finally { w.cfg.chapterMinRounds = save; w.cfg.chapterTimeLimit = save2; } };
  }
  if (PATCH.talkLock) { const ta = w.talkAnswer.bind(w); w.talkAnswer = (id, auto) => (!auto && w.state === 'talk' && w.stateTime < PATCH.talkLock ? false : ta(id, auto)); }
  const emit = w._emit.bind(w);
  w._emit = e => { if ((e.type === 'right' || e.type === 'wrong') && call && !call.inter) { badJudge++; badWhat = e.type + '@' + call.ph; } return emit(e); };
  for (let s = 0; s < o.chain; s++) {
    const S = { model: o.model, age: o.age, done: false, time: 0, rounds: [], chapters: [], talks: [], topics: null, phaseT: {}, sameSlot: 0, colourClash: 0, colourWhat: '' };
    S.t0 = w.time;
    w.newSession({ lastTopics });
    const dt = 1 / 30, cap = 1800;
    let R = null, chap = null, t = 0, prevSlot = -1;
    const endRound = () => { if (R) { R.dur = w.time - R.t0; S.rounds.push(R); if (chap) chap.rounds++; } R = null; };
    while (w.state !== 'sessionDone' && t < cap) {
      d.step(dt); w.update(dt); t += dt;
      const pk = w.state + (w.phase ? ':' + w.phase : '');
      S.phaseT[pk] = (S.phaseT[pk] || 0) + dt;
      if (R && w.interactive) R.play += dt;
      for (const e of w.drainEvents()) {
        if (d.onEvent) d.onEvent(e);
        switch (e.type) {
          case 'session': S.topics = e.levels; break;
          case 'level': chap = { topic: e.topic, level: e.level, t0: w.time, rounds: 0, sets: [] }; break;
          case 'round': {
            endRound();
            const c = w.cur, sig = c.members.map(m => JSON.stringify(m.thing)).sort().join('|');
            R = { t0: w.time, ri: e.round, level: w.level, topic: w.topic, n: e.n, oddSlot: c.oddSlot, play: 0, wrong: 0, hint: 0, hintIdle: 0, assist: 0, armed: 0,
              stars: 0, repSet: chap && chap.sets.includes(sig) ? 1 : 0, repKey: chap && chap.keys && chap.keys.includes(e.key) ? 1 : 0, viaAssist: 0, firstAsk: -1, solveT: -1 };
            if (chap) { chap.sets.push(sig); (chap.keys = chap.keys || []).push(e.key); }
            if (c.oddSlot === prevSlot) S.sameSlot++; prevSlot = c.oddSlot;
            const cs = [...new Set(c.members.map(m => m.thing.color).filter(Boolean))];
            if (o.age < 5 && (cs.includes('pink') || CLASH.some(p => cs.includes(p[0]) && cs.includes(p[1])))) { S.colourClash++; S.colourWhat = cs.join('+'); }
            break;
          }
          case 'ask': if (R && e.first) R.firstAsk = w.time; break;
          case 'wrong': if (R) R.wrong++; break;
          case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hint++; } break;
          case 'assistArmed': if (R) R.armed++; break;
          case 'assist': if (R) { R.assist++; R.viaAssist = 1; } break;
          case 'right': if (R) R.solveT = w.time - R.firstAsk; break;
          case 'roundDone': if (R) R.stars = e.stars; break;
          case 'talk': {
            endRound();
            const tk = e.talk; S.talks.push({ topic: tk.topic, nC: tk.choices.length, pos: tk.choices.findIndex(c => c.id === tk.answer), t0: w.time, res: null });
            if (o.age < 5) { const cs = tk.choices.map(c => c.thing && c.thing.color).filter(Boolean); if (cs.includes('pink') || CLASH.some(p => cs.includes(p[0]) && cs.includes(p[1]))) { S.colourClash++; S.colourWhat = 'talk ' + cs.join('+'); } }
            break;
          }
          case 'talkResult': { const k = S.talks[S.talks.length - 1]; if (k) { k.res = e.correct ? 'right' : e.auto ? 'auto' : 'wrong'; k.dur = w.time - k.t0; } break; }
          case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; S.chapters.push(chap); } chap = null; break;
          case 'sessionDone': S.done = true; break;
        }
      }
    }
    S.time = w.time - (S.t0 || 0);
    S.badJudge = badJudge; S.badWhat = badWhat; badJudge = 0;
    lastTopics = w.levels.slice();
    S.rounds.forEach(r => { delete r.t0; }); S.chapters.forEach(c => { delete c.sets; delete c.keys; });
    out.push(S);
  }
  return out;
}

/* ------------------------------------------------------------ summary */
const pct = L.pct, mean = L.mean, f1 = L.f1;
function summarize(list) {
  const by = {}; for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [mdl, age] = k.split('|'), rs = ss.flatMap(s => s.rounds), cs = ss.flatMap(s => s.chapters), done = ss.filter(s => s.done), nR = Math.max(1, rs.length);
    const tk = ss.flatMap(s => s.talks), ph = {};
    for (const s of ss) for (const p in s.phaseT) ph[p] = (ph[p] || 0) + s.phaseT[p];
    const nRall = rs.length || 1, phR = p => (ph[p] || 0) / nRall;
    const odd = {}; for (const r of rs) { const kk = r.n + ':' + r.oddSlot; odd[kk] = (odd[kk] || 0) + 1; }
    const ends = rs.filter(r => r.oddSlot === 0 || r.oddSlot === r.n - 1).length / nR * 100, endsExp = mean(rs.map(r => 2 / r.n)) * 100;
    const ch1 = cs.filter(c => c.level === 0), w0 = rs.filter(r => r.ri === 0), wl = rs.filter(r => r.ri > 0);
    const posHist = {}; for (const t of tk) { const kk = t.nC + 'c:' + t.pos; posHist[kk] = (posHist[kk] || 0) + 1; }
    rows.push({ model: mdl, age: +age, n: ss.length, done: done.length / ss.length * 100,
      sess: pct(done.map(s => s.time), 0.5) / 60, sessP90: pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: pct(cs.map(c => c.dur), 0.5), chapP10: pct(cs.map(c => c.dur), 0.1), chapP90: pct(cs.map(c => c.dur), 0.9), chapMax: Math.max(0, ...cs.map(c => c.dur)),
      cut: cs.filter(c => c.rounds < 4).length / Math.max(1, cs.length) * 100, ch1: pct(ch1.map(c => c.dur), 0.5),
      round: pct(rs.map(r => r.dur), 0.5), roundP90: pct(rs.map(r => r.dur), 0.9), play: pct(rs.map(r => r.play), 0.5), playP90: pct(rs.map(r => r.play), 0.9),
      enter: phR('round:enter'), rise: phR('round:rise'), chime: phR('roundDone:chime'), cheers: phR('roundDone:cheers'), clear: phR('roundDone:clear'),
      intro: (ph.intro || 0) / Math.max(1, cs.length), talkT: (ph.talk || 0) / Math.max(1, cs.length), lvlDone: (ph.levelDone || 0) / Math.max(1, cs.length),
      stuck60: rs.filter(r => r.play > 60).length, maxPlay: Math.max(0, ...rs.map(r => r.play)),
      st3: rs.filter(r => r.stars === 3).length / nR * 100, st2: rs.filter(r => r.stars === 2).length / nR * 100, st1: rs.filter(r => r.stars === 1).length / nR * 100,
      w0st3: w0.filter(r => r.stars === 3).length / Math.max(1, w0.length) * 100, wlst3: wl.filter(r => r.stars === 3).length / Math.max(1, wl.length) * 100,
      wrong: mean(rs.map(r => r.wrong)), hint: mean(rs.map(r => r.hint)), hintIdle: mean(rs.map(r => r.hintIdle)), hintR: rs.filter(r => r.hint + r.hintIdle).length / nR * 100,
      assistR: rs.filter(r => r.viaAssist).length / nR * 100, armedR: rs.filter(r => r.armed).length / nR * 100,
      solve: pct(rs.filter(r => r.solveT >= 0).map(r => r.solveT), 0.5),
      badJudge: ss.reduce((a, s) => a + s.badJudge, 0), badWhat: ss.map(s => s.badWhat).filter(Boolean)[0] || '',
      repSet: rs.filter(r => r.repSet).length, repKey: rs.filter(r => r.repKey).length, sameSlot: ss.reduce((a, s) => a + s.sameSlot, 0),
      ends, endsExp, odd, clash: ss.reduce((a, s) => a + s.colourClash, 0), clashWhat: ss.map(s => s.colourWhat).filter(Boolean)[0] || '',
      talkRight: tk.filter(t => t.res === 'right').length / Math.max(1, tk.length) * 100, talkAuto: tk.filter(t => t.res === 'auto').length / Math.max(1, tk.length) * 100,
      talkDur: pct(tk.filter(t => t.dur).map(t => t.dur), 0.5), posHist,
      topicSeq: ss.map(s => (s.topics || []).join('>')), firsts: ss.map(s => (s.topics || [])[0]) });
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  return rows;
}
function rotation(rows) {   // topic rotation per age from the chained sessions of one model
  const out = {};
  for (const r of rows) {
    if (out[r.age]) continue;
    const seqs = r.topicSeq, cnt = {}, pairs = {};
    for (const q of seqs) for (const t of q.split('>')) cnt[t] = (cnt[t] || 0) + 1;
    let repSame = 0, firstAlt = 0, leftTwice = 0;
    const pool = FT.AGE_POOLS[r.age];
    for (let i = 1; i < seqs.length; i++) {
      if (i % CHAIN === 0) continue;   // chain boundary
      if (seqs[i] === seqs[i - 1]) repSame++;
      if (seqs[i].split('>')[0] !== seqs[i - 1].split('>')[0]) firstAlt++;
      const a = pool.find(t => !seqs[i].split('>').includes(t)), b = pool.find(t => !seqs[i - 1].split('>').includes(t));
      if (a === b) leftTwice++;
    }
    for (const q of seqs) pairs[q] = 1;
    const nPairs = seqs.length - Math.ceil(seqs.length / CHAIN);
    out[r.age] = { sessions: seqs.length, distinct: Object.keys(pairs).length, sameAsLast: repSame / Math.max(1, nPairs) * 100, firstAlt: firstAlt / Math.max(1, nPairs) * 100,
      leftOutTwice: leftTwice / Math.max(1, nPairs) * 100, perTopic: Object.keys(cnt).map(t => t + ' ' + (cnt[t] / seqs.length * 100).toFixed(0) + '%').join(', ') };
  }
  return out;
}
function tables(rows) {
  const o = [];
  o.push('| model | age | sessions | done % | session min median (p90, max) | chapter s median [p10–p90] (max) | ch1 s | cut % | round s median (p90) | play s median (p90) | per round: enter / rise / chime / cheers / clear s | per chapter: intro / talk / levelDone s | play > 60 s (max) | stars 3/2/1 % | warm-up vs later 3★ % | wrong / hint / idle-hint per round | rounds with a hint % | assist armed % / solved by assist % | solve s after ask | non-play judged |');
  o.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.n} | ${f1(r.done)} | ${f1(r.sess)} (${f1(r.sessP90)}, ${f1(r.sessMax)}) | ${f1(r.chap)} [${f1(r.chapP10)}–${f1(r.chapP90)}] (${f1(r.chapMax)}) | ${f1(r.ch1)} | ${f1(r.cut)} | ${f1(r.round)} (${f1(r.roundP90)}) | ${f1(r.play)} (${f1(r.playP90)}) | ${r.enter.toFixed(2)} / ${r.rise.toFixed(2)} / ${r.chime.toFixed(2)} / ${r.cheers.toFixed(2)} / ${r.clear.toFixed(2)} | ${f1(r.intro)} / ${f1(r.talkT)} / ${f1(r.lvlDone)} | ${r.stuck60} (${f1(r.maxPlay)}) | ${f1(r.st3)}/${f1(r.st2)}/${f1(r.st1)} | ${f1(r.w0st3)} / ${f1(r.wlst3)} | ${r.wrong.toFixed(2)} / ${r.hint.toFixed(2)} / ${r.hintIdle.toFixed(2)} | ${f1(r.hintR)} | ${f1(r.armedR)} / ${f1(r.assistR)} | ${f1(r.solve)} | ${r.badJudge}${r.badWhat ? ' (' + r.badWhat + ')' : ''} |`);
  o.push('', '| model | age | repeated set in a chapter | repeated key | same odd slot twice | odd at an end % (uniform would be) | colour clash / pink < 5 | Talk right / auto % | Talk s | Talk answer position (choices:index → count) |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.repSet} | ${r.repKey} | ${r.sameSlot} | ${f1(r.ends)} (${f1(r.endsExp)}) | ${r.clash}${r.clashWhat ? ' (' + r.clashWhat + ')' : ''} | ${f1(r.talkRight)} / ${f1(r.talkAuto)} | ${f1(r.talkDur)} | ${Object.keys(r.posHist).sort().map(k => k + '→' + r.posHist[k]).join(' ')} |`);
  return o.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(...runChain(j)); } catch (e) { console.error('chain failed', JSON.stringify(j), e.stack); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const mdl of MODELS) for (const age of AGES) {
    const chains = Math.max(1, Math.round(N / CHAIN));
    for (let i = 0; i < chains; i++) jobs.push({ model: mdl, age, seed: 5000 + i * 53 + age * 11, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config, patch: PATCH, chain: CHAIN });
  }
  const parts = Array.from({ length: JOBS }, () => []);
  jobs.forEach((j, i) => parts[i % JOBS].push(j));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, ['--worker']); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej);
    c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code)); });
    c.send(p);
  }))).then(rs => {
    const list = rs.flat(), rows = summarize(list), rot = rotation(rows);
    let md = `# qa_playtest ${TAG} — ${list.length} sessions, config ${JSON.stringify(config)} patch ${JSON.stringify(PATCH)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n` + tables(rows);
    md += '\n\n| age | sessions | distinct topic orders | same order as last % | first chapter alternates % | same topic left out twice in a row % | topic share |\n|---|---|---|---|---|---|---|\n';
    for (const a of Object.keys(rot)) { const q = rot[a]; md += `| ${a} | ${q.sessions} | ${q.distinct} | ${f1(q.sameAsLast)} | ${f1(q.firstAlt)} | ${f1(q.leftOutTwice)} | ${q.perTopic} |\n`; }
    console.log(md);
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'qa_' + TAG + '.md'), md);
    rows.forEach(r => { delete r.topicSeq; delete r.firsts; });
    fs.writeFileSync(path.join(dir, 'qa_' + TAG + '.json'), JSON.stringify({ config, rows, rot }, null, 1));
  }).catch(e => { console.error(e); process.exit(1); });
}
