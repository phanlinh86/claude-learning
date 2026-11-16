#!/usr/bin/env node
// Moka's Fairy Tea Party — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/bear-fairy-tea:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists are HARD-CODED from docs/DESIGN.md (§5.1 content, §6 voice), so the test holds while
// content.js is being rewritten. When the tea-party content.js exists (FT.GUESTS + FT.Content.makeRound with `members`),
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
  return sb.FT;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
// never negative (skill rule). "not" / "không phải" is the game's own question ("Which one is NOT red?") and allowed.
const NEG_EN = /\b(no|nope|wrong|incorrect|bad|fail|failed|mistake|oops|sorry|uh-oh|oh no)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|sai rồi|dở|tệ|hỏng|không đúng|chưa đúng|trật|nhầm|hư)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !/no!/i.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
const r0 = () => 0, r5 = () => 0.5, r9 = () => 0.99;
const RNGS = [r0, r5, r9];
function tidy(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  if (/[{}]/.test(s) || /undefined|null|NaN|\[object/.test(s)) return false;
  if (/\s[!?.,]/.test(s) || /^[!?.,—]/.test(s) || /_/.test(s) || /\s{2}/.test(s)) return false;
  if (/màu màu|\bthe the\b|\bcon con\b|\ba the\b|\bthe a\b|bánh bánh|hình hình|đĩa đĩa|thẻ thẻ|cái cái|chữ chữ|số số|nhỏ nhỏ|\bto to\b|quả quả|\bcookie cookie\b/i.test(s)) return false;
  if (/\ba [aeiou]/i.test(s.replace(/(letter|big|small|with|not|and|or) a /ig, ''))) return false;   // "a oval"
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
const OBJECTS = ['cup', 'teapot', 'jar', 'bowl', 'cupcake'];
const HOME = { bunny: 'forest', fox: 'forest', deer: 'forest', squirrel: 'forest', owl: 'forest', raccoon: 'forest', mouse: 'forest',
  hedgehog: 'forest', penguin: 'ice', crab: 'sea', goldfish: 'sea', camel: 'desert', lion: 'savanna' };
const ANIMALS = Object.keys(HOME);
const FOREST = ANIMALS.filter(a => HOME[a] === 'forest'), WILD = ANIMALS.filter(a => HOME[a] !== 'forest');
const HOMES = ['forest', 'sea', 'ice', 'desert', 'savanna'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.sizeBig', 'p.count', 'p.animal', 'p.forest', 'p.letters', 'p.lower',
  'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const VI_NAMES = {
  obj: { cup: 'cái tách', teapot: 'ấm trà', jar: 'hũ mứt', bowl: 'cái bát', cupcake: 'bánh cupcake' },
  animal: { bunny: 'con thỏ', fox: 'con cáo', deer: 'con nai', squirrel: 'con sóc', owl: 'con cú', raccoon: 'con gấu mèo',
    mouse: 'con chuột', hedgehog: 'con nhím', penguin: 'chim cánh cụt', crab: 'con cua', goldfish: 'con cá vàng',
    camel: 'con lạc đà', lion: 'con sư tử' },
  home: { forest: 'rừng', sea: 'biển', ice: 'xứ băng', desert: 'sa mạc', savanna: 'đồng cỏ châu Phi' },
  shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
    rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' },
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' }
};
// the initial-letter topic: bare noun first letter, diacritics → base letter
const INITIAL = {
  en: { bunny: 'B', fox: 'F', deer: 'D', squirrel: 'S', owl: 'O', raccoon: 'R', mouse: 'M', hedgehog: 'H', penguin: 'P',
    crab: 'C', goldfish: 'G', camel: 'C', lion: 'L', cup: 'C', teapot: 'T', jar: 'J', bowl: 'B', cupcake: 'C' },
  vi: { bunny: 'T', fox: 'C', deer: 'N', squirrel: 'S', owl: 'C', raccoon: 'G', mouse: 'C', hedgehog: 'N', penguin: 'C',
    crab: 'C', goldfish: 'C', camel: 'L', lion: 'S', cup: 'T', teapot: 'A', jar: 'H', bowl: 'B', cupcake: 'B' }
};

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.FT = { debug: { voiceLog: [] } };
let FT;
try { FT = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = FT.I18N, V = FT.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  ok(!/\bBo\b|Bo’s|Farm Parade|parade|barn|rooster|tractor|woof|bucket|watering can|Cún Bo/i.test(src.replace(/\bbo\b/g, '')),
    `${f}: no sister-game names left (Bo / parade / barn / woof …)`);
}
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.SHAPES.slice().sort()), JSON.stringify(SHAPES.slice().sort()), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.OBJECTS), JSON.stringify(OBJECTS), 'I18N.OBJECTS = DESIGN FT.OBJECTS');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN FT.GUESTS');
eq(JSON.stringify(I.GUESTS), JSON.stringify(ANIMALS), 'I18N.GUESTS = DESIGN FT.GUESTS');
eq(JSON.stringify(I.HOMES), JSON.stringify(HOMES), 'I18N.HOMES = DESIGN list');
eq(JSON.stringify(I.ANIMAL_HOME), JSON.stringify(HOME), 'I18N.ANIMAL_HOME = FT.GUESTS of DESIGN §5.1');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
eq(JSON.stringify(I.MEMBER_KINDS), JSON.stringify(['obj', 'cookie', 'plate', 'card', 'guest']), 'I18N.MEMBER_KINDS = DESIGN thing kinds');
for (const fn of ['t', 'ask', 'name', 'words', 'choiceWords', 'initial', 'bareWord', 'initialOf', 'phrase', 'sayName', 'sayRight',
  'sayWrong', 'sayWrongHint', 'sayCount', 'sayCountRun', 'talkWrong', 'speech', 'setChild', 'has', 'keys', 'raw', 'kindValue', 'homeOf'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(JSON.stringify(enKeys), JSON.stringify(viKeys), 'en and vi have the same key set');
for (const k of enKeys) {
  eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `"${k}" has the same {params} in en and vi`);
  eq(Array.isArray(I.raw('vi', k)), Array.isArray(I.raw('en', k)), `"${k}" variant list in both or neither`);
}
const LINE_KEYS = ['hint', 'idle', 'praise', 'great', 'enter', 'party', 'session.done', 'lantern', 'cheers', 'garland', 'moka.poke',
  'surprise.ladybug', 'surprise.butterfly', 'surprise.snail', 'surprise.fairies',
  'critter.ladybug', 'critter.butterfly', 'critter.snail', 'critter.fairies', 'wrong.any', 'right.any'];
const UI_KEYS = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'quieter', 'louder', 'voice',
  'mic', 'done', 'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapBo', 'tapMoka', 'tapHint', 'doorHint', 'skip', 'gallery', 'langName.en', 'langName.vi'].map(k => 'ui.' + k);
const REQUIRED = LINE_KEYS.concat(UI_KEYS, ['weather.0', 'weather.1', 'weather.2', 'weather.3', 'countOthers', 'p.any', 'wrong.hint',
  'talk.intro', 'talk.right', 'talk.colors', 'talk.shapes', 'talk.count', 'talk.animals', 'talk.forest', 'talk.animalsWho', 'talk.who',
  'talk.wrong', 'talk.wrong.any', 'talk.wrong.home', 'talk.wrong.berries'], TOPICS.map(t => 'topic.' + t));
for (const k of REQUIRED) ok(I.has('en', k) && I.has('vi', k), `key ${k} exists`);
for (const k of ['woof', 'gate', 'gateShort', 'door', 'march', 'bye', 'surprise.chick', 'chick.tap', 'surprise.rooster', 'rooster.tap',
  'surprise.fireflies', 'firefly.tap', 'bo.poke', 'p.farm', 'talk.wrong.apples'])
  ok(!I.has('en', k) && !I.has('vi', k), `parade-only key ${k} removed`);
for (let i = 0; i <= 20; i++) ok(I.has('en', 'count.' + i) && I.has('vi', 'count.' + i), `count.${i}`);
for (const k of LINE_KEYS) for (const l of I.langs) ok([].concat(I.raw(l, k)).length >= 3, `${l} ${k} has ≥ 3 wordings`);
for (const pk of PROMPT_KEYS) for (const l of I.langs) {
  ok(Array.isArray(I.raw(l, pk)) && I.raw(l, pk).length === 3, `${l} ${pk}: 3 wordings`);
  ok(I.has(l, pk + '.first'), `${l} ${pk}.first (first-time long form)`);
  eq(placeholders(I.raw(l, pk + '.first')).split(',').filter(x => x && !/berries|num|lower/.test(x)).join(','),
    placeholders(I.raw(l, pk)).split(',').filter(x => x && !/berries|num|lower/.test(x)).join(','), `${l} ${pk}.first uses the same params`);
}
for (const rk of ['color', 'shape', 'size', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'parity'])
  for (const l of I.langs) {
    ok([].concat(I.raw(l, 'right.' + rk)).length === 3, `${l} right.${rk}: 3 wordings`);
    ok([].concat(I.raw(l, 'wrong.' + rk)).length === 3, `${l} wrong.${rk}: 3 wordings`);
  }
