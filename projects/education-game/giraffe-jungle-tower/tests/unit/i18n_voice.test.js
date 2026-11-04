#!/usr/bin/env node
// Lulu's Jungle Tower — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/giraffe-jungle-tower:   node tests/unit/i18n_voice.test.js
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
  return sb.JT;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
const NEG_EN = /\b(no|not|wrong|bad|fail|failed|incorrect|oh no|mistake|oops|fall|fell|crash|broke|broken)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|dở|tệ|hỏng|không đúng|chưa đúng|trật|sai rồi|đổ|ngã|rơi mất)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
const r0 = () => 0, r9 = () => 0.99;
const nWords = (s) => String(s).split(/\s+/).filter(Boolean).length;
function clean(s) {
  return typeof s === 'string' && s.trim().length > 0 && s.indexOf('{') < 0 && s.indexOf('}') < 0 &&
    !/undefined|null|NaN|\[object/.test(s) && !/\s[!?.,]/.test(s) && !/^[!?.,]/.test(s) && !/_/.test(s);
}

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.JT = { debug: { voiceLog: [] } };
let JT;
try { JT = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = JT.I18N, V = JT.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js'])
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(JS, f), 'utf8')), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const ANIMALS = ['monkey', 'elephant', 'tiger', 'parrot', 'lion', 'frog', 'snake', 'hippo'];   // DESIGN §4.2 / §5.1
const SOUND_ANIMALS = ANIMALS.filter(a => a !== 'hippo');
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapLulu', 'tapPip', 'dragHint', 'years', 'skip', 'langName.en', 'langName.vi'];
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.countUp', 'p.count', 'p.animals', 'p.sound', 'p.size',
  'p.letters', 'p.lower', 'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const STACK_KEYS = ['stack.name', 'stack.animal', 'stack.sound', 'stack.math', 'stack.oddeven', 'stack.initial', 'stack.lower',
  'towerDone.count'];
const WRONG_KEYS = ['wrong', 'wrong.it', 'wrong.oddeven', 'wrong.find', 'wrong.sound', 'wrong.math', 'wrong.initial',
  'wrong.initialIt', 'wrong.lower', 'wrong.parity'];
const LINE_KEYS = ['deal', 'towerDone', 'bloom', 'monkey', 'clear', 'miss', 'stillDrag', 'party', 'surprise.breeze', 'gust',
  'surprise.butterfly', 'butterfly.land', 'butterfly.tap', 'praise', 'great', 'hint', 'idle', 'session.done'];
const COUNT_KEYS = Array.from({ length: 12 }, (_, i) => 'count.' + (i + 1));
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(PROMPT_KEYS).concat(['p.any'])
  .concat(STACK_KEYS).concat(WRONG_KEYS).concat(LINE_KEYS).concat(COUNT_KEYS)
  .concat(['talk.intro', 'talk.right', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.size',
    'talk.wrong.letter', 'talk.wrong.small', 'talk.wrong.number', 'talk.animalsAny', 'talk.sound'])
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
for (const k of Object.keys(I.PARAMS)) for (const lang of I.langs) ok(I.has(lang, k), `PARAMS key ${k} exists in ${lang}`);
eq(Object.keys(I.PROMPTS).sort().join(','), PROMPT_KEYS.slice().sort().join(','), 'PROMPTS lists every prompt key');
for (const fn of ['t', 'name', 'words', 'has', 'setChild', 'sayStack', 'sayWrong', 'sayTap', 'sayCount', 'sayTowerDone', 'talkWrong',
  'phrase', 'sound', 'hasSound', 'speech', 'sayFound', 'sayGrab'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);
eq(I.ANIMALS.join(','), ANIMALS.join(','), 'I18N.ANIMALS = the jungle animals');
// keys the game code asks for at run time (files still copied from the hide-and-seek game are skipped until rewired)
(function () {
  const files = ['main.js', 'ui.js', 'render.js', 'content.js', 'world.js', '../index.html'];
  const used = new Set();
  for (const f of files) {
    let src = '';
    try { src = fs.readFileSync(path.join(JS, f), 'utf8'); } catch (e) { continue; }
    if (/Hide & Seek|Rainbow Rocket|Forest Memory/.test(src.slice(0, 800))) { console.log(`   (${f} is still the hide-and-seek copy — key check skipped)`); continue; }
    src.replace(/['"`]((?:ui|talk|session|weather|topic|p|stack|wrong|surprise|butterfly|count)\.[A-Za-z0-9.]*[A-Za-z0-9]|deal|towerDone|bloom|monkey|clear|gust|party|praise|great|hint|idle|miss)['"`]/g,
      (m, k) => { used.add(k); return m; });
  }
  for (const k of used) {
    if (/\.$/.test(k)) continue;
    for (const lang of I.langs) ok(I.has(lang, k) || /^(topic|weather|talk|count|surprise|p)\.$/.test(k + '.'), `key used by the game code exists: ${lang} ${k}`);
  }
})();
const ALL_TEXT = I.langs.map(l => I.keys(l).map(x => [].concat(I.raw(l, x)).join(' ')).join(' ')).join(' ');
for (const k of ['Pip', 'fox', 'cáo', 'hide-and-seek', 'trốn tìm', 'campfire', 'lửa trại', 'peek', 'hiding', 'Bim', 'rocket',
  'tên lửa', 'balloon', 'hat', 'cái mũ', 'flag', 'lá cờ', 'squirrel', 'sóc', 'con bò', 'cow', 'con heo'])
  ok(!new RegExp('(^|[^\\p{L}])' + k.toLowerCase() + '([^\\p{L}]|$)', 'u').test(ALL_TEXT.toLowerCase()), `no leftover hide-and-seek wording "${k}"`);
ok(/Lulu/.test(I.t('en', 'ui.welcome', { child: '' })) && /Lulu/.test(I.t('vi', 'ui.welcome', { child: '' })), 'helper is Lulu in both languages');
ok(/hươu Lulu/.test(I.t('vi', 'ui.welcome', { child: '' })), 'vi introduces "hươu Lulu"');

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}
for (const lang of I.langs) for (const k of ['great', 'idle', 'talk.right']) {
  const v = I.raw(lang, k);
  ok(v.some(s => s.includes('{child}')) && v.some(s => !s.includes('{child}')), `${lang} ${k} has name + no-name variants`);
}
for (const lang of I.langs) for (const k of LINE_KEYS.concat(STACK_KEYS, WRONG_KEYS))
  ok(Array.isArray(I.raw(lang, k)) && I.raw(lang, k).length >= 2, `${lang} ${k} has ≥ 2 variants`);

section('Vietnamese wording sanity, titles');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'mau do', 'con khi', 'khoi ', 'xep thap', 'Huou'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
ok(/Bé ơi/.test(viAll) && /nhé!/.test(viAll) && /nào!/.test(viAll) && /giỏi quá!/.test(viAll), 'vi uses "Bé ơi", "nhé!", "nào!", "giỏi quá!"');
ok(/khối/.test(viAll) && /tháp/.test(viAll) && /chuối/.test(viAll) && /chấm/.test(viAll), 'vi uses khối / tháp / chuối / chấm');
// every vi line carries Vietnamese diacritics (a line without any is a sign of an un-accented typo)
for (const k of I.keys('vi')) {
  if (/^ui\.langName|^ui\.(done)$|^count\./.test(k)) continue;   // "Xong" has no marks
  for (const s of [].concat(I.raw('vi', k))) {
    const t = s.replace(/\{\w+\}/g, '');
    if (t.replace(/[^\p{L}]/gu, '').length < 4) continue;
    ok(I.stripMarks(t) !== t, `vi ${k} has diacritics: ${s}`);
  }
}
eq(I.t('en', 'ui.title'), 'Lulu’s Jungle Tower', 'en title');
eq(I.t('vi', 'ui.title'), 'Hươu Lulu Xếp Tháp', 'vi title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Lulu’s / Jungle Tower', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Hươu Lulu / Xếp Tháp', 'vi logo lines');
eq(I.t('en', 'ui.voice'), 'Lulu’s voice', 'en ui.voice');
eq(I.t('vi', 'ui.voice'), 'Giọng của Lulu', 'vi ui.voice');
eq(I.t('en', 'ui.volume'), 'Volume', 'en ui.volume');
eq(I.t('vi', 'ui.volume'), 'Âm lượng', 'vi ui.volume');
eq(I.t('vi', 'ui.listening'), 'Lulu đang nghe…', 'vi listening');
eq(I.t('en', 'ui.tapLulu'), 'Tap Lulu to hear it again', 'en tapLulu');
eq(I.t('en', 'ui.tapPip'), I.t('en', 'ui.tapLulu'), 'ui.tapPip is an alias of ui.tapLulu');
ok(!I.has('en', 'ui.tapBim') && !I.has('vi', 'ui.tapBim'), 'ui.tapBim removed');
eq(I.t('en', 'stillDrag', {}, r0), 'Let go over the tower!', 'en stillDrag');
eq(I.t('vi', 'stillDrag', {}, r0), 'Bé thả khối lên trên tháp nhé!', 'vi stillDrag');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.chapter', { n: 3 }), 'Chương 3', 'vi chapter');
eq(I.t('en', 'weather.0'), 'Good morning, jungle!', 'weather 0 morning');
eq(I.t('en', 'weather.1'), 'Sunny noon!', 'weather 1 noon');
eq(I.t('en', 'weather.2'), 'What a pretty sunset!', 'weather 2 sunset');
eq(I.t('en', 'weather.3'), 'Look, fireflies!', 'weather 3 night');
eq(I.t('vi', 'weather.0'), 'Chào buổi sáng, rừng xanh!', 'vi weather 0');
eq(I.t('vi', 'weather.3'), 'Nhìn kìa, đom đóm!', 'vi weather 3');
eq(I.t('en', 'deal', {}, r0), 'Let’s build up to the bananas!', 'en deal[0]');
eq(I.t('vi', 'deal', {}, r0), 'Mình xếp tháp lên tới nải chuối nhé!', 'vi deal[0]');
eq(I.t('en', 'towerDone', {}, r0), 'We reached the bananas!', 'en towerDone[0]');
eq(I.t('en', 'monkey', {}, r0), '“Thank you, Lulu!” says the monkey.', 'en monkey[0]');
eq(I.t('en', 'gust', {}, r0), 'Whoa, a breeze! I’ve got it!', 'en gust');
eq(I.t('vi', 'gust', {}, r0), 'Ui, gió thổi! Lulu giữ tháp nè!', 'vi gust');
eq(I.t('en', 'butterfly.tap', {}, r0), 'Hello, butterfly! Sparkles!', 'en butterfly.tap');
eq(I.t('en', 'topic.colors'), 'Colour Blocks', 'en topic.colors');
eq(I.t('vi', 'topic.count'), 'Đếm chấm', 'vi topic.count');
for (let i = 1; i <= 12; i++) {
  eq(I.t('en', 'count.' + i), I.numberName('en', i).replace(/^./, c => c.toUpperCase()) + '!', 'en count.' + i);
  eq(I.sayCount('vi', i), I.numberName('vi', i).replace(/^./, c => c.toUpperCase()) + '!', 'vi sayCount ' + i);
}
eq(I.t('en', 'count.1'), 'One!', 'count.1 = "One!"');
eq(I.t('vi', 'count.5'), 'Năm!', 'vi count.5 = "Năm!"');
eq(I.sayCount('en', 15), 'Fifteen!', 'sayCount beyond 12');

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  ok(positive([].concat(I.raw(lang, k)).join(' ')), `${lang} ${k} has no negative words`);
}
ok(!positive('That is wrong') && !positive('Sai rồi') && !positive('no!') && !positive('The tower fell'), 'the negative-word filter itself works');

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, stars: 7, child: 'Mai', answer: 'X', it: 'red', want: 'blue', animal: 'monkey', color: 'red', shape: 'star',
  size: 'big', letter: 'B', lower: 'b', text: 'B', word: 'tiger', first: 'T', a: 2, b: 3, parity: 'odd', expr: '2 + 3',
  num: 'three', ans: 'five' };
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
eq(I.t('en', 'p.nosuchtopic', {}, r0), 'Stack a block on the tower!', 'unknown prompt → p.any');
eq(I.t('vi', 'p.nosuchtopic', {}, r0), 'Bé xếp một khối lên tháp nhé!', 'vi unknown prompt → p.any');
ok(clean(I.t('en', null)) || I.t('en', null) === '', 't with a null key does not throw');

