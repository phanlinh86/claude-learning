#!/usr/bin/env node
// Moka's Fairy Tea Party — HEADLESS voice-flow sim (report-only). Runs the REAL main.js + voice.js + world (+ i18n, content, weather,
// bot) in a node vm with a virtual clock (setTimeout / rAF / Date.now / performance.now), stubbed DOM / render / UI / audio, and a
// fake speechSynthesis that speaks each utterance for 0.25 s + chars / (14 EN | 12 VI) chars/s (rate 0.9 → ÷ 0.9) and honours
// cancel() like Safari (onerror 'interrupted'). So the line selection, protection, queue (1 + 2), stale and interrupt rules are
// exactly the game's. A child model plays through world.pointerDown / pointerUp:
//   listener: waits until Moka stops talking, thinks 1.3–2.6 s (p 0.25 eager: taps 0.6–1.6 s after the ask), right p = 0.8,
//   pokes Moka p 0.08 per round, taps critters p 0.5; Talk 3–6 s after the question ends.
//   eager: always taps 0.4–1.2 s after the ask (talks over Moka), right p 0.7.
//   slow: 4–12 s after the prompt, p 0.6 right, 15 % looks away 20–35 s.
// Checks: the ask heard in full every round (before the round is solved), count runs never cut, praise skip rate, the same line
// back-to-back, chapter greeting stomped, hints / wrong lines cutting the prompt, silence gaps, talk-time share.
//   node tests/sim/qa_voiceflow.js [--n 8] [--ages 3,4] [--langs en,vi] [--kids listener,eager,slow] [--tag base]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 8), AGES = get('ages', '3,4').split(',').map(Number), LANGS = get('langs', 'en,vi').split(','), KIDS = get('kids', 'listener,eager,slow').split(',');
const TAG = get('tag', 'base'), CFG = JSON.parse(get('config', '{}'));
const JS = path.join(__dirname, '../../game/js');
const SRC = {}; for (const f of ['rng', 'i18n', 'content', 'world', 'weather', 'bot', 'voice', 'main']) SRC[f] = fs.readFileSync(path.join(JS, f + '.js'), 'utf8');

function stub(ret) {   // a universal no-op: every property is a callable stub
  const fn = function () { return ret !== undefined ? ret : P; };
  const P = new Proxy(fn, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k in t ? t[k] : P), set: () => true, apply: () => (ret !== undefined ? ret : P) });
  return P;
}
function element() {
  const listeners = {};
  return { style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {}, textContent: '', value: 100,
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, removeEventListener() {}, listeners,
    getBoundingClientRect: () => ({ left: 900, top: 0, width: 260, height: 90, right: 1160, bottom: 90 }), appendChild() {}, setAttribute() {}, querySelector: () => element(), querySelectorAll: () => [] };
}

