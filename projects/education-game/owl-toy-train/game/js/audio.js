/* TT.Audio (Momo's Toy Train) — every sound is synthesized with WebAudio (no files to license or download).
 * Wooden clonks (pitched per car), a friendly boing, count chimes, the train: chug pulses whose rate follows the speed
 * (setChug), coupling clacks, rail clicks, steam hiss and Momo's two-tone TOOT whistle; toy-animal voices, a bunny
 * giggle, a balloon squeak, a toy-piano / music-box loop per time of day (ducked while Momo speaks).
 * iOS: call unlock() inside the first touchend/click. */
(function (TT) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  const MUSIC = [
    { root: 60, tempo: 100, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: 'triangle' },   // morning: C major toy piano
    { root: 62, tempo: 112, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], lead: 'triangle' },  // noon: D major, bright
    { root: 65, tempo: 90, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'sine' },        // sunset: F major, warm
    { root: 67, tempo: 74, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], lead: 'box' }         // night: G music box
  ];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const SCALE_C = [0, 0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

  const A = {
    ctx: null, master: null, user: null, sfx: null, music: null, amb: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, ducked: false, volume: 1,
    mood: 0, rainLevel: 0.6, snowLevel: 0, songOn: false, _timer: null, _next: 0, _step: 0, _phrase: null, _playing: false, _rain: null, _lastPlay: {},

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      // chain: sfx/music/amb → master (mute) → compressor → user volume × 1.6 makeup → speakers (phones are quiet)
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
      try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) {}
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
      const low = this.ducked || this.songOn;      // under speech and while the band plays the child's song
      const mv = this.musicOn && this._playing ? (low ? (this.songOn ? 0.03 : 0.07) : 0.22) : 0;
      this.music.gain.setTargetAtTime(mv, t, low ? 0.08 : 0.5);
      // the amb bus carries the train's chug / rail clicks (scheduled by setChug), a little lower under speech
      this.amb.gain.setTargetAtTime(this.sfxOn ? (this.ducked ? 0.55 : 1) : 0, t, 0.1);
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
    setSong(on) { if (this.songOn !== !!on) { this.songOn = !!on; this.apply(); } },
    setWeatherLevels() { /* no weather bed in the toy room */ },
    /* the train's chug: |v| px/s → noise pulses ("ch-ch") with a soft low thump; call every frame with the train speed */
    setChug(v, dt) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      v = Math.abs(+v || 0);
      if (v < 30) { this._chugT = 0; return; }
      const rate = Math.min(9, 1.2 + v / 110);          // pulses per second
      this._chugT = (this._chugT || 0) - (dt || 0.016);
      if (this._chugT > 0) return;
      this._chugT = 1 / rate;
      const k = (this._chugN = ((this._chugN || 0) + 1) % 4), loud = Math.min(1, 0.4 + v / 900);
      this.noise(0.11, { vol: (k === 0 ? 0.2 : 0.13) * loud, type: 'bandpass', f0: 1800, f1: 900, q: 0.7, dest: this.amb });
      this.tone(k % 2 ? 92 : 78, 0.09, { type: 'sine', vol: 0.12 * loud, slideTo: 60, dest: this.amb });
    },
    /* Momo's whistle: two-tone chord (a 3rd apart) with breathy noise; short = one toot */
    whistle(at = 0, n = 2) {
      for (let i = 0; i < n; i++) {
        const t0 = at + i * 0.42, d = i === n - 1 ? 0.5 : 0.3;
        [NOTE(79), NOTE(83), NOTE(86)].forEach((f, j) => this.tone(f, d, { type: j ? 'sine' : 'triangle', vol: j ? 0.1 : 0.2, at: t0, attack: 0.03 }));
        this.noise(d, { vol: 0.07, type: 'bandpass', f0: 2600, q: 1.4, at: t0 });
      }
    },
    animal(a, at = 0) {   // friendly synthesized toy-animal voices (never scary)
      const t = (f, d, o) => this.tone(f, d, Object.assign({ at }, o));
      const nz = (d, o) => this.noise(d, Object.assign({ at }, o));
      switch (a) {
        case 'duck': [0, 0.2].forEach(k => { t(520, 0.16, { type: 'sawtooth', vol: 0.12, at: at + k, slideTo: 380 }); t(1040, 0.14, { type: 'square', vol: 0.03, at: at + k, slideTo: 760 }); }); break;
        case 'cow': t(150, 0.9, { type: 'sawtooth', vol: 0.11, slideTo: 115 }); t(300, 0.9, { type: 'triangle', vol: 0.12, slideTo: 230 }); break;
        case 'sheep': for (let k = 0; k < 6; k++) t(470 + (k % 2) * 30, 0.1, { type: 'sawtooth', vol: 0.08, at: at + k * 0.08 }); t(470, 0.5, { type: 'triangle', vol: 0.14 }); break;
        case 'pig': [0, 0.22].forEach(k => { t(240, 0.16, { type: 'sawtooth', vol: 0.1, at: at + k, slideTo: 200 }); nz(0.14, { vol: 0.07, at: at + k, type: 'lowpass', f0: 600, q: 0.7 }); }); break;
        case 'frog': [0, 0.18].forEach(k => { t(180, 0.14, { type: 'square', vol: 0.07, at: at + k, slideTo: 260 }); t(360, 0.12, { type: 'triangle', vol: 0.1, at: at + k, slideTo: 300 }); }); break;
        case 'fish': [0, 0.12, 0.22].forEach((k, i) => t(500 + i * 160, 0.08, { type: 'sine', vol: 0.15, at: at + k, slideTo: 900 + i * 200 })); break;
        case 'bird': [0, 0.14, 0.3].forEach(k => t(2600, 0.1, { type: 'sine', vol: 0.15, at: at + k, slideTo: 3600 })); break;
        case 'squirrel': for (let k = 0; k < 5; k++) t(1800 + (k % 2) * 300, 0.05, { type: 'triangle', vol: 0.1, at: at + k * 0.07 }); break;
        case 'butterfly': [0, 4, 7, 12, 16].forEach((n, i) => t(NOTE(86 + n), 0.12, { type: 'sine', vol: 0.1, at: at + i * 0.04 })); break;
        case 'bunny': for (let k = 0; k < 3; k++) nz(0.05, { vol: 0.12, type: 'highpass', f0: 3500, at: at + k * 0.09 }); t(900, 0.08, { type: 'sine', vol: 0.08, at: at + 0.3, slideTo: 1200 }); break;
        case 'mouse': [0, 0.13].forEach(k => t(2400, 0.09, { type: 'sine', vol: 0.12, at: at + k, slideTo: 3000 })); break;
        case 'fox': [0, 0.2].forEach(k => t(700, 0.12, { type: 'triangle', vol: 0.14, at: at + k, slideTo: 1100 })); break;
        default: t(660, 0.2, { type: 'triangle', vol: 0.15, slideTo: 880 });
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
      const gap = { pop: 0.05, clack: 0.05, rail: 0.04, puff: 0.08 }[name];
      if (gap && now - (this._lastPlay[name] || 0) < gap) return;   // staggered pops, not a buzz
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      switch (name) {
        case 'pop': this.tone(520 * r, 0.09, { vol: 0.14, slideTo: 880 * r }); break;               // cargo pops onto the rug
        case 'grab': this.tone(NOTE(76) * r, 0.08, { type: 'triangle', vol: 0.22, slideTo: NOTE(83) * r }); break;
        case 'whoosh': this.noise(0.3, { vol: 0.12, f0: 600, f1: 2200, q: 0.8 }); break;
        case 'clonk': {   // wooden toy lands in a car: hollow knock, pitch per car (and climbing with the count)
          const k = (opt.car || 0) * 3 + Math.min(opt.i || 0, 8); const f = NOTE(62 + k) * r;
          this.tone(f, 0.16, { type: 'triangle', vol: 0.32, slideTo: f * 0.8 }); this.tone(f * 2.76, 0.07, { type: 'sine', vol: 0.1 });
          this.noise(0.05, { vol: 0.14, f0: 900, q: 1.5 }); break;
        }
        case 'boing': this.tone(180 * r, 0.42, { type: 'triangle', vol: 0.24, slideTo: 520 * r }); this.tone(360 * r, 0.3, { type: 'sine', vol: 0.08, at: 0.05, slideTo: 260 * r }); break;
        case 'miss': this.tone(500 * r, 0.25, { vol: 0.11, slideTo: 300 * r }); break;
        case 'tap': this.tone(NOTE(84) * r, 0.1, { type: 'triangle', vol: 0.12 }); break;
        case 'full': [0, 0.12].forEach(k => this.tone(NOTE(74) * r, 0.07, { type: 'triangle', vol: 0.2, at: k, slideTo: NOTE(71) })); break;  // tok-tok
        case 'count': { const k = Math.min(opt.i || 1, 10); this.tone(NOTE(SCALE_C[k % SCALE_C.length] + 72), 0.3, { type: 'triangle', vol: 0.24 }); this.tone(NOTE(SCALE_C[k % SCALE_C.length] + 84), 0.22, { vol: 0.1, at: 0.03 }); break; }
        case 'carDone': [0, 4, 7].forEach((n, i) => this.tone(NOTE(79 + n), 0.22, { type: 'triangle', vol: 0.2, at: i * 0.07 })); break;
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.1, at: i * 0.07 })); break;
        case 'loaded': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(72 + n), 0.3, { type: 'triangle', vol: 0.22, at: i * 0.09 })); break;
        case 'whistle': this.whistle(0, 2); this.noise(0.8, { vol: 0.1, type: 'highpass', f0: 3000, at: 0.05 }); break;   // TOOT TOOT + steam
        case 'toot': this.whistle(0, 1); break;
        case 'hiss': this.noise(0.6, { vol: 0.1, type: 'highpass', f0: 3200, f1: 5000 }); break;
        case 'puff': this.noise(0.12, { vol: 0.05, type: 'bandpass', f0: 1400, q: 0.8 }); break;
        case 'clack': { const v = opt.hard ? 0.24 : 0.14; this.tone(NOTE(70 + (opt.i || 0)) * r, 0.05, { type: 'square', vol: v * 0.3 }); this.noise(0.04, { vol: v, f0: 2000, q: 2 }); break; }
        case 'rail': this.noise(0.03, { vol: 0.1, f0: 3200, q: 2.5 }); this.noise(0.03, { vol: 0.08, f0: 2800, q: 2.5, at: 0.07 }); break;
        case 'brake': this.noise(0.6, { vol: 0.07, type: 'bandpass', f0: 4200, f1: 2600, q: 3 }); break;
        case 'animal': this.animal(opt.animal); break;
        case 'giggle': for (let i = 0; i < 4; i++) this.tone(NOTE(84 - i) * r, 0.08, { type: 'triangle', vol: 0.16, at: 0.03 + i * 0.1, slideTo: NOTE(88 - i) * r }); break;
        case 'hop': this.tone(330 * r, 0.16, { vol: 0.13, slideTo: 620 * r, type: 'triangle' }); break;
        case 'squeak': this.tone(900 * r, 0.18, { type: 'sine', vol: 0.14, slideTo: 1400 * r }); this.tone(1300 * r, 0.14, { type: 'sine', vol: 0.08, at: 0.16, slideTo: 1000 * r }); break;
        case 'sparkle': [0, 4, 7, 11, 14, 19].forEach((n, i) => this.tone(NOTE(84 + n), 0.22, { type: 'triangle', vol: 0.14, at: i * 0.05 })); break;
        case 'bye': this.tone(NOTE(84) * r, 0.18, { type: 'sine', vol: 0.1, slideTo: NOTE(91) }); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.23 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.09, at: 0.03 }); break;
        case 'level': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(NOTE(67 + n), 0.45, { type: 'triangle', vol: 0.22, at: i * 0.08 })); break;
        case 'fanfare':
          [[0, 0], [4, .14], [7, .28], [12, .42], [7, .62], [12, .76], [16, .9]].forEach(([n, t]) => {
            this.tone(NOTE(72 + n), 0.4, { type: 'square', vol: 0.09, at: t }); this.tone(NOTE(60 + n), 0.4, { type: 'triangle', vol: 0.18, at: t });
          });
          this.whistle(1.2, 2);
          break;
        case 'chapter': [0, 7, 12].forEach((n, i) => this.tone(NOTE(79 + n), 0.8, { vol: 0.14, at: i * 0.12 })); break;
        case 'click': this.tone(900, 0.05, { vol: 0.14, slideTo: 1300 }); break;
        case 'boop': this.tone(300 * r, 0.12, { type: 'sine', vol: 0.12, slideTo: 240 * r }); break;
        case 'talkRight': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.3, { type: 'triangle', vol: 0.23, at: i * 0.08 })); break;
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
    startMusic() {
      if (!this.ensure()) return;
      if (!this._phrase) this._phrase = this._makePhrase(this.mood);
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
      if (deg != null) {
        const f = NOTE(m.root + 12 + SCALE[deg]);
        if (m.lead === 'box') { this.tone(f * 2, eighth * 2.4, { type: 'sine', vol: 0.09, at, dest: this.music, attack: 0.003 }); this.tone(f * 4.02, eighth, { type: 'sine', vol: 0.02, at, dest: this.music, attack: 0.003 }); }
        else { this.tone(f, eighth * 1.6, { type: m.lead, vol: 0.11, at, dest: this.music, attack: 0.004 }); this.tone(f * 3, eighth * 0.6, { type: 'sine', vol: 0.015, at, dest: this.music, attack: 0.003 }); }   // toy-piano ping
      }
    }
  };
  TT.Audio = A;
})(window.TT = window.TT || {});
