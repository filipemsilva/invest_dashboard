/**
 * priceCache.js
 *
 * Persistent price cache using localStorage.
 * Falls back to in-memory only if localStorage is unavailable.
 *
 * Cache TTL: 30 minutes (configurable via PRICE_CACHE_TTL_MS)
 */

export const PRICE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const LS_KEY = 'invest_dashboard_price_cache';

// In-memory fallback (also used as a write-through layer for speed)
let memCache = {};

// ---------------------------------------------------------------------------
// Load from localStorage on startup
// ---------------------------------------------------------------------------
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Validate shape
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Persist the full cache to localStorage
// ---------------------------------------------------------------------------
function saveToStorage(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or unavailable — ignore
  }
}

// Initialise memCache from localStorage immediately
memCache = loadFromStorage();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a cached entry. Returns null if missing or expired.
 */
export function getCached(ticker, now = Date.now()) {
  const entry = memCache[ticker];
  if (!entry) return null;
  if (now - entry.ts > PRICE_CACHE_TTL_MS) return null;
  return entry;
}

/**
 * Write an entry to cache (in-memory + localStorage).
 */
export function setCached(ticker, data) {
  const entry = { ...data, ts: Date.now() };
  memCache[ticker] = entry;
  saveToStorage(memCache);
  return entry;
}

/**
 * Returns all currently cached tickers (even expired).
 */
export function getAllCached() {
  return { ...memCache };
}

/**
 * Returns the age in milliseconds of the oldest entry among the given tickers,
 * or Infinity if none are cached.
 */
export function oldestAge(tickers, now = Date.now()) {
  let oldest = 0;
  for (const t of tickers) {
    const entry = memCache[t];
    if (entry) {
      const age = now - entry.ts;
      if (age > oldest) oldest = age;
    }
  }
  return oldest;
}

/**
 * Returns a Date representing when the cache was last written,
 * or null if nothing is cached.
 */
export function lastCacheWrite(tickers) {
  let latest = null;
  for (const t of tickers) {
    const entry = memCache[t];
    if (entry) {
      const d = new Date(entry.ts);
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

/**
 * Clear all cache entries (in-memory + localStorage).
 */
export function clearCache() {
  memCache = {};
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}
