import { CheckCircle2, Clock, EyeOff, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IgnoreDialog, JobDrawer } from '../components/JobDrawer';
import { EmptyState } from '../components/ui';
import { INTEGRATION_ORDER, INTEGRATION_SHORT } from '../data/seed';
import { ERROR_CATALOG, RETRY_POLICY } from '../domain/errors';
import { fmtBRL, fmtRelative, fmtTime } from '../domain/format';
import type { ErrorCode } from '../domain/types';
import { useHub } from '../store/useHub';

export function ErrorsPage() {
  const jobs = useHub((s) => s.jobs);
  const reprocess = useHub((s) => s.reprocess);
  const ignore = useHub((s) => s.ignore);
  const toast = useHub((s) => s.toast);
  const [params, setParams] = useSearchParams();
  const code = (params.get('codigo') ?? '') as ErrorCode | '';
  const integration = params.get('integracao') ?? '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [ignoring, setIgnoring] = useState(false);

  const pending = useMemo(() => jobs.filter((j) => j.status === 'error'), [jobs]);
  const retrying = useMemo(() => jobs.filter((j) => j.status === 'queued' && j.nextRetryAt), [jobs]);
  const groups = useMemo(() => {
    const m = new Map<ErrorCode, number>();
    pending.forEach((j) => j.error && m.set(j.error.code, (m.get(j.error.code) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pending]);
  const list = pending.filter((j) => (!code || j.error?.code === code) && (!integration || j.integrationId === integration));
  const allSel = list.length > 0 && list.every((j) => selected.has(j.id));
  const sel = [...selected].filter((id) => list.some((j) => j.id === id));

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    v ? n.set(k, v) : n.delete(k);
    setParams(n, { replace: true });
    setSelected(new Set());
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tratamento de erros</h1>
          <p>Erros explicados em português, com correção na hora, reprocessamento e retentativas automáticas.</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <span className="kpi-label">Aguardando correção</span>
          <span className="kpi-value tabnum" style={{ color: pending.length ? 'var(--err)' : undefined }}>{pending.length}</span>
          <span className="kpi-foot">Itens parados até alguém agir</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label"><Clock size={15} aria-hidden /> Em retentativa automática</span>
          <span className="kpi-value tabnum">{retrying.length}</span>
          <span className="kpi-foot">Até {RETRY_POLICY.maxAttempts} tentativas com espera crescente ({RETRY_POLICY.baseDelayMs / 1000}s, {RETRY_POLICY.baseDelayMs * 2 / 1000}s, {RETRY_POLICY.baseDelayMs * 4 / 1000}s…)</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label"><CheckCircle2 size={15} aria-hidden /> Reprocessados com sucesso</span>
          <span className="kpi-value tabnum">{jobs.filter((j) => j.status === 'reprocessed').length}</span>
          <span className="kpi-foot">Recuperados sem retrabalho manual no ERP</span>
        </div>
      </div>

      {groups.length > 0 && (
        <section aria-label="Erros por motivo" className="grid grid-3" style={{ marginBottom: 16 }}>
          {groups.map(([c, n]) => {
            const def = ERROR_CATALOG[c];
            const active = code === c;
            return (
              <button key={c} className="card" style={{ textAlign: 'left', padding: 14, cursor: 'pointer', borderColor: active ? 'var(--primary)' : undefined, boxShadow: active ? '0 0 0 2px var(--primary)' : undefined }} aria-pressed={active} onClick={() => set('codigo', active ? '' : c)}>
                <div className="row between">
                  <span className="strong">{def.title}</span>
                  <span className="badge b-err tabnum">{n}</span>
                </div>
                <p className="small muted" style={{ marginTop: 6 }}>{def.hint}</p>
                <span className={`badge ${def.transient ? 'b-warn' : 'b-info'}`} style={{ marginTop: 8 }}>{def.transient ? 'Instabilidade — reprocessar' : 'Dado precisa de correção'}</span>
              </button>
            );
          })}
        </section>
      )}

      <div className="card">
        <div className="filters">
          <label className="sr-only" htmlFor="e-int">Integração</label>
          <select id="e-int" className="select" value={integration} onChange={(e) => set('integracao', e.target.value)}>
            <option value="">Todas as integrações</option>
            {INTEGRATION_ORDER.map((id) => (
              <option key={id} value={id}>{INTEGRATION_SHORT[id]}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="e-code">Motivo</label>
          <select id="e-code" className="select" value={code} onChange={(e) => set('codigo', e.target.value)}>
            <option value="">Todos os motivos</option>
            {groups.map(([c]) => (
              <option key={c} value={c}>{ERROR_CATALOG[c].title}</option>
            ))}
          </select>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <button
              className="btn btn-sm btn-primary"
              disabled={!sel.length}
              onClick={() => {
                reprocess(sel);
                toast({ kind: 'success', title: 'Reprocessamento em lote', message: `${sel.length} itens voltaram para a fila.` });
                setSelected(new Set());
              }}
            >
              <RotateCcw size={14} aria-hidden /> Reprocessar selecionados{sel.length ? ` (${sel.length})` : ''}
            </button>
            <button className="btn btn-sm" disabled={!sel.length} onClick={() => setIgnoring(true)}>
              <EyeOff size={14} aria-hidden /> Ignorar selecionados
            </button>
          </div>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={26} />} title={pending.length ? 'Nenhum erro com esses filtros' : 'Nenhum erro pendente'} action={<Link to="/fila" className="btn">Ver a fila completa</Link>}>
            {pending.length ? 'Limpe os filtros para ver os demais itens.' : 'Tudo foi sincronizado ou tratado. Ligue a demonstração ao vivo para gerar novos pedidos (alguns com erro).'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" aria-label="Selecionar todos" checked={allSel} onChange={(e) => setSelected(e.target.checked ? new Set(list.map((j) => j.id)) : new Set())} />
                  </th>
                  <th>Item</th>
                  <th>Motivo</th>
                  <th className="hide-sm">Integração</th>
                  <th className="num hide-sm">Valor</th>
                  <th className="num">Quando</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((j) => (
                  <tr key={j.id} className="row-error">
                    <td>
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
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm strong" style={{ padding: 0, height: 'auto', color: 'var(--primary-text)' }} onClick={() => setOpen(j.id)}>{j.reference}</button>
                      <div className="small muted">{j.description}</div>
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      <div className="strong" style={{ color: 'var(--err)' }}>{j.error?.title}</div>
                      <div className="small muted">{j.error?.message}</div>
                    </td>
                    <td className="hide-sm small">{INTEGRATION_SHORT[j.integrationId]}</td>
                    <td className="num hide-sm">{j.amount !== undefined ? fmtBRL(j.amount) : '—'}</td>
                    <td className="num small muted" title={fmtTime(j.updatedAt)}>{fmtRelative(j.updatedAt)}</td>
                    <td><button className="btn btn-sm" onClick={() => setOpen(j.id)}>Resolver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {retrying.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>Retentativas automáticas agendadas</h2></div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {retrying.map((j) => (
                  <tr key={j.id}>
                    <td><button className="btn btn-ghost btn-sm strong" style={{ padding: 0, height: 'auto', color: 'var(--primary-text)' }} onClick={() => setOpen(j.id)}>{j.reference}</button></td>
                    <td className="small">{j.error?.title}</td>
                    <td className="small muted">Tentativa {j.attempts + 1} de {j.maxAttempts} às {j.nextRetryAt ? fmtTime(j.nextRetryAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && <JobDrawer jobId={open} onClose={() => setOpen(null)} />}
      {ignoring && (
        <IgnoreDialog
          count={sel.length}
          onClose={() => setIgnoring(false)}
          onConfirm={(r) => {
            ignore(sel, r);
            setIgnoring(false);
            setSelected(new Set());
            toast({ kind: 'success', title: `${sel.length} itens ignorados`, message: 'Justificativa registrada na auditoria.' });
          }}
        />
      )}
    </>
  );
}
