#!/usr/bin/env node
// Tumi's Flower Farm — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/turtle-farm-garden:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md. When the farm content.js exists (FT.Content + FT.HOME_OF),
// every prompt / Talk key + params it produces is checked too.
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
const NEG_EN = /\b(no|not|wrong|bad|fail|failed|incorrect|oh no|mistake|oops|fall|fell|crash|broke|broken|sorry|nope|burnt|burned)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|dở|tệ|hỏng|không đúng|chưa đúng|trật|sai rồi|đổ|ngã|rơi mất|không phải|nhầm|cháy)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
const r0 = () => 0, r5 = () => 0.5, r9 = () => 0.99;
function clean(s) {
  return typeof s === 'string' && s.trim().length > 0 && s.indexOf('{') < 0 && s.indexOf('}') < 0 &&
    !/undefined|null|NaN|\[object/.test(s) && !/\s[!?.,]/.test(s) && !/^[!?.,—]/.test(s) && !/_/.test(s) && !/\s{2}/.test(s) &&
    !/màu màu/i.test(s) && !/\bthe the\b/i.test(s) && !/\bcon con\b/.test(s) && !/hoa hoa|hàng hàng|luống luống|gói gói|biển biển|cái cái|hình hình/i.test(s) &&
    !/(^|\s)a [aeiou]/i.test(s.replace(/letter A/g, ''));
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');

// ------------------------------------------------------------------ DESIGN value lists
const ANIMALS = ['dog', 'bee', 'bird', 'frog', 'duck', 'cow', 'sheep', 'rabbit', 'hen', 'pig'];
const HOMES = ['kennel', 'hive', 'nest', 'pond', 'barn', 'burrow', 'coop', 'sty'];
const HOME_OF = { dog: 'kennel', bee: 'hive', bird: 'nest', frog: 'pond', duck: 'pond', cow: 'barn', sheep: 'barn',
  rabbit: 'burrow', hen: 'coop', pig: 'sty' };
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const STROKES = ['line', 'wave', 'zigzag', 'arc', 'loop', 'swirl'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.FT = { debug: { voiceLog: [] } };
let FT;
try { FT = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = FT.I18N, V = FT.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js'])
  ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(JS, f), 'utf8')), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN FT.ANIMALS');
eq(JSON.stringify(I.HOMES), JSON.stringify(HOMES), 'I18N.HOMES = DESIGN FT.HOMES');
eq(JSON.stringify(I.HOME_OF), JSON.stringify(HOME_OF), 'I18N.HOME_OF = DESIGN FT.HOME_OF');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');

// the farm content.js (another agent writes it): loaded only once it is the farm version
let contentSB = null;
try {
  const csrc = fs.existsSync(path.join(JS, 'content.js')) ? fs.readFileSync(path.join(JS, 'content.js'), 'utf8') : '';
  if (/HOME_OF/.test(csrc) && /Flower Farm/.test(csrc.slice(0, 200))) {
    const sbc = makeSandbox(); sbc.FT = {};
    load(sbc, ['rng.js', 'i18n.js'].concat(fs.existsSync(path.join(JS, 'trace.js')) ? ['trace.js'] : []).concat(['content.js']));
    if (sbc.FT.Content && sbc.FT.Content.makeRound && sbc.FT.HOME_OF) contentSB = sbc;
  }
} catch (e) { ok(false, 'farm content.js load: ' + e.message); }
console.log(`   (${contentSB ? 'farm content.js loaded' : 'farm content.js not there yet'})`);

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapMochi', 'tapHint', 'quieter', 'louder', 'skip', 'gallery', 'pause', 'parentsHold', 'langName.en', 'langName.vi'];
// every data-i18n / T('ui.…') this game's index.html, ui.js and main.js use must exist
const usedUi = new Set();
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, 'game', f), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="(ui\.[\w.]+)"/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/T\((?:lang, )?'(ui\.[\w.]+)'/g)) usedUi.add(m[1]);
}
ok(usedUi.size >= 10, 'found the ui keys index.html / ui.js / main.js use (' + usedUi.size + ')');
const PROMPT_KEYS = ['p.colors', 'p.shapes', 'p.size', 'p.count', 'p.chips', 'p.animals', 'p.road', 'p.letters', 'p.lower',
  'p.initial', 'p.add', 'p.sub', 'p.oddeven', 'p.trace'];
const PICK_KEYS = ['say.pick', 'say.pick.any'].concat(['shape', 'size', 'animal', 'home', 'label', 'parity', 'initial', 'sum'].map(k => 'say.pick.' + k));
const DONE_KEYS = ['stroke', 'shape', 'size', 'number', 'letter', 'initial', 'sum', 'parity', 'road', 'any'].map(k => 'trace.done.' + k);
const LINE_KEYS = ['p.any', 'p.trace.any', 'p.colors.any', 'p.chips.any', 'trace.start', 'trace.progress', 'trace.stroke', 'trace.pause',
  'offPath', 'traceTap', 'assist', 'chipsDone', 'chipsDone.any', 'already', 'wrong.bag', 'wrong.cookie', 'wrong.animal', 'wrong.math',
  'wrong.parity', 'wrong.initial', 'wrong.any', 'needPick.bag', 'needPick.cookie', 'needPick.any', 'finish', 'hop', 'enter',
  'hint', 'hint.path', 'idle', 'praise', 'great', 'party', 'surprise.bird', 'bird.tap', 'surprise.mouse', 'mouse.tap', 'pokeMochi',
  'session.done', 'home.any'].concat(ANIMALS.map(a => 'home.' + a), ANIMALS.map(a => 'sound.' + a));
const TALK_KEYS = ['talk.intro', 'talk.right', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.home', 'talk.wrong.size',
  'talk.wrong.letter', 'talk.wrong.small', 'talk.wrong.number', 'talk.wrong.any', 'talk.sizeAny', 'talk.countAny', 'talk.calc',
  'talk.oddevenAny', 'talk.colorsAny', 'talk.shapesAny', 'talk.animalsAny', 'talk.animalsFind', 'talk.home', 'talk.lettersAny',
  'talk.lowerAny', 'talk.initialAny'].concat(TOPICS.map(k => 'talk.' + k));
