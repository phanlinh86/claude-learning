#!/usr/bin/env node
// Tupi's Bakery Delivery — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/elephant-bakery-delivery:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (§5.1 content, §6 voice); a synthetic map of houses + orders is
// built for every topic. When the delivery content.js exists (BD.Content.makeRound returning `houses` + `orders`), every
// prompt / Talk key + params it produces and the right line of every order / the wrong line of every other house are
// rendered too. Exits non-zero on any failure.
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
  return sb.BD;
}

let pass = 0, fail = 0, warn = 0;
const asyncTests = [];
const failSeen = new Set();
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; if (failSeen.size < 400 && !failSeen.has(msg)) { failSeen.add(msg); console.log('FAIL  ' + msg); } }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
// never negative (skill rule)
const NEG_EN = /\b(no|nope|wrong|incorrect|bad|fail|failed|mistake|oops|sorry|uh-oh|oh no|don’t|doesn’t|not)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|sai rồi|dở|tệ|hỏng|không đúng|chưa đúng|không phải|trật|nhầm|hư)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
// the base game (Nim's River Hop) and its sister (bubbles) must not leak into this one
const BANNED = /\bNim\b|hedgehog|brook|stepping|\bstones?\b|\bhop(s|ped|ping)?\b|\bfruit|nhím|suối|hòn đá|\bnhảy\b|trái cây|bubble|rainbow|panda|\bwand\b|bong bóng|cầu vồng|gấu trúc|\bfish\.tap|\bfrog\b|\bếch\b/i;
function clean(s) { return !BANNED.test(s); }
const r0 = () => 0, r5 = () => 0.5, r9 = () => 0.99;
const RNGS = [r0, r5, r9];
function tidy(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  if (/[{}]/.test(s) || /undefined|null|NaN|\[object|@odd|@even/.test(s)) return false;
  if (/\s[!?.,]/.test(s) || /^[!?.,—]/.test(s) || /_/.test(s) || /\s{2}/.test(s)) return false;
  if (/màu màu|\bthe the\b|\bcon con\b|\ba the\b|\bthe a\b|hình hình|cái cái|chữ chữ|số số|nhỏ nhỏ|\bto to\b|nhà nhà|bánh bánh|ở ở|sống sống|chấm chấm|\bhouse house\b|cookie cookie/i.test(s)) return false;
  if (/\ba [aeiou]/i.test(s.replace(/(letter|big|small|with|not|and|or) a /ig, ''))) return false;   // "a orange"
  if (/\ban [^aeiou\s]/i.test(s.replace(/(letter|big|small|with|not|and|or) an /ig, ''))) return false;
  if (!/^[\p{Lu}\d“"]/u.test(s.trim())) return false;                                              // capital first
  if (/[.!?] \p{Ll}/u.test(s)) return false;                                                        // capital after a stop
  return true;
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
function good(s, label) {
  ok(tidy(s), 'tidy: ' + label + ' → ' + JSON.stringify(s));
  ok(positive(s), 'positive: ' + label + ' → ' + s);
  ok(clean(s), 'no river/sister words: ' + label + ' → ' + s);
}

// ------------------------------------------------------------------ DESIGN value lists (§5.1, §6)
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
const TREATS = ['cupcake', 'macaron', 'donut', 'cakepop', 'jelly'];
const ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
const HOME = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
  crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
const HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.count', 'p.animal', 'p.home', 'p.letters', 'p.lower',
  'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const VI_NAMES = {
  treat: { cupcake: 'bánh cupcake', macaron: 'bánh macaron', donut: 'bánh donut', cakepop: 'kẹo bánh', jelly: 'thạch rau câu',
    cake: 'bánh kem', cookie: 'bánh quy' },
  animal: { cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', hen: 'con gà mái', horse: 'con ngựa',
    goat: 'con dê', crab: 'con cua', fishbowl: 'bể cá vàng', penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ' },
  home: { farm: 'nông trại', sea: 'biển', ice: 'xứ băng', savanna: 'đồng cỏ châu Phi', jungle: 'rừng rậm' },
  shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
    rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' },
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' },
  season: { spring: 'mùa xuân', summer: 'mùa hè', autumn: 'mùa thu', winter: 'mùa đông' }
};
// the initial-letter topic: first letter of the name without classifier, diacritics → base letter
const INITIAL = {
  en: { cow: 'C', pig: 'P', sheep: 'S', duck: 'D', hen: 'H', horse: 'H', goat: 'G', crab: 'C', penguin: 'P', lion: 'L',
    monkey: 'M', fishbowl: 'G', cupcake: 'C', macaron: 'M', donut: 'D', cakepop: 'C', jelly: 'J' },
  vi: { cow: 'B', pig: 'H', sheep: 'C', duck: 'V', hen: 'G', horse: 'N', goat: 'D', crab: 'C', penguin: 'C', lion: 'S',
    monkey: 'K', fishbowl: 'C', cupcake: 'C', macaron: 'M', donut: 'D', cakepop: 'K', jelly: 'T' }
};

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.BD = { debug: { voiceLog: [] } };
let BD;
try { BD = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = BD.I18N, V = BD.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  const scan = src.split('\n').filter(l => !/var AVOID|^\s*'superstar'/.test(l)).join('\n').replace(/speech[ -]bubble/gi, '').replace(/bubble \/ HUD|HUD \/ bubble|\/ bubble|bubble,/gi, '');
  ok(!/\bNim\b|hedgehog|brook|\bstones?\b|nhím|suối|hòn đá|panda|rainbow|bong bóng|cầu vồng/i.test(scan), `${f}: no base-game / sister-game names left`);
}
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.SHAPES.slice().sort()), JSON.stringify(SHAPES.slice().sort()), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.TREATS), JSON.stringify(TREATS), 'I18N.TREATS = BD.TREATS of DESIGN §5.1');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.HOMES), JSON.stringify(HOMES), 'I18N.HOMES = DESIGN list');
eq(JSON.stringify(I.ANIMAL_HOME), JSON.stringify(HOME), 'I18N.ANIMAL_HOME = BD.ANIMALS of DESIGN §5.1');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
eq(JSON.stringify(Object.keys(I.PROMPTS).sort()), JSON.stringify(PROMPT_KEYS.slice().sort()), 'I18N.PROMPTS = the DESIGN prompt keys');
eq(JSON.stringify(I.CLASSIFIERS.vi), JSON.stringify(['con', 'cái', 'quả', 'chiếc', 'cây', 'bông', 'bánh']), 'VI classifiers of DESIGN §5.1');
for (const fn of ['t', 'ask', 'sayRight', 'sayWrong', 'sayWrongHint', 'sayName', 'sayCount', 'sayCountRun', 'talkWrong',
  'choiceWords', 'name', 'words', 'setChild', 'initial', 'bareWord', 'initialOf', 'phrase', 'house', 'cargo', 'countList',
  'speech', 'has', 'keys', 'raw', 'kindValue', 'homeOf', 'numberName', 'stripMarks', 'stripClassifier'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params and the same number of wordings');
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(JSON.stringify(enKeys), JSON.stringify(viKeys), 'identical key sets');
for (const k of enKeys) {
  const a = I.raw('en', k), b = I.raw('vi', k);
  eq(placeholders(b), placeholders(a), `params of ${k}`);
  eq(Array.isArray(b) ? b.length : 1, Array.isArray(a) ? a.length : 1, `wording count of ${k}`);
  for (const s of [].concat(a, b)) ok(typeof s === 'string' && s.trim() && !/undefined|NaN/.test(s), `raw string ${k}`);
}
for (const k of PROMPT_KEYS) {
  for (const l of ['en', 'vi']) {
    ok(Array.isArray(I.raw(l, k)) && I.raw(l, k).length === 3, `${l} ${k} has 3 wordings`);
    ok(I.has(l, k + '.first'), `${l} ${k}.first exists`);
  }
}
ok(I.has('en', 'p.any') && I.raw('en', 'p.any').length === 3, 'p.any fallback');
// DESIGN §6 key list
const DESIGN_KEYS = ['drag', 'honk', 'thanks', 'party', 'hint', 'idle', 'praise', 'great', 'roadDone', 'poke', 'session.done',
  'weather.0', 'weather.1', 'weather.2', 'weather.3', 'surprise.mouse', 'mouse.tap', 'surprise.bird', 'bird.tap', 'surprise.snow',
  'snow.tap', 'odd', 'even', 'talk.intro', 'talk.right', 'talk.wrong.any', 'wrong.hint', 'right.one', 'right.more', 'right.all',
  'wipe', 'load', 'back', 'reverse', 'fork'].concat(TOPICS.map(t => 'topic.' + t));
for (let i = 0; i <= 20; i++) DESIGN_KEYS.push('count.' + i);
for (const k of DESIGN_KEYS) ok(I.has('en', k) && I.has('vi', k), `key ${k} exists`);
// every ui.* key the page uses (index.html, ui.js, main.js, render.js)
const UI_NEEDED = new Set(['ui.title', 'ui.logo1', 'ui.logo2', 'ui.subtitle', 'ui.tagline', 'ui.play', 'ui.playAgain', 'ui.home',
  'ui.paused', 'ui.resume', 'ui.settings', 'ui.holdForParents', 'ui.age', 'ui.years', 'ui.language', 'ui.name', 'ui.namePlaceholder',
  'ui.sound', 'ui.music', 'ui.volume', 'ui.quieter', 'ui.louder', 'ui.voice', 'ui.mic', 'ui.done', 'ui.stars', 'ui.chapter',
  'ui.allDone', 'ui.welcome', 'ui.micUnsupported', 'ui.micDenied', 'ui.voiceMissing', 'ui.tapOrSay', 'ui.listening', 'ui.tapTupi',
  'ui.tapHint', 'ui.doorHint', 'ui.skip', 'ui.gallery', 'ui.langName.en', 'ui.langName.vi']);
for (const f of ['index.html', 'js/ui.js', 'js/main.js', 'js/render.js']) {
  const p = path.join(ROOT, 'game', f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/['"](ui\.[A-Za-z]+(?:\.[a-z]+)?)['"]/g)) if (!/ui\.(tapNim)$/.test(m[1])) UI_NEEDED.add(m[1]);
}
for (const k of UI_NEEDED) ok(I.has('en', k) && I.has('vi', k), `ui key ${k} exists in both languages`);

section('titles, Tupi, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.title'), 'Tupi’s Bakery Delivery', 'EN title');
eq(I.t('vi', 'ui.title'), 'Voi Tupi Giao Bánh Ngọt', 'VI title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Tupi’s / Bakery Delivery', 'EN logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Voi Tupi / Giao Bánh Ngọt', 'VI logo lines');
eq(I.t('en', 'ui.voice'), 'Tupi’s voice', 'ui.voice EN');
eq(I.t('vi', 'ui.voice'), 'Giọng của Tupi', 'ui.voice VI');
eq(I.t('en', 'ui.volume') + '/' + I.t('vi', 'ui.volume'), 'Volume/Âm lượng', 'ui.volume');
eq(I.t('en', 'honk', null, r0) + ' / ' + I.t('vi', 'honk', null, r0), 'Toot toot! / Bim bim!', 'honk');
eq(I.t('en', 'thanks', null, r0) + ' / ' + I.t('vi', 'thanks', null, r0), 'Thank you! / Cảm ơn Tupi!', 'thanks');
eq(I.t('en', 'party', null, r0), 'Hooray, all delivered!', 'party EN');
eq(I.t('en', 'drag', null, r0), 'Hold Tupi’s cart and drive along the road!', 'drag hint EN (DESIGN §6)');
eq(I.t('vi', 'drag', null, r0), 'Bé giữ xe của Tupi rồi chạy theo con đường nhé!', 'drag hint VI (DESIGN §6)');
eq(['weather.0', 'weather.1', 'weather.2', 'weather.3'].map(k => I.raw('en', k)[0]).join(' '), 'Spring in the bakery! Sunny summer! Windy autumn! Snowy winter!', 'weather lines (DESIGN §6)');
eq(['weather.0', 'weather.1', 'weather.2', 'weather.3'].map(k => I.raw('vi', k)[0]).join(' '), 'Mùa xuân ở tiệm bánh! Mùa hè nắng đẹp! Mùa thu lộng gió! Mùa đông có tuyết!', 'VI weather lines');
eq(I.t('en', 'odd') + I.t('en', 'even') + I.t('vi', 'odd') + I.t('vi', 'even'), 'OddEvenLẻChẵn', 'odd / even words for the tiles');
const NO_DIACRITIC_OK = /^(ui\.langName\.en|count\.\d+|honk)$/;
for (const k of viKeys) {
  if (NO_DIACRITIC_OK.test(k)) continue;
  const all = [].concat(I.raw('vi', k));
  ok(all.some(s => VI_DIACRITIC.test(s)) || /^ui\.(done|logo1)$/.test(k), `vi ${k} has diacritics: ${all[0]}`);
  for (const s of all) { const text = s.replace(/\{\w+\}/g, ''); if (text.replace(/[^\p{L}]/gu, '').length > 12) ok(VI_DIACRITIC.test(text), `vi ${k} wording has diacritics: ${s}`); }
}
ok(I.raw('vi', 'count.1') === 'Một!' && I.raw('vi', 'count.4') === 'Bốn!', 'vi count words with tones');
for (const k of PROMPT_KEYS) for (const s of I.raw('vi', k).concat(I.raw('vi', k + '.first'))) ok(/(nhé|nào|nhỉ|\bbé\b|Bé)/.test(s), `vi ${k} is warm (bé / nhé / nào / nhỉ): ${s}`);
for (const k of enKeys) for (const s of [].concat(I.raw('en', k), I.raw('vi', k))) { ok(positive(s), `positive raw ${k}: ${s}`); ok(clean(s), `no river words raw ${k}: ${s}`); }
ok(/Tupi/.test(I.t('en', 'ui.welcome')) && /voi Tupi/.test(I.t('vi', 'ui.welcome')), 'welcome names Tupi (VI "voi Tupi")');

// ------------------------------------------------------------------ prompts
section('prompts: DESIGN examples, every prompt key × value × first × wording × child');
eq(I.ask('en', 'p.colors', { color: 'red', treat: 'cupcake' }, { rng: r0 }), 'Take the red cupcake to the red house!', 'DESIGN p.colors EN');
eq(I.ask('vi', 'p.colors', { color: 'red', treat: 'cupcake' }, { rng: r0 }), 'Bé chở bánh cupcake màu đỏ đến ngôi nhà màu đỏ nhé!', 'DESIGN p.colors VI');
eq(I.ask('en', 'p.colors', { color: 'red', treat: 'cupcake' }, { first: true }), 'Ding! A red cupcake is ready! Drive it to the RED house!', 'DESIGN first EN');
eq(I.ask('en', 'p.colors', { color: 'orange', treat: 'donut' }, { first: true }), 'Ding! An orange donut is ready! Drive it to the ORANGE house!', 'first EN with "An"');
eq(I.ask('vi', 'p.colors', { color: 'red', treat: 'cupcake' }, { first: true }), 'Ting! Bánh cupcake màu đỏ xong rồi! Bé chở đến ngôi nhà màu ĐỎ nhé!', 'REQUIREMENT first VI');
eq(I.ask('en', 'p.count', { n: 3 }, { rng: r0 }), 'Take 3 cookies to house number 3!', 'DESIGN p.count EN');
eq(I.ask('vi', 'p.count', { n: 3 }, { rng: r0 }), 'Bé chở 3 cái bánh quy đến nhà số 3 nhé!', 'REQUIREMENT p.count VI ("cái bánh quy")');
eq(I.ask('en', 'p.count', { n: 1 }, { rng: r0 }), 'Take 1 cookie to house number 1!', 'p.count singular');
eq(I.ask('en', 'p.animal', { animal: 'cow' }, { rng: r0 }), 'Take the cow to her friend!', 'DESIGN p.animal EN');
eq(I.ask('vi', 'p.animal', { animal: 'cow' }, { rng: r0 }), 'Bé chở con bò đến nhà bạn bò nhé!', 'p.animal VI ("con bò")');
eq(I.ask('en', 'p.home', { animal: 'penguin' }, { rng: r0 }), 'Take the penguin home!', 'DESIGN p.home EN');
eq(I.ask('vi', 'p.home', { animal: 'penguin' }, { rng: r0 }), 'Đưa chim cánh cụt về nhà nào!', 'DESIGN p.home VI');
eq(I.ask('en', 'p.size', { big: true }, { rng: r0 }), 'Take the big cake to the big house!', 'p.size EN');
eq(I.ask('en', 'p.size', { big: true }, { first: true }), 'Ding! A BIG cake is ready! Take it to the big house!', 'p.size first EN (BIG)');
eq(I.ask('vi', 'p.size', { big: false }, { rng: r0 }), 'Bé chở bánh kem nhỏ đến ngôi nhà nhỏ nhé!', 'p.size VI');
eq(I.ask('en', 'p.shapes', { shape: 'oval' }, { first: true }), 'Ding! An oval cookie is ready! Drive it to the oval house!', 'p.shapes first "An oval"');
eq(I.ask('en', 'p.add', { a: 2, b: 3 }, { rng: r0 }), 'Take 2 + 3 to the house with the answer!', 'p.add from {a, b}');
eq(I.ask('en', 'p.sub', { text: '7−4' }, { rng: r0 }), 'Take 7 − 4 to the house with the answer!', 'p.sub from {text}');
eq(I.ask('en', 'p.sub', { cargo: { kind: 'tile', text: '9-2' } }, { rng: r0 }), 'Take 9 − 2 to the house with the answer!', 'p.sub from a cargo thing');
eq(I.ask('en', 'p.initial', { animal: 'duck' }, { rng: r0 }), 'Listen: duck! Drive to its first letter!', 'p.initial EN (word, never the letter)');
eq(I.ask('vi', 'p.initial', { cargo: { kind: 'animal', animal: 'cow' } }, { rng: r0 }), 'Bé nghe nè: bò! Bé chạy đến chữ cái đầu tiên nhé!', 'p.initial VI bare word');
eq(I.ask('en', 'p.lower', { letter: 'B' }, { rng: r0 }), 'Take big B to small b!', 'p.lower');
eq(I.ask('en', 'p.initial', {}, { rng: r0, cargo: { kind: 'treat', obj: 'jelly', color: 'red' } }), 'Listen: jelly! Drive to its first letter!', 'p.initial {} + opts.cargo (DESIGN: p.initial has no params)');
eq(I.ask('vi', 'p.colors', {}, { rng: r0, cargo: { kind: 'treat', obj: 'donut', color: 'pink' } }), 'Bé chở bánh donut màu hồng đến ngôi nhà màu hồng nhé!', 'p.colors from opts.cargo');
eq(I.ask('en', 'p.colors', {}, { rng: r0 }), 'Drive the cart to a house!', 'missing params → p.any');
eq(I.ask('vi', 'p.nope', null, { rng: r0 }), 'Bé chạy xe đến một ngôi nhà nhé!', 'unknown key → p.any');
const PROMPT_VALUES = {
  'p.colors': COLORS.flatMap(c => TREATS.concat([undefined]).map(t => ({ color: c, treat: t }))),
  'p.shapes': SHAPES.map(s => ({ shape: s })), 'p.shapes5': SHAPES.map(s => ({ shape: s, color: 'pink' })),
  'p.size': [{ big: true }, { big: false }],
  'p.count': Array.from({ length: 12 }, (_, i) => ({ n: i + 1 })),
  'p.animal': ANIMALS.map(a => ({ animal: a })), 'p.home': ANIMALS.map(a => ({ animal: a })),
  'p.letters': LETTERS.map(l => ({ letter: l })), 'p.lower': LETTERS.map(l => ({ letter: l })),
  'p.initial': ANIMALS.map(a => ({ animal: a })).concat(TREATS.map(t => ({ treat: t })), TREATS.map(t => ({ cargo: { kind: 'treat', obj: t } }))),
  'p.add': [[1, 1], [2, 3], [9, 1], [8, 11]].map(([a, b]) => ({ a, b })),
  'p.sub': [[3, 1], [10, 4], [7, 7]].map(([a, b]) => ({ a, b, op: '−' })).concat([{ expr: '6-2' }]),
  'p.oddeven': [{}, { n: 7 }]
};
let nPrompts = 0;
for (const k of PROMPT_KEYS) for (const l of ['en', 'vi']) for (const p of PROMPT_VALUES[k]) for (const first of [false, true])
  for (const rng of RNGS) for (const child of ['', 'Mai']) {
    const s = I.ask(l, k, Object.assign({ child }, p), { first, rng });
    nPrompts++;
    good(s, `${l} ${k} ${JSON.stringify(p)} first=${first}`);
    ok(!/Drive the cart to a house|Bé chạy xe đến một ngôi nhà/.test(s), `${l} ${k} ${JSON.stringify(p)} renders its own wording (not p.any)`);
    if (/^p\.(letters|lower)$/.test(k)) ok(s.indexOf(p.letter) >= 0, `${k} names the letter`);
    if (k === 'p.initial') ok(!/(^|[^\p{L}])\p{Lu}(?!\p{L})/u.test(s), `p.initial never says a single letter: ${s}`);
    if (k === 'p.count') ok(s.indexOf(String(p.n)) >= 0, 'p.count names the number');
  }
ok(nPrompts > 3000, `swept ${nPrompts} prompts`);

// ------------------------------------------------------------------ names
section('names for every kind × value (DESIGN §6)');
for (const l of ['en', 'vi']) {
  for (const c of COLORS) { ok(I.name(l, 'color', c) && I.name(l, 'hue', c), `${l} color ${c}`); }
  for (const s of SHAPES) { ok(I.name(l, 'shape', s) && I.name(l, 'shapes', s), `${l} shape ${s}`); }
  for (const t of TREATS.concat(['cake', 'cookie'])) { ok(I.name(l, 'treat', t) !== t || l === 'en', `${l} treat ${t}`); eq(I.name(l, 'obj', t), I.name(l, 'treat', t), `obj alias ${t}`); }
  for (const a of ANIMALS) for (const k of ['animal', 'animals', 'word', 'who']) ok(I.name(l, k, a) && I.name(l, k, a) !== a + '?', `${l} ${k} ${a}`);
  for (const h of HOMES) for (const k of ['home', 'homeAt']) ok(I.name(l, k, h), `${l} ${k} ${h}`);
  for (let n = 0; n <= 20; n++) ok(I.name(l, 'number', n) && !/\d/.test(I.name(l, 'number', n)), `${l} number ${n} in words`);
  for (const s of SEASONS) ok(I.name(l, 'season', s), `${l} season ${s}`);
}
for (const k of Object.keys(VI_NAMES)) for (const v of Object.keys(VI_NAMES[k])) eq(I.name('vi', k, v), VI_NAMES[k][v], `vi ${k} ${v}`);
eq(I.name('en', 'treat', 'cakepop'), 'cake pop', 'EN cake pop');
eq(I.name('vi', 'cookies', 3), '3 cái bánh quy', 'vi cookies "cái bánh quy"');
eq(I.name('en', 'cookies', 1) + ' / ' + I.name('en', 'cookies', 4), '1 cookie / 4 cookies', 'EN cookies plural');
eq(I.name('vi', 'dots', 4), '4 chấm', 'vi dots');
eq(I.name('vi', 'season', 2), 'mùa thu', 'season by index');
eq(I.name('en', 'lives', 'penguin'), 'lives on the ice', 'lives');
eq(I.name('vi', 'sum', '2+3'), 'hai cộng ba', 'vi sum words');
eq(I.name('en', 'tile', '@odd') + '/' + I.name('vi', 'tile', '@even'), 'odd/chẵn', 'tile odd / even');
eq(I.name('vi', 'thing', { kind: 'treat', obj: 'cupcake', color: 'red' }), 'bánh cupcake màu đỏ', 'vi thing treat + colour after the noun');
eq(I.name('en', 'thing', { kind: 'shape', shape: 'star', color: 'red' }), 'red star cookie', 'EN shape cookie');
eq(I.name('vi', 'thing', { kind: 'shape', shape: 'star', color: 'red' }), 'bánh quy ngôi sao màu đỏ', 'VI shape cookie');
eq(I.phrase('en', { kind: 'treat', obj: 'cake', big: false }, { art: 'a' }), 'a little cake', 'EN little cake');
eq(I.phrase('vi', { kind: 'animal', animal: 'fishbowl' }, { who: true }), 'bạn cá vàng', 'VI who fishbowl');
// houses (the sign over the door)
const HOUSE_EX = [
  [{ kind: 'blob', color: 'blue' }, 'the blue house', 'nhà màu xanh dương'],
  [{ kind: 'shape', shape: 'heart', color: 'yellow' }, 'the heart house', 'nhà trái tim'],
  [{ kind: 'dots', n: 4, numeral: true }, 'house number 4', 'nhà số 4'],
  [{ kind: 'tile', text: 'B' }, 'the house with letter B', 'nhà chữ B'],
  [{ kind: 'tile', text: 'b' }, 'the house with small b', 'nhà chữ b thường'],
  [{ kind: 'tile', text: '7' }, 'house number 7', 'nhà số 7'],
  [{ kind: 'tile', text: '@odd' }, 'the odd house', 'nhà số lẻ'],
  [{ kind: 'animal', animal: 'cow' }, 'the cow’s house', 'nhà bạn bò'],
  [{ kind: 'home', home: 'ice' }, 'the ice house', 'nhà ở xứ băng'],
  [{ kind: 'treat', obj: 'cake', big: true }, 'the big house', 'nhà to']
];
for (const [s, en, vi] of HOUSE_EX) { eq(I.house('en', s), en, 'house EN ' + JSON.stringify(s)); eq(I.house('vi', s), vi, 'house VI ' + JSON.stringify(s)); eq(I.name('vi', 'house', s), vi, 'name(house)'); }
eq(I.house('en', { kind: 'treat', obj: 'cupcake', color: 'red' }, 'color'), 'the red house', 'house by rule colour');
for (const l of ['en', 'vi']) for (const s of [{}, null, { kind: 'zzz' }]) eq(I.house(l, s), '', 'house of nothing is empty');

section('initial(): first letter of the bare noun, both languages (content.js initial topic)');
for (const l of ['en', 'vi']) {
  for (const a of ANIMALS) {
    eq(I.initial(l, { kind: 'animal', animal: a }), INITIAL[l][a], `${l} initial ${a}`);
    eq(I.name(l, 'initial', { kind: 'animal', animal: a }), INITIAL[l][a], `${l} name(initial) thing ${a}`);
    eq(I.name(l, 'initial', a), INITIAL[l][a], `${l} name(initial) value ${a}`);
  }
  for (const t of TREATS) {
    eq(I.initial(l, { kind: 'treat', obj: t }), INITIAL[l][t], `${l} initial ${t}`);
    eq(I.name(l, 'initial', { kind: 'treat', obj: t, color: 'red' }), INITIAL[l][t], `${l} name(initial) ${t}`);
    // content.js's own rule (strip classifier + diacritics from name()) gives the same letter
    const nm = I.name(l, 'treat', t), bare = I.stripClassifier(l, nm);
    eq(I.stripMarks(bare).charAt(0).toUpperCase(), INITIAL[l][t], `${l} classifier rule on name("${nm}")`);
  }
}
eq(I.name('en', 'initial', 'B'), 'B', 'name(initial) of a letter is the letter');
eq(I.stripClassifier('vi', 'con bò'), 'bò', 'strip con');
eq(I.stripClassifier('vi', 'bánh cupcake'), 'cupcake', 'strip bánh');
eq(I.stripClassifier('vi', 'chim cánh cụt'), 'chim cánh cụt', 'no classifier kept');
eq(I.bareWord('vi', { kind: 'animal', animal: 'hen' }), 'gà mái', 'bare gà mái');

// ------------------------------------------------------------------ words()
section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
const WORD_SETS = { color: COLORS, shape: SHAPES, size: ['big', 'small'], treat: TREATS.concat(['cake', 'cookie']), animal: ANIMALS,
  home: HOMES, parity: ['odd', 'even'], season: SEASONS };
for (const l of ['en', 'vi']) {
  for (const kind of Object.keys(WORD_SETS)) {
    const vals = WORD_SETS[kind], owner = {};
    for (const v of vals) {
      const w = I.words(l, kind, v);
      ok(Array.isArray(w) && w.length > 0 && w.every(x => typeof x === 'string' && x && !/undefined|NaN/.test(x)), `${l} words ${kind} ${v} non-empty`);
      ok(w.every(x => x === x.toLowerCase()), `${l} words ${kind} ${v} lower-case`);
      for (const x of w) {
        ok(w.includes(I.stripMarks(x)) || x.startsWith('='), `${l} ${kind} ${v}: stripped form of "${x}"`);
        if (owner[x] && owner[x] !== v) ok(false, `${l} ${kind}: "${x}" shared by ${owner[x]} and ${v}`);
        owner[x] = v;
      }
    }
    // the matcher picks every value back from its name (with and without diacritics)
    const choices = vals.map(v => ({ id: v, words: I.words(l, kind, v) }));
    for (const v of vals) {
      const nm = (kind === 'treat' ? I.name(l, 'treat', v) : I.words(l, kind, v)[0]).toLowerCase();
      eq(V.match([nm], choices, l), v, `${l} match ${kind} "${nm}"`);
      eq(V.match([I.stripMarks(nm)], choices, l), v, `${l} match ${kind} stripped "${I.stripMarks(nm)}"`);
    }
  }
  for (let n = 0; n <= 20; n++) {
    const w = I.words(l, 'number', n);
    ok(w.includes(String(n)), `${l} number ${n}: digits accepted`);
    ok(w.length >= 2, `${l} number ${n}: word forms`);
  }
  const nums = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, words: I.words(l, 'number', i + 1) }));
  for (let n = 1; n <= 12; n++) {
    eq(V.match([I.numberName(l, n)], nums, l), n, `${l} match number word ${n}`);
    eq(V.match([String(n)], nums, l), n, `${l} match digit ${n}`);
  }
  for (const L of LETTERS) ok(I.words(l, 'letter', L).length >= 2, `${l} letter ${L} forms`);
}
eq(V.match(['ba cái bánh quy'], [2, 3, 4].map(n => ({ id: n, words: I.words('vi', 'cookies', n) })), 'vi'), 3, 'vi "ba cái bánh quy" → 3');
eq(V.match(['four cookies'], [3, 4, 5].map(n => ({ id: n, words: I.words('en', 'number', n) })), 'en'), 4, 'EN "four cookies" → 4');
eq(V.match(['banh cupcake'], TREATS.map(t => ({ id: t, words: I.words('vi', 'treat', t) })), 'vi'), 'cupcake', 'vi "banh cupcake" (no diacritics)');
eq(V.match(['a doughnut please'], TREATS.map(t => ({ id: t, words: I.words('en', 'treat', t) })), 'en'), 'donut', 'EN doughnut');
eq(V.match(['o xu bang'], HOMES.map(h => ({ id: h, words: I.words('vi', 'home', h) })), 'vi'), 'ice', 'vi "o xu bang" → ice');
eq(V.match(['mau xanh duong'], COLORS.map(c => ({ id: c, words: I.words('vi', 'color', c) })), 'vi'), 'blue', 'vi "mau xanh duong" → blue');
ok(I.choiceWords('vi', { id: 'x', thing: { kind: 'color', color: 'red' } }).includes('đỏ'), 'choiceWords of a Talk colour blob');
ok(I.choiceWords('en', { id: 'x', thing: { kind: 'tile', text: '@even' } }).includes('even'), 'choiceWords of an even tile');
ok(I.choiceWords('en', { id: 'x', thing: { kind: 'cookies', n: 5 } }).includes('5'), 'choiceWords of cookies');
ok(I.choiceWords('vi', { id: 'x', thing: { kind: 'treat', obj: 'jelly' } }).includes('thach'), 'choiceWords of a treat (stripped)');

