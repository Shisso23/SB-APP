import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from '../../services/auth/firebase';
import { adminLink, Feedback, Icon, AdminIconName } from './admin-ui';
import './admin.css';

const groups = [
  { label: 'Workspace', links: [{ key: 'overview', label: 'Overview', title: 'Operations overview' }] },
  { label: 'Football intelligence', links: [
    { key: 'coverage', label: 'League coverage', title: 'League coverage' },
    { key: 'fixtures', label: 'Fixtures', title: 'Fixtures' },
    { key: 'predictions', label: 'Predictions', title: 'Predictions & preview' },
    { key: 'picks', label: 'Daily picks', title: 'Official daily picks' },
    { key: 'history', label: 'Historical results', title: 'Historical results' },
  ] },
  { label: 'Operations', links: [
    { key: 'operations', label: 'Manual operations', title: 'Manual operations' },
    { key: 'schedules', label: 'Schedules', title: 'Ingestion schedules' },
    { key: 'executions', label: 'Execution history', title: 'Execution history' },
  ] },
  { label: 'Business', links: [
    { key: 'customers', label: 'Customers', title: 'Customer directory' },
    { key: 'referrals', label: 'Referrals', title: 'Customer referrals' },
    { key: 'passes', label: 'Access passes', title: 'Access pass catalogue' },
    { key: 'payments', label: 'Payments', title: 'Payment attempts' },
    { key: 'traffic', label: 'Traffic', title: 'Visitor analytics' },
  ] },
] as const;

const views = groups.flatMap(group => Array.from<{ key: AdminIconName; label: string; title: string }>(group.links));
export const resolveView = (value: string | null): AdminIconName => views.find(view => view.key === value)?.key ?? 'overview';

export default function AdminShell({ view, date, email, busy, subtitle, actions, children }: {
  view: AdminIconName; date?: string; email?: string | null; busy: boolean;
  subtitle: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState(false);
  const navToggle = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const account = useRef<HTMLDetailsElement>(null);
  const previousView = useRef(view);
  const page = views.find(item => item.key === view);
  const group = groups.find(entry => entry.links.some(item => item.key === view));
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    setMobileOpen(false);
    if (account.current) account.current.open = false;
    headingRef.current?.focus();
  }, [view]);
  return <div className={`ax-shell${collapsed ? ' ax-collapsed' : ''}${mobileOpen ? ' ax-menu-open' : ''}`}
    onKeyDown={event => {
      if (event.key === 'Escape' && mobileOpen) { setMobileOpen(false); navToggle.current?.focus(); }
      if (event.key === 'Escape' && account.current?.open) { account.current.open = false; account.current.querySelector('summary')?.focus(); }
    }}>
    <a className="ax-skip" href="#admin-content">Skip to content</a>
    <aside className="ax-sidebar" id="admin-sidebar">
      <Link to={adminLink('overview', date)} className="ax-brand" aria-label="PredictXI admin overview">
        <span className="ax-brand-mark" aria-hidden="true"><Icon name="predictions" /></span>
        <span className="ax-brand-copy"><strong>PredictXI</strong><small>Admin workspace</small></span>
      </Link>
      <nav aria-label="Admin navigation">
        {groups.map(section => <div className="ax-nav-group" key={section.label}>
          <p>{section.label}</p>
          {section.links.map(item => <Link key={item.key} className="ax-nav-link" to={adminLink(item.key, date)}
            title={item.label} aria-label={item.label} aria-current={view === item.key ? 'page' : undefined}
            onClick={() => { if (view === item.key) { setMobileOpen(false); headingRef.current?.focus(); } }}>
            <Icon name={item.key} /><span>{item.label}</span>
          </Link>)}
        </div>)}
      </nav>
      <div className="ax-side-footer"><span>SAST · UTC+2</span><button className="ax-icon-button" type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(value => !value)}><Icon name="sidebar" /></button></div>
    </aside>
    <div className="ax-main">
      <header className="ax-topbar">
        <button className="ax-icon-button ax-mobile-toggle" type="button" aria-label="Admin menu" aria-expanded={mobileOpen} aria-controls="admin-sidebar" ref={navToggle} onClick={() => setMobileOpen(value => !value)}><Icon name="menu" /></button>
        <nav className="ax-crumb" aria-label="Breadcrumb"><Link to={adminLink('overview', date)}>Admin</Link><span aria-hidden="true">/</span><span aria-current="page">{group?.label}</span></nav>
        <div className="ax-account">
          <details ref={account}><summary><Icon name="account" /><span>Account</span></summary>
            <div className="ax-account-menu"><p>{email || 'Signed-in administrator'}</p>
              {busy ? <p>Wait for the direct request to finish before leaving the workspace.</p> : <>
                <Link to="/">Customer site <Icon name="arrow" /></Link>
                <Link to="/#account">My account</Link>
                <button type="button" onClick={() => { setError(false); void signOut().catch(() => setError(true)); }}>Sign out</button>
              </>}
            </div>
          </details>
        </div>
      </header>
      <main className="ax-content" id="admin-content">
        <header className="ax-page-head">
          <div><p className="ax-kicker"><span />{group?.label}</p><h1 ref={headingRef} tabIndex={-1}>{page?.title}</h1><p>{subtitle}</p></div>
          {actions && <div className="ax-page-actions">{actions}</div>}
        </header>
        {busy && <Feedback>A direct request is in progress. Keep this workspace open. <Link to={adminLink('operations', date)}>View manual operations</Link></Feedback>}
        {error && <Feedback error>Sign-out failed. Try again from the account menu.</Feedback>}
        {children}
      </main>
    </div>
  </div>;
}
