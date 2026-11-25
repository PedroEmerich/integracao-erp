import { Download, ScrollText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '../components/ui';
import { downloadFile, fmtDateTime, toCsv } from '../domain/format';
import { useHub } from '../store/useHub';

const PAGE = 30;

export function AuditPage() {
  const audit = useHub((s) => s.audit);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);

  const users = useMemo(() => [...new Set(audit.map((a) => a.user))].sort(), [audit]);
  const actions = useMemo(() => [...new Set(audit.map((a) => a.action))].sort(), [audit]);
  const filtered = useMemo(
    () =>
      [...audit]
        .sort((a, b) => b.at.localeCompare(a.at))
        .filter((a) => (!who || a.user === who) && (!action || a.action === action) && (!q || `${a.action} ${a.target} ${a.details}`.toLowerCase().includes(q.toLowerCase()))),
    [audit, who, action, q],
  );
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const exportCsv = () => {
    downloadFile(
      `auditoria-integra-hub-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(['Data/hora', 'Usuário', 'Perfil', 'Ação', 'Alvo', 'Detalhes'], filtered.map((a) => [fmtDateTime(a.at), a.user, a.role === 'admin' ? 'Administrador' : a.role === 'operator' ? 'Operador' : 'Sistema', a.action, a.target, a.details])),
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Logs e auditoria</h1>
          <p>Quem fez o quê e quando: reprocessamentos, mapeamentos, integrações ligadas e desligadas, conciliações.</p>
        </div>
        <button className="btn btn-primary" onClick={exportCsv}><Download size={16} aria-hidden /> Exportar CSV ({filtered.length})</button>
      </div>
      <div className="card">
        <div className="filters">
          <div className="search">
            <Search size={16} aria-hidden />
            <input className="input" placeholder="Buscar em ação, alvo ou detalhes…" aria-label="Buscar no log" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <select className="select" aria-label="Usuário" value={who} onChange={(e) => { setWho(e.target.value); setPage(0); }}>
            <option value="">Todos os usuários</option>
            {users.map((u) => <option key={u}>{u}</option>)}
          </select>
          <select className="select" aria-label="Ação" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}>
            <option value="">Todas as ações</option>
            {actions.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={<ScrollText size={26} />} title="Nenhum registro encontrado">Ajuste a busca ou os filtros.</EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data/hora</th>
                    <th>Usuário</th>
                    <th>Ação</th>
                    <th>Alvo</th>
                    <th className="hide-sm">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="small tabnum" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                      <td>
                        <div className="strong">{a.user}</div>
                        <div className="small muted">{a.role === 'admin' ? 'Administrador' : a.role === 'operator' ? 'Operador' : 'Automático'}</div>
                      </td>
                      <td><span className={`badge ${a.role === 'sistema' ? 'b-muted' : /Desligou|Ignorou|Excluiu|Removeu|Desfez/.test(a.action) ? 'b-warn' : 'b-info'}`}>{a.action}</span></td>
                      <td className="small">{a.target}</td>
                      <td className="hide-sm small muted" style={{ maxWidth: 420 }}>{a.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="small muted tabnum">{page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} de {filtered.length}</span>
              <div className="row">
                <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
                <button className="btn btn-sm" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>Próxima</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
