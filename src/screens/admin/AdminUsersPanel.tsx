import React, { useCallback, useEffect, useState } from 'react';

import { getAdminUsers } from '../../services/admin';
import type { AdminUserRecord } from '../../services/admin/types';
import { describeFailure } from '../../services/api/failures';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : '—';

const AdminUsersPanel: React.FC = () => {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
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
          placeholder="Search email or Firebase UID"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Search
        </button>
      </form>

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
