#!/usr/bin/env node
// Kiki's Camp Chimes — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/monkey-camp-chimes:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (§5.1 content, §6 voice). When the chimes content.js exists
// (CC.Content making rounds with `chimes`), every prompt / Talk key + params it produces and every chime are checked too.
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
  return sb.CC;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
const NEG_EN = /\b(no|not|wrong|bad|fail|failed|incorrect|oh no|mistake|oops|fall|fell|crash|broke|broken|sorry|nope)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|dở|tệ|hỏng|không đúng|chưa đúng|trật|sai rồi|đổ|ngã|rơi mất|không phải|nhầm)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
const r0 = () => 0, r9 = () => 0.99;
function clean(s) {
  return typeof s === 'string' && s.trim().length > 0 && s.indexOf('{') < 0 && s.indexOf('}') < 0 &&
    !/undefined|null|NaN|\[object/.test(s) && !/\s[!?.,]/.test(s) && !/^[!?.,—]/.test(s) && !/_/.test(s) && !/\s{2}/.test(s) &&
    !/màu màu/i.test(s) && !/\bthe the\b/i.test(s) && !/\bcon con\b/.test(s) && !/\ba the\b|\bthe a\b/i.test(s) &&
    !/chuông chuông|chùm chùm|cái cái|hình hình|\bbell bell\b|\bchime chime\b/i.test(s) && !/\ba [aeiou]/i.test(s.replace(/letter a /ig, ''));
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

// ------------------------------------------------------------------ DESIGN value lists (§5.1, §6)
const ANIMALS = ['bear', 'fox', 'owl', 'deer', 'rabbit', 'squirrel', 'frog', 'duck'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ANIMAL_VI = { bear: 'con gấu', fox: 'con cáo', owl: 'con cú', deer: 'con hươu', rabbit: 'con thỏ', squirrel: 'con sóc',
  frog: 'con ếch', duck: 'con vịt' };
const SHAPE_VI = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
  rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.CC = { debug: { voiceLog: [] } };
let CC;
try { CC = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = CC.I18N, V = CC.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  ok(!/\bPom\b|Puzzle Town|jigsaw|elephant|\bBun\b|Dino Dig|DD\./i.test(src), `${f}: no sister-game names left (Pom / Puzzle Town / Bun …)`);
}
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.SHAPES), JSON.stringify(SHAPES), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
for (const fn of ['t', 'ask', 'name', 'words', 'choiceWords', 'chimePhrase', 'piecePhrase', 'phrase', 'sayName', 'sayRight', 'sayWrong',
  'sayPickup', 'sayTap', 'sayPlaced', 'sayCount', 'sayCountRun', 'sayCountDone', 'talkWrong', 'speech', 'setChild', 'has', 'keys',
  'raw', 'initialOf', 'kindValue'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// the chimes content.js (written by the mechanics engineer, in parallel): loaded when it makes rounds with chimes
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  try {
    const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
    if (/chimes/.test(csrc) && /'bell'/.test(csrc) && !/pieces:/.test(csrc)) {
      const sbc = makeSandbox(); sbc.CC = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.CC.Content && sbc.CC.Content.makeRound) contentSB = sbc;
    }
  } catch (e) { ok(false, 'content.js load: ' + e.message); }
}
console.log(`   (${contentSB ? 'chimes content.js loaded' : 'chimes content.js not there yet — content checks skipped'})`);
const C_ANIMALS = contentSB && contentSB.CC.ANIMALS ? Array.from(contentSB.CC.ANIMALS) : ANIMALS;
const C_SHAPES = contentSB && contentSB.CC.SHAPES ? Array.from(contentSB.CC.SHAPES) : SHAPES;
const C_COLORS = contentSB && contentSB.CC.COLORS ? Array.from(contentSB.CC.COLORS) : COLORS;
for (const a of C_ANIMALS) ok(I.ANIMALS.includes(a), `content animal ${a} has names`);
for (const s of C_SHAPES) ok(I.SHAPES.includes(s), `content shape ${s} has names`);
for (const c of C_COLORS) ok(I.COLORS.includes(c), `content colour ${c} has names`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapKiki', 'tapHint', 'swipeHint', 'quieter', 'louder', 'skip', 'gallery', 'langName.en', 'langName.vi'];
// every data-i18n / T('ui.…') this game's index.html, ui.js and main.js use must exist
const usedUi = new Set();
const OLD_GAME_KEYS = /^(surprise\.(pigeon|bubbles|mole|ptero)|pigeon\.|bubble\.|mole\.|ptero\.|ui\.tapPom)/;
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, 'game', f), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="(ui\.[\w.]+)"/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/T1?\((?:lang, )?'(ui\.[\w.]+)'/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/'((?:ui|talk|topic|weather|surprise|session|hedgehog|bird|firefly|kiki)\.[\w.]+)'/g)) usedUi.add(m[1]);
}
ok(usedUi.size >= 10, 'found the ui keys index.html / ui.js / main.js use (' + usedUi.size + ')');
const usedNow = [...usedUi].filter(k => !OLD_GAME_KEYS.test(k) && !/\.$/.test(k));
const PROMPT_KEYS = Object.keys(I.PROMPTS);
eq(PROMPT_KEYS.slice().sort().join(','), ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.animals', 'p.count', 'p.letters', 'p.lower',
  'p.initial', 'p.add', 'p.sub', 'p.oddeven'].sort().join(','), 'PROMPTS = the DESIGN §6 prompt keys');
const LINE_KEYS = ['p.any', 'p.next', 'p.sizeAny', 'name.say', 'tap', 'right', 'right.label', 'right.parity', 'right.initial', 'right.sum',
  'right.any', 'countDone', 'lantern', 'wrong.thing', 'wrong.count', 'wrong.math', 'wrong.parity', 'wrong.initial', 'wrong.any',
  'stepDone', 'song', 'songDone', 'enter', 'hint', 'idle', 'praise', 'great', 'party', 'surprise.hedgehog', 'hedgehog.tap',
  'surprise.bird', 'bird.tap', 'surprise.fireflies', 'firefly.tap', 'kiki.poke', 'session.done'];
const TALK_KEYS = ['talk.intro', 'talk.right', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.size', 'talk.wrong.letter',
  'talk.wrong.small', 'talk.wrong.number', 'talk.wrong.any', 'talk.colorsAny', 'talk.colorsWhich', 'talk.shapesAny', 'talk.shapes5',
  'talk.sizeAny', 'talk.countAny', 'talk.animalsAny', 'talk.animalsWho', 'talk.lettersAny', 'talk.lowerAny',
  'talk.initialAny', 'talk.calc', 'talk.oddevenAny'].concat(TOPICS.map(k => 'talk.' + k));
const COUNT_KEYS = Array.from({ length: 21 }, (_, i) => 'count.' + i);
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k)).concat(usedNow)
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(PROMPT_KEYS).concat(LINE_KEYS).concat(TALK_KEYS).concat(COUNT_KEYS);
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(enKeys.join('|'), viKeys.join('|'), 'en and vi have identical key sets');
for (const k of enKeys) eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `same {params} in en/vi for ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  ok(raw.every(s => typeof s === 'string' && s.trim().length > 0), `${lang} ${k}: non-empty strings`);
  if (lang === 'vi') ok(raw.every(s => !/màu \{color\}/.test(s)), `vi ${k}: no "màu {color}" (the colour name already says "màu đỏ")`);
}
// no jigsaw words left
for (const k of enKeys) ok(!/placed|pickup|nearMiss|alive|toot|pigeon|bubble/i.test(k), `no jigsaw-only key: ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(!/\bPom\b|puzzle|\bpiece|shadow|\bfits?\b|picture is|pigeon|mảnh|ghép|cái bóng|bồ câu|vừa khít|\bcạch\b/i.test(s) || /^ui\.(micUnsupported|micDenied)$/.test(k),
    `${lang} ${k}: no jigsaw words: ${s}`);
// instructions and reactions have 3 wordings
for (const lang of I.langs) for (const k of PROMPT_KEYS.concat(['p.any', 'p.next', 'p.sizeAny', 'enter', 'tap', 'right', 'right.label',
  'right.parity', 'right.initial', 'right.sum', 'right.any', 'countDone', 'lantern', 'wrong.thing', 'wrong.count', 'wrong.math',
  'wrong.parity', 'wrong.initial', 'wrong.any', 'stepDone', 'song', 'songDone', 'hint', 'idle', 'surprise.hedgehog', 'hedgehog.tap',
  'surprise.bird', 'bird.tap', 'surprise.fireflies', 'firefly.tap', 'kiki.poke', 'session.done', 'party', 'praise', 'great']))
  ok([].concat(I.raw(lang, k)).length >= 3, `${lang} ${k}: 3 wordings`);
for (const lang of I.langs) for (const k of TOPICS.map(t => 'topic.' + t)) ok(!Array.isArray(I.raw(lang, k)), `${lang} ${k} is one banner string`);

