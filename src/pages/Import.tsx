import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp, Loader2, RotateCcw, Upload, XCircle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/ui';
import { STORE_PRODUCTS } from '../data/catalog';
import { corruptCnpj, Rng } from '../data/generators';
import { parseCsv } from '../domain/csv';
import { downloadFile, fmtBRL, fmtNum, toCsv } from '../domain/format';
import { groupOrders, rowsFromMatrix, SHEET_COLUMNS, validateRows, type ValidatedRow } from '../domain/spreadsheet';
import { useHub } from '../store/useHub';

const COL_LABEL: Record<string, string> = {
  pedido: 'Pedido',
  data: 'Data',
  cnpj_cliente: 'CNPJ cliente',
  razao_social: 'Razão social',
  sku: 'SKU',
  descricao: 'Descrição',
  quantidade: 'Qtd.',
  unidade: 'Un.',
  preco_unitario: 'Preço unit.',
  cond_pagamento: 'Cond. pagto',
};

/** Planilha de exemplo: maioria válida, algumas linhas com erros típicos. */
function exampleMatrix(): string[][] {
  const customers = useHub.getState().customers;
  const rng = new Rng(4711);
  const today = new Date().toLocaleDateString('pt-BR');
  const rows: string[][] = [[...SHEET_COLUMNS]];
  const products = STORE_PRODUCTS.filter((p) => p.sku !== 'DR-4P-63A');
  for (let o = 0; o < 6; o++) {
    const c = customers[(o * 3 + 1) % customers.length];
    const n = 2 + (o % 3);
    for (let i = 0; i < n; i++) {
      const p = products[(o * 5 + i * 7) % products.length];
      rows.push([`REP-${4101 + o}`, today, c.cnpj, c.name, p.sku, p.title, String(p.storeUnit === 'M' ? 100 : rng.int(2, 20)), p.storeUnit, (p.price * 0.95).toFixed(2).replace('.', ','), o % 2 ? '3060' : '028']);
    }
  }
  const c = customers[7];
  rows.push(['REP-4107', today, corruptCnpj(c.cnpj), c.name, 'DISJ-BI-40A', 'Disjuntor bipolar 40 A', '12', 'UN', '58,90', '028']);
  rows.push(['REP-4108', today, customers[9].cnpj, customers[9].name, 'LED-SPOT-7W-NV', 'Spot LED 7 W (novo)', '30', 'UN', '23,65', '028']);
  rows.push(['REP-4108', '31/02/2026', customers[9].cnpj, customers[9].name, 'TOM-2P+T-20A', 'Tomada 2P+T 20 A', '0', 'UN', '10,80', '028']);
  rows.push(['REP-4109', today, customers[12].cnpj, customers[12].name, 'CAB-PP-3X1.5', 'Cabo PP 3x1,5', '250', 'GALAO', '7,50', '45DD']);
  return rows;
}

