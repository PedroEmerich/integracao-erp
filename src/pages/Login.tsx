import { ArrowRight, CheckCircle2, Lock, ShieldCheck, UserCog } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { COMPANY, DEMO_USERS } from '../data/catalog';
import { useHub } from '../store/useHub';

export function LoginPage() {
  const login = useHub((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const enter = (id: string) => {
    login(id);
    navigate(from === '/login' ? '/' : from, { replace: true });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = DEMO_USERS.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password);
    if (!u) {
      setError('E-mail ou senha não conferem. Use um dos atalhos de demonstração abaixo.');
      return;
    }
    enter(u.id);
  };

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark" aria-hidden style={{ width: 40, height: 40 }}>
            <svg width="22" height="22" viewBox="0 0 32 32"><circle cx="9" cy="9" r="3.6" fill="#fff" /><circle cx="23" cy="9" r="3.6" fill="#fff" /><circle cx="16" cy="23" r="3.6" fill="#9dc8f7" /><path d="M9 9L16 23L23 9" stroke="#fff" strokeWidth="2.2" fill="none" /></svg>
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>Integra Hub</div>
            <div style={{ fontSize: 13, color: '#a9bbd3' }}>{COMPANY.name} · {COMPANY.city}</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <h1>Seus sistemas não conversam? A gente conecta tudo.</h1>
          <p>Loja virtual, planilhas, banco, transportadora e ERP numa central só: rotinas automáticas e cada pedido acompanhado do início ao fim.</p>
          <div className="hero-points">
            {[
              'Pedidos da loja entram no ERP sozinhos, com validação de CNPJ, produto e estoque',
              'Erros explicados em português, com correção e reprocessamento em um clique',
              'Conciliação bancária automática e alertas por e-mail e WhatsApp',
            ].map((t) => (
              <div key={t}>
                <CheckCircle2 size={18} color="#6fd38a" aria-hidden style={{ flex: 'none', marginTop: 2 }} />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: '#8ea3bf' }}>Demonstração · Desenvolvido por EMERICH Tech Solution · Todos os dados são fictícios</div>
      </section>
      <section className="login-panel">
        <div className="card login-card">
          <h2 style={{ fontSize: 20 }}>Entrar na demonstração</h2>
          <p className="muted" style={{ margin: '4px 0 18px' }}>Escolha um perfil para entrar com um clique.</p>
          <div className="stack" style={{ gap: 10 }}>
            {DEMO_USERS.map((u) => (
              <button key={u.id} className="persona" onClick={() => enter(u.id)}>
                <span className="avatar" aria-hidden>{u.initials}</span>
                <span style={{ flex: 1 }}>
                  <span className="strong" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {u.role === 'admin' ? <ShieldCheck size={15} aria-hidden /> : <UserCog size={15} aria-hidden />}
                    Entrar como {u.role === 'admin' ? 'Administrador' : 'Operador'}
                  </span>
                  <span className="small muted">{u.name} · {u.title}</span>
                  <span className="small muted" style={{ display: 'block' }}>{u.role === 'admin' ? 'Acesso total, incluindo configurações e mapeamentos' : 'Opera a fila e trata erros; não acessa configurações'}</span>
                </span>
                <ArrowRight size={18} aria-hidden />
              </button>
            ))}
          </div>
          <div className="row" style={{ margin: '20px 0 14px', gap: 10 }}>
            <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--border)' }} />
            <span className="small muted">ou com e-mail e senha</span>
            <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--border)' }} />
          </div>
          <form className="stack" style={{ gap: 12 }} onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana.ribeiro@nortex.demo" />
            </div>
            <div className="field">
              <label htmlFor="password">Senha</label>
              <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="demo123" />
            </div>
            {error && <p role="alert" className="small" style={{ color: 'var(--err)' }}>{error}</p>}
            <button className="btn btn-primary" type="submit"><Lock size={15} aria-hidden /> Entrar</button>
            <p className="hint">Credenciais de demonstração: ana.ribeiro@nortex.demo ou carlos.mendes@nortex.demo · senha demo123</p>
          </form>
        </div>
      </section>
    </div>
  );
}