function runSession(o) {
  let clock = 1000;   // ms
  const timers = []; let tid = 1, rafs = [];
  const setTimeout_ = (f, ms) => { const id = tid++; timers.push({ id, at: clock + Math.max(0, +ms || 0), f }); return id; };
  const clearTimeout_ = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
  const rate = o.lang === 'vi' ? 12 : 14;
  const log = [];   // utterances: {text, start, end, how}
  let cur = null; const q = [];
  class Utt { constructor(t) { this.text = t; this.rate = 1; } }
  const fin = how => { const c = cur; if (!c) return; cur = null; clearTimeout_(c.timer); c.rec.end = clock; c.rec.how = how;
    if (how === 'end') { if (c.u.onend) c.u.onend({}); } else if (c.u.onerror) c.u.onerror({ error: 'interrupted' }); nxt(); };
  const nxt = () => { if (cur || !q.length) return; const u = q.shift(); if (!String(u.text).trim()) { setTimeout_(() => { if (u.onend) u.onend({}); }, 5); return; }
    const ms = 250 + 1000 * u.text.length / rate / ((u.rate || 1) / 0.9);
    const rec = { text: u.text, start: clock, end: 0, how: '', ms }; log.push(rec); cur = { u, rec };
    setTimeout_(() => { if (cur && cur.u === u && u.onstart) u.onstart({}); }, 30);
    cur.timer = setTimeout_(() => fin('end'), ms); };
  const synth = { get speaking() { return !!cur; }, get pending() { return q.length > 0; }, paused: false,
    speak(u) { q.push(u); setTimeout_(nxt, 0); }, cancel() { while (q.length) { const u = q.shift(); if (u.onerror) u.onerror({ error: 'canceled' }); } fin('cut'); },
    pause() {}, resume() {}, getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true }, { name: 'Linh', lang: 'vi-VN', localService: true }],
    addEventListener() {}, removeEventListener() {}, onvoiceschanged: null };
  const els = {}, doc = { getElementById: id => (els[id] = els[id] || element()), querySelector: () => element(), querySelectorAll: () => [], addEventListener() {}, hidden: false, activeElement: null, body: element() };
  const winListeners = {};
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(clock); } static now() { return clock; } }
  const ctx = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Symbol, Map, Set, WeakMap, Promise, Error, TypeError, RegExp, isNaN, isFinite, parseFloat, parseInt, Proxy, Reflect, Uint8Array, Float32Array, Int32Array,
    Date: FakeDate, setTimeout: setTimeout_, clearTimeout: clearTimeout_, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: f => { rafs.push(f); return rafs.length; }, cancelAnimationFrame: () => {},
    performance: { now: () => clock }, document: doc, navigator: { language: o.lang, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5, platform: 'iPad' },
    location: { search: `?age=${o.age}&lang=${o.lang}&seed=${o.seed}` }, innerWidth: 1180, innerHeight: 820, devicePixelRatio: 2,
    getComputedStyle: () => ({ paddingTop: '24', paddingRight: '0', paddingBottom: '20', paddingLeft: '0' }),
    addEventListener: (t, f) => { (winListeners[t] = winListeners[t] || []).push(f); }, removeEventListener() {},
    speechSynthesis: synth, SpeechSynthesisUtterance: Utt, URLSearchParams, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const run = (code, f) => vm.runInContext(code, ctx, { filename: f });
  for (const f of ['rng', 'i18n', 'content', 'world', 'weather', 'bot']) run(SRC[f], f + '.js');
  // stubs for the integrator's DOM / canvas / audio modules
  const FT = ctx.FT;
  Object.assign(FT.CONFIG, CFG);   // --config: a proposed FT.CONFIG (main.js builds its World from FT.CONFIG)
  FT.Storage = { init: () => Promise.resolve(), getJSON: (k, d) => (k === 'lastTopics' && o.last ? o.last : d), setJSON() {} };   // odd sessions rotate the topics (count / animals chapters)
  FT.Assets = { load: () => Promise.resolve() };
  FT.Audio = stub(); FT.Input = stub(); FT.TeaArt = stub();
  FT.UI = new Proxy({}, { get: (t, k) => (k === 'hudStarPoint' ? () => ({ x: 1000, y: 40 }) : () => undefined) });
  FT.Renderer = function () { return stub(); };
  run(SRC.voice, 'voice.js'); run(SRC.main, 'main.js');
  const step = ms => {   // advance the virtual clock by ms: timers in order, then one rAF frame
    const end = clock + ms;
    for (;;) { timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); clock = Math.max(clock, t.at); try { t.f(); } catch (e) { errors.push(String(e.stack || e)); } }
    clock = end;
    const fs_ = rafs; rafs = []; for (const f of fs_) { try { f(clock); } catch (e) { errors.push(String(e.stack || e)); } }
  };
  const errors = [];
  return { ctx, FT, step, log, errors, winListeners, get clock() { return clock; }, synth };
}

