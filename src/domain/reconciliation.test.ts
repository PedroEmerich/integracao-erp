import { describe, expect, it } from 'vitest';
import { findDivergences, nameSimilarity, scoreMatch, suggestMatches } from './reconciliation';
import type { BankTransaction, ErpTitle } from './types';

const title = (p: Partial<ErpTitle>): ErpTitle => ({
  id: 'T1', nossoNumero: '10952000001', customerName: 'Engelux Engenharia Ltda', cnpj: '11.222.333/0001-81', invoice: 'NF-e 1',
  issueDate: '2026-10-28', dueDate: '2026-11-25', amount: 1000, status: 'aberto', ...p,
});
const tx = (p: Partial<BankTransaction>): BankTransaction => ({
  id: 'E1', date: '2026-11-25', description: 'PIX RECEBIDO', payerName: 'ENGELUX ENGENHARIA', payerDoc: '11222333000181', amount: 1000, type: 'PIX', ...p,
});

describe('conciliação bancária', () => {
  it('nosso número idêntico tem pontuação máxima', () => {
    expect(scoreMatch(tx({ description: 'LIQ BOLETO NN 10952000001' }), title({})).score).toBe(100);
  });
  it('valor + CNPJ + data dão alta confiança', () => {
    const s = scoreMatch(tx({}), title({}));
    expect(s.score).toBeGreaterThanOrEqual(90);
    expect(s.reasons).toContain('Valor idêntico');
  });
  it('similaridade de nomes ignora acentos e termos genéricos', () => {
    expect(nameSimilarity('ENGELUX ENGENHARIA', 'Engelux Engenharia Ltda')).toBe(1);
    expect(nameSimilarity('JOSE PEREIRA', 'Engelux Engenharia Ltda')).toBe(0);
  });
  it('sugere pares sem reutilizar transação ou título', () => {
    const titles = [title({ id: 'T1' }), title({ id: 'T2', nossoNumero: '10952000002', amount: 500, cnpj: '00.000.000/0001-91', customerName: 'Outro Cliente Ltda' })];
    const txs = [tx({ id: 'E1' }), tx({ id: 'E2', amount: 1000 })];
    const s = suggestMatches(txs, titles);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ titleId: 'T1' });
  });
  it('aponta divergência de valor, recebimento sem título, duplicidade e vencido', () => {
    const titles = [
      title({ id: 'T1', amount: 1000 }),
      title({ id: 'T2', nossoNumero: '10952000002', status: 'baixado', amount: 300 }),
      title({ id: 'T3', nossoNumero: '10952000003', dueDate: '2026-11-01', amount: 777, cnpj: '00.000.000/0001-91', customerName: 'Xis Ltda' }),
    ];
    const txs = [
      tx({ id: 'E1', amount: 1013.3 }),
      tx({ id: 'E2', description: 'LIQ BOLETO NN 10952000002', amount: 300 }),
      tx({ id: 'E3', payerName: 'FULANO', payerDoc: '52998224725', amount: 42 }),
    ];
    const s = suggestMatches(txs, titles);
    const d = findDivergences(txs, titles, s, new Date('2026-11-25T12:00:00Z'));
    const kinds = d.map((x) => x.kind).sort();
    expect(kinds).toEqual(['duplicidade', 'sem-titulo', 'valor', 'vencido-sem-pagamento']);
    expect(d.find((x) => x.kind === 'valor')?.difference).toBeCloseTo(13.3);
  });
});
