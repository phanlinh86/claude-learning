#!/usr/bin/env node
// Pip's Camp Hide & Seek — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/fox-camp-hide-seek:   node tests/unit/i18n_voice.test.js
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
  return sb.FC;
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
sb.FC = { debug: { voiceLog: [] } };
let FC;
try { FC = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = FC.I18N, V = FC.Voice;
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
  'tapPip', 'tapBim', 'years', 'skip', 'langName.en', 'langName.vi'];
const PROMPT_KEYS = ['p.colors', 'p.colors.night', 'p.shapes', 'p.countUp', 'p.count', 'p.animals', 'p.sound', 'p.size',
  'p.letters', 'p.lower', 'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const FOUND_KEYS = ['found', 'found.it', 'found.animal', 'found.size', 'found.sound', 'found.stars', 'found.math',
  'found.oddeven', 'found.initial', 'found.lower'];
const WRONG_KEYS = ['wrong', 'wrong.it', 'wrong.oddeven', 'wrong.find', 'wrong.sound', 'wrong.math', 'wrong.initial',
  'wrong.initialIt', 'wrong.lower', 'wrong.parity'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(PROMPT_KEYS).concat(['p.any'])
  .concat(['gather', 'countNum.1', 'countNum.2', 'countNum.3', 'empty', 'party', 'miss'])
  .concat(['surprise.swap', 'surprise.critter', 'critter.tap'])
  .concat(['praise', 'great', 'hint', 'idle', 'talk.intro', 'talk.right', 'talk.wrong',
    'talk.animalsAny', 'talk.sound', 'session.done', 'say.countDone'])
  .concat(FOUND_KEYS).concat(WRONG_KEYS)
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
for (const k of Object.keys(I.PARAMS)) for (const lang of I.langs) ok(I.has(lang, k), `PARAMS key ${k} exists in ${lang}`);
eq(Object.keys(I.PROMPTS).sort().join(','), PROMPT_KEYS.slice().sort().join(','), 'PROMPTS lists every prompt key');
for (const fn of ['t', 'name', 'words', 'has', 'setChild', 'sayFound', 'sayWrong', 'sayEmpty', 'sayCount', 'talkWrong',
  'cluePhrase', 'sayGo', 'sayCollect', 'speech'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);
// keys the game code asks for at run time (files still copied from the rocket game are skipped until rewired)
(function () {
  const files = ['main.js', 'ui.js', 'render.js', 'content.js', 'world.js', '../index.html'];
  const used = new Set();
  for (const f of files) {
    let src = '';
    try { src = fs.readFileSync(path.join(JS, f), 'utf8'); } catch (e) { continue; }
    if (/Rainbow Rocket|Forest Memory/.test(src.slice(0, 800))) { console.log(`   (${f} is still the rocket copy — key check skipped)`); continue; }
    src.replace(/['"`]((?:ui|talk|session|weather|topic|p|found|wrong|surprise|critter|countNum)\.[A-Za-z0-9.]*[A-Za-z0-9]|gather|party|empty|praise|great|hint|idle|miss)['"`]/g,
      (m, k) => { used.add(k); return m; });
  }
  for (const k of used) {
    if (/\.$/.test(k)) continue;
    for (const lang of I.langs) ok(I.has(lang, k) || /^topic\.|^weather\.|^talk\.$|^countNum\.$/.test(k + '.'), `key used by the game code exists: ${lang} ${k}`);
  }
})();
const ALL_TEXT = I.langs.map(l => I.keys(l).map(x => [].concat(I.raw(l, x)).join(' ')).join(' ')).join(' ');
for (const k of ['Bim', 'elephant', 'rocket', 'tên lửa', 'cloud', 'đám mây', 'planet', 'hành tinh', 'wagon', 'xe mây',
  'blast', 'island', 'phóng', 'Dee', 'duckling', 'Miu', 'balloon'])
  ok(ALL_TEXT.toLowerCase().indexOf(k.toLowerCase()) < 0, `no leftover rocket/older-game wording "${k}"`);
ok(!/\bvoi\b/i.test(ALL_TEXT), 'no leftover "voi" (elephant)');
ok(/Pip/.test(I.t('en', 'ui.welcome', { child: '' })) && /Pip/.test(I.t('vi', 'ui.welcome', { child: '' })), 'helper is Pip in both languages');
ok(/cáo Pip/.test(I.t('vi', 'ui.welcome', { child: '' })), 'vi introduces "cáo Pip"');

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right', 'found']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}
for (const lang of I.langs) for (const k of ['great', 'idle', 'talk.right']) {
  const v = I.raw(lang, k);
  ok(v.some(s => s.includes('{child}')) && v.some(s => !s.includes('{child}')), `${lang} ${k} has name + no-name variants`);
}
for (const lang of I.langs) for (const k of ['gather', 'party', 'empty', 'surprise.swap', 'surprise.critter', 'critter.tap',
  'countNum.3', 'session.done'].concat(FOUND_KEYS, WRONG_KEYS))
  ok(Array.isArray(I.raw(lang, k)) && I.raw(lang, k).length >= 2, `${lang} ${k} has ≥ 2 variants`);

section('Vietnamese wording sanity, titles');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'mau do', 'con bo', 'cai mu', 'la co', 'tron tim'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
ok(/Bé ơi/.test(viAll) && /nhé!/.test(viAll) && /nào!/.test(viAll) && /giỏi quá!/.test(viAll), 'vi uses "Bé ơi", "nhé!", "nào!", "giỏi quá!"');
ok(/cái mũ/.test(viAll) && /lá cờ/.test(viAll) && /ngôi sao/.test(viAll) && /trốn tìm/.test(viAll) && /lửa trại/.test(viAll),
  'vi uses cái mũ / lá cờ / ngôi sao / trốn tìm / lửa trại');
eq(I.t('en', 'ui.title'), 'Pip’s Camp Hide & Seek', 'en title');
eq(I.t('vi', 'ui.title'), 'Cáo Pip Chơi Trốn Tìm', 'vi title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Pip’s / Camp Hide & Seek', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Cáo Pip / Chơi Trốn Tìm', 'vi logo lines');
eq(I.t('en', 'ui.voice'), 'Pip’s voice', 'en ui.voice');
eq(I.t('vi', 'ui.voice'), 'Giọng của Pip', 'vi ui.voice');
eq(I.t('en', 'ui.volume'), 'Volume', 'en ui.volume');
eq(I.t('vi', 'ui.volume'), 'Âm lượng', 'vi ui.volume');
eq(I.t('vi', 'ui.listening'), 'Pip đang nghe…', 'vi listening');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.chapter', { n: 3 }), 'Chương 3', 'vi chapter');
eq(I.t('en', 'weather.0'), 'Hello, spring!', 'weather 0 spring');
eq(I.t('en', 'weather.1'), 'Summer camp time!', 'weather 1 summer');
eq(I.t('en', 'weather.2'), 'Look at the autumn leaves!', 'weather 2 autumn');
eq(I.t('en', 'weather.3'), 'Brr, it’s snowing!', 'weather 3 winter');
eq(I.t('vi', 'weather.0'), 'Chào mùa xuân!', 'vi weather 0 spring');
eq(I.t('vi', 'weather.3'), 'Ui lạnh quá, tuyết rơi rồi!', 'vi weather 3 winter');
eq(I.t('en', 'gather', {}, r0), 'Let’s play hide-and-seek!', 'en gather[0]');
eq(I.t('vi', 'gather', {}, r0), 'Mình chơi trốn tìm nhé!', 'vi gather[0]');
eq(I.t('en', 'countNum.1') + ' ' + I.t('en', 'countNum.2') + ' ' + I.t('en', 'countNum.3', {}, r0),
  'One… Two… Three! Here I come!', 'en count 1-2-3');
eq(I.t('vi', 'countNum.1') + ' ' + I.t('vi', 'countNum.2') + ' ' + I.t('vi', 'countNum.3', {}, r0),
  'Một… Hai… Ba! Pip đi tìm đây!', 'vi count 1-2-3');
eq(I.speech('en', I.t('en', 'countNum.1')), 'One.', 'count speech: … becomes a pause');
eq(I.t('en', 'party', {}, r0), 'Everybody found! Campfire dance!', 'en party[0]');
eq(I.t('en', 'empty', {}, r0), 'Nobody there now, just a butterfly!', 'en empty[0]');
eq(I.t('en', 'surprise.swap', {}, r0), 'Whoa, they switched!', 'en surprise.swap');
eq(I.t('vi', 'surprise.swap', {}, r0), 'Ơ kìa, hai bạn đổi chỗ rồi!', 'vi surprise.swap');
eq(I.t('en', 'topic.colors'), 'Colour Hats', 'en topic.colors');
eq(I.t('vi', 'topic.shapes'), 'Lá cờ hình khối', 'vi topic.shapes');

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  ok(positive([].concat(I.raw(lang, k)).join(' ')), `${lang} ${k} has no negative words`);
}
ok(!positive('That is wrong') && !positive('Sai rồi') && !positive('no!'), 'the negative-word filter itself works');

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, stars: 7, child: 'Mai', answer: 'X', it: 'red', want: 'blue', animal: 'cow', color: 'red', shape: 'star',
  size: 'big', letter: 'B', lower: 'b', text: 'B', word: 'cat', first: 'C', a: 2, b: 3, parity: 'odd', expr: '2 + 3', num: 'three' };
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
eq(I.t('en', 'p.nosuchtopic', {}, r0), 'Who is hiding? Tap to peek!', 'unknown prompt → p.any');
eq(I.t('vi', 'p.nosuchtopic', {}, r0), 'Ai đang trốn đó? Bé chạm để xem nhé!', 'vi unknown prompt → p.any');
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
eq(I.t('en', 'p.colors', { color: 'red' }, r0), 'Where is the friend in the red hat?', 'en p.colors');
eq(I.t('en', 'p.colors.night', { color: 'red' }, r0), 'It’s getting dark! Where is the red hat?', 'en p.colors.night');
eq(I.t('vi', 'p.colors', { color: 'red' }, r0), 'Bé ơi, bạn đội cái mũ màu đỏ đâu rồi nhỉ?', 'vi p.colors (cái mũ màu đỏ)');
eq(I.t('vi', 'p.colors', { color: 'blue' }, () => 0.9), 'Bé tìm cái mũ màu xanh dương nào!', 'vi p.colors [2]');
eq(I.t('en', 'p.shapes', { shape: 'star' }, r0), 'Who has the star flag?', 'en p.shapes');
eq(I.t('vi', 'p.shapes', { shape: 'star' }, r0), 'Bé ơi, ai cầm lá cờ hình ngôi sao nhỉ?', 'vi p.shapes (lá cờ hình ngôi sao)');
eq(I.t('en', 'p.shapes', { shape: 'rect' }, () => 0.9), 'Find the rectangle flag! Tap to peek!', 'en p.shapes rect');
eq(I.t('en', 'p.countUp', { n: 2 }, r0), 'Let’s count! Find 2!', 'en p.countUp');
eq(I.t('en', 'p.countUp', { n: 3 }, () => 0.5), 'Now find 3!', 'en p.countUp short');
eq(I.t('vi', 'p.countUp', { n: 3 }, () => 0.5), 'Giờ bé tìm số 3 nhé!', 'vi p.countUp');
eq(I.t('en', 'p.count', { n: 1 }, r0), 'Who has 1 star?', 'en p.count singular');
eq(I.t('en', 'p.count', { n: 4 }, r0), 'Who has 4 stars?', 'en p.count plural');
eq(I.t('vi', 'p.count', { n: 3 }, r0), 'Bé ơi, ai có 3 ngôi sao nhỉ?', 'vi p.count');
eq(I.t('en', 'p.animals', { animal: 'cow' }, r0), 'Where is the cow hiding?', 'en p.animals');
eq(I.t('vi', 'p.animals', { animal: 'cow' }, r0), 'Bé ơi, con bò trốn ở đâu nhỉ?', 'vi p.animals (con bò)');
eq(I.t('vi', 'p.animals', { animal: 'duck' }, () => 0.9), 'Ú òa! Con vịt đâu rồi nhỉ?', 'vi p.animals capitalised after "!"');
eq(I.t('en', 'p.sound', { animal: 'cow' }, r0), 'Who says moo? Find them!', 'en p.sound');
eq(I.t('en', 'p.sound', { animal: 'cow' }, () => 0.5), 'Listen! Moo! Who is hiding?', 'en p.sound sentence-capitalised');
eq(I.t('vi', 'p.sound', { animal: 'pig' }, r0), 'Con gì kêu ụt ịt? Bé tìm bạn ấy nhé!', 'vi p.sound');
eq(I.t('en', 'p.sound', { sound: 'dog' }, r0), 'Who says woof? Find them!', 'p.sound from a {sound: animal id}');
eq(I.t('en', 'p.size', { size: 'big', animal: 'cow' }, r0), 'Find the big cow!', 'en p.size');
eq(I.t('en', 'p.size', { size: 'small', animal: 'pig' }, r0), 'Find the little pig!', 'en p.size small');
eq(I.t('vi', 'p.size', { size: 'small', animal: 'cow' }, r0), 'Bé ơi, tìm con bò nhỏ nhé!', 'vi p.size');
eq(I.t('en', 'p.letters', { letter: 'B' }, r0), 'Find the letter B!', 'en p.letters');
eq(I.t('en', 'p.lower', { letter: 'B' }, r0), 'Big letter B! Find its small letter!', 'en p.lower');
eq(I.t('en', 'p.initial', { letter: 'F' }, r0), 'Who starts with the letter F? Find them!', 'en p.initial');
eq(I.t('vi', 'p.initial', { letter: 'B' }, r0), 'Bạn nào bắt đầu bằng chữ B? Bé tìm nhé!', 'vi p.initial');
eq(V.spoken('vi', 'Bạn nào bắt đầu bằng chữ B?'), 'Bạn nào bắt đầu bằng chữ bờ?', 'vi p.initial spoken with phonics');
eq(I.t('en', 'p.add', { a: 2, b: 3 }, r0), 'What is 2 + 3? Find the answer!', 'en p.add');
eq(I.t('vi', 'p.sub', { a: 7, b: 2, op: '−' }, r0), '7 − 2 bằng mấy? Bé tìm đáp số nhé!', 'vi p.sub');
eq(I.t('en', 'p.oddeven', { parity: 'odd' }, r0), 'Find an odd number!', 'en p.oddeven (a → an)');
eq(I.t('en', 'p.oddeven', { parity: 'even' }, r0), 'Find an even number!', 'en p.oddeven even');
eq(I.t('vi', 'p.oddeven', { parity: 'even' }, r0), 'Bé ơi, tìm số chẵn nhé!', 'vi p.oddeven');
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
eq(I.t('en', 'session.done', { stars: 14 }, r0), 'You found everybody! 14 stars! Hooray!', 'en session.done');
eq(I.t('vi', 'session.done', { stars: 14 }, r0), 'Bé tìm được hết các bạn rồi! 14 ngôi sao!', 'vi session.done');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Pip. Let’s play hide-and-seek!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Pip. Let’s play hide-and-seek!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Mình là cáo Pip. Mình cùng chơi trốn tìm nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Mình là cáo Pip. Mình cùng chơi trốn tìm nhé!', 'vi welcome with name');
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
  for (const e of sb.FC.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 1, `${lang} words for word ${e.word} include the animal forms`);
    const first = e.word.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').charAt(0).toUpperCase();
    ok(first === e.initial, `${lang} word ${e.word} starts with ${e.initial} (tone marks ignored)`);
  }
}
eq(sb.FC.WORDS.vi.map(w => w.word + w.initial).join(','), 'mèoM,bòB,heoH,cừuC,vịtV,sư tửS,ếchÊ', 'vi initial words (no ch digraph)');
eq(sb.FC.WORDS.en.map(w => w.word + w.initial).join(','), 'catC,dogD,cowC,pigP,sheepS,duckD,lionL,frogF', 'en initial words');
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

