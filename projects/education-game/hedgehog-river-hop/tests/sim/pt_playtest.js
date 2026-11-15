#!/usr/bin/env node
// Nim's River Hop — playtester's high-speed headless sweep (report-only; never edits game/).
//   node tests/sim/pt_playtest.js [--n 60] [--ages 3,4,5,6,7] [--models random,slow3,...] [--skills 0.5,0.8,1] [--config '{…}']
//        [--patch squishCounts] [--voiceK 1] [--jobs 2] [--tag base]
// Models (pt_lib.js): random, slow3, ahead, spammer, hammer, first, firstFast, perfect, bot (NH.Bot toddler pace). Skill applies to
// slow3 / ahead / spammer / hammer / bot. Every session also runs main.js's speech policy on a fake voice queue (SpeechSim).
// --patch: code changes tried in the sim only (monkey-patched World.prototype), see PATCHES below.
// Output: tests/sim/out/pt_<tag>.json (+ a markdown table on stdout).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const P = require('./pt_lib');
const { NH, L } = P;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 60), AGES = get('ages', '3,4,5,6,7').split(',').map(Number), SKILLS = get('skills', '0.5,0.8,1').split(',').map(Number);
const MODELS = get('models', 'random,slow3,ahead,spammer,hammer,hammerPure,first,firstFast,perfect,bot').split(',');
const CONFIG = JSON.parse(get('config', '{}')), PATCH = get('patch', ''), VOICEK = +get('voiceK', 1), TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);

/* Code changes tried in the sim only (never in game/). */
const PATCHES = {
  // the same wrong stone again within sameWrongWindow: still only a wobble (no miss, no line), but it counts as "no progress"
  // (≤ once per 0.9 s per stone) so a child hammering one stone gets the hint (3) and the assist (6) — and the idle timer is not reset
  squishCounts(W) {
    const wrong = W.prototype._wrong;
    W.prototype._wrong = function (s) {
      const rep = this.time - s._lastWrongT < this.cfg.sameWrongWindow;
      wrong.call(this, s);
      if (rep && this.interactive && this.time - (s._sqNP || -1e9) > 0.9) { s._sqNP = this.time; this._noProgress(false); }
    };
  },
  // a tap made while Nim is in the air (judged on landing) only counts when it is RIGHT; a wrong one just wobbles (squish early)
  queuedRightOnly(W) {
    const step = W.prototype._step, judge = W.prototype._judge;
    W.prototype._step = function (h) { this.__q = true; try { step.call(this, h); } finally { this.__q = false; } };
    W.prototype._judge = function (s) {
      if (this.__q && !s.target) { s.tiltV += 0.4; s.dipV += 0.5 * this.cfg.aheadDipV; this._emit({ type: 'squish', id: s.id, early: true, x: s.x, y: s.y }); return; }
      return judge.call(this, s);
    };
  },
  // main.js (sim-only): `stick` queues "Yum, an apple!" even while the last right line is protected (speak() without interrupt
  // never cuts anything; the 5 s stale rule drops it if it waits too long)
  fruitQueue() { P.SpeechSim.prototype._fruitQueue = true; },
  // main.js (sim-only): a count line's guard runs from the moment it STARTS speaking (not from when it was queued)
  countGuardAtStart() { P.SpeechSim.prototype._countAtStart = true; },
  // voice.js (sim-only): the queue never drops the round's prompt (drop the oldest other line instead)
  // main.js (sim-only): the prompt guard lasts until the prompt's own onEnd (+150 ms), not the 600 + 95 ms × chars estimate
  promptGuardToEnd() { P.SpeechSim.prototype._guardToEnd = true; },
  keepPrompt() { P.FakeVoice.prototype._keepPrompt = true; }
};
if (PATCH) for (const p of PATCH.split(',')) PATCHES[p](NH.World);


