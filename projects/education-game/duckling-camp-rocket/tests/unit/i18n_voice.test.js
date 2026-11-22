#!/usr/bin/env node
// Mimi's Splash Rocket — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/duckling-camp-rocket:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (§5.1 content, §6 voice). When the rocket content.js exists
// (DK.Content making rounds with `launches` + `rule`), every prompt / Talk key + params it produces and the right / next /
// pennant line of every target and the wrong line of every other mat are rendered too (an old river content.js with
// `rows` is skipped: it is being rewritten in parallel). Exits non-zero on any failure.
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
  return sb.DK;
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
// the base game's world must not leak into this one (it is a copy of Nim's River Hop): hedgehog Nim, brook, stepping
// stones, fruit on his spines; nor Bim's Rainbow Rocket (space rocket between cloud islands)
const BANNED = /hedgehog|nhím|\bbrook|stepping|\bstones?\b|suối|hòn đá|\bspines?\b|\bfruits?\b|trái cây|\bBim\b|outer space|cloud island|đảo mây|vũ trụ/i;
function clean(s) { return !BANNED.test(s) && !/\bNim\b/.test(s); }
const r0 = () => 0, r5 = () => 0.5, r9 = () => 0.99;
const RNGS = [r0, r5, r9];
function tidy(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  if (/[{}]/.test(s) || /undefined|null|NaN|\[object/.test(s)) return false;
  if (/\s[!?.,]/.test(s) || /^[!?.,—]/.test(s) || /_/.test(s) || /\s{2}/.test(s)) return false;
  if (/màu màu|\bthe the\b|\bcon con\b|\ba the\b|\bthe a\b|hình hình|cái cái|chữ chữ|số số|nhỏ nhỏ|\bto to\b|tấm thảm tấm thảm|ở ở|sống sống|quả thông quả thông|lá cờ lá cờ|bạn bạn|\bthe one one\b/i.test(s)) return false;
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
const OBJS = ['flower', 'mushroom', 'ball', 'mug', 'lantern'];
const SURPRISES = ['marmot', 'goat', 'bird'];
const ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
const HOME = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
  crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
const HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.countSeq', 'p.countSel', 'p.animal', 'p.home',
  'p.letters', 'p.lower', 'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const VI_NAMES = {
  obj: { flower: 'bông hoa', mushroom: 'cây nấm', ball: 'quả bóng', mug: 'cái cốc', lantern: 'chiếc đèn lồng' },
  surprise: { marmot: 'bạn sóc đất', goat: 'bạn dê núi', bird: 'bạn chim nhỏ' },
  animal: { cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', hen: 'con gà mái', horse: 'con ngựa',
    goat: 'con dê', crab: 'con cua', fishbowl: 'bể cá vàng', penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ' },
  home: { farm: 'nông trại', sea: 'biển', ice: 'xứ băng', savanna: 'đồng cỏ châu Phi', jungle: 'rừng rậm' },
  shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
    rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' },
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' },
  mood: { sunny: 'trời nắng', breezy: 'trời gió', rain: 'trời mưa', rainbow: 'cầu vồng' }
};
const EN_HOME_AT = { farm: 'on the farm', sea: 'in the sea', ice: 'on the ice', savanna: 'on the savanna', jungle: 'in the jungle' };
// the initial-letter topic: bare noun first letter, diacritics → base letter
const INITIAL = {
  en: { cow: 'C', pig: 'P', sheep: 'S', duck: 'D', hen: 'H', horse: 'H', goat: 'G', crab: 'C', penguin: 'P', lion: 'L',
    monkey: 'M', fishbowl: 'G' },
  vi: { cow: 'B', pig: 'H', sheep: 'C', duck: 'V', hen: 'G', horse: 'N', goat: 'D', crab: 'C', penguin: 'C', lion: 'S',
    monkey: 'K', fishbowl: 'C' }
};
const OBJ_INITIAL = { en: { flower: 'F', mushroom: 'M', ball: 'B', mug: 'M', lantern: 'L' }, vi: { flower: 'H', mushroom: 'N', ball: 'B', mug: 'C', lantern: 'D' } };

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.DK = { debug: { voiceLog: [] } };
let DK;
try { DK = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = DK.I18N, V = DK.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  ok(!/\bNim\b|hedgehog|nhím|\bbrook|stepping|\bstones?\b|hòn đá|suối|\bfruits?\b|sayFruit/i.test(src), `${f}: no base-game names left (Nim / hedgehog / brook / stone / fruit)`);
}
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.SHAPES.slice().sort()), JSON.stringify(SHAPES.slice().sort()), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.OBJS), JSON.stringify(OBJS), 'I18N.OBJS = DESIGN list');
ok(I.FRUITS === undefined, 'no FRUITS any more (DESIGN §5.1: the reward is the pennant)');
eq(JSON.stringify(I.MOODS), JSON.stringify(MOODS), 'I18N.MOODS = sunny, breezy, rain, rainbow');
eq(JSON.stringify(I.SURPRISES), JSON.stringify(SURPRISES), 'I18N.SURPRISES = marmot, goat, bird');
eq(I.PUMP_COUNT, 3, 'I18N.PUMP_COUNT = 3');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.HOMES), JSON.stringify(HOMES), 'I18N.HOMES = DESIGN list');
eq(JSON.stringify(I.ANIMAL_HOME), JSON.stringify(HOME), 'I18N.ANIMAL_HOME = DK.ANIMALS of DESIGN §5.1');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
eq(JSON.stringify(I.THING_KINDS), JSON.stringify(['obj', 'shape', 'dots', 'tile', 'animal']), 'I18N.THING_KINDS = DESIGN thing kinds');
eq(JSON.stringify(Object.keys(I.PROMPTS).sort()), JSON.stringify(PROMPT_KEYS.slice().sort()), 'I18N.PROMPTS = the DESIGN prompt keys');
// the functions main.js calls (task contract) + helpers
for (const fn of ['t', 'ask', 'sayRight', 'sayWrong', 'sayWrongHint', 'sayName', 'sayCount', 'sayCountRun', 'talkWrong',
  'choiceWords', 'name', 'words', 'setChild', 'sayNext', 'sayPump', 'sayPennant', 'sayCountUp', 'sayCamp', 'seqThen',
  'initial', 'bareWord', 'initialOf', 'phrase', 'countList', 'seqList',
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
const REQUIRED = ['hint', 'idle', 'praise', 'great', 'poke', 'party', 'session.done', 'unfold', 'wipe',
  'weather.0', 'weather.1', 'weather.2', 'weather.3', 'surprise.marmot', 'marmot.tap', 'surprise.goat', 'goat.tap',
  'surprise.bird', 'bird.tap', 'p.any', 'right.any', 'wrong.any', 'goal.any', 'right.thing', 'right.home', 'right.seq',
  'right.pump', 'next', 'next.home', 'next.seq', 'next.any', 'pumpAsk', 'pumpAuto', 'pump.blast', 'chute', 'land',
  'pennant', 'pennant.any', 'camp', 'wrong.is', 'wrong.dots', 'wrong.seq', 'goal.seq', 'goal.seqAny', 'wrong.hint',
  'talk.intro', 'talk.right', 'talk.color', 'talk.colors', 'talk.shape', 'talk.shapes', 'talk.count', 'talk.home',
  'talk.animals', 'talk.who', 'talk.letters', 'talk.lower', 'talk.initial', 'talk.add', 'talk.sub', 'talk.oddeven',
  'talk.wrong', 'talk.wrong.any', 'talk.wrong.home', 'talk.wrong.dots', 'talk.wrong.dot1']
  .concat(TOPICS.map(t => 'topic.' + t));
for (let i = 0; i <= 20; i++) REQUIRED.push('count.' + i);
for (const k of REQUIRED) ok(I.has('en', k) && I.has('vi', k), `key ${k} exists in both languages`);
for (const k of ['rise', 'ahead', 'bank', 'fruit', 'fruit.any', 'right.next', 'right.last', 'surprise.fish', 'fish.tap',
  'surprise.frog', 'frog.tap', 'surprise.snow', 'snow.tap', 'ui.tapNim', 'p.countPop'])
  ok(!I.has('en', k) && !I.has('vi', k), `base-game key ${k} is gone`);
for (const k of ['pumpAsk', 'pumpAuto', 'chute', 'land', 'camp', 'pennant', 'next', 'next.seq', 'next.home', 'next.any', 'right.pump', 'right.seq'])
  ok([].concat(I.raw('en', k)).length >= 3, `${k}: 3 wordings or more`);
// every prompt: 3 wordings + the first-time form; no plural forms (one target per row)
for (const k of PROMPT_KEYS) {
  for (const s of ['', '.first']) ok(I.has('en', k + s) && I.has('vi', k + s), `${k}${s} exists`);
  ok([].concat(I.raw('en', k)).length === 3 && [].concat(I.raw('vi', k)).length === 3, `${k} has 3 wordings`);
  ok(!I.has('en', k + '.many'), `${k} has no .many form (one target per launch)`);
  ok([].concat(I.raw('en', k + '.first')).every(s => /^Let’s launch the rocket!/.test(s)), `en ${k}.first starts "Let’s launch the rocket!"`);
  ok([].concat(I.raw('vi', k + '.first')).every(s => /^Mình phóng tên lửa nào!/.test(s)), `vi ${k}.first starts "Mình phóng tên lửa nào!"`);
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
// legacy keys the integrator is replacing in main.js / index.html right now (base game): not required any more
const UI_LEGACY = /^ui\.(tapBo|tapBao|tapNim)$/;
for (const k of UI_USED) if (!UI_LEGACY.test(k)) ok(I.has('en', k) && I.has('vi', k), `UI key ${k} (used by the page) exists`);
for (const k of ['ui.title', 'ui.logo1', 'ui.logo2', 'ui.subtitle', 'ui.tagline', 'ui.play', 'ui.playAgain', 'ui.home', 'ui.paused',
  'ui.resume', 'ui.settings', 'ui.holdForParents', 'ui.age', 'ui.years', 'ui.language', 'ui.name', 'ui.namePlaceholder', 'ui.sound',
  'ui.music', 'ui.volume', 'ui.quieter', 'ui.louder', 'ui.voice', 'ui.mic', 'ui.done', 'ui.stars', 'ui.chapter', 'ui.allDone',
  'ui.welcome', 'ui.micUnsupported', 'ui.micDenied', 'ui.voiceMissing', 'ui.tapOrSay', 'ui.listening', 'ui.tapMimi',
  'ui.tapHint', 'ui.pumpHint', 'ui.doorHint', 'ui.skip', 'ui.gallery', 'ui.langName.en', 'ui.langName.vi'])
  ok(I.has('en', k) && I.has('vi', k), `ui key ${k} kept`);

section('titles, Mimi, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.logo1'), 'Mimi’s', 'en logo1');
eq(I.t('en', 'ui.logo2'), 'Splash Rocket', 'en logo2');
eq(I.t('vi', 'ui.logo1'), 'Vịt Mimi', 'vi logo1');
eq(I.t('vi', 'ui.logo2'), 'Tên Lửa Nước', 'vi logo2');
eq(I.t('en', 'ui.voice'), 'Mimi’s voice', 'en ui.voice');
eq(I.t('vi', 'ui.voice'), 'Giọng của Mimi', 'vi ui.voice');
eq(I.t('en', 'ui.title'), 'Mimi’s Splash Rocket', 'en title');
eq(I.t('vi', 'ui.title'), 'Tên Lửa Nước Của Vịt Mimi', 'vi title');
ok(/Mimi/.test(I.t('vi', 'ui.listening')) && /Mimi/.test(I.t('en', 'ui.listening')), 'listening names Mimi');
for (const k of viKeys) {
  if (/^(ui\.langName|count\.[0-9]+$|ui\.logo|ui\.stars)/.test(k)) continue;
  const v = [].concat(I.raw('vi', k)).join(' ');
  if (/^[\d\s{}a-z+−?!.,]*$/i.test(v)) continue;
  ok(VI_DIACRITIC.test(v) || /^[A-Za-z]+[!.]?$/.test(v), `vi "${k}" has Vietnamese diacritics: ${v}`);
}
for (const k of viKeys) for (const s of [].concat(I.raw('vi', k))) {
  // the helper is "Mimi" in lines ("Mình là vịt Mimi"); "Vịt Mimi" (capital) only in titles
  ok(!/Vịt Mimi/.test(s) || /^ui\.(title|logo1)$/.test(k), `vi "${k}": "Vịt Mimi" only in titles: ${s}`);
}
for (const k of PROMPT_KEYS) {
  const all = [].concat(I.raw('vi', k), I.raw('vi', k + '.first')).join(' | ');
  ok(/(Bé|bé)/.test(all) && /(nhé|nhỉ|nào)/.test(all), `vi ${k} is warm (bé … nhé / nhỉ / nào): ${all}`);
  ok(/tên lửa/.test(all) && /(đáp|bay|phóng)/.test(all), `vi ${k} talks about the rocket (tên lửa, đáp / bay / phóng): ${all}`);
  for (const w of [].concat(I.raw('en', k))) ok(/\b([Ll]and|[Ff]ly|launch)\b/.test(w), `en ${k} wording talks about landing / flying: ${w}`);
}
// classifiers (DESIGN §6)
for (const [o, cl] of Object.entries({ flower: 'bông hoa', mushroom: 'cây nấm', ball: 'quả bóng', mug: 'cái cốc', lantern: 'chiếc đèn lồng' }))
  eq(I.name('vi', 'obj', o), cl, `vi classifier ${o}`);
eq(I.name('vi', 'pinecones', 4), '4 quả thông', 'vi pinecones "quả thông"');
ok(/tấm thảm/.test([].concat(I.raw('vi', 'p.any')).join(' ')) && /tấm thảm/.test([].concat(I.raw('vi', 'hint')).join(' ')), 'vi says "tấm thảm" (mat)');
ok(/cột cờ/.test([].concat(I.raw('vi', 'pennant')).join(' ')), 'vi pennant says "cột cờ" (flagpole)');
ok(/tấm biển/.test([].concat(I.raw('vi', 'p.countSel')).join(' ')), 'vi countSel says "tấm biển" (sign)');
for (const k of ['poke', 'party']) ok(/Quack|Cạp cạp/.test([].concat(I.raw('en', k), I.raw('vi', k)).join(' ')), `${k}: Mimi quacks`);

section('no negative words, no base-game words in any line');
for (const l of I.langs) for (const k of I.keys(l)) for (const s of [].concat(I.raw(l, k))) {
  ok(positive(s), `${l} ${k} positive: ${s}`);
  ok(clean(s), `${l} ${k} has no Nim / brook / stone / fruit words: ${s}`);
  if (!/^ui\./.test(k)) ok(!/\bnot\b/i.test(s), `${l} ${k}: the game never asks with "not": ${s}`);
}

section('every string renders: no "{" left, tidy punctuation, the child name');
const SAMPLE = { n: 3, k: 2, stars: 9, color: 'red', shape: 'star', size: 'big', animal: 'penguin', home: 'ice', letter: 'B',
  lower: 'b', parity: 'even', a: 2, b: 3, word: 'cow', answer: 'red', thing: { kind: 'obj', obj: 'mug', color: 'red' },
  who: 'penguin', what: '4 pinecones', expr: '2+3', ans: '5', num: 'three', first: 'B', mood: 'rainbow',
  got: 4, want: 2 };
for (const l of I.langs) for (const k of I.keys(l)) for (const rng of RNGS) for (const child of ['', 'Mai']) {
  const s = I.t(l, k, Object.assign({ child }, SAMPLE), rng);
  ok(tidy(s) || /^(ui\.(langName|years|namePlaceholder|stars)|ui\.logo)/.test(k) || /^Ví dụ|^e\.g\./.test(s), `${l} ${k} renders tidy (child "${child}"): ${s}`);
  ok(!/\{|\}|undefined|NaN/.test(s), `${l} ${k} has no raw params: ${s}`);
  ok(clean(s), `${l} ${k} rendered line is clean: ${s}`);
  if (!child) ok(!/friend|Mai/.test(s) || k === 'ui.namePlaceholder', `${l} ${k} without a name reads naturally: ${s}`);
}
const PENNANT_THING = { kind: 'obj', obj: 'lantern', color: 'orange' };
for (const k of ['great', 'idle', 'session.done', 'talk.right', 'ui.welcome', 'pennant']) {
  const pool = [].concat(I.raw('en', k));
  for (let i = 0; i < 20; i++) {
    for (const l of I.langs) {
      const s = I.t(l, k, { child: '', stars: 5, thing: PENNANT_THING }, () => i / 20);
      ok(!/\bfriend\b|bé bé|,\s*!/.test(s) && tidy(s), `${l} ${k} with an empty name: ${s}`);
    }
  }
  ok(pool.some(s => /\{child\}/.test(s)), `${k} has a {child} variant`);
}
I.setChild('Mai');
ok(/Mai/.test(I.t('en', 'ui.welcome')), 'setChild → the welcome greets the child');
ok(/bé Mai/.test(I.t('vi', 'ui.welcome')), 'vi welcome "bé Mai"');
ok(/Mai/.test(I.sayPennant('en', { thing: PENNANT_THING }, r9)), 'setChild → sayPennant can praise the child');
I.setChild('');
ok(!/Mai|friend/.test(I.t('en', 'ui.welcome')), 'empty child → welcome without a name');
ok(!/Mai|friend/.test(I.sayPennant('en', { thing: PENNANT_THING }, r9)), 'empty child → sayPennant without a name');

section('prompts: DESIGN examples, every prompt key × value × first × wording');
eq(I.ask('en', 'p.colors', { color: 'red' }, { first: true }), 'Let’s launch the rocket! Land on the RED one!', 'en first colours (DESIGN §6)');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { first: true }), 'Mình phóng tên lửa nào! Bé cho tên lửa đáp xuống thứ màu ĐỎ nhé!', 'vi first colours');
eq(I.ask('en', 'p.colors', { color: 'red' }, { rng: r0 }), 'Land on the red one!', 'en colours (DESIGN §6)');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { rng: r0 }), 'Bé cho tên lửa đáp xuống thứ màu đỏ nhé!', 'vi colours (DESIGN §6)');
eq(I.ask('en', 'p.colors', { color: 'red', k: 3 }, { rng: r0 }), 'Land on the red one!', 'k is ignored');
eq(I.ask('en', 'p.countSeq', { n: 3 }, { rng: r0 }), 'Land on 1, then 2, then 3!', 'en countSeq (DESIGN §6)');
eq(I.ask('vi', 'p.countSeq', { n: 3 }, { rng: r0 }), 'Bé cho tên lửa đáp xuống 1, rồi 2, rồi 3 nhé!', 'vi countSeq');
eq(I.ask('en', 'p.countSeq', { n: 4 }, { rng: r0 }), 'Land on 1, then 2, then 3, then 4!', 'en countSeq lists 1..n');
eq(I.ask('en', 'p.countSel', { n: 4 }, { rng: r0 }), 'Land on the sign with 4 pinecones!', 'en countSel (DESIGN §6)');
eq(I.ask('vi', 'p.countSel', { n: 4 }, { rng: r0 }), 'Bé cho tên lửa đáp xuống tấm biển có 4 quả thông nhé!', 'vi countSel');
eq(I.ask('en', 'p.countSel', { n: 1 }, { rng: r0 }), 'Land on the sign with 1 pinecone!', 'en countSel singular pinecone');
eq(I.ask('en', 'p.animal', { animal: 'cow' }, { rng: r0 }), 'Fly to the cow!', 'en animal (DESIGN §6)');
eq(I.ask('en', 'p.home', { home: 'farm' }, { rng: r0 }), 'Who lives on the farm? Land there!', 'en home (DESIGN §6)');
eq(I.ask('vi', 'p.home', { home: 'farm' }, { rng: r0 }), 'Ai sống ở nông trại? Bé cho tên lửa đáp xuống đó nhé!', 'vi home');
eq(I.ask('en', 'p.shapes', { shape: 'star' }, { rng: r0 }), 'Land on the star!', 'en shapes (one per launch)');
eq(I.ask('en', 'p.size', { big: false }, { rng: r0 }), 'Land on the little one!', 'en size little');
eq(I.ask('vi', 'p.size', { big: true }, { rng: r0 }), 'Bé cho tên lửa đáp xuống cái to nhé!', 'vi size');
eq(I.ask('en', 'p.oddeven', { parity: 'even' }, { rng: r0 }), 'Land on an even number!', 'en odd/even');
eq(I.ask('en', 'p.colors', {}, { rng: r0 }), 'Land on a mat!', 'missing param → p.any');
eq(I.ask('en', 'p.nothing', { color: 'red' }, { rng: r0 }), 'Land on a mat!', 'unknown prompt → p.any');
eq(I.ask('en', 'p.countSeq', { n: 0 }, { rng: r0 }), 'Land on a mat!', 'countSeq n 0 → p.any');
const PROMPT_VALUES = {
  'p.colors': COLORS.map(c => ({ color: c })), 'p.shapes': SHAPES.map(s => ({ shape: s })), 'p.shapes5': SHAPES.map(s => ({ shape: s })),
  'p.size': [{ big: true }, { big: false }], 'p.countSeq': [1, 2, 3, 4, 5].map(n => ({ n })),
  'p.countSel': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ n })), 'p.animal': ANIMALS.map(a => ({ animal: a })),
  'p.home': HOMES.map(h => ({ home: h })), 'p.letters': LETTERS.map(x => ({ letter: x })), 'p.lower': LETTERS.map(x => ({ letter: x })),
  'p.initial': LETTERS.map(x => ({ letter: x })), 'p.add': [2, 5, 10, 14, 20].map(n => ({ n })), 'p.sub': [0, 1, 3, 7].map(n => ({ n })),
  'p.oddeven': [{ parity: 'odd' }, { parity: 'even' }]
};
const P_ANY = /^(Land on a mat!|Which mat will the rocket land on\?|Find a mat and launch!|Bé cho tên lửa đáp xuống một tấm thảm nhé!|Tên lửa đáp xuống tấm thảm nào nhỉ\?|Bé tìm một tấm thảm rồi phóng)/;
let nPrompts = 0;
for (const pk of PROMPT_KEYS) for (const l of I.langs) for (const base of PROMPT_VALUES[pk]) for (const first of [false, true]) for (const rng of RNGS) for (const child of ['', 'Mai']) {
  const params = Object.assign({ k: 3, child }, base);
  const s = I.ask(l, pk, params, { first, rng }); nPrompts++;
  ok(tidy(s) && positive(s) && clean(s), `${l} ${pk} ${JSON.stringify(base)} first ${first}: ${s}`);
  ok(!/\{|undefined|NaN|null/.test(s), `${l} ${pk} no leftovers: ${s}`);
  ok(!P_ANY.test(s), `${l} ${pk} uses its own wording: ${s}`);
  if (first) ok(/^(Let’s launch the rocket!|Mình phóng tên lửa nào!)/.test(s), `${l} ${pk} first form: ${s}`);
  if (pk === 'p.colors' && l === 'vi') ok(s.includes(first ? 'màu ' + I.name('vi', 'hue', base.color).toUpperCase() : I.name('vi', 'color', base.color)), `vi colours names the colour: ${s}`);
  if (pk === 'p.colors' && l === 'en') ok(s.toLowerCase().includes(base.color), `en colours names the colour: ${s}`);
  if (pk === 'p.home') ok(s.includes(l === 'en' ? EN_HOME_AT[base.home] : 'sống ở ' + VI_NAMES.home[base.home]), `${l} home preposition: ${s}`);
  if (pk === 'p.countSel' && l === 'en') ok(/\b1 pinecone\b/.test(s) === (base.n === 1), `en countSel pinecone/pinecones: ${s}`);
  if (pk === 'p.countSel') ok(/pinecone|quả thông/.test(s) && s.includes(String(base.n)), `${l} countSel names n pinecones: ${s}`);
  if (pk === 'p.countSeq') { const list = I.seqThen(l, base.n); ok(s.includes(list) && !s.includes(String(base.n + 1)), `${l} countSeq lists 1..${base.n}: ${s}`); }
  if (pk === 'p.letters' || pk === 'p.initial') ok(s.includes(base.letter), `${l} ${pk} names the letter: ${s}`);
  if (pk === 'p.lower') ok(s.includes(base.letter.toUpperCase()) && s.includes(base.letter.toLowerCase()), `${l} lower names both forms: ${s}`);
  if (pk === 'p.animal') ok(s.toLowerCase().includes(I.name(l, 'animal', base.animal).toLowerCase()), `${l} animal named: ${s}`);
  if (pk === 'p.shapes' || pk === 'p.shapes5') ok(s.toLowerCase().includes(I.name(l, 'shape', base.shape).toLowerCase()), `${l} shape named (singular): ${s}`);
}
console.log(`   (${nPrompts} prompts rendered)`);
eq(I.seqThen('en', 3), '1, then 2, then 3', 'seqThen en'); eq(I.seqThen('vi', 2), '1, rồi 2', 'seqThen vi'); eq(I.seqThen('en', 1), '1', 'seqThen 1');
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
  for (const o of OBJS) ok(I.name(l, 'obj', o).length > 0 && I.name(l, 'obj', o) === I.name(l, 'toy', o) && I.name(l, 'objWord', o).length > 0, `${l} obj ${o}`);
  for (const h of HOMES) ok(I.name(l, 'home', h).length > 0 && I.name(l, 'homeAt', h).length > 0 && I.name(l, 'lives', h).length > 0, `${l} home ${h}`);
  for (let n = 0; n <= 20; n++) ok(I.name(l, 'number', n).length > 0 && !/\d/.test(I.name(l, 'number', n)), `${l} number ${n}: ${I.name(l, 'number', n)}`);
  for (const x of LETTERS) eq(I.name(l, 'letter', x), x, `${l} letter ${x}`);
  for (const p of ['odd', 'even']) ok(I.name(l, 'parity', p).length > 0, `${l} parity ${p}`);
  for (let i = 0; i < 4; i++) ok(I.name(l, 'mood', i) === I.name(l, 'mood', MOODS[i]) && I.name(l, 'weather', i) === I.name(l, 'mood', i) && I.name(l, 'mood', i).length > 0, `${l} mood ${i}: ${I.name(l, 'mood', i)}`);
  for (const sp of SURPRISES) ok(I.name(l, 'surprise', sp).length > 0 && I.name(l, 'surprise', sp) !== sp || (l === 'en' && sp === 'marmot'), `${l} surprise ${sp}: ${I.name(l, 'surprise', sp)}`);
  ok(/plus|cộng/.test(I.name(l, 'sum', '2+3')) && /minus|trừ/.test(I.name(l, 'diff', '7−4')), `${l} sum / diff`);
  for (const a of ANIMALS) ok(I.name(l, 'word', a).length > 0, `${l} word ${a}`);
  for (let n = 1; n <= 12; n++) {
    eq(I.name(l, 'pinecones', n), I.name(l, 'dots', n), `${l} pinecones = dots ${n}`);
    ok(new RegExp('^' + n + ' (pinecones?|quả thông)$').test(I.name(l, 'pinecones', n)), `${l} pinecones ${n}: ${I.name(l, 'pinecones', n)}`);
    ok(new RegExp('^' + n + ' (flags?|lá cờ)$').test(I.name(l, 'flags', n)), `${l} flags ${n}`);
  }
}
for (const k of Object.keys(VI_NAMES)) for (const v of Object.keys(VI_NAMES[k])) eq(I.name('vi', k, v), VI_NAMES[k][v], `vi ${k} ${v}`);
for (const h of HOMES) { eq(I.name('en', 'homeAt', h), EN_HOME_AT[h], `en homeAt ${h}`); eq(I.name('vi', 'lives', h), 'sống ở ' + VI_NAMES.home[h], `vi lives ${h}`); }
eq(I.name('en', 'lives', 'ice'), 'lives on the ice', 'en lives on the ice');
eq(I.name('en', 'dots', 4), '4 pinecones', 'en dots = pinecones'); eq(I.name('vi', 'dots', 4), '4 quả thông', 'vi quả thông'); eq(I.name('en', 'dots', 1), '1 pinecone', 'en 1 pinecone');
eq(I.name('en', 'mood', 'breezy'), 'windy', 'en mood breezy → windy'); eq(I.name('vi', 'mood', 3), 'cầu vồng', 'vi mood 3 cầu vồng');
// thing names
eq(I.name('en', 'thing', { kind: 'obj', obj: 'mug', color: 'red' }), 'red mug', 'en thing red mug');
eq(I.name('vi', 'thing', { kind: 'obj', obj: 'mug', color: 'red' }), 'cái cốc màu đỏ', 'vi thing cái cốc màu đỏ');
eq(I.phrase('en', { kind: 'obj', obj: 'mug', color: 'red' }, { art: 'a' }), 'a red mug', 'en "a red mug" (DESIGN §6)');
eq(I.name('vi', 'thing', { kind: 'obj', obj: 'lantern', color: 'orange' }), 'chiếc đèn lồng màu cam', 'vi chiếc đèn lồng');
eq(I.phrase('en', { kind: 'obj', obj: 'lantern', color: 'orange' }, { art: 'a' }), 'an orange lantern', 'en an orange lantern');
eq(I.name('en', 'thing', { kind: 'dots', n: 4 }), '4 pinecones', 'en thing 4 pinecones');
eq(I.name('vi', 'thing', { kind: 'dots', n: 4 }), '4 quả thông', 'vi thing 4 quả thông');
eq(I.name('en', 'thing', { kind: 'dots', n: 1 }), '1 pinecone', 'en thing 1 pinecone');
eq(I.name('en', 'thing', { kind: 'shape', shape: 'star', color: 'blue' }), 'blue star', 'en thing blue star');
eq(I.name('vi', 'thing', { kind: 'shape', shape: 'star', color: 'blue' }), 'ngôi sao màu xanh dương', 'vi thing ngôi sao màu xanh dương');
eq(I.name('en', 'thing', { kind: 'obj', obj: 'mushroom', color: 'green', big: false }), 'little green mushroom', 'en little mushroom');
eq(I.name('vi', 'thing', { kind: 'obj', obj: 'mushroom', color: 'green', big: false }), 'cây nấm nhỏ màu xanh lá', 'vi nấm nhỏ');
eq(I.name('en', 'thing', { kind: 'tile', text: 'a' }), 'small a', 'en tile small a');
eq(I.name('vi', 'thing', { kind: 'tile', text: 'B' }), 'chữ B', 'vi tile chữ B');
eq(I.name('en', 'thing', { kind: 'tile', text: '3+2' }), '3 + 2', 'en tile 3 + 2');
eq(I.name('vi', 'thing', { kind: 'animal', animal: 'penguin' }), 'chim cánh cụt', 'vi animal thing');
eq(I.sayName('en', { kind: 'animal', animal: 'cow' }), 'the cow', 'sayName the cow');
eq(I.sayName('vi', { kind: 'obj', obj: 'ball', color: 'red' }), 'quả bóng màu đỏ', 'sayName vi');
eq(I.sayName('en', { kind: 'toy', obj: 'ball', color: 'red' }), 'the red ball', 'legacy kind toy still named');
eq(I.sayName('en', { kind: 'obj', obj: 'cup', color: 'red' }), 'the red mug', 'obj alias cup → mug');
for (const l of I.langs) {
  for (const o of OBJS) for (const c of COLORS) for (const big of [true, false, undefined]) {
    const s = I.name(l, 'thing', { kind: 'obj', obj: o, color: c, big });
    ok(s.includes(I.name(l, 'obj', o)) && s.includes(I.name(l, 'color', c)), `${l} obj thing ${o} ${c}: ${s}`);
    if (l === 'vi') ok(s.indexOf(VI_NAMES.obj[o]) === 0, `vi colour after the noun: ${s}`);
  }
  for (const sh of SHAPES) for (const c of COLORS) ok(I.name(l, 'thing', { kind: 'shape', shape: sh, color: c }).length > 3, `${l} shape thing ${sh} ${c}`);
}

