import React, { useMemo, useState } from 'react';
import { computeSavings } from '../utils/computeSavings';

function formatEur(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function formatPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

const TIPO_CONFIG = {
  'C.Aforro': { color: '#34d399', icon: '🏦', label: 'Certificados de Aforro' },
  'P2P':      { color: '#f59e0b', icon: '🤝', label: 'Investimentos P2P' },
};

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="card p-4" style={{ borderLeft: `3px solid ${color}` }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</p>
      <p style={{ color, fontSize: 22, fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function PlatformCard({ platform, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const cfg = TIPO_CONFIG[platform.tipo] || { color: '#60a5fa', icon: '💰', label: platform.tipo };

  const pnlColor = platform.totalReceived > 0 ? '#10b981' : 'var(--text-muted)';
  const balanceColor = platform.capitalAtivo > 0 ? '#60a5fa' : 'var(--text-muted)';

  return (
    <div className="card" style={{ overflow: 'hidden', borderTop: `3px solid ${cfg.color}` }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '16px 20px',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto auto auto auto',
          alignItems: 'center', gap: 14,
          textAlign: 'left',
        }}
      >
        {/* Icon + Name */}
        <span style={{ fontSize: 22 }}>{cfg.icon}</span>
        <div>
          <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 15 }}>{platform.label}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
            <span style={{
              background: `${cfg.color}22`, color: cfg.color,
              border: `1px solid ${cfg.color}44`,
              borderRadius: 5, padding: '1px 7px', fontSize: 10, fontWeight: 600, marginRight: 6,
            }}>{platform.tipo}</span>
            {platform.entries.length} operações
          </p>
        </div>

        {/* Stats */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Investido</p>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 14 }}>{formatEur(platform.totalInvested)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Capital Ativo</p>
          <p style={{ color: balanceColor, fontWeight: 600, fontSize: 14 }}>{formatEur(platform.capitalAtivo)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Rendimento recebido</p>
          <p style={{ color: pnlColor, fontWeight: 700, fontSize: 14 }}>{formatEur(platform.totalReceived)}</p>
          {platform.yieldPct > 0 && (
            <p style={{ color: '#10b981', fontSize: 10, marginTop: 1 }}>{formatPct(platform.yieldPct)}</p>
          )}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Expandable movement history */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', overflowX: 'auto' }}>
          {platform.entries.length === 0 ? (
            <p style={{ padding: '20px 24px', color: 'var(--text-muted)', fontSize: 13 }}>Sem movimentos registados.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Data', 'Operação', 'Descrição', 'Valor €'].map(h => (
                    <th key={h} style={{
                      padding: '9px 18px', textAlign: h === 'Valor €' ? 'right' : 'left',
                      color: 'var(--text-muted)', fontWeight: 500, fontSize: 11,
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {platform.entries.map((e, i) => {
                  const opColor = e.op === 'Recebimento' ? '#10b981' : e.op === 'Venda' ? '#ef4444' : '#60a5fa';
                  const opLabel = e.op === 'Compra' ? '📥 Compra' : e.op === 'Recebimento' ? '💰 Recebimento' : '📤 Levantamento';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '9px 18px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{e.date}</td>
                      <td style={{ padding: '9px 18px' }}>
                        <span style={{
                          background: `${opColor}18`, color: opColor,
                          border: `1px solid ${opColor}33`,
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                        }}>{opLabel}</span>
                      </td>
                      <td style={{ padding: '9px 18px', color: 'var(--text-muted)', fontSize: 12 }}>{e.note}</td>
                      <td style={{ padding: '9px 18px', textAlign: 'right', fontWeight: 600, color: opColor }}>
                        {e.op !== 'Compra' ? '+' : ''}{formatEur(e.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* running total footer */}
              <tfoot>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={3} style={{ padding: '10px 18px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                    BALANÇO ESTIMADO
                    <span style={{ fontSize: 10, marginLeft: 6 }}>(capital + rendimentos)</span>
                  </td>
                  <td style={{ padding: '10px 18px', textAlign: 'right', color: '#34d399', fontWeight: 700, fontSize: 15 }}>
                    {formatEur(platform.estimatedValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function SavingsTab({ rows }) {
  const savings = useMemo(() => computeSavings(rows), [rows]);

  const p2p = savings.filter(p => p.tipo === 'P2P');
  const caforro = savings.filter(p => p.tipo === 'C.Aforro');

  // Grand totals
  const totals = useMemo(() => {
    const totalInvested = savings.reduce((s, p) => s + p.totalInvested, 0);
    const totalReceived = savings.reduce((s, p) => s + p.totalReceived, 0);
    const totalWithdrawn = savings.reduce((s, p) => s + p.totalWithdrawn, 0);
    const capitalAtivo = savings.reduce((s, p) => s + p.capitalAtivo, 0);
    const estimatedValue = savings.reduce((s, p) => s + p.estimatedValue, 0);
    const yieldPct = totalInvested > 0 ? (totalReceived / totalInvested) * 100 : 0;
    return { totalInvested, totalReceived, totalWithdrawn, capitalAtivo, estimatedValue, yieldPct };
  }, [savings]);

  if (savings.length === 0) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏦</div>
        <h3 style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Nenhum dado P2P ou Poupança</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 380, margin: '8px auto 0' }}>
          Carrega o teu CSV para ver os Certificados de Aforro e investimentos P2P.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Global KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 14 }}>
        <KpiCard label="Total Depositado" value={formatEur(totals.totalInvested)} sub={`${savings.length} plataformas`} color="#60a5fa" />
        <KpiCard label="Capital Ativo" value={formatEur(totals.capitalAtivo)} sub="depositado − levantamentos" color="#a78bfa" />
        <KpiCard label="Juros / Rendimentos" value={formatEur(totals.totalReceived)} sub={formatPct(totals.yieldPct) + ' s/ investido'} color="#10b981" />
        <KpiCard label="Valor Estimado Total" value={formatEur(totals.estimatedValue)} sub="capital + rendimentos" color="#34d399" />
      </div>

      {/* C.Aforro section */}
      {caforro.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: 'rgba(52,211,153,0.15)', color: '#34d399',
              border: '1px solid rgba(52,211,153,0.3)',
              borderRadius: 8, padding: '3px 10px', fontSize: 12,
            }}>🏦 Certificados de Aforro</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>
              {formatEur(caforro.reduce((s, p) => s + p.capitalAtivo, 0))} em capital •{' '}
              {formatEur(caforro.reduce((s, p) => s + p.totalReceived, 0))} em juros recebidos
            </span>
          </h3>
          {caforro.map(p => <PlatformCard key={p.key} platform={p} defaultOpen />)}
        </div>
      )}

      {/* P2P section */}
      {p2p.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 8, padding: '3px 10px', fontSize: 12,
            }}>🤝 Investimentos P2P</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>
              {formatEur(p2p.reduce((s, p) => s + p.capitalAtivo, 0))} em capital •{' '}
              {formatEur(p2p.reduce((s, p) => s + p.totalReceived, 0))} em rendimentos recebidos
            </span>
          </h3>
          {p2p.map(p => <PlatformCard key={p.key} platform={p} defaultOpen={p2p.length <= 3} />)}
        </div>
      )}

      {/* Info note */}
      <div style={{
        padding: '10px 14px', background: 'rgba(96,165,250,0.07)',
        border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, fontSize: 12, color: '#93c5fd',
      }}>
        ℹ️ O <strong>Valor Estimado</strong> soma o capital ainda ativo com os rendimentos já recebidos registados no CSV.
        Para uma visão exata do saldo atual, actualiza os valores diretamente na plataforma (Bondora Go&amp;Grow, CTT, etc.).
      </div>
    </div>
  );
}
