// Validação linha a linha da planilha de pedidos e agrupamento em pedidos.
import { formatCnpj, isValidCnpj, onlyDigits } from './documents';
import { parseNumberBR, UNIT_TABLE } from './mapping';
import type { SheetOrder } from './types';

export const SHEET_COLUMNS = [
  'pedido',
  'data',
  'cnpj_cliente',
  'razao_social',
  'sku',
  'descricao',
  'quantidade',
  'unidade',
  'preco_unitario',
  'cond_pagamento',
] as const;

export type SheetRow = Record<(typeof SHEET_COLUMNS)[number], string>;

export interface CellError {
  column: string;
  message: string;
}

export interface ValidatedRow {
  line: number; // número da linha na planilha (cabeçalho = 1)
  raw: SheetRow;
  errors: CellError[];
  valid: boolean;
}

export const PAYMENT_TERMS = ['001', '028', '030', '3060', '306090', 'AVISTA'];

function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Converte a matriz (primeira linha = cabeçalho) em linhas nomeadas. Retorna colunas faltantes. */
export function rowsFromMatrix(matrix: unknown[][]): { rows: SheetRow[]; missingColumns: string[] } {
  if (!matrix.length) return { rows: [], missingColumns: [...SHEET_COLUMNS] };
  const header = (matrix[0] ?? []).map((h) => normalizeHeader(String(h ?? '')));
  const missingColumns = SHEET_COLUMNS.filter((c) => !header.includes(c));
  const rows = matrix
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    .map((r) => {
      const row = {} as SheetRow;
      SHEET_COLUMNS.forEach((c) => {
        const idx = header.indexOf(c);
        row[c] = idx >= 0 ? String(r[idx] ?? '').trim() : '';
      });
      return row;
    });
  return { rows, missingColumns };
}

function isValidDateBR(s: string): boolean {
  let y: number, m: number, d: number;
  let mm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mm) [d, m, y] = [Number(mm[1]), Number(mm[2]), Number(mm[3])];
  else if ((mm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [y, m, d] = [Number(mm[1]), Number(mm[2]), Number(mm[3])];
  else return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export interface RowValidationContext {
  knownSkus: Set<string>;
}

export function validateRow(row: SheetRow, line: number, ctx: RowValidationContext): ValidatedRow {
  const errors: CellError[] = [];
  const req = (c: keyof SheetRow, label: string) => {
    if (!row[c]) errors.push({ column: c, message: `${label} é obrigatório` });
  };
  req('pedido', 'Número do pedido');
  req('razao_social', 'Razão social');
  req('sku', 'SKU');
  if (!row.data) errors.push({ column: 'data', message: 'Data é obrigatória' });
  else if (!isValidDateBR(row.data)) errors.push({ column: 'data', message: `Data "${row.data}" inválida (use dd/mm/aaaa)` });
  if (!row.cnpj_cliente) errors.push({ column: 'cnpj_cliente', message: 'CNPJ é obrigatório' });
  else if (!isValidCnpj(row.cnpj_cliente)) errors.push({ column: 'cnpj_cliente', message: `CNPJ ${row.cnpj_cliente} inválido (dígitos não conferem)` });
  if (row.sku && !ctx.knownSkus.has(row.sku)) errors.push({ column: 'sku', message: `SKU "${row.sku}" sem cadastro/equivalência no ERP` });
  const q = parseNumberBR(row.quantidade);
  if (!row.quantidade) errors.push({ column: 'quantidade', message: 'Quantidade é obrigatória' });
  else if (Number.isNaN(q) || q <= 0) errors.push({ column: 'quantidade', message: `Quantidade "${row.quantidade}" deve ser maior que zero` });
  else if (!Number.isInteger(q)) errors.push({ column: 'quantidade', message: 'Quantidade deve ser um número inteiro' });
  if (!UNIT_TABLE[String(row.unidade).toUpperCase()]) errors.push({ column: 'unidade', message: `Unidade "${row.unidade}" desconhecida` });
  const p = parseNumberBR(row.preco_unitario);
  if (!row.preco_unitario) errors.push({ column: 'preco_unitario', message: 'Preço é obrigatório' });
  else if (Number.isNaN(p) || p <= 0) errors.push({ column: 'preco_unitario', message: `Preço "${row.preco_unitario}" inválido` });
  if (row.cond_pagamento && !PAYMENT_TERMS.includes(row.cond_pagamento.toUpperCase())) {
    errors.push({ column: 'cond_pagamento', message: `Condição "${row.cond_pagamento}" não existe no ERP (${PAYMENT_TERMS.join(', ')})` });
  }
  return { line, raw: row, errors, valid: errors.length === 0 };
}

export function validateRows(rows: SheetRow[], ctx: RowValidationContext): ValidatedRow[] {
  const validated = rows.map((r, i) => validateRow(r, i + 2, ctx));
  // Linhas do mesmo pedido devem ter o mesmo CNPJ.
  const firstDoc = new Map<string, string>();
  validated.forEach((v) => {
    const key = v.raw.pedido;
    if (!key || !v.raw.cnpj_cliente) return;
    const doc = onlyDigits(v.raw.cnpj_cliente);
    if (!firstDoc.has(key)) firstDoc.set(key, doc);
    else if (firstDoc.get(key) !== doc) {
      v.errors.push({ column: 'cnpj_cliente', message: `CNPJ diferente das outras linhas do pedido ${key}` });
      v.valid = false;
    }
  });
  return validated;
}

/** Agrupa as linhas válidas em pedidos (um pedido por número). */
export function groupOrders(rows: ValidatedRow[]): SheetOrder[] {
  const map = new Map<string, SheetOrder>();
  rows
    .filter((r) => r.valid)
    .forEach((r) => {
      const k = r.raw.pedido;
      if (!map.has(k)) {
        map.set(k, {
          pedido: k,
          data: r.raw.data,
          cnpj_cliente: formatCnpj(r.raw.cnpj_cliente),
          razao_social: r.raw.razao_social,
          cond_pagamento: (r.raw.cond_pagamento || '028').toUpperCase(),
          itens: [],
          linhas: [],
        });
      }
      const o = map.get(k)!;
      o.itens.push({
        sku: r.raw.sku,
        descricao: r.raw.descricao,
        quantidade: parseNumberBR(r.raw.quantidade),
        unidade: r.raw.unidade.toUpperCase(),
        preco_unitario: parseNumberBR(r.raw.preco_unitario),
      });
      o.linhas.push(r.line);
    });
  return [...map.values()];
}
