#!/usr/bin/env node
// Tuk's Ice Match — high-speed playtest v3 (report-only; never edits game/).
// Bots (skill 0.3 / 0.6 / 0.9) × ages 3–7 and child models incl. the new ones for this game:
//   rubR     "rubber": every move is ONE long swipe across a row / column / diagonal of blocks (no memory)
//   rubT     a typical child (lib.js memory model) who plays every pair as a straight swipe A → B, whatever lies between
//   spamAll  taps every 0.06–0.22 s on blocks (incl. up / matched / gliding ones) in EVERY phase (deal, peek, hide, resolve,
//            glide), 25 % of moves are short rub strokes; answers Talk at once
//   dreamy   present but slow: one sensible move, then looks away 15–45 s (does the idle policy pause on her?)
//   absent   never touches anything
//   (+ lib.js typical / toddler / slow3 / tapper)
// Every session also runs a VOICE MODEL that mirrors main.js onEvent + voice.js (queue ≤ 2, stale 5 s, interrupt,
// prompt protection 0.3 s + 72 ms/char, name throttles) with the real IM.I18N lines and a TTS duration of
// 0.3 s + 72 ms per character (rate 0.92) — lines/min, talk share, lines cut / dropped per kind, prompts cut, count lines.
// Checks: event order per match, rewards reaching their place, NaN, stuck rounds, false auto-pauses.
//   node tests/sim/pt_tuk_kids.js --name base [--n 6] [--nb 20] [--drivers …] [--config '{…}'] [--voice '{…}'] [--patch …]
// Voice-policy variants (sim only): --voice '{"idleResetOnTouch":true,"nameGuard":1.2,"leapCount":true}'
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const DRV_KIDS = ['typical', 'toddler', 'slow3', 'tapper', 'rubR', 'rubT', 'spamAll', 'dreamy'];
const DRV_BOTS = ['bot0.3', 'bot0.6', 'bot0.9'];
const VPS = ['iphoneP', 'iphoneL', 'ipadL', 'ipadP'];

