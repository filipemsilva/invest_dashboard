/**
 * parseCSV.js
 * Parses the investment CSV file with:
 *  - Semicolon (;) delimiter
 *  - Comma (,) as decimal separator → converted to dot
 *  - Empty numeric fields → 0 (no NaN)
 */

const HEADERS = [
  'Data', 'Mes', 'Operacao', 'Tipo', 'Broker', 'Ticker',
  'QTD', 'ValorCompra', 'ValorTotal', 'Taxa', 'Cambio', 'Moeda',
  'ValorCompraEur', 'ValorTotalEur', 'TaxaEur',
  // Sell columns
  'DataVenda', 'QTDVenda', 'ValorVenda', 'VTotalVenda', 'TaxaVenda',
  'CambioVenda', 'ValorVendaEur', 'VTotalVendaEur', 'TaxaVendaEur',
  'LucroBruto', 'IRS', 'LucroLiq'
];

const NUMERIC_FIELDS = [
  'QTD', 'ValorCompra', 'ValorTotal', 'Taxa', 'Cambio',
  'ValorCompraEur', 'ValorTotalEur', 'TaxaEur',
  'QTDVenda', 'ValorVenda', 'VTotalVenda', 'TaxaVenda', 'CambioVenda',
  'ValorVendaEur', 'VTotalVendaEur', 'TaxaVendaEur',
  'LucroBruto', 'IRS', 'LucroLiq'
];

function toNum(str) {
  if (!str || str.trim() === '') return 0;
  const cleaned = str.trim().replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDate(str) {
  if (!str || str.trim() === '') return null;
  // Format: dd/mm/yyyy
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 3) continue;

    const row = {};
    HEADERS.forEach((key, idx) => {
      const raw = cols[idx] || '';
      if (NUMERIC_FIELDS.includes(key)) {
        row[key] = toNum(raw);
      } else {
        row[key] = raw.trim();
      }
    });

    row.dateObj = parseDate(row.Data);
    row.dateVendaObj = parseDate(row.DataVenda);
    row.id = i;

    // Normalize Tipo
    if (!row.Tipo || row.Tipo === '') {
      row.Tipo = row.Operacao;
    }

    rows.push(row);
  }

  return rows;
}

