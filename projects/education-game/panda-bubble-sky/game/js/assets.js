/* PB.Assets (Bao's Bubble Sky) — loads the SVG art and keeps pre-rasterized copies so drawing stays fast on phones.
 * Keys are the file paths under assets/default/ without ".svg": 'characters/bao_idle', 'characters/bird', 'animals/cow',
 * 'env/far_spring', 'env/cushion_winter', 'particles/snow', 'ui/star', 'icon' … (bubble_art.js looks up 'animals/<a>').
 * Short aliases are kept for the HUD / render / weather: 'star' = ui/star, 'pstar' = particles/star, '<particle>' = particles/<particle>.
 *   has(key)  img(key)  images[key]  sprite(key, px) → canvas whose longest side ≥ px device px (size buckets 32·1.25^k)
 *   exact(key, w, h) → one exact-size raster (tiled env layers)   tinted(key, colour, px)   dropExact()
 * Bubbles, the things inside them, the rainbow, drops, home badges, snowflakes and the hint hand are canvas code
 * (bubble_art.js), not files. */
(function (PB) {
  'use strict';
  const D = 'assets/default/';
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  const PARTICLES = ['mist', 'mote', 'sparkle', 'star', 'firefly', 'petal', 'blossom', 'butterfly', 'leaf', 'snow', 'glint',
    'confetti_a', 'confetti_b', 'dot', 'dust', 'feather'];
  const BAO = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'blow', 'wave', 'giggle', 'dance', 'title'];
  const files = {};
  const add = k => { files[k] = D + k + '.svg'; };
  BAO.forEach(f => add('characters/bao_' + f));
  ['bird', 'bird_flap', 'kite'].forEach(f => add('characters/' + f));
  ANIMALS.forEach(a => add('animals/' + a));   // only the standing frame is drawn inside a bubble
  SEASONS.forEach(m => ['far', 'mid', 'ground', 'cushion'].forEach(l => add('env/' + l + '_' + m)));
  ['sun', 'moon', 'cloud_a', 'cloud_b'].forEach(f => add('env/' + f));
  PARTICLES.forEach(p => add('particles/' + p));
  add('ui/star'); add('ui/star_empty'); add('icon');
  // aliases (render / weather sprite names)
  const ALIAS = { star: 'ui/star', star_empty: 'ui/star_empty', pstar: 'particles/star' };
  PARTICLES.forEach(p => { if (p !== 'star') ALIAS[p] = 'particles/' + p; });

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
  const key = k => (ALIAS[k] && !files[k] ? ALIAS[k] : k);

  const A = {
    files, ALIAS, ANIMALS, SEASONS, images: {}, _cache: new Map(), loaded: 0, total: 0, missing: [],
    async load(onProgress) {
      const names = Object.keys(files);
      this.total = names.length;
      await Promise.all(names.map(async n => {
        this.images[n] = await loadImage(files[n]);
        this.loaded++;
        if (onProgress) onProgress(this.loaded / this.total);
      }));
      for (const a in ALIAS) if (!this.images[a]) this.images[a] = this.images[ALIAS[a]];
    },
    has(name) { return !!this.images[key(name)]; },
    img(name) { return this.images[key(name)] || null; },
    size(name) { const i = this.images[key(name)]; return i ? [i.naturalWidth || i.width, i.naturalHeight || i.height] : [1, 1]; },
    /* Rasterized sprite with longest side ≥ px (device pixels). Buckets: 32·1.25^k. */
    sprite(name, px) {
      name = key(name);
      const img = this.images[name];
      if (!img) return null;
      let b = 32; while (b < px) b = Math.ceil(b * 1.25);
      b = Math.min(b, 2048);
      const k0 = name + '@' + b;
      let c = this._cache.get(k0);
      if (!c) {
        const [iw, ih] = this.size(name);
        const k = b / Math.max(iw, ih);
        c = makeCanvas(iw * k, ih * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        this._cache.set(k0, c);
        if (this._cache.size > 320) this._cache.delete(this._cache.keys().next().value);
      }
      return c;
    },
    /* Exact-size raster (for full-width tiled layers). */
    exact(name, w, h) {
      name = key(name);
      const img = this.images[name];
      if (!img) return null;
      const k0 = name + '#' + w + 'x' + h;
      let c = this._cache.get(k0);
      if (!c) { c = makeCanvas(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h); this._cache.set(k0, c); }
      return c;
    },
    /* A white / grey sprite tinted with a colour (paint dots, confetti, motes). */
    tinted(name, color, px) {
      const base = this.sprite(name, px);
      if (!base) return null;
      const k0 = key(name) + '~' + color + '@' + base.width;
      let c = this._cache.get(k0);
      if (!c) {
        c = makeCanvas(base.width, base.height);
        const g = c.getContext('2d');
        g.drawImage(base, 0, 0);
        g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(base, 0, 0);
        this._cache.set(k0, c);
      }
      return c;
    },
    dropExact() { for (const k of [...this._cache.keys()]) if (k.includes('#')) this._cache.delete(k); },
    makeCanvas
  };
  PB.Assets = A;
})(window.PB = window.PB || {});
