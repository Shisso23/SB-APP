import React, { useCallback, useEffect, useState } from 'react';

import { getAdminUsers, grantAdminUserAccess } from '../../services/admin';
import type { AdminUserRecord } from '../../services/admin/types';
import { describeFailure } from '../../services/api/failures';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : '—';

const GrantAccessForm: React.FC<{
  user: AdminUserRecord;
  onCancel: () => void;
  onGranted: (endsAt: string) => void;
}> = ({ user, onCancel, onGranted }) => {
  const [duration, setDuration] = useState('1');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState<{ requestId: string; durationDays: number; reason: string }>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const days = Number(duration);
    if (!Number.isInteger(days) || days < 1 || days > 90 || !reason.trim()) return;
    const request = submitted ?? { requestId: crypto.randomUUID(), durationDays: days, reason: reason.trim() };
    setSubmitted(request);
    setSending(true);
    setError('');
    try {
      const { data } = await grantAdminUserAccess(user.id, request);
      onGranted(data.endsAt);
    } catch {
      setError('Could not confirm the grant. Retry to check the same request.');
    } finally {
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

const AdminUsersPanel: React.FC = () => {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [grantTarget, setGrantTarget] = useState<AdminUserRecord>();
  const [grantMessage, setGrantMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage: number, nextSearch: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await getAdminUsers(nextPage, 25, nextSearch);
      setUsers(response.data.users);
      setPage(response.data.page);
      setTotalPages(response.data.totalPages);
      setTotal(response.data.total);
    } catch (caught) {
      setError(`Could not load users: ${describeFailure(caught)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page, submittedSearch); }, [load]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmittedSearch(search);
    setPage(1);
    void load(1, search);
  };

  return (
    <section aria-labelledby="admin-users-heading" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-users-heading" className="text-lg font-bold">Users</h2>
          <p className="mt-1 text-sm text-slate-600">{total} account{total === 1 ? '' : 's'}</p>
        </div>
        <button type="button" onClick={() => void load(page, submittedSearch)} disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
          Refresh
        </button>
      </div>

      <form onSubmit={submitSearch} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="admin-user-search">Search users</label>
        <input id="admin-user-search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Search email, Firebase UID, or user ID"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Search
        </button>
      </form>

      {grantTarget && <GrantAccessForm key={grantTarget.id} user={grantTarget} onCancel={() => setGrantTarget(undefined)}
        onGranted={endsAt => {
          setGrantMessage(`Prediction access granted to user #${grantTarget.id} through ${formatDate(endsAt)}.`);
          setGrantTarget(undefined);
          void load(page, submittedSearch);
        }} />}
      {grantMessage && <p role="status" className="mt-3 text-sm text-teal-800">{grantMessage}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {loading && <p role="status" className="mt-3 text-sm text-slate-500">Loading users…</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <caption className="sr-only">Paginated application users and membership state</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Membership</th>
              <th className="px-3 py-2">Latest purchase</th>
              <th className="px-3 py-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-3">
                  {user.email ? (
                    <>
                      <div className="font-semibold text-slate-900">{user.email}</div>
                      <div className="mt-1 max-w-[280px] break-all font-mono text-xs text-slate-500">{user.firebaseUid}</div>
                    </>
                  ) : (
                    <>
                      <div className="mt-1 font-semibold text-slate-400">No email on record</div>
                      <div className="mt-1 max-w-[280px] break-all font-mono text-xs text-slate-500">
                        Firebase UID: {user.firebaseUid}
                      </div>
                    </>
                  )}
                  <div className="mt-1 text-xs text-slate-600">
                    {user.phoneNumber ? `Phone ${user.phoneNumber} · unverified` : 'No phone on record'}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {user.isStaff && <span className="ml-2 rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Staff</span>}
                  {user.isSuperuser && <span className="ml-2 rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">Superuser</span>}
                </td>
                <td className="px-3 py-3">
                  <div className={`font-semibold ${user.membership.active ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {user.membership.active ? 'Active membership' : 'No active membership'}
                  </div>
                  {user.membership.endsAt && <div className="mt-1 text-xs text-slate-500">Ends {formatDate(user.membership.endsAt)}</div>}
                  {user.membership.revoked && <div className="text-xs font-semibold text-rose-700">Previously revoked</div>}
                  {user.isActive && !user.isStaff && !user.isSuperuser && (
                    <button type="button" disabled={loading || !!grantTarget}
                      onClick={() => { setGrantMessage(''); setGrantTarget(user); }}
                      className="mt-1 min-h-[44px] text-xs font-bold text-teal-800 underline underline-offset-4 disabled:opacity-50">
                      Grant access <span className="sr-only">to user #{user.id}</span>
                    </button>
                  )}
                </td>
                <td className="px-3 py-3">
                  {user.latestPurchase ? (
                    <>
                      <div className="font-medium">{user.latestPurchase.productName}</div>
                      <div className="text-xs text-slate-500">{user.latestPurchase.status} · {user.latestPurchase.provider}</div>
                      <div className="mt-1 text-xs text-slate-500">{user.latestPurchase.currency} {user.latestPurchase.amountExpected} · {formatDate(user.latestPurchase.createdAt)}</div>
                    </>
                  ) : <span className="text-slate-400">No purchase</span>}
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">{formatDate(user.createdAt)}</td>
              </tr>
            ))}
            {!loading && !users.length && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Page {page} of {Math.max(totalPages, 1)}</p>
        <div className="flex gap-2">
          <button type="button" disabled={loading || page <= 1} onClick={() => { const next = page - 1; setPage(next); void load(next, submittedSearch); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Previous</button>
          <button type="button" disabled={loading || page >= totalPages} onClick={() => { const next = page + 1; setPage(next); void load(next, submittedSearch); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Next</button>
        </div>
      </div>
    </section>
  );
};

export default AdminUsersPanel;
