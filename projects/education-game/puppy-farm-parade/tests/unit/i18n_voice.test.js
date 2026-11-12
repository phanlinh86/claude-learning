#!/usr/bin/env node
// Bo's Farm Parade — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/puppy-farm-parade:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (§5.1 content, §6 voice). When the parade content.js exists
// (FP.Content making rounds with `members` + `rule`), every prompt / Talk key + params it produces and every member's
// right / wrong line are rendered too.
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
  return sb.FP;
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
// a stricter "clean" without the look-behind (kept simple and explicit)
function tidy(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  if (/[{}]/.test(s) || /undefined|null|NaN|\[object/.test(s)) return false;
  if (/\s[!?.,]/.test(s) || /^[!?.,—]/.test(s) || /_/.test(s) || /\s{2}/.test(s)) return false;
  if (/màu màu|\bthe the\b|\bcon con\b|\ba the\b|\bthe a\b|khối khối|hình hình|thùng thùng|cái cái|chữ chữ|số số|nhỏ nhỏ|\bto to\b/i.test(s)) return false;
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
const OBJECTS = ['bucket', 'boot', 'can', 'tractor', 'flower'];
const ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
const HOME = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
  crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
const HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.sizeBig', 'p.count', 'p.animal', 'p.farm', 'p.letters', 'p.lower',
  'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const VI_NAMES = {
  obj: { bucket: 'cái xô', boot: 'chiếc ủng', can: 'bình tưới', tractor: 'xe máy cày', flower: 'chậu hoa' },
  animal: { cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', hen: 'con gà mái', horse: 'con ngựa',
    goat: 'con dê', crab: 'con cua', fishbowl: 'bể cá vàng', penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ' },
  home: { farm: 'nông trại', sea: 'biển', ice: 'xứ băng', savanna: 'đồng cỏ châu Phi', jungle: 'rừng rậm' },
  shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
    rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' },
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' }
};
// the initial-letter topic: bare noun first letter, diacritics → base letter
const INITIAL = {
  en: { cow: 'C', pig: 'P', sheep: 'S', duck: 'D', hen: 'H', horse: 'H', goat: 'G', crab: 'C', penguin: 'P', lion: 'L',
    monkey: 'M', fishbowl: 'G', bucket: 'B', boot: 'B', can: 'W', tractor: 'T', flower: 'F' },
  vi: { cow: 'B', pig: 'H', sheep: 'C', duck: 'V', hen: 'G', horse: 'N', goat: 'D', crab: 'C', penguin: 'C', lion: 'S',
    monkey: 'K', fishbowl: 'C', bucket: 'X', boot: 'U', can: 'B', tractor: 'X', flower: 'C' }
};

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.FP = { debug: { voiceLog: [] } };
let FP;
try { FP = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = FP.I18N, V = FP.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  ok(!/Kiki|Camp Chimes|chime|lantern|\bPom\b|jigsaw|elephant|hedgehog/i.test(src), `${f}: no sister-game names left (Kiki / chimes / Pom …)`);
}
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.SHAPES.slice().sort()), JSON.stringify(SHAPES.slice().sort()), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.OBJECTS), JSON.stringify(OBJECTS), 'I18N.OBJECTS = DESIGN list');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.HOMES), JSON.stringify(HOMES), 'I18N.HOMES = DESIGN list');
eq(JSON.stringify(I.ANIMAL_HOME), JSON.stringify(HOME), 'I18N.ANIMAL_HOME = FP.ANIMALS of DESIGN §5.1');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
for (const fn of ['t', 'ask', 'name', 'words', 'choiceWords', 'initial', 'bareWord', 'initialOf', 'phrase', 'sayName', 'sayRight',
  'sayWrong', 'sayCount', 'sayCountRun', 'talkWrong', 'speech', 'setChild', 'has', 'keys', 'raw', 'kindValue', 'homeOf'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(JSON.stringify(enKeys), JSON.stringify(viKeys), 'en and vi have the same key set');
for (const k of enKeys) {
  eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `"${k}" has the same {params} in en and vi`);
  eq(Array.isArray(I.raw('vi', k)), Array.isArray(I.raw('en', k)), `"${k}" variant list in both or neither`);
}
const REQUIRED = ['woof', 'gate', 'gateShort', 'march', 'hint', 'idle', 'praise', 'great', 'enter', 'party', 'session.done',
  'weather.0', 'weather.1', 'weather.2', 'weather.3', 'surprise.chick', 'chick.tap', 'surprise.rooster', 'rooster.tap',
  'surprise.fireflies', 'firefly.tap', 'bo.poke', 'door', 'bye', 'countOthers', 'p.any', 'right.any', 'wrong.any',
  'talk.intro', 'talk.right', 'talk.colors', 'talk.shapes', 'talk.count', 'talk.animals', 'talk.animalsWho',
  'talk.wrong', 'talk.wrong.any', 'talk.wrong.home', 'ui.volume', 'ui.logo1', 'ui.logo2', 'ui.title', 'ui.voice', 'ui.tapBo']
  .concat(TOPICS.map(t => 'topic.' + t));
for (const k of REQUIRED) ok(I.has('en', k) && I.has('vi', k), `key ${k} exists`);
for (let i = 0; i <= 20; i++) ok(I.has('en', 'count.' + i) && I.has('vi', 'count.' + i), `count.${i}`);
for (const k of ['woof', 'gate', 'march', 'hint', 'idle', 'praise', 'great', 'enter', 'party', 'session.done', 'surprise.chick',
  'chick.tap', 'surprise.rooster', 'rooster.tap', 'surprise.fireflies', 'firefly.tap', 'bo.poke', 'wrong.any', 'right.any'])
  for (const l of I.langs) ok([].concat(I.raw(l, k)).length >= 3, `${l} ${k} has ≥ 3 wordings`);
for (const pk of PROMPT_KEYS) for (const l of I.langs) {
  ok(Array.isArray(I.raw(l, pk)) && I.raw(l, pk).length === 3, `${l} ${pk}: 3 wordings`);
  ok(I.has(l, pk + '.first'), `${l} ${pk}.first (first-time long form)`);
  eq(placeholders(I.raw(l, pk + '.first')).split(',').filter(x => x && !/apples|num|lower/.test(x)).join(','),
    placeholders(I.raw(l, pk)).split(',').filter(x => x && !/apples|num|lower/.test(x)).join(','), `${l} ${pk}.first uses the same params`);
}
for (const rk of ['color', 'shape', 'size', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'parity'])
  for (const l of I.langs) {
    ok([].concat(I.raw(l, 'right.' + rk)).length === 3, `${l} right.${rk}: 3 wordings`);
    ok([].concat(I.raw(l, 'wrong.' + rk)).length === 3, `${l} wrong.${rk}: 3 wordings`);
  }
for (const l of I.langs) ok([].concat(I.raw(l, 'wrong.n')).length === 3, `${l} wrong.n: 3 wordings`);
// every key that index.html / ui.js / main.js use exists (ui.*, topic.*, weather.*, talk.*)
(function () {
  const used = new Set();
  for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
    const p = path.join(ROOT, 'game', f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/data-i18n="([\w.]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/['"`]((?:ui|topic|weather|talk)\.[\w.]*\w)['"`]/g)) used.add(m[1]);
  }
  const missingOther = [];
  for (const k of used) {
    if (/^ui\./.test(k)) ok(I.has('en', k) && I.has('vi', k), `ui key used by index/ui/main exists: ${k}`);
    else if (!I.has('en', k)) missingOther.push(k);
  }
  if (missingOther.length) console.log('   note: non-ui keys main.js still uses from the chime game: ' + missingOther.join(', '));
})();

