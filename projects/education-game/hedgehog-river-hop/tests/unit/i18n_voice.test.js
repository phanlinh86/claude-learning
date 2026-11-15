#!/usr/bin/env node
// Nim's River Hop — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/hedgehog-river-hop:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (§5.1 content, §6 voice). When the river content.js exists
// (NH.Content making rounds with `rows` + `rule`), every prompt / Talk key + params it produces and the right line of
// every target / the wrong line of every other stone are rendered too. Exits non-zero on any failure.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const ROOT = path.join(__dirname, '..', '..');

function makeSandbox(extra) {
  const sb = Object.assign({ console, Math, Date, JSON, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { userAgent: 'node-test', platform: 'Linux', maxTouchPoints: 0 } }, extra || {});
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}
function load(sb, files) {
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sb, { filename: f });
  return sb.NH;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
// never negative (skill rule)
const NEG_EN = /\b(no|nope|wrong|incorrect|bad|fail|failed|mistake|oops|sorry|uh-oh|oh no|don’t|doesn’t)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|sai rồi|dở|tệ|hỏng|không đúng|chưa đúng|không phải|trật|nhầm|hư)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !/no!/i.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
// the sister game's world must not leak into this one (task rule): bubbles, popping, rainbow, Bao the panda, wand, clouds
const BANNED = /bubble|\bpop|rainbow|panda|\bwand\b|\bclouds?\b|bong bóng|cầu vồng|gấu trúc|Bảo|đám mây|\bchọc\b|\bbụp\b|whoosh/i;
function clean(s) { return !BANNED.test(s) && !/\bBao\b/.test(s); }
const r0 = () => 0, r5 = () => 0.5, r9 = () => 0.99;
const RNGS = [r0, r5, r9];
function tidy(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  if (/[{}]/.test(s) || /undefined|null|NaN|\[object/.test(s)) return false;
  if (/\s[!?.,]/.test(s) || /^[!?.,—]/.test(s) || /_/.test(s) || /\s{2}/.test(s)) return false;
  if (/màu màu|\bthe the\b|\bcon con\b|\ba the\b|\bthe a\b|hình hình|cái cái|chữ chữ|số số|nhỏ nhỏ|\bto to\b|hòn đá hòn đá|ở ở|sống sống|chấm chấm/i.test(s)) return false;
  if (/\ba [aeiou]/i.test(s.replace(/(letter|big|small|with|not|and|or) a /ig, ''))) return false;   // "a oval"
  if (/\ban [^aeiou\s]/i.test(s.replace(/(letter|big|small|with|not|and|or) an /ig, ''))) return false;
  if (!/^[\p{Lu}\d“"]/u.test(s.trim())) return false;                                              // capital first
  if (/[.!?] \p{Ll}/u.test(s)) return false;                                                        // capital after a stop
  return true;
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

// ------------------------------------------------------------------ DESIGN value lists (§5.1, §6)
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
const OBJS = ['flower', 'mushroom', 'leaf', 'ball', 'duck'];
const FRUITS = ['apple', 'pear', 'strawberry', 'mushroom', 'acorn'];
const ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
const HOME = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
  crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
const HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.countSeq', 'p.countSel', 'p.animal', 'p.home',
  'p.letters', 'p.lower', 'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const VI_NAMES = {
  obj: { flower: 'bông hoa', mushroom: 'cây nấm', leaf: 'chiếc lá', ball: 'quả bóng', duck: 'con vịt cao su' },
  fruit: { apple: 'quả táo', pear: 'quả lê', strawberry: 'quả dâu tây', mushroom: 'cây nấm', acorn: 'hạt dẻ' },
  animal: { cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', hen: 'con gà mái', horse: 'con ngựa',
    goat: 'con dê', crab: 'con cua', fishbowl: 'bể cá vàng', penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ' },
  home: { farm: 'nông trại', sea: 'biển', ice: 'xứ băng', savanna: 'đồng cỏ châu Phi', jungle: 'rừng rậm' },
  shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
    rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' },
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' },
  season: { spring: 'mùa xuân', summer: 'mùa hè', autumn: 'mùa thu', winter: 'mùa đông' }
};
const EN_HOME_AT = { farm: 'on the farm', sea: 'in the sea', ice: 'on the ice', savanna: 'on the savanna', jungle: 'in the jungle' };
// the initial-letter topic: bare noun first letter, diacritics → base letter
const INITIAL = {
  en: { cow: 'C', pig: 'P', sheep: 'S', duck: 'D', hen: 'H', horse: 'H', goat: 'G', crab: 'C', penguin: 'P', lion: 'L',
    monkey: 'M', fishbowl: 'G' },
  vi: { cow: 'B', pig: 'H', sheep: 'C', duck: 'V', hen: 'G', horse: 'N', goat: 'D', crab: 'C', penguin: 'C', lion: 'S',
    monkey: 'K', fishbowl: 'C' }
};
const OBJ_INITIAL = { en: { flower: 'F', mushroom: 'M', leaf: 'L', ball: 'B', duck: 'D' }, vi: { flower: 'H', mushroom: 'N', leaf: 'L', ball: 'B', duck: 'V' } };

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.NH = { debug: { voiceLog: [] } };
let NH;
try { NH = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = NH.I18N, V = NH.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  // the Apple novelty voice "Bubbles" is in voice.js's AVOID list; "speech bubble" is the DOM UI element
  const scan = src.split('\n').filter(l => !/var AVOID|^\s*'superstar'/.test(l)).join('\n').replace(/speech[ -]bubble/gi, '');
  ok(!/\bBao\b/.test(scan) && !/Bảo|panda|gấu trúc|bubble|rainbow|cầu vồng|bong bóng|\bwand\b/i.test(scan), `${f}: no sister-game names left (Bao / panda / bubble / rainbow / wand)`);
}
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.SHAPES.slice().sort()), JSON.stringify(SHAPES.slice().sort()), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.OBJS), JSON.stringify(OBJS), 'I18N.OBJS = DESIGN list');
eq(JSON.stringify(I.FRUITS), JSON.stringify(FRUITS), 'I18N.FRUITS = DESIGN list');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.HOMES), JSON.stringify(HOMES), 'I18N.HOMES = DESIGN list');
eq(JSON.stringify(I.ANIMAL_HOME), JSON.stringify(HOME), 'I18N.ANIMAL_HOME = NH.ANIMALS of DESIGN §5.1');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
eq(JSON.stringify(I.THING_KINDS), JSON.stringify(['obj', 'shape', 'dots', 'tile', 'animal']), 'I18N.THING_KINDS = DESIGN thing kinds');
eq(JSON.stringify(Object.keys(I.PROMPTS).sort()), JSON.stringify(PROMPT_KEYS.slice().sort()), 'I18N.PROMPTS = the DESIGN prompt keys');
// the functions main.js calls (task contract) + helpers
for (const fn of ['t', 'ask', 'sayRight', 'sayWrong', 'sayWrongHint', 'sayName', 'sayCount', 'sayCountRun', 'talkWrong',
  'choiceWords', 'name', 'words', 'setChild', 'sayFruit', 'initial', 'bareWord', 'initialOf', 'phrase', 'countList', 'seqList',
  'speech', 'has', 'keys', 'raw', 'kindValue', 'homeOf', 'numberName', 'stripMarks'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(JSON.stringify(enKeys), JSON.stringify(viKeys), 'en and vi have the same key set');
for (const k of enKeys) {
  eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `"${k}" has the same {params} in en and vi`);
  eq(Array.isArray(I.raw('vi', k)), Array.isArray(I.raw('en', k)), `"${k}" variant list in both or neither`);
  if (Array.isArray(I.raw('en', k))) eq(I.raw('vi', k).length, I.raw('en', k).length, `"${k}" same number of wordings in en and vi`);
}
const REQUIRED = ['hint', 'idle', 'praise', 'great', 'poke', 'party', 'session.done', 'ahead', 'bank', 'rise', 'wipe', 'fruit',
  'fruit.any', 'weather.0', 'weather.1', 'weather.2', 'weather.3', 'surprise.fish', 'fish.tap', 'surprise.frog', 'frog.tap',
  'surprise.snow', 'snow.tap', 'p.any', 'right.any', 'wrong.any', 'goal.any', 'right.thing', 'right.home', 'right.next',
  'right.last', 'wrong.is', 'wrong.dots', 'wrong.seq', 'goal.seq', 'goal.seqAny', 'wrong.hint',
  'talk.intro', 'talk.right', 'talk.color', 'talk.colors', 'talk.shape', 'talk.shapes', 'talk.count', 'talk.home',
  'talk.animals', 'talk.who', 'talk.letters', 'talk.lower', 'talk.initial', 'talk.add', 'talk.sub', 'talk.oddeven',
  'talk.wrong', 'talk.wrong.any', 'talk.wrong.home', 'talk.wrong.dots', 'talk.wrong.dot1']
  .concat(TOPICS.map(t => 'topic.' + t));
for (let i = 0; i <= 20; i++) REQUIRED.push('count.' + i);
for (const k of REQUIRED) ok(I.has('en', k) && I.has('vi', k), `key ${k} exists in both languages`);
for (const k of ['blow', 'enter', 'rainbow', 'whoosh', 'surprise.bird', 'bird.tap', 'surprise.kite', 'kite.tap', 'p.countPop'])
  ok(!I.has('en', k), `sister-game key ${k} is gone`);
// every prompt: 3 wordings + the first-time form; no plural forms (one target per row)
for (const k of PROMPT_KEYS) {
  for (const s of ['', '.first']) ok(I.has('en', k + s) && I.has('vi', k + s), `${k}${s} exists`);
  ok([].concat(I.raw('en', k)).length === 3 && [].concat(I.raw('vi', k)).length === 3, `${k} has 3 wordings`);
  ok(!I.has('en', k + '.many'), `${k} has no .many form (plural-neutral)`);
  ok([].concat(I.raw('en', k + '.first')).every(s => /^Let’s cross the brook!/.test(s)), `en ${k}.first starts "Let’s cross the brook!"`);
  ok([].concat(I.raw('vi', k + '.first')).every(s => /^Mình qua suối nào!/.test(s)), `vi ${k}.first starts "Mình qua suối nào!"`);
}
// ui keys used by index.html / ui.js / main.js / render.js
const UI_USED = new Set();
for (const f of ['index.html', 'js/ui.js', 'js/main.js', 'js/render.js']) {
  const p = path.join(ROOT, 'game', f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)) UI_USED.add(m[1]);
  for (const m of src.matchAll(/['"`](ui\.[A-Za-z.]+[A-Za-z])['"`]/g)) UI_USED.add(m[1]);
}
for (const k of UI_USED) if (!/^ui\.(tapBo|tapBao)$/.test(k)) ok(I.has('en', k) && I.has('vi', k), `UI key ${k} (used by the page) exists`);
for (const k of ['ui.title', 'ui.logo1', 'ui.logo2', 'ui.subtitle', 'ui.tagline', 'ui.play', 'ui.playAgain', 'ui.home', 'ui.paused',
  'ui.resume', 'ui.settings', 'ui.holdForParents', 'ui.age', 'ui.years', 'ui.language', 'ui.name', 'ui.namePlaceholder', 'ui.sound',
  'ui.music', 'ui.volume', 'ui.quieter', 'ui.louder', 'ui.voice', 'ui.mic', 'ui.done', 'ui.stars', 'ui.chapter', 'ui.allDone',
  'ui.welcome', 'ui.micUnsupported', 'ui.micDenied', 'ui.voiceMissing', 'ui.tapOrSay', 'ui.listening', 'ui.tapNim',
  'ui.tapHint', 'ui.doorHint', 'ui.skip', 'ui.gallery', 'ui.langName.en', 'ui.langName.vi'])
  ok(I.has('en', k) && I.has('vi', k), `ui key ${k} kept`);

section('titles, Nim, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.logo1'), 'Nim’s', 'en logo1');
eq(I.t('en', 'ui.logo2'), 'River Hop', 'en logo2');
eq(I.t('vi', 'ui.logo1'), 'Nhím Nim', 'vi logo1');
eq(I.t('vi', 'ui.logo2'), 'Nhảy Đá Qua Suối', 'vi logo2');
eq(I.t('en', 'ui.voice'), 'Nim’s voice', 'en ui.voice');
eq(I.t('vi', 'ui.voice'), 'Giọng của Nim', 'vi ui.voice');
eq(I.t('en', 'ui.title'), 'Nim’s River Hop', 'en title');
eq(I.t('vi', 'ui.title'), 'Nhím Nim Nhảy Đá Qua Suối', 'vi title');
ok(/Nim/.test(I.t('vi', 'ui.listening')) && /Nim/.test(I.t('en', 'ui.listening')), 'listening names Nim');
for (const k of viKeys) {
  if (/^(ui\.langName|count\.[0-9]+$|ui\.logo|ui\.stars)/.test(k)) continue;
  const v = [].concat(I.raw('vi', k)).join(' ');
  if (/^[\d\s{}a-z+−?!.,]*$/i.test(v)) continue;
  ok(VI_DIACRITIC.test(v) || /^[A-Za-z]+[!.]?$/.test(v), `vi "${k}" has Vietnamese diacritics: ${v}`);
}
for (const k of viKeys) for (const s of [].concat(I.raw('vi', k))) {
  // the helper is "Nim" in lines; "Nhím Nim" only in titles; never "con nhím Nim" twice etc.
  ok(!/Nhím Nim/.test(s) || /^ui\.(title|logo1)$/.test(k), `vi "${k}": "Nhím Nim" only in titles: ${s}`);
}
for (const k of PROMPT_KEYS) {
  const all = [].concat(I.raw('vi', k), I.raw('vi', k + '.first')).join(' | ');
  ok(/(Bé|bé)/.test(all) && /(nhé|nhỉ|nào)/.test(all), `vi ${k} is warm (bé … nhé / nhỉ / nào): ${all}`);
  ok(/nhảy|Nhảy/.test(all), `vi ${k} talks about hopping: ${all}`);
  ok(/[Hh]op/.test([].concat(I.raw('en', k)).join(' ')), `en ${k} talks about hopping`);
}
// classifiers (DESIGN §6)
for (const [o, cl] of Object.entries({ flower: 'bông hoa', mushroom: 'cây nấm', leaf: 'chiếc lá', ball: 'quả bóng', duck: 'con vịt cao su' }))
  eq(I.name('vi', 'obj', o), cl, `vi classifier ${o}`);
ok(/hòn đá/.test([].concat(I.raw('vi', 'p.colors')).join(' ')), 'vi prompts say "hòn đá"');
ok(/suối/.test(I.t('vi', 'bank', null, r0)), 'vi bank says "suối"');

section('no negative words, no sister-game words in any line');
for (const l of I.langs) for (const k of I.keys(l)) for (const s of [].concat(I.raw(l, k))) {
  ok(positive(s), `${l} ${k} positive: ${s}`);
  ok(clean(s), `${l} ${k} has no bubble / pop / rainbow / Bao / panda / wand / cloud words: ${s}`);
  if (!/^ui\./.test(k)) ok(!/\bnot\b/i.test(s), `${l} ${k}: the game never asks with "not": ${s}`);
}

section('every string renders: no "{" left, tidy punctuation, the child name');
const SAMPLE = { n: 3, k: 2, stars: 9, color: 'red', shape: 'star', size: 'big', animal: 'penguin', home: 'ice', letter: 'B',
  lower: 'b', parity: 'even', a: 2, b: 3, word: 'cow', answer: 'red', thing: { kind: 'obj', obj: 'flower', color: 'red' },
  who: 'penguin', what: '4 dots', expr: '2+3', ans: '5', num: 'three', first: 'B', season: 'winter', fruit: 'apple',
  got: 4, want: 2 };
for (const l of I.langs) for (const k of I.keys(l)) for (const rng of RNGS) for (const child of ['', 'Mai']) {
  const s = I.t(l, k, Object.assign({ child }, SAMPLE), rng);
  ok(tidy(s) || /^(ui\.(langName|years|namePlaceholder|stars)|ui\.logo)/.test(k) || /^Ví dụ|^e\.g\./.test(s), `${l} ${k} renders tidy (child "${child}"): ${s}`);
  ok(!/\{|\}|undefined|NaN/.test(s), `${l} ${k} has no raw params: ${s}`);
  ok(clean(s), `${l} ${k} rendered line is clean: ${s}`);
  if (!child) ok(!/friend|Mai/.test(s) || k === 'ui.namePlaceholder' || /friends? who/.test(s), `${l} ${k} without a name reads naturally: ${s}`);
}
for (const k of ['great', 'idle', 'session.done', 'talk.right', 'ui.welcome', 'fruit']) {
  const pool = [].concat(I.raw('en', k));
  for (let i = 0; i < 20; i++) {
    for (const l of I.langs) {
      const s = I.t(l, k, { child: '', stars: 5, fruit: 'pear' }, () => i / 20);
      ok(!/\bfriend\b|bé bé|,\s*!/.test(s) && tidy(s), `${l} ${k} with an empty name: ${s}`);
    }
  }
  ok(pool.some(s => /\{child\}/.test(s)), `${k} has a {child} variant`);
}
I.setChild('Mai');
ok(/Mai/.test(I.t('en', 'ui.welcome')), 'setChild → the welcome greets the child');
ok(/bé Mai/.test(I.t('vi', 'ui.welcome')), 'vi welcome "bé Mai"');
ok(/Mai/.test(I.sayFruit('en', 'apple', r9)), 'setChild → sayFruit can praise the child');
I.setChild('');
ok(!/Mai|friend/.test(I.t('en', 'ui.welcome')), 'empty child → welcome without a name');
ok(!/Mai|friend/.test(I.sayFruit('en', 'apple', r9)), 'empty child → sayFruit without a name');

section('prompts: DESIGN examples, every prompt key × value × first × wording');
eq(I.ask('en', 'p.colors', { color: 'red' }, { first: true }), 'Let’s cross the brook! Hop on the RED stones!', 'en first colours (DESIGN §6)');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { first: true }), 'Mình qua suối nào! Bé chọn hòn đá có màu ĐỎ nhé!', 'vi first colours (REQUIREMENT)');
eq(I.ask('en', 'p.colors', { color: 'red' }, { rng: r0 }), 'Hop on the red ones!', 'en colours');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { rng: r0 }), 'Bé nhảy lên những hòn đá màu đỏ nhé!', 'vi colours (DESIGN §6)');
eq(I.ask('en', 'p.colors', { color: 'red', k: 3 }, { rng: r0 }), 'Hop on the red ones!', 'k is ignored (plural-neutral)');
eq(I.ask('en', 'p.countSeq', { n: 3 }, { rng: r0 }), 'Hop 1, 2, 3!', 'en countSeq (DESIGN §6)');
eq(I.ask('vi', 'p.countSeq', { n: 3 }, { rng: r0 }), 'Nhảy 1, 2, 3 nào!', 'vi countSeq (REQUIREMENT)');
eq(I.ask('en', 'p.countSeq', { n: 4 }, { rng: r0 }), 'Hop 1, 2, 3, 4!', 'en countSeq lists 1..n');
eq(I.ask('en', 'p.countSel', { n: 4 }, { rng: r0 }), 'Hop on the stones with 4 dots!', 'en countSel (DESIGN §6)');
eq(I.ask('vi', 'p.countSel', { n: 4 }, { rng: r0 }), 'Bé nhảy lên hòn đá có 4 chấm nhé!', 'vi countSel');
eq(I.ask('en', 'p.countSel', { n: 1 }, { rng: r0 }), 'Hop on the stones with 1 dot!', 'en countSel singular dot');
eq(I.ask('en', 'p.animal', { animal: 'cow' }, { rng: r0 }), 'Hop to the cow!', 'en animal (DESIGN §6)');
eq(I.ask('en', 'p.home', { home: 'farm' }, { rng: r0 }), 'Who lives on the farm? Hop on them!', 'en home (REQUIREMENT)');
eq(I.ask('vi', 'p.home', { home: 'farm' }, { rng: r0 }), 'Ai sống ở nông trại? Bé nhảy lên nào!', 'vi home (REQUIREMENT)');
eq(I.ask('en', 'p.shapes', { shape: 'star' }, { rng: r0 }), 'Hop on the stars!', 'en shapes plural-neutral');
eq(I.ask('en', 'p.size', { big: false }, { rng: r0 }), 'Hop on the little ones!', 'en size little');
eq(I.ask('vi', 'p.size', { big: true }, { rng: r0 }), 'Bé nhảy lên cái to nhé!', 'vi size');
eq(I.ask('en', 'p.oddeven', { parity: 'even' }, { rng: r0 }), 'Hop on the even numbers!', 'en odd/even');
eq(I.ask('en', 'p.colors', {}, { rng: r0 }), 'Hop on a stone!', 'missing param → p.any');
eq(I.ask('en', 'p.nothing', { color: 'red' }, { rng: r0 }), 'Hop on a stone!', 'unknown prompt → p.any');
eq(I.ask('en', 'p.countSeq', { n: 0 }, { rng: r0 }), 'Hop on a stone!', 'countSeq n 0 → p.any');
const PROMPT_VALUES = {
  'p.colors': COLORS.map(c => ({ color: c })), 'p.shapes': SHAPES.map(s => ({ shape: s })), 'p.shapes5': SHAPES.map(s => ({ shape: s })),
  'p.size': [{ big: true }, { big: false }], 'p.countSeq': [1, 2, 3, 4, 5].map(n => ({ n })),
  'p.countSel': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ n })), 'p.animal': ANIMALS.map(a => ({ animal: a })),
  'p.home': HOMES.map(h => ({ home: h })), 'p.letters': LETTERS.map(x => ({ letter: x })), 'p.lower': LETTERS.map(x => ({ letter: x })),
  'p.initial': LETTERS.map(x => ({ letter: x })), 'p.add': [2, 5, 10, 14, 20].map(n => ({ n })), 'p.sub': [0, 1, 3, 7].map(n => ({ n })),
  'p.oddeven': [{ parity: 'odd' }, { parity: 'even' }]
};
let nPrompts = 0;
for (const pk of PROMPT_KEYS) for (const l of I.langs) for (const base of PROMPT_VALUES[pk]) for (const first of [false, true]) for (const rng of RNGS) for (const child of ['', 'Mai']) {
  const params = Object.assign({ k: 3, child }, base);
  const s = I.ask(l, pk, params, { first, rng }); nPrompts++;
  ok(tidy(s) && positive(s) && clean(s), `${l} ${pk} ${JSON.stringify(base)} first ${first}: ${s}`);
  ok(!/\{|undefined|NaN|null/.test(s), `${l} ${pk} no leftovers: ${s}`);
  ok(!/^(Hop on a stone!|Which stone will you hop on\?|Hop, hop! Find the next stone!|Bé nhảy lên một hòn đá nhé!|Bé nhảy lên hòn đá nào nhỉ\?|Nhảy nhảy! Bé tìm)/.test(s), `${l} ${pk} uses its own wording: ${s}`);
  if (first) ok(/^(Let’s cross the brook!|Mình qua suối nào!)/.test(s), `${l} ${pk} first form: ${s}`);
  if (pk === 'p.colors' && l === 'vi') ok(s.includes(first ? 'màu ' + I.name('vi', 'hue', base.color).toUpperCase() : I.name('vi', 'color', base.color)), `vi colours names the colour: ${s}`);
  if (pk === 'p.colors' && l === 'en') ok(s.toLowerCase().includes(base.color), `en colours names the colour: ${s}`);
  if (pk === 'p.home') ok(s.includes(l === 'en' ? EN_HOME_AT[base.home] : 'sống ở ' + VI_NAMES.home[base.home]), `${l} home preposition: ${s}`);
  if (pk === 'p.countSel' && l === 'en') ok(/\b1 dot\b/.test(s) === (base.n === 1), `en countSel dot/dots: ${s}`);
  if (pk === 'p.countSel') ok(/dot|chấm/.test(s) && s.includes(String(base.n)), `${l} countSel names n dots: ${s}`);
  if (pk === 'p.countSeq') { const list = Array.from({ length: base.n }, (_, i) => i + 1).join(', '); ok(s.includes(list) && !s.includes(list + ', ' + (base.n + 1)), `${l} countSeq lists 1..${base.n}: ${s}`); }
  if (pk === 'p.letters' || pk === 'p.initial') ok(s.includes(base.letter), `${l} ${pk} names the letter: ${s}`);
  if (pk === 'p.lower') ok(s.includes(base.letter.toUpperCase()) && s.includes(base.letter.toLowerCase()), `${l} lower names both forms: ${s}`);
  if (pk === 'p.animal') ok(s.toLowerCase().includes(I.name(l, 'animal', base.animal).toLowerCase()), `${l} animal named: ${s}`);
}
console.log(`   (${nPrompts} prompts rendered)`);
// the three wordings differ
for (const pk of PROMPT_KEYS) for (const l of I.langs) {
  const p = Object.assign({}, PROMPT_VALUES[pk][1] || PROMPT_VALUES[pk][0]);
  const set = new Set(RNGS.map(r => I.ask(l, pk, p, { rng: r })));
  ok(set.size === 3, `${l} ${pk}: 3 different wordings (${[...set].join(' / ')})`);
}

section('names for every kind × value (DESIGN §6)');
for (const l of I.langs) {
  for (const c of COLORS) ok(I.name(l, 'color', c).length > 0 && I.name(l, 'color', c) !== c || l === 'en', `${l} color ${c}`);
  for (const s of SHAPES) ok(I.name(l, 'shape', s).length > 0, `${l} shape ${s}`);
  for (const a of ANIMALS) ok(I.name(l, 'animal', a).length > 0, `${l} animal ${a}`);
  for (const o of OBJS) ok(I.name(l, 'obj', o).length > 0 && I.name(l, 'obj', o) === I.name(l, 'toy', o), `${l} obj ${o}`);
  for (const f of FRUITS) ok(I.name(l, 'fruit', f).length > 0, `${l} fruit ${f}`);
  for (const h of HOMES) ok(I.name(l, 'home', h).length > 0 && I.name(l, 'homeAt', h).length > 0 && I.name(l, 'lives', h).length > 0, `${l} home ${h}`);
  for (let n = 0; n <= 20; n++) ok(I.name(l, 'number', n).length > 0 && !/\d/.test(I.name(l, 'number', n)), `${l} number ${n}: ${I.name(l, 'number', n)}`);
  for (const x of LETTERS) eq(I.name(l, 'letter', x), x, `${l} letter ${x}`);
  for (const p of ['odd', 'even']) ok(I.name(l, 'parity', p).length > 0, `${l} parity ${p}`);
  for (let i = 0; i < 4; i++) ok(I.name(l, 'season', i) === I.name(l, 'season', SEASONS[i]) && I.name(l, 'season', i).length > 0, `${l} season ${i}`);
  ok(/plus|cộng/.test(I.name(l, 'sum', '2+3')) && /minus|trừ/.test(I.name(l, 'diff', '7−4')), `${l} sum / diff`);
  for (const a of ANIMALS) ok(I.name(l, 'word', a).length > 0, `${l} word ${a}`);
}
for (const k of Object.keys(VI_NAMES)) for (const v of Object.keys(VI_NAMES[k])) eq(I.name('vi', k, v), VI_NAMES[k][v], `vi ${k} ${v}`);
for (const h of HOMES) { eq(I.name('en', 'homeAt', h), EN_HOME_AT[h], `en homeAt ${h}`); eq(I.name('vi', 'lives', h), 'sống ở ' + VI_NAMES.home[h], `vi lives ${h}`); }
eq(I.name('en', 'lives', 'ice'), 'lives on the ice', 'en lives on the ice');
eq(I.name('en', 'dots', 4), '4 dots', 'en dots'); eq(I.name('vi', 'dots', 4), '4 chấm', 'vi dots'); eq(I.name('en', 'dots', 1), '1 dot', 'en 1 dot');
// thing names
eq(I.name('en', 'thing', { kind: 'obj', obj: 'flower', color: 'red' }), 'red flower', 'en thing red flower');
eq(I.name('vi', 'thing', { kind: 'obj', obj: 'flower', color: 'red' }), 'bông hoa màu đỏ', 'vi thing bông hoa màu đỏ (DESIGN §6)');
eq(I.phrase('en', { kind: 'obj', obj: 'flower', color: 'red' }, { art: 'a' }), 'a red flower', 'en "a red flower" (task)');
eq(I.name('en', 'thing', { kind: 'dots', n: 4 }), '4 dots', 'en thing 4 dots');
eq(I.name('vi', 'thing', { kind: 'dots', n: 4 }), '4 chấm', 'vi thing 4 chấm');
eq(I.name('en', 'thing', { kind: 'dots', n: 1 }), '1 dot', 'en thing 1 dot');
eq(I.name('en', 'thing', { kind: 'shape', shape: 'star', color: 'blue' }), 'blue star', 'en thing blue star');
eq(I.name('vi', 'thing', { kind: 'shape', shape: 'star', color: 'blue' }), 'ngôi sao màu xanh dương', 'vi thing ngôi sao màu xanh dương');
eq(I.name('en', 'thing', { kind: 'obj', obj: 'mushroom', color: 'green', big: false }), 'little green mushroom', 'en little mushroom');
eq(I.name('vi', 'thing', { kind: 'obj', obj: 'mushroom', color: 'green', big: false }), 'cây nấm nhỏ màu xanh lá', 'vi nấm nhỏ');
eq(I.name('vi', 'thing', { kind: 'obj', obj: 'duck', color: 'yellow' }), 'con vịt cao su màu vàng', 'vi rubber duck stays apart from the animal');
eq(I.name('en', 'thing', { kind: 'tile', text: 'a' }), 'small a', 'en tile small a');
eq(I.name('vi', 'thing', { kind: 'tile', text: 'B' }), 'chữ B', 'vi tile chữ B');
eq(I.name('en', 'thing', { kind: 'tile', text: '3+2' }), '3 + 2', 'en tile 3 + 2');
eq(I.name('vi', 'thing', { kind: 'animal', animal: 'penguin' }), 'chim cánh cụt', 'vi animal thing');
eq(I.phrase('en', { kind: 'obj', obj: 'leaf', color: 'orange' }, { art: 'a' }), 'an orange leaf', 'en an orange leaf');
eq(I.sayName('en', { kind: 'animal', animal: 'cow' }), 'the cow', 'sayName the cow');
eq(I.sayName('vi', { kind: 'obj', obj: 'ball', color: 'red' }), 'quả bóng màu đỏ', 'sayName vi');
eq(I.sayName('en', { kind: 'toy', obj: 'ball', color: 'red' }), 'the red ball', 'legacy kind toy still named');
eq(I.sayName('en', { kind: 'stars', n: 3 }), '3 dots', 'legacy kind stars → dots');
for (const l of I.langs) {
  for (const o of OBJS) for (const c of COLORS) for (const big of [true, false, undefined]) {
    const s = I.name(l, 'thing', { kind: 'obj', obj: o, color: c, big });
    ok(s.includes(I.name(l, 'obj', o)) && s.includes(I.name(l, 'color', c)), `${l} obj thing ${o} ${c}: ${s}`);
    if (l === 'vi') ok(s.indexOf(VI_NAMES.obj[o]) === 0, `vi colour after the noun: ${s}`);
  }
  for (const sh of SHAPES) for (const c of COLORS) ok(I.name(l, 'thing', { kind: 'shape', shape: sh, color: c }).length > 3, `${l} shape thing ${sh} ${c}`);
  for (let n = 1; n <= 12; n++) ok(new RegExp('^' + n + ' (dots?|chấm)$').test(I.name(l, 'thing', { kind: 'dots', n })), `${l} dots ${n}`);
}

section('initial(): first letter of the bare noun, both languages');
for (const l of I.langs) {
  for (const a of ANIMALS) eq(I.initial(l, 'animal', a), INITIAL[l][a], `${l} initial ${a}`);
  for (const a of ANIMALS) eq(I.initial(l, { kind: 'animal', animal: a }), INITIAL[l][a], `${l} initial(thing) ${a}`);
  for (const o of OBJS) eq(I.initial(l, { kind: 'obj', obj: o, color: 'red' }), OBJ_INITIAL[l][o], `${l} initial obj ${o}`);
  for (const o of OBJS) eq(I.initial(l, 'obj', o), OBJ_INITIAL[l][o], `${l} initial('obj') ${o}`);
}
eq(I.bareWord('vi', { kind: 'obj', obj: 'flower' }), 'hoa', 'vi bare word without classifier');
eq(I.bareWord('vi', 'animal', 'cow'), 'bò', 'vi bare animal');

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
for (const l of I.langs) {
  for (const [kind, vals] of [['color', COLORS], ['shape', SHAPES], ['obj', OBJS], ['fruit', FRUITS], ['animal', ANIMALS], ['home', HOMES],
    ['parity', ['odd', 'even']], ['size', ['big', 'small']], ['season', SEASONS], ['letter', LETTERS.slice(0, 10)]]) {
    const seen = {};
    for (const v of vals) {
      const ws = I.words(l, kind, v);
      ok(ws.length > 0 && ws.every(w => w === w.toLowerCase()), `${l} words ${kind} ${v} lower-case`);
      if (l === 'vi' && kind !== 'letter') ok(ws.some(w => VI_DIACRITIC.test(w)) && ws.some(w => w === I.stripMarks(w)) || ws.every(w => !VI_DIACRITIC.test(w)), `vi words ${kind} ${v}: with AND without diacritics`);
      for (const w of ws) { ok(!seen[w] || seen[w] === v, `${l} ${kind}: "${w}" belongs to ${seen[w]} and ${v}`); seen[w] = v; }
    }
    const C = ch(l, kind, vals);
    for (const v of vals) {
      const nm = I.name(l, kind, v);
      eq(V.match([nm], C, l), String(v), `${l} matcher: "${nm}" → ${kind} ${v}`);
      eq(V.match([I.stripMarks(nm)], C, l), String(v), `${l} matcher: no diacritics "${I.stripMarks(nm)}" → ${v}`);
    }
  }
  const NC = ch(l, 'number', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (let n = 1; n <= 12; n++) {
    eq(V.match([String(n)], NC, l), String(n), `${l} digit ${n}`);
    eq(V.match([I.name(l, 'number', n)], NC, l), String(n), `${l} number word ${n}`);
    eq(V.match([I.stripMarks(I.name(l, 'number', n))], NC, l), String(n), `${l} number word without diacritics ${n}`);
  }
  ok(I.words(l, 'number', 3).includes('3'), `${l} digits accepted`);
  ok(I.words(l, 'dots', 4).includes(l === 'en' ? '4 dots' : '4 chấm'), `${l} "4 dots" accepted`);
}
// fuzzy recognition: noisy kid answers, both languages (numbers, colours, homes)
const FUZZY = [
  ['en', 'number', [2, 3, 4], 'um four', '4'], ['en', 'number', [2, 3, 4], 'it is 3 dots', '3'], ['en', 'number', [2, 3, 4], 'to', '2'],
  ['en', 'number', [3, 5, 8], 'ate', '8'], ['en', 'color', ['red', 'blue', 'green'], 'the red one', 'red'],
  ['en', 'color', ['red', 'blue', 'green'], 'blew', 'blue'], ['en', 'color', ['yellow', 'purple', 'pink'], 'purpl', 'purple'],
  ['en', 'home', ['farm', 'ice', 'jungle'], 'jungles', 'jungle'], ['en', 'home', ['farm', 'sea', 'ice'], 'the ocean', 'sea'],
  ['en', 'home', ['farm', 'ice', 'savanna'], 'africa', 'savanna'],
  ['vi', 'number', [2, 3, 4], 'bon', '4'], ['vi', 'number', [2, 3, 4], 'số ba', '3'], ['vi', 'number', [10, 11, 12], 'muoi hai', '12'],
  ['vi', 'number', [4, 5, 6], 'có năm chấm', '5'], ['vi', 'color', ['red', 'blue', 'green'], 'mau do', 'red'],
  ['vi', 'color', ['red', 'blue', 'green'], 'xanh duong', 'blue'], ['vi', 'color', ['red', 'blue', 'green'], 'xanh lá cây', 'green'],
  ['vi', 'home', ['farm', 'ice', 'jungle'], 'o nong trai', 'farm'], ['vi', 'home', ['farm', 'ice', 'jungle'], 'xu bang', 'ice'],
  ['vi', 'home', ['sea', 'savanna', 'jungle'], 'trong rung', 'jungle']
];
for (const [l, kind, vals, said, want] of FUZZY) eq(V.match([said], ch(l, kind, vals), l), want, `${l} fuzzy "${said}" → ${kind} ${want}`);
eq(V.match(['banana'], ch('en', 'color', ['red', 'blue']), 'en'), null, 'unrelated word → no match');
ok(I.words('vi', 'home', 'jungle').includes('rung ram'), 'vi no-diacritic home');
ok(I.words('en', 'obj', 'duck').includes('rubber duck'), 'en rubber duck accepted');
ok(I.words('vi', 'obj', 'ball').includes('qua bong'), 'vi "qua bong" accepted');
ok(I.words('vi', 'obj', 'flower').includes('bong hoa'), 'vi "bong hoa" accepted');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'color', color: 'red' } }).includes('red'), 'choiceWords colour blob');
ok(I.choiceWords('vi', { id: 'a', thing: { kind: 'home', home: 'ice' } }).includes('xứ băng'), 'choiceWords home badge');
ok(I.choiceWords('vi', { id: 'a', thing: { kind: 'home', home: 'ice' } }).includes('xu bang'), 'choiceWords home badge without diacritics');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'number', n: 4 } }).includes('four'), 'choiceWords number');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'dots', n: 4 } }).includes('4'), 'choiceWords dots thing');
ok(I.choiceWords('vi', { id: 'a', thing: { kind: 'dots', n: 4 } }).includes('bon'), 'choiceWords vi dots without diacritics');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'animal', animal: 'pig' } }).includes('piggy'), 'choiceWords animal');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'shape', shape: 'triangle', color: 'red' } }).includes('triangle'), 'choiceWords shape');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'obj', obj: 'leaf', color: 'red' } }).includes('leaf'), 'choiceWords obj');

