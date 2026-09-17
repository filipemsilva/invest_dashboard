/**
 * computeSavings.js
 *
 * Extracts P2P and Certificado de Aforro data from the full transaction list.
 * Returns a structured breakdown by tipo and platform.
 */

const P2P_TIPOS = new Set(['P2P']);
const POUPANCA_TIPOS = new Set(['C.Aforro']);

function parseDatePT(dateStr) {
  if (!dateStr) return null;
  const [d, m, y] = dateStr.split('/');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

export function computeSavings(rows) {
  // platforms: { key: { label, tipo, broker, ticker, entries[] } }
  const platforms = {};

  for (const row of rows) {
    const tipo = row.Tipo;
    const op = row.Operacao;

    if (!P2P_TIPOS.has(tipo) && !POUPANCA_TIPOS.has(tipo)) continue;

    // Normalize strings to group correctly even with case/whitespace variations
    const b = (row.Broker || '').trim();
    const t = (row.Ticker || '').trim();
    
    // Group key: for both P2P and C.Aforro group by normalized broker+ticker
    const key = `${b.toUpperCase()}__${t.toUpperCase()}`;

    if (!platforms[key]) {
      let label = b || t;
      if (tipo === 'C.Aforro') {
        label = `Certificados de Aforro (CTT${t && t !== 'C.Aforro' ? ' - ' + t : ''})`;
      } else {
        // P2P or others: combine Broker and Ticker if they differ
        if (b && t && b.toUpperCase() !== t.toUpperCase() && t.toUpperCase() !== 'P2P') {
          label = `${b} - ${t}`;
        } else if (!b && t) {
          label = t;
        } else {
          label = b || t || 'P2P';
        }
      }

      platforms[key] = {
        key,
        tipo,
        broker: row.Broker,
        ticker: row.Ticker,
        label,
        totalInvested: 0,
        totalReceived: 0,
        totalWithdrawn: 0,
        entries: [],
      };
    }

    const p = platforms[key];
    const amountEur = row.ValorTotalEur || 0;
    const dateObj = parseDatePT(row.Data);

    if (op === 'Compra') {
      p.totalInvested += amountEur;
      p.entries.push({ date: row.Data, dateObj, op: 'Compra', amount: amountEur, note: `Depósito / Subscrição` });
    } else if (op === 'Recebimento') {
      // P2P needs 28% IRS deduction to show net value; C.Aforro is already net
      const isP2P = tipo === 'P2P';
      const liquidAmount = isP2P ? amountEur * 0.72 : amountEur;
      p.totalReceived += liquidAmount;
      p.entries.push({ date: row.Data, dateObj, op: 'Recebimento', amount: liquidAmount, note: isP2P ? `Juro / Rendimento (Líquido)` : `Juro / Rendimento` });
    } else if (op === 'Venda') {
      p.totalWithdrawn += amountEur;
      p.entries.push({ date: row.Data, dateObj, op: 'Venda', amount: amountEur, note: `Levantamento` });
    }
  }

  return Object.values(platforms).map(p => {
    // Capital still deployed = invested - withdrawn
    const capitalAtivo = p.totalInvested - p.totalWithdrawn;
    // Total return % = received / invested
    const yieldPct = p.totalInvested > 0 ? (p.totalReceived / p.totalInvested) * 100 : 0;
    // Estimated current value = capital still in + any unaccounted interest
    const estimatedValue = capitalAtivo + p.totalReceived;

    // Sort entries by date
    const entries = [...p.entries].sort((a, b) => (a.dateObj - b.dateObj));

    return {
      ...p,
      capitalAtivo,
      yieldPct,
      estimatedValue,
      entries,
    };
  }).sort((a, b) => b.totalInvested - a.totalInvested);
}
