#!/usr/bin/env node
// Lolo's Jungle Leaf Match — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/monkey-jungle-leaves:   node tests/unit/i18n_voice.test.js
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
  return sb.LL;
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
const r0 = () => 0, r9 = () => 0.99;
const nWords = (s) => String(s).split(/\s+/).filter(w => w && w !== '—').length;
function clean(s) {
  return typeof s === 'string' && s.trim().length > 0 && s.indexOf('{') < 0 && s.indexOf('}') < 0 &&
    !/undefined|null|NaN|\[object/.test(s) && !/\s[!?.,]/.test(s) && !/^[!?.,]/.test(s);
}

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.LL = { debug: { voiceLog: [] } };
let LL;
try { LL = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = LL.I18N, V = LL.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js'])
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(JS, f), 'utf8')), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\bDM\.|Forest Memory|Đi'|\/\\bDee/.test(src), `${f} has no Dee / DM leftovers (namespace, title, spoken-name rule)`);
}

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'food', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const ANIMALS = ['panda', 'elephant', 'rabbit', 'squirrel', 'bee', 'bird', 'hippo', 'mouse'];   // DESIGN §6.1
const FOOD_OF = { panda: 'bamboo', elephant: 'peanut', rabbit: 'carrot', squirrel: 'acorn', bee: 'honey', bird: 'worm', hippo: 'watermelon', mouse: 'cheese' };
const FOODS = ANIMALS.map(a => FOOD_OF[a]);
const THINGS = ['butterfly', 'balloon', 'flower', 'kite', 'cup', 'boot'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const CRITTERS = ['toucan', 'frog', 'butterfly'];
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapLolo', 'years', 'skip', 'langName.en', 'langName.vi'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(TOPICS.map(k => 'p.' + k)).concat(['p.any'])
  .concat(CRITTERS.map(k => 'critter.' + k)).concat(CRITTERS.map(k => 'critter.' + k + '.tap'))
  .concat(['peek', 'hide', 'praise', 'great', 'cheer', 'swing', 'backflip', 'walk', 'wrong', 'miss', 'hint', 'idle', 'talk.intro',
    'talk.right', 'talk.wrong', 'talk.animalsAny', 'talk.foodAny', 'talk.colorsAny', 'session.done', 'say.countDone',
    'mismatch.two', 'mismatch.food', 'match.any', 'talk.wrong.food'])
  .concat(['color', 'thing', 'shape', 'shapeColor', 'animal', 'food', 'number', 'letter', 'capital', 'small', 'expr', 'word'].map(k => 'flip.' + k))
  .concat(['color', 'thing', 'colorMix', 'shape', 'animal', 'food', 'size', 'count', 'number', 'oddeven', 'letter', 'lower',
    'initial', 'math'].map(k => 'match.' + k))
  .concat(['star', 'light', 'bloom'].map(k => 'reward.' + k))
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
for (const k of Object.keys(I.PARAMS)) for (const lang of I.langs) ok(I.has(lang, k), `PARAMS key ${k} exists in ${lang}`);
// every key: the same {params} in both languages (in every variant together)
for (const k of I.keys('en')) {
  // English-only plural params ({plural}, {things}) are the same value as vi {name} / {thing} (Vietnamese has no plural)
  const PL = { '{plural}': '{name}', '{things}': '{thing}' };
  const ps = (l) => Array.from(new Set(([].concat(I.raw(l, k)).join(' ').match(/\{\w+\}/g) || []).filter(x => x !== '{child}')
    .map(x => PL[x] || x))).sort().join(',');
  eq(ps('vi'), ps('en'), `key ${k}: identical {params} in en and vi`);
}
// keys the game code asks for at run time
(function () {
  const files = ['main.js', 'ui.js', 'render.js', '../index.html'];
  const used = new Set();
  for (const f of files) {
    let src = '';
    try { src = fs.readFileSync(path.join(JS, f), 'utf8'); } catch (e) { continue; }
    src.replace(/['"`]((?:ui|talk|session|weather|topic|p|peek|hide|flip|match|mismatch|reward|critter|cheer|walk|swing|backflip|surprise)(?:\.[A-Za-z0-9.]*[A-Za-z0-9])?)['"`]/g,
      (m, k) => { if (/\./.test(k) || ['peek', 'hide', 'cheer', 'walk', 'swing', 'backflip'].includes(k)) used.add(k); return m; });
  }
  for (const k of used) for (const lang of I.langs) ok(I.has(lang, k), `key used by the game code exists: ${lang} ${k}`);
})();
// every I18N function Dee's main.js calls is still there
for (const fn of ['t', 'name', 'words', 'sayFlip', 'sayMatch', 'sayMismatch', 'setChild', 'talkWrong', 'sayCritter', 'cardPhrase',
  'sayCount', 'sayReward', 'speech', 'has', 'keys', 'raw']) ok(typeof I[fn] === 'function', `LL.I18N.${fn} exists`);

section('no leftovers from the city / giraffe game (or older forks)');
const ALL_TEXT = I.langs.map(l => I.keys(l).map(x => [].concat(I.raw(l, x)).join(' ')).join(' ')).join(' ');
const CITY_RE = /\b(windows?|shutters?|buildings?|streets?|giraffes?|pigeons?|bus|umbrellas?|kennel|rainbows?|necks?|cars?|homes?|lives)\b|cửa sổ|hươu|xe buýt|chim bồ câu|bồ câu|cầu vồng|con phố|ngôi nhà|cái ô|nhà chó|cao cổ/iu;
ok(!CITY_RE.test(ALL_TEXT.replace(/Home/g, '')), 'no city word in any line: ' + ((ALL_TEXT.replace(/Home/g, '').match(CITY_RE) || [])[0] || ''));
// the source too (comments, tables, keys) — except the JS global `window` and the 'ui.home' (Home button) key
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8').replace(/\bwindow\.|typeof window|window\s*:|'ui\.home'|Home\b|home[- ](screen|swipe)/g, '');
  const m = src.match(/\b(windows?|shutters?|buildings?|streets?|giraffes?|pigeons?|bus|umbrellas?|kennel|homes?|homeOf|Gigi)\b|cửa sổ|hươu|xe buýt|chim bồ câu/iu);
  ok(!m, `${f} has no city/giraffe leftover (${m && m[0]})`);
}
for (const k of ['Dee', 'vịt Dee', 'duckling', 'lantern', 'lily pad', 'fox', 'owl', 'hedgehog', 'autumn', 'winter', 'snow',
  'đèn lồng', 'lá sen', 'con cáo', 'con cú', 'tuyết', 'thẻ', 'card', 'Miu', 'kitten', 'farm', 'nông trại', 'dog', 'con chó', 'spider'])
  ok(ALL_TEXT.toLowerCase().indexOf(k.toLowerCase()) < 0, `no leftover wording "${k}"`);

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'cheer', 'swing', 'backflip', 'walk', 'miss', 'talk.right', 'peek', 'hide', 'match.any']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}
for (const lang of I.langs) for (const k of ['great', 'cheer', 'swing', 'backflip', 'walk', 'idle', 'talk.right', 'peek']) {
  const v = I.raw(lang, k);
  ok(v.some(s => s.includes('{child}')) && v.some(s => !s.includes('{child}')), `${lang} ${k} has name + no-name variants`);
}
eq(JSON.stringify(I.raw('en', 'walk')), JSON.stringify(I.raw('en', 'swing')), 'walk is an alias of swing (old main.js)');

section('Vietnamese wording sanity, titles');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'mau do', 'chiec la', 'con buom', 'gau truc'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
ok(/Bé ơi/.test(viAll) && /nhé!/.test(viAll) && /nào!/.test(viAll) && /giỏi quá!/.test(viAll), 'vi uses "Bé ơi", "nhé!", "nào!", "giỏi quá!"');
ok(/chiếc lá/.test(viAll) && /chấm tròn/.test(viAll) && /một đôi/i.test(viAll) && /khu rừng/.test(viAll), 'vi uses chiếc lá / chấm tròn / một đôi / khu rừng');
ok(!/Lolo đây|Lolo gì/.test(viAll), 'vi never says "Lolo đây" / "Lolo gì" (spoken "Lô Lô gì" sounds like "what")');
eq(I.t('en', 'ui.title'), 'Lolo’s Jungle Leaf Match', 'en title');
eq(I.t('vi', 'ui.title'), 'Khỉ Lolo Lật Lá Tìm Đôi', 'vi title');
eq(I.t('en', 'ui.logo1') + ' / ' + I.t('en', 'ui.logo2'), 'Lolo’s / Jungle Leaf Match', 'en logo lines');
eq(I.t('vi', 'ui.logo1') + ' / ' + I.t('vi', 'ui.logo2'), 'Khỉ Lolo / Lật Lá Tìm Đôi', 'vi logo lines');
eq(I.t('en', 'ui.voice'), 'Lolo’s voice', 'en ui.voice');
eq(I.t('vi', 'ui.voice'), 'Giọng của Lolo', 'vi ui.voice');
eq(I.t('en', 'ui.volume'), 'Volume', 'en ui.volume');
eq(I.t('vi', 'ui.volume'), 'Âm lượng', 'vi ui.volume');
eq(I.t('vi', 'ui.listening'), 'Lolo đang nghe…', 'vi listening');
eq(I.t('en', 'weather.0', {}, r0), 'Good morning, jungle!', 'weather 0 morning');
eq(I.t('en', 'weather.1', {}, r0), 'The sun is high — it’s noon!', 'weather 1 noon');
eq(I.t('en', 'weather.2', {}, r0), 'Look — the sun is setting!', 'weather 2 sunset');
eq(I.t('en', 'weather.3', {}, r0), 'Good night, stars! The fireflies are out.', 'weather 3 night');
eq(I.t('vi', 'weather.0', {}, r0), 'Chào buổi sáng, khu rừng!', 'vi weather 0 morning');
eq(I.t('vi', 'weather.2', {}, r0), 'Mặt trời lặn rồi kìa!', 'vi weather 2 sunset');
eq(I.t('vi', 'weather.3', {}, r0), 'Chúc ngủ ngon, các vì sao! Đom đóm ra chơi rồi.', 'vi weather 3 night');

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  ok(positive([].concat(I.raw(lang, k)).join(' ')), `${lang} ${k} has no negative words`);
}

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, stars: 7, child: 'Mai', answer: 'X', name: 'red', animal: 'panda', food: 'bamboo', color: 'red',
  thing: 'butterfly', things: 'butterflies', shape: 'star', size: 'big', letter: 'B', lower: 'b', text: 'B', word: 'panda', a: 2,
  b: 3, parity: 'odd', expr: '2 + 3', num: 'three', dots: 'dots', counted: 'one, two, three', plural: 'pandas', beast: 'panda',
  A: 'a panda', B: 'a carrot', friend: 'panda', meal: 'bamboo' };
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
eq(I.t('en', 'p.nosuchtopic', {}, r0), 'Find two leaves that match!', 'unknown prompt → p.any');
eq(I.t('vi', 'p.nosuchtopic', {}, r0), 'Bé ơi, tìm hai chiếc lá giống nhau nhé!', 'vi unknown prompt → p.any');
eq(I.t('en', 'p.homes', {}, r0), 'Find two leaves that match!', 'old topic homes → p.any');
ok(clean(I.t('en', null)) || I.t('en', null) === '', 't with a null key does not throw');