section('initial(): first letter of the bare noun, both languages');
for (const l of I.langs) {
  for (const a of ANIMALS) eq(I.initial(l, 'animal', a), INITIAL[l][a], `${l} initial ${a}`);
  for (const a of ANIMALS) eq(I.initial(l, { kind: 'animal', animal: a }), INITIAL[l][a], `${l} initial(thing) ${a}`);
  for (const o of OBJS) eq(I.initial(l, { kind: 'obj', obj: o, color: 'red' }), OBJ_INITIAL[l][o], `${l} initial obj ${o}`);
  for (const o of OBJS) eq(I.initial(l, 'obj', o), OBJ_INITIAL[l][o], `${l} initial('obj') ${o}`);
}
eq(I.bareWord('vi', { kind: 'obj', obj: 'lantern' }), 'đèn lồng', 'vi bare word without classifier');
eq(I.bareWord('vi', 'animal', 'cow'), 'bò', 'vi bare animal');

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
for (const l of I.langs) {
  for (const [kind, vals] of [['color', COLORS], ['shape', SHAPES], ['obj', OBJS], ['animal', ANIMALS], ['home', HOMES],
    ['parity', ['odd', 'even']], ['size', ['big', 'small']], ['mood', MOODS], ['surprise', SURPRISES], ['letter', LETTERS.slice(0, 10)]]) {
    const seen = {};
    for (const v of vals) {
      const ws = I.words(l, kind, v);
      ok(ws.length > 1 && ws.every(w => w === w.toLowerCase()), `${l} words ${kind} ${v} lower-case`);
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
    eq(V.match([I.name(l, 'pinecones', n)], NC, l), String(n), `${l} "${I.name(l, 'pinecones', n)}" → ${n}`);
  }
  ok(I.words(l, 'number', 3).includes('3'), `${l} digits accepted`);
  ok(I.words(l, 'pinecones', 4).includes(l === 'en' ? '4 pinecones' : '4 quả thông'), `${l} "4 pinecones" accepted`);
  ok(I.words(l, 'dots', 4).includes(l === 'en' ? 'four pinecones' : 'bốn quả thông'), `${l} "four pinecones" accepted`);
}
// fuzzy recognition: noisy kid answers, both languages (numbers, colours, homes, objs)
const FUZZY = [
  ['en', 'number', [2, 3, 4], 'um four', '4'], ['en', 'number', [2, 3, 4], 'it is 3 pinecones', '3'], ['en', 'number', [2, 3, 4], 'to', '2'],
  ['en', 'number', [3, 5, 8], 'ate', '8'], ['en', 'color', ['red', 'blue', 'green'], 'the red one', 'red'],
  ['en', 'color', ['red', 'blue', 'green'], 'blew', 'blue'], ['en', 'color', ['yellow', 'purple', 'pink'], 'purpl', 'purple'],
  ['en', 'home', ['farm', 'ice', 'jungle'], 'jungles', 'jungle'], ['en', 'home', ['farm', 'sea', 'ice'], 'the ocean', 'sea'],
  ['en', 'home', ['farm', 'ice', 'savanna'], 'africa', 'savanna'], ['en', 'obj', ['mug', 'lantern', 'ball'], 'a cup', 'mug'],
  ['en', 'obj', ['mug', 'lantern', 'ball'], 'lamp', 'lantern'],
  ['vi', 'number', [2, 3, 4], 'bon', '4'], ['vi', 'number', [2, 3, 4], 'số ba', '3'], ['vi', 'number', [10, 11, 12], 'muoi hai', '12'],
  ['vi', 'number', [4, 5, 6], 'có năm quả thông', '5'], ['vi', 'color', ['red', 'blue', 'green'], 'mau do', 'red'],
  ['vi', 'color', ['red', 'blue', 'green'], 'xanh duong', 'blue'], ['vi', 'color', ['red', 'blue', 'green'], 'xanh lá cây', 'green'],
  ['vi', 'home', ['farm', 'ice', 'jungle'], 'o nong trai', 'farm'], ['vi', 'home', ['farm', 'ice', 'jungle'], 'xu bang', 'ice'],
  ['vi', 'home', ['sea', 'savanna', 'jungle'], 'trong rung', 'jungle'], ['vi', 'obj', ['mug', 'lantern', 'ball'], 'cai coc', 'mug'],
  ['vi', 'obj', ['mug', 'lantern', 'ball'], 'den long', 'lantern'], ['vi', 'obj', ['mug', 'lantern', 'flower'], 'cái ly', 'mug']
];
for (const [l, kind, vals, said, want] of FUZZY) eq(V.match([said], ch(l, kind, vals), l), want, `${l} fuzzy "${said}" → ${kind} ${want}`);
eq(V.match(['banana'], ch('en', 'color', ['red', 'blue']), 'en'), null, 'unrelated word → no match');
ok(I.words('vi', 'home', 'jungle').includes('rung ram'), 'vi no-diacritic home');
ok(I.words('vi', 'obj', 'ball').includes('qua bong'), 'vi "qua bong" accepted');
ok(I.words('vi', 'obj', 'lantern').includes('chiec den long') && I.words('vi', 'obj', 'mug').includes('cai coc'), 'vi mug / lantern without diacritics');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'color', color: 'red' } }).includes('red'), 'choiceWords colour blob');
ok(I.choiceWords('vi', { id: 'a', thing: { kind: 'home', home: 'ice' } }).includes('xứ băng'), 'choiceWords home badge');
ok(I.choiceWords('vi', { id: 'a', thing: { kind: 'home', home: 'ice' } }).includes('xu bang'), 'choiceWords home badge without diacritics');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'number', n: 4 } }).includes('four'), 'choiceWords number');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'dots', n: 4 } }).includes('4'), 'choiceWords pinecone sign');
ok(I.choiceWords('vi', { id: 'a', thing: { kind: 'dots', n: 4 } }).includes('bon'), 'choiceWords vi pinecones without diacritics');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'animal', animal: 'pig' } }).includes('piggy'), 'choiceWords animal');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'shape', shape: 'triangle', color: 'red' } }).includes('triangle'), 'choiceWords shape');
ok(I.choiceWords('en', { id: 'a', thing: { kind: 'obj', obj: 'lantern', color: 'red' } }).includes('lantern'), 'choiceWords obj');

