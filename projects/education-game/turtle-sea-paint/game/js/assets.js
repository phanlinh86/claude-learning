/* SP.Assets (Nini's Sea Painting) — loads the SVG art and keeps pre-rasterized copies so drawing stays fast on phones.
 * sprite(name, px) returns a canvas whose longest side is ≥ px device pixels (rounded up to a size
 * bucket, so a handful of bitmaps serve every zoom level). exact(name, w, h) = one exact-size raster (tiled env layers). */
(function (SP) {
  'use strict';
  const D = 'assets/default/';
  const files = {};
  ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'paint', 'point', 'full_wave'].forEach(f => { files['nini_' + f] = D + 'characters/nini_' + f + '.svg'; });
  ['fishy', 'fishy_happy', 'clam', 'clam_open', 'pearl'].forEach(f => { files[f] = D + 'characters/' + f + '.svg'; });
  files.star = D + 'ui/star.svg'; files.star_empty = D + 'ui/star_empty.svg'; files.icon = D + 'icon.svg';
  ['spring', 'summer', 'autumn', 'winter'].forEach(m => ['far', 'mid', 'ground', 'surface'].forEach(l => { files[l + '_' + m] = D + 'env/' + l + '_' + m + '.svg'; }));
  files.rays = D + 'env/rays.svg'; files.caustic = D + 'env/caustic.svg';
  // particles (Weather.SPRITES); the weather's 'star' sprite is stored as 'pstar' (the HUD star is 'star')
  ['bubble', 'petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'plankton', 'dot', 'confetti_a', 'confetti_b']
    .forEach(p => { files[p === 'star' ? 'pstar' : p] = D + 'particles/' + p + '.svg'; });

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => { A.missing.push(src); resolve(null); };   // tolerated: a placeholder is drawn
      img.src = src;
    });
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  const A = {
    files, images: {}, _cache: new Map(), loaded: 0, total: 0, missing: [],
    async load(onProgress) {
      const names = Object.keys(files);
      this.total = names.length;
      await Promise.all([].concat(names.map(async n => {
        this.images[n] = await loadImage(files[n]);
        this.loaded++;
        if (onProgress) onProgress(this.loaded / this.total);
      })));
    },
    has(name) { return !!this.images[name]; },
    size(name) { const i = this.images[name]; return i ? [i.naturalWidth || i.width, i.naturalHeight || i.height] : [1, 1]; },
    /* Rasterized sprite with longest side ≥ px (device pixels). Buckets: 32·1.25^k. */
    sprite(name, px) {
      const img = this.images[name];
      if (!img) return null;
      let b = 32; while (b < px) b = Math.ceil(b * 1.25);
      b = Math.min(b, 2048);
      const key = name + '@' + b;
      let c = this._cache.get(key);
      if (!c) {
        const [iw, ih] = this.size(name);
        const k = b / Math.max(iw, ih);
        c = makeCanvas(iw * k, ih * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        this._cache.set(key, c);
        if (this._cache.size > 260) this._cache.delete(this._cache.keys().next().value);
      }
      return c;
    },
    /* Exact-size raster (for full-width tiled layers). */
    exact(name, w, h) {
      const img = this.images[name];
      if (!img) return null;
      const key = name + '#' + w + 'x' + h;
      let c = this._cache.get(key);
      if (!c) { c = makeCanvas(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h); this._cache.set(key, c); }
      return c;
    },
    /* A white/grey sprite tinted with a colour (paint dots, confetti). */
    tinted(name, color, px) {
      const base = this.sprite(name, px);
      if (!base) return null;
      const key = name + '~' + color + '@' + base.width;
      let c = this._cache.get(key);
      if (!c) {
        c = makeCanvas(base.width, base.height);
        const g = c.getContext('2d');
        g.drawImage(base, 0, 0);
        g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(base, 0, 0);
        this._cache.set(key, c);
      }
      return c;
    },
    dropExact() { for (const k of [...this._cache.keys()]) if (k.includes('#')) this._cache.delete(k); },
    makeCanvas
  };
  SP.Assets = A;
})(window.SP = window.SP || {});
