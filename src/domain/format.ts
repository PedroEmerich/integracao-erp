// Formatadores pt-BR e exportação CSV.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR');

export const fmtBRL = (v: number | undefined | null) => (v === undefined || v === null || Number.isNaN(v) ? '—' : brl.format(v));
export const fmtNum = (v: number) => num.format(v);
export const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits).replace('.', ',')}%`;

export function fmtDuration(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca';
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 5) return 'agora';
  if (diff < 60) return `há ${diff} s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com separador ";" (padrão do Excel em pt-BR) e BOM para acentuação. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function downloadFile(filename: string, content: string | Blob, mime = 'text/csv;charset=utf-8') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
