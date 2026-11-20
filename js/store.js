// localStorage persistence. Every access is guarded: a private window or blocked storage
// must never break the exam — it only loses the saved progress.
(function (root) {
  'use strict';
  const KEY = 'toeic-foundation-quest:v1';
  root.TQStore = {
    KEY,
    load() {
      try { const raw = root.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    save(state) {
      try { root.localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
    },
    clear() { try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  };
}(typeof self !== 'undefined' ? self : this));
