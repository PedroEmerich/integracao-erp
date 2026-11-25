import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui';
import { AlertsPage } from './pages/Alerts';
import { AuditPage } from './pages/Audit';
import { DashboardPage } from './pages/Dashboard';
import { ErrorsPage } from './pages/Errors';
import { ImportPage } from './pages/Import';
import { IntegrationDetailPage } from './pages/IntegrationDetail';
import { IntegrationsPage } from './pages/Integrations';
import { LoginPage } from './pages/Login';
import { MappingPage } from './pages/Mapping';
import { QueuePage } from './pages/Queue';
import { ReconciliationPage } from './pages/Reconciliation';
import { startEngine } from './store/engine';
import { isAdmin, useHub } from './store/useHub';

const TITLES: Record<string, string> = {
  '': 'Visão geral',
  integracoes: 'Integrações',
  fila: 'Fila e execuções',
  erros: 'Tratamento de erros',
  mapeamento: 'Mapeamento de campos',
  importacao: 'Importar planilha',
  conciliacao: 'Conciliação bancária',
  alertas: 'Alertas',
  auditoria: 'Logs e auditoria',
  login: 'Entrar',
};

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const key = pathname.split('/')[1] ?? '';
    document.title = `${TITLES[key] ?? 'Integra Hub'} · Integra Hub`;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Protected({ children, adminOnly }: { children: JSX.Element; adminOnly?: boolean }) {
  const user = useHub((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && !isAdmin(user)) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  const theme = useHub((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => startEngine(), []);

  return (
    <HashRouter>
      <DocumentTitle />
      <Routes>
        <Route path="/login" element={<><LoginPage /><Toaster /></>} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<DashboardPage />} />
          <Route path="integracoes" element={<IntegrationsPage />} />
          <Route path="integracoes/:id" element={<IntegrationDetailPage />} />
          <Route path="fila" element={<QueuePage />} />
          <Route path="fila/:jobId" element={<QueuePage />} />
          <Route path="erros" element={<ErrorsPage />} />
          <Route path="mapeamento" element={<Protected adminOnly><MappingPage /></Protected>} />
          <Route path="importacao" element={<ImportPage />} />
          <Route path="conciliacao" element={<ReconciliationPage />} />
          <Route path="alertas" element={<AlertsPage />} />
          <Route path="auditoria" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
