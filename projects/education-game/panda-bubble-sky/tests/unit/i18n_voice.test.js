#!/usr/bin/env node
// Bao's Bubble Sky — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/panda-bubble-sky:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (§5.1 content, §6 voice). When the bubble content.js exists
// (PB.Content making rounds with `bubbles` + `rule`), every prompt / Talk key + params it produces and the right line of
// every target / the wrong line of every other bubble are rendered too.
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
  return sb.PB;
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
const r0 = () => 0, r5 = () => 0.5, r9 = () => 0.99;
const RNGS = [r0, r5, r9];
function tidy(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  if (/[{}]/.test(s) || /undefined|null|NaN|\[object/.test(s)) return false;
  if (/\s[!?.,]/.test(s) || /^[!?.,—]/.test(s) || /_/.test(s) || /\s{2}/.test(s)) return false;
  if (/màu màu|\bthe the\b|\bcon con\b|\ba the\b|\bthe a\b|hình hình|cái cái|chữ chữ|số số|nhỏ nhỏ|\bto to\b|bong bóng bong bóng|ở ở|sống sống/i.test(s)) return false;
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
const TOYS = ['ball', 'duck', 'umbrella', 'kite', 'car'];
const ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
const HOME = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
  crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
const HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.countPop', 'p.countSel', 'p.animal', 'p.home',
  'p.letters', 'p.lower', 'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const VI_NAMES = {
  toy: { ball: 'quả bóng', duck: 'con vịt cao su', umbrella: 'cái ô', kite: 'con diều', car: 'chiếc xe ô tô' },
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
const TOY_INITIAL = { en: { ball: 'B', duck: 'D', umbrella: 'U', kite: 'K', car: 'C' }, vi: { ball: 'B', duck: 'V', umbrella: 'O', kite: 'D', car: 'X' } };

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.PB = { debug: { voiceLog: [] } };
let PB;
try { PB = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = PB.I18N, V = PB.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  ok(!/Kiki|Camp Chimes|Farm Parade|puppy|\bcún\b|\bBo\b(?!’s)|hay bale|apples?\b(?! novelty)/i.test(src.replace(/ui\.tapBo|tapBo/g, '')), `${f}: no sister-game names left (Bo / parade / barn / apples …)`);
}
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.SHAPES.slice().sort()), JSON.stringify(SHAPES.slice().sort()), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.TOYS), JSON.stringify(TOYS), 'I18N.TOYS = DESIGN list');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.HOMES), JSON.stringify(HOMES), 'I18N.HOMES = DESIGN list');
eq(JSON.stringify(I.ANIMAL_HOME), JSON.stringify(HOME), 'I18N.ANIMAL_HOME = PB.ANIMALS of DESIGN §5.1');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
eq(JSON.stringify(Object.keys(I.PROMPTS).sort()), JSON.stringify(PROMPT_KEYS.slice().sort()), 'I18N.PROMPTS = the DESIGN prompt keys');
for (const fn of ['t', 'ask', 'name', 'words', 'choiceWords', 'initial', 'bareWord', 'initialOf', 'phrase', 'sayName', 'sayRight',
  'sayWrong', 'sayWrongHint', 'sayCount', 'sayCountRun', 'countList', 'talkWrong', 'speech', 'setChild', 'has', 'keys', 'raw',
  'kindValue', 'homeOf', 'numberName', 'stripMarks'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(JSON.stringify(enKeys), JSON.stringify(viKeys), 'en and vi have the same key set');
for (const k of enKeys) {
  eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `"${k}" has the same {params} in en and vi`);
  eq(Array.isArray(I.raw('vi', k)), Array.isArray(I.raw('en', k)), `"${k}" variant list in both or neither`);
}
const REQUIRED = ['hint', 'idle', 'praise', 'great', 'rainbow', 'whoosh', 'blow', 'poke', 'party', 'session.done',
  'weather.0', 'weather.1', 'weather.2', 'weather.3', 'surprise.bird', 'bird.tap', 'surprise.kite', 'kite.tap',
  'surprise.snow', 'snow.tap', 'p.any', 'right.any', 'wrong.any', 'goal.any', 'right.thing', 'right.home', 'right.more1',
  'right.moreN', 'wrong.is', 'wrong.hint',
  'talk.intro', 'talk.right', 'talk.color', 'talk.colors', 'talk.shape', 'talk.shapes', 'talk.count', 'talk.home',
  'talk.animals', 'talk.who', 'talk.letters', 'talk.lower', 'talk.initial', 'talk.add', 'talk.sub', 'talk.oddeven',
  'talk.wrong', 'talk.wrong.any', 'talk.wrong.home', 'talk.wrong.stars']
  .concat(TOPICS.map(t => 'topic.' + t));
for (let i = 0; i <= 20; i++) REQUIRED.push('count.' + i);
for (const k of REQUIRED) ok(I.has('en', k) && I.has('vi', k), `key ${k} exists in both languages`);
// every prompt: 3 wordings (+ .many 3) and the first-time forms
for (const k of PROMPT_KEYS) {
  for (const s of ['', '.first']) ok(I.has('en', k + s) && I.has('vi', k + s), `${k}${s} exists`);
  ok([].concat(I.raw('en', k)).length >= 3 && [].concat(I.raw('vi', k)).length >= 3, `${k} has 3 wordings`);
  if (I.has('en', k + '.many')) {
    ok([].concat(I.raw('en', k + '.many')).length >= 3, `${k}.many has 3 wordings`);
    ok(I.has('en', k + '.many.first'), `${k}.many.first exists`);
  }
}
for (const k of ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.animal', 'p.home', 'p.letters', 'p.initial', 'p.add', 'p.sub', 'p.oddeven'])
  ok(I.has('en', k + '.many'), `${k} has a plural form`);
// ui keys used by index.html / ui.js / main.js
const UI_USED = new Set();
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
  const p = path.join(ROOT, 'game', f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)) UI_USED.add(m[1]);
  for (const m of src.matchAll(/['"`](ui\.[A-Za-z.]+)['"`]/g)) UI_USED.add(m[1]);
}
for (const k of UI_USED) ok(I.has('en', k) && I.has('vi', k), `UI key ${k} (used by the page) exists`);
for (const k of ['ui.title', 'ui.logo1', 'ui.logo2', 'ui.subtitle', 'ui.tagline', 'ui.play', 'ui.playAgain', 'ui.home', 'ui.paused',
  'ui.resume', 'ui.settings', 'ui.holdForParents', 'ui.age', 'ui.years', 'ui.language', 'ui.name', 'ui.namePlaceholder', 'ui.sound',
  'ui.music', 'ui.volume', 'ui.quieter', 'ui.louder', 'ui.voice', 'ui.mic', 'ui.done', 'ui.stars', 'ui.chapter', 'ui.allDone',
  'ui.welcome', 'ui.micUnsupported', 'ui.micDenied', 'ui.voiceMissing', 'ui.tapOrSay', 'ui.listening', 'ui.tapBo', 'ui.tapBao',
  'ui.tapHint', 'ui.doorHint', 'ui.skip', 'ui.gallery', 'ui.langName.en', 'ui.langName.vi'])
  ok(I.has('en', k) && I.has('vi', k), `parade ui key ${k} kept`);

section('titles, Bao, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.logo1'), 'Bao’s', 'en logo1');
eq(I.t('en', 'ui.logo2'), 'Bubble Sky', 'en logo2');
eq(I.t('vi', 'ui.logo1'), 'Gấu Trúc Bảo', 'vi logo1');
eq(I.t('vi', 'ui.logo2'), 'Thổi Bong Bóng', 'vi logo2');
eq(I.t('en', 'ui.voice'), 'Bao’s voice', 'en ui.voice');
eq(I.t('vi', 'ui.voice'), 'Giọng của Bảo', 'vi ui.voice');
eq(I.t('en', 'ui.title'), 'Bao’s Bubble Sky', 'en title');
eq(I.t('vi', 'ui.title'), 'Gấu Trúc Bảo Thổi Bong Bóng', 'vi title');
ok(/Bảo/.test(I.t('vi', 'ui.listening')) && /Bao/.test(I.t('en', 'ui.listening')), 'listening names Bao / Bảo');
for (const k of viKeys) {
  if (/^(ui\.langName|count\.[0-9]+$|ui\.logo|ui\.stars)/.test(k)) continue;
  const v = [].concat(I.raw('vi', k)).join(' ');
  if (/^[\d\s{}a-z+−?!.,]*$/i.test(v)) continue;
  ok(VI_DIACRITIC.test(v) || /^[A-Za-z]+[!.]?$/.test(v), `vi "${k}" has Vietnamese diacritics: ${v}`);
}
for (const k of PROMPT_KEYS) {
  const all = [].concat(I.raw('vi', k), I.raw('vi', k + '.many') || []).join(' | ');
  ok(/(Bé|bé)/.test(all) && /(nhé|nhỉ|nào)/.test(all), `vi ${k} is warm (bé … nhé / nhỉ / nào): ${all}`);
}

section('no negative words in any line');
for (const l of I.langs) for (const k of I.keys(l)) for (const s of [].concat(I.raw(l, k))) {
  ok(positive(s), `${l} ${k} positive: ${s}`);
  if (!/^ui\./.test(k)) ok(!/\bnot\b/i.test(s), `${l} ${k}: the game never asks with "not": ${s}`);
}

section('every string renders: no "{" left, tidy punctuation, the child name');
const SAMPLE = { n: 3, k: 2, stars: 9, color: 'red', shape: 'star', size: 'big', animal: 'penguin', home: 'ice', letter: 'B',
  lower: 'b', parity: 'even', a: 2, b: 3, word: 'cow', answer: 'red', thing: { kind: 'toy', obj: 'ball', color: 'red' },
  who: 'penguin', what: '4 stars', expr: '2+3', ans: '5', num: 'three', first: 'B', season: 'winter' };
for (const l of I.langs) for (const k of I.keys(l)) for (const rng of RNGS) for (const child of ['', 'Mai']) {
  const s = I.t(l, k, Object.assign({ child }, SAMPLE), rng);
  ok(tidy(s) || /^(ui\.(langName|years|namePlaceholder|stars)|ui\.logo)/.test(k) || /^Ví dụ|^e\.g\./.test(s), `${l} ${k} renders tidy (child "${child}"): ${s}`);
  ok(!/\{|\}|undefined|NaN/.test(s), `${l} ${k} has no raw params: ${s}`);
  if (!child) ok(!/friend|Mai/.test(s) || k === 'ui.namePlaceholder' || /friends? who/.test(s), `${l} ${k} without a name reads naturally: ${s}`);
}
for (const k of ['great', 'idle', 'rainbow', 'session.done', 'talk.right', 'ui.welcome']) {
  const pool = [].concat(I.raw('en', k));
  for (let i = 0; i < 20; i++) {
    for (const l of I.langs) {
      const s = I.t(l, k, { child: '', stars: 5 }, () => i / 20);
      ok(!/\bfriend\b|bé bé|,\s*!/.test(s) && tidy(s), `${l} ${k} with an empty name: ${s}`);
    }
  }
  ok(pool.some(s => /\{child\}/.test(s)) || k === 'session.done', `${k} has a {child} variant`);
}
I.setChild('Mai');
ok(/Mai/.test(I.t('en', 'ui.welcome')), 'setChild → the welcome greets the child');
ok(/bé Mai/.test(I.t('vi', 'ui.welcome')), 'vi welcome "bé Mai"');
I.setChild('');
ok(!/Mai|friend/.test(I.t('en', 'ui.welcome')), 'empty child → welcome without a name');

section('prompts: DESIGN examples, every value × k = 1 / k > 1 × first');
eq(I.ask('en', 'p.colors', { color: 'red', k: 1 }, { first: true }), 'Look at the bubbles! Pop the red one!', 'en first colours');
eq(I.ask('en', 'p.colors', { color: 'red', k: 2 }, { rng: r0 }), 'Pop the red ones!', 'en plural colours');
eq(I.ask('vi', 'p.colors', { color: 'red', k: 2 }, { rng: r0 }), 'Bé chọc các bong bóng màu đỏ nhé!', 'vi plural colours');
eq(I.ask('en', 'p.countPop', { n: 3, k: 3 }, { rng: r0 }), 'Pop 3 bubbles!', 'en countPop');
eq(I.ask('vi', 'p.countPop', { n: 3, k: 3 }, { rng: r0 }), 'Bé chọc 3 bong bóng nhé!', 'vi countPop');
eq(I.ask('en', 'p.countSel', { n: 4, k: 1 }, { rng: r0 }), 'Pop the bubble with 4 stars!', 'en countSel');
eq(I.ask('en', 'p.countSel', { n: 1, k: 1 }, { rng: r0 }), 'Pop the bubble with 1 star!', 'en countSel singular star');
eq(I.ask('en', 'p.animal', { animal: 'cow', k: 1 }, { rng: r0 }), 'Pop the cow!', 'en animal');
eq(I.ask('en', 'p.home', { home: 'farm', k: 2 }, { rng: r0 }), 'Who lives on the farm? Pop them!', 'en home plural');
eq(I.ask('en', 'p.home', { home: 'ice', k: 1 }, { rng: r0 }), 'Pop the one who lives on the ice!', 'en home k = 1');
eq(I.ask('vi', 'p.home', { home: 'farm', k: 2 }, { rng: r0 }), 'Ai sống ở nông trại? Bé chọc nào!', 'vi home plural');
eq(I.ask('en', 'p.oddeven', { parity: 'even', k: 2 }, { rng: r0 }), 'Pop the even numbers!', 'en odd/even');
eq(I.ask('en', 'p.colors', {}, { rng: r0 }), 'Pop a bubble!', 'missing param → p.any');
const PROMPT_VALUES = {
  'p.colors': COLORS.map(c => ({ color: c })), 'p.shapes': SHAPES.map(s => ({ shape: s })), 'p.shapes5': SHAPES.map(s => ({ shape: s })),
  'p.size': [{ big: true }, { big: false }], 'p.countPop': [2, 3, 4, 5, 6, 7, 8].map(n => ({ n })),
  'p.countSel': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ n })), 'p.animal': ANIMALS.map(a => ({ animal: a })),
  'p.home': HOMES.map(h => ({ home: h })), 'p.letters': LETTERS.map(x => ({ letter: x })), 'p.lower': LETTERS.map(x => ({ letter: x })),
  'p.initial': LETTERS.map(x => ({ letter: x })), 'p.add': [2, 5, 10, 14, 20].map(n => ({ n })), 'p.sub': [0, 1, 3, 7].map(n => ({ n })),
  'p.oddeven': [{ parity: 'odd' }, { parity: 'even' }]
};
for (const pk of PROMPT_KEYS) for (const l of I.langs) for (const base of PROMPT_VALUES[pk]) for (const k of [1, 2, 3]) for (const first of [false, true]) for (const rng of RNGS) {
  const params = Object.assign({ k }, base);
  if (pk === 'p.countPop') params.k = base.n;
  const s = I.ask(l, pk, params, { first, rng });
  ok(tidy(s) && positive(s), `${l} ${pk} ${JSON.stringify(params)} first ${first}: ${s}`);
  ok(!/^(Pop a bubble|Which bubble will you pop|Pop, pop! Find|Bé chọc bong bóng nhé|Bé chọc bong bóng nào nhỉ|Bụp bụp! Bé tìm)/.test(s), `${l} ${pk} uses its own wording: ${s}`);
  if (first) ok(/Look|Lots|Big|Let’s|Count|Listen|xem|Nhiều|Có|Mình|đếm|nghe/.test(s), `${l} ${pk} first form: ${s}`);
  if (pk === 'p.colors' && l === 'en') ok(new RegExp(k > 1 ? 'ones' : 'one\\b').test(s), `en colours k ${k} singular/plural: ${s}`);
  if (pk === 'p.colors' && l === 'vi') ok(s.includes(I.name('vi', 'color', base.color)), `vi colours names the colour: ${s}`);
  if (pk === 'p.shapes' && l === 'en' && k > 1) ok(s.includes(I.name('en', 'shapes', base.shape)), `en shapes plural noun: ${s}`);
  if (pk === 'p.home') ok(s.includes(l === 'en' ? EN_HOME_AT[base.home] : 'sống ở ' + VI_NAMES.home[base.home]), `${l} home preposition: ${s}`);
  if (pk === 'p.countSel' && l === 'en') ok(/\b1 star\b/.test(s) === (base.n === 1), `en countSel star/stars: ${s}`);
}
// the three wordings differ
for (const pk of PROMPT_KEYS) for (const l of I.langs) {
  const p = Object.assign({ k: 1 }, PROMPT_VALUES[pk][0]);
  const set = new Set(RNGS.map(r => I.ask(l, pk, p, { rng: r })));
  ok(set.size === 3, `${l} ${pk}: 3 different wordings (${[...set].join(' / ')})`);
}