// ------------------------------------------------------------------ hide-and-seek lines
const hat = (c) => ({ kind: 'hat', value: c, color: c, nameKind: 'color', nameValue: c });
const flag = (s, c) => ({ kind: 'flag', value: s, shape: s, color: c || 'red', nameKind: 'shape', nameValue: s });
const sign = (n, text) => Object.assign({ kind: 'sign', value: n, n, nameKind: text ? 'number' : 'stars', nameValue: n }, text ? { text: String(n) } : {});
const ears = (a) => ({ kind: 'ears', value: a, nameKind: 'animal', nameValue: a });
const sizeClue = (sz) => ({ kind: 'size', value: sz, scale: sz === 'big' ? 1 : 0.62, nameKind: 'size', nameValue: sz });
const badge = (v, nk) => ({ kind: 'badge', value: v, text: String(v), nameKind: nk, nameValue: v });

section('sayFound: exact lines');
eq(I.sayFound('en', { topic: 'colors', nameKind: 'color', nameValue: 'red', clue: hat('red'), animal: 'cow' }, r0),
  'Found you! The cow in the red hat!', 'en found hat with friend');
eq(I.sayFound('vi', { topic: 'colors', nameKind: 'color', nameValue: 'red', clue: hat('red'), animal: 'cow' }, r0),
  'Tìm thấy rồi! Con bò đội mũ màu đỏ!', 'vi found hat with friend');
