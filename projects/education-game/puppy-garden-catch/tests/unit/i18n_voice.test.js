#!/usr/bin/env node
// Puppy Garden Catch — unit tests for i18n.js, voice.js and input.js.
// Run from projects/education-game/puppy-garden-catch:   node tests/unit/i18n_voice.test.js
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
  return sb.PG;
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
sb.PG = { debug: { voiceLog: [] } };
let PG;
try { PG = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = PG.I18N, V = PG.Voice;

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const UI = ['title', 'subtitle', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings', 'holdForParents', 'age',
  'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'voice', 'mic', 'done', 'stars', 'chapter', 'allDone',
  'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening', 'skip', 'langName.en', 'langName.vi'];
const SOUNDS = ['cow', 'duck', 'sheep', 'cat', 'hen', 'frog', 'bird', 'owl', 'pig'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat([0, 1, 2, 3].map(k => 'chapter.' + k))
  .concat(TOPICS.map(k => 'p.' + k)).concat(['p.animalsSound', 'p.generic'])
  .concat(SOUNDS.map(k => 'sound.' + k))
  .concat(['color', 'shape', 'size', 'animal', 'letter', 'word', 'number', 'sum', 'parity', 'count'].map(k => 'say.correct.' + k))
  .concat(['say.countDone'])
  .concat(['color', 'shape', 'size', 'fruit', 'animal', 'animalSound', 'letter', 'word', 'number', 'sum', 'parity'].map(k => 'say.wrong.' + k))
  .concat(['praise', 'great', 'wrong', 'miss', 'hint', 'idle', 'talk.intro', 'talk.right', 'talk.wrong', 'session.done'])
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}
eq(I.TOPICS.join(','), TOPICS.join(','), 'I18N.TOPICS');
eq(I.t('en', 'ui.title'), 'Puppy Garden Catch', 'en title');
eq(I.t('vi', 'ui.title'), 'Cún Con Hứng Quà', 'vi title');
eq(I.t('en', 'ui.voice'), "Pip's voice", 'en voice label');
eq(I.t('vi', 'ui.voice'), 'Giọng Cún Pip', 'vi voice label');
for (const lang of I.langs) ok(!/\bBo\b|Dino|Khủng|trứng|egg|nest|tổ\b/i.test(I.keys(lang).map(k => [].concat(I.raw(lang, k)).join(' ')).join(' ')),
  `${lang}: no leftover sister-game words (Bo, egg, nest…)`);

section('Vietnamese diacritics sanity');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'hung qua', 'qua bong', 'mau do', 'Cun Pip'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
eq(I.name('vi', 'fruit', 'carrot'), 'củ cà rốt', 'carrot uses classifier "củ"');
eq(I.name('vi', 'fruit', 'cherry'), 'quả anh đào', 'cherry');
eq(I.name('vi', 'fruit', 'pear'), 'quả lê', 'pear');
eq(I.name('vi', 'animal', 'pig'), 'con heo', 'pig');
eq(I.name('vi', 'animal', 'snail'), 'con ốc sên', 'snail');
eq(I.name('vi', 'animal', 'ladybug'), 'con bọ rùa', 'ladybug');

section('no negative words for mistakes');
for (const k of ['wrong', 'miss', 'hint', 'idle', 'talk.wrong', 'talk.wrong.the', 'talk.wrong.letter'].concat(
  I.keys('en').filter(k => /^say\.wrong\./.test(k)))) {
  const all = [].concat(I.raw('en', k)).join(' ').toLowerCase();
  ok(!/\b(no|wrong|bad|not|fail|failed|incorrect|lose|lost)\b/.test(all), `en ${k} has no negative words`);
  const vi = [].concat(I.raw('vi', k)).join(' ').toLowerCase();
  ok(vi.indexOf('sai') < 0 && !/(^|\s)(dở|tệ|thua|hỏng)(\s|$|[!.,?])/u.test(vi), `vi ${k} has no negative words`);
}

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, fruit: 'pear', stars: 7, child: 'Mai', answer: 'X', name: 'Y', target: 'Z', color: 'red', shape: 'star',
  size: 'big', animal: 'duck', sound: 'duck', soundWord: 'duck', letter: 'B', lower: 'b', sum: '2+3', diff: '7−2',
  parity: 'odd', nameParity: 'even', word: 'apple', count: 'two' };
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
      ok(!/\s[!?.,]/.test(s) && !/\s{2}/.test(s), `${lang} ${k}[${i}] tidy spacing: ${s}`);
    }
  }
}
eq(I.t('xx', 'ui.play'), 'Play', 'unknown language falls back to English');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key returns the key');