export function computeMetrics(rows) {
  const dividendos = rows.filter(r => r.Operacao === 'Dividendos');
  const recebimentos = rows.filter(r => r.Operacao === 'Recebimento');
  const trades = rows.filter(r => r.Operacao !== 'Dividendos' && r.Operacao !== 'Recebimento');

  const totalCompras = trades.reduce((s, r) => s + (r.ValorTotalEur || 0), 0);
  const totalVendas = trades.reduce((s, r) => s + (r.VTotalVendaEur || 0), 0);
  // Capital currently deployed = what was bought minus what was already sold
  const totalInvestido = totalCompras - totalVendas;
  
  const lucroLiq = trades.reduce((s, r) => s + (r.LucroLiq || 0), 0);
  const lucroBrutoTotal = trades.reduce((s, r) => s + (r.LucroBruto || 0), 0);
  const irsTotal = trades.reduce((s, r) => s + (r.IRS || 0), 0);

  const totalDividendos = dividendos.reduce((s, r) => s + (r.ValorTotalEur || 0), 0);
  const totalRecebimentos = recebimentos.reduce((s, r) => s + (r.ValorTotalEur || 0), 0);

  // Detailed breakdown by Tipo
  const byTipoDetails = {};
  trades.forEach(r => {
    const t = r.Tipo || 'Outro';
    if (!byTipoDetails[t]) {
      byTipoDetails[t] = { name: t, capitalAtivo: 0, comprasTotais: 0, vendasTotais: 0, lucroBruto: 0, irs: 0, lucroLiq: 0 };
    }
    
    // Compra phase
    if ((r.ValorTotalEur || 0) > 0) {
      byTipoDetails[t].comprasTotais += r.ValorTotalEur;
      byTipoDetails[t].capitalAtivo += r.ValorTotalEur;
    }
    
    // Venda phase
    if ((r.VTotalVendaEur || 0) > 0) {
      byTipoDetails[t].vendasTotais += r.VTotalVendaEur;
      byTipoDetails[t].lucroBruto += (r.LucroBruto || 0);
      byTipoDetails[t].irs += (r.IRS || 0);
      byTipoDetails[t].lucroLiq += (r.LucroLiq || 0);
      byTipoDetails[t].capitalAtivo = Math.max(0, byTipoDetails[t].capitalAtivo - r.VTotalVendaEur);
    }
  });

  // Detailed breakdown by Broker
  const byBrokerDetails = {};
  trades.forEach(r => {
    const b = r.Broker || 'Outro';
    if (!byBrokerDetails[b]) {
      byBrokerDetails[b] = { name: b, capitalAtivo: 0, comprasTotais: 0, vendasTotais: 0, lucroBruto: 0, irs: 0, lucroLiq: 0 };
    }
    
    if ((r.ValorTotalEur || 0) > 0) {
      byBrokerDetails[b].comprasTotais += r.ValorTotalEur;
      byBrokerDetails[b].capitalAtivo += r.ValorTotalEur;
    }
    
    if ((r.VTotalVendaEur || 0) > 0) {
      byBrokerDetails[b].vendasTotais += r.VTotalVendaEur;
      byBrokerDetails[b].lucroBruto += (r.LucroBruto || 0);
      byBrokerDetails[b].irs += (r.IRS || 0);
      byBrokerDetails[b].lucroLiq += (r.LucroLiq || 0);
      byBrokerDetails[b].capitalAtivo = Math.max(0, byBrokerDetails[b].capitalAtivo - r.VTotalVendaEur);
    }
  });

  // Simple key-value for compatibility with existing charts
  const byTipo = Object.keys(byTipoDetails).reduce((acc, t) => { acc[t] = byTipoDetails[t].capitalAtivo; return acc; }, {});
  const byBroker = Object.keys(byBrokerDetails).reduce((acc, b) => { acc[b] = byBrokerDetails[b].capitalAtivo; return acc; }, {});

  // Monthly cumulative investment
  const monthlyMap = {};
  const allOps = [...trades].sort((a, b) => (a.dateObj || 0) - (b.dateObj || 0));
  allOps.forEach(r => {
    if (!r.dateObj) return;
    if ((r.ValorTotalEur || 0) <= 0) return; // Only count actual investments
    const key = `${r.dateObj.getFullYear()}-${String(r.dateObj.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = (monthlyMap[key] || 0) + r.ValorTotalEur;
  });

  // Build cumulative timeline
  const sortedMonths = Object.keys(monthlyMap).sort();
  let cumulative = 0;
  const timeline = sortedMonths.map(month => {
    cumulative += monthlyMap[month];
    const [y, m] = month.split('-');
    const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return {
      label: `${monthNames[parseInt(m) - 1]} ${y}`,
      month,
      investido: Math.round(cumulative * 100) / 100,
      mensal: Math.round(monthlyMap[month] * 100) / 100,
    };
  });

  return {
    totalInvestido,
    totalCompras,
    totalVendas,
    lucroLiq,
    lucroBrutoTotal,
    irsTotal,
    totalDividendos,
    totalRecebimentos,
    byTipoDetails: Object.values(byTipoDetails).sort((a,b) => b.capitalAtivo - a.capitalAtivo),
    byBrokerDetails: Object.values(byBrokerDetails).sort((a,b) => b.capitalAtivo - a.capitalAtivo),
    byTipo: Object.entries(byTipo).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a,b) => b.value - a.value),
    byBroker: Object.entries(byBroker).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a,b) => b.value - a.value),
    timeline,
  };
}
