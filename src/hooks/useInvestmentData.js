import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { computeMetrics } from '../utils/parseCSV';

const CSV_HEADERS = [
  'Data','Mês','Operação','Tipo','Broker','Ticker',
  'QTD','Valor Compra','Valor Total','Taxa','Cambio','Moeda',
  'Valor Compra €','Valor Total €','Taxa €',
  'Data','QTD','Valor Venda','V. Total Venda','Taxa','Cambio',
  'Valor Venda €','V. Total Venda €','Taxa €',
  'Lucro C/ Impostos','IRS 28%','Lucro Liq.'
];

function dbRecordToRow(r) {
  const parseDate = (str) => {
    if (!str || str.trim() === '') return null;
    const parts = str.trim().split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  };

  return {
    id: r.id, 
    _db_id: r.id,
    
    Data: r.data_operacao || '',
    Mes: r.mes || '',
    Operacao: r.operacao || '',
    Tipo: r.tipo || r.operacao || '',
    Broker: r.broker || '',
    Ticker: r.ticker || '',
    
    QTD: Number(r.qtd) || 0,
    ValorCompra: Number(r.valor_compra) || 0,
    ValorTotal: Number(r.valor_total) || 0,
    Taxa: Number(r.taxa) || 0,
    Cambio: Number(r.cambio) || 1,
    Moeda: r.moeda || 'EUR',
    
    ValorCompraEur: Number(r.valor_compra_eur) || 0,
    ValorTotalEur: Number(r.valor_total_eur) || 0,
    TaxaEur: Number(r.taxa_eur) || 0,
    
    DataVenda: r.data_venda || '',
    QTDVenda: Number(r.qtd_venda) || 0,
    ValorVenda: Number(r.valor_venda) || 0,
    VTotalVenda: Number(r.v_total_venda) || 0,
    TaxaVenda: Number(r.taxa_venda) || 0,
    CambioVenda: Number(r.cambio_venda) || 1,
    ValorVendaEur: Number(r.valor_venda_eur) || 0,
    VTotalVendaEur: Number(r.v_total_venda_eur) || 0,
    TaxaVendaEur: Number(r.taxa_venda_eur) || 0,
    
    LucroBruto: Number(r.lucro_bruto) || 0,
    IRS: Number(r.irs) || 0,
    LucroLiq: Number(r.lucro_liq) || 0,
    
    _manual: r.manual_override,
    
    dateObj: parseDate(r.data_operacao),
    dateVendaObj: parseDate(r.data_venda)
  };
}

function rowToDbRecord(r) {
    return {
      data_operacao: r.Data || null,
      mes: r.Mes || null,
      operacao: r.Operacao || null,
      tipo: r.Tipo || r.Operacao || null,
      broker: r.Broker || null,
      ticker: r.Ticker || null,
      qtd: Number(r.QTD) || 0,
      valor_compra: Number(r.ValorCompra) || 0,
      valor_total: Number(r.ValorTotal) || 0,
      taxa: Number(r.Taxa) || 0,
      cambio: Number(r.Cambio) || 1,
      moeda: r.Moeda || 'EUR',
      valor_compra_eur: Number(r.ValorCompraEur) || 0,
      valor_total_eur: Number(r.ValorTotalEur) || 0,
      taxa_eur: Number(r.TaxaEur) || 0,
      
      data_venda: r.DataVenda || null,
      qtd_venda: Number(r.QTDVenda) || 0,
      valor_venda: Number(r.ValorVenda) || 0,
      v_total_venda: Number(r.VTotalVenda) || 0,
      taxa_venda: Number(r.TaxaVenda) || 0,
      cambio_venda: Number(r.CambioVenda) || 1,
      valor_venda_eur: Number(r.ValorVendaEur) || 0,
      v_total_venda_eur: Number(r.VTotalVendaEur) || 0,
      taxa_venda_eur: Number(r.TaxaVendaEur) || 0,
      
      lucro_bruto: Number(r.LucroBruto) || 0,
      irs: Number(r.IRS) || 0,
      lucro_liq: Number(r.LucroLiq) || 0,
      manual_override: r._manual || false,
    };
}