for (const l of I.langs) ok([].concat(I.raw(l, 'wrong.n')).length === 3, `${l} wrong.n: 3 wordings`);
// every ui.* key that index.html / ui.js / main.js use exists; other keys main.js uses are listed (main is being rewritten)
(function () {
  const used = new Set();
  for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
    const p = path.join(ROOT, 'game', f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/data-i18n="([\w.]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bT1?\(\s*['"`]([\w.]+)['"`]/g)) used.add(m[1]);
    for (const m of src.matchAll(/['"`]((?:ui|topic|weather|talk|surprise|critter)\.[\w.]*\w)['"`]/g)) used.add(m[1]);
  }
  const missingOther = [];
  for (const k of used) {
    if (/^ui\./.test(k)) ok(I.has('en', k) && I.has('vi', k), `ui key used by index/ui/main exists: ${k}`);
    else if (!I.has('en', k) && !/^(topic|weather)\.$/.test(k)) missingOther.push(k);
  }
  if (missingOther.length) console.log('   note: keys main.js still uses from the parade game (integrator renames): ' + missingOther.join(', '));
})();

section('titles, Moka, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.title'), 'Moka’s Fairy Tea Party', 'en title');
eq(I.t('vi', 'ui.title'), 'Tiệc Trà Trong Rừng Của Gấu Moka', 'vi title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Moka’s / Fairy Tea Party', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Gấu Moka / Tiệc Trà Trong Rừng', 'vi logo lines');
ok(/Gấu Moka/.test(I.t('vi', 'ui.voice')), 'vi settings title says "Gấu Moka"');
ok(/Moka/.test(I.t('en', 'ui.listening')) && /Moka/.test(I.t('vi', 'ui.listening')), 'listening line names Moka');
ok(I.keys('en').every(k => !/\bBo\b|parade|barn|farm\b|apple/i.test([].concat(I.raw('en', k)).join(' '))), 'en: no parade words');
ok(I.keys('vi').every(k => !/\bBo\b|diễu hành|chuồng|nông trại|quả táo|Cún/i.test([].concat(I.raw('vi', k)).join(' '))), 'vi: no parade words');
for (const k of I.keys('vi')) {
  if (/^ui\.langName|^count\./.test(k)) continue;
  for (const s of [].concat(I.raw('vi', k))) if (/\p{L}{3}/u.test(s.replace(/\{\w+\}/g, '')) && !/^\{\w+\}$/.test(s))
    ok(VI_DIACRITIC.test(s) || /^(Xong)/.test(s), `vi ${k} has diacritics: ${s}`);
}
for (const pk of PROMPT_KEYS) ok([].concat(I.raw('vi', pk)).some(s => /^Bé ơi, .*nh(ỉ|é)[?!]$/.test(s)), `vi ${pk} has a warm "Bé ơi, … nhé!/nhỉ?" wording`);
ok(I.keys('vi').every(k => [].concat(I.raw('vi', k)).every(s => !/màu \{color\}/.test(s))), 'vi never "màu {color}" (the name already says "màu")');
ok(I.keys('vi').every(k => [].concat(I.raw('vi', k)).every(s => !/sống ở \{home\}/.test(s))), 'vi "sống {home}" (homeAt carries the preposition)');
// DESIGN §6 canonical lines
eq(I.t('en', 'weather.0', null, r0), 'What a sunny day for tea!', 'weather.0 sunny');
eq(I.t('en', 'weather.1', null, r0), 'Whoosh, a breezy day!', 'weather.1 breezy');
eq(I.t('en', 'weather.2', null, r0), 'Pitter-patter, it’s raining!', 'weather.2 rain');
eq(I.t('en', 'weather.3', null, r0), 'Look, a rainbow!', 'weather.3 rainbow');
eq(I.t('en', 'lantern', null, r0), 'Up you go, little lantern!', 'lantern');
eq(I.t('en', 'cheers', null, r0), 'Cheers!', 'cheers'); eq(I.t('vi', 'cheers', null, r0), 'Cụng ly nào!', 'vi cheers');
eq(I.t('en', 'garland', null, r0), 'All the lanterns are glowing!', 'garland');
eq(I.t('en', 'enter', null, r0), 'Here come the tea things!', 'enter');

section('no negative words in any line');
for (const l of I.langs) for (const k of I.keys(l)) for (const s of [].concat(I.raw(l, k)))
  ok(positive(s), `${l} ${k} positive: ${s}`);

section('every string renders: no "{" left, tidy punctuation, the child name');
const SAMPLE = { color: 'red', shape: 'star', n: 3, animal: 'penguin', letter: 'B', parity: 'odd', a: 2, b: 3, size: 'big',
  stars: 12, word: 'bunny', home: 'ice', answer: 'red', thing: { kind: 'obj', obj: 'cup', color: 'blue' }, rule: 'red',
  first: 'C', expr: '2+3', ans: 'five', num: 'five', lower: 'b', berries: 'berries' };
for (const l of I.langs) for (const k of I.keys(l)) {
  const raw = [].concat(I.raw(l, k));
  for (let i = 0; i < raw.length; i++) {
    const rng = () => (i + 0.01) / raw.length;
    for (const child of ['', 'Mai']) {
      const s = I.t(l, k, Object.assign({ child }, SAMPLE), rng);
      ok(tidy(s), `${l} ${k}#${i} child="${child}" renders tidy: ${s}`);
      if (!child) ok(!/friend!$|, bé!|bé bé/i.test(s), `${l} ${k}#${i}: no placeholder child name: ${s}`);
    }
  }
}
eq(I.t('en', 'ui.welcome', { child: 'Mai' }, r9), 'Hi Mai! I am Moka. Welcome to my fairy tea party!', 'welcome prefers the child name');
eq(I.t('vi', 'ui.welcome', { child: '' }, r0), 'Chào bé! Mình là gấu Moka. Mời bé đến dự tiệc trà trong rừng nhé!', 'vi welcome without a name');
eq(I.t('vi', 'great', { child: 'Mai' }, r0), 'Bé Mai tìm giỏi quá!', 'vi great with the name');
I.setChild('An'); eq(I.t('en', 'great', null, r0), 'Great finding, An!', 'setChild fills {child}'); I.setChild('');
eq(I.t('en', 'great', { child: '' }, r0), 'What sharp eyes!', 'no-name: {child} variants skipped');
eq(I.t('en', 'session.done', { stars: 14 }, r0), 'What a tea party! 14 stars! Hooray!', 'session.done');

section('prompts: DESIGN examples, every value, first-time forms, fallbacks');
eq(I.ask('en', 'p.colors', { color: 'red' }, { first: true }), 'They’re all red… but one! Which one is NOT red?', 'en p.colors first (DESIGN)');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { first: true }), 'Các bạn đều màu đỏ… trừ một bạn! Bạn nào không phải màu đỏ?', 'vi p.colors first');
eq(I.ask('en', 'p.colors', { color: 'red' }, { rng: r0 }), 'Which one is not red?', 'en p.colors (DESIGN)');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { rng: r0 }), 'Bé ơi, bạn nào không phải màu đỏ nhỉ?', 'vi p.colors');
eq(I.ask('en', 'p.shapes', { shape: 'oval' }, { rng: r0 }), 'Which cookie is not an oval?', 'en p.shapes "an oval"');
eq(I.ask('en', 'p.shapes5', { shape: 'star' }, { rng: r5 }), 'Find the cookie that’s not a star!', 'en p.shapes5');
eq(I.ask('vi', 'p.shapes', { shape: 'star' }, { rng: r0 }), 'Bé ơi, bánh quy nào không phải hình ngôi sao nhỉ?', 'vi p.shapes uses "hình ngôi sao"');
eq(I.ask('en', 'p.size', {}, { rng: r0 }), 'Which one is the little one?', 'en p.size (DESIGN)');
eq(I.ask('en', 'p.sizeBig', {}, { rng: r0 }), 'Which one is the big one?', 'en p.sizeBig');
eq(I.ask('en', 'p.count', { n: 3 }, { rng: r0 }), 'Which plate does not have three berries?', 'en p.count (DESIGN)');
eq(I.ask('en', 'p.count', { n: 1 }, { rng: r0 }), 'Which plate does not have one berry?', 'en p.count singular');
eq(I.ask('vi', 'p.count', { n: 2 }, { rng: r0 }), 'Bé ơi, đĩa nào không có hai quả dâu nhỉ?', 'vi p.count');
eq(I.ask('en', 'p.animal', { animal: 'bunny' }, { rng: r0 }), 'Which one is not a bunny?', 'en p.animal (DESIGN)');
eq(I.ask('en', 'p.animal', { animal: 'owl' }, { rng: r0 }), 'Which one is not an owl?', 'en p.animal "an owl"');
eq(I.ask('vi', 'p.animal', { animal: 'squirrel' }, { rng: r0 }), 'Bé ơi, bạn nào không phải con sóc nhỉ?', 'vi p.animal classifier');
eq(I.ask('en', 'p.forest', {}, { rng: r0 }), 'Who doesn’t live in the forest?', 'en p.forest (DESIGN)');
eq(I.ask('vi', 'p.forest', {}, { rng: r0 }), 'Bé ơi, bạn nào không sống trong rừng nhỉ?', 'vi p.forest');
eq(I.ask('en', 'p.letters', { letter: 'B' }, { rng: r0 }), 'Which card is not letter B?', 'en p.letters');
eq(I.ask('vi', 'p.letters', { letter: 'B' }, { rng: r0 }), 'Bé ơi, thẻ nào không phải chữ B nhỉ?', 'vi p.letters');
eq(I.ask('en', 'p.lower', { letter: 'a' }, { rng: r0 }), 'Which card is not big A or small a?', 'en p.lower');
eq(I.ask('vi', 'p.lower', { letter: 'A' }, { rng: r0 }), 'Bé ơi, thẻ nào không phải chữ A hoa hay chữ a thường nhỉ?', 'vi p.lower');
eq(I.ask('en', 'p.initial', { letter: 'C' }, { rng: r0 }), 'Which one does not start with C?', 'en p.initial');
eq(I.ask('en', 'p.add', { n: 5 }, { rng: r0 }), 'Which card does not make five?', 'en p.add');
eq(I.ask('vi', 'p.sub', { n: 4 }, { rng: r0 }), 'Bé ơi, thẻ nào không bằng bốn nhỉ?', 'vi p.sub');
eq(I.ask('en', 'p.oddeven', { parity: 'even' }, { rng: r0 }), 'Which number is not even?', 'en p.oddeven');
eq(I.ask('vi', 'p.oddeven', { parity: 'odd' }, { rng: r0 }), 'Bé ơi, số nào không phải số lẻ nhỉ?', 'vi p.oddeven');
eq(I.ask('en', 'p.colors', {}, { rng: r0 }), 'Which one is different?', 'missing param → p.any');
eq(I.ask('en', 'p.colors', {}, { first: true, rng: r0 }), 'Which one is different?', 'missing param + first → p.any');
eq(I.ask('en', 'p.unknown', {}, { rng: r0 }), 'Which one is different?', 'unknown prompt key → p.any');
eq(I.ask('en', 'p.shapes5', {}, { rng: r0 }), 'Which one is different?', 'p.shapes5 without shape → p.any');
const PARAMS_FOR = { 'p.colors': COLORS.map(c => ({ color: c })), 'p.shapes': SHAPES.map(s => ({ shape: s })),
  'p.shapes5': SHAPES.map(s => ({ shape: s })), 'p.size': [{}], 'p.sizeBig': [{}], 'p.forest': [{}],
  'p.count': Array.from({ length: 12 }, (x, i) => ({ n: i + 1 })), 'p.animal': ANIMALS.map(a => ({ animal: a })),
  'p.letters': LETTERS.map(c => ({ letter: c })), 'p.lower': LETTERS.map(c => ({ letter: c })),
  'p.initial': LETTERS.map(c => ({ letter: c })), 'p.add': Array.from({ length: 20 }, (x, i) => ({ n: i + 1 })),
  'p.sub': Array.from({ length: 10 }, (x, i) => ({ n: i })), 'p.oddeven': [{ parity: 'odd' }, { parity: 'even' }] };
