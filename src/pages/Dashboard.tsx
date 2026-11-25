import { AlertOctagon, ArrowRight, CheckCircle2, Clock, Hourglass, PackageCheck, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HealthBadge, Skeleton, StatusBadge } from '../components/ui';
import { INTEGRATION_ORDER, INTEGRATION_SHORT } from '../data/seed';
import { ERROR_CATALOG } from '../domain/errors';
import { fmtBRL, fmtDuration, fmtNum, fmtPct, fmtRelative, fmtTime } from '../domain/format';
import type { HourlyStat, IntegrationId } from '../domain/types';
import { useHub } from '../store/useHub';

export const SERIES_COLOR: Record<IntegrationId, string> = {
  'store-erp-orders': 'var(--s1)',
  'erp-store-stock': 'var(--s2)',
  'sheet-erp': 'var(--s3)',
  'bank-recon': 'var(--s4)',
  'carrier-tracking': 'var(--s5)',
};

/** Minutos de trabalho manual evitados por item processado (estimativa). */
const MANUAL_MIN: Record<IntegrationId, number> = {
  'store-erp-orders': 6,
  'sheet-erp': 8,
  'erp-store-stock': 1.5,
  'bank-recon': 3,
  'carrier-tracking': 1.5,
};

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function sum(stats: HourlyStat[], f: (s: HourlyStat) => number) {
  return stats.reduce((a, s) => a + f(s), 0);
}

interface Point {
  hour: string;
  [k: string]: number | string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const d = new Date(label);
  const total = payload.reduce((a, p) => a + (p.value || 0), 0);
  return (
    <div className="chart-tip">
      <div className="strong" style={{ marginBottom: 6 }}>
        {d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} · {String(d.getHours()).padStart(2, '0')}h–{String(d.getHours() + 1).padStart(2, '0')}h
      </div>
      {[...payload].reverse().map((p) => (
        <div className="row between" key={p.dataKey} style={{ gap: 14 }}>
          <span className="row" style={{ gap: 6 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: SERIES_COLOR[p.dataKey as IntegrationId], display: 'inline-block' }} />
            {INTEGRATION_SHORT[p.dataKey as IntegrationId]}
          </span>
          <span className="tabnum strong">{fmtNum(p.value)}</span>
        </div>
      ))}
      <div className="row between" style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
        <span>Total</span>
        <span className="tabnum strong">{fmtNum(total)}</span>
      </div>
    </div>
  );
}