section('names for every kind × value (DESIGN §6)');
for (const l of I.langs) {
  for (const c of COLORS) ok(I.name(l, 'color', c).length > 0 && I.name(l, 'color', c) !== c || l === 'en', `${l} color ${c}`);
  for (const s of SHAPES) ok(I.name(l, 'shape', s).length > 0, `${l} shape ${s}`);
  for (const a of ANIMALS) ok(I.name(l, 'animal', a).length > 0, `${l} animal ${a}`);
  for (const t of TOYS) ok(I.name(l, 'toy', t).length > 0, `${l} toy ${t}`);
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
eq(I.name('en', 'toy', 'duck'), 'duck', 'en toy duck');
// thing names
const TH = (o) => Object.assign({}, o);
eq(I.name('en', 'thing', TH({ kind: 'toy', obj: 'ball', color: 'red' })), 'red ball', 'en thing red ball');
eq(I.name('vi', 'thing', TH({ kind: 'toy', obj: 'ball', color: 'red' })), 'quả bóng màu đỏ', 'vi thing quả bóng màu đỏ');
eq(I.name('en', 'thing', TH({ kind: 'stars', n: 3 })), '3 stars', 'en thing 3 stars');
eq(I.name('vi', 'thing', TH({ kind: 'stars', n: 3 })), '3 ngôi sao', 'vi thing 3 ngôi sao');
eq(I.name('en', 'thing', TH({ kind: 'stars', n: 1 })), '1 star', 'en thing 1 star');
eq(I.name('en', 'thing', TH({ kind: 'shape', shape: 'star', color: 'blue' })), 'blue star', 'en thing blue star');
eq(I.name('vi', 'thing', TH({ kind: 'shape', shape: 'star', color: 'blue' })), 'ngôi sao màu xanh dương', 'vi thing ngôi sao màu xanh dương');
eq(I.name('en', 'thing', TH({ kind: 'toy', obj: 'car', color: 'green', big: false })), 'little green car', 'en little car');
eq(I.name('vi', 'thing', TH({ kind: 'toy', obj: 'car', color: 'green', big: false })), 'chiếc xe ô tô nhỏ màu xanh lá', 'vi xe nhỏ');
eq(I.name('en', 'thing', TH({ kind: 'tile', text: 'a' })), 'small a', 'en tile small a');
eq(I.name('vi', 'thing', TH({ kind: 'tile', text: 'B' })), 'chữ B', 'vi tile chữ B');
eq(I.name('en', 'thing', TH({ kind: 'tile', text: '3+2' })), '3 + 2', 'en tile 3 + 2');
eq(I.name('vi', 'thing', TH({ kind: 'animal', animal: 'penguin' })), 'chim cánh cụt', 'vi animal thing');
eq(I.phrase('en', TH({ kind: 'toy', obj: 'umbrella', color: 'orange' }), { art: 'a' }), 'an orange umbrella', 'en an orange umbrella');
eq(I.sayName('en', TH({ kind: 'animal', animal: 'cow' })), 'the cow', 'sayName the cow');
for (const l of I.langs) {
  for (const o of TOYS) for (const c of COLORS) for (const big of [true, false, undefined]) {
    const s = I.name(l, 'thing', { kind: 'toy', obj: o, color: c, big });
    ok(s.includes(I.name(l, 'toy', o)) && s.includes(I.name(l, 'color', c)), `${l} toy thing ${o} ${c}: ${s}`);
    if (l === 'vi') ok(s.indexOf(VI_NAMES.toy[o]) === 0, `vi colour after the noun: ${s}`);
  }
  for (const sh of SHAPES) for (const c of COLORS) ok(I.name(l, 'thing', { kind: 'shape', shape: sh, color: c }).length > 3, `${l} shape thing ${sh} ${c}`);
  for (let n = 1; n <= 12; n++) ok(/^\d+ /.test(I.name(l, 'thing', { kind: 'stars', n })), `${l} stars ${n}`);
}

section('initial(): first letter of the bare noun, both languages');
for (const l of I.langs) {
  for (const a of ANIMALS) eq(I.initial(l, 'animal', a), INITIAL[l][a], `${l} initial ${a}`);
  for (const a of ANIMALS) eq(I.initial(l, { kind: 'animal', animal: a }), INITIAL[l][a], `${l} initial(thing) ${a}`);
  for (const t of TOYS) eq(I.initial(l, { kind: 'toy', obj: t, color: 'red' }), TOY_INITIAL[l][t], `${l} initial toy ${t}`);
  for (const t of TOYS) eq(I.initial(l, 'toy', t), TOY_INITIAL[l][t], `${l} initial('toy') ${t}`);
}
eq(I.bareWord('vi', { kind: 'toy', obj: 'ball' }), 'bóng', 'vi bare word without classifier');
eq(I.bareWord('vi', 'animal', 'cow'), 'bò', 'vi bare animal');

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
for (const l of I.langs) {
  for (const [kind, vals] of [['color', COLORS], ['shape', SHAPES], ['toy', TOYS], ['animal', ANIMALS], ['home', HOMES],
    ['parity', ['odd', 'even']], ['size', ['big', 'small']], ['season', SEASONS], ['letter', LETTERS.slice(0, 10)]]) {
    const seen = {};
    for (const v of vals) {
      const ws = I.words(l, kind, v);
      ok(ws.length > 0 && ws.every(w => w === w.toLowerCase()), `${l} words ${kind} ${v} lower-case`);
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
  }
  ok(I.words(l, 'number', 3).includes('3'), `${l} digits accepted`);
}
ok(I.words('vi', 'home', 'jungle').includes('rung ram'), 'vi no-diacritic home');
ok(I.words('en', 'toy', 'duck').includes('rubber duck'), 'en rubber duck accepted');
ok(I.words('vi', 'toy', 'ball').includes('qua bong'), 'vi "qua bong" accepted');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'color', color: 'red' } }).includes('red'), 'choiceWords colour blob');
ok(I.choiceWords('vi', { id: 'a', thing: { kind: 'home', home: 'ice' } }).includes('xứ băng'), 'choiceWords home badge');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'number', n: 4 } }).includes('four'), 'choiceWords number');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'stars', n: 4 } }).includes('4'), 'choiceWords stars thing');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'animal', animal: 'pig' } }).includes('piggy'), 'choiceWords animal');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'shape', shape: 'triangle', color: 'red' } }).includes('triangle'), 'choiceWords shape');

