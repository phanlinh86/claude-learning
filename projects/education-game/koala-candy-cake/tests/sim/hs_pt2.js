#!/usr/bin/env node
// Koko's Cake Tower — playtester's high-speed sim #2 (report-only; never edits game/js).
//   node tests/sim/hs_pt2.js [--n 40] [--ages 3,4,5,6,7] [--models …] [--config '{…}'] [--patch fadeWrong,…] [--jobs 2] [--tag x]
// Adds to hs_playtest.js:
//   · models: wrongFirst (tries every wrong layer before the right one), wrongAlways (always drags a wrong layer while one
//     exists, ignores hints: tests whether a round can end at all), rapidGrab (grabs instantly, flicks in 2–4 fast moves),
//     dropSide (aims wide to the sides of the cake), plus every hs_models.js model (tapper, slow3, dropHigh, spammer, absent…)
//   · release classification: every pointerUp of a dragged layer → drop / miss-side / miss-low / tap, distance outside the
//     drop zone, fall time of high drops
//   · done-sequence timing (towerDone → roundDone, roundDone → next ask = clear + float-in + deal), warm-up vs other cakes
//   · bee / breeze: grabs stolen by the bee's hit circle, ask time with a bee on screen, breezy chapter vs others, max θ
//   · a VOICE model of main.js (2026-11-14) + CK.Voice's queue (MAXQ 2, stale 5 s, priority, interrupt, prompt guard)
//     → per line tag: heard / cut / flushed / dropped / stale; count-line sync with the visual count; blow-line lag
//   · patches (harness-only prototypes of code proposals, wrap CK.World.prototype in this process):
//       fadeWrong: from the 3rd wrong drop of one ask, the wrong layers puff away (errorless fade) so only the right one is left
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fork } = require('child_process');
const L = require('./lib');
const M = require('./hs_models');
const CK = L.CK;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'i18n.js'), 'utf8'), { filename: 'i18n.js' });
const I18N = CK.I18N;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 40), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,slow3,thoughtful,dropHigh,dropSide,rapidGrab,spammer,tapper,wrongFirst,wrongAlways,absent,bot0.8';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'pt2'), JOBS = +get('jobs', 2), PATCH = (get('patch', '') || '').split(',').filter(Boolean);
const VPS = Object.keys(L.VIEWPORTS);
const FADE_AFTER = +get('fadeAfter', 3);
// voice summary only over children who listen (fast random models answer before the prompt ends by design)
const VM = get('vmodels', 'typical,slow3,thoughtful,dropHigh,dropSide,wrongFirst').split(',');
const ANSWERED = ['praise', 'cake', 'talkResult', 'name'];

/* ---------------------------------------------------------------- patches (prototype only) */
if (PATCH.includes('fadeWrong') && CK.CONFIG.fadeWrongAfter === undefined) {   // world.js has it natively now (CONFIG.fadeWrongAfter)
  const P = CK.World.prototype, bounce = P._bounce, rest = P._rest, startAsk = P._startAsk;
  P._startAsk = function () { this._fade = false; return startAsk.apply(this, arguments); };
  P._bounce = function (p) {
    const r = bounce.apply(this, arguments);
    if (this.askMisses >= FADE_AFTER && !this._fade) {
      this._fade = true;
      for (const q of this.pieces) if (q !== p && !q.right && q.askIdx === this.ask && q.state === 'rest') this._out(q);
    }
    return r;
  };
  P._rest = function (p) {
    const r = rest.apply(this, arguments);
    if (this._fade && this.state === 'round' && p.askIdx === this.ask && !p.right && p.state === 'rest') this._out(p);
    return r;
  };
}

//   catchPad: a release counts as over the cake up to CATCH px further to the sides (only the RELEASE test; the layout keeps dropPad)
const CATCH = +get('catch', 40);
if (PATCH.includes('catchPad') && CK.CONFIG.dropCatch === undefined) {   // world.js has it natively now (CONFIG.dropCatch)
  const P = CK.World.prototype, up = P.pointerUp;
  P.pointerUp = function (x, y) {
    const D = this.layout && this.layout.drop; if (!D) return up.call(this, x, y);
    const a = D.x0, b = D.x1; D.x0 = a - CATCH; D.x1 = b + CATCH;
    try { return up.call(this, x, y); } finally { D.x0 = a; D.x1 = b; }
  };
}
// --blocks '{"6":[3,4,4,5]}': layers per cake by age (content proposal) via makeRound's own `blocks` option + blocksFor
const BLK = JSON.parse(get('blocks', '{}'));
if (Object.keys(BLK).length) {
  const mk = CK.Content.makeRound, bf = CK.Content.blocksFor;
  const nOf = (age, ri) => { const t = BLK[age]; return t ? t[Math.min(ri, t.length - 1)] : null; };
  CK.Content.makeRound = function (topic, o) { const n = nOf(o.age, o.roundIndex || 0); return mk(topic, n ? Object.assign({}, o, { blocks: n }) : o); };
  CK.Content.blocksFor = function (topic, age, ri) { return nOf(age, ri) || bf(topic, age, ri); };
}

