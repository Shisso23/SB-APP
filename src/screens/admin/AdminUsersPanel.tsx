import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminLink, Badge, Feedback, Pagination, Panel, sastTime } from './admin-ui';
import useAdminResource from './useAdminResource';

import { getAdminUsers, grantAdminUserAccess } from '../../services/admin';
import type { AdminUserRecord } from '../../services/admin/types';


const GrantAccessForm: React.FC<{
  user: AdminUserRecord;
  onCancel: () => void;
  onGranted: (endsAt: string) => void;
}> = ({ user, onCancel, onGranted }) => {
  const [duration, setDuration] = useState('1');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState<{ requestId: string; durationDays: number; reason: string }>();
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const days = Number(duration);
    if (!Number.isInteger(days) || days < 1 || days > 90 || !reason.trim()) return;
    const request = submitted ?? { requestId: crypto.randomUUID(), durationDays: days, reason: reason.trim() };
    inFlight.current = true;
    setSubmitted(request);
    setSending(true);
    setError('');
    try {
      const { data } = await grantAdminUserAccess(user.id, request);
      onGranted(data.endsAt);
    } catch {
      setError('Could not confirm the grant. Retry to check the same request.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <form aria-labelledby="grant-access-heading" onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
      <div>
        <h3 id="grant-access-heading" className="font-bold">Grant prediction access</h3>
        <p className="break-all text-sm text-slate-700">User #{user.id} · {user.email || user.firebaseUid}</p>
        <p className="mt-1 text-sm text-slate-700">Adds time to any active pass. The payment stays in its current state.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-semibold">Duration in days
          <input type="number" min={1} max={90} step={1} required value={duration} disabled={!!submitted}
            onChange={event => setDuration(event.target.value)} className="mt-1 block min-h-[44px] w-28 rounded-lg border border-slate-400 bg-white px-3" />
        </label>
        <label className="min-w-0 flex-1 text-sm font-semibold">Reason
          <input required maxLength={240} value={reason} disabled={!!submitted} placeholder="e.g. Pending payment accommodation"
            onChange={event => setReason(event.target.value)} className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-400 bg-white px-3" />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={sending || !reason.trim()} className="min-h-[44px] rounded-lg bg-teal-800 px-4 text-sm font-bold text-white disabled:opacity-60">
          {sending ? 'Granting…' : error ? 'Retry grant' : 'Confirm access grant'}
        </button>
        <button type="button" disabled={sending} onClick={onCancel} className="min-h-[44px] rounded-lg border border-slate-400 px-4 text-sm font-semibold">Cancel</button>
      </div>
    </form>
  );
};

const attemptLabel: Record<string, string> = {
  created: 'Created', pending: 'Pending provider confirmation', provider_confirmed: 'Provider confirmed',
  granted: 'Access grant recorded', declined: 'Declined', expired: 'Attempt expired',
  refunded: 'Refunded', needs_review: 'Needs manual review',
};

const Membership = ({ user }: { user: AdminUserRecord }) => <>
  <Badge state={user.membership.active ? 'active' : 'no active access'} label={user.membership.active ? 'Active membership' : 'No active membership'} />
  {user.membership.endsAt && <p className="ax-muted mt-1 text-xs">Ends {sastTime(user.membership.endsAt)} SAST</p>}
  {user.membership.revoked && <p className="text-xs text-rose-800">A previous grant was revoked</p>}
</>;

export default function AdminUsersPanel({ mode = 'customers' }: { mode?: 'customers' | 'payments' }) {
  const payments = mode === 'payments';
  const [query, setQuery] = useState({ page: 1, search: '' });
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('all');
  const [grantTarget, setGrantTarget] = useState<AdminUserRecord>();
  const [grantMessage, setGrantMessage] = useState('');
  const load = useCallback(() => getAdminUsers(query.page, 25, query.search), [query.page, query.search]);
  const resource = useAdminResource(`${query.page}:${query.search}:${revision}`, load);
  const data = resource.data;
  const displayed = data?.users.filter(user => {
    if (payments) return user.latestPurchase && (filter === 'all' || user.latestPurchase.status === filter);
    return filter === 'all' || (filter === 'active' ? user.membership.active : !user.membership.active);
  });
  return <Panel title={payments ? 'Latest attempt by account' : 'Users'}
    subtitle={payments ? 'Only each account’s most recent attempt is available. Amounts are expected checkout amounts.' :
      data && `${data.total.toLocaleString('en-ZA')} ${query.search ? 'matching' : 'registered'} accounts · newest first`}
    action={<button type="button" className="ax-button" disabled={resource.loading} onClick={() => setRevision(value => value + 1)}>Refresh</button>}>
    <form className="ax-toolbar" onSubmit={event => {
      event.preventDefault();
      setQuery({ page: 1, search: search.trim() });
      setRevision(value => value + 1);
    }}>
      <label htmlFor="admin-user-search">Search accounts</label>
      <input id="admin-user-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Email, Firebase UID, or user ID" />
      <button className="ax-button ax-primary" type="submit" disabled={resource.loading}>Search</button>
      <label className="sm:ml-auto">Filter current page <select value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">{payments ? 'All attempt statuses' : 'All access statuses'}</option>
        {payments ? Object.entries(attemptLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>) :
          <><option value="active">Active premium access</option><option value="inactive">No active premium access</option></>}
      </select></label>
    </form>
    {grantTarget && <GrantAccessForm key={grantTarget.id} user={grantTarget} onCancel={() => setGrantTarget(undefined)}
      onGranted={endsAt => {
        setGrantMessage(`Prediction access granted to user #${grantTarget.id} through ${sastTime(endsAt)} SAST.`);
        setGrantTarget(undefined);
        setRevision(value => value + 1);
      }} />}
    {grantMessage && <Feedback>{grantMessage}</Feedback>}
    {resource.loading && <Feedback>Loading accounts…</Feedback>}
    {resource.error && <Feedback error>Could not load accounts. {resource.error}</Feedback>}
    {displayed && <>
      {displayed.length ? <div className="ax-table-wrap" tabIndex={0} role="region" aria-label={payments ? 'Latest payment attempts table' : 'Customer directory table'}>
        <table className="ax-table"><thead><tr>
          {(payments ? ['Customer', 'Purchase attempt', 'Payment and grant', 'Effective access'] :
            ['Customer', 'Account', 'Effective access', 'Details and actions']).map(label => <th key={label} scope="col">{label}</th>)}
        </tr></thead><tbody>
          {displayed.map(user => {
            const attempt = user.latestPurchase;
            return <tr key={user.id}>
              <td className="break-all"><strong>{user.email || 'No email on record'}</strong><p className="ax-muted text-xs">User #{user.id}</p>
                {!payments && <p className="ax-muted text-xs">{user.phoneNumber ? `Phone ${user.phoneNumber} · unverified` : 'No phone on record'}</p>}</td>
              {payments && attempt ? <>
                <td><strong>{attempt.productName}</strong><p>{attempt.currency} {attempt.amountExpected} expected</p><p className="ax-muted text-xs">{attempt.provider} · Attempt #{attempt.id}</p>
                  <p className="ax-muted text-xs">Created {sastTime(attempt.createdAt)} SAST</p></td>
                <td><Badge state={attempt.status} label={attemptLabel[attempt.status]} />
                  <p className="ax-muted mt-1 text-xs">Updated {sastTime(attempt.updatedAt)} SAST</p>
                  {attempt.status === 'provider_confirmed' && <p className="mt-2 font-semibold text-amber-800">Provider confirmed · grant pending on this attempt</p>}
                  {attempt.status === 'granted' && !user.membership.active && <p className="mt-2 ax-muted text-xs">A grant was recorded. The account has no active entitlement now.</p>}</td>
                <td><Membership user={user} /></td>
              </> : <>
                <td><Badge state={user.isActive ? 'active' : 'inactive'} label={user.isActive ? 'Active account' : 'Inactive account'} />
                  {(user.isStaff || user.isSuperuser) && <p className="ax-muted text-xs">{user.isSuperuser ? 'Superuser' : 'Staff'}</p>}
                  <p className="ax-muted mt-1 text-xs">Joined {sastTime(user.createdAt)} SAST</p></td>
                <td><Membership user={user} /></td>
                <td>
                  <details><summary className="cursor-pointer font-semibold">Account details</summary>
                    <p className="mt-2 break-all text-xs">Firebase UID · {user.firebaseUid}</p>
                    <p className="text-xs">Access started · {sastTime(user.membership.startsAt)}{user.membership.startsAt ? ' SAST' : ''}</p>
                  </details>
                  {attempt && <p className="ax-muted mt-1 text-xs">Latest pass attempt · <span>{attempt.productName}</span> · {attemptLabel[attempt.status] ?? attempt.status}</p>}
                  {user.isActive && !user.isStaff && !user.isSuperuser && <button type="button" className="ax-button mt-2"
                    disabled={!!grantTarget} onClick={() => { setGrantMessage(''); setGrantTarget(user); }}>
                    Grant access <span className="sr-only">to user #{user.id}</span>
                  </button>}
                </td>
              </>}
            </tr>;
          })}
        </tbody></table>
      </div> : <p className="ax-empty">{payments ? 'No matching payment attempts on this page.' : 'No matching accounts on this page.'}</p>}
      {data && <Pagination page={data.page} totalPages={data.totalPages} disabled={resource.loading} onPage={page => setQuery(previous => ({ ...previous, page }))} />}
    </>}
    {payments && <Link className="ax-button mt-3" to={adminLink('customers')}>Open customer directory</Link>}
  </Panel>;
}
