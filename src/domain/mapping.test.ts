import { describe, expect, it } from 'vitest';
import { initialLookupTables, initialMappingProfiles } from '../data/catalog';
import { applyMapping, applyTransform, getPath, listPaths, parseNumberBR, toErpDate } from './mapping';
import type { MappingRule } from './types';

const tables = initialLookupTables();
const ctx = { tables };

describe('transformações', () => {
  it('maiúsculas, minúsculas, espaços e máscara', () => {
    expect(applyTransform('Eletro Paulista', { type: 'upper' }, ctx).value).toBe('ELETRO PAULISTA');
    expect(applyTransform('COMPRAS@X.DEMO', { type: 'lower' }, ctx).value).toBe('compras@x.demo');
    expect(applyTransform('  a   b ', { type: 'trim' }, ctx).value).toBe('a b');
    expect(applyTransform('11.222.333/0001-81', { type: 'digits' }, ctx).value).toBe('11222333000181');
  });
  it('converte unidade e acusa unidade desconhecida', () => {
    expect(applyTransform('un', { type: 'unit' }, ctx).value).toBe('PC');
    expect(applyTransform('M', { type: 'unit' }, ctx).value).toBe('MT');
    const r = applyTransform('GALAO', { type: 'unit' }, ctx);
    expect(r.issue?.code).toBe('UNIT_UNKNOWN');
  });
  it('tabela de equivalência direta e reversa', () => {
    expect(applyTransform('DISJ-MONO-16A', { type: 'lookup', param: 'sku-erp' }, ctx).value).toBe('0020016');
    expect(applyTransform('0020016', { type: 'lookup', param: 'sku-erp', reverse: true }, ctx).value).toBe('DISJ-MONO-16A');
    const miss = applyTransform('NAO-EXISTE', { type: 'lookup', param: 'sku-erp' }, ctx);
    expect(miss.issue).toMatchObject({ code: 'LOOKUP_MISS', value: 'NAO-EXISTE', table: 'sku-erp' });
  });
  it('datas, números em formato brasileiro, tamanho e padrão', () => {
    expect(toErpDate('2026-11-25T10:00:00Z')).toBe('20261125');
    expect(toErpDate('25/11/2026')).toBe('20261125');
    expect(toErpDate('ontem')).toBeNull();
    expect(parseNumberBR('1.234,56')).toBe(1234.56);
    expect(parseNumberBR('R$ 10,5')).toBe(10.5);
    expect(applyTransform('1.234,567', { type: 'decimal' }, ctx).value).toBe(1234.57);
    expect(applyTransform('ABCDEFGHIJ', { type: 'truncate', param: '4' }, ctx).value).toBe('ABCD');
    expect(applyTransform('', { type: 'default', param: '028' }, ctx).value).toBe('028');
  });
});

describe('applyMapping', () => {
  const order = {
    number: 10301,
    created_at: '2026-11-25T13:10:00.000Z',
    customer: { name: ' Eletro Paulista Instalações Ltda ', document: '11.222.333/0001-81', email: 'Compras@Eletro.demo' },
    shipping_address: { zip: '04010-100', city: 'São Paulo', state: 'sp' },
    payment: { method: 'pix' },
    totals: { shipping: '45,9' },
    items: [
      { sku: 'cab-flex-2.5-az', quantity: 3, unit: 'RL', unit_price: 289.9 },
      { sku: 'DISJ-MONO-16A', quantity: 40, unit: 'UN', unit_price: 14.5 },
    ],
  };
  const profile = initialMappingProfiles()['store-erp-orders'];

  it('mapeia cabeçalho e lista de itens para o layout do ERP', () => {
    const { output, issues } = applyMapping(order, profile.rules, ctx);
    expect(issues).toEqual([]);
    expect(output).toMatchObject({
      C5_NUMEXT: 10301,
      C5_EMISSAO: '20261125',
      A1_CGC: '11222333000181',
      A1_NOME: 'ELETRO PAULISTA INSTALAÇÕES LTDA',
      A1_EMAIL: 'compras@eletro.demo',
      A1_CEP: '04010100',
      A1_EST: 'SP',
      C5_CONDPAG: '001',
      C5_FRETE: 45.9,
    });
    expect(output.itens).toEqual([
      { C6_PRODUTO: '0010023', C6_QTDVEN: 3, C6_UM: 'RL', C6_PRCVEN: 289.9 },
      { C6_PRODUTO: '0020016', C6_QTDVEN: 40, C6_UM: 'PC', C6_PRCVEN: 14.5 },
    ]);
  });

  it('acusa campo obrigatório vazio e SKU sem equivalência', () => {
    const bad = { ...order, customer: { ...order.customer, name: '' }, items: [{ sku: 'XYZ', quantity: 1, unit: 'UN', unit_price: 1 }] };
    const { issues } = applyMapping(bad, profile.rules, ctx);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(['REQUIRED', 'LOOKUP_MISS']));
  });

  it('ignora regras incompletas e suporta caminhos aninhados', () => {
    const rules: MappingRule[] = [
      { id: 'a', source: '', target: 'X', transforms: [], required: false },
      { id: 'b', source: 'customer.document', target: 'cliente.doc', transforms: [{ type: 'digits' }], required: true },
    ];
    const { output } = applyMapping(order, rules, ctx);
    expect(getPath(output, 'cliente.doc')).toBe('11222333000181');
    expect(output).not.toHaveProperty('X');
  });

  it('lista os caminhos de origem disponíveis', () => {
    const paths = listPaths(order);
    expect(paths).toContain('customer.document');
    expect(paths).toContain('items[].sku');
  });
});