/* ---------------------------------------------------------------- extra models */
class WrongKid extends L.Kid {
  // mode 'first': skill 0 → tries each wrong layer once (tried list), follows a hint with p 0.85
  // mode 'always': always a wrong layer while any wrong layer is resting (even one already tried), never follows hints
  constructor(w, prof, seed, mode) { super(w, Object.assign(prof, { skill: 0, followHint: mode === 'always' ? 0 : prof.followHint }), seed); this.mode = mode; }
  step(dt) { if (this.mode === 'always') this.tried = []; return super.step(dt); }
}
function makeModel(name, w, age, seed) {
  const tp = () => L.typicalProfile(age);
  switch (name) {
    case 'wrongFirst': return new WrongKid(w, tp(), seed, 'first');
    case 'wrongAlways': return new WrongKid(w, tp(), seed, 'always');
    case 'rapidGrab': return new L.Kid(w, Object.assign(tp(), { think: [0.2, 0.7], retry: [0.1, 0.4], steps: [2, 4], stepDt: [0.01, 0.025], hold: [0, 0.03], pTap: 0, pPoke: 0, aimX: 1.1, aimUp: [0, 260], pDistract: 0 }), seed);
    case 'dropSide': return new L.Kid(w, Object.assign(tp(), { aimX: 1.35 }), seed);
  }
  return M.makeModel(name, w, age, seed);
}

