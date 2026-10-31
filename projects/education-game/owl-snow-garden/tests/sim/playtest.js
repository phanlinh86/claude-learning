#!/usr/bin/env node
// High-speed playtest (report-only): thousands of headless sessions per age × driver, plus absent-child runs.
//   node tests/sim/playtest.js --n 60 --name base
//   node tests/sim/playtest.js --n 60 --name prop --config '{"idleMax":45}'
//   node tests/sim/playtest.js --report base[,prop]      → markdown tables (stdout + tests/sim/out/<name>.md)
// Drivers: bot0.3 bot0.6 bot0.9 (SG.Bot), slow3 (slow 3-year-old), dropsHighRim (always the right pot, releases
// 60–120 px above the pot RIM), tapper (random taps / flicks / drags), spammer, typical, toddler (lib.js profiles).
// Speech: MainSpeech mirrors main.js onEvent → SG.Voice.say policy in GAME time; VoiceQueue mirrors voice.js
// (MAXQ 2, stale 5 s for non-priority, interrupt = flush + cancel + 90 ms gap).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const L = require('./lib');
const SG = L.SG;

/* ------------------------------------------------------------------ extra child models */
L.KID_PROFILES.slow3 = { reaction: [2, 4], speed: [250, 450], wobble: 22, pRandomNest: 0.3, pHigh: 0.35, highRange: [40, 140], highFromRim: true,
  pBeside: 0.2, pMidway: 0.08, grabSpread: 0.8, talkDelay: [3, 8], talkRight: 0.55, pickReturning: 0.1 };
L.KID_PROFILES.dropsHighRim = { reaction: [0.8, 1.6], speed: [500, 800], wobble: 8, pRandomNest: 0, pHigh: 1, highRange: [60, 120], highFromRim: true,
  pBeside: 0, pMidway: 0, grabSpread: 0.4, talkDelay: [1.5, 3], talkRight: 0.9 };
// Kid.goal measures 'high' from the soil centre; patch (sim only) so highFromRim profiles measure from the rim (b.top)
(function patchKid() {
  const w = new SG.World({ seed: 1 }); const k = L.makeDriver('toddler', w, 4, 1); const KP = Object.getPrototypeOf(k);
  const orig = KP.goal;
  KP.goal = function (it) {
    const g = orig.call(this, it);
    if (g.kind === 'high' && this.p.highFromRim) { const hr = this.p.highRange; g.y = g.b.top - this.r.float(hr[0], hr[1]); }
    return g;
  };
})();

/* ------------------------------------------------------------------ voice.js queue model (game time) */
class VoiceQueue {
  constructor(lang) { this.lang = lang; this.t = 0; this.cur = null; this.q = []; this.started = []; this.req = [];
    this.drop = { maxq: 0, stale: 0, flush: 0 }; this.cuts = []; this.maxPending = 0; }
  dur(text) { const n = String(text).trim().split(/\s+/).length; return 0.25 + n / (this.lang === 'vi' ? 3.0 : 2.3); }
  speaking() { return !!this.cur; }
  advance(t) { this.t = t; while (this.cur && this.cur.start + this.cur.d <= t) { const e = this.cur.start + this.cur.d; this.cur = null; this._kick(e); } if (!this.cur) this._kick(t); }
  _kick(t) {
    while (!this.cur && this.q.length) {
      const it = this.q.shift();
      if (!it.priority && t - it.t > 5) { this.drop.stale++; continue; }
      const st = Math.max(t, it.ready);
      this.cur = Object.assign({}, it, { start: st, d: this.dur(it.text) }); this.started.push(this.cur);
    }
  }
  say(type, text, o) {
    o = o || {}; if (!text) return;
    const it = { type, text: String(text), t: this.t, priority: !!o.priority, ready: this.t + (o.interrupt ? 0.09 : 0) };
    this.req.push({ t: this.t, type, text: it.text, interrupt: !!o.interrupt, priority: !!o.priority });
    if (o.interrupt) {
      this.drop.flush += this.q.length; this.q = [];
      if (this.cur) {
        const el = this.t - this.cur.start;
        this.cuts.push({ t: this.t, cut: this.cur.type, by: type, frac: Math.max(0, Math.min(1, el / this.cur.d)), never: el <= 0, text: this.cur.text });
        this.cur.cutAt = this.t; this.cur = null;
      }
      this.q.push(it); this._kick(this.t); return;
    }
    this.q.push(it); this.maxPending = Math.max(this.maxPending, this.q.length);
    while (this.q.length > 2) { let idx = this.q.findIndex((x, i) => i < this.q.length - 1 && !x.priority); if (idx < 0) idx = 0; this.q.splice(idx, 1); this.drop.maxq++; }
    if (!this.cur) this._kick(this.t);
  }
}

