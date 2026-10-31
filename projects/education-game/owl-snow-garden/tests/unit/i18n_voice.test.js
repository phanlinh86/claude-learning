#!/usr/bin/env node
// Owlet's Snow Garden — unit tests for i18n.js, voice.js, input.js.
// Run from projects/education-game/owl-snow-garden:   node tests/unit/i18n_voice.test.js
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
  return sb.SG;
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
sb.SG = { debug: { voiceLog: [] } };
let SG;
try { SG = load(sb, ['i18n.js', 'voice.js', 'input.js']); ok(true, 'scripts load'); }
catch (e) { console.log('FAIL  scripts load: ' + e.stack); process.exit(1); }
const I = SG.I18N, V = SG.Voice;

// ------------------------------------------------------------------ keys
section('keys exist in both languages');
const TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const ANIMALS = ['bear', 'seal', 'fox', 'hare', 'reindeer', 'walrus', 'penguin', 'puffin', 'whale'];   // DESIGN §5.1
// every ui.* key used by index.html / main.js / ui.js / render.js (grep "ui\.") + the ones in the brief
const UI = ['title', 'subtitle', 'play', 'playAgain', 'home', 'paused', 'resume', 'settings', 'holdForParents', 'age',
  'language', 'name', 'namePlaceholder', 'sound', 'music', 'voice', 'mic', 'done', 'stars', 'chapter', 'allDone', 'welcome',
  'micUnsupported', 'micDenied', 'voiceMissing', 'tapOrSay', 'listening', 'years', 'skip', 'langName.en', 'langName.vi'];
const LABELS = ['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity'];
const REQUIRED = []
  .concat(UI.map(k => 'ui.' + k))
  .concat(TOPICS.map(k => 'topic.' + k))
  .concat([0, 1, 2, 3].map(k => 'weather.' + k))
  .concat(TOPICS.map(k => 'p.' + k))
  .concat(['p.animalsNext', 'p.animalsAll', 'p.colorsOne', 'p.countAny'])
  .concat(LABELS.map(k => 'say.correct.' + k))
  .concat(['say.correct.word', 'say.countDone', 'say.bloom', 'say.wrong.animal'])
  .concat(['praise', 'great', 'wrong', 'miss', 'hint', 'idle', 'talk.intro', 'talk.right', 'talk.wrong', 'session.done'])
  .concat(TOPICS.map(k => 'talk.' + k));
