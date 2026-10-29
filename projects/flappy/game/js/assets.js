/* FF.Assets — loads default SVG art, player-chosen pictures, and caches pre-rasterized sprites.
 * Sprites are rasterized once at (logical size × render scale) so drawing stays fast and crisp. */
(function (FF) {
  'use strict';
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const D = 'assets/default/';
  const files = {
    bird_up: D + 'bird_up.svg', bird_mid: D + 'bird_mid.svg', bird_down: D + 'bird_down.svg',
    drop: D + 'drop.svg',
    turtle_walk1: D + 'turtle_walk1.svg', turtle_walk2: D + 'turtle_walk2.svg', turtle_happy: D + 'turtle_happy.svg',
    heart: D + 'heart.svg', icon: D + 'icon.svg'
  };
  ['petal', 'blossom', 'leaf_red', 'leaf_orange', 'leaf_yellow', 'snowflake', 'butterfly_a', 'butterfly_b', 'seed']
    .forEach(p => { files['p_' + p] = D + 'particles/' + p + '.svg'; });
  SEASONS.forEach(s => ['sky', 'far', 'mid', 'ground', 'clouds'].forEach(l => { files[s + '_' + l] = D + 'seasons/' + s + '/' + l + '.svg'; }));

  const SLOTS = [
    { id: 'bird', name: 'Bird', kind: 'char', box: [84, 70] },
    { id: 'drop', name: 'Dropped treat', kind: 'char', box: [36, 36] },
    { id: 'turtle', name: 'Turtle', kind: 'char', box: [132, 79] },
    { id: 'bg_spring', name: 'Spring', kind: 'bg', season: 0 },
    { id: 'bg_summer', name: 'Summer', kind: 'bg', season: 1 },
    { id: 'bg_autumn', name: 'Autumn', kind: 'bg', season: 2 },
    { id: 'bg_winter', name: 'Winter', kind: 'bg', season: 3 }
  ];

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => { console.warn('missing image', src); resolve(null); };
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

  /* Downscale a file the player picked to something small enough to store. */
  function fileToDataURL(file, kind) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('Please choose a picture file (PNG, JPG, GIF, WebP…).')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = kind === 'bg' ? [1920, 1080] : [640, 640];
        const k = Math.min(1, max[0] / img.naturalWidth, max[1] / img.naturalHeight);
        const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        // Backgrounds are opaque → JPEG keeps them small. Characters may have transparency → PNG.
        resolve(kind === 'bg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened.')); };
      img.src = url;
    });
  }

  const A = {
    SEASONS, SLOTS, files,
    img: {},           // key -> HTMLImageElement (defaults)
    customSrc: {},     // slot -> HTMLImageElement (as stored)
    custom: {},        // slot -> processed canvas
    scale: 1,
    _cache: new Map(),

    async loadAll(onProgress) {
      const keys = Object.keys(files);
      let done = 0;
      await Promise.all(keys.map(async k => {
        this.img[k] = await loadImage(files[k]);
        done++; if (onProgress) onProgress(done / keys.length);
      }));
      await this.loadCustom();
    },

    async loadCustom() {
      const S = FF.Storage;
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
      FF.Storage.set('img_' + slotId, data);
      if (slot.kind === 'char' && !FF.Storage.get('shape_' + slotId)) FF.Storage.set('shape_' + slotId, 'fit');
      await this.loadCustom();
    },
    setShape(slotId, shape) {
      FF.Storage.set('shape_' + slotId, shape);
      const src = this.customSrc[slotId];
      if (src) this.custom[slotId] = processCustom(src, shape);
      this._cache.clear();
    },
    clearCustom(slotId) {
      FF.Storage.del('img_' + slotId); FF.Storage.del('shape_' + slotId);
      delete this.customSrc[slotId]; delete this.custom[slotId];
      this._cache.clear();
    },
    hasCustom(slotId) { return !!this.custom[slotId]; },

    setScale(s) {
      s = Math.max(0.5, Math.min(4, s));
      if (Math.abs(s - this.scale) > 0.01) { this.scale = s; this._cache.clear(); }
    },

    /* Rasterized sprite for a default key or 'custom:<slot>' at logical size w×h. */
    sprite(key, w, h) {
      const ck = key + '|' + Math.round(w * 4) + '|' + Math.round(h * 4);
      let c = this._cache.get(ck);
      if (c) return c;
      const src = key.startsWith('custom:') ? this.custom[key.slice(7)] : this.img[key];
      if (!src) return null;
      c = makeCanvas(w * this.scale, h * this.scale);
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
  FF.Assets = A;
})(window.FF = window.FF || {});
