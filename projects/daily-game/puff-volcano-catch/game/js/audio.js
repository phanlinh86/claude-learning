/* CD.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * Gentle SFX + a soft generative music loop whose key/tempo/instrument change with the season. */
(function (CD) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

  const SEASON_MUSIC = [
    // spring: bright C major, plucky triangle
    { root: 60, tempo: 104, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], lead: 'triangle', scale: [0, 2, 4, 7, 9], swing: 0.0 },
    // summer: sunny G major, a touch faster
    { root: 55, tempo: 112, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]], lead: 'square', scale: [0, 2, 4, 7, 9], swing: 0.08 },
    // autumn: mellow A minor
    { root: 57, tempo: 92, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], lead: 'triangle', scale: [0, 3, 5, 7, 10], swing: 0.12 },
    // winter: calm D major, music-box sine bells
    { root: 62, tempo: 84, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'sine', scale: [0, 2, 4, 7, 9], swing: 0.0 }
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
    unlock() {
      if (!this.ensure()) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    applyMute() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.55 : 0, t, 0.03);
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
        case 'gem': {            // bright "ting", pitch rises with Pip's size
          const sz = Math.min(5, opt.size || 1);
          const n = 76 + [0, 2, 4, 7, 9][sz - 1];
          this.tone(NOTE(n), 0.16, { type: 'triangle', vol: 0.18 });
          this.tone(NOTE(n + 12), 0.12, { type: 'sine', vol: 0.08, at: 0.05 });
          break;
        }
        case 'grow': this.tone(300 * r, 0.14, { type: 'sine', vol: 0.08, slideTo: 420 * r, at: 0.06 }); break;
        case 'maxsize': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(84 + n), 0.18, { type: 'sine', vol: 0.07, at: i * 0.05 })); break;
        case 'pop':
          this.noise(0.12, { vol: 0.2, f0: 1800, f1: 400, q: 0.8 });
          [0, 4, 7, 12, 16].forEach((n, i) => this.tone(NOTE(72 + n), 0.3, { type: 'triangle', vol: 0.14, at: 0.04 + i * 0.05 }));
          break;
        case 'dash': this.noise(0.18, { vol: 0.14, f0: 600, f1: 2400, q: 0.7 }); break;
        case 'bump':             // soft cartoon "boing", never harsh
          this.tone(220, 0.35, { type: 'sine', vol: 0.18, slideTo: 140 });
          this.tone(330, 0.25, { type: 'triangle', vol: 0.06, slideTo: 200, at: 0.03 });
          break;
        case 'drop': for (let i = 0; i < 2; i++) this.tone((900 - i * 150) * r, 0.08, { type: 'sine', vol: 0.06, at: i * 0.07 }); break;
        case 'jarfull': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(72 + n), 0.35, { type: 'triangle', vol: 0.15, at: i * 0.09 })); break;
        case 'gateopen': this.tone(NOTE(67), 0.6, { type: 'sine', vol: 0.12, slideTo: NOTE(79) }); break;
        case 'cleared': [0, 4, 7, 12, 16, 19].forEach((n, i) => this.tone(NOTE(72 + n), 0.5, { type: 'triangle', vol: 0.15, at: i * 0.08 })); break;
        case 'season': [0, 7, 12].forEach((n, i) => this.tone(NOTE(84 + n), 0.8, { type: 'sine', vol: 0.07, at: i * 0.12 })); break;
        case 'dead':
          this.tone(440, 0.55, { type: 'triangle', vol: 0.18, slideTo: 140 });
          [67, 64, 60].forEach((n, i) => this.tone(NOTE(n), 0.3, { type: 'triangle', vol: 0.12, at: 0.6 + i * 0.18 }));
          break;
        case 'start':
          this.tone(NOTE(72), 0.12, { type: 'triangle', vol: 0.14 });
          this.tone(NOTE(79), 0.2, { type: 'triangle', vol: 0.14, at: 0.08 });
          break;
        case 'best': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.35, { type: 'square', vol: 0.06, at: 0.6 + i * 0.1 })); break;
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
      // bass on beats 1 and 3
      if (s === 0 || s === 4) this.tone(NOTE(m.root - 12 + chord[0]), eighth * 3.2, opt('sine', 0.32));
      // soft chord pad on bar start
      if (s === 0) chord.forEach(n => this.tone(NOTE(m.root + n), eighth * 7.5, { ...opt('sine', 0.05), attack: 0.15 }));
      // off-beat sparkle (summer/spring)
      if ((this.season < 2) && s % 2 === 1) this.tone(NOTE(m.root + 12 + chord[2]), eighth * 0.6, opt('sine', 0.03));
      // melody
      const deg = this._phrase[step];
      if (deg != null) {
        const sc = m.scale, oct = Math.floor(deg / sc.length);
        const n = m.root + 12 + sc[deg % sc.length] + 12 * (oct - 1);
        this.tone(NOTE(n), eighth * (this.season === 3 ? 2.6 : 1.5), opt(m.lead, m.lead === 'square' ? 0.045 : 0.11));
      }
    }
  };
  CD.Audio = A;
})(window.CD = window.CD || {});
