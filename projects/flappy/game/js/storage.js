/* FF.Storage — tiny key/value store.
 * In the Windows app it is backed by files in %APPDATA%\FamilyFlappy\data (via functions the
 * Go host binds: ffStoreAll / ffStoreSet / ffStoreDel). In a plain browser it falls back to
 * localStorage. Values are strings; helpers for JSON. All reads come from an in-memory cache. */
(function (FF) {
  'use strict';
  const PREFIX = 'ff:';
  const S = {
    native: false,
    cache: {},
    async init() {
      this.native = typeof window.ffStoreSet === 'function' && typeof window.ffStoreAll === 'function';
      if (this.native) {
        try { this.cache = (await window.ffStoreAll()) || {}; }
        catch (e) { console.warn('native store failed, using localStorage', e); this.native = false; }
      }
      if (!this.native) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(PREFIX)) this.cache[k.slice(PREFIX.length)] = localStorage.getItem(k);
          }
        } catch (e) { /* storage blocked: memory only */ }
      }
    },
    get(k, def) { return Object.prototype.hasOwnProperty.call(this.cache, k) ? this.cache[k] : def; },
    getJSON(k, def) { try { const v = this.get(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) {
      v = String(v);
      this.cache[k] = v;
      if (this.native) { Promise.resolve(window.ffStoreSet(k, v)).catch(e => console.warn('store set', k, e)); return; }
      try { localStorage.setItem(PREFIX + k, v); }
      catch (e) { console.warn('localStorage full or blocked', e); }
    },
    setJSON(k, v) { this.set(k, JSON.stringify(v)); },
    del(k) {
      delete this.cache[k];
      if (this.native) { Promise.resolve(window.ffStoreDel(k)).catch(() => {}); return; }
      try { localStorage.removeItem(PREFIX + k); } catch (e) {}
    }
  };
  FF.Storage = S;
})(window.FF = window.FF || {});
