import { AlertTriangle, CheckCircle2, CircleDashed, Clock, EyeOff, Info, Loader2, RotateCcw, X, XCircle } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { HealthStatus, JobStatus } from '../domain/types';
import { useHub } from '../store/useHub';

export const JOB_STATUS: Record<JobStatus, { label: string; cls: string; icon: ReactNode }> = {
  queued: { label: 'Na fila', cls: 'b-muted', icon: <Clock size={13} aria-hidden /> },
  processing: { label: 'Processando', cls: 'b-info', icon: <Loader2 size={13} className="spin" aria-hidden /> },
  done: { label: 'Concluído', cls: 'b-ok', icon: <CheckCircle2 size={13} aria-hidden /> },
  error: { label: 'Erro', cls: 'b-err', icon: <XCircle size={13} aria-hidden /> },
  reprocessed: { label: 'Reprocessado', cls: 'b-ok', icon: <RotateCcw size={13} aria-hidden /> },
  ignored: { label: 'Ignorado', cls: 'b-muted', icon: <EyeOff size={13} aria-hidden /> },
};

export function StatusBadge({ status, retrying }: { status: JobStatus; retrying?: boolean }) {
  if (status === 'queued' && retrying) {
    return (
      <span className="badge b-warn">
        <RotateCcw size={13} aria-hidden /> Aguardando retentativa
      </span>
    );
  }
  const s = JOB_STATUS[status];
  return (
    <span className={`badge ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

export const HEALTH: Record<HealthStatus, { label: string; cls: string; dot: string }> = {
  online: { label: 'Online', cls: 'b-ok', dot: 'dot-ok' },
  slow: { label: 'Lento', cls: 'b-warn', dot: 'dot-warn' },
  down: { label: 'Com falha', cls: 'b-err', dot: 'dot-err' },
  paused: { label: 'Pausada', cls: 'b-muted', dot: 'dot-muted' },
};

export function HealthBadge({ health }: { health: HealthStatus }) {
  const h = HEALTH[health];
  return (
    <span className={`badge ${h.cls}`}>
      <span className={`dot ${h.dot} ${health === 'down' ? 'pulse' : ''}`} aria-hidden /> {h.label}
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled, live, hideLabel, children }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; live?: boolean; hideLabel?: boolean; children?: ReactNode }) {
  return (
    <label className={`switch ${live ? 'live' : ''}`}>
      <input type="checkbox" role="switch" aria-label={children ? label : undefined} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-checked={checked} />
      <span className="track" aria-hidden />
      {children ?? <span className={hideLabel ? 'sr-only' : 'small strong'}>{label}</span>}
    </label>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      {children && <p className="small" style={{ maxWidth: 420, margin: '0 auto' }}>{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden />;
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

/** Mantém o foco dentro do painel enquanto aberto. */
function useFocusTrap(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'));
    (focusables()[0] ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [ref]);
}

export function Modal({ title, children, footer, onClose, labelId = 'modal-title' }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; labelId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useFocusTrap(ref);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelId} ref={ref} tabIndex={-1}>
        <div className="modal-head row between">
          <h2 id={labelId}>{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
  );
}

export function Drawer({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useFocusTrap(ref);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1}>
        {children}
      </aside>
    </>
  );
}

export function Toaster() {
  const toasts = useHub((s) => s.toasts);
  const dismiss = useHub((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div style={{ marginTop: 1 }} aria-hidden>
            {t.kind === 'success' ? <CheckCircle2 size={18} color="#0aac23" /> : t.kind === 'error' ? <AlertTriangle size={18} color="#dc3c3d" /> : <Info size={18} color="#2370cd" />}
          </div>
          <div style={{ flex: 1 }}>
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** JSON formatado com realce simples de sintaxe. */
export function JsonView({ value, label }: { value: unknown; label: string }) {
  const text = JSON.stringify(value ?? null, null, 2) ?? 'null';
  const parts: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<span key={i++} className={m[2] ? 'k' : 's'}>{m[1]}</span>, m[2] ?? '');
    else if (m[3]) parts.push(<span key={i++} className="b">{m[3]}</span>);
    else parts.push(<span key={i++} className="n">{m[4]}</span>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return (
    <pre className="json" tabIndex={0} aria-label={label}>
      {parts}
    </pre>
  );
}

export function Progress({ value, total, label }: { value: number; total: number; label: string }) {
  const indeterminate = total === 0;
  const pct = indeterminate ? 0 : Math.round((value / total) * 100);
  return (
    <div className={`progress ${indeterminate ? 'indeterminate' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : pct}>
      <div style={{ width: indeterminate ? undefined : `${pct}%` }} />
    </div>
  );
}

export function Pending() {
  return <CircleDashed size={14} aria-hidden />;
}
