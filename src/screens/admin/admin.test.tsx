/**
 * Tests for the admin workflow screen.
 *
 * These assert the properties that protect against misuse:
 *  - a non-admin never sees admin functionality (and the server refuses it),
 *  - league selection is presented as a filter, not a split,
 *  - is generated runs are tracked without blocking the page,
 *  - "not generated" is never conflated with "no eligible fixtures".
 *
 * All API calls are mocked; no test performs a real request.
 */
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { User } from 'firebase/auth';

import AdminScreen from './AdminScreen';
import * as service from '../../services/admin';
import { ApiRequestError, apiGet } from '../../services/api/client';
import type { AdminJob, CoverageResponse, LeagueCoverage, ManualBetListPreview } from '../../services/admin/types';
import { AuthProvider } from '../../services/auth/AuthProvider';
import * as official from '../../services/official';
import { subscribeToAuthChanges } from '../../services/auth/firebase';

jest.mock('../../services/admin');
jest.mock('../../services/official');
jest.mock('../../services/api/client', () => ({ ...jest.requireActual('../../services/api/client'), apiGet: jest.fn() }));
jest.mock('../../services/auth/firebase');

const mocked = service as jest.Mocked<typeof service>;
const mockedSubscribe = subscribeToAuthChanges as jest.MockedFunction<typeof subscribeToAuthChanges>;
const adminUser = { uid: 'admin' } as User;
const otherUser = { uid: 'other' } as User;
let authListener: (user: User | null) => void;

const league = (overrides: Partial<LeagueCoverage> = {}): LeagueCoverage => ({
  leagueId: 39,
  status: 'not_generated',
  eligibleFixtures: 4,
  predictions: 0,
  lastPublishedAt: null,
  lastSuccessfulPredictions: 0,
  error: '',
  latestJobId: null,
  previousVersionAvailable: false,
  ...overrides,
});

const coverageOf = (
  leagues: LeagueCoverage[],
  label = '0 of 1 eligible leagues published',
  freshness?: CoverageResponse['freshness'],
): CoverageResponse => ({
  targetDate: '2026-03-10',
  season: 2026,
  summary: {
    publishedLeagues: leagues.filter((l) => l.status === 'published').length,
    eligibleLeagues: leagues.filter((l) => l.eligibleFixtures > 0).length,
    label,
  },
  leagues,
  requestedLeagues: leagues.map((l) => l.leagueId),
  freshness,
});

const job = (overrides: Partial<AdminJob> = {}): AdminJob => ({
  jobId: 7,
  kind: 'generate',
  status: 'queued',
  targetDate: '2026-03-10',
  season: 2026,
  leagues: [39],
  trigger: 'admin',
  requestedBy: 'admin@example.com',
  createdAt: '2026-03-10T05:00:00Z',
  startedAt: null,
  finishedAt: null,
  error: '',
  summary: {},
  leagueResults: {},
  ...overrides,
});

const renderScreen = (view = 'overview') =>
  render(
    <MemoryRouter initialEntries={[view === 'overview' ? '/admin' : `/admin?view=${view}`]}>
      <AuthProvider>
        <AdminScreen />
      </AuthProvider>
    </MemoryRouter>,
  );

const expandProgress = async () => {
  const buttons = await screen.findAllByRole('button');
  const button = buttons.find(
    (b) => b.getAttribute('aria-label') === 'Toggle Progress by league',
  );
  if (!button) throw new Error('Progress toggle button not found');
  await userEvent.click(button);
};

