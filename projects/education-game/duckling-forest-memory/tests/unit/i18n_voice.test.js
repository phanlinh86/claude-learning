#!/usr/bin/env node
// Dee's Forest Memory — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/duckling-forest-memory:   node tests/unit/i18n_voice.test.js
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
  return sb.DM;
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
const nWords = (s) => String(s).split(/\s+/).filter(Boolean).length;
function clean(s) {
  return typeof s === 'string' && s.trim().length > 0 && s.indexOf('{') < 0 && s.indexOf('}') < 0 &&
    !/undefined|null|NaN|\[object/.test(s) && !/\s[!?.,]/.test(s) && !/^[!?.,]/.test(s);
}

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.DM = { debug: { voiceLog: [] } };
let DM;
try { DM = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = DM.I18N, V = DM.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js'])
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(JS, f), 'utf8')), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const ANIMALS = ['fox', 'deer', 'hedgehog', 'squirrel', 'bunny', 'frog', 'bear', 'owl', 'mouse'];   // DESIGN §5.1
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapDee', 'years', 'skip', 'langName.en', 'langName.vi'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(TOPICS.map(k => 'p.' + k)).concat(['p.any'])
  .concat(['peek', 'hide', 'praise', 'great', 'wrong', 'miss', 'hint', 'idle', 'talk.intro', 'talk.right', 'talk.wrong',
    'talk.animalsAny', 'session.done', 'say.countDone', 'mismatch.two', 'match.any'])
  .concat(['color', 'shape', 'shapeColor', 'animal', 'number', 'letter', 'capital', 'small', 'expr', 'word'].map(k => 'flip.' + k))
  .concat(['color', 'shape', 'animal', 'size', 'count', 'number', 'oddeven', 'letter', 'lower', 'initial', 'math'].map(k => 'match.' + k))
  .concat(['butterfly', 'lantern', 'acorns', 'animal', 'star'].map(k => 'reward.' + k))
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
for (const k of Object.keys(I.PARAMS)) for (const lang of I.langs) ok(I.has(lang, k), `PARAMS key ${k} exists in ${lang}`);
// keys the game code asks for at run time (files still copied from Kitten's Balloon Farm are skipped until rewired)
(function () {
  const files = ['main.js', 'ui.js', 'render.js', '../index.html'];
  const used = new Set();
  for (const f of files) {
    let src = '';
    try { src = fs.readFileSync(path.join(JS, f), 'utf8'); } catch (e) { continue; }
    if (/Balloon Farm|Miu/.test(src.slice(0, 600))) { console.log(`   (${f} is still the Kitten copy — key check skipped)`); continue; }
    src.replace(/['"`]((?:ui|talk|session|weather|topic|p|peek|hide|flip|match|mismatch|reward)(?:\.[A-Za-z0-9.]*[A-Za-z0-9])?)['"`]/g,
      (m, k) => { if (/\./.test(k) || ['peek', 'hide'].includes(k)) used.add(k); return m; });
  }
  for (const k of used) for (const lang of I.langs) ok(I.has(lang, k), `key used by the game code exists: ${lang} ${k}`);
})();
const ALL_TEXT = I.langs.map(l => I.keys(l).map(x => [].concat(I.raw(l, x)).join(' ')).join(' ')).join(' ');
for (const k of ['Miu', 'kitten', 'balloon', 'farm', 'pop', 'Bụp', 'bóng', 'nông trại', 'mèo', 'oink', 'moo', 'Lumi', 'garden'])
  ok(ALL_TEXT.toLowerCase().indexOf(k.toLowerCase()) < 0, `no leftover Kitten/Owl wording "${k}"`);

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right', 'peek', 'hide', 'match.any']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}
for (const lang of I.langs) for (const k of ['great', 'idle', 'talk.right', 'peek']) {
  const v = I.raw(lang, k);
  ok(v.some(s => s.includes('{child}')) && v.some(s => !s.includes('{child}')), `${lang} ${k} has name + no-name variants`);
}

section('Vietnamese wording sanity, titles');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'hat de', 'mau do', 'con cao', 'the giong'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
ok(/Bé ơi/.test(viAll) && /nhé!/.test(viAll) && /nào!/.test(viAll) && /giỏi quá!/.test(viAll), 'vi uses "Bé ơi", "nhé!", "nào!", "giỏi quá!"');
ok(/thẻ/.test(viAll) && /hạt dẻ/.test(viAll) && /cặp/.test(viAll), 'vi uses thẻ / hạt dẻ / cặp');
ok(!/Dee đây|Dee đi\b/.test(viAll), 'vi never says "Dee đây" / "Dee đi" (spoken "Đi đây" means "leaving now")');
eq(I.t('en', 'ui.title'), 'Dee’s Forest Memory', 'en title');
eq(I.t('vi', 'ui.title'), 'Vịt Dee Lật Thẻ Rừng Xanh', 'vi title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Dee’s / Forest Memory', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Vịt Dee / Lật Thẻ Rừng Xanh', 'vi logo lines');
eq(I.t('en', 'ui.voice'), 'Dee’s voice', 'en ui.voice');
eq(I.t('vi', 'ui.voice'), 'Giọng của Dee', 'vi ui.voice');
eq(I.t('en', 'ui.volume'), 'Volume', 'en ui.volume');
eq(I.t('vi', 'ui.volume'), 'Âm lượng', 'vi ui.volume');
eq(I.t('vi', 'ui.listening'), 'Dee đang nghe…', 'vi listening');
eq(I.t('en', 'weather.0'), 'Spring is here! Look, blossoms!', 'weather 0 spring');
eq(I.t('en', 'weather.3'), 'Snowy winter! Brrr, so cold!', 'weather 3 winter');
eq(I.t('vi', 'weather.1'), 'Chào mùa hè! Nắng ấm quá!', 'vi weather 1 summer');

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  ok(positive([].concat(I.raw(lang, k)).join(' ')), `${lang} ${k} has no negative words`);
}

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, stars: 7, child: 'Mai', answer: 'X', name: 'red', animal: 'fox', color: 'red', shape: 'star',
  size: 'big', letter: 'B', lower: 'b', text: 'B', word: 'fox', a: 2, b: 3, parity: 'odd', expr: '2 + 3', num: 'three',
  acorns: 'acorns', plural: 'foxes', beast: 'fox', A: 'a fox', B: 'an owl' };
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
        if (!/^ui\./.test(k)) ok(nWords(s) <= 12, `${lang} ${k}[${i}] ≤ 12 words (${nWords(s)}): ${s}`);
      }
    }
  }
}
eq(I.t('xx', 'ui.play'), 'Play', 'unknown language falls back to English');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key returns the key');
eq(I.t('en', 'p.nosuchtopic'), 'Find two cards that match!', 'unknown prompt → p.any');
eq(I.t('vi', 'p.nosuchtopic'), 'Bé ơi, tìm hai thẻ giống nhau nhé!', 'vi unknown prompt → p.any');
ok(clean(I.t('en', null)) || I.t('en', null) === '', 't with a null key does not throw');

