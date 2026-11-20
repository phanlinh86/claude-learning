#!/usr/bin/env node
// Pip's Reef Tower — high-speed playtester sim #3 (report-only; never edits game/js). Focus: TAP TO SEND.
//   node tests/sim/hs_pt3.js [--n 40] [--ages 3,4,5,6,7] [--models …] [--config '{…}'] [--jobs 2] [--tag x] [--rotate 0.3]
//                            [--cps 12,14] [--child Mia]
// Adds to hs_playtest.js:
//   · models: blockTapper (taps a RANDOM resting block every 0.4–1.5 s — "a tap is an answer"), liftSpammer (typical, but
//     hammers the screen 5×/s while a block is lifting / sinking / bonking), doubleTapper (typical, every tap is a double tap
//     80–200 ms apart), plus every hs_models.js model (typical, slow3, dragger, dropHigh, spammer, tapper, bot<skill> …)
//   · bonk runs: wrong answers per ask, P(≥ 2 / ≥ 3 bonks), longest bonk run, first-answer-right %, time spent bonking
//   · tap → land time, locked taps, soft (grass) taps per ask, hints per ask by cause, stars, puffer seen / tapped
//   · a VOICE model of the CURRENT main.js (2026-11-20: 6 s pending-prompt guard, guard = start + 0.3 + 0.072·len, praise
//     interrupts, sayTowerDone on the last stack, 'great' on sprinkles, pokePip guard 3 s) on RT.Voice's queue rules
//     (MAXQ 2, stale 5 s, priority, interrupt) with a TTS duration model (0.25 s + len / cps; cps en 12, vi 14)
//     → per ask prompt: fully heard / cut by the child's own answer / cut by something else / dropped / stale;
//       prompt start delay after `ask`; answered before the prompt ended
//   · --rotate p: with probability p after a tap-send, rotate the device (setViewport W↔H) 0.05–1.2 s later (mid-lift or
//     mid-sink); checks every session still finishes, no NaN, no piece left in 'lift' / 'fall', tower count = stacks
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fork } = require('child_process');
const L = require('./lib');
const M = require('./hs_models');
const RT = L.RT;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'i18n.js'), 'utf8'), { filename: 'i18n.js' });
const I18N = RT.I18N;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 40), config = JSON.parse(get('config', '{}')), ROT = +get('rotate', 0);
const ALL = 'bot0.5,bot0.8,bot1,typical,slow3,dragger,dropHigh,doubleTapper,liftSpammer,spammer,blockTapper,tapper';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'pt3'), JOBS = +get('jobs', 2), CHILD = get('child', 'Mia');
const [CPS_EN, CPS_VI] = get('cps', '12,14').split(',').map(Number);
const VOPT = (get('voice', '') || '').split(',').filter(Boolean), PATCH = (get('patch', '') || '').split(',').filter(Boolean);
// Harness-only PROTOTYPES of proposals (game files untouched; these wrap RT.World.prototype in this process):
//   pufferStay: a send / drop no longer chases the puffer away — it hovers its full pufferSit time (still tappable)
//   voice guardEnd: main's prompt guard lasts until the prompt has FINISHED (Voice.onEnd) instead of start + 0.3 + 0.072·len
//   voice wrongWait: the next answer is accepted only after the wrong line ended (models a longer wrongLock in main terms)
//   askGate: the ask (prompt + tappable blocks) opens only when Pip is quiet (main: world.askGate = () => RT.Voice.isSpeaking()),
//            waiting at most askGateMax s (default 2.5)
if (PATCH.includes('pufferStay')) RT.World.prototype._beeAway = function () {};
const GATEMAX = +get('askGateMax', 2.5);
if (PATCH.includes('askGate')) {
  const sa = RT.World.prototype._startAsk;
  RT.World.prototype._startAsk = function () {
    if (this.askGate && this.askGate()) { if (this._gateT0 == null) this._gateT0 = this.time; if (this.time - this._gateT0 < GATEMAX) return; }
    this._gateT0 = null; return sa.call(this);
  };
}
const VPS = Object.keys(L.VIEWPORTS);

