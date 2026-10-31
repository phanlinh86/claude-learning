/* SG.Assets (Owlet's Snow Garden) — loads the SVG art and keeps pre-rasterized copies so drawing stays fast on phones.
 * sprite(name, px) returns a canvas whose longest side is ≥ px device pixels (rounded up to a size
 * bucket, so a handful of bitmaps serve every zoom level). */
(function (SG) {
  'use strict';
  const D = 'assets/default/';
  const files = {};
  ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'].forEach(f => { files['lumi_' + f] = D + 'characters/lumi_' + f + '.svg'; });
  ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'plain'].forEach(c => { files['seed_' + c] = D + 'items/seed_' + c + '.svg'; });
  ['pot_back', 'pot_front', 'planter_back', 'planter_front', 'sign'].forEach(n => { files[n] = D + 'items/' + n + '.svg'; });
  (SG.ANIMALS || ['bear', 'seal', 'fox', 'hare', 'reindeer', 'walrus', 'penguin', 'puffin', 'whale'])
    .forEach(a => { files['animal_' + a] = D + 'items/animal_' + a + '.svg'; });
  files.star = D + 'ui/star.svg'; files.star_empty = D + 'ui/star_empty.svg'; files.icon = D + 'icon.svg';
  ['far', 'mid', 'ground', 'sun', 'moon', 'cloud1', 'cloud2', 'cloud3'].forEach(e => { files[e] = D + 'env/' + e + '.svg'; });
  ['snow1', 'snow2', 'sparkle', 'star', 'petal', 'leaf', 'puff', 'confetti_a', 'confetti_b']
    .forEach(p => { files[p === 'star' ? 'pstar' : p] = D + 'particles/' + p + '.svg'; });

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

  const A = {
    files, images: {}, _cache: new Map(), loaded: 0, total: 0,
    async load(onProgress) {
      const names = Object.keys(files);
      this.total = names.length;
      await Promise.all(names.map(async n => {
        this.images[n] = await loadImage(files[n]);
        this.loaded++;
        if (onProgress) onProgress(this.loaded / this.total);
      }));
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
    dropExact() { for (const k of [...this._cache.keys()]) if (k.includes('#')) this._cache.delete(k); },
    makeCanvas
  };
  SG.Assets = A;
})(window.SG = window.SG || {});
