// Conciliação bancária: casa recebimentos do banco com títulos a receber do ERP.
import { onlyDigits } from './documents';
import type { BankTransaction, ErpTitle } from './types';

export interface MatchSuggestion {
  transactionId: string;
  titleId: string;
  score: number; // 0-100
  reasons: string[];
  difference: number; // valor recebido - valor do título
}

export type DivergenceKind = 'valor' | 'sem-titulo' | 'vencido-sem-pagamento' | 'duplicidade';

export interface Divergence {
  kind: DivergenceKind;
  transactionId?: string;
  titleId?: string;
  message: string;
  difference?: number;
}

function normalizeName(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['LTDA', 'EIRELI', 'COMERCIO', 'DE', 'DA', 'DO', 'ME', 'EPP'].includes(w));
}

export function nameSimilarity(a: string, b: string): number {
  const A = new Set(normalizeName(a));
  const B = new Set(normalizeName(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => B.has(w) && inter++);
  return inter / Math.max(A.size, B.size);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

/** Pontua o quanto uma transação corresponde a um título. */
export function scoreMatch(tx: BankTransaction, title: ErpTitle): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (title.nossoNumero && tx.description.includes(title.nossoNumero)) {
    return { score: 100, reasons: ['Nosso número idêntico'] };
  }
  const diff = Math.abs(tx.amount - title.amount);
  if (diff < 0.005) {
    score += 50;
    reasons.push('Valor idêntico');
  } else if (diff / title.amount <= 0.05) {
    score += 25;
    reasons.push(`Valor próximo (dif. ${diff.toFixed(2)})`);
  }
  if (tx.payerDoc && onlyDigits(tx.payerDoc) === onlyDigits(title.cnpj)) {
    score += 30;
    reasons.push('CNPJ do pagador confere');
  } else {
    const sim = nameSimilarity(tx.payerName, title.customerName);
    if (sim >= 0.5) {
      score += Math.round(20 * sim);
      reasons.push('Nome do pagador semelhante');
    }
  }
  const days = daysBetween(tx.date, title.dueDate);
  if (days <= 3) {
    score += 15;
    reasons.push('Pago perto do vencimento');
  } else if (days <= 15) {
    score += 5;
  }
  return { score: Math.min(99, score), reasons };
}

/**
 * Sugere pares transação↔título de forma gulosa (maior pontuação primeiro),
 * sem reutilizar transação nem título.
 */
export function suggestMatches(transactions: BankTransaction[], titles: ErpTitle[], minScore = 70): MatchSuggestion[] {
  const openTx = transactions.filter((t) => !t.reconciledWith);
  const openTitles = titles.filter((t) => t.status === 'aberto');
  const candidates: MatchSuggestion[] = [];
  for (const tx of openTx) {
    for (const ti of openTitles) {
      const { score, reasons } = scoreMatch(tx, ti);
      if (score >= minScore) {
        candidates.push({ transactionId: tx.id, titleId: ti.id, score, reasons, difference: Math.round((tx.amount - ti.amount) * 100) / 100 });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedTx = new Set<string>();
  const usedTi = new Set<string>();
  const result: MatchSuggestion[] = [];
  for (const c of candidates) {
    if (usedTx.has(c.transactionId) || usedTi.has(c.titleId)) continue;
    usedTx.add(c.transactionId);
    usedTi.add(c.titleId);
    result.push(c);
  }
  return result;
}

/** Aponta divergências: diferença de valor, recebimento sem título, título vencido sem pagamento, pagamento de título já baixado. */
export function findDivergences(transactions: BankTransaction[], titles: ErpTitle[], suggestions: MatchSuggestion[], today: Date): Divergence[] {
  const out: Divergence[] = [];
  const matchedTx = new Set(suggestions.map((s) => s.transactionId));
  const matchedTi = new Set(suggestions.map((s) => s.titleId));
  for (const s of suggestions) {
    if (Math.abs(s.difference) >= 0.01) {
      out.push({
        kind: 'valor',
        transactionId: s.transactionId,
        titleId: s.titleId,
        difference: s.difference,
        message: s.difference > 0 ? `Recebido R$ ${s.difference.toFixed(2).replace('.', ',')} a mais (juros/multa?)` : `Recebido R$ ${Math.abs(s.difference).toFixed(2).replace('.', ',')} a menos (desconto não previsto?)`,
      });
    }
  }
  for (const tx of transactions) {
    if (tx.reconciledWith || matchedTx.has(tx.id)) continue;
    const paidTitle = titles.find((t) => t.status !== 'aberto' && (tx.description.includes(t.nossoNumero) || (Math.abs(t.amount - tx.amount) < 0.005 && onlyDigits(t.cnpj) === onlyDigits(tx.payerDoc))));
    if (paidTitle) {
      out.push({ kind: 'duplicidade', transactionId: tx.id, titleId: paidTitle.id, message: `Possível pagamento em duplicidade: o título ${paidTitle.id} já está ${paidTitle.status}` });
    } else {
      out.push({ kind: 'sem-titulo', transactionId: tx.id, message: 'Recebimento sem título correspondente no ERP' });
    }
  }
  for (const ti of titles) {
    if (ti.status !== 'aberto' || matchedTi.has(ti.id)) continue;
    if (new Date(ti.dueDate).getTime() < today.getTime() - 86400000) {
      out.push({ kind: 'vencido-sem-pagamento', titleId: ti.id, message: `Título vencido em ${ti.dueDate.split('-').reverse().join('/')} sem recebimento identificado` });
    }
  }
  return out;
}