section('game lines: sayRight / sayWrong for every topic thing kind (DESIGN §6 examples)');
// DESIGN / REQUIREMENT examples
eq(I.sayRight('en', { thing: { kind: 'toy', obj: 'ball', color: 'red' }, left: 0, k: 1, i: 0, rule: { kind: 'color', value: 'red' } }, r0), 'A red ball!', 'en right: A red ball!');
eq(I.sayRight('vi', { thing: { kind: 'toy', obj: 'ball', color: 'red' }, left: 0, k: 1, i: 0, rule: { kind: 'color', value: 'red' } }, r0), 'Quả bóng màu đỏ!', 'vi right: Quả bóng màu đỏ!');
eq(I.sayRight('en', { thing: { kind: 'toy', obj: 'ball', color: 'red' }, left: 1, k: 2, i: 0, rule: { kind: 'color', value: 'red' } }, r0), 'A red ball! One more red one!', 'en right + one more red one');
eq(I.sayRight('vi', { thing: { kind: 'toy', obj: 'ball', color: 'red' }, left: 1, k: 2, i: 0, rule: { kind: 'color', value: 'red' } }, r0), 'Quả bóng màu đỏ! Còn một cái màu đỏ nữa!', 'vi right + còn một cái màu đỏ nữa');
eq(I.sayRight('en', { thing: { kind: 'shape', shape: 'star', color: 'blue' }, left: 2, k: 3, i: 0, rule: { kind: 'shape', value: 'star' } }, r0), 'A blue star! Two more!', 'en two more');
eq(I.sayRight('vi', { thing: { kind: 'shape', shape: 'star', color: 'blue' }, left: 1, k: 2, i: 0, rule: { kind: 'shape', value: 'star' } }, r0), 'Ngôi sao màu xanh dương! Còn một cái nữa!', 'vi còn một cái nữa');
eq(I.sayRight('en', { thing: { kind: 'animal', animal: 'penguin' }, home: 'ice', left: 0, rule: { kind: 'home', value: 'ice' } }, r0), 'The penguin lives on the ice!', 'en home line');
eq(I.sayRight('vi', { thing: { kind: 'animal', animal: 'penguin' }, home: 'ice', left: 0, rule: { kind: 'home', value: 'ice' } }, r0), 'Chim cánh cụt sống ở xứ băng!', 'vi home line');
eq(I.sayRight('vi', { thing: { kind: 'animal', animal: 'cow' }, home: 'farm', left: 1, rule: { kind: 'home', value: 'farm' } }, r0), 'Con bò sống ở nông trại! Còn một bạn nữa!', 'vi home + còn một bạn nữa');
eq(I.sayRight('en', { thing: { kind: 'stars', n: 4 }, left: 0, rule: { kind: 'n', value: 4 } }, r0), 'One, two, three, four! Four stars!', 'en countSel run');
eq(I.sayRight('en', { thing: { kind: 'toy', obj: 'duck', color: 'red' }, mode: 'countPop', count: 2, left: 1, rule: { kind: 'count', value: 3 } }, r0), 'Two!', 'en countPop pop 2');
eq(I.sayRight('en', { thing: { kind: 'toy', obj: 'duck', color: 'red' }, mode: 'countPop', count: 3, left: 0, rule: { kind: 'count', value: 3 } }, r0), 'Three! Three bubbles!', 'en countPop last');
eq(I.sayRight('vi', { thing: { kind: 'stars', n: 1 }, mode: 'countPop', count: 3, left: 0, promptKey: 'p.countPop', params: { n: 3 } }, r0), 'Ba! Ba bong bóng!', 'vi countPop last');
eq(I.sayWrong('en', { thing: { kind: 'toy', obj: 'duck', color: 'blue' }, got: { nameKind: 'color', nameValue: 'blue' }, want: { rule: { kind: 'color', value: 'red' } }, streak: 1 }, r0), 'That’s a blue duck. Find a red one!', 'en wrong: DESIGN example');
eq(I.sayWrong('vi', { thing: { kind: 'toy', obj: 'duck', color: 'blue' }, got: { nameKind: 'color', nameValue: 'blue' }, want: { rule: { kind: 'color', value: 'red' } }, streak: 1 }, r0), 'Đây là con vịt cao su màu xanh dương. Mình tìm cái màu đỏ nhé!', 'vi wrong: DESIGN example');
eq(I.sayWrong('en', { got: { nameKind: 'color', nameValue: 'blue' }, want: { kind: 'color', value: 'red' } }, r0), 'That’s a blue one. Find a red one!', 'en wrong rebuilt from got');
eq(I.sayWrong('en', { thing: { kind: 'animal', animal: 'lion' }, rule: { kind: 'home', value: 'farm' } }, r0), 'That’s a lion. It lives on the savanna. Who lives on the farm?', 'en wrong home teaches the home');
eq(I.sayCount('en', 1), 'One!', 'sayCount en'); eq(I.sayCount('vi', 1), 'Một!', 'sayCount vi');
eq(I.sayCountRun('en', 3, 'bubbles'), 'Three bubbles!', 'sayCountRun bubbles'); eq(I.sayCountRun('en', 4, 'stars'), 'Four stars!', 'sayCountRun stars');
eq(I.sayCountRun('vi', 4, 'stars'), 'Bốn ngôi sao!', 'sayCountRun vi'); eq(I.sayCountRun('en', 1, 'bubbles'), 'One bubble!', 'one bubble');
for (let i = 0; i <= 20; i++) for (const l of I.langs) ok(tidy(I.sayCount(l, i)), `${l} sayCount ${i}`);