for (const [pk, list] of Object.entries(PARAMS_FOR)) for (const l of I.langs) for (const prm of list) for (const first of [false, true])
  for (const rng of RNGS) {
    const s = I.ask(l, pk, prm, { first, rng });
    ok(tidy(s) && positive(s) && /\?$|!$/.test(s), `${l} ${pk} ${JSON.stringify(prm)} first=${first}: ${s}`);
    ok(!/Which one is different|khác các bạn kia nhỉ/.test(s), `${l} ${pk} ${JSON.stringify(prm)}: not the p.any fallback`);
    if (prm.color) ok(s.includes(I.name(l, 'color', prm.color)), `${l} ${pk} says the colour: ${s}`);
    if (prm.animal) ok(s.includes(I.name(l, 'animal', prm.animal)), `${l} ${pk} says the animal: ${s}`);
    if (l === 'vi') ok(VI_DIACRITIC.test(s), `vi ${pk} has diacritics: ${s}`);
  }
for (const n of [1, 2, 5]) ok(/berr(y|ies)/.test(I.ask('en', 'p.count', { n }, { first: true })), 'en p.count first berries ' + n);
// every prompt for every topic / age with sample params (DESIGN §5.1 AGE_TOPICS → prompt keys)
const TOPIC_PROMPTS = { colors: ['p.colors'], shapes: ['p.shapes', 'p.shapes5'], size: ['p.size', 'p.sizeBig'], count: ['p.count'],
  animals: ['p.animal', 'p.forest'], letters: ['p.letters'], lower: ['p.lower'], initial: ['p.initial'], add: ['p.add'], sub: ['p.sub'],
  oddeven: ['p.oddeven'] };
for (const [age, tops] of Object.entries(AGE_TOPICS)) for (const tp of tops) for (const pk of TOPIC_PROMPTS[tp]) for (const l of I.langs)
  for (const first of [true, false]) {
    const s = I.ask(l, pk, PARAMS_FOR[pk][Math.min(+age, PARAMS_FOR[pk].length - 1)], { first, rng: r5 });
    ok(tidy(s) && !/[{}]/.test(s) && (l === 'en' || VI_DIACRITIC.test(s)), `age ${age} ${tp} ${l} ${pk} first=${first}: ${s}`);
  }

section('names for every kind × value (DESIGN §6)');
const NAME_CASES = {
  color: COLORS, hue: COLORS, shape: SHAPES, shapeH: SHAPES, obj: OBJECTS, objWord: OBJECTS, cookie: SHAPES,
  plate: [1, 2, 3, 5, 10, 12], berries: [1, 2, 7], animal: ANIMALS, guest: ANIMALS, word: ANIMALS, who: ANIMALS, home: HOMES,
  homeAt: HOMES, number: Array.from({ length: 21 }, (x, i) => i), n: [0, 4, 20], letter: LETTERS, sum: ['2+3', '10+10', '1+0'],
  diff: ['7−2', '10-4', '5−5'], parity: ['odd', 'even'], size: ['big', 'small'], card: ['B', '7', '3+2', '7−4']
};
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const l of I.langs) for (const v of vals) {
  const s = I.name(l, kind, v);
  ok(typeof s === 'string' && s.length > 0 && !/undefined|null|\[object/.test(s), `${l} name ${kind} ${v} = ${s}`);
  if (l === 'vi' && !['letter', 'number', 'n', 'sum', 'diff', 'parity', 'card'].includes(kind)) {
    const en = I.name('en', kind, v);
    ok(s !== en, `vi name ${kind} ${v} is translated (${s})`);
  }
}
for (const [kind, tbl] of Object.entries(VI_NAMES)) for (const [v, want] of Object.entries(tbl)) eq(I.name('vi', kind, v), want, `vi ${kind} ${v}`);
eq(I.name('en', 'obj', 'jar'), 'jam jar', 'en jar = jam jar');
eq(I.name('vi', 'cookie', 'circle'), 'bánh quy hình tròn', 'vi cookie = bánh quy hình …');
eq(I.name('vi', 'cookie', 'star'), 'bánh quy hình ngôi sao', 'vi cookie star');
eq(I.name('en', 'cookie', 'heart'), 'heart cookie', 'en cookie');
eq(I.name('vi', 'plate', 3), 'đĩa có ba quả dâu', 'vi plate');
eq(I.name('en', 'plate', 1), 'plate with one berry', 'en plate singular');
eq(I.name('vi', 'plate'), 'đĩa dâu', 'vi plate without n');
eq(I.name('en', 'homeAt', 'ice'), 'on the ice', 'en homeAt');
eq(I.name('vi', 'homeAt', 'forest'), 'trong rừng', 'vi homeAt forest');
eq(I.name('en', 'size', 'small'), 'little', 'en small = little');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('vi', 'parity', 'even'), 'chẵn', 'vi even');
for (const a of ANIMALS) eq(I.homeOf(a), HOME[a], `homeOf ${a}`);
eq(I.homeOf('guests/fox_hop'), 'forest', 'homeOf accepts an asset path');

