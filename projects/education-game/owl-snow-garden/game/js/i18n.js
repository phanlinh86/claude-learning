/* Owlet's Snow Garden — SG.I18N (English + Vietnamese). Lumi the snowy owlet talks to the child.
 *
 *   SG.I18N.t(lang, key, params, rng?)   → string (variants picked with rng.next()/rng()/Math.random)
 *   SG.I18N.name(lang, kind, value)      → display + spoken name ("red"/"màu đỏ", 7 → "seven"/"bảy",
 *                                          bear → "polar bear"/"gấu Bắc Cực", seed red → "red seed"/"hạt giống màu đỏ")
 *   SG.I18N.words(lang, kind, value)     → accepted spoken forms for speech recognition (lower-case, + no-diacritic forms)
 *   SG.I18N.speech(lang, text)           → text tuned for TTS (letter names, + − =)
 *   SG.I18N.sayCorrect(lang, ev, rng)    → Lumi's line for a `correct` world event
 *   SG.I18N.sayWrong(lang, ev, rng)      → gentle line for a `wrong` event (ask mode names both animals)
 *   SG.I18N.sayCount(lang, count, need)  → counting on bloom: "Two!" … at need "Three! You planted 3 flowers!"
 *   SG.I18N.sayBloom(lang, rng)          → "Pop! A flower!" (non-count rounds)
 *   SG.I18N.talkWrong(lang, kind, value) → gentle "it's X" line for a missed Talk-time answer
 *   SG.I18N.setChild(name)               → default {child} for every t() call
 *   SG.I18N.langs = ['en', 'vi'];  SG.I18N.has(lang, key);  SG.I18N.keys(lang);  SG.I18N.PARAMS (required params)
 *
 * Params: values may be RAW ({animal:'seal'}, {color:'red'}, {n:3}) — keys named like a name kind (color, shape, size,
 * animal, parity) are named automatically; an object {kind, value} is always replaced by name(lang, kind, value).
 * {flowers} is "flower"/"flowers" from {n} (vi "bông hoa"). {sum}/{diff} show as "2 + 3". English "a" → "an" before a vowel.
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * {child}: if the child's name is empty, variants containing {child} are skipped; if every variant has it,
 * {child} becomes "friend" / "bé". Missing params are removed (never a stray "{x}" on screen).
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài", Ă → "á", Â → "ớ" … (see LETTER_VI and docs/VOICE.md).
 */
