#!/usr/bin/env node
// Rio's Singing Eggs — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/dragon-egg-tunes:   node tests/unit/i18n_voice.test.js
// Self-contained: the value lists come from docs/DESIGN.md (§5.1 content, §6 voice). When the eggs content.js has the
// new baby animals (SE.Content making rounds with `eggs` of the kinds egg / shape / big / dots / animal / glyph), every
// prompt / Talk key + params it produces and every egg are checked too.
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
  return sb.SE;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }
const NEG_EN = /\b(no|not|wrong|bad|fail|failed|incorrect|oh no|mistake|oops|fall|fell|broke|broken|sorry|nope)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|dở|tệ|hỏng|không đúng|chưa đúng|trật|sai rồi|đổ|ngã|rơi mất|không phải|nhầm)([\s,.!?]|$)/iu;
function positive(s) { return !NEG_EN.test(s) && !NEG_VI.test(String(s).toLowerCase()); }
const r0 = () => 0, r5 = () => 0.5, r9 = () => 0.99;
function clean(s) {
  return typeof s === 'string' && s.trim().length > 0 && s.indexOf('{') < 0 && s.indexOf('}') < 0 &&
    !/undefined|null|NaN|\[object/.test(s) && !/\s[!?.,]/.test(s) && !/^[!?.,—]/.test(s) && !/_/.test(s) && !/\s{2}/.test(s) &&
    !/màu màu/i.test(s) && !/\bthe the\b/i.test(s) && !/\bcon con\b/.test(s) && !/\ba the\b|\bthe a\b/i.test(s) &&
    !/trứng trứng|quả quả|cái cái|hình hình|\begg egg\b|chấm chấm/i.test(s) && !/\ba [aeiou]/i.test(s.replace(/letter a /ig, ''));
}
const placeholders = (v) => [...new Set([].concat(v).join(' ').match(/\{\w+\}/g) || [])].filter(x => x !== '{child}').sort().join(',');
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
// words of the wind-chime game two copies back: none may be left (source or text)
const OLD_EN = /\b(bells?|chimes?|ring|rings|ringing|rung|campfire|monkey|mountains?|hedgehog|spiky|ding|ding-dong|beam|lanterns? by)\b/i;
const OLD_VI = /khỉ|chuông|lửa trại|núi|đèn lồng|nhím|leng keng|đinh đoong|(^|[\s,.!?])rung([\s,.!?]|$)/i;
// words of Bibi's Cloud Drums (the game this one was copied from) + the mechanical rename's leftovers: none in any line
const DRUM_EN = /\b(drums?|drumm\w*|drumsticks?|cymbals?|puppy|puppies|lambs?|clouds?|cloud land|booms?|woof|tsss|crash|eggm\w*|cow|moo|kitty|cat|pig|oink|sheep|baa|hen|cluck|mouse|squeak|star lanterns?)\b/i;
const DRUM_VI = /trống|cún|cừu|xoảng|xủng|bùm|gâu|mây|con bò|ùm bò|con mèo|meo meo|con heo|ụt ịt|gà mái|cục tác|chuột|chít chít|đèn ngôi sao/i;

// ------------------------------------------------------------------ DESIGN value lists (§5.1, §6)
const ANIMALS = ['duck', 'chick', 'owl', 'frog', 'dino', 'snake'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ANIMAL_EN = { duck: 'duckling', chick: 'chick', owl: 'owlet', frog: 'baby frog', dino: 'baby dino', snake: 'baby snake' };
const ANIMAL_VI = { duck: 'vịt con', chick: 'gà con', owl: 'cú con', frog: 'ếch con', dino: 'khủng long con', snake: 'rắn con' };
const SOUND_EN = { duck: 'quack', chick: 'peep', owl: 'hoot', frog: 'ribbit', dino: 'rawr', snake: 'hiss' };
const SOUND_VI = { duck: 'cạp cạp', chick: 'chíp chíp', owl: 'hù hù', frog: 'ộp ộp', dino: 'gừ gừ', snake: 'xì xì' };
const SHAPE_VI = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
  rect: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };
// the new keys of the copy-my-tune flow (DESIGN §6)
const TUNE_KEYS = ['demo.start', 'demo.replay', 'demo.beat', 'demo.note', 'demo.animal', 'turn.first', 'turn.firstName',
  'turn.next', 'turn.beat', 'wrong.again', 'wrong.againAnimal', 'wrong.againCount', 'wrong.againParity', 'wrong.againInitial',
  'wrong.againAny'];

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.SE = { debug: { voiceLog: [] } };
let SE;
try { SE = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = SE.I18N, V = SE.Voice;
for (const f of ['i18n.js', 'voice.js', 'input.js']) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  ok(!/\(\?<[=!]/.test(src), `${f} has no regex look-behind (SyntaxError on iOS < 16.4)`);
  ok(!/\bPom\b|Puzzle Town|jigsaw|elephant|\bBun\b|Dino Dig|DD\.|\bKiki\b|Camp Chimes|Cloud Drums|Cloud Eggs|\bBibi\b/i.test(src), `${f}: no sister-game names left`);
  ok(!/monkey|hedgehog|campfire|khỉ|chuông/i.test(src), `${f}: no chime-game words (monkey / hedgehog / campfire / khỉ / chuông)`);
  ok(!/drum|puppy|eggm|trống|\bcún\b|Cún/i.test(src), `${f}: no drum-game words (drum / puppy / eggming / trống / cún)`);
}
{ // the whole i18n.js source is free of the chime game's words
  const src = fs.readFileSync(path.join(JS, 'i18n.js'), 'utf8');
  src.split('\n').forEach((ln, i) => {
    ok(!OLD_EN.test(ln) && !OLD_VI.test(ln), `i18n.js:${i + 1} has no chime-game word: ${ln.trim().slice(0, 100)}`);
  });
}
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN list');
eq(JSON.stringify(I.SHAPES), JSON.stringify(SHAPES), 'I18N.SHAPES = DESIGN list');
eq(JSON.stringify(I.COLORS), JSON.stringify(COLORS), 'I18N.COLORS = DESIGN list');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS = the 11 topics');
eq(JSON.stringify(I.EGG_KINDS), JSON.stringify(['egg', 'shape', 'big', 'dots', 'animal', 'glyph']), 'EGG_KINDS = DESIGN §4.2 kinds');
for (const k of ['color', 'shape', 'size', 'animal', 'number', 'letter', 'sum', 'diff', 'parity', 'word', 'sound', 'egg', 'dots'])
  ok(I.NAME_KINDS.includes(k), `name kind ${k}`);
for (const fn of ['t', 'ask', 'name', 'words', 'choiceWords', 'eggPhrase', 'piecePhrase', 'phrase', 'sayName', 'sayRight', 'sayWrong',
  'sayPickup', 'sayTap', 'sayPlaced', 'sayCount', 'sayCountRun', 'sayCountDone', 'sayBeatNudge', 'talkWrong', 'speech', 'setChild',
  'has', 'keys', 'raw', 'initialOf', 'kindValue', 'soundOf', 'demoName', 'sayDemo', 'sayDemoStart', 'sayNext', 'sayTurn'])
  ok(typeof I[fn] === 'function', `I18N.${fn} is a function`);

// the eggs content.js (written by the mechanics engineer, in parallel): loaded once it has the new baby animals
let contentSB = null;
if (fs.existsSync(path.join(JS, 'content.js'))) {
  try {
    const csrc = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
    if (/eggs/.test(csrc) && /'big'/.test(csrc) && /SE\.ANIMALS = \[[^\]]*'dino'/.test(csrc) && !/SE\.ANIMALS = \[[^\]]*'cow'/.test(csrc)) {
      const sbc = makeSandbox(); sbc.SE = {};
      load(sbc, ['rng.js', 'i18n.js', 'content.js'].filter(f => fs.existsSync(path.join(JS, f))));
      if (sbc.SE.Content && sbc.SE.Content.makeRound) contentSB = sbc;
    }
  } catch (e) { ok(false, 'content.js load: ' + e.message); }
}
console.log(`   (${contentSB ? 'eggs content.js loaded' : 'content.js still has the old farm animals — content checks skipped'})`);
const C_ANIMALS = contentSB && contentSB.SE.ANIMALS ? Array.from(contentSB.SE.ANIMALS) : ANIMALS;
const C_SHAPES = contentSB && contentSB.SE.SHAPES ? Array.from(contentSB.SE.SHAPES) : SHAPES;
const C_COLORS = contentSB && contentSB.SE.COLORS ? Array.from(contentSB.SE.COLORS) : COLORS;
for (const a of C_ANIMALS) ok(I.ANIMALS.includes(a), `content animal ${a} has names`);
for (const s of C_SHAPES) ok(I.SHAPES.includes(s), `content shape ${s} has names`);
for (const c of C_COLORS) ok(I.COLORS.includes(c), `content colour ${c} has names`);
// every animal has a name, a word, a sound and an initial in both languages (the 'first letter' topic uses them)
for (const a of ANIMALS) for (const lang of I.langs) {
  ok(clean(I.name(lang, 'animal', a)) && clean(I.name(lang, 'word', a)) && clean(I.name(lang, 'sound', a)), `${lang} ${a}: name, word, sound`);
  const ini = I.initialOf(lang, a);
  ok(ini && /^\p{Lu}$/u.test(ini.first) && ini.word === I.name(lang, 'word', a), `${lang} ${a}: initial ${ini && ini.first} of "${ini && ini.word}"`);
}

// ------------------------------------------------------------------ keys
section('keys exist in both languages, with the same params');
const UI = ['title', 'logo1', 'logo2', 'subtitle', 'tagline', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings',
  'holdForParents', 'age', 'years', 'language', 'name', 'namePlaceholder', 'sound', 'music', 'volume', 'voice', 'mic', 'done',
  'stars', 'chapter', 'allDone', 'welcome', 'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening',
  'tapRio', 'tapHint', 'swipeHint', 'quieter', 'louder', 'skip', 'gallery', 'langName.en', 'langName.vi'];
// every data-i18n / T('…') this game's index.html, ui.js and main.js use must exist
const usedUi = new Set();
const OLD_GAME_KEYS = /^(surprise\.(pigeon|bubbles|mole|ptero)|pigeon\.|bubble\.|mole\.|ptero\.|ui\.tapPom)/;
for (const f of ['index.html', 'js/ui.js', 'js/main.js']) {
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, 'game', f), 'utf8'); } catch (e) { continue; }
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="(ui\.[\w.]+)"/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/T1?\((?:lang, )?'(ui\.[\w.]+)'/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/'((?:ui|talk|topic|weather|surprise|session|lamb|bird|firefly|rio|cymbal|demo|turn)\.[\w.]+)'/g)) usedUi.add(m[1]);
  for (const m of src.matchAll(/T1?\('(beatNudge|songShort|songDone|song|enter|hint|idle|praise|great|party|lantern|stepDone)'/g)) usedUi.add(m[1]);
}
ok(usedUi.size >= 10, 'found the keys index.html / ui.js / main.js use (' + usedUi.size + ')');
const usedNow = [...usedUi].filter(k => !OLD_GAME_KEYS.test(k) && !/\.$/.test(k));
const PROMPT_KEYS = Object.keys(I.PROMPTS);
eq(PROMPT_KEYS.slice().sort().join(','), ['p.colors', 'p.shapes', 'p.shapes5', 'p.size', 'p.animals', 'p.beat', 'p.count', 'p.letters',
  'p.lower', 'p.initial', 'p.add', 'p.sub', 'p.oddeven'].sort().join(','), 'PROMPTS = the DESIGN §6 prompt keys (+ p.beat)');
const LINE_KEYS = ['p.any', 'p.next', 'p.sizeAny', 'name.say', 'tap', 'right', 'right.label', 'right.animal', 'right.beat',
  'right.parity', 'right.initial', 'right.sum', 'right.any', 'countDone', 'beatNudge', 'lantern', 'wrong.thing', 'wrong.animal',
  'wrong.count', 'wrong.math', 'wrong.parity', 'wrong.initial', 'wrong.any', 'stepDone', 'song', 'songShort', 'songDone',
  'cymbal.tap', 'enter', 'hint', 'idle', 'praise', 'great', 'party', 'surprise.lamb', 'lamb.tap', 'surprise.bird', 'bird.tap',
  'surprise.fireflies', 'firefly.tap', 'rio.poke', 'session.done'].concat(TUNE_KEYS);
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
// no jigsaw / chime / drum words left in any line
for (const k of enKeys) ok(!/placed|pickup|nearMiss|alive|toot|pigeon|bubble|string|plate|bell/i.test(k), `no old-game key: ${k}`);
for (const lang of I.langs) for (const k of I.keys(lang)) for (const s of [].concat(I.raw(lang, k))) {
  ok(!/\bPom\b|puzzle|\bpiece|shadow|\bfits?\b|picture is|pigeon|mảnh|ghép|cái bóng|bồ câu|vừa khít|\bcạch\b/i.test(s) || /^ui\.(micUnsupported|micDenied)$/.test(k),
    `${lang} ${k}: no jigsaw words: ${s}`);
  ok(!OLD_EN.test(s) && !OLD_VI.test(s), `${lang} ${k}: no chime-game words: ${s}`);
  ok(!DRUM_EN.test(s) && !DRUM_VI.test(s), `${lang} ${k}: no drum / puppy / cymbal / cloud / lamb / farm-animal words: ${s}`);
}
// instructions and reactions have 3 wordings
for (const lang of I.langs) for (const k of PROMPT_KEYS.concat(['p.any', 'p.next', 'p.sizeAny', 'enter', 'tap', 'right', 'right.label',
  'right.animal', 'right.beat', 'right.parity', 'right.initial', 'right.sum', 'right.any', 'countDone', 'beatNudge', 'lantern',
  'wrong.thing', 'wrong.animal', 'wrong.count', 'wrong.math', 'wrong.parity', 'wrong.initial', 'wrong.any', 'stepDone', 'song',
  'songShort', 'songDone', 'cymbal.tap', 'hint', 'idle', 'surprise.lamb', 'lamb.tap', 'surprise.bird', 'bird.tap',
  'surprise.fireflies', 'firefly.tap', 'rio.poke', 'session.done', 'party', 'praise', 'great'],
  TUNE_KEYS.filter(k => !/^demo\.(note|animal)$/.test(k))))
  ok([].concat(I.raw(lang, k)).length >= (/^(wrong\.again|demo\.start)$/.test(k) ? 2 : 3), `${lang} ${k}: 3 wordings (2 for the short wrong.again / demo.start: playtest)`);