section('prompts, peek/hide, talk');
eq(I.t('en', 'p.colors'), 'Find the colour pairs!', 'en p.colors');
eq(I.t('en', 'p.count', { n: 3 }), 'Match each number with its acorns!', 'en p.count ignores params');
eq(I.t('en', 'p.animals', {}), 'Find two of each animal!', 'en p.animals');
eq(I.t('vi', 'p.colors'), 'Bé ơi, tìm hai thẻ cùng màu nhé!', 'vi p.colors');
eq(I.t('vi', 'p.animals', { animal: 'fox' }), 'Bé ơi, tìm hai bạn thú giống nhau nhé!', 'vi p.animals');
for (const lang of I.langs) for (const t of TOPICS) for (const params of [undefined, null, {}, { n: 4 }, { color: 'red', shape: 'x' }, 'junk', 7]) {
  const s = I.t(lang, 'p.' + t, params);
  ok(clean(s) && s !== 'p.' + t && nWords(s) <= 12, `${lang} p.${t} renders with params ${JSON.stringify(params)}: ${s}`);
}
eq(I.t('en', 'peek', {}, () => 0), 'Look carefully!', 'en peek[0]');
eq(I.t('vi', 'peek', {}, () => 0), 'Bé nhìn kỹ nhé!', 'vi peek[0]');
eq(I.t('en', 'hide', {}, () => 0), 'Now they hide!', 'en hide[0]');
eq(I.t('en', 'talk.animals', { animal: 'fox' }), 'Where is the fox?', 'en talk.animals');
eq(I.t('vi', 'talk.animals', { animal: 'fox' }), 'Con cáo đâu rồi nhỉ?', 'vi talk.animals');
eq(I.t('vi', 'talk.animals', { animal: { kind: 'animal', value: 'owl' } }), 'Con cú đâu rồi nhỉ?', 'vi talk.animals object param');
eq(I.t('en', 'talk.animals', { sound: 'deer' }), 'Where is the deer?', 'talk.animals from a Kitten-style {sound: id}');
eq(I.t('en', 'talk.animals', { animal: 'animal_mouse' }), 'Where is the mouse?', 'talk.animals from a sprite id');
eq(I.t('en', 'talk.animals', {}), 'Which animal is this?', 'talk.animals fallback');
eq(I.t('vi', 'talk.animals'), 'Đây là con gì nhỉ?', 'vi talk.animals fallback');
for (const lang of I.langs) for (const a of ANIMALS) {
  const s = I.t(lang, 'talk.animals', { animal: a });
  ok(s.indexOf(I.name(lang, 'animal', a)) >= 0 || s.indexOf(I.name(lang, 'animal', a).replace(/^c/, 'C')) >= 0, `${lang} talk.animals names ${a}: ${s}`);
}
eq(I.t('en', 'talk.count'), 'How many acorns?', 'en talk count');
eq(I.t('vi', 'talk.count'), 'Có mấy hạt dẻ nào?', 'vi talk count');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Dee. Let’s find the pairs!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Dee. Let’s find the pairs!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Mình là vịt Dee. Mình cùng lật thẻ nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Mình là vịt Dee. Mình cùng lật thẻ nhé!', 'vi welcome with name');
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

