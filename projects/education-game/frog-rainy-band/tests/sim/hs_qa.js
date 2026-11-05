#!/usr/bin/env node
// Bop's Rainy Band — QA high-speed playtest (report-only; never edits game/). Extends hs_playtest.js with extra child
// models and pacing / content-variety metrics for docs/reports/playtest_report.md.
//   node tests/sim/hs_qa.js [--n 200] [--ages 3,4,5,6,7] [--models a,b] [--config '{…}'] [--patch carryGuard] [--jobs 2] [--tag x]
// Extra models: slider (30 % of taps slide 30–60 px), overdrum (drums n + 1…3 times at its own rhythm, also after the count
// is done), songtap (taps members / drum / Bop 3×/s during the song playback and the clear), bot0.5 / bot0.8 / bot1.0.
// --patch carryGuard: emulates a proposed world change in the sim only (big-drum taps in the first `drumGuard` s of a drum
// ask are a free "boom", not a count) by wrapping RB.World.prototype._tapBigDrum in THIS process.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const RB = L.RB;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 200), config = JSON.parse(get('config', '{}')), PATCH = get('patch', '');
const ALL = 'typical,slow3,perfect,tapper,spammer,slider,overdrum,songtap,bot0.5,bot0.8,bot1.0,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'qa'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);
const EARLY = 0.7;   // s: no child reacts to a new drum prompt this fast — a count in the first 0.7 s is a carried-over tap

const PATCHES = PATCH.split(',');
if (PATCHES.includes('drumQuiet')) {
  // proposed: after a drum ask is complete, Bop waits until the drumming stops (no big-drum tap for drumQuiet s, at most
  // drumQuietMax s) before the next ask — late taps stay free "booms" instead of counting on the next ask
  const Q = config.drumQuiet || 0.8, QM = config.drumQuietMax || 2.5;
  const tb = RB.World.prototype._tapBigDrum;
  RB.World.prototype._tapBigDrum = function () { this._lastDrumT = this.time; return tb.call(this); };
  const sr = RB.World.prototype._stepRound;
  RB.World.prototype._stepRound = function (h) {
    const a = this._askObj();
    if (this.phase === 'play' && a && a.mode === 'drum' && this._lastDrumT != null && this.time - this._lastDrumT < Q && this.phaseTime < QM)
      this.phaseTime = Math.min(this.phaseTime, this.cfg.playTime - 1e-6);
    return sr.call(this, h);
  };
}
if (PATCHES.includes('shortNudge')) {
  // proposed: a drum ask that stopped short (0 < count < n) with no tap for shortNudge s gets an early idle nudge ("One more!")
  const SN = config.shortNudge || 4;
  const sr = RB.World.prototype._stepRound;
  RB.World.prototype._stepRound = function (h) {
    const a = this._askObj(), D = this.bigDrum;
    if (this.phase === 'ask' && a && a.mode === 'drum' && D.count > 0 && D.count < a.n && this._idleN === 0 && this._idleT >= SN) this._idleT = this._idleGap;
    return sr.call(this, h);
  };
}
if (PATCHES.includes('carryGuard')) {
  const orig = RB.World.prototype._tapBigDrum, G = config.drumGuard || 0.8;
  RB.World.prototype._tapBigDrum = function () {
    const a = this._askObj();
    if (this.phase === 'ask' && a && a.mode === 'drum' && this.bigDrum.count === 0 && this._askT0 != null && this.time - this._askT0 < G) {
      const D = this.bigDrum; this._drumHit(this.cfg.drumSquash * 0.8);
      this._emit({ type: 'boom', x: D.x, y: D.y - 0.75 * D.r, guard: true }); return 'boom';
    }
    return orig.call(this);
  };
  const sa = RB.World.prototype._startAsk;
  RB.World.prototype._startAsk = function () { this._askT0 = this.time; return sa.call(this); };
}