const ch = (l, kind, vals) => vals.map(v => ({ id: v, words: I.words(l, kind, v) }));
const colEn = ch('en', 'color', COLORS);

// ------------------------------------------------------------------ game lines
section('game lines: DESIGN examples for sayRight / sayWrong / count');
const colorsEv = (sign, left) => ({ topic: 'colors', promptKey: 'p.colors', params: { color: 'red', treat: 'cupcake' }, sign, left });
eq(I.sayRight('en', colorsEv({ kind: 'blob', color: 'red' }, 1), r0), 'A red cupcake for the red house! One more!', 'DESIGN right colours EN + one more');
eq(I.sayRight('vi', colorsEv({ kind: 'blob', color: 'red' }, 0), r0), 'Bánh cupcake màu đỏ cho nhà màu đỏ! Giao hết bánh rồi!', 'right colours VI + all delivered');
eq(I.sayRight('en', colorsEv({ kind: 'blob', color: 'red' }), r0), 'A red cupcake for the red house!', 'no left → no tail');
eq(I.sayRight('en', colorsEv({ kind: 'blob', color: 'red' }, 2), r0), 'A red cupcake for the red house! More to deliver!', 'left 2 → "More to deliver!"');
eq(I.sayRight('en', { promptKey: 'p.count', cargo: { kind: 'cookies', n: 3 }, sign: { kind: 'dots', n: 3, numeral: true }, left: 0 }, r0),
  'Three cookies for house number 3! All delivered!', 'DESIGN right count EN');
