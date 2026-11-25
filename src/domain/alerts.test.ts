import { describe, expect, it } from 'vitest';
import { buildMessages, computeMetrics, evaluateRule, inCooldown } from './alerts';
import type { AlertRule, Job } from './types';

const now = new Date('2026-11-25T15:00:00Z');
const job = (status: Job['status'], minAgo: number, durationMs = 1500): Job => ({
  id: Math.random().toString(), integrationId: 'store-erp-orders', kind: 'pedido', reference: '#1', description: '', status,
  createdAt: now.toISOString(), updatedAt: new Date(now.getTime() - minAgo * 60000).toISOString(), durationMs, attempts: 1, maxAttempts: 4, input: {}, timeline: [],
});
const rule: AlertRule = { id: 'r', name: 'Taxa de erro alta', metric: 'errorRate', threshold: 15, windowMin: 15, channels: ['email', 'whatsapp'], recipients: '', enabled: true };

describe('alertas', () => {
  it('calcula a taxa de erro só dentro da janela', () => {
    const jobs = [job('done', 1), job('done', 2), job('error', 3), job('error', 4), job('done', 5), job('error', 40)];
    const m = computeMetrics(jobs, [], now, 15);
    expect(m.finished).toBe(5);
    expect(m.errorRate).toBe(40);
    expect(m.pendingErrors).toBe(3);
  });
  it('dispara acima do limite e exige volume mínimo', () => {
    const many = [job('done', 1), job('done', 1), job('error', 1), job('error', 1), job('done', 1)];
    expect(evaluateRule(rule, computeMetrics(many, [], now, 15))).toBe(40);
    expect(evaluateRule(rule, computeMetrics(many.slice(0, 3), [], now, 15))).toBeNull();
    expect(evaluateRule({ ...rule, enabled: false }, computeMetrics(many, [], now, 15))).toBeNull();
  });
  it('respeita o intervalo entre disparos', () => {
    expect(inCooldown({ ...rule, lastFiredAt: new Date(now.getTime() - 5 * 60000).toISOString() }, now)).toBe(true);
    expect(inCooldown({ ...rule, lastFiredAt: new Date(now.getTime() - 20 * 60000).toISOString() }, now)).toBe(false);
  });
  it('gera textos de e-mail e WhatsApp em português', () => {
    const m = computeMetrics([job('error', 1), job('done', 1)], [], now, 15);
    const msg = buildMessages(rule, 50, m, now);
    expect(msg.email).toContain('Assunto: [Integra Hub] Alerta — Taxa de erro alta');
    expect(msg.whatsapp).toContain('*50%*');
  });
});
