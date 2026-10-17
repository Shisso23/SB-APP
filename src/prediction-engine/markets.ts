import { PredictionConfig } from '../config/prediction-config';
import {
  FixturePrediction,
  MARKET_LABELS,
  MarketId,
  MarketOdds,
  MarketValue,
  MatchProbabilities,
  TeamFormAnalysis,
} from './types';
import { buildMarketValue, computeMarginAdjustedOverUnder } from './odds';
import { opponentStrengthEvidence } from './opponent-strength';
import { formatPercent } from './math-utils';

/** A selection of every market the model can price, in display order. */
export const SUPPORTED_MARKETS: MarketId[] = [
  'home_win',
  'draw',
  'away_win',
  'home_over_0_5',
  'away_over_0_5',
  'btts_yes',
  'btts_no',
  'over_1_5',
  'under_1_5',
  'over_2_5',
  'under_2_5',
  'over_3_5',
  'under_3_5',
  'home_or_draw',
  'away_or_draw',
  'home_dnb',
  'away_dnb',
];

const marketProbability = (probabilities: MatchProbabilities, marketId: MarketId): number => {
  switch (marketId) {
    case 'home_win':
      return probabilities.homeWin;
    case 'draw':
      return probabilities.draw;
    case 'away_win':
      return probabilities.awayWin;
    case 'home_over_0_5':
      return probabilities.homeScores;
    case 'away_over_0_5':
      return probabilities.awayScores;
    case 'btts_yes':
      return probabilities.bttsYes;
    case 'btts_no':
      return probabilities.bttsNo;
    case 'over_1_5':
      return probabilities.over1_5;
    case 'under_1_5':
      return probabilities.under1_5;
    case 'over_2_5':
      return probabilities.over2_5;
    case 'under_2_5':
      return probabilities.under2_5;
    case 'over_3_5':
      return probabilities.over3_5;
    case 'under_3_5':
      return probabilities.under3_5;
    case 'home_or_draw':
      return probabilities.homeOrDraw;
    case 'away_or_draw':
      return probabilities.awayOrDraw;
    case 'home_dnb':
      return probabilities.homeDrawNoBet;
    case 'away_dnb':
      return probabilities.awayDrawNoBet;
    default:
      return 0;
  }
};

/**
 * Build the evidence lines explaining a market's probability. These surface observed
 * frequencies and opponent context. They never assert certainty, and frequencies are
 * labelled as such rather than as calibrated probabilities.
 */
