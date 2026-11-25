import {
  Activity,
  AlertOctagon,
  Bell,
  BellRing,
  FileSpreadsheet,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Plug,
  RefreshCcw,
  ScrollText,
  Shuffle,
  Sun,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { COMPANY } from '../data/catalog';
import { fmtRelative } from '../domain/format';
import { isAdmin, useHub } from '../store/useHub';
import { Modal, Switch, Toaster } from './ui';

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 32 32">
        <circle cx="9" cy="9" r="3.6" fill="#fff" />
        <circle cx="23" cy="9" r="3.6" fill="#fff" />
        <circle cx="16" cy="23" r="3.6" fill="#9dc8f7" />
        <path d="M9 9L16 23L23 9" stroke="#fff" strokeWidth="2.2" fill="none" />
      </svg>
    </span>
  );
}

function NavItem({ to, icon, children, count, end }: { to: string; icon: ReactNode; children: ReactNode; count?: number; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
      {icon}
      <span>{children}</span>
      {count ? (
        <span className="count" aria-label={`${count} pendentes`}>
          {count}
        </span>
      ) : null}
    </NavLink>
  );
}

function NotificationsMenu() {
  const notifications = useHub((s) => s.notifications);
  const markRead = useHub((s) => s.markNotificationsRead);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, []);
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn btn-ghost btn-icon" aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {unread ? <BellRing size={19} /> : <Bell size={19} />}
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, background: '#c0262a', color: '#fff', borderRadius: 9, fontSize: 10.5, fontWeight: 700, padding: '0 5px', lineHeight: '16px' }} aria-hidden>
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notificações">
          <div className="row between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <h3>Notificações</h3>
            {unread > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => markRead()}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 && <p className="muted small" style={{ padding: 16 }}>Nenhuma notificação.</p>}
            {notifications.slice(0, 8).map((n) => (
              <button
                key={n.id}
                className="menu-item"
                style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--border)', borderRadius: 0, padding: '10px 14px' }}
                onClick={() => {
                  markRead([n.id]);
                  setOpen(false);
                  navigate(`/alertas?n=${n.id}`);
                }}
              >
                <span className={`dot ${n.severity === 'critical' ? 'dot-err' : 'dot-warn'}`} style={{ marginTop: 6, opacity: n.read ? 0.35 : 1 }} aria-hidden />
                <span>
                  <span className="strong" style={{ display: 'block', fontWeight: n.read ? 500 : 650 }}>{n.title}</span>
                  <span className="small muted">{fmtRelative(n.at)}</span>
                </span>
              </button>
            ))}
          </div>
          <div style={{ padding: 8 }}>
            <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => { setOpen(false); navigate('/alertas'); }}>
              Ver alertas e regras
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ onReset }: { onReset: () => void }) {
  const user = useHub((s) => s.user)!;
  const logout = useHub((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn btn-ghost" style={{ paddingLeft: 6 }} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }} aria-hidden>
          {user.initials}
        </span>
        <span className="hide-sm" style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <span style={{ display: 'block', fontSize: 13 }}>{user.name}</span>
          <span className="muted" style={{ fontSize: 11.5, fontWeight: 500 }}>{user.role === 'admin' ? 'Administrador' : 'Operador'}</span>
        </span>
      </button>
      {open && (
        <div className="popover" role="menu" style={{ width: 250, padding: 6 }} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <div style={{ padding: '8px 12px 10px' }}>
            <div className="strong">{user.name}</div>
            <div className="small muted">{user.email}</div>
          </div>
          <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); onReset(); }}>
            <RefreshCcw size={16} aria-hidden /> Restaurar dados de exemplo
          </button>
          <button role="menuitem" className="menu-item" onClick={logout}>
            <LogOut size={16} aria-hidden /> Sair (trocar de perfil)
          </button>
        </div>
      )}
    </div>
  );
}

