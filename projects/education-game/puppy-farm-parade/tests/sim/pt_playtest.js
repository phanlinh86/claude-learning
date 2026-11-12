#!/usr/bin/env node
// Bo's Farm Parade — QA high-speed playtester (report-only; never edits game/js).
//   node tests/sim/pt_playtest.js [--n 300] [--ages 3,4,5,6,7] [--models careful,typical,...] [--config '{…}'] [--patch slots,…]
//                                 [--chain 3] [--jobs 2] [--tag base]
// Adds to hs_playtest.js: more child models (careful, leftfirst, pos0/pos1/posLast, nogate = parent-less gate/Talk, bot0.8 /
// bot0.5), the odd one's slot spread + positional strategies, content variety within a chapter AND across "Play again" sessions
// (--chain sessions on one world, lastTopics carried like main.js), and a SPEECH MODEL that replays main.js's event → line policy
// (VOICE.md §1.1) through a copy of voice.js's queue (1 speaking + ≤ 2 waiting, interrupt flushes, non-priority lines > 5 s old
// are stale) with real i18n text and an iOS-like duration (0.3 s + 83 ms per char at rate 0.9) → lines/min, % talking, cut /
// dropped / stale lines by kind, silences, gate lines spoken after the doors already opened, prompt heard before the first touch.
// --voice v2 replays the PROPOSED line policy (long .first prompt only in round 0 of a chapter; no praise at roundDone, ONE praise
// line at the parade instead of march; the gate line only in round 0, later rounds only when the ghost hand appears).
// --adaptGate S (sim-only emulation of a proposed main/world change): after an auto-opened gate the next gate in the chapter
// auto-opens after S s; a child's door tap restores CONFIG.gateWait.
// --voice v3 = v2, and the praise only after a round with a miss or on the chapter's last round; the gate is spoken only in
// chapter 1 (later chapters: ghost hand + creak only).
// --patch applies PROPOSED content rules inside this sim only (see PATCHES below). Output: tests/sim/out/pt_<tag>.{md,json}.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fork } = require('child_process');
const L = require('./lib');
const FP = L.FP;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'i18n.js'), 'utf8'), { filename: 'i18n.js' });
const I = FP.I18N;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 300), config = JSON.parse(get('config', '{}')), CHAIN = +get('chain', 3);
const ALL = 'careful,typical,slow3,tapper,spammer,leftfirst,pos0,pos1,posLast,flicky,absent,nogate,bot1,bot0.8,bot0.5,bot0';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const ADAPT = +get('adaptGate', 0), VOICE = get('voice', 'v1'), TAG = get('tag', 'base'), JOBS = +get('jobs', 2), PATCH = (get('patch', '') || '').split(',').filter(Boolean);
const VPS = Object.keys(L.VIEWPORTS);

/* ------------------------------------------------------------------ proposed content patches (sim only)
 * slots   : the odd one's slot is uniform over ALL n slots (prevOddSlot ignored), never 3 rounds in a row at the same slot index
 * oddwild : animals 'farm' rounds never use the same wild animal twice in a chapter.
 * oddcol  : colours rounds never use the same odd colour twice in a chapter. */
if (PATCH.length) {
  const C = FP.Content, orig = C.makeRound;
  let lastOdd = {}, relRun = { rel: '', n: 0 };
  C.makeRound = function (topic, o) {
    if (o && o.roundIndex === 0) lastOdd = { animals: new Set(), colors: new Set() };
    let r = null;
    for (let a = 0; a < 40; a++) {
      r = orig.call(this, topic, Object.assign({}, o, PATCH.includes('slots') ? { prevOddSlot: -1 } : {}));
      const odd = r.members.find(m => m.odd).thing;
      if (PATCH.includes('oddwild') && r.rule.kind === 'home' && lastOdd.animals.has(odd.animal) && a < 39) continue;
      if (PATCH.includes('oddcol') && topic === 'colors' && lastOdd.colors.has(odd.color) && a < 39) continue;
      break;
    }
    if (PATCH.includes('slots')) {
      const n = r.members.length, rng = o.rng;
      let s = rng.int(0, n - 1);
      const rel = x => x;
      for (let t = 0; t < 20 && relRun.n >= 2 && rel(s) === relRun.rel; t++) s = rng.int(0, n - 1);
      relRun = rel(s) === relRun.rel ? { rel: rel(s), n: relRun.n + 1 } : { rel: rel(s), n: 1 };
      const things = r.members.map(m => m.thing), oddT = r.members.find(m => m.odd).thing, maj = things.filter(t => t !== oddT);
      r.members = []; let j = 0;
      for (let k = 0; k < n; k++) r.members.push({ id: 'm' + k, slot: k, thing: k === s ? oddT : maj[j++], odd: k === s });
      r.oddId = 'm' + s; r.oddSlot = s; r.key = C.roundKey(r);
      const e = C.validate(r); if (e) throw new Error('patch broke the round: ' + e);
    }
    const odd = r.members.find(m => m.odd).thing; if (odd.animal) lastOdd.animals.add(odd.animal); if (odd.color) lastOdd.colors.add(odd.color);
    return r;
  };
}