// ---------------------------------------------------------------- extra models
class Slider extends L.Kid {
  tap(box, k) {
    const r = this.r, pt = L.inBox(r, box, k === undefined ? 0.6 : k), slide = r.chance(0.3);
    this.stats.taps++; if (slide) this.stats.slides++;
    return this.f.press(pt.x, pt.y, slide ? r.float(0.15, 0.45) : this.rf(this.p.tapDur), slide ? r.float(30, 60) : r.float(0, this.p.drift));
  }
}
/** Over-drummer: on a drum ask it drums n + 1…3 times at its own rhythm and does not stop when the count is done. */
class OverDrum extends L.Kid {
  constructor(w, prof, seed) { super(w, prof, seed); this.burst = null; this.bkey = ''; this.stats.extra = 0; }
  step(dt) {
    const w = this.w, r = this.r;
    if (this.burst && w.state === 'round') {
      if (this.f.busy) {
        const res = this.f.step(dt);
        if (res === 'drum' && this.bkey !== w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask) this.stats.carry = (this.stats.carry || 0) + 1;
        return;
      }
      this.burst.t -= dt;
      if (this.burst.t > 0) return;
      if (this.burst.left-- <= 0) { this.burst = null; this.key = ''; return; }
      this.tap(w.bigDrumHit(), 0.5); this.burst.t = this.rf(this.p.drumGap); return;
    }
    if (w.state !== 'round') this.burst = null;
    const pr = w.prompt();
    if (w.state === 'round' && w.phase === 'ask' && pr && pr.mode === 'drum') {
      const key = w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask;
      if (key !== this.bkey) {
        this.bkey = key; const ex = r.int(1, 3); this.stats.extra += ex;
        this.burst = { left: Math.max(1, pr.n - w.bigDrum.count) + ex, t: this.rf(this.p.think) };
        return;
      }
    }
    super.step(dt);
  }
}
/** Song tapper: a typical child that also hammers members / the big drum / Bop 3×/s while the band plays the song back. */
class SongTap extends L.Kid {
  constructor(w, prof, seed) { super(w, prof, seed); this.st = 0; this.stats.songTaps = 0; this.stats.songRes = {}; }
  step(dt) {
    const w = this.w, r = this.r;
    if ((w.state === 'round' && w.phase === 'song') || w.state === 'roundDone') {
      this.st -= dt; if (this.st > 0) return; this.st = 1 / 3;
      const ms = w.members.filter(m => m.state === 'rest'), u = r.next();
      const b = ms.length && u < 0.6 ? w.memberHit(r.pick(ms)) : u < 0.85 ? w.bigDrumHit() : w.bopHit();
      const pt = L.inBox(r, b, 0.6), up = (w.pointerDown(pt.x, pt.y), w.pointerUp(pt.x, pt.y)), res = up || 'nothing';
      this.stats.songTaps++; this.stats.songRes[res] = (this.stats.songRes[res] || 0) + 1;
      return;
    }
    super.step(dt);
  }
}
function model(name, w, age, seed) {
  if (name === 'slider') return new Slider(w, L.typicalProfile(age), seed);
  if (name === 'overdrum') return new OverDrum(w, Object.assign(L.typicalProfile(age), { pMiscount: 0 }), seed);
  if (name === 'songtap') return new SongTap(w, L.typicalProfile(age), seed);
  return L.makeModel(name, w, age, seed);
}

