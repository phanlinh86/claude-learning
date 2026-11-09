#!/usr/bin/env node
// Pom's Puzzle Town — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/elephant-city-jigsaw:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (§5.1 content, §6 voice). When the jigsaw content.js exists
// (PZ.Content making rounds with `pieces`), every prompt / Talk key + params it produces and every piece are checked too.
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
  return sb.PZ;
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
    !/mảnh mảnh|chiếc chiếc|quả quả/i.test(s) && !/\ba [aeiou]/i.test(s.replace(/letter a /ig, ''));
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

// ------------------------------------------------------------------ DESIGN value lists (§5.1, §6)
const ANIMALS = ['duck', 'cat', 'dog', 'cow', 'pig', 'frog', 'lion', 'rabbit'];
const OBJECTS = ['car', 'bus', 'balloon', 'kite', 'umbrella', 'house', 'flower', 'hat'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.PZ = { debug: { voiceLog: [] } };
let PZ;
try { PZ = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = PZ.I18N, V = PZ.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  ok(!/Bun\b|Dino Dig|DD\./.test(src), `${f}: no sister-game names left (Bun / Dino Dig / DD.)`);
}
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.OBJECTS), JSON.stringify(OBJECTS), 'I18N.OBJECTS = DESIGN list');
eq(JSON.stringify(I.SHAPES), JSON.stringify(SHAPES), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
for (const fn of ['t', 'ask', 'name', 'words', 'choiceWords', 'piecePhrase', 'phrase', 'sayPickup', 'sayTap', 'sayPlaced', 'sayWrong',
  'sayCount', 'sayCountRun', 'sayCountDone', 'talkWrong', 'speech', 'setChild', 'has', 'keys', 'raw', 'initialOf', 'kindValue'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// the jigsaw content.js (written by the mechanics engineer, in parallel): loaded when it makes rounds with pieces
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  try {
    const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
    if (/pieces/.test(csrc) && !/mounds:/.test(csrc)) {
      const sbc = makeSandbox(); sbc.PZ = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.PZ.Content && sbc.PZ.Content.makeRound) contentSB = sbc;
    }
  } catch (e) { ok(false, 'content.js load: ' + e.message); }
}
console.log(`   (${contentSB ? 'jigsaw content.js loaded' : 'jigsaw content.js not there yet — content checks skipped'})`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapPom', 'tapHint', 'quieter', 'louder', 'skip', 'gallery', 'langName.en', 'langName.vi'];
// every data-i18n / T('ui.…') this game's index.html, ui.js and main.js use must exist
const usedUi = new Set();
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, 'game', f), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="(ui\.[\w.]+)"/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/T1?\((?:lang, )?'(ui\.[\w.]+)'/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/'((?:ui|talk|topic|weather|surprise|session|pigeon|bubble)\.[\w.]+)'/g)) usedUi.add(m[1]);
}
ok(usedUi.size >= 10, 'found the ui keys index.html / ui.js / main.js use (' + usedUi.size + ')');
const usedNow = [...usedUi].filter(k => !/^(surprise\.(mole|ptero)|mole\.|ptero\.)/.test(k) && !/\.$/.test(k));
const PROMPT_KEYS = Object.keys(I.PROMPTS);
eq(PROMPT_KEYS.slice().sort().join(','), ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.animals', 'p.count', 'p.letters', 'p.lower',
  'p.initial', 'p.add', 'p.sub', 'p.oddeven'].sort().join(','), 'PROMPTS = the DESIGN §6 prompt keys');
const LINE_KEYS = ['p.any', 'p.next', 'p.sizeAny', 'pickup', 'tap', 'placed', 'placed.label', 'placed.parity', 'placed.initial', 'placed.sum',
  'placed.any', 'countDone', 'nearMiss', 'wrong.thing', 'wrong.count', 'wrong.math', 'wrong.parity', 'wrong.initial', 'wrong.any',
  'stepDone', 'alive', 'toot', 'enter', 'hint', 'idle', 'praise', 'great', 'party', 'surprise.pigeon', 'pigeon.tap',
  'surprise.bubbles', 'bubble.pop', 'session.done'];
