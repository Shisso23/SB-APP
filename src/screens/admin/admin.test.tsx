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
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import AdminScreen from './AdminScreen';
import * as service from '../../services/admin';
import { ApiRequestError } from '../../services/api/client';
import type { AdminJob, CoverageResponse, LeagueCoverage } from '../../services/admin/types';

jest.mock('../../services/admin');

const mocked = service as jest.Mocked<typeof service>;

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

const renderScreen = () =>
  render(
    <MemoryRouter>
      <AdminScreen />
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getAdminStatus.mockResolvedValue({
    data: { isAdmin: true, isMember: false, configuredLeagues: [39] },
  } as never);
  mocked.getAdminCoverage.mockResolvedValue({ data: coverageOf([league()]) } as never);
  mocked.getAdminJobs.mockResolvedValue({ data: { jobs: [] } } as never);
  mocked.getAdminAccessProducts.mockResolvedValue({ data: { products: [], minimumPrice: '5.00' } } as never);
  mocked.getIngestionSchedule.mockResolvedValue({
    data: {
      date: '2026-03-10', selectedLeagues: [], effectiveLeagues: [39],
      timezone: 'Africa/Johannesburg',
      schedules: [{ name: 'daily', times: ['04:00'], modes: ['leagues', 'bootstrap', 'refresh'] }],
      runs: [],
    },
  } as never);
});

