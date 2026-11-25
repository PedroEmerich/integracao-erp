// Contratos dos conectores. A interface é o ponto de troca:
// hoje as implementações em ./simulated rodam no navegador; um conector real
// (REST, SOAP, CNAB, SFTP...) só precisa implementar a mesma interface.
import type { ErrorInfo, HealthStatus, SheetOrder, StoreOrder } from '../domain/types';

export class ConnectorError extends Error {
  constructor(public info: ErrorInfo) {
    super(info.message);
    this.name = 'ConnectorError';
  }
}

export interface PingResult {
  status: HealthStatus;
  latencyMs: number;
}

export interface ErpOrderResponse {
  C5_NUM: string;
  C5_FILIAL: string;
  status: string;
  mensagem: string;
}

export interface ErpSettlementResponse {
  E1_NUM: string;
  E5_SEQ: string;
  status: string;
  mensagem: string;
}

export interface ErpProductChange {
  B1_COD: string;
  B1_DESC: string;
  B1_UM: string;
  B2_QATU: number;
  DA1_PRCVEN: number;
}

export interface BankReceipt {
  nosso_numero: string;
  valor: number;
  data: string;
  banco: string;
  tipo: string;
  pagador: string;
  documento_pagador: string;
  titulo?: string;
}

export interface TrackingEvent {
  pedido: string;
  nota_fiscal: string;
  transportadora: string;
  codigo_rastreio: string;
  status: string;
  previsao: string;
}

/** ERP (ex.: TOTVS Protheus, Sankhya, Omie, Bling...). */
export interface ErpConnector {
  readonly name: string;
  ping(): Promise<PingResult>;
  createSalesOrder(order: Record<string, unknown>): Promise<ErpOrderResponse>;
  settleReceivable(settlement: Record<string, unknown>): Promise<ErpSettlementResponse>;
  listChangedProducts(limit: number): Promise<ErpProductChange[]>;
}

/** Loja virtual (ex.: VTEX, Shopify, Nuvemshop, Tray...). */
export interface StoreConnector {
  readonly name: string;
  ping(): Promise<PingResult>;
  fetchNewOrders(limit: number): Promise<StoreOrder[]>;
  updateInventory(payload: Record<string, unknown>): Promise<{ id: string; updated_at: string; inventory_quantity: number; price: number }>;
  updateFulfillment(payload: Record<string, unknown>): Promise<{ order_id: string; fulfillment_status: string; updated_at: string }>;
}

/** Banco (ex.: API Pix/extrato, arquivo CNAB 240 de retorno). */
export interface BankConnector {
  readonly name: string;
  ping(): Promise<PingResult>;
  fetchReceipts(limit: number): Promise<BankReceipt[]>;
}

/** Transportadora (ex.: API de rastreio). */
export interface CarrierConnector {
  readonly name: string;
  ping(): Promise<PingResult>;
  fetchTrackingEvents(limit: number): Promise<TrackingEvent[]>;
}

/** Origem de planilhas (ex.: pasta SFTP, e-mail, upload manual). */
export interface SpreadsheetSource {
  readonly name: string;
  ping(): Promise<PingResult>;
  fetchPendingOrders(limit: number): Promise<SheetOrder[]>;
}

export interface Connectors {
  erp: ErpConnector;
  store: StoreConnector;
  bank: BankConnector;
  carrier: CarrierConnector;
  sheets: SpreadsheetSource;
}