eq(I.sayFound('en', { topic: 'colors', clue: hat('blue') }, () => 0.5), 'There you are! The blue hat!', 'en found hat without friend');
eq(I.sayFound('vi', { topic: 'colors', clue: hat('blue') }, () => 0.9), 'Ú òa! Cái mũ màu xanh dương đây rồi!', 'vi found hat (cái mũ)');
eq(I.sayFound('en', { topic: 'shapes', nameKind: 'shape', nameValue: 'star', clue: flag('star'), friend: { animal: 'duck' } }, r0),
  'Found you! The duck with the star flag!', 'en found flag (friend object)');
eq(I.sayFound('vi', { topic: 'shapes', clue: flag('star') }, r0), 'Tìm thấy rồi! Lá cờ hình ngôi sao!', 'vi found flag (lá cờ)');
eq(I.sayFound('en', { topic: 'count', nameKind: 'stars', nameValue: 3, clue: sign(3) }, r0), 'One, two, three stars! Found you!', 'en found stars counted');
eq(I.sayFound('vi', { topic: 'count', nameKind: 'stars', nameValue: 3, clue: sign(3) }, r0), 'Một, hai, ba ngôi sao! Tìm thấy rồi!', 'vi found stars counted');
eq(I.sayFound('en', { topic: 'count', clue: sign(2, true), promptKey: 'p.countUp', params: { n: 2 } }, r0), 'One, two stars! Found you!', 'en found count-up sign');
eq(I.sayFound('en', { topic: 'count', clue: sign(8) }, r0), 'Eight stars! Found you!', 'en found 8 stars');
eq(I.sayFound('en', { topic: 'count', clue: sign(1) }, r0), 'One star! Found you!', 'en found 1 star (singular)');
eq(I.sayFound('en', { topic: 'animals', nameKind: 'animal', nameValue: 'cow', clue: ears('cow') }, r0), 'Found you, cow! Moo!', 'en found animal');
eq(I.sayFound('vi', { topic: 'animals', nameKind: 'animal', nameValue: 'cow', clue: ears('cow') }, r0), 'Tìm thấy con bò rồi! Ùm bò!', 'vi found animal');
eq(I.sayFound('en', { topic: 'animals', clue: ears('cow'), promptKey: 'p.sound', params: { animal: 'cow' } }, r0),
  'The cow says moo! Found you!', 'en found by sound');