/* main.js onEvent → speak() policy, in game seconds (main uses wall ms: 700 ms grab, 1200 ms praise) */
class MainSpeech {
  constructor(lang, seed, policy) { this.pol = policy || {}; this.lastTap = { t: -9, text: '' }; this.lang = lang; this.v = new VoiceQueue(lang); this.rng = new SG.RNG(seed); this.firstAsk = true;
    this.lastGrab = -9; this.lastPraise = -9; this.missSay = 0; this.countRounds = []; this.curCount = null; this.lastRound = null; }
  T(k, p) { try { const s = SG.I18N.t(this.lang, k, Object.assign({ child: '' }, p || {}), this.rng); return s == null ? k : String(s); } catch (e) { return k; } }
  N(k, v) { try { return String(SG.I18N.name(this.lang, k, v)); } catch (e) { return String(v); } }
  prompt(w) { const p = w.prompt(); return p ? this.T(p.promptKey, p.params) : ''; }
  on(e, w) {
    const v = this.v, t = w.time; v.advance(t);
    switch (e.type) {
      case 'level': v.say('level', this.T('ui.chapter', { n: e.level + 1 }) + '. ' + this.T('topic.' + e.topic), { interrupt: true }); break;
      case 'round':
        this.firstAsk = true; this.lastRound = e;
        if (e.mode === 'count') { this.curCount = { need: e.params.n, lines: [], idx0: v.started.length, reqIdx0: v.req.length }; this.countRounds.push(this.curCount); } else this.curCount = null;
        if (e.mode !== 'ask') v.say('round', this.T(e.promptKey, e.params), { priority: true }); break;
      case 'ask':
        if (this.firstAsk) v.say('ask', this.T(e.promptKey, e.params), { priority: true });
        else { if (this.pol.askReplace) v.q = v.q.filter(x => x.type !== 'askNext' && x.type !== 'grab'); v.say('askNext', this.T('p.animalsNext', e.params), {}); }
        this.firstAsk = false; break;
      case 'grab':
        if (!v.speaking() && t - this.lastGrab > 0.7 && e.nameKind) {
          const txt = this.N(e.nameKind, e.nameValue);
          if (this.pol.tapQuiet && txt === this.lastTap.text && t - this.lastTap.t < 3) break;   // proposal: same name not again within 3 s
          this.lastGrab = t; this.lastTap = { t, text: txt }; v.say('grab', txt);
        }
        break;
      case 'correct': {
        if (w.cur && w.cur.mode === 'count') break;
        if (t - this.lastPraise < 1.2) break; this.lastPraise = t;
        const b = w.basketById(e.basketId), ev = Object.assign({ label: b && b.label }, e);
        const s1 = SG.I18N.sayCorrect ? SG.I18N.sayCorrect(this.lang, ev, this.rng) : '';
        v.say('correct', s1 && this.rng.next() < 0.65 ? s1 : this.T('praise'), { interrupt: true }); break;
      }
      case 'bloom': if (w.cur && w.cur.mode === 'count') { const s = SG.I18N.sayCount(this.lang, e.n, e.need, this.rng); v.say('count', s, { interrupt: true }); if (this.curCount) this.curCount.lines.push({ n: e.n, item: v.started[v.started.length - 1] === undefined ? null : null, reqAt: t, text: s, ref: v.q[v.q.length - 1] }); } break;
      case 'wrong': { const b = w.basketById(e.basketId), tb = e.target != null ? w.basketById(e.target) : null;
        v.say('wrong', SG.I18N.sayWrong ? SG.I18N.sayWrong(this.lang, { label: b && b.label, target: tb && tb.label }, this.rng) : this.T('wrong'), { interrupt: true }); break; }
      case 'miss': if (++this.missSay % 2 === 1) v.say('miss', this.T('miss')); break;
      case 'hint': v.say('hint', this.T('hint')); break;
      case 'idle':
        if (e.type === 'idle') this.idleN = (w.round === this.idleRound && w.level === this.idleLevel) ? (this.idleN || 0) + 1 : 1;
        this.idleRound = w.round; this.idleLevel = w.level;
        if (this.pol.idleSpeakMax && this.idleN > this.pol.idleSpeakMax) break;   // proposal: stop talking to an empty room
        v.say('idle', this.T('idle') + ' ' + this.prompt(w)); break;
      case 'roundDone': if (!(w.cur && w.cur.mode === 'count')) v.say('roundDone', this.T('great')); break;
      case 'talk': v.say('talk', this.T('talk.intro') + ' ' + this.T(e.talk.promptKey, e.talk.params || {}), { interrupt: true, priority: true }); break;
      case 'talkAsk': if (e.n <= 3) v.say('talkAsk', this.T(e.talk.promptKey, e.talk.params || {}), { priority: true }); break;
      case 'tap': {
        if (!e.nameKind) break;
        const txt = this.N(e.nameKind, e.nameValue);
        if (this.pol.tapQuiet) {   // proposal: a tap never cuts Lumi off, and the same name is not repeated within 2 s
          if (v.speaking() || (txt === this.lastTap.text && t - this.lastTap.t < 3)) break;
          this.lastTap = { t, text: txt }; v.say('tap', txt, {}); break;
        }
        v.say('tap', txt, { interrupt: true }); break;
      }
      case 'talkResult': v.say('talkResult', e.correct ? this.T('talk.right') : 'wrong-answer', { interrupt: true }); break;
      case 'sessionDone': v.say('sessionDone', this.T('session.done', { stars: e.stars || 0 }), { interrupt: true }); break;
    }
  }
}