/* ------------------------------------------------------------------ speech model (main.js §voice + voice.js queue) */
class Speech {
  constructor(w, lang) {
    this.w = w; this.lang = lang; this.cur = null; this.q = []; this.log = []; this.reqs = 0;
    this.promptUntil = 0; this.pendingPrompt = null; this.promptStart = -1e9; this.lastPraise = -1e9; this.lastWrongSay = -1e9; this.lastPopSay = -1e9;
    this.gateChapter = -1; this.idleSaid = 0; this.lastPromptText = ''; this.lastAsk = null; this.lastSpoken = '';
  }
  get now() { return this.w.time; }
  T(key, p) { return I.t(this.lang, key, Object.assign({ child: '' }, p || {})); }
  static dur(t) { return 0.3 + 0.075 * t.length / 0.9; }
  static lineS(t) { return 0.6 + 0.095 * (t || '').length; }
  speaking() { return !!this.cur; }
  canInt() { return this.now > this.promptUntil; }
  say(text, o, kind) {
    if (!text) return; o = o || {}; this.reqs++; this.lastSpoken = text;
    const it = { text, kind, priority: !!o.priority, t: this.now, res: '', start: -1, end: -1, prompt: !!o.prompt };
    this.log.push(it);
    if (o.interrupt) {
      for (const x of this.q) x.res = 'cutQ'; this.q = [];
      if (this.cur) { this.cur.res = 'cut'; this.cur.end = this.now; this.cur = null; }
      it.delay = 0.09; this.q.push(it);
    } else {
      this.q.push(it);
      while (this.q.length > 2) { let idx = this.q.findIndex((x, i) => i < this.q.length - 1 && !x.priority); if (idx < 0) idx = 0; this.q.splice(idx, 1)[0].res = 'dropped'; }
    }
    this.pump();
  }
  pump() {
    while (!this.cur && this.q.length) {
      const it = this.q[0];
      if (it.delay && this.now < it.t + it.delay) return;
      this.q.shift();
      if (!it.priority && this.now - it.t > 5) { it.res = 'stale'; continue; }
      it.start = this.now; it.end = this.now + Speech.dur(it.text); this.cur = it;
      if (this.pendingPrompt && it.text === this.pendingPrompt) { this.promptStart = this.now; this.promptUntil = this.now + Speech.lineS(it.text); this.pendingPrompt = null; }
    }
  }
  tick() {
    if (this.cur && this.now >= this.cur.end) { this.cur.res = 'end'; this.cur = null; }
    this.pump();
  }
  speakPrompt(txt, o, kind) {
    this.pendingPrompt = txt; this.promptStart = this.now; this.promptUntil = this.now + 6 + Speech.lineS(txt);
    this.say(txt, Object.assign({ prompt: true }, o), kind);
  }
  ev2(e) { const c = this.w.cur, m = this.w.memberById(e.id); return Object.assign({ topic: this.w.topic, promptKey: c && c.promptKey, params: c && c.params, rule: c && c.rule }, e, { thing: e.thing || (m && m.thing) }); }
  currentPrompt() { if (this.lastPromptText) return this.lastPromptText; const p = this.w.prompt(); return p ? I.ask(this.lang, p.promptKey, p.params, { first: true }) : ''; }
  onEvent(e) {
    const w = this.w, now = this.now;
    switch (e.type) {
      case 'level': this.say(this.T('ui.chapter', { n: e.level + 1 }) + '. ' + this.T('topic.' + e.topic), { interrupt: true }, 'chapter'); this.say(this.T('weather.' + (e.weather % 4)), {}, 'weather'); break;
      case 'round': this.idleSaid = 0; this.lastAsk = null; this.lastPromptText = ''; break;
      case 'ask': { this.lastAsk = e; this.idleSaid = 0; const t = I.ask(this.lang, e.promptKey, e.params, { first: !!e.first && (VOICE === 'v1' || e.round === 0) }); this.lastPromptText = t; this.speakPrompt(t, { priority: true }, e.first ? 'prompt' : 'prompt'); break; }
      case 'right': {
        this.promptUntil = 0; this.pendingPrompt = null;
        const t = I.sayRight(this.lang, this.ev2(e)), isCount = !!e.count;
        if (isCount) { this.say(t, { interrupt: this.canInt(), priority: true }, 'countRun'); this.promptUntil = now + 0.9 + 0.65 * e.count.n + Speech.lineS(t) * 0.3; }
        else { this.say(t, { interrupt: this.canInt() }, 'right'); this.promptUntil = Math.max(this.promptUntil, now + Speech.lineS(t)); }
        break;
      }
      case 'wrong': if (now - this.lastWrongSay > 1.5) { this.lastWrongSay = now; const t = I.sayWrong(this.lang, this.ev2(e)); this.say(t, { interrupt: this.canInt() }, 'wrong'); this.promptUntil = Math.max(this.promptUntil, now + Speech.lineS(t)); } break;
      case 'hint': if (!e.idle) this.say(this.T('hint'), { priority: VOICE !== 'v1' }, 'hint'); break;
      case 'idle': if (++this.idleSaid <= 4) this.say(this.T('idle') + ' ' + this.currentPrompt(), {}, 'idle'); break;
      case 'pokeBo': {
        if (e.gate) { if (!this.speaking()) this.say(this.T('gateShort'), { interrupt: true }, 'gate'); break; }
        if (w.state !== 'round' || !this.lastAsk) { if (!this.speaking()) this.say(this.T('bo.poke'), { interrupt: true }, 'poke'); break; }
        if (this.speaking() && this.lastSpoken === this.lastPromptText) break;
        const since = now - this.promptStart, stuck = this.pendingPrompt && since > 6;
        if (since > 3 && (!this.pendingPrompt || stuck)) { this.promptUntil = 0; this.speakPrompt(this.currentPrompt(), { interrupt: true }, 'repeat'); }
        break;
      }
      case 'roundDone': this.stars = e.stars; this.rdRound = e.round; if (VOICE !== 'v1') break; if (now - this.lastPraise > 1.2) { this.lastPraise = now; this.say(this.T(e.stars >= 3 ? 'great' : 'praise'), {}, 'praise'); } break;
      case 'gateHint': if (VOICE === 'v3' && w.level > 0) break; if (VOICE !== 'v1' && w.round > 0) { const g = this.T('gateShort'); this.say(g, {}, 'gate'); } break;
      case 'gateAsk': { if (VOICE !== 'v1' && (w.round > 0 || (VOICE === 'v3' && w.level > 0))) break; const g = this.T(this.gateChapter === w.level ? 'gateShort' : 'gate'); this.gateChapter = w.level; this.say(g, {}, 'gate'); this.promptUntil = Math.max(this.promptUntil, now + Speech.lineS(g)); break; }
      case 'parade': if (VOICE === 'v3' && this.stars >= 3 && this.rdRound !== 3) break; if (VOICE !== 'v1') { if (this.canInt()) this.say(this.T(this.stars >= 3 ? 'great' : 'praise'), {}, 'praise'); break; } if (!this.speaking() && this.canInt()) this.say(this.T('march'), {}, 'march'); break;
      case 'chick': if (this.canInt()) this.say(this.T('surprise.chick'), {}, 'surprise'); break;
      case 'rooster': if (this.canInt()) this.say(this.T('surprise.rooster'), {}, 'surprise'); break;
      case 'fireflies': if (this.canInt()) this.say(this.T('surprise.fireflies'), {}, 'surprise'); break;
      case 'chickTap': if (this.canInt() && !this.speaking()) this.say(this.T('chick.tap'), { interrupt: true }, 'surpriseTap'); break;
      case 'roosterTap': if (now - this.lastPopSay > 2 && this.canInt()) { this.lastPopSay = now; this.say(this.T('rooster.tap'), { interrupt: true }, 'surpriseTap'); } break;
      case 'fireflyTap': if (now - this.lastPopSay > 2 && this.canInt()) { this.lastPopSay = now; this.say(this.T('firefly.tap'), { interrupt: true }, 'surpriseTap'); } break;
      case 'talk': { const tk = e.talk || w.talk; this.speakPrompt(this.T('talk.intro') + ' ' + this.T(tk.promptKey, tk.params), { priority: true }, 'talk'); break; }
      case 'talkAsk': { const tk = e.talk || w.talk; if (tk && e.n <= 3) this.say(this.T(tk.promptKey, tk.params), { priority: true, interrupt: true }, 'talkAsk'); break; }
      case 'talkResult': {
        const tk = w.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct && !e.auto) this.say(this.T('talk.right'), { interrupt: true }, 'talkResult'); else this.say(I.talkWrong(this.lang, ans, tk), { interrupt: true }, 'talkResult');
        break;
      }
      case 'levelDone': this.say(this.T('great'), {}, 'levelDone'); break;
      case 'sessionDone': this.say(this.T('party'), { interrupt: true }, 'party'); this.say(this.T('session.done', { stars: e.stars }), {}, 'party'); break;
    }
  }
}

