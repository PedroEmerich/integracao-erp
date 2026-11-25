import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock, Copy, EyeOff, FileJson, Inbox, Info, Pencil, RotateCcw, Send, ShieldCheck, Shuffle, Wrench, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { INTEGRATION_SHORT } from '../data/seed';
import { formatCnpj, isValidDocument } from '../domain/documents';
import { fmtBRL, fmtDateTime, fmtDuration, fmtTime } from '../domain/format';
import { getPath, setPath } from '../domain/mapping';
import type { Job, Stage, TimelineEvent } from '../domain/types';
import { useHub } from '../store/useHub';
import { Drawer, JsonView, Modal, StatusBadge } from './ui';

const STEPS: { stage: Stage; label: string; icon: ReactNode }[] = [
  { stage: 'received', label: 'Recebido', icon: <Inbox size={14} /> },
  { stage: 'validated', label: 'Validado', icon: <ShieldCheck size={14} /> },
  { stage: 'transformed', label: 'Transformado', icon: <Shuffle size={14} /> },
  { stage: 'sent', label: 'Enviado', icon: <Send size={14} /> },
  { stage: 'confirmed', label: 'Confirmado', icon: <CheckCircle2 size={14} /> },
];

const STAGE_LABEL: Record<Stage, string> = {
  received: 'Recebido',
  validated: 'Validação',
  transformed: 'Transformação (de/para)',
  sent: 'Envio ao destino',
  confirmed: 'Confirmado',
  error: 'Falha',
  retry: 'Retentativa agendada',
  reprocess: 'Reprocessamento',
  corrected: 'Dado corrigido',
  ignored: 'Ignorado',
};

function stepState(job: Job): Record<string, 'done' | 'failed' | 'current' | 'todo'> {
  // Considera os eventos da última execução (após o último reprocessamento/correção).
  const tl = job.timeline;
  let start = 0;
  tl.forEach((e, i) => (e.stage === 'reprocess' || e.stage === 'corrected') && (start = i));
  const last = tl.slice(start);
  const res: Record<string, 'done' | 'failed' | 'current' | 'todo'> = {};
  STEPS.forEach((s) => {
    const evs = last.filter((e) => e.stage === s.stage);
    const fromStart = tl.filter((e) => e.stage === s.stage);
    const ev = evs[evs.length - 1] ?? (s.stage === 'received' ? fromStart[0] : undefined);
    res[s.stage] = !ev ? 'todo' : ev.status === 'error' ? 'failed' : 'done';
  });
  if (job.status === 'processing') {
    const next = STEPS.find((s) => res[s.stage] === 'todo');
    if (next) res[next.stage] = 'current';
  }
  if (job.status === 'queued' && job.nextRetryAt && res.sent === 'failed') res.sent = 'failed';
  return res;
}