const COUNT_KEYS = Array.from({ length: 21 }, (_, i) => 'count.' + i);
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k)).concat([...usedUi])
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(PROMPT_KEYS).concat(PICK_KEYS).concat(DONE_KEYS).concat(LINE_KEYS).concat(TALK_KEYS).concat(COUNT_KEYS);
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
const enKeys = I.keys('en').sort(), viKeys = I.keys('vi').sort();
eq(enKeys.join('|'), viKeys.join('|'), 'en and vi have identical key sets');
for (const k of enKeys) eq(placeholders(I.raw('vi', k)), placeholders(I.raw('en', k)), `same {params} in en/vi for ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  ok(raw.every(s => typeof s === 'string' && s.trim().length > 0), `${lang} ${k}: non-empty strings`);
  if (lang === 'vi') ok(raw.every(s => !/màu \{color\}/.test(s)), `vi ${k}: no "màu {color}"`);
}
// every placeholder a line uses is a known param (so no line can render "{xyz}")
const KNOWN_PARAMS = ['n', 'a', 'b', 'stars', 'color', 'shape', 'stroke', 'size', 'animal', 'home', 'letter', 'lower', 'word', 'expr',
  'ans', 'num', 'parity', 'label', 'got', 'want', 'answer', 'what', 'sound', 'chips'];
for (const lang of I.langs) for (const k of I.keys(lang)) for (const ph of placeholders(I.raw(lang, k)).split(',').filter(Boolean))
  ok(KNOWN_PARAMS.includes(ph.slice(1, -1)), `${lang} ${k}: known param ${ph}`);
// no bakery / Mochi words left (nor the older sea / Nini ones)
const BAKERY = /cookie|icing|bakery|bake|\bchips?\b|chocolate|sprinkle|Mochi|Mô Chi|panda|gấu trúc|bánh|(^|[^\p{L}])kem([^\p{L}]|$)|sô-cô-la|cốm|bột|flour|mouse|chuột|\bcat\b|meow|mèo|\bfish\b|(^|\s)cá(\s|!|$)|bowl|basket|cái giỏ|bể cá|cooling rack|giá bánh|yummy|\bpipe|squish|bóp kem|Nini|\bsea\b|\bpaint|shell|bubble|vỏ sò/iu;
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k)))
  ok(!BAKERY.test(s.replace(/\{\w+\}/g, '')), `${lang} ${k}: no bakery / Mochi words: ${s}`);
for (const lang of I.langs) for (const k of Object.keys(I.NAME_TABLE[lang])) for (const v of Object.values(I.NAME_TABLE[lang][k]))
  ok(!BAKERY.test(v), `${lang} name ${k}: no bakery words: ${v}`);
for (const k of enKeys) ok(!/fishy|pearl|alive|notThis|needPaint|tapPart|say\.paint|tapNini|\.cat$|\.fish$/.test(k), `no old-only key: ${k}`);
// every text key the game uses (I18N t() / T() / T1() / speak calls with a literal key, data-i18n attributes) exists in both
const usedKeys = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'game', 'js')).map(x => 'js/' + x).concat(['index.html'])) {
  if (!/\.(js|html)$/.test(f) || /i18n\.js$/.test(f)) continue;
  const src = fs.readFileSync(path.join(ROOT, 'game', f), 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="([\w.]+)"/g)) usedKeys.add(m[1]);
  for (const m of src.matchAll(/\b(?:T1?|t|sayKey)\(\s*(?:lang,\s*|curLang\(\),\s*|[a-zA-Z]+\.lang,\s*)?'([a-z][\w]*\.[\w.]+|[a-z][a-zA-Z]+)'/g)) usedKeys.add(m[1]);
}
ok(usedKeys.size >= 30, 'found the text keys the game uses (' + usedKeys.size + ')');
for (const lang of I.langs) for (const k of usedKeys) ok(I.has(lang, k), `game uses key ${k}: exists in ${lang}`);
// instructions and feedback have 3 wordings
const THREE = PROMPT_KEYS.concat(['p.any', 'p.trace.any', 'p.colors.any', 'p.chips.any', 'enter', 'finish', 'hop', 'already', 'needPick.bag',
  'needPick.cookie', 'wrong.bag', 'wrong.cookie', 'wrong.animal', 'wrong.math', 'wrong.any', 'say.pick', 'say.pick.shape', 'say.pick.animal',
  'say.pick.label', 'say.pick.size', 'trace.start', 'trace.progress', 'trace.stroke', 'trace.pause', 'offPath', 'traceTap', 'assist',
  'chipsDone', 'hint', 'hint.path', 'idle', 'praise', 'great', 'trace.done.any', 'trace.done.stroke', 'trace.done.shape',
  'trace.done.size', 'trace.done.number', 'trace.done.letter', 'trace.done.road', 'session.done'], ANIMALS.map(a => 'home.' + a));
for (const lang of I.langs) for (const k of THREE) ok([].concat(I.raw(lang, k)).length >= 3, `${lang} ${k}: 3 wordings`);
for (const lang of I.langs) for (const k of TOPICS.map(t => 'topic.' + t)) ok(!Array.isArray(I.raw(lang, k)), `${lang} ${k} is one banner string`);

section('titles, Tumi, Vietnamese warmth');
eq(I.t('en', 'ui.title'), 'Tumi’s Flower Farm', 'en title');
eq(I.t('en', 'ui.logo1') + ' ' + I.t('en', 'ui.logo2'), 'Tumi’s Flower Farm', 'en logo lines');
eq(I.t('vi', 'ui.logo1'), 'Rùa Tumi', 'vi logo line 1');
eq(I.t('vi', 'ui.logo2'), 'Nông Trại Hoa', 'vi logo line 2');
eq(I.t('vi', 'ui.title'), 'Nông Trại Hoa Của Rùa Tumi', 'vi title (REQUIREMENT)');
eq(I.t('en', 'ui.voice'), 'Tumi’s voice', 'voice toggle en');
eq(I.t('vi', 'ui.voice'), 'Giọng của Tumi', 'voice toggle vi names Tumi');
eq(I.t('en', 'ui.gallery'), 'Our garden', 'gallery en (DESIGN)');
eq(I.t('vi', 'ui.gallery'), 'Vườn của bé', 'gallery vi (DESIGN)');
ok(/Tumi/.test(I.t('en', 'ui.listening')) && /Tumi/.test(I.t('vi', 'ui.tapMochi')), 'listening / tapMochi name Tumi');
// VI: "Rùa Tumi" only in titles; lines say "Tumi" (the welcome introduces "rùa Tumi" once)
for (const k of I.keys('vi')) if (!/^ui\.(title|logo1|welcome)$/.test(k))
  for (const s of [].concat(I.raw('vi', k))) ok(!/Rùa Tumi/.test(s), `vi ${k}: "Tumi" in lines, not "Rùa Tumi": ${s}`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /Bé ơi/.test(s)), `vi ${k}: a warm "Bé ơi" wording`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /nhé|nào|nha/.test(s)), `vi ${k}: "nhé / nào"`);
for (const k of I.keys('vi')) if (!/^ui\.langName|^say\.pick\.label$/.test(k))
  ok(JSON.stringify(I.raw('vi', k)) !== JSON.stringify(I.raw('en', k)), `vi ${k} is translated`);
// Vietnamese diacritics present (a line typed without marks would be unreadable for parents and mis-spoken by TTS)
const VI_MARK = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
for (const k of I.keys('vi')) if (!/^ui\.langName\.en$|^count\.|^sound\.|^ui\.namePlaceholder$|^ui\.done$/.test(k)) {
  const raw = [].concat(I.raw('vi', k));
  ok(raw.some(s => VI_MARK.test(s)), `vi ${k}: has Vietnamese diacritics: ${raw[0]}`);
  // every wording with a real sentence of its own (≥ 12 letters outside the {params}) carries the marks
  for (const s of raw) if (s.replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '').length >= 12) ok(VI_MARK.test(s), `vi ${k}: diacritics in "${s}"`);
}
ok(Object.values(I.SOUNDS.vi).filter(s => VI_MARK.test(s)).length >= 7, 'vi animal sounds use Vietnamese spelling');

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  for (const s of [].concat(I.raw(lang, k))) ok(positive(s), `${lang} ${k} is positive: ${s}`);
}

section('every string renders, no "{" left, no doubled words');
const SAMPLE = { n: 3, a: 2, b: 4, stars: 7, color: 'red', shape: 'star', stroke: 'wave', size: 'big', animal: 'dog', home: 'kennel',
  letter: 'B', lower: 'b', word: 'dog', first: 'D', expr: '2+3', ans: 'five', num: 'seven', parity: 'odd', label: 'letter B',
  got: { nameKind: 'shape', nameValue: 'circle' }, want: { nameKind: 'shape', nameValue: 'triangle' }, answer: 'red',
  what: { nameKind: 'shape', nameValue: 'heart' } };
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
I.setChild('');
ok(!/friend|\bbé\b,/.test(I.t('en', 'great', null, r9)), 'great without a name picks a no-name variant');
I.setChild('Mai');
eq(I.t('en', 'ui.welcome'), 'Hi Mai! I am Tumi. Let’s grow flowers!', 'welcome with the child name');
ok(/Mai/.test(I.t('vi', 'ui.welcome')), 'vi welcome with the child name');
ok(/Mai/.test(I.t('en', 'great', null, r0)), 'great with the child name');
I.setChild('');
eq(I.t('en', 'ui.welcome'), 'Hi! I am Tumi. Let’s grow flowers!', 'welcome without a name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé! Mình là rùa Tumi. Mình cùng trồng hoa nhé!', 'vi welcome without a name');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'ui.chapter');
eq(I.t('vi', 'session.done', { stars: 12 }, r0), 'Vườn hoa đẹp quá! 12 ngôi sao!', 'vi session.done');
eq(I.t('en', 'weather.0'), 'Spring flowers!', 'weather.0 spring (DESIGN)');
eq(I.t('en', 'weather.1'), 'Sunny summer!', 'weather.1 summer (DESIGN)');
eq(I.t('en', 'weather.2'), 'Windy autumn leaves!', 'weather.2 autumn (DESIGN)');
eq(I.t('en', 'weather.3'), 'Snowy winter!', 'weather.3 winter (DESIGN)');
eq(I.t('en', 'finish', null, r0), 'Look, they bloom!', 'finish (DESIGN)');
eq(I.t('en', 'hop', null, r0), 'A prize for the fence!', 'hop (DESIGN)');
eq(I.t('en', 'trace.start', null, r0), 'Press on the shining dot and slide!', 'trace.start (DESIGN)');
eq(I.t('en', 'trace.progress', null, r0), 'Look, sprouts!', 'trace.progress (DESIGN)');
eq(I.t('en', 'trace.stroke', null, r0), 'Now the next line!', 'trace.stroke (DESIGN)');
eq(I.t('en', 'offPath', null, r0), 'Follow the dots!', 'offPath (DESIGN)');
eq(I.t('en', 'traceTap', null, r0), 'Keep your finger down and slide!', 'traceTap (DESIGN)');
eq(I.t('en', 'assist', null, r0), 'Magic water! Slide anywhere!', 'assist (DESIGN)');
eq(I.t('en', 'p.nonsense', null, r0), I.t('en', 'p.any', null, r0), 'unknown prompt key → p.any');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key → the key');

section('prompts: DESIGN examples, every param filled, fallbacks');
eq(I.t('en', 'p.colors', { color: 'red', stroke: 'wave' }, r0), 'Tap the red seed packet! Let’s plant a red wavy row!', 'p.colors en (playtest P3-13)');
eq(I.t('en', 'p.colors', { color: 'orange', stroke: 'arc' }, r5), 'Let’s plant an orange rainbow row! Tap the orange seed packet!', 'p.colors en "an orange"');
eq(I.t('vi', 'p.colors', { color: 'red', stroke: 'wave' }, r0), 'Bé chạm gói hạt màu đỏ nhé! Mình trồng một hàng lượn sóng!', 'p.colors vi');
eq(I.t('vi', 'p.colors', { color: 'blue', stroke: 'zigzag' }, r5), 'Mình trồng một hàng zíc zắc nhé! Chạm gói hạt màu xanh dương nào!', 'p.colors vi [1]');
// every colour prompt says to TAP THE PACKET first (a 4-year-old otherwise draws on the bed → needPick)
for (const lang of I.langs) for (const s of I.raw(lang, 'p.colors')) ok(lang === 'en' ? /Tap the \{color\} seed packet/.test(s) : /[Cc]hạm gói hạt \{color\}/.test(s), `${lang} p.colors says to tap the packet: ${s}`);
eq(I.t('en', 'p.colors', { color: 'red' }, r0), 'Pick the red seeds!', 'p.colors without stroke → p.colors.any');
eq(I.t('en', 'p.colors', {}, r0), I.t('en', 'p.any', null, r0), 'p.colors without params → p.any');
eq(I.t('en', 'p.shapes', { shape: 'triangle' }, r0), 'Which sign is the triangle?', 'p.shapes en (REQUIREMENT)');
eq(I.t('vi', 'p.shapes', { shape: 'triangle' }, r0), 'Bé ơi, tấm biển nào là hình tam giác nhỉ?', 'p.shapes vi');
eq(I.t('en', 'p.size', { size: 'big' }, r0), 'Find the big flower patch!', 'p.size en (DESIGN)');
eq(I.t('vi', 'p.size', { size: 'small' }, r0), 'Bé ơi, tìm luống hoa nhỏ nhé!', 'p.size vi');
eq(I.t('en', 'p.count', { n: 3 }, r0), 'Find the sign with number 3!', 'p.count en');
eq(I.t('en', 'p.chips', { n: 3 }, r0), 'Now pull up 3 carrots!', 'p.chips en plural (DESIGN)');
eq(I.t('en', 'p.chips', { n: 1 }, r0), 'Now pull up 1 carrot!', 'p.chips en singular');
eq(I.t('vi', 'p.chips', { n: 4 }, r0), 'Giờ bé nhổ 4 củ cà rốt nhé!', 'p.chips vi');
eq(I.t('en', 'p.animals', { animal: 'dog' }, r0), 'Find the dog! Woof woof!', 'p.animals en (REQUIREMENT)');
eq(I.t('vi', 'p.animals', { animal: 'dog' }, r0), 'Bé ơi, tìm con chó nhé! Gâu gâu!', 'p.animals vi');
eq(I.t('en', 'p.animals', { animal: 'cow' }, r5), 'Moo! Where is the cow?', 'p.animals en sound first');
eq(I.t('en', 'p.road', { home: 'kennel' }, r0), 'Make a path to the kennel!', 'p.road en (DESIGN)');
eq(I.t('en', 'p.road', { animal: 'bee' }, r0), 'Make a path to the beehive!', 'p.road derives the home from the animal');
eq(I.t('vi', 'p.road', { home: 'pond' }, r0), 'Bé ơi, làm con đường sỏi tới cái ao nhé!', 'p.road vi');
eq(I.t('en', 'p.letters', { letter: 'B' }, r0), 'Find the sign with letter B!', 'p.letters');
eq(I.t('en', 'p.lower', { letter: 'g' }, r0), 'Big G has a little friend. Find small g!', 'p.lower capital/small');
eq(I.t('en', 'p.initial', { animal: 'dog' }, r0), 'What letter does dog start with? Find that sign!', 'p.initial from animal');
eq(I.t('vi', 'p.initial', { word: 'ếch' }, r5), 'Bé nghe nè: Ếch! Bắt đầu bằng chữ gì nào?', 'p.initial vi');
eq(I.t('en', 'p.add', { a: 2, b: 3 }, r0), 'What is 2 + 3? Find the answer sign!', 'p.add');
eq(I.t('vi', 'p.sub', { a: 7, b: 2 }, r0), 'Bé ơi, 7 − 2 bằng mấy? Bé tìm tấm biển đáp án nhé!', 'p.sub vi');
eq(I.t('en', 'p.oddeven', { parity: 'odd' }, r0), 'Find an odd number!', 'p.oddeven odd');
eq(I.t('en', 'p.oddeven', { parity: 'even' }, r0), 'Find an even number!', 'p.oddeven even');
eq(I.t('vi', 'p.oddeven', { parity: 'even' }, r0), 'Bé ơi, tìm một số chẵn nhé!', 'p.oddeven vi');
eq(I.t('en', 'p.trace', {}, r0), 'Now follow the dots!', 'p.trace without what (DESIGN)');
eq(I.t('en', 'p.trace', { what: { nameKind: 'shape', nameValue: 'triangle' } }, r0), 'Now draw the triangle! Follow the dots!', 'p.trace shape');
eq(I.t('en', 'p.trace', { what: { nameKind: 'number', nameValue: 3 } }, r0), 'Now draw number three! Follow the dots!', 'p.trace number');
eq(I.t('vi', 'p.trace', { what: { nameKind: 'stroke', nameValue: 'wave' } }, r0), 'Giờ bé vẽ hàng lượn sóng nhé! Theo các chấm nào!', 'p.trace stroke vi');
eq(I.t('en', 'p.trace', { what: { kind: 'letter', text: 'b' } }, r0), 'Now draw small b! Follow the dots!', 'p.trace what {kind,text}');
eq(I.t('en', 'p.trace', { what: 'the path' }, r0), 'Now draw the path! Follow the dots!', 'p.trace what string');
// content.js gives {what:<kind word>, value, stroke|shape|n|letter…}: i18n names it (main.js may also convert it first)
eq(I.t('en', 'p.trace', { what: 'stroke', value: 'wave', stroke: 'wave', color: 'red' }, r0), 'Now draw the wavy row! Follow the dots!', 'what kind word + value');
eq(I.t('vi', 'p.trace', { what: 'shape', shape: 'heart' }, r0), 'Giờ bé vẽ hình trái tim nhé! Theo các chấm nào!', 'what kind word + shape param');
eq(I.t('en', 'p.trace', { what: 'number', value: 7, n: 7 }, r0), 'Now draw number seven! Follow the dots!', 'what number');
eq(I.t('en', 'p.trace', { what: 'number', n: 4 }, r0), 'Now draw number four! Follow the dots!', 'what number from n');
eq(I.t('en', 'p.trace', { what: 'letter', letter: 'b' }, r0), 'Now draw small b! Follow the dots!', 'what letter from letter');
eq(I.t('en', 'p.trace', { what: 'road', animal: 'dog' }, r0), 'Now draw the path to the kennel! Follow the dots!', 'what road from animal');
eq(I.t('en', 'p.trace', { what: 'stroke' }, r0), 'Now follow the dots!', 'what kind word without a value → p.trace.any');
for (const lang of I.langs) for (const st of STROKES) for (const rv of [0, 0.5, 0.9]) {
  const s = I.t(lang, 'p.trace', { what: 'stroke', value: st, stroke: st, color: 'red' }, () => rv);
  ok(clean(s) && s.toLowerCase().includes(I.name(lang, 'stroke', st).toLowerCase()), `${lang} p.trace what stroke ${st}: ${s}`);
}
for (const k of Object.keys(I.PROMPTS)) for (const lang of I.langs) eq(I.t(lang, k, {}, r0) !== '', true, `${lang} ${k} without params renders`);
// every prompt × every value
let psweep = 0;
for (const lang of I.langs) for (let v = 0; v < 3; v++) {
  const rng = () => (v + 0.5) / 3;
  const chk = (k, p) => { psweep++; const s = I.t(lang, k, p, rng); if (!clean(s) || !positive(s) || s === I.t(lang, 'p.any', null, rng)) ok(false, `${lang} ${k} ${JSON.stringify(p)}: ${s}`); };
  for (const c of COLORS) for (const st of STROKES) chk('p.colors', { color: c, stroke: st });
  for (const sh of SHAPES) { chk('p.shapes', { shape: sh }); chk('p.trace', { what: { nameKind: 'shape', nameValue: sh } }); }
  for (const sz of ['big', 'small']) chk('p.size', { size: sz });
  for (let n = 1; n <= 20; n++) { chk('p.count', { n }); chk('p.chips', { n }); chk('p.trace', { what: { nameKind: 'number', nameValue: n } }); }
  for (const a of ANIMALS) { chk('p.animals', { animal: a }); chk('p.road', { animal: a }); chk('p.road', { home: HOME_OF[a] }); chk('p.initial', { animal: a }); }
  for (const L of LETTERS) { chk('p.letters', { letter: L }); chk('p.lower', { letter: L }); chk('p.trace', { what: { nameKind: 'letter', nameValue: L } }); }
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) { chk('p.add', { a, b }); if (a >= b) chk('p.sub', { a, b }); }
  for (const par of ['odd', 'even']) chk('p.oddeven', { parity: par });
  for (const st of STROKES) chk('p.trace', { what: { nameKind: 'stroke', nameValue: st } });
}
ok(psweep > 2000, `swept ${psweep} prompts`);
for (const lang of I.langs) for (const a of ANIMALS) ok(I.t(lang, 'p.animals', { animal: a }, r0).includes(I.sound(lang, a)), `${lang} p.animals ${a} says its sound`);

section('names for every kind × value');
const NAME_CASES = { color: COLORS, hue: COLORS, shape: SHAPES, stroke: STROKES, size: ['big', 'small'], animal: ANIMALS, word: ANIMALS,
  home: HOMES, parity: ['odd', 'even'] };
const DESIGN_VI = {
  color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam', purple: 'màu tím', pink: 'màu hồng' },
  hue: { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' },
  animal: { dog: 'con chó', bee: 'con ong', bird: 'con chim', frog: 'con ếch', duck: 'con vịt', cow: 'con bò', sheep: 'con cừu',
    rabbit: 'con thỏ', hen: 'con gà mái', pig: 'con heo' },
  word: { dog: 'chó', bee: 'ong', bird: 'chim', frog: 'ếch', duck: 'vịt', cow: 'bò', sheep: 'cừu', rabbit: 'thỏ', hen: 'gà mái', pig: 'heo' },
  home: { kennel: 'chuồng chó', hive: 'tổ ong', nest: 'tổ chim', pond: 'cái ao', barn: 'chuồng bò', burrow: 'cái hang',
    coop: 'chuồng gà', sty: 'chuồng heo' },
  stroke: { line: 'hàng thẳng', wave: 'hàng lượn sóng', zigzag: 'hàng zíc zắc', arc: 'hàng cầu vồng', loop: 'vòng xoắn', swirl: 'xoáy ốc' },
  size: { big: 'to', small: 'nhỏ' } };
const DESIGN_EN = { stroke: { line: 'straight row', wave: 'wavy row', zigzag: 'zigzag row', arc: 'rainbow row', loop: 'loop', swirl: 'swirl' },
  animal: { hen: 'hen', sheep: 'sheep' },
  home: { kennel: 'kennel', hive: 'beehive', nest: 'nest', pond: 'pond', barn: 'barn', burrow: 'burrow', coop: 'hen house', sty: 'pigsty' } };
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const v of vals) for (const lang of I.langs) {
  const n = I.name(lang, kind, v);
  ok(clean(n) && n !== 'undefined', `${lang} name ${kind} ${v}: ${n}`);
  if (lang === 'vi') ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
  if (kind !== 'hue' && kind !== 'word') ok(I.NAME_TABLE[lang][kind][v] != null, `${lang} ${kind} "${v}" has its own entry (not a fallback)`);
  const want = (lang === 'vi' ? DESIGN_VI : DESIGN_EN)[kind];
  if (want && want[v]) eq(n, want[v], `${lang} ${kind} ${v} = DESIGN §6`);
}
for (const a of ANIMALS) ok(/^con /.test(I.name('vi', 'animal', a)), `vi animal ${a} has the classifier "con"`);
eq(I.name('vi', 'color', 'red', { bare: true }), 'đỏ', 'bare colour option');
eq(I.name('en', 'animal', 'dog', { size: 'big' }), 'big dog', 'en animal with size');
eq(I.name('vi', 'animal', 'dog', { size: 'big' }), 'con chó to', 'vi animal with size');
eq(I.name('vi', 'animal', 'animal_hen'), 'con gà mái', 'sprite id animal_hen');
eq(I.name('en', 'home', 'coop'), 'hen house', 'home coop en');
eq(I.name('vi', 'home', 'sty'), 'chuồng heo', 'home sty vi');
// cat / fish and their homes are gone (DESIGN §5.2)
for (const lang of I.langs) for (const gone of ['cat', 'fish']) ok(I.NAME_TABLE[lang].animal[gone] == null && I.sound(lang, gone) === '' && !I.has(lang, 'home.' + gone), `${lang} ${gone} removed`);
for (const lang of I.langs) for (const gone of ['bowl', 'basket']) ok(I.NAME_TABLE[lang].home[gone] == null, `${lang} home ${gone} removed`);
// the new animals: names, sounds, home lines and spoken words in both languages
eq(I.sound('en', 'hen'), 'Cluck cluck!', 'hen sound en'); eq(I.sound('vi', 'hen'), 'Cục ta cục tác!', 'hen sound vi');
eq(I.sound('en', 'sheep'), 'Baa!', 'sheep sound en'); eq(I.sound('vi', 'sheep'), 'Be be!', 'sheep sound vi');
for (const lang of I.langs) for (const a of ['hen', 'sheep']) {
  ok(I.has(lang, 'home.' + a) && I.has(lang, 'sound.' + a), `${lang} ${a}: home + sound lines`);
  ok(I.words(lang, 'animal', a).length >= 3, `${lang} ${a}: ≥ 3 spoken forms`);
}
for (const lang of I.langs) for (const h of ['coop', 'sty', 'barn']) ok(I.words(lang, 'home', h).length >= 3, `${lang} home ${h}: ≥ 3 spoken forms`);
for (let n = 0; n <= 20; n++) for (const lang of I.langs) ok(clean(I.name(lang, 'number', n)) && !/\d/.test(I.name(lang, 'number', n)), `${lang} number ${n} → a word`);
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('vi', 'number', 20), 'hai mươi', 'vi 20');
eq(I.name('en', 'number', 13), 'thirteen', 'en 13');
for (const L of LETTERS) { ok(clean(I.name('en', 'letter', L)), 'en letter ' + L); ok(clean(I.name('vi', 'letter', L)), 'vi letter ' + L); }
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi phonics B');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi phonics K');
eq(I.name('vi', 'letter', 'Ê'), 'ê', 'vi phonics Ê');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('en', 'text', '4+1'), 'four plus one', 'text expr');
eq(I.name('vi', 'parity', 'even'), 'chẵn', 'vi even');
for (const lang of I.langs) for (const a of ANIMALS) ok(clean(I.sound(lang, a)) && /!$/.test(I.sound(lang, a)), `${lang} sound ${a}: ${I.sound(lang, a)}`);
eq(I.sound('en', 'dog'), 'Woof woof!', 'en dog sound');
eq(I.sound('vi', 'dog'), 'Gâu gâu!', 'vi dog sound');
eq(I.sound('en', 'zebra'), '', 'unknown animal → no sound');
// initial-topic default words: distinct first letters exist, VI keeps the letter's own marks
for (const lang of I.langs) for (const e of FT.WORDS[lang]) {
  ok(ANIMALS.includes(e.animal) && e.initial === e.initial.toUpperCase() && e.initial.length === 1, `${lang} word ${e.word} initial ${e.initial}`);
  ok(!/^con /.test(e.word), `${lang} initial word ${e.word} has no classifier`);
}
eq(I.initialOf('vi', 'frog').first, 'Ê', 'vi ếch → Ê');
eq(I.initialOf('vi', 'bee').first, 'O', 'vi ong → O');
eq(I.initialOf('vi', 'sheep').first, 'C', 'vi cừu → C');
eq(I.initialOf('vi', 'hen').first, 'G', 'vi gà mái → G');
eq(I.initialOf('en', 'hen').first, 'H', 'en hen → H');
eq(I.initialOf('en', 'rabbit').first, 'R', 'en rabbit → R');
for (const lang of I.langs) ok(new Set(FT.WORDS[lang].map(e => e.initial)).size >= 6, `${lang}: ≥ 6 distinct first letters for the initial topic`);
// phrases
eq(I.phrase('en', { nameKind: 'shape', nameValue: 'oval' }), 'the oval', 'phrase shape en');
eq(I.phrase('vi', { nameKind: 'animal', nameValue: 'sheep' }), 'con cừu', 'phrase animal vi');
eq(I.phrase('en', { nameKind: 'home', nameValue: 'coop' }), 'the hen house', 'phrase home coop en');
eq(I.phrase('en', { nameKind: 'home', nameValue: 'hive' }), 'the beehive', 'phrase home en');
eq(I.phrase('vi', { nameKind: 'home', nameValue: 'hive' }), 'tổ ong', 'phrase home vi');
eq(I.phrase('en', { nameKind: 'stroke', nameValue: 'arc' }), 'the rainbow row', 'phrase stroke en');
eq(I.phrase('en', { nameKind: 'size', nameValue: 'small' }), 'the small flower patch', 'phrase size en');
eq(I.phrase('vi', { nameKind: 'size', nameValue: 'big' }), 'luống hoa to', 'phrase size vi');
eq(I.phrase('en', { nameKind: 'letter', nameValue: 'd' }), 'small d', 'phrase small letter');
eq(I.phrase('vi', { nameKind: 'letter', nameValue: 'D' }), 'chữ D', 'phrase letter vi');
eq(I.phrase('vi', 'number', 5), 'số năm', 'phrase number vi');
eq(I.phrase('en', { kind: 'cookie', ck: { kind: 'glyph', text: '7' } }), 'number seven', 'phrase glyph cookie');
eq(I.phrase('en', { kind: 'cookie', ck: { kind: 'animal', animal: 'pig' } }), 'the pig', 'phrase animal cookie');

section('words() — accepted spoken forms (digits, no diacritics), matched back by the matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green', 'pink']);
const MATCH_CASES = { color: COLORS, shape: SHAPES.filter(s => s !== 'rect'), stroke: STROKES, size: ['big', 'small'], animal: ANIMALS,
  home: HOMES, parity: ['odd', 'even'] };
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
  if (n > 0) eq(V.match([I.name(lang, 'number', n)], ch(lang, 'number', [n, n + 1, Math.max(0, n - 1) === n ? n + 2 : n - 1])), String(n), `${lang} spoken ${n}`);
}
const animEn = ch('en', 'animal', ANIMALS), animVi = ch('vi', 'animal', ANIMALS);
for (const a of ANIMALS) {
  eq(V.match(['the ' + I.name('en', 'animal', a) + '!'], animEn), a, `en "the ${a}!"`);
  const vi = I.name('vi', 'animal', a);
  eq(V.match([vi.replace(/^con /, '')], animVi), a, `vi bare "${vi.replace(/^con /, '')}" → ${a}`);
  eq(V.match(['là ' + vi + ' đó'], animVi), a, `vi "là ${vi} đó" → ${a}`);
}
for (const [said, want] of [['cún', 'dog'], ['con lợn', 'pig'], ['ech', 'frog'], ['vit', 'duck'], ['tho', 'rabbit'], ['gà mái', 'hen'], ['con gà', 'hen'], ['ga mai', 'hen'], ['cừu', 'sheep'], ['cuu', 'sheep'], ['con cuu', 'sheep']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['bunny', 'rabbit'], ['a puppy', 'dog'], ['chicken', 'hen'], ['a lamb', 'sheep'], ['the sheep', 'sheep'], ['piggy', 'pig'], ['froggy', 'frog']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
const homeVi = ch('vi', 'home', HOMES), homeEn = ch('en', 'home', HOMES);
for (const [said, want] of [['chuồng chó', 'kennel'], ['chuồng bò', 'barn'], ['chuong bo', 'barn'], ['chuồng gà', 'coop'], ['chuong ga', 'coop'], ['chuồng heo', 'sty'], ['chuồng lợn', 'sty'], ['cái ao', 'pond'], ['to ong', 'hive']])
  eq(V.match([said], homeVi), want, `vi home "${said}" → ${want}`);
for (const [said, want] of [['dog house', 'kennel'], ['the bee hive', 'hive'], ['the hen house', 'coop'], ['chicken coop', 'coop'], ['pig pen', 'sty'], ['the pigsty', 'sty'], ['rabbit hole', 'burrow']])
  eq(V.match([said], homeEn), want, `en home "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['chuồng'], homeVi), null, 'vi "chuồng" alone is ambiguous');
eq(V.match(['xanh'], ch('vi', 'color', COLORS)), null, '"xanh" alone is ambiguous');
eq(V.match(['màu xanh dương'], ch('vi', 'color', COLORS)), 'blue', 'vi "màu xanh dương"');
eq(V.match(['mau do'], ch('vi', 'color', COLORS)), 'red', 'vi no-diacritic "mau do"');
eq(V.match(['ba'], ch('vi', 'number', [3, 5, 12])), '3', '"ba" → 3');
eq(V.match(['muoi hai'], ch('vi', 'number', [3, 5, 12])), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], ch('en', 'number', [3, 5, 12])), '5', '"I think five"');
eq(V.match(['three carrots'], ch('en', 'number', [2, 3, 4])), '3', 'en "three carrots" → 3');
eq(V.match(['ba củ cà rốt'], ch('vi', 'number', [2, 3, 4])), '3', 'vi "ba củ cà rốt" → 3');
eq(V.match(['7'], ch('en', 'number', [6, 7, 8])), '7', 'digit transcript "7"');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
eq(V.match(['số chẵn'], ch('vi', 'parity', ['odd', 'even'])), 'even', '"số chẵn"');
eq(V.match(['bee'], ch('en', 'letter', ['A', 'B', 'C'])), 'B', '"bee" → B');
eq(V.match(['chữ tờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'T', '"chữ tờ" → T');
eq(V.match(['ê'], ch('vi', 'letter', ['E', 'Ê', 'O'])), 'Ê', 'vi "ê" → Ê (not E)');
eq(V.match(['two plus three'], ch('en', 'sum', ['2+3', '1+1'])), '2+3', 'en sum spoken');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['zic zac'], ch('vi', 'stroke', STROKES)), 'zigzag', 'vi stroke "zic zac"');
eq(V.match(['dog'], [{ id: 'c', kind: 'animal', value: 'dog' }, { id: 'p', kind: 'animal', value: 'cow' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['banana'], colEn), null, 'unrelated → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('game lines: sayPick / sayTraceDone / sayWrong / needPick / chipsDone / home / count');
eq(I.sayPick('en', { id: 'b1', kind: 'bag', color: 'red' }, r0), 'Red seeds!', 'pick bag en');
eq(I.sayPick('vi', { id: 'b1', kind: 'bag', color: 'blue' }, r0), 'Hạt giống màu xanh dương!', 'pick bag vi');
eq(I.sayPick('en', { kind: 'bag' }, r0), 'Rustle rustle!', 'pick bag without colour');
eq(I.sayPick('en', { kind: 'cookie', choice: { nameKind: 'shape', nameValue: 'triangle' } }, r0), 'The triangle!', 'pick shape cookie');
eq(I.sayPick('vi', { kind: 'cookie', nameKind: 'shape', nameValue: 'triangle' }, r0), 'Hình tam giác!', 'pick shape cookie vi');
eq(I.sayPick('en', { kind: 'cookie', choice: { nameKind: 'animal', nameValue: 'dog' } }, r0), 'The dog! Woof woof!', 'pick animal en');
eq(I.sayPick('vi', { kind: 'cookie', choice: { nameKind: 'animal', nameValue: 'duck' } }, r0), 'Con vịt! Cạp cạp!', 'pick animal vi');
eq(I.sayPick('en', { kind: 'cookie', choice: { ck: { kind: 'animal', animal: 'hen' } } }, r0), 'The hen! Cluck cluck!', 'pick from ck only');
eq(I.sayPick('en', { kind: 'cookie', choice: { nameKind: 'size', nameValue: 'big' } }, r0), 'The big flower patch!', 'pick size');
eq(I.sayPick('en', { kind: 'cookie', choice: { nameKind: 'letter', nameValue: 'B' } }, r0), 'Letter B!', 'pick letter');
eq(I.sayPick('en', { kind: 'cookie', choice: { nameKind: 'letter', nameValue: 'b' } }, r0), 'Small b!', 'pick small letter');
eq(I.sayPick('vi', { kind: 'cookie', choice: { nameKind: 'letter', nameValue: 'b' } }, r0), 'Chữ b thường!', 'pick small letter vi');
eq(I.sayPick('en', { kind: 'cookie', choice: { nameKind: 'number', nameValue: 3 } }, r0), 'Number three!', 'pick count numeral');
eq(I.sayPick('en', { kind: 'cookie', topic: 'initial', params: { animal: 'dog' }, choice: { nameKind: 'letter', nameValue: 'D' } }, r0), 'D is for dog!', 'pick initial en');
eq(I.sayPick('vi', { kind: 'cookie', topic: 'initial', params: { animal: 'frog' }, choice: { nameKind: 'letter', nameValue: 'Ê' } }, r0), 'Chữ Ê, ếch!', 'pick initial vi');
eq(I.sayPick('en', { kind: 'cookie', topic: 'oddeven', choice: { nameKind: 'number', nameValue: 7 } }, r0), 'Seven is odd!', 'pick parity');
eq(I.sayPick('en', { kind: 'cookie', topic: 'add', params: { a: 2, b: 3 }, choice: { nameKind: 'number', nameValue: 5 } }, r0), '2 + 3 is five!', 'pick sum');
eq(I.sayPick('vi', { kind: 'cookie', topic: 'sub', params: { a: 7, b: 3 }, choice: { nameKind: 'number', nameValue: 4 } }, r0), '7 − 3 bằng bốn!', 'pick diff vi');
eq(I.sayPick('en', {}, r0), 'Rustle rustle!', 'pick unknown → neutral');
// trace done (ev = the trace step)
eq(I.sayTraceDone('en', { path: { kind: 'stroke', id: 'wave' }, color: 'red' }, r0), 'Red flowers! Beautiful!', 'traceDone stroke (DESIGN)');
eq(I.sayTraceDone('vi', { path: { kind: 'stroke', id: 'wave' }, color: 'red' }, r0), 'Hoa màu đỏ đẹp quá!', 'traceDone stroke vi');
eq(I.sayTraceDone('en', { path: { kind: 'stroke', id: 'arc' }, color: 'orange' }, r5), 'What a lovely orange rainbow row!', 'traceDone stroke [1]');
eq(I.sayTraceDone('vi', { path: { kind: 'stroke', id: 'arc' }, color: 'orange' }, r5), 'Một hàng cầu vồng hoa màu cam xinh quá!', 'traceDone stroke vi [1]');
eq(I.sayTraceDone('en', { path: { kind: 'shape', shape: 'triangle' }, color: 'blue' }, r0), 'A triangle! Beautiful flowers!', 'traceDone shape');
eq(I.sayTraceDone('en', { path: { kind: 'shape', shape: 'oval' } }, r0), 'An oval! Beautiful flowers!', 'traceDone an oval');
eq(I.sayTraceDone('en', { topic: 'size', params: { size: 'big' }, path: { kind: 'shape', shape: 'circle' } }, r0), 'Flowers all around the big patch! Beautiful!', 'traceDone size');
eq(I.sayTraceDone('en', { path: { kind: 'glyph', text: '3' } }, r0), 'A beautiful three!', 'traceDone number');
eq(I.sayTraceDone('vi', { path: { kind: 'glyph', text: '3' } }, r0), 'Số ba đẹp quá!', 'traceDone number vi');
eq(I.sayTraceDone('en', { path: { kind: 'glyph', text: 'B' } }, r0), 'Letter B! Beautiful flowers!', 'traceDone letter');
eq(I.sayTraceDone('en', { path: { kind: 'glyph', text: 'b' } }, r0), 'Small b! Beautiful flowers!', 'traceDone small letter');
eq(I.sayTraceDone('en', { topic: 'initial', params: { animal: 'dog' }, path: { kind: 'glyph', text: 'D' } }, r0), 'D for dog! Beautiful!', 'traceDone initial');
eq(I.sayTraceDone('en', { topic: 'add', params: { a: 2, b: 3 }, path: { kind: 'glyph', text: '5' } }, r0), '2 + 3 is five! Beautiful!', 'traceDone sum');
eq(I.sayTraceDone('en', { topic: 'oddeven', path: { kind: 'glyph', text: '4' } }, r0), 'Four is even! Beautiful flowers!', 'traceDone parity');
eq(I.sayTraceDone('en', { topic: 'animals', params: { animal: 'dog' }, path: { kind: 'road' } }, r0), 'The path to the kennel is ready!', 'traceDone road from animal');
eq(I.sayTraceDone('vi', { params: { home: 'nest' }, path: { kind: 'road' } }, r0), 'Đường tới tổ chim xong rồi!', 'traceDone road vi');
eq(I.sayTraceDone('en', {}, r0), 'Beautiful flowers!', 'traceDone unknown → neutral');
// wrong
const wr = (kind, got, want, extra) => Object.assign({ kind, got, want, streak: 1 }, extra || {});
eq(I.sayWrong('en', wr('bag', { nameKind: 'color', nameValue: 'yellow' }, { nameKind: 'color', nameValue: 'blue' }), r0),
  'That packet is yellow. Let’s find blue!', 'wrong bag en');
eq(I.sayWrong('vi', wr('bag', { nameKind: 'color', nameValue: 'yellow' }, { nameKind: 'color', nameValue: 'blue' }), r0),
  'Đây là gói hạt giống màu vàng. Mình tìm gói màu xanh dương nhé!', 'wrong bag vi');
eq(I.sayWrong('en', wr('cookie', { nameKind: 'shape', nameValue: 'circle' }, { nameKind: 'shape', nameValue: 'triangle' }), r0),
  'That’s the circle. Where is the triangle?', 'wrong shape en (REQUIREMENT)');
eq(I.sayWrong('vi', wr('cookie', { nameKind: 'shape', nameValue: 'circle' }, { nameKind: 'shape', nameValue: 'triangle' }), r0),
  'Đây là hình tròn. Hình tam giác ở đâu nhỉ?', 'wrong shape vi');
eq(I.sayWrong('en', wr('cookie', { nameKind: 'animal', nameValue: 'sheep' }, { nameKind: 'animal', nameValue: 'cow' }), r0),
  'Baa! That’s the sheep. Where is the cow?', 'wrong animal en with the tapped animal’s sound');
eq(I.sayWrong('vi', wr('cookie', { nameKind: 'animal', nameValue: 'hen' }, { nameKind: 'animal', nameValue: 'duck' }), r0),
  'Cục ta cục tác! Đây là con gà mái. Con vịt ở đâu nhỉ?', 'wrong animal vi');
eq(I.sayWrong('en', wr('cookie', { nameKind: 'size', nameValue: 'small' }, { nameKind: 'size', nameValue: 'big' }), r0),
  'That’s the small flower patch. Where is the big flower patch?', 'wrong size en');
eq(I.sayWrong('vi', wr('cookie', { nameKind: 'size', nameValue: 'small' }, { nameKind: 'size', nameValue: 'big' }), r0),
  'Đây là luống hoa nhỏ. Luống hoa to ở đâu nhỉ?', 'wrong size vi');
eq(I.sayWrong('en', wr('cookie', { nameKind: 'letter', nameValue: 'D' }, { nameKind: 'letter', nameValue: 'B' }), r0),
  'That’s letter D. Where is letter B?', 'wrong letter en');
eq(I.sayWrong('en', wr('cookie', { nameKind: 'letter', nameValue: 'd' }, { nameKind: 'letter', nameValue: 'b' }), r0),
  'That’s small d. Where is small b?', 'wrong lower en');
eq(I.sayWrong('en', wr('cookie', { nameKind: 'number', nameValue: 5 }, { nameKind: 'number', nameValue: 3 }, { topic: 'count' }), r0),
  'That’s number five. Where is number three?', 'wrong count numeral');
const mathEn = I.sayWrong('en', wr('cookie', { nameKind: 'number', nameValue: 6 }, { nameKind: 'number', nameValue: 5 }, { topic: 'add' }), r0);
eq(mathEn, 'That’s number six. Let’s count again!', 'wrong add: no answer given');
ok(!/five|\b5\b/.test(mathEn), 'maths wrong line never names the right answer');
for (let v = 0; v < 3; v++) for (const lang of I.langs) {
  const s = I.sayWrong(lang, wr('cookie', { nameKind: 'number', nameValue: 6 }, { nameKind: 'number', nameValue: 5 }, { topic: 'sub' }), () => v / 3 + 0.1);
  ok(!/năm|five|\b5\b/.test(s) && /sáu|six/.test(s), `${lang} maths wrong line [${v}]: ${s}`);
}
eq(I.sayWrong('en', wr('cookie', { nameKind: 'number', nameValue: 4 }, { nameKind: 'parity', nameValue: 'odd' }, { topic: 'oddeven' }), r0),
  'Four is even! Let’s look for another one!', 'wrong parity en');
eq(I.sayWrong('en', wr('cookie', { nameKind: 'letter', nameValue: 'M' }, { nameKind: 'letter', nameValue: 'D' }, { topic: 'initial', params: { animal: 'dog' } }), r0),
  'That’s letter M. Listen: Dog! Let’s look again!', 'wrong initial en (says the word, not the answer)');
eq(I.sayWrong('vi', wr('cookie', { nameKind: 'letter', nameValue: 'M' }, { nameKind: 'letter', nameValue: 'C' }, { topic: 'initial', params: { word: 'chó' } }), r0),
  'Đây là chữ M. Bé nghe nè: Chó! Mình tìm lại nhé!', 'wrong initial vi');
eq(I.sayWrong('en', wr('cookie', { nameKind: 'animal', nameValue: 'dog' }, { nameKind: 'animal', nameValue: 'dog' }), r0), 'Let’s look again!', 'same thing → generic');
eq(I.sayWrong('en', {}, r0), 'Let’s look again!', 'empty event → generic');
eq(I.sayNeedPick('en', { mode: 'pickBag', color: 'blue' }, r0), 'First tap the blue seed packet!', 'needPick bag en');
eq(I.sayNeedPick('vi', { mode: 'pickBag', color: 'blue' }, r0), 'Bé chạm vào gói hạt giống màu xanh dương trước nhé!', 'needPick bag vi');
eq(I.sayNeedPick('en', { mode: 'pickCookie' }, r0), 'First find the right sign down here!', 'needPick cookie');
eq(I.sayNeedPick('en', {}, r0), 'Pick one down here first!', 'needPick unknown');
eq(I.sayChipsDone('en', { n: 3 }, r0), 'Three carrots!', 'chipsDone en (DESIGN)');
eq(I.sayChipsDone('en', { n: 1 }, r0), 'One carrot!', 'chipsDone singular');
eq(I.sayChipsDone('vi', { n: 5 }, r0), 'Năm củ cà rốt!', 'chipsDone vi');
eq(I.sayChipsDone('en', {}, r0), 'Carrots! Hooray!', 'chipsDone without n');
for (const lang of I.langs) for (const a of ANIMALS) for (const rv of [0, 0.4, 0.8]) {
  const s = I.sayHome(lang, { animal: a }, () => rv);
  ok(clean(s) && s.startsWith(I.sound(lang, a)) && s.length <= 48, `${lang} home ${a}: ${s}`);
}
eq(I.sayHome('en', { animal: 'dog' }, r0), 'Woof woof! The dog is home!', 'home dog en');
eq(I.sayHome('vi', { animal: 'dog' }, r0), 'Gâu gâu! Cún về tới nhà rồi!', 'home dog vi');
eq(I.sayHome('en', 'cow', r0), 'Moo! The cow is home!', 'sayHome(lang, animal string)');
ok(clean(I.sayHome('en', { animal: 'zebra' }, r0)), 'sayHome unknown animal → generic');
for (let i = 0; i <= 20; i++) { eq(I.sayCount('en', i), I.t('en', 'count.' + i), 'sayCount ' + i); ok(clean(I.sayCount('vi', i)), 'vi count ' + i); }
eq(I.sayCount('en', 3), 'Three!', 'Three!');
eq(I.sayCount('vi', 15), 'Mười lăm!', 'Mười lăm!');
eq(I.sayCount('en', 25), '25!', 'beyond 20 → digits');
// sweep: every thing × topic, every wrong pair — clean and positive
let sweep = 0;
const THINGS = [].concat(COLORS.map(v => ({ nameKind: 'color', nameValue: v })), SHAPES.map(v => ({ nameKind: 'shape', nameValue: v })),
  ANIMALS.map(v => ({ nameKind: 'animal', nameValue: v })), HOMES.map(v => ({ nameKind: 'home', nameValue: v })),
  ['big', 'small'].map(v => ({ nameKind: 'size', nameValue: v })), STROKES.map(v => ({ nameKind: 'stroke', nameValue: v })),
  LETTERS.map(v => ({ nameKind: 'letter', nameValue: v })), LETTERS.map(v => ({ nameKind: 'letter', nameValue: v.toLowerCase() })),
  Array.from({ length: 21 }, (_, n) => ({ nameKind: 'number', nameValue: n })));
for (const lang of I.langs) for (const th of THINGS) {
  for (const topic of [null, 'initial', 'oddeven', 'add', 'count']) {
    const s = I.sayPick(lang, { kind: th.nameKind === 'color' ? 'bag' : 'cookie', color: th.nameKind === 'color' ? th.nameValue : undefined,
      topic, params: { a: 1, b: 2, animal: 'dog' }, choice: th }, r9);
    sweep++; if (!clean(s) || !positive(s)) ok(false, `${lang} pick ${JSON.stringify(th)} ${topic}: ${s}`);
  }
  for (const w of THINGS.filter((x, i) => i % 5 === 0)) for (const topic of [null, 'add', 'oddeven', 'initial']) {
    const s = I.sayWrong(lang, { kind: th.nameKind === 'color' ? 'bag' : 'cookie', got: th, want: w, topic, params: { animal: 'cat' } }, r9);
    sweep++; if (!clean(s) || !positive(s)) ok(false, `${lang} wrong ${JSON.stringify(th)} want ${JSON.stringify(w)} ${topic}: ${s}`);
  }
  ok(clean(I.phrase(lang, th)), `${lang} phrase ${JSON.stringify(th)}: ${I.phrase(lang, th)}`);
}
for (const lang of I.langs) for (const c of COLORS) for (const st of STROKES) for (const rv of [0, 0.5, 0.9]) {
  const s = I.sayTraceDone(lang, { path: { kind: 'stroke', id: st }, color: c }, () => rv); sweep++;
  if (!clean(s) || !positive(s)) ok(false, `${lang} traceDone ${c} ${st}: ${s}`);
}
for (const lang of I.langs) for (const g of LETTERS.concat(LETTERS.map(x => x.toLowerCase()), Array.from({ length: 21 }, (_, n) => String(n))))
  for (const topic of [null, 'initial', 'oddeven', 'add', 'sub', 'letters']) {
    const s = I.sayTraceDone(lang, { topic, params: { a: 3, b: 1, animal: 'pig' }, path: { kind: 'glyph', text: g } }, r9); sweep++;
    if (!clean(s) || !positive(s)) ok(false, `${lang} traceDone glyph ${g} ${topic}: ${s}`);
  }
ok(sweep > 4000, `swept ${sweep} lines`);
for (const lang of I.langs) for (const ev of [null, undefined, 5, 'x', [], { choice: 7 }, { choice: { nameKind: 'zzz', nameValue: {} } }, { want: 'x' },
  { path: 'x' }, { path: { kind: 'glyph' } }, { n: 'x' }]) {
  let out;
  try { out = [I.sayPick(lang, ev), I.sayTraceDone(lang, ev), I.sayWrong(lang, ev), I.sayNeedPick(lang, ev), I.sayChipsDone(lang, ev), I.sayHome(lang, ev)]; } catch (e) { out = null; }
  ok(out && out.every(clean), `${lang} garbage ${JSON.stringify(ev)} → ${JSON.stringify(out)}`);
}

section('talk');
eq(I.t('en', 'talk.colors', { color: 'red' }), 'Which one is red?', 'talk.colors en');
eq(I.t('vi', 'talk.colors', { color: 'red' }), 'Cái nào màu đỏ nhỉ?', 'talk.colors vi');
eq(I.t('en', 'talk.colors', {}), 'What colour is this?', 'talk.colors without colour');
eq(I.t('vi', 'talk.shapes', { shape: 'circle' }), 'Hình tròn ở đâu nhỉ?', 'talk.shapes vi');
eq(I.t('en', 'talk.size', { size: 'big' }), 'Which flower is big?', 'talk.size en');
eq(I.t('vi', 'talk.size', { size: 'small' }), 'Bông hoa nào nhỏ nhỉ?', 'talk.size vi');
eq(I.t('en', 'talk.count', { n: 4 }), 'How many carrots are there?', 'talk.count never says the answer');
eq(I.t('en', 'talk.animals', { animal: 'bee' }), 'Where does the bee live?', 'talk.animals = which home');
eq(I.t('vi', 'talk.animals', { animal: 'bee' }), 'Con ong sống ở đâu nhỉ?', 'talk.animals vi');
eq(I.t('en', 'talk.animalsFind', { animal: 'cow' }), 'Where is the cow?', 'talk.animalsFind');
eq(I.t('en', 'talk.home', { home: 'nest' }), 'Who lives in the nest?', 'talk.home');
eq(I.t('en', 'talk.letters', { letter: 'M' }), 'Where is the letter M?', 'talk.letters');
eq(I.t('en', 'talk.lower', { letter: 'G', small: 'g' }), 'Where is small g? It goes with big G!', 'talk.lower');
eq(I.t('vi', 'talk.initial', { animal: 'frog', letter: 'Ê' }), 'Ếch bắt đầu bằng chữ gì nhỉ?', 'talk.initial vi (no answer)');
eq(I.t('en', 'talk.initial', { animal: 'rabbit', letter: 'R' }), 'Which letter does rabbit start with?', 'talk.initial en from animal');
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
eq(I.talkWrong('en', { thing: { kind: 'home', home: 'hive' } }), 'It is the beehive! Good try!', 'talkWrong home');
eq(I.talkWrong('vi', { thing: { kind: 'home', home: 'hive' } }), 'Là tổ ong đó! Bé cố gắng lắm!', 'talkWrong home vi');
eq(I.talkWrong('en', { thing: { kind: 'cookie', ck: { kind: 'shape', shape: 'oval' } } }), 'It is an oval! Good try!', 'talkWrong cookie shape');
eq(I.talkWrong('en', { thing: { kind: 'cookie', ck: { kind: 'glyph', text: '9' } } }), 'It is nine! Good try!', 'talkWrong glyph cookie');
eq(V.match(['the hive'], [{ id: 'a', words: I.choiceWords('en', { thing: { kind: 'home', home: 'hive' } }) },
  { id: 'b', words: I.choiceWords('en', { thing: { kind: 'home', home: 'nest' } }) }]), 'a', 'choiceWords home matched');
eq(V.match(['con cừu'], [{ id: 'a', words: I.choiceWords('vi', { thing: { kind: 'cookie', ck: { kind: 'animal', animal: 'sheep' } } }) },
  { id: 'b', words: I.choiceWords('vi', { thing: { kind: 'animal', animal: 'dog' } }) }]), 'a', 'choiceWords animal cookie matched');
eq(I.talkWrong('en', 'color', 'red'), 'It is red! Good try!', 'talkWrong colour');
eq(I.talkWrong('vi', 'color', 'red'), 'Là màu đỏ đó! Bé cố gắng lắm!', 'talkWrong colour vi');
eq(I.talkWrong('en', 'shape', 'oval'), 'It is an oval! Good try!', 'talkWrong an oval');
eq(I.talkWrong('en', 'animal', 'hen'), 'It is the hen! Good try!', 'talkWrong animal');
eq(I.talkWrong('vi', { thing: { kind: 'home', home: 'coop' } }), 'Là chuồng gà đó! Bé cố gắng lắm!', 'talkWrong home coop vi');
eq(I.talkWrong('en', 'size', 'big'), 'It is the big one! Good try!', 'talkWrong size');
eq(I.talkWrong('vi', 'size', 'big'), 'Là bông hoa to đó! Bé cố gắng lắm!', 'talkWrong size vi');
eq(I.talkWrong('vi', 'number', 7), 'Là số bảy đó! Bé cố gắng lắm!', 'talkWrong number vi');
eq(I.talkWrong('en', 'letter', 'b'), 'It is small letter b! Good try!', 'talkWrong small letter');
eq(I.talkWrong('en', { kind: 'parity', value: 'odd' }), 'It is odd! Good try!', 'talkWrong object arg');
eq(I.talkWrong('en', 'color', null), 'Good try! Let’s keep gardening!', 'talkWrong without value');
for (const t of TOPICS) for (const lang of I.langs) ok(clean(I.t(lang, 'talk.' + t, { animal: 'dog', size: 'big', n: 4, a: 1, b: 2, letter: 'B', color: 'red', shape: 'star', parity: 'odd' })), `${lang} talk.${t}`);
for (const lang of I.langs) for (const k of ['talk.count', 'talk.countAny', 'talk.initial', 'talk.add', 'talk.sub', 'talk.animals'])
  ok(!/\{(n|letter|ans|answer|num|home)\}/.test(I.raw(lang, k)), `${lang} ${k} does not speak the answer`);

// the real farm content.js: every prompt / Talk key + params it produces renders clean
if (contentSB) {
  section('content.js: every promptKey / Talk key it produces');
  const C = contentSB.FT.Content, RNG = contentSB.FT.RNG, CI = contentSB.FT.I18N;
  let n = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of TOPICS) for (const lang of I.langs) for (let seed = 1; seed <= 6; seed++) {
    let rd = null, tk = null;
    try { rd = C.makeRound(topic, { age, lang, rng: new RNG(seed), roundIndex: seed % 4, level: 0, surprise: null }); } catch (e) { /* topic not for this age */ }
    try { tk = C.makeTalk(topic, { age, lang, rng: new RNG(seed) }); } catch (e) { /* ignore */ }
    if (rd && rd.steps) for (const st of rd.steps) {
      n++;
      ok(CI.has(lang, st.promptKey), `${lang} content prompt key ${st.promptKey} exists`);
      const s = CI.t(lang, st.promptKey, st.params || {}, r9);
      ok(clean(s) && positive(s) && (s !== CI.t(lang, 'p.any', null, r9) || !CI.PROMPTS[st.promptKey]), `${lang} ${topic} age ${age} ${st.promptKey} ${JSON.stringify(st.params)}: ${s}`);
      for (const c of st.choices || []) {
        const pick = CI.sayPick(lang, { id: c.id, kind: c.kind, color: c.color, topic, params: st.params, choice: c }, r0);
        ok(clean(pick) && pick !== CI.t(lang, 'say.pick.any', null, r0), `${lang} ${topic} pick line for ${JSON.stringify(c)}: ${pick}`);
      }
      if (st.mode === 'trace') {
        const d = CI.sayTraceDone(lang, Object.assign({ topic }, st), r0);
        ok(clean(d) && d !== CI.t(lang, 'trace.done.any', null, r0), `${lang} ${topic} traceDone for ${JSON.stringify(st.path)}: ${d}`);
      }
    }
    if (tk) {
      n++;
      ok(CI.has(lang, tk.promptKey), `${lang} talk key ${tk.promptKey}`);
      const q = CI.t(lang, tk.promptKey, tk.params || {}, r0);
      ok(clean(q), `${lang} talk ${topic} ${JSON.stringify(tk.params)}: ${q}`);
      const ids = (tk.choices || []).map(c => ({ id: c.id, words: CI.choiceWords(lang, c) }));
      for (const c of tk.choices || []) {
        const tw = CI.talkWrong(lang, c);
        ok(CI.choiceWords(lang, c).length > 0 && clean(tw) && tw !== CI.t(lang, 'talk.wrong.any'), `${lang} talk choice ${JSON.stringify(c)}: ${tw}`);
        const kv = CI.kindValue(c), nm = CI.name(lang, kv[0], kv[1]);
        if (kv[0] !== 'letter') eq(V.match([nm], ids), c.id, `${lang} ${topic} talk choice said "${nm}" → ${c.id}`);
      }
      ok(!/\{/.test(q) && (topic !== 'count' || !q.includes(String(tk.params.n))), `${lang} talk ${topic} never says the answer: ${q}`);
    }
  }
  ok(n > 50, `content checked: ${n} steps / talks`);
}

section('speech text: letters, maths, "Tumi"');
eq(I.speech('en', 'That’s letter D. Where is letter B?'), 'That’s letter dee. Where is letter bee?', 'en letter names');
eq(I.speech('en', 'D is for dog!'), 'dee is for dog!', 'en "D is for"');
eq(I.speech('en', 'D for dog! Beautiful!'), 'dee for dog! Beautiful!', 'en "D for"');
eq(I.speech('en', 'Big G has a little friend. Find small g!'), 'Big jee has a little friend. Find small jee!', 'en big/small letters');
eq(I.speech('en', 'Find the big flower patch!'), 'Find the big flower patch!', '"big flower" is not a letter');
eq(I.speech('en', 'What is 2 + 3? Find the answer sign!'), 'What is 2 plus 3? Find the answer sign!', 'en plus');
eq(I.speech('vi', 'Bé ơi, 7 − 2 bằng mấy?'), 'Bé ơi, 7 trừ 2 bằng mấy?', 'vi minus');
eq(I.speech('vi', 'Bé ơi, tìm tấm biển có chữ B nhé!'), 'Bé ơi, tìm tấm biển có chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Chữ Ê, ếch!'), 'Chữ ê, ếch!', 'vi phonics Ê');
eq(I.speech('en', 'Hi! I am Tumi.'), 'Hi! I am Tumi.', 'en "Tumi" as written');
eq(I.speech('vi', 'Mình là rùa Tumi. Tumi giúp bé nhé!'), 'Mình là rùa Tu Mi. Tu Mi giúp bé nhé!', 'vi "Tumi" → "Tu Mi"');
eq(I.speech('vi', 'Nông Trại Hoa Của Rùa Tumi'), 'Nông Trại Hoa Của Rùa Tu Mi', 'vi title "Rùa Tumi" → "Rùa Tu Mi"');
eq(I.speech('vi', I.t('vi', 'ui.welcome')), 'Chào bé! Mình là rùa Tu Mi. Mình cùng trồng hoa nhé!', 'vi welcome spoken with "Tu Mi"');
eq(I.speech('vi', 'Bé vẽ hàng zíc-zắc nhé!'), 'Bé vẽ hàng zíc zắc nhé!', 'vi hyphens → spaces');
eq(I.speech('en', 'Lovely flowers — hooray!'), 'Lovely flowers, hooray!', 'dash → comma pause');
eq(V.spoken('vi', 'Chào bé! Mình là Tumi.'), 'Chào bé! Mình là Tu Mi.', 'Voice.spoken uses I18N.speech');
// every Vietnamese line that names Tumi is spoken "Tu Mi" (never the Latin "Tumi")
for (const k of I.keys('vi')) for (const s of [].concat(I.raw('vi', k))) if (/Tumi/.test(s)) ok(!/Tumi/.test(I.speech('vi', s)) && /Tu Mi/.test(I.speech('vi', s)), `vi ${k} speaks "Tu Mi"`);

section('input: tap + trace pointer layer — (x, y, ev) in logical px, ONE finger, extra fingers ignored');
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
  for (let k = 1; k <= 120; k++) fc.emit('pointermove', pe(1, k, -k));
  eq(fm, 120, 'every pointermove reaches move() synchronously (no throttling)');
  fc.emit('pointerup', pe(1, 0, 0));


  // coalesced samples: every sample of one pointermove reaches move() in order; repeats dropped; the parent's id is trusted
  const cc = new El('canvas'), cm = [];
  const hCc = IN.attach(cc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down() {}, move: (x, y) => cm.push(x + ':' + y), up() {}, cancel() {} });
  cc.emit('pointerdown', pe(1, 0, 0));
  const co1 = pe(1, 30, 3, { getCoalescedEvents() { return [{ clientX: 10, clientY: 1, pointerId: 99 }, { clientX: 20, clientY: 2, pointerId: 99 }, { clientX: 30, clientY: 3, pointerId: 99 }]; } });
  cc.emit('pointermove', co1);
  ok(co1.prevented, 'coalesced pointermove preventDefault (no scroll while tracing)');
  eq(cm.join(','), '10:1,20:2,30:3', 'coalesced samples delivered in order (Safari 18.2 wrong coalesced pointerId ignored)');
  cc.emit('pointermove', pe(1, 30, 3, { getCoalescedEvents() { return []; } }));
  eq(cm.length, 3, 'a repeat of the last point is dropped (empty coalesced list → the event itself)');
  cc.emit('pointermove', pe(1, 40, 4, { getCoalescedEvents() { throw new Error('nope'); } }));
  eq(cm.slice(-1)[0], '40:4', 'getCoalescedEvents throwing → the event point');
  cc.emit('pointermove', pe(2, 99, 99, { isPrimary: false, getCoalescedEvents() { return [{ clientX: 98, clientY: 98 }]; } }));
  eq(cm.length, 4, 'another finger\'s coalesced moves are ignored');
  IN.COALESCE = false;
  cc.emit('pointermove', pe(1, 60, 6, { getCoalescedEvents() { return [{ clientX: 50, clientY: 5 }, { clientX: 60, clientY: 6 }]; } }));
  eq(cm.slice(-1)[0] + '|' + cm.length, '60:6|5', 'Input.COALESCE = false → one move per event');
  IN.COALESCE = true;
  cc.emit('pointerup', pe(1, 60, 6));
  const stt = hCc.stats();
  ok(stt.downs === 1 && stt.ups === 1 && stt.moves === 5 && stt.coalesced === 2, 'detach.stats counts downs / moves / coalesced / ups: ' + JSON.stringify(stt));
  // a long continuous trace: 600 moves of one finger, each delivered (no throttling), then one up
  const lc = new El('canvas'); const lseq = [];
  IN.attach(lc, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down: () => lseq.push('d'), move: () => lseq.push('m'), up: () => lseq.push('u'), cancel: () => lseq.push('c') });
  lc.emit('pointerdown', pe(5, 0, 0));
  for (let k = 1; k <= 600; k++) lc.emit('pointermove', pe(5, k % 97, Math.floor(k / 97) + k * 0.25));
  lc.emit('pointerup', pe(5, 1, 1));
  eq(lseq.length, 602, 'a 600-sample trace: down + 600 moves + up');
  ok(lseq[0] === 'd' && lseq[601] === 'u' && lseq.slice(1, 601).every(x => x === 'm'), 'trace order: down, moves…, up');
  // a mid-trace rotation (detach.cancel) → cancel once; the next stroke continues normally
  const rr = new El('canvas'); const rseq = [];
  const hRr = IN.attach(rr, { toLogical: (cx, cy) => ({ x: cx, y: cy }), down: () => rseq.push('d'), move: () => rseq.push('m'), up: () => rseq.push('u'), cancel: () => rseq.push('c') });
  rr.emit('pointerdown', pe(6, 0, 0)); rr.emit('pointermove', pe(6, 5, 5)); hRr.cancel(); rr.emit('pointermove', pe(6, 9, 9)); rr.emit('pointerup', pe(6, 9, 9));
  rr.emit('pointerdown', pe(7, 0, 0)); rr.emit('pointermove', pe(7, 3, 3)); rr.emit('pointerup', pe(7, 3, 3));
  eq(rseq.join(''), 'dmcdmu', 'rotation mid-trace: d m c, then a fresh stroke d m u');

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
  tcalls.length = 0;
  tc.emit('touchstart', te([5], [5]));
  const tm = (x) => ({ target: tc, cancelable: true, preventDefault() {}, touches: [{ identifier: 5, clientX: x, clientY: 1 }], changedTouches: [{ identifier: 5, clientX: x, clientY: 1 }] });
  for (let k = 1; k <= 10; k++) tc.emit('touchmove', tm(k));
  tc.emit('touchmove', tm(10));
  tc.emit('touchend', te([], [5]));
  eq(tcalls.map(c => c[0]).join(','), 'down,' + Array(10).fill('move').join(',') + ',up', 'touch fallback: continuous moves, repeats dropped');
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.25) < 1e-9, 'Tumi: rate 0.9, pitch 1.25');
  ok(V2.RATE === 0.9 && V2.PITCH === 1.25, 'Voice.RATE / PITCH exported');
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
  V2.say('Find the sign with letter B!'); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Find the sign with letter bee!', 'speech() applied to the utterance');
  ok(V2.log.some(e => e.text === 'Find the sign with letter B!'), 'log keeps the display text');
  E.end(); await wait(10);
  // vi "Tumi" is spoken "Tu Mi"; the bubble text (onStart, log) keeps "Tumi"
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là Tumi. Tumi giúp bé nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là Tu Mi. Tu Mi giúp bé nhé!', 'vi utterance says "Tu Mi"');
  eq(startText, 'Mình là Tumi. Tumi giúp bé nhé!', 'onStart gets the display text');
  E.end(); await dv;
  const ev = V2.say('Hi! I am Tumi.', { lang: 'en' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Hi! I am Tumi.', 'en utterance says "Tumi" as written');
  E.end(); await ev;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animals', { animal: 'dog' }, { lang: 'vi' });
  ok(/con chó/i.test(sk.text) && /Gâu gâu!/.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'home', ['kennel', 'hive', 'nest']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the beehive')] });
  eq((await pr2).id, 'hive', 'interim match resolves after a short wait');
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


// ------------------------------------------------------------------ kidProof: extra finger blocked only on the game
(function () {
  section('kidProof: a second finger on a button keeps its click; on the game it is blocked');
  function El(tag, id, cls) { this.nodeType = 1; this.tag = tag; this.id = id || ''; this.cls = cls || ''; this.parentElement = null; }
  El.prototype.matches = function (sel) {
    return sel.split(',').map(x => x.trim()).some(x => x === this.tag || (x[0] === '.' && this.cls.split(' ').includes(x.slice(1))) ||
      (x[0] === '#' && this.id === x.slice(1)) || (x === '[role="button"]' && this.role === 'button'));
  };
  const H = {};
  const doc = { addEventListener(t, f) { (H[t] = H[t] || []).push(f); }, createElement() { return {}; }, head: { appendChild() {} } };
  const sbk = makeSandbox({ document: doc, addEventListener() {} });
  sbk.FT = {};
  const INk = load(sbk, ['input.js']).Input;
  INk.kidProof(); INk.kidProof();
  eq((H.touchstart || []).length, 1, 'kidProof is idempotent');
  const ts = (target, n) => { const e = { target, touches: Array(n).fill({}), cancelable: true, preventDefault() { this.prevented = true; } }; H.touchstart.forEach(f => f(e)); return !!e.prevented; };
  const canvas = new El('canvas', 'game'), btn = new El('button', 'btnPause'), svg = new El('svg'); svg.parentElement = btn;
  const scr = new El('div', 'scrTalk', 'screen'), choice = new El('div', '', 'talk-choice'); choice.parentElement = scr;
  const hudSpan = new El('span'); hudSpan.parentElement = new El('div', 'hud');
  ok(ts(canvas, 2), 'second finger on the canvas: blocked (no zoom, no stray gesture)');
  ok(!ts(canvas, 1), 'one finger on the canvas: not blocked by kidProof (Input handles it)');
  ok(!ts(btn, 2), 'second finger on ⏸ (a button): click kept');
  ok(!ts(svg, 2), 'second finger on the icon inside a button: click kept');
  ok(!ts(choice, 2), 'second finger on a Talk-time answer inside .screen: kept');
  ok(!ts(hudSpan, 2), 'second finger on the HUD: kept');
  ok(!ts(new El('label'), 2) && !ts(new El('input'), 2), 'labels / inputs: kept');
  eq(INk.UI_TARGETS, 'button, input, label, select, textarea, a, [role="button"], .screen, #hud, .no-game-input', 'UI_TARGETS selector');
})();

Promise.all(asyncTests).then(() => {
  console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, (e) => { console.log('FAIL  async error: ' + (e && e.stack)); process.exit(1); });