export const buildMarketEvidence = ({
  marketId,
  home,
  away,
  probabilities,
  goalModelApplied = false,
}: {
  marketId: MarketId;
  home: TeamFormAnalysis;
  away: TeamFormAnalysis;
  probabilities: MatchProbabilities;
  goalModelApplied?: boolean;
}): string[] => {
  const homeName = home.teamName;
  const awayName = away.teamName;
  const lines: string[] = [];

  const sampleWarning = (form: TeamFormAnalysis) =>
    form.venueSampleSize < 3
      ? `${form.teamName}: only ${form.venueSampleSize} venue-specific match(es) — sample is small.`
      : null;

  switch (marketId) {
    case 'home_over_0_5':
      lines.push(
        `${homeName} scored in ${formatPercent(home.blended.scoredPct / 100)} of sampled matches (venue-blended); ${awayName} kept ${formatPercent(away.blended.cleanSheetPct / 100)} clean sheets.`
      );
      break;
    case 'away_over_0_5':
      lines.push(
        `${awayName} scored in ${formatPercent(away.blended.scoredPct / 100)} of sampled matches (venue-blended); ${homeName} kept ${formatPercent(home.blended.cleanSheetPct / 100)} clean sheets.`
      );
      break;
    case 'btts_yes':
      lines.push(
        `${homeName} scored in ${formatPercent(home.blended.scoredPct / 100)} and ${awayName} scored in ${formatPercent(away.blended.scoredPct / 100)} of sampled matches.`
      );
      lines.push(
        `Combined BTTS frequency in sample: home side ${formatPercent(home.blended.bttsPct / 100)}, away side ${formatPercent(away.blended.bttsPct / 100)}.`
      );
      break;
    case 'btts_no':
      lines.push(
        `At least one side has been held scoreless relatively often: ${homeName} conceded in ${formatPercent(home.blended.concededPct / 100)}, ${awayName} conceded in ${formatPercent(away.blended.concededPct / 100)} of sampled matches.`
      );
      break;
    case 'over_1_5':
    case 'over_2_5':
    case 'over_3_5': {
      const threshold = marketId === 'over_1_5' ? 1.5 : marketId === 'over_2_5' ? 2.5 : 3.5;
      lines.push(
        `Base-model expected goals: ${homeName} ${probabilities.expectedGoals.home.toFixed(2)}, ${awayName} ${probabilities.expectedGoals.away.toFixed(2)} (total ${(probabilities.expectedGoals.home + probabilities.expectedGoals.away).toFixed(2)}). ${goalModelApplied ? 'This total-goals probability uses the separate prior-blended goal model.' : ''}`
      );
      lines.push(
        `Sample over ${threshold} frequency: home venue ${formatPercent((marketId === 'over_1_5' ? home.blended.over1_5Pct : marketId === 'over_2_5' ? home.blended.over2_5Pct : home.blended.over3_5Pct) / 100)}; away venue ${formatPercent((marketId === 'over_1_5' ? away.blended.over1_5Pct : marketId === 'over_2_5' ? away.blended.over2_5Pct : away.blended.over3_5Pct) / 100)}.`
      );
      break;
    }
    case 'under_1_5':
    case 'under_2_5':
    case 'under_3_5':
      lines.push(
        `Base-model expected goals total ${(probabilities.expectedGoals.home + probabilities.expectedGoals.away).toFixed(2)}; clean-sheet frequencies are ${formatPercent(home.blended.cleanSheetPct / 100)} (${homeName}) and ${formatPercent(away.blended.cleanSheetPct / 100)} (${awayName}). ${goalModelApplied ? 'This total-goals probability uses the separate prior-blended goal model.' : ''}`
      );
      break;
    case 'home_win':
      lines.push(
        `${homeName} win frequency in sample ${formatPercent(home.blended.winPct / 100)}; ${awayName} loss frequency ${formatPercent(away.blended.lossPct / 100)}.`
      );
      break;
    case 'away_win':
      lines.push(
        `${awayName} win frequency in sample ${formatPercent(away.blended.winPct / 100)}; ${homeName} loss frequency ${formatPercent(home.blended.lossPct / 100)}.`
      );
      break;
    case 'draw':
      lines.push(
        `Draw frequency in sample: ${homeName} ${formatPercent(home.blended.drawPct / 100)}, ${awayName} ${formatPercent(away.blended.drawPct / 100)}.`
      );
      break;
    case 'home_or_draw':
      lines.push(
        `Combines home win plus draw; ${homeName} avoided defeat in ${formatPercent((home.blended.winPct + home.blended.drawPct) / 100)} of sampled matches.`
      );
      break;
    case 'away_or_draw':
      lines.push(
        `Combines away win plus draw; ${awayName} avoided defeat in ${formatPercent((away.blended.winPct + away.blended.drawPct) / 100)} of sampled matches.`
      );
      break;
    case 'home_dnb':
    case 'away_dnb':
      lines.push('Draw-no-bet probability is derived from the 1X2 model with draws removed.');
      break;
    default:
      break;
  }

  const warning = sampleWarning(home) ?? sampleWarning(away);
  if (warning) {
    lines.push(warning);
  }

  return lines;
};

export interface BuildMarketsResult {
  markets: MarketValue[];
  selections: MarketValue[];
}

/**
 * Produce a MarketValue for every supported market and rank the qualifying selections.
 * When odds are absent, markets still carry model probabilities but are labelled with
 * "no verified betting value".
 */
