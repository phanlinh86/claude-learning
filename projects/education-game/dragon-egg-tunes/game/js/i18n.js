/* Rio's Singing Eggs — SE.I18N (English + Vietnamese). Rio (EN "Rio", VI titles "Rồng Rio", VI lines "Rio") is a
 * cheerful tiny baby dragon in a dinosaur valley where the eggs sing. Each round Rio first SINGS A TUNE (a spark flies
 * from his mouth to each egg in order, the egg sings, Rio names it: "Red!", "The star!", "Quack! The duckling!"), then
 * "Your turn!" and the child taps the eggs in the same order. Eggs = "egg" / "quả trứng" (VI "quả trứng màu đỏ", "quả
 * trứng hình tròn", "quả trứng to", "quả trứng có năm chấm"); verbs EN "tap / sing", VI "gõ / chạm / hát". A right note
 * makes a seed pod on the vine bloom ("Hoa nở rồi!"); the song ends with the little volcano's sparkle puff ("Phù!").
 * Counting at ages ≤ 4 = copy Rio's taps on the big spotted egg ("Đến lượt bé — gõ quả trứng to ba cái nhé!").
 * "Rio" is read naturally by English and Vietnamese voices, so no TTS rewrite (docs/VOICE.md §0).
 *
 *   SE.I18N.t(lang, key, params, rng?)            → string (variants picked with rng.next()/rng()/Math.random)
 *   SE.I18N.ask(lang, promptKey, params, {next, rng}) → the step prompt; next:true → "Next one! Tap the red egg!"
 *   SE.I18N.name(lang, kind, value, opts?)        → a name. kinds: color (vi "màu đỏ"), hue (bare, vi "đỏ"), shape (vi
 *                                                   "ngôi sao", "hình tròn"), shapeH (vi "hình ngôi sao"), size, egg (a
 *                                                   colour or big/small → "red egg" / "quả trứng màu đỏ"), big ("big egg" /
 *                                                   "quả trứng to"), dots (n → "seven dots" / "bảy chấm"), animal (en
 *                                                   "duckling", vi "vịt con"), sound ("quack" / "cạp cạp"), word (the
 *                                                   animal's short word: "duckling" / "vịt"), number, letter, text, sum,
 *                                                   diff, parity
 *   SE.I18N.words(lang, kind, value)              → accepted spoken forms (lower-case, + no-diacritic forms, digits;
 *                                                   animals also by their sound: "quack" → duck)
 *   SE.I18N.choiceWords(lang, choice)             → spoken forms for a Talk choice {id, thing:{kind, …}}
 *   SE.I18N.eggPhrase(lang, thing, opts?)         → an egg named for a sentence: "the red egg", "the big egg", "the star
 *                                                   egg", "the egg with five dots", "the duckling", "letter B", "small b",
 *                                                   "number five" / "quả trứng màu đỏ", "quả trứng to", "quả trứng ngôi
 *                                                   sao", "quả trứng có năm chấm", "vịt con", "chữ B", "chữ b thường",
 *                                                   "số năm"   (alias: piecePhrase)
 *   SE.I18N.phrase(lang, thing)                   → the same for any thing / icon / {nameKind, nameValue}
 *   SE.I18N.sayName(lang, thing)                  → an egg's plain name ("the red egg" / "quả trứng màu đỏ")
 *   --- the tune (copy-my-tune flow, docs/VOICE.md §2) ---
 *   SE.I18N.demoName(lang, nameKind | e, value?, opts?) → the short name of a tune note: "red", "the star", "the blue
 *                                                   star" (shapes with colours), "the big egg", "seven dots", "five",
 *                                                   "letter B", "small b", "the duckling" / "màu đỏ", "ngôi sao", "quả
 *                                                   trứng to", "bảy chấm", "năm", "chữ B", "vịt con"
 *   SE.I18N.sayDemo(lang, nameKind | e, value?, opts?) → `demoNote`: "Red!", "The star!", animals = sound + name
 *                                                   "Quack! The duckling!" / "Màu đỏ!", "Ngôi sao!", "Cạp cạp! Vịt con!"
 *   SE.I18N.sayDemoStart(lang, e, rng?)           → `demoStart`: "Listen to my tune!" | replay "Listen again!" | beat
 *                                                   "Count with me!"
 *   SE.I18N.sayNext(lang, nameKind | e, value?, rng?) → the soft name cue (ages ≤ 5): "…and blue!" / "…rồi màu xanh dương!"
 *   SE.I18N.sayTurn(lang, e, {age, cue, rng})     → the `ask` line in the tune flow: afterDemo → "Your turn!" (+ "First,
 *                                                   red!" at age ≤ 3); a beat step → "Your turn — tap the big egg three
 *                                                   times!"; a later step → the cue "…and blue!" (or '' when no cue)
 *   --- reactions ---
 *   SE.I18N.sayRight(lang, e, rng?)               → `right`: "Yes! Red!", animals "Quack! The duckling!" / "Cạp cạp! Vịt
 *                                                   con!", beat mode (e.count {n}) "Three! You tapped it three times!" /
 *                                                   "Ba! Bé gõ đủ ba cái rồi!", dots with e.count → the count run "One,
 *                                                   two, three dots!", add/sub "Five! 2 + 3 is five!", oddeven "Seven is
 *                                                   odd!", initial "D is for duckling!"   (aliases: sayPlaced; sayPickup /
 *                                                   sayTap = "The red egg!" / "Look, the red egg!")
 *   SE.I18N.sayWrong(lang, e, rng?)               → `wrong`: names what was tapped, then — by default (the world replays
 *                                                   the tune) — "That’s the yellow egg. Listen again!"; with e.replay ===
 *                                                   false (or e.streak ≥ 2: the hint glow is on, no replay) the goal:
 *                                                   "That’s the yellow egg. Let’s tap the red one!" (animals "The chick
 *                                                   says peep! …"; maths never gives the answer away)
 *   SE.I18N.sayCount(lang, i)                     → "One!" … "Twenty!" (one tap counted aloud; also Rio's demoCount)
 *   SE.I18N.sayCountRun(lang, n, kind?)           → "One, two, three!" (kind 'beat' / default) | "One, two, three dots!"
 *   SE.I18N.sayCountDone(lang, n, kind?, rng?)    → "Three taps! Hooray!" / "Ba cái! Hoan hô!"
 *   SE.I18N.sayBeatNudge(lang, e, rng?)           → `beatNudge {i, n}`: "Two! One more!" / "Hai rồi! Thêm một cái nữa!"
 *   SE.I18N.talkWrong(lang, choice | kind, value) → gentle "It is red! Good try!" for a missed Talk-time answer
 *   SE.I18N.speech(lang, text)                    → text tuned for TTS (letter names, + − =, " — " pause, leading "…")
 *   SE.I18N.soundOf(lang, animal)                 → "quack" / "cạp cạp"
 *   SE.I18N.setChild(name)  has(lang, key)  keys(lang)  raw(lang, key)  langs  PARAMS  TOPICS  ANIMALS  SHAPES  COLORS
 *
 * Event objects `e` (main passes the world event + { topic, params (the current step's params), promptKey, thing (the
 * egg's thing) }): thing = { kind 'egg'|'shape'|'big'|'dots'|'animal'|'glyph', color?, shape?, n?, animal?, text?, big?,
 * nameKind, nameValue }. When `thing` is missing, the egg is rebuilt from {nameKind, nameValue} + topic (`got`).
 * Params: values may be RAW ({color:'red'}, {animal:'duck'}, {n:3}) — keys named like a name kind are named automatically;
 * an object {kind, value} or {nameKind, nameValue} is replaced by its name / phrase; {thing: {...}} → its egg phrase.
 * Derived params: {hue} (bare colour) from color, {word} and {sound} from animal, {lower} from letter, {expr} from a,b /
 * text, {num} (number word), {times} ("once" / "three times", vi "ba cái") and {timesHead} (the same; vi n = 1
 * "một cái thôi") from n, {done} / {left} (number words: taps so far / taps still to go) from i + n, {items}
 * ("dots"/"dot", vi "chấm") and {itemsPl} (always plural) from n + kind.
 * Vietnamese shape Talk questions say "hình ngôi sao", "hình trái tim" ({shape} in talk.shapes*).
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * {child}: if the child's name is empty, variants containing {child} are skipped (and "bé {child}" → "bé", ", {child}!" → "!").
 */
