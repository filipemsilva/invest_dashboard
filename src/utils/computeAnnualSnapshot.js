/**
 * computeAnnualSnapshot.js
 *
 * Computes a per-year portfolio snapshot directly from transaction rows.
 * No API needed — only uses dates and quantities from the CSV/Supabase data.
 *
 * For each calendar year it produces:
 *  - realizedBruto / realizedIRS / realizedLiq  — P&L from sales in that year
 *  - dividendsLiq / dividendsBruto              — dividends received that year
 *  - openPositions[]                             — holdings still open on 31 Dec
 *  - unrealizedCostTotal                         — total cost basis of those holdings
 *  - totalInvestedEver                           — cumulative capital deployed up to 31 Dec
 */

import { toYahooTicker } from './computePositions';

const SKIP_TIPOS   = new Set(['P2P', 'C.Aforro']);
const SKIP_TICKERS = new Set(['Go&Grow', 'Via', 'VIA', 'C.Aforro', 'Go&amp;Grow']);

/** Parse "DD/MM/YYYY" → Date (midnight local) or null */
function parseDate(str) {
  if (!str || str.trim() === '') return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

/** Last day of the given year (31 Dec 23:59:59) */
function yearEnd(year) {
  return new Date(year, 11, 31, 23, 59, 59);
}

/** First day of the given year */
function yearStart(year) {
  return new Date(year, 0, 1);
}

/**
 * computeAnnualSnapshot(rows)
 *
 * Returns an array sorted by year ascending.
 * Each entry:
 * {
 *   year,
 *   realizedBruto, realizedIRS, realizedLiq,
 *   dividendsBruto, dividendsLiq,
 *   totalInvestedEver,
 *   unrealizedCostTotal,
 *   openPositions: [{ ticker, yahooTicker, qty, costEur, tipo, broker, moeda }],
 * }
 */
export function computeAnnualSnapshot(rows) {
  if (!rows || rows.length === 0) return [];

  // ── Determine year range from data ─────────────────────────────────────────
  const allDates = rows
    .map(r => parseDate(r.Data) || parseDate(r.DataVenda))
    .filter(Boolean);

  if (allDates.length === 0) return [];

  const minYear = Math.min(...allDates.map(d => d.getFullYear()));
  const maxYear = new Date().getFullYear(); // up to current year

  const years = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);

  // ── Build snapshots ─────────────────────────────────────────────────────────
  return years.map(year => {
    const cutoff    = yearEnd(year);
    const yearBegin = yearStart(year);

    // --- Realized P&L: sales whose DataVenda (or Data) falls in this year ---
    let realizedBruto = 0;
    let realizedIRS   = 0;
    let realizedLiq   = 0;
    let dividendsBruto = 0;
    let dividendsLiq   = 0;

    for (const row of rows) {
      if (SKIP_TIPOS.has(row.Tipo))     continue;
      if (SKIP_TICKERS.has(row.Ticker)) continue;

      const op = row.Operacao;

      // Dividends in this year
      if (op === 'Dividendos') {
        const d = parseDate(row.Data);
        if (d && d >= yearBegin && d <= cutoff) {
          dividendsBruto += row.ValorTotalEur || 0;
          dividendsLiq   += (row.ValorTotalEur || 0) - (row.TaxaEur || 0);
        }
        continue;
      }

      if (op === 'Recebimento') continue;

      // Realized: if this row has a sale component
      const saleDateRaw = row.DataVenda || row.Data;
      const saleDate    = parseDate(saleDateRaw);
      const qtySell     = row.QTDVenda || 0;

      if (qtySell > 0 && saleDate && saleDate >= yearBegin && saleDate <= cutoff) {
        realizedBruto += row.LucroBruto || 0;
        realizedIRS   += row.IRS        || 0;
        realizedLiq   += row.LucroLiq   || 0;
      }
    }

    // --- Open positions as of 31 Dec of this year ---
    // For each ticker, accumulate buys and subtract sells up to cutoff
    const positions = {};  // ticker → { qty, costEur, tipo, broker, moeda }

    for (const row of rows) {
      if (SKIP_TIPOS.has(row.Tipo))     continue;
      if (SKIP_TICKERS.has(row.Ticker)) continue;

      const op     = row.Operacao;
      const ticker = row.Ticker;

      if (op === 'Dividendos' || op === 'Recebimento') continue;
      if (!ticker || ticker === '—') continue;

      // Buy date
      const buyDate = parseDate(row.Data);
      if (!buyDate || buyDate > cutoff) continue;  // not yet bought by year-end

      if (!positions[ticker]) {
        positions[ticker] = {
          ticker,
          yahooTicker: toYahooTicker(ticker),
          tipo:   row.Tipo   || '',
          broker: row.Broker || '',
          moeda:  row.Moeda  || 'EUR',
          qty:     0,
          costEur: 0,
        };
      }

      const p = positions[ticker];

      const qtyBuy  = row.QTD || 0;
      const costBuy = (row.ValorTotalEur || 0) + (row.TaxaEur || 0);

      if (qtyBuy > 0) {
        p.qty     += qtyBuy;
        p.costEur += costBuy;
      }

      // Sell part — only if the sale happened on or before year-end
      const saleDateRaw = row.DataVenda || null;
      const saleDate    = saleDateRaw ? parseDate(saleDateRaw) : null;
      const qtySell     = row.QTDVenda || 0;

      if (qtySell > 0 && (!saleDate || saleDate <= cutoff)) {
        if (p.qty > 0) {
          const ratio = Math.min(qtySell / p.qty, 1);
          p.costEur *= (1 - ratio);
        }
        p.qty = Math.max(0, p.qty - qtySell);
      }
    }

    const openPositions = Object.values(positions)
      .filter(p => p.qty > 0.0001)
      .sort((a, b) => b.costEur - a.costEur);

    const unrealizedCostTotal   = openPositions.reduce((s, p) => s + p.costEur, 0);

    // Total capital deployed (all buys up to yearEnd)
    let totalInvestedEver = 0;
    for (const row of rows) {
      if (SKIP_TIPOS.has(row.Tipo))     continue;
      if (SKIP_TICKERS.has(row.Ticker)) continue;
      if (row.Operacao === 'Dividendos' || row.Operacao === 'Recebimento') continue;
      const buyDate = parseDate(row.Data);
      if (!buyDate || buyDate > cutoff) continue;
      totalInvestedEver += (row.ValorTotalEur || 0) + (row.TaxaEur || 0);
    }

    return {
      year,
      realizedBruto,
      realizedIRS,
      realizedLiq,
      dividendsBruto,
      dividendsLiq,
      totalInvestedEver,
      unrealizedCostTotal,
      openPositions,
    };
  });
}
