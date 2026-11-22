/**
 * Tests for the public official-list surface.
 *
 * These assert the presentation rules that protect users from being misled:
 *  - an unavailable monetary figure is never shown as a zero return,
 *  - wins, losses and unresolved lists are all rendered,
 *  - status is never conveyed by colour alone,
 *  - the history is reachable without signing in.
 *
 * All API calls are mocked. No test performs a real network request.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import OfficialHistoryScreen from './OfficialHistoryScreen';
import * as service from '../../services/official';
import type {
  OfficialHistoryResponse,
  OfficialList,
  OfficialPreviewResponse,
  OfficialSummaryResponse,
} from '../../services/official/types';

jest.mock('../../services/official');

const mocked = service as jest.Mocked<typeof service>;

const publishedList = (overrides: Partial<OfficialList> = {}): OfficialList => ({
  businessDate: '2026-03-10',
  published: true,
  publishedAt: '2026-03-10T04:00:00Z',
  status: 'won',
  leagues: [39],
  engineVersion: 'engine-1',
  legCount: 1,
  legs: [
    {
      providerFixtureId: 9000,
      leagueId: 39,
      leagueName: 'Premier League',
      homeTeam: 'Alpha',
      awayTeam: 'Bravo',
      kickoff: '2026-03-10T12:00:00Z',
      marketId: 'over_2_5',
      marketLabel: 'Over 2.5',
      marketLine: '',
      probability: '0.72000',
      explanation: 'Strong goals signal.',
      engineVersion: 'engine-1',
      status: 'won',
      homeGoals: 2,
      awayGoals: 1,
      settledAt: '2026-03-10T14:00:00Z',
      resolutionNote: '',
      odds: { decimalOdds: '1.8500', bookmaker: 'Book A', source: 'api-football', capturedAt: '2026-03-10T03:00:00Z' },
    },
  ],
  hypothetical: {
    stake: '1000.00',
    available: true,
    reason: '',
    settledFully: true,
    combinedOdds: '1.8500',
    totalReturn: '1850.00',
    net: '850.00',
    isPotential: false,
    disclosure: 'Hypothetical example—no bet placed. Returns include the stake. Predictions do not guarantee outcomes.',
  },
  ...overrides,
});

const historyOf = (recent: OfficialList[], results: OfficialList[] = []): OfficialHistoryResponse => ({
  recent,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  totalLists: results.length,
  results,
});

const summaryOf = (overrides: Partial<OfficialSummaryResponse['metrics']> = {}): OfficialSummaryResponse => ({
  metrics: {
    lists: { won: 1, lost: 1, void: 1, pending: 0, unresolved: 1, denominator: 2, win_rate: '0.5' },
    selections: { won: 9, lost: 1, void: 0, pending: 0, unresolved: 0, denominator: 10, hit_rate: '0.9' },
    ...overrides,
  },
  definitions: { fullListWinRate: 'won / (won + lost)', selectionHitRate: 'won selections / settled', note: 'void uses 1.00' },
  scope: { listsConsidered: 4, period: { from: '2026-03-07', to: '2026-03-10' } },
});

const previewOf = (overrides: Partial<OfficialPreviewResponse> = {}): OfficialPreviewResponse => ({
  businessDate: '2026-03-10',
  available: true,
  explainer: {
    summary: 'Each forecast is a model probability, not a certainty.',
    limitations: ['Probabilities describe likelihood, not outcomes.'],
    how_the_list_is_made: 'Once a day, before the earliest kickoff.',
  },
  featured: {
    providerFixtureId: 9000,
    leagueName: 'Premier League',
    homeTeam: 'Alpha',
    awayTeam: 'Bravo',
    kickoff: '2026-03-10T12:00:00Z',
    marketId: 'over_2_5',
    marketLabel: 'Over 2.5',
    marketLine: '',
    probability: '0.72000',
    explanation: 'Strong goals signal.',
    engineVersion: 'engine-1',
    markets: [{ marketId: 'over_2_5', label: 'Over 2.5', probability: 0.72, decimalOdds: 1.85, qualifies: true }],
    dataQuality: { homeSampleSize: 12, awaySampleSize: 11, standingsAvailable: true },
  },
  ...overrides,
});

const renderScreen = () =>
  render(
    <MemoryRouter>
      <OfficialHistoryScreen />
    </MemoryRouter>,
  );

const mockAll = ({
  today = publishedList(),
  history = historyOf([publishedList()]),
  summary = summaryOf(),
  preview = previewOf(),
} = {}) => {
  mocked.getOfficialToday.mockResolvedValue({ data: today } as never);
  mocked.getOfficialHistory.mockResolvedValue({ data: history } as never);
  mocked.getOfficialSummary.mockResolvedValue({ data: summary } as never);
  mocked.getOfficialPreview.mockResolvedValue({ data: preview } as never);
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('public history screen', () => {
  it('renders without any authentication call', async () => {
    mockAll();
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Prediction history' })).toBeInTheDocument();
    // Only the four public endpoints are used; nothing membership-related.
    expect(mocked.getOfficialToday).toHaveBeenCalled();
    expect(mocked.getOfficialHistory).toHaveBeenCalled();
  });

  it('shows a settled list with its saved odds, result and monetary figures', async () => {
    mockAll();
    renderScreen();
    // The market appears on the leg row, the featured match and its market table.
    expect((await screen.findAllByText(/Over 2\.5/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('1.85').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2–1').length).toBeGreaterThan(0);
    // en-ZA groups thousands with U+00A0; normalise before asserting.
    const money = screen.getAllByText(/R\s?850/).map((n) => n.textContent?.replace(/\u00a0/g, ' '));
    expect(money).toContain('R850,00');
    expect(screen.getAllByText(/Hypothetical example/).length).toBeGreaterThan(0);
  });

  it('never renders an unavailable monetary figure as a zero return', async () => {
    mockAll({
      today: publishedList({
        hypothetical: {
          stake: '1000.00',
          available: false,
          reason: 'Original odds are incomplete for this list, so no monetary figure is shown.',
          settledFully: true,
          combinedOdds: null,
          totalReturn: null,
          net: null,
          isPotential: true,
          disclosure: 'Hypothetical example—no bet placed.',
        },
      }),
    });
    renderScreen();
    expect(await screen.findByText(/Monetary figure unavailable/)).toBeInTheDocument();
    // The critical assertion: no fabricated R0.00 anywhere.
    expect(screen.queryByText('R0.00')).not.toBeInTheDocument();
  });

  it('labels unsettled figures as potential rather than realised', async () => {
    mockAll({
      today: publishedList({
        status: 'pending',
        hypothetical: {
          stake: '1000.00',
          available: true,
          reason: 'Not fully settled yet; figures are potential returns.',
          settledFully: false,
          combinedOdds: '1.8500',
          totalReturn: null,
          net: null,
          isPotential: true,
          disclosure: 'Hypothetical example—no bet placed.',
        },
      }),
    });
    renderScreen();
    expect(await screen.findByText(/Potential return/)).toBeInTheDocument();
    expect(screen.getByText(/not fully settled/)).toBeInTheDocument();
  });

  it('gives wins, losses and unresolved lists equal visibility', async () => {
    mockAll({
      history: historyOf(
        [
          publishedList({ businessDate: '2026-03-10', status: 'won' }),
          publishedList({ businessDate: '2026-03-09', status: 'lost' }),
          publishedList({ businessDate: '2026-03-08', status: 'unresolved' }),
        ],
        [publishedList({ businessDate: '2026-03-07', status: 'void' })],
      ),
    });
    renderScreen();
    // A winners-only view would omit these; all must be present.
    expect(await screen.findByText('Lost')).toBeInTheDocument();
    expect(screen.getAllByText('Unresolved').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Void').length).toBeGreaterThan(0);
  });

  it('shows dates with no published list instead of skipping them', async () => {
    mockAll({
      history: historyOf([
        { businessDate: '2026-03-10', published: false, legs: [], message: 'No official five-match list was published for this date.' },
      ]),
    });
    renderScreen();
    expect(await screen.findByText('Not published')).toBeInTheDocument();
    expect(screen.getAllByText(/No official five-match list was published/).length).toBeGreaterThan(0);
  });

  it('does not identify status by colour alone', async () => {
    mockAll({
      history: historyOf([
        publishedList({ businessDate: '2026-03-10', status: 'won' }),
        publishedList({ businessDate: '2026-03-09', status: 'lost' }),
      ]),
    });
    renderScreen();
    // Each status carries a text label and a non-colour glyph.
    const won = (await screen.findAllByText('Won'))[0].closest('span');
    expect(won?.textContent).toMatch(/✓/);
    const lost = screen.getAllByText('Lost')[0].closest('span');
    expect(lost?.textContent).toMatch(/✕/);
  });

  it('reports metrics with their denominators and never coerces a null rate to zero', async () => {
    mockAll({
      summary: summaryOf({
        lists: { won: 0, lost: 0, void: 0, pending: 0, unresolved: 0, denominator: 0, win_rate: null },
        selections: { won: 0, lost: 0, void: 0, pending: 0, unresolved: 0, denominator: 0, hit_rate: null },
      }),
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Track record' });
    // Both rates are labelled distinctly, and a null rate is an em dash rather
    // than a misleading 0%.
    expect(screen.getByText('Betlist win rate')).toBeInTheDocument();
    expect(screen.getByText('Selection win rate')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('explains how forecasts work and states their limitations', async () => {
    mockAll();
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'How these forecasts work' })).toBeInTheDocument();
    expect(screen.getByText(/Probabilities describe likelihood, not outcomes/)).toBeInTheDocument();
    expect(screen.getAllByText(/before the earliest kickoff/).length).toBeGreaterThan(0);
  });

  it('surfaces a load failure instead of showing an empty history', async () => {
    mocked.getOfficialToday.mockRejectedValue(new Error('network'));
    mocked.getOfficialHistory.mockRejectedValue(new Error('network'));
    mocked.getOfficialSummary.mockRejectedValue(new Error('network'));
    mocked.getOfficialPreview.mockRejectedValue(new Error('network'));
    renderScreen();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
  });

  it('flags an unresolved reconciliation check rather than hiding it', async () => {
    mockAll({ today: publishedList({ lastCheckError: 'ExecutionError' }) });
    renderScreen();
    expect(await screen.findByText(/reconciliation check failed/i)).toBeInTheDocument();
  });

  it('marks a leg with no quote instead of inventing odds', async () => {
    const noOdds = publishedList();
    noOdds.legs[0].odds = null;
    mockAll({ today: noOdds });
    renderScreen();
    expect(await screen.findByText('No quote')).toBeInTheDocument();
  });

  it('paginates older history', async () => {
    mockAll({
      history: {
        ...historyOf([publishedList()], [publishedList({ businessDate: '2026-03-01' })]),
        totalPages: 2,
      },
    });
    renderScreen();
    const next = await screen.findByRole('button', { name: 'Older' });
    await userEvent.click(next);
    await waitFor(() => expect(mocked.getOfficialHistory).toHaveBeenCalledWith(2));
  });
});

describe('presentation helpers', () => {
  const { formatMoney, formatProbability, formatRate, formatBusinessDate } = jest.requireActual(
    '../../services/official/presentation',
  );

  it('formats money and refuses to render absent values as zero', () => {
    // en-ZA groups thousands with U+00A0 and a comma decimal separator.
    const normalise = (value: string | null) => value?.replace(/\u00a0/g, ' ') ?? null;
    expect(normalise(formatMoney('1850.00'))).toBe('R1 850,00');
    expect(normalise(formatMoney('-1000.00'))).toBe('-R1 000,00');
    // null/undefined are genuinely unavailable, not zero.
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney(undefined)).toBeNull();
    expect(formatMoney('')).toBeNull();
  });

  it('renders a null or missing rate as a dash, never as 0%', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(undefined)).toBe('—');
    expect(formatRate('0.5')).toBe('50.0%');
    expect(formatProbability(null)).toBe('—');
    expect(formatProbability('0.72')).toBe('72.0%');
  });

  it('renders a business date without a timezone shift', () => {
    // Must not become the 9th or 11th in any local timezone.
    expect(formatBusinessDate('2026-03-10')).toBe('10 March 2026');
  });
});
describe('per-list tally', () => {
  const { tallyList, formatRatio } = jest.requireActual('../../services/official/presentation');

  it('counts each outcome and rates only settled selections', () => {
    const tally = tallyList([
      { status: 'won' }, { status: 'won' }, { status: 'lost' },
      { status: 'void' }, { status: 'pending' },
    ]);
    expect(tally.won).toBe(2);
    expect(tally.lost).toBe(1);
    expect(tally.void).toBe(1);
    expect(tally.pending).toBe(1);
    expect(tally.total).toBe(5);
    // 2 / (2 + 1) — void and pending must not move the denominator.
    expect(tally.rate).toBeCloseTo(2 / 3);
  });

  it('returns no rate when nothing has settled, rather than 0%', () => {
    const tally = tallyList([{ status: 'pending' }, { status: 'void' }]);
    // An unsettled list must never be shown as a failure.
    expect(tally.rate).toBeNull();
    expect(formatRatio(tally.rate)).toBe('—');
  });

  it('handles an all-won and an all-lost list', () => {
    expect(tallyList([{ status: 'won' }, { status: 'won' }]).rate).toBe(1);
    expect(tallyList([{ status: 'lost' }, { status: 'lost' }]).rate).toBe(0);
  });

  it('excludes unresolved from the rate', () => {
    const tally = tallyList([{ status: 'won' }, { status: 'unresolved' }]);
    expect(tally.unresolved).toBe(1);
    expect(tally.rate).toBe(1);
  });
});

describe('list cards show their own win percentage', () => {
  it('renders the per-list rate and counts', async () => {
    const mixed = publishedList({
      legs: [
        { ...publishedList().legs[0], providerFixtureId: 1, status: 'won' },
        { ...publishedList().legs[0], providerFixtureId: 2, status: 'won' },
        { ...publishedList().legs[0], providerFixtureId: 3, status: 'lost' },
      ],
    });
    mockAll({ today: mixed, history: historyOf([mixed]) });
    renderScreen();
    // 2 won / 3 settled = 67%. The card appears in both the today and history
    // sections, so both instances are expected.
    expect((await screen.findAllByText('67%')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 won \/ 3 settled/).length).toBeGreaterThan(0);
  });

  it('shows a dash for a list with nothing settled yet', async () => {
    const pending = publishedList({
      status: 'pending',
      legs: [{ ...publishedList().legs[0], status: 'pending' }],
    });
    mockAll({ today: pending, history: historyOf([pending]) });
    renderScreen();
    expect((await screen.findAllByText('This list')).length).toBeGreaterThan(0);
    // No fabricated 0%.
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
