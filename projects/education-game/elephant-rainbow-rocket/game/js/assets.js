/* RR.Assets (Bim's Rainbow Rocket) — loads the SVG art and keeps pre-rasterized copies so drawing stays fast on phones.
 * sprite(name, px) returns a canvas whose longest side is ≥ px device pixels (rounded up to a size
 * bucket, so a handful of bitmaps serve every zoom level). */
(function (RR) {
  'use strict';
  const D = 'assets/default/';
  const files = {};
  ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'].forEach(f => { files['bim_' + f] = D + 'characters/bim_' + f + '.svg'; });
  ['wave', 'cheer'].forEach(f => { files['bim_full_' + f] = D + 'characters/bim_full_' + f + '.svg'; });
  files.rocket_back = D + 'characters/rocket_back.svg'; files.rocket_front = D + 'characters/rocket_front.svg';
  files.wagon_back = D + 'items/wagon_back.svg'; files.wagon_front = D + 'items/wagon_front.svg';
  (RR.ANIMALS || ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'])
    .forEach(a => { files['animal_' + a] = D + 'items/animal_' + a + '.svg'; files['animal_' + a + '_wave'] = D + 'items/animal_' + a + '_wave.svg'; });
  files.star = D + 'ui/star.svg'; files.star_empty = D + 'ui/star_empty.svg'; files.icon = D + 'icon.svg';
  ['morning', 'noon', 'sunset', 'night'].forEach(t => { files['hills_' + t] = D + 'env/hills_' + t + '.svg'; });
  ['cloud_a', 'cloud_b', 'cloud_c', 'cloud_d', 'cloud_e', 'cloudbank', 'rainbow', 'sun', 'moon', 'planet_a', 'planet_b', 'planet_c']
    .forEach(e => { files[e] = D + 'env/' + e + '.svg'; });
  ['sparkle', 'star', 'puff', 'dust', 'confetti_a', 'confetti_b']
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
  RR.Assets = A;
})(window.RR = window.RR || {});
