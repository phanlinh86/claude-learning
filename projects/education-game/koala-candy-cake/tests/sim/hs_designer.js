#!/usr/bin/env node
// Koko's Cake Tower — GAME-DESIGNER playtest (report-only; never edits game/js). Complements hs_playtest.js with:
//   · new child models: hoverer (drags a block over the tower and never lets go), returner (drags it over the tower, then
//     brings it back down and lets go on the grass), hesitant (holds 3–8 s over the tower before letting go)
//   · a VOICE model: main.js onEvent() speech calls replayed into a copy of CK.Voice's queue rules (MAXQ 2, stale 5 s,
//     priority / interrupt, promptUntil guard) with a TTS duration model → prompts fully heard / cut / dropped, line spam
//   · sway visibility per landing (top-of-tower displacement in px), hint timing, content variety (answer streaks,
//     colour sets, slot streaks), count-chapter content, surprises per chapter, alternative star rules (post-hoc)
//   node tests/sim/hs_designer.js [--n 40] [--ages 3,4,5,6,7] [--models typical,…] [--config '{…}'] [--voice countSpeak,pokeGuard]
//                                 [--jobs 2] [--tag name] [--plays 1]   → tests/sim/out/hd_<tag>.json (+ .md summary on stdout)
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
const N = +get('n', 40), config = JSON.parse(get('config', '{}')), VOPT = (get('voice', '') || '').split(',').filter(Boolean);
const MODELS = get('models', 'typical,slow3,thoughtful,dropHigh,dropLow,sloppy,tapper,spammer,swiper,hesitant,bot0.5,bot0.8').split(',');
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), TAG = get('tag', 'base'), JOBS = +get('jobs', 2), PLAYS = +get('plays', 1);
const VPS = Object.keys(L.VIEWPORTS);
const PATCH = (get('patch', '') || '').split(',').filter(Boolean);
// Harness-only PROTOTYPES of code proposals (the game file is untouched; these wrap CK.World.prototype in this process):
//   graceAssist: the HINTED right block let go anywhere off the tower (a grass 'miss') hops onto the tower like the tap assist
//   --blocks '{"4":[2,3,3,4]}': blocks per tower by age (content.js BLOCKS) via makeRound's own `blocks` option + blocksFor
const BLK = JSON.parse(get('blocks', '{}'));
if (Object.keys(BLK).length) {
  const mk = CK.Content.makeRound, bf = CK.Content.blocksFor;
  const nOf = (age, ri) => { const t = BLK[age]; return t ? t[Math.min(ri, t.length - 1)] : null; };
  CK.Content.makeRound = function (topic, o) { const n = nOf(o.age, o.roundIndex || 0); return mk(topic, n ? Object.assign({}, o, { blocks: n }) : o); };
  CK.Content.blocksFor = function (topic, age, ri) { return nOf(age, ri) || bf(topic, age, ri); };
}
if (PATCH.includes('graceAssist')) {
  const up = CK.World.prototype.pointerUp;
  CK.World.prototype.pointerUp = function (x, y) {
    const id = this._press && this._press.id, r = up.call(this, x, y);
    if (r === 'miss' && id) { const p = this.pieceById(id); if (p && p.right && p._hinted && this.phase === 'ask') { this._toss(p); this._emit({ type: 'drop', pieceId: p.id, x: p.x, y: p.y, right: true, assisted: true, via: 'grace' }); return 'drop'; } }
    return r;
  };
}

