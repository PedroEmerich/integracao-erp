import { ArrowRight, Settings2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SyncButton, SyncProgress } from '../components/Sync';
import { HealthBadge, Switch } from '../components/ui';
import { fmtNum, fmtRelative } from '../domain/format';
import type { Frequency } from '../domain/types';
import { isAdmin, useHub } from '../store/useHub';

export function frequencyLabel(f: Frequency): string {
  if (f.mode === 'realtime') return 'Tempo real (webhook)';
  if (f.mode === 'interval') return `A cada ${f.intervalMin} min`;
  return `Diariamente às ${f.fixedTime}`;
}

export function IntegrationsPage() {
  const integrations = useHub((s) => s.integrations);
  const stats = useHub((s) => s.stats);
  const jobs = useHub((s) => s.jobs);
  const user = useHub((s) => s.user);
  const setEnabled = useHub((s) => s.setIntegrationEnabled);
  const admin = isAdmin(user);

  const today = useMemo(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const m: Record<string, { ok: number; error: number }> = {};
    stats.filter((s) => new Date(s.hour) >= t0).forEach((s) => {
      m[s.integrationId] ??= { ok: 0, error: 0 };
      m[s.integrationId].ok += s.ok;
      m[s.integrationId].error += s.error;
    });
    return m;
  }, [stats]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Integrações</h1>
          <p>Conectores entre a loja virtual, planilhas, banco, transportadoras e o ERP da Nortex.</p>
        </div>
      </div>
      {!admin && (
        <div className="callout callout-info" style={{ marginBottom: 16 }}>
          <Settings2 size={18} aria-hidden />
          <div className="small">Você está no perfil <strong>Operador</strong>: pode sincronizar e acompanhar, mas ligar/desligar, frequência e credenciais ficam com o Administrador.</div>
        </div>
      )}
      <div className="grid grid-2">
        {integrations.map((i) => {
          const t = today[i.id] ?? { ok: 0, error: 0 };
          const pending = jobs.filter((j) => j.integrationId === i.id && j.status === 'error').length;
          const queued = jobs.filter((j) => j.integrationId === i.id && j.status === 'queued').length;
          return (
            <article key={i.id} className="card conn-card" aria-labelledby={`int-${i.id}`}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h2 id={`int-${i.id}`}>{i.name}</h2>
                  <div className="conn-flow" style={{ marginTop: 6 }}>
                    <span className="conn-node">{i.source}</span>
                    <ArrowRight size={14} aria-hidden />
                    <span className="conn-node">{i.target}</span>
                  </div>
                </div>
                <HealthBadge health={i.enabled ? i.health : 'paused'} />
              </div>
              <p className="small muted">{i.description}</p>
              <dl className="kv">
                <dt>Frequência</dt>
                <dd>{frequencyLabel(i.frequency)}</dd>
                <dt>Última sincronização</dt>
                <dd>{fmtRelative(i.lastSync)}</dd>
                <dt>Hoje</dt>
                <dd>
                  <span className="tabnum">{fmtNum(t.ok)}</span> concluídos · <span className="tabnum" style={{ color: t.error ? 'var(--err)' : undefined }}>{fmtNum(t.error)}</span> com erro
                  {pending > 0 && (
                    <>
                      {' · '}
                      <Link to={`/erros?integracao=${i.id}`}>{pending} {pending === 1 ? 'pendente' : 'pendentes'}</Link>
                    </>
                  )}
                  {queued > 0 && !i.enabled && <> · <span className="strong">{queued} aguardando na fila</span></>}
                </dd>
              </dl>
              <SyncProgress id={i.id} />
              <div className="row between wrap" style={{ marginTop: 'auto', gap: 10 }}>
                <Switch checked={i.enabled} onChange={(v) => setEnabled(i.id, v)} label={i.enabled ? 'Ligada' : 'Desligada'} disabled={!admin} />
                <div className="row">
                  <Link to={`/integracoes/${i.id}`} className="btn btn-sm">Detalhes</Link>
                  <SyncButton id={i.id} size="sm" />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
