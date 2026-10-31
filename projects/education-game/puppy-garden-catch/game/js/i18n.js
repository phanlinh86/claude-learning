/* Puppy Garden Catch — PG.I18N (English + Vietnamese). Helper: Pip the puppy ("Cún Pip").
 *
 *   PG.I18N.t(lang, key, params, rng?)   → string (variants picked with rng.next()/rng()/Math.random)
 *   PG.I18N.name(lang, kind, value)      → display + spoken name ("red"/"màu đỏ", 7 → "seven"/"bảy")
 *   PG.I18N.words(lang, kind, value)     → accepted spoken forms for speech recognition
 *   PG.I18N.speech(lang, text)           → text tuned for TTS (letter names, + − =)
 *   PG.I18N.sayCorrect(lang, ev, rng)    → Pip's line for a `correct` world event
 *   PG.I18N.sayWrong(lang, ev, rng)      → Pip's kind line for a `wrong` world event (never negative words)
 *   PG.I18N.talkWrong(lang, kind, value) → gentle "it's X" line for a missed Talk-time answer
 *   PG.I18N.sound(lang, animal)          → "Quack quack!" / "Cạp cạp!" ('' if the animal has no sound)
 *   PG.I18N.plural(lang, kind, value)    → "pears" / "quả lê"
 *   PG.I18N.setChild(name)               → default {child} for every t() call
 *   PG.I18N.langs = ['en', 'vi'];  PG.I18N.has(lang, key);  PG.I18N.keys(lang);  PG.I18N.PARAMS (contract)
 *
 * Params (see PARAMS below and docs/VOICE.md §1.1): the world's round/talk events carry RAW values, and t()
 * turns them into words:  {color:'red'} → "red"/"màu đỏ";  {shape:'star'};  {size:'big'};  {animal:'duck'};
 * {parity:'odd'};  {n:3, fruit:'pear'} → "3 pears"/"3 quả lê";  {letter:'B'} (shown as "B", spoken "bee"/"bờ");
 * {lower} (defaults to letter.toLowerCase());  {sum:'2+3'} / {diff:'7−2'} → "2 + 3" / "7 − 2" (spoken "plus"/"cộng");
 * {sound:'cow'} (an animal id, or literal text) → "Moo moo!";  {soundWord} → "moo moo" (defaults to sound/animal).
 * An object {kind, value} is always replaced by name(lang, kind, value). Plain strings/numbers are inserted as-is.
 * {child}: if the child's name is empty, variants containing {child} are skipped; if every variant has it,
 * {child} becomes "friend" / "bé". Missing params are removed (never a stray "{x}" on screen); a key whose
 * REQUIRED param is missing falls back to a complete generic sentence (NEEDS below).
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài" … Screens show the capital ("chữ B"); speech() says "chữ bờ".
 */