/* ---------------------------------------------------------------- voice model (main.js 2026-11-14 + voice.js queue) */
const CPS = { en: +get('cpsEn', 12), vi: +get('cpsVi', 14) }, LAT = +get('lat', 0.25);
class VoiceQ {
  constructor(lang) { this.lang = lang; this.q = []; this.cur = null; this.kickAt = 0; this.items = []; this.MAXQ = 2; this.STALE = 5; this.onStart = null; }
  dur(text) { const s = I18N.speech ? I18N.speech(this.lang, text) : text; return LAT + s.length / CPS[this.lang]; }
  say(now, text, opt, tag, meta) {
    if (!text) return null;
    opt = opt || {};
    const it = { text, tag, t: now, priority: !!opt.priority, dur: this.dur(text), status: 'queued', meta: meta || {} };
    this.items.push(it);
    if (opt.interrupt) {
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
    if (!this.cur && this.kickAt < now) this.kickAt = now;
    return it;
  }
  speaking() { return !!this.cur; }
  update(now) {
    if (this.cur && now >= this.cur.start + this.cur.dur) { this.cur.status = 'done'; this.cur.end = now; this.cur = null; this.kickAt = now; }
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
  constructor(w, lang, seed, opt) {
    this.w = w; this.lang = lang; this.r = new CK.RNG(seed); this.rf = () => this.r.next(); this.v = new VoiceQ(lang); this.opt = opt || {};
    this.promptUntil = 0; this.pendingPrompt = null; this.promptStart = -1e9; this.lastWrongSay = -1e9; this.lastMissSay = -1e9; this.lastGrabSay = -1e9;
    this.lastName = ''; this.idleSaid = 0; this.lastAsk = null; this.lastPromptText = ''; this.blowEv = [];
    this.v.onStart = (it, now) => { if (this.pendingPrompt && it.text === this.pendingPrompt) { this.promptStart = now; this.promptUntil = now + 0.3 + 0.072 * it.text.length; this.pendingPrompt = null; } };
  }
  T(k, p) { return I18N.t(this.lang, k, Object.assign({ child: this.opt.child || '' }, p || {}), this.rf); }
  line(fn, e, fb) {
    const ev = Object.assign({ topic: this.w.topic }, this.lastAsk ? { promptKey: this.lastAsk.promptKey, params: this.lastAsk.params } : {}, e);
    try { const t = I18N[fn](this.lang, ev, this.rf); if (t) return t; } catch (er) { /* fall back */ }
    return fb ? this.T(fb) : '';
  }
  can(now) { return now > this.promptUntil; }
  speakPrompt(now, txt, opt, meta) { this.pendingPrompt = txt; this.promptStart = now; this.promptUntil = now + 6 + 0.072 * txt.length; return this.v.say(now, txt, opt, 'prompt', meta); }
  sayName(now, txt) {
    if (!txt || this.v.speaking()) return;
    if (now - this.lastGrabSay < 0.7 || (txt === this.lastName && now - this.lastGrabSay < 3)) return;
    this.lastGrabSay = now; this.lastName = txt; this.v.say(now, txt, {}, 'name');
  }
  on(e, now) {
    const w = this.w, v = this.v, T = (k, p) => this.T(k, p), O = this.opt;
    switch (e.type) {
      case 'level': v.say(now, T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true }, 'chapter'); v.say(now, T('weather.' + e.level), {}, 'weather'); break;
      case 'round': this.idleSaid = 0; this.lastAsk = null; this.lastPromptText = '';
        if (e.round % (w.roundsPerLevel || 4) === 0 && !(O.noDeal && (O.noDeal === 'all' || e.round > 0 || w.level > 0))) v.say(now, T('deal'), {}, 'deal'); break;
      case 'ask': { this.lastAsk = e; this.idleSaid = 0; const txt = T(e.promptKey, e.params || {}); this.lastPromptText = txt; this.speakPrompt(now, txt, { priority: true }, { askT: now, chapFirst: w.round % 4 === 0 && e.first }); break; }
      case 'grab': this.sayName(now, this.line('sayTap', e, null)); break;
      case 'tapPiece': if (!e.assist) this.sayName(now, this.line('sayTap', e, null)); break;
      case 'miss': if (now - this.lastMissSay > 6) { this.lastMissSay = now; v.say(now, T('miss'), { interrupt: this.can(now) }, 'miss'); } break;
      case 'stack': {
        this.promptUntil = 0; this.pendingPrompt = null;
        const last = w.tower && e.n >= (w.tower.n || 99);
        if (last) {
          let txt = I18N.sayTowerDone(this.lang, e.n, this.rf);
          if (O.cake && O.cake[this.lang]) { const nums = []; for (let i = 1; i <= e.n; i++) nums.push(I18N.name ? I18N.name(this.lang, 'number', i) : String(i)); const c = nums.join(', '); txt = O.cake[this.lang].replace('{count}', c.charAt(0).toUpperCase() + c.slice(1)); }
          if (O.namedLast) txt = this.line('sayStack', e, 'praise') + ' ' + txt;   // proposal: name the last layer too
          v.say(now, txt, { interrupt: true }, 'cake', { n: e.n, t: now });
        } else v.say(now, this.line('sayStack', e, 'praise'), { interrupt: true }, 'praise');
        break;
      }
      case 'wrong': if (now - this.lastWrongSay > 1.5) { this.lastWrongSay = now; v.say(now, this.line('sayWrong', e, 'hint'), { interrupt: this.can(now) }, 'wrong'); } break;
      case 'hint': if (!e.idle) v.say(now, T('hint'), {}, 'hint'); break;
      case 'idle': if (++this.idleSaid <= 4) v.say(now, T('idle') + ' ' + this.lastPromptText, {}, 'idle'); break;
      case 'pokeKoko': if (now - this.promptStart > 3 && !this.pendingPrompt && this.lastAsk && w.state === 'round') { this.promptUntil = 0; this.speakPrompt(now, this.lastPromptText, { interrupt: true }, { repeat: true }); } break;
      case 'stillDrag': { const s = T('stillDrag'); if (s && s !== 'stillDrag') v.say(now, s, { interrupt: this.can(now) }, 'stillDrag'); break; }
      case 'count': if (O.blowAtLastCount && e.i === e.n) { const s = T('blow'); v.say(now, s, {}, 'blow', { t: now }); } break;
      case 'blow': this.blowEv.push(now); if (O.blowAtLastCount || O.noBlow) break; { const s = T('blow'); if (s && s !== 'blow') v.say(now, s, O.blowInterrupt ? { interrupt: true } : {}, 'blow', { t: now }); break; }
      case 'roundDone': if (O.great) v.say(now, T('great'), {}, 'great'); break;
      case 'gust': v.say(now, T('gust'), { interrupt: O.gustQueue ? false : this.can(now) }, 'gust'); break;
      case 'bee': v.say(now, T('bee'), { interrupt: this.can(now) }, 'bee'); break;
      case 'beeTap': v.say(now, T('bee.tap'), { interrupt: this.can(now) }, 'beeTap'); break;
      case 'talk': { const tk = e.talk || w.talk; this.speakPrompt(now, T('talk.intro') + ' ' + T(tk.promptKey, tk.params || {}), { priority: true }, { talk: true }); break; }
      case 'talkAsk': { const tk = e.talk || w.talk; if (tk && e.n <= 3) v.say(now, T(tk.promptKey, tk.params || {}), { priority: true }, 'talkAsk'); break; }
      case 'talkResult': v.say(now, e.correct ? T('talk.right') : T('talk.right'), { interrupt: true }, 'talkResult'); break;
      case 'sessionDone': v.say(now, T('party'), { interrupt: true }, 'party'); v.say(now, T('session.done', { stars: e.stars || 0 }), {}, 'sessionDone'); break;
    }
  }
}

/* ---------------------------------------------------------------- one session */
function pieceUnder(w, x, y) {
  const Lw = w.layout, hx = Lw.LW / 2 + w.cfg.hitPadX, hy = w.cfg.hitFrac * Lw.S + w.cfg.hitPad;
  return w.pieces.some(p => p.state === 'rest' && Math.abs(x - p.x) <= hx && Math.abs(y - p.y) <= hy);
}
function runOne(o) {
  const vp = L.VIEWPORTS[o.vp];
  const w = new CK.World({ seed: o.seed, age: o.age, lang: o.lang, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const d = makeModel(o.model, w, o.age, o.seed + 1);
  const mv = o.voice ? new MainVoice(w, o.lang, o.seed + 2, o.vopt) : null;
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, lang: o.lang, done: false, paused: false, pauseAt: null, nan: false, time: 0,
    asks: [], rounds: [], chapters: [], rel: { drop: 0, wrongDrop: 0, side: 0, low: 0, tap: 0, near40: 0, near80: 0, far: 0 }, fallHigh: [], fallNorm: [],
    doneSeq: [], gap: [], firstAsk: [], beeSteal: 0, beeDowns: 0, beeTaps: 0, bees: 0, gusts: 0, maxTheta: 0, maxThetaBreezy: 0,
    idleAt: [], talkAsks: 0, hints: { miss: 0, idle: 0, soft: 0 }, assists: 0, stuckAsk: 0, answers: [], roundKeys: [] };
  // wrap the input API of THIS world to classify releases and bee steals
  const up = w.pointerUp.bind(w), down = w.pointerDown.bind(w);
  w.pointerDown = (x, y) => { const beeWas = w.bee && (w.bee.state === 'in' || w.bee.state === 'sit'); const steal = beeWas && pieceUnder(w, x, y); const r = down(x, y); if (r === 'bee') { S.beeDowns++; if (steal && Math.hypot(x - w.bee.lx, y - w.bee.ly) > 4) S.beeSteal++; } return r; };
  const falls = {};
  w.pointerUp = (x, y) => {
    const pr = w._press, p = pr && pr.kind === 'piece' ? w.pieceById(pr.id) : null;
    const r = up(x, y);
    if (p && r) {
      const D = w.layout.drop, hx = pr.fx - pr.ox, hy = pr.fy - pr.oy;
      if (r === 'drop') { S.rel.drop++; if (!p.right) S.rel.wrongDrop++; falls[p.id] = { t: w.time, h: w.towerTop().y - Math.min(p.y, hy) }; }
      else if (r === 'tap') S.rel.tap++;
      else if (r === 'miss') {
        const inX = (p.x >= D.x0 && p.x <= D.x1) || (hx >= D.x0 && hx <= D.x1);
        if (inX) S.rel.low++; else S.rel.side++;
        const out = Math.min(Math.abs(hx - D.x0), Math.abs(hx - D.x1));
        if (!inX) { if (out <= 40) S.rel.near40++; else if (out <= 80) S.rel.near80++; else S.rel.far++; }
      }
    }
    return r;
  };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1500;
  let ask = null, round = null, chap = null, t = 0, idleSaid = 0, tDone = null, tRD = null, beeOn = false;
  while (w.state !== 'sessionDone' && t < cap) {
    w.setBreeze(w.weather === 1 ? (o.breeze != null ? o.breeze : 0.8) : 0.08);
    d.step(dt); w.update(dt); t += dt;
    const now = w.time;
    if (mv) mv.v.update(now);
    if (w.pieces.some(p => !isFinite(p.x) || !isFinite(p.y)) || !isFinite(w.tower.theta)) { S.nan = true; break; }
    const th = Math.abs(w.tower.theta); S.maxTheta = Math.max(S.maxTheta, th); if (w.weather === 1) S.maxThetaBreezy = Math.max(S.maxThetaBreezy, th);
    beeOn = !!w.bee;
    if (ask) { if (beeOn) ask.beeT = (ask.beeT || 0) + dt; }
    let stop = false;
    for (const e of w.drainEvents()) {
      if (mv) mv.on(e, now);
      switch (e.type) {
        case 'level': chap = { t0: now, rounds: 0, weather: e.weather, topic: e.topic }; break;
        case 'round': round = { t0: now, i: e.round, n: e.n, surprise: e.surprise, warm: e.round % 4 === 0, w: w.weather, topic: w.topic }; idleSaid = 0;
          if (tRD != null) S.gap.push({ clear: now - tRD }); break;
        case 'ask': {
          idleSaid = 0;
          const ps = w.pieces.filter(p => p.askIdx === w.ask);
          ask = { t0: now, k: ps.length, wrong: 0, grass: 0, hint: false, warm: round && round.warm, w: w.weather, surprise: round && round.surprise, first: e.first, ans: e.nameKind + ':' + e.nameValue };
          if (e.first && round) S.firstAsk.push(now - round.t0);
          if (tRD != null && e.first) { const g = S.gap[S.gap.length - 1]; if (g) g.toAsk = now - tRD; tRD = null; }
          S.answers.push(ask.ans);
          break;
        }
        case 'wrong': if (ask) ask.wrong++; break;
        case 'miss': if (ask) ask.grass++; break;
        case 'drop': if (e.assisted) S.assists++; break;
        case 'land': { const f = falls[e.pieceId]; if (f) { (f.h > 2.6 * w.layout.LH ? S.fallHigh : S.fallNorm).push(now - f.t); delete falls[e.pieceId]; } break; }
        case 'hint': if (e.idle) S.hints.idle++; else if (ask && ask.wrong >= 2) S.hints.miss++; else S.hints.soft++; if (ask) ask.hint = true; break;
        case 'stack': if (ask) { ask.dur = now - ask.t0; if (ask.dur > 60) S.stuckAsk++; S.asks.push(ask); ask = null; } break;
        case 'towerDone': tDone = now; break;
        case 'roundDone':
          if (tDone != null) S.doneSeq.push({ n: w.tower.blocks.length, dur: now - tDone }); tDone = null; tRD = now;
          if (round) { S.rounds.push({ dur: now - round.t0, stars: e.stars, warm: round.warm, n: round.n, surprise: round.surprise, w: round.w }); if (chap) chap.rounds++; }
          break;
        case 'gust': S.gusts++; break;
        case 'bee': S.bees++; break;
        case 'beeTap': S.beeTaps++; break;
        case 'idle': if (++idleSaid >= 5 && quiet) { S.paused = true; S.pauseAt = now; stop = true; } S.idleAt.push(now - (ask ? ask.t0 : now)); break;
        case 'talk': tRD = null; break;
        case 'talkAsk': S.talkAsks++; if (e.n >= 4 && quiet) { S.paused = true; S.pauseAt = now; stop = true; } break;
        case 'levelDone': if (chap) { chap.dur = now - chap.t0; S.chapters.push(chap); } break;
      }
    }
    if (stop) break;
  }
  if (ask && !S.paused) { ask.dur = w.time - ask.t0; ask.open = true; if (ask.dur > 60) S.stuckAsk++; S.asks.push(ask); }
  S.done = w.state === 'sessionDone'; S.time = w.time; S.stars = w.stars;
  if (mv) {
    // finish the queue for a few seconds so the last lines resolve
    for (let k = 0; k < 300; k++) mv.v.update(w.time + k * 0.05);
    S.blowEv = mv.blowEv;
    S.voice = mv.v.items.map(it => ({ tag: it.tag, status: it.status, heard: it.heard, t: it.t, start: it.start, dur: it.dur, len: it.text.length, meta: it.meta, by: it.by }));
  }
  return S;
}

function runSlice(pairs) {
  const out = [];
  for (const [age, model] of pairs) {
    const n = model === 'absent' ? Math.max(6, Math.round(N / 5)) : model === 'wrongAlways' ? Math.max(6, Math.round(N / 3)) : N;
    for (let k = 0; k < n; k++) out.push(runOne({ age, model, seed: 9000 + k * 37 + age * 11, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config,
      cap: model === 'absent' ? 900 : model === 'wrongAlways' ? 900 : 1500, voice: !args.includes('--novoice'), vopt: JSON.parse(get('vopt', '{}')) }));
  }
  return out.map(compact);
}
// keep the worker → parent message small
function compact(S) {
  const v = S.voice || [];
  const vs = {};
  for (const it of v) {
    const k = it.tag; const o = vs[k] = vs[k] || { n: 0, done: 0, cut: 0, flushed: 0, dropped: 0, stale: 0, queued: 0, speaking: 0, delay: [], cutHeard: [], by: {} };
    o.n++; o[it.status] = (o[it.status] || 0) + 1;
    if (it.start != null) o.delay.push(it.start - it.t);
    if (it.status === 'cut') o.cutHeard.push(it.heard);
    if (it.status !== 'done' && it.by) o.by[it.by] = (o.by[it.by] || 0) + 1;
  }
  // count-line sync: the k-th number of the "One, two, three…" line vs the visual count k (towerDone + countAt + (k−1)·countStep)
  const cake = v.filter(it => it.tag === 'cake' && it.start != null);
  const sync = [];
  for (const it of cake) { const n = it.meta.n || 0; const lagFirst = (it.start + LAT) - (it.t + (config.countAt != null ? config.countAt : CK.CONFIG.countAt)); sync.push({ n, lagFirst, end: it.start + it.dur - it.t, status: it.status }); }
  // blow line: lag = when its "fffff" (last 35 % of the line) is heard minus the blow event (Koko's puff + candles out 0.45 s later)
  const BE = S.blowEv || [];
  const blow = v.filter(it => it.tag === 'blow').map((it, i) => ({ status: it.status, lag: it.start != null && BE[i] != null ? it.start + 0.65 * it.dur - BE[i] : null }));
  delete S.blowEv;
  const prompts = v.filter(it => it.tag === 'prompt' && !it.meta.repeat && !it.meta.talk).map(it => ({ status: it.status, by: it.by, delay: it.start != null ? it.start - it.t : null, chapFirst: it.meta.chapFirst }));
  delete S.voice;
  S.vs = vs; S.sync = sync; S.blow = blow; S.prompts = prompts;
  return S;
}

/* ---------------------------------------------------------------- summary */
const mean = L.mean, pct = L.pct, f1 = L.f1, f2 = x => (+x).toFixed(2), p0 = x => (+x).toFixed(0);
function summarize(all) {
  const by = {};
  for (const s of all) (by[s.age + '|' + s.model] = by[s.age + '|' + s.model] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const A = by[k], [age, model] = k.split('|'), done = A.filter(s => s.done);
    const asks = [].concat(...A.map(s => s.asks)), rounds = [].concat(...done.map(s => s.rounds)), chaps = [].concat(...done.map(s => s.chapters));
    const rel = A.reduce((a, s) => { for (const q in s.rel) a[q] = (a[q] || 0) + s.rel[q]; return a; }, {});
    const releases = rel.drop + rel.side + rel.low;
    const ds = [].concat(...A.map(s => s.doneSeq)), gap = [].concat(...A.map(s => s.gap)).filter(g => g.toAsk != null);
    const warm = asks.filter(a => a.warm), other = asks.filter(a => !a.warm);
    const st = v => rounds.length ? 100 * rounds.filter(r => r.stars === v).length / rounds.length : 0;
    const askW = wv => mean(asks.filter(a => a.w === wv && a.dur != null).map(a => a.dur));
    const beeAsk = asks.filter(a => a.beeT > 0), noBee = asks.filter(a => a.surprise == null);
    rows.push({ age: +age, model, n: A.length, done: done.length, paused: A.filter(s => s.paused).length, pauseAt: mean(A.filter(s => s.paused).map(s => s.pauseAt)),
      nan: A.filter(s => s.nan).length, open: A.filter(s => !s.done && !s.paused).length,
      chap: mean(chaps.map(c => c.dur)), chapP90: pct(chaps.map(c => c.dur), 0.9), chapMax: chaps.length ? Math.max(...chaps.map(c => c.dur)) : 0,
      cut: chaps.length ? 100 * chaps.filter(c => c.rounds < 4).length / chaps.length : 0, rpc: mean(chaps.map(c => c.rounds)),
      ses: mean(done.map(s => s.time)), sesP90: pct(done.map(s => s.time), 0.9), sesMax: done.length ? Math.max(...done.map(s => s.time)) : 0,
      round: mean(rounds.map(r => r.dur)), roundP90: pct(rounds.map(r => r.dur), 0.9), roundMax: rounds.length ? Math.max(...rounds.map(r => r.dur)) : 0,
      ask: mean(asks.filter(a => a.dur != null).map(a => a.dur)), askP90: pct(asks.map(a => a.dur), 0.9), stuckAsk: A.reduce((a, s) => a + s.stuckAsk, 0),
      stuckRound: rounds.filter(r => r.dur > 120).length,
      wrongPerAsk: mean(asks.map(a => a.wrong)), hintPerAsk: asks.length ? (A.reduce((a, s) => a + s.hints.miss + s.hints.idle + s.hints.soft, 0)) / asks.length : 0,
      hintMiss: asks.length ? A.reduce((a, s) => a + s.hints.miss, 0) / asks.length : 0, hintIdle: asks.length ? A.reduce((a, s) => a + s.hints.idle, 0) / asks.length : 0,
      hintSoft: asks.length ? A.reduce((a, s) => a + s.hints.soft, 0) / asks.length : 0, askHinted: asks.length ? 100 * asks.filter(a => a.hint).length / asks.length : 0,
      assistPerAsk: asks.length ? A.reduce((a, s) => a + s.assists, 0) / asks.length : 0,
      s3: st(3), s2: st(2), s1: st(1),
      relDrop: releases ? 100 * rel.drop / releases : 0, relSide: releases ? 100 * rel.side / releases : 0, relLow: releases ? 100 * rel.low / releases : 0,
      near40: rel.side ? 100 * rel.near40 / rel.side : 0, near80: rel.side ? 100 * rel.near80 / rel.side : 0, wrongDropPerAsk: asks.length ? rel.wrongDrop / asks.length : 0, tapRel: rel.tap,
      fallHigh: mean([].concat(...A.map(s => s.fallHigh))), fallNorm: mean([].concat(...A.map(s => s.fallNorm))), nHigh: [].concat(...A.map(s => s.fallHigh)).length,
      doneSeq: mean(ds.map(x => x.dur)), doneMin: ds.length ? Math.min(...ds.map(x => x.dur)) : 0, doneMax: ds.length ? Math.max(...ds.map(x => x.dur)) : 0,
      gapToAsk: mean(gap.map(g => g.toAsk)), firstAsk: mean([].concat(...A.map(s => s.firstAsk))),
      warmAsk: mean(warm.filter(a => a.dur != null).map(a => a.dur)), warmWrong: mean(warm.map(a => a.wrong)), otherAsk: mean(other.filter(a => a.dur != null).map(a => a.dur)), otherWrong: mean(other.map(a => a.wrong)),
      warmK: mean(warm.map(a => a.k)), otherK: mean(other.map(a => a.k)),
      askSunny: askW(0), askBreezy: askW(1), askRain: askW(2), askRainbow: askW(3),
      bees: A.reduce((a, s) => a + s.bees, 0), beeTaps: A.reduce((a, s) => a + s.beeTaps, 0), beeSteal: A.reduce((a, s) => a + s.beeSteal, 0), gusts: A.reduce((a, s) => a + s.gusts, 0),
      askBee: mean(beeAsk.filter(a => a.dur != null).map(a => a.dur)), askNoBee: mean(noBee.filter(a => a.dur != null && !a.first).map(a => a.dur)),
      maxTheta: Math.max(...A.map(s => s.maxTheta)), maxThetaB: Math.max(...A.map(s => s.maxThetaBreezy)),
      rep: mean(A.map(s => { let r = 0; for (let i = 1; i < s.answers.length; i++) if (s.answers[i] === s.answers[i - 1]) r++; return s.answers.length > 1 ? 100 * r / (s.answers.length - 1) : 0; })),
      uniq: mean(A.map(s => s.answers.length ? 100 * new Set(s.answers).size / s.answers.length : 0))
    });
  }
  rows.sort((a, b) => a.age - b.age || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));
  return rows;
}
function voiceSummary(all) {
  const out = {};
  for (const lang of ['en', 'vi']) {
    const A = all.filter(s => s.lang === lang && VM.includes(s.model));
    const tags = {};
    for (const s of A) for (const [t, o] of Object.entries(s.vs || {})) {
      const g = tags[t] = tags[t] || { n: 0, done: 0, cut: 0, flushed: 0, dropped: 0, stale: 0, delay: [], cutHeard: [], by: {} };
      g.n += o.n; for (const k of ['done', 'cut', 'flushed', 'dropped', 'stale']) g[k] += o[k] || 0; g.delay.push(...o.delay); g.cutHeard.push(...o.cutHeard);
      for (const [b, c] of Object.entries(o.by)) g.by[b] = (g.by[b] || 0) + c;
    }
    const sync = [].concat(...A.map(s => s.sync)), blow = [].concat(...A.map(s => s.blow)), pr = [].concat(...A.map(s => s.prompts));
    out[lang] = { tags, sync: { n: sync.length, lagFirst: mean(sync.map(x => x.lagFirst)), end: mean(sync.map(x => x.end)), heard: sync.length ? 100 * sync.filter(x => x.status === 'done').length / sync.length : 0 },
      blow: { n: blow.length, heard: blow.length ? 100 * blow.filter(b => b.status === 'done').length / blow.length : 0, lag: mean(blow.filter(b => b.lag != null).map(b => b.lag)), lagP90: pct(blow.filter(b => b.lag != null).map(b => b.lag), 0.9) },
      prompt: { n: pr.length, heard: pr.length ? 100 * pr.filter(p => p.status === 'done').length / pr.length : 0, answered: pr.length ? 100 * pr.filter(p => p.status !== 'done' && ANSWERED.includes(p.by)).length / pr.length : 0,
        lost: pr.length ? 100 * pr.filter(p => p.status !== 'done' && !ANSWERED.includes(p.by)).length / pr.length : 0, lostBy: (() => { const b = {}; for (const p of pr) if (p.status !== 'done' && !ANSWERED.includes(p.by)) b[p.by] = (b[p.by] || 0) + 1; return b; })(),
        delay: mean(pr.filter(p => p.delay != null).map(p => p.delay)), delayP90: pct(pr.filter(p => p.delay != null).map(p => p.delay), 0.9),
        cfDelay: mean(pr.filter(p => p.chapFirst && p.delay != null).map(p => p.delay)), cfDelayP90: pct(pr.filter(p => p.chapFirst && p.delay != null).map(p => p.delay), 0.9) } };
  }
  return out;
}
function md(rows, V) {
  let s = '### Time & flow\n\n| age | model | done/n | chapter mean/p90/max s | cut % | session mean/p90/max s | cake mean/p90/max s | ask mean/p90 s | stuck ask>60/cake>120 | done seq s (min–max) | roundDone→next ask s | round→1st ask s |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) s += `| ${r.age} | ${r.model} | ${r.done}/${r.n}${r.paused ? ` (${r.paused} paused @${p0(r.pauseAt)} s)` : ''}${r.open ? ` **${r.open} unfinished**` : ''}${r.nan ? ' **NaN**' : ''} | ${f1(r.chap)} / ${f1(r.chapP90)} / ${p0(r.chapMax)} | ${p0(r.cut)} | ${p0(r.ses)} / ${p0(r.sesP90)} / ${p0(r.sesMax)} | ${f1(r.round)} / ${f1(r.roundP90)} / ${p0(r.roundMax)} | ${f1(r.ask)} / ${f1(r.askP90)} | ${r.stuckAsk} / ${r.stuckRound} | ${f2(r.doneSeq)} (${f2(r.doneMin)}–${f2(r.doneMax)}) | ${f2(r.gapToAsk)} | ${f2(r.firstAsk)} |\n`;
  s += '\n### Help, stars, releases\n\n| age | model | wrong/ask | hints/ask (2-miss/idle/soft) | asks hinted % | assist/ask | ★★★/★★/★ % | release → drop / side-miss / low-miss % | side-misses ≤40 / 40–80 px out % | fall s high/normal (n high) |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) s += `| ${r.age} | ${r.model} | ${f2(r.wrongPerAsk)} | ${f2(r.hintPerAsk)} (${f2(r.hintMiss)}/${f2(r.hintIdle)}/${f2(r.hintSoft)}) | ${p0(r.askHinted)} | ${f2(r.assistPerAsk)} | ${p0(r.s3)}/${p0(r.s2)}/${p0(r.s1)} | ${p0(r.relDrop)} / ${p0(r.relSide)} / ${p0(r.relLow)} | ${p0(r.near40)} / ${p0(r.near80)} | ${f2(r.fallHigh)} / ${f2(r.fallNorm)} (${r.nHigh}) |\n`;
  s += '\n### Warm-up, weather, bee, variety\n\n| age | model | warm-up ask s / wrong / choices | other ask s / wrong / choices | ask s sunny/breezy/rain/rainbow | max θ all / breezy | gusts | bees (tapped) / grabs stolen by bee | ask s with bee / no surprise | same answer twice in a row % | unique answers % |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) s += `| ${r.age} | ${r.model} | ${f1(r.warmAsk)} / ${f2(r.warmWrong)} / ${f1(r.warmK)} | ${f1(r.otherAsk)} / ${f2(r.otherWrong)} / ${f1(r.otherK)} | ${f1(r.askSunny)}/${f1(r.askBreezy)}/${f1(r.askRain)}/${f1(r.askRainbow)} | ${r.maxTheta.toFixed(3)} / ${r.maxThetaB.toFixed(3)} | ${r.gusts} | ${r.bees} (${r.beeTaps}) / ${r.beeSteal} | ${f1(r.askBee)} / ${f1(r.askNoBee)} | ${p0(r.rep)} | ${p0(r.uniq)} |\n`;
  if (V) {
    s += '\n### Voice model (speed 1, en 12 / vi 14 chars/s + 0.25 s latency; engaged models)\n\n| lang | line | n | heard % | cut % (mean heard) | flushed % | dropped % | stale % | mean start delay s | lost to (top) |\n|---|---|---|---|---|---|---|---|---|---|\n';
    for (const lang of Object.keys(V)) for (const [t, g] of Object.entries(V[lang].tags).sort((a, b) => b[1].n - a[1].n)) {
      const P = x => p0(100 * x / Math.max(1, g.n)), top = Object.entries(g.by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, c]) => `${b} ${c}`).join(', ');
      s += `| ${lang} | ${t} | ${g.n} | ${P(g.done)} | ${P(g.cut)} (${g.cutHeard.length ? p0(100 * mean(g.cutHeard)) + ' %' : '–'}) | ${P(g.flushed)} | ${P(g.dropped)} | ${P(g.stale)} | ${f2(mean(g.delay))} | ${top} |\n`;
    }
    s += '\n| lang | prompts heard % / cut by the child\'s own answer % / lost to another line % (by) | prompt start delay mean p90 s · 1st prompt of a chapter mean p90 s | cake line (count + cherry) heard % / 1st number vs visual count 1 (s, + = voice later) / line ends after towerDone s | blow line heard % / its "fffff" heard after the blow event mean p90 s (candles go out at +0.45) |\n|---|---|---|---|\n';
    for (const lang of Object.keys(V)) { const v = V[lang]; s += `| ${lang} | ${p0(v.prompt.heard)} / ${p0(v.prompt.answered)} / ${p0(v.prompt.lost)} (${Object.entries(v.prompt.lostBy).map(([b, c]) => b + ' ' + c).join(', ')}) | ${f2(v.prompt.delay)} ${f2(v.prompt.delayP90)} · ${f2(v.prompt.cfDelay)} ${f2(v.prompt.cfDelayP90)} | ${p0(v.sync.heard)} / ${f2(v.sync.lagFirst)} / ${f2(v.sync.end)} | ${p0(v.blow.heard)} / ${f2(v.blow.lag)} ${f2(v.blow.lagP90)} |\n`; }
  }
  return s;
}

