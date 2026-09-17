/**
 * AnnualTab.jsx
 *
 * Shows a year-by-year breakdown of the portfolio:
 *  - KPI cards: Realized P&L | Unrealized (at 31 Dec) | Dividends | Combined
 *  - Bar chart: stacked Realized + Unrealized per year
 *  - Table: open positions as of 31 Dec in the selected year with historical prices
 *  - Table: sales that occurred in the selected year
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Dot,
} from 'recharts';
import { computeAnnualSnapshot } from '../utils/computeAnnualSnapshot';
import { useHistoricalPrices }   from '../hooks/useHistoricalPrices';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v, decimals = 0) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function fmtQty(v) {
  if (!v && v !== 0) return '—';
  return v < 0.01 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : Number(v.toFixed(4)).toLocaleString('pt-PT');
}

function toEur(price, currency, fxRates) {
  if (price === null || price === undefined) return null;
  if (!currency || currency === 'EUR') return price;
  if (currency === 'USD') {
    const r = fxRates?.['EURUSD=X'];
    return r ? price / r : null;
  }
  if (currency === 'GBP') {
    const r = fxRates?.['EURGBP=X'];
    return r ? price / r : null;
  }
  if (currency === 'GBX' || currency === 'GBp') {
    const r = fxRates?.['EURGBP=X'];
    return r ? (price / 100) / r : null;
  }
  return price;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, dim }) {
  return (
    <div style={{
      background:   dim ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
      border:       `1px solid ${dim ? 'rgba(255,255,255,0.06)' : color + '44'}`,
      borderRadius: 14,
      padding:      '18px 20px',
      borderLeft:   `3px solid ${color}`,
      position:     'relative',
      overflow:     'hidden',
    }}>
      {/* glow */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 70, height: 70, borderRadius: '50%',
        background: color, opacity: 0.07, filter: 'blur(18px)',
        pointerEvents: 'none',
      }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ color, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function PnLBadge({ value }) {
  if (value === null || value === undefined || isNaN(value)) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span style={{
      color:      pos ? '#10b981' : neg ? '#ef4444' : 'var(--text-muted)',
      fontWeight: 700, fontSize: 13,
      background: pos ? 'rgba(16,185,129,0.1)' : neg ? 'rgba(239,68,68,0.1)' : 'transparent',
      padding:    '2px 8px', borderRadius: 6,
    }}>
      {pos ? '+' : ''}{fmt(value)}
    </span>
  );
}