/* ---------------------------------------------------------------- extra child models */
class Holder {   // drags a block up over the tower; mode 'hover' never lets go, 'return' brings it back to the grass, 'hesitant' lets go late
  constructor(w, age, seed, mode) {
    this.w = w; this.r = new CK.RNG(seed); this.mode = mode; this.t = 2; this.d = null; this.talkT = -1; this.stats = { taps: 0 };
    this.p = L.typicalProfile(age);
  }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') { if (!w.talkAnswered) { if (this.talkT < 0) this.talkT = r.float(3, 6); if ((this.talkT -= dt) <= 0) { this.talkT = -1; w.talkAnswer(w.talk.answerId); } } return; }
    if (w.state !== 'round') return;
    const d = this.d;
    if (d) {
      if (!w._press || w._press.id !== d.id) { this.d = null; this.t = 1; return; }
      d.t += dt;
      const dp = w.dropPoint();
      if (d.stage === 0) {   // move up to over the tower in ~1 s
        const u = Math.min(1, d.t / 1.0);
        w.pointerMove(d.x0 + (dp.x - d.x0) * u, d.y0 + (dp.y - d.y0) * u);
        if (u >= 1) { d.stage = 1; d.t = 0; d.hold = this.mode === 'hesitant' ? r.float(3, 8) : this.mode === 'return' ? r.float(1, 2.5) : 1e9; }
      } else if (d.stage === 1) {
        w.pointerMove(dp.x + Math.sin(d.t * 3) * 6, dp.y + Math.cos(d.t * 2) * 4);   // a resting finger still jitters a bit
        if (d.t >= d.hold) {
          if (this.mode === 'return') { d.stage = 2; d.t = 0; }
          else { w.pointerUp(dp.x, dp.y); this.d = null; this.t = r.float(1.5, 3); }
        }
      } else {   // back down to the grass beside its slot and let go
        const u = Math.min(1, d.t / 0.8), gx = d.x0 + (d.x0 > dp.x ? 30 : -30), gy = d.y0 + 10;
        w.pointerMove(dp.x + (gx - dp.x) * u, dp.y + (gy - dp.y) * u);
        if (u >= 1) { w.pointerUp(gx, gy); this.d = null; this.t = r.float(1.5, 3); }
      }
      return;
    }
    if (w.phase !== 'ask') return;
    if ((this.t -= dt) > 0) return;
    const ans = w.answerId(), rest = L.restingPieces(w); if (!ans || !rest.length) return;
    const pc = r.chance(this.p.skill) ? w.pieceById(ans) : r.pick(rest);
    if (!pc || pc.state !== 'rest') return;
    const res = w.pointerDown(pc.x, pc.y);
    if (res === pc.id) this.d = { id: pc.id, x0: pc.x, y0: pc.y, t: 0, stage: 0 };
    else { w.pointerUp(pc.x, pc.y); this.t = 0.5; }
  }
}
function makeModel(name, w, age, seed) {
  if (name === 'hoverer') return new Holder(w, age, seed, 'hover');
  if (name === 'returner') return new Holder(w, age, seed, 'return');
  if (name === 'hesitant') return new Holder(w, age, seed, 'hesitant');
  return M.makeModel(name, w, age, seed);
}

/* ---------------------------------------------------------------- voice model (main.js speech + CK.Voice queue) */
// TTS duration (rate 0.9, iOS / macOS voices): en ≈ 12 chars/s, vi ≈ 14 chars/s, + 0.25 s start latency.
const CPS = { en: +get('cpsEn', 12), vi: +get('cpsVi', 14) };
class VoiceSim {
  constructor(lang, rng) { this.lang = lang; this.rng = rng; this.q = []; this.cur = null; this.kickAt = 0; this.items = []; this.MAXQ = 2; this.STALE = 5; }
  dur(text) { const s = I18N.speech ? I18N.speech(this.lang, text) : text; return 0.25 + s.length / CPS[this.lang]; }
  say(now, text, opt, tag, meta) {
    if (!text) return null;
    const it = { text, tag, t: now, priority: !!(opt && opt.priority), dur: this.dur(text), status: 'queued', meta: meta || {} };
    this.items.push(it);
    if (opt && opt.interrupt) {
      for (const x of this.q) { x.status = 'flushed'; x.by = tag; }
      this.q = [];
      if (this.cur) { this.cur.status = 'cut'; this.cur.by = tag; this.cur.heard = (now - this.cur.start) / this.cur.dur; this.cur = null; }
      this.q.push(it); this.kickAt = now + 0.05; return it;
    }
    this.q.push(it);
    while (this.q.length > this.MAXQ) {
      let idx = -1; for (let i = 0; i < this.q.length - 1; i++) if (!this.q[i].priority) { idx = i; break; }
      if (idx < 0) idx = 0;
      const d = this.q.splice(idx, 1)[0]; d.status = 'dropped'; d.by = tag;
    }
    if (!this.cur) this.kickAt = Math.min(this.kickAt > now ? this.kickAt : now, now);
    return it;
  }
  speaking() { return !!this.cur; }
  update(now) {
    if (this.cur && now >= this.cur.start + this.cur.dur) { this.cur.status = 'done'; this.cur.end = now; this.cur = null; this.kickAt = now; }
    if (!this.cur && now >= this.kickAt) {
      while (this.q.length) {
        const it = this.q.shift();
        if (!it.priority && now - it.t > this.STALE) { it.status = 'stale'; continue; }
        it.start = now; it.status = 'speaking'; this.cur = it; break;
      }
    }
  }
}

