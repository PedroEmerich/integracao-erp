// Avaliação das regras de alerta e textos prontos de e-mail/WhatsApp.
import type { AlertRule, Integration, Job } from './types';

export interface AlertMetrics {
  errorRate: number; // %
  finished: number;
  errors: number;
  pendingErrors: number;
  avgDurationMs: number;
  downConnectors: string[];
}

export function computeMetrics(jobs: Job[], integrations: Integration[], now: Date, windowMin: number): AlertMetrics {
  const since = now.getTime() - windowMin * 60000;
  const recent = jobs.filter((j) => new Date(j.updatedAt).getTime() >= since && ['done', 'error', 'reprocessed'].includes(j.status));
  const errors = recent.filter((j) => j.status === 'error').length;
  const okJobs = recent.filter((j) => j.status !== 'error');
  const avg = okJobs.length ? okJobs.reduce((s, j) => s + j.durationMs, 0) / okJobs.length : 0;
  return {
    errorRate: recent.length ? (errors / recent.length) * 100 : 0,
    finished: recent.length,
    errors,
    pendingErrors: jobs.filter((j) => j.status === 'error').length,
    avgDurationMs: avg,
    downConnectors: integrations.filter((i) => i.enabled && i.health === 'down').map((i) => i.name),
  };
}

export const METRIC_LABELS: Record<AlertRule['metric'], { label: string; unit: string }> = {
  errorRate: { label: 'Taxa de erro', unit: '%' },
  pendingErrors: { label: 'Erros pendentes', unit: 'itens' },
  connectorDown: { label: 'Conectores com falha', unit: 'conectores' },
  avgDuration: { label: 'Tempo médio de sincronização', unit: 's' },
};

/** Retorna o valor medido se a regra disparar; senão null. */
export function evaluateRule(rule: AlertRule, m: AlertMetrics): number | null {
  if (!rule.enabled) return null;
  switch (rule.metric) {
    case 'errorRate':
      return m.finished >= 5 && m.errorRate > rule.threshold ? Math.round(m.errorRate * 10) / 10 : null;
    case 'pendingErrors':
      return m.pendingErrors > rule.threshold ? m.pendingErrors : null;
    case 'connectorDown':
      return m.downConnectors.length > rule.threshold ? m.downConnectors.length : null;
    case 'avgDuration': {
      const s = m.avgDurationMs / 1000;
      return m.finished >= 3 && s > rule.threshold ? Math.round(s * 10) / 10 : null;
    }
  }
}

export function inCooldown(rule: AlertRule, now: Date, cooldownMin = 15): boolean {
  return !!rule.lastFiredAt && now.getTime() - new Date(rule.lastFiredAt).getTime() < cooldownMin * 60000;
}

export function ruleDescription(rule: AlertRule): string {
  const ml = METRIC_LABELS[rule.metric];
  if (rule.metric === 'connectorDown') return `Se algum conector ficar com falha, avisar`;
  if (rule.metric === 'pendingErrors') return `Se houver mais de ${rule.threshold} erros pendentes, avisar`;
  return `Se ${ml.label.toLowerCase()} passar de ${rule.threshold}${ml.unit === '%' ? '%' : ' ' + ml.unit} em ${rule.windowMin} min, avisar`;
}

export function buildMessages(rule: AlertRule, value: number, m: AlertMetrics, at: Date): { title: string; message: string; email: string; whatsapp: string } {
  const when = at.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const ml = METRIC_LABELS[rule.metric];
  const valueText = rule.metric === 'errorRate' ? `${value.toString().replace('.', ',')}%` : rule.metric === 'avgDuration' ? `${value.toString().replace('.', ',')} s` : String(value);
  let detail = '';
  if (rule.metric === 'errorRate') detail = `${m.errors} de ${m.finished} itens processados nos últimos ${rule.windowMin} min falharam.`;
  if (rule.metric === 'pendingErrors') detail = `Há ${m.pendingErrors} itens aguardando correção na fila.`;
  if (rule.metric === 'connectorDown') detail = `Conector(es) sem resposta: ${m.downConnectors.join(', ')}.`;
  if (rule.metric === 'avgDuration') detail = `O tempo médio de sincronização nos últimos ${rule.windowMin} min está acima do esperado.`;
  const title = `${rule.name}: ${ml.label} em ${valueText}`;
  const message = `${detail} Limite configurado: ${rule.threshold}${ml.unit === '%' ? '%' : ' ' + ml.unit}.`;
  const email = [
    `Assunto: [Integra Hub] Alerta — ${rule.name}`,
    '',
    'Olá,',
    '',
    `O Integra Hub da Nortex Distribuidora detectou uma condição de alerta em ${when}:`,
    '',
    `• Regra: ${ruleDescription(rule)}`,
    `• Valor medido: ${valueText}`,
    `• ${detail}`,
    '',
    'Acesse a fila de execuções para ver os itens afetados e reprocessar:',
    'Integra Hub → Fila e execuções → filtro "Erro".',
    '',
    'Mensagem automática — não responda este e-mail.',
  ].join('\n');
  const whatsapp = [`⚠️ *Integra Hub · ${rule.name}*`, `${ml.label}: *${valueText}* (limite ${rule.threshold}${ml.unit === '%' ? '%' : ' ' + ml.unit})`, detail, `🕒 ${when}`, 'Abra o Hub para tratar os itens com erro.'].join('\n');
  return { title, message, email, whatsapp };
}