/* ---------------------------------------------------------------- extra child models */
class BlockTapper {   // taps a random resting block (80 %) or a random spot (20 %) every 0.4–1.5 s
  constructor(w, seed) { this.w = w; this.r = new RT.RNG(seed); this.t = 0.8; this.talkT = -1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') { if (w.talkAnswered) return; if (this.talkT < 0) this.talkT = r.float(2, 5); if ((this.talkT -= dt) <= 0) { this.talkT = -1; w.talkAnswer(r.pick(w.talk.choices).id); } return; }
    this.talkT = -1;
    if ((this.t -= dt) > 0) return;
    this.t = r.float(0.4, 1.5);
    const ps = L.restingPieces(w), Lw = w.layout;
    this.stats.taps++;
    if (ps.length && r.chance(0.8)) { const p = r.pick(ps); L.tapAt(w, p.x + r.float(-0.3, 0.3) * Lw.LW, p.y + r.float(-0.3, 0.3) * Lw.LH); }
    else L.tapAt(w, r.float(0, Lw.W), r.float(0, Lw.H));
  }
}
/** typical child who keeps hammering (5×/s, on blocks / the tower / anywhere) while a block is lifting, sinking or bonking */
class LiftSpammer {
  constructor(w, age, seed) { this.w = w; this.k = new L.Kid(w, L.typicalProfile(age), seed); this.r = new RT.RNG(seed + 9); this.t = 0; this.stats = this.k.stats; this.stats.spam = 0; }
  step(dt) {
    const w = this.w, r = this.r;
    const busy = w.state === 'round' && w.pieces.some(p => p.state === 'lift' || p.state === 'fall' || p.state === 'bounce');
    if (busy && !this.k.f.busy && !this.k.tap) {
      if ((this.t -= dt) > 0) return;
      this.t = 0.2;
      this.stats.spam++;
      const ps = w.pieces.filter(p => p.state !== 'gone' && p.state !== 'out'), Lw = w.layout, top = w.towerTop();
      const u = r.next();
      if (u < 0.5 && ps.length) { const p = r.pick(ps); L.tapAt(w, p.x, p.y); }
      else if (u < 0.8) L.tapAt(w, top.x + r.float(-0.5, 0.5) * Lw.LW, top.y + r.float(-1, 1) * Lw.LH);
      else L.tapAt(w, r.float(0, Lw.W), r.float(0, Lw.H));
      return;
    }
    this.k.step(dt);
  }
}
/** typical child whose every tap is a double tap (a second tap at the same spot 80–200 ms later) */
class DoubleTapper {
  constructor(w, age, seed) { this.w = w; this.k = new L.Kid(w, L.typicalProfile(age), seed); this.r = new RT.RNG(seed + 7); this.q = null; this.stats = this.k.stats; this.stats.second = {}; }
  step(dt) {
    const w = this.w;
    if (this.q) { if ((this.q.t -= dt) <= 0) { const res = L.tapAt(w, this.q.x, this.q.y); const k = String(res); this.stats.second[k] = (this.stats.second[k] || 0) + 1; this.q = null; } return; }
    const T = this.k.tap;
    this.k.step(dt);
    if (T && !this.k.tap) this.q = { x: T.x, y: T.y, t: this.r.float(0.08, 0.2) };
  }
}
function makeModel(name, w, age, seed) {
  if (name === 'blockTapper') return new BlockTapper(w, seed);
  if (name === 'liftSpammer') return new LiftSpammer(w, age, seed);
  if (name === 'doubleTapper') return new DoubleTapper(w, age, seed);
  return M.makeModel(name, w, age, seed);
}

