/**
 * useMarketPrices.js
 *
 * Thin React wrapper around the global PriceService singleton.
 *
 * Changes vs previous version:
 *  - Calls priceService.unregisterTickers() on cleanup (Fix #5)
 *  - Shallow-equality guard before calling setPrices / setLoading / setError
 *    so only genuine data changes trigger a re-render (Fix #6)
 *  - All other behaviour unchanged: cache-first init, subscriber pattern,
 *    window-focus re-check, 30-min auto-refresh interval
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllCached, lastCacheWrite, PRICE_CACHE_TTL_MS } from '../utils/priceCache';
import { priceService } from '../utils/priceService';

/** Shallow-compare two plain objects (one level deep, by reference). */
function shallowEqual(a, b) {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function useMarketPrices(yahooTickers) {
  const tickers  = yahooTickers ?? [];
  const tickerKey = JSON.stringify(tickers);

  // ── Init synchronously from localStorage (no loading flash for cached data) ─
  const [prices, setPrices] = useState(() => {
    const all = getAllCached();
    const result = {};
    for (const t of tickers) {
      if (all[t]) result[t] = all[t];
    }
    return result;
  });
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [lastUpdated, setLastUpdated] = useState(() => lastCacheWrite(tickers));

  // Track previous values for shallow-equality guard (Fix #6)
  const prevPrices  = useRef(prices);
  const prevLoading = useRef(false);
  const prevError   = useRef('');

  // ── Subscribe + register on mount / ticker change ──────────────────────────
  useEffect(() => {
    if (tickers.length === 0) return;

    const unsubscribe = priceService.subscribe(
      ({ allPrices, loading: l, error: e, lastUpdated: lu }) => {
        // Build the subset of prices relevant to this hook instance
        const next = {};
        for (const t of tickers) {
          if (allPrices[t]) next[t] = allPrices[t];
        }

        // Fix #6: only call set* when values genuinely changed
        if (!shallowEqual(next, prevPrices.current)) {
          prevPrices.current = next;
          setPrices(next);
        }
        if (l !== prevLoading.current) {
          prevLoading.current = l;
          setLoading(l);
        }
        if (e !== prevError.current) {
          prevError.current = e;
          setError(e);
        }
        if (lu) setLastUpdated(lu);
      }
    );

    priceService.registerTickers(tickers);

    // Fix #5: clean up — decrement ref counts when component unmounts
    return () => {
      unsubscribe();
      priceService.unregisterTickers(tickers);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  // ── Re-check on window focus ───────────────────────────────────────────────
  useEffect(() => {
    if (tickers.length === 0) return;
    const handleFocus = () => priceService.registerTickers(tickers);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  // ── Auto-refresh every 30 min while the tab is open ───────────────────────
  useEffect(() => {
    if (tickers.length === 0) return;
    const id = setInterval(
      () => priceService.registerTickers(tickers),
      PRICE_CACHE_TTL_MS
    );
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  // ── Manual refresh — queued if a fetch is already running (Fix #4) ─────────
  const refresh = useCallback(() => {
    priceService.refresh(tickers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  return {
    prices,
    loading,
    error,
    lastUpdated,
    fetchedCount: Object.keys(prices).length,
    total:        tickers.length,
    refresh,
    cacheTtlMs:   PRICE_CACHE_TTL_MS,
  };
}