// every topic thing kind × rule × left × language × wording
const SETS = [];
for (const c of COLORS) for (const o of TOYS) SETS.push({ topic: 'colors', pk: 'p.colors', params: { color: 'red' }, rule: { kind: 'color', value: 'red' }, thing: { kind: 'toy', obj: o, color: c, nameKind: 'color', nameValue: c } });
for (const s of SHAPES) for (const c of ['red', 'blue', 'pink']) SETS.push({ topic: 'shapes', pk: 'p.shapes', params: { shape: 'star' }, rule: { kind: 'shape', value: 'star' }, thing: { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s } });
for (const o of TOYS) for (const big of [true, false]) SETS.push({ topic: 'size', pk: 'p.size', params: { big: true }, rule: { kind: 'size', value: 'big' }, thing: { kind: 'toy', obj: o, color: 'green', big, nameKind: 'size', nameValue: big ? 'big' : 'small' } });
for (let n = 1; n <= 12; n++) SETS.push({ topic: 'count', pk: 'p.countSel', params: { n: 4 }, rule: { kind: 'n', value: 4 }, mode: 'match', thing: { kind: 'stars', n, nameKind: 'number', nameValue: n } });
for (const a of ANIMALS) SETS.push({ topic: 'animals', pk: 'p.animal', params: { animal: 'cow' }, rule: { kind: 'animal', value: 'cow' }, thing: { kind: 'animal', animal: a, nameKind: 'animal', nameValue: a } });
for (const a of ANIMALS) for (const h of HOMES) SETS.push({ topic: 'animals', pk: 'p.home', params: { home: h }, rule: { kind: 'home', value: h }, thing: { kind: 'animal', animal: a, home: HOME[a], nameKind: 'home', nameValue: HOME[a] } });
for (const x of LETTERS) SETS.push({ topic: 'letters', pk: 'p.letters', params: { letter: 'B' }, rule: { kind: 'letter', value: 'B' }, thing: { kind: 'tile', text: x, nameKind: 'letter', nameValue: x } });
for (const x of ['A', 'a', 'M', 'n']) SETS.push({ topic: 'lower', pk: 'p.lower', params: { letter: 'A' }, rule: { kind: 'letter', value: 'A' }, thing: { kind: 'tile', text: x, nameKind: 'letter', nameValue: x.toUpperCase() } });
for (const a of ANIMALS) SETS.push({ topic: 'initial', pk: 'p.initial', params: { letter: 'C' }, rule: { kind: 'initial', value: 'C' }, thing: { kind: 'animal', animal: a, nameKind: 'letter', nameValue: INITIAL.en[a] } });
for (const o of TOYS) SETS.push({ topic: 'initial', pk: 'p.initial', params: { letter: 'B' }, rule: { kind: 'initial', value: 'B' }, thing: { kind: 'toy', obj: o, color: 'yellow', nameKind: 'letter', nameValue: TOY_INITIAL.en[o] } });
for (const [a, b] of [[2, 3], [1, 4], [6, 4], [9, 9]]) SETS.push({ topic: 'add', pk: 'p.add', params: { n: 5 }, rule: { kind: 'sum', value: 5 }, thing: { kind: 'tile', text: a + '+' + b, nameKind: 'sum', nameValue: a + b } });
for (const [a, b] of [[7, 4], [5, 2], [9, 0]]) SETS.push({ topic: 'sub', pk: 'p.sub', params: { n: 3 }, rule: { kind: 'diff', value: 3 }, thing: { kind: 'tile', text: a + '−' + b, nameKind: 'diff', nameValue: a - b } });
for (const n of [1, 2, 7, 8, 13, 20]) SETS.push({ topic: 'oddeven', pk: 'p.oddeven', params: { parity: 'even' }, rule: { kind: 'parity', value: 'even' }, thing: { kind: 'tile', text: String(n), n, nameKind: 'parity', nameValue: n % 2 ? 'odd' : 'even' } });
let sweep = 0;
for (const S of SETS) for (const l of I.langs) for (const rng of RNGS) {
  for (const left of [0, 1, 2]) {
    const e = { id: 'b1', thing: S.thing, x: 1, y: 1, i: 0, k: left + 1, left, home: S.thing.home, topic: S.topic, promptKey: S.pk, params: S.params, rule: S.rule, mode: S.mode || 'match' };
    const s = I.sayRight(l, e, rng); sweep++;
    ok(tidy(s) && positive(s), `${l} right ${S.topic} ${JSON.stringify(S.thing)} left ${left}: ${s}`);
    ok(!/^(Pop! Yes!|You got it!|Yes! Pop!|Bụp! Đúng rồi!|Bé giỏi quá!|Đúng rồi! Bụp!)$/.test(s), `${l} right names the thing: ${s}`);
    if (left === 1) ok(/One more|one more|Just one|một (cái|bạn)/.test(s), `${l} right left 1 → one more: ${s}`);
    if (left === 2) ok(/Two more|two more|hai (cái|bạn)/.test(s), `${l} right left 2 → two more: ${s}`);
    if (left === 0) ok(!/more|nữa/.test(s), `${l} right left 0 → nothing more: ${s}`);
    if (S.thing.kind === 'stars') ok(s.startsWith(I.countList(l, S.thing.n)), `${l} countSel counts aloud: ${s}`);
    if (S.rule.kind === 'home') ok(s.includes(I.name(l, 'homeAt', S.thing.home)), `${l} home line names the home: ${s}`);
  }
  for (const streak of [1, 2, 4]) {
    const e = { id: 'b2', thing: S.thing, got: { nameKind: S.thing.nameKind, nameValue: S.thing.nameValue }, want: { rule: S.rule }, streak, x: 1, y: 1, topic: S.topic, promptKey: S.pk, params: S.params };
    const s = I.sayWrong(l, e, rng); sweep++;
    ok(tidy(s) && positive(s), `${l} wrong ${S.topic} ${JSON.stringify(S.thing)}: ${s}`);
    ok(/[.!?] \p{Lu}/u.test(s), `${l} wrong names it, then the goal: ${s}`);
    const h = I.sayWrongHint(l, e, rng);
    ok(tidy(h) && positive(h), `${l} wrongHint ${S.topic}: ${h}`);
    // without the thing: rebuilt from got
    const s2 = I.sayWrong(l, { got: e.got, want: S.rule, streak }, rng);
    ok(tidy(s2) && positive(s2), `${l} wrong from got only ${S.topic}: ${s2}`);
  }
}
// countPop: every pop
for (const l of I.langs) for (let n = 2; n <= 9; n++) for (let c = 1; c <= n; c++) {
  const s = I.sayRight(l, { thing: { kind: 'stars', n: 1 }, mode: 'countPop', count: c, i: c - 1, k: n, left: n - c, topic: 'count', promptKey: 'p.countPop', params: { n } });
  ok(tidy(s) && s.startsWith(I.sayCount(l, c)), `${l} countPop ${c}/${n}: ${s}`);
  ok((c === n) === /bubble|bong bóng/.test(s), `${l} countPop total only at the end: ${s}`);
}
// rule missing → from promptKey + params
eq(I.sayWrong('en', { thing: { kind: 'toy', obj: 'kite', color: 'green' }, promptKey: 'p.colors', params: { color: 'yellow', k: 2 } }, r0), 'That’s a green kite. Find a yellow one!', 'rule from promptKey');
ok(tidy(I.sayRight('en', {})) && tidy(I.sayWrong('vi', {})), 'empty events still say something kind');
console.log(`   (${sweep} right / wrong lines rendered)`);

