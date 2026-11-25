// Tipos centrais do Integra Hub.

export type IntegrationId =
  | 'store-erp-orders'
  | 'erp-store-stock'
  | 'sheet-erp'
  | 'bank-recon'
  | 'carrier-tracking';

export type Role = 'admin' | 'operator';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
}

export type HealthStatus = 'online' | 'slow' | 'down' | 'paused';

export type FrequencyMode = 'realtime' | 'interval' | 'fixed';

export interface Frequency {
  mode: FrequencyMode;
  intervalMin: number;
  fixedTime: string; // HH:mm
}

export interface Credential {
  key: string;
  label: string;
  value: string; // fictício
  secret: boolean;
}

export interface Integration {
  id: IntegrationId;
  name: string;
  source: string;
  target: string;
  description: string;
  entity: JobKind;
  enabled: boolean;
  frequency: Frequency;
  credentials: Credential[];
  health: HealthStatus;
  lastPing: string; // ISO
  latencyMs: number;
  lastSync: string | null;
}

export type JobKind = 'pedido' | 'produto' | 'titulo' | 'rastreio';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error' | 'reprocessed' | 'ignored';

export type Stage =
  | 'received'
  | 'validated'
  | 'transformed'
  | 'sent'
  | 'confirmed'
  | 'error'
  | 'retry'
  | 'reprocess'
  | 'corrected'
  | 'ignored';

export interface TimelineEvent {
  stage: Stage;
  at: string;
  status: 'ok' | 'error' | 'info' | 'warn';
  message: string;
  durationMs?: number;
  attempt?: number;
}

export type ErrorCode =
  | 'CNPJ_INVALIDO'
  | 'PRODUTO_SEM_CADASTRO'
  | 'ESTOQUE_INSUFICIENTE'
  | 'ERP_TIMEOUT'
  | 'TITULO_JA_BAIXADO'
  | 'TITULO_NAO_ENCONTRADO'
  | 'CAMPO_OBRIGATORIO'
  | 'LOJA_INDISPONIVEL'
  | 'RASTREIO_INVALIDO'
  | 'TRANSPORTADORA_TIMEOUT';

export interface ErrorInfo {
  code: ErrorCode;
  title: string;
  message: string;
  hint: string;
  transient: boolean;
  field?: string;
  value?: string;
  stage: Stage;
}

export interface Job {
  id: string;
  integrationId: IntegrationId;
  kind: JobKind;
  reference: string;
  description: string;
  amount?: number;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  durationMs: number;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  error?: ErrorInfo | null;
  input: unknown;
  output?: unknown;
  response?: unknown;
  timeline: TimelineEvent[];
  ignoredReason?: string;
  wasError?: boolean; // já falhou alguma vez (para status "reprocessado")
  source?: 'agendado' | 'manual' | 'ao-vivo' | 'planilha' | 'reprocessamento';
}

// ---------- Mapeamento ----------
export type TransformType =
  | 'upper'
  | 'lower'
  | 'trim'
  | 'digits'
  | 'unit'
  | 'lookup'
  | 'date'
  | 'decimal'
  | 'truncate'
  | 'default'
  | 'number';

export interface Transform {
  type: TransformType;
  param?: string;
  reverse?: boolean;
}

export interface MappingRule {
  id: string;
  source: string; // ex.: customer.document ou items[].sku
  target: string; // ex.: A1_CGC ou itens[].C6_PRODUTO
  transforms: Transform[];
  required: boolean;
  note?: string;
}

export interface MappingProfile {
  integrationId: IntegrationId;
  sourceLabel: string;
  targetLabel: string;
  rules: MappingRule[];
}

export interface LookupTable {
  id: string;
  name: string;
  description: string;
  entries: Record<string, string>;
}

// ---------- ERP / Loja ----------
export interface ErpProduct {
  code: string; // B1_COD
  description: string;
  unit: string; // UM do ERP
  stock: number;
  price: number;
  cost: number;
  ncm: string;
}

export interface Customer {
  code: string; // A1_COD
  name: string;
  cnpj: string; // formatado
  city: string;
  state: string;
  street: string;
  district: string;
  zip: string;
  email: string;
  phone: string;
}

export interface StoreOrder {
  id: string;
  number: number;
  created_at: string;
  channel: string;
  customer: { name: string; document: string; email: string; phone: string };
  shipping_address: { street: string; number: string; district: string; city: string; state: string; zip: string };
  items: { sku: string; title: string; quantity: number; unit: string; unit_price: number }[];
  payment: { method: 'boleto' | 'pix' | 'cartao'; installments: number };
  totals: { items: number; shipping: number; discount: number; total: number };
}

export interface SheetOrder {
  pedido: string;
  data: string;
  cnpj_cliente: string;
  razao_social: string;
  cond_pagamento: string;
  itens: { sku: string; descricao: string; quantidade: number; unidade: string; preco_unitario: number }[];
  linhas: number[];
}

export type TitleStatus = 'aberto' | 'baixado' | 'conciliado';

export interface ErpTitle {
  id: string; // E1_NUM
  nossoNumero: string;
  customerName: string;
  cnpj: string;
  invoice: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  status: TitleStatus;
  paidAt?: string;
}

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  payerName: string;
  payerDoc: string;
  amount: number;
  type: 'PIX' | 'BOLETO' | 'TED';
  reconciledWith?: string | null;
  reconciledBy?: 'auto' | 'manual';
}

// ---------- Alertas / auditoria ----------
export type AlertMetric = 'errorRate' | 'pendingErrors' | 'connectorDown' | 'avgDuration';
export type AlertChannel = 'email' | 'whatsapp' | 'app';

export interface AlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  windowMin: number;
  channels: AlertChannel[];
  recipients: string;
  enabled: boolean;
  lastFiredAt?: string | null;
}

export interface AppNotification {
  id: string;
  at: string;
  ruleId: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  read: boolean;
  emailText: string;
  whatsappText: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  user: string;
  role: Role | 'sistema';
  action: string;
  target: string;
  details: string;
}

export interface HourlyStat {
  hour: string; // ISO do início da hora
  integrationId: IntegrationId;
  ok: number;
  error: number;
  totalDurationMs: number;
}
