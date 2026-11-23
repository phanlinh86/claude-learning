#!/usr/bin/env node
// Nuka's Snow Dig — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/polar-bear-snow-dig:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md. When the dig content.js exists (NK.Content making rounds
// with `mounds`), every prompt / Talk key + params it produces and every mound thing are checked too.
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
  return sb.NK;
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
    !/\ba [aeiou]/i.test(s.replace(/letter a /ig, ''));
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

// ------------------------------------------------------------------ DESIGN value lists
const ANIMALS = ['fox', 'hare', 'reindeer', 'walrus', 'whale', 'dog', 'goose', 'owl'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const KINDS = ['hat', 'gem', 'fish', 'toy', 'tablet'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.NK = { debug: { voiceLog: [] } };
let NK;
try { NK = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = NK.I18N, V = NK.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js'])
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(JS, f), 'utf8')), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.THING_KINDS), JSON.stringify(KINDS), 'I18N.THING_KINDS');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');

// the dig content.js (written by the mechanics engineer; poll-safe): loaded when it makes rounds with mounds
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  try {
    const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
    if (/mounds/.test(csrc) && !/Sea Painting/.test(csrc)) {
      const sbc = makeSandbox(); sbc.NK = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.NK.Content && sbc.NK.Content.makeRound) contentSB = sbc;
    }
  } catch (e) { ok(false, 'content.js load: ' + e.message); }
}
console.log(`   (${contentSB ? 'dig content.js loaded' : 'dig content.js not there yet — content checks skipped'})`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapNuka', 'tapHint', 'quieter', 'louder', 'skip', 'gallery', 'langName.en', 'langName.vi'];
// every data-i18n / T('ui.…') this game's index.html, ui.js and main.js use must exist
const usedUi = new Set();
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, 'game', f), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="(ui\.[\w.]+)"/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/T\((?:lang, )?'(ui\.[\w.]+)'/g)) usedUi.add(m[1]);
}
ok(usedUi.size >= 10, 'found the ui keys index.html / ui.js / main.js use (' + usedUi.size + ')');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.animals', 'p.count', 'p.letters', 'p.lower', 'p.initial',
  'p.add', 'p.sub', 'p.oddeven'];
const FOUND_KEYS = ['hat', 'gem', 'fish', 'toy', 'label', 'parity', 'initial', 'sum', 'any'].map(k => 'found.' + k);
const LINE_KEYS = ['p.any', 'p.next', 'p.sizeAny', 'scoop', 'rub', 'fly', 'slide', 'countDone', 'wrong.thing', 'wrong.math', 'wrong.parity',
  'wrong.initial', 'wrong.any', 'already', 'busy', 'enter', 'hint', 'idle', 'praise', 'great', 'stepDone', 'party',
  'surprise.seal', 'seal.tap', 'surprise.tern', 'tern.tap', 'session.done'];
const TALK_KEYS = ['talk.intro', 'talk.right', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.size', 'talk.wrong.letter',
  'talk.wrong.small', 'talk.wrong.number', 'talk.wrong.any', 'talk.sizeAny', 'talk.countAny', 'talk.calc', 'talk.oddevenAny',
  'talk.colorsWhich', 'talk.shapesAny', 'talk.sizeOne', 'talk.animalsAny', 'talk.lettersAny', 'talk.lowerAny', 'talk.initialAny']
  .concat(TOPICS.map(k => 'talk.' + k));
const COUNT_KEYS = Array.from({ length: 21 }, (_, i) => 'count.' + i);
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k)).concat([...usedUi])
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(PROMPT_KEYS).concat(FOUND_KEYS).concat(LINE_KEYS).concat(TALK_KEYS).concat(COUNT_KEYS);
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(enKeys.join('|'), viKeys.join('|'), 'en and vi have identical key sets');
for (const k of enKeys) eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `same {params} in en/vi for ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  ok(raw.every(s => typeof s === 'string' && s.trim().length > 0), `${lang} ${k}: non-empty strings`);
  // the VI lines never write "màu" in front of {color} (the colour name already says "màu đỏ")
  if (lang === 'vi') ok(raw.every(s => !/màu \{color\}/.test(s)), `vi ${k}: no "màu {color}"`);
}
// no old-theme keys or words left (Bun's Dino Dig, and the paint game before it)
const OLD_KEY = /hatch|egg|stone|bone|dino|mole|ptero|tapBun|tapNini|paint/i;
const OLD_EN = /\b(eggs?|stones?|bones?|dinos?|dinosaurs?|valley|sand|sandy|shovel|mounds?|Bun|Bun’s|hatch\w*|moles?|ptero\w*|fireflies|Nini|paint|turtle)\b/i;
const OLD_VI = /trứng|khủng long|xương|thung lũng|xẻng|hòn đá|tấm đá|thỏ Bun|chuột chũi|đom đóm|(^|[\s,.!?])(cát|nở|Bun)([\s,.!?]|$)/iu;
for (const k of enKeys) ok(!OLD_KEY.test(k), `no old-theme key: ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(!OLD_EN.test(s) && !OLD_VI.test(s), `${lang} ${k}: no egg / stone / bone / dino / valley / sand / Bun words: ${s}`);
ok(typeof I.sayHatch === 'undefined', 'sayHatch removed (no hatch in this game)');
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\bBun\b|\bdino|\begg\b|hatch|khủng long|trứng|xương/i.test(src), `${f}: no old-theme words in the source`);
}
// instructions have 3 wordings
for (const lang of I.langs) for (const k of PROMPT_KEYS.concat(['p.any', 'p.next', 'p.sizeAny', 'enter', 'already', 'scoop', 'rub', 'fly', 'slide',
  'wrong.thing', 'found.hat', 'found.gem', 'found.fish', 'found.toy', 'found.label', 'found.any', 'stepDone', 'hint', 'idle',
  'countDone', 'surprise.seal', 'seal.tap', 'surprise.tern', 'tern.tap', 'busy']))
  ok([].concat(I.raw(lang, k)).length >= 3, `${lang} ${k}: 3 wordings`);
for (const lang of I.langs) for (const k of TOPICS.map(t => 'topic.' + t)) ok(!Array.isArray(I.raw(lang, k)), `${lang} ${k} is one banner string`);

section('titles, Nuka, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.title'), 'Nuka’s Snow Dig', 'en title');
eq(I.t('en', 'ui.logo1'), 'Nuka’s', 'en logo line 1');
eq(I.t('en', 'ui.logo2'), 'Snow Dig', 'en logo line 2');
eq(I.t('vi', 'ui.logo1'), 'Gấu Nuka', 'vi logo line 1');
eq(I.t('vi', 'ui.logo2'), 'Đào Tuyết', 'vi logo line 2');
eq(I.t('vi', 'ui.title'), 'Gấu Nuka Đào Tuyết', 'vi title');
eq(I.t('en', 'ui.voice'), 'Nuka’s voice', 'voice setting names Nuka');
eq(I.t('vi', 'ui.voice'), 'Giọng của Nuka', 'vi voice setting names Nuka');
eq(I.t('en', 'ui.listening'), 'Nuka is listening…', 'listening names Nuka');
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /Bé ơi/.test(s)), `vi ${k}: a warm "Bé ơi" wording`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /nhé|nào|nha/.test(s)), `vi ${k}: "nhé / nào"`);
for (const k of I.keys('vi')) if (!/^ui\.langName/.test(k))
  ok(JSON.stringify(I.raw('vi', k)) !== JSON.stringify(I.raw('en', k)), `vi ${k} is translated`);
// every Vietnamese line with words carries diacritics (no "Be oi" ASCII-only text)
for (const k of I.keys('vi')) if (!/^ui\.langName|^count\.|^ui\.(chapter|years)$/.test(k))
  for (const s of [].concat(I.raw('vi', k))) if (/[a-z]{3}/i.test(s.replace(/\{\w+\}/g, '')) && s.replace(/\{\w+\}/g, '').trim().split(/\s+/).length >= 2)
    ok(VI_DIACRITIC.test(s), `vi ${k} has Vietnamese diacritics: ${s}`);