section('titles, Bo, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.title'), 'Bo’s Farm Parade', 'en title');
eq(I.t('vi', 'ui.title'), 'Cún Bo Tìm Bạn Lạc Đàn', 'vi title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Bo’s / Farm Parade', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Cún Bo / Tìm Bạn Lạc Đàn', 'vi logo lines');
ok(/Cún Bo/.test(I.t('vi', 'ui.voice')), 'vi settings title says "Cún Bo"');
ok(I.keys('en').every(k => !/Kiki|chime|lantern/i.test([].concat(I.raw('en', k)).join(' '))), 'en: no chime-game words');
ok(I.keys('vi').every(k => !/Kiki|chuông|đèn lồng/i.test([].concat(I.raw('vi', k)).join(' '))), 'vi: no chime-game words');
for (const k of I.keys('vi')) {
  if (/^ui\.langName|^count\./.test(k)) continue;
  for (const s of [].concat(I.raw('vi', k))) if (/\p{L}{3}/u.test(s.replace(/\{\w+\}/g, '')) && !/^\{\w+\}$/.test(s))
    ok(VI_DIACRITIC.test(s) || /^(Bo|Ò ó o!|Xong)/.test(s), `vi ${k} has diacritics: ${s}`);
}
for (const pk of PROMPT_KEYS) ok([].concat(I.raw('vi', pk)).some(s => /^Bé ơi, .*nh(ỉ|é)[?!]$/.test(s)), `vi ${pk} has a warm "Bé ơi, … nhé!/nhỉ?" wording`);
ok(I.keys('vi').every(k => [].concat(I.raw('vi', k)).every(s => !/màu \{color\}/.test(s))), 'vi never "màu {color}" (the name already says "màu")');

section('no negative words in any line');
for (const l of I.langs) for (const k of I.keys(l)) for (const s of [].concat(I.raw(l, k)))
  ok(positive(s), `${l} ${k} positive: ${s}`);

section('every string renders: no "{" left, tidy punctuation, the child name');
const SAMPLE = { color: 'red', shape: 'star', n: 3, animal: 'penguin', letter: 'B', parity: 'odd', a: 2, b: 3, size: 'big',
  stars: 12, word: 'cow', home: 'ice', answer: 'red', thing: { kind: 'obj', obj: 'bucket', color: 'blue' }, rule: 'red',
  first: 'C', expr: '2+3', ans: 'five', num: 'five', lower: 'b', apples: 'apples' };
for (const l of I.langs) for (const k of I.keys(l)) {
  const raw = [].concat(I.raw(l, k));
  for (let i = 0; i < raw.length; i++) {
    const rng = () => (i + 0.01) / raw.length;
    for (const child of ['', 'Mai']) {
      const s = I.t(l, k, Object.assign({ child }, SAMPLE), rng);
      ok(tidy(s), `${l} ${k}#${i} child="${child}" renders tidy: ${s}`);
      if (!child) ok(!/friend!$|, bé!|bé bé/i.test(s) || k === 'talk.wrong.place', `${l} ${k}#${i}: no placeholder child name: ${s}`);
    }
  }
}
eq(I.t('en', 'ui.welcome', { child: 'Mai' }, r9), 'Hi Mai! I am Bo. Let’s have a farm parade!', 'welcome prefers the child name');
eq(I.t('vi', 'ui.welcome', { child: '' }, r0), 'Chào bé! Mình là cún Bo. Mình cùng đi diễu hành ở nông trại nhé!', 'vi welcome without a name');
eq(I.t('vi', 'great', { child: 'Mai' }, r0), 'Bé Mai diễu hành giỏi quá!', 'vi great with the name');
I.setChild('An'); eq(I.t('en', 'great', null, r0), 'Great parade, An!', 'setChild fills {child}'); I.setChild('');
eq(I.t('en', 'march', { child: '' }, r9), 'March, march, into the barn!', 'no-name: {child} variants skipped');
eq(I.t('en', 'session.done', { stars: 14 }, r0), 'What a farm day! 14 stars! Hooray!', 'session.done');

section('prompts: DESIGN examples, every value, first-time forms, fallbacks');
eq(I.ask('en', 'p.colors', { color: 'red' }, { first: true }), 'They’re all red… but one! Which one is NOT red?', 'en p.colors first');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { first: true }), 'Các bạn đều màu đỏ… trừ một bạn! Bạn nào không phải màu đỏ?', 'vi p.colors first');
eq(I.ask('en', 'p.colors', { color: 'red' }, { rng: r0 }), 'Which one is not red?', 'en p.colors');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { rng: r0 }), 'Bé ơi, bạn nào không phải màu đỏ nhỉ?', 'vi p.colors');
eq(I.ask('en', 'p.shapes', { shape: 'oval' }, { rng: r0 }), 'Which one is not an oval?', 'en p.shapes "an oval"');
eq(I.ask('vi', 'p.shapes', { shape: 'star' }, { rng: r0 }), 'Bé ơi, khối nào không phải hình ngôi sao nhỉ?', 'vi p.shapes uses "hình ngôi sao"');
eq(I.ask('en', 'p.size', {}, { rng: r0 }), 'Which one is the little one?', 'en p.size');
eq(I.ask('en', 'p.sizeBig', {}, { rng: r0 }), 'Which one is the big one?', 'en p.sizeBig (playtest P3-5)');
eq(I.ask('vi', 'p.sizeBig', {}, { rng: r0 }), 'Bé ơi, bạn nào to nhất nhỉ?', 'vi p.sizeBig');
eq(I.ask('en', 'p.count', { n: 3 }, { rng: r0 }), 'Which crate does not have three apples?', 'en p.count');
eq(I.ask('en', 'p.count', { n: 1 }, { rng: r0 }), 'Which crate does not have one apple?', 'en p.count singular');
eq(I.ask('vi', 'p.count', { n: 2 }, { rng: r0 }), 'Bé ơi, thùng nào không có hai quả táo nhỉ?', 'vi p.count');
eq(I.ask('en', 'p.animal', { animal: 'cow' }, { rng: r0 }), 'Which one is not a cow?', 'en p.animal');
eq(I.ask('vi', 'p.animal', { animal: 'hen' }, { rng: r0 }), 'Bé ơi, bạn nào không phải con gà mái nhỉ?', 'vi p.animal classifier');
eq(I.ask('en', 'p.farm', {}, { rng: r0 }), 'Who doesn’t live on the farm?', 'en p.farm');
eq(I.ask('vi', 'p.farm', {}, { rng: r0 }), 'Bé ơi, bạn nào không sống ở nông trại nhỉ?', 'vi p.farm');
eq(I.ask('en', 'p.letters', { letter: 'B' }, { rng: r0 }), 'Which one is not letter B?', 'en p.letters');
eq(I.ask('en', 'p.lower', { letter: 'a' }, { rng: r0 }), 'Which one is not big A or small a?', 'en p.lower');
eq(I.ask('vi', 'p.lower', { letter: 'A' }, { rng: r0 }), 'Bé ơi, chữ nào không phải chữ A hoa hay chữ a thường nhỉ?', 'vi p.lower');
eq(I.ask('en', 'p.initial', { letter: 'C' }, { rng: r0 }), 'Which one does not start with C?', 'en p.initial');
eq(I.ask('en', 'p.add', { n: 5 }, { rng: r0 }), 'Which one does not make five?', 'en p.add');
eq(I.ask('vi', 'p.sub', { n: 4 }, { rng: r0 }), 'Bé ơi, phép tính nào không bằng bốn nhỉ?', 'vi p.sub');
eq(I.ask('en', 'p.oddeven', { parity: 'even' }, { rng: r0 }), 'Which number is not even?', 'en p.oddeven');
eq(I.ask('vi', 'p.oddeven', { parity: 'odd' }, { rng: r0 }), 'Bé ơi, số nào không phải số lẻ nhỉ?', 'vi p.oddeven');
eq(I.ask('en', 'p.colors', {}, { rng: r0 }), 'Which one is different?', 'missing param → p.any');
eq(I.ask('en', 'p.colors', {}, { first: true, rng: r0 }), 'Which one is different?', 'missing param + first → p.any');
eq(I.ask('en', 'p.unknown', {}, { rng: r0 }), 'Which one is different?', 'unknown prompt key → p.any');
eq(I.ask('en', 'p.shapes5', {}, { rng: r0 }), 'Which one is different?', 'p.shapes5 without shape → p.any');
const PARAMS_FOR = { 'p.colors': COLORS.map(c => ({ color: c })), 'p.shapes': SHAPES.map(s => ({ shape: s })),
  'p.shapes5': SHAPES.map(s => ({ shape: s })), 'p.size': [{}], 'p.sizeBig': [{}], 'p.farm': [{}],
  'p.count': Array.from({ length: 12 }, (x, i) => ({ n: i + 1 })), 'p.animal': ANIMALS.map(a => ({ animal: a })),
  'p.letters': LETTERS.map(c => ({ letter: c })), 'p.lower': LETTERS.map(c => ({ letter: c })),
  'p.initial': LETTERS.map(c => ({ letter: c })), 'p.add': Array.from({ length: 20 }, (x, i) => ({ n: i + 1 })),
  'p.sub': Array.from({ length: 10 }, (x, i) => ({ n: i })), 'p.oddeven': [{ parity: 'odd' }, { parity: 'even' }] };
