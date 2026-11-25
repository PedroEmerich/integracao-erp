// Motor de execução: fila, pipeline, retentativas com backoff, saúde dos conectores,
// alertas e simulador ao vivo. Roda no navegador com timers.
import { confirmationMessage, ConnectorError, fetchFromSource, pingIntegration, sendToTarget, targetName, type Connectors } from '../connectors';
import { createSimulatedConnectors } from '../connectors/simulated';
import { buildMessages, computeMetrics, evaluateRule, inCooldown } from '../domain/alerts';
import { backoffDelay, makeError, shouldRetry } from '../domain/errors';
import { prepareJob } from '../domain/pipeline';
import type { IntegrationId, Job } from '../domain/types';
import { INTEGRATION_ORDER } from '../data/seed';
import { useHub } from './useHub';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

export const connectors: Connectors = createSimulatedConnectors({
  getCatalog: () => useHub.getState().catalog,
  reserveStock: (items) =>
    useHub.setState((s) => {
      const catalog = { ...s.catalog };
      items.forEach(({ code, qty }) => {
        if (catalog[code]) catalog[code] = { ...catalog[code], stock: Math.max(0, catalog[code].stock - qty) };
      });
      return { catalog };
    }),
  getTitles: () => useHub.getState().titles,
  settleTitle: (id, at) => useHub.setState((s) => ({ titles: s.titles.map((t) => (t.id === id ? { ...t, status: 'baixado', paidAt: at } : t)) })),
  getCustomers: () => useHub.getState().customers,
  nextErpNumber: () => {
    const n = useHub.getState().counters.erp + 1;
    useHub.setState((s) => ({ counters: { ...s.counters, erp: n } }));
    return String(n).padStart(6, '0');
  },
  nextStoreOrderNumber: () => {
    const n = useHub.getState().counters.store + 1;
    useHub.setState((s) => ({ counters: { ...s.counters, store: n } }));
    return n;
  },
  nextSheetOrderNumber: () => {
    const n = useHub.getState().counters.sheet + 1;
    useHub.setState((s) => ({ counters: { ...s.counters, sheet: n } }));
    return `REP-${n}`;
  },
  faultRate: () => (useHub.getState().liveMode ? 0.16 : 0.08),
  instability: () => (useHub.getState().liveMode ? 0.07 : 0.03),
  health: (id) => useHub.getState().integrations.find((i) => i.id === id)?.health ?? 'online',
});

const running = new Set<string>();
const MAX_CONCURRENCY = 3;

async function processJob(jobId: string): Promise<void> {
  const st = useHub.getState;
  const job = st().jobs.find((j) => j.id === jobId);
  if (!job) return;
  const { patchJob, pushEvent } = st();
  const id = job.integrationId;
  const attempt = job.attempts + 1;
  const startedAt = Date.now();
  patchJob(jobId, { status: 'processing', attempts: attempt, startedAt: new Date(startedAt).toISOString(), nextRetryAt: null });

  if (attempt === 1 && !job.timeline.some((e) => e.stage === 'received')) {
    pushEvent(jobId, { stage: 'received', status: 'ok', message: `Recebido de ${job.source === 'planilha' ? 'planilha importada' : id === 'erp-store-stock' ? 'ERP' : id === 'bank-recon' ? 'extrato bancário' : id === 'carrier-tracking' ? 'transportadora' : id === 'sheet-erp' ? 'planilha' : 'loja virtual'}.` });
  }

  const fail = (err: NonNullable<Job['error']>, stage: Job['timeline'][number]['stage'], output?: unknown) => {
    const dur = Date.now() - startedAt;
    const cur = st().jobs.find((j) => j.id === jobId)!;
    pushEvent(jobId, { stage, status: 'error', message: err.message, durationMs: dur, attempt });
    if (shouldRetry(err, attempt, cur.maxAttempts)) {
      const wait = backoffDelay(attempt);
      pushEvent(jobId, { stage: 'retry', status: 'warn', message: `Nova tentativa automática (${attempt + 1} de ${cur.maxAttempts}) em ${wait / 1000} s — backoff exponencial.`, attempt });
      patchJob(jobId, { status: 'queued', error: err, nextRetryAt: new Date(Date.now() + wait).toISOString(), durationMs: dur, output: output ?? cur.output });
      return;
    }
    if (err.transient) pushEvent(jobId, { stage: 'error', status: 'error', message: `Tentativas automáticas esgotadas (${attempt}). Aguardando ação manual.` });
    patchJob(jobId, { status: 'error', error: err, wasError: true, durationMs: dur, output: output ?? cur.output });
    st().recordStat(id, false, dur);
  };

  // 1-2. Validação e transformação (de/para)
  await sleep(rand(250, 550));
  const fresh = st();
  const prep = prepareJob(id, job.input, { profile: fresh.profiles[id], tables: fresh.tables, catalog: fresh.catalog });
  if (!prep.ok && prep.stage === 'validated') return fail(prep.error, 'validated');
  pushEvent(jobId, { stage: 'validated', status: 'ok', message: 'Estrutura e documentos validados.', durationMs: Date.now() - startedAt, attempt });
  await sleep(rand(200, 450));
  if (!prep.ok) return fail(prep.error, 'transformed', prep.output);
  pushEvent(jobId, { stage: 'transformed', status: 'ok', message: `${fresh.profiles[id].rules.length} regras de mapeamento aplicadas.`, attempt });
  patchJob(jobId, { output: prep.output });

  // 3-4. Envio e confirmação
  const t0 = Date.now();
  try {
    const response = await sendToTarget(connectors, id, prep.output);
    pushEvent(jobId, { stage: 'sent', status: 'ok', message: `Enviado ${targetName(id) === 'ERP' ? 'ao ERP' : 'à loja virtual'}.`, durationMs: Date.now() - t0, attempt });
    await sleep(rand(120, 300));
    pushEvent(jobId, { stage: 'confirmed', status: 'ok', message: confirmationMessage(id, response) });
    const cur = st().jobs.find((j) => j.id === jobId)!;
    const dur = Date.now() - startedAt;
    patchJob(jobId, { status: cur.wasError ? 'reprocessed' : 'done', error: null, response, durationMs: dur });
    st().recordStat(id, true, dur);
  } catch (e) {
    const err = e instanceof ConnectorError ? e.info : makeError('ERP_TIMEOUT', (e as Error).message || 'Falha inesperada no envio.');
    // Chamada que falhou também conta no tempo do item.
    fail(err, 'sent');
  }
}