section('talk');
const TALKS = [['talk.color', {}], ['talk.colors', {}], ['talk.colorsWhich', { color: 'red' }], ['talk.shape', { shape: 'triangle' }],
  ['talk.shapes', { shape: 'triangle' }], ['talk.count', {}], ['talk.home', { animal: 'penguin' }], ['talk.animals', { animal: 'fishbowl' }],
  ['talk.who', {}], ['talk.size', { size: 'big' }], ['talk.letters', { letter: 'B' }], ['talk.lower', { letter: 'B' }],
  ['talk.initial', { letter: 'C', nameKind: 'animal', nameValue: 'cow' }], ['talk.add', { a: 2, b: 3 }], ['talk.sub', { a: 7, b: 2 }],
  ['talk.oddeven', { parity: 'odd' }]];
for (const [k, p] of TALKS) for (const l of I.langs) { const s = I.t(l, k, p); ok(tidy(s) && s !== k, `${l} ${k}: ${s}`); }
eq(I.t('en', 'talk.count'), 'How many stars?', 'talk count');
eq(I.t('en', 'talk.home', { animal: 'penguin' }), 'Where does the penguin live?', 'talk home');
eq(I.t('vi', 'talk.home', { animal: 'penguin' }), 'Chim cánh cụt sống ở đâu nhỉ?', 'vi talk home');
eq(I.t('en', 'talk.who'), 'Who is this?', 'talk who');
eq(I.t('en', 'talk.initial', { letter: 'C', nameKind: 'animal', nameValue: 'cow' }), 'Which letter does cow start with?', 'talk initial never says the letter');
eq(I.talkWrong('en', { id: 'h', thing: { kind: 'home', home: 'ice' } }, { show: { kind: 'animal', animal: 'penguin' } }), 'The penguin lives on the ice! Good try!', 'talkWrong home');
eq(I.talkWrong('vi', { id: 'h', thing: { kind: 'home', home: 'ice' } }, { show: { kind: 'animal', animal: 'penguin' } }), 'Chim cánh cụt sống ở xứ băng đó! Bé cố gắng lắm!', 'vi talkWrong home');
eq(I.talkWrong('en', { id: 'n', thing: { kind: 'number', n: 4 } }, { topic: 'count' }), 'There are 4 stars! Good try!', 'talkWrong stars');
eq(I.talkWrong('en', { id: 'n', thing: { kind: 'number', n: 1 } }, { topic: 'count' }), 'There is 1 star! Good try!', 'talkWrong one star');
eq(I.talkWrong('en', 'color', 'blue'), 'It is blue! Good try!', 'talkWrong colour');
for (const l of I.langs) {
  for (const c of COLORS) ok(tidy(I.talkWrong(l, 'color', c)), `${l} talkWrong ${c}`);
  for (const s of SHAPES) ok(tidy(I.talkWrong(l, 'shape', s)), `${l} talkWrong ${s}`);
  for (const a of ANIMALS) ok(tidy(I.talkWrong(l, 'animal', a)), `${l} talkWrong ${a}`);
  for (const h of HOMES) for (const a of ANIMALS) ok(tidy(I.talkWrong(l, { id: 'x', thing: { kind: 'home', home: h } }, { show: { kind: 'animal', animal: a } })), `${l} talkWrong home ${h} ${a}`);
  for (let n = 0; n <= 12; n++) ok(tidy(I.talkWrong(l, 'number', n, { topic: 'count' })), `${l} talkWrong n ${n}`);
  for (const x of ['B', 'b']) ok(tidy(I.talkWrong(l, 'letter', x)), `${l} talkWrong letter ${x}`);
  for (const sz of [{ kind: 'size', big: true }, { kind: 'size', big: false }]) ok(tidy(I.talkWrong(l, { id: 's', thing: sz })), `${l} talkWrong size`);
}