/* ------------------------------------------------------------------ extra child models */
class Careful extends L.Kid {   // listens until Bo has finished speaking, then thinks; rarely wrong
  step(dt) { if (this.sp && this.sp.speaking() && this.w.interactive && !this.f.busy) return; return super.step(dt); }
}
class LeftFirst extends L.Kid {   // ignores the question: tries the members from the left, one after the other (follows a hint)
  act() {
    const w = this.w, r = this.r, a = w.answer(); if (!a || !a.member) return;
    const key = w.level + ':' + w.round; if (this.lfKey !== key) { this.lfKey = key; this.tried = new Set(); }
    const glow = !!w.hintHand || !!w.assistId;
    let m;
    if (glow && r.chance(this.p.followHint)) m = w.memberById(a.member);
    else { const s = this.standing().sort((x, y) => x.x - y.x); m = s.find(q => !this.tried.has(q.id)) || s[0]; }
    if (!m || m.state !== 'stand') return; this.tried.add(m.id); this.tapMember(m);
  }
}
class PosK extends L.Kid {   // always opens with slot k (0 = left, 1 = 2nd, -1 = right end), then random untried ones
  act() {
    const w = this.w, r = this.r, a = w.answer(); if (!a || !a.member) return;
    const key = w.level + ':' + w.round; if (this.pkKey !== key) { this.pkKey = key; this.tried = new Set(); }
    const s = this.standing().sort((x, y) => x.x - y.x), glow = !!w.hintHand || !!w.assistId;
    let m;
    if (glow && r.chance(this.p.followHint)) m = w.memberById(a.member);
    else if (!this.tried.size) m = s[this.k < 0 ? s.length - 1 : Math.min(this.k, s.length - 1)];
    else { const u = s.filter(q => !this.tried.has(q.id)); m = u.length ? r.pick(u) : r.pick(s); }
    if (!m || m.state !== 'stand') return; this.tried.add(m.id); this.tapMember(m);
  }
}
class NoGate extends L.Kid {   // a child who plays the rounds but nobody touches during the gate or Talk time
  gate() {} talk() {}
}
function makeModel(name, w, age, seed) {
  const tp = L.typicalProfile(age);
  if (name === 'careful') return new Careful(w, Object.assign(tp, { skill: Math.min(0.97, L.typicalProfile(age).skill + 0.12), prompt: 0.3, think: [0.8, 1.8], aim: 0.35, pDistract: 0.02, pPoke: 0.02, pSlip: 0.005, pFlick: 0.05 }), seed);
  if (name === 'leftfirst') return new LeftFirst(w, tp, seed);
  if (/^pos/.test(name)) { const k = new PosK(w, tp, seed); k.k = name === 'posLast' ? -1 : +name.slice(3); return k; }
  if (name === 'nogate') return new NoGate(w, tp, seed);
  return L.makeModel(name, w, age, seed);
}