for (const [pk, list] of Object.entries(PARAMS_FOR)) for (const l of I.langs) for (const prm of list) for (const first of [false, true])
  for (const rng of RNGS) {
    const s = I.ask(l, pk, prm, { first, rng });
    ok(tidy(s) && positive(s) && /\?$|!$/.test(s), `${l} ${pk} ${JSON.stringify(prm)} first=${first}: ${s}`);
    if (prm.color) ok(s.includes(I.name(l, 'color', prm.color)), `${l} ${pk} says the colour: ${s}`);
    if (prm.animal) ok(s.includes(I.name(l, 'animal', prm.animal)), `${l} ${pk} says the animal: ${s}`);
  }
for (const n of [1, 2, 5]) ok(/apples?/.test(I.ask('en', 'p.count', { n }, { first: true })), 'en p.count first plural ' + n);

section('names for every kind × value (DESIGN §6)');
const NAME_CASES = {
  color: COLORS, hue: COLORS, shape: SHAPES, shapeH: SHAPES, obj: OBJECTS, block: SHAPES, crate: [1, 2, 3, 5, 10, 12],
  apples: [1, 2, 7], animal: ANIMALS, word: ANIMALS, who: ANIMALS, home: HOMES, homeAt: HOMES,
  number: Array.from({ length: 21 }, (x, i) => i), n: [0, 4, 20], letter: LETTERS, sum: ['2+3', '10+10', '1+0'],
  diff: ['7−2', '10-4', '5−5'], parity: ['odd', 'even'], size: ['big', 'small']
};
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const l of I.langs) for (const v of vals) {
  const s = I.name(l, kind, v);
  ok(typeof s === 'string' && s.length > 0 && !/undefined|null|\[object/.test(s), `${l} name ${kind} ${v} = ${s}`);
  if (l === 'vi' && !['letter', 'number', 'n', 'sum', 'diff'].includes(kind) && !(kind === 'parity')) {
    const en = I.name('en', kind, v);
    ok(s !== en || /^(Bo)$/.test(s), `vi name ${kind} ${v} is translated (${s})`);
  }
}
for (const [kind, tbl] of Object.entries(VI_NAMES)) for (const [v, want] of Object.entries(tbl)) eq(I.name('vi', kind, v), want, `vi ${kind} ${v}`);
eq(I.name('en', 'obj', 'can'), 'watering can', 'en can = watering can');
eq(I.name('en', 'animal', 'fishbowl'), 'goldfish', 'en fishbowl = goldfish');
eq(I.name('vi', 'block', 'circle'), 'khối hình tròn', 'vi block = khối hình …');
eq(I.name('vi', 'block', 'star'), 'khối hình ngôi sao', 'vi block star');
eq(I.name('vi', 'crate', 3), 'thùng có ba quả táo', 'vi crate');
eq(I.name('en', 'crate', 1), 'crate with one apple', 'en crate singular');
eq(I.name('vi', 'crate'), 'thùng táo', 'vi crate without n');
eq(I.name('en', 'homeAt', 'ice'), 'on the ice', 'en homeAt');
eq(I.name('en', 'size', 'small'), 'little', 'en small = little');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('vi', 'parity', 'even'), 'chẵn', 'vi even');
eq(I.homeOf('penguin'), 'ice', 'homeOf penguin');

