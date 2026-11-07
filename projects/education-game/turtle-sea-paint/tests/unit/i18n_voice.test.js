#!/usr/bin/env node
// Nini's Sea Painting — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/turtle-sea-paint:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md. When game/js/pictures.js (SP.PART_NAMES) and the sea
// content.js exist, every part name and every prompt / Talk key + params they produce are checked too.
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
  return sb.SP;
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
    !/màu màu/i.test(s) && !/\bthe the\b/i.test(s) && !/\bcon con\b/.test(s);
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');

// ------------------------------------------------------------------ DESIGN value lists
const ANIMALS = ['fish', 'crab', 'octopus', 'starfish', 'jellyfish', 'seahorse', 'whale', 'dolphin'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const SPOTS = ['bubble', 'pearl', 'shell', 'starfish'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const ALIVE = ['swim', 'scuttle', 'sail', 'bob', 'float'];
const BASE_PARTS = ['body', 'tail', 'fin', 'sail', 'hull', 'flag', 'shell', 'claws', 'legs', 'bell', 'tentacles', 'head', 'arms',
  'hat', 'belly', 'tower', 'window', 'roof', 'rock', 'door', 'spots', 'star', 'wheel', 'cabin', 'wave', 'sun', 'cloud'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.SP = { debug: { voiceLog: [] } };
let SP;
try { SP = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = SP.I18N, V = SP.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js'])
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(JS, f), 'utf8')), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
eq(JSON.stringify(I.SEA_ANIMALS), JSON.stringify(ANIMALS), 'I18N.SEA_ANIMALS = DESIGN list');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');

// part names: DESIGN minimum + whatever pictures.js exports (another agent writes it; poll-safe)
let PARTS = BASE_PARTS.slice(), picturesLoaded = false, contentSB = null;
if (fs.existsSync(path.join(JS, 'pictures.js'))) {
  try {
    const sbp = makeSandbox(); sbp.SP = {};
    const files = ['rng.js', 'i18n.js', 'pictures.js'].filter(f => fs.existsSync(path.join(JS, f)));
    load(sbp, files);
    const pn = sbp.SP.PART_NAMES || (sbp.SP.Pictures && sbp.SP.Pictures.PART_NAMES);
    if (pn) {
      const list = Array.isArray(pn) ? pn : Object.keys(pn);
      PARTS = [...new Set(PARTS.concat(list.map(String)))];
      picturesLoaded = true;
      // every template's parts use known names / kinds
      const P = sbp.SP.Pictures;
      if (P && P.TEMPLATES) for (const id of Object.keys(P.TEMPLATES)) {
        let pic = null; try { pic = P.build(id, {}); } catch (e) { /* kinds that need opt */ }
        if (pic && pic.parts) for (const pt of pic.parts) if (pt.nameKind === 'part') PARTS.includes(String(pt.nameValue)) || PARTS.push(String(pt.nameValue));
      }
    }
    const csrc = fs.existsSync(path.join(JS, 'content.js')) ? fs.readFileSync(path.join(JS, 'content.js'), 'utf8') : '';
    if (/Sea Painting|SP\.Pictures/.test(csrc)) { load(sbp, ['content.js']); contentSB = sbp; }
  } catch (e) { ok(false, 'pictures.js / content.js load: ' + e.message); }
}
console.log(`   (part names: ${PARTS.length}${picturesLoaded ? ', incl. SP.PART_NAMES from pictures.js' : ', pictures.js not there yet'}` +
  `${contentSB ? '; sea content.js loaded' : ''})`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapNini', 'tapHint', 'quieter', 'louder', 'skip', 'langName.en', 'langName.vi'];
// every data-i18n / T('ui.…') this game's index.html, ui.js and main.js use must exist
const usedUi = new Set();
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, 'game', f), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="(ui\.[\w.]+)"/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/T\((?:lang, )?'(ui\.[\w.]+)'/g)) usedUi.add(m[1]);
}
ok(usedUi.size >= 10, 'found the ui keys index.html / ui.js / main.js use (' + usedUi.size + ')');
const PROMPT_KEYS = ['p.colors', 'p.tapPart', 'p.shapes', 'p.shapes5', 'p.size', 'p.animals', 'p.count', 'p.letters', 'p.lower',
  'p.initial', 'p.add', 'p.sub', 'p.oddeven'];
const PAINT_KEYS = ['part', 'shape', 'spot', 'animal', 'label', 'parity', 'initial', 'sum', 'any'].map(k => 'say.paint.' + k);
const LINE_KEYS = ['say.pick', 'say.pick.any', 'wrong.color', 'wrong.part', 'wrong.math', 'wrong.parity', 'wrong.initial', 'wrong.any',
  'needPaint', 'needPaint.any', 'notThis', 'notThis.any', 'already', 'finish', 'enter', 'hint', 'idle', 'praise', 'great', 'stepDone',
  'party', 'surprise.fishy', 'fishy.tap', 'surprise.pearl', 'pearl.tap', 'session.done', 'p.any'].concat(ALIVE.map(a => 'alive.' + a));
const TALK_KEYS = ['talk.intro', 'talk.right', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.size', 'talk.wrong.letter',
  'talk.wrong.small', 'talk.wrong.number', 'talk.wrong.any', 'talk.sizeAny', 'talk.countAny', 'talk.calc', 'talk.oddevenAny',
  'talk.colorsAny', 'talk.shapesAny', 'talk.sizeOne', 'talk.animalsAny', 'talk.lettersAny', 'talk.lowerAny', 'talk.initialAny']
  .concat(TOPICS.map(k => 'talk.' + k));
