// Conectores simulados: rodam 100% no navegador, com latência, falhas ocasionais
// e respostas no formato dos sistemas reais.
import { makeError } from '../../domain/errors';
import type { Customer, ErpProduct, ErpTitle, HealthStatus, IntegrationId } from '../../domain/types';
import { makeBankReceipt, makeSheetOrder, makeStockUpdate, makeStoreOrder, makeTracking, Rng, type OrderFault } from '../../data/generators';
import { ConnectorError, type Connectors, type PingResult } from '../types';

/** O que os simuladores precisam ler/gravar do "mundo" fictício (fornecido pelo store). */
export interface SimulationBackend {
  getCatalog(): Record<string, ErpProduct>;
  reserveStock(items: { code: string; qty: number }[]): void;
  getTitles(): ErpTitle[];
  settleTitle(id: string, at: string): void;
  getCustomers(): Customer[];
  nextErpNumber(): string;
  nextStoreOrderNumber(): number;
  nextSheetOrderNumber(): string;
  faultRate(): number; // probabilidade de erro de dados nos registros gerados
  instability(): number; // probabilidade de timeout/indisponibilidade
  health(id: IntegrationId): HealthStatus;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createSimulatedConnectors(backend: SimulationBackend): Connectors {
  const rng = new Rng();

  async function latency(id: IntegrationId, base: [number, number] = [180, 650]) {
    const h = backend.health(id);
    const [a, b] = h === 'slow' ? [base[0] * 4, base[1] * 4] : base;
    const ms = rng.int(a, b);
    await sleep(ms);
    return ms;
  }

  function ping(_id: IntegrationId, base: [number, number]): () => Promise<PingResult> {
    return async () => {
      const ms = rng.int(base[0], base[1]);
      // Instabilidade aleatória para o painel "se mexer".
      const roll = rng.next();
      const unstable = backend.instability();
      let status: HealthStatus = 'online';
      let latencyMs = ms;
      if (roll < unstable * 0.15) {
        status = 'down';
        latencyMs = 0;
      } else if (roll < unstable * 1.2) {
        status = 'slow';
        latencyMs = ms * 5;
      }
      await sleep(Math.min(latencyMs, 400));
      return { status, latencyMs };
    };
  }

  function pickFault(): OrderFault {
    if (!rng.chance(backend.faultRate())) return null;
    return rng.pick(['cnpj', 'sku', 'sku', 'stock'] as const);
  }

  return {
    erp: {
      name: 'ERP Nortex (simulado · API REST estilo Protheus)',
      ping: ping('store-erp-orders', [90, 260]),
      async createSalesOrder(order) {
        await latency('store-erp-orders', [350, 1100]);
        if (backend.health('store-erp-orders') === 'down' || rng.chance(backend.instability())) {
          throw new ConnectorError(makeError('ERP_TIMEOUT', 'O ERP não respondeu em 30 s (HTTP 504 Gateway Timeout).'));
        }
        const catalog = backend.getCatalog();
        const itens = (order.itens as { C6_PRODUTO: string; C6_QTDVEN: number }[]) ?? [];
        const short = itens.find((i) => (catalog[i.C6_PRODUTO]?.stock ?? 0) < Number(i.C6_QTDVEN));
        if (short) {
          const p = catalog[short.C6_PRODUTO];
          throw new ConnectorError(
            makeError('ESTOQUE_INSUFICIENTE', `Produto ${p.code} (${p.description}): solicitado ${short.C6_QTDVEN} ${p.unit}, disponível ${p.stock} ${p.unit}.`, {
              field: 'items[].quantity',
              value: p.code,
            }),
          );
        }
        backend.reserveStock(itens.map((i) => ({ code: i.C6_PRODUTO, qty: Number(i.C6_QTDVEN) })));
        const num = backend.nextErpNumber();
        return { C5_NUM: num, C5_FILIAL: '0101', status: 'INCLUIDO', mensagem: `Pedido de venda ${num} incluído com sucesso na filial 0101.` };
      },
      async settleReceivable(s) {
        await latency('bank-recon', [300, 900]);
        if (rng.chance(backend.instability() * 0.6)) {
          throw new ConnectorError(makeError('ERP_TIMEOUT', 'O ERP não respondeu em 30 s ao registrar a baixa (HTTP 504).'));
        }
        const nn = String(s.E1_NUMBCO ?? '');
        const title = backend.getTitles().find((t) => t.nossoNumero === nn);
        if (!title) {
          throw new ConnectorError(makeError('TITULO_NAO_ENCONTRADO', `Nenhum título com nosso número ${nn} na carteira.`, { field: 'nosso_numero', value: nn, stage: 'sent' }));
        }
        if (title.status === 'baixado') {
          throw new ConnectorError(
            makeError('TITULO_JA_BAIXADO', `O título ${title.id} (${title.customerName}) já foi baixado em ${title.paidAt?.slice(0, 10).split('-').reverse().join('/') ?? 'data anterior'}.`, {
              value: title.id,
            }),
          );
        }
        backend.settleTitle(title.id, new Date().toISOString());
        return { E1_NUM: title.id, E5_SEQ: String(rng.int(1, 99)).padStart(2, '0'), status: 'BAIXADO', mensagem: `Título ${title.id} baixado por recebimento bancário.` };
      },
      async listChangedProducts(limit) {
        await latency('erp-store-stock', [200, 600]);
        const products = Object.values(backend.getCatalog()).filter((p) => p.code !== '0020463');
        return Array.from({ length: limit }, () => makeStockUpdate(rng, rng.pick(products)));
      },
    },
    store: {
      name: 'Loja virtual B2B (simulada · API REST)',
      ping: ping('erp-store-stock', [120, 380]),
      async fetchNewOrders(limit) {
        await latency('store-erp-orders', [200, 500]);
        const customers = backend.getCustomers();
        return Array.from({ length: limit }, () => makeStoreOrder(rng, customers, backend.nextStoreOrderNumber(), new Date(), pickFault()));
      },
      async updateInventory(payload) {
        await latency('erp-store-stock', [150, 500]);
        if (rng.chance(backend.instability() * 0.7)) {
          throw new ConnectorError(makeError('LOJA_INDISPONIVEL', 'A API da loja respondeu HTTP 503 (limite de 60 requisições/min atingido).'));
        }
        return { id: `prd_${rng.int(10000, 99999)}`, updated_at: new Date().toISOString(), inventory_quantity: Number(payload.inventory_quantity), price: Number(payload.price) };
      },
      async updateFulfillment(payload) {
        await latency('carrier-tracking', [150, 450]);
        if (backend.health('carrier-tracking') === 'down' || rng.chance(backend.instability() * 0.5)) {
          throw new ConnectorError(makeError('TRANSPORTADORA_TIMEOUT', 'A consulta à API da transportadora excedeu 20 s.'));
        }
        return { order_id: `NX-${payload.order_number}`, fulfillment_status: String(payload.fulfillment_status), updated_at: new Date().toISOString() };
      },
    },
    bank: {
      name: 'Banco (simulado · API de extrato/Pix)',
      ping: ping('bank-recon', [140, 420]),
      async fetchReceipts(limit) {
        await latency('bank-recon', [300, 700]);
        const open = backend.getTitles().filter((t) => t.status === 'aberto');
        const paid = backend.getTitles().filter((t) => t.status === 'baixado');
        return Array.from({ length: Math.min(limit, open.length) }, (_, i) => {
          const dup = rng.chance(backend.faultRate() * 0.6) && paid.length;
          const t = dup ? rng.pick(paid) : open[(i * 7 + rng.int(0, open.length - 1)) % open.length];
          return makeBankReceipt(t, new Date(), rng.pick(['BOLETO', 'BOLETO', 'PIX'] as const));
        });
      },
    },
    carrier: {
      name: 'Transportadoras (simulado · Jadlog, Correios, frota própria)',
      ping: ping('carrier-tracking', [250, 700]),
      async fetchTrackingEvents(limit) {
        await latency('carrier-tracking', [300, 800]);
        return Array.from({ length: limit }, () => makeTracking(rng, rng.int(10180, 10400), new Date(), rng.chance(backend.faultRate() * 0.4)));
      },
    },
    sheets: {
      name: 'Pasta de planilhas (simulada · SFTP)',
      ping: ping('sheet-erp', [60, 160]),
      async fetchPendingOrders(limit) {
        await latency('sheet-erp', [200, 400]);
        const customers = backend.getCustomers();
        return Array.from({ length: limit }, () => makeSheetOrder(rng, customers, backend.nextSheetOrderNumber(), new Date(), rng.chance(backend.faultRate() * 0.5) ? 'cnpj' : null));
      },
    },
  };
}
