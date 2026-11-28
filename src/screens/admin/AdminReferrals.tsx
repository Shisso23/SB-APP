import React, { useCallback, useState } from 'react';
import { getAdminReferrals, ReferralStatus, referralStatusLabels } from '../../services/referrals';
import { Badge, Feedback, Pagination, Panel, sastTime } from './admin-ui';
import useAdminResource from './useAdminResource';

export default function AdminReferrals({ revision }: { revision: number }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ReferralStatus | ''>('');
  const [page, setPage] = useState(1);
  const load = useCallback(() => getAdminReferrals(page, query, status), [page, query, status]);
  const result = useAdminResource(`${page}:${query}:${status}:${revision}`, load);
  const data = result.data;

  return <>
    {data && <dl className="ax-metrics" aria-label="Lifetime referral totals">
      {[
        ['Registered referrals', data.summary.registered],
        ['Qualifying referrals', data.summary.qualified],
        ['Premium days awarded', data.summary.daysAwarded],
        ['Reversed rewards', data.summary.reversed],
      ].map(([label, value]) => <div className="ax-metric" key={label}><dt>{label}</dt><dd>{value}</dd><small>Lifetime</small></div>)}
    </dl>}
    <Panel title="Referral activity" subtitle="Referral access is recorded separately from paid passes and revenue.">
      <form className="ax-toolbar" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <label>Customer email or ID<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <button type="submit" className="ax-button ax-primary self-end">Search</button>
        <label>Status<select value={status} onChange={event => { setStatus(event.target.value as ReferralStatus | ''); setPage(1); }}>
          <option value="">All statuses</option>
          {Object.entries(referralStatusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>
      </form>
      {result.loading && <Feedback>Loading referral activity…</Feedback>}
      {result.error && <Feedback error>Referral activity could not be loaded. Refresh to retry.</Feedback>}
      {data && (data.history.length ? <div className="ax-table-wrap" role="region" aria-label="Referral activity table" tabIndex={0}>
        <table className="ax-table"><thead><tr>{['Referrer', 'Referred customer', 'Registered (SAST)', 'Status', 'Qualifying purchase and grant'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{data.history.map(entry => <tr key={entry.id}>
            <td className="break-all">{entry.referrer.email || 'No email on record'} <small>#{entry.referrer.id}</small></td>
            <td className="break-all">{entry.referred.email || 'No email on record'} <small>#{entry.referred.id}</small></td>
            <td>{sastTime(entry.registeredAt)}</td>
            <td><Badge state={entry.status === 'rewarded' ? 'active' : entry.status === 'reversed' ? 'revoked' : 'pending'} label={referralStatusLabels[entry.status]} /></td>
            <td>{entry.reward ? <details><summary className="cursor-pointer font-semibold">Purchase #{entry.purchaseId} · {entry.reward.days} day awarded</summary>
              <p className="mt-2">Payment status · {entry.purchaseStatus}</p>
              <p>Paid grant #{entry.paidGrantId} · reward entitlement #{entry.rewardEntitlementId}</p>
              <p>Reward granted {sastTime(entry.reward.grantedAt)} SAST</p>
              {entry.reward.reversedAt && <p>Reversed {sastTime(entry.reward.reversedAt)} SAST · {Math.floor(entry.reward.reversedSeconds / 3600)} unused hours removed</p>}
            </details> : '—'}</td>
          </tr>)}</tbody>
        </table></div> : <p className="ax-empty">No referrals match these filters.</p>)}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} disabled={result.loading} />}
    </Panel>
  </>;
}
