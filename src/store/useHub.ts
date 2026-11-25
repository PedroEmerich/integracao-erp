// Estado global (Zustand) com persistência no localStorage.
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { DEMO_USERS } from '../data/catalog';
import { createSeedData, DATA_VERSION, type HubData } from '../data/seed';
import type {
  AlertRule,
  AppNotification,
  AuditEntry,
  DemoUser,
  Frequency,
  HourlyStat,
  Integration,
  IntegrationId,
  Job,
  MappingRule,
  TimelineEvent,
} from '../domain/types';
import { RETRY_POLICY } from '../domain/errors';
import { describeInput } from '../domain/pipeline';

export type Theme = 'light' | 'dark';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

export interface SyncBatch {
  ids: string[];
  total: number;
  startedAt: string;
  fetching: boolean;
}

interface UiState {
  user: DemoUser | null;
  theme: Theme;
  liveMode: boolean;
  toasts: Toast[];
  syncBatches: Partial<Record<IntegrationId, SyncBatch>>;
  bootedAt: number;
}

interface Actions {
  login(userId: string): void;
  logout(): void;
  setTheme(t: Theme): void;
  setLiveMode(on: boolean): void;
  resetDemo(): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  log(action: string, target: string, details: string, asSystem?: boolean): void;

  setIntegrationEnabled(id: IntegrationId, enabled: boolean): void;
  setFrequency(id: IntegrationId, f: Frequency): void;
  rotateCredential(id: IntegrationId, key: string): void;
  patchIntegration(id: IntegrationId, patch: Partial<Integration>): void;

  enqueue(id: IntegrationId, inputs: unknown[], source: Job['source']): string[];
  patchJob(id: string, patch: Partial<Job>): void;
  pushEvent(id: string, ev: Omit<TimelineEvent, 'at'> & { at?: string }): void;
  correctAndReprocess(id: string, newInput: unknown, note: string): void;
  reprocess(ids: string[]): void;
  ignore(ids: string[], reason: string): void;
  setSyncBatch(id: IntegrationId, batch: SyncBatch | undefined): void;
  recordStat(id: IntegrationId, ok: boolean, durationMs: number): void;

  setRules(id: IntegrationId, rules: MappingRule[], auditDetails: string): void;
  setLookupEntry(tableId: string, key: string, value: string | null): void;

  reconcile(txId: string, titleId: string, mode: 'auto' | 'manual'): void;
  undoReconcile(txId: string): void;

  saveAlertRule(rule: AlertRule): void;
  deleteAlertRule(id: string): void;
  addNotification(n: AppNotification): void;
  markNotificationsRead(ids?: string[]): void;
}

export type HubState = HubData & UiState & Actions;

const MAX_JOBS = 350;

// Grava no localStorage com atraso (evita serializar o estado a cada evento).
const debouncedStorage: StateStorage = (() => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: string } | null = null;
  const flush = () => {
    if (!pending) return;
    try {
      localStorage.setItem(pending.name, pending.value);
    } catch {
      /* cota excedida ou armazenamento bloqueado: segue só em memória */
    }
    pending = null;
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 800);
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
})();

function hourKey(d = new Date()): string {
  const h = new Date(d);
  h.setMinutes(0, 0, 0);
  return h.toISOString();
}

