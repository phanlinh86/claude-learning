/* RP.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * Underwater flavour: kalimba / marimba-like plucks, bubbly bloops, airy pads and a gentle generative loop whose key,
 * tempo and brightness change with the season. Every sea star plays the next note of the season's TUNE, so the
 * parade "sings" the song. */
(function (RP) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

  const SEASON_MUSIC = [
    // Spring Bloom: sunny F major, light and bouncy
    { root: 65, tempo: 96, prog: [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]], scale: [0, 2, 4, 7, 9], swing: 0.10, bright: 2400, bubbles: 0.10 },
    // Summer Shallows: bright C major, the quickest and sparkliest
    { root: 60, tempo: 108, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], scale: [0, 2, 4, 7, 9], swing: 0.14, bright: 3400, bubbles: 0.16 },
    // Autumn Kelp: warm D dorian, swaying slowly in the current
    { root: 62, tempo: 86, prog: [[0, 3, 7], [5, 9, 12], [3, 7, 10], [-2, 2, 5]], scale: [0, 2, 3, 7, 9], swing: 0.06, bright: 1500, bubbles: 0.08 },
    // Winter Glow: calm, glassy A with a lydian shimmer, slowest and darkest
    { root: 57, tempo: 76, prog: [[0, 4, 7], [2, 6, 9], [-3, 0, 4], [-5, -1, 2]], scale: [0, 2, 4, 6, 7, 11], swing: 0.0, bright: 1100, bubbles: 0.05 }
  ];
  /* The "song" of each season: semitones above the root (original little tunes). Star k of the parade plays TUNES[b][k % len]. */
  const TUNES = [
    [0, 4, 7, 9, 7, 4, 2, 4, 5, 9, 12, 9, 7, 5, 4, 2, 0, 7],           // Spring: "petals opening"
    [0, 2, 4, 7, 9, 7, 12, 9, 7, 4, 7, 9, 12, 14, 12, 9, 7, 12],       // Summer: "sunny splash"
    [0, 3, 7, 10, 9, 7, 3, 5, 7, 3, 0, -2, 0, 3, 5, 7, 10, 12],        // Autumn: "swaying kelp"
    [0, 7, 4, 11, 9, 7, 6, 4, 7, 12, 11, 7, 6, 4, 2, 4, 7, 12]         // Winter: "glow in the deep"
  ];

  const A = {
    ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false,
    season: 0, _timer: null, _nextTime: 0, _step: 0, _phrase: null, _musicPlaying: false,

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
      } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 1;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      // phones are quiet: compressor (−18 dB, knee 12, 4:1) then a make-up gain = the player's volume × 1.7
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.user = c.createGain(); this.user.gain.value = (this.volume == null ? 1 : this.volume) * 1.7;
      this.master.connect(comp); comp.connect(this.user); this.user.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
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
    /* the player's volume 0..1 (Settings slider), applied after the compressor */
    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, +v || 0));
      if (this.user && this.ctx) this.user.gain.setTargetAtTime(this.volume * 1.7, this.ctx.currentTime, 0.03);
    },
    /* iOS Safari: Web Audio defaults to the quiet 'ambient' channel that the side switch silences; ask for 'playback'
     * (Safari 16.4+) and play a silent buffer inside the gesture so the output really wakes up. */
    _iosKick() {
      try { if (navigator.audioSession && navigator.audioSession.type !== 'playback' && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
      if (!this.ensure()) return;
      if (this.ctx.state !== 'running' && !this._hidden) this.ctx.resume().catch(() => {});
      if (!this._kicked) { try { const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); this._kicked = true; } catch (e) { /* ignore */ } }
    },
    unlock() {
      this._iosKick();
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
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.8 : 0, t, 0.03);
      this.music.gain.setTargetAtTime(this.musicOn && this._musicPlaying ? 0.16 : 0, t, 0.4);
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

    /* kalimba / marimba-like pluck: a sine body, a soft octave and a short inharmonic "tine" partial */
    pluck(freq, dur, { vol = 0.2, at = 0, dest = null } = {}) {
      this.tone(freq, dur, { type: 'sine', vol, at, attack: 0.004, dest });
      this.tone(freq * 2, dur * 0.45, { type: 'triangle', vol: vol * 0.16, at, attack: 0.003, dest });
      this.tone(freq * 5.4, dur * 0.12, { type: 'sine', vol: vol * 0.12, at, attack: 0.002, dest });
    },
    /* a bubble "bloop": a sine whose pitch jumps up quickly */
    bloop(f0, { vol = 0.1, at = 0, dur = 0.09, dest = null } = {}) {
      this.tone(f0, dur, { type: 'sine', vol, at, attack: 0.004, slideTo: f0 * 2.6, dest });
    },
    /* airy pad: two detuned triangles through a low-pass, slow attack and release */
    pad(freqs, dur, { vol = 0.04, at = 0, cutoff = 1800, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at, f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.6, dur * 0.35));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      f.connect(g); g.connect(dest || this.music);
      for (const fr of freqs) for (const d of [-7, 7]) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fr; o.detune.value = d;
        o.connect(f); o.start(t); o.stop(t + dur + 0.05);
      }
    },

    // ---------- sound effects ----------
    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const r = 1 + (Math.random() - 0.5) * 0.08; // tiny pitch variation keeps repeats pleasant
      const m = SEASON_MUSIC[this.season], tune = TUNES[this.season];
      switch (name) {
        case 'note': {           // the next note of the season tune on a kalimba pluck
          const n = m.root + 12 + tune[(opt.index || 0) % tune.length];
          this.pluck(NOTE(n), 0.5, { vol: 0.22 });
          this.bloop(700 * r, { vol: 0.03, at: 0.03 });
          break;
        }
        case 'gold': {           // golden star: the tune note + a shimmering arpeggio chime
          const n = m.root + 12 + tune[(opt.index || 0) % tune.length];
          this.pluck(NOTE(n), 0.6, { vol: 0.2 });
          [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => {
            this.tone(NOTE(n + 12 + d), 0.5, { type: 'sine', vol: 0.07, at: 0.05 + i * 0.05, detune: 6 });
            this.tone(NOTE(n + 12 + d), 0.4, { type: 'sine', vol: 0.04, at: 0.06 + i * 0.05, detune: -6 });
          });
          this.noise(0.6, { vol: 0.03, type: 'highpass', f0: 6000, q: 0.5, at: 0.05 });
          break;
        }
        case 'goldspawn':        // a gentle sparkle: the golden star peeks out
          [24, 19, 28].forEach((d, i) => this.tone(NOTE(m.root + d), 0.28, { type: 'sine', vol: 0.05, at: i * 0.07 }));
          this.noise(0.35, { vol: 0.02, type: 'highpass', f0: 7000, q: 0.4 });
          break;
        case 'goldhide':         // it burrows into the sand: a soft low "fwump"
          this.noise(0.25, { vol: 0.05, type: 'lowpass', f0: 700, f1: 200, q: 0.6 });
          this.tone(NOTE(m.root + 7), 0.25, { type: 'sine', vol: 0.05, slideTo: NOTE(m.root - 5) });
          break;
        case 'regrab': this.pluck(NOTE(m.root + 24 + tune[(opt.index || 0) % tune.length]) * r, 0.25, { vol: 0.1 }); break;
        case 'bonk':             // soft cartoon "boing" + a puff of bubbles, never harsh
          this.tone(320, 0.36, { type: 'sine', vol: 0.18, slideTo: 150 });
          this.tone(480, 0.2, { type: 'triangle', vol: 0.05, slideTo: 240, at: 0.03 });
          [0.12, 0.18, 0.25, 0.31].forEach((at, i) => this.bloop((380 + i * 140) * r, { vol: 0.06, at }));
          break;
        case 'bounce':           // a soft whoosh of water off the coral
          this.noise(0.22, { vol: 0.06, f0: 400, f1: 1300, q: 0.9 });
          this.bloop(260 * r, { vol: 0.04, at: 0.04, dur: 0.12 });
          break;
        case 'flip':             // bubbly "bloop" up and over
          this.bloop(300 * r, { vol: 0.12, dur: 0.14 });
          [0.08, 0.14, 0.2].forEach((at, i) => this.bloop((620 + i * 180) * r, { vol: 0.05, at }));
          this.noise(0.2, { vol: 0.03, f0: 900, f1: 2600, q: 0.8 });
          break;
        case 'land': this.bloop(200 * r, { vol: 0.06, dur: 0.1 }); this.noise(0.12, { vol: 0.03, type: 'lowpass', f0: 500, q: 0.6 }); break;
        case 'flipready': [0, 7].forEach((d, i) => this.tone(NOTE(m.root + 24 + d), 0.14, { type: 'sine', vol: 0.045, at: i * 0.06 })); break;
        case 'songdone':         // the whole tune as a quick happy run of plucks
          tune.slice(0, 12).forEach((d, i) => this.pluck(NOTE(m.root + 12 + d), 0.35, { vol: 0.11, at: i * 0.07 }));
          break;
        case 'cleared':          // little fanfare: rising plucked chord, sparkle on top, bubbles
          [0, 4, 7, 12, 16, 19].forEach((n, i) => this.pluck(NOTE(m.root + 12 + n), 0.7, { vol: 0.14, at: i * 0.08 }));
          [24, 28, 31].forEach((n, i) => this.tone(NOTE(m.root + n), 0.6, { type: 'sine', vol: 0.05, at: 0.55 + i * 0.06 }));
          [0.3, 0.42, 0.5, 0.62].forEach((at, i) => this.bloop(500 + i * 160, { vol: 0.04, at }));
          break;
        case 'season': [0, 7, 12].forEach((n, i) => this.pluck(NOTE(m.root + 24 + n), 0.9, { vol: 0.07, at: i * 0.12 })); break;
        case 'dead':             // gentle "aww": soft descending plucks, then a sleepy bubble
          [7, 4, 0, -5].forEach((n, i) => this.pluck(NOTE(m.root + 12 + n), 0.45, { vol: 0.13, at: i * 0.18 }));
          this.bloop(240, { vol: 0.05, at: 0.85, dur: 0.16 });
          break;
        case 'start': this.pluck(NOTE(m.root + 12), 0.25, { vol: 0.14 }); this.pluck(NOTE(m.root + 19), 0.35, { vol: 0.14, at: 0.08 }); this.bloop(500, { vol: 0.05, at: 0.16 }); break;
        case 'best': [0, 4, 7, 12].forEach((n, i) => this.pluck(NOTE(76 + n), 0.5, { vol: 0.09, at: 0.6 + i * 0.1 })); break;
        case 'click': this.bloop(600, { vol: 0.07, dur: 0.06 }); break;
      }
    },

    // ---------- music ----------
    setSeason(i) {
      i = ((i % 4) + 4) % 4;
      if (i === this.season && this._phrase) return;
      this.season = i;
      this._phrase = this._makePhrase(i);
    },
    _makePhrase(i) {
      // a repeating 4-bar melody (8 eighth-notes per bar), random but musical: stepwise motion on a pentatonic scale
      const m = SEASON_MUSIC[i];
      let seed = 1234 + i * 977;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const notes = [];
      let deg = 5;
      for (let bar = 0; bar < 4; bar++) {
        for (let s = 0; s < 8; s++) {
          const rest = (s % 2 === 1 && rnd() < 0.45) || (bar === 3 && s >= 6);
          deg += Math.round((rnd() - 0.5) * 3.2);
          deg = Math.max(2, Math.min(10, deg));
          if (s === 0) deg = Math.max(3, Math.min(8, deg)); // land on chord-ish tones at bar starts
          notes.push(rest ? null : deg);
        }
      }
      return notes;
    },
    startMusic() {
      if (!this.ensure()) return;
      if (!this._phrase) this.setSeason(this.season);
      if (this._timer) return;
      this._musicPlaying = true;
      this._nextTime = this.ctx.currentTime + 0.1;
      this._step = 0;
      this._timer = setInterval(() => this._schedule(), 30);
      this.applyMute();
    },
    stopMusic() {
      this._musicPlaying = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.applyMute();
    },
    _schedule() {
      const c = this.ctx; if (!c) return;
      if (c.state !== 'running') { this._nextTime = c.currentTime + 0.1; return; }
      while (this._nextTime < c.currentTime + 0.15) {
        this._playStep(this._step, this._nextTime);
        const m = SEASON_MUSIC[this.season];
        const eighth = 60 / m.tempo / 2;
        const sw = (this._step % 2 === 0 ? 1 + m.swing : 1 - m.swing);
        this._nextTime += eighth * sw;
        this._step = (this._step + 1) % 32;
      }
    },
    _playStep(step, t) {
      const m = SEASON_MUSIC[this.season];
      const bar = Math.floor(step / 8), st = step % 8;
      const chord = m.prog[bar];
      const at = t - this.ctx.currentTime;
      const eighth = 60 / m.tempo / 2, dest = this.music;
      // soft bass on beats 1 and 3
      if (st === 0 || st === 4) this.tone(NOTE(m.root - 12 + chord[0]), eighth * 3.4, { type: 'sine', vol: 0.26, at, dest, attack: 0.02 });
      // airy pad on each bar (brightness = the season's cutoff)
      if (st === 0) this.pad(chord.map(n => NOTE(m.root + n)), eighth * 8.4, { vol: 0.035, at, cutoff: m.bright, dest });
      // off-beat kalimba sparkle in the bright seasons
      if (m.bright > 2000 && st % 4 === 3) this.pluck(NOTE(m.root + 24 + chord[st % 3]), eighth * 1.2, { vol: 0.035, at, dest });
      // melody plucks
      const deg = this._phrase[step];
      if (deg != null) {
        const sc = m.scale, oct = Math.floor(deg / sc.length);
        const n = m.root + 12 + sc[deg % sc.length] + 12 * (oct - 1);
        this.pluck(NOTE(n), eighth * (this.season === 3 ? 3 : 2), { vol: 0.09, at, dest });
      }
      // now and then a lazy bubble drifts past
      if (Math.random() < m.bubbles) this.bloop(300 + Math.random() * 500, { vol: 0.025, at: at + Math.random() * eighth, dest });
    }
  };
  RP.Audio = A;
})(window.RP = window.RP || {});
