#!/usr/bin/env node
// Tibo's Dino Lake Fishing — QA high-speed playtest (report-only; never edits game/js). Extends lib.js with more child models,
// a speech model that mirrors main.js's event → line rules (VOICE §2, real EN / VI text from i18n.js, 600 + 95 ms per char), and
// per-frame instrumentation (target speed, lagged-aim misses, critter / fish overlaps, target off-screen / under the bubble, idle
// backoff + auto-pause timing, Talk time, speech load).
//   node tests/sim/qa_playtest.js run  --tag base --n 100 [--ages 3,4,5,6,7] [--models a,b] [--config '{…}'] [--patch pokes]
//                                       [--part 0 --parts 2]      → tests/out/qa_sim/<tag>_<part>.json
//   node tests/sim/qa_playtest.js report --tag base [--tag2 prop]  → markdown tables on stdout
// Models: bot1 bot0.6 bot0.2 (TL.Bot) · typical slow3 (lib PROFILES) · lag3 (slow 3-year-old aiming where the fish WAS 0.3–0.6 s
// ago) · sloppy (taps 40–90 px off) · random (random water taps, ignores the question) · spammer (every 0.15 s anywhere) ·
// spamfish (every 0.15 s on a random fish) · idle (long no-input stretches) · tibo (taps only Tibo / critters).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const S = require('./lib');
const TL = S.TL;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'i18n.js'), 'utf8'), { filename: 'i18n.js' });
const I = TL.I18N;
const OUT = path.join(__dirname, '..', 'out', 'qa_sim'); fs.mkdirSync(OUT, { recursive: true });
const hyp = (x, y) => Math.sqrt(x * x + y * y);

/* ------------------------------------------------------------- sim-only code patches (to re-simulate proposed code changes) */
function applyPatch(name) {
  const P = TL.World.prototype;
  if (name === 'pokes' && !P._qaPatched) {
    // P1 proposal: in play, a Tibo poke / critter tap does NOT reset the idle clock, and every 2nd Tibo poke counts as "no progress"
    // (so a child who only pokes Tibo still gets the hint → assist). Mirrors a 6-line change in pointerDown / _pokeTibo.
    P._qaPatched = true;
    const down = P.pointerDown, poke = P._pokeTibo, tap = P._tapCritter;
    P.pointerDown = function (x, y) {
      const keep = { t: this._idleT, g: this._idleGap, n: this._idleN };
      const r = down.call(this, x, y);
      if ((r === 'tibo' || r === 'critter') && this.interactive) { this._idleT = keep.t; this._idleGap = keep.g; this._idleN = keep.n; }
      return r;
    };
    P._pokeTibo = function () {
      const keep = { t: this._idleT, g: this._idleGap, n: this._idleN }, play = this.interactive;
      const r = poke.call(this);
      if (play) { this._idleT = keep.t; this._idleGap = keep.g; this._idleN = keep.n; this._qaPokes = (this._qaPokes || 0) + 1; if (this._qaPokes % 2 === 0) this._noProgress(false); }
      return r;
    };
    void tap;
    // … and while the assist is armed a press on Tibo also catches the target ("Tibo helps"): a child who only pokes Tibo finishes
    const down2 = P.pointerDown;
    P.pointerDown = function (x, y) {
      const b = this.layout.tiboBox;
      if (!this._g && this.interactive && this.assistId && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        const a = this.memberById(this.assistId);
        if (a && (a.state === 'swim' || a.state === 'dart')) {
          this._g = { x0: x, y0: y, x, y, t: this.time, judged: true, kind: 'gesture', maxD: 0, result: 'member', soft: false, contacted: true };
          this.finger.down = true; this._touch(); this._contact(a, this._g, 'tibo'); return 'member';
        }
      }
      return down2.call(this, x, y);
    };
  }
  if (name === 'spam' && !P._qaSpam) {
    // P2 proposal `wrongCooldown` (s): a fish press within this time after a counted wrong tap only wiggles (not judged, not a miss)
    P._qaSpam = true;
    const contact = P._contact;
    P._contact = function (m, g, from) {
      const cd = this.cfg.wrongCooldown || 0;
      if (from === undefined && this.time - (this._qaLastWrong == null ? -1e9 : this._qaLastWrong) < cd) {
        g.contacted = true; g.judged = true; m.qV += kickFor(this.cfg.brushKick, this.cfg.squashOmega, this.cfg.squashZeta);
        this._emit({ type: 'wiggle', id: m.id, repeat: true, x: m.x, y: m.y }); return 'member';
      }
      const r = contact.call(this, m, g, from);
      if (!m.target && from === undefined) this._qaLastWrong = this.time;
      return r;
    };
  }
  if (name === 'stars' && !P._qaStars) {
    // P3 proposal `assistMaxStars`: an assisted round gives at most this many stars (now 2)
    P._qaStars = true;
    const done = P._roundDone;
    P._roundDone = function (m) {
      const n0 = this.events.length; done.call(this, m);
      const cap = this.cfg.assistMaxStars == null ? 2 : this.cfg.assistMaxStars;
      if (this._roundAssisted && this.roundStars > cap) {
        const d = this.roundStars - cap; this.roundStars = cap; this.stars -= d; this.levelStars -= d;
        for (let i = n0; i < this.events.length; i++) if (this.events[i].type === 'roundDone') this.events[i].stars = cap;
      }
    };
  }
}
function kickFor(peak, w, z) { const s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }

