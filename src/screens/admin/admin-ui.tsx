import React from 'react';
import { Link } from 'react-router-dom';

export const adminLink = (view: string, date?: string) => {
  const params = new URLSearchParams();
  if (view !== 'overview') params.set('view', view);
  if (date) params.set('date', date);
  return params.toString() ? `/admin?${params.toString()}` : '/admin';
};

export const sastDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (key: string) => parts.find(entry => entry.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const sastTime = (value?: string | Date | null) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
};

export const durationText = (start?: string | null, finish?: string | null) => {
  if (!start || !finish) return '—';
  const seconds = Math.round((Date.parse(finish) - Date.parse(start)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const paths = {
  overview: 'M3 3h7v8H3zM14 3h7v5h-7zM3 15h7v6H3zM14 12h7v9h-7z',
  coverage: 'M3 3h18v18H3zM3 9h18M9 9v12',
  fixtures: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h2m4 0h2m-8 3h2',
  predictions: 'M3 20h18M5 16l5-6 4 3 6-8m-4 0h4v4',
  picks: 'm3 6 2 2 3-4m3 3h10M3 13h5m3 0h10M3 19h5m3 0h10',
  history: 'M3 11a9 9 0 1 1 2 7m-2-7V5m0 6h6m3-4v5l3 2',
  operations: 'm13 2-9 12h7l-1 8 10-12h-7z',
  schedules: 'M4 5h16v15H4zM4 9h16M8 3v4m8-4v4m-4 5v3l2 1',
  executions: 'M3 12h4l3-7 4 14 3-7h4',
  customers: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m16-6a4 4 0 0 1 4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8-8a4 4 0 0 1 0 8',
  passes: 'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zm10 2v2m0 4v2',
  payments: 'M3 5h18v14H3zM3 9h18M7 15h4',
  traffic: 'M4 20h16M6 16v-4m6 4V4m6 12V8',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sidebar: 'M3 4h18v16H3zM9 4v16m7-11-3 3 3 3',
  arrow: 'M4 12h15m-5-5 5 5-5 5',
  refresh: 'M20 8A8 8 0 0 0 6 5L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5',
  alert: 'M12 8v5m0 3v1M3 20h18L12 3z',
  account: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};
export type AdminIconName = keyof typeof paths;
export const Icon = ({ name }: { name: AdminIconName }) => <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;

const states: Record<string, [string, string]> = {
  active: ['Active', 'good'], completed: ['Completed', 'good'], published: ['Published', 'good'],
  ok: ['Completed', 'good'], won: ['Correct', 'good'], granted: ['Grant recorded', 'good'],
  running: ['Running', 'info'], refreshing: ['Refreshing', 'info'], queued: ['Queued', 'info'],
  pending: ['Pending', 'warn'], stale: ['Stale', 'warn'], unresolved: ['Unresolved', 'warn'],
  failed: ['Failed', 'bad'], lost: ['Incorrect', 'bad'], revoked: ['Revoked', 'bad'],
  cancelled: ['Cancelled', 'neutral'], void: ['Void', 'neutral'],
  not_generated: ['Not generated', 'neutral'], no_eligible_fixtures: ['No eligible fixtures', 'neutral'],
};
export const Badge = ({ state, label }: { state: string; label?: string }) => {
  const [name, tone] = states[state] ?? [state.replace(/[_-]/g, ' '), 'neutral'];
  const glyph = { good: '✓', info: state === 'queued' ? '⋯' : '◐', warn: '◈', bad: '×', neutral: '–' }[tone];
  return <span className={`ax-badge ax-badge--${tone}`}><span aria-hidden="true">{glyph}</span>{label ?? name}</span>;
};

export const Panel = ({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) => <section className="ax-panel">
  <header className="ax-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}
</section>;

export const AdminButtonLink = ({ view, date, children, primary = false }: { view: string; date?: string; children: React.ReactNode; primary?: boolean }) =>
  <Link className={`ax-button${primary ? ' ax-primary' : ''}`} to={adminLink(view, date)}>{children}<Icon name="arrow" /></Link>;

export const Feedback = ({ children, error = false }: { children: React.ReactNode; error?: boolean }) =>
  <p className={`ax-feedback${error ? ' ax-feedback--error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p>;

export const Pagination = ({ page, totalPages, onPage, disabled }: {
  page: number; totalPages: number; onPage: (page: number) => void; disabled?: boolean;
}) => <div className="ax-pagination">
  <span>Page {page.toLocaleString('en-ZA')} of {Math.max(1, totalPages).toLocaleString('en-ZA')}</span>
  <div><button type="button" className="ax-button" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1}>Previous</button>
  <button type="button" className="ax-button" onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages}>Next</button></div>
</div>;
