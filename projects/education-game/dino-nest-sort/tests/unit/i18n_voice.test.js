#!/usr/bin/env node
// Dino Nest Sort — unit tests for i18n.js, voice.js (+ input.js loads).
// Run from projects/education-game/dino-nest-sort:   node tests/unit/i18n_voice.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');

function makeSandbox(extra) {
  const sb = Object.assign({ console, Math, Date, JSON, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { userAgent: 'node-test', platform: 'Linux', maxTouchPoints: 0 } }, extra || {});
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}
function load(sb, files) {
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sb, { filename: f });
  return sb.DN;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.DN = { debug: { voiceLog: [] } };
let DN;
try { DN = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = DN.I18N, V = DN.Voice;

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'shapes', 'size', 'homes', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const UI = ['title', 'subtitle', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings', 'holdForParents', 'age',
  'language', 'name', 'namePlaceholder', 'sound', 'music', 'voice', 'mic', 'done', 'stars', 'chapter', 'allDone', 'welcome',
  'micUnsupported', 'tapOrSay', 'listening'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(TOPICS.map(k => 'p.' + k))
  .concat(['color', 'shape', 'size', 'home', 'number', 'letter', 'parity'].map(k => 'say.correct.' + k))
  .concat(['praise', 'great', 'wrong', 'miss', 'hint', 'idle', 'talk.intro', 'talk.right', 'talk.wrong', 'session.done'])
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}

section('no negative words for mistakes');
for (const k of ['wrong', 'miss', 'hint', 'talk.wrong', 'talk.wrong.home', 'talk.wrong.letter']) {
  const all = [].concat(I.raw('en', k)).join(' ').toLowerCase();
  ok(!/\b(no|wrong|bad|not|fail|incorrect)\b/.test(all), `en ${k} has no negative words`);
  const vi = [].concat(I.raw('vi', k)).join(' ').toLowerCase();
  ok(!/\b(sai|dở|tệ)\b/u.test(vi) && vi.indexOf('sai') < 0, `vi ${k} has no negative words`);
}

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, fruit: 'apple', stars: 7, child: 'Mai', answer: 'X', name: 'Y', homeAt: 'pond' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let i = 0; i < raw.length; i++) {
    for (const child of ['Mai', '']) {
      const rng = { next: () => (i + 0.5) / raw.length };
      const s = I.t(lang, k, Object.assign({}, FULL, { child }), rng);
      ok(s.indexOf('{') < 0 && s.indexOf('}') < 0, `${lang} ${k}[${i}] child=${JSON.stringify(child)} fully replaced: ${s}`);
      ok(s.length > 0, `${lang} ${k} non-empty`);
      if (!child && k !== 'ui.namePlaceholder') ok(s.indexOf('Mai') < 0, `${lang} ${k} without a name does not use one`);
      if (!/^ui\./.test(k)) {
        const words = s.split(/\s+/).filter(Boolean).length;
        ok(words <= 12, `${lang} ${k}[${i}] ≤ 12 words (${words}): ${s}`);
      }
    }
  }
}
// missing params never leave braces
ok(I.t('en', 'p.count', {}).indexOf('{') < 0, 'missing params removed');
eq(I.t('xx', 'ui.play'), 'Play', 'unknown language falls back to English');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key returns the key');

section('params substitution');
eq(I.t('en', 'p.count', { n: 3, fruit: 'apple' }), 'Put 3 apples in the nest!', 'en count plural');
eq(I.t('en', 'p.count', { n: 1, fruit: 'strawberry' }), 'Put 1 strawberry in the nest!', 'en count singular');
eq(I.t('en', 'p.count', { n: 2, fruit: 'strawberry' }), 'Put 2 strawberries in the nest!', 'en count strawberries');
eq(I.t('vi', 'p.count', { n: 3, fruit: 'apple' }), 'Bé đặt 3 quả táo vào tổ nhé!', 'vi count');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Bo. Let’s play!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Bo. Let’s play!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Bo đây. Mình cùng chơi nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Bo đây. Mình cùng chơi nhé!', 'vi welcome with name');
I.setChild('An');
ok(I.t('en', 'ui.welcome').indexOf('An') > 0, 'setChild is the default {child}');
I.setChild('');
eq(I.t('en', 'say.correct.home', { name: { kind: 'animal', value: 'duck' }, homeAt: 'pond' }, () => 0),
  'The duck lives in the pond!', 'object params are named');