describe('membership product management', () => {
  it('creates an immediately active product only after confirmation', async () => {
    mocked.createAdminAccessProduct.mockResolvedValue({
      data: { code: 'pass-30', name: 'Monthly pass', price_amount: '49.00', currency: 'ZAR', duration_days: 30, is_active: true },
    } as never);
    renderScreen();
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
    expect(await screen.findByText(/Monthly pass \(pass-30\).*Active/)).toBeInTheDocument();
  });

  it('changes availability and reports backend validation failures', async () => {
    const product = { code: 'pass-30', name: 'Monthly pass', price_amount: '49.00', currency: 'ZAR', duration_days: 30, is_active: true };
    mocked.getAdminAccessProducts.mockResolvedValue({ data: { products: [product], minimumPrice: '5.00' } } as never);
    mocked.setAdminAccessProductActive.mockResolvedValueOnce({ data: { ...product, is_active: false } } as never);
    mocked.setAdminAccessProductActive.mockRejectedValueOnce(new ApiRequestError('Rejected', 400, { detail: 'Price is below the minimum.' }));
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Monthly pass (pass-30)' }));
    expect(await screen.findByText(/Monthly pass \(pass-30\).*Inactive/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activate Monthly pass (pass-30)' }));
    expect(await screen.findByText('Price is below the minimum.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate Monthly pass (pass-30)' })).toBeEnabled();
  });
});

describe('admin screen access', () => {
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
  it('describes league selection as filtering, not splitting the run', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Prediction workflow' });
    expect(screen.getByText(/it does not split the run/i)).toBeInTheDocument();
    // The promise that betlists are unchanged must be stated.
    expect(screen.getByText(/suggested betlists stay exactly as the engine produces them/i)).toBeInTheDocument();
  });

  it('sends the selected leagues in one request rather than one per league', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league({ leagueId: 39 }), league({ leagueId: 140 })]),
    } as never);
    mocked.startAdminRun.mockResolvedValue({
      data: { jobId: 9, kind: 'generate', targetDate: '2026-03-10', season: 2026, leagues: [39, 140], status: 'queued' },
    } as never);
    mocked.getAdminJob.mockResolvedValue({
      data: { ...job({ jobId: 9, status: 'completed' }), isTerminal: true },
    } as never);

    renderScreen();
    await screen.findByRole('heading', { name: 'Prediction workflow' });

    await userEvent.click(await screen.findByRole('checkbox', { name: /League 39/ }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /League 140/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Predict' }));

    await waitFor(() => expect(mocked.startAdminRun).toHaveBeenCalledTimes(1));
    // ONE call carrying both leagues: a split would change betlist selection.
    expect(mocked.startAdminRun).toHaveBeenCalledWith({
      kind: 'generate',
      date: expect.any(String),
      leagues: [39, 140],
    });
  });

  it('explains why no run can start when nothing is selected', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Prediction workflow' });
    // The button is disabled, so the reason must be visible without a click.
    expect(screen.getByRole('button', { name: 'Predict' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/select at least one league/i);
    expect(mocked.startAdminRun).not.toHaveBeenCalled();
  });

  it('allows leagues with no stored eligible fixtures to be refreshed by Predict', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league({ leagueId: 78, eligibleFixtures: 0, status: 'no_eligible_fixtures' })]),
    } as never);
    renderScreen();
    expect(await screen.findByRole('checkbox', { name: /League 78/ })).toBeEnabled();
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

    renderScreen();
    expect(await screen.findByText('Not generated')).toBeInTheDocument();
    expect(screen.getByText('No eligible fixtures')).toBeInTheDocument();
    // The distinction is explained rather than left to the reader.
    expect(screen.getByText(/Nothing to generate for this date/i)).toBeInTheDocument();
  });

  it('shows the N of M published summary', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league({ status: 'published' })], '1 of 1 eligible leagues published'),
    } as never);
    renderScreen();
    expect(await screen.findByText('1 of 1 eligible leagues published')).toBeInTheDocument();
  });

  it('surfaces a failed league with its error and preserved previous version', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([
        league({ status: 'failed', error: 'ProviderError', previousVersionAvailable: true }),
      ]),
    } as never);
    renderScreen();
    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('ProviderError')).toBeInTheDocument();
    expect(screen.getByText(/earlier published version is still available/i)).toBeInTheDocument();
  });

  it('identifies status without relying on colour', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league({ status: 'queued' }), league({ leagueId: 140, status: 'running' })]),
    } as never);
    renderScreen();
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
    renderScreen();
    expect(await screen.findByText(/already completed this five-minute slot: predict/i)).toBeInTheDocument();
  });

  describe('scheduled ingestion', () => {
    it('saves selected leagues without changing the manual prediction selection', async () => {
      mocked.saveIngestionSchedule.mockResolvedValue({
        data: { date: '2026-03-10', selectedLeagues: [39], effectiveLeagues: [39] },
      } as never);
      renderScreen();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Scheduled league 39' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save ingestion schedule' }));
      await waitFor(() => expect(mocked.saveIngestionSchedule).toHaveBeenCalledWith(expect.any(String), [39]));
      expect(screen.getByRole('checkbox', { name: /League 39 \(4 eligible\)/ })).not.toBeChecked();
      expect(await screen.findByText('Ingestion selection saved.')).toBeInTheDocument();
      expect(screen.getByText(/04:00 SAST/)).toBeInTheDocument();
    });

    it('shows per-league fetched counts and failures from ingestion history', async () => {
      mocked.getIngestionSchedule.mockResolvedValue({
        data: {
          date: '2026-03-10', selectedLeagues: [39], effectiveLeagues: [39],
          timezone: 'Africa/Johannesburg', schedules: [],
          runs: [{
            id: 8, schedule: 'odds', status: 'failed', leagues: [39], error: '1 ingestion step(s) failed.',
            scheduledAt: '2026-03-10T10:00:00Z', startedAt: '2026-03-10T10:01:00Z',
            finishedAt: '2026-03-10T10:02:00Z',
            results: { leagues: { '39': { refresh: { status: 'completed', recordsFetched: 7 },
              odds: { status: 'failed', error: 'Provider unavailable' } } } },
          }],
        },
      } as never);
      renderScreen();
      expect(await screen.findByText(/7 fetched/)).toBeInTheDocument();
      expect(screen.getByText(/Provider unavailable/)).toBeInTheDocument();
      expect(screen.getByText(/1 ingestion step\(s\) failed/)).toBeInTheDocument();
    });
  });

  it('does not erase a refused action when automatic coverage polling succeeds', async () => {
    mocked.getAdminJobs.mockResolvedValue({ data: { jobs: [job()] } } as never);
    mocked.startAdminRun.mockRejectedValue({
      response: { data: { detail: 'A run is already queued for this date.' } },
    });
    jest.useFakeTimers();
    try {
      renderScreen();
      await screen.findByText('#7');
      await act(async () => {
        userEvent.click(screen.getByRole('checkbox', { name: /League 39/ }));
      });
      await act(async () => {
        userEvent.click(screen.getByRole('button', { name: 'Predict' }));
      });
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(screen.getByRole('alert')).toHaveTextContent('A run is already queued for this date.');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps status errors visible when coverage succeeds, then recovers on the next poll', async () => {
    mocked.getAdminJobs.mockResolvedValue({ data: { jobs: [job()] } } as never);
    jest.useFakeTimers();
    try {
      renderScreen();
      await screen.findByText('#7');
      mocked.getAdminJobs.mockRejectedValueOnce(new Error('offline'));
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(screen.getByText(/We could not load run status/)).toBeInTheDocument();
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(screen.queryByText(/We could not load run status/)).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('updates queued runs after reopening the page and stops polling when completed', async () => {
    mocked.getAdminJobs.mockResolvedValue({ data: { jobs: [job()] } } as never);
    jest.useFakeTimers();
    try {
      renderScreen();
      await screen.findByText('#7');
      mocked.getAdminJobs.mockResolvedValue({
        data: { jobs: [job({ status: 'running' })] },
      } as never);
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(screen.getByText(/Running/)).toBeInTheDocument();
      mocked.getAdminJobs.mockResolvedValue({
        data: { jobs: [job({ status: 'completed' })] },
      } as never);
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(screen.getByText(/Completed/)).toBeInTheDocument();
      const calls = mocked.getAdminJobs.mock.calls.length;
      await act(async () => { jest.advanceTimersByTime(6000); });
      expect(mocked.getAdminJobs).toHaveBeenCalledTimes(calls);
      expect(mocked.getAdminCoverage.mock.calls.length).toBeGreaterThan(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a queued job and does not block the page', async () => {
    mocked.startAdminRun.mockResolvedValue({
      data: { jobId: 12, kind: 'generate', targetDate: '2026-03-10', season: 2026, leagues: [39], status: 'queued' },
    } as never);
    mocked.getAdminJob.mockResolvedValue({
      data: { ...job({ jobId: 12 }), isTerminal: false },
    } as never);

    renderScreen();
    await screen.findByRole('heading', { name: 'Prediction workflow' });
    await userEvent.click(await screen.findByRole('checkbox', { name: /League 39/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Predict' }));

    // The response is immediate; the UI reports queued rather than waiting.
    expect(await screen.findByText(/Run queued \(job 12\)/)).toBeInTheDocument();
  });

  it('lists recent runs with trigger attribution', async () => {
    mocked.getAdminJobs.mockResolvedValue({
      data: { jobs: [job({ status: 'completed' })] },
    } as never);
    renderScreen();
    expect(await screen.findByText(/Triggered by admin/)).toBeInTheDocument();
    expect(screen.getByText(/admin@example\.com/)).toBeInTheDocument();
  });

  it('surfaces an actionable server refusal instead of a generic error', async () => {
    mocked.startAdminRun.mockRejectedValue({
      response: { data: { detail: 'These leagues are not configured for this project: 999' } },
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Prediction workflow' });
    await userEvent.click(await screen.findByRole('checkbox', { name: /League 39/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Predict' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured for this project/i);
  });
});
describe('publication state', () => {
  it('publishes the official list separately across configured leagues without requiring a selection', async () => {
    mocked.getAdminStatus.mockResolvedValue({
      data: { isAdmin: true, isMember: false, configuredLeagues: [39, 140] },
    } as never);
    mocked.startAdminRun.mockResolvedValue({
      data: { jobId: 12, kind: 'publish', targetDate: '2026-03-10',
        season: 2026, leagues: [39, 140], status: 'queued' },
    } as never);
    renderScreen();
    await screen.findByRole('heading', { name: 'Prediction workflow' });
    await act(async () => {
      userEvent.click(screen.getByRole('button', { name: 'Publish official list' }));
    });
    expect(mocked.startAdminRun).toHaveBeenCalledWith({
      kind: 'publish', date: expect.any(String), leagues: [39, 140],
    });
  });

  it('shows a stale league as stale rather than silently current', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league()], '0 of 1 eligible leagues published', {
        '39': { lastGeneratedAt: '2026-03-08T05:00:00Z', predictions: 4, state: 'stale', hasPublished: true },
      }),
    } as never);
    renderScreen();
    expect(await screen.findByText('Stale')).toBeInTheDocument();
  });

  it('shows a league with nothing published distinctly from stale', async () => {
    mocked.getAdminCoverage.mockResolvedValue({
      data: coverageOf([league()], '0 of 1 eligible leagues published', {
        '39': { lastGeneratedAt: null, predictions: 0, state: 'empty', hasPublished: false },
      }),
    } as never);
    renderScreen();
    expect(await screen.findByText('Nothing published')).toBeInTheDocument();
  });

  it('names the refresh control as the admin refresh action', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Prediction workflow' });
    expect(screen.getByRole('button', { name: 'Refresh latest data' })).toBeInTheDocument();
  });

  it('explains an overlap refusal instead of failing silently', async () => {
    mocked.startAdminRun.mockRejectedValue({
      response: { data: { detail: 'A run of this kind is already queued or running for this date.' } },
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Prediction workflow' });
    await userEvent.click(await screen.findByRole('checkbox', { name: /League 39/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Predict' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already queued or running/i);
  });
});