/* ------------------------------------------------------------- speech model (main.js rules) */
class Speech {
  constructor(w, lang, seed) { this.w = w; this.lang = lang; this.r = new TL.RNG(seed); this.cur = null; this.q = []; this.promptUntil = 0; this.pending = null;
    this.promptStart = 0; this.lastWrong = -1e9; this.lastPraise = -1e9; this.lastCritter = -1e9; this.hintBySay = false; this.countSaid = false;
    this.lastRound = null; this.relN = 0; this.lastEnd = -1e9; this.dropN = 0; this.roundMissed = false; this.lastPrompt = ''; this.lastAsk = null; this.talkGate = 1e9; this.talkText = '';
    this.st = { lines: 0, dropped: 0, cut: 0, busy: 0, playT: 0, playBusy: 0, maxSilence: 0, silence: 0, byKind: {} }; }
  now() { return this.w.time; }
  T(k, p) { try { return I.t(this.lang, k, p || {}, () => this.r.next()) || k; } catch (e) { return k; } }
  dur(t) { return (300 + 75 * (t || '').length) / 1000; }      // spoken length (≈ 13 chars/s at rate 0.9)
  lineMs(t) { return (600 + 95 * (t || '').length) / 1000; }   // main.js's protection estimate
  speaking() { return !!this.cur; }
  // proposal: a droppable line (release / lily / joy / bite / poke giggle) only after quietGap s of silence and ≤ maxDrop per round
  quiet() { const o = Speech.opt; if (this.cur) return false; if (o.quietGap && this.now() - this.lastEnd < o.quietGap) return false; if (o.maxDrop != null && this.dropN >= o.maxDrop) return false; return true; }
  canInterrupt() { return this.now() > this.promptUntil; }
  say(text, kind, o) {
    o = o || {}; if (!text) return;
    const it = { text, kind, priority: !!o.priority, prompt: !!o.prompt };
    if (o.interrupt) { if (this.cur) { this.st.cut++; const k = this.cur.kind + '>' + kind; this.st.cuts = this.st.cuts || {}; this.st.cuts[k] = (this.st.cuts[k] || 0) + 1; } this.st.dropped += this.q.length; this.cur = null; this.q = [it]; this._kick(); return; }
    this.q.push(it);
    while (this.q.length > 2) { let idx = this.q.findIndex((q, i) => i < this.q.length - 1 && !q.priority); if (idx < 0) idx = 0; this.q.splice(idx, 1); this.st.dropped++; }
    this._kick();
  }
  _kick() {
    if (this.cur || !this.q.length) return;
    this.cur = this.q.shift(); this.cur.end = this.now() + this.dur(this.cur.text); this.st.lines++; this.st.byKind[this.cur.kind] = (this.st.byKind[this.cur.kind] || 0) + 1;
    if (this.pending && this.cur.text === this.pending) { this.promptStart = this.now(); this.promptUntil = this.now() + this.lineMs(this.cur.text); this.pending = null; }
    if (this.talkText && this.cur.text === this.talkText) { this.talkGate = this.now() + 1; this.talkText = ''; }
  }
  tick(dt) {
    if (this.cur && this.now() >= this.cur.end) { this.cur = null; this.lastEnd = this.now(); this._kick(); }
    const play = this.w.interactive;
    if (this.cur) { this.st.busy += dt; this.st.silence = 0; } else if (play) { this.st.silence += dt; this.st.maxSilence = Math.max(this.st.maxSilence, this.st.silence); }
    if (play) { this.st.playT += dt; if (this.cur) this.st.playBusy += dt; }
  }
  speakPrompt(txt, kind, o) { this.pending = txt; this.promptStart = this.now(); this.promptUntil = this.now() + 6 + this.lineMs(txt); this.say(txt, kind, Object.assign({ priority: true }, o)); }
  protect(txt) { this.promptUntil = Math.max(this.promptUntil, this.now() + this.lineMs(txt)); }
  ev2(e) { const c = this.w.cur || {}; return Object.assign({ topic: this.w.topic, promptKey: c.promptKey, params: c.params, rule: c.rule }, e); }
  on(e) {
    const w = this.w, L = this.lang;
    try {
      switch (e.type) {
        case 'level': this.say(this.T('ui.chapter', { n: e.level + 1 }) + '. ' + this.T('topic.' + e.topic), 'level', { interrupt: this.canInterrupt(), priority: !this.canInterrupt() }); this.say(this.T('weather.' + (e.weather % 4)), 'weather'); break;
        case 'round': this.dropN = 0; break;
        case 'ask': { this.lastAsk = e; this.roundMissed = false; this.hintBySay = false; this.countSaid = false; const txt = I.ask(L, e.promptKey, e.params, { first: !!e.first && e.round === 0 }); this.lastPrompt = txt; this.speakPrompt(txt, 'ask'); break; }
        case 'right': { this.promptUntil = 0; this.pending = null; const txt = I.sayRight(L, this.ev2(e)); this.say(txt, 'right', { interrupt: this.canInterrupt() }); this.protect(txt); break; }
        case 'bite': if (this.quiet() && this.canInterrupt() && ++this.dropN) this.say(this.T('bite'), 'bite'); break;
        case 'count': if (!this.countSaid) { this.countSaid = true; this.say(I.sayCountRun(L, e.n || 1), 'count', { priority: true }); this.promptUntil = this.now() + 0.9 + 0.65 * (e.n || 1); } break;
        case 'roundDone': this.lastRound = { round: e.round, stars: e.stars, missed: this.roundMissed || e.misses > 0 }; break;
        case 'dive': if (this.quiet() && this.canInterrupt() && (!Speech.opt.releaseEvery || !this.lastRound || this.lastRound.missed || (++this.relN) % Speech.opt.releaseEvery === 1)) { this.dropN++; this.say(this.T('release'), 'release'); } break;
        case 'lily': if (!e.auto && (w.round % 4 === 0 || this.quiet())) { this.dropN++; this.say(this.T('lily'), 'lily'); } break;
        case 'joy': if (e.i === 0) { const lr = this.lastRound || {}, last = lr.round % 4 === 3;
          if ((lr.missed || last) && this.now() - this.lastPraise > 1.2) { this.lastPraise = this.now(); this.say(this.T(lr.stars >= 3 ? 'great' : 'praise'), 'praise'); }
          else if (this.quiet() && this.canInterrupt()) { this.dropN++; this.say(this.T('joy'), 'joy'); } } break;
        case 'pondFull': this.say(this.T('pond'), 'pond'); break;
        case 'wrong': this.roundMissed = true; if (this.now() - this.lastWrong > 1.5) { this.lastWrong = this.now(); const m = w.memberById(e.id), ee = this.ev2(Object.assign({}, e, { thing: (m && m.thing) || e.thing }));
          const txt = e.hint ? I.sayWrongHint(L, ee) : I.sayWrong(L, ee); if (e.hint) this.hintBySay = true; this.say(txt, 'wrong', { interrupt: this.canInterrupt() }); this.protect(txt); } break;
        case 'hint': if (!e.idle && !this.hintBySay) this.say(this.T('hint'), 'hint', { priority: true }); this.hintBySay = false; break;
        case 'idle': if (e.n <= 4) this.say(this.T('idle') + ' ' + this.lastPrompt, 'idle'); break;
        case 'pokeTibo': if (e.busy || !w.interactive || !this.lastAsk) { if (!this.speaking() && this.canInterrupt()) this.say(this.T('tibo.poke'), 'poke'); break; }
          if (this.speaking() && this.cur.text === this.lastPrompt) break;
          if (this.now() - this.promptStart > 3 && (!this.pending || this.now() - this.promptStart > 6)) { this.promptUntil = 0; this.speakPrompt(this.lastPrompt, 'repeat', { interrupt: true }); } break;
        case 'critter': if (this.canInterrupt()) this.say(this.T('surprise.' + e.kind), 'surprise'); break;
        case 'critterTap': if (this.now() - this.lastCritter > 2 && this.canInterrupt()) { this.lastCritter = this.now(); this.say(this.T('critter.' + e.kind), 'critter', { interrupt: !this.speaking() }); } break;
        case 'talk': { const tk = e.talk || w.talk; this.talkGate = 1e9; this.talkText = this.T('talk.intro') + ' ' + this.T(tk.promptKey, tk.params); this.speakPrompt(this.talkText, 'talk'); break; }
        case 'talkAsk': { const tk = e.talk || w.talk; if (e.n <= 3) this.say(this.T(tk.promptKey, tk.params), 'talkAsk', { priority: true, interrupt: true }); break; }
        case 'talkResult': this.say(e.correct ? this.T('talk.right') : 'It is that one! Good try!', 'talkResult', { interrupt: true }); break;
        case 'levelDone': this.speakPrompt(this.T('great'), 'great'); break;
        case 'sessionDone': this.say(this.T('party'), 'party', { interrupt: this.canInterrupt(), priority: !this.canInterrupt() }); this.say(this.T('session.done', { stars: e.stars }), 'done'); break;
      }
    } catch (err) { this.say('x'.repeat(30), e.type); }
  }
}