for (const lang of I.langs) for (const k of TOPICS.map(t => 'topic.' + t)) ok(!Array.isArray(I.raw(lang, k)), `${lang} ${k} is one banner string`);
// short lines (≤ ~4.5 s spoken at rate 0.9 ≈ 11 words) for everything Rio says during play
for (const lang of I.langs) for (const k of I.keys(lang)) if (!/^(ui|talk)\./.test(k))
  for (const s of [].concat(I.raw(lang, k))) ok(s.split(/\s+/).length <= (lang === 'vi' ? 15 : 11), `${lang} ${k} short enough: ${s}`);
// tune lines are very short (they fit between two notes / before the child starts)
for (const lang of I.langs) for (const k of ['demo.start', 'demo.replay', 'demo.beat', 'turn.first', 'turn.next', 'turn.firstName', 'wrong.againAny'])
  for (const s of [].concat(I.raw(lang, k))) ok(s.split(/\s+/).length <= 6, `${lang} ${k} ≤ 6 words: ${s}`);

section('titles, Rio, Vietnamese warmth and diacritics');
eq(I.t('en', 'ui.title'), 'Rio’s Singing Eggs', 'en title');
eq(I.t('en', 'ui.logo1'), 'Rio’s', 'en logo line 1');
eq(I.t('en', 'ui.logo2'), 'Singing Eggs', 'en logo line 2');
eq(I.t('vi', 'ui.logo1'), 'Rồng Rio', 'vi logo line 1 (DESIGN)');
eq(I.t('vi', 'ui.logo2'), 'Trứng Biết Hát', 'vi logo line 2 (DESIGN)');
eq(I.t('vi', 'ui.title'), 'Trứng Biết Hát Của Rồng Rio', 'vi title (REQUIREMENT)');
eq(I.t('en', 'ui.voice'), 'Rio’s voice', 'voice setting names Rio');
eq(I.t('vi', 'ui.voice'), 'Giọng của Rio', 'vi voice setting names Rio');
ok(/Rio/.test(I.t('en', 'ui.tapRio')) && /Rio/.test(I.t('vi', 'ui.tapRio')), 'ui.tapRio names Rio');
eq(I.t('en', 'ui.volume'), 'Volume', 'ui.volume');
eq(I.t('vi', 'ui.volume'), 'Âm lượng', 'vi ui.volume');
eq(I.t('en', 'ui.listening'), 'Rio is listening…', 'ui.listening');
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /Bé ơi/.test(s)), `vi ${k}: a warm "Bé ơi" wording`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /nhé|nào|nha/.test(s)), `vi ${k}: "nhé / nào"`);
for (const k of ['p.colors', 'p.shapes', 'p.size', 'p.beat', 'p.count', 'hint', 'turn.beat'])
  ok([].concat(I.raw('vi', k)).some(s => /quả trứng/i.test(s)), `vi ${k}: says "quả trứng"`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('en', k)).some(s => /\btap\b/i.test(s)), `en ${k}: says tap`);
for (const k of PROMPT_KEYS) ok([].concat(I.raw('vi', k)).some(s => /gõ|chạm/.test(s)), `vi ${k}: says "gõ / chạm"`);
for (const k of I.keys('vi')) if (!/^ui\.langName|^name\.say$|^demo\.(note|animal)$/.test(k))
  ok(JSON.stringify(I.raw('vi', k)) !== JSON.stringify(I.raw('en', k)), `vi ${k} is translated`);
for (const k of I.keys('vi')) if (!/^ui\.langName|^count\.|^ui\.(chapter|years)$|^name\.say$/.test(k))
  for (const s of [].concat(I.raw('vi', k))) if (/[a-z]{3}/i.test(s.replace(/\{\w+\}/g, '')) && s.replace(/\{\w+\}/g, '').trim().split(/\s+/).length >= 2)
    ok(VI_DIACRITIC.test(s), `vi ${k} has Vietnamese diacritics: ${s}`);
for (const k of ['p.colors', 'p.count', 'p.beat', 'p.animals', 'right', 'wrong.thing', 'wrong.again', 'song', 'demo.start', 'turn.first'])
  ok([].concat(I.raw('en', k)).every(s => !VI_DIACRITIC.test(s)), `en ${k} has no Vietnamese text`);
// Rio is a dragon: "Rồng Rio" in VI titles, "Rio" in lines
ok(/Rồng Rio/.test(I.t('vi', 'ui.title')), 'vi title: "Rồng Rio"');
for (const k of I.keys('vi')) if (!/^ui\.(title|logo1)$/.test(k)) for (const s of [].concat(I.raw('vi', k)))
  ok(!/Rồng Rio/.test(s), `vi ${k}: lines say "Rio", not "Rồng Rio": ${s}`);
ok(/dragon/.test(I.t('en', 'ui.welcome')) && /rồng/.test(I.t('vi', 'ui.welcome')), 'welcome: Rio is a little dragon');

section('no negative words in any line');
for (const lang of I.langs) for (const k of I.keys(lang)) {
  if (/^ui\./.test(k)) continue;
  for (const s of [].concat(I.raw(lang, k))) ok(positive(s), `${lang} ${k} is positive: ${s}`);
}

section('every string renders, no "{" left, no "màu màu"');
const SAMPLE = { n: 3, i: 2, a: 2, b: 4, stars: 7, color: 'red', shape: 'star', size: 'big', animal: 'duck', sound: 'quack', gotSound: 'peep',
  letter: 'B', lower: 'b', word: 'duck', first: 'D', expr: '2+3', ans: 'five', num: 'seven', parity: 'odd', label: 'letter B',
  thing: { kind: 'egg', color: 'blue' }, got: { nameKind: 'shape', nameValue: 'circle' }, name: 'blue',
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
eq(I.t('en', 'ui.welcome'), 'Hi Mai! I am Rio, a little dragon. Let’s sing with the eggs!', 'welcome with the child name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé Mai! Mình là Rio, chú rồng nhỏ. Mình cùng hát với trứng nhé!', 'vi welcome with the child name');
eq(I.t('en', 'great', null, r0), 'Beautiful singing, Mai!', 'great with the name');
eq(I.t('vi', 'great', null, r0), 'Bé Mai hát hay quá!', 'vi great with the name');
eq(I.t('en', 'songDone', null, () => 0.3), 'What a singer, Mai!', 'songDone "What a singer, {child}!" (DESIGN)');
eq(I.t('vi', 'songDone', null, () => 0.3), 'Mai hát hay quá!', 'vi songDone "{child} hát hay quá!" (REQUIREMENT)');
I.setChild('');
eq(I.t('en', 'ui.welcome'), 'Hi! I am Rio, a little dragon. Let’s sing with the eggs!', 'welcome without a name');
eq(I.t('vi', 'ui.welcome'), 'Chào bé! Mình là Rio, chú rồng nhỏ. Mình cùng hát với trứng nhé!', 'vi welcome without a name');
eq(I.t('en', 'great', { child: '' }, r0), 'What a music star!', 'great without a name skips {child} variants');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'ui.chapter');
eq(I.t('vi', 'ui.chapter', { n: 2 }), 'Chương 2', 'vi ui.chapter');
eq(I.t('vi', 'session.done', { stars: 12 }, r0), 'Một ngày âm nhạc tuyệt quá! 12 ngôi sao!', 'vi session.done');
eq(I.t('en', 'session.done', { stars: 12 }, r0), 'What a music day! 12 stars! Hooray!', 'en session.done');
eq(I.t('en', 'weather.0'), 'Good morning, dino valley!', 'weather.0 morning (DESIGN)');
eq(I.t('en', 'weather.1'), 'Sunny noon!', 'weather.1 noon (DESIGN)');
eq(I.t('en', 'weather.2'), 'Sunset in the valley!', 'weather.2 sunset (DESIGN)');
eq(I.t('en', 'weather.3'), 'Starry night!', 'weather.3 night (DESIGN)');
ok(/sáng/.test(I.t('vi', 'weather.0')) && /thung lũng/.test(I.t('vi', 'weather.0')) && /trưa/.test(I.t('vi', 'weather.1')) &&
  /hoàng hôn/i.test(I.t('vi', 'weather.2')) && /sao/.test(I.t('vi', 'weather.3')), 'vi day moods in the valley');
eq(I.t('en', 'enter', null, r0), 'Here come the eggs!', 'enter');
eq(I.t('en', 'song', null, r0), 'Let’s sing it together — tap an egg!', 'song (DESIGN)');
eq(I.t('vi', 'song', null, r0), 'Mình cùng hát nào! Bé gõ trứng nhé!', 'vi song (REQUIREMENT "Mình cùng hát nào!")');
for (const s of [].concat(I.raw('vi', 'song'))) ok(s.split(/\s+/).length <= 10, `vi song ≤ 10 words (≈ 2.5 s): ${s}`);
for (const lang of I.langs) for (const s of [].concat(I.raw(lang, 'songShort'))) ok(s.split(/\s+/).length <= 3, `${lang} songShort very short: ${s}`);
eq(I.t('en', 'songDone', null, r0), 'What a singer!', 'songDone');
eq(I.t('vi', 'songDone', null, r0), 'Bé hát hay quá!', 'vi songDone without a name');
eq(I.t('en', 'songShort', null, r0), 'Sing it!', 'songShort');
eq(I.t('en', 'cymbal.tap', null, r0), 'Puff!', 'cymbal.tap = the volcano puff (DESIGN)');
eq(I.t('vi', 'cymbal.tap', null, r0), 'Phù!', 'vi cymbal.tap');
ok([].concat(I.raw('en', 'cymbal.tap')).every(s => s.length <= 14) && [].concat(I.raw('vi', 'cymbal.tap')).every(s => s.length <= 20), 'volcano taps are short');
eq(I.t('en', 'right.any', null, r0), 'Yes! Lovely!', 'right.any');
eq(I.t('vi', 'right.any', null, r0), 'Đúng rồi! Hay quá!', 'vi right.any');
eq(I.t('en', 'topic.colors'), 'Colour Eggs', 'topic banner');
eq(I.t('vi', 'topic.colors'), 'Trứng sắc màu', 'vi topic banner');
eq(I.t('en', 'p.nonsense', null, r0), I.t('en', 'p.any', null, r0), 'unknown prompt key → p.any');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key → the key');
for (const k of ['surprise.lamb']) for (const lang of I.langs)
  ok([].concat(I.raw(lang, k)).some(s => /triceratops|ba sừng/i.test(s)), `${lang} ${k} names the baby triceratops`);
eq(I.t('en', 'surprise.lamb', null, r0), 'Look! A baby triceratops!', 'surprise.lamb (DESIGN)');
eq(I.t('en', 'lamb.tap', null, r0), 'Rawr! Hello!', 'lamb.tap (DESIGN)');
for (const k of ['surprise.bird']) for (const lang of I.langs) ok([].concat(I.raw(lang, k)).some(s => /bird|chim/i.test(s)), `${lang} ${k} names the bird`);
for (const lang of I.langs) ok([].concat(I.raw(lang, 'surprise.fireflies')).every(s => /firefl|đom đóm/i.test(s)), `${lang} fireflies are fireflies`);
eq(I.t('en', 'surprise.fireflies', null, r0), 'Fireflies came to listen!', 'surprise.fireflies (DESIGN)');
for (const lang of I.langs) ok([].concat(I.raw(lang, 'lantern')).some(s => /flower|pod|hoa/i.test(s)), `${lang} lantern = a seed pod blooming`);

