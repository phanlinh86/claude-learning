#!/usr/bin/env node
// Nuka's Snow Dig — RUB-focused high-speed playtest (report-only; never edits game/js). Builds on lib.js + hs_kids.js:
//   * child models of hs_kids (typical, slow3, slowOnce, high, sandOnly, tapper, spammer, perfect, bot…) + lib (taponly,
//     rubber) + NEW: above (taps 50–140 px ABOVE the peeking thing: over the drift, not on it), twoDrift (rubs with swings
//     wide enough to cross onto the neighbouring drift), emptyRub (45 % of its rubs start on the empty snow between the
//     target and a neighbour and slide over), slowTap / slowRub (the slow 3-year-old who never / always rubs), shortRub (tiny
//     toddler wiggles of 12–26 px: does it still dig?);
//   * per dig: dig start → reveal and → judged, split tap alone / tap + taps along / rub (rub vs tap dig speed);
//   * per round: duration histogram, hints, assists, wrong digs, digs that came from an empty-snow press (and how many were wrong);
//   * the speech model of hs_kids + the NEW lines of this game: rubDemo → 'rub', the tap-teach on 'dig', 'fly' on the first
//     'hop' of a chapter, 'slide' on 'slide' (main.js rules, incl. isSpeaking = a line is being spoken now) → how often each is
//     heard, when the 'rub' line starts versus the ghost-hand demo window, whether any of them cut / delay a prompt or praise.
//   node tests/sim/hs_snow.js [--n 60] [--ages 3,4,5,6,7] [--models …] [--config '{…}'] [--jobs 2] [--tag x] [--patch …]
//   --patch rubDemo2   SIM-ONLY: a 2nd rub demo on the first find ask of round 2 when the child has not rubbed yet (proposal)
//   --sv '{"rubPri":1}' the rubDemo line is queued with priority (never dropped / stale); '{"noWeather0":1}' no weather line in chapter 1
// Output: markdown on stdout + tests/sim/out/snow_<tag>.md (+ .json, git-ignored).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
// hs_kids.js has its own '--worker' handler: hide the flag while loading it (else both would answer the job message)
const K = (() => { const a = process.argv, i = a.indexOf('--worker'); if (i >= 0) a.splice(i, 1); try { return require('./hs_kids'); } finally { if (i >= 0) a.splice(i, 0, '--worker'); } })();
const NK = L.NK;
const I = NK.I18N;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 60), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,taponly,rubber,slow3,slowTap,slowRub,slowOnce,tapper,high,above,spammer,twoDrift,emptyRub,shortRub,sandOnly,perfect,bot0.8';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2), PATCH = get('patch', '');
const VPS = Object.keys(L.VIEWPORTS);
// --sv '{"slideQ":1,"flyQ":1}': SIM-ONLY speech-policy proposals — slideQ: queue the slide line when nothing is WAITING
// (praise may be speaking) on 1 round in 2; flyQ: queue the fly line on the chapter's first hop of a round's LAST step when
// nothing is waiting (no prompt follows).
const SV = JSON.parse(get('sv', '{}'));

/* ---------------------------------------------------------------- SIM-ONLY patches (proposals) */
if (/rubDemo2/.test(PATCH)) {
  const P = NK.World.prototype, ask0 = P._ask;
  P._ask = function (first) {
    ask0.call(this, first);
    const s = this.stepInfo;
    if (first && this.level === 0 && this.round === 1 && s && s.mode === 'find' && !this._rubbedEver && this._rubDemoAt < 0) this._rubDemoAt = this.cfg.rubDemoDelay;
  };
  const rs = P._rubStroke;
  P._rubStroke = function (m, x, y, dir, p) { this._rubbedEver = true; return rs.call(this, m, x, y, dir, p); };
}

