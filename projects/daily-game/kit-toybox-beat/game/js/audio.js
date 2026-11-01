/* KB.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * A toy-band backing track is scheduled from the WORLD's beat grid (syncTo), so the music, the coins and the judging
 * share one clock. When the context runs, main.js uses A.clock() (the audio clock) as the master clock.
 * Every catch plays its coin's pitch on a music-box voice in the level's key, so the player "plays" the melody. */
(function (KB) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

  // per time of day: key root (MIDI), 1-bar chord progression (semitones), a pentatonic melody scale, instrument colours
  const LEVEL_MUSIC = [
    // Dawn: gentle F major, music box + soft kick
    { root: 65, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'sine', pad: 'sine', drums: 'soft', hat: 0.018, bell: true },
    // Noon: bright C major toy piano, full little drum kit
    { root: 60, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], lead: 'triangle', pad: 'triangle', drums: 'full', hat: 0.03, bell: false },
    // Sunset: warm G mixolydian shuffle
    { root: 67, prog: [[0, 4, 7], [-2, 2, 5], [5, 9, 12], [0, 4, 7]], lead: 'triangle', pad: 'sine', drums: 'shuffle', hat: 0.026, bell: false },
    // Night: calm D major lullaby, brushed
    { root: 62, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [7, 11, 14]], lead: 'sine', pad: 'sine', drums: 'brush', hat: 0.014, bell: true }
  ];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];   // coin pitch 0..7 → major pentatonic over ~1.5 octaves (always sounds nice)

  const A = {
    ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false,
    tod: 0, lap: 0, _musicPlaying: false, _next: null, _lastSong: 0,

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
      } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master);
      // white noise buffer for whooshes / munches
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyMute();
      return true;
    },
    /* Call inside a user gesture. iOS Safari only starts audio from a gesture: resume the context AND start one
     * silent sample in the same touchend/click (also wakes it after an interruption, e.g. a phone call). */
    unlock() {
      if (!this.ensure()) return;
      const c = this.ctx;
      if (c.state !== 'running' && !this._hidden) c.resume().catch(() => {});
      if (!this._silentDone || c.state !== 'running') {
        try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); this._silentDone = true; } catch (e) {}
      }
    },
    /* Page hidden (home button, app switch, lock): stop the audio clock so nothing plays in the background. */
    suspend() { this._hidden = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
    resume() { this._hidden = false; if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
    applyMute() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.55 : 0, t, 0.03);
      this.music.gain.setTargetAtTime(this.musicOn && this._musicPlaying ? 0.34 : 0, t, 0.15);
    },
    setOptions({ sfx, music, muted }) {
      if (sfx !== undefined) this.sfxOn = sfx;
      if (music !== undefined) this.musicOn = music;
      if (muted !== undefined) this.muted = muted;
      this.applyMute();
    },

    // ---------- primitives ----------
    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.005, dest = null, detune = 0 } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, { vol = 0.2, at = 0, type = 'bandpass', f0 = 1200, f1 = null, q = 1.2 } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.sfx);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    },

    // ---------- sound effects ----------
    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const r = 1 + (Math.random() - 0.5) * 0.06;
      const m = LEVEL_MUSIC[this.tod];
      switch (name) {
        case 'hit': {            // the coin's melody note on a music-box voice (perfect = brighter, with an octave sparkle)
          const n = m.root + 12 + SCALE[(opt.pitch || 0) % SCALE.length];
          this.tone(NOTE(n), 0.32, { type: 'triangle', vol: opt.judge === 'perfect' ? 0.2 : 0.15 });
          this.tone(NOTE(n + 12), 0.18, { type: 'sine', vol: opt.judge === 'perfect' ? 0.08 : 0.04, at: 0.005 });
          if (opt.gold) [4, 7, 12].forEach((d, i) => this.tone(NOTE(n + d), 0.24, { type: 'sine', vol: 0.07, at: 0.06 + i * 0.045 }));
          this.tone(2400 * r, 0.05, { type: 'sine', vol: 0.03 });   // tiny coin "ting"
          break;
        }
        case 'miss':             // soft muted "bonk", never harsh
          this.tone(220 * r, 0.16, { type: 'sine', vol: 0.12, slideTo: 150 });
          this.noise(0.06, { vol: 0.03, type: 'lowpass', f0: 500, q: 0.6 });
          break;
        case 'empty': this.tone(700 * r, 0.04, { type: 'sine', vol: 0.025 }); break;
        case 'boing':            // pillow bopped back
          this.tone(260, 0.34, { type: 'sine', vol: 0.18, slideTo: 620 });
          this.tone(390, 0.22, { type: 'triangle', vol: 0.06, slideTo: 900, at: 0.04 });
          break;
        case 'oof': this.tone(NOTE(62), 0.12, { type: 'square', vol: 0.035, slideTo: NOTE(55) }); this.tone(NOTE(58), 0.18, { type: 'square', vol: 0.035, at: 0.12, slideTo: NOTE(50) }); break;
        case 'fwump':            // pillow poofs on Kit
          this.noise(0.3, { vol: 0.12, type: 'lowpass', f0: 600, f1: 180, q: 0.4 });
          this.tone(160, 0.25, { type: 'sine', vol: 0.1, slideTo: 90 });
          break;
        case 'throw': this.noise(0.28, { vol: 0.06, f0: 500, f1: 1600, q: 0.6 }); break;
        case 'bossin':           // Baron Fluff's grumpy little "hmph" on a kazoo-ish square
          this.tone(NOTE(67), 0.14, { type: 'square', vol: 0.045, slideTo: NOTE(64) });
          this.tone(NOTE(62), 0.2, { type: 'square', vol: 0.045, at: 0.16, slideTo: NOTE(57) });
          break;
        case 'bossout': this.tone(NOTE(70), 0.3, { type: 'sine', vol: 0.05, slideTo: NOTE(82) }); break;
        case 'multup': [0, 4, 7, 12].forEach((d, i) => this.tone(NOTE(m.root + 12 + d), 0.14, { type: 'square', vol: 0.035, at: i * 0.05 })); break;
        case 'combobreak': this.tone(NOTE(m.root + 7), 0.22, { type: 'triangle', vol: 0.06, slideTo: NOTE(m.root) }); break;
        case 'groovelow': [0, 1].forEach(i => this.tone(NOTE(81), 0.08, { type: 'sine', vol: 0.05, at: i * 0.14 })); break;
        case 'songdone': [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => this.tone(NOTE(m.root + d), 0.3, { type: 'triangle', vol: 0.12, at: i * 0.06 })); break;
        case 'cleared': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(m.root + 12 + n), 0.6, { type: 'sine', vol: 0.09, at: 0.5 + i * 0.1 })); break;
        case 'level': [0, 7, 12].forEach((n, i) => this.tone(NOTE(m.root + 12 + n), 0.7, { type: 'sine', vol: 0.06, at: i * 0.12 })); break;
        case 'dead':             // the rocket sputters out: a gentle descending wobble
          this.tone(440, 0.6, { type: 'triangle', vol: 0.15, slideTo: 130 });
          [67, 64, 60].forEach((n, i) => this.tone(NOTE(n), 0.3, { type: 'triangle', vol: 0.1, at: 0.65 + i * 0.18 }));
          break;
        case 'start': this.tone(NOTE(72), 0.12, { type: 'triangle', vol: 0.12 }); this.tone(NOTE(79), 0.2, { type: 'triangle', vol: 0.12, at: 0.08 }); break;
        case 'best': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.35, { type: 'square', vol: 0.05, at: 0.6 + i * 0.1 })); break;
        case 'click': this.tone(900, 0.05, { type: 'sine', vol: 0.08, slideTo: 1300 }); break;
      }
    },

    // ---------- clock ----------
    /* Audio clock in seconds while the context is running (the master clock for main.js), else null. */
    clock() { const c = this.ctx; return c && c.state === 'running' && !this._hidden ? c.currentTime : null; },

    // ---------- music: a toy band locked to the world's beat grid ----------
    setLevel(tod, lap) { this.tod = ((tod % 4) + 4) % 4; this.lap = lap || 0; },
    setSeason(i) { this.setLevel(i, this.lap); },   // alias
    startMusic() { if (!this.ensure()) return; this._musicPlaying = true; this._next = null; this.applyMute(); },
    stopMusic() { this._musicPlaying = false; this._next = null; this.applyMute(); },
    /* Called every frame with the world. Schedules every eighth-note step whose song time falls within the next 0.15 s.
     * The count-in clicks are scheduled even when music is off (they are part of the gameplay), the band only with music on.
     * rate = game speed (music only plays at 1×). */
    syncTo(w, rate) {
      const c = this.ctx; if (!c || c.state !== 'running' || this.muted || !w || !w.beatLen) { this._next = null; return; }
      if (rate !== 1 || (w.state !== 'ready' && w.state !== 'playing')) { this._next = null; return; }
      const half = w.beatLen / 2, now = w.songTime;
      if (this._lastSong != null && now < this._lastSong - 0.5) this._next = null;   // new level / restart: song time jumped back
      this._lastSong = now;
      if (this._next == null) this._next = Math.ceil((now + 0.02) / half);       // first step strictly in the future
      const horizon = now + 0.15;
      let guard = 0;
      while (this._next * half <= horizon && guard++ < 16) {
        const st = this._next, t = st * half, at = Math.max(0, t - now);
        if (t < (w.songLen || 1e9) + w.beatLen * 0.5) this._step(st, at, w);
        this._next++;
      }
    },
    _step(st, at, w) {
      const m = LEVEL_MUSIC[this.tod], half = w.beatLen / 2;
      if (st < 0) {                // count-in: woodblock click on each beat (higher on the first)
        if (st % 2 === 0 && this.sfxOn) { const hi = st === -8; this.tone(hi ? 1500 : 1100, 0.05, { type: 'sine', vol: 0.12, at }); this.noise(0.03, { vol: 0.05, f0: hi ? 3000 : 2400, q: 3, at }); }
        return;
      }
      if (st === 0 && this.sfxOn) [0, 7, 12].forEach((d, i) => this.tone(NOTE(m.root + 12 + d), 0.4, { type: 'sine', vol: 0.06, at: at + i * 0.03 }));   // "go" chime
      if (!this.musicOn || !this._musicPlaying) return;
      const step = ((st % 8) + 8) % 8, bar = Math.floor(st / 8), chord = m.prog[((bar % 4) + 4) % 4];
      const D = this.music, o = (type, vol, extra) => Object.assign({ type, vol, at, dest: D, attack: 0.008 }, extra || {});
      const shuffleAt = m.drums === 'shuffle' && step % 2 === 1 ? half * 0.16 : 0;
      // drums
      const kick = () => { this.tone(120, 0.18, o('sine', 0.55, { slideTo: 45 })); };
      const snare = v => this._noiseTo(0.12, { vol: v, f0: 1800, q: 0.7, at });
      const hat = v => this._noiseTo(0.035, { vol: v, type: 'highpass', f0: 6500, q: 0.7, at: at + shuffleAt });
      if (m.drums === 'full') { if (step === 0 || step === 4 || step === 5) kick(); if (step === 2 || step === 6) snare(0.18); hat(m.hat * (step % 2 ? 0.7 : 1)); }
      else if (m.drums === 'shuffle') { if (step === 0 || step === 4) kick(); if (step === 2 || step === 6) snare(0.14); hat(m.hat); }
      else if (m.drums === 'soft') { if (step === 0) kick(); if (step === 4) this.tone(900, 0.04, o('sine', 0.05)); if (step % 2 === 0) hat(m.hat); }
      else { if (step === 0) kick(); if (step === 4) this._noiseTo(0.2, { vol: 0.05, f0: 2500, q: 0.4, at }); if (step % 2 === 1) hat(m.hat); }
      // bass: root on 1, fifth on 3, a pickup on the last eighth
      if (step === 0) this.tone(NOTE(m.root - 24 + chord[0]), half * 3, o('triangle', 0.3));
      if (step === 4) this.tone(NOTE(m.root - 24 + chord[0] + 7), half * 2.5, o('triangle', 0.24));
      if (step === 7 && m.drums !== 'brush') this.tone(NOTE(m.root - 24 + chord[0] + 5), half * 0.9, o('triangle', 0.18));
      // chord pad: bar start, held for the bar
      if (step === 0) chord.forEach(n => this.tone(NOTE(m.root + n), half * 7.5, o(m.pad, 0.045, { attack: 0.12 })));
      // off-beat toy-piano chord stabs (noon / sunset) or a music-box bell arpeggio (dawn / night)
      if (!m.bell && (step === 3 || step === 7)) chord.forEach(n => this.tone(NOTE(m.root + 12 + n), half * 0.5, o('triangle', 0.02)));
      if (m.bell && step % 2 === 1) this.tone(NOTE(m.root + 24 + chord[(step >> 1) % 3]), half * 1.6, o('sine', 0.025));
    },
    _noiseTo(dur, opt) { const sfx = this.sfx; this.sfx = this.music; this.noise(dur, opt); this.sfx = sfx; }
  };
  KB.Audio = A;
})(window.KB = window.KB || {});