function VolumeChart() {
  const stats = useHub((s) => s.stats);
  const [range, setRange] = useState<'7d' | '24h'>('7d');
  const data = useMemo(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const hours = range === '7d' ? 168 : 24;
    const byHour = new Map<string, Point>();
    for (let k = hours - 1; k >= 0; k--) {
      const h = new Date(now.getTime() - k * 3600000).toISOString();
      const p: Point = { hour: h };
      INTEGRATION_ORDER.forEach((id) => (p[id] = 0));
      byHour.set(h, p);
    }
    stats.forEach((s) => {
      const p = byHour.get(s.hour);
      if (p) p[s.integrationId] = (p[s.integrationId] as number) + s.ok + s.error;
    });
    return [...byHour.values()];
  }, [stats, range]);
  const ticks = data.filter((d) => new Date(d.hour).getHours() === (range === '7d' ? 0 : new Date(d.hour).getHours() % 3 === 0 ? new Date(d.hour).getHours() : -1)).map((d) => d.hour);
  const totals = INTEGRATION_ORDER.map((id) => ({ id, total: data.reduce((a, d) => a + (d[id] as number), 0) }));

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Volume por hora e por integração</h2>
          <p>{range === '7d' ? 'Itens processados nos últimos 7 dias' : 'Itens processados nas últimas 24 horas'}</p>
        </div>
        <div className="seg" role="group" aria-label="Período do gráfico">
          <button aria-pressed={range === '7d'} onClick={() => setRange('7d')}>7 dias</button>
          <button aria-pressed={range === '24h'} onClick={() => setRange('24h')}>24 horas</button>
        </div>
      </div>
      <div className="card-body">
        <div className="legend" style={{ marginBottom: 10 }}>
          {totals.map(({ id, total }) => (
            <span key={id}>
              <i style={{ background: SERIES_COLOR[id] }} />
              {INTEGRATION_SHORT[id]} <span className="tabnum muted">({fmtNum(total)})</span>
            </span>
          ))}
        </div>
        <div style={{ width: '100%', height: 280 }} role="img" aria-label={`Gráfico de barras empilhadas com o volume por hora. Totais: ${totals.map((t) => `${INTEGRATION_SHORT[t.id]} ${t.total}`).join('; ')}.`}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }} barCategoryGap={range === '7d' ? 1 : 4}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis
                dataKey="hour"
                ticks={ticks}
                tickLine={false}
                axisLine={{ stroke: 'var(--axis)' }}
                tick={{ fill: 'var(--text-3)', fontSize: 11.5 }}
                tickFormatter={(h: string) => {
                  const d = new Date(h);
                  return range === '7d' ? d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }) : `${String(d.getHours()).padStart(2, '0')}h`;
                }}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11.5 }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-3)' }} />
              {INTEGRATION_ORDER.map((id, i) => (
                <Bar key={id} dataKey={id} stackId="v" fill={SERIES_COLOR[id]} radius={i === INTEGRATION_ORDER.length - 1 ? [2, 2, 0, 0] : 0} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function HealthPanel() {
  const integrations = useHub((s) => s.integrations);
  useTick(5000);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Saúde dos conectores</h2>
          <p>Verificação automática a cada 12 s</p>
        </div>
        <Link to="/integracoes" className="btn btn-sm">Gerenciar</Link>
      </div>
      <div className="health-list">
        {integrations.map((i) => (
          <Link key={i.id} to={`/integracoes/${i.id}`} className="health-item" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span>
              <span className="strong" style={{ display: 'block' }}>{i.name}</span>
              <span className="small muted">
                Último ping {fmtRelative(i.lastPing)} · {i.enabled ? (i.latencyMs ? `${fmtNum(i.latencyMs)} ms` : 'sem resposta') : 'integração desligada'}
              </span>
            </span>
            <HealthBadge health={i.enabled ? i.health : 'paused'} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, foot, to }: { icon: React.ReactNode; label: string; value: string; foot: React.ReactNode; to?: string }) {
  const inner = (
    <>
      <span className="kpi-label">{icon}{label}</span>
      <span className="kpi-value tabnum">{value}</span>
      <span className="kpi-foot">{foot}</span>
    </>
  );
  return to ? (
    <Link to={to} className="card kpi" style={{ color: 'inherit', textDecoration: 'none' }}>{inner}</Link>
  ) : (
    <div className="card kpi">{inner}</div>
  );
}

export function DashboardPage() {
  const stats = useHub((s) => s.stats);
  const jobs = useHub((s) => s.jobs);
  const user = useHub((s) => s.user)!;
  const liveMode = useHub((s) => s.liveMode);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 650);
    return () => clearTimeout(t);
  }, []);

  const k = useMemo(() => {
    const today = startOfDay();
    const nowH = new Date().getHours();
    const yStart = today - 86400000;
    const isOrder = (s: HourlyStat) => s.integrationId === 'store-erp-orders' || s.integrationId === 'sheet-erp';
    const todayStats = stats.filter((s) => new Date(s.hour).getTime() >= today);
    const yStats = stats.filter((s) => {
      const t = new Date(s.hour).getTime();
      return t >= yStart && t < today && new Date(s.hour).getHours() <= nowH;
    });
    const ordersToday = sum(todayStats.filter(isOrder), (s) => s.ok);
    const ordersY = sum(yStats.filter(isOrder), (s) => s.ok);
    const okT = sum(todayStats, (s) => s.ok);
    const errT = sum(todayStats, (s) => s.error);
    const rate = okT + errT ? (okT / (okT + errT)) * 100 : 100;
    const avg = okT ? sum(todayStats, (s) => s.totalDurationMs) / okT : 0;
    const week = stats.filter((s) => new Date(s.hour).getTime() >= Date.now() - 7 * 86400000);
    const savedH = sum(week, (s) => s.ok * MANUAL_MIN[s.integrationId]) / 60;
    const savedToday = sum(todayStats, (s) => s.ok * MANUAL_MIN[s.integrationId]) / 60;
    const pending = jobs.filter((j) => j.status === 'error');
    const valueToday = jobs.filter((j) => (j.status === 'done' || j.status === 'reprocessed') && j.kind === 'pedido' && new Date(j.updatedAt).getTime() >= today).reduce((a, j) => a + (j.amount ?? 0), 0);
    return { ordersToday, ordersY, rate, avg, savedH, savedToday, pending, okT, errT, valueToday };
  }, [stats, jobs]);

  const delta = k.ordersY ? ((k.ordersToday - k.ordersY) / k.ordersY) * 100 : 0;
  const recent = jobs.slice(0, 8);
  const errorsByCode = useMemo(() => {
    const m = new Map<string, number>();
    k.pending.forEach((j) => j.error && m.set(j.error.code, (m.get(j.error.code) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [k.pending]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão geral</h1>
          <p>
            Olá, {user.name.split(' ')[0]}. {liveMode ? 'Modo demonstração ao vivo ligado: novos pedidos chegando a cada poucos segundos.' : 'Acompanhe as integrações da Nortex em tempo real.'}
          </p>
        </div>
        <div className="page-actions">
          <Link to="/fila" className="btn"><RefreshCw size={16} aria-hidden /> Ver fila</Link>
          {k.pending.length > 0 && (
            <Link to="/erros" className="btn btn-primary"><AlertOctagon size={16} aria-hidden /> Tratar {k.pending.length} erros</Link>
          )}
        </div>
      </div>

      <section className="grid grid-kpi" aria-label="Indicadores" style={{ marginBottom: 16 }}>
        {loading ? (
          Array.from({ length: 5 }, (_, i) => (
            <div className="card kpi" key={i}>
              <Skeleton h={13} w="60%" />
              <Skeleton h={28} w="45%" />
              <Skeleton h={12} w="80%" />
            </div>
          ))
        ) : (
          <>
            <Kpi
              icon={<PackageCheck size={15} aria-hidden />}
              label="Pedidos sincronizados hoje"
              value={fmtNum(k.ordersToday)}
              foot={
                <>
                  <span className={delta >= 0 ? 'delta-up' : 'delta-down'}>{delta >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(delta), 0)}</span> vs. ontem no mesmo horário
                </>
              }
            />
            <Kpi icon={<CheckCircle2 size={15} aria-hidden />} label="Taxa de sucesso (hoje)" value={fmtPct(k.rate)} foot={`${fmtNum(k.okT)} concluídos · ${fmtNum(k.errT)} com erro`} />
            <Kpi icon={<AlertOctagon size={15} aria-hidden />} label="Erros pendentes" value={fmtNum(k.pending.length)} foot={<>Aguardando correção · <span style={{ color: 'var(--primary-text)', fontWeight: 600 }}>tratar agora →</span></>} to="/erros" />
            <Kpi icon={<Clock size={15} aria-hidden />} label="Tempo médio de sincronização" value={fmtDuration(k.avg)} foot="Do recebimento à confirmação no destino" />
            <Kpi icon={<Hourglass size={15} aria-hidden />} label="Horas manuais economizadas" value={`${fmtNum(Math.round(k.savedH))} h`} foot={`Últimos 7 dias · ${fmtNum(Math.round(k.savedToday * 10) / 10)} h hoje`} />
          </>
        )}
      </section>

      <div className="grid grid-main" style={{ marginBottom: 16 }}>
        {loading ? <div className="card card-body"><Skeleton h={18} w="40%" /><Skeleton h={280} style={{ marginTop: 16 }} /></div> : <VolumeChart />}
        <HealthPanel />
      </div>

      <div className="grid grid-main">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Últimas execuções</h2>
              <p>Atualiza sozinho conforme a fila anda</p>
            </div>
            <Link to="/fila" className="btn btn-sm">Ver todas <ArrowRight size={14} aria-hidden /></Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="hide-sm">Integração</th>
                  <th>Status</th>
                  <th className="num hide-sm">Valor</th>
                  <th className="num">Hora</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((j) => (
                  <tr key={j.id} className={`clickable ${j.status === 'error' ? 'row-error' : ''}`} onClick={() => navigate(`/fila/${j.id}`)}>
                    <td>
                      <Link to={`/fila/${j.id}`} className="strong" onClick={(e) => e.stopPropagation()}>{j.reference}</Link>
                      <div className="small muted ellipsis" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.description}</div>
                    </td>
                    <td className="hide-sm small">{INTEGRATION_SHORT[j.integrationId]}</td>
                    <td><StatusBadge status={j.status} retrying={!!j.nextRetryAt} /></td>
                    <td className="num hide-sm">{j.kind === 'pedido' || j.kind === 'titulo' ? fmtBRL(j.amount) : '—'}</td>
                    <td className="num small muted">{fmtTime(j.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Erros pendentes por motivo</h2>
              <p>Clique para filtrar e corrigir</p>
            </div>
          </div>
          <div className="health-list">
            {errorsByCode.length === 0 && <p className="muted" style={{ padding: 16 }}>Nenhum erro pendente. Tudo sincronizado. 🎉</p>}
            {errorsByCode.map(([code, n]) => (
              <Link key={code} to={`/erros?codigo=${code}`} className="health-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span>
                  <span className="strong" style={{ display: 'block' }}>{ERROR_CATALOG[code as keyof typeof ERROR_CATALOG].title}</span>
                  <span className="small muted">{ERROR_CATALOG[code as keyof typeof ERROR_CATALOG].transient ? 'Instabilidade · pode ser reprocessado' : 'Dado precisa de correção'}</span>
                </span>
                <span className="badge b-err tabnum">{n}</span>
              </Link>
            ))}
          </div>
          {k.valueToday > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }} className="small muted">
              Valor dos pedidos enviados ao ERP hoje (amostra da fila): <span className="strong" style={{ color: 'var(--text)' }}>{fmtBRL(k.valueToday)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