section('game lines: sayRight / sayNext / sayPump / sayPennant / sayWrong / camp (DESIGN §6 examples)');
const R = (o) => Object.assign({ mode: 'match' }, o);
const MUG = { kind: 'obj', obj: 'mug', color: 'red' };
eq(I.sayRight('en', R({ thing: MUG, launch: 0, k: 2, left: 1, rule: { kind: 'color', value: 'red' } }), r0), 'A red mug! Now pump!', 'en right + pump (DESIGN §6)');
eq(I.sayRight('vi', R({ thing: MUG, launch: 0, k: 2, left: 1, rule: { kind: 'color', value: 'red' } }), r0), 'Cái cốc màu đỏ! Giờ bé bơm nhé!', 'vi right + pump');
eq(I.sayRight('en', R({ thing: MUG, pump: false, rule: { kind: 'color', value: 'red' } }), r0), 'A red mug!', 'pump:false → just the name');
eq(I.sayRight('en', R({ thing: { kind: 'animal', animal: 'penguin' }, home: 'ice', rule: { kind: 'home', value: 'ice' } }), r0), 'The penguin lives on the ice! Now pump!', 'en home line');
eq(I.sayRight('vi', R({ thing: { kind: 'animal', animal: 'penguin' }, home: 'ice', rule: { kind: 'home', value: 'ice' } }), r0), 'Chim cánh cụt sống ở xứ băng! Giờ bé bơm nhé!', 'vi home line');
eq(I.sayRight('en', { thing: { kind: 'dots', n: 4 }, mode: 'countSel', rule: { kind: 'n', value: 4 } }, r0), '4 pinecones! Now pump!', 'en countSel right names the count');
eq(I.sayRight('en', { thing: { kind: 'dots', n: 2, numeral: true }, mode: 'countSeq', launch: 1, rule: { kind: 'seq', value: 3 } }, r0), 'Number 2! Now pump!', 'en countSeq right (from launch)');
eq(I.sayRight('vi', { thing: { kind: 'dots', n: 3, numeral: true }, mode: 'countSeq', row: 2 }, r0), 'Số 3! Giờ bé bơm nhé!', 'vi countSeq (legacy row)');
eq(I.sayRight('en', { thing: { kind: 'dots', n: 1 }, promptKey: 'p.countSeq', params: { n: 3 } }, r0), 'Number 1! Now pump!', 'countSeq from promptKey + thing.n (never params.n)');
// next (launch j ≥ 1)
eq(I.sayNext('en', { launch: 1, left: 1, rule: { kind: 'color', value: 'red' } }, r0), 'Next one: red!', 'en next (DESIGN §6)');
eq(I.sayNext('vi', { launch: 1, rule: { kind: 'color', value: 'red' } }, r0), 'Tiếp nè: màu đỏ nhé!', 'vi next');
eq(I.sayNext('en', { launch: 1, mode: 'countSeq', params: { n: 3 } }, r0), 'Now 2!', 'en next countSeq "Now 2!" (DESIGN §6)');
eq(I.sayNext('vi', { launch: 2, mode: 'countSeq' }, r0), 'Giờ tới số 3 nào!', 'vi next countSeq');
eq(I.sayNext('en', { launch: 1, rule: { kind: 'home', value: 'farm' } }, r0), 'Next one: who lives on the farm?', 'en next home');
eq(I.sayNext('en', { launch: 1, rule: { kind: 'n', value: 4 }, mode: 'countSel' }, r0), 'Next one: 4 pinecones!', 'en next countSel');
eq(I.sayNext('en', { launch: 1, rule: { kind: 'parity', value: 'odd' } }, r0), 'Next one: an odd number!', 'en next parity');
eq(I.sayNext('en', { launch: 1 }, r0), 'Next one!', 'next without a rule → next.any');
// pump count
eq(I.sayPump('en', 1), 'One!', 'pump 1'); eq(I.sayPump('en', 2), 'Two!', 'pump 2'); eq(I.sayPump('en', 3), 'Three! Blast off!', 'pump 3 (DESIGN §6)');
eq(I.sayPump('vi', 1), 'Một!', 'vi pump 1'); eq(I.sayPump('vi', 3), 'Ba! Bay nào!', 'vi pump 3 (DESIGN §6)');
eq(I.sayPump('en', 3, 2), 'Two, three! Blast off!', 'merged pump line'); eq(I.sayPump('vi', 3, 1), 'Một, hai, ba! Bay nào!', 'vi merged');
eq(I.sayPump('en', 2, 5), 'Two!', 'from > n is ignored'); eq(I.sayPump('en', 0), '', 'pump 0 → nothing');
// pennant, count up, camp
eq(I.sayPennant('en', { thing: MUG }, r0), 'The red mug on the flagpole!', 'en pennant');
eq(I.sayPennant('vi', { thing: MUG }, r0), 'Cái cốc màu đỏ lên cột cờ rồi!', 'vi pennant');
eq(I.sayPennant('en', {}, r0), 'A new flag!', 'pennant without a thing');
eq(I.sayCountUp('en', 4), 'One, two, three, four! Four pinecones!', 'en count up (countSel collect)');
eq(I.sayCountUp('vi', 4), 'Một, hai, ba, bốn! Bốn quả thông!', 'vi count up');
eq(I.sayCamp('en', 3, r0), 'All our flags! One, two, three! Three flags!', 'en camp (DESIGN §6)');
eq(I.sayCamp('vi', 2, r0), 'Cờ của mình nè! Một, hai! Hai lá cờ!', 'vi camp');
eq(I.sayCamp('en', null, r0), 'All our flags!', 'camp without n');
eq(I.t('en', 'pumpAsk', null, r0), 'Pump, pump, pump!', 'pumpAsk (DESIGN §6)'); eq(I.t('vi', 'pumpAsk', null, r0), 'Bé bơm đi nào!', 'vi pumpAsk');
eq(I.t('en', 'pumpAuto', null, r0), 'I’ll help!', 'pumpAuto'); eq(I.t('en', 'chute', null, r0), 'Parachute!', 'chute'); eq(I.t('vi', 'chute', null, r0), 'Bung dù!', 'vi chute');
eq(I.t('en', 'land', null, r0), 'Touchdown!', 'land'); eq(I.t('vi', 'land', null, r0), 'Đáp rồi!', 'vi land');
// wrong
eq(I.sayWrong('en', { thing: { kind: 'obj', obj: 'mushroom', color: 'blue' }, got: { nameKind: 'color', nameValue: 'blue' }, want: { rule: { kind: 'color', value: 'red' } }, streak: 1 }, r0), 'That’s a blue mushroom. Find a red one!', 'en wrong: DESIGN example');
eq(I.sayWrong('vi', { thing: { kind: 'obj', obj: 'mushroom', color: 'blue' }, got: { nameKind: 'color', nameValue: 'blue' }, want: { rule: { kind: 'color', value: 'red' } }, streak: 1 }, r0), 'Đây là cây nấm màu xanh dương. Mình tìm cái màu đỏ nhé!', 'vi wrong');
eq(I.sayWrong('en', { got: { nameKind: 'color', nameValue: 'blue' }, want: { kind: 'color', value: 'red' } }, r0), 'That’s a blue one. Find a red one!', 'en wrong rebuilt from got');
eq(I.sayWrong('en', { thing: { kind: 'animal', animal: 'lion' }, rule: { kind: 'home', value: 'farm' } }, r0), 'That’s a lion. It lives on the savanna. Who lives on the farm?', 'en wrong home teaches the home');
eq(I.sayWrong('en', { thing: { kind: 'dots', n: 4 }, mode: 'countSeq', need: 2, rule: { kind: 'seq' } }, r0), 'That’s 4. Which one is 2?', 'en countSeq wrong — e.need');
eq(I.sayWrong('en', { thing: { kind: 'dots', n: 4 }, want: { rule: { kind: 'seq', value: 3 }, n: 2 } }, r0), 'That’s 4. Which one is 2?', 'countSeq wrong — want.n');
eq(I.sayWrong('en', { thing: { kind: 'dots', n: 4 }, mode: 'countSeq', launch: 1, want: { rule: { kind: 'seq', value: 3 } } }, r0), 'That’s 4. Which one is 2?', 'countSeq wrong — launch + 1 (not rule.value = k)');
eq(I.sayWrong('vi', { thing: { kind: 'dots', n: 4 }, mode: 'countSeq', count: 2 }, r0), 'Đây là số 4. Số 2 đâu nhỉ?', 'vi countSeq wrong — e.count');
eq(I.sayWrong('en', { got: { nameKind: 'number', nameValue: 5 }, mode: 'countSeq' }, r0), 'That’s 5. Let’s count in order!', 'countSeq wrong without the needed number');
eq(I.sayWrong('en', { mode: 'countSeq' }, r0), 'Let’s count in order!', 'countSeq wrong with nothing');
eq(I.sayWrong('en', { thing: { kind: 'dots', n: 3 }, mode: 'countSel', rule: { kind: 'n', value: 4 } }, r0), 'That’s 3 pinecones. Find the sign with 4 pinecones!', 'en countSel wrong');
eq(I.sayWrong('vi', { thing: { kind: 'dots', n: 3 }, mode: 'countSel', rule: { kind: 'n', value: 4 } }, r0), 'Đây là 3 quả thông. Mình tìm tấm biển có 4 quả thông nhé!', 'vi countSel wrong');
eq(I.sayWrongHint('en', { thing: { kind: 'obj', obj: 'ball', color: 'green' }, rule: { kind: 'color', value: 'red' } }, r0), 'That’s a green ball. Look at the shiny mat!', 'en wrong hint');
eq(I.sayWrongHint('en', { thing: { kind: 'dots', n: 4 }, mode: 'countSeq', need: 2 }, r0), 'That’s 4. Look at the shiny mat!', 'countSeq wrong hint');
eq(I.sayCount('en', 1), 'One!', 'sayCount en'); eq(I.sayCount('vi', 1), 'Một!', 'sayCount vi');
eq(I.sayCountRun('en', 4), 'Four pinecones!', 'sayCountRun default pinecones'); eq(I.sayCountRun('en', 1, 'dots'), 'One pinecone!', 'one pinecone (legacy kind dots)');
eq(I.sayCountRun('vi', 4, 'pinecones'), 'Bốn quả thông!', 'sayCountRun vi'); eq(I.sayCountRun('en', 3, 'flags'), 'Three flags!', 'sayCountRun flags');
eq(I.sayCountRun('vi', 3, 'pennants'), 'Ba lá cờ!', 'sayCountRun vi flags'); eq(I.sayCountRun('en', 2, 'mats'), 'Two mats!', 'sayCountRun mats');
eq(I.seqList(3), '1, 2, 3', 'seqList');
for (let i = 0; i <= 20; i++) for (const l of I.langs) ok(tidy(I.sayCount(l, i)), `${l} sayCount ${i}`);
for (const l of I.langs) for (let n = 1; n <= 3; n++) for (let f = 1; f <= n; f++) {
  const s = I.sayPump(l, n, f);
  ok(tidy(s) && positive(s) && clean(s), `${l} sayPump ${n} from ${f}: ${s}`);
  ok(/Blast off!|Bay nào!/.test(s) === (n === 3), `${l} sayPump ${n}: "Blast off" exactly on the 3rd: ${s}`);
  ok(s.split(',').length === n - f + 1, `${l} sayPump ${n} from ${f} says every number once: ${s}`);
}