// --patch nearBind: SIM-ONLY copy of the pointerDown/Move binding: a press on EMPTY snow binds to the nearest drift whose hit
// circle + rubPad holds the press point (else, as now, to the first drift the finger slides onto) (proposal for world.js).
if (/nearBind/.test(PATCH)) {
  const P = NK.World.prototype, down0 = P.pointerDown, move0 = P.pointerMove;
  P.pointerDown = function (x, y) {
    const r = down0.call(this, x, y), p = this._press;
    if (r === 'press' && p && !p.id) {
      let best = null, bd = 1e9; const cfg = this.cfg, Ly = this.layout;
      for (const m of this.mounds) { if (m.pop < 0.3) continue; const d = Math.hypot(x - m.x, y - (m.y - cfg.hitCY * Ly.item)); if (d <= Ly.hitR + cfg.rubPad && d < bd) { bd = d; best = m; } }
      if (best) p.nearId = best.id;
    }
    return r;
  };
  P.pointerMove = function (x, y) {
    const p = this._press;
    if (p && !p.id && p.nearId) { const d = Math.hypot(x - p.lx, y - p.ly); if (d > 0 && this._moundAt(x, y)) { p.id = p.nearId; p.path = 0; p.segX = 0; p.dirX = 0; } }
    return move0.call(this, x, y);
  };
}

// --patch padClamp: SIM-ONLY copy of World._moundAt where the thing box top (thingTopPad above the tip) never reaches above the
// aurora ribbon's bottom + 4 px (proposal for world.js, needed with a bigger thingTopPad on iPhone landscape / iPad portrait).
if (/padClamp/.test(PATCH)) {
  const hyp = Math.hypot;
  NK.World.prototype._moundAt = function (x, y) {
    let best = null, bd = 1e9; const cfg = this.cfg, S = this.layout.shelf, floor = S.y + S.h + 4;
    for (const m of this.mounds) {
      if (m.pop < 0.3) continue;
      const c = this._hitC(m), d = hyp(x - c.x, y - c.y); let hit = d <= c.r;
      if (!hit && m.state !== 'empty') { const bw = (cfg.thingW[m.thing.kind] || 0.8) * m.size / 2 + 8, top = Math.max(m.thingY - m.size - cfg.thingTopPad, floor); hit = x >= m.x - bw && x <= m.x + bw && y >= top && y <= m.y; }
      if (hit && d < bd) { bd = d; best = m; }
    }
    return best;
  };
}

// --patch holdDigs: SIM-ONLY — a press that started on a drift, moved < tapMovePx and did not rub, released after tapTime
// (a slow / gentle "rub" with tiny wiggles, or a long press) counts as a TAP on that drift instead of 'soft' (proposal).
if (/holdDigs/.test(PATCH)) {
  const P = NK.World.prototype, up0 = P.pointerUp;
  P.pointerUp = function (x, y) {
    const p = this._press;
    if (p && p.id && !p.rubbed && this.state === 'round' && this.time - p.t > this.cfg.tapTime) {
      const mx = x === undefined ? 0 : Math.hypot(x - p.x, y - p.y), mv = Math.max(p.maxD, mx);
      const m = this.moundById(p.id);
      if (mv < this._tapMove() && m && m.pop >= 0.3) { this._press = null; const c = this._hitC(m); return this.tap(c.x, c.y); }
    }
    return up0.call(this, x, y);
  };
}