section('titles, Kiki, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.title'), 'Kiki’s Camp Chimes', 'en title');
eq(I.t('en', 'ui.logo1'), 'Kiki’s', 'en logo line 1');
eq(I.t('en', 'ui.logo2'), 'Camp Chimes', 'en logo line 2');
eq(I.t('vi', 'ui.logo1'), 'Khỉ Kiki', 'vi logo line 1');
eq(I.t('vi', 'ui.logo2'), 'Chuông Gió Lửa Trại', 'vi logo line 2');
eq(I.t('vi', 'ui.title'), 'Chuông Gió Lửa Trại Của Khỉ Kiki', 'vi title (REQUIREMENT)');
eq(I.t('en', 'ui.voice'), 'Kiki’s voice', 'voice setting names Kiki');
eq(I.t('vi', 'ui.voice'), 'Giọng của Kiki', 'vi voice setting names Kiki');
eq(I.t('en', 'ui.volume'), 'Volume', 'ui.volume');
eq(I.t('vi', 'ui.volume'), 'Âm lượng', 'vi ui.volume');
eq(I.t('en', 'ui.listening'), 'Kiki is listening…', 'ui.listening');
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /Bé ơi/.test(s)), `vi ${k}: a warm "Bé ơi" wording`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /nhé|nào|nha/.test(s)), `vi ${k}: "nhé / nào"`);
for (const k of ['p.colors', 'p.shapes', 'p.size', 'p.animals', 'hint'])
  ok([].concat(I.raw('vi', k)).every(s => /chuông/i.test(s)) || k === 'hint', `vi ${k}: says "chuông"`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('en', k)).some(s => /\bRing\b|\bring\b/.test(s)), `en ${k}: says "ring"`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /\brung\b/.test(s)), `vi ${k}: says "rung"`);
for (const k of I.keys('vi')) if (!/^ui\.langName|^name\.say$/.test(k))
  ok(JSON.stringify(I.raw('vi', k)) !== JSON.stringify(I.raw('en', k)), `vi ${k} is translated`);
for (const k of I.keys('vi')) if (!/^ui\.langName|^count\.|^ui\.(chapter|years|logo1)$|^name\.say$/.test(k))
  for (const s of [].concat(I.raw('vi', k))) if (/[a-z]{3}/i.test(s.replace(/\{\w+\}/g, '')) && s.replace(/\{\w+\}/g, '').trim().split(/\s+/).length >= 2)
    ok(VI_DIACRITIC.test(s), `vi ${k} has Vietnamese diacritics: ${s}`);
for (const k of ['p.colors', 'p.count', 'right', 'wrong.thing', 'song']) ok([].concat(I.raw('en', k)).every(s => !VI_DIACRITIC.test(s)), `en ${k} has no Vietnamese text`);

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  for (const s of [].concat(I.raw(lang, k))) ok(positive(s), `${lang} ${k} is positive: ${s}`);
}

section('every string renders, no "{" left, no "màu màu"');
const SAMPLE = { n: 3, a: 2, b: 4, stars: 7, color: 'red', shape: 'star', size: 'big', animal: 'bear',
  letter: 'B', lower: 'b', word: 'bear', first: 'B', expr: '2+3', ans: 'five', num: 'seven', parity: 'odd', label: 'letter B',
  thing: { kind: 'bell', color: 'blue' }, got: { nameKind: 'shape', nameValue: 'circle' },
  want: { nameKind: 'shape', nameValue: 'triangle' }, answer: 'red' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let v = 0; v < raw.length; v++) {
    const rng = () => (v + 0.5) / raw.length;
    for (const child of ['', 'Mai']) {
      const s = I.t(lang, k, Object.assign({ child }, SAMPLE), rng);
      ok(clean(s), `${lang} ${k} [${v}] child="${child}" renders clean: ${s}`);
      if (!child) ok(!/\bMai\b|,\s*[!?.]|\bfriend!/.test(s) || /^ui\.namePlaceholder$/.test(k), `${lang} ${k} [${v}] no name → no dangling name: ${s}`);
    }
    ok(clean(I.t(lang, k, null, rng)), `${lang} ${k} [${v}] renders clean without params: ${I.t(lang, k, null, rng)}`);
  }
}
I.setChild('');
for (let i = 0; i < 7; i++) {
  const g = I.t('en', 'great', null, () => i / 7), gv = I.t('vi', 'great', null, () => i / 7), sd = I.t('en', 'songDone', null, () => i / 4);
  ok(!/friend|,\s*!|\s!/.test(g) && !/bé ,|bé\s*!$/.test(gv) && !/,\s*!/.test(sd), `no name → no dangling comma: "${g}" / "${gv}" / "${sd}"`);
}
I.setChild('Mai');
eq(I.t('en', 'ui.welcome'), 'Hi Mai! I am Kiki. Let’s ring the chimes!', 'welcome with the child name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé Mai! Mình là khỉ Kiki. Mình cùng rung chuông nhé!', 'vi welcome with the child name');
eq(I.t('en', 'great', null, r0), 'Beautiful music, Mai!', 'great: "Beautiful music, {child}!" (REQUIREMENT)');
eq(I.t('vi', 'great', null, r0), 'Bé Mai chơi nhạc hay quá!', 'vi great with the name');
eq(I.t('vi', 'songDone', null, () => 0.3), 'Bài hát hay quá, bé Mai ơi!', 'vi songDone with the name');
I.setChild('');
eq(I.t('en', 'ui.welcome'), 'Hi! I am Kiki. Let’s ring the chimes!', 'welcome without a name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé! Mình là khỉ Kiki. Mình cùng rung chuông nhé!', 'vi welcome without a name');
eq(I.t('en', 'great', { child: '' }, r0), 'What a music star!', 'great without a name skips {child} variants');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'ui.chapter');
eq(I.t('vi', 'ui.chapter', { n: 2 }), 'Chương 2', 'vi ui.chapter');
eq(I.t('vi', 'session.done', { stars: 12 }, r0), 'Một ngày âm nhạc tuyệt quá! 12 ngôi sao!', 'vi session.done');
eq(I.t('en', 'session.done', { stars: 12 }, r0), 'What a music day! 12 stars! Hooray!', 'en session.done');
eq(I.t('en', 'weather.0'), 'Good morning, mountains!', 'weather.0 morning (DESIGN)');
eq(I.t('en', 'weather.1'), 'Sunny noon!', 'weather.1 noon');
eq(I.t('en', 'weather.2'), 'Sunset time!', 'weather.2 sunset');
eq(I.t('en', 'weather.3'), 'Starry night!', 'weather.3 night');
ok(/sáng/.test(I.t('vi', 'weather.0')) && /trưa/.test(I.t('vi', 'weather.1')) && /hoàng hôn/i.test(I.t('vi', 'weather.2')) && /sao/.test(I.t('vi', 'weather.3')), 'vi day moods');
eq(I.t('en', 'enter', null, r0), 'New chimes!', 'enter (DESIGN)');
eq(I.t('en', 'song', null, r0), 'Now play our song — swipe across the chimes!', 'song (DESIGN)');
eq(I.t('vi', 'song', null, r0), 'Giờ mình cùng hát nhé — bé vuốt qua các chuông nào!', 'vi song (REQUIREMENT)');
eq(I.t('en', 'songDone', null, r0), 'Beautiful music!', 'songDone (DESIGN)');
eq(I.t('vi', 'songDone', null, r0), 'Bé chơi nhạc hay quá!', 'vi songDone (REQUIREMENT)');
eq(I.t('en', 'right.any', null, r0), 'Ding! Lovely!', 'right.any (REQUIREMENT)');
eq(I.t('vi', 'right.any', null, r0), 'Đinh đoong! Hay quá!', 'vi right.any (REQUIREMENT)');
eq(I.t('en', 'topic.colors'), 'Colour Bells', 'topic banner');
eq(I.t('en', 'p.nonsense', null, r0), I.t('en', 'p.any', null, r0), 'unknown prompt key → p.any');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key → the key');
for (const k of ['surprise.hedgehog', 'hedgehog.tap']) for (const lang of I.langs)
  ok([].concat(I.raw(lang, k)).some(s => /hedgehog|nhím/i.test(s)), `${lang} ${k} names the hedgehog`);
for (const k of ['surprise.bird']) for (const lang of I.langs) ok([].concat(I.raw(lang, k)).some(s => /bird|chim/i.test(s)), `${lang} ${k} names the bird`);
for (const lang of I.langs) ok([].concat(I.raw(lang, 'surprise.fireflies')).some(s => /firefl|đom đóm/i.test(s)), `${lang} fireflies`);

