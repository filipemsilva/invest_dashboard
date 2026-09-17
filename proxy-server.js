/**
 * proxy-server.js
 *
 * Local proxy server: receives requests from the Vite frontend and forwards
 * them to Yahoo Finance on the server side (no CORS, no public proxies).
 *
 * Endpoints:
 *   GET /health                       → liveness probe (no Yahoo call)
 *   GET /api/chart/:symbol            → single ticker  (v8/finance/chart)
 *   GET /api/charts?symbols=A,B,C,…  → batch of any size
 *   GET /api/historical?ticker=AAPL&year=2023 → last close on/before 31 Dec
 *
 * Batch strategy for large portfolios (e.g. 68 tickers):
 *   - Splits the list into chunks of CHUNK_SIZE (default 10)
 *   - Each chunk is fetched fully in parallel on the server
 *   - Waits CHUNK_DELAY ms between chunks to respect Yahoo's rate limits
 *   - Returns a flat map { SYM: { price, currency, name, changePercent } }
 *     for every ticker that was successfully resolved
 *
 * Caching:
 *   - In-memory cache (per symbol), TTL below. Shared across all clients
 *     hitting this proxy (multiple browser tabs, etc.), unlike the
 *     frontend's localStorage cache which is per-browser only.
 *
 * Start: npm run dev   (starts this proxy + the Vite dev server together)
 */

import express from 'express';

const app = express();
const PORT = 3001;

// Tune these if Yahoo starts rate-limiting you
const CHUNK_SIZE = 10;   // tickers fetched in parallel per chunk
const CHUNK_DELAY = 200;  // ms between chunks
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min server-side cache

// ─── CORS ──────────────────────────────────────────────────────────────────────
// Required in production: the frontend (filipeinv.duckdns.org) and the API
// (investimentos-api.duckdns.org) are on different origins.
// Dev: Vite's server.proxy makes requests same-origin, so this header is
// ignored locally — but having it here doesn't hurt.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://filipeinv.duckdns.org';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Vary', 'Origin');
  next();
});

// ─── Yahoo Finance request headers ────────────────────────────────────────────
const YF_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
};

// ─── In-memory cache ───────────────────────────────────────────────────────────
// Map<symbol, { data: {price, currency, name, changePercent}, expiresAt: number }>
const priceCache = new Map();

function getCachedPrice(sym) {
  const entry = priceCache.get(sym);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    priceCache.delete(sym);
    return null;
  }
  return entry.data;
}