async function session(o) {
  const S = runSession(o), FT = S.FT;
  S.winListeners.DOMContentLoaded.forEach(f => f());
  for (let i = 0; i < 200 && !(FT.debug && FT.debug.mode === 'title'); i++) { await null; S.step(16); }
  FT.Voice.unlock();                       // the Play tap
  FT.debug.startGame();
  const w = FT.debug.world, R = new FT.RNG(o.seed * 7 + 3), U = (a, b) => R.float(a, b);
  // tag every say() with the world event being handled (main pushes each event into FT.debug.events right before onEvent)
  let cause = 'boot';
  const ev = FT.debug.events; ev.push = function (x) { cause = x.type; return Array.prototype.push.call(this, x); };
  const says = [];
  const say0 = FT.Voice.say.bind(FT.Voice);
  FT.Voice.say = (text, op) => { const r = { t: S.clock, text: String(text), cause, round: w.level + ':' + w.round, interrupt: !!(op && op.interrupt), priority: !!(op && op.priority), res: '' };
    says.push(r); const p = say0(text, op); p.then(x => { r.res = x.reason; }); return p; };
  const evs = [];
  const emit = w._emit.bind(w);
  w._emit = e => { evs.push({ type: e.type, t: S.clock, key: w.level + ':' + w.round, count: e.count ? e.count.n : 0, first: e.first, plate: e.thing && e.thing.kind === 'plate' }); return emit(e); };
  const speaking = () => FT.Voice.isSpeaking();
  const kind = o.kid;
  let eag = false, key = '', at = 0, from = 0, upAt = 0, talkKey = '', talkAt = 0, pokeKey = '', crKey = '', away = 0;
  const frame = 1000 / 60, maxMs = 15 * 60000;
  let doneAt = 0;
  while ((!doneAt || S.clock < doneAt + 8000) && S.clock < maxMs + 2000) {
    if (!doneAt && FT.debug.mode === 'done') doneAt = S.clock;
    const now = S.clock;
    if (upAt && now >= upAt) { w.pointerUp(); upAt = 0; }
    if (w.state === 'talk' && w.talk && !w.talkAnswered) {
      const k = w.level + ':talk';
      if (k !== talkKey) { talkKey = k; talkAt = 0; }
      if (!talkAt && !speaking()) talkAt = now + (kind === 'slow' ? U(5000, 10000) : U(3000, 6000));
      if (talkAt && now > talkAt) { const t = w.talk, wr = t.choices.filter(c => c.id !== t.answer); w.talkAnswer(R.chance(0.85) || !wr.length ? t.answer : wr[0].id); talkAt = 1e15; }
    } else if (w.interactive && !w._g && !upAt) {
      const k = w.level + ':' + w.round + ':' + w.misses;
      if (k !== key) { key = k; at = 0; from = now; eag = R.chance(0.25); }
      const rk = w.level + ':' + w.round;
      if (rk !== pokeKey) { pokeKey = rk; if (R.chance(0.08) && kind !== 'eager') { const b = w.mokaHit(); w.pointerDown(b.cx, b.cy); upAt = now + 120; } }
      const ch = w.critterHit();
      if (ch && crKey !== rk && R.chance(0.01)) { crKey = rk; w.pointerDown(ch.x, ch.y); upAt = now + 100; }
      if (!upAt && !at) {
        if (kind === 'eager') at = from + U(400, 1200);
        else if (kind === 'slow') { if (!speaking() && now - from > 300) at = now + U(4000, 12000) + (R.chance(0.15) ? U(20000, 35000) : 0); }
        else if (eag) at = from + U(600, 1600);
        else if (!speaking() && now - from > 300) at = now + U(1300, 2600);
      }
      if (!upAt && at && now > at) {
        let m = w.memberById(w.cur.oddId); const pR = kind === 'eager' ? 0.7 : kind === 'slow' ? 0.6 : 0.8;
        if (!R.chance(pR) && !w.hintHand && !w.assistId) { const ot = w.members.filter(x => x.state === 'sit' && x.id !== m.id); if (ot.length) m = R.pick(ot); }
        const h = w.memberHit(m.id);
        if (h) { w.pointerDown(h.x + U(-15, 15), h.y + U(-15, 15)); upAt = now + U(60, 250); }
        at = 0; key = w.level + ':' + w.round + ':' + w.misses + ':t' + now;   // wait for the next change (the wrong line) before tapping again
        from = now;
      }
    }
    S.step(frame);
    await null;
  }
  return { o, says, log: S.log, evs, errors: S.errors, done: FT.debug.mode === 'done', min: S.clock / 60000, I18N: FT.I18N };
}

