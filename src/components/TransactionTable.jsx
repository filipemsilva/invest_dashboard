import React, { useState, useMemo, useCallback, useEffect } from 'react';

/** Persist a filter value to sessionStorage so it survives page reloads */
function useSessionFilter(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try { return sessionStorage.getItem(key) ?? defaultValue; }
    catch { return defaultValue; }
  });
  const setAndPersist = useCallback((newVal) => {
    setValue(newVal);
    try { sessionStorage.setItem(key, newVal); } catch {}
  }, [key]);
  return [value, setAndPersist];
}

const PAGE_SIZE = 15;

const MESES_LABEL = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

/** Extract year (YYYY) and month index (0-11) from a DD/MM/YYYY string */
function parseDateParts(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const year = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(year)) return null;
  return { month, year };
}

function formatEur(v) {
  if (v === 0) return '—';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v);
}

function formatDate(str) {
  if (!str) return '—';
  return str;
}

function OpBadge({ op }) {
  const classes = {
    Compra: 'badge-buy',
    Venda: 'badge-sell',
    Dividendos: 'badge-div',
    Recebimento: 'badge-rec',
  };
  const labels = {
    Compra: '▲ Compra',
    Venda: '▼ Venda',
    Dividendos: '$ Dividendo',
    Recebimento: '✓ Recebimento',
  };
  return (
    <span className={`badge ${classes[op] || 'badge-div'}`}>
      {labels[op] || op}
    </span>
  );
}

