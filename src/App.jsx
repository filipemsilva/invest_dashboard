import React, { useMemo } from 'react';
import { useInvestmentData } from './hooks/useInvestmentData';
import KPICard from './components/KPICard';
import FileUpload from './components/FileUpload';
import PortfolioPieChart from './components/PortfolioPieChart';
import BrokerBarChart from './components/BrokerBarChart';
import TimelineChart from './components/TimelineChart';
import TransactionTable from './components/TransactionTable';
import AddTransactionModal from './components/AddTransactionModal';
import PortfolioTab from './components/PortfolioTab';
import SavingsTab from './components/SavingsTab';
import CalculatorTab from './components/CalculatorTab';
import PnLTab from './components/PnLTab';
import AnnualTab from './components/AnnualTab';
import Login from './components/Login';
import { supabase } from './lib/supabase';
import './index.css';

function formatEur(v) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(v);
}

function Sidebar({ activeTab, onTab, hasData, onAdd, onExport, isOpen, setIsOpen }) {
  const tabs = [
    { id: 'dashboard',   label: 'Dashboard',       icon: '🏠' },
    { id: 'portfolio',   label: 'Portfolio Atual',  icon: '📡' },
    { id: 'pnl',         label: 'P&L / Lucros',    icon: '💹' },
    { id: 'annual',      label: 'Histórico Anual',  icon: '📅' },
    { id: 'savings',     label: 'P2P & Poupanças',  icon: '🏦' },
    { id: 'charts',      label: 'Gráficos',         icon: '📊' },
    { id: 'transactions',label: 'Transações',       icon: '📋' },
    { id: 'calculator',  label: 'Calculadora',      icon: '🧮' },
  ];
  return (
    <>
      <div 
        className={`backdrop-overlay ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(false)} 
      />
      <aside className={`sidebar-container ${isOpen ? 'open' : ''}`}>
      {/* Logo */}
      <div style={{ marginBottom: 32, paddingLeft: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>
            📈
          </div>
          <div>
            <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>InvestTracker</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Portfolio Dashboard</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onTab(t.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: activeTab === t.id ? 'rgba(59,130,246,0.15)' : 'transparent',
            color: activeTab === t.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontWeight: activeTab === t.id ? 600 : 400,
            fontSize: 14,
            textAlign: 'left',
            width: '100%',
          }}
        >
          <span style={{ fontSize: 16 }}>{t.icon}</span>
          {t.label}
          {activeTab === t.id && (
            <div style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: 'var(--accent-blue)' }} />
          )}
        </button>
      ))}

      {/* Action buttons */}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={onAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid rgba(16,185,129,0.4)',
            background: 'rgba(16,185,129,0.1)',
            color: '#10b981',
            fontWeight: 600,
            fontSize: 13,
            width: '100%',
          }}
        >
          <span>➕</span> Novo Registo
        </button>

        {hasData && (
          <button
            onClick={onExport}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(59,130,246,0.3)',
              background: 'rgba(59,130,246,0.08)',
              color: 'var(--accent-blue)',
              fontWeight: 500,
              fontSize: 13,
              width: '100%',
            }}
          >
            <span>⬇</span> Exportar CSV
          </button>
        )}
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)',
              color: '#ef4444',
              fontWeight: 500,
              fontSize: 13,
              width: '100%',
              marginTop: 16
            }}
          >
            <span>🚪</span> Terminar Sessão
          </button>
      </div>

      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.5 }}>
          © 2026 InvestTracker<br />Dados privados &amp; locais
        </p>
      </div>
    </aside>
    </>
  );
}

export default function App() {
  const [session, setSession] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { rows, metrics, fileName, loading, error, loadCSV, addRow, deleteRow, updateRow, exportCSV } = useInvestmentData(session);
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [showModal, setShowModal] = React.useState(false);
  const [editRow, setEditRow] = React.useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const existingTickers = useMemo(() => {
    const set = new Set(rows.map(r => r.Ticker).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        A verificar segurança...
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={(session) => setSession(session)} />;
  }

  const hasData = rows.length > 0 && metrics;

  const handleOpenAdd = () => { setEditRow(null); setShowModal(true); };
  const handleOpenEdit = (row) => { setEditRow(row); setShowModal(true); };
  const handleCloseModal = () => { setShowModal(false); setEditRow(null); };

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        onTab={(t) => { setActiveTab(t); setIsSidebarOpen(false); }}
        hasData={hasData}
        onAdd={handleOpenAdd}
        onExport={() => exportCSV(rows)}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      {/* Modal */}
      {showModal && (
        <AddTransactionModal
          onClose={handleCloseModal}
          onAdd={addRow}
          onUpdate={updateRow}
          editRow={editRow}
          existingTickers={existingTickers}
          allRows={rows}
        />
      )}

      {/* Main */}
      <main className="main-content">
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="mobile-header-btn" onClick={() => setIsSidebarOpen(true)}>
              ☰
            </button>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {activeTab === 'dashboard'    && '🏠 Dashboard'}
              {activeTab === 'portfolio'    && '📡 Portfolio Atual'}
              {activeTab === 'pnl'          && '💹 P&L / Lucros'}
              {activeTab === 'annual'       && '📅 Histórico Anual'}
              {activeTab === 'savings'      && '🏦 P2P & Poupanças'}
              {activeTab === 'charts'       && '📊 Gráficos'}
              {activeTab === 'transactions' && '📋 Transações'}
              {activeTab === 'calculator'   && '🧮 Calculadora de Câmbios'}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {activeTab === 'calculator'
                ? 'Converte os teus valores com as taxas de câmbio atualizadas ao vivo.'
                : activeTab === 'pnl'
                  ? 'Lucro Realizado (posições fechadas) vs Não-Realizado (posições abertas ao preço de mercado).'
                  : hasData
                    ? `${rows.length} transações carregadas${rows.filter(r => r._manual).length ? ` (+${rows.filter(r => r._manual).length} manuais)` : ''}`
                    : 'Carregue o seu ficheiro CSV para começar, ou adicione registos manualmente'}
              </p>
            </div>
          </div>
          {/* Upload inline */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleOpenAdd}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, #065f46, #10b981)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                boxShadow: '0 4px 16px rgba(16,185,129,0.25)',
              }}
            >
              ➕ Novo Registo
            </button>
            <div style={{ width: 280 }}>
               {/* FileUpload removido porque os dados vêm do Supabase em tempo real */}
               <div style={{ padding: '8px 12px', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', borderRadius: '8px', fontSize: 12, fontWeight: 500 }}>
                  🟢 Conectado ao Supabase
               </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12,
            padding: '14px 18px',
            color: '#ef4444',
            marginBottom: 24,
            fontSize: 14,
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
            <p>A processar ficheiro...</p>
          </div>
        )}

        {/* No data state */}
        {!loading && !hasData && activeTab !== 'calculator' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 40px',
            gap: 20,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 64 }}>📂</div>
            <div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 600 }}>Nenhum dado carregado</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 400, lineHeight: 1.6, marginTop: 8 }}>
                O seu perfil não tem transações registadas na base de dados Supabase. 
                Se estava à espera de ver dados do CSV, corra o script de importação local primeiro!
              </p>
              <button
                onClick={handleOpenAdd}
                style={{
                  marginTop: 20, padding: '12px 28px',
                  borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #065f46, #10b981)',
                  color: '#fff', fontWeight: 600, fontSize: 14,
                  boxShadow: '0 4px 16px rgba(16,185,129,0.25)',
                }}
              >
                ➕ Adicionar o meu primeiro registo
              </button>
            </div>
          </div>
        )}

        {/* Dashboard Tab */}
        {!loading && hasData && activeTab === 'dashboard' && (
          <>
            {/* KPI Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 32,
            }}>
              <KPICard
                label="Capital em Carteira"
                value={metrics.totalInvestido}
                gradient={0}
                icon="invested"
                subtitle={`compras − vendas realizadas`}
              />
              <KPICard
                label="Total em Vendas"
                value={metrics.totalVendas}
                gradient={2}
                icon="sales"
                subtitle={`${rows.filter(r => r.Operacao === 'Venda').length} vendas`}
              />
              <KPICard
                label="Lucro Líquido"
                value={metrics.lucroLiq}
                gradient={1}
                icon="profit"
                subtitle="Após IRS 28%"
              />
              <KPICard
                label="Total Dividendos"
                value={metrics.totalDividendos}
                gradient={3}
                icon="dividends"
                subtitle={`${rows.filter(r => r.Operacao === 'Dividendos').length} pagamentos`}
              />
              <KPICard
                label="Total de IRS Pago"
                value={metrics.irsTotal}
                gradient={4}
                icon="receipts"
                subtitle="Impostos retidos (28%)"
              />
            </div>

            {/* Detailed breakdowns */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
              gap: 16,
              marginBottom: 32,
            }}>
              <div className="card p-5 animate-fade-in" style={{ animationDelay: '300ms' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, marginBottom: 16, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Performance por Tipo
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {metrics.byTipoDetails.map(t => (
                    <div key={t.name} style={{ background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                        <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: 14 }}>Ativo: {formatEur(t.capitalAtivo)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
                        <div>
                          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Vendas</p>
                          <p style={{ color: 'var(--text-secondary)' }}>{formatEur(t.vendasTotais)}</p>
                        </div>
                        <div>
                          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Lucro Bruto</p>
                          <p style={{ color: t.lucroBruto > 0 ? '#10b981' : t.lucroBruto < 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 500 }}>
                            {t.lucroBruto > 0 ? '+' : ''}{formatEur(t.lucroBruto)}
                          </p>
                        </div>
                         <div>
                          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Tributado (IRS)</p>
                          <p style={{ color: '#ef4444' }}>{formatEur(t.irs)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-5 animate-fade-in" style={{ animationDelay: '350ms' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, marginBottom: 16, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Performance por Broker
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {metrics.byBrokerDetails.map(b => (
                    <div key={b.name} style={{ background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>{b.name}</span>
                        <span style={{ color: '#8b5cf6', fontWeight: 600, fontSize: 14 }}>Ativo: {formatEur(b.capitalAtivo)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
                        <div>
                          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Vendas</p>
                          <p style={{ color: 'var(--text-secondary)' }}>{formatEur(b.vendasTotais)}</p>
                        </div>
                        <div>
                          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Lucro Bruto</p>
                          <p style={{ color: b.lucroBruto > 0 ? '#10b981' : b.lucroBruto < 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 500 }}>
                            {b.lucroBruto > 0 ? '+' : ''}{formatEur(b.lucroBruto)}
                          </p>
                        </div>
                         <div>
                          <p style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Tributado (IRS)</p>
                          <p style={{ color: '#ef4444' }}>{formatEur(b.irs)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <TimelineChart data={metrics.timeline} />
          </>
        )}

        {/* Portfolio Tab */}
        {!loading && hasData && activeTab === 'portfolio' && (
          <PortfolioTab rows={rows} />
        )}

        {/* P&L Tab */}
        {!loading && hasData && activeTab === 'pnl' && (
          <PnLTab rows={rows} />
        )}

        {/* Annual History Tab */}
        {!loading && hasData && activeTab === 'annual' && (
          <AnnualTab rows={rows} />
        )}

        {/* Savings Tab */}
        {!loading && hasData && activeTab === 'savings' && (
          <SavingsTab rows={rows} />
        )}

        {/* Charts Tab */}
        {!loading && hasData && activeTab === 'charts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 24 }}>
              <PortfolioPieChart data={metrics.byTipo} />
              <BrokerBarChart data={metrics.byBroker} />
            </div>
            <TimelineChart data={metrics.timeline} />
          </div>
        )}

        {/* Transactions Tab */}
        {!loading && hasData && activeTab === 'transactions' && (
          <TransactionTable
            rows={rows}
            onEdit={handleOpenEdit}
            onDelete={deleteRow}
          />
        )}

        {/* Calculator Tab */}
        {!loading && activeTab === 'calculator' && (
          <CalculatorTab />
        )}
      </main>
    </div>
  );
}
