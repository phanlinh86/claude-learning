/* NB.Assets — loads default SVG art, player-chosen pictures, and caches pre-rasterized sprites.
 * Sprites are rasterized once at (logical size × render scale) so drawing stays fast and crisp. */
(function (NB) {
  'use strict';
  const SEASONS = ['dawn', 'noon', 'sunset', 'night'];   // the four times of day (name SEASONS kept for the shared helpers)
  const LAYERS = ['sky', 'far', 'mid', 'ground'];
  const D = 'assets/default/';
  const files = { icon: D + 'icon.svg', bubble: D + 'bubble.svg', heart: D + 'heart.svg', heart_empty: D + 'heart_empty.svg', jar: D + 'jar.svg' };
  ['0', '1', 'happy', 'ouch', 'rain'].forEach(f => { files['nimbus_' + f] = D + 'nimbus_' + f + '.svg'; });
  [0, 1, 2, 3, 4].forEach(i => { files['gem_' + i] = D + 'gem_' + i + '.svg'; });
  ['burr_0', 'burr_1'].forEach(f => { files[f] = D + f + '.svg'; });
  ['drop', 'streak', 'ripple', 'splash', 'shard', 'sparkle', 'petal', 'leaf', 'mist', 'glow', 'star', 'puff']
    .forEach(p => { files['p_' + p] = D + 'particles/' + p + '.svg'; });
  SEASONS.forEach(s => LAYERS.forEach(l => { files[s + '_' + l] = D + 'levels/' + s + '/' + l + '.svg'; }));
  const LAYER_SIZE = { sky: [960, 540], far: [960, 540], mid: [960, 540], ground: [960, 200] };
  const COLORS = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst'];

  const SLOTS = [
    { id: 'hero', name: 'Nimbus', kind: 'char', box: [96, 96] },
    { id: 'gem', name: 'Gem', kind: 'char', box: [64, 64] },
    { id: 'bg_dawn', name: 'Dawn', kind: 'bg', season: 0 },
    { id: 'bg_noon', name: 'Noon', kind: 'bg', season: 1 },
    { id: 'bg_sunset', name: 'Sunset', kind: 'bg', season: 2 },
    { id: 'bg_night', name: 'Night', kind: 'bg', season: 3 }
  ];

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => { console.warn('missing image', src); resolve(null); };   // tolerate missing art: the renderer has fallbacks
      img.src = src;
    });
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /* Turn a player's picture into the sprite source for a slot.
   * shape 'circle' → round sticker with a white border (great for faces / photos). */
  function processCustom(img, shape) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (shape === 'circle') {
      const s = Math.min(iw, ih), R = 512;
      const c = makeCanvas(R, R), g = c.getContext('2d');
      const border = R * 0.045;
      g.save();
      g.beginPath(); g.arc(R / 2, R / 2, R / 2 - border, 0, Math.PI * 2); g.clip();
      g.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, R, R);
      g.restore();
      g.lineWidth = border * 2; g.strokeStyle = '#ffffff';
      g.beginPath(); g.arc(R / 2, R / 2, R / 2 - border, 0, Math.PI * 2); g.stroke();
      g.lineWidth = border * 0.45; g.strokeStyle = 'rgba(60,40,20,.55)';
      g.beginPath(); g.arc(R / 2, R / 2, R / 2 - border * 0.25, 0, Math.PI * 2); g.stroke();
      return c;
    }
    const c = makeCanvas(iw, ih);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  /* True when all four corners of the picture are opaque (a photo rather than a cut-out). */
  async function isOpaque(src) {
    const img = await loadImage(src);
    if (!img) return false;
    const c = makeCanvas(img.naturalWidth, img.naturalHeight), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const w = c.width - 1, h = c.height - 1;
    try {
      return [[0, 0], [w, 0], [0, h], [w, h]].every(([x, y]) => g.getImageData(x, y, 1, 1).data[3] > 250);
    } catch (e) { return false; }
  }

  /* Downscale a file the player picked to something small enough to store. */
  function fileToDataURL(file, kind) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('Please choose a picture file (PNG, JPG, GIF, WebP…).')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        // Backgrounds are drawn "cover" on any screen shape (landscape 1280×540 … portrait 560×1600), so keep
        // the long edge up to 1600 px instead of fitting into 1280×720 (a portrait photo looked blurry).
        const k = kind === 'bg' ? Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
                                : Math.min(1, 512 / img.naturalWidth, 512 / img.naturalHeight);
        const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        // Backgrounds are opaque → JPEG keeps them small. Characters may have transparency → PNG.
        // (WebP keeps transparency at a fraction of PNG's size; fall back to PNG if unsupported.)
        let out = kind === 'bg' ? c.toDataURL('image/jpeg', 0.82) : c.toDataURL('image/webp', 0.9);
        if (kind !== 'bg' && !out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened.')); };
      img.src = url;
    });
  }

  const A = {
    SEASONS, SLOTS, LAYERS, LAYER_SIZE, COLORS, files,
    img: {},           // key -> HTMLImageElement (defaults)
    customSrc: {},     // slot -> HTMLImageElement (as stored)
    custom: {},        // slot -> processed canvas
    scale: 1,
    _cache: new Map(),

    /* Only what the first screen needs blocks start-up; the deeper zones' art streams in behind the title. */
    async loadAll(onProgress) {
      const keys = Object.keys(files);
      const later = k => /^(noon|sunset|night)_/.test(k);
      let done = 0;
      const one = async k => { this.img[k] = await loadImage(files[k]); done++; if (onProgress) onProgress(done / keys.length); };
      this.restLoaded = Promise.all(keys.filter(later).map(one)).then(() => { this.restDone = true; if (NB.Game && NB.Game.renderer) NB.Game.renderer.prewarm(1); });
      await Promise.all(keys.filter(k => !later(k)).map(one));
      await this.loadCustom();
    },

    async loadCustom() {
      const S = NB.Storage;
      await Promise.all(SLOTS.map(async s => {
        const data = S.get('img_' + s.id);
        if (!data) { delete this.customSrc[s.id]; delete this.custom[s.id]; return; }
        const img = await loadImage(data);
        if (!img) { delete this.custom[s.id]; return; }
        this.customSrc[s.id] = img;
        this.custom[s.id] = processCustom(img, s.kind === 'bg' ? 'fit' : S.get('shape_' + s.id, 'fit'));
      }));
      this._cache.clear();
    },

    async setCustom(slotId, file) {
      const slot = SLOTS.find(s => s.id === slotId);
      const data = await fileToDataURL(file, slot.kind);
      const ok = await NB.Storage.set('img_' + slotId, data);
      if (!ok) throw new Error('Not enough room to save that picture. Try resetting another picture first.');
      // photos (opaque corners) look best as a round sticker; cut-outs with transparency stay whole
      if (slot.kind === 'char') NB.Storage.set('shape_' + slotId, (await isOpaque(data)) ? 'circle' : 'fit');
      await this.loadCustom();
    },
    setShape(slotId, shape) {
      NB.Storage.set('shape_' + slotId, shape);
      const src = this.customSrc[slotId];
      if (src) this.custom[slotId] = processCustom(src, shape);
      this._cache.clear();
    },
    clearCustom(slotId) {
      NB.Storage.del('img_' + slotId); NB.Storage.del('shape_' + slotId);
      delete this.customSrc[slotId]; delete this.custom[slotId];
      this._cache.clear();
    },
    /* Small preview image (data URL) for the Change Pictures cards — cached, cheap to redraw. */
    thumb(slotId) {
      const src = this.custom[slotId]; if (!src) return '';
      this._thumbs = this._thumbs || {};
      const key = slotId + '|' + (NB.Storage.get('shape_' + slotId, '') || '') + '|' + src.width + 'x' + src.height;
      if (this._thumbs[slotId] && this._thumbs[slotId].key === key) return this._thumbs[slotId].url;
      const k = Math.min(1, 240 / src.width, 160 / src.height);
      const c = makeCanvas(src.width * k, src.height * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/png');
      this._thumbs[slotId] = { key, url };
      return url;
    },
    hasCustom(slotId) { return !!this.custom[slotId]; },

    setScale(s) {
      s = Math.max(0.5, Math.min(4, s));
      if (Math.abs(s - this.scale) > 0.01) {
        this.scale = s; this._cache.clear(); this._wq.length = 0;
      }
    },

    /* P1: rasterize sprites ahead of time in idle callbacks (one or two per callback) instead of inside a frame. */
    _wq: [],
    warm(list) {
      for (const [key, w, h] of list) {
        const ck = key + '|' + Math.round(w * 4) + '|' + Math.round(h * 4);
        if (!this._cache.has(ck) && !this._wq.some(q => q[3] === ck)) this._wq.push([key, w, h, ck]);
      }
      this._pump();
    },
    warmSeason(s) { /* backgrounds are pre-rendered whole by the renderer (Renderer.prewarm) */ },
    _pump() {
      if (this._wt || !this._wq.length) return;
      const ric = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 10 }), 50));
      this._wt = ric(dl => {
        this._wt = 0;
        do {
          const it = this._wq.shift();
          if (!it) break;   // setScale() may have emptied the queue while this callback was pending
          const [key, w, h, ck] = it;
          if (this._cache.has(ck)) continue;
          const c = this._raster(key, w, h, ck);
          // force the recorded SVG draw to actually rasterize now (canvas 2D defers work until the canvas is read)
          if (c) { const p = this._probe || (this._probe = makeCanvas(1, 1).getContext('2d')); p.drawImage(c, 0, 0, 1, 1); }
        } while (this._wq.length && dl.timeRemaining() > 12);
        this._pump();
      }, { timeout: 250 });   // a busy machine never goes idle: still finish within ~1-2 s, one layer per frame
    },

    /* Rasterized sprite for a default key or 'custom:<slot>' at logical size w×h. */
    sprite(key, w, h) {
      const ck = key + '|' + Math.round(w * 4) + '|' + Math.round(h * 4);
      let c = this._cache.get(ck);
      if (c) return c;
      return this._raster(key, w, h, ck);
    },
    _raster(key, w, h, ck) {
      const src = key.startsWith('custom:') ? this.custom[key.slice(7)] : this.img[key];
      if (!src) return null;
      const c = makeCanvas(w * this.scale, h * this.scale);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, c.width, c.height);
      this._cache.set(ck, c);
      return c;
    },

    /* Fit a custom picture inside a box keeping its aspect ratio. */
    fit(slotId, bw, bh) {
      const c = this.custom[slotId];
      if (!c) return [bw, bh];
      const k = Math.min(bw / c.width, bh / c.height);
      return [c.width * k, c.height * k];
    },

    /* Drop cached season layers we are not using, to keep memory low. */
    trimSeasons(keep) {
      for (const k of this._cache.keys()) {
        const s = SEASONS.findIndex(n => k.startsWith(n + '_'));
        if (s >= 0 && !keep.includes(s)) this._cache.delete(k);
      }
    }
  };
  NB.Assets = A;
})(window.NB = window.NB || {});
