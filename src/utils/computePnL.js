/**
 * computePnL.js
 *
 * Full P&L engine for InvestTracker.
 *
 * Strategy (Opção A):
 *  - Realized profit (LucroBruto, IRS, LucroLiq) is read directly from CSV rows.
 *  - Remaining cost basis is calculated using FIFO proportional reduction.
 *  - Open positions carry the remaining cost basis for unrealized P&L (computed
 *    at render-time once we have live prices).
 *
 * Returns:
 *  - openPositions[]   — tickers with qty > 0 (unrealized)
 *  - closedPositions[] — tickers that had at least one sale (realized)
 *  - summary           — aggregate metrics
 */

const SKIP_TIPOS   = new Set(['P2P', 'C.Aforro']);
const SKIP_TICKERS = new Set(['Go&Grow', 'Via', 'VIA', 'C.Aforro', 'Go&amp;Grow']);

import { toYahooTicker } from './computePositions';

export function computePnL(rows) {
  // state per ticker
  const state = {};

  for (const row of rows) {
    const ticker = row.Ticker;
    const tipo   = row.Tipo;
    const op     = row.Operacao;

    if (SKIP_TIPOS.has(tipo))     continue;
    if (SKIP_TICKERS.has(ticker)) continue;
    if (!ticker || ticker === '—') continue;

    // ─── Dividends ───────────────────────────────────────────────────────────
    if (op === 'Dividendos') {
      if (!state[ticker]) initState(state, row);
      const bruto = row.ValorTotalEur || 0;
      const taxa  = row.TaxaEur       || 0;
      state[ticker].divBruto += bruto;
      state[ticker].divTaxa  += taxa;
      state[ticker].divLiq   += (bruto - taxa);
      continue;
    }

    if (op === 'Recebimento') continue;

    // ─── Buy / Tax-Lot ───────────────────────────────────────────────────────
    if (!state[ticker]) initState(state, row);
    const s = state[ticker];

    const qtyBuy  = row.QTD || 0;
    const costBuy = (row.ValorTotalEur || 0) + (row.TaxaEur || 0);

    if (qtyBuy > 0) {
      s.totalQtyBought  += qtyBuy;
      s.totalCostEur    += costBuy;
      s.currentQty      += qtyBuy;
      s.currentCostEur  += costBuy;
    }

    // ─── Sell (including tax-lot close) ──────────────────────────────────────
    const qtySell = row.QTDVenda || 0;
    if (qtySell > 0) {
      // Reduce remaining cost basis proportionally (FIFO approximation)
      if (s.currentQty > 0) {
        const ratio = Math.min(qtySell / s.currentQty, 1);
        s.currentCostEur *= (1 - ratio);
      }
      s.currentQty = Math.max(0, s.currentQty - qtySell);

      // Accumulate sell-side data
      s.totalQtySold        += qtySell;
      s.totalSellValueEur   += (row.VTotalVendaEur || 0);
      s.realizedPnlBruto    += (row.LucroBruto     || 0);
      s.realizedIRS         += (row.IRS             || 0);
      s.realizedPnlLiq      += (row.LucroLiq        || 0);

      // Keep an array of individual sale records for the detail table
      s.saleRecords.push({
        date:          row.DataVenda || row.Data,
        qtySell,
        sellValueEur:  row.VTotalVendaEur || 0,
        lucroBruto:    row.LucroBruto     || 0,
        irs:           row.IRS            || 0,
        lucroLiq:      row.LucroLiq       || 0,
        avgSellEur:    qtySell > 0 ? (row.VTotalVendaEur || 0) / qtySell : 0,
      });
    }
  }

  // ─── Build result arrays ──────────────────────────────────────────────────
  const openPositions   = [];
  const closedPositions = [];

  for (const s of Object.values(state)) {
    const avgCurrentCostEur = s.currentQty > 0 ? s.currentCostEur / s.currentQty : 0;
    const avgBuyPriceEur    = s.totalQtyBought  > 0 ? s.totalCostEur    / s.totalQtyBought  : 0;
    const avgSellPriceEur   = s.totalQtySold    > 0 ? s.totalSellValueEur / s.totalQtySold  : 0;

    const enriched = {
      ...s,
      avgCurrentCostEur,  // cost basis per remaining share
      avgBuyPriceEur,     // overall average buy price
      avgSellPriceEur,    // overall average sell price
      // ROI on realized portion: lucroLiq / (totalCostEur sold)
      // We approximate cost of sold shares = totalCostEur * (totalQtySold / totalQtyBought)
      realizedCostEur: s.totalQtyBought > 0
        ? s.totalCostEur * (s.totalQtySold / s.totalQtyBought)
        : 0,
    };

    if (s.currentQty > 0.0001) {
      openPositions.push(enriched);
    }
    if (s.totalQtySold > 0) {
      closedPositions.push(enriched);
    }
  }

  // Sort
  openPositions.sort((a, b) => b.currentCostEur - a.currentCostEur);
  closedPositions.sort((a, b) => b.realizedPnlLiq - a.realizedPnlLiq);

  // ─── Summary (without live prices — unrealized P&L added in component) ───
  const totalRealizedLiq  = closedPositions.reduce((s, p) => s + p.realizedPnlLiq, 0);
  const totalRealizedBruto= closedPositions.reduce((s, p) => s + p.realizedPnlBruto, 0);
  const totalIRS          = closedPositions.reduce((s, p) => s + p.realizedIRS, 0);
  const totalDivLiq       = Object.values(state).reduce((s, p) => s + p.divLiq, 0);
  const totalDivBruto     = Object.values(state).reduce((s, p) => s + p.divBruto, 0);
  const totalDivTaxa      = Object.values(state).reduce((s, p) => s + p.divTaxa, 0);
  const totalInvestedEver = Object.values(state).reduce((s, p) => s + p.totalCostEur, 0);
  const currentCostTotal  = openPositions.reduce((s, p) => s + p.currentCostEur, 0);

  return {
    openPositions,
    closedPositions,
    summary: {
      totalRealizedLiq,
      totalRealizedBruto,
      totalIRS,
      totalDivLiq,
      totalDivBruto,
      totalDivTaxa,
      totalInvestedEver,
      currentCostTotal,
    },
  };
}

function initState(state, row) {
  const ticker = row.Ticker;
  state[ticker] = {
    ticker,
    yahooTicker: toYahooTicker(ticker),
    tipo:    row.Tipo    || '',
    broker:  row.Broker  || '',
    moeda:   row.Moeda   || 'EUR',

    // buy side
    totalQtyBought:   0,
    totalCostEur:     0,

    // current position
    currentQty:       0,
    currentCostEur:   0,

    // sell side (realized)
    totalQtySold:     0,
    totalSellValueEur:0,
    realizedPnlBruto: 0,
    realizedIRS:      0,
    realizedPnlLiq:   0,
    saleRecords:      [],

    // dividends
    divBruto: 0,
    divTaxa:  0,
    divLiq:   0,
  };
}
