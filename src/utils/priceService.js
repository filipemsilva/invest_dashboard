/**
 * priceService.js  — Global singleton for all price fetching.
 *
 * Architecture: the browser NEVER contacts Yahoo Finance or public proxies.
 * All requests go to the backend proxy (/api/..., /health) which handles
 * Yahoo Finance on the server side with proper headers and chunking.
 *
 * In development: Vite's server.proxy forwards /api and /health to
 *   localhost:3001 transparently (configured in vite.config.js).
 * In production: nginx forwards the same paths to 127.0.0.1:3001.
 * Either way, the frontend always uses relative paths — no hardcoded URLs.
 *
 * Features:
 *  ✓ Single batch request for all tickers (/api/charts)
 *  ✓ Individual fallback for missed tickers (/api/chart/:sym)
 *  ✓ Exponential backoff per ticker (2s → 4s → 8s … up to 10 min)
 *  ✓ Hard give-up after MAX_RETRIES; manual refresh resets state
 *  ✓ Force-refresh queued (not raced) against running fetch
 *  ✓ Reference-counted tickers; cleaned up when component unmounts
 *  ✓ Stable snapshot reference (no unnecessary re-renders)
 *  ✓ HTTP 429 detection → long penalty delay
 */
import {
  getCached,
  setCached,
  getAllCached,
  PRICE_CACHE_TTL_MS,
} from './priceCache';

// ─── Config ───────────────────────────────────────────────────────────────────
const LOCAL_PROXY = import.meta.env.VITE_API_URL ?? '';
// Dev  (.env.development): VITE_API_URL=''  → relative paths, forwarded by Vite's server.proxy
// Prod (.env.production):  VITE_API_URL='https://investimentos-api.duckdns.org' → cross-origin API subdomain

const MAX_RETRIES       = 3;
const BACKOFF_BASE      = 2_000;        // 2 s initial backoff
const BACKOFF_MAX       = 10 * 60_000;  // 10 min ceiling
const RATE_LIMIT_PENALTY = 90_000;      // 90 s when Yahoo returns 429
// Timeout long enough for 68 tickers × chunked server-side fetch
const BATCH_TIMEOUT_MS  = 60_000;       // 1 min
const SINGLE_TIMEOUT_MS =  8_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt) {
  return Math.min(BACKOFF_BASE * 2 ** (attempt - 1), BACKOFF_MAX);
}

// ─── Sentinel error for HTTP 429 ─────────────────────────────────────────────
class RateLimitError extends Error {
  constructor(retryAfter) {
    super('rate-limited');
    this.penaltyMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : RATE_LIMIT_PENALTY;
  }
}

// ─── Local proxy — the ONLY network target ───────────────────────────────────
// Checks /health (no Yahoo call) so startup is fast and reliable.
let _proxyAvailable   = null;   // null = unchecked
let _proxyCheckedAt   = 0;
const PROXY_RECHECK_MS = 30_000; // re-verify every 30 s