section('initial(): first letter of the bare noun, both languages');
for (const l of I.langs) for (const [v, want] of Object.entries(INITIAL[l])) {
  const kind = OBJECTS.includes(v) ? 'obj' : 'guest', field = kind === 'obj' ? 'obj' : 'animal';
  eq(I.initial(l, kind === 'obj' ? 'obj' : 'animal', v), want, `${l} initial ${kind} ${v}`);
  eq(I.initial(l, { kind, [field]: v }), want, `${l} initial(thing) ${v}`);
  eq(I.initial(l, { thing: { kind, [field]: v } }), want, `${l} initial(choice) ${v}`);
  const bw = I.bareWord(l, kind === 'obj' ? 'obj' : 'animal', v);
  ok(!/^(con|cái|chiếc|quả) /.test(bw), `${l} bare word without classifier: ${bw}`);
}
eq(I.bareWord('vi', 'animal', 'bunny'), 'thỏ', 'vi "con thỏ" → "thỏ"');
eq(I.initial('vi', 'animal', 'penguin'), 'C', 'vi "chim cánh cụt" → C');
eq(I.initial('vi', 'obj', 'teapot'), 'A', 'vi "ấm trà" → A (diacritics stripped)');
eq(I.initial('en', 'word', 'đá'), 'D', 'đ → D');
eq(JSON.stringify(I.initialOf('vi', 'deer')), JSON.stringify({ word: 'nai', first: 'N' }), 'initialOf (compat)');

section('phrases: things named for a sentence');
const PH = [
  ['en', { kind: 'obj', obj: 'cup', color: 'blue' }, 'the blue cup'],
  ['vi', { kind: 'obj', obj: 'cup', color: 'blue' }, 'cái tách màu xanh dương'],
  ['en', { kind: 'obj', obj: 'teapot', color: 'orange' }, 'the orange teapot'],
  ['en', { kind: 'obj', obj: 'jar', color: 'red' }, 'the red jam jar'],
  ['vi', { kind: 'obj', obj: 'bowl', color: 'red', big: false }, 'cái bát nhỏ màu đỏ'],
  ['vi', { kind: 'obj', obj: 'cupcake', color: 'pink', big: false }, 'bánh cupcake nhỏ màu hồng'],
  ['en', { kind: 'cookie', shape: 'star', color: 'red' }, 'the star cookie'],
  ['en', { kind: 'cookie', shape: 'oval', color: 'red' }, 'the oval cookie'],
  ['vi', { kind: 'cookie', shape: 'heart', color: 'red' }, 'bánh quy hình trái tim'],
  ['en', { kind: 'plate', n: 3 }, 'the plate with three berries'],
  ['vi', { kind: 'plate', n: 1 }, 'đĩa có một quả dâu'],
  ['en', { kind: 'card', text: 'B' }, 'letter B'], ['en', { kind: 'card', text: 'b' }, 'small b'],
  ['vi', { kind: 'card', text: 'B' }, 'thẻ chữ B'], ['vi', { kind: 'card', text: 'b' }, 'thẻ chữ b thường'],
  ['en', { kind: 'card', text: '2+3' }, '2 + 3'], ['vi', { kind: 'card', text: '7', n: 7 }, 'thẻ số bảy'],
  ['en', { kind: 'card', text: '7', n: 7 }, 'number seven'],
  ['en', { kind: 'guest', animal: 'fox', big: false }, 'the little fox'],
  ['vi', { kind: 'guest', animal: 'raccoon', big: false }, 'con gấu mèo nhỏ'],
  ['vi', { kind: 'guest', animal: 'penguin', home: 'ice' }, 'chim cánh cụt'],
  ['en', { kind: 'guest', animal: 'owl' }, 'the owl'],
  ['en', { kind: 'color', color: 'pink' }, 'pink'], ['vi', { kind: 'home', home: 'savanna' }, 'đồng cỏ châu Phi'],
  ['en', { kind: 'home', home: 'desert' }, 'the desert'],
  ['en', { kind: 'number', n: 4 }, 'four'], ['en', { kind: 'size', big: true }, 'the big one'],
  ['en', { nameKind: 'color', nameValue: 'red' }, 'the red one'],
  // older kind names still work (block / crate / tile / animal)
  ['en', { kind: 'block', shape: 'square' }, 'the square cookie'], ['en', { kind: 'animal', animal: 'deer' }, 'the deer']
];
for (const [l, th, want] of PH) eq(I.phrase(l, th), want, `${l} phrase ${JSON.stringify(th)}`);
eq(I.sayName('vi', { thing: { kind: 'obj', obj: 'teapot', color: 'green' } }), 'ấm trà màu xanh lá', 'sayName from {thing}');
for (const l of I.langs) {
  const up = s => s.replace(/^./, x => x.toUpperCase());
  for (const o of OBJECTS) for (const c of COLORS) for (const big of [true, false])
    ok(tidy(up(I.phrase(l, { kind: 'obj', obj: o, color: c, big }))), `${l} obj ${o} ${c} ${big}`);
  for (const s of SHAPES) for (const c of COLORS) ok(tidy(up(I.phrase(l, { kind: 'cookie', shape: s, color: c }))), `${l} cookie ${s}`);
  for (let n = 1; n <= 12; n++) ok(tidy(up(I.phrase(l, { kind: 'plate', n }))), `${l} plate ${n}`);
  for (const a of ANIMALS) for (const big of [true, false]) ok(tidy(up(I.phrase(l, { kind: 'guest', animal: a, big }))), `${l} guest ${a}`);
  for (const t of LETTERS.concat(LETTERS.map(x => x.toLowerCase()), ['3+2', '7−4', '12', '0'])) ok(tidy(up(I.phrase(l, { kind: 'card', text: t }))), `${l} card ${t}`);
}

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
// every Talk answer kind (DESIGN §4.3 drawIcon choices + member things): color, shape, size, number, home, animal, obj, letter, parity, text
const WORD_CASES = { color: COLORS, shape: SHAPES, size: ['big', 'small'], obj: OBJECTS, animal: ANIMALS, home: HOMES,
  parity: ['odd', 'even'], letter: LETTERS };
