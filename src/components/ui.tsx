'use client';
// ============================================================================
// Small presentational building blocks shared by every tab
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import type { ReactNode } from 'react';

// PostgreSQL NUMERIC / BIGINT arrive as strings - normalise for display.
export const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
export const fmt = (v: unknown): string => num(v).toLocaleString('en-IN');
export const fmtTime = (v: unknown): string => (v ? new Date(String(v)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDateTime = (v: unknown): string =>
  v ? new Date(String(v)).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
/** "OUT_OF_STOCK" -> "Out of stock" */
export const humanize = (s: unknown): string => {
  const t = String(s ?? '').replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const TONE: Record<string, string> = {
  CRITICAL: 'critical', FAILED: 'critical', OUT_OF_STOCK: 'critical', OVERCROWDED: 'critical', REJECTED: 'critical',
  HIGH: 'high', PENDING: 'high', LOW_STOCK: 'high', PARTIALLY_FULFILLED: 'high', IN_TRANSIT: 'high', UNRESOLVED: 'high', MAINTENANCE: 'high',
  MEDIUM: 'medium', MODERATE: 'medium', APPROVED: 'medium', DISPATCHED: 'medium', PREPARING: 'medium', ASSIGNED: 'medium', VERIFIED: 'medium',
  LOW: 'low', OFFLINE: 'low', CLOSED: 'low',
  SUFFICIENT: 'success', DELIVERED: 'success', FULFILLED: 'success', AVAILABLE: 'success', OPERATIONAL: 'success', RESOLVED: 'success', ACTIVE: 'critical',
};

export function Badge({ value, tone, children }: { value?: string; tone?: string; children?: ReactNode }) {
  const t = tone ?? TONE[value ?? ''] ?? 'medium';
  return <span className={`badge badge-${t}`}>{children ?? humanize(value)}</span>;
}

export function Panel({
  title, subtitle, icon, actions, accent, children,
}: {
  title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode; accent?: boolean; children: ReactNode;
}) {
  return (
    <section className={`panel${accent ? ' accent' : ''}`}>
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{icon}{title}</h2>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Progress({ pct, warnAt = 75, dangerAt = 90 }: { pct: unknown; warnAt?: number; dangerAt?: number }) {
  const p = num(pct);
  const cls = p >= dangerAt ? ' danger' : p >= warnAt ? ' warn' : '';
  return (
    <div className="progress">
      <div className="progress-track"><div className={`progress-fill${cls}`} style={{ width: `${Math.min(100, p)}%` }} /></div>
      <span className="progress-label">{p.toFixed(1)}%</span>
    </div>
  );
}

export function Field({ label, hint, warn, children }: { label: string; hint?: ReactNode; warn?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <em className={`hint${warn ? ' warn' : ''}`}>{hint}</em>}
    </label>
  );
}

/** Loading / error / empty wrapper for data-driven sections. */
export function Async({ loading, error, empty, emptyText = 'Nothing to show yet.', children }: {
  loading: boolean; error: string | null; empty?: boolean; emptyText?: string; children: ReactNode;
}) {
  if (error) return <div className="alert alert-error">{error}</div>;
  if (loading && empty) return <div className="skeleton" />;
  if (empty) return <div className="empty">{emptyText}</div>;
  return <>{children}</>;
}

export function Table({ head, children, empty, emptyText }: { head: ReactNode[]; children: ReactNode; empty?: boolean; emptyText?: string }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {empty ? <tr><td className="table-empty" colSpan={head.length}>{emptyText ?? 'No rows.'}</td></tr> : children}
        </tbody>
      </table>
    </div>
  );
}
