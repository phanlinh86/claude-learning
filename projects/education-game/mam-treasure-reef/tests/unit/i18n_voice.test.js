#!/usr/bin/env node
// Mầm's Treasure Reef — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/mam-treasure-reef:   node tests/unit/i18n_voice.test.js
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
  return sb.TR;
}

let pass = 0, fail = 0;
const asyncTests = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL  ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('-- ' + n); }

// ------------------------------------------------------------------ load without speechSynthesis
const sb = makeSandbox();
sb.TR = { debug: { voiceLog: [] } };
let TR;
try { TR = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = TR.I18N, V = TR.Voice;

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const ANIMALS = ['crab', 'octopus', 'seahorse', 'clownfish', 'dolphin', 'jellyfish', 'starfish', 'whale', 'puffer'];   // DESIGN §5.1
const LAGOONS = ['beach', 'coral', 'cave', 'bay', 'ship', 'rainbow'];
const AVATARS = ['turtle', 'crab', 'octopus', 'seahorse', 'clownfish', 'dolphin'];
// every ui.* key of the brief (DESIGN §6/§7) + the ones index.html / main.js / ui.js / render.js ask for
const UI = ['title', 'subtitle', 'tagline', 'play', 'whoPlays', 'newProfile', 'editProfile', 'profiles', 'name', 'namePlaceholder',
  'sayAs', 'sayAsHint', 'avatar', 'age', 'years', 'language', 'map', 'treasure', 'locked', 'lockedHint', 'lagoon', 'resume',
  'continue', 'nextLagoon', 'lagoonDone', 'chapter', 'volume', 'louder', 'quieter', 'settings', 'sound', 'music', 'voice', 'mic',
  'listening', 'tapOrSay', 'tapTutu', 'hello', 'pickLagoon', 'players', 'profilesHint', 'treasureIntro', 'unlocked', 'micDenied', 'micUnsupported', 'voiceMissing', 'done', 'skip', 'paused', 'home',
  'back', 'cancel', 'save', 'on', 'off', 'playAgain', 'holdForParents', 'welcome', 'delete', 'deleteConfirm', 'pearls', 'stars',
  'totalStars', 'totalPearls', 'playTime', 'minutes', 'allDone', 'trophy.none', 'trophy.bronze', 'trophy.silver', 'trophy.gold',
  'langName.en', 'langName.vi'].concat(AVATARS.map(a => 'avatar.' + a));
const LABELS = ['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(LAGOONS.map(k => 'lagoon.' + k + '.name')).concat(LAGOONS.map(k => 'lagoon.' + k + '.intro'))
  .concat(TOPICS.map(k => 'p.' + k))
  .concat(['p.animalsNext', 'p.animalsAll', 'p.colorsOne', 'p.shapesOne', 'p.countAny'])
  .concat(TOPICS.map(k => 'p.dig.' + k)).concat(TOPICS.map(k => 'p.dig.' + k + 'Any'))
  .concat(TOPICS.map(k => 'p.next.' + k)).concat(['p.next.any'])
  .concat(LABELS.map(k => 'say.correct.' + k))
  .concat(['say.correct.word', 'say.correct.treasure', 'say.countDone', 'say.land', 'say.dig', 'say.crab', 'say.photobomb',
    'say.wrong.animal', 'say.wrong.item', 'say.wrong.item.a', 'say.wrong.item.letter', 'say.levelDone', 'say.lagoonDone'])
  .concat(['praise', 'great', 'wrong', 'miss', 'hint', 'idle', 'talk.intro', 'talk.right', 'talk.wrong', 'talk.animalsAny',
    'talk.wrong.a', 'talk.wrong.size', 'talk.wrong.animal', 'talk.wrong.letter', 'talk.wrong.parity', 'session.done'])
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
// walk both trees: every key of en is in vi and vice versa, same shape (string vs list)
for (const k of I.keys('en')) {
  ok(I.has('vi', k), `vi has ${k}`);
  eq(Array.isArray(I.raw('vi', k)), Array.isArray(I.raw('en', k)), `${k} has the same shape in en and vi`);
}
for (const k of I.keys('vi')) ok(I.has('en', k), `en has ${k}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
eq(JSON.stringify(I.ANIMALS), JSON.stringify(ANIMALS), 'I18N.ANIMALS = DESIGN §5.1');
eq(JSON.stringify(I.LAGOONS), JSON.stringify(LAGOONS), 'I18N.LAGOONS = DESIGN §5.1');
eq(JSON.stringify(I.TOPICS.slice().sort()), JSON.stringify(TOPICS.slice().sort()), 'I18N.TOPICS');
// keys the game code asks for at run time
(function () {
  const src = ['main.js', 'ui.js', 'render.js'].map(f => { try { return fs.readFileSync(path.join(JS, f), 'utf8'); } catch (e) { return ''; } }).join('\n')
    + (function () { try { return fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8'); } catch (e) { return ''; } })();
  const used = new Set();
  src.replace(/['"`]((?:ui|talk|session|say|weather|lagoon|topic)\.[A-Za-z.]+[A-Za-z])['"`]/g, (m, k) => { used.add(k); return m; });
  for (const k of used) for (const lang of I.langs) ok(I.has(lang, k), `key used by the game code exists: ${lang} ${k}`);
})();
(function () {
  const all = I.langs.map(l => I.keys(l).map(x => [].concat(I.raw(l, x)).join(' ')).join(' ')).join(' ');
  for (const re of [/\bLumi\b/, /\bowlet\b/i, /\bflowers?\b/i, /\bseeds?\b/i, /\bpots?\b/i, /\bbloom/i, /snow garden/i, /flower garden/i, /\bpolar\b/i,
    /bông hoa/i, /trồng hoa/i, /hạt giống/i, /\bchậu\b/i, /Bắc Cực/, /\bdino\b/i, /\bpuppy\b/i, /\bnest\b/i, /\bPip\b/, /\bBo\b/])
    ok(!re.test(all), `no leftover wording ${re}`);
  ok(/Tutu/.test(all), 'Tutu is named');
})();

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right', 'say.land', 'say.dig', 'say.crab', 'say.photobomb']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 10, `${lang} ${k} has 5–10 variants (${v && v.length})`);
}
for (const lang of I.langs) {
  const g = I.raw(lang, 'great');
  ok(g.length >= 8, `${lang} great has ≥ 8 variants (${g.length})`);
  ok(g.every(s => s.includes('{child}')), `${lang} every great[] line has {child}`);
  ok(I.raw(lang, 'praise').length >= 8, `${lang} praise has ≥ 8 variants`);
  for (const k of ['idle', 'talk.right', 'session.done', 'say.lagoonDone']) {
    const v = I.raw(lang, k);
    ok(v.some(s => s.includes('{child}')) && v.some(s => !s.includes('{child}')), `${lang} ${k} has name + no-name variants`);
  }
}

section('Vietnamese wording sanity');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'vo so', 'ruong', 'ngoc trai', 'mau do', 'Tutu day'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
ok(/Bé ơi/.test(viAll) && /nhé!/.test(viAll) && /nào!/.test(viAll), 'vi uses "Bé ơi", "nhé!", "nào!"');
ok(/\{child\} ơi/.test(viAll), 'vi dig prompts call the child by name ("Mầm ơi, …")');
ok(/vỏ sò/.test(viAll) && /rương/.test(viAll) && /viên ngọc trai/.test(viAll) && /kho báu/.test(viAll), 'vi uses vỏ sò / rương / viên ngọc trai / kho báu');
eq(I.t('vi', 'ui.title'), 'Mầm Tìm Kho Báu', 'vi title');
eq(I.t('en', 'ui.title'), 'Mầm’s Treasure Reef', 'en title');
eq(I.t('en', 'ui.voice'), 'Tutu’s voice', 'ui.voice names Tutu');
eq(I.t('vi', 'ui.listening'), 'Tutu đang nghe…', 'vi listening');
eq(I.t('en', 'ui.sayAsHint'), 'How to say the name in English, e.g. Mum', 'sayAs hint');
eq(I.t('en', 'ui.lagoonDone'), 'Lagoon finished!', 'lagoonDone');
for (const a of ANIMALS) ok(/^con /.test(I.name('vi', 'animal', a)), `vi animal ${a} carries the classifier "con" (${I.name('vi', 'animal', a)})`);

