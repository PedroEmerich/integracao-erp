import { Download, Inbox, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { JobDrawer } from '../components/JobDrawer';
import { EmptyState, JOB_STATUS, StatusBadge } from '../components/ui';
import { INTEGRATION_ORDER, INTEGRATION_SHORT } from '../data/seed';
import { downloadFile, fmtBRL, fmtDateTime, fmtDuration, fmtTime, toCsv } from '../domain/format';
import type { JobStatus } from '../domain/types';
import { useHub } from '../store/useHub';

const PERIODS: [string, string, number][] = [
  ['1h', 'Última hora', 3600000],
  ['24h', 'Últimas 24 h', 86400000],
  ['7d', 'Últimos 7 dias', 7 * 86400000],
  ['all', 'Todo o período', Infinity],
];
const PAGE = 25;

export function QueuePage() {
  const jobs = useHub((s) => s.jobs);
  const reprocess = useHub((s) => s.reprocess);
  const toast = useHub((s) => s.toast);
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const integration = params.get('integracao') ?? '';
  const status = (params.get('status') ?? '') as JobStatus | '';
  const period = params.get('periodo') ?? 'all';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(0);
  };

  useEffect(() => {
    const t = setTimeout(() => setParam('q', q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const ms = PERIODS.find((p) => p[0] === period)?.[2] ?? Infinity;
    const term = (params.get('q') ?? '').toLowerCase().replace('#', '');
    return jobs.filter(
      (j) =>
        (!integration || j.integrationId === integration) &&
        (!status || j.status === status) &&
        (ms === Infinity || Date.now() - new Date(j.createdAt).getTime() <= ms) &&
        (!term || j.reference.toLowerCase().replace('#', '').includes(term) || j.description.toLowerCase().includes(term) || j.id.toLowerCase().includes(term)),
    );
  }, [jobs, integration, status, period, params]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    jobs.forEach((j) => (c[j.status] = (c[j.status] ?? 0) + 1));
    return c;
  }, [jobs]);

  const pageItems = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const selectableIds = pageItems.filter((j) => j.status === 'error').map((j) => j.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const hasFilters = integration || status || period !== 'all' || params.get('q');

  const exportCsv = () => {
    const rows = filtered.map((j) => [j.id, j.reference, INTEGRATION_SHORT[j.integrationId], JOB_STATUS[j.status].label, j.attempts, j.durationMs, j.amount ?? '', fmtDateTime(j.createdAt), j.error?.title ?? '']);
    downloadFile(`fila-execucoes-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(['ID', 'Referência', 'Integração', 'Status', 'Tentativas', 'Duração (ms)', 'Valor', 'Recebido em', 'Erro'], rows));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fila e execuções</h1>
          <p>Cada pedido, produto, título e rastreio que passou pelo Hub, com histórico completo.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={exportCsv}><Download size={16} aria-hidden /> Exportar CSV</button>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 12, gap: 6 }} role="group" aria-label="Filtro rápido por status">
        <button className={`btn btn-sm ${!status ? 'btn-primary' : ''}`} onClick={() => setParam('status', '')}>Todos <span className="tabnum">({jobs.length})</span></button>
        {(Object.keys(JOB_STATUS) as JobStatus[]).map((s) => (
          <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : ''}`} onClick={() => setParam('status', status === s ? '' : s)} aria-pressed={status === s}>
            {JOB_STATUS[s].label} <span className="tabnum">({counts[s] ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="filters">
          <div className="search">
            <Search size={16} aria-hidden />
            <label htmlFor="q" className="sr-only">Buscar por número do pedido</label>
            <input id="q" className="input" placeholder="Buscar nº do pedido, cliente, código…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="sr-only" htmlFor="f-int">Integração</label>
          <select id="f-int" className="select" value={integration} onChange={(e) => setParam('integracao', e.target.value)}>
            <option value="">Todas as integrações</option>
            {INTEGRATION_ORDER.map((id) => (
              <option key={id} value={id}>{INTEGRATION_SHORT[id]}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="f-status">Status</label>
          <select id="f-status" className="select" value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">Todos os status</option>
            {(Object.keys(JOB_STATUS) as JobStatus[]).map((s) => (
              <option key={s} value={s}>{JOB_STATUS[s].label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="f-period">Período</label>
          <select id="f-period" className="select" value={period} onChange={(e) => setParam('periodo', e.target.value === 'all' ? '' : e.target.value)}>
            {PERIODS.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Limpar filtros</button>
          )}
          {selected.size > 0 && (
            <button
              className="btn btn-primary btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                reprocess([...selected]);
                toast({ kind: 'success', title: 'Reprocessamento em lote', message: `${selected.size} itens voltaram para a fila.` });
                setSelected(new Set());
              }}
            >
              <RotateCcw size={14} aria-hidden /> Reprocessar {selected.size} selecionados
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={<Inbox size={26} />} title="Nenhum item encontrado" action={hasFilters ? <button className="btn" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Limpar filtros</button> : undefined}>
            {hasFilters ? 'Nenhuma execução corresponde aos filtros. Tente ampliar o período ou buscar outro número.' : 'Ainda não há execuções. Use “Sincronizar agora” numa integração ou ligue a demonstração ao vivo.'}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos os itens com erro desta página"
                        checked={allSelected}
                        disabled={!selectableIds.length}
                        onChange={(e) => {
                          const n = new Set(selected);
                          selectableIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id)));
                          setSelected(n);
                        }}
                      />
                    </th>
                    <th>Item</th>
                    <th className="hide-sm">Integração</th>
                    <th>Status</th>
                    <th className="num hide-sm">Tentativas</th>
                    <th className="num hide-sm">Duração</th>
                    <th className="num hide-sm">Valor</th>
                    <th className="num">Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((j) => (
                    <tr key={j.id} className={`clickable ${j.status === 'error' ? 'row-error' : ''} ${j.id === jobId ? 'selected' : ''}`} onClick={() => navigate(`/fila/${j.id}?${params.toString()}`)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        {j.status === 'error' && (
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${j.reference}`}
                            checked={selected.has(j.id)}
                            onChange={(e) => {
                              const n = new Set(selected);
                              e.target.checked ? n.add(j.id) : n.delete(j.id);
                              setSelected(n);
                            }}
                          />
                        )}
                      </td>
                      <td>
                        <Link to={`/fila/${j.id}?${params.toString()}`} className="strong" onClick={(e) => e.stopPropagation()}>{j.reference}</Link>
                        <div className="small muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {j.status === 'error' && j.error ? <span style={{ color: 'var(--err)' }}>{j.error.title} · </span> : null}
                          {j.description}
                        </div>
                      </td>
                      <td className="hide-sm small">{INTEGRATION_SHORT[j.integrationId]}</td>
                      <td><StatusBadge status={j.status} retrying={!!j.nextRetryAt} /></td>
                      <td className="num hide-sm">{j.attempts}/{j.maxAttempts}</td>
                      <td className="num hide-sm">{fmtDuration(j.durationMs)}</td>
                      <td className="num hide-sm">{j.amount !== undefined ? fmtBRL(j.amount) : '—'}</td>
                      <td className="num small muted">
                        {new Date(j.createdAt).toDateString() === new Date().toDateString() ? fmtTime(j.createdAt) : fmtDateTime(j.createdAt).slice(0, 17)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="small muted tabnum">
                {page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} de {filtered.length}
              </span>
              <div className="row">
                <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
                <button className="btn btn-sm" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>Próxima</button>
              </div>
            </div>
          </>
        )}
      </div>
      {jobId && <JobDrawer jobId={jobId} onClose={() => navigate(`/fila?${params.toString()}`)} />}
    </>
  );
}
