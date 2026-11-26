// Rio's Singing Eggs — HEADLESS VOICE MODEL (report-only): a model of main.js's speech scheduling for the headless playtest
// (`hs_playtest.js --proto '{"voice":1}'`). Lines come from the real SE.I18N; an utterance lasts 0.3 s + 75 ms × chars / 0.9
// (≈ iOS Samantha / Linh at rate 0.9, the same model as hs_voiceflow.js's fake speechSynthesis). Mirrors main.js:
//   level → chapter line (interrupt) + weather (queued) · demoStart → "Listen to my tune!" (speakPrompt) | replay: interrupt,
//   skipped < 3 s after a wrong line · demoNote → drop queued lines (i > 0), queue the name · ask → afterDemo / beat: speakPrompt,
//   later steps: the cue, queued · wrong → the line (interrupts unless a prompt is protected), at most every 1.5 s ·
//   right → praise, interrupts · demoCount → the number, interrupts.
// Protos (sim-only prototypes of proposed changes; never touch game/js):
//   gate  — main.js holds the world's demo for the voice: the replay after a wrong waits for the wrong line (≤ 3 s), a spark
//           leaves only when Rio is quiet (≤ 2.5 s for the first, ≤ 0.8 s for later ones), demoEnd waits for the last name (≤ 1 s)
//   short — content: "Your turn!" alone after the demo (ages ≥ 4), the wrong line before a replay "Oh, purple! Listen again!",
//           VI demo start without "Bé nghe nè, Rio hát đây!"
'use strict';
const SE = globalThis.SE;
if (!SE.I18N) { const fs = require('fs'), vm = require('vm'), { resolve } = require('../unit/load'); const f = resolve('i18n.js'); vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: 'i18n.js' }); }
const dur = t => (t ? 0.3 + 0.075 * String(t).length / 0.9 : 0);