(function (SE) {
  'use strict';

  var LANGS = ['en', 'vi'];
  // DESIGN §5.1: babies that hatch from the eggs (Rio is the dragon, so no dragon)
  var ANIMALS = ['duck', 'chick', 'owl', 'frog', 'dino', 'snake'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var EGG_KINDS = ['egg', 'shape', 'big', 'dots', 'animal', 'glyph'];
  var KIND_ALIAS = { tom: 'egg', obj: 'egg', tag: 'glyph', number: 'glyph', bass: 'big' };

  // ---------------------------------------------------------------- names
  var NAMES = { en: {}, vi: {} };
  NAMES.en.color = { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink' };
  NAMES.vi.color = { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' };
  NAMES.en.hue = NAMES.en.color;
  NAMES.vi.hue = { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' };
  NAMES.en.shape = { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
    rectangle: 'rectangle', diamond: 'diamond', oval: 'oval' };
  // DESIGN §6: shape eggs "quả trứng hình tròn / hình vuông / hình tam giác / ngôi sao / trái tim / hình chữ nhật /
  // hình thoi / hình bầu dục"; a Talk question says "hình ngôi sao" (shapeH)
  NAMES.vi.shape = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao',
    heart: 'trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };
  NAMES.en.shapeH = NAMES.en.shape;
  NAMES.vi.shapeH = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
    heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };
  NAMES.en.size = { big: 'big', small: 'small' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  // the baby animals peeking out of their cracked eggs (DESIGN §4.2 / §6)
  NAMES.en.animal = { duck: 'duckling', chick: 'chick', owl: 'owlet', frog: 'baby frog', dino: 'baby dino', snake: 'baby snake' };
  NAMES.vi.animal = { duck: 'vịt con', chick: 'gà con', owl: 'cú con', frog: 'ếch con', dino: 'khủng long con', snake: 'rắn con' };
  // the short word ('first letter' topic, Talk "{word} starts with …"): no "baby" / no "con"
  NAMES.en.word = { duck: 'duckling', chick: 'chick', owl: 'owlet', frog: 'frog', dino: 'dino', snake: 'snake' };
  NAMES.vi.word = { duck: 'vịt', chick: 'gà', owl: 'cú', frog: 'ếch', dino: 'khủng long', snake: 'rắn' };
  // the animal sounds (DESIGN §5.1; the Vietnamese ones kindergartens use)
  NAMES.en.sound = { duck: 'quack', chick: 'peep', owl: 'hoot', frog: 'ribbit', dino: 'rawr', snake: 'hiss' };
  NAMES.vi.sound = { duck: 'cạp cạp', chick: 'chíp chíp', owl: 'hù hù', frog: 'ộp ộp', dino: 'gừ gừ', snake: 'xì xì' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  // counted things: [singular, plural]; RUN = the word said after a count run ("Một, hai, ba chấm!"; taps: none)
  var ITEMS = { en: { dots: ['dot', 'dots'], beat: ['tap', 'taps'] },
    vi: { dots: ['chấm', 'chấm'], beat: ['cái', 'cái'] } };
  var RUN = { en: { dots: ['dot', 'dots'], beat: ['', ''] }, vi: { dots: ['chấm', 'chấm'], beat: ['', ''] } };

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
    'F': 'ép', 'J': 'gi', 'W': 'vê kép', 'Z': 'dét' };
  var LETTER_WORDS_VI = { 'A': ['a'], 'Ă': ['á', 'ắ'], 'Â': ['ớ', 'â'], 'B': ['bê', 'bơ', 'bở'], 'C': ['xê', 'cơ', 'cở'],
    'D': ['dê', 'dơ'], 'Đ': ['đê', 'đơ'], 'E': ['e', 'é'], 'Ê': ['ê'], 'G': ['giê', 'gơ', 'gở'], 'H': ['hát', 'hắt', 'hơ'],
    'I': ['i', 'i ngắn'], 'K': ['ca', 'ka'], 'L': ['e lờ', 'lơ'], 'M': ['em mờ', 'mơ'], 'N': ['en nờ', 'nơ'], 'O': ['o'],
    'Ô': ['ô'], 'Ơ': ['ơ'], 'P': ['pê', 'pơ'], 'Q': ['quy', 'cu', 'quơ'], 'R': ['e rờ', 'rơ'], 'S': ['ét xì', 'sơ'],
    'T': ['tê', 'tơ'], 'U': ['u'], 'Ư': ['ư'], 'V': ['vê', 'vơ'], 'X': ['ích xì', 'xơ'], 'Y': ['i dài', 'i cờ rét'],
    'F': ['ép'], 'J': ['gi'], 'W': ['vê kép'], 'Z': ['dét'] };

  // extra accepted spoken forms per kind/value (names — and for animals their sounds — are always accepted automatically).
  // No form is shared by two values of the same kind.
  var WORDS = {
    en: {
      color: { red: ['red', 'read', 'reds'], blue: ['blue', 'blew', 'blues'], yellow: ['yellow', 'yello'],
        green: ['green', 'greens'], orange: ['orange', 'oranges'], purple: ['purple', 'violet', 'pupple'],
        pink: ['pink', 'pinks', 'pinky'] },
      shape: { circle: ['circle', 'round', 'circles'], square: ['square', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'ovals', 'egg shape'],
        diamond: ['diamond', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller'] },
      animal: { duck: ['duck', 'ducky', 'duckie', 'ducks', 'baby duck', 'ducklings', 'quack quack'],
        chick: ['chick', 'chicky', 'chickie', 'chicks', 'chicken', 'baby chick', 'peep peep', 'cheep', 'cheep cheep'],
        owl: ['owl', 'owly', 'owls', 'baby owl', 'owlets', 'hoot hoot', 'hoo hoo', 'twit twoo'],
        frog: ['frog', 'froggy', 'frogs', 'froglet', 'ribbit ribbit', 'croak'],
        dino: ['dino', 'dinosaur', 'dinosaurs', 'baby dinosaur', 'dinos', 'rawr rawr', 'roar', 'raah'],
        snake: ['snake', 'snakey', 'snakes', 'sssnake', 'hiss hiss', 'sss', 'ssss'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], rectangle: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'],
        diamond: ['hình thoi', 'thoi'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn', 'quả to', 'trứng to', 'quả trứng to', 'trứng lớn'],
        small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon', 'quả nhỏ', 'trứng nhỏ', 'quả trứng nhỏ'] },
      animal: { duck: ['con vịt', 'vịt', 'vịt nhỏ', 'quạc quạc', 'cạp'],
        chick: ['con gà', 'gà', 'gà nhỏ', 'chiếp chiếp', 'chíp'],
        owl: ['con cú', 'cú', 'cú mèo', 'cú nhỏ', 'hù', 'hu hu hu'],
        frog: ['con ếch', 'ếch', 'ếch nhỏ', 'con nhái', 'ộp ộp ộp', 'ộp'],
        dino: ['con khủng long', 'khủng long', 'khủng long nhỏ', 'gừ', 'grừ'],
        snake: ['con rắn', 'rắn', 'rắn nhỏ', 'xì', 'xì xì xì'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default SE.WORDS for the 'initial' topic (animal eggs are the pictures). content.js may replace it
  // ({en:[{word, initial, animal}], vi:[…]}). The words are NAMES.*.word (vi without "con"); the VI initial keeps the
  // letter's own marks (ếch → Ê) but never a tone mark. Initials: en D C O F D S, vi V G C Ê K R.
  var WORD_LIST = {
    en: [['duckling', 'duck', 'D'], ['chick', 'chick', 'C'], ['owlet', 'owl', 'O'], ['frog', 'frog', 'F'], ['dino', 'dino', 'D'],
      ['snake', 'snake', 'S']],
    vi: [['vịt', 'duck', 'V'], ['gà', 'chick', 'G'], ['cú', 'owl', 'C'], ['ếch', 'frog', 'Ê'], ['khủng long', 'dino', 'K'],
      ['rắn', 'snake', 'R']]
  };
  function defaultEntries(lang) {
    return WORD_LIST[lang].map(function (w) { return { id: w[1], word: w[0], animal: w[1], initial: w[2] }; });
  }
  if (!SE.WORDS) {
    SE.WORDS = {};
    LANGS.forEach(function (l) { SE.WORDS[l] = defaultEntries(l); });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'hue', 'shape', 'shapeH', 'size', 'egg', 'big', 'dots', 'animal', 'sound', 'word', 'number',
    'letter', 'text', 'sum', 'diff', 'parity'];
  // prompt keys content.js asks with (DESIGN §5.1 / §6) and their REQUIRED params (others are optional)
  var PROMPTS = {
    'p.colors': ['color'], 'p.shapes': ['shape'], 'p.shapes5': ['shape', 'color'], 'p.size': ['size'],
    'p.animals': ['animal'], 'p.beat': ['n'], 'p.count': ['n'], 'p.letters': ['letter'], 'p.lower': ['letter'],
    'p.initial': ['letter'], 'p.add': ['a', 'b'], 'p.sub': ['a', 'b'], 'p.oddeven': ['parity']
  };
  var MAX_COUNT = 20;

  var STR = {
    en: {
      'ui.title': 'Rio’s Singing Eggs',
      'ui.logo1': 'Rio’s',
      'ui.logo2': 'Singing Eggs',
      'ui.subtitle': 'Listen to Rio’s tune, then sing it back!',
      'ui.tagline': 'Listen to Rio’s tune, then sing it back!',
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
      'ui.quieter': 'Quieter',
      'ui.louder': 'Louder',
      'ui.voice': 'Rio’s voice',
      'ui.mic': 'Answer by talking',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Rio, a little dragon. Let’s sing with the eggs!',
        'Hi! I am Rio, a little dragon. Let’s sing with the eggs!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Rio is listening…',
      'ui.tapRio': 'Tap Rio to hear the tune again',
      'ui.tapHint': 'Tap an egg to hear it sing',
      'ui.swipeHint': 'Swipe across the eggs',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our songs',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Eggs',
      'topic.shapes': 'Shape Eggs',
      'topic.size': 'Big and Small',
      'topic.count': 'Let’s Count',
      'topic.animals': 'Baby Animals',
      'topic.letters': 'Letter Eggs',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Good morning, dino valley!',
      'weather.1': 'Sunny noon!',
      'weather.2': 'Sunset in the valley!',
      'weather.3': 'Starry night!',

      'enter': ['Here come the eggs!', 'Look, new eggs!', 'New singing eggs!'],

      // the tune (copy-my-tune): Rio sings first, then the child sings it back (DESIGN §5.2 / §6)
      'demo.start': ['Listen to my tune!', 'Listen! Here is my tune!', 'Listen carefully!'],
      'demo.replay': ['Listen again!', 'Here it is again!', 'Once more, listen!'],
      'demo.beat': ['Count with me!', 'Watch and count!', 'Let’s count my taps!'],
      'demo.note': ['{thing}!'],
      'demo.animal': ['{sound}! {thing}!'],
      'turn.first': ['Your turn!', 'Now you!', 'Your turn to sing!'],
      'turn.firstName': ['First, {name}!', 'Start with {name}!', 'First comes {name}!'],
      'turn.next': ['…and {name}!', '…then {name}!', 'Now {name}!'],
      'turn.beat': ['Your turn — tap the big egg {times}!', 'Now you! Tap the big egg {times}!', 'Your turn! Tap it {times}!'],

      'p.any': ['Let’s tap an egg!', 'Tap an egg and hear it sing!', 'Which egg shall we sing?'],
      'p.next': ['Next one!', 'One more!', 'Now,'],
      'p.colors': ['Tap the {color} egg!', 'Where is the {color} egg? Tap it!', 'Can you tap the {color} egg?'],
      'p.shapes': ['Tap the {shape} egg!', 'Where is the {shape} egg? Tap it!', 'Can you tap the {shape} egg?'],
      'p.shapes5': ['Tap the {color} {shape} egg!', 'Where is the {color} {shape}? Tap it!', 'Can you tap the {color} {shape} egg?'],
      'p.size': ['Tap the {size} egg!', 'Which egg is {size}? Tap it!', 'Can you tap the {size} egg?'],
      'p.sizeAny': ['Tap the big egg!', 'Which egg is big? Tap it!', 'Can you tap the big egg?'],
      'p.animals': ['Who says {sound}? Tap the {animal}!', 'Listen: {sound}! Where is the {animal}? Tap it!',
        'Who says {sound}? Find the {animal}!'],
      // the child's turn after Rio tapped the big egg N times (copy N taps); no `next` opener for p.beat
      'p.beat': ['Tap the big egg {times}!', 'Your turn! Tap the big egg {times}!', 'Can you tap the big egg {times}?'],
      'p.count': ['Tap the egg with {num} {items}!', 'Let’s count! Which egg has {num} {items}? Tap it!',
        'Can you find {num} {items}? Tap that egg!'],
      'p.letters': ['Tap the letter {letter}!', 'Where is the letter {letter}? Tap it!', 'Can you tap letter {letter}?'],
      'p.lower': ['Big {letter} has a little friend. Tap small {lower}!', 'Tap small {lower}!',
        'Where is small {lower}? It goes with big {letter}!'],
      'p.initial': ['Tap the baby animal that starts with {letter}!', 'Who starts with {letter}? Tap it!',
        'Listen: {letter}! Which baby animal starts with {letter}?'],
      'p.add': ['What is {a} + {b}? Tap the answer!', 'Let’s add! {a} + {b}. Tap the answer!',
        'Count it up: {a} + {b}! Tap the answer!'],
      'p.sub': ['What is {a} − {b}? Tap the answer!', 'Take away! {a} − {b}. Tap the answer!',
        'Start with {a}, take away {b}! Tap the answer!'],
      'p.oddeven': ['Tap all the {parity} numbers!', 'Find every {parity} number and tap it!', 'Let’s tap all the {parity} numbers!'],

      'name.say': ['{thing}!'],
      'tap': ['{thing}!', 'Look, {thing}!', 'This is {thing}!'],
      'right': ['Yes! {thing}!', '{thing}! Lovely!', 'La la! {thing}!'],
      'right.label': ['Yes! {label}!', '{label}! Lovely!', 'La la! {label}!'],
      'right.animal': ['{sound}! {thing}!', 'Yes! {sound}! {thing}!', '{sound}! {thing} sings along!'],
      'right.beat': ['{num}! You tapped it {times}!', '{num}! Super counting!', '{num}! Hooray, {times}!'],
      'right.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!', 'La la! {num} is {parity}!'],
      'right.initial': ['{letter} is for {word}!', 'Yes! {letter} is for {word}!', 'La la! {letter} is for {word}!'],
      'right.sum': ['{ans}! {expr} is {ans}!', 'Yes! {expr} is {ans}!', 'La la! {expr} is {ans}!'],
      'right.any': ['Yes! Lovely!', 'La la! Just right!', 'Hooray! Lovely singing!'],
      'countDone': ['{num} {items}! Hooray!', 'We counted {num} {items}!', '{num} {items}! Super counting!'],
      'beatNudge': ['{done}! {left} more!', 'That’s {done}! {left} more!', '{done}! Keep going, {left} more!'],
      'lantern': ['A flower opens!', 'Look, the seed pod blooms!', 'One more flower!'],

      // wrong + Rio replays the tune (default): name what was tapped, then "Listen again!"
      'wrong.again': ['That’s {got}. Listen again!', 'Oh, {got}! Listen again!'],
      'wrong.againAnimal': ['{got} says {gotSound}! Listen again!', '{gotSound}! That’s {got}. Listen again!',
        'That’s {got}, {gotSound}! Let’s listen again!'],
      'wrong.againCount': ['That egg has {got}. Listen again!', 'Oh, {got}! Listen again!', 'Let’s count: {got}! Listen again!'],
      'wrong.againParity': ['{num} is {parity}! Listen again!', '{num} is {parity}. Let’s listen again!',
        '{num} is {parity}! Listen to Rio again!'],
      'wrong.againInitial': ['{word} starts with {first}! Listen again!', '{word} starts with {first}. Let’s listen again!',
        '{word} starts with {first}! Listen to Rio again!'],
      'wrong.againAny': ['Listen again!', 'Let’s listen again!', 'Listen to Rio again!'],
      // wrong without a replay (the hint glow is on): name what was tapped, then the goal
      'wrong.thing': ['That’s {got}. Let’s tap {want}!', 'Oh, {got}! Where is {want}?', 'This one is {got}! Let’s look for {want}!'],
      'wrong.animal': ['{got} says {gotSound}! Let’s find {want}!', '{gotSound}! That’s {got}. Who says {sound}? Let’s find {want}!',
        'That’s {got}, {gotSound}! Let’s tap {want}!'],
      'wrong.count': ['That egg has {got}. Let’s tap the egg with {want}!', 'Oh, {got}! Let’s look for {want}!',
        'Let’s count: {got}! We need {want}!'],
      'wrong.math': ['That’s {got}. Let’s count again!', 'Hmm, {got}. Let’s count one more time!', 'That’s {got}! Let’s think again!'],
      'wrong.parity': ['{num} is {parity}! Let’s look for another one!', '{num} is {parity}. Let’s tap a different one!',
        '{num} is {parity}! Let’s try another number!'],
      'wrong.initial': ['{word} starts with {first}! Let’s look again!', '{word} starts with {first}. Let’s tap another one!',
        '{word} starts with {first}! Let’s try another baby animal!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another egg!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'stepDone': ['Hooray!', 'Lovely singing!', 'Wonderful!', 'La la la!'],
      'song': ['Let’s sing it together — tap an egg!', 'Sing time! Tap or swipe the eggs!', 'All together now! Tap the eggs!'],
      'songShort': ['Sing it!', 'All together!', 'Our song!'],
      'songDone': ['What a singer!', 'What a singer, {child}!', 'La la la! Beautiful!', 'Wow, what a song!'],
      'cymbal.tap': ['Puff!', 'Puff puff!', 'Sparkly puff!'],
      'surprise.lamb': ['Look! A baby triceratops!', 'Stomp, stomp! Who is that?', 'A baby triceratops came to dance!'],
      'lamb.tap': ['Rawr! Hello!', 'Hop, hop! What a happy hop!', 'Hee hee! Hello, little triceratops!'],
      'surprise.bird': ['Look! A little bird!', 'Tweet tweet! Who is that?', 'A little bird came to listen!'],
      'bird.tap': ['Tweet! The bird sings your note!', 'Tweet tweet! What a song!', 'The bird sings along!'],
      'surprise.fireflies': ['Fireflies came to listen!', 'Look! Little fireflies!', 'Twinkle! The fireflies came to play!'],
      'firefly.tap': ['Twinkle!', 'Zip! Twinkle!', 'Glow, glow!'],
      'rio.poke': ['Hee hee! That tickles!', 'Puff puff! Hi there!', 'Rio is happy!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Lovely!', 'Hooray!', 'Well done!'],
      'great': ['Beautiful singing, {child}!', 'You did it, {child}!', 'What a music star!', 'Wow, {child}, super singing!',
        'Hooray! You sang my tune!', 'You are so clever!', 'Lovely music!'],
      'party': ['Look at all our flowers!', 'Hooray! What a music day!', 'All the seed pods are blooming!'],
      'hint': ['Psst! Look at the shining egg!', 'Watch the little hand!', 'Rio will help! Tap this one!',
        'Look, this egg is sparkling!', 'The shiny one! Tap it!'],
      'idle': ['Let’s tap an egg!', 'Rio is waiting! Your turn!', 'Tap an egg!', 'I am here, {child}! Let’s play!',
        'The eggs want to sing!', 'Which egg is next?'],

      'talk.intro': 'Talk time!',
      'talk.colors': 'What colour is this egg?',
      'talk.colorsAny': 'What colour is this?',
      'talk.colorsWhich': 'Which egg is {color}?',
      'talk.shapes': 'Which one is the {shape}?',
      'talk.shapesAny': 'What shape is this?',
      'talk.shapes5': 'Which one is the {color} {shape}?',
      'talk.size': 'Which egg is {size}?',
      'talk.sizeAny': 'Which one is big?',
      'talk.count': 'How many {itemsPl}?',
      'talk.countAny': 'How many are there?',
      'talk.animals': 'Who says {sound}?',
      'talk.animalsAny': 'Who is this?',
      'talk.animalsWho': 'Who is this?',
      'talk.letters': 'Where is the letter {letter}?',
      'talk.lettersAny': 'Which letter is this?',
      'talk.lower': 'Where is small {lower}? It goes with big {letter}!',
      'talk.lowerAny': 'Which small letter is this?',
      'talk.initial': 'Which letter does {word} start with?',
      'talk.initialAny': 'Which letter does it start with?',
      'talk.add': 'What is {a} + {b}?',
      'talk.sub': 'What is {a} − {b}?',
      'talk.calc': 'What is the answer?',
      'talk.oddeven': 'Which number is {parity}?',
      'talk.oddevenAny': 'Is it odd or even?',
      'talk.right': ['Yes! You are right!', 'Correct! Hooray!', 'Wow, you know it!', 'That is it! Super!',
        'Clever you!', 'Yes, {child}! Great answer!'],
      'talk.wrong': 'It is {answer}! Good try!',
      'talk.wrong.a': 'It is a {answer}! Good try!',
      'talk.wrong.animal': 'It is the {answer}, {sound}! Good try!',
      'talk.wrong.size': 'It is the {answer} one! Good try!',
      'talk.wrong.letter': 'It is the letter {letter}! Good try!',
      'talk.wrong.small': 'It is small letter {letter}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',
      'talk.wrong.any': 'Good try! Let’s sing more eggs!',

      'session.done': ['What a music day! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many songs! {stars} stars!']
    },
    vi: {
      'ui.title': 'Trứng Biết Hát Của Rồng Rio',
      'ui.logo1': 'Rồng Rio',
      'ui.logo2': 'Trứng Biết Hát',
      'ui.subtitle': 'Bé nghe Rio hát, rồi gõ trứng hát theo nhé!',
      'ui.tagline': 'Bé nghe Rio hát, rồi gõ trứng hát theo nhé!',
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
      'ui.quieter': 'Nhỏ hơn',
      'ui.louder': 'To hơn',
      'ui.voice': 'Giọng của Rio',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là Rio, chú rồng nhỏ. Mình cùng hát với trứng nhé!',
        'Chào bé! Mình là Rio, chú rồng nhỏ. Mình cùng hát với trứng nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Rio đang nghe…',
      'ui.tapRio': 'Chạm vào Rio để nghe lại bài hát nhé',
      'ui.tapHint': 'Bé chạm vào quả trứng để nghe trứng hát nhé',
      'ui.swipeHint': 'Bé vuốt tay qua các quả trứng nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Bài hát của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Trứng sắc màu',
      'topic.shapes': 'Trứng hình dạng',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Cùng đếm nào',
      'topic.animals': 'Thú con trong trứng',
      'topic.letters': 'Trứng chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Chào buổi sáng, thung lũng khủng long!',
      'weather.1': 'Buổi trưa nắng đẹp quá!',
      'weather.2': 'Hoàng hôn trên thung lũng!',
      'weather.3': 'Đêm đầy sao lấp lánh!',

      'enter': ['Trứng tới rồi nè!', 'Nhìn kìa, trứng mới!', 'Trứng biết hát tới rồi!'],

      'demo.start': ['Bé nghe Rio hát nhé!', 'Bé lắng nghe nhé!'],
      'demo.replay': ['Bé nghe lại nhé!', 'Rio hát lại nè!', 'Mình nghe lại nào!'],
      'demo.beat': ['Bé đếm cùng Rio nhé!', 'Bé xem và đếm nhé!', 'Mình cùng đếm nào!'],
      'demo.note': ['{thing}!'],
      'demo.animal': ['{sound}! {thing}!'],
      'turn.first': ['Đến lượt bé rồi!', 'Giờ tới bé nè!', 'Bé hát lại nào!'],
      'turn.firstName': ['Đầu tiên là {name} nhé!', 'Bắt đầu với {name} nhé!', 'Trước tiên là {name} nào!'],
      'turn.next': ['…rồi {name}!', '…tiếp theo là {name}!', 'Giờ là {name} nè!'],
      'turn.beat': ['Đến lượt bé — gõ quả trứng to {times} nhé!', 'Giờ tới bé! Gõ quả trứng to {times} nào!',
        'Đến lượt bé rồi! Gõ {times} nhé!'],

      'p.any': ['Bé ơi, mình gõ trứng nhé!', 'Bé gõ một quả trứng, nghe trứng hát nào!', 'Mình gõ quả trứng nào đây nhỉ?'],
      'p.next': ['Tiếp nào!', 'Thêm nữa nhé!', 'Giờ thì'],
      'p.colors': ['Bé ơi, gõ quả trứng {color} nhé!', 'Quả trứng {color} đâu rồi nhỉ? Bé gõ nào!', 'Bé gõ quả trứng {color} nào!'],
      'p.shapes': ['Bé ơi, gõ quả trứng {shape} nhé!', 'Quả trứng {shape} đâu rồi nhỉ? Bé gõ nào!', 'Bé gõ quả trứng {shape} nào!'],
      'p.shapes5': ['Bé ơi, gõ quả trứng {shape} {color} nhé!', 'Quả trứng {shape} {color} đâu rồi nhỉ? Bé gõ nào!',
        'Bé gõ quả trứng {shape} {color} nào!'],
      'p.size': ['Bé ơi, gõ quả trứng {size} nhé!', 'Quả trứng nào {size} nhỉ? Bé gõ nào!', 'Bé gõ quả trứng {size} nào!'],
      'p.sizeAny': ['Bé ơi, gõ quả trứng to nhé!', 'Quả trứng nào to nhỉ? Bé gõ nào!', 'Bé gõ quả trứng to nào!'],
      'p.animals': ['Ai kêu {sound}? Bé gõ {animal} nhé!', 'Bé ơi, ai kêu {sound} nhỉ? Gõ {animal} nào!',
        'Bé nghe nè: {sound}! {animal} đâu rồi? Bé gõ nào!'],
      'p.beat': ['Bé ơi, gõ quả trứng to {times} nhé!', 'Đến lượt bé! Gõ quả trứng to {times} nào!',
        'Bé gõ quả trứng to {times} nha!'],
      'p.count': ['Bé ơi, gõ quả trứng có {num} {items} nhé!', 'Mình đếm nhé! Quả trứng nào có {num} {items}? Bé gõ nào!',
        'Bé tìm quả trứng có {num} {items} rồi gõ nào!'],
      'p.letters': ['Bé ơi, gõ quả trứng chữ {letter} nhé!', 'Chữ {letter} ở đâu nhỉ? Bé gõ nào!', 'Bé gõ quả trứng chữ {letter} nào!'],
      'p.lower': ['Bé ơi, chữ {letter} hoa có một bạn nhỏ. Bé gõ chữ {lower} thường nhé!', 'Bé gõ chữ {lower} thường nào!',
        'Chữ {lower} thường ở đâu nhỉ? Bạn ấy đi cùng chữ {letter} hoa đó!'],
      'p.initial': ['Bé ơi, gõ bạn thú con bắt đầu bằng chữ {letter} nhé!', 'Bạn nào bắt đầu bằng chữ {letter}? Bé gõ nào!',
        'Bé nghe nè, chữ {letter}! Bạn thú con nào bắt đầu bằng chữ {letter}?'],
      'p.add': ['Bé ơi, {a} + {b} bằng mấy? Bé gõ quả trứng đáp án nhé!', 'Mình cộng nào! {a} + {b}. Bé gõ đáp án nhé!',
        'Bé tính nhé: {a} + {b}! Gõ đáp án nào!'],
      'p.sub': ['Bé ơi, {a} − {b} bằng mấy? Bé gõ quả trứng đáp án nhé!', 'Mình trừ nào! {a} − {b}. Bé gõ đáp án nhé!',
        'Có {a}, bớt đi {b}! Bé gõ đáp án nào!'],
      'p.oddeven': ['Bé ơi, gõ hết các số {parity} nhé!', 'Bé tìm hết các số {parity} rồi gõ nào!', 'Mình gõ các số {parity} nhé!'],

      'name.say': ['{thing}!'],
      'tap': ['{thing}!', 'Nhìn nè, {thing}!', 'Đây là {thing} nè!'],
      'right': ['Đúng rồi! {thing}!', '{thing}! Hay quá!', 'La la! {thing} nè!'],
      'right.label': ['Đúng rồi! {label}!', '{label}! Hay quá!', 'La la! {label} nè!'],
      'right.animal': ['{sound}! {thing}!', 'Đúng rồi! {sound}! {thing} nè!', '{sound}! {thing} hát theo nè!'],
      'right.beat': ['{num}! Bé gõ đủ {times} rồi!', '{num}! Bé đếm giỏi quá!', '{num}! Hoan hô, đủ {times} rồi!'],
      'right.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!', 'La la! {num} là số {parity}!'],
      'right.initial': ['Chữ {letter}, {word}!', 'Đúng rồi! Chữ {letter}, {word}!', 'La la! Chữ {letter}, {word}!'],
      'right.sum': ['{ans}! {expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', 'La la! {expr} bằng {ans}!'],
      'right.any': ['Đúng rồi! Hay quá!', 'La la! Đúng rồi!', 'Hoan hô! Bé hát hay quá!'],
      'countDone': ['{num} {items}! Hoan hô!', 'Mình đếm được {num} {items} rồi!', '{num} {items}! Bé đếm giỏi quá!'],
      'beatNudge': ['{done} rồi! Thêm {left} cái nữa!', 'Được {done} cái rồi! Bé gõ thêm {left} cái nữa nhé!',
        '{done} rồi nè! Gõ thêm {left} cái nào!'],
      'lantern': ['Hoa nở rồi!', 'Nhìn kìa, nụ hoa nở rồi!', 'Thêm một bông hoa nữa!'],

      'wrong.again': ['Đây là {got}. Bé nghe lại nhé!', 'Ồ, {got} nè! Bé nghe lại nhé!'],
      'wrong.againAnimal': ['{got} kêu {gotSound}! Bé nghe lại nhé!', '{gotSound}! Đây là {got}. Mình nghe lại nhé!',
        'Đây là {got} nè, {gotSound}! Bé nghe lại nào!'],
      'wrong.againCount': ['Quả trứng này có {got}. Bé nghe lại nhé!', 'Ồ, {got} nè! Mình nghe lại nhé!',
        'Mình đếm nhé: {got}! Bé nghe lại nào!'],
      'wrong.againParity': ['{num} là số {parity}! Bé nghe lại nhé!', '{num} là số {parity}. Mình nghe lại nhé!',
        '{num} là số {parity}! Bé nghe Rio hát lại nào!'],
      'wrong.againInitial': ['{word} bắt đầu bằng chữ {first}! Bé nghe lại nhé!', '{word} bắt đầu bằng chữ {first}. Mình nghe lại nhé!',
        '{word} bắt đầu bằng chữ {first}! Bé nghe Rio hát lại nào!'],
      'wrong.againAny': ['Bé nghe lại nhé!', 'Mình nghe lại nào!', 'Bé nghe Rio hát lại nhé!'],
      'wrong.thing': ['Đây là {got}. Mình gõ {want} nhé!', 'Ồ, {got} nè! {want} ở đâu nhỉ?', 'Cái này là {got}! Bé tìm {want} nào!'],
      'wrong.animal': ['{got} kêu {gotSound}! Mình tìm {want} nhé!', '{gotSound}! Đây là {got}. Ai kêu {sound} nhỉ? Bé tìm {want} nào!',
        'Đây là {got} nè, {gotSound}! Mình gõ {want} nhé!'],
      'wrong.count': ['Quả trứng này có {got}. Mình gõ quả trứng có {want} nhé!', 'Ồ, {got} nè! Bé tìm quả trứng có {want} nào!',
        'Mình đếm nhé: {got}! Mình cần {want} nè!'],
      'wrong.math': ['Đây là {got}. Mình đếm lại nhé!', 'Ồ, {got}. Bé đếm thêm lần nữa nào!', 'Đây là {got}! Bé nghĩ thêm chút nhé!'],
      'wrong.parity': ['{num} là số {parity}! Mình tìm số khác nhé!', '{num} là số {parity}. Bé gõ số khác nào!',
        '{num} là số {parity}! Bé thử số khác nhé!'],
      'wrong.initial': ['{word} bắt đầu bằng chữ {first}! Mình tìm lại nhé!', '{word} bắt đầu bằng chữ {first}. Bé gõ bạn khác nào!',
        '{word} bắt đầu bằng chữ {first}! Bé thử bạn khác nhé!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử quả trứng khác nào!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'stepDone': ['Hoan hô!', 'Bé hát hay quá!', 'Tuyệt vời!', 'La la la, hay quá!'],
      // ≈ 2.5 s of speech (playtest P2-2): ≤ 10 words
      'song': ['Mình cùng hát nào! Bé gõ trứng nhé!', 'Cùng hát nào! Bé vuốt qua các quả trứng nhé!',
        'Mình hát cùng nhau! Bé gõ trứng nào!'],
      'songShort': ['Cùng hát nào!', 'Mình hát nào!', 'Hát chung nào!'],
      'songDone': ['Bé hát hay quá!', '{child} hát hay quá!', 'La la la! Hay quá đi!', 'Oa, bài hát tuyệt quá!'],
      'cymbal.tap': ['Phù!', 'Phù phù!', 'Phù! Lấp lánh quá!'],
      'surprise.lamb': ['Nhìn kìa! Một bạn khủng long ba sừng con!', 'Thình thịch! Ai đó nhỉ?', 'Bạn khủng long ba sừng đến nhảy nè!'],
      'lamb.tap': ['Gừ! Chào bạn nhé!', 'Nhảy nhảy! Bạn ấy vui quá!', 'Hi hi! Chào bạn khủng long ba sừng!'],
      'surprise.bird': ['Nhìn kìa! Một bạn chim nhỏ!', 'Chíp chíp! Ai đó nhỉ?', 'Bạn chim đến nghe hát nè!'],
      'bird.tap': ['Chíp chíp! Bạn chim hát theo bé nè!', 'Chíp chíp! Hay quá!', 'Bạn chim hát cùng bé nè!'],
      'surprise.fireflies': ['Đom đóm đến nghe hát nè!', 'Nhìn kìa! Các bạn đom đóm!', 'Lấp lánh! Đom đóm đến chơi nè!'],
      'firefly.tap': ['Lấp lánh!', 'Vụt! Lấp lánh!', 'Lung linh quá!'],
      'rio.poke': ['Hi hi! Nhột quá!', 'Phù phù! Chào bé nè!', 'Rio vui quá!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Hay quá!', 'Hay lắm!'],
      'great': ['Bé {child} hát hay quá!', 'Hoan hô bé {child}!', 'Ngôi sao âm nhạc đây rồi!', 'Oa, bé {child} hát siêu giỏi!',
        'Hoan hô! Bé hát đúng bài của Rio rồi!', 'Bé thông minh quá!', 'Bé chơi nhạc hay quá!'],
      'party': ['Nhìn hoa của mình nè!', 'Hoan hô! Một ngày âm nhạc tuyệt quá!', 'Hoa nở hết rồi!'],
      'hint': ['Nhìn nè! Quả trứng này đang lấp lánh.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Rio giúp bé nhé! Gõ quả trứng này nè!',
        'Nhìn kìa, quả trứng này sáng lên!', 'Quả trứng lấp lánh đó! Bé chạm vào nhé!'],
      'idle': ['Mình gõ trứng nào!', 'Rio đang chờ bé nè!', 'Bé chạm vào một quả trứng nhé!', 'Bé {child} ơi, mình chơi tiếp nhé!',
        'Các quả trứng muốn hát nè!', 'Quả trứng nào tiếp theo đây nhỉ?'],

      'talk.intro': 'Mình cùng nói chuyện nhé!',
      'talk.colors': 'Quả trứng này màu gì nhỉ?',
      'talk.colorsAny': 'Cái này màu gì nhỉ?',
      'talk.colorsWhich': 'Quả trứng nào {color} nhỉ?',
      'talk.shapes': '{shape} là cái nào nhỉ?',
      'talk.shapesAny': 'Cái này hình gì nhỉ?',
      'talk.shapes5': '{shape} {color} là cái nào nhỉ?',
      'talk.size': 'Quả trứng nào {size} nhỉ?',
      'talk.sizeAny': 'Cái nào to nhỉ?',
      'talk.count': 'Có mấy {itemsPl} nào?',
      'talk.countAny': 'Có bao nhiêu cái nào?',
      'talk.animals': 'Ai kêu {sound} nhỉ?',
      'talk.animalsAny': 'Đây là bạn nào nhỉ?',
      'talk.animalsWho': 'Đây là bạn nào nhỉ?',
      'talk.letters': 'Chữ {letter} ở đâu nhỉ?',
      'talk.lettersAny': 'Đây là chữ gì nào?',
      'talk.lower': 'Chữ {lower} thường ở đâu nhỉ? Bạn của chữ {letter} hoa đó!',
      'talk.lowerAny': 'Đây là chữ thường nào nhỉ?',
      'talk.initial': '{word} bắt đầu bằng chữ gì nhỉ?',
      'talk.initialAny': 'Bạn này bắt đầu bằng chữ gì nhỉ?',
      'talk.add': '{a} + {b} bằng mấy nhỉ?',
      'talk.sub': '{a} − {b} bằng mấy nhỉ?',
      'talk.calc': 'Kết quả là bao nhiêu nào?',
      'talk.oddeven': 'Số nào là số {parity} nhỉ?',
      'talk.oddevenAny': 'Số này chẵn hay lẻ nhỉ?',
      'talk.right': ['Đúng rồi! Bé giỏi quá!', 'Chính xác! Hoan hô!', 'Oa, bé biết rồi!', 'Đúng luôn! Siêu quá!',
        'Bé thông minh quá!', 'Đúng rồi, bé {child} ơi!'],
      'talk.wrong': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.a': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.animal': 'Là {answer} đó, {sound}! Bé cố gắng lắm!',
      'talk.wrong.size': 'Là quả trứng {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình chơi tiếp với trứng nhé!',

      'session.done': ['Một ngày âm nhạc tuyệt quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Bé hát được bao nhiêu là bài! {stars} ngôi sao!']
    }
  };
  // count.0 … count.20: "One!" / "Một!"
  LANGS.forEach(function (l) {
    for (var i = 0; i <= MAX_COUNT; i++) {
      var w = NUM[l][i];
      STR[l]['count.' + i] = w.charAt(0).toUpperCase() + w.slice(1) + '!';
    }
  });

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'name.say': ['thing'], 'tap': ['thing'], 'right': ['thing'], 'right.label': ['label'], 'right.animal': ['sound', 'thing'],
    'right.beat': ['num', 'times'], 'right.parity': ['num', 'parity'], 'right.initial': ['letter', 'word'],
    'right.sum': ['expr', 'ans'], 'countDone': ['n'], 'beatNudge': ['done', 'left'],
    'wrong.thing': ['got', 'want'], 'wrong.animal': ['got', 'gotSound', 'want', 'sound'], 'wrong.count': ['got', 'want'],
    'wrong.math': ['got'], 'wrong.parity': ['num', 'parity'], 'wrong.initial': ['word', 'first'],
    'talk.colorsWhich': ['color'], 'talk.shapes': ['shape'], 'talk.shapes5': ['shape', 'color'],
    'talk.size': ['size'], 'talk.animals': ['sound'], 'talk.letters': ['letter'], 'talk.lower': ['letter'],
    'talk.initial': ['word'], 'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer', 'sound'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer'],
    'wrong.again': ['got'], 'wrong.againAnimal': ['got', 'gotSound'], 'wrong.againCount': ['got'],
    'wrong.againParity': ['num', 'parity'], 'wrong.againInitial': ['word', 'first'],
    'demo.note': ['thing'], 'demo.animal': ['sound', 'thing'], 'turn.firstName': ['name'], 'turn.next': ['name'],
    'turn.beat': ['times']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'p.shapes5': 'p.shapes', 'p.size': 'p.sizeAny', 'countDone': 'stepDone', 'beatNudge': 'idle',
    'name.say': 'praise', 'tap': 'praise', 'right': 'right.any', 'right.animal': 'right', 'wrong.animal': 'wrong.thing',
    'talk.colorsWhich': 'talk.colorsAny', 'talk.shapes': 'talk.shapesAny', 'talk.shapes5': 'talk.shapes',
    'talk.size': 'talk.sizeAny', 'talk.animals': 'talk.animalsAny', 'talk.letters': 'talk.lettersAny',
    'talk.lower': 'talk.lowerAny', 'talk.initial': 'talk.initialAny', 'talk.add': 'talk.calc', 'talk.sub': 'talk.calc',
    'talk.oddeven': 'talk.oddevenAny', 'talk.wrong.animal': 'talk.wrong.any',
    'wrong.againAnimal': 'wrong.again', 'demo.note': 'praise', 'demo.animal': 'demo.note', 'turn.firstName': 'turn.first',
    'turn.next': 'turn.first', 'turn.beat': 'turn.first' };
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^p\./.test(k)) FALLBACK[k] = 'p.any';
    else if (/^right\./.test(k)) FALLBACK[k] = 'right.any';
    else if (/^talk\.wrong/.test(k)) FALLBACK[k] = 'talk.wrong.any';
    else if (/^wrong\.again/.test(k)) FALLBACK[k] = 'wrong.againAny';
    else if (/^wrong/.test(k)) FALLBACK[k] = 'wrong.any';
  });

  var CHILD_FALLBACK = { en: 'friend', vi: 'bé' };
  var CHILD_PREFERRED = { 'ui.welcome': 1 };

  // ---------------------------------------------------------------- helpers
  function L(lang) { return lang === 'vi' ? 'vi' : 'en'; }
  function rnd(rng) {
    var v;
    try {
      if (rng && typeof rng.next === 'function') v = rng.next();
      else if (typeof rng === 'function') v = rng();
      else v = Math.random();
    } catch (e) { v = 0; }
    v = +v;
    return isFinite(v) ? Math.max(0, Math.min(0.999999, v)) : 0;
  }
  function stripMarks(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
  }
  // tone marks only (sắc huyền hỏi ngã nặng): "ếch" → "êch", so its first letter is Ê
  function stripTones(s) {
    return String(s).normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC');
  }
  function capFirst(s) {
    return String(s).replace(/^(\s*[“"'(¡¿]*)(\p{Ll})/u, function (m, pre, ch) { return pre + ch.toUpperCase(); });
  }
  function upper(v) { return String(v).toUpperCase(); }
  function rawVal(v) {
    if (v && typeof v === 'object') { if ('value' in v) return v.value; if ('nameValue' in v) return v.nameValue; }
    return v;
  }
  function present(v) {
    if (v == null || v === '') return false;
    if (typeof v === 'object') { var r = rawVal(v); return r != null && r !== '' && r !== v; }
    return true;
  }
  function obj(o) { return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
  function num(v) {
    v = rawVal(v);
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    if (typeof v !== 'string' || !/^\s*-?\d+\s*$/.test(v)) return null;
    return parseInt(v, 10);
  }
  function numberName(lang, n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) return String(n);
    if (v >= 0 && v <= 20) return NUM[L(lang)][v];
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
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }
  function low(v) { var r = rawVal(v); return String(r == null ? '' : r).toLowerCase(); }

  function animalOf(v) {
    if (v && typeof v === 'object') v = v.animal != null ? v.animal : rawVal(v);
    if (v == null) return null;
    var s = String(v).toLowerCase().replace(/\.svg$/, '').replace(/^(animal|egg|sound)_/, '');
    var ALIAS = { chicken: 'chick', duckling: 'duck', owlet: 'owl', dinosaur: 'dino', froglet: 'frog' };
    if (ALIAS[s]) s = ALIAS[s];
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function soundOf(lang, a) { a = animalOf(a); return a ? NAMES[L(lang)].sound[a] : null; }
  function sizeOf(v) {
    if (v === true) return 'big';
    if (v === false) return 'small';
    var s = low(v);
    if (/(^|[_:\-\s])(big|large)($|[_:\-\s])/.test(s)) return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  // a thing's size: big true/false, or size 'big'/'small'; a size that is neither (a 'mid' distractor) → null
  function thingSize(t) {
    t = obj(t);
    if (typeof t.size === 'string' && t.size && !sizeOf(t.size) && t.nameKind !== 'size') return null;
    if (t.big === true || t.big === false) return t.big ? 'big' : 'small';
    if (t.nameKind === 'size' && sizeOf(t.nameValue)) return sizeOf(t.nameValue);
    return sizeOf(t.size);
  }
  function shapeOf(v) { var s = low(v); return NAMES.en.shape[s] != null ? s : null; }
  function colorOf(v) { var s = low(v); return NAMES.en.color[s] != null ? s : null; }
  function eggKind(v) {
    var s = low(v);
    if (KIND_ALIAS[s]) s = KIND_ALIAS[s];
    return EGG_KINDS.indexOf(s) >= 0 ? s : null;
  }
  // the counted-items kind: 'dots' | 'beat' (def when neither)
  function itemsKind(v, def) {
    if (v && typeof v === 'object') v = v.kind != null ? v.kind : v.items;
    var s = low(v);
    if (s === 'dots' || s === 'dot') return 'dots';
    if (s === 'beat' || s === 'beats' || s === 'big') return 'beat';
    return def || 'dots';
  }
  function itemsWord(lang, kind, n, run) {
    var tbl = (run ? RUN : ITEMS)[L(lang)][itemsKind(kind)];
    return tbl[n === 1 ? 0 : 1];
  }
  // "once" / "two times" / vi "một cái", "ba cái"
  function timesWord(lang, n) {
    if (L(lang) === 'vi') return numberName('vi', n) + ' cái';
    return n === 1 ? 'once' : n === 2 ? 'twice' : numberName('en', n) + ' times';
  }

  // ---- words for the 'initial' topic: tolerant of whatever shape content.js gives SE.WORDS
  function normEntry(e, lang) {
    if (e == null) return null;
    if (typeof e === 'string') return { word: e, id: e };
    if (typeof e !== 'object') return null;
    var w = e[lang], out = { id: e.id, animal: e.animal, initial: e.initial, word: e.word };
    if (typeof w === 'string') out.word = w;
    else if (w && typeof w === 'object') { out.word = w.word || w.text; if (w.initial) out.initial = w.initial; }
    if (out.initial && typeof out.initial === 'object') out.initial = out.initial[lang];
    if (out.word == null && e.text != null) out.word = e.text;
    if (out.word == null) return null;
    out.word = String(out.word);
    if (!out.animal) out.animal = animalOf(e.sprite) || animalOf(out.id) || null;
    return out;
  }
  function entries(lang) {
    var src = SE.WORDS, list = [];
    if (src && Array.isArray(src[lang])) list = src[lang];
    else if (Array.isArray(src)) list = src;
    var out = [];
    for (var i = 0; i < list.length; i++) { var e = normEntry(list[i], lang); if (e) out.push(e); }
    return out;
  }
  function findEntry(lang, v) {
    if (v && typeof v === 'object') v = v.word != null ? v.word : rawVal(v) != null ? rawVal(v) : v.id;
    if (v == null || v === '') return null;
    var s = String(v), i, k;
    var pools = [entries(lang), defaultEntries(lang)];
    for (k = 0; k < pools.length; k++) for (i = 0; i < pools[k].length; i++) {
      var e = pools[k][i];
      if (e.word === s || String(e.id) === s || e.animal === s) return e;
    }
    return null;
  }
  function wordName(lang, v) {
    var e = findEntry(lang, v);
    if (e) return e.word;
    var a = animalOf(v);
    if (a) return NAMES[lang].word[a];
    var r = rawVal(v);
    return String(r == null ? '' : r).replace(/_/g, ' ');
  }
  function firstLetter(lang, w) {
    var s = lang === 'vi' ? stripTones(w) : stripMarks(w);
    return s.charAt(0).toUpperCase();
  }
  function initialOf(lang, animalOrWord) {
    var w = wordName(lang, animalOrWord);
    if (!w) return null;
    var e = findEntry(lang, animalOrWord) || findEntry(lang, w);
    var f = e && e.initial ? e.initial : firstLetter(lang, w);
    return { word: w, first: String(f) };
  }

  function name(lang, kind, value, opts) {
    lang = L(lang);
    opts = opts || {};
    value = rawVal(value);
    var tbl, vi = lang === 'vi';
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'dots': {
        var n = num(value);
        return n == null ? String(value) : numberName(lang, n) + ' ' + itemsWord(lang, 'dots', n);
      }
      case 'egg': {
        var bc = colorOf(value), bs = sizeOf(value);
        if (bs) return vi ? 'quả trứng ' + NAMES.vi.size[bs] : NAMES.en.size[bs] + ' egg';
        if (bc) return vi ? 'quả trứng ' + NAMES.vi.color[bc] : NAMES.en.color[bc] + ' egg';
        return vi ? 'quả trứng' : 'egg';
      }
      case 'big': return vi ? 'quả trứng to' : 'big egg';
      case 'letter': {
        var s = String(value);
        if (vi) return LETTER_VI[upper(s)] || s.toLowerCase();
        return s;
      }
      case 'sum': case 'diff': return exprWords(lang, value);
      case 'text': {
        var tx = String(value);
        if (splitOp(tx)) return exprWords(lang, tx);
        if (num(tx) != null) return numberName(lang, num(tx));
        if (isLetter(tx)) return name(lang, 'letter', tx);
        if (animalOf(tx)) return NAMES[lang].animal[animalOf(tx)];
        if (tx === 'odd' || tx === 'even') return NAMES[lang].parity[tx];
        return tx;
      }
      case 'word': return wordName(lang, value);
      case 'color': case 'hue': {
        var c = low(value);
        tbl = (kind === 'hue' || opts.bare) ? NAMES[lang].hue : NAMES[lang].color;
        return tbl[c] != null ? tbl[c] : String(value);
      }
      case 'animal': {
        var a = animalOf(value);
        if (!a) return String(value == null ? '' : value).replace(/_/g, ' ');
        return NAMES[lang].animal[a];
      }
      case 'sound': { var sa = animalOf(value); return sa ? NAMES[lang].sound[sa] : String(value == null ? '' : value); }
      case 'size': { var sz2 = sizeOf(value); return sz2 ? NAMES[lang].size[sz2] : String(value); }
      case 'parity': {
        if (num(value) != null) return numberName(lang, num(value));
        tbl = NAMES[lang].parity;
        return tbl[value] != null ? tbl[value] : String(value);
      }
      default:
        tbl = NAMES[lang][kind];
        if (tbl && tbl[value] != null) return tbl[value];
        return String(value == null ? '' : value).replace(/_/g, ' ');
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
    if (v >= 0 && v <= 20 && !(lang === 'vi' && v === 0)) addForms(out, [NUM[lang][v]]);
    if (lang === 'vi') addForms(out, ['số ' + NUM.vi[v]]);
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }

  // a Talk-time choice / picture thing → [kind, value].
  // Egg things: egg {color} → colour (with `big` → size); shape {shape} → shape; big {n} → number (else size big);
  // dots / number {n} → number; animal / sound {animal} → animal; glyph {text} → text; icons: color {color},
  // number {n}, size {big}; {nameKind, nameValue} wins; {id, thing, value}.
  function kvOf(t) {
    var kv = kvRaw(t);
    return [kv[0], scalar(kv[1])];
  }
  function kvRaw(t) {
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') return kvRaw(t.thing);
    if (t.nameKind != null) return [t.nameKind === 'sound' ? 'animal' : t.nameKind, t.nameValue];
    switch (low(t.kind)) {
      case 'color': case 'blob': case 'paint':
        return ['color', t.color != null ? t.color : t.value];
      case 'egg': case 'tom': case 'obj':
        if (t.big === true || t.big === false) return ['size', t.big ? 'big' : 'small'];
        if (t.color != null) return ['color', t.color];
        return ['egg', t.value];
      case 'shape':
        if (t.shape != null) return ['shape', t.shape];
        return t.value != null ? ['shape', t.value] : ['color', t.color];
      case 'size': {
        var sz = thingSize(t);
        return ['size', sz != null ? sz : t.value];
      }
      case 'big':
        if (t.n != null) return ['number', t.n];
        return ['size', 'big'];
      case 'animal': case 'sound':
        if (t.big === true || t.big === false) return ['size', t.big ? 'big' : 'small'];
        return ['animal', t.animal != null ? t.animal : t.value];
      case 'number': case 'dots': return ['number', t.n != null ? t.n : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'glyph': case 'text': case 'tag': return ['text', t.text != null ? t.text : (t.n != null ? t.n : t.value)];
      case 'parity': return ['parity', t.value];
    }
    return [t.kind, t.value];
  }
  function words(lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    if (kind === 'blob') kind = 'color';
    if (kind === 'sound') kind = 'animal';
    value = rawVal(value);
    var out = [];
    switch (kind) {
      case 'number': return numberWords(lang, value);
      case 'dots': {
        var dn = num(value);
        out = numberWords(lang, value);
        if (dn != null) addForms(out, [name(lang, 'dots', dn), dn + ' ' + itemsWord(lang, 'dots', dn)]);
        return out;
      }
      case 'egg': {
        if (colorOf(value)) return words(lang, 'color', value).concat(addForms([], [name(lang, 'egg', value)]));
        if (sizeOf(value)) return words(lang, 'size', value).concat(addForms([], [name(lang, 'egg', value)]));
        return addForms(out, [name(lang, 'egg', value)]);
      }
      case 'big': return words(lang, 'size', 'big');
      case 'parity': if (num(value) != null) return numberWords(lang, num(value)); break;
      case 'text': {
        var tx = String(value);
        if (splitOp(tx)) return words(lang, 'sum', tx);
        if (num(tx) != null) return numberWords(lang, num(tx));
        if (isLetter(tx)) return words(lang, 'letter', tx);
        if (animalOf(tx)) return words(lang, 'animal', tx);
        if (tx === 'odd' || tx === 'even') return words(lang, 'parity', tx);
        return addForms(out, [tx]);
      }
      case 'letter': {
        var U = upper(value);
        var base = [U.toLowerCase(), 'letter ' + U.toLowerCase(), 'chữ ' + U.toLowerCase()];
        if (lang === 'vi') {
          base.push(LETTER_VI[U] || U.toLowerCase());
          if (LETTER_VI[U]) base.push('chữ ' + LETTER_VI[U]);
          base = base.concat(LETTER_WORDS_VI[U] || []);
          // no stripped forms: Ă/Â≠A, Đ≠D, Ê≠E, Ô/Ơ≠O, Ư≠U
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
        return addForms(out, [exprWords(lang, value), p[0] + ' ' + (p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') :
          (lang === 'vi' ? 'trừ' : 'minus')) + ' ' + p[2]]);
      }
      case 'word': {
        var a = animalOf(value) || (findEntry(lang, value) || {}).animal;
        var list = [wordName(lang, value)];
        if (a) list = list.concat([NAMES[lang].animal[a], NAMES[lang].sound[a]], WORDS[lang].animal[a] || []);
        return addForms(out, list);
      }
      case 'animal': {
        var an = animalOf(value);
        if (!an) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].animal[an], NAMES[lang].word[an], NAMES[lang].sound[an]].concat(WORDS[lang].animal[an] || []));
      }
      case 'color': case 'hue': {
        var c = low(value);
        if (NAMES.en.color[c] == null) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].color[c], NAMES[lang].hue[c]].concat(WORDS[lang].color[c] || []));
      }
      case 'size': {
        var sz = sizeOf(value);
        if (!sz) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].size[sz]].concat(WORDS[lang].size[sz] || []));
      }
      case 'shape': case 'shapeH': {
        var sh = shapeOf(value);
        if (!sh) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].shape[sh], NAMES[lang].shapeH[sh]].concat(WORDS[lang].shape[sh] || []));
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

  // ---------------------------------------------------------------- phrase: a name for a sentence
  // {nameKind, nameValue} | {kind, value} | (kind, value). EN gets "the" where natural; VI the plain name.
  function scalar(v) { return (typeof v === 'string' || (typeof v === 'number' && isFinite(v))) ? v : null; }
  function thingOf(a, b) {
    if (typeof a === 'string') return { k: a, v: scalar(b) };
    var t = obj(a);
    var hasName = t.nameKind != null;
    return { k: hasName ? scalar(t.nameKind) : scalar(t.kind), v: scalar(hasName ? t.nameValue : t.value),
      size: t.size, animal: t.animal, text: t.text };
  }
  function phraseOf(lang, th) {
    var vi = lang === 'vi', k = th.k, v = th.v, out = '';
    switch (k) {
      case 'color': case 'hue': out = name(lang, 'color', v); break;
      case 'shape': case 'shapeH': out = vi ? name(lang, 'shape', v) : 'the ' + name(lang, 'shape', v); break;
      case 'animal': case 'word': out = vi ? name(lang, 'animal', v) : 'the ' + name(lang, 'animal', v); break;
      case 'sound': out = name(lang, 'sound', v); break;
      case 'egg': case 'big': out = vi ? name(lang, k, v) : 'the ' + name(lang, k, v); break;
      case 'size': out = vi ? 'quả trứng ' + name(lang, 'size', v) : 'the ' + name(lang, 'size', v) + ' one'; break;
      case 'dots': out = num(v) != null ? name(lang, k, num(v)) : ''; break;
      case 'letter': {
        var s = String(v == null ? th.text : v);
        var small = s !== s.toUpperCase();
        out = vi ? 'chữ ' + s + (small ? ' thường' : '') : (small ? 'small ' : 'letter ') + s;
        break;
      }
      case 'number': case 'parity':
        if (num(v) != null) out = vi ? 'số ' + numberName(lang, num(v)) : 'number ' + numberName(lang, num(v));
        else out = vi ? 'số ' + name(lang, 'parity', v) : name(lang, 'parity', v);
        break;
      case 'sum': case 'diff': out = exprText(v); break;
      case 'text': case 'glyph': {
        var tx = String(v == null ? th.text : v);
        if (splitOp(tx)) out = exprText(tx);
        else if (num(tx) != null) return phraseOf(lang, { k: 'number', v: num(tx) });
        else if (isLetter(tx)) return phraseOf(lang, { k: 'letter', v: tx });
        else out = tx;
        break;
      }
      default: out = v == null ? '' : String(v).replace(/_/g, ' ');
    }
    return lang === 'en' ? anFix(out) : out;
  }

  // ---------------------------------------------------------------- eggPhrase: a singing egg named
  // thing = { kind: egg|shape|big|dots|animal|glyph (or a Talk icon: color|number|size|sound), color?, shape?, n?, animal?,
  //           text?, big?, nameKind?, nameValue? }
  // opts = { art: 'the' (default) | 'a' | null (EN article), color: true|false (shape egg: say its colour; default no),
  //          size: bool (colour egg: say big/small; default when nameKind is 'size' or big is set), egg: bool (VI animal:
  //          "vịt con"), bare: bool (numbers without "number": "five") }. Unknown things → their name phrase (or '').
  function eggPhrase(lang, t, opts) {
    lang = L(lang);
    t = obj(t);
    opts = opts || {};
    var vi = lang === 'vi';
    var art = opts.art === undefined ? 'the' : opts.art;
    var kind = eggKind(t.kind) || (['color', 'size', 'letter', 'text', 'sound'].indexOf(t.kind) >= 0 ? t.kind : null);
    if (t.kind === 'number' && t.text == null && t.n != null) kind = 'number';
    if (!kind) return t.nameKind != null ? phraseOf(lang, thingOf(t)) : '';
    var col = colorOf(t.color);
    function withArt(s) { return art ? art + ' ' + s : s; }
    switch (kind) {
      case 'egg': {
        var sz = opts.size === false ? null : thingSize(t);
        if (opts.size !== true && t.nameKind !== 'size' && t.big !== true && t.big !== false) sz = null;
        var useCol = col && (opts.color === true || !sz);   // color:false only hides the colour when the size is said
        if (vi) return 'quả trứng' + (sz ? ' ' + NAMES.vi.size[sz] : '') + (useCol ? ' ' + NAMES.vi.color[col] : '');
        return anFix(withArt((sz ? NAMES.en.size[sz] + ' ' : '') + (useCol ? NAMES.en.color[col] + ' ' : '') + 'egg'));
      }
      case 'shape': {
        var sh = shapeOf(t.shape != null ? t.shape : (t.nameKind === 'shape' ? t.nameValue : null));
        var useC = col && opts.color === true;
        if (!sh) return useC ? (vi ? 'quả trứng ' + NAMES.vi.color[col] : anFix(withArt(NAMES.en.color[col] + ' egg'))) : (vi ? 'quả trứng' : withArt('egg'));
        if (vi) return 'quả trứng ' + NAMES.vi.shape[sh] + (useC ? ' ' + NAMES.vi.color[col] : '');
        return anFix(withArt((useC ? NAMES.en.color[col] + ' ' : '') + NAMES.en.shape[sh] + ' egg'));
      }
      case 'big':
        return vi ? 'quả trứng to' : withArt('big egg');
      case 'dots': {
        var n = num(t.n != null ? t.n : (t.nameKind === 'number' || t.nameKind === 'dots' ? t.nameValue : null));
        if (n == null) return vi ? 'quả trứng có chấm' : anFix(withArt('dot egg'));
        return vi ? 'quả trứng có ' + name(lang, 'dots', n) : anFix(withArt('egg with ' + name(lang, 'dots', n)));
      }
      case 'animal': case 'sound': {
        var an = animalOf(t.animal != null ? t.animal : (t.nameKind === 'animal' || t.nameKind === 'sound' ? t.nameValue : null));
        if (!an) return '';
        if (vi) return NAMES.vi.animal[an];
        return anFix(withArt(NAMES.en.animal[an]));
      }
      case 'glyph': case 'text': case 'letter': case 'number': {
        var tx = t.text != null ? t.text : (t.n != null ? t.n : t.nameValue);
        if (tx == null) return '';
        var k2 = kind === 'number' || num(tx) != null ? 'number' : (isLetter(String(tx)) ? 'letter' : 'text');
        if (opts.bare && k2 === 'number') return numberName(lang, num(tx));
        return phraseOf(lang, { k: k2, v: k2 === 'number' ? num(tx) : String(tx) });
      }
      case 'color':
        return col ? name(lang, 'color', col) : '';
      case 'size': {
        var s2 = thingSize(t);
        return s2 ? phraseOf(lang, { k: 'size', v: s2 }) : '';
      }
    }
    return '';
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function derive(lang, params, key) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    var pth = obj(p.thing);
    // {hue} = bare colour (vi "đỏ")
    if (!present(p.hue) && present(p.color)) p.hue = name(lang, 'hue', rawVal(p.color));
    // VI Talk shapes: "Hình trái tim là cái nào nhỉ?"
    if (lang === 'vi' && present(p.shape) && /^talk\.shapes/.test(key) && shapeOf(rawVal(p.shape)))
      p.shape = { kind: 'shapeH', value: shapeOf(rawVal(p.shape)) };
    // {size} from big
    if (!present(p.size) && (p.big === true || p.big === false)) p.size = p.big ? 'big' : 'small';
    // {word} + {sound} from animal
    var an = present(p.animal) ? animalOf(p.animal) : null;
    if (an && !present(p.word)) p.word = wordName(lang, an);
    if (an && !present(p.sound)) p.sound = NAMES[lang].sound[an];
    if (present(p.word)) p.word = wordName(lang, p.word);
    if (present(p.sound) && animalOf(p.sound)) p.sound = NAMES[lang].sound[animalOf(p.sound)];
    if (present(p.gotSound) && animalOf(p.gotSound)) p.gotSound = NAMES[lang].sound[animalOf(p.gotSound)];
    // {letter} / {lower}
    if (!present(p.letter) && present(p.text) && isLetter(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (/^(p|talk)\.lower$/.test(key)) { p.lower = p.letter.toLowerCase(); p.letter = p.letter.toUpperCase(); }
      if (!present(p.lower)) p.lower = present(p.small) ? String(rawVal(p.small)) : p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    // {expr}
    if (!present(p.expr)) {
      var ex = present(p.text) && splitOp(rawVal(p.text)) ? rawVal(p.text) : present(p.sum) ? rawVal(p.sum) :
        present(p.diff) ? rawVal(p.diff) : null;
      if (ex == null && present(p.a) && present(p.b) && present(p.op)) ex = rawVal(p.a) + rawVal(p.op) + rawVal(p.b);
      if (ex != null) p.expr = exprText(ex);
    } else p.expr = exprText(rawVal(p.expr));
    if (present(p.a)) p.a = String(rawVal(p.a));
    if (present(p.b)) p.b = String(rawVal(p.b));
    // {num} + {times} + {items} from n (+ kind 'dots' | 'beat')
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (!present(p.times) && c != null && c >= 1) p.times = timesWord(lang, c);
    // {timesHead}: the number said first in a beat ask ("Three times!" / "Ba cái nhé!"; n = 1 "Once!" / "Một cái thôi nhé!")
    if (!present(p.timesHead) && c != null && c >= 1) p.timesHead = lang === 'vi' && c === 1 ? 'một cái thôi' : timesWord(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    // {done} / {left}: beats so far / still to go (beatNudge {i, n})
    var bi = present(p.i) ? num(p.i) : null;
    if (bi != null && c != null && bi >= 1) {
      if (!present(p.done)) p.done = numberName(lang, bi);
      if (!present(p.left)) p.left = numberName(lang, Math.max(1, c - bi));
    }
    var ik = itemsKind(present(p.kind) ? p.kind : pth.kind, key === 'p.beat' ? 'beat' : 'dots');
    if (!present(p.items) || typeof p.items !== 'string' || /^(dots?|beats?|big)$/.test(p.items)) {
      p.items = itemsWord(lang, present(p.items) ? p.items : ik, c == null ? 2 : c);
    }
    // {itemsPl}: always the plural ("How many dots?" even when the shown egg has one dot)
    if (!present(p.itemsPl)) p.itemsPl = itemsWord(lang, ik, 2);
    // {got}/{want}/{label} objects → phrases; {thing} object → its egg phrase
    ['got', 'want', 'label'].forEach(function (q) {
      if (p[q] && typeof p[q] === 'object') p[q] = present(p[q]) ? phraseOf(lang, thingOf(p[q])) : (eggPhrase(lang, p[q]) || '');
    });
    if (p.thing && typeof p.thing === 'object') p.thing = eggPhrase(lang, p.thing);
    return p;
  }

  function resolveParam(lang, key, val) {
    if (!present(val)) return '';
    if (typeof val === 'object') {
      var kd = val.kind != null ? val.kind : val.nameKind;
      return kd ? name(lang, kd, rawVal(val)) : '';
    }
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity':
        return name(lang, key, val);
      default: return String(val);
    }
  }

  // English "a oval" → "an oval", but never the LETTER A. No regex look-behind (iOS < 16.4).
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
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1')
      .replace(/(^|[.!?]\s*)—\s*/g, '$1').replace(/\s—\s*([!?.])/g, '$1').trim();
    if (lang === 'en') out = anFix(out);
    out = out.replace(/([.!?:]\s+)(\p{Ll})/gu, function (m, pre, ch) { return pre + ch.toUpperCase(); });
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
    if (STR[lang][key] == null && STR.en[key] == null && /^p\./.test(key)) key = 'p.any';
    var p = derive(lang, params, key);
    for (var hop = 0; hop < 4 && !needsMet(key, p) && FALLBACK[key]; hop++) {
      key = FALLBACK[key];
      p = derive(lang, params, key);
    }
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

  // the step prompt; opts.next → "Next one! Tap the red egg!" / "Now, who says quack? …" (main: the 2nd+ step).
  // A p.next variant without end punctuation ("Now," / "Giờ thì") runs into the prompt (its first letter lower-cased).
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    var line = I18N.t(lang, key, params, opts.rng);
    if (!opts.next || key === 'p.beat') return line;   // a beat ask starts with its number, never "Next one!" (P1-1)
    var pre = I18N.t(lang, 'p.next', null, opts.rng);
    if (L(lang) === 'vi') {
      // no "Bé ơi," in mid-sentence after a prefix ("Thêm nữa nhé! Bé gõ …", "Giờ thì bé gõ …")
      if (/^Bé ơi, (gõ|tìm|chạm) /.test(line)) line = line.replace(/^Bé ơi, (gõ|tìm|chạm) /, 'Bé $1 ');
      else if (/^Bé ơi, /.test(line)) { line = line.slice(7); line = line.charAt(0).toUpperCase() + line.slice(1); }
      // never the same particle twice ("Tiếp nào! … nào!", "… nữa nhé! … nhé!"): take another prefix
      var PT = /(nhé|nào|nhỉ)[!?]$/, has = function (q) { var m = PT.exec(q); return !!m && line.indexOf(m[1] + q.slice(-1)) >= 0; };
      if (PT.exec(pre) && has(pre)) {
        var alts = [].concat(I18N.raw(lang, 'p.next') || []).filter(function (q) { return !has(q); });
        if (alts.length) pre = alts[0];
      }
    }
    if (/[!?.…]$/.test(pre)) return pre + ' ' + line;
    var lowered = /^\p{Lu}\p{Ll}/u.test(line) ? line.charAt(0).toLowerCase() + line.slice(1) : line;
    return pre + ' ' + lowered;
  };

  I18N.name = name;
  I18N.words = words;
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.soundOf = function (lang, a) { return soundOf(lang, a) || ''; };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.wordEntry = function (lang, v) { return findEntry(L(lang), v); };
  I18N.initialOf = function (lang, v) { return initialOf(L(lang), v); };
  I18N.eggPhrase = eggPhrase;
  I18N.piecePhrase = eggPhrase;
  // any thing → a phrase: egg things / Talk icons via eggPhrase, else {nameKind, nameValue} / (kind, value)
  I18N.phrase = function (lang, a, b) {
    lang = L(lang);
    if (a && typeof a === 'object' && a.thing && typeof a.thing === 'object') a = a.thing;
    if (a && typeof a === 'object' && a.kind != null) { var s = eggPhrase(lang, a); if (s) return s; }
    return phraseOf(lang, thingOf(a, b));
  };
  I18N.choiceWords = function (lang, choice) { return words(lang, choice); };   // Talk choice {id, thing} → spoken forms
  I18N.kindValue = kvOf;
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.SHAPES = SHAPES.slice();
  I18N.COLORS = COLORS.slice();
  I18N.EGG_KINDS = EGG_KINDS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;
  I18N.MAX_COUNT = MAX_COUNT;

  // ---------------------------------------------------------------- game lines
  // an egg thing rebuilt from {nameKind, nameValue} + topic (when main did not pass e.thing)
  function thingFromName(nk, nv, topic, params, pk) {
    params = obj(params);
    switch (nk) {
      case 'color': return { kind: topic === 'shapes' ? 'shape' : 'egg', color: nv, nameKind: nk, nameValue: nv };
      case 'size': return { kind: 'egg', big: sizeOf(nv) === 'big', color: params.color, nameKind: nk, nameValue: nv };
      case 'shape': return { kind: 'shape', shape: nv, color: params.color, nameKind: nk, nameValue: nv };
      case 'animal': case 'word': case 'sound': return { kind: 'animal', animal: nv, nameKind: 'animal', nameValue: nv };
      case 'number':
        if (pk === 'p.beat') return { kind: 'big', n: num(nv), nameKind: nk, nameValue: nv };
        if (topic === 'count' || pk === 'p.count') return { kind: 'dots', n: num(nv), nameKind: nk, nameValue: nv };
        return { kind: 'glyph', text: String(nv), n: num(nv), nameKind: nk, nameValue: nv };
      case 'letter': case 'text': case 'parity':
        return { kind: 'glyph', text: String(nv), n: num(nv) != null ? num(nv) : undefined, nameKind: nk, nameValue: nv };
    }
    return null;
  }
  // the egg thing of an event: e.thing — or e itself when it carries kind / nameKind — or rebuilt from e.got
  function evThing(ev, from) {
    ev = obj(ev);
    if (ev.thing && typeof ev.thing === 'object') return ev.thing;
    if (eggKind(ev.kind)) return ev;
    var src = obj(from != null ? from : ev);
    if (src.nameKind != null) return thingFromName(src.nameKind, src.nameValue, ev.topic, ev.params, ev.promptKey) || src;
    return {};
  }
  // what the current step is about: size round? shapes-with-colours round? beat step?
  function ctxOf(ev) {
    ev = obj(ev);
    var params = obj(ev.params), topic = ev.topic, pk = String(ev.promptKey || '');
    var want = thingOf(ev.want);
    return {
      topic: topic, params: params, beat: pk === 'p.beat' || ev.mode === 'beat',
      size: topic === 'size' || pk === 'p.size' || want.k === 'size' || present(params.size),
      // shapes with colours (age 5): only p.shapes5 names the colour — content.js may also send {color} with p.shapes
      // (the round's one egg colour), which must not be said
      mix: pk ? pk === 'p.shapes5' : (present(params.shape) && present(params.color))
    };
  }
  function nameOpts(t, cx, egg) {
    var k = eggKind(t.kind);
    return { size: k === 'egg' ? (cx.size || undefined) : undefined,
      color: k === 'shape' ? cx.mix : (k === 'egg' && cx.size ? false : undefined), egg: !!egg };
  }
  // the spoken name of an egg ("the red egg", "the egg with three dots", "letter B", "five")
  function plainName(lang, ev, egg) {
    var t = evThing(ev), cx = ctxOf(ev);
    var k = eggKind(t.kind);
    if (k === 'glyph') {
      var tx = t.text != null ? t.text : t.nameValue;
      if (num(tx) != null) return numberName(lang, num(tx));
    }
    var s = eggPhrase(lang, t, nameOpts(t, cx, egg));
    if (!s && t.nameKind != null) s = phraseOf(lang, thingOf(t));
    return s;
  }

  // an egg's plain name: sayName(lang, thing | e) → "the red egg" / "quả trứng màu đỏ"
  I18N.sayName = function (lang, thing) {
    lang = L(lang);
    var e = obj(thing);
    if (!e.thing && !eggKind(e.kind) && e.nameKind == null) return '';
    return plainName(lang, e.thing || eggKind(e.kind) ? e : { thing: e }, false) || '';
  };
  // "The red egg!" / "Quả trứng màu đỏ!" (a brush, a Talk picture tap)
  I18N.sayPickup = function (lang, ev, rng) {
    lang = L(lang);
    var s = plainName(lang, ev, false);
    return s ? I18N.t(lang, 'name.say', { thing: s }, rng) : I18N.t(lang, 'praise', null, rng);
  };
  // "Look, the red egg!" / "Nhìn nè, quả trứng màu đỏ!"
  I18N.sayTap = function (lang, ev, rng) {
    lang = L(lang);
    var s = plainName(lang, ev, false);
    return s ? I18N.t(lang, 'tap', { thing: s }, rng) : I18N.t(lang, 'p.any', null, rng);
  };

  // `right {id, thing, x, y, count?: {n}}` (+ topic, params, promptKey) → the right line.
  I18N.sayRight = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = evThing(ev), cx = ctxOf(ev), k = eggKind(t.kind), topic = cx.topic, params = cx.params;
    var cnt = obj(ev.count);
    // beat mode: the Nth beat → "Three! You beat it three times!"
    if (k === 'big' || cx.beat) {
      var bn = num(cnt.n) != null ? num(cnt.n) : num(params.n);
      if (bn != null && bn >= 1) return I18N.t(lang, 'right.beat', { n: bn }, rng);
    }
    // dots with a count run (e.count): "One, two, three dots!"
    if (k === 'dots' && num(cnt.n) != null) return I18N.sayCountRun(lang, num(cnt.n), 'dots');
    var an = animalOf(t.animal || (t.nameKind === 'animal' ? t.nameValue : null));
    if (topic === 'initial' && an) {
      var ini = initialOf(lang, an);
      return I18N.t(lang, 'right.initial', { letter: ini.first, word: ini.word }, rng);
    }
    // animals: the sound + the name ("Quack! The duckling!" / "Cạp cạp! Vịt con!")
    if (k === 'animal' && an) return I18N.t(lang, 'right.animal', { sound: NAMES[lang].sound[an], thing: eggPhrase(lang, t) }, rng);
    if (k === 'glyph' || (!k && ['letter', 'number', 'text', 'sum', 'diff', 'parity'].indexOf(t.nameKind) >= 0)) {
      var tx = t.text != null ? t.text : t.nameValue, gn = num(tx);
      if (topic === 'oddeven' && gn != null) return I18N.t(lang, 'right.parity', { n: gn, parity: gn % 2 ? 'odd' : 'even' }, rng);
      if ((topic === 'add' || topic === 'sub') && gn != null) {
        var a = num(params.a), b = num(params.b);
        if (a != null && b != null) return I18N.t(lang, 'right.sum', { expr: a + (topic === 'add' ? '+' : '−') + b, ans: numberName(lang, gn) }, rng);
      }
      if (gn != null) return I18N.t(lang, 'right.label', { label: numberName(lang, gn) }, rng);
      if (tx != null) return I18N.t(lang, 'right.label', { label: phraseOf(lang, { k: isLetter(String(tx)) ? 'letter' : 'text', v: String(tx) }) }, rng);
    }
    // the short tune name, as Rio sang it: "Yes! Red!" / "Đúng rồi! Màu đỏ!" (REQUIREMENT)
    var s = shortName(lang, t, cx);
    return s ? I18N.t(lang, 'right', { thing: s }, rng) : I18N.t(lang, 'right.any', null, rng);
  };
  I18N.sayPlaced = I18N.sayRight;

  // ---------------------------------------------------------------- the tune (copy-my-tune, DESIGN §5.2 / §6)
  // the short name of a tune note — what Rio sings when the spark reaches the egg:
  // "red", "the star", "the blue star" (p.shapes5), "the big egg" / "the small egg" (size round, beat egg), "seven dots",
  // "five", "letter B", "small b", "the duckling" / "màu đỏ", "ngôi sao", "ngôi sao màu xanh dương", "quả trứng to",
  // "bảy chấm", "năm", "chữ B", "chữ b thường", "vịt con"
  function shortName(lang, t, cx) {
    var vi = lang === 'vi', k = eggKind(t.kind), nk = t.nameKind;
    function sizeP(sz) { return vi ? 'quả trứng ' + NAMES.vi.size[sz] : 'the ' + NAMES.en.size[sz] + ' egg'; }
    function shapeP(sh, col) {
      if (vi) return NAMES.vi.shape[sh] + (col ? ' ' + NAMES.vi.color[col] : '');
      return anFix('the ' + (col ? NAMES.en.color[col] + ' ' : '') + NAMES.en.shape[sh]);
    }
    function glyphP(tx) {
      if (tx == null) return '';
      if (num(tx) != null) return numberName(lang, num(tx));
      if (tx === 'odd' || tx === 'even') return name(lang, 'parity', tx);
      if (splitOp(tx)) return exprText(tx);
      if (isLetter(String(tx))) return phraseOf(lang, { k: 'letter', v: String(tx) });
      return String(tx);
    }
    switch (k) {
      case 'egg': {
        var sz = thingSize(t), col = colorOf(t.color != null ? t.color : (nk === 'color' ? t.nameValue : null));
        if (sz && (nk === 'size' || cx.size || !col)) return sizeP(sz);
        return col ? name(lang, 'color', col) : '';
      }
      case 'shape': {
        var sh = shapeOf(t.shape != null ? t.shape : (nk === 'shape' ? t.nameValue : null));
        var sc = cx.mix ? colorOf(t.color != null ? t.color : cx.params.color) : null;
        return sh ? shapeP(sh, sc) : '';
      }
      case 'big': return sizeP('big');
      case 'dots': {
        var n = num(t.n != null ? t.n : t.nameValue);
        return n == null ? '' : name(lang, 'dots', n);
      }
      case 'animal': return eggPhrase(lang, t);
      case 'glyph': return glyphP(t.text != null ? t.text : (t.n != null ? t.n : t.nameValue));
    }
    var v = t.nameValue;
    switch (nk) {
      case 'color': case 'hue': return colorOf(v) ? name(lang, 'color', v) : '';
      case 'shape': case 'shapeH': return shapeOf(v) ? shapeP(shapeOf(v), cx.mix ? colorOf(cx.params.color) : null) : '';
      case 'size': return sizeOf(v) ? sizeP(sizeOf(v)) : '';
      case 'animal': case 'sound': case 'word':
        return animalOf(v) ? eggPhrase(lang, { kind: 'animal', animal: animalOf(v) }) : '';
      case 'number': case 'letter': case 'text': case 'parity': case 'sum': case 'diff':
        if (nk === 'parity' && num(v) == null) return v != null ? name(lang, 'parity', v) : '';
        return glyphP(v);
    }
    return v != null ? phraseOf(lang, thingOf(t)) : '';
  }
  // an event / (nameKind, value, opts {thing, topic, promptKey, params}) → {t, cx}
  function noteOf(a, b, opts) {
    var ev;
    if (a && typeof a === 'object') ev = a;
    else {
      opts = obj(opts);
      ev = { nameKind: a, nameValue: b, thing: opts.thing, topic: opts.topic, promptKey: opts.promptKey, params: opts.params };
    }
    ev = obj(ev);
    if (ev.thing == null) delete ev.thing;
    return { t: obj(evThing(ev)), cx: ctxOf(ev) };
  }
  I18N.demoName = function (lang, a, b, opts) {
    lang = L(lang);
    var nt = noteOf(a, b, opts);
    return shortName(lang, nt.t, nt.cx) || '';
  };
  // `demoNote {id, i, n, step, note, nameKind, nameValue, replay}` (+ main adds thing, topic, params, promptKey):
  // "Red!", "The star!", "Seven dots!", "Letter B!" / animals: the sound + the name "Quack! The duckling!" / "Cạp cạp! Vịt con!"
  I18N.sayDemo = function (lang, a, b, opts) {
    lang = L(lang);
    var nt = noteOf(a, b, opts), t = nt.t;
    var s = shortName(lang, t, nt.cx);
    var an = eggKind(t.kind) === 'animal' || t.nameKind === 'animal' || t.nameKind === 'sound' ?
      animalOf(t.animal != null ? t.animal : t.nameValue) : null;
    if (an && nt.cx.topic !== 'initial') return I18N.t(lang, 'demo.animal', { sound: NAMES[lang].sound[an], thing: s });
    return s ? I18N.t(lang, 'demo.note', { thing: s }) : '';
  };
  // `demoStart {from, n, replay, mode}` → "Listen to my tune!" | replay "Listen again!" | beat demo "Count with me!"
  I18N.sayDemoStart = function (lang, ev, rng) {
    ev = obj(ev);
    if (ev.replay) return I18N.t(lang, 'demo.replay', null, rng);
    return I18N.t(lang, ev.mode === 'beat' || ev.promptKey === 'p.beat' ? 'demo.beat' : 'demo.start', null, rng);
  };
  // the soft name cue for the next note (ages ≤ 5): "…and blue!" / "…rồi màu xanh dương!" ('' when nothing to name)
  I18N.sayNext = function (lang, a, b, rng) {
    lang = L(lang);
    if (a && typeof a === 'object') { rng = b; b = undefined; }
    var nm = I18N.demoName(lang, a, b);
    return nm ? I18N.t(lang, 'turn.next', { name: nm }, rng) : '';
  };
  // the `ask` line in the tune flow (main speaks it instead of the long prompt when e.echo):
  //   beat step ............ "Your turn — tap the big egg three times!" / "Đến lượt bé — gõ quả trứng to ba cái nhé!"
  //   e.afterDemo .......... "Your turn!" (+ "First, red!" at age ≤ 3)
  //   a later step ......... the cue "…and blue!" when on, else '' (say nothing: the child is mid-tune)
  // opts = { age (the "…and blue!" cue: age ≤ 5; the "First, red!" cue after the demo: age ≤ 3), cue: bool (overrides both), rng }
  I18N.sayTurn = function (lang, ev, opts) {
    lang = L(lang);
    ev = obj(ev); opts = obj(opts);
    var rng = opts.rng, params = obj(ev.params);
    var cue = opts.cue != null ? !!opts.cue : !(num(opts.age) > 5);
    var firstCue = opts.cue != null ? !!opts.cue : !(num(opts.age) > 3);   // "First, red!" gives the answer away: age 3 only (playtest P1)
    if (ev.mode === 'beat' || ev.promptKey === 'p.beat') {
      var n = num(params.n != null ? params.n : (ev.need != null ? ev.need : ev.nameValue));
      return n != null && n >= 1 ? I18N.t(lang, 'turn.beat', { n: n }, rng) : I18N.t(lang, 'turn.first', null, rng);
    }
    var nm = cue && ev.mode !== 'findAll' ? I18N.demoName(lang, ev) : '';
    if (ev.afterDemo) {
      var first = I18N.t(lang, 'turn.first', null, rng);
      return nm && firstCue ? first + ' ' + I18N.t(lang, 'turn.firstName', { name: nm }, rng) : first;
    }
    return nm ? I18N.t(lang, 'turn.next', { name: nm }, rng) : '';
  };

  // what we tap for, named for the wrong line ("the red one", "the triangle egg", "the big one" / "quả trứng màu đỏ",
  // "quả trứng to", "quả trứng hình tam giác", "vịt con")
  function wantPhrase(lang, want, t, cx) {
    var vi = lang === 'vi', params = cx.params;
    switch (want.k) {
      case 'color': {
        var c = colorOf(want.v);
        if (!c) break;
        return vi ? 'quả trứng ' + NAMES.vi.color[c] : 'the ' + NAMES.en.color[c] + ' one';
      }
      case 'size': {
        var sz = sizeOf(want.v);
        if (!sz) break;
        return vi ? 'quả trứng ' + NAMES.vi.size[sz] : 'the ' + NAMES.en.size[sz] + ' one';
      }
      case 'shape': {
        var col = cx.mix ? colorOf(params.color) : null;
        return eggPhrase(lang, { kind: 'shape', shape: want.v, color: col }, { color: !!col });
      }
      case 'animal': case 'sound': return eggPhrase(lang, { kind: 'animal', animal: want.v }, { egg: true });
    }
    return phraseOf(lang, want);
  }

  // `wrong {id, got:{nameKind,nameValue}, want:{nameKind,nameValue}, streak, replay?, x, y}` (+ main adds thing = the
  // tapped egg's thing, topic, params = the step's params) → names what was tapped, then
  //   replay (default: Rio replays the rest of the tune next) ... "That’s the yellow egg. Listen again!"
  //   e.replay === false, or e.streak ≥ 2 (the hint glow is on, no replay) ... the goal: "… Let’s tap the red one!"
  // Maths never names the right answer; parity says what the tapped number is; initial says the word's first letter;
  // animals say the tapped animal's sound ("The chick says peep! Listen again!").
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(ev.thing && typeof ev.thing === 'object' ? ev.thing : (ev.got && eggKind(ev.got.kind) ? ev.got : evThing(ev, ev.got)));
    var got = thingOf(ev.got), want = thingOf(ev.want), cx = ctxOf(ev), topic = cx.topic, params = cx.params;
    if (got.k == null && t.nameKind != null) got = thingOf(t);
    var k = eggKind(t.kind);
    var rp = typeof ev.replay === 'boolean' ? ev.replay : !(num(ev.streak) >= 2);
    if (cx.beat || k === 'big') return I18N.t(lang, rp ? 'wrong.againAny' : 'wrong.any', null, rng);   // no wrong in a beat step (defensive)
    var gotTx = t.text != null ? t.text : (got.v != null ? got.v : got.text), gn = num(gotTx);
    if (topic === 'add' || topic === 'sub' || want.k === 'sum' || want.k === 'diff' || (want.k === 'text' && splitOp(want.v))) {
      var mg = gotTx != null ? (gn != null ? phraseOf(lang, { k: 'number', v: gn }) : phraseOf(lang, got)) : null;
      return I18N.t(lang, rp ? 'wrong.again' : 'wrong.math', { got: mg }, rng);
    }
    if ((topic === 'oddeven' || want.k === 'parity') && gn != null)
      return I18N.t(lang, rp ? 'wrong.againParity' : 'wrong.parity', { n: gn, parity: gn % 2 ? 'odd' : 'even' }, rng);
    var gotAnimal = animalOf(t.animal) || (got.k === 'animal' ? animalOf(got.v) : null);
    if (topic === 'initial' && gotAnimal) {
      var ini = initialOf(lang, gotAnimal);
      return I18N.t(lang, rp ? 'wrong.againInitial' : 'wrong.initial', { word: capFirst(ini.word), first: ini.first }, rng);
    }
    // animals: "The chick says peep! Listen again!" / "Gà con kêu chíp chíp! Bé nghe lại nhé!"
    var wantAnimal = (want.k === 'animal' || want.k === 'sound') ? animalOf(want.v) : null;
    if (gotAnimal && (rp || (wantAnimal && gotAnimal !== wantAnimal))) {
      var gp = eggPhrase(lang, { kind: 'animal', animal: gotAnimal });
      if (rp) return I18N.t(lang, 'wrong.againAnimal', { got: gp, gotSound: NAMES[lang].sound[gotAnimal] }, rng);
      return I18N.t(lang, 'wrong.animal', { got: gp, gotSound: NAMES[lang].sound[gotAnimal], want: wantPhrase(lang, want, t, cx),
        sound: NAMES[lang].sound[wantAnimal] }, rng);
    }
    // counting dots: "That egg has four dots. Listen again!" / "… Let's tap the egg with three dots!"
    if (k === 'dots' || topic === 'count') {
      var gN = num(t.n != null ? t.n : got.v), wN = num(want.v != null ? want.v : params.n);
      if (rp && gN != null) return I18N.t(lang, 'wrong.againCount', { got: name(lang, 'dots', gN), kind: 'dots' }, rng);
      if (gN != null && wN != null && gN !== wN)
        return I18N.t(lang, 'wrong.count', { got: name(lang, 'dots', gN), want: name(lang, 'dots', wN), kind: 'dots' }, rng);
      if (gN == null || wN == null) return I18N.t(lang, rp ? 'wrong.againAny' : 'wrong.any', null, rng);
    }
    var g = k ? eggPhrase(lang, t, nameOpts(t, cx, true)) : '';
    if (!g && got.k && got.v != null) g = phraseOf(lang, got);
    if (rp) return g ? I18N.t(lang, 'wrong.again', { got: g }, rng) : I18N.t(lang, 'wrong.againAny', null, rng);
    if (g && want.k && want.v != null) {
      var w = wantPhrase(lang, want, t, cx);
      if (w && g !== w) return I18N.t(lang, 'wrong.thing', { got: g, want: w }, rng);
    }
    return I18N.t(lang, 'wrong.any', null, rng);
  };

  // Counting aloud: i → "One!" … "Twenty!" (beyond: the digits)
  I18N.sayCount = function (lang, i) {
    lang = L(lang);
    var c = num(i);
    if (c == null) return I18N.t(lang, 'praise');
    if (STR[lang]['count.' + c]) return STR[lang]['count.' + c];
    return capFirst(numberName(lang, c)) + '!';
  };
  // the whole count in one line: "One, two, three!" (beats, default) / "One, two, three dots!" (kind 'dots' or a dots
  // thing); n = 1: "One!" / "One dot!"
  I18N.sayCountRun = function (lang, n, kind) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return c === 0 ? I18N.sayCount(lang, 0) : I18N.t(lang, 'praise');
    var list = [];
    for (var i = 1; i <= c; i++) list.push(numberName(lang, i));
    var w = itemsWord(lang, itemsKind(kind, 'beat'), c, true);
    return capFirst(list.join(', ') + (w ? ' ' + w : '')) + '!';
  };
  // the count is complete: "Three beats! Hooray!" / "Three dots! Hooray!"
  I18N.sayCountDone = function (lang, n, kind, rng) {
    if (rng === undefined && kind && typeof kind !== 'string' && typeof kind.kind !== 'string') { rng = kind; kind = null; }
    return I18N.t(lang, 'countDone', { n: num(n), kind: itemsKind(kind, 'beat') }, rng);
  };
  // `beatNudge {i, n}` → "Two! One more!" / "Hai rồi! Thêm một cái nữa!"
  I18N.sayBeatNudge = function (lang, ev, rng) {
    ev = obj(ev);
    return I18N.t(lang, 'beatNudge', { i: ev.i, n: ev.n != null ? ev.n : obj(ev.params).n }, rng);
  };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    if (kind === 'blob') kind = 'color';
    if (value == null || value === '') return I18N.t(lang, 'talk.wrong.any');
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal' || kind === 'sound') {
      var an = animalOf(value);
      return an ? I18N.t(lang, 'talk.wrong.animal', { answer: { kind: 'animal', value: an }, sound: NAMES[lang].sound[an] }) :
        I18N.t(lang, 'talk.wrong', { answer: String(value) });
    }
    if (kind === 'shape' || kind === 'shapeH') return shapeOf(value) ? I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', { answer: { kind: 'shape', value: value } }) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'size') return sizeOf(value) ? I18N.t(lang, 'talk.wrong.size', ans) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'color' || kind === 'hue') return colorOf(value) ? I18N.t(lang, 'talk.wrong', { answer: { kind: 'color', value: value } }) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'egg') return colorOf(value) ? I18N.talkWrong(lang, 'color', value) : sizeOf(value) ? I18N.talkWrong(lang, 'size', value) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'letter' || (kind === 'text' && isLetter(String(value)))) {
      var lv = String(value);
      return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv });
    }
    if (kind === 'number' || kind === 'dots' || ((kind === 'parity' || kind === 'text') && num(value) != null))
      return num(value) != null ? I18N.t(lang, 'talk.wrong.number', { answer: { kind: 'number', value: num(value) } }) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'parity' && lang === 'vi') return I18N.t(lang, 'talk.wrong.number', ans);
    return I18N.t(lang, 'talk.wrong', ans);
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  // "Rio" is read well by English and Vietnamese voices ("bi" is an ordinary Vietnamese syllable): no rewrite.
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/^\s*…\s*/, '').replace(/[…]/g, '.').replace(/[›»«]/g, ',').replace(/\s+—\s+/g, ', ');
    if (lang === 'en') {
      s = s.replace(/\b(letter|Letter|big|Big|small|Small) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(^|[\s!?.,])([A-Z]) is for\b/g, function (m, pre, ch) { return pre + LETTER_SPEECH_EN[ch] + ' is for'; });
      s = s.replace(/\bstarts with ([A-Z])\b/g, function (m, ch) { return 'starts with ' + LETTER_SPEECH_EN[ch]; });
      s = s.replace(/\bListen: ([A-Z])!/g, function (m, ch) { return 'Listen: ' + LETTER_SPEECH_EN[ch] + '!'; });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  SE.I18N = I18N;
})(window.SE = window.SE || {});