// every topic thing kind × rule × launch × language × wording
const SETS = [];
for (const c of COLORS) for (const o of OBJS) SETS.push({ topic: 'colors', pk: 'p.colors', params: { color: 'red' }, rule: { kind: 'color', value: 'red' }, thing: { kind: 'obj', obj: o, color: c, nameKind: 'color', nameValue: c } });
for (const s of SHAPES) for (const c of ['red', 'blue', 'pink']) SETS.push({ topic: 'shapes', pk: 'p.shapes', params: { shape: 'star' }, rule: { kind: 'shape', value: 'star' }, thing: { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s } });
for (const s of SHAPES) for (const c of COLORS) SETS.push({ topic: 'shapes', pk: 'p.shapes5', params: { shape: 'heart' }, rule: { kind: 'shape', value: 'heart' }, thing: { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s } });
for (const o of OBJS) for (const big of [true, false]) for (const want of ['big', 'small']) SETS.push({ topic: 'size', pk: 'p.size', params: { big: want === 'big' }, rule: { kind: 'size', value: want }, thing: { kind: 'obj', obj: o, color: 'green', big, nameKind: 'size', nameValue: big ? 'big' : 'small' } });
for (let n = 1; n <= 12; n++) SETS.push({ topic: 'count', pk: 'p.countSel', params: { n: 4 }, rule: { kind: 'n', value: 4 }, mode: 'countSel', thing: { kind: 'dots', n, nameKind: 'number', nameValue: n } });
for (let n = 1; n <= 7; n++) for (let launch = 0; launch < 4; launch++) SETS.push({ topic: 'count', pk: 'p.countSeq', params: { n: 4 }, rule: { kind: 'seq', value: 4 }, mode: 'countSeq', launch, thing: { kind: 'dots', n, numeral: true, nameKind: 'number', nameValue: n } });
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
const PUMP_TAIL = /(Now pump!|Pump it up!|Now stomp the pump!|Giờ bé bơm nhé!|Bơm thôi nào!|Bé bơm cho tên lửa nhé!)$/;
const RIGHT_ANY = /^(Yes! You got it!|That’s the one!|Yes! Let’s fly!|Đúng rồi! Bé giỏi quá!|Đúng cái đó rồi!|Đúng rồi! Mình bay nào!)/;
const NEXT_ANY = /^(Next one!|One more launch!|Here we go again!|Lần tiếp theo nào!|Phóng thêm lần nữa nào!|Mình bay tiếp nhé!)$/;
for (const S of SETS) for (const l of I.langs) for (const rng of RNGS) {
  for (const left of [0, 1, 2]) {
    const launch = S.launch != null ? S.launch : 2 - left;
    const e = { id: 'm1', thing: S.thing, x: 1, y: 1, launch, k: launch + left + 1, left, home: S.thing.home, count: S.mode === 'countSeq' ? launch + 1 : undefined,
      topic: S.topic, promptKey: S.pk, params: S.params, rule: S.rule, mode: S.mode || 'match' };
    const s = I.sayRight(l, e, rng); sweep++;
    ok(tidy(s) && positive(s) && clean(s), `${l} right ${S.topic} ${JSON.stringify(S.thing)} launch ${launch}: ${s}`);
    ok(!RIGHT_ANY.test(s), `${l} right names the thing: ${s}`);
    ok(PUMP_TAIL.test(s), `${l} right ends with the pump cue: ${s}`);
    if (S.mode === 'countSeq') ok(s.includes(String(launch + 1)), `${l} countSeq right names the launch's number: ${s}`);
    if (S.mode === 'countSel') ok(s.includes(String(S.thing.n)) && /pinecone|quả thông/.test(s), `${l} countSel right names the pinecones: ${s}`);
    if (S.rule.kind === 'home') ok(s.includes(I.name(l, 'homeAt', S.thing.home)), `${l} home line names the home: ${s}`);
    // next (before this launch, when it is not the first) and the pennant of this thing
    if (launch > 0) {
      const nx = I.sayNext(l, { launch, left, topic: S.topic, promptKey: S.pk, params: S.params, rule: S.rule, mode: S.mode || 'match' }, rng); sweep++;
      ok(tidy(nx) && positive(nx) && clean(nx) && !NEXT_ANY.test(nx), `${l} next ${S.topic} launch ${launch}: ${nx}`);
      if (S.mode === 'countSeq') ok(nx.includes(String(launch + 1)), `${l} next countSeq says ${launch + 1}: ${nx}`);
      ok(nx.length <= 60, `${l} next is short: ${nx}`);
    }
    const pn = I.sayPennant(l, Object.assign({ slot: launch }, e), rng); sweep++;
    ok(tidy(pn) && positive(pn) && clean(pn) && !/^(A new flag!|Up goes a flag!|Look, a flag!|Thêm một lá cờ!|Lá cờ lên rồi!|Nhìn kìa, lá cờ!)$/.test(pn), `${l} pennant ${S.topic}: ${pn}`);
  }
  for (const streak of [1, 2, 4]) {
    const e = { id: 'm2', thing: S.thing, got: { nameKind: S.thing.nameKind, nameValue: S.thing.nameValue }, want: { rule: S.rule }, streak, x: 1, y: 1,
      launch: S.launch, topic: S.topic, promptKey: S.pk, params: S.params, mode: S.mode || 'match' };
    const s = I.sayWrong(l, e, rng); sweep++;
    ok(tidy(s) && positive(s) && clean(s), `${l} wrong ${S.topic} ${JSON.stringify(S.thing)}: ${s}`);
    ok(/[.!?] \p{Lu}/u.test(s), `${l} wrong names it, then the goal: ${s}`);
    if (S.mode === 'countSeq') ok(s.includes(String(S.thing.n)) && s.includes(String(S.launch + 1)), `${l} countSeq wrong names both numbers: ${s}`);
    const h = I.sayWrongHint(l, e, rng);
    ok(tidy(h) && positive(h) && clean(h), `${l} wrongHint ${S.topic}: ${h}`);
    const s2 = I.sayWrong(l, { got: e.got, want: S.rule, streak, mode: S.mode, launch: S.launch }, rng);
    ok(tidy(s2) && positive(s2) && clean(s2), `${l} wrong from got only ${S.topic}: ${s2}`);
  }
}
eq(I.sayWrong('en', { thing: { kind: 'obj', obj: 'lantern', color: 'green' }, promptKey: 'p.colors', params: { color: 'yellow' } }, r0), 'That’s a green lantern. Find a yellow one!', 'rule from promptKey');
ok(tidy(I.sayRight('en', {})) && tidy(I.sayWrong('vi', {})) && tidy(I.sayWrongHint('en', {})) && tidy(I.sayNext('vi', {})) && tidy(I.sayPennant('vi', {})), 'empty events still say something kind');
ok(tidy(I.sayRight('en', null)) && tidy(I.sayWrong('en', undefined)) && tidy(I.sayNext('en', null)) && tidy(I.sayPennant('en', null)), 'null events never throw');
for (const l of I.langs) for (let n = 1; n <= 12; n++) {
  ok(tidy(I.sayCountUp(l, n, 'pinecones')) && tidy(I.sayCamp(l, Math.min(n, 4), r5)), `${l} count up / camp ${n}`);
}
console.log(`   (${sweep} right / next / pennant / wrong lines rendered)`);

