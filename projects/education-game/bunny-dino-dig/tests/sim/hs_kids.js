#!/usr/bin/env node
// Bun's Dino Dig — extended HIGH-SPEED playtest (report-only; never edits game/js). Adds to hs_playtest.js:
//   * more child models: slowOnce (a slow 3-year-old who taps ONCE and waits for the shovel), high (taps the peeking thing's
//     top or above the mound), sandOnly (only ever taps empty sand), shelfBun (taps the shelf / Bun a lot), + lib's typical,
//     slow3, tapper, spammer, perfect, bot0.5 / bot0.8 / bot1;
//   * per-step metrics: first dig right %, tap → judgement wait, ask → first dig, hints / assists;
//   * a model of the SPEECH pipeline (main.js onEvent policy + voice.js queue: 1 speaking + ≤ 2 waiting, interrupt, stale
//     5 s, prompt guard) with a duration model (EN / VI chars × s/char at rate 0.9) → lines / min, talk ratio, prompt
//     delay / cut-offs, words dropped by reason;
//   * content variety: the same set again in a session, the same answer value twice in a row, the same prompt text twice in
//     a row, the target's left-to-right rank, per-chapter difficulty curve.
//   node tests/sim/hs_kids.js [--n 150] [--ages 3,4,5,6,7] [--models …] [--config '{…}'] [--jobs 2] [--tag x] [--voice '{…}']
// Output: markdown on stdout + tests/sim/out/kids_<tag>.md (+ .json, git-ignored).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fork } = require('child_process');
const L = require('./lib');
const DD = L.DD;
const { resolve } = require('../unit/load');
if (!DD.I18N) vm.runInThisContext(fs.readFileSync(resolve('i18n.js'), 'utf8'), { filename: 'i18n.js' });
const I = DD.I18N;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 150), config = JSON.parse(get('config', '{}')), VOPT = JSON.parse(get('voice', '{}'));
const ALL = 'typical,slow3,slowOnce,high,sandOnly,shelfBun,tapper,spammer,perfect,bot0.5,bot0.8,bot1';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);
// --patch noRepeat: a SIM-ONLY wrapper around Content.makeRound (proposal, not game code): the first find step of a round
// never asks for the same answer value as the last find step of the previous round in that chapter (re-roll ≤ 20×).
const PATCH = get('patch', '');
// --patch topPad=40: a SIM-ONLY copy of World._moundAt whose thing-box top pad is 40 px instead of the hard-coded 8
// (proposal: CONFIG.thingTopPad); everything else identical.
// --patch countScoops2: SIM-ONLY — counting rounds dig every bone in 2 scoops (proposal: Content scoops 2 for count at every age).
if (/countScoops2/.test(PATCH)) {
  const C = DD.Content, mk0 = C.makeRound.bind(C);
  C.makeRound = function (topic, o) { const r = mk0(topic, o); if (r.steps[0].mode === 'count') r.scoops = 2; return r; };
}
const TOP = /topPad=(\d+)/.exec(PATCH);
if (TOP) {
  const pad = +TOP[1], hyp = Math.hypot;
  DD.World.prototype._moundAt = function (x, y) {
    let best = null, bd = 1e9; const cfg = this.cfg;
    for (const m of this.mounds) {
      if (m.pop < 0.3) continue;
      const c = this._hitC(m), d = hyp(x - c.x, y - c.y); let hit = d <= c.r;
      if (!hit && m.state !== 'empty') { const bw = (cfg.thingW[m.thing.kind] || 0.8) * m.size / 2 + 8, top = m.thingY - m.size - pad; hit = x >= m.x - bw && x <= m.x + bw && y >= top && y <= m.y; }
      if (hit && d < bd) { bd = d; best = m; }
    }
    return best;
  };
}
if (/noRepeat/.test(PATCH)) {
  const C = DD.Content, mk = C.makeRound.bind(C); let lastAns = null;
  C.makeRound = function (topic, o) {
    if (!o.roundIndex) lastAns = null;
    let r;
    for (let k = 0; k < 20; k++) { r = mk(topic, o); const s0 = r.steps[0]; if (s0.mode !== 'find' || lastAns === null || s0.nameValue !== lastAns || /size/.test(topic) && k > 3) break; }
    const fs = r.steps.filter(s => s.mode === 'find'); lastAns = fs.length ? fs[fs.length - 1].nameValue : null;
    return r;
  };
}