function PctBadge({ value }) {
  if (value === null || value === undefined || isNaN(value)) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span style={{
      color:      pos ? '#10b981' : neg ? '#ef4444' : 'var(--text-muted)',
      fontWeight: 600, fontSize: 12,
      background: pos ? 'rgba(16,185,129,0.1)' : neg ? 'rgba(239,68,68,0.1)' : 'transparent',
      padding:    '2px 8px', borderRadius: 6,
    }}>
      {pos ? '▲' : neg ? '▼' : ''} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// Custom tooltip for recharts — professional card with delta
function ChartTooltip({ active, payload, label, chartData }) {
  if (!active || !payload?.length) return null;

  // Find previous year for delta calculation
  const idx   = chartData.findIndex(d => d.year === label);
  const prev  = idx > 0 ? chartData[idx - 1] : null;

  const rows = payload.filter(p => p.value !== null && p.value !== undefined);

  return (
    <div style={{
      background: 'rgba(15,23,42,0.97)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 14, padding: '14px 18px', fontSize: 12,
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      minWidth: 230,
      backdropFilter: 'blur(12px)',
    }}>
      {/* Year header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontSize: 16 }}>📅</span>
        <span style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 15 }}>{label}</span>
      </div>

      {rows.map(p => {
        const delta = prev ? (p.value - (prev[p.dataKey] ?? 0)) : null;
        const deltaPos = delta !== null && delta > 0;
        const deltaNeg = delta !== null && delta < 0;
        return (
          <div key={p.dataKey} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 7, gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: '#94a3b8', fontSize: 11 }}>{p.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 12 }}>{fmt(p.value)}</span>
              {delta !== null && Math.abs(delta) > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: deltaPos ? '#10b981' : deltaNeg ? '#ef4444' : '#64748b',
                  background: deltaPos ? 'rgba(16,185,129,0.12)' : deltaNeg ? 'rgba(239,68,68,0.1)' : 'transparent',
                  padding: '1px 5px', borderRadius: 4,
                }}>
                  {deltaPos ? '▲' : '▼'} {fmt(Math.abs(delta))}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TIPO_COLORS = {
  'Ação':         '#3b82f6',
  'ETF':          '#10b981',
  'Reit':         '#8b5cf6',
  'Criptomoedas': '#f59e0b',
  'Metais':       '#fcd34d',
};

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AnnualTab({ rows }) {
  // 1. Compute snapshots (pure, no API)
  const snapshots = useMemo(() => computeAnnualSnapshot(rows), [rows]);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(() => {
    // Default to last complete year, or current year if we have data for it
    return currentYear;
  });

  // Keep selectedYear in bounds when rows change
  useEffect(() => {
    if (snapshots.length > 0) {
      const years = snapshots.map(s => s.year);
      if (!years.includes(selectedYear)) {
        setSelectedYear(years[years.length - 1]);
      }
    }
  }, [snapshots, selectedYear]);

  const snapshot = snapshots.find(s => s.year === selectedYear);

  // 2. Build historical price requests for the selected year's open positions
  const fxRequests = useMemo(() => {
    if (!snapshot) return [];
    return [
      { ticker: 'EURUSD=X', year: selectedYear },
      { ticker: 'EURGBP=X', year: selectedYear },
    ];
  }, [snapshot, selectedYear]);

  const positionRequests = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.openPositions.map(p => ({
      ticker: p.yahooTicker,
      year:   selectedYear,
    }));
  }, [snapshot, selectedYear]);

  const allRequests = useMemo(
    () => [...fxRequests, ...positionRequests],
    [fxRequests, positionRequests]
  );

  const { prices, loading: pricesLoading, progress } = useHistoricalPrices(allRequests);

  // 3. Extract FX rates for the year
  const fxRates = useMemo(() => ({
    'EURUSD=X': prices[`EURUSD=X|${selectedYear}`]?.price ?? null,
    'EURGBP=X': prices[`EURGBP=X|${selectedYear}`]?.price ?? null,
  }), [prices, selectedYear]);

  // 4. Enrich open positions with historical prices
  const enrichedPositions = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.openPositions.map(p => {
      const key      = `${p.yahooTicker}|${selectedYear}`;
      const hist     = prices[key] ?? null;
      const priceNative = hist?.price ?? null;
      const currency    = hist?.currency ?? p.moeda;
      const priceEur    = toEur(priceNative, currency, fxRates);
      const marketValueEur = priceEur != null ? priceEur * p.qty : null;
      const pnlEur     = marketValueEur != null ? marketValueEur - p.costEur : null;
      const pnlPct     = pnlEur != null && p.costEur > 0 ? (pnlEur / p.costEur) * 100 : null;
      return { ...p, priceNative, currency, priceEur, marketValueEur, pnlEur, pnlPct };
    });
  }, [snapshot, prices, selectedYear, fxRates]);

  // 5. Total unrealized at year-end
  const unrealizedTotal = useMemo(() =>
    enrichedPositions.reduce((s, p) => s + (p.pnlEur ?? 0), 0),
  [enrichedPositions]);

  const unrealizedMarketValue = useMemo(() =>
    enrichedPositions.reduce((s, p) => s + (p.marketValueEur ?? p.costEur), 0),
  [enrichedPositions]);

  // 6. Sales in selected year (from rows)
  const salesInYear = useMemo(() => {
    if (!snapshot) return [];
    const yearBegin = new Date(selectedYear, 0, 1);
    const yearEnd   = new Date(selectedYear, 11, 31, 23, 59, 59);
    const parseDate = str => {
      if (!str) return null;
      const p = str.trim().split('/');
      if (p.length !== 3) return null;
      return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    };
    return rows.filter(r => {
      if ((r.QTDVenda || 0) <= 0) return false;
      const sd = parseDate(r.DataVenda || r.Data);
      return sd && sd >= yearBegin && sd <= yearEnd;
    });
  }, [rows, snapshot, selectedYear]);

  // 7. Chart data — all years overview with cumulative metrics
  const chartData = useMemo(() => {
    let cumRealized   = 0;
    let cumDividends  = 0;
    return snapshots.map(s => {
      cumRealized  += s.realizedLiq;
      cumDividends += s.dividendsLiq;
      return {
        year:                     String(s.year),
        'Capital Investido':      parseFloat(s.totalInvestedEver.toFixed(2)),
        'Capital em Carteira':    parseFloat(s.unrealizedCostTotal.toFixed(2)),
        'Lucro Realizado Acum.':  parseFloat(cumRealized.toFixed(2)),
        'Dividendos Acum.':       parseFloat(cumDividends.toFixed(2)),
      };
    });
  }, [snapshots]);

  const isCurrentYear = selectedYear === currentYear;

  // ── Render ──────────────────────────────────────────────────────────────────
  if (snapshots.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
        <p>Sem dados suficientes para análise anual.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Year Selector ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, marginRight: 4 }}>
          Selecionar Ano:
        </span>
        {snapshots.map(s => {
          const isSelected = s.year === selectedYear;
          const isCurrent  = s.year === currentYear;
          return (
            <button
              key={s.year}
              onClick={() => setSelectedYear(s.year)}
              style={{
                padding:      '7px 18px',
                borderRadius: 10,
                border:       isSelected
                  ? '2px solid #3b82f6'
                  : '1px solid rgba(255,255,255,0.1)',
                background:   isSelected
                  ? 'rgba(59,130,246,0.18)'
                  : isCurrent
                    ? 'rgba(245,158,11,0.07)'
                    : 'transparent',
                color:        isSelected ? '#60a5fa' : isCurrent ? '#fbbf24' : 'var(--text-secondary)',
                fontWeight:   isSelected ? 700 : 500,
                fontSize:     14,
                cursor:       'pointer',
                transition:   'all 0.15s',
                position:     'relative',
              }}
            >
              {s.year}
              {isCurrent && !isSelected && (
                <span style={{
                  position: 'absolute', top: -5, right: -4,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#f59e0b',
                }} />
              )}
            </button>
          );
        })}
        {isCurrentYear && (
          <span style={{
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            color: '#fbbf24', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600,
          }}>
            ⚡ Ano em curso — dados parciais
          </span>
        )}
      </div>

      {snapshot && (
        <>
          {/* ── KPI Cards ────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            <KpiCard
              label="Lucro Realizado Líq."
              value={fmt(snapshot.realizedLiq)}
              sub={snapshot.realizedBruto !== 0
                ? `Bruto: ${fmt(snapshot.realizedBruto)} | IRS: −${fmt(snapshot.realizedIRS)}`
                : 'Sem vendas neste ano'}
              color={snapshot.realizedLiq >= 0 ? '#10b981' : '#ef4444'}
            />
            <KpiCard
              label={`Não-Realizado em 31 Dez ${selectedYear}`}
              value={pricesLoading
                ? `⏳ ${progress.done}/${progress.total}`
                : enrichedPositions.some(p => p.pnlEur !== null)
                  ? fmt(unrealizedTotal)
                  : 'Sem cotação'}
              sub={`Custo base: ${fmt(snapshot.unrealizedCostTotal)} · ${snapshot.openPositions.length} pos.`}
              color={unrealizedTotal >= 0 ? '#60a5fa' : '#ef4444'}
            />
            <KpiCard
              label="Dividendos Líq."
              value={snapshot.dividendsLiq > 0 ? fmt(snapshot.dividendsLiq) : '—'}
              sub={snapshot.dividendsBruto > 0 ? `Bruto: ${fmt(snapshot.dividendsBruto)}` : 'Sem dividendos'}
              color="#fbbf24"
            />
            <KpiCard
              label={`★ P&L Total ${selectedYear}`}
              value={fmt(snapshot.realizedLiq + unrealizedTotal + snapshot.dividendsLiq)}
              sub="Realizado + Não-Real. + Dividendos"
              color="#a78bfa"
            />
            <KpiCard
              label="Capital em Carteira (31 Dez)"
              value={fmt(unrealizedMarketValue)}
              sub={`Custo base: ${fmt(snapshot.unrealizedCostTotal)}`}
              color="#64748b"
              dim
            />
            <KpiCard
              label="Capital Total Investido"
              value={fmt(snapshot.totalInvestedEver)}
              sub="Compras acumuladas até 31 Dez"
              color="#64748b"
              dim
            />
          </div>

          {/* ── Loading bar / Info for current year ────────────────────────── */}
          {isCurrentYear ? (
            <div style={{
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span style={{ color: '#fbbf24', fontSize: 13 }}>
                <strong>{selectedYear} ainda não terminou</strong> — preços históricos de 31 Dez indisponíveis.
                Para ver o valor atual das posições abertas usa a aba{' '}
                <strong>P&amp;L / Lucros</strong> ou <strong>Portfolio Atual</strong>.
              </span>
            </div>
          ) : pricesLoading ? (
            <div style={{
              background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                border: '2px solid #3b82f6', borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ color: '#60a5fa', fontSize: 13 }}>
                A obter preços históricos de 31 Dez {selectedYear}…{' '}
                ({progress.done}/{progress.total} concluídos)
              </span>
            </div>
          ) : null}

          {/* ── Chart: Year Overview (Line Chart) ───────────────────────────── */}
          <div className="card" style={{ padding: '22px 24px 16px' }}>
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  Evolução Patrimonial Anual
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Valores acumulados até 31 de Dezembro de cada ano · em Euros
                </p>
              </div>
              {/* Legend pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { color: '#3b82f6', label: 'Capital Investido', dash: false },
                  { color: '#64748b', label: 'Capital em Carteira', dash: true },
                  { color: '#10b981', label: 'Lucro Realizado Acum.', dash: false },
                  { color: '#fbbf24', label: 'Dividendos Acum.', dash: false },
                ].map(({ color, label, dash }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="20" height="8">
                      <line
                        x1="0" y1="4" x2="20" y2="4"
                        stroke={color} strokeWidth="2"
                        strokeDasharray={dash ? '4 3' : undefined}
                      />
                    </svg>
                    <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  {/* Defs for area gradients */}
                  <defs>
                    <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradYellow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#fbbf24" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => {
                      if (Math.abs(v) >= 1000000) return `${(v/1000000).toFixed(1)}M`;
                      if (Math.abs(v) >= 1000)    return `${(v/1000).toFixed(0)}k`;
                      return v;
                    }}
                    width={54}
                  />
                  <Tooltip
                    content={(props) => <ChartTooltip {...props} chartData={chartData} />}
                    cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1.5 }}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />

                  {/* Area fills (rendered first, behind lines) */}
                  <Area
                    type="monotone"
                    dataKey="Capital Investido"
                    stroke="none"
                    fill="url(#gradBlue)"
                    legendType="none"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={true}
                  />
                  <Area
                    type="monotone"
                    dataKey="Lucro Realizado Acum."
                    stroke="none"
                    fill="url(#gradGreen)"
                    legendType="none"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={true}
                  />
                  <Area
                    type="monotone"
                    dataKey="Dividendos Acum."
                    stroke="none"
                    fill="url(#gradYellow)"
                    legendType="none"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={true}
                  />

                  {/* Lines */}
                  <Line
                    type="monotone"
                    dataKey="Capital Investido"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ fill: '#3b82f6', r: 4, strokeWidth: 2, stroke: '#0f172a' }}
                    activeDot={{ r: 6, fill: '#3b82f6', stroke: '#0f172a', strokeWidth: 2 }}
                    legendType="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="Capital em Carteira"
                    stroke="#475569"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    dot={{ fill: '#475569', r: 3, strokeWidth: 2, stroke: '#0f172a' }}
                    activeDot={{ r: 5, fill: '#475569', stroke: '#0f172a', strokeWidth: 2 }}
                    legendType="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="Lucro Realizado Acum."
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#0f172a' }}
                    activeDot={{ r: 6, fill: '#10b981', stroke: '#0f172a', strokeWidth: 2 }}
                    legendType="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="Dividendos Acum."
                    stroke="#fbbf24"
                    strokeWidth={2}
                    dot={{ fill: '#fbbf24', r: 3.5, strokeWidth: 2, stroke: '#0f172a' }}
                    activeDot={{ r: 5.5, fill: '#fbbf24', stroke: '#0f172a', strokeWidth: 2 }}
                    legendType="none"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Bottom annotation */}
            <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
              Capital em Carteira = custo base das posições ainda abertas no final de cada ano.
              Lucro Realizado = soma acumulada de lucros líquidos após IRS (vendas fechadas).
            </p>
          </div>

          {/* ── Table: Open Positions at 31 Dec ──────────────────────────────── */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 15 }}>
                  📈 Posições Abertas em 31 Dez {selectedYear}
                </h3>
                <span style={{
                  background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 20, padding: '1px 9px', fontSize: 11, fontWeight: 600,
                }}>
                  {enrichedPositions.length}
                </span>
              </div>
              {isCurrentYear && (
                <span style={{ color: '#fbbf24', fontSize: 12 }}>
                  ⚡ Ano em curso — posições calculadas até hoje
                </span>
              )}
            </div>

            <div style={{
              margin: '10px 20px 0', padding: '7px 12px',
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: 8, fontSize: 12, color: '#60a5fa',
            }}>
              Preço histórico de fecho na última sessão antes de 31 Dez {selectedYear}.
              O P&L não-realizado mostra quanto lucravas (ou perdias) se tivesses vendido no último dia do ano.
            </div>

            {enrichedPositions.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Nenhuma posição aberta em 31 Dez {selectedYear}
              </div>
            ) : (
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
                        { h: `Preço 31 Dez ${selectedYear} €`, align: 'right' },
                        { h: 'Valor Mercado €', align: 'right' },
                        { h: 'P&L €',           align: 'right' },
                        { h: 'P&L %',           align: 'right' },
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
                    {enrichedPositions.map(p => {
                      const tipoColor = TIPO_COLORS[p.tipo] || '#64748b';
                      const rowBg = p.pnlEur != null
                        ? p.pnlEur > 0 ? 'rgba(16,185,129,0.03)' : p.pnlEur < 0 ? 'rgba(239,68,68,0.03)' : 'transparent'
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
                            {fmtQty(p.qty)}
                          </td>
                          {/* Preço Médio */}
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                            {p.qty > 0 ? fmt(p.costEur / p.qty, 2) : '—'}
                          </td>
                          {/* Custo Total */}
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {fmt(p.costEur)}
                          </td>
                          {/* Preço histórico */}
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            {p.priceEur != null ? (
                              <div>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(p.priceEur, 2)}</span>
                                {p.currency && p.currency !== 'EUR' && (
                                  <p style={{ color: 'var(--text-muted)', fontSize: 10 }}>{p.currency}</p>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                {pricesLoading ? '⏳' : '— sem dados'}
                              </span>
                            )}
                          </td>
                          {/* Valor Mercado */}
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                            {p.marketValueEur != null
                              ? <span style={{ color: 'var(--text-primary)' }}>{fmt(p.marketValueEur)}</span>
                              : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          {/* P&L € */}
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <PnLBadge value={p.pnlEur} />
                          </td>
                          {/* P&L % */}
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <PctBadge value={p.pnlPct} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Footer */}
                  <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                      <td colSpan={4} style={{ padding: '11px 12px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                        TOTAL ({enrichedPositions.filter(p => p.pnlEur !== null).length}/{enrichedPositions.length} com cotação histórica)
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700 }}>
                        {fmt(snapshot.unrealizedCostTotal)}
                      </td>
                      <td />
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>
                        {fmt(unrealizedMarketValue)}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        <PnLBadge value={unrealizedTotal} />
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        <PctBadge value={
                          snapshot.unrealizedCostTotal > 0
                            ? (unrealizedTotal / snapshot.unrealizedCostTotal) * 100
                            : null
                        } />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── Table: Sales In Year ──────────────────────────────────────────── */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 15 }}>
                ✅ Vendas Realizadas em {selectedYear}
              </h3>
              <span style={{
                background: 'rgba(16,185,129,0.15)', color: '#34d399',
                border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: 20, padding: '1px 9px', fontSize: 11, fontWeight: 600,
              }}>
                {salesInYear.length}
              </span>
            </div>

            {salesInYear.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Sem vendas registadas em {selectedYear}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {[
                        { h: 'Data Venda',       align: 'left'  },
                        { h: 'Ticker',           align: 'left'  },
                        { h: 'Tipo',             align: 'left'  },
                        { h: 'QTD',              align: 'right' },
                        { h: 'Valor Total €',    align: 'right' },
                        { h: 'Lucro Bruto €',    align: 'right' },
                        { h: 'IRS €',            align: 'right' },
                        { h: '★ Lucro Líq. €',   align: 'right' },
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
                    {salesInYear.map((r, i) => {
                      const tipoColor = TIPO_COLORS[r.Tipo] || '#64748b';
                      const pnl = r.LucroLiq || 0;
                      const rowBg = pnl > 0 ? 'rgba(16,185,129,0.03)' : pnl < 0 ? 'rgba(239,68,68,0.03)' : 'transparent';
                      return (
                        <tr
                          key={i}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg, transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = rowBg}
                        >
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                            {r.DataVenda || r.Data || '—'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                                background: `${tipoColor}22`, border: `1px solid ${tipoColor}44`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 9, color: tipoColor, fontWeight: 700,
                              }}>
                                {(r.Ticker || '').slice(0, 2)}
                              </span>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.Ticker}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              background: `${tipoColor}1a`, color: tipoColor,
                              border: `1px solid ${tipoColor}33`,
                              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500,
                            }}>{r.Tipo}</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
                            {fmtQty(r.QTDVenda)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {fmt(r.VTotalVendaEur)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <PnLBadge value={r.LucroBruto} />
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            {r.IRS > 0
                              ? <span style={{ color: '#ef4444', fontSize: 12 }}>−{fmt(r.IRS)}</span>
                              : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td style={{
                            padding: '10px 12px', textAlign: 'right',
                            background: 'rgba(16,185,129,0.03)',
                            borderLeft: '2px solid rgba(16,185,129,0.2)',
                          }}>
                            <span style={{
                              color:      pnl > 0 ? '#10b981' : pnl < 0 ? '#ef4444' : 'var(--text-muted)',
                              fontWeight: 700, fontSize: 13,
                              background: pnl > 0 ? 'rgba(16,185,129,0.12)' : pnl < 0 ? 'rgba(239,68,68,0.1)' : 'transparent',
                              border:     `1px solid ${pnl > 0 ? 'rgba(16,185,129,0.35)' : pnl < 0 ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                              padding:    '3px 10px', borderRadius: 8, display: 'inline-block',
                            }}>
                              {pnl > 0 ? '+' : ''}{fmt(pnl)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                      <td colSpan={5} style={{ padding: '11px 12px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                        TOTAL REALIZADO EM {selectedYear}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        <PnLBadge value={snapshot.realizedBruto} />
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>
                        {snapshot.realizedIRS > 0 ? `−${fmt(snapshot.realizedIRS)}` : '—'}
                      </td>
                      <td style={{
                        padding: '11px 12px', textAlign: 'right',
                        background: 'rgba(16,185,129,0.05)',
                        borderLeft: '2px solid rgba(16,185,129,0.3)',
                      }}>
                        <span style={{
                          color: snapshot.realizedLiq >= 0 ? '#10b981' : '#ef4444',
                          fontWeight: 800, fontSize: 14,
                        }}>
                          {snapshot.realizedLiq > 0 ? '+' : ''}{fmt(snapshot.realizedLiq)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Spin keyframe injected inline */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
