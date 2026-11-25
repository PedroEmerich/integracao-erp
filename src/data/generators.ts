// Geradores de registros fictícios (usados nos dados de exemplo e no simulador ao vivo).
import { onlyDigits } from '../domain/documents';
import type { Customer, ErpProduct, ErpTitle, SheetOrder, StoreOrder } from '../domain/types';
import { STORE_PRODUCTS, UNMAPPED_SKUS } from './catalog';

export class Rng {
  private s: number;
  constructor(seed = Date.now()) {
    this.s = seed >>> 0;
  }
  next(): number {
    // mulberry32
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}

export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Altera o último dígito do CNPJ para torná-lo inválido. */
export function corruptCnpj(cnpj: string): string {
  const last = Number(cnpj.slice(-1));
  return cnpj.slice(0, -1) + String((last + 3) % 10);
}

function qtyFor(unit: string, rng: Rng): number {
  switch (unit) {
    case 'RL':
      return rng.int(1, 8);
    case 'M':
      return rng.int(5, 40) * 10;
    case 'CX':
    case 'PCT':
      return rng.int(1, 6);
    default:
      return rng.int(1, 12) * 5;
  }
}

export type OrderFault = 'cnpj' | 'sku' | 'stock' | null;

export function makeStoreOrder(rng: Rng, customers: Customer[], number: number, createdAt: Date, fault: OrderFault = null): StoreOrder {
  const c = rng.pick(customers);
  const pool = STORE_PRODUCTS.filter((p) => p.sku !== 'DR-4P-63A');
  const n = rng.int(1, 4);
  const chosen = new Set<string>();
  const items: StoreOrder['items'] = [];
  while (items.length < n) {
    const p = rng.pick(pool);
    if (chosen.has(p.sku)) continue;
    chosen.add(p.sku);
    items.push({ sku: p.sku, title: p.title, quantity: qtyFor(p.storeUnit, rng), unit: p.storeUnit, unit_price: p.price });
  }
  if (fault === 'sku') {
    const u = rng.pick(UNMAPPED_SKUS);
    items[0] = { sku: u.sku, title: u.title, quantity: rng.int(2, 10) * 5, unit: u.unit, unit_price: u.price };
  }
  if (fault === 'stock') {
    items.push({ sku: 'DR-4P-63A', title: 'Interruptor diferencial residual DR 4P 63 A 30 mA', quantity: rng.int(10, 16), unit: 'UN', unit_price: 289.0 });
  }
  const itemsTotal = round2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
  const method = rng.pick(['boleto', 'boleto', 'pix', 'cartao'] as const);
  const shipping = itemsTotal > 1500 ? 0 : round2(rng.float(38, 120));
  const discount = method === 'pix' ? round2(itemsTotal * 0.03) : 0;
  const [street, num] = c.street.split(', ');
  return {
    id: `NX-${number}`,
    number,
    created_at: createdAt.toISOString(),
    channel: 'Loja virtual B2B',
    customer: {
      name: c.name,
      document: fault === 'cnpj' ? corruptCnpj(c.cnpj) : c.cnpj,
      email: c.email,
      phone: c.phone,
    },
    shipping_address: { street, number: num ?? 's/n', district: c.district, city: c.city, state: c.state, zip: c.zip },
    items,
    payment: { method, installments: method === 'cartao' ? rng.int(1, 6) : 1 },
    totals: { items: itemsTotal, shipping, discount, total: round2(itemsTotal + shipping - discount) },
  };
}

export function makeSheetOrder(rng: Rng, customers: Customer[], pedido: string, date: Date, fault: 'cnpj' | null = null): SheetOrder {
  const c = rng.pick(customers);
  const n = rng.int(2, 5);
  const used = new Set<string>();
  const itens: SheetOrder['itens'] = [];
  while (itens.length < n) {
    const p = rng.pick(STORE_PRODUCTS.filter((x) => x.sku !== 'DR-4P-63A'));
    if (used.has(p.sku)) continue;
    used.add(p.sku);
    itens.push({ sku: p.sku, descricao: p.title, quantidade: qtyFor(p.storeUnit, rng), unidade: p.storeUnit, preco_unitario: round2(p.price * 0.95) });
  }
  return {
    pedido,
    data: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    cnpj_cliente: fault === 'cnpj' ? corruptCnpj(c.cnpj) : c.cnpj,
    razao_social: c.name,
    cond_pagamento: rng.pick(['028', '3060', '001']),
    itens,
    linhas: itens.map((_, i) => i + 2),
  };
}

export function makeStockUpdate(rng: Rng, product: ErpProduct) {
  const delta = rng.int(-12, 30);
  return {
    B1_COD: product.code,
    B1_DESC: product.description,
    B1_UM: product.unit,
    B2_QATU: Math.max(0, product.stock + delta),
    DA1_PRCVEN: rng.chance(0.15) ? round2(product.price * rng.float(0.97, 1.06)) : product.price,
  };
}

const CARRIERS = ['Jadlog', 'Correios', 'Nortex Frota Própria'];

export function trackingCode(rng: Rng, carrier: string): string {
  if (carrier === 'Jadlog') return `JDL${String(rng.int(1000000000, 9999999999))}`;
  if (carrier === 'Correios') return `${rng.pick(['QB', 'OJ', 'PX'])}${String(rng.int(100000000, 999999999))}BR`;
  return `NTX-${String(rng.int(10000000, 99999999))}`;
}

export function makeTracking(rng: Rng, orderNumber: number, at: Date, invalid = false) {
  const carrier = rng.pick(CARRIERS);
  const eta = new Date(at.getTime() + rng.int(1, 5) * 86400000);
  return {
    pedido: `#${orderNumber}`,
    nota_fiscal: `NF ${rng.int(45100, 46999)}`,
    transportadora: carrier,
    codigo_rastreio: invalid ? `JD${rng.int(1000, 9999)}-X` : trackingCode(rng, carrier),
    status: rng.pick(['Postado', 'Em trânsito', 'Em trânsito', 'Saiu para entrega', 'Entregue']),
    previsao: eta.toISOString().slice(0, 10),
  };
}

export function makeBankReceipt(title: ErpTitle, date: Date, tipo: 'BOLETO' | 'PIX' | 'TED' = 'BOLETO') {
  return {
    nosso_numero: title.nossoNumero,
    valor: title.amount,
    data: date.toISOString().slice(0, 10),
    banco: '341',
    tipo,
    pagador: title.customerName,
    documento_pagador: onlyDigits(title.cnpj),
    titulo: title.id,
  };
}