function analyse(r) {
  const { says, log, evs, I18N } = r, lang = r.o.lang;
  const tts = t => log.find(u => u.start >= t.t - 1 && u.text && (u.text === I18N.speech(lang, t.text) || u.text === t.text));
  const variants = k => { const v = I18N.raw(lang, k); return Array.isArray(v) ? v : [v]; };
  const cheersV = variants('cheers'), praiseV = variants('praise').concat(variants('great'));
  const kindOf = s => {
    if (s.cause === 'level') return /\./.test(s.text) && s === says.find(x => x.cause === 'level' && Math.abs(x.t - s.t) < 1) ? 'chapter' : 'weather';
    if (s.cause === 'cheers') return cheersV.some(v => s.text === v.replace(/\{child\}/g, '').trim() || s.text.startsWith(v.split('{')[0]) && v.length < 20) && !praiseV.includes(s.text) ? 'cheers' : 'praise';
    if (s.cause === 'right') return evs.find(e => e.type === 'right' && Math.abs(e.t - s.t) < 100 && e.plate) ? 'countRun' : 'right';
    if (s.cause === 'ask') return 'prompt';
    if (s.cause === 'pokeMoka') return s.text === 'x' ? 'poke' : (says.find(x => x === s) && /\?$/.test(s.text.trim()) ? 'promptRepeat' : 'poke');
    return s.cause;
  };
  for (const s of says) { s.kind = kindOf(s); const u = tts(s); s.how = u ? u.how : s.res || 'pending'; s.u = u; }
  const K = {};
  for (const s of says) { const k = K[s.kind] = K[s.kind] || { n: 0, end: 0, cut: 0, dropped: 0, stale: 0, interrupted: 0, other: 0 };
    k.n++; if (s.how === 'end') k.end++; else if (s.how === 'cut') k.cut++; else if (s.res === 'dropped') k.dropped++; else if (s.res === 'stale') k.stale++; else if (s.res === 'interrupted') k.interrupted++; else k.other++; }
  // per round: the ask heard in full (an utterance of the prompt text that ended 'end') before the round's right answer
  const rounds = [...new Set(evs.filter(e => e.type === 'round').map(e => e.key))];
  let heard = 0, heardFirst = 0, nR = 0, firstCutBy = {};
  for (const k of rounds) {
    const askE = evs.find(e => e.type === 'ask' && e.key === k), rightE = evs.find(e => e.type === 'right' && e.key === k);
    if (!askE || !rightE) continue;
    nR++;
    const ps = says.filter(s => (s.kind === 'prompt' || s.kind === 'promptRepeat' || s.cause === 'idle' || s.cause === 'wrong') && s.round === k && s.t <= rightE.t);
    if (ps.some(s => s.kind !== 'wrong' && s.u && s.u.how === 'end' && s.u.end <= rightE.t + 1)) heard++;
    const p0 = says.find(s => s.kind === 'prompt' && s.round === k);
    if (p0 && p0.u && p0.u.how === 'end') heardFirst++;
    else if (p0) { const by = says.find(s => s.t > p0.t && s.t <= (p0.u ? p0.u.end || p0.t + 1e5 : p0.t + 1e5) + 1 && s.interrupt) || says.find(s => s.t >= p0.t && s !== p0); firstCutBy[by ? by.kind : p0.res || '?'] = (firstCutBy[by ? by.kind : p0.res || '?'] || 0) + 1; }
  }
  // the count run: every plate right line spoken to the end
  const cr = says.filter(s => s.kind === 'countRun'), crFull = cr.filter(s => s.how === 'end').length;
  // back-to-back identical utterances
  let b2b = 0; const b2bEx = [];
  for (let i = 1; i < log.length; i++) if (log[i].text === log[i - 1].text && log[i].how && log[i - 1].how) { b2b++; if (b2bEx.length < 3) b2bEx.push(log[i].text); }
  // prompt cut by a hint / wrong / idle / critter line
  const promptCut = {};
  for (const s of says) if ((s.kind === 'prompt' || s.kind === 'promptRepeat') && s.u && s.u.how === 'cut') {
    const by = says.find(x => x.t >= s.u.start && x.t <= s.u.end + 1 && x !== s && x.interrupt); const k = by ? by.kind : '?'; promptCut[k] = (promptCut[k] || 0) + 1; }
  // silence gaps inside play (no utterance for > 8 s while interactive) — measured from the log
  const sorted = log.slice().sort((a, b) => a.start - b.start); let gaps = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start - (sorted[i - 1].end || sorted[i - 1].start) > 12000) gaps++;
  const talkMs = log.reduce((a, u) => a + ((u.end || u.start) - u.start), 0);
  // praise skip: cheers events with a praise line requested vs spoken
  const cheersN = evs.filter(e => e.type === 'cheers').length;
  // prompt latency: the ask event → the prompt utterance starts (queued behind praise / lantern lines?)
  const lat = []; for (const s of says) if (s.kind === 'prompt' && s.u) lat.push((s.u.start - s.t) / 1000);
  // praise: rounds with a miss or the chapter's last round should get a praise line spoken in full
  const praise = says.filter(s => s.kind === 'praise'), praiseFull = praise.filter(s => s.how === 'end').length;
  return { lat, praiseN: praise.length, praiseFull, K, nR, heard, heardFirst, firstCutBy, cr: cr.length, crFull, b2b, b2bEx, promptCut, gaps, talkPct: talkMs / (r.min * 60000) * 100, cheersN,
    utter: log.length, perMin: log.length / r.min };
}