eq(I.sayRight('vi', { promptKey: 'p.count', cargo: { kind: 'cookies', n: 3 }, sign: { kind: 'dots', n: 3 } }, r0), 'Ba cái bánh quy cho nhà số 3!', 'right count VI');
eq(I.sayRight('en', { promptKey: 'p.home', cargo: { kind: 'animal', animal: 'penguin' }, sign: { kind: 'home', home: 'ice' } }, r0), 'The penguin lives on the ice!', 'DESIGN right home');
eq(I.sayRight('vi', { promptKey: 'p.home', params: { animal: 'fishbowl' }, home: 'sea' }, r0), 'Bạn cá vàng sống ở biển!', 'right home VI from params + e.home');
eq(I.sayRight('en', { promptKey: 'p.animal', cargo: { kind: 'animal', animal: 'cow' }, sign: { kind: 'animal', animal: 'cow' } }, r0), 'The cow found her friend!', 'right animal');
eq(I.sayRight('en', { promptKey: 'p.initial', cargo: { kind: 'animal', animal: 'horse' }, sign: { kind: 'tile', text: 'H' } }, r0), 'A horse! Horse starts with H!', 'right initial');
eq(I.sayRight('vi', { promptKey: 'p.initial', cargo: { kind: 'treat', obj: 'macaron' }, sign: { kind: 'tile', text: 'M' } }, r5), 'Đúng rồi! Macaron bắt đầu bằng chữ M!', 'right initial VI treat');
eq(I.sayRight('en', { promptKey: 'p.add', cargo: { kind: 'tile', text: '2+3' }, sign: { kind: 'tile', text: '5' } }, r0), '2 + 3 makes 5!', 'right add');
eq(I.sayRight('en', { promptKey: 'p.oddeven', cargo: { kind: 'cookies', n: 7 }, sign: { kind: 'tile', text: '@odd' } }, r0), '7 is odd!', 'right parity');
eq(I.sayRight('en', { promptKey: 'p.size', params: { big: true }, sign: { kind: 'treat', obj: 'cake', big: true } }, r0), 'A big cake for the big house!', 'right size');
eq(I.sayRight('en', { promptKey: 'p.letters', params: { letter: 'B' }, sign: { kind: 'tile', text: 'B' } }, r0), 'Letter B for the house with letter B!', 'right letters');
eq(I.sayRight('vi', { promptKey: 'p.lower', params: { letter: 'G' }, sign: { kind: 'tile', text: 'g' } }, r0), 'Chữ G cho nhà chữ g thường!', 'right lower VI');
eq(I.sayWrong('en', colorsEv({ kind: 'blob', color: 'blue' }), r0), 'This is the blue house. The cupcake is red!', 'DESIGN wrong colours EN');
eq(I.sayWrong('vi', colorsEv({ kind: 'blob', color: 'blue' }), r0), 'Đây là nhà màu xanh dương. Bánh cupcake này màu đỏ cơ!', 'wrong colours VI');
eq(I.sayWrong('en', { promptKey: 'p.count', cargo: { kind: 'cookies', n: 2 }, got: { nameKind: 'number', nameValue: 4 } }, r0), 'This is house number 4. We have 2 cookies!', 'DESIGN wrong count (house from got)');
eq(I.sayWrong('en', { promptKey: 'p.home', params: { animal: 'penguin' }, sign: { kind: 'home', home: 'farm' } }, r0), 'This is the farm house. The penguin lives on the ice!', 'wrong home teaches the home');
eq(I.sayWrongHint('en', colorsEv({ kind: 'blob', color: 'blue' }), r0), 'This is the blue house. Look at the glowing road!', 'wrong + hint');
eq(I.sayCount('en', 1) + I.sayCount('vi', 1) + I.sayCount('en', 12), 'One!Một!Twelve!', 'sayCount');
eq(I.sayCountRun('en', 3) + ' ' + I.sayCountRun('vi', 3) + ' ' + I.sayCountRun('en', 1) + ' ' + I.sayCountRun('vi', 4, 'dots'), 'Three cookies! Ba cái bánh quy! One cookie! Bốn chấm!', 'sayCountRun');
eq(I.countList('vi', 3), 'Một, hai, ba!', 'countList');
eq(I.sayName('en', { kind: 'treat', obj: 'jelly', color: 'green' }), 'the green jelly', 'sayName');
for (const l of ['en', 'vi']) for (const e of [null, undefined, {}, { left: 0 }, { promptKey: 'p.colors' }, { got: {} }, { topic: 'count' }]) {
  good(I.sayRight(l, e, r5), `${l} sayRight ${JSON.stringify(e)}`);
  good(I.sayWrong(l, e, r5), `${l} sayWrong ${JSON.stringify(e)}`);
  good(I.sayWrongHint(l, e, r5), `${l} sayWrongHint ${JSON.stringify(e)}`);
}

