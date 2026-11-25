import { Loader2, RefreshCw } from 'lucide-react';
import type { IntegrationId } from '../domain/types';
import { syncNow } from '../store/engine';
import { useHub } from '../store/useHub';
import { Progress } from './ui';

export function useSyncProgress(id: IntegrationId) {
  const batch = useHub((s) => s.syncBatches[id]);
  const jobs = useHub((s) => s.jobs);
  if (!batch) return null;
  const items = jobs.filter((j) => batch.ids.includes(j.id));
  const done = items.filter((j) => !['queued', 'processing'].includes(j.status)).length;
  const errors = items.filter((j) => j.status === 'error').length;
  return { fetching: batch.fetching, total: batch.total, done, errors };
}

export function SyncButton({ id, size }: { id: IntegrationId; size?: 'sm' }) {
  const p = useSyncProgress(id);
  const enabled = useHub((s) => s.integrations.find((i) => i.id === id)?.enabled);
  return (
    <button className={`btn btn-primary ${size === 'sm' ? 'btn-sm' : ''}`} onClick={() => void syncNow(id)} disabled={!!p || !enabled} title={!enabled ? 'Ligue a integração para sincronizar' : undefined}>
      {p ? <Loader2 size={15} className="spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}
      {p ? 'Sincronizando…' : 'Sincronizar agora'}
    </button>
  );
}

export function SyncProgress({ id }: { id: IntegrationId }) {
  const p = useSyncProgress(id);
  if (!p) return null;
  return (
    <div className="stack" style={{ gap: 6 }} aria-live="polite">
      <div className="row between small">
        <span className="strong">{p.fetching ? 'Buscando registros novos na origem…' : `Processando ${p.done} de ${p.total}`}</span>
        {!p.fetching && p.errors > 0 && <span style={{ color: 'var(--err)', fontWeight: 600 }}>{p.errors} com erro</span>}
      </div>
      <Progress value={p.done} total={p.fetching ? 0 : p.total} label="Progresso da sincronização" />
    </div>
  );
}