const TALK_KEYS = ['talk.intro', 'talk.right', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.size', 'talk.wrong.letter',
  'talk.wrong.small', 'talk.wrong.number', 'talk.wrong.any', 'talk.colorsAny', 'talk.colorsWhich', 'talk.shapesAny', 'talk.shapes5',
  'talk.sizeOne', 'talk.sizeAny', 'talk.countAny', 'talk.animalsAny', 'talk.animalsWho', 'talk.lettersAny', 'talk.lowerAny',
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
// no dig / Bun words left
for (const k of enKeys) ok(!/scoop|found\.|hatch|mole|ptero|already|busy/i.test(k), `no dig-only key: ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(!/\bBun\b|\bdig|\bsand\b|mound|treasure|dino|\bbone|\begg\b|đào|cát|kho báu|khủng long|xương|trứng/i.test(s), `${lang} ${k}: no dig words: ${s}`);
// instructions and reactions have 3 wordings
for (const lang of I.langs) for (const k of PROMPT_KEYS.concat(['p.any', 'p.next', 'p.sizeAny', 'enter', 'tap', 'placed', 'placed.label',
  'placed.parity', 'placed.initial', 'placed.sum', 'placed.any', 'countDone', 'nearMiss', 'wrong.thing', 'wrong.count', 'wrong.math',
  'wrong.parity', 'wrong.initial', 'wrong.any', 'stepDone', 'alive', 'toot', 'hint', 'idle', 'surprise.pigeon', 'pigeon.tap',
  'surprise.bubbles', 'bubble.pop', 'session.done', 'party', 'praise', 'great']))
  ok([].concat(I.raw(lang, k)).length >= 3, `${lang} ${k}: 3 wordings`);
for (const lang of I.langs) for (const k of TOPICS.map(t => 'topic.' + t)) ok(!Array.isArray(I.raw(lang, k)), `${lang} ${k} is one banner string`);

section('titles, Pom, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.title'), 'Pom’s Puzzle Town', 'en title');
eq(I.t('en', 'ui.logo1'), 'Pom’s', 'en logo line 1');
eq(I.t('en', 'ui.logo2'), 'Puzzle Town', 'en logo line 2');
eq(I.t('vi', 'ui.logo1'), 'Voi Pom', 'vi logo line 1');
eq(I.t('vi', 'ui.logo2'), 'Ghép Hình', 'vi logo line 2');
eq(I.t('vi', 'ui.title'), 'Voi Pom Ghép Hình', 'vi title');
eq(I.t('en', 'ui.voice'), 'Pom’s voice', 'voice setting names Pom');
eq(I.t('vi', 'ui.voice'), 'Giọng của Pom', 'vi voice setting names Pom');
eq(I.t('en', 'ui.volume'), 'Volume', 'ui.volume');
eq(I.t('vi', 'ui.volume'), 'Âm lượng', 'vi ui.volume');
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /Bé ơi/.test(s)), `vi ${k}: a warm "Bé ơi" wording`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /nhé|nào|nha/.test(s)), `vi ${k}: "nhé / nào"`);
for (const k of ['p.colors', 'p.sizeAny', 'p.any', 'hint', 'nearMiss'])
  ok([].concat(I.raw('vi', k)).some(s => /mảnh/i.test(s)), `vi ${k}: says "mảnh (ghép)"`);
for (const k of ['p.colors', 'p.any', 'hint']) ok([].concat(I.raw('en', k)).some(s => /piece/.test(s)), `en ${k}: says "piece"`);
for (const k of I.keys('vi')) if (!/^ui\.langName|^pickup$/.test(k))
  ok(JSON.stringify(I.raw('vi', k)) !== JSON.stringify(I.raw('en', k)), `vi ${k} is translated`);
for (const k of I.keys('vi')) if (!/^ui\.langName|^count\.|^ui\.(chapter|years|logo1)$|^pickup$/.test(k))
  for (const s of [].concat(I.raw('vi', k))) if (/[a-z]{3}/i.test(s.replace(/\{\w+\}/g, '')) && s.replace(/\{\w+\}/g, '').trim().split(/\s+/).length >= 2)
    ok(VI_DIACRITIC.test(s), `vi ${k} has Vietnamese diacritics: ${s}`);
for (const k of ['p.colors', 'p.count', 'placed', 'wrong.thing']) ok([].concat(I.raw('en', k)).every(s => !VI_DIACRITIC.test(s)), `en ${k} has no Vietnamese text`);

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  for (const s of [].concat(I.raw(lang, k))) ok(positive(s), `${lang} ${k} is positive: ${s}`);
}

section('every string renders, no "{" left, no "màu màu"');
const SAMPLE = { n: 3, a: 2, b: 4, stars: 7, color: 'red', shape: 'star', size: 'big', animal: 'duck', obj: 'car',
  letter: 'B', lower: 'b', word: 'duck', first: 'D', expr: '2+3', ans: 'five', num: 'seven', parity: 'odd', label: 'letter B',
  thing: { kind: 'obj', obj: 'kite', color: 'blue' }, got: { nameKind: 'shape', nameValue: 'circle' },
  want: { nameKind: 'shape', nameValue: 'triangle' }, answer: 'red' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let v = 0; v < raw.length; v++) {
    const rng = () => (v + 0.5) / raw.length;
    for (const child of ['', 'Mai']) {
      const s = I.t(lang, k, Object.assign({ child }, SAMPLE), rng);
      ok(clean(s), `${lang} ${k} [${v}] child="${child}" renders clean: ${s}`);
    }
    ok(clean(I.t(lang, k, null, rng)), `${lang} ${k} [${v}] renders clean without params: ${I.t(lang, k, null, rng)}`);
  }
}
I.setChild('');
ok(!/friend|\bbé\b,/.test(I.t('en', 'great', null, r9)), 'great without a name picks a no-name variant');
I.setChild('Mai');
eq(I.t('en', 'ui.welcome'), 'Hi Mai! I am Pom. Let’s do puzzles!', 'welcome with the child name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé Mai! Mình là voi Pom. Mình cùng ghép hình nhé!', 'vi welcome with the child name');
eq(I.t('en', 'great', null, r0), 'Great puzzling, Mai!', 'great: "Great puzzling, {child}!" (REQUIREMENT)');
eq(I.t('vi', 'great', null, r0), 'Bé Mai ghép giỏi quá!', 'vi great with the name');
I.setChild('');
eq(I.t('en', 'ui.welcome'), 'Hi! I am Pom. Let’s do puzzles!', 'welcome without a name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé! Mình là voi Pom. Mình cùng ghép hình nhé!', 'vi welcome without a name');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'ui.chapter');
eq(I.t('vi', 'session.done', { stars: 12 }, r0), 'Một ngày ghép hình tuyệt quá! 12 ngôi sao!', 'vi session.done');
eq(I.t('en', 'session.done', { stars: 12 }, r0), 'What a puzzle day! 12 stars! Hooray!', 'en session.done');
eq(I.t('en', 'weather.0'), 'Spring flowers!', 'weather.0 spring (DESIGN)');
eq(I.t('en', 'weather.1'), 'Sunny summer!', 'weather.1 summer');
eq(I.t('en', 'weather.2'), 'Autumn leaves!', 'weather.2 autumn');
eq(I.t('en', 'weather.3'), 'Snowy winter!', 'weather.3 winter');
ok(/xuân/.test(I.t('vi', 'weather.0')) && /hè/.test(I.t('vi', 'weather.1')) && /thu/.test(I.t('vi', 'weather.2')) && /đông/.test(I.t('vi', 'weather.3')), 'vi seasons');
eq(I.t('en', 'enter', null, r0), 'A new picture!', 'enter (DESIGN)');
eq(I.t('en', 'nearMiss', null, r0), 'It goes here — look at the shadow!', 'nearMiss (DESIGN)');
eq(I.t('en', 'alive', null, r0), 'The picture is done — look, it moves!', 'alive (REQUIREMENT)');
eq(I.t('vi', 'alive', null, r0), 'Bức tranh xong rồi — nhìn kìa, nó chuyển động!', 'vi alive (REQUIREMENT)');
eq(I.t('en', 'toot', null, r0), 'Toot toot!', 'toot (DESIGN)');
eq(I.t('en', 'placed.any', null, r0), 'Click! It fits!', 'placed.any (REQUIREMENT)');
eq(I.t('vi', 'placed.any', null, r0), 'Cạch! Vừa khít rồi!', 'vi placed.any (REQUIREMENT)');
eq(I.t('en', 'p.nonsense', null, r0), I.t('en', 'p.any', null, r0), 'unknown prompt key → p.any');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key → the key');

section('prompts: DESIGN examples, every param filled, plurals, fallbacks');
eq(I.t('en', 'p.colors', { color: 'red' }, r0), 'Find the red piece!', 'p.colors en (DESIGN)');
eq(I.t('vi', 'p.colors', { color: 'red' }, r0), 'Bé ơi, tìm mảnh ghép màu đỏ nhé!', 'p.colors vi (DESIGN)');
eq(I.t('en', 'p.shapes', { shape: 'triangle' }, r0), 'Find the triangle!', 'p.shapes en (DESIGN)');
eq(I.t('vi', 'p.shapes', { shape: 'triangle' }, r0), 'Bé ơi, tìm hình tam giác nhé!', 'p.shapes vi');
eq(I.t('vi', 'p.shapes', { shape: 'star' }, r0), 'Bé ơi, tìm ngôi sao nhé!', 'p.shapes vi star (DESIGN §6 "ngôi sao")');
eq(I.t('en', 'p.shapes5', { shape: 'star', color: 'blue' }, r0), 'Find the blue star!', 'p.shapes5 en (DESIGN)');
eq(I.t('vi', 'p.shapes5', { shape: 'star', color: 'blue' }, r0), 'Bé ơi, tìm ngôi sao màu xanh dương nhé!', 'p.shapes5 vi');
eq(I.t('en', 'p.shapes5', { shape: 'heart' }, r0), 'Find the heart!', 'p.shapes5 without colour → p.shapes');
eq(I.t('en', 'p.size', { size: 'big', obj: 'car' }, r0), 'Find the big car!', 'p.size en (DESIGN)');
eq(I.t('vi', 'p.size', { size: 'big', obj: 'car' }, r0), 'Bé ơi, tìm chiếc ô tô to nhé!', 'p.size vi');
eq(I.t('vi', 'p.size', { size: 'small', obj: 'balloon' }, r0), 'Bé ơi, tìm quả bóng bay nhỏ nhé!', 'p.size vi balloon');
eq(I.t('en', 'p.size', { size: 'small', animal: 'cow' }, r0), 'Find the small cow!', 'p.size with an animal');
eq(I.t('en', 'p.size', { size: 'big' }, r0), 'Find the big piece!', 'p.size without obj → p.sizeAny');
eq(I.t('en', 'p.animals', { animal: 'dog' }, r0), 'Where is the dog?', 'p.animals en (REQUIREMENT)');
eq(I.t('vi', 'p.animals', { animal: 'dog' }, r0), 'Con chó đâu rồi nhỉ?', 'p.animals vi (REQUIREMENT)');
eq(I.t('vi', 'p.animals', { animal: 'rabbit' }, () => 0.5), 'Bé ơi, tìm con thỏ nhé!', 'p.animals vi rabbit');
eq(I.t('en', 'p.count', { n: 3 }, r0), 'Find the piece with three balloons!', 'p.count en (REQUIREMENT)');
eq(I.t('en', 'p.count', { n: 1 }, r0), 'Find the piece with one balloon!', 'p.count singular');
eq(I.t('vi', 'p.count', { n: 3 }, r0), 'Bé ơi, tìm mảnh có ba quả bóng bay nhé!', 'p.count vi (REQUIREMENT)');
eq(I.t('en', 'p.count', { n: 7, kind: 'dots' }, r0), 'Find the piece with seven dots!', 'p.count dots (DESIGN "with {n} dots")');
eq(I.t('vi', 'p.count', { n: 7, kind: 'dots' }, r0), 'Bé ơi, tìm mảnh có bảy chấm nhé!', 'p.count dots vi');
eq(I.t('en', 'p.count', { n: 1, kind: 'dots' }, r0), 'Find the piece with one dot!', 'p.count one dot');
eq(I.t('en', 'p.letters', { letter: 'B' }, r0), 'Find the letter B!', 'p.letters en');
eq(I.t('vi', 'p.letters', { letter: 'B' }, r0), 'Bé ơi, tìm chữ B nhé!', 'p.letters vi');
eq(I.t('en', 'p.lower', { letter: 'B' }, () => 0.5), 'Find small b!', 'p.lower en');
eq(I.t('en', 'p.lower', { letter: 'b' }, r0), 'Big B has a little friend. Find small b!', 'p.lower given a small letter');
eq(I.t('en', 'p.initial', { letter: 'D' }, r0), 'Find the animal that starts with D!', 'p.initial en');
eq(I.t('en', 'p.add', { a: 2, b: 3 }, r0), 'What is 2 + 3? Find the answer piece!', 'p.add en');
eq(I.t('vi', 'p.sub', { a: 7, b: 2 }, r0), 'Bé ơi, 7 − 2 bằng mấy? Bé tìm mảnh đáp án nhé!', 'p.sub vi');
eq(I.t('en', 'p.oddeven', { parity: 'odd' }, r0), 'Put in all the odd numbers!', 'p.oddeven en (REQUIREMENT)');
eq(I.t('vi', 'p.oddeven', { parity: 'even' }, r0), 'Bé ơi, ghép hết các số chẵn vào nhé!', 'p.oddeven vi');
eq(I.t('en', 'p.colors', {}, r0), I.t('en', 'p.any', null, r0), 'p.colors without colour → p.any');
eq(I.t('en', 'p.add', { a: 2 }, r0), I.t('en', 'p.any', null, r0), 'p.add without b → p.any');
eq(I.ask('en', 'p.colors', { color: 'red' }, { rng: r0 }), 'Find the red piece!', 'ask = the prompt');
eq(I.ask('en', 'p.colors', { color: 'red' }, { next: true, rng: r0 }), 'Next one! Find the red piece!', 'ask next → "Next one!" prefix');
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };   // ask: the prompt's rng first, then p.next
eq(I.ask('en', 'p.animals', { animal: 'dog' }, { next: true, rng: seq(0, 0.7) }), 'Now, where is the dog?', 'ask next "Now," runs into the prompt');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { next: true, rng: seq(0.4, 0.7) }), 'Giờ thì mảnh ghép màu đỏ ở đâu nhỉ?', 'vi ask next "Giờ thì …"');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { next: true, rng: seq(0, 0.7) }), 'Giờ thì bé tìm mảnh ghép màu đỏ nhé!', 'vi ask next → "Giờ thì bé tìm …" (no "bé ơi" mid-sentence)');
eq(I.ask('vi', 'p.add', { a: 2, b: 3 }, { next: true, rng: seq(0, 0.7) }), 'Giờ thì 2 + 3 bằng mấy? Bé tìm mảnh đáp án nhé!', 'vi ask next: no "bé ơi" mid-sentence before a sum');
eq(I.ask('vi', 'p.colors', { color: 'green' }, { next: true, rng: seq(0, 0.4) }), 'Tiếp nào! Bé tìm mảnh ghép màu xanh lá nhé!', 'vi ask next: "Thêm một mảnh nữa nhé!" never before a "… nhé!" prompt, no "Bé ơi," mid-sentence');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { next: true, rng: seq(0.7, 0) }), 'Thêm một mảnh nữa nhé! Bé tìm mảnh ghép màu đỏ nào!', 'vi ask next: "Tiếp nào!" never before a "… nào!" prompt');
for (const k of ['p.colors', 'p.shapes', 'p.animals', 'p.letters', 'p.count', 'p.add', 'p.oddeven']) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
  const q = I.ask('vi', k, { color: 'red', shape: 'star', animal: 'dog', letter: 'B', num: 3, n: 3, kind: 'bunch', a: 2, b: 3, parity: 'odd' }, { next: true, rng: seq((a + 0.5) / 3, (b + 0.5) / 3) });
  ok(!/.+Bé ơi/.test(q) && !/nhé!.*nhé!/.test(q) && !/nào!.*nào!/.test(q), `vi ask next ${k} [${a},${b}]: ${q}`);
}
eq(I.ask('vi', 'p.animals', { animal: 'lion' }, { next: true, rng: r0 }), 'Tiếp nào! Con sư tử đâu rồi nhỉ?', 'vi ask next');
// sweeps
for (const lang of I.langs) for (const color of COLORS) {
  const raw = [].concat(I.raw(lang, 'p.colors'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.colors', { color }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s) && s.toLowerCase().includes(I.name(lang, 'color', color)), `${lang} p.colors ${color} [${v}]: ${s}`);
  }
  for (let v = 0; v < 3; v++) for (const k of PROMPT_KEYS)
    ok(clean(I.ask(lang, k, { color, shape: 'star', size: 'big', obj: 'hat', animal: 'cat', n: 4, letter: 'M', a: 3, b: 1, parity: 'even' },
      { next: true, rng: () => (v + 0.5) / 3 })), `${lang} ask next ${k} ${color} [${v}]`);
}
for (const lang of I.langs) for (const k of ['p.shapes', 'p.shapes5']) for (const shape of SHAPES) for (const color of COLORS.concat([null])) {
  const raw = [].concat(I.raw(lang, k));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, k, { shape, color }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s) && s.toLowerCase().includes(I.name(lang, 'shape', shape)), `${lang} ${k} ${shape} ${color} [${v}]: ${s}`);
  }
}
for (const lang of I.langs) for (const o of OBJECTS) for (const size of ['big', 'small']) {
  const raw = [].concat(I.raw(lang, 'p.size'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.size', { size, obj: o }, () => (v + 0.5) / raw.length);
    ok(clean(s) && s.includes(I.name(lang, 'size', size)) && s.toLowerCase().includes(I.name(lang, 'obj', o)), `${lang} p.size ${size} ${o} [${v}]: ${s}`);
  }
}
for (const lang of I.langs) for (const animal of ANIMALS) {
  const raw = [].concat(I.raw(lang, 'p.animals'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.animals', { animal }, () => (v + 0.5) / raw.length);
    ok(clean(s) && s.toLowerCase().includes(I.name(lang, 'animal', animal)), `${lang} p.animals ${animal} [${v}]: ${s}`);
  }
}
for (const lang of I.langs) for (const kind of ['bunch', 'dots', undefined]) for (let n = 1; n <= 12; n++) {
  const raw = [].concat(I.raw(lang, 'p.count'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.count', { n, kind }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s) && s.includes(I.name(lang, 'number', n)), `${lang} p.count ${kind} ${n} [${v}]: ${s}`);
    if (lang === 'en') {
      const item = kind === 'dots' ? 'dot' : 'balloon';
      ok(n === 1 ? new RegExp('\\bone ' + item + '\\b').test(s) : s.includes(I.name('en', 'number', n) + ' ' + item + 's'), `en p.count n=${n} plural ok: ${s}`);
    }
  }
}
for (const lang of I.langs) for (const L of LETTERS) for (const k of ['p.letters', 'p.lower', 'p.initial'])
  ok(clean(I.t(lang, k, { letter: L }, r9)), `${lang} ${k} ${L}`);
for (const lang of I.langs) for (let a = 0; a <= 10; a++) for (const k of ['p.add', 'p.sub'])
  ok(clean(I.t(lang, k, { a: a + 3, b: a }, r9)), `${lang} ${k} ${a}`);
for (const lang of I.langs) for (const parity of ['odd', 'even']) ok(clean(I.t(lang, 'p.oddeven', { parity }, r9)), `${lang} p.oddeven ${parity}`);

section('names for every kind × value (DESIGN §6)');
const NAME_CASES = { color: COLORS, hue: COLORS, shape: SHAPES, size: ['big', 'small'], obj: OBJECTS, animal: ANIMALS, word: ANIMALS,
  parity: ['odd', 'even'] };
const DESIGN_VI = {
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam', purple: 'màu tím', pink: 'màu hồng' },
  hue: { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' },
  obj: { car: 'chiếc ô tô', bus: 'chiếc xe buýt', balloon: 'quả bóng bay', kite: 'con diều', umbrella: 'chiếc ô', house: 'ngôi nhà',
    flower: 'bông hoa', hat: 'chiếc mũ' },
  animal: { duck: 'con vịt', cat: 'con mèo', dog: 'con chó', cow: 'con bò', pig: 'con heo', frog: 'con ếch', lion: 'con sư tử', rabbit: 'con thỏ' },
  word: { duck: 'vịt', cat: 'mèo', dog: 'chó', cow: 'bò', pig: 'heo', frog: 'ếch', lion: 'sư tử', rabbit: 'thỏ' },
  size: { big: 'to', small: 'nhỏ' },
  shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
    rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' } };
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const v of vals) for (const lang of I.langs) {
  const n = I.name(lang, kind, v);
  ok(clean(n) && n !== 'undefined', `${lang} name ${kind} ${v}: ${n}`);
  if (lang === 'vi' && kind !== 'word') ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
  const want = lang === 'vi' ? DESIGN_VI[kind] : null;
  if (want && want[v]) eq(n, want[v], `${lang} ${kind} ${v} = DESIGN §6`);
}
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'rect → rectangle');
eq(I.name('vi', 'color', 'red', { bare: true }), 'đỏ', 'bare colour option');
eq(I.name('en', 'animal', 'dog', { size: 'big' }), 'big dog', 'en animal with size');
eq(I.name('vi', 'obj', 'car', { size: 'small' }), 'chiếc ô tô nhỏ', 'vi obj with size');
eq(I.name('en', 'obj', 'umbrella', { size: 'big' }), 'big umbrella', 'en obj with size');
for (let n = 0; n <= 20; n++) for (const lang of I.langs) ok(clean(I.name(lang, 'number', n)) && !/\d/.test(I.name(lang, 'number', n)), `${lang} number ${n} → a word`);
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('en', 'number', 12), 'twelve', 'en 12');
for (const L of LETTERS) { ok(clean(I.name('en', 'letter', L)), 'en letter ' + L); ok(clean(I.name('vi', 'letter', L)), 'vi letter ' + L); }
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi phonics B');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi phonics K');
eq(I.name('vi', 'letter', 'Ê'), 'ê', 'vi letter Ê');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('en', 'text', '4+1'), 'four plus one', 'text expr');
eq(I.name('vi', 'parity', 'even'), 'chẵn', 'vi even');
eq(I.name('en', 'dots', 3), 'three dots', 'dots');
eq(I.name('en', 'dots', 1), 'one dot', 'one dot');
eq(I.name('vi', 'dots', 4), 'bốn chấm', 'vi dots (DESIGN "chấm")');
eq(I.name('en', 'bunch', 3), 'three balloons', 'bunch');
eq(I.name('en', 'bunch', 1), 'one balloon', 'bunch of one');
eq(I.name('vi', 'bunch', 2), 'hai quả bóng bay', 'vi bunch');
for (let n = 1; n <= 12; n++) for (const lang of I.langs) for (const k of ['dots', 'bunch']) ok(clean(I.name(lang, k, n)), `${lang} ${k} ${n}`);
// initial-topic default words
for (const lang of I.langs) for (const e of PZ.WORDS[lang]) {
  ok(ANIMALS.includes(e.animal), `${lang} word ${e.word} is a DESIGN animal`);
  ok(!/^con /.test(e.word), `${lang} initial word ${e.word} has no classifier`);
  eq(I.initialOf(lang, e.animal).first, e.initial, `${lang} initialOf ${e.animal}`);
}
eq(I.initialOf('vi', 'frog').first, 'Ê', 'vi ếch → Ê (letter marks kept, tone dropped)');
eq(I.initialOf('vi', 'rabbit').first, 'T', 'vi thỏ → T');
eq(I.initialOf('en', 'rabbit').first, 'R', 'en rabbit → R');
for (const e of PZ.WORDS.vi) ok(I.LETTER_VI[e.initial] != null, `vi initial ${e.initial} has a phonics name`);
eq(I.phrase('en', { nameKind: 'shape', nameValue: 'oval' }), 'the oval', 'phrase shape en');
eq(I.phrase('vi', { nameKind: 'animal', nameValue: 'cat' }), 'con mèo', 'phrase animal vi');
eq(I.phrase('en', { nameKind: 'size', nameValue: 'small', obj: 'bus' }), 'the small bus', 'phrase size of a bus');
eq(I.phrase('vi', { nameKind: 'size', nameValue: 'small', obj: 'bus' }), 'chiếc xe buýt nhỏ', 'phrase size vi');
eq(I.phrase('en', { nameKind: 'size', nameValue: 'big' }), 'the big one', 'phrase size, unknown thing');
eq(I.phrase('en', { nameKind: 'letter', nameValue: 'd' }), 'small d', 'phrase small letter');
eq(I.phrase('vi', { nameKind: 'letter', nameValue: 'D' }), 'chữ D', 'phrase letter vi');
eq(I.phrase('vi', 'number', 5), 'số năm', 'phrase number vi');
eq(I.phrase('en', { kind: 'obj', obj: 'kite', color: 'blue' }), 'the blue kite', 'phrase of a piece thing');
eq(I.phrase('vi', { id: 'c', thing: { kind: 'color', color: 'green' } }), 'màu xanh lá', 'phrase of a Talk choice (aria label)');

section('piecePhrase for every piece kind × value');
for (const lang of I.langs) {
  for (const o of OBJECTS) for (const c of COLORS) {
    const p = I.piecePhrase(lang, { kind: 'obj', obj: o, color: c });
    eq(p, lang === 'en' ? 'the ' + c + ' ' + o : I.name('vi', 'obj', o) + ' ' + I.name('vi', 'color', c), `${lang} obj ${o} ${c}`);
    for (const big of [true, false]) {
      const q = I.piecePhrase(lang, { kind: 'obj', obj: o, color: c, big, nameKind: 'size', nameValue: big ? 'big' : 'small' });
      ok(clean(q) && q.includes(I.name(lang, 'size', big ? 'big' : 'small')) && !q.includes(I.name(lang, 'hue', c)), `${lang} size obj ${o} ${big}: ${q}`);
    }
  }
  for (const s of SHAPES) for (const c of COLORS) {
    eq(I.piecePhrase(lang, { kind: 'shape', shape: s, color: c }), lang === 'en' ? 'the ' + I.name('en', 'shape', s) : I.name('vi', 'shape', s), `${lang} shape ${s} (one-colour round: no colour)`);
    const p = I.piecePhrase(lang, { kind: 'shape', shape: s, color: c }, { color: true });
    ok(clean(p) && p.includes(I.name(lang, 'shape', s)) && p.includes(I.name(lang, 'color', c)), `${lang} shape ${s} ${c} with colour: ${p}`);
  }
  for (const a of ANIMALS) eq(I.piecePhrase(lang, { kind: 'animal', animal: a }), (lang === 'en' ? 'the ' : '') + I.name(lang, 'animal', a), `${lang} animal ${a}`);
  for (let n = 1; n <= 12; n++) {
    eq(I.piecePhrase(lang, { kind: 'bunch', n }), I.name(lang, 'bunch', n), `${lang} bunch ${n}`);
    eq(I.piecePhrase(lang, { kind: 'dots', n }), I.name(lang, 'dots', n), `${lang} dots ${n}`);
  }
  for (const L of LETTERS) ok(clean(I.piecePhrase(lang, { kind: 'glyph', text: L })) && clean(I.piecePhrase(lang, { kind: 'glyph', text: L.toLowerCase() })), `${lang} glyph ${L}`);
  for (let n = 0; n <= 20; n++) ok(clean(I.piecePhrase(lang, { kind: 'glyph', text: String(n) })), `${lang} glyph ${n}`);
}
eq(I.piecePhrase('en', { kind: 'obj', obj: 'umbrella', color: 'orange' }, { art: 'a' }), 'an orange umbrella', '"an orange umbrella"');
eq(I.piecePhrase('en', { kind: 'glyph', text: 'B' }), 'letter B', 'glyph letter');
eq(I.piecePhrase('en', { kind: 'glyph', text: 'b' }), 'small b', 'glyph small letter');
eq(I.piecePhrase('vi', { kind: 'glyph', text: 'b' }), 'chữ b thường', 'vi glyph small letter');
eq(I.piecePhrase('vi', { kind: 'glyph', text: '7' }), 'số bảy', 'vi glyph number');
eq(I.piecePhrase('en', { kind: 'glyph', text: '7' }, { bare: true }), 'seven', 'glyph number bare');
eq(I.piecePhrase('en', {}), '', 'unknown thing → ""');
eq(I.piecePhrase('en', null), '', 'null thing → ""');

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
const MATCH_CASES = { color: COLORS, shape: SHAPES.filter(s => s !== 'rect'), size: ['big', 'small'], animal: ANIMALS, obj: OBJECTS, parity: ['odd', 'even'] };
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
}
for (const [said, want] of [['su tu', 'lion'], ['con lợn', 'pig'], ['cún', 'dog'], ['vit', 'duck'], ['ech', 'frog'], ['con thỏ', 'rabbit'], ['tho', 'rabbit'], ['meo', 'cat'], ['bo', 'cow']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['a doggy', 'dog'], ['kitty', 'cat'], ['piggy', 'pig'], ['a bunny', 'rabbit'], ['moo', 'cow'], ['froggy', 'frog']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
const objVi = ch('vi', 'obj', OBJECTS), objEn = ch('en', 'obj', OBJECTS);
for (const [said, want] of [['ô tô', 'car'], ['xe o to', 'car'], ['xe buýt', 'bus'], ['bóng bay', 'balloon'], ['cái diều', 'kite'], ['cái ô', 'umbrella'],
  ['cây dù', 'umbrella'], ['ngôi nhà', 'house'], ['bông hoa', 'flower'], ['cái nón', 'hat'], ['mu', 'hat']])
  eq(V.match([said], objVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['a car', 'car'], ['the bus', 'bus'], ['balloons', 'balloon'], ['kite', 'kite'], ['an umbrella', 'umbrella'], ['house', 'house'], ['flower', 'flower'], ['a hat', 'hat']])
  eq(V.match([said], objEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['xanh'], ch('vi', 'color', COLORS)), null, '"xanh" alone is ambiguous');
eq(V.match(['màu xanh dương'], ch('vi', 'color', COLORS)), 'blue', 'vi "màu xanh dương"');
eq(V.match(['mau do'], ch('vi', 'color', COLORS)), 'red', 'vi no-diacritic "mau do"');
eq(V.match(['ô tô màu đỏ'], ch('vi', 'color', COLORS)), 'red', 'vi "ô tô màu đỏ" → red');
eq(V.match(['the red car'], ch('en', 'color', COLORS)), 'red', 'en "the red car" → red');
eq(V.match(['ba'], ch('vi', 'number', [3, 5, 12])), '3', '"ba" → 3');
eq(V.match(['muoi hai'], ch('vi', 'number', [3, 5, 12])), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], ch('en', 'number', [3, 5, 12])), '5', '"I think five"');
eq(V.match(['three balloons'], ch('en', 'number', [2, 3, 4])), '3', 'en "three balloons" → 3');
eq(V.match(['ba quả bóng'], ch('vi', 'number', [2, 3, 4])), '3', 'vi "ba quả bóng" → 3');
eq(V.match(['bốn chấm'], ch('vi', 'dots', [2, 4, 6])), '4', 'vi "bốn chấm" → 4');
eq(V.match(['7'], ch('en', 'number', [6, 7, 8])), '7', 'digit transcript "7"');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
eq(V.match(['số chẵn'], ch('vi', 'parity', ['odd', 'even'])), 'even', '"số chẵn"');
eq(V.match(['bee'], ch('en', 'letter', ['A', 'B', 'C'])), 'B', '"bee" → B');
eq(V.match(['chữ tờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'T', '"chữ tờ" → T');
eq(V.match(['two plus three'], ch('en', 'sum', ['2+3', '1+1'])), '2+3', 'en sum spoken');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['ngôi sao'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'star', 'vi "ngôi sao"');
eq(V.match(['trai tim'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'heart', 'vi "trai tim"');
eq(V.match(['duck'], [{ id: 'c', kind: 'animal', value: 'duck' }, { id: 'p', kind: 'animal', value: 'pig' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['banana'], colEn), null, 'unrelated → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('game lines: sayPickup / sayTap / sayPlaced / sayWrong / sayCount / sayCountRun / sayCountDone');
const car = (c, extra) => Object.assign({ kind: 'obj', obj: 'car', color: c, nameKind: 'color', nameValue: c }, extra || {});
const tile = (s, c) => ({ kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s });
const ani = (a) => ({ kind: 'animal', animal: a, nameKind: 'animal', nameValue: a });
const bunch = (n) => ({ kind: 'bunch', n, nameKind: 'number', nameValue: n });
const dots = (n) => ({ kind: 'dots', n, nameKind: 'number', nameValue: n });
const glyph = (t, nk) => ({ kind: 'glyph', text: String(t), nameKind: nk || (/\d/.test(t) ? 'number' : 'letter'), nameValue: /\d/.test(t) ? +t : t });
const sized = (o, big) => ({ kind: 'obj', obj: o, color: 'red', big, nameKind: 'size', nameValue: big ? 'big' : 'small' });
// pickup — DESIGN §6 examples
eq(I.sayPickup('en', { thing: car('red'), topic: 'colors', params: { color: 'red' } }), 'The red car!', 'pickup "The red car!" (DESIGN)');
eq(I.sayPickup('vi', { thing: car('red'), topic: 'colors' }), 'Chiếc ô tô màu đỏ!', 'vi pickup (REQUIREMENT)');
eq(I.sayPickup('en', { thing: tile('triangle', 'red'), topic: 'shapes', params: { shape: 'triangle' } }), 'The triangle!', 'pickup "The triangle!" (DESIGN)');
eq(I.sayPickup('en', { thing: tile('star', 'blue'), topic: 'shapes', params: { shape: 'star', color: 'blue' } }), 'The blue star!', 'pickup shapes5 says the colour');
eq(I.sayPickup('vi', { thing: tile('star', 'blue'), topic: 'shapes', promptKey: 'p.shapes5' }), 'Ngôi sao màu xanh dương!', 'vi pickup shapes5');
eq(I.sayPickup('en', { thing: bunch(3), topic: 'count' }), 'Three balloons!', 'pickup "Three balloons!" (DESIGN)');
eq(I.sayPickup('vi', { thing: bunch(3), topic: 'count' }), 'Ba quả bóng bay!', 'vi pickup bunch');
eq(I.sayPickup('en', { thing: dots(1), topic: 'count' }), 'One dot!', 'pickup one dot');
eq(I.sayPickup('en', { thing: ani('dog'), topic: 'animals' }), 'The dog!', 'pickup "The dog!" (DESIGN)');
eq(I.sayPickup('vi', { thing: ani('rabbit'), topic: 'animals' }), 'Con thỏ!', 'vi pickup rabbit');
eq(I.sayPickup('en', { thing: glyph('B'), topic: 'letters' }), 'Letter B!', 'pickup letter');
eq(I.sayPickup('vi', { thing: glyph('b'), topic: 'lower' }), 'Chữ b thường!', 'vi pickup small letter');
eq(I.sayPickup('en', { thing: glyph('5'), topic: 'add', params: { a: 2, b: 3 } }), 'Five!', 'pickup number');
eq(I.sayPickup('en', { thing: sized('car', true), topic: 'size', params: { size: 'big', obj: 'car' } }), 'The big car!', 'pickup size');
eq(I.sayPickup('vi', { thing: sized('balloon', false), topic: 'size' }), 'Quả bóng bay nhỏ!', 'vi pickup size');
eq(I.sayPickup('en', { thing: car('blue') }), 'The blue car!', 'pickup without topic');
ok(clean(I.sayPickup('en', {})) && clean(I.sayPickup('vi', null)), 'pickup of garbage → a clean praise');
eq(I.sayTap('en', { thing: car('red') }, () => 0.5), 'Look, the red car!', 'tap names the piece');
eq(I.sayTap('vi', { thing: car('red') }, () => 0.9), 'Đây là chiếc ô tô màu đỏ nè!', 'vi tap');
// placed
eq(I.sayPlaced('en', { thing: car('red'), topic: 'colors' }, r0), 'Click! The red car fits!', 'placed "Click! The red car fits!" (DESIGN)');
eq(I.sayPlaced('vi', { thing: car('red'), topic: 'colors' }, r0), 'Cạch! Chiếc ô tô màu đỏ vừa khít rồi!', 'vi placed');
eq(I.sayPlaced('en', { thing: bunch(3), topic: 'count', count: { n: 3 } }), 'One, two, three balloons!', 'placed bunch → count run (REQUIREMENT)');
eq(I.sayPlaced('vi', { thing: bunch(3), topic: 'count', count: { n: 3 } }), 'Một, hai, ba quả bóng!', 'vi count run (REQUIREMENT)');
eq(I.sayPlaced('en', { thing: dots(4), topic: 'count' }), 'One, two, three, four dots!', 'placed dots → count run');
eq(I.sayPlaced('en', { thing: glyph('5'), topic: 'add', params: { a: 2, b: 3 } }, r0), 'Five! 2 + 3 is five!', 'placed sum');
eq(I.sayPlaced('vi', { thing: glyph('4'), topic: 'sub', params: { a: 7, b: 3 } }, r0), 'Bốn! 7 − 3 bằng bốn!', 'vi placed diff');
eq(I.sayPlaced('en', { thing: glyph('7'), topic: 'oddeven', params: { parity: 'odd' } }, r0), 'Seven is odd!', 'placed parity');
eq(I.sayPlaced('en', { thing: ani('dog'), topic: 'initial', params: { letter: 'D' } }, r0), 'D is for dog!', 'placed initial');
eq(I.sayPlaced('vi', { thing: ani('frog'), topic: 'initial' }, r0), 'Chữ Ê, ếch!', 'vi placed initial');
eq(I.sayPlaced('en', { thing: glyph('B'), topic: 'letters' }, r0), 'Click! Letter B!', 'placed letter');
eq(I.sayPlaced('en', { thing: ani('cat'), topic: 'animals' }, r0), 'Click! The cat fits!', 'placed animal');
eq(I.sayPlaced('en', { thing: sized('hat', false), topic: 'size' }, r0), 'Click! The small hat fits!', 'placed size');
eq(I.sayPlaced('en', {}, r0), 'Click! It fits!', 'placed garbage → placed.any');
eq(I.sayPlaced('en', { thing: car('red'), topic: 'colors', named: true }, r0), 'Click! It fits!', 'placed after the pickup named it → short line');
eq(I.sayPlaced('vi', { thing: ani('cat'), topic: 'animals', named: true }, r0), 'Cạch! Vừa khít rồi!', 'vi placed after the name → short line');
eq(I.sayPlaced('en', { thing: bunch(3), topic: 'count', count: { n: 3 }, named: true }), 'One, two, three balloons!', 'named count piece: the count run stays');
// wrong — never negative, names what was dropped, then the goal
const W = (lang, thing, gotK, gotV, wantK, wantV, topic, params) => I.sayWrong(lang, { thing, got: { nameKind: gotK, nameValue: gotV }, want: { nameKind: wantK, nameValue: wantV }, topic, params: params || {} }, r0);
eq(W('en', { kind: 'obj', obj: 'kite', color: 'blue' }, 'color', 'blue', 'color', 'red', 'colors', { color: 'red' }), 'That’s the blue kite. Let’s find the red one!', 'wrong colour (DESIGN)');
eq(W('vi', { kind: 'obj', obj: 'kite', color: 'blue' }, 'color', 'blue', 'color', 'red', 'colors', { color: 'red' }), 'Đây là con diều màu xanh dương. Mình tìm mảnh màu đỏ nhé!', 'vi wrong colour (REQUIREMENT)');
eq(W('en', tile('circle', 'red'), 'shape', 'circle', 'shape', 'triangle', 'shapes', { shape: 'triangle' }), 'That’s the circle. Let’s find the triangle!', 'wrong shape');
eq(W('en', tile('star', 'red'), 'shape', 'star', 'shape', 'star', 'shapes', { shape: 'star', color: 'blue' }), 'That’s the red star. Let’s find the blue star!', 'wrong shapes5 (same shape, other colour)');
eq(W('vi', tile('heart', 'green'), 'shape', 'heart', 'shape', 'star', 'shapes', { shape: 'star', color: 'blue' }), 'Đây là trái tim màu xanh lá. Mình tìm ngôi sao màu xanh dương nhé!', 'vi wrong shapes5');
eq(W('en', sized('car', false), 'size', 'small', 'size', 'big', 'size', { size: 'big', obj: 'car' }), 'That’s the small car. Let’s find the big one!', 'wrong size');
eq(W('vi', sized('car', false), 'size', 'small', 'size', 'big', 'size', { size: 'big', obj: 'car' }), 'Đây là chiếc ô tô nhỏ. Mình tìm chiếc ô tô to nhé!', 'vi wrong size');
eq(W('en', ani('cat'), 'animal', 'cat', 'animal', 'dog', 'animals', { animal: 'dog' }), 'That’s the cat. Let’s find the dog!', 'wrong animal');
eq(W('en', bunch(4), 'number', 4, 'number', 3, 'count', { n: 3 }), 'That one has four balloons. Let’s find three balloons!', 'wrong count');
eq(W('vi', dots(6), 'number', 6, 'number', 2, 'count', { n: 2, kind: 'dots' }), 'Mảnh này có sáu chấm. Mình tìm mảnh có hai chấm nhé!', 'vi wrong count dots');
eq(W('en', glyph('D'), 'letter', 'D', 'letter', 'B', 'letters', { letter: 'B' }), 'That’s letter D. Let’s find letter B!', 'wrong letter');
eq(W('en', glyph('6'), 'number', 6, 'sum', '2+3', 'add', { a: 2, b: 3 }), 'That’s number six. Let’s count again!', 'wrong maths never names the answer');
ok(!/five/.test(W('en', glyph('6'), 'number', 6, 'number', 5, 'add', { a: 2, b: 3 })), 'wrong add does not say the answer');
eq(W('en', glyph('4'), 'number', 4, 'parity', 'odd', 'oddeven', { parity: 'odd' }), 'Four is even! Let’s look for another one!', 'wrong parity');
eq(W('en', ani('pig'), 'animal', 'pig', 'letter', 'D', 'initial', { letter: 'D' }), 'Pig starts with P! Let’s look again!', 'wrong initial');
eq(W('vi', ani('rabbit'), 'animal', 'rabbit', 'letter', 'V', 'initial', { letter: 'V' }), 'Thỏ bắt đầu bằng chữ T! Mình tìm lại nhé!', 'vi wrong initial');
ok(I.raw('en', 'wrong.any').includes(I.sayWrong('en', {}, r0)), 'wrong garbage → wrong.any');
// a distractor (another object in an unused colour) in a colours round
eq(W('en', { kind: 'obj', obj: 'hat', color: 'green' }, 'color', 'green', 'color', 'yellow', 'colors', { color: 'yellow' }), 'That’s the green hat. Let’s find the yellow one!', 'wrong distractor');
// sweeps: every piece × every want, every wording
const PIECES = [].concat(OBJECTS.flatMap(o => COLORS.map(c => ({ t: { kind: 'obj', obj: o, color: c, nameKind: 'color', nameValue: c }, topic: 'colors' }))),
  SHAPES.flatMap(s => COLORS.map(c => ({ t: tile(s, c), topic: 'shapes' }))),
  OBJECTS.flatMap(o => [true, false].map(b => ({ t: sized(o, b), topic: 'size' }))),
  ANIMALS.map(a => ({ t: ani(a), topic: 'animals' })), ANIMALS.map(a => ({ t: ani(a), topic: 'initial' })),
  [1, 2, 3, 4, 5].map(n => ({ t: bunch(n), topic: 'count' })), Array.from({ length: 12 }, (_, i) => ({ t: dots(i + 1), topic: 'count' })),
  LETTERS.map(L => ({ t: glyph(L), topic: 'letters' })), LETTERS.map(L => ({ t: glyph(L.toLowerCase()), topic: 'lower' })),
  Array.from({ length: 21 }, (_, n) => ({ t: glyph(String(n)), topic: ['add', 'sub', 'oddeven'][n % 3] })));
const WANTS = { colors: ['color', COLORS], shapes: ['shape', SHAPES], size: ['size', ['big', 'small']], animals: ['animal', ANIMALS],
  initial: ['letter', ['D', 'C', 'V', 'B']], count: ['number', [1, 3, 5, 10]], letters: ['letter', ['B', 'M']], lower: ['letter', ['b', 'm']],
  add: ['sum', ['2+3']], sub: ['diff', ['7−2']], oddeven: ['parity', ['odd', 'even']] };
let nLines = 0;
for (const lang of I.langs) for (const p of PIECES) {
  const params = { color: 'red', shape: 'star', size: 'big', obj: p.t.obj, animal: 'dog', n: 3, letter: 'B', a: 2, b: 3, parity: 'odd', kind: p.t.kind };
  for (let v = 0; v < 3; v++) {
    const rng = () => (v + 0.5) / 3;
    const e = { thing: p.t, topic: p.topic, params, count: p.t.n ? { n: p.t.n } : undefined };
    for (const [fn, s] of [['pickup', I.sayPickup(lang, e, rng)], ['tap', I.sayTap(lang, e, rng)], ['placed', I.sayPlaced(lang, e, rng)]]) {
      nLines++;
      ok(clean(s) && positive(s), `${lang} ${fn} ${p.topic} ${JSON.stringify(p.t)} [${v}]: ${s}`);
      if (fn === 'pickup') ok(s !== I.t(lang, 'praise', null, rng) || !p.t.kind, `${lang} pickup names the piece: ${s}`);
    }
    const [wk, wvals] = WANTS[p.topic];
    for (const wv of wvals) {
      const s = I.sayWrong(lang, Object.assign({ got: { nameKind: p.t.nameKind, nameValue: p.t.nameValue }, want: { nameKind: wk, nameValue: wv } }, e), rng);
      nLines++;
      ok(clean(s) && positive(s), `${lang} wrong ${p.topic} ${JSON.stringify(p.t)} want ${wk}/${wv} [${v}]: ${s}`);
    }
  }
}
ok(nLines > 3000, `game-line sweep size ${nLines}`);
// counting aloud
eq(I.sayCount('en', 3), 'Three!', 'sayCount en');
eq(I.sayCount('vi', 3), 'Ba!', 'sayCount vi');
eq(I.sayCount('en', 0), 'Zero!', 'sayCount 0');
eq(I.sayCount('vi', 15), 'Mười lăm!', 'sayCount 15');
eq(I.sayCount('en', 25), 'Twenty-five!'.replace('Twenty-five', '25'), 'sayCount beyond 20 → digits');
eq(I.sayCountRun('en', 3, 'bunch'), 'One, two, three balloons!', 'count run (REQUIREMENT)');
eq(I.sayCountRun('vi', 3, 'bunch'), 'Một, hai, ba quả bóng!', 'vi count run (REQUIREMENT)');
eq(I.sayCountRun('en', 1), 'One balloon!', 'count run of one');
eq(I.sayCountRun('en', 2, 'dots'), 'One, two dots!', 'count run dots');
eq(I.sayCountRun('vi', 5, { kind: 'dots', n: 5 }), 'Một, hai, ba, bốn, năm chấm!', 'vi count run, thing as kind');
for (const lang of I.langs) for (let n = 1; n <= 12; n++) for (const k of ['bunch', 'dots', undefined]) {
  const s = I.sayCountRun(lang, n, k);
  ok(clean(s) && s.split(',').length === n, `${lang} count run ${n} ${k}: ${s}`);
}
eq(I.sayCountDone('en', 3, 'bunch', r0), 'Three balloons! Hooray!', 'sayCountDone');
eq(I.sayCountDone('vi', 4, 'dots', r0), 'Bốn chấm! Hoan hô!', 'vi sayCountDone dots');
eq(I.sayCountDone('en', 3, r0), 'Three balloons! Hooray!', 'sayCountDone(lang, n, rng)');

section('talk');
eq(I.t('en', 'talk.colors', { obj: 'car', color: 'red' }), 'What colour is this car?', 'talk.colors en (DESIGN) — never says the answer');
eq(I.t('vi', 'talk.colors', { obj: 'car' }), 'Chiếc ô tô này màu gì nhỉ?', 'talk.colors vi');
eq(I.t('en', 'talk.colors', { thing: { kind: 'obj', obj: 'kite', color: 'red' } }), 'What colour is this kite?', 'talk.colors from params.thing');
eq(I.t('en', 'talk.colors', {}), 'What colour is this piece?', 'talk.colors without obj → colorsAny');
eq(I.t('en', 'talk.colorsWhich', { color: 'red' }), 'Which piece is red?', 'talk.colorsWhich en');
eq(I.t('vi', 'talk.colorsWhich', { color: 'red' }), 'Mảnh nào màu đỏ nhỉ?', 'talk.colorsWhich vi');
eq(I.t('en', 'talk.shapes', { shape: 'triangle' }), 'Which one is the triangle?', 'talk.shapes en (REQUIREMENT)');
eq(I.t('vi', 'talk.shapes', { shape: 'circle' }), 'Hình tròn là mảnh nào nhỉ?', 'talk.shapes vi');
eq(I.t('en', 'talk.shapes', {}), 'What shape is this?', 'talk.shapes without shape');
eq(I.t('en', 'talk.shapes5', { shape: 'star', color: 'blue' }), 'Which one is the blue star?', 'talk.shapes5');
eq(I.t('en', 'talk.size', { size: 'big', obj: 'bus' }), 'Which bus is big?', 'talk.size en');
eq(I.t('vi', 'talk.size', { size: 'small', obj: 'flower' }), 'Bông hoa nào nhỏ nhỉ?', 'talk.size vi');
eq(I.t('en', 'talk.size', { size: 'small' }), 'Which one is small?', 'talk.size without obj');
eq(I.t('en', 'talk.size', {}), 'Which one is big?', 'talk.size without anything');
eq(I.t('en', 'talk.count', { n: 4 }), 'How many balloons?', 'talk.count en (REQUIREMENT) — never says the answer');
eq(I.t('vi', 'talk.count', { n: 4 }), 'Có mấy quả bóng bay nào?', 'talk.count vi');
eq(I.t('en', 'talk.count', { n: 4, kind: 'dots' }), 'How many dots?', 'talk.count dots');
eq(I.t('en', 'talk.animals', { animal: 'duck' }), 'Where is the duck?', 'talk.animals en (no picture shown, animal choices)');
eq(I.t('vi', 'talk.animals', { animal: 'duck' }), 'Con vịt ở đâu nhỉ?', 'talk.animals vi');
eq(I.t('en', 'talk.animals', {}), 'Who is this?', 'talk.animals without animal → "Who is this?" (REQUIREMENT)');
eq(I.t('en', 'talk.animalsWho', { animal: 'duck' }), 'Who is this?', 'talk.animalsWho (an animal shown) never says the answer');
eq(I.t('en', 'talk.letters', { letter: 'M' }), 'Where is the letter M?', 'talk.letters');
eq(I.t('en', 'talk.lower', { letter: 'G' }), 'Where is small g? It goes with big G!', 'talk.lower');
eq(I.t('vi', 'talk.initial', { animal: 'duck', letter: 'V' }), 'Vịt bắt đầu bằng chữ gì nhỉ?', 'talk.initial vi (no answer)');
eq(I.t('en', 'talk.initial', { animal: 'rabbit', letter: 'R' }), 'Which letter does rabbit start with?', 'talk.initial en from animal');
eq(I.t('en', 'talk.add', { a: 2, b: 3 }), 'What is 2 + 3?', 'talk.add');
eq(I.t('en', 'talk.add', {}), 'What is the answer?', 'talk.add without a/b');
eq(I.t('en', 'talk.oddeven', { parity: 'odd' }), 'Which number is odd?', 'talk.oddeven');
eq(I.t('vi', 'talk.oddeven', { parity: 'even' }), 'Số nào là số chẵn nhỉ?', 'talk.oddeven vi');
// Talk choices are {id, thing:{kind, …}} (PuzzleArt.drawIcon kinds: any piece thing, plus number / color / size)
const CHOICES = [].concat(
  COLORS.map(c => ({ id: 'c' + c, thing: { kind: 'color', color: c } })),
  OBJECTS.map(o => ({ id: 'o' + o, thing: { kind: 'obj', obj: o, color: 'red' } })),
  SHAPES.map(s => ({ id: 's' + s, thing: { kind: 'shape', shape: s, color: 'red' } })),
  ANIMALS.map(a => ({ id: 'a' + a, thing: { kind: 'animal', animal: a } })),
  Array.from({ length: 13 }, (_, n) => ({ id: 'n' + n, thing: { kind: 'number', n } })),
  Array.from({ length: 12 }, (_, n) => ({ id: 'd' + (n + 1), thing: { kind: 'dots', n: n + 1 } })),
  [1, 2, 3, 4, 5].map(n => ({ id: 'b' + n, thing: { kind: 'bunch', n } })),
  LETTERS.map(L => ({ id: 'l' + L, thing: { kind: 'glyph', text: L } })), LETTERS.map(L => ({ id: 'q' + L, thing: { kind: 'glyph', text: L.toLowerCase() } })),
  ['big', 'small'].map(s => ({ id: 'z' + s, thing: { kind: 'size', big: s === 'big', obj: 'car' } })),
  ['big', 'small'].map(s => ({ id: 'y' + s, thing: { kind: 'obj', obj: 'hat', color: 'red', big: s === 'big' } })));
for (const lang of I.langs) for (const c of CHOICES) {
  const ws = I.choiceWords(lang, c);
  ok(ws.length > 0 && ws.every(w => typeof w === 'string' && w && w === w.toLowerCase()), `${lang} choiceWords ${c.id}: ${ws.slice(0, 4)}`);
  const tw = I.talkWrong(lang, c);
  ok(clean(tw) && positive(tw) && tw !== I.t(lang, 'talk.wrong.any'), `${lang} talkWrong ${c.id}: ${tw}`);
  ok(clean(I.phrase(lang, c)), `${lang} phrase (aria) ${c.id}: ${I.phrase(lang, c)}`);
}
// a spoken answer picks the right picture among the choices of one Talk question
const byPrefix = (p) => CHOICES.filter(c => c.id[0] === p);
for (const lang of I.langs) for (const group of [byPrefix('c').slice(0, 3), byPrefix('s').slice(0, 3), byPrefix('a').slice(5, 8), byPrefix('n').slice(2, 5),
  byPrefix('b').slice(0, 3), byPrefix('z'), byPrefix('y')]) {
  const set = group.map(c => ({ id: c.id, words: I.choiceWords(lang, c) }));
  for (const c of group) {
    const kv = I.kindValue(c), said = I.name(lang, kv[0], kv[1]);
    eq(V.match([said], set), c.id, `${lang} talk choice said "${said}" → ${c.id}`);
    eq(V.match([I.stripMarks(said)], set), c.id, `${lang} talk choice said without marks "${I.stripMarks(said)}" → ${c.id}`);
  }
}
ok(I.choiceWords('vi', { id: 'c0', thing: { kind: 'color', color: 'blue' } }).includes('xanh duong'), 'choiceWords colour → no-mark forms');
ok(I.choiceWords('vi', { id: 't', thing: { kind: 'animal', animal: 'lion' } }).includes('su tu'), 'choiceWords animal → "su tu"');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'dots', n: 4 } }).includes('4'), 'choiceWords dots → digit');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'bunch', n: 2 } }).includes('two'), 'choiceWords bunch → number word');
eq(I.talkWrong('en', { thing: { kind: 'color', color: 'blue' } }), 'It is blue! Good try!', 'talkWrong(colour choice)');
eq(I.talkWrong('vi', { thing: { kind: 'color', color: 'blue' } }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'talkWrong colour vi');
eq(I.talkWrong('en', { thing: { kind: 'shape', shape: 'oval', color: 'red' } }), 'It is an oval! Good try!', 'talkWrong shape → an oval');
eq(I.talkWrong('en', { thing: { kind: 'animal', animal: 'rabbit' } }), 'It is the rabbit! Good try!', 'talkWrong animal');
eq(I.talkWrong('vi', { thing: { kind: 'animal', animal: 'rabbit' } }), 'Là con thỏ đó! Bé cố gắng lắm!', 'talkWrong animal vi');
eq(I.talkWrong('vi', { id: 'c1', thing: { kind: 'number', n: 7 } }), 'Là số bảy đó! Bé cố gắng lắm!', 'talkWrong number choice');
eq(I.talkWrong('en', { thing: { kind: 'bunch', n: 3 } }), 'It is three! Good try!', 'talkWrong bunch');
eq(I.talkWrong('en', { thing: { kind: 'glyph', text: 'g' } }), 'It is small letter g! Good try!', 'talkWrong small letter choice');
eq(I.talkWrong('en', { thing: { kind: 'size', big: true, obj: 'car' } }), 'It is the big one! Good try!', 'talkWrong size');
eq(I.talkWrong('vi', { thing: { kind: 'size', big: true } }), 'Là mảnh to đó! Bé cố gắng lắm!', 'talkWrong size vi');
eq(I.talkWrong('en', { thing: { kind: 'obj', obj: 'kite' } }), 'It is the kite! Good try!', 'talkWrong obj (no colour)');
eq(I.talkWrong('en', 'color', 'red'), 'It is red! Good try!', 'talkWrong colour');
eq(I.talkWrong('en', { kind: 'parity', value: 'odd' }), 'It is odd! Good try!', 'talkWrong object arg');
eq(I.talkWrong('en', 'color', null), 'Good try! Let’s keep puzzling!', 'talkWrong without value');
for (const t of TOPICS) for (const lang of I.langs) ok(clean(I.t(lang, 'talk.' + t, { animal: 'duck', obj: 'bus', size: 'big', n: 4, a: 1, b: 2, letter: 'B', color: 'red', shape: 'star', parity: 'odd' })), `${lang} talk.${t}`);
for (const lang of I.langs) for (const k of ['talk.colors', 'talk.colorsAny', 'talk.count', 'talk.countAny', 'talk.animalsAny', 'talk.animalsWho', 'talk.initial', 'talk.add', 'talk.sub'])
  ok(!/\{(n|num|ans|answer|color|animal)\}/.test(I.raw(lang, k)), `${lang} ${k} does not speak the answer`);

// the real jigsaw content.js (when it has landed): every prompt / Talk key + params and every piece renders clean
if (contentSB) {
  section('content.js: every promptKey / Talk key / piece it produces');
  const C = contentSB.PZ.Content, RNG = contentSB.PZ.RNG;
  const mkRng = (seed) => { try { return new RNG(seed); } catch (e) { return RNG(seed); } };
  let n = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of TOPICS) for (const lang of I.langs) for (let seed = 1; seed <= 6; seed++) {
    let rd = null, tk = null;
    try { rd = C.makeRound(topic, { age, lang, rng: mkRng(seed), roundIndex: seed % 4, level: seed % 4, surprise: null }); } catch (e) { /* topic not for this age */ }
    try { tk = C.makeTalk(topic, { age, lang, rng: mkRng(seed) }); } catch (e) { /* ignore */ }
    if (rd && rd.steps && rd.pieces) for (const st of rd.steps) {
      n++;
      ok(I.has(lang, st.promptKey), `${lang} content prompt key ${st.promptKey} exists`);
      const s = I.t(lang, st.promptKey, st.params || {}, r9);
      ok(clean(s) && positive(s) && (s !== I.t(lang, 'p.any', null, r9) || !I.PROMPTS[st.promptKey]), `${lang} ${topic} age ${age} ${st.promptKey} ${JSON.stringify(st.params)}: ${s}`);
      for (const pc of rd.pieces) {
        const e = { thing: pc.thing, topic, params: st.params, promptKey: st.promptKey };
        const pu = I.sayPickup(lang, e, r9);
        ok(clean(pu) && pu !== I.t(lang, 'praise', null, r9), `${lang} ${topic} pickup ${JSON.stringify(pc.thing)}: ${pu}`);
        if ((st.targets || []).includes(pc.id)) {
          const f = I.sayPlaced(lang, Object.assign({ count: pc.thing.n ? { n: pc.thing.n } : undefined }, e), r9);
          ok(clean(f) && positive(f) && f !== I.t(lang, 'placed.any', null, r9), `${lang} ${topic} placed ${JSON.stringify(pc.thing)}: ${f}`);
        } else if (st.mode !== 'findAll' || pc.slot == null) {
          const w = I.sayWrong(lang, Object.assign({ got: { nameKind: pc.thing.nameKind, nameValue: pc.thing.nameValue },
            want: { nameKind: st.nameKind, nameValue: st.nameValue } }, e), r9);
          ok(clean(w) && positive(w), `${lang} ${topic} wrong ${JSON.stringify(pc.thing)} want ${st.nameKind}/${st.nameValue}: ${w}`);
          if (['colors', 'shapes', 'animals', 'size', 'letters', 'lower', 'count'].includes(topic))
            ok(!I.raw(lang, 'wrong.any').includes(w), `${lang} ${topic} wrong names the piece: ${w}`);
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

section('speech text: letters, maths, "Pom"');
eq(I.speech('en', 'That’s letter D. Let’s find letter B!'), 'That’s letter dee. Let’s find letter bee!', 'en letter names');
eq(I.speech('en', 'D is for dog!'), 'dee is for dog!', 'en "D is for"');
eq(I.speech('en', 'Pig starts with P! Let’s look again!'), 'Pig starts with pee! Let’s look again!', 'en starts with');
eq(I.speech('en', 'Big B has a little friend. Find small b!'), 'Big bee has a little friend. Find small bee!', 'en big/small letters');
eq(I.speech('en', 'Letter B!'), 'Letter bee!', 'en pickup "Letter B!"');
eq(I.speech('en', 'What is 2 + 3? Find the answer piece!'), 'What is 2 plus 3? Find the answer piece!', 'en plus');
eq(I.speech('vi', 'Bé ơi, 7 − 2 bằng mấy?'), 'Bé ơi, 7 trừ 2 bằng mấy?', 'vi minus');
eq(I.speech('vi', 'Bé ơi, tìm chữ B nhé!'), 'Bé ơi, tìm chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Chữ Ê, ếch!'), 'Chữ ê, ếch!', 'vi letter Ê');
eq(I.speech('vi', 'Chữ b thường!'), 'Chữ bờ thường!', 'vi pickup small letter');
eq(I.speech('en', 'Hi! I am Pom.'), 'Hi! I am Pom.', 'en "Pom" as written');
eq(I.speech('vi', 'Mình là voi Pom. Pom giúp bé nhé!'), 'Mình là voi Pom. Pom giúp bé nhé!', 'vi "Pom" as written');
eq(I.speech('en', 'The picture is done — look, it moves!'), 'The picture is done, look, it moves!', 'dash → comma pause');
eq(I.speech('en', 'Find the big car!'), 'Find the big car!', '"big car" is not a letter');
eq(I.speech('en', 'Pom is listening…'), 'Pom is listening.', 'ellipsis → full stop');
eq(V.spoken('vi', 'Chào bé! Mình là Pom.'), 'Chào bé! Mình là Pom.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Find the letter B!'), 'Find the letter bee!', 'Voice.spoken letter names');

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
  sb4.PZ = {};
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
    'a drag: down, moves, up — numbers in logical px + the raw event');
  ok(calls.every(c => c.length === 1 || (typeof c[1] === 'number' && typeof c[2] === 'number')), 'callbacks get (x, y) NUMBERS — never a point object');
  const insrc = fs.readFileSync(path.join(JS, 'input.js'), 'utf8');
  ok(/CALLBACK SIGNATURE/.test(insrc) && /down\(x, y, ev\)\s+move\(x, y, ev\)\s+up\(x, y, ev\)\s+cancel\(\)/.test(insrc), 'input.js documents the callback signature at the top');
  // a long drag: every move arrives, in order, even far outside the canvas (pointer capture keeps the events on the canvas)
  calls.length = 0;
  canvas.emit('pointerdown', pe(50, 300, 600));
  for (let k = 1; k <= 60; k++) canvas.emit('pointermove', pe(50, 300 + k * 10, 600 - k * 12));
  canvas.emit('pointerup', pe(50, 900, -120));
  eq(calls.length, 62, 'a long drag delivers down + 60 moves + up');
  ok(calls.slice(1, 61).every((c, k) => c[0] === 'move' && c[1] === (300 + (k + 1) * 10) / 2), 'moves arrive in order with the right x');
  eq(JSON.stringify(calls[61]), JSON.stringify(['up', 450, -60, 'object']), 'release point outside the canvas reaches up()');
  calls.length = 0;
  calls.length = 0;
  // a second finger during a drag is ignored; the drag continues and ends normally
  canvas.emit('pointerdown', pe(10, 20, 20));
  const extra = pe(11, 400, 400, { isPrimary: false });
  canvas.emit('pointerdown', extra);
  ok(extra.prevented, 'the extra finger is swallowed (no browser gesture)');
  canvas.emit('pointermove', pe(11, 420, 400, { isPrimary: false }));
  canvas.emit('pointermove', pe(10, 40, 30));
  canvas.emit('pointerup', pe(11, 420, 400, { isPrimary: false }));
  canvas.emit('pointerup', pe(10, 44, 30));
  eq(JSON.stringify(calls), JSON.stringify([['down', 10, 10, 'object'], ['move', 20, 15, 'object'], ['up', 22, 15, 'object']]),
    'extra finger ignored: no down/move/up for it, the first drag is untouched');
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
  eq(calls.map(c => c[0]).join(','), 'down,move,up', 'mouse drag works');
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
  sb7.PZ = {};
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
  sb5.PZ = {};
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
  sb6.PZ = {};
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
ok(sb.PZ.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into PZ.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof PZ.Input.attach === 'function' && typeof PZ.Input.kidProof === 'function' && typeof PZ.Input.holdButton === 'function',
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
  sbx.PZ = {};
  env.PZ = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.PZ.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Pom: rate 0.9, pitch 1.2');
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
  // vi: "Pom" goes to TTS as written, letter names are rewritten; the bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là voi Pom. Bé tìm chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là voi Pom. Bé tìm chữ bờ nhé!', 'vi utterance: "Pom" kept, "chữ bờ"');
  eq(startText, 'Mình là voi Pom. Bé tìm chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animals', { animal: 'duck' }, { lang: 'vi' });
  ok(/^(Con vịt đâu rồi nhỉ\?|Bé ơi, tìm con vịt nhé!|Bé tìm mảnh ghép con vịt nào!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read PZ.debug.voiceLog)');
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
  E3.PZ.__dummy = 0;
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