async function isProxyUp() {
  const now = Date.now();
  // Re-check periodically so we recover if the proxy restarts
  if (_proxyAvailable !== null && now - _proxyCheckedAt < PROXY_RECHECK_MS) {
    return _proxyAvailable;
  }
  try {
    const res = await fetch(`${LOCAL_PROXY}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    _proxyAvailable = res.ok;
  } catch {
    _proxyAvailable = false;
  }
  _proxyCheckedAt = Date.now();
  if (!_proxyAvailable) {
    console.error(
      '[priceService] ❌ Local proxy not reachable at ' + LOCAL_PROXY + '\n' +
      '  Start it with: npm run dev'
    );
  }
  return _proxyAvailable;
}

// ─── Response parser (v8/chart meta → normalised object) ─────────────────────
function parseChartMeta(meta) {
  if (!meta) return null;
  const price = meta.regularMarketPrice ?? meta.previousClose ?? null;
  if (!price) return null;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
  return {
    price,
    currency:      meta.currency || 'USD',
    name:          meta.longName || meta.shortName || null,
    changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
  };
}

// ─── Batch fetch — ONE request for ALL tickers ───────────────────────────────
/**
 * Calls /api/charts on the local proxy.
 * The proxy handles chunking server-side (10 tickers per wave, 200 ms gap).
 * Returns { SYM: data, … } for every successfully resolved ticker, or null
 * if the proxy is down.
 */
async function fetchBatch(symbols) {
  if (!(await isProxyUp())) return null;

  const query = symbols.map(encodeURIComponent).join(',');
  let res;
  try {
    res = await fetch(`${LOCAL_PROXY}/api/charts?symbols=${query}`, {
      signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
    });
  } catch {
    _proxyAvailable = false; // proxy died mid-request
    return null;
  }

  if (res.status === 429 || res.headers.get('X-Rate-Limited') === 'true') {
    throw new RateLimitError(res.headers.get('retry-after'));
  }
  if (!res.ok) return null;

  return res.json(); // { SYM: { price, currency, name, changePercent }, … }
}

// ─── Individual fetch — fallback for tickers the batch missed ─────────────────
async function fetchSingle(symbol) {
  if (!(await isProxyUp())) return null;

  let res;
  try {
    res = await fetch(
      `${LOCAL_PROXY}/api/chart/${encodeURIComponent(symbol)}`,
      { signal: AbortSignal.timeout(SINGLE_TIMEOUT_MS) }
    );
  } catch {
    _proxyAvailable = false;
    return null;
  }

  if (res.status === 429) throw new RateLimitError(res.headers.get('retry-after'));
  if (!res.ok) return null;

  const json = await res.json();
  return parseChartMeta(json?.chart?.result?.[0]?.meta);
}

// ─── Price Service singleton ──────────────────────────────────────────────────
class PriceService {
  constructor() {
    this._subscribers      = new Set();
    this._registeredTickers = new Set();
    this._tickerRefs       = {};    // { ticker: refCount }
    this._isFetching       = false;
    this._pendingForce     = null;  // queued force-refresh list
    this._debounceTimer    = null;
    this._loading          = false;
    this._error            = '';
    this._lastUpdated      = null;
    this._rateLimitedUntil = 0;
    this._failures         = {};    // { ticker: { count, nextRetryAt } }
    this._snapshot         = null;  // memoised snapshot
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  subscribe(fn) {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  registerTickers(tickers) {
    tickers.forEach((t) => {
      this._tickerRefs[t] = (this._tickerRefs[t] ?? 0) + 1;
      this._registeredTickers.add(t);
    });
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._checkAndFetch(), 150);
  }

  unregisterTickers(tickers) {
    tickers.forEach((t) => {
      const count = (this._tickerRefs[t] ?? 1) - 1;
      if (count <= 0) {
        this._registeredTickers.delete(t);
        delete this._tickerRefs[t];
        delete this._failures[t];
      } else {
        this._tickerRefs[t] = count;
      }
    });
  }

  /** Force-refresh bypasses the cache TTL. Queued if a fetch is running. */
  refresh(tickers) {
    const target = tickers ?? Array.from(this._registeredTickers);
    target.forEach((t) => { this._failures[t] = { count: 0, nextRetryAt: 0 }; });
    this._rateLimitedUntil = 0;
    _proxyAvailable = null; // re-check proxy on next fetch

    if (this._isFetching) {
      this._pendingForce = target;
      return;
    }
    this._doFetch(target, true);
  }

  /** Stable snapshot — same object reference until data changes. */
  getSnapshot() {
    if (this._snapshot) return this._snapshot;
    this._snapshot = {
      allPrices:   getAllCached(),
      loading:     this._loading,
      error:       this._error,
      lastUpdated: this._lastUpdated,
    };
    return this._snapshot;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _invalidateSnapshot() { this._snapshot = null; }

  _notify() {
    this._invalidateSnapshot();
    const snap = this.getSnapshot();
    this._subscribers.forEach((fn) => fn(snap));
  }

  _canRetry(ticker) {
    const f = this._failures[ticker];
    if (!f || f.count === 0) return true;
    if (f.count >= MAX_RETRIES) return false;
    return Date.now() >= f.nextRetryAt;
  }

  _earliestRetryDelay() {
    const now = Date.now();
    let earliest = null;
    for (const t of this._registeredTickers) {
      if (getCached(t, now)) continue;
      const f = this._failures[t];
      if (!f || f.count >= MAX_RETRIES) continue;
      const delay = Math.max(0, f.nextRetryAt - now);
      if (earliest === null || delay < earliest) earliest = delay;
    }
    return earliest;
  }

  async _checkAndFetch() {
    if (this._isFetching) return;

    // Rate-limit window: wait until it expires
    if (Date.now() < this._rateLimitedUntil) {
      setTimeout(
        () => this._checkAndFetch(),
        this._rateLimitedUntil - Date.now() + 500
      );
      return;
    }

    const now     = Date.now();
    const expired = Array.from(this._registeredTickers).filter(
      (t) => !getCached(t, now) && this._canRetry(t)
    );
    if (expired.length > 0) this._doFetch(expired);
  }

  async _doFetch(tickers, force = false) {
    if (this._isFetching && !force) return;

    // Verify proxy is up before starting; give immediate feedback if not
    if (!(await isProxyUp())) {
      this._error =
          '⚠️ Servidor proxy não acessível. Garante que o proxy está a correr.';
      this._notify();
      return;
    }

    this._isFetching = true;
    this._loading    = true;
    this._error      = '';
    this._notify();

    try {
      // ── Stage 1: one batch call for all tickers ────────────────────────────
      let failedTickers = [...tickers];

      try {
        const batchResult = await fetchBatch(tickers);
        if (batchResult) {
          for (const [sym, data] of Object.entries(batchResult)) {
            setCached(sym, data);
            this._failures[sym] = { count: 0, nextRetryAt: 0 };
          }
          failedTickers = tickers.filter((t) => !batchResult[t]);
          this._notify(); // show results as soon as batch resolves
        }
      } catch (e) {
        if (e instanceof RateLimitError) {
          this._rateLimitedUntil = Date.now() + e.penaltyMs;
          this._error = `Limite de pedidos atingido. A aguardar ${Math.ceil(e.penaltyMs / 1000)}s…`;
          return; // bail; finally will reschedule
        }
        // Other error (proxy died etc.) → skip to individual fallback
      }

      // ── Stage 2: individual retry for tickers the batch missed ────────────
      if (failedTickers.length > 0) {
        await this._fetchIndividuallyWithDelay(failedTickers);
      }

      this._lastUpdated = new Date();

      const successCount = tickers.filter((t) => !!getCached(t)).length;
      if (successCount === 0 && tickers.length > 0) {
        this._error =
          'Não foi possível obter cotações. Verifica se o servidor proxy está ativo.';
      }
    } catch {
      this._error = 'Erro inesperado ao obter cotações.';
    } finally {
      this._isFetching = false;
      this._loading    = false;
      this._notify();

      // Queued force-refresh (Fix #4)
      if (this._pendingForce) {
        const pending = this._pendingForce;
        this._pendingForce = null;
        setTimeout(() => this._doFetch(pending, true), 100);
        return;
      }

      // Schedule next retry at earliest backoff time (Fix #2)
      const delay = this._earliestRetryDelay();
      if (delay !== null) {
        setTimeout(() => this._checkAndFetch(), delay + 200);
      }
    }
  }

  async _fetchIndividuallyWithDelay(tickers) {
    const DELAY_MS   = 400;
    const CHUNK_SIZE = 3;

    for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
      const chunk   = tickers.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((sym) => fetchSingle(sym))
      );

      for (let j = 0; j < chunk.length; j++) {
        const sym = chunk[j];
        const res = results[j];

        if (res.status === 'fulfilled' && res.value) {
          setCached(sym, res.value);
          this._failures[sym] = { count: 0, nextRetryAt: 0 };
        } else {
          if (res.reason instanceof RateLimitError) {
            this._rateLimitedUntil = Date.now() + res.reason.penaltyMs;
            this._error = 'Limite de pedidos atingido. A aguardar…';
            return;
          }
          // Exponential backoff for this ticker
          const prev  = this._failures[sym] ?? { count: 0 };
          const count = prev.count + 1;
          this._failures[sym] = {
            count,
            nextRetryAt: Date.now() + backoffMs(count),
          };
          if (count >= MAX_RETRIES) {
            console.warn(
              `[priceService] "${sym}" falhou ${MAX_RETRIES}× — ` +
              `a desistir (usa o botão Atualizar para tentar de novo).`
            );
          }
        }
      }

      this._notify();
      if (i + CHUNK_SIZE < tickers.length) await sleep(DELAY_MS);
    }
  }
}

export const priceService = new PriceService();
