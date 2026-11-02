#!/usr/bin/env node
// Bim's Rainbow Rocket — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/elephant-rainbow-rocket:   node tests/unit/i18n_voice.test.js
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
  return sb.RR;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
const NEG_EN = /\b(no|not|wrong|bad|fail|failed|incorrect|oh no|mistake|oops)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|dở|tệ|hỏng|không đúng|chưa đúng|trật|sai rồi)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
const r0 = () => 0, r9 = () => 0.99;
const nWords = (s) => String(s).split(/\s+/).filter(Boolean).length;
function clean(s) {
  return typeof s === 'string' && s.trim().length > 0 && s.indexOf('{') < 0 && s.indexOf('}') < 0 &&
    !/undefined|null|NaN|\[object/.test(s) && !/\s[!?.,]/.test(s) && !/^[!?.,]/.test(s);
}

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.RR = { debug: { voiceLog: [] } };
let RR;
try { RR = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = RR.I18N, V = RR.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js'])
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(JS, f), 'utf8')), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const ANIMALS = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'];   // DESIGN §5.1
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapBim', 'years', 'skip', 'langName.en', 'langName.vi'];
const PROMPT_KEYS = ['p.colors', 'p.colors.night', 'p.shapes', 'p.countUp', 'p.count', 'p.animals', 'p.sound', 'p.size',
  'p.letters', 'p.lower', 'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(PROMPT_KEYS).concat(['p.any'])
  .concat(['surprise.drift', 'surprise.shooting', 'shooting.tap', 'boost', 'boostGo', 'tapPad'])
  .concat(['praise', 'great', 'wrong', 'miss', 'hint', 'idle', 'talk.intro', 'talk.right', 'talk.wrong',
    'talk.animalsAny', 'talk.sound', 'session.done', 'say.countDone'])
  .concat(['go', 'go.sound', 'go.math', 'go.oddeven', 'go.initial', 'go.lower', 'collect', 'collect.animal', 'collect.number'])
  .concat(['wrong.it', 'wrong.oddeven', 'wrong.find', 'wrong.sound', 'wrong.math', 'wrong.initial', 'wrong.lower', 'wrong.parity'])
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
for (const k of Object.keys(I.PARAMS)) for (const lang of I.langs) ok(I.has(lang, k), `PARAMS key ${k} exists in ${lang}`);
eq(Object.keys(I.PROMPTS).sort().join(','), PROMPT_KEYS.slice().sort().join(','), 'PROMPTS lists every prompt key');
// keys the game code asks for at run time (files still copied from Dee's Forest Memory are skipped until rewired)
(function () {
  const files = ['main.js', 'ui.js', 'render.js', 'content.js', '../index.html'];
  const used = new Set();
  for (const f of files) {
    let src = '';
    try { src = fs.readFileSync(path.join(JS, f), 'utf8'); } catch (e) { continue; }
    if (/Forest Memory|Dee/.test(src.slice(0, 800))) { console.log(`   (${f} is still the Dee copy — key check skipped)`); continue; }
    src.replace(/['"`]((?:ui|talk|session|weather|topic|p|go|wrong|collect|surprise|shooting)\.[A-Za-z0-9.]*[A-Za-z0-9]|boost|boostGo|tapPad|praise|great|hint|idle|miss)['"`]/g,
      (m, k) => { used.add(k); return m; });
  }
  for (const k of used) {
    if (/\.$/.test(k)) continue;
    for (const lang of I.langs) ok(I.has(lang, k) || /^topic\.|^weather\.|^talk\.$/.test(k + '.'), `key used by the game code exists: ${lang} ${k}`);
  }
})();
const ALL_TEXT = I.langs.map(l => I.keys(l).map(x => [].concat(I.raw(l, x)).join(' ')).join(' ')).join(' ');
for (const k of ['Dee', 'duckling', 'card', 'thẻ', 'acorn', 'hạt dẻ', 'forest', 'rừng', 'fox', 'cáo', 'owl', 'butterfl', 'lantern',
  'Miu', 'balloon', 'Lumi'])
  ok(ALL_TEXT.toLowerCase().indexOf(k.toLowerCase()) < 0, `no leftover Dee/Kitten wording "${k}"`);
ok(/Bim/.test(I.t('en', 'ui.welcome', { child: '' })) && /Bim/.test(I.t('vi', 'ui.welcome', { child: '' })), 'helper is Bim in both languages');

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right', 'collect', 'boost']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}
for (const lang of I.langs) for (const k of ['great', 'idle', 'talk.right', 'boost']) {
  const v = I.raw(lang, k);
  ok(v.some(s => s.includes('{child}')) && v.some(s => !s.includes('{child}')), `${lang} ${k} has name + no-name variants`);
}
for (const lang of I.langs) for (const k of ['boostGo', 'surprise.drift', 'surprise.shooting', 'shooting.tap', 'tapPad', 'go'])
  ok(Array.isArray(I.raw(lang, k)) && I.raw(lang, k).length >= 2, `${lang} ${k} has ≥ 2 variants`);

section('Vietnamese wording sanity, titles');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'mau do', 'con bo', 'dam may', 'ten lua'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
ok(/Bé ơi/.test(viAll) && /nhé!/.test(viAll) && /nào!/.test(viAll) && /giỏi quá!/.test(viAll), 'vi uses "Bé ơi", "nhé!", "nào!", "giỏi quá!"');
ok(/đám mây/.test(viAll) && /tên lửa/.test(viAll) && /ngôi sao/.test(viAll), 'vi uses đám mây / tên lửa / ngôi sao');
eq(I.t('en', 'ui.title'), 'Bim’s Rainbow Rocket', 'en title');
eq(I.t('vi', 'ui.title'), 'Tên Lửa Cầu Vồng Của Voi Bim', 'vi title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Bim’s / Rainbow Rocket', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Voi Bim / Tên Lửa Cầu Vồng', 'vi logo lines');
eq(I.t('en', 'ui.voice'), 'Bim’s voice', 'en ui.voice');
eq(I.t('vi', 'ui.voice'), 'Giọng của Bim', 'vi ui.voice');
eq(I.t('en', 'ui.volume'), 'Volume', 'en ui.volume');
eq(I.t('vi', 'ui.volume'), 'Âm lượng', 'vi ui.volume');
eq(I.t('vi', 'ui.listening'), 'Bim đang nghe…', 'vi listening');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.chapter', { n: 3 }), 'Chương 3', 'vi chapter');
eq(I.t('en', 'weather.0'), 'Good morning, sky!', 'weather 0 morning');
eq(I.t('en', 'weather.1'), 'Hello, sunshine!', 'weather 1 noon');
eq(I.t('en', 'weather.2'), 'What a pretty sunset!', 'weather 2 sunset');
eq(I.t('en', 'weather.3'), 'Look at all the stars!', 'weather 3 night');
eq(I.t('vi', 'weather.3'), 'Nhìn kìa, bao nhiêu là sao!', 'vi weather 3 night');
eq(I.t('en', 'boost', {}, r0), 'Tap the rocket! Blast off!', 'en boost[0]');
eq(I.t('en', 'boostGo', {}, r0), 'Three, two, one… whoosh!', 'en boostGo[0] (no capital after …)');
eq(I.speech('en', I.t('en', 'boostGo', {}, r0)), 'Three, two, one. whoosh!', 'boostGo speech: … becomes a pause');

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  ok(positive([].concat(I.raw(lang, k)).join(' ')), `${lang} ${k} has no negative words`);
}

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, stars: 7, child: 'Mai', answer: 'X', it: 'red', want: 'blue', animal: 'cow', color: 'red', shape: 'star',
  size: 'big', letter: 'B', lower: 'b', text: 'B', word: 'cat', a: 2, b: 3, parity: 'odd', expr: '2 + 3', num: 'three' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let i = 0; i < raw.length; i++) {
    for (const child of ['Mai', '']) {
      const rng = { next: () => (i + 0.5) / raw.length };
      for (const params of [Object.assign({}, FULL, { child }), { child }, undefined]) {
        if (!params && child) continue;
        const s = I.t(lang, k, params || { child: '' }, rng);
        ok(clean(s), `${lang} ${k}[${i}] child=${JSON.stringify(child)} renders cleanly: ${s}`);
        if (!child && k !== 'ui.namePlaceholder') ok(s.indexOf('Mai') < 0, `${lang} ${k} without a name does not use one`);
        if (!/^ui\./.test(k)) ok(nWords(s) <= 13, `${lang} ${k}[${i}] ≤ 13 words (${nWords(s)}): ${s}`);
      }
    }
  }
}
eq(I.t('xx', 'ui.play'), 'Play', 'unknown language falls back to English');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key returns the key');
eq(I.t('en', 'p.nosuchtopic', {}, r0), 'Where shall we fly? Tap a cloud!', 'unknown prompt → p.any');
eq(I.t('vi', 'p.nosuchtopic', {}, r0), 'Mình bay đi đâu nhỉ? Bé chạm một đám mây nhé!', 'vi unknown prompt → p.any');
ok(clean(I.t('en', null)) || I.t('en', null) === '', 't with a null key does not throw');

