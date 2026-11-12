/* FP.UI (Bo's Farm Parade) — DOM screens: title, parent settings, HUD, Bo's speech bubble, pause, Talk time,
 * celebration. Talk-time pictures (the shown member, colour blobs, shape blocks, numerals with apple dots, home badges)
 * are drawn with FP.ParadeArt.drawIcon (Renderer.preview) into small canvases — pictures, never words to read. */
(function (FP) {
  'use strict';
  const $ = id => document.getElementById(id);
  /** the child's name: tags removed WITH their content, no braces, spaces trimmed and collapsed, ≤ 16 letters (diacritics kept) */
  const cleanName = v => String(v || '').replace(/<[^>]*>?/g, '').replace(/\{[^}]*\}?/g, '').replace(/[<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  const T = (lang, key, p) => (FP.I18N ? FP.I18N.t(lang, key, p) : key);
  const NAME = (lang, kind, v) => (FP.I18N ? FP.I18N.name(lang, kind, v) : String(v));
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
      let sub = T(lang, 'ui.subtitle'); if (sub === 'ui.subtitle') sub = T(lang, 'ui.tagline'); $('tagline').textContent = sub === 'ui.tagline' ? '' : sub;
      document.title = title === 'ui.title' ? "Bo's Farm Parade" : title;
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
      $('inpName').addEventListener('input', () => { s.name = cleanName($('inpName').value); onChange('name'); });
      $('inpName').addEventListener('keydown', e => { if (e.key === 'Enter') $('inpName').blur(); });
      this.refreshSettings = refresh; this.cleanName = cleanName;
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
    // the march / Talk time: the bubble steps back
    fadeBubble(on) { $('bubble').classList.toggle('fade', !!on); },
    placeBubble(rect) { // CSS px rect
      const b = $('bubble');
      b.style.left = rect.x + 'px'; b.style.top = rect.y + 'px';
      b.style.width = rect.w + 'px';
      this._bubbleRect = rect;
      this._fitBubble();
    },
    _fitBubble() {
      const r = this._bubbleRect; if (!r) return;
      const t = $('bubbleText'), b = $('bubble');
      // a short line gets a short bubble (min 55 % of the reserved box); a long line shrinks its font until the bubble
      // fits the box the world reserved (layout = reality: nothing below the box is ever covered)
      b.style.minHeight = Math.round(r.h * 0.55) + 'px';
      let fs = Math.max(15, Math.min(34, r.h * 0.3));
      t.style.fontSize = fs + 'px';
      for (let i = 0; i < 10 && b.offsetHeight > r.h + 1 && fs > 13; i++) { fs *= 0.92; t.style.fontSize = fs + 'px'; }
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
      if (!empty) requestAnimationFrame(() => FP.Renderer.preview($('talkShow'), sh));
      const box = $('talkChoices'); box.innerHTML = '';
      talk.choices.forEach(c => {
        const b = document.createElement('button');
        b.dataset.id = c.id;
        const th = c.thing || c, label = this._choiceLabel(lang, th);
        const cv = document.createElement('canvas'); b.appendChild(cv);
        requestAnimationFrame(() => FP.Renderer.preview(cv, th));
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
    /** no printed caption under a Talk picture: the questions name the answer ("Which one is the triangle?"), so a caption
     *  would give it away to a reader; the picture IS the answer (aria-label keeps the name) */
    _choiceLabel() { return ''; },
    _choiceAria(lang, th) {
      try { return FP.I18N && FP.I18N.phrase ? FP.I18N.phrase(lang, th) : ''; } catch (e) { return ''; }
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
  FP.UI = UI;
})(window.FP = window.FP || {});
