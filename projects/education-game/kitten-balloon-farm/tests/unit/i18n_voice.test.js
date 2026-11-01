#!/usr/bin/env node
// Kitten's Balloon Farm — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/kitten-balloon-farm:   node tests/unit/i18n_voice.test.js
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
  return sb.KB;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
const NEG_EN = /\b(no|not|wrong|bad|fail|failed|incorrect|oh no|mistake)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|dở|tệ|hỏng|không đúng|chưa đúng|trật)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !NEG_VI.test(s.toLowerCase()); }

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.KB = { debug: { voiceLog: [] } };
let KB;
try { KB = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = KB.I18N, V = KB.Voice;

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'horse', 'goat', 'chick', 'bunny', 'puppy'];   // DESIGN §5.1
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'voice', 'mic', 'done', 'stars',
  'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening', 'tapMiu',
  'years', 'skip', 'langName.en', 'langName.vi'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(TOPICS.map(k => 'p.' + k))
  .concat(['p.animalsNext', 'p.animalsAll', 'p.colors.one', 'p.shapes.one', 'p.size.one', 'p.countAny'])
  .concat(['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity', 'word', 'sound', 'sum'].map(k => 'say.correct.' + k))
  .concat(['color', 'shape', 'size', 'animal', 'letter', 'number', 'some'].map(k => 'say.wrong.' + k))
  .concat(['say.pop', 'say.countDone'])
  .concat(['praise', 'great', 'wrong', 'miss', 'hint', 'idle', 'talk.intro', 'talk.right', 'talk.wrong', 'session.done'])
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
// every fallback target exists
for (const k of Object.keys(I.PARAMS)) for (const lang of I.langs) ok(I.has(lang, k), `PARAMS key ${k} exists in ${lang}`);
// keys the game code asks for at run time
(function () {
  const src = ['main.js', 'ui.js', 'render.js'].map(f => { try { return fs.readFileSync(path.join(JS, f), 'utf8'); } catch (e) { return ''; } }).join('\n')
    + (function () { try { return fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8'); } catch (e) { return ''; } })();
  const used = new Set();
  src.replace(/['"`]((?:ui|talk|session|say|weather|topic|p)\.[A-Za-z.]+[A-Za-z])['"`]/g, (m, k) => { used.add(k); return m; });
  for (const k of used) for (const lang of I.langs) ok(I.has(lang, k), `key used by the game code exists: ${lang} ${k}`);
})();
const ALL_TEXT = I.langs.map(l => I.keys(l).map(x => [].concat(I.raw(l, x)).join(' ')).join(' ')).join(' ');
for (const k of ['Lumi', 'owl', 'seed', 'pot', 'flower', 'plant', 'hạt giống', 'chậu', 'bông hoa', 'trồng', 'Bắc Cực', 'penguin', 'garden'])
  ok(ALL_TEXT.toLowerCase().indexOf(k.toLowerCase()) < 0, `no leftover Owl wording "${k}"`);

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right', 'say.pop']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}
for (const lang of I.langs) for (const k of ['great', 'idle', 'talk.right']) {
  const v = I.raw(lang, k);
  ok(v.some(s => s.includes('{child}')) && v.some(s => !s.includes('{child}')), `${lang} ${k} has name + no-name variants`);
}

section('Vietnamese wording sanity');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'qua bong', 'mau do', 'Miu day', 'con bo'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
ok(/Bé ơi/.test(viAll) && /nhé!/.test(viAll) && /nào!/.test(viAll) && /giỏi quá!/.test(viAll), 'vi uses "Bé ơi", "nhé!", "nào!", "giỏi quá!"');
ok(/quả bóng/.test(viAll) && /bấm vào/.test(viAll), 'vi uses quả bóng / bấm vào');
eq(I.t('vi', 'ui.title'), 'Bóng Bay Nông Trại Mèo Con', 'vi title');
eq(I.t('en', 'ui.title'), 'Kitten’s Balloon Farm', 'en title');
eq(I.t('en', 'ui.logo1') + ' ' + I.t('en', 'ui.logo2'), 'Kitten’s Balloon Farm', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Bóng Bay / Nông Trại Mèo Con', 'vi logo lines');
eq(I.t('en', 'ui.voice'), 'Miu’s voice', 'ui.voice names Miu');
eq(I.t('vi', 'ui.voice'), 'Giọng của Miu', 'vi ui.voice');
eq(I.t('vi', 'ui.listening'), 'Miu đang nghe…', 'vi listening');

section('no negative words for mistakes');
for (const k of ['wrong', 'miss', 'hint', 'say.wrong.color', 'say.wrong.shape', 'say.wrong.size', 'say.wrong.animal',
  'say.wrong.letter', 'say.wrong.number', 'say.wrong.some', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.size',
  'talk.wrong.animal', 'talk.wrong.animalSound', 'talk.wrong.letter', 'talk.wrong.parity', 'talk.wrong.number']) {
  for (const lang of I.langs) ok(positive([].concat(I.raw(lang, k)).join(' ')), `${lang} ${k} has no negative words`);
}

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, k: 2, stars: 7, child: 'Mai', answer: 'X', name: 'pig', target: 'cow', animal: 'pig', color: 'red',
  shape: 'star', size: 'big', sound: 'cow', letter: 'B', text: 'B', word: 'pig', a: 2, b: 3, parity: 'odd', call: 'Moo!',
  tletter: 'C', expr: '2 + 3' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let i = 0; i < raw.length; i++) {
    for (const child of ['Mai', '']) {
      const rng = { next: () => (i + 0.5) / raw.length };
      for (const params of [Object.assign({}, FULL, { child }), { child }]) {
        const s = I.t(lang, k, params, rng);
        ok(s.indexOf('{') < 0 && s.indexOf('}') < 0, `${lang} ${k}[${i}] child=${JSON.stringify(child)} fully replaced: ${s}`);
        ok(s.length > 0 && !/undefined|null|NaN/.test(s), `${lang} ${k} non-empty, no undefined: ${s}`);
        ok(!/\s[!?.,]/.test(s) && !/^[!?.,]/.test(s), `${lang} ${k} no dangling punctuation: ${s}`);
        if (!child && k !== 'ui.namePlaceholder') ok(s.indexOf('Mai') < 0, `${lang} ${k} without a name does not use one`);
        if (!/^ui\./.test(k)) {
          const words = s.split(/\s+/).filter(Boolean).length;
          ok(words <= 12, `${lang} ${k}[${i}] ≤ 12 words (${words}): ${s}`);
        }
      }
    }
  }
}
eq(I.t('xx', 'ui.play'), 'Play', 'unknown language falls back to English');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key returns the key');

section('prompts with RAW round params (as content.js makes them)');
eq(I.t('en', 'p.colors', { color: 'red', n: 1 }), 'Pop the red balloon!', 'en colors singular (n)');
eq(I.t('en', 'p.colors', { color: 'red', k: 1 }), 'Pop the red balloon!', 'en colors singular (k)');
eq(I.t('en', 'p.colors', { color: 'red', n: 3 }), 'Pop the red balloons!', 'en colors plural');
eq(I.t('en', 'p.colors', { color: 'red', k: 2, n: 1 }), 'Pop the red balloons!', 'k wins over n');
eq(I.t('en', 'p.colors', { color: 'pink', n: 2 }), 'Pop the pink balloons!', 'en pink');
eq(I.t('vi', 'p.colors', { color: 'red', n: 1 }), 'Bé ơi, bấm vào quả bóng màu đỏ nhé!', 'vi colors singular');
eq(I.t('vi', 'p.colors', { color: 'red', n: 2 }), 'Bé ơi, bấm vào tất cả quả bóng màu đỏ nhé!', 'vi colors plural');
eq(I.t('en', 'p.colors', {}), 'Pop the balloons with the colour on the sign!', 'colors without colour → generic');
eq(I.t('en', 'p.shapes', { shape: 'heart', n: 1 }), 'Pop the heart balloon!', 'en shapes heart');
eq(I.t('en', 'p.shapes', { shape: 'rect', n: 2 }), 'Pop the rectangle balloons!', 'en shapes rect');
eq(I.t('vi', 'p.shapes', { shape: 'star', n: 1 }), 'Bé ơi, bấm vào quả bóng hình ngôi sao nhé!', 'vi shapes star');
eq(I.t('en', 'p.size', { size: 'big', n: 1, color: 'red' }), 'Pop the big balloon!', 'en size');
eq(I.t('vi', 'p.size', { size: 'small', n: 2 }), 'Bé ơi, bấm vào tất cả quả bóng nhỏ nhé!', 'vi size plural');
eq(I.t('en', 'p.count', { n: 3, color: 'red' }), 'Pop 3 balloons! Let’s count!', 'en count plural');
eq(I.t('en', 'p.count', { n: 1 }), 'Pop 1 balloon! Let’s count!', 'en count singular');
eq(I.t('vi', 'p.count', { n: 3 }), 'Bé ơi, bấm 3 quả bóng nhé! Mình cùng đếm nào!', 'vi count');
eq(I.t('en', 'p.count', {}), 'Pop the balloons and count with me!', 'count without n → generic');
eq(I.t('en', 'p.animals', { animal: 'pig' }), 'Pop the balloon with the pig!', 'en animals pig');
eq(I.t('vi', 'p.animals', { animal: 'pig' }), 'Bé ơi, bấm vào quả bóng có con lợn nhé!', 'vi animals pig');
eq(I.t('vi', 'p.animals', { animal: 'chick' }), 'Bé ơi, bấm vào quả bóng có gà con nhé!', 'vi animals chick');
eq(I.t('vi', 'p.animals', { animal: { kind: 'animal', value: 'puppy' } }), 'Bé ơi, bấm vào quả bóng có cún con nhé!', 'object param');
eq(I.t('en', 'p.animals', {}), 'Pop the balloons with the farm friends!', 'animals without animal → generic');
eq(I.t('en', 'p.animalsNext', { animal: 'duck' }, () => 0), 'Now the duck!', 'en animalsNext');
eq(I.t('vi', 'p.animalsNext', { animal: 'cow' }, () => 0), 'Giờ đến con bò nhé!', 'vi animalsNext');
eq(I.t('vi', 'p.animalsNext', { animal: 'cow' }, () => 0.6), 'Con bò đâu rồi nhỉ?', 'vi animalsNext capitalised');
eq(I.t('en', 'p.letters', { text: 'B', letter: 'B', n: 1 }), 'Pop the letter B!', 'en letters');
eq(I.t('vi', 'p.letters', { text: 'B', letter: 'B' }), 'Bé ơi, bấm vào quả bóng chữ B nhé!', 'vi letters');
eq(I.t('en', 'p.lower', { text: 'B', letter: 'B' }), 'Find the small letter b!', 'en lower');
eq(I.t('vi', 'p.lower', { text: 'B', letter: 'B' }), 'Bé tìm chữ b viết thường nhé!', 'vi lower');
eq(I.t('en', 'p.initial', { animal: 'pig', word: 'pig', text: 'P' }), 'What does pig start with? Pop it!', 'en initial');
eq(I.t('vi', 'p.initial', { animal: 'pig', word: 'lợn', text: 'L' }), 'Lợn bắt đầu bằng chữ gì? Bé bấm nhé!', 'vi initial');
eq(I.t('vi', 'p.initial', { animal: 'chick' }), 'Gà con bắt đầu bằng chữ gì? Bé bấm nhé!', 'vi initial from animal only');
eq(I.t('en', 'p.add', { a: 2, b: 3, text: '2 + 3' }), 'What is 2 + 3? Pop the answer!', 'en add');
eq(I.t('en', 'p.add', { a: 2, b: 3 }), 'What is 2 + 3? Pop the answer!', 'en add from a, b');
eq(I.t('vi', 'p.sub', { a: 7, b: 2, text: '7 − 2' }), '7 − 2 bằng mấy? Bé bấm vào đáp số nhé!', 'vi sub');
eq(I.speech('vi', I.t('vi', 'p.sub', { text: '7 − 2' })), '7 trừ 2 bằng mấy? Bé bấm vào đáp số nhé!', 'vi sub speech');
eq(I.t('en', 'p.oddeven', { parity: 'odd', n: 3 }), 'Pop the odd numbers!', 'en oddeven');
eq(I.t('en', 'p.oddeven', { parity: 'even', n: 1 }), 'Pop the even number!', 'en oddeven singular');
eq(I.t('vi', 'p.oddeven', { parity: 'even', n: 2 }), 'Bé ơi, bấm vào các số chẵn nhé!', 'vi oddeven');
eq(I.t('en', 'talk.animals', { sound: 'cow' }), 'Which animal says moo?', 'en talk animals (sound = animal id)');
eq(I.t('vi', 'talk.animals', { sound: 'pig' }), 'Con gì kêu ụt ịt nhỉ?', 'vi talk animals');
eq(I.t('en', 'talk.animals', { animal: 'duck' }), 'Which animal says quack?', 'talk animals from params.animal');
eq(I.t('en', 'talk.animals', { sound: 'woof' }), 'Which animal says woof?', 'talk animals with a sound word');
eq(I.t('en', 'talk.animals', {}), 'Tap a farm friend!', 'talk animals fallback');
eq(I.t('vi', 'talk.animals', { sound: 'goat' }), 'Bé chạm vào một bạn thú nhé!', 'vi goat has no sound → generic');
eq(I.t('en', 'talk.colors'), 'What colour is this balloon?', 'en talk colors');
eq(I.t('vi', 'talk.count'), 'Có mấy quả bóng nào?', 'vi talk count');
eq(I.t('en', 'weather.0'), 'Good morning, farm!', 'weather 0');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Miu. Let’s pop balloons!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Miu. Let’s pop balloons!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Miu đây. Mình cùng chơi bóng bay nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Miu đây. Mình cùng chơi bóng bay nhé!', 'vi welcome with name');
I.setChild('An');
ok(I.t('en', 'ui.welcome').indexOf('An') > 0, 'setChild is the default {child}');
ok(I.raw('en', 'great').map((s, i) => I.t('en', 'great', {}, () => (i + 0.5) / 7)).some(s => s.includes('An')), 'great uses the child name');
I.setChild('');
for (let i = 0; i < 7; i++) {
  const s = I.t('vi', 'great', {}, () => (i + 0.5) / 7);
  ok(s.indexOf('{') < 0 && !/bé \s|Bé !/.test(s), 'vi great without name reads well: ' + s);
}
eq(I.t('en', 'say.correct.color', { answer: { kind: 'color', value: 'orange' } }, () => 0.6), 'An orange balloon!', 'a → an');

section('names for every kind/value in §5.1');
const VALUES = {
  color: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'cream'],
  shape: ['circle', 'square', 'triangle', 'star', 'heart', 'rect'],
  size: ['big', 'small'],
  animal: ANIMALS,
  parity: ['odd', 'even'],
  balloon: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'cream', 'balloon'],
  number: Array.from({ length: 21 }, (_, i) => i)
};
const LETTERS = new Set(('ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'ĂÂĐÊÔƠƯ').split(''));
VALUES.letter = Array.from(LETTERS).concat(Array.from(LETTERS).map(c => c.toLowerCase()));
VALUES.sum = []; VALUES.diff = [];
for (let a = 1; a <= 19; a++) for (let b = 1; a + b <= 20; b++) VALUES.sum.push(a + '+' + b);
for (let a = 1; a <= 10; a++) for (let b = 1; b <= a; b++) VALUES.diff.push(a + '−' + b);
for (const lang of I.langs) {
  VALUES['sound:' + lang] = ANIMALS.filter(a => I.hasSound(lang, a));
  for (const kind0 of Object.keys(VALUES)) {
    if (/^sound:/.test(kind0) && kind0 !== 'sound:' + lang) continue;
    const kind = kind0.replace(/:.*/, '');
    for (const v of VALUES[kind0]) {
      const n = I.name(lang, kind, v);
      ok(typeof n === 'string' && n.length > 0, `${lang} name ${kind} ${v}`);
      if (['color', 'shape', 'animal', 'parity', 'balloon', 'sound'].includes(kind) && lang === 'vi')
        ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
      if (kind === 'sum' || kind === 'diff') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
      const w = I.words(lang, kind, v);
      ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${v}`);
      ok(w.every(x => x === x.toLowerCase()), `${lang} words ${kind} ${v} are lower-case`);
      if (lang === 'vi' && kind !== 'letter') ok(w.every(x => w.includes(I.stripMarks(x))), `vi words ${kind} ${v} include no-diacritic forms`);
      if (kind === 'number') ok(w.includes(String(v)), `${lang} words number ${v} include the digit`);
    }
  }
  for (const e of sb.KB.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 1, `${lang} words for word ${e.word} include the animal forms`);
  }
}
eq(I.NAME_KINDS.join(','), 'color,shape,size,animal,number,letter,parity,sum,diff,word,sound,balloon', 'NAME_KINDS (DESIGN §5.1)');
eq(sb.KB.WORDS.vi.map(w => w.word + w.initial).join(','), 'bòB,lợnL,cừuC,vịtV,dêD,gà conG', 'vi initial words (§5.1)');
eq(sb.KB.WORDS.en.map(w => w.word + w.initial).join(','), 'cowC,pigP,sheepS,duckD,horseH,goatG,chickC,bunnyB,puppyP', 'en initial words');
const EN_ANIMAL = { cow: 'cow', pig: 'pig', sheep: 'sheep', duck: 'duck', horse: 'horse', goat: 'goat', chick: 'chick',
  bunny: 'bunny', puppy: 'puppy' };
const VI_ANIMAL = { cow: 'con bò', pig: 'con lợn', sheep: 'con cừu', duck: 'con vịt', horse: 'con ngựa', goat: 'con dê',
  chick: 'gà con', bunny: 'con thỏ', puppy: 'cún con' };
for (const a of ANIMALS) { eq(I.name('en', 'animal', a), EN_ANIMAL[a], 'en animal ' + a); eq(I.name('vi', 'animal', a), VI_ANIMAL[a], 'vi animal ' + a); }
const EN_SOUND = { cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', horse: 'neigh', goat: 'maa', chick: 'cheep', puppy: 'woof' };
const VI_SOUND = { cow: 'ụm bò', pig: 'ụt ịt', sheep: 'be be', duck: 'cạp cạp', horse: 'hí hí', chick: 'chíp chíp', puppy: 'gâu gâu' };
for (const a of ANIMALS) {
  eq(I.sound('en', a), EN_SOUND[a] || '', 'en sound ' + a);
  eq(I.sound('vi', a), VI_SOUND[a] || '', 'vi sound ' + a);
}
ok(!I.hasSound('en', 'bunny') && !I.hasSound('vi', 'bunny') && !I.hasSound('vi', 'goat') && I.hasSound('en', 'goat'), 'no-sound animals');
eq(I.name('en', 'sound', 'cow'), 'moo', 'name sound cow');
eq(I.name('en', 'animal', 'animal_pig'), 'pig', 'animal from sprite id');
eq(I.name('en', 'balloon', 'red'), 'red balloon', 'en balloon red');
eq(I.name('vi', 'balloon', 'pink'), 'quả bóng màu hồng', 'vi balloon pink');
eq(I.name('vi', 'color', 'pink'), 'màu hồng', 'vi pink');
eq(I.name('vi', 'shape', 'heart'), 'hình trái tim', 'vi heart');
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'en rect');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('vi', 'number', 20), 'hai mươi', 'vi 20');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('vi', 'word', 'lợn'), 'lợn', 'vi word');
eq(I.name('en', 'word', 'animal_duck'), 'duck', 'word from sprite id');
ok(I.words('en', 'color', 'blue').includes('blew'), 'blue/blew');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'number', 3).includes('3'), 'words include digits');
ok(I.words('vi', 'animal', 'pig').includes('heo') && I.words('vi', 'animal', 'pig').includes('con lon'), 'vi pig: heo, con lon');
ok(I.words('vi', 'animal', 'chick').includes('con gà'), 'vi chick: con gà');
ok(I.words('vi', 'animal', 'puppy').includes('con chó') && I.words('vi', 'animal', 'puppy').includes('con cho'), 'vi puppy: con chó');
ok(I.words('vi', 'word', 'lợn').includes('con lợn') && I.words('vi', 'word', 'lợn').includes('heo'), 'vi word lợn accepts animal forms');

// ----- names for everything content.js actually produces (if it loads)
section('names for every balloon/prompt/talk content.js makes');
(function () {
  const sc = makeSandbox(); sc.KB = {};
  let C;
  try { C = load(sc, ['rng.js', 'i18n.js', 'content.js']); } catch (e) { console.log('   (content.js not loadable yet: ' + e.message + ')'); return; }
  if (!C.Content || !C.Content.makeRound) { console.log('   (KB.Content.makeRound missing — skipped)'); return; }
  const I2 = C.I18N;
  if (C.ANIMALS) eq(JSON.stringify(C.ANIMALS), JSON.stringify(ANIMALS), 'content KB.ANIMALS = DESIGN §5.1 list');
  const ages = Object.keys(C.AGE_TOPICS || { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }).map(Number);
  let rounds = 0, talks = 0;
  const seen = new Set();
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 12; s++) {
    let r;
    try { r = C.Content.makeRound(topic, { age, lang, rng: new C.RNG(s * 31 + age), roundIndex: s % 4 }); }
    catch (e) { ok(false, `makeRound ${topic} age ${age} ${lang}: ${e.message}`); continue; }
    if (!r || !Array.isArray(r.balloons)) { ok(false, `makeRound ${topic} returns balloons[]`); continue; }
    rounds++;
    const txt = I2.t(lang, r.promptKey, r.params || {});
    ok(txt && txt !== r.promptKey && txt.indexOf('{') < 0, `${lang} ${r.promptKey} renders with round params: ${txt}`);
    ok(!/Any$|All$/.test(Object.keys(I2.PARAMS).find(k => k === r.promptKey) || '') && txt !== I2.t(lang, r.promptKey, {}) ||
      !I2.PARAMS[r.promptKey], `${lang} ${r.promptKey} uses the specific (not the generic) wording: ${txt}`);
    if (r.mode === 'ask' && r.queue) for (const bid of r.queue) {
      const b = r.balloons.find(x => x.id === bid);
      const q = I2.t(lang, 'p.animals', { animal: b.nameValue });
      ok(q.indexOf(I2.name(lang, 'animal', b.nameValue)) >= 0, `${lang} ask prompt names ${b.nameValue}`);
    }
    for (const b of r.balloons) {
      const k = b.nameKind + ':' + b.nameValue + ':' + lang + ':' + (r.mode === 'count');
      if (seen.has(k)) continue; seen.add(k);
      ok(I2.NAME_KINDS.includes(b.nameKind), `${lang} balloon nameKind ${b.nameKind} is a known kind`);
      const nm = I2.name(lang, b.nameKind, b.nameValue);
      ok(nm && nm !== 'undefined' && nm !== 'null', `${lang} ${k} named (${nm})`);
      if (lang === 'vi' && ['color', 'animal', 'shape', 'balloon'].includes(b.nameKind)) ok(nm !== String(b.nameValue), `vi ${k} translated (${nm})`);
      const ev = { id: b.id, nameKind: b.nameKind, nameValue: b.nameValue, sprite: b.sprite, mode: r.mode, n: 1, need: 3 };
      const sc1 = I2.sayCorrect(lang, ev);
      ok(sc1 && sc1.indexOf('{') < 0 && !/undefined|null/.test(sc1) && positive(sc1), `${lang} sayCorrect ${k}: ${sc1}`);
      const other = r.balloons.find(x => x.nameValue !== b.nameValue && x.nameKind === b.nameKind) || b;
      const sw = I2.sayWrong(lang, { id: b.id, nameKind: b.nameKind, nameValue: b.nameValue, sprite: b.sprite,
        targetNameKind: other.nameKind, targetNameValue: other.nameValue });
      ok(sw && sw.indexOf('{') < 0 && !/undefined|null/.test(sw) && positive(sw), `${lang} sayWrong ${k}: ${sw}`);
    }
  }
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 12; s++) {
    let tk;
    try { tk = C.Content.makeTalk(topic, { age, lang, rng: new C.RNG(s * 17 + age) }); }
    catch (e) { ok(false, `makeTalk ${topic}: ${e.message}`); continue; }
    talks++;
    const q = I2.t(lang, tk.promptKey, tk.params || {});
    ok(q && q !== tk.promptKey && q.indexOf('{') < 0, `${lang} ${tk.promptKey} renders: ${q}`);
    if (topic === 'animals') {
      const ans = tk.choices.find(c => c.id === tk.answerId);
      ok(I2.hasSound(lang, ans.value) && q.indexOf(I2.sound(lang, ans.value)) >= 0, `${lang} talk.animals asks the answer's sound: ${q}`);
    }
    for (const c of tk.choices) {
      ok(I2.words(lang, c.kind, c.value).length > 0, `${lang} words for talk choice ${c.kind}:${c.value}`);
      const tw = I2.talkWrong(lang, c.kind, c.value);
      ok(tw.indexOf('{') < 0 && !/undefined/.test(tw) && positive(tw), `${lang} talkWrong ${c.kind}:${c.value}: ${tw}`);
    }
    const ans = tk.choices.find(c => c.id === tk.answerId);
    const said = I2.name(lang, ans.kind, ans.value);
    eq(V.match([said], tk.choices.map(c => ({ id: c.id, words: I2.words(lang, c.kind, c.value) }))),
      tk.answerId, `${lang} ${topic} talk: saying "${said}" picks the answer`);
  }
  ok(rounds > 100 && talks > 100, `enumerated ${rounds} rounds, ${talks} talks from content.js`);
})();

section('sayCorrect / sayWrong / sayCount / talkWrong / speech');
const r0 = () => 0;
eq(I.sayCorrect('en', { nameKind: 'color', nameValue: 'red' }, r0), 'Red!', 'en color');
eq(I.sayCorrect('vi', { nameKind: 'color', nameValue: 'red' }, r0), 'Màu đỏ!', 'vi color');
eq(I.sayCorrect('en', { nameKind: 'shape', nameValue: 'heart' }, r0), 'A heart!', 'en heart');
eq(I.sayCorrect('en', { nameKind: 'shape', nameValue: 'star' }, r0), 'A star!', 'en star');
eq(I.sayCorrect('vi', { nameKind: 'shape', nameValue: 'heart' }, r0), 'Hình trái tim!', 'vi heart');
eq(I.sayCorrect('en', { nameKind: 'size', nameValue: 'big' }, r0), 'Big!', 'en size');
eq(I.sayCorrect('vi', { nameKind: 'size', nameValue: 'small' }, r0), 'Quả bóng nhỏ!', 'vi size');
eq(I.sayCorrect('en', { nameKind: 'animal', nameValue: 'pig', sprite: 'animal_pig' }, r0), 'The pig! Oink oink!', 'en pig');
eq(I.sayCorrect('vi', { nameKind: 'animal', nameValue: 'pig', sprite: 'animal_pig' }, r0), 'Con lợn đây rồi! Ụt ịt!', 'vi pig');
eq(I.sayCorrect('en', { nameKind: 'balloon', nameValue: 'red', sprite: 'animal_cow' }, r0), 'The cow! Moo!', 'animal read from the sprite');
eq(I.sayCorrect('en', { nameKind: 'animal', nameValue: 'bunny' }, r0), 'The bunny!', 'en bunny (no sound)');
eq(I.sayCorrect('vi', { nameKind: 'animal', nameValue: 'goat' }, r0), 'Con dê đây rồi!', 'vi goat (no sound)');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 7 }, r0), 'Seven!', 'en number');
eq(I.sayCorrect('vi', { nameKind: 'number', nameValue: 7 }, r0), 'Số bảy!', 'vi number');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 5, expr: '2 + 3' }, r0), 'Yes! Two plus three is five!', 'en sum');
eq(I.sayCorrect('vi', { nameKind: 'number', nameValue: 5, expr: '7 − 2' }, r0), 'Đúng rồi! Bảy trừ hai bằng năm!', 'vi diff');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 7, parity: 'odd' }, r0), 'Yes! Seven is odd!', 'en parity');
eq(I.sayCorrect('en', { nameKind: 'letter', nameValue: 'B' }, r0), 'The letter B!', 'en letter');
eq(I.speech('en', I.sayCorrect('en', { nameKind: 'letter', nameValue: 'B' }, r0)), 'The letter bee!', 'en letter speech');
eq(I.sayCorrect('vi', { nameKind: 'letter', nameValue: 'B' }, r0), 'Chữ B!', 'vi letter');
eq(I.speech('vi', 'Chữ B!'), 'Chữ bờ!', 'vi letter speech');
eq(I.sayCorrect('en', { nameKind: 'letter', nameValue: 'P', word: 'pig' }, r0), 'Pig starts with the letter P!', 'en initial');
eq(I.sayCorrect('vi', { nameKind: 'letter', nameValue: 'L', word: 'lợn' }, r0), 'Lợn bắt đầu bằng chữ L!', 'vi initial');
eq(I.sayCorrect('en', { nameKind: 'balloon', nameValue: 'red', mode: 'count', n: 2, need: 3 }, r0), 'Two!', 'count mode < need');
eq(I.sayCorrect('en', { nameKind: 'balloon', nameValue: 'red', mode: 'count', n: 3, need: 3 }, r0), 'Three! Three balloons!', 'count mode = need');
ok(I.raw('en', 'say.pop').includes(I.sayCorrect('en', { nameKind: 'balloon', nameValue: 'red' }, r0)), 'plain balloon → say.pop');
eq(I.sayCount('en', 1, 3), 'One!', 'en count 1');
eq(I.sayCount('en', 3, 3), 'Three! Three balloons!', 'en count done');
eq(I.sayCount('vi', 1, 4), 'Một!', 'vi count 1');
eq(I.sayCount('vi', 3, 3), 'Ba! Ba quả bóng!', 'vi count done');
eq(I.sayCount('en', 1, 1), 'One! One balloon!', 'en count done singular');
eq(I.sayCount('vi', 12, 12), 'Mười hai! Mười hai quả bóng!', 'vi count 12');
for (const lang of I.langs) for (let need = 1; need <= 12; need++) for (let n = 1; n <= need; n++) {
  const s = I.sayCount(lang, n, need);
  ok(s && s.indexOf('{') < 0 && positive(s), `${lang} sayCount ${n}/${need}: ${s}`);
}
ok(I.raw('en', 'say.pop').includes(I.sayPop('en', r0)) && I.sayBloom === I.sayPop, 'sayPop (+ sayBloom alias)');
eq(I.sayWrong('en', { nameKind: 'color', nameValue: 'blue', targetNameKind: 'color', targetNameValue: 'red' }, r0),
  'That’s the blue one. Where is the red one?', 'en sayWrong colour');
