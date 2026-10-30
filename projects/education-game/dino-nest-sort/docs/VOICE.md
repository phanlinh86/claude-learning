# Dino Nest Sort — Voice, language and input

Files: `game/js/i18n.js` (`DN.I18N`), `game/js/voice.js` (`DN.Voice`), `game/js/input.js` (`DN.Input`).
Tests: `node tests/unit/i18n_voice.test.js`.

## 1. What integration must do
1. Boot: `DN.Voice.init({ lang, enabled })`, `DN.Input.kidProof()`, `DN.I18N.setChild(settings.name)`.
2. **First `touchend`/`click` anywhere** (same handler that resumes the AudioContext): `DN.Voice.unlock()`.
   Before that, `say()` keeps only the newest line and speaks it right after unlock (so the welcome line is not lost).
3. Bubble + speech: `const p = DN.Voice.sayKey('p.colors', params); bubble.show(p.text);`
   or `DN.Voice.say(DN.I18N.sayCorrect(lang, ev), { interrupt: true })` for `correct` events.
   Use `interrupt: true` for answers to the child's action (grab name, correct, wrong) so Bo never lags behind;
   `priority: true` for lines that must not be dropped (round prompt, talk question).
4. `DN.Voice.onStart / onEnd` → Bo's talk frames and music ducking.
5. Talk time mic button: inside its tap handler call
   `DN.Voice.listen({ lang, choices: talk.choices.map(c => ({ id: c.id, kind: c.kind, value: c.value })), timeoutMs: 7000 })`.
   Hide the mic when `!DN.Voice.canListen()`; show `ui.micUnsupported` / `ui.micDenied` as appropriate.
6. Settings → language: `DN.Voice.setLang(l)`; voice toggle: `DN.Voice.setEnabled(b)`. If `!DN.Voice.hasVoice('vi')`,
   show `ui.voiceMissing` to the parent.
7. `?novoice=1` → `DN.Voice.setEnabled(false)` (lines are still logged in `DN.Voice.log` / `DN.debug.voiceLog`).
8. `DN.Input.attach(canvas, { toLogical, down, move, up, cancel })`; `DN.Input.holdButton(gearBtn, 1500, openSettings, setRing)`.

## 2. How voices are chosen
`speechSynthesis.getVoices()` is read at init, on `voiceschanged` (both `onvoiceschanged` and `addEventListener`, because
Safari historically only supported the property) and by polling every 250 ms for 6 s (iOS fills the list late and may never
fire the event). Each voice whose `lang` starts with the target language is scored:

| rule | score |
|---|---|
| language prefix matches (`en`, `vi`) | base 10 (others are excluded) |
| exact region (`en-US`, `vi-VN`) / `en-GB`, `en-AU` | +6 / +3 |
| preferred name (best first) — en: Samantha, Nicky, Karen, Ava, Allison, Susan, Zoe, Serena, Moira, Tessa, Kate, Google US English, Microsoft Aria/Jenny… · vi: **Linh**, Google Tiếng Việt, Microsoft HoaiMy, Microsoft An | +40 … +23 |
| name contains Enhanced / Premium / Natural / Neural | +12 |
| Google voice on a non-iOS browser | +8 |
| `localService` / `default` | +3 / +2 |
| Apple novelty or Eloquence voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma, Rocko, Sandy…) | −60 |

Utterances: `lang` `en-US` / `vi-VN`, rate **0.9**, pitch **1.15**, volume 1. If no voice matches, the utterance is still
spoken with the `lang` set (the browser may pick something), and `hasVoice(lang)` is false so the UI can tell the parent.

Queue: one line speaking + at most **2** waiting; when full the oldest non-priority line is dropped; non-priority lines older
than 5 s are dropped when they reach the front (stale). `interrupt` cancels everything and speaks after a 50–90 ms gap
(`speak()` straight after `cancel()` is silently dropped on Safari and sometimes Chrome). A watchdog ends a line after its
estimated duration + 4 s because iOS sometimes never fires `onend`. On desktop Chrome a 10 s `pause()/resume()` keep-alive
works around the ~15 s cut-off bug. Speech stops when the page is hidden.

Text → speech: `DN.I18N.speech(lang, text)` (applied by `say`) turns `letter B` into `letter bee`, `2+3` into
`2 plus 3` / `2 cộng 3`, `…` into `.`. The bubble shows the original text.

## 3. Vietnamese letter names (convention)
Bo uses the **phonics names taught in Vietnamese kindergartens and grade 1** ("đọc theo âm"), both on screen and in speech:

a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**
(non-Vietnamese letters, just in case: f→ép, j→gi, w→vê kép, z→dét).

When listening we also accept the alphabet names parents often use (bê, xê, dê, đê, giê, hát, ca, e-lờ, em-mờ, en-nờ, pê,
quy, e-rờ, ét-xì, tê, vê, ích-xì, i-cờ-rét) and "chữ …" forms. Vietnamese letters are matched with diacritics first, so
"ê" → Ê and "e" → E.

## 4. Speech recognition
`listen()` uses `SpeechRecognition || webkitSpeechRecognition`, `lang` `en-US`/`vi-VN`, `interimResults`, `maxAlternatives 5`,
`continuous false`. It stops TTS first (Bo must not talk into the mic). A **final** result that matches resolves at once;
an interim match waits 450 ms for more words ("mười" may become "mười hai"). Ends with `{id:null, reason}` on
`no-speech`, `nomatch`, `timeout` (default 7 s), `aborted`, errors. `not-allowed` / `service-not-allowed` turn
`canListen()` off for the session (no retry loops — the child just taps).