export default function TransactionTable({ rows, onEdit, onDelete }) {
  const [tickerFilter, setTickerFilter] = useSessionFilter('tx_filter_ticker', '');
  const [opFilter,     setOpFilter]     = useSessionFilter('tx_filter_op', '');
  const [monthFilter,  setMonthFilter]  = useSessionFilter('tx_filter_month', '');
  const [yearFilter,   setYearFilter]   = useSessionFilter('tx_filter_year', '');
  const [page, setPage] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const operacoes = useMemo(() => {
    const set = new Set(rows.map(r => r.Operacao));
    return [...set].sort();
  }, [rows]);

  // Build dynamic year & month options from the data
  const { yearOptions, monthOptions } = useMemo(() => {
    const yearsSet = new Set();
    const monthsSet = new Set();
    rows.forEach(r => {
      const dateStr = (r.Operacao === 'Venda' && r.DataVenda) ? r.DataVenda : r.Data;
      const p = parseDateParts(dateStr);
      if (p) {
        yearsSet.add(p.year);
        monthsSet.add(p.month);
      }
    });
    const yearOptions = [...yearsSet].sort((a, b) => b - a); // newest first
    const monthOptions = [...monthsSet].sort((a, b) => a - b);
    return { yearOptions, monthOptions };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const tickerMatch = !tickerFilter || r.Ticker.toLowerCase().includes(tickerFilter.toLowerCase());
      const opMatch = !opFilter || r.Operacao === opFilter;
      const dateStr = (r.Operacao === 'Venda' && r.DataVenda) ? r.DataVenda : r.Data;
      const p = parseDateParts(dateStr);
      const yearMatch = !yearFilter || (p && p.year === parseInt(yearFilter, 10));
      const monthMatch = monthFilter === '' || (p && p.month === parseInt(monthFilter, 10));
      return tickerMatch && opMatch && yearMatch && monthMatch;
    });
  }, [rows, tickerFilter, opFilter, yearFilter, monthFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleTickerChange = (e) => { setTickerFilter(e.target.value); setPage(0); };
  const handleOpChange = (e) => { setOpFilter(e.target.value); setPage(0); };
  const handleYearChange = (e) => { setYearFilter(e.target.value); setPage(0); };
  const handleMonthChange = (e) => { setMonthFilter(e.target.value); setPage(0); };

  const handleDeleteClick = useCallback((id) => setConfirmDeleteId(id), []);
  const handleDeleteConfirm = useCallback(() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }, [onDelete, confirmDeleteId]);
  const handleDeleteCancel = useCallback(() => setConfirmDeleteId(null), []);

  return (
    <div className="card animate-fade-in" style={{ animationDelay: '250ms' }}>
      {/* Delete confirmation overlay */}
      {confirmDeleteId !== null && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 16, padding: '28px 32px', maxWidth: 360, textAlign: 'center',
            boxShadow: '0 20px 48px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Eliminar registo?</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
              Esta ação não pode ser desfeita. O registo será removido permanentemente.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={handleDeleteCancel} style={{
                padding: '9px 20px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500,
              }}>Cancelar</button>
              <button onClick={handleDeleteConfirm} style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #7f1d1d, #ef4444)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                boxShadow: '0 4px 14px rgba(239,68,68,0.35)',
              }}>🗑️ Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
          📋 Histórico de Transações
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
            ({filtered.length} de {rows.length})
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Filtrar Ticker..."
            value={tickerFilter}
            onChange={handleTickerChange}
            style={{ width: 140 }}
          />
          <select value={opFilter} onChange={handleOpChange} style={{ width: 150 }}>
            <option value="">Todas as Operações</option>
            {operacoes.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <select value={yearFilter} onChange={handleYearChange} style={{ width: 90 }}>
            <option value="">Todos os Anos</option>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={monthFilter} onChange={handleMonthChange} style={{ width: 105 }}>
            <option value="">Todos os Meses</option>
            {monthOptions.map(m => (
              <option key={m} value={m}>
                {MESES_LABEL[m].charAt(0).toUpperCase() + MESES_LABEL[m].slice(1)}
              </option>
            ))}
          </select>
          {(tickerFilter || opFilter || yearFilter || monthFilter !== '') && (
            <button
              onClick={() => { setTickerFilter(''); setOpFilter(''); setYearFilter(''); setMonthFilter(''); setPage(0); }}
              style={{
                background: 'rgba(239,68,68,0.15)',
                color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              ✕ Limpar
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Data', 'Operação', 'Tipo', 'Broker', 'Ticker', 'QTD', 'Valor Unit. €', 'Total €', 'Moeda', 'Lucro Líq.', ''].map((h, i) => (
                <th key={i} style={{
                  padding: '10px 14px',
                  textAlign: i >= 10 ? 'center' : 'left',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                  fontSize: 11,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Nenhuma transação encontrada
                </td>
              </tr>
            ) : paged.map((row) => {
              const isVenda = row.Operacao === 'Venda';
              const isDiv = row.Operacao === 'Dividendos' || row.Operacao === 'Recebimento';
              const total = isVenda ? row.VTotalVendaEur : row.ValorTotalEur;
              const unitPrice = isVenda ? row.ValorVendaEur : row.ValorCompraEur;
              const qty = isVenda ? row.QTDVenda : row.QTD;

              return (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {isVenda && row.DataVenda ? row.DataVenda : row.Data}
                  </td>
                  <td style={{ padding: '10px 14px' }}><OpBadge op={row.Operacao} /></td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>{row.Tipo}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>{row.Broker}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>
                      {row.Ticker}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', textAlign: 'right', fontSize: 12 }}>
                    {qty !== 0 ? qty.toLocaleString('pt-PT', { maximumFractionDigits: 6 }) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', textAlign: 'right', fontSize: 12 }}>
                    {unitPrice !== 0 ? formatEur(unitPrice) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>
                    {total !== 0 ? formatEur(total) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{row.Moeda || '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                    {isVenda ? (
                      <span style={{ color: row.LucroLiq >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {formatEur(row.LucroLiq)}
                      </span>
                    ) : '—'}
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '10px 10px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                      <button
                        onClick={() => onEdit(row)}
                        title="Editar"
                        style={{
                          background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
                          color: '#60a5fa', borderRadius: 7, padding: '4px 8px', fontSize: 13, lineHeight: 1,
                        }}
                      >✏️</button>
                      <button
                        onClick={() => handleDeleteClick(row.id)}
                        title="Eliminar"
                        style={{
                          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                          color: '#f87171', borderRadius: 7, padding: '4px 8px', fontSize: 13, lineHeight: 1,
                        }}
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Página {page + 1} de {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: 'var(--accent-blue)',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