// ---------------------------------------------------------------- one session
function runOne(o) {
  const w = L.mkWorld(o), d = model(o.model, w, o.age, o.seed + 1), quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, paused: false, pauseAt: null, nan: false, stuck: null, rounds: [], chapters: [], asks: [],
    hints: 0, hintsIdle: 0, idles: 0, wrong: 0, talks: 0, talkTime: [], intros: 0, carryTaps: 0, drumTaps: 0, drumAsks: 0, carryAsks: 0,
    carryDone: 0, songReact: 0, levels: null, showers: 0, snails: 0, extra: 0, songTaps: 0 };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1500;
  let t = 0, sig = '', lastChange = 0, R = null, ask = null, chapT0 = 0, idleOfAsk = 0, talkT0 = 0;
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!isFinite(w.bigDrum.sy) || w.members.some(m => !isFinite(m.x) || !isFinite(m.y))) { S.nan = true; break; }
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.ask;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuck = s2; break; }
    let stop = false;
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      const now = w.time;
      if (R && R.tSong != null && R.tDone == null && ['play', 'wrong', 'drumTap', 'drumDone', 'locked'].includes(e.type)) S.songReact++;
      switch (e.type) {
        case 'session': S.levels = e.levels; break;
        case 'level': chapT0 = now; break;
        case 'round': {
          if (R && R.tDone != null && R.tNext == null) R.tNext = now;
          const c = w.cur;
          R = { t0: now, topic: w.topic, mode: c.mode, n: c.n, k: c.members.length, round: e.round, surprise: e.surprise,
            key: c.key, sig: c.key + '|' + c.asks.map(a => a.promptKey + JSON.stringify(a.params)).join(','),
            items: c.members.map(m => RB.Content.itemKey(m)), answers: c.asks.map(a => a.answer), tFirstAsk: null, tSong: null, tDone: null, tNext: null, stars: 0 };
          S.rounds.push(R); break;
        }
        case 'ask':
          if (R && R.tFirstAsk == null) R.tFirstAsk = now;
          idleOfAsk = 0;
          ask = { t0: now, mode: e.mode, n: e.n, wrong: 0, hint: false, taps: 0, early: 0 };
          if (e.mode === 'drum') S.drumAsks++;
          break;
        case 'beatsDone': if (ask) ask.tb = now; break;
        case 'drumTap': S.drumTaps++; if (ask) { ask.taps++; if (now - ask.t0 < EARLY) { ask.early++; S.carryTaps++; } } break;
        case 'drumDone': if (ask) { if (ask.early) S.carryAsks++; if (ask.early >= ask.n) S.carryDone++; } // fallthrough
        case 'play': if (ask) { ask.dur = now - (ask.tb || ask.t0); S.asks.push(ask); ask = null; } break;
        case 'wrong': S.wrong++; if (ask) ask.wrong++; break;
        case 'hint': S.hints++; if (e.idle) S.hintsIdle++; if (ask) ask.hint = true; break;
        case 'idle': S.idles++; if (++idleOfAsk >= 5 && quiet) { S.paused = true; S.pauseAt = now; stop = true; } break;
        case 'songStart': if (R) R.tSong = now; break;
        case 'roundDone': if (R) { R.tDone = now; R.stars = e.stars; } break;
        case 'snail': S.snails++; break;
        case 'shower': S.showers++; break;
        case 'talk': if (R && R.tDone != null && R.tNext == null) R.tNext = now; talkT0 = now; break;
        case 'talkAsk': if (e.n >= 4 && quiet) { S.paused = true; S.pauseAt = now; stop = true; } break;
        case 'talkResult': S.talks++; S.talkTime.push(now - talkT0); break;
        case 'levelDone': S.chapters.push({ dur: now - chapT0, topic: w.topic, rounds: w.roundsPerLevel }); break;
      }
    }
    if (stop) break;
  }
  if (ask && !S.paused) { ask.dur = w.time - ask.t0; ask.open = true; S.asks.push(ask); }
  S.done = w.state === 'sessionDone'; S.time = w.time;
  if (d.stats) { S.extra = d.stats.extra || 0; S.carryModel = d.stats.carry || 0; S.songTaps = d.stats.songTaps || 0; S.songRes = d.stats.songRes || null; }
  return S;
}

function runSlice(pairs) {
  const out = [];
  for (const [age, m] of pairs) {
    const n = m === 'absent' ? Math.max(10, Math.round(N / 10)) : N;
    for (let k = 0; k < n; k++) out.push(runOne({ age, model: m, seed: 9000 + k * 37 + age * 11, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config, cap: m === 'absent' ? 900 : 1500 }));
  }
  return out;
}