beforeEach(() => {
  jest.clearAllMocks();
  (apiGet as jest.Mock).mockResolvedValue({ data: { response: [], paging: { total: 1 } } });
  (official.getOfficialToday as jest.Mock).mockResolvedValue({ data: { businessDate: '2026-03-10', published: false } });
  (official.getOfficialHistory as jest.Mock).mockResolvedValue({ data: { results: [], totalPages: 1 } });
  (official.getOfficialSummary as jest.Mock).mockResolvedValue({ data: { scope: { period: {}, listsConsidered: 0 }, metrics: {} } });
  mocked.getAdminSchedule.mockResolvedValue({ data: { date: '2026-03-10', selectedLeagues: [], effectiveLeagues: [39],
    selectionError: '', timezone: 'Africa/Johannesburg', schedules: [], runs: [] } } as never);
  mocked.getAdminTraffic.mockResolvedValue({ data: { page: 1, total: 0, totalPages: 1, uniqueVisitors: 0, visitsToday: 0, visitors: [] } } as never);
  mockedSubscribe.mockImplementation((listener) => {
    authListener = listener;
    listener(adminUser);
    return jest.fn();
  });
  mocked.getAdminStatus.mockResolvedValue({
    data: { isAdmin: true, isMember: false, configuredLeagues: [39] },
  } as never);
  mocked.getAdminCoverage.mockResolvedValue({ data: coverageOf([league()]) } as never);
  mocked.getAdminJobs.mockResolvedValue({ data: { jobs: [] } } as never);
  mocked.getAdminAccessProducts.mockResolvedValue({ data: { products: [], minimumPrice: '5.00' } } as never);
  mocked.getAdminUsers.mockResolvedValue({
    data: { page: 1, pageSize: 25, total: 0, totalPages: 1, users: [] },
  } as never);
  mocked.getManualTasks.mockResolvedValue({
    data: { date: '2026-03-10', today: '2026-03-10',
      counts: { catalog: 0, daily: 1, odds: 2, 'predict-settle': 0, settle: 0, 'update-results': 0, predict: 0 },
      leagueCounts: { '39': { daily: 1, odds: 2 } }, manualPublicationsToday: 0,
      progress: [{ leagueId: 39, kind: 'daily', status: 'completed', error: '',
        startedAt: '2026-03-10T02:00:00Z', finishedAt: '2026-03-10T02:01:00Z', checkpoint: {} }],
    },
  } as never);
});