class VoiceModel {
  constructor(w, o) {
    this.w = w; this.lang = o.lang || 'en'; this.age = o.age; this.P = o.proto || {}; this.I = SE.I18N;
    this.cur = null; this.q = []; this.log = []; this.promptUntil = -1e9; this.lastWrong = -1e9; this.t = 0;
    this.held = 0; this.holdKey = ''; this.rng = new SE.RNG(o.seed || 1);
    this.S = { notes: 0, noteDropped: 0, noteLag: [], noteOverlap: 0, turns: 0, turnFull: 0, turnHeardBeforeTap: 0, replayLag: [], startLate: [], holdS: 0 };
    this.pend = [];   // demoNote checks resolved later: { arr, next, line }
    this.turn = null;
  }
  say(text, o) {
    if (!text) return null;
    o = o || {};
    const it = { text, d: dur(text), o, start: -1, end: -1, how: '' };
    if (o.interrupt) { for (const x of this.q) x.how = 'dropped'; this.q = []; if (this.cur) { this.cur.how = 'cut'; this.cur.end = this.t; this.cur = null; } }
    this.q.push(it); this.log.push(it); this._kick();
    return it;
  }
  prompt(text) { const it = this.say(text, { priority: true }); if (it) { it.prompt = true; this.promptUntil = this.t + 6 + it.d; } return it; }
  dropQueued() { for (const x of this.q) x.how = 'dropped'; this.q = []; }
  speaking() { return !!this.cur || this.q.length > 0; }
  _kick() { if (!this.cur && this.q.length) { this.cur = this.q.shift(); this.cur.start = this.t; } }
  tick(t) {
    this.t = t;
    if (this.cur && t >= this.cur.start + this.cur.d) { this.cur.end = this.cur.start + this.cur.d; this.cur.how = 'end'; if (this.cur.prompt) this.promptUntil = Math.min(this.promptUntil, this.cur.end + 0.3); this.cur = null; }
    this._kick();
  }
  canInterrupt() { return this.t >= this.promptUntil; }
  topicCx(e) { const w = this.w, s = w.stepInfo, c = e.id ? w.eggById(e.id) : null; return Object.assign({ topic: w.topic, params: s ? s.params : undefined, promptKey: s ? s.promptKey : undefined }, e, { thing: e.thing || (c && c.thing) }); }
  /** the gate (proto): called before every world.update */
  gate(dt) {
    if (!this.P.gate) return;
    const w = this.w, D = w.demo, cs = w.cfg, talk = this.speaking();
    if (w.state === 'round' && w.phase === 'play' && w._replayT > 0 && w._replayT <= dt + 1e-6 && talk) {
      if (this.holdKey !== 'r') { this.holdKey = 'r'; this.held = 0; }
      if (this.held < 3) { w._replayT = dt + 0.01; this.held += dt; this.S.holdS += dt; }
      return;
    }
    if (!D) return;
    const k = 'd' + D.from + ':' + D.launched + ':' + w.round + ':' + w.level;
    if (k !== this.holdKey) { this.holdKey = k; this.held = 0; }
    const cap = D.launched === 0 ? 2.5 : 0.8;
    if (D.launched < D.list.length) { const at = D.arr[D.launched] - cs.sparkTime; if (D.t + dt >= at - 1e-9 && talk && this.held < cap) { D.t = Math.min(D.t, at - dt - 1e-4); this.held += dt; this.S.holdS += dt; } }
    else if (!w.sparks.length && D.t + dt >= D.end - 1e-9 && talk && this.held < 1) { D.t = Math.min(D.t, D.end - dt - 1e-4); this.held += dt; this.S.holdS += dt; }
  }
  onEvent(e) {
    const I = this.I, L = this.lang, w = this.w, P = this.P;
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        this.say(I.t(L, 'ui.chapter', { n: e.level + 1 }) + '. ' + I.t(L, 'topic.' + e.topic), { interrupt: true });
        this.say(I.t(L, 'weather.' + wi));
        break;
      }
      case 'demoStart': {
        let s = I.sayDemoStart(L, e, this.rng);
        if (P.short && !e.replay) for (let k = 0; k < 6 && /Rio hát đây/.test(s); k++) s = I.sayDemoStart(L, e, this.rng);
        this.demoStartLine = null;
        if (!(e.replay && this.t - this.lastWrong < 3)) this.demoStartLine = e.replay ? this.say(s, { interrupt: true }) : this.prompt(s);
        this.firstNoteOfDemo = true;
        break;
      }
      case 'demoNote': {
        if (e.i > 0) this.dropQueued();
        const it = this.say(I.sayDemo(L, this.topicCx(e)));
        if (this.firstNoteOfDemo && this.demoStartLine) this.S.startLate.push(this.demoStartLine);
        this.firstNoteOfDemo = false;
        this.S.notes++;
        if (this.lastNote) this.lastNote.next = this.t;
        this.lastNote = { arr: this.t, it, replay: !!e.replay, next: null };
        this.pend.push(this.lastNote);
        break;
      }
      case 'demoCount': this.promptUntil = 0; this.say(I.sayCount ? I.sayCount(L, e.i) : String(e.i), { interrupt: true }); break;
      case 'demoEnd': if (this.lastNote) this.lastNote.next = this.t + 0.5; this.lastNote = null; break;
      case 'ask': {
        const ev = this.topicCx(e);
        let said;
        if (P.short && e.afterDemo && e.mode !== 'beat' && this.age >= 4) said = I.t(L, 'turn.first', null, this.rng);
        else said = I.sayTurn(L, ev, { age: this.age, rng: this.rng });
        if (e.afterDemo || e.mode === 'beat') { const it = this.prompt(said); if (e.afterDemo) { this.S.turns++; this.turn = { it, tapped: false }; } }
        else if (said) this.say(said);
        break;
      }
      case 'ring': if (e.judged && this.turn && !this.turn.tapped) { this.turn.tapped = true; this.turn.tapT = this.t; } break;
      case 'wrong': {
        if (this.t - this.lastWrong > 1.5) {
          this.lastWrong = this.t;
          const c = w.eggById(e.id), ev = this.topicCx(Object.assign({}, e, { thing: c && c.thing }));
          let s;
          if (P.short && e.replay && ev.topic !== 'animals' && ev.thing) { const nm = I.demoName(L, Object.assign({}, ev, e.got || {}, { thing: ev.thing })); if (nm) s = L === 'vi' ? 'Ồ, ' + nm.charAt(0).toLowerCase() + nm.slice(1) + '! Bé nghe lại nhé!' : 'Oh, ' + nm + '! Listen again!'; }
          if (!s) s = I.sayWrong(L, ev, this.rng);
          this.say(s, { interrupt: this.canInterrupt() });
          this.promptUntil = Math.max(this.promptUntil, this.t + dur(s));
          if (e.replay) this.wrongReplay = true;
        }
        break;
      }
      case 'right': {
        this.promptUntil = 0;
        let s = 'Yes!';
        try { s = I.sayRight(L, this.topicCx(e)) || s; } catch (err) { /* keep */ }
        this.say(s, { interrupt: true });
        break;
      }
    }
  }
  /** resolve per-note / per-turn stats (call once the session is over) */
  finish() {
    const S = this.S;
    for (const n of this.pend) {
      if (!n.it || n.it.how === 'dropped' || n.it.start < 0) { S.noteDropped++; continue; }
      const lag = n.it.start - n.arr; S.noteLag.push(lag); if (n.replay) S.replayLag.push(lag);
      if (n.next != null && n.it.start + n.it.d > n.next + 0.05) S.noteOverlap++;
    }
    S.startLate = S.startLate.filter(x => x.start >= 0).map(x => x.start + x.d);   // (end time; compared below by the caller if needed)
    for (const it of this.log) if (it.prompt && it.how === 'end') it.full = true;
    return S;
  }
}
module.exports = { VoiceModel, dur };
