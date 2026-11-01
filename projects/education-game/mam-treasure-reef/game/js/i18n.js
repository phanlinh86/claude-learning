/* Mầm's Treasure Reef — TR.I18N (English + Vietnamese). Tutu the baby sea turtle talks to the child.
 *
 *   TR.I18N.t(lang, key, params, rng?)   → string (variants picked with rng.next()/rng()/Math.random)
 *   TR.I18N.name(lang, kind, value)      → display + spoken name ("red"/"màu đỏ", 7 → "seven"/"bảy",
 *                                          crab → "crab"/"con cua", shell red → "red shell"/"vỏ sò màu đỏ",
 *                                          pearl → "pearl"/"viên ngọc trai", tag → "tag"/"thẻ kho báu")
 *   TR.I18N.words(lang, kind, value)     → accepted spoken forms for speech recognition (lower-case, + no-diacritic forms)
 *   TR.I18N.speech(lang, text)           → text tuned for TTS (letter names, + − =)
 *   TR.I18N.sayCorrect(lang, ev, rng)    → Tutu's line for a `correct` world event
 *   TR.I18N.sayWrong(lang, ev, rng)      → gentle line for a `wrong` event (ask mode names both animals; dig names the item)
 *   TR.I18N.sayWrongDig(lang, kind, value) → "That’s a blue shell! Let’s look again!" (= sayWrong with nameKind/nameValue)
 *   TR.I18N.sayCount(lang, count, need)  → counting on land: "Two!" … at need "Three! You found 3 pearls!"
 *   TR.I18N.sayLand(lang, rng)           → "Clink! In the chest!" (non-count drag rounds, decoration)
 *   TR.I18N.sayDig / sayCrab / sayPhotobomb(lang, rng) → "Poof!" / "Hehe, a crab!" / "Hello, fish!"
 *   TR.I18N.talkWrong(lang, kind, value) → gentle "it's X" line for a missed Talk-time answer
 *   TR.I18N.setChild({ name, sayAs })    → default {child} = name for every t() call (a plain string is accepted too)
 *   TR.I18N.hasVietnamese(text)          → true when the text has Vietnamese letters (ầ, ơ, đ …) — voice.js uses it
 *   TR.I18N.langs = ['en', 'vi'];  TR.I18N.has(lang, key);  TR.I18N.keys(lang);  TR.I18N.PARAMS (required params)
 *
 * Params: values may be RAW ({animal:'crab'}, {color:'red'}, {n:3}) — keys named like a name kind (color, shape, size,
 * animal, parity) are named automatically; an object {kind, value} is always replaced by name(lang, kind, value).
 * {pearls} is "pearl"/"pearls" from {n} (vi "viên ngọc trai"); {treasures} likewise. {sum}/{diff} show as "2 + 3".
 * English "a" → "an" before a vowel. Keys with required params (PARAMS) fall back to a generic key when a param is
 * missing (never "the !" on screen). {child}: if the child's name is empty, variants containing {child} are skipped
 * when a no-name variant exists; otherwise {child} becomes "friend" / "bé" (vi "bé {child}" → "bé").
 * Missing params are removed (never a stray "{x}" on screen).
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài", Ă → "á", Â → "ớ" … (see LETTER_VI and docs/VOICE.md).
 */