/* ---------------------------------------------------------------- voice: RT.Voice queue + current main.js */
class VoiceSim {
  constructor(lang) { this.lang = lang; this.q = []; this.cur = null; this.kickAt = 0; this.items = []; this.MAXQ = 2; this.STALE = 5; this.onStart = null; }
  dur(text) { const s = I18N.speech ? I18N.speech(this.lang, text) : text; return 0.25 + s.length / (this.lang === 'vi' ? CPS_VI : CPS_EN); }
  say(now, text, opt, tag, meta) {
    if (!text) return null;
    const it = { text, tag, t: now, priority: !!(opt && opt.priority), dur: this.dur(text), status: 'queued', meta: meta || {} };
    this.items.push(it);
    if (opt && opt.interrupt) {
      for (const x of this.q) { x.status = 'flushed'; x.by = tag; }
      this.q = [];
      if (this.cur) { this.cur.status = 'cut'; this.cur.by = tag; this.cur.heard = (now - this.cur.start) / this.cur.dur; this.cur = null; }
      this.q.push(it); this.kickAt = now + 0.09; return it;
    }
    this.q.push(it);
    while (this.q.length > this.MAXQ) {
      let idx = -1; for (let i = 0; i < this.q.length - 1; i++) if (!this.q[i].priority) { idx = i; break; }
      if (idx < 0) idx = 0;
      const d = this.q.splice(idx, 1)[0]; d.status = 'dropped'; d.by = tag;
    }
    return it;
  }
  speaking() { return !!this.cur; }
  update(now) {
    if (this.cur && now >= this.cur.start + this.cur.dur) { this.cur.status = 'done'; this.cur = null; this.kickAt = now; }
    if (!this.cur && now >= this.kickAt) {
      while (this.q.length) {
        const it = this.q.shift();
        if (!it.priority && now - it.t > this.STALE) { it.status = 'stale'; continue; }
        it.start = now; it.status = 'speaking'; this.cur = it; if (this.onStart) this.onStart(it, now); break;
      }
    }
  }
}
class MainVoice {
  constructor(w, lang, seed) {
    this.w = w; this.lang = lang; this.r = new RT.RNG(seed); this.rf = () => this.r.next(); this.v = new VoiceSim(lang);
    this.promptUntil = 0; this.pending = null; this.promptStart = -1e9; this.lastWrongSay = -1e9; this.lastMissSay = -1e9; this.lastGrabSay = -1e9;
    this.lastName = ''; this.idleSaid = 0; this.lastAsk = null; this.lastPromptText = ''; this.rounds = 0;
    this.v.onStart = (it, now) => { if (this.pending && it === this.pending) { this.promptStart = now; this.promptUntil = now + 0.3 + 0.072 * it.text.length; this.pending = null; } };
  }
  T(k, p) { return I18N.t(this.lang, k, Object.assign({ child: CHILD }, p || {}), this.rf); }
  line(fn, e, fb) {
    const ev = Object.assign({ topic: this.w.topic }, this.lastAsk ? { promptKey: this.lastAsk.promptKey, params: this.lastAsk.params } : {}, e);
    try { const t = I18N[fn](this.lang, ev, this.rf); if (t) return t; } catch (er) { /* fallback */ }
    return fb ? this.T(fb) : '';
  }
  canInt(now) {
    if (VOPT.includes('guardEnd')) { const v = this.v; if ((v.cur && v.cur.tag === 'prompt') || v.q.some(x => x.tag === 'prompt')) return false; }
    return now > this.promptUntil;
  }
  speakPrompt(now, txt, opt, meta) {
    this.promptStart = now; this.promptUntil = now + 6 + 0.072 * (txt || '').length;
    const behind = this.v.cur ? this.v.cur.tag : (this.v.q.length ? this.v.q[0].tag : null);
    const it = this.v.say(now, txt, opt, 'prompt', meta); if (it) it.behind = opt && opt.interrupt ? null : behind; this.pending = it; return it;
  }
  sayName(now, txt) {
    if (!txt || this.v.speaking()) return;
    if (now - this.lastGrabSay < 0.7 || (txt === this.lastName && now - this.lastGrabSay < 3)) return;
    this.lastGrabSay = now; this.lastName = txt; this.v.say(now, txt, {}, 'name');
  }
  on(e, now) {
    const w = this.w, v = this.v, T = (k, p) => this.T(k, p);
    switch (e.type) {
      case 'level': v.say(now, T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true }, 'chapter'); v.say(now, T('weather.' + e.level), {}, 'weather'); break;
      case 'round': this.rounds++; this.idleSaid = 0; this.lastAsk = null; this.lastPromptText = ''; if (this.rounds === 1) v.say(now, T('deal'), {}, 'deal'); break;
      case 'ask': { this.lastAsk = e; this.idleSaid = 0; const txt = T(e.promptKey, e.params || {}); this.lastPromptText = txt; this.speakPrompt(now, txt, { priority: true }, { ask: true, askT: now, key: e.ask + ':' + w.round + ':' + w.level }); break; }
      case 'grab': this.sayName(now, this.line('sayTap', e, null)); break;
      case 'tapPiece': if (!e.assist) this.sayName(now, this.line('sayTap', e, null)); break;
      case 'miss': if (now - this.lastMissSay > 6) { this.lastMissSay = now; v.say(now, T('miss'), { interrupt: this.canInt(now) }, 'miss'); } break;
      case 'stack': {
        this.promptUntil = 0; this.pending = null;
        const last = w.tower && e.n >= (w.tower.n || 99);
        v.say(now, last ? I18N.sayTowerDone(this.lang, e.n, this.rf) : this.line('sayStack', e, 'praise'), { interrupt: true }, last ? 'towerDone' : 'praise');
        break;
      }
      case 'wrong': if (now - this.lastWrongSay > 1.5) { this.lastWrongSay = now; v.say(now, this.line('sayWrong', e, 'hint'), { interrupt: this.canInt(now) }, 'wrong'); } break;
      case 'hint': if (!e.idle) v.say(now, T('hint'), {}, 'hint'); break;
      case 'idle': if (++this.idleSaid <= 4) v.say(now, T('idle') + ' ' + this.lastPromptText, {}, 'idle'); break;
      case 'pokePip': if (now - this.promptStart > 3 && !this.pending && this.lastAsk && w.state === 'round') { this.promptUntil = 0; this.speakPrompt(now, this.lastPromptText, { interrupt: true }, { repeat: true }); } break;
      case 'stillDrag': { const sl = T('stillDrag'); if (sl && sl !== 'stillDrag') v.say(now, sl, { interrupt: this.canInt(now) }, 'stillDrag'); break; }
      case 'sprinkles': { const g = T('great'); if (g && g !== 'great') v.say(now, g, {}, 'great'); break; }
      case 'gust': { const g = T('gust'); if (g && g !== 'gust') v.say(now, g, { interrupt: this.canInt(now) }, 'gust'); break; }
      case 'puffer': { const g = T('puffer'); if (g && g !== 'puffer') v.say(now, g, { interrupt: this.canInt(now) }, 'puffer'); break; }
      case 'pufferTap': v.say(now, T('puffer.tap'), { interrupt: this.canInt(now) }, 'pufferTap'); break;
      case 'talk': { const tk = e.talk || w.talk; this.speakPrompt(now, T('talk.intro') + ' ' + T(tk.promptKey, tk.params || {}), { priority: true }, { talk: true, askT: now }); break; }
      case 'talkAsk': { const tk = e.talk || w.talk; if (tk && e.n <= 3) v.say(now, T(tk.promptKey, tk.params || {}), { priority: true }, 'talkAsk'); break; }
      case 'talkResult': v.say(now, e.correct ? T('talk.right') : T('talk.wrong', { answer: '' }), { interrupt: true }, 'talkResult'); break;
      case 'sessionDone': v.say(now, T('party'), { interrupt: true }, 'party'); v.say(now, T('session.done', { stars: e.stars || 0 }), {}, 'sessionDone'); break;
    }
  }
}

