#!/usr/bin/env node
// Momo's Toy Train — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/owl-toy-train:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (content.js is not loaded).
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
  return sb.TT;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
const NEG_EN = /\b(no|not|wrong|bad|fail|failed|incorrect|oh no|mistake|oops|fall|fell|crash|broke|broken)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|dở|tệ|hỏng|không đúng|chưa đúng|trật|sai rồi|đổ|ngã|rơi mất)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
const r0 = () => 0, r9 = () => 0.99;
function clean(s) {
  return typeof s === 'string' && s.trim().length > 0 && s.indexOf('{') < 0 && s.indexOf('}') < 0 &&
    !/undefined|null|NaN|\[object/.test(s) && !/\s[!?.,]/.test(s) && !/^[!?.,]/.test(s) && !/_/.test(s) && !/\s{2}/.test(s);
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');

// ------------------------------------------------------------------ DESIGN value lists
const ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'frog', 'fish', 'bird', 'squirrel', 'butterfly', 'bunny', 'mouse', 'fox'];
const HOMES = { barn: ['cow', 'pig', 'sheep'], pond: ['duck', 'frog', 'fish'], tree: ['bird', 'squirrel', 'butterfly'], burrow: ['bunny', 'mouse', 'fox'] };
const HOME_IDS = Object.keys(HOMES);
const CARGO = ['teddy', 'ball', 'duckie', 'rocket', 'boat', 'drum'];
const TOYS = ['cube', 'ball', 'cone', 'cylinder'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const TOPICS = ['colors', 'shapes', 'size', 'homes', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LABEL_TYPES = ['color', 'shape', 'size', 'home', 'number', 'letter', 'text', 'parity'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.TT = { debug: { voiceLog: [] } };
let TT;
try { TT = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = TT.I18N, V = TT.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js'])
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(JS, f), 'utf8')), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.HOMES), JSON.stringify(HOMES), 'I18N.HOMES = DESIGN homes');
eq(JSON.stringify(I.CARGO), JSON.stringify(CARGO), 'I18N.CARGO = DESIGN cargo');
eq(JSON.stringify(I.TOYS), JSON.stringify(TOYS), 'I18N.TOYS = DESIGN toys');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapMomo', 'tapHint', 'dragHint', 'whistle', 'quieter', 'louder', 'skip', 'langName.en', 'langName.vi'];
// every data-i18n / T('ui.…') the sister band game's index.html, ui.js and main.js use must still exist
const BAND = path.join(ROOT, '..', 'frog-rainy-band', 'game');
const usedUi = new Set();
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
  let src = ''; try { src = fs.readFileSync(path.join(BAND, f), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="(ui\.[\w.]+)"/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/T\((?:lang, )?'(ui\.[\w.]+)'/g)) usedUi.add(m[1]);
}
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {      // and this game's own files (the lead's rewrite)
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, 'game', f), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="(ui\.[\w.]+)"/g)) usedUi.add(m[1]);
}
ok(usedUi.size >= 10, 'found the ui keys index.html / ui.js / main.js use (' + usedUi.size + ')');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.size', 'p.homes', 'p.count', 'p.count2', 'p.letters', 'p.lower', 'p.initial',
  'p.add', 'p.sub', 'p.oddeven'];
const GRAB_KEYS = ['block', 'shape', 'size', 'animal', 'cargo', 'letter', 'number', 'text'].map(k => 'say.grab.' + k).concat(['say.grab.any']);
const CORRECT_KEYS = LABEL_TYPES.concat(['lower', 'initial']).map(k => 'say.correct.' + k);
const LINE_KEYS = ['deal', 'full', 'wrong', 'wrong.got', 'wrong.boing', 'wrong.any', 'wrong.math', 'wrong.parity', 'wrong.initial',
  'wrong.lower', 'miss', 'dragHint', 'loaded', 'whistleHint', 'whistleAuto', 'depart', 'toot', 'hint', 'idle', 'praise', 'great',
  'party', 'carDone', 'say.carDone.count', 'surprise.hitch', 'hitch.tap', 'surprise.balloon', 'balloon.tap', 'session.done', 'p.any'];
const TALK_KEYS = ['talk.intro', 'talk.right', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.home', 'talk.wrong.size',
  'talk.wrong.letter', 'talk.wrong.small', 'talk.wrong.number', 'talk.homesAny', 'talk.countAny'].concat(TOPICS.map(k => 'talk.' + k));
const COUNT_KEYS = Array.from({ length: 20 }, (_, i) => 'count.' + (i + 1));
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k)).concat([...usedUi])
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(PROMPT_KEYS).concat(GRAB_KEYS).concat(CORRECT_KEYS).concat(LINE_KEYS).concat(TALK_KEYS).concat(COUNT_KEYS);
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(enKeys.join('|'), viKeys.join('|'), 'en and vi have identical key sets');
for (const k of enKeys) eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `same {params} in en/vi for ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  ok(raw.every(s => typeof s === 'string' && s.trim().length > 0), `${lang} ${k}: non-empty strings`);
}
// no band-only keys left
for (const k of enKeys) ok(!/drum|song|snail|shower|raindrop|boom/i.test(k), `no band-only key: ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(!/\bBop\b|Bốp|Lulu|\bPip\b|\bBim\b/.test(s), `${lang} ${k}: no older helper names`);
// instructions have 3 wordings
for (const lang of I.langs) for (const k of PROMPT_KEYS.concat(['loaded', 'whistleHint', 'whistleAuto', 'depart', 'deal', 'full', 'miss', 'dragHint', 'p.any']))
  ok([].concat(I.raw(lang, k)).length >= 3, `${lang} ${k}: 3 wordings`);
