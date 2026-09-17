import React, { useMemo, useState, useCallback } from 'react';
import { computePnL } from '../utils/computePnL';
import { useMarketPrices } from '../hooks/useMarketPrices';

// ─── Constants ────────────────────────────────────────────────────────────────
const FX_TICKERS = ['EURUSD=X', 'EURGBP=X'];

const TIPO_COLORS = {
  'Ação':         '#3b82f6',
  'ETF':          '#10b981',
  'Reit':         '#8b5cf6',
  'Criptomoedas': '#f59e0b',
  'Metais':       '#fcd34d',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v, decimals = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function fmtPct(v, showSign = true) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const sign = showSign && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtQty(v) {
  if (!v && v !== 0) return '—';
  return v < 0.01 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : Number(v.toFixed(4)).toLocaleString('pt-PT');
}

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

// ─── Micro-components ─────────────────────────────────────────────────────────
function PnLBadge({ value, size = 13 }) {
  if (value === null || value === undefined || isNaN(value)) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span style={{
      color:      pos ? '#10b981' : neg ? '#ef4444' : 'var(--text-muted)',
      fontWeight: 700,
      fontSize:   size,
      background: pos ? 'rgba(16,185,129,0.1)' : neg ? 'rgba(239,68,68,0.1)' : 'transparent',
      padding:    '2px 8px',
      borderRadius: 6,
    }}>
      {pos ? '+' : ''}{fmt(value)}
    </span>
  );
}