function schedulerTick() {
  const s = useHub.getState();
  if (!s.user) return;
  const now = Date.now();
  const enabled = new Set(s.integrations.filter((i) => i.enabled).map((i) => i.id));
  const ready = s.jobs
    .filter((j) => j.status === 'queued' && !running.has(j.id) && enabled.has(j.integrationId) && (!j.nextRetryAt || new Date(j.nextRetryAt).getTime() <= now))
    .reverse(); // mais antigos primeiro
  for (const j of ready) {
    if (running.size >= MAX_CONCURRENCY) break;
    running.add(j.id);
    processJob(j.id)
      .catch(() => useHub.getState().patchJob(j.id, { status: 'error' }))
      .finally(() => running.delete(j.id));
  }
  // Atualiza progresso de "Sincronizar agora".
  for (const [iid, batch] of Object.entries(s.syncBatches)) {
    if (!batch || batch.fetching) continue;
    const pending = s.jobs.filter((j) => batch.ids.includes(j.id) && (j.status === 'queued' || j.status === 'processing')).length;
    if (pending === 0 && Date.now() - new Date(batch.startedAt).getTime() > 800) {
      const jobs = s.jobs.filter((j) => batch.ids.includes(j.id));
      const errors = jobs.filter((j) => j.status === 'error').length;
      s.setSyncBatch(iid as IntegrationId, undefined);
      s.toast({
        kind: errors ? 'info' : 'success',
        title: 'Sincronização concluída',
        message: `${jobs.length - errors} de ${jobs.length} itens enviados${errors ? `, ${errors} com erro para tratar` : ''}.`,
      });
    }
  }
}

async function healthTick() {
  const s = useHub.getState();
  for (const it of s.integrations) {
    if (!it.enabled) continue;
    try {
      const r = await pingIntegration(connectors, it.id);
      const prev = useHub.getState().integrations.find((i) => i.id === it.id);
      if (!prev?.enabled) continue;
      // Transportadora segue lenta na maior parte do tempo (realismo).
      const status = it.id === 'carrier-tracking' && r.status === 'online' && Math.random() < 0.5 ? 'slow' : r.status;
      useHub.getState().patchIntegration(it.id, { health: status, latencyMs: status === 'slow' && r.latencyMs < 1500 ? r.latencyMs * 6 : r.latencyMs, lastPing: new Date().toISOString() });
      if (status === 'down' && prev.health !== 'down') {
        useHub.getState().log('Conector sem resposta', it.name, 'Ping falhou; itens serão retentados automaticamente.', true);
      }
    } catch {
      useHub.getState().patchIntegration(it.id, { health: 'down', lastPing: new Date().toISOString() });
    }
  }
}