/* ------------------------------------------------------------------ one chained run (CHAIN sessions = "Play again") */
function runOne(o) {
  const w = L.mkWorld(o), kid = makeModel(o.model, w, o.age, o.seed + 1), sp = new Speech(w, o.lang), quiet = o.model === 'absent';
  kid.sp = sp; const gateWait0 = w.cfg.gateWait;
  const out = { model: o.model, age: o.age, sessions: [], stuckState: 0, nan: 0 };
  const dt = 1 / 30;
  for (let si = 0; si < (quiet ? 1 : CHAIN); si++) {
    sp.log = []; sp.reqs = 0;
    w.newSession();
    const S = { topics: w.levels.slice(), rounds: [], chapters: [], talks: 0, talkRight: 0, talkAuto: 0, time0: w.time, done: false, idles: [] };
    let R = null, chap = null, t = 0, sig = '', lastChange = 0, firstTouch = -1, askT = -1, doorOpenT = -1;
    const cap = quiet ? 400 : 1800;
    while (w.state !== 'sessionDone' && t < cap) {
      kid.step(dt); w.update(dt); t += dt;
      const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round;
      if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { out.stuckState++; break; }
      for (const e of w.drainEvents()) {
        if (kid.onEvent) kid.onEvent(e);
        sp.onEvent(e);
        switch (e.type) {
          case 'level': if (ADAPT) w.cfg.gateWait = gateWait0; chap = { topic: e.topic, t0: w.time, rounds: 0, level: e.level }; break;
          case 'round': {
            const c = w.cur, odd = c.members.find(m => m.odd).thing;
            R = { t0: w.time, topic: e.topic, level: w.level, ri: e.round, n: e.n, short: e.short, key: e.key, oddSlot: c.oddSlot, rule: c.rule.kind + '=' + c.rule.value,
              oddKey: L.FP.Content.thingKey(odd), oddColor: odd.color || '', oddAnimal: odd.animal || '', wrong: 0, hint: 0, hintIdle: 0, idle: 0, assist: 0, soft: 0, firstOk: null,
              surprise: e.surprise, gateAuto: false, gateLate: 0, prmHeard: null, cnt: c.rule.kind === 'n' ? Math.abs(c.rule.value - odd.n) : null, cntMax: c.rule.kind === 'n' ? Math.max(c.rule.value, odd.n) : null };
            firstTouch = -1; doorOpenT = -1; break;
          }
          case 'ask': if (R && e.first) { R.firstAsk = w.time; askT = w.time; } break;
          case 'right': case 'wrong':
            if (R && R.firstOk === null) { R.firstOk = e.type === 'right'; firstTouch = w.time; const pl = sp.log.find(x => x.kind === 'prompt' && x.t >= askT - 1e-6); R.prmHeard = !!(pl && pl.res === 'end' && pl.end <= w.time + 1e-6); R.prmCut = !!(pl && pl.res === 'cut'); }
            if (R && e.type === 'wrong') R.wrong++;
            if (R && e.type === 'right') R.playT = w.time - R.firstAsk;
            break;
          case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hint++; } break;
          case 'idle': if (R) R.idle++; if (quiet) S.idles.push(+w.time.toFixed(1)); break;
          case 'assist': if (R) R.assist++; break;
          case 'soft': if (R) R.soft++; break;
          case 'roundDone': if (R) R.stars = e.stars; break;
          case 'doorOpen': if (R) { R.gateAuto = !!e.auto; doorOpenT = w.time; } if (ADAPT) w.cfg.gateWait = e.auto ? ADAPT : gateWait0; break;
          case 'doorClose': if (R) { R.dur = w.time - R.t0 + w.cfg.outTime; R.t1 = w.time + w.cfg.outTime; S.rounds.push(R); if (chap) chap.rounds++; } R = null; break;
          case 'talk': S.talks++; break;
          case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; break;
          case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; S.chapters.push(chap); } chap = null; break;
          case 'sessionDone': S.done = true; break;
        }
      }
      sp.tick();
      if (doorOpenT >= 0 && sp.cur && sp.cur.kind === 'gate' && sp.cur.start >= doorOpenT - 1e-6 && !sp.cur._late) { sp.cur._late = true; const r = S.rounds.length; void r; S.gateLate = (S.gateLate || 0) + 1; }
    }
    // let the last lines finish
    for (let k = 0; k < 300 && (sp.cur || sp.q.length); k++) { w.time += 0.05; sp.tick(); }
    S.time = w.time - S.time0;
    // speech summary for this session
    const lg = sp.log, started = lg.filter(x => x.start >= 0), byKind = {};
    for (const x of lg) { const b = byKind[x.kind] = byKind[x.kind] || { n: 0, end: 0, cut: 0, dropped: 0, stale: 0, cutQ: 0 }; b.n++; if (x.res && b[x.res] !== undefined) b[x.res]++; }
    let talkS = 0; for (const x of started) talkS += Math.max(0, x.end - x.start);
    const st = started.slice().sort((a, b) => a.start - b.start), gaps = [];
    for (let k = 1; k < st.length; k++) gaps.push(st[k].start - st[k - 1].end);
    // silence while the child is supposed to act (play phase): longest gap that ends in a round's play window
    S.speech = { lines: started.length, reqs: lg.length, talkS, byKind, gaps8: gaps.filter(g => g > 8).length, gapMax: Math.max(0, ...gaps), gateLate: S.gateLate || 0,
      sameWithin10: (() => { let c = 0; for (let k = 1; k < st.length; k++) for (let j = k - 1; j >= 0 && st[k].start - st[j].start < 10; j--) if (st[j].text === st[k].text && st[k].kind !== 'prompt') { c++; break; } return c; })(),
      promptLat: lg.filter(x => x.kind === 'prompt' && x.start >= 0).map(x => x.start - x.t) };
    out.sessions.push(S);
    if (!S.done) break;
  }
  return out;
}