section('game lines: sayRight / sayWrong / sayFruit for every thing kind (DESIGN §6 examples)');
const R = (o) => Object.assign({ mode: 'match' }, o);
eq(I.sayRight('en', R({ thing: { kind: 'obj', obj: 'flower', color: 'red' }, left: 1, k: 2, row: 0, rule: { kind: 'color', value: 'red' } }), r0), 'A red flower! Next one!', 'en right + next (task)');
eq(I.sayRight('vi', R({ thing: { kind: 'obj', obj: 'flower', color: 'red' }, left: 1, k: 2, row: 0, rule: { kind: 'color', value: 'red' } }), r0), 'Bông hoa màu đỏ!', 'vi right mid-crossing = just the name (fix round 1: VI lines ≲ 2.5 s)');
eq(I.sayRight('en', R({ thing: { kind: 'obj', obj: 'flower', color: 'red' }, left: 0, k: 2, row: 1, rule: { kind: 'color', value: 'red' } }), r0), 'A red flower! Last hop!', 'en right, last row');
eq(I.sayRight('vi', R({ thing: { kind: 'obj', obj: 'flower', color: 'red' }, left: 0, k: 2, row: 1, rule: { kind: 'color', value: 'red' } }), r0), 'Bông hoa màu đỏ! Nhảy lên bờ nào!', 'vi right, last row');
eq(I.sayRight('en', R({ thing: { kind: 'obj', obj: 'flower', color: 'red' }, rule: { kind: 'color', value: 'red' } }), r0), 'A red flower!', 'en right without left → just the name');
eq(I.sayRight('en', R({ thing: { kind: 'animal', animal: 'penguin' }, home: 'ice', left: 0, rule: { kind: 'home', value: 'ice' } }), r0), 'The penguin lives on the ice! Last hop!', 'en home line');
eq(I.sayRight('en', R({ thing: { kind: 'animal', animal: 'penguin' }, home: 'ice', rule: { kind: 'home', value: 'ice' } }), r0), 'The penguin lives on the ice!', 'en home line (task)');
eq(I.sayRight('vi', R({ thing: { kind: 'animal', animal: 'penguin' }, home: 'ice', rule: { kind: 'home', value: 'ice' } }), r0), 'Chim cánh cụt sống ở xứ băng!', 'vi home line');
eq(I.sayRight('vi', R({ thing: { kind: 'animal', animal: 'cow' }, home: 'farm', left: 1, rule: { kind: 'home', value: 'farm' } }), r0), 'Con bò sống ở nông trại!', 'vi home mid-crossing (no tail)');
eq(I.sayRight('en', { thing: { kind: 'dots', n: 4 }, mode: 'countSel', left: 1, rule: { kind: 'n', value: 4 } }, r0), 'One, two, three, four! Four dots!', 'en countSel run (task)');
eq(I.sayRight('vi', { thing: { kind: 'dots', n: 4 }, mode: 'countSel', left: 0, rule: { kind: 'n', value: 4 } }, r0), 'Một, hai, ba, bốn! Bốn chấm!', 'vi countSel run');
eq(I.sayRight('en', { thing: { kind: 'dots', n: 2, numeral: true }, mode: 'countSeq', count: 2, row: 1, left: 1, rule: { kind: 'seq', value: 3 } }, r0), 'Two!', 'en countSeq → the number word (task)');
eq(I.sayRight('vi', { thing: { kind: 'dots', n: 3, numeral: true }, mode: 'countSeq', row: 2, left: 0, rule: { kind: 'seq' } }, r0), 'Ba!', 'vi countSeq from row');
eq(I.sayRight('en', { thing: { kind: 'dots', n: 1 }, promptKey: 'p.countSeq', params: { n: 3 } }, r0), 'One!', 'countSeq from promptKey + thing.n');
eq(I.sayWrong('en', { thing: { kind: 'obj', obj: 'mushroom', color: 'blue' }, got: { nameKind: 'color', nameValue: 'blue' }, want: { rule: { kind: 'color', value: 'red' } }, streak: 1 }, r0), 'That’s a blue mushroom. Find a red one!', 'en wrong: DESIGN example');
eq(I.sayWrong('vi', { thing: { kind: 'obj', obj: 'mushroom', color: 'blue' }, got: { nameKind: 'color', nameValue: 'blue' }, want: { rule: { kind: 'color', value: 'red' } }, streak: 1 }, r0), 'Đây là cây nấm màu xanh dương. Mình tìm cái màu đỏ nhé!', 'vi wrong: DESIGN example');
eq(I.sayWrong('en', { got: { nameKind: 'color', nameValue: 'blue' }, want: { kind: 'color', value: 'red' } }, r0), 'That’s a blue one. Find a red one!', 'en wrong rebuilt from got');
eq(I.sayWrong('en', { thing: { kind: 'animal', animal: 'lion' }, rule: { kind: 'home', value: 'farm' } }, r0), 'That’s a lion. It lives on the savanna. Who lives on the farm?', 'en wrong home teaches the home');
eq(I.sayWrong('en', { thing: { kind: 'dots', n: 4 }, mode: 'countSeq', need: 2, rule: { kind: 'seq' } }, r0), 'That’s 4. Which one is 2?', 'en countSeq wrong (task) — e.need');
eq(I.sayWrong('en', { thing: { kind: 'dots', n: 4 }, want: { rule: { kind: 'seq', value: 3 }, n: 2 } }, r0), 'That’s 4. Which one is 2?', 'countSeq wrong — want.n');
eq(I.sayWrong('en', { thing: { kind: 'dots', n: 4 }, mode: 'countSeq', row: 1, want: { rule: { kind: 'seq', value: 3 } } }, r0), 'That’s 4. Which one is 2?', 'countSeq wrong — row + 1');
eq(I.sayWrong('vi', { thing: { kind: 'dots', n: 4 }, mode: 'countSeq', count: 2 }, r0), 'Đây là số 4. Số 2 đâu nhỉ?', 'vi countSeq wrong — e.count');
eq(I.sayWrong('en', { got: { nameKind: 'number', nameValue: 5 }, mode: 'countSeq' }, r0), 'That’s 5. Let’s count in order!', 'countSeq wrong without the needed number');
eq(I.sayWrong('en', { mode: 'countSeq' }, r0), 'Let’s count in order!', 'countSeq wrong with nothing');
eq(I.sayWrong('en', { thing: { kind: 'dots', n: 3 }, mode: 'countSel', rule: { kind: 'n', value: 4 } }, r0), 'That’s 3 dots. Find the stone with 4 dots!', 'en countSel wrong');
eq(I.sayWrongHint('en', { thing: { kind: 'obj', obj: 'ball', color: 'green' }, rule: { kind: 'color', value: 'red' } }, r0), 'That’s a green ball. Look at the shiny one!', 'en wrong hint');
eq(I.sayWrongHint('en', { thing: { kind: 'dots', n: 4 }, mode: 'countSeq', need: 2 }, r0), 'That’s 4. Look at the shiny one!', 'countSeq wrong hint');
eq(I.sayCount('en', 1), 'One!', 'sayCount en'); eq(I.sayCount('vi', 1), 'Một!', 'sayCount vi');
eq(I.sayCountRun('en', 4), 'Four dots!', 'sayCountRun default dots'); eq(I.sayCountRun('en', 1, 'dots'), 'One dot!', 'one dot');
eq(I.sayCountRun('vi', 4, 'dots'), 'Bốn chấm!', 'sayCountRun vi'); eq(I.sayCountRun('en', 3, 'stones'), 'Three stones!', 'sayCountRun stones');
eq(I.sayCountRun('vi', 3, 'stones'), 'Ba hòn đá!', 'sayCountRun vi stones');
eq(I.seqList(3), '1, 2, 3', 'seqList');
for (let i = 0; i <= 20; i++) for (const l of I.langs) ok(tidy(I.sayCount(l, i)), `${l} sayCount ${i}`);
// sayFruit — every fruit, both languages, every wording
eq(I.sayFruit('en', 'apple', r0), 'Yum, an apple!', 'en sayFruit (DESIGN §6)');
eq(I.sayFruit('vi', 'apple', r0), 'Ôi, quả táo!', 'vi sayFruit (DESIGN §6)');
eq(I.sayFruit('en', { kind: 'acorn' }, r0), 'Yum, an acorn!', 'sayFruit {kind}');
eq(I.sayFruit('en', { fruit: 'pear' }, r0), 'Yum, a pear!', 'sayFruit {fruit}');
eq(I.sayFruit('en', 'banana', r0), 'Yum!', 'unknown fruit → kind generic line');
for (const l of I.langs) for (const f of FRUITS) for (const rng of RNGS) for (const child of ['', 'Mai']) {
  I.setChild(child);
  const s = I.sayFruit(l, f, rng);
  ok(tidy(s) && positive(s) && clean(s) && s.toLowerCase().includes(I.name(l, 'fruit', f).toLowerCase()), `${l} sayFruit ${f} (${child || 'no name'}): ${s}`);
}
I.setChild('');