section('prompts: DESIGN examples, every param filled, plurals, fallbacks');
eq(I.ask('en', 'p.colors', { color: 'red' }, { rng: r0 }), 'Ring the red bell!', 'p.colors en (DESIGN)');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { rng: r0 }), 'Bé ơi, rung chuông màu đỏ nhé!', 'p.colors vi (DESIGN)');
eq(I.ask('en', 'p.shapes', { shape: 'triangle' }, { rng: r0 }), 'Ring the triangle!', 'p.shapes en');
eq(I.ask('vi', 'p.shapes', { shape: 'star' }, { rng: r0 }), 'Bé ơi, rung chuông hình ngôi sao nhé!', 'p.shapes vi: "chuông hình ngôi sao"');
eq(I.ask('vi', 'p.shapes', { shape: 'heart' }, { rng: r0 }), 'Bé ơi, rung chuông hình trái tim nhé!', 'p.shapes vi: "hình trái tim"');
eq(I.ask('en', 'p.shapes5', { shape: 'star', color: 'blue' }, { rng: r0 }), 'Ring the blue star!', 'p.shapes5 en (DESIGN)');
eq(I.ask('vi', 'p.shapes5', { shape: 'star', color: 'blue' }, { rng: r0 }), 'Bé ơi, rung chuông hình ngôi sao màu xanh dương nhé!', 'p.shapes5 vi');
eq(I.ask('en', 'p.shapes5', { shape: 'oval' }, { rng: r0 }), 'Ring the oval!', 'p.shapes5 without colour → p.shapes');
eq(I.ask('en', 'p.size', { size: 'big' }, { rng: r0 }), 'Ring the big bell!', 'p.size en (DESIGN)');
eq(I.ask('en', 'p.size', { size: 'small' }, { rng: r0 }), 'Ring the small bell!', 'p.size small');
eq(I.ask('vi', 'p.size', { size: 'big' }, { rng: r0 }), 'Bé ơi, rung chuông to nhé!', 'p.size vi');
eq(I.ask('en', 'p.size', { big: true }, { rng: r0 }), 'Ring the big bell!', 'p.size from {big:true}');
eq(I.ask('en', 'p.size', {}, { rng: r0 }), 'Ring the big bell!', 'p.size without size → p.sizeAny');
eq(I.ask('en', 'p.count', { n: 3 }, { rng: r0 }), 'Ring the one with three bells!', 'p.count en (DESIGN)');
eq(I.ask('en', 'p.count', { n: 1, kind: 'string' }, { rng: r0 }), 'Ring the one with one bell!', 'p.count singular');
eq(I.ask('vi', 'p.count', { n: 3, kind: 'string' }, { rng: r0 }), 'Bé ơi, rung chùm có ba cái chuông nhé!', 'p.count vi (REQUIREMENT: "chùm có ba cái chuông")');
eq(I.ask('en', 'p.count', { n: 7, kind: 'dots' }, { rng: r0 }), 'Ring the one with seven dots!', 'p.count dots (DESIGN)');
eq(I.ask('vi', 'p.count', { n: 7, kind: 'dots' }, { rng: r0 }), 'Bé ơi, rung chuông có bảy chấm nhé!', 'p.count dots vi');
eq(I.ask('vi', 'p.count', { n: 4, kind: 'string' }, { rng: () => 0.5 }), 'Mình đếm nhé! Chùm nào có bốn cái chuông? Bé rung nào!', 'p.count vi 2nd wording, {holder} capitalised');
eq(I.ask('en', 'p.animals', { animal: 'bear' }, { rng: r0 }), 'Ring the bear!', 'p.animals en (DESIGN)');
eq(I.ask('vi', 'p.animals', { animal: 'bear' }, { rng: r9 }), 'Rung chuông con gấu nào!', 'p.animals vi (REQUIREMENT)');
eq(I.ask('en', 'p.letters', { letter: 'B' }, { rng: r0 }), 'Ring the letter B!', 'p.letters');
eq(I.ask('vi', 'p.letters', { letter: 'B' }, { rng: r0 }), 'Bé ơi, rung chuông chữ B nhé!', 'p.letters vi');
eq(I.ask('en', 'p.lower', { letter: 'G' }, { rng: () => 0.5 }), 'Ring small g!', 'p.lower');
eq(I.ask('en', 'p.lower', { letter: 'g' }, { rng: r0 }), 'Big G has a little friend. Ring small g!', 'p.lower from a small letter');
eq(I.ask('en', 'p.initial', { letter: 'B', animal: 'bear' }, { rng: r0 }), 'Ring the animal that starts with B!', 'p.initial');
eq(I.ask('en', 'p.add', { a: 2, b: 3 }, { rng: r0 }), 'What is 2 + 3? Ring the answer!', 'p.add');
eq(I.ask('vi', 'p.sub', { a: 7, b: 2 }, { rng: r0 }), 'Bé ơi, 7 − 2 bằng mấy? Bé rung chuông đáp án nhé!', 'p.sub vi');
eq(I.ask('en', 'p.oddeven', { parity: 'odd' }, { rng: r0 }), 'Ring all the odd numbers!', 'p.oddeven (DESIGN)');
eq(I.ask('vi', 'p.oddeven', { parity: 'even' }, { rng: r0 }), 'Bé ơi, rung hết các số chẵn nhé!', 'p.oddeven vi');
eq(I.ask('en', 'p.colors', {}, { rng: r0 }), I.t('en', 'p.any', null, r0), 'missing param → p.any');
// next wording
eq(I.ask('en', 'p.colors', { color: 'red' }, { next: true, rng: r0 }), 'Next one! Ring the red bell!', 'next en');
eq(I.ask('en', 'p.animals', { animal: 'bear' }, { next: true, rng: r9 }), 'Now, can you ring the bear chime?', 'next "Now," runs into the prompt');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { next: true, rng: r9 }), 'Giờ thì bé rung chuông màu đỏ nào!', 'next vi "Giờ thì bé rung …" (DESIGN)');
for (const lang of I.langs) for (const k of PROMPT_KEYS) for (let v = 0; v < 3; v++) {
  const P = { color: 'green', shape: 'heart', size: 'small', animal: 'squirrel', n: 4, kind: v === 1 ? 'dots' : 'string', letter: 'M', a: 3, b: 1, parity: 'even' };
  const s = I.ask(lang, k, P, { next: true, rng: () => (v + 0.5) / 3 });
  ok(clean(s) && !/Bé ơi/.test(s.replace(/^Bé ơi/, '')) && !/(nhé|nào)!.*\1!/.test(s), `${lang} ${k} next [${v}]: ${s}`);
  if (lang === 'vi') ok(!/^.+[!?] Bé ơi/.test(s), `vi ${k} next: no "Bé ơi" mid-sentence: ${s}`);
}
// every prompt × every value
for (const lang of I.langs) {
  for (const c of COLORS) for (let v = 0; v < 3; v++) ok(clean(I.ask(lang, 'p.colors', { color: c }, { rng: () => v / 3 })), `${lang} p.colors ${c} [${v}]`);
  for (const s of SHAPES) for (const c of COLORS) for (let v = 0; v < 3; v++) {
    const a = I.ask(lang, 'p.shapes5', { shape: s, color: c }, { rng: () => v / 3 });
    ok(clean(a) && a.includes(I.name(lang, 'color', c)), `${lang} p.shapes5 ${s} ${c} [${v}]: ${a}`);
  }
  for (const a of ANIMALS) for (let v = 0; v < 3; v++) {
    const s = I.ask(lang, 'p.animals', { animal: a }, { rng: () => v / 3 });
    ok(clean(s) && s.toLowerCase().includes(I.name(lang, 'animal', a)), `${lang} p.animals ${a} [${v}]: ${s}`);
  }
  for (let n = 1; n <= 12; n++) for (const kind of ['string', 'dots']) for (let v = 0; v < 3; v++) {
    const s = I.ask(lang, 'p.count', { n, kind }, { rng: () => v / 3 });
    ok(clean(s) && s.toLowerCase().includes(I.numberName(lang, n)), `${lang} p.count ${n} ${kind} [${v}]: ${s}`);
    if (lang === 'en' && n === 1) ok(!/\b(bells|dots)\b/.test(s), `en p.count 1 is singular: ${s}`);
    if (lang === 'en' && n > 1) ok(/\b(bells|dots)\b/.test(s), `en p.count ${n} is plural: ${s}`);
  }
  for (const L of LETTERS) ok(clean(I.ask(lang, 'p.letters', { letter: L }, { rng: r0 })), `${lang} p.letters ${L}`);
}

section('names for every kind × value (DESIGN §6)');
const NAME_CASES = { color: COLORS, shape: SHAPES, size: ['big', 'small'], animal: ANIMALS, parity: ['odd', 'even'] };
for (const a of ANIMALS) eq(I.name('vi', 'animal', a), ANIMAL_VI[a], `vi animal ${a} (DESIGN)`);
for (const s of SHAPES) eq(I.name('vi', 'shape', s), SHAPE_VI[s], `vi shape ${s} (DESIGN)`);
for (const a of ANIMALS) eq(I.name('en', 'animal', a), a, `en animal ${a}`);
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'rect → rectangle');
eq(I.name('vi', 'color', 'blue'), 'màu xanh dương', 'vi blue');
eq(I.name('vi', 'hue', 'green'), 'xanh lá', 'vi hue');
eq(I.name('en', 'bell', 'red'), 'red bell', 'bell en');
eq(I.name('vi', 'bell', 'red'), 'chuông màu đỏ', 'bell vi (DESIGN "chuông")');
eq(I.name('vi', 'bell', 'big'), 'chuông to', 'bell big vi');
eq(I.name('en', 'plate', 'star'), 'star chime', 'plate en');
eq(I.name('vi', 'plate', 'star'), 'chuông hình ngôi sao', 'plate vi (DESIGN "tấm chuông hình …")');
eq(I.name('en', 'string', 3), 'three bells', 'string en');
eq(I.name('en', 'string', 1), 'one bell', 'string en singular');
eq(I.name('vi', 'string', 3), 'ba cái chuông', 'string vi (DESIGN "cái chuông")');
eq(I.name('en', 'dots', 5), 'five dots', 'dots en');
eq(I.name('vi', 'dots', 5), 'năm chấm', 'dots vi');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi K');
eq(I.name('vi', 'letter', 'Y'), 'i dài', 'vi Y');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'sum en');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'diff vi');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'parity vi');
eq(I.name('vi', 'word', 'frog'), 'ếch', 'word vi');
for (let n = 0; n <= 20; n++) for (const lang of I.langs) ok(clean(I.name(lang, 'number', n)) && !/\d/.test(I.name(lang, 'number', n)), `${lang} number ${n}: ${I.name(lang, 'number', n)}`);
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15 = mười lăm');
eq(I.name('vi', 'number', 0), 'không', 'vi 0');
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const lang of I.langs) for (const v of vals)
  ok(clean(I.name(lang, kind, v)) && I.name(lang, kind, v) !== v || lang === 'en', `${lang} name ${kind} ${v}: ${I.name(lang, kind, v)}`);
