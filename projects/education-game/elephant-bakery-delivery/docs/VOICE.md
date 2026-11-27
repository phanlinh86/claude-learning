# Tupi's Bakery Delivery — Voice, language and input

Files: `game/js/i18n.js` (`BD.I18N`), `game/js/voice.js` (`BD.Voice`), `game/js/input.js` (`BD.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 180 000 checks, self-contained, exits non-zero on failure): identical key sets,
**identical `{params}`** and the same number of wordings in en / vi; every `ui.*` key that `index.html` / `ui.js` / `main.js` /
`render.js` use; 3 wordings + `.first` for every prompt; every prompt × value × first × wording × with / without the child's
name (≈ 4 000 prompts); Vietnamese diacritics and a warm "bé … nhé / nào / nhỉ" in every prompt; classifiers ("cái bánh quy",
"con bò", "ngôi nhà"); a negative-word ban (incl. "not") and a **base-game word ban** (Nim, hedgehog, brook, stone, hop,
fruit, nhím, suối, hòn đá, nhảy …) on every string, every rendered line and the three source files; tidy rendering (no `{x}`,
"undefined", "NaN", "@odd", no "a orange", capital after a stop); every name kind × value; `initial()` (+ content.js's own
classifier rule gives the same letter); `words()` (no form shared by two values, with and without diacritics) matched back by
the matcher + noisy kid answers; DESIGN / REQUIREMENT example lines exactly; a sweep of ≈ 20 000 right / wrong lines on a
synthetic map per topic (sign given / house rebuilt from `got` / cargo rebuilt from params, left 0/1/2, streak 1–3); **the
delivery `content.js`** (it exists): the ask, the right line of every order and the wrong line of every other house of
≈ 160 rounds (ages 3–7, EN + VI) and every `makeTalk` question + choice; speech text; the input layer (fake DOM, coalesced
events, a curved drag); the parent gate; voice queue / interrupt / log / unlock / volume / speed / throttle with a fake
`speechSynthesis`; the recognizer.

## 0. Wording principles (Tupi)
- **Tupi** is a cheerful baby elephant baker. Written and spoken **"Tupi"** in both languages ("Mình là voi Tupi"); titles
  "Tupi’s Bakery Delivery" / **"Voi Tupi Giao Bánh Ngọt"**; logo lines "Tupi’s" / "Bakery Delivery", "Voi Tupi" / "Giao Bánh
  Ngọt"; `ui.voice` "Tupi’s voice" / "Giọng của Tupi". TTS: no rewrite — "Tu-pi" is two ordinary syllables.
- **An order = one cargo → one house.** The question names the cargo and the house kind, never the route: "Take the red
  cupcake to the red house!", "Take 3 cookies to house number 3!", "Take the penguin home!". Round 0 of a chapter (`first`)
  starts with the oven: "Ding! A red cupcake is ready! Drive it to the RED house!" / "Ting! Bánh cupcake màu đỏ xong rồi! Bé
  chở đến ngôi nhà màu ĐỎ nhé!" (CAPS are display emphasis; `speech()` lowers them).
- **Never negative** (tested): no / not / wrong / incorrect / bad / fail / mistake / oops / sorry / don’t, sai / sai rồi / dở /
  tệ / hỏng / không đúng / chưa đúng / không phải / trật / nhầm / hư.
- **VI names (classifier + noun, colour / size AFTER the noun)**: treats bánh cupcake, bánh macaron, bánh donut, kẹo bánh
  (cake pop), thạch rau câu (jelly), bánh kem (cake), bánh quy (cookie), generic "bánh"; shape cookies "bánh quy hình tròn
  màu đỏ", "bánh quy ngôi sao"; cookies "3 **cái bánh quy**"; dots "4 chấm"; animals con bò, con heo, con cừu, con vịt, con gà
  mái, con ngựa, con dê, con cua, bể cá vàng (home-line subject "bạn cá vàng"), chim cánh cụt, sư tử, con khỉ; homes nông
  trại, biển, xứ băng, đồng cỏ châu Phi, rừng rậm ("sống ở …"); house "**ngôi nhà**" in prompts, "nhà …" in short lines;
  road "con đường"; bakery "tiệm bánh". EN: "a red cupcake", "an orange donut", "a big cake pop", "a green star cookie".
- **Houses are named by their sign** (`house(lang, sign, ruleKind)`): colour blob "the blue house" / "nhà màu xanh dương";
  shape "the star house" / "nhà ngôi sao"; dots "house number 4" / "nhà số 4"; letters "the house with letter B" / "nhà chữ
  B", "the house with small b" / "nhà chữ b thường"; numbers "house number 7"; odd / even tiles "the odd house" / "nhà số lẻ";
  animal "the cow’s house" / "nhà bạn bò"; home badge "the ice house" / "nhà ở xứ băng"; big / small sign "the big house" /
  "nhà to".
- **Right lines** name the delivery, then what is next: "A red cupcake for the red house!" / "Bánh cupcake màu đỏ cho nhà
  màu đỏ!", count "Three cookies for house number 3!" / "Ba cái bánh quy cho nhà số 3!", friend "The cow found her friend!",
  home "The penguin lives on the ice!", initial "A horse! Horse starts with H!", maths "2 + 3 makes 5!", parity "7 is odd!".
  Tail from `e.left`: 1 → "One more!" (`right.one`), > 1 → "More to deliver!" (`right.more`), 0 → "All delivered!"
  (`right.all`); no `left` → no tail.
- **Wrong lines** name the house, then the goal: "This is the blue house. The cupcake is red!" / "Đây là nhà màu xanh dương.
  Bánh cupcake này màu đỏ cơ!"; count "This is house number 4. We have 2 cookies!"; home "This is the farm house. The penguin
  lives on the ice!"; initial says the word again but **never the letter** ("Listen again: lion!") — the hint does that job.
- Numbers in prompts / house names are **digits** (the signs show numerals); counting uses words ("One!", "Three cookies!").
- Odd / even tile text: `t(lang, 'odd')` / `t(lang, 'even')` → "Odd" / "Even", "Lẻ" / "Chẵn" (content's `text: '@odd'`).
- **Child's name**: `setChild(name)`; with an empty name every `{child}` wording is skipped, "bé {child}" → "bé".
- **Initials (age 6–7)**: first letter of the name without the VI classifier (con / cái / quả / chiếc / cây / bông / bánh) or
  EN article, diacritics stripped. EN cow C, pig P, sheep S, duck D, hen H, horse H, goat G, crab C, penguin P, lion L, monkey
  M, goldfish G, cupcake C, macaron M, donut D, cake pop C, jelly J. VI bò B, heo H, cừu C, vịt V, gà mái G, ngựa N, dê D, cua
  C, chim cánh cụt C, sư tử S, khỉ K, cá vàng C, cupcake C, macaron M, donut D, kẹo bánh K, thạch rau câu T.
  `name(lang, 'initial', thing | value)` returns that letter; `content.js` may also strip `I18N.CLASSIFIERS` from `name()`
  itself — the test checks both give the same letter.

## 1. API (`BD.I18N`) — for main.js
All helpers never throw (also with `null` events) and never return a raw `{x}`; `rng` is optional (`rng.next()`, a function,
or Math.random).

| function | returns |
|---|---|
| `t(lang, key, params?, rng?)` | a random wording. Raw params are named: `{color}` (+ `{COLOR}`), `{treat}` + `{color}` → `{cargo}` "red cupcake" / "bánh cupcake màu đỏ" and `{cargoWord}`, `{shape}`, `{big}` → `{size}` (+ `{SIZE}`), `{n}` → `{num}` "three", `{cookieWord}`, `{dotWord}`, `{animal}` (+ `{word}`), `{home}` → "on the ice", `{who}`, `{letter}` (+ `{lower}`), `{a, b, op}` / `{expr}` / `{text}` → `{expr}` "2 + 3", `{parity}`, `{season}`, `{thing}` / `{house}` / `{cargo}` objects → phrases |
| `ask(lang, promptKey, params, {first, rng, cargo})` | the order. **Pass `cargo: world.orderObj.cargo`** (or `params.cargo`): `p.initial` / `p.oddeven` / `p.size` take the word / treat from it. Missing param / unknown key → `p.any` ("Drive the cart to a house!") |
| `sayRight(lang, e, rng?)` | `e` = world `right` + `{topic, promptKey, params, sign, cargo}` (§1.1) → see §0 |
| `sayWrong(lang, e, rng?)` | `e` = world `wrong` + `{topic, promptKey, params, sign, cargo}`; without `sign` the house comes from `e.got {nameKind, nameValue}`; without `cargo` it is rebuilt from the order's params |
| `sayWrongHint(lang, e, rng?)` | the miss that brings the hint: "This is the blue house. Look at the glowing road!" |
| `sayCount(lang, i)` | "One!" … "Twenty!" (= `count.<i>`) — each cookie hopping into the tray |
| `sayCountRun(lang, n, kind?)` | "Three cookies!" / "Ba cái bánh quy!" (default `'cookies'`), `'dots'` → "Four dots!" |
| `countList(lang, n)` | "One, two, three!" |
| `sayName(lang, thing)` / `phrase(lang, thing, opts?)` | "the red cupcake"; opts `{art: 'the' \| 'a' \| null, color, size, who}` |
| `house(lang, sign, ruleKind?)` **new** | "the red house", "house number 3", "the cow’s house" (§0) |
| `name(lang, kind, value)` | kinds `color, hue, shape, shapes, treat (obj / toy aliases), treats, treatWord (objWord), thing, cookies, dots, animal, animals, word, who, home, homeAt, lives, number / n / count, letter, lower, initial, sum, diff, parity, size, season, text / tile, house` |
| `words(lang, kind, value)` / `choiceWords(lang, choice)` | accepted spoken forms (lower-case + no-diacritic forms; numbers: digits, "số ba", "four cookies", "3 cái bánh quy", "nhà số ba") |
| `initial`, `bareWord`, `initialOf`, `stripClassifier` | first letter / bare noun (content.js 'initial' topic) |
| `talkWrong(lang, choice, talk?)` | "It is blue! Good try!", "There are 4 cookies! Good try!" (talk.topic `count`), "The penguin lives on the ice! Good try!" |
| `speech(lang, text)` | TTS text (`Voice.say` calls it): letter names, + − =, "…" → ", ", CAPS → lower-case, vi "chữ B" → "chữ bờ", vi loan words cupcake → "cắp kếch", donut → "đô nắt", macaron → "ma ca rông" |
| helpers / constants | `cargo(lang, params, promptKey)`, `homeOf`, `thingFromName`, `ruleOf`, `setChild`, `has`, `keys`, `raw`, `kindValue`, `numberName`, `stripMarks`; `TOPICS, COLORS, SHAPES, TREATS, TREATS_ALL, OBJS (= TREATS), ANIMALS, HOMES, SEASONS, ANIMAL_HOME, CLASSIFIERS, RULE_KINDS, THING_KINDS, PROMPTS, PARAMS, NAME_TABLE, LETTER_VI, MAX_COUNT` |

Thing kinds: `treat, shape, cookies, dots, tile, animal, home, blob` (+ Talk icons `color, number, size`; legacy `obj` / `toy`
→ treat). Rule kinds (from the prompt key; `e.rule` / `e.want` also read): `color, shape, size, n, animal, home, letter, lower,
initial, sum, diff, parity`.

**Renamed / removed versus Nim's River Hop** (main.js must follow):
- Prompts: `p.countSeq` / `p.countSel` → **`p.count {n}`**; `p.home` now takes **`{animal}`** (the passenger), not `{home}`.
  Every prompt is new delivery wording; `.first` = the oven "Ding!" form.
- Gone: `rise, ahead, bank, fruit, fruit.any, sayFruit, seqList, right.thing, right.next, right.last, wrong.dots, wrong.seq,
  wrong.livesAt, wrong.starts, wrong.expr, wrong.parity, goal.seq, goal.seqAny, goal.n {what}, surprise.fish, fish.tap,
  surprise.frog, frog.tap, ui.tapNim, talk.farm, talk.wrong.dots / dot1`.
- New: `roadDone, wipe` (new wording), `load, back, reverse, fork, drag, honk, thanks, odd, even, right.deliver, right.count,
  right.friend, right.one, right.more, right.all, goal.n {n, cookieWord}, surprise.mouse, mouse.tap, surprise.bird, bird.tap,
  ui.tapTupi, talk.wrong.cookies / cookie1`, `house()`, `cargo()`, `stripClassifier()`, `ask(…, {cargo})`.
- `ui.tapNim` → **`ui.tapTupi`**; `ui.gallery` "Our deliveries"; `ui.tapHint` "Hold the cart and drive along the road".
- `sayCountRun(lang, n)` defaults to **cookies** (was dots).

### 1.1 World event → line (DESIGN §5.2) — what main.js should do
`ev2(e)` for right / wrong: `Object.assign({topic: world.topic, promptKey: o.promptKey, params: o.params, cargo: o.cargo},
e, {sign: world.houseById(e.houseId).sign})` with `o = world.orderObj`.

**Speech policy** (proven in the sister games, kept):
1. **Prompts are protected** (`speakPrompt`, `priority + prompt`): the guard holds from the prompt's `onStart` until its
   promise resolves (+150 ms; fallback 600 ms + 95 ms × chars). While protected, feedback **queues behind it**.
2. **Count lines are queued and never cut**: each cookie's "One!" "Two!" … (`priority`, tag `count`) and the run "Three
   cookies!"; the `ask` follows them in the queue (the load phase lasts 0.6 + 0.45 s × n, enough for the words).
3. **The wrong line is protected** once it starts; ≤ 1 wrong line per 1.5 s.
4. **Taps never cut a protected or count line.** Tap lines (`honk`, `poke`, `mouse.tap`, `bird.tap`, `snow.tap`) only when
   nothing protected speaks, each through `Voice.throttle(name, 2000)` (≤ once per 2 s).
5. **Praise is rate-limited** (skip if one started < 1.2 s ago). Speech is log-only for `speed > 1`.
6. **A question is only repeated while it can be answered** (`world.interactive`). Sound-only events (no line): `house`,
   `rollOut`, `bump`, `drive`, `grab`, `deliver`, `hearts`, `soft`, `gust`, `count` when not in the count topic.

| world event | line | how |
|---|---|---|
| `level {level, topic, weather}` | `t('ui.chapter',{n}) + '. ' + t('topic.'+topic)`, then `t('weather.'+weather)` ("Spring in the bakery!" …) | interrupt, weather queued (tag `flavour`) |
| `round {round, surprise}` | bubble text `t('roadDone')` (shown, not spoken) | — |
| `rollOut` | — (bell) | — |
| `load {cargo}` | count topic: nothing here (see `count`); else nothing (oven "ding" sound) | — |
| `count {i}` (cookies hop into the tray) | `sayCount(lang, i + 1)`; after the last one `sayCountRun(lang, n)` | **count line** (rule 2) |
| `ask {promptKey, params, first}` | `ask(lang, promptKey, params, {first, cargo: world.orderObj.cargo})`; bubble + voice; drop tag `flavour`. Warm-up of chapter 0: queue `t('drag')` after it (the ghost hand demonstrates) | **protected prompt** |
| `grab` | — (sound) | — |
| `honk` (a tap on the cart, not a drive) | `t('honk')` then the current prompt again | honk only if `Voice.throttle('honk', 2000)`; prompt queued, never over a protected line |
| **2nd honk within 6 s** (the child keeps tapping the cart) | `t('drag')` ("Hold Tupi’s cart and drive along the road!") instead of the prompt; ≤ once per 12 s (`throttle('drag', 12000)`) | queue, priority |
| `autoDrive {houseId?}` | — | — |
| `fork {x, y}` | `t('fork')` **only** in age ≤ 4 warm-up rounds and ≤ once per round (`throttle('fork', 8000)`), only when nothing speaks | queue, droppable |
| `right {houseId, cargo, left, home?}` | `sayRight(lang, ev2(e))` | interrupt only once the prompt guard ended, else queue |
| `deliver` / `hearts` | `t('thanks')` (the friend) — ≤ 1 per order, only when nothing speaks, pitch 1.35 for a different voice colour | queue, droppable |
| `wrong {houseId, got, want, streak}` | `sayWrong(lang, ev2(e))`; the miss that brings the hint (`e.hint` / 2nd miss): `sayWrongHint` | interrupt unless protected; then protected; ≤ 1 per 1.5 s |
| `reverse` | — ("beep-beep" sound; `t('reverse')` only if nothing spoke for 3 s) | droppable |
| `back` | — (or `t('back')` rarely, only when nothing speaks) | droppable |
| `soft {x, y}` | — (crumb "tk") | — |
| `hint {houseId, edges}` | nothing when the wrong line already pointed at it; else `t('hint')` | priority |
| `idle {n}` | `t('idle') + ' ' + currentPrompt` (≤ 4 times); the first idle of a round with no grab yet: `t('drag')` | queue |
| `assist` | `t('hint')` | priority |
| `pokeTupi` (not interactive) | `t('poke')` via `throttle('poke', 2000)`, only when nothing speaks | tap rule 4 |
| `mouse` / `mouseTap` | `t('surprise.mouse')` / `t('mouse.tap')` | queue (never over a protected prompt) / rule 4 |
| `bird` / `birdTap` | `t('surprise.bird')` / `t('bird.tap')` | same |
| `snow` / `snowTap` | `t('surprise.snow')` / `t('snow.tap')` | same |
| `party {x, y}` | `t('party')` — this **is** the round's praise | queue |
| `roundDone {stars}` | — (stars fly) | — |
| `wipe {season}` | `t('wipe')` rarely (chapter 1 round 0, then ≤ 1 in 4), only when nothing speaks | droppable |
| pause → resume | play: the prompt; Talk: the question while unanswered | priority |
| `talk` | `t('talk.intro') + ' ' + t(talk.promptKey, talk.params)`; mic choices `talk.choices.map(c => ({id: c.id, words: choiceWords(lang, c)}))` | queued, protected |
| `talkAsk {n}` | repeat the Talk question (n ≤ 3) | interrupt |
| `talkResult` | right → `t('talk.right')`; else `talkWrong(lang, answerChoice, talk)` | interrupt |
| `levelDone` | `t('great')` | queue |
| `sessionDone {stars}` | `t('party')`, then `t('session.done', {stars})` | interrupt, then queue |

## 2. Voice (`BD.Voice`) — the proven engine, Tupi's voice
`init({lang, enabled, speed?})`, `unlock()` (inside the FIRST pointerup / touchend / click), `setLang`, `setEnabled`,
`setVolume(0..1)` (follows the game volume), `setSpeed(n)` / `getSpeed()` (n > 1 → **log only**; `init` reads `?speed=`),
`say(text, {interrupt, priority, prompt, tag, rate, pitch, lang}) → Promise<{spoken, reason}>`, `sayKey(key, params, opts)`
(promise `.text`), `stop()`, `dropQueued()`, `dropTagged(tags)`, `queuedTags()`, `currentTag()`, `isSpeaking()`,
`hasVoice(lang)`, `voiceName(lang)`, `onStart(display)` / `onEnd`, `onVoicesChanged(fn)`, `log` (+ `BD.debug.voiceLog`) —
**every line**, also muted / at test speed, `spoken(lang, text)`, `RATE` 0.9 / **`PITCH` 1.2**, **`throttle(name, ms)` /
`resetThrottle(name?)`** (new: cooldown bookkeeping for honk / poke / fork / drag), `canListen()`, `listen({lang, choices,
timeoutMs}) → Promise<{id|null, transcript, reason?}>`, `stopListening()`, `isListening()`, `onListen(bool)`,
`match(transcripts, choices, lang)`, `matchDetail(…)`.
- Voices: best local per language — vi **Linh** / Google Tiếng Việt / Microsoft HoaiMy; en **Samantha** / Nicky / Karen /
  Google US English / Microsoft Aria; Enhanced / Premium preferred; Apple novelty voices (Bubbles, Zarvox, Fred …) avoided.
- Tupi: **rate 0.9, pitch 1.2** (a young, bright baby elephant; above ≈ 1.3 iOS voices go robotic, rate < 0.85 smears
  Vietnamese tones). The friend's `thanks` may use pitch 1.35.
- Queue: 1 speaking + ≤ 2 waiting NORMAL lines (oldest dropped; non-priority lines > 5 s old skipped); priority lines are kept
  up to 6 waiting and the prompt is never dropped; `interrupt` flushes + cancels and speaks after 50 ms (90 ms on iOS);
  watchdog for a missing `onend`; Chrome desktop keep-alive (pause/resume every 10 s, Chrome cuts utterances at ~15 s); page
  hidden → stop. Before `unlock()` only the newest line is kept; a `not-allowed` line waits for the next `unlock()`.
- Recognition (Talk time only): fuzzy matcher (exact tokens, no-diacritic tokens, number words → digits, edit distance 1 (≥ 5
  letters) / 2 (≥ 8) for single words with the same first letter, ambiguous → no match, interim matches wait 450 ms); a fresh
  recognizer per `listen()`, a timeout always resolves; the mic button is hidden when `!canListen()` or after `not-allowed`.
- Ducking: duck the music bed on `onStart`, restore on `onEnd`.

## 3. iOS / Safari findings (re-checked 27 Nov 2026)
- **Nothing new in Safari 26.x / 27 for Web Speech**: no release-note item changes `speechSynthesis` or
  `webkitSpeechRecognition` behaviour; the known issues below still apply, so the proven workarounds stay.
- **Voices**: since iOS 18 downloaded Enhanced / Premium voices are often **missing from `getVoices()`**, and iOS 26 still
  ignores the voice chosen in Spoken Content (AVSpeechSynthesisVoice regression) → we never rely on the default voice; we pick
  by name (vi **Linh** is built in on iPhone / iPad). If Linh is missing, parents install it in **Settings › Accessibility ›
  Spoken Content › Voices › Vietnamese**, then reload (`ui.voiceMissing` shows the path when `hasVoice('vi') === false`). The
  list fills late: `voice.js` polls `getVoices()` for 6 s and `onVoicesChanged` re-checks.
- **First utterance inside a gesture**: `unlock()` in the first `pointerup` / `touchend` / `click` speaks a silent `' '`;
  lines queued before the first tap are re-timestamped (a slow first tap never makes the welcome "stale"). With the drag
  mechanic the first gesture can be a long press: `unlock()` must also run on the first `pointerup` of a drag.
- **Audio session**: Web Audio is on the quiet *ambient* channel (muted by the side switch) unless
  `navigator.audioSession.type = 'playback'` (Safari 16.4+) — `Audio.unlock()` sets it; while the mic listens `voice.js`
  switches to `'play-and-record'` and restores the previous type afterwards.
- **Speech recognition** (`webkitSpeechRecognition`) needs **Siri & Dictation** on and usually a network, and is
  **unavailable in Home-Screen (standalone) mode** → `canListen()` false there. `interimResults` on iOS is inconsistent
  (results may never be flagged `isFinal`, or repeat cumulatively) → an interim match resolves after 450 ms and `onend`
  re-matches everything heard. A recognize → speak → recognize loop can stall after the first cycle on iOS → we create a
  new recognizer each time, call `V.stop()` before listening and always time out. `vi-VN` results often lack tones ("xanh
  duong", "o xu bang", "ba cai banh quy") — the matcher compares stripped forms. Tap answers always work.
- After backgrounding the synthesizer can stay paused → `cancel()` + `resume()` on return. iPadOS desktop UA: detected via
  `MacIntel` + `maxTouchPoints > 1`. No regex look-behind (iOS < 16.4) — tested.

Sources: [Apple Developer Forums 804648 (iOS 26 voice regression)](https://developer.apple.com/forums/thread/804648),
[764438 (voices missing from Web Speech since iOS 18)](https://developer.apple.com/forums/thread/764438),
[723503 (not all installed voices listed)](https://developer.apple.com/forums/thread/723503),
[775699 (unclear interimResults on iOS Safari)](https://developer.apple.com/forums/thread/775699),
[748048 (webkitSpeechRecognition in a PWA)](https://developer.apple.com/forums/thread/748048),
[WebKit bug 225298 (recognition service not available)](https://bugs.webkit.org/show_bug.cgi?id=225298),
[caniuse Speech Recognition](https://caniuse.com/web-speech), [caniuse getVoices](https://caniuse.com/mdn-api_speechsynthesis_getvoices),
[Safari 27 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes).

## 4. Input (`BD.Input`) — one finger, DRAG first
```js
const detach = BD.Input.attach(canvas, {
  toLogical: (clientX, clientY) => ({ x, y }),    // CSS client px → logical world px (your function returns the object)
  down:   (x, y, ev) => world.pointerDown(x, y),  // grab the cart / tap a house or the road / soft / surprise
  move:   (x, y, ev) => world.pointerMove(x, y),  // steer: the world projects the finger onto the road
  up:     (x, y, ev) => { BD.Voice.unlock(); world.pointerUp(x, y); },   // release (or a honk when it was a short tap)
  cancel: ()         => world.cancelDrag(),       // pointercancel, blur, hidden, rotation / resize, pause
  hover:  (x, y)     => {}                        // optional, mouse without a button
});
detach.cancel(); detach.isActive(); detach();
```
**Signature: `down(x, y, ev)`, `move(x, y, ev)`, `up(x, y, ev)`, `cancel()` — two NUMBERS in logical px, then the raw
event. Never a point object.**
- `down` fires synchronously inside `pointerdown` (`touch-action: none`, `preventDefault`, **pointer capture**) — no tap
  delay; every later move / up of that finger reaches the canvas even over the HUD or outside the screen edge.
- **Smooth stream**: every `pointermove` is delivered at once, unthrottled, in order; **coalesced samples**
  (`getCoalescedEvents()`, 120 Hz iPad / Pencil, Chrome) each become a `move`, capped at `Input.MAX_COALESCED` (16) per
  event, the event's own point last — a fast swipe along a curve never skips the fork. The world, not the input layer,
  smooths the cart (target point on the road + speed / acceleration limits).
- **One active pointer**: extra fingers are ignored (a resting second hand never steals the cart); a stuck pointer is
  recovered (new primary touch, missing touch, silence ≥ `Input.STALE_MS` 6 s) with `cancel()` then `down()`.
- **pointercancel → `cancel()`** → `world.cancelDrag()` (the cart rolls to a stop, nothing judged); also lost capture while
  down, window blur, page hidden, `detach.cancel()` (main: rotation / resize / pause).
- Targets `button, .screen, #hud, .no-game-input` (HUD, speech bubble, menus) never reach the canvas.
- Touch + mouse fallback without `PointerEvent`.
- `kidProof()`: blocks pinch, double-tap zoom, long-press callout / selection / image drag, rubber-band & pull-to-refresh
  (every single-finger `touchmove` outside `.scroll` / range inputs is prevented), context menu, Ctrl/⌘ zoom and refresh
  keys. `holdButton(el, ms = 2000, onDone, onProgress)` → `off()`: the parent gate (tested: a quick tap does nothing).
- Functional QA must drive **real CDP touch events**: press at `debug.cartScreen()`, move along `debug.routeScreen(houseId)`
  every ≈ 20 px, release; taps at `debug.houseScreen(id)`.

## 5. Adding a thing / a language
- New treat: `TREATS`, `NAMES.*.treat | treats`, `WORDS.*.treat`, `INITIAL` in the test (+ a VI `speech()` loan-word rewrite if
  the vi voice spells it). New animal: `ANIMALS`, `ANIMAL_HOME`, `NAMES.*.animal | animals | word | who`, `WORDS.*.animal`.
  New home: `HOMES`, `NAMES.*.home | homeAt`, `WORDS.*.home`. New sign kind: `thingKind`, `phrase`, `house`, `thingFromName`.
- New prompt: `PROMPTS` (required derived params) + `p.x` (3 wordings) and `p.x.first` in both languages; the test's
  `PROMPT_VALUES` and `mapsFor`.
- New rule kind: `RULE_KINDS`, `kindFromPrompt`, `goal.<kind>` in both languages, `sayRight` / `goalParams` branches.
- New language: `LANGS`, every `NAMES[xx]` table, `NOUN`, `NUM`, `NUM_ALT`, letters, `WORDS[xx]`, `CLASSIFIERS[xx]`, a complete
  `STR[xx]` (identical key set, params and wording count — tested), `CHILD_FALLBACK[xx]`, phrase word order; `voice.js`:
  `LANG_TAG`, `PREFERRED`.