section('prompts with RAW round params (world round event)');
const P = (lang, key, params) => I.t(lang, key, Object.assign({ child: '' }, params));
const PROMPTS = [
  ['p.colors', { color: 'red' }, 'Catch the red ball!', 'Bé ơi, hứng quả bóng màu đỏ nhé!'],
  ['p.colors', { color: 'orange' }, 'Catch the orange ball!', 'Bé ơi, hứng quả bóng màu cam nhé!'],
  ['p.colors', { color: 'blue' }, 'Catch the blue ball!', 'Bé ơi, hứng quả bóng màu xanh dương nhé!'],
  ['p.shapes', { shape: 'star' }, 'Catch the star!', 'Bé ơi, hứng ngôi sao nhé!'],
  ['p.shapes', { shape: 'circle' }, 'Catch the circle!', 'Bé ơi, hứng hình tròn nhé!'],
  ['p.size', { size: 'big' }, 'Catch the big ball!', 'Bé ơi, hứng quả bóng to nhé!'],
  ['p.size', { size: 'small' }, 'Catch the small ball!', 'Bé ơi, hứng quả bóng nhỏ nhé!'],
  ['p.count', { n: 3, fruit: 'pear' }, 'Catch 3 pears!', 'Hứng 3 quả lê nào!'],
  ['p.count', { n: 1, fruit: 'cherry' }, 'Catch 1 cherry!', 'Hứng 1 quả anh đào nào!'],
  ['p.count', { n: 4, fruit: 'cherry' }, 'Catch 4 cherries!', 'Hứng 4 quả anh đào nào!'],
  ['p.count', { n: 5, fruit: 'carrot' }, 'Catch 5 carrots!', 'Hứng 5 củ cà rốt nào!'],
  ['p.count', { n: 2, fruit: 'strawberry' }, 'Catch 2 strawberries!', 'Hứng 2 quả dâu nào!'],
  ['p.animals', { animal: 'duck' }, 'Quack quack! Catch the duck!', 'Cạp cạp! Bé hứng con vịt nhé!'],
  ['p.animals', { animal: 'cow' }, 'Moo moo! Catch the cow!', 'Ụm bò! Bé hứng con bò nhé!'],
  ['p.animals', { animal: 'fish' }, 'Catch the fish!', 'Bé hứng con cá nhé!'],
  ['p.animalsSound', { animal: 'cow' }, 'Moo moo! Who says that? Catch it!', 'Ụm bò! Con gì kêu thế? Bé hứng nhé!'],
  ['p.animalsSound', { sound: 'pig' }, 'Oink oink! Who says that? Catch it!', 'Ụt ịt! Con gì kêu thế? Bé hứng nhé!'],
  ['p.animalsSound', { animal: 'snail' }, 'Catch the snail!', 'Bé hứng con ốc sên nhé!'],
  ['p.letters', { letter: 'B' }, 'Catch the letter B!', 'Bé ơi, hứng chữ B nhé!'],
  ['p.lower', { letter: 'B' }, 'Big B, small b! Catch small b!', 'Bé ơi, hứng chữ b thường của chữ B nhé!'],
  ['p.initial', { letter: 'C' }, 'What starts with the letter C? Catch it!', 'Cái gì bắt đầu bằng chữ C? Bé hứng nhé!'],
  ['p.add', { sum: '2+3' }, 'What is 2 + 3? Catch the answer!', '2 + 3 bằng mấy? Bé hứng đáp số nhé!'],
  ['p.sub', { diff: '7−2' }, 'What is 7 − 2? Catch the answer!', '7 − 2 bằng mấy? Bé hứng đáp số nhé!'],
  ['p.sub', { diff: '7-2' }, 'What is 7 − 2? Catch the answer!', '7 − 2 bằng mấy? Bé hứng đáp số nhé!'],
  ['p.oddeven', { parity: 'odd' }, 'Catch an odd number!', 'Bé ơi, hứng số lẻ nhé!'],
  ['p.oddeven', { parity: 'even' }, 'Catch an even number!', 'Bé ơi, hứng số chẵn nhé!'],
  ['p.colors', { color: { kind: 'color', value: 'green' } }, 'Catch the green ball!', 'Bé ơi, hứng quả bóng màu xanh lá nhé!'],
  ['p.count', { n: { kind: 'number', value: 3 }, fruit: { kind: 'fruit', value: 'apple' } }, 'Catch three apples!', 'Hứng ba quả táo nào!'],   // {kind,value} objects are always named
  // missing params → a complete generic sentence, never "Catch the ball!" with a hole
  ['p.colors', {}, 'Watch the bubbles and catch!', 'Bé ơi, hứng quà nào!'],
  ['p.count', { n: 3 }, 'Watch the bubbles and catch!', 'Bé ơi, hứng quà nào!']
];
for (const [key, params, en, vi] of PROMPTS) {
  eq(P('en', key, params), en, `en ${key} ${JSON.stringify(params)}`);
  eq(P('vi', key, params), vi, `vi ${key} ${JSON.stringify(params)}`);
}
eq(I.speech('en', P('en', 'p.letters', { letter: 'B' })), 'Catch the letter bee!', 'en letter prompt spoken');
eq(I.speech('en', P('en', 'p.lower', { letter: 'A' })), 'Big ay, small ay! Catch small ay!', 'en lower prompt spoken');
eq(I.speech('vi', P('vi', 'p.letters', { letter: 'B' })), 'Bé ơi, hứng chữ bờ nhé!', 'vi letter prompt spoken (phonics)');
eq(I.speech('vi', P('vi', 'p.lower', { letter: 'K' })), 'Bé ơi, hứng chữ ca thường của chữ ca nhé!', 'vi lower prompt spoken');
eq(I.speech('vi', P('vi', 'p.add', { sum: '2+3' })), '2 cộng 3 bằng mấy? Bé hứng đáp số nhé!', 'vi sum spoken');
eq(I.speech('en', P('en', 'p.sub', { diff: '7−2' })), 'What is 7 minus 2? Catch the answer!', 'en diff spoken');
eq(I.speech('vi', 'Bé chạm chữ cái nhé'), 'Bé chạm chữ cái nhé', 'vi "chữ cái" untouched');
eq(I.speech('en', 'Catch a big ball'), 'Catch a big ball', 'en "big ball" untouched');