describe('manual tasks', () => {
  it('shows paginated users and active membership details', async () => {
    mocked.getAdminUsers.mockResolvedValue({
      data: {
        page: 1, pageSize: 25, total: 2, totalPages: 1,
        users: [{
          id: 7, firebaseUid: 'firebase-7', email: 'member@example.com', phoneNumber: '+27821234567',
          isActive: true, isStaff: false, isSuperuser: false,
          createdAt: '2026-11-20T10:00:00Z',
          membership: { active: true, startsAt: '2026-11-20T10:00:00Z', endsAt: '2026-12-20T10:00:00Z', revoked: false },
          latestPurchase: {
            id: 3, status: 'granted', provider: 'payfast', productCode: '30day',
            productName: '30-day pass', amountExpected: '49.00', currency: 'ZAR',
            createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:05:00Z',
          },
        }, {
          id: 8, firebaseUid: 'firebase-8', email: 'fan@example.com', phoneNumber: null,
          isActive: true, isStaff: false, isSuperuser: false, createdAt: '2026-11-20T10:00:00Z',
          membership: { active: false, startsAt: null, endsAt: null, revoked: false },
          latestPurchase: null,
        }],
      },
    } as never);
    renderScreen('customers');
    expect(await screen.findByText('member@example.com')).toBeInTheDocument();
    expect(screen.getByText('Active membership')).toBeInTheDocument();
    expect(screen.getByText('30-day pass')).toBeInTheDocument();
    expect(screen.getByText('Phone +27821234567 · unverified')).toBeInTheDocument();
    expect(screen.getByText('No phone on record')).toBeInTheDocument();
  });

  it('grants access to the selected user and retries a lost response with the same request ID', async () => {
    const uuid = '24c9bff6-5d55-460e-8abb-073029b6fcfb';
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => uuid } });
    try {
      mocked.getAdminUsers.mockResolvedValue({
        data: { page: 1, pageSize: 25, total: 1, totalPages: 1, users: [{
          id: 5, firebaseUid: 'selected-customer', email: 'fan@example.com',
          isActive: true, isStaff: false, isSuperuser: false,
          createdAt: '2026-11-20T10:00:00Z',
          membership: { active: false, startsAt: null, endsAt: null, revoked: false },
          latestPurchase: null,
        }] },
      } as never);
      mocked.grantAdminUserAccess
        .mockRejectedValueOnce(new Error('Connection interrupted'))
        .mockResolvedValueOnce({ data: { id: 1, userId: 5, startsAt: '2026-11-28T10:00:00Z', endsAt: '2026-11-29T10:00:00Z' } } as never);
      renderScreen('customers');
      await userEvent.click(await screen.findByRole('button', { name: 'Grant access to user #5' }));
      const form = screen.getByRole('form', { name: 'Grant prediction access' });
      expect(within(form).getByText(/User #5/)).toHaveTextContent('fan@example.com');
      const confirm = within(form).getByRole('button', { name: 'Confirm access grant' });
      expect(confirm).toBeDisabled();
      await userEvent.type(within(form).getByLabelText('Reason'), 'Payment support');
      await userEvent.click(confirm);
      expect(await within(form).findByRole('alert')).toHaveTextContent('Could not confirm the grant');
      await userEvent.click(within(form).getByRole('button', { name: 'Retry grant' }));
      expect(await screen.findByText(/Prediction access granted to user #5/)).toBeInTheDocument();
      expect(mocked.grantAdminUserAccess.mock.calls).toEqual([
        [5, { requestId: uuid, durationDays: 1, reason: 'Payment support' }],
        [5, { requestId: uuid, durationDays: 1, reason: 'Payment support' }],
      ]);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'crypto', previous);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it('shows recommendations, today counts and per-league remaining work', async () => {
    renderScreen('operations');
    await expandProgress();
    expect(await screen.findByText(/Daily ingestion: completed · 1 started today/)).toBeInTheDocument();
    expect(screen.getByText(/Refresh odds: Remaining · 2 started today/)).toBeInTheDocument();
    expect(screen.getByText(/Up to 5 passes per league per day/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Predict' })).not.toBeInTheDocument();
  });

  it('runs selected leagues directly and allows a repeated pass', async () => {
    mocked.runManualTask.mockResolvedValue({ data: { id: 1, status: 'completed' } } as never);
    renderScreen('operations');
    await userEvent.click(await screen.findByRole('checkbox', { name: /^League 39/ }));
    const button = screen.getByRole('button', { name: 'Run refresh odds' });
    await userEvent.click(button);
    await waitFor(() => expect(mocked.runManualTask).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await waitFor(() => expect(mocked.runManualTask).toHaveBeenCalledTimes(2));
    expect(mocked.startAdminRun).not.toHaveBeenCalled();
  });

  it('reports what an update final results pass settled', async () => {
    mocked.runManualTask.mockResolvedValue({
      data: { id: 1, status: 'completed', datesChecked: 2, legsSettled: 3, legsVoided: 1, legsUnresolved: 0, listsFinalised: 2 },
    } as never);
    renderScreen('operations');
    await userEvent.click(await screen.findByRole('checkbox', { name: /^League 39/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Run update final results' }));
    await waitFor(() => expect(mocked.runManualTask).toHaveBeenCalledWith(expect.any(String), 39, 'update-results'));
    expect(await screen.findByText(/3 settled, 1 void, 0 unresolved, 2 list\(s\) finalised/)).toBeInTheDocument();
  });

  it('keeps task failures visible after progress reloads', async () => {
    mocked.runManualTask.mockRejectedValue(
      new ApiRequestError('Unavailable', 503, { detail: 'Provider request budget exhausted; retry later.' }),
    );
    renderScreen('operations');
    await userEvent.click(await screen.findByRole('checkbox', { name: /^League 39/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Run refresh odds' }));
    expect(await screen.findByText(/Provider request budget exhausted/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload task progress' }));
    await waitFor(() => expect(mocked.getManualTasks.mock.calls.length).toBeGreaterThan(1));
    expect(screen.getByText(/Provider request budget exhausted/)).toBeInTheDocument();
  });
});

const manualPreview: ManualBetListPreview = {
  date: '2026-11-22', predictionIds: [1, 2, 3, 4, 5], requiredSize: 5, minimumSize: 3,
  canPublish: true, reason: '', selectionHash: 'server-preview-hash',
  suggestions: [1, 2, 3, 4, 5].map(id => ({
    predictionId: id, providerFixtureId: 500 + id,
    homeTeam: `Home ${id}`, awayTeam: `Away ${id}`, kickoff: '2026-11-22T15:00:00Z',
    marketId: 'over_2_5', marketLabel: 'Over 2.5', probability: 0.8,
    decimalOdds: null, bookmaker: '',
  })),
};

describe('manual daily publication without jobs', () => {
  const prepareMocks = () => {
    mocked.predictAdminManualLeague.mockResolvedValue({
      data: {
        date: manualPreview.date, leagueId: 39, leagueName: 'Premier League', season: 2026,
        predictionIds: manualPreview.predictionIds,
        forecasts: manualPreview.suggestions.map(pick => ({ ...pick, id: pick.predictionId })),
      },
    } as never);
    mocked.previewAdminManualList.mockResolvedValue({ data: manualPreview } as never);
  };

  it('predicts and publishes immediately despite failed jobs, only after confirmation', async () => {
    prepareMocks();
    mocked.getAdminJobs.mockResolvedValue({ data: { jobs: [job({ status: 'failed' })] } } as never);
    mocked.publishAdminManualList.mockResolvedValue({ data: { published: true, date: manualPreview.date, listId: 5 } } as never);
    renderScreen('predictions');
    await userEvent.click(await screen.findByRole('checkbox', { name: /^League 39/ }));
    const panel = within(screen.getByRole('region', { name: 'Manual daily bet list (no jobs)' }));
    await userEvent.click(panel.getByRole('button', { name: 'Predict manually and preview' }));
    const publish = await panel.findByRole('button', { name: 'Publish manual daily bet list' });
    expect(publish).toBeDisabled();
    expect(mocked.predictAdminManualLeague).toHaveBeenCalledWith(expect.any(String), 39);
    expect(mocked.previewAdminManualList).toHaveBeenCalledWith(expect.any(String), [1, 2, 3, 4, 5]);
    expect(mocked.startAdminRun).not.toHaveBeenCalled();
    expect(mocked.publishAdminManualList).not.toHaveBeenCalled();
    await userEvent.click(panel.getByRole('checkbox', { name: /confirm publication/ }));
    await userEvent.click(publish);
    await waitFor(() => expect(mocked.publishAdminManualList).toHaveBeenCalledWith(manualPreview));
    expect(await panel.findByRole('link', { name: 'View published history' })).toHaveAttribute('href', '/history');
    expect(mocked.startAdminRun).not.toHaveBeenCalled();
  });

  it.each([3, 4])('publishes a server-approved %i-match list with labelled fair odds after confirmation', async (count) => {
    prepareMocks();
    const preview: ManualBetListPreview = {
      ...manualPreview,
      suggestions: manualPreview.suggestions.slice(0, count).map(pick => ({
        ...pick, decimalOdds: '1.2500', oddsSource: 'model-fair',
      })),
    };
    mocked.previewAdminManualList.mockResolvedValue({ data: preview } as never);
    mocked.publishAdminManualList.mockResolvedValue({ data: { published: true } } as never);
    renderScreen('predictions');
    await userEvent.click(await screen.findByRole('checkbox', { name: /^League 39/ }));
    const panel = within(screen.getByRole('region', { name: 'Manual daily bet list (no jobs)' }));
    await userEvent.click(panel.getByRole('button', { name: 'Predict manually and preview' }));
    const confirm = await panel.findByRole('checkbox', { name: /confirm publication/ });
    expect(confirm).toBeEnabled();
    expect(panel.getAllByText(/Estimated model fair odds 1.2500/)).toHaveLength(count);
    expect(panel.getByText(new RegExp(`${count} distinct qualifying matches selected`))).toBeInTheDocument();
    const publish = panel.getByRole('button', { name: 'Publish manual daily bet list' });
    expect(publish).toBeDisabled();
    await userEvent.click(confirm);
    expect(publish).toBeEnabled();
    await userEvent.click(publish);
    await waitFor(() => expect(mocked.publishAdminManualList).toHaveBeenCalledWith(preview));
  });

  it('clears a preview when league selection changes and refuses lists below the minimum', async () => {
    prepareMocks();
    mocked.previewAdminManualList.mockResolvedValue({
      data: { ...manualPreview, canPublish: false, reason: 'Only 2 distinct fixtures qualified; 3 are required.', suggestions: manualPreview.suggestions.slice(0, 2) },
    } as never);
    renderScreen('predictions');
    const selection = await screen.findByRole('checkbox', { name: /^League 39/ });
    await userEvent.click(selection);
    const panel = within(screen.getByRole('region', { name: 'Manual daily bet list (no jobs)' }));
    await userEvent.click(panel.getByRole('button', { name: 'Predict manually and preview' }));
    expect(await panel.findByRole('alert')).toHaveTextContent('Only 2 distinct fixtures qualified');
    expect(panel.getByRole('button', { name: 'Publish manual daily bet list' })).toBeDisabled();
    await userEvent.click(selection);
    await waitFor(() => expect(panel.queryByText(/Daily bet list preview/)).not.toBeInTheDocument());
    expect(mocked.publishAdminManualList).not.toHaveBeenCalled();
  });

  it('reports direct provider failures without queueing or offering publication', async () => {
    mocked.predictAdminManualLeague.mockRejectedValueOnce(
      new ApiRequestError('Unavailable', 503, { detail: 'Provider request budget exhausted; retry later.' }),
    );
    renderScreen('predictions');
    await userEvent.click(await screen.findByRole('checkbox', { name: /^League 39/ }));
    const panel = within(screen.getByRole('region', { name: 'Manual daily bet list (no jobs)' }));
    await userEvent.click(panel.getByRole('button', { name: 'Predict manually and preview' }));
    expect(await panel.findByRole('alert')).toHaveTextContent('Provider request budget exhausted');
    expect(panel.queryByRole('button', { name: 'Publish manual daily bet list' })).not.toBeInTheDocument();
    expect(mocked.startAdminRun).not.toHaveBeenCalled();
    expect(mocked.previewAdminManualList).not.toHaveBeenCalled();
  });
});

describe('membership product management', () => {
  it('creates an immediately active product only after confirmation', async () => {
    mocked.createAdminAccessProduct.mockResolvedValue({
      data: { code: 'pass-30', name: 'Monthly pass', price_amount: '49.00', currency: 'ZAR', duration_days: 30, is_active: true },
    } as never);
    renderScreen('passes');
    const create = await screen.findByRole('button', { name: 'Create active product' });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Product code'), 'pass-30');
    await userEvent.type(screen.getByLabelText('Product name'), 'Monthly pass');
    await userEvent.type(screen.getByLabelText(/Price \(ZAR/), '49.00');
    await userEvent.type(screen.getByLabelText('Duration (days)'), '30');
    await userEvent.click(screen.getByRole('checkbox', { name: /confirm this product/i }));
    await userEvent.click(create);
    await waitFor(() => expect(mocked.createAdminAccessProduct).toHaveBeenCalledWith({
      code: 'pass-30', name: 'Monthly pass', price_amount: '49.00', duration_days: 30, confirm_activation: true,
    }));
    expect(await screen.findByRole('button', { name: 'Deactivate Monthly pass (pass-30)' })).toBeInTheDocument();
  });

  it('changes availability and reports backend validation failures', async () => {
    const product = { code: 'pass-30', name: 'Monthly pass', price_amount: '49.00', currency: 'ZAR', duration_days: 30, is_active: true };
    mocked.getAdminAccessProducts.mockResolvedValue({ data: { products: [product], minimumPrice: '5.00' } } as never);
    mocked.setAdminAccessProductActive.mockResolvedValueOnce({ data: { ...product, is_active: false } } as never);
    mocked.setAdminAccessProductActive.mockRejectedValueOnce(new ApiRequestError('Rejected', 400, { detail: 'Price is below the minimum.' }));
    renderScreen('passes');
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Monthly pass (pass-30)' }));
    expect(await screen.findByRole('button', { name: 'Activate Monthly pass (pass-30)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activate Monthly pass (pass-30)' }));
    expect(await screen.findByText('Price is below the minimum.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate Monthly pass (pass-30)' })).toBeEnabled();
  });
});

describe('admin screen access', () => {
  it('waits for the persisted Firebase session before checking access after refresh', async () => {
    mockedSubscribe.mockImplementationOnce((listener) => {
      authListener = listener;
      return jest.fn();
    });

    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent('Checking access');
    expect(mocked.getAdminStatus).not.toHaveBeenCalled();
    expect(screen.queryByText('Admin access required')).not.toBeInTheDocument();

    act(() => authListener(adminUser));
    expect(await screen.findByRole('heading', { name: 'Operations overview' })).toBeInTheDocument();
    expect(mocked.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it('checks current permissions when a signed-out visitor signs in', async () => {
    mockedSubscribe.mockImplementationOnce((listener) => {
      authListener = listener;
      listener(null);
      return jest.fn();
    });
    renderScreen();
    expect(screen.getByText('Admin access required')).toBeInTheDocument();
    expect(mocked.getAdminStatus).not.toHaveBeenCalled();

    act(() => authListener(adminUser));
    expect(await screen.findByRole('heading', { name: 'Operations overview' })).toBeInTheDocument();
  });

  it('removes the admin dashboard immediately on sign-out', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Operations overview' });

    act(() => authListener(null));
    expect(screen.getByText('Admin access required')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Operations overview' })).not.toBeInTheDocument();
  });

  it('ignores a previous account access response after switching accounts', async () => {
    let resolvePrevious: (response: Awaited<ReturnType<typeof service.getAdminStatus>>) => void;
    mocked.getAdminStatus.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePrevious = resolve;
    }));
    mocked.getAdminStatus.mockResolvedValueOnce({
      data: { isAdmin: false, isMember: true, configuredLeagues: [] },
    } as never);
    renderScreen();

    act(() => authListener(otherUser));
    await screen.findByText('Admin access required');
    await act(async () => {
      resolvePrevious({ data: { isAdmin: true, isMember: false, configuredLeagues: [39] } } as never);
    });
    expect(mocked.getAdminStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Admin access required')).toBeInTheDocument();
    expect(mocked.getAdminCoverage).not.toHaveBeenCalled();
  });

  it('reports a connection failure and retries without falsely denying admin access', async () => {
    mocked.getAdminStatus.mockRejectedValueOnce(new ApiRequestError('Unavailable', 503));
    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not check admin access');
    expect(screen.queryByText('Admin access required')).not.toBeInTheDocument();
    expect(mocked.getAdminCoverage).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry access check' }));
    expect(await screen.findByRole('heading', { name: 'Operations overview' })).toBeInTheDocument();
    expect(mocked.getAdminStatus).toHaveBeenCalledTimes(2);
  });

  it('shows a plain refusal to a non-admin and loads no admin data', async () => {
    mocked.getAdminStatus.mockResolvedValue({
      data: { isAdmin: false, isMember: true, configuredLeagues: [] },
    } as never);

    renderScreen();
    expect(await screen.findByText('Admin access required')).toBeInTheDocument();
    // A member is explicitly told membership is not the same as admin.
    expect(screen.getByText(/Membership does not grant access/i)).toBeInTheDocument();
    // No administrative data is fetched for a non-admin.
    expect(mocked.getAdminCoverage).not.toHaveBeenCalled();
  });

  it('states that the server enforces access, not the hidden page', async () => {
    mocked.getAdminStatus.mockResolvedValue({
      data: { isAdmin: false, isMember: true, configuredLeagues: [] },
    } as never);
    renderScreen();
    await screen.findByText('Admin access required');
    // The screen must not imply that hiding itself is the control.
    expect(screen.queryByText(/only hidden|hidden from users/i)).not.toBeInTheDocument();
  });
});

describe('league selection is a filter', () => {
  it('shows mapped names and countries in controls and coverage, retaining unknown IDs', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league(), league({ leagueId: 71 }), league({ leagueId: 99999 })]),
    } as never);
    renderScreen('coverage');
    const england = await screen.findByRole('checkbox', { name: /^League 39 - Premier League \(England\)/ });
    const brazil = await screen.findByRole('checkbox', { name: /^League 71 - Serie A \(Brazil\)/ });
    expect(screen.getByRole('cell', { name: 'League 39 - Premier League (England)' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'League 71 - Serie A (Brazil)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^League 99999/ })).toBeInTheDocument();
    await userEvent.click(england);
    await userEvent.click(brazil);
    expect(england).toBeChecked();
    expect(brazil).toBeChecked();
  });

  it('explains why no run can start when nothing is selected', async () => {
    renderScreen('operations');
    await screen.findByRole('heading', { name: 'Manual operations' });
    // The button is disabled, so the reason must be visible without a click.
    expect(screen.getByRole('button', { name: 'Run daily ingestion' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/select at least one league/i);
    expect(mocked.startAdminRun).not.toHaveBeenCalled();
  });

  it('allows leagues with no stored eligible fixtures to be refreshed by Predict', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league({ leagueId: 78, eligibleFixtures: 0, status: 'no_eligible_fixtures' })]),
    } as never);
    renderScreen('operations');
    expect(await screen.findByRole('checkbox', { name: /League 78/ })).toBeEnabled();
  });

  it('allows selecting all configured leagues for past dates with zero eligible fixtures', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([
        league({ leagueId: 39, eligibleFixtures: 0, status: 'no_eligible_fixtures' }),
        league({ leagueId: 140, eligibleFixtures: 0, status: 'no_eligible_fixtures' }),
      ]),
    } as never);
    renderScreen('operations');
    const pl = await screen.findByRole('checkbox', { name: /^League 39/ });
    const laLiga = await screen.findByRole('checkbox', { name: /^League 140/ });
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(pl).toBeChecked();
    expect(laLiga).toBeChecked();
  });
});

describe('coverage dashboard', () => {
  it('distinguishes not generated from no eligible fixtures', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([
        league({ leagueId: 39, status: 'not_generated', eligibleFixtures: 3 }),
        league({ leagueId: 140, status: 'no_eligible_fixtures', eligibleFixtures: 0 }),
      ]),
    } as never);

    renderScreen('coverage');
    expect(await screen.findByText('Not generated')).toBeInTheDocument();
    expect(screen.getByText('No eligible fixtures')).toBeInTheDocument();
    // The distinction is explained rather than left to the reader.
    expect(await screen.findByText(/Nothing to generate for this date/i)).toBeInTheDocument();
  });

  it('shows the N of M published summary', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league({ status: 'published' })], '1 of 1 eligible leagues published'),
    } as never);
    renderScreen('coverage');
    expect(await screen.findByText('1 of 1 eligible leagues published')).toBeInTheDocument();
  });

  it('surfaces a failed league with its error and preserved previous version', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([
        league({ status: 'failed', error: 'ProviderError', previousVersionAvailable: true }),
      ]),
    } as never);
    renderScreen('coverage');
    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(await screen.findByText('ProviderError')).toBeInTheDocument();
    expect(screen.getByText(/earlier published version is still available/i)).toBeInTheDocument();
  });

  it('identifies status without relying on colour', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league({ status: 'queued' }), league({ leagueId: 140, status: 'running' })]),
    } as never);
    renderScreen('coverage');
    const queued = (await screen.findByText('Queued')).closest('span');
    expect(queued?.textContent).toMatch(/⋯/);
    const running = screen.getByText('Running').closest('span');
    expect(running?.textContent).toMatch(/◐/);
  });
});