eq(I.sayFound('vi', { topic: 'animals', clue: ears('duck'), promptKey: 'p.sound', params: { animal: 'duck' } }, r0),
  'Con vịt kêu cạp cạp! Tìm thấy rồi!', 'vi found by sound');
eq(I.sayFound('en', { topic: 'size', nameKind: 'size', nameValue: 'big', clue: sizeClue('big'), animal: 'cow' }, r0),
  'Found you, big cow! Moo!', 'en found size');
eq(I.sayFound('vi', { topic: 'size', nameKind: 'size', nameValue: 'small', clue: sizeClue('small'), animal: 'pig' }, r0),
  'Tìm thấy con heo nhỏ rồi! Ụt ịt!', 'vi found size');
eq(I.sayFound('en', { topic: 'letters', clue: badge('B', 'letter') }, r0), 'Found you! The letter B!', 'en found letter');
eq(I.sayFound('vi', { topic: 'letters', clue: badge('B', 'letter') }, r0), 'Tìm thấy rồi! Chữ B!', 'vi found letter');
eq(V.spoken('vi', 'Tìm thấy rồi! Chữ B!'), 'Tìm thấy rồi! Chữ bờ!', 'vi found letter spoken with phonics');
eq(I.sayFound('en', { topic: 'lower', clue: badge('b', 'letter'), params: { letter: 'B' } }, r0), 'Big B, small b! Found you!', 'en found lower');
eq(I.speech('en', 'Big B, small b! Found you!'), 'Big bee, small bee! Found you!', 'en found lower speech');
eq(I.sayFound('en', { topic: 'add', clue: badge(5, 'number'), params: { a: 2, b: 3 } }, r0), '2 + 3 is five! Found you!', 'en found add');
eq(I.sayFound('vi', { topic: 'sub', clue: badge(4, 'number'), params: { expr: '7−3' } }, r0), '7 − 3 bằng bốn! Tìm thấy rồi!', 'vi found sub');
eq(I.sayFound('en', { topic: 'oddeven', clue: badge(7, 'number'), params: { parity: 'odd' } }, r0), 'Seven is odd! Found you!', 'en found oddeven');
eq(I.sayFound('en', { topic: 'initial', nameKind: 'animal', nameValue: 'frog', clue: { kind: 'ears', value: 'frog', word: 'frog', initial: 'F' },
  promptKey: 'p.initial', params: { letter: 'F' } }, r0), 'Frog starts with the letter F! Found you!', 'en found initial');