/* speech quality metrics from a VoiceQueue (shared with the browser replay) */
function speechMetrics(v, countRounds) {
  const S = v.started;
  let rep2 = 0, repReq2 = 0;
  for (let i = 1; i < S.length; i++) if (S[i].text === S[i - 1].text && S[i].start - S[i - 1].start < 2) rep2++;
  for (let i = 1; i < v.req.length; i++) if (v.req[i].text === v.req[i - 1].text && v.req[i].t - v.req[i - 1].t < 2) repReq2++;
  const cutBy = {}; let early = 0;
  for (const c of v.cuts) { const k = c.cut + '<-' + c.by; cutBy[k] = (cutBy[k] || 0) + 1; if (c.frac < 0.5) early++; }
  // counting completeness: each count round must START every number 1..N; "heard" = not cut before 60 %
  let cr = 0, crComplete = 0, crHeard = 0;
  for (const r of countRounds || []) {
    if (!r.done) continue; cr++;
    const st = S.filter(x => x.type === 'count' && x.t >= r.t0 && x.t <= r.t1);
    const nums = new Set(), heard = new Set();
    for (const x of st) { const n = parseInt(x.n, 10); nums.add(n); const end = x.cutAt !== undefined ? x.cutAt : x.start + x.d; if ((end - x.start) / x.d >= 0.6) heard.add(n); }
    let okS = true, okH = true; for (let n = 1; n <= r.need; n++) { if (!nums.has(n)) okS = false; if (!heard.has(n)) okH = false; }
    if (okS) crComplete++; if (okH) crHeard++;
  }
  return { req: v.req.length, started: S.length, maxq: v.drop.maxq, stale: v.drop.stale, flush: v.drop.flush, maxPending: v.maxPending,
    cuts: v.cuts.length, early, cutBy, rep2, repReq2, cr, crComplete, crHeard };
}

