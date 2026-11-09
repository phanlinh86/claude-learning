#!/usr/bin/env node
// Pom's Puzzle Town — SPOKEN FLOW at real speed (report-only). In the browser `?speed=8` makes speech log-only and main.js's
// guards run on the wall clock, so the browser voice log cannot show what a child actually HEARS. This sim replays main.js's
// speech policy (game/js/main.js onEvent: protected prompt, interrupting feedback, queued praise / hints, count-run guard,
// pickup / tap naming rate limits, idle lines, Talk intro / re-asks) on the world clock at speed 1, through a model of the
// PZ.Voice queue (1 speaking + MAXQ 2 waiting, non-priority lines stale after 5 s, interrupt = flush + cancel, 50 ms kick)
// with voice.js's own duration estimate (600 + 85 ms × chars / rate 0.9). A child model (tests/sim/lib.js) plays.
//   node tests/sim/voice_flow.js [--n 40] [--ages 3,4] [--models typical,slow3] [--langs en,vi] [--config '{…}'] [--dump 1]
// Output: heard lines / min, % of play time Pom talks, lines cut mid-sentence (by kind), never heard (dropped / stale), prompt
// start delay after the ask, prompts cut, count runs cut, identical line twice within 10 s, the most repeated lines.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const L = require('./lib');
const { resolve } = require('../unit/load');
vm.runInThisContext(fs.readFileSync(resolve('i18n.js'), 'utf8'), { filename: 'i18n.js' });
const PZ = L.PZ, I = PZ.I18N;
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 40), AGES = get('ages', '3,4').split(',').map(Number), MODELS = get('models', 'typical,slow3').split(','), LANGS = get('langs', 'en,vi').split(',');
const config = JSON.parse(get('config', '{}')), DUMP = +get('dump', 0), VP = get('vpatch', '').split(',');
// --vpatch praiseOnly: roundDone says ONE line (the 3-star 'great' with the child's name, else 'praise'); the alive text stays in the bubble
//          fbguard: a wrong / near-miss feedback line is protected like the count run (pickup / tap names wait; the plip is enough)
//          shortPlaced: colours / shapes / size / animals fits say a short 'Click! It fits!' (the pickup already named the piece)
//          guard: the prompt guard after onStart = 0.6 s + 95 ms × chars (voice.js's own estimate at rate 0.9) instead of 0.3 + 72 ms × chars
const RATE = 0.9, MAXQ = 2, STALE = 5;
const dur = text => (600 + text.length * 85 / RATE) / 1000;