for (const lang of I.langs) for (const k of ['bell', 'plate', 'string', 'dots']) for (const v of (k === 'bell' ? COLORS.concat(['big', 'small']) : k === 'plate' ? SHAPES : [1, 2, 3, 4, 5, 12]))
  ok(clean(I.name(lang, k, v)), `${lang} name ${k} ${v}: ${I.name(lang, k, v)}`);
// initials
for (const [a, f] of [['bear', 'B'], ['fox', 'F'], ['owl', 'O'], ['deer', 'D'], ['rabbit', 'R'], ['squirrel', 'S'], ['frog', 'F'], ['duck', 'D']])
  eq(I.initialOf('en', a).first, f, `en initial ${a}`);
for (const [a, f, w] of [['bear', 'G', 'gấu'], ['fox', 'C', 'cáo'], ['owl', 'C', 'cú'], ['deer', 'H', 'hươu'], ['rabbit', 'T', 'thỏ'],
  ['squirrel', 'S', 'sóc'], ['frog', 'Ê', 'ếch'], ['duck', 'V', 'vịt']]) {
  eq(I.initialOf('vi', a).first, f, `vi initial ${a}`);
  eq(I.initialOf('vi', a).word, w, `vi word ${a}`);
}

section('chimePhrase for every chime kind × value');
eq(I.chimePhrase('en', { kind: 'bell', color: 'red' }), 'the red bell', 'bell');
eq(I.chimePhrase('vi', { kind: 'bell', color: 'red' }), 'chuông màu đỏ', 'bell vi');
eq(I.chimePhrase('en', { kind: 'bell', color: 'red', big: true, nameKind: 'size', nameValue: 'big' }), 'the big bell', 'big bell');
eq(I.chimePhrase('vi', { kind: 'bell', color: 'red', big: false, nameKind: 'size', nameValue: 'small' }), 'chuông nhỏ', 'small bell vi');
eq(I.chimePhrase('en', { kind: 'plate', shape: 'triangle', color: 'red' }), 'the triangle', 'plate: no colour by default');
eq(I.chimePhrase('en', { kind: 'plate', shape: 'oval', color: 'orange' }, { color: true }), 'the orange oval', 'plate with colour');
eq(I.chimePhrase('en', { kind: 'plate', shape: 'oval' }, { art: 'a' }), 'an oval', 'an oval');
eq(I.chimePhrase('vi', { kind: 'plate', shape: 'star', color: 'blue' }, { color: true }), 'chuông hình ngôi sao màu xanh dương', 'plate vi with colour');
eq(I.chimePhrase('en', { kind: 'string', n: 3 }), 'three bells', 'string');
eq(I.chimePhrase('vi', { kind: 'string', n: 3 }), 'chùm ba cái chuông', 'string vi');
eq(I.chimePhrase('en', { kind: 'dots', n: 1 }), 'one dot', 'dots singular');
eq(I.chimePhrase('en', { kind: 'animal', animal: 'owl' }), 'the owl', 'animal');
eq(I.chimePhrase('en', { kind: 'animal', animal: 'owl' }, { art: 'a' }), 'an owl', 'an owl');
eq(I.chimePhrase('vi', { kind: 'animal', animal: 'owl' }), 'con cú', 'animal vi');
eq(I.chimePhrase('vi', { kind: 'animal', animal: 'owl' }, { chime: true }), 'chuông con cú', 'animal vi chime');
eq(I.chimePhrase('en', { kind: 'glyph', text: 'B' }), 'letter B', 'letter glyph');
eq(I.chimePhrase('en', { kind: 'glyph', text: 'b' }), 'small b', 'small letter glyph');
eq(I.chimePhrase('vi', { kind: 'glyph', text: 'b' }), 'chữ b thường', 'small letter glyph vi');
eq(I.chimePhrase('en', { kind: 'glyph', text: '8', n: 8 }), 'number eight', 'number glyph');
eq(I.chimePhrase('vi', { kind: 'glyph', text: '5' }), 'số năm', 'number glyph vi');
eq(I.chimePhrase('en', { kind: 'glyph', text: '8' }, { bare: true }), 'eight', 'bare number');
eq(I.chimePhrase('en', { kind: 'shape', shape: 'star' }), 'the star', 'legacy kind shape → plate');
eq(I.chimePhrase('en', { kind: 'bunch', n: 2 }), 'two bells', 'legacy kind bunch → string');
eq(I.chimePhrase('en', {}), '', 'nothing → ""');
eq(I.phrase('en', { nameKind: 'color', nameValue: 'red' }), 'red', 'phrase nameKind');
eq(I.phrase('en', { thing: { kind: 'animal', animal: 'fox' } }), 'the fox', 'phrase choice');
eq(I.sayName('en', { kind: 'bell', color: 'pink' }), 'the pink bell', 'sayName (DESIGN)');
eq(I.sayName('vi', { kind: 'animal', animal: 'deer' }), 'con hươu', 'sayName vi');
eq(I.sayName('vi', { thing: { kind: 'plate', shape: 'heart' } }), 'chuông hình trái tim', 'sayName from {thing}');
eq(I.sayName('en', null), '', 'sayName(null) → ""');
for (const lang of I.langs) {
  const things = [].concat(COLORS.map(c => ({ kind: 'bell', color: c })), SHAPES.map(s => ({ kind: 'plate', shape: s, color: 'red' })),
    [1, 2, 3, 4, 5].map(n => ({ kind: 'string', n })), [1, 4, 7, 10, 12].map(n => ({ kind: 'dots', n })), ANIMALS.map(a => ({ kind: 'animal', animal: a })),
    LETTERS.map(L => ({ kind: 'glyph', text: L })), Array.from({ length: 21 }, (_, n) => ({ kind: 'glyph', text: String(n), n })),
    [true, false].map(b => ({ kind: 'bell', color: 'yellow', big: b, nameKind: 'size', nameValue: b ? 'big' : 'small' })));
  for (const t of things) for (const o of [{}, { color: true }, { art: 'a' }, { art: null }, { chime: true }]) {
    const s = I.chimePhrase(lang, t, o);
    ok(clean(s), `${lang} chimePhrase ${JSON.stringify(t)} ${JSON.stringify(o)}: ${s}`);
  }
}

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
const MATCH_CASES = { color: COLORS, shape: SHAPES.filter(s => s !== 'rect'), size: ['big', 'small'], animal: ANIMALS, parity: ['odd', 'even'] };
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const lang of I.langs) for (const v of vals) {
  const ws = I.words(lang, kind, v);
  ok(ws.length >= 1 && ws.every(w => w === w.toLowerCase()), `${lang} words ${kind} ${v}: lower-case forms (${ws.length})`);
  ok(ws.includes(I.name(lang, kind, v).toLowerCase()), `${lang} words ${kind} ${v} include the name`);
  ok(ws.includes(I.stripMarks(I.name(lang, kind, v)).toLowerCase()), `${lang} words ${kind} ${v} include the no-diacritic name`);
}
for (const [kind, vals] of Object.entries(MATCH_CASES)) for (const lang of I.langs) {
  const set = ch(lang, kind, vals);
  for (const v of vals) {
    eq(V.match([I.name(lang, kind, v)], set), String(v), `${lang} "${I.name(lang, kind, v)}" → ${kind} ${v}`);
    eq(V.match([I.stripMarks(I.name(lang, kind, v))], set), String(v), `${lang} no diacritics "${I.stripMarks(I.name(lang, kind, v))}" → ${v}`);
    for (const w of I.words(lang, kind, v)) if (!w.startsWith('=')) eq(V.match([w], set), String(v), `${lang} ${kind} accepted form "${w}" → ${v}`);
  }
}
// no spoken form is shared by two values of one kind
for (const [kind, vals] of Object.entries(MATCH_CASES)) for (const lang of I.langs) {
  const seen = {};
  for (const v of vals) for (const w of I.words(lang, kind, v)) { ok(!seen[w] || seen[w] === v, `${lang} ${kind} form "${w}" only for one value (${seen[w]} / ${v})`); seen[w] = v; }
}
for (let n = 0; n <= 20; n++) for (const lang of I.langs) {
  const ws = I.words(lang, 'number', n);
  ok(ws.includes(String(n)), `${lang} number ${n} accepts the digit`);
  if (n > 0) ok(ws.includes(I.stripMarks(I.name(lang, 'number', n))), `${lang} number ${n} accepts the no-diacritic word`);
}
const animEn = ch('en', 'animal', ANIMALS), animVi = ch('vi', 'animal', ANIMALS);
for (const a of ANIMALS) {
  eq(V.match(['the ' + I.name('en', 'animal', a) + '!'], animEn), a, `en "the ${a}!"`);
  const vi = I.name('vi', 'animal', a);
  eq(V.match([vi.replace(/^con /, '')], animVi), a, `vi bare "${vi.replace(/^con /, '')}" → ${a}`);
  eq(V.match(['là ' + vi + ' đó'], animVi), a, `vi "là ${vi} đó" → ${a}`);
  eq(V.match([I.stripMarks(vi)], animVi), a, `vi no diacritics "${I.stripMarks(vi)}" → ${a}`);
  eq(V.match(['chuông ' + vi], animVi), a, `vi "chuông ${vi}" → ${a}`);
}
for (const [said, want] of [['gau', 'bear'], ['con nai', 'deer'], ['huou', 'deer'], ['cú mèo', 'owl'], ['cao', 'fox'], ['soc', 'squirrel'],
  ['vit', 'duck'], ['ech', 'frog'], ['con thỏ', 'rabbit'], ['tho', 'rabbit'], ['con sóc', 'squirrel'], ['gấu con', 'bear']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['a teddy bear', 'bear'], ['foxy', 'fox'], ['an owl', 'owl'], ['a bunny', 'rabbit'], ['the squirrel', 'squirrel'],
  ['froggy', 'frog'], ['quack', 'duck'], ['a deer', 'deer']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['xanh'], ch('vi', 'color', COLORS)), null, '"xanh" alone is ambiguous');