eq(I.sayFound('vi', { topic: 'initial', nameKind: 'animal', nameValue: 'cow', clue: ears('cow'), params: { letter: 'B' } }, r0),
  'Bò bắt đầu bằng chữ B! Tìm thấy rồi!', 'vi found initial (word list)');
ok(I.raw('en', 'found').includes(I.sayFound('en', {}, r0)), 'empty found event → a plain "Found you!" line');
eq(I.sayGo('en', { topic: 'animals', nameKind: 'animal', nameValue: 'cow' }, r0), 'Found you, cow! Moo!', 'sayGo = sayFound (back-compat)');
eq(I.sayCollect('en', { topic: 'count', token: { kind: 'stars', n: 3, nameKind: 'stars', nameValue: 3 } }, r0),
  'One, two, three stars! Found you!', 'sayCollect {topic, token} still works');

section('sayWrong: exact lines (names what popped out, repeats the goal)');
eq(I.sayWrong('en', { topic: 'colors', nameKind: 'color', nameValue: 'blue', clue: hat('blue'), animal: 'pig', want: { kind: 'color', value: 'red' } }, r0),
  'Hee hee! That’s the pig in the blue hat. Let’s find the red hat!', 'en wrong hat with friend');
eq(I.sayWrong('vi', { topic: 'colors', nameKind: 'color', nameValue: 'blue', clue: hat('blue'), animal: 'pig', want: { kind: 'color', value: 'red' } }, r0),
  'Hì hì! Đây là con heo đội mũ màu xanh dương nè. Mình tìm cái mũ màu đỏ nhé!', 'vi wrong hat with friend');
eq(I.sayWrong('en', { topic: 'colors', clue: hat('blue'), promptKey: 'p.colors', params: { color: 'red' } }, r0),
  'Hee hee! That’s the blue hat. Let’s find the red hat!', 'want derived from the prompt params');
eq(I.sayWrong('en', { topic: 'shapes', clue: flag('circle'), animal: 'duck', want: { kind: 'shape', value: 'star' } }, r0),
  'Hee hee! That’s the duck with the circle flag. Let’s find the star flag!', 'en wrong flag');
eq(I.sayWrong('vi', { topic: 'shapes', clue: flag('circle'), animal: 'duck', params: { shape: 'star' }, promptKey: 'p.shapes' }, r0),
  'Hì hì! Đây là con vịt cầm lá cờ hình tròn nè. Mình tìm lá cờ hình ngôi sao nhé!', 'vi wrong flag');
eq(I.sayWrong('en', { topic: 'count', clue: sign(2), animal: 'cat', want: { kind: 'stars', value: 3 } }, r0),
  'Hee hee! That’s the cat with two stars. Let’s find three stars!', 'en wrong stars');
eq(I.sayWrong('vi', { topic: 'count', clue: sign(1), want: { kind: 'stars', value: 4 } }, r0),
  'Hì hì! Đây là một ngôi sao nè. Mình tìm bốn ngôi sao nhé!', 'vi wrong stars without friend');
eq(I.sayWrong('en', { topic: 'count', clue: sign(4, true), want: { kind: 'number', value: 3 }, promptKey: 'p.countUp', params: { n: 3 } }, r0),
  'Hee hee! That’s four. Let’s find three!', 'en wrong count-up');
eq(I.sayWrong('en', { topic: 'animals', clue: ears('cat'), want: { kind: 'animal', value: 'cow' } }, r0),
  'Hee hee! That’s the cat. Let’s find the cow!', 'en wrong animal');
eq(I.sayWrong('en', { topic: 'animals', clue: ears('cat'), want: { kind: 'animal', value: 'cow' }, promptKey: 'p.sound', params: { animal: 'cow' } }, r0),
  'Hee hee! That’s the cat. Who says moo?', 'en wrong sound');
eq(I.sayWrong('vi', { topic: 'animals', clue: ears('cat'), promptKey: 'p.sound', params: { animal: 'cow' } }, r0),
  'Hì hì! Đây là con mèo nè. Con gì kêu ùm bò nhỉ?', 'vi wrong sound');
eq(I.sayWrong('en', { topic: 'size', clue: sizeClue('small'), animal: 'cow', want: { kind: 'size', value: 'big' }, params: { size: 'big', animal: 'cow' } }, r0),
  'Hee hee! That’s the little cow. Let’s find the big cow!', 'en wrong size');
eq(I.sayWrong('vi', { topic: 'size', clue: sizeClue('small'), animal: 'cow', want: { kind: 'size', value: 'big' }, params: { size: 'big', animal: 'cow' } }, r0),
  'Hì hì! Đây là con bò nhỏ nè. Mình tìm con bò to nhé!', 'vi wrong size');
eq(I.sayWrong('en', { topic: 'letters', clue: badge('C', 'letter'), want: { kind: 'letter', value: 'B' } }, r0),
  'Hee hee! That’s the letter C. Let’s find the letter B!', 'en wrong letter');
eq(V.spoken('vi', I.sayWrong('vi', { topic: 'letters', clue: badge('C', 'letter'), want: { kind: 'letter', value: 'B' } }, r0)),
  'Hì hì! Đây là chữ cờ nè. Mình tìm chữ bờ nhé!', 'vi wrong letter spoken with phonics');