// every topic thing kind × rule × left × language × wording
const SETS = [];
for (const c of COLORS) for (const o of OBJS) SETS.push({ topic: 'colors', pk: 'p.colors', params: { color: 'red' }, rule: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: o, color: c, nameKind: 'color', nameValue: c } });
for (const s of SHAPES) for (const c of ['red', 'blue', 'pink']) SETS.push({ topic: 'shapes', pk: 'p.shapes', params: { shape: 'star' }, rule: { kind: 'shape', value: 'star' }, thing: { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s } });
for (const s of SHAPES) for (const c of COLORS) SETS.push({ topic: 'shapes', pk: 'p.shapes5', params: { shape: 'heart' }, rule: { kind: 'shape', value: 'heart' }, thing: { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s } });
for (const o of OBJS) for (const big of [true, false]) for (const want of ['big', 'small']) SETS.push({ topic: 'size', pk: 'p.size', params: { big: want === 'big' }, rule: { kind: 'size', value: want }, thing: { kind: 'obj', obj: o, color: 'green', big, nameKind: 'size', nameValue: big ? 'big' : 'small' } });
for (let n = 1; n <= 12; n++) SETS.push({ topic: 'count', pk: 'p.countSel', params: { n: 4 }, rule: { kind: 'n', value: 4 }, mode: 'countSel', thing: { kind: 'dots', n, nameKind: 'number', nameValue: n } });
for (let n = 1; n <= 7; n++) for (let row = 0; row < 4; row++) SETS.push({ topic: 'count', pk: 'p.countSeq', params: { n: 4 }, rule: { kind: 'seq', value: 4 }, mode: 'countSeq', row, thing: { kind: 'dots', n, numeral: true, nameKind: 'number', nameValue: n } });
for (const a of ANIMALS) SETS.push({ topic: 'animals', pk: 'p.animal', params: { animal: 'cow' }, rule: { kind: 'animal', value: 'cow' }, thing: { kind: 'animal', animal: a, nameKind: 'animal', nameValue: a } });
for (const a of ANIMALS) for (const h of HOMES) SETS.push({ topic: 'animals', pk: 'p.home', params: { home: h }, rule: { kind: 'home', value: h }, thing: { kind: 'animal', animal: a, home: HOME[a], nameKind: 'home', nameValue: HOME[a] } });
for (const x of LETTERS) SETS.push({ topic: 'letters', pk: 'p.letters', params: { letter: 'B' }, rule: { kind: 'letter', value: 'B' }, thing: { kind: 'tile', text: x, nameKind: 'letter', nameValue: x } });
for (const x of ['A', 'a', 'M', 'n']) SETS.push({ topic: 'lower', pk: 'p.lower', params: { letter: 'A' }, rule: { kind: 'letter', value: 'A' }, thing: { kind: 'tile', text: x, nameKind: 'letter', nameValue: x.toUpperCase() } });
for (const a of ANIMALS) SETS.push({ topic: 'initial', pk: 'p.initial', params: { letter: 'C' }, rule: { kind: 'initial', value: 'C' }, thing: { kind: 'animal', animal: a, nameKind: 'letter', nameValue: INITIAL.en[a] } });
for (const o of OBJS) SETS.push({ topic: 'initial', pk: 'p.initial', params: { letter: 'B' }, rule: { kind: 'initial', value: 'B' }, thing: { kind: 'obj', obj: o, color: 'yellow', nameKind: 'letter', nameValue: OBJ_INITIAL.en[o] } });
for (const [a, b] of [[2, 3], [1, 4], [6, 4], [9, 9]]) SETS.push({ topic: 'add', pk: 'p.add', params: { n: 5 }, rule: { kind: 'sum', value: 5 }, thing: { kind: 'tile', text: a + '+' + b, nameKind: 'sum', nameValue: a + b } });
for (const [a, b] of [[7, 4], [5, 2], [9, 0]]) SETS.push({ topic: 'sub', pk: 'p.sub', params: { n: 3 }, rule: { kind: 'diff', value: 3 }, thing: { kind: 'tile', text: a + '−' + b, nameKind: 'diff', nameValue: a - b } });
for (const n of [1, 2, 7, 8, 13, 20]) SETS.push({ topic: 'oddeven', pk: 'p.oddeven', params: { parity: 'even' }, rule: { kind: 'parity', value: 'even' }, thing: { kind: 'tile', text: String(n), n, nameKind: 'parity', nameValue: n % 2 ? 'odd' : 'even' } });
let sweep = 0;
const NEXT = /Next one!|Next row!|On we go!|Hòn tiếp theo nào!|Hàng tiếp theo nào!|Nhảy tiếp nào!/;
const LAST = /Last hop!|To the bank!|Last hop to the bank!|Nhảy lên bờ nào!|Hòn cuối rồi!|Lên bờ thôi!/;
for (const S of SETS) for (const l of I.langs) for (const rng of RNGS) {
  for (const left of [0, 1, 2]) {
    const row = S.row != null ? S.row : 2 - left;
    const e = { id: 's1', thing: S.thing, x: 1, y: 1, row, k: row + left + 1, left, home: S.thing.home, count: S.mode === 'countSeq' ? row + 1 : undefined,
      topic: S.topic, promptKey: S.pk, params: S.params, rule: S.rule, mode: S.mode || 'match' };
    const s = I.sayRight(l, e, rng); sweep++;
    ok(tidy(s) && positive(s) && clean(s), `${l} right ${S.topic} ${JSON.stringify(S.thing)} left ${left}: ${s}`);
    ok(!/^(Boing! Yes!|You got it!|Yes! Hop!|Tưng! Đúng rồi!|Bé giỏi quá!|Đúng rồi! Nhảy nào!)$/.test(s), `${l} right names the thing: ${s}`);
    if (S.mode === 'countSeq') { eq(s, I.sayCount(l, row + 1), `${l} countSeq right = the number word`); continue; }
    if (S.mode === 'countSel') { ok(s === I.countList(l, S.thing.n) + ' ' + I.sayCountRun(l, S.thing.n, 'dots'), `${l} countSel counts aloud: ${s}`); continue; }
    if (left > 0) ok(l === 'vi' ? !NEXT.test(s) && !LAST.test(s) && (s.length <= 40 || S.rule.kind === 'initial') : NEXT.test(s) && !LAST.test(s), `${l} right left ${left} → next (VI: short, no tail): ${s}`);
    if (left === 0) ok(LAST.test(s) && !NEXT.test(s), `${l} right left 0 → last hop: ${s}`);
    if (S.rule.kind === 'home') ok(s.includes(I.name(l, 'homeAt', S.thing.home)), `${l} home line names the home: ${s}`);
  }
  for (const streak of [1, 2, 4]) {
    const e = { id: 's2', thing: S.thing, got: { nameKind: S.thing.nameKind, nameValue: S.thing.nameValue }, want: { rule: S.rule }, streak, x: 1, y: 1,
      row: S.row, topic: S.topic, promptKey: S.pk, params: S.params, mode: S.mode || 'match' };
    const s = I.sayWrong(l, e, rng); sweep++;
    ok(tidy(s) && positive(s) && clean(s), `${l} wrong ${S.topic} ${JSON.stringify(S.thing)}: ${s}`);
    ok(/[.!?] \p{Lu}/u.test(s), `${l} wrong names it, then the goal: ${s}`);
    if (S.mode === 'countSeq') ok(s.includes(String(S.thing.n)) && s.includes(String(S.row + 1)), `${l} countSeq wrong names both numbers: ${s}`);
    const h = I.sayWrongHint(l, e, rng);
    ok(tidy(h) && positive(h) && clean(h), `${l} wrongHint ${S.topic}: ${h}`);
    // without the thing: rebuilt from got
    const s2 = I.sayWrong(l, { got: e.got, want: S.rule, streak, mode: S.mode, row: S.row }, rng);
    ok(tidy(s2) && positive(s2) && clean(s2), `${l} wrong from got only ${S.topic}: ${s2}`);
  }
}
// rule missing → from promptKey + params
eq(I.sayWrong('en', { thing: { kind: 'obj', obj: 'leaf', color: 'green' }, promptKey: 'p.colors', params: { color: 'yellow' } }, r0), 'That’s a green leaf. Find a yellow one!', 'rule from promptKey');
ok(tidy(I.sayRight('en', {})) && tidy(I.sayWrong('vi', {})) && tidy(I.sayWrongHint('en', {})), 'empty events still say something kind');
ok(tidy(I.sayRight('en', null)) && tidy(I.sayWrong('en', undefined)), 'null events never throw');
console.log(`   (${sweep} right / wrong lines rendered)`);

