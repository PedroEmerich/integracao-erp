// Dados mestres fictícios da Nortex Distribuidora (atacado de materiais elétricos, São Paulo/SP).
import { makeCnpj } from '../domain/documents';
import type { Customer, DemoUser, ErpProduct, LookupTable, MappingProfile } from '../domain/types';

export const COMPANY = {
  name: 'Nortex Distribuidora',
  legalName: 'Nortex Distribuidora de Materiais Elétricos Ltda',
  cnpj: makeCnpj('41382907'),
  city: 'São Paulo/SP',
};

export const DEMO_USERS: (DemoUser & { password: string; title: string })[] = [
  { id: 'u-admin', name: 'Ana Ribeiro', email: 'ana.ribeiro@nortex.demo', password: 'demo123', role: 'admin', initials: 'AR', title: 'Coordenadora de TI' },
  { id: 'u-oper', name: 'Carlos Mendes', email: 'carlos.mendes@nortex.demo', password: 'demo123', role: 'operator', initials: 'CM', title: 'Analista de Operações' },
];

/** [sku da loja, código ERP, descrição, UM loja, UM ERP, estoque, preço, NCM] */
const PRODUCTS: [string, string, string, string, string, number, number, string][] = [
  ['CAB-FLEX-2.5-AZ', '0010023', 'Cabo flexível 2,5 mm² 750 V azul — rolo 100 m', 'RL', 'RL', 184, 289.9, '85444900'],
  ['CAB-FLEX-4.0-PR', '0010041', 'Cabo flexível 4,0 mm² 750 V preto — rolo 100 m', 'RL', 'RL', 96, 459.0, '85444900'],
  ['CAB-FLEX-6.0-VM', '0010062', 'Cabo flexível 6,0 mm² 750 V vermelho — rolo 100 m', 'RL', 'RL', 41, 689.0, '85444900'],
  ['CAB-PP-3X1.5', '0010115', 'Cabo PP 3 × 1,5 mm² 500 V (metro)', 'M', 'MT', 3200, 7.9, '85444900'],
  ['DISJ-MONO-16A', '0020016', 'Disjuntor monopolar 16 A curva C DIN', 'UN', 'PC', 640, 14.5, '85362000'],
  ['DISJ-MONO-25A', '0020025', 'Disjuntor monopolar 25 A curva C DIN', 'UN', 'PC', 512, 14.9, '85362000'],
  ['DISJ-BI-40A', '0020140', 'Disjuntor bipolar 40 A curva C DIN', 'UN', 'PC', 188, 62.0, '85362000'],
  ['DISJ-TRI-63A', '0020363', 'Disjuntor tripolar 63 A curva C DIN', 'UN', 'PC', 74, 139.0, '85362000'],
  ['DR-4P-63A', '0020463', 'Interruptor diferencial residual DR 4P 63 A 30 mA', 'UN', 'PC', 3, 289.0, '85363000'],
  ['DPS-275V-20KA', '0020520', 'Dispositivo de proteção contra surtos 275 V 20 kA', 'UN', 'PC', 230, 49.9, '85363000'],
  ['TOM-2P+T-10A', '0030210', 'Tomada 2P+T 10 A branca com placa 4×2', 'UN', 'PC', 1450, 9.8, '85366900'],
  ['TOM-2P+T-20A', '0030220', 'Tomada 2P+T 20 A branca com placa 4×2', 'UN', 'PC', 980, 11.4, '85366900'],
  ['INT-SIMP-10A', '0030301', 'Interruptor simples 10 A branco com placa 4×2', 'UN', 'PC', 1210, 8.9, '85365090'],
  ['CX-4X2-PVC', '0030402', 'Caixa de luz 4×2 PVC amarela — caixa c/ 50', 'CX', 'CX', 120, 42.0, '39259090'],
  ['ELET-CORR-25', '0040025', 'Eletroduto corrugado 25 mm amarelo — rolo 50 m', 'RL', 'RL', 210, 79.0, '39173900'],
  ['ELET-RIG-3/4', '0040034', 'Eletroduto rígido roscável 3/4" — barra 3 m', 'UN', 'PC', 380, 18.5, '39172300'],
  ['LED-BULBO-9W', '0050009', 'Lâmpada LED bulbo 9 W 6500 K E27', 'UN', 'PC', 2600, 6.9, '85395000'],
  ['LED-TUBO-18W', '0050018', 'Lâmpada LED tubular T8 18 W 120 cm', 'UN', 'PC', 840, 15.9, '85395000'],
  ['REF-LED-50W', '0050150', 'Refletor LED 50 W IP65 6500 K', 'UN', 'PC', 160, 69.9, '94054200'],
  ['PAINEL-LED-24W', '0050224', 'Painel LED de embutir 24 W quadrado 30 × 30 cm', 'UN', 'PC', 290, 44.9, '94054200'],
  ['QD-12-DIN', '0060012', 'Quadro de distribuição de embutir 12 DIN', 'UN', 'PC', 85, 79.0, '85371090'],
  ['QD-24-DIN', '0060024', 'Quadro de distribuição de embutir 24 DIN', 'UN', 'PC', 44, 149.0, '85371090'],
  ['FITA-ISOL-20M', '0070020', 'Fita isolante 19 mm × 20 m preta', 'UN', 'PC', 1900, 7.5, '39191010'],
  ['TERM-OLHAL-6', '0070106', 'Terminal olhal 6 mm² — pacote c/ 100', 'PCT', 'PT', 140, 29.0, '85369040'],
  ['CONT-3P-25A', '0080025', 'Contator tripolar 25 A bobina 220 V', 'UN', 'PC', 58, 189.0, '85364900'],
  ['RELE-TERM-25A', '0080125', 'Relé térmico de sobrecarga 17–25 A', 'UN', 'PC', 47, 159.0, '85364900'],
  ['SENS-PRES-360', '0090360', 'Sensor de presença de teto 360° bivolt', 'UN', 'PC', 310, 39.9, '85365090'],
  ['HASTE-ATERR-2.4', '0090524', 'Haste de aterramento cobreada 5/8" × 2,4 m', 'UN', 'PC', 130, 64.0, '85389090'],
];