for (const lang of I.langs) for (const k of TOPICS.map(t => 'topic.' + t)) ok(!Array.isArray(I.raw(lang, k)), `${lang} ${k} is one banner string`);

section('titles, Momo, Vietnamese warmth');
eq(I.t('en', 'ui.title'), 'Momo’s Toy Train', 'en title');
eq(I.t('en', 'ui.logo1') + ' ' + I.t('en', 'ui.logo2'), 'Momo’s Toy Train', 'en logo lines');
eq(I.t('vi', 'ui.logo1'), 'Cú Momo', 'vi logo line 1');
eq(I.t('vi', 'ui.logo2'), 'Tàu Đồ Chơi', 'vi logo line 2');
ok(/Cú Momo/.test(I.t('vi', 'ui.title')), 'vi title "Cú Momo"');
ok(/Momo/.test(I.t('en', 'ui.voice')) && /Momo/.test(I.t('vi', 'ui.voice')), 'voice setting names Momo');
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /Bé ơi/.test(s)) || k === 'p.count2', `vi ${k}: a warm "Bé ơi" wording`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /nhé|nào/.test(s)), `vi ${k}: "nhé / nào"`);
for (const k of I.keys('vi')) if (!/^ui\.langName/.test(k))
  ok(JSON.stringify(I.raw('vi', k)) !== JSON.stringify(I.raw('en', k)), `vi ${k} is translated`);

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  for (const s of [].concat(I.raw(lang, k))) ok(positive(s), `${lang} ${k} is positive: ${s}`);
}

section('every string renders, no "{" left');
const SAMPLE = { n: 3, a: 2, b: 4, cargo: 'teddy', stars: 7, color: 'red', shape: 'star', size: 'big', animal: 'cow',
  home: 'barn', letter: 'B', lower: 'b', word: 'cow', first: 'C', expr: '2+3', ans: 'five', num: 'seven', parity: 'odd',
  it: 'red block', item: 'the red block', want: 'the red car', got: 'the blue car', answer: 'red', where: 'in the barn' };
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
eq(I.t('en', 'ui.welcome'), 'Hi Mai! I am Momo. All aboard the toy train!', 'welcome with the child name');
ok(/Mai/.test(I.t('vi', 'ui.welcome')), 'vi welcome with the child name');
I.setChild('');
eq(I.t('en', 'ui.welcome'), 'Hi! I am Momo. All aboard the toy train!', 'welcome without a name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé! Mình là Momo. Mình cùng lên tàu đồ chơi nhé!', 'vi welcome without a name');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'ui.chapter');
eq(I.t('vi', 'session.done', { stars: 12 }, r0), 'Chuyến tàu vui quá! 12 ngôi sao!', 'vi session.done');
eq(I.t('en', 'weather.0'), 'Good morning, train!', 'weather.0');
eq(I.t('en', 'weather.3'), 'Good night, stars! Lights on!', 'weather.3');
eq(I.t('en', 'surprise.hitch', null, r0), 'Look! Bunny wants a ride!', 'surprise.hitch');
eq(I.t('en', 'surprise.balloon', null, r0), 'A balloon on our train!', 'surprise.balloon');
eq(I.t('en', 'loaded', null, r0), 'All aboard! Tap the whistle!', 'loaded');
eq(I.t('vi', 'loaded', null, r0), 'Lên tàu nào! Bé bấm còi đi!', 'vi loaded');
eq(I.t('en', 'whistleAuto', null, r0), 'Toot toot! Off we go!', 'whistleAuto');
eq(I.t('en', 'depart', null, r0), 'Choo choo! Bye-bye!', 'depart');
eq(I.t('en', 'deal', null, r0), 'Here comes the train!', 'deal');
eq(I.t('en', 'full', null, r0), 'This car is full! Try another one.', 'full');
eq(I.t('en', 'p.nonsense', null, r0), I.t('en', 'p.any', null, r0), 'unknown prompt key → p.any');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key → the key');

section('prompts: every param filled, plurals');
eq(I.t('en', 'p.colors', null, r0), 'Put each toy in the car of the same colour!', 'p.colors en');
eq(I.t('vi', 'p.colors', null, r0), 'Bé ơi, xếp đồ chơi vào toa cùng màu nhé!', 'p.colors vi');
eq(I.t('en', 'p.shapes', null, r0), 'Put each shape in the car with the same shape!', 'p.shapes en');
eq(I.t('en', 'p.size', null, r0), 'Big toys in the big car, small toys in the small car!', 'p.size en');
eq(I.t('en', 'p.homes', null, r0), 'Who lives where? Take each animal to its home car!', 'p.homes en');
eq(I.t('en', 'p.count', { n: 3, cargo: 'teddy' }, r0), 'Load 3 teddy bears into the car!', 'p.count en plural');
eq(I.t('en', 'p.count', { n: 1, cargo: 'teddy' }, r0), 'Load 1 teddy bear into the car!', 'p.count en singular');
eq(I.t('en', 'p.count', { n: 2, cargo: 'duckie' }, r0), 'Load 2 rubber ducks into the car!', 'p.count rubber ducks');
eq(I.t('vi', 'p.count', { n: 3, cargo: 'teddy' }, r0), 'Bé ơi, chất 3 con gấu bông lên toa nhé!', 'p.count vi classifier');
eq(I.t('vi', 'p.count', { n: 2, cargo: 'boat' }, r0), 'Bé ơi, chất 2 chiếc thuyền lên toa nhé!', 'p.count vi boat');
eq(I.t('en', 'p.count2', { a: 2, b: 3, cargo: 'ball' }, r0), 'Put 2 balls in one car and 3 in the other!', 'p.count2 en');
eq(I.t('en', 'p.count2', { a: 1, b: 3, cargo: 'ball' }, r0), 'Put 1 ball in one car and 3 in the other!', 'p.count2 en singular a');
eq(I.t('vi', 'p.count2', { a: 2, b: 3, cargo: 'ball' }, r0), 'Bé xếp 2 quả bóng vào một toa, 3 vào toa kia nhé!', 'p.count2 vi');
eq(I.t('en', 'p.count', { n: 3 }, r0), 'Load 3 toys into the car!', 'p.count without cargo → toys');
eq(I.t('en', 'p.count', { cargo: 'teddy' }, r0), I.t('en', 'p.any', null, r0), 'p.count without n → p.any');
eq(I.t('en', 'p.count2', { cargo: 'teddy', n: 4 }, r0), 'Load 4 teddy bears into the car!', 'p.count2 without a/b → p.count');
for (const lang of I.langs) for (const k of PROMPT_KEYS) for (const c of CARGO) for (let n = 1; n <= 12; n++) {
  const raw = [].concat(I.raw(lang, k));
  for (let v = 0; v < raw.length; v++) {
    const s = I.t(lang, k, { n, a: n, b: n + 1, cargo: c }, () => (v + 0.5) / raw.length);
    ok(clean(s) && positive(s), `${lang} ${k} n=${n} ${c} [${v}]: ${s}`);
    if (lang === 'en' && /\{cargo\}/.test(raw[v])) {
      const sing = I.name('en', 'cargo', c), plur = I.name('en', 'cargo', c, { n: 2 });
      ok(n === 1 ? s.includes(' ' + sing) && !s.includes(plur) : s.includes(plur), `en ${k} n=${n} ${c} plural ok: ${s}`);
    }
  }
}