section('no negative words for mistakes');
for (const k of ['wrong', 'miss', 'hint', 'say.wrong.animal', 'say.wrong.item', 'say.wrong.item.a', 'say.wrong.item.letter', 'talk.wrong',
  'talk.wrong.a', 'talk.wrong.size', 'talk.wrong.animal', 'talk.wrong.letter', 'talk.wrong.parity']) {
  const all = [].concat(I.raw('en', k)).join(' ').toLowerCase();
  ok(!/\b(no|wrong|bad|not|fail|incorrect|oh no)\b/.test(all), `en ${k} has no negative words`);
  const vi = [].concat(I.raw('vi', k)).join(' ').toLowerCase();
  ok(!/(^|\s)(sai|dở|tệ|hỏng)(\s|$|[!.,?])/u.test(vi), `vi ${k} has no negative words`);
}

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, stars: 7, child: 'Mai', answer: 'X', lagoon: 'Coral Garden', name: 'octopus', target: 'whale', animal: 'octopus', color: 'red',
  shape: 'star', size: 'big', letter: 'B', parity: 'odd', sum: '2+3', diff: '7−2' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let i = 0; i < raw.length; i++) {
    for (const child of ['Mai', '']) {
      const rng = { next: () => (i + 0.5) / raw.length };
      const s = I.t(lang, k, Object.assign({}, FULL, { child }), rng);
      ok(s.indexOf('{') < 0 && s.indexOf('}') < 0, `${lang} ${k}[${i}] child=${JSON.stringify(child)} fully replaced: ${s}`);
      ok(s.length > 0, `${lang} ${k} non-empty`);
      if (!child && k !== 'ui.namePlaceholder') ok(s.indexOf('Mai') < 0, `${lang} ${k} without a name does not use one`);
      ok(!/\b(bé bé|Bé bé|friend friend)\b/.test(s), `${lang} ${k}[${i}] no doubled fallback: ${s}`);
      if (!/^ui\./.test(k)) {
        const words = s.split(/\s+/).filter(Boolean).length;
        ok(words <= 12, `${lang} ${k}[${i}] ≤ 12 words (${words}): ${s}`);
      }
    }
  }
}
ok(I.t('en', 'p.count', {}).indexOf('{') < 0, 'missing params removed');
eq(I.t('xx', 'ui.play'), 'Play', 'unknown language falls back to English');
eq(I.t('en', 'no.such.key'), 'no.such.key', 'unknown key returns the key');

section('prompts with RAW round params');
eq(I.t('en', 'p.count', { n: 3, color: 'red' }), 'Put 3 pearls in the chest!', 'en count plural');
eq(I.t('en', 'p.count', { n: 1 }), 'Put 1 pearl in the chest!', 'en count singular');
eq(I.t('vi', 'p.count', { n: 3 }), 'Bé ơi, bỏ 3 viên ngọc trai vào rương nhé!', 'vi count');
eq(I.t('en', 'p.count', {}), 'Put the pearls in the chest and count with me!', 'count without n → generic');
eq(I.t('en', 'p.animals', { animal: 'crab' }), 'Put a treasure in the crab’s chest!', 'en animals crab');
eq(I.t('en', 'p.animals', { animal: 'puffer' }), 'Put a treasure in the pufferfish’s chest!', 'en animals pufferfish');
eq(I.t('vi', 'p.animals', { animal: 'crab' }), 'Bé ơi, bỏ kho báu vào rương của con cua nhé!', 'vi animals crab');
eq(I.t('vi', 'p.animals', { animal: { kind: 'animal', value: 'octopus' } }), 'Bé ơi, bỏ kho báu vào rương của con bạch tuộc nhé!', 'object param');
eq(I.t('en', 'p.animals', {}), 'Put a treasure in each friend’s chest!', 'animals without animal → generic');
eq(I.t('en', 'p.animalsNext', { animal: 'whale' }, () => 0), 'Now the whale!', 'en animalsNext');
eq(I.t('vi', 'p.animalsNext', { animal: 'dolphin' }, () => 0), 'Giờ đến con cá heo nhé!', 'vi animalsNext');
eq(I.t('en', 'p.colors', { color: 'red' }), 'Put each shell in the chest of the same colour!', 'en colors prompt');
eq(I.t('vi', 'p.colors'), 'Bé ơi, bỏ mỗi vỏ sò vào rương cùng màu nhé!', 'vi colors prompt');
eq(I.t('en', 'p.colorsOne', { color: 'orange' }), 'Put the orange shell in the orange chest!', 'en colorsOne');
eq(I.t('vi', 'p.colorsOne', { color: 'red' }), 'Bé ơi, bỏ vỏ sò màu đỏ vào rương màu đỏ nhé!', 'vi colorsOne');
eq(I.t('en', 'p.colorsOne', {}), I.t('en', 'p.colors'), 'colorsOne without colour → p.colors');
eq(I.t('en', 'p.size', { color: 'red' }), 'Big shells in the big chest, small shells in the small chest!', 'en size');
// dig prompts
eq(I.t('en', 'p.dig.colors', { color: 'red' }), 'Dig up the red shell!', 'en dig colors');
eq(I.t('vi', 'p.dig.colors', { color: 'red', child: 'Mầm' }), 'Mầm ơi, đào vỏ sò màu đỏ lên nhé!', 'vi dig colors with name');
eq(I.t('vi', 'p.dig.colors', { color: 'red', child: '' }), 'Bé ơi, đào vỏ sò màu đỏ lên nhé!', 'vi dig colors without name → Bé ơi');
eq(I.t('en', 'p.dig.colors', {}), 'Dig up the shells!', 'dig colors without colour → Any');
eq(I.t('en', 'p.dig.count', { n: 3 }), 'Dig up 3 pearls!', 'en dig count');
eq(I.t('en', 'p.dig.count', { n: 1 }), 'Dig up 1 pearl!', 'en dig count singular');
eq(I.t('vi', 'p.dig.count', { n: 3, child: 'Mầm' }), 'Mầm ơi, đào 3 viên ngọc trai lên nhé!', 'vi dig count');
eq(I.t('en', 'p.dig.animals', { animal: 'seahorse' }), 'Find the seahorse!', 'en dig animals');
eq(I.t('vi', 'p.dig.animals', { animal: 'seahorse', child: 'Mầm' }), 'Mầm ơi, tìm con cá ngựa nhé!', 'vi dig animals');
eq(I.t('en', 'p.dig.letters', { letter: 'B' }), 'Dig up the letter B!', 'en dig letters');
eq(I.t('vi', 'p.dig.letters', { letter: 'B', child: 'Mầm' }), 'Mầm ơi, đào chữ B lên nhé!', 'vi dig letters (display keeps B)');
eq(I.speech('vi', I.t('vi', 'p.dig.letters', { letter: 'B', child: 'Mầm' })), 'Mầm ơi, đào chữ bờ lên nhé!', 'vi dig letters spoken as phonics');
eq(I.t('en', 'p.dig.shapes', { shape: 'star' }), 'Dig up the star!', 'en dig shapes');
eq(I.t('en', 'p.dig.size', { size: 'big' }), 'Dig up a big shell!', 'en dig size');
eq(I.t('en', 'p.dig.lower', { letter: 'b' }), 'Dig up the small letter b!', 'en dig lower');
eq(I.t('en', 'p.dig.initial', { letter: 'C' }), 'Dig up the one that starts with the letter C!', 'en dig initial');
eq(I.t('en', 'p.dig.add', { n: 5 }), 'Dig up the one that makes 5!', 'en dig add');
eq(I.t('en', 'p.dig.sub', {}), 'Take away and dig up the answer!', 'en dig sub without n → Any');
eq(I.t('en', 'p.dig.oddeven', { parity: 'odd' }), 'Dig up an odd number!', 'en dig oddeven (an odd)');
eq(I.t('en', 'p.dig.oddeven', { parity: 'even' }), 'Dig up an even number!', 'en dig oddeven (an even)');
eq(I.t('vi', 'p.dig.oddeven', { parity: 'even', child: 'Mầm' }), 'Mầm ơi, đào một số chẵn lên nhé!', 'vi dig oddeven');
for (const tp of TOPICS) for (const lang of I.langs) {
  const s = I.t(lang, 'p.dig.' + tp, {});
  ok(s.indexOf('{') < 0 && s !== 'p.dig.' + tp, `${lang} p.dig.${tp} without params falls back (${s})`);
  const nx = I.t(lang, 'p.next.' + tp, {}, () => 0);
  ok(nx.indexOf('{') < 0 && nx !== 'p.next.' + tp, `${lang} p.next.${tp} without params falls back (${nx})`);
}
eq(I.t('en', 'p.next.colors', { color: 'blue' }, () => 0), 'Now the blue one!', 'en next colors');
eq(I.t('vi', 'p.next.colors', { color: 'blue' }, () => 0), 'Giờ đến vỏ sò màu xanh dương nhé!', 'vi next colors');
eq(I.t('en', 'p.next.animals', { animal: 'jellyfish' }, () => 0), 'Now the jellyfish!', 'en next animals');
eq(I.t('en', 'p.next.letters', { letter: 'M' }, () => 0), 'Now the letter M!', 'en next letters');
eq(I.t('en', 'p.next.colors', {}, () => 0), 'Now the next one!', 'next without param → any');
eq(I.t('en', 'talk.animals', { animal: 'starfish' }), 'Where is the starfish?', 'en talk animals');
eq(I.t('vi', 'talk.animals', { animal: 'whale' }), 'Con cá voi ở đâu nhỉ?', 'vi talk animals');
eq(I.t('en', 'talk.animals', {}), 'Tap a sea friend!', 'talk animals fallback');
eq(I.t('en', 'talk.colors'), 'What colour is this shell?', 'en talk colors');
eq(I.t('en', 'talk.count'), 'How many pearls?', 'en talk count');
eq(I.t('vi', 'talk.count'), 'Có bao nhiêu viên ngọc trai nào?', 'vi talk count');
eq(I.t('en', 'weather.0'), 'Good morning, reef! The water is sparkling!', 'weather 0');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'session.done', { stars: 40, child: '' }, () => 0), 'You found all the treasure! 40 stars!', 'session.done');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Tutu. Let’s find treasure!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Tutu. Let’s find treasure!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Tutu đây. Mình cùng tìm kho báu nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Tutu đây. Mình cùng tìm kho báu nhé!', 'vi welcome with name');
eq(I.t('en', 'lagoon.beach.name'), 'Shell Beach', 'lagoon name');
eq(I.t('en', 'ui.deleteConfirm', { child: 'Mầm' }), 'Delete Mầm’s profile and progress?', 'deleteConfirm');
eq(I.t('en', 'great', { child: 'Mầm' }, () => 0), 'Great job, Mầm!', 'great with name');
eq(I.t('en', 'great', { child: '' }, () => 0), 'Great job, friend!', 'great without name → friend');
eq(I.t('vi', 'great', { child: '' }, () => 0.15), 'Giỏi quá, bé ơi!', 'vi great without name → bé');
eq(I.t('vi', 'great', { child: 'Mầm' }, () => 0.15), 'Giỏi quá, Mầm ơi!', 'vi great with name');
I.setChild({ name: 'An', sayAs: 'Ahn' });
ok(I.t('en', 'ui.welcome').indexOf('An') > 0, 'setChild({name}) is the default {child}');
eq(I.child, 'An', 'setChild stores the name'); eq(I.sayAs, 'Ahn', 'setChild stores sayAs');
ok(I.t('en', 'great', null, () => 0).indexOf('Ahn') < 0, '{child} is never sayAs');
I.setChild('Bi'); eq(I.child, 'Bi', 'setChild(string) still works'); eq(I.sayAs, '', 'string form clears sayAs');
I.setChild('');
eq(I.t('en', 'say.correct.color', { answer: { kind: 'color', value: 'orange' } }, () => 0.99), 'An orange shell!', 'a → an');
eq(I.t('en', 'say.correct.color', { answer: { kind: 'color', value: 'red' } }, () => 0.99), 'A red shell!', 'a stays a');
ok(I.hasVietnamese('Mầm') && I.hasVietnamese('Đạt') && !I.hasVietnamese('Anna') && !I.hasVietnamese('Linh'), 'hasVietnamese');