(function (PG) {
  'use strict';

  var LANGS = ['en', 'vi'];

  // ---------------------------------------------------------------- names
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rectangle: 'rectangle' },
      size: { big: 'big', small: 'small' },
      animal: { fish: 'fish', frog: 'frog', duck: 'duck', bird: 'bird', owl: 'owl', squirrel: 'squirrel', rabbit: 'rabbit',
        cow: 'cow', sheep: 'sheep', bat: 'bat', bear: 'bear', hen: 'hen', cat: 'cat', pig: 'pig', snail: 'snail',
        ladybug: 'ladybug' },
      fruit: { apple: 'apple', banana: 'banana', strawberry: 'strawberry', orange: 'orange', pear: 'pear', cherry: 'cherry',
        carrot: 'carrot' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
        rectangle: 'hình chữ nhật' },
      size: { big: 'to', small: 'nhỏ' },
      animal: { fish: 'con cá', frog: 'con ếch', duck: 'con vịt', bird: 'con chim', owl: 'con cú', squirrel: 'con sóc',
        rabbit: 'con thỏ', cow: 'con bò', sheep: 'con cừu', bat: 'con dơi', bear: 'con gấu', hen: 'con gà', cat: 'con mèo',
        pig: 'con heo', snail: 'con ốc sên', ladybug: 'con bọ rùa' },
      // carrot is a vegetable (a root): classifier "củ", the others are "quả"
      fruit: { apple: 'quả táo', banana: 'quả chuối', strawberry: 'quả dâu', orange: 'quả cam', pear: 'quả lê',
        cherry: 'quả anh đào', carrot: 'củ cà rốt' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  var NAME_KINDS = Object.keys(NAMES.en);           // color shape size animal fruit parity
  var PLURAL_EN = {
    fruit: { apple: 'apples', banana: 'bananas', strawberry: 'strawberries', orange: 'oranges', pear: 'pears',
      cherry: 'cherries', carrot: 'carrots' },
    animal: { fish: 'fish', frog: 'frogs', duck: 'ducks', bird: 'birds', owl: 'owls', squirrel: 'squirrels',
      rabbit: 'rabbits', cow: 'cows', sheep: 'sheep', bat: 'bats', bear: 'bears', hen: 'hens', cat: 'cats', pig: 'pigs',
      snail: 'snails', ladybug: 'ladybugs' }
  };
  // animals that make a sound (PG.ANIMAL_SOUNDS in content.js); text lives in STR 'sound.<animal>'
  var SOUND_ANIMALS = ['cow', 'duck', 'sheep', 'cat', 'hen', 'frog', 'bird', 'owl', 'pig'];

  var NUM = {
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
      'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'],
    vi: ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'mười một', 'mười hai',
      'mười ba', 'mười bốn', 'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín', 'hai mươi']
  };
  // extra spoken forms / common mishearings. Entries starting with '=' only match the WHOLE utterance.
  var NUM_ALT = {
    en: { 0: ['oh', 'nothing'], 1: ['won'], 2: ['too', '=to', '=tu'], 3: ['tree', 'free'], 4: ['=for', 'fore'],
      6: ['sicks'], 8: ['ate'], 10: ['tin'] },
    vi: { 0: ['số không', '=không'], 1: ['mốt'], 2: ['hài'], 3: ['bà'], 4: ['tư'], 5: ['lăm'], 7: ['bẩy'], 10: ['chục'],
      11: ['mười mốt'], 14: ['mười tư'], 15: ['mười năm'], 17: ['mười bẩy'], 20: ['hai chục'] }
  };

  // English letter names for TTS ("letter B" → "letter bee")
  var LETTER_SPEECH_EN = { A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff', G: 'jee', H: 'aitch', I: 'eye',
    J: 'jay', K: 'kay', L: 'ell', M: 'em', N: 'en', O: 'oh', P: 'pee', Q: 'cue', R: 'ar', S: 'ess', T: 'tee', U: 'you',
    V: 'vee', W: 'double you', X: 'ex', Y: 'why', Z: 'zee' };
  var LETTER_WORDS_EN = { A: ['ay', 'eh', 'hey'], B: ['bee', 'be'], C: ['see', 'sea', 'si'], D: ['dee'], E: ['ee'],
    F: ['ef', 'eff'], G: ['gee', 'jee'], H: ['aitch', 'age', 'h'], I: ['eye', 'aye'], J: ['jay'], K: ['kay'],
    L: ['el', 'ell', 'elle'], M: ['em'], N: ['en'], O: ['oh', 'owe'], P: ['pee', 'pea'], Q: ['cue', 'queue'],
    R: ['are', 'ar'], S: ['ess'], T: ['tee', 'tea'], U: ['you'], V: ['vee'], W: ['double you', 'double u'],
    X: ['ex'], Y: ['why'], Z: ['zee', 'zed'] };
  // Vietnamese letters, phonics names as taught in kindergarten / grade 1 ("âm").
  var LETTER_VI = { 'A': 'a', 'Ă': 'á', 'Â': 'ớ', 'B': 'bờ', 'C': 'cờ', 'D': 'dờ', 'Đ': 'đờ', 'E': 'e', 'Ê': 'ê',
    'G': 'gờ', 'H': 'hờ', 'I': 'i', 'K': 'ca', 'L': 'lờ', 'M': 'mờ', 'N': 'nờ', 'O': 'o', 'Ô': 'ô', 'Ơ': 'ơ', 'P': 'pờ',
    'Q': 'quờ', 'R': 'rờ', 'S': 'sờ', 'T': 'tờ', 'U': 'u', 'Ư': 'ư', 'V': 'vờ', 'X': 'xờ', 'Y': 'i dài',
    // not in the Vietnamese alphabet, but give them a friendly name anyway
    'F': 'ép', 'J': 'gi', 'W': 'vê kép', 'Z': 'dét' };
  // alphabet names ("bê, xê, dê…") that parents also use — accepted when listening
  var LETTER_WORDS_VI = { 'A': ['a'], 'Ă': ['á', 'ắ'], 'Â': ['ớ', 'â'], 'B': ['bê', 'bơ', 'bở'], 'C': ['xê', 'cơ', 'cở'],
    'D': ['dê', 'dơ'], 'Đ': ['đê', 'đơ'], 'E': ['e', 'é'], 'Ê': ['ê'], 'G': ['giê', 'gơ', 'gở'], 'H': ['hát', 'hắt', 'hơ'],
    'I': ['i', 'i ngắn'], 'K': ['ca', 'ka'], 'L': ['e lờ', 'lơ'], 'M': ['em mờ', 'mơ'], 'N': ['en nờ', 'nơ'], 'O': ['o'],
    'Ô': ['ô'], 'Ơ': ['ơ'], 'P': ['pê', 'pơ'], 'Q': ['quy', 'cu', 'quơ'], 'R': ['e rờ', 'rơ'], 'S': ['ét xì', 'sơ'],
    'T': ['tê', 'tơ'], 'U': ['u'], 'Ư': ['ư'], 'V': ['vê', 'vơ'], 'X': ['ích xì', 'xơ'], 'Y': ['i dài', 'i cờ rét'],
    'F': ['ép'], 'J': ['gi'], 'W': ['vê kép'], 'Z': ['dét'] };

  // extra accepted spoken forms per kind/value (names are always accepted automatically)
  var WORDS = {
    en: {
      color: { red: ['red', 'read', 'reds'], blue: ['blue', 'blew', 'blues'], yellow: ['yellow', 'yello'],
        green: ['green', 'greens'], orange: ['orange', 'oranges'], purple: ['purple', 'violet', 'pupple'],
        cream: ['white', 'cream'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles'], square: ['square', 'box', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rectangle: ['rectangle', 'rectangles'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: { fish: ['fish', 'fishy'], frog: ['frog', 'froggy'], duck: ['duck', 'ducky', 'duckie'], bird: ['bird', 'birdie'],
        owl: ['owl'], squirrel: ['squirrel'], rabbit: ['rabbit', 'bunny'], cow: ['cow'], sheep: ['sheep', 'lamb'],
        bat: ['bat'], bear: ['bear', 'teddy'], hen: ['hen', 'chicken'], cat: ['cat', 'kitty', 'kitten'],
        pig: ['pig', 'piggy', 'pigs'], snail: ['snail', 'snails'], ladybug: ['ladybug', 'ladybird', 'lady bug'] },
      fruit: { apple: ['apple', 'apples'], banana: ['banana', 'bananas'], strawberry: ['strawberry', 'strawberries'],
        orange: ['orange', 'oranges'], pear: ['pear', 'pears'], cherry: ['cherry', 'cherries'],
        carrot: ['carrot', 'carrots', 'carot'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], cream: ['trắng', 'màu trắng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao'], heart: ['trái tim', 'tim', 'hình trái tim'],
        rectangle: ['chữ nhật', 'hình chữ nhật'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: { fish: ['cá', 'con cá'], frog: ['ếch', 'con ếch'], duck: ['vịt', 'con vịt'], bird: ['chim', 'con chim'],
        owl: ['cú', 'con cú', 'cú mèo'], squirrel: ['sóc', 'con sóc'], rabbit: ['thỏ', 'con thỏ'], cow: ['bò', 'con bò'],
        sheep: ['cừu', 'con cừu'], bat: ['dơi', 'con dơi'], bear: ['gấu', 'con gấu'], hen: ['gà', 'con gà', 'gà mái'],
        cat: ['mèo', 'con mèo'], pig: ['heo', 'con heo', 'lợn', 'con lợn'], snail: ['ốc sên', 'con ốc sên', 'con ốc'],
        ladybug: ['bọ rùa', 'con bọ rùa'] },
      fruit: { apple: ['táo', 'quả táo', 'trái táo'], banana: ['chuối', 'quả chuối', 'trái chuối'],
        strawberry: ['dâu', 'quả dâu', 'dâu tây', 'trái dâu'], orange: ['cam', 'quả cam', 'trái cam'],
        pear: ['lê', 'quả lê', 'trái lê'], cherry: ['anh đào', 'quả anh đào', 'trái anh đào', 'cherry'],
        carrot: ['cà rốt', 'củ cà rốt'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // PG.WORDS (spec §5.1) — word lists for the 'initial' topic. content.js may (re)define it; name()/words()/sayWrong()
  // read PG.WORDS at call time, so both lists work. The word itself is the name (no classifier: its first letter matters).
  var WORD_LIST = {
    en: [['apple', 'fruit_apple', 'A'], ['bear', 'animal_bear', 'B'], ['bat', 'animal_bat', 'B'], ['bird', 'animal_bird', 'B'],
      ['banana', 'fruit_banana', 'B'], ['cat', 'animal_cat', 'C'], ['cow', 'animal_cow', 'C'], ['carrot', 'fruit_carrot', 'C'],
      ['cherry', 'fruit_cherry', 'C'], ['duck', 'animal_duck', 'D'], ['fish', 'animal_fish', 'F'], ['frog', 'animal_frog', 'F'],
      ['hen', 'animal_hen', 'H'], ['ladybug', 'animal_ladybug', 'L'], ['owl', 'animal_owl', 'O'], ['orange', 'fruit_orange', 'O'],
      ['pig', 'animal_pig', 'P'], ['pear', 'fruit_pear', 'P'], ['rabbit', 'animal_rabbit', 'R'], ['sheep', 'animal_sheep', 'S'],
      ['squirrel', 'animal_squirrel', 'S'], ['strawberry', 'fruit_strawberry', 'S'], ['snail', 'animal_snail', 'S']],
    vi: [['anh đào', 'fruit_cherry', 'A'], ['bò', 'animal_cow', 'B'], ['cá', 'animal_fish', 'C'], ['cú', 'animal_owl', 'C'],
      ['cừu', 'animal_sheep', 'C'], ['cam', 'fruit_orange', 'C'], ['cà rốt', 'fruit_carrot', 'C'], ['dơi', 'animal_bat', 'D'],
      ['dâu', 'fruit_strawberry', 'D'], ['gấu', 'animal_bear', 'G'], ['gà', 'animal_hen', 'G'], ['heo', 'animal_pig', 'H'],
      ['lê', 'fruit_pear', 'L'], ['mèo', 'animal_cat', 'M'], ['sóc', 'animal_squirrel', 'S'], ['táo', 'fruit_apple', 'T'],
      ['thỏ', 'animal_rabbit', 'T'], ['vịt', 'animal_duck', 'V'], ['ếch', 'animal_frog', 'Ê']]
  };
  if (!PG.WORDS) {
    PG.WORDS = {};
    LANGS.forEach(function (l) {
      PG.WORDS[l] = WORD_LIST[l].map(function (w) { return { word: w[0], sprite: w[1], initial: w[2] }; });
    });
  }
  // word → sprite / sprite → word, from my list AND whatever PG.WORDS holds now
  function wordEntries(lang) {
    var out = WORD_LIST[lang].map(function (w) { return { word: w[0], sprite: w[1] }; });
    var cur = PG.WORDS && PG.WORDS[lang];
    if (Array.isArray(cur)) cur.forEach(function (w) { if (w && w.word) out.push({ word: w.word, sprite: w.sprite }); });
    return out;
  }
  function spriteOfWord(lang, w) {
    var list = wordEntries(lang);
    for (var i = list.length - 1; i >= 0; i--) if (list[i].word === w) return list[i].sprite || null;
    return null;
  }
  function wordOfSprite(lang, spr) {
    var list = wordEntries(lang);
    for (var i = list.length - 1; i >= 0; i--) if (list[i].sprite === spr) return list[i].word;
    return null;
  }
  function spriteKind(spr) {               // 'animal_duck' → {kind:'animal', value:'duck'}
    var m = /^(animal|fruit)_(\w+)$/.exec(String(spr || ''));
    return m && NAMES.en[m[1]][m[2]] ? { kind: m[1], value: m[2] } : null;
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  var STR = {
    en: {
      'ui.title': 'Puppy Garden Catch',
      'ui.subtitle': 'Catch, count and learn with Pip!',
      'ui.play': 'Play',
      'ui.playAgain': 'Play again',
      'ui.home': 'Home',
      'ui.paused': 'Paused',
      'ui.resume': 'Keep playing',
      'ui.settings': 'Settings',
      'ui.holdForParents': 'Hold for parents',
      'ui.age': 'Age',
      'ui.years': '{n} years',
      'ui.language': 'Language',
      'ui.name': "Child's name",
      'ui.namePlaceholder': 'e.g. Mai',
      'ui.sound': 'Sound effects',
      'ui.music': 'Music',
      'ui.voice': "Pip's voice",
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Pip. Woof! Let’s play!', 'Hi! I am Pip. Woof! Let’s play!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the buttons!',
      'ui.micDenied': 'The microphone is off. Tap the buttons instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Pip is listening…',
      'ui.skip': 'Skip',
      'ui.tapPip': 'Tap Pip to hear it again',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Color Catch',
      'topic.shapes': 'Shape Bubbles',
      'topic.size': 'Big and Small',
      'topic.count': 'Garden Counting',
      'topic.animals': 'Animal Friends',
      'topic.letters': 'Letter Balls',
      'topic.lower': 'Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Sunny morning',
      'weather.1': 'Breezy afternoon',
      'weather.2': 'Soft rain',
      'weather.3': 'Rainbow evening',
      'chapter.0': 'Sunny garden',
      'chapter.1': 'Windy garden',
      'chapter.2': 'Rainy garden',
      'chapter.3': 'Rainbow garden',

      'sound.cow': 'Moo moo!',
      'sound.duck': 'Quack quack!',
      'sound.sheep': 'Baa baa!',
      'sound.cat': 'Meow meow!',
      'sound.hen': 'Cluck cluck!',
      'sound.frog': 'Ribbit ribbit!',
      'sound.bird': 'Tweet tweet!',
      'sound.owl': 'Hoo hoo!',
      'sound.pig': 'Oink oink!',

      'p.colors': 'Catch the {color} ball!',
      'p.shapes': 'Catch the {shape}!',
      'p.size': 'Catch the {size} ball!',
      'p.count': 'Catch {n} {fruit}!',
      'p.animals': '{sound} Catch the {animal}!',
      'p.animalsSound': '{sound} Who says that? Catch it!',
      'p.letters': 'Catch the letter {letter}!',
      'p.lower': 'Big {letter}, small {lower}! Catch small {lower}!',
      'p.initial': 'What starts with the letter {letter}? Catch it!',
      'p.add': 'What is {sum}? Catch the answer!',
      'p.sub': 'What is {diff}? Catch the answer!',
      'p.oddeven': 'Catch a {parity} number!',
      'p.generic': 'Watch the bubbles and catch!',

      'say.correct.color': ['Yes! The {color} ball!', '{color}! Great catch!', 'The {color} ball! Hooray!'],
      'say.correct.shape': ['Yes! The {shape}!', 'A {shape}! Great catch!'],
      'say.correct.size': ['Yes! The {size} ball!', '{size}! You got it!'],
      'say.correct.animal': ['Yes! The {animal}! {sound}', 'The {animal}! Great catch!'],
      'say.correct.letter': ['Yes! The letter {letter}!', 'Letter {letter}! Great catch!'],
      'say.correct.word': ['{word} starts with the letter {letter}!', 'Yes! {word} starts with the letter {letter}!'],
      'say.correct.number': ['Yes! {n}!', '{n}! Great catch!'],
      'say.correct.sum': ['Yes! {sum} = {n}!', '{sum} makes {n}!'],
      'say.correct.parity': ['Yes! {n} is {parity}!', '{n} is a {parity} number!'],
      'say.correct.count': ['{count}!'],
      'say.countDone': ['Yes! {n} {fruit}!', 'You caught {n} {fruit}!'],

      'say.wrong.color': 'That’s a {name} ball. Let’s find {target}!',
      'say.wrong.shape': 'That’s a {name}. Let’s find the {target}!',
      'say.wrong.size': 'That one is {name}. Let’s find a {target} one!',
      'say.wrong.fruit': 'That’s a {name}. Let’s catch {target}!',
      'say.wrong.animal': 'That’s the {name}. Let’s find the {target}!',
      'say.wrong.animalSound': 'That’s the {name}. Who says {soundWord}?',
      'say.wrong.letter': 'That’s the letter {name}. Let’s find the letter {target}!',
      'say.wrong.word': 'That’s a {name}. What starts with the letter {target}?',
      'say.wrong.number': 'That’s {name}. Let’s look again!',
      'say.wrong.sum': 'That’s {name}. What is {sum}?',
      'say.wrong.parity': '{name} is {nameParity}. Let’s find a {target} number!',

      'praise': ['Yes!', 'Great catch!', 'You got it!', 'Super!', 'Wonderful!', 'Nice catch!', 'Hooray!', 'Well done!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'The basket is full! Amazing!', 'Wow, {child}, you are a star!',
        'Super catching!', 'Hooray! Woof woof!', 'You are so clever!'],
      'wrong': ['Oops, it hopped out! Let’s try again!', 'Almost! Let’s find another one!', 'Ooh, let’s look again!',
        'So close! One more try!', 'Let’s think again!', 'Keep trying, you can do it!'],
      'miss': ['Oh, it bounced! It will float back!', 'Boing! It’s coming back up!', 'It bounced on the grass! Try again soon!',
        'Up it goes! It will come back!', 'Whee! Let’s catch it next time!'],
      'hint': ['Look! The glowing one!', 'Psst! Catch the shiny bubble!', 'Pip will help! Look at the glow!',
        'See the sparkly bubble? That one!', 'Here is a clue: the glowing bubble!'],
      'idle': ['Move Pip under a bubble!', 'Drag your finger, Pip will run!', 'Pip is ready! Let’s catch!',
        'Tap where Pip should go!', 'I am here, {child}! Let’s play!', 'Bubbles are coming! Let’s catch!'],

      'talk.intro': 'Talk time! Pip has a question.',
      'talk.colors': 'What color is this ball?',
      'talk.shapes': 'What shape is this?',
      'talk.size': 'Is this ball big or small?',
      'talk.count': 'How many can you count?',
      'talk.animals': 'Who says {soundWord}?',
      'talk.animalsPlain': 'Which animal is this?',
      'talk.letters': 'Which letter is this?',
      'talk.lower': 'Which letter is this?',
      'talk.initial': 'Which letter does it start with?',
      'talk.add': 'What is {sum}?',
      'talk.sub': 'What is {diff}?',
      'talk.answer': 'What is the answer?',
      'talk.oddeven': 'Is it odd or even?',
      'talk.right': ['Yes! You are right!', 'Correct! Hooray!', 'Wow, you know it!', 'That is it! Super!',
        'Clever you!', 'Yes, {child}! Great answer!'],
      'talk.wrong': 'It is {answer}! Good try!',
      'talk.wrong.the': 'It is the {answer}! Good try!',
      'talk.wrong.letter': 'It is the letter {answer}! Good try!',
      'talk.wrong.parity': 'It is {answer}! Good try!',

      'session.done': ['You did it all! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!']
    },
    vi: {
      'ui.title': 'Cún Con Hứng Quà',
      'ui.subtitle': 'Cùng Cún Pip hứng quà, đếm và học nhé!',
      'ui.play': 'Chơi',
      'ui.playAgain': 'Chơi lại',
      'ui.home': 'Trang chủ',
      'ui.paused': 'Tạm dừng',
      'ui.resume': 'Chơi tiếp',
      'ui.settings': 'Cài đặt',
      'ui.holdForParents': 'Nhấn giữ (dành cho bố mẹ)',
      'ui.age': 'Tuổi',
      'ui.years': '{n} tuổi',
      'ui.language': 'Ngôn ngữ',
      'ui.name': 'Tên của bé',
      'ui.namePlaceholder': 'Ví dụ: Mai',
      'ui.sound': 'Âm thanh',
      'ui.music': 'Nhạc nền',
      'ui.voice': 'Giọng Cún Pip',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Cún Pip đây. Gâu gâu! Mình cùng chơi nhé!',
        'Chào bé! Cún Pip đây. Gâu gâu! Mình cùng chơi nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm nút nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm nút nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Cún Pip đang nghe…',
      'ui.skip': 'Bỏ qua',
      'ui.tapPip': 'Chạm vào Pip để nghe lại',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Màu sắc',
      'topic.shapes': 'Các hình',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Đếm quà trong vườn',
      'topic.animals': 'Các con vật',
      'topic.letters': 'Chữ cái',
      'topic.lower': 'Chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Buổi sáng nắng đẹp',
      'weather.1': 'Buổi chiều gió mát',
      'weather.2': 'Mưa nhẹ',
      'weather.3': 'Buổi tối cầu vồng',
      'chapter.0': 'Khu vườn nắng',
      'chapter.1': 'Khu vườn lộng gió',
      'chapter.2': 'Khu vườn mưa',
      'chapter.3': 'Khu vườn cầu vồng',

      'sound.cow': 'Ụm bò!',
      'sound.duck': 'Cạp cạp!',
      'sound.sheep': 'Be be!',
      'sound.cat': 'Meo meo!',
      'sound.hen': 'Cục tác!',
      'sound.frog': 'Ộp ộp!',
      'sound.bird': 'Chíp chíp!',
      'sound.owl': 'Cú cú!',
      'sound.pig': 'Ụt ịt!',

      'p.colors': 'Bé ơi, hứng quả bóng {color} nhé!',
      'p.shapes': 'Bé ơi, hứng {shape} nhé!',
      'p.size': 'Bé ơi, hứng quả bóng {size} nhé!',
      'p.count': 'Hứng {n} {fruit} nào!',
      'p.animals': '{sound} Bé hứng {animal} nhé!',
      'p.animalsSound': '{sound} Con gì kêu thế? Bé hứng nhé!',
      'p.letters': 'Bé ơi, hứng chữ {letter} nhé!',
      'p.lower': 'Bé ơi, hứng chữ {lower} thường của chữ {letter} nhé!',
      'p.initial': 'Cái gì bắt đầu bằng chữ {letter}? Bé hứng nhé!',
      'p.add': '{sum} bằng mấy? Bé hứng đáp số nhé!',
      'p.sub': '{diff} bằng mấy? Bé hứng đáp số nhé!',
      'p.oddeven': 'Bé ơi, hứng số {parity} nhé!',
      'p.generic': 'Bé ơi, hứng quà nào!',

      'say.correct.color': ['Đúng rồi! Quả bóng {color}!', '{color}! Bé hứng giỏi quá!', 'Quả bóng {color} đây rồi!'],
      'say.correct.shape': ['Đúng rồi! {shape}!', '{shape} đây rồi! Giỏi quá!'],
      'say.correct.size': ['Đúng rồi! Quả bóng {size}!', 'Bóng {size} đây rồi!'],
      'say.correct.animal': ['Đúng rồi! {animal} đây! {sound}', '{animal}! Bé giỏi quá!'],
      'say.correct.letter': ['Đúng rồi! Chữ {letter}!', 'Chữ {letter} đây rồi!'],
      'say.correct.word': ['{word} bắt đầu bằng chữ {letter}!', 'Đúng rồi! {word} bắt đầu bằng chữ {letter}!'],
      'say.correct.number': ['Đúng rồi! Số {n}!', 'Số {n}! Bé hứng giỏi quá!'],
      'say.correct.sum': ['Đúng rồi! {sum} = {n}!', '{sum} bằng {n}!'],
      'say.correct.parity': ['Đúng rồi! {n} là số {parity}!', 'Số {n} là số {parity} đó!'],
      'say.correct.count': ['{count}!'],
      'say.countDone': ['Đúng rồi! {n} {fruit}!', 'Bé hứng được {n} {fruit} rồi!'],

      'say.wrong.color': 'Đó là quả bóng {name}. Mình tìm {target} nhé!',
      'say.wrong.shape': 'Đó là {name}. Mình tìm {target} nhé!',
      'say.wrong.size': 'Quả này {name}. Mình tìm quả bóng {target} nhé!',
      'say.wrong.fruit': 'Đó là {name}. Mình hứng {target} nhé!',
      'say.wrong.animal': 'Đó là {name}. Mình tìm {target} nhé!',
      'say.wrong.animalSound': 'Đó là {name}. Con gì kêu {soundWord} nhỉ?',
      'say.wrong.letter': 'Đó là chữ {name}. Mình tìm chữ {target} nhé!',
      'say.wrong.word': 'Đó là {name}. Cái gì bắt đầu bằng chữ {target}?',
      'say.wrong.number': 'Đó là số {name}. Mình xem lại nhé!',
      'say.wrong.sum': 'Đó là số {name}. {sum} bằng mấy nhỉ?',
      'say.wrong.parity': '{name} là số {nameParity}. Mình tìm số {target} nhé!',

      'praise': ['Đúng rồi!', 'Hứng giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Giỏ đầy rồi! Bé tuyệt lắm!', 'Oa, bé {child} là ngôi sao đó!',
        'Bé hứng giỏi quá!', 'Hoan hô! Gâu gâu!', 'Bé thông minh quá!'],
      'wrong': ['Ồ, nó nhảy ra rồi! Mình thử lại nhé!', 'Gần đúng rồi! Mình tìm cái khác nhé!', 'Mình nhìn lại nhé!',
        'Suýt nữa thôi! Thử tiếp nhé!', 'Không sao đâu, thử lại nhé!', 'Bé nghĩ thêm chút nữa nhé!'],
      'miss': ['Ồ, nó nảy lên rồi! Nó sẽ bay lại nhé!', 'Tưng tưng! Nó bay lên lại rồi!', 'Rơi xuống cỏ rồi! Lát nữa bé hứng nhé!',
        'Bay lên nào! Nó sẽ quay lại đó!', 'Nảy tưng tưng! Bé chờ nó quay lại nhé!'],
      'hint': ['Nhìn kìa! Cái đang sáng đó!', 'Bé hứng bong bóng lấp lánh nhé!', 'Cún Pip gợi ý nè: bong bóng đang sáng!',
        'Bé thấy bong bóng lấp lánh chưa? Đó đó!', 'Nhìn bong bóng sáng lên kìa bé!'],
      'idle': ['Bé kéo ngón tay để Pip chạy nhé!', 'Bé chạm chỗ Pip cần chạy tới nhé!', 'Pip sẵn sàng rồi! Mình hứng nào!',
        'Bong bóng đến rồi kìa bé!', 'Bé {child} ơi, mình chơi tiếp nhé!', 'Đưa Pip tới dưới bong bóng nào!'],

      'talk.intro': 'Giờ trò chuyện! Cún Pip hỏi bé nhé.',
      'talk.colors': 'Quả bóng này màu gì nhỉ?',
      'talk.shapes': 'Đây là hình gì nào?',
      'talk.size': 'Quả bóng này to hay nhỏ?',
      'talk.count': 'Bé đếm xem có bao nhiêu nào?',
      'talk.animals': 'Con gì kêu {soundWord} nhỉ?',
      'talk.animalsPlain': 'Đây là con gì nào?',
      'talk.letters': 'Đây là chữ gì nào?',
      'talk.lower': 'Đây là chữ gì nào?',
      'talk.initial': 'Hình này bắt đầu bằng chữ gì nhỉ?',
      'talk.add': '{sum} bằng mấy nhỉ?',
      'talk.sub': '{diff} bằng mấy nhỉ?',
      'talk.answer': 'Kết quả là bao nhiêu nào?',
      'talk.oddeven': 'Số này chẵn hay lẻ nhỉ?',
      'talk.right': ['Đúng rồi! Bé giỏi quá!', 'Chính xác! Hoan hô!', 'Oa, bé biết rồi!', 'Đúng luôn! Siêu quá!',
        'Bé thông minh quá!', 'Đúng rồi, bé {child} ơi!'],
      'talk.wrong': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.the': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.parity': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Bé làm xong hết rồi! {stars} ngôi sao! Hoan hô!', 'Bé {child} giỏi quá! {stars} ngôi sao!']
    }
  };

  // The params contract: which params each prompt / talk key needs (one of each inner list), and where it falls back
  // to when they are missing. Integrators: see docs/VOICE.md §1.1.
  var NEEDS = {
    'p.colors': [['color']], 'p.shapes': [['shape']], 'p.size': [['size']], 'p.count': [['n'], ['fruit']],
    'p.animals': [['animal']], 'p.animalsSound': [['sound']], 'p.letters': [['letter']],
    'p.lower': [['letter', 'lower']], 'p.initial': [['letter']], 'p.add': [['sum', 'diff']], 'p.sub': [['diff', 'sum']],
    'p.oddeven': [['parity']],
    'talk.animals': [['soundWord']], 'talk.add': [['sum', 'diff']], 'talk.sub': [['diff', 'sum']]
  };
  var FALLBACK = { 'p.animalsSound': 'p.animals', 'talk.animals': 'talk.animalsPlain', 'talk.add': 'talk.answer', 'talk.sub': 'talk.answer' };
  var PARAMS = {};
  Object.keys(NEEDS).forEach(function (k) { PARAMS[k] = NEEDS[k].map(function (a) { return a.join('|'); }); });

  var CHILD_FALLBACK = { en: 'friend', vi: 'bé' };
  // keys whose {child} variant is always used when a name is known
  var CHILD_PREFERRED = { 'ui.welcome': 1 };

  // ---------------------------------------------------------------- helpers
  function L(lang) { return lang === 'vi' ? 'vi' : 'en'; }
  function rnd(rng) {
    if (rng && typeof rng.next === 'function') return rng.next();
    if (typeof rng === 'function') return rng();
    return Math.random();
  }
  function stripMarks(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
  }
  function capFirst(s) {
    return s.replace(/^(\s*[“"'(¡¿]*)(\p{Ll})/u, function (m, pre, ch) { return pre + ch.toUpperCase(); });
  }
  function upper(v) { return String(v).toUpperCase(); }
  function rawVal(v) { return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }

  function numberName(lang, n) {
    var v = parseInt(rawVal(n), 10);
    if (isNaN(v)) return String(rawVal(n));
    if (v >= 0 && v <= 20) return NUM[L(lang)][v];
    return String(v);
  }
  function splitOp(value) { // '2+3' → ['2','+','3'];  '7−2' / '7-2' → ['7','−','2']
    var m = String(value).replace(/\s+/g, '').match(/^(\d+)([+−\-])(\d+)$/);
    return m ? [m[1], m[2] === '+' ? '+' : '−', m[3]] : null;
  }
  function exprText(value) {   // display form "2 + 3" / "7 − 2"
    var p = splitOp(value);
    return p ? p[0] + ' ' + p[1] + ' ' + p[2] : String(value);
  }

  function name(lang, kind, value) {
    lang = L(lang);
    var tbl;
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'letter': case 'lower': {
        if (lang === 'vi') return LETTER_VI[upper(value)] || String(value).toLowerCase();
        return String(value);
      }
      case 'sum': case 'diff': {
        var p = splitOp(value);
        if (!p) return String(value);
        var op = p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') : (lang === 'vi' ? 'trừ' : 'minus');
        return numberName(lang, p[0]) + ' ' + op + ' ' + numberName(lang, p[2]);
      }
      case 'word': {
        var w = String(value);
        if (spriteOfWord(lang, w)) return w;
        var bySpr = wordOfSprite(lang, w);       // a sprite id was passed
        return bySpr || w;
      }
      case 'sound': return soundText(lang, value);
      default:
        tbl = NAMES[lang][kind];
        if (tbl && tbl[value] != null) return tbl[value];
        return String(value);
    }
  }
  function plural(lang, kind, value) {
    lang = L(lang);
    if (lang === 'en' && PLURAL_EN[kind] && PLURAL_EN[kind][value]) return PLURAL_EN[kind][value];
    return name(lang, kind, value);
  }
  function soundText(lang, v) {          // animal id → "Moo moo!"; literal text passes through
    if (v == null || v === '') return '';
    v = rawVal(v);
    var s = STR[L(lang)]['sound.' + v];
    if (s != null) return s;
    return NAMES.en.animal[v] ? '' : String(v);      // a silent animal (fish, snail…) → no sound
  }
  function soundWord(lang, v) {          // "Moo moo!" → "moo moo"
    var s = soundText(lang, v);
    return s.replace(/[!?.…]+/g, '').trim().toLowerCase();
  }

  function addForms(out, list) {
    for (var i = 0; i < list.length; i++) {
      var w = String(list[i]).toLowerCase();
      if (!w) continue;
      if (out.indexOf(w) < 0) out.push(w);
      var s = stripMarks(w);
      if (out.indexOf(s) < 0) out.push(s);
    }
    return out;
  }
  function numberWords(lang, n) {
    var v = parseInt(rawVal(n), 10), out = [];
    if (isNaN(v)) return addForms(out, [String(n)]);
    out.push(String(v));
    // vi 0 = "không", which also means "no" → only accepted as the whole answer (see NUM_ALT '=không')
    if (v >= 0 && v <= 20 && !(lang === 'vi' && v === 0)) addForms(out, [NUM[lang][v]]);
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }

  function words(lang, kind, value) {
    lang = L(lang);
    var out = [];
    switch (kind) {
      case 'number': return numberWords(lang, value);
      case 'letter': case 'lower': {
        var U = upper(value);
        var base = [U.toLowerCase(), 'letter ' + U.toLowerCase(), 'chữ ' + U.toLowerCase()];
        if (lang === 'vi') {
          base.push(LETTER_VI[U] || U.toLowerCase());
          if (LETTER_VI[U]) base.push('chữ ' + LETTER_VI[U]);
          base = base.concat(LETTER_WORDS_VI[U] || []);
        } else {
          base = base.concat(LETTER_WORDS_EN[U] || []);
          if (LETTER_SPEECH_EN[U]) base.push(LETTER_SPEECH_EN[U]);
        }
        if (lang === 'vi') {          // no stripped forms: Ă/Â≠A, Đ≠D, Ê≠E, Ô/Ơ≠O, Ư≠U (the matcher still tries
          base.forEach(function (w) { // diacritic-free comparison, but at a lower score than an exact match)
            w = w.toLowerCase(); if (out.indexOf(w) < 0) out.push(w);
          });
          return out;
        }
        return addForms(out, base);
      }
      case 'sum': case 'diff': {
        var p = splitOp(value);
        if (!p) return addForms(out, [String(value)]);
        addForms(out, [name(lang, kind, value), p[0] + ' ' + (p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') :
          (lang === 'vi' ? 'trừ' : 'minus')) + ' ' + p[2]]);
        return out;
      }
      case 'word': {
        var w = name(lang, 'word', value);
        var list = [w];
        var sk = spriteKind(spriteOfWord(lang, w));
        if (sk && WORDS[lang][sk.kind] && WORDS[lang][sk.kind][sk.value]) list = list.concat(WORDS[lang][sk.kind][sk.value]);
        return addForms(out, list);
      }
      default: {
        var nm = NAMES[lang][kind] && NAMES[lang][kind][value];
        var extra = WORDS[lang][kind] && WORDS[lang][kind][value];
        var l2 = [];
        if (nm) l2.push(nm);
        if (extra) l2 = l2.concat(extra);
        if (!l2.length) l2.push(String(value));
        return addForms(out, l2);
      }
    }
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function present(v) { return v != null && v !== '' && !(typeof v === 'object' && 'value' in v && v.value == null); }
  // param lookup with the documented defaults
  function getParam(params, k) {
    var p = params || {};
    if (present(p[k])) return p[k];
    switch (k) {
      case 'lower': return present(p.letter) ? String(rawVal(p.letter)).toLowerCase() : null;
      case 'sum': return present(p.diff) ? p.diff : null;
      case 'diff': return present(p.sum) ? p.sum : null;
      case 'sound': return present(p.animal) ? p.animal : null;
      case 'soundWord': return present(p.sound) ? p.sound : (present(p.animal) ? p.animal : null);
      default: return null;
    }
  }

  function resolveParam(lang, key, val, params) {
    if (!present(val)) return '';
    if (typeof val === 'object' && val.kind) {
      if (key === 'fruit' && val.kind === 'fruit') val = val.value;          // keep plural handling
      else if (key === 'sound' || key === 'soundWord') val = val.value;
      else return name(lang, val.kind, val.value);
    }
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity': case 'nameParity':
        return name(lang, key === 'nameParity' ? 'parity' : key, val);
      case 'fruit': {
        var id = String(val);
        if (NAMES.en.fruit[id]) {
          var n = params && present(params.n) ? rawVal(params.n) : null;
          return (n != null && Number(n) !== 1) ? plural(lang, 'fruit', id) : name(lang, 'fruit', id);
        }
        return id;
      }
      case 'fruits': return NAMES.en.fruit[val] ? plural(lang, 'fruit', val) : String(val);
      case 'letter': return String(val);
      case 'lower': return String(val).toLowerCase();
      case 'sum': case 'diff': return exprText(val);
      case 'sound': return soundText(lang, val);
      case 'soundWord': return soundWord(lang, val);
      case 'word': return name(lang, 'word', val);
      default: return String(val);
    }
  }

  function fill(lang, str, params, child) {
    if (!child) str = str.replace(/(bé|Bé) \{child\}/g, '$1');
    var out = str.replace(/\{(\w+)\}/g, function (m, k) {
      if (k === 'child') return child || CHILD_FALLBACK[lang];
      return resolveParam(lang, k, getParam(params, k), params);
    });
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();
    if (lang === 'en') out = out.replace(/\b([Aa]) (?=[aeiouAEIOU8]|11\b|18\b)/g, '$1n ');   // a orange → an orange
    out = out.replace(/([.!?]\s+)(\p{Ll})/gu, function (m, pre, ch) { return pre + ch.toUpperCase(); });
    return capFirst(out);
  }

  function needsMet(lang, key, params) {
    var need = NEEDS[key];
    if (!need) return true;
    for (var i = 0; i < need.length; i++) {
      var any = false;
      for (var j = 0; j < need[i].length; j++) {
        var k = need[i][j];
        if (resolveParam(lang, k, getParam(params, k), params) !== '') { any = true; break; }
      }
      if (!any) return false;
    }
    return true;
  }

  I18N.t = function (lang, key, params, rng) {
    lang = L(lang);
    for (var hop = 0; hop < 3 && !needsMet(lang, key, params); hop++) {
      key = FALLBACK[key] || (/^p\./.test(key) ? 'p.generic' : key);
    }
    var v = STR[lang][key];
    if (v == null) v = STR.en[key];
    if (v == null) return key;
    var child = params && params.child != null ? String(params.child).trim() : String(I18N.child || '').trim();
    if (Array.isArray(v)) {
      var withChild = v.filter(function (s) { return s.indexOf('{child}') >= 0; });
      var noChild = v.filter(function (s) { return s.indexOf('{child}') < 0; });
      var pool = v;
      if (!child) { if (noChild.length) pool = noChild; }
      else if (CHILD_PREFERRED[key] && withChild.length) pool = withChild;
      v = pool[Math.min(pool.length - 1, Math.floor(rnd(rng) * pool.length))];
    }
    return fill(lang, v, params, child);
  };

  I18N.name = name;
  I18N.words = words;
  I18N.plural = plural;
  I18N.sound = function (lang, animal) { var s = STR[L(lang)]['sound.' + animal]; return s == null ? '' : s; };
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.SOUND_ANIMALS = SOUND_ANIMALS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PARAMS = PARAMS;          // { 'p.count': ['n', 'fruit'], 'p.add': ['sum|diff'], … } — required params per key
  I18N.NAME_TABLE = NAMES;       // read-only use (tests / UI)
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;

  // the spoken/displayed name of a caught item: a 'word' item is named by its picture ("con gấu"), a letter keeps its case
  function itemName(lang, kind, value) {
    if (kind === 'word') {
      var sk = spriteKind(spriteOfWord(lang, String(value)));
      return sk ? name(lang, sk.kind, sk.value) : name(lang, 'word', value);
    }
    if (kind === 'letter' || kind === 'lower') return String(value);
    if (kind === 'number') return String(rawVal(value));
    return name(lang, kind, value);
  }
  function exprOf(ev) {
    var p = ev.params || {};
    return ev.sum || ev.diff || p.sum || p.diff || null;
  }

  /* Pip's line for a `correct` event:
   *   ev = { nameKind, nameValue, target:{kind, value}, count?, need?, sum?|diff?|params? }
   * colour "Yes! The red ball!" · count mode (target.kind 'fruit'): count < need → "Two!", count ≥ need → "Yes! 3 pears!" */
  I18N.sayCorrect = function (lang, ev, rng) {
    lang = L(lang);
    ev = ev || {};
    var tg = ev.target || ev.label || {};
    var kind = tg.kind || tg.type || ev.nameKind;
    var val = tg.value != null ? tg.value : ev.nameValue;
    var key, params = {};
    switch (kind) {
      case 'color': key = 'say.correct.color'; params.color = val; break;
      case 'shape': key = 'say.correct.shape'; params.shape = val; break;
      case 'size': key = 'say.correct.size'; params.size = val; break;
      case 'animal': key = 'say.correct.animal'; params.animal = val; params.sound = I18N.sound(lang, val); break;
      case 'fruit': {
        var c = ev.count != null ? ev.count : 1, need = ev.need != null ? ev.need : c;
        if (c >= need) { key = 'say.countDone'; params.n = c; params.fruit = val; }
        else { key = 'say.correct.count'; params.count = numberName(lang, c); }
        break;
      }
      case 'letter': case 'lower': case 'initial':
        if (ev.nameKind === 'word') {
          key = 'say.correct.word'; params.word = name(lang, 'word', ev.nameValue); params.letter = String(val);
        } else {
          key = 'say.correct.letter';
          params.letter = String(ev.nameValue != null && ev.nameKind !== 'word' ? ev.nameValue : val);
        }
        break;
      case 'number': {
        var ex = exprOf(ev);
        params.n = String(rawVal(ev.nameValue != null ? ev.nameValue : val));
        if (ex) { key = 'say.correct.sum'; params.sum = ex; } else key = 'say.correct.number';
        break;
      }
      case 'parity': key = 'say.correct.parity'; params.parity = val; params.n = String(rawVal(ev.nameValue)); break;
      default: key = null;
    }
    if (!key || !I18N.has(lang, key)) return I18N.t(lang, 'praise', null, rng);
    return I18N.t(lang, key, params, rng);
  };

  /* Pip's kind line for a `wrong` event (the caught item hopped out):
   *   ev = { nameKind, nameValue, target:{kind, value}, bySound?, sum?|diff?|params? }
   * "That’s a blue ball. Let’s find red!" / "Đó là quả bóng màu xanh dương. Mình tìm màu đỏ nhé!"
   * bySound (age-5 animal rounds): never names the target — "That’s the cat. Who says moo moo?" */
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = ev || {};
    var tg = ev.target || {};
    var kind = tg.kind, val = tg.value;
    var params = { name: itemName(lang, ev.nameKind, ev.nameValue) }, key = null;
    if (ev.nameValue == null || !kind) return I18N.t(lang, 'wrong', null, rng);
    switch (kind) {
      case 'color':
        key = 'say.wrong.color'; params.target = { kind: 'color', value: val };
        if (ev.nameKind !== 'color') key = null;
        break;
      case 'shape': key = 'say.wrong.shape'; params.target = { kind: 'shape', value: val }; break;
      case 'size':
        key = 'say.wrong.size'; params.target = { kind: 'size', value: val };
        if (ev.nameKind !== 'size') key = null;
        break;
      case 'fruit': key = 'say.wrong.fruit'; params.target = plural(lang, 'fruit', val); break;
      case 'animal':
        if (ev.bySound && I18N.sound(lang, val)) { key = 'say.wrong.animalSound'; params.soundWord = val; }
        else { key = 'say.wrong.animal'; params.target = { kind: 'animal', value: val }; }
        break;
      case 'letter': case 'lower': case 'initial':
        params.target = String(val);
        key = ev.nameKind === 'word' ? 'say.wrong.word' : 'say.wrong.letter';
        break;
      case 'number': {
        var ex = exprOf(ev);
        if (ex) { key = 'say.wrong.sum'; params.sum = ex; } else key = 'say.wrong.number';
        break;
      }
      case 'parity': {
        var nv = parseInt(rawVal(ev.nameValue), 10);
        if (isNaN(nv)) break;
        key = 'say.wrong.parity'; params.nameParity = nv % 2 ? 'odd' : 'even'; params.target = { kind: 'parity', value: val };
        break;
      }
    }
    if (!key || !I18N.has(lang, key)) return I18N.t(lang, 'wrong', null, rng);
    return I18N.t(lang, key, params, rng);
  };

  // gentle line after a Talk-time miss: "It is red! Good try!" / "It is the cow! Good try!" / "It is the letter B!"
  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { value = kind.value; kind = kind.kind; }
    if (kind === 'letter' || kind === 'lower') return I18N.t(lang, 'talk.wrong.letter', { answer: String(value) });
    if (kind === 'animal' || kind === 'shape' || kind === 'fruit') return I18N.t(lang, 'talk.wrong.the', { answer: { kind: kind, value: value } });
    if (kind === 'word') return I18N.t(lang, 'talk.wrong.the', { answer: itemName(lang, 'word', value) });
    if (kind === 'parity') return I18N.t(lang, 'talk.wrong.parity', { answer: { kind: kind, value: value } });
    return I18N.t(lang, 'talk.wrong', { answer: { kind: kind, value: value } });
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/[…]/g, '.').replace(/[›»«]/g, ',');
    if (lang === 'en') {
      // "letter B" / "Big B," / "small b!" → letter names (only when the letter stands alone)
      s = s.replace(/\b(letter|Letter|big|Big|small|Small) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  PG.I18N = I18N;
})(window.PG = window.PG || {});
