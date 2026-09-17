import React, { useMemo, useState, useCallback } from 'react';
import { computePositions } from '../utils/computePositions';
import { useMarketPrices } from '../hooks/useMarketPrices';

// FX tickers we always fetch alongside stock prices
const FX_TICKERS = ['EURUSD=X', 'EURGBP=X'];

function toEur(price, currency, fxPrices) {
  if (price === null || price === undefined) return null;
  if (currency === 'EUR') return price;
  if (currency === 'USD') {
    const rate = fxPrices['EURUSD=X']?.price;
    return rate ? price / rate : null;
  }
  if (currency === 'GBP') {
    const rate = fxPrices['EURGBP=X']?.price;
    return rate ? price / rate : null;
  }
  if (currency === 'GBX' || currency === 'GBp') {
    const rate = fxPrices['EURGBP=X']?.price;
    return rate ? (price / 100) / rate : null;
  }
  return price;
}

function formatEur(v, decimals = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function formatNative(v, currency, decimals = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const symbols = { EUR: '€', USD: '$', GBP: '£', GBX: 'p', GBp: 'p' };
  const sym = symbols[currency] || currency;
  return `${v.toLocaleString('pt-PT', { minimumFractionDigits: decimals, maximumFractionDigits: 4 })} ${sym}`;
}

function formatPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function formatQty(v) {
  if (!v && v !== 0) return '—';
  return v < 0.01 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : v.toFixed(4).replace(/\.?0+$/, '');
}

const TIPO_COLORS = {
  'Ação': '#3b82f6',
  'ETF': '#10b981',
  'Reit': '#8b5cf6',
  'Criptomoedas': '#f59e0b',
  'Metais': '#fcd34d',
};

function PnLCell({ value, decimals = 2 }) {
  if (value === null || value === undefined || isNaN(value)) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const color = value > 0 ? '#10b981' : value < 0 ? '#ef4444' : 'var(--text-muted)';
  const sign = value > 0 ? '+' : '';
  return <span style={{ color, fontWeight: 600 }}>{sign}{formatEur(value, decimals)}</span>;
}

function PctCell({ value }) {
  if (value === null || value === undefined || isNaN(value)) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const color = value > 0 ? '#10b981' : value < 0 ? '#ef4444' : 'var(--text-muted)';
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '';
  return (
    <span style={{
      color, fontWeight: 600,
      background: value > 0 ? 'rgba(16,185,129,0.12)' : value < 0 ? 'rgba(239,68,68,0.12)' : 'transparent',
      padding: '2px 7px', borderRadius: 6, fontSize: 12,
    }}>
      {arrow} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

/** Lucro Total badge: P&L + Dividendo Líquido — the real return */
function LucroTotalCell({ pnl, divLiq }) {
  if (pnl === null && divLiq === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const total = (pnl ?? 0) + divLiq;
  const color = total > 0 ? '#f59e0b' : total < 0 ? '#ef4444' : 'var(--text-muted)';
  const bg    = total > 0 ? 'rgba(245,158,11,0.12)' : total < 0 ? 'rgba(239,68,68,0.1)' : 'transparent';
  const border= total > 0 ? 'rgba(245,158,11,0.35)' : total < 0 ? 'rgba(239,68,68,0.3)' : 'transparent';
  const sign  = total > 0 ? '+' : '';
  return (
    <span style={{
      color, fontWeight: 700,
      background: bg,
      border: `1px solid ${border}`,
      padding: '3px 10px', borderRadius: 8, fontSize: 13,
      display: 'inline-block',
    }}>
      {sign}{formatEur(total)}
    </span>
  );
}

function LoadingRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14 }}>
          <span>⏳</span> A obter cotações do mercado...
        </div>
      </td>
    </tr>
  );
}