section('talk prompts');
const TALKS = [
  ['talk.colors', {}, 'What color is this ball?', 'Quả bóng này màu gì nhỉ?'],
  ['talk.animals', { sound: 'cow' }, 'Who says moo moo?', 'Con gì kêu ụm bò nhỉ?'],
  ['talk.animals', { animal: 'duck' }, 'Who says quack quack?', 'Con gì kêu cạp cạp nhỉ?'],
  ['talk.animals', {}, 'Which animal is this?', 'Đây là con gì nào?'],
  ['talk.add', { sum: '4+1' }, 'What is 4 + 1?', '4 + 1 bằng mấy nhỉ?'],
  ['talk.add', {}, 'What is the answer?', 'Kết quả là bao nhiêu nào?'],
  ['talk.sub', { diff: '9−3' }, 'What is 9 − 3?', '9 − 3 bằng mấy nhỉ?'],
  ['talk.size', {}, 'Is this ball big or small?', 'Quả bóng này to hay nhỏ?']
];
for (const [key, params, en, vi] of TALKS) {
  eq(P('en', key, params), en, `en ${key} ${JSON.stringify(params)}`);
  eq(P('vi', key, params), vi, `vi ${key} ${JSON.stringify(params)}`);
}
for (const lang of I.langs) for (const t of TOPICS) {
  const s = P(lang, 'talk.' + t, {});
  ok(s.indexOf('{') < 0 && s.split(' ').length >= 3, `${lang} talk.${t} with no params is a full sentence: ${s}`);
}

