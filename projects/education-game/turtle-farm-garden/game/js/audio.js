/* FT.Audio (Tumi's Flower Farm) — every sound is synthesized with WebAudio (no files to license or download).
 * Seed-packet pick "rustle-plip" in the colour's note, the watering flow (a looping bright filtered noise = water trickle
 * whose pitch rises with the trace progress, silent when nothing flows) + little sprout "pops", stroke chime, bloom
 * arpeggio, carrot "fwup" + count chime, a friendly boing, soft soil pats, hop boings, the farm bell at chapter end,
 * butterfly shimmer, chick cheep + straw rustle, a meadow breeze with far birdsong (wind gusts in autumn) and a
 * music-box / marimba loop per season (ducked while Tumi speaks).
 */
(function (FT) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // one pentatonic "home" note per flower colour, so each seed packet has its own voice
  const COLOR_NOTE = { red: 72, orange: 74, yellow: 76, green: 79, blue: 81, purple: 84, pink: 86 };
  const MUSIC = [
    { root: 62, tempo: 96, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], lead: 'marimba' },   // spring: D, light marimba
    { root: 65, tempo: 108, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], lead: 'marimba' },  // summer: F, bright
    { root: 60, tempo: 88, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'box' },        // autumn: C, warm music box
    { root: 67, tempo: 76, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], lead: 'box' }        // winter: G, slow music box
  ];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const SCALE_C = [0, 0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 29, 31, 33];

  const A = {
    ctx: null, master: null, comp: null, user: null, sfx: null, music: null, amb: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, ducked: false, volume: 1,
    mood: 0, _timer: null, _next: 0, _step: 0, _phrase: null, _playing: false, _hum: null, _flow: null, _lastPlay: {}, _ambT: 3,
    flowOn: false, flowLevel: 0,

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 1;
      const comp = this.comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.user = c.createGain(); this.user.gain.value = this.volume * 1.6;
      this.master.connect(comp); comp.connect(this.user); this.user.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      this.amb = c.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
      return true;
    },
    unlock() {
      // iOS: use the media channel (media volume, plays with the side switch on) instead of the quiet ambient one
      try { if (navigator.audioSession && navigator.audioSession.type !== 'playback' && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; } catch (e) {}
      if (!this.ensure()) return;
      const c = this.ctx;
      if (c.state !== 'running') c.resume().catch(() => {});
      // iOS needs a sound started inside the gesture: play one silent sample
      try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    },
    suspend() { this.setFlow(false); if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
    resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
    apply() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
      this.user.gain.setTargetAtTime(Math.max(0, Math.min(1, this.volume)) * 1.6, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.9 : 0, t, 0.03);
      const mv = this.musicOn && this._playing ? (this.ducked ? 0.07 : 0.2) : 0;
      this.music.gain.setTargetAtTime(mv, t, this.ducked ? 0.08 : 0.5);
      // the amb bus: the meadow breeze (+ birdsong), a little lower under speech
      this.amb.gain.setTargetAtTime(this.sfxOn && this._playing ? (this.ducked ? 0.5 : 1) : 0, t, 0.3);
    },
    setVolume(v) { this.setOptions({ volume: v }); },
    setOptions({ sfx, music, muted, volume }) {
      if (volume !== undefined) this.volume = Math.max(0, Math.min(1, +volume || 0));
      if (sfx !== undefined) this.sfxOn = sfx;
      if (music !== undefined) this.musicOn = music;
      if (muted !== undefined) this.muted = muted;
      this.apply();
    },
    duck(on) { if (this.ducked !== !!on) { this.ducked = !!on; this.apply(); } },
    /** the gains of the chain (FT.debug.audio().gains()) */
    gains() {
      if (!this.ctx) return null;
      return { master: this.master.gain.value, user: this.user.gain.value, sfx: this.sfx.gain.value, music: this.music.gain.value, amb: this.amb.gain.value,
        makeup: 1.6, volume: this.volume, compressor: { threshold: this.comp.threshold.value, ratio: this.comp.ratio.value }, flow: this._flow ? this._flow.g.gain.value : 0 };
    },

    /* ---------- meadow ambience: a soft breeze (louder in gusts); birdsong now and then (not in winter) ---------- */
    _startHum() {
      if (!this.ctx || this._hum) return;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0.03;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.014;
      lfo.connect(lg); lg.connect(g.gain);
      const hum = c.createOscillator(), hg = c.createGain(); hum.type = 'sine'; hum.frequency.value = 0.07; hg.gain.value = 180;   // the breeze swells
      hum.connect(hg); hg.connect(f.frequency);
      s.connect(f); f.connect(g); g.connect(this.amb);
      s.start(); lfo.start(); hum.start();
      this._hum = { s, lfo, hum, g };
    },
    _stopHum() {
      const h = this._hum; if (!h) return;
      try { h.s.stop(); h.lfo.stop(); h.hum.stop(); } catch (e) {}
      this._hum = null;
    },
    /* the watering flow: one looping noise source; setFlow drives its gain + pitch */
    _ensureFlow() {
      if (!this.ctx || this._flow) return this._flow;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.6;
      const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 5200;
      const g = c.createGain(); g.gain.value = 0;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 11; lg.gain.value = 420;   // a bubbly water trickle
      lfo.connect(lg); lg.connect(f.frequency);
      s.connect(f); f.connect(f2); f2.connect(g); g.connect(this.sfx);
      s.start(); lfo.start();
      this._flow = { s, f, g, lfo };
      return this._flow;
    },
    /** on: water is pouring now; p: trace progress 0..1 (pitch rises). Silent when off. */
    setFlow(on, p) {
      on = !!on && !this.muted && this.sfxOn;
      this.flowOn = on; this.flowLevel = p || 0;
      if (!this.ctx) return;
      if (!on && !this._flow) return;
      const F = this._ensureFlow(); if (!F) return;
      const t = this.ctx.currentTime;
      F.g.gain.setTargetAtTime(on ? 0.13 : 0, t, on ? 0.03 : 0.06);
      if (on) F.f.frequency.setTargetAtTime(1500 + 1400 * Math.max(0, Math.min(1, p || 0)), t, 0.08);
      if (on && t - (this._sproutT || 0) > 0.16) { this._sproutT = t; this.tone(NOTE(84 + Math.round((p || 0) * 12)) * (1 + (Math.random() - 0.5) * 0.04), 0.07, { type: 'sine', vol: 0.05, slideTo: NOTE(91 + Math.round((p || 0) * 12)), attack: 0.002 }); }   // sprouts pop
    },
    /* call every frame (real seconds): ambient touches */
    tick(dt) {
      if (!this.ctx || !this._playing || this.muted || !this.sfxOn) return;
      this._ambT -= dt || 0;
      if (this._ambT > 0) return;
      this._ambT = 5 + Math.random() * 7;
      if (this._hum && this.gust != null) this._hum.g.gain.setTargetAtTime(0.03 + 0.06 * this.gust, this.ctx.currentTime, 0.6);
      if (this.mood === 3) {   // winter: a soft far-away sleigh-bell jingle now and then
        for (let i = 0; i < 4; i++) this.tone(3100 + Math.random() * 500, 0.12, { type: 'sine', vol: 0.008, at: i * 0.07, attack: 0.002, dest: this.amb });
      } else {   // a far songbird: 2–4 quick warbles
        const f = 2600 + Math.random() * 900, n = 2 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) this.tone(f * (1 + (i % 2) * 0.18), 0.09, { type: 'sine', vol: 0.016, at: i * 0.12, slideTo: f * 1.25, attack: 0.004, dest: this.amb });
      }
    },

    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.006, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, { vol = 0.2, at = 0, type = 'bandpass', f0 = 1200, f1 = null, q = 1.2, dest = null, attack = 0.012 } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    /* a marimba-ish mallet note: sine fundamental + a quick 4th harmonic "tok" */
    mallet(f, dur, { vol = 0.2, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.003, dest });
      this.tone(f * 4, Math.min(0.08, dur * 0.3), { type: 'sine', vol: vol * 0.22, at, attack: 0.002, dest });
      this.tone(f * 2, dur * 0.5, { type: 'triangle', vol: vol * 0.12, at, attack: 0.003, dest });
    },

    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      const gap = { pop: 0.05, squish: 0.04, whoosh: 0.06, pat: 0.06, land: 0.06, hop: 0.06, tock: 0.03, soft: 0.2, walk: 0.08 }[name];
      if (gap && now - (this._lastPlay[name] || 0) < gap) return;   // staggered, never a buzz
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      const cn = NOTE(COLOR_NOTE[opt.color] || 76);
      switch (name) {
        case 'pop': this.tone(520 * r, 0.09, { vol: 0.12, slideTo: 880 * r }); break;              // a choice pops in
        case 'squish':   // the seed packet is picked: a paper rustle + a seed rattle + a round "plip" in the colour's note
          this.noise(0.12, { vol: 0.12, type: 'highpass', f0: 2500, q: 0.7, attack: 0.01 });
          for (let i = 0; i < 4; i++) this.tone(3000 + Math.random() * 1500, 0.025, { type: 'triangle', vol: 0.04, at: 0.02 + i * 0.025, attack: 0.001 });
          this.tone(cn * 0.5 * r, 0.12, { type: 'sine', vol: 0.28, slideTo: cn * 1.2 * r, attack: 0.003, at: 0.08 });
          this.tone(cn * r, 0.2, { type: 'triangle', vol: 0.1, at: 0.13 }); break;
        case 'pickCookie': this.tone(NOTE(76) * r, 0.12, { type: 'triangle', vol: 0.16, slideTo: NOTE(83) * r }); break;
        case 'whoosh': this.noise(0.24, { vol: 0.08, f0: 500, f1: 2200, q: 0.9 }); break;
        case 'land': case 'pat':   // a sign lands on the soil: a soft earthy pat
          this.tone(200 * r, 0.12, { type: 'sine', vol: name === 'land' ? 0.22 : 0.14, slideTo: 120 * r, attack: 0.003 });
          this.noise(0.07, { vol: 0.06, type: 'lowpass', f0: 900, q: 0.7 }); break;
        case 'stroke': [0, 7, 12].forEach((n, i) => this.tone(NOTE(84 + n), 0.3, { type: 'sine', vol: 0.12, at: i * 0.06 })); break;
        case 'progress': this.tone(NOTE(79 + (opt.i || 0) * 2), 0.16, { type: 'sine', vol: 0.07 }); break;
        case 'traceDone':   // a sparkle arpeggio up
          [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.mallet(NOTE(76 + n), 0.3, { vol: 0.14, at: i * 0.05 }));
          for (let i = 0; i < 5; i++) this.tone(NOTE(100 + i * 2), 0.12, { type: 'sine', vol: 0.03, at: 0.36 + i * 0.04 });
          break;
        case 'chipDrop': this.noise(0.12, { vol: 0.08, type: 'lowpass', f0: 700, q: 0.8, attack: 0.005 }); break;   // the soil bumps
        case 'tock':   // the carrot pops out: a juicy "fwup"
          this.tone(260 * r, 0.13, { type: 'sine', vol: 0.24, slideTo: 720 * r, attack: 0.003 });
          this.noise(0.08, { vol: 0.07, type: 'bandpass', f0: 1200, f1: 3000, q: 1.5, attack: 0.003 }); break;
        case 'count': { const k = Math.min(opt.i || 1, 20); const f = NOTE(SCALE_C[k] + 72); this.mallet(f, 0.4, { vol: 0.22, at: 0.04 }); this.tone(f * 2, 0.25, { vol: 0.06, at: 0.07 }); break; }
        case 'chipsDone': [0, 4, 7, 12].forEach((n, i) => this.mallet(NOTE(79 + n), 0.3, { vol: 0.15, at: i * 0.07 })); break;
        case 'boing': this.tone(180 * r, 0.42, { type: 'triangle', vol: 0.24, slideTo: 520 * r }); this.tone(360 * r, 0.3, { type: 'sine', vol: 0.08, at: 0.05, slideTo: 260 * r }); break;
        case 'soft': this.tone(500 * r, 0.16, { vol: 0.1, slideTo: 380 * r }); break;                 // needPick / already / offPath
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.1, at: i * 0.07 })); break;
        case 'magic': for (let i = 0; i < 8; i++) this.tone(NOTE(88 + SCALE[i % 8]), 0.2, { vol: 0.07, at: i * 0.045 }); break;
        case 'finish':   // the bloom wave: rising soft pops + a shimmer
          for (let i = 0; i < 12; i++) this.tone(NOTE(79 + SCALE[i % 8] + (i >= 8 ? 12 : 0)), 0.09, { type: 'sine', vol: 0.06, at: 0.05 + i * 0.05, slideTo: NOTE(86 + SCALE[i % 8]), attack: 0.002 });
          this.tone(NOTE(96), 0.8, { type: 'sine', vol: 0.03, slideTo: NOTE(103), attack: 0.2 });
          break;
        case 'hop': this.tone(260 * r, 0.16, { vol: 0.14, slideTo: 640 * r, type: 'triangle' }); this.tone(130 * r, 0.1, { vol: 0.08, type: 'sine', slideTo: 90 }); break;
        case 'bigHop': this.tone(220 * r, 0.32, { vol: 0.16, slideTo: 780 * r, type: 'triangle' }); this.noise(0.25, { vol: 0.05, f0: 600, f1: 2000, q: 0.9 }); break;
        case 'rack': this.tone(330 * r, 0.08, { type: 'triangle', vol: 0.14, slideTo: 250 * r, attack: 0.002 }); this.tone(NOTE(91) * r, 0.25, { type: 'sine', vol: 0.08, at: 0.04 }); break;   // the rosette taps the fence + a ting
        case 'walk': this.tone(300 * r, 0.05, { type: 'sine', vol: 0.08, slideTo: 200 * r, attack: 0.002 }); break;
        case 'home': [0, 7, 12, 16].forEach((n, i) => this.mallet(NOTE(72 + n), 0.3, { vol: 0.14, at: i * 0.08 })); break;
        case 'ding':   // the farm bell: this chapter's garden is done
          [0, 0.45].forEach(at => { this.tone(NOTE(93), 1.4, { type: 'sine', vol: 0.18, at, attack: 0.002 }); this.tone(NOTE(93) * 2.76, 0.6, { type: 'sine', vol: 0.05, at, attack: 0.002 }); this.tone(NOTE(93) * 5.4, 0.3, { type: 'sine', vol: 0.02, at, attack: 0.002 }); });
          break;
        case 'chirp':   // the butterfly: a twinkly shimmer up
          for (let i = 0; i < 7; i++) this.tone(NOTE(91 + SCALE[i]) * r, 0.16, { type: 'sine', vol: 0.07, at: i * 0.05, attack: 0.003 });
          break;
        case 'birdIn': [0, 4, 7].forEach((n, i) => this.tone(NOTE(96 + n) * r, 0.12, { type: 'sine', vol: 0.04, at: i * 0.06, attack: 0.003 })); break;
        case 'squeak':   // the chick: "cheep cheep" + a straw rustle
          this.tone(3400 * r, 0.09, { type: 'sine', vol: 0.12, slideTo: 2500 * r, attack: 0.003 });
          this.tone(3500 * r, 0.09, { type: 'sine', vol: 0.11, slideTo: 2600 * r, at: 0.16, attack: 0.003 });
          this.noise(0.35, { vol: 0.07, type: 'highpass', f0: 3000, q: 0.5, at: 0.05, attack: 0.02 });
          break;
        case 'peek': this.tone(1500 * r, 0.06, { type: 'triangle', vol: 0.05, slideTo: 1900 * r }); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.22 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.09, at: 0.03 }); break;
        case 'level': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.mallet(NOTE(67 + n), 0.45, { vol: 0.2, at: i * 0.08 })); break;
        case 'fanfare':
          [[0, 0], [4, .14], [7, .28], [12, .42], [7, .62], [12, .76], [16, .9]].forEach(([n, t]) => {
            this.mallet(NOTE(72 + n), 0.5, { vol: 0.2, at: t }); this.tone(NOTE(60 + n), 0.4, { type: 'triangle', vol: 0.14, at: t });
          });
          break;
        case 'chapter': [0, 7, 12].forEach((n, i) => this.mallet(NOTE(79 + n), 0.8, { vol: 0.14, at: i * 0.12 })); break;
        case 'click': this.tone(900, 0.05, { vol: 0.14, slideTo: 1300 }); break;
        case 'talkRight': [0, 4, 7, 12].forEach((n, i) => this.mallet(NOTE(76 + n), 0.3, { vol: 0.22, at: i * 0.08 })); break;
        case 'listen': this.tone(NOTE(81), 0.12, { vol: 0.18 }); this.tone(NOTE(88), 0.12, { vol: 0.18, at: 0.1 }); break;
      }
    },

    setMood(i) {
      i = ((i % 4) + 4) % 4;
      if (i === this.mood && this._phrase) return;
      this.mood = i;
      this._phrase = this._makePhrase(i);
      this.apply();
    },
    _makePhrase(i) {
      let seed = 5151 + i * 733;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const notes = []; let deg = 4;
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 8; s++) {
        const rest = (s % 2 === 1 && rnd() < 0.55) || (bar === 3 && s >= 5);
        deg = Math.max(1, Math.min(8, deg + Math.round((rnd() - 0.5) * 3)));
        notes.push(rest ? null : deg);
      }
      return notes;
    },
    startMusic() {
      if (!this.ensure()) return;
      if (!this._phrase) this._phrase = this._makePhrase(this.mood);
      this._playing = true;
      this._startHum();
      if (!this._timer) { this._next = this.ctx.currentTime + 0.15; this._step = 0; this._timer = setInterval(() => this._schedule(), 40); }
      this.apply();
    },
    stopMusic() {
      this._playing = false;
      this.setFlow(false);
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.apply();
      setTimeout(() => { if (!this._playing) this._stopHum(); }, 900);
    },
    _schedule() {
      const c = this.ctx; if (!c) return;
      if (c.state !== 'running') { this._next = c.currentTime + 0.1; return; }
      const m = MUSIC[this.mood];
      const eighth = 60 / m.tempo / 2;
      while (this._next < c.currentTime + 0.2) {
        this._playStep(this._step, this._next, m, eighth);
        this._next += eighth;
        this._step = (this._step + 1) % 32;
      }
    },
    _playStep(step, t, m, eighth) {
      if (!this.musicOn) return;
      const bar = Math.floor(step / 8), s = step % 8, chord = m.prog[bar];
      const at = Math.max(0, t - this.ctx.currentTime), D = this.music;
      if (s === 0 || s === 4) this.tone(NOTE(m.root - 12 + chord[0]), eighth * 3, { vol: 0.24, at, dest: D, attack: 0.01 });   // soft bass
      if (s === 2 || s === 6) chord.forEach(n => this.tone(NOTE(m.root + n), eighth * 1.4, { vol: 0.05, at, dest: D, attack: 0.008 }));
      const deg = this._phrase[step];
      if (deg != null) {
        const f = NOTE(m.root + 12 + SCALE[deg]);
        if (m.lead === 'box') { this.tone(f * 2, eighth * 2.4, { type: 'sine', vol: 0.08, at, dest: D, attack: 0.003 }); this.tone(f * 4.02, eighth, { type: 'sine', vol: 0.018, at, dest: D, attack: 0.003 }); }
        else this.mallet(f, eighth * 1.8, { vol: 0.12, at, dest: D });
      }
    }
  };
  FT.Audio = A;
})(window.FT = window.FT || {});
