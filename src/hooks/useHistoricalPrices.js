/**
 * useHistoricalPrices.js
 *
 * Fetches end-of-year closing prices for a set of tickers.
 * Uses the backend proxy (/api/historical) — no public CORS proxies.
 *
 * Input:  requests = [{ ticker: 'AAPL', year: 2023 }, ...]
 * Output: prices   = { 'AAPL|2023': { price, currency } | null, ... }
 *
 * Cache: localStorage-backed, permanent — but ONLY for genuinely resolved
 * outcomes (a real price, or a confirmed "no data" 404 from Yahoo).
 * Transient failures (timeouts, network errors, 429/502 from the proxy)
 * are NEVER persisted — they're retried on the next fetch instead of being
 * silently frozen as "no data" forever.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const LOCAL_PROXY = import.meta.env.VITE_API_URL ?? '';
// Dev  (.env.development): VITE_API_URL=''  → relative paths via Vite's server.proxy
// Prod (.env.production):  VITE_API_URL='https://investimentos-api.duckdns.org'

const LS_KEY      = 'invest_dashboard_historical_cache';

// ─── Persistent cache ─────────────────────────────────────────────────────────
// Historical prices never change, so we cache resolved results indefinitely
// in localStorage. Transient failures are kept out of this cache entirely.
function loadHistoricalCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHistoricalCache(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch { /* storage full — ignore */ }
}

// Initialise in-memory cache from localStorage
const cache = loadHistoricalCache();

// ─── Core fetcher — uses local proxy only ─────────────────────────────────────
/**
 * Returns one of:
 *   { price, currency }  — resolved price, safe to cache permanently
 *   { notFound: true }   — Yahoo confirmed no data (404), safe to cache
 *   { transient: true }  — timeout / network error / 429 / 502 / etc.
 *                           NEVER cache this — retry on a future call.
 */
async function fetchYearEndPrice(ticker, year) {
  const url = `${LOCAL_PROXY}/api/historical?ticker=${encodeURIComponent(ticker)}&year=${year}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });

    if (res.status === 404) return { notFound: true };
    if (!res.ok) return { transient: true }; // 429, 502, etc. — proxy/Yahoo hiccup

    const json = await res.json();
    if (json?.price == null) return { notFound: true };
    return { price: json.price, currency: json.currency || 'USD' };
  } catch {
    return { transient: true }; // timeout or network error
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useHistoricalPrices(requests) {
  const [prices, setPrices]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fetchingRef = useRef(false);
  const pendingRef  = useRef(null); // requests that arrived while a fetch was in flight
  const isMounted   = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const requestKey = JSON.stringify(
    [...(requests || [])].sort((a, b) =>
      `${a.ticker}|${a.year}`.localeCompare(`${b.ticker}|${b.year}`)
    )
  );

  const fetchAll = useCallback(async (reqs) => {
    if (!reqs || reqs.length === 0) return;

    // If a fetch is already running, stash these requests and process them
    // once the current run finishes — don't silently drop them.
    if (fetchingRef.current) {
      pendingRef.current = reqs;
      return;
    }

    // Deduplicate
    const unique = [];
    const seen   = new Set();
    for (const r of reqs) {
      const key = `${r.ticker}|${r.year}`;
      if (!seen.has(key)) { seen.add(key); unique.push({ ...r, key }); }
    }

    // Hydrate from cache immediately (no network needed).
    // Only genuinely resolved entries live in `cache` now, so this is safe.
    const fromCache  = {};
    const needsFetch = [];
    for (const r of unique) {
      if (cache[r.key] !== undefined) {
        fromCache[r.key] = cache[r.key];
      } else {
        needsFetch.push(r);
      }
    }
    if (Object.keys(fromCache).length > 0 && isMounted.current) {
      setPrices(prev => ({ ...prev, ...fromCache }));
    }
    if (needsFetch.length === 0) {
      // Still need to check for anything that queued up while we were idle
      if (pendingRef.current) {
        const next = pendingRef.current;
        pendingRef.current = null;
        fetchAll(next);
      }
      return;
    }

    fetchingRef.current = true;
    if (isMounted.current) {
      setLoading(true);
      setProgress({ done: 0, total: needsFetch.length });
    }

    // Fetch in small concurrent batches with a delay between them
    // to respect Yahoo Finance's rate limits on the server side
    const CONCURRENT = 3;
    const DELAY_MS   = 300;
    let done = 0;
    let cacheDirty = false;

    for (let i = 0; i < needsFetch.length; i += CONCURRENT) {
      const batch   = needsFetch.slice(i, i + CONCURRENT);
      const results = await Promise.allSettled(
        batch.map(r => fetchYearEndPrice(r.ticker, r.year))
      );

      const updates = {};
      for (let j = 0; j < batch.length; j++) {
        const { key } = batch[j];
        const outcome = results[j].status === 'fulfilled'
          ? results[j].value
          : { transient: true };

        if (outcome?.transient) {
          // Don't cache — show as "no data yet" in the UI, but leave the
          // cache untouched so a future fetch will retry this key.
          updates[key] = null;
          continue;
        }

        // outcome is either { price, currency } or { notFound: true }
        const value = outcome?.notFound ? null : outcome;
        cache[key] = value;
        cacheDirty = true;
        updates[key] = value;
      }

      // Persist the cache to localStorage after each batch, but only if
      // something genuinely resolved (avoids pointless writes on all-transient batches)
      if (cacheDirty) {
        saveHistoricalCache(cache);
        cacheDirty = false;
      }

      if (isMounted.current) {
        setPrices(prev => ({ ...prev, ...updates }));
      }

      done += batch.length;
      if (isMounted.current) setProgress({ done, total: needsFetch.length });

      // Pause between batches (not after the last one)
      if (i + CONCURRENT < needsFetch.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    fetchingRef.current = false;
    if (isMounted.current) setLoading(false);

    // Process anything that queued up while this run was in flight
    if (pendingRef.current) {
      const next = pendingRef.current;
      pendingRef.current = null;
      fetchAll(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const currentYear   = new Date().getFullYear();
    const validRequests = (requests || []).filter(r => r.year < currentYear);
    if (validRequests.length > 0) fetchAll(validRequests);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return { prices, loading, progress };
}