/* ---------------------------------------------------------------- extra child models */
function slowOnceProfile() {
  return Object.assign(L.slowProfile(), { pMore: 0, think: [3, 7], between: [2, 4], pDistract: 0.12 });
}
/** "Taps high": aims at the peeking thing's top or above the mound (children tap what they SEE: the egg tip). */
class HighKid extends L.Kid {
  jit(pt) {
    const w = this.w, r = this.r;
    let best = null, bd = 1e9;
    for (const m of w.mounds) { const c = w.moundTap(m.id), d = Math.hypot(c.x - pt.x, c.y - pt.y); if (d < bd) { bd = d; best = m; } }
    if (!best || bd > 2) return super.jit(pt);
    const m = best, top = m.thingY - m.size, u = r.next();
    const y = u < 0.4 ? top + r.float(0, 0.25 * m.size) : u < 0.75 ? top - r.float(0, 40) : top - r.float(40, 90);
    return { x: m.x + r.float(-0.35, 0.35) * m.size * (L.DD.CONFIG.thingW[m.thing.kind] || 0.8), y };
  }
}
/** Only ever taps empty sand inside the dig site (never a mound): the assist must still finish every round. */
class SandKid extends L.Kid {
  aim() {
    const w = this.w, r = this.r, Ly = w.layout, F = Ly.field;
    for (let k = 0; k < 40; k++) {
      const pt = { x: r.float(F.x0, F.x1), y: r.float(F.y0 - 0.8 * Ly.item, Ly.groundY) };
      if (!w._moundAt(pt.x, pt.y) && !inBox(w._bunBox(), pt) && !inBox(Ly.shelf, pt)) return pt;
    }
    return { x: (F.x0 + F.x1) / 2, y: Ly.groundY - 2 };
  }
}
/** Taps the shelf (35 %) and Bun (15 %) a lot, otherwise a typical child. */
class ShelfBunKid extends L.Kid {
  aim() {
    const w = this.w, r = this.r, u = r.next(), S = w.layout.shelf;
    if (!w.hintHand && u < 0.35) { this.stats.pokes++; return { x: r.float(S.x + 10, S.x + S.w - 10), y: r.float(S.y + 10, S.y + S.h - 10) }; }
    if (!w.hintHand && u < 0.5) { this.stats.pokes++; const b = w.bunHit(); return { x: b.x + r.float(-20, 20), y: b.y + r.float(-40, 40) }; }
    return super.aim();
  }
}
function inBox(b, p) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
function makeModel(name, w, age, seed) {
  if (name === 'slowOnce') return new L.Kid(w, slowOnceProfile(), seed);
  if (name === 'high') return new HighKid(w, L.typicalProfile(age), seed);
  if (name === 'sandOnly') return new SandKid(w, Object.assign(L.typicalProfile(age), { pPoke: 0, pAlready: 0 }), seed);
  if (name === 'shelfBun') return new ShelfBunKid(w, L.typicalProfile(age), seed);
  return L.makeModel(name, w, age, seed);
}