/* ------------------------------------------------------------------ one session */
function runOne(job) {
  const ms = { speech: null, hints: [], hintGapsMin: 1e9, asks: [], askRounds: [], content: [], talkN: 0, talkRight: 0,
    taps: 0, tapDrops: 0, flicks: 0, overlapRest: 0, outScreen: 0, restInZone: 0, checks: 0, idleT: [], countRounds: [] };
  let sp = null, curAsk = null, lastHintT = null, curCount = null;
  const hooks = {
    onEvent(e, w) {
      if (e.type === 'session') {
        sp = new MainSpeech(w.lang, job.seed + 77, job.speechPolicy);
        // per-step invariant checks (every 4th update)
        const up = w.update.bind(w); let k = 0;
        w.update = function (dt) { up(dt); if ((++k & 3) === 0) check(w); sp.v.advance(w.time); };
        // tap-guard instrumentation
        const pd = w.pointerDown.bind(w), pm = w.pointerMove.bind(w), pu = w.pointerUp.bind(w);
        let g = null;
        w.pointerDown = function (x, y) { const r = pd(x, y); if (r) g = { x, y, t: w.time, m: 0 }; return r; };
        w.pointerMove = function (x, y) { if (g) g.m = Math.max(g.m, L.hyp(x - g.x, y - g.y)); return pm(x, y); };
        w.pointerUp = function (x, y) {
          const n0 = w.events.length, gg = g; g = null;
          const r = pu(x, y);
          if (gg) {
            const m = Math.max(gg.m, x !== undefined ? L.hyp(x - gg.x, y - gg.y) : 0), dur = w.time - gg.t;
            const isTap = m < w.cfg.tapMovePx && dur < w.cfg.tapTime;
            const dropped = w.events.slice(n0).some(ev => ev.type === 'drop');
            if (isTap) { ms.taps++; if (dropped) ms.tapDrops++; } else if (dur < 0.35) ms.flicks++;
          }
          return r;
        };
      }
      if (sp) sp.on(e, w);
      switch (e.type) {
        case 'round': {
          const it = w.items, info = { l: w.level, r: e.round, topic: e.topic, mode: e.mode, labels: w.baskets.map(b => b.label.value).sort(),
            colors: Array.from(new Set(it.map(i => i.color))).sort(), n: e.params && e.params.n, color: e.params && e.params.color };
          ms.content.push(info);
          curAsk = e.mode === 'ask' ? { queue: w.queue.slice(), asks: [], labels: info.labels } : null;
          if (curAsk) ms.askRounds.push(curAsk);
          if (e.mode === 'count') { curCount = { need: e.params.n, t0: w.time, t1: null, done: false }; ms.countRounds.push(curCount); } else curCount = null;
          lastHintT = null; break;
        }
        case 'ask': if (curAsk) curAsk.asks.push(e.params.animal); break;
        case 'hint': ms.hints.push(w.time); if (lastHintT !== null) ms.hintGapsMin = Math.min(ms.hintGapsMin, w.time - lastHintT); lastHintT = w.time; break;
        case 'idle': ms.idleT.push(w.time); break;
        case 'roundDone': if (curCount) { curCount.t1 = w.time + 2; curCount.done = true; } break;
        case 'talkResult': ms.talkN++; if (e.correct) ms.talkRight++; break;
      }
    }
  };
  function check(w) {
    if (w.state !== 'round') return;
    ms.checks++;
    const Ly = w.layout, ins = Ly.ins, rest = w.items.filter(i => i.state === 'idle');
    for (const it of rest) {
      const h = it.size / 2;
      if (it.x - h < ins.left - 1 || it.x + h > Ly.W - ins.right + 1 || it.y - h < ins.top - 1 || it.y + h > Ly.H - ins.bottom + 1) ms.outScreen++;
      if (w.potAt(it.homeX, it.homeY)) ms.restInZone++;
    }
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
      const a = rest[i], b = rest[j];
      if (L.hyp(a.x - b.x, a.y - b.y) < 0.5 * (a.size + b.size) - 1) ms.overlapRest++;
    }
  }
  const m = L.runSession(Object.assign({}, job, { hooks }));
  // number tags on count lines (needed for completeness)
  if (sp) for (const s of sp.v.started) if (s.type === 'count') s.n = parseInt(String(s.text).match(/\d+/) ? String(s.text).match(/\d+/)[0] : wordNum(sp.lang, s.text), 10);
  ms.speech = sp ? speechMetrics(sp.v, ms.countRounds) : null;
  // ask repetition inside a round: same animal asked twice in a row
  let askRep = 0, askPairs = 0;
  for (const a of ms.askRounds) for (let i = 1; i < a.asks.length; i++) { askPairs++; if (a.asks[i] === a.asks[i - 1]) askRep++; }
  const chapters = m.chapters.map(c => ({ topic: c.topic, dur: c.end !== null ? c.end - c.start : null, stars: c.stars }));
  return {
    age: m.age, lang: m.lang, vp: m.vp, driver: m.driver, seed: m.seed, done: m.done, sessionTime: m.sessionTime, simTime: m.simTime, stars: m.stars, endState: m.endState,
    chapters, rounds: m.rounds.map(r => ({ l: r.level, topic: r.topic, mode: r.mode, dur: r.end !== null ? r.end - r.start : null, items: r.items, nests: r.nests,
      wrong: r.wrong, miss: r.miss, hints: r.hints, idles: r.idles, stars: r.stars })),
    hints: m.hints, hintGapMin: ms.hintGapsMin, idles: m.idles, idleGaps: m.idleGaps, wrongs: m.wrongs, misses: m.misses, drops: m.drops, grabs: m.grabs,
    stuck: m.stuck.length, stuckKinds: m.stuck.slice(0, 2), invariant: m.invariant.length, errors: m.errors.slice(0, 2),
    unreachable: m.unreachable, tapHazard: m.tapHazard, itemsSeen: m.itemsSeen, packShrinkMin: m.packShrinkMin,
    taps: ms.taps, tapDrops: ms.tapDrops, flicks: ms.flicks, overlapRest: ms.overlapRest, outScreen: ms.outScreen, restInZone: ms.restInZone, checks: ms.checks,
    talkN: ms.talkN, talkRight: ms.talkRight, askRep, askPairs, askRounds: ms.askRounds.map(a => ({ q: a.queue.length, first: a.asks[0], labels: a.labels })),
    content: ms.content, speech: ms.speech
  };
}
function wordNum(lang, text) {
  const s = String(text).toLowerCase();
  for (let n = 20; n >= 1; n--) { const nm = String(SG.I18N.numberName(lang, n)).toLowerCase(); if (s.startsWith(nm)) return n; }
  return NaN;
}