section('a synthetic map per topic: right line of every order, wrong line of every other house (sign / got only / params only)');
// house signs + orders per DESIGN §5.1
function mapsFor(topic, l) {
  const M = [];
  const add = (promptKey, params, cargo, signs, target) => M.push({ promptKey, params, cargo, signs, target });
  switch (topic) {
    case 'colors':
      COLORS.forEach((c, i) => add('p.colors', { color: c, treat: TREATS[i % 5] }, { kind: 'treat', obj: TREATS[i % 5], color: c },
        [c, COLORS[(i + 2) % 7], COLORS[(i + 4) % 7]].map(x => ({ kind: 'blob', color: x })), 0));
      break;
    case 'shapes':
      SHAPES.forEach((s, i) => add('p.shapes', { shape: s }, { kind: 'shape', shape: s, color: 'yellow' },
        [s, SHAPES[(i + 3) % 8]].map(x => ({ kind: 'shape', shape: x, color: 'yellow' })), 0));
      SHAPES.forEach((s, i) => add('p.shapes5', { shape: s }, { kind: 'shape', shape: s, color: 'green' },
        [s, SHAPES[(i + 2) % 8], SHAPES[(i + 5) % 8]].map((x, j) => ({ kind: 'shape', shape: x, color: COLORS[j] })), 0));
      break;
    case 'size':
      [true, false].forEach(b => add('p.size', { big: b }, { kind: 'treat', obj: 'cake', big: b },
        [b, !b].map(x => ({ kind: 'treat', obj: 'cupcake', big: x })), 0));
      break;
    case 'count':
      for (let n = 1; n <= 12; n++) add('p.count', { n }, { kind: 'cookies', n },
        [n, n === 12 ? 10 : n + 1, n === 1 ? 3 : n - 1].map(x => ({ kind: 'dots', n: x, numeral: true })), 0);
      break;
    case 'animals':
      ANIMALS.forEach((a, i) => add('p.animal', { animal: a }, { kind: 'animal', animal: a },
        [a, ANIMALS[(i + 1) % 12], ANIMALS[(i + 5) % 12]].map(x => ({ kind: 'animal', animal: x })), 0));
      ANIMALS.forEach(a => add('p.home', { animal: a }, { kind: 'animal', animal: a },
        [HOME[a]].concat(HOMES.filter(h => h !== HOME[a]).slice(0, 3)).map(h => ({ kind: 'home', home: h })), 0));
      break;
    case 'letters':
      LETTERS.forEach((L, i) => add('p.letters', { letter: L }, { kind: 'tile', text: L },
        [L, LETTERS[(i + 7) % 26], LETTERS[(i + 13) % 26]].map(x => ({ kind: 'tile', text: x })), 0));
      break;
    case 'lower':
      LETTERS.forEach((L, i) => add('p.lower', { letter: L }, { kind: 'tile', text: L },
        [L, LETTERS[(i + 9) % 26]].map(x => ({ kind: 'tile', text: x.toLowerCase() })), 0));
      break;
    case 'initial': {
      const pics = ANIMALS.map(a => ({ kind: 'animal', animal: a })).concat(TREATS.map(t => ({ kind: 'treat', obj: t, color: 'pink' })));
      pics.forEach(p => {
        const f = I.initial(l, p), other = f === 'Z' ? 'Y' : String.fromCharCode(f.charCodeAt(0) + 1);
        add('p.initial', p.animal ? { animal: p.animal } : { treat: p.obj }, p, [f, other].map(x => ({ kind: 'tile', text: x })), 0);
      });
      break;
    }
    case 'add':
      [[1, 2], [3, 4], [5, 5], [9, 9]].forEach(([a, b]) => add('p.add', { a, b }, { kind: 'tile', text: a + '+' + b },
        [a + b, a + b + 1, a + b - 1].map(x => ({ kind: 'tile', text: String(x) })), 0));
      break;
    case 'sub':
      [[5, 2], [9, 4], [10, 10]].forEach(([a, b]) => add('p.sub', { a, b, op: '−' }, { kind: 'tile', text: a + '−' + b },
        [a - b, a - b + 2].map(x => ({ kind: 'tile', text: String(x) })), 0));
      break;
    case 'oddeven':
      for (let n = 2; n <= 10; n++) add('p.oddeven', { n }, { kind: 'cookies', n },
        [n % 2 ? '@odd' : '@even', n % 2 ? '@even' : '@odd'].map(x => ({ kind: 'tile', text: x })), 0);
      break;
  }
  return M;
}
const GOT = s => {
  switch (s.kind) {
    case 'blob': return { nameKind: 'color', nameValue: s.color };
    case 'shape': return { nameKind: 'shape', nameValue: s.shape };
    case 'treat': return { nameKind: 'size', nameValue: s.big ? 'big' : 'small' };
    case 'dots': return { nameKind: 'number', nameValue: s.n };
    case 'animal': return { nameKind: 'animal', nameValue: s.animal };
    case 'home': return { nameKind: 'home', nameValue: s.home };
    case 'tile': return /^@/.test(s.text) ? { nameKind: 'parity', nameValue: s.text.slice(1) } : (/^\d+$/.test(s.text) ? { nameKind: 'number', nameValue: +s.text } : { nameKind: 'letter', nameValue: s.text });
  }
  return {};
};
let nLines = 0;
for (const topic of TOPICS) for (const l of ['en', 'vi']) for (const m of mapsFor(topic, l)) {
  const base = { topic, promptKey: m.promptKey, params: m.params };
  for (const rng of RNGS) {
    for (const left of [undefined, 0, 1, 2]) {
      const variants = [Object.assign({}, base, { sign: m.signs[m.target], cargo: m.cargo, left }),
        Object.assign({}, base, { sign: m.signs[m.target], left }),                                  // cargo rebuilt from params
        Object.assign({}, base, { got: GOT(m.signs[m.target]), cargo: m.cargo, left })];             // house rebuilt from got
      for (const e of variants) {
        const s = I.sayRight(l, e, rng); nLines++;
        good(s, `${l} right ${m.promptKey} ${JSON.stringify(e.sign || e.got)}`);
        ok(!/^(Delivered! Yes!|You got it!|Yes! Here you go!|Giao xong rồi!|Bé giỏi quá!|Đúng rồi! Của bạn đây!)/.test(s) || topic === 'none',
          `${l} right ${m.promptKey} names the delivery: ${s}`);
        if (topic === 'initial') ok(s.indexOf(I.initial(l, m.cargo)) >= 0, `initial right line says the letter: ${s}`);
      }
    }
    m.signs.forEach((sg, j) => {
      if (j === m.target) return;
      for (const streak of [1, 2, 3]) {
        const variants = [Object.assign({}, base, { sign: sg, cargo: m.cargo, streak }), Object.assign({}, base, { got: GOT(sg), streak }),
          Object.assign({}, base, { sign: sg, want: GOT(m.signs[m.target]), streak })];
        for (const e of variants) {
          const s = I.sayWrong(l, e, rng), h = I.sayWrongHint(l, e, rng); nLines += 2;
          good(s, `${l} wrong ${m.promptKey} ${JSON.stringify(sg)}`);
          good(h, `${l} wrongHint ${m.promptKey} ${JSON.stringify(sg)}`);
          ok(/^(This is|Look, this is|Knock knock! This is|Đây là|Ồ, đây là|Cốc cốc! Đây là)/.test(s), `${l} wrong names the house first: ${s}`);
          ok(s.split(/[.!?]/).filter(x => x.trim()).length >= 2, `${l} wrong also gives the goal: ${s}`);
        }
      }
    });
  }
}
ok(nLines > 10000, `swept ${nLines} right / wrong lines`);