section('the other game lines');
for (const l of I.langs) for (const rng of RNGS) {
  for (const k of ['ahead', 'bank', 'rise', 'wipe', 'poke', 'surprise.fish', 'fish.tap', 'surprise.frog', 'frog.tap', 'surprise.snow',
    'snow.tap', 'weather.0', 'weather.1', 'weather.2', 'weather.3', 'hint', 'idle', 'praise', 'great', 'party'])
    ok(tidy(I.t(l, k, null, rng)) && clean(I.t(l, k, null, rng)), `${l} ${k}: ${I.t(l, k, null, rng)}`);
}
eq(I.t('en', 'ahead', null, r0), 'One at a time!', 'en ahead (DESIGN §6)');
eq(I.t('vi', 'ahead', null, r0), 'Từng hòn một thôi bé ơi!', 'vi ahead (DESIGN §6)');
eq(I.t('en', 'bank', null, r0), 'We crossed the brook!', 'en bank'); eq(I.t('vi', 'bank', null, r0), 'Qua suối rồi!', 'vi bank');
eq(I.t('en', 'rise', null, r0), 'Look, stepping stones!', 'en rise');
eq(I.t('en', 'weather.0', null, r0), 'Spring by the brook!', 'weather.0'); eq(I.t('en', 'weather.1', null, r0), 'Sunny summer!', 'weather.1');
eq(I.t('en', 'weather.2', null, r0), 'Windy autumn!', 'weather.2'); eq(I.t('en', 'weather.3', null, r0), 'Snowy winter!', 'weather.3');
eq(I.t('en', 'talk.count'), 'How many dots?', 'talk count (task)');