/** SKUs que existem na loja mas ainda não foram cadastrados no ERP (geram erro). */
export const UNMAPPED_SKUS: { sku: string; title: string; unit: string; price: number }[] = [
  { sku: 'LED-SPOT-7W-NV', title: 'Spot LED 7 W embutir redondo (novo)', unit: 'UN', price: 24.9 },
  { sku: 'CAB-FLEX-10-AZ', title: 'Cabo flexível 10 mm² azul — rolo 100 m', unit: 'RL', price: 1129.0 },
];

export interface StoreProductInfo {
  sku: string;
  erpCode: string;
  title: string;
  storeUnit: string;
  price: number;
}

export const STORE_PRODUCTS: StoreProductInfo[] = PRODUCTS.map(([sku, erpCode, title, storeUnit, , , price]) => ({ sku, erpCode, title, storeUnit, price }));

export function initialCatalog(): Record<string, ErpProduct> {
  const out: Record<string, ErpProduct> = {};
  PRODUCTS.forEach(([, code, description, , unit, stock, price, ncm]) => {
    out[code] = { code, description: description.toUpperCase(), unit, stock, price, cost: Math.round(price * 0.62 * 100) / 100, ncm };
  });
  return out;
}

export function initialLookupTables(): Record<string, LookupTable> {
  const sku: Record<string, string> = {};
  PRODUCTS.forEach(([s, c]) => (sku[s] = c));
  return {
    'sku-erp': { id: 'sku-erp', name: 'SKU da loja → Código do produto no ERP', description: 'Equivalência de códigos de produto (B1_COD).', entries: sku },
    'cond-pagto': {
      id: 'cond-pagto',
      name: 'Forma de pagamento → Condição de pagamento',
      description: 'Converte a forma de pagamento da loja na condição (E4_CODIGO) do ERP.',
      entries: { boleto: '028', pix: '001', cartao: '030' },
    },
    'status-rastreio': {
      id: 'status-rastreio',
      name: 'Status da transportadora → Status na loja',
      description: 'Traduz o status do rastreio para o status de entrega da loja.',
      entries: { Postado: 'shipped', 'Em trânsito': 'in_transit', 'Saiu para entrega': 'out_for_delivery', Entregue: 'delivered' },
    },
  };
}

