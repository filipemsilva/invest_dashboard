/**
 * useFxRates.js
 *
 * Returns live exchange rates as a map: { EUR: 1, USD: 0.925, GBP: 1.17, GBX: 0.0117, CAD: 0.68 }
 * i.e. "how many EUR does 1 unit of this currency buy" — matches the Câmbio field formula:
 *   ValorEur = ValorOriginal * Cambio
 *
 * Falls back to hardcoded defaults if the fetch fails.
 */
import { useMemo } from 'react';
import { useMarketPrices } from './useMarketPrices';

const FX_TICKERS = ['EURUSD=X', 'EURGBP=X', 'EURCAD=X'];

// Fallback rates (EUR per 1 foreign unit)
const FALLBACK = { EUR: 1, USD: 0.925, GBP: 1.17, GBX: 0.0117, CAD: 0.68 };

export function useFxRates() {
  const { prices, loading } = useMarketPrices(FX_TICKERS);

  const rates = useMemo(() => {
    // Yahoo Finance reports EURUSD=X as "how many USD per 1 EUR"
    const eurUsd = prices['EURUSD=X']?.price; // e.g. 1.082
    const eurGbp = prices['EURGBP=X']?.price; // e.g. 0.856
    const eurCad = prices['EURCAD=X']?.price; // e.g. 1.565

    return {
      EUR: 1,
      USD: eurUsd  ? +(1 / eurUsd).toFixed(6)         : FALLBACK.USD,
      GBP: eurGbp  ? +(1 / eurGbp).toFixed(6)         : FALLBACK.GBP,
      GBX: eurGbp  ? +(1 / (eurGbp * 100)).toFixed(6) : FALLBACK.GBX, // 1 GBX = 0.01 GBP
      CAD: eurCad  ? +(1 / eurCad).toFixed(6)         : FALLBACK.CAD,
    };
  }, [prices]);

  return { rates, loading };
}