section('the tune: demo.start / replay, sayDemo, sayNext, sayTurn (DESIGN §5.2 / §6)');
eq(I.t('en', 'demo.start', null, r0), 'Listen to my tune!', 'demo.start (DESIGN)');
eq(I.t('vi', 'demo.start', null, r0), 'Bé nghe Rio hát nhé!', 'vi demo.start (DESIGN)');
eq(I.t('en', 'demo.replay', null, r0), 'Listen again!', 'demo.replay (DESIGN)');
eq(I.t('vi', 'demo.replay', null, r0), 'Bé nghe lại nhé!', 'vi demo.replay (DESIGN)');
eq(I.t('en', 'turn.first', null, r0), 'Your turn!', 'turn.first (DESIGN)');
eq(I.t('vi', 'turn.first', null, r0), 'Đến lượt bé rồi!', 'vi turn.first (DESIGN)');
eq(I.t('en', 'turn.beat', { n: 3 }, r0), 'Your turn — tap the big egg three times!', 'turn.beat (DESIGN)');
eq(I.t('vi', 'turn.beat', { n: 3 }, r0), 'Đến lượt bé — gõ quả trứng to ba cái nhé!', 'vi turn.beat (DESIGN)');
eq(I.t('en', 'turn.beat', { n: 1 }, r0), 'Your turn — tap the big egg once!', 'turn.beat once');
eq(I.t('en', 'turn.beat', {}, r0), 'Your turn!', 'turn.beat without n → turn.first');
eq(I.t('en', 'turn.next', { name: 'blue' }, r0), '…and blue!', 'turn.next (DESIGN)');
eq(I.t('vi', 'turn.next', { name: 'màu xanh dương' }, r0), '…rồi màu xanh dương!', 'vi turn.next (REQUIREMENT)');
eq(I.sayDemoStart('en', { type: 'demoStart', from: 0, n: 2, replay: false }, r0), 'Listen to my tune!', 'sayDemoStart');
eq(I.sayDemoStart('vi', { type: 'demoStart', from: 1, n: 1, replay: true }, r0), 'Bé nghe lại nhé!', 'sayDemoStart replay vi');
eq(I.sayDemoStart('en', { type: 'demoStart', mode: 'beat' }, r0), 'Count with me!', 'sayDemoStart beat demo');
// sayDemo: just the name; animals = sound + name (DESIGN §6 / REQUIREMENT)
const DEMO_CASES = [
  ['color', 'red', 'Red!', 'Màu đỏ!'], ['color', 'blue', 'Blue!', 'Màu xanh dương!'],
  ['shape', 'star', 'The star!', 'Ngôi sao!'], ['shape', 'circle', 'The circle!', 'Hình tròn!'], ['shape', 'oval', 'The oval!', 'Hình bầu dục!'],
  ['size', 'big', 'The big egg!', 'Quả trứng to!'], ['size', 'small', 'The small egg!', 'Quả trứng nhỏ!'],
  ['animal', 'duck', 'Quack! The duckling!', 'Cạp cạp! Vịt con!'], ['animal', 'chick', 'Peep! The chick!', 'Chíp chíp! Gà con!'],
  ['animal', 'owl', 'Hoot! The owlet!', 'Hù hù! Cú con!'], ['animal', 'frog', 'Ribbit! The baby frog!', 'Ộp ộp! Ếch con!'],
  ['animal', 'dino', 'Rawr! The baby dino!', 'Gừ gừ! Khủng long con!'], ['animal', 'snake', 'Hiss! The baby snake!', 'Xì xì! Rắn con!'],
  ['number', 7, 'Seven!', 'Bảy!'], ['letter', 'B', 'Letter B!', 'Chữ B!'], ['letter', 'g', 'Small g!', 'Chữ g thường!'],
  ['parity', 'odd', 'Odd!', 'Lẻ!']];
for (const [k, v, en, vi] of DEMO_CASES) {
  eq(I.sayDemo('en', k, v), en, `sayDemo en ${k} ${v}`);
  eq(I.sayDemo('vi', k, v), vi, `sayDemo vi ${k} ${v}`);
}
// the demoNote event form (main adds thing / topic / params / promptKey)
eq(I.sayDemo('en', { type: 'demoNote', nameKind: 'number', nameValue: 7, topic: 'count', promptKey: 'p.count', params: { n: 7, kind: 'dots' } }), 'Seven dots!', 'sayDemo dots egg');
eq(I.sayDemo('vi', { type: 'demoNote', thing: { kind: 'dots', n: 4, nameKind: 'number', nameValue: 4 } }), 'Bốn chấm!', 'sayDemo vi dots thing');
eq(I.sayDemo('en', { nameKind: 'shape', nameValue: 'star', promptKey: 'p.shapes5', params: { shape: 'star', color: 'blue' } }), 'The blue star!', 'sayDemo shapes5 says the colour');
eq(I.sayDemo('en', { nameKind: 'shape', nameValue: 'oval', promptKey: 'p.shapes5', params: { shape: 'oval', color: 'orange' } }), 'The orange oval!', 'sayDemo shapes5 "orange oval"');
eq(I.sayDemo('vi', { nameKind: 'shape', nameValue: 'star', promptKey: 'p.shapes5', params: { shape: 'star', color: 'blue' } }), 'Ngôi sao màu xanh dương!', 'sayDemo vi shapes5');
eq(I.sayDemo('en', { nameKind: 'shape', nameValue: 'star', promptKey: 'p.shapes', params: { shape: 'star', color: 'blue' } }), 'The star!', 'sayDemo p.shapes: no colour');
eq(I.sayDemo('en', { thing: { kind: 'egg', color: 'red', big: true, size: 'big', nameKind: 'size', nameValue: 'big' }, topic: 'size' }), 'The big egg!', 'sayDemo size egg');
eq(I.sayDemo('en', { thing: { kind: 'egg', color: 'green', nameKind: 'color', nameValue: 'green' } }), 'Green!', 'sayDemo colour thing');
eq(I.sayDemo('en', { thing: { kind: 'glyph', text: '5', n: 5, nameKind: 'number', nameValue: 5 }, topic: 'add' }), 'Five!', 'sayDemo number glyph');
eq(I.sayDemo('vi', { thing: { kind: 'glyph', text: 'B', nameKind: 'letter', nameValue: 'B' } }), 'Chữ B!', 'sayDemo vi letter glyph');
eq(I.sayDemo('en', { thing: { kind: 'animal', animal: 'dino', nameKind: 'animal', nameValue: 'dino' }, topic: 'initial' }), 'The baby dino!', 'sayDemo initial topic: the name only');
eq(I.sayDemo('en', 'color', 'nonsense'), '', 'sayDemo unknown value → ""');
eq(I.sayDemo('en', {}), '', 'sayDemo nothing → ""');
eq(I.demoName('vi', 'color', 'blue'), 'màu xanh dương', 'demoName vi');
eq(I.demoName('en', 'animal', 'owl'), 'the owlet', 'demoName animal');
for (const lang of I.langs) {
  const notes = [].concat(COLORS.map(c => ['color', c]), SHAPES.map(s => ['shape', s]), [['size', 'big'], ['size', 'small']],
    ANIMALS.map(a => ['animal', a]), LETTERS.map(L => ['letter', L]), Array.from({ length: 21 }, (_, n) => ['number', n]));
  for (const [k, v] of notes) {
    const s = I.sayDemo(lang, k, v);
    ok(clean(s) && positive(s) && /!$/.test(s) && s.split(/\s+/).length <= 5, `${lang} sayDemo ${k} ${v} short and clean: ${s}`);
    if (k === 'animal') ok(s.toLowerCase().startsWith((lang === 'en' ? SOUND_EN : SOUND_VI)[v]) && s.toLowerCase().includes((lang === 'en' ? ANIMAL_EN : ANIMAL_VI)[v]),
      `${lang} sayDemo ${v} = sound + name: ${s}`);
    const nx = I.sayNext(lang, k, v, r5);
    ok(clean(nx) && nx.toLowerCase().includes(I.demoName(lang, k, v).toLowerCase()), `${lang} sayNext ${k} ${v}: ${nx}`);
    const sp = I.speech(lang, I.sayNext(lang, k, v, r0));
    ok(!/^[….]/.test(sp), `${lang} speech of the cue has no leading pause mark: ${sp}`);
  }
}
eq(I.sayNext('en', 'color', 'blue', r0), '…and blue!', 'sayNext (DESIGN)');
eq(I.sayNext('vi', { nameKind: 'color', nameValue: 'blue' }, r0), '…rồi màu xanh dương!', 'sayNext vi event form');
eq(I.sayNext('en', 'color', 'nonsense', r0), '', 'sayNext: nothing to name → ""');
eq(I.speech('en', '…and blue!'), 'and blue!', 'speech: the cue\'s leading "…" is not read');
// sayTurn: the ask line in the tune flow
const askE = (extra) => Object.assign({ type: 'ask', promptKey: 'p.colors', params: { color: 'red' }, mode: 'find', step: 0, steps: 2,
  nameKind: 'color', nameValue: 'red', echo: true, afterDemo: true }, extra || {});
eq(I.sayTurn('en', askE(), { age: 3, rng: r0 }), 'Your turn! First, red!', 'sayTurn after the demo, age 3: + the first name');
eq(I.sayTurn('vi', askE(), { age: 3, rng: r0 }), 'Đến lượt bé rồi! Đầu tiên là màu đỏ nhé!', 'sayTurn vi after the demo, age 3');
eq(I.sayTurn('en', askE(), { age: 4, rng: r0 }), 'Your turn!', 'sayTurn after the demo, age 4: no first name (playtest: it gave the answer away)');
eq(I.sayTurn('en', askE(), { age: 5, cue: true, rng: r0 }), 'Your turn! First, red!', 'sayTurn cue:true forces the first name');
eq(I.sayTurn('en', askE(), { age: 6, rng: r0 }), 'Your turn!', 'sayTurn age 6: no name cue (memory)');
eq(I.sayTurn('en', askE(), { cue: false, rng: r0 }), 'Your turn!', 'sayTurn cue:false');
eq(I.sayTurn('en', askE({ afterDemo: false, step: 1, nameValue: 'blue', params: { color: 'blue' } }), { age: 4, rng: r0 }), '…and blue!', 'sayTurn later step: the cue');
eq(I.sayTurn('vi', askE({ afterDemo: false, step: 1, nameValue: 'blue', params: { color: 'blue' } }), { age: 3, rng: r0 }), '…rồi màu xanh dương!', 'sayTurn vi later step');
eq(I.sayTurn('en', askE({ afterDemo: false, step: 1 }), { age: 7, rng: r0 }), '', 'sayTurn later step age 7: nothing');
eq(I.sayTurn('en', askE({ promptKey: 'p.beat', mode: 'beat', params: { n: 3 }, nameKind: 'number', nameValue: 3, need: 3 }), { age: 4, rng: r0 }),
  'Your turn — tap the big egg three times!', 'sayTurn beat step');
eq(I.sayTurn('vi', askE({ promptKey: 'p.beat', mode: 'beat', params: { n: 1 }, nameKind: 'number', nameValue: 1, need: 1, afterDemo: false }), { rng: r0 }),
  'Đến lượt bé — gõ quả trứng to một cái nhé!', 'sayTurn vi beat step n = 1');
eq(I.sayTurn('en', askE({ promptKey: 'p.animals', params: { animal: 'duck' }, nameKind: 'animal', nameValue: 'duck' }), { age: 3, rng: r0 }),
  'Your turn! First, the duckling!', 'sayTurn animals: the name, no sound');
eq(I.sayTurn('en', askE({ mode: 'findAll', promptKey: 'p.oddeven', params: { parity: 'odd' }, nameKind: 'parity', nameValue: 'odd' }), { age: 5, rng: r0 }),
  'Your turn!', 'sayTurn findAll: no single name');
for (const lang of I.langs) for (const age of [3, 4, 5, 6, 7]) for (let v = 0; v < 3; v++) for (const ex of [{}, { afterDemo: false, step: 1 },
  { promptKey: 'p.beat', mode: 'beat', params: { n: 4 }, nameKind: 'number', nameValue: 4 }, { promptKey: 'p.shapes5', params: { shape: 'heart', color: 'pink' }, nameKind: 'shape', nameValue: 'heart' }]) {
  const s = I.sayTurn(lang, askE(ex), { age, rng: () => v / 3 });
  ok(s === '' || (clean(s) && positive(s)), `${lang} sayTurn age ${age} ${JSON.stringify(ex)} [${v}]: ${s}`);
}

