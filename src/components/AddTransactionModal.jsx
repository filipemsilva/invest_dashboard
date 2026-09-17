import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFxRates } from '../hooks/useFxRates';

const TIPOS = ['Ação', 'ETF', 'Criptomoedas', 'Metais', 'Reit', 'P2P', 'C.Aforro', 'Dividendos'];
const BROKERS = ['XTB', 'Degiro', 'BPI', 'Trading212', 'Coinbase', 'Revolut', 'Bondora', 'Freedom', 'VIA', 'CTT', 'Outro'];
const MOEDAS = ['EUR', 'USD', 'GBP', 'GBX', 'CAD'];

// Câmbio: quanto vale 1 unidade da moeda em EUR (ValorEur = Valor * Cambio)
// Ex: 1 USD ≈ 0.925 EUR,  1 GBP ≈ 1.17 EUR,  1 GBX (penny) ≈ 0.0117 EUR,  1 CAD ≈ 0.68 EUR
const DEFAULT_FX = { EUR: '1', USD: '0.925', GBP: '1.17', GBX: '0.0117', CAD: '0.68' };

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function thisMonth() {
  return MESES[new Date().getMonth()];
}
/** Derive month abbreviation from a DD/MM/YYYY string. Returns null if invalid. */
function monthFromDate(dateStr) {
  const parts = (dateStr || '').split('/');
  if (parts.length !== 3) return null;
  const m = parseInt(parts[1], 10);
  if (isNaN(m) || m < 1 || m > 12) return null;
  return MESES[m - 1];
}

const EMPTY_COMPRA = {
  Data: today(), Mes: thisMonth(), Operacao: 'Compra', Tipo: 'Ação',
  Broker: 'XTB', Ticker: '', QTD: '', ValorCompra: '', ValorTotal: '',
  Taxa: '0', Cambio: DEFAULT_FX['EUR'], Moeda: 'EUR', ValorCompraEur: '', ValorTotalEur: '', TaxaEur: '0',
  _taxaManual: false, _cambioManual: false, _lucroManual: false,
};
const EMPTY_VENDA = {
  Data: today(), Mes: thisMonth(), Operacao: 'Venda', Tipo: 'Ação',
  Broker: 'XTB', Ticker: '', DataVenda: today(), QTDVenda: '', ValorVenda: '', VTotalVenda: '',
  TaxaVenda: '0', CambioVenda: DEFAULT_FX['EUR'], ValorVendaEur: '', VTotalVendaEur: '',
  TaxaVendaEur: '0', LucroBruto: '', IRS: '0', LucroLiq: '',
  _taxaManual: false, _cambioManual: false, _lucroManual: false,
};
const EMPTY_DIV = {
  Data: today(), Mes: thisMonth(), Operacao: 'Dividendos', Tipo: 'Dividendos',
  Broker: 'XTB', Ticker: '', QTD: '', ValorCompra: '', ValorTotal: '',
  Taxa: '0', Cambio: DEFAULT_FX['EUR'], Moeda: 'EUR', ValorCompraEur: '', ValorTotalEur: '', TaxaEur: '0',
  _taxaManual: false, _cambioManual: false, _lucroManual: false,
};
const EMPTY_REC = {
  Data: today(), Mes: thisMonth(), Operacao: 'Recebimento', Tipo: 'C.Aforro',
  Broker: 'CTT', Ticker: 'C.Aforro', QTD: '1', ValorCompra: '', ValorTotal: '',
  Taxa: '0', Cambio: DEFAULT_FX['EUR'], Moeda: 'EUR', ValorCompraEur: '', ValorTotalEur: '', TaxaEur: '0',
  _taxaManual: false, _cambioManual: false, _lucroManual: false,
};

