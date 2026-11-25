// Catálogo de erros, explicados em português, e política de retentativa.
import type { ErrorCode, ErrorInfo, Stage } from './types';

interface ErrorDef {
  title: string;
  hint: string;
  transient: boolean;
  stage: Stage;
}

export const ERROR_CATALOG: Record<ErrorCode, ErrorDef> = {
  CNPJ_INVALIDO: {
    title: 'CNPJ/CPF inválido',
    hint: 'Os dígitos verificadores não conferem. Confira o documento com o cliente, corrija aqui e reprocesse. O ERP recusaria o cadastro do cliente.',
    transient: false,
    stage: 'validated',
  },
  PRODUTO_SEM_CADASTRO: {
    title: 'Produto sem cadastro no ERP',
    hint: 'O SKU da loja não tem equivalente no ERP. Vincule o SKU a um código do ERP (a tabela de equivalência é atualizada) ou corrija o SKU no pedido.',
    transient: false,
    stage: 'transformed',
  },
  ESTOQUE_INSUFICIENTE: {
    title: 'Estoque insuficiente',
    hint: 'O ERP não tem saldo para atender a quantidade. Ajuste a quantidade, aguarde a reposição ou fature parcialmente.',
    transient: false,
    stage: 'sent',
  },
  ERP_TIMEOUT: {
    title: 'Tempo de resposta do ERP esgotado',
    hint: 'O ERP não respondeu em 30 s. Costuma ser instabilidade momentânea: o Hub tenta de novo sozinho com espera crescente. Se persistir, reprocesse mais tarde.',
    transient: true,
    stage: 'sent',
  },
  TITULO_JA_BAIXADO: {
    title: 'Título já baixado',
    hint: 'Este título já foi liquidado no ERP. Pode ser pagamento em duplicidade: confirme com o financeiro e ignore com justificativa ou gere um crédito ao cliente.',
    transient: false,
    stage: 'sent',
  },
  TITULO_NAO_ENCONTRADO: {
    title: 'Título não encontrado',
    hint: 'O nosso número do recebimento não corresponde a nenhum título em aberto. Use a tela de Conciliação para vincular manualmente.',
    transient: false,
    stage: 'transformed',
  },
  CAMPO_OBRIGATORIO: {
    title: 'Campo obrigatório ausente',
    hint: 'Um campo exigido pelo destino veio vazio. Complete o dado e reprocesse, ou revise o mapeamento de campos.',
    transient: false,
    stage: 'transformed',
  },
  LOJA_INDISPONIVEL: {
    title: 'Loja virtual indisponível (HTTP 503)',
    hint: 'A API da loja recusou a chamada temporariamente (limite de requisições ou manutenção). O Hub tenta novamente com espera crescente.',
    transient: true,
    stage: 'sent',
  },
  RASTREIO_INVALIDO: {
    title: 'Código de rastreio inválido',
    hint: 'O código informado pela transportadora não segue o padrão esperado. Confirme o código no portal da transportadora e corrija.',
    transient: false,
    stage: 'validated',
  },
  TRANSPORTADORA_TIMEOUT: {
    title: 'Transportadora sem resposta',
    hint: 'A API da transportadora demorou demais para responder. O Hub tenta novamente com espera crescente.',
    transient: true,
    stage: 'sent',
  },
};

export function makeError(code: ErrorCode, message: string, extra: Partial<ErrorInfo> = {}): ErrorInfo {
  const def = ERROR_CATALOG[code];
  return { code, title: def.title, hint: def.hint, transient: def.transient, stage: def.stage, message, ...extra };
}

export const RETRY_POLICY = {
  maxAttempts: 4,
  baseDelayMs: 2000, // na demonstração usamos segundos; em produção seriam minutos
  factor: 2,
  maxDelayMs: 60000,
};

/** Espera antes da próxima tentativa (backoff exponencial): 2s, 4s, 8s... */
export function backoffDelay(attempt: number, policy = RETRY_POLICY): number {
  const n = Math.max(1, attempt);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * Math.pow(policy.factor, n - 1));
}

/** Decide se o job deve ser retentado automaticamente após a tentativa `attempt`. */
export function shouldRetry(error: ErrorInfo, attempt: number, maxAttempts = RETRY_POLICY.maxAttempts): boolean {
  return error.transient && attempt < maxAttempts;
}
