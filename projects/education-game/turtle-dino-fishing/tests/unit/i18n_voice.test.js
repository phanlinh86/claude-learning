#!/usr/bin/env node
// Tibo's Dino Lake Fishing — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/turtle-dino-fishing:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists are HARD-CODED from docs/DESIGN.md (§5.1 content, §6 voice), so the test holds while
// content.js is being rewritten. When the fishing content.js exists (TL.Content.makeRound with fish / bubble `members`),
// every prompt / Talk key + params it produces and every member's right / wrong line are rendered too.
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
  return sb.TL;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
// never negative (skill rule)
const NEG_EN = /\b(no|nope|wrong|incorrect|bad|fail|failed|mistake|oops|sorry|uh-oh|oh no)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|sai rồi|dở|tệ|hỏng|không đúng|chưa đúng|trật|nhầm|hư)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !/no!/i.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
const r0 = () => 0, r5 = () => 0.5, r9 = () => 0.99;
const RNGS = [r0, r5, r9];
function tidy(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  if (/[{}]/.test(s) || /undefined|null|NaN|\[object/.test(s)) return false;
  if (/\s[!?.,]/.test(s) || /^[!?.,—]/.test(s) || /_/.test(s) || /\s{2}/.test(s)) return false;
  if (/màu màu|\bthe the\b|\bcon con\b|\ba the\b|\bthe a\b|hình hình|chữ chữ|số số|nhỏ nhỏ|\bto to\b|chấm chấm|\bfish fish\b|con cá con cá|\bcó có\b|bạn bạn/i.test(s)) return false;
  if (/\ba [aeiou]/i.test(s.replace(/(letter|big|small|with|not|and|or) a /ig, ''))) return false;   // "a orange"
  if (/\ban [^aeiou\s]/i.test(s.replace(/(letter|big|small|with|not|and|or) an /ig, ''))) return false;
  if (!/^[\p{Lu}\d“"]/u.test(s.trim())) return false;                                              // capital first
  if (/[.!?] \p{Ll}/u.test(s)) return false;                                                        // capital after a stop
  return true;
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

// ------------------------------------------------------------------ DESIGN value lists (§5.1, §6) — hard-coded on purpose
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
const HOME = { bunny: 'forest', fox: 'forest', deer: 'forest', squirrel: 'forest', owl: 'forest', raccoon: 'forest', mouse: 'forest',
  hedgehog: 'forest', penguin: 'ice', crab: 'sea', goldfish: 'sea', camel: 'desert', lion: 'savanna' };
const ANIMALS = Object.keys(HOME);
const HOMES = ['sea', 'ice', 'forest', 'desert', 'savanna'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_KEYS = ['p.color', 'p.shape', 'p.size', 'p.count', 'p.animal', 'p.home', 'p.letter', 'p.lower', 'p.initial', 'p.add',
  'p.sub', 'p.oddeven'];
const VI_NAMES = {
  animal: { bunny: 'con thỏ', fox: 'con cáo', deer: 'con nai', squirrel: 'con sóc', owl: 'con cú', raccoon: 'con gấu mèo',
    mouse: 'con chuột', hedgehog: 'con nhím', penguin: 'chim cánh cụt', crab: 'con cua', goldfish: 'con cá vàng',
    camel: 'con lạc đà', lion: 'con sư tử' },
  home: { sea: 'biển', ice: 'xứ băng', forest: 'rừng', desert: 'sa mạc', savanna: 'đồng cỏ châu Phi' },
  shapeH: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao', heart: 'hình trái tim',
    rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' },
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' }
};
// the initial-letter topic (bubbles with guests): bare noun first letter, diacritics → base letter
const INITIAL = {
  en: { bunny: 'B', fox: 'F', deer: 'D', squirrel: 'S', owl: 'O', raccoon: 'R', mouse: 'M', hedgehog: 'H', penguin: 'P',
    crab: 'C', goldfish: 'G', camel: 'C', lion: 'L' },
  vi: { bunny: 'T', fox: 'C', deer: 'N', squirrel: 'S', owl: 'C', raccoon: 'G', mouse: 'C', hedgehog: 'N', penguin: 'C',
    crab: 'C', goldfish: 'C', camel: 'L', lion: 'S' }
};
const fish = (o) => Object.assign({ kind: 'fish' }, o);
const bub = (a) => ({ kind: 'bubble', animal: a, home: HOME[a] });

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.TL = { debug: { voiceLog: [] } };
let TL;
try { TL = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = TL.I18N, V = TL.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  ok(!/Moka|Fairy Tea|tea party|teapot|teacup|cupcake|cookie|lantern|garland|berr(y|ies)|quả dâu|bánh quy|Gấu Moka|Farm Parade|\bBo’s\b/i.test(src),
    `${f}: no sister-game names left (Moka / tea / lantern / berries …)`);
}
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.SHAPES.slice().sort()), JSON.stringify(SHAPES.slice().sort()), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN TL.GUESTS');
eq(JSON.stringify(I.GUESTS), JSON.stringify(ANIMALS), 'I18N.GUESTS = DESIGN TL.GUESTS');
eq(JSON.stringify(I.HOMES.slice().sort()), JSON.stringify(HOMES.slice().sort()), 'I18N.HOMES = DESIGN homes');
eq(JSON.stringify(I.ANIMAL_HOME), JSON.stringify(HOME), 'I18N.ANIMAL_HOME = TL.GUESTS of DESIGN §5.1');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
eq(JSON.stringify(I.MEMBER_KINDS), JSON.stringify(['fish', 'bubble']), 'I18N.MEMBER_KINDS = DESIGN thing kinds');
eq(JSON.stringify(Object.keys(I.PROMPTS).sort()), JSON.stringify(PROMPT_KEYS.slice().sort()), 'I18N.PROMPTS = the DESIGN §5.1 prompt keys');
for (const fn of ['t', 'ask', 'name', 'words', 'choiceWords', 'initial', 'bareWord', 'initialOf', 'phrase', 'sayName', 'sayRight',
  'sayWrong', 'sayWrongHint', 'sayCount', 'sayCountRun', 'talkWrong', 'speech', 'setChild', 'has', 'keys', 'raw', 'kindValue', 'homeOf',
  'thingFromName', 'ruleOf', 'spotsWord', 'numberName', 'stripMarks'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params, no empty strings');
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(JSON.stringify(enKeys), JSON.stringify(viKeys), 'en and vi have the same keys');
for (const k of enKeys) {
  eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `${k}: same {params} in en and vi`);
  for (const l of I.langs) {
    const v = [].concat(I.raw(l, k));
    ok(v.length > 0 && v.every(s => typeof s === 'string' && s.trim().length > 0), `${l} ${k}: no empty strings`);
    ok(v.every(s => s === s.trim() && !/\s{2}/.test(s)), `${l} ${k}: no stray spaces`);
  }
}
const LINE_KEYS = ['hint', 'idle', 'praise', 'great', 'enter', 'party', 'session.done', 'cast', 'bite', 'release', 'releaseFriend', 'lily',
  'pond', 'joy', 'tibo.poke', 'surprise.ptero', 'surprise.bronto', 'surprise.frog', 'surprise.fireflies', 'critter.ptero',
  'critter.bronto', 'critter.frog', 'critter.fireflies'];
const UI_KEYS = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'quieter', 'louder', 'voice',
  'mic', 'done', 'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapTibo', 'tapHint', 'skip', 'gallery', 'langName.en', 'langName.vi'].map(k => 'ui.' + k);
const RIGHT_KINDS = ['color', 'shape', 'size', 'n', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'number', 'parity', 'any'];
const WRONG_KINDS = ['color', 'shape', 'size', 'n', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'number', 'parity', 'hint', 'any'];
const TALK_KEYS = ['intro', 'colors', 'colorsAny', 'colorsWhich', 'shapes', 'shapesAny', 'size', 'sizeAny', 'count', 'countAny', 'animals',
  'home', 'homeAny', 'who', 'letters', 'lettersAny', 'lower', 'lowerAny', 'initial', 'initialAny', 'add', 'sub', 'calc', 'oddeven',
  'oddevenAny', 'right', 'wrong', 'wrong.a', 'wrong.animal', 'wrong.size', 'wrong.letter', 'wrong.small', 'wrong.number', 'wrong.spots',
  'wrong.home', 'wrong.place', 'wrong.any'].map(k => 'talk.' + k);
const REQUIRED = LINE_KEYS.concat(UI_KEYS, TALK_KEYS, ['weather.0', 'weather.1', 'weather.2', 'weather.3', 'p.any', 'p.number', 'count.run'],
  TOPICS.map(t => 'topic.' + t), PROMPT_KEYS, PROMPT_KEYS.map(k => k + '.first'), RIGHT_KINDS.map(k => 'right.' + k),
  WRONG_KINDS.map(k => 'wrong.' + k));
for (let i = 0; i <= 20; i++) REQUIRED.push('count.' + i);
for (const k of REQUIRED) for (const l of I.langs) ok(I.has(l, k), `${l} has ${k}`);
for (const k of LINE_KEYS.concat(['hint', 'idle', 'praise', 'great', 'talk.right', 'weather.0'])) ok([].concat(I.raw('en', k)).length >= 2, `${k} has variants`);
for (const k of PROMPT_KEYS) for (const l of I.langs) eq([].concat(I.raw(l, k)).length, 3, `${l} ${k}: 3 wordings`);
for (const k of RIGHT_KINDS.concat(WRONG_KINDS)) for (const l of I.langs) {
  const kk = (WRONG_KINDS.includes(k) && !RIGHT_KINDS.includes(k)) ? 'wrong.' + k : null;
  if (kk) ok([].concat(I.raw(l, kk)).length >= 3, `${l} ${kk}: ≥ 3 wordings`);
}
for (const k of RIGHT_KINDS) for (const l of I.langs) ok([].concat(I.raw(l, 'right.' + k)).length >= 3, `${l} right.${k}: ≥ 3 wordings`);
for (const k of WRONG_KINDS) for (const l of I.langs) ok([].concat(I.raw(l, 'wrong.' + k)).length >= 3, `${l} wrong.${k}: ≥ 3 wordings`);
// every ui.* / talk.* key that index.html / ui.js use exists; the T('…') keys main.js uses are listed (main is being rewritten)
const usedUi = new Set();
for (const f of ['index.html', 'js/ui.js']) {
  const p = path.join(ROOT, 'game', f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/data-i18n="([\w.]+)"/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/'((?:ui|talk)\.[\w.]+)'/g)) usedUi.add(m[1]);
}
for (const k of usedUi) ok(I.has('en', k) && I.has('vi', k), `key used by index.html / ui.js exists: ${k}`);
const mainSrc = fs.existsSync(path.join(JS, 'main.js')) ? fs.readFileSync(path.join(JS, 'main.js'), 'utf8') : '';
const mainMissing = [...new Set([...mainSrc.matchAll(/\bT1?\('([\w.]+)'/g)].map(m => m[1]))].filter(k => !I.has('en', k));
if (mainMissing.length) console.log('   note: main.js (still the tea-party copy) uses keys VOICE.md renamed: ' + mainMissing.join(', '));

section('titles, Tibo, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.title'), 'Tibo’s Dino Lake Fishing', 'en title');
eq(I.t('vi', 'ui.title'), 'Rùa Tibo Câu Cá Hồ Khủng Long', 'vi title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Tibo’s / Dino Lake Fishing', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Rùa Tibo / Câu Cá Hồ Khủng Long', 'vi logo lines');
eq(I.t('vi', 'ui.voice'), 'Giọng của Rùa Tibo', 'vi title form "Rùa Tibo" in settings');
ok(/Tibo/.test(I.t('vi', 'ui.listening')) && !/Rùa Tibo/.test(I.t('vi', 'ui.listening')), 'vi lines say "Tibo"');
for (const k of viKeys) {
  if (/^ui\.langName|^count\.|^ui\.done$/.test(k)) continue;   // "Hai!", "Ba!", "Xong" are plain Vietnamese words
  for (const s of [].concat(I.raw('vi', k))) ok(VI_DIACRITIC.test(s), `vi ${k} has diacritics: ${s}`);
}
for (const k of PROMPT_KEYS) {
  const vs = [].concat(I.raw('vi', k));
  ok(vs.some(s => /Bé ơi/.test(s) && /nhé!|nhỉ\?/.test(s)), `vi ${k}: a warm "Bé ơi, … nhé!" wording`);
  ok(vs.every(s => /nhé|nhỉ|nào|\?/.test(s)), `vi ${k}: every wording is soft (nhé / nhỉ / nào / ?)`);
  ok(/Bé ơi/.test([].concat(I.raw('vi', k + '.first'))[0]), `vi ${k}.first is warm`);
}
for (const l of I.langs) for (const k of I.keys(l)) {
  const v = [].concat(I.raw(l, k));
  if (/^ui\.(title|logo)/.test(k)) ok(v.every(s => !/Moka/.test(s)), `${l} ${k}: no old helper`);
  if (l === 'vi' && !/^ui\.(title|logo1|voice)$/.test(k)) ok(v.every(s => !/Rùa Tibo/.test(s)), `vi ${k}: lines say "Tibo", titles "Rùa Tibo"`);
}
// DESIGN §6 canonical lines
eq(I.t('en', 'weather.0', null, r0), 'Good morning, lake!', 'weather.0 en');
eq(I.t('en', 'weather.1', null, r0), 'The sun is high — sparkly water!', 'weather.1 en');
eq(I.t('en', 'weather.2', null, r0), 'What a pretty sunset!', 'weather.2 en');
eq(I.t('en', 'weather.3', null, r0), 'Look at the stars!', 'weather.3 en');
eq(I.t('en', 'enter', null, r0), 'Here come the fish!', 'enter en');
eq(I.t('en', 'cast', null, r0) + ' ' + I.t('vi', 'cast', null, r0), 'Swish! Vút!', 'cast');
eq(I.t('en', 'bite', null, r0), 'Got it!', 'bite');
eq(I.t('en', 'release', null, r0) + ' / ' + I.t('vi', 'release', null, r0), 'Bye bye, little fish! / Tạm biệt cá nhỏ!', 'release');
eq(I.t('en', 'pond', null, r0), 'Four lilies! The lake is so pretty!', 'pond');
eq(I.ask('en', 'p.color', { color: 'red' }, { rng: r0 }), 'Catch the red fish!', 'DESIGN "Catch the red fish!"');
eq(I.ask('vi', 'p.color', { color: 'red' }, { rng: r9 }), 'Câu con cá màu đỏ nhé!', 'DESIGN "Câu con cá màu đỏ nhé!"');
eq(I.ask('en', 'p.shape', { shape: 'star' }, { rng: r0 }), 'Catch the fish with the star!', 'DESIGN p.shape');
eq(I.ask('en', 'p.count', { n: 3 }, { rng: r0 }), 'Catch the fish with three spots!', 'DESIGN p.count');
eq(I.ask('en', 'p.home', { home: 'sea' }, { rng: r0 }), 'Who lives in the sea? Catch that friend!', 'DESIGN p.home');
eq(I.ask('en', 'p.size', { big: false }, { rng: r0 }), 'Catch the little fish!', 'DESIGN p.size little');
eq(I.ask('en', 'p.size', { big: true }, { rng: r0 }), 'Catch the big fish!', 'p.size big');
eq(I.ask('en', 'p.animal', { animal: 'fox' }, { rng: r0 }), 'Catch the fox!', 'DESIGN p.animal');
eq(I.ask('vi', 'p.animal', { animal: 'penguin' }, { rng: r0 }), 'Bé ơi, câu chim cánh cụt nhé!', 'vi p.animal');

section('no negative words in any line');
for (const l of I.langs) for (const k of I.keys(l)) for (const s of [].concat(I.raw(l, k))) ok(positive(s), `${l} ${k} positive: ${s}`);

section('every string renders: no "{" left, tidy punctuation, the child name');
const SAMPLE = { color: 'red', shape: 'star', n: 3, animal: 'penguin', letter: 'B', parity: 'odd', a: 2, b: 3, big: false,
  home: 'ice', stars: 12, word: 'fox', answer: 'red', thing: fish({ color: 'blue' }), got: 'blue', gotNum: 'two', gotSpots: 'spots',
  gotHome: 'in the forest', gotParity: 'even', ans: 'five', first: 'F', list: '1, 2, 3', num: 'three' };
for (const l of I.langs) for (const k of I.keys(l)) for (const child of ['', 'Mai']) for (const rng of RNGS) {
  const s = I.t(l, k, Object.assign({ child }, SAMPLE), rng);
  ok(tidy(s) || /^ui\.(namePlaceholder|langName)/.test(k), `${l} ${k} (child "${child}") renders tidy: ${s}`);
  if (!child) ok(!/friend!$|bé bé/i.test(s) || k === 'releaseFriend' || /friend/.test([].concat(I.raw(l, k)).join(' ')), `${l} ${k}: no "{child}" fallback in a nameless line: ${s}`);
}
I.setChild('Mai');
let named = 0;
for (let i = 0; i < 30; i++) if (/Mai/.test(I.t('en', 'praise', null, () => i / 30))) named++;
ok(named >= 5 && named <= 15, `with a name, ≈ 1 in 3 praise lines use it (${named}/30)`);
ok(/Mai/.test(I.t('vi', 'session.done', { stars: 9 }, r5)) && /Mai/.test(I.t('en', 'ui.welcome')), 'session.done / welcome always use the name');
I.setChild('');
ok(!/Mai|\{child\}/.test(I.t('vi', 'session.done', { stars: 9 }, r5)), 'no name → no {child} variant');
eq(I.t('vi', 'praise', null, r9), 'Câu giỏi quá!', 'no name → the last nameless praise');

section('prompts: every value, first-time forms, fallbacks');
const PARAMS_FOR = { 'p.color': COLORS.map(c => ({ color: c })), 'p.shape': SHAPES.map(s => ({ shape: s })),
  'p.size': [{ big: true }, { big: false }, { size: 'small' }, { size: 'big' }],
  'p.count': Array.from({ length: 12 }, (_, i) => ({ n: i + 1 })), 'p.animal': ANIMALS.map(a => ({ animal: a })),
  'p.home': HOMES.map(h => ({ home: h })), 'p.letter': LETTERS.map(x => ({ letter: x })), 'p.lower': LETTERS.filter(x => x !== 'I').map(x => ({ letter: x })),
  'p.initial': LETTERS.map(x => ({ letter: x })), 'p.add': [{ a: 2, b: 3 }, { a: 0, b: 1 }, { a: 9, b: 11 }, { a: '4', b: '4' }],
  'p.sub': [{ a: 7, b: 4 }, { a: 10, b: 0 }, { a: 5, b: 5 }], 'p.oddeven': [{ parity: 'odd' }, { parity: 'even' }] };
for (const k of PROMPT_KEYS) for (const l of I.langs) for (const pr of PARAMS_FOR[k]) for (const first of [false, true]) for (const rng of RNGS) {
  const s = I.ask(l, k, pr, { first, rng });
  ok(tidy(s) && positive(s), `${l} ${k}${first ? '.first' : ''} ${JSON.stringify(pr)}: ${s}`);
  ok(![].concat(I.raw(l, 'p.any')).includes(s), `${l} ${k} ${JSON.stringify(pr)} is specific (not p.any): ${s}`);
  if (first) ok(s === I.t(l, k + '.first', pr, rng), `${l} ${k} first form used`);
  const v = Object.values(pr)[0];
  if (k === 'p.color') ok(s.includes(I.name(l, 'color', v)), `${l} ${k} says the colour`);
  if (k === 'p.shape') ok(s.includes(I.name(l, l === 'vi' ? 'shapeH' : 'shape', v)), `${l} ${k} says the shape`);
  if (k === 'p.count') ok(s.includes(I.name(l, 'spots', v)), `${l} ${k} says "${I.name(l, 'spots', v)}"`);
  if (k === 'p.animal') ok(s.toLowerCase().includes(I.name(l, 'animal', v).toLowerCase()), `${l} ${k} says the animal`);
  if (k === 'p.home') ok(s.includes(I.name(l, 'homeAt', v)), `${l} ${k} says the home`);
  if (/^p\.(add|sub)$/.test(k)) ok(s.includes(pr.a + (k === 'p.add' ? ' + ' : ' − ') + pr.b), `${l} ${k} shows the sum`);
}
eq(I.ask('en', 'p.count', { n: 1 }, { rng: r0 }), 'Catch the fish with one spot!', 'singular spot');
eq(I.ask('vi', 'p.count', { n: 4 }, { rng: r0 }), 'Bé ơi, câu con cá có bốn chấm nhé!', 'vi "con cá có bốn chấm"');
eq(I.ask('vi', 'p.shape', { shape: 'star' }, { rng: r0 }), 'Bé ơi, câu con cá có hình ngôi sao nhé!', 'vi "con cá có hình ngôi sao"');
eq(I.ask('vi', 'p.size', { big: true }, { rng: r0 }), 'Bé ơi, câu con cá to nhé!', 'vi "con cá to"');
eq(I.ask('vi', 'p.home', { home: 'ice' }, { rng: r0 }), 'Bé ơi, bạn nào sống ở xứ băng nhỉ? Câu bạn ấy nhé!', 'vi home prompt');
eq(I.ask('en', 'p.lower', { letter: 'B' }, { rng: r0 }), 'Here is big B. Catch the fish with small b!', 'lower prompt');
eq(I.ask('en', 'p.lower', { letter: 'b' }, { rng: r0 }), 'Here is big B. Catch the fish with small b!', 'lower prompt from a small letter');
eq(I.ask('en', 'p.oddeven', { parity: 'odd' }, { rng: r0 }), 'Catch the fish with an odd number!', '"an odd number"');
eq(I.ask('en', 'p.add', { a: 3, b: 2 }, { rng: r0 }), 'What is 3 + 2? Catch that number!', 'add prompt');
eq(I.ask('en', 'p.add', { expr: '3+2' }, { rng: r0 }), 'What is 3 + 2? Catch that number!', 'add prompt from {expr}');
eq(I.ask('en', 'p.add', { n: 5 }, { rng: r0 }), 'Catch the fish with five!', 'add without {a, b} → p.number');
eq(I.ask('en', 'p.color', {}, { rng: r0 }), 'Let’s catch a fish!', 'missing param → p.any');
eq(I.ask('en', 'p.nothing', {}, { rng: r0 }), 'Let’s catch a fish!', 'unknown prompt → p.any');
eq(I.ask('en', 'p.colors', { color: 'blue' }, { rng: r0 }), 'Catch the blue fish!', 'old plural key p.colors → p.color');
eq(I.ask('en', 'p.sizeBig', {}, { rng: r0 }), 'Catch the big fish!', 'old key p.sizeBig → p.size big');
eq(I.ask('en', 'p.forest', { home: 'desert' }, { rng: r0, first: true }), I.t('en', 'p.home.first', { home: 'desert' }), 'old key p.forest → p.home (+ first)');
eq(I.ask('en', 'p.color', { color: 'red' }, { first: true }), 'Tibo wants to catch a fish! Tap the red fish, and Tibo will catch it!', 'first form');

section('names for every kind × value');
for (const l of I.langs) {
  for (const c of COLORS) { ok(I.name(l, 'color', c).length > 1 && I.name(l, 'hue', c).length > 1, `${l} color ${c}`); }
  for (const s of SHAPES) ok(I.name(l, 'shape', s).length > 1 && I.name(l, 'shapeH', s).length > 1, `${l} shape ${s}`);
  for (const a of ANIMALS) for (const k of ['animal', 'guest', 'word', 'who']) ok(I.name(l, k, a).length > 1 && I.name(l, k, a) !== a || l === 'en', `${l} ${k} ${a}: ${I.name(l, k, a)}`);
  for (const h of HOMES) ok(I.name(l, 'home', h).length > 1 && I.name(l, 'homeAt', h).length > 3, `${l} home ${h}`);
  for (let n = 0; n <= 20; n++) { ok(I.name(l, 'number', n).length > 1 && I.name(l, 'n', n) === I.name(l, 'number', n), `${l} number ${n}`); ok(tidy(I.name(l, 'spots', n).replace(/^./, c => c.toUpperCase())), `${l} spots ${n}`); }
  for (const x of LETTERS) eq(I.name(l, 'letter', x), x, `${l} letter ${x}`);
  ok(I.name(l, 'sum', '2+3').length > 4 && I.name(l, 'diff', '7−2').length > 4, `${l} sum / diff`);
  for (const p of ['odd', 'even']) ok(I.name(l, 'parity', p).length > 1, `${l} parity ${p}`);
  for (const z of ['big', 'small', true, false]) ok(I.name(l, 'size', z).length > 1, `${l} size ${z}`);
  ok(I.name(l, 'text', '7') === I.name(l, 'number', 7) && I.name(l, 'text', 'B') === 'B', `${l} text`);
  ok(I.name(l, 'fish', fish({ color: 'red' })).length > 3, `${l} name fish`);
}
for (const [k, tbl] of Object.entries(VI_NAMES)) for (const [v, want] of Object.entries(tbl)) eq(I.name('vi', k, v), want, `vi ${k} ${v}`);
for (const h of HOMES) eq(I.name('vi', 'homeAt', h), { sea: 'dưới biển', ice: 'ở xứ băng', forest: 'trong rừng', desert: 'ở sa mạc', savanna: 'ở đồng cỏ châu Phi' }[h], `vi homeAt ${h}`);
eq(I.name('en', 'spots', 1) + ' / ' + I.name('vi', 'spots', 3), 'one spot / ba chấm', 'spots names');
eq(I.name('en', 'size', false) + ' / ' + I.name('vi', 'size', true), 'little / to', 'size names');
eq(I.name('en', 'sum', '3+2') + ' / ' + I.name('vi', 'diff', '7−4'), 'three plus two / bảy trừ bốn', 'sum / diff names');

section('initial(): first letter of the bare noun, both languages');
for (const l of I.langs) for (const a of ANIMALS) {
  eq(I.initial(l, 'animal', a), INITIAL[l][a], `${l} initial ${a}`);
  eq(I.initial(l, bub(a)), INITIAL[l][a], `${l} initial(bubble ${a})`);
  eq(I.initialOf(l, a).first, INITIAL[l][a], `${l} initialOf ${a}`);
}
eq(I.bareWord('vi', bub('fox')), 'cáo', 'vi bare word without classifier');
eq(I.bareWord('vi', bub('penguin')), 'chim cánh cụt', 'vi bare word penguin');

section('phrases: things named for a sentence');
const PH = [
  ['en', fish({ color: 'red' }), 'the red fish'], ['vi', fish({ color: 'red' }), 'con cá màu đỏ'],
  ['en', fish({ color: 'orange' }), 'the orange fish'], ['en', fish({ color: 'orange' }), 'an orange fish', { art: 'a' }],
  ['en', fish({ mark: { shape: 'star', color: 'red' } }), 'the fish with the star'], ['vi', fish({ mark: { shape: 'star', color: 'red' } }), 'con cá có hình ngôi sao'],
  ['en', fish({ mark: { shape: 'star', color: 'red' } }), 'the fish with the red star', { markColor: true }],
  ['en', fish({ mark: { n: 3 } }), 'the fish with three spots'], ['vi', fish({ mark: { n: 3 } }), 'con cá có ba chấm'],
  ['en', fish({ mark: { n: 1 } }), 'the fish with one spot'],
  ['en', fish({ color: 'red', big: false }), 'the little red fish'], ['vi', fish({ color: 'red', big: false }), 'con cá nhỏ màu đỏ'],
  ['en', fish({ color: 'red', big: true }), 'the red fish'], ['en', fish({ color: 'red', big: true }), 'the big red fish', { size: true }],
  ['vi', fish({ color: 'red', big: true }), 'con cá to màu đỏ', { size: true }],
  ['en', fish({ mark: { text: 'B' } }), 'the fish with letter B'], ['vi', fish({ mark: { text: 'B' } }), 'con cá có chữ B'],
  ['en', fish({ mark: { text: 'b' } }), 'the fish with small b'], ['vi', fish({ mark: { text: 'b' } }), 'con cá có chữ b thường'],
  ['en', fish({ mark: { text: '7' } }), 'the fish with number seven'], ['vi', fish({ mark: { text: '7' } }), 'con cá có số bảy'],
  ['en', fish({ mark: { text: '3+2' } }), 'the fish with 3 + 2'], ['vi', fish({ mark: { text: '7−4' } }), 'con cá có 7 − 4'],
  ['en', fish({}), 'the fish'], ['vi', fish({}), 'con cá'],
  ['en', bub('penguin'), 'the penguin'], ['vi', bub('penguin'), 'chim cánh cụt'], ['vi', bub('crab'), 'con cua'],
  ['en', { nameKind: 'color', nameValue: 'blue' }, 'the blue fish'], ['vi', { nameKind: 'n', nameValue: 2 }, 'con cá có hai chấm'],
  ['en', { nameKind: 'animal', nameValue: 'lion' }, 'the lion'],
  ['en', { kind: 'color', color: 'red' }, 'red'], ['vi', { kind: 'color', color: 'red' }, 'màu đỏ'], ['en', { kind: 'number', n: 4 }, 'four'],
  ['en', { kind: 'home', home: 'ice' }, 'the ice'], ['vi', { kind: 'home', home: 'sea' }, 'biển'],
  ['en', { kind: 'size', big: false }, 'the little fish'], ['vi', { kind: 'size', big: true }, 'con cá to'],
  ['en', { kind: 'letter', text: 'm' }, 'small m'], ['vi', { kind: 'letter', text: 'M' }, 'chữ M'],
  // older kinds still name something sensible
  ['en', { kind: 'guest', animal: 'fox' }, 'the fox'], ['en', { kind: 'plate', n: 2 }, 'the fish with two spots'],
  ['en', { kind: 'cookie', shape: 'heart' }, 'the fish with the heart'], ['en', { kind: 'card', text: 'A' }, 'the fish with letter A']
];
for (const [l, t, want, opts] of PH) eq(I.phrase(l, t, opts), want, `${l} phrase ${JSON.stringify(t)}`);
eq(I.sayName('vi', fish({ mark: { n: 3 } })), 'con cá có ba chấm', 'sayName');
eq(I.sayName('en', {}), '', 'sayName of nothing → ""');
const up = s => s.charAt(0).toUpperCase() + s.slice(1) + '!';
for (const l of I.langs) {
  for (const c of COLORS) for (const big of [true, false, undefined]) ok(tidy(up(I.phrase(l, fish({ color: c, big })))), `${l} colour fish ${c} ${big}`);
  for (const s of SHAPES) for (const c of COLORS) ok(tidy(up(I.phrase(l, fish({ mark: { shape: s, color: c } }), { markColor: true }))), `${l} shape fish ${s} ${c}`);
  for (let n = 1; n <= 12; n++) ok(tidy(up(I.phrase(l, fish({ mark: { n } })))), `${l} spot fish ${n}`);
  for (const a of ANIMALS) ok(tidy(up(I.phrase(l, bub(a)))), `${l} bubble ${a}`);
  for (const t of LETTERS.concat(LETTERS.map(x => x.toLowerCase()), ['3+2', '7−4', '12', '0', '20'])) ok(tidy(up(I.phrase(l, fish({ mark: { text: t } })))), `${l} text fish ${t}`);
}

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
const WORD_CASES = { color: COLORS, shape: SHAPES, size: ['big', 'small'], animal: ANIMALS, home: HOMES, parity: ['odd', 'even'], letter: LETTERS };
for (const [kind, vals] of Object.entries(WORD_CASES)) for (const lang of I.langs) for (const v of vals) {
  const ws = I.words(lang, kind, v);
  ok(ws.length >= 2 && ws.every(w => w && w === w.toLowerCase()), `${lang} words ${kind} ${v}: lower-case forms (${ws.length})`);
  const nm = kind === 'letter' ? v.toLowerCase() : I.name(lang, kind, v).toLowerCase();
  ok(ws.includes(nm), `${lang} words ${kind} ${v} include the name "${nm}"`);
  if (kind !== 'letter') ok(ws.includes(I.stripMarks(nm)), `${lang} words ${kind} ${v} include the no-diacritic name`);
}
for (const lang of I.langs) for (let n = 0; n <= 20; n++) {
  const ws = I.words(lang, 'number', n);
  ok(ws.includes(String(n)), `${lang} words number ${n} include the digits`);
  if (!(lang === 'vi' && n === 0)) ok(ws.includes(I.name(lang, 'number', n)), `${lang} words number ${n} include "${I.name(lang, 'number', n)}"`);
  ok(ws.includes(I.stripMarks(I.name(lang, 'number', n))) || n === 0, `${lang} words number ${n} no-diacritic form`);
  for (const alias of ['n', 'count', 'spots']) eq(JSON.stringify(I.words(lang, alias, n)), JSON.stringify(ws), `${lang} ${alias} words = number words (${n})`);
}
ok(I.words('vi', 'number', 3).includes('ba chấm') && I.words('vi', 'number', 3).includes('ba cham') && I.words('en', 'number', 3).includes('three spots'), '"three spots" / "ba chấm" accepted');
ok(I.words('en', 'sum', '2+3').includes('two plus three') && I.words('vi', 'diff', '7−2').includes('bay tru hai'), 'sum / diff words');
ok(I.words('vi', 'color', 'red').includes('con cá màu đỏ') && I.words('en', 'color', 'red').includes('red fish'), 'colour + fish forms');
for (const lang of I.langs) for (const a of ANIMALS) eq(JSON.stringify(I.words(lang, 'guest', a)), JSON.stringify(I.words(lang, 'animal', a)), `${lang} guest words = animal words ${a}`);
for (const [kind, vals] of Object.entries(WORD_CASES)) for (const lang of I.langs) {
  if (kind === 'letter') continue;
  const seen = {};
  for (const v of vals) for (const w of I.words(lang, kind, v)) {
    ok(!seen[w] || seen[w] === v, `${lang} ${kind}: "${w}" not shared by ${seen[w]} and ${v}`);
    seen[w] = v;
  }
}
const MATCH_CASES = { color: COLORS, shape: SHAPES, size: ['big', 'small'], animal: ANIMALS, home: HOMES, number: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
for (const [kind, vals] of Object.entries(MATCH_CASES)) for (const lang of I.langs) {
  const set = ch(lang, kind, vals);
  for (const v of vals) {
    eq(V.match([I.name(lang, kind, v)], set), String(v), `${lang} "${I.name(lang, kind, v)}" → ${kind} ${v}`);
    eq(V.match([I.stripMarks(I.name(lang, kind, v))], set), String(v), `${lang} no diacritics "${I.stripMarks(I.name(lang, kind, v))}" → ${v}`);
  }
}
const SAYS = [
  ['vi', 'home', HOMES, 'ở xứ băng', 'ice'], ['vi', 'home', HOMES, 'dưới biển', 'sea'], ['vi', 'home', HOMES, 'trong rung', 'forest'],
  ['vi', 'home', HOMES, 'dong co chau phi', 'savanna'], ['vi', 'home', HOMES, 'sa mac', 'desert'], ['vi', 'home', HOMES, 'ở xa mạc', 'desert'],
  ['en', 'home', HOMES, 'in the forest', 'forest'], ['en', 'home', HOMES, 'the woods', 'forest'], ['en', 'home', HOMES, 'on the ice', 'ice'],
  ['en', 'home', HOMES, 'the ocean', 'sea'], ['en', 'home', HOMES, 'in the dessert', 'desert'], ['en', 'home', HOMES, 'africa', 'savanna'],
  ['vi', 'color', COLORS, 'mầu đổ', 'red'], ['vi', 'color', COLORS, 'màu xanh lá cây', 'green'], ['en', 'color', COLORS, 'the blue fish', 'blue'],
  ['en', 'animal', ANIMALS, 'a rabbit', 'bunny'], ['en', 'animal', ANIMALS, 'it is a fish', 'goldfish'], ['en', 'animal', ANIMALS, 'racoon', 'raccoon'],
  ['vi', 'animal', ANIMALS, 'con hươu', 'deer'], ['vi', 'animal', ANIMALS, 'cá vàng', 'goldfish'], ['vi', 'animal', ANIMALS, 'chim canh cut', 'penguin'],
  ['vi', 'animal', ANIMALS, 'gau meo', 'raccoon'], ['vi', 'animal', ANIMALS, 'cú mèo', 'owl'], ['vi', 'animal', ANIMALS, 'con cao', 'fox'],
  ['vi', 'animal', ANIMALS, 'lac da', 'camel'], ['vi', 'animal', ANIMALS, 'su tu', 'lion'],
  ['en', 'number', [2, 3, 4], 'three spots', '3'], ['vi', 'number', [2, 3, 4], 'bốn chấm', '4'], ['vi', 'number', [2, 3, 4], '2', '2'],
  ['vi', 'number', [2, 3, 4], 'ba', '3'], ['en', 'size', ['big', 'small'], 'the little one', 'small'], ['vi', 'size', ['big', 'small'], 'con cá to', 'big'],
  ['en', 'shape', SHAPES, 'a triangle', 'triangle'], ['vi', 'shape', SHAPES, 'hình tim', 'heart']
];
for (const [l, kind, vals, said, want] of SAYS) eq(V.match([said], ch(l, kind, vals), l), want, `${l} said "${said}" → ${want}`);
eq(V.match(['xanh'], ch('vi', 'color', COLORS), 'vi'), null, '"xanh" alone is ambiguous → no match');
const CHOICES = [
  [{ id: 'a', thing: { kind: 'color', color: 'red' } }, 'đỏ'], [{ id: 'b', thing: { kind: 'number', n: 3 } }, '3'],
  [{ id: 'c', thing: { kind: 'home', home: 'ice' } }, 'xứ băng'], [{ id: 'c2', thing: { kind: 'home', home: 'forest' } }, 'rừng'],
  [{ id: 'd', thing: { kind: 'size', big: false } }, 'nhỏ'], [{ id: 'd2', thing: fish({ color: 'red', big: false }) }, 'nhỏ'],
  [{ id: 'e', thing: fish({ mark: { shape: 'triangle', color: 'red' } }) }, 'tam giác'], [{ id: 'f', thing: bub('bunny') }, 'thỏ'],
  [{ id: 'g', thing: fish({ mark: { n: 4 } }) }, 'bốn'], [{ id: 'h', thing: fish({ mark: { text: 'B' } }) }, 'bờ'],
  [{ id: 'i', thing: fish({ color: 'blue' }) }, 'xanh dương'],
  [{ id: 'j', thing: Object.assign(bub('lion'), { nameKind: 'animal', nameValue: 'lion' }) }, 'sư tử'],
  [{ id: 'k', thing: fish({ mark: { text: '7' } }) }, 'bảy'], [{ id: 'l', thing: fish({ mark: { text: '3+2' } }) }, 'ba cộng hai']
];
for (const [c, w] of CHOICES) ok(I.choiceWords('vi', c).includes(w), `vi choiceWords ${JSON.stringify(c.thing)} include "${w}"`);
eq(JSON.stringify(I.kindValue({ thing: fish({ mark: { n: 5 } }) })), JSON.stringify(['number', 5]), 'kindValue spot fish → number');
eq(JSON.stringify(I.kindValue({ thing: fish({ mark: { shape: 'star', color: 'red' } }) })), JSON.stringify(['shape', 'star']), 'kindValue shape fish → shape');
eq(JSON.stringify(I.kindValue({ thing: fish({ color: 'red' }) })), JSON.stringify(['color', 'red']), 'kindValue colour fish → color');
eq(JSON.stringify(I.kindValue({ thing: bub('fox') })), JSON.stringify(['animal', 'fox']), 'kindValue bubble → animal');
eq(JSON.stringify(I.kindValue({ thing: { nameKind: 'home', nameValue: 'sea' } })), JSON.stringify(['home', 'sea']), 'kindValue nameKind wins');
eq(JSON.stringify(I.kindValue({ thing: fish({ mark: { text: '16' }, nameKind: 'parity', nameValue: 'even' }) })), JSON.stringify(['number', 16]), 'kindValue parity fish → its number');
ok(I.talkWrong('en', { thing: fish({ mark: { text: '16' }, nameKind: 'parity', nameValue: 'even' }) }) === 'It is sixteen! Good try!', 'talkWrong parity fish says the number');
eq(I.sayRight('en', { rule: { kind: 'initial', value: 'C' }, thing: bub('owl') }, r0), 'The owl! Owl starts with O!', 'right initial says the real initial of the word in this language');

section('game lines: sayRight / sayWrong for every rule kind (DESIGN §6 examples)');
const R = (l, e, rng) => I.sayRight(l, e, rng || r0);
const Wr = (l, e, rng) => I.sayWrong(l, e, rng || r0);
eq(R('en', { rule: { kind: 'color', value: 'red' }, thing: fish({ color: 'red' }) }), 'A red fish! Well done!', 'DESIGN right colour');
eq(R('vi', { rule: { kind: 'color', value: 'red' }, thing: fish({ color: 'red' }) }), 'Con cá màu đỏ! Bé giỏi quá!', 'vi right colour');
eq(R('en', { rule: { kind: 'color', value: 'orange' }, thing: fish({ color: 'orange' }) }), 'An orange fish! Well done!', '"An orange fish"');
eq(R('en', { rule: { kind: 'home', value: 'sea' }, thing: bub('crab') }), 'The crab! The crab lives in the sea.', 'DESIGN right home');
eq(R('vi', { rule: { kind: 'home', value: 'sea' }, thing: bub('crab') }), 'Con cua! Con cua sống dưới biển.', 'vi right home');
eq(R('vi', { rule: { kind: 'home', value: 'ice' }, thing: bub('penguin') }), 'Chim cánh cụt! Chim cánh cụt sống ở xứ băng.', 'vi right home penguin');
eq(R('en', { rule: { kind: 'shape', value: 'star' }, thing: fish({ mark: { shape: 'star', color: 'red' } }) }), 'The fish with the star! Well done!', 'right shape');
eq(R('vi', { rule: { kind: 'shape', value: 'star' }, thing: fish({ mark: { shape: 'star' } }) }), 'Con cá có hình ngôi sao! Bé giỏi quá!', 'vi right shape');
eq(R('en', { rule: { kind: 'size', value: 'small' }, thing: fish({ color: 'red', big: false }) }), 'The little fish! Well done!', 'right size');
eq(R('vi', { rule: { kind: 'size', value: 'small' }, thing: fish({ color: 'red', big: false }) }), 'Con cá nhỏ! Bé giỏi quá!', 'vi right size');
eq(R('en', { rule: { kind: 'n', value: 3 }, thing: fish({ mark: { n: 3 } }) }), 'You caught it! Let’s count the spots!', 'right count → "let’s count" (the run follows)');
eq(R('en', { rule: { kind: 'animal', value: 'fox' }, thing: bub('fox') }), 'The fox! Well done!', 'right animal');
eq(R('vi', { rule: { kind: 'animal', value: 'fox' }, thing: bub('fox') }, r9), 'Đúng rồi! Chào bạn cáo nhé!', 'vi right animal "bạn cáo"');
eq(R('en', { rule: { kind: 'letter', value: 'B' }, thing: fish({ mark: { text: 'B' } }) }), 'Letter B! Well done!', 'right letter');
eq(R('en', { rule: { kind: 'lower', value: 'b' }, thing: fish({ mark: { text: 'b' } }) }), 'Small b! Big B and small b are friends!', 'right lower');
eq(R('en', { rule: { kind: 'initial', value: 'F' }, thing: bub('fox') }), 'The fox! Fox starts with F!', 'right initial');
eq(R('vi', { rule: { kind: 'initial', value: 'C' }, thing: bub('fox') }), 'Con cáo! Cáo bắt đầu bằng chữ C!', 'vi right initial');
eq(R('en', { rule: { kind: 'sum', value: 5 }, params: { a: 3, b: 2 }, thing: fish({ mark: { text: '5' } }) }), '3 + 2 makes five! Well done!', 'right sum');
eq(R('vi', { rule: { kind: 'diff', value: 3 }, params: { a: 7, b: 4 }, thing: fish({ mark: { text: '3' } }) }), '7 − 4 bằng ba! Bé giỏi quá!', 'vi right diff');
eq(R('en', { rule: { kind: 'sum', value: '3+2' }, thing: fish({ mark: { text: '5' } }) }), '3 + 2 makes five! Well done!', 'right sum from an expression rule');
eq(R('en', { rule: { kind: 'sum', value: 5 }, thing: fish({ mark: { text: '5' } }) }), 'Five! Well done!', 'right sum without {a, b} → right.number');
eq(R('en', { rule: { kind: 'parity', value: 'odd' }, thing: fish({ mark: { text: '7' } }) }), 'Seven is odd! Well done!', 'right parity');
eq(Wr('en', { want: { kind: 'color', value: 'red' }, thing: fish({ color: 'blue' }) }), 'That one is a blue fish. Let’s find the red fish!', 'DESIGN wrong colour');
eq(Wr('vi', { want: { kind: 'color', value: 'red' }, thing: fish({ color: 'blue' }) }), 'Con này là con cá màu xanh dương. Mình tìm con cá màu đỏ nhé!', 'vi wrong colour');
eq(Wr('en', { want: { kind: 'color', value: 'red' }, thing: fish({ color: 'orange' }) }), 'That one is an orange fish. Let’s find the red fish!', 'wrong "an orange fish"');
eq(Wr('en', { want: { kind: 'n', value: 3 }, thing: fish({ mark: { n: 2 } }) }), 'That fish has two spots. Let’s find the fish with three spots!', 'wrong count');
eq(Wr('vi', { want: { kind: 'n', value: 3 }, thing: fish({ mark: { n: 1 } }) }), 'Con cá này có một chấm. Mình tìm con cá có ba chấm nhé!', 'vi wrong count');
eq(Wr('en', { want: { kind: 'home', value: 'sea' }, thing: bub('fox') }), 'That’s the fox. The fox lives in the forest. Who lives in the sea?', 'wrong home');
eq(Wr('vi', { want: { kind: 'home', value: 'sea' }, got: { nameKind: 'animal', nameValue: 'squirrel' } }), 'Đây là con sóc. Con sóc sống trong rừng. Bạn nào sống dưới biển nhỉ?', 'vi wrong home rebuilt from got');
eq(Wr('en', { want: { kind: 'size', value: 'small' }, thing: fish({ color: 'red', big: true }) }), 'That one is a big fish. Let’s find the little fish!', 'wrong size');
eq(Wr('en', { want: { kind: 'shape', value: 'star' }, thing: fish({ mark: { shape: 'heart', color: 'red' } }) }), 'That fish has a heart. Let’s find the fish with the star!', 'wrong shape');
eq(Wr('en', { want: { kind: 'shape', value: 'star' }, thing: fish({ mark: { shape: 'oval', color: 'red' } }) }), 'That fish has an oval. Let’s find the fish with the star!', 'wrong shape "an oval"');
eq(Wr('vi', { want: { kind: 'shape', value: 'star' }, thing: fish({ mark: { shape: 'heart' } }) }), 'Con cá này có hình trái tim. Mình tìm con cá có hình ngôi sao nhé!', 'vi wrong shape');
eq(Wr('en', { want: { kind: 'animal', value: 'fox' }, thing: bub('owl') }), 'That’s the owl! Let’s find the fox!', 'wrong animal');
eq(Wr('en', { want: { kind: 'letter', value: 'B' }, thing: fish({ mark: { text: 'D' } }) }), 'That’s letter D. Let’s find letter B!', 'wrong letter');
eq(Wr('en', { want: { kind: 'lower', value: 'b' }, thing: fish({ mark: { text: 'd' } }) }), 'That’s small d. Let’s find small b, the friend of big B!', 'wrong lower');
eq(Wr('vi', { want: { kind: 'lower', value: 'b' }, thing: fish({ mark: { text: 'd' } }) }), 'Đây là chữ d thường. Mình tìm chữ b thường, bạn của chữ B hoa nhé!', 'vi wrong lower');
eq(Wr('en', { want: { kind: 'initial', value: 'B' }, thing: bub('fox') }), 'That’s the fox. Fox starts with F. Who starts with B?', 'wrong initial');
eq(Wr('en', { want: { kind: 'sum', value: 5 }, params: { a: 3, b: 2 }, thing: fish({ mark: { text: '4' } }) }), 'That fish has four. Let’s add 3 + 2 again!', 'wrong sum');
eq(Wr('en', { want: { kind: 'parity', value: 'even' }, thing: fish({ mark: { text: '7' } }) }), 'Seven is odd. Let’s find an even number!', 'wrong parity');
eq(Wr('en', {}), 'Let’s look again!', 'wrong without anything → wrong.any');
eq(R('en', {}), 'You caught it! Well done!', 'right without anything → right.any');
// rule from topic / promptKey + params when main forgot `rule`
eq(R('en', { topic: 'colors', params: { color: 'green' }, thing: fish({ color: 'green' }) }), 'A green fish! Well done!', 'rule from topic + params');
eq(Wr('en', { promptKey: 'p.color', params: { color: 'red' }, thing: fish({ color: 'blue' }) }), 'That one is a blue fish. Let’s find the red fish!', 'rule from promptKey');
eq(R('en', { topic: 'animals', promptKey: 'p.home', params: { home: 'savanna' }, thing: bub('lion') }), 'The lion! The lion lives on the savanna.', 'home rule from promptKey');
eq(Wr('en', { topic: 'animals', promptKey: 'p.home', params: { home: 'ice' }, thing: bub('camel') }), 'That’s the camel. The camel lives in the desert. Who lives on the ice?', 'home wrong from promptKey');
eq(Wr('en', { rule: { kind: 'count', value: 4 }, got: { nameKind: 'n', nameValue: 2 } }), 'That fish has two spots. Let’s find the fish with four spots!', 'rule alias count + thing from got');
eq(I.ruleOf({ promptKey: 'p.add', params: { a: 2, b: 3, n: 5 } }).kind, 'sum', 'ruleOf: p.add → sum');
// the first wording of every wrong line is short; the miss + hint line
for (const l of I.langs) for (const c of [
  { want: { kind: 'color', value: 'red' }, thing: fish({ color: 'purple' }) },
  { want: { kind: 'shape', value: 'star' }, thing: fish({ mark: { shape: 'triangle', color: 'red' } }) },
  { want: { kind: 'size', value: 'big' }, thing: fish({ color: 'red', big: false }) },
  { want: { kind: 'n', value: 3 }, thing: fish({ mark: { n: 5 } }) },
  { want: { kind: 'animal', value: 'squirrel' }, thing: bub('hedgehog') },
  { want: { kind: 'letter', value: 'B' }, thing: fish({ mark: { text: 'P' } }) },
  { want: { kind: 'parity', value: 'even' }, thing: fish({ mark: { text: '3' } }) }]) {
  const s1 = Wr(l, c);
  ok(s1.length <= 72, `${l} wrong ${c.want.kind} first wording ≤ 72 chars (${s1.length}): ${s1}`);
  for (const rng of RNGS) {
    const h = I.sayWrongHint(l, c, rng);
    ok(tidy(h) && positive(h) && h.length <= 66, `${l} wrong+hint line ${c.want.kind} (${h.length}): ${h}`);
  }
}
eq(I.sayWrongHint('en', { thing: fish({ color: 'blue' }) }, r0), 'That’s the blue fish. Look at the glowing one!', 'en wrong + hint pointer line');
eq(I.sayWrongHint('vi', { thing: fish({ mark: { n: 2 } }) }, r0), 'Đây là con cá có hai chấm. Bé nhìn bạn đang sáng nhé!', 'vi wrong + hint pointer line');
eq(I.sayWrongHint('en', {}, r0), 'Psst! Look at the glowing one!', 'unknown miss + hint → plain hint');

// full sweep: every rule kind × many members × 3 wordings → full, tidy, positive sentences that name both
function memberSets() {
  const out = [];
  for (const c of COLORS) for (const c2 of COLORS) if (c2 !== c)
    out.push({ rule: { kind: 'color', value: c }, target: fish({ color: c }), other: fish({ color: c2 }), gotName: ['color', c2], wantName: ['color', c] });
  for (const s of SHAPES) for (const s2 of SHAPES) if (s2 !== s)
    out.push({ rule: { kind: 'shape', value: s }, target: fish({ mark: { shape: s, color: 'red' } }), other: fish({ mark: { shape: s2, color: 'red' } }), gotName: ['shapeH', s2], wantName: ['shapeH', s] });
  for (const c of COLORS) for (const z of ['big', 'small'])
    out.push({ rule: { kind: 'size', value: z }, target: fish({ color: c, big: z === 'big' }), other: fish({ color: c, big: z !== 'big' }), gotName: ['size', z === 'big' ? 'small' : 'big'], wantName: ['size', z] });
  for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) if (a !== b)
    out.push({ rule: { kind: 'n', value: a }, target: fish({ mark: { n: a } }), other: fish({ mark: { n: b } }), gotName: ['spots', b], wantName: ['spots', a] });
  for (const a of ANIMALS) for (const b of ANIMALS) if (a !== b) {
    out.push({ rule: { kind: 'animal', value: a }, target: bub(a), other: bub(b), gotName: ['animal', b], wantName: ['animal', a] });
    if (HOME[a] !== HOME[b]) out.push({ rule: { kind: 'home', value: HOME[a] }, target: bub(a), other: bub(b), gotName: ['animal', b], wantName: ['homeAt', HOME[a]] });
  }
  for (const L1 of LETTERS) for (const L2 of ['B', 'M', 'S', 'T']) if (L1 !== L2) {
    out.push({ rule: { kind: 'letter', value: L1 }, target: fish({ mark: { text: L1 } }), other: fish({ mark: { text: L2 } }), wantName: ['letter', L1] });
    out.push({ rule: { kind: 'lower', value: L1.toLowerCase() }, target: fish({ mark: { text: L1.toLowerCase() } }), other: fish({ mark: { text: L2.toLowerCase() } }), wantName: ['letter', L1.toLowerCase()] });
  }
  for (const lang of ['en', 'vi']) for (const a of ANIMALS) for (const b of ANIMALS) {
    const i1 = I.initial(lang, bub(a)), i2 = I.initial(lang, bub(b));
    if (i1 !== i2) out.push({ lang, rule: { kind: 'initial', value: i1 }, target: bub(a), other: bub(b), gotName: ['word', b], wantName: ['letter', i1] });
  }
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) {
    out.push({ rule: { kind: 'sum', value: a + b }, params: { a, b }, target: fish({ mark: { text: String(a + b) } }), other: fish({ mark: { text: String(a + b + 1) } }), gotName: ['number', a + b + 1] });
    if (a >= b) out.push({ rule: { kind: 'diff', value: a - b }, params: { a, b }, target: fish({ mark: { text: String(a - b) } }), other: fish({ mark: { text: String(a - b + 2) } }), gotName: ['number', a - b + 2] });
  }
  for (let n = 1; n <= 20; n++) for (const m of [2, 4, 6, 3, 5, 0])
    if (n % 2 !== m % 2) out.push({ rule: { kind: 'parity', value: n % 2 ? 'odd' : 'even' }, target: fish({ mark: { text: String(n) } }), other: fish({ mark: { text: String(m) } }), gotName: ['number', m] });
  return out;
}
let sweepN = 0;
for (const c of memberSets()) for (const l of (c.lang ? [c.lang] : I.langs)) for (const rng of RNGS) {
  const right = I.sayRight(l, { rule: c.rule, params: c.params, thing: c.target }, rng);
  const wrong = I.sayWrong(l, { want: c.rule, params: c.params, thing: c.other }, rng);
  const hint = I.sayWrongHint(l, { want: c.rule, thing: c.other }, rng);
  sweepN++;
  ok(tidy(right) && positive(right) && /[.!?]$/.test(right), `${l} right ${c.rule.kind} ${JSON.stringify(c.target)}: ${right}`);
  ok(tidy(wrong) && positive(wrong) && /[.!?]$/.test(wrong), `${l} wrong ${c.rule.kind} ${JSON.stringify(c.other)}: ${wrong}`);
  ok(tidy(hint) && positive(hint), `${l} hint ${c.rule.kind}: ${hint}`);
  ok(![].concat(I.raw(l, 'right.any')).includes(right), `${l} right ${c.rule.kind} is specific: ${right}`);
  ok(![].concat(I.raw(l, 'wrong.any'), I.raw(l, 'wrong.number')).some(x => x === wrong), `${l} wrong ${c.rule.kind} is specific: ${wrong}`);
  const lw = wrong.toLowerCase();
  if (c.gotName) { const g = I.name(l, c.gotName[0], c.gotName[1]).toLowerCase(); ok(lw.includes(g), `${l} wrong ${c.rule.kind} names what was tapped (${g}): ${wrong}`); }
  if (c.wantName) { const w = I.name(l, c.wantName[0], c.wantName[1]).toLowerCase(); ok(lw.includes(w), `${l} wrong ${c.rule.kind} names the goal (${w}): ${wrong}`); }
  if (c.rule.kind === 'home') ok(right.includes(I.name(l, 'homeAt', c.rule.value)), `${l} right says where it lives: ${right}`);
  if (c.rule.kind === 'color') ok(right.includes(I.name(l, 'color', c.rule.value)), `${l} right names the colour: ${right}`);
  if (l === 'vi') ok(VI_DIACRITIC.test(right) && VI_DIACRITIC.test(wrong), `vi lines have diacritics: ${right} / ${wrong}`);
}
console.log(`   (${sweepN} member × rule × wording combinations)`);

section('counting');
eq(I.sayCount('en', 1), 'One!', 'en count 1'); eq(I.sayCount('vi', 15), 'Mười lăm!', 'vi count 15'); eq(I.sayCount('en', 25), '25!', 'beyond 20 → digits');
eq(I.sayCountRun('en', 3), '1, 2, 3 — three spots!', 'DESIGN count run');
eq(I.sayCountRun('vi', 3), '1, 2, 3 — ba chấm!', 'vi count run');
eq(I.sayCountRun('en', 1), '1 — one spot!', 'count run singular');
eq(I.sayCountRun('en', 2, 5), '1, 2 — two spots!', 'second arg ignored');
for (const l of I.langs) for (let n = 1; n <= 12; n++) {
  const s = I.sayCountRun(l, n);
  ok(tidy(s) && positive(s) && s.includes(I.name(l, 'spots', n)), `${l} count run ${n}: ${s}`);
  eq(I.speech(l, s), Array.from({ length: n }, (_, i) => i + 1).join(', ') + ', ' + I.name(l, 'spots', n) + '!', `${l} count run speech ${n}`);
}

section('talk');
eq(I.t('en', 'talk.colors'), 'What colour is this fish?', 'talk colours');
eq(I.t('vi', 'talk.colors'), 'Con cá này màu gì nhỉ?', 'vi talk colours');
eq(I.t('en', 'talk.shapes', { shape: 'star' }), 'Which fish has the star?', 'talk shapes (REQUIREMENT)');
eq(I.t('vi', 'talk.shapes', { shape: 'triangle' }), 'Con cá nào có hình tam giác nhỉ?', 'vi talk shapes');
eq(I.t('en', 'talk.count'), 'How many spots?', 'talk count');
eq(I.t('vi', 'talk.count'), 'Có mấy chấm nào?', 'vi talk count');
eq(I.t('en', 'talk.animals', { animal: 'penguin' }), 'Where does the penguin live?', 'talk animals (REQUIREMENT)');
eq(I.t('vi', 'talk.animals', { animal: 'penguin' }), 'Chim cánh cụt sống ở đâu nhỉ?', 'vi talk animals');
eq(I.t('en', 'talk.animals', {}), 'Where does this friend live?', 'talk animals fallback');
eq(I.t('en', 'talk.who', { animal: 'fox' }) + ' / ' + I.t('vi', 'talk.who'), 'Who is this? / Đây là con gì nhỉ?', 'who is this');
eq(I.t('en', 'talk.size', { size: 'small' }), 'Which fish is little?', 'talk size');
eq(I.t('en', 'talk.lower', { letter: 'B' }), 'Which fish has small b? It goes with big B!', 'talk lower');
eq(I.t('en', 'talk.initial', { letter: 'F', nameKind: 'animal', nameValue: 'fox' }), 'Which letter does fox start with?', 'talk initial word from the shown thing');
eq(I.talkWrong('en', { id: 'x', thing: { kind: 'home', home: 'ice' } }, { show: bub('penguin') }), 'The penguin lives on the ice! Good try!', 'talkWrong home with the animal');
eq(I.talkWrong('vi', { id: 'x', thing: { kind: 'home', home: 'forest' } }), 'Bạn ấy sống trong rừng đó! Bé cố gắng lắm!', 'vi talkWrong home without the animal');
eq(I.talkWrong('vi', { id: 'x', thing: { kind: 'home', home: 'desert' } }, { show: { animal: 'camel' } }), 'Con lạc đà sống ở sa mạc đó! Bé cố gắng lắm!', 'vi talkWrong camel desert');
eq(I.talkWrong('en', { thing: { kind: 'color', color: 'blue' } }), 'It is blue! Good try!', 'talkWrong colour');
eq(I.talkWrong('vi', { thing: { kind: 'color', color: 'blue' } }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', { thing: fish({ mark: { shape: 'oval' } }) }), 'It is an oval! Good try!', 'talkWrong shape "an oval"');
eq(I.talkWrong('en', { thing: { kind: 'number', n: 3 } }, { topic: 'count' }), 'There are three spots! Good try!', 'talkWrong count');
eq(I.talkWrong('vi', { thing: { kind: 'number', n: 3 } }, { topic: 'count' }), 'Có ba chấm đó! Bé cố gắng lắm!', 'vi talkWrong count');
eq(I.talkWrong('vi', { thing: { kind: 'number', n: 7 } }), 'Là số bảy đó! Bé cố gắng lắm!', 'vi talkWrong number');
eq(I.talkWrong('en', { thing: bub('fox') }), 'It is the fox! Good try!', 'talkWrong animal');
eq(I.talkWrong('en', 'letter', 'b'), 'It is small b! Good try!', 'talkWrong small letter');
eq(I.talkWrong('en', 'size', 'small'), 'It is the little fish! Good try!', 'talkWrong size');
eq(I.talkWrong('en', { thing: fish({ mark: { text: '3+2' } }) }), 'It is five! Good try!', 'talkWrong expression');
eq(I.talkWrong('en', null), 'Good try! Let’s play more!', 'talkWrong unknown');
for (const l of I.langs) {
  for (const h of HOMES) for (const a of ANIMALS) ok(tidy(I.talkWrong(l, { thing: { kind: 'home', home: h } }, { show: { animal: a } })), `${l} talkWrong home ${h} ${a}`);
  for (const c of COLORS) ok(tidy(I.talkWrong(l, 'color', c)), `${l} talkWrong ${c}`);
  for (const s of SHAPES) ok(tidy(I.talkWrong(l, 'shape', s)), `${l} talkWrong shape ${s}`);
  for (const a of ANIMALS) ok(tidy(I.talkWrong(l, 'animal', a)), `${l} talkWrong animal ${a}`);
  for (const z of ['big', 'small']) ok(tidy(I.talkWrong(l, 'size', z)), `${l} talkWrong size ${z}`);
  for (let n = 0; n <= 12; n++) ok(tidy(I.talkWrong(l, 'number', n, { topic: 'count' })) && tidy(I.talkWrong(l, 'number', n)), `${l} talkWrong n ${n}`);
  for (const x of LETTERS) ok(tidy(I.talkWrong(l, 'letter', x)) && tidy(I.talkWrong(l, 'letter', x.toLowerCase())), `${l} talkWrong letter ${x}`);
  for (const p of ['odd', 'even']) ok(tidy(I.talkWrong(l, 'parity', p)), `${l} talkWrong parity ${p}`);
}
for (const l of I.langs) for (const k of I.keys(l).filter(k => /^talk\./.test(k))) {
  const s = I.t(l, k, { color: 'red', shape: 'star', size: 'small', animal: 'deer', letter: 'B', word: 'fox', a: 2, b: 3, parity: 'odd', answer: 'red', num: 'three', thing: bub('fox'), home: 'forest' }, r0);
  ok(tidy(s), `${l} ${k}: ${s}`);
}

// ------------------------------------------------------------------ content.js (fishing) when it exists
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
  if (/members/.test(csrc) && /'fish'/.test(csrc) && /'bubble'/.test(csrc)) {
    try {
      const sbc = makeSandbox(); sbc.TL = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.TL.Content && sbc.TL.Content.makeRound) contentSB = sbc;
    } catch (e) { console.log('   note: fishing content.js does not load yet: ' + e.message); }
  }
}
console.log(`   (${contentSB ? 'fishing content.js loaded' : 'fishing content.js not there yet — content checks skipped'})`);
if (contentSB) {
  section('content.js: every promptKey / Talk key / member it produces');
  const CF = contentSB.TL, C = CF.Content;
  for (const a of Object.keys(CF.GUESTS || {})) { ok(I.ANIMALS.includes(a), `content guest ${a} has names`); eq(I.homeOf(a), CF.GUESTS[a], `content guest ${a} home`); }
  for (const c of CF.COLORS || []) ok(I.COLORS.includes(c), `content colour ${c} has names`);
  for (const s of CF.SHAPES || []) ok(I.SHAPES.includes(s), `content shape ${s} has names`);
  const AT = CF.AGE_TOPICS || AGE_TOPICS;
  let rounds = 0, notes = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of (AT[age] || [])) for (const lang of I.langs) for (let ri = 0; ri < 5; ri++) {
    let round;
    try {
      const rng = CF.RNG ? new CF.RNG(age * 1000 + ri * 7 + topic.length) : { next: Math.random };
      round = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level: TOPICS.indexOf(topic) % 4 });
    } catch (e) { if (notes++ < 5) console.log(`   note: makeRound ${topic} age ${age}: ${e.message}`); continue; }
    if (!round || !round.members) continue;
    rounds++;
    ok(PROMPT_KEYS.includes(round.promptKey) || I.has('en', round.promptKey), `content promptKey ${round.promptKey} has a line`);
    for (const first of [false, true]) {
      const ask = I.ask(lang, round.promptKey, round.params, { first });
      ok(tidy(ask) && ![].concat(I.raw(lang, 'p.any')).includes(ask), `${lang} age ${age} ${topic}: ask ${round.promptKey} ${JSON.stringify(round.params)} → ${ask}`);
    }
    for (const m of round.members) {
      const e = { id: m.id, thing: m.thing, topic, promptKey: round.promptKey, params: round.params, rule: round.rule };
      if (m.target) {
        const s = I.sayRight(lang, e);
        ok(tidy(s) && positive(s) && ![].concat(I.raw(lang, 'right.any')).includes(s), `${lang} age ${age} ${topic} right: ${s}`);
      } else {
        const s = I.sayWrong(lang, Object.assign({ want: round.rule, got: { nameKind: m.thing.nameKind, nameValue: m.thing.nameValue } }, e));
        ok(tidy(s) && positive(s) && ![].concat(I.raw(lang, 'wrong.any')).includes(s), `${lang} age ${age} ${topic} wrong: ${s}`);
        const s2 = I.sayWrong(lang, { want: round.rule, got: { nameKind: m.thing.nameKind, nameValue: m.thing.nameValue }, topic, promptKey: round.promptKey, params: round.params });
        ok(tidy(s2) && positive(s2), `${lang} age ${age} ${topic} wrong from got only: ${s2}`);
      }
      ok(I.sayName(lang, m.thing).length > 0, `${lang} member named: ${JSON.stringify(m.thing)}`);
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
      } catch (e) { if (notes++ < 5) console.log(`   note: makeTalk ${topic}: ${e.message}`); }
    }
  }
  console.log(`   (${rounds} content rounds rendered)`);
}

