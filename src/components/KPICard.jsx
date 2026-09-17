import React from 'react';

function formatEur(value) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const GRADIENTS = ['gradient-blue', 'gradient-green', 'gradient-red', 'gradient-purple', 'gradient-amber'];

const ICONS = {
  invested: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  ),
  sales: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  profit: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  dividends: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  receipts: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
};

export default function KPICard({ label, value, gradient, icon, subtitle }) {
  const gradClass = GRADIENTS[gradient] || 'gradient-blue';
  const iconEl = ICONS[icon] || ICONS.invested;
  const positive = value >= 0;

  return (
    <div className="card animate-fade-in" style={{
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      animationDelay: `${gradient * 60}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, letterSpacing: '0.3px' }}>
          {label}
        </span>
        <div className={gradClass} style={{
          padding: 8,
          borderRadius: 12,
          opacity: 0.9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {iconEl}
        </div>
      </div>
      <div>
        <p style={{
          fontSize: 26,
          fontWeight: 700,
          color: icon === 'profit' ? (positive ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-primary)',
          letterSpacing: '-0.5px',
          lineHeight: 1.1,
        }}>
          {formatEur(value)}
        </p>
        {subtitle && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}