section('prompts: every param filled, plurals, fallbacks');
eq(I.ask('en', 'p.colors', { color: 'red' }, { rng: r0 }), 'Tap the red egg!', 'p.colors en');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { rng: r0 }), 'Bé ơi, gõ quả trứng màu đỏ nhé!', 'p.colors vi (DESIGN "trứng màu đỏ")');
eq(I.ask('en', 'p.shapes', { shape: 'triangle' }, { rng: r0 }), 'Tap the triangle egg!', 'p.shapes en');
eq(I.ask('vi', 'p.shapes', { shape: 'star' }, { rng: r0 }), 'Bé ơi, gõ quả trứng ngôi sao nhé!', 'p.shapes vi: "quả trứng ngôi sao"');
eq(I.ask('vi', 'p.shapes', { shape: 'heart' }, { rng: r0 }), 'Bé ơi, gõ quả trứng trái tim nhé!', 'p.shapes vi: "quả trứng trái tim"');
eq(I.ask('vi', 'p.shapes', { shape: 'circle' }, { rng: r0 }), 'Bé ơi, gõ quả trứng hình tròn nhé!', 'p.shapes vi: "trứng hình tròn" (DESIGN)');
eq(I.ask('en', 'p.shapes5', { shape: 'star', color: 'blue' }, { rng: r0 }), 'Tap the blue star egg!', 'p.shapes5 en');
eq(I.ask('vi', 'p.shapes5', { shape: 'star', color: 'blue' }, { rng: r0 }), 'Bé ơi, gõ quả trứng ngôi sao màu xanh dương nhé!', 'p.shapes5 vi');
eq(I.ask('en', 'p.shapes5', { shape: 'oval' }, { rng: r0 }), 'Tap the oval egg!', 'p.shapes5 without colour → p.shapes');
eq(I.ask('en', 'p.size', { size: 'big' }, { rng: r0 }), 'Tap the big egg!', 'p.size en');
eq(I.ask('en', 'p.size', { size: 'small' }, { rng: r0 }), 'Tap the small egg!', 'p.size small');
eq(I.ask('vi', 'p.size', { size: 'big' }, { rng: r0 }), 'Bé ơi, gõ quả trứng to nhé!', 'p.size vi (DESIGN "quả trứng to")');
eq(I.ask('en', 'p.size', { big: true }, { rng: r0 }), 'Tap the big egg!', 'p.size from {big:true}');
eq(I.ask('en', 'p.size', {}, { rng: r0 }), 'Tap the big egg!', 'p.size without size → p.sizeAny');
// p.beat = the child's turn after Rio tapped the big egg (copy N taps)
eq(I.ask('en', 'p.beat', { n: 3 }, { rng: r0 }), 'Tap the big egg three times!', 'p.beat en');
eq(I.ask('en', 'p.beat', { n: 1 }, { rng: r0 }), 'Tap the big egg once!', 'p.beat n = 1 → "once"');
eq(I.ask('en', 'p.beat', { n: 2 }, { rng: r5 }), 'Your turn! Tap the big egg twice!', 'p.beat n = 2 → "twice", 2nd wording');
eq(I.ask('vi', 'p.beat', { n: 3 }, { rng: r0 }), 'Bé ơi, gõ quả trứng to ba cái nhé!', 'p.beat vi (REQUIREMENT)');
eq(I.ask('vi', 'p.beat', { n: 1 }, { rng: r0 }), 'Bé ơi, gõ quả trứng to một cái nhé!', 'p.beat vi n = 1');
for (const lang of I.langs) for (let n = 1; n <= 10; n++) for (let v = 0; v < 3; v++) {
  const s = I.ask(lang, 'p.beat', { n }, { rng: () => v / 3 });
  eq(I.ask(lang, 'p.beat', { n }, { next: true, rng: () => v / 3 }), s, `${lang} p.beat ${n} [${v}]: no "next" opener`);
}
eq(I.ask('en', 'p.beat', {}, { rng: r0 }), I.t('en', 'p.any', null, r0), 'p.beat without n → p.any');
eq(I.ask('en', 'p.count', { n: 7, kind: 'dots' }, { rng: r0 }), 'Tap the egg with seven dots!', 'p.count dots (age 5+)');
eq(I.ask('en', 'p.count', { n: 1 }, { rng: r0 }), 'Tap the egg with one dot!', 'p.count singular, dots by default');
eq(I.ask('vi', 'p.count', { n: 7, kind: 'dots' }, { rng: r0 }), 'Bé ơi, gõ quả trứng có bảy chấm nhé!', 'p.count vi (DESIGN "trứng có {n} chấm")');
eq(I.ask('vi', 'p.count', { n: 4 }, { rng: r5 }), 'Mình đếm nhé! Quả trứng nào có bốn chấm? Bé gõ nào!', 'p.count vi 2nd wording');
eq(I.ask('en', 'p.animals', { animal: 'duck' }, { rng: r0 }), 'Who says quack? Tap the duckling!', 'p.animals en asks by the sound (DESIGN)');
eq(I.ask('vi', 'p.animals', { animal: 'duck' }, { rng: r0 }), 'Ai kêu cạp cạp? Bé gõ vịt con nhé!', 'p.animals vi (REQUIREMENT "Ai kêu cạp cạp?")');
eq(I.ask('vi', 'p.animals', { animal: 'chick' }, { rng: r5 }), 'Bé ơi, ai kêu chíp chíp nhỉ? Gõ gà con nào!', 'p.animals vi 2nd wording');
eq(I.ask('en', 'p.animals', { animal: 'owl' }, { rng: r9 }), 'Who says hoot? Find the owlet!', 'p.animals en 3rd wording');
eq(I.ask('vi', 'p.animals', { animal: 'dino' }, { rng: r9 }), 'Bé nghe nè: Gừ gừ! Khủng long con đâu rồi? Bé gõ nào!', 'p.animals vi 3rd wording');
for (const a of ANIMALS) for (const lang of I.langs) for (let v = 0; v < 3; v++) {
  const s = I.ask(lang, 'p.animals', { animal: a }, { rng: () => v / 3 });
  ok(clean(s) && s.toLowerCase().includes((lang === 'en' ? SOUND_EN : SOUND_VI)[a]) && s.toLowerCase().includes(I.name(lang, 'animal', a)),
    `${lang} p.animals ${a} [${v}] says the sound and the name: ${s}`);
}
eq(I.ask('en', 'p.letters', { letter: 'B' }, { rng: r0 }), 'Tap the letter B!', 'p.letters');
eq(I.ask('vi', 'p.letters', { letter: 'B' }, { rng: r0 }), 'Bé ơi, gõ quả trứng chữ B nhé!', 'p.letters vi');
eq(I.ask('en', 'p.lower', { letter: 'G' }, { rng: r5 }), 'Tap small g!', 'p.lower');
eq(I.ask('en', 'p.lower', { letter: 'g' }, { rng: r0 }), 'Big G has a little friend. Tap small g!', 'p.lower from a small letter');
eq(I.ask('en', 'p.initial', { letter: 'D', animal: 'duck' }, { rng: r0 }), 'Tap the baby animal that starts with D!', 'p.initial');
eq(I.ask('en', 'p.add', { a: 2, b: 3 }, { rng: r0 }), 'What is 2 + 3? Tap the answer!', 'p.add');
eq(I.ask('vi', 'p.sub', { a: 7, b: 2 }, { rng: r0 }), 'Bé ơi, 7 − 2 bằng mấy? Bé gõ quả trứng đáp án nhé!', 'p.sub vi');
eq(I.ask('en', 'p.oddeven', { parity: 'odd' }, { rng: r0 }), 'Tap all the odd numbers!', 'p.oddeven');
eq(I.ask('vi', 'p.oddeven', { parity: 'even' }, { rng: r0 }), 'Bé ơi, gõ hết các số chẵn nhé!', 'p.oddeven vi');
eq(I.ask('en', 'p.colors', {}, { rng: r0 }), I.t('en', 'p.any', null, r0), 'missing param → p.any');
// next wording
eq(I.ask('en', 'p.colors', { color: 'red' }, { next: true, rng: r0 }), 'Next one! Tap the red egg!', 'next en');
eq(I.ask('en', 'p.animals', { animal: 'duck' }, { next: true, rng: r9 }), 'Now, who says quack? Find the duckling!', 'next "Now," runs into the prompt');
eq(I.ask('vi', 'p.colors', { color: 'red' }, { next: true, rng: r9 }), 'Giờ thì bé gõ quả trứng màu đỏ nào!', 'next vi "Giờ thì bé gõ …"');
eq(I.ask('en', 'p.beat', { n: 4 }, { next: true, rng: r0 }), 'Tap the big egg four times!', 'next p.beat: no opener');
for (const lang of I.langs) for (const k of PROMPT_KEYS) for (let v = 0; v < 3; v++) {
  const P = { color: 'green', shape: 'heart', size: 'small', animal: 'frog', n: 4, kind: 'dots', letter: 'M', a: 3, b: 1, parity: 'even' };
  const s = I.ask(lang, k, P, { next: true, rng: () => (v + 0.5) / 3 });
  ok(clean(s) && !/Bé ơi/.test(s.replace(/^Bé ơi/, '')) && (k === 'p.beat' || !/(nhé|nào)!.*\1!/.test(s)), `${lang} ${k} next [${v}]: ${s}`);
  if (lang === 'vi') ok(!/^.+[!?] Bé ơi/.test(s), `vi ${k} next: no "Bé ơi" mid-sentence: ${s}`);
}
// every prompt × every value
for (const lang of I.langs) {
  for (const c of COLORS) for (let v = 0; v < 3; v++) ok(clean(I.ask(lang, 'p.colors', { color: c }, { rng: () => v / 3 })), `${lang} p.colors ${c} [${v}]`);
  for (const s of SHAPES) for (const c of COLORS) for (let v = 0; v < 3; v++) {
    const a = I.ask(lang, 'p.shapes5', { shape: s, color: c }, { rng: () => v / 3 });
    ok(clean(a) && a.includes(I.name(lang, 'color', c)), `${lang} p.shapes5 ${s} ${c} [${v}]: ${a}`);
  }
  for (let n = 1; n <= 12; n++) for (let v = 0; v < 3; v++) {
    const s = I.ask(lang, 'p.count', { n, kind: 'dots' }, { rng: () => v / 3 });
    ok(clean(s) && s.toLowerCase().includes(I.numberName(lang, n)), `${lang} p.count ${n} [${v}]: ${s}`);
    if (lang === 'en' && n === 1) ok(!/\bdots\b/.test(s), `en p.count 1 is singular: ${s}`);
    if (lang === 'en' && n > 1) ok(/\bdots\b/.test(s), `en p.count ${n} is plural: ${s}`);
  }
  for (let n = 1; n <= 10; n++) for (let v = 0; v < 3; v++) {
    const s = I.ask(lang, 'p.beat', { n }, { rng: () => v / 3 });
    ok(clean(s) && (lang === 'en' && n <= 2 ? /\b(once|twice)\b/.test(s) : s.toLowerCase().includes(I.numberName(lang, n))), `${lang} p.beat ${n} [${v}]: ${s}`);
    if (lang === 'vi') ok(/ cái/.test(s), `vi p.beat ${n} counts with "cái": ${s}`);
    const tb = I.t(lang, 'turn.beat', { n }, () => v / 3);
    ok(clean(tb) && (lang === 'en' && n <= 2 ? /\b(once|twice)\b/.test(tb) : tb.toLowerCase().includes(I.numberName(lang, n))), `${lang} turn.beat ${n} [${v}]: ${tb}`);
  }
  for (const L of LETTERS) ok(clean(I.ask(lang, 'p.letters', { letter: L }, { rng: r0 })), `${lang} p.letters ${L}`);
}

section('names for every kind × value (DESIGN §6)');
const NAME_CASES = { color: COLORS, shape: SHAPES, size: ['big', 'small'], animal: ANIMALS, parity: ['odd', 'even'] };
for (const a of ANIMALS) eq(I.name('vi', 'animal', a), ANIMAL_VI[a], `vi animal ${a} (DESIGN)`);
for (const a of ANIMALS) eq(I.name('en', 'animal', a), ANIMAL_EN[a], `en animal ${a} (DESIGN)`);
for (const a of ANIMALS) eq(I.name('en', 'sound', a), SOUND_EN[a], `en sound ${a}`);
for (const a of ANIMALS) eq(I.name('vi', 'sound', a), SOUND_VI[a], `vi sound ${a} (kindergarten sounds)`);
for (const a of ANIMALS) eq(I.soundOf('vi', a), SOUND_VI[a], `soundOf vi ${a}`);
for (const s of SHAPES) eq(I.name('vi', 'shape', s), SHAPE_VI[s], `vi shape ${s} (DESIGN)`);
eq(I.name('en', 'shape', 'rect'), 'rectangle', 'rect → rectangle');
eq(I.name('vi', 'shapeH', 'star'), 'hình ngôi sao', 'vi shapeH');
eq(I.name('vi', 'color', 'blue'), 'màu xanh dương', 'vi blue');
eq(I.name('vi', 'hue', 'green'), 'xanh lá', 'vi hue');
eq(I.name('en', 'egg', 'red'), 'red egg', 'egg en');
eq(I.name('vi', 'egg', 'red'), 'quả trứng màu đỏ', 'egg vi (DESIGN "trứng màu đỏ")');
eq(I.name('vi', 'egg', 'big'), 'quả trứng to', 'egg big vi');
eq(I.name('en', 'big'), 'big egg', 'big egg');
eq(I.name('vi', 'big'), 'quả trứng to', 'big egg vi (DESIGN "quả trứng to")');
eq(I.name('en', 'dots', 5), 'five dots', 'dots en');
eq(I.name('en', 'dots', 1), 'one dot', 'dots en singular');
eq(I.name('vi', 'dots', 5), 'năm chấm', 'dots vi');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi K');
eq(I.name('vi', 'letter', 'Y'), 'i dài', 'vi Y');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'sum en');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'diff vi');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'parity vi');
eq(I.name('vi', 'word', 'frog'), 'ếch', 'word vi');
eq(I.name('vi', 'word', 'dino'), 'khủng long', 'word vi dino');
eq(I.name('en', 'word', 'frog'), 'frog', 'word en frog (no "baby")');
eq(I.name('en', 'animal', 'chicken'), 'chick', 'alias chicken → chick');
eq(I.name('en', 'animal', 'dinosaur'), 'baby dino', 'alias dinosaur → dino');
for (let n = 0; n <= 20; n++) for (const lang of I.langs) ok(clean(I.name(lang, 'number', n)) && !/\d/.test(I.name(lang, 'number', n)), `${lang} number ${n}: ${I.name(lang, 'number', n)}`);
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15 = mười lăm');
eq(I.name('vi', 'number', 0), 'không', 'vi 0');
for (const [kind, vals] of Object.entries(NAME_CASES)) for (const lang of I.langs) for (const v of vals)
  ok(clean(I.name(lang, kind, v)) && I.name(lang, kind, v) !== v || lang === 'en', `${lang} name ${kind} ${v}: ${I.name(lang, kind, v)}`);
for (const lang of I.langs) for (const k of ['egg', 'dots', 'sound']) for (const v of (k === 'egg' ? COLORS.concat(['big', 'small']) : k === 'sound' ? ANIMALS : [1, 2, 3, 4, 5, 12]))
  ok(clean(I.name(lang, k, v)), `${lang} name ${k} ${v}: ${I.name(lang, k, v)}`);
// initials (the 'first letter' topic)
for (const [a, f, w] of [['duck', 'D', 'duckling'], ['chick', 'C', 'chick'], ['owl', 'O', 'owlet'], ['frog', 'F', 'frog'], ['dino', 'D', 'dino'], ['snake', 'S', 'snake']]) {
  eq(I.initialOf('en', a).first, f, `en initial ${a}`);
  eq(I.initialOf('en', a).word, w, `en word ${a}`);
}
for (const [a, f, w] of [['duck', 'V', 'vịt'], ['chick', 'G', 'gà'], ['owl', 'C', 'cú'], ['frog', 'Ê', 'ếch'], ['dino', 'K', 'khủng long'], ['snake', 'R', 'rắn']]) {
  eq(I.initialOf('vi', a).first, f, `vi initial ${a}`);
  eq(I.initialOf('vi', a).word, w, `vi word ${a}`);
}