for (const lang of I.langs) for (const k of REQUIRED) ok(I.has(lang, k), `key ${k} in ${lang}`);
eq(JSON.stringify(I.keys('en').slice().sort()), JSON.stringify(I.keys('vi').slice().sort()), 'en and vi have identical key sets');
// keys the game code asks for at run time
(function () {
  const src = ['main.js', 'ui.js', 'render.js'].map(f => { try { return fs.readFileSync(path.join(JS, f), 'utf8'); } catch (e) { return ''; } }).join('\n')
    + (function () { try { return fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8'); } catch (e) { return ''; } })();
  const used = new Set();
  src.replace(/['"`]((?:ui|talk|session|say|weather)\.[A-Za-z.]+[A-Za-z])['"`]/g, (m, k) => { used.add(k); return m; });
  for (const k of used) for (const lang of I.langs) ok(I.has(lang, k), `key used by the game code exists: ${lang} ${k}`);
})();
for (const k of ['dino', 'nest', 'egg', 'Bo ', 'fruit', 'puppy', 'Pip']) {
  const all = I.langs.map(l => I.keys(l).map(x => [].concat(I.raw(l, x)).join(' ')).join(' ')).join(' ');
  ok(all.toLowerCase().indexOf(k.toLowerCase()) < 0 || (k === 'Bo ' && all.indexOf('Bo ') < 0), `no leftover "${k}" wording`);
}

for (const lang of I.langs) for (const k of ['praise', 'wrong', 'hint', 'idle', 'great', 'miss', 'talk.right', 'say.bloom']) {
  const v = I.raw(lang, k);
  ok(Array.isArray(v) && v.length >= 5 && v.length <= 8, `${lang} ${k} has 5–8 variants (${v && v.length})`);
}
for (const lang of I.langs) for (const k of ['great', 'idle', 'talk.right']) {
  const v = I.raw(lang, k);
  ok(v.some(s => s.includes('{child}')) && v.some(s => !s.includes('{child}')), `${lang} ${k} has name + no-name variants`);
}

section('Vietnamese wording sanity');
const viAll = I.keys('vi').map(k => [].concat(I.raw('vi', k)).join(' ')).join(' ');
for (const bad of ['Be oi', 'nhe!', 'Dung roi', 'hat giong', 'chau hoa', 'mau do', 'Lumi day'])
  ok(viAll.indexOf(bad) < 0, `vi text has no un-accented "${bad}"`);
ok(/Bé ơi/.test(viAll) && /nhé!/.test(viAll) && /nào!/.test(viAll), 'vi uses "Bé ơi", "nhé!", "nào!"');
ok(/hạt giống/.test(viAll) && /chậu/.test(viAll) && /bông hoa/.test(viAll), 'vi uses hạt giống / chậu / bông hoa');
eq(I.t('vi', 'ui.title'), 'Vườn Hoa Cú Tuyết', 'vi title');
eq(I.t('en', 'ui.title'), 'Owlet’s Snow Garden', 'en title');
eq(I.t('en', 'ui.voice'), 'Lumi’s voice', 'ui.voice names Lumi');
eq(I.t('vi', 'ui.listening'), 'Lumi đang nghe…', 'vi listening');

section('no negative words for mistakes');
for (const k of ['wrong', 'miss', 'hint', 'say.wrong.animal', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.size',
  'talk.wrong.animal', 'talk.wrong.letter', 'talk.wrong.parity']) {
  const all = [].concat(I.raw('en', k)).join(' ').toLowerCase();
  ok(!/\b(no|wrong|bad|not|fail|incorrect|oh no)\b/.test(all), `en ${k} has no negative words`);
  const vi = [].concat(I.raw('vi', k)).join(' ').toLowerCase();
  ok(!/(^|\s)(sai|dở|tệ|hỏng)(\s|$|[!.,?])/u.test(vi), `vi ${k} has no negative words`);
}

section('every string renders, no "{" left, short sentences');
const FULL = { n: 3, stars: 7, child: 'Mai', answer: 'X', name: 'seal', target: 'bear', animal: 'seal', color: 'red',
  shape: 'star' };
for (const lang of I.langs) for (const k of I.keys(lang)) {
  const raw = [].concat(I.raw(lang, k));
  for (let i = 0; i < raw.length; i++) {
    for (const child of ['Mai', '']) {
      const rng = { next: () => (i + 0.5) / raw.length };
      const s = I.t(lang, k, Object.assign({}, FULL, { child }), rng);
      ok(s.indexOf('{') < 0 && s.indexOf('}') < 0, `${lang} ${k}[${i}] child=${JSON.stringify(child)} fully replaced: ${s}`);
      ok(s.length > 0, `${lang} ${k} non-empty`);
      if (!child && k !== 'ui.namePlaceholder') ok(s.indexOf('Mai') < 0, `${lang} ${k} without a name does not use one`);
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
eq(I.t('en', 'p.count', { n: 3, color: 'red' }), 'Plant 3 flowers!', 'en count plural');
eq(I.t('en', 'p.count', { n: 1 }), 'Plant 1 flower!', 'en count singular');
eq(I.t('vi', 'p.count', { n: 3 }), 'Bé ơi, trồng 3 bông hoa nhé!', 'vi count');
eq(I.t('en', 'p.count', {}), 'Plant the flowers and count with me!', 'count without n → generic');
eq(I.t('en', 'p.animals', { animal: 'seal' }), 'Plant a flower for the seal!', 'en animals seal');
eq(I.t('en', 'p.animals', { animal: 'bear' }), 'Plant a flower for the polar bear!', 'en animals polar bear');
eq(I.t('vi', 'p.animals', { animal: 'seal' }), 'Bé ơi, trồng một bông hoa cho bạn hải cẩu nhé!', 'vi animals seal');
eq(I.t('vi', 'p.animals', { animal: 'bear' }), 'Bé ơi, trồng một bông hoa cho bạn gấu Bắc Cực nhé!', 'vi animals bear');
eq(I.t('vi', 'p.animals', { animal: { kind: 'animal', value: 'fox' } }), 'Bé ơi, trồng một bông hoa cho bạn cáo Bắc Cực nhé!', 'object param');
eq(I.t('en', 'p.animals', {}), 'Plant a flower for each animal friend!', 'animals without animal → generic');
eq(I.t('en', 'p.animalsNext', { animal: 'walrus' }, () => 0), 'Now the walrus!', 'en animalsNext');
eq(I.t('vi', 'p.animalsNext', { animal: 'penguin' }, () => 0), 'Giờ đến bạn chim cánh cụt nhé!', 'vi animalsNext');
eq(I.t('en', 'p.colors', { color: 'red' }), 'Plant each seed in the pot of the same colour!', 'en colors prompt');
eq(I.t('vi', 'p.colors'), 'Bé ơi, trồng mỗi hạt giống vào chậu cùng màu nhé!', 'vi colors prompt');
eq(I.t('en', 'p.colorsOne', { color: 'orange' }), 'Plant the orange seed in the orange pot!', 'en colorsOne');
eq(I.t('vi', 'p.colorsOne', { color: 'red' }), 'Bé ơi, trồng hạt giống màu đỏ vào chậu màu đỏ nhé!', 'vi colorsOne');
eq(I.t('en', 'p.colorsOne', {}), I.t('en', 'p.colors'), 'colorsOne without colour → p.colors');
eq(I.t('en', 'p.size', { color: 'red' }), 'Big seeds in the big pot, small seeds in the small pot!', 'en size');
eq(I.t('vi', 'p.size'), 'Hạt to vào chậu to, hạt nhỏ vào chậu nhỏ nhé!', 'vi size');
eq(I.t('en', 'talk.animals', { animal: 'hare' }), 'Where is the snow hare?', 'en talk animals');
eq(I.t('vi', 'talk.animals', { animal: 'reindeer' }), 'Bạn tuần lộc ở đâu nhỉ?', 'vi talk animals');
eq(I.t('en', 'talk.animals', {}), 'Tap an animal friend!', 'talk animals fallback');
eq(I.t('en', 'talk.colors'), 'What colour is this flower?', 'en talk colors');
eq(I.t('en', 'talk.count'), 'How many flowers?', 'en talk count');
eq(I.t('vi', 'talk.count'), 'Có bao nhiêu bông hoa nào?', 'vi talk count');
eq(I.t('en', 'weather.0'), 'Good morning, garden!', 'weather 0');
eq(I.t('en', 'ui.chapter', { n: 2 }), 'Chapter 2', 'en chapter');
eq(I.t('vi', 'ui.allDone', { stars: 12 }), 'Hoàn thành! 12 ngôi sao', 'vi allDone');
eq(I.t('en', 'ui.welcome', { child: 'Mai' }), 'Hi Mai! I am Lumi. Let’s grow flowers!', 'welcome with name');
eq(I.t('en', 'ui.welcome', { child: '' }), 'Hi! I am Lumi. Let’s grow flowers!', 'welcome without name');
eq(I.t('vi', 'ui.welcome', { child: '' }), 'Chào bé! Lumi đây. Mình cùng trồng hoa nhé!', 'vi welcome without name');
eq(I.t('vi', 'ui.welcome', { child: 'Mai' }), 'Chào bé Mai! Lumi đây. Mình cùng trồng hoa nhé!', 'vi welcome with name');
I.setChild('An');
ok(I.t('en', 'ui.welcome').indexOf('An') > 0, 'setChild is the default {child}');
I.setChild('');
eq(I.t('en', 'say.correct.color', { answer: { kind: 'color', value: 'orange' } }, () => 0.99), 'An orange flower!', 'a → an');
eq(I.t('en', 'say.correct.color', { answer: { kind: 'color', value: 'red' } }, () => 0.99), 'A red flower!', 'a stays a');

section('names for every kind/value in §5.1');
const VALUES = {
  color: ['red', 'blue', 'yellow', 'green', 'orange', 'purple'],
  shape: ['circle', 'square', 'triangle', 'star', 'heart', 'rectangle'],
  size: ['big', 'small'],
  animal: ANIMALS,
  parity: ['odd', 'even'],
  seed: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'cream', 'seed'],
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
    if (['color', 'shape', 'animal', 'parity', 'seed'].includes(kind) && lang === 'vi')
      ok(n !== v, `vi name ${kind} ${v} is translated (${n})`);
    if (kind === 'sum' || kind === 'diff') ok(!/\d/.test(n), `${lang} ${kind} ${v} spoken as words (${n})`);
    const w = I.words(lang, kind, v);
    ok(Array.isArray(w) && w.length > 0, `${lang} words ${kind} ${v}`);
    ok(w.every(x => x === x.toLowerCase()), `${lang} words ${kind} ${v} are lower-case`);
  }
  for (const e of sb.SG.WORDS[lang]) {
    ok(I.name(lang, 'word', e.word).length > 0, `${lang} word ${e.word}`);
    ok(I.words(lang, 'word', e.word).length > 1, `${lang} words for word ${e.word} include the animal forms`);
  }
}
eq(I.NAME_KINDS.join(','), 'color,shape,size,animal,number,letter,parity,sum,diff,word,seed', 'NAME_KINDS (DESIGN §5.1)');
eq(sb.SG.WORDS.vi.map(w => w.word).join(','), 'gấu,cáo,cá voi,tuần lộc,hải cẩu,hải mã', 'vi initial words (§5.1)');
eq(sb.SG.WORDS.en.map(w => w.word + w.initial).join(','), 'bearB,foxF,hareH,penguinP,puffinP,reindeerR,sealS,walrusW,whaleW', 'en initial words');
const EN_ANIMAL = { bear: 'polar bear', seal: 'seal', fox: 'arctic fox', hare: 'snow hare', reindeer: 'reindeer', walrus: 'walrus',
  penguin: 'penguin', puffin: 'puffin', whale: 'whale' };
const VI_ANIMAL = { bear: 'gấu Bắc Cực', seal: 'hải cẩu', fox: 'cáo Bắc Cực', hare: 'thỏ tuyết', reindeer: 'tuần lộc', walrus: 'hải mã',
  penguin: 'chim cánh cụt', puffin: 'chim cổ rụt', whale: 'cá voi' };
for (const a of ANIMALS) { eq(I.name('en', 'animal', a), EN_ANIMAL[a], 'en animal ' + a); eq(I.name('vi', 'animal', a), VI_ANIMAL[a], 'vi animal ' + a); }
eq(I.name('en', 'seed', 'red'), 'red seed', 'en seed red');
eq(I.name('vi', 'seed', 'red'), 'hạt giống màu đỏ', 'vi seed red');
eq(I.name('en', 'seed', 'seed'), 'seed', 'en plain seed');
eq(I.name('vi', 'seed', 'cream'), 'hạt giống', 'vi cream seed');
eq(I.name('vi', 'color', 'red'), 'màu đỏ', 'vi red');
eq(I.name('en', 'number', 7), 'seven', 'en 7');
eq(I.name('vi', 'number', 15), 'mười lăm', 'vi 15');
eq(I.name('vi', 'number', 20), 'hai mươi', 'vi 20');
eq(I.name('vi', 'letter', 'B'), 'bờ', 'vi letter B phonics');
eq(I.name('vi', 'letter', 'K'), 'ca', 'vi letter K');
eq(I.name('en', 'sum', '2+3'), 'two plus three', 'en sum');
eq(I.name('vi', 'diff', '7−2'), 'bảy trừ hai', 'vi diff');
eq(I.name('vi', 'parity', 'odd'), 'lẻ', 'vi odd');
eq(I.name('vi', 'word', 'hải cẩu'), 'hải cẩu', 'vi word');
eq(I.name('en', 'word', 'animal_walrus'), 'walrus', 'word from sprite id');
ok(I.words('en', 'color', 'blue').includes('blew'), 'blue/blew');
ok(I.words('vi', 'number', 2).includes('hài'), 'hai/hài');
ok(I.words('vi', 'color', 'red').includes('mau do'), 'words include stripped forms');
ok(I.words('en', 'number', 3).includes('3'), 'words include digits');
ok(I.words('vi', 'animal', 'bear').includes('gau bac cuc'), 'vi bear stripped form');
ok(I.words('en', 'animal', 'bear').includes('bear') && I.words('en', 'animal', 'bear').includes('polar bear'), 'en bear forms');
ok(I.words('vi', 'word', 'gấu').includes('gấu bắc cực'), 'vi word gấu accepts "gấu Bắc Cực"');

// ----- names for everything content.js actually produces (if it loads)
section('names for every item/label/choice content.js makes');
(function () {
  const sc = makeSandbox(); sc.SG = {};
  let C;
  try { C = load(sc, ['rng.js', 'i18n.js', 'content.js']); } catch (e) { console.log('   (content.js not loadable yet: ' + e.message + ')'); return; }
  if (!C.Content || !C.Content.makeRound) { console.log('   (SG.Content.makeRound missing — skipped)'); return; }
  const I2 = C.I18N;
  if (C.ANIMALS) eq(JSON.stringify(C.ANIMALS), JSON.stringify(ANIMALS), 'content SG.ANIMALS = DESIGN §5.1 list');
  const layout = { W: 1280, H: 720, ins: { top: 0, right: 0, bottom: 0, left: 0 }, groundY: 650,
    pot: { y: 560, w: 200, h: 156, xs: [300, 560, 820, 1080] }, lumi: { x: 105, y: 225, h: 175 },
    bubble: { x: 190, y: 24, w: 620, h: 104 }, play: { x: 40, y: 235, w: 1200, h: 270 } };
  const ages = Object.keys(C.AGE_TOPICS || { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }).map(Number);
  let rounds = 0, talks = 0;
  const seen = new Set();
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 12; s++) {
    let r;
    try { r = C.Content.makeRound(topic, { age, lang, rng: new C.RNG(s * 31 + age), roundIndex: s % 4, layout }); }
    catch (e) { ok(false, `makeRound ${topic} age ${age} ${lang}: ${e.message}`); continue; }
    rounds++;
    const txt = I2.t(lang, r.promptKey, r.params || {});
    ok(txt && txt !== r.promptKey && txt.indexOf('{') < 0, `${lang} ${r.promptKey} renders with round params: ${txt}`);
    if (r.mode === 'ask' && r.queue) for (const bid of r.queue) {
      const b = r.baskets.find(x => x.id === bid);
      const q = I2.t(lang, 'p.animals', { animal: b.label.value });
      ok(q.indexOf(I2.name(lang, 'animal', b.label.value)) >= 0, `${lang} ask prompt names ${b.label.value}`);
    }
    for (const b of r.baskets) {
      const k = b.label.type + ':' + b.label.value + ':' + lang;
      if (seen.has(k)) continue; seen.add(k);
      const nm = I2.name(lang, b.label.type, b.label.value);
      ok(nm && nm !== 'undefined', `${lang} label ${k} named (${nm})`);
      const sc1 = I2.sayCorrect(lang, { nameKind: r.items[0].nameKind, nameValue: r.items[0].nameValue, label: b.label, count: 1, need: 3 });
      ok(sc1 && sc1.indexOf('{') < 0 && !/undefined/.test(sc1), `${lang} sayCorrect for ${k}: ${sc1}`);
    }
    for (const it of r.items) {
      const k = 'item:' + it.nameKind + ':' + it.nameValue + ':' + lang;
      if (seen.has(k)) continue; seen.add(k);
      ok(I2.NAME_KINDS.includes(it.nameKind), `${lang} item nameKind ${it.nameKind} is a known kind`);
      const nm = I2.name(lang, it.nameKind, it.nameValue);
      ok(nm && nm !== 'undefined' && nm !== 'null', `${lang} ${k} named (${nm})`);
      if (lang === 'vi' && ['color', 'animal', 'seed', 'shape'].includes(it.nameKind)) ok(nm !== String(it.nameValue), `vi ${k} translated (${nm})`);
    }
  }
  for (const lang of ['en', 'vi']) for (const age of ages) for (const topic of (C.AGE_TOPICS[age] || [])) for (let s = 1; s <= 12; s++) {
    let tk;
    try { tk = C.Content.makeTalk(topic, { age, lang, rng: new C.RNG(s * 17 + age) }); }
    catch (e) { ok(false, `makeTalk ${topic}: ${e.message}`); continue; }
    talks++;
    const q = I2.t(lang, tk.promptKey, tk.params || {});
    ok(q && q !== tk.promptKey && q.indexOf('{') < 0, `${lang} ${tk.promptKey} renders: ${q}`);
    if (topic === 'animals') ok(q.indexOf(I2.name(lang, 'animal', tk.params.animal)) >= 0, `${lang} talk.animals names the animal`);
    for (const c of tk.choices) {
      ok(I2.words(lang, c.kind, c.value).length > 0, `${lang} words for talk choice ${c.kind}:${c.value}`);
      const tw = I2.talkWrong(lang, c.kind, c.value);
      ok(tw.indexOf('{') < 0 && !/undefined/.test(tw), `${lang} talkWrong ${c.kind}:${c.value}: ${tw}`);
    }
    // the matcher picks the right choice from its own name
    const ans = tk.choices.find(c => c.id === tk.answerId);
    const said = I2.name(lang, ans.kind, ans.value);
    const ch2 = tk.choices.map(c => ({ id: c.id, kind: c.kind, value: c.value }));
    eq(C.Voice ? C.Voice.match([said], ch2, lang) : V.match([said], tk.choices.map(c => ({ id: c.id, words: I2.words(lang, c.kind, c.value) }))),
      tk.answerId, `${lang} ${topic} talk: saying "${said}" picks the answer`);
  }
  ok(rounds > 100 && talks > 100, `enumerated ${rounds} rounds, ${talks} talks from content.js`);
})();

section('sayCorrect / sayWrong / sayCount / talkWrong / speech');
const r0 = () => 0;
eq(I.sayCorrect('en', { nameKind: 'seed', nameValue: 'red', label: { type: 'animal', value: 'seal' } }, r0), 'A flower for the seal!', 'en animal');
eq(I.sayCorrect('vi', { nameKind: 'seed', nameValue: 'red', label: { type: 'animal', value: 'bear' } }, r0), 'Bông hoa tặng bạn gấu Bắc Cực!', 'vi animal');
eq(I.sayCorrect('en', { nameKind: 'sum', nameValue: '2+3', label: { type: 'number', value: 5 } }, r0), 'Yes! Two plus three makes five!', 'en sum');
eq(I.sayCorrect('vi', { nameKind: 'diff', nameValue: '7−2', label: { type: 'number', value: 5 } }, r0), 'Đúng rồi! Bảy trừ hai bằng năm!', 'vi diff');
eq(I.sayCorrect('en', { nameKind: 'word', nameValue: 'walrus', label: { type: 'letter', value: 'W' } }, r0), 'Walrus starts with the letter W!', 'en word');
eq(I.sayCorrect('vi', { nameKind: 'word', nameValue: 'gấu', label: { type: 'letter', value: 'G' } }, r0), 'Gấu bắt đầu bằng chữ gờ!', 'vi word');
eq(I.sayCorrect('vi', { nameKind: 'color', nameValue: 'red', label: { type: 'color', value: 'red' } }, r0), 'Đúng rồi! Màu đỏ đó!', 'vi color');
eq(I.sayCorrect('vi', { nameKind: 'size', nameValue: 'big', label: { type: 'size', value: 'big' } }, () => 0.99), 'Hạt to vào chậu to!', 'vi size');
eq(I.sayCorrect('en', { nameKind: 'number', nameValue: 7, label: { type: 'parity', value: 'odd' } }, r0), 'Yes! Seven is odd!', 'en parity');
eq(I.sayCorrect('en', { nameKind: 'seed', nameValue: 'red', label: { type: 'number', value: 3 }, count: 2 }, r0), 'Two!', 'count mode < need');
eq(I.sayCorrect('en', { nameKind: 'seed', nameValue: 'red', label: { type: 'number', value: 3 }, count: 3 }, r0), 'Three! You planted 3 flowers!', 'count mode = need');
eq(I.sayCount('vi', 1, 4), 'Một!', 'vi count 1');
eq(I.sayCount('vi', 4, 4, r0), 'Bốn! Bé trồng được 4 bông hoa rồi!', 'vi count done');
eq(I.sayCount('en', 1, 1, r0), 'One! You planted 1 flower!', 'en count done singular');
eq(I.sayCount('en', 12, 12, () => 0.5), 'Twelve! Yes! 12 flowers!', 'en count 12');
ok(I.raw('en', 'say.bloom').includes(I.sayBloom('en', r0)), 'sayBloom');
for (const lang of I.langs) for (const t of LABELS)
  ok(I.sayCorrect(lang, { nameKind: 'color', nameValue: 'red', label: { type: t, value: t === 'number' ? 3 : t === 'animal' ? 'fox' : 'x' } }).indexOf('{') < 0, `${lang} sayCorrect ${t}`);
eq(I.sayWrong('en', { label: { type: 'animal', value: 'seal' }, target: { type: 'animal', value: 'bear' } }, r0),
  'That’s the seal’s pot. Where is the polar bear?', 'en sayWrong ask');
eq(I.sayWrong('vi', { label: { type: 'animal', value: 'seal' }, target: { type: 'animal', value: 'bear' } }, r0),
  'Chậu của bạn hải cẩu đó. Bạn gấu Bắc Cực đâu nhỉ?', 'vi sayWrong ask');
ok(I.raw('en', 'wrong').includes(I.sayWrong('en', { label: { type: 'color', value: 'red' } }, r0)), 'sayWrong otherwise → wrong[]');
eq(I.talkWrong('en', 'animal', 'fox'), 'Here is the arctic fox! Good try!', 'en talkWrong animal');
eq(I.talkWrong('vi', 'animal', 'puffin'), 'Bạn chim cổ rụt ở đây nè! Bé cố gắng lắm!', 'vi talkWrong animal');
eq(I.talkWrong('en', 'shape', 'circle'), 'It is a circle! Good try!', 'en talkWrong shape');
eq(I.talkWrong('vi', { kind: 'color', value: 'blue' }), 'Là màu xanh dương đó! Bé cố gắng lắm!', 'vi talkWrong colour');
eq(I.talkWrong('en', 'number', 4), 'It is four! Good try!', 'en talkWrong number');
eq(I.speech('en', 'That is the letter B!'), 'That is the letter bee!', 'en letter speech');
eq(I.speech('vi', 'Bé ơi, trồng chữ B nhé!'), 'Bé ơi, trồng chữ bờ nhé!', 'vi letter speech');
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

// arctic animals, every pair of the 9 must be distinguishable by its own name (EN + VI, with/without diacritics)
const animEn = ch('en', 'animal', ANIMALS), animVi = ch('vi', 'animal', ANIMALS);
for (const a of ANIMALS) {
  eq(V.match([I.name('en', 'animal', a)], animEn), a, `en "${I.name('en', 'animal', a)}" → ${a}`);
  eq(V.match([I.name('vi', 'animal', a)], animVi), a, `vi "${I.name('vi', 'animal', a)}" → ${a}`);
  eq(V.match([I.stripMarks(I.name('vi', 'animal', a)).toLowerCase()], animVi), a, `vi no-diacritics "${I.stripMarks(I.name('vi', 'animal', a))}" → ${a}`);
  eq(V.match(['con ' + I.name('vi', 'animal', a)], animVi), a, `vi "con ${I.name('vi', 'animal', a)}" → ${a}`);
  eq(V.match(['the ' + I.name('en', 'animal', a) + '!'], animEn), a, `en "the ${I.name('en', 'animal', a)}!" → ${a}`);
}
const animEn3 = ch('en', 'animal', ['bear', 'fox', 'hare']), animVi3 = ch('vi', 'animal', ['bear', 'fox', 'hare']);
eq(V.match(['bear'], animEn3), 'bear', 'en "bear"');
eq(V.match(['a white bear'], animEn3), 'bear', 'en "white bear"');
eq(V.match(['Polar Bear.'], animEn3), 'bear', 'en "Polar Bear."');
eq(V.match(['fox'], animEn3), 'fox', 'en "fox"');
eq(V.match(['bunny'], animEn3), 'hare', 'en "bunny" → hare');
eq(V.match(['rabbit'], animEn3), 'hare', 'en "rabbit" → hare');
eq(V.match(['gấu'], animVi3), 'bear', 'vi "gấu"');
eq(V.match(['gau bac cuc'], animVi3), 'bear', 'vi "gau bac cuc"');
eq(V.match(['con cáo'], animVi3), 'fox', 'vi "con cáo"');
eq(V.match(['cao bac cuc'], animVi3), 'fox', 'vi "cao bac cuc"');
eq(V.match(['thỏ'], animVi3), 'hare', 'vi "thỏ"');
eq(V.match(['tho tuyet'], animVi3), 'hare', 'vi "tho tuyet"');
eq(V.match(['bắc cực'], animVi3), null, 'vi "bắc cực" alone is ambiguous (bear / fox)');
eq(V.match(['polar'], animEn3), 'bear', 'en "polar" → bear');
const sea = ch('vi', 'animal', ['seal', 'walrus', 'whale']);
eq(V.match(['hải cẩu'], sea), 'seal', 'vi "hải cẩu"');
eq(V.match(['hai cau'], sea), 'seal', 'vi "hai cau"');
eq(V.match(['hải mã'], sea), 'walrus', 'vi "hải mã"');
eq(V.match(['hai ma'], sea), 'walrus', 'vi "hai ma"');
eq(V.match(['cá voi'], sea), 'whale', 'vi "cá voi"');
eq(V.match(['ca voi'], sea), 'whale', 'vi "ca voi"');
eq(V.match(['hải'], sea), null, 'vi "hải" alone is ambiguous');
const birds = ch('vi', 'animal', ['penguin', 'puffin', 'reindeer']);
eq(V.match(['chim cánh cụt'], birds), 'penguin', 'vi "chim cánh cụt"');
eq(V.match(['canh cut'], birds), 'penguin', 'vi "canh cut"');
eq(V.match(['chim cổ rụt'], birds), 'puffin', 'vi "chim cổ rụt"');
eq(V.match(['hải âu cổ rụt'], birds), 'puffin', 'vi "hải âu cổ rụt"');
eq(V.match(['puffin'], birds), 'puffin', 'vi mode "puffin"');
eq(V.match(['chim'], birds), null, 'vi "chim" alone is ambiguous');
eq(V.match(['tuần lộc'], birds), 'reindeer', 'vi "tuần lộc"');
eq(V.match(['tuan loc'], birds), 'reindeer', 'vi "tuan loc"');
const birdsEn = ch('en', 'animal', ['penguin', 'puffin', 'reindeer', 'walrus', 'whale', 'seal']);
eq(V.match(['penguin'], birdsEn), 'penguin', 'en penguin');
eq(V.match(['puffins'], birdsEn), 'puffin', 'en puffins');
eq(V.match(['rain deer'], birdsEn), 'reindeer', 'en "rain deer"');
eq(V.match(['walrus'], birdsEn), 'walrus', 'en walrus');
eq(V.match(['beluga'], birdsEn), 'whale', 'en beluga → whale');
eq(V.match(['seal'], birdsEn), 'seal', 'en seal');
eq(V.match(['pengwin'], birdsEn), 'penguin', 'en mishearing "pengwin"');
eq(V.match(['hello'], birdsEn), null, 'en unrelated → null');

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
eq(V.match(['seal'], [{ id: 's', kind: 'animal', value: 'seal' }, { id: 'w', kind: 'animal', value: 'walrus' }], 'en'), 's', '{id,kind,value} choices');
eq(V.match(['gấu bắc cực'], [{ id: 'b', kind: 'animal', value: 'bear' }, { id: 'f', kind: 'animal', value: 'fox' }], 'vi'), 'b', '{id,kind,value} vi');
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
  El.prototype.emit = function (t, e) { (this.h[t] || []).slice().forEach(f => f(e)); };
  const canvas = new El('canvas');
  const btn = new El('button');
  const sb4 = makeSandbox({ PointerEvent: function () {}, addEventListener() {}, removeEventListener() {} });
  sb4.SG = {};
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
ok(sb.SG.debug.voiceLog.some(e => e.text === 'Hello there'), 'mirrored into SG.debug.voiceLog');
V.stop(); V.setEnabled(false); V.setEnabled(true); V.setLang('vi');
ok(!V.isSpeaking(), 'not speaking');
asyncTests.push(p.then(r => ok(r && r.spoken === false, 'say resolves spoken:false')));
asyncTests.push(V.listen({ lang: 'en', choices: colEn }).then(r => {
  ok(r && r.id === null && r.reason === 'unsupported', 'listen resolves unsupported');
}));
ok(typeof SG.Input.attach === 'function' && typeof SG.Input.kidProof === 'function' && typeof SG.Input.holdButton === 'function',
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
  sb2.SG = {};
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
  asyncTests.push(new Promise(res => setTimeout(res, 150)).then(() => {
    const texts = spoken.map(u => u.text);
    ok(texts[0] === ' ', 'unlock speaks a silent utterance first');
    ok(spoken.some(u => ['before unlock', 'one', 'two', 'three'].includes(u.text)), 'queued line spoken after unlock');
    const cur = spoken[spoken.length - 1];
    eq(cur.lang, 'en-US', 'utterance lang en-US');
    ok(cur.voice && cur.voice.name === 'Samantha', 'utterance voice set');
    ok(Math.abs(cur.rate - 0.9) < 1e-9 && Math.abs(cur.pitch - 1.2) < 1e-9, 'Lumi: rate 0.9 pitch 1.2');
    ok(V2.isSpeaking(), 'isSpeaking true while talking');
    ok(starts >= 1, 'onStart fired');
    cur._ended = true; synth.speaking = false; cur.onend();
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
    // listening: interim then final
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
    sb3.SG = {};
    const V3 = load(sb3, ['i18n.js', 'voice.js']).Voice;
    const pr = V3.listen({ lang: 'en', choices: colEn, timeoutMs: 40 });
    return pr.then(r => eq(r.reason, 'timeout', 'listen times out'));
  }));
})();

Promise.all(asyncTests).then(() => {
  console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, (e) => { console.log('FAIL  async error: ' + (e && e.stack)); process.exit(1); });