section('prompts, peek/hide, cheer/swing/backflip, critters, talk');
for (const lang of I.langs) for (const k of TOPICS.map(x => 'p.' + x).concat(['p.any'])) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length === 3 && new Set(v).size === 3, `${lang} ${k} has 3 different variants`);
  for (let i = 0; i < 3; i++) eq(I.t(lang, k, {}, () => (i + 0.5) / 3), I.t(lang, k, {}, () => (i + 0.5) / 3), `${lang} ${k}[${i}] is deterministic with an rng`);
}
for (const lang of I.langs) for (const k of CRITTERS.map(c => 'critter.' + c).concat(CRITTERS.map(c => 'critter.' + c + '.tap'),
  [0, 1, 2, 3].map(x => 'weather.' + x))) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length === 2, `${lang} ${k} has 2 variants`);
}
eq(I.t('en', 'p.colors', {}, r0), 'Find the colour pairs!', 'en p.colors');
eq(I.t('en', 'p.count', { n: 3 }, r0), 'Match the number with the dots!', 'en p.count ignores params');
eq(I.t('en', 'p.food', {}, r0), 'Who eats what? Find each animal’s favourite food!', 'en p.food (DESIGN §7)');
eq(I.t('vi', 'p.food', {}, r0), 'Ai thích ăn gì? Bé tìm món ăn cho các bạn nhé!', 'vi p.food');
eq(I.t('vi', 'p.any', {}, r0), 'Bé ơi, tìm hai chiếc lá giống nhau nhé!', 'vi p.any (REQUIREMENT line)');
eq(I.t('en', 'p.any', {}, r0), 'Find two leaves that match!', 'en p.any (REQUIREMENT line)');
eq(I.t('vi', 'p.animals', { animal: 'panda' }, r0), 'Bé ơi, tìm hai bạn thú giống nhau nhé!', 'vi p.animals');
for (const lang of I.langs) for (const t of TOPICS) for (const params of [undefined, null, {}, { n: 4 }, { color: 'red', shape: 'x' }, 'junk', 7]) {
  const s = I.t(lang, 'p.' + t, params);
  ok(clean(s) && s !== 'p.' + t && nWords(s) <= 12, `${lang} p.${t} renders with params ${JSON.stringify(params)}: ${s}`);
}
eq(I.t('en', 'peek', {}, r0), 'Look carefully!', 'en peek[0]');
eq(I.t('vi', 'peek', {}, r0), 'Bé nhìn kỹ nhé!', 'vi peek[0]');
eq(I.t('en', 'hide', {}, r0), 'Now they turn back!', 'en hide[0]');
eq(I.t('vi', 'hide', {}, r0), 'Lá lật lại rồi!', 'vi hide[0]');
eq(I.t('en', 'cheer', {}, r0), 'Every leaf is glowing!', 'en cheer[0] (DESIGN §7)');
eq(I.t('vi', 'cheer', {}, r0), 'Lá nào cũng sáng rồi!', 'vi cheer[0]');
eq(I.t('en', 'swing', {}, r0), 'Wheee! To the next tree!', 'en swing[0] (DESIGN §7)');
eq(I.t('vi', 'swing', {}, r0), 'Vút! Sang cây tiếp theo nào!', 'vi swing[0]');
eq(I.t('en', 'backflip', {}, r0), 'A backflip! Ta-da!', 'en backflip[0]');
eq(I.speech('en', I.t('en', 'backflip', {}, r0)), 'A backflip! Ta da!', 'en backflip speech: "Ta da"');
ok(I.raw('en', 'cheer').includes('What a happy tree, {child}!'), 'en "What a happy tree, {child}!"');
ok(I.raw('vi', 'cheer').includes('Cả cây sáng rực rồi, {child} giỏi quá!'), 'vi "Cả cây sáng rực rồi, {child} giỏi quá!"');
eq(I.t('vi', 'cheer', { child: 'Mai' }, () => 0.5), 'Cả cây sáng rực rồi, Mai giỏi quá!', 'vi cheer with the name');
for (const lang of I.langs) for (const c of CRITTERS) {
  const s1 = I.sayCritter(lang, c), s2 = I.sayCritter(lang, c, 'tap'), s3 = I.sayCritter(lang, { type: c, action: 'tap' });
  ok(clean(s1) && clean(s2) && clean(s3) && positive(s1 + ' ' + s2), `${lang} sayCritter ${c}: ${s1} / ${s2}`);
  ok(I.raw(lang, 'critter.' + c + '.tap').includes(s2) && I.raw(lang, 'critter.' + c).includes(s1), `${lang} sayCritter ${c} uses its keys`);
}
eq(I.sayCritter('en', 'toucan', 'tap', r0), 'Kraa! Bye bye, toucan!', 'en toucan tap "Kraa!"');
eq(I.sayCritter('en', 'frog', 'tap', r0), 'Ribbit! What a big jump!', 'en frog tap "Ribbit!"');
eq(I.sayCritter('vi', 'frog', null, r9), 'Ộp ộp! Bạn ếch đến rồi!', 'vi frog "Ộp ộp!"');
eq(I.sayCritter('vi', 'toucan', null, r0), 'Nhìn kìa! Bạn chim mỏ to đậu trên dây leo!', 'vi toucan');
ok(I.raw('en', 'praise').includes(I.sayCritter('en', 'ufo')), 'unknown critter → praise');
ok(I.raw('en', 'praise').includes(I.sayCritter('en', 'pigeon')), 'old critter pigeon → praise');
eq(I.t('en', 'talk.animals', { animal: 'panda' }), 'Where is the panda?', 'en talk.animals');
eq(I.t('vi', 'talk.animals', { animal: 'panda' }), 'Con gấu trúc đâu rồi nhỉ?', 'vi talk.animals');
eq(I.t('vi', 'talk.animals', { animal: { kind: 'animal', value: 'mouse' } }), 'Con chuột đâu rồi nhỉ?', 'vi talk.animals object param');
eq(I.t('en', 'talk.animals', { sound: 'bee' }), 'Where is the bee?', 'talk.animals from {sound: id}');
eq(I.t('en', 'talk.animals', { animal: 'animal_rabbit' }), 'Where is the bunny?', 'talk.animals from a sprite id (rabbit = bunny)');
eq(I.t('en', 'talk.animals', {}), 'Which animal is this?', 'talk.animals fallback');
eq(I.t('vi', 'talk.animals'), 'Đây là con gì nhỉ?', 'vi talk.animals fallback');
eq(I.t('en', 'talk.food', { animal: 'panda' }), 'What does the panda love to eat?', 'en talk.food (DESIGN §6.1)');
eq(I.t('vi', 'talk.food', { animal: 'panda', food: 'bamboo' }), 'Con gấu trúc thích ăn gì nhỉ?', 'vi talk.food');
eq(I.t('en', 'talk.food', {}), 'Which food is this?', 'en talk.food fallback');
eq(I.t('en', 'talk.colors', { obj: 'butterfly' }), 'What colour is this butterfly?', 'en talk.colors with the thing (REQUIREMENT)');
eq(I.t('vi', 'talk.colors', { thing: 'balloon' }), 'Quả bóng bay này màu gì nhỉ?', 'vi talk.colors with the thing');
eq(I.t('vi', 'talk.colors', { thing: 'flower' }), 'Bông hoa này màu gì nhỉ?', 'vi talk.colors bông hoa');
eq(I.t('en', 'talk.colors', {}), 'What colour is this?', 'en talk.colors without a thing');
eq(I.t('vi', 'talk.colors', { obj: 'zzz' }), 'Cái này màu gì nhỉ?', 'vi talk.colors with junk obj');
for (const lang of I.langs) for (const a of ANIMALS) {
  for (const k of ['talk.animals', 'talk.food']) {
    const s = I.t(lang, k, { animal: a });
    ok(s.toLowerCase().indexOf(I.name(lang, 'animal', a)) >= 0, `${lang} ${k} names ${a}: ${s}`);
  }
}
eq(I.t('en', 'talk.count'), 'How many dots?', 'en talk count');
eq(I.t('vi', 'talk.count'), 'Có mấy chấm tròn nào?', 'vi talk count');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Lolo. Let’s flip the jungle leaves!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Lolo. Let’s flip the jungle leaves!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Mình là khỉ con Lolo. Mình cùng lật lá nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Mình là khỉ con Lolo. Mình cùng lật lá nhé!', 'vi welcome with name');
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
  color: COLORS.concat(COLORS.map(c => ({ value: c, obj: 'butterfly' })), ['red:kite', 'boot_blue', 'flower_pink']),
  shape: ['circle', 'square', 'triangle', 'star', 'heart', 'rect'],
  size: ['big', 'small'],
  animal: ANIMALS,
  food: FOODS,
  thing: THINGS,
  parity: ['odd', 'even'],
  number: Array.from({ length: 21 }, (_, i) => i),
  dots: Array.from({ length: 12 }, (_, i) => i + 1),
  text: ['2 + 3', '7 − 2', '5', 'B', 'panda', 'bamboo'],
  word: [].concat(ANIMALS.map(a => 'animal_' + a))
};
const LETTERS = new Set(('ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'ĂÂĐÊÔƠƯ').split(''));
VALUES.letter = Array.from(LETTERS).concat(Array.from(LETTERS).map(c => c.toLowerCase()));
VALUES.sum = []; VALUES.diff = [];
for (let a = 1; a <= 19; a++) for (let b = 1; a + b <= 20; b++) VALUES.sum.push(a + '+' + b);
for (let a = 1; a <= 10; a++) for (let b = 0; b <= a; b++) VALUES.diff.push(a + '−' + b);
eq(I.NAME_KINDS.join(','), 'color,shape,size,animal,food,thing,number,dots,letter,text,sum,diff,parity,word', 'NAME_KINDS');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN §6.1');
eq(JSON.stringify(I.FOOD_OF), JSON.stringify(FOOD_OF), 'I18N.FOOD_OF = DESIGN §6.1');
eq(JSON.stringify(I.THINGS), JSON.stringify(THINGS), 'I18N.THINGS = DESIGN §6.1');
eq(JSON.stringify(I.CRITTERS), JSON.stringify(CRITTERS), 'I18N.CRITTERS');
ok(I.TOPICS.includes('food') && !I.TOPICS.includes('homes'), 'topic food replaces homes');
for (const k of I.NAME_KINDS) ok(VALUES[k], `test covers name kind ${k}`);
for (const lang of I.langs) {
  for (const kind of Object.keys(VALUES)) {
    for (const v of VALUES[kind]) {
      const n = I.name(lang, kind, v);
      ok(typeof n === 'string' && n.length > 0 && !/undefined|null|object/.test(n), `${lang} name ${kind} ${JSON.stringify(v)}: ${n}`);
      if (['color', 'shape', 'animal', 'food', 'thing', 'parity', 'size'].includes(kind) && lang === 'vi')
        ok(n !== v, `vi name ${kind} ${JSON.stringify(v)} is translated (${n})`);
      if (kind === 'sum' || kind === 'diff' || kind === 'dots') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
      const w = I.words(lang, kind, v);
      ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${JSON.stringify(v)}`);
      ok(w.every(x => typeof x === 'string' && x === x.toLowerCase()), `${lang} words ${kind} ${JSON.stringify(v)} are lower-case`);
      if (lang === 'vi' && kind !== 'letter' && !(kind === 'text' && /^\p{L}$/u.test(v))) ok(w.every(x => w.includes(I.stripMarks(x).toLowerCase())), `vi words ${kind} ${JSON.stringify(v)} include no-diacritic forms`);
      if (kind === 'number' || kind === 'dots') ok(w.includes(String(v)), `${lang} words ${kind} ${v} include the digit`);
      if (['animal', 'food', 'thing'].includes(kind)) ok(w.length >= 3, `${lang} words ${kind} ${v} has synonyms (${w.length})`);
    }
  }
  for (const e of sb.LL.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 1, `${lang} words for word ${e.word} include the animal forms`);
    const first = e.word.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').charAt(0).toUpperCase();
    ok(first === e.initial, `${lang} word ${e.word} starts with ${e.initial} (tone marks ignored)`);
  }
}
eq(sb.LL.WORDS.vi.map(w => w.word + w.initial).join(','), 'gấu trúcG,voiV,sócS,ongO,hà mãH', 'vi initial words (no ch/th digraphs, DESIGN §6.1)');
eq(sb.LL.WORDS.en.map(w => w.word + w.initial).join(','), 'pandaP,elephantE,rabbitR,squirrelS,beeB,birdB,hippoH,mouseM', 'en initial words');
const EN_ANIMAL = { panda: 'panda', elephant: 'elephant', rabbit: 'bunny', squirrel: 'squirrel', bee: 'bee', bird: 'bird', hippo: 'hippo', mouse: 'mouse' };
const VI_ANIMAL = { panda: 'con gấu trúc', elephant: 'con voi', rabbit: 'con thỏ', squirrel: 'con sóc', bee: 'con ong', bird: 'con chim', hippo: 'con hà mã', mouse: 'con chuột' };
const EN_FOOD = { bamboo: 'bamboo', peanut: 'peanuts', carrot: 'carrot', acorn: 'acorn', honey: 'honey', worm: 'worms', watermelon: 'watermelon', cheese: 'cheese' };
const VI_FOOD = { bamboo: 'cây tre', peanut: 'củ lạc', carrot: 'củ cà rốt', acorn: 'hạt dẻ', honey: 'mật ong', worm: 'con sâu', watermelon: 'dưa hấu', cheese: 'phô mai' };
const EN_THING = { butterfly: 'butterfly', balloon: 'balloon', flower: 'flower', kite: 'kite', cup: 'cup', boot: 'boot' };
const VI_THING = { butterfly: 'con bướm', balloon: 'quả bóng bay', flower: 'bông hoa', kite: 'con diều', cup: 'cái cốc', boot: 'chiếc ủng' };
for (const a of ANIMALS) { eq(I.name('en', 'animal', a), EN_ANIMAL[a], 'en animal ' + a); eq(I.name('vi', 'animal', a), VI_ANIMAL[a], 'vi animal ' + a); }
for (const h of FOODS) { eq(I.name('en', 'food', h), EN_FOOD[h], 'en food ' + h); eq(I.name('vi', 'food', h), VI_FOOD[h], 'vi food ' + h);
  eq(I.name('en', 'food', 'food_' + h), EN_FOOD[h], 'food from sprite id ' + h); }
for (const t of THINGS) { eq(I.name('en', 'thing', t), EN_THING[t], 'en thing ' + t); eq(I.name('vi', 'thing', t), VI_THING[t], 'vi thing ' + t); }
eq(I.name('en', 'color', { value: 'red', obj: 'butterfly' }), 'a red butterfly', 'en colour with obj');
eq(I.name('vi', 'color', { value: 'red', obj: 'butterfly' }), 'con bướm màu đỏ', 'vi colour with obj');
eq(I.name('en', 'color', { value: 'orange', obj: 'kite' }), 'an orange kite', 'en colour with obj: a → an');
eq(I.name('vi', 'color', { value: 'green', obj: 'flower' }), 'bông hoa màu xanh lá', 'vi green flower');
eq(I.name('vi', 'color', 'yellow:boot'), 'chiếc ủng màu vàng', 'vi colour "yellow:boot"');
eq(I.name('en', 'color', 'cup_purple'), 'a purple cup', 'en colour "cup_purple"');
eq(I.name('en', 'color', 'red'), 'red', 'en plain colour');
eq(I.name('vi', 'color', 'pink'), 'màu hồng', 'vi pink');
eq(I.name('en', 'animal', 'animal_hippo'), 'hippo', 'animal from sprite id');
eq(I.name('en', 'animal', 'bunny'), 'bunny', 'animal "bunny" alias');
eq(I.name('vi', 'shape', 'heart'), 'hình trái tim', 'vi heart');
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'en rect');
eq(I.name('en', 'size', 'small'), 'little', 'en small = little');
eq(I.name('en', 'size', 'rabbit_small'), 'little bunny', 'en size with animal');
eq(I.name('vi', 'size', 'big:elephant'), 'con voi to', 'vi size with animal');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('en', 'dots', 1), 'one dot', 'en dots 1');
eq(I.name('en', 'dots', 4), 'four dots', 'en dots 4');
eq(I.name('vi', 'dots', 3), 'ba chấm tròn', 'vi dots 3');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('vi', 'letter', 'Y'), 'i dài', 'vi letter Y');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('en', 'text', '2 + 3'), 'two plus three', 'text expression');
eq(I.name('vi', 'text', '5'), 'năm', 'text number');
eq(I.name('vi', 'text', 'bamboo'), 'cây tre', 'text food');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('en', 'parity', 7), 'seven', 'parity with a number value');
eq(I.name('vi', 'word', 'animal_elephant'), 'voi', 'vi word from sprite id');
eq(I.name('en', 'word', 'animal_rabbit'), 'rabbit', 'en word from sprite id (R for rabbit)');
ok(I.words('en', 'color', 'blue').includes('blew'), 'blue/blew');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'dots', 3).includes('three dots') && I.words('vi', 'dots', 3).includes('ba cham tron') && I.words('vi', 'dots', 3).includes('ba chấm'), 'dots words');
ok(I.words('en', 'dots', 3).includes('three berries'), 'dots words: "three berries"');
// DESIGN §7 accepted forms
ok(I.words('vi', 'animal', 'panda').includes('gấu trúc') && I.words('vi', 'animal', 'panda').includes('gau truc'), 'vi panda: gấu trúc / gau truc');
ok(I.words('vi', 'animal', 'hippo').includes('con hà mã') && I.words('vi', 'animal', 'hippo').includes('hà mã'), 'vi hippo: hà mã / con hà mã');
ok(I.words('en', 'animal', 'rabbit').includes('rabbit') && I.words('en', 'animal', 'rabbit').includes('bunny'), 'en rabbit/bunny');
ok(I.words('en', 'animal', 'mouse').includes('mice') && I.words('en', 'animal', 'hippo').includes('hippopotamus'), 'en mouse/mice, hippopotamus');
ok(I.words('vi', 'food', 'bamboo').includes('tre') && I.words('vi', 'food', 'bamboo').includes('lá tre'), 'vi bamboo: tre, lá tre');
ok(I.words('vi', 'food', 'peanut').includes('đậu phộng') && I.words('vi', 'food', 'peanut').includes('dau phong'), 'vi peanut: đậu phộng (southern)');
ok(I.words('en', 'food', 'peanut').includes('peanut') && I.words('en', 'food', 'worm').includes('worm'), 'en peanut/peanuts, worm/worms');
ok(I.words('vi', 'food', 'worm').includes('giun'), 'vi worm: giun');
ok(I.words('vi', 'thing', 'cup').includes('ly') && I.words('vi', 'thing', 'butterfly').includes('bươm bướm'), 'vi thing words: ly (southern), bươm bướm');
ok(I.words('vi', 'color', { value: 'red', obj: 'butterfly' }).includes('đỏ'), 'colour words with obj still accept the colour');
ok(I.words('vi', 'word', 'voi').includes('con voi') && I.words('vi', 'word', 'gấu trúc').includes('gau truc'), 'vi word accepts animal forms');
ok(I.words('en', 'size', 'small').includes('little') && I.words('en', 'size', 'small').includes('small'), 'size small words');
for (const lang of I.langs) for (const kind of I.NAME_KINDS) for (const v of [undefined, null, '', {}, 'zzz', -1, 999, { value: 'zz', obj: 'q' }]) {
  let n, w;
  try { n = I.name(lang, kind, v); w = I.words(lang, kind, v); } catch (e) { n = null; }
  ok(typeof n === 'string' && Array.isArray(w), `${lang} name/words ${kind} ${JSON.stringify(v)} do not throw`);
}

// ------------------------------------------------------------------ leaf lines
section('sayFlip: exact lines');
const card = (nameKind, nameValue, face) => ({ nameKind, nameValue, face: face || { kind: nameKind, value: nameValue } });
const thing = (c, o) => card('color', c, { kind: 'color', value: c, color: c, obj: o });
const foodCard = (h) => card('food', h, { kind: 'food', value: h, sprite: 'food_' + h, animal: Object.keys(FOOD_OF).find(a => FOOD_OF[a] === h) });
const animalCard = (a) => card('animal', a, { kind: 'animal', value: a, sprite: 'animal_' + a });
eq(I.sayFlip('en', card('color', 'red'), r0), 'Red!', 'en plain colour');
eq(I.sayFlip('vi', card('color', 'red'), r0), 'Màu đỏ!', 'vi plain colour');
eq(I.sayFlip('en', thing('red', 'butterfly'), r0), 'A red butterfly!', 'en colour thing (DESIGN §7)');
eq(I.sayFlip('en', thing('orange', 'flower'), r0), 'An orange flower!', 'en colour thing a → an');
eq(I.sayFlip('en', thing('blue', 'kite'), r9), 'Look, a blue kite!', 'en colour thing variant');
eq(I.sayFlip('vi', thing('red', 'butterfly'), r0), 'Con bướm màu đỏ!', 'vi con bướm (REQUIREMENT)');
eq(I.sayFlip('vi', thing('yellow', 'balloon'), r0), 'Quả bóng bay màu vàng!', 'vi quả bóng bay');
eq(I.sayFlip('vi', thing('green', 'flower'), r0), 'Bông hoa màu xanh lá!', 'vi bông hoa');
eq(I.sayFlip('vi', thing('purple', 'kite'), r0), 'Con diều màu tím!', 'vi con diều');
eq(I.sayFlip('vi', thing('blue', 'cup'), r0), 'Cái cốc màu xanh dương!', 'vi cái cốc');
eq(I.sayFlip('vi', thing('red', 'boot'), r9), 'Chiếc ủng màu đỏ nè!', 'vi chiếc ủng variant');
eq(I.sayFlip('en', card('shape', 'heart'), r0), 'A heart!', 'en shape');
eq(I.sayFlip('en', card('shape', 'heart', { kind: 'shape', shape: 'heart', color: 'red' }), r0), 'A red heart!', 'en shape with colour');
eq(I.sayFlip('vi', card('shape', 'star', { kind: 'shape', shape: 'star', color: 'blue' }), r0), 'Hình ngôi sao màu xanh dương!', 'vi shape with colour');
eq(I.sayFlip('en', card('dots', 1), r0), 'One dot!', 'en dots 1');
eq(I.sayFlip('en', card('dots', 3), r0), 'One, two, three dots!', 'en dots 3 counted');
eq(I.sayFlip('en', card('dots', 7), r0), 'Seven dots!', 'en dots 7 not counted');
eq(I.sayFlip('vi', card('dots', 3), r0), 'Một, hai, ba chấm tròn!', 'vi dots 3');
eq(I.sayFlip('en', { nameKind: 'dots', face: { kind: 'dots', n: 4 } }, r0), 'One, two, three, four dots!', 'dots n from face');
eq(I.sayFlip('en', card('number', 3), r0), 'Three!', 'en number');
eq(I.sayFlip('vi', card('number', 3), r0), 'Số ba!', 'vi number');
eq(I.sayFlip('en', animalCard('panda'), r0), 'A panda!', 'en animal');
eq(I.sayFlip('en', animalCard('elephant'), r0), 'An elephant!', 'en animal a → an');
eq(I.sayFlip('en', animalCard('rabbit'), r0), 'A bunny!', 'en rabbit says bunny');
eq(I.sayFlip('vi', animalCard('panda'), r0), 'Con gấu trúc!', 'vi animal');
eq(I.sayFlip('vi', animalCard('hippo'), r9), 'Con hà mã nè!', 'vi animal variant');
eq(I.sayFlip('en', foodCard('bamboo'), r0), 'Bamboo!', 'en food "Bamboo!" (DESIGN §7)');
eq(I.sayFlip('en', foodCard('carrot'), r0), 'A carrot!', 'en food carrot');
eq(I.sayFlip('en', foodCard('acorn'), r0), 'An acorn!', 'en food acorn');
eq(I.sayFlip('en', foodCard('peanut'), r9), 'Yum, peanuts!', 'en food variant');
eq(I.sayFlip('vi', foodCard('bamboo'), r0), 'Cây tre!', 'vi food');
eq(I.sayFlip('vi', foodCard('carrot'), r9), 'Củ cà rốt nè!', 'vi food variant (củ cà rốt)');
eq(I.sayFlip('en', Object.assign(foodCard('honey'), { topic: 'food' }), r0), 'Honey!', 'food leaf never names its animal');
eq(I.sayFlip('en', card('size', 'big', { kind: 'animal', sprite: 'animal_panda', scale: 1 }), r0), 'A big panda!', 'en size big');
eq(I.sayFlip('en', card('size', 'small', { kind: 'animal', sprite: 'animal_mouse', scale: 0.6 }), r0), 'A little mouse!', 'en size little');
eq(I.sayFlip('vi', card('size', 'small', { kind: 'animal', sprite: 'animal_elephant', scale: 0.6 }), r0), 'Con voi nhỏ!', 'vi size little');
eq(I.sayFlip('en', { nameKind: 'animal', nameValue: 'hippo', face: { kind: 'animal', scale: 1 }, topic: 'size' }, r0), 'A big hippo!', 'size topic, scale 1 → big');
eq(I.sayFlip('en', card('letter', 'B'), r0), 'The letter B!', 'en letter');
eq(I.speech('en', I.sayFlip('en', card('letter', 'B'), r0)), 'The letter bee!', 'en letter speech');
eq(I.sayFlip('vi', card('letter', 'B'), r0), 'Chữ B!', 'vi letter');
eq(I.speech('vi', I.sayFlip('vi', card('letter', 'B'), r0)), 'Chữ bờ!', 'vi letter phonics in speech');
eq(I.sayFlip('en', card('letter', 'b'), r0), 'Small letter b!', 'en small letter');
eq(I.sayFlip('vi', card('letter', 'b'), r0), 'Chữ b viết thường!', 'vi small letter');
eq(I.sayFlip('en', Object.assign(card('letter', 'B'), { topic: 'lower' }), r0), 'Big letter B!', 'en capital in lower topic');
eq(I.sayFlip('en', card('sum', '2+3'), r0), 'Two plus three!', 'en sum');
eq(I.sayFlip('vi', card('diff', '7−2'), r0), 'Bảy trừ hai!', 'vi diff');
eq(I.sayFlip('en', card('word', 'animal_rabbit'), r0), 'A rabbit!', 'en word leaf (initial R)');
eq(I.sayFlip('vi', card('word', 'voi', { kind: 'animal', sprite: 'animal_elephant' }), r0), 'Voi!', 'vi word leaf says the word (initial V)');
eq(I.sayFlip('vi', Object.assign(animalCard('panda'), { topic: 'initial' }), r0), 'Gấu trúc!', 'vi initial topic animal leaf says the word');
eq(I.sayFlip('en', card('parity', 7, { kind: 'parity', n: 7 }), r0), 'Seven!', 'parity leaf names the number');
eq(I.sayFlip('en', card('parity', 7, { kind: 'parity', n: 7, dots: true }), r0), 'Seven dots!', 'parity dots leaf counts');
eq(I.sayFlip('en', { face: { kind: 'animal', sprite: 'animal_bee' } }, r0), 'A bee!', 'face only (no nameKind)');
eq(I.sayFlip('en', { nameValue: 'squirrel' }, r0), 'A squirrel!', 'value only: guessed');
eq(I.sayFlip('en', { nameValue: 'cheese' }, r0), 'Cheese!', 'food value only: guessed');
eq(I.sayFlip('en', { face: { kind: 'food', sprite: 'food_worm' } }, r0), 'A worm!', 'food face sprite only');
ok(I.raw('en', 'praise').includes(I.sayFlip('en', {}, r0)), 'empty event → praise');
eq(I.sayTap, I.sayFlip, 'sayTap alias');

section('sayMatch: exact lines');
const pair = (topic, a, b, extra) => Object.assign({ topic, cardA: a, cardB: b, nameKind: a.nameKind, nameValue: a.nameValue }, extra || {});
eq(I.sayMatch('en', pair('colors', thing('red', 'butterfly'), thing('red', 'butterfly')), r0), 'Two red butterflies — a pair!', 'en colour things (REQUIREMENT)');
eq(I.sayMatch('vi', pair('colors', thing('red', 'butterfly'), thing('red', 'butterfly')), r0), 'Hai con bướm màu đỏ — một đôi!', 'vi colour things (REQUIREMENT)');
eq(I.sayMatch('vi', pair('colors', thing('yellow', 'balloon'), thing('yellow', 'balloon')), r9), 'Hai quả bóng bay màu vàng! Giỏi quá!', 'vi colour things variant');
eq(I.sayMatch('en', pair('colors', thing('orange', 'boot'), thing('orange', 'boot')), r0), 'Two orange boots — a pair!', 'en orange boots');
eq(I.sayMatch('en', pair('colors', thing('red', 'balloon'), thing('red', 'flower')), r0), 'A balloon and a flower — both red!', 'en age 5+: two things, one colour');
eq(I.sayMatch('vi', pair('colors', thing('red', 'balloon'), thing('red', 'flower')), r0), 'Quả bóng bay và bông hoa — cùng màu đỏ!', 'vi two things, one colour');
eq(I.sayMatch('en', pair('colors', thing('blue', 'butterfly'), thing('blue', 'kite')), r9), 'Both blue! A butterfly and a kite!', 'en colorMix variant');
eq(I.sayMatch('en', { nameKind: 'color', nameValue: 'red' }, r0), 'Red and red! A pair!', 'en plain colours');
eq(I.sayMatch('vi', { nameKind: 'color', nameValue: 'red' }, r9), 'Cùng màu đỏ! Một đôi rồi!', 'vi plain colours variant');
eq(I.sayMatch('en', { nameKind: 'color', nameValue: 'red', nameKindA: 'color', nameValueA: 'red', faceA: { kind: 'color', color: 'red', obj: 'cup' },
  nameKindB: 'color', nameValueB: 'red', faceB: { kind: 'color', color: 'red', obj: 'cup' } }, r0), 'Two red cups — a pair!', 'colour things via the World fields');
eq(I.sayMatch('en', pair('food', animalCard('panda'), foodCard('bamboo')), r0), 'The panda loves bamboo!', 'en food (DESIGN §7)');
eq(I.sayMatch('vi', pair('food', animalCard('panda'), foodCard('bamboo')), r0), 'Bạn gấu trúc thích ăn tre!', 'vi food (DESIGN §7)');
eq(I.sayMatch('en', pair('food', animalCard('bee'), foodCard('honey')), r0), 'The bee loves honey!', 'en bee (DESIGN §7)');
eq(I.sayMatch('vi', pair('food', foodCard('honey'), animalCard('bee')), r0), 'Bạn ong thích mật ong!', 'vi bee (DESIGN §7, food leaf first)');
eq(I.sayMatch('vi', pair('food', animalCard('rabbit'), foodCard('carrot')), r9), 'Măm măm! Bạn thỏ thích ăn cà rốt lắm!', 'vi food variant');
eq(I.sayMatch('en', { topic: 'food', animal: 'rabbit', food: 'carrot' }, r0), 'The bunny loves carrots!', 'food from ev.animal + ev.food');
eq(I.sayMatch('en', { topic: 'food', nameKind: 'animal', nameValue: 'squirrel' }, r0), 'The squirrel loves acorns!', 'food from topic + animal only');
eq(I.sayMatch('en', { food: 'cheese' }, r0), 'The mouse loves cheese!', 'food from ev.food only');
eq(I.sayMatch('en', { food: 'worm' }, r9), 'Yum! The bird loves worms!', 'bird loves worms');
for (const a of ANIMALS) for (const lang of I.langs) {
  const s = I.sayMatch(lang, Object.assign(pair('food', animalCard(a), foodCard(FOOD_OF[a])), { animal: a, food: FOOD_OF[a] }), r0);
  const bare = I.name(lang, 'animal', a).replace(/^con /, '');
  ok(s.toLowerCase().indexOf(bare) >= 0 && /loves|thích/.test(s), `${lang} food match ${a}: ${s}`);
}
eq(I.sayMatch('en', pair('animals', animalCard('panda'), animalCard('panda')), r0), 'Two pandas! A pair!', 'en animals');
eq(I.sayMatch('en', { nameKind: 'animal', nameValue: 'rabbit' }, r0), 'Two bunnies! A pair!', 'en animals (event fields only)');
eq(I.sayMatch('en', { nameKind: 'animal', nameValue: 'mouse' }, r0), 'Two mice! A pair!', 'en mouse plural');
eq(I.sayMatch('vi', { nameKind: 'animal', nameValue: 'squirrel' }, r0), 'Hai con sóc! Một đôi rồi!', 'vi animals');
eq(I.sayMatch('en', { nameKind: 'shape', nameValue: 'heart' }, r0), 'Two hearts! A pair!', 'en shapes');
eq(I.sayMatch('vi', { nameKind: 'shape', nameValue: 'star' }, r0), 'Hai hình ngôi sao! Một đôi rồi!', 'vi shapes');
eq(I.sayMatch('en', pair('count', card('number', 3), card('dots', 3)), r0), 'Three and three dots! A match!', 'en count');
eq(I.sayMatch('en', pair('count', card('number', 3), card('dots', 3)), r9), 'Three — one, two, three! A pair!', 'en count counted (REQUIREMENT line)');
eq(I.sayMatch('en', pair('count', card('number', 1), card('dots', 1)), r0), 'One and one dot! A match!', 'en count 1 (singular)');
eq(I.sayMatch('vi', pair('count', card('number', 3), card('dots', 3)), r0), 'Số ba và ba chấm tròn! Đúng một đôi!', 'vi count');
eq(I.sayMatch('vi', pair('count', card('number', 4), card('dots', 4)), r9), 'Bốn — một, hai, ba, bốn! Một đôi rồi!', 'vi count counted');
eq(I.sayMatch('en', { topic: 'count', nameKind: 'number', nameValue: 4 }, r0), 'Four and four dots! A match!', 'count from topic + nameValue');
eq(I.sayMatch('en', pair('oddeven', card('number', 7), card('dots', 7)), r0), 'Seven and seven dots! Seven is odd!', 'en oddeven');
eq(I.sayMatch('vi', pair('oddeven', card('number', 8), card('dots', 8)), r0), 'Số tám và tám chấm tròn! Tám là số chẵn!', 'vi oddeven');
eq(I.sayMatch('en', { nameKind: 'number', nameValue: 6, parity: 'even' }, r9), 'Six is even! A pair!', 'oddeven from ev.parity');
eq(I.sayMatch('en', pair('size', card('size', 'big', { kind: 'animal', sprite: 'animal_elephant', scale: 1 }), card('size', 'small', { kind: 'animal', sprite: 'animal_elephant', scale: 0.6 })), r0),
  'A big elephant and a little elephant! A pair!', 'en size');
eq(I.sayMatch('vi', { topic: 'size', nameKind: 'animal', nameValue: 'hippo' }, r0), 'Con hà mã to và con hà mã nhỏ! Một đôi rồi!', 'vi size');
eq(I.sayMatch('en', pair('letters', card('letter', 'B'), card('letter', 'B')), r0), 'Letter B and letter B! A pair!', 'en letters');
eq(I.sayMatch('vi', { nameKind: 'letter', nameValue: 'Ê' }, r0), 'Chữ Ê và chữ Ê! Một cặp rồi!', 'vi letters');
eq(I.sayMatch('en', pair('lower', card('letter', 'A'), card('letter', 'a')), r0), 'Big letter A and small letter a! A pair!', 'letter A is never "An"');
eq(I.sayMatch('vi', pair('lower', card('letter', 'G'), card('letter', 'g')), r0), 'Chữ G in hoa và chữ g thường! Một cặp rồi!', 'vi lower');
eq(I.speech('vi', 'Chữ G in hoa và chữ g thường! Một cặp rồi!'), 'Chữ gờ in hoa và chữ gờ thường! Một cặp rồi!', 'vi lower speech');
eq(I.sayMatch('en', pair('initial', card('letter', 'P'), card('animal', 'panda', { kind: 'animal', sprite: 'animal_panda' })), r0),
  'Panda starts with the letter P! A pair!', 'en initial');
eq(I.sayMatch('en', pair('initial', card('letter', 'R'), card('word', 'rabbit', { kind: 'animal', sprite: 'animal_rabbit' })), r0),
  'Rabbit starts with the letter R! A pair!', 'en initial rabbit (not "bunny")');
eq(I.sayMatch('vi', pair('initial', card('letter', 'V'), card('word', 'voi', { kind: 'animal', sprite: 'animal_elephant' })), r0),
  'Voi bắt đầu bằng chữ V! Một đôi rồi!', 'vi initial');
eq(I.sayMatch('vi', pair('initial', card('letter', 'G'), card('word', 'gấu trúc', { kind: 'animal', sprite: 'animal_panda' })), r0),
  'Gấu trúc bắt đầu bằng chữ G! Một đôi rồi!', 'vi initial (two-syllable word)');
eq(I.sayMatch('en', pair('add', card('sum', '2+3'), card('number', 5)), r0), 'Two plus three is five! A match!', 'en add');
eq(I.sayMatch('vi', pair('sub', card('number', 5), card('diff', '7−2')), r0), 'Bảy trừ hai bằng năm! Đúng rồi!', 'vi sub (answer leaf first)');
ok(I.raw('en', 'match.any').includes(I.sayMatch('en', {}, r0)), 'empty match → match.any');
ok(I.raw('en', 'match.any').includes(I.sayMatch('en', { topic: 'add', nameKind: 'number', nameValue: 5 }, r0)), 'add without the sum leaf → match.any');
const viaFields = [
  { cards: [animalCard('bee'), animalCard('bee')] },
  { nameKindA: 'animal', nameValueA: 'bee', nameKindB: 'animal', nameValueB: 'bee' },
  { nameA: { kind: 'animal', value: 'bee' }, nameB: { kind: 'animal', value: 'bee' } },
  { faceA: { kind: 'animal', sprite: 'animal_bee' }, faceB: { kind: 'animal', sprite: 'animal_bee' } },
  { nameA: 'bee', nameB: 'bee' }
];
for (const f of viaFields) eq(I.sayMatch('en', f, r0), 'Two bees! A pair!', 'match leaf fields ' + Object.keys(f).join(','));

section('sayMismatch: exact lines');
eq(I.sayMismatch('en', { cardA: animalCard('panda'), cardB: animalCard('mouse') }, r0), 'A panda and a mouse. Let’s look again!', 'en animals');
eq(I.sayMismatch('vi', { cardA: animalCard('panda'), cardB: animalCard('mouse') }, r0), 'Con gấu trúc và con chuột. Mình xem lại nhé!', 'vi animals');
eq(I.sayMismatch('en', { cardA: thing('red', 'butterfly'), cardB: thing('blue', 'kite') }, r0), 'A red butterfly and a blue kite. Let’s look again!', 'en colour things');
eq(I.sayMismatch('vi', { cardA: thing('red', 'butterfly'), cardB: thing('blue', 'kite') }, r0), 'Con bướm màu đỏ và con diều màu xanh dương. Mình xem lại nhé!', 'vi colour things');
eq(I.sayMismatch('en', { cardA: thing('orange', 'flower'), cardB: thing('yellow', 'flower') }, r0), 'An orange flower and a yellow flower. Let’s look again!', 'en an orange flower');
eq(I.sayMismatch('en', { nameKindA: 'color', nameValueA: 'red', nameKindB: 'color', nameValueB: 'blue' }, r0), 'Red and blue. Let’s look again!', 'en plain colours');
eq(I.sayMismatch('en', { cardA: thing('red', 'butterfly'), cardB: thing('red', 'kite') }, r0), 'A butterfly and a kite. Let’s look again!', 'en same colour: only the things (REQUIREMENT line)');
eq(I.sayMismatch('vi', { cardA: thing('red', 'butterfly'), cardB: thing('red', 'kite') }, r0), 'Con bướm và con diều. Mình xem lại nhé!', 'vi same colour (REQUIREMENT line)');
eq(I.sayMismatch('en', { cardA: card('number', 3), cardB: card('dots', 5) }, r0), 'Three and five dots. Let’s look again!', 'en count');
eq(I.sayMismatch('vi', { cardA: card('number', 3), cardB: card('dots', 1) }, r0), 'Số ba và một chấm tròn. Mình xem lại nhé!', 'vi count');
eq(I.sayMismatch('en', { topic: 'food', cardA: animalCard('panda'), cardB: foodCard('carrot') }, r0), 'A panda and a carrot. What does the panda love to eat?', 'en food: animal + other food');
eq(I.sayMismatch('vi', { topic: 'food', cardA: foodCard('cheese'), cardB: animalCard('rabbit') }, r0), 'Phô mai và con thỏ. Con thỏ thích ăn gì nhỉ?', 'vi food: food + animal');
eq(I.sayMismatch('en', { topic: 'food', cardA: animalCard('bee'), cardB: foodCard('bamboo') }, r9), 'A bee and some bamboo! Try two more leaves!', 'en food mismatch variant');
eq(I.sayMismatch('en', { topic: 'food', cardA: foodCard('acorn'), cardB: foodCard('worm') }, r0), 'An acorn and a worm. Let’s look again!', 'en two foods');
eq(I.sayMismatch('en', { cardA: card('shape', 'heart'), cardB: card('shape', 'circle') }, r9), 'A heart and a circle! Try two more leaves!', 'en shapes variant');
eq(I.sayMismatch('en', { topic: 'size', cardA: card('animal', 'panda', { kind: 'animal', scale: 1 }), cardB: card('animal', 'mouse', { kind: 'animal', scale: 0.6 }) }, r0),
  'A big panda and a little mouse. Let’s look again!', 'en size');
eq(I.sayMismatch('en', { cardA: card('letter', 'A'), cardB: card('letter', 'E') }, r0), 'Letter A and letter E. Let’s look again!', 'mismatch letter A');
eq(I.sayMismatch('vi', { cardA: card('sum', '2+3'), cardB: card('number', 4) }, r0), 'Hai cộng ba và số bốn. Mình xem lại nhé!', 'vi add');
ok(I.raw('en', 'wrong').includes(I.sayMismatch('en', { a: 'c1', b: 'c2', streak: 2 }, r0)), 'mismatch without names → wrong[]');
ok(I.raw('vi', 'wrong').includes(I.sayMismatch('vi', { cardA: animalCard('panda') }, r0)), 'mismatch with one leaf → wrong[]');
eq(I.cardPhrase('en', thing('orange', 'cup')), 'an orange cup', 'cardPhrase en');
eq(I.cardPhrase('vi', card('dots', 4)), 'bốn chấm tròn', 'cardPhrase vi');
eq(I.cardPhrase('en', foodCard('honey')), 'some honey', 'cardPhrase food');
eq(I.cardPhrase('vi', foodCard('peanut')), 'củ lạc', 'cardPhrase vi food');
eq(I.sayCorrect('en', animalCard('panda'), r0), 'A panda!', 'sayCorrect alias → sayFlip');
eq(I.sayWrong('en', { cardA: animalCard('panda'), cardB: animalCard('mouse') }, r0), 'A panda and a mouse. Let’s look again!', 'sayWrong alias → sayMismatch');

section('sayReward / sayCount');
for (const lang of I.langs) for (const k of ['star', 'light', 'bloom', 'butterfly', 'zzz', undefined]) {
  const s = I.sayReward(lang, { kind: k });
  ok(clean(s) && positive(s), `${lang} sayReward ${k}: ${s}`);
}
eq(I.sayCount('en', 2, 3), 'Two!', 'en count < need');
eq(I.sayCount('en', 3, 3), 'Three! Three dots!', 'en count done');
eq(I.sayCount('en', 1, 1), 'One! One dot!', 'en count done singular');
eq(I.sayCount('vi', 3, 3), 'Ba! Ba chấm tròn!', 'vi count done');
for (const lang of I.langs) for (let need = 1; need <= 12; need++) for (let n = 1; n <= need; n++) {
  const s = I.sayCount(lang, n, need);
  ok(clean(s) && positive(s), `${lang} sayCount ${n}/${need}: ${s}`);
}

// ------------------------------------------------------------------ synthetic rounds: every topic × values × field shapes
section('say* on many synthetic pair events (both languages)');
function synthPairs() {
  const P = [];   // [topic, cardA, cardB]
  const SH = ['circle', 'square', 'triangle', 'star', 'heart', 'rect'];
  for (const c of COLORS) P.push(['colors', card('color', c, { kind: 'color', value: c, color: c }), card('color', c, { kind: 'color', color: c })]);
  for (const c of COLORS) for (const o of THINGS) {
    P.push(['colors', thing(c, o), thing(c, o)]);
    P.push(['colors', thing(c, o), thing(c, THINGS[(THINGS.indexOf(o) + 1) % THINGS.length])]);
  }
  for (const s of SH) for (const c of COLORS.slice(0, 3)) P.push(['shapes', card('shape', s, { kind: 'shape', shape: s, color: c }), card('shape', s, { kind: 'shape', shape: s, color: COLORS[(COLORS.indexOf(c) + 2) % 7] })]);
  for (const a of ANIMALS) {
    P.push(['animals', animalCard(a), animalCard(a)]);
    P.push(['size', card('size', 'big', { kind: 'animal', sprite: 'animal_' + a, scale: 1 }), card('size', 'small', { kind: 'animal', sprite: 'animal_' + a, scale: 0.6 })]);
    P.push(['food', animalCard(a), foodCard(FOOD_OF[a])]);
  }
  for (let n = 1; n <= 12; n++) {
    P.push(['count', card('number', n, { kind: 'number', value: n, n }), card('dots', n, { kind: 'dots', n })]);
    P.push(['oddeven', card('parity', n, { kind: 'parity', n, parity: n % 2 ? 'odd' : 'even' }), card('parity', n, { kind: 'parity', n, dots: true, parity: n % 2 ? 'odd' : 'even' })]);
  }
  for (const L of 'ABCDEGHIKLMNOPQRSTUVXYĂÂĐÊÔƠƯ') {
    P.push(['letters', card('letter', L), card('letter', L)]);
    if (L !== 'I') P.push(['lower', card('letter', L), card('letter', L.toLowerCase())]);
  }
  for (const lang of ['en', 'vi']) for (const w of sb.LL.WORDS[lang])
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
    ok(!I.raw(lang, 'praise').includes(s), `${lang} sayFlip ${topic} ${c.nameKind}:${c.nameValue} names the leaf (${s})`);
    synthN++;
  }
  for (const ev of shapes(topic, A, B)) for (let i = 0; i < 2; i++) {
    const s = I.sayMatch(lang, ev, () => i * 0.7);
    ok(clean(s) && positive(s) && nWords(s) <= 14, `${lang} sayMatch ${topic} ${Object.keys(ev).join('+')}: ${s}`);
    synthN++;
  }
  const full = I.sayMatch(lang, shapes(topic, A, B)[0], r0);
  ok(!I.raw(lang, 'match.any').includes(full), `${lang} sayMatch ${topic} ${A.nameValue}/${B.nameValue} is specific: ${full}`);
  if (topic === 'oddeven') ok(full.indexOf(I.name(lang, 'parity', A.face.n % 2 ? 'odd' : 'even')) >= 0, `${lang} oddeven match names the parity: ${full}`);
  if (topic === 'count' || topic === 'oddeven') ok(full.toLowerCase().indexOf(I.name(lang, 'number', A.face.n)) >= 0, `${lang} ${topic} match says the number: ${full}`);
  if (topic === 'food') ok(/loves|thích/.test(full), `${lang} food match says what it loves: ${full}`);
  if (topic === 'colors' && A.face.obj) ok(full.toLowerCase().indexOf(I.name(lang, 'color', A.face.color)) >= 0, `${lang} colour match names the colour: ${full}`);
}
for (let i = 0; i + 1 < PAIRS.length; i++) {
  const [t1, A] = PAIRS[i], [t2, , B2] = PAIRS[i + 1];
  if (t1 !== t2) continue;
  for (const lang of I.langs) for (let k = 0; k < 3; k++) {
    for (const ev of [{ topic: t1, cardA: A, cardB: B2, streak: k }, { nameKindA: A.nameKind, nameValueA: A.nameValue, faceA: A.face, nameKindB: B2.nameKind, nameValueB: B2.nameValue, faceB: B2.face }]) {
      const s = I.sayMismatch(lang, ev, () => k * 0.4);
      // a Vietnamese "word" here is one syllable (quả bóng bay = 3), so vi gets a few more
      ok(clean(s) && positive(s) && nWords(s) <= (lang === 'vi' ? 18 : 15), `${lang} sayMismatch ${t1} ${A.nameValue}/${B2.nameValue}: ${s}`);
      ok(!I.raw(lang, 'wrong').includes(s), `${lang} sayMismatch ${t1} names both leaves: ${s}`);
      synthN++;
    }
  }
}
ok(synthN > 3000, `checked ${synthN} synthetic lines`);

section('garbage events never throw, never print junk');
const JUNK = [undefined, null, 0, 1, '', 'panda', [], {}, { nameKind: 'xyz', nameValue: 'q' }, { nameKind: 'animal' },
  { nameKind: 'number', nameValue: 'abc' }, { nameKind: 'dots', nameValue: -2 }, { nameKind: 'dots', nameValue: 30 },
  { nameValue: {} }, { face: null }, { face: 5 }, { cardA: 5, cardB: 'x' }, { cards: [null, {}] }, { nameA: {}, nameB: [] },
  { nameKind: 'letter', nameValue: 'AB' }, { nameKind: 'sum', nameValue: '2+' }, { nameKind: 'color', nameValue: 'teal' },
  { nameKind: 'color', nameValue: 'red', face: { obj: 'spaceship' } }, { nameKind: 'food', nameValue: 'pizza' },
  { topic: 'food' }, { topic: 'food', animal: 'unicorn' }, { food: 'nope' }, { nameKind: 'home', nameValue: 'kennel' },
  { nameKind: 'shape', nameValue: 'blob', face: { kind: 'shape', color: 'zz' } }, { topic: 'oddeven' }, { topic: 'size', nameKind: 'size', nameValue: 'big' }];
for (const lang of I.langs) for (const ev of JUNK) for (const fn of ['sayFlip', 'sayMatch', 'sayMismatch', 'sayReward', 'sayCorrect', 'sayWrong', 'sayCritter']) {
  let s;
  try { s = I[fn](lang, ev); } catch (e) { s = 'THROW ' + e.message; }
  ok(clean(s) && positive(s), `${lang} ${fn}(${JSON.stringify(ev)}) → ${s}`);
}

// ------------------------------------------------------------------ real rounds from content.js (pair rounds), if available
section('lines for every leaf and pair content.js makes');
(function () {
  const sc = makeSandbox(); sc.LL = {};
  let C;
  try { C = load(sc, ['rng.js', 'i18n.js', 'content.js']); } catch (e) { console.log('   (content.js not loadable yet: ' + e.message + ')'); return; }
  if (!C.Content || !C.Content.makeRound) { console.log('   (LL.Content.makeRound missing — skipped)'); return; }
  const I2 = C.I18N;
  if (!C.ANIMALS || JSON.stringify(C.ANIMALS) !== JSON.stringify(ANIMALS)) {
    console.log('   (content.js still has the old animal list — content checks skipped until the mechanics engineer lands it)'); return;
  }
  const ages = Object.keys(C.AGE_TOPICS || { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }).map(Number);
  let rounds = 0, talks = 0, lines = 0;
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 10; s++) {
    let r;
    try { r = C.Content.makeRound(topic, { age, lang, rng: new C.RNG(s * 31 + age), roundIndex: s % 4 }); }
    catch (e) { ok(false, `makeRound ${topic} age ${age} ${lang}: ${e.message}`); continue; }
    if (!r || !Array.isArray(r.cards)) { ok(false, `makeRound ${topic} returns cards[]`); continue; }
    rounds++;
    const txt = I2.t(lang, r.promptKey, r.params || {});
    ok(clean(txt) && txt !== r.promptKey && ![].concat(I2.raw(lang, 'p.any')).includes(txt), `${lang} ${r.promptKey} renders: ${txt}`);
    for (const c of r.cards) {
      ok(I2.NAME_KINDS.includes(c.nameKind), `${lang} leaf nameKind ${c.nameKind} is a known kind`);
      const s1 = I2.sayFlip(lang, { id: c.id, topic, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size });
      ok(clean(s1) && positive(s1) && !I2.raw(lang, 'praise').includes(s1), `${lang} ${topic} flip ${c.nameKind}:${JSON.stringify(c.nameValue)}: ${s1}`);
      lines++;
    }
    const byKey = {};
    for (const c of r.cards) (byKey[c.key] = byKey[c.key] || []).push(c);
    const keys = Object.keys(byKey);
    for (const k of keys) {
      const [A, B] = byKey[k];
      ok(byKey[k].length === 2, `${topic} key ${k} has exactly two leaves`);
      if (!B) continue;
      const info = (r.pairInfo || {})[k] || { nameKind: A.nameKind, nameValue: A.nameValue };
      const ev = { a: A.id, b: B.id, key: k, topic, nameKind: info.nameKind, nameValue: info.nameValue, found: 1, pairs: r.pairs,
        nameKindA: A.nameKind, nameValueA: A.nameValue, faceA: A.face, sizeA: A.size,
        nameKindB: B.nameKind, nameValueB: B.nameValue, faceB: B.face, sizeB: B.size };
      ['parity', 'animal', 'food', 'word', 'text', 'lower'].forEach(x => { if (info[x] !== undefined) ev[x] = info[x]; });
      for (const e2 of [ev, { a: A.id, b: B.id, topic, cardA: A, cardB: B }]) {
        const m = I2.sayMatch(lang, e2);
        ok(clean(m) && positive(m) && !I2.raw(lang, 'match.any').includes(m), `${lang} ${topic} match ${k}: ${m}`);
        if (topic === 'food') ok(/loves|thích/.test(m), `${lang} food match says what it loves: ${m}`);
        lines++;
      }
    }
    for (let i = 0; i + 1 < keys.length; i++) {
      const A = byKey[keys[i]][0], B = byKey[keys[i + 1]][byKey[keys[i + 1]].length - 1];
      const mm = I2.sayMismatch(lang, { a: A.id, b: B.id, streak: 1, topic, nameKindA: A.nameKind, nameValueA: A.nameValue, faceA: A.face, sizeA: A.size,
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
eq(I.talkWrong('en', 'animal', 'panda'), 'It is the panda! Good try!', 'en talkWrong animal');
eq(I.talkWrong('vi', 'animal', 'squirrel'), 'Là con sóc đó! Bé cố gắng lắm!', 'vi talkWrong animal');
eq(I.talkWrong('en', 'food', 'bamboo'), 'The panda loves bamboo! Good try!', 'en talkWrong food');
eq(I.talkWrong('vi', 'food', 'worm'), 'Bạn chim thích ăn sâu đó! Bé cố gắng lắm!', 'vi talkWrong food');
eq(I.talkWrong('vi', 'food', 'honey'), 'Bạn ong thích mật ong đó! Bé cố gắng lắm!', 'vi talkWrong honey');
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
  ok(clean(s) && positive(s), `${lang} talkWrong ${kind} ${JSON.stringify(v)}: ${s}`);
}
ok(clean(I.talkWrong('en')) && clean(I.talkWrong('vi', {})) && clean(I.talkWrong('en', 'food', 'pizza')), 'talkWrong without a (known) value');

section('speech text: letters, maths, dashes, "Lolo" → "Lô Lô" only when spoken in Vietnamese');
eq(I.speech('en', 'Find the letter B!'), 'Find the letter bee!', 'en letter speech');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');
eq(I.speech('en', '7 − 2'), '7 minus 2', 'en math speech');
eq(I.speech('en', 'Two red butterflies — a pair!'), 'Two red butterflies, a pair!', 'dash → comma pause');
eq(I.speech('vi', 'Mặt trời lên cao rồi — buổi trưa!'), 'Mặt trời lên cao rồi, buổi trưa!', 'vi dash → comma pause');
eq(V.spoken('vi', 'Chào bé! Mình là khỉ con Lolo.'), 'Chào bé! Mình là khỉ con Lô Lô.', 'vi spoken: Lolo → Lô Lô');
eq(V.spoken('vi', 'Vút! Lolo lộn một vòng!'), 'Vút! Lô Lô lộn một vòng!', 'vi spoken backflip line');
eq(V.spoken('vi', 'Lolo gợi ý nè: chữ B!'), 'Lô Lô gợi ý nè: chữ bờ!', 'vi spoken: name + phonics');
eq(V.spoken('en', 'Hi! I am Lolo.'), 'Hi! I am Lolo.', 'en spoken keeps Lolo');
eq(V.spoken('vi', 'Lolos Loloo'), 'Lolos Loloo', 'only the whole word Lolo');
for (const k of I.keys('vi')) for (const s of [].concat(I.raw('vi', k))) {
  if (s.indexOf('Lolo') < 0) continue;
  ok(V.spoken('vi', s).indexOf('Lolo') < 0 && V.spoken('vi', s).indexOf('Lô Lô') >= 0, `vi ${k} spoken with "Lô Lô": ${V.spoken('vi', s)}`);
  ok(I.t('vi', k, { child: '', stars: 3, n: 1 }).indexOf('Lô Lô') < 0, `vi ${k} display keeps "Lolo"`);
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
eq(V.match(['con bướm màu đỏ'], colVi), 'red', 'vi "con bướm màu đỏ" → red');
eq(V.match(['a red butterfly'], colEn), 'red', 'en "a red butterfly" → red');
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
eq(V.match(['three dots'], dotsEn), '3', 'en "three dots"');
eq(V.match(['four'], dotsEn), '4', 'en dots "four"');
eq(V.match(['ba chấm tròn'], dotsVi), '3', 'vi "ba chấm tròn"');
eq(V.match(['hai'], dotsVi), '2', 'vi dots "hai"');
for (let n = 0; n <= 20; n++) {
  const set = ch('en', 'number', [n, (n + 1) % 21, (n + 2) % 21]), setV = ch('vi', 'number', [n, (n + 1) % 21, (n + 2) % 21]);
  eq(V.match([I.name('en', 'number', n)], set), String(n), `en number word ${n}`);
  eq(V.match([String(n)], set), String(n), `en digit ${n}`);
  if (n > 0) eq(V.match([I.name('vi', 'number', n)], setV), String(n), `vi number word ${n}`);
  if (n > 0) eq(V.match([I.stripMarks(I.name('vi', 'number', n))], setV), String(n), `vi number no diacritics ${n}`);
}
// jungle animals, foods, things: every one distinguishable by its own name (EN + VI, with/without diacritics, classifiers)
for (const [kind, list] of [['animal', ANIMALS], ['food', FOODS], ['thing', THINGS]]) {
  const en = ch('en', kind, list), vi = ch('vi', kind, list);
  for (const a of list) {
    const ne = I.name('en', kind, a), nv = I.name('vi', kind, a);
    eq(V.match([ne], en), a, `en ${kind} "${ne}" → ${a}`);
    eq(V.match(['the ' + ne + '!'], en), a, `en ${kind} "the ${ne}!" → ${a}`);
    eq(V.match([nv], vi), a, `vi ${kind} "${nv}" → ${a}`);
    eq(V.match([I.stripMarks(nv).toLowerCase()], vi), a, `vi ${kind} no-diacritics "${I.stripMarks(nv)}" → ${a}`);
    eq(V.match(['là ' + nv + ' đó'], vi), a, `vi ${kind} "là ${nv} đó" → ${a}`);
    if (kind === 'animal' || kind === 'thing' || kind === 'food') { const bare = nv.replace(/^(con|quả|bông|cái|chiếc|củ|cây) /, ''); eq(V.match([bare], vi), a, `vi bare "${bare}" → ${a}`); }
    for (const w of I.words('vi', kind, a)) eq(V.match([w], vi), a, `vi ${kind} accepted form "${w}" → ${a}`);
    for (const w of I.words('en', kind, a)) eq(V.match([w], en), a, `en ${kind} accepted form "${w}" → ${a}`);
  }
}
const animEn = ch('en', 'animal', ANIMALS), animVi = ch('vi', 'animal', ANIMALS);
const foodEn = ch('en', 'food', FOODS), foodVi = ch('vi', 'food', FOODS);
const thingVi = ch('vi', 'thing', THINGS);
for (const [said, want] of [['gấu trúc', 'panda'], ['gau truc', 'panda'], ['con voi', 'elephant'], ['voi con', 'elephant'], ['thỏ', 'rabbit'],
  ['con soc', 'squirrel'], ['ong mật', 'bee'], ['chim sẻ', 'bird'], ['hà mã', 'hippo'], ['ha ma', 'hippo'], ['chuột', 'mouse'], ['chuot con', 'mouse']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['panda bear', 'panda'], ['an elephant', 'elephant'], ['bunny rabbit', 'rabbit'], ['hippopotamus', 'hippo'],
  ['mice', 'mouse'], ['a robin', 'bird'], ['bumblebee', 'bee'], ['squirrels', 'squirrel']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
for (const [said, want] of [['bamboo leaves', 'bamboo'], ['peanut', 'peanut'], ['nuts', 'peanut'], ['acorns', 'acorn'], ['honey pot', 'honey'],
  ['a worm', 'worm'], ['earthworm', 'worm'], ['melon', 'watermelon'], ['some cheese', 'cheese'], ['carrots', 'carrot']])
  eq(V.match([said], foodEn), want, `en "${said}" → ${want}`);
for (const [said, want] of [['tre', 'bamboo'], ['lá tre', 'bamboo'], ['đậu phộng', 'peanut'], ['lạc', 'peanut'], ['cà rốt', 'carrot'],
  ['ca rot', 'carrot'], ['hạt dẻ', 'acorn'], ['mat ong', 'honey'], ['con giun', 'worm'], ['sâu', 'worm'], ['dưa hấu', 'watermelon'],
  ['pho mai', 'cheese'], ['phô mát', 'cheese'], ['phomai', 'cheese'], ['pho-mai', 'cheese'], ['là phomai đó', 'cheese']])
  eq(V.match([said], foodVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['bươm bướm', 'butterfly'], ['bong bóng', 'balloon'], ['hoa', 'flower'], ['cái ly', 'cup'], ['đôi ủng', 'boot'], ['dieu', 'kite']])
  eq(V.match([said], thingVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['gautruc', 'panda'], ['hama', 'hippo'], ['con hama', 'hippo']]) eq(V.match([said], animVi), want, `vi joined "${said}" → ${want}`);
eq(V.match(['dưahấu'], foodVi), 'watermelon', 'vi joined "dưahấu" → watermelon');
eq(V.match(['xanhla'], ch('vi', 'color', ['red', 'green', 'blue'])), 'green', 'vi joined "xanhla" → green');
eq(V.match(['củ'], foodVi), null, 'vi "củ" alone is ambiguous (củ lạc / củ cà rốt)');
eq(V.match(['hạt'], foodVi), null, 'vi "hạt" alone is ambiguous (hạt lạc / hạt dẻ)');
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
eq(V.match(['panda'], [{ id: 'p', kind: 'animal', value: 'panda' }, { id: 'm', kind: 'animal', value: 'mouse' }], 'en'), 'p', '{id,kind,value} choices');
eq(V.match(['con chuột'], [{ id: 'p', kind: 'animal', value: 'panda' }, { id: 'm', kind: 'animal', value: 'mouse' }], 'vi'), 'm', '{id,kind,value} vi');
eq(V.match(['cây tre'], [{ id: 'b', kind: 'food', value: 'bamboo' }, { id: 'h', kind: 'food', value: 'honey' }], 'vi'), 'b', '{id,kind,value} food vi');
eq(V.match(['red'], []), null, 'no choices → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('input: tap-to-open, (x, y, ev) in logical px, one pointer');
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
  sb4.LL = {};
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
  ok(downSync, 'down fires synchronously inside pointerdown (the leaf starts turning at once)');
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
  sb5.LL = {};
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
  sb6.LL = {};
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
ok(sb.LL.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into LL.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof LL.Input.attach === 'function' && typeof LL.Input.kidProof === 'function' && typeof LL.Input.holdButton === 'function',
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
  sbx.LL = {};
  env.LL = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.LL.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.25) < 1e-9, 'Lolo: rate 0.9, pitch 1.25');
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
  // the Vietnamese voice says "Lô Lô"; the bubble text (onStart, log) keeps "Lolo"
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là khỉ Lolo. Lolo giúp bé nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là khỉ Lô Lô. Lô Lô giúp bé nhé!', 'vi utterance says "Lô Lô"');
  ok(V2.log.some(e => e.text === 'Mình là khỉ Lolo. Lolo giúp bé nhé!'), 'vi log keeps "Lolo"');
  eq(startText, 'Mình là khỉ Lolo. Lolo giúp bé nhé!', 'onStart gets the display text with "Lolo"');
  E.end(); await dv;
  const de = V2.say('I am Lolo!', { lang: 'en' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'I am Lolo!', 'en utterance keeps "Lolo"');
  E.end(); await de;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('talk.food', { animal: 'panda' }, { lang: 'vi' });
  eq(sk.text, 'Con gấu trúc thích ăn gì nhỉ?', 'sayKey renders the vi line');
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
  E3.LL.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'food', ['bamboo', 'carrot', 'cheese']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the carrot')] });
  eq((await pr2).id, 'carrot', 'interim match resolves after a short wait');
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