export const buildMarkets = ({
  probabilities,
  odds,
  config,
  home,
  away,
  now,
  dataQualityWarnings,
  quality,
  goalModelApplied = false,
}: {
  probabilities: MatchProbabilities;
  odds?: MarketOdds[];
  config: PredictionConfig;
  home: TeamFormAnalysis;
  away: TeamFormAnalysis;
  now: number;
  dataQualityWarnings: string[];
  quality?: SelectionQualityGate;
  goalModelApplied?: boolean;
}): BuildMarketsResult => {
  const adjusted = odds ? computeMarginAdjustedOverUnder(odds) : {};
  const oddsById = new Map<MarketId, MarketOdds>();
  (odds ?? []).forEach((entry) => oddsById.set(entry.marketId, entry));

  const strengthEvidence = [
    ...opponentStrengthEvidence(home.opponentStrength).slice(0, 1),
    ...opponentStrengthEvidence(away.opponentStrength).slice(0, 1),
  ];

  const markets = SUPPORTED_MARKETS.map((marketId) => {
    const modelProbability = marketProbability(probabilities, marketId);
    const evidence = [
      ...buildMarketEvidence({ marketId, home, away, probabilities, goalModelApplied }),
      ...strengthEvidence,
      ...dataQualityWarnings,
    ];

    return buildMarketValue({
      marketId,
      modelProbability,
      odds: oddsById.get(marketId),
      config,
      marginAdjustedProbability: adjusted[marketId],
      now,
      evidence,
    });
  });

  const selections = rankSelections(markets, config, quality);

  return { markets, selections };
};

/** Data-quality signals that gate whether a market may be recommended at all. */
export interface SelectionQualityGate {
  /** Number of matches used for the home side (venue sample). */
  homeSampleSize: number;
  awaySampleSize: number;
  /** Overall matches available as supplementary evidence. */
  homeOverallSampleSize?: number;
  awayOverallSampleSize?: number;
  minSampleSize: number;
}

const passesQualityGate = (
  market: MarketValue,
  config: PredictionConfig,
  quality?: SelectionQualityGate
): boolean => {
  if (!quality) {
    return true;
  }
  const homeTotal = Math.max(quality.homeSampleSize, quality.homeOverallSampleSize ?? 0);
  const awayTotal = Math.max(quality.awaySampleSize, quality.awayOverallSampleSize ?? 0);
  // Abstain entirely when either side lacks the minimum evidence.
  return homeTotal >= quality.minSampleSize && awayTotal >= quality.minSampleSize;
};

/**
 * Rank qualifying selections. When odds exist we sort by expected value, otherwise by
 * model probability.
 *
 * An optional `quality` gate is applied so the caller can abstain from recommending a
 * market when the underlying sample is too small. Reliability is surfaced separately by
 * the caller (see `selection.ts`), never conflated with probability or EV.
 */
export const rankSelections = (
  markets: MarketValue[],
  config: PredictionConfig,
  quality?: SelectionQualityGate
): MarketValue[] => {
  const qualifying = markets.filter(
    (market) => market.qualifies && passesQualityGate(market, config, quality)
  );

  qualifying.sort((a, b) => {
    const aEv = a.expectedValue ?? Number.NEGATIVE_INFINITY;
    const bEv = b.expectedValue ?? Number.NEGATIVE_INFINITY;
    if (aEv !== bEv) {
      return bEv - aEv;
    }
    return b.modelProbability - a.modelProbability;
  });

  return qualifying.slice(0, config.selection.maxSelections);
};

/**
 * Group correlated selections so callers do not treat them as independent. Markets
 * within the same group are mutually exclusive or strongly correlated.
 */
export const groupCorrelatedMarkets = (markets: MarketValue[]): Record<string, MarketId[]> => {
  const groups: Record<string, MarketId[]> = {
    '1X2': ['home_win', 'draw', 'away_win'],
    'team-to-score': ['home_over_0_5', 'away_over_0_5'],
    BTTS: ['btts_yes', 'btts_no'],
    'total-goals': ['over_1_5', 'under_1_5', 'over_2_5', 'under_2_5', 'over_3_5', 'under_3_5'],
    'double-chance': ['home_or_draw', 'away_or_draw'],
    DNB: ['home_dnb', 'away_dnb'],
  };

  const relevant: Record<string, MarketId[]> = {};
  Object.entries(groups).forEach(([key, ids]) => {
    const present = ids.filter((id) => markets.some((market) => market.marketId === id));
    if (present.length > 0) {
      relevant[key] = present;
    }
  });
  return relevant;
};

export { MARKET_LABELS };
export type { FixturePrediction };