/* Gigi's Peekaboo Windows — GW.I18N (English + Vietnamese). Gigi the giraffe calf talks to the child about what is
 * hiding behind the windows of the buildings on Peekaboo Street.
 *
 *   GW.I18N.t(lang, key, params, rng?)     → string (variants picked with rng.next()/rng()/Math.random)
 *   GW.I18N.name(lang, kind, value)        → display + spoken name ("red"/"màu đỏ", {value:'red', obj:'umbrella'} →
 *                                            "a red umbrella"/"cái ô màu đỏ", 7 → "seven"/"bảy", dog → "dog"/"con chó",
 *                                            kennel → "kennel"/"nhà chó", dots 3 → "three dots"/"ba chấm tròn")
 *   GW.I18N.words(lang, kind, value)       → accepted spoken forms for speech recognition (lower-case, + no-diacritic forms)
 *   GW.I18N.speech(lang, text)             → text tuned for TTS (letter names, + − =, dashes).
 *                                            ("Gigi" → "Gi Gi" for Vietnamese happens in voice.js)
 *
 *   Window lines (memory game). Every function copes with a missing / partial event and never returns '' or "{x}":
 *   GW.I18N.sayFlip(lang, ev, rng)         → what is inside the window that opened: "Red!", "A red umbrella!",
 *                                            "One, two, three dots!", "Three!", "A dog!", "The kennel!", "The letter B!"
 *   GW.I18N.sayMatch(lang, ev, rng)        → "Two red umbrellas — a pair!", "The dog lives in the kennel!",
 *                                            "Three — one, two, three! A pair!", "Dog starts with the letter D! A pair!"
 *   GW.I18N.sayMismatch(lang, ev, rng)     → "A red umbrella and a blue kite. Let's look again!",
 *                                            "A dog and a nest. Where does the dog live?" — kind, never negative
 *   GW.I18N.sayCritter(lang, type, action?, rng) → surprise lines (pigeon | bus | balloon; action 'tap' for the tap reaction)
 *   GW.I18N.sayReward(lang, ev, rng)       → legacy (Dee's rewards); unknown kinds → praise
 *   GW.I18N.sayCount(lang, n, need)        → "Two!" … at need "Three! Three dots!"
 *   GW.I18N.cardPhrase(lang, card)         → "a red umbrella" / "cái ô màu đỏ", "the kennel"… (what mismatch lines use)
 *   GW.I18N.talkWrong(lang, kind, value)   → gentle "it's X" line for a missed Talk-time answer
 *                                            (home: "The dog lives in the kennel! Good try!")
 *   GW.I18N.setChild(name)                 → default {child} for every t() call
 *   GW.I18N.langs = ['en', 'vi'];  has(lang, key);  keys(lang);  raw(lang, key);  PARAMS (required params per key)
 *
 * Event fields read by sayFlip / sayMatch / sayMismatch (all optional):
 *   ev.nameKind, ev.nameValue, ev.face {kind, value, color, obj, shape, sprite, text, n, scale, parity, animal},
 *   ev.topic, ev.parity, ev.size ('big'|'small'), ev.word (initial match), ev.animal + ev.home (homes match);
 *   per window: ev.nameKindA/nameValueA/faceA/sizeA + …B (what GW.World sends), or ev.cardA / ev.cardB (card objects
 *   {nameKind, nameValue, face, size}), or ev.nameA / ev.nameB as {kind, value}; also ev.cards = [cardA, cardB].
 *
 * Name kinds: color, shape, size, animal, home, thing, number, dots, letter, text, sum, diff, parity, word.
 * Params: values may be RAW ({animal:'dog'}, {color:'red'}, {home:'kennel'}, {thing:'kite'}) — keys named like a name
 * kind (color, shape, size, animal, home, thing, parity) are named automatically; an object {kind, value} is always
 * replaced by name(lang, kind, value).
 * Derived params: {letter}/{lower} from letter|text, {word} from word|animal|sprite, {expr} from expr|text|a,b,
 * {dots} ("dot"/"dots", vi "chấm tròn"), {num} (number word) and {counted} ("one, two, three") from n,
 * {thing} from obj, {animal} from a bare animal id in {sound}/{sprite}.
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen);
 * an unknown prompt key `p.<x>` falls back to `p.any`. {child}: if the child's name is empty, variants containing
 * {child} are skipped; if every variant has it, {child} becomes "friend" / "bé". Missing params are removed.
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài", Ă → "á", Â → "ớ" … (see LETTER_VI and docs/VOICE.md).
 */