section('eggPhrase for every egg kind × value');
eq(I.eggPhrase('en', { kind: 'egg', color: 'red' }), 'the red egg', 'colour egg');
eq(I.eggPhrase('vi', { kind: 'egg', color: 'red' }), 'quả trứng màu đỏ', 'colour egg vi');
eq(I.eggPhrase('en', { kind: 'egg', color: 'red', big: true, nameKind: 'size', nameValue: 'big' }), 'the big egg', 'big egg (size round)');
eq(I.eggPhrase('vi', { kind: 'egg', color: 'red', big: false, nameKind: 'size', nameValue: 'small' }), 'quả trứng nhỏ', 'small egg vi');
eq(I.eggPhrase('en', { kind: 'shape', shape: 'triangle', color: 'red' }), 'the triangle egg', 'shape egg: no colour by default');
eq(I.eggPhrase('en', { kind: 'shape', shape: 'oval', color: 'orange' }, { color: true }), 'the orange oval egg', 'shape egg with colour');
eq(I.eggPhrase('en', { kind: 'shape', shape: 'oval' }, { art: 'a' }), 'an oval egg', 'an oval egg');
eq(I.eggPhrase('vi', { kind: 'shape', shape: 'star', color: 'blue' }, { color: true }), 'quả trứng ngôi sao màu xanh dương', 'shape egg vi with colour');
eq(I.eggPhrase('vi', { kind: 'shape', shape: 'circle' }), 'quả trứng hình tròn', 'shape egg vi circle (DESIGN)');
eq(I.eggPhrase('vi', { kind: 'shape', shape: 'heart' }), 'quả trứng trái tim', 'shape egg vi heart');
eq(I.eggPhrase('en', { kind: 'big', nameKind: 'number', nameValue: 3 }), 'the big egg', 'beat-mode big egg');
eq(I.eggPhrase('vi', { kind: 'big' }), 'quả trứng to', 'beat-mode big egg vi');
eq(I.eggPhrase('en', { kind: 'dots', n: 7 }), 'the egg with seven dots', 'dots egg');
eq(I.eggPhrase('en', { kind: 'dots', n: 1 }), 'the egg with one dot', 'dots egg singular');
eq(I.eggPhrase('en', { kind: 'dots', n: 4 }, { art: 'a' }), 'an egg with four dots', 'an egg with four dots');
eq(I.eggPhrase('vi', { kind: 'dots', n: 5 }), 'quả trứng có năm chấm', 'dots egg vi (DESIGN "trứng có {n} chấm")');
eq(I.eggPhrase('en', { kind: 'animal', animal: 'owl' }), 'the owlet', 'animal');
eq(I.eggPhrase('en', { kind: 'animal', animal: 'owl' }, { art: 'a' }), 'an owlet', 'an owlet');
eq(I.eggPhrase('en', { kind: 'animal', animal: 'frog' }, { art: 'a' }), 'a baby frog', 'a baby frog');
eq(I.eggPhrase('vi', { kind: 'animal', animal: 'owl' }), 'cú con', 'animal vi');
eq(I.eggPhrase('vi', { kind: 'animal', animal: 'owl' }, { egg: true }), 'cú con', 'animal vi with egg:true: just the name (no "trứng cú")');
eq(I.eggPhrase('en', { kind: 'sound', animal: 'snake' }), 'the baby snake', 'Talk sound icon');
eq(I.eggPhrase('en', { kind: 'glyph', text: 'B' }), 'letter B', 'letter glyph');
eq(I.eggPhrase('en', { kind: 'glyph', text: 'b' }), 'small b', 'small letter glyph');
eq(I.eggPhrase('vi', { kind: 'glyph', text: 'b' }), 'chữ b thường', 'small letter glyph vi');
eq(I.eggPhrase('en', { kind: 'glyph', text: '8', n: 8 }), 'number eight', 'number glyph');
eq(I.eggPhrase('vi', { kind: 'glyph', text: '5' }), 'số năm', 'number glyph vi');
eq(I.eggPhrase('en', { kind: 'glyph', text: '8' }, { bare: true }), 'eight', 'bare number');
eq(I.eggPhrase('en', {}), '', 'nothing → ""');
eq(I.phrase('en', { nameKind: 'color', nameValue: 'red' }), 'red', 'phrase nameKind');
eq(I.phrase('en', { thing: { kind: 'animal', animal: 'duck' } }), 'the duckling', 'phrase choice');
eq(I.sayName('en', { kind: 'egg', color: 'pink' }), 'the pink egg', 'sayName');
eq(I.sayName('vi', { kind: 'animal', animal: 'chick' }), 'gà con', 'sayName vi');
eq(I.sayName('vi', { thing: { kind: 'shape', shape: 'heart' } }), 'quả trứng trái tim', 'sayName from {thing}');
eq(I.sayName('en', null), '', 'sayName(null) → ""');
for (const lang of I.langs) {
  const things = [].concat(COLORS.map(c => ({ kind: 'egg', color: c })), SHAPES.map(s => ({ kind: 'shape', shape: s, color: 'red' })),
    [{ kind: 'big' }, { kind: 'big', n: 3, nameKind: 'number', nameValue: 3 }], [1, 4, 7, 10, 12].map(n => ({ kind: 'dots', n })),
    ANIMALS.map(a => ({ kind: 'animal', animal: a })), LETTERS.map(L => ({ kind: 'glyph', text: L })),
    Array.from({ length: 21 }, (_, n) => ({ kind: 'glyph', text: String(n), n })),
    [true, false].map(b => ({ kind: 'egg', color: 'yellow', big: b, nameKind: 'size', nameValue: b ? 'big' : 'small' })));
  for (const t of things) for (const o of [{}, { color: true }, { art: 'a' }, { art: null }, { egg: true }]) {
    const s = I.eggPhrase(lang, t, o);
    ok(clean(s), `${lang} eggPhrase ${JSON.stringify(t)} ${JSON.stringify(o)}: ${s}`);
  }
}

section('words() — accepted spoken forms (digits, no diacritics, animal sounds), matched back by the matcher');
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
  eq(V.match(['the ' + I.name('en', 'animal', a) + '!'], animEn), a, `en "the ${I.name('en', 'animal', a)}!"`);
  eq(V.match([SOUND_EN[a]], animEn), a, `en sound "${SOUND_EN[a]}" → ${a} (sounds are answers too)`);
  eq(V.match([SOUND_VI[a]], animVi), a, `vi sound "${SOUND_VI[a]}" → ${a}`);
  eq(V.match([I.stripMarks(SOUND_VI[a])], animVi), a, `vi sound without marks "${I.stripMarks(SOUND_VI[a])}" → ${a}`);
  ok(I.words('en', 'sound', a).includes(SOUND_EN[a]), `words(en, sound, ${a}) accepts the sound`);
  const vi = I.name('vi', 'animal', a), word = I.name('vi', 'word', a);
  eq(V.match([word], animVi), a, `vi bare "${word}" → ${a}`);
  eq(V.match(['con ' + word], animVi), a, `vi "con ${word}" → ${a}`);
  eq(V.match(['là ' + vi + ' đó'], animVi), a, `vi "là ${vi} đó" → ${a}`);
  eq(V.match([I.stripMarks(vi)], animVi), a, `vi no diacritics "${I.stripMarks(vi)}" → ${a}`);
  eq(V.match(['quả trứng ' + vi], animVi), a, `vi "quả trứng ${vi}" → ${a}`);
  eq(V.match([I.name('en', 'word', a)], animEn), a, `en word "${I.name('en', 'word', a)}" → ${a}`);
}
for (const [said, want] of [['vit', 'duck'], ['vit con', 'duck'], ['quạc quạc', 'duck'], ['ga con', 'chick'], ['con gà', 'chick'], ['chip chip', 'chick'],
  ['cu con', 'owl'], ['cú mèo', 'owl'], ['hu hu', 'owl'], ['ech', 'frog'], ['con nhái', 'frog'], ['op op', 'frog'],
  ['khung long', 'dino'], ['khủng long con', 'dino'], ['gu gu', 'dino'], ['ran', 'snake'], ['con rắn', 'snake'], ['xi xi', 'snake']])
  eq(V.match([said], animVi), want, `vi "${said}" → ${want}`);