function TickerOverrideCell({ csvTicker, currentYahoo, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentYahoo);

  const handleSave = () => {
    const clean = draft.trim().toUpperCase();
    if (clean) onSave(csvTicker, clean);
    setEditing(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setDraft(currentYahoo); setEditing(false); }
  };

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          {currentYahoo !== csvTicker ? currentYahoo : ''}
        </span>
        <button
          onClick={() => { setDraft(currentYahoo); setEditing(true); }}
          title="Corrigir ticker Yahoo Finance"
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 10, cursor: 'pointer', padding: '1px 3px', borderRadius: 4, lineHeight: 1,
          }}
        >✏️</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 3, alignItems: 'center' }}>
      <input
        autoFocus value={draft}
        onChange={e => setDraft(e.target.value.toUpperCase())}
        onKeyDown={handleKey}
        placeholder="ex: BHP.L"
        style={{
          width: 80, fontSize: 11, padding: '2px 6px',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(99,102,241,0.6)',
          borderRadius: 5, color: 'var(--text-primary)',
        }}
      />
      <button onClick={handleSave} style={{
        background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
        color: '#818cf8', borderRadius: 5, padding: '2px 6px', fontSize: 11, cursor: 'pointer',
      }}>✓</button>
      <button onClick={() => { setDraft(currentYahoo); setEditing(false); }} style={{
        background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
      }}>✕</button>
    </div>
  );
}

// Column headers — right-aligned columns
const HEADERS = [
  'Ticker / YF', 'Tipo', 'QTD',
  'Custo Médio €', 'Custo Total €',
  'Preço Atual', 'Valor Atual €',
  'P&L (€)', 'P&L (%)',
  'Div. Bruto €', 'Impostos €', 'Div. Líq. €',
  '★ Lucro Total €',
];
const RIGHT_COLS = new Set(['Custo Médio €','Custo Total €','Valor Atual €','Preço Atual','P&L (€)','P&L (%)','Div. Bruto €','Impostos €','Div. Líq. €','★ Lucro Total €']);

