// Registro dos conectores e roteamento por integração.
// Para usar um ERP real, crie uma classe que implemente ErpConnector
// (ver ./types.ts) e troque-a aqui — o restante do Hub não muda.
import type { IntegrationId } from '../domain/types';
import type { Connectors, PingResult } from './types';

export * from './types';

/** Busca registros novos na origem da integração ("Sincronizar agora"). */
export async function fetchFromSource(c: Connectors, id: IntegrationId, limit: number): Promise<unknown[]> {
  switch (id) {
    case 'store-erp-orders':
      return c.store.fetchNewOrders(limit);
    case 'erp-store-stock':
      return c.erp.listChangedProducts(limit);
    case 'sheet-erp':
      return c.sheets.fetchPendingOrders(Math.max(1, Math.round(limit / 4)));
    case 'bank-recon':
      return c.bank.fetchReceipts(limit);
    case 'carrier-tracking':
      return c.carrier.fetchTrackingEvents(limit);
  }
}

/** Envia o payload já transformado para o sistema de destino. */
export async function sendToTarget(c: Connectors, id: IntegrationId, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (id) {
    case 'store-erp-orders':
    case 'sheet-erp':
      return { ...(await c.erp.createSalesOrder(payload)) };
    case 'erp-store-stock':
      return { ...(await c.store.updateInventory(payload)) };
    case 'bank-recon':
      return { ...(await c.erp.settleReceivable(payload)) };
    case 'carrier-tracking':
      return { ...(await c.store.updateFulfillment(payload)) };
  }
}

export function pingIntegration(c: Connectors, id: IntegrationId): Promise<PingResult> {
  switch (id) {
    case 'store-erp-orders':
      return c.erp.ping();
    case 'erp-store-stock':
      return c.store.ping();
    case 'sheet-erp':
      return c.sheets.ping();
    case 'bank-recon':
      return c.bank.ping();
    case 'carrier-tracking':
      return c.carrier.ping();
  }
}

export function confirmationMessage(id: IntegrationId, response: Record<string, unknown>): string {
  switch (id) {
    case 'store-erp-orders':
    case 'sheet-erp':
      return `ERP confirmou: pedido de venda ${response.C5_NUM} incluído (filial ${response.C5_FILIAL}).`;
    case 'erp-store-stock':
      return `Loja confirmou: saldo ${response.inventory_quantity} e preço atualizados.`;
    case 'bank-recon':
      return `ERP confirmou: título ${response.E1_NUM} baixado (sequência ${response.E5_SEQ}).`;
    case 'carrier-tracking':
      return `Loja confirmou: entrega do pedido ${response.order_id} atualizada para "${response.fulfillment_status}".`;
  }
}

export function targetName(id: IntegrationId): string {
  return id === 'erp-store-stock' || id === 'carrier-tracking' ? 'loja virtual' : 'ERP';
}