eq(I.sayWrong('en', { topic: 'lower', clue: badge('d', 'letter'), params: { letter: 'B' } }, r0),
  'Hee hee! That’s small letter d. Big letter B! Let’s find its small letter!', 'en wrong lower');
eq(I.sayWrong('en', { topic: 'add', clue: badge(6, 'number'), params: { a: 2, b: 3 } }, r0),
  'Hee hee! That’s six. What is 2 + 3?', 'en wrong add (never gives the answer)');
eq(I.sayWrong('en', { topic: 'initial', clue: { kind: 'ears', value: 'dog', word: 'dog', initial: 'D', nameKind: 'animal', nameValue: 'dog' },
  promptKey: 'p.initial', params: { letter: 'F' } }, r0), 'Hee hee! Dog starts with the letter D. Who starts with the letter F?', 'en wrong initial');
eq(I.sayWrong('vi', { topic: 'initial', clue: ears('duck'), params: { letter: 'M' } }, r0),
  'Hì hì! Vịt bắt đầu bằng chữ V đó. Bạn nào bắt đầu bằng chữ M nhỉ?', 'vi wrong initial');
eq(I.sayWrong('en', { topic: 'oddeven', clue: badge(4, 'number'), params: { parity: 'odd' } }, r0),
  'Hee hee! That’s four, an even number. Let’s find an odd number!', 'en wrong oddeven');
eq(I.sayWrong('vi', { topic: 'oddeven', clue: badge(4, 'number'), params: { parity: 'odd' } }, r0),
  'Hì hì! Đây là số bốn, số chẵn đó. Mình tìm số lẻ nhé!', 'vi wrong oddeven');
ok(I.raw('en', 'wrong').includes(I.sayWrong('en', {}, r0)), 'empty wrong event → a gentle generic line');
eq(I.cluePhrase('en', { topic: 'colors', clue: hat('green'), animal: 'frog' }), 'the frog in the green hat', 'cluePhrase en');
eq(I.cluePhrase('vi', { topic: 'shapes', clue: flag('heart'), animal: 'sheep' }), 'con cừu cầm lá cờ hình trái tim', 'cluePhrase vi');
for (const lang of I.langs) for (let i = 0; i < 3; i++) {
  const s = I.sayEmpty(lang, { placeId: 2 }, () => (i + 0.5) / 3);
  ok(clean(s) && positive(s) && I.raw(lang, 'empty').includes(s), `${lang} sayEmpty[${i}]: ${s}`);
}