section('talk');
const TALKS = [['talk.color', {}], ['talk.colors', {}], ['talk.colorsWhich', { color: 'red' }], ['talk.shape', { shape: 'triangle' }],
  ['talk.shapes', { shape: 'triangle' }], ['talk.count', {}], ['talk.home', { animal: 'penguin' }], ['talk.animals', { animal: 'fishbowl' }],
  ['talk.who', {}], ['talk.size', { size: 'big' }], ['talk.letters', { letter: 'B' }], ['talk.lower', { letter: 'B' }],
  ['talk.lower', { letter: 'B', small: 'b' }], ['talk.initial', { letter: 'C', nameKind: 'animal', nameValue: 'cow' }],
  ['talk.initial', { letter: 'F', nameKind: 'obj', nameValue: 'flower' }], ['talk.add', { a: 2, b: 3 }], ['talk.sub', { a: 7, b: 2 }],
  ['talk.oddeven', { parity: 'odd' }]];
for (const [k, p] of TALKS) for (const l of I.langs) { const s = I.t(l, k, p); ok(tidy(s) && s !== k && clean(s), `${l} ${k}: ${s}`); }
eq(I.t('en', 'talk.home', { animal: 'penguin' }), 'Where does the penguin live?', 'talk home');
eq(I.t('vi', 'talk.home', { animal: 'penguin' }), 'Chim cánh cụt sống ở đâu nhỉ?', 'vi talk home');
eq(I.t('en', 'talk.who'), 'Who is this?', 'talk who');
eq(I.t('en', 'talk.initial', { letter: 'C', nameKind: 'animal', nameValue: 'cow' }), 'Which letter does cow start with?', 'talk initial never says the letter');
eq(I.t('vi', 'talk.initial', { letter: 'H', nameKind: 'obj', nameValue: 'flower' }), 'Hoa bắt đầu bằng chữ gì nhỉ?', 'vi talk initial with an obj');
eq(I.talkWrong('en', { id: 'h', thing: { kind: 'home', home: 'ice' } }, { show: { kind: 'animal', animal: 'penguin' } }), 'The penguin lives on the ice! Good try!', 'talkWrong home');
eq(I.talkWrong('vi', { id: 'h', thing: { kind: 'home', home: 'ice' } }, { show: { kind: 'animal', animal: 'penguin' } }), 'Chim cánh cụt sống ở xứ băng đó! Bé cố gắng lắm!', 'vi talkWrong home');
eq(I.talkWrong('en', { id: 'n', thing: { kind: 'number', n: 4 } }, { topic: 'count' }), 'There are 4 dots! Good try!', 'talkWrong dots');
eq(I.talkWrong('vi', { id: 'n', thing: { kind: 'number', n: 4 } }, { topic: 'count' }), 'Có 4 chấm đó! Bé cố gắng lắm!', 'vi talkWrong dots');
eq(I.talkWrong('en', { id: 'n', thing: { kind: 'number', n: 1 } }, { topic: 'count' }), 'There is 1 dot! Good try!', 'talkWrong one dot');
eq(I.talkWrong('en', 'color', 'blue'), 'It is blue! Good try!', 'talkWrong colour');
for (const l of I.langs) {
  for (const c of COLORS) ok(tidy(I.talkWrong(l, 'color', c)), `${l} talkWrong ${c}`);
  for (const s of SHAPES) ok(tidy(I.talkWrong(l, 'shape', s)), `${l} talkWrong ${s}`);
  for (const a of ANIMALS) ok(tidy(I.talkWrong(l, 'animal', a)), `${l} talkWrong ${a}`);
  for (const o of OBJS) ok(tidy(I.talkWrong(l, 'obj', o)), `${l} talkWrong obj ${o}: ${I.talkWrong(l, 'obj', o)}`);
  for (const h of HOMES) for (const a of ANIMALS) ok(tidy(I.talkWrong(l, { id: 'x', thing: { kind: 'home', home: h } }, { show: { kind: 'animal', animal: a } })), `${l} talkWrong home ${h} ${a}`);
  for (let n = 0; n <= 12; n++) ok(tidy(I.talkWrong(l, 'number', n, { topic: 'count' })), `${l} talkWrong n ${n}`);
  for (const x of ['B', 'b']) ok(tidy(I.talkWrong(l, 'letter', x)), `${l} talkWrong letter ${x}`);
  for (const sz of [{ kind: 'size', big: true }, { kind: 'size', big: false }]) ok(tidy(I.talkWrong(l, { id: 's', thing: sz })), `${l} talkWrong size`);
}