/** Convert a saved numeric row back to string form for the form */
function rowToFormState(row) {
  const s = (v) => (v === 0 || v === undefined || v === null) ? '' : String(v);
  return {
    Data: row.Data || today(),
    Mes: row.Mes || thisMonth(),
    Operacao: row.Operacao || 'Compra',
    Tipo: row.Tipo || 'Ação',
    Broker: row.Broker || '',
    Ticker: row.Ticker || '',
    Moeda: row.Moeda || 'EUR',
    QTD: s(row.QTD),
    ValorCompra: s(row.ValorCompra),
    ValorTotal: s(row.ValorTotal),
    Taxa: s(row.Taxa),
    Cambio: s(row.Cambio),
    ValorCompraEur: s(row.ValorCompraEur),
    ValorTotalEur: s(row.ValorTotalEur),
    TaxaEur: s(row.TaxaEur),
    DataVenda: row.DataVenda || today(),
    QTDVenda: s(row.QTDVenda),
    ValorVenda: s(row.ValorVenda),
    VTotalVenda: s(row.VTotalVenda),
    TaxaVenda: s(row.TaxaVenda),
    CambioVenda: s(row.CambioVenda),
    ValorVendaEur: s(row.ValorVendaEur),
    VTotalVendaEur: s(row.VTotalVendaEur),
    TaxaVendaEur: s(row.TaxaVendaEur),
    LucroBruto: s(row.LucroBruto),
    IRS: s(row.IRS),
    LucroLiq: s(row.LucroLiq),
  };
}

function Field({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, placeholder }) {
  return <input type="text" inputMode="decimal" value={value} onChange={onChange} placeholder={placeholder || '0,00'} style={{ width: '100%' }} />;
}