/* ---------------------------------------------------------------- extra child models */
const near = (w, m) => { let b = null, bd = 1e9; for (const q of w.mounds) { if (q === m) continue; const d = Math.hypot(q.x - m.x, q.y - m.y); if (d < bd) { bd = d; b = q; } } return b; };
/** Taps 50–140 px above the top of the peeking thing (the sky over the drift). */
class AboveKid extends L.Kid {
  jit(pt) {
    const w = this.w, r = this.r;
    let best = null, bd = 1e9;
    for (const m of w.mounds) { const c = w.moundTap(m.id), d = Math.hypot(c.x - pt.x, c.y - pt.y); if (d < bd) { bd = d; best = m; } }
    if (!best || bd > 2 || r.chance(0.35)) return super.jit(pt);   // 35 %: a normal aim (they also learn)
    const m = best, top = m.thingY - m.size;
    return { x: m.x + r.float(-0.3, 0.3) * m.size, y: top - r.float(50, 140) };
  }
}
/** A rub whose swings are wide enough to cross onto the neighbouring drift. */
class TwoDriftKid extends L.Kid {
  doTap(pt, noRub) {
    const w = this.w, r = this.r, p = this.p, m = pt && w._moundAt(pt.x, pt.y);
    if (!noRub && m && m.state === 'buried') {
      const n = near(w, m), amp = n ? Math.max(60, Math.abs(n.x - m.x) * r.float(0.8, 1.1)) : 90;
      this.stats.rubs++;
      this.f.rub(pt.x, pt.y, amp, r.int(3, 6), r.float(0.6, 1.2), r, 14);
      return;
    }
    super.doTap(pt, true);
  }
}
/** Half of its rubs start on the empty snow right BESIDE the drift it means (just outside its hit area: left / right /
 *  below / above) and swing ±40–75 px; 1 in 4 of those start half-way to the neighbouring drift instead. */
class EmptyRubKid extends L.Kid {
  doTap(pt, noRub) {
    const w = this.w, r = this.r, p = this.p, m = pt && w._moundAt(pt.x, pt.y);
    if (!noRub && m && m.state === 'buried' && r.chance(p.pRub) && r.chance(0.5)) {
      const c = w.moundTap(m.id), n = near(w, m), R0 = w.layout.hitR;
      let sx = 0, sy = 0, ok = false;
      for (let k = 0; k < 12 && !ok; k++) {
        if (n && r.chance(0.25)) { const cn = w.moundTap(n.id), u = r.float(0.4, 0.6); sx = c.x + (cn.x - c.x) * u; sy = c.y + (cn.y - c.y) * u + r.float(-20, 20); }
        else { const a = r.pick([0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4]), d = R0 + r.float(6, 34); sx = c.x + Math.cos(a) * d; sy = c.y + Math.sin(a) * d; }
        ok = !w._moundAt(sx, sy) && sy < w.layout.groundY + 10 && sx > 0 && sx < w.layout.W;
      }
      if (ok) {
        this.stats.emptyStart = (this.stats.emptyStart || 0) + 1; this.emptyPending = { target: m.id, t: w.time };
        this.stats.rubs++;
        this.f.rub(sx, sy, r.float(40, 75), r.int(3, 6), r.float(0.6, 1.2), r, 12);
        return;
      }
    }
    super.doTap(pt, noRub);
  }
}
function makeModel(name, w, age, seed) {
  const T = L.typicalProfile(age);
  if (name === 'above') return new AboveKid(w, T, seed);
  if (name === 'twoDrift') return new TwoDriftKid(w, Object.assign(T, { pRub: 1 }), seed);
  if (name === 'emptyRub') return new EmptyRubKid(w, Object.assign(T, { pRub: 0.8 }), seed);
  if (name === 'slowTap') return new L.Kid(w, Object.assign(L.slowProfile(), { pRub: 0 }), seed);
  if (name === 'slowRub') return new L.Kid(w, Object.assign(L.slowProfile(), { pRub: 1 }), seed);
  if (name === 'shortRub') return new L.Kid(w, Object.assign(L.slowProfile(), { pRub: 1, rubAmp: [6, 13], rubSwings: [2, 5], rubTime: [0.5, 1.2] }), seed);
  return K.makeModel(name, w, age, seed);
}