section('initial(): first letter of the bare noun, both languages');
for (const l of I.langs) for (const [v, want] of Object.entries(INITIAL[l])) {
  const kind = OBJECTS.includes(v) ? 'obj' : 'animal';
  eq(I.initial(l, kind, v), want, `${l} initial ${kind} ${v}`);
  eq(I.initial(l, { kind, [kind]: v }), want, `${l} initial(thing) ${v}`);
  eq(I.initial(l, { thing: { kind, [kind]: v } }), want, `${l} initial(choice) ${v}`);
  const bw = I.bareWord(l, kind, v);
  ok(!/^(con|cái|chiếc|quả) /.test(bw), `${l} bare word without classifier: ${bw}`);
}
eq(I.bareWord('vi', 'animal', 'cow'), 'bò', 'vi "con bò" → "bò"');
eq(I.initial('vi', 'animal', 'penguin'), 'C', 'vi "chim cánh cụt" → C');
eq(I.initial('vi', 'obj', 'boot'), 'U', 'vi "ủng" → U (diacritics stripped)');
eq(I.initial('en', 'word', 'đá'), 'D', 'đ → D');
eq(JSON.stringify(I.initialOf('vi', 'duck')), JSON.stringify({ word: 'vịt', first: 'V' }), 'initialOf (compat)');

section('phrases: members named for a sentence');
const PH = [
  ['en', { kind: 'obj', obj: 'bucket', color: 'blue' }, 'the blue bucket'],
  ['vi', { kind: 'obj', obj: 'bucket', color: 'blue' }, 'cái xô màu xanh dương'],
  ['en', { kind: 'obj', obj: 'can', color: 'orange' }, 'the orange watering can'],
  ['vi', { kind: 'obj', obj: 'boot', color: 'red', big: false }, 'chiếc ủng nhỏ màu đỏ'],
  ['en', { kind: 'block', shape: 'star', color: 'red' }, 'the star'],
  ['vi', { kind: 'block', shape: 'heart', color: 'red' }, 'khối hình trái tim'],
  ['en', { kind: 'crate', n: 3 }, 'the crate with three apples'],
  ['vi', { kind: 'crate', n: 1 }, 'thùng có một quả táo'],
  ['en', { kind: 'tile', text: 'B' }, 'letter B'], ['en', { kind: 'tile', text: 'b' }, 'small b'],
  ['vi', { kind: 'tile', text: 'b' }, 'chữ b thường'], ['en', { kind: 'tile', text: '2+3' }, '2 + 3'],
  ['vi', { kind: 'tile', text: '7', n: 7 }, 'số bảy'],
  ['en', { kind: 'animal', animal: 'sheep', big: false }, 'the little sheep'],
  ['vi', { kind: 'animal', animal: 'penguin', home: 'ice' }, 'chim cánh cụt'],
  ['en', { kind: 'color', color: 'pink' }, 'pink'], ['vi', { kind: 'home', home: 'savanna' }, 'đồng cỏ châu Phi'],
  ['en', { kind: 'number', n: 4 }, 'four'], ['en', { kind: 'size', big: true }, 'the big one'],
  ['en', { nameKind: 'color', nameValue: 'red' }, 'the red one']
];
for (const [l, th, want] of PH) eq(I.phrase(l, th), want, `${l} phrase ${JSON.stringify(th)}`);
eq(I.sayName('vi', { thing: { kind: 'obj', obj: 'tractor', color: 'green' } }), 'xe máy cày màu xanh lá', 'sayName from {thing}');
for (const l of I.langs) {
  for (const o of OBJECTS) for (const c of COLORS) ok(tidy(I.phrase(l, { kind: 'obj', obj: o, color: c }).replace(/^./, x => x.toUpperCase())), `${l} obj ${o} ${c}`);
  for (const s of SHAPES) ok(tidy(I.phrase(l, { kind: 'block', shape: s, color: 'red' }).replace(/^./, x => x.toUpperCase())), `${l} block ${s}`);
  for (const a of ANIMALS) ok(tidy(I.phrase(l, { kind: 'animal', animal: a }).replace(/^./, x => x.toUpperCase())), `${l} animal ${a}`);
}

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
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
  ok(JSON.stringify(I.words(lang, 'crate', n)) === JSON.stringify(ws) && JSON.stringify(I.words(lang, 'n', n)) === JSON.stringify(ws), `${lang} crate / n words = number words`);
}
ok(I.words('vi', 'number', 3).includes('ba quả táo') && I.words('en', 'number', 3).includes('three apples'), '"three apples" / "ba quả táo" accepted');
ok(I.words('en', 'sum', '2+3').includes('two plus three') && I.words('vi', 'diff', '7−2').includes('bay tru hai'), 'sum / diff words');
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
  ['vi', 'home', HOMES, 'ở xứ băng', 'ice'], ['vi', 'home', HOMES, 'dưới biển', 'sea'], ['vi', 'home', HOMES, 'rung ram', 'jungle'],
  ['vi', 'home', HOMES, 'dong co chau phi', 'savanna'], ['en', 'home', HOMES, 'in the jungle', 'jungle'],
  ['en', 'home', HOMES, 'on the ice', 'ice'], ['en', 'home', HOMES, 'the ocean', 'sea'],
  ['vi', 'color', COLORS, 'mầu đổ', 'red'], ['vi', 'color', COLORS, 'màu xanh lá cây', 'green'],
  ['en', 'animal', ANIMALS, 'a piggy', 'pig'], ['vi', 'animal', ANIMALS, 'con lợn', 'pig'], ['vi', 'animal', ANIMALS, 'cá vàng', 'fishbowl'],
  ['vi', 'animal', ANIMALS, 'chim canh cut', 'penguin'], ['en', 'animal', ANIMALS, 'it is a fish', 'fishbowl'],
  ['en', 'number', [2, 3, 4], 'three apples', '3'], ['vi', 'number', [2, 3, 4], 'bốn quả', '4'], ['vi', 'number', [2, 3, 4], '2', '2'],
  ['en', 'shape', SHAPES, 'a triangle', 'triangle'], ['vi', 'shape', SHAPES, 'hình tim', 'heart']
];
for (const [l, kind, vals, said, want] of SAYS) eq(V.match([said], ch(l, kind, vals), l), want, `${l} said "${said}" → ${want}`);
eq(V.match(['xanh'], ch('vi', 'color', COLORS), 'vi'), null, '"xanh" alone is ambiguous → no match');
// Talk choices (any thing kind) → choiceWords
const CHOICES = [
  [{ id: 'a', thing: { kind: 'color', color: 'red' } }, 'đỏ'], [{ id: 'b', thing: { kind: 'number', n: 3 } }, '3'],
  [{ id: 'c', thing: { kind: 'home', home: 'ice' } }, 'xứ băng'], [{ id: 'd', thing: { kind: 'size', big: false } }, 'nhỏ'],
  [{ id: 'e', thing: { kind: 'block', shape: 'triangle', color: 'red' } }, 'tam giác'], [{ id: 'f', thing: { kind: 'animal', animal: 'cow' } }, 'bò'],
  [{ id: 'g', thing: { kind: 'crate', n: 4 } }, 'bốn'], [{ id: 'h', thing: { kind: 'tile', text: 'B' } }, 'bờ'],
  [{ id: 'i', thing: { kind: 'obj', obj: 'bucket', color: 'blue' } }, 'xanh dương'],
  [{ id: 'j', thing: { kind: 'animal', animal: 'lion', nameKind: 'animal', nameValue: 'lion' } }, 'sư tử']
];
for (const [c, w] of CHOICES) ok(I.choiceWords('vi', c).includes(w), `vi choiceWords ${JSON.stringify(c.thing)} include "${w}"`);
eq(JSON.stringify(I.kindValue({ thing: { kind: 'crate', n: 5 } })), JSON.stringify(['number', 5]), 'kindValue crate → number');
eq(JSON.stringify(I.kindValue({ thing: { nameKind: 'farm', nameValue: 'sea' } })), JSON.stringify(['home', 'sea']), 'kindValue nameKind farm → home');