section('the other game lines');
for (const l of ['en', 'vi']) for (const k of ['drag', 'honk', 'thanks', 'party', 'hint', 'idle', 'praise', 'great', 'roadDone', 'wipe',
  'load', 'back', 'reverse', 'fork', 'poke', 'surprise.mouse', 'mouse.tap', 'surprise.bird', 'bird.tap', 'surprise.snow', 'snow.tap',
  'weather.0', 'weather.1', 'weather.2', 'weather.3', 'right.one', 'right.more', 'right.all', 'wrong.hint', 'wrong.any', 'goal.any'])
  for (const rng of RNGS) for (const child of ['', 'Mai']) {
    const s = I.t(l, k, { child }, rng);
    good(s, `${l} ${k}`);
    if (!child) ok(!/friend!|Mai/.test(s) || k === 'thanks' || k === 'right.friend', `${l} ${k}: no child placeholder without a name: ${s}`);
  }
I.setChild('Mai');
ok(I.t('en', 'ui.welcome') === 'Hi Mai! I am Tupi. Let’s deliver some treats!', 'welcome with the child name');
ok(I.t('vi', 'great', null, r0) === 'Bé Mai giỏi quá!', 'great with the child name (vi)');
I.setChild('');
ok(I.t('vi', 'great', null, r0) === 'Giao bánh giỏi quá!', 'no name → {child} wordings skipped');
for (const l of ['en', 'vi']) for (const stars of [0, 1, 12, 48]) good(I.t(l, 'session.done', { stars }, r5), `${l} session.done ${stars}`);
for (const l of ['en', 'vi']) for (let n = 1; n <= 4; n++) good(I.t(l, 'ui.chapter', { n }) + '. ' + I.t(l, 'topic.' + TOPICS[n]), `${l} chapter banner`);
for (const l of ['en', 'vi']) for (const t of TOPICS) good(I.t(l, 'topic.' + t), `${l} topic ${t}`);