/* ---------------------------------------------------------------- speech: hs_kids model + this game's new lines */
class SnowSpeech extends K.SpeechSim {
  constructor(w, lang, seed) {
    super(w, lang, seed);
    this.rubTaught = false; this.flySaid = false; this.digs = 0; this.items = [];
    Object.assign(this.st, { rubDemo: 0, rubLine: 0, rubHeard: 0, rubStartRel: [], rubInDemo: 0, rubDropped: 0, rubCutPrompt: 0, promptAfterRub: 0,
      flyReq: 0, flySaid: 0, flyHeard: 0, slideEv: 0, slideReq: 0, slideHeard: 0, slideBlockedPraise: 0, praiseReq: 0, praiseHeard: 0,
      firstPromptHeard: 0, firstPrompt: 0, firstPromptDelay: [], askHeard: 0, askN: 0, askCutBy: {} });
  }
  isSpeaking() { return !!this.cur; }
  say(text, o, kind) {
    const it = super.say(text, o, kind);
    if (it) { this.items.push(it); if (this.items.length > 60) this.items.shift(); }
    return it;
  }
  cancelCurrent(by) {
    const c = this.cur;
    if (c && c.kind === 'prompt') { this.st.askCutBy[by] = (this.st.askCutBy[by] || 0) + 1; if (by === 'rub') this.st.rubCutPrompt++; }
    if (c) c.cutBy = by;
    super.cancelCurrent(by);
  }
  tick() {
    const c0 = this.cur;
    super.tick();
    if (c0 && c0 !== this.cur && !c0.cutBy) {   // finished normally
      if (c0.kind === 'rub') this.st.rubHeard++;
      if (c0.kind === 'fly') this.st.flyHeard++;
      if (c0.kind === 'slide') this.st.slideHeard++;
      if (c0.kind === 'praise') this.st.praiseHeard++;
      if (c0.kind === 'prompt') { this.st.askHeard++; if (c0.firstOfSession) this.st.firstPromptHeard++; }
    }
    if (this.cur && this.cur.kind === 'rub' && this.cur.start === this.t && this.demoT != null) {
      const rel = this.t - this.demoAskT; this.st.rubStartRel.push(rel);
      if (rel <= this.w.cfg.rubDemoDelay + this.w.cfg.rubDemoTime) this.st.rubInDemo++;
    }
    if (this.cur && this.cur.firstOfSession && this.cur.start === this.t) this.st.firstPromptDelay.push(this.t - this.cur.t);
  }
  drop(it, why) { if (!it.done && it.kind === 'rub') this.st.rubDropped++; super.drop(it, why); }
  onEvent(e) {
    const w = this.w, now = this.t;
    switch (e.type) {
      case 'ask': {
        super.onEvent(e); this.st.askN++;
        const it = this.items[this.items.length - 1];
        if (it && it.kind === 'prompt' && !this.st.firstPrompt) { it.firstOfSession = true; this.st.firstPrompt = 1; this.demoAskT = now; }
        return;
      }
      case 'rubDemo': {
        this.st.rubDemo++; this.demoT = now; this.rubTaught = true; this.st.rubLine++;
        this.say(this.T('rub'), { priority: !!SV.rubPri }, 'rub'); return;
      }
      case 'dig':
        if (!e.again) this.digs++;
        if (e.rub) this.rubbedEver = true;
        if (SV.tapTeach) {   // proposal: own flag (not set by the demo); the 2nd+ TAP dig while the child never rubbed, once per session
          if (!e.rub && !e.again && !e.assist && !this.tapTaught && !this.rubbedEver && this.digs >= 2 && this.canInterrupt()) { this.tapTaught = true; this.st.rubLine++; this.st.tapTeach = (this.st.tapTeach || 0) + 1; this.say(this.T('rub'), {}, 'rub'); }
          return;
        }
        if (!e.rub && !e.again && !this.rubTaught && this.digs >= 2 && this.canInterrupt()) { this.rubTaught = true; this.st.rubLine++; this.say(this.T('rub'), {}, 'rub'); }
        return;
      case 'level':
        this.flySaid = false;
        if (SV.noWeather0 && e.level === 0) { this.say(this.T('ui.chapter', { n: 1 }) + '. ' + this.T('topic.' + e.topic), { interrupt: true }, 'level'); this.scoopSaid = 0; return; }
        break;
      case 'hop':
        this.st.flyReq++;
        if (SV.flyQ) { const s = w.stepInfo, last = w.cur && w.step >= w.cur.steps.length - 1 && s && s.mode === 'find';
          if (!this.flySaid && last && !this.q.length && !this.pendingPrompt) { this.flySaid = true; this.st.flySaid++; this.say(this.T('fly'), {}, 'fly'); } return; }
        if (!this.flySaid && !this.isSpeaking() && !this.pendingPrompt) { this.flySaid = true; this.st.flySaid++; this.say(this.T('fly'), {}, 'fly'); }
        return;
      case 'slide':
        this.st.slideEv++;
        if (SV.slideQ ? (!this.q.length && this.rng.next() < 0.5) : (!this.isSpeaking() && this.rng.next() < 0.5)) { this.st.slideReq++; this.say(this.T('slide'), {}, 'slide'); }
        return;
      case 'roundDone': {
        const n0 = this.st.byKind.praise || 0; super.onEvent(e); if ((this.st.byKind.praise || 0) > n0) this.st.praiseReq++; return;
      }
    }
    super.onEvent(e);
  }
}