/* ------------------------------------------------------------------ worker side */
function workerMain() {
  const L = require('./lib');
  const IM = L.IM;
  const { load } = require('../unit/load');
  const IMT = load(['rng.js', 'content.js', 'i18n.js']);
  const I18N = IMT.I18N;
  const hyp = (x, y) => Math.sqrt(x * x + y * y);

  // ---------------------------------------------------------------- new drivers
  const live = (w) => w.cards.filter(c => c.state === 'down');
  const boardRect = (w) => (w.layout.grid && w.layout.grid.rect) || { x: 0, y: 0, w: w.layout.W, h: w.layout.H };

  /** Executes one stroke: pointerDown at (x0,y0), pointerMove along a straight line at `speed` px/s, pointerUp. */
  class Stroke {
    constructor(w, x0, y0, x1, y1, speed) { this.w = w; this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1; this.T = Math.max(0.08, hyp(x1 - x0, y1 - y0) / speed); this.t = 0; this.started = false; this.revealed = []; }
    step(dt) {
      const w = this.w;
      if (!this.started) { this.started = true; const n0 = w.events.length; w.pointerDown(this.x0, this.y0); this._grab(n0); return false; }
      this.t = Math.min(this.T, this.t + dt);
      const u = this.t / this.T, n0 = w.events.length;
      w.pointerMove(this.x0 + (this.x1 - this.x0) * u, this.y0 + (this.y1 - this.y0) * u); this._grab(n0);
      if (this.t >= this.T) { const n1 = w.events.length; w.pointerUp(this.x1, this.y1); this._grab(n1); return true; }
      return false;
    }
    _grab(n0) { const ev = this.w.events; for (let i = n0; i < ev.length; i++) if (ev[i].type === 'flip') this.revealed.push(ev[i].id); }
  }

  /** rubR: a long random swipe through the board every 0.8–2.0 s (waits while a mismatch shows with p 0.5). */
  class RubR {
    constructor(w, seed) { this.w = w; this.r = new IM.RNG(seed); this.t = 2; this.s = null; this.stats = { strokes: 0, revealed: 0, revealHist: [0, 0, 0, 0], crossed: 0 }; }
    step(dt) {
      const w = this.w, r = this.r;
      if (w.state === 'talk') { if (!w.talkAnswered) { this.t -= dt; if (this.t < 0) { w.talkAnswer(r.chance(0.6) ? w.talk.answerId : r.pick(w.talk.choices).id); this.t = 1; } } return; }
      if (this.s) {
        if (this.s.step(dt)) {
          const k = this.s.revealed.length; this.stats.revealHist[Math.min(3, k)]++; this.stats.revealed += k;
          this.stats.crossed += this._crossed; this.s = null; this.t = r.float(0.8, 2.0);
        }
        return;
      }
      if (w.state !== 'round' || (w.phase !== 'play' && w.phase !== 'resolve')) return;
      this.t -= dt; if (this.t > 0) return;
      if (w._mis && r.chance(0.5)) { this.t = 0.3; return; }
      const d = live(w); if (!d.length) return;
      const a = r.pick(d), B = boardRect(w), mode = r.int ? r.int(0, 2) : Math.floor(r.next() * 3);
      let x1, y1;
      if (mode === 0) { x1 = a.x < B.x + B.w / 2 ? B.x + B.w + 20 : B.x - 20; y1 = a.y + r.float(-20, 20); }
      else if (mode === 1) { y1 = a.y < B.y + B.h / 2 ? B.y + B.h + 20 : B.y - 20; x1 = a.x + r.float(-20, 20); }
      else { const b = r.pick(w.cards.filter(c => c.state !== 'gone')); x1 = b.x + (b.x - a.x) * 0.3; y1 = b.y + (b.y - a.y) * 0.3; }
      this._crossed = w.cards.filter(c => c.state !== 'gone' && segHits(a.x, a.y, x1, y1, c)).length;
      this.s = new Stroke(w, a.x, a.y, x1, y1, r.float(500, 900)); this.stats.strokes++;
    }
  }
  function segHits(x0, y0, x1, y1, c) {   // segment × block rect (Liang–Barsky)
    const xmin = c.x - c.w / 2, xmax = c.x + c.w / 2, ymin = c.y - c.h / 2, ymax = c.y + c.h / 2;
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy], q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
    for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return false; } else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } } }
    return true;
  }

  /** rubT: a typical child (lib.js Kid, its memory and rhythm) whose every move is a swipe from her first pick A to the
   *  block she wants as second (remembered partner, else an unseen block) — straight, over whatever is between. */
  class RubT {
    constructor(w, age, seed) {
      this.w = w; this.kid = L.makeDriver('typical', w, age, seed); this.r = new IM.RNG(seed + 3); this.s = null; this.want = null;
      this.stats = { strokes: 0, intended: 0, accidental: 0, singles: 0, kid: this.kid.stats };
      const self = this, k = this.kid;
      // replace the kid's tap with a stroke when nothing is open
      this.kidStep = k.step.bind(k);
      k._origChoose = k.choose.bind(k);
    }
    step(dt) {
      const w = this.w, k = this.kid;
      if (this.s) {
        if (this.s.step(dt)) {
          const rv = this.s.revealed; this.s = null;
          if (rv.length >= 2) { if (rv[1] === this.want) this.stats.intended++; else this.stats.accidental++; } else this.stats.singles++;
          k.phase = 'wait'; k.t = k.rf(k.p.reaction);
        }
        return;
      }
      if (w.state === 'round' && w.phase === 'play' && !w._mis && w.open.length === 0 && k.phase === 'wait' && k.t !== -1 && k.t <= dt) {
        k.observe(); k.t -= dt;
        const a = k.choose(); if (!a) return;
        // the second: remembered partner of A, else a block she has not seen
        k.recall();
        const down = live(w).filter(c => c !== a), mem = k.mem;
        let b = down.find(c => mem[c.id] && mem[a.id] && mem[c.id].key === mem[a.id].key) || null;
        if (!b) { const un = down.filter(c => !mem[c.id]); b = un.length ? this.r.pick(un) : (down.length ? this.r.pick(down) : null); }
        if (!b) return;
        this.want = b.id; this.stats.strokes++;
        this.s = new Stroke(w, a.x, a.y, b.x, b.y, this.r.float(400, 800));
        return;
      }
      this.kidStep(dt);
    }
  }

  /** spamAll: hammers blocks in every phase; 25 % short rub strokes. */
  class SpamAll {
    constructor(w, seed) { this.w = w; this.r = new IM.RNG(seed); this.t = 0.1; this.s = null; this.stats = { taps: 0, byPhase: {}, flipsByPhase: {} }; }
    step(dt) {
      const w = this.w, r = this.r;
      if (w.state === 'talk') { if (!w.talkAnswered) { w.talkAnswer(r.pick(w.talk.choices).id); w.talkAnswer(r.pick(w.talk.choices).id); } return; }
      if (this.s) { if (this.s.step(dt)) this.s = null; return; }
      this.t -= dt; if (this.t > 0) return; this.t = r.float(0.06, 0.22);
      const cs = w.cards.filter(c => c.state !== 'gone'); if (!cs.length) { const x = r.float(0, w.layout.W), y = r.float(0, w.layout.H); w.pointerDown(x, y); w.pointerUp(x, y); return; }
      const c = r.pick(cs), ph = w.state === 'round' ? (w._mis ? 'mismatch' : w.phase) : w.state;
      this.stats.taps++; this.stats.byPhase[ph] = (this.stats.byPhase[ph] || 0) + 1;
      if (r.chance(0.25)) { const b = r.pick(cs); this.s = new Stroke(w, c.x, c.y, b.x, b.y, 1200); return; }
      const n0 = w.events.length; w.pointerDown(c.x + r.float(-15, 15), c.y + r.float(-15, 15));
      for (let i = n0; i < w.events.length; i++) if (w.events[i].type === 'flip') this.stats.flipsByPhase[ph] = (this.stats.flipsByPhase[ph] || 0) + 1;
      w.pointerUp();
    }
  }

  /** dreamy: a typical child of her age who, after every move, looks away 15–45 s. */
  class Dreamy {
    constructor(w, age, seed) { this.kid = L.makeDriver('typical', w, age, seed); this.w = w; this.r = new IM.RNG(seed + 9); this.away = 0; this.stats = this.kid.stats; }
    step(dt) {
      if (this.away > 0) { this.away -= dt; this.kid.observe && this.w.state === 'round' && this.kid.observe(); return; }
      const n = this.kid.stats.taps; this.kid.step(dt);
      if (this.kid.stats.taps > n && this.w.open.length !== 1) this.away = this.r.float(15, 45);
    }
  }

  function makeDriver(name, w, age, seed) {
    if (name === 'rubR') return new RubR(w, seed);
    if (name === 'rubT') return new RubT(w, age, seed);
    if (name === 'spamAll') return new SpamAll(w, seed);
    if (name === 'dreamy') return new Dreamy(w, age, seed);
    return L.makeDriver(name, w, age, seed);
  }

  // ---------------------------------------------------------------- voice model (mirror of main.js onEvent + voice.js)
  function VoiceModel(w, lang, opt) {
    opt = opt || {};
    const RATE_S = 0.072, BASE = 0.3, MAXQ = 2, STALE = 5;
    const dur = (s) => BASE + RATE_S * s.length;
    const st = { cur: null, q: [], promptUntil: -1, lastGrab: -9, lastName: '', lastWrong: -9, lastMatch: -9, rewardSaid: false, idleSaid: 0,
      nameGuard: -1, lastRound: null, lastPrompt: '' };
    const out = { req: {}, done: {}, cut: {}, drop: {}, stale: {}, cutBy: {}, dropBy: {}, started: 0, speakT: 0, collide: 0, falsePause: 0, pauses: 0,
      countReq: 0, countDone: 0, promptCut: 0, promptLost: 0, nameFirstDone: 0, nameFirst: 0, nameSecondDone: 0, nameSecond: 0, leapCounts: 0, log: [], lat: [] };
    const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
    const T = (k, p) => I18N.t(lang, k, Object.assign({ child: '' }, p || {}));
    const now = () => w.time;
    function finish(it, how, by) {
      if (how === 'done') { inc(out.done, it.cat); if (it.count) out.countDone++; if (it.nm === 1) out.nameFirstDone++; if (it.nm === 2) out.nameSecondDone++; }
      else if (how === 'cut') { inc(out.cut, it.cat); inc(out.cutBy, it.cat + '<' + by); if (it.cat === 'prompt') out.promptCut++; }
      else if (how === 'drop') { inc(out.drop, it.cat); inc(out.dropBy, it.cat + '<' + (by || 'queue')); if (it.cat === 'prompt') out.promptLost++; }
      else if (how === 'stale') { inc(out.stale, it.cat); if (it.cat === 'prompt') out.promptLost++; }
    }
    function say(text, cat, o) {
      o = o || {};
      if (!text || !String(text).trim()) return;
      inc(out.req, cat);
      const it = { text: String(text), cat, t: now(), prio: !!o.priority, count: !!o.count, nm: o.nm || 0 };
      if (it.count) out.countReq++; if (it.nm === 1) out.nameFirst++; if (it.nm === 2) out.nameSecond++;
      if (st.cur || st.q.length) out.collide++;
      if (out.log.length < 400) out.log.push(now().toFixed(1) + ' ' + cat + ': ' + it.text);
      if (o.interrupt) { for (const q of st.q) finish(q, 'drop', cat); st.q = []; if (st.cur) { finish(st.cur, 'cut', cat); st.cur = null; } st.q.push(it); kick(); return; }
      st.q.push(it);
      while (st.q.length > MAXQ) { let idx = -1; for (let i = 0; i < st.q.length - 1; i++) if (!st.q[i].prio) { idx = i; break; } if (idx < 0) idx = 0; finish(st.q.splice(idx, 1)[0], 'drop'); }
      kick();
    }
    function kick() {
      if (st.cur) return;
      while (st.q.length) {
        const it = st.q.shift();
        if (!it.prio && now() - it.t > STALE) { finish(it, 'stale'); continue; }
        it.start = now(); it.end = now() + dur(it.text); st.cur = it; out.started++;
        if (it.cat === 'name' && it.nm === 1) out.lat.push(it.start - it.t);
        if (opt.promptFromStart && it.cat === 'prompt') st.promptUntil = it.end;
        return;
      }
    }
    function tick(dt) {
      if (st.cur) { out.speakT += dt; if (now() >= st.cur.end) { finish(st.cur, 'done'); st.cur = null; } }
      kick();
    }
    const speaking = () => !!st.cur;
    const canInterrupt = () => now() > st.promptUntil && now() > st.nameGuard;
    const curIs = (cat, nm) => !!st.cur && st.cur.cat === cat && (nm === undefined || st.cur.nm === nm);
    function speakPrompt(txt, o) { st.promptUntil = now() + 0.3 + 0.072 * txt.length; say(txt, 'prompt', o); }
    const prompt = () => st.lastPrompt || (w.prompt() ? T(w.prompt().promptKey, w.prompt().params) : '');
    function onEvent(e) {
      switch (e.type) {
        case 'level': say(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), 'chapter', { interrupt: true }); say(T('weather.' + e.level), 'chapter'); break;
        case 'round': {
          st.idleSaid = 0; st.rewardSaid = false;
          const txt = T(e.promptKey, e.params || {}) + (opt.surpriseInPrompt && e.surprise ? ' ' + T('surprise.' + e.surprise) : ''); st.lastPrompt = T(e.promptKey, e.params || {}); speakPrompt(txt, { priority: true });
          if (e.surprise && !opt.surpriseInPrompt) say(T('surprise.' + e.surprise), 'surprise');
          break;
        }
        case 'golden': say(T('golden'), 'golden', { interrupt: true }); break;
        case 'peek': if (!opt.noPeekLine) say(T('peek'), 'peek'); break;
        case 'homeArrive': if (!speaking()) say(I18N.sayHome(lang, e), 'home'); break;
        case 'leap': if (opt.leapCount && e.n > 1 && !speaking()) { out.leapCounts++; say(I18N.numberName ? I18N.numberName(lang, e.k) : String(e.k), 'leapCount'); } break;
        case 'flip': {
          if (opt.idleResetOnTouch) st.idleSaid = 0;
          const line = I18N.sayFlip(lang, Object.assign({ topic: w.topic }, e));
          const isCount = e.face && e.face.kind === 'dots';
          if (opt.skipName2 && e.open === 2) break;
          say(line, 'name', { interrupt: canInterrupt() && !(opt.guardMatch && curIs('match')) && !(opt.matchGuard && curIs('match') && now() < st.matchGuard + (st.cur.start - st.cur.t)), count: isCount, nm: e.open === 1 ? 1 : 2 });
          if (opt.nameGuard && e.open === 1) st.nameGuard = now() + Math.min(opt.nameGuard, 0.3 + 0.072 * line.length);
          break;
        }
        case 'tap': {
          if (opt.idleResetOnTouch) st.idleSaid = 0;
          if (now() - st.lastGrab < 0.9) break; st.lastGrab = now();
          say(I18N.sayFlip(lang, Object.assign({ topic: w.topic }, e)), 'tapName', { interrupt: canInterrupt() }); break;
        }
        case 'match': st.lastMatch = now(); say(I18N.sayMatch(lang, Object.assign({ topic: w.topic }, e)), 'match', { interrupt: opt.matchRespectsPrompt ? (canInterrupt() && !curIs('name', 1)) : opt.guardName1 ? !curIs('name', 1) : true }); if (opt.matchGuard) st.matchGuard = now() + opt.matchGuard; break;
        case 'mismatch': if (opt.hintReplaces && e.streak >= 3) break; if (opt.skipName2 || now() - st.lastWrong > 1.5) { st.lastWrong = now(); say(I18N.sayMismatch(lang, Object.assign({ topic: w.topic }, e)), 'mismatch', { interrupt: canInterrupt() && !(opt.guardName1 && curIs('name', 1)) }); } break;
        case 'land': if (!st.rewardSaid && e.kind && !speaking() && now() - st.lastMatch > 4) { st.rewardSaid = true; say(T('reward.' + e.kind), 'reward'); } break;
        case 'hint': if (!e.idle) say(T('hint'), 'hint', opt.hintReplaces ? { interrupt: canInterrupt() && !(opt.guardName1 && curIs('name', 1)), priority: true } : {}); break;
        case 'idle':
          if (++st.idleSaid <= 4) say(T('idle') + ' ' + prompt(), 'idle');
          else if (st.idleSaid >= 5) { out.pauses++; out.pauseAt = out.pauseAt || now(); }
          break;
        case 'roundDone': say(T('great'), 'praise'); break;
        case 'talk': { const tk = e.talk || w.talk; const q = T('talk.intro') + ' ' + T(tk.promptKey, tk.params || {}); st.promptUntil = now() + 0.3 + 0.072 * q.length; say(q, 'talkQ', { priority: true }); break; }
        case 'talkAsk': { const tk = e.talk || w.talk; if (tk && e.n <= 3) say(T(tk.promptKey, tk.params || {}), 'talkAsk', { priority: true }); if (e.n >= 4) { out.pauses++; out.pauseAt = out.pauseAt || now(); } break; }
        case 'talkResult': say(e.correct ? T('talk.right') : (I18N.talkWrong ? I18N.talkWrong(lang, 'x', 'x') : T('talk.wrong')), 'talkResult', { interrupt: true }); break;
        case 'sessionDone': say(T('session.done', { stars: e.stars || 0 }), 'done', { interrupt: true }); break;
      }
    }
    return { onEvent, tick, out, st };
  }

  // ---------------------------------------------------------------- sim-only code proposals (never in game/)
  function applyPatches(IM, list) {
    const P = IM.World.prototype;
    if (list.includes('rubDwell')) {
      // PROPOSAL "a rub is a rub": a frosted block is revealed by a swipe only when the finger RUBS it (path inside the block
      // ≥ rubPathK × its long side, e.g. back and forth) or the stroke ENDS on it (pointerUp inside = "drag to it");
      // merely crossing a block on the way to another does nothing. Same rules as now otherwise (play, < 2 up, no mismatch).
      const K = +(process.env.RUBK || 1.6);
      P.pointerMove = function (x, y) {
        const fx = this.finger.x, fy = this.finger.y;
        this.finger.x = x; this.finger.y = y;
        if (!this.finger.down || !this._rubbed) return null;
        if (this.state !== 'round' || this.solved || this.phase !== 'play' || this._mis) { this._rubIn = null; return null; }
        const c = this._hit(x, y, false), id = c ? c.id : null;
        if (id !== this._rubLast) { this._rubLast = id; this._rubIn = 0; }
        else if (c) this._rubIn = (this._rubIn || 0) + Math.sqrt((x - fx) * (x - fx) + (y - fy) * (y - fy));
        if (!c || c.state !== 'down' || this._rubbed[id] || this.open.length >= 2) return null;
        if ((this._rubIn || 0) < K * Math.max(c.w, c.h)) return null;
        return this._rubReveal(c);
      };
      P._rubReveal = function (c) {
        this._rubbed[c.id] = 1;
        this._idleT = 0; this._idleGap = this.cfg.idleTime; this._sameN = 0;
        this._lookId = c.id; this._lookT = this.time; this._lastTapId = c.id;
        this._flipUp(c, 'rub');
        return c.id;
      };
      const od = P.pointerDown;
      P.pointerDown = function (x, y) { this._rubIn = 0; return od.call(this, x, y); };
      const ou = P.pointerUp;
      P.pointerUp = function (x, y) {
        if (x !== undefined) { this.finger.x = x; this.finger.y = y; }
        if (this.finger.down && this._rubbed && this.state === 'round' && !this.solved && this.phase === 'play' && !this._mis && this.open.length < 2) {
          const c = this._hit(this.finger.x, this.finger.y, false);
          if (c && c.state === 'down' && !this._rubbed[c.id]) this._rubReveal(c);
        }
        return ou.call(this, x, y);
      };
    }
    if (list.includes('fishWait')) {
      // PROPOSAL: when the round end leads to Talk time, roundDone lasts until the last fish of the last pair has dived
      // (≤ roundDoneFishMax 3 s extra), so the counted fish are not hidden behind the Talk panel.
      const oE = P._endRound, oT = P._startTalk, oB = P._beginRound;
      P._endRound = function () {
        const r = oE.call(this), c = this.cfg, nx = this.round + 1;
        const toTalk = nx >= this.roundsPerLevel || (nx >= c.chapterMinRounds && this.time + c.roundDoneTime - this.levelStartTime > c.chapterTimeLimit);
        if (toTalk) {
          let need = 0;
          for (const q of this.rewards) if (q.pieces) { const left = q.pieces.filter(pc => pc.state !== 'done'); if (left.length) need = Math.max(need, left.filter(pc => pc.state === 'wait').length * c.fishStagger + 1.0); }
          if (need > c.roundDoneTime) { this._rdt0 = this._rdt0 || c.roundDoneTime; c.roundDoneTime = Math.min(this._rdt0 + 3, need); }
        }
        return r;
      };
      const restore = function () { if (this._rdt0) { this.cfg.roundDoneTime = this._rdt0; this._rdt0 = 0; } };
      P._startTalk = function () { restore.call(this); return oT.call(this); };
      P._beginRound = function () { restore.call(this); return oB.call(this); };
    }
    if (list.includes('softLimit')) {
      // PROPOSAL: once the session passed sessionSoftLimit s, a chapter may end after 2 rounds (the surprise round is then
      // moved to round index 1 for the remaining chapters so it is never lost).
      const lim = +(process.env.SOFTLIM || 380), oB = P._beginRound;
      P._beginRound = function () {
        if (this.time > lim) { this.cfg.chapterMinRounds = 2; if (this.round === 0) this.cfg.surpriseRound = 1; }
        return oB.call(this);
      };
    }
  }

  // ---------------------------------------------------------------- one session
  function run(o) {
    const age = o.age, vp = L.VIEWPORTS[o.vp], seed = o.seed, dt = 1 / 30, maxTime = o.maxTime || 1500;
    const w = new IM.World({ seed, age, lang: o.lang, config: o.config || {} });
    w.setViewport(vp.W, vp.H, vp.ins);
    const drv = makeDriver(o.driver, w, age, seed * 7919 + 13);
    const V = VoiceModel(w, o.lang, o.voice);
    const m = { age, lang: o.lang, vp: o.vp, driver: o.driver, seed, done: false, sessionTime: null, stars: 0, rounds: [], chapters: [],
      hints: 0, idleHints: 0, idles: 0, idleGaps: [], mm: 0, matches: 0, nan: 0, errors: [], order: { ok: 0, bad: 0, samples: [] },
      rewards: { spawned: 0, landed: 0, notLanded: 0, fishLeapsOk: 0, fishLeapsBad: 0, homeOk: 0, homeMiss: 0, hiddenByTalk: 0, hiddenLeaps: 0 }, slow: 0, stuckNoCard: 0 };
    let rd = null, ch = null, lastIdle = null;
    const pend = {};      // per pair midpoint key: expected sequence
    const rw = {};        // reward id → { kind, n, leaps: [], splashes: 0, landed, home, homeArrive }
    const mk = (x, y) => Math.round(x) + ',' + Math.round(y);
    let firstIdleAt = null;
    function seqCheck(e) {
      switch (e.type) {
        case 'match': pend['m' + e.a] = { a: e.a, b: e.b, s: ['match'] }; break;
        case 'clink': { const p = pend['m' + e.a]; if (p) { p.s.push('clink'); p.key = mk(e.x, e.y); } else bad('clink without match'); break; }
        case 'melt': { const p = Object.values(pend).find(q => q.a === e.id || q.b === e.id); if (p) p.s.push(p.a === e.id ? 'meltA' : 'meltB'); else bad('melt without match'); break; }
        case 'reward': {
          const p = Object.values(pend).find(q => q.key === mk(e.x, e.y) && q.s[q.s.length - 1] === 'meltB');
          if (!p) bad('reward without pair ' + mk(e.x, e.y));
          else { const want = 'match,clink,meltA,meltB'; if (p.s.join(',') === want) m.order.ok++; else bad('order ' + p.s.join(',')); delete pend['m' + p.a]; }
          rw[e.id] = { kind: e.kind, n: e.n, leaps: [], splashes: 0, landed: false, home: !!e.home, homeArrive: false }; m.rewards.spawned++; break;
        }
        case 'leap': { const r = rw[e.id]; if (r) r.leaps.push(e.k); break; }
        case 'splash': { const r = rw[e.id]; if (r) r.splashes++; break; }
        case 'land': { const r = rw[e.id]; if (r && !r.landed) { r.landed = true; m.rewards.landed++;
          if (r.kind === 'fish' || r.kind === 'fishes') { const n = r.kind === 'fish' ? 1 : r.n, ok = r.leaps.length === n && r.splashes === n && r.leaps.every((k, i) => k === i + 1); ok ? m.rewards.fishLeapsOk++ : m.rewards.fishLeapsBad++; } } break; }
        case 'homeArrive': { const r = rw[e.id]; if (r) r.homeArrive = true; break; }
        case 'talk': for (const id in rw) { const r = rw[id]; if (!r.landed && (r.kind === 'fishes' || r.kind === 'fish')) { m.rewards.hiddenByTalk++; m.rewards.hiddenLeaps += (r.kind === 'fish' ? 1 : r.n) - r.leaps.length; } } break;
        case 'levelDone': case 'sessionDone': {
          for (const id in rw) { const r = rw[id]; if (!r.landed) m.rewards.notLanded++; if (r.home) r.homeArrive ? m.rewards.homeOk++ : m.rewards.homeMiss++; delete rw[id]; }
          if (Object.keys(pend).length) { bad('pairs without reward at ' + e.type); for (const k in pend) delete pend[k]; }
          break;
        }
      }
    }
    function bad(s) { m.order.bad++; if (m.order.samples.length < 3) m.order.samples.push(s); }
    const handle = (e) => {
      V.onEvent(e); seqCheck(e);
      switch (e.type) {
        case 'level': ch = { topic: e.topic, start: w.time, end: null, rounds: 0, stars: 0 }; m.chapters.push(ch); break;
        case 'round': rd = { topic: e.topic, pairs: e.pairs, start: w.time, play: null, end: null, mm: 0, hints: 0, idles: 0, stars: 0, sp: e.surprise || null }; m.rounds.push(rd); if (ch) ch.rounds++; lastIdle = null; break;
        case 'play': if (rd) rd.play = w.time; break;
        case 'match': m.matches++; break;
        case 'mismatch': m.mm++; if (rd) rd.mm++; break;
        case 'hint': m.hints++; if (e.idle) m.idleHints++; if (rd) rd.hints++; break;
        case 'idle': m.idles++; if (rd) rd.idles++; if (lastIdle !== null) m.idleGaps.push(w.time - lastIdle); lastIdle = w.time; if (firstIdleAt === null) firstIdleAt = w.time; break;
        case 'roundDone': if (rd) { rd.end = w.time; rd.stars = e.stars; } if (ch) ch.stars += e.stars; break;
        case 'levelDone': if (ch) ch.end = w.time; break;
        case 'sessionDone': m.done = true; m.sessionTime = w.time; m.stars = e.stars; break;
      }
    };
    try {
      w.newSession(); for (const e of w.drainEvents()) handle(e);
      let t = 0, k = 0, noMove = 0;
      while (t < maxTime && w.state !== 'sessionDone') {
        drv.step(dt); w.update(dt); t += dt;
        for (const e of w.drainEvents()) handle(e);
        V.tick(dt);
        if (o.driver === 'absent' && V.out.pauses) break;          // main.js pauses the game: stop
        if (w.state === 'round' && rd && w.time - rd.start > 180 && !rd.slow) { rd.slow = true; m.slow++; }
        if ((++k & 7) === 0) {
          const lv = w.cards.some(c => c.state === 'down' || c.state === 'up' || c.state === 'matched');
          if (w.state === 'round' && w.phase === 'play' && !w.solved && !lv) { if (++noMove === 31) m.stuckNoCard++; } else noMove = 0;
          for (const c of w.cards) if (!Number.isFinite(c.x + c.y + c.rot + c.flip + c.sx + c.sy + c.alpha)) { m.nan++; break; }
          for (const r of w.rewards) if (!Number.isFinite(r.x + r.y + r.rot)) { m.nan++; break; }
          if (!Number.isFinite(w.tuk.hop + w.tuk.slide)) m.nan++;
        }
      }
    } catch (err) { m.errors.push(String(err && err.stack || err).slice(0, 300)); }
    // a 'falsePause' = main.js would pause (5th idle nudge) while a child is actually still playing (not the absent child)
    const vo = V.out;
    m.voice = { req: vo.req, done: vo.done, cut: vo.cut, drop: vo.drop, stale: vo.stale, cutBy: vo.cutBy, dropBy: vo.dropBy, started: vo.started, speakT: vo.speakT, collide: vo.collide,
      pauses: vo.pauses, pauseAt: vo.pauseAt || null, countReq: vo.countReq, countDone: vo.countDone, promptCut: vo.promptCut, promptLost: vo.promptLost,
      nameFirst: vo.nameFirst, nameFirstDone: vo.nameFirstDone, nameSecond: vo.nameSecond, nameSecondDone: vo.nameSecondDone, lat: vo.lat.length ? [vo.lat.reduce((a, b) => a + b, 0) / vo.lat.length, Math.max(...vo.lat)] : null, log: o.keepLog ? vo.log : undefined };
    m.firstIdleAt = firstIdleAt; m.simTime = w.time; m.drv = drv.stats;
    m.rounds = m.rounds.map(r => ({ topic: r.topic, pairs: r.pairs, dur: r.end != null ? r.end - r.start : null, play: r.end != null && r.play != null ? r.end - r.play : null, mm: r.mm, hints: r.hints, idles: r.idles, stars: r.stars, sp: r.sp }));
    m.chapters = m.chapters.map(c => ({ topic: c.topic, dur: c.end != null ? c.end - c.start : null, rounds: c.rounds, stars: c.stars }));
    return m;
  }

  if (workerData && workerData.patch && workerData.patch.length) applyPatches(IM, workerData.patch);
  parentPort.on('message', (j) => {
    if (j === null) { parentPort.postMessage('bye'); parentPort.close(); return; }
    let r; try { r = run(j); } catch (e) { r = { error: String(e.stack) }; }
    parentPort.postMessage(r);
  });
}

