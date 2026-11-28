import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAdminCoverage, getAdminJobs, getAdminStatus, getAdminUsers, getManualTasks } from '../../services/admin';
import type { AdminStatusResponse } from '../../services/admin/types';
import { getOfficialToday } from '../../services/official';
import SignInScreen from '../../components/auth/SignInScreen';
import { useAuth } from '../../services/auth/AuthProvider';
import { PremiumRequiredError, SessionExpiredError, SignInRequiredError } from '../../services/api/client';
import AccessProductsPanel from './AccessProductsPanel';
import AdminCoverage, { RunScope } from './AdminCoverage';
import AdminFootball from './AdminFootball';
import AdminOverview from './AdminOverview';
import AdminPublished from './AdminPublished';
import AdminSchedules from './AdminSchedules';
import AdminExecutions from './AdminExecutions';
import AdminTraffic from './AdminTraffic';
import AdminReferrals from './AdminReferrals';
import AdminShell, { resolveView } from './AdminShell';
import AdminUsersPanel from './AdminUsersPanel';
import ManualPredictionPanel from './ManualPredictionPanel';
import ManualTasksPanel from './ManualTasksPanel';
import { adminLink, Icon, sastDate } from './admin-ui';
import useAdminResource from './useAdminResource';

const subtitles = {
  overview: 'Review today’s football coverage, publication and operations.',
  coverage: 'Compare available fixtures, stored forecasts and publication by league.',
  fixtures: 'Browse stored matches, kickoff times and results for the selected date.',
  predictions: 'Generate forecasts by league, review a shortlist and inspect stored probabilities.',
  picks: 'Review the official published selections and their outcomes.',
  history: 'Explore published lists and individual selection performance.',
  operations: 'Run existing data and results operations for the selected scope.',
  schedules: 'Review schedule definitions, date-specific league scope and recorded ingestion runs.',
  executions: 'Inspect job records and the latest direct request for each league and operation.',
  customers: 'Find customer accounts, check effective access and issue support grants.',
  passes: 'Manage products offered at checkout.',
  payments: 'Review the latest purchase attempt per account alongside current access.',
  traffic: 'Review recorded visits and device information.',
  referrals: 'Review qualifying purchases, rewards, and referral access grants.',
};

const AccessMessage = ({ children }: { children: React.ReactNode }) =>
  <main className="grid min-h-[65vh] place-items-center px-4 py-10"><div className="max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-slate-900">{children}</div></main>;

const AccessDenied = ({ signedIn }: { signedIn: boolean }) => <AccessMessage>
  <h1 className="text-2xl font-bold">Admin access required</h1>
  <p className="my-3 text-slate-600">This workspace is limited to authorised administrators. Membership does not grant access to it.</p>
  {signedIn ? <Link className="font-bold text-teal-800 underline" to="/">Return to PredictXI</Link> :
    <details><summary className="cursor-pointer font-bold text-teal-800 underline">Sign in to the admin workspace</summary>
      <SignInScreen onSignedIn={() => undefined} />
    </details>}
</AccessMessage>;

export default function AdminScreen() {
  const { user, initialising } = useAuth();
  if (initialising) return <AccessMessage><p role="status">Checking access…</p></AccessMessage>;
  if (!user) return <AccessDenied signedIn={false} />;
  return <AuthenticatedAdmin key={user.uid} email={user.email} />;
}

function AuthenticatedAdmin({ email }: { email?: string | null }) {
  const [attempt, setAttempt] = useState(0);
  const check = useCallback(async () => {
    try { return await getAdminStatus(); } catch (error) {
      if (error instanceof SignInRequiredError || error instanceof SessionExpiredError || error instanceof PremiumRequiredError) {
        return { data: { isAdmin: false, isMember: false, configuredLeagues: [] } };
      }
      throw error;
    }
  }, []);
  const access = useAdminResource(String(attempt), check);
  if (access.loading) return <AccessMessage><p role="status">Checking access…</p></AccessMessage>;
  if (access.error) return <AccessMessage>
    <p role="alert" className="text-rose-800">We could not check admin access. Please try again.</p>
    <button className="mt-3 rounded-lg border px-4 py-2 font-semibold" type="button" onClick={() => setAttempt(value => value + 1)}>Retry access check</button>
  </AccessMessage>;
  if (!access.data?.isAdmin) return <AccessDenied signedIn />;
  return <Workspace status={access.data} email={email} />;
}