(function (TR) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['crab', 'octopus', 'seahorse', 'clownfish', 'dolphin', 'jellyfish', 'starfish', 'whale', 'puffer'];
  var LAGOONS = ['beach', 'coral', 'cave', 'bay', 'ship', 'rainbow'];
  var AVATARS = ['turtle', 'crab', 'octopus', 'seahorse', 'clownfish', 'dolphin'];

  // ---------------------------------------------------------------- names
  // Vietnamese animal names CARRY their classifier ("con cua", "con cá heo") — templates use {animal} directly.
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rectangle: 'rectangle' },
      size: { big: 'big', small: 'small' },
      animal: { crab: 'crab', octopus: 'octopus', seahorse: 'seahorse', clownfish: 'clownfish', dolphin: 'dolphin',
        jellyfish: 'jellyfish', starfish: 'starfish', whale: 'whale', puffer: 'pufferfish' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
        rectangle: 'hình chữ nhật' },
      size: { big: 'to', small: 'nhỏ' },
      animal: { crab: 'con cua', octopus: 'con bạch tuộc', seahorse: 'con cá ngựa', clownfish: 'con cá hề',
        dolphin: 'con cá heo', jellyfish: 'con sứa', starfish: 'con sao biển', whale: 'con cá voi', puffer: 'con cá nóc' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  var ITEM = {
    en: { shell: 'shell', pearl: 'pearl', tag: 'tag', treasure: 'treasure' },
    vi: { shell: 'vỏ sò', pearl: 'viên ngọc trai', tag: 'thẻ kho báu', treasure: 'kho báu' }
  };

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
        crab: ['crab', 'crabs', 'little crab', 'crabby', 'grab'],
        octopus: ['octopus', 'octopuses', 'octopi', 'octo', 'squid'],
        seahorse: ['seahorse', 'sea horse', 'seahorses', 'horse', 'see horse'],
        clownfish: ['clownfish', 'clown fish', 'fish', 'orange fish', 'stripy fish', 'striped fish', 'clown'],
        dolphin: ['dolphin', 'dolphins', 'dolfin', 'dolphine'],
        jellyfish: ['jellyfish', 'jelly fish', 'jelly', 'jellies', 'jellyfishes'],
        starfish: ['starfish', 'star fish', 'sea star', 'starfishes', 'star'],
        whale: ['whale', 'whales', 'wail', 'big whale', 'baby whale'],
        puffer: ['pufferfish', 'puffer fish', 'puffer', 'blowfish', 'blow fish', 'balloon fish', 'puffy fish', 'puff'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] },
      shell: ['shell', 'shells', 'sea shell', 'seashell'],
      pearl: ['pearl', 'pearls', 'purl'],
      tag: ['tag', 'tags', 'coin'],
      treasure: ['treasure', 'treasures']
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
        crab: ['cua', 'con cua', 'bạn cua', 'cua con', 'cua biển', 'con cua biển'],
        octopus: ['bạch tuộc', 'con bạch tuộc', 'bạn bạch tuộc', 'bạch tuột', 'bạc tuộc', 'mực'],
        seahorse: ['cá ngựa', 'con cá ngựa', 'bạn cá ngựa', 'ngựa biển', 'cá ngữa'],
        clownfish: ['cá hề', 'con cá hề', 'bạn cá hề', 'cá hè', 'cá hễ'],
        dolphin: ['cá heo', 'con cá heo', 'bạn cá heo', 'heo biển', 'cá héo'],
        jellyfish: ['sứa', 'con sứa', 'bạn sứa', 'sứa biển', 'con sứa biển', 'xứa'],
        starfish: ['sao biển', 'con sao biển', 'bạn sao biển', 'ngôi sao biển', 'sao biễn'],
        whale: ['cá voi', 'con cá voi', 'bạn cá voi', 'cá voi con', 'cá voi xanh'],
        puffer: ['cá nóc', 'con cá nóc', 'bạn cá nóc', 'cá nốc', 'cá bóng', 'cá nóc tròn'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] },
      shell: ['vỏ sò', 'sò', 'vỏ ốc', 'con sò', 'vỏ'],
      pearl: ['ngọc trai', 'viên ngọc trai', 'hạt trai', 'ngọc', 'trai'],
      tag: ['thẻ', 'thẻ kho báu', 'cái thẻ', 'đồng xu'],
      treasure: ['kho báu', 'báu vật']
    }
  };

  // Default TR.WORDS (DESIGN §5.1) — word lists for the 'initial' topic. content.js loads later and may replace it.
  // en: clownfish is taught as "fish" (F); vi words carry NO classifier; content keeps ≤ 1 "cá …" word per round.
  var WORD_LIST = {
    en: [['crab', 'animal_crab', 'C'], ['octopus', 'animal_octopus', 'O'], ['seahorse', 'animal_seahorse', 'S'],
      ['fish', 'animal_clownfish', 'F'], ['dolphin', 'animal_dolphin', 'D'], ['jellyfish', 'animal_jellyfish', 'J'],
      ['starfish', 'animal_starfish', 'S'], ['whale', 'animal_whale', 'W'], ['pufferfish', 'animal_puffer', 'P']],
    vi: [['cua', 'animal_crab', 'C'], ['bạch tuộc', 'animal_octopus', 'B'], ['cá ngựa', 'animal_seahorse', 'C'],
      ['cá hề', 'animal_clownfish', 'C'], ['cá heo', 'animal_dolphin', 'C'], ['sứa', 'animal_jellyfish', 'S'],
      ['sao biển', 'animal_starfish', 'S'], ['cá voi', 'animal_whale', 'C'], ['cá nóc', 'animal_puffer', 'C']]
  };
  if (!TR.WORDS) {
    TR.WORDS = {};
    LANGS.forEach(function (l) {
      TR.WORDS[l] = WORD_LIST[l].map(function (w) { return { word: w[0], sprite: w[1], initial: w[2] }; });
    });
  }
  function spriteOfWord(lang, w) {        // looks in content's TR.WORDS first, then the default list
    var cur = TR.WORDS && TR.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].word === w) return cur[i].sprite || null;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][0] === w) return WORD_LIST[lang][i][1];
    return null;
  }
  function wordOfSprite(lang, spr) {
    var cur = TR.WORDS && TR.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].sprite === spr) return cur[i].word;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][1] === spr) return WORD_LIST[lang][i][0];
    return null;
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var LABEL_TYPES = ['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity'];
  var NAME_KINDS = ['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity', 'sum', 'diff', 'word',
    'shell', 'pearl', 'tag', 'treasure'];
  var ITEM_KINDS = ['shell', 'pearl', 'tag', 'treasure'];

  var STR = {
    en: {
      // ---- UI (DOM screens, DESIGN §7)
      'ui.title': 'Mầm’s Treasure Reef',
      'ui.subtitle': 'Dig and sort treasure with Tutu!',
      'ui.tagline': 'Under the sea, treasure is waiting!',
      'ui.play': 'Play',
      'ui.playAgain': 'Play again',
      'ui.home': 'Home',
      'ui.back': 'Back',
      'ui.cancel': 'Cancel',
      'ui.save': 'Save',
      'ui.on': 'On',
      'ui.off': 'Off',
      'ui.paused': 'Paused',
      'ui.resume': 'Keep playing',
      'ui.continue': 'Continue',
      'ui.settings': 'Settings',
      'ui.holdForParents': 'Hold for parents',
      'ui.whoPlays': 'Who is playing?',
      'ui.hello': ['Hello, {child}!', 'Hi {child}! Tutu is here!', 'Hello! Tutu is here!'],
      'ui.pickLagoon': 'Tap a lagoon to play!',
      'ui.profiles': 'Players',
      'ui.players': 'Players',
      'ui.profilesHint': 'Parents: hold ⚙ on the title screen to add or change players.',
      'ui.newProfile': 'New player',
      'ui.editProfile': 'Edit player',
      'ui.name': 'Name',
      'ui.namePlaceholder': 'e.g. Mầm',
      'ui.sayAs': 'Say my name as',
      'ui.sayAsHint': 'How to say the name in English, e.g. Mum',
      'ui.avatar': 'Avatar',
      'ui.avatar.turtle': 'Turtle',
      'ui.avatar.crab': 'Crab',
      'ui.avatar.octopus': 'Octopus',
      'ui.avatar.seahorse': 'Seahorse',
      'ui.avatar.clownfish': 'Clownfish',
      'ui.avatar.dolphin': 'Dolphin',
      'ui.age': 'Age',
      'ui.years': '{n} years',
      'ui.language': 'Language',
      'ui.map': 'Reef map',
      'ui.treasure': 'Treasure Room',
      'ui.treasureIntro': ['Your Treasure Room! {stars} stars so far!', 'Look at your treasure, {child}! {stars} stars!'],
      'ui.locked': 'Locked',
      'ui.unlocked': ['{lagoon} is open now!', 'A new lagoon opened: {lagoon}!'],
      'ui.lockedHint': 'Finish the lagoon before it first!',
      'ui.lagoon': 'Lagoon {n}',
      'ui.nextLagoon': 'Next lagoon',
      'ui.lagoonDone': 'Lagoon finished!',
      'ui.chapter': 'Chapter {n}',
      'ui.volume': 'Volume',
      'ui.louder': 'Louder',
      'ui.quieter': 'Quieter',
      'ui.sound': 'Sound effects',
      'ui.music': 'Music',
      'ui.voice': 'Tutu’s voice',
      'ui.mic': 'Answer by voice',
      'ui.listening': 'Tutu is listening…',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.tapTutu': 'Tap Tutu to hear it again',
      'ui.micUnsupported': 'Voice answers are not available here. Tap the buttons!',
      'ui.micDenied': 'The microphone is off. Tap the buttons instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.done': 'Done',
      'ui.skip': 'Skip',
      'ui.welcome': ['Hi {child}! I am Tutu. Let’s find treasure!', 'Hi! I am Tutu. Let’s find treasure!'],
      'ui.delete': 'Delete',
      'ui.deleteConfirm': 'Delete {child}’s profile and progress?',
      'ui.pearls': 'Pearls',
      'ui.stars': 'Stars',
      'ui.totalStars': 'Total stars',
      'ui.totalPearls': 'Total pearls',
      'ui.playTime': 'Play time',
      'ui.minutes': '{n} min',
      'ui.allDone': 'All done! {stars} stars',
      'ui.trophy.none': 'Not found yet',
      'ui.trophy.bronze': 'Bronze chest',
      'ui.trophy.silver': 'Silver chest',
      'ui.trophy.gold': 'Gold chest',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      // ---- topics
      'topic.colors': 'Colour Shells',
      'topic.size': 'Big and Small',
      'topic.shapes': 'Shape Gems',
      'topic.count': 'Counting Pearls',
      'topic.animals': 'Sea Friends',
      'topic.letters': 'Letter Tags',
      'topic.lower': 'Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Pearls',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      // ---- time of day under the sea
      'weather.0': 'Good morning, reef! The water is sparkling!',
      'weather.1': 'It’s noon! Look at all the bubbles!',
      'weather.2': 'Sunset! The water is turning orange!',
      'weather.3': 'Good night, sea! Look, the plankton glow!',

      // ---- lagoons (map badges + spoken intro)
      'lagoon.beach.name': 'Shell Beach',
      'lagoon.beach.intro': 'Welcome to Shell Beach! Let’s dig!',
      'lagoon.coral.name': 'Coral Garden',
      'lagoon.coral.intro': 'The Coral Garden! So many colours!',
      'lagoon.cave.name': 'Pearl Cave',
      'lagoon.cave.intro': 'Shh, the Pearl Cave! Pearls hide here.',
      'lagoon.bay.name': 'Friends Bay',
      'lagoon.bay.intro': 'Friends Bay! Everyone wants to play!',
      'lagoon.ship.name': 'Sunken Ship',
      'lagoon.ship.intro': 'A sunken ship! Treasure everywhere!',
      'lagoon.rainbow.name': 'Rainbow Reef',
      'lagoon.rainbow.intro': 'Rainbow Reef! You know everything now!',

      // ---- drag prompts
      'p.colors': 'Put each shell in the chest of the same colour!',
      'p.colorsOne': 'Put the {color} shell in the {color} chest!',
      'p.shapes': 'Put each gem in the chest with the same shape!',
      'p.shapesOne': 'Put the {shape} in the {shape} chest!',
      'p.size': 'Big shells in the big chest, small shells in the small chest!',
      'p.count': 'Put {n} {pearls} in the chest!',
      'p.countAny': 'Put the pearls in the chest and count with me!',
      'p.animals': 'Put a treasure in the {animal}’s chest!',
      'p.animalsNext': ['Now the {animal}!', 'Next, a treasure for the {animal}!', 'And now the {animal}!'],
      'p.animalsAll': 'Put a treasure in each friend’s chest!',
      'p.letters': 'Put each tag in the chest with the same letter!',
      'p.lower': 'Find the big letter chest for each small letter!',
      'p.initial': 'Put each one in the chest of its first letter!',
      'p.add': 'Add them up! Put it in the answer chest.',
      'p.sub': 'Take away! Put it in the answer chest.',
      'p.oddeven': 'Odd numbers in one chest, even numbers in the other!',

      // ---- dig prompts (one target at a time)
      'p.dig.colors': 'Dig up the {color} shell!',
      'p.dig.colorsAny': 'Dig up the shells!',
      'p.dig.shapes': 'Dig up the {shape}!',
      'p.dig.shapesAny': 'Dig up the gems!',
      'p.dig.size': 'Dig up a {size} shell!',
      'p.dig.sizeAny': 'Dig up the shells, big and small!',
      'p.dig.count': 'Dig up {n} {pearls}!',
      'p.dig.countAny': 'Dig up the pearls and count with me!',
      'p.dig.animals': 'Find the {animal}!',
      'p.dig.animalsAny': 'Find the sea friends!',
      'p.dig.letters': 'Dig up the letter {letter}!',
      'p.dig.lettersAny': 'Dig up the letter tags!',
      'p.dig.lower': 'Dig up the small letter {letter}!',
      'p.dig.lowerAny': 'Dig up the small letters!',
      'p.dig.initial': 'Dig up the one that starts with the letter {letter}!',
      'p.dig.initialAny': 'Which one starts with the letter? Dig it up!',
      'p.dig.add': 'Dig up the one that makes {n}!',
      'p.dig.addAny': 'Add them up and dig up the answer!',
      'p.dig.sub': 'Dig up the one that makes {n}!',
      'p.dig.subAny': 'Take away and dig up the answer!',
      'p.dig.oddeven': 'Dig up an {parity} number!',
      'p.dig.oddevenAny': 'Dig up odd and even numbers!',

      // ---- next target (dig and ask)
      'p.next.colors': ['Now the {color} one!', 'Next, the {color} shell!'],
      'p.next.shapes': ['Now the {shape}!', 'Next, the {shape}!'],
      'p.next.size': ['Now a {size} one!', 'Next, a {size} shell!'],
      'p.next.count': ['More pearls! Keep digging!', 'Keep going! More pearls!'],
      'p.next.animals': ['Now the {animal}!', 'Next, find the {animal}!'],
      'p.next.letters': ['Now the letter {letter}!', 'Next, the letter {letter}!'],
      'p.next.lower': ['Now the small letter {letter}!'],
      'p.next.initial': ['Now one that starts with the letter {letter}!'],
      'p.next.add': ['Now the one that makes {n}!'],
      'p.next.sub': ['Now the one that makes {n}!'],
      'p.next.oddeven': ['Now an {parity} one!'],
      'p.next.any': ['Now the next one!', 'Next one!'],

      // ---- Tutu's reactions
      'say.dig': ['Poof!', 'Found it!', 'Ta-da!', 'Boing!', 'There it is!', 'Pop! Got it!'],
      'say.crab': ['Hehe, a crab!', 'Oh! A giggly crab!', 'A crab was hiding there!', 'Hello, little crab!', 'Tickle tickle, crab!'],
      'say.photobomb': ['Hello, fish!', 'Who was that?', 'A silly fish!', 'Hehe, a fish said hi!', 'Bloop! A fish!'],
      'say.land': ['Clink! In the chest!', 'Sparkle!', 'Ta-da! Treasure!', 'In it goes!', 'So shiny!', 'Clink!'],
      'say.correct.color': ['Yes! {answer}!', '{answer}! Just right!', 'A {answer} shell!'],
      'say.correct.shape': ['Yes! The {answer}!', 'A {answer} gem!', '{answer}! Well done!'],
      'say.correct.size': ['Yes! The {answer} chest!', '{answer} shell, {answer} chest!'],
      'say.correct.animal': ['A treasure for the {answer}!', 'The {answer} says thank you!', 'Yes! The {answer}!'],
      'say.correct.number': ['Yes! {name} makes {answer}!', '{name} is {answer}!'],
      'say.correct.letter': ['Yes! The letter {answer}!', 'That is the letter {answer}!'],
      'say.correct.word': ['{name} starts with the letter {answer}!'],
      'say.correct.parity': ['Yes! {name} is {answer}!', '{name} is an {answer} number!'],
      'say.correct.treasure': ['Yes!', 'In it goes!', 'Treasure!'],
      'say.countDone': ['You found {n} {pearls}!', 'Yes! {n} {pearls}!', '{n} {pearls}! Hooray!'],
      'say.wrong.animal': ['That’s the {name}’s chest. Where is the {target}?', 'That chest is for the {name}. Let’s find the {target}!'],
      'say.wrong.item': ['That’s {name}! Let’s look again!', 'Oh, {name}! Try another mound!'],
      'say.wrong.item.a': ['That’s a {name}! Let’s look again!', 'Oh, a {name}! Try another mound!'],
      'say.wrong.item.letter': ['That’s the letter {name}! Let’s look again!', 'Oh, the letter {name}! Try another mound!'],
      'say.levelDone': ['Chapter done! Let’s dance, {child}!', 'Wiggle wiggle! Great chapter!', 'Dance time!'],
      'say.lagoonDone': ['You finished the lagoon, {child}! A new one opened!', 'Hooray, {child}! A trophy for you!',
        'The whole lagoon! You are amazing!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'Wow, {child}, you are a star!', 'Super digging, {child}!',
        'Hooray, {child}! All the treasure!', 'You are so clever, {child}!', 'Amazing, {child}!',
        'What a treasure hunter, {child}!'],
      'wrong': ['Hmm, let’s try another one!', 'Almost! Try again!', 'Ooh, let’s look again!', 'Try a different one!',
        'So close! One more try!', 'Let’s think again!', 'Keep trying, you can do it!'],
      'miss': ['Oops! Put it in a chest!', 'Into a chest, please!', 'Whee! Let’s put it in a chest!',
        'Bring it to a chest!', 'The chests are down here!'],
      'hint': ['Look! This one is glowing.', 'Psst! Try the shiny one!', 'Here is a clue: the glowing one!',
        'Tutu will help! Look here!', 'Try the sparkly one!'],
      'idle': ['Pick up a treasure or tap the sand!', 'Want to play? Tap or drag!', 'Tutu is waiting! Your turn!',
        'Touch the sand and dig!', 'Let’s find treasure!', 'I am here, {child}! Let’s play!'],

      // ---- Talk time
      'talk.intro': 'Talk time! Tutu has a question.',
      'talk.colors': 'What colour is this shell?',
      'talk.size': 'Is it big or small?',
      'talk.shapes': 'What shape is this gem?',
      'talk.count': 'How many pearls?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Tap a sea friend!',
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

      'session.done': ['You found all the treasure! {stars} stars!', 'Amazing, {child}! {stars} stars!',
        'The chest is full! {stars} stars!']
    },
    vi: {
      'ui.title': 'Mầm Tìm Kho Báu',
      'ui.subtitle': 'Cùng Tutu đào và xếp kho báu nhé!',
      'ui.tagline': 'Dưới biển sâu, kho báu đang chờ bé!',
      'ui.play': 'Chơi',
      'ui.playAgain': 'Chơi lại',
      'ui.home': 'Trang chủ',
      'ui.back': 'Quay lại',
      'ui.cancel': 'Huỷ',
      'ui.save': 'Lưu',
      'ui.on': 'Bật',
      'ui.off': 'Tắt',
      'ui.paused': 'Tạm dừng',
      'ui.resume': 'Chơi tiếp',
      'ui.continue': 'Tiếp tục',
      'ui.settings': 'Cài đặt',
      'ui.holdForParents': 'Nhấn giữ (dành cho bố mẹ)',
      'ui.whoPlays': 'Ai chơi nào?',
      'ui.hello': ['Chào bé {child}!', 'Chào {child}! Tutu đây!', 'Chào bé! Tutu đây!'],
      'ui.pickLagoon': 'Bé chạm vào một vịnh để chơi nhé!',
      'ui.profiles': 'Các bé',
      'ui.players': 'Các bé',
      'ui.profilesHint': 'Bố mẹ nhấn giữ ⚙ ở màn hình đầu để thêm hoặc sửa hồ sơ.',
      'ui.newProfile': 'Thêm bé mới',
      'ui.editProfile': 'Sửa hồ sơ',
      'ui.name': 'Tên của bé',
      'ui.namePlaceholder': 'Ví dụ: Mầm',
      'ui.sayAs': 'Đọc tên bằng tiếng Anh là',
      'ui.sayAsHint': 'Cách đọc tên khi chơi tiếng Anh, ví dụ: Mum',
      'ui.avatar': 'Hình đại diện',
      'ui.avatar.turtle': 'Rùa biển',
      'ui.avatar.crab': 'Cua',
      'ui.avatar.octopus': 'Bạch tuộc',
      'ui.avatar.seahorse': 'Cá ngựa',
      'ui.avatar.clownfish': 'Cá hề',
      'ui.avatar.dolphin': 'Cá heo',
      'ui.age': 'Tuổi',
      'ui.years': '{n} tuổi',
      'ui.language': 'Ngôn ngữ',
      'ui.map': 'Bản đồ rạn san hô',
      'ui.treasure': 'Phòng kho báu',
      'ui.treasureIntro': ['Phòng kho báu của bé! Đã có {stars} ngôi sao!', 'Nhìn kho báu của {child} nè! {stars} ngôi sao!'],
      'ui.locked': 'Chưa mở',
      'ui.unlocked': ['{lagoon} mở rồi!', 'Vịnh mới mở ra rồi: {lagoon}!'],
      'ui.lockedHint': 'Bé chơi xong vịnh trước đã nhé!',
      'ui.lagoon': 'Vịnh {n}',
      'ui.nextLagoon': 'Vịnh tiếp theo',
      'ui.lagoonDone': 'Xong một vịnh rồi!',
      'ui.chapter': 'Chương {n}',
      'ui.volume': 'Âm lượng',
      'ui.louder': 'To hơn',
      'ui.quieter': 'Nhỏ hơn',
      'ui.sound': 'Hiệu ứng âm thanh',
      'ui.music': 'Nhạc nền',
      'ui.voice': 'Giọng của Tutu',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.listening': 'Tutu đang nghe…',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.tapTutu': 'Chạm vào Tutu để nghe lại nhé',
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm nút nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm nút nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.done': 'Xong',
      'ui.skip': 'Bỏ qua',
      'ui.welcome': ['Chào bé {child}! Tutu đây. Mình cùng tìm kho báu nhé!', 'Chào bé! Tutu đây. Mình cùng tìm kho báu nhé!'],
      'ui.delete': 'Xoá',
      'ui.deleteConfirm': 'Xoá hồ sơ và tiến trình của bé {child}?',
      'ui.pearls': 'Ngọc trai',
      'ui.stars': 'Ngôi sao',
      'ui.totalStars': 'Tổng ngôi sao',
      'ui.totalPearls': 'Tổng ngọc trai',
      'ui.playTime': 'Thời gian chơi',
      'ui.minutes': '{n} phút',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.trophy.none': 'Chưa tìm được',
      'ui.trophy.bronze': 'Rương đồng',
      'ui.trophy.silver': 'Rương bạc',
      'ui.trophy.gold': 'Rương vàng',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Vỏ sò màu sắc',
      'topic.size': 'To và nhỏ',
      'topic.shapes': 'Đá quý hình khối',
      'topic.count': 'Đếm ngọc trai',
      'topic.animals': 'Bạn biển',
      'topic.letters': 'Thẻ chữ cái',
      'topic.lower': 'Chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Chào buổi sáng, rạn san hô ơi! Nước lấp lánh quá!',
      'weather.1': 'Buổi trưa rồi! Bong bóng nhiều quá!',
      'weather.2': 'Hoàng hôn rồi! Nước biển ánh màu cam!',
      'weather.3': 'Chúc biển ngủ ngon! Nhìn kìa, ánh sáng lung linh!',

      'lagoon.beach.name': 'Bãi Vỏ Sò',
      'lagoon.beach.intro': 'Chào mừng đến Bãi Vỏ Sò! Mình đào nhé!',
      'lagoon.coral.name': 'Vườn San Hô',
      'lagoon.coral.intro': 'Vườn San Hô đây! Nhiều màu quá!',
      'lagoon.cave.name': 'Hang Ngọc Trai',
      'lagoon.cave.intro': 'Hang Ngọc Trai nè! Ngọc trai trốn ở đây.',
      'lagoon.bay.name': 'Vịnh Bạn Bè',
      'lagoon.bay.intro': 'Vịnh Bạn Bè! Các bạn đều muốn chơi!',
      'lagoon.ship.name': 'Con Tàu Đắm',
      'lagoon.ship.intro': 'Một con tàu đắm! Kho báu khắp nơi!',
      'lagoon.rainbow.name': 'Rạn San Hô Cầu Vồng',
      'lagoon.rainbow.intro': 'Rạn San Hô Cầu Vồng! Bé biết hết rồi đó!',

      'p.colors': 'Bé ơi, bỏ mỗi vỏ sò vào rương cùng màu nhé!',
      'p.colorsOne': 'Bé ơi, bỏ vỏ sò {color} vào rương {color} nhé!',
      'p.shapes': 'Bé ơi, bỏ mỗi viên đá vào rương có hình giống nhé!',
      'p.shapesOne': 'Bé ơi, bỏ {shape} vào rương {shape} nhé!',
      'p.size': 'Sò to vào rương to, sò nhỏ vào rương nhỏ nhé!',
      'p.count': 'Bé ơi, bỏ {n} viên ngọc trai vào rương nhé!',
      'p.countAny': 'Bé bỏ ngọc trai vào rương rồi đếm cùng Tutu nào!',
      'p.animals': 'Bé ơi, bỏ kho báu vào rương của {animal} nhé!',
      'p.animalsNext': ['Giờ đến {animal} nhé!', 'Tiếp theo là {animal} nào!', 'Còn {animal} thì sao nhỉ?'],
      'p.animalsAll': 'Bé ơi, tặng mỗi bạn một kho báu nhé!',
      'p.letters': 'Bé ơi, bỏ thẻ vào rương có chữ giống nhé!',
      'p.lower': 'Bé tìm rương chữ in hoa cho mỗi chữ thường nhé!',
      'p.initial': 'Hình bắt đầu bằng chữ gì? Bỏ vào rương đó nhé!',
      'p.add': 'Bé tính phép cộng rồi bỏ vào rương đáp số nhé!',
      'p.sub': 'Bé tính phép trừ rồi bỏ vào rương đáp số nhé!',
      'p.oddeven': 'Số lẻ vào rương lẻ, số chẵn vào rương chẵn nhé!',

      'p.dig.colors': '{child} ơi, đào vỏ sò {color} lên nhé!',
      'p.dig.colorsAny': 'Bé ơi, đào vỏ sò lên nhé!',
      'p.dig.shapes': '{child} ơi, đào {shape} lên nhé!',
      'p.dig.shapesAny': 'Bé ơi, đào đá quý lên nhé!',
      'p.dig.size': '{child} ơi, đào một vỏ sò {size} lên nhé!',
      'p.dig.sizeAny': 'Bé ơi, đào vỏ sò to và nhỏ lên nhé!',
      'p.dig.count': '{child} ơi, đào {n} viên ngọc trai lên nhé!',
      'p.dig.countAny': 'Bé đào ngọc trai lên rồi đếm cùng Tutu nào!',
      'p.dig.animals': '{child} ơi, tìm {animal} nhé!',
      'p.dig.animalsAny': 'Bé ơi, tìm các bạn biển nhé!',
      'p.dig.letters': '{child} ơi, đào chữ {letter} lên nhé!',
      'p.dig.lettersAny': 'Bé ơi, đào thẻ chữ lên nhé!',
      'p.dig.lower': '{child} ơi, đào chữ {letter} thường lên nhé!',
      'p.dig.lowerAny': 'Bé ơi, đào chữ thường lên nhé!',
      'p.dig.initial': '{child} ơi, đào hình bắt đầu bằng chữ {letter} lên nhé!',
      'p.dig.initialAny': 'Hình nào bắt đầu bằng chữ đó? Đào lên nhé!',
      'p.dig.add': '{child} ơi, đào phép tính bằng {n} lên nhé!',
      'p.dig.addAny': 'Bé tính phép cộng rồi đào đáp số lên nhé!',
      'p.dig.sub': '{child} ơi, đào phép tính bằng {n} lên nhé!',
      'p.dig.subAny': 'Bé tính phép trừ rồi đào đáp số lên nhé!',
      'p.dig.oddeven': '{child} ơi, đào một số {parity} lên nhé!',
      'p.dig.oddevenAny': 'Bé ơi, đào số lẻ và số chẵn lên nhé!',

      'p.next.colors': ['Giờ đến vỏ sò {color} nhé!', 'Tiếp theo là {color} nào!'],
      'p.next.shapes': ['Giờ đến {shape} nhé!', 'Tiếp theo là {shape} nào!'],
      'p.next.size': ['Giờ đến vỏ sò {size} nhé!', 'Tiếp theo là vỏ sò {size} nào!'],
      'p.next.count': ['Đào thêm ngọc trai nào!', 'Tiếp tục nào, còn ngọc trai nữa!'],
      'p.next.animals': ['Giờ đến {animal} nhé!', 'Tiếp theo, tìm {animal} nào!'],
      'p.next.letters': ['Giờ đến chữ {letter} nhé!', 'Tiếp theo là chữ {letter} nào!'],
      'p.next.lower': ['Giờ đến chữ {letter} thường nhé!'],
      'p.next.initial': ['Giờ đến hình bắt đầu bằng chữ {letter} nhé!'],
      'p.next.add': ['Giờ đến phép tính bằng {n} nhé!'],
      'p.next.sub': ['Giờ đến phép tính bằng {n} nhé!'],
      'p.next.oddeven': ['Giờ đến số {parity} nhé!'],
      'p.next.any': ['Giờ đến cái tiếp theo nhé!', 'Tiếp nào!'],

      'say.dig': ['Bụp!', 'Tìm thấy rồi!', 'Ta-đa!', 'Boing!', 'Đây rồi!', 'Bụp! Được rồi!'],
      'say.crab': ['Hihi, một con cua!', 'Ồ! Con cua cười khúc khích!', 'Có con cua trốn ở đó!', 'Chào bạn cua nhỏ!',
        'Cua ơi, cù lét nè!'],
      'say.photobomb': ['Chào bạn cá!', 'Ai đó nhỉ?', 'Một bạn cá ngốc nghếch!', 'Hihi, bạn cá chào bé!', 'Bụp! Một bạn cá!'],
      'say.land': ['Keng! Vào rương rồi!', 'Lấp lánh!', 'Ta-đa! Kho báu!', 'Vào rồi!', 'Sáng bóng quá!', 'Keng!'],
      'say.correct.color': ['Đúng rồi! {answer} đó!', 'Vỏ sò {answer}!', 'Đúng rồi, {answer}!'],
      'say.correct.shape': ['Đúng rồi! {answer} đó!', '{answer}! Bé giỏi quá!'],
      'say.correct.size': ['Đúng rồi! Rương {answer}!', 'Vỏ sò {answer} vào rương {answer}!'],
      'say.correct.animal': ['Kho báu tặng {answer}!', '{answer} cảm ơn bé!', 'Đúng rồi! {answer} đó!'],
      'say.correct.number': ['Đúng rồi! {name} bằng {answer}!', '{name} bằng {answer}!'],
      'say.correct.letter': ['Đúng rồi! Chữ {answer}!', 'Đây là chữ {answer} đó!'],
      'say.correct.word': ['{name} bắt đầu bằng chữ {answer}!'],
      'say.correct.parity': ['Đúng rồi! {name} là số {answer}!', '{name} là số {answer} đó!'],
      'say.correct.treasure': ['Đúng rồi!', 'Vào rương rồi!', 'Kho báu!'],
      'say.countDone': ['Bé tìm được {n} viên ngọc trai rồi!', 'Đúng rồi! {n} viên ngọc trai!', '{n} viên ngọc trai! Hoan hô!'],
      'say.wrong.animal': ['Rương của {name} đó. {target} đâu nhỉ?', 'Đây là rương của {name}. Tìm {target} nào!'],
      'say.wrong.item': ['Đó là {name}! Mình tìm lại nhé!', 'Ồ, {name}! Bé thử ụ cát khác nhé!'],
      'say.wrong.item.a': ['Đó là {name}! Mình tìm lại nhé!', 'Ồ, {name}! Bé thử ụ cát khác nhé!'],
      'say.wrong.item.letter': ['Đó là chữ {name}! Mình tìm lại nhé!', 'Ồ, chữ {name}! Bé thử ụ cát khác nhé!'],
      'say.levelDone': ['Xong một chương rồi! Nhảy nào, {child}!', 'Lắc lư nào! Chương này giỏi quá!', 'Giờ nhảy múa nào!'],
      'say.lagoonDone': ['Bé {child} xong cả vịnh rồi! Vịnh mới mở ra rồi!', 'Hoan hô {child}! Có cúp cho bé nè!',
        'Cả một vịnh! Bé giỏi quá đi!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Tuyệt vời, {child}!', 'Giỏi quá, {child} ơi!', 'Hoan hô {child}!', '{child} là ngôi sao đó!',
        '{child} đào giỏi quá!', 'Oa, {child} tìm được hết kho báu rồi!', '{child} thông minh quá!', 'Siêu quá, {child} ơi!'],
      'wrong': ['Ồ, bé thử cái khác nhé!', 'Gần đúng rồi! Thử lại nào!', 'Mình nhìn lại nhé!', 'Bé thử lại lần nữa nào!',
        'Suýt nữa thôi! Thử tiếp nhé!', 'Không sao đâu, thử lại nhé!', 'Bé nghĩ thêm chút nữa nhé!'],
      'miss': ['Ối! Bé thả vào rương nhé!', 'Bỏ vào rương nào bé ơi!', 'Rương ở dưới này nè!', 'Bé kéo kho báu vào rương nhé!',
        'Thả vào một cái rương nào!'],
      'hint': ['Nhìn nè! Cái này đang sáng.', 'Bé thử cái lấp lánh nhé!', 'Tutu gợi ý nè: cái đang sáng!',
        'Tutu giúp bé nhé, nhìn đây!', 'Cái sáng lấp lánh đó bé!'],
      'idle': ['Bé ơi, tìm kho báu tiếp nào!', 'Bé chạm vào cát hoặc kéo kho báu nhé!', 'Tutu đang chờ bé nè!',
        'Đến lượt bé rồi đó!', 'Bé {child} ơi, mình chơi tiếp nhé!', 'Mình tìm kho báu nào!'],

      'talk.intro': 'Giờ trò chuyện! Tutu hỏi bé nhé.',
      'talk.colors': 'Vỏ sò này màu gì nhỉ?',
      'talk.size': 'Cái này to hay nhỏ nhỉ?',
      'talk.shapes': 'Viên đá này hình gì nào?',
      'talk.count': 'Có bao nhiêu viên ngọc trai nào?',
      'talk.animals': '{animal} ở đâu nhỉ?',
      'talk.animalsAny': 'Bé chạm vào một bạn biển nhé!',
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
      'talk.wrong.animal': '{answer} ở đây nè! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.parity': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Bé tìm được hết kho báu rồi! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Rương đầy kho báu rồi! {stars} ngôi sao!']
    }
  };

  // required params → fallback key when one is missing
  var NEEDS = {
    'p.colorsOne': ['color'], 'p.shapesOne': ['shape'], 'p.count': ['n'], 'p.animals': ['animal'],
    'p.animalsNext': ['animal'], 'talk.animals': ['animal'], 'say.countDone': ['n'],
    'say.wrong.animal': ['name', 'target'], 'say.wrong.item': ['name'], 'say.wrong.item.a': ['name'],
    'say.wrong.item.letter': ['name'],
    'p.dig.colors': ['color'], 'p.dig.shapes': ['shape'], 'p.dig.size': ['size'], 'p.dig.count': ['n'],
    'p.dig.animals': ['animal'], 'p.dig.letters': ['letter'], 'p.dig.lower': ['letter'], 'p.dig.initial': ['letter'],
    'p.dig.add': ['n'], 'p.dig.sub': ['n'], 'p.dig.oddeven': ['parity'],
    'p.next.colors': ['color'], 'p.next.shapes': ['shape'], 'p.next.size': ['size'], 'p.next.animals': ['animal'],
    'p.next.letters': ['letter'], 'p.next.lower': ['letter'], 'p.next.initial': ['letter'], 'p.next.add': ['n'],
    'p.next.sub': ['n'], 'p.next.oddeven': ['parity']
  };
  var FALLBACK = {
    'p.colorsOne': 'p.colors', 'p.shapesOne': 'p.shapes', 'p.count': 'p.countAny', 'p.animals': 'p.animalsAll',
    'p.animalsNext': 'p.animalsAll', 'talk.animals': 'talk.animalsAny', 'say.countDone': 'praise', 'say.wrong.animal': 'wrong',
    'say.wrong.item': 'wrong', 'say.wrong.item.a': 'wrong', 'say.wrong.item.letter': 'wrong'
  };
  TOPICS.forEach(function (tp) {
    FALLBACK['p.dig.' + tp] = 'p.dig.' + tp + 'Any';
    FALLBACK['p.next.' + tp] = 'p.next.any';
  });

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
  // Vietnamese-only letters (anything with a tone/hat/horn mark, đ). Plain "Linh" or "Anna" → false.
  var RE_VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  function hasVietnamese(s) { return RE_VI.test(String(s == null ? '' : s).normalize('NFC')); }
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
  function itemKind(kind) { return kind === 'seed' ? 'shell' : kind; }   // 'seed' = Snow Garden's name for the coloured item

  function name(lang, kind, value) {
    lang = L(lang);
    var tbl;
    kind = itemKind(kind);
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
      case 'shell': {                          // "shell" / "red shell" / "vỏ sò màu đỏ"
        var col = NAMES[lang].color[value];
        if (!col || value === 'cream') return ITEM[lang].shell;
        return lang === 'vi' ? ITEM.vi.shell + ' ' + col : col + ' ' + ITEM.en.shell;
      }
      case 'pearl': case 'tag': case 'treasure':
        return ITEM[lang][kind];
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
    kind = itemKind(kind);
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
      case 'shell': {
        var l3 = [name(lang, 'shell', value)].concat(WORDS[lang].shell);
        if (NAMES[lang].color[value]) l3 = l3.concat(words(lang, 'color', value));
        return addForms(out, l3);
      }
      case 'pearl': case 'tag': case 'treasure':
        return addForms(out, [name(lang, kind, value)].concat(WORDS[lang][kind]));
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
  var I18N = { langs: LANGS.slice(), child: '', sayAs: '' };

  function resolveParam(lang, key, val, params) {
    if (key === 'pearls' || key === 'treasures') {   // derived from {n}
      var n = params && present(params.n) ? Number(rawVal(params.n)) : 2;
      if (lang === 'vi') return key === 'pearls' ? ITEM.vi.pearl : ITEM.vi.treasure;
      var one = key === 'pearls' ? 'pearl' : 'treasure';
      return n === 1 ? one : one + 's';
    }
    if (!present(val)) return '';
    if (typeof val === 'object' && val.kind) return name(lang, val.kind, val.value);
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity':
        return name(lang, key, val);
      case 'name': case 'target':             // bare animal ids are the common case (ask mode)
        return NAMES[lang].animal[val] ? name(lang, 'animal', val) : String(val);
      case 'sum': case 'diff': return exprText(val);
      default: return String(val);            // letter stays a letter: speech() turns "chữ B" into "chữ bờ"
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
  I18N.hasVietnamese = hasVietnamese;
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  // setChild({ name, sayAs }) — or a plain string for the name. {child} is always the real name (never sayAs).
  I18N.setChild = function (c) {
    if (c && typeof c === 'object') {
      I18N.child = c.name ? String(c.name).trim().slice(0, 24) : '';
      I18N.sayAs = c.sayAs ? String(c.sayAs).trim().slice(0, 24) : '';
    } else {
      I18N.child = c ? String(c).trim().slice(0, 24) : '';
      I18N.sayAs = '';
    }
  };
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.LAGOONS = LAGOONS.slice();
  I18N.AVATARS = AVATARS.slice();
  I18N.LABEL_TYPES = LABEL_TYPES.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.ITEM_KINDS = ITEM_KINDS.slice();
  I18N.PARAMS = NEEDS;           // { 'p.animals': ['animal'], 'p.count': ['n'], … } — required params per key
  I18N.NAME_TABLE = NAMES;       // read-only use (tests / UI)
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;

  // Counting (count rounds, on land / dig): count < need → "Two!"; count ≥ need → "Three! You found 3 pearls!"
  I18N.sayCount = function (lang, count, need, rng) {
    lang = L(lang);
    var c = parseInt(rawVal(count), 10);
    if (isNaN(c)) return I18N.t(lang, 'praise', null, rng);
    var word = capFirst(numberName(lang, c)) + '!';
    var nd = parseInt(rawVal(need), 10);
    if (isNaN(nd) || c < nd) return word;
    return word + ' ' + I18N.t(lang, 'say.countDone', { n: c }, rng);
  };
  I18N.sayLand = function (lang, rng) { return I18N.t(lang, 'say.land', null, rng); };
  I18N.sayDig = function (lang, rng) { return I18N.t(lang, 'say.dig', null, rng); };
  I18N.sayCrab = function (lang, rng) { return I18N.t(lang, 'say.crab', null, rng); };
  I18N.sayPhotobomb = function (lang, rng) { return I18N.t(lang, 'say.photobomb', null, rng); };

  // Tutu's line for a `correct` event {nameKind, nameValue, label:{type, value}, count?, need?}
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
      // count mode: a pearl landed in the long chest
      return I18N.sayCount(lang, ev.count != null ? ev.count : lab.value, ev.need != null ? ev.need : lab.value, rng);
    } else if (type === 'parity') {
      params.name = { kind: 'number', value: ev.nameValue };
    } else if (type === 'size') {
      params.answer = { kind: 'size', value: lab.value };
    }
    if (!I18N.has(lang, key)) {
      if (ITEM_KINDS.indexOf(itemKind(ev.nameKind)) >= 0) return I18N.t(lang, 'say.correct.treasure', null, rng);
      return I18N.t(lang, 'praise', null, rng);
    }
    return I18N.t(lang, key, params, rng);
  };

  // Gentle line for a `wrong` event.
  //   Ask mode: sayWrong(lang, { label:{type:'animal', value:'crab'}, target:{type:'animal', value:'whale'} })
  //     → "That’s the crab’s chest. Where is the whale?"
  //   Dig mode: sayWrong(lang, { nameKind:'shell', nameValue:'blue' }) → "That’s a blue shell! Let’s look again!"
  //   Everything else → a `wrong` variant.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = ev || {};
    var lab = ev.label || {}, tg = ev.target || {};
    if ((lab.type || lab.kind) === 'animal' && (tg.type || tg.kind) === 'animal' && lab.value && tg.value &&
        lab.value !== tg.value) {
      return I18N.t(lang, 'say.wrong.animal', { name: lab.value, target: tg.value }, rng);
    }
    var kind = itemKind(ev.nameKind);
    if (kind && ev.nameValue != null && ev.nameValue !== '') {
      var nm = { name: { kind: kind, value: ev.nameValue } };
      if (kind === 'letter') return I18N.t(lang, 'say.wrong.item.letter', nm, rng);
      if (kind === 'shell' || kind === 'animal' || kind === 'shape' || kind === 'word' || kind === 'pearl' ||
          kind === 'tag' || kind === 'treasure') return I18N.t(lang, 'say.wrong.item.a', nm, rng);
      return I18N.t(lang, 'say.wrong.item', nm, rng);
    }
    return I18N.t(lang, 'wrong', null, rng);
  };

  // Dig mode shortcut: the tapped mound's item → "That’s a blue shell! Let’s look again!"
  I18N.sayWrongDig = function (lang, kind, value, rng) {
    if (kind && typeof kind === 'object') { rng = value; value = kind.nameValue != null ? kind.nameValue : kind.value; kind = kind.nameKind || kind.kind; }
    return I18N.sayWrong(lang, { nameKind: kind, nameValue: value }, rng);
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

  TR.I18N = I18N;
})(window.TR = window.TR || {});