for (const [said, want] of [['a duck', 'duck'], ['quack quack', 'duck'], ['the duckling', 'duck'], ['a chicken', 'chick'], ['peep', 'chick'],
  ['an owl', 'owl'], ['hoot hoot', 'owl'], ['froggy', 'frog'], ['ribbit', 'frog'], ['a dinosaur', 'dino'], ['roar', 'dino'],
  ['the snake', 'snake'], ['hiss', 'snake'], ['baby snake', 'snake']])
  eq(V.match([said], animEn), want, `en "${said}" → ${want}`);
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['baby'], animEn), null, 'en "baby" alone matches nothing');
eq(V.match(['xanh'], ch('vi', 'color', COLORS)), null, '"xanh" alone is ambiguous');
eq(V.match(['màu xanh dương'], ch('vi', 'color', COLORS)), 'blue', 'vi "màu xanh dương"');
eq(V.match(['mau do'], ch('vi', 'color', COLORS)), 'red', 'vi no-diacritic "mau do"');
eq(V.match(['quả trứng màu đỏ'], ch('vi', 'color', COLORS)), 'red', 'vi "quả trứng màu đỏ" → red');
eq(V.match(['the red egg'], ch('en', 'color', COLORS)), 'red', 'en "the red egg" → red');
eq(V.match(['ba'], ch('vi', 'number', [3, 5, 12])), '3', '"ba" → 3');
eq(V.match(['muoi hai'], ch('vi', 'number', [3, 5, 12])), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], ch('en', 'number', [3, 5, 12])), '5', '"I think five"');
eq(V.match(['three dots'], ch('en', 'dots', [2, 3, 4])), '3', 'en "three dots" → 3');
eq(V.match(['bốn chấm'], ch('vi', 'dots', [2, 4, 6])), '4', 'vi "bốn chấm" → 4');
eq(V.match(['7'], ch('en', 'number', [6, 7, 8])), '7', 'digit transcript "7"');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');
eq(V.match(['số chẵn'], ch('vi', 'parity', ['odd', 'even'])), 'even', '"số chẵn"');
eq(V.match(['bee'], ch('en', 'letter', ['A', 'B', 'C'])), 'B', '"bee" → B');
eq(V.match(['chữ tờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'T', '"chữ tờ" → T');
eq(V.match(['bờ'], ch('vi', 'letter', ['B', 'C', 'T'])), 'B', '"bờ" → B');
eq(V.match(['two plus three'], ch('en', 'sum', ['2+3', '1+1'])), '2+3', 'en sum spoken');
eq(V.match(['nhỏ xíu'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi small');
eq(V.match(['quả trứng to'], ch('vi', 'size', ['big', 'small'])), 'big', 'vi "quả trứng to"');
eq(V.match(['trứng nhỏ'], ch('vi', 'size', ['big', 'small'])), 'small', 'vi "trứng nhỏ"');
eq(V.match(['the big one'], ch('en', 'size', ['big', 'small'])), 'big', 'en "the big one"');
eq(V.match(['ngôi sao'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'star', 'vi "ngôi sao"');
eq(V.match(['quả trứng ngôi sao'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'star', 'vi "quả trứng ngôi sao"');
eq(V.match(['trai tim'], ch('vi', 'shape', ['star', 'heart', 'circle'])), 'heart', 'vi "trai tim"');
eq(V.match(['the star egg'], ch('en', 'shape', ['star', 'heart', 'circle'])), 'star', 'en "the star egg"');
eq(V.match(['the red egg'], ch('en', 'egg', ['red', 'blue'])), 'red', 'en egg kind');
eq(V.match(['duck'], [{ id: 'd', kind: 'animal', value: 'duck' }, { id: 'f', kind: 'animal', value: 'frog' }], 'en'), 'd', '{id,kind,value} choices');
eq(V.match(['quack'], [{ id: 'd', kind: 'sound', value: 'duck' }, { id: 'f', kind: 'sound', value: 'frog' }], 'en'), 'd', '{kind:"sound"} choices');
eq(V.match(['banana'], colEn), null, 'unrelated → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('game lines: sayRight / sayWrong / sayCount / sayCountRun / sayCountDone / sayBeatNudge / sayPickup / sayTap');
const egg = (c) => ({ kind: 'egg', color: c, nameKind: 'color', nameValue: c });
const segg = (big) => ({ kind: 'egg', color: 'red', big, nameKind: 'size', nameValue: big ? 'big' : 'small' });
const shp = (s, c) => ({ kind: 'shape', shape: s, color: c || 'blue', nameKind: 'shape', nameValue: s });
const bigD = (n) => ({ kind: 'big', nameKind: 'number', nameValue: n });
const dots = (n) => ({ kind: 'dots', n, nameKind: 'number', nameValue: n });
const anim = (a) => ({ kind: 'animal', animal: a, nameKind: 'animal', nameValue: a });
const glyphL = (c) => ({ kind: 'glyph', text: c, nameKind: 'letter', nameValue: c });
const glyphN = (n) => ({ kind: 'glyph', text: String(n), n, nameKind: 'number', nameValue: n });
const beatE = (n, extra) => Object.assign({ thing: bigD(n), topic: 'count', promptKey: 'p.beat', params: { n }, count: { n } }, extra || {});
// right = the short tune name (REQUIREMENT "Yes! Red!" / "Đúng rồi! Màu đỏ!")
eq(I.sayRight('en', { thing: egg('red'), topic: 'colors' }, r0), 'Yes! Red!', 'right colours en (REQUIREMENT)');
eq(I.sayRight('en', { thing: egg('red'), topic: 'colors' }, r5), 'Red! Lovely!', 'right colours en 2nd wording');
eq(I.sayRight('vi', { thing: egg('red'), topic: 'colors' }, r0), 'Đúng rồi! Màu đỏ!', 'right colours vi (REQUIREMENT)');
eq(I.sayRight('vi', { thing: egg('red'), topic: 'colors' }, r5), 'Màu đỏ! Hay quá!', 'right colours vi 2nd wording');
eq(I.sayRight('en', { thing: shp('triangle'), topic: 'shapes', params: { shape: 'triangle' } }, r0), 'Yes! The triangle!', 'right shapes');
eq(I.sayRight('en', { thing: shp('star', 'blue'), topic: 'shapes', promptKey: 'p.shapes5', params: { shape: 'star', color: 'blue' } }, r0),
  'Yes! The blue star!', 'right shapes5 names the colour');
eq(I.sayRight('vi', { thing: shp('star', 'blue'), topic: 'shapes', promptKey: 'p.shapes5', params: { shape: 'star', color: 'blue' } }, r0),
  'Đúng rồi! Ngôi sao màu xanh dương!', 'right shapes5 vi');
eq(I.sayRight('en', { thing: segg(true), topic: 'size', params: { size: 'big' } }, r0), 'Yes! The big egg!', 'right size');
eq(I.sayRight('vi', { thing: segg(false), topic: 'size', params: { size: 'small' } }, r0), 'Đúng rồi! Quả trứng nhỏ!', 'right size vi');
eq(I.sayRight('en', { thing: anim('duck'), topic: 'animals' }, r0), 'Quack! The duckling!', 'right animals = sound + name (REQUIREMENT)');
eq(I.sayRight('vi', { thing: anim('duck'), topic: 'animals' }, r0), 'Cạp cạp! Vịt con!', 'right animals vi');
eq(I.sayRight('en', { thing: anim('chick'), topic: 'animals' }, r5), 'Yes! Peep! The chick!', 'right animals 2nd wording');
eq(I.sayRight('vi', { thing: anim('frog'), topic: 'animals' }, r9), 'Ộp ộp! Ếch con hát theo nè!', 'right animals vi 3rd wording');
eq(I.sayRight('en', beatE(3), r0), 'Three! You tapped it three times!', 'right beat mode');
eq(I.sayRight('en', beatE(1), r0), 'One! You tapped it once!', 'right beat mode n = 1');
eq(I.sayRight('vi', beatE(3), r0), 'Ba! Bé gõ đủ ba cái rồi!', 'right beat mode vi');
eq(I.sayRight('en', { thing: bigD(4), topic: 'count', params: { n: 4 } }, r5), 'Four! Super counting!', 'right big egg without e.count → params.n');
eq(I.sayRight('en', { nameKind: 'number', nameValue: 2, topic: 'count', promptKey: 'p.beat', params: { n: 2 } }, r0), 'Two! You tapped it twice!', 'right beat rebuilt from nameKind');
eq(I.sayRight('en', { thing: dots(7), topic: 'count', params: { n: 7, kind: 'dots' } }, r0), 'Yes! Seven dots!', 'right dots without a count run');
eq(I.sayRight('en', { thing: dots(4), topic: 'count', count: { n: 4 } }), 'One, two, three, four dots!', 'right dots with e.count → the count run');
eq(I.sayRight('en', { thing: glyphL('B'), topic: 'letters' }, r0), 'Yes! Letter B!', 'right letters');
eq(I.sayRight('vi', { thing: glyphL('b'), topic: 'lower' }, r0), 'Đúng rồi! Chữ b thường!', 'right lower vi');
eq(I.sayRight('en', { thing: anim('duck'), topic: 'initial' }, r0), 'D is for duckling!', 'right initial');
eq(I.sayRight('vi', { thing: anim('frog'), topic: 'initial' }, r0), 'Chữ Ê, ếch!', 'right initial vi');
eq(I.sayRight('vi', { thing: anim('dino'), topic: 'initial' }, r0), 'Chữ K, khủng long!', 'right initial vi dino');
eq(I.sayRight('en', { thing: glyphN(5), topic: 'add', params: { a: 2, b: 3 } }, r0), 'Five! 2 + 3 is five!', 'right add');
eq(I.sayRight('vi', { thing: glyphN(5), topic: 'sub', params: { a: 7, b: 2 } }, r0), 'Năm! 7 − 2 bằng năm!', 'right sub vi');
eq(I.sayRight('en', { thing: glyphN(7), topic: 'oddeven' }, r0), 'Seven is odd!', 'right oddeven');
eq(I.sayRight('vi', { thing: glyphN(8), topic: 'oddeven' }, r0), 'Tám là số chẵn!', 'right oddeven vi');
eq(I.sayRight('en', { thing: glyphN(9), topic: 'count' }, r0), 'Yes! Nine!', 'right number glyph');
eq(I.sayRight('en', {}, r0), 'Yes! Lovely!', 'right without a thing → right.any');
// rebuilt from nameKind (main forgot thing)
eq(I.sayRight('en', { nameKind: 'color', nameValue: 'green', topic: 'colors' }, r0), 'Yes! Green!', 'right rebuilt from nameKind');
eq(I.sayRight('en', { nameKind: 'animal', nameValue: 'snake', topic: 'animals' }, r0), 'Hiss! The baby snake!', 'right animal rebuilt from nameKind');
eq(I.sayPlaced('en', { thing: egg('red'), topic: 'colors' }, r0), I.sayRight('en', { thing: egg('red'), topic: 'colors' }, r0), 'sayPlaced = sayRight');
eq(I.sayPickup('en', { thing: egg('red'), topic: 'colors' }), 'The red egg!', 'sayPickup (brush name)');
eq(I.sayPickup('vi', { thing: anim('owl') }), 'Cú con!', 'sayPickup vi');
eq(I.sayPickup('en', beatE(3)), 'The big egg!', 'sayPickup big egg');
eq(I.sayTap('en', { thing: anim('owl') }, r5), 'Look, the owlet!', 'sayTap');
// wrong — default: Rio replays the tune → "… Listen again!" (DESIGN §6 / REQUIREMENT)
const W = (lang, got, want, topic, params, extra, rng) => I.sayWrong(lang, Object.assign({ thing: got, got: { nameKind: got.nameKind, nameValue: got.nameValue },
  want, topic, params: params || {} }, extra || {}), rng || r0);
const NR = { replay: false };   // the hint glow is on: no replay → the goal is named
eq(W('en', egg('yellow'), { nameKind: 'color', nameValue: 'red' }, 'colors'), 'That’s the yellow egg. Listen again!', 'wrong colours en (REQUIREMENT)');
eq(W('vi', egg('yellow'), { nameKind: 'color', nameValue: 'red' }, 'colors'), 'Đây là quả trứng màu vàng. Bé nghe lại nhé!', 'wrong colours vi (REQUIREMENT)');
eq(W('en', egg('yellow'), { nameKind: 'color', nameValue: 'red' }, 'colors', null, { replay: true }, r5), 'Oh, the yellow egg! Listen again!', 'wrong 2nd wording');
eq(W('en', egg('blue'), { nameKind: 'color', nameValue: 'red' }, 'colors', null, NR), 'That’s the blue egg. Let’s tap the red one!', 'wrong colours, no replay: the goal');
eq(W('vi', egg('blue'), { nameKind: 'color', nameValue: 'red' }, 'colors', null, NR), 'Đây là quả trứng màu xanh dương. Mình gõ quả trứng màu đỏ nhé!', 'wrong colours vi, no replay');
eq(W('en', egg('blue'), { nameKind: 'color', nameValue: 'red' }, 'colors', null, { streak: 2 }), 'That’s the blue egg. Let’s tap the red one!', 'streak 2 (hint glow) → no replay line');
eq(W('en', egg('blue'), { nameKind: 'color', nameValue: 'red' }, 'colors', null, { streak: 2, replay: true }), 'That’s the blue egg. Listen again!', 'explicit replay wins over streak');
eq(W('en', shp('circle'), { nameKind: 'shape', nameValue: 'triangle' }, 'shapes'), 'That’s the circle egg. Listen again!', 'wrong shapes');
eq(W('en', shp('circle'), { nameKind: 'shape', nameValue: 'triangle' }, 'shapes', null, NR), 'That’s the circle egg. Let’s tap the triangle egg!', 'wrong shapes, no replay');
eq(W('vi', shp('circle'), { nameKind: 'shape', nameValue: 'star' }, 'shapes', null, NR), 'Đây là quả trứng hình tròn. Mình gõ quả trứng ngôi sao nhé!', 'wrong shapes vi, no replay');
eq(W('en', shp('star', 'red'), { nameKind: 'shape', nameValue: 'star' }, 'shapes', { shape: 'star', color: 'blue' }, { promptKey: 'p.shapes5', replay: false }),
  'That’s the red star egg. Let’s tap the blue star egg!', 'wrong shapes5');
eq(W('en', shp('star', 'red'), { nameKind: 'shape', nameValue: 'star' }, 'shapes', { shape: 'star', color: 'blue' }, { promptKey: 'p.shapes5' }),
  'That’s the red star egg. Listen again!', 'wrong shapes5 with replay names the tapped colour');
eq(W('en', shp('heart', 'orange'), { nameKind: 'shape', nameValue: 'star' }, 'shapes', { shape: 'star', color: 'orange' }, { promptKey: 'p.shapes', replay: false }),
  'That’s the heart egg. Let’s tap the star egg!', 'wrong p.shapes with a {color} param: the colour is not said');
eq(I.sayRight('en', { thing: shp('star', 'orange'), topic: 'shapes', promptKey: 'p.shapes', params: { shape: 'star', color: 'orange' } }, r0),
  'Yes! The star!', 'right p.shapes with a {color} param: the colour is not said');
eq(W('en', segg(false), { nameKind: 'size', nameValue: 'big' }, 'size', { size: 'big' }, NR), 'That’s the small egg. Let’s tap the big one!', 'wrong size');
eq(W('vi', segg(false), { nameKind: 'size', nameValue: 'big' }, 'size', { size: 'big' }), 'Đây là quả trứng nhỏ. Bé nghe lại nhé!', 'wrong size vi');
eq(W('vi', segg(false), { nameKind: 'size', nameValue: 'big' }, 'size', { size: 'big' }, NR), 'Đây là quả trứng nhỏ. Mình gõ quả trứng to nhé!', 'wrong size vi, no replay');
eq(W('en', { kind: 'egg', color: 'yellow', size: 'mid', big: false, nameKind: 'color', nameValue: 'yellow' }, { nameKind: 'size', nameValue: 'small' }, 'size', { size: 'small', color: 'purple' }, NR),
  'That’s the yellow egg. Let’s tap the small one!', 'wrong size: a mid-size distractor is named by its colour');
eq(W('vi', { kind: 'egg', color: 'yellow', size: 'mid', big: false, nameKind: 'color', nameValue: 'yellow' }, { nameKind: 'size', nameValue: 'small' }, 'size', { size: 'small', color: 'purple' }),
  'Đây là quả trứng màu vàng. Bé nghe lại nhé!', 'wrong size vi: mid-size distractor');
eq(W('en', anim('chick'), { nameKind: 'animal', nameValue: 'duck' }, 'animals', { animal: 'duck' }), 'The chick says peep! Listen again!', 'wrong animals: the tapped animal\'s sound, then listen');
eq(W('vi', anim('chick'), { nameKind: 'animal', nameValue: 'duck' }, 'animals', { animal: 'duck' }), 'Gà con kêu chíp chíp! Bé nghe lại nhé!', 'wrong animals vi');
eq(W('en', anim('chick'), { nameKind: 'animal', nameValue: 'duck' }, 'animals', { animal: 'duck' }, NR), 'The chick says peep! Let’s find the duckling!', 'wrong animals, no replay');
eq(W('vi', anim('chick'), { nameKind: 'animal', nameValue: 'duck' }, 'animals', { animal: 'duck' }, NR), 'Gà con kêu chíp chíp! Mình tìm vịt con nhé!', 'wrong animals vi, no replay');
eq(W('en', anim('chick'), { nameKind: 'animal', nameValue: 'duck' }, 'animals', { animal: 'duck' }, NR, r5),
  'Peep! That’s the chick. Who says quack? Let’s find the duckling!', 'wrong animals 2nd wording, no replay');
eq(W('en', dots(4), { nameKind: 'number', nameValue: 6 }, 'count', { n: 6, kind: 'dots' }), 'That egg has four dots. Listen again!', 'wrong count dots');
eq(W('en', dots(4), { nameKind: 'number', nameValue: 6 }, 'count', { n: 6, kind: 'dots' }, NR), 'That egg has four dots. Let’s tap the egg with six dots!', 'wrong count dots, no replay');
eq(W('vi', dots(4), { nameKind: 'number', nameValue: 6 }, 'count', { n: 6, kind: 'dots' }, NR), 'Quả trứng này có bốn chấm. Mình gõ quả trứng có sáu chấm nhé!', 'wrong dots vi');
eq(W('en', glyphL('D'), { nameKind: 'letter', nameValue: 'B' }, 'letters', null, NR), 'That’s letter D. Let’s tap letter B!', 'wrong letters');
eq(W('en', glyphL('D'), { nameKind: 'letter', nameValue: 'B' }, 'letters'), 'That’s letter D. Listen again!', 'wrong letters, replay');
eq(W('en', glyphN(6), { nameKind: 'number', nameValue: 5 }, 'add', { a: 2, b: 3 }, NR), 'That’s number six. Let’s count again!', 'wrong maths never says the answer');
eq(W('en', glyphN(6), { nameKind: 'number', nameValue: 5 }, 'add', { a: 2, b: 3 }), 'That’s number six. Listen again!', 'wrong maths, replay');
eq(W('en', glyphN(4), { nameKind: 'parity', nameValue: 'odd' }, 'oddeven', { parity: 'odd' }, NR), 'Four is even! Let’s look for another one!', 'wrong parity');
eq(W('en', glyphN(4), { nameKind: 'parity', nameValue: 'odd' }, 'oddeven', { parity: 'odd' }), 'Four is even! Listen again!', 'wrong parity, replay');
eq(W('en', anim('snake'), { nameKind: 'letter', nameValue: 'D' }, 'initial', { letter: 'D' }, NR), 'Snake starts with S! Let’s look again!', 'wrong initial');
eq(W('vi', anim('frog'), { nameKind: 'letter', nameValue: 'G' }, 'initial', { letter: 'G' }), 'Ếch bắt đầu bằng chữ Ê! Bé nghe lại nhé!', 'wrong initial vi, replay');
eq(I.sayWrong('en', beatE(3), r0), 'Listen again!', 'beat step: no wrong line, only the generic one (defensive)');
// without e.thing: rebuilt from got + topic
eq(I.sayWrong('en', { got: { nameKind: 'color', nameValue: 'blue' }, want: { nameKind: 'color', nameValue: 'red' }, topic: 'colors', replay: false }, r0),
  'That’s the blue egg. Let’s tap the red one!', 'wrong rebuilt from got (no thing)');
eq(I.sayWrong('en', { got: { nameKind: 'number', nameValue: 2 }, want: { nameKind: 'number', nameValue: 5 }, topic: 'count', params: { n: 5, kind: 'dots' } }, r0),
  'That egg has two dots. Listen again!', 'wrong count rebuilt from got');
eq(I.sayWrong('vi', { got: { nameKind: 'animal', nameValue: 'owl' }, want: { nameKind: 'animal', nameValue: 'snake' }, topic: 'animals' }, r0),
  'Cú con kêu hù hù! Bé nghe lại nhé!', 'wrong animal rebuilt from got');
eq(I.sayWrong('en', {}, r0), 'Listen again!', 'wrong without anything → wrong.againAny');
eq(I.sayWrong('en', { replay: false }, r0), 'Let’s look again!', 'wrong without anything, no replay → wrong.any');
// sweep: every thing × topic is clean and positive
const SWEEP = [['colors', COLORS.map(egg), { nameKind: 'color', nameValue: 'red' }, { color: 'red' }],
  ['shapes', SHAPES.map(s => shp(s)), { nameKind: 'shape', nameValue: 'star' }, { shape: 'star' }],
  ['size', [segg(true), segg(false)], { nameKind: 'size', nameValue: 'big' }, { size: 'big' }],
  ['count', [1, 4, 7, 10, 12].map(dots), { nameKind: 'number', nameValue: 6 }, { n: 6, kind: 'dots' }],
  ['animals', ANIMALS.map(anim), { nameKind: 'animal', nameValue: 'duck' }, { animal: 'duck' }],
  ['animals', ANIMALS.map(anim), { nameKind: 'animal', nameValue: 'snake' }, { animal: 'snake' }],
  ['letters', LETTERS.map(glyphL), { nameKind: 'letter', nameValue: 'B' }, { letter: 'B' }],
  ['lower', LETTERS.map(c => glyphL(c.toLowerCase())), { nameKind: 'letter', nameValue: 'g' }, { letter: 'G' }],
  ['initial', ANIMALS.map(anim), { nameKind: 'letter', nameValue: 'C' }, { letter: 'C' }],
  ['add', [3, 5, 9, 12].map(glyphN), { nameKind: 'number', nameValue: 7 }, { a: 3, b: 4 }],
  ['sub', [0, 2, 5].map(glyphN), { nameKind: 'number', nameValue: 4 }, { a: 7, b: 3 }],
  ['oddeven', [1, 2, 3, 4, 11, 20].map(glyphN), { nameKind: 'parity', nameValue: 'odd' }, { parity: 'odd' }]];
for (const lang of I.langs) for (const [topic, things, want, params] of SWEEP) for (const th of things) for (let v = 0; v < 3; v++) for (const replay of [true, false]) {
  const rng = () => v / 3, e = { thing: th, topic, params, want, replay, got: { nameKind: th.nameKind, nameValue: th.nameValue } };
  const rt = I.sayRight(lang, e, rng), wr = I.sayWrong(lang, e, rng), pk = I.sayPickup(lang, e, rng), dm = I.sayDemo(lang, e);
  ok(clean(rt) && positive(rt), `${lang} ${topic} right ${JSON.stringify(th)}: ${rt}`);
  ok(clean(wr) && positive(wr), `${lang} ${topic} wrong ${JSON.stringify(th)} replay ${replay}: ${wr}`);
  ok(clean(pk) && pk !== I.t(lang, 'praise', null, rng), `${lang} ${topic} name ${JSON.stringify(th)}: ${pk}`);
  ok(clean(dm) && positive(dm), `${lang} ${topic} demo note ${JSON.stringify(th)}: ${dm}`);
  if (replay) ok(/listen|nghe/i.test(wr), `${lang} ${topic} wrong with replay says "listen again": ${wr}`);
  if (['add', 'sub'].includes(topic)) ok(!wr.toLowerCase().includes(I.numberName(lang, want.nameValue)) || th.n === want.nameValue, `${lang} ${topic} wrong never says the answer: ${wr}`);
  if (topic === 'animals' && th.animal !== want.nameValue) ok(wr.toLowerCase().includes(I.name(lang, 'sound', th.animal)), `${lang} animals wrong says the tapped animal's sound: ${wr}`);
}
for (const lang of I.langs) for (let n = 1; n <= 10; n++) for (let v = 0; v < 3; v++) {
  const s = I.sayRight(lang, beatE(n), () => v / 3);
  ok(clean(s) && positive(s) && s.toLowerCase().startsWith(I.numberName(lang, n)), `${lang} right beat ${n} [${v}]: ${s}`);
}
for (let i = 0; i <= 20; i++) for (const lang of I.langs) ok(clean(I.sayCount(lang, i)), `${lang} sayCount ${i}`);
eq(I.sayCount('en', 3), 'Three!', 'sayCount en (also Rio\'s demoCount)');
eq(I.sayCount('vi', 3), 'Ba!', 'sayCount vi');
ok(clean(I.sayCount('en', 25)), 'sayCount beyond 20 does not throw');
eq(I.sayCountRun('en', 3), 'One, two, three!', 'count run default (taps)');
eq(I.sayCountRun('en', 3, 'beat'), 'One, two, three!', 'count run beat (REQUIREMENT)');
eq(I.sayCountRun('vi', 3, 'beat'), 'Một, hai, ba!', 'count run beat vi (REQUIREMENT)');
eq(I.sayCountRun('en', 1, 'beat'), 'One!', 'count run beat n = 1');
eq(I.sayCountRun('en', 5, 'dots'), 'One, two, three, four, five dots!', 'count run dots');
eq(I.sayCountRun('vi', 3, 'dots'), 'Một, hai, ba chấm!', 'count run dots vi');
eq(I.sayCountRun('en', 3, { kind: 'dots', n: 3 }), 'One, two, three dots!', 'count run with a dots thing');
eq(I.sayCountRun('en', 2, { kind: 'big' }), 'One, two!', 'count run with the big egg thing');
eq(I.sayCountRun('en', 1, 'dots'), 'One dot!', 'count run dots singular');
eq(I.sayCountDone('en', 3, 'beat', r0), 'Three taps! Hooray!', 'countDone taps');
eq(I.sayCountDone('vi', 3, 'beat', r0), 'Ba cái! Hoan hô!', 'countDone vi taps');
eq(I.sayCountDone('vi', 3, 'dots', r0), 'Ba chấm! Hoan hô!', 'countDone vi dots');
for (const lang of I.langs) for (let n = 1; n <= 12; n++) for (const k of ['beat', 'dots']) ok(clean(I.sayCountRun(lang, n, k)), `${lang} count run ${n} ${k}`);
eq(I.sayBeatNudge('en', { i: 2, n: 3 }, r0), 'Two! One more!', 'beatNudge en');
eq(I.sayBeatNudge('vi', { i: 2, n: 3 }, r0), 'Hai rồi! Thêm một cái nữa!', 'beatNudge vi');
eq(I.sayBeatNudge('en', { i: 1, n: 4 }, r0), 'One! Three more!', 'beatNudge en: remaining count');
eq(I.sayBeatNudge('vi', { i: 2, n: 5 }, r5), 'Được hai cái rồi! Bé gõ thêm ba cái nữa nhé!', 'beatNudge vi 2nd wording');
eq(I.t('en', 'beatNudge', { i: 3, n: 5 }, r9), 'Three! Keep going, two more!', 'beatNudge via t()');
ok(clean(I.sayBeatNudge('en', {})) && positive(I.sayBeatNudge('en', {})), 'beatNudge without i/n → an idle line');
for (const lang of I.langs) for (let n = 2; n <= 10; n++) for (let i = 1; i < n; i++) for (let v = 0; v < 3; v++) {
  const s = I.sayBeatNudge(lang, { i, n }, () => v / 3);
  ok(clean(s) && positive(s) && s.toLowerCase().includes(I.numberName(lang, n - i)), `${lang} beatNudge ${i}/${n} [${v}]: ${s}`);
}

section('talk');
eq(I.t('en', 'talk.colors', { color: 'red' }), 'What colour is this egg?', 'talk.colors en — never says the answer');
eq(I.t('vi', 'talk.colors', {}), 'Quả trứng này màu gì nhỉ?', 'talk.colors vi');
eq(I.t('en', 'talk.colorsWhich', { color: 'red' }), 'Which egg is red?', 'talk.colorsWhich en');
eq(I.t('vi', 'talk.colorsWhich', { color: 'red' }), 'Quả trứng nào màu đỏ nhỉ?', 'talk.colorsWhich vi');
eq(I.t('en', 'talk.shapes', { shape: 'star' }), 'Which one is the star?', 'talk.shapes en (REQUIREMENT)');
eq(I.t('vi', 'talk.shapes', { shape: 'circle' }), 'Hình tròn là cái nào nhỉ?', 'talk.shapes vi');
eq(I.t('vi', 'talk.shapes', { shape: 'star' }), 'Hình ngôi sao là cái nào nhỉ?', 'talk.shapes vi star');
eq(I.t('en', 'talk.shapes', {}), 'What shape is this?', 'talk.shapes without shape');
eq(I.t('en', 'talk.shapes5', { shape: 'star', color: 'blue' }), 'Which one is the blue star?', 'talk.shapes5');
eq(I.t('en', 'talk.size', { size: 'big' }), 'Which egg is big?', 'talk.size en');
eq(I.t('vi', 'talk.size', { size: 'small' }), 'Quả trứng nào nhỏ nhỉ?', 'talk.size vi');
eq(I.t('en', 'talk.size', {}), 'Which one is big?', 'talk.size without anything');
eq(I.t('en', 'talk.count', { n: 4 }), 'How many dots?', 'talk.count en (REQUIREMENT "How many spots?") — never says the answer');
eq(I.t('vi', 'talk.count', { n: 4 }), 'Có mấy chấm nào?', 'talk.count vi');
eq(I.t('en', 'talk.count', { n: 1 }), 'How many dots?', 'talk.count plural even for one');
eq(I.t('en', 'talk.animals', { animal: 'duck' }), 'Who says quack?', 'talk.animals en (REQUIREMENT)');
eq(I.t('vi', 'talk.animals', { animal: 'duck' }), 'Ai kêu cạp cạp nhỉ?', 'talk.animals vi');
eq(I.t('en', 'talk.animals', {}), 'Who is this?', 'talk.animals without animal → "Who is this?"');
eq(I.t('en', 'talk.animalsWho', { animal: 'duck' }), 'Who is this?', 'talk.animalsWho never says the answer');
eq(I.t('en', 'talk.letters', { letter: 'M' }), 'Where is the letter M?', 'talk.letters');
eq(I.t('en', 'talk.lower', { letter: 'G' }), 'Where is small g? It goes with big G!', 'talk.lower');
eq(I.t('vi', 'talk.initial', { animal: 'duck', letter: 'V' }), 'Vịt bắt đầu bằng chữ gì nhỉ?', 'talk.initial vi (no answer)');
eq(I.t('en', 'talk.initial', { animal: 'snake', letter: 'S' }), 'Which letter does snake start with?', 'talk.initial en from animal');
eq(I.t('en', 'talk.add', { a: 2, b: 3 }), 'What is 2 + 3?', 'talk.add');
eq(I.t('en', 'talk.add', {}), 'What is the answer?', 'talk.add without a/b');
eq(I.t('en', 'talk.oddeven', { parity: 'odd' }), 'Which number is odd?', 'talk.oddeven');
eq(I.t('vi', 'talk.oddeven', { parity: 'even' }), 'Số nào là số chẵn nhỉ?', 'talk.oddeven vi');
// Talk choices are {id, thing:{kind, …}} (EggArt.drawIcon kinds: any egg thing, plus number / color / size / sound)
const CHOICES = [].concat(
  COLORS.map(c => ({ id: 'c' + c, thing: { kind: 'color', color: c } })),
  COLORS.map(c => ({ id: 'e' + c, thing: { kind: 'egg', color: c } })),
  SHAPES.map(s => ({ id: 's' + s, thing: { kind: 'shape', shape: s, color: 'red' } })),
  ANIMALS.map(a => ({ id: 'a' + a, thing: { kind: 'animal', animal: a } })),
  ANIMALS.map(a => ({ id: 'o' + a, thing: { kind: 'sound', animal: a } })),
  Array.from({ length: 13 }, (_, n) => ({ id: 'n' + n, thing: { kind: 'number', n } })),
  Array.from({ length: 12 }, (_, n) => ({ id: 'd' + (n + 1), thing: { kind: 'dots', n: n + 1 } })),
  LETTERS.map(L => ({ id: 'l' + L, thing: { kind: 'glyph', text: L } })), LETTERS.map(L => ({ id: 'q' + L, thing: { kind: 'glyph', text: L.toLowerCase() } })),
  ['big', 'small'].map(s => ({ id: 'z' + s, thing: { kind: 'size', big: s === 'big' } })),
  ['big', 'small'].map(s => ({ id: 'y' + s, thing: { kind: 'egg', color: 'red', big: s === 'big' } })));
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
  byPrefix('a').slice(3, 6), byPrefix('o').slice(1, 4), byPrefix('n').slice(2, 5), byPrefix('d').slice(0, 3), byPrefix('z'), byPrefix('y')]) {
  const set = group.map(c => ({ id: c.id, words: I.choiceWords(lang, c) }));
  for (const c of group) {
    const kv = I.kindValue(c), said = I.name(lang, kv[0], kv[1]);
    eq(V.match([said], set), c.id, `${lang} talk choice said "${said}" → ${c.id}`);
    eq(V.match([I.stripMarks(said)], set), c.id, `${lang} talk choice said without marks "${I.stripMarks(said)}" → ${c.id}`);
    if (kv[0] === 'animal') eq(V.match([I.name(lang, 'sound', kv[1])], set), c.id, `${lang} talk choice answered by the sound → ${c.id}`);
  }
}
ok(I.choiceWords('vi', { id: 'c0', thing: { kind: 'color', color: 'blue' } }).includes('xanh duong'), 'choiceWords colour → no-mark forms');
ok(I.choiceWords('vi', { id: 't', thing: { kind: 'animal', animal: 'dino' } }).includes('khung long'), 'choiceWords animal → "khung long"');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'dots', n: 4 } }).includes('4'), 'choiceWords dots → digit');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'egg', color: 'red' } }).includes('red'), 'choiceWords egg → colour');
ok(I.choiceWords('en', { id: 'n', thing: { kind: 'sound', animal: 'duck' } }).includes('quack'), 'choiceWords sound icon → "quack"');
eq(I.talkWrong('en', { thing: { kind: 'color', color: 'blue' } }), 'It is blue! Good try!', 'talkWrong(colour choice)');
eq(I.talkWrong('vi', { thing: { kind: 'egg', color: 'blue' } }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'talkWrong egg colour vi');
eq(I.talkWrong('en', { thing: { kind: 'shape', shape: 'oval', color: 'red' } }), 'It is an oval! Good try!', 'talkWrong shape → an oval');
eq(I.talkWrong('en', { thing: { kind: 'animal', animal: 'duck' } }), 'It is the duckling, quack! Good try!', 'talkWrong animal says its sound');
eq(I.talkWrong('vi', { thing: { kind: 'animal', animal: 'frog' } }), 'Là ếch con đó, ộp ộp! Bé cố gắng lắm!', 'talkWrong animal vi');
eq(I.talkWrong('en', { thing: { kind: 'sound', animal: 'owl' } }), 'It is the owlet, hoot! Good try!', 'talkWrong sound icon');
eq(I.talkWrong('vi', { id: 'c1', thing: { kind: 'number', n: 7 } }), 'Là số bảy đó! Bé cố gắng lắm!', 'talkWrong number choice');
eq(I.talkWrong('en', { thing: { kind: 'dots', n: 3 } }), 'It is three! Good try!', 'talkWrong dots');
eq(I.talkWrong('en', { thing: { kind: 'glyph', text: 'g' } }), 'It is small letter g! Good try!', 'talkWrong small letter choice');
eq(I.talkWrong('en', { thing: { kind: 'size', big: true } }), 'It is the big one! Good try!', 'talkWrong size');
eq(I.talkWrong('vi', { thing: { kind: 'egg', color: 'red', big: true } }), 'Là quả trứng to đó! Bé cố gắng lắm!', 'talkWrong size vi');
eq(I.talkWrong('en', 'color', 'red'), 'It is red! Good try!', 'talkWrong colour');
eq(I.talkWrong('en', { kind: 'parity', value: 'odd' }), 'It is odd! Good try!', 'talkWrong object arg');
eq(I.talkWrong('en', 'color', null), 'Good try! Let’s sing more eggs!', 'talkWrong without value');
for (const t of TOPICS) for (const lang of I.langs) ok(clean(I.t(lang, 'talk.' + t, { animal: 'duck', size: 'big', n: 4, a: 1, b: 2, letter: 'B', color: 'red', shape: 'star', parity: 'odd' })), `${lang} talk.${t}`);
for (const lang of I.langs) for (const k of ['talk.colors', 'talk.colorsAny', 'talk.count', 'talk.countAny', 'talk.animals', 'talk.animalsAny', 'talk.animalsWho', 'talk.initial', 'talk.add', 'talk.sub'])
  ok(!/\{(n|num|ans|answer|color|animal)\}/.test(I.raw(lang, k)), `${lang} ${k} does not speak the answer`);

// the real eggs content.js (when it has the new animals): every prompt / Talk key + params and every egg renders clean
if (contentSB) {
  section('content.js: every promptKey / Talk key / egg it produces');
  const C = contentSB.SE.Content, RNG = contentSB.SE.RNG;
  const mkRng = (seed) => { try { return new RNG(seed); } catch (e) { return RNG(seed); } };
  let n = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const topic of TOPICS) for (const lang of I.langs) for (let seed = 1; seed <= 6; seed++) {
    let rd = null, tk = null;
    try { rd = C.makeRound(topic, { age, lang, rng: mkRng(seed), roundIndex: seed % 4, level: seed % 4, surprise: null }); } catch (e) { /* topic not for this age */ }
    try { tk = C.makeTalk(topic, { age, lang, rng: mkRng(seed) }); } catch (e) { /* ignore */ }
    if (rd && rd.steps && rd.eggs) for (const st of rd.steps) {
      n++;
      ok(I.has(lang, st.promptKey), `${lang} content prompt key ${st.promptKey} exists`);
      const s = I.ask(lang, st.promptKey, st.params || {}, { rng: r9 });
      ok(clean(s) && positive(s) && (s !== I.t(lang, 'p.any', null, r9) || !I.PROMPTS[st.promptKey]), `${lang} ${topic} age ${age} ${st.promptKey} ${JSON.stringify(st.params)}: ${s}`);
      const ask = Object.assign({ type: 'ask', afterDemo: true, echo: true }, st);
      const tu = I.sayTurn(lang, ask, { age, rng: r9 });
      ok(clean(tu) && positive(tu), `${lang} ${topic} age ${age} turn line ${JSON.stringify(st.params)}: ${tu}`);
      for (const cm of rd.eggs) {
        const e = { id: cm.id, thing: cm.thing, topic, params: st.params, promptKey: st.promptKey, mode: st.mode };
        const pu = I.sayPickup(lang, e, r9);
        ok(clean(pu) && pu !== I.t(lang, 'praise', null, r9), `${lang} ${topic} name ${JSON.stringify(cm.thing)}: ${pu}`);
        if ((st.targets || []).includes(cm.id)) {
          const dm = I.sayDemo(lang, Object.assign({ type: 'demoNote', nameKind: cm.thing.nameKind, nameValue: cm.thing.nameValue }, e));
          ok(clean(dm) && positive(dm), `${lang} ${topic} demo note ${JSON.stringify(cm.thing)}: ${dm}`);
          const cnt = st.mode === 'beat' ? { n: st.need || (st.params || {}).n } : undefined;
          const f = I.sayRight(lang, Object.assign({ count: cnt }, e), r9);
          ok(clean(f) && positive(f) && f !== I.t(lang, 'right.any', null, r9), `${lang} ${topic} right ${JSON.stringify(cm.thing)}: ${f}`);
          if (st.mode === 'beat') {
            const nu = I.sayBeatNudge(lang, { i: 1, n: Math.max(2, cnt.n) }, r9);
            ok(clean(nu) && positive(nu), `${lang} beatNudge for ${JSON.stringify(st.params)}: ${nu}`);
          }
        } else if (st.mode !== 'beat' && (st.mode !== 'findAll' || !cm.target)) {
          for (const replay of [true, false]) {
            const w = I.sayWrong(lang, Object.assign({ got: { nameKind: cm.thing.nameKind, nameValue: cm.thing.nameValue },
              want: { nameKind: st.nameKind, nameValue: st.nameValue }, replay }, e), r9);
            ok(clean(w) && positive(w), `${lang} ${topic} wrong ${JSON.stringify(cm.thing)} want ${st.nameKind}/${st.nameValue}: ${w}`);
            if (['colors', 'shapes', 'animals', 'size', 'letters', 'lower', 'count'].includes(topic))
              ok(!I.raw(lang, replay ? 'wrong.againAny' : 'wrong.any').includes(w), `${lang} ${topic} wrong names the egg: ${w}`);
          }
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

section('speech text: letters, maths, "Rio"');
eq(I.speech('en', 'That’s letter D. Let’s tap letter B!'), 'That’s letter dee. Let’s tap letter bee!', 'en letter names');
eq(I.speech('en', 'D is for duckling!'), 'dee is for duckling!', 'en "D is for"');
eq(I.speech('en', 'Snake starts with S! Let’s look again!'), 'Snake starts with ess! Let’s look again!', 'en starts with');
eq(I.speech('en', 'Big B has a little friend. Tap small b!'), 'Big bee has a little friend. Tap small bee!', 'en big/small letters');
eq(I.speech('en', 'Yes! Letter B!'), 'Yes! Letter bee!', 'en right "Letter B!"');
eq(I.speech('en', 'What is 2 + 3? Tap the answer!'), 'What is 2 plus 3? Tap the answer!', 'en plus');
eq(I.speech('vi', 'Bé ơi, 7 − 2 bằng mấy?'), 'Bé ơi, 7 trừ 2 bằng mấy?', 'vi minus');
eq(I.speech('vi', 'Bé ơi, gõ quả trứng chữ B nhé!'), 'Bé ơi, gõ quả trứng chữ bờ nhé!', 'vi phonics');
eq(I.speech('vi', 'Chữ Ê, ếch!'), 'Chữ ê, ếch!', 'vi letter Ê');
eq(I.speech('vi', 'Đúng rồi! Chữ b thường!'), 'Đúng rồi! Chữ bờ thường!', 'vi small letter');
eq(I.speech('en', 'Hi! I am Rio.'), 'Hi! I am Rio.', 'en "Rio" as written');
eq(I.speech('vi', 'Mình là Rio, chú rồng nhỏ. Rio giúp bé nhé!'), 'Mình là Rio, chú rồng nhỏ. Rio giúp bé nhé!', 'vi "Rio" as written');
eq(I.speech('en', 'Let’s sing it together — tap an egg!'), 'Let’s sing it together, tap an egg!', 'dash → comma pause');
eq(I.speech('en', 'Your turn — tap the big egg three times!'), 'Your turn, tap the big egg three times!', '"big egg" is not a letter');
eq(I.speech('en', 'Who says quack? Tap the duckling!'), 'Who says quack? Tap the duckling!', 'animal prompt unchanged');
eq(I.speech('en', 'Rio is listening…'), 'Rio is listening.', 'ellipsis → full stop');
eq(V.spoken('vi', 'Chào bé! Mình là Rio.'), 'Chào bé! Mình là Rio.', 'Voice.spoken uses I18N.speech');
eq(V.spoken('en', 'Tap the letter B!'), 'Tap the letter bee!', 'Voice.spoken letter names');
eq(V.spoken('vi', '…rồi màu xanh dương!'), 'rồi màu xanh dương!', 'Voice.spoken: the cue without the leading "…"');


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
  sb4.SE = {};
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
  // a long swipe across the egg band: every move arrives, in order, even far outside the canvas (pointer capture keeps the events on the canvas)
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
  sb7.SE = {};
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
  sb5.SE = {};
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
  sb6.SE = {};
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
ok(sb.SE.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into SE.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof SE.Input.attach === 'function' && typeof SE.Input.kidProof === 'function' && typeof SE.Input.holdButton === 'function',
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
  sbx.SE = {};
  env.SE = load(sbx, ['i18n.js', 'voice.js']);
  env.V = env.SE.Voice;
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
  ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.25) < 1e-9, 'Rio the tiny dragon: rate 0.9, pitch 1.25');
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
  V2.say('Find the letter B!'); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Find the letter bee!', 'speech() applied to the utterance');
  ok(V2.log.some(e => e.text === 'Find the letter B!'), 'log keeps the display text');
  E.end(); await wait(10);
  // vi: "Rio" goes to TTS as written, letter names are rewritten; the bubble text (onStart, log) is the display text
  let startText = null; V2.onStart = (t) => { starts++; startText = t; };
  const dv = V2.say('Mình là Rio. Bé gõ quả trứng chữ B nhé!', { lang: 'vi' }); await wait(20);
  eq(E.spoken[E.spoken.length - 1].text, 'Mình là Rio. Bé gõ quả trứng chữ bờ nhé!', 'vi utterance: "Rio" kept, "chữ bờ"');
  eq(startText, 'Mình là Rio. Bé gõ quả trứng chữ B nhé!', 'onStart gets the display text');
  E.end(); await dv;
  // volume follows setVolume
  V2.setVolume(0.4);
  const vv = V2.say('quiet please'); await wait(20);
  ok(Math.abs(E.spoken[E.spoken.length - 1].volume - 0.4) < 1e-9, 'utterance volume = setVolume');
  E.end(); await vv; V2.setVolume(1);
  // sayKey
  const sk = V2.sayKey('p.animals', { animal: 'duck' }, { lang: 'vi' });
  ok(/vịt con/i.test(sk.text) && /cạp cạp/i.test(sk.text) && /gõ/i.test(sk.text), 'sayKey renders the vi line: ' + sk.text);
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
  ok(V2.log.some(e => e.text === 'fast line'), 'speed > 1: the line is still logged (tests read SE.debug.voiceLog)');
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
  E3.SE.__dummy = 0;
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
  const pr2 = V2.listen({ lang: 'en', choices: ch('en', 'animal', ['duck', 'owl', 'frog']), timeoutMs: 2000 });
  E.rec.onresult({ resultIndex: 0, results: [result(false, 'the owly')] });
  eq((await pr2).id, 'owl', 'interim match resolves after a short wait');
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
