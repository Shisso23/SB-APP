import { DEFAULT_PREDICTION_CONFIG, mergePredictionConfig } from '../../config/prediction-config';
import { predictFixture, estimateLeagueAverage } from '../predict-fixture';
import { buildCandidateSelections } from '../selection';
import { findStandingsTable } from '../standings-lookup';
import { makeFixture, makeStandingRow, makeStandings } from '../test-support/fixture-builders';

const config = DEFAULT_PREDICTION_CONFIG;

const rows = Array.from({ length: 20 }, (_, index) =>
  makeStandingRow({
    teamId: index + 1,
    rank: index + 1,
    played: 20,
    win: 20 - index,
    draw: 0,
    lose: index,
    goalsFor: 40 - index,
    goalsAgainst: index * 2,
    points: (20 - index) * 3,
  })
);
const standings = [makeStandings({ leagueId: 1, season: 2023, rows })];

/** Build six home matches for `teamId` and six away matches for `opponentId`. */
const buildHistory = ({ homeId, awayId }: { homeId: number; awayId: number }) => {
  const fixtures = [];
  for (let i = 0; i < 6; i += 1) {
    fixtures.push(
      makeFixture({
        id: 1000 + i,
        timestamp: Date.UTC(2023, 8, 1 + i),
        homeId,
        awayId: 900 + i,
        homeGoals: 2,
        awayGoals: i % 2,
        leagueId: 1,
        season: 2023,
      })
    );
    fixtures.push(
      makeFixture({
        id: 2000 + i,
        timestamp: Date.UTC(2023, 8, 1 + i),
        homeId: 800 + i,
        awayId,
        homeGoals: i % 3,
        awayGoals: 1,
        leagueId: 1,
        season: 2023,
      })
    );
  }
  return fixtures;
};

const upcoming = makeFixture({
  id: 9999,
  timestamp: Date.UTC(2023, 9, 1),
  homeId: 1,
  awayId: 2,
  homeGoals: null,
  awayGoals: null,
  leagueId: 1,
  season: 2023,
  status: 'NS',
  homeName: 'Alpha',
  awayName: 'Beta',
});

const history = buildHistory({ homeId: 1, awayId: 2 });