Speech.opt = {};   // --speech '{"releaseEvery": 2}': main.js rule proposals
/* ------------------------------------------------------------- child models */
const U = (r, a) => r.float(a[0], a[1]);
class Hist {   // the kid's own memory of where each fish was (lib's world history keeps only 0.25 s)
  constructor() { this.h = {}; }
  rec(w) { for (const m of w.members) { const a = this.h[m.id] || (this.h[m.id] = []); a.push({ t: w.time, x: m.x, y: m.y }); while (a.length && a[0].t < w.time - 1.2) a.shift(); } }
  at(m, t) { const a = this.h[m.id]; if (!a || !a.length) return { x: m.x, y: m.y }; if (t <= a[0].t) return a[0]; for (let i = a.length - 1; i > 0; i--) if (a[i - 1].t <= t) { const p = a[i - 1], q = a[i], u = q.t > p.t ? (t - p.t) / (q.t - p.t) : 1; return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }; } return a[a.length - 1]; }
}
const SWIM = { swim: 1, dart: 1 };
class Child {
  // p: {skill, listen, think[], between[], lag[], aim (× r) | off[] (px), hold[], followHint, pDistract, distract[], pSoft, pCritter, talk[], talkSkill,
  //     mode: 'aim'|'random'|'spam'|'spamfish'|'tibo', every[], idleP, idleLen[]}
  constructor(w, p, seed, sp) { this.w = w; this.p = p; this.r = new TL.RNG(seed); this.sp = sp; this.H = new Hist(); this.t = -1; this.g = null; this.key = ''; this.critterDone = true; this.talkT = -1; this.idleUntil = -1;
    this.aim = { n: 0, hit: 0, wrong: 0, soft: 0, critter: 0, brush: 0, assist: 0, lagOnly: 0 }; this.taps = 0; }
  onEvent(e) {
    const p = this.p;
    if (e.type === 'ask' && e.first) { if (p.mode === 'aim') this.t = p.listen + U(this.r, p.think); if (p.idleP && this.r.chance(p.idleP)) this.idleUntil = this.w.time + U(this.r, p.idleLen); }
    else if (e.type === 'wrong' && p.mode === 'aim') this.t = U(this.r, p.between) + 0.8;
    else if (e.type === 'hint' && p.mode === 'aim') this.t = Math.min(this.t < 0 ? 1e9 : this.t, 1.2 + this.r.float(0, 1));
  }
  _press(x, y, aimed) {
    const w = this.w, n0 = w.events.length, res = w.pointerDown(x, y); this.taps++;
    this.g = { x, y, T: U(this.r, this.p.hold), t: 0 };
    if (aimed) {
      const A = this.aim, ev = w.events.slice(n0).map(e => e.type); A.n++;
      if (ev.includes('assist')) A.assist++;
      else if (ev.includes('right')) { A.hit++; const tg = aimed; if (hyp(x - tg.x, y - tg.y) > w._hitR(tg)) A.lagOnly++; }
      else if (ev.includes('wrong') || ev.includes('wiggle') && res === 'member') A.wrong++;
      else if (res === 'critter') A.critter++;
      else if (res === 'brush') A.brush++;
      else A.soft++;
    }
    return res;
  }
  step(dt) {
    const w = this.w, p = this.p, r = this.r, L = w.layout;
    this.H.rec(w);
    if (this.g) { this.g.t += dt; if (this.g.t >= this.g.T) { w.pointerUp(this.g.x, this.g.y); this.g = null; } return; }
    if (w.state === 'talk') {
      if (w.talkAnswered || !w.talk) { this.talkT = -1; return; }
      if (p.mode === 'tibo') return;   // never answers (Talk gives up by itself)
      if (this.idleUntil > w.time) return;
      if (this.talkT < 0) this.talkT = p.mode === 'spam' || p.mode === 'spamfish' ? 0.15 : U(r, p.talk);
      this.talkT -= dt;
      if (this.talkT <= 0) {
        this.talkT = p.mode === 'spam' || p.mode === 'spamfish' ? 0.15 : -1;
        if (!(w.talkOpen() && w.time >= this.sp.talkGate)) return;   // main ignores choice taps until the question started + 1 s
        let pick = w.talk.answer;
        const sk = p.mode === 'aim' ? p.talkSkill : 1 / w.talk.choices.length;
        if (!w.talk.glowAnswer && !r.chance(sk)) { const o = w.talk.choices.filter(c => c.id !== w.talk.answer); if (o.length) pick = r.pick(o).id; }
        else if (p.mode !== 'aim' && w.talk.glowAnswer && !r.chance(0.5)) pick = r.pick(w.talk.choices).id;
        w.talkAnswer(pick);
      }
      return;
    }
    if (w.state !== 'round' && w.state !== 'roundDone') return;
    if (p.mode === 'spam' || p.mode === 'spamfish' || p.mode === 'random' || p.mode === 'tibo') {
      if (this.t < 0) this.t = U(r, p.every);
      this.t -= dt; if (this.t > 0) return; this.t = U(r, p.every);
      if (p.mode === 'spam') { this._press(r.float(L.ins.left + 10, L.W - L.ins.right - 10), r.float(L.ins.top + 10, L.H - L.ins.bottom - 10)); return; }
      if (p.mode === 'random') { this._press(r.float(L.swim.x0, L.swim.x1), r.float(L.surfaceY + 20, L.groundY - 20)); return; }
      if (p.mode === 'tibo') { const c = w.critterHit(); if (c && r.chance(0.5)) this._press(c.x, c.y); else { const b = w.tiboHit(); this._press(b.cx + r.float(-20, 20), b.cy + r.float(-30, 30)); } return; }
      const o = w.members.filter(m => SWIM[m.state] || m.state === 'enter');
      if (o.length) { const m = r.pick(o), s = this.H.at(m, w.time - 0.2); this._press(s.x + r.float(-20, 20), s.y + r.float(-15, 15), m.target && w.interactive ? m : null); }
      return;
    }
    // aim mode
    if (this.idleUntil > w.time) return;
    const key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.critterDone = !r.chance(p.pCritter); }
    const ch = w.critterHit();
    if (ch && !this.critterDone && r.chance(0.02)) { this.critterDone = true; this._press(ch.x, ch.y); return; }
    if (!w.interactive) return;
    if (this.t < 0) this.t = p.listen + U(r, p.think);
    this.t -= dt; if (this.t > 0) return;
    if (r.chance(p.pDistract)) { this.t = U(r, p.distract); return; }
    this.t = U(r, p.between);
    if (r.chance(p.pSoft)) { for (let k = 0; k < 8; k++) { const x = r.float(L.swim.x0, L.swim.x1), y = r.float(L.surfaceY + 20, L.groundY - 20); if (!w._memberNear(x, y).m) { this._press(x, y); return; } } }
    const tg = w.target, help = !!w.hintHand || !!w.assistId;
    let m = tg;
    if (!(help ? r.chance(p.followHint) : r.chance(p.skill))) { const o = w.members.filter(q => !q.target && SWIM[q.state]); if (o.length) m = r.pick(o); }
    if (!m) return;
    const lag = Array.isArray(p.lag) ? U(r, p.lag) : p.lag, seen = this.H.at(m, w.time - lag), rr = w._hitR(m);
    let x, y;
    if (p.off) { const d = U(r, p.off), a = r.float(0, Math.PI * 2); x = seen.x + d * Math.cos(a); y = seen.y + d * Math.sin(a); }
    else { x = seen.x + r.float(-p.aim, p.aim) * rr; y = seen.y + r.float(-p.aim, p.aim) * rr * 0.7; }
    this._press(x, y, m === tg ? tg : null);
  }
}
const typ = a => S.PROFILES.typical(a);
const MODELS = {
  typical: a => Object.assign(typ(a), { mode: 'aim' }),
  slow3: a => Object.assign(S.PROFILES.slow3(a), { mode: 'aim' }),
  lag3: a => Object.assign(S.PROFILES.slow3(a), { mode: 'aim', lag: [0.3, 0.6], listen: 3.2, think: [2.5, 6] }),
  sloppy: a => Object.assign(typ(a), { mode: 'aim', off: [40, 90] }),
  random: a => Object.assign(typ(a), { mode: 'random', every: [0.8, 2.5], hold: [0.05, 0.25], talk: [1, 3] }),
  spammer: a => Object.assign(typ(a), { mode: 'spam', every: [0.15, 0.15], hold: [0.04, 0.08] }),
  spamfish: a => Object.assign(typ(a), { mode: 'spamfish', every: [0.15, 0.15], hold: [0.04, 0.08] }),
  idle: a => Object.assign(typ(a), { mode: 'aim', idleP: 0.3, idleLen: [40, 150] }),
  tibo: a => Object.assign(typ(a), { mode: 'tibo', every: [1.5, 4], hold: [0.05, 0.2] })
};
class BotKid { constructor(w, skill, seed) { this.b = new TL.Bot(w, { skill, seed }); this.aim = null; } onEvent(e) { this.b.onEvent(e); } step(dt) { this.b.step(dt); } }