const COUNT_KEYS = Array.from({ length: 21 }, (_, i) => 'count.' + i);
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k)).concat([...usedUi])
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(PROMPT_KEYS).concat(PAINT_KEYS).concat(LINE_KEYS).concat(TALK_KEYS).concat(COUNT_KEYS);
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
// no train-only keys or words left
for (const k of enKeys) ok(!/whistle|cargo|depart|toot|hitch|balloon|loaded|deal|full|carDone|grab|correct|homes/i.test(k), `no train-only key: ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(!/Momo|\btrain\b|\bcar\b|\bcars\b|whistle|toa |tàu|còi|\bowl\b|Mô Mô/i.test(s), `${lang} ${k}: no train / Momo words: ${s}`);
// instructions have 3 wordings
for (const lang of I.langs) for (const k of PROMPT_KEYS.concat(['p.any', 'enter', 'finish', 'already', 'needPaint', 'notThis',
  'wrong.color', 'wrong.part', 'say.pick', 'say.paint.part', 'say.paint.animal', 'say.paint.shape', 'stepDone', 'hint', 'idle'])
  .concat(ALIVE.map(a => 'alive.' + a)))
  ok([].concat(I.raw(lang, k)).length >= 3, `${lang} ${k}: 3 wordings`);
for (const lang of I.langs) for (const k of TOPICS.map(t => 'topic.' + t)) ok(!Array.isArray(I.raw(lang, k)), `${lang} ${k} is one banner string`);

section('titles, Nini, Vietnamese warmth');
eq(I.t('en', 'ui.title'), 'Nini’s Sea Painting', 'en title');
eq(I.t('en', 'ui.logo1') + ' ' + I.t('en', 'ui.logo2'), 'Nini’s Sea Painting', 'en logo lines');
eq(I.t('vi', 'ui.logo1'), 'Rùa Nini', 'vi logo line 1');
eq(I.t('vi', 'ui.logo2'), 'Tô Màu Đại Dương', 'vi logo line 2');
ok(/Rùa Nini/.test(I.t('vi', 'ui.title')), 'vi title "Rùa Nini"');
ok(/Nini/.test(I.t('en', 'ui.voice')) && /Nini/.test(I.t('vi', 'ui.voice')), 'voice setting names Nini');
for (const k of PROMPT_KEYS.filter(k => k !== 'p.tapPart')) ok([].concat(I.raw('vi', k)).some(s => /Bé ơi/.test(s)), `vi ${k}: a warm "Bé ơi" wording`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /nhé|nào|nha/.test(s)), `vi ${k}: "nhé / nào"`);
for (const k of I.keys('vi')) if (!/^ui\.langName|^say\.pick$/.test(k))
  ok(JSON.stringify(I.raw('vi', k)) !== JSON.stringify(I.raw('en', k)), `vi ${k} is translated`);

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  for (const s of [].concat(I.raw(lang, k))) ok(positive(s), `${lang} ${k} is positive: ${s}`);
}

section('every string renders, no "{" left, no "màu màu"');
const SAMPLE = { n: 3, a: 2, b: 4, stars: 7, color: 'red', shape: 'star', size: 'big', animal: 'crab', part: 'tail', spot: 'pearl',
  letter: 'B', lower: 'b', word: 'crab', first: 'C', expr: '2+3', ans: 'five', num: 'seven', parity: 'odd', label: 'letter B',
  got: { nameKind: 'shape', nameValue: 'circle' }, want: { nameKind: 'shape', nameValue: 'triangle' }, answer: 'red' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let v = 0; v < raw.length; v++) {
    const rng = () => (v + 0.5) / raw.length;
    for (const child of ['', 'Mai']) {
      const s = I.t(lang, k, Object.assign({ child }, SAMPLE), rng);
      ok(clean(s), `${lang} ${k} [${v}] child="${child}" renders clean: ${s}`);
    }
  }
}
// child name handling
I.setChild('');
ok(!/friend|\bbé\b,/.test(I.t('en', 'great', null, r9)), 'great without a name picks a no-name variant');
I.setChild('Mai');
eq(I.t('en', 'ui.welcome'), 'Hi Mai! I am Nini. Let’s paint the sea!', 'welcome with the child name');
ok(/Mai/.test(I.t('vi', 'ui.welcome')), 'vi welcome with the child name');
ok(/Mai/.test(I.t('en', 'great', null, r0)), 'great with the child name');
I.setChild('');
eq(I.t('en', 'ui.welcome'), 'Hi! I am Nini. Let’s paint the sea!', 'welcome without a name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé! Mình là rùa Nini. Mình cùng tô màu biển xanh nhé!', 'vi welcome without a name');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'ui.chapter');
eq(I.t('vi', 'session.done', { stars: 12 }, r0), 'Biển tranh đẹp quá! 12 ngôi sao!', 'vi session.done');
eq(I.t('en', 'weather.0'), 'Spring petals on the water!', 'weather.0 spring');
eq(I.t('en', 'weather.1'), 'Sunny summer sea!', 'weather.1 summer');
eq(I.t('en', 'weather.3'), 'Brr, winter! Ice on top!', 'weather.3 winter');
eq(I.t('en', 'enter', null, r0), 'A new picture!', 'enter');
eq(I.t('en', 'finish', null, r0), 'Nini finishes the rest!', 'finish');
eq(I.t('en', 'alive.swim', null, r0), 'Look, it’s swimming!', 'alive.swim');
eq(I.t('en', 'p.nonsense', null, r0), I.t('en', 'p.any', null, r0), 'unknown prompt key → p.any');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key → the key');

section('prompts: DESIGN examples, every param filled, plurals, fallbacks');
eq(I.t('en', 'p.colors', { part: 'tail', color: 'blue' }, r0), 'Let’s paint the tail blue!', 'p.colors en');
eq(I.t('vi', 'p.colors', { part: 'tail', color: 'blue' }, r0), 'Bé ơi, tô cái đuôi màu xanh dương nhé!', 'p.colors vi');
eq(I.t('vi', 'p.colors', { part: 'sail', color: 'red' }, () => 0.5), 'Mình tô cánh buồm màu đỏ nào! Bé tìm vỏ sò màu đỏ nhé!', 'p.colors vi [1]');
eq(I.t('en', 'p.tapPart', { part: 'tail' }, r0), 'Now tap the shining tail!', 'p.tapPart en');
eq(I.t('en', 'p.shapes', { shape: 'triangle', color: 'yellow' }, r0), 'Paint the triangle yellow!', 'p.shapes en');
eq(I.t('vi', 'p.shapes', { shape: 'triangle', color: 'yellow' }, r0), 'Bé ơi, tô hình tam giác màu vàng nhé!', 'p.shapes vi');
eq(I.t('en', 'p.shapes', { shape: 'triangle' }, r0), 'Paint the triangle!', 'p.shapes without colour');
eq(I.t('en', 'p.shapes5', { shape: 'heart' }, r0), 'Paint the heart!', 'p.shapes5 without colour → p.shapes');
eq(I.t('en', 'p.size', { size: 'big', animal: 'fish', color: 'red' }, r0), 'Paint the big fish red!', 'p.size en');
eq(I.t('vi', 'p.size', { size: 'big', animal: 'fish', color: 'red' }, r0), 'Bé ơi, tô con cá to màu đỏ nhé!', 'p.size vi');
eq(I.t('en', 'p.animals', { animal: 'crab', color: 'red' }, r0), 'Can you paint the crab red?', 'p.animals en');
eq(I.t('vi', 'p.animals', { animal: 'crab', color: 'red' }, r0), 'Bé ơi, tô con cua màu đỏ nhé!', 'p.animals vi');
eq(I.t('en', 'p.count', { n: 3, spot: 'bubble', color: 'blue' }, r0), 'Paint 3 bubbles blue!', 'p.count en plural');
eq(I.t('en', 'p.count', { n: 1, spot: 'pearl', color: 'pink' }, r0), 'Paint 1 pearl pink!', 'p.count en singular');
eq(I.t('en', 'p.count', { n: 4, spot: 'starfish' }, r0), 'Paint 4 starfish!', 'p.count starfish plural, no colour');
eq(I.t('vi', 'p.count', { n: 3, spot: 'pearl', color: 'pink' }, r0), 'Bé ơi, tô 3 viên ngọc trai màu hồng nhé!', 'p.count vi');
eq(I.t('vi', 'p.count', { n: 2, spot: 'bubble' }, r0), 'Bé ơi, tô 2 bong bóng nhé!', 'p.count vi no colour');
eq(I.t('en', 'p.count', { n: 3 }, r0), 'Paint 3 spots!', 'p.count without spot → spots');
eq(I.t('en', 'p.letters', { letter: 'B' }, r0), 'Paint the letter B!', 'p.letters en');
eq(I.t('vi', 'p.letters', { letter: 'B' }, r0), 'Bé ơi, tô chữ B nhé!', 'p.letters vi');
eq(I.t('en', 'p.lower', { letter: 'B' }, () => 0.5), 'Find small b and paint it!', 'p.lower en');
eq(I.t('en', 'p.lower', { letter: 'b' }, r0), 'Big B has a little friend. Paint small b!', 'p.lower given a small letter');
eq(I.t('en', 'p.initial', { letter: 'C' }, r0), 'Paint the animal that starts with C!', 'p.initial en');
eq(I.t('en', 'p.add', { a: 2, b: 3 }, r0), 'What is 2 + 3? Paint the answer!', 'p.add en');
eq(I.t('vi', 'p.sub', { a: 7, b: 2 }, r0), 'Bé ơi, 7 − 2 bằng mấy? Bé tô đáp án nhé!', 'p.sub vi');
eq(I.t('en', 'p.oddeven', { parity: 'odd' }, r0), 'Paint all the odd numbers!', 'p.oddeven en');
eq(I.t('vi', 'p.oddeven', { parity: 'even' }, r0), 'Bé ơi, tô tất cả các số chẵn nhé!', 'p.oddeven vi');
eq(I.t('en', 'p.colors', { color: 'red' }, r0), I.t('en', 'p.any', null, r0), 'p.colors without part → p.any');
eq(I.t('en', 'p.add', { a: 2 }, r0), I.t('en', 'p.any', null, r0), 'p.add without b → p.any');
eq(I.t('en', 'p.tapPart', {}, r0), I.t('en', 'notThis.any', null, r0), 'p.tapPart without part → notThis.any');
// sweeps
for (const lang of I.langs) for (const part of PARTS) for (const color of COLORS) {
  const raw = [].concat(I.raw(lang, 'p.colors'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.colors', { part, color }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s) && s.toLowerCase().includes(I.name(lang, 'part', part).toLowerCase()) &&
      s.toLowerCase().includes(I.name(lang, 'color', color)), `${lang} p.colors ${part} ${color} [${v}]: ${s}`);
  }
  ok(clean(I.t(lang, 'p.tapPart', { part }, r9)), `${lang} p.tapPart ${part}`);
}
for (const lang of I.langs) for (const k of ['p.shapes', 'p.shapes5']) for (const shape of SHAPES) for (const color of COLORS.concat([null])) {
  const s = I.t(lang, k, { shape, color }, r9);
  ok(clean(s) && positive(s) && s.toLowerCase().includes(I.name(lang, 'shape', shape)), `${lang} ${k} ${shape} ${color}: ${s}`);
}
for (const lang of I.langs) for (const animal of ANIMALS) for (const color of COLORS.concat([null])) {
  for (const size of ['big', 'small']) {
    const raw = [].concat(I.raw(lang, 'p.size'));
    for (let v = 0; v < raw.length; v++) {
      const s = I.t(lang, 'p.size', { size, animal, color }, () => (v + 0.5) / raw.length);
      ok(clean(s) && s.includes(I.name(lang, 'size', size)), `${lang} p.size ${size} ${animal} ${color} [${v}]: ${s}`);
    }
  }
  const s2 = I.t(lang, 'p.animals', { animal, color }, r9);
  ok(clean(s2) && s2.toLowerCase().includes(I.name(lang, 'animal', animal)), `${lang} p.animals ${animal} ${color}: ${s2}`);
}
for (const lang of I.langs) for (const spot of SPOTS) for (let n = 1; n <= 12; n++) {
  const raw = [].concat(I.raw(lang, 'p.count'));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, 'p.count', { n, spot, color: 'green' }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s), `${lang} p.count ${n} ${spot} [${v}]: ${s}`);
    if (lang === 'en') {
      const sing = I.name('en', 'spot', spot), plur = I.name('en', 'spot', spot, { n: 2 });
      ok(n === 1 ? s.includes(' ' + sing) : s.includes(plur), `en p.count n=${n} ${spot} plural ok: ${s}`);
      if (n === 1 && sing !== plur) ok(!s.includes(plur), `en p.count n=1 singular: ${s}`);
    }
  }
}
for (const lang of I.langs) for (const L of LETTERS) for (const k of ['p.letters', 'p.lower', 'p.initial'])
  ok(clean(I.t(lang, k, { letter: L }, r9)), `${lang} ${k} ${L}`);
for (const lang of I.langs) for (let a = 0; a <= 10; a++) for (const k of ['p.add', 'p.sub'])
  ok(clean(I.t(lang, k, { a: a + 3, b: a }, r9)), `${lang} ${k} ${a}`);

section('names for every kind × value');
const NAME_CASES = { color: COLORS, hue: COLORS, shape: SHAPES, size: ['big', 'small'], animal: ANIMALS, word: ANIMALS, part: PARTS,
  spot: SPOTS, parity: ['odd', 'even'] };
const DESIGN_VI = {
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam', purple: 'màu tím', pink: 'màu hồng' },
  hue: { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' },
  animal: { fish: 'con cá', crab: 'con cua', octopus: 'con bạch tuộc', starfish: 'con sao biển', jellyfish: 'con sứa',
    seahorse: 'con cá ngựa', whale: 'con cá voi', dolphin: 'con cá heo' },
  word: { fish: 'cá', crab: 'cua', octopus: 'bạch tuộc', starfish: 'sao biển', jellyfish: 'sứa', seahorse: 'cá ngựa', whale: 'cá voi', dolphin: 'cá heo' },
  size: { big: 'to', small: 'nhỏ' },
  part: { body: 'phần thân', tail: 'cái đuôi', fin: 'cái vây', sail: 'cánh buồm', hull: 'thân thuyền', flag: 'lá cờ', shell: 'cái mai', claws: 'đôi càng' },
  spot: { bubble: 'bong bóng', pearl: 'viên ngọc trai', shell: 'vỏ sò' } };
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const v of vals) for (const lang of I.langs) {
  const n = I.name(lang, kind, v);
  ok(clean(n) && n !== 'undefined', `${lang} name ${kind} ${v}: ${n}`);
  if (lang === 'vi' && kind !== 'word') ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
  if (kind === 'part') ok(I.NAME_TABLE[lang].part[v] != null, `${lang} part "${v}" has its own entry (not a fallback)`);
  const want = lang === 'vi' ? DESIGN_VI[kind] : null;
  if (want && want[v]) eq(n, want[v], `${lang} ${kind} ${v} = DESIGN §6`);
}
eq(I.name('vi', 'color', 'red', { bare: true }), 'đỏ', 'bare colour option');
eq(I.name('en', 'animal', 'fish', { size: 'big' }), 'big fish', 'en animal with size');
eq(I.name('vi', 'animal', 'fish', { size: 'big' }), 'con cá to', 'vi animal with size');
eq(I.name('en', 'spot', 'bubble', { n: 3 }), 'bubbles', 'bubbles');
eq(I.name('en', 'spot', 'starfish', { n: 3 }), 'starfish', 'starfish plural');
eq(I.name('vi', 'animal', 'animal_crab'), 'con cua', 'sprite id animal_crab');
for (let n = 0; n <= 20; n++) for (const lang of I.langs) ok(clean(I.name(lang, 'number', n)) && !/\d/.test(I.name(lang, 'number', n)), `${lang} number ${n} → a word`);
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
for (const L of LETTERS) { ok(clean(I.name('en', 'letter', L)), 'en letter ' + L); ok(clean(I.name('vi', 'letter', L)), 'vi letter ' + L); }
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi phonics B');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi phonics K');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('en', 'text', '4+1'), 'four plus one', 'text expr');
eq(I.name('vi', 'parity', 'even'), 'chẵn', 'vi even');
// initial-topic default words
for (const lang of I.langs) for (const e of SP.WORDS[lang]) {
  ok(ANIMALS.includes(e.animal) && e.initial === I.stripMarks(e.word).charAt(0).toUpperCase(), `${lang} word ${e.word} initial ${e.initial}`);
  ok(!/^con /.test(e.word), `${lang} initial word ${e.word} has no classifier`);
}
eq(I.initialOf('vi', 'octopus').first, 'B', 'vi bạch tuộc → B');
eq(I.initialOf('en', 'whale').first, 'W', 'en whale → W');
// phrases
eq(I.phrase('en', { nameKind: 'shape', nameValue: 'oval' }), 'the oval', 'phrase shape en');
eq(I.phrase('vi', { nameKind: 'animal', nameValue: 'crab' }), 'con cua', 'phrase animal vi');
eq(I.phrase('en', { nameKind: 'animal', nameValue: 'fish', size: 'small' }), 'the small fish', 'phrase sized animal');
eq(I.phrase('en', { nameKind: 'letter', nameValue: 'd' }), 'small d', 'phrase small letter');
eq(I.phrase('vi', { nameKind: 'letter', nameValue: 'D' }), 'chữ D', 'phrase letter vi');
eq(I.phrase('vi', 'number', 5), 'số năm', 'phrase number vi');
eq(I.phrase('en', { nameKind: 'part', nameValue: 'claws' }), 'the claws', 'phrase part en');

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
const MATCH_CASES = { color: COLORS, shape: SHAPES.filter(s => s !== 'rect'), size: ['big', 'small'], animal: ANIMALS, spot: SPOTS, parity: ['odd', 'even'] };
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
}
for (const [said, want] of [['ca ngua', 'seahorse'], ['cá voi', 'whale'], ['ca heo', 'dolphin'], ['bach tuoc', 'octopus'], ['sua', 'jellyfish'], ['cá', 'fish']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['sea horse', 'seahorse'], ['jelly fish', 'jellyfish'], ['a dolphin', 'dolphin'], ['crabby', 'crab']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['xanh'], ch('vi', 'color', COLORS)), null, '"xanh" alone is ambiguous');
eq(V.match(['màu xanh dương'], ch('vi', 'color', COLORS)), 'blue', 'vi "màu xanh dương"');
eq(V.match(['mau do'], ch('vi', 'color', COLORS)), 'red', 'vi no-diacritic "mau do"');
eq(V.match(['ba'], ch('vi', 'number', [3, 5, 12])), '3', '"ba" → 3');
eq(V.match(['muoi hai'], ch('vi', 'number', [3, 5, 12])), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], ch('en', 'number', [3, 5, 12])), '5', '"I think five"');
eq(V.match(['three bubbles'], ch('en', 'number', [2, 3, 4])), '3', 'en "three bubbles" → 3');
eq(V.match(['ba bong bóng'], ch('vi', 'number', [2, 3, 4])), '3', 'vi "ba bong bóng" → 3');
eq(V.match(['7'], ch('en', 'number', [6, 7, 8])), '7', 'digit transcript "7"');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
eq(V.match(['số chẵn'], ch('vi', 'parity', ['odd', 'even'])), 'even', '"số chẵn"');
eq(V.match(['bee'], ch('en', 'letter', ['A', 'B', 'C'])), 'B', '"bee" → B');
eq(V.match(['chữ tờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'T', '"chữ tờ" → T');
eq(V.match(['two plus three'], ch('en', 'sum', ['2+3', '1+1'])), '2+3', 'en sum spoken');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['crab'], [{ id: 'c', kind: 'animal', value: 'crab' }, { id: 'p', kind: 'animal', value: 'whale' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['banana'], colEn), null, 'unrelated → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('game lines: sayPick / sayPaint / sayWrong / needPaint / notThis / alive / count');
eq(I.sayPick('en', { color: 'blue' }, r0), 'Blue!', 'pick en');
eq(I.sayPick('vi', { color: 'blue' }, r0), 'Màu xanh dương!', 'pick vi');
eq(I.sayPick('en', {}, r0), 'Splish!', 'pick without colour');
eq(I.sayPaint('en', { color: 'blue', part: { role: 'part', nameKind: 'part', nameValue: 'tail' } }, r0), 'Blue tail — beautiful!', 'paint part en (DESIGN)');
eq(I.sayPaint('vi', { color: 'blue', part: { role: 'part', nameKind: 'part', nameValue: 'tail' } }, r0), 'Cái đuôi màu xanh dương, đẹp quá!', 'paint part vi');
eq(I.sayPaint('en', { color: 'red', role: 'animal', nameKind: 'animal', nameValue: 'crab' }, r0), 'The crab! Hooray!', 'paint animal en');
eq(I.sayPaint('vi', { color: 'red', role: 'animal', nameKind: 'animal', nameValue: 'crab' }, r0), 'Con cua! Hoan hô!', 'paint animal vi');
eq(I.sayPaint('en', { color: 'red', part: { role: 'animal', nameKind: 'animal', nameValue: 'fish', size: 'big' } }, r0), 'The big fish! Hooray!', 'paint sized animal');
eq(I.sayPaint('en', { color: 'yellow', part: { role: 'shape', nameKind: 'shape', nameValue: 'triangle' } }, r0), 'The triangle! Beautiful!', 'paint shape');
eq(I.sayPaint('en', { color: 'blue', count: { i: 3, n: 4 }, part: { role: 'spot', nameKind: 'spot', nameValue: 'bubble' } }, r0), 'Three!', 'count → count word');
eq(I.sayPaint('vi', { count: { i: 1, n: 2 } }, r0), 'Một!', 'vi count');
eq(I.sayPaint('en', { part: { role: 'label', nameKind: 'letter', nameValue: 'B', text: 'B' } }, r0), 'Letter B! Super!', 'paint letter');
eq(I.sayPaint('en', { part: { role: 'label', nameKind: 'letter', nameValue: 'b', text: 'b' } }, r0), 'Small b! Super!', 'paint small letter');
eq(I.sayPaint('vi', { part: { role: 'label', nameKind: 'letter', nameValue: 'b', text: 'b' } }, r0), 'Chữ b thường! Giỏi quá!', 'paint small letter vi');
eq(I.sayPaint('en', { topic: 'initial', part: { role: 'animal', nameKind: 'animal', nameValue: 'crab' } }, r0), 'C is for crab!', 'paint initial en');
eq(I.sayPaint('vi', { topic: 'initial', part: { role: 'animal', nameKind: 'animal', nameValue: 'octopus' } }, r0), 'Chữ B, bạch tuộc!', 'paint initial vi');
eq(I.sayPaint('en', { topic: 'oddeven', part: { role: 'label', nameKind: 'number', nameValue: 7 } }, r0), 'Seven is odd!', 'paint parity');
eq(I.sayPaint('en', { topic: 'add', params: { a: 2, b: 3 }, part: { role: 'label', nameKind: 'number', nameValue: 5 } }, r0), '2 + 3 is five!', 'paint sum');
eq(I.sayPaint('vi', { topic: 'sub', params: { a: 7, b: 3 }, part: { role: 'label', nameKind: 'number', nameValue: 4 } }, r0), '7 − 3 bằng bốn!', 'paint diff vi');
eq(I.sayPaint('en', { part: { role: 'label', nameKind: 'number', nameValue: 5 } }, r0), 'Five! Super!', 'paint number label');
eq(I.sayPaint('en', {}, r0), 'Beautiful!', 'paint unknown → neutral');
// wrong
const wr = (kind, got, want, extra) => Object.assign({ kind, got, want, streak: 1 }, extra || {});
eq(I.sayWrong('en', wr('color', { nameKind: 'color', nameValue: 'yellow' }, { nameKind: 'color', nameValue: 'blue' }), r0),
  'That’s yellow. Let’s find blue!', 'wrong colour en (DESIGN)');
eq(I.sayWrong('vi', wr('color', { nameKind: 'color', nameValue: 'yellow' }, { nameKind: 'color', nameValue: 'blue' }), r0),
  'Đây là màu vàng. Mình tìm màu xanh dương nhé!', 'wrong colour vi');
eq(I.sayWrong('en', wr('part', { nameKind: 'shape', nameValue: 'circle' }, { nameKind: 'shape', nameValue: 'triangle' }), r0),
  'That’s the circle. Where is the triangle?', 'wrong shape en (DESIGN)');
eq(I.sayWrong('vi', wr('part', { nameKind: 'shape', nameValue: 'circle' }, { nameKind: 'shape', nameValue: 'triangle' }), r0),
  'Đây là hình tròn. Hình tam giác ở đâu nhỉ?', 'wrong shape vi');
eq(I.sayWrong('en', wr('part', { nameKind: 'animal', nameValue: 'whale' }, { nameKind: 'animal', nameValue: 'crab' }), r0),
  'That’s the whale. Where is the crab?', 'wrong animal en');
eq(I.sayWrong('en', wr('part', { nameKind: 'animal', nameValue: 'fish', size: 'small' }, { nameKind: 'animal', nameValue: 'fish', size: 'big' }), r0),
  'That’s the small fish. Where is the big fish?', 'wrong size en');
eq(I.sayWrong('vi', wr('part', { nameKind: 'animal', nameValue: 'fish', size: 'small' }, { nameKind: 'animal', nameValue: 'fish', size: 'big' }), r0),
  'Đây là con cá nhỏ. Con cá to ở đâu nhỉ?', 'wrong size vi');
eq(I.sayWrong('en', wr('part', { nameKind: 'size', nameValue: 'small' }, { nameKind: 'size', nameValue: 'big' }), r0),
  'That’s the small one. Where is the big one?', 'wrong size (size kind) en');
eq(I.sayWrong('en', wr('part', { nameKind: 'animal', nameValue: 'fish' }, { nameKind: 'animal', nameValue: 'fish' }), r0),
  'Let’s look again!', 'same animal without sizes → generic');
eq(I.sayWrong('en', wr('part', { nameKind: 'letter', nameValue: 'D' }, { nameKind: 'letter', nameValue: 'B' }), r0),
  'That’s letter D. Where is letter B?', 'wrong letter en');
eq(I.sayWrong('en', wr('part', { nameKind: 'letter', nameValue: 'd' }, { nameKind: 'letter', nameValue: 'b' }), r0),
  'That’s small d. Where is small b?', 'wrong lower en');
const mathEn = I.sayWrong('en', wr('part', { nameKind: 'number', nameValue: 6 }, { nameKind: 'number', nameValue: 5 }, { topic: 'add' }), r0);
eq(mathEn, 'That’s number six. Let’s count again!', 'wrong add: no answer given');
ok(!/five|\b5\b/.test(mathEn), 'maths wrong line never names the right answer');
const mathVi = I.sayWrong('vi', wr('part', { nameKind: 'number', nameValue: 6 }, { nameKind: 'number', nameValue: 5 }, { topic: 'sub' }), r0);
ok(!/năm|\b5\b/.test(mathVi) && /sáu/.test(mathVi), 'vi maths wrong line: ' + mathVi);
eq(I.sayWrong('en', wr('part', { nameKind: 'number', nameValue: 4 }, { nameKind: 'parity', nameValue: 'odd' }, { topic: 'oddeven' }), r0),
  'Four is even! Let’s look for another one!', 'wrong parity en');
eq(I.sayWrong('en', wr('part', { nameKind: 'animal', nameValue: 'whale' }, { nameKind: 'letter', nameValue: 'C' }, { topic: 'initial' }), r0),
  'Whale starts with W! Let’s look again!', 'wrong initial en');
eq(I.sayWrong('vi', wr('part', { nameKind: 'animal', nameValue: 'jellyfish' }, { nameKind: 'letter', nameValue: 'C' }, { topic: 'initial' }), r0),
  'Sứa bắt đầu bằng chữ S! Mình tìm lại nhé!', 'wrong initial vi');
eq(I.sayWrong('en', {}, r0), 'Let’s look again!', 'empty event → generic');
eq(I.sayNeedPaint('en', { color: 'blue' }, r0), 'First pick the blue paint!', 'needPaint en (DESIGN)');
eq(I.sayNeedPaint('vi', { color: 'blue' }, r0), 'Bé chọn màu xanh dương trước nhé!', 'needPaint vi');
eq(I.sayNeedPaint('en', {}, r0), 'First pick a paint!', 'needPaint without colour');
eq(I.sayNotThis('en', { target: { nameKind: 'part', nameValue: 'tail' } }, r0), 'Paint the shining tail!', 'notThis en');
eq(I.sayNotThis('en', { partId: 'x' }, r0), 'Paint the shining part!', 'notThis without a target');
for (const a of ALIVE) for (const lang of I.langs) ok(clean(I.sayAlive(lang, a, r0)), `${lang} alive ${a}`);
eq(I.sayAlive('en', 'zzz', r0), I.t('en', 'alive.swim', null, r0), 'unknown alive kind → swim');
for (let i = 0; i <= 20; i++) { eq(I.sayCount('en', i), I.t('en', 'count.' + i), 'sayCount ' + i); ok(clean(I.sayCount('vi', i)), 'vi count ' + i); }
eq(I.sayCount('en', 3), 'Three!', 'Three!');
eq(I.sayCount('vi', 15), 'Mười lăm!', 'Mười lăm!');
eq(I.sayCount('en', 25), '25!', 'beyond 20 → digits');
// sweep: every role × value × colour, every wrong pair — clean and positive
let sweep = 0;
const THINGS = [].concat(COLORS.map(v => ({ nameKind: 'color', nameValue: v })), SHAPES.map(v => ({ nameKind: 'shape', nameValue: v })),
  ANIMALS.map(v => ({ nameKind: 'animal', nameValue: v })), ANIMALS.map(v => ({ nameKind: 'animal', nameValue: v, size: 'big' })),
  PARTS.map(v => ({ nameKind: 'part', nameValue: v })), SPOTS.map(v => ({ nameKind: 'spot', nameValue: v })),
  LETTERS.map(v => ({ nameKind: 'letter', nameValue: v })), LETTERS.map(v => ({ nameKind: 'letter', nameValue: v.toLowerCase() })),
  Array.from({ length: 21 }, (_, n) => ({ nameKind: 'number', nameValue: n })));
const ROLE = { part: 'part', shape: 'shape', animal: 'animal', spot: 'spot', letter: 'label', number: 'label' };
for (const lang of I.langs) for (const th of THINGS) {
  for (const topic of [null, 'initial', 'oddeven', 'add']) {
    const s = I.sayPaint(lang, { color: 'green', topic, params: { a: 1, b: 2 }, part: Object.assign({ role: ROLE[th.nameKind] }, th) }, r9);
    sweep++; if (!clean(s) || !positive(s)) ok(false, `${lang} paint ${JSON.stringify(th)} ${topic}: ${s}`);
  }
  for (const w of THINGS.filter((x, i) => i % 7 === 0)) for (const topic of [null, 'add', 'oddeven', 'initial']) {
    const s = I.sayWrong(lang, { kind: th.nameKind === 'color' ? 'color' : 'part', got: th, want: w, topic }, r9);
    sweep++; if (!clean(s) || !positive(s)) ok(false, `${lang} wrong ${JSON.stringify(th)} want ${JSON.stringify(w)} ${topic}: ${s}`);
  }
  ok(clean(I.phrase(lang, th)), `${lang} phrase ${JSON.stringify(th)}: ${I.phrase(lang, th)}`);
}
ok(sweep > 5000, `swept ${sweep} lines`);
for (const lang of I.langs) for (const ev of [null, undefined, 5, 'x', [], { part: 7 }, { part: { nameKind: 'zzz', nameValue: {} } }, { want: 'x' }, { count: { i: 'x' } }]) {
  let out;
  try { out = [I.sayPick(lang, ev), I.sayPaint(lang, ev), I.sayWrong(lang, ev), I.sayNeedPaint(lang, ev), I.sayNotThis(lang, ev)]; } catch (e) { out = null; }
  ok(out && out.every(clean), `${lang} garbage ${JSON.stringify(ev)} → ${JSON.stringify(out)}`);
}

section('talk');
eq(I.t('en', 'talk.colors', { color: 'red' }), 'Which one is red?', 'talk.colors en');
eq(I.t('vi', 'talk.colors', { color: 'red' }), 'Cái nào màu đỏ nhỉ?', 'talk.colors vi');
eq(I.t('en', 'talk.colors', {}), 'What colour is this?', 'talk.colors without colour');
eq(I.t('vi', 'talk.shapes', { shape: 'circle' }), 'Hình tròn ở đâu nhỉ?', 'talk.shapes vi');
eq(I.t('en', 'talk.size', { size: 'big', animal: 'fish' }), 'Which fish is big?', 'talk.size en');
eq(I.t('vi', 'talk.size', { size: 'small', animal: 'crab' }), 'Con cua nào nhỏ nhỉ?', 'talk.size vi');
eq(I.t('en', 'talk.size', { size: 'small' }), 'Which one is small?', 'talk.size without animal');
eq(I.t('en', 'talk.animals', { animal: 'whale' }), 'Where is the whale?', 'talk.animals en');
eq(I.t('en', 'talk.count', { n: 1, spot: 'pearl' }), 'How many pearls are there?', 'talk.count always plural');
eq(I.t('vi', 'talk.count', { spot: 'pearl' }), 'Có mấy viên ngọc trai nào?', 'talk.count vi');
eq(I.t('en', 'talk.count', { n: 4 }), 'How many dots are there?', 'talk.count never says the answer');
eq(I.t('en', 'talk.letters', { letter: 'M' }), 'Where is the letter M?', 'talk.letters');
eq(I.t('en', 'talk.lower', { letter: 'G', small: 'g' }), 'Where is small g? It goes with big G!', 'talk.lower');
eq(I.t('vi', 'talk.initial', { animal: 'octopus', word: 'bạch tuộc', letter: 'B' }), 'Bạch tuộc bắt đầu bằng chữ gì nhỉ?', 'talk.initial vi (no answer)');
eq(I.t('en', 'talk.initial', { animal: 'whale', letter: 'W' }), 'Which letter does whale start with?', 'talk.initial en from animal');
eq(I.t('en', 'talk.add', { a: 2, b: 3 }), 'What is 2 + 3?', 'talk.add');
eq(I.t('en', 'talk.add', {}), 'What is the answer?', 'talk.add without a/b');
eq(I.t('en', 'talk.oddeven', { parity: 'odd' }), 'Which number is odd?', 'talk.oddeven');
eq(I.t('vi', 'talk.oddeven', { parity: 'even' }), 'Số nào là số chẵn nhỉ?', 'talk.oddeven vi');
// content's Talk choices are {id, thing:{kind, …}, value}
const blob = { id: 'c0', thing: { kind: 'blob', color: 'blue' }, value: 'blue' };
ok(I.choiceWords('vi', blob).includes('xanh duong'), 'choiceWords blob → colour forms');
eq(I.talkWrong('en', blob), 'It is blue! Good try!', 'talkWrong(choice)');
eq(I.talkWrong('vi', { id: 'c1', thing: { kind: 'number', n: 7 }, value: 7 }), 'Là số bảy đó! Bé cố gắng lắm!', 'talkWrong number choice');
eq(I.talkWrong('en', { thing: { kind: 'letter', text: 'g' } }), 'It is small letter g! Good try!', 'talkWrong small letter choice');
eq(V.match(['the whale'], [{ id: 'a', words: I.choiceWords('en', { thing: { kind: 'animal', animal: 'whale' } }) },
  { id: 'b', words: I.choiceWords('en', { thing: { kind: 'animal', animal: 'crab' } }) }]), 'a', 'choiceWords animal matched');
eq(I.talkWrong('en', 'color', 'red'), 'It is red! Good try!', 'talkWrong colour');
eq(I.talkWrong('vi', 'color', 'red'), 'Là màu đỏ đó! Bé cố gắng lắm!', 'talkWrong colour vi');
eq(I.talkWrong('en', 'shape', 'oval'), 'It is an oval! Good try!', 'talkWrong an oval');
eq(I.talkWrong('en', 'animal', 'crab'), 'It is the crab! Good try!', 'talkWrong animal');
eq(I.talkWrong('en', 'size', 'big'), 'It is the big one! Good try!', 'talkWrong size');
eq(I.talkWrong('vi', 'number', 7), 'Là số bảy đó! Bé cố gắng lắm!', 'talkWrong number vi');
eq(I.talkWrong('en', 'letter', 'b'), 'It is small letter b! Good try!', 'talkWrong small letter');
eq(I.talkWrong('en', { kind: 'parity', value: 'odd' }), 'It is odd! Good try!', 'talkWrong object arg');
eq(I.talkWrong('en', 'color', null), 'Good try! Let’s keep painting!', 'talkWrong without value');
for (const t of TOPICS) for (const lang of I.langs) ok(clean(I.t(lang, 'talk.' + t, { animal: 'crab', spot: 'bubble', size: 'big', n: 4, a: 1, b: 2, letter: 'B', color: 'red', shape: 'star', parity: 'odd' })), `${lang} talk.${t}`);
// Talk questions never contain their answer
for (const lang of I.langs) for (const k of ['talk.count', 'talk.countAny', 'talk.initial', 'talk.add', 'talk.sub'])
  ok(!/\{(n|letter|ans|answer|num)\}/.test(I.raw(lang, k)), `${lang} ${k} does not speak the answer`);

// the real content.js (when the sea version has landed): every prompt / Talk key + params it produces renders clean
if (contentSB) {
  section('content.js: every promptKey / Talk key it produces');
  const C = contentSB.SP.Content, RNG = contentSB.SP.RNG;
  let n = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of TOPICS) for (const lang of I.langs) for (let seed = 1; seed <= 6; seed++) {
    let rd = null, tk = null;
    try { rd = C.makeRound(topic, { age, lang, rng: new RNG(seed), roundIndex: seed % 4, surprise: null }); } catch (e) { /* topic not for this age */ }
    try { tk = C.makeTalk(topic, { age, lang, rng: new RNG(seed) }); } catch (e) { /* ignore */ }
    if (rd && rd.steps) for (const st of rd.steps) {
      n++;
      ok(I.has(lang, st.promptKey), `${lang} content prompt key ${st.promptKey} exists`);
      const s = I.t(lang, st.promptKey, st.params || {}, r9);
      ok(clean(s) && positive(s) && s !== I.t(lang, 'p.any', null, r9) || !I.PROMPTS[st.promptKey], `${lang} ${topic} age ${age} ${st.promptKey} ${JSON.stringify(st.params)}: ${s}`);
      if (st.promptKey === 'p.count') ok(SPOTS.includes(st.params.spot), `content spot ${st.params.spot} is a known spot`);
      if (st.promptKey === 'p.colors') ok(I.has(lang, 'p.tapPart') && clean(I.t(lang, 'p.tapPart', st.params || {}, r0)), `${lang} p.tapPart for ${JSON.stringify(st.params)}`);
    }
    if (rd && rd.pic && rd.pic.parts) for (const pt of rd.pic.parts) if (pt.nameKind) {
      const nm = I.name(lang, pt.nameKind, pt.nameValue);
      ok(clean(nm) && (pt.nameKind !== 'part' || I.NAME_TABLE[lang].part[pt.nameValue] != null), `${lang} part name ${pt.nameKind}/${pt.nameValue}: ${nm}`);
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
      ok(!/\{/.test(q) && (topic !== 'count' || !q.includes(String(tk.params.n))), `${lang} talk ${topic} never says the answer: ${q}`);
    }
  }
  ok(n > 50, `content checked: ${n} steps / talks`);
}

section('speech text: letters, maths, "Nini"');
eq(I.speech('en', 'That’s letter D. Where is letter B?'), 'That’s letter dee. Where is letter bee?', 'en letter names');
eq(I.speech('en', 'C is for crab!'), 'see is for crab!', 'en "C is for"');
eq(I.speech('en', 'Whale starts with W! Let’s look again!'), 'Whale starts with double you! Let’s look again!', 'en starts with');
eq(I.speech('en', 'Big B has a little friend. Paint small b!'), 'Big bee has a little friend. Paint small bee!', 'en big/small letters');
eq(I.speech('en', 'What is 2 + 3? Paint the answer!'), 'What is 2 plus 3? Paint the answer!', 'en plus');
eq(I.speech('vi', 'Bé ơi, 7 − 2 bằng mấy?'), 'Bé ơi, 7 trừ 2 bằng mấy?', 'vi minus');
eq(I.speech('vi', 'Bé ơi, tô chữ B nhé!'), 'Bé ơi, tô chữ bờ nhé!', 'vi phonics');
eq(I.speech('en', 'Hi! I am Nini.'), 'Hi! I am Nini.', 'en "Nini" as written');
eq(I.speech('vi', 'Mình là rùa Nini. Rùa Nini nè!'), 'Mình là rùa Ni Ni. Rùa Ni Ni nè!', 'vi "Nini" → "Ni Ni"');
eq(I.speech('en', 'Blue tail — beautiful!'), 'Blue tail, beautiful!', 'dash → comma pause');
eq(I.speech('en', 'Paint the big fish red!'), 'Paint the big fish red!', '"big fish" is not a letter');
eq(V.spoken('vi', 'Chào bé! Mình là Nini.'), 'Chào bé! Mình là Ni Ni.', 'Voice.spoken uses I18N.speech');

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
  sb4.SP = {};
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
  sb7.SP = {};
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
  sb5.SP = {};
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
  sb6.SP = {};
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
ok(sb.SP.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into SP.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof SP.Input.attach === 'function' && typeof SP.Input.kidProof === 'function' && typeof SP.Input.holdButton === 'function',
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
  sbx.SP = {};
  env.SP = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.SP.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Nini: rate 0.9, pitch 1.2');
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
  // vi "Nini" is spoken "Ni Ni"; the bubble text (onStart, log) keeps "Nini"
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là Nini. Nini giúp bé nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là Ni Ni. Ni Ni giúp bé nhé!', 'vi utterance says "Ni Ni"');
  eq(startText, 'Mình là Nini. Nini giúp bé nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animals', { animal: 'crab', color: 'red' }, { lang: 'vi' });
  ok(/^(Bé ơi, tô con cua màu đỏ nhé!|Bé tô con cua màu đỏ được không nào\?|Con cua ở đâu nhỉ\? Bé tô màu đỏ nhé!)$/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  E3.SP.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['crab', 'whale', 'fish']), timeoutMs: 2000 });
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