/* ---------------------------------------------------------------- one session */
function runOne(o) {
  const vp0 = L.VIEWPORTS[o.vp];
  const w = new RT.World({ seed: o.seed, age: o.age, lang: o.lang, config: o.config || {} });
  w.setViewport(vp0.W, vp0.H, vp0.ins);
  let vpRot = false;
  const d = makeModel(o.model, w, o.age, o.seed + 1);
  const mv = new MainVoice(w, o.lang, o.seed + 2), rr = new RT.RNG(o.seed + 3);
  w.askGate = () => !!mv.v.cur || mv.v.q.length > 0;
  const S = { model: o.model, age: o.age, lang: o.lang, done: false, nan: false, time: 0, asks: [], rounds: [], chapters: [], bounceT: 0,
    tapLand: [], locked: 0, soft: 0, hints: { miss: 0, idle: 0, soft: 0 }, puffer: 0, pufferTap: 0, sends: 0, drags: 0,
    rot: 0, rotBad: 0, rotLift: 0, rotFall: 0, rotCount: 0, stuckLift: 0, maxTheta: 0, prompts: [], second: null };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1500;
  let ask = null, roundT0 = 0, chapT0 = 0, rIn = 0, t = 0, rotAt = -1, liftSince = {};
  const sendT = {};
  while (w.state !== 'sessionDone' && t < cap) {
    w.setBreeze(w.weather === 1 ? 0.8 : 0.08);
    d.step(dt); w.update(dt); t += dt;
    const now = w.time;
    if (w.state === 'round' && w.phase === 'bounce') S.bounceT += dt;
    if (w.puffer && (w.puffer.state === 'in' || w.puffer.state === 'sit')) S.pufferVisT = (S.pufferVisT || 0) + dt;
    if (w.pieces.some(p => !isFinite(p.x) || !isFinite(p.y)) || !isFinite(w.tower.theta)) { S.nan = true; break; }
    S.maxTheta = Math.max(S.maxTheta, Math.abs(w.tower.theta));
    for (const p of w.pieces) { if (p.state === 'lift' || p.state === 'fall') { liftSince[p.id] = liftSince[p.id] || now; if (now - liftSince[p.id] > 6) { S.stuckLift++; liftSince[p.id] = 1e9; } } else delete liftSince[p.id]; }
    if (rotAt > 0 && now >= rotAt) {
      rotAt = -1; vpRot = !vpRot; S.rot++;
      if (w.pieces.some(p => p.state === 'lift')) S.rotLift++;
      else if (w.pieces.some(p => p.state === 'fall')) S.rotFall++;
      if (vpRot) w.setViewport(vp0.H, vp0.W, vp0.ins); else w.setViewport(vp0.W, vp0.H, vp0.ins);
      if (w.pieces.some(p => p.state === 'lift' || p.state === 'fall')) S.rotBad++;
      const live = w.tower.blocks.filter(b => !b.fly).length;
      if (w.state === 'round' && w.phase !== 'done' && w.phase !== 'clear' && live !== w.ask && live !== w.ask + 1) S.rotCount++;
    }
    for (const e of w.drainEvents()) {
      mv.on(e, now);
      switch (e.type) {
        case 'level': chapT0 = now; rIn = 0; break;
        case 'round': roundT0 = now; break;
        case 'ask': ask = { t0: now, wrong: 0, firstRight: null, hint: false, k: w.pieces.filter(p => p.askIdx === w.ask).length, soft0: S.soft }; break;
        case 'tapPiece': S.sends++; sendT[e.pieceId] = now; if (ask && ask.firstRight == null) ask.firstRight = !!e.right; break;
        case 'grab': S.drags++; break;
        case 'drop': if (ask && ask.firstRight == null && !e.assisted) ask.firstRight = !!e.right;
          if (e.via === 'tap' && ROT > 0 && rotAt < 0 && rr.chance(ROT)) rotAt = now + rr.float(0.05, 1.2); break;
        case 'wrong': if (ask) ask.wrong++; break;
        case 'locked': S.locked++; break;
        case 'land': if (sendT[e.pieceId] != null) { S.tapLand.push(now - sendT[e.pieceId]); delete sendT[e.pieceId]; } break;
        case 'hint': if (e.idle) S.hints.idle++; else if (ask && ask.wrong >= 2) S.hints.miss++; else S.hints.soft++; if (ask) ask.hint = true; break;
        case 'stack': if (ask) { ask.dur = now - ask.t0; S.asks.push(ask); ask = null; } break;
        case 'puffer': S.puffer++; break;
        case 'pufferTap': S.pufferTap++; break;
        case 'roundDone': rIn++; S.rounds.push({ dur: now - roundT0, stars: e.stars, n: w.cur ? w.cur.n : 0 }); break;
        case 'levelDone': S.chapters.push({ dur: now - chapT0, rounds: rIn }); break;
      }
    }
    mv.v.update(now);
  }
  for (let k = 0; k < 200; k++) mv.v.update(w.time + k * 0.1);
  // prompts (ask prompts only, not repeats)
  for (const it of mv.v.items) if (it.tag === 'prompt' && it.meta.ask) {
    S.prompts.push({ s: it.status, by: it.by || null, heard: it.heard == null ? null : it.heard, delay: it.start != null ? it.start - it.t : null, dur: it.dur, end: it.start != null ? it.start + it.dur : null, askT: it.meta.askT });
  }
  // answer time relative to the prompt end: link by askT
  const byT = {}; for (const p of S.prompts) byT[p.askT.toFixed(4)] = p;
  for (const a of S.asks) { const p = byT[a.t0.toFixed(4)]; if (p) p.answeredIn = a.dur; }
  S.lines = {};
  for (const it of mv.v.items) { const k = it.tag, o = S.lines[k] = S.lines[k] || { n: 0, done: 0, cut: 0, lost: 0, by: {} }; o.n++; if (it.status === 'done') o.done++; else { if (it.status === 'cut') o.cut++; else o.lost++; const b = it.status + ':' + it.by; o.by[b] = (o.by[b] || 0) + 1; } }
  S.behind = {}; for (const it of mv.v.items) if (it.tag === 'prompt' && it.meta.ask && it.start != null && it.start - it.t > 0.3) { const b = it.behind || '?'; S.behind[b] = (S.behind[b] || 0) + 1; }
  S.pufferVis = S.pufferVisT || 0;
  S.done = w.state === 'sessionDone'; S.time = w.time; S.stars = w.stars;
  if (d.stats && d.stats.second) S.second = d.stats.second;
  return S;
}