module.exports = { runOne, summarize, voiceSummary, md, makeModel };
if (require.main !== module) { /* library */ } else if (args.includes('--worker')) {
  process.on('message', m => { process.send(runSlice(m.pairs), () => process.exit(0)); });
} else {
  const t0 = Date.now(), slices = []; for (let j = 0; j < JOBS; j++) slices.push([]);
  const pairs = []; for (const a of AGES) for (const m of MODELS) pairs.push([a, m]);
  pairs.forEach((pm, i) => slices[i % JOBS].push(pm));
  Promise.all(slices.filter(s => s.length).map(sl => new Promise((res, rej) => {
    const c = fork(__filename, [...args, '--worker']); const parts = [];
    c.on('message', r => parts.push(...r)); c.on('exit', code => (code ? rej(new Error('worker ' + code)) : res(parts))); c.send({ pairs: sl });
  }))).then(parts => {
    const all = [].concat(...parts), rows = summarize(all), V = args.includes('--novoice') ? null : voiceSummary(all);
    const head = `## hs_pt2 "${TAG}" — ${all.length} sessions${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}${PATCH.length ? ' · patch ' + PATCH.join(',') : ''}${get('vopt', '') ? ' · voice ' + get('vopt') : ''}\n\n`;
    const text = head + md(rows, V) + `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall · tests/sim/hs_pt2.js_\n`;
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'pt2_' + TAG + '.json'), JSON.stringify({ rows, V }, null, 1));
    fs.writeFileSync(path.join(out, 'pt2_' + TAG + '.md'), text);
    console.log(text);
  }).catch(e => { console.error(e); process.exit(1); });
}