/* ---------------------------------------------------------------- speech model (main.js §onEvent + voice.js queue) */
const SPC = Object.assign({ en: 0.072, vi: 0.078, lat: 0.25, interruptGap: 0.09, maxQ: 2, stale: 5 }, VOPT);
const nWords = s => (String(s).trim().match(/[^\s—,.!?…]+/g) || []).length;
class SpeechSim {
  constructor(w, lang, seed) {
    this.w = w; this.lang = lang; this.rng = new DD.RNG(seed);
    this.cur = null; this.q = []; this.kickAt = -1;
    this.promptUntil = 0; this.pendingPrompt = null; this.promptStart = -1e9; this.lastSpoken = '';
    this.lastWrongSay = -1e9; this.lastSoftSay = -1e9; this.lastPraise = -1e9; this.lastFoundAt = -1e9; this.scoopSaid = 0; this.idleSaid = 0;
    this.lastPromptText = ''; this.prevPromptText = ''; this.lastAsk = null;
    this.st = { req: 0, spoken: 0, words: 0, wordsSpoken: 0, speakSec: 0, drop: {}, dropW: {}, cutW: 0, cut: {}, cutBy: {}, byKind: {},
      prompts: 0, promptStarted: 0, promptCut: 0, promptDelay: [], promptFull: 0, promptSame: 0, countReq: 0, countSpoken: 0, wait: [], log: [] };
  }
  get t() { return this.w.time; }
  T1(key, p) { return I.t(this.lang, key, Object.assign({ child: '' }, p || {}), this.rng); }
  T(key, p) { let r = this.T1(key, p); for (let k = 0; k < 3 && r && r === this.lastSpoken; k++) r = this.T1(key, p); return r; }
  dur(text) { return SPC.lat + String(I.speech(this.lang, text)).length * SPC[this.lang]; }
  canInterrupt() { return this.t > this.promptUntil; }
  drop(it, why) {
    if (it.done) return; it.done = true;
    this.st.drop[it.kind + ':' + why] = (this.st.drop[it.kind + ':' + why] || 0) + 1;
    this.st.dropW[why] = (this.st.dropW[why] || 0) + nWords(it.text);
    if (it.onNoStart) it.onNoStart();
  }
  say(text, o, kind) {
    if (!text) return null;
    o = o || {}; this.lastSpoken = text;
    const it = { text, kind, t: this.t, priority: !!o.priority, done: false, started: false };
    this.st.req++; this.st.words += nWords(text); this.st.byKind[kind] = (this.st.byKind[kind] || 0) + 1;
    if (this.st.log.length < 400) this.st.log.push([+this.t.toFixed(2), kind, text]);
    if (o.interrupt) {
      for (const q of this.q) this.drop(q, 'interrupted'); this.q = [];
      this.cancelCurrent(kind);
      this.q.push(it); this.kickAt = this.t + SPC.interruptGap;
      return it;
    }
    this.q.push(it);
    while (this.q.length > SPC.maxQ) {
      let idx = this.q.findIndex((q, i) => i < this.q.length - 1 && !q.priority); if (idx < 0) idx = 0;
      this.drop(this.q.splice(idx, 1)[0], 'dropped');
    }
    if (!this.cur && this.kickAt < 0) this.kickAt = this.t;
    return it;
  }
  cancelCurrent(by) {
    const c = this.cur; if (!c) return;
    const frac = Math.min(1, Math.max(0, (this.t - c.start - SPC.lat) / Math.max(0.01, c.end - c.start - SPC.lat)));
    const lost = Math.round(nWords(c.text) * (1 - frac));
    if (c.kind === 'wrong') { const m1 = c.text.search(/[.!?](\s|$)/), f1s = m1 > 0 ? (m1 + 1) / c.text.length : 1; if (frac >= f1s) this.st.wrongHeard = (this.st.wrongHeard || 0) + 1; }
    if (frac < 0.97) {
      this.st.cut[c.kind] = (this.st.cut[c.kind] || 0) + 1; const ck = c.kind + '<' + by + (c.kind === 'prompt' ? '@' + (frac < 0.5 ? 'first half' : 'second half') : ''); this.st.cutBy[ck] = (this.st.cutBy[ck] || 0) + 1; this.st.cutW += lost; this.st.dropW.cut = (this.st.dropW.cut || 0) + lost;
      this.st.wordsSpoken += nWords(c.text) - lost; if (c.kind === 'prompt') this.st.promptCut++;
    } else { this.st.wordsSpoken += nWords(c.text); if (c.kind === 'prompt') this.st.promptFull++; if (c.kind === 'count') this.st.countSpoken++; }
    this.st.speakSec += this.t - c.start;
    c.done = true; this.cur = null; this.kickAt = Math.max(this.kickAt, this.t);
  }
  tick() {
    const t = this.t;
    if (this.cur && t >= this.cur.end) {
      const c = this.cur; this.cur = null; c.done = true;
      this.st.spoken++; this.st.speakSec += c.end - c.start; this.st.wordsSpoken += nWords(c.text);
      if (c.kind === 'prompt') this.st.promptFull++;
      if (c.kind === 'count') this.st.countSpoken++;
      if (c.kind === 'wrong') this.st.wrongHeard = (this.st.wrongHeard || 0) + 1;
      this.kickAt = t;
    }
    if (!this.cur && this.kickAt >= 0 && t >= this.kickAt) {
      this.kickAt = -1;
      while (this.q.length) {
        const it = this.q.shift();
        if (!it.priority && t - it.t > SPC.stale) { this.drop(it, 'stale'); continue; }
        it.started = true; it.start = t; it.end = t + this.dur(it.text); this.cur = it;
        this.st.wait.push(t - it.t);
        if (it.kind === 'prompt') { this.st.promptStarted++; this.st.promptDelay.push(t - it.t); }
        if (this.pendingPrompt && it.text === this.pendingPrompt) { this.promptStart = t; this.promptUntil = t + 0.3 + 0.072 * it.text.length; this.pendingPrompt = null; }
        break;
      }
    }
  }
  speakPrompt(txt, o) {
    this.pendingPrompt = txt; this.promptStart = this.t; this.promptUntil = this.t + 6 + 0.072 * txt.length;
    this.st.prompts++;
    const it = this.say(txt, o, 'prompt');
    if (it) it.onNoStart = () => { if (this.pendingPrompt === txt) { this.pendingPrompt = null; this.promptUntil = Math.min(this.promptUntil, this.t + 0.3); } };
  }
  currentPrompt() { if (this.lastPromptText) return this.lastPromptText; const p = this.w.prompt(); return p ? this.T(p.promptKey, p.params) : ''; }
  ev2(e) {
    const w = this.w, s = w.stepInfo || (w.cur && w.cur.steps && w.cur.steps[Math.max(0, w.step)]) || null, m = e.id ? w.moundById(e.id) : null;
    return Object.assign({ topic: w.topic, params: s ? s.params : (this.lastAsk && this.lastAsk.params) }, e, { thing: e.thing || (m && m.thing) || undefined });
  }
  onEvent(e) {
    const w = this.w, lang = this.lang, now = this.t;
    switch (e.type) {
      case 'level': this.say(this.T('ui.chapter', { n: e.level + 1 }) + '. ' + this.T('topic.' + e.topic), { interrupt: true }, 'level'); this.say(this.T('weather.' + (e.weather % 4)), {}, 'weather'); this.scoopSaid = 0; break;
      case 'round': this.idleSaid = 0; this.lastAsk = null; this.lastPromptText = ''; break;
      case 'ask': {
        this.lastAsk = e; this.idleSaid = 0;
        const txt = I.ask(lang, e.promptKey, Object.assign({ child: '' }, e.params || {}), { next: !e.first && e.step > 0 });
        if (txt === this.prevPromptText) this.st.promptSame++;
        this.prevPromptText = txt; this.lastPromptText = txt;
        this.speakPrompt(txt, { priority: true }); break;
      }
      case 'scoop': if ((e.i || 0) === 0 && this.scoopSaid < 1 && this.canInterrupt() && !e.again) { this.scoopSaid++; this.say(this.T('scoop'), {}, 'scoop'); } break;
      case 'found':
        this.promptUntil = 0; this.pendingPrompt = null;
        if (e.count) { this.st.countReq++; this.say(I.sayCount(lang, e.count.i), {}, 'count'); this.promptUntil = now + 0.7; }
        else {
          this.lastFoundAt = now;
          const txt = I.sayFound(lang, this.ev2(e));
          if (SPC.foundAfterWrong && this.cur && this.cur.kind === 'wrong' && now - this.cur.start < SPC.foundAfterWrong) {   // let "That's a blue egg…" finish, then the find
            this.q = this.q.filter(q => { if (q.kind === 'hint') { this.drop(q, 'dropped'); return false; } return true; });
            this.say(txt, { priority: true }, 'found');
          } else this.say(txt, { interrupt: true }, 'found');
        }
        break;
      case 'hatch': if (now - this.lastFoundAt > 1.8 || !this.cur) this.say(I.sayHatch(lang, e), {}, 'hatch'); break;
      case 'stepDone': { const s = w.cur && w.cur.steps && w.cur.steps[e.step]; if (s && s.mode === 'count') this.say(I.sayCountDone(lang, s.need), {}, 'countDone'); break; }
      case 'wrong': if (now - this.lastWrongSay > 1.5) { this.lastWrongSay = now; { let wt = I.sayWrong(lang, this.ev2(e)) || this.T('hint'); if (SPC.wrongShortAge && this.w.age <= SPC.wrongShortAge) { const m1 = wt.search(/[.!?](\s|$)/); if (m1 > 0) wt = wt.slice(0, m1 + 1); } this.say(wt, { interrupt: this.canInterrupt() }, 'wrong'); } } break;
      case 'already': if (now - this.lastSoftSay > 3 && this.canInterrupt()) { this.lastSoftSay = now; this.say(this.T('already'), {}, 'already'); } break;
      case 'hint': if (!e.idle) this.say(this.T('hint'), {}, 'hint'); break;
      case 'assist': this.say(this.T('hint'), {}, 'assist'); break;
      case 'idle': if (++this.idleSaid <= 4) this.say(this.T('idle') + ' ' + this.currentPrompt(), {}, 'idle'); break;
      case 'pokeBun': {
        const since = now - this.promptStart, stuck = this.pendingPrompt && since > 6;
        if (SPC.noRepeatWhileSpeaking && this.cur && this.cur.kind === 'prompt') break;
        if (since > 3 && (!this.pendingPrompt || stuck) && w.state === 'round') { this.promptUntil = 0; this.speakPrompt(this.currentPrompt(), { interrupt: true }); this.st.byKind.repeat = (this.st.byKind.repeat || 0) + 1; }
        break;
      }
      case 'mole': if (this.canInterrupt()) this.say(this.T('surprise.mole'), {}, 'surprise'); break;
      case 'moleTap': this.say(this.T('mole.tap'), { interrupt: this.canInterrupt() }, 'surpriseTap'); break;
      case 'ptero': if (this.canInterrupt()) this.say(this.T('surprise.ptero'), {}, 'surprise'); break;
      case 'pteroTap': this.say(this.T('ptero.tap'), { interrupt: this.canInterrupt() }, 'surpriseTap'); break;
      case 'roundDone': if (SPC.praiseIfQuiet && (this.cur || this.q.length) && e.stars < 3) break; if (now - this.lastPraise > 1.2) { this.lastPraise = now; this.say(this.T(e.stars >= 3 ? 'great' : 'praise'), {}, 'praise'); } break;
      case 'talk': { const tk = e.talk || w.talk; this.speakPrompt(this.T('talk.intro') + ' ' + this.T(tk.promptKey, tk.params || {}), { priority: true }); break; }
      case 'talkAsk': { const tk = e.talk || w.talk; if (tk && e.n <= 3) this.say(this.T(tk.promptKey, tk.params || {}), { priority: true }, 'talkAsk'); break; }
      case 'talkResult': {
        const tk = w.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        this.say(e.correct && !e.auto ? this.T('talk.right') : I.talkWrong(lang, ans), { interrupt: true }, 'talkResult'); break;
      }
      case 'sessionDone': this.say(this.T('party'), { interrupt: true }, 'party'); this.say(this.T('session.done', { stars: e.stars || 0 }), {}, 'done'); break;
    }
  }
}

