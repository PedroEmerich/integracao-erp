// Pipeline de cada item: recebido → validado → transformado → enviado → confirmado.
import { isValidDocument, onlyDigits } from './documents';
import { makeError } from './errors';
import { applyMapping, getPath, type MappingIssue } from './mapping';
import type { ErpProduct, ErrorInfo, IntegrationId, LookupTable, MappingProfile, Stage } from './types';

export interface PrepareContext {
  profile: MappingProfile;
  tables: Record<string, LookupTable>;
  catalog: Record<string, ErpProduct>;
}

export type PrepareResult =
  | { ok: true; output: Record<string, unknown>; warnings: MappingIssue[] }
  | { ok: false; stage: Stage; error: ErrorInfo; output?: Record<string, unknown> };

const TRACKING_RE = /^([A-Z]{2}\d{9}BR|JDL\d{10}|NTX-\d{8})$/;

/** Validação de entrada, específica de cada integração. */
export function validateInput(integrationId: IntegrationId, input: unknown): ErrorInfo | null {
  const get = (p: string) => getPath(input, p);
  switch (integrationId) {
    case 'store-erp-orders': {
      const doc = String(get('customer.document') ?? '');
      if (!isValidDocument(doc)) {
        return makeError('CNPJ_INVALIDO', `O documento ${doc || '(vazio)'} do cliente "${get('customer.name') ?? ''}" não é um CNPJ/CPF válido.`, {
          field: 'customer.document',
          value: doc,
        });
      }
      const items = get('items');
      if (!Array.isArray(items) || items.length === 0) {
        return makeError('CAMPO_OBRIGATORIO', 'O pedido chegou sem itens.', { field: 'items', stage: 'validated' });
      }
      return null;
    }
    case 'sheet-erp': {
      const doc = String(get('cnpj_cliente') ?? '');
      if (!isValidDocument(doc)) {
        return makeError('CNPJ_INVALIDO', `O CNPJ ${doc || '(vazio)'} de "${get('razao_social') ?? ''}" não é válido.`, { field: 'cnpj_cliente', value: doc });
      }
      return null;
    }
    case 'carrier-tracking': {
      const code = String(get('codigo_rastreio') ?? '');
      if (!TRACKING_RE.test(code)) {
        return makeError('RASTREIO_INVALIDO', `O código "${code}" não segue o padrão da transportadora.`, { field: 'codigo_rastreio', value: code });
      }
      return null;
    }
    case 'bank-recon': {
      if (!get('nosso_numero')) {
        return makeError('CAMPO_OBRIGATORIO', 'Recebimento sem "nosso número".', { field: 'nosso_numero', stage: 'validated' });
      }
      return null;
    }
    default:
      return null;
  }
}

/** Valida + transforma (de/para) + checagens que dependem do cadastro do ERP. */
export function prepareJob(integrationId: IntegrationId, input: unknown, ctx: PrepareContext): PrepareResult {
  const vErr = validateInput(integrationId, input);
  if (vErr) return { ok: false, stage: 'validated', error: vErr };

  const { output, issues } = applyMapping(input, ctx.profile.rules, { tables: ctx.tables });

  // Produto sem equivalência ou sem cadastro no ERP.
  if (integrationId === 'store-erp-orders' || integrationId === 'sheet-erp') {
    const miss = issues.find((i) => i.code === 'LOOKUP_MISS' && i.table === 'sku-erp');
    const itens = (output.itens as Record<string, unknown>[] | undefined) ?? [];
    const notInCatalog = itens.find((it) => !ctx.catalog[String(it.C6_PRODUTO ?? '')]);
    if (miss || notInCatalog) {
      const sku = miss?.value ?? String(notInCatalog?.C6_PRODUTO ?? '');
      return {
        ok: false,
        stage: 'transformed',
        output,
        error: makeError('PRODUTO_SEM_CADASTRO', `O SKU "${sku}" não tem produto correspondente no ERP.`, {
          field: integrationId === 'sheet-erp' ? 'itens[].sku' : 'items[].sku',
          value: sku,
        }),
      };
    }
  }

  const blocking = issues.find((i) => i.code === 'REQUIRED' || i.code === 'INVALID_NUMBER' || i.code === 'INVALID_DATE' || i.code === 'UNIT_UNKNOWN');
  if (blocking) {
    return { ok: false, stage: 'transformed', output, error: makeError('CAMPO_OBRIGATORIO', blocking.message, { field: blocking.target, value: blocking.value }) };
  }

  return { ok: true, output, warnings: issues };
}

/** Resumo legível do item para a fila. */
export function describeInput(integrationId: IntegrationId, input: any): { reference: string; description: string; amount?: number } {
  switch (integrationId) {
    case 'store-erp-orders':
      return { reference: `#${input.number}`, description: input.customer?.name ?? '', amount: input.totals?.total };
    case 'sheet-erp':
      return {
        reference: String(input.pedido),
        description: input.razao_social ?? '',
        amount: (input.itens ?? []).reduce((s: number, i: any) => s + Number(i.quantidade) * Number(i.preco_unitario), 0),
      };
    case 'erp-store-stock':
      return { reference: String(input.B1_COD), description: `${input.B1_DESC} · saldo ${input.B2_QATU}`, amount: input.DA1_PRCVEN };
    case 'bank-recon':
      return { reference: String(input.nosso_numero), description: `${input.pagador} · ${input.tipo}`, amount: input.valor };
    case 'carrier-tracking':
      return { reference: String(input.pedido), description: `${input.transportadora} · ${input.codigo_rastreio}` };
  }
}

export function sameDoc(a: string, b: string): boolean {
  return onlyDigits(a) === onlyDigits(b);
}
