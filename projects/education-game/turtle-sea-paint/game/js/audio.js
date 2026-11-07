/* SP.Audio (Nini's Sea Painting) — every sound is synthesized with WebAudio (no files to license or download).
 * Shell pick "plip", brush whoosh, wet "splotch" + a rising fill shimmer pitched per colour, count chimes, a friendly
 * boing, the finish sweep glissando, the alive swish + bubbles, fishy giggle, clam creak + chime, a soft underwater hum
 * with stray bubbles, and a marimba / music-box loop per season (ducked while Nini speaks).
 * Chain: sfx / music / amb → master (mute) → compressor → user volume × 1.6 makeup → speakers (phones are quiet).
 * iOS: call unlock() inside the first touchend/click (it also switches the audio session to 'playback'). */
(function (SP) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // one pentatonic "home" note per paint colour, so each colour has its own voice (fill shimmer / splotch)
  const COLOR_NOTE = { red: 72, orange: 74, yellow: 76, green: 79, blue: 81, purple: 84, pink: 86 };
  const MUSIC = [
    { root: 62, tempo: 96, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], lead: 'marimba' },   // spring: D, light marimba
    { root: 65, tempo: 108, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], lead: 'marimba' },  // summer: F, bright
    { root: 60, tempo: 88, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'box' },        // autumn: C, warm music box
    { root: 67, tempo: 76, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], lead: 'box' }        // winter: G, slow music box
  ];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const SCALE_C = [0, 0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];

  const A = {
    ctx: null, master: null, user: null, sfx: null, music: null, amb: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, ducked: false, volume: 1,
    mood: 0, _timer: null, _next: 0, _step: 0, _phrase: null, _playing: false, _hum: null, _lastPlay: {}, _bubT: 0,

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 1;
      const comp = c.createDynamicsCompressor();
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
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
    resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
    apply() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
      this.user.gain.setTargetAtTime(Math.max(0, Math.min(1, this.volume)) * 1.6, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.9 : 0, t, 0.03);
      const mv = this.musicOn && this._playing ? (this.ducked ? 0.07 : 0.2) : 0;
      this.music.gain.setTargetAtTime(mv, t, this.ducked ? 0.08 : 0.5);
      // the amb bus: the underwater hum + stray bubbles, a little lower under speech
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

    /* ---------- underwater ambience: a slow low hum (filtered noise, breathing) + a stray bubble now and then ---------- */
    _startHum() {
      if (!this.ctx || this._hum) return;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0.05;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.025;
      lfo.connect(lg); lg.connect(g.gain);
      const lfo2 = c.createOscillator(), lg2 = c.createGain(); lfo2.frequency.value = 0.07; lg2.gain.value = 80;
      lfo2.connect(lg2); lg2.connect(f.frequency);
      s.connect(f); f.connect(g); g.connect(this.amb);
      s.start(); lfo.start(); lfo2.start();
      this._hum = { s, lfo, lfo2 };
    },
    _stopHum() {
      const h = this._hum; if (!h) return;
      try { h.s.stop(); h.lfo.stop(); h.lfo2.stop(); } catch (e) {}
      this._hum = null;
    },
    /* call every frame (real seconds): stray ambient bubbles */
    tick(dt) {
      if (!this.ctx || !this._playing || this.muted || !this.sfxOn) return;
      this._bubT -= dt || 0;
      if (this._bubT > 0) return;
      this._bubT = 2.2 + Math.random() * 4.5;
      const n = 1 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) this.bubble(i * (0.07 + Math.random() * 0.08), 0.05, this.amb);
    },
    /* one bubble "bloop": a sine whose pitch rises fast (the classic bubble resonance) */
    bubble(at = 0, vol = 0.12, dest = null) {
      const f = 380 + Math.random() * 520;
      this.tone(f, 0.07 + Math.random() * 0.05, { type: 'sine', vol, at, slideTo: f * (1.8 + Math.random() * 0.8), attack: 0.004, dest });
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
      const gap = { pop: 0.05, plip: 0.04, whoosh: 0.06, bubbles: 0.12, sweep: 0.05, hop: 0.06, shellPop: 0.05 }[name];
      if (gap && now - (this._lastPlay[name] || 0) < gap) return;   // staggered, never a buzz
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      const cn = NOTE(COLOR_NOTE[opt.color] || 76);
      switch (name) {
        case 'shellPop': this.tone(520 * r, 0.09, { vol: 0.12, slideTo: 900 * r }); break;            // a shell pops in
        case 'pop': this.tone(520 * r, 0.09, { vol: 0.14, slideTo: 880 * r }); break;
        case 'plip':   // shell pick: a wet, round "plip" (fast rising sine + a drop of noise), in the colour's note
          this.tone(cn * 0.5 * r, 0.12, { type: 'sine', vol: 0.3, slideTo: cn * 1.2 * r, attack: 0.003 });
          this.noise(0.05, { vol: 0.06, type: 'bandpass', f0: 2400, q: 2 });
          this.tone(cn * r, 0.18, { type: 'triangle', vol: 0.1, at: 0.05 }); break;
        case 'dip': this.tone(cn * 0.4, 0.1, { type: 'sine', vol: 0.16, slideTo: cn * 0.7, attack: 0.004 }); this.noise(0.08, { vol: 0.05, type: 'lowpass', f0: 900, q: 0.8 }); break;
        case 'whoosh': this.noise(0.22, { vol: 0.09, f0: 500, f1: 2200, q: 0.9 }); break;            // the brush flies
        case 'splotch': {   // wet paint lands: a low soft thump + squelchy band noise + a rising shimmer while the colour spreads
          this.tone(150 * r, 0.14, { type: 'sine', vol: 0.3, slideTo: 80 });
          this.noise(0.16, { vol: 0.16, type: 'bandpass', f0: 700, f1: 260, q: 1.6 });
          const T = opt.fill || 0.7;
          [0, 4, 7, 12].forEach((n, i) => this.tone(cn * Math.pow(2, n / 12), 0.28, { type: 'sine', vol: 0.07, at: 0.05 + i * T / 5, attack: 0.02 }));
          this.tone(cn * 2, T, { type: 'sine', vol: 0.03, at: 0.05, slideTo: cn * 4, attack: 0.1 });
          break;
        }
        case 'filled': this.tone(cn * 2, 0.25, { type: 'sine', vol: 0.08 }); this.tone(cn * 3, 0.2, { type: 'sine', vol: 0.04, at: 0.04 }); break;
        case 'count': { const k = Math.min(opt.i || 1, 12); const f = NOTE(SCALE_C[k] + 72); this.mallet(f, 0.4, { vol: 0.26 }); this.tone(f * 2, 0.25, { vol: 0.08, at: 0.03 }); break; }
        case 'stepDone': [0, 4, 7].forEach((n, i) => this.mallet(NOTE(79 + n), 0.3, { vol: 0.17, at: i * 0.07 })); break;
        case 'boing': this.tone(180 * r, 0.42, { type: 'triangle', vol: 0.24, slideTo: 520 * r }); this.tone(360 * r, 0.3, { type: 'sine', vol: 0.08, at: 0.05, slideTo: 260 * r }); break;
        case 'soft': this.tone(500 * r, 0.16, { vol: 0.1, slideTo: 380 * r }); break;                 // notThis / needPaint / already
        case 'wobble': for (let i = 0; i < 3; i++) this.tone(300 + i * 40, 0.08, { type: 'triangle', vol: 0.08, at: i * 0.07 }); break;
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.1, at: i * 0.07 })); break;
        case 'sweep': this.tone(NOTE(76 + (opt.i || 0) * 2), 0.18, { type: 'sine', vol: 0.12, slideTo: NOTE(79 + (opt.i || 0) * 2) }); break;   // one note per part: a glissando
        case 'finish': [0, 2, 4, 7, 9, 12, 14, 16].forEach((n, i) => this.mallet(NOTE(72 + n), 0.22, { vol: 0.1, at: i * 0.05 })); break;
        case 'alive':   // the picture comes alive: a swish + a burst of bubbles
          this.noise(0.5, { vol: 0.13, type: 'bandpass', f0: 400, f1: 2600, q: 0.7, attack: 0.08 });
          for (let i = 0; i < 6; i++) this.bubble(0.15 + i * 0.09, 0.12);
          [0, 4, 7, 12].forEach((n, i) => this.mallet(NOTE(76 + n), 0.3, { vol: 0.14, at: 0.1 + i * 0.08 }));
          break;
        case 'bubbles': for (let i = 0; i < (opt.n || 3); i++) this.bubble(i * 0.07, 0.1); break;
        case 'hop': this.tone(330 * r, 0.12, { vol: 0.12, slideTo: 620 * r, type: 'triangle' }); break;   // crab scuttle hop
        case 'giggle': for (let i = 0; i < 4; i++) this.tone(NOTE(86 - i) * r, 0.08, { type: 'triangle', vol: 0.15, at: 0.03 + i * 0.1, slideTo: NOTE(90 - i) * r }); for (let i = 0; i < 3; i++) this.bubble(0.45 + i * 0.06, 0.08); break;
        case 'fishy': this.bubble(0, 0.1); this.bubble(0.12, 0.08); break;
        case 'creak': this.tone(120, 0.35, { type: 'sawtooth', vol: 0.05, slideTo: 210 }); this.noise(0.3, { vol: 0.05, type: 'bandpass', f0: 900, f1: 1500, q: 4 }); break;
        case 'chime': [0, 4, 7, 11, 14, 19].forEach((n, i) => this.tone(NOTE(84 + n), 0.4, { type: 'sine', vol: 0.11, at: 0.25 + i * 0.05 })); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.22 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.09, at: 0.03 }); break;
        case 'level': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.mallet(NOTE(67 + n), 0.45, { vol: 0.2, at: i * 0.08 })); break;
        case 'fanfare':
          [[0, 0], [4, .14], [7, .28], [12, .42], [7, .62], [12, .76], [16, .9]].forEach(([n, t]) => {
            this.mallet(NOTE(72 + n), 0.5, { vol: 0.2, at: t }); this.tone(NOTE(60 + n), 0.4, { type: 'triangle', vol: 0.14, at: t });
          });
          for (let i = 0; i < 8; i++) this.bubble(1.2 + i * 0.08, 0.1);
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
      if (s === 0 || s === 4) this.tone(NOTE(m.root - 12 + chord[0]), eighth * 3, { vol: 0.26, at, dest: D, attack: 0.01 });   // soft bass
      if (s === 2 || s === 6) chord.forEach(n => this.tone(NOTE(m.root + n), eighth * 1.4, { vol: 0.05, at, dest: D, attack: 0.008 }));
      const deg = this._phrase[step];
      if (deg != null) {
        const f = NOTE(m.root + 12 + SCALE[deg]);
        if (m.lead === 'box') { this.tone(f * 2, eighth * 2.4, { type: 'sine', vol: 0.08, at, dest: D, attack: 0.003 }); this.tone(f * 4.02, eighth, { type: 'sine', vol: 0.018, at, dest: D, attack: 0.003 }); }
        else this.mallet(f, eighth * 1.8, { vol: 0.12, at, dest: D });
      }
    }
  };
  SP.Audio = A;
})(window.SP = window.SP || {});
