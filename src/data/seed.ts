// Gera o conjunto de dados de exemplo (determinístico no conteúdo, relativo à data atual).
import { backoffDelay, makeError, RETRY_POLICY } from '../domain/errors';
import { describeInput, prepareJob } from '../domain/pipeline';
import { makeCnpj, onlyDigits } from '../domain/documents';
import type {
  AlertRule,
  AppNotification,
  AuditEntry,
  BankTransaction,
  Customer,
  ErpProduct,
  ErpTitle,
  ErrorCode,
  HourlyStat,
  Integration,
  IntegrationId,
  Job,
  LookupTable,
  MappingProfile,
  TimelineEvent,
} from '../domain/types';
import { initialCatalog, initialCustomers, initialLookupTables, initialMappingProfiles } from './catalog';
import { makeBankReceipt, makeSheetOrder, makeStockUpdate, makeStoreOrder, makeTracking, Rng, round2 } from './generators';

export interface HubData {
  version: number;
  seededAt: string;
  integrations: Integration[];
  jobs: Job[];
  stats: HourlyStat[];
  profiles: Record<IntegrationId, MappingProfile>;
  tables: Record<string, LookupTable>;
  catalog: Record<string, ErpProduct>;
  customers: Customer[];
  titles: ErpTitle[];
  transactions: BankTransaction[];
  alertRules: AlertRule[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  counters: { erp: number; store: number; sheet: number; job: number; audit: number };
}

export const DATA_VERSION = 3;

export const INTEGRATION_ORDER: IntegrationId[] = ['store-erp-orders', 'erp-store-stock', 'sheet-erp', 'bank-recon', 'carrier-tracking'];

export const INTEGRATION_SHORT: Record<IntegrationId, string> = {
  'store-erp-orders': 'Pedidos Loja → ERP',
  'erp-store-stock': 'Estoque/preço ERP → Loja',
  'sheet-erp': 'Planilha → ERP',
  'bank-recon': 'Banco → ERP',
  'carrier-tracking': 'Rastreio → Loja',
};

function initialIntegrations(now: Date): Integration[] {
  const iso = now.toISOString();
  const erpCreds = [
    { key: 'erp_url', label: 'Endpoint REST do ERP', value: 'https://erp.nortex.demo:8443/rest', secret: false },
    { key: 'erp_user', label: 'Usuário de serviço', value: 'svc_integrahub', secret: false },
    { key: 'erp_pass', label: 'Senha', value: 'demo-Pw-8c41f2d9e7', secret: true },
  ];
  return [
    {
      id: 'store-erp-orders',
      name: 'Pedidos: Loja virtual → ERP',
      source: 'Loja virtual B2B',
      target: 'ERP Nortex',
      description: 'Cada pedido aprovado na loja vira pedido de venda no ERP, com cliente, itens, condição de pagamento e frete.',
      entity: 'pedido',
      enabled: true,
      frequency: { mode: 'realtime', intervalMin: 5, fixedTime: '08:00' },
      credentials: [
        { key: 'store_url', label: 'URL da API da loja', value: 'https://api.loja-nortex.demo/v2', secret: false },
        { key: 'store_key', label: 'App Key', value: 'demo_ak_4f9c1e7b20a3', secret: true },
        { key: 'store_token', label: 'App Token', value: 'demo_tk_93b0d6a1c5e84f27', secret: true },
        ...erpCreds,
      ],
      health: 'online',
      lastPing: iso,
      latencyMs: 182,
      lastSync: new Date(now.getTime() - 40000).toISOString(),
    },
    {
      id: 'erp-store-stock',
      name: 'Estoque e preço: ERP → Loja virtual',
      source: 'ERP Nortex',
      target: 'Loja virtual B2B',
      description: 'Publica na loja o saldo disponível e o preço da tabela de venda sempre que mudam no ERP.',
      entity: 'produto',
      enabled: true,
      frequency: { mode: 'interval', intervalMin: 15, fixedTime: '08:00' },
      credentials: [...erpCreds, { key: 'store_token', label: 'App Token da loja', value: 'demo_tk_93b0d6a1c5e84f27', secret: true }],
      health: 'online',
      lastPing: iso,
      latencyMs: 236,
      lastSync: new Date(now.getTime() - 6 * 60000).toISOString(),
    },
    {
      id: 'sheet-erp',
      name: 'Planilha de pedidos → ERP',
      source: 'Planilhas de representantes (CSV/XLSX)',
      target: 'ERP Nortex',
      description: 'Pedidos enviados por representantes em planilha são validados linha a linha e lançados no ERP.',
      entity: 'pedido',
      enabled: true,
      frequency: { mode: 'fixed', intervalMin: 30, fixedTime: '09:00' },
      credentials: [
        { key: 'sftp_host', label: 'Servidor SFTP', value: 'sftp.nortex.demo', secret: false },
        { key: 'sftp_user', label: 'Usuário SFTP', value: 'representantes', secret: false },
        { key: 'sftp_key', label: 'Chave privada', value: 'demo-ssh-ed25519-AAAAC3Nz-fake', secret: true },
      ],
      health: 'online',
      lastPing: iso,
      latencyMs: 74,
      lastSync: new Date(now.getTime() - 3 * 3600000).toISOString(),
    },
    {
      id: 'bank-recon',
      name: 'Recebimentos: Banco → ERP (conciliação)',
      source: 'Banco · conta 4471-2 (fictícia)',
      target: 'ERP Nortex · Contas a receber',
      description: 'Lê o extrato (boletos liquidados e Pix) e baixa os títulos correspondentes no contas a receber.',
      entity: 'titulo',
      enabled: true,
      frequency: { mode: 'interval', intervalMin: 60, fixedTime: '07:00' },
      credentials: [
        { key: 'bank_client', label: 'Client ID', value: 'demo-client-77a1e0', secret: false },
        { key: 'bank_secret', label: 'Client Secret', value: 'demo_cs_5e2c9a0f1b7d', secret: true },
        { key: 'bank_cert', label: 'Certificado (.pfx)', value: 'certificado-demo.pfx', secret: true },
      ],
      health: 'online',
      lastPing: iso,
      latencyMs: 310,
      lastSync: new Date(now.getTime() - 48 * 60000).toISOString(),
    },
    {
      id: 'carrier-tracking',
      name: 'Rastreio: Transportadora → Loja virtual',
      source: 'Jadlog, Correios e frota própria',
      target: 'Loja virtual B2B',
      description: 'Atualiza na loja o status de entrega e o código de rastreio de cada pedido faturado.',
      entity: 'rastreio',
      enabled: true,
      frequency: { mode: 'interval', intervalMin: 30, fixedTime: '08:00' },
      credentials: [
        { key: 'carrier_token', label: 'Token da API de rastreio', value: 'demo_trk_c0ffee1234', secret: true },
        { key: 'carrier_cnpj', label: 'CNPJ do embarcador', value: makeCnpj('41382907'), secret: false },
      ],
      health: 'slow',
      lastPing: iso,
      latencyMs: 2140,
      lastSync: new Date(now.getTime() - 22 * 60000).toISOString(),
    },
  ];
}

// ---------- Estatísticas por hora (7 dias) ----------
const PROFILE: Record<IntegrationId, { errRate: number; dur: number }> = {
  'store-erp-orders': { errRate: 0.035, dur: 1850 },
  'erp-store-stock': { errRate: 0.012, dur: 940 },
  'sheet-erp': { errRate: 0.06, dur: 2200 },
  'bank-recon': { errRate: 0.025, dur: 1350 },
  'carrier-tracking': { errRate: 0.02, dur: 1150 },
};

function volume(id: IntegrationId, d: Date, rng: Rng): number {
  const h = d.getHours();
  const wd = d.getDay();
  const wk = wd === 0 ? 0.15 : wd === 6 ? 0.4 : 1;
  const business = h >= 8 && h <= 18 ? 1 : h >= 6 && h <= 22 ? 0.3 : 0.05;
  const peak = h === 10 || h === 15 ? 1.3 : 1;
  const noise = rng.float(0.75, 1.25);
  switch (id) {
    case 'store-erp-orders':
      return Math.round(24 * business * wk * peak * noise);
    case 'erp-store-stock':
      return Math.round((business > 0.5 ? 12 : 3) * noise * (wd === 0 ? 0.3 : 1));
    case 'sheet-erp':
      return wd >= 1 && wd <= 5 && (h === 9 || h === 14) ? Math.round(16 * noise) : 0;
    case 'bank-recon':
      return wd >= 1 && wd <= 5 && [7, 12, 17].includes(h) ? Math.round(22 * noise) : Math.round(2 * business * wk * noise);
    case 'carrier-tracking':
      return Math.round(8 * business * wk * noise);
  }
}

function buildStats(now: Date, rng: Rng): HourlyStat[] {
  const out: HourlyStat[] = [];
  const cur = new Date(now);
  cur.setMinutes(0, 0, 0);
  const frac = (now.getTime() - cur.getTime()) / 3600000;
  for (let k = 167; k >= 0; k--) {
    const hour = new Date(cur.getTime() - k * 3600000);
    for (const id of INTEGRATION_ORDER) {
      let total = volume(id, hour, rng);
      if (k === 0) total = Math.round(total * frac);
      if (total <= 0) continue;
      let error = 0;
      for (let i = 0; i < total; i++) if (rng.chance(PROFILE[id].errRate)) error++;
      // Pico de erros ontem às 15h (ERP instável) — aparece no gráfico e nos alertas.
      if (k > 18 && k < 30 && hour.getHours() === 15 && id === 'store-erp-orders') error = Math.round(total * 0.22);
      const ok = total - error;
      out.push({ hour: hour.toISOString(), integrationId: id, ok, error, totalDurationMs: Math.round(ok * PROFILE[id].dur * rng.float(0.85, 1.2)) });
    }
  }
  return out;
}

// ---------- Jobs detalhados ----------
interface SeedPlan {
  transientFailures?: number; // timeouts antes do sucesso
  sendError?: ErrorCode; // erro definitivo no envio
  reprocessedBy?: string; // usuário que reprocessou depois de esgotar as tentativas
  ignoredBy?: { user: string; reason: string };
}

interface SeedCtx {
  profiles: Record<IntegrationId, MappingProfile>;
  tables: Record<string, LookupTable>;
  catalog: Record<string, ErpProduct>;
  titles: ErpTitle[];
  counters: HubData['counters'];
  rng: Rng;
}

function responseFor(id: IntegrationId, output: Record<string, unknown>, ctx: SeedCtx, at: Date): Record<string, unknown> {
  switch (id) {
    case 'store-erp-orders':
    case 'sheet-erp': {
      const num = String(++ctx.counters.erp).padStart(6, '0');
      return { C5_NUM: num, C5_FILIAL: '0101', status: 'INCLUIDO', mensagem: `Pedido de venda ${num} incluído com sucesso na filial 0101.` };
    }
    case 'erp-store-stock':
      return { id: `prd_${ctx.rng.int(10000, 99999)}`, updated_at: at.toISOString(), inventory_quantity: output.inventory_quantity, price: output.price };
    case 'bank-recon': {
      const t = ctx.titles.find((x) => x.nossoNumero === output.E1_NUMBCO);
      return { E1_NUM: t?.id ?? '—', E5_SEQ: '01', status: 'BAIXADO', mensagem: `Título ${t?.id} baixado por recebimento bancário.` };
    }
    case 'carrier-tracking':
      return { order_id: `NX-${output.order_number}`, fulfillment_status: output.fulfillment_status, updated_at: at.toISOString() };
  }
}

const CONFIRM: Record<IntegrationId, (r: Record<string, unknown>) => string> = {
  'store-erp-orders': (r) => `ERP confirmou: pedido de venda ${r.C5_NUM} incluído (filial ${r.C5_FILIAL}).`,
  'sheet-erp': (r) => `ERP confirmou: pedido de venda ${r.C5_NUM} incluído (filial ${r.C5_FILIAL}).`,
  'erp-store-stock': (r) => `Loja confirmou: saldo ${r.inventory_quantity} e preço atualizados.`,
  'bank-recon': (r) => `ERP confirmou: título ${r.E1_NUM} baixado (sequência ${r.E5_SEQ}).`,
  'carrier-tracking': (r) => `Loja confirmou: entrega do pedido ${r.order_id} atualizada para "${r.fulfillment_status}".`,
};

const SEND_ERROR_MSG: Partial<Record<ErrorCode, (out: Record<string, unknown>, ctx: SeedCtx) => string>> = {
  ERP_TIMEOUT: () => 'O ERP não respondeu em 30 s (HTTP 504 Gateway Timeout).',
  TITULO_JA_BAIXADO: (out, ctx) => {
    const t = ctx.titles.find((x) => x.nossoNumero === out.E1_NUMBCO);
    return `O título ${t?.id} (${t?.customerName}) já foi baixado em ${t?.paidAt?.slice(0, 10).split('-').reverse().join('/')}.`;
  },
  ESTOQUE_INSUFICIENTE: (out, ctx) => {
    const itens = (out.itens as { C6_PRODUTO: string; C6_QTDVEN: number }[]) ?? [];
    const s = itens.find((i) => (ctx.catalog[i.C6_PRODUTO]?.stock ?? 0) < i.C6_QTDVEN) ?? itens[0];
    const p = ctx.catalog[s.C6_PRODUTO];
    return `Produto ${p.code} (${p.description}): solicitado ${s.C6_QTDVEN} ${p.unit}, disponível ${p.stock} ${p.unit}.`;
  },
};

function shortCode(out: Record<string, unknown>, ctx: SeedCtx): string {
  const itens = (out.itens as { C6_PRODUTO: string; C6_QTDVEN: number }[]) ?? [];
  return (itens.find((i) => (ctx.catalog[i.C6_PRODUTO]?.stock ?? 0) < i.C6_QTDVEN) ?? itens[0]).C6_PRODUTO;
}

export function buildSeedJob(id: IntegrationId, input: unknown, createdAt: Date, plan: SeedPlan, ctx: SeedCtx): Job {
  const rng = ctx.rng;
  let t = createdAt.getTime();
  const ev = (stage: TimelineEvent['stage'], status: TimelineEvent['status'], message: string, durationMs?: number, attempt?: number): TimelineEvent => ({
    stage,
    status,
    message,
    durationMs,
    attempt,
    at: new Date(t).toISOString(),
  });
  const kind = id === 'erp-store-stock' ? 'produto' : id === 'bank-recon' ? 'titulo' : id === 'carrier-tracking' ? 'rastreio' : 'pedido';
  const meta = describeInput(id, input);
  const timeline: TimelineEvent[] = [ev('received', 'ok', `Recebido de ${id === 'erp-store-stock' ? 'ERP' : id === 'sheet-erp' ? 'planilha' : id === 'bank-recon' ? 'extrato bancário' : id === 'carrier-tracking' ? 'transportadora' : 'loja virtual'}.`)];
  const job: Job = {
    id: `JOB-${String(++ctx.counters.job).padStart(6, '0')}`,
    integrationId: id,
    kind,
    ...meta,
    status: 'done',
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    durationMs: 0,
    attempts: 1,
    maxAttempts: RETRY_POLICY.maxAttempts,
    input,
    timeline,
    source: 'agendado',
  };

  const prep = prepareJob(id, input, { profile: ctx.profiles[id], tables: ctx.tables, catalog: ctx.catalog });
  let d = rng.int(30, 120);
  t += d;
  if (!prep.ok) {
    if (prep.stage === 'transformed') timeline.push(ev('validated', 'ok', 'Estrutura e documentos validados.', d));
    t += rng.int(10, 60);
    timeline.push(ev(prep.stage === 'validated' ? 'validated' : 'transformed', 'error', prep.error.message, d));
    job.status = 'error';
    job.error = prep.error;
    job.output = prep.output;
    job.wasError = true;
    job.updatedAt = new Date(t).toISOString();
    job.durationMs = t - createdAt.getTime();
    return finishIgnored(job, plan, t, ev);
  }
  timeline.push(ev('validated', 'ok', 'Estrutura e documentos validados.', d));
  d = rng.int(15, 70);
  t += d;
  timeline.push(ev('transformed', 'ok', `${ctx.profiles[id].rules.length} regras de mapeamento aplicadas.`, d));
  job.output = prep.output;

  const sendErr = plan.sendError;
  const failures = sendErr === 'ERP_TIMEOUT' ? RETRY_POLICY.maxAttempts : plan.transientFailures ?? 0;
  let attempt = 1;
  for (; attempt <= failures; attempt++) {
    d = rng.int(30000, 30400);
    t += d;
    const msg = id === 'erp-store-stock' ? 'A API da loja respondeu HTTP 503 (limite de 60 requisições/min atingido).' : 'O ERP não respondeu em 30 s (HTTP 504 Gateway Timeout).';
    timeline.push(ev('sent', 'error', msg, d, attempt));
    if (attempt < RETRY_POLICY.maxAttempts) {
      const wait = backoffDelay(attempt);
      timeline.push(ev('retry', 'warn', `Nova tentativa automática (${attempt + 1} de ${RETRY_POLICY.maxAttempts}) em ${wait / 1000} s — backoff exponencial.`, undefined, attempt));
      t += wait;
    }
  }
  job.attempts = Math.max(1, attempt - (failures >= RETRY_POLICY.maxAttempts ? 1 : 0));
  if (sendErr === 'ERP_TIMEOUT') {
    job.attempts = RETRY_POLICY.maxAttempts;
    job.status = 'error';
    job.error = makeError('ERP_TIMEOUT', `O ERP não respondeu em 30 s após ${RETRY_POLICY.maxAttempts} tentativas (HTTP 504).`);
    job.wasError = true;
    timeline.push(ev('error', 'error', `Tentativas automáticas esgotadas (${RETRY_POLICY.maxAttempts}). Aguardando ação manual.`));
    job.updatedAt = new Date(t).toISOString();
    job.durationMs = t - createdAt.getTime();
    if (plan.reprocessedBy) {
      t += rng.int(15, 50) * 60000;
      timeline.push(ev('reprocess', 'info', `Reprocessado manualmente por ${plan.reprocessedBy}.`));
      job.attempts += 1;
      const start = t;
      d = rng.int(500, 1400);
      t += d;
      timeline.push(ev('validated', 'ok', 'Estrutura e documentos validados.', 80));
      timeline.push(ev('sent', 'ok', 'Pedido enviado ao ERP.', d, job.attempts));
      const resp = responseFor(id, prep.output, ctx, new Date(t));
      t += rng.int(80, 300);
      timeline.push(ev('confirmed', 'ok', CONFIRM[id](resp)));
      job.status = 'reprocessed';
      job.error = null;
      job.response = resp;
      job.durationMs = t - start;
      job.updatedAt = new Date(t).toISOString();
    }
    return job;
  }
  if (sendErr) {
    d = rng.int(300, 1200);
    t += d;
    const message = SEND_ERROR_MSG[sendErr]?.(prep.output, ctx) ?? 'Erro no envio.';
    timeline.push(ev('sent', 'error', message, d, attempt));
    job.status = 'error';
    job.error = makeError(sendErr, message, sendErr === 'TITULO_JA_BAIXADO' ? { value: String(prep.output.E1_NUMBCO) } : sendErr === 'ESTOQUE_INSUFICIENTE' ? { field: 'items[].quantity', value: shortCode(prep.output, ctx) } : {});
    job.wasError = true;
    job.updatedAt = new Date(t).toISOString();
    job.durationMs = t - createdAt.getTime();
    return finishIgnored(job, plan, t, ev);
  }
  d = rng.int(250, 1300);
  t += d;
  timeline.push(ev('sent', 'ok', `Enviado ${id === 'erp-store-stock' || id === 'carrier-tracking' ? 'à loja virtual' : 'ao ERP'}.`, d, attempt));
  const resp = responseFor(id, prep.output, ctx, new Date(t));
  t += rng.int(60, 300);
  timeline.push(ev('confirmed', 'ok', CONFIRM[id](resp)));
  job.attempts = attempt;
  job.response = resp;
  job.updatedAt = new Date(t).toISOString();
  job.durationMs = t - createdAt.getTime() - (failures ? failures * 30000 : 0);
  if (failures) job.durationMs = t - createdAt.getTime();
  return job;
}

function finishIgnored(job: Job, plan: SeedPlan, t: number, ev: (s: TimelineEvent['stage'], st: TimelineEvent['status'], m: string) => TimelineEvent): Job {
  if (!plan.ignoredBy) return job;
  const later = t + 45 * 60000;
  const e = ev('ignored', 'info', `Ignorado por ${plan.ignoredBy.user}: "${plan.ignoredBy.reason}"`);
  e.at = new Date(later).toISOString();
  job.timeline.push(e);
  job.status = 'ignored';
  job.ignoredReason = plan.ignoredBy.reason;
  job.updatedAt = e.at;
  return job;
}

// ---------- Financeiro ----------
function buildFinance(now: Date, customers: Customer[], rng: Rng): { titles: ErpTitle[]; transactions: BankTransaction[] } {
  const day = 86400000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const titles: ErpTitle[] = [];
  for (let i = 0; i < 60; i++) {
    const c = customers[(i * 5) % customers.length];
    const issue = now.getTime() - rng.int(8, 45) * day;
    const due = issue + 28 * day;
    titles.push({
      id: `NF${String(45210 + i * 3)}-1`,
      nossoNumero: `109${String(52000000 + i * 7919).padStart(8, '0')}`,
      customerName: c.name,
      cnpj: c.cnpj,
      invoice: `NF-e ${45210 + i * 3}`,
      issueDate: iso(issue),
      dueDate: iso(due),
      amount: round2(rng.float(420, 18600)),
      status: i < 18 ? 'baixado' : i < 24 ? 'conciliado' : 'aberto',
      paidAt: i < 24 ? new Date(Math.min(due, now.getTime() - (i + 2) * day)).toISOString() : undefined,
    });
  }
  const tx: BankTransaction[] = [];
  let n = 0;
  const add = (date: number, description: string, payerName: string, payerDoc: string, amount: number, type: BankTransaction['type'], reconciledWith: string | null = null) =>
    tx.push({ id: `EXT-${String(++n).padStart(4, '0')}`, date: iso(date), description, payerName, payerDoc, amount: round2(amount), type, reconciledWith, reconciledBy: reconciledWith ? 'auto' : undefined });
  const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  // Já conciliados (histórico).
  for (let i = 18; i < 24; i++) {
    const t = titles[i];
    add(new Date(t.paidAt!).getTime(), `LIQ BOLETO NN ${t.nossoNumero} ${ascii(t.customerName).slice(0, 22)}`, ascii(t.customerName), onlyDigits(t.cnpj), t.amount, 'BOLETO', t.id);
  }
  // Boletos com nosso número (casamento exato).
  for (let i = 24; i < 38; i++) {
    const t = titles[i];
    t.dueDate = iso(now.getTime() - rng.int(0, 4) * day);
    add(now.getTime() - rng.int(0, 4) * day, `LIQ BOLETO NN ${t.nossoNumero} ${ascii(t.customerName).slice(0, 22)}`, ascii(t.customerName), onlyDigits(t.cnpj), t.amount, 'BOLETO');
  }
  // Pix com valor e CNPJ.
  for (let i = 38; i < 44; i++) {
    const t = titles[i];
    t.dueDate = iso(now.getTime() - rng.int(1, 3) * day);
    add(now.getTime() - rng.int(0, 2) * day, `PIX RECEBIDO ${ascii(t.customerName).slice(0, 26)}`, ascii(t.customerName), onlyDigits(t.cnpj), t.amount, 'PIX');
  }
  // TED com juros (divergência de valor).
  for (let i = 44; i < 47; i++) {
    const t = titles[i];
    t.dueDate = iso(now.getTime() - 3 * day);
    add(now.getTime() - 1 * day, `TED RECEBIDA ${ascii(t.customerName).slice(0, 24)}`, ascii(t.customerName), onlyDigits(t.cnpj), t.amount * 1.0133, 'TED');
  }
  // Pix pago por sócio (CPF), nome semelhante.
  for (let i = 47; i < 49; i++) {
    const t = titles[i];
    t.dueDate = iso(now.getTime() - 1 * day);
    add(now.getTime(), `PIX RECEBIDO ${ascii(t.customerName).slice(0, 26)}`, ascii(t.customerName).replace(' LTDA', ''), '52998224725', t.amount, 'PIX');
  }
  // Sem título correspondente.
  add(now.getTime() - 1 * day, 'PIX RECEBIDO JOSE CARLOS PEREIRA', 'JOSE CARLOS PEREIRA', '11144477735', 1250, 'PIX');
  add(now.getTime() - 2 * day, 'TED RECEBIDA ORBITAL SERVICOS ELETRICOS', 'ORBITAL SERVICOS ELETRICOS', onlyDigits(makeCnpj('33456120')), 3870.4, 'TED');
  // Duplicidade (título já baixado).
  for (const i of [2, 5]) {
    const t = titles[i];
    add(now.getTime() - 1 * day, `LIQ BOLETO NN ${t.nossoNumero} ${ascii(t.customerName).slice(0, 22)}`, ascii(t.customerName), onlyDigits(t.cnpj), t.amount, 'BOLETO');
  }
  // Títulos 49+ seguem em aberto: alguns vencidos, outros a vencer.
  for (let i = 49; i < 60; i++) titles[i].dueDate = iso(now.getTime() + (i % 3 === 0 ? -rng.int(4, 12) : rng.int(3, 20)) * day);
  tx.sort((a, b) => b.date.localeCompare(a.date));
  return { titles, transactions: tx };
}

// ---------- Montagem ----------
export function createSeedData(now = new Date()): HubData {
  const rng = new Rng(20261125);
  const customers = initialCustomers();
  const catalog = initialCatalog();
  const tables = initialLookupTables();
  const profiles = initialMappingProfiles() as Record<IntegrationId, MappingProfile>;
  const { titles, transactions } = buildFinance(now, customers, rng);
  const counters = { erp: 48213, store: 10288, sheet: 3120, job: 18240, audit: 0 };
  const ctx: SeedCtx = { profiles, tables, catalog, titles, counters, rng };
  const jobs: Job[] = [];
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000);