section('names for every value');
const NAME_CASES = { color: COLORS, shape: SHAPES, size: ['big', 'small'], animal: ANIMALS, home: HOME_IDS, cargo: CARGO, toy: TOYS,
  parity: ['odd', 'even'] };
const DESIGN_VI = { animal: { cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', frog: 'con ếch', fish: 'con cá',
  bird: 'con chim', squirrel: 'con sóc', butterfly: 'con bướm', bunny: 'con thỏ', mouse: 'con chuột', fox: 'con cáo' },
  home: { barn: 'chuồng', pond: 'cái ao', tree: 'cái cây', burrow: 'cái hang' },
  cargo: { teddy: 'gấu bông', ball: 'quả bóng', duckie: 'vịt cao su', rocket: 'tên lửa đồ chơi', boat: 'thuyền đồ chơi', drum: 'cái trống' },
  toy: { cube: 'khối gỗ', ball: 'quả bóng', cone: 'khối nón', cylinder: 'khối trụ' } };
const DESIGN_EN = { home: { barn: 'the barn', pond: 'the pond', tree: 'the tree', burrow: 'the burrow' },
  cargo: { teddy: 'teddy bear', ball: 'ball', duckie: 'rubber duck', rocket: 'toy rocket', boat: 'toy boat', drum: 'toy drum' },
  toy: { cube: 'block', ball: 'ball', cone: 'cone', cylinder: 'tube' } };
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const v of vals) for (const lang of I.langs) {
  const n = I.name(lang, kind, v);
  ok(clean(n), `${lang} name ${kind} ${v}: ${n}`);
  if (lang === 'vi') ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
  const want = (lang === 'vi' ? DESIGN_VI : DESIGN_EN)[kind];
  if (want) eq(n, want[v], `${lang} ${kind} ${v} = DESIGN §6`);
}
for (const c of CARGO) {
  ok(I.name('en', 'cargo', c, { n: 3 }) !== I.name('en', 'cargo', c), `en cargo ${c} has a plural`);
  eq(I.name('en', 'cargo', c, { n: 1 }), I.name('en', 'cargo', c), `en cargo ${c} n=1 singular`);
  ok(/^(con|quả|chiếc|cái) /.test(I.name('vi', 'cargo', c, { n: 3 })), `vi counted cargo ${c} has a classifier: ${I.name('vi', 'cargo', c, { n: 3 })}`);
}
eq(I.name('en', 'cargo', 'teddy', { n: 3 }), 'teddy bears', 'teddy bears');
eq(I.name('en', 'cargo', 'cargo_rocket'), 'toy rocket', 'sprite id cargo_rocket');
eq(I.name('vi', 'animal', 'animal_fox'), 'con cáo', 'sprite id animal_fox');
for (let n = 0; n <= 20; n++) for (const lang of I.langs) ok(clean(I.name(lang, 'number', n)) && !/\d/.test(I.name(lang, 'number', n)), `${lang} number ${n} → a word`);
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
for (const L of LETTERS) { ok(clean(I.name('en', 'letter', L)), 'en letter ' + L); ok(clean(I.name('vi', 'letter', L)), 'vi letter ' + L); }
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi phonics B');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('en', 'text', '4+1'), 'four plus one', 'text expr');
eq(I.name('vi', 'parity', 'even'), 'chẵn', 'vi even');
eq(I.name('en', 'word', 'cow'), 'cow', 'en word cow');
eq(I.name('vi', 'word', 'fox'), 'cáo', 'vi word fox (bare)');
for (const a of ANIMALS) for (const lang of I.langs) ok(clean(I.name(lang, 'word', a)), `${lang} word ${a}`);
for (const [h, as] of Object.entries(HOMES)) for (const a of as) eq(I.homeOf(a), h, `${a} lives in ${h}`);
for (const a of ANIMALS) eq(I.hasSound(a), !!I.sound('en', a), `hasSound(${a}) consistent`);
eq(I.sound('vi', 'cow'), 'ò ò', 'vi cow sound');
eq(I.sound('en', 'fish'), '', 'fish is quiet');
// initial-topic default words: Vietnamese avoids ch/th/nh/ph/kh/gi/ng/tr
for (const e of TT.WORDS.vi) ok(!/^(ch|th|nh|ph|kh|gi|ng|tr)/i.test(e.word), `vi initial word ${e.word} avoids digraphs`);
for (const lang of I.langs) for (const e of TT.WORDS[lang]) ok(ANIMALS.includes(e.animal) && e.initial === I.stripMarks(e.word).charAt(0).toUpperCase() ||
  (lang === 'vi' && e.initial), `${lang} word ${e.word} initial ${e.initial}`);

