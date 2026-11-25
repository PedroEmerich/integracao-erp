import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Lock, RotateCw, Save, Shuffle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { SyncButton, SyncProgress } from '../components/Sync';
import { HealthBadge, StatusBadge, Switch } from '../components/ui';
import { connectors } from '../store/engine';
import { fmtBRL, fmtDuration, fmtNum, fmtRelative, fmtTime } from '../domain/format';
import type { Frequency, FrequencyMode, IntegrationId } from '../domain/types';
import { isAdmin, useHub } from '../store/useHub';
import { frequencyLabel } from './Integrations';

const CONNECTOR_OF: Record<IntegrationId, (keyof typeof connectors)[]> = {
  'store-erp-orders': ['store', 'erp'],
  'erp-store-stock': ['erp', 'store'],
  'sheet-erp': ['sheets', 'erp'],
  'bank-recon': ['bank', 'erp'],
  'carrier-tracking': ['carrier', 'store'],
};

function mask(v: string) {
  return '•'.repeat(Math.max(6, Math.min(16, v.length - 4))) + v.slice(-4);
}

export function IntegrationDetailPage() {
  const { id } = useParams();
  const it = useHub((s) => s.integrations.find((i) => i.id === id));
  const jobs = useHub((s) => s.jobs);
  const user = useHub((s) => s.user);
  const setEnabled = useHub((s) => s.setIntegrationEnabled);
  const setFrequency = useHub((s) => s.setFrequency);
  const rotate = useHub((s) => s.rotateCredential);
  const toast = useHub((s) => s.toast);
  const navigate = useNavigate();
  const admin = isAdmin(user);
  const [freq, setFreq] = useState<Frequency | null>(it?.frequency ?? null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (it) setFreq(it.frequency);
  }, [it?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!it || !freq) return <Navigate to="/integracoes" replace />;
  const items = jobs.filter((j) => j.integrationId === it.id).slice(0, 12);
  const dirty = JSON.stringify(freq) !== JSON.stringify(it.frequency);

  return (
    <>
      <Link to="/integracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }}>
        <ArrowLeft size={15} aria-hidden /> Integrações
      </Link>
      <div className="page-head">
        <div>
          <div className="row wrap" style={{ gap: 10 }}>
            <h1>{it.name}</h1>
            <HealthBadge health={it.enabled ? it.health : 'paused'} />
          </div>
          <p>{it.description}</p>
        </div>
        <div className="page-actions" style={{ alignItems: 'center' }}>
          <Switch checked={it.enabled} onChange={(v) => setEnabled(it.id, v)} label={it.enabled ? 'Integração ligada' : 'Integração desligada'} disabled={!admin} />
          <SyncButton id={it.id} />
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <SyncProgress id={it.id} />
      </div>

      <div className="grid grid-main">
        <div className="stack">
          <section className="card" aria-labelledby="freq-h">
            <div className="card-head">
              <div>
                <h2 id="freq-h">Frequência de execução</h2>
                <p>Atual: {frequencyLabel(it.frequency)}</p>
              </div>
              {!admin && <span className="badge b-muted"><Lock size={12} aria-hidden /> Somente administrador</span>}
            </div>
            <fieldset className="card-body stack" disabled={!admin} style={{ border: 0, margin: 0 }}>
              <legend className="sr-only">Modo de execução</legend>
              <div className="seg" role="radiogroup" aria-label="Modo">
                {(
                  [
                    ['realtime', 'Tempo real'],
                    ['interval', 'A cada X minutos'],
                    ['fixed', 'Horário fixo'],
                  ] as [FrequencyMode, string][]
                ).map(([m, l]) => (
                  <button key={m} type="button" role="radio" aria-checked={freq.mode === m} aria-pressed={freq.mode === m} onClick={() => setFreq({ ...freq, mode: m })}>
                    {l}
                  </button>
                ))}
              </div>
              {freq.mode === 'realtime' && <p className="small muted">A origem avisa o Hub a cada novo registro (webhook) e o item entra na fila na hora.</p>}
              {freq.mode === 'interval' && (
                <div className="field" style={{ maxWidth: 220 }}>
                  <label htmlFor="interval">Intervalo (minutos)</label>
                  <select id="interval" className="select" value={freq.intervalMin} onChange={(e) => setFreq({ ...freq, intervalMin: Number(e.target.value) })}>
                    {[1, 5, 10, 15, 30, 60, 120, 240].map((n) => (
                      <option key={n} value={n}>{n} min</option>
                    ))}
                  </select>
                </div>
              )}
              {freq.mode === 'fixed' && (
                <div className="field" style={{ maxWidth: 220 }}>
                  <label htmlFor="fixed">Horário diário</label>
                  <input id="fixed" type="time" className="input" value={freq.fixedTime} onChange={(e) => setFreq({ ...freq, fixedTime: e.target.value })} />
                </div>
              )}
              {admin && (
                <div className="row">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!dirty}
                    onClick={() => {
                      setFrequency(it.id, freq);
                      toast({ kind: 'success', title: 'Frequência salva', message: frequencyLabel(freq) });
                    }}
                  >
                    <Save size={14} aria-hidden /> Salvar
                  </button>
                  {dirty && <button className="btn btn-sm btn-ghost" onClick={() => setFreq(it.frequency)}>Descartar</button>}
                </div>
              )}
            </fieldset>
          </section>

          <section className="card" aria-labelledby="items-h">
            <div className="card-head">
              <h2 id="items-h">Últimos itens desta integração</h2>
              <Link to={`/fila?integracao=${it.id}`} className="btn btn-sm">Abrir na fila <ArrowRight size={14} aria-hidden /></Link>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Status</th>
                    <th className="num hide-sm">Valor</th>
                    <th className="num hide-sm">Duração</th>
                    <th className="num">Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((j) => (
                    <tr key={j.id} className="clickable" onClick={() => navigate(`/fila/${j.id}`)}>
                      <td>
                        <Link to={`/fila/${j.id}`} className="strong" onClick={(e) => e.stopPropagation()}>{j.reference}</Link>
                        <div className="small muted">{j.description}</div>
                      </td>
                      <td><StatusBadge status={j.status} retrying={!!j.nextRetryAt} /></td>
                      <td className="num hide-sm">{j.amount !== undefined ? fmtBRL(j.amount) : '—'}</td>
                      <td className="num hide-sm">{fmtDuration(j.durationMs)}</td>
                      <td className="num small muted">{fmtTime(j.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="conn-h">
            <div className="card-head"><h2 id="conn-h">Conectores</h2></div>
            <div className="card-body stack" style={{ gap: 10 }}>
              <dl className="kv">
                <dt>Origem</dt>
                <dd>{connectors[CONNECTOR_OF[it.id][0]].name}</dd>
                <dt>Destino</dt>
                <dd>{connectors[CONNECTOR_OF[it.id][1]].name}</dd>
                <dt>Último ping</dt>
                <dd>{fmtRelative(it.lastPing)} · {it.latencyMs ? `${fmtNum(it.latencyMs)} ms` : 'sem resposta'}</dd>
                <dt>Última sincronização</dt>
                <dd>{fmtRelative(it.lastSync)}</dd>
              </dl>
              {admin && (
                <Link to={`/mapeamento?integracao=${it.id}`} className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>
                  <Shuffle size={14} aria-hidden /> Editar mapeamento de campos
                </Link>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="cred-h">
            <div className="card-head">
              <div>
                <h2 id="cred-h">Credenciais</h2>
                <p>Valores fictícios, mascarados por padrão</p>
              </div>
              <KeyRound size={18} aria-hidden className="muted" />
            </div>
            <div className="card-body stack" style={{ gap: 12 }}>
              {!admin && <p className="small muted">Credenciais visíveis apenas para administradores.</p>}
              {it.credentials.map((c) => (
                <div key={c.key} className="field">
                  <span className="label">{c.label}</span>
                  <div className="row">
                    <code className="input" style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', background: 'var(--surface-2)' }} aria-label={`${c.label}${c.secret && !revealed[c.key] ? ' (mascarado)' : ''}`}>
                      {c.secret && (!revealed[c.key] || !admin) ? mask(c.value) : !admin && c.secret ? mask(c.value) : c.value}
                    </code>
                    {admin && c.secret && (
                      <>
                        <button className="btn btn-icon btn-sm" onClick={() => setRevealed({ ...revealed, [c.key]: !revealed[c.key] })} aria-label={revealed[c.key] ? `Ocultar ${c.label}` : `Mostrar ${c.label}`}>
                          {revealed[c.key] ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => {
                            rotate(it.id, c.key);
                            toast({ kind: 'success', title: 'Credencial renovada', message: `${c.label} atualizado (valor fictício).` });
                          }}
                          aria-label={`Renovar ${c.label}`}
                          title="Renovar"
                        >
                          <RotateCw size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