section('the other game lines');
for (const l of I.langs) for (const rng of RNGS) {
  for (const k of ['unfold', 'wipe', 'poke', 'surprise.marmot', 'marmot.tap', 'surprise.goat', 'goat.tap', 'surprise.bird', 'bird.tap',
    'weather.0', 'weather.1', 'weather.2', 'weather.3', 'hint', 'idle', 'praise', 'great', 'party', 'pumpAsk', 'pumpAuto', 'chute',
    'land', 'camp'])
    ok(tidy(I.t(l, k, null, rng)) && clean(I.t(l, k, null, rng)) && positive(I.t(l, k, null, rng)), `${l} ${k}: ${I.t(l, k, null, rng)}`);
}
eq(I.t('en', 'weather.0', null, r0), 'A sunny day at camp!', 'weather.0 (DESIGN §6)'); eq(I.t('en', 'weather.1', null, r0), 'Whoosh, it’s windy!', 'weather.1');
eq(I.t('en', 'weather.2', null, r0), 'Pitter-patter, rain! Ducks love rain!', 'weather.2'); eq(I.t('en', 'weather.3', null, r0), 'Look, a rainbow!', 'weather.3');
ok(/cầu vồng/.test(I.t('vi', 'weather.3', null, r0)) && /mưa/.test(I.t('vi', 'weather.2', null, r0)) && /gió/.test(I.t('vi', 'weather.1', null, r0)) && /nắng/.test(I.t('vi', 'weather.0', null, r0)), 'vi weather lines name the mood');
eq(I.t('en', 'poke', null, r0), 'Quack! That tickles!', 'poke (DESIGN §6)');
ok(/marmot|sóc đất/.test(I.t('en', 'surprise.marmot', null, r0) + I.t('vi', 'surprise.marmot', null, r0)), 'marmot surprise named');
ok(/cột cờ|flagpole/.test(I.t('vi', 'surprise.bird', null, r0) + I.t('en', 'surprise.bird', null, r0)), 'the bird is on the flagpole');
eq(I.t('en', 'talk.count'), 'How many pinecones?', 'talk count');

