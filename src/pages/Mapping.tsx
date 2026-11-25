import { AlertTriangle, ArrowRight, CheckCircle2, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JsonView } from '../components/ui';
import { INTEGRATION_ORDER } from '../data/seed';
import { applyMapping, listPaths, TRANSFORM_LABELS } from '../domain/mapping';
import type { IntegrationId, MappingRule, Transform, TransformType } from '../domain/types';
import { useHub } from '../store/useHub';

const SHORT_TABLE: Record<string, string> = { 'sku-erp': 'SKU → ERP', 'cond-pagto': 'cond. pagto', 'status-rastreio': 'status entrega' };

const NEEDS_PARAM: Partial<Record<TransformType, string>> = { truncate: 'Tamanho', default: 'Valor', lookup: 'Tabela' };

function transformText(t: Transform, tableNames: Record<string, string>) {
  if (t.type === 'lookup') return `${TRANSFORM_LABELS.lookup}${t.reverse ? ' (reversa)' : ''}: ${SHORT_TABLE[t.param ?? ''] ?? tableNames[t.param ?? ''] ?? t.param}`;
  if (t.type === 'truncate') return `${TRANSFORM_LABELS.truncate} (${t.param})`;
  if (t.type === 'default') return `${TRANSFORM_LABELS.default}: "${t.param}"`;
  return TRANSFORM_LABELS[t.type];
}

function describeChanges(before: MappingRule[], after: MappingRule[]): string {
  const out: string[] = [];
  const b = new Map(before.map((r) => [r.id, r]));
  after.forEach((r) => {
    const o = b.get(r.id);
    if (!o) out.push(`nova regra ${r.source} → ${r.target}`);
    else if (JSON.stringify(o) !== JSON.stringify(r)) out.push(`regra ${r.source} → ${r.target} alterada`);
    b.delete(r.id);
  });
  b.forEach((r) => out.push(`regra ${r.source} → ${r.target} removida`));
  return out.join('; ') || 'Sem alterações';
}