Matcher (`DN.Voice.match(transcripts, choices, lang)`, pure):
- lower-case, NFC, punctuation → spaces; tokens.
- per choice word (from `DN.I18N.words`): exact token sequence (with diacritics) scores 30+len; diacritic-free (`đ`→`d`)
  20+len; number words of **both** languages are also turned into digits ("three", "ba", "mười hai" → 3, 3, 12) 20+len;
  edit distance ≤1 (≤2 for 8+ letters) on single words of 5+ letters with the same first letter, 10+len.
- words written `=to` match only when they are the whole utterance (en "to"→2, "for"→4, vi "không"→0).
- best score wins; equal score → the word said **later** wins ("it's a B" → B); same score and position → ambiguous, try the
  next alternative. First transcript alternative with a match wins; no match → `null`.

## 5. iOS / Safari caveats (checked Oct 2026)
- **Speech recognition needs Siri.** Safari's Web Speech recognition (since Safari 14.1, exposed as `webkitSpeechRecognition`)
  uses Apple's speech service and requires Siri to be enabled; managed devices (Screen Time / MDM) may block it. Errors:
  `not-allowed` = permission/policy, `service-not-allowed` = service off, `no-speech` = silence. Start recognition directly
  from a tap. ([TechNetExperts, Oct 2026](https://www.technetexperts.com/ios-safari-speechrecognition-not-working/),
  [WebKit bug 225298](https://bugs.webkit.org/show_bug.cgi?id=225298), [WebKit bug 239816](https://bugs.webkit.org/show_bug.cgi?id=239816))
- **Home-screen web app:** recognition works in Safari tabs but not (yet) in installed web apps
  ([What PWA Can Do Today](https://whatpwacando.today/speech-recognition),
  [Apple forum 748048](https://developer.apple.com/forums/thread/748048)). `canListen()` therefore returns false when
  `navigator.standalone` / `display-mode: standalone` on iOS, and the game uses the big choice buttons. TTS works in both.
- Older reports of iPad recognition failing: [Apple forum 699881](https://developer.apple.com/forums/thread/699881).
- **First utterance must come from a gesture** (iOS, and Chrome since autoplay rules): `unlock()` speaks a silent `' '`
  inside the first touchend. Until then lines wait.
- **Voices load late:** `getVoices()` is often empty at load; listen for `voiceschanged` and poll
  ([codersblock: TTS quirks](https://codersblock.com/blog/javascript-text-to-speech-and-its-many-quirks/),
  [MDN voiceschanged](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event)).
- Safari has had bugs where choosing a different voice still plays the default one (iOS 15.4–15.6)
  ([phetsims/utterance-queue#74](https://github.com/phetsims/utterance-queue/issues/74)); setting `lang` as well as `voice`
  keeps the right language even then.
- **Silent switch:** the ring/silent switch mutes WebAudio (our SFX/music) in Safari; TTS may or may not be muted depending on
  the iOS version and route — tell parents to turn the switch off and the volume up. TTS `volume` is ignored on iOS.
- **Vietnamese voice:** iOS ships a vi-VN voice ("Linh"); if it is missing, parents can download it in
  Settings › Accessibility › Spoken Content › Voices › Vietnamese (an Enhanced version is often available and is preferred
  automatically). Desktop Chrome has "Google Tiếng Việt" (network voice); Windows Edge has Microsoft HoaiMy/NamMinh (online).
- iOS fires `pointercancel` on system gestures (Control Centre, home swipe) — `DN.Input` turns that into `cancel()`.
- A Bluetooth headset changes the mic route; test with the built-in mic first.

## 6. Input and kid-proofing (`DN.Input`)
- `attach()`: Pointer Events, pointer capture, one finger at a time, ignores targets matching
  `button, .screen, #hud, .no-game-input`; `pointercancel`, `lostpointercapture`, window blur and page hide → `cancel()`.
  Touch + mouse fallback when `PointerEvent` is missing. Optional `hover(x,y)` for desktop mouse.
- `kidProof()`: injects CSS (`touch-action: manipulation`, no callout/selection, `overscroll-behavior: none`), blocks
  `gesturestart/change/end`, multi-touch `touchstart/touchmove`, single-finger `touchmove` outside `.scroll` and range inputs
  (stops rubber-band and pull-to-refresh), fast double-tap zoom on non-interactive areas, `dblclick`, `contextmenu`,
  `selectstart`, `dragstart`, Ctrl/⌘+wheel, Ctrl/⌘ + `+ − = 0`, F5 and Ctrl/⌘+R. Form fields keep selection and menus.
- `holdButton(el, ms, onDone, onProgress)`: progress 0..1 via rAF; cancels on release, finger sliding > 24 px off the button,
  pointercancel, mouse leave or window blur; Enter/Space also work; a quick tap does nothing. Returns `off()`.

## 7. Adding a language
1. `i18n.js`: add the code to `LANGS`, a `NAMES[xx]` table (same kinds/values), `HOME_AT[xx]`, `NUM[xx]` (0–20),
   optional `NUM_ALT[xx]`, letter names, `WORDS[xx]` (accepted spoken forms), `WORD_LIST[xx]` for the `initial` topic and a
   complete `STR[xx]` (the test requires identical key sets) plus `CHILD_FALLBACK[xx]`.
2. `voice.js`: add `LANG_TAG[xx]` (BCP-47, e.g. `fr-FR`) and `PREFERRED[xx]` voice names.
3. Plurals: `resolveParam` handles English fruit plurals; add rules there if the language needs them.
4. Run `node tests/unit/i18n_voice.test.js` and add matcher cases for the new language.