export default function PortfolioTab({ rows }) {
  const positions = useMemo(() => computePositions(rows), [rows]);

  const [tickerOverrides, setTickerOverrides] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('yf_overrides') || '{}'); } catch { return {}; }
  });

  const handleOverride = useCallback((csvTicker, newYahooTicker) => {
    setTickerOverrides(prev => {
      const updated = { ...prev, [csvTicker]: newYahooTicker };
      try { sessionStorage.setItem('yf_overrides', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const positionsWithOverrides = useMemo(() =>
    positions.map(p => ({
      ...p,
      yahooTicker: tickerOverrides[p.ticker] || p.yahooTicker,
    })),
  [positions, tickerOverrides]);

  const stockTickers = useMemo(() => positionsWithOverrides.map(p => p.yahooTicker), [positionsWithOverrides]);
  const allTickers = useMemo(() => [...stockTickers, ...FX_TICKERS], [stockTickers]);

  const { prices, loading, lastUpdated, fetchedCount, total: totalTickers, refresh } = useMarketPrices(allTickers);

  const fxPrices = useMemo(() => ({
    'EURUSD=X': prices['EURUSD=X'],
    'EURGBP=X': prices['EURGBP=X'],
  }), [prices]);

  const fxLoaded = fxPrices['EURUSD=X']?.price != null;
  const eurUsdRate = fxPrices['EURUSD=X']?.price;
  const eurGbpRate = fxPrices['EURGBP=X']?.price;

  const enriched = useMemo(() => {
    return positionsWithOverrides.map(p => {
      const data = prices[p.yahooTicker];
      const currentPriceNative = data?.price ?? null;
      const changePercent = data?.changePercent ?? null;
      const currency = data?.currency ?? p.moeda;

      const currentPriceEur = toEur(currentPriceNative, currency, fxPrices);
      const currentValueEur = currentPriceEur !== null ? currentPriceEur * p.qty : null;
      const pnlEur = currentValueEur !== null ? currentValueEur - p.costEur : null;
      const pnlPct = pnlEur !== null && p.costEur > 0 ? (pnlEur / p.costEur) * 100 : null;
      const lucroTotal = pnlEur !== null ? pnlEur + (p.divLiq ?? 0) : null;

      return {
        ...p,
        currentPriceNative, currentPriceEur, currency, changePercent,
        currentValueEur, pnlEur, pnlPct, lucroTotal,
        hasPrice: currentPriceEur !== null,
      };
    });
  }, [positionsWithOverrides, prices, fxPrices]);

  const totals = useMemo(() => {
    const withPrice = enriched.filter(p => p.currentValueEur !== null);
    const totalCost  = enriched.reduce((s, p) => s + p.costEur, 0);
    const totalValue = withPrice.reduce((s, p) => s + p.currentValueEur, 0);
    const totalPnl   = withPrice.reduce((s, p) => s + p.pnlEur, 0);
    const totalPct   = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const totalDivBruto = enriched.reduce((s, p) => s + (p.divBruto ?? 0), 0);
    const totalDivTaxa  = enriched.reduce((s, p) => s + (p.divTaxa  ?? 0), 0);
    const totalDivLiq   = enriched.reduce((s, p) => s + (p.divLiq   ?? 0), 0);
    const totalLucro    = withPrice.reduce((s, p) => s + p.pnlEur + (p.divLiq ?? 0), 0);
    return { totalCost, totalValue, totalPnl, totalPct, withPrice: withPrice.length, total: enriched.length,
             totalDivBruto, totalDivTaxa, totalDivLiq, totalLucro };
  }, [enriched]);

  const stockFetched = Object.keys(prices).filter(t => !FX_TICKERS.includes(t)).length;
  const COL = HEADERS.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        {[
          {
            label: 'Custo Total Investido',
            value: formatEur(totals.totalCost),
            sub: `${totals.total} posições abertas`,
            color: '#60a5fa',
          },
          {
            label: 'Valor de Mercado',
            value: totals.totalValue > 0 ? formatEur(totals.totalValue) : '—',
            sub: totals.withPrice < totals.total
              ? `${totals.withPrice}/${totals.total} cotações`
              : 'convertido para €',
            color: '#34d399',
          },
          {
            label: 'Ganho / Perda Não-Realizado',
            value: totals.totalValue > 0 ? formatEur(totals.totalPnl) : '—',
            sub: totals.totalValue > 0 ? formatPct(totals.totalPct) : '',
            color: totals.totalPnl >= 0 ? '#10b981' : '#ef4444',
          },
          {
            label: '💰 Total Dividendos Recebidos',
            value: totals.totalDivBruto > 0 ? formatEur(totals.totalDivBruto) : '—',
            sub: totals.totalDivLiq > 0 ? `Líquido: ${formatEur(totals.totalDivLiq)}` : 'das posições abertas',
            color: '#fbbf24',
          },
          {
            label: '★ Lucro Total Real (P&L + Div.)',
            value: totals.totalValue > 0 ? formatEur(totals.totalLucro) : '—',
            sub: 'Valorização + Dividendos Líq.',
            color: totals.totalLucro >= 0 ? '#f59e0b' : '#ef4444',
            highlight: true,
          },
          {
            label: 'Câmbio ao Vivo',
            value: fxLoaded ? `1€ = ${eurUsdRate?.toFixed(4)} $` : loading ? '⏳' : '—',
            sub: fxLoaded && eurGbpRate ? `1€ = ${eurGbpRate?.toFixed(4)} £` : '',
            color: '#a78bfa',
            isAction: true,
          },
        ].map(kpi => (
          <div key={kpi.label} className="card p-4" style={{
            borderLeft: `3px solid ${kpi.color}`,
            position: 'relative',
            ...(kpi.highlight ? {
              background: 'rgba(245,158,11,0.06)',
              border: `1px solid rgba(245,158,11,0.25)`,
              boxShadow: '0 0 18px rgba(245,158,11,0.08)',
            } : {}),
          }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</p>
            <p style={{ color: kpi.color, fontSize: kpi.label === 'Câmbio ao Vivo' ? 16 : 20, fontWeight: 700 }}>{kpi.value}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{kpi.sub}</p>
            {kpi.isAction && (
              <button
                onClick={refresh} disabled={loading}
                style={{
                  position: 'absolute', top: 12, right: 12,
                  background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)',
                  color: '#a78bfa', borderRadius: 8, padding: '4px 10px', fontSize: 12,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? `⏳ ${stockFetched}/${totals.total}` : '🔄 Atualizar'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Last updated bar */}
      {lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 11 }}>
          <span style={{ color: '#10b981' }}>●</span>
          Última actualização: {lastUpdated.toLocaleTimeString('pt-PT')} • cache 30min
          {!fxLoaded && <span style={{ color: '#fbbf24' }}>— câmbio ainda a carregar...</span>}
        </div>
      )}

      {/* Positions table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
            📈 Posições Abertas
            <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
              ({enriched.length} ativos — todos os valores em €)
            </span>
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Ação', 'ETF', 'Reit', 'Criptomoedas', 'Metais'].map(t => (
              <span key={t} style={{
                background: `${TIPO_COLORS[t] || '#64748b'}22`,
                color: TIPO_COLORS[t] || '#64748b',
                border: `1px solid ${TIPO_COLORS[t] || '#64748b'}44`,
                borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 500,
              }}>
                {t}: {enriched.filter(p => p.tipo === t).length}
              </span>
            ))}
          </div>
        </div>

        <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 12, color: '#60a5fa' }}>
          💱 Câmbio ao vivo aplicado automaticamente. Dividendos registados ligados por Ticker.
          A coluna <strong>★ Lucro Total</strong> = P&amp;L + Dividendos Líquidos — o ROI real da posição.
        </div>

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {HEADERS.map(h => (
                  <th key={h} style={{
                    padding: '10px 12px',
                    textAlign: RIGHT_COLS.has(h) ? 'right' : 'left',
                    color: h === '★ Lucro Total €' ? '#f59e0b' : 'var(--text-muted)',
                    fontWeight: h === '★ Lucro Total €' ? 700 : 500,
                    fontSize: 11,
                    letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    background: h === '★ Lucro Total €' ? 'rgba(245,158,11,0.06)' : 'transparent',
                    borderLeft: h === '★ Lucro Total €' ? '2px solid rgba(245,158,11,0.3)' : 'none',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && enriched.length === 0 ? (
                <LoadingRow colSpan={COL} />
              ) : enriched.length === 0 ? (
                <tr><td colSpan={COL} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma posição aberta encontrada.</td></tr>
              ) : (
                enriched.map(p => {
                  const avgCost = p.qty > 0 ? p.costEur / p.qty : 0;
                  const tipoColor = TIPO_COLORS[p.tipo] || '#64748b';
                  const rowBg = p.pnlEur !== null
                    ? p.pnlEur > 0 ? 'rgba(16,185,129,0.03)' : p.pnlEur < 0 ? 'rgba(239,68,68,0.03)' : 'transparent'
                    : 'transparent';
                  const hasDivs = (p.divBruto ?? 0) > 0;

                  return (
                    <tr key={p.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg }}>
                      {/* Ticker */}
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            background: `${tipoColor}22`, border: `1px solid ${tipoColor}44`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: tipoColor, fontWeight: 700, marginTop: 2,
                          }}>
                            {p.ticker.slice(0, 2)}
                          </span>
                          <div>
                            <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.ticker}</p>
                            <TickerOverrideCell csvTicker={p.ticker} currentYahoo={p.yahooTicker} onSave={handleOverride} />
                          </div>
                        </div>
                      </td>

                      {/* Tipo */}
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{
                          background: `${tipoColor}1a`, color: tipoColor,
                          border: `1px solid ${tipoColor}33`,
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500,
                        }}>{p.tipo}</span>
                      </td>

                      {/* QTD */}
                      <td style={{ padding: '11px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
                        {formatQty(p.qty)}
                      </td>

                      {/* Custo Médio € */}
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {formatEur(avgCost)}
                      </td>

                      {/* Custo Total € */}
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {formatEur(p.costEur)}
                      </td>

                      {/* Preço Atual */}
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        {p.currentPriceNative !== null ? (
                          <div>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                              {formatNative(p.currentPriceNative, p.currency)}
                            </span>
                            {p.currentPriceEur !== null && p.currency !== 'EUR' && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                ≈ {formatEur(p.currentPriceEur)} /unit
                              </div>
                            )}
                            {p.changePercent !== null && (
                              <div style={{ fontSize: 10, color: p.changePercent >= 0 ? '#10b981' : '#ef4444', marginTop: 1 }}>
                                {p.changePercent >= 0 ? '▲' : '▼'} {Math.abs(p.changePercent).toFixed(2)}% hoje
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            {loading ? '⏳' : '— sem cotação'}
                          </span>
                        )}
                      </td>

                      {/* Valor Atual € */}
                      <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {p.currentValueEur !== null
                          ? <span style={{ color: 'var(--text-primary)' }}>{formatEur(p.currentValueEur)}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>
                              {p.currentPriceNative !== null && !fxLoaded ? '⏳ câmbio...' : '—'}
                            </span>
                        }
                      </td>

                      {/* P&L € */}
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        <PnLCell value={p.pnlEur} />
                      </td>

                      {/* P&L % */}
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        <PctCell value={p.pnlPct} />
                      </td>

                      {/* Div. Bruto € */}
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        {hasDivs ? (
                          <span style={{ color: '#fbbf24', fontWeight: 500 }}>{formatEur(p.divBruto)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>

                      {/* Impostos € */}
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        {hasDivs ? (
                          <span style={{ color: '#ef4444', fontSize: 12 }}>{formatEur(p.divTaxa)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>

                      {/* Div. Líq. € */}
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        {hasDivs ? (
                          <span style={{ color: '#10b981', fontWeight: 600 }}>{formatEur(p.divLiq)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>

                      {/* ★ Lucro Total € */}
                      <td style={{
                        padding: '11px 12px', textAlign: 'right',
                        background: 'rgba(245,158,11,0.04)',
                        borderLeft: '2px solid rgba(245,158,11,0.2)',
                      }}>
                        <LucroTotalCell pnl={p.pnlEur} divLiq={p.divLiq ?? 0} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Totals footer */}
            {enriched.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}>
                  <td colSpan={4} style={{ padding: '12px 12px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                    TOTAL ({totals.withPrice}/{totals.total} com cotação em €)
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    {formatEur(totals.totalCost)}
                  </td>
                  <td style={{ padding: '12px 12px' }}></td>
                  <td style={{ padding: '12px 12px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>
                    {totals.totalValue > 0 ? formatEur(totals.totalValue) : '—'}
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                    <PnLCell value={totals.totalPnl !== 0 ? totals.totalPnl : null} />
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                    <PctCell value={totals.totalValue > 0 ? totals.totalPct : null} />
                  </td>
                  {/* Div totals */}
                  <td style={{ padding: '12px 12px', textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}>
                    {totals.totalDivBruto > 0 ? formatEur(totals.totalDivBruto) : '—'}
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>
                    {totals.totalDivTaxa > 0 ? formatEur(totals.totalDivTaxa) : '—'}
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>
                    {totals.totalDivLiq > 0 ? formatEur(totals.totalDivLiq) : '—'}
                  </td>
                  {/* Lucro Total */}
                  <td style={{
                    padding: '12px 12px', textAlign: 'right',
                    background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid rgba(245,158,11,0.3)',
                  }}>
                    <span style={{
                      color: totals.totalLucro >= 0 ? '#f59e0b' : '#ef4444',
                      fontWeight: 700, fontSize: 14,
                    }}>
                      {totals.totalValue > 0 ? (totals.totalLucro >= 0 ? '+' : '') + formatEur(totals.totalLucro) : '—'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