function LookupTables() {
  const tables = useHub((s) => s.tables);
  const catalog = useHub((s) => s.catalog);
  const setEntry = useHub((s) => s.setLookupEntry);
  const toast = useHub((s) => s.toast);
  const [tab, setTab] = useState('sku-erp');
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const [filter, setFilter] = useState('');
  const t = tables[tab];
  const entries = Object.entries(t.entries).filter(([a, b]) => !filter || `${a} ${b}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section className="card" aria-labelledby="lk-h">
      <div className="card-head">
        <div>
          <h2 id="lk-h">Tabelas de equivalência de códigos</h2>
          <p>Usadas pela transformação “Tabela de equivalência”</p>
        </div>
      </div>
      <div className="card-body">
        <div className="tabs" role="tablist">
          {Object.values(tables).map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
              {x.name} <span className="badge b-muted tabnum">{Object.keys(x.entries).length}</span>
            </button>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 10 }}>{t.description}</p>
        <form
          className="row wrap"
          style={{ marginBottom: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!k.trim() || !v.trim()) return;
            setEntry(tab, k.trim(), v.trim());
            toast({ kind: 'success', title: 'Equivalência salva', message: `${k.trim()} → ${v.trim()}` });
            setK('');
            setV('');
          }}
        >
          <label className="sr-only" htmlFor="lk-k">De</label>
          <input id="lk-k" className="input input-sm" placeholder="De (origem)" value={k} onChange={(e) => setK(e.target.value)} />
          <ArrowRight size={16} aria-hidden />
          <label className="sr-only" htmlFor="lk-v">Para</label>
          <input id="lk-v" className="input input-sm" placeholder="Para (destino)" value={v} onChange={(e) => setV(e.target.value)} list={tab === 'sku-erp' ? 'erp-codes' : undefined} />
          <datalist id="erp-codes">
            {Object.values(catalog).map((p) => (
              <option key={p.code} value={p.code}>{p.description}</option>
            ))}
          </datalist>
          <button className="btn btn-sm btn-primary" type="submit"><Plus size={14} aria-hidden /> Adicionar</button>
          <input className="input input-sm" style={{ marginLeft: 'auto' }} placeholder="Filtrar…" aria-label="Filtrar equivalências" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </form>
        <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table className="table">
            <thead>
              <tr>
                <th>De (origem)</th>
                <th>Para (destino)</th>
                {tab === 'sku-erp' && <th className="hide-sm">Produto no ERP</th>}
                <th><span className="sr-only">Remover</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([a, b]) => (
                <tr key={a}>
                  <td className="mono">{a}</td>
                  <td className="mono">{b}</td>
                  {tab === 'sku-erp' && <td className="hide-sm small muted">{catalog[b]?.description ?? <span style={{ color: 'var(--err)' }}>código inexistente no ERP</span>}</td>}
                  <td className="num">
                    <button className="btn btn-ghost btn-sm btn-icon" aria-label={`Remover ${a}`} onClick={() => setEntry(tab, a, null)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function MappingPage() {
  const profiles = useHub((s) => s.profiles);
  const tables = useHub((s) => s.tables);
  const integrations = useHub((s) => s.integrations);
  const jobs = useHub((s) => s.jobs);
  const setRules = useHub((s) => s.setRules);
  const toast = useHub((s) => s.toast);
  const [params, setParams] = useSearchParams();
  const id = (params.get('integracao') ?? 'store-erp-orders') as IntegrationId;
  const profile = profiles[id];
  const [draft, setDraft] = useState<MappingRule[]>(profile.rules);
  const samples = useMemo(() => jobs.filter((j) => j.integrationId === id).slice(0, 6), [jobs, id]);
  const [sampleId, setSampleId] = useState<string>('');
  const [addFor, setAddFor] = useState<string | null>(null);
  const [newT, setNewT] = useState<Transform>({ type: 'upper' });

  useEffect(() => {
    setDraft(profiles[id].rules);
    setSampleId('');
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sample = (samples.find((j) => j.id === sampleId) ?? samples.find((j) => j.status === 'done') ?? samples[0])?.input;
  const paths = useMemo(() => (sample ? listPaths(sample) : []), [sample]);
  const preview = useMemo(() => (sample ? applyMapping(sample, draft, { tables }) : null), [sample, draft, tables]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.rules);
  const tableNames = Object.fromEntries(Object.values(tables).map((t) => [t.id, t.name]));

  const update = (rid: string, patch: Partial<MappingRule>) => setDraft(draft.map((r) => (r.id === rid ? { ...r, ...patch } : r)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mapeamento de campos (de/para)</h1>
          <p>Defina como cada campo da origem chega ao destino, com regras de transformação e pré-visualização ao vivo.</p>
        </div>
        <div className="page-actions">
          <label className="sr-only" htmlFor="map-int">Integração</label>
          <select id="map-int" className="select" value={id} onChange={(e) => setParams({ integracao: e.target.value }, { replace: true })}>
            {INTEGRATION_ORDER.map((i) => (
              <option key={i} value={i}>{integrations.find((x) => x.id === i)?.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-main" style={{ marginBottom: 16 }}>
        <section className="card" aria-labelledby="rules-h">
          <div className="card-head">
            <div>
              <h2 id="rules-h">Regras</h2>
              <p>{profile.sourceLabel} → {profile.targetLabel}</p>
            </div>
            <div className="row">
              {dirty && <button className="btn btn-sm btn-ghost" onClick={() => setDraft(profile.rules)}><Undo2 size={14} aria-hidden /> Descartar</button>}
              <button
                className="btn btn-sm btn-primary"
                disabled={!dirty}
                onClick={() => {
                  setRules(id, draft, describeChanges(profile.rules, draft));
                  toast({ kind: 'success', title: 'Mapeamento salvo', message: 'Os próximos itens já usam as novas regras.' });
                }}
              >
                <Save size={14} aria-hidden /> Salvar mapeamento
              </button>
            </div>
          </div>
          <datalist id="src-paths">
            {paths.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="map-row map-head" aria-hidden>
            <span>Campo de origem</span>
            <span />
            <span>Campo no destino</span>
            <span>Transformações</span>
            <span>Obrig.</span>
          </div>
          {draft.map((r) => (
            <div className="map-row" key={r.id}>
              <input className="input input-sm mono" value={r.source} list="src-paths" aria-label="Campo de origem" onChange={(e) => update(r.id, { source: e.target.value })} />
              <ArrowRight size={16} className="arrow muted" aria-hidden />
              <div className="stack" style={{ gap: 2 }}>
                <input className="input input-sm mono" value={r.target} aria-label="Campo no destino" onChange={(e) => update(r.id, { target: e.target.value })} />
                {r.note && <span className="hint">{r.note}</span>}
              </div>
              <div className="row wrap" style={{ gap: 4 }}>
                {r.required && <span className="chip chip-req">obrigatório</span>}
                {r.transforms.map((t, i) => (
                  <span className="chip" key={i}>
                    {transformText(t, tableNames)}
                    <button aria-label={`Remover transformação ${TRANSFORM_LABELS[t.type]}`} onClick={() => update(r.id, { transforms: r.transforms.filter((_, k) => k !== i) })}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {addFor === r.id ? (
                  <span className="row" style={{ gap: 4 }}>
                    <select className="select input-sm" aria-label="Tipo de transformação" value={newT.type} onChange={(e) => setNewT({ type: e.target.value as TransformType, param: e.target.value === 'lookup' ? 'sku-erp' : '' })}>
                      {(Object.keys(TRANSFORM_LABELS) as TransformType[]).map((t) => (
                        <option key={t} value={t}>{TRANSFORM_LABELS[t]}</option>
                      ))}
                    </select>
                    {NEEDS_PARAM[newT.type] &&
                      (newT.type === 'lookup' ? (
                        <select className="select input-sm" aria-label="Tabela" value={newT.param} onChange={(e) => setNewT({ ...newT, param: e.target.value })}>
                          {Object.values(tables).map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input className="input input-sm" style={{ width: 80 }} aria-label={NEEDS_PARAM[newT.type]} placeholder={NEEDS_PARAM[newT.type]} value={newT.param ?? ''} onChange={(e) => setNewT({ ...newT, param: e.target.value })} />
                      ))}
                    <button className="btn btn-sm btn-primary" onClick={() => { update(r.id, { transforms: [...r.transforms, newT] }); setAddFor(null); }}>OK</button>
                    <button className="btn btn-sm btn-ghost btn-icon" aria-label="Cancelar" onClick={() => setAddFor(null)}><X size={14} /></button>
                  </span>
                ) : (
                  <button className="btn btn-ghost btn-sm" style={{ height: 24, padding: '0 6px' }} onClick={() => { setAddFor(r.id); setNewT({ type: 'upper' }); }}>
                    <Plus size={13} aria-hidden /> regra
                  </button>
                )}
              </div>
              <div className="row" style={{ gap: 2 }}>
                <label className="row small" title="Obrigatório">
                  <input type="checkbox" checked={r.required} onChange={(e) => update(r.id, { required: e.target.checked })} aria-label={`Campo ${r.target} obrigatório`} />
                  <span className="hide-sm sr-only">Obrigatório</span>
                </label>
                <button className="btn btn-ghost btn-sm btn-icon" aria-label={`Excluir regra ${r.source}`} onClick={() => setDraft(draft.filter((x) => x.id !== r.id))}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <div style={{ padding: 12 }}>
            <button className="btn btn-sm" onClick={() => setDraft([...draft, { id: `r${Date.now()}`, source: '', target: '', transforms: [], required: false }])}>
              <Plus size={14} aria-hidden /> Adicionar campo
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby="prev-h">
          <div className="card-head">
            <div>
              <h2 id="prev-h">Pré-visualização</h2>
              <p>Registro de exemplo real da fila</p>
            </div>
            <label className="sr-only" htmlFor="sample">Registro de exemplo</label>
            <select id="sample" className="select input-sm" value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
              <option value="">Automático</option>
              {samples.map((j) => (
                <option key={j.id} value={j.id}>{j.reference}</option>
              ))}
            </select>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            {preview && preview.issues.length > 0 ? (
              <div className="callout callout-warn">
                <AlertTriangle size={18} aria-hidden style={{ flex: 'none' }} />
                <div className="small">
                  <div className="strong">{preview.issues.length} aviso(s) neste registro</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {preview.issues.slice(0, 5).map((i, k) => (
                      <li key={k}>{i.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="callout callout-info small"><CheckCircle2 size={18} aria-hidden /> Todas as regras aplicadas sem avisos.</div>
            )}
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Entrada ({profile.sourceLabel})</div>
              <JsonView value={sample} label="Registro de entrada" />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Saída ({profile.targetLabel})</div>
              <JsonView value={preview?.output} label="Registro transformado" />
            </div>
          </div>
        </section>
      </div>
      <LookupTables />
    </>
  );
}