for (const [kind, vals] of Object.entries(WORD_CASES)) for (const lang of I.langs) for (const v of vals) {
  const ws = I.words(lang, kind, v);
  ok(ws.length >= 1 && ws.every(w => w === w.toLowerCase()), `${lang} words ${kind} ${v}: lower-case forms (${ws.length})`);
  const nm = kind === 'letter' ? v.toLowerCase() : I.name(lang, kind, v).toLowerCase();
  ok(ws.includes(nm), `${lang} words ${kind} ${v} include the name "${nm}"`);
  if (kind !== 'letter') ok(ws.includes(I.stripMarks(nm)), `${lang} words ${kind} ${v} include the no-diacritic name`);
}
for (const lang of I.langs) for (let n = 0; n <= 20; n++) {
  const ws = I.words(lang, 'number', n);
  ok(ws.includes(String(n)), `${lang} words number ${n} include the digits`);
  if (!(lang === 'vi' && n === 0)) ok(ws.includes(I.name(lang, 'number', n)), `${lang} words number ${n} include "${I.name(lang, 'number', n)}"`);
  ok(ws.includes(I.stripMarks(I.name(lang, 'number', n))) || n === 0, `${lang} words number ${n} no-diacritic form`);
  for (const alias of ['plate', 'n', 'berries', 'crate'])
    ok(JSON.stringify(I.words(lang, alias, n)) === JSON.stringify(ws), `${lang} ${alias} words = number words (${n})`);
}
ok(I.words('vi', 'number', 3).includes('ba quả dâu') && I.words('en', 'number', 3).includes('three berries'), '"three berries" / "ba quả dâu" accepted');
ok(I.words('vi', 'number', 4).includes('bốn quả') && I.words('vi', 'number', 4).includes('bon qua'), '"bốn quả" accepted');
ok(I.words('en', 'sum', '2+3').includes('two plus three') && I.words('vi', 'diff', '7−2').includes('bay tru hai'), 'sum / diff words');
for (const lang of I.langs) for (const s of SHAPES) eq(JSON.stringify(I.words(lang, 'cookie', s)), JSON.stringify(I.words(lang, 'shape', s)), `${lang} cookie words = shape words ${s}`);
for (const lang of I.langs) for (const a of ANIMALS) eq(JSON.stringify(I.words(lang, 'guest', a)), JSON.stringify(I.words(lang, 'animal', a)), `${lang} guest words = animal words ${a}`);
// no spoken form shared by two values of one kind
for (const [kind, vals] of Object.entries(WORD_CASES)) for (const lang of I.langs) {
  if (kind === 'letter') continue;
  const seen = {};
  for (const v of vals) for (const w of I.words(lang, kind, v)) {
    ok(!seen[w] || seen[w] === v, `${lang} ${kind}: "${w}" not shared by ${seen[w]} and ${v}`);
    seen[w] = v;
  }
}
const MATCH_CASES = { color: COLORS, shape: SHAPES, size: ['big', 'small'], animal: ANIMALS, home: HOMES, obj: OBJECTS,
  number: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
for (const [kind, vals] of Object.entries(MATCH_CASES)) for (const lang of I.langs) {
  const set = ch(lang, kind, vals);
  for (const v of vals) {
    eq(V.match([I.name(lang, kind, v)], set), String(v), `${lang} "${I.name(lang, kind, v)}" → ${kind} ${v}`);
    eq(V.match([I.stripMarks(I.name(lang, kind, v))], set), String(v), `${lang} no diacritics "${I.stripMarks(I.name(lang, kind, v))}" → ${v}`);
  }
}
// Talk-time utterances a child really says
const SAYS = [
  ['vi', 'home', HOMES, 'ở xứ băng', 'ice'], ['vi', 'home', HOMES, 'dưới biển', 'sea'], ['vi', 'home', HOMES, 'trong rung', 'forest'],
  ['vi', 'home', HOMES, 'dong co chau phi', 'savanna'], ['vi', 'home', HOMES, 'sa mac', 'desert'], ['vi', 'home', HOMES, 'ở xa mạc', 'desert'],
  ['en', 'home', HOMES, 'in the forest', 'forest'], ['en', 'home', HOMES, 'the woods', 'forest'], ['en', 'home', HOMES, 'on the ice', 'ice'],
  ['en', 'home', HOMES, 'the ocean', 'sea'], ['en', 'home', HOMES, 'in the dessert', 'desert'], ['en', 'home', HOMES, 'africa', 'savanna'],
  ['vi', 'color', COLORS, 'mầu đổ', 'red'], ['vi', 'color', COLORS, 'màu xanh lá cây', 'green'],
  ['en', 'animal', ANIMALS, 'a rabbit', 'bunny'], ['en', 'animal', ANIMALS, 'it is a fish', 'goldfish'], ['en', 'animal', ANIMALS, 'racoon', 'raccoon'],
  ['vi', 'animal', ANIMALS, 'con hươu', 'deer'], ['vi', 'animal', ANIMALS, 'cá vàng', 'goldfish'], ['vi', 'animal', ANIMALS, 'chim canh cut', 'penguin'],
  ['vi', 'animal', ANIMALS, 'gau meo', 'raccoon'], ['vi', 'animal', ANIMALS, 'cú mèo', 'owl'], ['vi', 'animal', ANIMALS, 'con cao', 'fox'],
  ['vi', 'animal', ANIMALS, 'lac da', 'camel'], ['vi', 'animal', ANIMALS, 'su tu', 'lion'],
  ['en', 'obj', OBJECTS, 'the teacup', 'cup'], ['en', 'obj', OBJECTS, 'a jam jar', 'jar'], ['vi', 'obj', OBJECTS, 'cái chén', 'bowl'],
  ['vi', 'obj', OBJECTS, 'ấm', 'teapot'], ['vi', 'obj', OBJECTS, 'banh cupcake', 'cupcake'], ['vi', 'obj', OBJECTS, 'cái ly', 'cup'],
  ['en', 'number', [2, 3, 4], 'three berries', '3'], ['vi', 'number', [2, 3, 4], 'bốn quả', '4'], ['vi', 'number', [2, 3, 4], '2', '2'],
  ['vi', 'number', [2, 3, 4], 'ba quả dâu', '3'],
  ['en', 'shape', SHAPES, 'a triangle', 'triangle'], ['vi', 'shape', SHAPES, 'hình tim', 'heart']
];
for (const [l, kind, vals, said, want] of SAYS) eq(V.match([said], ch(l, kind, vals), l), want, `${l} said "${said}" → ${want}`);
eq(V.match(['xanh'], ch('vi', 'color', COLORS), 'vi'), null, '"xanh" alone is ambiguous → no match');
// Talk choices (any thing kind) → choiceWords
const CHOICES = [
  [{ id: 'a', thing: { kind: 'color', color: 'red' } }, 'đỏ'], [{ id: 'b', thing: { kind: 'number', n: 3 } }, '3'],
  [{ id: 'c', thing: { kind: 'home', home: 'ice' } }, 'xứ băng'], [{ id: 'c2', thing: { kind: 'home', home: 'forest' } }, 'rừng'],
  [{ id: 'd', thing: { kind: 'size', big: false } }, 'nhỏ'],
  [{ id: 'e', thing: { kind: 'cookie', shape: 'triangle', color: 'red' } }, 'tam giác'], [{ id: 'f', thing: { kind: 'guest', animal: 'bunny' } }, 'thỏ'],
  [{ id: 'g', thing: { kind: 'plate', n: 4 } }, 'bốn'], [{ id: 'h', thing: { kind: 'card', text: 'B' } }, 'bờ'],
  [{ id: 'i', thing: { kind: 'obj', obj: 'cup', color: 'blue' } }, 'xanh dương'],
  [{ id: 'j', thing: { kind: 'guest', animal: 'lion', nameKind: 'animal', nameValue: 'lion' } }, 'sư tử'],
  [{ id: 'k', thing: { kind: 'card', text: '7', n: 7 } }, 'bảy'], [{ id: 'l', thing: { kind: 'obj', obj: 'jar' } }, 'hũ mứt']
];
for (const [c, w] of CHOICES) ok(I.choiceWords('vi', c).includes(w), `vi choiceWords ${JSON.stringify(c.thing)} include "${w}"`);
eq(JSON.stringify(I.kindValue({ thing: { kind: 'plate', n: 5 } })), JSON.stringify(['number', 5]), 'kindValue plate → number');
eq(JSON.stringify(I.kindValue({ thing: { kind: 'cookie', shape: 'star', color: 'red' } })), JSON.stringify(['shape', 'star']), 'kindValue cookie → shape');
eq(JSON.stringify(I.kindValue({ thing: { kind: 'guest', animal: 'fox', big: false } })), JSON.stringify(['size', 'small']), 'kindValue little guest → size');
eq(JSON.stringify(I.kindValue({ thing: { nameKind: 'forest', nameValue: 'sea' } })), JSON.stringify(['home', 'sea']), 'kindValue nameKind forest → home');

section('game lines: sayRight / sayWrong for every rule kind (DESIGN §6 examples)');
const R = (l, e, rng) => I.sayRight(l, e, rng || r0);
const Wr = (l, e, rng) => I.sayWrong(l, e, rng || r0);
eq(R('en', { rule: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'cup', color: 'blue' } }), 'The blue cup! It’s not red.', 'en right colour');
eq(R('vi', { rule: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'cup', color: 'blue' } }), 'Cái tách màu xanh dương! Nó không phải màu đỏ.', 'vi right colour');
eq(R('en', { rule: { kind: 'home', value: 'forest' }, thing: { kind: 'guest', animal: 'penguin' } }), 'The penguin! The penguin lives on the ice.', 'en right forest (DESIGN)');
eq(R('vi', { rule: { kind: 'forest', value: 'forest' }, thing: { kind: 'guest', animal: 'penguin' } }), 'Chim cánh cụt! Chim cánh cụt sống ở xứ băng.', 'vi right forest');
eq(R('vi', { rule: { kind: 'home', value: 'forest' }, thing: { kind: 'guest', animal: 'crab' } }), 'Con cua! Con cua sống dưới biển.', 'vi right forest: crab');
eq(R('en', { rule: { kind: 'home', value: 'forest' }, thing: { kind: 'guest', animal: 'camel' } }), 'The camel! The camel lives in the desert.', 'en right forest: camel');
eq(R('en', { rule: { kind: 'n', value: 2 }, thing: { kind: 'plate', n: 4 }, count: { n: 4 } }), 'One, two, three, four berries! The others have two.', 'en right count = the count run');
eq(R('vi', { rule: { kind: 'count', value: 2 }, thing: { kind: 'plate', n: 4 } }), 'Một, hai, ba, bốn quả dâu! Các đĩa kia có hai quả.', 'vi right count');
eq(R('en', { rule: { kind: 'shape', value: 'circle' }, thing: { kind: 'cookie', shape: 'star', color: 'red' } }), 'The star cookie! It’s not a circle.', 'en right shape');
eq(R('vi', { rule: { kind: 'shape', value: 'circle' }, thing: { kind: 'cookie', shape: 'star' } }), 'Bánh quy hình ngôi sao! Nó không phải hình tròn.', 'vi right shape');
eq(R('en', { rule: { kind: 'size', value: 'big' }, thing: { kind: 'guest', animal: 'bunny', big: false } }), 'The bunny! It’s the little one.', 'en right size');
eq(R('en', { rule: { kind: 'size', value: 'big' }, thing: { kind: 'obj', obj: 'teapot', color: 'red', big: false } }), 'The teapot! It’s the little one.', 'en right size obj');
eq(R('en', { rule: { kind: 'animal', value: 'fox' }, thing: { kind: 'guest', animal: 'owl' } }), 'The owl! It’s not a fox.', 'en right animal');
eq(R('vi', { rule: { kind: 'animal', value: 'fox' }, thing: { kind: 'guest', animal: 'mouse' } }), 'Con chuột! Bạn ấy không phải con cáo.', 'vi right animal');
eq(R('en', { rule: { kind: 'letter', value: 'A' }, thing: { kind: 'card', text: 'B' } }), 'Letter B! It’s not letter A.', 'en right letter');
eq(R('vi', { rule: { kind: 'letter', value: 'A' }, thing: { kind: 'card', text: 'B' } }), 'Thẻ chữ B! Nó không phải chữ A.', 'vi right letter');
eq(R('en', { rule: { kind: 'lower', value: 'A' }, thing: { kind: 'card', text: 'm' } }), 'Small m! It’s not big A or small a.', 'en right lower');
eq(R('en', { rule: { kind: 'initial', value: 'B' }, thing: { kind: 'guest', animal: 'fox' } }), 'The fox! Fox starts with F, not B.', 'en right initial');
eq(R('vi', { rule: { kind: 'initial', value: 'T' }, thing: { kind: 'guest', animal: 'deer' } }), 'Con nai! Nai bắt đầu bằng chữ N, không phải chữ T.', 'vi right initial');
eq(R('en', { rule: { kind: 'sum', value: 5 }, thing: { kind: 'card', text: '2+4' } }), '2 + 4 makes six! The others make five.', 'en right sum');
eq(R('vi', { rule: { kind: 'diff', value: 3 }, thing: { kind: 'card', text: '7−2' } }), '7 − 2 bằng năm! Các thẻ kia bằng ba.', 'vi right diff');
eq(R('en', { rule: { kind: 'parity', value: 'even' }, thing: { kind: 'card', text: '7', n: 7 } }), 'Seven! Seven is odd. The others are even.', 'en right parity');
eq(Wr('en', { want: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'teapot', color: 'red' } }), 'The teapot is red like its friends! Which one isn’t red?', 'en wrong colour');
eq(Wr('vi', { want: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'teapot', color: 'red' } }), 'Ấm trà màu đỏ giống các bạn! Bạn nào khác màu nhỉ?', 'vi wrong colour');
eq(Wr('en', { want: { kind: 'n', value: 2 }, thing: { kind: 'plate', n: 2 } }), 'Two berries, like its friends! Which plate is different?', 'en wrong count');
eq(Wr('vi', { want: { kind: 'n', value: 2 }, thing: { kind: 'plate', n: 2 } }), 'Có hai quả dâu, giống các đĩa kia! Đĩa nào khác nhỉ?', 'vi wrong count');
eq(Wr('vi', { want: { kind: 'home', value: 'forest' }, got: { nameKind: 'animal', nameValue: 'squirrel' } }), 'Con sóc ở rừng giống các bạn! Bạn nào ở xa nhỉ?', 'vi wrong forest rebuilt from got');
eq(Wr('en', { want: { kind: 'home', value: 'forest' }, thing: { kind: 'guest', animal: 'hedgehog' } }), 'The hedgehog lives here, like its friends! Who doesn’t?', 'en wrong forest');
eq(Wr('en', { want: { kind: 'size', value: 'big' }, thing: { kind: 'guest', animal: 'deer', big: true } }), 'The deer is big like its friends! Find the little one!', 'en wrong size');
eq(Wr('en', { want: { kind: 'shape', value: 'star' }, thing: { kind: 'cookie', shape: 'star', color: 'red' } }), 'The star cookie, like its friends! Which cookie isn’t a star?', 'en wrong shape');
eq(Wr('vi', { want: { kind: 'shape', value: 'star' }, thing: { kind: 'cookie', shape: 'star', color: 'red' } }), 'Bánh quy hình ngôi sao giống các bạn! Bánh nào khác hình nhỉ?', 'vi wrong shape');
eq(Wr('en', { want: { kind: 'parity', value: 'even' }, thing: { kind: 'card', text: '4', n: 4 } }), 'Four is even, like its friends! Which number isn’t?', 'en wrong parity');
eq(Wr('en', { want: { kind: 'initial', value: 'B' }, thing: { kind: 'guest', animal: 'bunny' } }), 'Bunny starts with B, like its friends! Which one doesn’t?', 'en wrong initial');
eq(Wr('en', {}), 'Let’s look again!', 'wrong without anything → wrong.any');
// the first wording of every wrong line is short (typical members, both languages)
for (const l of I.langs) for (const c of [
  { want: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'cupcake', color: 'red' } },
  { want: { kind: 'shape', value: 'star' }, thing: { kind: 'cookie', shape: 'star', color: 'red' } },
  { want: { kind: 'size', value: 'big' }, thing: { kind: 'guest', animal: 'raccoon', big: true } },
  { want: { kind: 'size', value: 'small' }, thing: { kind: 'obj', obj: 'bowl', color: 'red', big: false } },
  { want: { kind: 'n', value: 3 }, thing: { kind: 'plate', n: 3 } },
  { want: { kind: 'animal', value: 'squirrel' }, thing: { kind: 'guest', animal: 'squirrel' } },
  { want: { kind: 'home', value: 'forest' }, thing: { kind: 'guest', animal: 'hedgehog' } },
  { want: { kind: 'letter', value: 'B' }, thing: { kind: 'card', text: 'B' } },
  { want: { kind: 'sum', value: 5 }, thing: { kind: 'card', text: '2+3' } },
  { want: { kind: 'parity', value: 'even' }, thing: { kind: 'card', text: '4', n: 4 } }]) {
  const s1 = Wr(l, c);
  ok(s1.length <= 64, `${l} wrong ${c.want.kind} first wording ≤ 64 chars (${s1.length}): ${s1}`);
  const h = I.sayWrongHint(l, c, r0);
  ok(tidy(h) && positive(h) && h.length <= 66, `${l} wrong+hint line ${c.want.kind} (${h.length}): ${h}`);
}
eq(I.sayWrongHint('en', { want: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'cup', color: 'red' } }, r0), 'The cup, like its friends! Look at the glowing one!', 'en wrong + hint pointer line');
eq(I.sayWrongHint('en', { want: { kind: 'n', value: 3 }, thing: { kind: 'plate', n: 3 } }, r0), 'Psst! Look at the glowing one!', 'plate miss + hint → plain hint');
eq(R('en', {}), 'You found it!', 'right without anything → right.any');
// rule from topic + params when main forgot `rule`
eq(R('en', { topic: 'colors', params: { color: 'red' }, thing: { kind: 'obj', obj: 'bowl', color: 'green' } }), 'The green bowl! It’s not red.', 'rule derived from topic + params');
eq(R('en', { topic: 'animals', promptKey: 'p.forest', thing: { kind: 'guest', animal: 'lion' } }), 'The lion! The lion lives on the savanna.', 'forest rule from promptKey');
eq(R('en', { topic: 'count', params: { n: 3 }, thing: { kind: 'plate', n: 1 } }), 'One berry! The others have three.', 'count singular');