function SelectInput({ value, onChange, options }) {
  return (
    <select value={value} onChange={onChange} style={{ width: '100%' }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}

/**
 * Compute FIFO cost basis in EUR for `qtyToSell` units of `ticker`.
 * Returns { costEur, lotsUsed, missingQty }
 * lotsUsed = array of { date, qty, unitCostEur } for display.
 */
function computeFifoCost(allRows, ticker, qtyToSell) {
  const lots = allRows
    .filter(r => r.Ticker === ticker && r.Operacao === 'Compra' && (r.QTD || 0) > 0)
    .map(r => ({
      dateStr: r.Data || '',
      dateObj: r.dateObj || new Date(0),
      qty: parseFloat(r.QTD) || 0,
      unitCostEur: parseFloat(r.ValorCompraEur) ||
        (parseFloat(r.ValorCompra || 0) * parseFloat(r.Cambio || 1)),
    }))
    .sort((a, b) => a.dateObj - b.dateObj); // oldest first = FIFO

  let remaining = qtyToSell;
  let costEur = 0;
  const lotsUsed = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const used = Math.min(remaining, lot.qty);
    const cost = used * lot.unitCostEur;
    costEur += cost;
    lotsUsed.push({ dateStr: lot.dateStr, qty: used, unitCostEur: lot.unitCostEur });
    remaining -= used;
  }

  return { costEur, lotsUsed, missingQty: remaining };
}

/**
 * Props:
 *   onClose   – close modal
 *   onAdd     – called with new row (add mode)
 *   onUpdate  – called with (id, updatedRow) (edit mode)
 *   editRow   – if provided, modal opens in edit mode pre-populated with this row
 *   existingTickers – string[]
 *   allRows   – all existing rows (for FIFO cost basis)
 */
export default function AddTransactionModal({ onClose, onAdd, onUpdate, editRow, existingTickers = [], allRows = [] }) {
  const isEdit = Boolean(editRow);

  const [opType, setOpType] = useState(editRow?.Operacao || 'Compra');
  const [form, setForm] = useState(() => editRow ? rowToFormState(editRow) : { ...EMPTY_COMPRA });
  const [errors, setErrors] = useState({});

  // Live FX rates from Yahoo Finance
  const { rates: liveRates, loading: fxLoading } = useFxRates();
  // Keep a ref to always access the latest live rates inside callbacks
  const liveRatesRef = useRef(liveRates);
  useEffect(() => { liveRatesRef.current = liveRates; }, [liveRates]);

  // Keep allRows in a ref so the set() callback can access current rows
  const allRowsRef = useRef(allRows);
  useEffect(() => { allRowsRef.current = allRows; }, [allRows]);

  // Derived from form state (stored inside form so useCallback can see it)
  const taxaManual = form._taxaManual ?? false;
  const cambioManual = form._cambioManual ?? false;
  const lucroManual = form._lucroManual ?? false;

  // FIFO info for display (recomputed from current form values)
  const fifoInfo = React.useMemo(() => {
    if (opType !== 'Venda' || !form.Ticker || !form.QTDVenda) return null;
    const qty = parseFloat(String(form.QTDVenda).replace(',', '.')) || 0;
    if (qty <= 0) return null;
    return computeFifoCost(allRows, form.Ticker, qty);
  }, [opType, form.Ticker, form.QTDVenda, allRows]);

  // When live rates arrive and Cambio was NOT manually edited, update it
  // In edit mode, never overwrite the saved exchange rate with live rates
  useEffect(() => {
    if (fxLoading) return;
    if (isEdit) return; // editing an existing record — keep the saved rate
    setForm(prev => {
      if (prev._cambioManual) return prev; // user has overridden, don't touch
      const moeda = prev.Moeda || 'EUR';
      const newCambio = String(liveRates[moeda] ?? liveRates['EUR'] ?? 1);
      if (newCambio === prev.Cambio) return prev; // no change
      // Recalculate EUR values
      const next = { ...prev, Cambio: newCambio };
      const cambio = parseFloat(newCambio) || 1;
      const qtd = parseFloat(String(next.QTD).replace(',', '.')) || 0;
      const vu = parseFloat(String(next.ValorCompra).replace(',', '.')) || 0;
      const taxa = parseFloat(String(next.Taxa).replace(',', '.')) || 0;
      next.ValorCompraEur = (vu * cambio).toFixed(5);
      next.ValorTotalEur = ((qtd * vu) * cambio).toFixed(5);
      next.TaxaEur = (taxa * cambio).toFixed(5);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRates, fxLoading]);

  // When switching op tabs in ADD mode, reset the form template
  const handleOpTypeChange = (newOp) => {
    if (isEdit) return;
    setOpType(newOp);
    if (newOp === 'Compra') setForm({ ...EMPTY_COMPRA });
    else if (newOp === 'Venda') setForm({ ...EMPTY_VENDA });
    else if (newOp === 'Dividendos') setForm({ ...EMPTY_DIV });
    else setForm({ ...EMPTY_REC });
    setErrors({});
  };

  // Handler for manual Taxa edit — marks _taxaManual = true in form
  const handleTaxaChange = (val) => {
    setForm(prev => {
      const next = { ...prev, Taxa: val, _taxaManual: true };
      const taxa = parseFloat(String(val).replace(',', '.')) || 0;
      const cambio = parseFloat(String(next.Cambio).replace(',', '.')) || 1;
      next.TaxaEur = (taxa * cambio).toFixed(5);
      return next;
    });
  };

  // Handler for manual Câmbio edit — marks _cambioManual = true in form
  const handleCambioChange = (val) => {
    setForm(prev => {
      const next = { ...prev, Cambio: val, _cambioManual: true };
      const qtd = parseFloat(String(next.QTD).replace(',', '.')) || 0;
      const vu = parseFloat(String(next.ValorCompra).replace(',', '.')) || 0;
      const taxa = parseFloat(String(next.Taxa).replace(',', '.')) || 0;
      const cambio = parseFloat(String(val).replace(',', '.')) || 1;
      next.ValorCompraEur = (vu * cambio).toFixed(5);
      next.ValorTotalEur = ((qtd * vu) * cambio).toFixed(5);
      next.TaxaEur = (taxa * cambio).toFixed(5);
      return next;
    });
  };

  // Handler for manual LucroBruto override — marks _lucroManual = true in form
  const handleLucroBrutoChange = (val) => {
    setForm(prev => {
      const next = { ...prev, LucroBruto: val, _lucroManual: true };
      const lucroB = parseFloat(String(val).replace(',', '.')) || 0;
      const irs = lucroB > 0 ? lucroB * 0.28 : 0;
      next.IRS = irs.toFixed(5);
      next.LucroLiq = (lucroB - irs).toFixed(5);
      return next;
    });
  };

  const set = useCallback((key, val) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      const op = next.Operacao;

      // --- Auto-derive Mês from Data ---
      if (key === 'Data' || key === 'DataVenda') {
        const derived = monthFromDate(val);
        if (derived) next.Mes = derived;
      }

      // --- Auto-fill Câmbio from Moeda (reset manual override, use live rate) ---
      if (key === 'Moeda') {
        next._cambioManual = false;
        next._taxaManual = false;
        const live = liveRatesRef.current;
        const liveVal = live?.[val];
        next.Cambio = liveVal != null ? String(liveVal) : (DEFAULT_FX[val] ?? '1');
      }

      if (['Compra', 'Dividendos', 'Recebimento'].includes(op)) {
        const qtd = parseFloat(String(next.QTD).replace(',', '.')) || 0;
        const vu = parseFloat(String(next.ValorCompra).replace(',', '.')) || 0;
        const cambio = parseFloat(String(next.Cambio).replace(',', '.')) || 1;
        const bruto = qtd * vu;

        // Auto-calculate Taxa as 28% of gross for Dividendos (respects _taxaManual flag in form)
        let taxa;
        if (op === 'Dividendos' && !next._taxaManual) {
          taxa = bruto > 0 ? bruto * 0.28 : 0;
          next.Taxa = taxa.toFixed(5);
        } else {
          taxa = parseFloat(String(next.Taxa).replace(',', '.')) || 0;
        }

        if (qtd && vu) next.ValorTotal = bruto.toFixed(5);
        const vt = parseFloat(String(next.ValorTotal).replace(',', '.')) || 0;
        next.ValorCompraEur = (vu * cambio).toFixed(5);
        next.ValorTotalEur = (vt * cambio).toFixed(5);
        next.TaxaEur = (taxa * cambio).toFixed(5);
      }
      if (op === 'Venda') {
        const qtd = parseFloat(String(next.QTDVenda).replace(',', '.')) || 0;
        const vu = parseFloat(String(next.ValorVenda).replace(',', '.')) || 0;
        const taxa = parseFloat(String(next.TaxaVenda).replace(',', '.')) || 0;
        const cambio = parseFloat(String(next.CambioVenda).replace(',', '.')) || 1;
        if (qtd && vu) next.VTotalVenda = (qtd * vu).toFixed(5);
        const vt = parseFloat(String(next.VTotalVenda).replace(',', '.')) || 0;
        next.ValorVendaEur = (vu * cambio).toFixed(5);
        next.VTotalVendaEur = (vt * cambio).toFixed(5);
        next.TaxaVendaEur = (taxa * cambio).toFixed(5);

        // FIFO auto-fill Lucro Bruto (unless manually overridden)
        if (!next._lucroManual && qtd > 0 && vu > 0 && next.Ticker) {
          const { costEur } = computeFifoCost(allRowsRef.current, next.Ticker, qtd);
          const vTotalEur = (vt || qtd * vu) * cambio;
          const taxaEur = taxa * cambio;
          const lucroB = vTotalEur - costEur - taxaEur;
          next.LucroBruto = lucroB.toFixed(5);
          const irs = lucroB > 0 ? lucroB * 0.28 : 0;
          next.IRS = irs.toFixed(5);
          next.LucroLiq = (lucroB - irs).toFixed(5);
        } else {
          const lucroB = parseFloat(String(next.LucroBruto).replace(',', '.')) || 0;
          const irs = lucroB > 0 ? lucroB * 0.28 : 0;
          next.IRS = irs.toFixed(5);
          next.LucroLiq = (lucroB - irs).toFixed(5);
        }
      }
      return next;
    });
  }, []);

  function validate() {
    const errs = {};
    if (!form.Ticker.trim()) errs.Ticker = 'Obrigatório';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function buildRow() {
    const toNum = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
    const row = {
      ...form,
      QTD: toNum(form.QTD), ValorCompra: toNum(form.ValorCompra), ValorTotal: toNum(form.ValorTotal),
      Taxa: toNum(form.Taxa), Cambio: toNum(form.Cambio),
      ValorCompraEur: toNum(form.ValorCompraEur), ValorTotalEur: toNum(form.ValorTotalEur), TaxaEur: toNum(form.TaxaEur),
      QTDVenda: toNum(form.QTDVenda), ValorVenda: toNum(form.ValorVenda), VTotalVenda: toNum(form.VTotalVenda),
      TaxaVenda: toNum(form.TaxaVenda), CambioVenda: toNum(form.CambioVenda),
      ValorVendaEur: toNum(form.ValorVendaEur), VTotalVendaEur: toNum(form.VTotalVendaEur), TaxaVendaEur: toNum(form.TaxaVendaEur),
      LucroBruto: toNum(form.LucroBruto), IRS: toNum(form.IRS), LucroLiq: toNum(form.LucroLiq),
      _manual: true,
    };
    const parts = (form.Data || '').split('/');
    if (parts.length === 3) row.dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    if (form.DataVenda) {
      const p2 = form.DataVenda.split('/');
      if (p2.length === 3) row.dateVendaObj = new Date(parseInt(p2[2]), parseInt(p2[1]) - 1, parseInt(p2[0]));
    }
    return row;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    const row = buildRow();
    if (isEdit) {
      onUpdate(editRow.id, row);
    } else {
      onAdd({ ...row, id: Date.now() });
    }
    onClose();
  }

  const isCompraLike = opType === 'Compra' || opType === 'Dividendos' || opType === 'Recebimento';

  const OP_TABS = [
    { id: 'Compra',      label: '▲ Compra',      color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    { id: 'Venda',       label: '▼ Venda',        color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    { id: 'Dividendos',  label: '$ Dividendo',    color: '#60a5fa', bg: 'rgba(59,130,246,0.15)' },
    { id: 'Recebimento', label: '✓ Recebimento',  color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'min(680px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 5, borderRadius: '20px 20px 0 0',
        }}>
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17 }}>
              {isEdit ? '✏️ Editar Registo' : '➕ Novo Registo'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
              {isEdit ? `A editar: ${editRow.Ticker} — ${editRow.Operacao}` : 'Preencha os campos abaixo'}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)', borderRadius: 10, width: 34, height: 34,
            fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Op tabs */}
        <div style={{ padding: '16px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {OP_TABS.map(t => (
            <button key={t.id} onClick={() => handleOpTypeChange(t.id)} style={{
              padding: '7px 14px', borderRadius: 10,
              border: `1px solid ${opType === t.id ? t.color : 'rgba(255,255,255,0.1)'}`,
              background: opType === t.id ? t.bg : 'transparent',
              color: opType === t.id ? t.color : 'var(--text-muted)',
              fontWeight: opType === t.id ? 600 : 400, fontSize: 13,
              opacity: isEdit ? 0.5 : 1,
              cursor: isEdit ? 'not-allowed' : 'pointer',
            }}>{t.label}</button>
          ))}
          {isEdit && <span style={{ color: 'var(--text-muted)', fontSize: 11, alignSelf: 'center', marginLeft: 4 }}>tipo fixo em edição</span>}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Data" required>
              <input type="text" value={form.Data} onChange={e => set('Data', e.target.value)} placeholder="DD/MM/AAAA" style={{ width: '100%' }} />
            </Field>
            <Field label="Mês">
              <div style={{ position: 'relative' }}>
                <SelectInput value={form.Mes} onChange={e => set('Mes', e.target.value)}
                  options={MESES} />
                <span style={{
                  position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none',
                }}>auto</span>
              </div>
            </Field>

            <Field label="Tipo" required>
              <SelectInput value={form.Tipo} onChange={e => set('Tipo', e.target.value)} options={TIPOS} />
            </Field>
            <Field label="Broker" required>
              <>
                <datalist id="broker-list">{BROKERS.map(b => <option key={b} value={b}/>)}</datalist>
                <input type="text" value={form.Broker} onChange={e => set('Broker', e.target.value)} placeholder="ex: XTB" list="broker-list" style={{ width: '100%' }} />
              </>
            </Field>

            <Field label="Ticker" required>
              <>
                <datalist id="ticker-list">{[...new Set(existingTickers)].map(t => <option key={t} value={t}/>)}</datalist>
                <input type="text" value={form.Ticker} onChange={e => set('Ticker', e.target.value.toUpperCase())}
                  placeholder="ex: NVDA" list="ticker-list" style={{ width: '100%', textTransform: 'uppercase' }} />
              </>
              {errors.Ticker && <span style={{ color: '#ef4444', fontSize: 11 }}>{errors.Ticker}</span>}
            </Field>
            <Field label="Moeda">
              <SelectInput value={form.Moeda} onChange={e => set('Moeda', e.target.value)} options={MOEDAS} />
            </Field>

            {isCompraLike && (<>
              <Field label="Quantidade">
                <NumInput value={form.QTD} onChange={e => set('QTD', e.target.value)} placeholder="ex: 10" />
              </Field>
              <Field label="Valor Unitário (moeda original)">
                <NumInput value={form.ValorCompra} onChange={e => set('ValorCompra', e.target.value)} />
              </Field>
              <Field label={`Câmbio (1 ${form.Moeda ?? 'EUR'} = X EUR) ${cambioManual ? '· manual' : fxLoading ? '· a carregar...' : '· ao vivo'}`}>
                <div style={{ position: 'relative' }}>
                  <NumInput value={form.Cambio} onChange={e => handleCambioChange(e.target.value)} placeholder="1" />
                  {!cambioManual && (
                    <span style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 10, color: fxLoading ? '#fbbf24' : '#10b981', pointerEvents: 'none',
                    }}>{fxLoading ? '⏳' : '🟢'}</span>
                  )}
                </div>
              </Field>
              <Field label={opType === 'Dividendos' ? `Taxa / Comissão ${!taxaManual ? '(28% auto)' : '(manual)'}` : 'Taxa / Comissão'}>
                <div style={{ position: 'relative' }}>
                  <NumInput value={form.Taxa} onChange={e => handleTaxaChange(e.target.value)} placeholder="0" />
                  {opType === 'Dividendos' && !taxaManual && (
                    <span style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 10, color: '#60a5fa', pointerEvents: 'none',
                    }}>28%</span>
                  )}
                </div>
              </Field>
              <Field label="Total (moeda original) — auto">
                <NumInput value={form.ValorTotal} onChange={e => set('ValorTotal', e.target.value)} />
              </Field>
              <Field label="Total em € — auto">
                <NumInput value={form.ValorTotalEur} onChange={e => set('ValorTotalEur', e.target.value)} />
                {errors.ValorTotalEur && <span style={{ color: '#ef4444', fontSize: 11 }}>{errors.ValorTotalEur}</span>}
              </Field>
            </>)}

            {opType === 'Venda' && (<>
              <Field label="Data Venda" required>
                <input type="text" value={form.DataVenda} onChange={e => set('DataVenda', e.target.value)} placeholder="DD/MM/AAAA" style={{ width: '100%' }} />
              </Field>
              <Field label="Quantidade Vendida" required>
                <NumInput value={form.QTDVenda} onChange={e => set('QTDVenda', e.target.value)} />
              </Field>
              <Field label="Valor Venda Unit. (moeda original)" required>
                <NumInput value={form.ValorVenda} onChange={e => set('ValorVenda', e.target.value)} />
              </Field>
              <Field label="Câmbio">
                <NumInput value={form.CambioVenda} onChange={e => set('CambioVenda', e.target.value)} placeholder="1" />
              </Field>
              <Field label="Taxa Venda">
                <NumInput value={form.TaxaVenda} onChange={e => set('TaxaVenda', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Total Venda € — auto">
                <NumInput value={form.VTotalVendaEur} onChange={e => set('VTotalVendaEur', e.target.value)} />
                {errors.VTotalVendaEur && <span style={{ color: '#ef4444', fontSize: 11 }}>{errors.VTotalVendaEur}</span>}
              </Field>

              <div style={{ gridColumn: '1/-1', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '4px 0' }}/>

              {/* FIFO breakdown panel */}
              {fifoInfo && (
                <div style={{ gridColumn: '1/-1', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: fifoInfo.lotsUsed.length > 0 ? 6 : 0 }}>
                    <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>📊 Custo FIFO calculado</span>
                    {lucroManual && (
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, _lucroManual: false }))}
                        style={{ fontSize: 11, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Repor automático
                      </button>
                    )}
                  </div>
                  {fifoInfo.lotsUsed.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {fifoInfo.lotsUsed.map((l, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                          <span>📅 {l.dateStr || '—'}</span>
                          <span>×{l.qty.toFixed(4)}</span>
                          <span>@ {l.unitCostEur.toFixed(4)} €/un</span>
                          <span style={{ color: 'var(--text-muted)' }}>= {(l.qty * l.unitCostEur).toFixed(2)} €</span>
                        </div>
                      ))}
                      <div style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600, marginTop: 4 }}>
                        Custo total: {fifoInfo.costEur.toFixed(2)} €
                        {fifoInfo.missingQty > 0 && <span style={{ color: '#fbbf24', marginLeft: 8 }}>⚠️ {fifoInfo.missingQty.toFixed(4)} un sem lote correspondente</span>}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: '#fbbf24' }}>⚠️ Sem compras registadas para {form.Ticker} — preenche o lucro manualmente</span>
                  )}
                </div>
              )}

              <div style={{ gridColumn: '1/-1', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                Lucro — {lucroManual ? '✏️ preenchido manualmente' : fifoInfo?.lotsUsed.length ? '🤖 calculado via FIFO (editável)' : 'preenche manualmente, IRS 28% é automático'}
              </div>
              <Field label={`Lucro Bruto € ${lucroManual ? '(manual)' : '(FIFO auto)'}`}>
                <div style={{ position: 'relative' }}>
                  <NumInput value={form.LucroBruto} onChange={e => handleLucroBrutoChange(e.target.value)} />
                  {!lucroManual && fifoInfo?.lotsUsed.length > 0 && (
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#60a5fa', pointerEvents: 'none' }}>FIFO</span>
                  )}
                </div>
              </Field>
              <Field label="IRS 28% — auto">
                <NumInput value={form.IRS} onChange={e => set('IRS', e.target.value)} />
              </Field>
              <Field label="Lucro Líquido € — auto">
                <NumInput value={form.LucroLiq} onChange={e => set('LucroLiq', e.target.value)} />
              </Field>
            </>)}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 22px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500,
            }}>Cancelar</button>
            <button type="submit" style={{
              padding: '10px 26px', borderRadius: 10, border: 'none',
              background: isEdit ? 'linear-gradient(135deg, #1d4ed8, #6366f1)' : 'linear-gradient(135deg, #065f46, #10b981)',
              color: '#fff', fontSize: 14, fontWeight: 600,
              boxShadow: `0 4px 16px ${isEdit ? 'rgba(99,102,241,0.35)' : 'rgba(16,185,129,0.35)'}`,
            }}>
              {isEdit ? '✏️ Guardar Alterações' : '➕ Adicionar Registo'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
