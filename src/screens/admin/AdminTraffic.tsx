import React, { useCallback, useState } from 'react';
import { getAdminTraffic } from '../../services/admin';
import { Feedback, Panel, Pagination, sastTime } from './admin-ui';
import useAdminResource from './useAdminResource';

export default function AdminTraffic({ revision }: { revision: number }) {
  const [page, setPage] = useState(1);
  const load = useCallback(() => getAdminTraffic(page), [page]);
  const traffic = useAdminResource(`traffic:${page}:${revision}`, load);
  return <>
    {traffic.loading && <Feedback>Loading visitor analytics…</Feedback>}
    {traffic.error && <Feedback error>{traffic.error}</Feedback>}
    {traffic.data && <>
      <dl className="ax-metrics">
        <div className="ax-metric"><dt>Recorded visits</dt><dd>{traffic.data.total}</dd><small>Lifetime</small></div>
        <div className="ax-metric"><dt>Distinct visitor keys</dt><dd>{traffic.data.uniqueVisitors}</dd><small>Lifetime</small></div>
        <div className="ax-metric"><dt>Visits today</dt><dd>{traffic.data.visitsToday}</dd><small>Server reporting day · UTC</small></div>
      </dl>
      <Panel title="Recent page views">
        {traffic.data.visitors.length ? <div className="ax-table-wrap" tabIndex={0} role="region" aria-label="Recent page views"><table className="ax-table"><thead><tr>
          {['Visited (SAST)', 'Page', 'Device', 'Browser', 'System'].map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{traffic.data.visitors.map(event => <tr key={event.id}><td>{sastTime(event.visitedAt)}</td><td className="break-all">{event.pagePath.split(/[?#]/)[0]}</td><td>{event.deviceType || '—'}</td><td>{event.browser || '—'}</td><td>{event.operatingSystem || '—'}</td></tr>)}</tbody>
        </table></div> : <p className="ax-empty">No visits recorded.</p>}
        <Pagination page={page} totalPages={traffic.data.totalPages} onPage={setPage} />
      </Panel>
    </>}
  </>;
}