// full sweep: every rule kind × many members × 3 wordings → full, tidy, positive sentences that name the member
function memberSets() {
  const out = [];
  for (const c of COLORS) for (const o of OBJECTS) for (const c2 of COLORS) if (c2 !== c)
    out.push({ rule: { kind: 'color', value: c }, odd: { kind: 'obj', obj: o, color: c2 }, match: { kind: 'obj', obj: o, color: c } });
  for (const s of SHAPES) for (const s2 of SHAPES) if (s2 !== s)
    out.push({ rule: { kind: 'shape', value: s }, odd: { kind: 'cookie', shape: s2, color: 'red' }, match: { kind: 'cookie', shape: s, color: 'blue' } });
  for (const a of ANIMALS.concat(OBJECTS)) {
    const k = OBJECTS.includes(a) ? 'obj' : 'guest', f = k === 'obj' ? 'obj' : 'animal';
    out.push({ rule: { kind: 'size', value: 'big' }, odd: { kind: k, [f]: a, big: false, color: 'red' }, match: { kind: k, [f]: a, big: true, color: 'red' } });
  }
  for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) if (a !== b)
    out.push({ rule: { kind: 'n', value: a }, odd: { kind: 'plate', n: b }, match: { kind: 'plate', n: a }, count: { n: b } });
  for (const a of FOREST) for (const b of FOREST) if (a !== b)
    out.push({ rule: { kind: 'animal', value: b }, odd: { kind: 'guest', animal: a }, match: { kind: 'guest', animal: b } });
  for (const a of WILD) for (const b of FOREST)
    out.push({ rule: { kind: 'home', value: 'forest' }, odd: { kind: 'guest', animal: a, home: HOME[a] }, match: { kind: 'guest', animal: b, home: 'forest' }, home: HOME[a] });
  for (const L1 of LETTERS) for (const L2 of ['B', 'M', 'S', 'T']) if (L1 !== L2) {
    out.push({ rule: { kind: 'letter', value: L1 }, odd: { kind: 'card', text: L2 }, match: { kind: 'card', text: L1 } });
    out.push({ rule: { kind: 'lower', value: L1 }, odd: { kind: 'card', text: L2.toLowerCase() }, match: { kind: 'card', text: L1.toLowerCase() } });
  }
  for (const lang of ['en', 'vi']) {
    const things = ANIMALS.map(a => ({ kind: 'guest', animal: a })).concat(OBJECTS.map(o => ({ kind: 'obj', obj: o, color: 'red' })));
    for (const t1 of things) for (const t2 of things) {
      const i1 = I.initial(lang, t1), i2 = I.initial(lang, t2);
      if (i1 !== i2) out.push({ lang, rule: { kind: 'initial', value: i1 }, odd: t2, match: t1 });
    }
  }
  for (let v = 2; v <= 10; v++) for (let a = 0; a <= v; a++) {
    out.push({ rule: { kind: 'sum', value: v }, odd: { kind: 'card', text: a + '+' + (v - a + 1) }, match: { kind: 'card', text: a + '+' + (v - a) } });
    out.push({ rule: { kind: 'diff', value: a }, odd: { kind: 'card', text: (v + 1) + '−' + (v - a) }, match: { kind: 'card', text: v + '−' + (v - a) } });
  }
  for (let n = 1; n <= 20; n++) for (const m of [2, 4, 6, 3, 5])
    if (n % 2 !== m % 2) out.push({ rule: { kind: 'parity', value: m % 2 ? 'odd' : 'even' }, odd: { kind: 'card', text: String(n), n }, match: { kind: 'card', text: String(m), n: m } });
  return out;
}
let sweepN = 0;
for (const c of memberSets()) for (const l of (c.lang ? [c.lang] : I.langs)) for (const rng of RNGS) {
  const right = I.sayRight(l, { rule: c.rule, thing: c.odd, count: c.count, home: c.home }, rng);
  const wrong = I.sayWrong(l, { want: c.rule, thing: c.match }, rng);
  sweepN++;
  ok(tidy(right) && positive(right) && /[.!?]$/.test(right), `${l} right ${c.rule.kind} ${JSON.stringify(c.odd)}: ${right}`);
  ok(tidy(wrong) && positive(wrong) && /[.!?]$/.test(wrong), `${l} wrong ${c.rule.kind} ${JSON.stringify(c.match)}: ${wrong}`);
  ok(!/You found it|Bé tìm ra rồi|Đúng bạn đó|That one is different|khác các bạn kia!$/.test(right), `${l} right ${c.rule.kind} is specific: ${right}`);
  ok(!/^(Let’s look again!|Mình tìm lại nhé!)$/.test(wrong), `${l} wrong ${c.rule.kind} is specific: ${wrong}`);
  ok(/like its friends|just like the others|like the others|giống các (bạn|đĩa)/.test(wrong) || /are friends|là bạn của nhau|goes with|đi cùng/.test(wrong), `${l} wrong ${c.rule.kind} says it matches its friends: ${wrong}`);
  if (l === 'vi') ok(VI_DIACRITIC.test(right) && VI_DIACRITIC.test(wrong), `vi lines have diacritics: ${right} / ${wrong}`);
  if (['obj', 'guest'].includes(c.odd.kind) && c.rule.kind !== 'initial') {
    const nm = I.name(l, c.odd.kind === 'obj' ? 'obj' : (c.rule.kind === 'home' ? 'who' : 'animal'), c.odd[c.odd.kind === 'obj' ? 'obj' : 'animal']);
    ok(right.toLowerCase().includes(nm.toLowerCase()), `${l} right names the odd one (${nm}): ${right}`);
  }
  if (c.rule.kind === 'home') ok(right.includes(I.name(l, 'homeAt', c.home)), `${l} right says where it lives: ${right}`);
}
console.log(`   (${sweepN} member × rule × wording combinations)`);

