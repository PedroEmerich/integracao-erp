// Motor de mapeamento de campos (de/para) com regras de transformação.
import { onlyDigits } from './documents';
import type { LookupTable, MappingRule, Transform } from './types';

export interface MappingIssue {
  ruleId: string;
  target: string;
  code: 'LOOKUP_MISS' | 'REQUIRED' | 'UNIT_UNKNOWN' | 'INVALID_NUMBER' | 'INVALID_DATE';
  message: string;
  value?: string;
  table?: string;
}

export interface MappingResult {
  output: Record<string, unknown>;
  issues: MappingIssue[];
}

/** Conversão de unidades da loja/planilha para o padrão do ERP. */
export const UNIT_TABLE: Record<string, string> = {
  UN: 'PC',
  UND: 'PC',
  UNID: 'PC',
  PC: 'PC',
  PCA: 'PC',
  CX: 'CX',
  CAIXA: 'CX',
  M: 'MT',
  MT: 'MT',
  METRO: 'MT',
  RL: 'RL',
  ROLO: 'RL',
  KG: 'KG',
  PCT: 'PT',
  PT: 'PT',
};

export const TRANSFORM_LABELS: Record<Transform['type'], string> = {
  upper: 'Maiúsculas',
  lower: 'Minúsculas',
  trim: 'Remover espaços',
  digits: 'Remover máscara',
  unit: 'Converter unidade',
  lookup: 'Tabela de equivalência',
  date: 'Data AAAAMMDD',
  decimal: 'Decimal (2 casas)',
  truncate: 'Limitar tamanho',
  default: 'Valor padrão',
  number: 'Converter para número',
};

export function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur: Record<string, unknown> = obj;
  keys.slice(0, -1).forEach((k) => {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  });
  cur[keys[keys.length - 1]] = value;
}

