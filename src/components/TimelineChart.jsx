import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, ReferenceLine
} from 'recharts';

function formatEur(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k€`;
  return `${v.toFixed(0)}€`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#1a2236',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: '10px 14px',
      }}>
        <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>{label}</p>
        {payload.map(p => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
            <span style={{ color: '#94a3b8', fontSize: 11 }}>{p.name}:</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>
              {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(p.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function TimelineChart({ data }) {
  // Show only every N-th label to avoid crowding
  const step = Math.max(1, Math.floor(data.length / 18));

  return (
    <div className="card p-5 animate-fade-in" style={{ animationDelay: '200ms' }}>
      <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
        📈 Evolução do Capital Investido
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={step - 1}
            angle={-35}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tickFormatter={formatEur}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="investido"
            name="Acumulado"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#blueGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6' }}
          />
          <Area
            type="monotone"
            dataKey="mensal"
            name="Mensal"
            stroke="#10b981"
            strokeWidth={1.5}
            fill="url(#greenGrad)"
            dot={false}
            activeDot={{ r: 3, fill: '#10b981' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
