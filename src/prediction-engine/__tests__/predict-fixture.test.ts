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
  it('preserves the migration golden outputs with production timestamp units', () => {
    const normaliseFixture = (fixture: typeof upcoming) => ({
      ...fixture,
      fixture: { ...fixture.fixture, timestamp: Math.floor(fixture.fixture.timestamp / 1000) },
    });
    const fixture = normaliseFixture(upcoming);
    const now = Date.parse(fixture.fixture.date) - 3_600_000;
    const input = {
      fixture,
      allFixtures: history.map(normaliseFixture),
      leaguesStandings: standings,
      standingsAreCurrent: false,
      now,
    };
    const priced = predictFixture({ ...input, odds: [
      { marketId: 'btts_yes', decimalOdds: 2.4, timestamp: now - 60_000 },
      { marketId: 'btts_no', decimalOdds: 1.6, timestamp: now - 60_000 },
      { marketId: 'home_over_0_5', decimalOdds: 1.6, timestamp: now - 60_000 },
      { marketId: 'away_over_0_5', decimalOdds: 1.8, timestamp: now - 60_000 },
    ] });
    const coldStart = predictFixture({ ...input, allFixtures: [], leaguesStandings: [] });
    const output = {
      probabilities: priced.probabilities,
      samples: [priced.homeTeam.venueSampleSize, priced.awayTeam.venueSampleSize,
        priced.homeTeam.overallSampleSize, priced.awayTeam.overallSampleSize],
      selections: priced.selections.map((market) => ({
        id: market.marketId, probability: market.modelProbability,
        edge: market.edge, ev: market.expectedValue,
      })),
      coldStart: { probabilities: coldStart.probabilities, selectionIds: coldStart.selections.map((market) => market.marketId) },
    };
    const roundedOutput = JSON.parse(JSON.stringify(output, (_key, value) =>
      typeof value === 'number' ? Number(value.toFixed(4)) : value
    ));
    expect(roundedOutput).toEqual({
      probabilities: {
        expectedGoals: {
          home: 1.572, away: 0.9291, homeAttack: 1.2525, homeDefence: 0.4734,
          awayAttack: 0.7209, awayDefence: 0.7696, shrinkageApplied: 0,
        },
        homeWin: 0.521, draw: 0.2552, awayWin: 0.2237,
        homeScores: 0.791, awayScores: 0.606,
        bttsYes: 0.6112, bttsNo: 0.3888,
        over1_5: 0.8026, under1_5: 0.1974,
        over2_5: 0.5816, under2_5: 0.4184,
        over3_5: 0.3602, under3_5: 0.6398,
        homeOrDraw: 0.7763, awayOrDraw: 0.479,
        homeDrawNoBet: 0.6996, awayDrawNoBet: 0.3004,
        topScorelines: [
          { home: 1, away: 0, probability: 0.1309 },
          { home: 1, away: 1, probability: 0.1205 },
          { home: 2, away: 0, probability: 0.1001 },
          { home: 2, away: 1, probability: 0.093 },
          { home: 0, away: 0, probability: 0.0813 },
        ],
      },
      samples: [6, 6, 6, 6],
      selections: [
        { id: 'btts_yes', probability: 0.6112, edge: 0.2112, ev: 0.4669 },
        { id: 'home_over_0_5', probability: 0.791, edge: 0.166, ev: 0.2656 },
      ],
      coldStart: {
        probabilities: {
          expectedGoals: {
            home: 1.35, away: 1.35, homeAttack: 1, homeDefence: 1,
            awayAttack: 1, awayDefence: 1, shrinkageApplied: 0,
          },
          homeWin: 0.3699, draw: 0.2601, awayWin: 0.3699,
          homeScores: 0.7408, awayScores: 0.7408,
          bttsYes: 0.5475, bttsNo: 0.4525,
          over1_5: 0.7477, under1_5: 0.2523,
          over2_5: 0.5035, under2_5: 0.4965,
          over3_5: 0.2857, under3_5: 0.7143,
          homeOrDraw: 0.6301, awayOrDraw: 0.6301,
          homeDrawNoBet: 0.5, awayDrawNoBet: 0.5,
          topScorelines: [
            { home: 1, away: 1, probability: 0.1232 },
            { home: 0, away: 1, probability: 0.0932 },
            { home: 1, away: 0, probability: 0.0932 },
            { home: 1, away: 2, probability: 0.0817 },
            { home: 2, away: 1, probability: 0.0817 },
          ],
        },
        selectionIds: [],
      },
    });
    expect(predictFixture(input).probabilities).toEqual(priced.probabilities);
  });

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

  it.each([undefined, NaN, upcoming.fixture.timestamp + 1])('reports unverifiable odds consistently without altering probabilities (%s)', (timestamp) => {
    const withOdds = predictFixture({
      fixture: upcoming, allFixtures: history, leaguesStandings: standings,
      standingsAreCurrent: false, now: upcoming.fixture.timestamp,
      odds: [{ marketId: 'btts_yes', decimalOdds: 3, timestamp }],
    });
    expect(withOdds.probabilities).toEqual(prediction.probabilities);
    expect(withOdds.dataQuality.oddsAvailable).toBe(true);
    expect(withOdds.dataQuality.oddsStale).toBe(true);
    expect(withOdds.selections).toEqual([]);
    expect(withOdds.dataQuality.warnings.join(' ')).toMatch(/update time|freshness/);
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
    expect(config.recentWindow).toBe(20);
    expect(prediction.homeTeam.venueSampleSize).toBe(Math.min(config.recentWindow, 6));
    expect(prediction.awayTeam.venueSampleSize).toBe(Math.min(config.recentWindow, 6));
    expect(prediction.dataQuality.homeSampleSize).toBe(prediction.homeTeam.venueSampleSize);
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