section('names for every kind/value');
const VALUES = {
  color: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'],
  shape: ['circle', 'square', 'triangle', 'star', 'heart', 'rect'],
  size: ['big', 'small'],
  animal: ANIMALS,
  parity: ['odd', 'even'],
  number: Array.from({ length: 21 }, (_, i) => i),
  dots: Array.from({ length: 12 }, (_, i) => i + 1),
  text: ['2 + 3', '7 − 2', '5', 'B', 'fox'],
  word: [].concat(ANIMALS.map(a => 'animal_' + a))
};
const LETTERS = new Set(('ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'ĂÂĐÊÔƠƯ').split(''));
VALUES.letter = Array.from(LETTERS).concat(Array.from(LETTERS).map(c => c.toLowerCase()));
VALUES.sum = []; VALUES.diff = [];
for (let a = 1; a <= 19; a++) for (let b = 1; a + b <= 20; b++) VALUES.sum.push(a + '+' + b);
for (let a = 1; a <= 10; a++) for (let b = 0; b <= a; b++) VALUES.diff.push(a + '−' + b);
eq(I.NAME_KINDS.join(','), 'color,shape,size,animal,number,dots,letter,text,sum,diff,parity,word', 'NAME_KINDS');
for (const k of I.NAME_KINDS) ok(VALUES[k], `test covers name kind ${k}`);
for (const lang of I.langs) {
  for (const kind of Object.keys(VALUES)) {
    for (const v of VALUES[kind]) {
      const n = I.name(lang, kind, v);
      ok(typeof n === 'string' && n.length > 0 && !/undefined|null/.test(n), `${lang} name ${kind} ${v}`);
      if (['color', 'shape', 'animal', 'parity', 'size'].includes(kind) && lang === 'vi')
        ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
      if (kind === 'sum' || kind === 'diff' || kind === 'dots') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
      const w = I.words(lang, kind, v);
      ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${v}`);
      ok(w.every(x => typeof x === 'string' && x === x.toLowerCase()), `${lang} words ${kind} ${v} are lower-case`);
      if (lang === 'vi' && kind !== 'letter' && !(kind === 'text' && /^\p{L}$/u.test(v))) ok(w.every(x => w.includes(I.stripMarks(x).toLowerCase())), `vi words ${kind} ${v} include no-diacritic forms`);
      if (kind === 'number' || kind === 'dots') ok(w.includes(String(v)), `${lang} words ${kind} ${v} include the digit`);
    }
  }
  for (const e of sb.DM.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 1, `${lang} words for word ${e.word} include the animal forms`);
    const first = e.word.normalize('NFD').replace(/[\u0300\u0301\u0303\u0309\u0323]/g, '').normalize('NFC').charAt(0).toUpperCase();
    ok(first === e.initial, `${lang} word ${e.word} starts with ${e.initial} (tone marks ignored)`);
  }
}
eq(sb.DM.WORDS.vi.map(w => w.word + w.initial).join(','), 'cáoC,hươuH,sócS,ếchÊ,gấuG,cúC', 'vi initial words (no nh/th/ch digraphs)');
eq(sb.DM.WORDS.en.map(w => w.word + w.initial).join(','), 'foxF,deerD,hedgehogH,squirrelS,bunnyB,frogF,bearB,owlO,mouseM', 'en initial words');
const EN_ANIMAL = { fox: 'fox', deer: 'deer', hedgehog: 'hedgehog', squirrel: 'squirrel', bunny: 'bunny', frog: 'frog', bear: 'bear', owl: 'owl', mouse: 'mouse' };
const VI_ANIMAL = { fox: 'con cáo', deer: 'con hươu', hedgehog: 'con nhím', squirrel: 'con sóc', bunny: 'con thỏ', frog: 'con ếch', bear: 'con gấu', owl: 'con cú', mouse: 'con chuột' };
for (const a of ANIMALS) { eq(I.name('en', 'animal', a), EN_ANIMAL[a], 'en animal ' + a); eq(I.name('vi', 'animal', a), VI_ANIMAL[a], 'vi animal ' + a); }
eq(I.name('en', 'animal', 'animal_owl'), 'owl', 'animal from sprite id');
eq(I.name('vi', 'color', 'pink'), 'màu hồng', 'vi pink');
eq(I.name('vi', 'shape', 'heart'), 'hình trái tim', 'vi heart');
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'en rect');
eq(I.name('en', 'size', 'small'), 'little', 'en small = little');
eq(I.name('en', 'size', 'fox_small'), 'little fox', 'en size with animal');
eq(I.name('vi', 'size', 'big:bear'), 'con gấu to', 'vi size with animal');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('en', 'dots', 1), 'one acorn', 'en dots 1');
eq(I.name('en', 'dots', 4), 'four acorns', 'en dots 4');
eq(I.name('vi', 'dots', 3), 'ba hạt dẻ', 'vi dots 3');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('vi', 'letter', 'Y'), 'i dài', 'vi letter Y');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('en', 'text', '2 + 3'), 'two plus three', 'text expression');
eq(I.name('vi', 'text', '5'), 'năm', 'text number');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('en', 'parity', 7), 'seven', 'parity with a number value');
eq(I.name('vi', 'word', 'animal_frog'), 'ếch', 'vi word from sprite id');
eq(I.name('en', 'word', 'animal_bear'), 'bear', 'en word from sprite id');
ok(I.words('en', 'color', 'blue').includes('blew'), 'blue/blew');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'dots', 3).includes('three acorns') && I.words('vi', 'dots', 3).includes('ba hat de'), 'dots words: "three acorns", "ba hat de"');
ok(I.words('vi', 'animal', 'deer').includes('nai') && I.words('vi', 'animal', 'deer').includes('hươu con'), 'vi deer: nai, hươu con (DESIGN §6)');
ok(I.words('vi', 'animal', 'owl').includes('cú mèo') && I.words('vi', 'animal', 'owl').includes('con cu'), 'vi owl: cú mèo, con cu');
ok(I.words('en', 'animal', 'bunny').includes('rabbit') && I.words('en', 'animal', 'mouse').includes('mice'), 'en bunny/rabbit, mouse/mice');
ok(I.words('vi', 'word', 'cáo').includes('con cáo') && I.words('vi', 'word', 'cáo').includes('cao'), 'vi word cáo accepts animal forms');
ok(I.words('en', 'size', 'small').includes('little') && I.words('en', 'size', 'small').includes('small'), 'size small words');
for (const lang of I.langs) for (const kind of I.NAME_KINDS) for (const v of [undefined, null, '', {}, 'zzz', -1, 999]) {
  let n, w;
  try { n = I.name(lang, kind, v); w = I.words(lang, kind, v); } catch (e) { n = null; }
  ok(typeof n === 'string' && Array.isArray(w), `${lang} name/words ${kind} ${JSON.stringify(v)} do not throw`);
}

// ------------------------------------------------------------------ card lines
section('sayFlip: exact lines');
const r0 = () => 0, r9 = () => 0.99;
const card = (nameKind, nameValue, face) => ({ nameKind, nameValue, face: face || { kind: nameKind, value: nameValue } });
eq(I.sayFlip('en', card('color', 'red'), r0), 'Red!', 'en color');
eq(I.sayFlip('en', card('color', 'orange'), r9), 'An orange butterfly!', 'en color variant, a → an');
eq(I.sayFlip('vi', card('color', 'red'), r0), 'Màu đỏ!', 'vi color');
eq(I.sayFlip('vi', card('color', 'red'), r9), 'Bướm màu đỏ!', 'vi color variant');
eq(I.sayFlip('en', card('shape', 'heart'), r0), 'A heart!', 'en shape');
eq(I.sayFlip('en', card('shape', 'heart', { kind: 'shape', shape: 'heart', color: 'red' }), r0), 'A red heart!', 'en shape with colour');
eq(I.sayFlip('vi', card('shape', 'star', { kind: 'shape', shape: 'star', color: 'blue' }), r0), 'Hình ngôi sao màu xanh dương!', 'vi shape with colour');
eq(I.sayFlip('vi', card('shape', 'heart'), r0), 'Hình trái tim!', 'vi shape');
eq(I.sayFlip('en', card('dots', 1), r0), 'One acorn!', 'en dots 1');
eq(I.sayFlip('en', card('dots', 3), r0), 'One, two, three acorns!', 'en dots 3 counted');
eq(I.sayFlip('en', card('dots', 5), r0), 'One, two, three, four, five acorns!', 'en dots 5 counted');
eq(I.sayFlip('en', card('dots', 7), r0), 'Seven acorns!', 'en dots 7 not counted');
eq(I.sayFlip('vi', card('dots', 3), r0), 'Một, hai, ba hạt dẻ!', 'vi dots 3');
eq(I.sayFlip('vi', card('dots', 12), r0), 'Mười hai hạt dẻ!', 'vi dots 12');
eq(I.sayFlip('en', { nameKind: 'dots', face: { kind: 'dots', n: 4 } }, r0), 'One, two, three, four acorns!', 'dots n from face');
eq(I.sayFlip('en', card('number', 3), r0), 'Three!', 'en number');
eq(I.sayFlip('vi', card('number', 3), r0), 'Số ba!', 'vi number');
eq(I.sayFlip('en', card('animal', 'fox'), r0), 'A fox!', 'en animal');
eq(I.sayFlip('en', card('animal', 'owl'), r0), 'An owl!', 'en owl → an');
eq(I.sayFlip('vi', card('animal', 'fox'), r0), 'Con cáo!', 'vi animal');
eq(I.sayFlip('vi', card('animal', 'fox'), r9), 'Con cáo nè!', 'vi animal variant');
eq(I.sayFlip('en', card('size', 'big', { kind: 'animal', sprite: 'animal_fox', scale: 1 }), r0), 'A big fox!', 'en size big');
eq(I.sayFlip('en', card('size', 'small', { kind: 'animal', sprite: 'animal_fox', scale: 0.6 }), r0), 'A little fox!', 'en size little');
eq(I.sayFlip('vi', card('size', 'small', { kind: 'animal', sprite: 'animal_bear', scale: 0.6 }), r0), 'Con gấu nhỏ!', 'vi size little');
eq(I.sayFlip('en', { nameKind: 'animal', nameValue: 'fox', face: { kind: 'animal', sprite: 'animal_fox', scale: 0.6 }, topic: 'size' }, r0), 'A little fox!', 'size read from scale');
eq(I.sayFlip('en', { nameKind: 'animal', nameValue: 'fox', face: { kind: 'animal', scale: 1 }, topic: 'size' }, r0), 'A big fox!', 'size topic, scale 1 → big');
eq(I.sayFlip('en', card('letter', 'B'), r0), 'The letter B!', 'en letter');
eq(I.speech('en', I.sayFlip('en', card('letter', 'B'), r0)), 'The letter bee!', 'en letter speech');
eq(I.sayFlip('vi', card('letter', 'B'), r0), 'Chữ B!', 'vi letter');
eq(I.speech('vi', I.sayFlip('vi', card('letter', 'B'), r0)), 'Chữ bờ!', 'vi letter phonics in speech');
eq(I.sayFlip('en', card('letter', 'b'), r0), 'Small letter b!', 'en small letter');
eq(I.sayFlip('vi', card('letter', 'b'), r0), 'Chữ b viết thường!', 'vi small letter');
eq(I.speech('vi', 'Chữ b viết thường!'), 'Chữ bờ viết thường!', 'vi small letter speech');
eq(I.sayFlip('en', Object.assign(card('letter', 'B'), { topic: 'lower' }), r0), 'Big letter B!', 'en capital in lower topic');
eq(I.sayFlip('vi', Object.assign(card('letter', 'B'), { topic: 'lower' }), r0), 'Chữ B in hoa!', 'vi capital in lower topic');
eq(I.sayFlip('en', card('sum', '2+3'), r0), 'Two plus three!', 'en sum');
eq(I.sayFlip('vi', card('diff', '7−2'), r0), 'Bảy trừ hai!', 'vi diff');
eq(I.sayFlip('en', card('text', '2 + 3'), r0), 'Two plus three!', 'en text expr');
eq(I.sayFlip('en', card('word', 'animal_fox'), r0), 'A fox!', 'en word card (initial)');
eq(I.sayFlip('vi', card('word', 'cáo', { kind: 'animal', sprite: 'animal_fox' }), r0), 'Con cáo!', 'vi word card (initial)');
eq(I.sayFlip('en', card('parity', 7, { kind: 'parity', n: 7 }), r0), 'Seven!', 'parity card names the number');
eq(I.sayFlip('en', card('parity', 7, { kind: 'parity', n: 7, dots: true }), r0), 'Seven acorns!', 'parity dots card counts');
eq(I.sayFlip('en', { face: { kind: 'animal', sprite: 'animal_deer' } }, r0), 'A deer!', 'face only (no nameKind)');
eq(I.sayFlip('en', { nameValue: 'owl' }, r0), 'An owl!', 'value only: guessed');
ok(I.raw('en', 'praise').includes(I.sayFlip('en', {}, r0)), 'empty event → praise');
eq(I.sayTap, I.sayFlip, 'sayTap alias');

section('sayMatch: exact lines');
const pair = (topic, a, b, extra) => Object.assign({ topic, cardA: a, cardB: b, nameKind: a.nameKind, nameValue: a.nameValue }, extra || {});
eq(I.sayMatch('en', pair('animals', card('animal', 'fox'), card('animal', 'fox')), r0), 'Two foxes! A pair!', 'en animals');
eq(I.sayMatch('en', { nameKind: 'animal', nameValue: 'mouse' }, r0), 'Two mice! A pair!', 'en animals (event fields only)');
eq(I.sayMatch('vi', { nameKind: 'animal', nameValue: 'fox' }, r0), 'Hai con cáo! Một cặp rồi!', 'vi animals');
eq(I.sayMatch('en', { nameKind: 'color', nameValue: 'red' }, r0), 'Red and red! A pair!', 'en colors');
eq(I.sayMatch('vi', { nameKind: 'color', nameValue: 'red' }, r9), 'Hai con bướm màu đỏ! Một cặp rồi!', 'vi colors variant');
eq(I.sayMatch('en', { nameKind: 'shape', nameValue: 'heart' }, r0), 'Two hearts! A pair!', 'en shapes');
eq(I.sayMatch('vi', { nameKind: 'shape', nameValue: 'star' }, r0), 'Hai hình ngôi sao! Một cặp rồi!', 'vi shapes');
eq(I.sayMatch('en', pair('count', card('number', 3), card('dots', 3)), r0), 'Three and three acorns! A match!', 'en count');
eq(I.sayMatch('en', pair('count', card('number', 1), card('dots', 1)), r0), 'One and one acorn! A match!', 'en count 1 (singular)');
eq(I.sayMatch('vi', pair('count', card('number', 3), card('dots', 3)), r0), 'Số ba và ba hạt dẻ! Đúng một cặp!', 'vi count');
eq(I.sayMatch('en', { topic: 'count', nameKind: 'number', nameValue: 4 }, r0), 'Four and four acorns! A match!', 'count from topic + nameValue');
eq(I.sayMatch('en', pair('oddeven', card('number', 7), card('dots', 7)), r0), 'Seven and seven acorns! Seven is odd!', 'en oddeven');
eq(I.sayMatch('vi', pair('oddeven', card('number', 8), card('dots', 8)), r0), 'Số tám và tám hạt dẻ! Tám là số chẵn!', 'vi oddeven');
eq(I.sayMatch('en', { nameKind: 'number', nameValue: 6, parity: 'even' }, r9), 'Six is even! A pair!', 'oddeven from ev.parity');
eq(I.sayMatch('en', pair('size', card('size', 'big', { kind: 'animal', sprite: 'animal_fox', scale: 1 }), card('size', 'small', { kind: 'animal', sprite: 'animal_fox', scale: 0.6 })), r0),
  'A big fox and a little fox! A pair!', 'en size');
eq(I.sayMatch('vi', { topic: 'size', nameKind: 'animal', nameValue: 'bear' }, r0), 'Con gấu to và con gấu nhỏ! Một cặp rồi!', 'vi size');
eq(I.sayMatch('en', pair('letters', card('letter', 'B'), card('letter', 'B')), r0), 'Letter B and letter B! A pair!', 'en letters');
eq(I.speech('en', 'Letter B and letter B! A pair!'), 'Letter bee and letter bee! A pair!', 'en letters speech');
eq(I.sayMatch('vi', { nameKind: 'letter', nameValue: 'Ê' }, r0), 'Chữ Ê và chữ Ê! Một cặp rồi!', 'vi letters');
eq(I.sayMatch('en', pair('lower', card('letter', 'B'), card('letter', 'b')), r0), 'Big letter B and small letter b! A pair!', 'en lower');
eq(I.sayMatch('en', pair('lower', card('letter', 'A'), card('letter', 'a')), r0), 'Big letter A and small letter a! A pair!', 'letter A is never "An"');
eq(I.sayMismatch('en', { cardA: card('letter', 'A'), cardB: card('letter', 'E') }, r0), 'Letter A and letter E. Let’s look again!', 'mismatch letter A');
eq(I.sayMismatch('en', { cardA: card('letter', 'E'), cardB: card('letter', 'A') }, r0), 'Letter E and letter A. Let’s look again!', 'mismatch letter A last');
eq(I.sayFlip('en', card('color', 'orange'), r9), 'An orange butterfly!', 'a → an still works');
for (const L of 'AEIOU') ok(!/letter An\b/.test(I.sayMatch('en', pair('lower', card('letter', L), card('letter', L.toLowerCase())), r0)), 'no "letter An" for ' + L);
eq(I.sayMatch('vi', pair('lower', card('letter', 'G'), card('letter', 'g')), r0), 'Chữ G in hoa và chữ g thường! Một cặp rồi!', 'vi lower');
eq(I.speech('vi', 'Chữ G in hoa và chữ g thường! Một cặp rồi!'), 'Chữ gờ in hoa và chữ gờ thường! Một cặp rồi!', 'vi lower speech');
eq(I.sayMatch('en', pair('initial', card('letter', 'F'), card('animal', 'fox', { kind: 'animal', sprite: 'animal_fox' })), r0),
  'Fox starts with the letter F! A pair!', 'en initial');
eq(I.sayMatch('vi', pair('initial', card('letter', 'C'), card('word', 'cáo', { kind: 'animal', sprite: 'animal_fox' })), r0),
  'Cáo bắt đầu bằng chữ C! Một cặp rồi!', 'vi initial');
eq(I.sayMatch('en', pair('add', card('sum', '2+3'), card('number', 5)), r0), 'Two plus three is five! A match!', 'en add');
eq(I.sayMatch('vi', pair('sub', card('number', 5), card('diff', '7−2')), r0), 'Bảy trừ hai bằng năm! Đúng rồi!', 'vi sub (answer card first)');
eq(I.sayMatch('en', pair('add', card('text', '4 + 4', { kind: 'text', text: '4 + 4' }), card('text', '8', { kind: 'text', text: '8' })), r0),
  'Four plus four is eight! A match!', 'add with text faces');
ok(I.raw('en', 'match.any').includes(I.sayMatch('en', {}, r0)), 'empty match → match.any');
ok(I.raw('en', 'match.any').includes(I.sayMatch('en', { topic: 'add', nameKind: 'number', nameValue: 5 }, r0)), 'add without the sum card → match.any (never "five and five")');
// field variants for the two cards
const viaFields = [
  { cards: [card('animal', 'fox'), card('animal', 'fox')] },
  { nameKindA: 'animal', nameValueA: 'fox', nameKindB: 'animal', nameValueB: 'fox' },
  { nameA: { kind: 'animal', value: 'fox' }, nameB: { kind: 'animal', value: 'fox' } },
  { faceA: { kind: 'animal', sprite: 'animal_fox' }, faceB: { kind: 'animal', sprite: 'animal_fox' } },
  { nameA: 'fox', nameB: 'fox' }
];
for (const f of viaFields) eq(I.sayMatch('en', f, r0), 'Two foxes! A pair!', 'match card fields ' + Object.keys(f).join(','));

section('sayMismatch: exact lines');
eq(I.sayMismatch('en', { cardA: card('animal', 'fox'), cardB: card('animal', 'owl') }, r0), 'A fox and an owl. Let’s look again!', 'en animals');
eq(I.sayMismatch('vi', { cardA: card('animal', 'fox'), cardB: card('animal', 'owl') }, r0), 'Con cáo và con cú. Mình nhìn lại nhé!', 'vi animals');
eq(I.sayMismatch('en', { nameKindA: 'color', nameValueA: 'red', nameKindB: 'color', nameValueB: 'blue' }, r0), 'Red and blue. Let’s look again!', 'en colours');
eq(I.sayMismatch('vi', { nameA: { kind: 'color', value: 'red' }, nameB: { kind: 'color', value: 'pink' } }, r0), 'Màu đỏ và màu hồng. Mình nhìn lại nhé!', 'vi colours');
eq(I.sayMismatch('en', { cardA: card('number', 3), cardB: card('dots', 5) }, r0), 'Three and five acorns. Let’s look again!', 'en count');
eq(I.sayMismatch('vi', { cardA: card('number', 3), cardB: card('dots', 1) }, r0), 'Số ba và một hạt dẻ. Mình nhìn lại nhé!', 'vi count');
eq(I.sayMismatch('en', { cardA: card('shape', 'heart'), cardB: card('shape', 'circle') }, r9), 'A heart and a circle! Try two more cards!', 'en shapes variant');
eq(I.sayMismatch('en', { topic: 'size', cardA: card('animal', 'fox', { kind: 'animal', scale: 1 }), cardB: card('animal', 'owl', { kind: 'animal', scale: 0.6 }) }, r0),
  'A big fox and a little owl. Let’s look again!', 'en size');
eq(I.sayMismatch('en', { cardA: card('letter', 'B'), cardB: card('letter', 'd') }, r0), 'Letter B and small letter d. Let’s look again!', 'en letters');
eq(I.sayMismatch('vi', { cardA: card('sum', '2+3'), cardB: card('number', 4) }, r0), 'Hai cộng ba và số bốn. Mình nhìn lại nhé!', 'vi add');
ok(I.raw('en', 'wrong').includes(I.sayMismatch('en', { a: 'c1', b: 'c2', streak: 2 }, r0)), 'mismatch without names → wrong[]');
ok(I.raw('vi', 'wrong').includes(I.sayMismatch('vi', { cardA: card('animal', 'fox') }, r0)), 'mismatch with one card → wrong[]');
eq(I.cardPhrase('en', card('animal', 'owl')), 'an owl', 'cardPhrase en');
eq(I.cardPhrase('vi', card('dots', 4)), 'bốn hạt dẻ', 'cardPhrase vi');
eq(I.sayCorrect('en', card('animal', 'fox'), r0), 'A fox!', 'sayCorrect alias → sayFlip');
eq(I.sayWrong('en', { cardA: card('animal', 'fox'), cardB: card('animal', 'owl') }, r0), 'A fox and an owl. Let’s look again!', 'sayWrong alias → sayMismatch');

section('sayReward / sayCount');
for (const lang of I.langs) for (const k of ['butterfly', 'lantern', 'acorns', 'animal', 'star', 'zzz', undefined]) {
  const s = I.sayReward(lang, { kind: k });
  ok(clean(s) && positive(s), `${lang} sayReward ${k}: ${s}`);
}
eq(I.sayCount('en', 2, 3), 'Two!', 'en count < need');
eq(I.sayCount('en', 3, 3), 'Three! Three acorns!', 'en count done');
eq(I.sayCount('en', 1, 1), 'One! One acorn!', 'en count done singular');
eq(I.sayCount('vi', 3, 3), 'Ba! Ba hạt dẻ!', 'vi count done');
for (const lang of I.langs) for (let need = 1; need <= 12; need++) for (let n = 1; n <= need; n++) {
  const s = I.sayCount(lang, n, need);
  ok(clean(s) && positive(s), `${lang} sayCount ${n}/${need}: ${s}`);
}

// ------------------------------------------------------------------ synthetic rounds: every topic × values × field shapes
section('say* on many synthetic pair events (both languages)');
function synthPairs() {
  const P = [];   // [topic, cardA, cardB]
  const COL = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const SH = ['circle', 'square', 'triangle', 'star', 'heart', 'rect'];
  for (const c of COL) P.push(['colors', card('color', c, { kind: 'color', value: c, color: c }), card('color', c, { kind: 'color', color: c })]);
  for (const s of SH) for (const c of COL.slice(0, 3)) P.push(['shapes', card('shape', s, { kind: 'shape', shape: s, color: c }), card('shape', s, { kind: 'shape', shape: s, color: COL[(COL.indexOf(c) + 2) % 7] })]);
  for (const a of ANIMALS) {
    P.push(['animals', card('animal', a, { kind: 'animal', sprite: 'animal_' + a }), card('animal', a, { kind: 'animal', sprite: 'animal_' + a })]);
    P.push(['size', card('size', 'big', { kind: 'animal', sprite: 'animal_' + a, scale: 1 }), card('size', 'small', { kind: 'animal', sprite: 'animal_' + a, scale: 0.6 })]);
  }
  for (let n = 1; n <= 12; n++) {
    P.push(['count', card('number', n, { kind: 'number', value: n, n }), card('dots', n, { kind: 'dots', n })]);
    P.push(['oddeven', card('parity', n, { kind: 'parity', n, parity: n % 2 ? 'odd' : 'even' }), card('parity', n, { kind: 'parity', n, dots: true, parity: n % 2 ? 'odd' : 'even' })]);
  }
  for (const L of 'ABCDEGHIKLMNOPQRSTUVXYĂÂĐÊÔƠƯ') {
    P.push(['letters', card('letter', L), card('letter', L)]);
    if (L !== 'I') P.push(['lower', card('letter', L), card('letter', L.toLowerCase())]);
  }
  for (const lang of ['en', 'vi']) for (const w of sb.DM.WORDS[lang])
    P.push(['initial', card('letter', w.initial), card('word', w.word, { kind: 'animal', sprite: w.sprite }), lang]);
  for (let a = 0; a <= 10; a++) for (let b = 0; a + b <= 20; b++) P.push(['add', card('sum', a + '+' + b, { kind: 'text', text: a + ' + ' + b }), card('number', a + b, { kind: 'number', n: a + b })]);
  for (let a = 1; a <= 10; a++) for (let b = 0; b <= a; b++) P.push(['sub', card('number', a - b), card('diff', a + '−' + b, { kind: 'text', text: a + ' − ' + b })]);
  return P;
}
const PAIRS = synthPairs();
let synthN = 0;
function shapes(topic, A, B) {     // the same pair as the world may send it
  return [
    { topic, cardA: A, cardB: B, nameKind: A.nameKind, nameValue: A.nameValue, a: 'c1', b: 'c2' },
    { cardA: A, cardB: B },
    { topic, nameKindA: A.nameKind, nameValueA: A.nameValue, faceA: A.face, nameKindB: B.nameKind, nameValueB: B.nameValue, faceB: B.face },
    { topic, nameKind: A.nameKind, nameValue: A.nameValue },
    { topic, nameKind: B.nameKind, nameValue: B.nameValue, face: B.face }
  ];
}
for (const [topic, A, B, onlyLang] of PAIRS) for (const lang of I.langs) {
  if (onlyLang && onlyLang !== lang) continue;
  for (const c of [A, B]) for (let i = 0; i < 2; i++) {
    const s = I.sayFlip(lang, Object.assign({ topic }, c), () => i * 0.7);
    ok(clean(s) && positive(s) && nWords(s) <= 12, `${lang} sayFlip ${topic} ${c.nameKind}:${c.nameValue}: ${s}`);
    ok(!I.raw(lang, 'praise').includes(s), `${lang} sayFlip ${topic} ${c.nameKind}:${c.nameValue} names the card (${s})`);
    synthN++;
  }
  for (const ev of shapes(topic, A, B)) for (let i = 0; i < 2; i++) {
    const s = I.sayMatch(lang, ev, () => i * 0.7);
    ok(clean(s) && positive(s) && nWords(s) <= 14, `${lang} sayMatch ${topic} ${Object.keys(ev).join('+')}: ${s}`);
    synthN++;
  }
  // full-information events name the pair (never only the generic line)
  const full = I.sayMatch(lang, shapes(topic, A, B)[0], r0);
  ok(!I.raw(lang, 'match.any').includes(full), `${lang} sayMatch ${topic} ${A.nameValue}/${B.nameValue} is specific: ${full}`);
  if (topic === 'oddeven') ok(full.indexOf(I.name(lang, 'parity', A.face.n % 2 ? 'odd' : 'even')) >= 0, `${lang} oddeven match names the parity: ${full}`);
  if (topic === 'count' || topic === 'oddeven') ok(full.toLowerCase().indexOf(I.name(lang, 'number', A.face.n)) >= 0, `${lang} ${topic} match says the number: ${full}`);
  if (topic === 'animals') ok(full.indexOf(I.name(lang, 'animal', A.nameValue)) >= 0 || lang === 'en', `${lang} animals match names it: ${full}`);
}
// mismatches: neighbouring pairs of the same topic
for (let i = 0; i + 1 < PAIRS.length; i++) {
  const [t1, A] = PAIRS[i], [t2, , B2] = PAIRS[i + 1];
  if (t1 !== t2) continue;
  for (const lang of I.langs) for (let k = 0; k < 3; k++) {
    for (const ev of [{ topic: t1, cardA: A, cardB: B2, streak: k }, { nameKindA: A.nameKind, nameValueA: A.nameValue, faceA: A.face, nameKindB: B2.nameKind, nameValueB: B2.nameValue, faceB: B2.face }]) {
      const s = I.sayMismatch(lang, ev, () => k * 0.4);
      ok(clean(s) && positive(s) && nWords(s) <= 15, `${lang} sayMismatch ${t1} ${A.nameValue}/${B2.nameValue}: ${s}`);
      ok(!I.raw(lang, 'wrong').includes(s), `${lang} sayMismatch ${t1} names both cards: ${s}`);
      synthN++;
    }
  }
}
ok(synthN > 3000, `checked ${synthN} synthetic lines`);

section('garbage events never throw, never print junk');
const JUNK = [undefined, null, 0, 1, '', 'fox', [], {}, { nameKind: 'xyz', nameValue: 'q' }, { nameKind: 'animal' },
  { nameKind: 'number', nameValue: 'abc' }, { nameKind: 'dots', nameValue: -2 }, { nameKind: 'dots', nameValue: 30 },
  { nameValue: {} }, { face: null }, { face: 5 }, { cardA: 5, cardB: 'x' }, { cards: [null, {}] }, { nameA: {}, nameB: [] },
  { nameKind: 'letter', nameValue: 'AB' }, { nameKind: 'sum', nameValue: '2+' }, { nameKind: 'color', nameValue: 'teal' },
  { nameKind: 'shape', nameValue: 'blob', face: { kind: 'shape', color: 'zz' } }, { topic: 'oddeven' }, { topic: 'size', nameKind: 'size', nameValue: 'big' }];
for (const lang of I.langs) for (const ev of JUNK) for (const fn of ['sayFlip', 'sayMatch', 'sayMismatch', 'sayReward', 'sayCorrect', 'sayWrong']) {
  let s;
  try { s = I[fn](lang, ev); } catch (e) { s = 'THROW ' + e.message; }
  ok(clean(s) && positive(s), `${lang} ${fn}(${JSON.stringify(ev)}) → ${s}`);
}

// ------------------------------------------------------------------ real rounds from content.js (pair rounds), if available
section('lines for every card and pair content.js makes');
(function () {
  const sc = makeSandbox(); sc.DM = {};
  let C;
  try { C = load(sc, ['rng.js', 'i18n.js', 'content.js']); } catch (e) { console.log('   (content.js not loadable yet: ' + e.message + ')'); return; }
  if (!C.Content || !C.Content.makeRound) { console.log('   (DM.Content.makeRound missing — skipped)'); return; }
  const I2 = C.I18N;
  const ages = Object.keys(C.AGE_TOPICS || { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }).map(Number);
  let probe;
  try { probe = C.Content.makeRound((C.AGE_TOPICS[4] || ['colors'])[0], { age: 4, lang: 'en', rng: new C.RNG(1), roundIndex: 0 }); } catch (e) { probe = null; }
  if (!probe || !Array.isArray(probe.cards)) { console.log('   (content.js still makes balloon rounds — pair-round checks skipped)'); return; }
  if (C.ANIMALS) eq(JSON.stringify(C.ANIMALS), JSON.stringify(ANIMALS), 'content DM.ANIMALS = DESIGN §5.1 list');
  let rounds = 0, talks = 0, lines = 0;
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 10; s++) {
    let r;
    try { r = C.Content.makeRound(topic, { age, lang, rng: new C.RNG(s * 31 + age), roundIndex: s % 4 }); }
    catch (e) { ok(false, `makeRound ${topic} age ${age} ${lang}: ${e.message}`); continue; }
    if (!r || !Array.isArray(r.cards)) { ok(false, `makeRound ${topic} returns cards[]`); continue; }
    rounds++;
    const txt = I2.t(lang, r.promptKey, r.params || {});
    ok(clean(txt) && txt !== r.promptKey && txt !== I2.t(lang, 'p.any'), `${lang} ${r.promptKey} renders: ${txt}`);
    for (const c of r.cards) {
      ok(I2.NAME_KINDS.includes(c.nameKind), `${lang} card nameKind ${c.nameKind} is a known kind`);
      const s1 = I2.sayFlip(lang, { id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size });   // as World emits
      ok(clean(s1) && positive(s1) && !I2.raw(lang, 'praise').includes(s1), `${lang} ${topic} flip ${c.nameKind}:${JSON.stringify(c.nameValue)}: ${s1}`);
      lines++;
    }
    const byKey = {};
    for (const c of r.cards) (byKey[c.key] = byKey[c.key] || []).push(c);
    const keys = Object.keys(byKey);
    for (const k of keys) {
      const [A, B] = byKey[k];
      ok(byKey[k].length === 2, `${topic} key ${k} has exactly two cards`);
      if (!B) continue;
      // exactly what DM.World._match emits (pairInfo names the pair; _names adds both cards)
      const info = (r.pairInfo || {})[k] || { nameKind: A.nameKind, nameValue: A.nameValue };
      const ev = { a: A.id, b: B.id, key: k, nameKind: info.nameKind, nameValue: info.nameValue, found: 1, pairs: r.pairs,
        nameKindA: A.nameKind, nameValueA: A.nameValue, faceA: A.face, sizeA: A.size,
        nameKindB: B.nameKind, nameValueB: B.nameValue, faceB: B.face, sizeB: B.size };
      ['parity', 'animal', 'word', 'text', 'lower'].forEach(x => { if (info[x] !== undefined) ev[x] = info[x]; });
      for (const e2 of [ev, { a: A.id, b: B.id, cardA: A, cardB: B }]) {
        const m = I2.sayMatch(lang, e2);
        ok(clean(m) && positive(m) && !I2.raw(lang, 'match.any').includes(m), `${lang} ${topic} match ${k}: ${m}`);
        if (topic === 'size') ok(/big|little| to | nhỏ/.test(m + ' '), `${lang} size match says big + little: ${m}`);
        if (topic === 'oddeven') ok(m.indexOf(I2.name(lang, 'parity', (+info.nameValue) % 2 ? 'odd' : 'even')) >= 0, `${lang} oddeven match names the parity: ${m}`);
        if (topic === 'initial' && info.word) ok(m.toLowerCase().indexOf(String(info.word).toLowerCase()) >= 0, `${lang} initial match says the word: ${m}`);
        lines++;
      }
    }
    for (let i = 0; i + 1 < keys.length; i++) {
      const A = byKey[keys[i]][0], B = byKey[keys[i + 1]][byKey[keys[i + 1]].length - 1];
      const mm = I2.sayMismatch(lang, { a: A.id, b: B.id, streak: 1, nameKindA: A.nameKind, nameValueA: A.nameValue, faceA: A.face, sizeA: A.size,
        nameKindB: B.nameKind, nameValueB: B.nameValue, faceB: B.face, sizeB: B.size });
      ok(clean(mm) && positive(mm) && !I2.raw(lang, 'wrong').includes(mm), `${lang} ${topic} mismatch: ${mm}`);
      lines++;
    }
  }
  if (C.Content.makeTalk) for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 8; s++) {
    let tk;
    try { tk = C.Content.makeTalk(topic, { age, lang, rng: new C.RNG(s * 17 + age) }); }
    catch (e) { ok(false, `makeTalk ${topic}: ${e.message}`); continue; }
    if (!tk) continue;
    talks++;
    const q = I2.t(lang, tk.promptKey, tk.params || {});
    ok(clean(q) && q !== tk.promptKey, `${lang} ${tk.promptKey} renders: ${q}`);
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
  ok(rounds > 50, `enumerated ${rounds} pair rounds (${lines} lines), ${talks} talks from content.js`);
})();

section('talkWrong');
eq(I.talkWrong('en', 'animal', 'fox'), 'It is the fox! Good try!', 'en talkWrong animal');
eq(I.talkWrong('vi', 'animal', 'owl'), 'Là con cú đó! Bé cố gắng lắm!', 'vi talkWrong animal');
eq(I.talkWrong('en', 'shape', 'circle'), 'It is a circle! Good try!', 'en talkWrong shape');
eq(I.talkWrong('vi', { kind: 'color', value: 'blue' }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', 'number', 4), 'It is four! Good try!', 'en talkWrong number');
eq(I.talkWrong('vi', 'dots', 4), 'Là số bốn đó! Bé cố gắng lắm!', 'vi talkWrong dots');
eq(I.talkWrong('en', 'letter', 'B'), 'It is the letter B! Good try!', 'en talkWrong letter');
eq(I.talkWrong('vi', 'size', 'small'), 'Bạn này nhỏ đó! Bé cố gắng lắm!', 'vi talkWrong size');
eq(I.talkWrong('en', 'parity', 'even'), 'It is even! Good try!', 'en talkWrong parity');
eq(I.talkWrong('vi', 'parity', 'odd'), 'Là số lẻ đó! Bé cố gắng lắm!', 'vi talkWrong parity');
for (const lang of I.langs) for (const kind of Object.keys(VALUES)) for (const v of VALUES[kind].slice(0, 12)) {
  const s = I.talkWrong(lang, kind, v);
  ok(clean(s) && positive(s), `${lang} talkWrong ${kind} ${v}: ${s}`);
}
ok(clean(I.talkWrong('en')) && clean(I.talkWrong('vi', {})), 'talkWrong without a value');

section('speech text: letters, maths, "Dee" → "Đi" only when spoken in Vietnamese');
eq(I.speech('en', 'Find the letter B!'), 'Find the letter bee!', 'en letter speech');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');
eq(I.speech('en', '7 − 2'), '7 minus 2', 'en math speech');
eq(V.spoken('vi', 'Chào bé! Mình là vịt Dee.'), 'Chào bé! Mình là vịt Đi.', 'vi spoken: Dee → Đi');
eq(V.spoken('vi', 'Dee gợi ý nè: chữ B!'), 'Đi gợi ý nè: chữ bờ!', 'vi spoken: name + phonics');
eq(V.spoken('en', 'Hi! I am Dee.'), 'Hi! I am Dee.', 'en spoken keeps Dee');
eq(V.spoken('vi', 'Deep Deer'), 'Deep Deer', 'only the whole word Dee');
for (const k of I.keys('vi')) for (const s of [].concat(I.raw('vi', k))) {
  if (s.indexOf('Dee') < 0) continue;
  ok(V.spoken('vi', s).indexOf('Dee') < 0 && V.spoken('vi', s).indexOf('Đi') >= 0, `vi ${k} spoken with "Đi": ${V.spoken('vi', s)}`);
  ok(I.t('vi', k, { child: '', stars: 3, n: 1 }).indexOf('Đi') < 0, `vi ${k} display keeps "Dee"`);
}

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
const dotsEn = ch('en', 'dots', [2, 3, 4]), dotsVi = ch('vi', 'dots', [2, 3, 4]);
eq(V.match(['three acorns'], dotsEn), '3', 'en "three acorns"');
eq(V.match(['four'], dotsEn), '4', 'en dots "four"');
eq(V.match(['ba hạt dẻ'], dotsVi), '3', 'vi "ba hạt dẻ"');
eq(V.match(['hai'], dotsVi), '2', 'vi dots "hai"');
for (let n = 0; n <= 20; n++) {
  const set = ch('en', 'number', [n, (n + 1) % 21, (n + 2) % 21]), setV = ch('vi', 'number', [n, (n + 1) % 21, (n + 2) % 21]);
  eq(V.match([I.name('en', 'number', n)], set), String(n), `en number word ${n}`);
  eq(V.match([String(n)], set), String(n), `en digit ${n}`);
  if (n > 0) eq(V.match([I.name('vi', 'number', n)], setV), String(n), `vi number word ${n}`);
  if (n > 0) eq(V.match([I.stripMarks(I.name('vi', 'number', n))], setV), String(n), `vi number no diacritics ${n}`);
}
// forest animals: every one of the 9 is distinguishable by its own name (EN + VI, with/without diacritics, classifiers)
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
for (const [said, want] of [['con nai', 'deer'], ['nai', 'deer'], ['hươu con', 'deer'], ['cú mèo', 'owl'], ['con cu meo', 'owl'],
  ['nhím', 'hedgehog'], ['con soc', 'squirrel'], ['ếch', 'frog'], ['con ech', 'frog'], ['gấu', 'bear'], ['chuot', 'mouse'], ['cáo', 'fox'], ['thỏ', 'bunny']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['rabbit', 'bunny'], ['mice', 'mouse'], ['teddy bear', 'bear'], ['fawn', 'deer'], ['froggy', 'frog'], ['a fox', 'fox'], ['owlet', 'owl']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['hello'], animEn), null, 'en unrelated → null');
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
eq(V.match(['fox'], [{ id: 'f', kind: 'animal', value: 'fox' }, { id: 'o', kind: 'animal', value: 'owl' }], 'en'), 'f', '{id,kind,value} choices');
eq(V.match(['con cú'], [{ id: 'f', kind: 'animal', value: 'fox' }, { id: 'o', kind: 'animal', value: 'owl' }], 'vi'), 'o', '{id,kind,value} vi');
eq(V.match(['red'], []), null, 'no choices → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('input: tap-to-flip, (x, y, ev) in logical px, one pointer');
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
  sb4.DM = {};
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
  ok(downSync, 'down fires synchronously inside pointerdown (instant flip)');
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
  sb5.DM = {};
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
  sb6.DM = {};
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
ok(sb.DM.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into DM.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof DM.Input.attach === 'function' && typeof DM.Input.kidProof === 'function' && typeof DM.Input.holdButton === 'function',
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
  sbx.DM = {};
  env.DM = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.DM.Voice;
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
  ok(Math.abs(cur.rate - 0.92) < 1e-9 && Math.abs(cur.pitch - 1.3) < 1e-9, 'Dee: rate 0.92, pitch 1.3');
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
  // the Vietnamese voice says "Đi"; the bubble text (onStart, log) keeps "Dee"
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là vịt Dee. Dee giúp bé nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là vịt Đi. Đi giúp bé nhé!', 'vi utterance says "Đi"');
  ok(V2.log.some(e => e.text === 'Mình là vịt Dee. Dee giúp bé nhé!'), 'vi log keeps "Dee"');
  eq(startText, 'Mình là vịt Dee. Dee giúp bé nhé!', 'onStart gets the display text with "Dee"');
  E.end(); await dv;
  const de = V2.say('I am Dee!', { lang: 'en' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'I am Dee!', 'en utterance keeps "Dee"');
  E.end(); await de;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('talk.animals', { animal: 'fox' }, { lang: 'vi' });
  eq(sk.text, 'Con cáo đâu rồi nhỉ?', 'sayKey renders the vi line');
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
  E3.DM.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['fox', 'owl', 'frog']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the owl')] });
  eq((await pr2).id, 'owl', 'interim match resolves after a short wait');
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