section('prompts: 3 wordings about stacking, every param filled for every value');
for (const lang of I.langs) for (const k of PROMPT_KEYS.concat(['p.any'])) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length === 3 && new Set(v).size === 3, `${lang} ${k} has 3 different variants`);
}
const LETTERS_EN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_VALUES = {
  'p.colors': COLORS.map(c => ({ color: c })),
  'p.shapes': SHAPES.map(s => ({ shape: s })),
  'p.countUp': Array.from({ length: 12 }, (_, i) => ({ n: i + 1 })), 'p.count': Array.from({ length: 12 }, (_, i) => ({ n: i + 1 })),
  'p.animals': ANIMALS.map(a => ({ animal: a })), 'p.sound': SOUND_ANIMALS.map(a => ({ animal: a })),
  'p.size': [{ size: 'big' }, { size: 'small' }, { size: 'big', color: 'red' }, { size: 'small', color: 'blue' }],
  'p.letters': LETTERS_EN.map(l => ({ letter: l })), 'p.lower': LETTERS_EN.map(l => ({ letter: l })),
  'p.initial': LETTERS_EN.map(l => ({ letter: l })).concat([{ letter: 'Ê' }, { letter: 'Đ' }]),
  'p.add': [{ a: 2, b: 3 }, { expr: '4+5' }, { text: '1 + 1' }, { a: 9, b: 9 }],
  'p.sub': [{ a: 7, b: 2, op: '−' }, { expr: '5−3' }, { text: '9 - 4' }],
  'p.oddeven': [{ parity: 'odd' }, { parity: 'even' }]
};
for (const lang of I.langs) for (const k of PROMPT_KEYS) for (const params of PROMPT_VALUES[k]) for (let i = 0; i < 3; i++) {
  const s = I.t(lang, k, params, () => (i + 0.5) / 3);
  ok(clean(s) && positive(s) && nWords(s) <= 13 && !I.raw(lang, 'p.any').includes(s), `${lang} ${k}[${i}] ${JSON.stringify(params)}: ${s}`);
  if (params.color && k === 'p.colors') ok(s.toLowerCase().indexOf(I.name(lang, 'color', params.color)) >= 0, `${lang} ${k} names the colour: ${s}`);
  if (params.shape) ok(s.toLowerCase().indexOf(I.name(lang, 'shape', params.shape)) >= 0, `${lang} ${k} names the shape: ${s}`);
  if (k === 'p.animals') ok(s.toLowerCase().indexOf(I.name(lang, 'animal', params.animal)) >= 0, `${lang} ${k} names the animal: ${s}`);
  if (k === 'p.sound') {
    ok(s.toLowerCase().indexOf(I.sound(lang, params.animal)) >= 0, `${lang} p.sound says the sound: ${s}`);
    const bareA = I.name(lang, 'animal', params.animal).replace(/^con /, '');
    ok(s.toLowerCase().indexOf(bareA) < 0, `${lang} p.sound does not give away the animal: ${s}`);
  }
  if (k === 'p.size') ok(s.indexOf(I.name(lang, 'size', params.size)) >= 0, `${lang} p.size says the size: ${s}`);
  if (k === 'p.countUp' || k === 'p.count') ok(s.indexOf(String(params.n)) >= 0, `${lang} ${k} shows the number: ${s}`);
  if (k === 'p.count' && lang === 'en' && i < 2) ok(params.n === 1 ? / 1 dot\b/.test(s) && !/ 1 dots/.test(s) : / dots\b/.test(s), `${lang} p.count singular/plural: ${s}`);
  if (k === 'p.initial' || k === 'p.letters') ok(s.indexOf(params.letter) >= 0, `${lang} ${k} shows the letter: ${s}`);
  if (k === 'p.add' || k === 'p.sub') ok(/\d [+−] \d/.test(s), `${lang} ${k} shows the sum: ${s}`);
  if (k === 'p.oddeven') ok(s.indexOf(I.name(lang, 'parity', params.parity)) >= 0, `${lang} p.oddeven says the parity: ${s}`);
}
// prompts talk about stacking blocks (EN: stack / put / block / tower; VI: xếp / đặt / khối / tháp)
for (const k of PROMPT_KEYS.concat(['p.any'])) {
  ok(I.raw('en', k).some(s => /stack|block|tower|put/i.test(s)), `en ${k} is about stacking`);
  ok(I.raw('vi', k).some(s => /xếp|khối|tháp|đặt/i.test(s)), `vi ${k} is about stacking`);
}
eq(I.t('en', 'p.colors', { color: 'red' }, r0), 'Stack the red block!', 'en p.colors');
eq(I.t('vi', 'p.colors', { color: 'red' }, r0), 'Bé ơi, xếp khối màu đỏ nhé!', 'vi p.colors (khối màu đỏ)');
eq(I.t('vi', 'p.colors', { color: 'blue' }, () => 0.9), 'Khối màu xanh dương đâu nhỉ? Bé xếp lên nhé!', 'vi p.colors [2]');
eq(I.t('en', 'p.shapes', { shape: 'star' }, r0), 'Put the star block on top!', 'en p.shapes');
eq(I.t('en', 'p.shapes', { shape: 'oval' }, () => 0.9), 'Which block has an oval? Stack it!', 'en p.shapes a → an');
eq(I.t('vi', 'p.shapes', { shape: 'star' }, r0), 'Bé ơi, đặt khối hình ngôi sao lên trên nhé!', 'vi p.shapes');
eq(I.t('en', 'p.countUp', { n: 2 }, r0), 'Count up! Find number 2!', 'en p.countUp says count');
eq(I.t('vi', 'p.countUp', { n: 3 }, () => 0.5), 'Đếm lên nào! Giờ bé xếp số 3 nhé!', 'vi p.countUp');
for (const lang of I.langs) ok(I.raw(lang, 'p.countUp').every(x => /count|đếm/i.test(x)), `${lang} every p.countUp wording says count`);
eq(I.t('en', 'p.count', { n: 1 }, r0), 'Find the block with 1 dot!', 'en p.count singular');
eq(I.t('en', 'p.count', { n: 4 }, r0), 'Find the block with 4 dots!', 'en p.count plural');
eq(I.t('vi', 'p.count', { n: 3 }, r0), 'Bé tìm khối có 3 chấm nhé!', 'vi p.count');
eq(I.t('en', 'p.animals', { animal: 'monkey' }, r0), 'Stack the monkey block!', 'en p.animals');
eq(I.t('vi', 'p.animals', { animal: 'monkey' }, r0), 'Bé ơi, xếp khối con khỉ nhé!', 'vi p.animals (con khỉ)');
eq(I.t('vi', 'p.animals', { animal: 'elephant' }, () => 0.5), 'Con voi đâu rồi? Bé đặt lên tháp nhé!', 'vi p.animals capitalised');
eq(I.t('en', 'p.sound', { animal: 'lion' }, r0), 'Who says roar? Stack that block!', 'en p.sound');
eq(I.t('en', 'p.sound', { animal: 'frog' }, () => 0.5), 'Listen! Ribbit! Who is it?', 'en p.sound sentence-capitalised');
eq(I.t('vi', 'p.sound', { animal: 'frog' }, r0), 'Con gì kêu ộp ộp? Bé xếp khối đó nhé!', 'vi p.sound');
eq(I.t('en', 'p.sound', { sound: 'snake' }, r0), 'Who says hiss? Stack that block!', 'p.sound from a {sound: animal id}');
eq(I.t('en', 'p.sound', { animal: 'hippo' }, r0), 'Stack the hippo block!', 'p.sound for the hippo (no sound) → p.animals');
eq(I.t('en', 'p.size', { size: 'big' }, r0), 'Stack the big block!', 'en p.size');
eq(I.t('en', 'p.size', { size: 'small' }, r0), 'Stack the small block!', 'en p.size small');
eq(I.t('vi', 'p.size', { size: 'small' }, r0), 'Bé ơi, xếp khối nhỏ nhé!', 'vi p.size');
eq(I.t('en', 'p.letters', { letter: 'B' }, r0), 'Stack the letter B!', 'en p.letters');
eq(I.t('en', 'p.lower', { letter: 'B' }, r0), 'Big letter B! Find its small letter!', 'en p.lower');
eq(I.t('en', 'p.initial', { letter: 'T' }, r0), 'Which one starts with the letter T? Stack it!', 'en p.initial');
eq(I.t('vi', 'p.initial', { letter: 'H' }, r0), 'Cái gì bắt đầu bằng chữ H? Bé xếp nhé!', 'vi p.initial');
eq(V.spoken('vi', 'Cái gì bắt đầu bằng chữ H?'), 'Cái gì bắt đầu bằng chữ hờ?', 'vi p.initial spoken with phonics');
eq(I.t('en', 'p.add', { a: 2, b: 3 }, r0), 'What is 2 + 3? Stack the answer!', 'en p.add');
eq(I.t('vi', 'p.sub', { a: 7, b: 2, op: '−' }, r0), '7 − 2 bằng mấy? Bé xếp đáp số nhé!', 'vi p.sub');
eq(I.t('en', 'p.oddeven', { parity: 'odd' }, r0), 'Find an odd number!', 'en p.oddeven (a → an)');
eq(I.t('vi', 'p.oddeven', { parity: 'even' }, r0), 'Bé ơi, tìm số chẵn nhé!', 'vi p.oddeven');
// a missing param never shows a hole: falls back to p.any
for (const lang of I.langs) for (const k of PROMPT_KEYS) for (const params of [undefined, null, {}, { child: 'An' }, 'junk', 7]) {
  const s = I.t(lang, k, params);
  ok(clean(s) && s !== k && nWords(s) <= 13, `${lang} ${k} renders with params ${JSON.stringify(params)}: ${s}`);
}
ok(I.raw('en', 'p.any').includes(I.t('en', 'p.colors', {})), 'p.colors without a colour → p.any');