section('speech text: letters, maths, pauses, "Tibo"');
eq(I.speech('en', 'That’s letter D. Let’s find letter B!'), 'That’s letter dee. Let’s find letter bee!', 'en letter names');
eq(I.speech('en', 'Yes! F is for fox!'), 'Yes! eff is for fox!', 'en "F is for"');
eq(I.speech('en', 'The fox! Fox starts with F!'), 'The fox! Fox starts with eff!', 'en starts with');
eq(I.speech('en', 'Who starts with C? Catch that friend!'), 'Who starts with see? Catch that friend!', 'en starts with (question)');
eq(I.speech('en', 'Here is big A. Catch the fish with small a!'), 'Here is big ay. Catch the fish with small ay!', 'en big/small letters');
eq(I.speech('en', '1, 2, 3 — three spots!'), '1, 2, 3, three spots!', '" — " → comma pause');
eq(I.speech('en', '3 + 2 makes… which fish? Tap it!'), '3 plus 2 makes, which fish? Tap it!', '… → comma pause, + → plus');
eq(I.speech('vi', '7 − 2 bằng năm!'), '7 trừ 2 bằng năm!', 'vi minus');
eq(I.speech('vi', 'Bé ơi, câu con cá có chữ B nhé!'), 'Bé ơi, câu con cá có chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Đây là chữ m thường.'), 'Đây là chữ mờ thường.', 'vi small letter');
eq(I.speech('en', 'Hi! I am Tibo the turtle.'), 'Hi! I am Tibo the turtle.', 'en "Tibo" as written');
eq(I.speech('vi', 'Mình là rùa Tibo. Tibo giúp bé nhé!'), 'Mình là rùa Ti Bô. Ti Bô giúp bé nhé!', 'vi "Tibo" → "Ti Bô" for the vi-VN voice');
eq(I.speech('en', 'Tibo is listening…'), 'Tibo is listening.', 'final ellipsis → full stop');
eq(I.speech('en', 'Catch the red fish!'), 'Catch the red fish!', 'plain line untouched');
eq(V.spoken('vi', 'Chào bé! Mình là Tibo.'), 'Chào bé! Mình là Ti Bô.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Catch the fish with letter B!'), 'Catch the fish with letter bee!', 'Voice.spoken letter names');
for (const l of I.langs) for (const k of I.keys(l)) {
  const s = I.speech(l, I.t(l, k, SAMPLE, r0));
  ok(!/…|NOT\b|[+−—]/.test(s) && !/,\s*[!?.]/.test(s), `${l} ${k} speech text clean: ${s}`);
  if (l === 'vi') ok(!/Tibo/.test(s), `vi ${k}: TTS text never has the raw "Tibo"`);
}