section('words() — accepted spoken forms, matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const lang of I.langs) {
  const set = ch(lang, kind, vals);
  for (const v of vals) {
    const ws = I.words(lang, kind, v);
    ok(ws.length >= 2 && ws.every(w => w === w.toLowerCase()), `${lang} words ${kind} ${v}: lower-case forms (${ws.length})`);
    ok(ws.includes(I.name(lang, kind, v).toLowerCase()), `${lang} words ${kind} ${v} include the name`);
    ok(ws.includes(I.stripMarks(I.name(lang, kind, v)).toLowerCase()), `${lang} words ${kind} ${v} include the no-diacritic name`);
    if (kind === 'toy' || kind === 'cargo') continue;   // ball is both a toy and a cargo: never asked together
    eq(V.match([I.name(lang, kind, v)], set), String(v), `${lang} "${I.name(lang, kind, v)}" → ${kind} ${v}`);
    eq(V.match([I.stripMarks(I.name(lang, kind, v))], set), String(v), `${lang} no diacritics "${I.stripMarks(I.name(lang, kind, v))}" → ${v}`);
    for (const w of ws) if (!w.startsWith('=')) eq(V.match([w], set), String(v), `${lang} ${kind} accepted form "${w}" → ${v}`);
  }
}
for (const lang of I.langs) {
  const cs = ch(lang, 'cargo', CARGO);
  for (const c of CARGO) for (const w of I.words(lang, 'cargo', c)) eq(V.match([w], cs), c, `${lang} cargo form "${w}" → ${c}`);
  const ts = ch(lang, 'toy', TOYS);
  for (const t of TOYS) for (const w of I.words(lang, 'toy', t)) eq(V.match([w], ts), t, `${lang} toy form "${w}" → ${t}`);
}
for (let n = 0; n <= 20; n++) for (const lang of I.langs) {
  const ws = I.words(lang, 'number', n);
  ok(ws.includes(String(n)), `${lang} number ${n} accepts the digit`);
}
// Talk time for homes: "Where does the cow live?" + home picture choices
const homesEn = ch('en', 'home', HOME_IDS), homesVi = ch('vi', 'home', HOME_IDS);
for (const [said, want] of [['the barn', 'barn'], ['in the pond', 'pond'], ['a tree', 'tree'], ['in a hole', 'burrow'], ['on the farm', 'barn']])
  eq(V.match([said], homesEn), want, `en home "${said}" → ${want}`);
for (const [said, want] of [['chuồng', 'barn'], ['trong chuong', 'barn'], ['dưới ao', 'pond'], ['cai ao', 'pond'], ['trên cây', 'tree'],
  ['cái hang', 'burrow'], ['hang', 'burrow']])
  eq(V.match([said], homesVi), want, `vi home "${said}" → ${want}`);