function runOne(o) {
  const w = L.mkWorld(o), kid = L.makeModel(o.model, w, o.age, o.seed + 1), lang = o.lang;
  const rng = new PZ.RNG(o.seed + 99);
  let now = 0, lastSpoken = '';
  const T1 = (k, p) => I.t(lang, k, Object.assign({ child: '' }, p || {}), rng);
  const T = (k, p) => { let r = T1(k, p); for (let i = 0; i < 3 && r && r === lastSpoken; i++) r = T1(k, p); return r; };
  // ---- voice model
  const V = { cur: null, q: [], kickAt: -1 }, heard = [], lost = [];
  const finish = (it, how) => { it.end = now; it.how = how; if (it.start != null) heard.push(it); else lost.push(it); };
  function say(text, opt) {
    opt = opt || {}; if (!text) return; lastSpoken = text;
    const it = { text, kind: opt.kind || '?', t: now, priority: !!opt.priority, interrupt: !!opt.interrupt, start: null };
    if (opt.interrupt) {
      for (const q of V.q) finish(q, 'flushed'); V.q = [];
      if (V.cur) { V.cur.by = it.kind; finish(V.cur, 'cut'); V.cur = null; }
      V.q.push(it); V.kickAt = now + 0.05; return it;
    }
    V.q.push(it);
    while (V.q.length > MAXQ) { let idx = V.q.findIndex((x, i) => i < V.q.length - 1 && !x.priority); if (idx < 0) idx = 0; finish(V.q.splice(idx, 1)[0], 'dropped'); }
    if (!V.cur && V.kickAt < 0) V.kickAt = now;
    return it;
  }
  function voiceStep() {
    if (V.cur && now >= V.cur.start + V.cur.d) { finish(V.cur, 'end'); V.cur = null; if (V.kickAt < 0) V.kickAt = now; }
    if (!V.cur && V.kickAt >= 0 && now >= V.kickAt) {
      V.kickAt = -1;
      while (V.q.length) {
        const it = V.q.shift();
        if (!it.priority && now - it.t > STALE) { finish(it, 'stale'); continue; }
        it.start = now; it.d = dur(it.text); V.cur = it; onStart(it); break;
      }
    }
  }
  const speaking = () => !!V.cur;
  // ---- main.js speech policy (times in world seconds; speed 1)
  let promptUntil = 0, pendingPrompt = null, promptStart = 0, lastWrongSay = -1e9, lastPraise = -1e9, lastPopSay = -1e9, idleSaid = 0;
  let lastNamed = { id: null, t: -1e9 }, lastPromptText = '', lastAsk = null;
  const prompts = [];
  function speakPrompt(txt, opt) {
    pendingPrompt = txt; promptStart = now; promptUntil = now + 6 + 0.072 * txt.length;
    const it = say(txt, Object.assign({ kind: 'prompt' }, opt)); return it;
  }
  function onStart(it) { if (pendingPrompt && it.text === pendingPrompt) { promptStart = now; promptUntil = now + (VP.includes('guard') ? 0.6 + 0.095 * it.text.length : 0.3 + 0.072 * it.text.length); pendingPrompt = null; } }
  const canInterrupt = () => now > promptUntil;
  const st = () => w.stepInfo || null;
  const ev2 = e => { const s = st(), p = w.pieceById(e.id); return Object.assign({ topic: w.topic, params: s ? s.params : lastAsk && lastAsk.params, promptKey: s ? s.promptKey : lastAsk && lastAsk.promptKey }, e, { thing: e.thing || (p && p.thing) }); };
  const line = (fn, e, fb) => { try { const t = I[fn](lang, e, rng); if (t) return t; } catch (er) { /* */ } return fb ? T(fb) : ''; };
  const askText = e => I.ask(lang, e.promptKey, Object.assign({ child: '' }, e.params || {}), { next: !e.first && e.step > 0, rng });
  const currentPrompt = () => lastPromptText || (w.prompt() ? askText(Object.assign({ first: true, step: 0 }, w.prompt())) : '');
  const S = { askT: [], countRuns: 0 };
  function onEvent(e) {
    switch (e.type) {
      case 'level': say(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true, kind: 'chapter' }); say(T('weather.' + (e.weather % 4)), { kind: 'weather' }); break;
      case 'round': idleSaid = 0; lastAsk = null; lastPromptText = ''; break;
      case 'ask': { lastAsk = e; idleSaid = 0; const txt = askText(e); lastPromptText = txt; const it = speakPrompt(txt, { priority: true }); prompts.push(it); break; }
      case 'pickup': if (canInterrupt() && !(lastNamed.id === e.id && now - lastNamed.t < 2)) { lastNamed = { id: e.id, t: now }; say(line('sayPickup', ev2(e)), { interrupt: true, kind: 'pickup' }); } break;
      case 'tapPiece': if (canInterrupt() && !(lastNamed.id === e.id && now - lastNamed.t < 1.2)) { lastNamed = { id: e.id, t: now }; say(line('sayTap', ev2(e)), { interrupt: true, kind: 'tap' }); } break;
      case 'placed': { promptUntil = 0; pendingPrompt = null; const SP = { en: ['Click!', 'Click! It fits!', 'Yes! Click!'], vi: ['Cạch!', 'Cạch! Vừa khít!', 'Đúng rồi! Cạch!'] };
        const txt = VP.includes('shortPlaced') && !e.count && (w.topic === 'colors' || w.topic === 'shapes' || w.topic === 'animals' || w.topic === 'size') ? SP[lang][Math.floor(rng.next() * 3)] : line('sayPlaced', ev2(e), 'praise'); say(txt, { interrupt: true, kind: e.count ? 'countRun' : 'placed' }); if (e.count) { S.countRuns++; promptUntil = now + 0.9 + 0.6 * (e.count.n || 1); } break; }
      case 'nearMiss': { const t = T('nearMiss'); say(t, { interrupt: canInterrupt(), kind: 'nearMiss' }); if (VP.includes('fbguard')) promptUntil = Math.max(promptUntil, now + 0.6 + 0.095 * t.length); break; }
      case 'wrong': if (now - lastWrongSay > 1.5) { lastWrongSay = now; const t = line('sayWrong', ev2(e), 'hint'); say(t, { interrupt: canInterrupt(), kind: 'wrong' }); if (VP.includes('fbguard')) promptUntil = Math.max(promptUntil, now + 0.6 + 0.095 * t.length); } break;
      case 'hint': if (!e.idle) say(T('hint'), { kind: 'hint' }); break;
      case 'assist': say(T('hint'), { kind: 'assist' }); break;
      case 'idle': if (++idleSaid <= 4) say(T('idle') + ' ' + currentPrompt(), { kind: 'idle' }); break;
      case 'pokePom': { if (speaking() && V.cur.text === lastPromptText) break; const since = now - promptStart, stuck = pendingPrompt && since > 6;
        if (since > 3 && (!pendingPrompt || stuck)) { promptUntil = 0; speakPrompt(currentPrompt(), { interrupt: true }); } break; }
      case 'roundDone': if (!VP.includes('praiseOnly')) say(T('alive'), { kind: 'alive' }); if (now - lastPraise > 1.2) { lastPraise = now; say(T(e.stars >= 3 ? 'great' : 'praise'), { kind: 'praise' }); } break;
      case 'toot': if (!speaking()) say(T('toot'), { kind: 'toot' }); break;
      case 'pigeon': if (canInterrupt()) say(T('surprise.pigeon'), { kind: 'surprise' }); break;
      case 'pigeonTap': if (canInterrupt()) say(T('pigeon.tap'), { interrupt: true, kind: 'surprise' }); break;
      case 'bubbles': if (canInterrupt()) say(T('surprise.bubbles'), { kind: 'surprise' }); break;
      case 'bubblePop': if (now - lastPopSay > 2 && canInterrupt()) { lastPopSay = now; say(T('bubble.pop'), { interrupt: true, kind: 'surprise' }); } break;
      case 'talk': { const tk = e.talk || w.talk; speakPrompt(T('talk.intro') + ' ' + T(tk.promptKey, tk.params || {}), { priority: true }); break; }
      case 'talkAsk': { const tk = e.talk || w.talk; if (tk && e.n <= 3) say(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true, kind: 'talkAsk' }); break; }
      case 'talkResult': { const ans = (w.talk && w.talk.choices.find(c => c.id === e.answerId)) || {};
        say(e.correct && !e.auto ? T('talk.right') : I.talkWrong(lang, ans), { interrupt: true, kind: 'talkResult' }); break; }
      case 'levelDone': say(T('great'), { kind: 'chapterPraise' }); break;
      case 'sessionDone': say(T('party'), { interrupt: true, kind: 'end' }); say(T('session.done', { stars: e.stars || 0 }), { kind: 'end' }); break;
    }
  }
  w.newSession();
  const dt = 1 / 60;
  let playT = 0, talkT = 0;
  while (w.state !== 'sessionDone' && now < 1500) {
    kid.step(dt); w.update(dt); now += dt;
    if (w.state === 'round' || w.state === 'roundDone' || w.state === 'talk') { playT += dt; if (V.cur) talkT += dt; }
    for (const e of w.drainEvents()) { if (kid.onEvent) kid.onEvent(e); onEvent(e); }
    voiceStep();
  }
  for (let k = 0; k < 600 && (V.cur || V.q.length); k++) { now += 0.05; voiceStep(); }
  // prompt delay / cut
  const pr = prompts.map(p => ({ by: p.by, frac: p.start != null ? (p.end - p.start) / p.d : 0, delay: p.start != null ? p.start - p.t : null, cut: p.how === 'cut' && p.start != null && (p.end - p.start) < 0.9 * p.d, lost: p.start == null }));
  const all = heard.concat(lost).sort((a, b) => a.t - b.t);
  let rep10 = 0; const repEx = [];
  const hs = heard.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < hs.length; i++) for (let j = i - 1; j >= 0 && hs[i].start - hs[j].start < 10; j--) if (hs[j].text === hs[i].text) { rep10++; if (repEx.length < 5) repEx.push(hs[i].kind + ': ' + hs[i].text); break; }
  return { model: o.model, age: o.age, lang, minutes: now / 60, playT, talkT, heard: heard.map(h => ({ kind: h.kind, by: h.by, text: h.text, cut: h.how === 'cut' && (h.end - h.start) < 0.9 * h.d, frac: (h.end - h.start) / h.d })),
    lost: lost.map(l => ({ kind: l.kind, how: l.how, text: l.text })), prompts: pr, rep10, repEx, countRuns: S.countRuns, log: DUMP ? all.map(a => `${a.t.toFixed(1)} ${a.start != null ? '+' + (a.start - a.t).toFixed(1) : ' lost'} [${a.kind}${a.how && a.how !== 'end' ? ' ' + a.how : ''}] ${a.text}`) : null };
}