function TimelineIcon({ ev }: { ev: TimelineEvent }) {
  const cls = ev.status === 'ok' ? 'tl-ok' : ev.status === 'error' ? 'tl-error' : ev.status === 'warn' ? 'tl-warn' : 'tl-info';
  const icon =
    ev.status === 'error' ? <X size={13} /> : ev.stage === 'retry' ? <Clock size={13} /> : ev.stage === 'reprocess' ? <RotateCcw size={13} /> : ev.stage === 'corrected' ? <Pencil size={12} /> : ev.stage === 'ignored' ? <EyeOff size={12} /> : <Check size={13} />;
  return <span className={`tl-icon ${cls}`} aria-hidden>{icon}</span>;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Formulário de correção, específico para cada tipo de erro. */
function CorrectionPanel({ job, onDone }: { job: Job; onDone: () => void }) {
  const catalog = useHub((s) => s.catalog);
  const tables = useHub((s) => s.tables);
  const jobs = useHub((s) => s.jobs);
  const correct = useHub((s) => s.correctAndReprocess);
  const reprocess = useHub((s) => s.reprocess);
  const setLookup = useHub((s) => s.setLookupEntry);
  const toast = useHub((s) => s.toast);
  const err = job.error!;
  const input = job.input as Record<string, unknown>;
  const isSheet = job.integrationId === 'sheet-erp';
  const itemsKey = isSheet ? 'itens' : 'items';
  const skuKey = 'sku';
  const qtyKey = isSheet ? 'quantidade' : 'quantity';

  const [doc, setDoc] = useState(String(getPath(input, err.field ?? '') ?? err.value ?? ''));
  const [erpCode, setErpCode] = useState('');
  const [swapSku, setSwapSku] = useState('');
  const [mode, setMode] = useState<'map' | 'swap'>('map');
  const [alsoOthers, setAlsoOthers] = useState(true);
  const [json, setJson] = useState(JSON.stringify(input, null, 2));
  const [jsonErr, setJsonErr] = useState('');
  const [advanced, setAdvanced] = useState(false);

  const items = (getPath(input, itemsKey) as Record<string, unknown>[] | undefined) ?? [];
  const stockItemIdx = useMemo(() => {
    if (err.code !== 'ESTOQUE_INSUFICIENTE') return -1;
    const code = err.value ?? '';
    return items.findIndex((it) => tables['sku-erp'].entries[String(it[skuKey]).toUpperCase()] === code);
  }, [err, items, tables]);
  const stockProduct = stockItemIdx >= 0 ? catalog[err.value ?? ''] : undefined;
  const [qty, setQty] = useState(stockProduct ? String(stockProduct.stock) : '');

  const sameSku = err.code === 'PRODUTO_SEM_CADASTRO' ? jobs.filter((j) => j.id !== job.id && j.status === 'error' && j.error?.code === 'PRODUTO_SEM_CADASTRO' && j.error.value === err.value) : [];
  const skuOptions = Object.keys(tables['sku-erp'].entries).sort();

  const submitDoc = () => {
    const next = clone(input);
    const formatted = doc.replace(/\D/g, '').length === 14 ? formatCnpj(doc) : doc;
    setPath(next, err.field ?? (isSheet ? 'cnpj_cliente' : 'customer.document'), formatted);
    correct(job.id, next, `${err.field === 'codigo_rastreio' ? 'Código de rastreio' : 'Documento'} alterado de "${err.value ?? ''}" para "${formatted}".`);
    toast({ kind: 'success', title: 'Correção enviada', message: `${job.reference} voltou para a fila.` });
    onDone();
  };

  if (advanced) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <label className="label" htmlFor="json-edit">Payload de entrada (JSON) — edite e reprocesse</label>
        <textarea id="json-edit" className="textarea mono" rows={14} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        {jsonErr && <p className="small" role="alert" style={{ color: 'var(--err)' }}>{jsonErr}</p>}
        <div className="row">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              try {
                const parsed = JSON.parse(json);
                correct(job.id, parsed, 'Payload de entrada editado manualmente.');
                toast({ kind: 'success', title: 'Correção enviada', message: `${job.reference} voltou para a fila.` });
                onDone();
              } catch (e) {
                setJsonErr(`JSON inválido: ${(e as Error).message}`);
              }
            }}
          >
            <RotateCcw size={14} aria-hidden /> Salvar e reprocessar
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setAdvanced(false)}>Voltar ao formulário guiado</button>
        </div>
      </div>
    );
  }

  let body: ReactNode = null;
  if (err.code === 'CNPJ_INVALIDO' || err.code === 'RASTREIO_INVALIDO' || (err.code === 'CAMPO_OBRIGATORIO' && err.field && !err.field.includes('[]') && getPath(input, err.field) !== undefined)) {
    const isDoc = err.code === 'CNPJ_INVALIDO';
    const valid = isDoc ? isValidDocument(doc) : doc.trim().length > 0;
    body = (
      <div className="stack" style={{ gap: 10 }}>
        <div className="field">
          <label htmlFor="fix-field">{isDoc ? 'CNPJ/CPF correto do cliente' : `Valor correto para "${err.field}"`}</label>
          <input id="fix-field" className={`input ${!valid ? 'input-error' : ''}`} value={doc} onChange={(e) => setDoc(e.target.value)} aria-invalid={!valid} aria-describedby="fix-hint" />
          <span id="fix-hint" className="hint" style={{ color: valid ? 'var(--ok)' : 'var(--err)' }}>
            {isDoc ? (valid ? '✓ Dígitos verificadores conferem' : '✗ Dígitos verificadores não conferem') : valid ? 'Pronto para reprocessar' : 'Informe um valor'}
          </span>
        </div>
        {isDoc && (
          <p className="small muted">
            Dica de demonstração: o CNPJ cadastrado deste cliente no ERP é{' '}
            <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', height: 'auto' }} onClick={() => setDoc(useHub.getState().customers.find((c) => c.name === (getPath(input, isSheet ? 'razao_social' : 'customer.name') as string))?.cnpj ?? doc)}>
              usar CNPJ do cadastro
            </button>
          </p>
        )}
        <div><button className="btn btn-primary btn-sm" disabled={!valid} onClick={submitDoc}><RotateCcw size={14} aria-hidden /> Corrigir e reprocessar</button></div>
      </div>
    );
  } else if (err.code === 'PRODUTO_SEM_CADASTRO') {
    body = (
      <div className="stack" style={{ gap: 10 }}>
        <div className="seg" role="group" aria-label="Forma de correção">
          <button aria-pressed={mode === 'map'} onClick={() => setMode('map')}>Vincular SKU a produto do ERP</button>
          <button aria-pressed={mode === 'swap'} onClick={() => setMode('swap')}>Trocar o SKU no pedido</button>
        </div>
        {mode === 'map' ? (
          <>
            <div className="field">
              <label htmlFor="erp-code">Produto do ERP equivalente a <code>{err.value}</code></label>
              <select id="erp-code" className="select" value={erpCode} onChange={(e) => setErpCode(e.target.value)}>
                <option value="">Selecione…</option>
                {Object.values(catalog).map((p) => (
                  <option key={p.code} value={p.code}>{p.code} — {p.description}</option>
                ))}
              </select>
              <span className="hint">A equivalência é gravada na tabela "SKU da loja → Código do ERP" e vale para os próximos pedidos.</span>
            </div>
            {sameSku.length > 0 && (
              <label className="row small">
                <input type="checkbox" checked={alsoOthers} onChange={(e) => setAlsoOthers(e.target.checked)} /> Reprocessar também os outros {sameSku.length} itens com o mesmo SKU
              </label>
            )}
            <div>
              <button
                className="btn btn-primary btn-sm"
                disabled={!erpCode}
                onClick={() => {
                  setLookup('sku-erp', String(err.value), erpCode);
                  reprocess([job.id, ...(alsoOthers ? sameSku.map((j) => j.id) : [])]);
                  toast({ kind: 'success', title: 'Equivalência criada', message: `${err.value} → ${erpCode}. ${alsoOthers && sameSku.length ? sameSku.length + 1 : 1} item(ns) reprocessando.` });
                  onDone();
                }}
              >
                <RotateCcw size={14} aria-hidden /> Salvar equivalência e reprocessar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="swap-sku">Substituir <code>{err.value}</code> por</label>
              <select id="swap-sku" className="select" value={swapSku} onChange={(e) => setSwapSku(e.target.value)}>
                <option value="">Selecione um SKU cadastrado…</option>
                {skuOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <button
                className="btn btn-primary btn-sm"
                disabled={!swapSku}
                onClick={() => {
                  const next = clone(input);
                  const list = getPath(next, itemsKey) as Record<string, unknown>[];
                  list.forEach((it) => String(it[skuKey]).toUpperCase() === String(err.value).toUpperCase() && (it[skuKey] = swapSku));
                  correct(job.id, next, `SKU "${err.value}" trocado por "${swapSku}".`);
                  toast({ kind: 'success', title: 'Correção enviada', message: `${job.reference} voltou para a fila.` });
                  onDone();
                }}
              >
                <RotateCcw size={14} aria-hidden /> Corrigir e reprocessar
              </button>
            </div>
          </>
        )}
      </div>
    );
  } else if (err.code === 'ESTOQUE_INSUFICIENTE' && stockProduct) {
    const n = Number(qty);
    const ok = Number.isInteger(n) && n > 0 && n <= stockProduct.stock;
    body = (
      <div className="stack" style={{ gap: 10 }}>
        <p className="small">
          <strong>{stockProduct.description}</strong>: saldo atual no ERP <strong>{stockProduct.stock} {stockProduct.unit}</strong>, pedido de <strong>{String(items[stockItemIdx][qtyKey])}</strong>.
        </p>
        <div className="field" style={{ maxWidth: 240 }}>
          <label htmlFor="fix-qty">Nova quantidade (faturamento parcial)</label>
          <input id="fix-qty" type="number" min={1} max={stockProduct.stock} className={`input ${!ok ? 'input-error' : ''}`} value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={!ok} />
        </div>
        <div>
          <button
            className="btn btn-primary btn-sm"
            disabled={!ok}
            onClick={() => {
              const next = clone(input);
              const list = getPath(next, itemsKey) as Record<string, unknown>[];
              const before = list[stockItemIdx][qtyKey];
              list[stockItemIdx][qtyKey] = n;
              correct(job.id, next, `Quantidade do item ${String(list[stockItemIdx][skuKey])} ajustada de ${before} para ${n} (saldo disponível).`);
              toast({ kind: 'success', title: 'Correção enviada', message: `${job.reference} voltou para a fila.` });
              onDone();
            }}
          >
            <RotateCcw size={14} aria-hidden /> Ajustar e reprocessar
          </button>
        </div>
      </div>
    );
  } else if (err.code === 'TITULO_JA_BAIXADO' || err.code === 'TITULO_NAO_ENCONTRADO') {
    body = (
      <p className="small">
        Este recebimento não deve ser baixado de novo. Confirme com o financeiro e use <strong>Ignorar com justificativa</strong>, ou vincule manualmente na{' '}
        <Link to="/conciliacao">Conciliação bancária</Link>.
      </p>
    );
  } else if (err.transient) {
    body = <p className="small">Instabilidade no sistema de destino. Os dados estão corretos: basta reprocessar quando o conector estiver online.</p>;
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {body}
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAdvanced(true)}>
        <FileJson size={14} aria-hidden /> Editar payload completo (JSON)
      </button>
    </div>
  );
}