section('talk');
const TALKS = [['talk.colors', {}], ['talk.colorsWhich', { color: 'green' }], ['talk.shapes', { shape: 'star' }], ['talk.size', { size: 'small' }],
  ['talk.count', { n: 4 }], ['talk.animals', { animal: 'lion' }], ['talk.home', { animal: 'fishbowl' }], ['talk.who', { animal: 'cow' }],
  ['talk.letters', { letter: 'M' }], ['talk.lower', { letter: 'Q' }], ['talk.initial', { letter: 'C', nameKind: 'animal', nameValue: 'cow' }],
  ['talk.initial', { nameKind: 'treat', nameValue: 'donut' }], ['talk.add', { a: 4, b: 5 }], ['talk.sub', { a: 9, b: 3 }], ['talk.oddeven', { parity: 'odd' }],
  ['talk.shapes', {}], ['talk.home', {}], ['talk.add', {}], ['talk.intro', {}], ['talk.right', {}]];
for (const l of ['en', 'vi']) for (const [k, p] of TALKS) good(I.t(l, k, p, r5), `${l} ${k} ${JSON.stringify(p)}`);
eq(I.t('en', 'talk.count'), 'How many cookies?', 'talk.count is about cookies');
eq(I.t('vi', 'talk.initial', { letter: 'B', nameKind: 'animal', nameValue: 'cow' }), 'Bò bắt đầu bằng chữ gì nhỉ?', 'talk.initial VI never says the letter');
eq(I.t('en', 'talk.home', { animal: 'penguin' }), 'Where does the penguin live?', 'talk.home');
const TW = [[{ kind: 'color', color: 'red' }, null, 'It is red! Good try!'], [{ kind: 'shape', shape: 'oval' }, null, 'It is an oval! Good try!'],
  [{ kind: 'number', n: 4 }, { topic: 'count' }, 'There are 4 cookies! Good try!'], [{ kind: 'number', n: 1 }, { topic: 'count' }, 'There is 1 cookie! Good try!'],
  [{ kind: 'home', home: 'ice' }, { show: { kind: 'animal', animal: 'penguin' } }, 'The penguin lives on the ice! Good try!'],
  [{ kind: 'home', home: 'sea' }, null, 'It lives in the sea! Good try!'], [{ kind: 'animal', animal: 'cow' }, null, 'It is the cow! Good try!'],
  [{ kind: 'size', big: true }, null, 'It is the big one! Good try!'], [{ kind: 'tile', text: 'b' }, null, 'It is small b! Good try!'],
  [{ kind: 'tile', text: 'B' }, null, 'It is the letter B! Good try!'], [{ kind: 'tile', text: '7' }, null, 'It is 7! Good try!'],
  [{ kind: 'treat', obj: 'donut' }, null, 'It is a donut! Good try!'], [{ kind: 'tile', text: '@even' }, null, 'It is even! Good try!']];