/* ---------------------------------------------------------------- one session */
function runOne(o) {
  const w = L.mkWorld(o), d = makeModel(o.model, w, o.age, o.seed + 1), sp = new SnowSpeech(w, o.lang, o.seed + 7);
  const S = { model: o.model, age: o.age, lang: o.lang, done: false, nan: false, time: 0, rounds: [], chapters: [], digs: [], stuck: 0, talks: 0, talkRight: 0, firstRubAt: null, rubDigs: 0, tapDigs: 0, sur: { seal: 0, sealTap: 0, tern: 0, ternTap: 0, sealMiss: 0, ternMiss: 0 } };
  w.newSession();
  const dt = 1 / 30, cap = 1800;
  let R = null, chap = null, dig = null, lastChange = 0, sig = '';
  while (w.state !== 'sessionDone' && w.time < cap) {
    d.step(dt); w.update(dt);
    if (!Number.isFinite(w.shovel.x) || !Number.isFinite(w.stars)) { S.nan = true; break; }
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.step + ':' + w.mounds.filter(m => m.state !== 'buried').length + ':' + !!w.dig;
    if (s2 !== sig) { sig = s2; lastChange = w.time; } else if (w.time - lastChange > 200) { S.stuck = 1; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      sp.onEvent(e);
      const t = w.time;
      switch (e.type) {
        case 'level': chap = { i: e.level, topic: e.topic, t0: t, rounds: 0 }; break;
        case 'round': R = { ch: w.level, ri: e.round, t0: t, mounds: e.mounds, wrong: 0, hint: 0, hintIdle: 0, assist: 0, idle: 0, sand: 0, sandRub: 0, busy: 0, already: 0, soft: 0, rubStrokes: 0, emptyDigs: 0, emptyWrong: 0 }; break;
        case 'dig':
          if (!e.again) {
            const em = d.emptyPending && t - d.emptyPending.t < 2 ? d.emptyPending : null; d.emptyPending = null;
            dig = { t0: t, rub: !!e.rub, along: 0, assist: !!e.assist, reveal: null, empty: em ? { target: em.target, id: e.id } : null };
            if (e.rub) { S.rubDigs++; if (S.firstRubAt === null) S.firstRubAt = { t, ch: w.level, ri: w.round }; } else S.tapDigs++;
            if (em && R) { R.emptyDigs++; if (e.id !== em.target) R.emptyWrong++; }
          } else if (dig && e.added) { dig.along++; if (e.rub) dig.rub = dig.rub || 'mixed'; }
          break;
        case 'rub': if (R) R.rubStrokes++; break;
        case 'reveal': if (dig) dig.reveal = t - dig.t0; break;
        case 'found': case 'wrong':
          if (dig) { dig.judge = t - dig.t0; dig.ok = e.type === 'found'; S.digs.push(dig); dig = null; }
          if (e.type === 'wrong' && R) R.wrong++;
          break;
        case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hint++; } break;
        case 'assist': if (R) R.assist++; break;
        case 'idle': if (R) R.idle++; break;
        case 'sandTap': if (R) { if (e.rub) R.sandRub++; else R.sand++; } break;
        case 'busy': if (R) R.busy++; break;
        case 'already': if (R) R.already++; break;
        case 'soft': if (R) R.soft++; break;
        case 'roundDone': if (R) { R.dur = t - R.t0; R.stars = e.stars; S.rounds.push(R); if (chap) chap.rounds++; } R = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; break;
        case 'levelDone': if (chap) { chap.dur = t - chap.t0; S.chapters.push(chap); } chap = null; break;
        case 'sessionDone': S.done = true; break;
        case 'seal': case 'sealTap': case 'tern': case 'ternTap': S.sur[e.type]++; break;
      }
    }
    sp.tick();
  }
  S.time = w.time;
  const st = sp.st; delete st.log; S.speech = st;
  return S;
}