section('game lines: sayRight / sayWrong for every rule kind (DESIGN §6 examples)');
const R = (l, e, rng) => I.sayRight(l, e, rng || r0);
const Wr = (l, e, rng) => I.sayWrong(l, e, rng || r0);
eq(R('en', { rule: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'bucket', color: 'blue' } }), 'The blue bucket! It’s not red.', 'en right colour (DESIGN)');
eq(R('vi', { rule: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'bucket', color: 'blue' } }), 'Cái xô màu xanh dương! Nó không phải màu đỏ.', 'vi right colour (DESIGN)');
eq(R('en', { rule: { kind: 'home', value: 'farm' }, thing: { kind: 'animal', animal: 'penguin' } }), 'The penguin! The penguin lives on the ice.', 'en right farm (DESIGN)');
eq(R('vi', { rule: { kind: 'farm', value: 'farm' }, thing: { kind: 'animal', animal: 'penguin' } }), 'Chim cánh cụt! Chim cánh cụt sống ở xứ băng.', 'vi right farm');
eq(R('en', { rule: { kind: 'n', value: 2 }, thing: { kind: 'crate', n: 4 }, count: { n: 4 } }), 'One, two, three, four apples! The others have two.', 'en right count = the count run (DESIGN)');
eq(R('vi', { rule: { kind: 'count', value: 2 }, thing: { kind: 'crate', n: 4 } }), 'Một, hai, ba, bốn quả táo! Các thùng kia có hai quả.', 'vi right count (REQUIREMENT)');
eq(R('en', { rule: { kind: 'shape', value: 'circle' }, thing: { kind: 'block', shape: 'star', color: 'red' } }), 'The star! It’s not a circle.', 'en right shape');
eq(R('vi', { rule: { kind: 'shape', value: 'circle' }, thing: { kind: 'block', shape: 'star' } }), 'Khối hình ngôi sao! Nó không phải hình tròn.', 'vi right shape');
eq(R('en', { rule: { kind: 'size', value: 'big' }, thing: { kind: 'animal', animal: 'sheep', big: false } }), 'The sheep! It’s the little one.', 'en right size');
eq(R('en', { rule: { kind: 'animal', value: 'cow' }, thing: { kind: 'animal', animal: 'pig' } }), 'The pig! It’s not a cow.', 'en right animal');
eq(R('vi', { rule: { kind: 'animal', value: 'cow' }, thing: { kind: 'animal', animal: 'pig' } }), 'Con heo! Bạn ấy không phải con bò.', 'vi right animal');
eq(R('en', { rule: { kind: 'letter', value: 'A' }, thing: { kind: 'tile', text: 'B' } }), 'Letter B! It’s not letter A.', 'en right letter');
eq(R('en', { rule: { kind: 'lower', value: 'A' }, thing: { kind: 'tile', text: 'm' } }), 'Small m! It’s not big A or small a.', 'en right lower');
eq(R('en', { rule: { kind: 'initial', value: 'C' }, thing: { kind: 'animal', animal: 'pig' } }), 'The pig! Pig starts with P, not C.', 'en right initial');
eq(R('vi', { rule: { kind: 'initial', value: 'B' }, thing: { kind: 'animal', animal: 'pig' } }), 'Con heo! Heo bắt đầu bằng chữ H, không phải chữ B.', 'vi right initial');
eq(R('en', { rule: { kind: 'sum', value: 5 }, thing: { kind: 'tile', text: '2+4' } }), '2 + 4 makes six! The others make five.', 'en right sum');
eq(R('vi', { rule: { kind: 'diff', value: 3 }, thing: { kind: 'tile', text: '7−2' } }), '7 − 2 bằng năm! Các bạn kia bằng ba.', 'vi right diff');
eq(R('en', { rule: { kind: 'parity', value: 'even' }, thing: { kind: 'tile', text: '7', n: 7 } }), 'Seven! Seven is odd. The others are even.', 'en right parity');
eq(Wr('en', { want: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'boot', color: 'red' } }), 'The boot is red like its friends! Which one isn’t red?', 'en wrong colour (short, playtest P2-2)');
eq(Wr('vi', { want: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'boot', color: 'red' } }), 'Chiếc ủng màu đỏ giống các bạn! Bạn nào khác màu nhỉ?', 'vi wrong colour');
eq(Wr('en', { want: { kind: 'n', value: 2 }, thing: { kind: 'crate', n: 2 } }), 'Two apples, like its friends! Which crate is different?', 'en wrong count');
eq(Wr('vi', { want: { kind: 'home', value: 'farm' }, got: { nameKind: 'animal', nameValue: 'hen' } }), 'Con gà mái ở nông trại giống các bạn! Bạn nào ở xa nhỉ?', 'vi wrong farm rebuilt from got');
eq(Wr('en', { want: { kind: 'size', value: 'big' }, thing: { kind: 'animal', animal: 'cow', big: true } }), 'The cow is big like its friends! Find the little one!', 'en wrong size');
eq(Wr('en', { want: { kind: 'parity', value: 'even' }, thing: { kind: 'tile', text: '4', n: 4 } }), 'Four is even, like its friends! Which number isn’t?', 'en wrong parity');
eq(Wr('en', { want: { kind: 'initial', value: 'C' }, thing: { kind: 'animal', animal: 'cow' } }), 'Cow starts with C, like its friends! Which one doesn’t?', 'en wrong initial');
eq(Wr('en', {}), 'Let’s look again!', 'wrong without anything → wrong.any');
// playtest P2-2: the first wording of every wrong line is short (typical members, ≤ 58 chars both languages)
for (const l of I.langs) for (const c of [
  { want: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'boot', color: 'red' } },
  { want: { kind: 'shape', value: 'star' }, thing: { kind: 'block', shape: 'star', color: 'red' } },
  { want: { kind: 'size', value: 'big' }, thing: { kind: 'animal', animal: 'cow', big: true } },
  { want: { kind: 'size', value: 'small' }, thing: { kind: 'animal', animal: 'pig', big: false } },
  { want: { kind: 'n', value: 3 }, thing: { kind: 'crate', n: 3 } },
  { want: { kind: 'animal', value: 'cow' }, thing: { kind: 'animal', animal: 'cow' } },
  { want: { kind: 'home', value: 'farm' }, thing: { kind: 'animal', animal: 'pig' } },
  { want: { kind: 'letter', value: 'B' }, thing: { kind: 'tile', text: 'B' } },
  { want: { kind: 'sum', value: 5 }, thing: { kind: 'tile', text: '2+3' } },
  { want: { kind: 'parity', value: 'even' }, thing: { kind: 'tile', text: '4', n: 4 } }]) {
  const s1 = Wr(l, c);
  ok(s1.length <= 58, `${l} wrong ${c.want.kind} first wording ≤ 58 chars (${s1.length}): ${s1}`);
  const h = I.sayWrongHint(l, c, r0);
  ok(tidy(h) && positive(h) && h.length <= 66, `${l} wrong+hint line ${c.want.kind} (${h.length}): ${h}`);
}
eq(I.sayWrongHint('en', { want: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: 'boot', color: 'red' } }, r0), 'The boot, like its friends! Look at the glowing one!', 'en wrong + hint pointer line');
eq(R('en', {}), 'You found it!', 'right without anything → right.any');
// rule from topic + params when main forgot `rule`
eq(R('en', { topic: 'colors', params: { color: 'red' }, thing: { kind: 'obj', obj: 'boot', color: 'green' } }), 'The green boot! It’s not red.', 'rule derived from topic + params');
eq(R('en', { topic: 'animals', promptKey: 'p.farm', thing: { kind: 'animal', animal: 'lion' } }), 'The lion! The lion lives on the savanna.', 'farm rule from promptKey');
eq(R('en', { topic: 'count', params: { n: 3 }, thing: { kind: 'crate', n: 1 } }), 'One apple! The others have three.', 'count singular');