/* ------------------------------------------------------------- one instrumented session */
function runSession(o) {
  const w = S.mkWorld(o), sp = new Speech(w, o.lang, o.seed + 5);
  const kid = /^bot/.test(o.model) ? new BotKid(w, +o.model.slice(3), o.seed + 1) : new Child(w, MODELS[o.model](o.age), o.seed + 1, sp);
  const dt = 1 / 30, cap = o.cap || 1500;
  const R0 = { done: false, rounds: [], chapters: [], talks: [], idle: [], pauseAt: [], f: { play: 0, tgtOff: 0, tgtUnder: 0, crit: 0, critOv: 0, fishOv: 0, speed: 0 }, nan: false };
  w.newSession();
  let R = null, chap0 = 0, talk0 = 0, lastTouch = 0, t = 0;
  const L = () => w.layout;
  const down0 = w.pointerDown; w.pointerDown = function (x, y) { lastTouch = w.time; return down0.call(w, x, y); };
  while (w.state !== 'sessionDone' && t < cap) {
    kid.step(dt); w.update(dt); t += dt; sp.tick(dt);
    for (const e of w.drainEvents()) {
      kid.onEvent(e); sp.on(e);
      switch (e.type) {
        case 'level': chap0 = w.time; break;
        case 'round': R = { t0: w.time, misses: 0, hint: 0, idleHint: 0, assist: 0, armed: 0, stars: 0, play0: 0, play: 0, n: e.n }; break;
        case 'ask': if (R && e.first) R.play0 = w.time; break;
        case 'right': if (R) R.play = w.time - R.play0; break;
        case 'wrong': if (R) R.misses++; break;
        case 'hint': if (R) { R.hint++; if (e.idle) R.idleHint++; } break;
        case 'assistArmed': if (R) R.armed++; break;
        case 'assist': if (R) R.assist++; break;
        case 'idle': R0.idle.push({ n: e.n, since: w.time - Math.max(lastTouch, R ? R.play0 : 0) }); if (e.n === 5) R0.pauseAt.push(w.time - Math.max(lastTouch, R ? R.play0 : 0)); break;
        case 'roundDone': if (R) { R.stars = e.stars; R.s = w.time - R.t0; R0.rounds.push(R); R = null; } break;
        case 'talk': R0.chapters.push(w.time - chap0); talk0 = w.time; break;
        case 'talkResult': R0.talks.push({ s: w.time - talk0, auto: e.auto, ok: e.correct }); break;
      }
    }
    if (w.interactive) {
      const F = R0.f, tg = w.target, lay = L();
      F.play++;
      if (tg) {
        const h = tg._hist, n = h.length; if (n > 1) F.speed += hyp(h[n - 1].x - h[0].x, h[n - 1].y - h[0].y) / Math.max(1e-3, h[n - 1].t - h[0].t);
        const len = w._len(tg) / 2;
        if (tg.x - len * 0.5 < lay.ins.left || tg.x + len * 0.5 > lay.W - lay.ins.right || tg.y > lay.H - lay.ins.bottom) F.tgtOff++;
        if (lay.keep.some(b => tg.x > b.x && tg.x < b.x + b.w && tg.y > b.y && tg.y < b.y + b.h)) F.tgtUnder++;
        const ch = w.critterHit();
        if (ch) { F.crit++; if (hyp(ch.x - tg.x, ch.y - tg.y) < ch.r + w._hitR(tg)) F.critOv++; }
      }
      const sw = w.members.filter(m => SWIM[m.state]);
      let ov = false;
      for (let i = 0; i < sw.length && !ov; i++) for (let j = i + 1; j < sw.length; j++) {
        const a = sw[i], b = sw[j], ha = w._effSize(a), hb = w._effSize(b);
        if (Math.abs(a.x - b.x) < 0.4 * (w._len(a) + w._len(b)) && Math.abs(a.y - b.y) < 0.36 * (ha + hb)) { ov = true; break; }
      }
      if (ov) F.fishOv++;
    }
    if (R && w.time - R.t0 > 300 && o.model !== 'tibo') break;
  }
  for (const m of w.members) if (![m.x, m.y, m.rot].every(Number.isFinite)) R0.nan = true;
  R0.done = w.state === 'sessionDone'; R0.min = t / 60; R0.stars = w.stars; R0.speech = sp.st; R0.aim = kid.aim; R0.stuckOpen = R ? w.time - R.t0 : 0;
  return R0;
}