/** Converte "1.234,56", "1234.56" ou 1234.56 em número. */
export function parseNumberBR(value: unknown): number {
  if (typeof value === 'number') return value;
  const s = String(value ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  return Number(s);
}

/** Aceita ISO (2026-11-25...), dd/mm/aaaa. Retorna AAAAMMDD ou null. */
export function toErpDate(value: unknown): string | null {
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  return null;
}

export interface TransformContext {
  tables: Record<string, LookupTable>;
}

export interface TransformOutcome {
  value: unknown;
  issue?: Omit<MappingIssue, 'ruleId' | 'target'>;
}

export function applyTransform(value: unknown, t: Transform, ctx: TransformContext): TransformOutcome {
  if (value === undefined || value === null || value === '') {
    if (t.type === 'default') return { value: t.param ?? '' };
    return { value };
  }
  switch (t.type) {
    case 'upper':
      return { value: String(value).toLocaleUpperCase('pt-BR') };
    case 'lower':
      return { value: String(value).toLocaleLowerCase('pt-BR') };
    case 'trim':
      return { value: String(value).trim().replace(/\s+/g, ' ') };
    case 'digits':
      return { value: onlyDigits(String(value)) };
    case 'truncate':
      return { value: String(value).slice(0, Number(t.param ?? 30)) };
    case 'default':
      return { value };
    case 'number': {
      const n = parseNumberBR(value);
      if (Number.isNaN(n)) return { value, issue: { code: 'INVALID_NUMBER', message: `"${value}" não é um número válido`, value: String(value) } };
      return { value: n };
    }
    case 'decimal': {
      const n = parseNumberBR(value);
      if (Number.isNaN(n)) return { value, issue: { code: 'INVALID_NUMBER', message: `"${value}" não é um número válido`, value: String(value) } };
      return { value: Math.round(n * 100) / 100 };
    }
    case 'date': {
      const d = toErpDate(value);
      if (!d) return { value, issue: { code: 'INVALID_DATE', message: `Data "${value}" em formato desconhecido`, value: String(value) } };
      return { value: d };
    }
    case 'unit': {
      const key = String(value).trim().toUpperCase();
      const mapped = UNIT_TABLE[key];
      if (!mapped) return { value: key, issue: { code: 'UNIT_UNKNOWN', message: `Unidade "${value}" sem conversão para o ERP`, value: String(value) } };
      return { value: mapped };
    }
    case 'lookup': {
      const table = ctx.tables[t.param ?? ''];
      const key = String(value).trim();
      if (!table) return { value: key, issue: { code: 'LOOKUP_MISS', message: `Tabela "${t.param}" não encontrada`, value: key, table: t.param } };
      if (t.reverse) {
        const found = Object.entries(table.entries).find(([, v]) => v === key);
        if (found) return { value: found[0] };
      } else if (key in table.entries) {
        return { value: table.entries[key] };
      }
      return {
        value: key,
        issue: { code: 'LOOKUP_MISS', message: `"${key}" não consta na tabela "${table.name}"`, value: key, table: table.id },
      };
    }
    default:
      return { value };
  }
}

function runTransforms(value: unknown, rule: MappingRule, ctx: TransformContext, issues: MappingIssue[]): unknown {
  let v = value;
  for (const t of rule.transforms) {
    const r = applyTransform(v, t, ctx);
    v = r.value;
    if (r.issue) issues.push({ ...r.issue, ruleId: rule.id, target: rule.target });
  }
  if (rule.required && (v === undefined || v === null || v === '')) {
    issues.push({ ruleId: rule.id, target: rule.target, code: 'REQUIRED', message: `Campo obrigatório "${rule.target}" ficou vazio (origem: ${rule.source})` });
  }
  return v;
}

/**
 * Aplica as regras ao registro de origem.
 * Suporta um nível de lista: "items[].sku" → "itens[].C6_PRODUTO".
 */
export function applyMapping(input: unknown, rules: MappingRule[], ctx: TransformContext): MappingResult {
  const output: Record<string, unknown> = {};
  const issues: MappingIssue[] = [];

  for (const rule of rules) {
    if (!rule.source || !rule.target) continue;
    const srcIdx = rule.source.indexOf('[]');
    const tgtIdx = rule.target.indexOf('[]');
    if (srcIdx >= 0 && tgtIdx >= 0) {
      const srcArrPath = rule.source.slice(0, srcIdx);
      const srcRest = rule.source.slice(srcIdx + 3);
      const tgtArrPath = rule.target.slice(0, tgtIdx);
      const tgtRest = rule.target.slice(tgtIdx + 3);
      const arr = getPath(input, srcArrPath);
      if (!Array.isArray(arr)) {
        if (rule.required) issues.push({ ruleId: rule.id, target: rule.target, code: 'REQUIRED', message: `Lista "${srcArrPath}" não encontrada na origem` });
        continue;
      }
      let outArr = getPath(output, tgtArrPath) as Record<string, unknown>[] | undefined;
      if (!Array.isArray(outArr)) {
        outArr = [];
        setPath(output, tgtArrPath, outArr);
      }
      arr.forEach((item, i) => {
        if (!outArr![i]) outArr![i] = {};
        const v = runTransforms(srcRest ? getPath(item, srcRest) : item, rule, ctx, issues);
        setPath(outArr![i], tgtRest, v);
      });
    } else {
      const v = runTransforms(getPath(input, rule.source), rule, ctx, issues);
      setPath(output, rule.target, v);
    }
  }
  return { output, issues };
}

/** Lista todos os caminhos "folha" de um objeto (para sugerir campos de origem). */
export function listPaths(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) {
    return obj.length ? listPaths(obj[0], `${prefix}[]`) : [`${prefix}[]`];
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
      const p = prefix ? (prefix.endsWith('[]') ? `${prefix}.${k}` : `${prefix}.${k}`) : k;
      return listPaths(v, p);
    });
  }
  return prefix ? [prefix] : [];
}