function setCachedPrice(sym, data) {
  priceCache.set(sym, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Core Yahoo Finance fetcher ───────────────────────────────────────────────
/**
 * Fetches a single symbol from Yahoo Finance v8/chart.
 * Returns { ok: true, sym, data } on success, { ok: false, sym } on failure.
 * Tries query1 first, then query2 as fallback.
 * Uses Node's native global fetch (Node 18+) — no node-fetch dependency needed.
 */
async function fetchChart(sym) {
  const enc = encodeURIComponent(sym);

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=1d`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: YF_HEADERS,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 429) return { ok: false, sym, rateLimited: true };
      if (res.ok) return { ok: true, sym, data: await res.json() };
      console.warn(`[fetchChart] ${sym}: HTTP ${res.status} from ${url}`);
    } catch (err) {
      console.warn(`[fetchChart] ${sym}: ${err.message} (${url})`);
      // timeout or network error — try next URL
    }
  }
  return { ok: false, sym };
}

/** Parses a v8/chart response into our normalised price object. */
function parseMeta(meta) {
  if (!meta) return null;
  const price = meta.regularMarketPrice ?? meta.previousClose ?? null;
  if (!price) return null;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
  return {
    price,
    currency: meta.currency || 'USD',
    name: meta.longName || meta.shortName || null,
    changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
  };
}

// ─── /health — liveness probe (does NOT call Yahoo Finance) ───────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), cacheSize: priceCache.size });
});

// ─── /api/chart/:symbol ───────────────────────────────────────────────────────
app.get('/api/chart/:symbol', async (req, res) => {
  const { symbol } = req.params;

  const cached = getCachedPrice(symbol);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ chart: { result: [{ meta: cached }] } });
  }

  const result = await fetchChart(symbol);

  if (!result.ok) {
    const status = result.rateLimited ? 429 : 502;
    return res
      .status(status)
      .json({ error: result.rateLimited ? 'rate-limited' : 'Yahoo Finance unavailable' });
  }

  const parsed = parseMeta(result.data?.chart?.result?.[0]?.meta);
  if (parsed) setCachedPrice(symbol, parsed);

  res.setHeader('X-Cache', 'MISS');
  res.json(result.data);
});

// ─── /api/charts?symbols=AAPL,MSFT,… ─────────────────────────────────────────
// Handles any number of tickers via server-side chunking.
// Returns: { AAPL: { price, currency, name, changePercent }, MSFT: {…}, … }
// Tickers that failed are simply omitted from the response map.
app.get('/api/charts', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: '"symbols" query param required' });

  const list = symbols
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length === 0) return res.json({});

  const map = {};
  let rateLimitHit = false;

  // Serve whatever we already have cached, only fetch the rest
  const toFetch = [];
  for (const sym of list) {
    const cached = getCachedPrice(sym);
    if (cached) {
      map[sym] = cached;
    } else {
      toFetch.push(sym);
    }
  }

  // Process in chunks so we don't send N requests simultaneously to Yahoo
  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    if (rateLimitHit) break; // stop starting new chunks once we've been limited

    const chunk = toFetch.slice(i, i + CHUNK_SIZE);

    // All tickers in a chunk are fetched in parallel (server-side, no CORS)
    const results = await Promise.allSettled(
      chunk.map((sym) => fetchChart(sym))
    );

    // Important: process every settled result in this chunk before deciding
    // whether to stop. A rate-limit on one ticker must NOT discard successful
    // results for other tickers that resolved in the same chunk.
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { ok, sym, data, rateLimited } = r.value;
      if (rateLimited) {
        rateLimitHit = true;
        continue;
      }
      if (!ok) continue;
      const parsed = parseMeta(data?.chart?.result?.[0]?.meta);
      if (parsed) {
        map[sym] = parsed;
        setCachedPrice(sym, parsed);
      }
    }

    // Pause between chunks (not after the last one, not once rate-limited)
    if (i + CHUNK_SIZE < toFetch.length && !rateLimitHit) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY));
    }
  }

  if (rateLimitHit) {
    // Return whatever we managed to fetch; include a header so the client knows
    res.setHeader('X-Rate-Limited', 'true');
  }

  res.json(map);
});

// ─── /api/historical?ticker=AAPL&year=2023 ───────────────────────────────────
// Fetches the last closing price on or before 31 Dec of the requested year.
// Returns: { price, currency } or 404 if no data found.
app.get('/api/historical', async (req, res) => {
  const { ticker, year } = req.query;
  if (!ticker || !year) {
    return res.status(400).json({ error: '"ticker" and "year" params required' });
  }

  const y = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(y) || y < 1970 || y > currentYear) {
    return res.status(400).json({ error: `"year" must be an integer between 1970 and ${currentYear}` });
  }

  const enc = encodeURIComponent(ticker);

  // Window: 27 Dec → 3 Jan next year (captures last trading day of the year)
  const p1 = Math.floor(new Date(y, 11, 27).getTime() / 1000);
  const p2 = Math.floor(new Date(y + 1, 0, 3).getTime() / 1000);

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&period1=${p1}&period2=${p2}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&period1=${p1}&period2=${p2}`,
  ];

  for (const url of urls) {
    try {
      const upstream = await fetch(url, {
        headers: YF_HEADERS,
        signal: AbortSignal.timeout(10_000),
      });
      if (upstream.status === 429) return res.status(429).json({ error: 'rate-limited' });
      if (!upstream.ok) {
        console.warn(`[historical] ${ticker}: HTTP ${upstream.status} from ${url}`);
        continue;
      }

      const json = await upstream.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const currency = result.meta?.currency || 'USD';
      const dec31 = Math.floor(new Date(y, 11, 31, 23, 59, 59).getTime() / 1000);

      let lastPrice = null;
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] <= dec31 && closes[i] != null) lastPrice = closes[i];
      }

      if (lastPrice !== null) return res.json({ price: lastPrice, currency });
    } catch (err) {
      console.warn(`[historical] ${ticker}: ${err.message} (${url})`);
      // try next URL
    }
  }

  res.status(404).json({ error: 'No historical data found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`✅ Yahoo Finance proxy → http://localhost:${PORT}`);
  console.log(`   GET /health`);
  console.log(`   GET /api/chart/:symbol`);
  console.log(`   GET /api/charts?symbols=AAPL,MSFT,…   (chunks of ${CHUNK_SIZE}, ${CHUNK_DELAY}ms delay)`);
  console.log(`   GET /api/historical?ticker=AAPL&year=2023`);
  console.log(`   Cache TTL: ${CACHE_TTL_MS / 1000}s`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} already in use.`);
    console.error(`   Kill the existing process: npx kill-port ${PORT}`);
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});