function runSlice(pairs) {
  const out = [];
  for (const [age, model] of pairs) for (let k = 0; k < N; k++) out.push(runOne({ age, model, seed: 9000 + k * 37 + age * 11, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config }));
  return out;
}

/* ---------------------------------------------------------------- summary */
const f1 = x => (x == null || isNaN(x) ? '–' : (+x).toFixed(1)), p0 = x => (x == null || isNaN(x) ? '–' : (+x).toFixed(0)), q2 = x => (+x).toFixed(2);
function summarize(S) {
  const by = {};
  for (const s of S) (by[s.age + '|' + s.model] = by[s.age + '|' + s.model] || []).push(s);
  const rows = [];
  for (const key of Object.keys(by)) {
    const A = by[key], [age, model] = key.split('|'), done = A.filter(s => s.done);
    const asks = [].concat(...A.map(s => s.asks)), rounds = [].concat(...done.map(s => s.rounds)), chaps = [].concat(...done.map(s => s.chapters));
    const prompts = [].concat(...A.map(s => s.prompts)), np = prompts.length || 1;
    const cutAns = prompts.filter(p => p.s === 'cut' && (p.by === 'praise' || p.by === 'towerDone')).length;
    const cutOther = prompts.filter(p => p.s === 'cut' && !(p.by === 'praise' || p.by === 'towerDone'));
    const lost = prompts.filter(p => p.s === 'dropped' || p.s === 'flushed' || p.s === 'stale').length;
    const otherBy = {}; for (const p of cutOther) otherBy[p.by] = (otherBy[p.by] || 0) + 1;
    const ad = asks.map(a => a.dur), w = asks.map(a => a.wrong), na = asks.length || 1;
    const st = v => rounds.length ? 100 * rounds.filter(r => r.stars === v).length / rounds.length : 0;
    const tl = [].concat(...A.map(s => s.tapLand)), tot = A.reduce((a, s) => a + s.time, 0);
    const second = {}; for (const s of A) if (s.second) for (const [k, v] of Object.entries(s.second)) second[k] = (second[k] || 0) + v;
    rows.push({ age: +age, model, n: A.length, done: done.length, nan: A.filter(s => s.nan).length,
      chap: L.mean(chaps.map(c => c.dur)), chapP90: L.pct(chaps.map(c => c.dur), 0.9), cut: chaps.length ? 100 * chaps.filter(c => c.rounds < 4).length / chaps.length : 0,
      ses: L.mean(done.map(s => s.time)), sesP90: L.pct(done.map(s => s.time), 0.9), sesMax: Math.max(0, ...done.map(s => s.time)),
      round: L.mean(rounds.map(r => r.dur)), roundP90: L.pct(rounds.map(r => r.dur), 0.9), roundMax: Math.max(0, ...rounds.map(r => r.dur)),
      ask: L.mean(ad), askP90: L.pct(ad, 0.9), askMax: Math.max(0, ...ad), stuck: ad.filter(x => x > 60).length, stuckR: rounds.filter(r => r.dur > 120).length,
      wrong: L.mean(w), w2: 100 * w.filter(x => x >= 2).length / na, w3: 100 * w.filter(x => x >= 3).length / na, wMax: Math.max(0, ...w),
      firstRight: 100 * asks.filter(a => a.firstRight).length / na, bounceSh: tot ? 100 * A.reduce((a, s) => a + s.bounceT, 0) / tot : 0,
      locked: A.reduce((a, s) => a + s.locked, 0) / na, hintMiss: A.reduce((a, s) => a + s.hints.miss, 0) / na, hintIdle: A.reduce((a, s) => a + s.hints.idle, 0) / na,
      hintSoft: A.reduce((a, s) => a + s.hints.soft, 0) / na, hinted: 100 * asks.filter(a => a.hint).length / na,
      sendShare: (() => { const s = A.reduce((a, x) => a + x.sends, 0), g = A.reduce((a, x) => a + x.drags, 0); return s + g ? 100 * s / (s + g) : 0; })(),
      tapLand: L.mean(tl), s3: st(3), s2: st(2), s1: st(1), starsSes: L.mean(done.map(s => s.stars)),
      puffer: A.reduce((a, s) => a + s.puffer, 0), pufferTap: A.reduce((a, s) => a + s.pufferTap, 0),
      heard: 100 * prompts.filter(p => p.s === 'done').length / np, cutAns: 100 * cutAns / np, cutOther: 100 * cutOther.length / np, lost: 100 * lost / np,
      otherBy: Object.entries(otherBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', '),
      delay: L.mean(prompts.filter(p => p.delay != null).map(p => p.delay)), delayP90: L.pct(prompts.filter(p => p.delay != null).map(p => p.delay), 0.9),
      heardWhenCut: L.mean(prompts.filter(p => p.s === 'cut' && p.heard != null).map(p => p.heard)),
      rot: A.reduce((a, s) => a + s.rot, 0), rotBad: A.reduce((a, s) => a + s.rotBad, 0), rotLift: A.reduce((a, s) => a + s.rotLift, 0), rotFall: A.reduce((a, s) => a + s.rotFall, 0), rotCount: A.reduce((a, s) => a + s.rotCount, 0), stuckLift: A.reduce((a, s) => a + s.stuckLift, 0),
      lines: (() => { const o = {}; for (const s of A) for (const [k, v] of Object.entries(s.lines)) { const t = o[k] = o[k] || { n: 0, done: 0, cut: 0, lost: 0, by: {} }; t.n += v.n; t.done += v.done; t.cut += v.cut; t.lost += v.lost; for (const [b, c] of Object.entries(v.by)) t.by[b] = (t.by[b] || 0) + c; } return o; })(),
      behind: (() => { const o = {}; for (const s of A) for (const [k, v] of Object.entries(s.behind)) o[k] = (o[k] || 0) + v; return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', '); })(),
      lateAsk: (() => { const P = [].concat(...A.map(s => s.prompts)); return P.length ? 100 * P.filter(p => p.delay != null && p.delay > 0.3).length / P.length : 0; })(),
      pufferVis: A.reduce((a, s) => a + s.pufferVis, 0) / Math.max(1, A.reduce((a, s) => a + s.puffer, 0)),
      maxTheta: Math.max(...A.map(s => s.maxTheta)), second: Object.entries(second).map(([k, v]) => k + ':' + v).join(' ') });
  }
  rows.sort((a, b) => a.age - b.age || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));
  return rows;
}
function tables(rows) {
  let md = '### Pacing\n\n| age | model | done/n | chapter mean/p90 s | cut % | session mean/p90/max s | tower mean/p90/max s | ask mean/p90/max s | stuck ask>60 / tower>120 | tap share % | tap→land s |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) md += `| ${r.age} | ${r.model} | ${r.done}/${r.n}${r.nan ? ' **NaN ' + r.nan + '**' : ''} | ${f1(r.chap)} / ${f1(r.chapP90)} | ${p0(r.cut)} | ${p0(r.ses)} / ${p0(r.sesP90)} / ${p0(r.sesMax)} | ${f1(r.round)} / ${f1(r.roundP90)} / ${p0(r.roundMax)} | ${f1(r.ask)} / ${f1(r.askP90)} / ${p0(r.askMax)} | ${r.stuck} / ${r.stuckR} | ${p0(r.sendShare)} | ${q2(r.tapLand)} |\n`;
  md += '\n### Bonks, help, stars\n\n| age | model | 1st answer right % | wrong/ask | asks ≥2 / ≥3 bonks % | max bonks | bonk time % | locked/ask | hinted asks % | hints miss/idle/soft per ask | ★★★/★★/★ % | stars/session | puffer seen (tapped) · tappable s |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) md += `| ${r.age} | ${r.model} | ${p0(r.firstRight)} | ${q2(r.wrong)} | ${p0(r.w2)} / ${p0(r.w3)} | ${r.wMax} | ${f1(r.bounceSh)} | ${q2(r.locked)} | ${p0(r.hinted)} | ${q2(r.hintMiss)} / ${q2(r.hintIdle)} / ${q2(r.hintSoft)} | ${p0(r.s3)}/${p0(r.s2)}/${p0(r.s1)} | ${f1(r.starsSes)} | ${r.puffer} (${r.pufferTap}) · ${f1(r.pufferVis)} |\n`;
  md += '\n### Voice (ask prompts)\n\n| age | model | fully heard % | cut by own answer % | cut by other % (by) | lost % | start delay mean/p90 s | heard when cut | 2nd tap of a double tap | rotations (mid-lift / mid-sink) · left moving · count off / stuck lift |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) md += `| ${r.age} | ${r.model} | ${p0(r.heard)} | ${p0(r.cutAns)} | ${p0(r.cutOther)}${r.otherBy ? ' (' + r.otherBy + ')' : ''} | ${p0(r.lost)} | ${q2(r.delay)} / ${q2(r.delayP90)} | ${r.heardWhenCut ? p0(100 * r.heardWhenCut) + ' %' : '–'} | ${r.second || '–'} | ${r.rot ? r.rot + ' (' + r.rotLift + ' / ' + r.rotFall + ') · ' + r.rotBad + ' · ' + r.rotCount : '–'} / ${r.stuckLift} |\n`;
  md += '\n### Voice lines heard fully % (n) — wrong / praise / towerDone / great / name / puffer / pufferTap\n\n| age | model | wrong | praise | towerDone | great | name | puffer | pufferTap |\n|---|---|---|---|---|---|---|---|---|\n';
  const lh = (r, k) => { const o = r.lines[k]; return o ? p0(100 * o.done / o.n) + ' (' + o.n + ')' : '–'; };
  md += '\n### Why lines were not heard (top causes) and what a late prompt waited behind\n\n| age | model | wrong line lost to | puffer line lost to | prompts starting > 0.3 s late % (behind) |\n|---|---|---|---|---|\n';
  const top = (r, k) => { const o = r.lines[k]; return o ? Object.entries(o.by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, c]) => b + ' ' + c).join(', ') : '–'; };
  for (const r of rows) md += `| ${r.age} | ${r.model} | ${top(r, 'wrong')} | ${top(r, 'puffer')} | ${p0(r.lateAsk)} (${r.behind}) |\n`;
  md += '\n| age | model | wrong | praise | towerDone | great | name | puffer | pufferTap |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) md += `| ${r.age} | ${r.model} | ${lh(r, 'wrong')} | ${lh(r, 'praise')} | ${lh(r, 'towerDone')} | ${lh(r, 'great')} | ${lh(r, 'name')} | ${lh(r, 'puffer')} | ${lh(r, 'pufferTap')} |\n`;
  return md;
}