for (const [c, ctx, want] of TW) eq(I.talkWrong('en', { id: 'x', thing: c }, ctx), want, 'talkWrong ' + JSON.stringify(c));
eq(I.talkWrong('vi', { id: 'x', thing: { kind: 'number', n: 3 } }, { topic: 'count' }), 'Có 3 cái bánh quy đó! Bé cố gắng lắm!', 'talkWrong VI cookies');
for (const l of ['en', 'vi']) for (const [c, ctx] of TW) good(I.talkWrong(l, { id: 'x', thing: c }, ctx), `${l} talkWrong`);
for (const l of ['en', 'vi']) for (const x of [null, {}, { kind: 'zzz' }]) good(I.talkWrong(l, x), `${l} talkWrong of nothing`);

// ------------------------------------------------------------------ content.js (the delivery world) when it exists
(function () {
  const sbc = makeSandbox();
  sbc.BD = {};
  let C = null;
  try { load(sbc, ['rng.js', 'i18n.js', 'content.js']); C = sbc.BD.Content; } catch (e) { C = null; }
  let probe = null;
  try { probe = C && C.makeRound('colors', { age: 4, lang: 'en', rng: new sbc.BD.RNG(1), roundIndex: 1, level: 0 }); } catch (e) { probe = null; }
  if (!probe || !Array.isArray(probe.houses) || !Array.isArray(probe.orders)) {
    warn++; console.log('WARN  content.js is not the delivery version yet (no houses / orders): its rounds are not rendered here');
    return;
  }
  section('content.js: every prompt / Talk key / house / order it produces');
  const ages = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'], 5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
  let n = 0;
  for (const age of Object.keys(ages)) for (const topic of ages[age]) for (const lang of ['en', 'vi']) for (let ri = 0; ri < 4; ri++) {
    let r;
    try { r = C.makeRound(topic, { age: +age, lang, rng: new sbc.BD.RNG(1000 + ri * 7 + (+age)), roundIndex: ri, level: 1 }); }
    catch (e) { warn++; console.log(`WARN  content.makeRound(${topic}, age ${age}, ${lang}) threw: ${e.message}`); continue; }
    const byId = {}; r.houses.forEach(h => { byId[h.id] = h; });
    r.orders.forEach((o, oi) => {
      const e = { topic, promptKey: o.promptKey, params: o.params, cargo: o.cargo, count: o.count };
      good(I.ask(lang, o.promptKey, o.params || {}, { first: ri === 0 }), `content ${lang} ${topic} ask ${o.promptKey} ${JSON.stringify(o.params)}`);
      ok(!/Drive the cart to a house|Bé chạy xe đến một ngôi nhà/.test(I.ask(lang, o.promptKey, o.params || {})), `content ${lang} ${o.promptKey} ${JSON.stringify(o.params)} has its own wording`);
      const tgt = byId[o.target];
      ok(!!tgt, `content order target exists (${topic})`);
      if (tgt) good(I.sayRight(lang, Object.assign({ sign: tgt.sign, left: r.orders.length - oi - 1 }, e)), `content ${lang} right ${topic}`);
      r.houses.forEach(h => { if (h.id !== o.target) good(I.sayWrong(lang, Object.assign({ sign: h.sign, streak: 1 }, e)), `content ${lang} wrong ${topic}`); });
      r.houses.forEach(h => ok(!!I.house(lang, h.sign), `content ${lang} house named: ${JSON.stringify(h.sign)}`));
      n++;
    });
    try {
      const tk = C.makeTalk(topic, { age: +age, lang, rng: new sbc.BD.RNG(77 + ri) });
      good(I.t(lang, tk.promptKey, tk.params || {}), `content ${lang} talk ${tk.promptKey}`);
      tk.choices.forEach(c => { ok(I.choiceWords(lang, c).length > 0, `content talk choice words ${JSON.stringify(c.thing)}`); good(I.talkWrong(lang, c, tk), `content talkWrong ${topic}`); });
    } catch (e2) { warn++; console.log(`WARN  content.makeTalk(${topic}) threw: ${e2.message}`); }
  }
  ok(n > 50, `rendered ${n} content orders`);
})();