export function ImportPage() {
  const tables = useHub((s) => s.tables);
  const jobs = useHub((s) => s.jobs);
  const enqueue = useHub((s) => s.enqueue);
  const log = useHub((s) => s.log);
  const toast = useHub((s) => s.toast);
  const enabled = useHub((s) => s.integrations.find((i) => i.id === 'sheet-erp')?.enabled);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ValidatedRow[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [over, setOver] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [imported, setImported] = useState<{ ids: string[]; orders: number; value: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const knownSkus = useMemo(() => new Set(Object.keys(tables['sku-erp'].entries)), [tables]);

  const loadMatrix = (matrix: unknown[][], name: string) => {
    const { rows: r, missingColumns } = rowsFromMatrix(matrix);
    setMissing(missingColumns);
    setRows(validateRows(r, { knownSkus }));
    setFileName(name);
    setImported(null);
    setOnlyErrors(false);
  };

  const readFile = async (file: File) => {
    setLoading(true);
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        loadMatrix(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' }), file.name);
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        loadMatrix(parseCsv(await file.text()), file.name);
      } else {
        toast({ kind: 'error', title: 'Formato não suportado', message: 'Envie um arquivo .csv ou .xlsx.' });
      }
    } catch {
      toast({ kind: 'error', title: 'Não foi possível ler a planilha', message: 'Verifique se o arquivo não está corrompido.' });
    } finally {
      setLoading(false);
    }
  };

  const downloadExample = async (kind: 'csv' | 'xlsx') => {
    const m = exampleMatrix();
    if (kind === 'csv') {
      downloadFile('planilha-exemplo-pedidos.csv', toCsv(m[0], m.slice(1)));
    } else {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(m), 'Pedidos');
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      downloadFile('planilha-exemplo-pedidos.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }
  };

  const valid = rows?.filter((r) => r.valid) ?? [];
  const invalid = rows?.filter((r) => !r.valid) ?? [];
  const orders = useMemo(() => (rows ? groupOrders(rows) : []), [rows]);
  const totalValue = orders.reduce((a, o) => a + o.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0), 0);
  const createdJobs = imported ? jobs.filter((j) => imported.ids.includes(j.id)) : [];
  const finished = createdJobs.filter((j) => !['queued', 'processing'].includes(j.status)).length;

  const doImport = () => {
    if (!rows || !orders.length) return;
    const ids = enqueue('sheet-erp', orders, 'planilha');
    setImported({ ids, orders: orders.length, value: totalValue });
    log('Importou planilha', fileName, `${rows.length} linhas lidas, ${valid.length} válidas, ${invalid.length} com erro. ${orders.length} pedidos enviados ao ERP.`);
    toast({ kind: 'success', title: 'Importação iniciada', message: `${orders.length} pedidos na fila para o ERP.` });
  };

  const errorReport = () => {
    const out: unknown[][] = [];
    invalid.forEach((r) => r.errors.forEach((e) => out.push([r.line, r.raw.pedido, COL_LABEL[e.column] ?? e.column, r.raw[e.column as keyof typeof r.raw] ?? '', e.message])));
    downloadFile(`relatorio-erros-${fileName.replace(/\.[^.]+$/, '')}.csv`, toCsv(['Linha', 'Pedido', 'Coluna', 'Valor', 'Erro'], out));
  };

  const shown = onlyErrors ? invalid : rows ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Importar planilha de pedidos</h1>
          <p>Envie um CSV ou XLSX, confira a validação linha a linha e importe só o que está correto.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => void downloadExample('xlsx')}><Download size={16} aria-hidden /> Planilha de exemplo (.xlsx)</button>
          <button className="btn" onClick={() => void downloadExample('csv')}><Download size={16} aria-hidden /> Exemplo (.csv)</button>
        </div>
      </div>

      {!enabled && (
        <div className="callout callout-warn" style={{ marginBottom: 16 }}>
          <AlertTriangle size={18} aria-hidden />
          <span className="small">A integração “Planilha de pedidos → ERP” está desligada: os pedidos importados ficarão na fila até ela ser religada.</span>
        </div>
      )}

      {!rows && (
        <div className="card card-body">
          <div
            className={`dropzone ${over ? 'over' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Selecionar planilha para importar"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void readFile(f);
            }}
          >
            {loading ? <Loader2 size={34} className="spin" aria-hidden /> : <FileUp size={34} color="var(--primary-text)" aria-hidden />}
            <h2 style={{ marginTop: 10 }}>Arraste a planilha aqui ou clique para escolher</h2>
            <p className="muted small" style={{ marginTop: 4 }}>Formatos .csv (separador ; ou ,) e .xlsx · uma linha por item do pedido</p>
            <p className="muted small" style={{ marginTop: 8 }}>Colunas: {SHEET_COLUMNS.join(', ')}</p>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => loadMatrix(exampleMatrix(), 'planilha-exemplo-pedidos.xlsx')}>
              <FileSpreadsheet size={16} aria-hidden /> Usar a planilha de exemplo agora
            </button>
          </div>
        </div>
      )}

      {rows && (
        <div className="stack">
          <div className="grid grid-kpi">
            <div className="card kpi"><span className="kpi-label">Arquivo</span><span className="strong" style={{ wordBreak: 'break-all' }}>{fileName}</span><span className="kpi-foot">{fmtNum(rows.length)} linhas de itens</span></div>
            <div className="card kpi"><span className="kpi-label"><CheckCircle2 size={15} color="var(--ok)" aria-hidden /> Linhas válidas</span><span className="kpi-value tabnum" style={{ color: 'var(--ok)' }}>{valid.length}</span><span className="kpi-foot">Serão importadas</span></div>
            <div className="card kpi"><span className="kpi-label"><XCircle size={15} color="var(--err)" aria-hidden /> Linhas com erro</span><span className="kpi-value tabnum" style={{ color: invalid.length ? 'var(--err)' : undefined }}>{invalid.length}</span><span className="kpi-foot">{invalid.reduce((a, r) => a + r.errors.length, 0)} problemas encontrados</span></div>
            <div className="card kpi"><span className="kpi-label">Pedidos a criar</span><span className="kpi-value tabnum">{orders.length}</span><span className="kpi-foot">Agrupados pelo nº do pedido</span></div>
            <div className="card kpi"><span className="kpi-label">Valor total válido</span><span className="kpi-value tabnum" style={{ fontSize: 22 }}>{fmtBRL(totalValue)}</span><span className="kpi-foot">Soma de quantidade × preço</span></div>
          </div>

          {missing.length > 0 && (
            <div className="callout callout-err" role="alert">
              <AlertTriangle size={18} aria-hidden />
              <span>Colunas ausentes na planilha: <strong>{missing.join(', ')}</strong>. Use a planilha de exemplo como modelo.</span>
            </div>
          )}

          {imported ? (
            <section className="card" aria-labelledby="rep-h">
              <div className="card-head">
                <div>
                  <h2 id="rep-h">Relatório da importação</h2>
                  <p>{imported.orders} pedidos ({fmtBRL(imported.value)}) enviados para a fila · {invalid.length} linhas não importadas</p>
                </div>
                <div className="row">
                  {invalid.length > 0 && <button className="btn btn-sm" onClick={errorReport}><Download size={14} aria-hidden /> Relatório de erros (.csv)</button>}
                  <button className="btn btn-sm" onClick={() => { setRows(null); setImported(null); }}><Upload size={14} aria-hidden /> Nova importação</button>
                </div>
              </div>
              <div className="card-body stack" style={{ gap: 10 }}>
                <div className="row between small">
                  <span className="strong">{finished < createdJobs.length ? `Processando no ERP: ${finished} de ${createdJobs.length}` : 'Processamento concluído'}</span>
                  <span>
                    <span style={{ color: 'var(--ok)' }}>{createdJobs.filter((j) => j.status === 'done' || j.status === 'reprocessed').length} incluídos</span>
                    {' · '}
                    <span style={{ color: 'var(--err)' }}>{createdJobs.filter((j) => j.status === 'error').length} com erro no ERP</span>
                  </span>
                </div>
                <div className="progress" role="progressbar" aria-label="Progresso da importação" aria-valuenow={createdJobs.length ? Math.round((finished / createdJobs.length) * 100) : 0} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${createdJobs.length ? (finished / createdJobs.length) * 100 : 0}%` }} />
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Pedido</th><th>Cliente</th><th className="num">Valor</th><th>Status no ERP</th><th className="hide-sm">Resposta</th></tr></thead>
                    <tbody>
                      {createdJobs.map((j) => (
                        <tr key={j.id}>
                          <td><Link to={`/fila/${j.id}`} className="strong">{j.reference}</Link></td>
                          <td className="small">{j.description}</td>
                          <td className="num">{fmtBRL(j.amount)}</td>
                          <td><StatusBadge status={j.status} retrying={!!j.nextRetryAt} /></td>
                          <td className="hide-sm small muted">{j.status === 'error' ? j.error?.title : (j.response as { C5_NUM?: string } | undefined)?.C5_NUM ? `Pedido de venda ${(j.response as { C5_NUM: string }).C5_NUM}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : (
            <div className="row wrap between">
              <label className="row small">
                <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> Mostrar só as linhas com erro
              </label>
              <div className="row">
                <button className="btn" onClick={() => setRows(null)}><RotateCcw size={15} aria-hidden /> Trocar arquivo</button>
                {invalid.length > 0 && <button className="btn" onClick={errorReport}><Download size={15} aria-hidden /> Relatório de erros</button>}
                <button className="btn btn-primary" disabled={!orders.length || missing.length > 0} onClick={doImport}>
                  <Upload size={15} aria-hidden /> Importar {valid.length} linhas válidas ({orders.length} pedidos)
                </button>
              </div>
            </div>
          )}

          {!imported && (
            <section className="card" aria-labelledby="pv-h">
              <div className="card-head">
                <h2 id="pv-h">Pré-visualização e validação</h2>
                <span className="small muted">Células com erro em vermelho; passe o mouse ou leia a coluna “Problemas”</span>
              </div>
              <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="table nowrap">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Status</th>
                      <th>Problemas</th>
                      {SHEET_COLUMNS.map((c) => (
                        <th key={c} className={c === 'descricao' ? 'hide-sm' : undefined}>{COL_LABEL[c]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const errCols = new Map(r.errors.map((e) => [e.column, e.message]));
                      return (
                        <tr key={r.line} className={r.valid ? '' : 'row-error'}>
                          <td className="num muted">{r.line}</td>
                          <td>{r.valid ? <span className="badge b-ok"><CheckCircle2 size={12} aria-hidden /> OK</span> : <span className="badge b-err"><XCircle size={12} aria-hidden /> Erro</span>}</td>
                          <td className="small" style={{ color: 'var(--err)', minWidth: 280, maxWidth: 360, whiteSpace: 'normal' }}>{r.errors.map((e) => e.message).join(' · ')}</td>
                          {SHEET_COLUMNS.map((c) => (
                            <td key={c} className={`${errCols.has(c) ? 'cell-error' : ''} ${c === 'descricao' || c === 'razao_social' ? 'ellipsis' : ''} ${c === 'descricao' ? 'hide-sm' : ''}`} title={errCols.get(c)}>
                              {r.raw[c] || (errCols.has(c) ? '(vazio)' : '')}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