(function (SG) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['bear', 'seal', 'fox', 'hare', 'reindeer', 'walrus', 'penguin', 'puffin', 'whale'];

  // ---------------------------------------------------------------- names
  // Vietnamese animal names carry NO classifier: templates add "bạn" (friend) — "bạn hải cẩu", "bạn gấu Bắc Cực".
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rectangle: 'rectangle' },
      size: { big: 'big', small: 'small' },
      animal: { bear: 'polar bear', seal: 'seal', fox: 'arctic fox', hare: 'snow hare', reindeer: 'reindeer',
        walrus: 'walrus', penguin: 'penguin', puffin: 'puffin', whale: 'whale' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
        rectangle: 'hình chữ nhật' },
      size: { big: 'to', small: 'nhỏ' },
      animal: { bear: 'gấu Bắc Cực', seal: 'hải cẩu', fox: 'cáo Bắc Cực', hare: 'thỏ tuyết', reindeer: 'tuần lộc',
        walrus: 'hải mã', penguin: 'chim cánh cụt', puffin: 'chim cổ rụt', whale: 'cá voi' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  var SEED = { en: 'seed', vi: 'hạt giống' };

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
        cream: ['white', 'cream'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles'], square: ['square', 'box', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rectangle: ['rectangle', 'rectangles'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: {
        bear: ['polar bear', 'bear', 'polar', 'white bear', 'teddy', 'teddy bear', 'bears', 'polar bears'],
        seal: ['seal', 'seals', 'baby seal', 'seal pup', 'sea lion', 'ceil'],
        fox: ['arctic fox', 'fox', 'foxy', 'white fox', 'foxes', 'artic fox'],
        hare: ['snow hare', 'hare', 'bunny', 'rabbit', 'snow bunny', 'arctic hare', 'snow rabbit', 'hair'],
        reindeer: ['reindeer', 'rain deer', 'reindeers', 'deer', 'caribou', 'rudolph'],
        walrus: ['walrus', 'walruses', 'wall russ', 'wallrus'],
        penguin: ['penguin', 'penguins', 'pengwin'],
        puffin: ['puffin', 'puffins', 'puffin bird', 'puff in', 'puffing'],
        whale: ['whale', 'whales', 'beluga', 'white whale', 'baby whale', 'wail'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] },
      seed: { seed: ['seed', 'seeds'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], cream: ['trắng', 'màu trắng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao'], heart: ['trái tim', 'tim', 'hình trái tim'],
        rectangle: ['chữ nhật', 'hình chữ nhật'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: {
        bear: ['gấu bắc cực', 'gấu', 'con gấu', 'gấu trắng', 'bạn gấu', 'gấu con', 'gấu bắc cực con'],
        seal: ['hải cẩu', 'con hải cẩu', 'hải cẩu con', 'bạn hải cẩu', 'hải cẩu'],
        fox: ['cáo bắc cực', 'cáo', 'con cáo', 'cáo trắng', 'bạn cáo', 'cáo tuyết'],
        hare: ['thỏ tuyết', 'thỏ', 'con thỏ', 'thỏ trắng', 'bạn thỏ', 'thỏ con'],
        reindeer: ['tuần lộc', 'con tuần lộc', 'bạn tuần lộc', 'tuần lột', 'hươu', 'con nai', 'nai'],
        walrus: ['hải mã', 'con hải mã', 'bạn hải mã', 'hải mả', 'hãi mã'],
        penguin: ['chim cánh cụt', 'cánh cụt', 'con chim cánh cụt', 'bạn cánh cụt', 'cánh cục', 'chim cánh cục'],
        puffin: ['chim cổ rụt', 'cổ rụt', 'hải âu cổ rụt', 'chim hải âu cổ rụt', 'hải âu', 'chim hải âu', 'puffin',
          'chim puffin'],
        whale: ['cá voi', 'con cá voi', 'cá voi trắng', 'cá voi con', 'bạn cá voi'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] },
      seed: { seed: ['hạt giống', 'hạt', 'hột'] }
    }
  };

  // Default SG.WORDS (DESIGN §5.1) — word lists for the 'initial' topic. content.js loads later and may replace it.
  var WORD_LIST = {
    en: [['bear', 'animal_bear', 'B'], ['fox', 'animal_fox', 'F'], ['hare', 'animal_hare', 'H'],
      ['penguin', 'animal_penguin', 'P'], ['puffin', 'animal_puffin', 'P'], ['reindeer', 'animal_reindeer', 'R'],
      ['seal', 'animal_seal', 'S'], ['walrus', 'animal_walrus', 'W'], ['whale', 'animal_whale', 'W']],
    vi: [['gấu', 'animal_bear', 'G'], ['cáo', 'animal_fox', 'C'], ['cá voi', 'animal_whale', 'C'],
      ['tuần lộc', 'animal_reindeer', 'T'],
      ['hải cẩu', 'animal_seal', 'H'], ['hải mã', 'animal_walrus', 'H']]
  };
  if (!SG.WORDS) {
    SG.WORDS = {};
    LANGS.forEach(function (l) {
      SG.WORDS[l] = WORD_LIST[l].map(function (w) { return { word: w[0], sprite: w[1], initial: w[2] }; });
    });
  }
  function spriteOfWord(lang, w) {        // looks in content's SG.WORDS first, then the default list
    var cur = SG.WORDS && SG.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].word === w) return cur[i].sprite || null;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][0] === w) return WORD_LIST[lang][i][1];
    return null;
  }
  function wordOfSprite(lang, spr) {
    var cur = SG.WORDS && SG.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].sprite === spr) return cur[i].word;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][1] === spr) return WORD_LIST[lang][i][0];
    return null;
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var LABEL_TYPES = ['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity'];
  var NAME_KINDS = ['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity', 'sum', 'diff', 'word', 'seed'];

  var STR = {
    en: {
      'ui.title': 'Owlet’s Snow Garden',
      'ui.subtitle': 'Plant, count and learn with Lumi!',
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
      'ui.voice': 'Lumi’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Lumi. Let’s grow flowers!', 'Hi! I am Lumi. Let’s grow flowers!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the buttons!',
      'ui.micDenied': 'The microphone is off. Tap the buttons instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Lumi is listening…',
      'ui.tapLumi': 'Tap Lumi to hear it again',
      'ui.skip': 'Skip',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Garden',
      'topic.size': 'Big and Small',
      'topic.shapes': 'Shape Flowers',
      'topic.count': 'Counting Flowers',
      'topic.animals': 'Arctic Friends',
      'topic.letters': 'Letter Seeds',
      'topic.lower': 'Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Flowers',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Good morning, garden!',
      'weather.1': 'It’s noon! The sun is up high!',
      'weather.2': 'Sunset time! The sky is orange!',
      'weather.3': 'Good night, stars! Look at the lights!',

      'p.colors': 'Plant each seed in the pot of the same colour!',
      'p.colorsOne': 'Plant the {color} seed in the {color} pot!',
      'p.shapes': 'Plant each shape in the pot with the same shape!',
      'p.shapesOne': 'Plant the {shape} in the {shape} pot!',
      'p.size': 'Big seeds in the big pot, small seeds in the small pot!',
      'p.count': 'Plant {n} {flowers}!',
      'p.countAny': 'Plant the flowers and count with me!',
      'p.animals': 'Plant a flower for the {animal}!',
      'p.animalsNext': ['Now the {animal}!', 'Next, a flower for the {animal}!', 'And now the {animal}!'],
      'p.animalsAll': 'Plant a flower for each animal friend!',
      'p.letters': 'Plant each seed in the pot with the same letter!',
      'p.lower': 'Find the big letter pot for each small letter!',
      'p.initial': 'Plant each one in the pot of its first letter!',
      'p.add': 'Add them up! Plant it in the answer pot.',
      'p.sub': 'Take away! Plant it in the answer pot.',
      'p.oddeven': 'Odd numbers in one pot, even numbers in the other!',

      'say.correct.color': ['Yes! {answer}!', '{answer}! Just right!', 'A {answer} flower!'],
      'say.correct.shape': ['Yes! The {answer}!', 'A {answer} flower!', '{answer}! Well done!'],
      'say.correct.size': ['Yes! The {answer} pot!', '{answer} seed, {answer} pot!'],
      'say.correct.animal': ['A flower for the {answer}!', 'The {answer} says thank you!', 'Yes! The {answer}!'],
      'say.correct.number': ['Yes! {name} makes {answer}!', '{name} is {answer}!'],
      'say.correct.letter': ['Yes! The letter {answer}!', 'That is the letter {answer}!'],
      'say.correct.word': ['{name} starts with the letter {answer}!'],
      'say.correct.parity': ['Yes! {name} is {answer}!', '{name} is an {answer} number!'],
      'say.correct.seed': ['Yes!', 'In it goes!'],
      'say.countDone': ['You planted {n} {flowers}!', 'Yes! {n} {flowers}!', '{n} {flowers}! Hooray!'],
      'say.wrong.animal': ['That’s the {name}’s pot. Where is the {target}?', 'That pot is for the {name}. Let’s find the {target}!'],
      'say.bloom': ['Pop! A flower!', 'Bloom!', 'Look, a flower!', 'Ta-da! It bloomed!', 'So pretty!', 'Pop!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'The garden is so pretty!', 'Wow, {child}, you are a star!',
        'Super planting!', 'Hooray! All the flowers bloomed!', 'You are so clever!'],
      'wrong': ['Hmm, let’s try another pot!', 'Almost! Try again!', 'Ooh, let’s look again!', 'Try a different pot!',
        'So close! One more try!', 'Let’s think again!', 'Keep trying, you can do it!'],
      'miss': ['Oops! Plant it in a pot!', 'Into a pot, please!', 'Whee! Let’s put it in a pot!',
        'Bring it to a pot!', 'The pots are down here!'],
      'hint': ['Look! This pot is glowing.', 'Psst! Try the shiny pot!', 'Here is a clue: the glowing pot!',
        'Lumi will help! Look here!', 'Try the sparkly one!'],
      'idle': ['Pick up a seed and plant it!', 'Want to play? Drag a seed to a pot!', 'Lumi is waiting! Your turn!',
        'Touch a seed and slide it!', 'Let’s plant! Pick up a seed!', 'I am here, {child}! Let’s plant!'],

      'talk.intro': 'Talk time! Lumi has a question.',
      'talk.colors': 'What colour is this flower?',
      'talk.size': 'Is it big or small?',
      'talk.shapes': 'What shape is this?',
      'talk.count': 'How many flowers?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Tap an animal friend!',
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
      'talk.wrong.animal': 'Here is the {answer}! Good try!',
      'talk.wrong.letter': 'It is the letter {answer}! Good try!',
      'talk.wrong.parity': 'It is {answer}! Good try!',

      'session.done': ['You did it all! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'Good night, garden! {stars} stars!']
    },
    vi: {
      'ui.title': 'Vườn Hoa Cú Tuyết',
      'ui.subtitle': 'Cùng Lumi trồng hoa, đếm và học nhé!',
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
      'ui.voice': 'Giọng của Lumi',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Lumi đây. Mình cùng trồng hoa nhé!', 'Chào bé! Lumi đây. Mình cùng trồng hoa nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm nút nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm nút nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Lumi đang nghe…',
      'ui.tapLumi': 'Chạm vào Lumi để nghe lại nhé',
      'ui.skip': 'Bỏ qua',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Vườn màu sắc',
      'topic.size': 'To và nhỏ',
      'topic.shapes': 'Hoa hình khối',
      'topic.count': 'Đếm bông hoa',
      'topic.animals': 'Bạn thú Bắc Cực',
      'topic.letters': 'Chữ cái',
      'topic.lower': 'Chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Chào buổi sáng, vườn hoa ơi!',
      'weather.1': 'Buổi trưa rồi! Ông mặt trời lên cao!',
      'weather.2': 'Hoàng hôn rồi! Bầu trời màu cam!',
      'weather.3': 'Chúc ngủ ngon, các vì sao! Nhìn ánh sáng kìa!',

      'p.colors': 'Bé ơi, trồng mỗi hạt giống vào chậu cùng màu nhé!',
      'p.colorsOne': 'Bé ơi, trồng hạt giống {color} vào chậu {color} nhé!',
      'p.shapes': 'Bé ơi, trồng mỗi hình vào chậu có hình giống nhé!',
      'p.shapesOne': 'Bé ơi, trồng {shape} vào chậu {shape} nhé!',
      'p.size': 'Hạt to vào chậu to, hạt nhỏ vào chậu nhỏ nhé!',
      'p.count': 'Bé ơi, trồng {n} {flowers} nhé!',
      'p.countAny': 'Bé trồng hoa rồi đếm cùng Lumi nào!',
      'p.animals': 'Bé ơi, trồng một bông hoa cho bạn {animal} nhé!',
      'p.animalsNext': ['Giờ đến bạn {animal} nhé!', 'Tiếp theo là bạn {animal} nào!', 'Còn bạn {animal} thì sao nhỉ?'],
      'p.animalsAll': 'Bé ơi, trồng hoa tặng các bạn thú nhé!',
      'p.letters': 'Bé ơi, trồng hạt vào chậu có chữ giống nhé!',
      'p.lower': 'Bé tìm chậu chữ in hoa cho mỗi chữ thường nhé!',
      'p.initial': 'Hình bắt đầu bằng chữ gì? Trồng vào chậu đó nhé!',
      'p.add': 'Bé tính phép cộng rồi trồng vào chậu đáp số nhé!',
      'p.sub': 'Bé tính phép trừ rồi trồng vào chậu đáp số nhé!',
      'p.oddeven': 'Số lẻ vào chậu lẻ, số chẵn vào chậu chẵn nhé!',

      'say.correct.color': ['Đúng rồi! {answer} đó!', 'Bông hoa {answer}!', 'Đúng rồi, {answer}!'],
      'say.correct.shape': ['Đúng rồi! {answer} đó!', '{answer}! Bé giỏi quá!'],
      'say.correct.size': ['Đúng rồi! Chậu {answer}!', 'Hạt {answer} vào chậu {answer}!'],
      'say.correct.animal': ['Bông hoa tặng bạn {answer}!', 'Bạn {answer} cảm ơn bé!', 'Đúng rồi! Bạn {answer} đó!'],
      'say.correct.number': ['Đúng rồi! {name} bằng {answer}!', '{name} bằng {answer}!'],
      'say.correct.letter': ['Đúng rồi! Chữ {answer}!', 'Đây là chữ {answer} đó!'],
      'say.correct.word': ['{name} bắt đầu bằng chữ {answer}!'],
      'say.correct.parity': ['Đúng rồi! {name} là số {answer}!', '{name} là số {answer} đó!'],
      'say.correct.seed': ['Đúng rồi!', 'Vào chậu rồi!'],
      'say.countDone': ['Bé trồng được {n} {flowers} rồi!', 'Đúng rồi! {n} {flowers}!', '{n} {flowers}! Hoan hô!'],
      'say.wrong.animal': ['Chậu của bạn {name} đó. Bạn {target} đâu nhỉ?', 'Đây là chậu bạn {name}. Tìm bạn {target} nào!'],
      'say.bloom': ['Bụp! Một bông hoa!', 'Hoa nở rồi!', 'Nhìn kìa, bông hoa!', 'Ta-đa! Hoa nở rồi!', 'Xinh quá!', 'Bụp!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Vườn hoa đẹp quá!', 'Oa, bé {child} là ngôi sao đó!',
        'Bé trồng hoa giỏi quá!', 'Hoan hô, hoa nở hết rồi!', 'Bé thông minh quá!'],
      'wrong': ['Ồ, bé thử chậu khác nhé!', 'Gần đúng rồi! Thử lại nào!', 'Mình nhìn lại nhé!', 'Bé thử lại lần nữa nào!',
        'Suýt nữa thôi! Thử tiếp nhé!', 'Không sao đâu, thử lại nhé!', 'Bé nghĩ thêm chút nữa nhé!'],
      'miss': ['Ối! Bé thả vào chậu nhé!', 'Đặt vào chậu nào bé ơi!', 'Chậu hoa ở dưới này nè!', 'Bé kéo hạt vào chậu nhé!',
        'Thả vào một chậu hoa nào!'],
      'hint': ['Nhìn nè! Chậu này đang sáng.', 'Bé thử chậu lấp lánh nhé!', 'Lumi gợi ý nè: chậu đang sáng!',
        'Lumi giúp bé nhé, nhìn đây!', 'Chậu sáng lấp lánh đó bé!'],
      'idle': ['Bé ơi, trồng hoa tiếp nào!', 'Bé chạm vào hạt giống rồi kéo nhé!', 'Lumi đang chờ bé nè!',
        'Đến lượt bé rồi đó!', 'Bé {child} ơi, mình trồng hoa tiếp nhé!', 'Kéo một hạt vào chậu nào!'],

      'talk.intro': 'Giờ trò chuyện! Lumi hỏi bé nhé.',
      'talk.colors': 'Bông hoa này màu gì nhỉ?',
      'talk.size': 'Cái này to hay nhỏ nhỉ?',
      'talk.shapes': 'Đây là hình gì nào?',
      'talk.count': 'Có bao nhiêu bông hoa nào?',
      'talk.animals': 'Bạn {animal} ở đâu nhỉ?',
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
      'talk.wrong.size': 'Cái này {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.animal': 'Bạn {answer} ở đây nè! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.parity': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Bé làm xong hết rồi! {stars} ngôi sao! Hoan hô!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Chúc vườn hoa ngủ ngon! {stars} ngôi sao!']
    }
  };

  // required params → fallback key when one is missing
  var NEEDS = {
    'p.colorsOne': ['color'], 'p.shapesOne': ['shape'], 'p.count': ['n'], 'p.animals': ['animal'],
    'p.animalsNext': ['animal'], 'talk.animals': ['animal'], 'say.countDone': ['n'],
    'say.wrong.animal': ['name', 'target']
  };
  var FALLBACK = {
    'p.colorsOne': 'p.colors', 'p.shapesOne': 'p.shapes', 'p.count': 'p.countAny', 'p.animals': 'p.animalsAll',
    'p.animalsNext': 'p.animalsAll', 'talk.animals': 'talk.animalsAny', 'say.countDone': 'praise', 'say.wrong.animal': 'wrong'
  };

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

  function numberName(lang, n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) return String(n);
    if (v >= 0 && v <= 20) return NUM[lang === 'vi' ? 'vi' : 'en'][v];
    return String(v);
  }
  function splitOp(value) { // '2+3' → ['2','+','3'];  '7−2' / '7-2' → ['7','−','2']
    var m = String(value).replace(/\s+/g, '').match(/^(\d+)([+−\-])(\d+)$/);
    return m ? [m[1], m[2] === '+' ? '+' : '−', m[3]] : null;
  }
  function exprText(value) { var p = splitOp(value); return p ? p[0] + ' ' + p[1] + ' ' + p[2] : String(value); }

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
        if (/^animal_/.test(w)) return wordOfSprite(lang, w) || w;   // a sprite id was passed
        return w;
      }
      case 'seed': {                          // "seed" / "red seed" / "hạt giống màu đỏ"
        var col = NAMES[lang].color[value];
        if (!col || value === 'cream') return SEED[lang];
        return lang === 'vi' ? SEED.vi + ' ' + col : col + ' ' + SEED.en;
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
        var spr = spriteOfWord(lang, w);
        if (spr) {
          var parts = spr.split('_'), k = parts[0], id = parts.slice(1).join('_');
          if (NAMES[lang][k] && NAMES[lang][k][id]) list.push(NAMES[lang][k][id]);
          if (WORDS[lang][k] && WORDS[lang][k][id]) list = list.concat(WORDS[lang][k][id]);
        }
        return addForms(out, list);
      }
      case 'seed': {
        var l3 = [name(lang, 'seed', value)].concat(WORDS[lang].seed.seed);
        if (NAMES[lang].color[value]) l3 = l3.concat(words(lang, 'color', value));
        return addForms(out, l3);
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

  function resolveParam(lang, key, val, params) {
    if (key === 'flowers') {                  // derived from {n}
      if (lang === 'vi') return 'bông hoa';
      var n = params && present(params.n) ? Number(rawVal(params.n)) : 2;
      return n === 1 ? 'flower' : 'flowers';
    }
    if (!present(val)) return '';
    if (typeof val === 'object' && val.kind) return name(lang, val.kind, val.value);
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity':
        return name(lang, key, val);
      case 'name': case 'target':             // bare animal ids are the common case (ask mode)
        return NAMES[lang].animal[val] ? name(lang, 'animal', val) : String(val);
      case 'sum': case 'diff': return exprText(val);
      default: return String(val);
    }
  }

  function fill(lang, str, params, child) {
    if (!child) str = str.replace(/(bé|Bé) \{child\}/g, '$1');
    var out = str.replace(/\{(\w+)\}/g, function (m, k) {
      if (k === 'child') return child || CHILD_FALLBACK[lang];
      return resolveParam(lang, k, params ? params[k] : null, params);
    });
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();
    if (lang === 'en') out = out.replace(/\b([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, '$1n ');   // a orange → an orange
    out = out.replace(/([.!?]\s+)(\p{Ll})/gu, function (m, pre, ch) { return pre + ch.toUpperCase(); });
    return capFirst(out);
  }

  function needsMet(lang, key, params) {
    var need = NEEDS[key];
    if (!need) return true;
    for (var i = 0; i < need.length; i++) if (!present(params ? params[need[i]] : null)) return false;
    return true;
  }

  I18N.t = function (lang, key, params, rng) {
    lang = L(lang);
    for (var hop = 0; hop < 3 && !needsMet(lang, key, params) && FALLBACK[key]; hop++) key = FALLBACK[key];
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
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.LABEL_TYPES = LABEL_TYPES.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PARAMS = NEEDS;           // { 'p.animals': ['animal'], 'p.count': ['n'], … } — required params per key
  I18N.NAME_TABLE = NAMES;       // read-only use (tests / UI)
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;

  // Counting on bloom (count rounds): count < need → "Two!"; count ≥ need → "Three! You planted 3 flowers!"
  I18N.sayCount = function (lang, count, need, rng) {
    lang = L(lang);
    var c = parseInt(rawVal(count), 10);
    if (isNaN(c)) return I18N.t(lang, 'praise', null, rng);
    var word = capFirst(numberName(lang, c)) + '!';
    var nd = parseInt(rawVal(need), 10);
    if (isNaN(nd) || c < nd) return word;
    return word + ' ' + I18N.t(lang, 'say.countDone', { n: c }, rng);
  };
  I18N.sayBloom = function (lang, rng) { return I18N.t(lang, 'say.bloom', null, rng); };

  // Lumi's line for a `correct` event {nameKind, nameValue, label:{type, value}, count?, need?}
  I18N.sayCorrect = function (lang, ev, rng) {
    lang = L(lang);
    ev = ev || {};
    var lab = ev.label || ev.target || {};
    var type = lab.type || lab.kind;
    var item = { kind: ev.nameKind, value: ev.nameValue };
    var key = 'say.correct.' + type;
    var params = { name: item.kind ? item : '', answer: type ? { kind: type, value: lab.value } : '' };
    if (type === 'letter' && ev.nameKind === 'word') {
      key = 'say.correct.word';
    } else if (type === 'number' && ev.nameKind !== 'sum' && ev.nameKind !== 'diff' && ev.nameKind !== 'number') {
      // count mode: a seed planted in the planter
      return I18N.sayCount(lang, ev.count != null ? ev.count : lab.value, ev.need != null ? ev.need : lab.value, rng);
    } else if (type === 'parity') {
      params.name = { kind: 'number', value: ev.nameValue };
    } else if (type === 'size') {
      params.answer = { kind: 'size', value: lab.value };
    }
    if (!I18N.has(lang, key)) return I18N.t(lang, 'praise', null, rng);
    return I18N.t(lang, key, params, rng);
  };

  // Gentle line for a `wrong` event. Ask mode: pass the pot's label and the current target
  //   sayWrong(lang, { label:{type:'animal', value:'seal'}, target:{type:'animal', value:'bear'} })
  //   → "That’s the seal’s pot. Where is the polar bear?"   Everything else → a `wrong` variant.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = ev || {};
    var lab = ev.label || {}, tg = ev.target || {};
    if ((lab.type || lab.kind) === 'animal' && (tg.type || tg.kind) === 'animal' && lab.value && tg.value &&
        lab.value !== tg.value) {
      return I18N.t(lang, 'say.wrong.animal', { name: lab.value, target: tg.value }, rng);
    }
    return I18N.t(lang, 'wrong', null, rng);
  };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { value = kind.value; kind = kind.kind; }
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal') return I18N.t(lang, 'talk.wrong.animal', ans);
    if (kind === 'shape') return I18N.t(lang, 'talk.wrong.a', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter') return I18N.t(lang, 'talk.wrong.letter', ans);
    if (kind === 'parity') return I18N.t(lang, 'talk.wrong.parity', ans);
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
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
      s = s.replace(/\bTa-đa\b/g, 'Ta đa');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  SG.I18N = I18N;
})(window.SG = window.SG || {});