/* ---------------------------------------------------------------- summary */
const f1 = L.f1, mean = L.mean, pct = L.pct, sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
const HB = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 1e9];
function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|'), done = ss.filter(s => s.done);
    const rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), digs = ss.flatMap(s => s.digs).filter(x => !x.assist && x.reveal != null);
    const rd = rounds.map(r => r.dur), hist = HB.slice(0, -1).map((a, i) => rd.filter(x => x >= a && x < HB[i + 1]).length / Math.max(1, rd.length) * 100);
    const dk = (f) => digs.filter(f);
    const tapAlone = dk(x => !x.rub && !x.along), tapAlong = dk(x => !x.rub && x.along), rubD = dk(x => x.rub);
    const sp = ss.map(s => s.speech), st = [3, 2, 1].map(n => rounds.filter(r => r.stars === n).length / Math.max(1, rounds.length) * 100);
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100,
      sess: mean(done.map(s => s.time)) / 60, sessP90: pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: mean(chaps.map(c => c.dur)), chapP10: pct(chaps.map(c => c.dur), 0.1), chapP90: pct(chaps.map(c => c.dur), 0.9),
      round: mean(rd), p10: pct(rd, 0.1), p50: pct(rd, 0.5), p90: pct(rd, 0.9), p99: pct(rd, 0.99), max: Math.max(0, ...rd), hist,
      stuck: rd.filter(x => x > 120).length + sum(ss, s => s.stuck), nan: ss.filter(s => s.nan).length,
      st3: st[0], st2: st[1], st1: st[2], wrong: mean(rounds.map(r => r.wrong)),
      hint: mean(rounds.map(r => r.hint)), hintIdle: mean(rounds.map(r => r.hintIdle)), hintR: rounds.filter(r => r.hint + r.hintIdle).length / Math.max(1, rounds.length) * 100,
      assist: mean(rounds.map(r => r.assist)), assistR: rounds.filter(r => r.assist).length / Math.max(1, rounds.length) * 100, idle: mean(rounds.map(r => r.idle)),
      sand: mean(rounds.map(r => r.sand)), sandRub: mean(rounds.map(r => r.sandRub)), busy: mean(rounds.map(r => r.busy)), soft: mean(rounds.map(r => r.soft)),
      strokes: mean(rounds.map(r => r.rubStrokes)), emptyDigs: sum(rounds, r => r.emptyDigs), emptyWrong: sum(rounds, r => r.emptyWrong),
      rubShare: sum(ss, s => s.rubDigs) / Math.max(1, sum(ss, s => s.rubDigs + s.tapDigs)) * 100,
      dTapA: mean(tapAlone.map(x => x.reveal)), dTapAj: mean(tapAlone.map(x => x.judge)), nTapA: tapAlone.length,
      dTapL: mean(tapAlong.map(x => x.reveal)), nTapL: tapAlong.length,
      dRub: mean(rubD.map(x => x.reveal)), dRubP90: pct(rubD.map(x => x.reveal), 0.9), nRub: rubD.length,
      talkRight: sum(ss, s => s.talkRight) / Math.max(1, sum(ss, s => s.talks)) * 100,
      sealTapPct: sum(ss, s => s.sur.sealTap) / Math.max(1, sum(ss, s => s.sur.seal)) * 100, ternTapPct: sum(ss, s => s.sur.ternTap) / Math.max(1, sum(ss, s => s.sur.tern)) * 100,
      // speech
      sp: {
        prompts: sum(sp, x => x.prompts), promptFull: sum(sp, x => x.askHeard) / Math.max(1, sum(sp, x => x.prompts)) * 100,
        promptCut: sum(sp, x => x.promptCut) / Math.max(1, sum(sp, x => x.prompts)) * 100,
        promptDelay: mean(sp.flatMap(x => x.promptDelay)), promptDelayP90: pct(sp.flatMap(x => x.promptDelay), 0.9),
        firstHeard: sum(sp, x => x.firstPromptHeard) / Math.max(1, sp.length) * 100, firstDelay: mean(sp.flatMap(x => x.firstPromptDelay)),
        rubDemo: sum(sp, x => x.rubDemo) / sp.length * 100, tapTeach: sum(sp, x => x.tapTeach || 0) / sp.length * 100, rubLines: sum(sp, x => x.rubLine) / sp.length, rubHeardN: sum(sp, x => x.rubHeard) / sp.length, rubHeard: sum(sp, x => x.rubHeard) / Math.max(1, sum(sp, x => x.rubLine)) * 100,
        rubStart: mean(sp.flatMap(x => x.rubStartRel)), rubStartP90: pct(sp.flatMap(x => x.rubStartRel), 0.9),
        rubInDemo: sum(sp, x => x.rubInDemo) / Math.max(1, sum(sp, x => x.rubStartRel.length)) * 100, rubDropped: sum(sp, x => x.rubDropped), rubCutPrompt: sum(sp, x => x.rubCutPrompt),
        flyPerSess: sum(sp, x => x.flySaid) / sp.length, flyHeard: sum(sp, x => x.flyHeard) / sp.length,
        slidePct: sum(sp, x => x.slideReq) / Math.max(1, sum(sp, x => x.slideEv)) * 100, slideHeard: sum(sp, x => x.slideHeard) / Math.max(1, sum(sp, x => x.slideEv)) * 100,
        praiseHeard: sum(sp, x => x.praiseHeard) / Math.max(1, sum(sp, x => x.praiseReq)) * 100,
        cutBy: sp.reduce((a, x) => { for (const r in x.askCutBy) a[r] = (a[r] || 0) + x.askCutBy[r]; return a; }, {}),
        lpm: sum(sp, x => x.req) / (sum(ss, s => s.time) / 60), talk: sum(sp, x => x.speakSec) / sum(ss, s => s.time) * 100 } });
  }
  rows.sort((a, b) => MODELS.indexOf(a.model) - MODELS.indexOf(b.model) || a.age - b.age);
  return rows;
}
function tables(rows) {
  const o = [];
  o.push('### A. Pace, help, stars', '', '| model | age | n | done % | session min (p90, max) | chapter s mean [p10–p90] | round s mean · p10/p50/p90/p99 · max | > 120 s / stuck / NaN | stars 3/2/1 % | wrong / round | hints miss·idle / round (rounds %) | assists / round (rounds %) | idle / round | talk right % |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.n} | ${f1(r.done)} | ${f1(r.sess)} (${f1(r.sessP90)}, ${f1(r.sessMax)}) | ${f1(r.chap)} [${f1(r.chapP10)}–${f1(r.chapP90)}] | ${f1(r.round)} · ${f1(r.p10)}/${f1(r.p50)}/${f1(r.p90)}/${f1(r.p99)} · ${f1(r.max)} | ${r.stuck - 0} / ${r.nan} | ${f1(r.st3)}/${f1(r.st2)}/${f1(r.st1)} | ${r.wrong.toFixed(2)} | ${r.hint.toFixed(2)}·${r.hintIdle.toFixed(2)} (${f1(r.hintR)}) | ${r.assist.toFixed(2)} (${f1(r.assistR)}) | ${r.idle.toFixed(2)} | ${f1(r.talkRight)} |`);
  o.push('', '### B. Round duration histogram (% of rounds)', '', '| model | age | ' + HB.slice(0, -1).map((a, i) => a + '–' + (HB[i + 1] > 1e8 ? '∞' : HB[i + 1])).join(' | ') + ' |', '|---|---|' + HB.slice(0, -1).map(() => '---|').join(''));
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.hist.map(f1).join(' | ')} |`);
  o.push('', '### C. Rub vs tap (dig start → reveal, s; assisted digs excluded) and touch noise per round', '', '| model | age | rub share of digs % | tap alone → reveal (→ judged) s (n) | tap + taps along s (n) | rub s (p90) (n) | rub strokes / round | empty-snow taps / rub puffs / busy / soft per round | digs from an empty-snow press (another drift than meant) |',
    '|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${f1(r.rubShare)} | ${r.dTapA.toFixed(2)} (${r.dTapAj.toFixed(2)}) (${r.nTapA}) | ${r.dTapL.toFixed(2)} (${r.nTapL}) | ${r.dRub.toFixed(2)} (${r.dRubP90.toFixed(2)}) (${r.nRub}) | ${r.strokes.toFixed(1)} | ${r.sand.toFixed(2)} / ${r.sandRub.toFixed(2)} / ${r.busy.toFixed(2)} / ${r.soft.toFixed(2)} | ${r.emptyDigs} (${r.emptyWrong}) |`);
  o.push('', '### D. Speech (modelled main.js + voice.js queue)', '', '| model | age | lines / min · talk % | prompts heard fully % · cut % | ask → prompt starts s (p90) | 1st prompt heard % (delay s) | rub demo shown % · rub line heard % · starts s after ask (p90) · starts while the hand still rubs % · dropped · cut a prompt | fly lines / session (heard) | slide spoken % of slides (heard) | praise heard % | prompts cut by |',
    '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) { const s = r.sp; o.push(`| ${r.model} | ${r.age} | ${f1(s.lpm)} · ${f1(s.talk)} | ${f1(s.promptFull)} · ${f1(s.promptCut)} | ${s.promptDelay.toFixed(2)} (${s.promptDelayP90.toFixed(2)}) | ${f1(s.firstHeard)} (${s.firstDelay.toFixed(2)}) | ${f1(s.rubDemo)} · ${f1(s.rubHeard)} · ${s.rubStart.toFixed(2)} (${s.rubStartP90.toFixed(2)}) · ${f1(s.rubInDemo)} · ${s.rubDropped} · ${s.rubCutPrompt} | ${s.flyPerSess.toFixed(2)} (${s.flyHeard.toFixed(2)}) | ${f1(s.slidePct)} (${f1(s.slideHeard)}) | ${f1(s.praiseHeard)} | ${Object.entries(s.cutBy).map(([k, v]) => k + ' ' + v).join(', ')} |`); }
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
    jobs.push({ model, age, seed: 9000 + i * 43 + age * 13, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
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
    const head = `# hs_snow ${TAG} — ${list.length} sessions (${failed.length} failed), config ${JSON.stringify(config)}, patch '${PATCH}', sv ${JSON.stringify(SV)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    const md = head + tables(rows);
    console.log(md);
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'snow_' + TAG + '.md'), md + '\n');
    fs.writeFileSync(path.join(dir, 'snow_' + TAG + '.json'), JSON.stringify({ config, PATCH, rows }, null, 1));
    if (failed.length) { console.log('FAILED sessions: ' + failed.length + ' ' + failed[0].failed); process.exit(1); }
  }).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { runOne, makeModel, summarize, tables };