export function useInvestmentData(session) {
  const [rows, setRows] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [fileName, setFileName] = useState('Supabase Live Data');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!session) return; // Não carrega sem sessão
    setLoading(true);
    setError('');
    
    const { data, error: sbError } = await supabase
      .from('invest_records')
      .select('*')
      .order('csv_id', { ascending: true }); // Mantenha a ordem original

    if (sbError) {
      if (sbError.message.includes('permission denied') || sbError.code === '42501') {
        setError('Acesso negado. Crie e ative a conta (RLS ligada).');
      } else {
        setError(`Erro Supabase: ${sbError.message}`);
      }
    } else if (data) {
      const parsed = data.map(dbRecordToRow);
      setRows(parsed);
      setMetrics(computeMetrics(parsed));
    }
    
    setLoading(false);
  }, [session]); // Depende agora da session

  // Fetch data automatically when the hook mounts and when session changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep loadCSV intact if the user explicitly wants to replace everything,
  // but we won't strictly need it anymore.
  const loadCSV = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const addRow = useCallback(async (newRow) => {
    const dbPayload = rowToDbRecord(newRow);
    const { data, error } = await supabase.from('invest_records').insert([dbPayload]).select('*');
    
    if (error) {
        console.error("Erro a adicionar no BD:", error);
        alert("Erro a guardar no Supabase: " + error.message);
        return;
    }
    
    if (data && data[0]) {
        const generatedRow = dbRecordToRow(data[0]);
        setRows(prev => {
            const updated = [...prev, generatedRow];
            setMetrics(computeMetrics(updated));
            return updated;
        });
    }
  }, []);

  const deleteRow = useCallback(async (id) => {
    if (!id) return;
    const { error } = await supabase.from('invest_records').delete().eq('id', id);
    if (error) {
        alert("Erro ao apagar: " + error.message);
        return;
    }
    setRows(prev => {
      const updated = prev.filter(r => r.id !== id);
      setMetrics(computeMetrics(updated));
      return updated;
    });
  }, []);

  const updateRow = useCallback(async (id, updatedRow) => {
    if (!id) return;
    const dbPayload = rowToDbRecord(updatedRow);
    const { data, error } = await supabase.from('invest_records').update(dbPayload).eq('id', id).select('*');
    if (error) {
        alert("Erro ao atualizar: " + error.message);
        return;
    }
    
    if (data && data[0]) {
        const generatedRow = dbRecordToRow(data[0]);
        setRows(prev => {
            const updated = prev.map(r => r.id === id ? generatedRow : r);
            setMetrics(computeMetrics(updated));
            return updated;
        });
    }
  }, []);

  const exportCSV = useCallback((currentRows) => {
    const lines = [CSV_HEADERS.join(';')];
    // Simple export to maintain CSV compliance if they ever want it back
    const formatN = (v) => v === 0 || !v ? '' : String(v).replace('.', ',');
    currentRows.forEach(r => {
        lines.push([
            r.Data || '', r.Mes || '', r.Operacao || '', r.Tipo || '', r.Broker || '', r.Ticker || '',
            formatN(r.QTD), formatN(r.ValorCompra), formatN(r.ValorTotal), formatN(r.Taxa), formatN(r.Cambio), r.Moeda || '',
            formatN(r.ValorCompraEur), formatN(r.ValorTotalEur), formatN(r.TaxaEur),
            r.DataVenda || '', formatN(r.QTDVenda), formatN(r.ValorVenda), formatN(r.VTotalVenda), formatN(r.TaxaVenda), formatN(r.CambioVenda),
            formatN(r.ValorVendaEur), formatN(r.VTotalVendaEur), formatN(r.TaxaVendaEur),
            formatN(r.LucroBruto), formatN(r.IRS), formatN(r.LucroLiq)
        ].join(';'));
    });
    const blob = new Blob([lines.join('\\r\\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invest_dados_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return { rows, metrics, fileName, loading, error, loadCSV, addRow, deleteRow, updateRow, exportCSV };
}