section('ui strings');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Pip. Woof! Let’s play!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Pip. Woof! Let’s play!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Cún Pip đây. Gâu gâu! Mình cùng chơi nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Cún Pip đây. Gâu gâu! Mình cùng chơi nhé!', 'vi welcome with name');
eq(I.t('vi', 'session.done', { stars: 9, child: '' }, () => 0), 'Bé làm xong hết rồi! 9 ngôi sao! Hoan hô!', 'vi session done');
eq(I.t('vi', 'idle', { child: 'Mai' }, () => 0.75), 'Bé Mai ơi, mình chơi tiếp nhé!', 'vi idle with a name');
I.setChild('An');
ok(I.t('en', 'ui.welcome').indexOf('An') > 0, 'setChild is the default {child}');
I.setChild('');
for (const a of SOUNDS) for (const lang of I.langs) ok(/!$/.test(I.sound(lang, a)), `${lang} sound ${a}: ${I.sound(lang, a)}`);
eq(I.sound('vi', 'cow'), 'Ụm bò!', 'vi cow sound');
eq(I.sound('en', 'fish'), '', 'silent animal has no sound');

section('names for every kind/value used by the content');
const VALUES = {
  color: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'cream'],
  shape: ['circle', 'square', 'triangle', 'star', 'heart', 'rectangle'],
  size: ['big', 'small'],
  animal: ['fish', 'frog', 'duck', 'bird', 'owl', 'squirrel', 'rabbit', 'cow', 'sheep', 'bat', 'bear', 'hen', 'cat', 'pig',
    'snail', 'ladybug'],
  fruit: ['apple', 'banana', 'strawberry', 'orange', 'pear', 'cherry', 'carrot'],
  parity: ['odd', 'even'],
  number: Array.from({ length: 21 }, (_, i) => i)
};
const LETTERS = new Set(('ABCDEFGHKLMNOPRSTUW' + 'ABCDEGHKLMNOPSTUVXY' + 'IĂÂĐÊÔƠƯ').split(''));
VALUES.letter = Array.from(LETTERS).concat(Array.from(LETTERS).map(c => c.toLowerCase()));
VALUES.sum = []; VALUES.diff = [];
for (let a = 0; a <= 20; a++) for (let b = 0; a + b <= 20; b++) VALUES.sum.push(a + '+' + b);
for (let a = 0; a <= 20; a++) for (let b = 0; b <= a; b++) VALUES.diff.push(a + '−' + b);
for (const lang of I.langs) {
  for (const kind of Object.keys(VALUES)) for (const v of VALUES[kind]) {
    const n = I.name(lang, kind, v);
    ok(typeof n === 'string' && n.length > 0, `${lang} name ${kind} ${v}`);
    if (['color', 'shape', 'animal', 'fruit', 'parity', 'size'].includes(kind) && lang === 'vi')
      ok(n !== v || ['to'].includes(n), `vi name ${kind} ${v} is translated (${n})`);
    if (['animal', 'fruit'].includes(kind) && lang === 'vi')
      ok(/^(con|quả|củ) /.test(n), `vi ${kind} ${v} has a classifier (${n})`);
    if (kind === 'sum' || kind === 'diff') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
    const w = I.words(lang, kind, v);
    ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${v}`);
    ok(w.every(x => x === x.toLowerCase()), `${lang} words ${kind} ${v} are lower-case`);
  }
  for (const f of VALUES.fruit) {
    const pl = I.plural(lang, 'fruit', f);
    ok(pl && (lang === 'vi' || pl !== f), `${lang} plural fruit ${f} (${pl})`);
  }
  for (const a of VALUES.animal) ok(I.plural(lang, 'animal', a).length > 0, `${lang} plural animal ${a}`);
  for (const e of sb.PG.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 0, `${lang} words for word ${e.word}`);
  }
}
eq(I.plural('en', 'fruit', 'cherry'), 'cherries', 'cherries');
eq(I.plural('en', 'fruit', 'carrot'), 'carrots', 'carrots');
eq(I.plural('en', 'animal', 'sheep'), 'sheep', 'sheep plural');
eq(I.plural('en', 'animal', 'ladybug'), 'ladybugs', 'ladybugs');
eq(I.name('en', 'color', 'cream'), 'white', 'cream ball is "white"');
eq(I.name('vi', 'color', 'red'), 'màu đỏ', 'vi red');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('vi', 'number', 20), 'hai mươi', 'vi 20');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('vi', 'letter', 'Đ'), 'đờ', 'vi letter Đ');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('vi', 'word', 'táo'), 'táo', 'vi word');
eq(I.name('en', 'word', 'animal_pig'), 'pig', 'word by sprite id');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'number', 3).includes('3'), 'words include digits');
ok(I.words('vi', 'word', 'heo').includes('lợn'), 'vi word heo also accepts lợn');

section('sayCorrect');
const r0 = () => 0, r1 = () => 0.99;
const SC = [
  [{ nameKind: 'color', nameValue: 'red', target: { kind: 'color', value: 'red' } }, 'Yes! The red ball!', 'Đúng rồi! Quả bóng màu đỏ!'],
  [{ nameKind: 'shape', nameValue: 'star', target: { kind: 'shape', value: 'star' } }, 'Yes! The star!', 'Đúng rồi! Ngôi sao!'],
  [{ nameKind: 'size', nameValue: 'big', target: { kind: 'size', value: 'big' } }, 'Yes! The big ball!', 'Đúng rồi! Quả bóng to!'],
  [{ nameKind: 'animal', nameValue: 'duck', target: { kind: 'animal', value: 'duck' } }, 'Yes! The duck! Quack quack!', 'Đúng rồi! Con vịt đây! Cạp cạp!'],
  [{ nameKind: 'animal', nameValue: 'fish', target: { kind: 'animal', value: 'fish' } }, 'Yes! The fish!', 'Đúng rồi! Con cá đây!'],
  [{ nameKind: 'fruit', nameValue: 'pear', target: { kind: 'fruit', value: 'pear' }, count: 2, need: 3 }, 'Two!', 'Hai!'],
  [{ nameKind: 'fruit', nameValue: 'pear', target: { kind: 'fruit', value: 'pear' }, count: 3, need: 3 }, 'Yes! 3 pears!', 'Đúng rồi! 3 quả lê!'],
  [{ nameKind: 'fruit', nameValue: 'carrot', target: { kind: 'fruit', value: 'carrot' }, count: 1, need: 1 }, 'Yes! 1 carrot!', 'Đúng rồi! 1 củ cà rốt!'],
  [{ nameKind: 'letter', nameValue: 'B', target: { kind: 'letter', value: 'B' } }, 'Yes! The letter B!', 'Đúng rồi! Chữ B!'],
  [{ nameKind: 'letter', nameValue: 'b', target: { kind: 'letter', value: 'b' } }, 'Yes! The letter b!', 'Đúng rồi! Chữ b!'],
  [{ nameKind: 'word', nameValue: 'apple', target: { kind: 'letter', value: 'A' } }, 'Apple starts with the letter A!', null],
  [{ nameKind: 'word', nameValue: 'táo', target: { kind: 'letter', value: 'T' } }, null, 'Táo bắt đầu bằng chữ T!'],
  [{ nameKind: 'number', nameValue: 5, target: { kind: 'number', value: 5 } }, 'Yes! 5!', 'Đúng rồi! Số 5!'],
  [{ nameKind: 'number', nameValue: 5, target: { kind: 'number', value: 5 }, sum: '2+3' }, 'Yes! 2 + 3 = 5!', 'Đúng rồi! 2 + 3 = 5!'],
  [{ nameKind: 'number', nameValue: 7, target: { kind: 'parity', value: 'odd' } }, 'Yes! 7 is odd!', 'Đúng rồi! 7 là số lẻ!'],
  [{}, 'Yes!', 'Đúng rồi!']
];
for (const [ev, en, vi] of SC) {
  if (en) eq(I.sayCorrect('en', ev, r0), en, `en sayCorrect ${JSON.stringify(ev)}`);
  if (vi) eq(I.sayCorrect('vi', ev, r0), vi, `vi sayCorrect ${JSON.stringify(ev)}`);
  for (const lang of I.langs) for (const r of [r0, r1]) {
    const s = I.sayCorrect(lang, ev, r);
    ok(s && s.indexOf('{') < 0 && s.split(' ').length <= 12, `${lang} sayCorrect renders: ${s}`);
  }
}
eq(I.speech('en', I.sayCorrect('en', SC[13][0], r0)), 'Yes! 2 plus 3 equals 5!', 'en sum correct spoken');
eq(I.speech('vi', I.sayCorrect('vi', SC[11][0], r0)), 'Táo bắt đầu bằng chữ tờ!', 'vi word correct spoken (phonics)');
eq(I.sayCorrect('en', { nameKind: 'color', nameValue: 'red', label: { type: 'color', value: 'red' } }, r0), 'Yes! The red ball!',
  'legacy {label:{type,value}} still works');

section('sayWrong');
const SW = [
  [{ nameKind: 'color', nameValue: 'blue', target: { kind: 'color', value: 'red' } },
    'That’s a blue ball. Let’s find red!', 'Đó là quả bóng màu xanh dương. Mình tìm màu đỏ nhé!'],
  [{ nameKind: 'color', nameValue: 'orange', target: { kind: 'color', value: 'red' } },
    'That’s an orange ball. Let’s find red!', 'Đó là quả bóng màu cam. Mình tìm màu đỏ nhé!'],
  [{ nameKind: 'shape', nameValue: 'square', target: { kind: 'shape', value: 'star' } },
    'That’s a square. Let’s find the star!', 'Đó là hình vuông. Mình tìm ngôi sao nhé!'],
  [{ nameKind: 'size', nameValue: 'small', target: { kind: 'size', value: 'big' } },
    'That one is small. Let’s find a big one!', 'Quả này nhỏ. Mình tìm quả bóng to nhé!'],
  [{ nameKind: 'fruit', nameValue: 'banana', target: { kind: 'fruit', value: 'pear' } },
    'That’s a banana. Let’s catch pears!', 'Đó là quả chuối. Mình hứng quả lê nhé!'],
  [{ nameKind: 'fruit', nameValue: 'apple', target: { kind: 'fruit', value: 'carrot' } },
    'That’s an apple. Let’s catch carrots!', 'Đó là quả táo. Mình hứng củ cà rốt nhé!'],
  [{ nameKind: 'animal', nameValue: 'cat', target: { kind: 'animal', value: 'duck' } },
    'That’s the cat. Let’s find the duck!', 'Đó là con mèo. Mình tìm con vịt nhé!'],
  [{ nameKind: 'animal', nameValue: 'cat', target: { kind: 'animal', value: 'cow' }, bySound: true },
    'That’s the cat. Who says moo moo?', 'Đó là con mèo. Con gì kêu ụm bò nhỉ?'],
  [{ nameKind: 'letter', nameValue: 'C', target: { kind: 'letter', value: 'B' } },
    'That’s the letter C. Let’s find the letter B!', 'Đó là chữ C. Mình tìm chữ B nhé!'],
  [{ nameKind: 'word', nameValue: 'owl', target: { kind: 'letter', value: 'B' } },
    'That’s an owl. What starts with the letter B?', null],
  [{ nameKind: 'word', nameValue: 'gấu', target: { kind: 'letter', value: 'T' } },
    null, 'Đó là con gấu. Cái gì bắt đầu bằng chữ T?'],
  [{ nameKind: 'number', nameValue: 4, target: { kind: 'number', value: 5 } },
    'That’s 4. Let’s look again!', 'Đó là số 4. Mình xem lại nhé!'],
  [{ nameKind: 'number', nameValue: 4, target: { kind: 'number', value: 5 }, params: { sum: '2+3' } },
    'That’s 4. What is 2 + 3?', 'Đó là số 4. 2 + 3 bằng mấy nhỉ?'],
  [{ nameKind: 'number', nameValue: 4, target: { kind: 'parity', value: 'odd' } },
    '4 is even. Let’s find an odd number!', '4 là số chẵn. Mình tìm số lẻ nhé!']
];
for (const [ev, en, vi] of SW) {
  if (en) eq(I.sayWrong('en', ev, r0), en, `en sayWrong ${JSON.stringify(ev)}`);
  if (vi) eq(I.sayWrong('vi', ev, r0), vi, `vi sayWrong ${JSON.stringify(ev)}`);
  for (const lang of I.langs) {
    const s = I.sayWrong(lang, ev, r0);
    ok(s.indexOf('{') < 0 && s.split(' ').length <= 12, `${lang} sayWrong renders: ${s}`);
    ok(!/\b(no|wrong|not|bad|incorrect)\b/i.test(s) && s.indexOf('sai') < 0, `${lang} sayWrong is kind: ${s}`);
  }
}
ok(I.raw('en', 'wrong').indexOf(I.sayWrong('en', {}, r0)) >= 0, 'sayWrong without data → generic wrong line');
ok(I.sayWrong('en', SW[7][0], r0).indexOf('cow') < 0, 'bySound never names the target animal');

section('talkWrong / speech');
eq(I.talkWrong('en', 'animal', 'cow'), 'It is the cow! Good try!', 'en talkWrong animal');
eq(I.talkWrong('vi', { kind: 'color', value: 'blue' }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', 'number', 4), 'It is four! Good try!', 'en talkWrong number');
eq(I.talkWrong('en', 'letter', 'B'), 'It is the letter B! Good try!', 'en talkWrong letter');
eq(I.speech('en', I.talkWrong('en', 'letter', 'B')), 'It is the letter bee! Good try!', 'en talkWrong letter spoken');
eq(I.talkWrong('vi', 'parity', 'even'), 'Là số chẵn đó! Bé cố gắng lắm!', 'vi talkWrong parity');
eq(I.talkWrong('en', 'parity', 'odd'), 'It is odd! Good try!', 'en talkWrong parity');
eq(I.talkWrong('vi', 'word', 'gấu'), 'Là con gấu đó! Bé cố gắng lắm!', 'vi talkWrong word → picture name');
eq(I.speech('en', 'That is the letter B!'), 'That is the letter bee!', 'en letter speech');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');
eq(I.speech('vi', 'Chữ Ê đây rồi!'), 'Chữ ê đây rồi!', 'vi Ê speech');

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
eq(V.match(['con heo'], ch('vi', 'animal', ['pig', 'cow', 'duck'])), 'pig', 'vi pig');
eq(V.match(['con lợn'], ch('vi', 'animal', ['pig', 'cow', 'duck'])), 'pig', 'vi pig (northern "lợn")');
eq(V.match(['bo rua'], ch('vi', 'animal', ['ladybug', 'snail', 'frog'])), 'ladybug', 'vi ladybug without diacritics');
eq(V.match(['ốc sên'], ch('vi', 'animal', ['ladybug', 'snail', 'frog'])), 'snail', 'vi snail');
eq(V.match(['ladybird'], ch('en', 'animal', ['ladybug', 'snail'])), 'ladybug', 'en ladybird → ladybug');
eq(V.match(['cherries'], ch('en', 'fruit', ['cherry', 'pear', 'carrot'])), 'cherry', 'en cherries');
eq(V.match(['củ cà rốt'], ch('vi', 'fruit', ['cherry', 'pear', 'carrot'])), 'carrot', 'vi carrot');
eq(V.match(['quả lê'], ch('vi', 'fruit', ['cherry', 'pear', 'carrot'])), 'pear', 'vi pear');
eq(V.match(['anh dao'], ch('vi', 'fruit', ['cherry', 'pear', 'carrot'])), 'cherry', 'vi cherry stripped');
eq(V.match(['mười lăm'], ch('vi', 'number', [5, 15, 10])), '15', '"mười lăm" → 15, not 5/10');
eq(V.match(['muoi lam'], ch('vi', 'number', [5, 15, 10])), '15', '"muoi lam" → 15');
eq(V.match(['15'], ch('vi', 'number', [5, 15, 10])), '15', 'digits "15"');
eq(V.match(['bảy'], ch('vi', 'number', [6, 7, 8])), '7', '"bảy" → 7');
eq(V.match(['bay'], ch('vi', 'number', [6, 7, 8])), '7', '"bay" → 7 (no diacritics)');
eq(V.match(['tám'], ch('vi', 'number', [6, 7, 8])), '8', '"tám" → 8');
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

// ------------------------------------------------------------------ input (fake DOM)
section('input: attach calls handlers with (x, y, ev) in logical px');
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
  sb4.PG = {};
  const IN = load(sb4, ['input.js']).Input;
  const calls = [];
  const detach = IN.attach(canvas, {
    toLogical: (cx, cy) => ({ x: cx / 2, y: cy / 2 }),
    down: function (x, y, ev) { calls.push(['down', x, y, typeof ev]); },
    move: function (x, y) { calls.push(['move', x, y]); },
    up: function (x, y) { calls.push(['up', x, y]); },
    cancel: function () { calls.push(['cancel']); }
  });
  const pe = (id, x, y, extra) => Object.assign({ pointerId: id, clientX: x, clientY: y, target: canvas, pointerType: 'touch',
    isPrimary: true, button: 0, cancelable: true, preventDefault() {} }, extra || {});
  canvas.emit('pointerdown', pe(1, 100, 60));
  canvas.emit('pointerdown', pe(2, 300, 300, { isPrimary: false }));   // a second finger is ignored
  canvas.emit('pointermove', pe(2, 310, 300));
  canvas.emit('pointermove', pe(1, 140, 60));
  canvas.emit('pointerup', pe(1, 150, 64));
  eq(JSON.stringify(calls), JSON.stringify([['down', 50, 30, 'object'], ['move', 70, 30], ['up', 75, 32]]),
    'one pointer, numbers in logical px');
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
  detach();
  canvas.emit('pointerdown', pe(7, 10, 10));
  eq(calls.length, 0, 'detach removes listeners');
  const calls2 = [];
  IN.attach(canvas, { toLogical: () => ({ x: NaN, y: 1 }), down: (x, y) => calls2.push([x, y]), cancel: () => calls2.push('c') });
  canvas.emit('pointerdown', pe(8, 10, 10));
  eq(calls2.length, 0, 'non-finite points are dropped');
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
ok(sb.PG.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into PG.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof PG.Input.attach === 'function' && typeof PG.Input.kidProof === 'function' && typeof PG.Input.holdButton === 'function',
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
  const audioSession = { type: 'auto' };
  const sb2 = makeSandbox({ speechSynthesis: synth, SpeechSynthesisUtterance: Utt, webkitSpeechRecognition: Rec });
  sb2.navigator = { userAgent: 'node-test', platform: 'Linux', maxTouchPoints: 0, audioSession };
  sb2.PG = {};
  const D2 = load(sb2, ['i18n.js', 'voice.js']);
  const V2 = D2.Voice;
  let vcCalls = 0;
  const offVc = V2.onVoicesChanged(() => vcCalls++);
  V2.init({ lang: 'en' });
  ok(vcCalls >= 1, 'onVoicesChanged fires when the list loads');
  ok(typeof offVc === 'function', 'onVoicesChanged returns off()');
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
    ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'rate 0.9 pitch 1.2 (puppy)');
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
    eq(audioSession.type, 'play-and-record', 'audio session switched for the mic');
    const alt = (t) => ({ transcript: t, confidence: 0.9 });
    const result = (isFinal, ...ts) => { const r = ts.map(alt); r.isFinal = isFinal; return r; };
    recInst.onresult({ resultIndex: 0, results: [result(true, 'mầu đổ', 'màu đỏ')] });
    return pr.then(r => {
      eq(r.id, 'r', 'listen resolves on a final match');
      eq(audioSession.type, 'auto', 'audio session restored after listening');
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
    sb3.PG = {};
    const V3 = load(sb3, ['i18n.js', 'voice.js']).Voice;
    const pr = V3.listen({ lang: 'en', choices: colEn, timeoutMs: 40 });
    return pr.then(r => eq(r.reason, 'timeout', 'listen times out'));
  }));
})();

Promise.all(asyncTests).then(() => {
  console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, (e) => { console.log('FAIL  async error: ' + (e && e.stack)); process.exit(1); });