eq(V.match(['màu xanh dương'], ch('vi', 'color', COLORS)), 'blue', 'vi "màu xanh dương"');
eq(V.match(['mau do'], ch('vi', 'color', COLORS)), 'red', 'vi no-diacritic "mau do"');
eq(V.match(['chuông màu đỏ'], ch('vi', 'color', COLORS)), 'red', 'vi "chuông màu đỏ" → red');
eq(V.match(['the red bell'], ch('en', 'color', COLORS)), 'red', 'en "the red bell" → red');
eq(V.match(['ba'], ch('vi', 'number', [3, 5, 12])), '3', '"ba" → 3');
eq(V.match(['muoi hai'], ch('vi', 'number', [3, 5, 12])), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], ch('en', 'number', [3, 5, 12])), '5', '"I think five"');
eq(V.match(['three bells'], ch('en', 'string', [2, 3, 4])), '3', 'en "three bells" → 3');
eq(V.match(['ba cái chuông'], ch('vi', 'string', [2, 3, 4])), '3', 'vi "ba cái chuông" → 3');
eq(V.match(['bốn chấm'], ch('vi', 'dots', [2, 4, 6])), '4', 'vi "bốn chấm" → 4');
eq(V.match(['7'], ch('en', 'number', [6, 7, 8])), '7', 'digit transcript "7"');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
eq(V.match(['số chẵn'], ch('vi', 'parity', ['odd', 'even'])), 'even', '"số chẵn"');
eq(V.match(['bee'], ch('en', 'letter', ['A', 'B', 'C'])), 'B', '"bee" → B');
eq(V.match(['chữ tờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'T', '"chữ tờ" → T');
eq(V.match(['bờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'B', '"bờ" → B');
eq(V.match(['two plus three'], ch('en', 'sum', ['2+3', '1+1'])), '2+3', 'en sum spoken');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['chuông to'], ch('vi', 'size', ['big', 'small'])), 'big', 'vi "chuông to"');
eq(V.match(['the big one'], ch('en', 'size', ['big', 'small'])), 'big', 'en "the big one"');
eq(V.match(['ngôi sao'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'star', 'vi "ngôi sao"');
eq(V.match(['hình ngôi sao'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'star', 'vi "hình ngôi sao"');
eq(V.match(['trai tim'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'heart', 'vi "trai tim"');
eq(V.match(['the star chime'], ch('en', 'plate', ['star', 'heart', 'circle'])), 'star', 'en plate "the star chime"');
eq(V.match(['bear'], [{ id: 'c', kind: 'animal', value: 'bear' }, { id: 'p', kind: 'animal', value: 'fox' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['banana'], colEn), null, 'unrelated → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('game lines: sayRight / sayWrong / sayCount / sayCountRun / sayCountDone / sayPickup / sayTap');
const bell = (c) => ({ kind: 'bell', color: c, nameKind: 'color', nameValue: c });
const sbell = (big) => ({ kind: 'bell', color: 'red', big, nameKind: 'size', nameValue: big ? 'big' : 'small' });
const plate = (s, c) => ({ kind: 'plate', shape: s, color: c || 'blue', nameKind: 'shape', nameValue: s });
const strg = (n) => ({ kind: 'string', n, nameKind: 'number', nameValue: n });
const dots = (n) => ({ kind: 'dots', n, nameKind: 'number', nameValue: n });
const anim = (a) => ({ kind: 'animal', animal: a, nameKind: 'animal', nameValue: a });
const glyphL = (c) => ({ kind: 'glyph', text: c, nameKind: 'letter', nameValue: c });
const glyphN = (n) => ({ kind: 'glyph', text: String(n), n, nameKind: 'number', nameValue: n });
eq(I.sayRight('en', { thing: bell('red'), topic: 'colors' }, r0), 'Ding! The red bell!', 'right colours en (DESIGN)');
eq(I.sayRight('vi', { thing: bell('red'), topic: 'colors' }, r9), 'Chuông màu đỏ! Hay quá!', 'right colours vi');
eq(I.sayRight('vi', { thing: bell('red'), topic: 'colors' }, r0), 'Đinh đoong! Chuông màu đỏ!', 'right colours vi (DESIGN)');
eq(I.sayRight('en', { thing: plate('triangle'), topic: 'shapes', params: { shape: 'triangle' } }, r0), 'Ding! The triangle!', 'right shapes');
eq(I.sayRight('en', { thing: plate('star', 'blue'), topic: 'shapes', promptKey: 'p.shapes5', params: { shape: 'star', color: 'blue' } }, r0),
  'Ding! The blue star!', 'right shapes5 names the colour');
eq(I.sayRight('vi', { thing: plate('star', 'blue'), topic: 'shapes', promptKey: 'p.shapes5', params: { shape: 'star', color: 'blue' } }, r0),
  'Đinh đoong! Chuông hình ngôi sao màu xanh dương!', 'right shapes5 vi');
eq(I.sayRight('en', { thing: sbell(true), topic: 'size', params: { size: 'big' } }, r0), 'Ding! The big bell!', 'right size');
eq(I.sayRight('vi', { thing: sbell(false), topic: 'size', params: { size: 'small' } }, r0), 'Đinh đoong! Chuông nhỏ!', 'right size vi');
eq(I.sayRight('en', { thing: anim('bear'), topic: 'animals' }, () => 0.5), 'Ding-dong! The bear!', 'right animals');
eq(I.sayRight('vi', { thing: anim('bear'), topic: 'animals' }, r0), 'Đinh đoong! Con gấu!', 'right animals vi');
eq(I.sayRight('en', { thing: strg(3), topic: 'count', count: { n: 3 } }), 'One, two, three bells!', 'right count → the count run (DESIGN)');
eq(I.sayRight('vi', { thing: strg(3), topic: 'count' }), 'Một, hai, ba cái chuông!', 'right count vi (DESIGN)');
eq(I.sayRight('en', { thing: strg(1), topic: 'count' }), 'One bell!', 'right count 1');
eq(I.sayRight('en', { thing: dots(7), topic: 'count', params: { n: 7, kind: 'dots' } }, r0), 'Ding! Seven dots!', 'right dots without a count run');
eq(I.sayRight('en', { thing: dots(4), topic: 'count', count: { n: 4 } }), 'One, two, three, four dots!', 'right dots with e.count');
eq(I.sayRight('en', { thing: glyphL('B'), topic: 'letters' }, r0), 'Ding! Letter B!', 'right letters');
eq(I.sayRight('vi', { thing: glyphL('b'), topic: 'lower' }, r0), 'Đinh đoong! Chữ b thường!', 'right lower vi');
eq(I.sayRight('en', { thing: anim('bear'), topic: 'initial' }, r0), 'B is for bear!', 'right initial');
eq(I.sayRight('vi', { thing: anim('frog'), topic: 'initial' }, r0), 'Chữ Ê, ếch!', 'right initial vi');
eq(I.sayRight('en', { thing: glyphN(5), topic: 'add', params: { a: 2, b: 3 } }, r0), 'Five! 2 + 3 is five!', 'right add');
eq(I.sayRight('vi', { thing: glyphN(5), topic: 'sub', params: { a: 7, b: 2 } }, r0), 'Năm! 7 − 2 bằng năm!', 'right sub vi');
eq(I.sayRight('en', { thing: glyphN(7), topic: 'oddeven' }, r0), 'Seven is odd!', 'right oddeven');
eq(I.sayRight('vi', { thing: glyphN(8), topic: 'oddeven' }, r0), 'Tám là số chẵn!', 'right oddeven vi');
eq(I.sayRight('en', { thing: glyphN(9), topic: 'count' }, r0), 'Ding! Nine!', 'right number glyph');
eq(I.sayRight('en', {}, r0), 'Ding! Lovely!', 'right without a thing → right.any');
// rebuilt from nameKind (main forgot thing)
eq(I.sayRight('en', { nameKind: 'color', nameValue: 'green', topic: 'colors' }, r0), 'Ding! The green bell!', 'right rebuilt from nameKind');
eq(I.sayPlaced('en', { thing: bell('red'), topic: 'colors' }, r0), I.sayRight('en', { thing: bell('red'), topic: 'colors' }, r0), 'sayPlaced = sayRight');
eq(I.sayPickup('en', { thing: bell('red'), topic: 'colors' }), 'The red bell!', 'sayPickup (brush name)');
eq(I.sayPickup('vi', { thing: anim('owl') }), 'Con cú!', 'sayPickup vi');
eq(I.sayTap('en', { thing: anim('owl') }, () => 0.5), 'Look, the owl!', 'sayTap');
// wrong
const W = (lang, got, want, topic, params, extra) => I.sayWrong(lang, Object.assign({ thing: got, got: { nameKind: got.nameKind, nameValue: got.nameValue },
  want, topic, params: params || {} }, extra || {}), r0);
eq(W('en', bell('blue'), { nameKind: 'color', nameValue: 'red' }, 'colors'), 'That’s the blue bell. Let’s ring the red one!', 'wrong colours en (DESIGN)');
eq(W('vi', bell('blue'), { nameKind: 'color', nameValue: 'red' }, 'colors'), 'Đây là chuông màu xanh dương. Mình rung chuông màu đỏ nhé!', 'wrong colours vi (REQUIREMENT)');
eq(W('en', plate('circle'), { nameKind: 'shape', nameValue: 'triangle' }, 'shapes'), 'That’s the circle. Let’s ring the triangle!', 'wrong shapes');
eq(W('vi', plate('circle'), { nameKind: 'shape', nameValue: 'star' }, 'shapes'), 'Đây là chuông hình tròn. Mình rung chuông hình ngôi sao nhé!', 'wrong shapes vi');
eq(W('en', plate('star', 'red'), { nameKind: 'shape', nameValue: 'star' }, 'shapes', { shape: 'star', color: 'blue' }, { promptKey: 'p.shapes5' }),
  'That’s the red star. Let’s ring the blue star!', 'wrong shapes5');
eq(W('en', plate('heart', 'orange'), { nameKind: 'shape', nameValue: 'star' }, 'shapes', { shape: 'star', color: 'orange' }, { promptKey: 'p.shapes' }),
  'That’s the heart. Let’s ring the star!', 'wrong p.shapes with a {color} param: the colour is not said');
eq(I.sayRight('en', { thing: plate('star', 'orange'), topic: 'shapes', promptKey: 'p.shapes', params: { shape: 'star', color: 'orange' } }, r0),
  'Ding! The star!', 'right p.shapes with a {color} param: the colour is not said');
eq(W('en', sbell(false), { nameKind: 'size', nameValue: 'big' }, 'size', { size: 'big' }), 'That’s the small bell. Let’s ring the big one!', 'wrong size');
eq(W('vi', sbell(false), { nameKind: 'size', nameValue: 'big' }, 'size', { size: 'big' }), 'Đây là chuông nhỏ. Mình rung chuông to nhé!', 'wrong size vi');
eq(W('en', anim('fox'), { nameKind: 'animal', nameValue: 'bear' }, 'animals'), 'That’s the fox. Let’s ring the bear!', 'wrong animals');
eq(W('vi', anim('fox'), { nameKind: 'animal', nameValue: 'bear' }, 'animals'), 'Đây là chuông con cáo. Mình rung chuông con gấu nhé!', 'wrong animals vi');
eq(W('en', strg(4), { nameKind: 'number', nameValue: 3 }, 'count', { n: 3, kind: 'string' }), 'That one has four bells. Let’s ring the one with three bells!', 'wrong count');
eq(W('vi', strg(4), { nameKind: 'number', nameValue: 3 }, 'count', { n: 3, kind: 'string' }), 'Chùm này có bốn cái chuông. Mình rung chùm có ba cái chuông nhé!', 'wrong count vi');
eq(W('vi', dots(4), { nameKind: 'number', nameValue: 6 }, 'count', { n: 6, kind: 'dots' }), 'Chuông này có bốn chấm. Mình rung chuông có sáu chấm nhé!', 'wrong dots vi');
eq(W('en', glyphL('D'), { nameKind: 'letter', nameValue: 'B' }, 'letters'), 'That’s letter D. Let’s ring letter B!', 'wrong letters');
eq(W('en', glyphN(6), { nameKind: 'number', nameValue: 5 }, 'add', { a: 2, b: 3 }), 'That’s number six. Let’s count again!', 'wrong maths never says the answer');
eq(W('en', glyphN(4), { nameKind: 'parity', nameValue: 'odd' }, 'oddeven', { parity: 'odd' }), 'Four is even! Let’s look for another one!', 'wrong parity');
eq(W('en', anim('fox'), { nameKind: 'letter', nameValue: 'B' }, 'initial', { letter: 'B' }), 'Fox starts with F! Let’s look again!', 'wrong initial');
eq(W('vi', anim('frog'), { nameKind: 'letter', nameValue: 'G' }, 'initial', { letter: 'G' }), 'Ếch bắt đầu bằng chữ Ê! Mình tìm lại nhé!', 'wrong initial vi');
// without e.thing: rebuilt from got + topic
eq(I.sayWrong('en', { got: { nameKind: 'color', nameValue: 'blue' }, want: { nameKind: 'color', nameValue: 'red' }, topic: 'colors' }, r0),
  'That’s the blue bell. Let’s ring the red one!', 'wrong rebuilt from got (no thing)');
eq(I.sayWrong('en', { got: { nameKind: 'number', nameValue: 2 }, want: { nameKind: 'number', nameValue: 5 }, topic: 'count', params: { n: 5, kind: 'string' } }, r0),
  'That one has two bells. Let’s ring the one with five bells!', 'wrong count rebuilt from got');
eq(I.sayWrong('en', {}, r0), 'Let’s look again!', 'wrong without anything → wrong.any');
// sweep: every thing × topic is clean and positive
const SWEEP = [['colors', COLORS.map(bell), { nameKind: 'color', nameValue: 'red' }, { color: 'red' }],
  ['shapes', SHAPES.map(s => plate(s)), { nameKind: 'shape', nameValue: 'star' }, { shape: 'star' }],
  ['size', [sbell(true), sbell(false)], { nameKind: 'size', nameValue: 'big' }, { size: 'big' }],
  ['count', [1, 2, 3, 4, 5].map(strg), { nameKind: 'number', nameValue: 3 }, { n: 3, kind: 'string' }],
  ['count', [1, 4, 7, 10, 12].map(dots), { nameKind: 'number', nameValue: 6 }, { n: 6, kind: 'dots' }],
  ['animals', ANIMALS.map(anim), { nameKind: 'animal', nameValue: 'bear' }, { animal: 'bear' }],
  ['letters', LETTERS.map(glyphL), { nameKind: 'letter', nameValue: 'B' }, { letter: 'B' }],
  ['lower', LETTERS.map(c => glyphL(c.toLowerCase())), { nameKind: 'letter', nameValue: 'g' }, { letter: 'G' }],
  ['initial', ANIMALS.map(anim), { nameKind: 'letter', nameValue: 'B' }, { letter: 'B' }],
  ['add', [3, 5, 9, 12].map(glyphN), { nameKind: 'number', nameValue: 7 }, { a: 3, b: 4 }],
  ['sub', [0, 2, 5].map(glyphN), { nameKind: 'number', nameValue: 4 }, { a: 7, b: 3 }],
  ['oddeven', [1, 2, 3, 4, 11, 20].map(glyphN), { nameKind: 'parity', nameValue: 'odd' }, { parity: 'odd' }]];
for (const lang of I.langs) for (const [topic, things, want, params] of SWEEP) for (const th of things) for (let v = 0; v < 3; v++) {
  const rng = () => v / 3, e = { thing: th, topic, params, want, got: { nameKind: th.nameKind, nameValue: th.nameValue } };
  const rt = I.sayRight(lang, e, rng), wr = I.sayWrong(lang, e, rng), pk = I.sayPickup(lang, e, rng);
  ok(clean(rt) && positive(rt), `${lang} ${topic} right ${JSON.stringify(th)}: ${rt}`);
  ok(clean(wr) && positive(wr), `${lang} ${topic} wrong ${JSON.stringify(th)}: ${wr}`);
  ok(clean(pk) && pk !== I.t(lang, 'praise', null, rng), `${lang} ${topic} name ${JSON.stringify(th)}: ${pk}`);
  if (['add', 'sub'].includes(topic)) ok(!wr.toLowerCase().includes(I.numberName(lang, want.nameValue)) || th.n === want.nameValue, `${lang} ${topic} wrong never says the answer: ${wr}`);
}
for (let i = 0; i <= 20; i++) for (const lang of I.langs) ok(clean(I.sayCount(lang, i)), `${lang} sayCount ${i}`);
eq(I.sayCount('en', 3), 'Three!', 'sayCount en');
eq(I.sayCount('vi', 3), 'Ba!', 'sayCount vi');
eq(I.sayCount('en', 25), 'Twenty-five!'.length ? I.sayCount('en', 25) : '', 'sayCount beyond 20 does not throw');
eq(I.sayCountRun('en', 3), 'One, two, three bells!', 'count run en (DESIGN)');
eq(I.sayCountRun('vi', 3), 'Một, hai, ba cái chuông!', 'count run vi (DESIGN)');
eq(I.sayCountRun('vi', 3, 'string'), 'Một, hai, ba cái chuông!', 'count run kind string');
eq(I.sayCountRun('en', 5, 'dots'), 'One, two, three, four, five dots!', 'count run dots');
eq(I.sayCountRun('en', 3, { kind: 'string', n: 3 }), 'One, two, three bells!', 'count run with a thing');
eq(I.sayCountRun('en', 1), 'One bell!', 'count run singular');
eq(I.sayCountDone('en', 3, 'string', r0), 'Three bells! Hooray!', 'countDone');
eq(I.sayCountDone('vi', 3, 'dots', r0), 'Ba chấm! Hoan hô!', 'countDone vi dots');
for (const lang of I.langs) for (let n = 1; n <= 12; n++) for (const k of ['string', 'dots']) ok(clean(I.sayCountRun(lang, n, k)), `${lang} count run ${n} ${k}`);

section('talk');
eq(I.t('en', 'talk.colors', { color: 'red' }), 'What colour is this bell?', 'talk.colors en (REQUIREMENT) — never says the answer');
eq(I.t('vi', 'talk.colors', {}), 'Chuông này màu gì nhỉ?', 'talk.colors vi');
eq(I.t('en', 'talk.colorsWhich', { color: 'red' }), 'Which bell is red?', 'talk.colorsWhich en');
eq(I.t('vi', 'talk.colorsWhich', { color: 'red' }), 'Chuông nào màu đỏ nhỉ?', 'talk.colorsWhich vi');
eq(I.t('en', 'talk.shapes', { shape: 'triangle' }), 'Which one is the triangle?', 'talk.shapes en (REQUIREMENT)');
eq(I.t('vi', 'talk.shapes', { shape: 'circle' }), 'Hình tròn là cái nào nhỉ?', 'talk.shapes vi');
eq(I.t('vi', 'talk.shapes', { shape: 'star' }), 'Hình ngôi sao là cái nào nhỉ?', 'talk.shapes vi star');
eq(I.t('en', 'talk.shapes', {}), 'What shape is this?', 'talk.shapes without shape');
eq(I.t('en', 'talk.shapes5', { shape: 'star', color: 'blue' }), 'Which one is the blue star?', 'talk.shapes5');
eq(I.t('en', 'talk.size', { size: 'big' }), 'Which bell is big?', 'talk.size en');
eq(I.t('vi', 'talk.size', { size: 'small' }), 'Chuông nào nhỏ nhỉ?', 'talk.size vi');
eq(I.t('en', 'talk.size', {}), 'Which one is big?', 'talk.size without anything');
eq(I.t('en', 'talk.count', { n: 4 }), 'How many bells?', 'talk.count en (REQUIREMENT) — never says the answer');
eq(I.t('vi', 'talk.count', { n: 4 }), 'Có mấy cái chuông nào?', 'talk.count vi');
eq(I.t('en', 'talk.count', { n: 4, kind: 'dots' }), 'How many dots?', 'talk.count dots');
eq(I.t('en', 'talk.count', { n: 1 }), 'How many bells?', 'talk.count plural even for one');
eq(I.t('en', 'talk.animals', { animal: 'bear' }), 'Where is the bear?', 'talk.animals en');
eq(I.t('vi', 'talk.animals', { animal: 'bear' }), 'Con gấu ở đâu nhỉ?', 'talk.animals vi');
eq(I.t('en', 'talk.animals', {}), 'Who is this?', 'talk.animals without animal → "Who is this?" (REQUIREMENT)');
eq(I.t('en', 'talk.animalsWho', { animal: 'bear' }), 'Who is this?', 'talk.animalsWho never says the answer');
eq(I.t('en', 'talk.letters', { letter: 'M' }), 'Where is the letter M?', 'talk.letters');
eq(I.t('en', 'talk.lower', { letter: 'G' }), 'Where is small g? It goes with big G!', 'talk.lower');
eq(I.t('vi', 'talk.initial', { animal: 'duck', letter: 'V' }), 'Vịt bắt đầu bằng chữ gì nhỉ?', 'talk.initial vi (no answer)');
eq(I.t('en', 'talk.initial', { animal: 'rabbit', letter: 'R' }), 'Which letter does rabbit start with?', 'talk.initial en from animal');
eq(I.t('en', 'talk.add', { a: 2, b: 3 }), 'What is 2 + 3?', 'talk.add');
eq(I.t('en', 'talk.add', {}), 'What is the answer?', 'talk.add without a/b');
eq(I.t('en', 'talk.oddeven', { parity: 'odd' }), 'Which number is odd?', 'talk.oddeven');
eq(I.t('vi', 'talk.oddeven', { parity: 'even' }), 'Số nào là số chẵn nhỉ?', 'talk.oddeven vi');
// Talk choices are {id, thing:{kind, …}} (ChimeArt.drawIcon kinds: any chime thing, plus number / color / size)
const CHOICES = [].concat(
  COLORS.map(c => ({ id: 'c' + c, thing: { kind: 'color', color: c } })),
  COLORS.map(c => ({ id: 'e' + c, thing: { kind: 'bell', color: c } })),
  SHAPES.map(s => ({ id: 's' + s, thing: { kind: 'plate', shape: s, color: 'red' } })),
  ANIMALS.map(a => ({ id: 'a' + a, thing: { kind: 'animal', animal: a } })),
  Array.from({ length: 13 }, (_, n) => ({ id: 'n' + n, thing: { kind: 'number', n } })),
  Array.from({ length: 12 }, (_, n) => ({ id: 'd' + (n + 1), thing: { kind: 'dots', n: n + 1 } })),
  [1, 2, 3, 4, 5].map(n => ({ id: 'b' + n, thing: { kind: 'string', n } })),
  LETTERS.map(L => ({ id: 'l' + L, thing: { kind: 'glyph', text: L } })), LETTERS.map(L => ({ id: 'q' + L, thing: { kind: 'glyph', text: L.toLowerCase() } })),
  ['big', 'small'].map(s => ({ id: 'z' + s, thing: { kind: 'size', big: s === 'big' } })),
  ['big', 'small'].map(s => ({ id: 'y' + s, thing: { kind: 'bell', color: 'red', big: s === 'big' } })));
for (const lang of I.langs) for (const c of CHOICES) {
  const ws = I.choiceWords(lang, c);
  ok(ws.length > 0 && ws.every(w => typeof w === 'string' && w && w === w.toLowerCase()), `${lang} choiceWords ${c.id}: ${ws.slice(0, 4)}`);
  const tw = I.talkWrong(lang, c);
  ok(clean(tw) && positive(tw) && tw !== I.t(lang, 'talk.wrong.any'), `${lang} talkWrong ${c.id}: ${tw}`);
  ok(clean(I.phrase(lang, c)), `${lang} phrase (aria) ${c.id}: ${I.phrase(lang, c)}`);
}
// a spoken answer picks the right picture among the choices of one Talk question
const byPrefix = (p) => CHOICES.filter(c => c.id[0] === p);
for (const lang of I.langs) for (const group of [byPrefix('c').slice(0, 3), byPrefix('e').slice(2, 5), byPrefix('s').slice(0, 3), byPrefix('a').slice(0, 3),
  byPrefix('a').slice(5, 8), byPrefix('n').slice(2, 5), byPrefix('b').slice(0, 3), byPrefix('z'), byPrefix('y')]) {
  const set = group.map(c => ({ id: c.id, words: I.choiceWords(lang, c) }));
  for (const c of group) {
    const kv = I.kindValue(c), said = I.name(lang, kv[0], kv[1]);
    eq(V.match([said], set), c.id, `${lang} talk choice said "${said}" → ${c.id}`);
    eq(V.match([I.stripMarks(said)], set), c.id, `${lang} talk choice said without marks "${I.stripMarks(said)}" → ${c.id}`);
  }
}
ok(I.choiceWords('vi', { id: 'c0', thing: { kind: 'color', color: 'blue' } }).includes('xanh duong'), 'choiceWords colour → no-mark forms');
ok(I.choiceWords('vi', { id: 't', thing: { kind: 'animal', animal: 'squirrel' } }).includes('soc'), 'choiceWords animal → "soc"');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'dots', n: 4 } }).includes('4'), 'choiceWords dots → digit');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'string', n: 2 } }).includes('two'), 'choiceWords string → number word');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'bell', color: 'red' } }).includes('red'), 'choiceWords bell → colour');
eq(I.talkWrong('en', { thing: { kind: 'color', color: 'blue' } }), 'It is blue! Good try!', 'talkWrong(colour choice)');
eq(I.talkWrong('vi', { thing: { kind: 'bell', color: 'blue' } }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'talkWrong bell colour vi');
eq(I.talkWrong('en', { thing: { kind: 'plate', shape: 'oval', color: 'red' } }), 'It is an oval! Good try!', 'talkWrong shape → an oval');
eq(I.talkWrong('en', { thing: { kind: 'animal', animal: 'owl' } }), 'It is the owl! Good try!', 'talkWrong animal');
eq(I.talkWrong('vi', { thing: { kind: 'animal', animal: 'rabbit' } }), 'Là con thỏ đó! Bé cố gắng lắm!', 'talkWrong animal vi');
eq(I.talkWrong('vi', { id: 'c1', thing: { kind: 'number', n: 7 } }), 'Là số bảy đó! Bé cố gắng lắm!', 'talkWrong number choice');
eq(I.talkWrong('en', { thing: { kind: 'string', n: 3 } }), 'It is three! Good try!', 'talkWrong string');
eq(I.talkWrong('en', { thing: { kind: 'glyph', text: 'g' } }), 'It is small letter g! Good try!', 'talkWrong small letter choice');
eq(I.talkWrong('en', { thing: { kind: 'size', big: true } }), 'It is the big one! Good try!', 'talkWrong size');
eq(I.talkWrong('vi', { thing: { kind: 'bell', color: 'red', big: true } }), 'Là chuông to đó! Bé cố gắng lắm!', 'talkWrong size vi');
eq(I.talkWrong('en', 'color', 'red'), 'It is red! Good try!', 'talkWrong colour');
eq(I.talkWrong('en', { kind: 'parity', value: 'odd' }), 'It is odd! Good try!', 'talkWrong object arg');
eq(I.talkWrong('en', 'color', null), 'Good try! Let’s ring more chimes!', 'talkWrong without value');
for (const t of TOPICS) for (const lang of I.langs) ok(clean(I.t(lang, 'talk.' + t, { animal: 'duck', size: 'big', n: 4, a: 1, b: 2, letter: 'B', color: 'red', shape: 'star', parity: 'odd' })), `${lang} talk.${t}`);
for (const lang of I.langs) for (const k of ['talk.colors', 'talk.colorsAny', 'talk.count', 'talk.countAny', 'talk.animalsAny', 'talk.animalsWho', 'talk.initial', 'talk.add', 'talk.sub'])
  ok(!/\{(n|num|ans|answer|color|animal)\}/.test(I.raw(lang, k)), `${lang} ${k} does not speak the answer`);

// the real chimes content.js (when it has landed): every prompt / Talk key + params and every chime renders clean
if (contentSB) {
  section('content.js: every promptKey / Talk key / chime it produces');
  const C = contentSB.CC.Content, RNG = contentSB.CC.RNG;
  const mkRng = (seed) => { try { return new RNG(seed); } catch (e) { return RNG(seed); } };
  let n = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of TOPICS) for (const lang of I.langs) for (let seed = 1; seed <= 6; seed++) {
    let rd = null, tk = null;
    try { rd = C.makeRound(topic, { age, lang, rng: mkRng(seed), roundIndex: seed % 4, level: seed % 4, surprise: null }); } catch (e) { /* topic not for this age */ }
    try { tk = C.makeTalk(topic, { age, lang, rng: mkRng(seed) }); } catch (e) { /* ignore */ }
    if (rd && rd.steps && rd.chimes) for (const st of rd.steps) {
      n++;
      ok(I.has(lang, st.promptKey), `${lang} content prompt key ${st.promptKey} exists`);
      const s = I.ask(lang, st.promptKey, st.params || {}, { rng: r9 });
      ok(clean(s) && positive(s) && (s !== I.t(lang, 'p.any', null, r9) || !I.PROMPTS[st.promptKey]), `${lang} ${topic} age ${age} ${st.promptKey} ${JSON.stringify(st.params)}: ${s}`);
      for (const cm of rd.chimes) {
        const e = { id: cm.id, thing: cm.thing, topic, params: st.params, promptKey: st.promptKey };
        const pu = I.sayPickup(lang, e, r9);
        ok(clean(pu) && pu !== I.t(lang, 'praise', null, r9), `${lang} ${topic} name ${JSON.stringify(cm.thing)}: ${pu}`);
        if ((st.targets || []).includes(cm.id)) {
          const f = I.sayRight(lang, Object.assign({ count: cm.thing.kind === 'string' ? { n: cm.thing.n } : undefined }, e), r9);
          ok(clean(f) && positive(f) && f !== I.t(lang, 'right.any', null, r9), `${lang} ${topic} right ${JSON.stringify(cm.thing)}: ${f}`);
        } else if (st.mode !== 'findAll' || !cm.target) {
          const w = I.sayWrong(lang, Object.assign({ got: { nameKind: cm.thing.nameKind, nameValue: cm.thing.nameValue },
            want: { nameKind: st.nameKind, nameValue: st.nameValue } }, e), r9);
          ok(clean(w) && positive(w), `${lang} ${topic} wrong ${JSON.stringify(cm.thing)} want ${st.nameKind}/${st.nameValue}: ${w}`);
          if (['colors', 'shapes', 'animals', 'size', 'letters', 'lower', 'count'].includes(topic))
            ok(!I.raw(lang, 'wrong.any').includes(w), `${lang} ${topic} wrong names the chime: ${w}`);
        }
      }
    }
    if (tk) {
      n++;
      ok(I.has(lang, tk.promptKey), `${lang} talk key ${tk.promptKey}`);
      const q = I.t(lang, tk.promptKey, tk.params || {}, r0);
      ok(clean(q), `${lang} talk ${topic} ${JSON.stringify(tk.params)}: ${q}`);
      const ids = (tk.choices || []).map(c => ({ id: c.id, words: I.choiceWords(lang, c) }));
      for (const c of tk.choices || []) {
        const tw = I.talkWrong(lang, c);
        ok(I.choiceWords(lang, c).length > 0 && clean(tw) && tw !== I.t(lang, 'talk.wrong.any'), `${lang} talk choice ${JSON.stringify(c)}: ${tw}`);
        const kv = I.kindValue(c), nm = I.name(lang, kv[0], kv[1]);
        if (kv[0] !== 'letter' && kv[0] !== 'text') eq(V.match([nm], ids), c.id, `${lang} ${topic} talk choice said "${nm}" → ${c.id}`);
      }
      ok(!/\{/.test(q) && (topic !== 'count' || !(tk.params && q.includes(String(tk.params.n)))), `${lang} talk ${topic} never says the answer: ${q}`);
    }
  }
  ok(n > 50, `content checked: ${n} steps / talks`);
}

section('speech text: letters, maths, "Kiki"');
eq(I.speech('en', 'That’s letter D. Let’s ring letter B!'), 'That’s letter dee. Let’s ring letter bee!', 'en letter names');
eq(I.speech('en', 'B is for bear!'), 'bee is for bear!', 'en "B is for"');
eq(I.speech('en', 'Fox starts with F! Let’s look again!'), 'Fox starts with eff! Let’s look again!', 'en starts with');
eq(I.speech('en', 'Big B has a little friend. Ring small b!'), 'Big bee has a little friend. Ring small bee!', 'en big/small letters');
eq(I.speech('en', 'Ding! Letter B!'), 'Ding! Letter bee!', 'en right "Letter B!"');
eq(I.speech('en', 'What is 2 + 3? Ring the answer!'), 'What is 2 plus 3? Ring the answer!', 'en plus');
eq(I.speech('vi', 'Bé ơi, 7 − 2 bằng mấy?'), 'Bé ơi, 7 trừ 2 bằng mấy?', 'vi minus');
eq(I.speech('vi', 'Bé ơi, rung chuông chữ B nhé!'), 'Bé ơi, rung chuông chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Chữ Ê, ếch!'), 'Chữ ê, ếch!', 'vi letter Ê');
eq(I.speech('vi', 'Đinh đoong! Chữ b thường!'), 'Đinh đoong! Chữ bờ thường!', 'vi small letter');
eq(I.speech('en', 'Hi! I am Kiki.'), 'Hi! I am Kiki.', 'en "Kiki" as written');
eq(I.speech('vi', 'Mình là khỉ Kiki. Kiki giúp bé nhé!'), 'Mình là khỉ Kiki. Kiki giúp bé nhé!', 'vi "Kiki" as written');
eq(I.speech('en', 'Now play our song — swipe across the chimes!'), 'Now play our song, swipe across the chimes!', 'dash → comma pause');
eq(I.speech('en', 'Ring the big bell!'), 'Ring the big bell!', '"big bell" is not a letter');
eq(I.speech('en', 'Kiki is listening…'), 'Kiki is listening.', 'ellipsis → full stop');
eq(V.spoken('vi', 'Chào bé! Mình là Kiki.'), 'Chào bé! Mình là Kiki.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Ring the letter B!'), 'Ring the letter bee!', 'Voice.spoken letter names');