section('counting');
eq(I.sayCount('en', 1), 'One!', 'en count 1'); eq(I.sayCount('vi', 15), 'Mười lăm!', 'vi count 15'); eq(I.sayCount('en', 25), '25!', 'beyond 20 → digits');
eq(I.sayCountRun('en', 3), 'One, two, three berries!', 'count run without others');
eq(I.sayCountRun('en', 1, 4), 'One berry! The others have four.', 'count run singular + others');
eq(I.sayCountRun('vi', 2, 1), 'Một, hai quả dâu! Các đĩa kia có một quả.', 'vi count run');
for (const l of I.langs) for (let n = 1; n <= 12; n++) for (let o = 1; o <= 12; o++) if (o !== n) {
  const s = I.sayCountRun(l, n, o);
  ok(tidy(s) && positive(s), `${l} count run ${n} vs ${o}: ${s}`);
}

section('talk');
eq(I.t('en', 'talk.colors'), 'What colour is this?', 'talk colours');
eq(I.t('en', 'talk.shapes', { shape: 'triangle' }), 'Which one is the triangle?', 'talk shapes');
eq(I.t('vi', 'talk.shapes', { shape: 'triangle' }), 'Cái nào là hình tam giác nhỉ?', 'vi talk shapes');
eq(I.t('en', 'talk.count'), 'How many berries?', 'talk count');
eq(I.t('vi', 'talk.count'), 'Có mấy quả dâu nào?', 'vi talk count');
eq(I.t('en', 'talk.animals', { animal: 'penguin' }), 'Where does the penguin live?', 'talk animals');
eq(I.t('vi', 'talk.animals', { animal: 'penguin' }), 'Chim cánh cụt sống ở đâu nhỉ?', 'vi talk animals');
eq(I.t('vi', 'talk.forest', { animal: 'goldfish' }), 'Con cá vàng sống ở đâu nhỉ?', 'vi talk forest');
eq(I.t('en', 'talk.animals', {}), 'Where does it live?', 'talk animals fallback');
eq(I.t('vi', 'talk.animalsWho'), 'Đây là con gì nhỉ?', 'vi who is this');
eq(I.talkWrong('en', { id: 'x', thing: { kind: 'home', home: 'ice' } }, { show: { kind: 'guest', animal: 'penguin' } }), 'The penguin lives on the ice! Good try!', 'talkWrong home with the animal');
eq(I.talkWrong('vi', { id: 'x', thing: { kind: 'home', home: 'forest' } }), 'Bạn ấy sống trong rừng đó! Bé cố gắng lắm!', 'vi talkWrong home without the animal');
eq(I.talkWrong('vi', { id: 'x', thing: { kind: 'home', home: 'desert' } }, { show: { animal: 'camel' } }), 'Con lạc đà sống ở sa mạc đó! Bé cố gắng lắm!', 'vi talkWrong camel desert');
eq(I.talkWrong('en', { thing: { kind: 'color', color: 'blue' } }), 'It is blue! Good try!', 'talkWrong colour');
eq(I.talkWrong('vi', { thing: { kind: 'color', color: 'blue' } }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', { thing: { kind: 'cookie', shape: 'oval' } }), 'It is an oval! Good try!', 'talkWrong shape "an oval"');
eq(I.talkWrong('en', { thing: { kind: 'number', n: 3 } }, { topic: 'count' }), 'There are three berries! Good try!', 'talkWrong count');
eq(I.talkWrong('vi', { thing: { kind: 'number', n: 3 } }, { topic: 'count' }), 'Có ba quả dâu đó! Bé cố gắng lắm!', 'vi talkWrong count');
eq(I.talkWrong('vi', { thing: { kind: 'number', n: 7 } }), 'Là số bảy đó! Bé cố gắng lắm!', 'vi talkWrong number');
eq(I.talkWrong('en', { thing: { kind: 'guest', animal: 'fox' } }), 'It is the fox! Good try!', 'talkWrong animal');
eq(I.talkWrong('en', { thing: { kind: 'obj', obj: 'teapot' } }), 'It is the teapot! Good try!', 'talkWrong object');
eq(I.talkWrong('en', 'letter', 'b'), 'It is small b! Good try!', 'talkWrong small letter');
eq(I.talkWrong('en', 'size', 'small'), 'It is the little one! Good try!', 'talkWrong size');
eq(I.talkWrong('en', null), 'Good try! Let’s play more!', 'talkWrong unknown');
for (const l of I.langs) {
  for (const h of HOMES) for (const a of ANIMALS) ok(tidy(I.talkWrong(l, { thing: { kind: 'home', home: h } }, { show: { animal: a } })), `${l} talkWrong home ${h} ${a}`);
  for (const c of COLORS) ok(tidy(I.talkWrong(l, 'color', c)), `${l} talkWrong ${c}`);
  for (const o of OBJECTS) ok(tidy(I.talkWrong(l, 'obj', o)), `${l} talkWrong obj ${o}`);
  for (const s of SHAPES) ok(tidy(I.talkWrong(l, 'shape', s)), `${l} talkWrong shape ${s}`);
  for (const a of ANIMALS) ok(tidy(I.talkWrong(l, 'animal', a)), `${l} talkWrong animal ${a}`);
  for (let n = 0; n <= 12; n++) ok(tidy(I.talkWrong(l, 'number', n, { topic: 'count' })), `${l} talkWrong n ${n}`);
}
// every Talk key with sample params
for (const l of I.langs) for (const k of I.keys(l).filter(k => /^talk\./.test(k))) {
  const s = I.t(l, k, { color: 'red', shape: 'star', size: 'small', animal: 'deer', letter: 'B', word: 'fox', a: 2, b: 3, parity: 'odd', answer: 'red', num: 'three', thing: { kind: 'guest', animal: 'fox' }, home: 'forest' }, r0);
  ok(tidy(s), `${l} ${k}: ${s}`);
}

// ------------------------------------------------------------------ content.js (tea party) when it exists
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
  if (/GUESTS/.test(csrc) && /members/.test(csrc) && /cookie/.test(csrc)) {
    try {
      const sbc = makeSandbox(); sbc.FT = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.FT.Content && sbc.FT.Content.makeRound && sbc.FT.GUESTS) contentSB = sbc;
    } catch (e) { console.log('   note: tea content.js does not load yet: ' + e.message); }
  }
}
console.log(`   (${contentSB ? 'tea-party content.js loaded' : 'tea-party content.js not there yet — content checks skipped'})`);
if (contentSB) {
  section('content.js: every promptKey / Talk key / member it produces');
  const CF = contentSB.FT, C = CF.Content;
  for (const a of Object.keys(CF.GUESTS || {})) { ok(I.ANIMALS.includes(a), `content guest ${a} has names`); eq(I.homeOf(a), CF.GUESTS[a], `content guest ${a} home`); }
  for (const o of CF.OBJECTS || []) ok(I.OBJECTS.includes(o), `content object ${o} has names`);
  for (const c of CF.COLORS || []) ok(I.COLORS.includes(c), `content colour ${c} has names`);
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
    const ask = I.ask(lang, round.promptKey, round.params, { first: ri === 0 });
    ok(tidy(ask) && !/Which one is different|khác các bạn kia nhỉ/.test(ask), `${lang} age ${age} ${topic}: ask ${round.promptKey} ${JSON.stringify(round.params)} → ${ask}`);
    for (const m of round.members) {
      const e = { id: m.id, thing: m.thing, topic, promptKey: round.promptKey, params: round.params, rule: round.rule };
      if (m.odd) {
        const s = I.sayRight(lang, Object.assign({ count: m.thing.kind === 'plate' ? { n: m.thing.n } : undefined }, e));
        ok(tidy(s) && positive(s) && !/^(You found it!|Bé tìm ra rồi!)$/.test(s), `${lang} age ${age} ${topic} right: ${s}`);
      } else {
        const s = I.sayWrong(lang, Object.assign({ want: round.rule, got: { nameKind: m.thing.nameKind, nameValue: m.thing.nameValue } }, e));
        ok(tidy(s) && positive(s) && !/^(Let’s look again!|Mình tìm lại nhé!)$/.test(s), `${lang} age ${age} ${topic} wrong: ${s}`);
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

section('speech text: letters, maths, pauses, "Moka"');
eq(I.speech('en', 'That’s letter D, like its friends.'), 'That’s letter dee, like its friends.', 'en letter names');
eq(I.speech('en', 'The fox! F is for fox!'), 'The fox! eff is for fox!', 'en "F is for"');
eq(I.speech('en', 'The fox! Fox starts with F, not B.'), 'The fox! Fox starts with eff, not bee.', 'en starts with / not');
eq(I.speech('en', 'Which one does not start with C?'), 'Which one does not start with see?', 'en start with');
eq(I.speech('en', 'Which card is not big A or small a?'), 'Which card is not big ay or small ay?', 'en big/small letters');
eq(I.speech('en', 'They’re all red… but one! Which one is NOT red?'), 'They’re all red, but one! Which one is not red?', '… → comma pause, NOT → not');
eq(I.speech('en', '2 + 4 makes six!'), '2 plus 4 makes six!', 'en plus');
eq(I.speech('vi', '7 − 2 bằng năm!'), '7 trừ 2 bằng năm!', 'vi minus');
eq(I.speech('vi', 'Bé ơi, thẻ nào không phải chữ B nhỉ?'), 'Bé ơi, thẻ nào không phải chữ bờ nhỉ?', 'vi phonics');
eq(I.speech('vi', 'Thẻ chữ m thường!'), 'Thẻ chữ mờ thường!', 'vi small letter');
eq(I.speech('en', 'Hi! I am Moka.'), 'Hi! I am Moka.', 'en "Moka" as written');
eq(I.speech('vi', 'Mình là gấu Moka. Moka giúp bé nhé!'), 'Mình là gấu Moka. Moka giúp bé nhé!', 'vi "Moka" as written');
eq(I.speech('en', 'Moka is listening…'), 'Moka is listening.', 'final ellipsis → full stop');
eq(I.speech('en', 'Find the one that’s not red!'), 'Find the one that’s not red!', 'plain line untouched');
eq(V.spoken('vi', 'Chào bé! Mình là Moka.'), 'Chào bé! Mình là Moka.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Which card is not letter B?'), 'Which card is not letter bee?', 'Voice.spoken letter names');
for (const l of I.langs) for (const k of I.keys(l)) {
  const s = I.speech(l, I.t(l, k, SAMPLE, r0));
  ok(!/…|NOT\b|[+−]/.test(s) && !/,\s*[!?.]/.test(s), `${l} ${k} speech text clean: ${s}`);
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
  sb4.FT = {};
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
  sb7.FT = {};
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
  sb5.FT = {};
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
  sb6.FT = {};
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
ok(sb.FT.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into FT.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof FT.Input.attach === 'function' && typeof FT.Input.kidProof === 'function' && typeof FT.Input.holdButton === 'function',
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
  sbx.FT = {};
  env.FT = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.FT.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.1) < 1e-9, 'Moka: rate 0.9, pitch 1.1');
  ok(V2.RATE === 0.9 && V2.PITCH === 1.1, 'Voice.RATE / PITCH exported');
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
  // vi: "Moka" goes to TTS as written, letter names are rewritten; the bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là gấu Moka. Bé tìm thẻ không phải chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là gấu Moka. Bé tìm thẻ không phải chữ bờ nhé!', 'vi utterance: "Moka" kept, "chữ bờ"');
  eq(startText, 'Mình là gấu Moka. Bé tìm thẻ không phải chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animal', { animal: 'fox' }, { lang: 'vi' });
  ok(/^(Bé ơi, bạn nào không phải con cáo nhỉ\?|Bé tìm bạn không phải con cáo nhé!|Nhìn các bạn khách nè! Bạn nào không phải con cáo\?)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read FT.debug.voiceLog)');
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
  E3.FT.__dummy = 0;
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