(async () => {
  const res = [];
  for (const kid of KIDS) for (const age of AGES) for (const lang of LANGS) for (let i = 0; i < N; i++) {
    const r = await session({ age, lang, seed: 300 + i * 17 + age, kid, last: i % 2 ? ['colors', 'shapes', 'size', 'animals', 'count'].filter((t, k) => k !== 4 - (i >> 1) % 3) : null });
    const a = analyse(r); a.kid = kid; a.age = age; a.lang = lang; a.min = r.min; a.done = r.done; a.errors = r.errors.slice(0, 3);
    res.push(a);
    if (r.errors.length) console.error('errors', kid, age, lang, r.errors[0]);
  }
  // aggregate per kid × age × lang
  const groups = {}; for (const a of res) (groups[a.kid + '|' + a.age + '|' + a.lang] = groups[a.kid + '|' + a.age + '|' + a.lang] || []).push(a);
  const lines = ['| kid | age | lang | sessions | min | rounds | ask heard in full before solved % | first ask heard in full % (cut / dropped by) | count runs full / n | prompt cut by | same line back-to-back | gaps > 12 s | Moka talking % | lines / min | prompt start delay s median (p90, max) | praise full / requested |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const kindRows = ['| kid | age | lang | line kind | requested | spoken in full | cut | dropped | stale | flushed |', '|---|---|---|---|---|---|---|---|---|---|'];
  const sum = (as, f) => as.reduce((x, a) => x + f(a), 0), merge = (as, f) => { const o = {}; for (const a of as) for (const k in f(a)) o[k] = (o[k] || 0) + f(a)[k]; return o; };
  for (const g of Object.keys(groups)) {
    const as = groups[g], [kid, age, lang] = g.split('|'), nR = sum(as, a => a.nR);
    const fc = merge(as, a => a.firstCutBy), pc = merge(as, a => a.promptCut);
    lines.push(`| ${kid} | ${age} | ${lang} | ${as.length} | ${(sum(as, a => a.min) / as.length).toFixed(1)} | ${nR} | ${(sum(as, a => a.heard) / nR * 100).toFixed(1)} | ${(sum(as, a => a.heardFirst) / nR * 100).toFixed(1)} (${Object.keys(fc).map(k => k + ' ' + fc[k]).join(', ') || '—'}) | ${sum(as, a => a.crFull)} / ${sum(as, a => a.cr)} | ${Object.keys(pc).map(k => k + ' ' + pc[k]).join(', ') || '—'} | ${sum(as, a => a.b2b)}${as.find(a => a.b2bEx.length) ? ' (' + as.find(a => a.b2bEx.length).b2bEx[0] + ')' : ''} | ${sum(as, a => a.gaps)} | ${(sum(as, a => a.talkPct) / as.length).toFixed(1)} | ${(sum(as, a => a.perMin) / as.length).toFixed(1)} | ${(() => { const l = as.flatMap(a => a.lat).sort((x, y) => x - y), q = p => l.length ? l[Math.min(l.length - 1, Math.floor(p * l.length))].toFixed(2) : '-'; return q(0.5) + ' (' + q(0.9) + ', ' + (l.length ? l[l.length - 1].toFixed(2) : '-') + ')'; })()} | ${sum(as, a => a.praiseFull)} / ${sum(as, a => a.praiseN)} |`);
    const K = {}; for (const a of as) for (const k in a.K) { const o = K[k] = K[k] || { n: 0, end: 0, cut: 0, dropped: 0, stale: 0, interrupted: 0 }; for (const f in o) o[f] += a.K[k][f] || 0; }
    if (kid === KIDS[0] || kid === 'eager') for (const k of Object.keys(K).sort()) kindRows.push(`| ${kid} | ${age} | ${lang} | ${k} | ${K[k].n} | ${K[k].end} | ${K[k].cut} | ${K[k].dropped} | ${K[k].stale} | ${K[k].interrupted} |`);
  }
  const md = `# qa_voiceflow ${TAG} — ${res.length} sessions, config ${JSON.stringify(CFG)} (real main.js + voice.js, virtual clock; speech ${'14'} chars/s EN, 12 VI, + 0.25 s)\n\n` + lines.join('\n') + '\n\n' + kindRows.join('\n') + '\n';
  console.log(md);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'qa_voiceflow_' + TAG + '.md'), md);
  const errs = res.filter(a => a.errors.length); if (errs.length) { console.log('ERRORS', errs.length, errs[0].errors[0]); process.exit(1); }
})();