section('input: tap / swipe pointer layer — (x, y, ev) in logical px, ONE finger, extra fingers ignored');
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
  sb4.CC = {};
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
  sb7.CC = {};
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
  sb5.CC = {};
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
  sb6.CC = {};
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
ok(sb.CC.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into CC.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof CC.Input.attach === 'function' && typeof CC.Input.kidProof === 'function' && typeof CC.Input.holdButton === 'function',
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
  sbx.CC = {};
  env.CC = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.CC.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Kiki: rate 0.9, pitch 1.2');
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
  // vi: "Kiki" goes to TTS as written, letter names are rewritten; the bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là khỉ Kiki. Bé rung chuông chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là khỉ Kiki. Bé rung chuông chữ bờ nhé!', 'vi utterance: "Kiki" kept, "chữ bờ"');
  eq(startText, 'Mình là khỉ Kiki. Bé rung chuông chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animals', { animal: 'duck' }, { lang: 'vi' });
  ok(/^(Bé ơi, rung chuông con vịt nhé!|Chuông con vịt đâu rồi nhỉ\? Bé rung nào!|Rung chuông con vịt nào!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read CC.debug.voiceLog)');
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
  E3.CC.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['duck', 'rabbit', 'frog']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the bunny')] });
  eq((await pr2).id, 'rabbit', 'interim match resolves after a short wait');
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