section('sayFound / sayWrong for every topic and value (both languages)');
const SYN = {
  colors: COLORS.map(hat),
  shapes: SHAPES.map((s, i) => flag(s, COLORS[i % 7])),
  size: [].concat(...ANIMALS.map(a => [Object.assign(sizeClue('big'), { animal: a }), Object.assign(sizeClue('small'), { animal: a })])),
  count: [].concat(...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => [sign(n), sign(n, true)])),
  animals: ANIMALS.map(ears),
  letters: LETTERS_EN.map(l => badge(l, 'letter')),
  lower: LETTERS_EN.map(l => badge(l.toLowerCase(), 'letter')),
  initial: ANIMALS.map(ears),
  add: Array.from({ length: 21 }, (_, n) => badge(n, 'number')),
  sub: Array.from({ length: 11 }, (_, n) => badge(n, 'number')),
  oddeven: Array.from({ length: 20 }, (_, n) => badge(n + 1, 'number'))
};
function promptFor(topic, c, lang) {
  switch (topic) {
    case 'colors': return ['p.colors', { color: c.value }];
    case 'shapes': return ['p.shapes', { shape: c.value }];
    case 'size': return ['p.size', { size: c.nameValue, animal: c.animal }];
    case 'count': return c.nameKind === 'number' ? ['p.countUp', { n: c.n }] : ['p.count', { n: c.n }];
    case 'animals': return ['p.animals', { animal: c.value }];
    case 'letters': return ['p.letters', { letter: c.value }];
    case 'lower': return ['p.lower', { letter: c.value.toUpperCase() }];
    case 'initial': return ['p.initial', { letter: (I.WORD_LIST[lang].find(w => w[1] === 'animal_' + c.value) || ['', '', 'Z'])[2] }];
    case 'add': return ['p.add', { a: Math.floor(c.value / 2), b: c.value - Math.floor(c.value / 2) }];
    case 'sub': return ['p.sub', { a: 10, b: 10 - c.value, op: '−' }];
    case 'oddeven': return ['p.oddeven', { parity: c.value % 2 ? 'odd' : 'even' }];
  }
}
let synLines = 0;
for (const lang of I.langs) for (const topic of TOPICS) {
  const clues = SYN[topic];
  for (let i = 0; i < clues.length; i++) {
    const right = clues[i], other = clues[(i + 1) % clues.length];
    const [pk, params] = promptFor(topic, right, lang);
    const prompts = [[pk, params]];
    if (topic === 'animals') prompts.push(['p.sound', { animal: right.value }]);
    const rng = () => (i % 3 + 0.5) / 3;
    for (const [promptKey, prm] of prompts) for (const friend of [null, ANIMALS[(i + 3) % 8]]) {
      const want = { kind: right.nameKind, value: right.nameValue };
      const fa = topic === 'animals' || topic === 'initial' ? right.value : topic === 'size' ? right.animal : friend;
      const g = I.sayFound(lang, { topic, nameKind: right.nameKind, nameValue: right.nameValue, clue: right, animal: fa, promptKey, params: prm, n: 1 }, rng);
      ok(clean(g) && positive(g) && !I.raw(lang, 'found').includes(g) && nWords(g) <= 16, `${lang} ${topic} found ${JSON.stringify(right.nameValue)} (${fa}): ${g}`);
      if (topic === 'colors') ok(g.toLowerCase().indexOf(I.name(lang, 'color', right.value)) >= 0 && /hat|mũ/.test(g), `${lang} found names the hat colour: ${g}`);
      if (topic === 'shapes') ok(g.toLowerCase().indexOf(I.name(lang, 'shape', right.value)) >= 0 && /flag|lá cờ/i.test(g), `${lang} found names the flag shape: ${g}`);
      if (topic === 'count') ok(/star|sao/.test(g), `${lang} count found counts stars: ${g}`);
      if (fa && (topic === 'colors' || topic === 'shapes')) ok(g.toLowerCase().indexOf(I.name(lang, 'animal', fa)) >= 0, `${lang} found names the friend: ${g}`);
      if (topic === 'animals' || topic === 'size') ok(g.toLowerCase().indexOf(I.sound(lang, fa)) >= 0, `${lang} animal found says the sound: ${g}`);
      const oa = topic === 'animals' || topic === 'initial' ? other.value : topic === 'size' ? other.animal : friend;
      const w = I.sayWrong(lang, { topic, nameKind: other.nameKind, nameValue: other.nameValue, clue: other, animal: oa, want, promptKey, params: prm, streak: 1 }, rng);
      ok(clean(w) && positive(w) && !I.raw(lang, 'wrong').includes(w) && nWords(w) <= 24, `${lang} ${topic} wrong ${JSON.stringify(other.nameValue)}→${JSON.stringify(right.nameValue)}: ${w}`);
      ok(/[.!?]$/.test(w) && w.split(/[.!?] /).length >= 2, `${lang} ${topic} wrong names what popped out then the goal: ${w}`);
      if (topic === 'colors') {
        ok(w.toLowerCase().indexOf(I.name(lang, 'color', other.value)) >= 0, `${lang} wrong names the popped-out hat colour: ${w}`);
        ok(w.toLowerCase().lastIndexOf(I.name(lang, 'color', right.value)) > w.toLowerCase().indexOf(I.name(lang, 'color', other.value)), `${lang} wrong repeats the wanted colour: ${w}`);
      }
      if (topic === 'animals' && promptKey === 'p.animals') ok(w.toLowerCase().indexOf(I.name(lang, 'animal', other.value)) >= 0, `${lang} wrong names the popped-out animal: ${w}`);
      if (topic === 'add' || topic === 'sub') ok(w.indexOf(I.name(lang, 'number', right.value) + '!') < 0 || right.value === other.value, `${lang} ${topic} wrong never says the answer: ${w}`);
      if (promptKey === 'p.sound') ok(w.toLowerCase().indexOf(I.sound(lang, right.value)) >= 0, `${lang} sound wrong repeats the sound: ${w}`);
      synLines += 2;
    }
  }
}
ok(synLines > 1000, `checked ${synLines} synthetic found/wrong lines`);

section('garbage events never throw, never print junk');
const JUNK = [undefined, null, {}, 'x', 42, { nameKind: 'zzz', nameValue: 'q' }, { nameKind: 'color' }, { token: 'x' }, { clue: 'x' },
  { clue: { kind: 'hat' } }, { clue: { kind: 'sign' } }, { clue: { kind: 'flag', shape: 'blob' } }, { animal: 'zebra', clue: { kind: 'hat', value: 'red' } },
  { friend: 5 }, { token: { kind: 'animal' } }, { want: 'x' }, { want: { kind: 'stars' } }, { params: 'junk', promptKey: 'p.sound' },
  { nameKind: 'shape', nameValue: 'blob', token: { kind: 'shape', color: 'zz' } }, { topic: 'oddeven' }, { topic: 'size', nameKind: 'size', nameValue: 'big' },
  { topic: 'add', nameKind: 'number', nameValue: 3 }, { promptKey: 'p.lower', nameKind: 'letter', nameValue: 'b' },
  { topic: 'initial', nameKind: 'animal', nameValue: 'cat' }, { promptKey: 'p.initial', token: { kind: 'animal', value: 'zebra' } }];