describe('predictFixture (end-to-end)', () => {
  const prediction = predictFixture({
    fixture: upcoming,
    allFixtures: history,
    leaguesStandings: standings,
    standingsAreCurrent: false,
    now: upcoming.fixture.timestamp,
  });

  it('produces coherent market probabilities', () => {
    const p = prediction.probabilities;
    expect(p.homeWin + p.draw + p.awayWin).toBeCloseTo(1, 2);
    expect(p.bttsYes + p.bttsNo).toBeCloseTo(1, 2);
    expect(p.over2_5 + p.under2_5).toBeCloseTo(1, 2);
    expect(p.homeScores).toBeGreaterThan(0);
    expect(p.homeScores).toBeLessThanOrEqual(1);
  });

  it('exposes every supported market with probabilities in [0,1]', () => {
    expect(prediction.markets.length).toBeGreaterThanOrEqual(15);
    prediction.markets.forEach((market) => {
      expect(market.modelProbability).toBeGreaterThanOrEqual(0);
      expect(market.modelProbability).toBeLessThanOrEqual(1);
    });
  });

  it('does not qualify anything without odds, but reports model probabilities', () => {
    expect(prediction.dataQuality.oddsAvailable).toBe(false);
    expect(prediction.selections).toHaveLength(0);
    expect(prediction.markets.some((m) => m.modelProbability > 0)).toBe(true);
  });

  it('records sample sizes and home/away venue splits', () => {
    expect(prediction.homeTeam.venue).toBe('home');
    expect(prediction.awayTeam.venue).toBe('away');
    expect(prediction.homeTeam.venueSampleSize).toBe(5); // recentWindow default
    expect(prediction.awayTeam.venueSampleSize).toBe(5);
    expect(prediction.dataQuality.homeSampleSize).toBe(5);
  });

  it('uses the correct competition standings and marks no hindsight bias when told they are historical', () => {
    expect(prediction.dataQuality.standingsAvailable).toBe(true);
    expect(prediction.dataQuality.opponentStrengthHindsightBias).toBe(false);
  });

  it('never sees the fixture or future results (no leakage)', () => {
    // All analysed matches must precede the fixture timestamp.
    const cutoff = upcoming.fixture.timestamp;
    const seen = [
      ...prediction.homeTeam.overallForm.matches,
      ...prediction.awayTeam.overallForm.matches,
    ];
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((f) => f.fixture.timestamp < cutoff)).toBe(true);
    expect(seen.every((f) => f.fixture.id !== upcoming.fixture.id)).toBe(true);
  });

  it('ignores completed results timestamped after the target kickoff', () => {
    const futureResult = makeFixture({
      id: 8888,
      timestamp: upcoming.fixture.timestamp + 86_400,
      homeId: upcoming.teams.home.id,
      awayId: 999,
      homeGoals: 8,
      awayGoals: 0,
      leagueId: upcoming.league.id,
      season: upcoming.league.season,
      status: 'FT',
    });
    const withFutureResult = predictFixture({
      fixture: upcoming,
      allFixtures: [...history, futureResult],
      leaguesStandings: standings,
      standingsAreCurrent: false,
      now: upcoming.fixture.timestamp,
    });

    expect(withFutureResult.homeTeam.overallSampleSize).toBe(prediction.homeTeam.overallSampleSize);
    expect(withFutureResult.probabilities).toEqual(prediction.probabilities);
  });

  it('qualifies a selection and ranks by EV when odds are provided', () => {
    const withOdds = predictFixture({
      fixture: upcoming,
      allFixtures: history,
      leaguesStandings: standings,
      standingsAreCurrent: false,
      now: upcoming.fixture.timestamp,
      odds: [
        { marketId: 'over_2_5', decimalOdds: 2.2, timestamp: upcoming.fixture.timestamp },
        { marketId: 'under_2_5', decimalOdds: 1.7, timestamp: upcoming.fixture.timestamp },
        { marketId: 'btts_yes', decimalOdds: 2.4, timestamp: upcoming.fixture.timestamp },
        { marketId: 'btts_no', decimalOdds: 1.6, timestamp: upcoming.fixture.timestamp },
      ],
    });

    expect(withOdds.dataQuality.oddsAvailable).toBe(true);
    withOdds.selections.forEach((selection) => {
      expect(selection.qualifies).toBe(true);
      expect(selection.expectedValue).toBeDefined();
      expect(selection.marginAdjustedProbability).toBeDefined();
    });
    // Ranked by EV descending.
    for (let i = 1; i < withOdds.selections.length; i += 1) {
      const prev = withOdds.selections[i - 1].expectedValue ?? -Infinity;
      const curr = withOdds.selections[i].expectedValue ?? -Infinity;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('explains an accepted selection with evidence and a rejected one with reasons', () => {
    const withOdds = predictFixture({
      fixture: upcoming,
      allFixtures: history,
      leaguesStandings: standings,
      standingsAreCurrent: false,
      now: upcoming.fixture.timestamp,
      odds: [
        { marketId: 'over_2_5', decimalOdds: 3.5, timestamp: upcoming.fixture.timestamp },
        { marketId: 'under_2_5', decimalOdds: 1.3, timestamp: upcoming.fixture.timestamp },
      ],
    });

    const accepted = withOdds.markets.find((m) => m.qualifies);
    const rejected = withOdds.markets.find((m) => !m.qualifies && m.rejectReasons.length > 0);
    if (accepted) {
      expect(accepted.evidence.length).toBeGreaterThan(0);
    }
    expect(rejected).toBeDefined();
    expect(rejected!.rejectReasons.length).toBeGreaterThan(0);
  });

  it('degrades gracefully when the fixture has no history at all', () => {
    const noData = predictFixture({
      fixture: upcoming,
      allFixtures: [],
      leaguesStandings: [],
      now: upcoming.fixture.timestamp,
    });
    expect(noData.dataQuality.homeSampleSize).toBe(0);
    expect(noData.dataQuality.standingsAvailable).toBe(false);
    expect(noData.probabilities.homeWin + noData.probabilities.draw + noData.probabilities.awayWin).toBeCloseTo(1, 2);
    expect(noData.selections).toHaveLength(0);
    expect(noData.dataQuality.warnings.join(' ')).toMatch(/standings|bookmaker/i);
  });

  it('derives a league goals baseline from standings', () => {
    const lookup = findStandingsTable({ standings, leagueId: 1, season: 2023 });
    const baseline = estimateLeagueAverage(lookup);
    expect(baseline).toBeDefined();
    expect(baseline!).toBeGreaterThan(0);
  });

  it('merges config overrides without losing defaults', () => {
    const merged = mergePredictionConfig({ recentWindow: 8 });
    expect(merged.recentWindow).toBe(8);
    expect(merged.minVenueMatches).toBe(config.minVenueMatches);
    expect(merged.goals.gridSize).toBe(config.goals.gridSize);
  });

  it('filters fixtures with insufficient data out of candidate selections', () => {
    const poor = predictFixture({
      fixture: upcoming,
      allFixtures: [makeFixture({ id: 1, timestamp: 100, homeId: 1, awayId: 500, homeGoals: 1, awayGoals: 0, season: 2023 })],
      leaguesStandings: [],
      now: upcoming.fixture.timestamp,
    });
    const { candidates, rejected } = buildCandidateSelections({
      predictions: [prediction, poor],
      config,
    });
    expect(rejected.length).toBeGreaterThan(0);
    candidates.forEach((candidate) => {
      expect(candidate.reliability).toBeDefined();
      expect(candidate.reliability.homeSampleSize).toBeGreaterThanOrEqual(0);
    });
  });
});

void upcoming;
void history;
void rows;