const CUSTOMER_BASE: [string, string, string, string][] = [
  ['Eletro Paulista Instalações Ltda', 'São Paulo', 'Rua Domingos de Morais', 'Vila Mariana'],
  ['Construtora Horizonte Azul Ltda', 'São Paulo', 'Av. Engenheiro Luís Carlos Berrini', 'Cidade Monções'],
  ['Casa do Eletricista Mooca Ltda', 'São Paulo', 'Rua da Mooca', 'Mooca'],
  ['Iluminar Projetos Elétricos Eireli', 'Santo André', 'Av. Industrial', 'Jardim'],
  ['Vila Mariana Materiais de Construção Ltda', 'São Paulo', 'Rua Vergueiro', 'Vila Mariana'],
  ['Grupo Alvorada Manutenção Predial Ltda', 'São Paulo', 'Rua Augusta', 'Consolação'],
  ['Santo Amaro Elétrica e Hidráulica Ltda', 'São Paulo', 'Av. Santo Amaro', 'Santo Amaro'],
  ['Tecnopower Automação Industrial Ltda', 'São Bernardo do Campo', 'Av. Pereira Barreto', 'Baeta Neves'],
  ['Engelux Engenharia Ltda', 'Campinas', 'Av. Norte-Sul', 'Cambuí'],
  ['Casa & Obra Guarulhos Ltda', 'Guarulhos', 'Av. Tiradentes', 'Centro'],
  ['ABC Instaladora Elétrica Ltda', 'São Caetano do Sul', 'Rua Manoel Coelho', 'Centro'],
  ['Solaris Energia Fotovoltaica Ltda', 'Sorocaba', 'Av. São Paulo', 'Além Ponte'],
  ['Pinheiros Reformas e Acabamentos Ltda', 'São Paulo', 'Rua dos Pinheiros', 'Pinheiros'],
  ['Indústria Têxtil Brás Ltda', 'São Paulo', 'Rua do Gasômetro', 'Brás'],
  ['Mercado Central Osasco Ltda', 'Osasco', 'Av. dos Autonomistas', 'Vila Yara'],
  ['Elétrica Ponto Certo Campinas Ltda', 'Campinas', 'Rua Barão de Jaguara', 'Centro'],
  ['Metalúrgica Ipiranga S.A.', 'São Paulo', 'Av. Nazaré', 'Ipiranga'],
  ['Hospital Vida Plena Ltda', 'São Paulo', 'Rua Tuiuti', 'Tatuapé'],
  ['Colégio Nova Geração Ltda', 'Mogi das Cruzes', 'Av. Voluntário Fernando Pinheiro Franco', 'Centro'],
  ['Condomínio Edifício Parque das Árvores', 'São Paulo', 'Rua Afonso Brás', 'Vila Nova Conceição'],
  ['Rede Bom Preço Supermercados Ltda', 'Jundiaí', 'Av. Nove de Julho', 'Anhangabaú'],
  ['Voltare Comércio de Materiais Elétricos Ltda', 'Barueri', 'Alameda Rio Negro', 'Alphaville'],
];

export function initialCustomers(): Customer[] {
  return CUSTOMER_BASE.map(([name, city, street, district], i) => {
    const root = String(10234567 + i * 1379113).slice(0, 8);
    const slug = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(' ')[0]
      .replace(/[^a-z]/g, '');
    return {
      code: String(100 + i).padStart(6, '0'),
      name,
      cnpj: makeCnpj(root),
      city,
      state: 'SP',
      street: `${street}, ${120 + ((i * 137) % 1800)}`,
      district,
      zip: `0${1000 + ((i * 311) % 8999)}-${String((i * 97) % 999).padStart(3, '0')}`,
      email: `compras@${slug}.demo`,
      phone: `(11) 9${String(4000 + i * 211).slice(0, 4)}-${String(1000 + i * 433).slice(0, 4)}`,
    };
  });
}

