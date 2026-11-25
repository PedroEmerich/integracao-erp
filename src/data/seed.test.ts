import { describe, expect, it } from 'vitest';
import { isValidCnpj } from '../domain/documents';
import { createSeedData } from './seed';

describe('dados de exemplo', () => {
  const data = createSeedData(new Date('2026-11-25T15:30:00'));
  it('clientes têm CNPJ válido', () => {
    expect(data.customers.every((c) => isValidCnpj(c.cnpj))).toBe(true);
  });
  it('possui erros pendentes de todos os tipos pedidos', () => {
    const codes = new Set(data.jobs.filter((j) => j.status === 'error').map((j) => j.error?.code));
    for (const c of ['CNPJ_INVALIDO', 'PRODUTO_SEM_CADASTRO', 'ESTOQUE_INSUFICIENTE', 'ERP_TIMEOUT', 'TITULO_JA_BAIXADO']) expect(codes.has(c as never)).toBe(true);
  });
  it('tem itens reprocessados e ignorados com histórico', () => {
    expect(data.jobs.some((j) => j.status === 'reprocessed' && j.timeline.some((e) => e.stage === 'reprocess'))).toBe(true);
    expect(data.jobs.some((j) => j.status === 'ignored' && j.ignoredReason)).toBe(true);
  });
  it('gera 7 dias de estatísticas por hora', () => {
    const hours = new Set(data.stats.map((s) => s.hour));
    expect(hours.size).toBeGreaterThan(140);
  });
});