function alertsTick() {
  const s = useHub.getState();
  if (!s.user) return;
  const now = new Date();
  for (const rule of s.alertRules) {
    if (!rule.enabled || inCooldown(rule, now)) continue;
    const m = computeMetrics(s.jobs, s.integrations, now, rule.windowMin);
    const value = evaluateRule(rule, m);
    if (value === null) continue;
    const msg = buildMessages(rule, value, m, now);
    const at = now.toISOString();
    useHub.setState((st) => ({ alertRules: st.alertRules.map((r) => (r.id === rule.id ? { ...r, lastFiredAt: at } : r)) }));
    s.addNotification({
      id: `nt-${now.getTime()}-${rule.id}`,
      at,
      ruleId: rule.id,
      title: msg.title,
      message: msg.message,
      severity: rule.metric === 'avgDuration' || rule.metric === 'pendingErrors' ? 'warning' : 'critical',
      read: false,
      emailText: rule.channels.includes('email') ? msg.email : '',
      whatsappText: rule.channels.includes('whatsapp') ? msg.whatsapp : '',
    });
    s.log('Disparou alerta', `Regra "${rule.name}"`, `${msg.title}. Canais: ${rule.channels.join(', ')}.`, true);
    s.toast({ kind: 'error', title: `Alerta: ${rule.name}`, message: msg.message });
  }
}

const LIVE_WEIGHTS: [IntegrationId, number][] = [
  ['store-erp-orders', 0.58],
  ['erp-store-stock', 0.16],
  ['carrier-tracking', 0.13],
  ['bank-recon', 0.08],
  ['sheet-erp', 0.05],
];

async function liveTick() {
  const s = useHub.getState();
  if (!s.liveMode || !s.user) return;
  const enabled = new Set(s.integrations.filter((i) => i.enabled).map((i) => i.id));
  let r = Math.random();
  let pick: IntegrationId = 'store-erp-orders';
  for (const [id, w] of LIVE_WEIGHTS) {
    if ((r -= w) <= 0) {
      pick = id;
      break;
    }
  }
  if (!enabled.has(pick)) return;
  const n = pick === 'store-erp-orders' ? rand(1, 2) : 1;
  const inputs = await fetchFromSource(connectors, pick, n);
  useHub.getState().enqueue(pick, inputs, 'ao-vivo');
  useHub.getState().patchIntegration(pick, { lastSync: new Date().toISOString() });
}

/** "Sincronizar agora": busca na origem e processa com progresso visível. */
export async function syncNow(id: IntegrationId): Promise<void> {
  const s = useHub.getState();
  const it = s.integrations.find((i) => i.id === id)!;
  if (!it.enabled) {
    s.toast({ kind: 'error', title: 'Integração desligada', message: 'Ligue a integração para sincronizar.' });
    return;
  }
  if (s.syncBatches[id]) return;
  s.setSyncBatch(id, { ids: [], total: 0, startedAt: new Date().toISOString(), fetching: true });
  try {
    const n = id === 'store-erp-orders' ? rand(6, 10) : id === 'erp-store-stock' ? rand(8, 12) : rand(4, 7);
    const inputs = await fetchFromSource(connectors, id, n);
    if (!inputs.length) {
      useHub.getState().setSyncBatch(id, undefined);
      useHub.getState().toast({ kind: 'info', title: 'Nada novo na origem', message: 'Nenhum registro pendente para sincronizar.' });
      return;
    }
    const ids = useHub.getState().enqueue(id, inputs, 'manual');
    useHub.getState().setSyncBatch(id, { ids, total: ids.length, startedAt: new Date().toISOString(), fetching: false });
    useHub.getState().patchIntegration(id, { lastSync: new Date().toISOString() });
    useHub.getState().log('Sincronizou agora', it.name, `${ids.length} registros buscados na origem.`);
  } catch {
    useHub.getState().setSyncBatch(id, undefined);
    useHub.getState().toast({ kind: 'error', title: 'Falha ao buscar na origem', message: 'Tente novamente em instantes.' });
  }
}

let started = false;
export function startEngine(): () => void {
  if (started) return () => undefined;
  started = true;
  const timers = [
    setInterval(schedulerTick, 500),
    setInterval(() => void healthTick(), 12000),
    setInterval(alertsTick, 5000),
    setInterval(() => void liveTick(), 2600),
  ];
  setTimeout(() => void healthTick(), 1500);
  return () => {
    timers.forEach(clearInterval);
    started = false;
  };
}

export { INTEGRATION_ORDER };