section('talk');
const TALKS = [['talk.color', {}], ['talk.colors', {}], ['talk.colorsWhich', { color: 'red' }], ['talk.shape', { shape: 'triangle' }],
  ['talk.shapes', { shape: 'triangle' }], ['talk.count', {}], ['talk.home', { animal: 'penguin' }], ['talk.animals', { animal: 'fishbowl' }],
  ['talk.who', {}], ['talk.size', { size: 'big' }], ['talk.letters', { letter: 'B' }], ['talk.lower', { letter: 'B' }],
  ['talk.lower', { letter: 'B', small: 'b' }], ['talk.initial', { letter: 'C', nameKind: 'animal', nameValue: 'cow' }],
  ['talk.initial', { letter: 'L', nameKind: 'obj', nameValue: 'lantern' }], ['talk.add', { a: 2, b: 3 }], ['talk.sub', { a: 7, b: 2 }],
  ['talk.oddeven', { parity: 'odd' }]];
for (const [k, p] of TALKS) for (const l of I.langs) { const s = I.t(l, k, p); ok(tidy(s) && s !== k && clean(s), `${l} ${k}: ${s}`); }
eq(I.t('en', 'talk.home', { animal: 'penguin' }), 'Where does the penguin live?', 'talk home');
eq(I.t('vi', 'talk.home', { animal: 'penguin' }), 'Chim cánh cụt sống ở đâu nhỉ?', 'vi talk home');
eq(I.t('en', 'talk.who'), 'Who is this?', 'talk who');
eq(I.t('en', 'talk.initial', { letter: 'C', nameKind: 'animal', nameValue: 'cow' }), 'Which letter does cow start with?', 'talk initial never says the letter');
eq(I.t('vi', 'talk.initial', { letter: 'C', nameKind: 'obj', nameValue: 'mug' }), 'Cốc bắt đầu bằng chữ gì nhỉ?', 'vi talk initial with an obj');
eq(I.talkWrong('en', { id: 'h', thing: { kind: 'home', home: 'ice' } }, { show: { kind: 'animal', animal: 'penguin' } }), 'The penguin lives on the ice! Good try!', 'talkWrong home');
eq(I.talkWrong('vi', { id: 'h', thing: { kind: 'home', home: 'ice' } }, { show: { kind: 'animal', animal: 'penguin' } }), 'Chim cánh cụt sống ở xứ băng đó! Bé cố gắng lắm!', 'vi talkWrong home');
eq(I.talkWrong('en', { id: 'n', thing: { kind: 'number', n: 4 } }, { topic: 'count' }), 'There are 4 pinecones! Good try!', 'talkWrong pinecones');
eq(I.talkWrong('vi', { id: 'n', thing: { kind: 'number', n: 4 } }, { topic: 'count' }), 'Có 4 quả thông đó! Bé cố gắng lắm!', 'vi talkWrong pinecones');
eq(I.talkWrong('en', { id: 'n', thing: { kind: 'number', n: 1 } }, { topic: 'count' }), 'There is 1 pinecone! Good try!', 'talkWrong one pinecone');
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