function runOne(o) {
  const w = L.mkWorld(o), rng = new NH.RNG(o.seed * 3 + 1), kid = P.makeChild(o.model, w, o.age, o.skill, o.seed + 1);
  const sp = new P.SpeechSim(w, o.lang, rng, o.voiceK);
  const S = { model: o.model, age: o.age, skill: o.skill, done: false, time: 0, stuckState: null, rounds: [], chapters: [], idleGaps: [], queuedWrong: 0, aheadAsMiss: 0,
    airTaps: 0, wrongs: 0, rightT: [], stickT: [], variety: { rows: 0, rank0: 0, sameRankAll: 0, rounds: 0, ruleRepeat: 0, rankHist: {}, fruitRepeat: 0 }, speech: null };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1500;
  let R = null, chap = null, t = 0, sig = '', lastChange = 0, lastTouch = 0, prevRule = null, prevFruit = null, lastProg = 0;
  while (w.state !== 'sessionDone' && t < cap) {
    const taps0 = kid.stats.taps;
    kid.step(dt); w.update(dt); t += dt; sp.tick();
    const pressed = kid.stats.taps !== taps0;
    if (pressed) lastTouch = w.time;
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.row;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (t - lastChange > (o.model === 'hammerPure' ? 150 : 240)) { S.stuckState = s2; break; }
    if (R && w.state === 'round' && w.phase === 'play' && R.firstAsk) R.maxNoProg = Math.max(R.maxNoProg, w.time - lastProg);
    for (const e of w.drainEvents()) {
      if (kid.onEvent) kid.onEvent(e);
      sp.onEvent(e);
      switch (e.type) {
        case 'level': chap = { t0: w.time, rounds: 0, topic: e.topic }; break;
        case 'round': R = { t0: w.time, k: e.k, m: e.m, short: e.short, mode: e.mode, wrong: 0, ahead: 0, squish: 0, soft: 0, hints: 0, idleHints: 0, assist: 0, idles: 0, firstAsk: 0, maxNoProg: 0, topic: w.topic };
          if (prevFruit && e.fruit === prevFruit) { S.variety.fruitRepeat++; if (e.round === 0) S.variety.fruitRepeat0 = (S.variety.fruitRepeat0 || 0) + 1; } prevFruit = e.fruit; break;
        case 'ask': if (R && !R.firstAsk) {
          R.firstAsk = w.time; lastProg = w.time;
          const v = S.variety, c = w.cur; v.rounds++;
          const key = c.rule.kind + ':' + JSON.stringify(c.rule.value); if (c.mode !== 'countSeq' && key === prevRule) v.ruleRepeat++; prevRule = key;
          const ranks = [];
          for (let j = 0; j < c.k; j++) {
            const row = w.stones.filter(q => q.row === j), axis = Math.abs(Math.max(...row.map(q => q.hx)) - Math.min(...row.map(q => q.hx))) > Math.abs(Math.max(...row.map(q => q.hy)) - Math.min(...row.map(q => q.hy))) ? 'hx' : 'hy';
            const sorted = row.slice().sort((a, b) => a[axis] - b[axis]), rk = sorted.findIndex(q => q.target), tgt = row.find(q => q.target);
            ranks.push(rk); v.rows++; if (tgt && tgt.i === 0) v.rank0++; const hk = row.length + ':' + rk; v.rankHist[hk] = (v.rankHist[hk] || 0) + 1;
          }
          if (ranks.length > 1 && ranks.every(x => x === ranks[0])) v.sameRankAll++;
        } break;
        case 'right': if (R && R.lastRight) (S.inGaps = S.inGaps || []).push(w.time - R.lastRight); if (R) R.lastRight = w.time; lastProg = w.time; S.rightT.push(w.time); break;
        case 'stick': S.stickT.push(w.time); break;
        case 'wrong': S.wrongs++; if (R) R.wrong++;
          if (!pressed) S.queuedWrong++;
          if (kid.lastPress && kid.lastPress.airborne && !pressed) S.airWrong = (S.airWrong || 0) + 1;
          { const st = w.stoneById(e.id); if (st && st.row !== e.row) S.aheadAsMiss++; } break;
        case 'ahead': if (R) R.ahead++; break;
        case 'squish': if (R) R.squish++; break;
        case 'soft': if (R) R.soft++; break;
        case 'hint': if (R) { if (e.idle) R.idleHints++; else R.hints++; } break;
        case 'assist': if (R) R.assist++; break;
        case 'idle': if (R) R.idles++; S.idleGaps.push({ n: e.n, since: +(w.time - lastTouch).toFixed(2) }); break;
        case 'roundDone': if (R) { R.stars = e.stars; R.assisted = e.assisted; R.playT = w.time - R.firstAsk; R.doneT = w.time; S.rounds.push(R); if (chap) chap.rounds++; } break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; S.chapters.push(chap); } chap = null; break;
        case 'sessionDone': S.done = true; break;
      }
    }
  }
  if (R && !R.doneT && R.firstAsk) S.openRound = { t: w.time - R.t0, maxNoProg: R.maxNoProg, topic: R.topic, model: o.model };
  S.time = w.time; S.airTaps = kid.stats.airTaps || 0;
  // speech outcomes per kind
  const sp2 = {};
  for (const it of sp.V.log) {
    const k = it.kind, a = sp2[k] = sp2[k] || { n: 0, end: 0, cut: 0, flushed: 0, dropped: 0, stale: 0, open: 0, wait: [], by: {} };
    a.n++; const out = it.out || (it.start >= 0 ? 'open' : 'open'); a[out] = (a[out] || 0) + 1;
    if (it.start >= 0) a.wait.push(it.start - it.t);
    if (out === 'cut' || out === 'flushed' || out === 'dropped') a.by[it.by] = (a.by[it.by] || 0) + 1;
  }
  for (const k in sp2) { const a = sp2[k]; a.waitMean = L.mean(a.wait); a.waitMax = Math.max(0, ...a.wait); a.wait = undefined; }
  S.speech = sp2; S.fruitSkipped = sp.fruitSkipped || 0;
  return S;
}

