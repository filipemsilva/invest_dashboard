import parseCSV from 'papaparse';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oiguejljjpbahqmqqqmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pZ3VlamxqanBiYWhxbXFxcW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTk3NzYsImV4cCI6MjA5MDYzNTc3Nn0.cx0qIXw9fAsg-WZ_3EOlHiYZxWsooZFqqIU0JvO0LpE';
const supabase = createClient(supabaseUrl, supabaseKey);

const TABLE_NAME = 'invest_records';

async function main() {
  const filePath = 'C:\\\\Users\\\\filip\\\\Desktop\\\\Site\\\\invest_dados.csv';
  console.log(`Lendo: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error('Ficheiro CSV não encontrado.');
    return;
  }

  const csvContent = fs.readFileSync(filePath, 'utf-8');
  
  const parsed = parseCSV.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';'
  });

  const records = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    if (!row['Data'] || row['Data'].trim() === '') continue;

    // Apanhar vendas (que o papaparse renomeia Data_1, etc)
    let dVenda = row['Data_1'] || row['DataVenda'] || null;
    let taxaE_1 = row['Taxa €_1'] || row['TaxaVendaEur'] || null;

    records.push({
      csv_id: i + 1,
      data_operacao: row['Data'] || null,
      mes: row['Mês'] || row['Mes'] || null,
      operacao: row['Operação'] || row['Operacao'] || null,
      tipo: row['Tipo'] || row['Operação'] || null,
      broker: row['Broker'] || null,
      ticker: row['Ticker'] || null,
      qtd: toNum(row['QTD']),
      valor_compra: toNum(row['Valor Compra'] || row['ValorCompra']),
      valor_total: toNum(row['Valor Total'] || row['ValorTotal']),
      taxa: toNum(row['Taxa']),
      cambio: toNum(row['Cambio']) || 1,
      moeda: row['Moeda'] || 'EUR',
      valor_compra_eur: toNum(row['Valor Compra €'] || row['ValorCompraEur']),
      valor_total_eur: toNum(row['Valor Total €'] || row['ValorTotalEur']),
      taxa_eur: toNum(row['Taxa €'] || row['TaxaEur']),
      data_venda: dVenda,
      qtd_venda: toNum(row['QTD_1'] || row['QTDVenda']),
      valor_venda: toNum(row['Valor Venda'] || row['ValorVenda']),
      v_total_venda: toNum(row['V. Total Venda'] || row['VTotalVenda']),
      taxa_venda: toNum(row['Taxa_1'] || row['TaxaVenda']),
      cambio_venda: toNum(row['Cambio_1'] || row['CambioVenda']),
      valor_venda_eur: toNum(row['Valor Venda €'] || row['ValorVendaEur']),
      v_total_venda_eur: toNum(row['V. Total Venda €'] || row['VTotalVendaEur']),
      taxa_venda_eur: toNum(taxaE_1),
      lucro_bruto: toNum(row['Lucro C/ Impostos'] || row['LucroBruto']),
      irs: toNum(row['IRS 28%'] || row['IRS']),
      lucro_liq: toNum(row['Lucro Liq.'] || row['LucroLiq']),
      manual_override: true // Registos antigos de CSV são manuais já calculados
    });
  }

  console.log(`Formatadas ${records.length} operações. Enviando para Supabase...`);

  // Supabase limits inserts to 1000 rows, but we only have ~650
  const { data, error } = await supabase.from(TABLE_NAME).insert(records);
  
  if (error) {
    console.error('Erro ao enviar dados!', error.message, error.details);
  } else {
    console.log('Dados importados com sucesso! Podes verificar no dashboard do Supabase.');
  }
}

function toNum(str) {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  return parseFloat(str.replace(',', '.')) || 0;
}

main().catch(console.error);