// ------------------------------------------------------------------ content.js (rocket launches) when it exists
// content.js is rewritten in parallel by the mechanics engineer: only the rocket version (rounds with `launches`) is checked;
// a river version (rows) or a content.js that does not load is skipped with a note — never edited from here.
let contentSB = null, contentNote = 'content.js not there';
if (fs.existsSync(path.join(JS, 'content.js'))) {
  try {
    const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
    if (/launches/.test(csrc)) {
      const sbc = makeSandbox(); sbc.DK = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.DK.Content && sbc.DK.Content.makeRound) { contentSB = sbc; contentNote = 'rocket content.js loaded'; }
      else contentNote = 'content.js has no Content.makeRound yet — skipped';
    } else contentNote = 'content.js is still the river version (rows) — content checks skipped';
  } catch (e) { contentNote = 'content.js does not load yet (' + e.message + ') — content checks skipped'; }
}
console.log(`   (${contentNote})`);
if (contentSB) {
  section('content.js: every promptKey / Talk key / mat it produces');
  const CF = contentSB.DK, C = CF.Content;
  for (const a of Object.keys(CF.ANIMALS || {})) ok(I.ANIMALS.includes(a), `content animal ${a} has names`);
  for (const o of CF.OBJS || []) ok(I.OBJS.includes(o), `content obj ${o} has names`);
  for (const c of CF.COLORS || []) ok(I.COLORS.includes(c), `content colour ${c} has names`);
  const AGE_TOPICS = CF.AGE_TOPICS || {};
  let rounds = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of (AGE_TOPICS[age] || [])) for (const lang of I.langs) for (let ri = 0; ri < 4; ri++) {
    let round;
    try {
      const rng = CF.RNG ? new CF.RNG(age * 1000 + ri * 7 + topic.length) : { next: Math.random };
      round = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level: TOPICS.indexOf(topic) % 4 });
    } catch (e) { console.log(`WARN  makeRound ${topic} age ${age} ${lang} round ${ri} threw (content.js, not i18n): ${e.message}`); continue; }
    if (!round || !Array.isArray(round.launches)) continue;
    rounds++;
    const ask = I.ask(lang, round.promptKey, round.params, { first: ri === 0 });
    ok(tidy(ask) && clean(ask) && !P_ANY.test(ask), `${lang} age ${age} ${topic}: ask ${round.promptKey} ${JSON.stringify(round.params)} → ${ask}`);
    if (round.surprise) ok(I.has(lang, 'surprise.' + round.surprise) && I.has(lang, round.surprise + '.tap'), `${lang} surprise ${round.surprise} has lines`);
    const ctx = { topic, promptKey: round.promptKey, params: round.params, rule: round.rule, mode: round.mode };
    round.launches.forEach((mats, j) => {
      if (j > 0) { const nx = I.sayNext(lang, Object.assign({ launch: j, left: round.k - j - 1 }, ctx)); ok(tidy(nx) && clean(nx) && !NEXT_ANY.test(nx), `${lang} age ${age} ${topic} next ${j}: ${nx}`); }
      for (const mt of mats) {
        const base = Object.assign({ id: mt.id, thing: mt.thing, launch: j, k: round.k }, ctx);
        if (mt.target) {
          const s = I.sayRight(lang, Object.assign({ left: round.k - j - 1, home: mt.thing.home, count: round.mode === 'countSeq' ? j + 1 : undefined }, base));
          ok(tidy(s) && positive(s) && clean(s) && !RIGHT_ANY.test(s), `${lang} age ${age} ${topic} right: ${s}`);
          const pn = I.sayPennant(lang, base);
          ok(tidy(pn) && clean(pn), `${lang} age ${age} ${topic} pennant: ${pn}`);
        } else {
          const s = I.sayWrong(lang, Object.assign({ want: { rule: round.rule }, got: { nameKind: mt.thing.nameKind, nameValue: mt.thing.nameValue }, streak: 1 }, base));
          ok(tidy(s) && positive(s) && clean(s) && !/^(Let’s look again!|Mình tìm lại nhé!)$/.test(s), `${lang} age ${age} ${topic} wrong: ${s}`);
        }
        ok(I.sayName(lang, mt.thing).length > 0, `${lang} mat thing named: ${JSON.stringify(mt.thing)}`);
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
      } catch (e) { console.log(`WARN  makeTalk ${topic}: ${e.message} (content.js, not i18n)`); }
    }
  }
  console.log(`   (${rounds} content rounds rendered)`);
}