for (const k of ['p.colors', 'p.count', 'rub', 'wrong.thing']) ok([].concat(I.raw('en', k)).every(s => !VI_DIACRITIC.test(s)), `en ${k} has no Vietnamese text`);

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  for (const s of [].concat(I.raw(lang, k))) ok(positive(s), `${lang} ${k} is positive: ${s}`);
}

section('every string renders, no "{" left, no "màu màu"');
const SAMPLE = { n: 3, a: 2, b: 4, stars: 7, color: 'red', shape: 'star', size: 'big', animal: 'fox', kind: 'fish',
  letter: 'B', lower: 'b', word: 'fox', first: 'F', expr: '2+3', ans: 'five', num: 'seven', parity: 'odd', label: 'letter B',
  thing: 'the star gem', got: { nameKind: 'shape', nameValue: 'circle' }, want: { nameKind: 'shape', nameValue: 'triangle' }, answer: 'red' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let v = 0; v < raw.length; v++) {
    const rng = () => (v + 0.5) / raw.length;
    for (const child of ['', 'Mai']) {
      const s = I.t(lang, k, Object.assign({ child }, SAMPLE), rng);
      ok(clean(s), `${lang} ${k} [${v}] child="${child}" renders clean: ${s}`);
    }
    // and with no params at all (fallback keys)
    ok(clean(I.t(lang, k, null, rng)), `${lang} ${k} [${v}] renders clean without params: ${I.t(lang, k, null, rng)}`);
  }
}
// child name handling
I.setChild('');
ok(!/friend|\bbé\b,/.test(I.t('en', 'great', null, r9)), 'great without a name picks a no-name variant');
I.setChild('Mai');
eq(I.t('en', 'ui.welcome'), 'Hi Mai! I am Nuka. Let’s dig in the snow!', 'welcome with the child name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé Mai! Mình là gấu Nuka. Mình cùng đào tuyết nhé!', 'vi welcome with the child name');
ok(/Mai/.test(I.t('en', 'great', null, r0)), 'great with the child name');
eq(I.t('en', 'great', null, r0), 'Great digging, Mai!', 'great: "Great digging, {child}!"');
I.setChild('');
eq(I.t('en', 'ui.welcome'), 'Hi! I am Nuka. Let’s dig in the snow!', 'welcome without a name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé! Mình là gấu Nuka. Mình cùng đào tuyết nhé!', 'vi welcome without a name');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'ui.chapter');
eq(I.t('vi', 'session.done', { stars: 12 }, r0), 'Chuyến đào tuyết tuyệt quá! 12 ngôi sao!', 'vi session.done');
eq(I.t('en', 'weather.0'), 'Spring! The snow is melting!', 'weather.0 spring');
eq(I.t('en', 'weather.1'), 'Summer — the sun stays up all night!', 'weather.1 summer (midnight sun)');
eq(I.t('en', 'weather.2'), 'Autumn colours!', 'weather.2 autumn');
eq(I.t('en', 'weather.3'), 'Winter night — look, the northern lights!', 'weather.3 winter night + aurora');
ok(/bắc cực/.test(I.t('vi', 'weather.3')) && /xuân/.test(I.t('vi', 'weather.0')) && /hè/.test(I.t('vi', 'weather.1')) && /thu/.test(I.t('vi', 'weather.2')), 'vi weather: xuân / hè / thu / bắc cực');
eq(I.t('en', 'enter', null, r0), 'New snow drifts!', 'enter');
eq(I.t('vi', 'enter', null, r0), 'Đống tuyết mới nè!', 'vi enter');
eq(I.t('en', 'scoop', null, r0), 'Dig, dig, dig!', 'scoop');
eq(I.t('vi', 'scoop', null, r0), 'Đào, đào, đào!', 'vi scoop');
eq(I.t('en', 'rub', null, r0), 'Rub the snow! Swish, swish!', 'rub (DESIGN)');
eq(I.t('vi', 'rub', null, r0), 'Bé xoa xoa tuyết nào!', 'vi rub (DESIGN)');
eq(I.t('en', 'fly', null, r0), 'Up to the northern lights!', 'fly (DESIGN)');
eq(I.t('vi', 'fly', null, r0), 'Bay lên ánh sáng bắc cực nào!', 'vi fly (DESIGN)');
eq(I.t('en', 'slide', null, r0), 'Wheee! Belly slide!', 'slide (DESIGN)');
eq(I.t('vi', 'slide', null, r0), 'Trượt bụng nè, vui quá!', 'vi slide (DESIGN)');
eq(I.t('en', 'ui.tapHint'), 'Rub a snow drift to dig', 'tapHint teaches the rub');
for (const lang of I.langs) for (const k of ['surprise.seal', 'seal.tap']) ok([].concat(I.raw(lang, k)).every(s => /seal|hải cẩu/i.test(s)), `${lang} ${k} names the seal`);
for (const lang of I.langs) ok([].concat(I.raw(lang, 'surprise.tern')).every(s => /tern|bird|nhạn/i.test(s)), `${lang} surprise.tern names the tern`);
ok([].concat(I.raw('vi', 'surprise.seal')).some(s => /hải cẩu con/i.test(s)) && [].concat(I.raw('vi', 'surprise.tern')).some(s => /chim nhạn biển/.test(s)), 'vi: "hải cẩu con", "chim nhạn biển"');
eq(I.t('en', 'p.nonsense', null, r0), I.t('en', 'p.any', null, r0), 'unknown prompt key → p.any');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key → the key');

