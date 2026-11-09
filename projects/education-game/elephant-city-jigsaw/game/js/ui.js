/* PZ.UI (Pom's Puzzle Town) — DOM screens: title, parent settings, HUD, Pom's speech bubble, pause, Talk time,
 * celebration. Talk-time pictures are drawn with PZ.PuzzleArt.drawIcon (Renderer.preview) into small canvases. */
(function (PZ) {
  'use strict';
  const $ = id => document.getElementById(id);
  const T = (lang, key, p) => (PZ.I18N ? PZ.I18N.t(lang, key, p) : key);
  const NAME = (lang, kind, v) => (PZ.I18N ? PZ.I18N.name(lang, kind, v) : String(v));
  const SCREENS = ['scrTitle', 'scrSettings', 'scrPause', 'scrTalk', 'scrDone', 'loading'];

  const UI = {
    lang: 'en',
    show(id, on = true) { $(id).classList.toggle('hidden', !on); },
    only(...ids) { SCREENS.forEach(s => this.show(s, ids.includes(s))); },

    applyLang(lang) {
      this.lang = lang;
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n'), v = T(lang, k);
        if (v && v !== k) el.textContent = v;
      });
      document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
      const title = T(lang, 'ui.title');
      const parts = [T(lang, 'ui.logo1'), T(lang, 'ui.logo2')];
      $('logo1').textContent = parts[0]; $('logo2').textContent = parts[1];
      const sub = T(lang, 'ui.subtitle'); $('tagline').textContent = sub === 'ui.subtitle' ? '' : sub;
      document.title = title === 'ui.title' ? "Pom's Puzzle Town" : title;
      $('inpName').placeholder = T(lang, 'ui.namePlaceholder');
      $('btnPlay').setAttribute('aria-label', T(lang, 'ui.play'));
    },
    setTitleInfo(stars, age, lang) {
      $('titleStars').textContent = stars;
      const a = T(lang, 'ui.age');
      $('titleAge').textContent = `· ${a === 'ui.age' ? 'Age' : a} ${age >= 7 ? '7+' : age}`;
    },
    bindSettings(s, onChange, getAge) {   // getAge: the age actually played (a session-only ?age= flag may differ from s.age)
      const chips = document.querySelectorAll('#ageChips .chip');
      const refresh = () => {
        const age = getAge ? getAge() : s.age;
        chips.forEach(c => c.classList.toggle('on', +c.dataset.age === Math.min(7, age)));
        $('optSfx').checked = s.sfx; $('optMusic').checked = s.music; $('optVoice').checked = s.voice; $('optMic').checked = s.mic;
        if (document.activeElement !== $('inpName')) $('inpName').value = s.name || '';
      };
      chips.forEach(c => c.addEventListener('click', () => { s.age = +c.dataset.age; onChange('age'); refresh(); }));
      [['optSfx', 'sfx'], ['optMusic', 'music'], ['optVoice', 'voice'], ['optMic', 'mic']].forEach(([id, k]) =>
        $(id).addEventListener('change', () => { s[k] = $(id).checked; onChange(k); }));
      $('inpName').addEventListener('input', () => { s.name = $('inpName').value.replace(/[<>{}]/g, '').slice(0, 16); onChange('name'); });
      $('inpName').addEventListener('keydown', e => { if (e.key === 'Enter') $('inpName').blur(); });
      this.refreshSettings = refresh;
      refresh();
    },
    setVoiceInfo(text) { $('voiceInfo').textContent = text || ''; },

    /* ---------- HUD ---------- */
    setStars(n, bump) {
      $('hudStars').textContent = n;
      if (bump) { const el = $('hudStars').parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    },
    setDots(total, done) {
      const box = $('hudDots');
      if (box.childElementCount !== total) { box.innerHTML = ''; for (let i = 0; i < total; i++) box.appendChild(document.createElement('i')); }
      [...box.children].forEach((d, i) => { d.className = i < done ? 'done' : i === done ? 'now' : ''; });
    },
    hudStarPoint() { // centre of the HUD star icon, in CSS px
      const r = $('hudStars').parentElement.querySelector('img').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    /* ---------- bubble ---------- */
    say(text) {
      const b = $('bubble'), t = $('bubbleText');
      b.classList.remove('fade');
      if (!text) { b.classList.add('hidden'); return; }
      t.textContent = text;
      b.classList.remove('hidden', 'say'); void b.offsetWidth; b.classList.add('say');
      this._fitBubble();
    },
    // the alive phase / a piece carried past the bubble: the bubble steps back
    fadeBubble(on) { $('bubble').classList.toggle('fade', !!on); },
    placeBubble(rect) { // CSS px rect
      const b = $('bubble');
      b.style.left = rect.x + 'px'; b.style.top = rect.y + 'px';
      b.style.width = rect.w + 'px'; b.style.minHeight = rect.h + 'px';
      this._bubbleRect = rect;
      this._fitBubble();
    },
    _fitBubble() {
      const r = this._bubbleRect; if (!r) return;
      const t = $('bubbleText');
      let fs = Math.max(15, Math.min(34, r.h * 0.3));
      t.style.fontSize = fs + 'px';
      const b = $('bubble');
      for (let i = 0; i < 8 && b.scrollHeight > r.h * 1.35 && fs > 14; i++) { fs *= 0.9; t.style.fontSize = fs + 'px'; }
    },

    /* ---------- Talk time ---------- */
    openTalk(talk, lang, onChoice, mic, age) {
      this._age = age || 4;
      $('talkTitle').textContent = T(lang, 'talk.intro').split(/[!.?]/)[0] + '!';
      $('talkQ').textContent = T(lang, talk.promptKey, talk.params || {});
      this.only('scrTalk');
      const sh = talk.show || {}, empty = !talk.show;
      $('talkShow').classList.toggle('hidden', empty);
      document.querySelector('.talk-panel').classList.toggle('noshow', empty);   // no picture to show: the question says it all
      if (!empty) requestAnimationFrame(() => PZ.Renderer.preview($('talkShow'), sh));
      const box = $('talkChoices'); box.innerHTML = '';
      talk.choices.forEach(c => {
        const b = document.createElement('button');
        b.dataset.id = c.id;
        const th = c.thing || c, label = this._choiceLabel(lang, th);
        const cv = document.createElement('canvas'); b.appendChild(cv);
        requestAnimationFrame(() => PZ.Renderer.preview(cv, th));
        if (label) { const sm = document.createElement('small'); sm.textContent = label; b.appendChild(sm); }
        b.setAttribute('aria-label', this._choiceAria(lang, th) || label || String(c.value));
        b.addEventListener('click', () => onChoice(c.id));
        box.appendChild(b);
      });
      const mb = $('btnMic');
      mb.classList.toggle('hidden', !mic);
      mb.classList.remove('listening');
      $('micLabel').textContent = T(lang, 'ui.tapOrSay');
    },
    /** no printed caption under a Talk picture: the questions name the answer ("Where is the duck?", "Which one is the
     *  triangle?"), so a caption would give it away to a reader; the picture IS the answer (aria-label keeps the name) */
    _choiceLabel() { return ''; },
    _choiceAria(lang, th) {
      try { return PZ.I18N && PZ.I18N.phrase ? PZ.I18N.phrase(lang, th) : ''; } catch (e) { return ''; }
    },
    glowTalk(answerId) {
      [...$('talkChoices').children].forEach(b => { if (b.dataset.id === String(answerId)) b.classList.add('glow'); });
    },
    markTalk(choiceId, answerId) {
      [...$('talkChoices').children].forEach(b => {
        if (b.dataset.id === String(answerId)) b.classList.add('right');
        else if (b.dataset.id === String(choiceId)) b.classList.add('wrongpick');
      });
      $('btnMic').classList.remove('listening');
    },
    setListening(on, text) {
      $('btnMic').classList.toggle('listening', !!on);
      if (text) $('micLabel').textContent = text;
    }
  };
  PZ.UI = UI;
})(window.PZ = window.PZ || {});
