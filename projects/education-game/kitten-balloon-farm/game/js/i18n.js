/* Kitten's Balloon Farm — KB.I18N (English + Vietnamese). Miu the kitten talks to the child.
 *
 *   KB.I18N.t(lang, key, params, rng?)   → string (variants picked with rng.next()/rng()/Math.random)
 *   KB.I18N.name(lang, kind, value)      → display + spoken name ("red"/"màu đỏ", 7 → "seven"/"bảy",
 *                                          pig → "pig"/"con lợn", sound pig → "oink"/"ụt ịt", balloon red → "red balloon")
 *   KB.I18N.words(lang, kind, value)     → accepted spoken forms for speech recognition (lower-case, + no-diacritic forms)
 *   KB.I18N.speech(lang, text)           → text tuned for TTS (letter names, + − =)
 *   KB.I18N.sayCorrect(lang, ev, rng)    → Miu's line for a `correct` event   (reads ev.nameKind, ev.nameValue, ev.sprite,
 *                                          ev.mode/ev.n/ev.need for count rounds, ev.word/ev.expr/ev.parity optional)
 *   KB.I18N.sayWrong(lang, ev, rng)      → gentle line for a `wrong` event    (reads ev.nameKind, ev.nameValue = tapped balloon,
 *                                          ev.targetNameKind, ev.targetNameValue = what we want)
 *   KB.I18N.sayCount(lang, n, need)      → "Two!" … at need "Three! Three balloons!" / "Ba! Ba quả bóng!"
 *   KB.I18N.sayPop(lang, rng)            → "Pop!" / "Bụp!"   (sayBloom is an alias)
 *   KB.I18N.talkWrong(lang, kind, value) → gentle "it's X" line for a missed Talk-time answer
 *   KB.I18N.sound(lang, animal)          → the animal's sound word ("moo"/"ụm bò") or '' (bunny; goat in vi)
 *   KB.I18N.setChild(name)               → default {child} for every t() call
 *   KB.I18N.langs = ['en', 'vi'];  KB.I18N.has(lang, key);  KB.I18N.keys(lang);  KB.I18N.PARAMS (required params)
 *
 * Params: values may be RAW ({animal:'pig'}, {color:'red'}, {n:3}) — keys named like a name kind (color, shape, size,
 * animal, parity) are named automatically; an object {kind, value} is always replaced by name(lang, kind, value).
 * Derived params: {sound} from params.sound (an animal id or a sound word) or params.animal; {letter} from letter|text;
 * {word} from word|animal|sprite|text; {expr} ("2 + 3") from expr|text|a,b; {balloons} = "balloon"/"balloons" from k|n
 * (vi "quả bóng"). Keys in PLURAL use their ".one" variant when k (or n) is 1: "Pop the red balloon!" vs "…balloons!".
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * {child}: if the child's name is empty, variants containing {child} are skipped; if every variant has it,
 * {child} becomes "friend" / "bé". Missing params are removed (never a stray "{x}" on screen).
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài", Ă → "á", Â → "ớ" … (see LETTER_VI and docs/VOICE.md).
 */