/* ------------------------------------------------------------- CLI */
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const cmd = args[0];
const ALL = 'bot1,bot0.6,bot0.2,typical,slow3,lag3,sloppy,random,spammer,spamfish,idle,tibo';
if (cmd === 'run') {
  const N = +get('n', 100), tag = get('tag', 'base'), part = +get('part', 0), parts = +get('parts', 1);
  const config = JSON.parse(get('config', '{}')), patch = get('patch', '');
  if (patch) patch.split(',').forEach(applyPatch);
  Speech.opt = JSON.parse(get('speech', '{}'));
  const ages = get('ages', '3,4,5,6,7').split(',').map(Number), models = get('models', ALL).split(',');
  const VPS = Object.keys(S.VIEWPORTS), out = [], t0 = Date.now();
  let k = 0;
  for (let i = 0; i < N; i++) for (const model of models) for (const age of ages) {
    if ((k++) % parts !== part) continue;
    const s = runSession({ model, age, seed: 7919 * age + 31 * i + 3, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config, cap: model === 'tibo' ? 700 : 1500 });
    s.model = model; s.age = age; s.vp = VPS[i % VPS.length]; out.push(s);
    if (out.length % 25 === 0) fs.writeFileSync(path.join(OUT, `${tag}_${part}.json`), JSON.stringify(out));   // partial results
  }
  fs.writeFileSync(path.join(OUT, `${tag}_${part}.json`), JSON.stringify(out));
  console.log(`${tag} part ${part}/${parts}: ${out.length} sessions in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else if (cmd === 'report') {
  const load = tag => [].concat(...fs.readdirSync(OUT).filter(f => f.startsWith(tag + '_') && /_\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))));
  const ss = load(get('tag', 'base'));
  const pct = S.pct, mean = S.mean, f1 = S.f1, f0 = x => (+x).toFixed(0), P = (a, b) => (100 * a / Math.max(1, b)).toFixed(1);
  const cells = {};
  for (const s of ss) (cells[s.model + '|' + s.age] = cells[s.model + '|' + s.age] || []).push(s);
  const which = get('table', 'all');
  const order = Object.keys(cells).sort((a, b) => ALL.split(',').indexOf(a.split('|')[0]) - ALL.split(',').indexOf(b.split('|')[0]) || +a.split('|')[1] - +b.split('|')[1]);
  console.log(`sessions: ${ss.length}\n`);
  if (which === 'all' || which === 'flow') {
    console.log('| model | age | n | done | session min med (p90, max) | chapter s med [p10–p90] | round s med (p90) | play s med (p90) | rounds/session | misses/round | rounds w/ hint % | assisted % | stars 3/2/1 % | stuck >120 s | NaN |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of order) { const A = cells[c], [m, a] = c.split('|'), rd = [].concat(...A.map(s => s.rounds)), ch = [].concat(...A.map(s => s.chapters)), mins = A.map(s => s.min);
      const st = [3, 2, 1].map(k => P(rd.filter(r => r.stars === k).length, rd.length)), stuck = rd.filter(r => r.s > 120).length + A.filter(s => s.stuckOpen > 120).length;
      console.log(`| ${m} | ${a} | ${A.length} | ${A.filter(s => s.done).length} | ${f1(pct(mins, .5))} (${f1(pct(mins, .9))}, ${f1(Math.max(...mins))}) | ${f1(pct(ch, .5))} [${f1(pct(ch, .1))}–${f1(pct(ch, .9))}] | ${f1(pct(rd.map(r => r.s), .5))} (${f1(pct(rd.map(r => r.s), .9))}) | ${f1(pct(rd.map(r => r.play), .5))} (${f1(pct(rd.map(r => r.play), .9))}) | ${f1(mean(A.map(s => s.rounds.length)))} | ${mean(rd.map(r => r.misses)).toFixed(2)} | ${P(rd.filter(r => r.hint).length, rd.length)} | ${P(rd.filter(r => r.assist).length, rd.length)} | ${st.join(' / ')} | ${stuck} | ${A.filter(s => s.nan).length} |`); }
    console.log('');
  }
  if (which === 'all' || which === 'aim') {
    console.log('| model | age | target px/s (play) | target-aimed taps | hit % | lag-only hits % (outside r now, saved by 0.12 s history) | → other fish % | → water % | → critter % | assist picks % | critter tappable (% play) | critter overlaps target (% of its time) | 2 fish bodies overlap (% play) | target past screen edge (% play) | target under bubble/HUD (% play) |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of order) { const A = cells[c], [m, a] = c.split('|'), F = {}; for (const s of A) for (const k in s.f) F[k] = (F[k] || 0) + s.f[k];
      const Am = { n: 0, hit: 0, wrong: 0, soft: 0, critter: 0, brush: 0, assist: 0, lagOnly: 0 }; for (const s of A) if (s.aim) for (const k in Am) Am[k] += s.aim[k];
      console.log(`| ${m} | ${a} | ${f0(F.speed / Math.max(1, F.play))} | ${Am.n} | ${P(Am.hit, Am.n)} | ${P(Am.lagOnly, Am.hit)} | ${P(Am.wrong, Am.n)} | ${P(Am.soft + Am.brush, Am.n)} | ${P(Am.critter, Am.n)} | ${P(Am.assist, Am.n)} | ${P(F.crit, F.play)} | ${P(F.critOv, F.crit)} | ${P(F.fishOv, F.play)} | ${P(F.tgtOff, F.play)} | ${P(F.tgtUnder, F.play)} |`); }
    console.log('');
  }
  if (which === 'all' || which === 'help') {
    console.log('| model | age | hints/round | idle-hints/round | assist armed % rounds | idle events/session | idle n=1..5 at s since last touch (median) | auto-pause (n=5) per session | Talk s med (p90) | Talk auto give-up % | Talk right % |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of order) { const A = cells[c], [m, a] = c.split('|'), rd = [].concat(...A.map(s => s.rounds)), id = [].concat(...A.map(s => s.idle)), tk = [].concat(...A.map(s => s.talks));
      const byN = [1, 2, 3, 4, 5].map(n => { const v = id.filter(q => q.n === n).map(q => q.since); return v.length ? f0(pct(v, .5)) : '–'; }).join(' / ');
      console.log(`| ${m} | ${a} | ${mean(rd.map(r => r.hint)).toFixed(2)} | ${mean(rd.map(r => r.idleHint)).toFixed(2)} | ${P(rd.filter(r => r.armed).length, rd.length)} | ${f1(mean(A.map(s => s.idle.length)))} | ${byN} | ${(mean(A.map(s => s.pauseAt.length))).toFixed(2)} | ${f1(pct(tk.map(q => q.s), .5))} (${f1(pct(tk.map(q => q.s), .9))}) | ${P(tk.filter(q => q.auto).length, tk.length)} | ${P(tk.filter(q => q.ok).length, tk.length)} |`); }
    console.log('');
  }
  if (which === 'all' || which === 'speech') {
    console.log('| model | age | lines / min | spoken % of session | spoken % of play time | lines cut | lines dropped | longest silence in play s (p90) | per session: ask / right / wrong / hint / idle / repeat / praise / lily / count / other | most cut (cut>by, per session) |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    for (const c of order) { const A = cells[c], [m, a] = c.split('|'), sp = A.map(s => s.speech), mins = mean(A.map(s => s.min));
      const K = {}; for (const s of sp) for (const k in s.byKind) K[k] = (K[k] || 0) + s.byKind[k] / A.length;
      const main = ['ask', 'right', 'wrong', 'hint', 'idle', 'repeat', 'praise', 'lily', 'count'], other = Object.keys(K).filter(k => !main.includes(k)).reduce((x, k) => x + K[k], 0);
      console.log(`| ${m} | ${a} | ${f1(mean(sp.map(s => s.lines)) / mins)} | ${f0(100 * mean(sp.map(s => s.busy)) / (mins * 60))} | ${f0(100 * mean(sp.map(s => s.playBusy / Math.max(1, s.playT))))} | ${f1(mean(sp.map(s => s.cut)))} | ${f1(mean(sp.map(s => s.dropped)))} | ${f1(pct(sp.map(s => s.maxSilence), .9))} | ${main.map(k => f1(K[k] || 0)).join(' / ')} / ${f1(other)} | ${(() => { const C = {}; for (const q of sp) for (const k in (q.cuts || {})) C[k] = (C[k] || 0) + q.cuts[k] / A.length; return Object.keys(C).sort((x, y) => C[y] - C[x]).slice(0, 3).map(k => k + ' ' + f1(C[k])).join(', '); })()} |`); }
  }
}
module.exports = { runSession, MODELS, Speech };