for (const lang of I.langs) for (const ev of JUNK) for (const fn of ['sayFound', 'sayWrong', 'sayEmpty', 'cluePhrase', 'sayGo', 'sayCollect',
  'sayFlip', 'sayMatch', 'sayMismatch', 'sayReward', 'sayCorrect']) {
  let s;
  try { s = I[fn](lang, ev); } catch (e) { s = 'THROW ' + e.message; }
  if (fn === 'cluePhrase') ok(typeof s === 'string' && !/undefined|null|THROW|\{/.test(s), `${lang} cluePhrase(${JSON.stringify(ev)}) → ${s}`);
  else ok(clean(s) && positive(s), `${lang} ${fn}(${JSON.stringify(ev)}) → ${s}`);
}
eq(I.sayCount('en', 2, 3), 'Two!', 'sayCount below need');
eq(I.sayCount('en', 3, 3), 'Three! Three stars!', 'sayCount at need');
eq(I.sayCount('vi', 3, 3), 'Ba! Ba ngôi sao!', 'vi sayCount at need');
eq(I.phrase('en', 'animal', 'cow'), 'the cow', 'phrase animal');
eq(I.phrase('vi', 'stars', 3), 'ba ngôi sao', 'phrase stars vi');
eq(I.cardPhrase('en', { nameKind: 'shape', nameValue: 'heart' }), 'a heart', 'cardPhrase back-compat');

// ------------------------------------------------------------------ real rounds from content.js, if available
section('lines for every round content.js makes');
(function () {
  const sc = makeSandbox(); sc.FC = {};
  let C;
  try { C = load(sc, ['rng.js', 'i18n.js', 'content.js']); } catch (e) { console.log('   (content.js not loadable yet: ' + e.message + ')'); return; }
  if (!C.Content || !C.Content.makeRound) { console.log('   (FC.Content.makeRound missing — skipped)'); return; }
  const I2 = C.I18N;
  const ages = Object.keys(C.AGE_TOPICS || { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }).map(Number);
  let probe;
  try { probe = C.Content.makeRound((C.AGE_TOPICS[4] || ['colors'])[0], { age: 4, lang: 'en', rng: new C.RNG(1), roundIndex: 0, season: 0 }); } catch (e) { probe = null; }
  if (!probe || !Array.isArray(probe.places) || !Array.isArray(probe.asks)) { console.log('   (content.js still makes rocket rounds — round checks skipped)'); return; }
  if (C.ANIMALS) eq(JSON.stringify(C.ANIMALS), JSON.stringify(ANIMALS), 'content FC.ANIMALS = DESIGN §5.1 list');
  let rounds = 0, talks = 0, lines = 0;
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 8; s++) {
    let r;
    try { r = C.Content.makeRound(topic, { age, lang, rng: new C.RNG(s * 31 + age), roundIndex: s % 4, season: s % 4, surprise: null }); }
    catch (e) { ok(false, `makeRound ${topic} age ${age} ${lang}: ${e.message}`); continue; }
    rounds++;
    for (const ask of r.asks) {
      const txt = I2.t(lang, ask.promptKey, ask.params || {});
      ok(clean(txt) && txt !== ask.promptKey && ![].concat(I2.raw(lang, 'p.any')).includes(txt), `${lang} ${ask.promptKey} ${JSON.stringify(ask.params)} renders: ${txt}`);
      const place = r.places[ask.answer];
      ok(!!place && !!place.clue, `${topic} ask has its answer place + clue`);
      if (!place || !place.clue) continue;
      const right = place.clue;
      for (const pl of r.places) ok(I2.NAME_KINDS.includes(pl.clue.nameKind), `${lang} clue nameKind ${pl.clue.nameKind} is a known kind`);
      const want = { kind: right.nameKind, value: right.nameValue };
      const ev = { topic, nameKind: right.nameKind, nameValue: right.nameValue, clue: right, animal: place.friend, promptKey: ask.promptKey, params: ask.params };
      const g = I2.sayFound(lang, ev);
      ok(clean(g) && positive(g) && !I2.raw(lang, 'found').includes(g), `${lang} ${topic} found: ${g}`);
      lines++;
      for (const pl of r.places) {
        if (pl === place) continue;
        const w = I2.sayWrong(lang, { topic, nameKind: pl.clue.nameKind, nameValue: pl.clue.nameValue, clue: pl.clue, animal: pl.friend, want,
          promptKey: ask.promptKey, params: ask.params, streak: 1 });
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

section('speech text: letters, maths; "Pip" is spoken as written');
eq(I.speech('en', 'Find the letter B!'), 'Find the letter bee!', 'en letter speech');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');
eq(I.speech('en', '7 − 2'), '7 minus 2', 'en math speech');
eq(I.speech('en', 'Find the big cow!'), 'Find the big cow!', 'en "big cow" is not a letter');
eq(I.speech('en', 'Pip’s Camp Hide & Seek'), 'Pip’s Camp Hide & Seek', 'en title unchanged');
eq(V.spoken('vi', 'Chào bé! Mình là cáo Pip.'), 'Chào bé! Mình là cáo Pip.', 'vi spoken keeps "Pip"');
eq(V.spoken('vi', 'Pip gợi ý nè: chữ B!'), 'Pip gợi ý nè: chữ bờ!', 'vi spoken: phonics only');
eq(V.spoken('en', 'Hi! I am Pip.'), 'Hi! I am Pip.', 'en spoken keeps Pip');
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(V.spoken(lang, s).indexOf('Bim') < 0, `${lang} ${k} spoken text has no Bim leftovers`);

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
  sb4.FC = {};
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

  // drag (a finger sliding off a hiding place): every move of the active finger arrives, in logical px, then up
  const dc = new El('canvas'), dcalls = [];
  const winH = {};
  const sb7 = makeSandbox({ PointerEvent: function () {}, addEventListener(t, f) { (winH[t] = winH[t] || []).push(f); },
    removeEventListener(t, f) { winH[t] = (winH[t] || []).filter(x => x !== f); } });
  sb7.FC = {};
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
  sb5.FC = {};
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
  sb6.FC = {};
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
ok(sb.FC.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into FC.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof FC.Input.attach === 'function' && typeof FC.Input.kidProof === 'function' && typeof FC.Input.holdButton === 'function',
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
  sbx.FC = {};
  env.FC = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.FC.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Pip: rate 0.9, pitch 1.2');
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
  // "Pip" is spoken as written in both languages; the bubble text (onStart, log) is the same
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là cáo Pip. Pip giúp bé nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là cáo Pip. Pip giúp bé nhé!', 'vi utterance says "Pip"');
  eq(startText, 'Mình là cáo Pip. Pip giúp bé nhé!', 'onStart gets the display text');
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
  E3.FC.__dummy = 0;
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