/* ------------------------------------------------------------------ main: job matrix, workers, report */
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function pct(a, p) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
const f0 = (x) => (isFinite(x) ? Math.round(x).toString() : '–');
const f1 = (x) => (isFinite(x) ? x.toFixed(1) : '–');
const fp = (x) => (isFinite(x) ? (100 * x).toFixed(0) + '%' : '–');

function report(name, res, wall) {
  const groups = {};
  for (const m of res) { const k = m.driver + '|' + m.age; (groups[k] = groups[k] || []).push(m); }
  const keys = Object.keys(groups).sort((a, b) => { const [da, aa] = a.split('|'), [db, ab] = b.split('|'); return da === db ? aa - ab : da < db ? -1 : 1; });
  let md = `## pt_tuk_kids ${name} — ${res.length} sessions (${wall} s wall)\n\n`;
  md += '### Time (s)\n\n| driver | age | n | done | session mean | p90 | max | chapter mean | p10–p90 | round mean | p90 | ≤3-round chapters |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const k of keys) {
    const g = groups[k], [d, age] = k.split('|');
    const ses = g.filter(m => m.done).map(m => m.sessionTime), chs = [].concat(...g.map(m => m.chapters)).filter(c => c.dur != null);
    const rds = [].concat(...g.map(m => m.rounds)).filter(r => r.dur != null);
    md += `| ${d} | ${age} | ${g.length} | ${g.filter(m => m.done).length} | ${f0(mean(ses))} | ${f0(pct(ses, 0.9))} | ${f0(Math.max(...ses))} | ${f0(mean(chs.map(c => c.dur)))} | ${f0(pct(chs.map(c => c.dur), 0.1))}–${f0(pct(chs.map(c => c.dur), 0.9))} | ${f1(mean(rds.map(r => r.dur)))} | ${f1(pct(rds.map(r => r.dur), 0.9))} | ${fp(chs.filter(c => c.rounds <= 3).length / chs.length)} |\n`;
  }
  md += '\n### Help, stars, checks\n\n| driver | age | mismatch/round | rounds w/ hint | hints/round | idle/round | 3★/2★/1★ rounds | session stars | slow rounds >180 s | stuck | NaN | order bad | rewards not landed | fish leaps bad | home miss | fish under Talk (leaps) | errors |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const k of keys) {
    const g = groups[k], [d, age] = k.split('|'), rds = [].concat(...g.map(m => m.rounds)).filter(r => r.dur != null), n = rds.length;
    const s3 = rds.filter(r => r.stars === 3).length / n, s2 = rds.filter(r => r.stars === 2).length / n, s1 = rds.filter(r => r.stars === 1).length / n;
    const sum = (f) => g.reduce((s, m) => s + f(m), 0);
    md += `| ${d} | ${age} | ${f1(mean(rds.map(r => r.mm)))} | ${fp(rds.filter(r => r.hints).length / n)} | ${f1(mean(rds.map(r => r.hints)))} | ${f1(mean(rds.map(r => r.idles)))} | ${fp(s3)}/${fp(s2)}/${fp(s1)} | ${f0(mean(g.map(m => m.stars)))} | ${sum(m => m.slow)} | ${sum(m => m.stuckNoCard)} | ${sum(m => m.nan)} | ${sum(m => m.order.bad)} | ${sum(m => m.rewards.notLanded)} | ${sum(m => m.rewards.fishLeapsBad)} | ${sum(m => m.rewards.homeMiss)} | ${sum(m => m.rewards.hiddenByTalk)} (${sum(m => m.rewards.hiddenLeaps)}) | ${sum(m => m.errors.length)} |\n`;
  }
  md += '\n### Voice model (main.js policy, 0.3 s + 72 ms/char)\n\n| driver | age | lines started /min | talk share | requests colliding | 1st name heard fully | 2nd name heard fully | count lines heard fully | prompts cut / lost | idle false pauses (sessions) | name1 delay mean / max s | top cuts |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const k of keys) {
    const g = groups[k], [d, age] = k.split('|');
    if (d === 'absent') continue;
    const T = g.reduce((s, m) => s + m.simTime, 0) / 60, sum = (f) => g.reduce((s, m) => s + f(m), 0);
    const req = sum(m => Object.values(m.voice.req).reduce((a, b) => a + b, 0));
    const cuts = {}; for (const m of g) for (const c in m.voice.cutBy) cuts[c] = (cuts[c] || 0) + m.voice.cutBy[c];
    const top = Object.entries(cuts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} ${f1(n / g.length)}`).join(', ');
    md += `| ${d} | ${age} | ${f1(sum(m => m.voice.started) / T)} | ${fp(sum(m => m.voice.speakT) / (T * 60))} | ${fp(sum(m => m.voice.collide) / req)} | ${fp(sum(m => m.voice.nameFirstDone) / sum(m => m.voice.nameFirst))} | ${fp(sum(m => m.voice.nameSecondDone) / sum(m => m.voice.nameSecond))} | ${fp(sum(m => m.voice.countDone) / sum(m => m.voice.countReq))} | ${sum(m => m.voice.promptCut)} / ${sum(m => m.voice.promptLost)} | ${g.filter(m => m.voice.pauses > 0).length} | ${f1(mean(g.filter(m => m.voice.lat).map(m => m.voice.lat[0])))} / ${f1(Math.max(...g.filter(m => m.voice.lat).map(m => m.voice.lat[1])))} | ${top} |\n`;
  }
  // per-kind voice fate (all drivers except absent)
  const kinds = {}; for (const m of res) if (m.driver !== 'absent') for (const f of ['req', 'done', 'cut', 'drop', 'stale']) for (const c in m.voice[f]) { kinds[c] = kinds[c] || { req: 0, done: 0, cut: 0, drop: 0, stale: 0 }; kinds[c][f] += m.voice[f][c]; }
  md += '\n### Voice line fate by kind (all present drivers)\n\n| kind | requested | heard fully | cut | dropped | stale |\n|---|---|---|---|---|---|\n';
  for (const [c, v] of Object.entries(kinds).sort((a, b) => b[1].req - a[1].req)) md += `| ${c} | ${v.req} | ${fp(v.done / v.req)} | ${fp(v.cut / v.req)} | ${fp(v.drop / v.req)} | ${fp(v.stale / v.req)} |\n`;
  const agg = (f) => { const a = {}; for (const m of res) if (m.driver !== 'absent') for (const c in m.voice[f] || {}) a[c] = (a[c] || 0) + m.voice[f][c]; return a; };
  const cb = agg('cutBy'), db = agg('dropBy');
  const show = (o, pre) => Object.entries(o).filter(([k]) => pre.some(p => k.startsWith(p + '<'))).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ' ' + v).join(', ');
  md += `\nCut by (prompt / peek / hint / surprise / count-relevant name): ${show(cb, ['prompt', 'peek', 'hint', 'surprise', 'praise', 'idle'])}\n\nDropped by: ${show(db, ['prompt', 'peek', 'hint', 'surprise', 'praise', 'idle', 'home'])}\n`;
  // driver specifics
  const ds = (d) => res.filter(m => m.driver === d);
  const R = ds('rubR'); if (R.length) { const h = [0, 0, 0, 0]; let s = 0, cr = 0; for (const m of R) { m.drv.revealHist.forEach((x, i) => h[i] += x); s += m.drv.strokes; cr += m.drv.crossed; }
    md += `\n**rubR**: ${s} strokes over ${f1(cr / s)} blocks on average; revealed 0 / 1 / 2 / ≥3 blocks: ${h.map(x => fp(x / s)).join(' / ')}\n`; }
  const RT = ds('rubT'); if (RT.length) { let st = 0, i = 0, a = 0, sg = 0; for (const m of RT) { st += m.drv.strokes; i += m.drv.intended; a += m.drv.accidental; sg += m.drv.singles; }
    md += `\n**rubT**: ${st} swipes A → B; 2nd block = the one she aimed at ${fp(i / st)}, a different block crossed on the way ${fp(a / st)}, only 1 revealed ${fp(sg / st)}\n`; }
  const SA = ds('spamAll'); if (SA.length) { const bp = {}, fp2 = {}; for (const m of SA) { for (const k in m.drv.byPhase) bp[k] = (bp[k] || 0) + m.drv.byPhase[k]; for (const k in m.drv.flipsByPhase) fp2[k] = (fp2[k] || 0) + m.drv.flipsByPhase[k]; }
    md += `\n**spamAll** taps by phase: ${Object.entries(bp).map(([k, v]) => `${k} ${v} (flips ${fp2[k] || 0})`).join(', ')}\n`; }
  const AB = ds('absent'); if (AB.length) md += `\n**absent**: first idle nudge at ${f1(mean(AB.map(m => m.firstIdleAt).filter(x => x != null)))} s; idle gaps ${AB[0].idleGaps.map(x => x.toFixed(0)).join(', ')} s; auto-pause at ${f1(mean(AB.map(m => m.voice.pauseAt).filter(x => x != null)))} s game time (${AB.filter(m => m.voice.pauses).length}/${AB.length} paused); idle hints ${f1(mean(AB.map(m => m.idleHints)))}\n`;
  const DR = ds('dreamy'); if (DR.length) { const pa = DR.filter(m => m.voice.pauses > 0); md += `\n**dreamy** (plays, looks away 15–45 s after each move): ${pa.length}/${DR.length} sessions would auto-pause on her (5th idle line in one round), ${DR.reduce((s, m) => s + m.voice.pauses, 0)} pause events\n`; }
  const errs = res.filter(m => m.errors && m.errors.length); if (errs.length) md += `\nErrors: ${errs.length}; first: ${errs[0].errors[0]}\n`;
  const ob = res.filter(m => m.order && m.order.bad); if (ob.length) md += `\nOrder problems in ${ob.length} sessions; samples: ${ob.slice(0, 3).map(m => m.driver + ' ' + m.age + ': ' + m.order.samples.join('; ')).join(' | ')}\n`;
  return md;
}

if (!isMainThread) workerMain();
else if (require.main === module) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const name = get('name', 'base'), config = JSON.parse(get('config', '{}')), voice = JSON.parse(get('voice', '{}'));
  const patch = get('patch', '').split(',').filter(Boolean);
  const n = +get('n', 5), nb = +get('nb', 20), ages = get('ages', '3,4,5,6,7').split(',').map(Number);
  const drivers = get('drivers', DRV_BOTS.concat(DRV_KIDS, ['absent']).join(',')).split(',');
  const vps = get('vps', VPS.join(',')).split(',');
  const jobs = []; let seed = +get('seed0', 70000);
  for (const driver of drivers) for (const age of ages) for (const lang of ['en', 'vi']) for (const vp of vps) {
    const reps = driver === 'absent' ? 1 : driver.startsWith('bot') ? nb : n;
    for (let k = 0; k < reps; k++) jobs.push({ age, lang, vp, driver, seed: seed++, config, voice, maxTime: driver === 'absent' ? 400 : 1500 });
  }
  const t0 = Date.now(), res = []; let next = 0, left = Math.min(os.cpus().length, jobs.length);
  console.error(jobs.length + ' jobs');
  for (let k = 0, nw = left; k < nw; k++) {
    const wk = new Worker(__filename, { workerData: { patch } });
    const feed = () => wk.postMessage(next < jobs.length ? jobs[next++] : null);
    wk.on('message', (r) => {
      if (r === 'bye') { if (--left === 0) finish(); return; }
      if (r.error) { console.error(r.error); process.exit(3); }
      res.push(r); if (res.length % 250 === 0) console.error(res.length + '/' + jobs.length + ' ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s'); feed();
    });
    wk.on('error', (e) => { console.error(e); process.exit(2); });
    feed();
  }
  function finish() {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    res.sort((a, b) => a.seed - b.seed);
    const md = report(name, res, ((Date.now() - t0) / 1000).toFixed(0)) + `\nconfig ${JSON.stringify(config)} · voice ${JSON.stringify(voice)} · patch ${patch.join(',') || '–'}\n`;
    fs.writeFileSync(path.join(out, 'pt_tuk_kids_' + name + '.md'), md);
    fs.writeFileSync(path.join(out, 'pt_tuk_kids_' + name + '.json'), JSON.stringify(res.map(m => Object.assign({}, m, { rounds: m.rounds.length, roundsArr: undefined }))));
    console.log(md);
  }
}
module.exports = { report };