const VPS = Object.keys(L.VIEWPORTS), res = [];
for (const model of MODELS) for (const age of AGES) for (const lang of LANGS) for (let i = 0; i < N; i++) res.push(runOne({ model, age, lang, seed: 500 + i * 31 + age, vp: VPS[i % VPS.length], config }));
const out = ['| model | age | lang | n | heard lines / min | Pom talks % of play | cut mid-line % (kinds) | never heard % (kinds) | prompt start delay s mean (p90) | prompts cut % / lost % | count runs cut | same line twice < 10 s / session | words / line |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
const top = (arr, k) => { const c = {}; arr.forEach(x => { c[x[k]] = (c[x[k]] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, b]) => a + ' ' + b).join(', '); };
const by = {};
for (const r of res) (by[r.model + '|' + r.age + '|' + r.lang] = by[r.model + '|' + r.age + '|' + r.lang] || []).push(r);
const texts = {}, extra = [];
for (const k of Object.keys(by)) {
  const ss = by[k], [model, age, lang] = k.split('|');
  const heard = ss.flatMap(s => s.heard), lost = ss.flatMap(s => s.lost), pr = ss.flatMap(s => s.prompts), cut = heard.filter(h => h.cut);
  const mins = ss.reduce((a, s) => a + s.playT, 0) / 60, talk = ss.reduce((a, s) => a + s.talkT, 0) / ss.reduce((a, s) => a + s.playT, 0) * 100;
  const del = pr.filter(p => p.delay != null).map(p => p.delay);
  const words = L.mean(heard.map(h => h.text.split(/\s+/).length));
  out.push(`| ${model} | ${age} | ${lang} | ${ss.length} | ${(heard.length / mins).toFixed(1)} | ${talk.toFixed(0)} | ${(cut.length / heard.length * 100).toFixed(1)} (${top(cut, 'kind')}) | ${(lost.length / (heard.length + lost.length) * 100).toFixed(1)} (${top(lost.map(l => ({ k: l.kind + '/' + l.how })), 'k')}) | ${L.mean(del).toFixed(2)} (${L.pct(del, 0.9).toFixed(2)}) | ${(pr.filter(p => p.cut).length / pr.length * 100).toFixed(1)} (by ${top(pr.filter(p => p.cut), 'by')}; heard ${(L.mean(pr.filter(p => p.cut).map(p => p.frac)) * 100).toFixed(0)} % of it) / ${(pr.filter(p => p.lost).length / pr.length * 100).toFixed(1)} | ${cut.filter(h => h.kind === 'countRun').length} of ${heard.filter(h => h.kind === 'countRun').length} | ${L.mean(ss.map(s => s.rep10)).toFixed(2)} | ${words.toFixed(1)} |`);
  const full = k2 => { const h = heard.filter(x => x.kind === k2), l = lost.filter(x => x.kind === k2); return `${k2} heard in full ${((h.length - h.filter(x => x.cut).length) / Math.max(1, h.length + l.length) * 100).toFixed(0)} % of ${h.length + l.length}`; };
  extra.push(`- ${model} ${age} ${lang}: ` + ['prompt', 'praise', 'alive', 'chapterPraise', 'hint', 'wrong', 'placed', 'pickup'].map(full).join(' · '));
  if (model === 'typical' && +age === 4) for (const h of heard) texts[lang + ' ' + h.text] = (texts[lang + ' ' + h.text] || 0) + 1;
}
const sessions = res.filter(r => r.model === 'typical' && r.age === 4).length || 1;
out.push('', 'Heard in full (not cut, not lost):', ...extra);
out.push('', 'Most heard lines (typical age 4, per session):', ...Object.entries(texts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t, c]) => `- ${(c / (sessions / LANGS.length)).toFixed(1)}× ${t}`));
const ex = res.flatMap(r => r.repEx).slice(0, 6); if (ex.length) out.push('', 'Repeats within 10 s (examples):', ...ex.map(x => '- ' + x));
console.log(`# voice_flow — ${res.length} sessions, config ${JSON.stringify(config)} vpatch ${VP.join(',')}\n\n` + out.join('\n'));
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'voice_flow' + (get('tag', '') ? '_' + get('tag') : '') + '.md'), out.join('\n') + '\n');
if (DUMP) { const r = res[0]; fs.writeFileSync(path.join(__dirname, 'out', 'voice_flow_log.txt'), r.log.join('\n') + '\n'); console.log('\n' + r.log.slice(0, 120).join('\n')); }