section('talk, session, child name');
eq(I.t('en', 'talk.animals', { animal: 'tiger' }), 'Where is the tiger?', 'en talk.animals');
eq(I.t('vi', 'talk.animals', { animal: 'tiger' }), 'Con hổ đâu rồi nhỉ?', 'vi talk.animals');
eq(I.t('vi', 'talk.animals', { animal: { kind: 'animal', value: 'parrot' } }), 'Con vẹt đâu rồi nhỉ?', 'vi talk.animals object param');
eq(I.t('en', 'talk.animals', { animal: 'animal_snake' }), 'Where is the snake?', 'talk.animals from a sprite id');
eq(I.t('en', 'talk.animals', {}), 'Which animal is this?', 'talk.animals fallback');
eq(I.t('en', 'talk.sound', { animal: 'elephant' }), 'Who says toot?', 'en talk.sound');
eq(I.t('vi', 'talk.sound', { animal: 'parrot' }), 'Con gì kêu két két nhỉ?', 'vi talk.sound');
eq(I.t('en', 'talk.sound', { animal: 'hippo' }), 'Which animal is this?', 'talk.sound hippo → animalsAny');
eq(I.t('en', 'talk.intro'), 'Talk time! Lulu has a question.', 'en talk.intro');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'session.done', { stars: 14 }, r0), 'What a builder! 14 stars! Hooray!', 'en session.done');
eq(I.t('vi', 'session.done', { stars: 14 }, r0), 'Bé xây giỏi quá! 14 ngôi sao!', 'vi session.done');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Lulu. Let’s build a tower!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Lulu. Let’s build a tower!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Mình là hươu Lulu. Mình cùng xếp tháp nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Mình là hươu Lulu. Mình cùng xếp tháp nhé!', 'vi welcome with name');
I.setChild('An');
ok(I.t('en', 'ui.welcome').indexOf('An') > 0, 'setChild is the default {child}');
ok(I.raw('en', 'great').map((s, i) => I.t('en', 'great', {}, () => (i + 0.5) / 7)).some(s => s.includes('An')), 'great uses the child name');
I.setChild('');
for (let i = 0; i < 7; i++) {
  const s = I.t('vi', 'great', {}, () => (i + 0.5) / 7);
  ok(clean(s) && !/bé \s|Bé !/.test(s), 'vi great without name reads well: ' + s);
}
for (const r of [() => NaN, () => 1, () => -3, { next: () => 2 }, 'x', () => { throw new Error('x'); }])
  ok(clean(I.t('en', 'praise', {}, r)), 'odd rng values still pick a variant');