/** Replays main.js onEvent() speech calls (main.js rev 2026-11-04) into a VoiceSim. */
class MainVoice {
  constructor(w, lang, seed) {
    this.w = w; this.lang = lang; this.r = new CK.RNG(seed); const rf = () => this.r.next();
    this.rf = rf; this.v = new VoiceSim(lang, rf);
    this.promptUntil = 0; this.lastWrongSay = -1e9; this.lastMissSay = -1e9; this.lastGrabSay = -1e9; this.lastName = ''; this.idleSaid = 0;
    this.lastAsk = null; this.lastPromptText = ''; this.lastPromptStart = -1e9;
  }
  T(key, p) { return I18N.t(this.lang, key, Object.assign({ child: '' }, p || {}), this.rf); }
  line(fn, e, fb) {
    const ev = Object.assign({ topic: this.w.topic }, this.lastAsk ? { promptKey: this.lastAsk.promptKey, params: this.lastAsk.params } : {}, e);
    try { const t = I18N[fn](this.lang, ev, this.rf); if (t) return t; } catch (er) { /* fallback */ }
    return fb ? this.T(fb) : '';
  }
  canInterrupt(now) {
    if (VOPT.includes('promptGuard')) {   // proposal: the guard runs from when the prompt is really spoken (queued or speaking → protected)
      const v = this.v; if ((v.cur && v.cur.tag === 'prompt') || v.q.some(x => x.tag === 'prompt')) return false;
    }
    return now > this.promptUntil;
  }
  speakPrompt(now, txt, opt, meta) { this.promptUntil = now + 0.3 + 0.072 * (txt || '').length; this.lastPromptStart = now; return this.v.say(now, txt, opt, 'prompt', meta); }
  sayName(now, txt) {
    if (!txt || this.v.speaking()) return;
    if (now - this.lastGrabSay < 0.7 || (txt === this.lastName && now - this.lastGrabSay < 3)) return;
    this.lastGrabSay = now; this.lastName = txt; this.v.say(now, txt, {}, 'name');
  }
  on(e, now) {
    const w = this.w, v = this.v, T = (k, p) => this.T(k, p);
    switch (e.type) {
      case 'level': v.say(now, T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true }, 'chapter'); v.say(now, T('weather.' + e.level), {}, 'weather'); break;
      case 'round': this.idleSaid = 0; this.lastAsk = null; this.lastPromptText = '';
        if (e.round % (w.roundsPerLevel || 4) === 0) v.say(now, T('deal'), {}, 'deal'); break;
      case 'ask': { this.lastAsk = e; this.idleSaid = 0; const txt = T(e.promptKey, e.params || {}); this.lastPromptText = txt;
        this.speakPrompt(now, txt, { priority: true }, { ask: true, askT: now }); break; }
      case 'grab': this.sayName(now, this.line('sayTap', e, null)); break;
      case 'tapPiece': if (!e.assist) this.sayName(now, this.line('sayTap', e, null)); break;
      case 'miss': if (now - this.lastMissSay > 6) { this.lastMissSay = now; v.say(now, T('miss'), { interrupt: this.canInterrupt(now) }, 'miss'); } break;
      case 'stack': {
        this.promptUntil = 0;
        const last = w.cur && e.n >= w.cur.n;
        if (last && VOPT.includes('countSpeak1')) break;   // proposal: the count-up line replaces the last praise
        let txt = this.line('sayStack', e, 'praise');
        if (VOPT.includes('shortPraise')) txt = I18N.name(this.lang, e.nameKind, e.nameValue) + '! ' + (this.lang === 'vi' ? 'Cộp!' : 'Clonk!');   // proposal
        v.say(now, txt, { interrupt: true }, 'praise'); break;
      }
      case 'wrong': if (now - this.lastWrongSay > 1.5) {
        this.lastWrongSay = now;
        let txt = this.line('sayWrong', e, 'hint');
        if (VOPT.includes('shortWrong') && e.want) txt = this.lang === 'vi' ? `Tưng! Đó là ${I18N.name('vi', e.nameKind, e.nameValue)}. Tìm ${I18N.name('vi', e.want.kind, e.want.value)} nhé!` : `Boing! That's ${I18N.name('en', e.nameKind, e.nameValue)}. Find ${I18N.name('en', e.want.kind, e.want.value)}!`;   // proposal
        v.say(now, txt, { interrupt: this.canInterrupt(now) }, 'wrong');
      } break;
      case 'hint': if (!e.idle) v.say(now, T('hint'), {}, 'hint'); break;
      case 'idle': if (++this.idleSaid <= 4) v.say(now, T('idle') + ' ' + this.lastPromptText, {}, 'idle'); break;
      case 'pokeKoko': {
        if (!this.lastAsk || w.state !== 'round') break;
        if (VOPT.includes('pokeGuard') && (now - this.lastPromptStart < 3 || (v.cur && v.cur.tag === 'prompt'))) break;   // proposal
        this.promptUntil = 0; this.speakPrompt(now, this.lastPromptText, { interrupt: true }, { repeat: true }); break;
      }
      case 'towerDone': if (!VOPT.includes('countSpeak1')) v.say(now, T('towerDone'), {}, 'towerDone'); break;
      case 'count':
        if (VOPT.includes('countSpeak')) v.say(now, I18N.sayCount(this.lang, e.i).split('!')[0] + '!', {}, 'count');   // proposal: speak each number
        if (VOPT.includes('countSpeak1') && e.i === 1) {   // proposal: ONE utterance "One, two, three, four! We reached the cherry!"
          const nums = []; for (let i = 1; i <= e.n; i++) nums.push(I18N.name(this.lang, 'number', i));
          v.say(now, nums.join(', ') + '! ' + T('towerDone'), { interrupt: true }, 'count');
        }
        break;
      case 'cherryOn': v.say(now, T('candles'), {}, 'candles'); break;
      case 'blow': v.say(now, T('blow'), {}, 'blow'); break;
      case 'roundDone': if (!VOPT.includes('noGreat')) v.say(now, T('great'), {}, 'great'); break;   // noGreat: proposal (stars + chime only; the count line already praised)
      case 'gust': v.say(now, T('gust'), { interrupt: this.canInterrupt(now) }, 'gust'); break;
      case 'bee': v.say(now, T('surprise.bee'), { interrupt: this.canInterrupt(now) }, 'bee'); break;
      case 'beeTap': v.say(now, T('bee.tap'), { interrupt: this.canInterrupt(now) }, 'beeTap'); break;
      case 'talk': { const tk = e.talk || w.talk; this.speakPrompt(now, T('talk.intro') + ' ' + T(tk.promptKey, tk.params || {}), { priority: true }, { talk: true, askT: now }); break; }
      case 'talkAsk': { const tk = e.talk || w.talk; if (tk && e.n <= 3) v.say(now, T(tk.promptKey, tk.params || {}), { priority: true }, 'talkAsk'); break; }
      case 'talkResult': v.say(now, e.correct ? T('talk.right') : (I18N.talkWrong ? I18N.talkWrong(this.lang, 'color', 'red') : T('talk.wrong')), { interrupt: true }, 'talkResult'); break;
      case 'sessionDone': v.say(now, T('party'), { interrupt: true }, 'party'); v.say(now, T('session.done', { stars: e.stars || 0 }), {}, 'sessionDone'); break;
    }
  }
}

