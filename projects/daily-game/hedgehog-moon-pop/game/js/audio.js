/* MP.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * Gentle SFX + a soft generative space-lullaby loop whose key/tempo/instrument change with the time of day. */
(function (MP) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz
  const MAKEUP = 2.2;   // make-up gain after the compressor (QA loudness at 100 % volume: RMS ≈ −26 dBFS, peaks ≈ −3 dBFS)

  const SEASON_MUSIC = [
    // Dawn — Earthrise: a slow E-major lullaby, soft sine lead, off-beat sparkles
    { root: 64, tempo: 84, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'sine', scale: [0, 2, 4, 7, 9], swing: 0.1, sparkle: true },
    // Noon — Bright Moon: bouncy C major, plucky triangle, light swing
    { root: 72, tempo: 104, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], lead: 'triangle', scale: [0, 2, 4, 7, 9], swing: 0.12, sparkle: true },
    // Sunset — Ringed Planet: warm A dorian, breathy pads that swell
    { root: 69, tempo: 90, prog: [[0, 3, 7], [5, 9, 12], [-2, 2, 5], [0, 3, 7, 10]], lead: 'sine', scale: [0, 2, 3, 7, 9], swing: 0.06, airy: true },
    // Night — Starry Bakery: music-box F major, high sine bells, slow
    { root: 65, tempo: 76, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'sine', scale: [0, 2, 4, 7, 9], swing: 0.0, musicbox: true }
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
      // phones are quiet: compressor (−18 dB, knee 12, 4:1) then a make-up gain = the player's volume × 2.3 (MAKEUP)
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.user = c.createGain(); this.user.gain.value = (this.volume == null ? 1 : this.volume) * MAKEUP;
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
      if (this.user && this.ctx) this.user.gain.setTargetAtTime(this.volume * MAKEUP, this.ctx.currentTime, 0.03);
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

    // ---------- sound effects ----------
    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const r = 1 + (Math.random() - 0.5) * 0.08; // tiny pitch variation keeps repeats pleasant
      switch (name) {
        case 'pop': {             // bright "plip": higher for higher pops, climbing with the air chain and the streak
          const tier = opt.tier || 1, ch = Math.max(0, (opt.chain || 1) - 1), st = Math.min(24, opt.combo || 0);
          const n = 74 + (tier - 1) * 5 + [0, 2, 4, 7, 9, 12, 14][Math.min(6, ch)] + [0, 0, 2, 2, 4][Math.min(4, Math.floor(st / 6))];
          this.tone(NOTE(n) * 1.6 * r, 0.06, { type: 'sine', vol: 0.12, slideTo: NOTE(n) * r });   // the "p" of the pop
          this.noise(0.05, { vol: 0.05, type: 'highpass', f0: 3200, q: 0.7 });
          this.tone(NOTE(n + 12), 0.18, { type: 'sine', vol: 0.07, at: 0.03 });
          if (tier >= 3) this.tone(NOTE(n + 19), 0.25, { type: 'triangle', vol: 0.04, at: 0.07 });
          if (opt.kind === 'magnet') this.play('magnet');
          break;
        }
        case 'chain': { const k = Math.min(6, opt.n || 2); [0, 4, 7].forEach((d, i) => this.tone(NOTE(79 + k * 2 + d), 0.14, { type: 'triangle', vol: 0.05, at: 0.05 + i * 0.05 })); break; }
        case 'multup': { const m = opt.mult || 2; [0, 4, 7, 12].forEach((d, i) => this.tone(NOTE(72 + m * 2 + d), 0.2, { type: 'square', vol: 0.04, at: i * 0.06 })); break; }
        case 'puff': this.noise(0.25, { vol: 0.03, type: 'lowpass', f0: 500, f1: 900, q: 0.8 }); break;   // the crater breathes
        case 'emerge':            // "bloop": a bubble comes out of the crater
          this.tone(220 * r, 0.16, { type: 'sine', vol: 0.06, slideTo: 520 * r });
          this.tone(330 * r, 0.1, { type: 'sine', vol: 0.03, at: 0.08, slideTo: 620 * r });
          break;
        case 'escape': this.tone(NOTE(84) * r, 0.5, { type: 'sine', vol: 0.035, slideTo: NOTE(96) * r, attack: 0.1 }); break;   // soft rising whistle
        case 'jump':              // boing + whoosh
          this.tone(170 * r, 0.3, { type: 'sine', vol: 0.12, slideTo: 520 * r });
          this.noise(0.3, { vol: 0.06, type: 'bandpass', f0: 600, f1: 2000, q: 0.7 });
          break;
        case 'land': this.tone(200 * r, 0.12, { type: 'sine', vol: 0.09, slideTo: 120 }); this.noise(0.12, { vol: 0.04, type: 'lowpass', f0: 600, q: 0.6 }); break;   // soft wheels-down thud
        case 'bonk':              // soft, funny "boing" + a tiny dizzy wobble (never scary)
          this.tone(320 * r, 0.3, { type: 'triangle', vol: 0.1, slideTo: 160 });
          this.tone(NOTE(81), 0.12, { type: 'sine', vol: 0.06, at: 0.22, slideTo: NOTE(86) });
          this.tone(NOTE(84), 0.14, { type: 'sine', vol: 0.05, at: 0.34, slideTo: NOTE(79) });
          break;
        case 'pebblewarn': this.tone(NOTE(91), 0.1, { type: 'sine', vol: 0.025 }); this.tone(NOTE(88), 0.12, { type: 'sine', vol: 0.02, at: 0.12 }); break;
        case 'pebbleland': this.noise(0.18, { vol: 0.06, type: 'lowpass', f0: 700, f1: 200, q: 0.6 }); this.tone(140 * r, 0.12, { type: 'sine', vol: 0.05, slideTo: 90 }); break;
        case 'magnet':            // shimmer up
          [0, 4, 7, 11, 14].forEach((d, i) => this.tone(NOTE(79 + d), 0.3, { type: 'sine', vol: 0.05, at: i * 0.04, detune: 8 }));
          this.noise(0.5, { vol: 0.03, type: 'highpass', f0: 5000, f1: 7000, q: 0.5 });
          break;
        case 'magnetend': [11, 7, 4, 0].forEach((d, i) => this.tone(NOTE(79 + d), 0.2, { type: 'sine', vol: 0.035, at: i * 0.05 })); break;   // shimmer down
        case 'heal': [0, 7, 12].forEach((d, i) => this.tone(NOTE(84 + d), 0.16, { type: 'sine', vol: 0.06, at: i * 0.07 })); break;
        case 'boxfull': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.3, { type: 'triangle', vol: 0.12, at: i * 0.08 })); break;
        case 'cleared': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(NOTE(72 + n), 0.45, { type: 'triangle', vol: 0.12, at: 0.3 + i * 0.08 })); break;
        case 'season': [0, 7, 12].forEach((n, i) => this.tone(NOTE(84 + n), 0.8, { type: 'sine', vol: 0.06, at: i * 0.12 })); break;
        case 'dead':              // gentle "oh well" tune
          [72, 69, 67, 64, 65, 60].forEach((n, i) => this.tone(NOTE(n), 0.32, { type: 'triangle', vol: 0.11, at: i * 0.17 }));
          break;
        case 'start':
          this.tone(NOTE(72), 0.12, { type: 'triangle', vol: 0.13 });
          this.tone(NOTE(79), 0.2, { type: 'triangle', vol: 0.13, at: 0.08 });
          this.tone(NOTE(84), 0.25, { type: 'sine', vol: 0.08, at: 0.16 });
          break;
        case 'best': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.35, { type: 'square', vol: 0.05, at: 0.6 + i * 0.1 })); break;
        case 'click': this.tone(900, 0.05, { type: 'sine', vol: 0.08, slideTo: 1300 }); break;
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
      const bar = Math.floor(step / 8), s = step % 8;
      const chord = m.prog[bar];
      const at = t - this.ctx.currentTime;
      const eighth = 60 / m.tempo / 2;
      const opt = (type, vol, len) => ({ type, vol, at, dest: this.music, attack: 0.01, detune: 0 });
      // bass on beats 1 and 3 (music box: no bass, a soft low bell instead)
      if (s === 0 || s === 4) this.tone(NOTE(m.root - (m.musicbox ? 12 : 24) + chord[0]), eighth * 3.2, opt('sine', m.musicbox ? 0.12 : 0.3));
      // soft chord pad on bar start (airy: longer attack, breathier)
      if (s === 0) chord.forEach(n => this.tone(NOTE(m.root - 12 + n), eighth * 7.5, { ...opt(m.airy ? 'triangle' : 'sine', m.airy ? 0.035 : 0.045), attack: m.airy ? 0.6 : 0.15 }));
      // sunny off-beat sparkle
      if (m.sparkle && s % 2 === 1) this.tone(NOTE(m.root + 12 + chord[2]), eighth * 0.6, opt('sine', 0.03));
      // rain: a soft pitter (tiny filtered noise ticks)
      if (m.pitter && (s % 2 === 1 || Math.random() < 0.3)) this.noiseTo(0.03, 0.025, at, 5000);
      // wind: a breathy swell every second bar
      if (m.airy && s === 0 && bar % 2 === 1) this.noiseTo(eighth * 6, 0.03, at, 900, true);
      // melody
      const deg = this._phrase[step];
      if (deg != null) {
        const sc = m.scale, oct = Math.floor(deg / sc.length);
        const n = m.root + sc[deg % sc.length] + 12 * (oct - 1);
        if (m.musicbox) { this.tone(NOTE(n + 12), eighth * 3, opt('sine', 0.08)); this.tone(NOTE(n + 24), eighth * 1.2, opt('sine', 0.02)); }
        else this.tone(NOTE(n), eighth * 1.5, opt(m.lead, 0.1));
      }
    },
    /* noise into the music bus (rain pitter / wind breath) */
    noiseTo(dur, vol, at, f0, swell) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + Math.max(0, at);
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = swell ? 0.8 : 3; f.frequency.value = f0 * (0.8 + Math.random() * 0.4);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (swell ? dur * 0.45 : 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.music);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    }
  };
  MP.Audio = A;
})(window.MP = window.MP || {});