// ---------------------------------------------------------------- summary
function summarize(all) {
  const by = {};
  for (const s of all) (by[s.age + '|' + s.model] = by[s.age + '|' + s.model] || []).push(s);
  const rows = [];
  for (const key of Object.keys(by)) {
    const A = by[key], [age, mdl] = key.split('|'), done = A.filter(s => s.done);
    const rounds = [].concat(...done.map(s => s.rounds)).filter(r => r.tDone != null);
    const chaps = [].concat(...done.map(s => s.chapters)), asks = [].concat(...A.map(s => s.asks));
    const play = rounds.map(r => r.tSong - r.t0), song = rounds.map(r => r.tDone - r.tSong + 0), clear = rounds.filter(r => r.tNext != null).map(r => r.tNext - r.tDone);
    // song phase length = songStart → roundDone; reward share = (song + clear) / round
    const roundDur = rounds.filter(r => r.tNext != null).map(r => r.tNext - r.t0);
    const reward = rounds.filter(r => r.tNext != null).map(r => (r.tNext - r.tSong) / (r.tNext - r.t0));
    // content: repeats within a round, every member asked when n ≥ k, identical / same band consecutive rounds
    let rep = 0, repAsks = 0, needAll = 0, allOk = 0, ident = 0, sameBand = 0, pairs = 0;
    const freq = {}, slot = {};
    for (const s of done) {
      let prev = null;
      for (const r of s.rounds) {
        if (r.k > 0) {
          const seen = new Set();
          r.answers.forEach(a => { if (a >= 0) { repAsks++; if (seen.has(a)) rep++; seen.add(a); slot[a] = (slot[a] || 0) + 1; } });
          if (r.n >= r.k) { needAll++; if (seen.size === r.k) allOk++; }
          const f = freq[r.topic] = freq[r.topic] || {}; r.items.forEach(i => { const kk = i.split('|').filter(Boolean).slice(1).join('/'); f[kk] = (f[kk] || 0) + 1; });
        }
        if (prev && prev.topic === r.topic) { pairs++; if (prev.sig === r.sig) ident++; if (r.k && prev.key === r.key) sameBand++; }
        prev = r;
      }
    }
    const st = v => rounds.length ? 100 * rounds.filter(r => r.stars === v).length / rounds.length : 0;
    const topicCh = {}; for (const c of chaps) (topicCh[c.topic] = topicCh[c.topic] || []).push(c.dur);
    const drumAsks = A.reduce((a, s) => a + s.drumAsks, 0);
    const fr = {}; for (const [tp, f] of Object.entries(freq)) { const v = Object.values(f), tot = v.reduce((a, b) => a + b, 0); fr[tp] = { kinds: v.length, max: Math.max(...v) / tot, min: Math.min(...v) / tot }; }
    rows.push({ age: +age, model: mdl, n: A.length, done: done.length, paused: A.filter(s => s.paused).length, pauseAt: L.mean(A.filter(s => s.paused).map(s => s.pauseAt)),
      stuck: A.filter(s => s.stuck).length, nan: A.filter(s => s.nan).length,
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.length ? 100 * chaps.filter(c => c.rounds < 4).length / chaps.length : 0,
      ses: L.mean(done.map(s => s.time)), sesP90: L.pct(done.map(s => s.time), 0.9), sesMax: done.length ? Math.max(...done.map(s => s.time)) : 0,
      round: L.mean(roundDur), roundP90: L.pct(roundDur, 0.9), play: L.mean(play), song: L.mean(song), clear: L.mean(clear), reward: 100 * L.mean(reward),
      byMode: Object.fromEntries(['pick', 'drum', 'listen'].map(md => { const x = asks.filter(a => a.mode === md && a.dur != null).map(a => a.dur); return [md, x.length ? L.f1(L.mean(x)) + '/' + L.f1(L.pct(x, 0.9)) : '-']; })),
      ask: L.mean(asks.filter(a => a.dur != null).map(a => a.dur)), askP90: L.pct(asks.filter(a => a.dur != null).map(a => a.dur), 0.9),
      askMax: asks.length ? Math.max(...asks.map(a => a.dur || 0)) : 0, stuckAsks: asks.filter(a => a.dur > 60).length, stuckRounds: roundDur.filter(x => x > 120).length,
      hinted: asks.length ? 100 * asks.filter(a => a.hint).length / asks.length : 0, hintPerAsk: asks.length ? A.reduce((a, s) => a + s.hints, 0) / asks.length : 0,
      idlePerAsk: asks.length ? A.reduce((a, s) => a + s.idles, 0) / asks.length : 0, wrong: asks.length ? L.mean(asks.map(a => a.wrong)) : 0,
      s3: st(3), s2: st(2), s1: st(1), stars: L.mean(done.map(s => s.rounds.reduce((a, r) => a + r.stars, 0))),
      rep: repAsks ? 100 * rep / repAsks : 0, allAsked: needAll ? 100 * allOk / needAll : 100, needAll, ident, sameBand, pairs,
      drumAsks, carryTaps: A.reduce((a, s) => a + s.carryTaps, 0), carryAsks: A.reduce((a, s) => a + s.carryAsks, 0), carryDone: A.reduce((a, s) => a + s.carryDone, 0),
      songReact: A.reduce((a, s) => a + s.songReact, 0), songTaps: A.reduce((a, s) => a + s.songTaps, 0),
      carryModel: A.reduce((a, s) => a + (s.carryModel || 0), 0), extra: A.reduce((a, s) => a + s.extra, 0),
      songRes: A.reduce((o, s) => { if (s.songRes) for (const [k, v] of Object.entries(s.songRes)) o[k] = (o[k] || 0) + v; return o; }, {}),
      talk: L.mean([].concat(...A.map(s => s.talkTime))), slot, fr,
      topicChap: Object.fromEntries(Object.entries(topicCh).map(([tp, v]) => [tp, +L.mean(v).toFixed(1)])) });
  }
  rows.sort((a, b) => a.age - b.age || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));
  return rows;
}

