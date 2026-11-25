import { BellRing, Copy, Lock, Mail, MessageCircle, Pencil, Plus, Send, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, Modal, Switch } from '../components/ui';
import { buildMessages, computeMetrics, METRIC_LABELS, ruleDescription } from '../domain/alerts';
import { fmtDateTime, fmtDuration, fmtPct, fmtRelative } from '../domain/format';
import type { AlertChannel, AlertMetric, AlertRule } from '../domain/types';
import { isAdmin, useHub } from '../store/useHub';

const CHANNELS: { id: AlertChannel; label: string; icon: JSX.Element }[] = [
  { id: 'email', label: 'E-mail', icon: <Mail size={14} aria-hidden /> },
  { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={14} aria-hidden /> },
  { id: 'app', label: 'No app', icon: <Smartphone size={14} aria-hidden /> },
];

function RuleForm({ rule, onClose }: { rule: AlertRule; onClose: () => void }) {
  const save = useHub((s) => s.saveAlertRule);
  const toast = useHub((s) => s.toast);
  const [r, setR] = useState(rule);
  const unit = METRIC_LABELS[r.metric].unit;
  return (
    <Modal
      title={rule.name ? 'Editar regra de alerta' : 'Nova regra de alerta'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={!r.name.trim() || !r.channels.length}
            onClick={() => {
              save({ ...r, name: r.name.trim() });
              toast({ kind: 'success', title: 'Regra salva', message: ruleDescription(r) });
              onClose();
            }}
          >
            Salvar regra
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="r-name">Nome</label>
          <input id="r-name" className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Ex.: Taxa de erro alta" />
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="r-metric">Se…</label>
            <select id="r-metric" className="select" value={r.metric} onChange={(e) => setR({ ...r, metric: e.target.value as AlertMetric })}>
              {(Object.keys(METRIC_LABELS) as AlertMetric[]).map((m) => (
                <option key={m} value={m}>{METRIC_LABELS[m].label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-th">passar de ({unit})</label>
            <input id="r-th" type="number" min={0} className="input" value={r.threshold} onChange={(e) => setR({ ...r, threshold: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="r-win">em uma janela de</label>
            <select id="r-win" className="select" value={r.windowMin} onChange={(e) => setR({ ...r, windowMin: Number(e.target.value) })}>
              {[5, 15, 30, 60].map((n) => (
                <option key={n} value={n}>{n} minutos</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-rec">Destinatários</label>
            <input id="r-rec" className="input" value={r.recipients} onChange={(e) => setR({ ...r, recipients: e.target.value })} placeholder="e-mail; telefone" />
          </div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Avisar por</legend>
          <div className="row wrap">
            {CHANNELS.map((c) => (
              <label key={c.id} className="row small" style={{ gap: 6, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                <input type="checkbox" checked={r.channels.includes(c.id)} onChange={(e) => setR({ ...r, channels: e.target.checked ? [...r.channels, c.id] : r.channels.filter((x) => x !== c.id) })} />
                {c.icon} {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="small muted">Resumo: {ruleDescription(r)}. Depois de disparar, a regra aguarda 15 min antes de avisar de novo.</p>
      </div>
    </Modal>
  );
}

function WhatsappPreview({ text }: { text: string }) {
  const html = text.split('\n').map((line, i) => (
    <div key={i}>
      {line.split(/(\*[^*]+\*)/).map((p, k) => (p.startsWith('*') && p.endsWith('*') ? <strong key={k}>{p.slice(1, -1)}</strong> : <span key={k}>{p}</span>))}
    </div>
  ));
  return (
    <div style={{ background: '#e5ddd5', borderRadius: 10, padding: 14 }}>
      <div style={{ background: '#dcf8c6', color: '#111', borderRadius: '10px 10px 2px 10px', padding: '8px 10px', maxWidth: 360, marginLeft: 'auto', fontSize: 13.5, boxShadow: '0 1px 1px rgba(0,0,0,.15)' }}>
        {html}
        <div style={{ textAlign: 'right', fontSize: 11, color: '#5b6b5b', marginTop: 2 }}>enviado pelo Integra Hub ✓✓</div>
      </div>
    </div>
  );
}

export function AlertsPage() {
  const rules = useHub((s) => s.alertRules);
  const notifications = useHub((s) => s.notifications);
  const jobs = useHub((s) => s.jobs);
  const integrations = useHub((s) => s.integrations);
  const user = useHub((s) => s.user);
  const save = useHub((s) => s.saveAlertRule);
  const del = useHub((s) => s.deleteAlertRule);
  const addNotification = useHub((s) => s.addNotification);
  const markRead = useHub((s) => s.markNotificationsRead);
  const toast = useHub((s) => s.toast);
  const admin = isAdmin(user);
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [selected, setSelected] = useState<string | null>(params.get('n') ?? notifications[0]?.id ?? null);
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('whatsapp');
  const m15 = useMemo(() => computeMetrics(jobs, integrations, new Date(), 15), [jobs, integrations]);
  const sel = notifications.find((n) => n.id === selected);

  useEffect(() => {
    const n = params.get('n');
    if (n) setSelected(n);
  }, [params]);
  useEffect(() => {
    if (sel && !sel.read) markRead([sel.id]);
    if (sel) setChannel(sel.whatsappText ? 'whatsapp' : 'email');
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const test = (rule: AlertRule) => {
    const m = computeMetrics(jobs, integrations, new Date(), rule.windowMin);
    const value = rule.metric === 'errorRate' ? Math.round(m.errorRate * 10) / 10 : rule.metric === 'pendingErrors' ? m.pendingErrors : rule.metric === 'connectorDown' ? m.downConnectors.length : Math.round(m.avgDurationMs / 100) / 10;
    const msg = buildMessages(rule, value, m, new Date());
    const id = `nt-test-${Date.now()}`;
    addNotification({ id, at: new Date().toISOString(), ruleId: rule.id, title: `[Teste] ${msg.title}`, message: msg.message, severity: 'info', read: false, emailText: msg.email, whatsappText: msg.whatsapp });
    setSelected(id);
    toast({ kind: 'info', title: 'Notificação de teste gerada', message: 'Veja o texto do e-mail e do WhatsApp ao lado.' });
  };

  const text = sel ? (channel === 'email' ? sel.emailText : sel.whatsappText) : '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alertas e notificações</h1>
          <p>Regras que vigiam as integrações e avisam a equipe certa pelo canal certo.</p>
        </div>
        {admin && (
          <button className="btn btn-primary" onClick={() => setEditing({ id: `al-${Date.now()}`, name: '', metric: 'errorRate', threshold: 10, windowMin: 15, channels: ['email'], recipients: '', enabled: true, lastFiredAt: null })}>
            <Plus size={16} aria-hidden /> Nova regra
          </button>
        )}
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Taxa de erro (15 min)</span><span className="kpi-value tabnum">{fmtPct(m15.errorRate)}</span><span className="kpi-foot">{m15.errors} de {m15.finished} itens</span></div>
        <div className="card kpi"><span className="kpi-label">Erros pendentes</span><span className="kpi-value tabnum">{m15.pendingErrors}</span><span className="kpi-foot">Na fila aguardando ação</span></div>
        <div className="card kpi"><span className="kpi-label">Tempo médio (15 min)</span><span className="kpi-value tabnum">{fmtDuration(m15.avgDurationMs)}</span><span className="kpi-foot">Itens concluídos</span></div>
        <div className="card kpi"><span className="kpi-label">Conectores com falha</span><span className="kpi-value tabnum">{m15.downConnectors.length}</span><span className="kpi-foot">{m15.downConnectors.join(', ') || 'Todos respondendo'}</span></div>
        <div className="card kpi"><span className="kpi-label">Notificações não lidas</span><span className="kpi-value tabnum">{notifications.filter((n) => !n.read).length}</span><span className="kpi-foot">{notifications.length} no total</span></div>
      </div>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="rules-h">
          <div className="card-head">
            <div>
              <h2 id="rules-h">Regras de alerta</h2>
              <p>Avaliadas a cada 5 segundos</p>
            </div>
            {!admin && <span className="badge b-muted"><Lock size={12} aria-hidden /> Edição só para administrador</span>}
          </div>
          <div className="health-list">
            {rules.map((r) => (
              <div key={r.id} className="health-item" style={{ gridTemplateColumns: '1fr auto' }}>
                <div className="stack" style={{ gap: 4 }}>
                  <span className="strong">{r.name}</span>
                  <span className="small">{ruleDescription(r)}</span>
                  <span className="row wrap small muted" style={{ gap: 6 }}>
                    {r.channels.map((c) => {
                      const ch = CHANNELS.find((x) => x.id === c)!;
                      return <span key={c} className="badge b-muted">{ch.icon} {ch.label}</span>;
                    })}
                    <span>· último disparo: {fmtRelative(r.lastFiredAt)}</span>
                  </span>
                </div>
                <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
                  <Switch checked={r.enabled} onChange={(v) => save({ ...r, enabled: v })} label={r.enabled ? 'Ativa' : 'Inativa'} disabled={!admin} />
                  <div className="row" style={{ gap: 2 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => test(r)} title="Gera uma notificação de exemplo com os números atuais"><Send size={14} aria-hidden /> Testar</button>
                    {admin && (
                      <>
                        <button className="btn btn-sm btn-ghost btn-icon" aria-label={`Editar ${r.name}`} onClick={() => setEditing(r)}><Pencil size={14} /></button>
                        <button className="btn btn-sm btn-ghost btn-icon" aria-label={`Excluir ${r.name}`} onClick={() => del(r.id)}><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {rules.length === 0 && <EmptyState icon={<BellRing size={26} />} title="Nenhuma regra">Crie uma regra para ser avisado quando algo sair do normal.</EmptyState>}
          </div>
        </section>

        <section className="card" aria-labelledby="notif-h">
          <div className="card-head">
            <div>
              <h2 id="notif-h">Notificações</h2>
              <p>Dentro do app, com o texto pronto do e-mail e do WhatsApp</p>
            </div>
          </div>
          {notifications.length === 0 ? (
            <EmptyState icon={<BellRing size={26} />} title="Nenhuma notificação ainda">Ligue a demonstração ao vivo: quando a taxa de erro subir, o alerta dispara sozinho.</EmptyState>
          ) : (
            <div>
              <div style={{ maxHeight: 220, overflowY: 'auto', borderBottom: '1px solid var(--border)' }}>
                {notifications.map((n) => (
                  <button key={n.id} className="menu-item" style={{ borderRadius: 0, padding: '10px 16px', background: n.id === selected ? 'var(--primary-soft)' : undefined, alignItems: 'flex-start' }} onClick={() => setSelected(n.id)} aria-pressed={n.id === selected}>
                    <span className={`dot ${n.severity === 'critical' ? 'dot-err' : n.severity === 'warning' ? 'dot-warn' : 'dot-muted'}`} style={{ marginTop: 6 }} aria-hidden />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: n.read ? 500 : 650 }}>{n.title}</span>
                      <span className="small muted">{fmtDateTime(n.at)}</span>
                    </span>
                  </button>
                ))}
              </div>
              {sel && (
                <div className="card-body stack" style={{ gap: 10 }}>
                  <p className="small">{sel.message}</p>
                  <div className="row between wrap">
                    <div className="seg" role="group" aria-label="Canal">
                      <button aria-pressed={channel === 'whatsapp'} disabled={!sel.whatsappText} onClick={() => setChannel('whatsapp')}><MessageCircle size={13} aria-hidden /> WhatsApp</button>
                      <button aria-pressed={channel === 'email'} disabled={!sel.emailText} onClick={() => setChannel('email')}><Mail size={13} aria-hidden /> E-mail</button>
                    </div>
                    {text && (
                      <button className="btn btn-sm btn-ghost" onClick={() => { void navigator.clipboard?.writeText(text); toast({ kind: 'info', title: 'Texto copiado' }); }}>
                        <Copy size={14} aria-hidden /> Copiar texto
                      </button>
                    )}
                  </div>
                  {!text ? (
                    <p className="small muted">Este canal não estava ativo na regra quando o alerta disparou.</p>
                  ) : channel === 'whatsapp' ? (
                    <WhatsappPreview text={text} />
                  ) : (
                    <pre className="json" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font)', fontSize: 13 }}>{text}</pre>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      {editing && <RuleForm rule={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
