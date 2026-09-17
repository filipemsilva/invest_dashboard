/**
 * computePositions.js
 *
 * Calculates open positions from the full list of transaction rows.
 * For each ticker we sum up all Compra quantities and subtract Venda quantities.
 * Only tickers that still have a positive holding are included.
 * P2P (Go&Grow, Via) and C.Aforro (no market price) are excluded.
 */

const SKIP_TIPOS = new Set(['P2P', 'C.Aforro']);
const SKIP_TICKERS = new Set(['Go&Grow', 'Via', 'VIA', 'C.Aforro', 'Go&amp;Grow']);

/**
 * Map tickers from the CSV format to Yahoo Finance symbols.
 * Most stock tickers are already valid; this handles special cases.
 */
const TICKER_MAP = {
  // Crypto (CSV stores as BTCEUR, ETHEUR, etc. → Yahoo uses BTC-EUR)
  BTCEUR: 'BTC-EUR',
  ETHEUR: 'ETH-EUR',
  ADAEUR: 'ADA-EUR',
  DOTEUR: 'DOT-EUR',
  SOLEUR: 'SOL-EUR',
  BNBEUR: 'BNB-EUR',
  XRPEUR: 'XRP-EUR',
  LTCEUR: 'LTC-EUR',
  BTCUSD: 'BTC-USD',
  ETHUSD: 'ETH-USD',
  ADA: 'ADA-USD',
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  SOL: 'SOL-USD',
  DOT: 'DOT-USD',

  // Metals
  XAU: 'GC=F',   // Gold futures
  XAG: 'SI=F',   // Silver futures
  GOLD: 'GC=F',

  // ETFs with exchange hints (common European ETFs)
  '2BTC': '2BTC.DE',  // 21Shares Bitcoin ETP
  AUM5: 'AUM5.DE',
  SNAW: 'SNAW.DE',
  EUNL: 'EUNL.DE',
  ZPDE: 'ZPDE.DE',
  QDVF: 'QDVF.DE',
  ETHA: 'ETHA.DE',
  EXV1: 'EXV1.DE',
  L0CK: 'L0CK.DE',
  SXR8: 'SXR8.DE',
  SXRV: 'SXRV.DE',
  IWDA: 'IWDA.AS',
  IDVY: 'IDVY.AS',
  IGLN: 'IGLN.SW',

  // PT/EU stocks
  'GLE': 'GLE.PA',
  'GALP': 'GALP.LS', // Galp Energia — Euronext Lisboa
  'RENE': 'RENE.LS',
  'NOS': 'NOS.LS',
  'NVG': 'NVG.LS',
  'VOW3': 'VOW3.DE',
  'BAYN': 'BAYN.DE',
  'IAG': 'IAG.L',   // bought in GBX on Trading212 → London listing

  // NYSE ADRs that look like they need a suffix but don't
  // BHP, RIO — traded in USD via Degiro/XTB → NYSE (no suffix)
  'PBR.A': 'PBR-A', // Petrobras preferred ADR — Yahoo uses dash not dot

  // US/common (usually already correct)
  // NVDA, TSLA, AAPL, AMZN, META, PFE, GOOG, INTC, MSFT, PLTR, MO,
  // MPW, APLE, O, VICI, JNJ, MCD, KO, PG, SBUX, MMM, AMD, GOOG,
  // PBR.A, LTC, EPR, AGNC, BAYN … keep as-is
};

export function toYahooTicker(csvTicker) {
  return TICKER_MAP[csvTicker] || csvTicker;
}

export function computePositions(rows) {
  // qty[ticker] = {qty, costEur, tipo, broker}
  const positions = {};
  // dividends[ticker] = { bruto, taxa, liq }
  const dividends = {};

  for (const row of rows) {
    const ticker = row.Ticker;
    const tipo = row.Tipo;
    const op = row.Operacao;

    // Skip non-marketable assets
    if (SKIP_TIPOS.has(tipo)) continue;
    if (SKIP_TICKERS.has(ticker)) continue;
    if (!ticker || ticker === '—') continue;

    // --- Aggregate dividends per ticker ---
    if (op === 'Dividendos') {
      if (!dividends[ticker]) dividends[ticker] = { bruto: 0, taxa: 0, liq: 0 };
      const bruto = parseFloat(row.ValorTotalEur) || 0;
      const taxa  = parseFloat(row.TaxaEur)       || 0;
      dividends[ticker].bruto += bruto;
      dividends[ticker].taxa  += taxa;
      dividends[ticker].liq   += (bruto - taxa);
      continue;
    }

    if (op === 'Recebimento') continue;

    if (!positions[ticker]) {
      positions[ticker] = {
        ticker,
        yahooTicker: toYahooTicker(ticker),
        tipo,
        qty: 0,
        costEur: 0,
        broker: row.Broker || '',
        moeda: row.Moeda || 'EUR',
      };
    }

    const p = positions[ticker];

    // 1) Add the purchase part (exists in both 'Compra' and 'Venda' logic for tax lots)
    const qtyCompra = row.QTD || 0;
    const costEurCompra = (row.ValorTotalEur || 0) + (row.TaxaEur || 0);
    
    if (qtyCompra > 0) {
      p.qty += qtyCompra;
      p.costEur += costEurCompra;
    }

    // 2) Subtract the sale part if the lot was closed/sold
    const qtdVenda = row.QTDVenda || 0;
    if (qtdVenda > 0) {
      if (p.qty > 0) {
        const ratio = qtdVenda / p.qty;
        p.costEur *= (1 - Math.min(ratio, 1));
      }
      p.qty -= qtdVenda;
    }
  }

  // Filter out closed positions (qty ≤ 0) and attach dividends
  return Object.values(positions)
    .filter(p => p.qty > 0.0001)
    .map(p => ({
      ...p,
      divBruto: dividends[p.ticker]?.bruto ?? 0,
      divTaxa:  dividends[p.ticker]?.taxa  ?? 0,
      divLiq:   dividends[p.ticker]?.liq   ?? 0,
    }))
    .sort((a, b) => b.costEur - a.costEur); // sort by cost descending
}