/* ------------------------------------------------------------------ summary */
const mean = L.mean, pct = L.pct, f1 = L.f1;
function summarize(list) {
  const by = {};
  for (const r of list) (by[r.model + '|' + r.age] = by[r.model + '|' + r.age] || []).push(r);
  const rows = [];
  for (const k of Object.keys(by)) {
    const runs = by[k], [model, age] = k.split('|'), ss = runs.flatMap(r => r.sessions), done = ss.filter(s => s.done);
    const rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), nR = Math.max(1, rounds.length);
    const share = f => rounds.filter(f).length / nR * 100;
    // slot spread per n
    const slots = {};
    for (const r of rounds) { const a = slots[r.n] = slots[r.n] || Array(r.n).fill(0); a[r.oddSlot]++; }
    // positional strategies on the real round stream (first-tap success %)
    const pos = { left: 0, second: 0, mid: 0, right: 0, exploit: 0, chance: 0 };
    let prevRel = null, prevSlot = -1;
    for (const s of ss) { prevSlot = -1; for (const r of s.rounds) {
      const n = r.n, mid = Math.floor((n - 1) / 2);
      pos.left += r.oddSlot === 0; pos.second += r.oddSlot === 1; pos.right += r.oddSlot === n - 1; pos.mid += r.oddSlot === mid; pos.chance += 1 / n;
      // exploit: "never where it was last time; prefer an inside member" — tap a random inside slot that is not last round's index, else an end
      const cand = []; for (let q = 1; q < n - 1; q++) if (q !== prevSlot) cand.push(q);
      const c2 = cand.length ? cand : [0, n - 1].filter(q => q !== prevSlot);
      pos.exploit += c2.includes(r.oddSlot) ? 1 / c2.length : 0;
      prevSlot = r.oddSlot; void prevRel;
    } }
    for (const q in pos) pos[q] = pos[q] / nR * 100;
    // content variety (consecutive rounds in a chapter; across sessions of a chain)
    let pairs = 0, sameRule = 0, sameOddKey = 0, sameOddCol = 0, colPairs = 0, sameWild = 0, wildPairs = 0, sameSlot = 0, sameRel = 0;
    for (const s of ss) for (let i = 1; i < s.rounds.length; i++) {
      const a = s.rounds[i - 1], b = s.rounds[i]; if (a.level !== b.level) continue;
      pairs++; sameRule += a.rule === b.rule; sameOddKey += a.oddKey === b.oddKey;
      const rel = r => (r.oddSlot === 0 ? 'L' : r.oddSlot === r.n - 1 ? 'R' : 'M'); sameRel += rel(a) === rel(b); sameSlot += a.oddSlot === b.oddSlot;
      if (b.topic === 'colors') { colPairs++; sameOddCol += a.oddColor === b.oddColor; }
      if (b.rule === 'home=farm') { wildPairs++; sameWild += a.oddAnimal === b.oddAnimal; }
    }
    let crossKey = 0, crossN = 0, sameFirstTopic = 0, chainN = 0, topicOverlap = 0;
    for (const r of runs) for (let i = 1; i < r.sessions.length; i++) {
      const A = new Set(r.sessions[i - 1].rounds.map(x => x.key)), B = r.sessions[i].rounds;
      crossN += B.length; crossKey += B.filter(x => A.has(x.key)).length; chainN++;
      sameFirstTopic += r.sessions[i - 1].topics[0] === r.sessions[i].topics[0];
      topicOverlap += r.sessions[i].topics.filter(t => r.sessions[i - 1].topics.includes(t)).length;
    }
    const sp = ss.map(s => s.speech), mins = ss.map(s => s.time / 60);
    const kinds = {};
    for (const x of sp) for (const kk in x.byKind) { const a = kinds[kk] = kinds[kk] || { n: 0, end: 0, cut: 0, dropped: 0, stale: 0, cutQ: 0 }; for (const f in a) a[f] += x.byKind[kk][f]; }
    const cnt = rounds.filter(r => r.cnt !== null);
    rows.push({ model, age: +age, sessions: ss.length, done: done.length / Math.max(1, ss.length) * 100,
      sess: mean(done.map(s => s.time)) / 60, sessP90: pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: mean(chaps.map(c => c.dur)), chapP10: pct(chaps.map(c => c.dur), 0.1), chapP90: pct(chaps.map(c => c.dur), 0.9), cut: chaps.filter(c => c.rounds < 4).length / Math.max(1, chaps.length) * 100,
      round: mean(rounds.map(r => r.dur)), roundP90: pct(rounds.map(r => r.dur), 0.9), roundMax: Math.max(0, ...rounds.map(r => r.dur)), play: mean(rounds.map(r => r.playT || 0)),
      stuck: rounds.filter(r => r.dur > 120).length, stuckState: runs.reduce((a, r) => a + r.stuckState, 0),
      st3: share(r => r.stars === 3), st2: share(r => r.stars === 2), st1: share(r => r.stars === 1), firstOk: share(r => r.firstOk === true),
      hintR: share(r => r.hint + r.hintIdle > 0), hintPer: mean(rounds.map(r => r.hint + r.hintIdle)), idleR: share(r => r.idle > 0), idlePerMin: rounds.reduce((a, r) => a + r.idle, 0) / Math.max(1e-9, mins.reduce((a, b) => a + b, 0)),
      assist: share(r => r.assist > 0), gateAuto: share(r => r.gateAuto), wrong: mean(rounds.map(r => r.wrong)),
      talkRight: ss.reduce((a, s) => a + s.talkRight, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100, talkAuto: ss.reduce((a, s) => a + s.talkAuto, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      slots, pos, idles: model === 'absent' && ss[0] ? ss[0].idles.slice(0, 7).join(' ') : '',
      sameRule: sameRule / Math.max(1, pairs) * 100, sameOddKey: sameOddKey / Math.max(1, pairs) * 100, sameOddCol: sameOddCol / Math.max(1, colPairs) * 100, sameWild: sameWild / Math.max(1, wildPairs) * 100,
      sameSlot: sameSlot / Math.max(1, pairs) * 100, sameRel: sameRel / Math.max(1, pairs) * 100,
      crossKey: crossKey / Math.max(1, crossN) * 100, sameFirstTopic: sameFirstTopic / Math.max(1, chainN) * 100, topicOverlap: topicOverlap / Math.max(1, chainN),
      cntGap: cnt.length ? mean(cnt.map(r => r.cnt)) : null, cntGap2: cnt.length ? cnt.filter(r => r.cnt === 2).length / cnt.length * 100 : null, cntSmall: cnt.length ? cnt.filter(r => r.cntMax <= 3).length / cnt.length * 100 : null,
      lpm: sp.reduce((a, x) => a + x.lines, 0) / Math.max(1e-9, mins.reduce((a, b) => a + b, 0)), talkPct: sp.reduce((a, x) => a + x.talkS, 0) / Math.max(1e-9, ss.reduce((a, s) => a + s.time, 0)) * 100,
      gaps8: sp.reduce((a, x) => a + x.gaps8, 0) / Math.max(1, ss.length), gapMax: Math.max(0, ...sp.map(x => x.gapMax)), gateLate: sp.reduce((a, x) => a + x.gateLate, 0) / Math.max(1, ss.length),
      same10: sp.reduce((a, x) => a + x.sameWithin10, 0) / Math.max(1, ss.length), prmLat: mean(sp.flatMap(x => x.promptLat)), prmLatP90: pct(sp.flatMap(x => x.promptLat), 0.9),
      prmHeard: rounds.filter(r => r.prmHeard !== null).length ? rounds.filter(r => r.prmHeard).length / rounds.filter(r => r.prmHeard !== null).length * 100 : 0,
      kinds });
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  return rows;
}
function table(rows) {
  const o = [];
  o.push('## Flow', '', '| model | age | sess | done % | session min mean (p90, max) | chapter s mean [p10–p90] (cut %) | round s mean (p90, max) | play s | stuck rounds / states | stars 3/2/1 % | 1st tap right % | wrong/round | hint rounds % (per round) | idle rounds % (per min) | assist % | gate auto % | talk right % (auto %) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.sessions} | ${f1(r.done)} | ${f1(r.sess)} (${f1(r.sessP90)}, ${f1(r.sessMax)}) | ${f1(r.chap)} [${f1(r.chapP10)}–${f1(r.chapP90)}] (${f1(r.cut)}) | ${f1(r.round)} (${f1(r.roundP90)}, ${f1(r.roundMax)}) | ${f1(r.play)} | ${r.stuck} / ${r.stuckState} | ${f1(r.st3)}/${f1(r.st2)}/${f1(r.st1)} | ${f1(r.firstOk)} | ${r.wrong.toFixed(2)} | ${f1(r.hintR)} (${r.hintPer.toFixed(2)}) | ${f1(r.idleR)} (${r.idlePerMin.toFixed(2)}) | ${f1(r.assist)} | ${f1(r.gateAuto)} | ${f1(r.talkRight)} (${f1(r.talkAuto)}) |${r.idles ? ' idle at ' + r.idles : ''}`);
  o.push('', '## Odd slot + positional strategies (first-tap success %, chance = Σ1/n)', '', '| model | age | slot spread n=3 | n=4 | n=5 | always left | always 2nd | always middle | always right | exploit "inside, not last index" | chance | same slot index in a row % | same place (L/inside/R) in a row % |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const sl = (a) => a ? (() => { const t = a.reduce((x, y) => x + y, 0); return a.map(v => (v / t * 100).toFixed(0)).join('/'); })() : '–';
  for (const r of rows) if (/^(typical|careful)$/.test(r.model)) o.push(`| ${r.model} | ${r.age} | ${sl(r.slots[3])} | ${sl(r.slots[4])} | ${sl(r.slots[5])} | ${f1(r.pos.left)} | ${f1(r.pos.second)} | ${f1(r.pos.mid)} | ${f1(r.pos.right)} | ${f1(r.pos.exploit)} | ${f1(r.pos.chance)} | ${f1(r.sameSlot)} | ${f1(r.sameRel)} |`);
  o.push('', '## Variety (consecutive rounds in a chapter; next "Play again" session)', '', '| model | age | same ask value % | same odd thing % | same odd colour (colours) % | same wild animal (farm) % | set seen last session % | same 1st topic as last session % | topics shared with last session (of 4) | count: mean gap, gap 2 %, both ≤ 3 % |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) if (/^(typical|careful)$/.test(r.model)) o.push(`| ${r.model} | ${r.age} | ${f1(r.sameRule)} | ${f1(r.sameOddKey)} | ${f1(r.sameOddCol)} | ${f1(r.sameWild)} | ${f1(r.crossKey)} | ${f1(r.sameFirstTopic)} | ${r.topicOverlap.toFixed(2)} | ${r.cntGap === null ? '–' : r.cntGap.toFixed(2) + ', ' + f1(r.cntGap2) + ', ' + f1(r.cntSmall)} |`);
  o.push('', '## Talking load (speech model)', '', '| model | age | lines/min | % of time Bo talks | prompt start delay s mean (p90) | prompt heard in full before 1st touch % | silences > 8 s / session (max s) | gate line after doors opened / session | same line twice < 10 s / session | cut (by kind) | dropped+stale (by kind) |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const cut = Object.entries(r.kinds).filter(([, v]) => v.cut).map(([k, v]) => `${k} ${f1(v.cut / v.n * 100)}%`).join(', ');
    const drop = Object.entries(r.kinds).filter(([, v]) => v.dropped + v.stale + v.cutQ).map(([k, v]) => `${k} ${f1((v.dropped + v.stale + v.cutQ) / v.n * 100)}%`).join(', ');
    o.push(`| ${r.model} | ${r.age} | ${f1(r.lpm)} | ${f1(r.talkPct)} | ${r.prmLat.toFixed(2)} (${r.prmLatP90.toFixed(2)}) | ${f1(r.prmHeard)} | ${r.gaps8.toFixed(2)} (${f1(r.gapMax)}) | ${r.gateLate.toFixed(2)} | ${r.same10.toFixed(2)} | ${cut || '–'} | ${drop || '–'} |`);
  }
  return o.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('run failed', JSON.stringify(j), e.stack); res.push({ model: j.model, age: j.age, sessions: [], stuckState: 0, failed: String(e) }); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) {
    if (model === 'slow3' && age > 4 && !get('models')) continue;
    const n = model === 'absent' ? 2 : /^(typical|careful)$/.test(model) ? N : Math.max(10, Math.round(N / 5));
    for (let i = 0; i < n; i++) jobs.push({ model, age, seed: 5000 + i * 53 + age * 11, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
  }
  const parts = Array.from({ length: JOBS }, () => []);
  jobs.forEach((j, i) => parts[i % JOBS].push(j));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, process.argv.slice(2).concat(['--worker'])); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej);
    c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code)); });
    c.send(p);
  }))).then(rs => {
    const list = rs.flat(), failed = list.filter(r => r.failed), rows = summarize(list.filter(r => !r.failed));
    const head = `# pt_playtest ${TAG} — ${list.length} runs × ≤ ${CHAIN} sessions (${failed.length} failed), config ${JSON.stringify(config)}, patch [${PATCH.join(',')}] (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    const md = head + table(rows);
    console.log(md);
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'pt_' + TAG + '.md'), md + '\n');
    fs.writeFileSync(path.join(dir, 'pt_' + TAG + '.json'), JSON.stringify({ config, patch: PATCH, rows }, null, 1));
    if (failed.length) { console.log('FAILED runs: ' + failed.length + ' ' + failed[0].failed); process.exit(1); }
  }).catch(e => { console.error(e); process.exit(1); });
}