section('prompts: DESIGN examples, every param filled, plurals, fallbacks');
eq(I.t('en', 'p.colors', { color: 'red' }, r0), 'Find the red hat!', 'p.colors en (DESIGN)');
eq(I.t('vi', 'p.colors', { color: 'red' }, r0), 'Bé ơi, tìm cái mũ len màu đỏ nhé!', 'p.colors vi (DESIGN)');
eq(I.t('en', 'p.shapes', { shape: 'triangle' }, r0), 'Dig up the triangle!', 'p.shapes en (DESIGN)');
eq(I.t('vi', 'p.shapes', { shape: 'triangle' }, r0), 'Bé ơi, đào viên đá băng hình tam giác nhé!', 'p.shapes vi');
eq(I.t('en', 'p.shapes5', { shape: 'star', color: 'blue' }, r0), 'Find the blue star!', 'p.shapes5 en');
eq(I.t('vi', 'p.shapes5', { shape: 'star', color: 'blue' }, r0), 'Bé ơi, tìm viên đá băng hình ngôi sao màu xanh dương nhé!', 'p.shapes5 vi');
eq(I.t('en', 'p.shapes5', { shape: 'heart' }, r0), 'Dig up the heart!', 'p.shapes5 without colour → p.shapes');
eq(I.t('en', 'p.size', { size: 'big', kind: 'fish' }, r0), 'Find the big fish!', 'p.size en');
eq(I.t('vi', 'p.size', { size: 'big', kind: 'fish' }, r0), 'Bé ơi, tìm con cá to nhé!', 'p.size vi');
eq(I.t('en', 'p.size', { size: 'small', kind: 'hat' }, r0), 'Find the small hat!', 'p.size hat');
eq(I.t('vi', 'p.size', { size: 'small', kind: 'hat' }, r0), 'Bé ơi, tìm cái mũ len nhỏ nhé!', 'p.size hat vi');
eq(I.t('en', 'p.size', { size: 'small', kind: 'toy', animal: 'walrus' }, r0), 'Find the small walrus!', 'p.size toy names the animal');
eq(I.t('vi', 'p.size', { size: 'small', kind: 'toy', animal: 'walrus' }, r0), 'Bé ơi, tìm con hải mã nhỏ nhé!', 'p.size toy vi');
eq(I.t('en', 'p.size', { size: 'big' }, r0), 'Find the big one!', 'p.size without kind → p.sizeAny');
eq(I.t('en', 'p.animals', { animal: 'fox' }, r0), 'Where is the fox?', 'p.animals en (DESIGN)');
eq(I.t('vi', 'p.animals', { animal: 'fox' }, r0), 'Con cáo ở đâu nhỉ?', 'p.animals vi');
eq(I.t('vi', 'p.animals', { animal: 'reindeer' }, () => 0.5), 'Bé ơi, tìm con tuần lộc nhé!', 'p.animals vi reindeer');
eq(I.t('en', 'p.count', { n: 3 }, r0), 'Dig up 3 fish!', 'p.count en (DESIGN: "fish" plural)');
eq(I.t('en', 'p.count', { n: 1 }, r0), 'Dig up 1 fish!', 'p.count singular');
eq(I.t('vi', 'p.count', { n: 3 }, r0), 'Bé ơi, đào 3 con cá nhé!', 'p.count vi');
eq(I.t('en', 'p.letters', { letter: 'B' }, r0), 'Find the letter B!', 'p.letters en');
eq(I.t('vi', 'p.letters', { letter: 'B' }, r0), 'Bé ơi, tìm chữ B nhé!', 'p.letters vi');
eq(I.t('en', 'p.lower', { letter: 'B' }, () => 0.5), 'Dig up small b!', 'p.lower en');
eq(I.t('en', 'p.lower', { letter: 'b' }, r0), 'Big B has a little friend. Find small b!', 'p.lower given a small letter');
eq(I.t('en', 'p.initial', { letter: 'D' }, r0), 'Find the toy that starts with D!', 'p.initial en');
eq(I.t('en', 'p.add', { a: 2, b: 3 }, r0), 'What is 2 + 3? Dig up the answer!', 'p.add en');
eq(I.t('vi', 'p.sub', { a: 7, b: 2 }, r0), 'Bé ơi, 7 − 2 bằng mấy? Bé đào đáp án nhé!', 'p.sub vi');
eq(I.t('en', 'p.oddeven', { parity: 'odd' }, r0), 'Dig up all the odd numbers!', 'p.oddeven en (DESIGN)');
eq(I.t('vi', 'p.oddeven', { parity: 'even' }, r0), 'Bé ơi, đào tất cả các số chẵn nhé!', 'p.oddeven vi');
eq(I.t('en', 'p.colors', {}, r0), I.t('en', 'p.any', null, r0), 'p.colors without colour → p.any');
eq(I.t('en', 'p.add', { a: 2 }, r0), I.t('en', 'p.any', null, r0), 'p.add without b → p.any');
eq(I.ask('en', 'p.colors', { color: 'red' }, { rng: r0 }), 'Find the red hat!', 'ask = the prompt');
eq(I.ask('en', 'p.colors', { color: 'red' }, { next: true, rng: r0 }), 'Next one! Find the red hat!', 'ask next → "Next one!" prefix');
eq(I.ask('vi', 'p.animals', { animal: 'whale' }, { next: true, rng: r0 }), 'Tiếp nào! Con cá voi ở đâu nhỉ?', 'vi ask next');
// sweeps
for (const lang of I.langs) for (const color of COLORS) {
  const raw = [].concat(I.raw(lang, 'p.colors'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.colors', { color }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s) && s.toLowerCase().includes(I.name(lang, 'color', color)), `${lang} p.colors ${color} [${v}]: ${s}`);
  }
  ok(clean(I.ask(lang, 'p.colors', { color }, { next: true, rng: r9 })), `${lang} ask next ${color}`);
}
for (const lang of I.langs) for (const k of ['p.shapes', 'p.shapes5']) for (const shape of SHAPES) for (const color of COLORS.concat([null])) {
  const raw = [].concat(I.raw(lang, k));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, k, { shape, color }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s) && s.toLowerCase().includes(I.name(lang, 'shape', shape)), `${lang} ${k} ${shape} ${color} [${v}]: ${s}`);
  }
}
for (const lang of I.langs) for (const kind of ['fish', 'hat', 'toy', 'gem']) for (const size of ['big', 'small']) for (const animal of ANIMALS.concat([null])) {
  const raw = [].concat(I.raw(lang, 'p.size'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.size', { size, kind, animal }, () => (v + 0.5) / raw.length);
    ok(clean(s) && s.includes(I.name(lang, 'size', size)), `${lang} p.size ${size} ${kind} ${animal} [${v}]: ${s}`);
    if (kind === 'toy' && animal) ok(s.toLowerCase().includes(I.name(lang, 'animal', animal)), `${lang} p.size toy names the ${animal}: ${s}`);
  }
}
for (const lang of I.langs) for (const animal of ANIMALS) {
  const raw = [].concat(I.raw(lang, 'p.animals'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.animals', { animal }, () => (v + 0.5) / raw.length);
    ok(clean(s) && s.toLowerCase().includes(I.name(lang, 'animal', animal)), `${lang} p.animals ${animal} [${v}]: ${s}`);
  }
}
for (const lang of I.langs) for (let n = 1; n <= 12; n++) {
  const raw = [].concat(I.raw(lang, 'p.count'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.count', { n }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s) && s.includes(String(n)), `${lang} p.count ${n} [${v}]: ${s}`);
    if (lang === 'en') ok(s.includes(n + ' fish') && !/fishes/.test(s), `en p.count n=${n} "fish" (its own plural): ${s}`);
    if (lang === 'vi') ok(s.includes(n + ' con cá'), `vi p.count n=${n}: ${s}`);
  }
}
for (const lang of I.langs) for (const L of LETTERS) for (const k of ['p.letters', 'p.lower', 'p.initial'])
  ok(clean(I.t(lang, k, { letter: L }, r9)), `${lang} ${k} ${L}`);
for (const lang of I.langs) for (let a = 0; a <= 10; a++) for (const k of ['p.add', 'p.sub'])
  ok(clean(I.t(lang, k, { a: a + 3, b: a }, r9)), `${lang} ${k} ${a}`);
for (const lang of I.langs) for (const parity of ['odd', 'even']) ok(clean(I.t(lang, 'p.oddeven', { parity }, r9)), `${lang} p.oddeven ${parity}`);

section('names for every kind × value');
const NAME_CASES = { color: COLORS, hue: COLORS, shape: SHAPES, size: ['big', 'small'], animal: ANIMALS, word: ANIMALS, thing: KINDS,
  parity: ['odd', 'even'] };
const DESIGN_VI = {
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam', purple: 'màu tím', pink: 'màu hồng' },
  hue: { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' },
  animal: { fox: 'con cáo', hare: 'con thỏ', reindeer: 'con tuần lộc', walrus: 'con hải mã', whale: 'con cá voi', dog: 'con chó', goose: 'con ngỗng', owl: 'con cú' },
  word: { fox: 'cáo', hare: 'thỏ', reindeer: 'tuần lộc', walrus: 'hải mã', whale: 'cá voi', dog: 'chó', goose: 'ngỗng', owl: 'cú' },
  size: { big: 'to', small: 'nhỏ' },
  shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' },
  thing: { hat: 'cái mũ len', gem: 'viên đá băng', fish: 'con cá', tablet: 'khối băng' } };
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const v of vals) for (const lang of I.langs) {
  const n = I.name(lang, kind, v);
  ok(clean(n) && n !== 'undefined', `${lang} name ${kind} ${v}: ${n}`);
  if (lang === 'vi' && kind !== 'word') ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
  const want = lang === 'vi' ? DESIGN_VI[kind] : null;
  if (want && want[v]) eq(n, want[v], `${lang} ${kind} ${v} = DESIGN §6`);
}
ok(/ngôi sao/.test(I.name('vi', 'shape', 'star')) && /trái tim/.test(I.name('vi', 'shape', 'heart')), 'vi star / heart names');
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'rect → rectangle');
eq(I.name('vi', 'color', 'red', { bare: true }), 'đỏ', 'bare colour option');
eq(I.name('en', 'animal', 'fox', { size: 'big' }), 'big fox', 'en animal with size');
eq(I.name('vi', 'animal', 'fox', { size: 'big' }), 'con cáo to', 'vi animal with size');
eq(I.name('vi', 'animal', 'toy_owl'), 'con cú', 'sprite id toy_owl');
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
// initial-topic default words
for (const lang of I.langs) for (const e of NK.WORDS[lang]) {
  ok(ANIMALS.includes(e.animal), `${lang} word ${e.word} is a toy animal`);
  ok(!/^con /.test(e.word), `${lang} initial word ${e.word} has no classifier`);
  eq(I.initialOf(lang, e.animal).first, e.initial, `${lang} initialOf ${e.animal}`);
}
// DESIGN §5.1 initials
const INI = { en: { fox: 'F', hare: 'H', reindeer: 'R', walrus: 'W', whale: 'W', dog: 'D', goose: 'G', owl: 'O' },
  vi: { fox: 'C', hare: 'T', reindeer: 'T', walrus: 'H', whale: 'C', dog: 'C', goose: 'N', owl: 'C' } };
for (const lang of I.langs) for (const a of ANIMALS) eq(I.initialOf(lang, a).first, INI[lang][a], `${lang} initial of ${a} (DESIGN §5.1)`);
eq(I.initialOf('vi', 'goose').word, 'ngỗng', 'vi ngỗng (no classifier)');
eq(I.initialOf('vi', 'reindeer').word, 'tuần lộc', 'vi tuần lộc');
// unique initials? (content decides; i18n just reports) — every vi initial is a single letter i18n can name
for (const e of NK.WORDS.vi) ok(I.LETTER_VI[e.initial] != null, `vi initial ${e.initial} has a phonics name`);
// phrases
eq(I.phrase('en', { nameKind: 'shape', nameValue: 'oval' }), 'the oval', 'phrase shape en');
eq(I.phrase('vi', { nameKind: 'animal', nameValue: 'hare' }), 'con thỏ', 'phrase animal vi');
eq(I.phrase('en', { nameKind: 'size', nameValue: 'small', kind: 'fish' }), 'the small fish', 'phrase size of a fish');
eq(I.phrase('vi', { nameKind: 'size', nameValue: 'small', kind: 'fish' }), 'con cá nhỏ', 'phrase size vi');
eq(I.phrase('vi', { nameKind: 'size', nameValue: 'big', kind: 'hat' }), 'cái mũ len to', 'phrase size hat vi');
eq(I.phrase('en', { nameKind: 'size', nameValue: 'big' }), 'the big one', 'phrase size, unknown kind');
eq(I.phrase('en', { nameKind: 'letter', nameValue: 'd' }), 'small d', 'phrase small letter');
eq(I.phrase('vi', { nameKind: 'letter', nameValue: 'D' }), 'chữ D', 'phrase letter vi');
eq(I.phrase('vi', 'number', 5), 'số năm', 'phrase number vi');
// thingPhrase for every kind × value
for (const lang of I.langs) {
  for (const c of COLORS) {
    eq(I.thingPhrase(lang, { kind: 'hat', color: c }, { art: 'a', color: true }), lang === 'en' ? (/^[aeiou]/.test(c) ? 'an ' : 'a ') + c + ' hat' : 'cái mũ len ' + I.name('vi', 'color', c), `${lang} hat ${c}`);
  }
  for (const s of SHAPES) for (const c of COLORS) {
    const p = I.thingPhrase(lang, { kind: 'gem', shape: s, color: c }, { art: 'the', color: true, noGem: true });
    ok(clean(p) && p.includes(I.name(lang, 'shape', s)) && p.includes(I.name(lang, 'color', c)), `${lang} gem ${s} ${c}: ${p}`);
  }
  for (const a of ANIMALS) ok(I.thingPhrase(lang, { kind: 'toy', animal: a }, { art: 'the' }).includes(I.name(lang, 'animal', a)), `${lang} toy ${a}`);
  for (const sz of ['big', 'small']) for (const k of ['fish', 'hat', 'gem'])
    ok(clean(I.thingPhrase(lang, { kind: k, size: sz }, { art: 'the', size: true })), `${lang} ${sz} ${k}`);
}
eq(I.thingPhrase('en', { kind: 'gem', shape: 'star' }, { art: 'the' }), 'the star gem', 'the star gem');
eq(I.thingPhrase('en', { kind: 'gem', shape: 'star', color: 'blue' }, { art: 'the', color: true, noStone: true }), 'the blue star', 'noStone still accepted (= noGem)');
eq(I.thingPhrase('vi', { kind: 'gem', shape: 'triangle' }), 'viên đá băng hình tam giác', 'vi shape gem (DESIGN §6)');
eq(I.thingPhrase('vi', { kind: 'hat', color: 'red' }, { color: true, bare: true }), 'cái mũ len đỏ', 'vi bare-hue hat');
eq(I.thingPhrase('en', { kind: 'fish', size: 'big' }, { art: 'the', size: true }), 'the big fish', 'the big fish');
eq(I.thingPhrase('en', { kind: 'toy', animal: 'owl' }, { art: 'a' }), 'an owl', 'an owl');
eq(I.thingPhrase('vi', { kind: 'tablet' }), 'khối băng', 'vi tablet without text');
eq(I.thingPhrase('en', { kind: 'tablet', text: 'B', nameKind: 'letter', nameValue: 'B' }), 'letter B', 'tablet letter');
eq(I.thingPhrase('vi', { kind: 'tablet', text: '7', nameKind: 'number', nameValue: 7 }), 'số bảy', 'tablet number vi');
eq(I.thingPhrase('en', {}), '', 'unknown thing → ""');

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
const MATCH_CASES = { color: COLORS, shape: SHAPES.filter(s => s !== 'rect'), size: ['big', 'small'], animal: ANIMALS, thing: KINDS.filter(k => k !== 'toy' && k !== 'tablet'), parity: ['odd', 'even'] };
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
for (const [said, want] of [['tuan loc', 'reindeer'], ['hai ma', 'walrus'], ['cún', 'dog'], ['cao', 'fox'], ['ngong', 'goose'], ['cá voi', 'whale'],
  ['ca voi', 'whale'], ['cu', 'owl'], ['cú mèo', 'owl'], ['tho', 'hare'], ['con moóc', 'walrus'], ['con nai', 'reindeer']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['a doggy', 'dog'], ['bunny', 'hare'], ['rabbit', 'hare'], ['an owl', 'owl'], ['geese', 'goose'], ['rain deer', 'reindeer'],
  ['a whale', 'whale'], ['husky', 'dog'], ['arctic fox', 'fox']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['xanh'], ch('vi', 'color', COLORS)), null, '"xanh" alone is ambiguous');
eq(V.match(['màu xanh dương'], ch('vi', 'color', COLORS)), 'blue', 'vi "màu xanh dương"');
eq(V.match(['mau do'], ch('vi', 'color', COLORS)), 'red', 'vi no-diacritic "mau do"');
eq(V.match(['mũ màu đỏ'], ch('vi', 'color', COLORS)), 'red', 'vi "mũ màu đỏ"');
eq(V.match(['the red hat'], ch('en', 'color', COLORS)), 'red', 'en "the red hat"');
eq(V.match(['ba'], ch('vi', 'number', [3, 5, 12])), '3', '"ba" → 3');
eq(V.match(['muoi hai'], ch('vi', 'number', [3, 5, 12])), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], ch('en', 'number', [3, 5, 12])), '5', '"I think five"');
eq(V.match(['three fish'], ch('en', 'number', [2, 3, 4])), '3', 'en "three fish" → 3');
eq(V.match(['ba con cá'], ch('vi', 'number', [2, 3, 4])), '3', 'vi "ba con cá" → 3');
eq(V.match(['7'], ch('en', 'number', [6, 7, 8])), '7', 'digit transcript "7"');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
eq(V.match(['số chẵn'], ch('vi', 'parity', ['odd', 'even'])), 'even', '"số chẵn"');
eq(V.match(['bee'], ch('en', 'letter', ['A', 'B', 'C'])), 'B', '"bee" → B');
eq(V.match(['chữ tờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'T', '"chữ tờ" → T');
eq(V.match(['two plus three'], ch('en', 'sum', ['2+3', '1+1'])), '2+3', 'en sum spoken');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['ngôi sao'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'star', 'vi bare "ngôi sao"');
eq(V.match(['trai tim'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'heart', 'vi "trai tim"');
eq(V.match(['duck'], [{ id: 'c', kind: 'animal', value: 'duck' }, { id: 'p', kind: 'animal', value: 'pig' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['banana'], colEn), null, 'unrelated → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('game lines: sayFound / sayWrong / sayCount / sayCountDone');
const hat = (c) => ({ kind: 'hat', color: c, nameKind: 'color', nameValue: c });
const gem = (s, c) => ({ kind: 'gem', shape: s, color: c, nameKind: 'shape', nameValue: s });
const toy = (a, size) => Object.assign({ kind: 'toy', animal: a, nameKind: size ? 'size' : 'animal', nameValue: size || a }, size ? { size } : {});
const fish = (size) => Object.assign({ kind: 'fish' }, size ? { size, nameKind: 'size', nameValue: size } : { nameKind: 'fish', nameValue: 'fish' });
const tab = (text, nameKind) => ({ kind: 'tablet', text: String(text), nameKind: nameKind || (/^\d+$/.test(String(text)) ? 'number' : 'letter'),
  nameValue: /^\d+$/.test(String(text)) ? +text : String(text) });
eq(I.sayFound('en', { thing: hat('red'), topic: 'colors' }, r0), 'A red hat — so cosy!', 'found hat en (task)');
eq(I.sayFound('en', { thing: hat('orange'), topic: 'colors' }, r0), 'An orange hat — so cosy!', 'found an orange hat');
eq(I.sayFound('vi', { thing: hat('red'), topic: 'colors' }, r0), 'Cái mũ len đỏ — ấm quá!', 'found hat vi');
eq(I.sayFound('en', { thing: gem('star', 'red'), topic: 'shapes' }, r0), 'The star gem!', 'found gem en (DESIGN)');
eq(I.sayFound('vi', { thing: gem('star', 'red'), topic: 'shapes' }, r0), 'Viên đá băng hình ngôi sao!', 'found gem vi');
eq(I.sayFound('en', { thing: gem('star', 'blue'), topic: 'shapes', params: { shape: 'star', color: 'blue' } }, r0), 'The blue star!', 'found shapes5 en');
eq(I.sayFound('vi', { thing: gem('star', 'blue'), topic: 'shapes', params: { shape: 'star', color: 'blue' } }, r0), 'Viên đá băng hình ngôi sao màu xanh dương!', 'found shapes5 vi');
eq(I.sayFound('en', { thing: toy('fox'), topic: 'animals' }, r0), 'The fox! Hello!', 'found toy en (DESIGN)');
eq(I.sayFound('vi', { thing: toy('fox'), topic: 'animals' }, r0), 'Con cáo! Chào bạn!', 'found toy vi');
eq(I.sayFound('en', { thing: fish('big'), topic: 'size' }, r0), 'The big fish! Hooray!', 'found big fish');
eq(I.sayFound('vi', { thing: fish('big'), topic: 'size' }, r0), 'Con cá to! Hoan hô!', 'found big fish vi');
eq(I.sayFound('en', { thing: fish() }, r0), 'A fish! Hooray!', 'found a fish');
eq(I.sayFound('en', { thing: Object.assign(hat('green'), { size: 'small', nameKind: 'size', nameValue: 'small' }), topic: 'size' }, r0), 'The small hat — so cosy!', 'found small hat');
eq(I.sayFound('en', { thing: toy('whale', 'big'), topic: 'size' }, r0), 'The big whale! Hello!', 'found big toy');
eq(I.sayFound('en', { thing: fish(), topic: 'count', count: { i: 3, n: 4 } }, r0), 'Three!', 'count → count word');
eq(I.sayFound('vi', { thing: fish(), count: { i: 1, n: 2 } }, r0), 'Một!', 'vi count');
eq(I.sayFound('en', { thing: tab('B'), topic: 'letters' }, r0), 'Letter B! Super!', 'found letter');
eq(I.sayFound('en', { thing: tab('b'), topic: 'lower' }, r0), 'Small b! Super!', 'found small letter');
eq(I.sayFound('vi', { thing: tab('b'), topic: 'lower' }, r0), 'Chữ b thường! Giỏi quá!', 'found small letter vi');
eq(I.sayFound('en', { thing: toy('fox'), topic: 'initial' }, r0), 'F is for fox!', 'found initial en');
eq(I.sayFound('en', { thing: toy('owl'), topic: 'initial' }, r0), 'O is for owl!', 'found initial en owl');
eq(I.sayFound('vi', { thing: toy('goose'), topic: 'initial' }, r0), 'Chữ N, ngỗng!', 'found initial vi');
eq(I.sayFound('en', { thing: tab(7), topic: 'oddeven' }, r0), 'Seven is odd!', 'found parity');
eq(I.sayFound('en', { thing: tab(5), topic: 'add', params: { a: 2, b: 3 } }, r0), 'Five! 2 + 3 is five!', 'found sum (task example)');
eq(I.sayFound('vi', { thing: tab(4), topic: 'sub', params: { a: 7, b: 3 } }, r0), 'Bốn! 7 − 3 bằng bốn!', 'found diff vi');
eq(I.sayFound('en', { thing: tab(5) }, r0), 'Five! Super!', 'found number tablet');
eq(I.sayFound('en', {}, r0), 'Hooray!', 'found unknown → neutral');
eq(I.sayFound('en', { id: 'm1', x: 1, y: 2, thing: hat('red'), topic: 'colors' }, r0), 'A red hat — so cosy!', 'found accepts the raw world event (+ topic)');
eq(I.sayFound('en', hat('red'), r0), 'A red hat — so cosy!', 'found accepts a bare thing');
eq(I.sayCountDone('en', 3, r0), 'Three fish! Hooray!', 'countDone (task)');
eq(I.sayCountDone('en', 1, r0), 'One fish! Hooray!', 'countDone singular');
eq(I.sayCountDone('vi', 3, r0), 'Ba con cá! Hoan hô!', 'countDone vi');
// wrong
const wr = (thing, got, want, extra) => Object.assign({ kind: 'thing', thing, got, want, streak: 1 }, extra || {});
const nk = (k, v) => ({ nameKind: k, nameValue: v });
eq(I.sayWrong('en', wr(hat('blue'), nk('color', 'blue'), nk('color', 'red'), { topic: 'colors' }), r0),
  'That’s a blue hat. Let’s find the red one!', 'wrong hat en');
eq(I.sayWrong('vi', wr(hat('blue'), nk('color', 'blue'), nk('color', 'red'), { topic: 'colors' }), r0),
  'Đây là cái mũ len màu xanh dương. Mình tìm cái mũ len màu đỏ nhé!', 'wrong hat vi');
eq(I.sayWrong('en', wr(gem('circle', 'red'), nk('shape', 'circle'), nk('shape', 'triangle'), { topic: 'shapes' }), r0),
  'That’s a circle. Let’s find the triangle!', 'wrong shape en');
eq(I.sayWrong('vi', wr(gem('circle', 'red'), nk('shape', 'circle'), nk('shape', 'triangle'), { topic: 'shapes' }), r0),
  'Đây là viên đá băng hình tròn. Mình tìm viên đá băng hình tam giác nhé!', 'wrong shape vi');
eq(I.sayWrong('en', wr(gem('star', 'red'), nk('shape', 'star'), nk('shape', 'star'), { topic: 'shapes', params: { shape: 'star', color: 'blue' } }), r0),
  'That’s a red star. Let’s find the blue star!', 'wrong shapes5: same shape, other colour');
eq(I.sayWrong('en', wr(gem('heart', 'blue'), nk('shape', 'heart'), nk('shape', 'star'), { topic: 'shapes', params: { shape: 'star', color: 'blue' } }), r0),
  'That’s a blue heart. Let’s find the blue star!', 'wrong shapes5: same colour, other shape');
eq(I.sayWrong('en', wr(fish('small'), nk('size', 'small'), nk('size', 'big'), { topic: 'size' }), r0),
  'That’s the small fish. Let’s find the big one!', 'wrong size en');
eq(I.sayWrong('vi', wr(fish('small'), nk('size', 'small'), nk('size', 'big'), { topic: 'size' }), r0),
  'Đây là con cá nhỏ. Mình tìm con cá to nhé!', 'wrong size vi');
eq(I.sayWrong('vi', wr(toy('dog', 'small'), nk('size', 'small'), nk('size', 'big'), { topic: 'size' }), r0),
  'Đây là con chó nhỏ. Mình tìm con chó to nhé!', 'wrong size toy vi');
eq(I.sayWrong('en', wr(toy('hare'), nk('animal', 'hare'), nk('animal', 'fox'), { topic: 'animals' }), r0),
  'That’s a hare. Let’s find the fox!', 'wrong toy en');
eq(I.sayWrong('en', wr(toy('owl'), nk('animal', 'owl'), nk('animal', 'fox'), { topic: 'animals' }), r0),
  'That’s an owl. Let’s find the fox!', 'wrong toy en: "an owl"');
eq(I.sayWrong('vi', wr(toy('hare'), nk('animal', 'hare'), nk('animal', 'fox'), { topic: 'animals' }), r0),
  'Đây là con thỏ. Mình tìm con cáo nhé!', 'wrong toy vi');
eq(I.sayWrong('en', wr(hat('blue'), nk('color', 'blue'), nk('color', 'blue')), r0), 'Let’s look again!', 'same thing → generic');
eq(I.sayWrong('en', wr(tab('D'), nk('letter', 'D'), nk('letter', 'B'), { topic: 'letters' }), r0),
  'That’s letter D. Let’s find letter B!', 'wrong letter en');
eq(I.sayWrong('en', wr(tab('d'), nk('letter', 'd'), nk('letter', 'b'), { topic: 'lower' }), r0),
  'That’s small d. Let’s find small b!', 'wrong lower en');
eq(I.sayWrong('vi', wr(tab('D'), nk('letter', 'D'), nk('letter', 'B'), { topic: 'letters' }), r0),
  'Đây là chữ D. Mình tìm chữ B nhé!', 'wrong letter vi');
const mathEn = I.sayWrong('en', wr(tab(6), nk('number', 6), nk('number', 5), { topic: 'add' }), r0);
eq(mathEn, 'That’s number six. Let’s count again!', 'wrong add: no answer given');
ok(!/five|\b5\b/.test(mathEn), 'maths wrong line never names the right answer');
const mathVi = I.sayWrong('vi', wr(tab(6), nk('number', 6), nk('number', 5), { topic: 'sub' }), r0);
ok(!/năm|\b5\b/.test(mathVi) && /sáu/.test(mathVi), 'vi maths wrong line: ' + mathVi);
eq(I.sayWrong('en', wr(tab(4), nk('number', 4), nk('parity', 'odd'), { topic: 'oddeven' }), r0),
  'Four is even! Let’s look for another one!', 'wrong parity en');
eq(I.sayWrong('en', wr(toy('goose'), nk('animal', 'goose'), nk('letter', 'F'), { topic: 'initial' }), r0),
  'Goose starts with G! Let’s look again!', 'wrong initial en');
eq(I.sayWrong('vi', wr(toy('walrus'), nk('animal', 'walrus'), nk('letter', 'C'), { topic: 'initial' }), r0),
  'Hải mã bắt đầu bằng chữ H! Mình tìm lại nhé!', 'wrong initial vi');
eq(I.sayWrong('en', { got: nk('color', 'blue'), want: nk('color', 'red') }, r0), 'That’s blue. Let’s find red!', 'wrong without thing → colour names');
eq(I.sayWrong('en', {}, r0), 'Let’s look again!', 'empty event → generic');
for (let i = 0; i <= 20; i++) { eq(I.sayCount('en', i), I.t('en', 'count.' + i), 'sayCount ' + i); ok(clean(I.sayCount('vi', i)), 'vi count ' + i); }
eq(I.sayCount('en', 3), 'Three!', 'Three!');
eq(I.sayCount('vi', 15), 'Mười lăm!', 'Mười lăm!');
eq(I.sayCount('en', 25), '25!', 'beyond 20 → digits');
// sweep: every thing kind × value × topic, every wrong pair — clean and positive
let sweep = 0;
const THINGS = [].concat(
  COLORS.map(hat), COLORS.map(c => Object.assign(hat(c), { size: 'big', nameKind: 'size', nameValue: 'big' })),
  [].concat(...SHAPES.map(s => COLORS.map(c => gem(s, c)))),
  ANIMALS.map(a => toy(a)), ANIMALS.map(a => toy(a, 'small')),
  [fish(), fish('big'), fish('small')],
  LETTERS.map(L => tab(L)), LETTERS.map(L => tab(L.toLowerCase())),
  Array.from({ length: 21 }, (_, n) => tab(n)));
const TOPIC_OF = { hat: ['colors', 'size'], gem: ['shapes', 'size'], toy: ['animals', 'initial', 'size'], fish: ['count', 'size'],
  tablet: ['letters', 'lower', 'add', 'sub', 'oddeven'] };
for (const lang of I.langs) for (const th of THINGS) {
  for (const topic of TOPIC_OF[th.kind].concat([null])) for (const params of [{}, { a: 1, b: 2, color: 'blue', shape: 'star' }]) {
    for (const rv of [0, 0.5, 0.99]) {
      const s = I.sayFound(lang, { thing: th, topic, params }, () => rv);
      sweep++; if (!clean(s) || !positive(s) || OLD_EN.test(s) || OLD_VI.test(s)) ok(false, `${lang} found ${JSON.stringify(th)} ${topic}: ${s}`);
      if (th.kind === 'toy' && topic === 'animals' && !(clean(s) && s.toLowerCase().includes(I.name(lang, 'animal', th.animal)))) ok(false, `${lang} found toy names the animal: ${s}`);
      if (th.kind === 'hat' && topic === 'colors' && th.nameKind === 'color' && !s.toLowerCase().includes(I.name(lang, 'hue', th.color))) ok(false, `${lang} found hat names the colour: ${s}`);
    }
  }
  const same = THINGS.filter(x => x.kind === th.kind && x.nameKind === th.nameKind);
  for (const w of same.filter((x, i) => i % 3 === 0)) for (const topic of TOPIC_OF[th.kind]) {
    const s = I.sayWrong(lang, { kind: 'thing', thing: th, got: nk(th.nameKind, th.nameValue), want: nk(w.nameKind, w.nameValue), topic,
      params: { color: w.color, shape: w.shape, a: 1, b: 2 } }, r9);
    sweep++; if (!clean(s) || !positive(s)) ok(false, `${lang} wrong ${JSON.stringify(th)} want ${JSON.stringify(w)} ${topic}: ${s}`);
  }
  ok(clean(I.thingPhrase(lang, th, { art: 'the', color: true, size: true }) || 'x'), `${lang} thingPhrase ${JSON.stringify(th)}`);
}
ok(sweep > 5000, `swept ${sweep} lines`);
for (const lang of I.langs) for (const ev of [null, undefined, 5, 'x', [], { thing: 7 }, { thing: { kind: 'zzz', nameKind: 'zzz', nameValue: {} } },
  { want: 'x' }, { count: { i: 'x' } }, { thing: { kind: 'hat' } }, { thing: { kind: 'gem' } }, { thing: { kind: 'fish' } }, { thing: { kind: 'toy' } },
  { thing: { kind: 'tablet' } }, { thing: { kind: 'egg', color: 'red' } },
  { got: { nameKind: 'color' }, want: {} }, { thing: { kind: 'hat', color: 'nope' }, got: nk('color', 'nope'), want: nk('color', 'red') }]) {
  let out;
  try { out = [I.sayFound(lang, ev), I.sayWrong(lang, ev), I.sayCountDone(lang, ev), I.talkWrong(lang, ev)]; } catch (e) { out = null; }
  ok(out && out.every(clean), `${lang} garbage ${JSON.stringify(ev)} → ${JSON.stringify(out)}`);
}

section('talk');
eq(I.t('en', 'talk.colors', { color: 'red' }), 'What colour is this hat?', 'talk.colors en — never says the answer');
eq(I.t('vi', 'talk.colors', {}), 'Cái mũ len này màu gì nhỉ?', 'talk.colors vi');
eq(I.t('en', 'talk.colorsWhich', { color: 'red' }), 'Which hat is red?', 'talk.colorsWhich en');
eq(I.t('vi', 'talk.colorsWhich', { color: 'red' }), 'Cái mũ len nào màu đỏ nhỉ?', 'talk.colorsWhich vi');
eq(I.t('en', 'talk.colorsWhich', {}), 'What colour is this hat?', 'talk.colorsWhich without colour → talk.colors');
eq(I.t('en', 'talk.shapes', { shape: 'triangle' }), 'Which one is the triangle?', 'talk.shapes en (REQUIREMENT)');
eq(I.t('vi', 'talk.shapes', { shape: 'circle' }), 'Hình tròn là cái nào nhỉ?', 'talk.shapes vi');
eq(I.t('en', 'talk.shapes', {}), 'What shape is this gem?', 'talk.shapes without shape');
eq(I.t('en', 'talk.size', { size: 'big', kind: 'fish' }), 'Which fish is big?', 'talk.size en');
eq(I.t('vi', 'talk.size', { size: 'small', kind: 'hat' }), 'Cái mũ len nào nhỏ nhỉ?', 'talk.size vi');
eq(I.t('en', 'talk.size', { size: 'small' }), 'Which one is small?', 'talk.size without kind');
eq(I.t('en', 'talk.size', {}), 'Which one is big?', 'talk.size without anything');
eq(I.t('en', 'talk.count', { n: 4 }), 'How many fish?', 'talk.count en — never says the answer');
eq(I.t('vi', 'talk.count', { n: 4 }), 'Có mấy con cá nào?', 'talk.count vi');
eq(I.t('en', 'talk.animals', { animal: 'reindeer' }), 'Where is the reindeer?', 'talk.animals en (content: no picture shown, toy choices)');
eq(I.t('vi', 'talk.animals', { animal: 'reindeer' }), 'Con tuần lộc ở đâu nhỉ?', 'talk.animals vi');
eq(I.t('en', 'talk.animals', {}), 'Who is this?', 'talk.animals without animal → talk.animalsAny');
eq(I.t('en', 'talk.animalsAny', { animal: 'fox' }), 'Who is this?', 'talk.animalsAny (a toy shown) never says the answer');
eq(I.t('en', 'talk.letters', { letter: 'M' }), 'Where is the letter M?', 'talk.letters');
eq(I.t('en', 'talk.lower', { letter: 'G' }), 'Where is small g? It goes with big G!', 'talk.lower');
eq(I.t('vi', 'talk.initial', { animal: 'fox', letter: 'C' }), 'Cáo bắt đầu bằng chữ gì nhỉ?', 'talk.initial vi (no answer)');
eq(I.t('en', 'talk.initial', { animal: 'owl', letter: 'O' }), 'Which letter does owl start with?', 'talk.initial en from animal');
eq(I.t('en', 'talk.add', { a: 2, b: 3 }), 'What is 2 + 3?', 'talk.add');
eq(I.t('en', 'talk.add', {}), 'What is the answer?', 'talk.add without a/b');
eq(I.t('en', 'talk.oddeven', { parity: 'odd' }), 'Which number is odd?', 'talk.oddeven');
eq(I.t('vi', 'talk.oddeven', { parity: 'even' }), 'Số nào là số chẵn nhỉ?', 'talk.oddeven vi');
// dig Talk choices are {id, thing:{kind, …}, value?} (DigArt.drawIcon kinds)
const CHOICES = [].concat(
  COLORS.map(c => ({ id: 'e' + c, thing: { kind: 'hat', color: c } })), COLORS.map(c => ({ id: 'b' + c, thing: { kind: 'blob', color: c } })),
  COLORS.map(c => ({ id: 'd' + c, thing: { kind: 'blob', color: c } })),
  SHAPES.map(s => ({ id: 's' + s, thing: { kind: 'gem', shape: s, color: 'red' } })),
  ANIMALS.map(a => ({ id: 't' + a, thing: { kind: 'toy', animal: a } })),
  Array.from({ length: 11 }, (_, n) => ({ id: 'n' + n, thing: { kind: 'number', n }, value: n })),
  Array.from({ length: 11 }, (_, n) => ({ id: 'o' + n, thing: { kind: 'dots', n } })),
  LETTERS.map(L => ({ id: 'l' + L, thing: { kind: 'letter', text: L } })), LETTERS.map(L => ({ id: 'q' + L, thing: { kind: 'letter', text: L.toLowerCase() } })),
  ['big', 'small'].map(s => ({ id: 'z' + s, thing: { kind: 'size', size: s, of: 'fish' } })),
  ['big', 'small'].map(s => ({ id: 'y' + s, thing: { kind: 'size', size: s, of: 'hat', color: 'red' } })));
for (const lang of I.langs) for (const c of CHOICES) {
  const ws = I.choiceWords(lang, c);
  ok(ws.length > 0 && ws.every(w => typeof w === 'string' && w && w === w.toLowerCase()), `${lang} choiceWords ${c.id}: ${ws.slice(0, 4)}`);
  const tw = I.talkWrong(lang, c);
  ok(clean(tw) && positive(tw) && tw !== I.t(lang, 'talk.wrong.any'), `${lang} talkWrong ${c.id}: ${tw}`);
  const kv = I.kindValue(c);
  if (kv[0] === 'color' || kv[0] === 'shape' || kv[0] === 'animal') ok(ws.some(w => !VI_DIACRITIC.test(w)), `${lang} choice ${c.id} has a no-diacritic form`);
}
// a spoken answer picks the right picture among 3 choices of one Talk question
for (const lang of I.langs) for (const group of [CHOICES.slice(0, 3), CHOICES.slice(21, 24), CHOICES.slice(29, 32), CHOICES.slice(37, 40)]) {
  const set = group.map(c => ({ id: c.id, words: I.choiceWords(lang, c) }));
  for (const c of group) {
    const kv = I.kindValue(c), said = I.name(lang, kv[0], kv[1]);
    eq(V.match([said], set), c.id, `${lang} talk choice said "${said}" → ${c.id}`);
    eq(V.match([I.stripMarks(said)], set), c.id, `${lang} talk choice said without marks "${I.stripMarks(said)}" → ${c.id}`);
  }
}
ok(I.choiceWords('vi', { id: 'c0', thing: { kind: 'hat', color: 'blue' } }).includes('xanh duong'), 'choiceWords hat → colour forms (no marks)');
ok(I.choiceWords('vi', { id: 't', thing: { kind: 'toy', animal: 'reindeer' } }).includes('tuan loc'), 'choiceWords toy → "tuan loc"');
eq(I.kindValue({ thing: { kind: 'fish' } }).join(':'), 'thing:fish', 'kindValue fish → thing fish');
eq(I.kindValue({ thing: { kind: 'gem', color: 'red' } }).join(':'), 'color:red', 'kindValue gem without shape → colour');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'dots', n: 4 } }).includes('4'), 'choiceWords dots → digit');
eq(I.talkWrong('en', { thing: { kind: 'hat', color: 'blue' } }), 'It is blue! Good try!', 'talkWrong(hat choice)');
eq(I.talkWrong('vi', { thing: { kind: 'hat', color: 'blue' } }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'talkWrong hat vi');
eq(I.talkWrong('en', { thing: { kind: 'gem', shape: 'oval', color: 'red' } }), 'It is an oval! Good try!', 'talkWrong gem → an oval');
eq(I.talkWrong('en', { thing: { kind: 'toy', animal: 'walrus' } }), 'It is the walrus! Good try!', 'talkWrong toy');
eq(I.talkWrong('vi', { thing: { kind: 'toy', animal: 'whale' } }), 'Là con cá voi đó! Bé cố gắng lắm!', 'talkWrong toy vi');
eq(I.talkWrong('vi', { id: 'c1', thing: { kind: 'number', n: 7 }, value: 7 }), 'Là số bảy đó! Bé cố gắng lắm!', 'talkWrong number choice');
eq(I.talkWrong('en', { thing: { kind: 'dots', n: 3 } }), 'It is three! Good try!', 'talkWrong dots');
eq(I.talkWrong('en', { thing: { kind: 'letter', text: 'g' } }), 'It is small letter g! Good try!', 'talkWrong small letter choice');
eq(I.talkWrong('en', { thing: { kind: 'size', size: 'big', of: 'fish' } }), 'It is the big one! Good try!', 'talkWrong size');
eq(I.talkWrong('vi', { thing: { kind: 'size', size: 'big' } }), 'Là cái to đó! Bé cố gắng lắm!', 'talkWrong size vi');
eq(I.talkWrong('en', 'color', 'red'), 'It is red! Good try!', 'talkWrong colour');
eq(I.talkWrong('en', { kind: 'parity', value: 'odd' }), 'It is odd! Good try!', 'talkWrong object arg');
eq(I.talkWrong('en', 'color', null), 'Good try! Let’s keep digging!', 'talkWrong without value');
for (const t of TOPICS) for (const lang of I.langs) ok(clean(I.t(lang, 'talk.' + t, { animal: 'fox', kind: 'fish', size: 'big', n: 4, a: 1, b: 2, letter: 'B', color: 'red', shape: 'star', parity: 'odd' })), `${lang} talk.${t}`);
// Talk questions never contain their answer
for (const lang of I.langs) for (const k of ['talk.colors', 'talk.count', 'talk.countAny', 'talk.animalsAny', 'talk.initial', 'talk.add', 'talk.sub'])
  ok(!/\{(n|letter|ans|answer|num|color|animal)\}/.test(I.raw(lang, k)), `${lang} ${k} does not speak the answer`);

// the real dig content.js (when it has landed): every prompt / Talk key + params and every mound thing renders clean
if (contentSB) {
  section('content.js: every promptKey / Talk key / mound thing it produces');
  const C = contentSB.NK.Content, RNG = contentSB.NK.RNG;
  const mkRng = (seed) => { try { return new RNG(seed); } catch (e) { return RNG(seed); } };
  let n = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of TOPICS) for (const lang of I.langs) for (let seed = 1; seed <= 6; seed++) {
    let rd = null, tk = null;
    try { rd = C.makeRound(topic, { age, lang, rng: mkRng(seed), roundIndex: seed % 4, level: seed % 4, surprise: null }); } catch (e) { /* topic not for this age */ }
    try { tk = C.makeTalk(topic, { age, lang, rng: mkRng(seed) }); } catch (e) { /* ignore */ }
    if (rd && rd.steps) for (const st of rd.steps) {
      n++;
      ok(I.has(lang, st.promptKey), `${lang} content prompt key ${st.promptKey} exists`);
      const s = I.t(lang, st.promptKey, st.params || {}, r9);
      ok(clean(s) && positive(s) && (s !== I.t(lang, 'p.any', null, r9) || !I.PROMPTS[st.promptKey]), `${lang} ${topic} age ${age} ${st.promptKey} ${JSON.stringify(st.params)}: ${s}`);
      // the right mound: the found line and a wrong line against every other mound
      const target = (rd.mounds || []).find(m => (st.targets || []).includes(m.id));
      if (target) {
        const f = I.sayFound(lang, { thing: target.thing, topic, params: st.params, count: st.mode === 'count' ? { i: 1, n: st.need } : undefined }, r9);
        ok(clean(f) && positive(f) && (st.mode === 'count' || f !== I.t(lang, 'found.any', null, r9)), `${lang} ${topic} found ${JSON.stringify(target.thing)}: ${f}`);
        for (const m of rd.mounds) if (!(st.targets || []).includes(m.id) && st.mode !== 'count') {
          const w = I.sayWrong(lang, { kind: 'thing', thing: m.thing, got: { nameKind: m.thing.nameKind, nameValue: m.thing.nameValue },
            want: { nameKind: st.nameKind, nameValue: st.nameValue }, topic, params: st.params }, r9);
          ok(clean(w) && positive(w), `${lang} ${topic} wrong ${JSON.stringify(m.thing)} want ${st.nameKind}/${st.nameValue}: ${w}`);
          if (['colors', 'shapes', 'animals', 'size', 'letters', 'lower'].includes(topic))
            ok(!I.raw(lang, 'wrong.any').includes(w), `${lang} ${topic} wrong names the thing: ${w}`);
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
        if (kv[0] !== 'letter') eq(V.match([nm], ids), c.id, `${lang} ${topic} talk choice said "${nm}" → ${c.id}`);
      }
      ok(!/\{/.test(q) && (topic !== 'count' || !(tk.params && q.includes(String(tk.params.n)))), `${lang} talk ${topic} never says the answer: ${q}`);
    }
  }
  ok(n > 50, `content checked: ${n} steps / talks`);
}

section('speech text: letters, maths, "Nuka"');
eq(I.speech('en', 'That’s letter D. Let’s find letter B!'), 'That’s letter dee. Let’s find letter bee!', 'en letter names');
eq(I.speech('en', 'D is for dog!'), 'dee is for dog!', 'en "D is for"');
eq(I.speech('en', 'O is for owl!'), 'oh is for owl!', 'en "O is for owl"');
eq(I.speech('en', 'Walrus starts with W! Let’s look again!'), 'Walrus starts with double you! Let’s look again!', 'en starts with');
eq(I.speech('en', 'Big B has a little friend. Find small b!'), 'Big bee has a little friend. Find small bee!', 'en big/small letters');
eq(I.speech('en', 'What is 2 + 3? Dig up the answer!'), 'What is 2 plus 3? Dig up the answer!', 'en plus');
eq(I.speech('vi', 'Bé ơi, 7 − 2 bằng mấy?'), 'Bé ơi, 7 trừ 2 bằng mấy?', 'vi minus');
eq(I.speech('vi', 'Bé ơi, tìm chữ B nhé!'), 'Bé ơi, tìm chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Chữ N, ngỗng!'), 'Chữ nờ, ngỗng!', 'vi letter N');
eq(I.speech('en', 'Hi! I am Nuka.'), 'Hi! I am Nuka.', 'en "Nuka" as written');
eq(I.speech('en', 'Wait a moment, Nuka’s paws are busy!'), 'Wait a moment, Nuka’s paws are busy!', 'en "Nuka’s" as written');
eq(I.speech('vi', 'Mình là gấu Nuka. Nuka giúp bé nhé!'), 'Mình là gấu Nu Ca. Nu Ca giúp bé nhé!', 'vi "Nuka" → "Nu Ca" (two Vietnamese syllables)');
eq(I.speech('vi', 'Nuka đang nghe…'), 'Nu Ca đang nghe.', 'vi "Nuka" at the start');
eq(I.speech('vi', 'Vèo! Nuka trượt bằng bụng nè!'), 'Vèo! Nu Ca trượt bằng bụng nè!', 'vi "Nuka" after punctuation');
eq(I.speech('vi', 'Nukaa Nukas'), 'Nukaa Nukas', 'vi: only the whole word "Nuka" is rewritten');
for (const k of I.keys('vi')) for (const s of [].concat(I.raw('vi', k))) if (/Nuka/.test(s))
  ok(!/Nuka/.test(I.speech('vi', s)) && /Nu Ca/.test(I.speech('vi', s)), `vi ${k}: TTS says "Nu Ca": ${I.speech('vi', s)}`);
for (const k of I.keys('en')) for (const s of [].concat(I.raw('en', k))) if (/Nuka/.test(s))
  ok(/Nuka/.test(I.speech('en', s)) && !/Nu Ca/.test(I.speech('en', s)), `en ${k}: TTS keeps "Nuka"`);
eq(I.speech('en', 'A red hat — so cosy!'), 'A red hat, so cosy!', 'dash → comma pause');
eq(I.speech('en', 'Find the big fish!'), 'Find the big fish!', '"big fish" is not a letter');
eq(I.speech('en', 'Nuka is listening…'), 'Nuka is listening.', 'ellipsis → full stop');
eq(V.spoken('vi', 'Chào bé! Mình là Nuka.'), 'Chào bé! Mình là Nu Ca.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Find the letter B!'), 'Find the letter bee!', 'Voice.spoken letter names');

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
  sb4.NK = {};
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
  sb7.NK = {};
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
  sb5.NK = {};
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
  sb6.NK = {};
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
ok(sb.NK.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into NK.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof NK.Input.attach === 'function' && typeof NK.Input.kidProof === 'function' && typeof NK.Input.holdButton === 'function',
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
  sbx.NK = {};
  env.NK = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.NK.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Nuka: rate 0.9, pitch 1.2');
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
  // vi: "Nuka" goes to TTS as "Nu Ca", letter names are rewritten; the bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là gấu Nuka. Bé tìm chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là gấu Nu Ca. Bé tìm chữ bờ nhé!', 'vi utterance: "Nu Ca", "chữ bờ"');
  eq(startText, 'Mình là gấu Nuka. Bé tìm chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animals', { animal: 'fox' }, { lang: 'vi' });
  ok(/^(Con cáo ở đâu nhỉ\?|Bé ơi, tìm con cáo nhé!|Mình đào con cáo lên nào!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  E3.NK.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['fox', 'whale', 'owl']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the whale')] });
  eq((await pr2).id, 'whale', 'interim match resolves after a short wait');
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
