/* FC.Assets (Pip's Camp Hide & Seek) — loads the SVG art and keeps pre-rasterized copies so drawing stays fast on phones.
 * sprite(name, px) returns a canvas whose longest side is ≥ px device pixels (rounded up to a size
 * bucket, so a handful of bitmaps serve every zoom level). */
(function (FC) {
  'use strict';
  const D = 'assets/default/';
  const A_SPOTS = ['bush', 'stump', 'tent', 'rock', 'leaves', 'log', 'snowman', 'drift'];
  const files = {};
  ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'cover', 'peek', 'full_wave'].forEach(f => { files['pip_' + f] = D + 'characters/pip_' + f + '.svg'; });
  files.critter = D + 'characters/critter.svg'; files.critter_pop = D + 'characters/critter_pop.svg';
  (FC.ANIMALS || ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'])
    .forEach(a => { files['animal_' + a] = D + 'items/animal_' + a + '.svg'; files['animal_' + a + '_wave'] = D + 'items/animal_' + a + '_wave.svg'; });
  A_SPOTS.forEach(k => { files['spot_' + k] = D + 'spots/' + k + '.svg'; files['spot_' + k + '_open'] = D + 'spots/' + k + '_open.svg'; });
  files.star = D + 'ui/star.svg'; files.star_empty = D + 'ui/star_empty.svg'; files.icon = D + 'icon.svg';
  ['spring', 'summer', 'autumn', 'winter'].forEach(t => ['mountains', 'forest', 'meadow'].forEach(l => { files[l + '_' + t] = D + 'env/' + l + '_' + t + '.svg'; }));
  ['campfire', 'bench', 'tent_bg', 'lantern', 'sun', 'cloud_a', 'cloud_b', 'cloud_c'].forEach(e => { files[e] = D + 'env/' + e + '.svg'; });
  ['petal', 'leaf_a', 'leaf_b', 'snow', 'seed', 'sparkle', 'star', 'puff', 'dust', 'confetti_a', 'confetti_b']
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
    files, images: {}, _cache: new Map(), loaded: 0, total: 0, missing: [], spots: null,
    async load(onProgress) {
      const names = Object.keys(files);
      this.total = names.length;
      const meta = fetch(D + 'spots/spots.json').then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => { this.spots = j; });
      await Promise.all([meta].concat(names.map(async n => {
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
    /* A white/grey sprite tinted with a colour (confetti in the balloon's colour). */
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
  FC.Assets = A;
})(window.FC = window.FC || {});