(function (GW) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['dog', 'cat', 'bird', 'fish', 'bee', 'rabbit', 'duck', 'hen', 'spider'];
  var HOME_OF = { dog: 'kennel', cat: 'basket', bird: 'nest', fish: 'bowl', bee: 'hive', rabbit: 'hutch', duck: 'pond',
    hen: 'coop', spider: 'web' };
  var HOMES = ANIMALS.map(function (a) { return HOME_OF[a]; });
  var ANIMAL_OF = {};
  ANIMALS.forEach(function (a) { ANIMAL_OF[HOME_OF[a]] = a; });
  var THINGS = ['umbrella', 'balloon', 'car', 'kite', 'cup', 'boot'];

  // ---------------------------------------------------------------- names
  // Vietnamese names carry their classifier ("con chó", "cái ô", "quả bóng bay"), as a kindergarten teacher says them.
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink',
        brown: 'brown', white: 'white', cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
        rectangle: 'rectangle', oval: 'oval', diamond: 'diamond' },
      size: { big: 'big', small: 'little', little: 'little' },
      animal: { dog: 'dog', cat: 'cat', bird: 'bird', fish: 'fish', bee: 'bee', rabbit: 'bunny', duck: 'duck',
        hen: 'hen', spider: 'spider' },
      home: { kennel: 'kennel', basket: 'basket', nest: 'nest', bowl: 'fish bowl', hive: 'beehive', hutch: 'hutch',
        pond: 'pond', coop: 'hen house', web: 'web' },
      thing: { umbrella: 'umbrella', balloon: 'balloon', car: 'car', kite: 'kite', cup: 'cup', boot: 'boot' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', pink: 'màu hồng', brown: 'màu nâu', white: 'màu trắng', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
        heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', oval: 'hình bầu dục',
        diamond: 'hình thoi' },
      size: { big: 'to', small: 'nhỏ', little: 'nhỏ' },
      animal: { dog: 'con chó', cat: 'con mèo', bird: 'con chim', fish: 'con cá', bee: 'con ong', rabbit: 'con thỏ',
        duck: 'con vịt', hen: 'con gà', spider: 'con nhện' },
      home: { kennel: 'nhà chó', basket: 'cái giỏ', nest: 'tổ chim', bowl: 'bể cá', hive: 'tổ ong', hutch: 'chuồng thỏ',
        pond: 'cái ao', coop: 'chuồng gà', web: 'mạng nhện' },
      thing: { umbrella: 'cái ô', balloon: 'quả bóng bay', car: 'chiếc ô tô', kite: 'con diều', cup: 'cái cốc',
        boot: 'chiếc ủng' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  var PLURAL_EN = {
    shape: { circle: 'circles', square: 'squares', triangle: 'triangles', star: 'stars', heart: 'hearts',
      rect: 'rectangles', rectangle: 'rectangles', oval: 'ovals', diamond: 'diamonds' },
    animal: { dog: 'dogs', cat: 'cats', bird: 'birds', fish: 'fish', bee: 'bees', rabbit: 'bunnies', duck: 'ducks',
      hen: 'hens', spider: 'spiders' },
    thing: { umbrella: 'umbrellas', balloon: 'balloons', car: 'cars', kite: 'kites', cup: 'cups', boot: 'boots' }
  };
  // The dots on count windows are round coloured lights. Spoken as "dots" / "chấm tròn" (what preschool worksheets say).
  var DOT = { en: ['dot', 'dots'], vi: ['chấm tròn', 'chấm tròn'] };

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
  // Vietnamese letters, phonics names as taught in kindergarten / grade 1 ("âm"), used for speech.
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
        pink: ['pink', 'pinks', 'pinky'], brown: ['brown'], white: ['white'], cream: ['white', 'cream'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles', 'ball'], square: ['square', 'box', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'egg'],
        diamond: ['diamond'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['little', 'small', 'tiny', 'smaller', 'baby'],
        little: ['little', 'small', 'tiny', 'smaller', 'baby'] },
      animal: {
        dog: ['dog', 'doggy', 'doggie', 'puppy', 'pup', 'dogs'],
        cat: ['cat', 'kitty', 'kitten', 'cats', 'kitty cat'],
        bird: ['bird', 'birdie', 'birds', 'songbird', 'little bird'],
        fish: ['fish', 'fishy', 'goldfish', 'fishes', 'fishie'],
        bee: ['bee', 'bees', 'honey bee', 'bumblebee', 'bumble bee'],
        rabbit: ['bunny', 'rabbit', 'bunnies', 'bunny rabbit', 'rabbits'],
        duck: ['duck', 'duckling', 'ducky', 'duckie', 'ducks'],
        hen: ['hen', 'chicken', 'chick', 'hens', 'chickens'],
        spider: ['spider', 'spiders', 'spidery', 'itsy bitsy spider'] },
      home: {
        kennel: ['kennel', 'dog house', 'doghouse', 'dog kennel', 'puppy house'],
        basket: ['basket', 'cat basket', 'cat bed', 'kitty bed'],
        nest: ['nest', 'bird nest', 'birds nest', 'birdie nest'],
        bowl: ['fish bowl', 'fishbowl', 'bowl', 'fish tank', 'aquarium', 'tank'],
        hive: ['beehive', 'bee hive', 'hive', 'bee house'],
        hutch: ['hutch', 'rabbit hutch', 'bunny house', 'rabbit house', 'bunny hutch'],
        pond: ['pond', 'duck pond', 'lake', 'pool'],
        coop: ['hen house', 'henhouse', 'coop', 'chicken coop', 'chicken house'],
        web: ['web', 'spider web', 'spiderweb', 'cobweb', 'spider’s web'] },
      thing: { umbrella: ['umbrella', 'brolly', 'umbrellas'], balloon: ['balloon', 'balloons', 'baloon'],
        car: ['car', 'cars', 'auto'], kite: ['kite', 'kites'], cup: ['cup', 'mug', 'cups'], boot: ['boot', 'boots', 'rain boot', 'welly'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng', 'hồng hồng'], brown: ['nâu', 'màu nâu'],
        white: ['trắng', 'màu trắng'], cream: ['trắng', 'màu trắng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], rectangle: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'],
        diamond: ['hình thoi', 'thoi'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'],
        little: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: {
        dog: ['con chó', 'chó', 'cún', 'con cún', 'chó con', 'cún con'],
        cat: ['con mèo', 'mèo', 'mèo con', 'chú mèo', 'mèo meo'],
        bird: ['con chim', 'chim', 'chim non', 'chim sẻ', 'chú chim'],
        fish: ['con cá', 'cá', 'cá vàng', 'cá con'],
        bee: ['con ong', 'ong', 'ong mật', 'chú ong'],
        rabbit: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng'],
        duck: ['con vịt', 'vịt', 'vịt con', 'vịt vàng'],
        hen: ['con gà', 'gà', 'gà mái', 'gà con', 'con gà mái'],
        spider: ['con nhện', 'nhện', 'nhện con', 'chú nhện'] },
      // bare "tổ" / "chuồng" / "nhà" are deliberately missing: they fit several homes
      home: {
        kennel: ['nhà chó', 'nhà cún', 'chuồng chó', 'nhà của chó'],
        basket: ['cái giỏ', 'giỏ', 'giỏ mèo', 'ổ mèo', 'cái rổ'],
        nest: ['tổ chim', 'cái tổ chim', 'tổ của chim'],
        bowl: ['bể cá', 'bể', 'bình cá', 'hồ cá', 'chậu cá'],
        hive: ['tổ ong', 'nhà ong', 'tổ của ong'],
        hutch: ['chuồng thỏ', 'nhà thỏ', 'chuồng của thỏ'],
        pond: ['cái ao', 'ao', 'ao nước', 'hồ nước'],
        coop: ['chuồng gà', 'nhà gà', 'chuồng của gà'],
        web: ['mạng nhện', 'lưới nhện', 'tơ nhện'] },
      thing: { umbrella: ['cái ô', 'ô', 'cái dù', 'dù'], balloon: ['quả bóng bay', 'bóng bay', 'bong bóng', 'trái bong bóng'],
        car: ['chiếc ô tô', 'ô tô', 'xe ô tô', 'xe hơi', 'cái xe'], kite: ['con diều', 'diều', 'cánh diều'],
        cup: ['cái cốc', 'cốc', 'cái ly', 'ly', 'cái tách'], boot: ['chiếc ủng', 'ủng', 'đôi ủng', 'giày ủng'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default GW.WORDS (DESIGN §6.1) — word lists for the 'initial' topic. content.js loads later and may replace it.
  // vi: chó (ch), chim (ch), thỏ (th), nhện (nh) are skipped — Vietnamese phonics teaches ch / th / nh as their own sounds.
  var WORD_LIST = {
    en: [['dog', 'animal_dog', 'D'], ['cat', 'animal_cat', 'C'], ['bird', 'animal_bird', 'B'], ['fish', 'animal_fish', 'F'],
      ['bee', 'animal_bee', 'B'], ['rabbit', 'animal_rabbit', 'R'], ['duck', 'animal_duck', 'D'], ['hen', 'animal_hen', 'H'],
      ['spider', 'animal_spider', 'S']],
    vi: [['mèo', 'animal_cat', 'M'], ['cá', 'animal_fish', 'C'], ['ong', 'animal_bee', 'O'], ['vịt', 'animal_duck', 'V'],
      ['gà', 'animal_hen', 'G']]
  };
  if (!GW.WORDS) {
    GW.WORDS = {};
    LANGS.forEach(function (l) {
      GW.WORDS[l] = WORD_LIST[l].map(function (w) { return { word: w[0], sprite: w[1], initial: w[2], animal: w[1].slice(7) }; });
    });
  }
  function spriteOfWord(lang, w) {        // looks in content's GW.WORDS first, then the default list
    var cur = GW.WORDS && GW.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].word === w) return cur[i].sprite || null;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][0] === w) return WORD_LIST[lang][i][1];
    return null;
  }
  function wordOfSprite(lang, spr) {
    var cur = GW.WORDS && GW.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].sprite === spr) return cur[i].word;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][1] === spr) return WORD_LIST[lang][i][0];
    return null;
  }
  function animalOf(v) {                  // 'dog' | 'animal_dog' | {kind:'animal', value:'dog'} → 'dog' | null
    if (v && typeof v === 'object') v = v.value != null ? v.value : v.sprite;
    if (v == null) return null;
    var s = String(v).replace(/^animal_/, '').replace(/\.svg$/, '');
    if (s === 'bunny') s = 'rabbit';
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function homeOf(v) {                    // 'kennel' | 'home_kennel' | {value:'kennel'} → 'kennel' | null
    if (v && typeof v === 'object') v = v.value != null ? v.value : v.sprite;
    if (v == null) return null;
    var s = String(v).replace(/^home_/, '').replace(/\.svg$/, '');
    return HOMES.indexOf(s) >= 0 ? s : null;
  }
  function thingOf(v) {
    if (v == null) return null;
    var s = String(v).replace(/^thing_/, '');
    return THINGS.indexOf(s) >= 0 ? s : null;
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'homes', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'shape', 'size', 'animal', 'home', 'thing', 'number', 'dots', 'letter', 'text', 'sum', 'diff',
    'parity', 'word'];
  var CRITTERS = ['pigeon', 'bus', 'balloon'];

  var STR = {
    en: {
      'ui.title': 'Gigi’s Peekaboo Windows',
      'ui.logo1': 'Gigi’s',
      'ui.logo2': 'Peekaboo Windows',
      'ui.subtitle': 'Open the windows and find the pairs with Gigi!',
      'ui.tagline': 'Open the windows and find the pairs with Gigi!',
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
      'ui.voice': 'Gigi’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Gigi. Let’s peek in the windows!', 'Hi! I am Gigi. Let’s peek in the windows!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Gigi is listening…',
      'ui.tapGigi': 'Tap Gigi to hear it again',
      'ui.tapDee': 'Tap Gigi to hear it again',
      'ui.skip': 'Skip',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Pairs',
      'topic.size': 'Big and Little',
      'topic.shapes': 'Shape Pairs',
      'topic.count': 'Counting Dots',
      'topic.animals': 'Animal Friends',
      'topic.homes': 'Animal Homes',
      'topic.letters': 'Letter Pairs',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': ['What a sunny day!', 'Hello, sunshine! The street is bright!'],
      'weather.1': ['Whoosh — it’s windy!', 'A breezy day! Look at the kites!'],
      'weather.2': ['Pitter-patter, rain!', 'Rain! The windows are cosy.'],
      'weather.3': ['Look — a rainbow!', 'A rainbow over the street!'],

      'p.any': ['Find two windows that match!', 'Which two windows are the same?', 'Let’s find the matching pairs!'],
      'p.colors': ['Find the colour pairs!', 'Find two things of the same colour!', 'Which colours go together?'],
      'p.size': ['Find the big one and the little one!', 'Match each big animal with its little one!', 'Big and little friends go together!'],
      'p.shapes': ['Find the shape pairs!', 'Find two windows with the same shape!', 'Which shapes go together?'],
      'p.count': ['Match the number with the dots!', 'Count the dots and find the number!', 'Which number goes with the dots?'],
      'p.animals': ['Find two of each animal!', 'Find the animal friends that match!', 'Every animal has a twin. Find them!'],
      'p.homes': ['Who lives where? Find each animal’s home!', 'Find each animal and its home!', 'Every animal has a home. Let’s find them!'],
      'p.letters': ['Find the letter pairs!', 'Find two windows with the same letter!', 'Which letters are the same?'],
      'p.lower': ['Match each big letter with its small letter!', 'Find the big and small letter pairs!', 'Every big letter has a small friend!'],
      'p.initial': ['Match each letter with an animal that starts with it!', 'Which animal starts with this letter?', 'Find the letter and its animal!'],
      'p.add': ['Match each sum with its answer!', 'Add them up and find the answer!', 'Which number is the answer?'],
      'p.sub': ['Match each take-away with its answer!', 'Take away and find the answer!', 'How many are left? Find the pair!'],
      'p.oddeven': ['Match the number with the dots! Odd or even?', 'Count the dots and find the number!', 'Find the number pairs! Odd or even?'],

      // surprises (one round per chapter) — tap is always fun, never a mistake
      'critter.pigeon': ['Look! A pigeon on the window sill!', 'Coo coo! A pigeon came to visit!'],
      'critter.pigeon.tap': ['Coo coo! Bye bye, pigeon!', 'Flap, flap! Off it flies!'],
      'critter.bus': ['Beep beep! Here comes the little bus!', 'Look! A little bus is driving by!'],
      'critter.bus.tap': ['Beep beep! Everyone is waving!', 'Beep beep! Hello, little bus!'],
      'critter.balloon': ['Look! A balloon is floating up!', 'Up, up, up goes the balloon!'],
      'critter.balloon.tap': ['Whee! Look at it twirl!', 'Twirl and sparkle! Whee!'],
      'surprise.pigeon': ['Look! A pigeon on the window sill!', 'Coo coo! A pigeon came to visit!'],
      'surprise.bus': ['Beep beep! Here comes the little bus!', 'Look! A little bus is driving by!'],
      'surprise.balloon': ['Look! A balloon is floating up!', 'Up, up, up goes the balloon!'],
      // legacy surprise keys from Dee's game (main.js still knows them); kept short and neutral
      'surprise.shuffle': ['Watch the windows carefully!', 'Keep your eyes on the windows!'],
      'surprise.golden': ['One pair is extra sparkly! Can you find it?', 'Psst! A sparkly pair is hiding here!'],
      'surprise.pond': ['Look at all the windows!', 'So many windows! Let’s peek!'],
      'golden': ['Sparkles! You found the sparkly pair!', 'Wow, the sparkly pair! Look at it shine!'],
      'peek': ['Look carefully!', 'Look in all the windows!', 'Remember what is inside!', 'Peekaboo! Look closely!',
        'Watch carefully, {child}!'],
      'hide': ['Now they hide!', 'Shutters closed! Your turn!', 'Now find the pairs!', 'Peekaboo! Where did they go?',
        'They are hiding. Open two windows!'],

      'flip.color': ['{name}!', 'It is {name}!'],
      'flip.thing': ['A {color} {thing}!', 'Look, a {color} {thing}!'],
      'flip.shape': 'A {name}!',
      'flip.shapeColor': 'A {color} {shape}!',
      'flip.animal': ['A {name}!', 'Hello, {name}!'],
      'flip.home': ['The {name}!', 'Look, a {name}!'],
      'flip.number': ['{num}!', 'Number {num}!'],
      'flip.letter': ['The letter {letter}!', 'Letter {letter}!'],
      'flip.capital': 'Big letter {letter}!',
      'flip.small': 'Small letter {lower}!',
      'flip.expr': '{expr}!',
      'flip.word': '{word}!',

      'match.color': ['{name} and {name}! A pair!', 'Both {name}! A pair!'],
      'match.thing': ['Two {color} {things} — a pair!', 'Two {color} {things}! Hooray!'],
      'match.colorMix': ['{A} and {B} — both {color}!', 'Both {color}! {A} and {B}!'],
      'match.shape': ['Two {plural}! A pair!', 'Two {plural}! They match!'],
      'match.animal': ['Two {plural}! A pair!', 'Two {plural}! Hooray!'],
      'match.home': ['The {animal} lives in the {home}!', 'Yes! The {animal} lives in the {home}!'],
      'match.size': ['A big {beast} and a little {beast}! A pair!'],
      'match.count': ['{num} and {num} {dots}! A match!', '{num} — {counted}! A pair!'],
      'match.number': ['{num} and {num}! A pair!'],
      'match.oddeven': ['{num} and {num} {dots}! {num} is {parity}!', '{num} is {parity}! A pair!'],
      'match.letter': ['Letter {letter} and letter {letter}! A pair!'],
      'match.lower': ['Big letter {letter} and small letter {lower}! A pair!'],
      'match.initial': ['{word} starts with the letter {letter}! A pair!'],
      'match.math': ['{expr} is {num}! A match!', 'Yes! {expr} makes {num}!'],
      'match.any': ['A pair!', 'A match! Hooray!', 'You found a pair!', 'They match!', 'Two the same! Yay!'],

      'mismatch.two': ['{A} and {B}. Let’s look again!', '{A} and {B}. Let’s remember them!',
        '{A} and {B}! Try two more windows!'],
      'mismatch.home': ['{A} and {B}. Where does the {animal} live?', '{A} and {B}. Let’s find the {animal}’s home!'],
      'wrong': ['Let’s look again!', 'Almost! Try two more!', 'Let’s remember those two!', 'Hmm, try another window!',
        'So close! One more try!', 'Let’s think again!', 'Keep trying, you can do it!'],
      'miss': ['Tap a window!', 'The windows are up here!', 'Try a window!', 'Touch a window to open it!', 'Open a window!'],

      'reward.star': ['A twinkly star!', 'Look, a little star!'],
      'reward.light': ['The lights are on!', 'Look, the windows glow!'],
      'reward.bloom': ['Flowers! Pop, pop!', 'Look, the flowers bloom!'],
      'say.countDone': '{num}! {num} {dots}!',

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'You found all the pairs!',
        'Super finding!', 'Hooray! All pairs found!', 'You are so clever!'],
      'cheer': ['The whole building is shining!', 'Hooray! Every window is lit!', 'What a bright building, {child}!',
        'Look, confetti! You found them all!', 'The building is cheering for you!'],
      'walk': ['Let’s go to the next building!', 'Clip-clop! Off we go!', 'Trot, trot! A new building!',
        'Come on, {child}! Next building!', 'Down the street we go!'],
      'hint': ['Psst! Look at the glowing windows!', 'Here is a clue! Peek at these two!', 'Gigi will help! Look here!',
        'Look! These shutters are peeking open!', 'Try the sparkly windows!'],
      'idle': ['Tap a window to open it!', 'Want to play? Tap a window!', 'Gigi is waiting! Your turn!',
        'The windows are waiting for you!', 'Let’s find a pair! Tap one!', 'I am here, {child}! Let’s play!'],

      'talk.intro': 'Talk time! Gigi has a question.',
      'talk.colors': 'What colour is this {thing}?',
      'talk.colorsAny': 'What colour is this?',
      'talk.size': 'Is it big or little?',
      'talk.shapes': 'What shape is this?',
      'talk.count': 'How many dots?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Which animal is this?',
      'talk.homes': 'Where does the {animal} live?',
      'talk.homesAny': 'Which home is this?',
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
      'talk.wrong.animal': 'It is the {answer}! Good try!',
      'talk.wrong.home': 'The {animal} lives in the {home}! Good try!',
      'talk.wrong.size': 'It is {answer}! Good try!',
      'talk.wrong.letter': 'It is the letter {letter}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',

      'session.done': ['You did it all! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'The whole street is shining! {stars} stars!']
    },
    vi: {
      'ui.title': 'Hươu Gigi Mở Cửa Sổ',
      'ui.logo1': 'Hươu Gigi',
      'ui.logo2': 'Mở Cửa Sổ',
      'ui.subtitle': 'Cùng hươu Gigi mở cửa sổ, tìm đôi giống nhau nhé!',
      'ui.tagline': 'Cùng hươu Gigi mở cửa sổ, tìm đôi giống nhau nhé!',
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
      'ui.voice': 'Giọng của Gigi',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là hươu cao cổ Gigi. Mình cùng mở cửa sổ nhé!',
        'Chào bé! Mình là hươu cao cổ Gigi. Mình cùng mở cửa sổ nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Gigi đang nghe…',
      'ui.tapGigi': 'Chạm vào Gigi để nghe lại nhé',
      'ui.tapDee': 'Chạm vào Gigi để nghe lại nhé',
      'ui.skip': 'Bỏ qua',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Cặp màu sắc',
      'topic.size': 'To và nhỏ',
      'topic.shapes': 'Cặp hình khối',
      'topic.count': 'Đếm chấm tròn',
      'topic.animals': 'Bạn thú',
      'topic.homes': 'Nhà của các con vật',
      'topic.letters': 'Cặp chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': ['Trời nắng đẹp quá!', 'Chào ông mặt trời! Phố sáng bừng nè!'],
      'weather.1': ['Vù vù — gió thổi rồi!', 'Trời có gió! Bé nhìn diều bay kìa!'],
      'weather.2': ['Tí tách, trời mưa rồi!', 'Mưa rồi! Cửa sổ ấm áp ghê.'],
      'weather.3': ['Nhìn kìa — cầu vồng!', 'Cầu vồng trên phố kìa!'],

      'p.any': ['Bé ơi, tìm hai cửa sổ giống nhau nhé!', 'Hai cửa sổ nào giống nhau nhỉ?', 'Mình cùng tìm các đôi giống nhau nào!'],
      'p.colors': ['Bé ơi, tìm hai đồ vật cùng màu nhé!', 'Bé tìm hai cửa sổ cùng màu nhé!', 'Màu nào đi cùng màu nào nhỉ?'],
      'p.size': ['Bé ơi, tìm bạn to và bạn nhỏ nhé!', 'Bé ghép bạn thú to với bạn nhỏ nhé!', 'Bạn to tìm bạn nhỏ nào!'],
      'p.shapes': ['Bé ơi, tìm hai cửa sổ cùng hình nhé!', 'Bé tìm hai hình giống nhau nhé!', 'Hình nào đi cùng hình nào nhỉ?'],
      'p.count': ['Bé ơi, ghép số với chấm tròn nhé!', 'Bé đếm chấm tròn rồi tìm số nhé!', 'Số nào đi với các chấm tròn nhỉ?'],
      'p.animals': ['Bé ơi, tìm hai bạn thú giống nhau nhé!', 'Bé tìm các bạn thú sinh đôi nhé!', 'Bạn thú nào giống nhau nhỉ?'],
      'p.homes': ['Ai sống ở đâu? Bé tìm nhà cho các bạn nhé!', 'Bé ghép con vật với ngôi nhà của nó nhé!',
        'Con vật nào sống ở đâu nhỉ? Bé tìm nào!'],
      'p.letters': ['Bé ơi, tìm hai chữ cái giống nhau nhé!', 'Bé tìm hai cửa sổ cùng chữ nhé!', 'Chữ nào giống chữ nào nhỉ?'],
      'p.lower': ['Bé ơi, ghép chữ hoa với chữ thường nhé!', 'Bé tìm cặp chữ hoa, chữ thường nhé!', 'Chữ hoa nào đi với chữ thường nào?'],
      'p.initial': ['Bé ghép chữ cái với tên con vật nhé!', 'Con vật nào bắt đầu bằng chữ này?', 'Bé tìm chữ cái và con vật nhé!'],
      'p.add': ['Bé ơi, ghép phép cộng với đáp số nhé!', 'Bé cộng lại rồi tìm đáp số nhé!', 'Đáp số là số nào nhỉ?'],
      'p.sub': ['Bé ơi, ghép phép trừ với đáp số nhé!', 'Bé bớt đi rồi tìm đáp số nhé!', 'Còn lại mấy nhỉ? Bé tìm đôi nhé!'],
      'p.oddeven': ['Bé ghép số với chấm tròn! Chẵn hay lẻ nhỉ?', 'Bé đếm chấm tròn rồi tìm số nhé!', 'Bé tìm đôi số nhé! Chẵn hay lẻ?'],

      'critter.pigeon': ['Nhìn kìa! Bạn bồ câu đậu trên bậu cửa sổ!', 'Gù gù! Bạn bồ câu đến chơi nè!'],
      'critter.pigeon.tap': ['Gù gù! Tạm biệt bồ câu nhé!', 'Phành phạch! Bồ câu bay đi rồi!'],
      'critter.bus': ['Bíp bíp! Xe buýt nhỏ đến rồi!', 'Nhìn kìa! Xe buýt nhỏ chạy qua nè!'],
      'critter.bus.tap': ['Bíp bíp! Mọi người vẫy tay chào bé!', 'Bíp bíp! Chào xe buýt nhỏ!'],
      'critter.balloon': ['Nhìn kìa! Quả bóng bay đang bay lên!', 'Bóng bay bay lên cao, cao nữa!'],
      'critter.balloon.tap': ['Ui! Bóng bay xoay tròn lấp lánh!', 'Vèo! Bóng bay bay lên trời rồi!'],
      'surprise.pigeon': ['Nhìn kìa! Bạn bồ câu đậu trên bậu cửa sổ!', 'Gù gù! Bạn bồ câu đến chơi nè!'],
      'surprise.bus': ['Bíp bíp! Xe buýt nhỏ đến rồi!', 'Nhìn kìa! Xe buýt nhỏ chạy qua nè!'],
      'surprise.balloon': ['Nhìn kìa! Quả bóng bay đang bay lên!', 'Bóng bay bay lên cao, cao nữa!'],
      'surprise.shuffle': ['Bé nhìn kỹ các cửa sổ nhé!', 'Bé để ý các cửa sổ nhé!'],
      'surprise.golden': ['Có một đôi lấp lánh! Bé tìm được không?', 'Suỵt! Một đôi lấp lánh đang trốn đây nè!'],
      'surprise.pond': ['Bé nhìn các cửa sổ nè!', 'Nhiều cửa sổ quá! Mình ngó vào nhé!'],
      'golden': ['Lấp lánh quá! Bé tìm được đôi lấp lánh rồi!', 'Oa, đôi lấp lánh! Sáng quá kìa!'],
      'peek': ['Bé nhìn kỹ nhé!', 'Bé nhớ trong cửa sổ có gì nhé!', 'Nhìn kỹ nào bé ơi!', 'Ú òa! Bé nhìn kỹ nào!',
        'Bé {child} nhìn kỹ nhé!'],
      'hide': ['Giờ chúng trốn rồi!', 'Đóng cửa rồi! Đến lượt bé nhé!', 'Bé tìm các đôi giống nhau nhé!',
        'Ú òa! Chúng trốn đâu rồi nhỉ?', 'Trốn hết rồi! Bé mở hai cửa sổ nhé!'],

      'flip.color': ['{name}!', '{name} nè!'],
      'flip.thing': ['{thing} {color}!', '{thing} {color} nè!'],
      'flip.shape': '{name}!',
      'flip.shapeColor': '{shape} {color}!',
      'flip.animal': ['{name}!', '{name} nè!'],
      'flip.home': ['{name}!', '{name} nè!'],
      'flip.number': ['Số {num}!'],
      'flip.letter': ['Chữ {letter}!'],
      'flip.capital': 'Chữ {letter} in hoa!',
      'flip.small': 'Chữ {lower} viết thường!',
      'flip.expr': '{expr}!',
      'flip.word': ['{word}!', '{word} nè!'],

      'match.color': ['{name} và {name}! Một đôi rồi!', 'Cùng {name}! Một đôi rồi!'],
      'match.thing': ['Hai {thing} {color} — một đôi!', 'Hai {thing} {color}! Giỏi quá!'],
      'match.colorMix': ['{A} và {B} — cùng {color}!', 'Cùng {color}! {A} và {B}!'],
      'match.shape': ['Hai {name}! Một đôi rồi!', 'Hai {name} giống nhau! Giỏi quá!'],
      'match.animal': ['Hai {name}! Một đôi rồi!', 'Hai {name} giống nhau! Giỏi quá!'],
      'match.home': ['{animal} sống trong {home}!', '{animal} về {home} rồi! Hoan hô!'],
      'match.size': ['{beast} to và {beast} nhỏ! Một đôi rồi!'],
      'match.count': ['Số {num} và {num} {dots}! Đúng một đôi!', '{num} — {counted}! Một đôi rồi!'],
      'match.number': ['Số {num} và số {num}! Một đôi rồi!'],
      'match.oddeven': ['Số {num} và {num} {dots}! {num} là số {parity}!', '{num} là số {parity}! Một đôi rồi!'],
      'match.letter': ['Chữ {letter} và chữ {letter}! Một cặp rồi!'],
      'match.lower': ['Chữ {letter} in hoa và chữ {lower} thường! Một cặp rồi!'],
      'match.initial': ['{word} bắt đầu bằng chữ {letter}! Một đôi rồi!'],
      'match.math': ['{expr} bằng {num}! Đúng rồi!', 'Đúng rồi! {expr} bằng {num}!'],
      'match.any': ['Một đôi rồi!', 'Giống nhau rồi! Hoan hô!', 'Bé tìm được một đôi!', 'Đúng một đôi rồi!',
        'Hai cửa sổ giống nhau! Giỏi quá!'],

      'mismatch.two': ['{A} và {B}. Mình xem lại nhé!', '{A} và {B}. Bé nhớ kỹ nhé!',
        '{A} và {B}! Bé thử tiếp nào!'],
      'mismatch.home': ['{A} và {B}. {animal} sống ở đâu nhỉ?', '{A} và {B}. Mình tìm nhà cho {animal} nhé!'],
      'wrong': ['Mình xem lại nhé!', 'Gần đúng rồi! Thử lại nào!', 'Bé nhớ hai cửa sổ đó nhé!', 'Hì, bé thử cửa sổ khác nào!',
        'Suýt nữa thôi! Thử tiếp nhé!', 'Không sao đâu, thử lại nhé!', 'Bé nghĩ thêm chút nữa nhé!'],
      'miss': ['Bé chạm vào một cửa sổ nhé!', 'Các cửa sổ ở trên này nè!', 'Bé thử mở một cửa sổ nào!',
        'Chạm vào cửa sổ để mở nhé!', 'Mở một cửa sổ nào bé ơi!'],

      'reward.star': ['Ngôi sao lấp lánh!', 'Nhìn kìa, một ngôi sao nhỏ!'],
      'reward.light': ['Đèn sáng rồi!', 'Nhìn kìa, cửa sổ sáng đèn!'],
      'reward.bloom': ['Hoa nở rồi! Bụp bụp!', 'Nhìn kìa, hoa nở rồi!'],
      'say.countDone': '{num}! {num} {dots}!',

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Bé tìm được hết các đôi rồi!',
        'Bé tìm giỏi quá!', 'Hoan hô, tìm hết rồi!', 'Bé thông minh quá!'],
      'cheer': ['Cả ngôi nhà sáng rực rồi!', 'Hoan hô! Cửa sổ nào cũng sáng đèn!', 'Ngôi nhà sáng rực rồi, {child} giỏi quá!',
        'Pháo giấy nè! Bé tìm hết rồi!', 'Ngôi nhà đang reo hò cho bé đó!'],
      'walk': ['Mình sang ngôi nhà tiếp theo nhé!', 'Lóc cóc! Mình đi tiếp nào!', 'Lộc cộc, lộc cộc! Nhà mới kìa!',
        'Bé {child} ơi, mình sang nhà mới nhé!', 'Mình đi dọc con phố nào!'],
      'hint': ['Nhìn nè! Hai cửa sổ này đang sáng.', 'Bé thử hai cửa sổ lấp lánh nhé!', 'Gigi gợi ý nè: nhìn hai cửa sổ này!',
        'Gigi giúp bé nhé, nhìn đây!', 'Cửa sổ đang hé mở đó bé!'],
      'idle': ['Bé ơi, mở cửa sổ tiếp nào!', 'Bé chạm vào một cửa sổ nhé!', 'Gigi đang chờ bé nè!', 'Đến lượt bé rồi đó!',
        'Bé {child} ơi, mình chơi tiếp nhé!', 'Các cửa sổ đang chờ bé nè!'],

      'talk.intro': 'Giờ trò chuyện! Gigi hỏi bé nhé.',
      'talk.colors': '{thing} này màu gì nhỉ?',
      'talk.colorsAny': 'Cái này màu gì nhỉ?',
      'talk.size': 'Bạn này to hay nhỏ nhỉ?',
      'talk.shapes': 'Đây là hình gì nhỉ?',
      'talk.count': 'Có mấy chấm tròn nào?',
      'talk.animals': '{animal} đâu rồi nhỉ?',
      'talk.animalsAny': 'Đây là con gì nhỉ?',
      'talk.homes': '{animal} sống ở đâu nhỉ?',
      'talk.homesAny': 'Đây là nhà của ai nhỉ?',
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
      'talk.wrong.animal': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.home': '{animal} sống trong {home} đó! Bé cố gắng lắm!',
      'talk.wrong.size': 'Bạn này {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Bé làm xong hết rồi! {stars} ngôi sao! Hoan hô!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Cả con phố sáng đèn rồi! {stars} ngôi sao!']
    }
  };

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'talk.animals': ['animal'], 'talk.homes': ['animal'], 'talk.colors': ['thing'], 'say.countDone': ['num'],
    'flip.color': ['name'], 'flip.thing': ['color', 'thing'], 'flip.shape': ['name'], 'flip.shapeColor': ['shape', 'color'],
    'flip.animal': ['name'], 'flip.home': ['name'],
    'flip.number': ['num'], 'flip.letter': ['letter'], 'flip.capital': ['letter'], 'flip.small': ['lower'],
    'flip.expr': ['expr'], 'flip.word': ['word'],
    'match.color': ['name'], 'match.thing': ['color', 'thing', 'things'], 'match.colorMix': ['A', 'B', 'color'],
    'match.shape': ['name', 'plural'], 'match.animal': ['name', 'plural'], 'match.home': ['animal', 'home'],
    'match.size': ['beast'], 'match.count': ['num', 'dots', 'counted'], 'match.number': ['num'],
    'match.oddeven': ['num', 'dots', 'parity'], 'match.letter': ['letter'], 'match.lower': ['letter', 'lower'],
    'match.initial': ['word', 'letter'], 'match.math': ['expr', 'num'],
    'mismatch.two': ['A', 'B'], 'mismatch.home': ['A', 'B', 'animal'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.home': ['animal', 'home'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.number': ['answer'], 'talk.wrong.size': ['answer']
  };
  var FALLBACK = { 'talk.animals': 'talk.animalsAny', 'talk.homes': 'talk.homesAny', 'talk.colors': 'talk.colorsAny',
    'say.countDone': 'praise', 'mismatch.two': 'wrong', 'mismatch.home': 'mismatch.two', 'flip.shapeColor': 'flip.shape',
    'talk.wrong.home': 'talk.wrong.a' };
  ['flip.color', 'flip.thing', 'flip.shape', 'flip.animal', 'flip.home', 'flip.number', 'flip.letter', 'flip.capital',
    'flip.small', 'flip.expr', 'flip.word'].forEach(function (k) { FALLBACK[k] = 'praise'; });
  ['match.color', 'match.thing', 'match.colorMix', 'match.shape', 'match.animal', 'match.home', 'match.size', 'match.count',
    'match.number', 'match.oddeven', 'match.letter', 'match.lower', 'match.initial', 'match.math']
    .forEach(function (k) { FALLBACK[k] = 'match.any'; });
  ['talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.letter', 'talk.wrong.number', 'talk.wrong.size']
    .forEach(function (k) { FALLBACK[k] = 'wrong'; });

  var CHILD_FALLBACK = { en: 'friend', vi: 'bé' };
  // keys whose {child} variant is always used when a name is known
  var CHILD_PREFERRED = { 'ui.welcome': 1 };

  // ---------------------------------------------------------------- helpers
  function L(lang) { return lang === 'vi' ? 'vi' : 'en'; }
  function rnd(rng) {
    var v;
    if (rng && typeof rng.next === 'function') v = rng.next();
    else if (typeof rng === 'function') v = rng();
    else v = Math.random();
    v = +v;
    return isFinite(v) ? Math.max(0, Math.min(0.999999, v)) : 0;
  }
  function stripMarks(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
  }
  function capFirst(s) {
    return String(s).replace(/^(\s*[“"'(¡¿]*)(\p{Ll})/u, function (m, pre, ch) { return pre + ch.toUpperCase(); });
  }
  function upper(v) { return String(v).toUpperCase(); }
  function rawVal(v) { return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }
  function present(v) { return v != null && v !== '' && !(typeof v === 'object' && 'value' in v && (v.value == null || v.value === '')); }
  function num(v) {
    v = rawVal(v);
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    if (typeof v !== 'string' || !/^\s*-?\d+\s*$/.test(v)) return null;
    return parseInt(v, 10);
  }

  function numberName(lang, n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) return String(n);
    if (v >= 0 && v <= 20) return NUM[lang === 'vi' ? 'vi' : 'en'][v];
    return String(v);
  }
  function splitOp(value) { // '2+3' / '2 + 3' → ['2','+','3'];  '7−2' / '7-2' → ['7','−','2']
    var m = String(value == null ? '' : value).replace(/\s+/g, '').match(/^(\d+)([+−\-–])(\d+)(=.*)?$/);
    return m ? [m[1], m[2] === '+' ? '+' : '−', m[3]] : null;
  }
  function exprText(value) { var p = splitOp(value); return p ? p[0] + ' ' + p[1] + ' ' + p[2] : String(value); }
  function exprWords(lang, value) {
    var p = splitOp(value);
    if (!p) return String(value);
    var op = p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') : (lang === 'vi' ? 'trừ' : 'minus');
    return numberName(lang, p[0]) + ' ' + op + ' ' + numberName(lang, p[2]);
  }
  function exprAnswer(value) {
    var p = splitOp(value);
    if (!p) return null;
    return p[1] === '+' ? +p[0] + +p[2] : +p[0] - +p[2];
  }
  function dotWord(lang, n) { return DOT[lang][n === 1 ? 0 : 1]; }
  function counted(lang, n) {    // "one, two, three" (2 ≤ n ≤ 5) · otherwise "seven dots"
    if (n >= 2 && n <= 5) {
      var parts = [];
      for (var i = 1; i <= n; i++) parts.push(numberName(lang, i));
      return parts.join(', ');
    }
    return numberName(lang, n) + ' ' + dotWord(lang, n);
  }
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }

  function sizeOf(v) {                     // 'big' | 'small' | 'little' | 'dog_small' | 'small:dog' → 'big'|'small'|null
    var s = String(rawVal(v) == null ? '' : rawVal(v)).toLowerCase();
    if (/(^|[_:\-\s])big($|[_:\-\s])/.test(s) || s === 'large') return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  function animalIn(v) {                   // finds an animal id inside 'dog_small', 'animal_dog', 'small:dog'
    var a = animalOf(v);
    if (a) return a;
    var s = String(rawVal(v) == null ? '' : rawVal(v)).toLowerCase();
    var parts = s.split(/[_:\-\s]+/);
    for (var i = 0; i < parts.length; i++) { var b = animalOf(parts[i]); if (b) return b; }
    return null;
  }
  // colour + thing from 'red', 'red:umbrella', 'umbrella_red', {value:'red', obj:'umbrella'} → {color, thing}
  function colorThing(value, obj) {
    var out = { color: null, thing: thingOf(obj) };
    if (value && typeof value === 'object') {
      if (!out.thing) out.thing = thingOf(value.obj) || thingOf(value.thing);
      value = value.value != null ? value.value : value.color;
    }
    if (value == null) return out;
    var s = String(value);
    if (NAMES.en.color[s] != null) { out.color = s; return out; }
    var parts = s.toLowerCase().split(/[_:\-\s]+/);
    for (var i = 0; i < parts.length; i++) {
      if (!out.color && NAMES.en.color[parts[i]] != null) out.color = parts[i];
      else if (!out.thing && thingOf(parts[i])) out.thing = parts[i];
    }
    return out;
  }
  function thingPhrase(lang, thing, color) {      // "a red umbrella" / "cái ô màu đỏ"; no colour: "an umbrella" / "cái ô"
    if (lang === 'vi') return NAMES.vi.thing[thing] + (color ? ' ' + NAMES.vi.color[color] : '');
    return anFix('a ' + (color ? NAMES.en.color[color] + ' ' : '') + NAMES.en.thing[thing]);
  }

  function name(lang, kind, value) {
    lang = L(lang);
    var objVal = value;
    if (value && typeof value === 'object' && 'value' in value) value = value.value;
    var tbl;
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'dots': {
        var n = num(value);
        return n == null ? String(value) : numberName(lang, n) + ' ' + dotWord(lang, n);
      }
      case 'letter': {
        var s = String(value);
        if (lang === 'vi') return LETTER_VI[upper(s)] || s.toLowerCase();
        return s;
      }
      case 'sum': case 'diff': return exprWords(lang, value);
      case 'text': {
        var tx = String(value);
        if (splitOp(tx)) return exprWords(lang, tx);
        if (num(tx) != null) return numberName(lang, num(tx));
        if (isLetter(tx)) return name(lang, 'letter', tx);
        if (animalOf(tx)) return NAMES[lang].animal[animalOf(tx)];
        if (homeOf(tx)) return NAMES[lang].home[homeOf(tx)];
        return tx;
      }
      case 'word': {
        var w = String(value);
        if (/^animal_/.test(w)) return wordOfSprite(lang, w) || name(lang, 'animal', w.slice(7));   // a sprite id
        return w;
      }
      case 'animal': {
        var a = animalIn(value);
        return a ? NAMES[lang].animal[a] : String(value);
      }
      case 'home': {
        var h = homeOf(value);
        return h ? NAMES[lang].home[h] : String(value);
      }
      case 'thing': {
        var th = thingOf(value);
        return th ? NAMES[lang].thing[th] : String(value);
      }
      case 'color': {
        var ct = colorThing(objVal);
        if (ct.color && ct.thing) return thingPhrase(lang, ct.thing, ct.color);
        if (ct.color) return NAMES[lang].color[ct.color];
        if (ct.thing) return thingPhrase(lang, ct.thing, null);
        return String(value);
      }
      case 'size': {
        var sz = sizeOf(value), an = animalIn(value);
        if (sz && an) return lang === 'vi' ? NAMES.vi.animal[an] + ' ' + NAMES.vi.size[sz] : NAMES.en.size[sz] + ' ' + NAMES.en.animal[an];
        if (sz) return NAMES[lang].size[sz];
        return String(value);
      }
      case 'parity': {
        if (num(value) != null) return numberName(lang, num(value));
        tbl = NAMES[lang].parity;
        return tbl[value] != null ? tbl[value] : String(value);
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
    var objVal = value;
    if (value && typeof value === 'object' && 'value' in value) value = value.value;
    var out = [];
    switch (kind) {
      case 'number': return numberWords(lang, value);
      case 'dots': {
        var dn = num(value);
        out = numberWords(lang, value);
        if (dn != null) {
          var nw = numberName(lang, dn);
          addForms(out, [name(lang, 'dots', dn), dn + ' ' + dotWord(lang, dn)].concat(lang === 'vi' ?
            [nw + ' chấm', nw + ' đèn', nw + ' cái đèn'] : [nw + ' lights', nw + ' light', nw + ' circles']));
        }
        return out;
      }
      case 'parity': {
        if (num(value) != null) return numberWords(lang, num(value));
        break;
      }
      case 'text': {
        var tx = String(value);
        if (splitOp(tx)) return words(lang, 'sum', tx);
        if (num(tx) != null) return numberWords(lang, num(tx));
        if (isLetter(tx)) return words(lang, 'letter', tx);
        if (animalOf(tx)) return words(lang, 'animal', tx);
        if (homeOf(tx)) return words(lang, 'home', tx);
        return addForms(out, [tx]);
      }
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
        addForms(out, [exprWords(lang, value), p[0] + ' ' + (p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') :
          (lang === 'vi' ? 'trừ' : 'minus')) + ' ' + p[2]]);
        return out;
      }
      case 'word': {
        var w = name(lang, 'word', value);
        var list = [w];
        var spr = /^animal_/.test(String(value)) ? String(value) : spriteOfWord(lang, w);
        var a = animalOf(spr) || animalOf(w);
        if (a) list = list.concat([NAMES[lang].animal[a]], WORDS[lang].animal[a] || []);
        return addForms(out, list);
      }
      case 'animal': {
        var an = animalIn(value);
        if (!an) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].animal[an]].concat(WORDS[lang].animal[an] || []));
      }
      case 'home': {
        var h = homeOf(value);
        if (!h) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].home[h]].concat(WORDS[lang].home[h] || []));
      }
      case 'thing': {
        var th = thingOf(value);
        if (!th) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].thing[th]].concat(WORDS[lang].thing[th] || []));
      }
      case 'color': {
        var ct = colorThing(objVal);
        if (!ct.color) return addForms(out, [String(value)]);
        var cl = [NAMES[lang].color[ct.color]].concat(WORDS[lang].color[ct.color] || []);
        if (ct.thing) cl.push(name(lang, 'color', { value: ct.color, obj: ct.thing }).replace(/^an? /, ''));
        return addForms(out, cl);
      }
      case 'size': {
        var sz = sizeOf(value);
        if (!sz) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].size[sz]].concat(WORDS[lang].size[sz] || []));
      }
    }
    var nm = NAMES[lang][kind] && NAMES[lang][kind][value];
    var extra = WORDS[lang][kind] && WORDS[lang][kind][value];
    var l2 = [];
    if (nm) l2.push(nm);
    if (extra) l2 = l2.concat(extra);
    if (!l2.length) l2.push(String(value));
    return addForms(out, l2);
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  // Fill in the derived params ({letter}, {lower}, {word}, {expr}, {dots}, {num}, {counted}, {animal}, {thing}).
  function derive(lang, params) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    // {animal} from a bare animal id in {sound} / {sprite}
    if (!present(p.animal)) {
      var src0 = present(p.sound) ? animalOf(rawVal(p.sound)) : present(p.sprite) ? animalOf(rawVal(p.sprite)) : null;
      if (src0) p.animal = src0;
    }
    // {thing} from {obj} (colour talk: "What colour is this umbrella?")
    if (!present(p.thing) && present(p.obj) && thingOf(rawVal(p.obj))) p.thing = rawVal(p.obj);
    if (present(p.thing) && typeof p.thing !== 'object' && !thingOf(p.thing) && !/\s/.test(String(p.thing))) delete p.thing;
    // {letter} / {lower}
    if (!present(p.letter) && present(p.text) && isLetter(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    // {word} (initial topic): word | animal | sprite
    if (!present(p.word)) {
      var src = present(p.sprite) ? rawVal(p.sprite) : present(p.animal) ? rawVal(p.animal) : null;
      if (src != null) {
        var a = animalOf(src);
        if (a) p.word = wordOfSprite(lang, 'animal_' + a) || NAMES[lang].animal[a];
      }
    } else p.word = name(lang, 'word', rawVal(p.word));
    // {expr} ("2 + 3")
    if (!present(p.expr)) {
      var ex = present(p.text) && splitOp(rawVal(p.text)) ? rawVal(p.text) : present(p.sum) ? rawVal(p.sum) :
        present(p.diff) ? rawVal(p.diff) : null;
      if (ex == null && present(p.a) && present(p.b)) ex = rawVal(p.a) + (present(p.op) ? rawVal(p.op) : '+') + rawVal(p.b);
      if (ex != null) p.expr = exprText(ex);
    } else if (typeof p.expr !== 'string' || splitOp(p.expr)) p.expr = exprText(rawVal(p.expr));
    // {parity} may come as value
    if (!present(p.parity) && (rawVal(p.value) === 'odd' || rawVal(p.value) === 'even')) p.parity = rawVal(p.value);
    // {dots} + {num} + {counted} from n
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.dots)) p.dots = dotWord(lang, c === 1 ? 1 : 2);
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (!present(p.counted) && c != null) p.counted = counted(lang, c);
    return p;
  }

  function resolveParam(lang, key, val) {
    if (!present(val)) return '';
    if (typeof val === 'object' && val.kind) return name(lang, val.kind, val.value);
    if (typeof val === 'object') return '';
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity': case 'home': case 'thing':
        return name(lang, key, val);
      default: return String(val);
    }
  }

  // English "a orange" → "an orange", but never the LETTER A ("letter A and …"). No regex look-behind (iOS < 16.4).
  function anFix(s) {
    return String(s).replace(/(^|[\s"“(])([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, function (m, pre, a, off, str) {
      if (/letter\s*$/i.test(str.slice(0, off + pre.length))) return m;
      return pre + a + 'n ';
    });
  }

  function fill(lang, str, params, child) {
    if (!child) str = str.replace(/(bé|Bé) \{child\}/g, '$1').replace(/, \{child\}([!?.])/g, '$1');
    var out = str.replace(/\{(\w+)\}/g, function (m, k) {
      if (k === 'child') return child || CHILD_FALLBACK[lang];
      return resolveParam(lang, k, params ? params[k] : null);
    });
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();
    if (lang === 'en') out = anFix(out);
    out = out.replace(/([.!?—]\s+)(\p{Ll})/gu, function (m, pre, ch) {
      return pre.charAt(0) === '—' ? m : pre + ch.toUpperCase();
    });
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
    key = String(key == null ? '' : key);
    var p = derive(lang, params);
    if (STR[lang][key] == null && STR.en[key] == null && /^p\./.test(key)) key = 'p.any';
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
  I18N.sound = function () { return ''; };          // no "says …" questions in this game (kept for old callers)
  I18N.hasSound = function () { return false; };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.HOMES = HOMES.slice();
  I18N.HOME_OF = HOME_OF;
  I18N.THINGS = THINGS.slice();
  I18N.CRITTERS = CRITTERS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PARAMS = NEEDS;           // required params per key (for tests)
  I18N.NAME_TABLE = NAMES;       // read-only use (tests / UI)
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;

  // ---------------------------------------------------------------- windows → meaning
  // sem = { k: 'color'|'shape'|'animal'|'home'|'dots'|'number'|'letter'|'expr'|'word'|'parity'|null, … }
  function semOf(kind, value, face, ctx, size) {
    face = (face && typeof face === 'object') ? face : {};
    ctx = ctx || {};
    if (value && typeof value === 'object' && 'kind' in value && kind == null) { kind = value.kind; value = value.value; }
    else if (value && typeof value === 'object' && 'value' in value) value = value.value;
    if (kind == null) kind = face.kind;
    if (value == null || value === '') {
      value = face.value != null ? face.value : face.text != null ? face.text : face.n != null ? face.n :
        face.color != null && kind === 'color' ? face.color : face.shape != null && kind === 'shape' ? face.shape :
          face.sprite != null ? face.sprite : null;
    }
    var topic = ctx.topic || null;
    var scale = typeof face.scale === 'number' ? face.scale : null;
    var s = { k: null };
    switch (kind) {
      case 'color': case 'thing': {
        var ct = colorThing(value, face.obj || face.thing);
        if (!ct.color && face.color != null && NAMES.en.color[face.color] != null) ct.color = face.color;
        if (!ct.thing && kind === 'thing') ct.thing = thingOf(value);
        if (ct.color) { s = { k: 'color', color: ct.color }; if (ct.thing) s.thing = ct.thing; }
        else if (ct.thing) s = { k: 'color', color: null, thing: ct.thing };
        break;
      }
      case 'shape': {
        var sh = NAMES.en.shape[value] != null ? value : face.shape;
        if (sh != null && NAMES.en.shape[sh] != null) {
          s = { k: 'shape', shape: sh };
          if (face.color != null && NAMES.en.color[face.color] != null) s.color = face.color;
        }
        break;
      }
      case 'home': {
        var hm = homeOf(value) || homeOf(face.sprite) || homeOf(face.value);
        if (hm) s = { k: 'home', home: hm };
        break;
      }
      case 'size': case 'animal': {
        var an = animalIn(value) || animalIn(face.sprite) || animalIn(face.value) || (kind === 'size' ? animalIn(ctx.animal) : null);
        if (!an) { if (homeOf(value) || homeOf(face.sprite)) return semOf('home', value, face, ctx); break; }
        var sz = sizeOf(value) || sizeOf(size) || sizeOf(face.size) || null;
        if (!sz && scale != null && scale < 0.85) sz = 'small';
        if (!sz && (kind === 'size' || topic === 'size')) sz = scale != null && scale < 0.85 ? 'small' : 'big';
        s = { k: 'animal', animal: an };
        if (sz) s.size = sz;
        if (topic === 'initial' && !sz) { s = { k: 'word', animal: an }; }
        break;
      }
      case 'dots': {
        var dn = num(value); if (dn == null) dn = num(face.n);
        if (dn != null) s = { k: 'dots', n: dn };
        break;
      }
      case 'number': {
        var nn = num(value); if (nn == null) nn = num(face.n); if (nn == null) nn = num(face.text);
        if (nn != null) s = { k: 'number', n: nn };
        break;
      }
      case 'parity': {
        var pn = num(face.n); if (pn == null) pn = num(value); if (pn == null) pn = num(face.value); if (pn == null) pn = num(face.text);
        if (pn != null) s = { k: (face.dots || face.kind === 'dots' || face.show === 'dots') ? 'dots' : 'number', n: pn };
        else if (value === 'odd' || value === 'even') s = { k: 'parity', parity: value };
        if (s.n != null) s.parity = s.n % 2 ? 'odd' : 'even';
        break;
      }
      case 'letter': {
        var lt = isLetter(String(value)) ? String(value) : isLetter(String(face.text)) ? String(face.text) : null;
        if (lt) s = { k: 'letter', letter: lt, small: lt !== lt.toUpperCase(), capital: topic === 'lower' && lt === lt.toUpperCase() };
        break;
      }
      case 'sum': case 'diff': {
        var ex = splitOp(value) ? value : splitOp(face.text) ? face.text : null;
        if (ex != null) s = { k: 'expr', expr: String(ex) };
        else if (num(value) != null) s = { k: 'number', n: num(value) };
        break;
      }
      case 'text': {
        var tx = value != null ? String(value) : '';
        if (splitOp(tx)) s = { k: 'expr', expr: tx };
        else if (num(tx) != null) s = { k: 'number', n: num(tx) };
        else if (isLetter(tx)) return semOf('letter', tx, face, ctx);
        else if (animalIn(tx)) return semOf('animal', tx, face, ctx, size);
        else if (homeOf(tx)) return semOf('home', tx, face, ctx);
        else if (tx) s = { k: 'word', word: tx };
        break;
      }
      case 'word': {
        var wv = value != null ? String(value) : '';
        var wa = animalOf(wv) || animalOf(face.sprite) || animalOf(spriteOfWord(ctx.lang || 'en', wv)) ||
          animalOf(spriteOfWord('vi', wv)) || animalOf(spriteOfWord('en', wv));
        if (wa) { s = { k: 'word', animal: wa }; if (wv && !animalOf(wv) && !/^animal_/.test(wv)) s.word = wv; }
        else if (wv) s = { k: 'word', word: wv };
        break;
      }
      default: {
        // unknown kind: try the face, then a guess from the value
        if (face.kind && face.kind !== kind) return semOf(face.kind, null, face, ctx, size);
        if (value != null && value !== '') {
          if (num(value) != null) s = { k: 'number', n: num(value) };
          else if (animalIn(value)) s = { k: 'animal', animal: animalIn(value) };
          else if (homeOf(value)) s = { k: 'home', home: homeOf(value) };
          else if (NAMES.en.color[value] != null) s = { k: 'color', color: value };
          else if (thingOf(value)) s = { k: 'color', color: null, thing: thingOf(value) };
          else if (NAMES.en.shape[value] != null) s = { k: 'shape', shape: value };
          else if (splitOp(value)) s = { k: 'expr', expr: String(value) };
          else if (isLetter(String(value))) return semOf('letter', value, face, ctx);
        }
      }
    }
    if ((s.k === 'number' || s.k === 'dots') && s.n != null &&
        (topic === 'oddeven' || face.parity === 'odd' || face.parity === 'even' || ctx.parity === 'odd' || ctx.parity === 'even'))
      s.parity = s.n % 2 ? 'odd' : 'even';
    return s;
  }
  function semOfCard(c, ctx) {
    if (c == null) return { k: null };
    if (typeof c !== 'object') return semOf(null, c, null, ctx);
    if ('nameKind' in c || 'nameValue' in c || 'face' in c) return semOf(c.nameKind, c.nameValue, c.face, ctx, c.size);
    if ('kind' in c) {
      // either {kind, value} (a name) or a face object {kind:'dots', n:3, …}
      return semOf(c.kind, c.value != null ? c.value : null, c, ctx, c.size);
    }
    return { k: null };
  }
  function ctxOf(ev, lang) {
    return { topic: ev.topic || (ev.round && ev.round.topic) || null, parity: ev.parity, animal: ev.animal, lang: lang };
  }
  // the two windows of a match / mismatch event, as sems (0, 1 or 2 entries)
  function twoCards(ev, lang) {
    var ctx = ctxOf(ev, lang), out = [];
    var A = null, B = null;
    if (Array.isArray(ev.cards) && ev.cards.length >= 2) { A = ev.cards[0]; B = ev.cards[1]; }
    if (ev.cardA || ev.cardB) { A = ev.cardA || A; B = ev.cardB || B; }
    if (!A && (ev.nameKindA != null || ev.nameValueA != null || ev.faceA)) A = { nameKind: ev.nameKindA, nameValue: ev.nameValueA, face: ev.faceA, size: ev.sizeA };
    if (!B && (ev.nameKindB != null || ev.nameValueB != null || ev.faceB)) B = { nameKind: ev.nameKindB, nameValue: ev.nameValueB, face: ev.faceB, size: ev.sizeB };
    if (!A && ev.nameA != null) A = (typeof ev.nameA === 'object') ? ev.nameA : { nameKind: null, nameValue: ev.nameA };
    if (!B && ev.nameB != null) B = (typeof ev.nameB === 'object') ? ev.nameB : { nameKind: null, nameValue: ev.nameB };
    if (A && typeof A === 'object' && !('nameKind' in A) && !('kind' in A) && !('face' in A)) A = null;
    if (B && typeof B === 'object' && !('nameKind' in B) && !('kind' in B) && !('face' in B)) B = null;
    [A, B].forEach(function (c) { if (c != null) { var s = semOfCard(c, ctx); if (s.k) out.push(s); } });
    return out;
  }

  // "a red umbrella" / "cái ô màu đỏ", "three dots" / "ba chấm tròn", "a kennel" / "nhà chó", "letter B" / "chữ B" …
  function phrase(lang, s) {
    var vi = lang === 'vi';
    switch (s.k) {
      case 'color':
        if (s.thing) return thingPhrase(lang, s.thing, s.color);
        return name(lang, 'color', s.color);
      case 'shape': return vi ? name(lang, 'shape', s.shape) : 'a ' + name(lang, 'shape', s.shape);
      case 'animal':
        if (vi) return NAMES.vi.animal[s.animal] + (s.size ? ' ' + NAMES.vi.size[s.size] : '');
        return 'a ' + (s.size ? NAMES.en.size[s.size] + ' ' : '') + NAMES.en.animal[s.animal];
      case 'home': return vi ? NAMES.vi.home[s.home] : 'a ' + NAMES.en.home[s.home];
      case 'dots': return numberName(lang, s.n) + ' ' + dotWord(lang, s.n);
      case 'number': return vi ? 'số ' + numberName(lang, s.n) : numberName(lang, s.n);
      case 'letter':
        if (vi) return 'chữ ' + s.letter + (s.small ? ' thường' : s.capital ? ' in hoa' : '');
        return (s.small ? 'small letter ' : s.capital ? 'big letter ' : 'letter ') + s.letter;
      case 'expr': return exprWords(lang, s.expr);
      case 'word':
        if (s.animal) {
          var wd = wordOfSprite(lang, 'animal_' + s.animal);
          if (vi) return wd || NAMES.vi.animal[s.animal];
          return 'a ' + (wd || NAMES.en.animal[s.animal]);
        }
        return String(s.word);
      case 'parity': return name(lang, 'parity', s.parity);
      default: return '';
    }
  }
  I18N.cardPhrase = function (lang, card) {
    lang = L(lang);
    var s = phrase(lang, semOfCard(card || {}, { lang: lang })) || '';
    return lang === 'en' ? anFix(s) : s;
  };

  function countLine(lang, n) {               // "One, two, three dots!" (n ≤ 5) · "Seven dots!"
    var head;
    if (n >= 1 && n <= 5) {
      var parts = [];
      for (var i = 1; i <= n; i++) parts.push(numberName(lang, i));
      head = parts.join(', ');
    } else head = numberName(lang, n);
    return capFirst(head + ' ' + dotWord(lang, n) + '!');
  }

  // What is inside the window that opened: `flip` and `tap` events { nameKind, nameValue, face, topic? }
  I18N.sayFlip = function (lang, ev, rng) {
    lang = L(lang);
    ev = (ev && typeof ev === 'object') ? ev : {};
    var s = semOf(ev.nameKind, ev.nameValue, ev.face, ctxOf(ev, lang), ev.size);
    switch (s.k) {
      case 'color':
        if (s.thing && s.color) return I18N.t(lang, 'flip.thing', { color: s.color, thing: s.thing }, rng);
        if (s.thing) return capFirst(thingPhrase(lang, s.thing, null)) + '!';
        return I18N.t(lang, 'flip.color', { name: name(lang, 'color', s.color) }, rng);
      case 'shape':
        if (s.color) return I18N.t(lang, 'flip.shapeColor', { shape: s.shape, color: s.color }, rng);
        return I18N.t(lang, 'flip.shape', { name: name(lang, 'shape', s.shape) }, rng);
      case 'animal': {
        var nm = lang === 'vi' ? phrase(lang, s) : (s.size ? NAMES.en.size[s.size] + ' ' : '') + NAMES.en.animal[s.animal];
        return I18N.t(lang, 'flip.animal', { name: nm }, rng);
      }
      case 'home': return I18N.t(lang, 'flip.home', { name: NAMES[lang].home[s.home] }, rng);
      case 'dots': return countLine(lang, s.n);
      case 'number': return I18N.t(lang, 'flip.number', { num: numberName(lang, s.n) }, rng);
      case 'letter':
        if (s.small) return I18N.t(lang, 'flip.small', { lower: s.letter }, rng);
        if (s.capital) return I18N.t(lang, 'flip.capital', { letter: s.letter }, rng);
        return I18N.t(lang, 'flip.letter', { letter: s.letter }, rng);
      case 'expr': return I18N.t(lang, 'flip.expr', { expr: exprWords(lang, s.expr) }, rng);
      case 'word':
        if (s.animal) {
          // initial topic: say the WORD that carries the letter ("Mèo!", "A rabbit!"), not "con mèo" (starts with C)
          var wd = s.word || wordOfSprite(lang, 'animal_' + s.animal);
          if (lang === 'vi') return I18N.t(lang, 'flip.word', { word: wd || NAMES.vi.animal[s.animal] }, rng);
          return I18N.t(lang, 'flip.animal', { name: wd || NAMES.en.animal[s.animal] }, rng);
        }
        return I18N.t(lang, 'flip.word', { word: String(s.word) }, rng);
      case 'parity': return capFirst(name(lang, 'parity', s.parity)) + '!';
      default: return I18N.t(lang, 'praise', null, rng);
    }
  };
  I18N.sayTap = I18N.sayFlip;

  // `match` event { nameKind, nameValue, topic?, cardA/cardB | nameKindA… | nameA/nameB, parity?, animal?, home? }
  I18N.sayMatch = function (lang, ev, rng) {
    lang = L(lang);
    ev = (ev && typeof ev === 'object') ? ev : {};
    var ctx = ctxOf(ev, lang), topic = ctx.topic;
    var cs = twoCards(ev, lang);
    var main = semOf(ev.nameKind, ev.nameValue, ev.face, ctx);
    if (main.k) cs.push(main);
    function find(k) { for (var i = 0; i < cs.length; i++) if (cs[i].k === k) return cs[i]; return null; }
    var dots = find('dots'), numb = find('number'), expr = find('expr'), letter = find('letter'), word = find('word'),
      animal = find('animal'), color = find('color'), shape = find('shape'), par = find('parity'), home = find('home');
    var n = dots ? dots.n : numb ? numb.n : null;
    var odd = topic === 'oddeven' || (dots && dots.parity) || (numb && numb.parity) || par ||
      ev.parity === 'odd' || ev.parity === 'even';
    // homes: "The dog lives in the kennel!"
    var evHome = homeOf(rawVal(ev.home)), evAnimal = animalOf(rawVal(ev.animal));
    if (home || evHome || (topic === 'homes' && (animal || evAnimal))) {
      var ha = (animal && animal.animal) || evAnimal || (home && ANIMAL_OF[home.home]) || (evHome && ANIMAL_OF[evHome]);
      var hh = (home && home.home) || evHome || (ha && HOME_OF[ha]);
      if (ha && hh) return I18N.t(lang, 'match.home', { animal: ha, home: hh }, rng);
    }
    // add / sub: "Two plus three is five!"
    if (expr) {
      var ans = exprAnswer(expr.expr);
      if (ans == null && numb) ans = numb.n;
      return I18N.t(lang, 'match.math', { expr: exprWords(lang, expr.expr), num: ans != null ? numberName(lang, ans) : '' }, rng);
    }
    if (topic === 'add' || topic === 'sub') return I18N.t(lang, 'match.any', null, rng);
    if (odd && n != null) {
      var parity = n % 2 ? 'odd' : 'even';
      return I18N.t(lang, 'match.oddeven', { num: numberName(lang, n), dots: dotWord(lang, n), parity: parity }, rng);
    }
    if ((dots || topic === 'count') && n != null)
      return I18N.t(lang, 'match.count', { num: numberName(lang, n), dots: dotWord(lang, n), counted: counted(lang, n) }, rng);
    if (numb) return I18N.t(lang, 'match.number', { num: numberName(lang, numb.n) }, rng);
    // initial: letter ↔ animal picture
    if (letter && (word || animal || topic === 'initial')) {
      var wa = (word && word.animal) || (animal && animal.animal);
      var w = present(ev.word) && typeof rawVal(ev.word) === 'string' ? name(lang, 'word', rawVal(ev.word)) :
        word && word.word ? String(word.word) :
          wa ? (wordOfSprite(lang, 'animal_' + wa) || NAMES[lang].animal[wa]) : '';
      if (w) return I18N.t(lang, 'match.initial', { word: w, letter: upper(letter.letter) }, rng);
    }
    if (letter) {
      var hasSmall = cs.some(function (c) { return c.k === 'letter' && c.small; });
      var hasCap = cs.some(function (c) { return c.k === 'letter' && !c.small; });
      if ((hasSmall && hasCap) || topic === 'lower')
        return I18N.t(lang, 'match.lower', { letter: upper(letter.letter), lower: letter.letter.toLowerCase() }, rng);
      return I18N.t(lang, 'match.letter', { letter: letter.letter }, rng);
    }
    if (animal || (word && word.animal)) {
      var a = animal ? animal.animal : word.animal;
      var sized = cs.some(function (c) { return c.k === 'animal' && c.size; });
      if (topic === 'size' || (sized && cs.some(function (c) { return c.size === 'small'; }) &&
          (cs.some(function (c) { return c.size === 'big'; }) || ev.nameKind === 'size')))
        return I18N.t(lang, 'match.size', { beast: NAMES[lang].animal[a] }, rng);
      return I18N.t(lang, 'match.animal', { name: NAMES[lang].animal[a], plural: PLURAL_EN.animal[a] }, rng);
    }
    if (color) {
      var things = cs.filter(function (c) { return c.k === 'color' && c.thing; });
      var col = color.color;
      for (var i = 0; !col && i < cs.length; i++) if (cs[i].k === 'color' && cs[i].color) col = cs[i].color;
      if (col && things.length >= 2 && things[0].thing !== things[1].thing)
        return I18N.t(lang, 'match.colorMix', { A: thingPhrase(lang, things[0].thing, null),
          B: thingPhrase(lang, things[1].thing, null), color: col }, rng);
      if (col && things.length)
        return I18N.t(lang, 'match.thing', { color: col, thing: things[0].thing, things: PLURAL_EN.thing[things[0].thing] }, rng);
      if (col) return I18N.t(lang, 'match.color', { name: name(lang, 'color', col) }, rng);
    }
    if (shape) return I18N.t(lang, 'match.shape', { name: name(lang, 'shape', shape.shape), plural: PLURAL_EN.shape[shape.shape] }, rng);
    return I18N.t(lang, 'match.any', null, rng);
  };

  // `mismatch` event: "A red umbrella and a blue kite. Let's look again!" — names both windows, never negative.
  I18N.sayMismatch = function (lang, ev, rng) {
    lang = L(lang);
    ev = (ev && typeof ev === 'object') ? ev : {};
    var cs = twoCards(ev, lang);
    if (cs.length < 2) return I18N.t(lang, 'wrong', null, rng);
    var s0 = cs[0], s1 = cs[1];
    // two colour things: leave out what they share ("An umbrella and a kite." when both are red;
    // "A red umbrella and a blue umbrella." keeps the colours, which are the point)
    if (s0.k === 'color' && s1.k === 'color' && s0.thing && s1.thing && s0.color && s0.color === s1.color && s0.thing !== s1.thing) {
      s0 = { k: 'color', thing: s0.thing, color: null }; s1 = { k: 'color', thing: s1.thing, color: null };
    }
    var A = phrase(lang, s0), B = phrase(lang, s1);
    if (!A || !B) return I18N.t(lang, 'wrong', null, rng);
    // homes: an animal + someone else's home → "… Where does the dog live?" (a gentle teaching nudge)
    var an = cs[0].k === 'animal' && cs[1].k === 'home' ? cs[0].animal : cs[1].k === 'animal' && cs[0].k === 'home' ? cs[1].animal : null;
    if (an && rnd(rng) < 0.67) return I18N.t(lang, 'mismatch.home', { A: A, B: B, animal: an }, rng);
    return I18N.t(lang, 'mismatch.two', { A: A, B: B }, rng);
  };

  // Surprise visitors: sayCritter(lang, 'pigeon'|'bus'|'balloon' | {type, action}, action?, rng)
  I18N.sayCritter = function (lang, type, action, rng) {
    lang = L(lang);
    if (type && typeof type === 'object') { rng = action; action = type.action; type = type.type; }
    if (CRITTERS.indexOf(type) < 0) return I18N.t(lang, 'praise', null, rng);
    return I18N.t(lang, 'critter.' + type + (action === 'tap' ? '.tap' : ''), null, rng);
  };

  // legacy: a short line for a `reward` event (this game has none; star / light / bloom kept), else praise
  I18N.sayReward = function (lang, ev, rng) {
    lang = L(lang);
    var k = ev && typeof ev === 'object' ? ev.kind : ev;
    if (!STR[lang]['reward.' + k]) return I18N.t(lang, 'praise', null, rng);
    return I18N.t(lang, 'reward.' + k, null, rng);
  };

  // Counting aloud (dots): n < need → "Two!"; n ≥ need → "Three! Three dots!" / "Ba! Ba chấm tròn!"
  I18N.sayCount = function (lang, n, need, rng) {
    lang = L(lang);
    var c = num(n);
    if (c == null) return I18N.t(lang, 'praise', null, rng);
    var nd = num(need);
    if (nd == null || c < nd) return capFirst(numberName(lang, c)) + '!';
    return I18N.t(lang, 'say.countDone', { n: c }, rng);
  };

  // Back-compat aliases for Kitten-style callers: a `correct` → the window name; a `wrong` → the mismatch line.
  I18N.sayCorrect = function (lang, ev, rng) { return I18N.sayFlip(lang, ev, rng); };
  I18N.sayWrong = function (lang, ev, rng) { return I18N.sayMismatch(lang, ev, rng); };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { value = kind.value; kind = kind.kind; }
    if (value == null || value === '') return I18N.t(lang, 'wrong');
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'home') {
      var h = homeOf(value);
      if (!h) return I18N.t(lang, 'talk.wrong', { answer: String(value) });
      return I18N.t(lang, 'talk.wrong.home', { animal: ANIMAL_OF[h], home: h, answer: ans.answer });
    }
    if (kind === 'animal' || kind === 'size' && animalIn(value)) {
      var a = animalIn(value);
      if (!a) return I18N.t(lang, 'talk.wrong', { answer: String(value) });
      return I18N.t(lang, 'talk.wrong.animal', { answer: { kind: kind, value: value } });
    }
    if (kind === 'shape') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter') return I18N.t(lang, 'talk.wrong.letter', { letter: String(value) });
    if (kind === 'number' || kind === 'dots' || (kind === 'parity' && num(value) != null))
      return I18N.t(lang, 'talk.wrong.number', { answer: { kind: 'number', value: value } });
    if (kind === 'parity' && lang === 'vi') return I18N.t(lang, 'talk.wrong.number', ans);
    return I18N.t(lang, 'talk.wrong', ans);
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/[…]/g, '.').replace(/[›»«]/g, ',').replace(/\s*[—–]\s*/g, ', ');
    if (lang === 'en') {
      s = s.replace(/\b(letter|Letter) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
      s = s.replace(/\bTa-da\b/g, 'Ta da').replace(/\bBrrr\b/g, 'Brr');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();
  };

  GW.I18N = I18N;
})(window.GW = window.GW || {});