section('prompts: 3 wordings, every param filled for every value');
for (const lang of I.langs) for (const k of PROMPT_KEYS.concat(['p.any'])) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length === 3 && new Set(v).size === 3, `${lang} ${k} has 3 different variants`);
}
const LETTERS_EN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_VALUES = {
  'p.colors': COLORS.map(c => ({ color: c })), 'p.colors.night': COLORS.map(c => ({ color: c })),
  'p.shapes': SHAPES.map(s => ({ shape: s })),
  'p.countUp': Array.from({ length: 12 }, (_, i) => ({ n: i + 1 })), 'p.count': Array.from({ length: 12 }, (_, i) => ({ n: i + 1 })),
  'p.animals': ANIMALS.map(a => ({ animal: a })), 'p.sound': ANIMALS.map(a => ({ animal: a })),
  'p.size': [].concat(...ANIMALS.map(a => [{ size: 'big', animal: a }, { size: 'small', animal: a }])),
  'p.letters': LETTERS_EN.map(l => ({ letter: l })), 'p.lower': LETTERS_EN.map(l => ({ letter: l })),
  'p.initial': LETTERS_EN.map(l => ({ letter: l })).concat([{ letter: 'Ê' }, { letter: 'S' }]),
  'p.add': [{ a: 2, b: 3 }, { expr: '4+5' }, { text: '1 + 1' }, { a: 9, b: 9 }],
  'p.sub': [{ a: 7, b: 2, op: '−' }, { expr: '5−3' }, { text: '9 - 4' }],
  'p.oddeven': [{ parity: 'odd' }, { parity: 'even' }]
};
for (const lang of I.langs) for (const k of PROMPT_KEYS) for (const params of PROMPT_VALUES[k]) for (let i = 0; i < 3; i++) {
  const s = I.t(lang, k, params, () => (i + 0.5) / 3);
  ok(clean(s) && positive(s) && nWords(s) <= 13 && !I.raw(lang, 'p.any').includes(s), `${lang} ${k}[${i}] ${JSON.stringify(params)}: ${s}`);
  if (params.color) ok(s.indexOf(I.name(lang, 'color', params.color)) >= 0 || s.toLowerCase().indexOf(I.name(lang, 'color', params.color)) >= 0, `${lang} ${k} names the colour: ${s}`);
  if (params.shape) ok(s.toLowerCase().indexOf(I.name(lang, 'shape', params.shape)) >= 0, `${lang} ${k} names the shape: ${s}`);
  if (k === 'p.animals' || k === 'p.size') ok(s.toLowerCase().indexOf(I.name(lang, 'animal', params.animal)) >= 0, `${lang} ${k} names the animal: ${s}`);
  if (k === 'p.sound') {
    ok(s.toLowerCase().indexOf(I.sound(lang, params.animal)) >= 0, `${lang} p.sound says the sound: ${s}`);
    const bareA = I.name(lang, 'animal', params.animal).replace(/^con /, '');
    if (I.sound(lang, params.animal).indexOf(bareA) < 0) ok(s.toLowerCase().indexOf(bareA) < 0, `${lang} p.sound does not give away the animal: ${s}`);
  }
  if (k === 'p.size') ok(s.indexOf(I.name(lang, 'size', params.size)) >= 0, `${lang} p.size says the size: ${s}`);
  if (k === 'p.countUp' || k === 'p.count') ok(s.indexOf(String(params.n)) >= 0, `${lang} ${k} shows the number: ${s}`);
  if (k === 'p.count' && lang === 'en') ok(params.n === 1 ? / 1 star\b/.test(s) && !/ 1 stars/.test(s) : / stars\b/.test(s), `${lang} p.count singular/plural: ${s}`);
  if (k === 'p.initial' || k === 'p.letters') ok(s.indexOf(params.letter) >= 0, `${lang} ${k} shows the letter: ${s}`);
  if (k === 'p.add' || k === 'p.sub') ok(/\d [+−] \d/.test(s), `${lang} ${k} shows the sum: ${s}`);
  if (k === 'p.oddeven') ok(s.indexOf(I.name(lang, 'parity', params.parity)) >= 0, `${lang} p.oddeven says the parity: ${s}`);
}
eq(I.t('en', 'p.colors', { color: 'red' }, r0), 'Fly to the red cloud!', 'en p.colors');
eq(I.t('en', 'p.colors.night', { color: 'red' }, r0), 'Fly to the red planet!', 'en p.colors.night');
eq(I.t('vi', 'p.colors', { color: 'red' }, r0), 'Bé ơi, bay tới đám mây màu đỏ nhé!', 'vi p.colors');
eq(I.t('vi', 'p.colors.night', { color: 'blue' }, r0), 'Bé ơi, bay tới hành tinh màu xanh dương nhé!', 'vi p.colors.night');
eq(I.t('en', 'p.shapes', { shape: 'star' }, r0), 'Find the star!', 'en p.shapes');
eq(I.t('en', 'p.countUp', { n: 2 }, r0), 'Let’s count up! Fly to 2!', 'en p.countUp');
eq(I.t('en', 'p.countUp', { n: 3 }, () => 0.5), 'Now 3!', 'en p.countUp short');
eq(I.t('en', 'p.count', { n: 1 }, r0), 'Find 1 star! Fly there!', 'en p.count singular');
eq(I.t('vi', 'p.count', { n: 3 }, r0), 'Bé ơi, tìm 3 ngôi sao nhé!', 'vi p.count');
eq(I.t('en', 'p.animals', { animal: 'cow' }, r0), 'Let’s pick up the cow!', 'en p.animals');
eq(I.t('en', 'p.sound', { animal: 'cow' }, r0), 'Who says moo? Fly to them!', 'en p.sound');
eq(I.t('en', 'p.sound', { animal: 'cow' }, () => 0.5), 'Listen! Moo! Who says that?', 'en p.sound sentence-capitalised');
eq(I.t('vi', 'p.sound', { animal: 'pig' }, r0), 'Con gì kêu ụt ịt? Bé bay tới đó nhé!', 'vi p.sound');
eq(I.t('en', 'p.sound', { sound: 'dog' }, r0), 'Who says woof? Fly to them!', 'p.sound from a {sound: animal id}');
eq(I.t('en', 'p.size', { size: 'big', animal: 'cow' }, r0), 'Fly to the big cow!', 'en p.size');
eq(I.t('en', 'p.size', { size: 'small', animal: 'pig' }, r0), 'Fly to the little pig!', 'en p.size small');
eq(I.t('vi', 'p.size', { size: 'small', animal: 'cow' }, r0), 'Bé ơi, bay tới con bò nhỏ nhé!', 'vi p.size');
eq(I.t('en', 'p.letters', { letter: 'B' }, r0), 'Fly to the letter B!', 'en p.letters');
eq(I.t('en', 'p.lower', { letter: 'B' }, r0), 'Big letter B! Find its small letter!', 'en p.lower');
eq(I.t('en', 'p.initial', { letter: 'F' }, r0), 'Who starts with the letter F? Fly there!', 'en p.initial');
eq(I.t('vi', 'p.initial', { letter: 'B' }, r0), 'Bạn nào bắt đầu bằng chữ B? Bé bay tới đó nhé!', 'vi p.initial');
eq(V.spoken('vi', 'Bạn nào bắt đầu bằng chữ B?'), 'Bạn nào bắt đầu bằng chữ bờ?', 'vi p.initial spoken with phonics');
eq(I.t('en', 'p.add', { a: 2, b: 3 }, r0), 'What is 2 + 3? Fly to the answer!', 'en p.add');
eq(I.t('vi', 'p.sub', { a: 7, b: 2, op: '−' }, r0), '7 − 2 bằng mấy? Bé bay tới đáp số nhé!', 'vi p.sub');
eq(I.t('en', 'p.oddeven', { parity: 'odd' }, r0), 'Fly to an odd number!', 'en p.oddeven (a → an)');
eq(I.t('en', 'p.oddeven', { parity: 'even' }, r0), 'Fly to an even number!', 'en p.oddeven even');
eq(I.t('vi', 'p.oddeven', { parity: 'even' }, r0), 'Bé ơi, bay tới số chẵn nhé!', 'vi p.oddeven');
// a missing param never shows a hole: falls back to p.any
for (const lang of I.langs) for (const k of PROMPT_KEYS) for (const params of [undefined, null, {}, { child: 'An' }, 'junk', 7]) {
  const s = I.t(lang, k, params);
  ok(clean(s) && s !== k && nWords(s) <= 13, `${lang} ${k} renders with params ${JSON.stringify(params)}: ${s}`);
}
ok(I.raw('en', 'p.any').includes(I.t('en', 'p.colors', {})), 'p.colors without a colour → p.any');

section('talk, session, child name');
eq(I.t('en', 'talk.animals', { animal: 'cow' }), 'Where is the cow?', 'en talk.animals');
eq(I.t('vi', 'talk.animals', { animal: 'cow' }), 'Con bò đâu rồi nhỉ?', 'vi talk.animals');
eq(I.t('vi', 'talk.animals', { animal: { kind: 'animal', value: 'duck' } }), 'Con vịt đâu rồi nhỉ?', 'vi talk.animals object param');
eq(I.t('en', 'talk.animals', { animal: 'animal_pig' }), 'Where is the pig?', 'talk.animals from a sprite id');
eq(I.t('en', 'talk.animals', {}), 'Which animal is this?', 'talk.animals fallback');
eq(I.t('en', 'talk.sound', { animal: 'sheep' }), 'Who says baa?', 'en talk.sound');
eq(I.t('vi', 'talk.sound', { animal: 'duck' }), 'Con gì kêu cạp cạp nhỉ?', 'vi talk.sound');
eq(I.t('en', 'talk.count'), 'How many stars?', 'en talk count');
eq(I.t('vi', 'talk.count'), 'Có mấy ngôi sao nào?', 'vi talk count');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'session.done', { stars: 14 }, r0), 'You did it all! 14 stars! Hooray!', 'en session.done');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Bim. Let’s fly my rocket!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Bim. Let’s fly my rocket!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Mình là voi Bim. Mình cùng bay tên lửa nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Mình là voi Bim. Mình cùng bay tên lửa nhé!', 'vi welcome with name');
I.setChild('An');
ok(I.t('en', 'ui.welcome').indexOf('An') > 0, 'setChild is the default {child}');
ok(I.raw('en', 'great').map((s, i) => I.t('en', 'great', {}, () => (i + 0.5) / 7)).some(s => s.includes('An')), 'great uses the child name');
I.setChild('');
for (let i = 0; i < 7; i++) {
  const s = I.t('vi', 'great', {}, () => (i + 0.5) / 7);
  ok(clean(s) && !/bé \s|Bé !/.test(s), 'vi great without name reads well: ' + s);
}
for (const r of [() => NaN, () => 1, () => -3, { next: () => 2 }, 'x'])
  ok(clean(I.t('en', 'praise', {}, r)), 'odd rng values still pick a variant');

