import React, { useState } from 'react';
import { useMarketPrices } from '../hooks/useMarketPrices';

const FX_TICKERS = ['EURUSD=X', 'EURGBP=X', 'EURCHF=X', 'EURBRL=X'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'GBX', 'CHF', 'BRL'];

export default function CalculatorTab() {
  const { prices, loading } = useMarketPrices(FX_TICKERS);
  
  const [amount, setAmount] = useState('100');
  const [fromCurr, setFromCurr] = useState('EUR');
  const [toCurr, setToCurr] = useState('USD');

  const eurUsdRate = prices['EURUSD=X']?.price; // how many USD per 1 EUR
  const eurGbpRate = prices['EURGBP=X']?.price; // how many GBP per 1 EUR
  const eurChfRate = prices['EURCHF=X']?.price; // how many CHF per 1 EUR
  const eurBrlRate = prices['EURBRL=X']?.price; // how many BRL per 1 EUR

  const hasRate = (curr) => {
    if (curr === 'EUR') return true;
    if (curr === 'USD') return !!eurUsdRate;
    if (curr === 'GBP' || curr === 'GBX') return !!eurGbpRate;
    if (curr === 'CHF') return !!eurChfRate;
    if (curr === 'BRL') return !!eurBrlRate;
    return false;
  };

  // Convert `fromCurr` to EUR first, then from EUR to `toCurr`
  function getRate(from, to) {
    if (from === to) return 1;
    if (!hasRate(from) || !hasRate(to)) return null;
    
    let inEur = 1;
    if (from === 'USD') inEur = 1 / eurUsdRate;
    if (from === 'GBP') inEur = 1 / eurGbpRate;
    if (from === 'GBX') inEur = 1 / (eurGbpRate * 100); // 100 GBX = 1 GBP
    if (from === 'CHF') inEur = 1 / eurChfRate;
    if (from === 'BRL') inEur = 1 / eurBrlRate;
    
    if (to === 'EUR') return inEur;
    if (to === 'USD') return inEur * eurUsdRate;
    if (to === 'GBP') return inEur * eurGbpRate;
    if (to === 'GBX') return inEur * (eurGbpRate * 100);
    if (to === 'CHF') return inEur * eurChfRate;
    if (to === 'BRL') return inEur * eurBrlRate;
    return null;
  }

  const rate = getRate(fromCurr, toCurr);
  const parsedAmount = parseFloat(amount.replace(',', '.'));
  const converted = !isNaN(parsedAmount) && rate !== null ? parsedAmount * rate : null;

  return (
    <div className="card" style={{ padding: 40, maxWidth: 500, margin: '0 auto', borderTop: '3px solid #10b981' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        🧮 Calculadora de Câmbios
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Valor e Moeda de Origem
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input 
              type="text" 
              inputMode="decimal"
              value={amount} 
              onChange={e => setAmount(e.target.value)}
              placeholder="0,00"
              style={{ flex: 1, padding: '14px 18px', fontSize: 18, fontWeight: 600, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)' }}
            />
            <select 
              value={fromCurr} 
              onChange={e => setFromCurr(e.target.value)}
              style={{ width: 100, padding: '14px', fontSize: 16, fontWeight: 600, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '-10px 0' }}>
          <button 
            type="button"
            onClick={() => { const temp = fromCurr; setFromCurr(toCurr); setToCurr(temp); }}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}
            title="Inverter moedas"
          >
            ⇅
          </button>
        </div>

        <div>
           <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Converter para
          </label>
          <select 
            value={toCurr} 
            onChange={e => setToCurr(e.target.value)}
            style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 600, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 12, padding: 24, background: 'rgba(16,185,129,0.05)', borderRadius: 16, border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resultado {loading ? '(a carregar taxa...)' : ''}</p>
          <p style={{ color: '#10b981', fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
            {converted !== null ? converted.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
          </p>
          {rate !== null && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>
              Taxa de câmbio: 1 {fromCurr} = {rate.toFixed(4)} {toCurr}
            </p>
          )}
        </div>
        
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
          ℹ️ Taxas de câmbio ao vivo (EUR/USD, EUR/GBP) via Yahoo Finance.
        </div>
      </div>
    </div>
  );
}