// full sweep: every rule kind × many members × 3 wordings → full, tidy, positive sentences that name the member
function memberSets() {
  const out = [];
  for (const c of COLORS) for (const o of OBJECTS) for (const c2 of COLORS) if (c2 !== c)
    out.push({ rule: { kind: 'color', value: c }, odd: { kind: 'obj', obj: o, color: c2 }, match: { kind: 'obj', obj: o, color: c } });
  for (const s of SHAPES) for (const s2 of SHAPES) if (s2 !== s)
    out.push({ rule: { kind: 'shape', value: s }, odd: { kind: 'block', shape: s2, color: 'red' }, match: { kind: 'block', shape: s, color: 'blue' } });
  for (const a of ANIMALS.concat(OBJECTS)) {
    const k = OBJECTS.includes(a) ? 'obj' : 'animal';
    out.push({ rule: { kind: 'size', value: 'big' }, odd: { kind: k, [k]: a, big: false, color: 'red' }, match: { kind: k, [k]: a, big: true, color: 'red' } });
  }
  for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) if (a !== b)
    out.push({ rule: { kind: 'n', value: a }, odd: { kind: 'crate', n: b }, match: { kind: 'crate', n: a }, count: { n: b } });
  for (const a of ANIMALS) for (const b of ANIMALS) if (a !== b && HOME[b] === 'farm')
    out.push({ rule: { kind: 'animal', value: b }, odd: { kind: 'animal', animal: a }, match: { kind: 'animal', animal: b } });
  for (const a of ANIMALS) if (HOME[a] !== 'farm') for (const b of ANIMALS) if (HOME[b] === 'farm')
    out.push({ rule: { kind: 'home', value: 'farm' }, odd: { kind: 'animal', animal: a, home: HOME[a] }, match: { kind: 'animal', animal: b, home: 'farm' }, home: HOME[a] });
  for (const L1 of LETTERS) for (const L2 of ['B', 'M', 'S', 'T']) if (L1 !== L2) {
    out.push({ rule: { kind: 'letter', value: L1 }, odd: { kind: 'tile', text: L2 }, match: { kind: 'tile', text: L1 } });
    out.push({ rule: { kind: 'lower', value: L1 }, odd: { kind: 'tile', text: L2.toLowerCase() }, match: { kind: 'tile', text: L1.toLowerCase() } });
  }
  for (const lang of ['en', 'vi']) {
    const things = ANIMALS.map(a => ({ kind: 'animal', animal: a })).concat(OBJECTS.map(o => ({ kind: 'obj', obj: o, color: 'red' })));
    for (const t1 of things) for (const t2 of things) {
      const i1 = I.initial(lang, t1), i2 = I.initial(lang, t2);
      if (i1 !== i2) out.push({ lang, rule: { kind: 'initial', value: i1 }, odd: t2, match: t1 });
    }
  }
  for (let v = 2; v <= 10; v++) for (let a = 0; a <= v; a++) {
    out.push({ rule: { kind: 'sum', value: v }, odd: { kind: 'tile', text: a + '+' + (v - a + 1) }, match: { kind: 'tile', text: a + '+' + (v - a) } });
    out.push({ rule: { kind: 'diff', value: a }, odd: { kind: 'tile', text: (v + 1) + '−' + (v - a) }, match: { kind: 'tile', text: v + '−' + (v - a) } });
  }
  for (let n = 1; n <= 20; n++) for (const m of [2, 4, 6, 3, 5])
    if (n % 2 !== m % 2) out.push({ rule: { kind: 'parity', value: m % 2 ? 'odd' : 'even' }, odd: { kind: 'tile', text: String(n), n }, match: { kind: 'tile', text: String(m), n: m } });
  return out;
}
let sweepN = 0;
for (const c of memberSets()) for (const l of (c.lang ? [c.lang] : I.langs)) for (const rng of RNGS) {
  const right = I.sayRight(l, { rule: c.rule, thing: c.odd, count: c.count, home: c.home }, rng);
  const wrong = I.sayWrong(l, { want: c.rule, thing: c.match }, rng);
  sweepN++;
  ok(tidy(right) && positive(right) && /[.!?]$/.test(right), `${l} right ${c.rule.kind} ${JSON.stringify(c.odd)}: ${right}`);
  ok(tidy(wrong) && positive(wrong) && /[.!?]$/.test(wrong), `${l} wrong ${c.rule.kind} ${JSON.stringify(c.match)}: ${wrong}`);
  ok(!/You found it|Bé tìm ra rồi|Đúng bạn đó|That one is different|khác các bạn kia!$/.test(right) || c.rule.kind === 'none', `${l} right ${c.rule.kind} is specific: ${right}`);
  ok(!/^(Let’s look again!|Mình tìm lại nhé!)$/.test(wrong), `${l} wrong ${c.rule.kind} is specific: ${wrong}`);
  ok(/like its friends|just like the others|giống các (bạn|thùng)/.test(wrong) || /are friends|là bạn của nhau|goes with|đi cùng/.test(wrong), `${l} wrong ${c.rule.kind} says it matches its friends: ${wrong}`);
  if (['obj', 'animal'].includes(c.odd.kind) && c.rule.kind !== 'initial') {
    const nm = I.name(l, c.odd.kind === 'obj' ? 'obj' : (c.rule.kind === 'home' ? 'who' : 'animal'), c.odd[c.odd.kind]);
    ok(right.toLowerCase().includes(nm.toLowerCase()), `${l} right names the odd one (${nm}): ${right}`);
  }
}
console.log(`   (${sweepN} member × rule × wording combinations)`);