section('names for every kind/value in §5.1');
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
const VALUES = {
  color: COLORS,
  shape: ['circle', 'square', 'triangle', 'star', 'heart', 'rectangle'],
  size: ['big', 'small'],
  animal: ANIMALS,
  parity: ['odd', 'even'],
  shell: COLORS.concat(['cream', 'shell']),
  pearl: ['pearl', 'cream'],
  tag: ['tag'],
  treasure: ['treasure'],
  number: Array.from({ length: 21 }, (_, i) => i)
};
const LETTERS = new Set(('ABCDEFGHIKLMNOPRSTUW' + 'ABCDEGHIKLMNOPSTUVXY' + 'ĂÂĐÊÔƠƯ').split(''));
VALUES.letter = Array.from(LETTERS).concat(Array.from(LETTERS).map(c => c.toLowerCase()));
VALUES.sum = []; VALUES.diff = [];
for (let a = 1; a <= 19; a++) for (let b = 1; a + b <= 20; b++) VALUES.sum.push(a + '+' + b);
for (let a = 1; a <= 10; a++) for (let b = 1; b <= a; b++) VALUES.diff.push(a + '−' + b);
for (const lang of I.langs) {
  for (const kind of Object.keys(VALUES)) for (const v of VALUES[kind]) {
    const n = I.name(lang, kind, v);
    ok(typeof n === 'string' && n.length > 0, `${lang} name ${kind} ${v}`);
    if (['color', 'shape', 'animal', 'parity', 'shell', 'pearl', 'tag', 'treasure'].includes(kind) && lang === 'vi')
      ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
    if (kind === 'sum' || kind === 'diff') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
    const w = I.words(lang, kind, v);
    ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${v}`);
    ok(w.every(x => x === x.toLowerCase()), `${lang} words ${kind} ${v} are lower-case`);
  }
  for (const e of sb.TR.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 1, `${lang} words for word ${e.word} include the animal forms`);
    ok(/^animal_/.test(e.sprite) && ANIMALS.includes(e.sprite.slice(7)), `${lang} word ${e.word} has a sea-animal sprite (${e.sprite})`);
    const first = I.stripMarks(e.word).charAt(0).toUpperCase();
    ok(first === e.initial || (lang === 'en' && e.word === 'fish'), `${lang} word ${e.word} initial ${e.initial} matches`);
  }
}
eq(I.NAME_KINDS.join(','), 'color,shape,size,animal,number,letter,parity,sum,diff,word,shell,pearl,tag,treasure', 'NAME_KINDS (DESIGN §5.1)');
eq(sb.TR.WORDS.vi.map(w => w.word + ' ' + w.initial).join(','), 'cua C,bạch tuộc B,cá ngựa C,cá hề C,cá heo C,sứa S,sao biển S,cá voi C,cá nóc C', 'vi initial words (§5.1)');
eq(sb.TR.WORDS.en.map(w => w.word + w.initial).join(','), 'crabC,octopusO,seahorseS,fishF,dolphinD,jellyfishJ,starfishS,whaleW,pufferfishP', 'en initial words');
ok(sb.TR.WORDS.vi.every(w => !/^(ch|th|ng)/i.test(I.stripMarks(w.word))), 'vi words never start with ch / th / ng (phonics digraphs)');
const EN_ANIMAL = { crab: 'crab', octopus: 'octopus', seahorse: 'seahorse', clownfish: 'clownfish', dolphin: 'dolphin', jellyfish: 'jellyfish',
  starfish: 'starfish', whale: 'whale', puffer: 'pufferfish' };
const VI_ANIMAL = { crab: 'con cua', octopus: 'con bạch tuộc', seahorse: 'con cá ngựa', clownfish: 'con cá hề', dolphin: 'con cá heo',
  jellyfish: 'con sứa', starfish: 'con sao biển', whale: 'con cá voi', puffer: 'con cá nóc' };
for (const a of ANIMALS) { eq(I.name('en', 'animal', a), EN_ANIMAL[a], 'en animal ' + a); eq(I.name('vi', 'animal', a), VI_ANIMAL[a], 'vi animal ' + a); }
eq(I.name('en', 'shell', 'red'), 'red shell', 'en shell red');
eq(I.name('vi', 'shell', 'red'), 'vỏ sò màu đỏ', 'vi shell red');
eq(I.name('en', 'shell', 'shell'), 'shell', 'en plain shell');
eq(I.name('vi', 'shell', 'cream'), 'vỏ sò', 'vi cream shell');
eq(I.name('en', 'seed', 'red'), 'red shell', 'legacy kind seed → shell');
eq(I.name('en', 'pearl', 'cream'), 'pearl', 'en pearl');
eq(I.name('vi', 'pearl', 'cream'), 'viên ngọc trai', 'vi pearl with classifier viên');
eq(I.name('vi', 'tag', 'A'), 'thẻ kho báu', 'vi tag');
eq(I.name('vi', 'treasure', 1), 'kho báu', 'vi treasure');
eq(I.name('vi', 'color', 'red'), 'màu đỏ', 'vi red');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('vi', 'number', 20), 'hai mươi', 'vi 20');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('vi', 'word', 'cá ngựa'), 'cá ngựa', 'vi word');
eq(I.name('en', 'word', 'animal_clownfish'), 'fish', 'word from sprite id (clownfish → fish)');
ok(I.words('en', 'color', 'blue').includes('blew'), 'blue/blew');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'number', 3).includes('3'), 'words include digits');
ok(I.words('vi', 'animal', 'octopus').includes('bach tuoc'), 'vi octopus stripped form');
ok(I.words('en', 'animal', 'puffer').includes('pufferfish') && I.words('en', 'animal', 'puffer').includes('blowfish'), 'en puffer forms');
ok(I.words('vi', 'word', 'cua').includes('con cua'), 'vi word cua accepts "con cua"');
ok(I.words('en', 'word', 'fish').includes('clownfish'), 'en word fish accepts "clownfish"');
ok(I.words('en', 'shell', 'red').includes('red') && I.words('en', 'shell', 'red').includes('shell'), 'shell words include colour + shell');
ok(I.words('vi', 'pearl', 'x').includes('ngọc trai'), 'vi pearl words');

// ----- names for everything content.js actually produces (if it loads and is the Treasure Reef version)
section('names for every item/label/choice content.js makes');
(function () {
  const sc = makeSandbox(); sc.TR = {};
  let C;
  try { C = load(sc, ['rng.js', 'i18n.js', 'content.js']); } catch (e) { console.log('   (content.js not loadable yet: ' + e.message + ')'); return; }
  if (!C.Content || !C.Content.makeRound) { console.log('   (TR.Content.makeRound missing — skipped)'); return; }
  if (!C.ANIMALS || C.ANIMALS[0] !== 'crab') { console.log('   (content.js is still the Snow Garden version — skipped)'); return; }
  const I2 = C.I18N;
  eq(JSON.stringify(C.ANIMALS), JSON.stringify(ANIMALS), 'content TR.ANIMALS = DESIGN §5.1 list');
  const ins = { top: 0, right: 0, bottom: 0, left: 0 };
  const layout = { W: 1280, H: 720, ins, groundY: 650,
    chest: { y: 560, w: 200, h: 156, xs: [300, 560, 820, 1080] }, tutu: { x: 105, y: 225, h: 175 },
    bubble: { x: 190, y: 24, w: 620, h: 104 }, play: { x: 40, y: 235, w: 1200, h: 270 },
    moundGrid: [{ x: 300, y: 320 }, { x: 560, y: 320 }, { x: 820, y: 320 }, { x: 300, y: 500 }, { x: 560, y: 500 }, { x: 820, y: 500 }] };
  const ages = [3, 4, 5, 6, 7];
  const plans = [];   // [{age, topic, mech}]
  for (const age of ages) {
    const seen = new Set();
    for (const lag of (C.LAGOONS || [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }])) {
      let plan;
      try { plan = C.Content.planFor ? C.Content.planFor(age, lag.id || lag) : C.Content.topicsFor(age).map(t => ({ topic: t, mech: 'drag' })); }
      catch (e) { ok(false, `planFor age ${age} lagoon ${lag.id}: ${e.message}`); continue; }
      for (const ch of plan) {
        const k = ch.topic + ':' + ch.mech;
        if (!seen.has(k)) { seen.add(k); plans.push({ age, topic: ch.topic, mech: ch.mech || 'drag', n: ch.n }); }
      }
    }
  }
  let rounds = 0, talks = 0;
  const seen = new Set();
  for (const lang of ['en', 'vi']) for (const p of plans) for (let s = 1; s <= 8; s++) {
    let r;
    try { r = C.Content.makeRound(p.topic, { age: p.age, lang, rng: new C.RNG(s * 31 + p.age), roundIndex: s % 4, layout, mech: p.mech }); }
    catch (e) { ok(false, `makeRound ${p.topic}/${p.mech} age ${p.age} ${lang}: ${e.message}`); continue; }
    rounds++;
    const txt = I2.t(lang, r.promptKey, r.params || {});
    ok(txt && txt !== r.promptKey && txt.indexOf('{') < 0, `${lang} ${r.promptKey} renders with round params: ${txt}`);
    if (p.mech === 'dig') ok(/^p\.dig\./.test(r.promptKey), `${lang} dig round uses a p.dig.* key (${r.promptKey})`);
    if (r.mode === 'ask' && r.queue) for (const bid of r.queue) {
      const b = r.baskets.find(x => x.id === bid);
      if (!b) continue;
      const q = I2.t(lang, 'p.animals', { animal: b.label.value });
      ok(q.indexOf(I2.name(lang, 'animal', b.label.value)) >= 0, `${lang} ask prompt names ${b.label.value}`);
    }
    for (const b of r.baskets || []) {
      const k = b.label.type + ':' + b.label.value + ':' + lang;
      if (seen.has(k)) continue; seen.add(k);
      const nm = I2.name(lang, b.label.type, b.label.value);
      ok(nm && nm !== 'undefined', `${lang} label ${k} named (${nm})`);
      const sc1 = I2.sayCorrect(lang, { nameKind: r.items[0].nameKind, nameValue: r.items[0].nameValue, label: b.label, count: 1, need: 3 });
      ok(sc1 && sc1.indexOf('{') < 0 && !/undefined/.test(sc1), `${lang} sayCorrect for ${k}: ${sc1}`);
    }
    for (const it of r.items || []) {
      const k = 'item:' + it.nameKind + ':' + it.nameValue + ':' + lang;
      if (seen.has(k)) continue; seen.add(k);
      ok(I2.NAME_KINDS.includes(it.nameKind), `${lang} item nameKind ${it.nameKind} is a known kind`);
      const nm = I2.name(lang, it.nameKind, it.nameValue);
      ok(nm && nm !== 'undefined' && nm !== 'null', `${lang} ${k} named (${nm})`);
      if (lang === 'vi' && ['color', 'animal', 'shell', 'shape', 'pearl'].includes(it.nameKind)) ok(nm !== String(it.nameValue), `vi ${k} translated (${nm})`);
      const sw = I2.sayWrong(lang, { nameKind: it.nameKind, nameValue: it.nameValue });
      ok(sw.indexOf('{') < 0 && !/undefined/.test(sw), `${lang} sayWrong (dig) for ${k}: ${sw}`);
    }
    if (r.queue && r.mode === 'dig') for (const id of r.queue) {
      const it = r.items.find(x => x.id === id);
      if (!it) continue;
      const nx = I2.t(lang, 'p.next.' + p.topic, Object.assign({}, r.params || {}, { color: it.color, shape: it.shape, animal: it.nameKind === 'animal' ? it.nameValue : undefined }), () => 0);
      ok(nx.indexOf('{') < 0, `${lang} p.next.${p.topic} renders (${nx})`);
    }
  }
  const topicsSeen = new Set(plans.map(p => p.topic));
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of topicsSeen) for (let s = 1; s <= 8; s++) {
    let tk;
    try { tk = C.Content.makeTalk(topic, { age, lang, rng: new C.RNG(s * 17 + age) }); }
    catch (e) { ok(false, `makeTalk ${topic}: ${e.message}`); continue; }
    if (!tk) continue;
    talks++;
    const q = I2.t(lang, tk.promptKey, tk.params || {});
    ok(q && q !== tk.promptKey && q.indexOf('{') < 0, `${lang} ${tk.promptKey} renders: ${q}`);
    if (topic === 'animals') ok(q.toLowerCase().indexOf(I2.name(lang, 'animal', tk.params.animal).toLowerCase()) >= 0, `${lang} talk.animals names the animal`);
    for (const c of tk.choices) {
      ok(I2.words(lang, c.kind, c.value).length > 0, `${lang} words for talk choice ${c.kind}:${c.value}`);
      const tw = I2.talkWrong(lang, c.kind, c.value);
      ok(tw.indexOf('{') < 0 && !/undefined/.test(tw), `${lang} talkWrong ${c.kind}:${c.value}: ${tw}`);
    }
    // the matcher picks the right choice from its own name
    const ans = tk.choices.find(c => c.id === tk.answerId);
    const said = I2.name(lang, ans.kind, ans.value);
    const ch2 = tk.choices.map(c => ({ id: c.id, kind: c.kind, value: c.value }));
    eq(V.match([said], ch2.map(c => ({ id: c.id, words: I2.words(lang, c.kind, c.value) }))), tk.answerId,
      `${lang} ${topic} talk: saying "${said}" picks the answer`);
  }
  ok(rounds > 100 && talks > 100, `enumerated ${rounds} rounds, ${talks} talks from content.js`);
})();

section('sayCorrect / sayWrong / sayCount / talkWrong / speech');
const r0 = () => 0;
eq(I.sayCorrect('en', { nameKind: 'shell', nameValue: 'red', label: { type: 'animal', value: 'crab' } }, r0), 'A treasure for the crab!', 'en animal');
eq(I.sayCorrect('vi', { nameKind: 'shell', nameValue: 'red', label: { type: 'animal', value: 'octopus' } }, r0), 'Kho báu tặng con bạch tuộc!', 'vi animal');
eq(I.sayCorrect('en', { nameKind: 'sum', nameValue: '2+3', label: { type: 'number', value: 5 } }, r0), 'Yes! Two plus three makes five!', 'en sum');
eq(I.sayCorrect('vi', { nameKind: 'diff', nameValue: '7−2', label: { type: 'number', value: 5 } }, r0), 'Đúng rồi! Bảy trừ hai bằng năm!', 'vi diff');
eq(I.sayCorrect('en', { nameKind: 'word', nameValue: 'whale', label: { type: 'letter', value: 'W' } }, r0), 'Whale starts with the letter W!', 'en word');
eq(I.sayCorrect('vi', { nameKind: 'word', nameValue: 'cua', label: { type: 'letter', value: 'C' } }, r0), 'Cua bắt đầu bằng chữ cờ!', 'vi word');
eq(I.sayCorrect('vi', { nameKind: 'color', nameValue: 'red', label: { type: 'color', value: 'red' } }, r0), 'Đúng rồi! Màu đỏ đó!', 'vi color');
eq(I.sayCorrect('vi', { nameKind: 'size', nameValue: 'big', label: { type: 'size', value: 'big' } }, () => 0.99), 'Vỏ sò to vào rương to!', 'vi size');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 7, label: { type: 'parity', value: 'odd' } }, r0), 'Yes! Seven is odd!', 'en parity');
eq(I.sayCorrect('en', { nameKind: 'pearl', nameValue: 'cream', label: { type: 'number', value: 3 }, count: 2 }, r0), 'Two!', 'count mode < need');
eq(I.sayCorrect('en', { nameKind: 'pearl', nameValue: 'cream', label: { type: 'number', value: 3 }, count: 3 }, r0), 'Three! You found 3 pearls!', 'count mode = need');
eq(I.sayCorrect('en', { nameKind: 'treasure', nameValue: 'x', label: { type: 'nothing', value: 1 } }, r0), 'Yes!', 'unknown label with an item kind → say.correct.treasure');
eq(I.sayCount('vi', 1, 4), 'Một!', 'vi count 1');
eq(I.sayCount('vi', 4, 4, r0), 'Bốn! Bé tìm được 4 viên ngọc trai rồi!', 'vi count done');
eq(I.sayCount('en', 1, 1, r0), 'One! You found 1 pearl!', 'en count done singular');
eq(I.sayCount('en', 12, 12, () => 0.5), 'Twelve! Yes! 12 pearls!', 'en count 12');
ok(I.raw('en', 'say.land').includes(I.sayLand('en', r0)), 'sayLand');
ok(I.raw('en', 'say.dig').includes(I.sayDig('en', r0)), 'sayDig');
ok(I.raw('vi', 'say.crab').includes(I.sayCrab('vi', r0)), 'sayCrab');
ok(I.raw('en', 'say.photobomb').includes(I.sayPhotobomb('en', r0)), 'sayPhotobomb');
for (const lang of I.langs) for (const t of LABELS)
  ok(I.sayCorrect(lang, { nameKind: 'color', nameValue: 'red', label: { type: t, value: t === 'number' ? 3 : t === 'animal' ? 'crab' : 'x' } }).indexOf('{') < 0, `${lang} sayCorrect ${t}`);
eq(I.sayWrong('en', { label: { type: 'animal', value: 'crab' }, target: { type: 'animal', value: 'whale' } }, r0),
  'That’s the crab’s chest. Where is the whale?', 'en sayWrong ask');
eq(I.sayWrong('vi', { label: { type: 'animal', value: 'crab' }, target: { type: 'animal', value: 'whale' } }, r0),
  'Rương của con cua đó. Con cá voi đâu nhỉ?', 'vi sayWrong ask');
eq(I.sayWrong('en', { nameKind: 'shell', nameValue: 'blue' }, r0), 'That’s a blue shell! Let’s look again!', 'en sayWrong dig shell');
eq(I.sayWrong('en', { nameKind: 'shell', nameValue: 'orange' }, r0), 'That’s an orange shell! Let’s look again!', 'en sayWrong dig an orange');
eq(I.sayWrong('vi', { nameKind: 'shell', nameValue: 'blue' }, r0), 'Đó là vỏ sò màu xanh dương! Mình tìm lại nhé!', 'vi sayWrong dig shell');
eq(I.sayWrong('en', { nameKind: 'animal', nameValue: 'octopus' }, r0), 'That’s an octopus! Let’s look again!', 'en sayWrong dig animal');
eq(I.sayWrong('vi', { nameKind: 'animal', nameValue: 'octopus' }, r0), 'Đó là con bạch tuộc! Mình tìm lại nhé!', 'vi sayWrong dig animal');
eq(I.sayWrong('en', { nameKind: 'letter', nameValue: 'B' }, r0), 'That’s the letter B! Let’s look again!', 'en sayWrong dig letter');
eq(I.speech('vi', I.sayWrong('vi', { nameKind: 'letter', nameValue: 'B' }, r0)), 'Đó là chữ bờ! Mình tìm lại nhé!', 'vi sayWrong dig letter spoken');
eq(I.sayWrong('en', { nameKind: 'number', nameValue: 7 }, r0), 'That’s seven! Let’s look again!', 'en sayWrong dig number');
eq(I.sayWrong('en', { nameKind: 'sum', nameValue: '2+3' }, r0), 'That’s two plus three! Let’s look again!', 'en sayWrong dig sum');
ok(I.raw('en', 'wrong').includes(I.sayWrong('en', { label: { type: 'color', value: 'red' } }, r0)), 'sayWrong otherwise → wrong[]');
eq(I.sayWrongDig('en', 'shell', 'blue', r0), 'That’s a blue shell! Let’s look again!', 'sayWrongDig(kind, value)');
eq(I.sayWrongDig('vi', { nameKind: 'animal', nameValue: 'crab' }, r0), 'Đó là con cua! Mình tìm lại nhé!', 'sayWrongDig(event)');
eq(I.sayWrongDig('en', 'pearl', 'cream', r0), 'That’s a pearl! Let’s look again!', 'sayWrongDig pearl');
eq(I.talkWrong('en', 'animal', 'seahorse'), 'Here is the seahorse! Good try!', 'en talkWrong animal');
eq(I.talkWrong('vi', 'animal', 'puffer'), 'Con cá nóc ở đây nè! Bé cố gắng lắm!', 'vi talkWrong animal');
eq(I.talkWrong('en', 'shape', 'circle'), 'It is a circle! Good try!', 'en talkWrong shape');
eq(I.talkWrong('vi', { kind: 'color', value: 'blue' }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', 'number', 4), 'It is four! Good try!', 'en talkWrong number');
eq(I.speech('en', 'That is the letter B!'), 'That is the letter bee!', 'en letter speech');
eq(I.speech('vi', 'Bé ơi, đào chữ B lên nhé!'), 'Bé ơi, đào chữ bờ lên nhé!', 'vi letter speech');
eq(I.speech('vi', '2+3'), '2 cộng 3', 'vi math speech');

// ------------------------------------------------------------------ matcher
section('matcher');
function ch(lang, kind, values) { return values.map(v => ({ id: String(v), words: I.words(lang, kind, v) })); }
const colEn = ch('en', 'color', ['red', 'blue', 'green']);
const colVi = ch('vi', 'color', ['red', 'blue', 'green']);
eq(V.match(['red'], colEn), 'red', '"red"');
eq(V.match(["it's blue"], colEn), 'blue', '"it\'s blue"');
eq(V.match(['greene'], colEn), 'green', 'fuzzy "greene"');
eq(V.match(['màu đỏ'], colVi), 'red', '"màu đỏ"');
eq(V.match(['mau do'], colVi), 'red', '"mau do"');
eq(V.match(['xanh'], colVi), null, '"xanh" alone is ambiguous');
eq(V.match(['banana', 'hello'], colEn), null, 'unrelated words → null');
eq(V.match('blue', colEn), 'blue', 'accepts a single string');
const numVi = ch('vi', 'number', [3, 5, 12]);
const numEn = ch('en', 'number', [3, 5, 12]);
eq(V.match(['ba'], numVi), '3', '"ba" → 3');
eq(V.match(['three'], numEn), '3', '"three" → 3');
eq(V.match(['3'], numVi), '3', '"3" → 3');
eq(V.match(['mười hai'], numVi), '12', '"mười hai" → 12');
eq(V.match(['muoi hai'], numVi), '12', '"muoi hai" → 12');
eq(V.match(['I think five'], numEn), '5', '"I think five"');
eq(V.match(['to'], ch('en', 'number', [2, 4])), '2', 'solo "to" → 2');
eq(V.match(['không biết'], ch('vi', 'number', [0, 1])), null, '"không biết" is not 0');

// sea friends: every pair of the 9 must be distinguishable by its own name (EN + VI, with/without diacritics)
const animEn = ch('en', 'animal', ANIMALS), animVi = ch('vi', 'animal', ANIMALS);
for (const a of ANIMALS) {
  eq(V.match([I.name('en', 'animal', a)], animEn), a, `en "${I.name('en', 'animal', a)}" → ${a}`);
  eq(V.match([I.name('vi', 'animal', a)], animVi), a, `vi "${I.name('vi', 'animal', a)}" → ${a}`);
  eq(V.match([I.stripMarks(I.name('vi', 'animal', a)).toLowerCase()], animVi), a, `vi no-diacritics "${I.stripMarks(I.name('vi', 'animal', a))}" → ${a}`);
  const bare = I.name('vi', 'animal', a).replace(/^con /, '');
  eq(V.match([bare], animVi), a, `vi bare "${bare}" → ${a}`);
  eq(V.match(['bạn ' + bare], animVi), a, `vi "bạn ${bare}" → ${a}`);
  eq(V.match(['the ' + I.name('en', 'animal', a) + '!'], animEn), a, `en "the ${I.name('en', 'animal', a)}!" → ${a}`);
}
eq(V.match(['cá'], animVi), null, 'vi "cá" alone is ambiguous');
eq(V.match(['con'], animVi), null, 'vi "con" alone matches nothing');
eq(V.match(['ca heo'], ch('vi', 'animal', ['dolphin', 'clownfish'])), 'dolphin', 'vi "ca heo" → dolphin (not cá hề)');
eq(V.match(['ca he'], ch('vi', 'animal', ['dolphin', 'clownfish'])), 'clownfish', 'vi "ca he" → clownfish');
eq(V.match(['mực'], ch('vi', 'animal', ['octopus', 'crab'])), 'octopus', 'vi "mực" → octopus');
eq(V.match(['ngựa biển'], ch('vi', 'animal', ['seahorse', 'whale'])), 'seahorse', 'vi "ngựa biển" → seahorse');
eq(V.match(['bach tuoc'], ch('vi', 'animal', ['octopus', 'crab'])), 'octopus', 'vi "bach tuoc"');
eq(V.match(['sứa biển'], ch('vi', 'animal', ['jellyfish', 'starfish'])), 'jellyfish', 'vi "sứa biển"');
eq(V.match(['sao'], ch('vi', 'animal', ['jellyfish', 'starfish'])), null, 'vi "sao" alone is not a starfish');
const fishEn = ch('en', 'animal', ['clownfish', 'puffer', 'jellyfish', 'starfish']);
eq(V.match(['puffer fish'], fishEn), 'puffer', 'en "puffer fish" beats clownfish\'s "fish"');
eq(V.match(['blowfish'], fishEn), 'puffer', 'en "blowfish" → puffer');
eq(V.match(['clown fish'], fishEn), 'clownfish', 'en "clown fish"');
eq(V.match(['fish'], fishEn), 'clownfish', 'en bare "fish" → clownfish (the initial-letter word)');
eq(V.match(['jelly'], fishEn), 'jellyfish', 'en "jelly" → jellyfish');
eq(V.match(['sea star'], fishEn), 'starfish', 'en "sea star" → starfish');
eq(V.match(['a star fish'], fishEn), 'starfish', 'en "star fish"');
eq(V.match(['sea horse'], ch('en', 'animal', ['seahorse', 'dolphin'])), 'seahorse', 'en "sea horse"');
eq(V.match(['squid'], ch('en', 'animal', ['octopus', 'crab'])), 'octopus', 'en "squid" → octopus');
eq(V.match(['dolfin'], ch('en', 'animal', ['dolphin', 'whale'])), 'dolphin', 'en mishearing "dolfin"');
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
eq(V.match(['hình tam giác'], ch('vi', 'shape', ['circle', 'triangle', 'star'])), 'triangle', 'vi triangle');
eq(V.match(['crab'], [{ id: 'c', kind: 'animal', value: 'crab' }, { id: 'w', kind: 'animal', value: 'whale' }], 'en'), 'c', '{id,kind,value} choices');
eq(V.match(['con bạch tuộc'], [{ id: 'o', kind: 'animal', value: 'octopus' }, { id: 'c', kind: 'animal', value: 'crab' }], 'vi'), 'o', '{id,kind,value} vi');
eq(V.match(['red'], []), null, 'no choices → null');
eq(V.match([null, undefined], colEn), null, 'garbage transcripts → null');

section('input: attach calls handlers with (x, y, ev) in logical px');
(function () {
  function El(tag, cls) { this.nodeType = 1; this.tag = tag; this.cls = cls || ''; this.parentElement = null; this.style = {}; this.h = {}; }
  El.prototype.matches = function (sel) {
    return sel.split(',').map(x => x.trim()).some(x => x === this.tag || (x[0] === '.' && this.cls.split(' ').includes(x.slice(1))) ||
      (x[0] === '#' && this.id === x.slice(1)));
  };
  El.prototype.addEventListener = function (t, fn) { (this.h[t] = this.h[t] || []).push(fn); };
  El.prototype.removeEventListener = function (t, fn) { this.h[t] = (this.h[t] || []).filter(f => f !== fn); };
  El.prototype.setPointerCapture = function () {}; El.prototype.releasePointerCapture = function () {};
  El.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 100, bottom: 50 }; };
  El.prototype.emit = function (t, e) { (this.h[t] || []).slice().forEach(f => f(e)); };
  const canvas = new El('canvas');
  const btn = new El('button');
  const sb4 = makeSandbox({ PointerEvent: function () {}, addEventListener() {}, removeEventListener() {} });
  sb4.TR = {};
  const IN = load(sb4, ['input.js']).Input;
  const calls = [];
  const detach = IN.attach(canvas, {
    toLogical: (cx, cy) => ({ x: cx / 2, y: cy / 2 }),
    down: function (x, y, ev) { calls.push(['down', x, y, typeof ev]); },
    move: function (x, y) { calls.push(['move', x, y]); },
    up: function (x, y) { calls.push(['up', x, y]); },
    cancel: function () { calls.push(['cancel']); }
  });
  const pe = (id, x, y, extra) => Object.assign({ pointerId: id, clientX: x, clientY: y, target: canvas, pointerType: 'touch',
    isPrimary: true, button: 0, cancelable: true, preventDefault() {} }, extra || {});
  canvas.emit('pointerdown', pe(1, 100, 60));
  canvas.emit('pointerdown', pe(2, 300, 300, { isPrimary: false }));   // a second finger is ignored
  canvas.emit('pointermove', pe(2, 310, 300));
  canvas.emit('pointermove', pe(1, 140, 60));
  canvas.emit('pointerup', pe(1, 150, 64));
  eq(JSON.stringify(calls), JSON.stringify([['down', 50, 30, 'object'], ['move', 70, 30], ['up', 75, 32]]),
    'one pointer, numbers in logical px');
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
  detach();
  canvas.emit('pointerdown', pe(7, 10, 10));
  eq(calls.length, 0, 'detach removes listeners');
  const calls2 = [];
  IN.attach(canvas, { toLogical: () => ({ x: NaN, y: 1 }), down: (x, y) => calls2.push([x, y]), cancel: () => calls2.push('c') });
  canvas.emit('pointerdown', pe(8, 10, 10));
  eq(calls2.length, 0, 'non-finite points are dropped');

  // holdButton: a 2 s parent gate — releasing early cancels, holding completes
  const gear = new El('button');
  let done = 0; const progress = [];
  const t0 = Date.now(); let fakeNow = t0;
  const realNow = Date.now; Date.now = () => fakeNow;
  sb4.requestAnimationFrame = (f) => setTimeout(() => f(fakeNow), 1);
  sb4.cancelAnimationFrame = clearTimeout;
  const off = IN.holdButton(gear, 2000, () => done++, p => progress.push(p));
  gear.emit('pointerdown', { pointerId: 9, pointerType: 'touch', button: 0, clientX: 10, clientY: 10, cancelable: true, preventDefault() {} });
  asyncTests.push(new Promise(res => setTimeout(res, 30)).then(() => {
    fakeNow = t0 + 500;
    gear.emit('pointerup', { pointerId: 9 });
    return new Promise(res => setTimeout(res, 30));
  }).then(() => {
    eq(done, 0, 'releasing the gate after 0.5 s does not open it');
    ok(progress.length > 0 && progress[progress.length - 1] === 0, 'progress resets to 0 on release');
    gear.emit('pointerdown', { pointerId: 10, pointerType: 'touch', button: 0, clientX: 10, clientY: 10, cancelable: true, preventDefault() {} });
    fakeNow = t0 + 3000;
    return new Promise(res => setTimeout(res, 40));
  }).then(() => {
    eq(done, 1, 'holding 2 s opens the gate once');
    off();
    Date.now = realNow;
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
ok(sb.TR.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into TR.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
V.setVolume(2); eq(V.getVolume(), 1, 'setVolume clamps to 1');
V.setVolume(-1); eq(V.getVolume(), 0, 'setVolume clamps to 0');
V.setVolume('abc'); eq(V.getVolume(), 1, 'setVolume garbage → 1');
V.setVolume(0.6); eq(V.getVolume(), 0.6, 'setVolume 0.6');
// name segments without any vi voice installed (pure)
V.setChild({ name: 'Mầm', sayAs: 'Mum' });
eq(I.child, 'Mầm', 'Voice.setChild forwards the name to I18N');
eq(I.sayAs, 'Mum', 'Voice.setChild forwards sayAs to I18N');
eq(JSON.stringify(V.segments('Great job, Mầm! You did it!', 'en')), JSON.stringify([{ text: 'Great job, Mum! You did it!', lang: 'en' }]),
  'no vi voice + sayAs → one English segment with sayAs');
V.setChild({ name: 'Mầm', sayAs: '' });
eq(V.segments('Great job, Mầm! You did it!', 'en').length, 3, 'no vi voice, no sayAs → still split (system default vi voice)');
eq(V.segments('Mầm ơi, đào vỏ sò lên nhé!', 'vi').length, 1, 'Vietnamese mode → one segment');
V.setChild({ name: 'Anna', sayAs: '' });
eq(JSON.stringify(V.segments('Great job, Anna!', 'en')), JSON.stringify([{ text: 'Great job, Anna!', lang: 'en' }]), 'plain name → one segment');
V.setChild({ name: 'Anna', sayAs: 'Ah-na' });
eq(V.segments('Great job, Anna!', 'en')[0].text, 'Great job, Ah-na!', 'plain name + sayAs → substituted');
eq(V.segments('Annabelle is here, Anna!', 'en')[0].text, 'Annabelle is here, Ah-na!', 'whole-word match only');
V.setChild('');
eq(V.segments('Great job, Mầm!', 'en').length, 1, 'no child → one segment');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof TR.Input.attach === 'function' && typeof TR.Input.kidProof === 'function' && typeof TR.Input.holdButton === 'function',
  'input.js exports');

// ------------------------------------------------------------------ voice with a fake synth + recognizer
section('voice with fake speechSynthesis / SpeechRecognition');
(function () {
  const spoken = [];
  const fakeVoices = [
    { name: 'Fred', lang: 'en-US', localService: true },
    { name: 'Google US English', lang: 'en-US', localService: false },
    { name: 'Samantha', lang: 'en-US', localService: true, default: true },
    { name: 'Linh', lang: 'vi-VN', localService: true },
    { name: 'Thomas', lang: 'fr-FR', localService: true }
  ];
  const synth = {
    speaking: false, paused: false, onvoiceschanged: null,
    getVoices() { return fakeVoices; },
    speak(u) { spoken.push(u); this.speaking = true; setTimeout(() => { u.onstart && u.onstart(); }, 1); },
    cancel() { const c = spoken.filter(u => !u._ended); c.forEach(u => { u._ended = true; u.onerror && u.onerror({ error: 'interrupted' }); }); this.speaking = false; },
    pause() {}, resume() {}
  };
  function Utt(text) { this.text = text; }
  let recInst = null;
  function Rec() { recInst = this; this.started = false; }
  Rec.prototype.start = function () { this.started = true; };
  Rec.prototype.abort = function () { this.aborted = true; };
  Rec.prototype.stop = function () {};
  const sb2 = makeSandbox({ speechSynthesis: synth, SpeechSynthesisUtterance: Utt, webkitSpeechRecognition: Rec });
  sb2.TR = {};
  const D2 = load(sb2, ['i18n.js', 'voice.js']);
  const V2 = D2.Voice;
  V2.init({ lang: 'en' });
  eq(V2.voiceName('en'), 'Samantha', 'en picks Samantha over Fred/Google');
  eq(V2.voiceName('vi'), 'Linh', 'vi picks Linh');
  ok(V2.hasVoice('vi'), 'hasVoice vi');
  ok(V2.canListen(), 'canListen with webkitSpeechRecognition');
  let starts = 0, ends = 0;
  V2.onStart = () => starts++; V2.onEnd = () => ends++;
  const a = V2.say('before unlock');
  V2.unlock();
  const b = V2.say('one'), c = V2.say('two'), d = V2.say('three');
  const endCurrent = () => { const cur = spoken[spoken.length - 1]; cur._ended = true; synth.speaking = false; cur.onend(); };
  asyncTests.push(new Promise(res => setTimeout(res, 150)).then(() => {
    const texts = spoken.map(u => u.text);
    ok(texts[0] === ' ', 'unlock speaks a silent utterance first');
    ok(spoken.some(u => ['before unlock', 'one', 'two', 'three'].includes(u.text)), 'queued line spoken after unlock');
    const cur = spoken[spoken.length - 1];
    eq(cur.lang, 'en-US', 'utterance lang en-US');
    ok(cur.voice && cur.voice.name === 'Samantha', 'utterance voice set');
    ok(Math.abs(cur.rate - 0.95) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Tutu: rate 0.95 pitch 1.2');
    eq(cur.volume, 1, 'default volume 1');
    ok(V2.isSpeaking(), 'isSpeaking true while talking');
    ok(starts >= 1, 'onStart fired');
    endCurrent();
    return Promise.all([a, b, c, d]).catch(() => null).then(() => 0);
  }).then(() => new Promise(res => setTimeout(res, 60))).then(() => {
    ok(ends >= 1, 'onEnd fired');
    // queue max 2: four lines were asked for, at least one dropped
    const all = spoken.map(u => u.text).filter(t => t !== ' ');
    ok(all.length <= 3, 'queue capped (spoken so far: ' + all.join('|') + ')');
    // interrupt
    const before = spoken.length;
    V2.say('Xin chào', { lang: 'vi', interrupt: true });
    return new Promise(res => setTimeout(res, 150)).then(() => {
      const last = spoken[spoken.length - 1];
      ok(spoken.length > before && last.text === 'Xin chào' && last.lang === 'vi-VN', 'interrupt speaks now in vi-VN');
      ok(last.voice && last.voice.name === 'Linh', 'vi voice Linh used');
      V2.stop();
      ok(!V2.isSpeaking(), 'stop() clears speaking');
    });
  }).then(() => {
    // volume + the child's name: "Great job, Mầm! You did it!" in English → 3 chained utterances, one queue item
    V2.setVolume(0.4);
    V2.setChild({ name: 'Mầm', sayAs: 'Mum' });
    eq(D2.I18N.child, 'Mầm', 'setChild forwarded to I18N');
    const segs = V2.segments('Great job, Mầm! You did it!', 'en');
    eq(segs.length, 3, 'three segments');
    eq(segs[1].lang, 'vi', 'middle segment is Vietnamese');
    eq(segs[1].text, 'Mầm!', 'name segment keeps its punctuation');
    eq(segs[0].text, 'Great job,', 'first segment');
    eq(segs[2].text, 'You did it!', 'last segment');
    eq(V2.segments('Great job, Mầm!', 'en').length, 2, '"Great job, Mầm!" → 2 segments (no punctuation-only utterance)');
    eq(V2.segments('Mầm, you are a star!', 'en')[0].lang, 'vi', 'name first → first segment vi');
    eq(V2.segments('Giỏi quá, Mầm ơi!', 'vi').length, 1, 'Vietnamese mode → 1 segment');
    const n0 = spoken.length;
    const logBefore = V2.log.length;
    const pr = V2.say('Great job, Mầm! You did it!', { interrupt: true });
    ok(V2.log.length === logBefore + 1 && V2.log[V2.log.length - 1].text === 'Great job, Mầm! You did it!', 'log keeps the FULL line');
    return new Promise(res => setTimeout(res, 150)).then(() => {
      eq(spoken.length, n0 + 1, 'first segment spoken, the rest wait for onend');
      const s1 = spoken[spoken.length - 1];
      eq(s1.text, 'Great job,', 'segment 1 text'); eq(s1.lang, 'en-US', 'segment 1 lang'); eq(s1.volume, 0.4, 'setVolume applied');
      ok(s1.voice && s1.voice.name === 'Samantha', 'segment 1 English voice');
      ok(V2.isSpeaking(), 'still one item');
      endCurrent();
      const s2 = spoken[spoken.length - 1];
      eq(spoken.length, n0 + 2, 'segment 2 chained immediately on onend (no gap)');
      eq(s2.text, 'Mầm!', 'segment 2 is the name'); eq(s2.lang, 'vi-VN', 'segment 2 lang vi-VN');
      ok(s2.voice && s2.voice.name === 'Linh', 'segment 2 uses the Vietnamese voice');
      eq(s2.volume, 0.4, 'volume on every segment');
      ok(V2.isSpeaking(), 'still the same queue item');
      s2._ended = true; s2.onerror({ error: 'synthesis-failed' });    // a failing segment is skipped
      const s3 = spoken[spoken.length - 1];
      eq(spoken.length, n0 + 3, 'segment 3 follows a failed segment');
      eq(s3.text, 'You did it!', 'segment 3 text'); eq(s3.lang, 'en-US', 'segment 3 lang');
      endCurrent();
      return pr;
    }).then(r => {
      ok(r && r.spoken === true, 'the whole line resolves spoken:true once');
      ok(!V2.isSpeaking(), 'item finished after the last segment');
      // plain name in English stays one utterance; Vietnamese mode never splits
      V2.setChild({ name: 'Anna' });
      const n1 = spoken.length;
      V2.say('Great job, Anna!', { interrupt: true });
      return new Promise(res => setTimeout(res, 150)).then(() => {
        eq(spoken.length, n1 + 1, 'plain name → one utterance');
        eq(spoken[spoken.length - 1].text, 'Great job, Anna!', 'plain name text untouched');
        endCurrent();
        V2.setChild({ name: 'Mầm', sayAs: 'Mum' });
        const n2 = spoken.length;
        V2.say('Giỏi quá, Mầm ơi!', { lang: 'vi', interrupt: true });
        return new Promise(res => setTimeout(res, 150)).then(() => {
          eq(spoken.length, n2 + 1, 'Vietnamese mode → one utterance');
          eq(spoken[spoken.length - 1].lang, 'vi-VN', 'vi utterance');
          endCurrent();
          // queue still ≤ 2 waiting with multi-segment items
          const n3 = spoken.length;
          const ps = ['Hi Mầm!', 'Go Mầm!', 'Yes Mầm!', 'Wow Mầm!'].map(t => V2.say(t));
          return new Promise(res => setTimeout(res, 100)).then(() => Promise.race([ps[0], ps[1], new Promise(res => setTimeout(() => res({ reason: 'none' }), 50))])).then(first => {
            ok(spoken.length >= n3 + 1, 'speaking the first queued multi-segment line');
            return Promise.all(ps.slice(0, 2).map(x => Promise.race([x, new Promise(res => setTimeout(() => res({ reason: 'pending' }), 50))]))).then(rs => {
              ok(rs.some(x => x.reason === 'dropped'), 'queue capped at 2 waiting (an old line was dropped)');
              V2.stop();
            });
          });
        });
      });
    });
  }).then(() => {
    // listening: interim then final
    V2.setLang('en');
    const pr = V2.listen({ lang: 'vi', choices: [{ id: 'r', kind: 'color', value: 'red' }, { id: 'b', kind: 'color', value: 'blue' }], timeoutMs: 2000 });
    ok(recInst && recInst.started && recInst.lang === 'vi-VN' && recInst.maxAlternatives === 5 && recInst.interimResults === true, 'recognizer configured');
    const alt = (t) => ({ transcript: t, confidence: 0.9 });
    const result = (isFinal, ...ts) => { const r = ts.map(alt); r.isFinal = isFinal; return r; };
    recInst.onresult({ resultIndex: 0, results: [result(true, 'mầu đổ', 'màu đỏ')] });
    return pr.then(r => {
      eq(r.id, 'r', 'listen resolves on a final match');
      ok(recInst.aborted, 'recognizer aborted after match');
    });
  }).then(() => {
    const pr = V2.listen({ lang: 'en', choices: colEn, timeoutMs: 2000 });
    recInst.onerror({ error: 'not-allowed' });
    return pr.then(r => {
      eq(r.reason, 'not-allowed', 'permission denied reason');
      ok(!V2.canListen(), 'canListen false for the session after denial');
    });
  }).then(() => {
    // timeout path on a fresh instance
    const sb3 = makeSandbox({ webkitSpeechRecognition: Rec });
    sb3.TR = {};
    const V3 = load(sb3, ['i18n.js', 'voice.js']).Voice;
    const pr = V3.listen({ lang: 'en', choices: colEn, timeoutMs: 40 });
    return pr.then(r => eq(r.reason, 'timeout', 'listen times out'));
  }).then(() => {
    // iOS home-screen app: no mic
    const sb5 = makeSandbox({ webkitSpeechRecognition: Rec, navigator: { userAgent: 'iPhone', standalone: true, platform: 'iPhone', maxTouchPoints: 5 } });
    sb5.TR = {};
    const V5 = load(sb5, ['i18n.js', 'voice.js']).Voice;
    ok(!V5.canListen(), 'canListen false in an iOS home-screen app');
  }));
})();

Promise.all(asyncTests).then(() => {
  console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, (e) => { console.log('FAIL  async error: ' + (e && e.stack)); process.exit(1); });