describe('job tracking', () => {
  it('explains which pipeline steps reused an already completed slot', async () => {
    mocked.getAdminJobs.mockResolvedValue({
      data: { jobs: [job({
        status: 'completed',
        leagueResults: { '39': { status: 'ok', steps: { refresh: 'completed', predict: 'skipped' } } },
      })] },
    } as never);
    renderScreen('executions');
    expect(await screen.findByText(/already completed this five-minute slot: predict/i)).toBeInTheDocument();
  });

  it('lists recent runs with trigger attribution', async () => {
    mocked.getAdminJobs.mockResolvedValue({
      data: { jobs: [job({ status: 'completed' })] },
    } as never);
    renderScreen('executions');
    expect(await screen.findByText(/Triggered by admin/)).toBeInTheDocument();
    expect(screen.getByText(/admin@example\.com/)).toBeInTheDocument();
  });

});
describe('publication state', () => {
  it('shows a stale league as stale rather than silently current', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league()], '0 of 1 eligible leagues published', {
        '39': { lastGeneratedAt: '2026-03-08T05:00:00Z', predictions: 4, state: 'stale', hasPublished: true },
      }),
    } as never);
    renderScreen('coverage');
    expect(await screen.findByText('Stale')).toBeInTheDocument();
  });

  it('shows a league with nothing published distinctly from stale', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league()], '0 of 1 eligible leagues published', {
        '39': { lastGeneratedAt: null, predictions: 0, state: 'empty', hasPublished: false },
      }),
    } as never);
    renderScreen('coverage');
    expect(await screen.findByText('Nothing published')).toBeInTheDocument();
  });

});