function PctBadge({ value }) {
  if (value === null || value === undefined || isNaN(value)) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span style={{
      color:      pos ? '#10b981' : neg ? '#ef4444' : 'var(--text-muted)',
      fontWeight: 600,
      fontSize:   12,
      background: pos ? 'rgba(16,185,129,0.1)' : neg ? 'rgba(239,68,68,0.1)' : 'transparent',
      padding:    '2px 8px',
      borderRadius: 6,
    }}>
      {pos ? '▲' : neg ? '▼' : ''} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function KpiCard({ label, value, sub, color, highlight, icon }) {
  return (
    <div style={{
      background:   highlight ? 'rgba(245,158,11,0.07)' : 'var(--bg-card)',
      border:       highlight ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border)',
      borderRadius: 14,
      padding:      '18px 20px',
      borderLeft:   highlight ? undefined : `3px solid ${color}`,
      boxShadow:    highlight ? '0 0 24px rgba(245,158,11,0.1)' : 'none',
      position:     'relative',
      overflow:     'hidden',
    }}>
      {/* glow blob */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: color, opacity: 0.06, filter: 'blur(20px)',
        pointerEvents: 'none',
      }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
        {icon && <span style={{ marginRight: 5 }}>{icon}</span>}{label}
      </p>
      <p style={{ color, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, count, accent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '16px 20px 0',
    }}>
      <h3 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 15, margin: 0 }}>
        {title}
      </h3>
      {count !== undefined && (
        <span style={{
          background: `${accent}22`, color: accent,
          border: `1px solid ${accent}44`,
          borderRadius: 20, padding: '1px 9px', fontSize: 11, fontWeight: 600,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function TierBreakdown({ openPositions, closedPositions, unrealizedByTicker }) {
  const types = ['Ação', 'ETF', 'Reit', 'Criptomoedas', 'Metais'];

  const byType = useMemo(() => {
    const map = {};
    for (const t of types) {
      const open   = openPositions.filter(p => p.tipo === t);
      const closed = closedPositions.filter(p => p.tipo === t);
      const unrealized = open.reduce((s, p) => {
        const u = unrealizedByTicker[p.ticker];
        return s + (u?.pnlEur ?? 0);
      }, 0);
      const realized = closed.reduce((s, p) => s + p.realizedPnlLiq, 0);
      const openCount = open.length;
      if (openCount === 0 && closed.length === 0) return map;
      map[t] = { realized, unrealized, openCount, closedCount: closed.length };
    }
    return map;
  }, [openPositions, closedPositions, unrealizedByTicker]);

  const entries = Object.entries(byType).filter(([, v]) => v.openCount > 0 || v.closedCount > 0);
  if (entries.length === 0) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
      {entries.map(([tipo, data]) => {
        const color = TIPO_COLORS[tipo] || '#64748b';
        const total = data.realized + data.unrealized;
        return (
          <div key={tipo} style={{
            background: `${color}0d`, border: `1px solid ${color}28`,
            borderRadius: 12, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color, fontWeight: 700, fontSize: 13 }}>{tipo}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                {data.openCount}↑ {data.closedCount > 0 ? `${data.closedCount}✓` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Realizado</span>
                <span style={{ color: data.realized >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                  {data.realized !== 0 ? (data.realized > 0 ? '+' : '') + fmt(data.realized, 0) : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Não-Real.</span>
                <span style={{ color: data.unrealized >= 0 ? '#60a5fa' : '#ef4444', fontWeight: 600 }}>
                  {data.unrealized !== 0 ? (data.unrealized > 0 ? '+' : '') + fmt(data.unrealized, 0) : '—'}
                </span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                borderTop: `1px solid ${color}33`, paddingTop: 4, marginTop: 2,
              }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Total</span>
                <span style={{ color: total >= 0 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                  {(total > 0 ? '+' : '') + fmt(total, 0)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function PnLTab({ rows }) {
  const { openPositions, closedPositions, summary } = useMemo(() => computePnL(rows), [rows]);

  // Ticker overrides (same as PortfolioTab)
  const [tickerOverrides, setTickerOverrides] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('yf_overrides') || '{}'); } catch { return {}; }
  });
  const handleOverride = useCallback((csvTicker, newTicker) => {
    setTickerOverrides(prev => {
      const updated = { ...prev, [csvTicker]: newTicker };
      try { sessionStorage.setItem('yf_overrides', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  // Enrich open positions with yahoo ticker overrides
  const openEnriched = useMemo(() =>
    openPositions.map(p => ({
      ...p,
      yahooTicker: tickerOverrides[p.ticker] || p.yahooTicker,
    })),
  [openPositions, tickerOverrides]);

  // Fetch live prices for open positions + FX
  const allTickers = useMemo(() => [
    ...openEnriched.map(p => p.yahooTicker),
    ...FX_TICKERS,
  ], [openEnriched]);

  const { prices, loading, lastUpdated, refresh } = useMarketPrices(allTickers);

  const fxPrices = useMemo(() => ({
    'EURUSD=X': prices['EURUSD=X'],
    'EURGBP=X': prices['EURGBP=X'],
  }), [prices]);

  const fxLoaded = fxPrices['EURUSD=X']?.price != null;

  // Compute unrealized for each open position
  const unrealizedByTicker = useMemo(() => {
    const map = {};
    for (const p of openEnriched) {
      const data             = prices[p.yahooTicker];
      const priceNative      = data?.price ?? null;
      const currency         = data?.currency ?? p.moeda;
      const priceEur         = toEur(priceNative, currency, fxPrices);
      const currentValueEur  = priceEur !== null ? priceEur * p.currentQty : null;
      const pnlEur           = currentValueEur !== null ? currentValueEur - p.currentCostEur : null;
      const pnlPct           = pnlEur !== null && p.currentCostEur > 0 ? (pnlEur / p.currentCostEur) * 100 : null;
      map[p.ticker] = { priceNative, currency, priceEur, currentValueEur, pnlEur, pnlPct, changePercent: data?.changePercent ?? null };
    }
    return map;
  }, [openEnriched, prices, fxPrices]);

  // Aggregate totals including unrealized
  const totals = useMemo(() => {
    const unrealizedPnlEur   = openEnriched.reduce((s, p) => s + (unrealizedByTicker[p.ticker]?.pnlEur ?? 0), 0);
    const unrealizedCost     = openEnriched.reduce((s, p) => p.currentCostEur > 0 ? s + p.currentCostEur : s, 0);
    const pricesAvailable    = openEnriched.filter(p => unrealizedByTicker[p.ticker]?.pnlEur !== null).length;
    const totalLucro         = summary.totalRealizedLiq + unrealizedPnlEur + summary.totalDivLiq;
    const roiPct             = summary.totalInvestedEver > 0 ? (totalLucro / summary.totalInvestedEver) * 100 : null;
    return {
      unrealizedPnlEur,
      unrealizedCost,
      pricesAvailable,
      totalLucro,
      roiPct,
    };
  }, [openEnriched, unrealizedByTicker, summary]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── KPI Summary ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
        <KpiCard
          label="Lucro Realizado Líquido"
          value={fmt(summary.totalRealizedLiq)}
          sub={`Bruto: ${fmt(summary.totalRealizedBruto)} | IRS: ${fmt(summary.totalIRS)}`}
          color={summary.totalRealizedLiq >= 0 ? '#10b981' : '#ef4444'}
          icon="✅"
        />
        <KpiCard
          label="Lucro Não-Realizado"
          value={totals.pricesAvailable > 0 ? fmt(totals.unrealizedPnlEur) : '⏳'}
          sub={
            totals.pricesAvailable > 0
              ? `${totals.pricesAvailable}/${openEnriched.length} cotações`
              : 'A obter cotações...'
          }
          color={totals.unrealizedPnlEur >= 0 ? '#60a5fa' : '#ef4444'}
          icon="📊"
        />
        <KpiCard
          label="Dividendos Líquidos"
          value={summary.totalDivLiq > 0 ? fmt(summary.totalDivLiq) : '—'}
          sub={summary.totalDivBruto > 0 ? `Bruto: ${fmt(summary.totalDivBruto)} | Taxa: ${fmt(summary.totalDivTaxa)}` : 'Sem dividendos registados'}
          color="#fbbf24"
          icon="💰"
        />
        <KpiCard
          label="★ Lucro Total Real"
          value={fmt(totals.totalLucro)}
          sub="Realizado + Não-Real. + Dividendos"
          color={totals.totalLucro >= 0 ? '#f59e0b' : '#ef4444'}
          highlight
          icon="★"
        />
        <KpiCard
          label="ROI Global"
          value={fmtPct(totals.roiPct)}
          sub={`Capital total investido: ${fmt(summary.totalInvestedEver, 0)}`}
          color={totals.roiPct != null && totals.roiPct >= 0 ? '#a78bfa' : '#ef4444'}
          icon="📈"
        />
        <KpiCard
          label="Câmbio ao Vivo"
          value={fxLoaded
            ? `1€ = ${fxPrices['EURUSD=X']?.price?.toFixed(4)} $`
            : loading ? '⏳' : '—'}
          sub={fxLoaded && fxPrices['EURGBP=X']?.price
            ? `1€ = ${fxPrices['EURGBP=X']?.price?.toFixed(4)} £`
            : ''}
          color="#a78bfa"
          icon="💱"
        />
      </div>

      {/* Refresh + last updated */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)',
            color: '#a78bfa', borderRadius: 8, padding: '6px 14px', fontSize: 12,
            fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? `⏳ A obter cotações…` : '🔄 Atualizar Cotações'}
        </button>
        {lastUpdated && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            <span style={{ color: '#10b981' }}>●</span>{' '}
            Última actualização: {lastUpdated.toLocaleTimeString('pt-PT')} · Cache 30 min
          </span>
        )}
      </div>

      {/* ── Breakdown por Tipo ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '16px 20px 18px' }}>
        <h3 style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 14 }}>
          📂 Breakdown por Tipo de Ativo
        </h3>
        <TierBreakdown
          openPositions={openPositions}
          closedPositions={closedPositions}
          unrealizedByTicker={unrealizedByTicker}
        />
      </div>

      {/* ── Table 1: Open Positions (Unrealized) ─────────────────────────── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <SectionHeader
          title="📈 Posições Abertas — Lucro Não-Realizado"
          count={openEnriched.length}
          accent="#60a5fa"
        />
        <div style={{
          margin: '10px 20px 0', padding: '7px 12px',
          background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)',
          borderRadius: 8, fontSize: 12, color: '#60a5fa',
        }}>
          Compara o <strong>Preço Médio de Compra</strong> com o preço atual de mercado. P&amp;L calculado em €.
        </div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {[
                  { h: 'Ticker',          align: 'left'  },
                  { h: 'Tipo',            align: 'left'  },
                  { h: 'QTD',             align: 'right' },
                  { h: 'Preço Médio €',   align: 'right' },
                  { h: 'Custo Total €',   align: 'right' },
                  { h: 'Preço Atual €',   align: 'right' },
                  { h: 'Valor Atual €',   align: 'right' },
                  { h: 'P&L €',          align: 'right' },
                  { h: 'P&L %',          align: 'right' },
                ].map(({ h, align }) => (
                  <th key={h} style={{
                    padding: '9px 12px', textAlign: align,
                    color: 'var(--text-muted)', fontWeight: 600, fontSize: 11,
                    letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && openEnriched.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>⏳ A obter cotações…</td></tr>
              ) : openEnriched.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma posição aberta</td></tr>
              ) : (
                openEnriched.map(p => {
                  const u         = unrealizedByTicker[p.ticker] || {};
                  const tipoColor = TIPO_COLORS[p.tipo] || '#64748b';
                  const rowBg     = u.pnlEur != null
                    ? u.pnlEur > 0 ? 'rgba(16,185,129,0.03)' : u.pnlEur < 0 ? 'rgba(239,68,68,0.03)' : 'transparent'
                    : 'transparent';

                  return (
                    <tr
                      key={p.ticker}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg, transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    >
                      {/* Ticker */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            background: `${tipoColor}22`, border: `1px solid ${tipoColor}44`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: tipoColor, fontWeight: 700,
                          }}>
                            {p.ticker.slice(0, 2)}
                          </span>
                          <div>
                            <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>{p.ticker}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: 10 }}>{p.broker}</p>
                          </div>
                        </div>
                      </td>
                      {/* Tipo */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          background: `${tipoColor}1a`, color: tipoColor,
                          border: `1px solid ${tipoColor}33`,
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500,
                        }}>{p.tipo}</span>
                      </td>
                      {/* QTD */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
                        {fmtQty(p.currentQty)}
                      </td>
                      {/* Preço Médio */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {fmt(p.avgCurrentCostEur)}
                      </td>
                      {/* Custo Total */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {fmt(p.currentCostEur)}
                      </td>
                      {/* Preço Atual */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {u.priceEur != null ? (
                          <div>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(u.priceEur)}</span>
                            {u.changePercent != null && (
                              <div style={{ fontSize: 10, color: u.changePercent >= 0 ? '#10b981' : '#ef4444', marginTop: 1 }}>
                                {u.changePercent >= 0 ? '▲' : '▼'} {Math.abs(u.changePercent).toFixed(2)}% hoje
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            {loading ? '⏳' : '— sem cotação'}
                          </span>
                        )}
                      </td>
                      {/* Valor Atual */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {u.currentValueEur != null
                          ? <span style={{ color: 'var(--text-primary)' }}>{fmt(u.currentValueEur)}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* P&L € */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <PnLBadge value={u.pnlEur} />
                      </td>
                      {/* P&L % */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <PctBadge value={u.pnlPct} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Footer totals */}
            {openEnriched.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={4} style={{ padding: '11px 12px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                    TOTAL ABERTO ({totals.pricesAvailable}/{openEnriched.length} com cotação)
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    {fmt(summary.currentCostTotal)}
                  </td>
                  <td />
                  <td style={{ padding: '11px 12px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>
                    {fmt(openEnriched.reduce((s, p) => s + (unrealizedByTicker[p.ticker]?.currentValueEur ?? 0), 0))}
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                    <PnLBadge value={totals.unrealizedPnlEur} />
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                    <PctBadge value={summary.currentCostTotal > 0 ? (totals.unrealizedPnlEur / summary.currentCostTotal) * 100 : null} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Table 2: Closed / Realized Positions ──────────────────────────── */}
      {closedPositions.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <SectionHeader
            title="✅ Posições com Vendas — Lucro Realizado"
            count={closedPositions.length}
            accent="#10b981"
          />
          <div style={{
            margin: '10px 20px 0', padding: '7px 12px',
            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)',
            borderRadius: 8, fontSize: 12, color: '#34d399',
          }}>
            Valores de <strong>LucroBruto, IRS e LucroLíquido</strong> lidos diretamente do teu CSV (Opção A).
            Tickers com posição parcialmente aberta aparecem <em>também</em> na tabela de abertas.
          </div>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {[
                    { h: 'Ticker',              align: 'left'  },
                    { h: 'Tipo',                align: 'left'  },
                    { h: 'QTD Vendida',         align: 'right' },
                    { h: 'Preço Médio Compra',  align: 'right' },
                    { h: 'Preço Médio Venda',   align: 'right' },
                    { h: 'Lucro Bruto €',       align: 'right' },
                    { h: 'IRS €',               align: 'right' },
                    { h: '★ Lucro Líq. €',      align: 'right' },
                    { h: 'ROI %',               align: 'right' },
                  ].map(({ h, align }) => (
                    <th key={h} style={{
                      padding: '9px 12px', textAlign: align,
                      color: h === '★ Lucro Líq. €' ? '#10b981' : 'var(--text-muted)',
                      fontWeight: 600, fontSize: 11,
                      letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                      background: h === '★ Lucro Líq. €' ? 'rgba(16,185,129,0.06)' : 'transparent',
                      borderLeft: h === '★ Lucro Líq. €' ? '2px solid rgba(16,185,129,0.25)' : 'none',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closedPositions.map(p => {
                  const tipoColor = TIPO_COLORS[p.tipo] || '#64748b';
                  const roiPct    = p.realizedCostEur > 0 ? (p.realizedPnlLiq / p.realizedCostEur) * 100 : null;
                  const rowBg     = p.realizedPnlLiq > 0
                    ? 'rgba(16,185,129,0.03)'
                    : p.realizedPnlLiq < 0 ? 'rgba(239,68,68,0.03)' : 'transparent';

                  return (
                    <tr
                      key={p.ticker}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg, transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    >
                      {/* Ticker */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            background: `${tipoColor}22`, border: `1px solid ${tipoColor}44`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: tipoColor, fontWeight: 700,
                          }}>
                            {p.ticker.slice(0, 2)}
                          </span>
                          <div>
                            <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>{p.ticker}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                              {p.currentQty > 0.0001
                                ? <span style={{ color: '#60a5fa' }}>↑ Aberta parcialmente</span>
                                : <span style={{ color: '#6b7280' }}>Totalmente fechada</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Tipo */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          background: `${tipoColor}1a`, color: tipoColor,
                          border: `1px solid ${tipoColor}33`,
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500,
                        }}>{p.tipo}</span>
                      </td>
                      {/* QTD Vendida */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
                        {fmtQty(p.totalQtySold)}
                      </td>
                      {/* Preço Médio Compra */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {fmt(p.avgBuyPriceEur)}
                      </td>
                      {/* Preço Médio Venda */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {p.totalQtySold > 0 ? fmt(p.avgSellPriceEur) : '—'}
                      </td>
                      {/* Lucro Bruto */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <PnLBadge value={p.realizedPnlBruto} size={12} />
                      </td>
                      {/* IRS */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {p.realizedIRS > 0
                          ? <span style={{ color: '#ef4444', fontSize: 12 }}>−{fmt(p.realizedIRS)}</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                      </td>
                      {/* ★ Lucro Líquido */}
                      <td style={{
                        padding: '10px 12px', textAlign: 'right',
                        background: 'rgba(16,185,129,0.03)',
                        borderLeft: '2px solid rgba(16,185,129,0.2)',
                      }}>
                        <span style={{
                          color:      p.realizedPnlLiq > 0 ? '#10b981' : p.realizedPnlLiq < 0 ? '#ef4444' : 'var(--text-muted)',
                          fontWeight: 700, fontSize: 13,
                          background: p.realizedPnlLiq > 0 ? 'rgba(16,185,129,0.12)' : p.realizedPnlLiq < 0 ? 'rgba(239,68,68,0.1)' : 'transparent',
                          border:     `1px solid ${p.realizedPnlLiq > 0 ? 'rgba(16,185,129,0.35)' : p.realizedPnlLiq < 0 ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                          padding:    '3px 10px', borderRadius: 8, display: 'inline-block',
                        }}>
                          {p.realizedPnlLiq > 0 ? '+' : ''}{fmt(p.realizedPnlLiq)}
                        </span>
                      </td>
                      {/* ROI % */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <PctBadge value={roiPct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={5} style={{ padding: '11px 12px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                    TOTAL REALIZADO ({closedPositions.length} ativos com vendas)
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                    <PnLBadge value={summary.totalRealizedBruto} size={12} />
                  </td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 700, fontSize: 13 }}>
                    {summary.totalIRS > 0 ? `−${fmt(summary.totalIRS)}` : '—'}
                  </td>
                  <td style={{
                    padding: '11px 12px', textAlign: 'right',
                    background: 'rgba(16,185,129,0.05)',
                    borderLeft: '2px solid rgba(16,185,129,0.3)',
                  }}>
                    <span style={{
                      color: summary.totalRealizedLiq >= 0 ? '#10b981' : '#ef4444',
                      fontWeight: 800, fontSize: 14,
                    }}>
                      {summary.totalRealizedLiq > 0 ? '+' : ''}{fmt(summary.totalRealizedLiq)}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty state for closed */}
      {closedPositions.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '32px 20px', color: 'var(--text-muted)', gap: 8,
          background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 36 }}>🔒</span>
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Sem vendas registadas</p>
          <p style={{ fontSize: 12 }}>Quando registares uma venda, o lucro realizado aparecerá aqui.</p>
        </div>
      )}
    </div>
  );
}