function agg(list) {
  const rounds = list.flatMap(s => s.rounds), chaps = list.flatMap(s => s.chapters), done = list.filter(s => s.done), nR = Math.max(1, rounds.length);
  const gaps = list.flatMap(s => s.rightT.slice(1).map((t, i) => t - s.rightT[i]).filter(g => g < 30));
  const sg = list.flatMap(s => s.stickT.slice(1).map((t, i) => t - s.stickT[i]).filter(g => g < 120));
  const speech = {};
  for (const s of list) for (const k in s.speech) { const a = s.speech[k], b = speech[k] = speech[k] || { n: 0, end: 0, cut: 0, flushed: 0, dropped: 0, stale: 0, waitSum: 0, waitMax: 0, by: {} }; for (const f of ['n', 'end', 'cut', 'flushed', 'dropped', 'stale']) b[f] += a[f] || 0; b.waitSum += a.waitMean * (a.end + a.cut); b.waitMax = Math.max(b.waitMax, a.waitMax); for (const x in a.by) b.by[x] = (b.by[x] || 0) + a.by[x]; }
  const v = { rows: 0, rank0: 0, sameRankAll: 0, rounds: 0, ruleRepeat: 0, fruitRepeat: 0, rankHist: {} };
  for (const s of list) { for (const f of ['rows', 'rank0', 'sameRankAll', 'rounds', 'ruleRepeat', 'fruitRepeat']) v[f] += s.variety[f]; for (const h in s.variety.rankHist) v.rankHist[h] = (v.rankHist[h] || 0) + s.variety.rankHist[h]; }
  const idle = list.flatMap(s => s.idleGaps), ing = list.flatMap(s => s.inGaps || []);
  return {
    n: list.length, done: done.length / list.length * 100, stuckState: list.filter(s => s.stuckState).length, open: list.filter(s => s.openRound).map(s => s.openRound),
    sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
    chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9), chapMax: Math.max(0, ...chaps.map(c => c.dur)),
    cut: chaps.filter(c => c.rounds < 4).length / Math.max(1, chaps.length) * 100,
    round: L.mean(rounds.map(r => r.doneT - r.t0)), roundP90: L.pct(rounds.map(r => r.doneT - r.t0), 0.9), roundMax: Math.max(0, ...rounds.map(r => r.doneT - r.t0)),
    r120: rounds.filter(r => r.doneT - r.t0 > 120).length, r60: rounds.filter(r => r.doneT - r.t0 > 60).length / nR * 100,
    noProgMax: Math.max(0, ...rounds.map(r => r.maxNoProg)), noProgP90: L.pct(rounds.map(r => r.maxNoProg), 0.9), noProg20: rounds.filter(r => r.maxNoProg > 20).length / nR * 100,
    st3: rounds.filter(r => r.stars === 3).length / nR * 100, st2: rounds.filter(r => r.stars === 2).length / nR * 100, st1: rounds.filter(r => r.stars === 1).length / nR * 100,
    hintR: L.mean(rounds.map(r => r.hints + r.idleHints)), hintRounds: rounds.filter(r => r.hints + r.idleHints).length / nR * 100, assistRounds: rounds.filter(r => r.assist).length / nR * 100,
    wrongR: L.mean(rounds.map(r => r.wrong)), aheadR: L.mean(rounds.map(r => r.ahead)), squishR: L.mean(rounds.map(r => r.squish)), softR: L.mean(rounds.map(r => r.soft)), short: rounds.filter(r => r.short).length / nR * 100,
    queuedWrong: list.reduce((a, s) => a + s.queuedWrong, 0), airWrong: list.reduce((a, s) => a + (s.airWrong || 0), 0), aheadAsMiss: list.reduce((a, s) => a + s.aheadAsMiss, 0),
    airTaps: list.reduce((a, s) => a + s.airTaps, 0), wrongs: list.reduce((a, s) => a + s.wrongs, 0),
    inGap: L.mean(ing), inGapP90: L.pct(ing, 0.9), fruitRepeat0: list.reduce((a, s) => a + (s.variety.fruitRepeat0 || 0), 0), hopGap: L.mean(gaps), hopGapP90: L.pct(gaps, 0.9), fruitGap: L.mean(sg), fruitGapP90: L.pct(sg, 0.9),
    idleFirst: L.mean(idle.filter(x => x.n === 1).map(x => x.since)), idleSecond: L.mean(idle.filter(x => x.n === 2).map(x => x.since)), idleN: idle.length,
    fruitSkipped: list.reduce((a, s) => a + s.fruitSkipped, 0), speech, variety: v
  };
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('session failed', JSON.stringify(j), e.stack); res.push({ failed: String(e), job: j }); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) for (const skill of (P.SKILLED.includes(model) ? SKILLS : [0])) {
    const n = /^(firstFast|hammer|hammerPure)$/.test(model) ? Math.max(4, Math.round(N / 3)) : N;
    for (let i = 0; i < n; i++) jobs.push({ model, age, skill, seed: 5000 + i * 53 + age * 11 + Math.round(skill * 100), vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config: CONFIG, voiceK: VOICEK, cap: model === 'hammerPure' ? 700 : /first|hammer/.test(model) ? 1200 : 1500 });
  }
  const parts = Array.from({ length: JOBS }, () => []); jobs.forEach((j, i) => parts[i % JOBS].push(j));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, process.argv.slice(2).concat(['--worker'])); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej); c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code)); });
    c.send(p);
  }))).then(rs => {
    const list = rs.flat(), failed = list.filter(s => s.failed), ok = list.filter(s => !s.failed), by = {};
    for (const s of ok) (by[s.model + '|' + s.skill + '|' + s.age] = by[s.model + '|' + s.skill + '|' + s.age] || []).push(s);
    const rows = Object.keys(by).map(k => { const [model, skill, age] = k.split('|'); return Object.assign({ model, skill: +skill, age: +age }, agg(by[k])); });
    const byM = {}; for (const s of ok) (byM[s.model + '|' + s.skill] = byM[s.model + '|' + s.skill] || []).push(s);
    const mrows = Object.keys(byM).map(k => { const [model, skill] = k.split('|'); return Object.assign({ model, skill: +skill, age: 'all' }, agg(byM[k])); });
    const all = Object.assign({ model: 'ALL', skill: 0, age: 'all' }, agg(ok));
    const f = x => (+x).toFixed(1);
    const out = [`# pt_playtest ${TAG}: ${list.length} sessions (${failed.length} failed) in ${((Date.now() - t0) / 1000).toFixed(0)} s, config ${JSON.stringify(CONFIG)} patch '${PATCH}' voiceK ${VOICEK}`, '',
      '| model | skill | age | n | done % | stuck st | session min (p90, max) | chapter s [p10–p90] max | cut % | round s (p90, max) | >120 s | maxNoProg s (p90) | stars 3/2/1 | hints/round (rounds %) | assist % | wrong/ahead/squish/soft |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
    for (const r of rows.sort((a, b) => a.model.localeCompare(b.model) || a.skill - b.skill || a.age - b.age))
      out.push(`| ${r.model} | ${r.skill || '–'} | ${r.age} | ${r.n} | ${f(r.done)} | ${r.stuckState} | ${f(r.sess)} (${f(r.sessP90)}, ${f(r.sessMax)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] ${f(r.chapMax)} | ${f(r.cut)} | ${f(r.round)} (${f(r.roundP90)}, ${f(r.roundMax)}) | ${r.r120} | ${f(r.noProgMax)} (${f(r.noProgP90)}) | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${r.hintR.toFixed(2)} (${f(r.hintRounds)}) | ${f(r.assistRounds)} | ${r.wrongR.toFixed(2)}/${r.aheadR.toFixed(2)}/${r.squishR.toFixed(2)}/${r.softR.toFixed(2)} |`);
    console.log(out.join('\n'));
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'pt_' + TAG + '.json'), JSON.stringify({ config: CONFIG, patch: PATCH, voiceK: VOICEK, sessions: list.length, failed: failed.length, rows, mrows, all }, null, 1));
    fs.writeFileSync(path.join(dir, 'pt_' + TAG + '.md'), out.join('\n') + '\n');
    if (failed.length) console.log('FAILED', failed.slice(0, 3));
  }).catch(e => { console.error(e); process.exit(1); });
}