// ------------------------------------------------------------------ speech text
section('speech text: letters, maths, pauses, caps, loan words, "Tupi"');
eq(I.speech('en', 'Take letter B to the house with letter B!'), 'Take letter bee to the house with letter bee!', 'EN letter names');
eq(I.speech('en', 'Take big A to small a!'), 'Take big ay to small ay!', 'EN big / small letters');
eq(I.speech('en', 'Horse starts with H!'), 'Horse starts with aitch!', 'EN starts with');
eq(I.speech('en', 'Take 2 + 3 to the house! 7 − 4 makes 3!'), 'Take 2 plus 3 to the house! 7 minus 4 makes 3!', 'EN maths');
eq(I.speech('en', 'Drive it to the RED house!'), 'Drive it to the red house!', 'caps emphasis lowered');
eq(I.speech('en', 'Lots of colours… look!'), 'Lots of colours, look!', 'ellipsis → pause');
eq(I.speech('en', 'Tupi’s cart'), 'Tupi’s cart', '"Tupi" as written');
eq(I.speech('vi', 'Bé chở chữ B đến nhà chữ b thường nhé!'), 'Bé chở chữ bờ đến nhà chữ bờ thường nhé!', 'VI letter names');
eq(I.speech('vi', 'Ting! Bánh cupcake màu ĐỎ, bánh donut và bánh macaron!'), 'Ting! Bánh cắp kếch màu đỏ, bánh đô nắt và bánh ma ca rông!', 'VI loan words + caps');
eq(I.speech('vi', '{a} 4 + 5 bằng mấy?'.replace('{a} ', '')), '4 cộng 5 bằng mấy?', 'VI maths');
eq(I.speech('vi', 'Mình là voi Tupi.'), 'Mình là voi Tupi.', 'VI "Tupi" as written');

section('input: drag pointer layer — (x, y, ev) in logical px, ONE finger, extra fingers ignored');
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
  sb4.BD = {};
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
  sb7.BD = {};
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

  // coalesced samples (120 Hz iPad / Pencil): every sample in order, the event's own point last, capped per event
  const cc = new El('canvas'), cmv = [];
  IN.attach(cc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down() {}, move: (x, y) => cmv.push(x + ',' + y), up() {} });
  cc.emit('pointerdown', pe(1, 0, 0));
  const co = pe(1, 30, 3, { getCoalescedEvents() { return [{ clientX: 10, clientY: 1 }, { clientX: 20, clientY: 2 }, { clientX: 30, clientY: 3 }]; } });
  cc.emit('pointermove', co);
  eq(cmv.join(' '), '10,1 20,2 30,3', 'coalesced pointer samples → one move each, in order');
  cmv.length = 0;
  const many = []; for (let k = 1; k <= 40; k++) many.push({ clientX: k, clientY: 0 });
  cc.emit('pointermove', pe(1, 40, 0, { getCoalescedEvents() { return many; } }));
  eq(cmv.length, IN.MAX_COALESCED, 'a flood of coalesced samples is capped at MAX_COALESCED (' + IN.MAX_COALESCED + ')');
  eq(cmv[cmv.length - 1], '40,0', 'the last move is the event point');
  cmv.length = 0;
  cc.emit('pointermove', pe(1, 50, 0, { getCoalescedEvents() { throw new Error('nope'); } }));
  eq(cmv.join(' '), '50,0', 'getCoalescedEvents throwing → the plain point');
  cmv.length = 0;
  cc.emit('pointermove', pe(1, 60, 0, { getCoalescedEvents() { return []; } }));
  eq(cmv.join(' '), '60,0', 'empty coalesced list → the plain point');
  cc.emit('pointerup', pe(1, 60, 0));
  // a drag-and-steer: press on the cart, 90 moves along a curve, release — the stream arrives complete
  const dr = new El('canvas'), drs = [];
  IN.attach(dr, { toLogical: (cx, cy) => ({ x: cx / 2, y: cy / 2 }), down: (x, y) => drs.push(['d', x, y]), move: (x, y) => drs.push(['m', x, y]),
    up: (x, y) => drs.push(['u', x, y]), cancel: () => drs.push(['c']) });
  dr.emit('pointerdown', pe(77, 200, 1200));
  for (let k = 1; k <= 90; k++) dr.emit('pointermove', pe(77, 200 + Math.sin(k / 15) * 300, 1200 - k * 10));
  dr.emit('pointerup', pe(77, 200, 300));
  ok(drs.length === 92 && drs[0][0] === 'd' && drs[91][0] === 'u' && drs.slice(1, 91).every(c => c[0] === 'm' && isFinite(c[1]) && isFinite(c[2])),
    'drag along a curve: down + 90 moves + up, all finite logical px');
  ok(drs.slice(2, 91).every((c, k) => c[2] < drs[k + 1][2]), 'drag moves keep their order');

  // touch fallback (no PointerEvent): extra finger ignored; swallowed touchend recovers
  const sb5 = makeSandbox({ addEventListener() {}, removeEventListener() {} });
  sb5.BD = {};
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
  sb6.BD = {};
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
ok(sb.BD.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into BD.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof BD.Input.attach === 'function' && typeof BD.Input.kidProof === 'function' && typeof BD.Input.holdButton === 'function',
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
  sbx.BD = {};
  env.BD = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.BD.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Tupi: rate 0.9, pitch 1.2');
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
  // vi: "Tupi" goes to TTS as written, letter names + loan words are rewritten; the speech-bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là voi Tupi. Bé chở chữ B và bánh cupcake đến nhà nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là voi Tupi. Bé chở chữ bờ và bánh cắp kếch đến nhà nhé!', 'vi utterance: "Tupi" kept, "chữ bờ", "cắp kếch"');
  eq(startText, 'Mình là voi Tupi. Bé chở chữ B và bánh cupcake đến nhà nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animal', { animal: 'duck' }, { lang: 'vi' });
  ok(/^(Bé chở con vịt đến nhà bạn vịt nhé!|Con vịt muốn đi thăm bạn! Nhà bạn vịt ở đâu nhỉ\?|Bạn vịt đang chờ đó! Bé chở con vịt đến nhé!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read BD.debug.voiceLog)');
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
  E3.BD.__dummy = 0;
  Date.now = () => t0 + 8000;      // 8 s later the child taps
  E3.V.unlock();
  Date.now = realNow;
  await wait(150);
  ok(E3.texts().includes('Welcome!'), 'welcome line survives a slow first tap');
  E3.end(); await welcome;

  // throttle(name, ms): cooldown bookkeeping for repeatable lines (honk ≤ once per 2 s)
  { const realNow2 = Date.now; let tt = 1e6; Date.now = () => tt;
    ok(V2.throttle('honk', 2000), 'throttle: first honk allowed');
    tt += 500; ok(!V2.throttle('honk', 2000), 'throttle: honk 0.5 s later blocked');
    ok(V2.throttle('poke', 2000), 'throttle: names are independent');
    tt += 1600; ok(V2.throttle('honk', 2000), 'throttle: honk 2.1 s later allowed');
    V2.resetThrottle('honk'); ok(V2.throttle('honk', 2000), 'resetThrottle(name) clears it');
    Date.now = realNow2; }

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