// ------------------------------------------------------------------ content.js (bubbles) when it exists
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  try {
    const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
    if (/bubbles/.test(csrc) && !/oddId/.test(csrc)) {
      const sbc = makeSandbox(); sbc.PB = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.PB.Content && sbc.PB.Content.makeRound) contentSB = sbc;
    }
  } catch (e) { ok(false, 'content.js load: ' + e.message); }
}
console.log(`   (${contentSB ? 'bubble content.js loaded' : 'bubble content.js not there yet — content checks skipped'})`);
if (contentSB) {
  section('content.js: every promptKey / Talk key / bubble it produces');
  const CF = contentSB.PB, C = CF.Content;
  for (const a of Object.keys(CF.ANIMALS || {})) ok(I.ANIMALS.includes(a), `content animal ${a} has names`);
  for (const o of CF.TOYS || []) ok(I.TOYS.includes(o), `content toy ${o} has names`);
  for (const c of CF.COLORS || []) ok(I.COLORS.includes(c), `content colour ${c} has names`);
  const AGE_TOPICS = CF.AGE_TOPICS || {};
  let rounds = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of (AGE_TOPICS[age] || [])) for (const lang of I.langs) for (let ri = 0; ri < 4; ri++) {
    let round;
    try {
      const rng = CF.RNG ? new CF.RNG(age * 1000 + ri * 7 + topic.length) : { next: Math.random };
      round = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level: TOPICS.indexOf(topic) % 4 });
    } catch (e) { ok(false, `makeRound ${topic} age ${age}: ${e.message}`); continue; }
    if (!round || !round.bubbles) continue;
    rounds++;
    const ask = I.ask(lang, round.promptKey, round.params, { first: ri === 0 });
    ok(tidy(ask) && !/^(Pop a bubble|Bé chọc bong bóng nhé)/.test(ask), `${lang} age ${age} ${topic}: ask ${round.promptKey} ${JSON.stringify(round.params)} → ${ask}`);
    let popped = 0;
    for (const b of round.bubbles) {
      const base = { id: b.id, thing: b.thing, topic, promptKey: round.promptKey, params: round.params, rule: round.rule, mode: round.mode };
      if (b.target || round.mode === 'countPop') {
        if (popped >= round.k) continue;
        popped++;
        const s = I.sayRight(lang, Object.assign({ i: popped - 1, k: round.k, left: round.k - popped, home: b.thing.home, count: round.mode === 'countPop' ? popped : undefined }, base));
        ok(tidy(s) && positive(s), `${lang} age ${age} ${topic} right: ${s}`);
      } else {
        const s = I.sayWrong(lang, Object.assign({ want: { rule: round.rule }, got: { nameKind: b.thing.nameKind, nameValue: b.thing.nameValue }, streak: 1 }, base));
        ok(tidy(s) && positive(s) && !/^(Let’s look again!|Mình tìm lại nhé!)$/.test(s), `${lang} age ${age} ${topic} wrong: ${s}`);
      }
      ok(I.sayName(lang, b.thing).length > 0, `${lang} bubble thing named: ${JSON.stringify(b.thing)}`);
    }
    if (C.makeTalk && ri === 0) {
      try {
        const talk = C.makeTalk(topic, { age, lang, rng: CF.RNG ? new CF.RNG(age * 31 + topic.length) : { next: () => 0.3 } });
        if (talk) {
          const q = I.t(lang, talk.promptKey, talk.params);
          ok(tidy(q) && q !== talk.promptKey, `${lang} talk ${talk.promptKey} ${JSON.stringify(talk.params)} → ${q}`);
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

section('speech text: letters, maths, pauses, caps, "Bao"');
eq(I.speech('en', 'That’s letter D.'), 'That’s letter dee.', 'en letter names');
eq(I.speech('en', 'A duck! D is for duck!'), 'A duck! dee is for duck!', 'en "D is for"');
eq(I.speech('en', 'Pop the one that starts with C!'), 'Pop the one that starts with see!', 'en starts with');
eq(I.speech('en', 'Pop big A and small a!'), 'Pop big ay and small ay!', 'en big/small letters');
eq(I.speech('en', 'Lots of colours… but look at the shapes! Pop the RED one!'), 'Lots of colours, but look at the shapes! Pop the red one!', '… → comma pause, caps → lower');
eq(I.speech('en', '2 + 4 makes 6!'), '2 plus 4 makes 6!', 'en plus');
eq(I.speech('vi', '7 − 2 bằng 5!'), '7 trừ 2 bằng 5!', 'vi minus');
eq(I.speech('vi', 'Bé ơi, chọc chữ B nhé!'), 'Bé ơi, chọc chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Chữ m thường!'), 'Chữ mờ thường!', 'vi small letter');
eq(I.speech('vi', 'Bé chọc bong bóng MÀU ĐỎ nhé!'), 'Bé chọc bong bóng màu đỏ nhé!', 'vi caps → lower');
eq(I.speech('en', 'Hi! I am Bao.'), 'Hi! I am Bao.', 'en "Bao" as written');
eq(I.speech('vi', 'Mình là gấu trúc Bảo. Bảo giúp bé nhé!'), 'Mình là gấu trúc Bảo. Bảo giúp bé nhé!', 'vi "Bảo" as written');
eq(I.speech('en', 'Bao is listening…'), 'Bao is listening.', 'final ellipsis → full stop');
eq(V.spoken('vi', 'Chào bé! Mình là Bảo.'), 'Chào bé! Mình là Bảo.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Pop letter B!'), 'Pop letter bee!', 'Voice.spoken letter names');
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
  sb4.PB = {};
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
  // a long swipe across the beam: every move arrives, in order, even far outside the canvas (pointer capture keeps the events on the canvas)
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
  sb7.PB = {};
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
  sb5.PB = {};
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
  sb6.PB = {};
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
ok(sb.PB.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into PB.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof PB.Input.attach === 'function' && typeof PB.Input.kidProof === 'function' && typeof PB.Input.holdButton === 'function',
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
  sbx.PB = {};
  env.PB = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.PB.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.15) < 1e-9, 'Bao: rate 0.9, pitch 1.15');
  ok(V2.RATE === 0.9 && V2.PITCH === 1.15, 'Voice.RATE / PITCH exported');
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
  // vi: "Bảo" goes to TTS as written, letter names are rewritten; the bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là gấu trúc Bảo. Bé chọc chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là gấu trúc Bảo. Bé chọc chữ bờ nhé!', 'vi utterance: "Bảo" kept, "chữ bờ"');
  eq(startText, 'Mình là gấu trúc Bảo. Bé chọc chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animal', { animal: 'duck' }, { lang: 'vi' });
  ok(/^(Bé ơi, chọc bong bóng có con vịt nhé!|Con vịt ở đâu nhỉ\? Bé chọc đi nào!|Bé tìm con vịt rồi chọc nhé!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read PB.debug.voiceLog)');
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
  E3.PB.__dummy = 0;
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