eq(I.sayWrong('vi', { nameKind: 'color', nameValue: 'blue', targetNameKind: 'color', targetNameValue: 'red' }, r0),
  'Quả này màu xanh dương. Quả bóng màu đỏ đâu nhỉ?', 'vi sayWrong colour');
eq(I.sayWrong('en', { nameKind: 'shape', nameValue: 'circle', targetNameKind: 'shape', targetNameValue: 'heart' }, r0),
  'That’s a circle. Where is the heart?', 'en sayWrong shape');
eq(I.sayWrong('vi', { nameKind: 'shape', nameValue: 'circle', targetNameKind: 'shape', targetNameValue: 'heart' }, r0),
  'Đây là hình tròn. Còn hình trái tim đâu nhỉ?', 'vi sayWrong shape');
eq(I.sayWrong('en', { nameKind: 'animal', nameValue: 'cow', targetNameKind: 'animal', targetNameValue: 'pig' }, r0),
  'That’s the cow. Where is the pig?', 'en sayWrong animal');
eq(I.sayWrong('vi', { nameKind: 'animal', nameValue: 'cow', targetNameKind: 'animal', targetNameValue: 'pig' }, r0),
  'Đây là con bò. Con lợn đâu nhỉ?', 'vi sayWrong animal');
eq(I.sayWrong('en', { nameKind: 'size', nameValue: 'small', targetNameKind: 'size', targetNameValue: 'big' }, r0),
  'That one is small. Where is the big one?', 'en sayWrong size');