function Workspace({ status, email }: { status: AdminStatusResponse; email?: string | null }) {
  const [params, setParams] = useSearchParams();
  const view = resolveView(params.get('view'));
  const today = sastDate();
  const askedDate = params.get('date');
  const parsedDate = askedDate && /^\d{4}-\d{2}-\d{2}$/.test(askedDate) ? new Date(`${askedDate}T00:00:00Z`) : null;
  const date = parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === askedDate
    ? askedDate : today;
  const overview = view === 'overview';
  const dataDate = overview ? today : date;
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [manualRevision, setManualRevision] = useState(0);
  const [publishedRevision, setPublishedRevision] = useState(0);
  const [visited, setVisited] = useState({ predictions: false, operations: false, customers: false, passes: false });
  useEffect(() => {
    if ((view === 'predictions' || view === 'operations' || view === 'customers' || view === 'passes') && !visited[view]) {
      setVisited(previous => ({ ...previous, [view]: true }));
    }
  }, [view, visited]);

  const hasScope = view === 'coverage' || view === 'predictions' || view === 'operations';
  const getCoverage = useCallback(() => getAdminCoverage(dataDate), [dataDate]);
  const getJobs = useCallback(async () => ({ data: (await getAdminJobs(dataDate)).data.jobs }), [dataDate]);
  const getManual = useCallback(() => getManualTasks(dataDate), [dataDate]);
  const getTotal = useCallback(() => getAdminUsers(1, 1), []);
  const coverage = useAdminResource(overview || hasScope ? `${dataDate}:${revision}` : null, getCoverage);
  const jobs = useAdminResource(overview || view === 'executions' ? `${dataDate}:${revision}` : null, getJobs);
  const manual = useAdminResource(overview || view === 'operations' || view === 'executions' || view === 'predictions'
    ? `${dataDate}:${revision}:${manualRevision}` : null, getManual);
  const todaysList = useAdminResource(overview ? `today:${revision}:${publishedRevision}` : null, getOfficialToday);
  const customerTotal = useAdminResource(overview ? `total:${revision}` : null, getTotal);
  const dated = hasScope || ['fixtures', 'schedules', 'executions'].includes(view);
  const refresh = () => setRevision(value => value + 1);
  const updateManual = () => setManualRevision(value => value + 1);
  const actions = <>{dated && <label className="ax-toolbar !mb-0">Workflow date (SAST)
    <input type="date" value={date} disabled={busy} onChange={event => {
      const next = new URLSearchParams(params);
      if (event.target.value) next.set('date', event.target.value);
      else next.delete('date');
      setParams(next, { replace: true });
    }} /></label>}
    {(overview || dated || view === 'picks' || view === 'history' || view === 'traffic' || view === 'referrals') && <button type="button" className="ax-button" onClick={refresh} disabled={busy}><Icon name="refresh" /> Refresh</button>}</>;
  return <AdminShell view={view} date={date} email={email} busy={busy} subtitle={overview ? `${today} SAST · ${subtitles.overview}` : subtitles[view as keyof typeof subtitles]} actions={actions}>
    {overview && <AdminOverview date={today} workflowDate={date} configured={status.configuredLeagues.length} coverage={coverage.data} jobs={jobs.data}
      manual={manual.data} list={todaysList.data} customers={customerTotal.data?.total}
      loading={[coverage, jobs, manual, todaysList, customerTotal].some(resource => resource.loading)}
      error={[coverage, jobs, manual, todaysList, customerTotal].some(resource => resource.error)} />}
    {hasScope && <RunScope coverage={coverage.data} configured={status.configuredLeagues} selected={selected} onSelect={setSelected} busy={busy} date={date} error={coverage.error} />}
    {view === 'coverage' && <AdminCoverage coverage={coverage.data} loading={coverage.loading} error={coverage.error} />}
    {(visited.predictions || view === 'predictions') && <div hidden={view !== 'predictions'}>
      <ManualPredictionPanel date={date} leagues={selected} onBusyChange={setBusy} otherBusy={busy} onActivity={updateManual}
        onPublished={() => { refresh(); updateManual(); setPublishedRevision(value => value + 1); }} />
    </div>}
    {view === 'predictions' && !busy && manual.data?.progress.some(row => row.kind === 'predict' && row.status === 'running') &&
      <p role="status" className="ax-feedback">A prediction request is recorded as running for this date. <Link to={adminLink('executions', date)}>Inspect execution history</Link></p>}
    {view === 'predictions' && <AdminFootball mode="predictions" date={date} configured={status.configuredLeagues} revision={revision + manualRevision} />}
    {view === 'fixtures' && <AdminFootball mode="fixtures" date={date} configured={status.configuredLeagues} revision={revision} />}
    {view === 'picks' && <AdminPublished mode="picks" revision={revision + publishedRevision} />}
    {view === 'history' && <AdminPublished mode="history" revision={revision + publishedRevision} />}
    {(visited.operations || view === 'operations') && <div hidden={view !== 'operations'}>
      <ManualTasksPanel date={date} leagues={selected} configuredLeagues={status.configuredLeagues} busy={busy}
        onBusyChange={setBusy} resource={manual} onRefresh={updateManual} onActivity={() => { updateManual(); refresh(); }} />
    </div>}
    {view === 'schedules' && <AdminSchedules date={date} configured={status.configuredLeagues} revision={revision} />}
    {view === 'executions' && <AdminExecutions date={date} jobs={jobs} manual={manual} />}
    {(visited.customers || view === 'customers') && <div hidden={view !== 'customers'}><AdminUsersPanel /></div>}
    {view === 'payments' && <AdminUsersPanel key="payments" mode="payments" />}
    {(visited.passes || view === 'passes') && <div hidden={view !== 'passes'}><AccessProductsPanel /></div>}
    {view === 'traffic' && <AdminTraffic revision={revision} />}
    {view === 'referrals' && <AdminReferrals revision={revision} />}
    {view === 'coverage' && <Link className="ax-button" to={adminLink('operations', askedDate ?? undefined)}>Use selected scope in manual operations <Icon name="arrow" /></Link>}
  </AdminShell>;
}
