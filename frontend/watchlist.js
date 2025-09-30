(function () {
  const STORAGE_KEY = 'osrs-hiscores:watchlist';
  const MAX_ENTRIES = 50;
  const subscribers = new Set();
  let cache = readFromStorage();

  function cloneEntries(list = cache) {
    return list.map((item) => ({ ...item }));
  }

  function emit() {
    const snapshot = cloneEntries();
    subscribers.forEach((fn) => {
      try { fn(snapshot); } catch (_) { /* noop */ }
    });
  }

  function readFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => {
          if (!item || typeof item.username !== 'string') return null;
          const normalized = normalizeUsername(item.username);
          if (!normalized) return null;
          return {
            username: normalized.display,
            id: normalized.id,
            addedAt: Number(item.addedAt) || Date.now()
          };
        })
        .filter(Boolean)
        .slice(0, MAX_ENTRIES);
    } catch (_) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (err) {
      if (typeof window !== 'undefined' && typeof window.toast === 'function') {
        try { window.toast('Unable to save watchlist (storage is unavailable)', 'error'); } catch (_) { /* noop */ }
      }
    }
  }

  function normalizeUsername(name) {
    if (!name || typeof name !== 'string') return null;
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (!trimmed) return null;
    if (trimmed.length > 12) return null;
    const valid = /^[a-zA-Z0-9 _-]+$/.test(trimmed);
    if (!valid) return null;
    return {
      id: trimmed.toLowerCase(),
      display: trimmed
    };
  }

  function ensureCache() {
    if (!Array.isArray(cache)) cache = [];
  }

  function findIndexById(id) {
    ensureCache();
    return cache.findIndex((item) => item.id === id);
  }

  function add(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      return { ok: false, error: 'Enter a valid player name (letters, numbers, spaces, - or _) with max 12 characters.' };
    }
    ensureCache();
    if (cache.length >= MAX_ENTRIES) {
      return { ok: false, error: `Watchlist full. Remove a player before adding more (limit ${MAX_ENTRIES}).` };
    }
    const existingIdx = findIndexById(normalized.id);
    if (existingIdx >= 0) {
      const existing = cache[existingIdx];
      if (existing.username !== normalized.display) {
        existing.username = normalized.display;
        persist();
        emit();
      }
      return { ok: false, error: 'Player is already on your watchlist.' };
    }
    const entry = { username: normalized.display, id: normalized.id, addedAt: Date.now() };
    cache = [...cache, entry];
    persist();
    emit();
    return { ok: true, entry };
  }

  function remove(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return { ok: false };
    const idx = findIndexById(normalized.id);
    if (idx === -1) return { ok: false };
    cache = [...cache.slice(0, idx), ...cache.slice(idx + 1)];
    persist();
    emit();
    return { ok: true };
  }

  function clear() {
    cache = [];
    persist();
    emit();
    return { ok: true };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.add(fn);
    try { fn(cloneEntries()); } catch (_) { /* noop */ }
    return () => subscribers.delete(fn);
  }

  function getAll() {
    return cloneEntries();
  }

  function isTracked(username) {
    const normalized = normalizeUsername(username);
    if (!normalized) return false;
    return findIndexById(normalized.id) !== -1;
  }

  window.watchlistStore = {
    add,
    remove,
    clear,
    getAll,
    subscribe,
    isTracked,
    _debug: () => cloneEntries()
  };
})();
