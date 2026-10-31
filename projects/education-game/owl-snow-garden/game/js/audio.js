/* SG.Audio — every sound is synthesized with WebAudio (no files to license or download).
 * Soft toddler-friendly SFX, a gentle generative music loop per weather, night wind ambience,
 * and ducking while Pip speaks. iOS: call unlock() inside the first touchend/click. */
(function (SG) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  const MUSIC = [
    { root: 60, tempo: 96, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: 'triangle' },    // morning: C major, waking up
    { root: 62, tempo: 108, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], lead: 'triangle' },  // noon: D major, bright
    { root: 65, tempo: 88, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'sine' },        // sunset: F major, warm
    { root: 67, tempo: 76, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], lead: 'sine' }        // starry night: G music box
  ];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  const A = {
    ctx: null, master: null, sfx: null, music: null, amb: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, ducked: false,
    mood: 0, _timer: null, _next: 0, _step: 0, _phrase: null, _playing: false, _rain: null, _lastPlay: {},

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.6; this.sfx.connect(this.master);
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
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.6 : 0, t, 0.03);
      const mv = this.musicOn && this._playing ? (this.ducked ? 0.05 : 0.15) : 0;
      this.music.gain.setTargetAtTime(mv, t, this.ducked ? 0.08 : 0.5);
      const av = this.sfxOn && this._playing && this.mood === 3 ? (this.ducked ? 0.02 : 0.05) : 0;   // soft night wind
      this.amb.gain.setTargetAtTime(av, t, 0.8);
    },
    setOptions({ sfx, music, muted }) {
      if (sfx !== undefined) this.sfxOn = sfx;
      if (music !== undefined) this.musicOn = music;
      if (muted !== undefined) this.muted = muted;
      this.apply();
    },
    duck(on) { if (this.ducked !== !!on) { this.ducked = !!on; this.apply(); } },

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
    noise(dur, { vol = 0.2, at = 0, type = 'bandpass', f0 = 1200, f1 = null, q = 1.2, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },

    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      if (name === 'appear' && now - (this._lastPlay.appear || 0) < 0.06) return; // stagger pops, not a buzz
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      switch (name) {
        case 'appear': this.tone(520 * r, 0.09, { vol: 0.07, slideTo: 880 * r }); break;
        case 'grab':
          this.tone(NOTE(76) * r, 0.08, { type: 'triangle', vol: 0.12, slideTo: NOTE(83) * r });
          break;
        case 'whoosh': this.noise(0.22, { vol: 0.06, f0: 500, f1: 1800, q: 0.8 }); break;
        case 'land':     // soft plop into the soil
          this.tone(240 * r, 0.14, { type: 'sine', vol: 0.16, slideTo: 120 * r });
          this.noise(0.1, { vol: 0.04, f0: 300, f1: 900, q: 0.7 });
          break;
        case 'bloom': {  // sprout "bloop" up + bell chime; count rounds climb the scale with the count
          const n = opt.count ? SCALE[Math.min(SCALE.length - 1, opt.count - 1)] : 7;
          this.tone(300 * r, 0.16, { type: 'sine', vol: 0.12, slideTo: 720 * r });
          this.tone(NOTE(72 + n), 0.4, { type: 'triangle', vol: 0.15, at: 0.06 });
          this.tone(NOTE(84 + n), 0.35, { type: 'sine', vol: 0.06, at: 0.1 });
          break;
        }
        case 'wrong':    // soft "boop-boop", never a buzzer
          this.tone(392, 0.12, { vol: 0.1 });
          this.tone(330, 0.18, { vol: 0.1, at: 0.13 });
          break;
        case 'miss': this.tone(500 * r, 0.25, { vol: 0.06, slideTo: 300 * r }); break;
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.05, at: i * 0.07 })); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.13 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.05, at: 0.03 }); break;
        case 'round': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(72 + n), 0.3, { type: 'triangle', vol: 0.12, at: i * 0.09 })); break;
        case 'level': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(NOTE(67 + n), 0.45, { type: 'triangle', vol: 0.12, at: i * 0.08 })); break;
        case 'fanfare':
          [[0, 0], [4, .14], [7, .28], [12, .42], [7, .62], [12, .76], [16, .9]].forEach(([n, t]) => {
            this.tone(NOTE(72 + n), 0.4, { type: 'square', vol: 0.05, at: t }); this.tone(NOTE(60 + n), 0.4, { type: 'triangle', vol: 0.1, at: t });
          });
          break;
        case 'chapter': [0, 7, 12].forEach((n, i) => this.tone(NOTE(79 + n), 0.8, { vol: 0.08, at: i * 0.12 })); break;
        case 'pop':      // bubble pop: a tiny bright blip + airy burst
          this.tone(1400 * r, 0.05, { vol: 0.07, slideTo: 2200 * r }); this.noise(0.08, { vol: 0.05, f0: 2500, f1: 5000, q: 1.2 }); break;
        case 'bounce': this.tone(260 * r, 0.18, { vol: 0.07, slideTo: 420 * r }); break;
        case 'hop': this.tone(330 * r, 0.16, { vol: 0.07, slideTo: 620 * r, type: 'triangle' }); break;
        case 'click': this.tone(900, 0.05, { vol: 0.08, slideTo: 1300 }); break;
        case 'talkRight': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.3, { type: 'triangle', vol: 0.13, at: i * 0.08 })); break;
        case 'listen': this.tone(NOTE(81), 0.12, { vol: 0.1 }); this.tone(NOTE(88), 0.12, { vol: 0.1, at: 0.1 }); break;
      }
    },

    setMood(i) {
      i = ((i % 4) + 4) % 4;
      if (i === this.mood && this._phrase) return;
      this.mood = i;
      this._phrase = this._makePhrase(i);
      this._ensureRain();
      this.apply();
    },
    _makePhrase(i) {
      let seed = 4242 + i * 811;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const notes = []; let deg = 4;
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 8; s++) {
        const rest = (s % 2 === 1 && rnd() < 0.5) || (bar === 3 && s >= 5);
        deg = Math.max(1, Math.min(8, deg + Math.round((rnd() - 0.5) * 3)));
        notes.push(rest ? null : deg);
      }
      return notes;
    },
    _ensureRain() {
      if (!this.ctx || this._rain) return;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 300;
      s.connect(f); f.connect(f2); f2.connect(this.amb); s.start();
      this._rain = s;
    },
    startMusic() {
      if (!this.ensure()) return;
      if (!this._phrase) this._phrase = this._makePhrase(this.mood);
      this._ensureRain();
      this._playing = true;
      if (!this._timer) { this._next = this.ctx.currentTime + 0.15; this._step = 0; this._timer = setInterval(() => this._schedule(), 40); }
      this.apply();
    },
    stopMusic() {
      this._playing = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.apply();
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
      const at = Math.max(0, t - this.ctx.currentTime);
      if (s === 0 || s === 4) this.tone(NOTE(m.root - 12 + chord[0]), eighth * 3, { vol: 0.3, at, dest: this.music, attack: 0.01 });
      if (s === 2 || s === 6) chord.forEach(n => this.tone(NOTE(m.root + n), eighth * 1.6, { vol: 0.06, at, dest: this.music, attack: 0.01 }));
      const deg = this._phrase[step];
      if (deg != null) this.tone(NOTE(m.root + 12 + SCALE[deg]), eighth * 1.8, { type: m.lead, vol: 0.11, at, dest: this.music, attack: 0.01 });
    }
  };
  SG.Audio = A;
})(window.SG = window.SG || {});
