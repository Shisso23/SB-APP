import { predictFixture } from '../predict-fixture';
import { buildCandidateSelections } from '../selection';
import { runBacktest } from '../backtest';
import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { makeFixture, makeStandingRow, makeStandings } from './fixture-builders';

/**
 * Deterministic demo dataset for the runnable example. No network access; results are
 * illustrative of the engine's mechanics only.
 */
const NOW = Date.UTC(2023, 9, 1);

const leagueRows = Array.from({ length: 20 }, (_, index) =>
  makeStandingRow({
    teamId: index + 1,
    rank: index + 1,
    played: 12,
    win: 12 - Math.floor(index / 2),
    draw: index % 3,
    lose: Math.floor(index / 4),
    goalsFor: 30 - index,
    goalsAgainst: index,
    points: (12 - Math.floor(index / 2)) * 3 + (index % 3),
  })
);

const standings = [makeStandings({ leagueId: 1, season: 2023, rows: leagueRows })];

/** A small synthetic season with a spread of scorelines. */
const buildHistory = () => {
  const fixtures = [];
  const base = Date.UTC(2023, 7, 1);
  for (let i = 0; i < 120; i += 1) {
    const home = (i % 20) + 1;
    const away = ((i + 5) % 20) + 1;
    if (home === away) continue;
    fixtures.push(
      makeFixture({
        id: i + 1,
        timestamp: base + i * 86_400_000,
        homeId: home,
        awayId: away,
        homeGoals: (i * 5) % 4,
        awayGoals: (i * 3) % 3,
        leagueId: 1,
        season: 2023,
      })
    );
  }
  return fixtures;
};

const history = buildHistory();

const upcoming = makeFixture({
  id: 999_999,
  timestamp: NOW,
  homeId: 1,
  awayId: 6,
  homeGoals: null,
  awayGoals: null,
  leagueId: 1,
  season: 2023,
  status: 'NS',
  homeName: 'Alpha FC',
  awayName: 'Beta United',
});

/** Example odds (illustrative values, with a timestamp for freshness checks). */
const odds = [
  { marketId: 'home_win' as const, decimalOdds: 1.9, timestamp: NOW },
  { marketId: 'draw' as const, decimalOdds: 3.6, timestamp: NOW },
  { marketId: 'away_win' as const, decimalOdds: 4.2, timestamp: NOW },
  { marketId: 'over_2_5' as const, decimalOdds: 2.05, timestamp: NOW },
  { marketId: 'under_2_5' as const, decimalOdds: 1.8, timestamp: NOW },
  { marketId: 'btts_yes' as const, decimalOdds: 1.95, timestamp: NOW },
  { marketId: 'btts_no' as const, decimalOdds: 1.9, timestamp: NOW },
];

export const fixture = () =>
  predictFixture({
    fixture: upcoming,
    allFixtures: history,
    leaguesStandings: standings,
    standingsAreCurrent: false,
    odds,
    now: NOW,
  });

export const candidateSelections = () => {
  const prediction = fixture();
  return buildCandidateSelections({ predictions: [prediction], config: DEFAULT_PREDICTION_CONFIG });
};

export const backtest = () =>
  runBacktest({
    allFixtures: history,
    standings,
    config: DEFAULT_PREDICTION_CONFIG,
    minFixturesForMeaningfulResult: 500,
  });

export { standings, history, odds, NOW };