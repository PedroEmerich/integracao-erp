import { describe, expect, it } from 'vitest';
import { groupOrders, rowsFromMatrix, validateRows } from './spreadsheet';

const header = ['Pedido', 'Data', 'CNPJ Cliente', 'Razão Social', 'SKU', 'Descrição', 'Quantidade', 'Unidade', 'Preço Unitário', 'Cond Pagamento'];
const ok = ['REP-1', '25/11/2026', '11.222.333/0001-81', 'Engelux Engenharia Ltda', 'DISJ-MONO-16A', 'Disjuntor', '10', 'UN', '14,50', '028'];
const ctx = { knownSkus: new Set(['DISJ-MONO-16A', 'TOM-2P+T-10A']) };

describe('planilha de pedidos', () => {
  it('normaliza cabeçalhos com acento e espaços', () => {
    const { rows, missingColumns } = rowsFromMatrix([header, ok]);
    expect(missingColumns).toEqual([]);
    expect(rows[0].preco_unitario).toBe('14,50');
  });
  it('aponta colunas ausentes', () => {
    expect(rowsFromMatrix([['pedido', 'sku'], ['1', 'x']]).missingColumns).toContain('cnpj_cliente');
  });
  it('valida linha a linha com mensagens por coluna', () => {
    const bad = ['REP-2', '31/02/2026', '11.222.333/0001-80', 'X', 'NAO-EXISTE', '', '0', 'GALAO', 'abc', '999'];
    const { rows } = rowsFromMatrix([header, ok, bad, []]);
    const v = validateRows(rows, ctx);
    expect(v).toHaveLength(2);
    expect(v[0].valid).toBe(true);
    expect(v[1].line).toBe(3);
    expect(v[1].errors.map((e) => e.column).sort()).toEqual(['cnpj_cliente', 'cond_pagamento', 'data', 'preco_unitario', 'quantidade', 'sku', 'unidade']);
  });
  it('exige o mesmo CNPJ em todas as linhas do pedido', () => {
    const other = [...ok];
    other[2] = '52.998.224/0001-00';
    const { rows } = rowsFromMatrix([header, ok, other]);
    const v = validateRows(rows, ctx);
    expect(v[1].valid).toBe(false);
  });
  it('agrupa só as linhas válidas em pedidos', () => {
    const second = [...ok];
    second[4] = 'TOM-2P+T-10A';
    const bad = [...ok];
    bad[6] = '-1';
    const { rows } = rowsFromMatrix([header, ok, second, bad]);
    const orders = groupOrders(validateRows(rows, ctx));
    expect(orders).toHaveLength(1);
    expect(orders[0].itens).toHaveLength(2);
    expect(orders[0].linhas).toEqual([2, 3]);
    expect(orders[0].itens[0].preco_unitario).toBe(14.5);
  });
});