module.exports = { runOne, summarize, tables, makeModel, BlockTapper, LiftSpammer, DoubleTapper, MainVoice, VoiceSim };
if (require.main !== module) { /* library */ } else if (args.includes('--worker')) {
  process.on('message', m => { process.send(runSlice(m.pairs), () => process.exit(0)); });
} else {
  const t0 = Date.now(), slices = []; for (let j = 0; j < JOBS; j++) slices.push([]);
  const pairs = []; for (const a of AGES) for (const m of MODELS) pairs.push([a, m]);
  pairs.forEach((pm, i) => slices[i % JOBS].push(pm));
  Promise.all(slices.filter(s => s.length).map(sl => new Promise((res, rej) => {
    const c = fork(__filename, [...args, '--worker']), parts = [];
    c.on('message', r => parts.push(...r)); c.on('exit', code => (code ? rej(new Error('worker ' + code)) : res(parts))); c.send({ pairs: sl });
  }))).then(parts => {
    const S = [].concat(...parts), rows = summarize(S);
    const md = `## hs_pt3 "${TAG}" — ${S.length} sessions (${N} per age × model)${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}${VOPT.length ? ' · voice ' + VOPT : ''}${PATCH.length ? ' · patch ' + PATCH : ''}${ROT ? ' · rotate ' + ROT : ''}\n\n` +
      tables(rows) + `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall · tests/sim/hs_pt3.js_\n`;
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'pt3_' + TAG + '.json'), JSON.stringify(rows, null, 1));
    fs.writeFileSync(path.join(out, 'pt3_' + TAG + '.md'), md);
    console.log(md);
  }).catch(e => { console.error(e); process.exit(1); });
}
