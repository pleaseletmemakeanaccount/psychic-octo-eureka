// localStorage is not always usable: iOS Safari throws SecurityError on file://
// pages, private browsing can throw QuotaExceededError on write, and some
// sandboxed webviews disable it outright. A thrown read at boot used to abort the
// React mount and leave a black screen, and a thrown write could crash the game on
// death. Everything here degrades to an in-memory map so progress simply does not
// survive a reload instead of taking the game down.
const memory = new Map<string, string>();

function backing(): Storage | null {
  try {
    const store = window.localStorage;
    // Touch it: some webviews only throw on access, not on the property lookup.
    store.getItem("ernas_probe");
    return store;
  } catch {
    return null;
  }
}

export const safeStorage = {
  getItem(key: string): string | null {
    const store = backing();
    if (store) {
      try {
        return store.getItem(key);
      } catch {
        /* fall through to memory */
      }
    }
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    memory.set(key, value);
    const store = backing();
    if (!store) return;
    try {
      store.setItem(key, value);
    } catch {
      /* memory keeps the value for this session */
    }
  },
  removeItem(key: string): void {
    memory.delete(key);
    const store = backing();
    if (!store) return;
    try {
      store.removeItem(key);
    } catch {
      /* nothing else to do */
    }
  },
};
