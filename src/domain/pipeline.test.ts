import { describe, expect, it } from 'vitest';
import { initialCatalog, initialLookupTables, initialMappingProfiles } from '../data/catalog';
import { corruptCnpj } from '../data/generators';
import { backoffDelay, makeError, RETRY_POLICY, shouldRetry } from './errors';
import { prepareJob, validateInput } from './pipeline';
import type { IntegrationId, MappingProfile } from './types';

const profiles = initialMappingProfiles() as Record<IntegrationId, MappingProfile>;
const ctxFor = (id: IntegrationId) => ({ profile: profiles[id], tables: initialLookupTables(), catalog: initialCatalog() });

const baseOrder = () => ({
  number: 10400,
  created_at: '2026-11-25T10:00:00Z',
  customer: { name: 'Engelux Engenharia Ltda', document: '11.222.333/0001-81', email: 'a@b.demo' },
  shipping_address: { zip: '13000-000', city: 'Campinas', state: 'SP' },
  payment: { method: 'boleto' },
  totals: { shipping: 0 },
  items: [{ sku: 'TOM-2P+T-10A', quantity: 100, unit: 'UN', unit_price: 9.8 }],
});

describe('validação e preparação do pedido', () => {
  it('pedido válido passa e é transformado', () => {
    const r = prepareJob('store-erp-orders', baseOrder(), ctxFor('store-erp-orders'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.output.C5_CONDPAG).toBe('028');
  });

  it('CNPJ inválido falha na validação, explicado em português', () => {
    const o = baseOrder();
    o.customer.document = corruptCnpj(o.customer.document);
    const r = prepareJob('store-erp-orders', o, ctxFor('store-erp-orders'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.stage).toBe('validated');
      expect(r.error.code).toBe('CNPJ_INVALIDO');
      expect(r.error.transient).toBe(false);
      expect(r.error.message).toContain('não é um CNPJ/CPF válido');
    }
  });

  it('SKU sem equivalência gera "produto sem cadastro" na transformação', () => {
    const o = baseOrder();
    o.items[0].sku = 'LED-SPOT-7W-NV';
    const r = prepareJob('store-erp-orders', o, ctxFor('store-erp-orders'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.stage).toBe('transformed');
      expect(r.error.code).toBe('PRODUTO_SEM_CADASTRO');
      expect(r.error.value).toBe('LED-SPOT-7W-NV');
    }
  });

  it('após incluir a equivalência, o mesmo pedido passa (correção + reprocesso)', () => {
    const o = baseOrder();
    o.items[0].sku = 'LED-SPOT-7W-NV';
    const ctx = ctxFor('store-erp-orders');
    ctx.tables['sku-erp'].entries['LED-SPOT-7W-NV'] = '0050009';
    expect(prepareJob('store-erp-orders', o, ctx).ok).toBe(true);
  });

  it('rastreio com código fora do padrão é recusado', () => {
    expect(validateInput('carrier-tracking', { codigo_rastreio: 'JD1234-X' })?.code).toBe('RASTREIO_INVALIDO');
    expect(validateInput('carrier-tracking', { codigo_rastreio: 'QB123456789BR' })).toBeNull();
    expect(validateInput('carrier-tracking', { codigo_rastreio: 'JDL0012345678' })).toBeNull();
  });

  it('pedido de planilha com CNPJ inválido é recusado', () => {
    expect(validateInput('sheet-erp', { cnpj_cliente: '11.222.333/0001-80', razao_social: 'X' })?.code).toBe('CNPJ_INVALIDO');
  });
});

describe('reprocessamento e backoff', () => {
  it('espera cresce exponencialmente e respeita o teto', () => {
    expect([1, 2, 3, 4].map((n) => backoffDelay(n))).toEqual([2000, 4000, 8000, 16000]);
    expect(backoffDelay(30)).toBe(RETRY_POLICY.maxDelayMs);
    expect(backoffDelay(0)).toBe(2000);
  });
  it('só retenta erros transitórios e até o limite de tentativas', () => {
    const timeout = makeError('ERP_TIMEOUT', 'x');
    const cnpj = makeError('CNPJ_INVALIDO', 'x');
    expect(shouldRetry(timeout, 1)).toBe(true);
    expect(shouldRetry(timeout, 3)).toBe(true);
    expect(shouldRetry(timeout, 4)).toBe(false);
    expect(shouldRetry(cnpj, 1)).toBe(false);
    expect(shouldRetry(makeError('TITULO_JA_BAIXADO', 'x'), 1)).toBe(false);
  });
});