/* ---------------------------------------------------------------- one session */
function runOne(o) {
  const w = L.mkWorld(o), d = makeModel(o.model, w, o.age, o.seed + 1), sp = new SpeechSim(w, o.lang, o.seed + 7);
  const S = { model: o.model, age: o.age, lang: o.lang, done: false, nan: false, time: 0, rounds: [], chapters: [], steps: [], digWait: [], digWaitAlong: [], talks: 0, talkRight: 0,
    repSet: 0, sameAns: 0, ansPairs: 0, rank: {}, badText: [], sameT: {}, repT: {} };
  w.newSession();
  const dt = 1 / 30, cap = 1800;
  let R = null, chap = null, St = null, dig = null, prevAns = null, keys = new Set(), lastChange = 0, sig = '';
  const closeStep = () => { if (St) { S.steps.push(St); St = null; } };
  while (w.state !== 'sessionDone' && w.time < cap) {
    d.step(dt); w.update(dt);
    if (!Number.isFinite(w.shovel.x) || !Number.isFinite(w.stars)) { S.nan = true; break; }
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.step + ':' + w.mounds.filter(m => m.state !== 'buried').length + ':' + !!w.dig;
    if (s2 !== sig) { sig = s2; lastChange = w.time; } else if (w.time - lastChange > 200) { S.stuck = s2; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      sp.onEvent(e);
      const t = w.time;
      switch (e.type) {
        case 'level': chap = { i: e.level, topic: e.topic, t0: t, rounds: 0 }; prevAns = null; break;
        case 'round': {
          R = { ch: w.level, topic: w.topic, ri: e.round, t0: t, mounds: e.mounds, steps: e.steps, wrong: 0, hint: 0, assist: 0, surprise: e.surprise };
          if (keys.has(e.key)) { S.repSet++; S.repT[w.topic] = (S.repT[w.topic] || 0) + 1; } keys.add(e.key);
          break;
        }
        case 'ask': {
          closeStep();
          const s = w.stepInfo;
          St = { ch: w.level, topic: w.topic, mode: e.mode, age: o.age, t0: t, firstTap: null, firstDig: null, firstRight: null, wrong: 0, hint: 0, assist: 0, dur: 0 };
          if (s && s.mode === 'find') {
            const v = s.nameValue + '|' + s.nameKind, tt = (S.sameT[w.topic] = S.sameT[w.topic] || [0, 0]); if (prevAns !== null) { S.ansPairs++; tt[1]++; if (v === prevAns) { S.sameAns++; tt[0]++; } } prevAns = v;
            const xs = w.mounds.map(m => m.x).sort((a, b) => a - b), tm = w.moundById(s.targets[0]);
            if (tm) { const k = xs.indexOf(tm.x) + '/' + xs.length; S.rank[k] = (S.rank[k] || 0) + 1; }
          }
          break;
        }
        case 'sandTap': case 'already': case 'shelfTap': case 'pokeBun': case 'busy': case 'soft':
          if (St && St.firstTap === null && w.state === 'round') St.firstTap = e.type; break;
        case 'dig':
          if (St && St.firstTap === null && !e.again) { const s = w.stepInfo; St.firstTap = s && s.targets.indexOf(e.id) >= 0 ? (e.assist ? 'assist' : 'right') : 'other'; }
          if (!e.again) { dig = { t0: t, along: 0 }; if (St && St.firstDig === null) { St.firstDig = t - St.t0; St.firstAssist = !!e.assist; } }
          else if (dig && e.added) dig.along++;
          break;
        case 'found': case 'wrong':
          if (dig) { (dig.along ? S.digWaitAlong : S.digWait).push(t - dig.t0); dig = null; }
          if (St && St.firstRight === null) St.firstRight = e.type === 'found';
          if (e.type === 'wrong') { if (St) St.wrong++; if (R) R.wrong++; }
          break;
        case 'hint': if (St) St.hint++; if (R) R.hint++; break;
        case 'assist': if (St) St.assist++; if (R) R.assist++; break;
        case 'stepDone': if (St) St.dur = t - St.t0; break;
        case 'roundDone': closeStep(); if (R) { R.dur = t - R.t0; R.stars = e.stars; S.rounds.push(R); if (chap) chap.rounds++; } R = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; break;
        case 'levelDone': if (chap) { chap.dur = t - chap.t0; S.chapters.push(chap); } chap = null; break;
        case 'sessionDone': S.done = true; break;
      }
    }
    sp.tick();
  }
  S.time = w.time;
  // text sanity of everything Bun was asked to say
  for (const [, kind, text] of sp.st.log) {
    if (/undefined|null|NaN|\{|\}|\[object/.test(text)) S.badText.push(kind + ': ' + text);
    if (o.lang === 'vi' && /\b(the|find|egg|stone|bone|let's|dig|great|hooray)\b/i.test(text)) S.badText.push('EN-in-VI ' + kind + ': ' + text);
  }
  const st = sp.st; delete st.log;
  S.speech = st;
  return S;
}

/* ---------------------------------------------------------------- summaries */
const f1 = L.f1, mean = L.mean, pct = L.pct;
const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|'), done = ss.filter(s => s.done);
    const rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), steps = ss.flatMap(s => s.steps);
    const find = steps.filter(s => s.mode === 'find' && s.firstRight !== null);
    const dw = ss.flatMap(s => s.digWait), dwa = ss.flatMap(s => s.digWaitAlong);
    const mins = sum(ss, s => s.time) / 60, sp = ss.map(s => s.speech);
    const dropW = {}; sp.forEach(x => { for (const r in x.dropW) dropW[r] = (dropW[r] || 0) + x.dropW[r]; });
    const drops = {}; sp.forEach(x => { for (const r in x.drop) drops[r] = (drops[r] || 0) + x.drop[r]; });
    const cuts = {}; sp.forEach(x => { for (const r in x.cutBy) cuts[r] = (cuts[r] || 0) + x.cutBy[r]; });
    const st = [3, 2, 1].map(n => rounds.filter(r => r.stars === n).length / Math.max(1, rounds.length) * 100);
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100,
      sess: mean(done.map(s => s.time)) / 60, sessP90: pct(done.map(s => s.time), 0.9) / 60,
      chap: mean(chaps.map(c => c.dur)), chapP10: pct(chaps.map(c => c.dur), 0.1), chapP90: pct(chaps.map(c => c.dur), 0.9),
      round: mean(rounds.map(r => r.dur)), roundP90: pct(rounds.map(r => r.dur), 0.9), maxRound: Math.max(0, ...rounds.map(r => r.dur)), stuck: rounds.filter(r => r.dur > 120).length + ss.filter(s => s.stuck).length,
      st3: st[0], st2: st[1], st1: st[2],
      firstRight: find.filter(s => s.firstRight).length / Math.max(1, find.length) * 100,
      firstAssist: find.filter(s => s.firstAssist).length / Math.max(1, find.length) * 100,
      firstTapRight: find.filter(s => s.firstTap === 'right').length / Math.max(1, find.length) * 100,
      firstTapMiss: find.filter(s => s.firstTap === 'sandTap' || s.firstTap === 'soft').length / Math.max(1, find.length) * 100,
      firstDig: mean(steps.filter(s => s.firstDig !== null).map(s => s.firstDig)), firstDigP90: pct(steps.filter(s => s.firstDig !== null).map(s => s.firstDig), 0.9),
      digWait: mean(dw), digWaitAlong: mean(dwa), alongPct: dwa.length / Math.max(1, dw.length + dwa.length) * 100,
      hintR: rounds.filter(r => r.hint > 0).length / Math.max(1, rounds.length) * 100, hint: mean(rounds.map(r => r.hint)),
      assistR: rounds.filter(r => r.assist > 0).length / Math.max(1, rounds.length) * 100,
      wrong: mean(rounds.map(r => r.wrong)),
      talkRight: sum(ss, s => s.talkRight) / Math.max(1, sum(ss, s => s.talks)) * 100,
      lpm: sum(sp, x => x.req) / mins, spm: sum(sp, x => x.spoken) / mins, talkRatio: sum(sp, x => x.speakSec) / (mins * 60) * 100,
      prompts: sum(sp, x => x.prompts), promptStarted: sum(sp, x => x.promptStarted) / Math.max(1, sum(sp, x => x.prompts)) * 100,
      promptCut: sum(sp, x => x.promptCut) / Math.max(1, sum(sp, x => x.prompts)) * 100,
      promptDelay: mean(sp.flatMap(x => x.promptDelay)), promptDelayP90: pct(sp.flatMap(x => x.promptDelay), 0.9),
      promptSame: sum(sp, x => x.promptSame) / Math.max(1, sum(sp, x => x.prompts)) * 100,
      countLost: (sum(sp, x => x.countReq) - sum(sp, x => x.countSpoken)) / Math.max(1, sum(sp, x => x.countReq)) * 100,
      wordsLost: (sum(sp, x => x.words) - sum(sp, x => x.wordsSpoken)) / Math.max(1, sum(sp, x => x.words)) * 100,
      wordsLostPerMin: (sum(sp, x => x.words) - sum(sp, x => x.wordsSpoken)) / mins,
      dropW, drops, cuts,
      repSet: sum(ss, s => s.repSet) / ss.length, sameAns: sum(ss, s => s.sameAns) / Math.max(1, sum(ss, s => s.ansPairs)) * 100,
      sameT: ss.reduce((a, s) => { for (const t in s.sameT) { a[t] = a[t] || [0, 0]; a[t][0] += s.sameT[t][0]; a[t][1] += s.sameT[t][1]; } return a; }, {}),
      repT: ss.reduce((a, s) => { for (const t in s.repT) a[t] = (a[t] || 0) + s.repT[t] / ss.length; return a; }, {}),
      wrongHeard: sum(sp, x => x.wrongHeard || 0) / Math.max(1, sum(sp, x => x.byKind.wrong || 0)) * 100,
      badText: ss.flatMap(s => s.badText).slice(0, 8), badN: sum(ss, s => s.badText.length),
      rank: ss.reduce((a, s) => { for (const r in s.rank) a[r] = (a[r] || 0) + s.rank[r]; return a; }, {}),
      perChap: [0, 1, 2, 3].map(c => { const rr = rounds.filter(r => r.ch === c), cc = chaps.filter(x => x.i === c); return { topic: (cc[0] || {}).topic || '', chap: mean(cc.map(x => x.dur)), round: mean(rr.map(r => r.dur)), wrong: mean(rr.map(r => r.wrong)), mounds: mean(rr.map(r => r.mounds)), steps: mean(rr.map(r => r.steps)), hint: rr.filter(r => r.hint).length / Math.max(1, rr.length) * 100, st3: rr.filter(r => r.stars === 3).length / Math.max(1, rr.length) * 100 }; }) });
  }
  rows.sort((a, b) => MODELS.indexOf(a.model) - MODELS.indexOf(b.model) || a.age - b.age);
  return rows;
}
function tables(rows) {
  const o = [];
  o.push('### A. Pace, help, stars', '', '| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st tap digs it % · 1st tap empty sand / soft % | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.n} | ${f1(r.done)} | ${f1(r.sess)} (${f1(r.sessP90)}) | ${f1(r.chap)} [${f1(r.chapP10)}–${f1(r.chapP90)}] | ${f1(r.round)} (${f1(r.roundP90)}, ${f1(r.maxRound)}) | ${r.stuck} | ${f1(r.st3)}/${f1(r.st2)}/${f1(r.st1)} | ${r.wrong.toFixed(2)} | ${f1(r.firstTapRight)} · ${f1(r.firstTapMiss)} | ${f1(r.firstRight)} (${f1(r.firstAssist)}) | ${f1(r.firstDig)} (${f1(r.firstDigP90)}) | ${r.digWait.toFixed(2)} / ${r.digWaitAlong.toFixed(2)} (${f1(r.alongPct)}) | ${f1(r.hintR)} | ${f1(r.assistR)} | ${f1(r.talkRight)} |`);
  o.push('', '### B. Speech (modelled main.js policy + voice.js queue)', '', '| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${f1(r.lpm)} | ${f1(r.spm)} | ${f1(r.talkRatio)} | ${f1(r.promptStarted)} | ${f1(r.promptCut)} | ${r.promptDelay.toFixed(2)} (${r.promptDelayP90.toFixed(2)}) | ${f1(r.promptSame)} | ${f1(r.countLost)} | ${f1(r.wordsLost)} (${f1(r.wordsLostPerMin)}) | ${Object.entries(r.dropW).map(([k, v]) => k + ' ' + v).join(', ')} | ${Object.entries(r.cuts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + v).join(', ')} |`);
  o.push('', '| model | age | same answer twice in a row % by topic | repeated set / session by topic | wrong lines whose 1st sentence was heard % |', '|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${Object.entries(r.sameT).map(([t, v]) => t + ' ' + f1(v[0] / Math.max(1, v[1]) * 100)).join(', ')} | ${Object.entries(r.repT).map(([t, v]) => t + ' ' + v.toFixed(2)).join(', ')} | ${f1(r.wrongHeard)} |`);
  o.push('', '### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)', '', '| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    if (!/typical|bot0.8/.test(r.model)) continue;
    const r3 = ['0/3', '1/3', '2/3'].map(k => r.rank[k] || 0), t3 = r3.reduce((a, b) => a + b, 0) || 1;
    const pc = r.perChap.map(c => `${c.topic} · ${f1(c.chap)} · ${f1(c.round)} · ${c.wrong.toFixed(2)} · ${f1(c.mounds)} · ${c.steps.toFixed(2)} · ${f1(c.st3)}`);
    o.push(`| ${r.model} | ${r.age} | ${r.repSet.toFixed(2)} | ${f1(r.sameAns)} | ${r3.map(x => f1(x / t3 * 100)).join(' / ')} | ${pc.join(' | ')} | ${r.badN} |`);
  }
  const bad = rows.flatMap(r => r.badText.map(b => r.model + '/' + r.age + ' ' + b));
  if (bad.length) o.push('', 'Bad lines (first):', ...bad.slice(0, 20).map(b => '- ' + b));
  return o.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('session failed', JSON.stringify(j), e.stack); res.push({ failed: String(e), model: j.model, age: j.age }); } }
    process.send(res, () => process.exit(0));
  });
} else if (require.main === module) {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) for (let i = 0; i < N; i++)
    jobs.push({ model, age, seed: 5000 + i * 41 + age * 11, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
  const parts = Array.from({ length: JOBS }, () => []);
  jobs.forEach((j, i) => parts[i % JOBS].push(j));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, ['--worker', ...args]); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej);
    c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code)); });
    c.send(p);
  }))).then(rs => {
    const list = rs.flat(), failed = list.filter(s => s.failed), rows = summarize(list.filter(s => !s.failed));
    const head = `# hs_kids ${TAG} — ${list.length} sessions (${failed.length} failed), config ${JSON.stringify(config)}, patch '${PATCH}', voice ${JSON.stringify(VOPT)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    const md = head + tables(rows);
    console.log(md);
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'kids_' + TAG + '.md'), md + '\n');
    fs.writeFileSync(path.join(dir, 'kids_' + TAG + '.json'), JSON.stringify({ config, VOPT, rows }, null, 1));
    if (failed.length) { console.log('FAILED sessions: ' + failed.length + ' ' + failed[0].failed); process.exit(1); }
  }).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { runOne, makeModel, SpeechSim, summarize, tables };