eq(I.sayWrong('en', { nameKind: 'letter', nameValue: 'C', targetNameKind: 'letter', targetNameValue: 'B' }, r0),
  'That’s the letter C. Where is B?', 'en sayWrong letter');
eq(I.sayWrong('vi', { nameKind: 'letter', nameValue: 'C', targetNameKind: 'letter', targetNameValue: 'B' }, r0),
  'Đây là chữ C. Chữ B đâu nhỉ?', 'vi sayWrong letter');
eq(I.sayWrong('en', { nameKind: 'number', nameValue: 4, targetNameKind: 'number', targetNameValue: 5 }, r0),
  'That one is four. Let’s try again!', 'number never reveals the answer');
eq(I.sayWrong('en', { nameKind: 'color', nameValue: 'blue' }, r0), 'That one is blue. Let’s look again!', 'no target → some');
ok(I.raw('en', 'wrong').includes(I.sayWrong('en', {}, r0)), 'empty event → wrong[]');
for (const lang of I.langs) for (const kind of ['color', 'shape', 'size', 'animal', 'number', 'letter']) {
  const vals = { color: VALUES.color, shape: VALUES.shape, size: VALUES.size, animal: ANIMALS, number: [0, 3, 9, 20],
    letter: ['A', 'B', 'Ê'] }[kind];
  for (const a of vals) for (const b of vals) for (let i = 0; i < 2; i++) {
    const s = I.sayWrong(lang, { nameKind: kind, nameValue: a, targetNameKind: kind, targetNameValue: b }, () => i * 0.6);
    ok(s && s.indexOf('{') < 0 && !/undefined/.test(s) && positive(s), `${lang} sayWrong ${kind} ${a}/${b}: ${s}`);
    const c = I.sayCorrect(lang, { nameKind: kind, nameValue: a }, () => i * 0.6);
    ok(c && c.indexOf('{') < 0 && !/undefined/.test(c) && positive(c), `${lang} sayCorrect ${kind} ${a}: ${c}`);
  }
}
eq(I.talkWrong('en', 'animal', 'cow'), 'The cow says moo! Good try!', 'en talkWrong animal');
eq(I.talkWrong('vi', 'animal', 'duck'), 'Con vịt kêu cạp cạp đó! Bé cố gắng lắm!', 'vi talkWrong animal');
eq(I.talkWrong('en', 'animal', 'bunny'), 'It is the bunny! Good try!', 'en talkWrong bunny');
eq(I.talkWrong('en', 'shape', 'circle'), 'It is a circle! Good try!', 'en talkWrong shape');
eq(I.talkWrong('vi', { kind: 'color', value: 'blue' }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', 'number', 4), 'It is four! Good try!', 'en talkWrong number');
eq(I.talkWrong('vi', 'number', 4), 'Là số bốn đó! Bé cố gắng lắm!', 'vi talkWrong number');
eq(I.talkWrong('en', 'letter', 'B'), 'It is the letter B! Good try!', 'en talkWrong letter');
for (const lang of I.langs) for (const kind of Object.keys(VALUES)) {
  if (/:/.test(kind)) continue;
  for (const v of VALUES[kind].slice(0, 12)) {
    const s = I.talkWrong(lang, kind, v);
    ok(s && s.indexOf('{') < 0 && !/undefined/.test(s) && positive(s), `${lang} talkWrong ${kind} ${v}: ${s}`);
  }
}
eq(I.speech('en', 'That is the letter B!'), 'That is the letter bee!', 'en letter speech');
eq(I.speech('en', 'Baa baa!'), 'Bah bah!', 'en baa speech');
eq(I.speech('vi', 'Bé ơi, bấm vào quả bóng chữ B nhé!'), 'Bé ơi, bấm vào quả bóng chữ bờ nhé!', 'vi letter speech in a prompt');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');

// ------------------------------------------------------------------ matcher
section('matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
const colVi = ch('vi', 'color', ['red', 'blue', 'green', 'pink']);
eq(V.match(['red'], colEn), 'red', '"red"');
eq(V.match(["it's blue"], colEn), 'blue', '"it\'s blue"');
eq(V.match(['greene'], colEn), 'green', 'fuzzy "greene"');
eq(V.match(['pink'], colEn), 'pink', '"pink"');
eq(V.match(['màu đỏ'], colVi), 'red', '"màu đỏ"');
eq(V.match(['mau do'], colVi), 'red', '"mau do"');
eq(V.match(['màu hồng'], colVi), 'pink', '"màu hồng"');
eq(V.match(['mau hong'], colVi), 'pink', '"mau hong"');
eq(V.match(['xanh'], colVi), null, '"xanh" alone is ambiguous');
eq(V.match(['banana', 'hello'], colEn), null, 'unrelated words → null');
eq(V.match('blue', colEn), 'blue', 'accepts a single string');
const numVi = ch('vi', 'number', [3, 5, 12]);
const numEn = ch('en', 'number', [3, 5, 12]);
eq(V.match(['ba'], numVi), '3', '"ba" → 3');
eq(V.match(['three'], numEn), '3', '"three" → 3');
eq(V.match(['3'], numVi), '3', '"3" → 3');
eq(V.match(['mười hai'], numVi), '12', '"mười hai" → 12');
eq(V.match(['muoi hai'], numVi), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], numEn), '5', '"I think five"');
eq(V.match(['to'], ch('en', 'number', [2, 4])), '2', 'solo "to" → 2');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
for (let n = 0; n <= 20; n++) {
  const set = ch('en', 'number', [n, (n + 1) % 21, (n + 2) % 21]), setV = ch('vi', 'number', [n, (n + 1) % 21, (n + 2) % 21]);
  eq(V.match([I.name('en', 'number', n)], set), String(n), `en number word ${n}`);
  eq(V.match([String(n)], set), String(n), `en digit ${n}`);
  if (n > 0) eq(V.match([I.name('vi', 'number', n)], setV), String(n), `vi number word ${n}`);
  if (n > 0) eq(V.match([I.stripMarks(I.name('vi', 'number', n))], setV), String(n), `vi number no diacritics ${n}`);
}

// farm animals: every one of the 9 is distinguishable by its own name (EN + VI, with/without diacritics, classifiers)
const animEn = ch('en', 'animal', ANIMALS), animVi = ch('vi', 'animal', ANIMALS);
for (const a of ANIMALS) {
  const en = I.name('en', 'animal', a), vi = I.name('vi', 'animal', a);
  eq(V.match([en], animEn), a, `en "${en}" → ${a}`);
  eq(V.match(['the ' + en + '!'], animEn), a, `en "the ${en}!" → ${a}`);
  eq(V.match([vi], animVi), a, `vi "${vi}" → ${a}`);
  eq(V.match([I.stripMarks(vi).toLowerCase()], animVi), a, `vi no-diacritics "${I.stripMarks(vi)}" → ${a}`);
  const bare = vi.replace(/^con /, '').replace(/ con$/, '');
  eq(V.match([bare], animVi), a, `vi bare "${bare}" → ${a}`);
  eq(V.match(['là ' + vi + ' đó'], animVi), a, `vi "là ${vi} đó" → ${a}`);
}
for (const [said, want] of [['heo', 'pig'], ['con heo', 'pig'], ['con gà', 'chick'], ['con chó', 'puppy'], ['chó', 'puppy'],
  ['con cho', 'puppy'], ['con ga', 'chick'], ['cún', 'puppy'], ['lợn', 'pig'], ['bò', 'cow'], ['con bo', 'cow'],
  ['con thỏ', 'bunny'], ['ngựa', 'horse'], ['con de', 'goat'], ['vit', 'duck'], ['cừu', 'sheep']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['doggy', 'puppy'], ['dog', 'puppy'], ['rabbit', 'bunny'], ['chicken', 'chick'], ['lamb', 'sheep'],
  ['piggy', 'pig'], ['pony', 'horse'], ['ducky', 'duck'], ['a cow', 'cow'], ['billy goat', 'goat']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['hello'], animEn), null, 'en unrelated → null');
// sounds
const sndEn = ch('en', 'sound', ['cow', 'pig', 'duck', 'puppy']), sndVi = ch('vi', 'sound', ['cow', 'pig', 'duck', 'puppy']);
eq(V.match(['moo'], sndEn), 'cow', 'en "moo"'); eq(V.match(['woof woof'], sndEn), 'puppy', 'en "woof woof"');
eq(V.match(['ụm bò'], sndVi), 'cow', 'vi "ụm bò"'); eq(V.match(['gau gau'], sndVi), 'puppy', 'vi "gau gau"');
eq(V.match(['cạp cạp'], sndVi), 'duck', 'vi "cạp cạp"'); eq(V.match(['ut it'], sndVi), 'pig', 'vi "ut it"');

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
eq(V.match(['to lắm'], ch('vi', 'size', ['big', 'small'])), 'big', 'vi big');
eq(V.match(['hình tam giác'], ch('vi', 'shape', ['circle', 'triangle', 'star'])), 'triangle', 'vi triangle');
eq(V.match(['trái tim'], ch('vi', 'shape', ['circle', 'heart', 'star'])), 'heart', 'vi heart');
eq(V.match(['hinh ngoi sao'], ch('vi', 'shape', ['circle', 'heart', 'star'])), 'star', 'vi star no diacritics');
eq(V.match(['a heart'], ch('en', 'shape', ['circle', 'heart', 'rect'])), 'heart', 'en heart');
eq(V.match(['rectangle'], ch('en', 'shape', ['circle', 'heart', 'rect'])), 'rect', 'en rect');
eq(V.match(['pig'], [{ id: 'p', kind: 'animal', value: 'pig' }, { id: 'c', kind: 'animal', value: 'cow' }], 'en'), 'p', '{id,kind,value} choices');
eq(V.match(['con heo'], [{ id: 'p', kind: 'animal', value: 'pig' }, { id: 'c', kind: 'animal', value: 'cow' }], 'vi'), 'p', '{id,kind,value} vi');
eq(V.match(['red'], []), null, 'no choices → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('input: tap-to-pop, (x, y, ev) in logical px, one pointer');
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
  sb4.KB = {};
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
  ok(downSync, 'down fires synchronously inside pointerdown (instant pop)');
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

  // touch fallback (no PointerEvent)
  const sb5 = makeSandbox({ addEventListener() {}, removeEventListener() {} });
  sb5.KB = {};
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
  sb6.KB = {};
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
ok(sb.KB.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into KB.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof KB.Input.attach === 'function' && typeof KB.Input.kidProof === 'function' && typeof KB.Input.holdButton === 'function',
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
  sbx.KB = {};
  env.KB = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.KB.Voice;
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
  ok(Math.abs(cur.rate - 0.92) < 1e-9 && Math.abs(cur.pitch - 1.25) < 1e-9, 'Miu: rate 0.92, pitch 1.25');
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
  V2.say('Pop the letter B!'); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Pop the letter bee!', 'speech() applied to the utterance');
  ok(V2.log.some(e => e.text === 'Pop the letter B!'), 'log keeps the display text');
  E.end(); await wait(10);
  // sayKey
  const sk = V2.sayKey('p.animals', { animal: 'pig' }, { lang: 'vi' });
  eq(sk.text, 'Bé ơi, bấm vào quả bóng có con lợn nhé!', 'sayKey renders the vi prompt');
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
  E3.KB.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['cow', 'pig', 'duck']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the pig')] });
  eq((await pr2).id, 'pig', 'interim match resolves after a short wait');
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