// ------------------------------------------------------------------ content.js (river crossing) when it exists
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  try {
    const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
    if (/rows/.test(csrc) && /countSeq/.test(csrc)) {
      const sbc = makeSandbox(); sbc.NH = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.NH.Content && sbc.NH.Content.makeRound) contentSB = sbc;
    }
  } catch (e) { ok(false, 'content.js load: ' + e.message); }
}
console.log(`   (${contentSB ? 'river content.js loaded' : 'river content.js not there yet — content checks skipped'})`);
if (contentSB) {
  section('content.js: every promptKey / Talk key / stone it produces');
  const CF = contentSB.NH, C = CF.Content;
  for (const a of Object.keys(CF.ANIMALS || {})) ok(I.ANIMALS.includes(a), `content animal ${a} has names`);
  for (const o of CF.OBJS || []) ok(I.OBJS.includes(o), `content obj ${o} has names`);
  for (const f of CF.FRUITS || []) ok(I.FRUITS.includes(f), `content fruit ${f} has names`);
  for (const c of CF.COLORS || []) ok(I.COLORS.includes(c), `content colour ${c} has names`);
  const AGE_TOPICS = CF.AGE_TOPICS || {};
  let rounds = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of (AGE_TOPICS[age] || [])) for (const lang of I.langs) for (let ri = 0; ri < 4; ri++) {
    let round;
    try {
      const rng = CF.RNG ? new CF.RNG(age * 1000 + ri * 7 + topic.length) : { next: Math.random };
      round = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level: TOPICS.indexOf(topic) % 4 });
    } catch (e) { console.log(`WARN  makeRound ${topic} age ${age} ${lang} round ${ri} threw (content.js, not i18n): ${e.message}`); continue; }
    if (!round || !Array.isArray(round.rows)) continue;
    rounds++;
    const ask = I.ask(lang, round.promptKey, round.params, { first: ri === 0 });
    ok(tidy(ask) && clean(ask) && !/^(Hop on a stone!|Bé nhảy lên một hòn đá nhé!)$/.test(ask), `${lang} age ${age} ${topic}: ask ${round.promptKey} ${JSON.stringify(round.params)} → ${ask}`);
    if (round.fruit) ok(tidy(I.sayFruit(lang, round.fruit)) && !/^(Yum!|Ngon quá!)$/.test(I.sayFruit(lang, round.fruit, r0)), `${lang} fruit ${round.fruit} named`);
    round.rows.forEach((row, j) => {
      for (const st of row) {
        const base = { id: st.id, thing: st.thing, row: j, k: round.k, topic, promptKey: round.promptKey, params: round.params, rule: round.rule, mode: round.mode };
        if (st.target) {
          const s = I.sayRight(lang, Object.assign({ left: round.k - j - 1, home: st.thing.home, count: round.mode === 'countSeq' ? j + 1 : undefined }, base));
          ok(tidy(s) && positive(s) && clean(s), `${lang} age ${age} ${topic} right: ${s}`);
        } else {
          const s = I.sayWrong(lang, Object.assign({ want: { rule: round.rule }, got: { nameKind: st.thing.nameKind, nameValue: st.thing.nameValue }, streak: 1 }, base));
          ok(tidy(s) && positive(s) && clean(s) && !/^(Let’s look again!|Mình tìm lại nhé!)$/.test(s), `${lang} age ${age} ${topic} wrong: ${s}`);
        }
        ok(I.sayName(lang, st.thing).length > 0, `${lang} stone thing named: ${JSON.stringify(st.thing)}`);
      }
    });
    if (C.makeTalk && ri === 0) {
      try {
        const talk = C.makeTalk(topic, { age, lang, rng: CF.RNG ? new CF.RNG(age * 31 + topic.length) : { next: () => 0.3 } });
        if (talk) {
          const q = I.t(lang, talk.promptKey, talk.params);
          ok(tidy(q) && q !== talk.promptKey && clean(q), `${lang} talk ${talk.promptKey} ${JSON.stringify(talk.params)} → ${q}`);
          for (const c of talk.choices || []) {
            ok(I.choiceWords(lang, c).length > 0, `${lang} talk choice words ${JSON.stringify(c.thing)}`);
            ok(tidy(I.talkWrong(lang, c, talk)), `${lang} talkWrong ${JSON.stringify(c.thing)}: ${I.talkWrong(lang, c, talk)}`);
          }
        }
      } catch (e) { ok(false, `makeTalk ${topic}: ${e.message}`); }
    }
  }
  console.log(`   (${rounds} content rounds rendered)`);
}

section('speech text: letters, maths, pauses, caps, "Nim"');
eq(I.speech('en', 'That’s letter D.'), 'That’s letter dee.', 'en letter names');
eq(I.speech('en', 'A duck! D is for duck!'), 'A duck! dee is for duck!', 'en "D is for"');
eq(I.speech('en', 'Hop on the ones that start with C!'), 'Hop on the ones that start with see!', 'en starts with');
eq(I.speech('en', 'Hop on big A and small a!'), 'Hop on big ay and small ay!', 'en big/small letters');
eq(I.speech('en', 'Let’s cross the brook! Lots of colours… but look at the shapes! Hop on the RED stones!'), 'Let’s cross the brook! Lots of colours, but look at the shapes! Hop on the red stones!', '… → comma pause, caps → lower');
eq(I.speech('en', '2 + 4 makes 6!'), '2 plus 4 makes 6!', 'en plus');
eq(I.speech('vi', '7 − 2 bằng 5!'), '7 trừ 2 bằng 5!', 'vi minus');
eq(I.speech('vi', 'Bé nhảy lên chữ B nhé!'), 'Bé nhảy lên chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Chữ m thường!'), 'Chữ mờ thường!', 'vi small letter');
eq(I.speech('vi', 'Mình qua suối nào! Bé chọn hòn đá có màu ĐỎ nhé!'), 'Mình qua suối nào! Bé chọn hòn đá có màu đỏ nhé!', 'vi caps → lower');
eq(I.speech('en', 'Hop 1, 2, 3!'), 'Hop 1, 2, 3!', 'countSeq digits read as is');
eq(I.speech('en', 'Hi! I am Nim.'), 'Hi! I am Nim.', 'en "Nim" as written');
eq(I.speech('vi', 'Mình là nhím Nim. Nim giúp bé nhé!'), 'Mình là nhím Nim. Nim giúp bé nhé!', 'vi "Nim" as written');
eq(I.speech('en', 'Nim is listening…'), 'Nim is listening.', 'final ellipsis → full stop');
eq(V.spoken('vi', 'Chào bé! Mình là nhím Nim.'), 'Chào bé! Mình là nhím Nim.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Hop on letter B!'), 'Hop on letter bee!', 'Voice.spoken letter names');
for (const l of I.langs) for (const k of I.keys(l)) {
  const s = I.speech(l, I.t(l, k, SAMPLE, r0));
  ok(!/…|[+−]/.test(s) && !/,\s*[!?.]/.test(s), `${l} ${k} speech text clean: ${s}`);
}