section('counting');
eq(I.sayCount('en', 1), 'One!', 'en count 1'); eq(I.sayCount('vi', 15), 'Mười lăm!', 'vi count 15'); eq(I.sayCount('en', 25), '25!', 'beyond 20 → digits');
eq(I.sayCountRun('en', 3), 'One, two, three apples!', 'count run without others');
eq(I.sayCountRun('en', 1, 4), 'One apple! The others have four.', 'count run singular + others');
eq(I.sayCountRun('vi', 2, 1), 'Một, hai quả táo! Các thùng kia có một quả.', 'vi count run');
for (const l of I.langs) for (let n = 1; n <= 12; n++) for (let o = 1; o <= 12; o++) if (o !== n) {
  const s = I.sayCountRun(l, n, o);
  ok(tidy(s) && positive(s), `${l} count run ${n} vs ${o}: ${s}`);
}

section('talk');
eq(I.t('en', 'talk.colors'), 'What colour is this?', 'talk colours');
eq(I.t('en', 'talk.shapes', { shape: 'triangle' }), 'Which one is the triangle?', 'talk shapes');
eq(I.t('vi', 'talk.shapes', { shape: 'triangle' }), 'Hình tam giác là khối nào nhỉ?', 'vi talk shapes');
eq(I.t('en', 'talk.count'), 'How many apples?', 'talk count');
eq(I.t('en', 'talk.animals', { animal: 'penguin' }), 'Where does the penguin live?', 'talk animals');
eq(I.t('vi', 'talk.animals', { animal: 'penguin' }), 'Chim cánh cụt sống ở đâu nhỉ?', 'vi talk animals');
eq(I.t('vi', 'talk.animals', { animal: 'fishbowl' }), 'Bạn cá vàng sống ở đâu nhỉ?', 'vi talk animals: the fish lives somewhere, not the bowl');
eq(I.t('en', 'talk.animals', {}), 'Where does it live?', 'talk animals fallback');
eq(I.t('vi', 'talk.animalsWho'), 'Đây là con gì nhỉ?', 'vi who is this');
eq(I.talkWrong('en', { id: 'x', thing: { kind: 'home', home: 'ice' } }, { show: { kind: 'animal', animal: 'penguin' } }), 'The penguin lives on the ice! Good try!', 'talkWrong home with the animal');
eq(I.talkWrong('vi', { id: 'x', thing: { kind: 'home', home: 'jungle' } }), 'Bạn ấy sống ở rừng rậm đó! Bé cố gắng lắm!', 'vi talkWrong home without the animal');
eq(I.talkWrong('en', { thing: { kind: 'color', color: 'blue' } }), 'It is blue! Good try!', 'talkWrong colour');
eq(I.talkWrong('vi', { thing: { kind: 'color', color: 'blue' } }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', { thing: { kind: 'block', shape: 'oval' } }), 'It is an oval! Good try!', 'talkWrong shape "an oval"');
eq(I.talkWrong('en', { thing: { kind: 'number', n: 3 } }, { topic: 'count' }), 'There are three apples! Good try!', 'talkWrong count');
eq(I.talkWrong('vi', { thing: { kind: 'number', n: 7 } }), 'Là số bảy đó! Bé cố gắng lắm!', 'vi talkWrong number');
eq(I.talkWrong('en', { thing: { kind: 'animal', animal: 'cow' } }), 'It is the cow! Good try!', 'talkWrong animal');
eq(I.talkWrong('en', 'letter', 'b'), 'It is small b! Good try!', 'talkWrong small letter');
eq(I.talkWrong('en', 'size', 'small'), 'It is the little one! Good try!', 'talkWrong size');
eq(I.talkWrong('en', null), 'Good try! Let’s play more!', 'talkWrong unknown');
for (const l of I.langs) {
  for (const h of HOMES) for (const a of ANIMALS) ok(tidy(I.talkWrong(l, { thing: { kind: 'home', home: h } }, { show: { animal: a } })), `${l} talkWrong home ${h} ${a}`);
  for (const c of COLORS) ok(tidy(I.talkWrong(l, 'color', c)), `${l} talkWrong ${c}`);
  for (let n = 0; n <= 12; n++) ok(tidy(I.talkWrong(l, 'number', n, { topic: 'count' })), `${l} talkWrong n ${n}`);
}

// ------------------------------------------------------------------ content.js (parade) when it exists
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  try {
    const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
    if (/members/.test(csrc) && /oddId/.test(csrc)) {
      const sbc = makeSandbox(); sbc.FP = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.FP.Content && sbc.FP.Content.makeRound) contentSB = sbc;
    }
  } catch (e) { ok(false, 'content.js load: ' + e.message); }
}
console.log(`   (${contentSB ? 'parade content.js loaded' : 'parade content.js not there yet — content checks skipped'})`);
if (contentSB) {
  section('content.js: every promptKey / Talk key / member it produces');
  const CF = contentSB.FP, C = CF.Content;
  for (const a of Object.keys(CF.ANIMALS || {})) ok(I.ANIMALS.includes(a), `content animal ${a} has names`);
  for (const o of CF.OBJECTS || []) ok(I.OBJECTS.includes(o), `content object ${o} has names`);
  for (const c of CF.COLORS || []) ok(I.COLORS.includes(c), `content colour ${c} has names`);
  const AGE_TOPICS = CF.AGE_TOPICS || {};
  let rounds = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of (AGE_TOPICS[age] || [])) for (const lang of I.langs) for (let ri = 0; ri < 5; ri++) {
    let round;
    try {
      const rng = CF.RNG ? new CF.RNG(age * 1000 + ri * 7 + topic.length) : { next: Math.random };
      round = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level: TOPICS.indexOf(topic) % 4 });
    } catch (e) { ok(false, `makeRound ${topic} age ${age}: ${e.message}`); continue; }
    if (!round || !round.members) continue;
    rounds++;
    const ask = I.ask(lang, round.promptKey, round.params, { first: ri === 0 });
    ok(tidy(ask) && !/Which one is different|khác các bạn kia nhỉ/.test(ask), `${lang} age ${age} ${topic}: ask ${round.promptKey} ${JSON.stringify(round.params)} → ${ask}`);
    for (const m of round.members) {
      const e = { id: m.id, thing: m.thing, topic, promptKey: round.promptKey, params: round.params, rule: round.rule };
      if (m.odd) {
        const s = I.sayRight(lang, Object.assign({ count: m.thing.kind === 'crate' ? { n: m.thing.n } : undefined }, e));
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
      } catch (e) { ok(false, `makeTalk ${topic}: ${e.message}`); }
    }
  }
  console.log(`   (${rounds} content rounds rendered)`);
}