/* ------------------------------------------------------------------ absent child */
function absentRun(age, seed, lang, config, policy) {
  const w = new SG.World({ seed, age, lang, config: config || {} }); w.setViewport(960, 720, {});
  const sp = new MainSpeech(lang, seed, policy);
  const bot = new SG.Bot(w, { skill: 1, seed: seed + 1 });
  const out = { age, seed, idle: [], idleSpoken: 0, idleReq: 0, talkAsks: 0, talkAskSpoken: 0, ok: true, err: null, resumed: false };
  const tick = (drive) => { if (drive) bot.step(1 / 30); w.update(1 / 30); sp.v.advance(w.time); for (const e of w.drainEvents()) { sp.on(e, w); if (e.type === 'idle') out.idle.push(w.time); if (e.type === 'talkAsk') out.talkAsks++; } };
  try {
    w.newSession(); for (const e of w.drainEvents()) sp.on(e, w);
    while (!(w.state === 'round' && w.round === 1 && w.interactive)) tick(true);
    const t0 = w.time, r0 = sp.v.started.length;
    for (let i = 0; i < 600 * 30; i++) tick(false);
    out.idleSpoken = sp.v.started.slice(r0).filter(s => s.type === 'idle').length;
    out.idleReq = sp.v.req.filter(r => r.type === 'idle' && r.t >= t0).length;
    out.idleRel = out.idle.map(t => t - t0);
    if (w.state !== 'round') out.ok = false;
    while (w.state !== 'talk') tick(true);
    const r1 = sp.v.started.length;
    for (let i = 0; i < 300 * 30; i++) tick(false);
    out.talkAskSpoken = sp.v.started.slice(r1).filter(s => s.type === 'talkAsk').length;
    out.talkGlow = !!(w.talk && w.talk.glowAnswer);
    if (w.state !== 'talk') out.ok = false;
    let n = 0; while (w.state !== 'sessionDone' && n++ < 1800 * 30) tick(true);
    out.resumed = w.state === 'sessionDone';
  } catch (e) { out.ok = false; out.err = String(e.stack || e); }
  return out;
}