section('names, sounds, words for every kind/value');
const VALUES = {
  color: COLORS,
  shape: SHAPES,
  size: ['big', 'small'],
  animal: ANIMALS,
  parity: ['odd', 'even'],
  number: Array.from({ length: 21 }, (_, i) => i),
  stars: Array.from({ length: 12 }, (_, i) => i + 1),
  text: ['2 + 3', '7 − 2', '5', 'B', 'cow'],
  word: [].concat(ANIMALS.map(a => 'animal_' + a))
};
const LETTERS = new Set(('ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'ĂÂĐÊÔƠƯ').split(''));
VALUES.letter = Array.from(LETTERS).concat(Array.from(LETTERS).map(c => c.toLowerCase()));
VALUES.sum = []; VALUES.diff = [];
for (let a = 1; a <= 19; a++) for (let b = 1; a + b <= 20; b++) VALUES.sum.push(a + '+' + b);
for (let a = 1; a <= 10; a++) for (let b = 0; b <= a; b++) VALUES.diff.push(a + '−' + b);
eq(I.NAME_KINDS.join(','), 'color,shape,size,animal,number,stars,letter,text,sum,diff,parity,word', 'NAME_KINDS');
for (const k of I.NAME_KINDS) ok(VALUES[k], `test covers name kind ${k}`);
for (const lang of I.langs) {
  for (const kind of Object.keys(VALUES)) {
    for (const v of VALUES[kind]) {
      const n = I.name(lang, kind, v);
      ok(typeof n === 'string' && n.length > 0 && !/undefined|null/.test(n), `${lang} name ${kind} ${v}`);
      if (['color', 'shape', 'animal', 'parity', 'size'].includes(kind) && lang === 'vi')
        ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
      if (kind === 'sum' || kind === 'diff' || kind === 'stars') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
      const w = I.words(lang, kind, v);
      ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${v}`);
      ok(w.every(x => typeof x === 'string' && x === x.toLowerCase()), `${lang} words ${kind} ${v} are lower-case`);
      if (!['letter', 'text', 'sum', 'diff'].includes(kind) && !(lang === 'vi' && kind === 'number' && v === 0)) ok(w.includes(n.toLowerCase()), `${lang} words ${kind} ${v} include the name "${n}"`);
      if (lang === 'vi' && kind !== 'letter' && !(kind === 'text' && /^\p{L}$/u.test(v))) ok(w.every(x => w.includes(I.stripMarks(x).toLowerCase())), `vi words ${kind} ${v} include no-diacritic forms`);
      if (kind === 'number' || kind === 'stars') ok(w.includes(String(v)), `${lang} words ${kind} ${v} include the digit`);
    }
  }
  for (const e of sb.RR.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 1, `${lang} words for word ${e.word} include the animal forms`);
    const first = e.word.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').charAt(0).toUpperCase();
    ok(first === e.initial, `${lang} word ${e.word} starts with ${e.initial} (tone marks ignored)`);
  }
}
eq(sb.RR.WORDS.vi.map(w => w.word + w.initial).join(','), 'mèoM,bòB,heoH,cừuC,vịtV,sư tửS,ếchÊ', 'vi initial words (no ch digraph)');
eq(sb.RR.WORDS.en.map(w => w.word + w.initial).join(','), 'catC,dogD,cowC,pigP,sheepS,duckD,lionL,frogF', 'en initial words');
const VI_ANIMAL = { cat: 'con mèo', dog: 'con chó', cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', lion: 'con sư tử', frog: 'con ếch' };
const SOUND_EN = { cat: 'meow', dog: 'woof', cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', lion: 'roar', frog: 'ribbit' };
const SOUND_VI = { cat: 'meo meo', dog: 'gâu gâu', cow: 'ùm bò', pig: 'ụt ịt', sheep: 'be be', duck: 'cạp cạp', lion: 'gừm gừm', frog: 'ộp ộp' };
for (const a of ANIMALS) {
  eq(I.name('en', 'animal', a), a, 'en animal ' + a); eq(I.name('vi', 'animal', a), VI_ANIMAL[a], 'vi animal ' + a);
  eq(I.sound('en', a), SOUND_EN[a], 'en sound ' + a); eq(I.sound('vi', a), SOUND_VI[a], 'vi sound ' + a);
  eq(I.sound('en', 'animal_' + a), SOUND_EN[a], 'sound from a sprite id ' + a);
  ok(I.hasSound(a), 'hasSound ' + a);
}
eq(I.sound('en', 'zebra'), '', 'unknown animal has no sound');
ok(I.words('vi', 'animal', 'pig').includes('lợn') && I.words('vi', 'animal', 'pig').includes('con lợn'), 'vi pig accepts "lợn"');
ok(I.words('vi', 'animal', 'pig').includes('lon'), 'vi pig accepts "lon" (no diacritics)');
ok(I.words('vi', 'animal', 'dog').includes('cún'), 'vi dog accepts "cún"');
ok(I.words('en', 'animal', 'dog').includes('puppy') && I.words('en', 'animal', 'cat').includes('kitty'), 'en puppy / kitty');
eq(I.name('en', 'animal', 'animal_duck'), 'duck', 'animal from sprite id');
eq(I.name('vi', 'color', 'pink'), 'màu hồng', 'vi pink');
eq(I.name('vi', 'shape', 'heart'), 'hình trái tim', 'vi heart');
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'en rect');
eq(I.name('en', 'shape', 'diamond'), 'diamond', 'en diamond');
eq(I.name('vi', 'shape', 'oval'), 'hình bầu dục', 'vi oval');
eq(I.name('en', 'size', 'small'), 'little', 'en small = little');
eq(I.name('en', 'size', 'cow_small'), 'little cow', 'en size with animal');
eq(I.name('vi', 'size', 'big:lion'), 'con sư tử to', 'vi size with animal');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('en', 'stars', 1), 'one star', 'en stars 1');
eq(I.name('en', 'stars', 3), 'three stars', 'en stars 3');
eq(I.name('vi', 'stars', 3), 'ba ngôi sao', 'vi stars 3');
eq(I.name('en', 'dots', 4), 'four stars', 'dots is an alias of stars');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('vi', 'letter', 'Y'), 'i dài', 'vi letter Y');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('vi', 'word', 'animal_frog'), 'ếch', 'vi word from sprite id');
eq(I.name('en', 'word', 'animal_lion'), 'lion', 'en word from sprite id');
ok(I.words('en', 'color', 'blue').includes('blew'), 'blue/blew');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'stars', 3).includes('three stars') && I.words('vi', 'stars', 3).includes('ba ngoi sao'), 'stars words: "three stars", "ba ngoi sao"');
ok(I.words('vi', 'word', 'bò').includes('con bò') && I.words('vi', 'word', 'bò').includes('bo'), 'vi word bò accepts animal forms');
ok(I.words('en', 'size', 'small').includes('little') && I.words('en', 'size', 'small').includes('small'), 'size small words');
for (const lang of I.langs) for (const kind of I.NAME_KINDS.concat(['dots'])) for (const v of [undefined, null, '', {}, 'zzz', -1, 999]) {
  let n, w;
  try { n = I.name(lang, kind, v); w = I.words(lang, kind, v); } catch (e) { n = null; }
  ok(typeof n === 'string' && Array.isArray(w), `${lang} name/words ${kind} ${JSON.stringify(v)} do not throw`);
}

// ------------------------------------------------------------------ flight lines
section('sayGo: exact lines');
eq(I.sayGo('en', { topic: 'colors', nameKind: 'color', nameValue: 'red' }, r0), 'Red! Blast off!', 'en go colour');
eq(I.sayGo('vi', { topic: 'colors', nameKind: 'color', nameValue: 'red' }, r0), 'Màu đỏ! Bay nào!', 'vi go colour');
eq(I.sayGo('en', { topic: 'shapes', nameKind: 'shape', nameValue: 'star' }, () => 0.5), 'Star! Let’s fly!', 'en go shape');
eq(I.sayGo('en', { topic: 'animals', nameKind: 'animal', nameValue: 'cow' }, r0), 'The cow! Blast off!', 'en go animal');
eq(I.sayGo('vi', { topic: 'animals', nameKind: 'animal', nameValue: 'cow' }, r0), 'Con bò! Bay nào!', 'vi go animal');
eq(I.sayGo('en', { topic: 'animals', nameKind: 'animal', nameValue: 'cow', promptKey: 'p.sound', params: { animal: 'cow' } }, r0),
  'The cow says moo! Blast off!', 'en go sound');
eq(I.sayGo('vi', { topic: 'animals', nameKind: 'animal', nameValue: 'cow', promptKey: 'p.sound', params: { animal: 'cow' } }, r0),
  'Con bò kêu ùm bò! Bay nào!', 'vi go sound');
eq(I.sayGo('en', { topic: 'count', nameKind: 'stars', nameValue: 3 }, r0), 'Three stars! Blast off!', 'en go stars');
eq(I.sayGo('en', { topic: 'count', nameKind: 'number', nameValue: 2 }, r0), 'Two! Blast off!', 'en go count-up');
eq(I.sayGo('vi', { topic: 'count', nameKind: 'number', nameValue: 2 }, r0), 'Số hai! Bay nào!', 'vi go count-up');
eq(I.sayGo('en', { topic: 'size', nameKind: 'size', nameValue: 'big', token: { kind: 'animal', value: 'cow', scale: 1 } }, r0),
  'The big cow! Blast off!', 'en go size');
eq(I.sayGo('en', { topic: 'letters', nameKind: 'letter', nameValue: 'B' }, r0), 'Letter B! Blast off!', 'en go letter');
eq(I.sayGo('en', { topic: 'add', nameKind: 'number', nameValue: 5, params: { a: 2, b: 3 } }, r0), '2 + 3 is five! Blast off!', 'en go add');
eq(I.sayGo('vi', { topic: 'sub', nameKind: 'number', nameValue: 4, params: { expr: '7−3' } }, r0), '7 − 3 bằng bốn! Bay nào!', 'vi go sub');
eq(I.sayGo('en', { topic: 'oddeven', nameKind: 'number', nameValue: 7 }, r0), 'Seven is odd! Blast off!', 'en go oddeven');
eq(I.sayGo('en', { topic: 'initial', nameKind: 'animal', nameValue: 'frog', token: { kind: 'animal', value: 'frog', word: 'frog', initial: 'F' }, promptKey: 'p.initial', params: { letter: 'F' } }, r0),
  'Frog starts with the letter F! Blast off!', 'en go initial');
eq(I.sayGo('vi', { topic: 'initial', nameKind: 'animal', nameValue: 'cow', token: { kind: 'animal', value: 'cow' }, params: { letter: 'B' } }, r0),
  'Bò bắt đầu bằng chữ B! Bay nào!', 'vi go initial (word from the word list)');
eq(I.sayGo('en', { topic: 'lower', nameKind: 'letter', nameValue: 'b', params: { letter: 'B' } }, r0), 'Big B, small b! Blast off!', 'en go lower');
eq(I.speech('en', 'Big B, small b! Blast off!'), 'Big bee, small bee! Blast off!', 'en go lower speech');

section('sayWrong: exact lines (names the tap, repeats the goal)');
eq(I.sayWrong('en', { topic: 'colors', nameKind: 'color', nameValue: 'blue', want: { kind: 'color', value: 'red' } }, r0),
  'That’s blue. Let’s find red!', 'en wrong colour');
eq(I.sayWrong('vi', { topic: 'colors', nameKind: 'color', nameValue: 'blue', want: { kind: 'color', value: 'red' } }, r0),
  'Đây là màu xanh dương nè. Mình tìm màu đỏ nhé!', 'vi wrong colour');
eq(I.sayWrong('en', { topic: 'animals', nameKind: 'animal', nameValue: 'cat', want: { kind: 'animal', value: 'cow' },
  promptKey: 'p.sound', params: { animal: 'cow' } }, r0), 'That’s the cat. Who says moo?', 'en wrong sound');
eq(I.sayWrong('vi', { topic: 'animals', nameKind: 'animal', nameValue: 'cat', want: { kind: 'animal', value: 'cow' },
  promptKey: 'p.sound', params: { animal: 'cow' } }, r0), 'Đây là con mèo nè. Con gì kêu ùm bò nhỉ?', 'vi wrong sound');
eq(I.sayWrong('en', { topic: 'shapes', nameKind: 'shape', nameValue: 'circle', token: { kind: 'shape', shape: 'circle', color: 'red' },
  want: { kind: 'shape', value: 'star' } }, r0), 'That’s a red circle. Let’s find the star!', 'en wrong shape');
eq(I.sayWrong('en', { topic: 'shapes', nameKind: 'shape', nameValue: 'oval', want: { kind: 'shape', value: 'star' } }, r0),
  'That’s an oval. Let’s find the star!', 'en wrong shape a → an');
eq(I.sayWrong('en', { topic: 'count', nameKind: 'stars', nameValue: 2, want: { kind: 'stars', value: 3 } }, r0),
  'That’s two stars. Let’s find three stars!', 'en wrong stars');
eq(I.sayWrong('en', { topic: 'count', nameKind: 'number', nameValue: 4, want: { kind: 'number', value: 3 }, promptKey: 'p.countUp', params: { n: 3 } }, r0),
  'That’s four. Let’s find three!', 'en wrong count-up');
eq(I.sayWrong('vi', { topic: 'count', nameKind: 'stars', nameValue: 1, want: { kind: 'stars', value: 4 } }, r0),
  'Đây là một ngôi sao nè. Mình tìm bốn ngôi sao nhé!', 'vi wrong stars');
eq(I.sayWrong('en', { topic: 'size', nameKind: 'size', nameValue: 'small', token: { kind: 'animal', value: 'cow', scale: 0.6 },
  want: { kind: 'size', value: 'big' }, params: { size: 'big', animal: 'cow' } }, r0),
  'That’s the little cow. Let’s find the big cow!', 'en wrong size');
eq(I.sayWrong('vi', { topic: 'size', nameKind: 'size', nameValue: 'small', token: { kind: 'animal', value: 'cow', scale: 0.6 },
  want: { kind: 'size', value: 'big' }, params: { size: 'big', animal: 'cow' } }, r0),
  'Đây là con bò nhỏ nè. Mình tìm con bò to nhé!', 'vi wrong size');
eq(I.sayWrong('en', { topic: 'letters', nameKind: 'letter', nameValue: 'C', want: { kind: 'letter', value: 'B' } }, r0),
  'That’s the letter C. Let’s find the letter B!', 'en wrong letter');
eq(I.sayWrong('vi', { topic: 'letters', nameKind: 'letter', nameValue: 'C', want: { kind: 'letter', value: 'B' } }, r0),
  'Đây là chữ C nè. Mình tìm chữ B nhé!', 'vi wrong letter');
eq(V.spoken('vi', 'Đây là chữ C nè. Mình tìm chữ B nhé!'), 'Đây là chữ cờ nè. Mình tìm chữ bờ nhé!', 'vi wrong letter spoken with phonics');
eq(I.sayWrong('en', { topic: 'lower', nameKind: 'letter', nameValue: 'd', want: { kind: 'letter', value: 'b' }, params: { letter: 'B' } }, r0),
  'That’s small letter d. Big letter B! Let’s find its small letter!', 'en wrong lower');
eq(I.sayWrong('en', { topic: 'add', nameKind: 'number', nameValue: 6, want: { kind: 'number', value: 5 }, params: { a: 2, b: 3 } }, r0),
  'That’s six. What is 2 + 3?', 'en wrong add (never gives the answer)');
eq(I.sayWrong('en', { topic: 'initial', nameKind: 'animal', nameValue: 'dog', token: { kind: 'animal', value: 'dog', word: 'dog', initial: 'D' }, want: { kind: 'animal', value: 'frog' }, promptKey: 'p.initial', params: { letter: 'F' } }, r0),
  'Dog starts with the letter D. Who starts with the letter F?', 'en wrong initial (teaches the tapped word)');
eq(I.sayWrong('vi', { topic: 'initial', nameKind: 'animal', nameValue: 'duck', token: { kind: 'animal', value: 'duck' }, params: { letter: 'M' } }, r0),
  'Vịt bắt đầu bằng chữ V đó. Bạn nào bắt đầu bằng chữ M nhỉ?', 'vi wrong initial');
eq(I.sayWrong('en', { topic: 'oddeven', nameKind: 'number', nameValue: 4, want: { kind: 'number', value: 7 }, params: { parity: 'odd' } }, r0),
  'That’s four, an even number. Let’s find an odd number!', 'en wrong oddeven');
eq(I.sayWrong('vi', { topic: 'oddeven', nameKind: 'number', nameValue: 4, params: { parity: 'odd' } }, r0),
  'Đây là số bốn, số chẵn đó. Mình tìm số lẻ nhé!', 'vi wrong oddeven');
eq(I.sayWrong('en', { nameKind: 'color', nameValue: 'blue', promptKey: 'p.colors', params: { color: 'red' } }, r0),
  'That’s blue. Let’s find red!', 'want derived from the prompt params');
ok(I.raw('en', 'wrong').includes(I.sayWrong('en', {}, r0)), 'empty wrong event → a gentle generic line');

section('sayCollect: exact lines');
eq(I.sayCollect('en', { topic: 'count', token: { kind: 'stars', n: 3, nameKind: 'stars', nameValue: 3 } }), 'One, two, three stars!', 'en collect stars');
eq(I.sayCollect('en', { topic: 'count', token: { kind: 'number', value: 1, n: 1, nameKind: 'number', nameValue: 1 } }), 'One star!', 'en collect count-up 1');
eq(I.sayCollect('vi', { topic: 'count', token: { kind: 'number', value: 4, n: 4, nameKind: 'number', nameValue: 4 } }), 'Một, hai, ba, bốn ngôi sao!', 'vi collect count-up 4');
eq(I.sayCollect('en', { topic: 'count', token: { kind: 'stars', n: 8 } }), 'Eight stars!', 'en collect 8 stars');
eq(I.sayCollect('en', { topic: 'animals', token: { kind: 'animal', value: 'cow', nameKind: 'animal', nameValue: 'cow' } }, r0), 'Hello, cow! Moo!', 'en collect animal');
eq(I.sayCollect('vi', { topic: 'animals', token: { kind: 'animal', value: 'cow', nameKind: 'animal', nameValue: 'cow' } }, r0), 'Chào con bò! Ùm bò!', 'vi collect animal');
eq(I.sayCollect('en', { topic: 'size', token: { kind: 'animal', value: 'pig', scale: 0.6, nameKind: 'size', nameValue: 'small' } }, r0), 'Hello, pig! Oink!', 'en collect size animal');
eq(I.sayCollect('en', { topic: 'colors', token: { kind: 'color', value: 'red' } }, r0), 'Got it!', 'en collect colour');
eq(I.sayCollect('en', { topic: 'add', token: { kind: 'number', value: 10, n: 10, text: '10', nameKind: 'number', nameValue: 10 } }, r0), 'Ten! Into the wagon!', 'en collect add answer (not counted as stars)');
eq(I.sayCollect('vi', { topic: 'oddeven', token: { kind: 'number', value: 7, n: 7, nameKind: 'number', nameValue: 7 } }, r0), 'Số bảy! Vào xe mây nào!', 'vi collect odd/even number');
eq(I.sayCollect('en', { token: { kind: 'number', value: 3, n: 3, showStars: true, nameKind: 'number', nameValue: 3 } }), 'One, two, three stars!', 'count-up token with showStars is counted');
ok(I.raw('vi', 'collect').includes(I.sayCollect('vi', { topic: 'letters', token: { kind: 'letter', value: 'B' } }, r0)), 'vi collect letter → short line');

section('sayGo / sayWrong / sayCollect for every topic and kind (both languages)');
const SYN = {
  colors: COLORS.map(c => ({ kind: 'color', value: c, nameKind: 'color', nameValue: c })),
  shapes: SHAPES.map((s, i) => ({ kind: 'shape', value: s, shape: s, color: COLORS[i % 7], nameKind: 'shape', nameValue: s })),
  size: [].concat(...ANIMALS.map(a => [{ kind: 'animal', value: a, scale: 1, nameKind: 'size', nameValue: 'big' },
    { kind: 'animal', value: a, scale: 0.6, nameKind: 'size', nameValue: 'small' }])),
  count: [].concat(...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [{ kind: 'stars', n, value: n, nameKind: 'stars', nameValue: n },
    { kind: 'number', n, value: n, text: String(n), nameKind: 'number', nameValue: n }])),
  animals: ANIMALS.map(a => ({ kind: 'animal', value: a, nameKind: 'animal', nameValue: a })),
  letters: LETTERS_EN.map(l => ({ kind: 'letter', value: l, text: l, nameKind: 'letter', nameValue: l })),
  lower: LETTERS_EN.map(l => ({ kind: 'letter', value: l.toLowerCase(), text: l.toLowerCase(), nameKind: 'letter', nameValue: l.toLowerCase() })),
  initial: ANIMALS.map(a => ({ kind: 'animal', value: a, sprite: 'animal_' + a, nameKind: 'animal', nameValue: a })),
  add: Array.from({ length: 21 }, (_, n) => ({ kind: 'number', value: n, text: String(n), nameKind: 'number', nameValue: n })),
  sub: Array.from({ length: 11 }, (_, n) => ({ kind: 'number', value: n, text: String(n), nameKind: 'number', nameValue: n })),
  oddeven: Array.from({ length: 20 }, (_, n) => ({ kind: 'number', value: n + 1, text: String(n + 1), nameKind: 'number', nameValue: n + 1 }))
};
function promptFor(topic, tok, lang) {
  switch (topic) {
    case 'colors': return ['p.colors', { color: tok.value }];
    case 'shapes': return ['p.shapes', { shape: tok.value }];
    case 'size': return ['p.size', { size: tok.nameValue, animal: tok.value }];
    case 'count': return tok.kind === 'number' ? ['p.countUp', { n: tok.n }] : ['p.count', { n: tok.n }];
    case 'animals': return ['p.animals', { animal: tok.value }];
    case 'letters': return ['p.letters', { letter: tok.value }];
    case 'lower': return ['p.lower', { letter: tok.value.toUpperCase() }];
    case 'initial': return ['p.initial', { letter: (I.WORD_LIST[lang].find(w => w[1] === 'animal_' + tok.value) || ['', '', 'Z'])[2] }];
    case 'add': return ['p.add', { a: Math.floor(tok.value / 2), b: tok.value - Math.floor(tok.value / 2) }];
    case 'sub': return ['p.sub', { a: 10, b: 10 - tok.value, op: '−' }];
    case 'oddeven': return ['p.oddeven', { parity: tok.value % 2 ? 'odd' : 'even' }];
  }
}
let synLines = 0;
for (const lang of I.langs) for (const topic of TOPICS) {
  const toks = SYN[topic];
  for (let i = 0; i < toks.length; i++) {
    const right = toks[i], other = toks[(i + 1) % toks.length];
    const [pk, params] = promptFor(topic, right, lang);
    const prompts = [[pk, params]];
    if (topic === 'animals') prompts.push(['p.sound', { animal: right.value }]);
    for (const [promptKey, prm] of prompts) {
      const want = { kind: right.nameKind, value: right.nameValue };
      const g = I.sayGo(lang, { topic, nameKind: right.nameKind, nameValue: right.nameValue, token: right, promptKey, params: prm }, () => (i % 3 + 0.5) / 3);
      ok(clean(g) && positive(g) && !I.raw(lang, 'praise').includes(g), `${lang} ${topic} go ${JSON.stringify(right.nameValue)}: ${g}`);
      const w = I.sayWrong(lang, { topic, nameKind: other.nameKind, nameValue: other.nameValue, token: other, want, promptKey, params: prm, streak: 1 }, () => (i % 3 + 0.5) / 3);
      ok(clean(w) && positive(w) && !I.raw(lang, 'wrong').includes(w) && nWords(w) <= 22, `${lang} ${topic} wrong ${JSON.stringify(other.nameValue)}→${JSON.stringify(right.nameValue)}: ${w}`);
      ok(/[.!?]$/.test(w) && w.split(/[.!?] /).length >= 2, `${lang} ${topic} wrong names the tap then the goal: ${w}`);
      if (topic === 'add' || topic === 'sub') ok(w.indexOf(I.name(lang, 'number', right.value) + '!') < 0 || right.value === other.value, `${lang} ${topic} wrong never says the answer: ${w}`);
      if (promptKey === 'p.sound') ok(w.toLowerCase().indexOf(I.sound(lang, right.value)) >= 0, `${lang} sound wrong repeats the sound: ${w}`);
      const c = I.sayCollect(lang, { topic, token: right }, r0);
      ok(clean(c) && positive(c), `${lang} ${topic} collect: ${c}`);
      if (right.kind === 'stars' || topic === 'count') ok(/star|sao/.test(c), `${lang} count collect counts stars: ${c}`);
      if (topic === 'animals' || topic === 'size' || topic === 'initial') ok(c.toLowerCase().indexOf(I.sound(lang, right.value)) >= 0, `${lang} animal collect says the sound: ${c}`);
      synLines += 3;
    }
  }
}
ok(synLines > 600, `checked ${synLines} synthetic flight lines`);

section('garbage events never throw, never print junk');
const JUNK = [undefined, null, {}, 'x', 42, { nameKind: 'zzz', nameValue: 'q' }, { nameKind: 'color' }, { token: 'x' },
  { token: { kind: 'animal' } }, { want: 'x' }, { want: { kind: 'stars' } }, { params: 'junk', promptKey: 'p.sound' },
  { nameKind: 'shape', nameValue: 'blob', token: { kind: 'shape', color: 'zz' } }, { topic: 'oddeven' }, { topic: 'size', nameKind: 'size', nameValue: 'big' },
  { topic: 'add', nameKind: 'number', nameValue: 3 }, { promptKey: 'p.lower', nameKind: 'letter', nameValue: 'b' },
  { topic: 'initial', nameKind: 'animal', nameValue: 'cat' }, { promptKey: 'p.initial', token: { kind: 'animal', value: 'zebra' } }];
for (const lang of I.langs) for (const ev of JUNK) for (const fn of ['sayGo', 'sayWrong', 'sayCollect', 'sayFlip', 'sayMatch', 'sayMismatch', 'sayReward', 'sayCorrect']) {
  let s;
  try { s = I[fn](lang, ev); } catch (e) { s = 'THROW ' + e.message; }
  ok(clean(s) && positive(s), `${lang} ${fn}(${JSON.stringify(ev)}) → ${s}`);
}
eq(I.sayCount('en', 2, 3), 'Two!', 'sayCount below need');
eq(I.sayCount('en', 3, 3), 'Three! Three stars!', 'sayCount at need');
eq(I.sayCount('vi', 3, 3), 'Ba! Ba ngôi sao!', 'vi sayCount at need');
eq(I.phrase('en', 'animal', 'cow'), 'the cow', 'phrase animal');
eq(I.phrase('vi', 'stars', 3), 'ba ngôi sao', 'phrase stars vi');
eq(I.cardPhrase('en', { nameKind: 'shape', nameValue: 'heart' }), 'a heart', 'cardPhrase back-compat');

// ------------------------------------------------------------------ real hops from content.js, if available
section('lines for every hop content.js makes');
(function () {
  const sc = makeSandbox(); sc.RR = {};
  let C;
  try { C = load(sc, ['rng.js', 'i18n.js', 'content.js']); } catch (e) { console.log('   (content.js not loadable yet: ' + e.message + ')'); return; }
  if (!C.Content || !C.Content.makeRound) { console.log('   (RR.Content.makeRound missing — skipped)'); return; }
  const I2 = C.I18N;
  const ages = Object.keys(C.AGE_TOPICS || { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }).map(Number);
  let probe;
  try { probe = C.Content.makeRound((C.AGE_TOPICS[4] || ['colors'])[0], { age: 4, lang: 'en', rng: new C.RNG(1), roundIndex: 0 }); } catch (e) { probe = null; }
  if (!probe || !Array.isArray(probe.hops)) { console.log('   (content.js still makes card rounds — hop checks skipped)'); return; }
  if (C.ANIMALS) eq(JSON.stringify(C.ANIMALS), JSON.stringify(ANIMALS), 'content RR.ANIMALS = DESIGN §5.1 list');
  let rounds = 0, talks = 0, lines = 0;
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 8; s++) {
    let r;
    try { r = C.Content.makeRound(topic, { age, lang, rng: new C.RNG(s * 31 + age), roundIndex: s % 4, surprise: null }); }
    catch (e) { ok(false, `makeRound ${topic} age ${age} ${lang}: ${e.message}`); continue; }
    if (!r || !Array.isArray(r.hops)) { ok(false, `makeRound ${topic} returns hops[]`); continue; }
    rounds++;
    for (const hop of r.hops) {
      const txt = I2.t(lang, hop.promptKey, hop.params || {});
      ok(clean(txt) && txt !== hop.promptKey && ![].concat(I2.raw(lang, 'p.any')).includes(txt), `${lang} ${hop.promptKey} ${JSON.stringify(hop.params)} renders: ${txt}`);
      const night = I2.t(lang, hop.promptKey === 'p.colors' ? 'p.colors.night' : hop.promptKey, hop.params || {});
      ok(clean(night), `${lang} night wording renders: ${night}`);
      const right = hop.tokens[hop.answer];
      ok(!!right, `${topic} hop has its answer token`);
      if (!right) continue;
      for (const tk of hop.tokens) ok(I2.NAME_KINDS.includes(tk.nameKind), `${lang} token nameKind ${tk.nameKind} is a known kind`);
      const want = { kind: right.nameKind, value: right.nameValue };
      const g = I2.sayGo(lang, { topic, nameKind: right.nameKind, nameValue: right.nameValue, token: right, promptKey: hop.promptKey, params: hop.params });
      ok(clean(g) && positive(g) && !I2.raw(lang, 'praise').includes(g), `${lang} ${topic} go: ${g}`);
      const c = I2.sayCollect(lang, { topic, token: right });
      ok(clean(c) && positive(c), `${lang} ${topic} collect: ${c}`);
      lines += 2;
      for (const tk of hop.tokens) {
        if (tk === right) continue;
        const w = I2.sayWrong(lang, { topic, nameKind: tk.nameKind, nameValue: tk.nameValue, token: tk, want, promptKey: hop.promptKey, params: hop.params, streak: 1 });
        ok(clean(w) && positive(w) && !I2.raw(lang, 'wrong').includes(w), `${lang} ${topic} wrong: ${w}`);
        lines++;
      }
    }
  }
  if (C.Content.makeTalk) for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 8; s++) {
    let tk;
    try { tk = C.Content.makeTalk(topic, { age, lang, rng: new C.RNG(s * 17 + age) }); }
    catch (e) { ok(false, `makeTalk ${topic}: ${e.message}`); continue; }
    if (!tk) continue;
    talks++;
    const q = I2.t(lang, tk.promptKey, tk.params || {});
    ok(clean(q) && q !== tk.promptKey && I2.has(lang, tk.promptKey), `${lang} ${tk.promptKey} renders: ${q}`);
    for (const c of (tk.choices || [])) {
      ok(I2.words(lang, c.kind, c.value).length > 0, `${lang} words for talk choice ${c.kind}:${c.value}`);
      const tw = I2.talkWrong(lang, c.kind, c.value);
      ok(clean(tw) && positive(tw), `${lang} talkWrong ${c.kind}:${c.value}: ${tw}`);
    }
    const ans = (tk.choices || []).find(c => c.id === tk.answerId);
    if (ans) {
      const said = I2.name(lang, ans.kind, ans.value);
      eq(V.match([said], tk.choices.map(c => ({ id: c.id, words: I2.words(lang, c.kind, c.value) }))), tk.answerId, `${lang} ${topic} talk: saying "${said}" picks the answer`);
    }
  }
  ok(rounds > 50, `enumerated ${rounds} rounds (${lines} lines), ${talks} talks from content.js`);
})();

section('talkWrong');
eq(I.talkWrong('en', 'animal', 'cow'), 'It is the cow! Good try!', 'en talkWrong animal');
eq(I.talkWrong('vi', 'animal', 'duck'), 'Là con vịt đó! Bé cố gắng lắm!', 'vi talkWrong animal');
eq(I.talkWrong('en', 'shape', 'circle'), 'It is a circle! Good try!', 'en talkWrong shape');
eq(I.talkWrong('en', 'shape', 'oval'), 'It is an oval! Good try!', 'en talkWrong shape an');
eq(I.talkWrong('vi', { kind: 'color', value: 'blue' }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', 'number', 4), 'It is four! Good try!', 'en talkWrong number');
eq(I.talkWrong('vi', 'stars', 4), 'Là số bốn đó! Bé cố gắng lắm!', 'vi talkWrong stars');
eq(I.talkWrong('en', 'letter', 'B'), 'It is the letter B! Good try!', 'en talkWrong letter');
eq(I.talkWrong('vi', 'size', 'small'), 'Bạn này nhỏ đó! Bé cố gắng lắm!', 'vi talkWrong size');
eq(I.talkWrong('en', 'parity', 'even'), 'It is even! Good try!', 'en talkWrong parity');
eq(I.talkWrong('vi', 'parity', 'odd'), 'Là số lẻ đó! Bé cố gắng lắm!', 'vi talkWrong parity');
for (const lang of I.langs) for (const kind of Object.keys(VALUES)) for (const v of VALUES[kind].slice(0, 12)) {
  const s = I.talkWrong(lang, kind, v);
  ok(clean(s) && positive(s), `${lang} talkWrong ${kind} ${v}: ${s}`);
}
ok(clean(I.talkWrong('en')) && clean(I.talkWrong('vi', {})), 'talkWrong without a value');

section('speech text: letters, maths; "Bim" is spoken as written');
eq(I.speech('en', 'Find the letter B!'), 'Find the letter bee!', 'en letter speech');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');
eq(I.speech('en', '7 − 2'), '7 minus 2', 'en math speech');
eq(I.speech('en', 'Fly to the big cow!'), 'Fly to the big cow!', 'en "big cow" is not a letter');
eq(V.spoken('vi', 'Chào bé! Mình là voi Bim.'), 'Chào bé! Mình là voi Bim.', 'vi spoken keeps "Bim"');
eq(V.spoken('vi', 'Bim gợi ý nè: chữ B!'), 'Bim gợi ý nè: chữ bờ!', 'vi spoken: phonics only');
eq(V.spoken('en', 'Hi! I am Bim.'), 'Hi! I am Bim.', 'en spoken keeps Bim');
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(V.spoken(lang, s).indexOf('Đi') < 0 && V.spoken(lang, s).indexOf('Dee') < 0, `${lang} ${k} spoken text has no Dee leftovers`);

// ------------------------------------------------------------------ matcher
section('matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
const colVi = ch('vi', 'color', ['red', 'blue', 'green', 'pink']);
eq(V.match(['red'], colEn), 'red', '"red"');
eq(V.match(["it's blue"], colEn), 'blue', '"it\'s blue"');
eq(V.match(['greene'], colEn), 'green', 'fuzzy "greene"');
eq(V.match(['màu đỏ'], colVi), 'red', '"màu đỏ"');
eq(V.match(['mau do'], colVi), 'red', '"mau do"');
eq(V.match(['mau hong'], colVi), 'pink', '"mau hong"');
eq(V.match(['xanh'], colVi), null, '"xanh" alone is ambiguous');
eq(V.match(['banana', 'hello'], colEn), null, 'unrelated words → null');
eq(V.match('blue', colEn), 'blue', 'accepts a single string');
const numVi = ch('vi', 'number', [3, 5, 12]);
const numEn = ch('en', 'number', [3, 5, 12]);
eq(V.match(['ba'], numVi), '3', '"ba" → 3');
eq(V.match(['three'], numEn), '3', '"three" → 3');
eq(V.match(['mười hai'], numVi), '12', '"mười hai" → 12');
eq(V.match(['muoi hai'], numVi), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], numEn), '5', '"I think five"');
eq(V.match(['to'], ch('en', 'number', [2, 4])), '2', 'solo "to" → 2');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
const starsEn = ch('en', 'stars', [2, 3, 4]), starsVi = ch('vi', 'stars', [2, 3, 4]);
eq(V.match(['three stars'], starsEn), '3', 'en "three stars"');
eq(V.match(['four'], starsEn), '4', 'en stars "four"');
eq(V.match(['ba ngôi sao'], starsVi), '3', 'vi "ba ngôi sao"');
eq(V.match(['hai'], starsVi), '2', 'vi stars "hai"');
for (let n = 0; n <= 20; n++) {
  const set = ch('en', 'number', [n, (n + 1) % 21, (n + 2) % 21]), setV = ch('vi', 'number', [n, (n + 1) % 21, (n + 2) % 21]);
  eq(V.match([I.name('en', 'number', n)], set), String(n), `en number word ${n}`);
  eq(V.match([String(n)], set), String(n), `en digit ${n}`);
  if (n > 0) eq(V.match([I.name('vi', 'number', n)], setV), String(n), `vi number word ${n}`);
  if (n > 0) eq(V.match([I.stripMarks(I.name('vi', 'number', n))], setV), String(n), `vi number no diacritics ${n}`);
}
// sky friends: every one of the 8 is distinguishable by its own name (EN + VI, with/without diacritics, classifiers)
const animEn = ch('en', 'animal', ANIMALS), animVi = ch('vi', 'animal', ANIMALS);
for (const a of ANIMALS) {
  const en = I.name('en', 'animal', a), vi = I.name('vi', 'animal', a);
  eq(V.match([en], animEn), a, `en "${en}" → ${a}`);
  eq(V.match(['the ' + en + '!'], animEn), a, `en "the ${en}!" → ${a}`);
  eq(V.match([vi], animVi), a, `vi "${vi}" → ${a}`);
  eq(V.match([I.stripMarks(vi).toLowerCase()], animVi), a, `vi no-diacritics "${I.stripMarks(vi)}" → ${a}`);
  const bare = vi.replace(/^con /, '');
  eq(V.match([bare], animVi), a, `vi bare "${bare}" → ${a}`);
  eq(V.match(['là ' + vi + ' đó'], animVi), a, `vi "là ${vi} đó" → ${a}`);
  for (const w of I.words('vi', 'animal', a)) eq(V.match([w], animVi), a, `vi accepted form "${w}" → ${a}`);
  for (const w of I.words('en', 'animal', a)) eq(V.match([w], animEn), a, `en accepted form "${w}" → ${a}`);
}
for (const [said, want] of [['con lợn', 'pig'], ['lợn', 'pig'], ['heo', 'pig'], ['con lon', 'pig'], ['cún con', 'dog'], ['chó', 'dog'],
  ['mèo', 'cat'], ['meo', 'cat'], ['bò', 'cow'], ['con bo', 'cow'], ['cừu', 'sheep'], ['con vit', 'duck'], ['sư tử', 'lion'],
  ['su tu', 'lion'], ['ếch', 'frog'], ['con ech', 'frog']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['kitty', 'cat'], ['puppy', 'dog'], ['piggy', 'pig'], ['lamb', 'sheep'], ['ducky', 'duck'],
  ['froggy', 'frog'], ['a lion', 'lion'], ['the cow', 'cow'], ['doggie', 'dog'], ['kitten', 'cat']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['hello'], animEn), null, 'en unrelated → null');
// a 3-island row of animals: sound words are not animal names (no accidental match on "moo")
eq(V.match(['moo'], ch('en', 'animal', ['cow', 'pig', 'cat'])), null, '"moo" is not an animal name');
const parVi = ch('vi', 'parity', ['odd', 'even']);
eq(V.match(['số chẵn'], parVi), 'even', '"số chẵn" → even');
eq(V.match(['chan'], parVi), 'even', '"chan" → even');
const letEn = ch('en', 'letter', ['A', 'B', 'C']);
eq(V.match(["it's a B"], letEn), 'B', '"it\'s a B" → B');
eq(V.match(['bee'], letEn), 'B', '"bee" → B');
const letVi = ch('vi', 'letter', ['B', 'C', 'T']);
eq(V.match(['bờ'], letVi), 'B', '"bờ" → B');
eq(V.match(['chữ tờ'], letVi), 'T', '"chữ tờ" → T');
eq(V.match(['ê'], ch('vi', 'letter', ['E', 'Ê'])), 'Ê', '"ê" → Ê (diacritics first)');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['little'], ch('en', 'size', ['big', 'small'])), 'small', 'en little → small');
eq(V.match(['hình tam giác'], ch('vi', 'shape', ['circle', 'triangle', 'star'])), 'triangle', 'vi triangle');
eq(V.match(['hinh ngoi sao'], ch('vi', 'shape', ['circle', 'heart', 'star'])), 'star', 'vi star no diacritics');
eq(V.match(['two plus three'], ch('en', 'sum', ['2+3', '1+1'])), '2+3', 'en sum spoken');
eq(V.match(['cow'], [{ id: 'c', kind: 'animal', value: 'cow' }, { id: 'p', kind: 'animal', value: 'pig' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['con heo'], [{ id: 'c', kind: 'animal', value: 'cow' }, { id: 'p', kind: 'animal', value: 'pig' }], 'vi'), 'p', '{id,kind,value} vi');
eq(V.match(['red'], []), null, 'no choices → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('input: tap / drag, (x, y, ev) in logical px, one pointer');
(function () {
  function El(tag, cls) { this.nodeType = 1; this.tag = tag; this.cls = cls || ''; this.parentElement = null; this.style = {}; this.h = {}; }
  El.prototype.matches = function (sel) {
    return sel.split(',').map(x => x.trim()).some(x => x === this.tag || (x[0] === '.' && this.cls.split(' ').includes(x.slice(1))) ||
      (x[0] === '#' && this.id === x.slice(1)));
  };
  El.prototype.addEventListener = function (t, fn) { (this.h[t] = this.h[t] || []).push(fn); };
  El.prototype.removeEventListener = function (t, fn) { this.h[t] = (this.h[t] || []).filter(f => f !== fn); };
  El.prototype.setPointerCapture = function () {}; El.prototype.releasePointerCapture = function () {};
  El.prototype.emit = function (t, e) { (this.h[t] || []).slice().forEach(f => f(e)); };
  const canvas = new El('canvas');
  const btn = new El('button');
  const sb4 = makeSandbox({ PointerEvent: function () {}, addEventListener() {}, removeEventListener() {} });
  sb4.RR = {};
  const IN = load(sb4, ['input.js']).Input;
  const calls = [];
  let downSync = false;
  const detach = IN.attach(canvas, {
    toLogical: (cx, cy) => ({ x: cx / 2, y: cy / 2 }),
    down: function (x, y, ev) { calls.push(['down', x, y, typeof ev]); },
    move: function (x, y) { calls.push(['move', x, y]); },
    up: function (x, y) { calls.push(['up', x, y]); },
    cancel: function () { calls.push(['cancel']); }
  });
  ok(canvas.style.touchAction === 'none', 'canvas touch-action none (no browser gestures, no delay)');
  const pe = (id, x, y, extra) => Object.assign({ pointerId: id, clientX: x, clientY: y, target: canvas, pointerType: 'touch',
    isPrimary: true, button: 0, cancelable: true, preventDefault() { this.prevented = true; } }, extra || {});
  const e1 = pe(1, 100, 60);
  canvas.emit('pointerdown', e1);
  downSync = calls.length === 1 && calls[0][0] === 'down';
  ok(downSync, 'down fires synchronously inside pointerdown (instant response)');
  ok(e1.prevented, 'pointerdown preventDefault (no emulated mouse / click delay)');
  canvas.emit('pointerdown', pe(2, 300, 300, { isPrimary: false }));   // a second finger is ignored
  canvas.emit('pointermove', pe(2, 310, 300));
  canvas.emit('pointerup', pe(2, 310, 300));
  canvas.emit('pointermove', pe(1, 140, 60));
  canvas.emit('pointerup', pe(1, 150, 64));
  eq(JSON.stringify(calls), JSON.stringify([['down', 50, 30, 'object'], ['move', 70, 30], ['up', 75, 32]]),
    'one pointer, numbers in logical px, extra finger ignored');
  calls.length = 0;
  // two fingers, the first lifts, then the (still held) second one taps again → only new primary pointers count
  canvas.emit('pointerdown', pe(10, 20, 20));
  canvas.emit('pointerdown', pe(11, 40, 40, { isPrimary: false }));
  canvas.emit('pointerup', pe(10, 20, 20));
  canvas.emit('pointermove', pe(11, 44, 40, { isPrimary: false }));
  eq(JSON.stringify(calls), JSON.stringify([['down', 10, 10, 'object'], ['up', 10, 10]]), 'second finger never becomes active');
  calls.length = 0;
  // quick taps in a row each fire down at once
  for (let i = 0; i < 3; i++) { canvas.emit('pointerdown', pe(20 + i, 10 * i, 10)); canvas.emit('pointerup', pe(20 + i, 10 * i, 10)); }
  eq(calls.filter(c => c[0] === 'down').length, 3, 'three quick taps → three downs');
  calls.length = 0;
  // a lost pointerup (iOS system gesture) must not block the next tap forever
  canvas.emit('pointerdown', pe(30, 10, 10));
  canvas.emit('pointerdown', pe(31, 30, 30));          // new PRIMARY touch: the old one is gone
  eq(JSON.stringify(calls), JSON.stringify([['down', 5, 5, 'object'], ['cancel'], ['down', 15, 15, 'object']]), 'stuck pointer recovers');
  canvas.emit('pointerup', pe(31, 30, 30));
  calls.length = 0;
  canvas.emit('pointerdown', pe(3, 10, 10));
  canvas.emit('pointercancel', pe(3, 10, 10));
  eq(JSON.stringify(calls), JSON.stringify([['down', 5, 5, 'object'], ['cancel']]), 'pointercancel → cancel()');
  calls.length = 0;
  canvas.emit('pointerdown', pe(4, 10, 10, { target: btn }));
  eq(calls.length, 0, 'button targets are ignored');
  const hud = new El('div'); hud.id = 'hud'; const inner = new El('span'); inner.parentElement = hud;
  canvas.emit('pointerdown', pe(5, 10, 10, { target: inner }));
  eq(calls.length, 0, 'children of #hud are ignored');
  canvas.emit('pointerdown', pe(6, 10, 10, { pointerType: 'mouse', button: 2 }));
  eq(calls.length, 0, 'right mouse button ignored');
  canvas.emit('pointerdown', pe(9, 10, 10, { pointerType: 'mouse' }));
  canvas.emit('pointerup', pe(9, 10, 10, { pointerType: 'mouse' }));
  eq(calls.length, 2, 'left mouse click works');
  calls.length = 0;
  detach();
  canvas.emit('pointerdown', pe(7, 10, 10));
  eq(calls.length, 0, 'detach removes listeners');
  const calls2 = [];
  IN.attach(canvas, { toLogical: () => ({ x: NaN, y: 1 }), down: (x, y) => calls2.push([x, y]), cancel: () => calls2.push('c') });
  canvas.emit('pointerdown', pe(8, 10, 10));
  eq(calls2.length, 0, 'non-finite points are dropped');
  // a handler that throws must not break input
  const c3 = new El('canvas'); let n3 = 0;
  IN.attach(c3, { down: () => { n3++; throw new Error('boom'); } });
  const oldErr = sb4.console; sb4.console = { error() {} };
  c3.emit('pointerdown', pe(1, 1, 1)); c3.emit('pointerup', pe(1, 1, 1)); c3.emit('pointerdown', pe(2, 1, 1));
  sb4.console = oldErr;
  eq(n3, 2, 'a throwing handler does not stop later taps');

  // drag a flight line from the rocket: every move of the active finger arrives, in logical px, then up
  const dc = new El('canvas'), dcalls = [];
  const winH = {};
  const sb7 = makeSandbox({ PointerEvent: function () {}, addEventListener(t, f) { (winH[t] = winH[t] || []).push(f); },
    removeEventListener(t, f) { winH[t] = (winH[t] || []).filter(x => x !== f); } });
  sb7.RR = {};
  const IN7 = load(sb7, ['input.js']).Input;
  const winEmit = (t, e) => (winH[t] || []).slice().forEach(f => f(e));
  IN7.attach(dc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down: (x, y) => dcalls.push(['down', x, y]),
    move: (x, y, ev) => dcalls.push(['move', x, y, typeof ev]), up: (x, y) => dcalls.push(['up', x, y]), cancel: () => dcalls.push(['cancel']) });
  const pd = (id, x, y, extra) => Object.assign({ pointerId: id, clientX: x, clientY: y, target: dc, pointerType: 'touch',
    isPrimary: true, button: 0, cancelable: true, preventDefault() {} }, extra || {});
  dc.emit('pointerdown', pd(1, 100, 600));
  for (let k = 1; k <= 5; k++) dc.emit('pointermove', pd(1, 100 + k * 20, 600 - k * 60));
  dc.emit('pointerup', pd(1, 200, 300));
  eq(dcalls.length, 7, 'drag: down + 5 moves + up');
  eq(JSON.stringify(dcalls[3]), JSON.stringify(['move', 160, 420, 'object']), 'drag move carries (x, y, ev)');
  eq(JSON.stringify(dcalls[6]), JSON.stringify(['up', 200, 300]), 'drag ends with up at the release point');
  dcalls.length = 0;
  // a second finger during a drag never steals it
  dc.emit('pointerdown', pd(2, 100, 600));
  dc.emit('pointerdown', pd(3, 500, 100, { isPrimary: false }));
  dc.emit('pointermove', pd(3, 520, 100, { isPrimary: false }));
  dc.emit('pointermove', pd(2, 110, 580));
  dc.emit('pointerup', pd(3, 520, 100, { isPrimary: false }));
  dc.emit('pointerup', pd(2, 110, 580));
  eq(JSON.stringify(dcalls), JSON.stringify([['down', 100, 600], ['move', 110, 580, 'object'], ['up', 110, 580]]), 'second finger ignored during a drag');
  dcalls.length = 0;
  // no pointer capture: the finger slides over the HUD → move/up still arrive via the window, exactly once
  const hudEl = new El('div');
  dc.emit('pointerdown', pd(4, 50, 50));
  winEmit('pointermove', pd(4, 60, 40, { target: hudEl }));
  const upEv = pd(4, 70, 30, { target: hudEl });
  winEmit('pointerup', upEv);
  winEmit('pointerup', upEv);
  eq(JSON.stringify(dcalls), JSON.stringify([['down', 50, 50], ['move', 60, 40, 'object'], ['up', 70, 30]]), 'moves/ups over other elements reach the game once');
  dcalls.length = 0;
  // events that already went through the canvas are not delivered twice when they bubble to the window
  dc.emit('pointerdown', pd(5, 10, 10));
  const mv = pd(5, 12, 12); dc.emit('pointermove', mv); winEmit('pointermove', mv);
  const up5 = pd(5, 12, 12); dc.emit('pointerup', up5); winEmit('pointerup', up5);
  eq(dcalls.length, 3, 'canvas events bubbling to window are handled once');
  dcalls.length = 0;
  // window blur / pointercancel during a drag → cancel() exactly once, then the next tap works
  dc.emit('pointerdown', pd(6, 10, 10));
  dc.emit('pointermove', pd(6, 20, 20));
  winEmit('blur', {});
  winEmit('blur', {});
  dc.emit('pointermove', pd(6, 30, 30));
  dc.emit('pointerup', pd(6, 30, 30));
  eq(JSON.stringify(dcalls), JSON.stringify([['down', 10, 10], ['move', 20, 20, 'object'], ['cancel']]), 'blur cancels the drag once; late moves/ups ignored');
  dcalls.length = 0;
  dc.emit('pointerdown', pd(7, 10, 10));
  winEmit('pointercancel', pd(7, 10, 10));
  dc.emit('lostpointercapture', pd(7, 10, 10));
  eq(JSON.stringify(dcalls), JSON.stringify([['down', 10, 10], ['cancel']]), 'pointercancel (window) + lostpointercapture → one cancel');
  dcalls.length = 0;
  dc.emit('pointerdown', pd(8, 10, 10)); dc.emit('pointerup', pd(8, 10, 10));
  eq(dcalls.length, 2, 'input works again after a cancel');
  // an up whose point cannot be mapped becomes a cancel
  const ec = new El('canvas'), ecalls = [];
  let bad = false;
  IN.attach(ec, { toLogical: (cx, cy) => (bad ? { x: NaN, y: NaN } : { x: cx, y: cy }), down: () => ecalls.push('down'), up: () => ecalls.push('up'), cancel: () => ecalls.push('cancel') });
  ec.emit('pointerdown', pe(1, 1, 1)); bad = true; ec.emit('pointerup', pe(1, 1, 1));
  eq(ecalls.join(','), 'down,cancel', 'unmappable up → cancel');

  // touch fallback (no PointerEvent)
  const sb5 = makeSandbox({ addEventListener() {}, removeEventListener() {} });
  sb5.RR = {};
  const IN5 = load(sb5, ['input.js']).Input;
  const tc = new El('canvas'), tcalls = [];
  IN5.attach(tc, { down: (x, y) => tcalls.push(['down', x, y]), up: (x, y) => tcalls.push(['up', x, y]), cancel: () => tcalls.push(['cancel']) });
  const te = (ids, changed) => ({ target: tc, cancelable: true, preventDefault() {},
    touches: ids.map(i => ({ identifier: i, clientX: i * 10, clientY: i * 10 })),
    changedTouches: changed.map(i => ({ identifier: i, clientX: i * 10, clientY: i * 10 })) });
  tc.emit('touchstart', te([1], [1]));
  tc.emit('touchstart', te([1, 2], [2]));
  tc.emit('touchend', te([1], [2]));
  tc.emit('touchend', te([], [1]));
  eq(JSON.stringify(tcalls), JSON.stringify([['down', 10, 10], ['up', 10, 10]]), 'touch fallback: one finger only');
})();

(function () {
  section('holdButton (parent gate)');
  function El() { this.h = {}; this.style = {}; }
  El.prototype.addEventListener = function (t, fn) { (this.h[t] = this.h[t] || []).push(fn); };
  El.prototype.removeEventListener = function (t, fn) { this.h[t] = (this.h[t] || []).filter(f => f !== fn); };
  El.prototype.setPointerCapture = function () {};
  El.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 50, bottom: 50 }; };
  El.prototype.emit = function (t, e) { (this.h[t] || []).slice().forEach(f => f(e)); };
  const sb6 = makeSandbox({ PointerEvent: function () {}, addEventListener() {}, removeEventListener() {} });
  sb6.RR = {};
  const IN = load(sb6, ['input.js']).Input;
  const el = new El(); let done = 0;
  IN.holdButton(el, 60, () => done++);
  const pe = (id) => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: 10, clientY: 10, cancelable: true, preventDefault() {} });
  el.emit('pointerdown', pe(1));
  el.emit('pointerup', pe(1));
  asyncTests.push(new Promise(r => setTimeout(r, 120)).then(() => {
    eq(done, 0, 'a quick tap on the gear does nothing');
    el.emit('pointerdown', pe(2));
    return new Promise(r => setTimeout(r, 160)).then(() => eq(done, 1, 'holding the gear opens settings'));
  }));
})();

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
ok(sb.RR.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into RR.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof RR.Input.attach === 'function' && typeof RR.Input.kidProof === 'function' && typeof RR.Input.holdButton === 'function',
  'input.js exports');

// ------------------------------------------------------------------ voice with a fake synth + recognizer
section('voice with fake speechSynthesis / SpeechRecognition');
function fakeSynthEnv(opts) {
  opts = opts || {};
  const spoken = [];
  const fakeVoices = [
    { name: 'Fred', lang: 'en-US', localService: true },
    { name: 'Google US English', lang: 'en-US', localService: false },
    { name: 'Samantha', lang: 'en-US', localService: true, default: true },
    { name: 'Linh', lang: 'vi-VN', localService: true },
    { name: 'Thomas', lang: 'fr-FR', localService: true }
  ];
  const synth = {
    speaking: false, paused: false, onvoiceschanged: null, refuse: 0,
    getVoices() { return fakeVoices; },
    speak(u) {
      spoken.push(u);
      if (this.refuse > 0 && u.text !== ' ') { this.refuse--; setTimeout(() => { u._ended = true; u.onerror && u.onerror({ error: 'not-allowed' }); }, 1); return; }
      this.speaking = true; setTimeout(() => { u.onstart && u.onstart(); }, 1);
    },
    cancel() { const c = spoken.filter(u => !u._ended); c.forEach(u => { u._ended = true; u.onerror && u.onerror({ error: 'interrupted' }); }); this.speaking = false; },
    pause() {}, resume() {}
  };
  function Utt(text) { this.text = text; }
  const env = { spoken, synth };
  function Rec() { env.rec = this; this.started = false; }
  Rec.prototype.start = function () { this.started = true; };
  Rec.prototype.abort = function () { this.aborted = true; };
  Rec.prototype.stop = function () {};
  env.Rec = Rec;
  const sbx = makeSandbox(Object.assign({ speechSynthesis: synth, SpeechSynthesisUtterance: Utt, webkitSpeechRecognition: Rec }, opts.extra || {}));
  sbx.RR = {};
  env.RR = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.RR.Voice;
  env.end = (u) => { u = u || spoken[spoken.length - 1]; if (u._ended) return; u._ended = true; synth.speaking = false; u.onend && u.onend(); };
  env.texts = () => spoken.map(u => u.text).filter(t => t !== ' ');
  return env;
}
const wait = (ms) => new Promise(res => setTimeout(res, ms));
asyncTests.push((async function () {
  const E = fakeSynthEnv();
  const V2 = E.V;
  V2.init({ lang: 'en' });
  eq(V2.voiceName('en'), 'Samantha', 'en picks Samantha over Fred/Google');
  eq(V2.voiceName('vi'), 'Linh', 'vi picks Linh');
  ok(V2.hasVoice('vi'), 'hasVoice vi');
  ok(V2.canListen(), 'canListen with webkitSpeechRecognition');
  let starts = 0, ends = 0;
  V2.onStart = () => starts++; V2.onEnd = () => ends++;
  // before the first gesture only the newest line is kept
  const a0 = V2.say('dropped before unlock'), a = V2.say('before unlock');
  eq((await a0).reason, 'dropped', 'before unlock only the newest line is kept');
  await wait(20);
  eq(E.texts().length, 0, 'nothing spoken before unlock');
  V2.unlock();
  await wait(150);
  ok(E.spoken[0].text === ' ', 'unlock speaks a silent utterance first');
  eq(E.texts()[0], 'before unlock', 'queued line spoken after unlock');
  const cur = E.spoken[E.spoken.length - 1];
  eq(cur.lang, 'en-US', 'utterance lang en-US');
  ok(cur.voice && cur.voice.name === 'Samantha', 'utterance voice set');
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Bim: rate 0.9, pitch 1.2');
  ok(V2.isSpeaking(), 'isSpeaking true while talking');
  ok(starts >= 1, 'onStart fired');
  // queue: one speaking + at most 2 waiting; the oldest non-priority line is dropped
  const b = V2.say('one'), c = V2.say('two', { priority: true }), d = V2.say('three');
  eq((await b).reason, 'dropped', 'queue ≤ 2: oldest non-priority line dropped');
  E.end(cur);
  eq((await a).spoken, true, 'first line resolves spoken:true on end');
  await wait(20);
  ok(ends >= 1, 'onEnd fired');
  eq(E.texts().slice(-1)[0], 'two', 'priority line kept and spoken next');
  E.end(); await wait(20);
  eq(E.texts().slice(-1)[0], 'three', 'then the newest line');
  E.end(); await Promise.all([c, d]);
  // interrupt: cancels current + waiting, speaks the new line after a short gap
  V2.say('long line'); await wait(20);
  const q1 = V2.say('waiting line');
  const before = E.spoken.length;
  const xin = V2.say('Xin chào', { lang: 'vi', interrupt: true });
  eq((await q1).reason, 'interrupted', 'interrupt flushes waiting lines');
  await wait(150);
  const last = E.spoken[E.spoken.length - 1];
  ok(E.spoken.length > before && last.text === 'Xin chào' && last.lang === 'vi-VN', 'interrupt speaks now in vi-VN');
  ok(last.voice && last.voice.name === 'Linh', 'vi voice Linh used');
  // dropQueued: the speaking line finishes, waiting ones go
  const w1 = V2.say('stale instruction');
  V2.dropQueued();
  eq((await w1).reason, 'dropped', 'dropQueued drops waiting lines');
  E.end(last); await xin;
  // stale non-priority lines are skipped
  V2.stop();
  ok(!V2.isSpeaking(), 'stop() clears speaking');
  // speech text goes through I18N.speech, display text is logged as is
  V2.say('Find the letter B!'); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Find the letter bee!', 'speech() applied to the utterance');
  ok(V2.log.some(e => e.text === 'Find the letter B!'), 'log keeps the display text');
  E.end(); await wait(10);
  // "Bim" is spoken as written in both languages; the bubble text (onStart, log) is the same
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là voi Bim. Bim giúp bé nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là voi Bim. Bim giúp bé nhé!', 'vi utterance says "Bim"');
  eq(startText, 'Mình là voi Bim. Bim giúp bé nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('talk.animals', { animal: 'cow' }, { lang: 'vi' });
  eq(sk.text, 'Con bò đâu rồi nhỉ?', 'sayKey renders the vi line');
  await wait(20); E.end(); await sk;
  // disabled → nothing spoken but logged
  V2.setEnabled(false);
  const off = await V2.say('muted');
  eq(off.reason, 'off', 'disabled voice resolves off');
  ok(V2.log.some(e => e.text === 'muted'), 'muted lines are still logged');
  V2.setEnabled(true);

  // Safari "not-allowed" (no gesture) → the line waits for the next unlock instead of being lost
  const E2 = fakeSynthEnv();
  E2.V.init({ lang: 'en' }); E2.V.unlock(); await wait(100);
  E2.synth.refuse = 1;
  const na = E2.V.say('retry me');
  await wait(40);
  ok(!E2.V.isSpeaking(), 'not-allowed: nothing speaking');
  E2.V.unlock(); await wait(150);
  eq(E2.texts().filter(t => t === 'retry me').length, 2, 'not-allowed line is spoken again after the next unlock');
  E2.end(); eq((await na).spoken, true, 'not-allowed line finally resolves spoken');

  // a line queued before unlock is not "stale" even when the first tap comes late
  const E3 = fakeSynthEnv();
  E3.V.init({ lang: 'en' });
  const realNow = Date.now;
  const welcome = E3.V.say('Welcome!');
  const t0 = realNow();
  E3.RR.__dummy = 0;
  Date.now = () => t0 + 8000;      // 8 s later the child taps
  E3.V.unlock();
  Date.now = realNow;
  await wait(150);
  ok(E3.texts().includes('Welcome!'), 'welcome line survives a slow first tap');
  E3.end(); await welcome;

  // listening: final match
  const pr = V2.listen({ lang: 'vi', choices: [{ id: 'r', kind: 'color', value: 'red' }, { id: 'b', kind: 'color', value: 'blue' }], timeoutMs: 2000 });
  const R = E.rec;
  ok(R && R.started && R.lang === 'vi-VN' && R.maxAlternatives === 5 && R.interimResults === true, 'recognizer configured');
  const alt = (t) => ({ transcript: t, confidence: 0.9 });
  const result = (isFinal, ...ts) => { const r = ts.map(alt); r.isFinal = isFinal; return r; };
  R.onresult({ resultIndex: 0, results: [result(true, 'mầu đổ', 'màu đỏ')] });
  const r1 = await pr;
  eq(r1.id, 'r', 'listen resolves on a final match');
  ok(R.aborted, 'recognizer aborted after match');
  // interim match waits, then resolves
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['cow', 'duck', 'frog']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the duck')] });
  eq((await pr2).id, 'duck', 'interim match resolves after a short wait');
  // a fresh recognizer per listen() (iOS hangs when one is reused)
  const r2a = E.rec;
  const pr3 = V2.listen({ lang: 'en', choices: colEn, timeoutMs: 2000 });
  ok(E.rec !== r2a, 'new recognizer instance per listen()');
  E.rec.onend();
  eq((await pr3).reason, 'no-speech', 'end without speech → no-speech');
  const pr4 = V2.listen({ lang: 'en', choices: colEn, timeoutMs: 2000 });
  E.rec.onerror({ error: 'not-allowed' });
  eq((await pr4).reason, 'not-allowed', 'permission denied reason');
  ok(!V2.canListen(), 'canListen false for the session after denial');
  // timeout path on a fresh instance
  const E4 = fakeSynthEnv();
  const pr5 = E4.V.listen({ lang: 'en', choices: colEn, timeoutMs: 40 });
  eq((await pr5).reason, 'timeout', 'listen times out');
  // iOS home-screen app: no listening
  const E5 = fakeSynthEnv({ extra: { navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: true, platform: 'iPhone', maxTouchPoints: 5 } } });
  ok(!E5.V.canListen(), 'iOS standalone web app: canListen false');
  ok(E5.V._env.IS_IOS, 'iPhone detected as iOS');
  const E6 = fakeSynthEnv({ extra: { navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', platform: 'MacIntel', maxTouchPoints: 5 } } });
  ok(E6.V._env.IS_IOS, 'iPadOS (desktop UA, touch) detected as iOS');
})().catch(e => ok(false, 'voice async: ' + (e && e.stack))));

Promise.all(asyncTests).then(() => {
  console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, (e) => { console.log('FAIL  async error: ' + (e && e.stack)); process.exit(1); });