export function ResetDialog({ onClose }: { onClose: () => void }) {
  const reset = useHub((s) => s.resetDemo);
  const toast = useHub((s) => s.toast);
  return (
    <Modal
      title="Restaurar dados de exemplo?"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              reset();
              onClose();
              toast({ kind: 'success', title: 'Dados restaurados', message: 'A demonstração voltou ao estado inicial.' });
            }}
          >
            <RefreshCcw size={16} aria-hidden /> Restaurar
          </button>
        </>
      }
    >
      <p className="muted">Pedidos, erros, mapeamentos, conciliações, alertas e o histórico de auditoria voltam ao estado original da demonstração. Os dados ficam apenas neste navegador.</p>
    </Modal>
  );
}

export function Layout() {
  const user = useHub((s) => s.user)!;
  const theme = useHub((s) => s.theme);
  const setTheme = useHub((s) => s.setTheme);
  const liveMode = useHub((s) => s.liveMode);
  const setLiveMode = useHub((s) => s.setLiveMode);
  const jobs = useHub((s) => s.jobs);
  const [navOpen, setNavOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const location = useLocation();
  const errorCount = useMemo(() => jobs.filter((j) => j.status === 'error').length, [jobs]);
  const admin = isAdmin(user);

  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className="app">
      <a href="#conteudo" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }}>
        Pular para o conteúdo
      </a>
      {navOpen && <div className="overlay" style={{ zIndex: 54 }} onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Menu principal">
        <NavLink to="/" className="brand">
          <BrandMark />
          <span>
            <span className="brand-name">Integra Hub</span>
            <span className="brand-sub" style={{ display: 'block' }}>Central de integrações</span>
          </span>
        </NavLink>
        <nav className="nav">
          <NavItem to="/" end icon={<LayoutDashboard size={18} aria-hidden />}>Visão geral</NavItem>
          <NavItem to="/integracoes" icon={<Plug size={18} aria-hidden />}>Integrações</NavItem>
          <NavItem to="/fila" icon={<ListChecks size={18} aria-hidden />}>Fila e execuções</NavItem>
          <NavItem to="/erros" icon={<AlertOctagon size={18} aria-hidden />} count={errorCount}>Tratamento de erros</NavItem>
          <div className="nav-label">Operação</div>
          <NavItem to="/importacao" icon={<FileSpreadsheet size={18} aria-hidden />}>Importar planilha</NavItem>
          <NavItem to="/conciliacao" icon={<GitCompareArrows size={18} aria-hidden />}>Conciliação bancária</NavItem>
          <NavItem to="/alertas" icon={<BellRing size={18} aria-hidden />}>Alertas</NavItem>
          <div className="nav-label">Gestão</div>
          {admin && <NavItem to="/mapeamento" icon={<Shuffle size={18} aria-hidden />}>Mapeamento de campos</NavItem>}
          <NavItem to="/auditoria" icon={<ScrollText size={18} aria-hidden />}>Logs e auditoria</NavItem>
        </nav>
        <div className="sidebar-foot">
          <div className="company">
            <span className="company-logo" aria-hidden>N</span>
            <span>
              <span style={{ color: '#fff', fontWeight: 600, display: 'block' }}>{COMPANY.name}</span>
              <span style={{ color: '#93a3b8' }}>{COMPANY.city}</span>
            </span>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" aria-label="Abrir menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
            <Menu size={20} />
          </button>
          <div className={`live-pill ${liveMode ? 'on' : ''}`} title="Gera pedidos novos a cada poucos segundos, com alguns erros">
            {liveMode ? <Activity size={16} color="#dc3c3d" className="pulse" aria-hidden /> : <Zap size={16} aria-hidden />}
            <Switch live checked={liveMode} onChange={setLiveMode} label="Demonstração ao vivo">
              <span className="small strong" aria-hidden>
                <span className="live-full">Demonstração ao vivo</span>
                <span className="live-short">Ao vivo</span>
              </span>
            </Switch>
          </div>
          <div className="spacer" />
          <button className="btn btn-ghost btn-icon" aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <NotificationsMenu />
          <UserMenu onReset={() => setResetOpen(true)} />
        </header>
        <main className="content" id="conteudo" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="footer">Demonstração · Desenvolvido por EMERICH Tech Solution · Todos os dados são fictícios</footer>
      </div>
      {resetOpen && <ResetDialog onClose={() => setResetOpen(false)} />}
      <Toaster />
    </div>
  );
}
