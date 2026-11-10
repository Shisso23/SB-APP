import { betOptionsEnum } from '../enums/bet-options.enums';
import { betOptionModel } from '../models/bet-option-model';
import { FixtureDataModel } from '../models/fixtures';
import { StandingsModel } from '../models/standings-models';
import { DEFAULT_PREDICTION_CONFIG, PredictionConfig } from '../config/prediction-config';
import { predictFixture } from './predict-fixture';
import { MarketId } from './types';

/**
 * Map each engine market onto a numeric bet-option id. These ids are additive and do
 * not collide with the existing `betOptionsEnum` values (which stop at 38).
 */
export const MODEL_MARKET_IDS: Record<MarketId, number> = {
  home_win: 100,
  draw: 101,
  away_win: 102,
  home_over_0_5: 103,
  away_over_0_5: 104,
  btts_yes: 105,
  btts_no: 106,
  over_1_5: 107,
  under_1_5: 108,
  over_2_5: 109,
  under_2_5: 110,
  over_3_5: 111,
  under_3_5: 112,
  home_or_draw: 113,
  away_or_draw: 114,
  home_dnb: 115,
  away_dnb: 116,
};

export const MODEL_MARKET_LABELS: Record<MarketId, { name: string; shortName: string; description: string }> = {
  home_win: { name: 'Model: Home Win', shortName: 'M-Home', description: 'Poisson-modelled home win probability.' },
  draw: { name: 'Model: Draw', shortName: 'M-Draw', description: 'Poisson-modelled draw probability.' },
  away_win: { name: 'Model: Away Win', shortName: 'M-Away', description: 'Poisson-modelled away win probability.' },
  home_over_0_5: { name: 'Model: Home to score', shortName: 'M-H.O0.5', description: 'Probability the home team scores at least once.' },
  away_over_0_5: { name: 'Model: Away to score', shortName: 'M-A.O0.5', description: 'Probability the away team scores at least once.' },
  btts_yes: { name: 'Model: BTTS Yes', shortName: 'M-GG', description: 'Probability both teams score.' },
  btts_no: { name: 'Model: BTTS No', shortName: 'M-NG', description: 'Probability at least one team fails to score.' },
  over_1_5: { name: 'Model: Over 1.5', shortName: 'M-O1.5', description: 'Probability of 2+ total goals.' },
  under_1_5: { name: 'Model: Under 1.5', shortName: 'M-U1.5', description: 'Probability of fewer than 2 total goals.' },
  over_2_5: { name: 'Model: Over 2.5', shortName: 'M-O2.5', description: 'Probability of 3+ total goals.' },
  under_2_5: { name: 'Model: Under 2.5', shortName: 'M-U2.5', description: 'Probability of fewer than 3 total goals.' },
  over_3_5: { name: 'Model: Over 3.5', shortName: 'M-O3.5', description: 'Probability of 4+ total goals.' },
  under_3_5: { name: 'Model: Under 3.5', shortName: 'M-U3.5', description: 'Probability of fewer than 4 total goals.' },
  home_or_draw: { name: 'Model: Home or Draw', shortName: 'M-H/D', description: 'Double chance: home win or draw.' },
  away_or_draw: { name: 'Model: Away or Draw', shortName: 'M-A/D', description: 'Double chance: away win or draw.' },
  home_dnb: { name: 'Model: Home (DNB)', shortName: 'M-H.DNB', description: 'Draw no bet: home.' },
  away_dnb: { name: 'Model: Away (DNB)', shortName: 'M-A.DNB', description: 'Draw no bet: away.' },
};

/**
 * Build a `betOptionModel` for a model market that plugs into the existing
 * `betOptions` registry. It keeps the existing `{ fixtures, option }` shape so the
 * current screen pipeline continues to work unchanged, while the richer per-fixture
 * predictions remain available through `predictFixturesWithEngine`.
 */
export const createModelBetOption = (
  marketId: MarketId,
  config: PredictionConfig = DEFAULT_PREDICTION_CONFIG
): betOptionModel => {
  const meta = MODEL_MARKET_LABELS[marketId];
  const id = MODEL_MARKET_IDS[marketId];

  return new betOptionModel({
    id,
    name: meta.name,
    shortName: meta.shortName,
    description: meta.description,
    level: 3,
    predict: ({
      currentFixtures,
      allFixtures,
      leaguesStandings,
    }: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => {
      const fixtures = (currentFixtures || []).filter((fixture) => {
        const prediction = predictFixture(
          { fixture, allFixtures, leaguesStandings, standingsAreCurrent: true },
          config as any
        );
        return prediction.markets
          .filter((market) => market.marketId === marketId)
          .some((market) => market.qualifies);
      });

      return {
        fixtures,
        option: new betOptionModel({
          id,
          name: meta.name,
          shortName: meta.shortName,
          description: meta.description,
          level: 3,
          predict: () => ({ fixtures: [], option: {} as betOptionModel }),
        }),
      };
    },
  });
};

/**
 * Return the full engine prediction for every fixture that has enough data. This is
 * the richer entry point used by the UI to display probabilities and explanations.
 */
export const predictFixturesWithEngine = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
  config = DEFAULT_PREDICTION_CONFIG,
  standingsAreCurrent = true,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
  config?: PredictionConfig;
  standingsAreCurrent?: boolean;
}) =>
  (currentFixtures || []).map((fixture) =>
    predictFixture(
      { fixture, allFixtures, leaguesStandings, standingsAreCurrent },
      config as any
    )
  );

void betOptionsEnum;