section('input: tap pointer layer — (x, y, ev) in logical px, ONE finger, extra fingers ignored');
(function () {
  function El(tag, cls) { this.nodeType = 1; this.tag = tag; this.cls = cls || ''; this.parentElement = null; this.style = {}; this.h = {}; this.cap = {}; }
  El.prototype.matches = function (sel) {
    return sel.split(',').map(x => x.trim()).some(x => x === this.tag || (x[0] === '.' && this.cls.split(' ').includes(x.slice(1))) ||
      (x[0] === '#' && this.id === x.slice(1)));
  };
  El.prototype.addEventListener = function (t, fn) { (this.h[t] = this.h[t] || []).push(fn); };
  El.prototype.removeEventListener = function (t, fn) { this.h[t] = (this.h[t] || []).filter(f => f !== fn); };
  El.prototype.setPointerCapture = function (id) { this.cap[id] = true; };
  El.prototype.releasePointerCapture = function (id) { delete this.cap[id]; };
  El.prototype.emit = function (t, e) { (this.h[t] || []).slice().forEach(f => f(e)); };
  const canvas = new El('canvas');
  const btn = new El('button');
  const sb4 = makeSandbox({ PointerEvent: function () {}, addEventListener() {}, removeEventListener() {} });
  sb4.NH = {};
  const IN = load(sb4, ['input.js']).Input;
  const calls = [];
  const detach = IN.attach(canvas, {
    toLogical: (cx, cy) => ({ x: cx / 2, y: cy / 2 }),
    down: function (x, y, ev) { calls.push(['down', x, y, typeof ev]); },
    move: function (x, y, ev) { calls.push(['move', x, y, typeof ev]); },
    up: function (x, y, ev) { calls.push(['up', x, y, typeof ev]); },
    cancel: function () { calls.push(['cancel']); }
  });
  ok(canvas.style.touchAction === 'none', 'canvas touch-action none');
  ok(canvas.style.webkitTouchCallout === 'none', 'canvas: no long-press callout');
  const pe = (id, x, y, extra) => Object.assign({ pointerId: id, clientX: x, clientY: y, target: canvas, pointerType: 'touch',
    isPrimary: true, button: 0, cancelable: true, preventDefault() { this.prevented = true; } }, extra || {});
  const e1 = pe(1, 100, 60);
  canvas.emit('pointerdown', e1);
  ok(calls.length === 1 && calls[0][0] === 'down', 'down fires synchronously inside pointerdown');
  ok(e1.prevented, 'pointerdown preventDefault');
  ok(canvas.cap[1], 'pointer capture taken on down');
  canvas.emit('pointermove', pe(1, 140, 60));
  canvas.emit('pointermove', pe(1, 200, 90));
  canvas.emit('pointerup', pe(1, 210, 94));
  ok(!canvas.cap[1], 'pointer capture released on up');
  eq(JSON.stringify(calls), JSON.stringify([['down', 50, 30, 'object'], ['move', 70, 30, 'object'], ['move', 100, 45, 'object'], ['up', 105, 47, 'object']]),
    'a swipe: down, moves, up — numbers in logical px + the raw event');
  ok(calls.every(c => c.length === 1 || (typeof c[1] === 'number' && typeof c[2] === 'number')), 'callbacks get (x, y) NUMBERS — never a point object');
  const insrc = fs.readFileSync(path.join(JS, 'input.js'), 'utf8');
  ok(/CALLBACK SIGNATURE/.test(insrc) && /down\(x, y, ev\)\s+move\(x, y, ev\)\s+up\(x, y, ev\)\s+cancel\(\)/.test(insrc), 'input.js documents the callback signature at the top');
  // a long swipe across the screen: every move arrives, in order, even far outside the canvas (pointer capture keeps the events on the canvas)
  calls.length = 0;
  canvas.emit('pointerdown', pe(50, 300, 600));
  for (let k = 1; k <= 60; k++) canvas.emit('pointermove', pe(50, 300 + k * 10, 600 - k * 12));
  canvas.emit('pointerup', pe(50, 900, -120));
  eq(calls.length, 62, 'a long swipe delivers down + 60 moves + up');
  ok(calls.slice(1, 61).every((c, k) => c[0] === 'move' && c[1] === (300 + (k + 1) * 10) / 2), 'moves arrive in order with the right x');
  eq(JSON.stringify(calls[61]), JSON.stringify(['up', 450, -60, 'object']), 'release point outside the canvas reaches up()');
  calls.length = 0;
  calls.length = 0;
  // a second finger during a swipe is ignored; the swipe continues and ends normally
  canvas.emit('pointerdown', pe(10, 20, 20));
  const extra = pe(11, 400, 400, { isPrimary: false });
  canvas.emit('pointerdown', extra);
  ok(extra.prevented, 'the extra finger is swallowed (no browser gesture)');
  canvas.emit('pointermove', pe(11, 420, 400, { isPrimary: false }));
  canvas.emit('pointermove', pe(10, 40, 30));
  canvas.emit('pointerup', pe(11, 420, 400, { isPrimary: false }));
  canvas.emit('pointerup', pe(10, 44, 30));
  eq(JSON.stringify(calls), JSON.stringify([['down', 10, 10, 'object'], ['move', 20, 15, 'object'], ['up', 22, 15, 'object']]),
    'extra finger ignored: no down/move/up for it, the first swipe is untouched');
  calls.length = 0;
  // a lost pointerup (iOS system gesture): the next PRIMARY touch proves the old finger is gone → cancel, then down
  canvas.emit('pointerdown', pe(30, 10, 10));
  canvas.emit('pointerdown', pe(31, 30, 30, { isPrimary: true }));
  eq(JSON.stringify(calls), JSON.stringify([['down', 5, 5, 'object'], ['cancel'], ['down', 15, 15, 'object']]), 'stuck pointer: cancel, then the new primary touch');
  canvas.emit('pointerup', pe(30, 10, 10));
  eq(calls.length, 3, 'the old finger\'s late up is ignored');
  canvas.emit('pointerup', pe(31, 30, 30));
  calls.length = 0;
  // fast taps in a row each fire down + up
  for (let i = 0; i < 5; i++) { canvas.emit('pointerdown', pe(20 + i, 10 * i, 10)); canvas.emit('pointerup', pe(20 + i, 10 * i, 10)); }
  eq(calls.map(c => c[0]).join(','), 'down,up,down,up,down,up,down,up,down,up', 'quick taps alternate down/up');
  calls.length = 0;
  canvas.emit('pointerdown', pe(40, 10, 10)); canvas.emit('pointerdown', pe(40, 10, 10)); canvas.emit('pointerup', pe(40, 10, 10));
  eq(calls.map(c => c[0]).join(','), 'down,up', 'duplicate down of the same finger ignored');
  calls.length = 0;
  canvas.emit('pointerdown', pe(3, 10, 10));
  canvas.emit('pointermove', pe(3, 30, 10));
  canvas.emit('pointercancel', pe(3, 30, 10));
  canvas.emit('pointermove', pe(3, 50, 10));
  canvas.emit('pointerup', pe(3, 50, 10));
  eq(JSON.stringify(calls.map(c => c[0])), JSON.stringify(['down', 'move', 'cancel']), 'pointercancel → cancel(); later move/up ignored');
  ok(!canvas.cap[3], 'capture released on cancel');
  calls.length = 0;
  canvas.emit('pointerdown', pe(12, 10, 10)); canvas.emit('pointerup', pe(12, 10, 10)); canvas.emit('lostpointercapture', pe(12, 10, 10));
  eq(calls.map(c => c[0]).join(','), 'down,up', 'lostpointercapture after up is harmless');
  calls.length = 0;
  canvas.emit('pointerdown', pe(13, 10, 10)); canvas.emit('lostpointercapture', pe(13, 10, 10));
  eq(calls.map(c => c[0]).join(','), 'down,cancel', 'capture lost while down → cancel');
  calls.length = 0;
  canvas.emit('pointerdown', pe(4, 10, 10, { target: btn }));
  eq(calls.length, 0, 'button targets are ignored');
  const hud = new El('div'); hud.id = 'hud'; const inner = new El('span'); inner.parentElement = hud;
  canvas.emit('pointerdown', pe(5, 10, 10, { target: inner }));
  eq(calls.length, 0, 'children of #hud are ignored');
  canvas.emit('pointerdown', pe(5, 10, 10, { target: new El('div', 'screen') }));
  canvas.emit('pointerdown', pe(5, 10, 10, { target: new El('div', 'no-game-input') }));
  eq(calls.length, 0, '.screen / .no-game-input are ignored');
  eq(IN.IGNORE, 'button, .screen, #hud, .no-game-input', 'IGNORE selector');
  canvas.emit('pointerdown', pe(6, 10, 10, { pointerType: 'mouse', button: 2 }));
  eq(calls.length, 0, 'right mouse button ignored');
  canvas.emit('pointerdown', pe(9, 10, 10, { pointerType: 'mouse' }));
  canvas.emit('pointermove', pe(9, 20, 10, { pointerType: 'mouse' }));
  canvas.emit('pointerup', pe(9, 20, 10, { pointerType: 'mouse' }));
  eq(calls.map(c => c[0]).join(','), 'down,move,up', 'mouse swipe works');
  calls.length = 0;
  detach();
  canvas.emit('pointerdown', pe(7, 10, 10));
  eq(calls.length, 0, 'detach removes listeners');
  const calls2 = [];
  IN.attach(canvas, { toLogical: () => ({ x: NaN, y: 1 }), down: (x, y) => calls2.push([x, y]), cancel: () => calls2.push('c') });
  canvas.emit('pointerdown', pe(8, 10, 10));
  eq(calls2.length, 0, 'non-finite points are dropped');
  const c3 = new El('canvas'); let n3 = 0;
  IN.attach(c3, { down: () => { n3++; throw new Error('boom'); } });
  const oldErr = sb4.console; sb4.console = { error() {} };
  c3.emit('pointerdown', pe(1, 1, 1)); c3.emit('pointerup', pe(1, 1, 1)); c3.emit('pointerdown', pe(2, 1, 1));
  sb4.console = oldErr;
  eq(n3, 2, 'a throwing handler does not stop later touches');

  // stale active pointer (silent ≥ STALE_MS) is replaced by a new non-primary touch; a fresh one is not
  eq(IN.STALE_MS, 6000, 'Input.STALE_MS = 6000');
  const tk = new El('canvas'), tkc = [];
  let clock = 0; IN._now = () => clock;
  IN.attach(tk, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down: (x) => tkc.push('down' + x), move: (x) => tkc.push('move' + x),
    up: (x) => tkc.push('up' + x), cancel: () => tkc.push('cancel') });
  tk.emit('pointerdown', pe(1, 100, 100));
  clock = 3000; tk.emit('pointermove', pe(1, 110, 100));
  clock = 8000; tk.emit('pointerdown', pe(2, 300, 300, { isPrimary: false }));       // 5 s silent: still ignored
  clock = 9100; tk.emit('pointerdown', pe(3, 300, 300, { isPrimary: false }));       // 6.1 s silent: presumed lost
  tk.emit('pointerup', pe(3, 300, 300, { isPrimary: false }));
  eq(tkc.join(','), 'down100,move110,cancel,down300,up300', 'silent ≥ 6 s → cancel + new finger; < 6 s → ignored');
  IN._now = null;

  // the finger is lifted OUTSIDE the canvas / over the HUD: the up still arrives (window listeners), exactly once
  const dc = new El('canvas'), dcalls = [];
  const winH = {};
  const sb7 = makeSandbox({ PointerEvent: function () {}, addEventListener(t, f) { (winH[t] = winH[t] || []).push(f); },
    removeEventListener(t, f) { winH[t] = (winH[t] || []).filter(x => x !== f); } });
  sb7.NH = {};
  const IN7 = load(sb7, ['input.js']).Input;
  const winEmit = (t, e) => (winH[t] || []).slice().forEach(f => f(e));
  IN7.attach(dc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down: (x, y) => dcalls.push(['down', x, y]),
    move: (x, y, ev) => dcalls.push(['move', x, y, typeof ev]), up: (x, y) => dcalls.push(['up', x, y]), cancel: () => dcalls.push(['cancel']) });
  const pd = (id, x, y, extra) => Object.assign({ pointerId: id, clientX: x, clientY: y, target: dc, pointerType: 'touch',
    isPrimary: true, button: 0, cancelable: true, preventDefault() {} }, extra || {});
  const hudEl = new El('div');
  dc.emit('pointerdown', pd(4, 50, 50));
  winEmit('pointermove', pd(4, 60, 40, { target: hudEl }));
  const upEv = pd(4, 70, 30, { target: hudEl });
  winEmit('pointerup', upEv);
  winEmit('pointerup', upEv);
  eq(JSON.stringify(dcalls), JSON.stringify([['down', 50, 50], ['move', 60, 40, 'object'], ['up', 70, 30]]), 'up lifted over another element reaches the game once');
  dcalls.length = 0;
  dc.emit('pointerdown', pd(5, 10, 10));
  const mv = pd(5, 12, 12); dc.emit('pointermove', mv); winEmit('pointermove', mv);
  const up5 = pd(5, 12, 12); dc.emit('pointerup', up5); winEmit('pointerup', up5);
  eq(dcalls.length, 3, 'canvas events bubbling to window are handled once');
  dcalls.length = 0;
  dc.emit('pointerdown', pd(6, 10, 10));
  winEmit('blur', {}); winEmit('blur', {});
  dc.emit('pointerup', pd(6, 30, 30));
  eq(JSON.stringify(dcalls), JSON.stringify([['down', 10, 10], ['cancel']]), 'blur cancels once; the late up is ignored');
  dcalls.length = 0;
  dc.emit('pointerdown', pd(7, 10, 10));
  winEmit('pointercancel', pd(7, 10, 10));
  dc.emit('lostpointercapture', pd(7, 10, 10));
  eq(JSON.stringify(dcalls), JSON.stringify([['down', 10, 10], ['cancel']]), 'pointercancel (window) + lostpointercapture → one cancel');
  dcalls.length = 0;
  dc.emit('pointerdown', pd(8, 10, 10)); dc.emit('pointerup', pd(8, 10, 10));
  eq(dcalls.length, 2, 'input works again after a cancel');
  const ec = new El('canvas'), ecalls = [];
  let bad = false;
  IN.attach(ec, { toLogical: (cx, cy) => (bad ? { x: NaN, y: NaN } : { x: cx, y: cy }), down: () => ecalls.push('down'), up: () => ecalls.push('up'), cancel: () => ecalls.push('cancel') });
  ec.emit('pointerdown', pe(1, 1, 1)); bad = true; ec.emit('pointerup', pe(1, 1, 1));
  eq(ecalls.join(','), 'down,cancel', 'unmappable up → cancel');
  const rc = new El('canvas'), rcalls = [];
  const hRc = IN.attach(rc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down: () => rcalls.push('down'), move: () => rcalls.push('move'),
    up: () => rcalls.push('up'), cancel: () => rcalls.push('cancel') });
  ok(typeof hRc === 'function' && typeof hRc.cancel === 'function' && typeof hRc.isActive === 'function', 'attach returns detach with cancel/isActive');
  rc.emit('pointerdown', pe(1, 5, 5)); ok(hRc.isActive(), 'isActive while a finger is down');
  rc.emit('pointermove', pe(1, 6, 6)); hRc.cancel(); hRc.cancel();
  rc.emit('pointermove', pe(1, 7, 7)); rc.emit('pointerup', pe(1, 7, 7));
  eq(rcalls.join(','), 'down,move,cancel', 'detach.cancel (rotation) → one cancel, the rest of that finger is ignored');
  ok(!hRc.isActive(), 'isActive false after cancel');
  rc.emit('pointerdown', pe(2, 5, 5)); rc.emit('pointerup', pe(2, 5, 5));
  eq(rcalls.slice(-2).join(','), 'down,up', 'the next finger works after detach.cancel');
  const fc = new El('canvas'); let fm = 0;
  IN.attach(fc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down() {}, move() { fm++; }, up() {} });
  fc.emit('pointerdown', pe(1, 0, 0));
  for (let k = 0; k < 120; k++) fc.emit('pointermove', pe(1, k, -k));
  eq(fm, 120, 'every pointermove reaches move() synchronously');
  fc.emit('pointerup', pe(1, 0, 0));

  // touch fallback (no PointerEvent): extra finger ignored; swallowed touchend recovers
  const sb5 = makeSandbox({ addEventListener() {}, removeEventListener() {} });
  sb5.NH = {};
  const IN5 = load(sb5, ['input.js']).Input;
  const tc = new El('canvas'), tcalls = [];
  IN5.attach(tc, { down: (x, y) => tcalls.push(['down', x, y]), move: (x, y) => tcalls.push(['move', x, y]), up: (x, y) => tcalls.push(['up', x, y]), cancel: () => tcalls.push(['cancel']) });
  const te = (ids, changed) => ({ target: tc, cancelable: true, preventDefault() { this.prevented = true; },
    touches: ids.map(i => ({ identifier: i, clientX: i * 10, clientY: i * 10 })),
    changedTouches: changed.map(i => ({ identifier: i, clientX: i * 10, clientY: i * 10 })) });
  tc.emit('touchstart', te([1], [1]));
  tc.emit('touchstart', te([1, 2], [2]));
  tc.emit('touchmove', te([1, 2], [2]));
  tc.emit('touchend', te([1], [2]));
  tc.emit('touchend', te([], [1]));
  eq(JSON.stringify(tcalls), JSON.stringify([['down', 10, 10], ['up', 10, 10]]), 'touch fallback: extra finger ignored');
  tcalls.length = 0;
  tc.emit('touchstart', te([3], [3]));
  tc.emit('touchstart', te([4], [4]));           // touch 3 is not in e.touches any more: its touchend was swallowed
  eq(JSON.stringify(tcalls), JSON.stringify([['down', 30, 30], ['cancel'], ['down', 40, 40]]), 'touch fallback: swallowed touchend recovers');
  const tEnd = te([], [4]); tc.emit('touchend', tEnd);
  ok(tEnd.prevented, 'touch fallback: touchend preventDefault (no ghost click)');
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
  sb6.NH = {};
  const IN = load(sb6, ['input.js']).Input;
  eq(IN.HOLD_MS, 2000, 'parent gate default 2 s');
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
ok(sb.NH.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into NH.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof NH.Input.attach === 'function' && typeof NH.Input.kidProof === 'function' && typeof NH.Input.holdButton === 'function',
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
  sbx.NH = {};
  env.NH = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.NH.Voice;
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
  eq(V2.voiceName('vi'), 'Linh', 'vi picks Linh (iOS built-in Vietnamese voice)');
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Nim: rate 0.9, pitch 1.2');
  ok(V2.RATE === 0.9 && V2.PITCH === 1.2, 'Voice.RATE / PITCH exported');
  ok(V2.isSpeaking(), 'isSpeaking true while talking');
  ok(starts >= 1, 'onStart fired');
  // queue: one speaking + at most 2 waiting NORMAL lines (priority lines are kept, fix round 1); the oldest normal one is dropped
  const b = V2.say('one'), c = V2.say('two', { priority: true }), d = V2.say('three'), d2 = V2.say('four');
  eq((await b).reason, 'dropped', 'queue ≤ 2 normal lines: oldest non-priority line dropped');
  E.end(cur);
  eq((await a).spoken, true, 'first line resolves spoken:true on end');
  await wait(20);
  ok(ends >= 1, 'onEnd fired');
  eq(E.texts().slice(-1)[0], 'two', 'priority line kept and spoken next');
  E.end(); await wait(20);
  eq(E.texts().slice(-1)[0], 'three', 'then the next waiting line');
  E.end(); await wait(20);
  eq(E.texts().slice(-1)[0], 'four', 'then the newest line');
  E.end(); await Promise.all([c, d, d2]);
  // a flood of priority lines never drops the prompt (opts.prompt) and keeps ≤ 6 waiting
  { const cur2 = V2.say('speaking now'); await wait(20);
    const pr = V2.say('the question', { prompt: true, tag: 'prompt' }), cs = [];
    for (let i = 0; i < 8; i++) cs.push(V2.say('count ' + i, { priority: true, tag: 'count' }));
    ok(V2.queuedTags().length <= 6 && V2.queuedTags()[0] === 'prompt', 'priority flood: prompt kept, ≤ 6 waiting: ' + V2.queuedTags().join(','));
    eq(V2.dropTagged('count'), 5, 'dropTagged drops the 5 waiting count lines');
    ok(V2.queuedTags().every(t => t === 'prompt'), 'only the prompt left');
    E.end(); await wait(20); E.end(); await pr; await cur2; await Promise.all(cs); }
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
  // vi: "Nim" goes to TTS as written, letter names are rewritten; the speech-bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là nhím Nim. Bé nhảy lên chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là nhím Nim. Bé nhảy lên chữ bờ nhé!', 'vi utterance: "Nim" kept, "chữ bờ"');
  eq(startText, 'Mình là nhím Nim. Bé nhảy lên chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animal', { animal: 'duck' }, { lang: 'vi' });
  ok(/^(Bé nhảy tới con vịt nhé!|Con vịt ở đâu nhỉ\? Bé nhảy tới nào!|Bé tìm con vịt rồi nhảy nhé!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
  await wait(20); E.end(); await sk;
  // disabled → nothing spoken but logged
  V2.setEnabled(false);
  const off = await V2.say('muted');
  eq(off.reason, 'off', 'disabled voice resolves off');
  ok(V2.log.some(e => e.text === 'muted'), 'muted lines are still logged');
  V2.setEnabled(true);
  // test speed (?speed=N > 1): log only, nothing reaches the synthesizer
  const nBefore = E.texts().length;
  V2.setSpeed(8);
  eq(V2.getSpeed(), 8, 'setSpeed / getSpeed');
  const fast = await V2.say('fast line', { interrupt: true });
  eq(fast.reason, 'speed', 'speed > 1 → say resolves "speed"');
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read NH.debug.voiceLog)');
  await wait(120);
  eq(E.texts().length, nBefore, 'speed > 1: nothing spoken');
  V2.setSpeed(1);
  const Esp = fakeSynthEnv({ extra: { location: { search: '?bot=1&speed=4&mute=1' } } });
  Esp.V.init({ lang: 'en' });
  eq(Esp.V.getSpeed(), 4, 'init() reads ?speed= from the URL');
  eq((await Esp.V.say('url speed')).reason, 'speed', '?speed=4 → log only');

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
  E3.NH.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['duck', 'pig', 'penguin']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'a piggy')] });
  eq((await pr2).id, 'pig', 'interim match resolves after a short wait');
  // Talk "where does it live": vi home words without diacritics
  const prH = V2.listen({ lang: 'vi', choices: ch('vi', 'home', ['farm', 'ice', 'jungle']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(true, 'o xu bang')] });
  eq((await prH).id, 'ice', 'vi "o xu bang" → ice');
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