  const push = (id: IntegrationId, input: unknown, at: Date, plan: SeedPlan = {}) => jobs.push(buildSeedJob(id, input, at, plan, ctx));

  // Pedidos da loja nas últimas ~9 horas.
  for (let i = 0; i < 70; i++) {
    const at = minutesAgo(540 - i * 7.5 - rng.int(0, 5));
    const order = makeStoreOrder(rng, customers, ++counters.store, at);
    const plan: SeedPlan = i % 17 === 3 ? { transientFailures: 1 } : i % 29 === 11 ? { transientFailures: 2 } : {};
    push('store-erp-orders', order, at, plan);
  }
  // Erros pendentes realistas (pedidos).
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(212), 'cnpj'), minutesAgo(212));
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(64), 'cnpj'), minutesAgo(64));
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(148), 'sku'), minutesAgo(148));
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(27), 'sku'), minutesAgo(27));
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(95), 'stock'), minutesAgo(95), { sendError: 'ESTOQUE_INSUFICIENTE' });
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(41), null), minutesAgo(41), { sendError: 'ERP_TIMEOUT' });
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(18), null), minutesAgo(18), { sendError: 'ERP_TIMEOUT' });
  // Reprocessado com sucesso (histórico).
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(380), null), minutesAgo(380), { sendError: 'ERP_TIMEOUT', reprocessedBy: 'Carlos Mendes' });
  push('store-erp-orders', makeStoreOrder(rng, customers, ++counters.store, minutesAgo(300), null), minutesAgo(300), { sendError: 'ERP_TIMEOUT', reprocessedBy: 'Ana Ribeiro' });

  // Estoque e preço.
  const prods = Object.values(catalog).filter((p) => p.code !== '0020463');
  for (let i = 0; i < 36; i++) {
    const at = minutesAgo(500 - i * 13);
    push('erp-store-stock', makeStockUpdate(rng, rng.pick(prods)), at, i === 14 ? { transientFailures: 1 } : {});
  }
  // Planilhas.
  for (let i = 0; i < 8; i++) {
    const at = minutesAgo(i < 4 ? 390 - i * 2 : 150 - i * 2);
    push('sheet-erp', makeSheetOrder(rng, customers, `REP-${++counters.sheet}`, at), at);
  }
  push('sheet-erp', makeSheetOrder(rng, customers, `REP-${++counters.sheet}`, minutesAgo(141), 'cnpj'), minutesAgo(141));

  // Banco: baixas dos títulos já liquidados + duplicidades.
  for (let i = 0; i < 18; i++) {
    const t = titles[i];
    const at = minutesAgo(520 - i * 20);
    push('bank-recon', makeBankReceipt(t, at, i % 3 === 0 ? 'PIX' : 'BOLETO'), at);
  }
  push('bank-recon', makeBankReceipt(titles[2], minutesAgo(170), 'BOLETO'), minutesAgo(170), { sendError: 'TITULO_JA_BAIXADO' });
  push('bank-recon', makeBankReceipt(titles[5], minutesAgo(52), 'BOLETO'), minutesAgo(52), { sendError: 'TITULO_JA_BAIXADO' });
  push('bank-recon', makeBankReceipt(titles[9], minutesAgo(400), 'PIX'), minutesAgo(400), {
    sendError: 'TITULO_JA_BAIXADO',
    ignoredBy: { user: 'Ana Ribeiro', reason: 'Pagamento em duplicidade confirmado com o cliente; crédito gerado para o próximo pedido.' },
  });

  // Rastreio.
  for (let i = 0; i < 22; i++) {
    const at = minutesAgo(480 - i * 21);
    push('carrier-tracking', makeTracking(rng, 10180 + i * 3, at), at, i === 9 ? { transientFailures: 1 } : {});
  }
  push('carrier-tracking', makeTracking(rng, 10251, minutesAgo(76), true), minutesAgo(76));

  jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const alertRules: AlertRule[] = [
    { id: 'al-1', name: 'Taxa de erro alta', metric: 'errorRate', threshold: 15, windowMin: 15, channels: ['email', 'whatsapp', 'app'], recipients: 'ti@nortex.demo; (11) 98888-0101', enabled: true, lastFiredAt: null },
    { id: 'al-2', name: 'Fila de erros acumulando', metric: 'pendingErrors', threshold: 15, windowMin: 15, channels: ['email', 'app'], recipients: 'operacoes@nortex.demo', enabled: true, lastFiredAt: null },
    { id: 'al-3', name: 'Conector fora do ar', metric: 'connectorDown', threshold: 0, windowMin: 5, channels: ['whatsapp', 'app'], recipients: '(11) 98888-0101', enabled: true, lastFiredAt: null },
    { id: 'al-4', name: 'Sincronização lenta', metric: 'avgDuration', threshold: 8, windowMin: 15, channels: ['app'], recipients: 'ti@nortex.demo', enabled: false, lastFiredAt: null },
  ];

  const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600000).toISOString();
  const notifications: AppNotification[] = [
    {
      id: 'nt-3',
      at: h(1.2),
      ruleId: 'al-1',
      title: 'Taxa de erro alta: Taxa de erro em 18,4%',
      message: '7 de 38 itens processados nos últimos 15 min falharam. Limite configurado: 15%.',
      severity: 'critical',
      read: false,
      emailText:
        'Assunto: [Integra Hub] Alerta — Taxa de erro alta\n\nOlá,\n\nO Integra Hub da Nortex Distribuidora detectou uma condição de alerta:\n\n• Regra: Se taxa de erro passar de 15% em 15 min, avisar\n• Valor medido: 18,4%\n• 7 de 38 itens processados nos últimos 15 min falharam.\n\nAcesse a fila de execuções para ver os itens afetados e reprocessar:\nIntegra Hub → Fila e execuções → filtro "Erro".\n\nMensagem automática — não responda este e-mail.',
      whatsappText: '⚠️ *Integra Hub · Taxa de erro alta*\nTaxa de erro: *18,4%* (limite 15%)\n7 de 38 itens processados nos últimos 15 min falharam.\nAbra o Hub para tratar os itens com erro.',
    },
    {
      id: 'nt-2',
      at: h(22),
      ruleId: 'al-3',
      title: 'Conector fora do ar: Conectores com falha em 1',
      message: 'Conector(es) sem resposta: Pedidos: Loja virtual → ERP. Limite configurado: 0 conectores.',
      severity: 'critical',
      read: true,
      emailText: '',
      whatsappText: '⚠️ *Integra Hub · Conector fora do ar*\nConectores com falha: *1*\nConector(es) sem resposta: Pedidos: Loja virtual → ERP.\nAbra o Hub para acompanhar.',
    },
    {
      id: 'nt-1',
      at: h(46),
      ruleId: 'al-2',
      title: 'Fila de erros acumulando: Erros pendentes em 17',
      message: 'Há 17 itens aguardando correção na fila. Limite configurado: 15 itens.',
      severity: 'warning',
      read: true,
      emailText: 'Assunto: [Integra Hub] Alerta — Fila de erros acumulando\n\nHá 17 itens aguardando correção na fila.',
      whatsappText: '',
    },
  ];

  const auditRaw: [number, string, AuditEntry['role'], string, string, string][] = [
    [0.4, 'Carlos Mendes', 'operator', 'Reprocessou item', 'JOB · pedido #10279', 'Reprocessamento manual após timeout do ERP.'],
    [1.1, 'Sistema', 'sistema', 'Disparou alerta', 'Regra "Taxa de erro alta"', 'Taxa de erro em 18,4% nos últimos 15 min. Enviado por e-mail, WhatsApp e no app.'],
    [2.3, 'Ana Ribeiro', 'admin', 'Alterou mapeamento', 'Pedidos: Loja virtual → ERP', 'Regra customer.name → A1_NOME: adicionada transformação "Limitar tamanho (40)".'],
    [3.0, 'Carlos Mendes', 'operator', 'Importou planilha', 'pedidos-representantes-semana47.xlsx', '42 linhas lidas, 39 válidas, 3 com erro. 9 pedidos enviados ao ERP.'],
    [4.6, 'Ana Ribeiro', 'admin', 'Ignorou item', 'Recebimento NN ' + titles[9].nossoNumero, 'Pagamento em duplicidade confirmado com o cliente; crédito gerado para o próximo pedido.'],
    [5.2, 'Ana Ribeiro', 'admin', 'Adicionou equivalência', 'Tabela SKU → Código ERP', 'TERM-OLHAL-6 → 0070106'],
    [6.0, 'Carlos Mendes', 'operator', 'Conciliou recebimento', `Título ${titles[20].id}`, 'Conciliação automática aceita (nosso número idêntico).'],
    [7.5, 'Carlos Mendes', 'operator', 'Entrou no sistema', 'Login', 'Perfil Operador.'],
    [8.1, 'Ana Ribeiro', 'admin', 'Entrou no sistema', 'Login', 'Perfil Administrador.'],
    [21.8, 'Ana Ribeiro', 'admin', 'Religou integração', 'Pedidos: Loja virtual → ERP', 'ERP voltou após janela de manutenção.'],
    [22.4, 'Ana Ribeiro', 'admin', 'Desligou integração', 'Pedidos: Loja virtual → ERP', 'Manutenção programada do ERP (atualização de versão).'],
    [26.0, 'Ana Ribeiro', 'admin', 'Alterou frequência', 'Estoque e preço: ERP → Loja virtual', 'De "a cada 30 min" para "a cada 15 min".'],
    [30.5, 'Carlos Mendes', 'operator', 'Reprocessou em lote', '6 itens', 'Pedidos com timeout do ERP reprocessados após normalização.'],
    [47.0, 'Ana Ribeiro', 'admin', 'Alterou regra de alerta', 'Fila de erros acumulando', 'Limite alterado de 20 para 15 erros pendentes.'],
    [50.2, 'Ana Ribeiro', 'admin', 'Atualizou credencial', 'Recebimentos: Banco → ERP', 'Client Secret renovado (valor mascarado).'],
    [70.0, 'Carlos Mendes', 'operator', 'Corrigiu dado e reprocessou', 'Pedido #10198', 'CNPJ do cliente corrigido (dígito verificador).'],
    [96.3, 'Ana Ribeiro', 'admin', 'Criou regra de alerta', 'Conector fora do ar', 'Aviso por WhatsApp para o plantão de TI.'],
    [120.0, 'Ana Ribeiro', 'admin', 'Alterou mapeamento', 'Rastreio: Transportadora → Loja virtual', 'Nova equivalência de status "Saiu para entrega" → out_for_delivery.'],
  ];
  const audit: AuditEntry[] = auditRaw.map(([hrs, user, role, action, target, details]) => ({ id: `AU-${String(++counters.audit).padStart(5, '0')}`, at: h(hrs), user, role, action, target, details }));

  return {
    version: DATA_VERSION,
    seededAt: now.toISOString(),
    integrations: initialIntegrations(now),
    jobs,
    stats: buildStats(now, rng),
    profiles,
    tables,
    catalog,
    customers,
    titles,
    transactions,
    alertRules,
    notifications,
    audit: audit.reverse().reverse(),
    counters,
  };
}
