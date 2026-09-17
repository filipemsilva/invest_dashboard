import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError('Credenciais inválidas. Tente novamente.');
      setLoading(false);
      return;
    }

    if (data.session) {
      onLogin(data.session);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: 20
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 24,
        padding: '40px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        textAlign: 'center'
      }}>
        {/* Logo/Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
            boxShadow: '0 8px 24px rgba(59,130,246,0.5)'
          }}>
            🔐
          </div>
        </div>

        <h1 style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Área Privada
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 32, lineHeight: 1.5 }}>
          Por favor, introduza as suas credenciais para aceder ao seu portfólio de investimentos.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444',
            padding: 12,
            borderRadius: 12,
            fontSize: 13,
            marginBottom: 24,
            fontWeight: 500
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.2)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: 14,
                transition: 'border 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-blue)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.2)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: 14,
                transition: 'border 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-blue)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '14px',
              borderRadius: 12,
              border: 'none',
              background: loading ? 'rgba(59,130,246,0.5)' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              marginTop: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 8px 16px rgba(59,130,246,0.3)',
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
            onMouseDown={(e) => { if(!loading) e.currentTarget.style.transform = 'scale(0.98)' }}
            onMouseUp={(e) => { if(!loading) e.currentTarget.style.transform = 'scale(1)' }}
            onMouseLeave={(e) => { if(!loading) e.currentTarget.style.transform = 'scale(1)' }}
          >
            {loading ? 'A validar...' : 'Entrar Seguramente'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: '0 16px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
            Acesso restrito. Área privada apenas para o administrador autorizado do portfólio.
          </p>
        </div>
      </div>
    </div>
  );
}