export function IgnoreDialog({ count, onConfirm, onClose }: { count: number; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const presets = ['Pagamento em duplicidade confirmado com o cliente', 'Pedido cancelado pelo cliente', 'Lançado manualmente no ERP', 'Registro de teste'];
  return (
    <Modal
      title={count > 1 ? `Ignorar ${count} itens` : 'Ignorar item'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={reason.trim().length < 5} onClick={() => onConfirm(reason.trim())}>
            <EyeOff size={15} aria-hidden /> Ignorar
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <p className="small muted">O item sai da lista de erros e não será enviado. A justificativa fica registrada no histórico e na auditoria.</p>
        <div className="field">
          <label htmlFor="ignore-reason">Justificativa (obrigatória)</label>
          <textarea id="ignore-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: pedido cancelado pelo cliente por telefone" />
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {presets.map((p) => (
            <button key={p} className="btn btn-sm" type="button" onClick={() => setReason(p)}>{p}</button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function JobDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const job = useHub((s) => s.jobs.find((j) => j.id === jobId));
  const reprocess = useHub((s) => s.reprocess);
  const ignore = useHub((s) => s.ignore);
  const toast = useHub((s) => s.toast);
  const [tab, setTab] = useState<'in' | 'out' | 'resp'>('in');
  const [fixing, setFixing] = useState(false);
  const [ignoring, setIgnoring] = useState(false);

  if (!job) {
    return (
      <Drawer onClose={onClose} label="Item não encontrado">
        <div className="drawer-body">
          <p>Item não encontrado (pode ter saído do histórico).</p>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </Drawer>
    );
  }
  const steps = stepState(job);
  const canAct = job.status === 'error';
  const copy = (v: unknown) => {
    void navigator.clipboard?.writeText(JSON.stringify(v, null, 2));
    toast({ kind: 'info', title: 'JSON copiado' });
  };

  return (
    <Drawer onClose={onClose} label={`Detalhes do item ${job.reference}`}>
      <div className="drawer-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 18 }}>{job.kind === 'pedido' ? 'Pedido' : job.kind === 'produto' ? 'Produto' : job.kind === 'titulo' ? 'Recebimento' : 'Rastreio'} {job.reference}</h2>
            <StatusBadge status={job.status} retrying={!!job.nextRetryAt} />
          </div>
          <p className="small muted" style={{ marginTop: 2 }}>
            {INTEGRATION_SHORT[job.integrationId]} · {job.description} · <span className="mono">{job.id}</span>
          </p>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar detalhes">
          <X size={20} />
        </button>
      </div>
      <div className="drawer-body stack">
        <ol className="steps" aria-label="Etapas do processamento" style={{ listStyle: 'none', padding: 0 }}>
          {STEPS.map((s) => (
            <li key={s.stage} className={`step ${steps[s.stage]}`} aria-label={`${s.label}: ${steps[s.stage] === 'done' ? 'concluído' : steps[s.stage] === 'failed' ? 'falhou' : steps[s.stage] === 'current' ? 'em andamento' : 'pendente'}`}>
              <div className="circle" aria-hidden>{steps[s.stage] === 'failed' ? <X size={14} /> : steps[s.stage] === 'done' ? <Check size={14} /> : s.icon}</div>
              {s.label}
            </li>
          ))}
        </ol>

        {job.error && (job.status === 'error' || job.status === 'queued') && (
          <div className="callout callout-err" role="alert">
            <AlertTriangle size={20} color="var(--err)" aria-hidden style={{ flex: 'none' }} />
            <div className="stack" style={{ gap: 4 }}>
              <span className="callout-title">{job.error.title}</span>
              <span>{job.error.message}</span>
              <span className="small" style={{ color: 'var(--text-2)' }}><Info size={13} aria-hidden style={{ verticalAlign: -2 }} /> {job.error.hint}</span>
            </div>
          </div>
        )}
        {job.status === 'ignored' && (
          <div className="callout callout-info">
            <EyeOff size={18} aria-hidden />
            <div><span className="strong">Ignorado.</span> Justificativa: “{job.ignoredReason}”</div>
          </div>
        )}

        {canAct && (
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="card-body stack" style={{ gap: 12 }}>
              <div className="row wrap">
                {!job.error?.transient && (
                  <button className={`btn btn-sm ${fixing ? '' : 'btn-primary'}`} onClick={() => setFixing(!fixing)} aria-expanded={fixing}>
                    <Wrench size={14} aria-hidden /> Corrigir dado
                  </button>
                )}
                <button
                  className={`btn btn-sm ${job.error?.transient ? 'btn-primary' : ''}`}
                  onClick={() => {
                    reprocess([job.id]);
                    toast({ kind: 'success', title: 'Reprocessando', message: `${job.reference} voltou para a fila.` });
                  }}
                >
                  <RotateCcw size={14} aria-hidden /> Reprocessar
                </button>
                <button className="btn btn-sm" onClick={() => setIgnoring(true)}>
                  <EyeOff size={14} aria-hidden /> Ignorar com justificativa
                </button>
              </div>
              {(fixing || job.error?.transient) && <CorrectionPanel job={job} onDone={() => setFixing(false)} />}
            </div>
          </div>
        )}

        <dl className="kv">
          <dt>Recebido em</dt>
          <dd>{fmtDateTime(job.createdAt)}</dd>
          <dt>Última atualização</dt>
          <dd>{fmtDateTime(job.updatedAt)}</dd>
          <dt>Tentativas</dt>
          <dd>{job.attempts} de {job.maxAttempts}{job.nextRetryAt ? ` · próxima às ${fmtTime(job.nextRetryAt)}` : ''}</dd>
          <dt>Duração</dt>
          <dd>{fmtDuration(job.durationMs)}</dd>
          {job.amount !== undefined && (
            <>
              <dt>Valor</dt>
              <dd>{fmtBRL(job.amount)}</dd>
            </>
          )}
          <dt>Origem do disparo</dt>
          <dd>{{ agendado: 'Agendamento', manual: 'Sincronizar agora', 'ao-vivo': 'Simulador ao vivo', planilha: 'Importação de planilha', reprocessamento: 'Reprocessamento' }[job.source ?? 'agendado']}</dd>
        </dl>

        <section aria-labelledby="tl-h">
          <h3 id="tl-h" style={{ marginBottom: 12 }}>Linha do tempo</h3>
          {job.timeline.length === 0 ? (
            <p className="small muted">Aguardando processamento…</p>
          ) : (
            <ol className="timeline">
              {job.timeline.map((ev, i) => (
                <li key={i}>
                  <TimelineIcon ev={ev} />
                  <div className="tl-title">
                    {STAGE_LABEL[ev.stage]}
                    {ev.attempt ? <span className="badge b-muted">tentativa {ev.attempt}</span> : null}
                    <span className="tl-time tabnum">{fmtTime(ev.at)}{ev.durationMs ? ` · ${fmtDuration(ev.durationMs)}` : ''}</span>
                  </div>
                  <div className="small" style={{ color: ev.status === 'error' ? 'var(--err)' : 'var(--text-2)' }}>{ev.message}</div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="payload-h">
          <div className="row between">
            <h3 id="payload-h">Payloads</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(tab === 'in' ? job.input : tab === 'out' ? job.output : job.response)}>
              <Copy size={14} aria-hidden /> Copiar
            </button>
          </div>
          <div className="tabs" role="tablist" style={{ marginBottom: 10 }}>
            <button role="tab" aria-selected={tab === 'in'} onClick={() => setTab('in')}>Entrada (origem)</button>
            <button role="tab" aria-selected={tab === 'out'} onClick={() => setTab('out')}>
              Saída (para o {job.integrationId === 'erp-store-stock' || job.integrationId === 'carrier-tracking' ? 'loja' : 'ERP'}) <ArrowRight size={13} aria-hidden />
            </button>
            <button role="tab" aria-selected={tab === 'resp'} onClick={() => setTab('resp')}>Resposta do destino</button>
          </div>
          {tab === 'in' && <JsonView value={job.input} label="Payload de entrada" />}
          {tab === 'out' && (job.output ? <JsonView value={job.output} label="Payload de saída" /> : <p className="small muted">Ainda não transformado (falhou antes da etapa de transformação).</p>)}
          {tab === 'resp' &&
            (job.response ? (
              <JsonView value={job.response} label="Resposta do destino" />
            ) : job.error ? (
              <JsonView value={{ erro: job.error.code, mensagem: job.error.message, transitorio: job.error.transient }} label="Resposta de erro" />
            ) : (
              <p className="small muted">Sem resposta ainda.</p>
            ))}
        </section>
      </div>
      {ignoring && (
        <IgnoreDialog
          count={1}
          onClose={() => setIgnoring(false)}
          onConfirm={(r) => {
            ignore([job.id], r);
            setIgnoring(false);
            toast({ kind: 'success', title: 'Item ignorado', message: 'Justificativa registrada na auditoria.' });
          }}
        />
      )}
    </Drawer>
  );
}