section('input: tap / slide-on pointer layer — (x, y, ev) in logical px, ONE finger, extra fingers ignored');
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
  sb4.TL = {};
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
  sb7.TL = {};
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
  sb5.TL = {};
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
  sb6.TL = {};
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
ok(sb.TL.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into TL.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof TL.Input.attach === 'function' && typeof TL.Input.kidProof === 'function' && typeof TL.Input.holdButton === 'function',
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
  sbx.TL = {};
  env.TL = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.TL.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Tibo: rate 0.9, pitch 1.2');
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
  V2.say('Catch the fish with letter B!'); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Catch the fish with letter bee!', 'speech() applied to the utterance');
  ok(V2.log.some(e => e.text === 'Catch the fish with letter B!'), 'log keeps the display text');
  E.end(); await wait(10);
  // vi: "Tibo" goes to TTS as "Ti Bô", letter names are rewritten; the bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là rùa Tibo. Bé câu con cá có chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là rùa Ti Bô. Bé câu con cá có chữ bờ nhé!', 'vi utterance: "Ti Bô", "chữ bờ"');
  eq(startText, 'Mình là rùa Tibo. Bé câu con cá có chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animal', { animal: 'fox' }, { lang: 'vi' });
  ok(/^(Bé ơi, câu con cáo nhé!|Con cáo đâu rồi nhỉ\? Bé chạm vào bong bóng nhé!|Bé tìm con cáo nhé!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read TL.debug.voiceLog)');
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
  E3.TL.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['fox', 'bunny', 'penguin']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'a rabbit')] });
  eq((await pr2).id, 'bunny', 'interim match resolves after a short wait');
  // Talk "where does it live": vi home words without diacritics
  const prH = V2.listen({ lang: 'vi', choices: ch('vi', 'home', ['forest', 'ice', 'desert']), timeoutMs: 2000 });
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
