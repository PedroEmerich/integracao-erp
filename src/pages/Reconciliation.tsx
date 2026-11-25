import { AlertTriangle, ArrowLeftRight, Check, CheckCheck, GitCompareArrows, Link2, Search, Undo2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '../components/ui';
import { onlyDigits } from '../domain/documents';
import { fmtBRL, fmtNum } from '../domain/format';
import { findDivergences, scoreMatch, suggestMatches, type DivergenceKind } from '../domain/reconciliation';
import type { BankTransaction, ErpTitle } from '../domain/types';
import { useHub } from '../store/useHub';

const d = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const DIV_LABEL: Record<DivergenceKind, { label: string; cls: string }> = {
  valor: { label: 'Diferença de valor', cls: 'b-warn' },
  'sem-titulo': { label: 'Sem título no ERP', cls: 'b-err' },
  duplicidade: { label: 'Possível duplicidade', cls: 'b-err' },
  'vencido-sem-pagamento': { label: 'Vencido sem pagamento', cls: 'b-muted' },
};

function TxCell({ tx }: { tx: BankTransaction }) {
  return (
    <div>
      <div className="strong">{tx.payerName}</div>
      <div className="small muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.description}>
        {d(tx.date)} · {tx.type} · {tx.description}
      </div>
    </div>
  );
}

function TitleCell({ t }: { t: ErpTitle }) {
  return (
    <div>
      <div className="strong">{t.customerName}</div>
      <div className="small muted">{t.id} · {t.invoice} · vence {d(t.dueDate)} · NN {t.nossoNumero}</div>
    </div>
  );
}

export function ReconciliationPage() {
  const transactions = useHub((s) => s.transactions);
  const titles = useHub((s) => s.titles);
  const reconcile = useHub((s) => s.reconcile);
  const undo = useHub((s) => s.undoReconcile);
  const toast = useHub((s) => s.toast);
  const [tab, setTab] = useState<'sug' | 'div' | 'man' | 'done'>('sug');
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [selTx, setSelTx] = useState<string>('');
  const [selTi, setSelTi] = useState<string>('');
  const [qTi, setQTi] = useState('');

  const suggestions = useMemo(() => suggestMatches(transactions, titles).filter((s) => !rejected.has(`${s.transactionId}|${s.titleId}`)), [transactions, titles, rejected]);
  const divergences = useMemo(() => findDivergences(transactions, titles, suggestions, new Date()), [transactions, titles, suggestions]);
  const txById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  const tiById = useMemo(() => new Map(titles.map((t) => [t.id, t])), [titles]);
  const openTx = transactions.filter((t) => !t.reconciledWith);
  const openTitles = titles.filter((t) => t.status === 'aberto');
  const done = transactions.filter((t) => t.reconciledWith);
  const sugTotal = suggestions.reduce((a, s) => a + (txById.get(s.transactionId)?.amount ?? 0), 0);

  const accept = (txId: string, tiId: string, mode: 'auto' | 'manual') => {
    reconcile(txId, tiId, mode);
    toast({ kind: 'success', title: 'Recebimento conciliado', message: `Título ${tiId} baixado no ERP.` });
  };
  const acceptAll = () => {
    const high = suggestions.filter((s) => s.score >= 90 && Math.abs(s.difference) < 0.01);
    high.forEach((s) => reconcile(s.transactionId, s.titleId, 'auto'));
    toast({ kind: 'success', title: `${high.length} recebimentos conciliados`, message: 'Sugestões com alta confiança e sem diferença de valor.' });
  };

  const tx = selTx ? txById.get(selTx) : undefined;
  const ti = selTi ? tiById.get(selTi) : undefined;
  const manualScore = tx && ti ? scoreMatch(tx, ti) : null;
  const titleList = openTitles
    .filter((t) => !qTi || `${t.customerName} ${t.id} ${t.nossoNumero} ${t.amount.toFixed(2)}`.toLowerCase().includes(qTi.toLowerCase()))
    .sort((a, b) => (tx ? scoreMatch(tx, b).score - scoreMatch(tx, a).score : a.dueDate.localeCompare(b.dueDate)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Conciliação bancária</h1>
          <p>Recebimentos do extrato do banco comparados com os títulos a receber do ERP.</p>
        </div>
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">A conciliar no extrato</span><span className="kpi-value tabnum">{openTx.length}</span><span className="kpi-foot">{fmtBRL(openTx.reduce((a, t) => a + t.amount, 0))}</span></div>
        <div className="card kpi"><span className="kpi-label">Sugestões automáticas</span><span className="kpi-value tabnum">{suggestions.length}</span><span className="kpi-foot">{fmtBRL(sugTotal)} identificados</span></div>
        <div className="card kpi"><span className="kpi-label">Divergências</span><span className="kpi-value tabnum" style={{ color: divergences.length ? 'var(--warn)' : undefined }}>{divergences.length}</span><span className="kpi-foot">Precisam de análise</span></div>
        <div className="card kpi"><span className="kpi-label">Títulos em aberto</span><span className="kpi-value tabnum">{openTitles.length}</span><span className="kpi-foot">{fmtBRL(openTitles.reduce((a, t) => a + t.amount, 0))}</span></div>
        <div className="card kpi"><span className="kpi-label">Conciliados</span><span className="kpi-value tabnum">{done.length}</span><span className="kpi-foot">{done.filter((t) => t.reconciledBy === 'auto').length} automáticos · {done.filter((t) => t.reconciledBy === 'manual').length} manuais</span></div>
      </div>

      <div className="tabs" role="tablist" aria-label="Seções da conciliação">
        <button role="tab" aria-selected={tab === 'sug'} onClick={() => setTab('sug')}>Sugestões <span className="badge b-info tabnum">{suggestions.length}</span></button>
        <button role="tab" aria-selected={tab === 'div'} onClick={() => setTab('div')}>Divergências <span className="badge b-warn tabnum">{divergences.length}</span></button>
        <button role="tab" aria-selected={tab === 'man'} onClick={() => setTab('man')}>Conciliar manualmente</button>
        <button role="tab" aria-selected={tab === 'done'} onClick={() => setTab('done')}>Conciliados <span className="badge b-muted tabnum">{done.length}</span></button>
      </div>

      {tab === 'sug' && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Correspondências sugeridas</h2>
              <p>Pontuação por nosso número, valor, CNPJ do pagador, nome e data</p>
            </div>
            <button className="btn btn-primary btn-sm" disabled={!suggestions.some((s) => s.score >= 90 && Math.abs(s.difference) < 0.01)} onClick={acceptAll}>
              <CheckCheck size={15} aria-hidden /> Aceitar todas com confiança ≥ 90%
            </button>
          </div>
          {suggestions.length === 0 ? (
            <EmptyState icon={<CheckCheck size={26} />} title="Nenhuma sugestão pendente">Tudo o que o Hub conseguiu identificar já foi conciliado. Veja as divergências ou concilie manualmente.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Recebimento (banco)</th>
                    <th className="num">Valor</th>
                    <th aria-label="Correspondência" />
                    <th>Título (ERP)</th>
                    <th className="num">Valor</th>
                    <th>Confiança</th>
                    <th><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => {
                    const t = txById.get(s.transactionId)!;
                    const ti2 = tiById.get(s.titleId)!;
                    return (
                      <tr key={s.transactionId}>
                        <td><TxCell tx={t} /></td>
                        <td className="num strong">{fmtBRL(t.amount)}</td>
                        <td><ArrowLeftRight size={16} className="muted" aria-hidden /></td>
                        <td><TitleCell t={ti2} /></td>
                        <td className="num">
                          {fmtBRL(ti2.amount)}
                          {Math.abs(s.difference) >= 0.01 && <div className="small" style={{ color: 'var(--warn)', fontWeight: 600 }}>dif. {fmtBRL(s.difference)}</div>}
                        </td>
                        <td style={{ minWidth: 150 }}>
                          <span className={`badge ${s.score >= 90 ? 'b-ok' : 'b-warn'}`}>{s.score}%</span>
                          <div className="small muted">{s.reasons.join(' · ')}</div>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn btn-sm btn-primary" onClick={() => accept(s.transactionId, s.titleId, 'auto')}><Check size={14} aria-hidden /> Conciliar</button>
                            <button className="btn btn-sm btn-ghost btn-icon" aria-label="Rejeitar sugestão" title="Rejeitar sugestão" onClick={() => setRejected(new Set(rejected).add(`${s.transactionId}|${s.titleId}`))}><X size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'div' && (
        <section className="card">
          <div className="card-head"><h2>Divergências</h2><p>Diferenças de valor, recebimentos sem título, duplicidades e vencidos</p></div>
          {divergences.length === 0 ? (
            <EmptyState icon={<CheckCheck size={26} />} title="Sem divergências">Extrato e contas a receber estão batendo.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Tipo</th><th>Recebimento</th><th>Título</th><th>Análise</th><th><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {divergences.map((dv, i) => {
                    const t = dv.transactionId ? txById.get(dv.transactionId) : undefined;
                    const ti2 = dv.titleId ? tiById.get(dv.titleId) : undefined;
                    return (
                      <tr key={i}>
                        <td><span className={`badge ${DIV_LABEL[dv.kind].cls}`}><AlertTriangle size={12} aria-hidden /> {DIV_LABEL[dv.kind].label}</span></td>
                        <td>{t ? <><TxCell tx={t} /><div className="strong small">{fmtBRL(t.amount)}</div></> : <span className="muted">—</span>}</td>
                        <td>{ti2 ? <><TitleCell t={ti2} /><div className="strong small">{fmtBRL(ti2.amount)} · {ti2.status}</div></> : <span className="muted">—</span>}</td>
                        <td className="small" style={{ maxWidth: 260 }}>{dv.message}</td>
                        <td>
                          {dv.kind === 'valor' && t && ti2 && (
                            <button className="btn btn-sm" onClick={() => accept(t.id, ti2.id, 'manual')}><Check size={14} aria-hidden /> Conciliar com diferença</button>
                          )}
                          {(dv.kind === 'sem-titulo' || dv.kind === 'vencido-sem-pagamento') && (
                            <button className="btn btn-sm" onClick={() => { setSelTx(dv.transactionId ?? ''); setSelTi(dv.titleId ?? ''); setTab('man'); }}>
                              <Link2 size={14} aria-hidden /> Vincular manualmente
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'man' && (
        <div className="stack">
          <div className="grid grid-2">
            <section className="card" aria-labelledby="m-tx">
              <div className="card-head"><h2 id="m-tx">1. Recebimento do banco</h2><span className="small muted">{openTx.length} não conciliados</span></div>
              <div style={{ maxHeight: 420, overflowY: 'auto' }} role="radiogroup" aria-labelledby="m-tx">
                {openTx.map((t) => (
                  <label key={t.id} className="health-item" style={{ cursor: 'pointer', background: selTx === t.id ? 'var(--primary-soft)' : undefined }}>
                    <span className="row" style={{ alignItems: 'flex-start' }}>
                      <input type="radio" name="tx" checked={selTx === t.id} onChange={() => setSelTx(t.id)} style={{ marginTop: 4 }} />
                      <TxCell tx={t} />
                    </span>
                    <span className="strong tabnum">{fmtBRL(t.amount)}</span>
                  </label>
                ))}
              </div>
            </section>
            <section className="card" aria-labelledby="m-ti">
              <div className="card-head">
                <h2 id="m-ti">2. Título em aberto no ERP</h2>
                <div className="search" style={{ maxWidth: 220 }}>
                  <Search size={15} aria-hidden />
                  <input className="input input-sm" placeholder="Cliente, título, valor…" aria-label="Buscar título" value={qTi} onChange={(e) => setQTi(e.target.value)} />
                </div>
              </div>
              <div style={{ maxHeight: 420, overflowY: 'auto' }} role="radiogroup" aria-labelledby="m-ti">
                {titleList.map((t) => {
                  const sc = tx ? scoreMatch(tx, t).score : null;
                  return (
                    <label key={t.id} className="health-item" style={{ cursor: 'pointer', background: selTi === t.id ? 'var(--primary-soft)' : undefined }}>
                      <span className="row" style={{ alignItems: 'flex-start' }}>
                        <input type="radio" name="ti" checked={selTi === t.id} onChange={() => setSelTi(t.id)} style={{ marginTop: 4 }} />
                        <TitleCell t={t} />
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <span className="strong tabnum" style={{ display: 'block' }}>{fmtBRL(t.amount)}</span>
                        {sc !== null && sc > 0 && <span className={`badge ${sc >= 70 ? 'b-ok' : 'b-muted'}`}>{sc}%</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>
          <div className="card card-body row wrap between">
            <div className="small">
              {tx && ti ? (
                <>
                  <strong>{fmtBRL(tx.amount)}</strong> recebido de {tx.payerName} ↔ título <strong>{ti.id}</strong> de {fmtBRL(ti.amount)}
                  {Math.abs(tx.amount - ti.amount) >= 0.01 && <span style={{ color: 'var(--warn)', fontWeight: 600 }}> · diferença {fmtBRL(tx.amount - ti.amount)}</span>}
                  {onlyDigits(tx.payerDoc) !== onlyDigits(ti.cnpj) && <span className="muted"> · pagador com documento diferente do cliente</span>}
                  {manualScore && <span className="muted"> · compatibilidade {manualScore.score}%</span>}
                </>
              ) : (
                <span className="muted">Selecione um recebimento e um título para conciliar.</span>
              )}
            </div>
            <button
              className="btn btn-primary"
              disabled={!tx || !ti}
              onClick={() => {
                accept(selTx, selTi, 'manual');
                setSelTx('');
                setSelTi('');
              }}
            >
              <GitCompareArrows size={16} aria-hidden /> Conciliar selecionados
            </button>
          </div>
        </div>
      )}

      {tab === 'done' && (
        <section className="card">
          <div className="card-head"><h2>Conciliados</h2><p>{fmtNum(done.length)} recebimentos vinculados a títulos</p></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Recebimento</th><th className="num">Valor</th><th>Título</th><th>Forma</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {done.map((t) => {
                  const ti2 = tiById.get(t.reconciledWith!);
                  return (
                    <tr key={t.id}>
                      <td><TxCell tx={t} /></td>
                      <td className="num strong">{fmtBRL(t.amount)}</td>
                      <td>{ti2 ? <TitleCell t={ti2} /> : t.reconciledWith}</td>
                      <td><span className={`badge ${t.reconciledBy === 'manual' ? 'b-info' : 'b-ok'}`}>{t.reconciledBy === 'manual' ? 'Manual' : 'Automática'}</span></td>
                      <td><button className="btn btn-sm btn-ghost" onClick={() => undo(t.id)}><Undo2 size={14} aria-hidden /> Desfazer</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
