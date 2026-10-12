// localStorage throws instead of returning null on some platforms — Safari blocks it for
// pages opened straight from the filesystem (file://) and in private browsing. A blocked
// store must never take the game down, so every read/write goes through here and falls
// back to an in-memory map that lives for the session.
const memory = new Map<string, string>();

function backing(): Storage | null {
  try {
    const ls = window.localStorage;
    if (!ls) return null;
    const probe = "__ernas_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

let resolved: Storage | null | undefined;

function store(): Storage | null {
  if (resolved === undefined) resolved = backing();
  return resolved;
}

export function readSet(key: string): string | null {
  const ls = store();
  if (ls) {
    try {
      return ls.getItem(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memory.get(key) ?? null;
}

export function readFlag(key: string): boolean {
  return readSet(key) === "1";
}

export function writeSet(key: string, value: string) {
  memory.set(key, value);
  const ls = store();
  if (!ls) return;
  try {
    ls.setItem(key, value);
  } catch {
    /* quota exceeded or blocked — memory copy already holds it */
  }
}

export function writeFlag(key: string) {
  writeSet(key, "1");
}

export function dropKey(key: string) {
  memory.delete(key);
  const ls = store();
  if (!ls) return;
  try {
    ls.removeItem(key);
  } catch {
    /* ignore */
  }
}
