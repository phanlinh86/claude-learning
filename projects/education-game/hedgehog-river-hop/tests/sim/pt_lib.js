// Nim's River Hop — playtester's harness (report-only; never edits game/). Child models + a speech-timing simulator that
// ports main.js's speech policy (VOICE §1.1) onto a fake NH.Voice queue (voice.js: 1 speaking + ≤ 2 waiting, non-priority
// lines > 5 s old skipped, interrupt = flush + cancel + speak after 90 ms on iOS). Line duration = 600 + 95 ms × chars
// (rate 0.9, VOICE.md) × `voiceK` (1 = the estimate main.js uses; > 1 = a slower real voice).
'use strict';
const fs = require('fs');
const vm = require('vm');
const L = require('./lib');
const NH = L.NH;
if (!NH.I18N) vm.runInThisContext(fs.readFileSync(require('../unit/load').resolve('i18n.js'), 'utf8'), { filename: 'i18n.js' });
const I = NH.I18N;
const lineMs = t => 600 + 95 * (t || '').length;

/* ------------------------------------------------------------------ fake NH.Voice (voice.js queue semantics) */
class FakeVoice {
  constructor(clock, voiceK, onStart) { this.clock = clock; this.k = voiceK || 1; this.onStart = onStart; this.cur = null; this.q = []; this.kickAt = -1; this.log = []; }
  now() { return this.clock(); }
  say(text, opt, kind, meta) {
    opt = opt || {};
    const it = { text, kind, meta: meta || {}, t: this.now(), priority: !!opt.priority, out: null, start: -1, end: -1, then: opt.then };
    this.log.push(it);
    if (opt.interrupt) {
      for (const q of this.q) this._fin(q, 'flushed', kind);
      this.q = [];
      if (this.cur) this._fin(this.cur, 'cut', kind);
      this.cur = null;
      this.q.push(it); this.kickAt = this.now() + 90;
      return it;
    }
    this.q.push(it);
    while (this.q.length > 2) {
      let idx = -1;
      for (let i = 0; i < this.q.length - 1; i++) if (!this.q[i].priority) { idx = i; break; }
      if (idx < 0 && this._keepPrompt) for (let i = 0; i < this.q.length - 1; i++) if (!/^prompt/.test(this.q[i].kind)) { idx = i; break; }
      if (idx < 0) idx = this._keepPrompt && /^prompt/.test(this.q[0].kind) && this.q.length > 1 ? 1 : 0;
      this._fin(this.q.splice(idx, 1)[0], 'dropped', kind);
    }
    if (!this.cur && this.kickAt < 0) this.kickAt = this.now();
    return it;
  }
  _fin(it, out, by) { if (it.out) return; it.out = out; it.by = by; it.endAt = this.now(); if (it.then) it.then(out); }
  speaking() { return !!this.cur; }
  stop() { for (const q of this.q) this._fin(q, 'flushed', 'stop'); this.q = []; if (this.cur) this._fin(this.cur, 'cut', 'stop'); this.cur = null; }
  tick() {
    const n = this.now();
    if (this.cur && n >= this.cur.end) { const c = this.cur; this.cur = null; this._fin(c, 'end'); if (this.kickAt < 0) this.kickAt = n; }
    if (!this.cur && this.kickAt >= 0 && n >= this.kickAt) {
      this.kickAt = -1;
      while (this.q.length) {
        const it = this.q.shift();
        if (!it.priority && n - it.t > 5000) { this._fin(it, 'stale'); continue; }
        it.start = n; it.end = n + lineMs(I.speech ? I.speech(this.lang || 'en', it.text) : it.text) * this.k; this.cur = it;
        if (this.onStart) this.onStart(it);
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ main.js speech policy (VOICE §1.1), ported line by line */
class SpeechSim {
  constructor(w, lang, rng, voiceK) {
    this.w = w; this.lang = lang; this.r = rng;
    this.V = new FakeVoice(() => w.time * 1000, voiceK, it => this._onStart(it)); this.V.lang = lang;
    this.promptUntil = 0; this.countUntil = 0; this.pendingPrompt = null; this.promptStart = 0; this.promptQueued = false;
    this.lastWrongSay = -1e9; this.lastPraise = -1e9; this.lastTapSay = -1e9; this.lastAhead = -1e9; this.idleSaid = 0;
    this.lastAsk = null; this.lastPromptText = ''; this.lastSpoken = ''; this.roundMissed = false; this.hintBySay = false; this.riseSaid = -1; this.wipeN = 0;
  }
  now() { return this.w.time * 1000; }
  T(key, p) { return I.t(this.lang, key, p || {}, () => this.r.next()); }
  speak(text, opt, kind, meta) { if (!text) return null; this.lastSpoken = text; return this.V.say(text, opt, kind, meta); }
  speaking() { return this.V.speaking(); }
  canInterrupt() { const n = this.now(); return n > this.promptUntil && n > this.countUntil; }
  speakPrompt(txt, opt, kind, meta) {
    this.pendingPrompt = txt || null; this.promptStart = this.now(); this.promptUntil = this.now() + 6000 + lineMs(txt);
    opt = Object.assign({}, opt, { then: () => { if (this._guardToEnd && this._guardTxt === txt) { this._guardTxt = null; this.promptUntil = Math.min(this.promptUntil, this.now() + 150); } this.promptQueued = false; if (this.pendingPrompt === txt) { this.pendingPrompt = null; this.promptUntil = Math.min(this.promptUntil, this.now() + 300); } } });
    return this.speak(txt, opt, kind || 'prompt', meta);
  }
  _onStart(it) {
    if (this._countAtStart && it.kind === 'count') this.countUntil = Math.max(this.countUntil, this.now() + lineMs(it.text) + (it.meta.extra || 0));
    if (this.pendingPrompt && it.text === this.pendingPrompt) { this.promptStart = this.now(); this.promptUntil = this.promptStart + lineMs(it.text); if (this._guardToEnd) { this.promptUntil = this.promptStart + 30000; this._guardTxt = it.text; } this.pendingPrompt = null; this.promptQueued = false; }
  }
  speakCount(txt, extra) { const n = this.now(); this.countUntil = Math.max(this.countUntil, n) + lineMs(txt) + (extra || 0); return this.speak(txt, { priority: true }, 'count', { extra: extra || 0 }); }
  feedback(txt, kind, meta) { return this.speak(txt, { interrupt: this.canInterrupt() }, kind, meta); }
  protect(txt, extra) { if (txt) this.promptUntil = Math.max(this.promptUntil, this.now() + lineMs(txt) + (extra || 0)); }
  ev2(e) {
    const w = this.w, c = w.cur, st = w.stoneById(e.id), A = this.lastAsk || {};
    const o = Object.assign({ topic: w.topic, promptKey: c ? c.promptKey : A.promptKey, params: c ? c.params : A.params, rule: c ? c.rule : A.rule, mode: c ? c.mode : A.mode, row: w.row }, e, { thing: e.thing || (st && st.thing) || undefined });
    if (o.mode === 'countSeq' && o.need == null && e.type === 'wrong') o.need = (e.want && e.want.count) || (o.row != null ? o.row + 1 : undefined);
    return o;
  }
  line(fn, e, fb) { try { const t = I[fn](this.lang, e, () => this.r.next()); if (t) return t; } catch (err) { /* fall back */ } return fb ? this.T(fb) : ''; }
  currentPrompt() { if (this.lastPromptText) return this.lastPromptText; const p = this.w.prompt(); return p ? I.ask(this.lang, p.promptKey, p.params, {}) : ''; }
  repeatPrompt(force) {
    if ((!this.w.interactive && !force) || !this.lastAsk) return;
    const cp = this.currentPrompt(); this.promptUntil = 0; this.speakPrompt(cp, { interrupt: true }, 'promptRepeat');
  }
  askAgain(force) {
    if ((!this.w.interactive && !force) || !this.lastAsk) return;
    if (this.speaking() && this.lastSpoken === this.lastPromptText) return;
    if (!this.canInterrupt()) {
      if (this.pendingPrompt || this.promptQueued) return;
      if (this.now() - this.promptStart < 3000) return;
      this.promptQueued = true; this.speakPrompt(this.currentPrompt(), { priority: true }, 'promptRepeat'); return;
    }
    const since = this.now() - this.promptStart, stuck = this.pendingPrompt && since > 6000;
    if (since > 3000 && (!this.pendingPrompt || stuck)) this.repeatPrompt(force);
  }
  onEvent(e) {
    const w = this.w, now = this.now();
    switch (e.type) {
      case 'level': this.speak(this.T('ui.chapter', { n: e.level + 1 }) + '. ' + this.T('topic.' + e.topic), { interrupt: true }, 'chapter'); this.speak(this.T('weather.' + ((e.weather != null ? e.weather : e.level) % 4)), {}, 'weather'); break;
      case 'round': this.idleSaid = 0; this.lastAsk = null; this.lastPromptText = ''; this.roundMissed = false; break;
      case 'rise': if (e.row === 0 && e.i === 0 && w.round === 0 && this.riseSaid !== w.level && !this.speaking() && this.canInterrupt() && this.r.next() < 0.4) { this.riseSaid = w.level; this.speak(this.T('rise'), {}, 'rise'); } break;
      case 'ask': {
        this.lastAsk = e; this.idleSaid = 0; this.hintBySay = false; this.promptQueued = false;
        const txt = I.ask(this.lang, e.promptKey, Object.assign({ child: '' }, e.params || {}), { first: !!e.first, rng: () => this.r.next() });
        this.lastPromptText = txt; this.speakPrompt(txt, { priority: true }, 'prompt', { round: w.level * 4 + w.round }); break;
      }
      case 'right': {
        const txt = this.line('sayRight', this.ev2(e), 'praise');
        if (e.mode === 'countSeq') this.speakCount(txt);
        else if (e.mode === 'countSel') this.speakCount(txt, 400);
        else { this.feedback(txt, 'right'); this.protect(txt); }
        break;
      }
      case 'bankLand': if ((w.round === 0 || this.roundMissed) && !this.speaking() && this.canInterrupt()) this.speak(this.T('bank'), {}, 'bank'); break;
      case 'stick': if (now - this.lastPraise > 1200 && (this._fruitQueue || this.canInterrupt())) { this.lastPraise = now; this.speak(this.line('sayFruit', e.fruit) || this.T('fruit.any'), {}, 'fruit'); } else this.fruitSkipped = (this.fruitSkipped || 0) + 1; break;
      case 'wipe': { this.wipeN++; const first = w.level === 0 && this.wipeN === 1; if ((first || this.r.next() < 0.25) && !this.speaking() && this.canInterrupt()) this.speak(this.T('wipe'), {}, 'wipe'); break; }
      case 'wrong': {
        this.roundMissed = true;
        if (now - this.lastWrongSay > 1500) {
          this.lastWrongSay = now; const ee = this.ev2(e);
          const wt = e.hint ? this.line('sayWrongHint', ee, 'hint') : this.line('sayWrong', ee, 'hint');
          if (e.hint) this.hintBySay = true;
          this.feedback(wt, 'wrong'); this.protect(wt);
        }
        break;
      }
      case 'ahead': if (now - this.lastAhead > 6000 && this.canInterrupt()) { this.lastAhead = now; this.speak(this.T('ahead'), { interrupt: !this.speaking() || this.canInterrupt() }, 'ahead'); } break;
      case 'hint': if (!e.idle && !this.hintBySay) this.speak(this.T('hint'), { priority: true }, 'hint'); this.hintBySay = false; break;
      case 'idle': if (++this.idleSaid <= 4) this.speak(this.T('idle') + ' ' + this.currentPrompt(), {}, 'idle'); break;
      case 'pokeNim': {
        const open = !e.busy && !!e.promptKey && w.state === 'round' && w.phase === 'play' && w.row < (w.cur ? w.cur.k : 0);
        if (!open || !this.lastAsk) { if (!this.speaking() && this.canInterrupt() && now - this.lastTapSay > 2000) { this.lastTapSay = now; this.speak(this.T('poke'), {}, 'poke'); } break; }
        this.askAgain(true); break;
      }
      case 'fish': case 'frog': case 'snow': if (e.type === 'fish' && e.n > 1) break; if (this.canInterrupt()) this.speak(this.T('surprise.' + e.type), {}, 'surprise'); break;
      case 'fishTap': case 'frogTap': case 'snowTap': { const k = e.type.replace('Tap', ''); if (now - this.lastTapSay > 2000 && this.canInterrupt() && !this.speaking()) { this.lastTapSay = now; this.speak(this.T(k + '.tap'), { interrupt: true }, 'tap'); } break; }
      case 'talk': { const tk = e.talk || w.talk; if (tk) this.speakPrompt(this.T('talk.intro') + ' ' + this.T(tk.promptKey, tk.params || {}), { priority: true }, 'talkPrompt'); break; }
      case 'talkAsk': { const tk = e.talk || w.talk; if (tk && e.n <= 3) this.speak(this.T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true }, 'talkAsk'); break; }
      case 'talkResult': this.speak(e.correct ? this.T('talk.right') : 'Good try! (talkWrong)', { interrupt: true }, 'talkResult'); break;
      case 'levelDone': this.speak(this.T('great'), {}, 'great'); break;
      case 'sessionDone': this.speak(this.T('party'), { interrupt: true }, 'party'); this.speak(this.T('session.done', { stars: e.stars || 0 }), {}, 'done'); break;
    }
  }
  tick() { this.V.tick(); }
}

/* ------------------------------------------------------------------ child models (all through the real input API) */
const PACE = { 3: { think: [1.6, 3.2], between: [1.4, 2.6] }, 4: { think: [1.3, 2.6], between: [1.2, 2.2] }, 5: { think: [1.1, 2.3], between: [1.0, 2.0] }, 6: { think: [1.0, 2.2], between: [0.9, 1.8] }, 7: { think: [1.0, 2.0], between: [0.8, 1.6] } };
class Child {
  constructor(w, age, skill, seed) { this.w = w; this.age = age; this.skill = skill; this.r = new NH.RNG(seed); this.f = new L.Finger(w); this.t = -1; this.talkT = -1; this.stats = { taps: 0, airTaps: 0, aheadTaps: 0, idles: 0, idleS: 0 }; this.lastPress = null; }
  rf(a) { return this.r.float(a[0], a[1]); }
  get talkSkill() { return this.skill; }
  talk(dt) {
    const w = this.w; if (w.talkAnswered || !w.talk) return;
    if (this.talkT < 0) this.talkT = this.rf(this.talkDelay || [3, 6]);
    this.talkT -= dt;
    if (this.talkT <= 0) { this.talkT = -1; const t = w.talk; let pick = t.answer; if (!t.glowAnswer && !this.r.chance(this.talkSkill)) { const o = t.choices.filter(c => c.id !== t.answer); if (o.length) pick = this.r.pick(o).id; } w.talkAnswer(pick); }
  }
  press(x, y, hold) {
    const w = this.w; this.stats.taps++;
    const inter = w.interactive, s = w.stones.find(q => q.state === 'rest' && !q.visited && Math.hypot(q.x - x, q.y - y) < w.layout.S);
    this.lastPress = { t: w.time, inter, airborne: !!w._hop, row: w.row };
    if (!inter && w.state === 'round' && w.phase === 'play') this.stats.airTaps++;
    return this.f.gesture(x, y, x, y, 0, hold == null ? this.r.float(0.04, 0.25) : hold);
  }
  tapStone(s, aim) { const h = this.w.stoneHit(s.id); if (!h) return; const a = (aim == null ? 0.5 : aim) * h.own, ang = this.r.float(0, 6.283), d = a * Math.sqrt(this.r.next()); return this.press(h.x + Math.cos(ang) * d, h.y + Math.sin(ang) * d); }
  restRow(row) { return this.w.stones.filter(q => q.row === row && q.state === 'rest' && !q.visited); }
  glowId() { const w = this.w; return w.assistId || (w.hintHand && w.hintHand.id) || null; }
  onEvent(e) { if (e.type === 'ask') this.t = this.listen(e) + this.rf(this.think); if (e.type === 'land' && e.row < e.k - 1) this.t = this.rf(this.between); }
  listen(e) { return e.first ? 3.4 : 2.6; }
  common(dt) {
    const w = this.w;
    if (w.state === 'talk') { this.f.cancel(); this.talk(dt); return true; }
    this.talkT = -1;
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return true; }
    if (this.f.busy) { this.f.step(dt); return true; }
    return false;
  }
}
/** Taps anywhere (the whole safe screen, the water, stones of every row incl. later ones), every 0.4–1.6 s, all the time. */
class RandomTapper extends Child {
  step(dt) {
    if (this.common(dt)) return; const w = this.w, r = this.r, Lw = w.layout;
    if (this.t < 0) this.t = r.float(0.4, 1.6); this.t -= dt; if (this.t > 0) return; this.t = r.float(0.4, 1.6);
    const st = w.stones.filter(s => s.state === 'rest'), u = r.next(), R = Lw.river;
    if (u < 0.3 && st.length) return this.tapStone(r.pick(st), 1.1);
    if (u < 0.6) return this.press(r.float(R.x, R.x + R.w), r.float(R.y, R.y + R.h));
    this.press(r.float(Lw.ins.left, Lw.W - Lw.ins.right), r.float(Lw.ins.top, Lw.H - Lw.ins.bottom));
  }
  onEvent() {}
}
/** A slow 3-year-old: listens, thinks 3–7 s, 2–4 s between hops, often looks away 20–40 s (idle), big aim error. */
class Slow3 extends Child {
  constructor(...a) { super(...a); this.think = [3, 7]; this.between = [2, 4]; this.talkDelay = [4, 9]; }
  step(dt) {
    if (this.common(dt)) return; const w = this.w, r = this.r;
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.rf(this.between); this.t -= dt; if (this.t > 0) return;
    if (r.chance(0.18)) { const d = r.float(20, 40); this.t = d; this.stats.idles++; this.stats.idleS += d; return; }
    this.t = this.rf(this.between) + 1.5;
    const a = w.answer(); if (!a) return;
    const g = this.glowId(); let s = w.stoneById(a.stone);
    if (!(g ? r.chance(0.85) : r.chance(this.skill))) { const o = this.restRow(w.row).filter(q => !q.target), ah = w.stones.filter(q => q.row > w.row && q.state === 'rest'); s = ah.length && r.chance(0.2) ? r.pick(ah) : o.length ? r.pick(o) : s; }
    this.tapStone(s, 0.9);
  }
}
/** Taps ahead: often the row AFTER next (p 0.45 per decision); also taps the next row while Nim is still in the air (p 0.3 per hop). */
class AheadChild extends Child {
  constructor(w, age, ...a) { super(w, age, ...a); Object.assign(this, PACE[age]); this.air = -1; }
  onEvent(e) { super.onEvent(e); if (e.type === 'right' && e.left > 1 && this.r.chance(0.3)) this.air = this.r.float(0.15, 0.4); }
  step(dt) {
    if (this.common(dt)) return; const w = this.w, r = this.r;
    if (this.air >= 0) { this.air -= dt; if (this.air < 0 && w._hop && w._hop.kind === 'stone') { const nx = this.restRow(w._hop.to + 1); if (nx.length) { this.stats.aheadTaps++; this.tapStone(r.chance(this.skill) ? (nx.find(q => q.target) || r.pick(nx)) : r.pick(nx), 0.5); return; } } }
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.rf(this.between); this.t -= dt; if (this.t > 0) return;
    this.t = this.rf(this.between) + 0.8;
    const later = this.restRow(w.row + 1).concat(this.restRow(w.row + 2));
    if (later.length && !this.glowId() && r.chance(0.45)) { this.stats.aheadTaps++; this.tapStone(r.pick(later), 0.5); return; }
    const a = w.answer(); if (!a) return; let s = w.stoneById(a.stone);
    if (!this.glowId() && !r.chance(this.skill)) { const o = this.restRow(w.row).filter(q => !q.target); if (o.length) s = r.pick(o); }
    this.tapStone(s, 0.5);
  }
}
/** Spammer: 6–9 presses per second, never waits (also while Nim is airborne): active row (target with p = skill), later rows, water, Nim. */
class Spammer extends Child {
  step(dt) {
    if (this.common(dt)) return; const w = this.w, r = this.r;
    if (this.t < 0) this.t = r.float(0.11, 0.17); this.t -= dt; if (this.t > 0) return; this.t = r.float(0.11, 0.17);
    const ar = w._hop && w._hop.kind === 'stone' ? w._hop.to + 1 : w.row, row = this.restRow(ar), later = w.stones.filter(q => q.row > ar && q.state === 'rest'), u = r.next();
    if (u < 0.55 && row.length) { const t = row.find(q => q.target); return this.tapStone(t && r.chance(this.skill) ? t : r.pick(row), 0.6); }
    if (u < 0.8 && later.length) return this.tapStone(r.pick(later), 0.6);
    if (u < 0.9) { const b = w.nimHit(); return this.press(b.cx, b.cy, 0.03); }
    const R = w.layout.river; this.press(r.float(R.x, R.x + R.w), r.float(R.y, R.y + R.h), 0.03);
  }
  onEvent() {}
}
/** Hammer: picks a stone of the active row (target p = skill) and bangs on it 3×/s for 2–6 s, then picks again (glow: p 0.8). */
class Hammer extends Child {
  constructor(...a) { super(...a); this.cur = null; this.until = 0; }
  step(dt) {
    if (this.common(dt)) return; const w = this.w, r = this.r;
    if (!w.interactive) { this.cur = null; return; }
    if (this.t < 0) this.t = 0.33; this.t -= dt; if (this.t > 0) return; this.t = r.float(0.28, 0.38);
    let s = this.cur && w.stoneById(this.cur);
    if (!s || s.state !== 'rest' || s.row !== w.row || w.time > this.until || (this.glowId() && s.id !== this.glowId() && r.chance(0.1))) {
      const row = this.restRow(w.row), g = this.glowId();
      s = g && r.chance(0.8) ? w.stoneById(g) : (r.chance(this.skill) ? row.find(q => q.target) : r.pick(row.filter(q => !q.target))) || r.pick(row);
      this.cur = s && s.id; this.until = w.time + r.float(2, 6);
    }
    if (s) this.tapStone(s, 0.3);
  }
  onEvent() {}
}
/** Hammers ONE wrong stone of the active row 2.5–3.5×/s (a toddler banging on "her" stone); switches to a glowing stone with
 *  p 0.15 per tap once something glows. No other way out: shows whether help ever arrives. */
class HammerPure extends Child {
  constructor(...a) { super(...a); this.cur = null; }
  step(dt) {
    if (this.common(dt)) return; const w = this.w, r = this.r;
    if (!w.interactive) { this.cur = null; return; }
    if (this.t < 0) this.t = 0.33; this.t -= dt; if (this.t > 0) return; this.t = r.float(0.28, 0.4);
    let s = this.cur && w.stoneById(this.cur); const g = this.glowId();
    if (g && r.chance(0.15)) s = w.stoneById(g);
    else if (!s || s.state !== 'rest' || s.row !== w.row) { const o = this.restRow(w.row).filter(q => !q.target); s = o.length ? r.pick(o) : this.restRow(w.row)[0]; this.cur = s && s.id; }
    if (s) this.tapStone(s, 0.3);
  }
  onEvent() {}
}
/** Always taps the FIRST stone (i = 0) of the active row — never looks at hints. `fast`: every 0.5–0.95 s, else 1.2–2.6 s. */
class FirstChild extends Child {
  constructor(w, age, skill, seed, fast) { super(w, age, skill, seed); this.fast = fast; }
  step(dt) {
    if (this.common(dt)) return; const w = this.w, r = this.r;
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.fast ? 0.7 : 2; this.t -= dt; if (this.t > 0) return; this.t = this.fast ? r.float(0.5, 0.95) : r.float(1.2, 2.6);
    const row = this.restRow(w.row).sort((a, b) => a.i - b.i); if (row.length) this.tapStone(row[0], 0.3);
  }
  onEvent() {}
}
class Perfect extends Child {
  constructor(w, age, ...a) { super(w, age, ...a); this.think = [0.8, 1.2]; this.between = [0.5, 0.8]; this.talkDelay = [1, 2]; }
  get talkSkill() { return 1; }
  step(dt) {
    if (this.common(dt)) return; const w = this.w;
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.rf(this.between); this.t -= dt; if (this.t > 0) return; this.t = this.rf(this.between) + 1;
    const a = w.answer(); if (a) this.tapStone(w.stoneById(a.stone), 0.1);
  }
}
class BotChild { constructor(w, age, skill, seed) { this.b = new NH.Bot(w, { skill, seed, pace: 'toddler' }); this.stats = this.b.stats; this.stats.airTaps = 0; } step(dt) { this.b.step(dt); } onEvent(e) { this.b.onEvent(e); } }

const MODELS = { random: RandomTapper, slow3: Slow3, ahead: AheadChild, spammer: Spammer, hammer: Hammer, hammerPure: HammerPure, first: FirstChild, firstFast: FirstChild, perfect: Perfect, bot: BotChild };
const SKILLED = ['slow3', 'ahead', 'spammer', 'hammer', 'bot'];
function makeChild(name, w, age, skill, seed) { const C = MODELS[name]; if (!C) throw new Error('model ' + name); return name === 'firstFast' ? new C(w, age, skill, seed, true) : new C(w, age, skill, seed); }

module.exports = { NH, I, L, lineMs, FakeVoice, SpeechSim, makeChild, MODELS, SKILLED };