/* ---------------------------------------------------------------- one session */
function runOne(o) {
  const vp = L.VIEWPORTS[o.vp];
  const w = new CK.World({ seed: o.seed, age: o.age, lang: o.lang, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const d = makeModel(o.model, w, o.age, o.seed + 1);
  const mv = new MainVoice(w, o.lang, o.seed + 2);
  const out = { model: o.model, age: o.age, lang: o.lang, plays: [] };
  let last = null;
  for (let play = 0; play < (o.plays || 1); play++) {
    const S = { done: false, time: 0, chapters: [], asks: [], lands: [], rounds: [], idleT: [], pauseAt: null, topics: null, talk: [] };
    w.newSession({ lastTopics: last });
    const t0 = w.time;
    let ask = null, chap = null, round = null, landWatch = [], t = 0, idleSaid = 0;
    const cap = o.cap || 1500;
    while (w.state !== 'sessionDone' && t < cap) {
      d.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      const now = w.time, th = Math.abs(w.tower.theta);
      for (const lw of landWatch) if (now - lw.t < 2) lw.peak = Math.max(lw.peak, th);
      landWatch = landWatch.filter(lw => now - lw.t < 2);
      let stop = false;
      for (const e of w.drainEvents()) {
        mv.on(e, now);
        switch (e.type) {
          case 'session': S.topics = e.levels; break;
          case 'level': chap = { topic: e.topic, t0: now, rounds: 0, gust: 0, bee: 0, beeTap: 0, surprise: null, talkT: 0 }; break;
          case 'round': round = { i: e.round, n: e.n, t0: now, surprise: e.surprise }; if (e.surprise && chap) chap.surprise = e.surprise; idleSaid = 0; break;
          case 'ask': {
            idleSaid = 0;
            const ps = w.pieces.filter(p => p.askIdx === w.ask).sort((p, q) => p.x - q.x || p.y - q.y), a = w.pieceById(e.answerId);
            ask = { topic: w.topic, key: e.promptKey, val: e.nameValue, kind: e.nameKind, round: w.round, i: e.ask, k: ps.length, slot: ps.indexOf(a), t0: now,
              color: a && a.block.color, colors: ps.map(p => p.block.color).filter(Boolean), vals: ps.map(p => p.block.nameValue), wrong: 0, grass: 0, hintT: null, hintWhy: null, idles: 0 };
            break;
          }
          case 'wrong': if (ask) ask.wrong++; break;
          case 'miss': if (ask) ask.grass++; break;
          case 'hint': if (ask && ask.hintT == null) { ask.hintT = now - ask.t0; ask.hintWhy = e.idle ? 'idle' : ask.wrong >= 2 ? 'miss2' : 'soft'; } break;
          case 'idle': if (ask) ask.idles++; S.idleT.push(now - (ask ? ask.t0 : now));
            if (++idleSaid >= 5 && (o.model === 'absent' || o.model === 'hoverer')) { S.pauseAt = now - t0; stop = true; } break;
          case 'land': landWatch.push({ t: now, n: e.n, peak: Math.abs(w.tower.theta), S: w.layout.LH, gust: false, rec: null });
            S.lands.push(landWatch[landWatch.length - 1]); break;
          case 'gust': if (chap) chap.gust++; { const g = { t: now, n: w.tower.blocks.length, peak: 0, S: w.layout.LH, gust: true }; landWatch.push(g); S.lands.push(g); } break;
          case 'bee': if (chap) chap.bee++; break;
          case 'beeTap': if (chap) chap.beeTap++; break;
          case 'stack': if (ask) { ask.dur = now - ask.t0; S.asks.push(ask); ask = null; } break;
          case 'roundDone': if (chap) chap.rounds++; if (round) S.rounds.push({ n: round.n, i: round.i, dur: now - round.t0, stars: e.stars, m: e.misses + e.assists, topic: w.topic }); break;
          case 'talk': if (chap) chap.talkStart = now; break;
          case 'talkResult': if (chap) { chap.talkDur = now - chap.talkStart; S.talk.push({ dur: chap.talkDur, correct: e.correct }); } break;
          case 'levelDone': if (chap) { chap.dur = now - chap.t0; S.chapters.push(chap); } break;
        }
      }
      mv.v.update(now);
      if (stop) break;
    }
    if (ask) { ask.dur = w.time - ask.t0; ask.open = true; S.asks.push(ask); }
    S.done = w.state === 'sessionDone'; S.time = w.time - t0; S.stars = w.stars;
    // finish the voice queue
    for (let k = 0; k < 600; k++) mv.v.update(w.time + k * 0.05);
    S.lands = S.lands.map(l => ({ n: l.n, peak: l.peak, top: l.peak * l.n * l.S, gust: l.gust }));
    last = w.lastTopics;
    out.plays.push(S);
  }
  out.voice = mv.v.items.map(it => ({ tag: it.tag, t: it.t, s: it.status, by: it.by || null, heard: it.heard, start: it.start, dur: it.dur, len: it.text.length, ask: !!it.meta.ask, talk: !!it.meta.talk, rep: !!it.meta.repeat, text: it.text.slice(0, 24) }));
  out.sessionSpan = w.time;
  return out;
}

function runSlice(pairs) {
  const res = [];
  for (const [age, model] of pairs) for (let k = 0; k < N; k++)
    res.push(runOne({ age, model, seed: 7000 + k * 37 + age * 11, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config, plays: PLAYS,
      cap: model === 'hoverer' || model === 'returner' ? 300 : 1500 }));
  return res;
}

module.exports = { runOne, makeModel, VoiceSim, MainVoice, Holder };

if (require.main !== module) { /* library */ } else if (args.includes('--worker')) {
  process.on('message', m => { const r = runSlice(m.pairs); fs.writeFileSync(m.file, JSON.stringify(r)); process.send('ok', () => process.exit(0)); });
} else {
  const t0 = Date.now(), pairs = [];
  for (const a of AGES) for (const m of MODELS) pairs.push([a, m]);
  const slices = Array.from({ length: JOBS }, () => []);
  pairs.forEach((p, i) => slices[i % JOBS].push(p));
  const outDir = path.join(__dirname, 'out'); fs.mkdirSync(outDir, { recursive: true });
  Promise.all(slices.filter(s => s.length).map((sl, j) => new Promise((res, rej) => {
    const file = path.join(outDir, `hd_${TAG}.part${j}.json`);
    const c = fork(__filename, [...args, '--worker']);
    c.on('exit', code => (code ? rej(new Error('worker ' + code)) : res(JSON.parse(fs.readFileSync(file, 'utf8')))));
    c.send({ pairs: sl, file });
  }))).then(parts => {
    const all = [].concat(...parts);
    fs.writeFileSync(path.join(outDir, `hd_${TAG}.json`), JSON.stringify({ tag: TAG, config, voice: VOPT, patch: PATCH, blocks: BLK, n: N, plays: PLAYS, sessions: all }));
    for (let j = 0; j < JOBS; j++) { try { fs.unlinkSync(path.join(outDir, `hd_${TAG}.part${j}.json`)); } catch (e) { /* none */ } }
    console.log(`hd_${TAG}: ${all.length} sessions × ${PLAYS} plays in ${((Date.now() - t0) / 1000).toFixed(0)} s → tests/sim/out/hd_${TAG}.json (analyse: node tests/sim/hd_analyze.js ${TAG})`);
  });
}