eq(I.t('en', 'p.colors'), 'Put each egg in the nest of the same color!', 'en colors prompt');
eq(I.t('vi', 'p.colors'), 'Bé ơi, hãy đặt mỗi quả trứng vào tổ cùng màu nhé!', 'vi colors prompt');

section('names for every kind/value in §5.1');
const VALUES = {
  color: ['red', 'blue', 'yellow', 'green', 'orange', 'purple'],
  shape: ['circle', 'square', 'triangle', 'star', 'heart', 'rectangle'],
  size: ['big', 'small'],
  home: ['pond', 'tree', 'field', 'cave'],
  animal: ['fish', 'frog', 'duck', 'bird', 'owl', 'squirrel', 'rabbit', 'cow', 'sheep', 'bat', 'bear', 'hen', 'cat'],
  fruit: ['apple', 'banana', 'strawberry', 'orange'],
  parity: ['odd', 'even'],
  number: Array.from({ length: 21 }, (_, i) => i)
};
const LETTERS = new Set(('ABCDEFGHIKLMNOPRSTUW' + 'ABCDEGHIKLMNOPSTUVXY' + 'ĂÂĐÊÔƠƯ').split(''));
VALUES.letter = Array.from(LETTERS).concat(Array.from(LETTERS).map(c => c.toLowerCase()));
VALUES.sum = []; VALUES.diff = [];
for (let a = 1; a <= 19; a++) for (let b = 1; a + b <= 20; b++) VALUES.sum.push(a + '+' + b);
for (let a = 1; a <= 10; a++) for (let b = 1; b <= a; b++) VALUES.diff.push(a + '−' + b);
for (const lang of I.langs) {
  for (const kind of Object.keys(VALUES)) for (const v of VALUES[kind]) {
    const n = I.name(lang, kind, v);
    ok(typeof n === 'string' && n.length > 0, `${lang} name ${kind} ${v}`);
    if (['color', 'shape', 'home', 'animal', 'fruit', 'parity', 'size'].includes(kind) && lang === 'vi')
      ok(n !== v || ['to'].includes(n), `vi name ${kind} ${v} is translated (${n})`);
    if (kind === 'sum' || kind === 'diff') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
    const w = I.words(lang, kind, v);
    ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${v}`);
    ok(w.every(x => x === x.toLowerCase()), `${lang} words ${kind} ${v} are lower-case`);
  }
  for (const e of sb.DN.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 0, `${lang} words for word ${e.word}`);
  }
}
const VI_WORDS = ['bò', 'cá', 'cú', 'cừu', 'cam', 'dơi', 'dâu', 'gấu', 'gà', 'mèo', 'sóc', 'táo', 'vịt', 'ếch'];
eq(sb.DN.WORDS.vi.map(w => w.word).join(','), VI_WORDS.join(','), 'vi initial word list');
eq(I.name('en', 'color', 'red'), 'red', 'en red');
eq(I.name('vi', 'color', 'red'), 'màu đỏ', 'vi red');
eq(I.name('vi', 'animal', 'duck'), 'con vịt', 'vi duck');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 7), 'bảy', 'vi 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('vi', 'number', 20), 'hai mươi', 'vi 20');
eq(I.name('en', 'letter', 'A'), 'A', 'en letter A');
eq(I.name('vi', 'letter', 'A'), 'a', 'vi letter A');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('vi', 'letter', 'Đ'), 'đờ', 'vi letter Đ');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'sum', '2+3'), 'hai cộng ba', 'vi sum');
eq(I.name('en', 'diff', '7−2'), 'seven minus two', 'en diff');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('en', 'parity', 'odd'), 'odd', 'en odd');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('vi', 'word', 'táo'), 'táo', 'vi word');
ok(I.words('en', 'color', 'blue').includes('blew'), 'blue/blew');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'number', 3).includes('3'), 'words include digits');

section('sayCorrect / talkWrong / speech');
const r0 = () => 0;
eq(I.sayCorrect('en', { nameKind: 'animal', nameValue: 'duck', label: { type: 'home', value: 'pond' } }, r0), 'The duck lives in the pond!', 'en home');
eq(I.sayCorrect('vi', { nameKind: 'animal', nameValue: 'duck', label: { type: 'home', value: 'pond' } }, r0), 'Con vịt sống dưới ao!', 'vi home');
eq(I.sayCorrect('en', { nameKind: 'sum', nameValue: '2+3', label: { type: 'number', value: 5 } }, r0), 'Yes! Two plus three makes five!', 'en sum');
eq(I.sayCorrect('vi', { nameKind: 'diff', nameValue: '7−2', label: { type: 'number', value: 5 } }, r0), 'Đúng rồi! Bảy trừ hai bằng năm!', 'vi diff');
eq(I.sayCorrect('en', { nameKind: 'word', nameValue: 'apple', label: { type: 'letter', value: 'A' } }, r0), 'Apple starts with the letter A!', 'en word');
eq(I.sayCorrect('vi', { nameKind: 'word', nameValue: 'táo', label: { type: 'letter', value: 'T' } }, r0), 'Táo bắt đầu bằng chữ tờ!', 'vi word');
eq(I.sayCorrect('vi', { nameKind: 'color', nameValue: 'red', label: { type: 'color', value: 'red' } }, r0), 'Đúng rồi! Màu đỏ đó!', 'vi color');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 7, label: { type: 'parity', value: 'odd' } }, r0), 'Yes! Seven is odd!', 'en parity');
eq(I.sayCorrect('en', { nameKind: 'fruit', nameValue: 'apple', label: { type: 'number', value: 3 }, count: 2 }, r0), 'Two!', 'count mode');
for (const lang of I.langs) for (const t of ['color', 'shape', 'size', 'home', 'number', 'letter', 'parity'])
  ok(I.sayCorrect(lang, { nameKind: 'color', nameValue: 'red', label: { type: t, value: t === 'number' ? 3 : 'x' } }).indexOf('{') < 0, `${lang} sayCorrect ${t}`);
eq(I.talkWrong('en', 'home', 'cave'), 'It lives in the cave! Good try!', 'en talkWrong home');
eq(I.talkWrong('vi', { kind: 'color', value: 'blue' }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong');
eq(I.speech('en', 'That is the letter B!'), 'That is the letter bee!', 'en letter speech');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');

// ------------------------------------------------------------------ matcher
section('matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green']);
const colVi = ch('vi', 'color', ['red', 'blue', 'green']);
eq(V.match(['red'], colEn), 'red', '"red"');
eq(V.match(['Red.'], colEn), 'red', '"Red."');
eq(V.match(["it's blue"], colEn), 'blue', '"it\'s blue"');
eq(V.match(['blew'], colEn), 'blue', '"blew"');
eq(V.match(['greene'], colEn), 'green', 'fuzzy "greene"');
eq(V.match(['màu đỏ'], colVi), 'red', '"màu đỏ"');
eq(V.match(['mau do'], colVi), 'red', '"mau do"');
eq(V.match(['Màu xanh lá cây'], colVi), 'green', '"xanh lá cây"');
eq(V.match(['xanh da trời'], colVi), 'blue', '"xanh da trời"');
eq(V.match(['xanh'], colVi), null, '"xanh" alone is ambiguous');
eq(V.match(['banana', 'hello', 'I like trains'], colEn), null, 'unrelated words → null');
eq(V.match(['hello'], ch('en', 'color', ['yellow', 'red'])), null, '"hello" is not yellow');
eq(V.match(['', 'red'], colEn), 'red', 'skips empty alternatives');
eq(V.match('blue', colEn), 'blue', 'accepts a single string');
const numVi = ch('vi', 'number', [3, 5, 12]);
const numEn = ch('en', 'number', [3, 5, 12]);
eq(V.match(['ba'], numVi), '3', '"ba" → 3');
eq(V.match(['three'], numEn), '3', '"three" → 3');
eq(V.match(['three'], numVi), '3', '"three" in vi mode → 3');
eq(V.match(['3'], numVi), '3', '"3" → 3');
eq(V.match(['12'], numEn), '12', '"12" → 12');
eq(V.match(['mười hai'], numVi), '12', '"mười hai" → 12, not 2/10');
eq(V.match(['muoi hai'], numVi), '12', '"muoi hai" → 12');
eq(V.match(['twelve'], numVi), '12', '"twelve" vi mode → 12');
eq(V.match(['năm'], numVi), '5', '"năm" → 5');
eq(V.match(['I think five'], numEn), '5', '"I think five"');
eq(V.match(['xin chào'], numVi), null, 'unrelated vi words → null');
eq(V.match(['to'], ch('en', 'number', [2, 4])), '2', 'solo "to" → 2');
eq(V.match(['go to the park'], ch('en', 'number', [2, 4])), null, '"to" inside a sentence is not 2');
eq(V.match(['không'], ch('vi', 'number', [0, 1])), '0', 'solo "không" → 0');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
const animVi = ch('vi', 'animal', ['duck', 'fish', 'frog']);
eq(V.match(['con vịt'], animVi), 'duck', '"con vịt" → duck');
eq(V.match(['vit'], animVi), 'duck', '"vit" → duck');
eq(V.match(['con ếch'], animVi), 'frog', '"con ếch" → frog');
const parVi = ch('vi', 'parity', ['odd', 'even']);
eq(V.match(['lẻ'], parVi), 'odd', '"lẻ" → odd');
eq(V.match(['số chẵn'], parVi), 'even', '"số chẵn" → even');
eq(V.match(['chan'], parVi), 'even', '"chan" → even');
eq(V.match(['odd'], ch('en', 'parity', ['odd', 'even'])), 'odd', 'en odd');
const homesVi = ch('vi', 'home', ['pond', 'tree', 'cave']);
eq(V.match(['ở dưới ao'], homesVi), 'pond', 'vi pond');
eq(V.match(['trong hang'], homesVi), 'cave', 'vi cave');
const letEn = ch('en', 'letter', ['A', 'B', 'C']);
eq(V.match(["it's a B"], letEn), 'B', '"it\'s a B" → B (later word wins)');
eq(V.match(['bee'], letEn), 'B', '"bee" → B');
eq(V.match(['see'], letEn), 'C', '"see" → C');
const letVi = ch('vi', 'letter', ['B', 'C', 'T']);
eq(V.match(['bờ'], letVi), 'B', '"bờ" → B');
eq(V.match(['chữ tờ'], letVi), 'T', '"chữ tờ" → T');
eq(V.match(['xê'], letVi), 'C', '"xê" → C');
eq(V.match(['ê'], ch('vi', 'letter', ['E', 'Ê'])), 'Ê', '"ê" → Ê (diacritics first)');
eq(V.match(['e'], ch('vi', 'letter', ['E', 'Ê'])), 'E', '"e" → E');
eq(V.match(['big'], ch('en', 'size', ['big', 'small'])), 'big', 'en big');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['hình tam giác'], ch('vi', 'shape', ['circle', 'triangle', 'star'])), 'triangle', 'vi triangle');
eq(V.match(['ngôi sao'], ch('vi', 'shape', ['circle', 'triangle', 'star'])), 'star', 'vi star');
eq(V.match(['red'], [{ id: 'r', kind: 'color', value: 'red' }, { id: 'b', kind: 'color', value: 'blue' }], 'en'), 'r', '{id,kind,value} choices');
eq(V.match(['red'], []), null, 'no choices → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

// ------------------------------------------------------------------ voice no-op
section('voice without speechSynthesis');
V.init({ lang: 'en' });
V.unlock();
ok(!V.isSupported(), 'not supported in node');
ok(!V.canListen(), 'canListen false without SpeechRecognition');
ok(!V.hasVoice('vi'), 'hasVoice false');
eq(V.voiceName(), '', 'voiceName empty');
const p = V.say('Hello there');
ok(p && typeof p.then === 'function', 'say returns a promise');
const pk = V.sayKey('ui.play');
eq(pk.text, 'Play', 'sayKey exposes text');
ok(V.log.some(e => e.text === 'Hello there' && e.lang === 'en' && typeof e.t === 'number'), 'logged even when unavailable');
ok(sb.DN.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into DN.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof DN.Input.attach === 'function' && typeof DN.Input.kidProof === 'function' && typeof DN.Input.holdButton === 'function',
  'input.js exports');

// ------------------------------------------------------------------ voice with a fake synth + recognizer
section('voice with fake speechSynthesis / SpeechRecognition');
(function () {
  const spoken = [];
  const fakeVoices = [
    { name: 'Fred', lang: 'en-US', localService: true },
    { name: 'Google US English', lang: 'en-US', localService: false },
    { name: 'Samantha', lang: 'en-US', localService: true, default: true },
    { name: 'Linh', lang: 'vi-VN', localService: true },
    { name: 'Thomas', lang: 'fr-FR', localService: true }
  ];
  const synth = {
    speaking: false, paused: false, onvoiceschanged: null,
    getVoices() { return fakeVoices; },
    speak(u) { spoken.push(u); this.speaking = true; setTimeout(() => { u.onstart && u.onstart(); }, 1); },
    cancel() { const c = spoken.filter(u => !u._ended); c.forEach(u => { u._ended = true; u.onerror && u.onerror({ error: 'interrupted' }); }); this.speaking = false; },
    pause() {}, resume() {}
  };
  function Utt(text) { this.text = text; }
  let recInst = null;
  function Rec() { recInst = this; this.started = false; }
  Rec.prototype.start = function () { this.started = true; };
  Rec.prototype.abort = function () { this.aborted = true; };
  Rec.prototype.stop = function () {};
  const sb2 = makeSandbox({ speechSynthesis: synth, SpeechSynthesisUtterance: Utt, webkitSpeechRecognition: Rec });
  sb2.DN = {};
  const D2 = load(sb2, ['i18n.js', 'voice.js']);
  const V2 = D2.Voice;
  V2.init({ lang: 'en' });
  eq(V2.voiceName('en'), 'Samantha', 'en picks Samantha over Fred/Google');
  eq(V2.voiceName('vi'), 'Linh', 'vi picks Linh');
  ok(V2.hasVoice('vi'), 'hasVoice vi');
  ok(V2.canListen(), 'canListen with webkitSpeechRecognition');
  let starts = 0, ends = 0;
  V2.onStart = () => starts++; V2.onEnd = () => ends++;
  const a = V2.say('before unlock');
  V2.unlock();
  const b = V2.say('one'), c = V2.say('two'), d = V2.say('three');
  asyncTests.push(new Promise(res => setTimeout(res, 150)).then(() => {
    const texts = spoken.map(u => u.text);
    ok(texts[0] === ' ', 'unlock speaks a silent utterance first');
    ok(spoken.some(u => ['before unlock', 'one', 'two', 'three'].includes(u.text)), 'queued line spoken after unlock');
    const cur = spoken[spoken.length - 1];
    eq(cur.lang, 'en-US', 'utterance lang en-US');
    ok(cur.voice && cur.voice.name === 'Samantha', 'utterance voice set');
    ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.15) < 1e-9, 'rate 0.9 pitch 1.15');
    ok(V2.isSpeaking(), 'isSpeaking true while talking');
    ok(starts >= 1, 'onStart fired');
    cur._ended = true; synth.speaking = false; cur.onend();
    return Promise.all([a, b, c, d]).catch(() => null).then(() => 0);
  }).then(() => new Promise(res => setTimeout(res, 60))).then(() => {
    ok(ends >= 1, 'onEnd fired');
    // queue max 2: four lines were asked for, at least one dropped
    const all = spoken.map(u => u.text).filter(t => t !== ' ');
    ok(all.length <= 3, 'queue capped (spoken so far: ' + all.join('|') + ')');
    // interrupt
    const before = spoken.length;
    V2.say('Xin chào', { lang: 'vi', interrupt: true });
    return new Promise(res => setTimeout(res, 150)).then(() => {
      const last = spoken[spoken.length - 1];
      ok(spoken.length > before && last.text === 'Xin chào' && last.lang === 'vi-VN', 'interrupt speaks now in vi-VN');
      ok(last.voice && last.voice.name === 'Linh', 'vi voice Linh used');
      V2.stop();
      ok(!V2.isSpeaking(), 'stop() clears speaking');
    });
  }).then(() => {
    // listening: interim then final
    const pr = V2.listen({ lang: 'vi', choices: [{ id: 'r', kind: 'color', value: 'red' }, { id: 'b', kind: 'color', value: 'blue' }], timeoutMs: 2000 });
    ok(recInst && recInst.started && recInst.lang === 'vi-VN' && recInst.maxAlternatives === 5 && recInst.interimResults === true, 'recognizer configured');
    const alt = (t) => ({ transcript: t, confidence: 0.9 });
    const result = (isFinal, ...ts) => { const r = ts.map(alt); r.isFinal = isFinal; return r; };
    recInst.onresult({ resultIndex: 0, results: [result(true, 'mầu đổ', 'màu đỏ')] });
    return pr.then(r => {
      eq(r.id, 'r', 'listen resolves on a final match');
      ok(recInst.aborted, 'recognizer aborted after match');
    });
  }).then(() => {
    const pr = V2.listen({ lang: 'en', choices: colEn, timeoutMs: 2000 });
    recInst.onerror({ error: 'not-allowed' });
    return pr.then(r => {
      eq(r.reason, 'not-allowed', 'permission denied reason');
      ok(!V2.canListen(), 'canListen false for the session after denial');
    });
  }).then(() => {
    // timeout path on a fresh instance
    const sb3 = makeSandbox({ webkitSpeechRecognition: Rec });
    sb3.DN = {};
    const V3 = load(sb3, ['i18n.js', 'voice.js']).Voice;
    const pr = V3.listen({ lang: 'en', choices: colEn, timeoutMs: 40 });
    return pr.then(r => eq(r.reason, 'timeout', 'listen times out'));
  }));
})();

Promise.all(asyncTests).then(() => {
  console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, (e) => { console.log('FAIL  async error: ' + (e && e.stack)); process.exit(1); });