(function (KB) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'horse', 'goat', 'chick', 'bunny', 'puppy'];

  // ---------------------------------------------------------------- names
  // Vietnamese animal names carry their classifier ("con bò", "gà con", "cún con"), as a teacher says them.
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink',
        cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
        rectangle: 'rectangle' },
      size: { big: 'big', small: 'small' },
      animal: { cow: 'cow', pig: 'pig', sheep: 'sheep', duck: 'duck', horse: 'horse', goat: 'goat', chick: 'chick',
        bunny: 'bunny', puppy: 'puppy' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', pink: 'màu hồng', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
        heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật' },
      size: { big: 'to', small: 'nhỏ' },
      animal: { cow: 'con bò', pig: 'con lợn', sheep: 'con cừu', duck: 'con vịt', horse: 'con ngựa', goat: 'con dê',
        chick: 'gà con', bunny: 'con thỏ', puppy: 'cún con' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  // Animal sounds: SOUND = the word in "Which animal says moo?"; CALL = Miu's happy imitation after a pop.
  // No sound: bunny (both), goat in Vietnamese (there is no common kindergarten word) → never asked (DESIGN §6).
  var SOUND = {
    en: { cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', horse: 'neigh', goat: 'maa', chick: 'cheep', puppy: 'woof' },
    vi: { cow: 'ụm bò', pig: 'ụt ịt', sheep: 'be be', duck: 'cạp cạp', horse: 'hí hí', chick: 'chíp chíp', puppy: 'gâu gâu' }
  };
  var CALL = {
    en: { cow: 'Moo!', pig: 'Oink oink!', sheep: 'Baa baa!', duck: 'Quack quack!', horse: 'Neigh!', goat: 'Maa!',
      chick: 'Cheep cheep!', puppy: 'Woof woof!' },
    vi: { cow: 'Ụm bò!', pig: 'Ụt ịt!', sheep: 'Be be!', duck: 'Cạp cạp!', horse: 'Hí hí!', chick: 'Chíp chíp!',
      puppy: 'Gâu gâu!' }
  };
  var BALLOON = { en: 'balloon', vi: 'quả bóng' };

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
  // Vietnamese letters, phonics names as taught in kindergarten / grade 1 ("âm"), used for display AND speech.
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
        pink: ['pink', 'pinks', 'pinky'], cream: ['white', 'cream'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles', 'ball'], square: ['square', 'box', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: {
        cow: ['cow', 'cows', 'calf', 'moo cow', 'cowie'],
        pig: ['pig', 'piggy', 'piglet', 'pigs', 'piggie'],
        sheep: ['sheep', 'lamb', 'lamby', 'baby sheep', 'sheeps'],
        duck: ['duck', 'ducky', 'duckling', 'ducks', 'duckie'],
        horse: ['horse', 'pony', 'foal', 'horsey', 'horses', 'horsie'],
        goat: ['goat', 'goats', 'baby goat', 'billy goat', 'goatie'],
        chick: ['chick', 'chicken', 'chicky', 'baby chick', 'chicks', 'chickie'],
        bunny: ['bunny', 'rabbit', 'bunnies', 'bunny rabbit', 'bun'],
        puppy: ['puppy', 'dog', 'doggy', 'doggie', 'puppies', 'pup'] },
      sound: { cow: ['moo', 'mooo', 'moo moo'], pig: ['oink', 'oink oink'], sheep: ['baa', 'baa baa', 'bah'],
        duck: ['quack', 'quack quack'], horse: ['neigh', 'nay', 'neigh neigh'], goat: ['maa', 'mah', 'meh'],
        chick: ['cheep', 'cheep cheep', 'tweet', 'peep'], puppy: ['woof', 'woof woof', 'bark', 'arf'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] },
      balloon: { balloon: ['balloon', 'balloons', 'baloon'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng', 'hồng hồng'], cream: ['trắng', 'màu trắng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], rectangle: ['chữ nhật', 'hình chữ nhật'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: {
        cow: ['con bò', 'bò', 'bò sữa', 'con bò sữa', 'bò con', 'con bê'],
        pig: ['con lợn', 'lợn', 'heo', 'con heo', 'lợn con', 'heo con', 'con ỉn', 'lợn ỉn'],
        sheep: ['con cừu', 'cừu', 'cừu con', 'cừu non'],
        duck: ['con vịt', 'vịt', 'vịt con'],
        horse: ['con ngựa', 'ngựa', 'ngựa con'],
        goat: ['con dê', 'dê', 'dê con'],
        chick: ['gà con', 'con gà', 'gà', 'con gà con', 'gà bông'],
        bunny: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng'],
        puppy: ['cún con', 'cún', 'con cún', 'con chó', 'chó', 'chó con'] },
      sound: { cow: ['ụm bò', 'ò ò', 'um bò', 'mò'], pig: ['ụt ịt', 'ủn ỉn', 'ut it'], sheep: ['be be', 'bê bê', 'be'],
        duck: ['cạp cạp', 'quạc quạc', 'cạc cạc'], horse: ['hí hí', 'hí'], chick: ['chíp chíp', 'chiếp chiếp'],
        puppy: ['gâu gâu', 'gâu', 'gâu gâu gâu'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] },
      balloon: { balloon: ['quả bóng', 'bóng', 'bóng bay', 'quả bóng bay', 'trái bóng'] }
    }
  };

  // Default KB.WORDS (DESIGN §5.1) — word lists for the 'initial' topic. content.js loads later and may replace it.
  // vi: thỏ (th), ngựa (ng), chó (ch) are skipped — Vietnamese phonics teaches th / ng / ch as their own sounds.
  var WORD_LIST = {
    en: [['cow', 'animal_cow', 'C'], ['pig', 'animal_pig', 'P'], ['sheep', 'animal_sheep', 'S'], ['duck', 'animal_duck', 'D'],
      ['horse', 'animal_horse', 'H'], ['goat', 'animal_goat', 'G'], ['chick', 'animal_chick', 'C'],
      ['bunny', 'animal_bunny', 'B'], ['puppy', 'animal_puppy', 'P']],
    vi: [['bò', 'animal_cow', 'B'], ['lợn', 'animal_pig', 'L'], ['cừu', 'animal_sheep', 'C'], ['vịt', 'animal_duck', 'V'],
      ['dê', 'animal_goat', 'D'], ['gà con', 'animal_chick', 'G']]
  };
  if (!KB.WORDS) {
    KB.WORDS = {};
    LANGS.forEach(function (l) {
      KB.WORDS[l] = WORD_LIST[l].map(function (w) { return { word: w[0], sprite: w[1], initial: w[2] }; });
    });
  }
  function spriteOfWord(lang, w) {        // looks in content's KB.WORDS first, then the default list
    var cur = KB.WORDS && KB.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].word === w) return cur[i].sprite || null;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][0] === w) return WORD_LIST[lang][i][1];
    return null;
  }
  function wordOfSprite(lang, spr) {
    var cur = KB.WORDS && KB.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].sprite === spr) return cur[i].word;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][1] === spr) return WORD_LIST[lang][i][0];
    return null;
  }
  function animalOf(v) {                  // 'pig' | 'animal_pig' | {kind:'animal', value:'pig'} → 'pig' | null
    if (v && typeof v === 'object') v = v.value;
    if (v == null) return null;
    var s = String(v).replace(/^animal_/, '');
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity', 'sum', 'diff', 'word', 'sound', 'balloon'];

  var STR = {
    en: {
      'ui.title': 'Kitten’s Balloon Farm',
      'ui.logo1': 'Kitten’s',
      'ui.logo2': 'Balloon Farm',
      'ui.subtitle': 'Pop, count and learn with Miu!',
      'ui.tagline': 'Pop, count and learn with Miu!',
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
      'ui.name': 'Child’s name',
      'ui.namePlaceholder': 'e.g. Mai',
      'ui.sound': 'Sound effects',
      'ui.music': 'Music',
      'ui.volume': 'Volume',
      'ui.voice': 'Miu’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Miu. Let’s pop balloons!', 'Hi! I am Miu. Let’s pop balloons!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Miu is listening…',
      'ui.tapMiu': 'Tap Miu to hear it again',
      'ui.skip': 'Skip',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Balloons',
      'topic.size': 'Big and Small',
      'topic.shapes': 'Shape Balloons',
      'topic.count': 'Counting Pops',
      'topic.animals': 'Farm Friends',
      'topic.letters': 'Letter Balloons',
      'topic.lower': 'Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Good morning, farm!',
      'weather.1': 'It’s noon! The sun is up high!',
      'weather.2': 'Sunset time! The sky is orange!',
      'weather.3': 'Good night, stars! Look, fireflies!',

      'p.colors': 'Pop the {color} balloons!',
      'p.colors.one': 'Pop the {color} balloon!',
      'p.colorsAny': 'Pop the balloons with the colour on the sign!',
      'p.shapes': 'Pop the {shape} balloons!',
      'p.shapes.one': 'Pop the {shape} balloon!',
      'p.shapesAny': 'Pop the balloons with the shape on the sign!',
      'p.size': 'Pop the {size} balloons!',
      'p.size.one': 'Pop the {size} balloon!',
      'p.sizeAny': 'Look at the sign! Big or small?',
      'p.count': 'Pop {n} {balloons}! Let’s count!',
      'p.countAny': 'Pop the balloons and count with me!',
      'p.animals': 'Pop the balloon with the {animal}!',
      'p.animalsNext': ['Now the {animal}!', 'Next, the {animal}!', 'And now the {animal}!', 'Where is the {animal}?'],
      'p.animalsAll': 'Pop the balloons with the farm friends!',
      'p.letters': 'Pop the letter {letter}!',
      'p.lettersAny': 'Pop the letter on the sign!',
      'p.lower': 'Find the small letter {lower}!',
      'p.lowerAny': 'Find the small letter for the big one!',
      'p.initial': 'What does {word} start with? Pop it!',
      'p.initialAny': 'Which letter does it start with? Pop it!',
      'p.add': 'What is {expr}? Pop the answer!',
      'p.addAny': 'Add them up! Pop the answer!',
      'p.sub': 'What is {expr}? Pop the answer!',
      'p.subAny': 'Take away! Pop the answer!',
      'p.oddeven': 'Pop the {parity} numbers!',
      'p.oddeven.one': 'Pop the {parity} number!',
      'p.oddevenAny': 'Look at the sign! Pop the right numbers!',

      'say.pop': ['Pop!', 'Pop pop!', 'Poof!', 'Pop! Confetti!', 'Whee, pop!', 'Ta-da! Pop!'],
      'say.correct.color': ['{answer}!', 'Yes! {answer}!', 'A {answer} balloon!', '{answer}! Just right!'],
      'say.correct.shape': ['A {answer}!', 'Yes! A {answer}!', 'The {answer} balloon!', 'A {answer}! Well done!'],
      'say.correct.size': ['{answer}!', 'The {answer} balloon!', 'Yes! {answer}!'],
      'say.correct.animal': ['The {answer}! {call}', 'Hello, {answer}! {call}', 'Yes! The {answer}! {call}'],
      'say.correct.animalQuiet': ['The {answer}!', 'Hello, {answer}!', 'Yes! The {answer}!'],
      'say.correct.number': ['{answer}!', 'Yes! {answer}!', '{answer}! Well done!'],
      'say.correct.sum': ['Yes! {name} is {answer}!', '{name} makes {answer}!'],
      'say.correct.letter': ['The letter {letter}!', 'Yes! The letter {letter}!', 'That is the letter {letter}!'],
      'say.correct.word': ['{word} starts with the letter {letter}!'],
      'say.correct.parity': ['Yes! {name} is {answer}!', '{name} is an {answer} number!'],
      'say.correct.sound': ['{call}', 'Yes! {call}'],
      'say.countDone': '{N}! {N} {balloons}!',
      'say.wrong.color': ['That’s the {name} one. Where is the {target} one?', 'That one is {name}. Let’s find the {target} one!'],
      'say.wrong.shape': ['That’s a {name}. Where is the {target}?', 'That one is a {name}. Let’s find the {target}!'],
      'say.wrong.size': ['That one is {name}. Where is the {target} one?', 'That’s a {name} one. Find the {target} one!'],
      'say.wrong.animal': ['That’s the {name}. Where is the {target}?', 'Hello, {name}! Now let’s find the {target}!'],
      'say.wrong.letter': ['That’s the letter {letter}. Where is {tletter}?', 'That one is {letter}. Let’s find {tletter}!'],
      'say.wrong.number': ['That one is {name}. Let’s try again!', 'That’s {name}. Let’s look again!'],
      'say.wrong.some': ['That one is {name}. Let’s look again!', 'That’s {name}. One more try!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'What a balloon party!', 'Wow, {child}, you are a star!',
        'Super popping!', 'Hooray! All popped!', 'You are so clever!'],
      'wrong': ['Hmm, let’s try another balloon!', 'Almost! Try again!', 'Ooh, let’s look again!',
        'Boing! Try a different one!', 'So close! One more try!', 'Let’s think again!', 'Keep trying, you can do it!'],
      'miss': ['Tap a balloon!', 'The balloons are up here!', 'Whee! Try a balloon!', 'Touch a balloon to pop it!',
        'Pop a balloon!'],
      'hint': ['Look! This balloon is glowing.', 'Psst! Try the shiny balloon!', 'Here is a clue: the glowing one!',
        'Miu will help! Look here!', 'Try the sparkly balloon!'],
      'idle': ['Tap a balloon to pop it!', 'Want to play? Tap a balloon!', 'Miu is waiting! Your turn!',
        'The balloons are waiting for you!', 'Let’s pop! Tap one!', 'I am here, {child}! Let’s play!'],

      'talk.intro': 'Talk time! Miu has a question.',
      'talk.colors': 'What colour is this balloon?',
      'talk.size': 'Is it big or small?',
      'talk.shapes': 'What shape is this balloon?',
      'talk.count': 'How many balloons?',
      'talk.animals': 'Which animal says {sound}?',
      'talk.animalsAny': 'Tap a farm friend!',
      'talk.letters': 'Which letter is this?',
      'talk.lower': 'Which letter is this?',
      'talk.initial': 'Which letter does it start with?',
      'talk.add': 'What is the answer?',
      'talk.sub': 'What is the answer?',
      'talk.oddeven': 'Is it odd or even?',
      'talk.right': ['Yes! You are right!', 'Correct! Hooray!', 'Wow, you know it!', 'That is it! Super!',
        'Clever you!', 'Yes, {child}! Great answer!'],
      'talk.wrong': 'It is {answer}! Good try!',
      'talk.wrong.a': 'It is a {answer}! Good try!',
      'talk.wrong.size': 'It is {answer}! Good try!',
      'talk.wrong.animal': 'It is the {answer}! Good try!',
      'talk.wrong.animalSound': 'The {answer} says {sound}! Good try!',
      'talk.wrong.letter': 'It is the letter {letter}! Good try!',
      'talk.wrong.parity': 'It is {answer}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',

      'session.done': ['You did it all! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'What a party! {stars} stars!']
    },
    vi: {
      'ui.title': 'Bóng Bay Nông Trại Mèo Con',
      'ui.logo1': 'Bóng Bay',
      'ui.logo2': 'Nông Trại Mèo Con',
      'ui.subtitle': 'Cùng Miu bấm bóng, đếm và học nhé!',
      'ui.tagline': 'Cùng Miu bấm bóng, đếm và học nhé!',
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
      'ui.volume': 'Âm lượng',
      'ui.voice': 'Giọng của Miu',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Miu đây. Mình cùng chơi bóng bay nhé!', 'Chào bé! Miu đây. Mình cùng chơi bóng bay nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Miu đang nghe…',
      'ui.tapMiu': 'Chạm vào Miu để nghe lại nhé',
      'ui.skip': 'Bỏ qua',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Bóng bay sắc màu',
      'topic.size': 'To và nhỏ',
      'topic.shapes': 'Bóng bay hình khối',
      'topic.count': 'Đếm bóng bay',
      'topic.animals': 'Bạn thú nông trại',
      'topic.letters': 'Chữ cái',
      'topic.lower': 'Chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Chào buổi sáng, nông trại ơi!',
      'weather.1': 'Buổi trưa rồi! Ông mặt trời lên cao!',
      'weather.2': 'Hoàng hôn rồi! Bầu trời màu cam!',
      'weather.3': 'Chúc ngủ ngon, các vì sao! Nhìn kìa, đom đóm!',

      'p.colors': 'Bé ơi, bấm vào tất cả quả bóng {color} nhé!',
      'p.colors.one': 'Bé ơi, bấm vào quả bóng {color} nhé!',
      'p.colorsAny': 'Bé bấm vào bóng có màu giống tấm biển nhé!',
      'p.shapes': 'Bé ơi, bấm vào tất cả quả bóng {shape} nhé!',
      'p.shapes.one': 'Bé ơi, bấm vào quả bóng {shape} nhé!',
      'p.shapesAny': 'Bé bấm vào bóng có hình giống tấm biển nhé!',
      'p.size': 'Bé ơi, bấm vào tất cả quả bóng {size} nhé!',
      'p.size.one': 'Bé ơi, bấm vào quả bóng {size} nhé!',
      'p.sizeAny': 'Bé nhìn tấm biển nè! To hay nhỏ nhỉ?',
      'p.count': 'Bé ơi, bấm {n} quả bóng nhé! Mình cùng đếm nào!',
      'p.countAny': 'Bé bấm bóng rồi đếm cùng Miu nào!',
      'p.animals': 'Bé ơi, bấm vào quả bóng có {animal} nhé!',
      'p.animalsNext': ['Giờ đến {animal} nhé!', 'Tiếp theo là {animal} nào!', '{animal} đâu rồi nhỉ?',
        'Còn {animal} thì sao nhỉ?'],
      'p.animalsAll': 'Bé ơi, bấm vào bóng có các bạn thú nhé!',
      'p.letters': 'Bé ơi, bấm vào quả bóng chữ {letter} nhé!',
      'p.lettersAny': 'Bé bấm vào chữ giống tấm biển nhé!',
      'p.lower': 'Bé tìm chữ {lower} viết thường nhé!',
      'p.lowerAny': 'Bé tìm chữ thường cho chữ in hoa nhé!',
      'p.initial': '{word} bắt đầu bằng chữ gì? Bé bấm nhé!',
      'p.initialAny': 'Hình này bắt đầu bằng chữ gì? Bé bấm nhé!',
      'p.add': '{expr} bằng mấy? Bé bấm vào đáp số nhé!',
      'p.addAny': 'Bé tính phép cộng rồi bấm vào đáp số nhé!',
      'p.sub': '{expr} bằng mấy? Bé bấm vào đáp số nhé!',
      'p.subAny': 'Bé tính phép trừ rồi bấm vào đáp số nhé!',
      'p.oddeven': 'Bé ơi, bấm vào các số {parity} nhé!',
      'p.oddeven.one': 'Bé ơi, bấm vào số {parity} nhé!',
      'p.oddevenAny': 'Bé nhìn tấm biển rồi bấm đúng số nhé!',

      'say.pop': ['Bụp!', 'Bụp bụp!', 'Bùm!', 'Nổ rồi!', 'Bụp! Hoa giấy nè!', 'Ta-đa! Bụp!'],
      'say.correct.color': ['{answer}!', 'Đúng rồi, {answer}!', 'Quả bóng {answer}!', '{answer} đó! Giỏi quá!'],
      'say.correct.shape': ['{answer}!', 'Đúng rồi, {answer}!', 'Quả bóng {answer}!', '{answer} đó! Bé giỏi quá!'],
      'say.correct.size': ['Quả bóng {answer}!', 'Đúng rồi, quả bóng {answer}!'],
      'say.correct.animal': ['{answer} đây rồi! {call}', 'Chào {answer}! {call}', 'Đúng rồi, {answer}! {call}'],
      'say.correct.animalQuiet': ['{answer} đây rồi!', 'Chào {answer}!', 'Đúng rồi, {answer}!'],
      'say.correct.number': ['Số {answer}!', 'Đúng rồi, số {answer}!', 'Số {answer} đó! Giỏi quá!'],
      'say.correct.sum': ['Đúng rồi! {name} bằng {answer}!', '{name} bằng {answer}!'],
      'say.correct.letter': ['Chữ {letter}!', 'Đúng rồi, chữ {letter}!', 'Đây là chữ {letter} đó!'],
      'say.correct.word': ['{word} bắt đầu bằng chữ {letter}!'],
      'say.correct.parity': ['Đúng rồi! {name} là số {answer}!', '{name} là số {answer} đó!'],
      'say.correct.sound': ['{call}', 'Đúng rồi! {call}'],
      'say.countDone': '{N}! {N} quả bóng!',
      'say.wrong.color': ['Quả này {name}. Quả bóng {target} đâu nhỉ?', 'Đây là bóng {name}. Mình tìm bóng {target} nào!'],
      'say.wrong.shape': ['Đây là {name}. Còn {target} đâu nhỉ?', 'Quả này {name}. Mình tìm {target} nào!'],
      'say.wrong.size': ['Quả này {name}. Quả bóng {target} đâu nhỉ?', 'Đây là bóng {name}. Bé tìm bóng {target} nhé!'],
      'say.wrong.animal': ['Đây là {name}. {target} đâu nhỉ?', 'Chào {name}! Giờ mình tìm {target} nào!'],
      'say.wrong.letter': ['Đây là chữ {letter}. Chữ {tletter} đâu nhỉ?', 'Quả này chữ {letter}. Mình tìm chữ {tletter} nào!'],
      'say.wrong.number': ['Đây là số {name}. Mình thử lại nhé!', 'Quả này số {name}. Bé nhìn lại nào!'],
      'say.wrong.some': ['Đây là {name}. Mình nhìn lại nhé!', 'Quả này {name}. Bé thử lại nào!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Tiệc bóng bay vui quá!', 'Oa, bé {child} là ngôi sao đó!',
        'Bé bấm bóng giỏi quá!', 'Hoan hô, nổ hết bóng rồi!', 'Bé thông minh quá!'],
      'wrong': ['Ồ, bé thử quả bóng khác nhé!', 'Gần đúng rồi! Thử lại nào!', 'Mình nhìn lại nhé!',
        'Hì, bé thử quả khác nào!', 'Suýt nữa thôi! Thử tiếp nhé!', 'Không sao đâu, thử lại nhé!',
        'Bé nghĩ thêm chút nữa nhé!'],
      'miss': ['Bé chạm vào quả bóng nhé!', 'Bóng bay ở trên này nè!', 'Bé thử bấm một quả bóng nào!',
        'Chạm vào bóng cho nổ nhé!', 'Bấm vào bóng nào bé ơi!'],
      'hint': ['Nhìn nè! Quả bóng này đang sáng.', 'Bé thử quả bóng lấp lánh nhé!', 'Miu gợi ý nè: quả bóng đang sáng!',
        'Miu giúp bé nhé, nhìn đây!', 'Quả bóng sáng lấp lánh đó bé!'],
      'idle': ['Bé ơi, bấm bóng tiếp nào!', 'Bé chạm vào một quả bóng nhé!', 'Miu đang chờ bé nè!',
        'Đến lượt bé rồi đó!', 'Bé {child} ơi, mình chơi tiếp nhé!', 'Bóng bay đang chờ bé nè!'],

      'talk.intro': 'Giờ trò chuyện! Miu hỏi bé nhé.',
      'talk.colors': 'Quả bóng này màu gì nhỉ?',
      'talk.size': 'Quả bóng này to hay nhỏ nhỉ?',
      'talk.shapes': 'Quả bóng này hình gì nhỉ?',
      'talk.count': 'Có mấy quả bóng nào?',
      'talk.animals': 'Con gì kêu {sound} nhỉ?',
      'talk.animalsAny': 'Bé chạm vào một bạn thú nhé!',
      'talk.letters': 'Đây là chữ gì nào?',
      'talk.lower': 'Đây là chữ gì nào?',
      'talk.initial': 'Hình này bắt đầu bằng chữ gì nhỉ?',
      'talk.add': 'Kết quả là bao nhiêu nào?',
      'talk.sub': 'Kết quả là bao nhiêu nào?',
      'talk.oddeven': 'Số này chẵn hay lẻ nhỉ?',
      'talk.right': ['Đúng rồi! Bé giỏi quá!', 'Chính xác! Hoan hô!', 'Oa, bé biết rồi!', 'Đúng luôn! Siêu quá!',
        'Bé thông minh quá!', 'Đúng rồi, bé {child} ơi!'],
      'talk.wrong': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.a': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.size': 'Quả bóng này {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.animal': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.animalSound': '{answer} kêu {sound} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.parity': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Bé làm xong hết rồi! {stars} ngôi sao! Hoan hô!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Tiệc vui quá! {stars} ngôi sao!']
    }
  };

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'p.colors': ['color'], 'p.colors.one': ['color'], 'p.shapes': ['shape'], 'p.shapes.one': ['shape'],
    'p.size': ['size'], 'p.size.one': ['size'], 'p.count': ['n'], 'p.animals': ['animal'], 'p.animalsNext': ['animal'],
    'p.letters': ['letter'], 'p.lower': ['letter'], 'p.initial': ['word'], 'p.add': ['expr'], 'p.sub': ['expr'],
    'p.oddeven': ['parity'], 'p.oddeven.one': ['parity'], 'talk.animals': ['sound'], 'say.countDone': ['n'],
    // feedback lines (normally built by sayCorrect / sayWrong / talkWrong, which always pass them)
    'say.correct.color': ['answer'], 'say.correct.shape': ['answer'], 'say.correct.size': ['answer'],
    'say.correct.number': ['answer'], 'say.correct.animal': ['answer', 'call'], 'say.correct.animalQuiet': ['answer'],
    'say.correct.sum': ['name', 'answer'], 'say.correct.parity': ['name', 'answer'], 'say.correct.letter': ['letter'],
    'say.correct.word': ['word', 'letter'], 'say.correct.sound': ['call'],
    'say.wrong.color': ['name', 'target'], 'say.wrong.shape': ['name', 'target'], 'say.wrong.size': ['name', 'target'],
    'say.wrong.animal': ['name', 'target'], 'say.wrong.letter': ['letter', 'tletter'], 'say.wrong.number': ['name'],
    'say.wrong.some': ['name'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.size': ['answer'], 'talk.wrong.animal': ['answer'],
    'talk.wrong.animalSound': ['answer', 'sound'], 'talk.wrong.letter': ['letter'], 'talk.wrong.parity': ['answer'],
    'talk.wrong.number': ['answer']
  };
  var FALLBACK = {
    'p.colors': 'p.colorsAny', 'p.colors.one': 'p.colorsAny', 'p.shapes': 'p.shapesAny', 'p.shapes.one': 'p.shapesAny',
    'p.size': 'p.sizeAny', 'p.size.one': 'p.sizeAny', 'p.count': 'p.countAny', 'p.animals': 'p.animalsAll',
    'p.animalsNext': 'p.animalsAll', 'p.letters': 'p.lettersAny', 'p.lower': 'p.lowerAny', 'p.initial': 'p.initialAny',
    'p.add': 'p.addAny', 'p.sub': 'p.subAny', 'p.oddeven': 'p.oddevenAny', 'p.oddeven.one': 'p.oddevenAny', 'talk.animals': 'talk.animalsAny',
    'say.countDone': 'praise'
  };
  ['say.correct.color', 'say.correct.shape', 'say.correct.size', 'say.correct.number', 'say.correct.animalQuiet',
    'say.correct.sum', 'say.correct.parity', 'say.correct.letter', 'say.correct.word', 'say.correct.sound']
    .forEach(function (k) { FALLBACK[k] = 'praise'; });
  FALLBACK['say.correct.animal'] = 'say.correct.animalQuiet';
  ['say.wrong.color', 'say.wrong.shape', 'say.wrong.size', 'say.wrong.animal', 'say.wrong.letter', 'say.wrong.number',
    'say.wrong.some', 'talk.wrong', 'talk.wrong.a', 'talk.wrong.size', 'talk.wrong.animal', 'talk.wrong.letter',
    'talk.wrong.parity', 'talk.wrong.number'].forEach(function (k) { FALLBACK[k] = 'wrong'; });
  FALLBACK['talk.wrong.animalSound'] = 'talk.wrong.animal';
  // keys whose ".one" variant is used when the target count (k, else n) is 1
  var PLURAL = { 'p.colors': 1, 'p.shapes': 1, 'p.size': 1, 'p.oddeven': 1 };

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
  function present(v) { return v != null && v !== '' && !(typeof v === 'object' && 'value' in v && (v.value == null || v.value === '')); }
  function num(v) { var n = parseInt(rawVal(v), 10); return isNaN(n) ? null : n; }

  function numberName(lang, n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) return String(n);
    if (v >= 0 && v <= 20) return NUM[lang === 'vi' ? 'vi' : 'en'][v];
    return String(v);
  }
  function splitOp(value) { // '2+3' / '2 + 3' → ['2','+','3'];  '7−2' / '7-2' → ['7','−','2']
    var m = String(value).replace(/\s+/g, '').match(/^(\d+)([+−\-])(\d+)(=.*)?$/);
    return m ? [m[1], m[2] === '+' ? '+' : '−', m[3]] : null;
  }
  function exprText(value) { var p = splitOp(value); return p ? p[0] + ' ' + p[1] + ' ' + p[2] : String(value); }

  function soundOf(lang, animal) { var a = animalOf(animal); return (a && SOUND[L(lang)][a]) || ''; }

  function name(lang, kind, value) {
    lang = L(lang);
    var tbl;
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'letter': {
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
        if (/^animal_/.test(w)) return wordOfSprite(lang, w) || name(lang, 'animal', w.slice(7));   // a sprite id
        return w;
      }
      case 'animal': {
        var a = animalOf(value);
        return a ? NAMES[lang].animal[a] : String(value);
      }
      case 'sound': {                         // value = animal id (or a sound word, returned as is)
        var s = soundOf(lang, value);
        return s || String(animalOf(value) ? NAMES[lang].animal[animalOf(value)] : value);
      }
      case 'balloon': {                       // value = colour key → "red balloon" / "quả bóng màu đỏ"
        var col = NAMES[lang].color[value];
        if (!col) return BALLOON[lang];
        return lang === 'vi' ? BALLOON.vi + ' ' + col : col + ' ' + BALLOON.en;
      }
      default:
        tbl = NAMES[lang][kind];
        if (tbl && tbl[value] != null) return tbl[value];
        return String(value);
    }
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
    var v = parseInt(n, 10), out = [];
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
      case 'letter': {
        var U = upper(value);
        var base = [U.toLowerCase(), 'letter ' + U.toLowerCase(), 'chữ ' + U.toLowerCase()];
        if (lang === 'vi') {
          base.push(LETTER_VI[U] || U.toLowerCase());
          if (LETTER_VI[U]) base.push('chữ ' + LETTER_VI[U]);
          base = base.concat(LETTER_WORDS_VI[U] || []);
          // no stripped forms: Ă/Â≠A, Đ≠D, Ê≠E, Ô/Ơ≠O, Ư≠U (the matcher still tries a diacritic-free comparison,
          // but at a lower score than an exact match)
          base.forEach(function (w) { w = w.toLowerCase(); if (out.indexOf(w) < 0) out.push(w); });
          return out;
        }
        base = base.concat(LETTER_WORDS_EN[U] || []);
        if (LETTER_SPEECH_EN[U]) base.push(LETTER_SPEECH_EN[U]);
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
        var spr = /^animal_/.test(String(value)) ? String(value) : spriteOfWord(lang, w);
        if (spr) {
          var a = animalOf(spr);
          if (a) list = list.concat([NAMES[lang].animal[a]], WORDS[lang].animal[a] || []);
        }
        return addForms(out, list);
      }
      case 'animal': {
        var an = animalOf(value);
        if (!an) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].animal[an]].concat(WORDS[lang].animal[an] || []));
      }
      case 'sound': {
        var sa = animalOf(value);
        if (!sa) return addForms(out, [String(value)]);
        var sl = [];
        if (SOUND[lang][sa]) sl.push(SOUND[lang][sa]);
        sl = sl.concat(WORDS[lang].sound[sa] || []);
        if (!sl.length) sl.push(NAMES[lang].animal[sa]);
        return addForms(out, sl);
      }
      case 'balloon': {
        var bl = [name(lang, 'balloon', value)].concat(WORDS[lang].balloon.balloon);
        if (NAMES[lang].color[value]) bl = bl.concat(words(lang, 'color', value));
        return addForms(out, bl);
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

  // Fill in the derived params ({sound}, {letter}, {word}, {expr}, {balloons}, {N}) from whatever the caller passed.
  function derive(lang, params) {
    var p = {}, k;
    if (params) for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    // {sound}: an animal id → its sound word; a plain word stays; else from {animal}
    var snd = present(p.sound) ? rawVal(p.sound) : null;
    if (snd != null && animalOf(snd)) p.sound = soundOf(lang, snd);
    else if (snd == null && present(p.animal)) p.sound = soundOf(lang, p.animal);
    if (!present(p.sound)) delete p.sound;
    // {letter}
    if (!present(p.letter) && present(p.text) && /^\p{L}$/u.test(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) { p.letter = String(rawVal(p.letter)); p.lower = p.letter.toLowerCase(); }
    // {word} (initial topic): word | animal | sprite | text
    if (!present(p.word)) {
      var src = present(p.sprite) ? rawVal(p.sprite) : present(p.animal) ? rawVal(p.animal) :
        (present(p.text) && !/^\p{L}$/u.test(String(rawVal(p.text))) && !splitOp(rawVal(p.text))) ? rawVal(p.text) : null;
      if (src != null) {
        var a = animalOf(src);
        p.word = a ? (wordOfSprite(lang, 'animal_' + a) || NAMES[lang].animal[a]) : String(src);
      }
    } else p.word = name(lang, 'word', rawVal(p.word));
    // {expr} ("2 + 3")
    if (!present(p.expr)) {
      var ex = present(p.text) && splitOp(rawVal(p.text)) ? rawVal(p.text) : present(p.sum) ? rawVal(p.sum) :
        present(p.diff) ? rawVal(p.diff) : null;
      if (ex == null && present(p.a) && present(p.b)) ex = rawVal(p.a) + (present(p.op) ? rawVal(p.op) : '+') + rawVal(p.b);
      if (ex != null) p.expr = exprText(ex);
    } else p.expr = exprText(rawVal(p.expr));
    // {parity} may come as value
    if (!present(p.parity) && (rawVal(p.value) === 'odd' || rawVal(p.value) === 'even')) p.parity = rawVal(p.value);
    // {balloons}: from k, else n
    var c = present(p.k) ? num(p.k) : present(p.n) ? num(p.n) : null;
    p._count = c;
    p.balloons = lang === 'vi' ? BALLOON.vi : (c === 1 ? 'balloon' : 'balloons');
    if (present(p.n) && num(p.n) != null) p.N = capFirst(numberName(lang, num(p.n)));
    return p;
  }

  function resolveParam(lang, key, val) {
    if (!present(val)) return '';
    if (typeof val === 'object' && val.kind) return name(lang, val.kind, val.value);
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity':
        return name(lang, key, val);
      case 'name': case 'target':             // bare animal ids are the common case (ask mode)
        return animalOf(val) ? name(lang, 'animal', val) : String(val);
      default: return String(val);
    }
  }

  function fill(lang, str, params, child) {
    if (!child) str = str.replace(/(bé|Bé) \{child\}/g, '$1');
    var out = str.replace(/\{(\w+)\}/g, function (m, k) {
      if (k === 'child') return child || CHILD_FALLBACK[lang];
      return resolveParam(lang, k, params ? params[k] : null);
    });
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();
    if (lang === 'en') out = out.replace(/\b([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, '$1n ');   // a orange → an orange
    out = out.replace(/([.!?]\s+)(\p{Ll})/gu, function (m, pre, ch) { return pre + ch.toUpperCase(); });
    return capFirst(out);
  }

  function needsMet(key, params) {
    var need = NEEDS[key];
    if (!need) return true;
    for (var i = 0; i < need.length; i++) if (!present(params ? params[need[i]] : null)) return false;
    return true;
  }

  I18N.t = function (lang, key, params, rng) {
    lang = L(lang);
    var p = derive(lang, params);
    if (PLURAL[key] && p._count === 1 && STR[lang][key + '.one'] != null) key = key + '.one';
    for (var hop = 0; hop < 3 && !needsMet(key, p) && FALLBACK[key]; hop++) key = FALLBACK[key];
    var v = STR[lang][key];
    if (v == null) v = STR.en[key];
    if (v == null) return key;
    var child = p.child != null ? String(p.child).trim() : String(I18N.child || '').trim();
    if (Array.isArray(v)) {
      var withChild = v.filter(function (s) { return s.indexOf('{child}') >= 0; });
      var noChild = v.filter(function (s) { return s.indexOf('{child}') < 0; });
      var pool = v;
      if (!child) { if (noChild.length) pool = noChild; }
      else if (CHILD_PREFERRED[key] && withChild.length) pool = withChild;
      v = pool[Math.min(pool.length - 1, Math.floor(rnd(rng) * pool.length))];
    }
    return fill(lang, v, p, child);
  };

  I18N.name = name;
  I18N.words = words;
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.sound = soundOf;
  I18N.hasSound = function (lang, animal) { return !!soundOf(lang, animal); };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PARAMS = NEEDS;           // { 'p.animals': ['animal'], 'p.count': ['n'], … } — required params per key
  I18N.NAME_TABLE = NAMES;       // read-only use (tests / UI)
  I18N.SOUNDS = SOUND;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;

  // Counting on each pop (count rounds): n < need → "Two!"; n ≥ need → "Three! Three balloons!" / "Ba! Ba quả bóng!"
  I18N.sayCount = function (lang, n, need, rng) {
    lang = L(lang);
    var c = num(n);
    if (c == null) return I18N.t(lang, 'praise', null, rng);
    var nd = num(need);
    if (nd == null || c < nd) return capFirst(numberName(lang, c)) + '!';
    return I18N.t(lang, 'say.countDone', { n: c }, rng);
  };
  I18N.sayPop = function (lang, rng) { return I18N.t(lang, 'say.pop', null, rng); };
  I18N.sayBloom = I18N.sayPop;

  function animalOfEvent(ev) {
    if (ev.nameKind === 'animal') return animalOf(ev.nameValue);
    if (ev.nameKind === 'sound') return animalOf(ev.nameValue);
    if (!ev.nameKind || ev.nameKind === 'balloon' || ev.nameKind === 'color') return animalOf(ev.sprite);
    return null;
  }

  // Miu's line for a `correct` event { nameKind, nameValue, sprite?, mode?, n?, need?, word?, expr?, parity? }
  //   color → "Red!" · shape → "A heart!" · animal → "The pig! Oink oink!" · count mode → sayCount(n, need)
  I18N.sayCorrect = function (lang, ev, rng) {
    lang = L(lang);
    ev = ev || {};
    if (ev.mode === 'count' || ev.count === true) return I18N.sayCount(lang, ev.n, ev.need, rng);
    var kind = ev.nameKind, val = ev.nameValue, key, params = {};
    var an = animalOfEvent(ev);
    if (an && (kind === 'animal' || kind === 'balloon' || !kind || ev.sprite)) {
      if (kind === 'sound') {
        params = { call: CALL[lang][an] || '' };
        return params.call ? I18N.t(lang, 'say.correct.sound', params, rng) : I18N.t(lang, 'praise', null, rng);
      }
      params = { answer: { kind: 'animal', value: an }, call: CALL[lang][an] || '' };
      return I18N.t(lang, params.call ? 'say.correct.animal' : 'say.correct.animalQuiet', params, rng);
    }
    switch (kind) {
      case 'color': case 'shape': case 'size':
        key = 'say.correct.' + kind; params = { answer: { kind: kind, value: val } }; break;
      case 'balloon':
        return I18N.sayPop(lang, rng);
      case 'number':
        if (present(ev.expr) || present(ev.sum) || present(ev.diff)) {
          var ex = splitOp(rawVal(ev.expr || ev.sum || ev.diff));
          key = 'say.correct.sum';
          params = { name: ex ? { kind: 'sum', value: ex.join('') } : '', answer: { kind: 'number', value: val } };
        } else if (ev.parity === 'odd' || ev.parity === 'even') {
          key = 'say.correct.parity';
          params = { name: { kind: 'number', value: val }, answer: { kind: 'parity', value: ev.parity } };
        } else {
          key = 'say.correct.number';
          params = { answer: lang === 'vi' ? { kind: 'number', value: val } : capFirst(numberName(lang, val)) };
        }
        break;
      case 'letter':
        if (present(ev.word) || (ev.signSprite && animalOf(ev.signSprite))) {
          key = 'say.correct.word';
          params = { word: present(ev.word) ? ev.word : animalOf(ev.signSprite), letter: String(val) };
        } else { key = 'say.correct.letter'; params = { letter: String(val) }; }
        break;
      case 'parity':
        key = 'say.correct.parity'; params = { name: present(ev.number) ? { kind: 'number', value: ev.number } : '',
          answer: { kind: 'parity', value: val } };
        if (!present(ev.number)) return I18N.t(lang, 'praise', null, rng);
        break;
      case 'sum': case 'diff':
        key = 'say.correct.sum';
        var pr = splitOp(val);
        params = { name: { kind: kind, value: val },
          answer: pr ? { kind: 'number', value: kind === 'sum' ? +pr[0] + +pr[2] : +pr[0] - +pr[2] } : '' };
        if (!pr) return I18N.t(lang, 'praise', null, rng);
        break;
      default:
        return I18N.t(lang, 'praise', null, rng);
    }
    return I18N.t(lang, key, params, rng);
  };

  // Gentle line for a `wrong` event: ev.nameKind/nameValue = the tapped balloon; ev.targetNameKind/targetNameValue =
  // what we want. "That one is blue. Where is red?" / "Quả này màu xanh dương. Quả bóng màu đỏ đâu nhỉ?"
  // Never negative; numbers never reveal the answer ("That one is four. Let's try again!").
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = ev || {};
    var k = ev.nameKind, v = ev.nameValue, tk = ev.targetNameKind, tv = ev.targetNameValue;
    var an = animalOf(k === 'animal' ? v : ev.sprite), tan = animalOf(tk === 'animal' ? tv : ev.targetSprite);
    if (an || tan) {
      if (an && tan && an !== tan) return I18N.t(lang, 'say.wrong.animal', { name: an, target: tan }, rng);
      if (an) return I18N.t(lang, 'say.wrong.some', { name: { kind: 'animal', value: an } }, rng);
      return I18N.t(lang, 'wrong', null, rng);
    }
    if (!k || !present(v)) return I18N.t(lang, 'wrong', null, rng);
    var same = tk === k && present(tv) && String(tv) !== String(v);
    switch (k) {
      case 'color': case 'shape': case 'size':
        if (same) return I18N.t(lang, 'say.wrong.' + k, { name: { kind: k, value: v }, target: { kind: k, value: tv } }, rng);
        return I18N.t(lang, 'say.wrong.some', { name: { kind: k, value: v } }, rng);
      case 'letter':
        if (same) return I18N.t(lang, 'say.wrong.letter', { letter: String(v), tletter: String(tv) }, rng);
        return I18N.t(lang, 'wrong', null, rng);
      case 'number':
        return I18N.t(lang, 'say.wrong.number', { name: { kind: 'number', value: v } }, rng);
      default:
        return I18N.t(lang, 'wrong', null, rng);
    }
  };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { value = kind.value; kind = kind.kind; }
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal' || kind === 'sound') {
      var a = animalOf(value);
      if (!a) return I18N.t(lang, 'talk.wrong', { answer: String(value) });
      ans = { answer: { kind: 'animal', value: a }, sound: soundOf(lang, a) };
      return I18N.t(lang, ans.sound ? 'talk.wrong.animalSound' : 'talk.wrong.animal', ans);
    }
    if (kind === 'shape') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter') return I18N.t(lang, 'talk.wrong.letter', { letter: String(value) });
    if (kind === 'parity') return I18N.t(lang, 'talk.wrong.parity', ans);
    if (kind === 'number') return I18N.t(lang, 'talk.wrong.number', ans);
    return I18N.t(lang, 'talk.wrong', ans);
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/[…]/g, '.').replace(/[›»«]/g, ',');
    if (lang === 'en') {
      s = s.replace(/\b(letter|Letter) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
      s = s.replace(/\bTa-da\b/g, 'Ta da');
      // "baa" / "maa" are read letter by letter by some voices
      s = s.replace(/\b(B|b)aa\b/g, '$1ah').replace(/\b(M|m)aa\b/g, '$1ah');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
      s = s.replace(/\bTa-đa\b/g, 'Ta đa');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  KB.I18N = I18N;
})(window.KB = window.KB || {});