section('speech text: letters, maths, pauses, "Bo"');
eq(I.speech('en', 'That’s letter D, like its friends.'), 'That’s letter dee, like its friends.', 'en letter names');
eq(I.speech('en', 'The pig! P is for pig!'), 'The pig! pee is for pig!', 'en "P is for"');
eq(I.speech('en', 'The pig! Pig starts with P, not C.'), 'The pig! Pig starts with pee, not see.', 'en starts with / not');
eq(I.speech('en', 'Which one does not start with C?'), 'Which one does not start with see?', 'en start with');
eq(I.speech('en', 'Which one is not big A or small a?'), 'Which one is not big ay or small ay?', 'en big/small letters');
eq(I.speech('en', 'They’re all red… but one! Which one is NOT red?'), 'They’re all red, but one! Which one is not red?', '… → comma pause, NOT → not');
eq(I.speech('en', '2 + 4 makes six!'), '2 plus 4 makes six!', 'en plus');
eq(I.speech('vi', '7 − 2 bằng năm!'), '7 trừ 2 bằng năm!', 'vi minus');
eq(I.speech('vi', 'Bé ơi, chữ nào không phải chữ B nhỉ?'), 'Bé ơi, chữ nào không phải chữ bờ nhỉ?', 'vi phonics');
eq(I.speech('vi', 'Chữ m thường!'), 'Chữ mờ thường!', 'vi small letter');
eq(I.speech('en', 'Hi! I am Bo.'), 'Hi! I am Bo.', 'en "Bo" as written');
eq(I.speech('vi', 'Mình là cún Bo. Bo giúp bé nhé!'), 'Mình là cún Bo. Bo giúp bé nhé!', 'vi "Bo" as written');
eq(I.speech('en', 'Bo is listening…'), 'Bo is listening.', 'final ellipsis → full stop');
eq(I.speech('en', 'Find the one that’s not red!'), 'Find the one that’s not red!', 'plain line untouched');
eq(V.spoken('vi', 'Chào bé! Mình là Bo.'), 'Chào bé! Mình là Bo.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Which one is not letter B?'), 'Which one is not letter bee?', 'Voice.spoken letter names');
for (const l of I.langs) for (const k of I.keys(l)) {
  const s = I.speech(l, I.t(l, k, SAMPLE, r0));
  ok(!/…|NOT\b|[+−]/.test(s) && !/,\s*[!?.]/.test(s), `${l} ${k} speech text clean: ${s}`);
}

section('input: tap / flick pointer layer — (x, y, ev) in logical px, ONE finger, extra fingers ignored');
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
  sb4.FP = {};
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
  sb7.FP = {};
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
  sb5.FP = {};
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
  sb6.FP = {};
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
ok(sb.FP.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into FP.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof FP.Input.attach === 'function' && typeof FP.Input.kidProof === 'function' && typeof FP.Input.holdButton === 'function',
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
  sbx.FP = {};
  env.FP = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.FP.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Bo: rate 0.9, pitch 1.2');
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
  // vi: "Bo" goes to TTS as written, letter names are rewritten; the bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là cún Bo. Bé tìm chữ không phải chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là cún Bo. Bé tìm chữ không phải chữ bờ nhé!', 'vi utterance: "Bo" kept, "chữ bờ"');
  eq(startText, 'Mình là cún Bo. Bé tìm chữ không phải chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animal', { animal: 'duck' }, { lang: 'vi' });
  ok(/^(Bé ơi, bạn nào không phải con vịt nhỉ\?|Bé tìm bạn không phải con vịt nhé!|Nhìn các bạn thú nè! Bạn nào không phải con vịt\?)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read FP.debug.voiceLog)');
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
  E3.FP.__dummy = 0;
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