section('speech text: letters, maths, pauses, caps, "Mimi"');
eq(I.speech('en', 'That’s letter D.'), 'That’s letter dee.', 'en letter names');
eq(I.speech('en', 'A duck! D is for duck!'), 'A duck! dee is for duck!', 'en "D is for"');
eq(I.speech('en', 'Land on the one that starts with C!'), 'Land on the one that starts with see!', 'en starts with');
eq(I.speech('en', 'Land on big A or small a!'), 'Land on big ay or small ay!', 'en big/small letters');
eq(I.speech('en', 'Let’s launch the rocket! Lots of colours… but look at the shape! Land on the RED one!'), 'Let’s launch the rocket! Lots of colours, but look at the shape! Land on the red one!', '… → comma pause, caps → lower');
eq(I.speech('en', 'Next one: letter B!'), 'Next one: letter bee!', 'en next letter');
eq(I.speech('en', '2 + 4 makes 6!'), '2 plus 4 makes 6!', 'en plus');
eq(I.speech('vi', '7 − 2 bằng 5!'), '7 trừ 2 bằng 5!', 'vi minus');
eq(I.speech('vi', 'Bé cho tên lửa đáp xuống chữ B nhé!'), 'Bé cho tên lửa đáp xuống chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Chữ m thường!'), 'Chữ mờ thường!', 'vi small letter');
eq(I.speech('vi', 'Mình phóng tên lửa nào! Bé cho tên lửa đáp xuống thứ màu ĐỎ nhé!'), 'Mình phóng tên lửa nào! Bé cho tên lửa đáp xuống thứ màu đỏ nhé!', 'vi caps → lower');
eq(I.speech('en', 'Land on 1, then 2, then 3!'), 'Land on 1, then 2, then 3!', 'countSeq digits read as is');
eq(I.speech('en', 'Hi! I am Mimi.'), 'Hi! I am Mimi.', 'en "Mimi" as written');
eq(I.speech('vi', 'Mình là vịt Mimi. Mimi giúp bé nhé!'), 'Mình là vịt Mimi. Mimi giúp bé nhé!', 'vi "Mimi" as written');
eq(I.speech('en', 'Mimi is listening…'), 'Mimi is listening.', 'final ellipsis → full stop');
eq(I.speech('en', 'Three! Blast off!'), 'Three! Blast off!', 'pump line read as is');
eq(V.spoken('vi', 'Chào bé! Mình là vịt Mimi.'), 'Chào bé! Mình là vịt Mimi.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Land on letter B!'), 'Land on letter bee!', 'Voice.spoken letter names');
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
  sb4.DK = {};
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
  // pumping: 12 quick taps on the same spot (a double-tap pattern) → 12 separate down/up pairs, nothing merged or swallowed
  for (let i = 0; i < 12; i++) { const d = pe(100 + i, 300, 300); canvas.emit('pointerdown', d); ok(d.prevented, 'every pump tap is preventDefault-ed (no double-tap zoom)'); canvas.emit('pointerup', pe(100 + i, 300, 300)); }
  eq(calls.filter(c => c[0] === 'down').length + '/' + calls.filter(c => c[0] === 'up').length, '12/12', 'pumping: 12 taps → 12 downs + 12 ups');
  calls.length = 0;
  // rapidTaps (main: () => world.phase === 'pump'): a second finger while the first is down = up of the first + a new tap
  const rt = new El('canvas'), rtc = []; let rapidOn = true;
  IN.attach(rt, { toLogical: (cx, cy) => ({ x: cx, y: cy }), rapidTaps: () => rapidOn, down: (x) => rtc.push('down' + x),
    move: (x) => rtc.push('move' + x), up: (x) => rtc.push('up' + x), cancel: () => rtc.push('cancel') });
  rt.emit('pointerdown', pe(1, 10, 10, { target: rt }));
  rt.emit('pointermove', pe(1, 12, 10, { target: rt }));
  rt.emit('pointerdown', pe(2, 50, 50, { target: rt, isPrimary: false }));
  rt.emit('pointerup', pe(1, 12, 10, { target: rt }));
  rt.emit('pointerup', pe(2, 50, 50, { target: rt, isPrimary: false }));
  eq(rtc.join(','), 'down10,move12,up12,down50,up50', 'rapidTaps: two-finger drumming → every finger is a tap (the first ends with up)');
  rtc.length = 0; rapidOn = false;
  rt.emit('pointerdown', pe(3, 10, 10, { target: rt })); rt.emit('pointerdown', pe(4, 60, 60, { target: rt, isPrimary: false }));
  rt.emit('pointerup', pe(4, 60, 60, { target: rt, isPrimary: false })); rt.emit('pointerup', pe(3, 10, 10, { target: rt }));
  eq(rtc.join(','), 'down10,up10', 'rapidTaps off (play phase): the extra finger is ignored');
  rtc.length = 0; rapidOn = true;
  rt.emit('pointerdown', pe(5, 10, 10, { target: rt })); rt.emit('pointerdown', pe(6, 10, 10, { target: rt, pointerType: 'mouse' }));
  ok(rtc[0] === 'down10' && rtc.indexOf('cancel') > 0, 'rapidTaps: a mouse press still replaces a stuck touch with cancel');
  rt.emit('pointerup', pe(6, 10, 10, { target: rt, pointerType: 'mouse' }));
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
  sb7.DK = {};
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
  sb5.DK = {};
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
  sb6.DK = {};
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
ok(sb.DK.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into DK.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof DK.Input.attach === 'function' && typeof DK.Input.kidProof === 'function' && typeof DK.Input.holdButton === 'function',
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
  sbx.DK = {};
  env.DK = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.DK.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.25) < 1e-9, 'Mimi: rate 0.9, pitch 1.25');
  ok(V2.RATE === 0.9 && V2.PITCH === 1.25, 'Voice.RATE / PITCH exported');
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
  // vi: "Mimi" goes to TTS as written, letter names are rewritten; the speech-bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là vịt Mimi. Bé cho tên lửa đáp xuống chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là vịt Mimi. Bé cho tên lửa đáp xuống chữ bờ nhé!', 'vi utterance: "Mimi" kept, "chữ bờ"');
  eq(startText, 'Mình là vịt Mimi. Bé cho tên lửa đáp xuống chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animal', { animal: 'duck' }, { lang: 'vi' });
  ok(/^(Bé cho tên lửa bay tới con vịt nhé!|Con vịt ở đâu nhỉ\? Bé cho tên lửa đáp xuống đó nào!|Bé tìm con vịt rồi phóng tên lửa nhé!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read DK.debug.voiceLog)');
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
  E3.DK.__dummy = 0;
  Date.now = () => t0 + 8000;      // 8 s later the child taps
  E3.V.unlock();
  Date.now = realNow;
  await wait(150);
  ok(E3.texts().includes('Welcome!'), 'welcome line survives a slow first tap');
  E3.end(); await welcome;

  // ---- the pump count policy (VOICE §2.1): numbers never cut each other, fast pumps merge, Blast off on the 3rd
  { const P = fakeSynthEnv(); const VP = P.V; VP.init({ lang: 'en' }); VP.unlock(); await wait(100);
    VP.say('A red mug! Now pump!', { tag: 'right' }); await wait(20);
    const p1 = VP.sayPump(1);
    eq(p1.text, 'One!', 'sayPump 1 text');
    await wait(150);
    eq(P.texts().slice(-1)[0], 'One!', 'pump 1 cuts the "Now pump!" right line and speaks now');
    ok(Math.abs(P.spoken[P.spoken.length - 1].rate - 1.0) < 1e-9 && Math.abs(P.spoken[P.spoken.length - 1].pitch - 1.25) < 1e-9, 'pump lines at PUMP_RATE 1.0, Mimi pitch');
    const p2 = VP.sayPump(2);
    eq(VP.queuedTags().join(','), 'pump', 'Two! waits — it never cuts One!');
    const p3 = VP.sayPump(3);
    eq((await p2).reason, 'merged', 'the waiting Two! is merged');
    eq(p3.text, 'Two, three! Blast off!', 'fast pumper: one merged line with every number + Blast off');
    eq(VP.queuedTags().length, 1, 'only one pump line waits (the voice never lags behind)');
    P.end(); eq((await p1).spoken, true, 'One! finished');
    await wait(30);
    eq(P.texts().slice(-1)[0], 'Two, three! Blast off!', 'then the merged line');
    P.end(); await p3;
    const s1 = VP.sayPump(1); await wait(20); eq(P.texts().slice(-1)[0], 'One!', 'slow: One!'); P.end(); await s1;
    const s2 = VP.sayPump(2); await wait(20); eq(P.texts().slice(-1)[0], 'Two!', 'slow: Two!'); P.end(); await s2;
    const s3 = VP.sayPump(3); await wait(20); eq(P.texts().slice(-1)[0], 'Three! Blast off!', 'slow: Three! Blast off!'); P.end(); await s3;
    VP.say('That is a blue mug. Find a red one!', { tag: 'wrong', priority: true }); await wait(20);
    const w1 = VP.sayPump(1); await wait(120);
    eq(P.texts().slice(-1)[0], 'That is a blue mug. Find a red one!', 'a pump line never cuts the wrong line');
    eq(VP.queuedTags()[0], 'pump', 'it waits at the front');
    P.end(); await wait(30); eq(P.texts().slice(-1)[0], 'One!', 'then One!'); P.end(); await w1;
    VP.say('count line', { tag: 'count', priority: true }); await wait(20);
    const n1 = VP.say('later normal line', { tag: 'pennant' });
    const q1 = VP.sayPump(1);
    eq(VP.queuedTags().join(','), 'pump,pennant', 'a pump line waits before normal lines; a count line is never cut');
    VP.stop(); await q1; await n1;
    const a1 = VP.sayPump(1, { auto: true });
    ok(/^(I’ll help!|Mimi will help! Stomp!|Let me pump!) One!$/.test(a1.text), 'first auto pump: pumpAuto + One!: ' + a1.text);
    await wait(20);
    const a2 = VP.sayPump(2, { auto: true }); eq(a2.text, 'Two!', 'later auto pump: just the number');
    VP.stop(); await a1; await a2;
    VP.say('busy', { tag: 'wrong', priority: true }); await wait(20);
    const b1 = VP.sayPump(1, { auto: true }), b2 = VP.sayPump(2, { auto: true });
    ok(/(help|pump)/i.test(b2.text) && /One, two!$/.test(b2.text), 'a merged auto line keeps the help head: ' + b2.text);
    VP.stop(); await b1; await b2;
    eq(VP.PUMP_STALE_MS, 2500, 'PUMP_STALE_MS 2.5 s');
    VP.say('long protected line', { tag: 'wrong', priority: true }); await wait(20);
    const st = VP.sayPump(1);
    const realNow2 = Date.now, t1 = realNow2(); Date.now = () => t1 + 3000;
    P.end(); await wait(30); Date.now = realNow2;
    eq((await st).reason, 'stale', 'a pump line that could not start within 2.5 s is dropped (the rocket flies)');
    const o1 = VP.sayPump(1); await wait(20); VP.sayPump(2); const o3 = VP.sayPump(1);
    eq(o3.text, 'One!', 'a new launch (pump 1 again) starts a new sequence');
    ok(VP.queuedTags().filter(t => t === 'pump').length === 1, 'the old sequence’s waiting line is dropped');
    VP.stop(); await o1; await o3;
    VP.setSpeed(4); const sp = await VP.sayPump(3, { lang: 'vi' }); eq(sp.reason, 'speed', 'speed > 1: the pump line is logged only');
    ok(VP.log.some(e => e.text === 'Ba! Bay nào!'), 'pump line logged (vi)'); VP.setSpeed(1);
    VP.setEnabled(false); eq((await VP.sayPump(1)).reason, 'off', 'voice off: pump logged only'); VP.setEnabled(true);
  }

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