describe('admin workspace navigation', () => {
  it('opens business deep links without loading football data, then navigates with an active indicator', async () => {
    renderScreen('traffic');
    expect(await screen.findByRole('heading', { name: 'Visitor analytics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Traffic' })).toHaveAttribute('aria-current', 'page');
    expect(mocked.getAdminCoverage).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('link', { name: 'Overview', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Operations overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('saves a date-specific schedule scope and can restore the configured default', async () => {
    const schedule = { date: '2026-03-10', selectedLeagues: [], effectiveLeagues: [39], selectionError: '',
      timezone: 'Africa/Johannesburg', schedules: [{ name: 'daily', times: ['04:00'], modes: ['refresh'] }], runs: [] };
    mocked.getAdminSchedule.mockResolvedValueOnce({ data: schedule } as never)
      .mockResolvedValueOnce({ data: { ...schedule, selectedLeagues: [39] } } as never);
    mocked.saveAdminSchedule.mockResolvedValue({ data: schedule } as never);
    renderScreen('schedules');
    await userEvent.click(await screen.findByRole('checkbox', { name: /League 39/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save league scope' }));
    await waitFor(() => expect(mocked.saveAdminSchedule).toHaveBeenLastCalledWith(expect.any(String), [39]));
    await screen.findByText(/1 explicitly selected/);
    await userEvent.click(screen.getByRole('button', { name: 'Use configured default' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save league scope' }));
    await waitFor(() => expect(mocked.saveAdminSchedule).toHaveBeenLastCalledWith(expect.any(String), []));
    expect(screen.getByText('04:00 SAST')).toBeInTheDocument();
  });

  it('shows payment confirmation separately from grant and effective access', async () => {
    mocked.getAdminUsers.mockResolvedValue({ data: { page: 1, totalPages: 1, total: 1, users: [{
      id: 10, email: 'support@example.test', membership: { active: false, revoked: false },
      latestPurchase: { id: 11, status: 'provider_confirmed', provider: 'payfast', productName: 'Daily pass', amountExpected: '9.99', currency: 'ZAR' },
    }] } } as never);
    renderScreen('payments');
    expect(await screen.findByText('Provider confirmed · grant pending on this attempt')).toBeInTheDocument();
    expect(screen.getByText('No active membership')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Grant access to user/ })).not.toBeInTheDocument();
  });

  it('keeps a pending direct operation alive across admin navigation', async () => {
    let resolveRun: (result: Awaited<ReturnType<typeof service.runManualTask>>) => void;
    mocked.runManualTask.mockImplementationOnce(() => new Promise(resolve => { resolveRun = resolve; }));
    renderScreen('operations');
    await userEvent.click(await screen.findByRole('checkbox', { name: /^League 39/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Run refresh odds' }));
    await userEvent.click(screen.getByRole('link', { name: 'Overview', exact: true }));
    expect(await screen.findByText(/A direct request is in progress/)).toBeInTheDocument();
    await act(async () => { resolveRun({ data: { id: 2, status: 'completed' } } as never); });
    await userEvent.click(screen.getByRole('link', { name: 'Manual operations', exact: true }));
    expect(screen.getByText('Pass completed.')).toBeInTheDocument();
    expect(mocked.runManualTask).toHaveBeenCalledTimes(1);
  });
});