/* ------------------------------------------------------------------ CLI / workers */
const DRIVERS = ['bot0.3', 'bot0.6', 'bot0.9', 'slow3', 'dropsHighRim', 'tapper', 'spammer', 'typical', 'toddler'];
const VPS = ['iphoneP', 'iphoneL', 'ipadL', 'ipadP'];

if (isMainThread && require.main === module) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  if (get('report')) { require('./playtest_report').report(get('report').split(',')); return; }
  const n = +get('n', 40), name = get('name', 'base'), config = JSON.parse(get('config', '{}')), speechPolicy = JSON.parse(get('policy', '{}'));
  const drivers = get('drivers', DRIVERS.join(',')).split(','), ages = get('ages', '3,4,5,6,7').split(',').map(Number);
  const jobs = []; let seed = +get('seed0', 5000);
  for (const driver of drivers) for (const age of ages) for (let k = 0; k < n; k++) {
    const s = seed++;
    jobs.push({ kind: 'session', age, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % 4], driver, seed: s, config, speechPolicy, maxTime: driver === 'tapper' ? 2400 : 1800 });
  }
  const nAbs = +get('absent', 20);
  for (const age of ages) for (let k = 0; k < nAbs; k++) jobs.push({ kind: 'absent', age, lang: k % 2 ? 'vi' : 'en', seed: 900 + age * 100 + k, config, speechPolicy });
  const nw = Math.max(1, os.cpus().length); const t0 = Date.now(); const res = []; let next = 0, left = nw;
  for (let i = 0; i < nw; i++) {
    const wk = new Worker(__filename);
    const feed = () => wk.postMessage(next < jobs.length ? jobs[next++] : null);
    wk.on('message', r => { if (r === 'bye') { if (--left === 0) finish(); return; } res.push(r); if (res.length % 200 === 0) process.stderr.write(res.length + '/' + jobs.length + '\n'); feed(); });
    wk.on('error', e => { console.error(e); process.exit(1); });
    feed();
  }
  function finish() {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'pt_' + name + '.json'), JSON.stringify({ name, config, speechPolicy, n, sessions: res.filter(r => r.kind !== 'absent'), absent: res.filter(r => r.kind === 'absent') }));
    console.log(`${res.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s → tests/sim/out/pt_${name}.json`);
  }
} else if (!isMainThread) {
  parentPort.on('message', j => {
    if (j === null) { parentPort.postMessage('bye'); parentPort.close(); return; }
    let r;
    try { r = j.kind === 'absent' ? Object.assign({ kind: 'absent' }, absentRun(j.age, j.seed, j.lang, j.config, j.speechPolicy)) : runOne(j); }
    catch (e) { r = { kind: j.kind, age: j.age, driver: j.driver, seed: j.seed, errors: [String(e.stack || e)], fatal: true }; }
    parentPort.postMessage(r);
  });
}
module.exports = { runOne, absentRun, VoiceQueue, MainSpeech, speechMetrics, DRIVERS };