function tables(rows) {
  const f = x => (+x).toFixed(1), p = x => (+x).toFixed(0), q = x => (+x).toFixed(2);
  let md = '### Time\n\n| age | model | done/n | chapter mean (p10–p90) s | cut % | session mean / p90 / max s | round mean / p90 s | play / song / clear s | reward % of round | ask mean / p90 / max s | ask > 60 s / round > 120 s / stuck |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) md += `| ${r.age} | ${r.model} | ${r.done}/${r.n}${r.paused ? ' (' + r.paused + ' paused @' + p(r.pauseAt) + ' s)' : ''}${r.nan ? ' NaN' : ''} | ${f(r.chap)} (${f(r.chapP10)}–${f(r.chapP90)}) | ${p(r.cut)} | ${p(r.ses)} / ${p(r.sesP90)} / ${p(r.sesMax)} | ${f(r.round)} / ${f(r.roundP90)} | ${f(r.play)} / ${f(r.song)} / ${f(r.clear)} | ${p(r.reward)} | ${f(r.ask)} / ${f(r.askP90)} / ${p(r.askMax)} | ${r.stuckAsks} / ${r.stuckRounds} / ${r.stuck} |\n`;
  md += '\n### Help, stars, drum carry-over, content\n\n| age | model | wrong/ask | hinted asks % | hints/ask | idle/ask | ★★★/★★/★ % | stars/session | drum asks | drum counts < 0.7 s into a drum ask (asks hit / asks completed by them) | reactions to song taps | repeat asks % | all members asked (n ≥ k) | identical / same-band consecutive rounds |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) md += `| ${r.age} | ${r.model} | ${q(r.wrong)} | ${p(r.hinted)} | ${q(r.hintPerAsk)} | ${q(r.idlePerAsk)} | ${p(r.s3)}/${p(r.s2)}/${p(r.s1)} | ${f(r.stars)} | ${r.drumAsks} | ${r.carryTaps} (${r.carryAsks} / ${r.carryDone})${r.extra ? ' · model: ' + r.carryModel + ' of ' + r.extra + ' extra taps counted on the next ask' : ''} | ${r.songReact}${r.songTaps ? ' of ' + r.songTaps + ' ' + JSON.stringify(r.songRes) : ''} | ${f(r.rep)} | ${f(r.allAsked)} % of ${r.needAll} | ${r.ident} / ${r.sameBand} of ${r.pairs} |\n`;
  md += '\n### Chapter mean by topic (s), ask mean/p90 by mode, answer slot share, member variety (typical)\n\n| age | topics | ask s by mode pick · drum · listen | answer slot share | members: kinds seen, most / least frequent share |\n|---|---|---|---|---|\n';
  for (const r of rows.filter(r => ['typical', 'slow3', 'overdrum', 'bot0.8'].includes(r.model))) {
    const tot = Object.values(r.slot).reduce((a, b) => a + b, 0);
    md += `| ${r.age} ${r.model} | ${Object.entries(r.topicChap).map(([t, v]) => t + ' ' + v).join(' · ')} | ${r.byMode.pick} · ${r.byMode.drum} · ${r.byMode.listen} | ${Object.entries(r.slot).map(([s, v]) => s + ':' + p(100 * v / tot) + '%').join(' ')} | ${Object.entries(r.fr).map(([t, v]) => `${t} ${v.kinds} (${p(100 * v.max)}/${p(100 * v.min)} %)`).join(' · ')} |\n`;
  }
  return md;
}

module.exports = { runOne, summarize, tables };
if (require.main !== module) { /* library */ } else if (args.includes('--worker')) {
  process.on('message', m => { process.send(runSlice(m.pairs), () => process.exit(0)); });
} else {
  const t0 = Date.now(), slices = []; for (let j = 0; j < JOBS; j++) slices.push([]);
  const pairs = []; for (const a of AGES) for (const m of MODELS) pairs.push([a, m]);
  pairs.forEach((pm, i) => slices[i % JOBS].push(pm));
  Promise.all(slices.filter(s => s.length).map(sl => new Promise((res, rej) => {
    const c = fork(__filename, [...args, '--worker']), parts = [];
    c.on('message', r => parts.push(...r)); c.on('exit', code => (code ? rej(new Error('worker ' + code)) : res(parts)));
    c.send({ pairs: sl });
  }))).then(parts => {
    const S = [].concat(...parts), rows = summarize(S);
    const md = `## QA playtest "${TAG}" — ${S.length} sessions${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}${PATCH ? ' · patch ' + PATCH : ''}\n\n` + tables(rows) + `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall · tests/sim/hs_qa.js_\n`;
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'qa_' + TAG + '.json'), JSON.stringify(rows, null, 1));
    fs.writeFileSync(path.join(out, 'qa_' + TAG + '.md'), md);
    console.log(md);
  });
}