const animEn = ch('en', 'animal', ANIMALS), animVi = ch('vi', 'animal', ANIMALS);
for (const a of ANIMALS) {
  eq(V.match(['the ' + I.name('en', 'animal', a) + '!'], animEn), a, `en "the ${a}!"`);
  const vi = I.name('vi', 'animal', a);
  eq(V.match([vi.replace(/^con /, '')], animVi), a, `vi bare "${vi.replace(/^con /, '')}" → ${a}`);
  eq(V.match(['là ' + vi + ' đó'], animVi), a, `vi "là ${vi} đó" → ${a}`);
}
for (const [said, want] of [['con lợn', 'pig'], ['bunny rabbit', 'bunny'], ['thỏ', 'bunny'], ['ca', 'fish'], ['cao', 'fox'], ['bươm bướm', 'butterfly']])
  eq(V.match([said], /[a-z] [a-z]/.test(said) && !/[ơư]/.test(said) && said.includes('bunny') ? animEn : animVi), want, `"${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['xanh'], ch('vi', 'color', COLORS)), null, '"xanh" alone is ambiguous');
eq(V.match(['ba'], ch('vi', 'number', [3, 5, 12])), '3', '"ba" → 3');
eq(V.match(['muoi hai'], ch('vi', 'number', [3, 5, 12])), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], ch('en', 'number', [3, 5, 12])), '5', '"I think five"');
eq(V.match(['three teddy bears'], ch('en', 'number', [2, 3, 4])), '3', 'en "three teddy bears" → 3');
eq(V.match(['ba con gấu bông'], ch('vi', 'number', [2, 3, 4])), '3', 'vi "ba con gấu bông" → 3');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
eq(V.match(['số chẵn'], ch('vi', 'parity', ['odd', 'even'])), 'even', '"số chẵn"');
eq(V.match(['bee'], ch('en', 'letter', ['A', 'B', 'C'])), 'B', '"bee" → B');
eq(V.match(['chữ tờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'T', '"chữ tờ" → T');
eq(V.match(['two plus three'], ch('en', 'sum', ['2+3', '1+1'])), '2+3', 'en sum spoken');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['cow'], [{ id: 'c', kind: 'animal', value: 'cow' }, { id: 'p', kind: 'animal', value: 'pig' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['dưới ao'], [{ id: 'x', kind: 'home', value: 'barn' }, { id: 'y', kind: 'home', value: 'pond' }], 'vi'), 'y', '{id,kind,value} home vi');
eq(V.match(['banana'], colEn), null, 'unrelated → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('sayGrab: names the item');
const blk = (color, toy) => ({ nameKind: 'color', nameValue: color, item: { kind: 'block', toy, color, nameKind: 'color', nameValue: color } });
eq(I.sayGrab('en', blk('red', 'cube'), r0), 'Red block!', 'en red block');
eq(I.sayGrab('vi', blk('red', 'cube'), r0), 'Khối gỗ màu đỏ!', 'vi red block');
eq(I.sayGrab('en', blk('blue', 'cylinder'), r0), 'Blue tube!', 'en blue tube');
eq(I.sayGrab('vi', blk('green', 'cone'), r0), 'Khối nón màu xanh lá!', 'vi green cone');
eq(I.sayGrab('en', { nameKind: 'color', nameValue: 'pink' }, r0), 'Pink toy!', 'en colour without a toy');
eq(I.sayGrab('en', { nameKind: 'animal', nameValue: 'cow' }, r0), 'The cow!', 'en animal');
eq(I.sayGrab('vi', { nameKind: 'animal', nameValue: 'cow' }, r0), 'Con bò!', 'vi animal');
eq(I.sayGrab('en', { nameKind: 'cargo', nameValue: 'teddy' }, r0), 'Teddy bear!', 'en cargo');
eq(I.sayGrab('vi', { item: { kind: 'sprite', sprite: 'cargo_duckie' } }, r0), 'Vịt cao su!', 'vi cargo from sprite');
eq(I.sayGrab('en', { nameKind: 'shape', nameValue: 'star' }, r0), 'Star!', 'en shape');
eq(I.sayGrab('vi', { nameKind: 'shape', nameValue: 'heart' }, r0), 'Hình trái tim!', 'vi shape');
eq(I.sayGrab('en', { nameKind: 'size', nameValue: 'big', item: { kind: 'size', color: 'red' } }, r0), 'Big block!', 'en size');
eq(I.sayGrab('vi', { nameKind: 'size', nameValue: 'small' }, r0), 'Khối gỗ nhỏ!', 'vi size');
eq(I.sayGrab('en', { nameKind: 'letter', nameValue: 'B' }, r0), 'Letter B!', 'en letter');
eq(I.sayGrab('en', { nameKind: 'letter', nameValue: 'b' }, r0), 'Small b!', 'en small letter');
eq(I.sayGrab('vi', { nameKind: 'letter', nameValue: 'b' }, r0), 'Chữ b thường!', 'vi small letter');
eq(I.sayGrab('en', { nameKind: 'number', nameValue: 5 }, r0), 'Five!', 'en number');
eq(I.sayGrab('vi', { nameKind: 'number', nameValue: 5 }, r0), 'Số năm!', 'vi number');
eq(I.sayGrab('en', { nameKind: 'text', nameValue: '2+3' }, r0), '2 + 3!', 'en text');
eq(I.sayTap, I.sayGrab, 'sayTap = sayGrab');
eq(I.sayGrab('en', {}, r0), 'Up it goes!', 'unknown item → a neutral line');

section('sayCorrect: names the car / the match');
const lab = (type, value) => ({ type, value });
eq(I.sayCorrect('en', blk('red', 'cube'), lab('color', 'red'), r0), 'Yes! The red car!', 'en colour');
eq(I.sayCorrect('vi', blk('red', 'cube'), lab('color', 'red'), r0), 'Đúng rồi! Toa màu đỏ!', 'vi colour');
eq(I.sayCorrect('en', { nameKind: 'shape', nameValue: 'star' }, lab('shape', 'star'), r0), 'Yes! The star car!', 'en shape');
eq(I.sayCorrect('vi', { nameKind: 'size', nameValue: 'big' }, lab('size', 'big'), r0), 'Đúng rồi! Toa to!', 'vi size');
eq(I.sayCorrect('en', { nameKind: 'animal', nameValue: 'cow' }, lab('home', 'barn'), r0), 'Moo! The cow lives in the barn!', 'en home (DESIGN example)');
eq(I.sayCorrect('vi', { nameKind: 'animal', nameValue: 'cow' }, lab('home', 'barn'), r0), 'Ò ò! Con bò sống trong chuồng!', 'vi home');
eq(I.sayCorrect('en', { nameKind: 'animal', nameValue: 'fish' }, lab('home', 'pond'), r0), 'The fish lives in the pond!', 'quiet animal: no sound word');
eq(I.sayCorrect('vi', { nameKind: 'animal', nameValue: 'squirrel' }, lab('home', 'tree'), r0), 'Con sóc sống trên cây!', 'vi tree');
eq(I.sayCorrect('vi', { nameKind: 'animal', nameValue: 'bunny' }, lab('home', 'burrow'), r0), 'Con thỏ sống trong hang!', 'vi burrow');
eq(I.sayCorrect('en', { id: 'i1', count: { i: 3, n: 4 } }, lab('number', 4), r0), 'Three!', 'count mode → count word');
eq(I.sayCorrect('vi', { count: { i: 1, n: 2 } }, null, r0), 'Một!', 'vi count mode');
eq(I.sayCorrect('en', { nameKind: 'letter', nameValue: 'B' }, lab('letter', 'B'), r0), 'Yes! Letter B!', 'en letter');
eq(I.sayCorrect('en', { nameKind: 'letter', nameValue: 'b' }, lab('letter', 'B'), r0), 'Small b, big B! Yes!', 'en lower');
eq(I.sayCorrect('vi', { nameKind: 'letter', nameValue: 'b' }, lab('letter', 'B'), r0), 'Chữ b thường, chữ B hoa! Đúng rồi!', 'vi lower');
eq(I.sayCorrect('en', { nameKind: 'animal', nameValue: 'cow' }, lab('letter', 'C'), r0), 'C is for cow!', 'en initial');
eq(I.sayCorrect('vi', { nameKind: 'animal', nameValue: 'cow' }, lab('letter', 'B'), r0), 'Chữ B, bò!', 'vi initial');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 5 }, lab('text', '2+3'), r0), '2 + 3 is five!', 'en add');
eq(I.sayCorrect('vi', { nameKind: 'number', nameValue: 4 }, lab('text', '7−3'), r0), '7 − 3 bằng bốn!', 'vi sub');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 7 }, lab('parity', 'odd'), r0), 'Seven is odd!', 'en parity');
eq(I.sayCorrect('vi', { nameKind: 'number', nameValue: 8 }, lab('parity', 'even'), r0), 'Tám là số chẵn!', 'vi parity');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 3 }, lab('number', 3), r0), 'Yes! Number three!', 'number label without count');
eq(I.sayCorrect('en', Object.assign(blk('red', 'cube'), { label: lab('color', 'red') }), r0), 'Yes! The red car!', 'label from ev.label, rng as 3rd arg');
eq(I.sayCorrect('en', Object.assign(blk('red', 'cube'), { car: { label: lab('color', 'red') } }), null, r0), 'Yes! The red car!', 'label from ev.car.label');
eq(I.sayCorrect('en', {}, null, r0), 'Yes!', 'nothing known → praise');
eq(I.sayPlay, I.sayCorrect, 'sayPlay alias');

section('sayWrong: names the car it hit, then the goal (never negative, maths never gives the answer)');
const wr = (item, want, got) => ({ id: 'i1', carId: 'c2', item, want, got, streak: 1 });
eq(I.sayWrong('en', wr({ nameKind: 'color', nameValue: 'red', toy: 'cube' }, { nameKind: 'color', nameValue: 'red' }, { type: 'color', value: 'blue' }), r0),
  'Boing! That’s the blue car. The red block wants the red car!', 'en DESIGN example');
eq(I.sayWrong('vi', wr({ nameKind: 'color', nameValue: 'red', toy: 'cube' }, { nameKind: 'color', nameValue: 'red' }, { type: 'color', value: 'blue' }), r0),
  'Tưng! Đây là toa màu xanh dương. Khối gỗ màu đỏ muốn lên toa màu đỏ cơ!', 'vi DESIGN example');
eq(I.sayWrong('en', wr({ nameKind: 'color', nameValue: 'red', toy: 'cube' }, { nameKind: 'color', nameValue: 'red' }), r0),
  'Boing! The red block wants the red car!', 'en without the hit car');
eq(I.sayWrong('en', wr({ nameKind: 'animal', nameValue: 'duck' }, { nameKind: 'home', nameValue: 'pond' }, { type: 'home', value: 'barn' }), r0),
  'Boing! That’s the barn car. The duck wants the pond car!', 'en homes');
eq(I.sayWrong('vi', wr({ nameKind: 'animal', nameValue: 'duck' }, { nameKind: 'home', nameValue: 'pond' }, { type: 'home', value: 'barn' }), r0),
  'Tưng! Đây là toa chuồng. Con vịt muốn lên toa ao cơ!', 'vi homes');
eq(I.sayWrong('en', wr({ nameKind: 'shape', nameValue: 'star' }, { nameKind: 'shape', nameValue: 'star' }, { type: 'shape', value: 'heart' }), r0),
  'Boing! That’s the heart car. The star wants the star car!', 'en shapes');
eq(I.sayWrong('en', wr({ nameKind: 'size', nameValue: 'small' }, { nameKind: 'size', nameValue: 'small' }, { type: 'size', value: 'big' }), r0),
  'Boing! That’s the big car. The small block wants the small car!', 'en size');
eq(I.sayWrong('en', wr({ nameKind: 'letter', nameValue: 'B' }, { nameKind: 'letter', nameValue: 'B' }, { type: 'letter', value: 'D' }), r0),
  'Boing! That’s the letter D car. Letter B wants the letter B car!', 'en letters');
const mathEn = I.sayWrong('en', wr({ nameKind: 'number', nameValue: 5 }, { nameKind: 'text', nameValue: '2+3' }, { type: 'text', value: '3+4' }), r0);
eq(mathEn, 'Boing! That’s the 3 + 4 car. Which car makes five?', 'en add: no answer given');
ok(!mathEn.includes('2 + 3'), 'maths wrong line never names the right sum');
const mathVi = I.sayWrong('vi', wr({ nameKind: 'number', nameValue: 5 }, { nameKind: 'text', nameValue: '2+3' }, { type: 'text', value: '3+4' }), r0);
ok(!mathVi.includes('2 + 3') && mathVi.includes('năm'), 'vi maths wrong line: ' + mathVi);
eq(I.sayWrong('en', wr({ nameKind: 'number', nameValue: 5 }, { nameKind: 'parity', nameValue: 'odd' }, { type: 'parity', value: 'even' }), r0),
  'Boing! Five is odd. It wants the odd car!', 'en parity');
eq(I.sayWrong('en', wr({ nameKind: 'animal', nameValue: 'cow' }, { nameKind: 'letter', nameValue: 'C' }, { type: 'letter', value: 'P' }), r0),
  'Boing! Cow starts with C. It wants the letter C car!', 'en initial');
eq(I.sayWrong('vi', wr({ nameKind: 'animal', nameValue: 'cow' }, { nameKind: 'letter', nameValue: 'B' }, { type: 'letter', value: 'H' }), r0),
  'Tưng! Bò bắt đầu bằng chữ B. Mình tìm toa chữ B nhé!', 'vi initial');
eq(I.sayWrong('en', wr({ nameKind: 'letter', nameValue: 'b' }, { nameKind: 'letter', nameValue: 'B' }, { type: 'letter', value: 'D' }), r0),
  'Boing! Small b goes with big B!', 'en lower');
eq(I.sayWrong('en', {}, r0), 'Boing! Let’s try another car!', 'empty event → generic');
eq(I.sayWrong('en', { item: { nameKind: 'color', nameValue: 'red' } }, r0), 'Boing! Let’s try another car!', 'no want → generic');

section('sayCarDone / sayCount / talk');
eq(I.sayCarDone('en', { item: { nameKind: 'cargo', nameValue: 'teddy' } }, lab('number', 3), r0), 'That makes three teddy bears!', 'en count car done');
eq(I.sayCarDone('en', { item: { nameKind: 'cargo', nameValue: 'teddy' } }, lab('number', 1), r0), 'That makes one teddy bear!', 'en count car done (1)');
eq(I.sayCarDone('vi', { item: { nameKind: 'cargo', nameValue: 'ball' } }, lab('number', 4), r0), 'Đủ bốn quả bóng rồi!', 'vi count car done');
eq(I.sayCarDone('en', { need: 2 }, null, r0), 'That makes two toys!', 'count without cargo → toys');
eq(I.sayCarDone('en', { carId: 'c1' }, lab('color', 'red'), r0), 'This car is ready!', 'sort car done');
for (let i = 1; i <= 20; i++) { eq(I.sayCount('en', i), I.t('en', 'count.' + i), 'sayCount ' + i); ok(clean(I.sayCount('vi', i)), 'vi count ' + i); }
eq(I.sayCount('en', 3), 'Three!', 'Three!');
eq(I.sayCount('vi', 15), 'Mười lăm!', 'Mười lăm!');
eq(I.sayCount('en', 25), '25!', 'beyond 20 → digits');
eq(I.t('en', 'talk.homes', { animal: 'cow' }), 'Where does the cow live?', 'talk.homes en');
eq(I.t('vi', 'talk.homes', { animal: 'fox' }), 'Con cáo sống ở đâu nhỉ?', 'talk.homes vi');
eq(I.t('en', 'talk.homes', {}), 'Where does it live?', 'talk.homes without an animal');
eq(I.t('en', 'talk.count', { cargo: 'teddy' }), 'How many teddy bears?', 'talk.count en');
eq(I.t('vi', 'talk.count', { cargo: 'boat' }), 'Có mấy chiếc thuyền nào?', 'talk.count vi');
eq(I.t('en', 'talk.count', {}), 'How many are there?', 'talk.count without cargo');
eq(I.talkWrong('en', 'home', 'barn'), 'It lives in the barn! Good try!', 'talkWrong home en');
eq(I.talkWrong('vi', 'home', 'pond'), 'Bạn ấy sống dưới ao đó! Bé cố gắng lắm!', 'talkWrong home vi');
eq(I.talkWrong('en', 'color', 'red'), 'It is red! Good try!', 'talkWrong colour');
eq(I.talkWrong('en', 'shape', 'oval'), 'It is an oval! Good try!', 'talkWrong an oval');
eq(I.talkWrong('en', 'animal', 'cow'), 'It is the cow! Good try!', 'talkWrong animal');
eq(I.talkWrong('vi', 'number', 7), 'Là số bảy đó! Bé cố gắng lắm!', 'talkWrong number vi');
eq(I.talkWrong('en', 'letter', 'b'), 'It is small letter b! Good try!', 'talkWrong small letter');
eq(I.talkWrong('en', { kind: 'size', value: 'big' }), 'It is big! Good try!', 'talkWrong object arg');
for (const t of TOPICS) for (const lang of I.langs) ok(clean(I.t(lang, 'talk.' + t, { animal: 'cow', cargo: 'ball', word: 'cow' })), `${lang} talk.${t}`);

section('sweep: every item × label in both languages renders clean and positive');
const ITEMS = [].concat(
  COLORS.map(c => TOYS.map(t => ({ nameKind: 'color', nameValue: c, kind: 'block', toy: t, color: c }))).flat(),
  SHAPES.map(s => ({ nameKind: 'shape', nameValue: s, kind: 'shape', shape: s, color: 'red' })),
  ['big', 'small'].map(s => ({ nameKind: 'size', nameValue: s, kind: 'size', color: 'blue' })),
  ANIMALS.map(a => ({ nameKind: 'animal', nameValue: a, kind: 'sprite', sprite: 'animal_' + a })),
  CARGO.map(c => ({ nameKind: 'cargo', nameValue: c, kind: 'sprite', sprite: 'cargo_' + c })),
  LETTERS.map(l => ({ nameKind: 'letter', nameValue: l, kind: 'letter', text: l })),
  LETTERS.filter(l => l !== 'I').map(l => ({ nameKind: 'letter', nameValue: l.toLowerCase(), kind: 'letter', text: l.toLowerCase() })),
  Array.from({ length: 21 }, (_, n) => ({ nameKind: 'number', nameValue: n, kind: 'number', text: String(n) })));
const LABELS = [].concat(COLORS.map(c => lab('color', c)), SHAPES.map(s => lab('shape', s)), [lab('size', 'big'), lab('size', 'small')],
  HOME_IDS.map(h => lab('home', h)), [1, 3, 5, 12].map(n => lab('number', n)), ['A', 'B', 'C', 'S', 'V'].map(l => lab('letter', l)),
  ['2+3', '4+6', '9−4', '7−7'].map(t => lab('text', t)), [lab('parity', 'odd'), lab('parity', 'even')]);
let sweep = 0;
for (const lang of I.langs) {
  for (const it of ITEMS) {
    const g = I.sayGrab(lang, { nameKind: it.nameKind, nameValue: it.nameValue, item: it }, r9);
    ok(clean(g), `${lang} grab ${JSON.stringify(it)}: ${g}`);
    ok(clean(I.itemPhrase(lang, it)), `${lang} itemPhrase ${it.nameKind} ${it.nameValue}`);
    for (const L of LABELS) {
      const c = I.sayCorrect(lang, { item: it }, L, r9);
      const w = I.sayWrong(lang, { item: it, want: { nameKind: L.type, nameValue: L.value }, got: LABELS[(LABELS.indexOf(L) + 1) % LABELS.length] }, r9);
      sweep += 2;
      if (!clean(c) || !positive(c)) ok(false, `${lang} correct ${it.nameKind}:${it.nameValue} in ${L.type}:${L.value} → ${c}`);
      if (!clean(w) || !positive(w)) ok(false, `${lang} wrong ${it.nameKind}:${it.nameValue} want ${L.type}:${L.value} → ${w}`);
      if (L.type === 'text' && /\{|undefined/.test(w)) ok(false, 'math wrong junk');
    }
  }
  for (const L of LABELS) ok(clean(I.carPhrase(lang, L)), `${lang} carPhrase ${L.type} ${L.value}: ${I.carPhrase(lang, L)}`);
}
ok(sweep > 10000, `swept ${sweep} lines`);
// right/wrong lines for the matching item of every label (what the game really says) carry the label's name
for (const lang of I.langs) for (const c of COLORS) ok(I.sayCorrect(lang, { item: { nameKind: 'color', nameValue: c } }, lab('color', c), r0).toLowerCase()
  .includes(I.name(lang, 'color', c).toLowerCase()), `${lang} correct colour names ${c}`);
for (const lang of I.langs) for (const [h, as] of Object.entries(HOMES)) for (const a of as) {
  const s = I.sayCorrect(lang, { item: { nameKind: 'animal', nameValue: a } }, lab('home', h), r0);
  ok(s.toLowerCase().includes(I.name(lang, 'animal', a).toLowerCase()), `${lang} home line names the ${a}: ${s}`);
}
// garbage never throws
for (const lang of I.langs) for (const ev of [null, undefined, 5, 'x', [], { item: 7 }, { item: { nameKind: 'zzz', nameValue: {} } }, { want: 'x' }, { count: { i: 'x' } }]) {
  let out;
  try { out = [I.sayGrab(lang, ev), I.sayCorrect(lang, ev, ev), I.sayWrong(lang, ev), I.sayCarDone(lang, ev)]; } catch (e) { out = null; }
  ok(out && out.every(clean), `${lang} garbage ${JSON.stringify(ev)} → ${JSON.stringify(out)}`);
}

section('speech text: letters, maths, "Momo"');
eq(I.speech('en', 'Boing! That’s the letter D car.'), 'Boing! That’s the letter dee car.', 'en letter car');
eq(I.speech('en', 'C is for cow!'), 'see is for cow!', 'en "C is for"');
eq(I.speech('en', 'Cow starts with C. It wants the letter C car!'), 'Cow starts with see. It wants the letter see car!', 'en starts with');
eq(I.speech('en', 'Small b, big B! Yes!'), 'Small bee, big bee! Yes!', 'en small/big letters');
eq(I.speech('en', '2 + 3 is five!'), '2 plus 3 is five!', 'en plus');
eq(I.speech('vi', '7 − 3 bằng bốn!'), '7 trừ 3 bằng bốn!', 'vi minus');
eq(I.speech('vi', 'Tưng! Đây là toa chữ B.'), 'Tưng! Đây là toa chữ bờ.', 'vi phonics');
eq(I.speech('en', 'Hi! I am Momo.'), 'Hi! I am Momo.', 'en "Momo" as written');
eq(I.speech('vi', 'Mình là Momo. Cú Momo nè!'), 'Mình là Mô Mô. Cú Mô Mô nè!', 'vi "Momo" → "Mô Mô"');
eq(I.speech('en', 'Red car — yes!'), 'Red car, yes!', 'dash → comma pause');
eq(I.speech('en', 'Big toys in the big car!'), 'Big toys in the big car!', '"big toys" is not a letter');
eq(V.spoken('vi', 'Chào bé! Mình là Momo.'), 'Chào bé! Mình là Mô Mô.', 'Voice.spoken uses I18N.speech');

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
  sb4.TT = {};
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
  sb7.TT = {};
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
  sb5.TT = {};
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
  sb6.TT = {};
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
ok(sb.TT.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into TT.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof TT.Input.attach === 'function' && typeof TT.Input.kidProof === 'function' && typeof TT.Input.holdButton === 'function',
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
  sbx.TT = {};
  env.TT = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.TT.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Momo: rate 0.9, pitch 1.2');
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
  // vi "Momo" is spoken "Mô Mô"; the bubble text (onStart, log) keeps "Momo"
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là Momo. Momo giúp bé nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là Mô Mô. Mô Mô giúp bé nhé!', 'vi utterance says "Mô Mô"');
  eq(startText, 'Mình là Momo. Momo giúp bé nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('talk.homes', { animal: 'duck' }, { lang: 'vi' });
  eq(sk.text, 'Con vịt sống ở đâu nhỉ?', 'sayKey renders the vi line');
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
  E3.TT.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['duck', 'sheep', 'pig']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the sheep')] });
  eq((await pr2).id, 'sheep', 'interim match resolves after a short wait');
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