function trimJobs(jobs: Job[]): Job[] {
  if (jobs.length <= MAX_JOBS) return jobs;
  // Remove os mais antigos já concluídos; mantém erros e itens em andamento.
  const keep = jobs.slice();
  for (let i = keep.length - 1; i >= 0 && keep.length > MAX_JOBS; i--) {
    if (['done', 'reprocessed', 'ignored'].includes(keep[i].status)) keep.splice(i, 1);
  }
  return keep;
}

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem('integra-hub-theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

let toastSeq = 0;

export const useHub = create<HubState>()(
  persist(
    (set, get) => {
      const updateJob = (id: string, fn: (j: Job) => Job) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? fn(j) : j)) }));
      const who = () => get().user?.name ?? 'Sistema';

      return {
        ...createSeedData(),
        user: null,
        theme: initialTheme(),
        liveMode: false,
        toasts: [],
        syncBatches: {},
        bootedAt: Date.now(),

        login(userId) {
          const u = DEMO_USERS.find((x) => x.id === userId);
          if (!u) return;
          const { password: _p, title: _t, ...user } = u;
          set({ user });
          get().log('Entrou no sistema', 'Login', `Perfil ${u.role === 'admin' ? 'Administrador' : 'Operador'}.`);
        },
        logout() {
          set({ user: null, liveMode: false });
        },
        setTheme(theme) {
          try {
            localStorage.setItem('integra-hub-theme', theme);
          } catch {
            /* ignore */
          }
          set({ theme });
        },
        setLiveMode(liveMode) {
          set({ liveMode });
          get().log(liveMode ? 'Ligou o modo demonstração ao vivo' : 'Desligou o modo demonstração ao vivo', 'Simulador', liveMode ? 'Novos pedidos serão gerados a cada poucos segundos.' : '—');
        },
        resetDemo() {
          const user = get().user;
          set({ ...createSeedData(), liveMode: false, syncBatches: {} });
          if (user) get().log('Restaurou dados de exemplo', 'Base de demonstração', 'Todos os dados foram recriados.');
        },
        toast(t) {
          const id = ++toastSeq;
          set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
          setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 6000 : 4000);
        },
        dismissToast(id) {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        },
        log(action, target, details, asSystem = false) {
          const u = get().user;
          set((s) => {
            const counters = { ...s.counters, audit: s.counters.audit + 1 };
            const entry: AuditEntry = {
              id: `AU-${String(counters.audit).padStart(5, '0')}`,
              at: new Date().toISOString(),
              user: asSystem || !u ? 'Sistema' : u.name,
              role: asSystem || !u ? 'sistema' : u.role,
              action,
              target,
              details,
            };
            return { counters, audit: [entry, ...s.audit].slice(0, 500) };
          });
        },

        setIntegrationEnabled(id, enabled) {
          const it = get().integrations.find((i) => i.id === id)!;
          set((s) => ({
            integrations: s.integrations.map((i) => (i.id === id ? { ...i, enabled, health: enabled ? 'online' : 'paused' } : i)),
          }));
          get().log(enabled ? 'Ligou integração' : 'Desligou integração', it.name, enabled ? 'Integração reativada.' : 'Itens novos ficam na fila até religar.');
        },
        setFrequency(id, frequency) {
          const it = get().integrations.find((i) => i.id === id)!;
          const label = (f: Frequency) => (f.mode === 'realtime' ? 'tempo real' : f.mode === 'interval' ? `a cada ${f.intervalMin} min` : `diariamente às ${f.fixedTime}`);
          set((s) => ({ integrations: s.integrations.map((i) => (i.id === id ? { ...i, frequency } : i)) }));
          get().log('Alterou frequência', it.name, `De "${label(it.frequency)}" para "${label(frequency)}".`);
        },
        rotateCredential(id, key) {
          const it = get().integrations.find((i) => i.id === id)!;
          const cred = it.credentials.find((c) => c.key === key)!;
          const rnd = Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
          const value = cred.value.replace(/[0-9a-f]{6,}$/i, '') + rnd;
          set((s) => ({
            integrations: s.integrations.map((i) => (i.id === id ? { ...i, credentials: i.credentials.map((c) => (c.key === key ? { ...c, value } : c)) } : i)),
          }));
          get().log('Atualizou credencial', it.name, `${cred.label} renovado (valor mascarado).`);
        },
        patchIntegration(id, patch) {
          set((s) => ({ integrations: s.integrations.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
        },

        enqueue(id, inputs, source) {
          const now = new Date().toISOString();
          const ids: string[] = [];
          set((s) => {
            let seq = s.counters.job;
            const newJobs: Job[] = inputs.map((input) => {
              const jid = `JOB-${String(++seq).padStart(6, '0')}`;
              ids.push(jid);
              const kind = id === 'erp-store-stock' ? 'produto' : id === 'bank-recon' ? 'titulo' : id === 'carrier-tracking' ? 'rastreio' : 'pedido';
              return {
                id: jid,
                integrationId: id,
                kind,
                ...describeInput(id, input),
                status: 'queued',
                createdAt: now,
                updatedAt: now,
                durationMs: 0,
                attempts: 0,
                maxAttempts: RETRY_POLICY.maxAttempts,
                nextRetryAt: null,
                input,
                timeline: [],
                source,
              };
            });
            return { jobs: trimJobs([...newJobs.reverse(), ...s.jobs]), counters: { ...s.counters, job: seq } };
          });
          return ids.reverse();
        },
        patchJob(id, patch) {
          updateJob(id, (j) => ({ ...j, ...patch, updatedAt: new Date().toISOString() }));
        },
        pushEvent(id, ev) {
          updateJob(id, (j) => ({ ...j, timeline: [...j.timeline, { ...ev, at: ev.at ?? new Date().toISOString() }] }));
        },
        correctAndReprocess(id, newInput, note) {
          const job = get().jobs.find((j) => j.id === id);
          if (!job) return;
          updateJob(id, (j) => ({
            ...j,
            ...describeInput(j.integrationId, newInput),
            input: newInput,
            status: 'queued',
            nextRetryAt: null,
            error: null,
            attempts: 0,
            source: 'reprocessamento',
            updatedAt: new Date().toISOString(),
            timeline: [...j.timeline, { stage: 'corrected', status: 'info', message: `Dado corrigido por ${who()}: ${note}`, at: new Date().toISOString() }],
          }));
          get().log('Corrigiu dado e reprocessou', `${job.reference} (${job.id})`, note);
        },
        reprocess(ids) {
          const now = new Date().toISOString();
          set((s) => ({
            jobs: s.jobs.map((j) =>
              ids.includes(j.id)
                ? {
                    ...j,
                    status: 'queued',
                    error: null,
                    nextRetryAt: null,
                    attempts: 0,
                    source: 'reprocessamento',
                    updatedAt: now,
                    timeline: [...j.timeline, { stage: 'reprocess', status: 'info', message: `Reprocessamento solicitado por ${who()}.`, at: now }],
                  }
                : j,
            ),
          }));
          const jobs = get().jobs.filter((j) => ids.includes(j.id));
          if (ids.length === 1) get().log('Reprocessou item', `${jobs[0]?.reference} (${ids[0]})`, 'Reprocessamento manual.');
          else get().log('Reprocessou em lote', `${ids.length} itens`, jobs.map((j) => j.reference).slice(0, 12).join(', ') + (ids.length > 12 ? '…' : ''));
        },
        ignore(ids, reason) {
          const now = new Date().toISOString();
          set((s) => ({
            jobs: s.jobs.map((j) =>
              ids.includes(j.id)
                ? {
                    ...j,
                    status: 'ignored',
                    ignoredReason: reason,
                    nextRetryAt: null,
                    updatedAt: now,
                    timeline: [...j.timeline, { stage: 'ignored', status: 'info', message: `Ignorado por ${who()}: "${reason}"`, at: now }],
                  }
                : j,
            ),
          }));
          const jobs = get().jobs.filter((j) => ids.includes(j.id));
          get().log(ids.length > 1 ? 'Ignorou itens em lote' : 'Ignorou item', ids.length > 1 ? `${ids.length} itens` : `${jobs[0]?.reference} (${ids[0]})`, reason);
        },
        setSyncBatch(id, batch) {
          set((s) => ({ syncBatches: { ...s.syncBatches, [id]: batch } }));
        },
        recordStat(id, ok, durationMs) {
          const hour = hourKey();
          set((s) => {
            const idx = s.stats.findIndex((x) => x.hour === hour && x.integrationId === id);
            const stats = s.stats.slice();
            const base: HourlyStat = idx >= 0 ? stats[idx] : { hour, integrationId: id, ok: 0, error: 0, totalDurationMs: 0 };
            const next = { ...base, ok: base.ok + (ok ? 1 : 0), error: base.error + (ok ? 0 : 1), totalDurationMs: base.totalDurationMs + (ok ? durationMs : 0) };
            if (idx >= 0) stats[idx] = next;
            else stats.push(next);
            const cutoff = Date.now() - 8 * 86400000;
            return { stats: stats.filter((x) => new Date(x.hour).getTime() >= cutoff) };
          });
        },

        setRules(id, rules, auditDetails) {
          set((s) => ({ profiles: { ...s.profiles, [id]: { ...s.profiles[id], rules } } }));
          const it = get().integrations.find((i) => i.id === id)!;
          get().log('Alterou mapeamento', it.name, auditDetails);
        },
        setLookupEntry(tableId, key, value) {
          set((s) => {
            const t = s.tables[tableId];
            const entries = { ...t.entries };
            if (value === null) delete entries[key];
            else entries[key] = value;
            return { tables: { ...s.tables, [tableId]: { ...t, entries } } };
          });
          const t = get().tables[tableId];
          get().log(value === null ? 'Removeu equivalência' : 'Adicionou equivalência', `Tabela "${t.name}"`, value === null ? key : `${key} → ${value}`);
        },

        reconcile(txId, titleId, mode) {
          const now = new Date().toISOString();
          set((s) => ({
            transactions: s.transactions.map((t) => (t.id === txId ? { ...t, reconciledWith: titleId, reconciledBy: mode } : t)),
            titles: s.titles.map((t) => (t.id === titleId ? { ...t, status: 'conciliado', paidAt: now } : t)),
          }));
          const tx = get().transactions.find((t) => t.id === txId);
          get().log('Conciliou recebimento', `Título ${titleId}`, `${mode === 'auto' ? 'Sugestão automática aceita' : 'Conciliação manual'}: ${tx?.description} (R$ ${tx?.amount.toFixed(2).replace('.', ',')}).`);
        },
        undoReconcile(txId) {
          const tx = get().transactions.find((t) => t.id === txId);
          if (!tx?.reconciledWith) return;
          const titleId = tx.reconciledWith;
          set((s) => ({
            transactions: s.transactions.map((t) => (t.id === txId ? { ...t, reconciledWith: null, reconciledBy: undefined } : t)),
            titles: s.titles.map((t) => (t.id === titleId ? { ...t, status: 'aberto', paidAt: undefined } : t)),
          }));
          get().log('Desfez conciliação', `Título ${titleId}`, tx.description);
        },

        saveAlertRule(rule) {
          const exists = get().alertRules.some((r) => r.id === rule.id);
          set((s) => ({ alertRules: exists ? s.alertRules.map((r) => (r.id === rule.id ? rule : r)) : [...s.alertRules, rule] }));
          get().log(exists ? 'Alterou regra de alerta' : 'Criou regra de alerta', rule.name, `${rule.enabled ? 'Ativa' : 'Inativa'} · limite ${rule.threshold} · janela ${rule.windowMin} min · canais: ${rule.channels.join(', ')}.`);
        },
        deleteAlertRule(id) {
          const r = get().alertRules.find((x) => x.id === id);
          set((s) => ({ alertRules: s.alertRules.filter((x) => x.id !== id) }));
          get().log('Excluiu regra de alerta', r?.name ?? id, '—');
        },
        addNotification(n) {
          set((s) => ({ notifications: [n, ...s.notifications].slice(0, 60) }));
        },
        markNotificationsRead(ids) {
          set((s) => ({ notifications: s.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) }));
        },
      };
    },
    {
      name: 'integra-hub-data',
      version: DATA_VERSION,
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (s) => {
        const { toasts: _t, syncBatches: _s, bootedAt: _b, liveMode: _l, theme: _th, ...rest } = s;
        // Funções não são serializadas; o restante é o estado da demonstração.
        return rest as unknown as HubState;
      },
      migrate: () => createSeedData() as unknown as HubState,
      onRehydrateStorage: () => (state) => {
        // Itens interrompidos por recarregar a página voltam para a fila.
        if (!state) return;
        const stuck = state.jobs.some((j) => j.status === 'processing');
        if (stuck) setTimeout(() => useHub.setState({ jobs: state.jobs.map((j) => (j.status === 'processing' ? { ...j, status: 'queued' as const } : j)) }), 0);
      },
    },
  ),
);

export const isAdmin = (u: DemoUser | null) => u?.role === 'admin';