export function initialMappingProfiles(): Record<string, MappingProfile> {
  let n = 0;
  const r = (source: string, target: string, transforms: MappingProfile['rules'][number]['transforms'] = [], required = false, note?: string) => ({
    id: `r${++n}`,
    source,
    target,
    transforms,
    required,
    note,
  });
  return {
    'store-erp-orders': {
      integrationId: 'store-erp-orders',
      sourceLabel: 'Pedido da loja virtual (JSON da API)',
      targetLabel: 'Pedido de venda no ERP (SC5/SC6)',
      rules: [
        r('number', 'C5_NUMEXT', [], true, 'Número do pedido na loja'),
        r('created_at', 'C5_EMISSAO', [{ type: 'date' }], true, 'Data de emissão'),
        r('customer.document', 'A1_CGC', [{ type: 'digits' }], true, 'CNPJ/CPF sem máscara'),
        r('customer.name', 'A1_NOME', [{ type: 'trim' }, { type: 'upper' }, { type: 'truncate', param: '40' }], true, 'Razão social'),
        r('customer.email', 'A1_EMAIL', [{ type: 'trim' }, { type: 'lower' }]),
        r('shipping_address.zip', 'A1_CEP', [{ type: 'digits' }]),
        r('shipping_address.city', 'A1_MUN', [{ type: 'upper' }]),
        r('shipping_address.state', 'A1_EST', [{ type: 'upper' }]),
        r('payment.method', 'C5_CONDPAG', [{ type: 'lookup', param: 'cond-pagto' }], true, 'Condição de pagamento'),
        r('totals.shipping', 'C5_FRETE', [{ type: 'decimal' }]),
        r('items[].sku', 'itens[].C6_PRODUTO', [{ type: 'trim' }, { type: 'upper' }, { type: 'lookup', param: 'sku-erp' }], true, 'Código do produto'),
        r('items[].quantity', 'itens[].C6_QTDVEN', [{ type: 'number' }], true),
        r('items[].unit', 'itens[].C6_UM', [{ type: 'unit' }]),
        r('items[].unit_price', 'itens[].C6_PRCVEN', [{ type: 'decimal' }], true),
      ],
    },
    'sheet-erp': {
      integrationId: 'sheet-erp',
      sourceLabel: 'Linha da planilha de pedidos (CSV/XLSX)',
      targetLabel: 'Pedido de venda no ERP (SC5/SC6)',
      rules: [
        r('pedido', 'C5_NUMEXT', [{ type: 'trim' }], true),
        r('data', 'C5_EMISSAO', [{ type: 'date' }], true),
        r('cnpj_cliente', 'A1_CGC', [{ type: 'digits' }], true),
        r('razao_social', 'A1_NOME', [{ type: 'trim' }, { type: 'upper' }, { type: 'truncate', param: '40' }], true),
        r('cond_pagamento', 'C5_CONDPAG', [{ type: 'default', param: '028' }]),
        r('itens[].sku', 'itens[].C6_PRODUTO', [{ type: 'trim' }, { type: 'upper' }, { type: 'lookup', param: 'sku-erp' }], true),
        r('itens[].quantidade', 'itens[].C6_QTDVEN', [{ type: 'number' }], true),
        r('itens[].unidade', 'itens[].C6_UM', [{ type: 'unit' }]),
        r('itens[].preco_unitario', 'itens[].C6_PRCVEN', [{ type: 'decimal' }], true),
      ],
    },
    'erp-store-stock': {
      integrationId: 'erp-store-stock',
      sourceLabel: 'Produto no ERP (SB1/SB2/DA1)',
      targetLabel: 'Produto na loja virtual (API)',
      rules: [
        r('B1_COD', 'sku', [{ type: 'lookup', param: 'sku-erp', reverse: true }], true, 'Código ERP → SKU da loja'),
        r('B2_QATU', 'inventory_quantity', [{ type: 'number' }], true, 'Saldo disponível'),
        r('DA1_PRCVEN', 'price', [{ type: 'decimal' }], true, 'Preço da tabela de venda'),
        r('B1_UM', 'unit', [{ type: 'trim' }]),
      ],
    },
    'bank-recon': {
      integrationId: 'bank-recon',
      sourceLabel: 'Recebimento do extrato bancário (CNAB/API)',
      targetLabel: 'Baixa de título a receber no ERP (SE1/SE5)',
      rules: [
        r('nosso_numero', 'E1_NUMBCO', [{ type: 'digits' }], true),
        r('valor', 'E5_VALOR', [{ type: 'decimal' }], true),
        r('data', 'E5_DATA', [{ type: 'date' }], true),
        r('banco', 'E5_BANCO', [{ type: 'default', param: '341' }]),
        r('tipo', 'E5_HISTOR', [{ type: 'upper' }]),
      ],
    },
    'carrier-tracking': {
      integrationId: 'carrier-tracking',
      sourceLabel: 'Evento de rastreio da transportadora',
      targetLabel: 'Atualização de entrega na loja virtual',
      rules: [
        r('pedido', 'order_number', [{ type: 'digits' }], true),
        r('codigo_rastreio', 'tracking_number', [{ type: 'trim' }, { type: 'upper' }], true),
        r('transportadora', 'carrier', [{ type: 'trim' }]),
        r('status', 'fulfillment_status', [{ type: 'lookup', param: 'status-rastreio' }], true),
        r('previsao', 'estimated_delivery', [{ type: 'trim' }]),
      ],
    },
  };
}