section('names, sounds, words for every kind/value');
const VALUES = {
  color: COLORS,
  shape: SHAPES,
  size: ['big', 'small'],
  animal: ANIMALS,
  parity: ['odd', 'even'],
  number: Array.from({ length: 21 }, (_, i) => i),
  dots: Array.from({ length: 12 }, (_, i) => i + 1),
  stars: Array.from({ length: 12 }, (_, i) => i + 1),
  text: ['2 + 3', '7 − 2', '5', 'B', 'monkey', 'odd'],
  word: ANIMALS.map(a => 'animal_' + a).concat(ANIMALS)
};
const LETTERS = new Set(('ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'ĂÂĐÊÔƠƯ').split(''));
VALUES.letter = Array.from(LETTERS).concat(Array.from(LETTERS).map(c => c.toLowerCase()));
VALUES.sum = []; VALUES.diff = [];
for (let a = 1; a <= 19; a++) for (let b = 1; a + b <= 20; b++) VALUES.sum.push(a + '+' + b);
for (let a = 1; a <= 10; a++) for (let b = 0; b <= a; b++) VALUES.diff.push(a + '−' + b);
eq(I.NAME_KINDS.join(','), 'color,shape,size,animal,number,dots,stars,letter,text,sum,diff,parity,word', 'NAME_KINDS');
for (const k of I.NAME_KINDS) ok(VALUES[k], `test covers name kind ${k}`);
function checkNameWords(lang, kind, v, where) {
  const n = I.name(lang, kind, v);
  ok(typeof n === 'string' && n.length > 0 && !/undefined|null|_/.test(n), `${lang} name ${kind} ${v}${where} (${n})`);
  if (['color', 'shape', 'animal', 'parity', 'size'].includes(kind) && lang === 'vi')
    ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
  if (kind === 'sum' || kind === 'diff' || kind === 'stars' || kind === 'dots') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
  const w = I.words(lang, kind, v);
  ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${v}${where}`);
  ok(w.every(x => typeof x === 'string' && x === x.toLowerCase()), `${lang} words ${kind} ${v} are lower-case`);
  if (!['letter', 'text', 'sum', 'diff'].includes(kind) && !(lang === 'vi' && kind === 'number' && v === 0)) ok(w.includes(n.toLowerCase()), `${lang} words ${kind} ${v} include the name "${n}"`);
  if (lang === 'vi' && kind !== 'letter' && !(kind === 'text' && /^\p{L}$/u.test(v))) ok(w.every(x => w.includes(I.stripMarks(x).toLowerCase())), `vi words ${kind} ${v} include no-diacritic forms`);
  if (kind === 'number' || kind === 'stars' || kind === 'dots') ok(w.includes(String(v)), `${lang} words ${kind} ${v} include the digit`);
}
for (const lang of I.langs) for (const kind of Object.keys(VALUES)) for (const v of VALUES[kind]) checkNameWords(lang, kind, v, '');
const VI_ANIMAL = { monkey: 'con khỉ', elephant: 'con voi', tiger: 'con hổ', parrot: 'con vẹt', lion: 'con sư tử', frog: 'con ếch',
  snake: 'con rắn', hippo: 'con hà mã' };
const SOUND_EN = { monkey: 'ooh-ooh', elephant: 'toot', tiger: 'grr', parrot: 'squawk', lion: 'roar', frog: 'ribbit', snake: 'hiss' };
const SOUND_VI = { monkey: 'khẹc khẹc', elephant: 'tò te', tiger: 'gừ gừ', parrot: 'két két', lion: 'gào gào', frog: 'ộp ộp', snake: 'xì xì' };
for (const a of ANIMALS) {
  eq(I.name('en', 'animal', a), a, 'en animal ' + a); eq(I.name('vi', 'animal', a), VI_ANIMAL[a], 'vi animal ' + a);
  eq(I.sound('en', a), SOUND_EN[a] || '', 'en sound ' + a); eq(I.sound('vi', a), SOUND_VI[a] || '', 'vi sound ' + a);
  eq(I.sound('en', 'animal_' + a), SOUND_EN[a] || '', 'sound from a sprite id ' + a);
  eq(I.hasSound(a), a !== 'hippo', 'hasSound ' + a);
}
ok(new Set(Object.values(SOUND_VI)).size === 7 && new Set(Object.values(SOUND_EN)).size === 7, 'every sound word is different');
eq(I.sound('en', 'zebra'), '', 'unknown animal has no sound');
ok(I.words('vi', 'animal', 'tiger').includes('cọp') && I.words('vi', 'animal', 'tiger').includes('cop'), 'vi tiger accepts "cọp" / "cop"');
ok(I.words('vi', 'animal', 'parrot').includes('chim vẹt'), 'vi parrot accepts "chim vẹt"');
ok(I.words('en', 'animal', 'hippo').includes('hippopotamus') && I.words('en', 'animal', 'parrot').includes('bird'), 'en hippopotamus / bird');
eq(I.name('en', 'animal', 'animal_parrot'), 'parrot', 'animal from sprite id');
eq(I.name('vi', 'color', 'pink'), 'màu hồng', 'vi pink');
eq(I.name('vi', 'shape', 'heart'), 'hình trái tim', 'vi heart');
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'en rect');
eq(I.name('vi', 'shape', 'oval'), 'hình bầu dục', 'vi oval');
eq(I.name('en', 'size', 'small'), 'small', 'en small');
eq(I.name('vi', 'size', 'big'), 'to', 'vi big');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('en', 'dots', 1), 'one dot', 'en dots 1');
eq(I.name('en', 'dots', 3), 'three dots', 'en dots 3');
eq(I.name('vi', 'dots', 3), 'ba chấm', 'vi dots 3');
eq(I.name('en', 'stars', 3), 'three stars', 'en stars 3');
eq(I.name('vi', 'stars', 3), 'ba ngôi sao', 'vi stars 3');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('vi', 'letter', 'Y'), 'i dài', 'vi letter Y');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('vi', 'word', 'animal_frog'), 'ếch', 'vi word from sprite id');
eq(I.name('en', 'word', 'animal_lion'), 'lion', 'en word from sprite id');
eq(I.name('vi', 'word', 'tiger'), 'hổ', 'vi word from an animal / en id');
eq(I.name('en', 'word', 'hổ'), 'tiger', 'en word from the vi word (same id)');
eq(I.name('vi', 'word', 'monkey'), 'khỉ', 'vi word for an animal without a vi initial word → bare animal name');
eq(I.name('en', 'word', 'banana_bunch'), 'banana bunch', 'unknown word id → readable string');
ok(I.words('en', 'color', 'blue').includes('blew'), 'blue/blew');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'dots', 3).includes('three dots') && I.words('vi', 'dots', 3).includes('ba cham'), 'dots words: "three dots", "ba cham"');
ok(I.words('vi', 'word', 'hổ').includes('con hổ') && I.words('vi', 'word', 'hổ').includes('ho'), 'vi word hổ accepts animal forms');
ok(I.words('en', 'size', 'small').includes('little') && I.words('en', 'size', 'small').includes('small'), 'size small words');
// initial words: the default list and a content-style list with arbitrary ids both work
for (const lang of I.langs) for (const e of sb.JT.WORDS[lang]) {
  eq(I.name(lang, 'word', e.word), e.word, `${lang} word ${e.word}`);
  ok(I.words(lang, 'word', e.word).length > 1, `${lang} words for word ${e.word} include the animal forms`);
  const first = e.word.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').charAt(0).toUpperCase();
  ok(first === e.initial, `${lang} word ${e.word} starts with ${e.initial} (tone marks ignored)`);
}
ok(!sb.JT.WORDS.vi.some(w => /^(ch|kh|nh|th|ph|tr|gh|ng)/.test(w.word)), 'vi default initial words skip digraphs (khỉ)');
(function () {
  const sbw = makeSandbox();
  sbw.JT = { WORDS: { en: [{ id: 'w_tiger', word: 'tiger', initial: 'T', sprite: 'animal_tiger' }, { id: 'w_leaf', word: 'leaf', initial: 'L' }],
    vi: [{ id: 'w_tiger', word: 'hổ', initial: 'H', sprite: 'animal_tiger' }, { id: 'w_leaf', word: 'lá', initial: 'L' }] } };
  const I2 = load(sbw, ['i18n.js']).I18N;
  eq(I2.name('en', 'word', 'w_leaf'), 'leaf', 'content word id → word (en)');
  eq(I2.name('vi', 'word', 'w_leaf'), 'lá', 'content word id → word (vi)');
  eq(I2.name('vi', 'word', 'leaf'), 'lá', 'en word → vi word via the shared id');
  ok(I2.words('vi', 'word', 'w_tiger').includes('cọp'), 'content word with an animal sprite accepts the animal forms');
  ok(I2.words('vi', 'word', 'w_leaf').includes('la'), 'content word: stripped form');
  eq(I2.sayStack('en', { nameKind: 'word', nameValue: 'w_leaf', n: 2, topic: 'initial', promptKey: 'p.initial', params: { letter: 'L' } }, r0),
    'L is for leaf!', 'sayStack with a content word id');
  eq(I2.sayWrong('vi', { nameKind: 'word', nameValue: 'w_tiger', topic: 'initial', promptKey: 'p.initial', params: { letter: 'L' } }, r0),
    'Tưng! Hổ, chữ H. Tìm chữ L nhé!', 'sayWrong uses the entry initial');
  sbw.JT.WORDS = [{ id: 'x1', en: 'egg', vi: { word: 'trứng', initial: 'T' } }];
  eq(I2.name('en', 'word', 'x1') + '/' + I2.name('vi', 'word', 'x1'), 'egg/trứng', 'array-of-{id, en, vi} word list');
})();
for (const lang of I.langs) for (const kind of I.NAME_KINDS) for (const v of [undefined, null, '', {}, 'zzz', -1, 999]) {
  let n, w;
  try { n = I.name(lang, kind, v); w = I.words(lang, kind, v); } catch (e) { n = null; }
  ok(typeof n === 'string' && Array.isArray(w), `${lang} name/words ${kind} ${JSON.stringify(v)} do not throw`);
}

// ------------------------------------------------------------------ tower lines
section('sayStack: SHORT exact lines (name + a tiny sound / praise word)');
const S = (lang, ev, r) => I.sayStack(lang, ev, r || r0);
eq(S('en', { nameKind: 'color', nameValue: 'red', n: 2 }), 'Red! Clonk!', 'en stack colour');
eq(S('vi', { nameKind: 'color', nameValue: 'red', n: 2 }), 'Màu đỏ! Cộp!', 'vi stack colour');
eq(S('en', { nameKind: 'shape', nameValue: 'star', n: 3 }, () => 0.5), 'Star! Yes!', 'en stack shape');
eq(S('vi', { nameKind: 'shape', nameValue: 'heart', n: 3 }), 'Hình trái tim! Cộp!', 'vi stack shape');
eq(S('en', { nameKind: 'dots', nameValue: 3, n: 2 }), 'Three dots! Clonk!', 'en stack dots');
eq(S('vi', { nameKind: 'dots', nameValue: 1, n: 2 }, () => 0.9), 'Đúng rồi, một chấm!', 'vi stack dots');
eq(S('en', { nameKind: 'number', nameValue: 3, n: 3, promptKey: 'p.countUp', params: { n: 3 } }), 'Three! Clonk!', 'en stack count-up');
eq(S('vi', { nameKind: 'number', nameValue: 3, n: 3, promptKey: 'p.countUp', params: { n: 3 } }), 'Số ba! Cộp!', 'vi stack count-up');
eq(S('en', { nameKind: 'animal', nameValue: 'monkey', n: 2 }), 'Monkey! Ooh-ooh!', 'en stack animal + sound');
eq(S('vi', { nameKind: 'animal', nameValue: 'monkey', n: 2 }), 'Con khỉ! Khẹc khẹc!', 'vi stack animal + sound');
eq(S('en', { nameKind: 'animal', nameValue: 'hippo', n: 2 }), 'Hippo! Clonk!', 'en stack hippo (no sound)');
eq(S('vi', { nameKind: 'animal', nameValue: 'hippo', n: 2 }), 'Con hà mã! Cộp!', 'vi stack hippo');
eq(S('en', { nameKind: 'animal', nameValue: 'lion', promptKey: 'p.sound', params: { animal: 'lion' } }), 'Roar! The lion!', 'en stack by sound');
eq(S('vi', { nameKind: 'animal', nameValue: 'lion', promptKey: 'p.sound', params: { animal: 'lion' } }), 'Gào gào! Là con sư tử!', 'vi stack by sound');
eq(S('en', { nameKind: 'size', nameValue: 'big' }), 'Big block! Clonk!', 'en stack size');
eq(S('vi', { nameKind: 'size', nameValue: 'small' }), 'Khối nhỏ! Cộp!', 'vi stack size');
eq(S('en', { nameKind: 'letter', nameValue: 'B' }), 'Letter B! Clonk!', 'en stack letter');
eq(S('vi', { nameKind: 'letter', nameValue: 'B' }), 'Chữ B! Cộp!', 'vi stack letter');
eq(V.spoken('vi', S('vi', { nameKind: 'letter', nameValue: 'B' })), 'Chữ bờ! Cộp!', 'vi stack letter spoken with phonics');
eq(S('en', { nameKind: 'letter', nameValue: 'b', topic: 'lower', promptKey: 'p.lower', params: { letter: 'B' } }), 'Small b! Clonk!', 'en stack lower');
eq(V.spoken('en', 'Small b! Clonk!'), 'Small bee! Clonk!', 'en small b spoken "small bee"');
eq(S('vi', { nameKind: 'letter', nameValue: 'b', topic: 'lower', promptKey: 'p.lower', params: { letter: 'B' } }), 'Chữ b thường! Cộp!', 'vi stack lower');
eq(S('en', { nameKind: 'word', nameValue: 'tiger', topic: 'initial', promptKey: 'p.initial', params: { letter: 'T' } }), 'T is for tiger!', 'en stack initial');
eq(V.spoken('en', 'T is for tiger!'), 'tee is for tiger!', 'en "T is for" spoken with the letter name');
eq(S('vi', { nameKind: 'animal', nameValue: 'snake', topic: 'initial', promptKey: 'p.initial', params: { letter: 'R' } }), 'Chữ R, rắn!', 'vi stack initial (animal block)');
eq(S('en', { nameKind: 'number', nameValue: 5, topic: 'add', promptKey: 'p.add', params: { a: 2, b: 3 } }), '2 + 3 is five!', 'en stack add');
eq(S('vi', { nameKind: 'number', nameValue: 4, topic: 'sub', promptKey: 'p.sub', params: { a: 7, b: 3, op: '−' } }), '7 − 3 bằng bốn!', 'vi stack sub');
eq(S('en', { nameKind: 'number', nameValue: 7, topic: 'oddeven', promptKey: 'p.oddeven', params: { parity: 'odd' } }), 'Seven is odd!', 'en stack oddeven');
eq(S('vi', { nameKind: 'number', nameValue: 8, topic: 'oddeven', promptKey: 'p.oddeven', params: { parity: 'even' } }), 'Tám là số chẵn!', 'vi stack oddeven');
eq(S('en', { block: { kind: 'color', value: 'green', color: 'green', nameKind: 'color', nameValue: 'green' } }), 'Green! Clonk!', 'stack from ev.block');
eq(V.spoken('en', S('en', { nameKind: 'animal', nameValue: 'tiger', promptKey: 'p.sound', params: { animal: 'tiger' } })), 'Grrr! The tiger!', 'en "grr" spoken as "grrr"');

section('sayTowerDone: count the whole tower, then the bananas');
eq(I.sayTowerDone('en', 4, r0), 'One, two, three, four! We reached the bananas!', 'en tower of 4');
eq(I.sayTowerDone('vi', 4, r0), 'Một, hai, ba, bốn! Tới chùm chuối rồi!', 'vi tower of 4');
eq(I.sayTowerDone('en', 1, r0), 'One! We reached the bananas!', 'en tower of 1');
eq(I.sayTowerDone('en', { n: 2 }, r9), 'One, two! Up to the bananas!', 'en {n} event + variant');
eq(I.sayTowerDone('en', null, r0), 'We reached the bananas!', 'no n → towerDone');
for (const lang of I.langs) for (let n = 1; n <= 6; n++) {
  const t = I.sayTowerDone(lang, n, r0);
  ok(clean(t) && positive(t) && nWords(t) <= 10, `${lang} sayTowerDone ${n}: ${t}`);
  ok(t.split(',').length === n, `${lang} sayTowerDone ${n} counts every block`);
}

section('sayWrong: SHORT exact lines (names what bounced, repeats the goal)');
const Wr = (lang, ev, r) => I.sayWrong(lang, ev, r || r0);
eq(Wr('en', { nameKind: 'color', nameValue: 'blue', want: { kind: 'color', value: 'red' }, promptKey: 'p.colors', params: { color: 'red' } }),
  'Boing! That’s blue. Find red!', 'en wrong colour');
eq(Wr('vi', { nameKind: 'color', nameValue: 'blue', want: { kind: 'color', value: 'red' }, promptKey: 'p.colors', params: { color: 'red' } }),
  'Tưng! Khối màu xanh dương. Tìm màu đỏ nhé!', 'vi wrong colour');
eq(Wr('en', { nameKind: 'shape', nameValue: 'oval', promptKey: 'p.shapes', params: { shape: 'star' } }), 'Boing! That’s an oval. Find the star!', 'en wrong shape (goal from params)');
eq(Wr('vi', { nameKind: 'shape', nameValue: 'circle', want: { kind: 'shape', value: 'star' } }), 'Tưng! Khối hình tròn. Tìm hình ngôi sao nhé!', 'vi wrong shape');
eq(Wr('en', { nameKind: 'dots', nameValue: 2, want: { kind: 'dots', value: 3 }, promptKey: 'p.count', params: { n: 3 } }), 'Boing! That’s two dots. Find three dots!', 'en wrong dots');
eq(Wr('vi', { nameKind: 'dots', nameValue: 2, promptKey: 'p.count', params: { n: 3 } }), 'Tưng! Hai chấm. Tìm ba chấm nhé!', 'vi wrong dots');
eq(Wr('en', { nameKind: 'number', nameValue: 3, promptKey: 'p.countUp', params: { n: 2 } }), 'Boing! That’s three. Find number two!', 'en wrong count-up');
eq(Wr('en', { nameKind: 'animal', nameValue: 'frog', want: { kind: 'animal', value: 'monkey' }, promptKey: 'p.animals', params: { animal: 'monkey' } }),
  'Boing! That’s the frog. Find the monkey!', 'en wrong animal');
eq(Wr('vi', { nameKind: 'animal', nameValue: 'frog', want: { kind: 'animal', value: 'monkey' } }), 'Tưng! Con ếch. Tìm con khỉ nhé!', 'vi wrong animal');
eq(Wr('en', { nameKind: 'animal', nameValue: 'frog', want: { kind: 'animal', value: 'lion' }, promptKey: 'p.sound', params: { animal: 'lion' } }),
  'Boing! That’s the frog. Who says roar?', 'en wrong sound ask (never names the answer)');
eq(Wr('vi', { nameKind: 'animal', nameValue: 'frog', promptKey: 'p.sound', params: { animal: 'lion' } }), 'Tưng! Con ếch. Con gì kêu gào gào?', 'vi wrong sound ask');
eq(Wr('en', { nameKind: 'size', nameValue: 'small', promptKey: 'p.size', params: { size: 'big' } }), 'Boing! That’s the small one. Find the big one!', 'en wrong size');
eq(Wr('vi', { nameKind: 'size', nameValue: 'small', promptKey: 'p.size', params: { size: 'big' } }), 'Tưng! Khối nhỏ. Tìm khối to nhé!', 'vi wrong size');
eq(Wr('en', { nameKind: 'letter', nameValue: 'C', promptKey: 'p.letters', params: { letter: 'B' } }), 'Boing! That’s letter C. Find letter B!', 'en wrong letter');
eq(Wr('vi', { nameKind: 'letter', nameValue: 'C', promptKey: 'p.letters', params: { letter: 'B' } }), 'Tưng! Chữ C. Tìm chữ B nhé!', 'vi wrong letter');
eq(Wr('en', { nameKind: 'letter', nameValue: 'd', topic: 'lower', promptKey: 'p.lower', params: { letter: 'B' } }), 'Boing! That’s small d. Find small b!', 'en wrong lower');
eq(Wr('vi', { nameKind: 'letter', nameValue: 'd', topic: 'lower', promptKey: 'p.lower', params: { letter: 'B' } }), 'Tưng! Chữ d thường. Tìm chữ b thường nhé!', 'vi wrong lower');
eq(Wr('en', { nameKind: 'word', nameValue: 'snake', topic: 'initial', promptKey: 'p.initial', params: { letter: 'T' } }),
  'Boing! S is for snake. Find letter T!', 'en wrong initial');
eq(Wr('vi', { nameKind: 'word', nameValue: 'snake', topic: 'initial', promptKey: 'p.initial', params: { letter: 'H' } }),
  'Tưng! Rắn, chữ R. Tìm chữ H nhé!', 'vi wrong initial');
eq(Wr('en', { nameKind: 'number', nameValue: 6, topic: 'add', promptKey: 'p.add', params: { a: 2, b: 3 } }), 'Boing! That’s six. What is 2 + 3?', 'en wrong add (answer not given away)');
eq(Wr('vi', { nameKind: 'number', nameValue: 6, topic: 'add', promptKey: 'p.add', params: { a: 2, b: 3 } }), 'Tưng! Số sáu. 2 + 3 bằng mấy?', 'vi wrong add');
eq(Wr('en', { nameKind: 'number', nameValue: 4, topic: 'oddeven', promptKey: 'p.oddeven', params: { parity: 'odd' } }), 'Boing! Four is even. Find an odd one!', 'en wrong oddeven');
eq(Wr('vi', { nameKind: 'number', nameValue: 4, topic: 'oddeven', promptKey: 'p.oddeven', params: { parity: 'odd' } }), 'Tưng! Bốn là số chẵn. Tìm số lẻ nhé!', 'vi wrong oddeven');
eq(Wr('en', { nameKind: 'number', nameValue: 1, topic: 'oddeven', promptKey: 'p.add', params: { a: 2, b: 1 } }), 'Boing! That’s one. What is 2 + 1?', 'en wrong: a sum ask inside the odd/even chapter');
eq(I.t('en', 'talk.count'), 'How many dots?', 'en talk.count');
eq(I.t('vi', 'talk.count'), 'Có mấy chấm nào?', 'vi talk.count');
ok(/^Boing! /.test(Wr('en', { nameKind: 'color', nameValue: 'blue', want: { kind: 'color', value: 'red' } }, () => 0.1)), 'wrong lines start with a bounce word');
ok(clean(Wr('en', {})) && clean(Wr('vi', null)), 'wrong without an event');

section('sayTap: just the name');
const Tp = (lang, k, v) => I.sayTap(lang, { nameKind: k, nameValue: v });
eq(Tp('en', 'color', 'blue'), 'Blue!', 'en tap colour'); eq(Tp('vi', 'color', 'blue'), 'Màu xanh dương!', 'vi tap colour');
eq(Tp('en', 'shape', 'triangle'), 'Triangle!', 'en tap shape'); eq(Tp('vi', 'shape', 'triangle'), 'Hình tam giác!', 'vi tap shape');
eq(Tp('en', 'dots', 1), 'One dot!', 'en tap dots'); eq(Tp('vi', 'dots', 4), 'Bốn chấm!', 'vi tap dots');
eq(Tp('en', 'number', 9), 'Nine!', 'en tap number'); eq(Tp('vi', 'number', 9), 'Số chín!', 'vi tap number');
eq(Tp('en', 'animal', 'parrot'), 'Parrot!', 'en tap animal'); eq(Tp('vi', 'animal', 'parrot'), 'Con vẹt!', 'vi tap animal');
eq(Tp('en', 'size', 'big'), 'Big block!', 'en tap size'); eq(Tp('vi', 'size', 'big'), 'Khối to!', 'vi tap size');
eq(Tp('en', 'letter', 'B'), 'Letter B!', 'en tap letter'); eq(Tp('vi', 'letter', 'b'), 'Chữ b thường!', 'vi tap small letter');
eq(Tp('en', 'sum', '2+3'), '2 + 3!', 'en tap sum'); eq(Tp('en', 'word', 'elephant'), 'Elephant!', 'en tap word');
eq(Tp('en', 'parity', 'odd'), 'Odd!', 'en tap parity'); eq(Tp('vi', 'parity', 'odd'), 'Số lẻ!', 'vi tap parity');
eq(I.sayGrab('en', { block: { kind: 'animal', value: 'tiger', animal: 'tiger', nameKind: 'animal', nameValue: 'tiger' } }), 'Tiger!', 'sayGrab = sayTap, from ev.block');

section('sayStack / sayWrong / sayTap for every topic and value (both languages)');
const ASK_SETS = {
  colors: COLORS.map(c => ({ promptKey: 'p.colors', params: { color: c }, kind: 'color', value: c })),
  shapes: SHAPES.map(s => ({ promptKey: 'p.shapes', params: { shape: s }, kind: 'shape', value: s })),
  size: ['big', 'small'].map(s => ({ promptKey: 'p.size', params: { size: s, color: 'red' }, kind: 'size', value: s })),
  count: Array.from({ length: 12 }, (_, i) => ({ promptKey: 'p.count', params: { n: i + 1 }, kind: 'dots', value: i + 1 }))
    .concat(Array.from({ length: 6 }, (_, i) => ({ promptKey: 'p.countUp', params: { n: i + 1 }, kind: 'number', value: i + 1 }))),
  animals: ANIMALS.map(a => ({ promptKey: 'p.animals', params: { animal: a }, kind: 'animal', value: a }))
    .concat(SOUND_ANIMALS.map(a => ({ promptKey: 'p.sound', params: { animal: a }, kind: 'animal', value: a }))),
  letters: LETTERS_EN.map(l => ({ promptKey: 'p.letters', params: { letter: l }, kind: 'letter', value: l })),
  lower: LETTERS_EN.map(l => ({ promptKey: 'p.lower', params: { letter: l, lower: l.toLowerCase() }, kind: 'letter', value: l.toLowerCase() })),
  initial: ANIMALS.map(a => ({ promptKey: 'p.initial', params: { letter: 'X' }, kind: 'word', value: a })),
  add: [[2, 3], [4, 4], [9, 9], [1, 0]].map(([a, b]) => ({ promptKey: 'p.add', params: { a, b, text: a + ' + ' + b }, kind: 'number', value: a + b })),
  sub: [[7, 2], [5, 5], [10, 1]].map(([a, b]) => ({ promptKey: 'p.sub', params: { a, b, text: a + ' − ' + b }, kind: 'number', value: a - b })),
  oddeven: [1, 2, 7, 12, 19, 20].map(n => ({ promptKey: 'p.oddeven', params: { parity: n % 2 ? 'odd' : 'even' }, kind: 'number', value: n }))
};
for (const topic of TOPICS) for (const lang of I.langs) {
  const set = ASK_SETS[topic];
  for (let i = 0; i < set.length; i++) {
    const a = set[i], other = set[(i + 1) % set.length];
    for (let v = 0; v < 3; v++) {
      const rng = () => (v + 0.5) / 3;
      const st = I.sayStack(lang, { topic, nameKind: a.kind, nameValue: a.value, n: 1 + (i % 5), promptKey: a.promptKey, params: a.params }, rng);
      ok(clean(st) && positive(st) && nWords(st) <= (lang === 'en' ? 6 : 8), `${lang} ${topic} stack ${a.value} is short: ${st}`);
      ok(!I.raw(lang, 'praise').includes(st), `${lang} ${topic} stack names something: ${st}`);
      const wr = I.sayWrong(lang, { topic, nameKind: other.kind, nameValue: other.value, want: { kind: a.kind, value: a.value },
        promptKey: a.promptKey, params: a.params, streak: v }, rng);
      ok(clean(wr) && positive(wr) && nWords(wr) <= (lang === 'en' ? 10 : 13), `${lang} ${topic} wrong ${other.value} for ${a.value} is short: ${wr}`);
      ok(wr.split(/[.!?]\s/).length >= 2, `${lang} ${topic} wrong names the block AND repeats the goal: ${wr}`);
      if (topic === 'add' || topic === 'sub') ok(!new RegExp('(^|[^\\p{L}])' + I.name(lang, 'number', a.value) + '([^\\p{L}]|$)', 'u').test(wr.split(I.name(lang, 'number', other.value)).join(' ')) || a.value === other.value, `${lang} ${topic} wrong never gives the answer: ${wr}`);
      if (a.promptKey === 'p.sound') ok(wr.toLowerCase().indexOf(I.name(lang, 'animal', a.value).replace(/^con /, '')) < 0, `${lang} sound wrong never names the answer: ${wr}`);
      const tp = I.sayTap(lang, { nameKind: a.kind, nameValue: a.value });
      ok(clean(tp) && positive(tp) && nWords(tp) <= 4, `${lang} ${topic} tap ${a.value}: ${tp}`);
    }
  }
}

section('garbage events never throw, never print junk');
for (const lang of I.langs) for (const fn of ['sayStack', 'sayWrong', 'sayTap', 'sayFound', 'sayGrab', 'sayMismatch'])
  for (const ev of [undefined, null, {}, 7, 'x', { nameKind: 'zzz', nameValue: {} }, { nameKind: 'color' }, { want: 3, params: 'x' },
    { nameKind: 'animal', nameValue: 'unicorn', n: 'x' }, { nameKind: 'number', nameValue: NaN, n: -2 }, { block: 5 }, { topic: 'add', params: { a: 'x' } }]) {
    let s;
    try { s = I[fn](lang, ev, r0); } catch (e) { s = 'THROW ' + e.message; }
    ok(clean(s) && positive(s), `${lang} ${fn}(${JSON.stringify(ev)}) → ${s}`);
  }

section('lines for every round content.js makes');
(function () {
  const sbc = makeSandbox();
  sbc.JT = {};
  let C, ok1 = true;
  try { C = load(sbc, ['rng.js', 'i18n.js', 'content.js']); } catch (e) { ok1 = false; console.log('   (content.js does not load yet: ' + e.message + ')'); }
  if (!ok1 || !C.Content || !C.Content.makeRound) return;
  const I3 = C.I18N;
  let probe = null;
  try { probe = C.Content.makeRound('colors', { age: 4, lang: 'en', rng: new C.RNG(1), roundIndex: 0 }); } catch (e) { /* old content */ }
  if (!probe || !Array.isArray(probe.asks) || !probe.asks[0] || !Array.isArray(probe.asks[0].choices)) {
    console.log('   (content.js still makes hide-and-seek rounds — tower round checks skipped; run again after the rewrite)');
    return;
  }
  ok(JSON.stringify(C.ANIMALS) === JSON.stringify(ANIMALS), 'content JT.ANIMALS = the jungle animals');
  if (C.ANIMAL_SOUND) for (const a of ANIMALS) eq(!!C.ANIMAL_SOUND[a], I3.hasSound(a), `content ANIMAL_SOUND agrees for ${a}`);
  for (const lang of I3.langs) {
    const list = Array.isArray(C.WORDS && C.WORDS[lang]) ? C.WORDS[lang] : [];
    for (const e of list) {
      const id = e.id != null ? e.id : e.word;
      const w = I3.name(lang, 'word', id);
      ok(clean(w), `${lang} content word ${JSON.stringify(id)} has a name (${w})`);
      ok(I3.words(lang, 'word', id).length > 0, `${lang} content word ${JSON.stringify(id)} has spoken forms`);
    }
  }
  const seen = new Set();
  let rounds = 0, lines = 0;
  for (let age = 3; age <= 7; age++) for (const lang of I3.langs) {
    const topics = TOPICS.filter(t => (C.AGE_TOPICS && Object.values(C.AGE_TOPICS).some(l => l.includes(t))) || true);
    for (const topic of topics) for (let ri = 0; ri < 4; ri++) for (let seed = 1; seed <= 3; seed++) {
      let r;
      try { r = C.Content.makeRound(topic, { age, lang, rng: new C.RNG(seed * 97 + ri + age * 13), roundIndex: ri, surprise: null }); }
      catch (e) { continue; }   // a topic that does not exist for this age
      if (!r || !Array.isArray(r.asks)) continue;
      rounds++;
      r.asks.forEach((ask, k) => {
        const P = I3.t(lang, ask.promptKey, ask.params, r0);
        ok(clean(P) && positive(P) && !I3.raw(lang, 'p.any').includes(P), `${lang} age ${age} ${topic} r${ri} prompt ${ask.promptKey} ${JSON.stringify(ask.params)}: ${P}`);
        const right = ask.choices[ask.answer];
        const base = { topic, promptKey: ask.promptKey, params: ask.params };
        const st = I3.sayStack(lang, Object.assign({ nameKind: right.nameKind, nameValue: right.nameValue, block: right, n: k + 1 }, base), r0);
        ok(clean(st) && positive(st) && !I3.raw(lang, 'praise').includes(st), `${lang} ${topic} stack: ${st}`);
        ask.choices.forEach((b, j) => {
          const key = lang + b.nameKind + JSON.stringify(b.nameValue);
          if (!seen.has(key)) {
            seen.add(key);
            checkNameWords(lang, b.nameKind, b.nameValue, ` (content ${topic})`);
          }
          const tp = I3.sayTap(lang, { nameKind: b.nameKind, nameValue: b.nameValue, block: b });
          ok(clean(tp) && !I3.raw(lang, 'praise').includes(tp), `${lang} ${topic} tap: ${tp}`);
          if (j === ask.answer) return;
          const wr = I3.sayWrong(lang, Object.assign({ nameKind: b.nameKind, nameValue: b.nameValue, block: b,
            want: { kind: ask.nameKind, value: ask.nameValue }, streak: 1 }, base), r0);
          ok(clean(wr) && positive(wr) && wr.split(/[.!?]\s/).length >= 2, `${lang} ${topic} wrong: ${wr}`);
          lines += 2;
        });
      });
    }
  }
  ok(rounds > 50, `content rounds checked (${rounds}, ${lines} lines)`);
  console.log(`   (content.js: ${rounds} tower rounds, ${lines} stack/wrong lines checked)`);
  for (let age = 3; age <= 7; age++) for (const lang of I3.langs) for (const topic of TOPICS) {
    let tk;
    try { tk = C.Content.makeTalk(topic, { age, lang, rng: new C.RNG(age * 7 + topic.length) }); } catch (e) { continue; }
    if (!tk) continue;
    const q = I3.t(lang, tk.promptKey, tk.params || {});
    ok(clean(q) && q !== tk.promptKey, `${lang} talk ${topic}: ${q}`);
    const ans = (tk.choices || []).find(c => c.id === tk.answerId) || {};
    const tw = I3.talkWrong(lang, ans.kind, ans.value);
    ok(clean(tw) && positive(tw), `${lang} talkWrong ${topic}: ${tw}`);
    for (const c of tk.choices || []) ok(I3.words(lang, c.kind, c.value).length > 0, `${lang} talk ${topic} choice ${c.value} has spoken forms`);
  }
})();

section('talkWrong');
eq(I.talkWrong('en', 'animal', 'elephant'), 'It is the elephant! Good try!', 'en talkWrong animal');
eq(I.talkWrong('vi', 'animal', 'parrot'), 'Là con vẹt đó! Bé cố gắng lắm!', 'vi talkWrong animal');
eq(I.talkWrong('en', 'shape', 'circle'), 'It is a circle! Good try!', 'en talkWrong shape');
eq(I.talkWrong('en', 'shape', 'oval'), 'It is an oval! Good try!', 'en talkWrong shape an');
eq(I.talkWrong('vi', { kind: 'color', value: 'blue' }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', 'number', 4), 'It is four! Good try!', 'en talkWrong number');
eq(I.talkWrong('vi', 'stars', 4), 'Là số bốn đó! Bé cố gắng lắm!', 'vi talkWrong stars');
eq(I.talkWrong('en', 'letter', 'B'), 'It is the letter B! Good try!', 'en talkWrong letter');
eq(I.talkWrong('en', 'letter', 'b'), 'It is small letter b! Good try!', 'en talkWrong small letter');
eq(I.talkWrong('vi', 'letter', 'b'), 'Là chữ b thường đó! Bé cố gắng lắm!', 'vi talkWrong small letter');
eq(I.talkWrong('vi', 'size', 'small'), 'Cái này nhỏ đó! Bé cố gắng lắm!', 'vi talkWrong size');
eq(I.talkWrong('en', 'dots', 3), 'It is three! Good try!', 'en talkWrong dots');
eq(I.talkWrong('en', 'parity', 'even'), 'It is even! Good try!', 'en talkWrong parity');
eq(I.talkWrong('vi', 'parity', 'odd'), 'Là số lẻ đó! Bé cố gắng lắm!', 'vi talkWrong parity');
for (const lang of I.langs) for (const kind of Object.keys(VALUES)) for (const v of VALUES[kind].slice(0, 12)) {
  const s = I.talkWrong(lang, kind, v);
  ok(clean(s) && positive(s), `${lang} talkWrong ${kind} ${v}: ${s}`);
}
ok(clean(I.talkWrong('en')) && clean(I.talkWrong('vi', {})), 'talkWrong without a value');

section('speech text: letters, maths, sounds; "Lulu" is spoken as written');
eq(I.speech('en', 'Find the letter B!'), 'Find the letter bee!', 'en letter speech');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');
eq(I.speech('en', '7 − 2'), '7 minus 2', 'en math speech');
eq(I.speech('en', 'Stack the big block!'), 'Stack the big block!', 'en "big block" is not a letter');
eq(I.speech('en', 'Stack the small letter b!'), 'Stack the small letter bee!', 'en small letter b');
eq(I.speech('en', 'The monkey! Ooh-ooh!'), 'The monkey! Ooh ooh!', 'en ooh-ooh spoken as two hoots');
eq(I.speech('en', 'Lulu’s Jungle Tower'), 'Lulu’s Jungle Tower', 'en title unchanged');
eq(V.spoken('vi', 'Chào bé! Mình là hươu Lulu.'), 'Chào bé! Mình là hươu Lulu.', 'vi spoken keeps "Lulu"');
eq(V.spoken('vi', 'Lulu gợi ý nè: chữ B!'), 'Lulu gợi ý nè: chữ bờ!', 'vi spoken: phonics only');
eq(V.spoken('en', 'Hi! I am Lulu.'), 'Hi! I am Lulu.', 'en spoken keeps Lulu');
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(!/Bim|Pip/.test(V.spoken(lang, s)), `${lang} ${k} spoken text has no older helper names`);

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
// jungle animals: every one of the 8 is distinguishable by its own name (EN + VI, with/without diacritics, classifiers)
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
for (const [said, want] of [['con khỉ', 'monkey'], ['khi', 'monkey'], ['chú khỉ', 'monkey'], ['voi', 'elephant'], ['con voi', 'elephant'],
  ['cọp', 'tiger'], ['con cop', 'tiger'], ['hổ', 'tiger'], ['chim vẹt', 'parrot'], ['vet', 'parrot'], ['sư tử', 'lion'],
  ['su tu', 'lion'], ['ếch', 'frog'], ['con ech', 'frog'], ['rắn', 'snake'], ['con ran', 'snake'], ['hà mã', 'hippo'], ['ha ma', 'hippo']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['a monkey', 'monkey'], ['elephants', 'elephant'], ['tiger cub', 'tiger'], ['a bird', 'parrot'], ['polly', 'parrot'],
  ['froggy', 'frog'], ['a lion', 'lion'], ['the snake', 'snake'], ['hippopotamus', 'hippo'], ['lion cub', 'lion']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['hello'], animEn), null, 'en unrelated → null');
// sound words are not animal names (no accidental match on "roar" / "gào gào")
eq(V.match(['roar'], ch('en', 'animal', ['lion', 'tiger', 'frog'])), null, '"roar" is not an animal name');
eq(V.match(['gào gào'], ch('vi', 'animal', ['lion', 'tiger', 'frog'])), null, 'vi "gào gào" is not an animal name');
eq(V.match(['cub'], ch('en', 'animal', ['lion', 'tiger'])), null, '"cub" alone is no animal (tiger/lion stay apart)');
eq(V.match(['ba chấm'], ch('vi', 'dots', [2, 3, 4])), '3', 'vi "ba chấm"');
eq(V.match(['three dots'], ch('en', 'dots', [2, 3, 4])), '3', 'en "three dots"');
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
eq(V.match(['tiger'], [{ id: 'c', kind: 'animal', value: 'tiger' }, { id: 'p', kind: 'animal', value: 'parrot' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['con vẹt'], [{ id: 'c', kind: 'animal', value: 'tiger' }, { id: 'p', kind: 'animal', value: 'parrot' }], 'vi'), 'p', '{id,kind,value} vi');
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
  sb4.JT = {};
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

  // drag (a block dragged up to the tower): every move of the active finger arrives, in logical px, then up
  const dc = new El('canvas'), dcalls = [];
  const winH = {};
  const sb7 = makeSandbox({ PointerEvent: function () {}, addEventListener(t, f) { (winH[t] = winH[t] || []).push(f); },
    removeEventListener(t, f) { winH[t] = (winH[t] || []).filter(x => x !== f); } });
  sb7.JT = {};
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

  // detach.cancel() (resize / rotation mid-drag): one cancel, later moves/ups of that finger are dropped
  const rc = new El('canvas'), rcalls = [];
  const hRc = IN.attach(rc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down: () => rcalls.push('down'), move: () => rcalls.push('move'),
    up: () => rcalls.push('up'), cancel: () => rcalls.push('cancel') });
  ok(typeof hRc === 'function' && typeof hRc.cancel === 'function' && typeof hRc.isActive === 'function', 'attach returns detach with cancel/isActive');
  rc.emit('pointerdown', pe(1, 5, 5)); ok(hRc.isActive(), 'isActive while a finger is down');
  rc.emit('pointermove', pe(1, 6, 6)); hRc.cancel(); hRc.cancel();
  rc.emit('pointermove', pe(1, 7, 7)); rc.emit('pointerup', pe(1, 7, 7));
  eq(rcalls.join(','), 'down,move,cancel', 'detach.cancel → one cancel, the rest of that finger is ignored');
  ok(!hRc.isActive(), 'isActive false after cancel');
  rc.emit('pointerdown', pe(2, 5, 5)); rc.emit('pointerup', pe(2, 5, 5));
  eq(rcalls.slice(-2).join(','), 'down,up', 'the next finger works after detach.cancel');
  // moves are delivered synchronously, one call per pointermove (no throttling) — 120 Hz worth of moves all arrive
  const fc = new El('canvas'); let fm = 0;
  IN.attach(fc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down() {}, move() { fm++; }, up() {} });
  fc.emit('pointerdown', pe(1, 0, 0));
  for (let k = 0; k < 120; k++) fc.emit('pointermove', pe(1, k, -k));
  eq(fm, 120, 'every pointermove reaches move() synchronously');
  fc.emit('pointerup', pe(1, 0, 0));

  // a finger resting still for ≥ 1.5 s (iPad thumb) is taken over by a new touch, even a second finger
  const tk = new El('canvas'), tkc = [];
  let clock = 0; IN._now = () => clock;
  IN.attach(tk, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down: (x) => tkc.push('down' + x), move: (x) => tkc.push('move' + x),
    up: (x) => tkc.push('up' + x), cancel: () => tkc.push('cancel') });
  tk.emit('pointerdown', pe(1, 100, 100));
  clock = 500; tk.emit('pointermove', pe(1, 105, 104));          // jitter < 20 px: still resting
  clock = 1000; tk.emit('pointerdown', pe(2, 300, 300, { isPrimary: false }));
  eq(tkc.join(','), 'down100,move105', 'a second finger 1 s after a still drag is still ignored');
  clock = 1600; tk.emit('pointerdown', pe(3, 400, 400, { isPrimary: false }));
  tk.emit('pointermove', pe(1, 110, 110)); tk.emit('pointerup', pe(1, 110, 110));    // the old thumb: ignored now
  tk.emit('pointermove', pe(3, 420, 380)); tk.emit('pointerup', pe(3, 420, 380));
  eq(tkc.join(','), 'down100,move105,cancel,down400,move420,up420', 'after 1.5 s still a new touch takes over (cancel, then down)');
  tkc.length = 0;
  tk.emit('pointerdown', pe(4, 100, 100));
  clock = 2000; tk.emit('pointermove', pe(4, 160, 100));         // a moving drag
  clock = 3000; tk.emit('pointermove', pe(4, 220, 100));
  clock = 3400; tk.emit('pointerdown', pe(5, 300, 300, { isPrimary: false }));
  eq(tkc.join(','), 'down100,move160,move220', 'a MOVING drag is never stolen');
  tk.emit('pointerup', pe(4, 220, 100));
  IN._now = null;
  ok(IN.STILL_MS === 1500 && IN.STILL_PX === 20, 'Input.STILL_MS / STILL_PX exported');

  // touch fallback (no PointerEvent)
  const sb5 = makeSandbox({ addEventListener() {}, removeEventListener() {} });
  sb5.JT = {};
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
  sb6.JT = {};
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
ok(sb.JT.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into JT.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof JT.Input.attach === 'function' && typeof JT.Input.kidProof === 'function' && typeof JT.Input.holdButton === 'function',
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
  sbx.JT = {};
  env.JT = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.JT.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Lulu: rate 0.9, pitch 1.2');
  ok(V2.RATE === 0.9 && V2.PITCH === 1.2, 'Voice.RATE / PITCH exported');
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
  // "Lulu" is spoken as written in both languages; the bubble text (onStart, log) is the same
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là hươu Lulu. Lulu giúp bé nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là hươu Lulu. Lulu giúp bé nhé!', 'vi utterance says "Lulu"');
  eq(startText, 'Mình là hươu Lulu. Lulu giúp bé nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('talk.animals', { animal: 'monkey' }, { lang: 'vi' });
  eq(sk.text, 'Con khỉ đâu rồi nhỉ?', 'sayKey renders the vi line');
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
  E3.JT.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['monkey', 'parrot', 'frog']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the parrot')] });
  eq((await pr2).id, 'parrot', 'interim match resolves after a short wait');
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
