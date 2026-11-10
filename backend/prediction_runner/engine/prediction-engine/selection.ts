import { DEFAULT_PREDICTION_CONFIG, PredictionConfig } from '../config/prediction-config';
import { FixturePrediction, MarketValue } from './types';
import { rankSelections } from './markets';
import { isStale } from './odds';

export interface CandidateSelection {
  fixtureId: number;
  matchLabel: string;
  market: MarketValue;
  /** Reliability shown separately from probability/EV. */
  reliability: {
    homeSampleSize: number;
    awaySampleSize: number;
    venueSamplesSufficient: boolean;
    standingsAvailable: boolean;
    oddsAvailable: boolean;
    oddsStale: boolean;
    score: number;
  };
}

export interface RejectedCandidate {
  fixtureId: number;
  matchLabel: string;
  market: MarketValue;
  reasons: string[];
}

export const rankDirectPicks = (predictions: FixturePrediction[], now: number, config = DEFAULT_PREDICTION_CONFIG) =>
  predictions
    .filter((prediction) => prediction.fixture.fixture.timestamp * 1000 > now)
    .flatMap((prediction) => {
      const market = [...prediction.selections]
        .filter((entry) => entry.qualifies && !entry.oddsStale &&
          !isStale(entry.oddsTimestamp, now, config.odds.staleAfterMinutes) && (entry.expectedValue ?? 0) > 0)
        .sort((first, second) => (second.expectedValue ?? 0) - (first.expectedValue ?? 0))[0];
      return market ? [{ prediction, market }] : [];
    })
    .sort((first, second) => (second.market.expectedValue ?? 0) - (first.market.expectedValue ?? 0));

export const rankUnpricedForecasts = (predictions: FixturePrediction[], now: number, config = DEFAULT_PREDICTION_CONFIG) =>
  predictions
    .filter((prediction) => !prediction.dataQuality.oddsAvailable && prediction.fixture.fixture.timestamp * 1000 > now)
    .map((prediction) => {
      const enoughHistory =
        Math.max(prediction.dataQuality.homeSampleSize, prediction.homeTeam.overallSampleSize) >= config.minTeamMatches &&
        Math.max(prediction.dataQuality.awaySampleSize, prediction.awayTeam.overallSampleSize) >= config.minTeamMatches;
      const market = enoughHistory ? [...prediction.markets]
        .filter((entry) => !entry.decimalOdds && Number.isFinite(entry.modelProbability) &&
          entry.modelProbability > 0 && entry.modelProbability < 1 &&
          !['home_dnb', 'away_dnb', 'home_or_draw', 'away_or_draw'].includes(entry.marketId))
        .sort((first, second) => second.modelProbability - first.modelProbability)[0] : undefined;
      return { prediction, market, enoughHistory };
    })
    .sort((first, second) => (second.market?.modelProbability ?? 0) - (first.market?.modelProbability ?? 0));

/**
 * Turn per-fixture predictions into a ranked candidate list.
 *
 * Fixtures with insufficient or unreliable data are filtered out. Every returned
 * candidate carries an explicit reliability block and every rejected market carries
 * human-readable reasons, so the caller can explain both acceptance and rejection.
 */
export const buildCandidateSelections = ({
  predictions,
  config,
}: {
  predictions: FixturePrediction[];
  config: PredictionConfig;
}): { candidates: CandidateSelection[]; rejected: RejectedCandidate[] } => {
  const candidates: CandidateSelection[] = [];
  const rejected: RejectedCandidate[] = [];

  predictions.forEach((prediction) => {
    const matchLabel = `${prediction.fixture.teams?.home?.name ?? 'Home'} vs ${
      prediction.fixture.teams?.away?.name ?? 'Away'
    }`;
    const fixtureId = Number(prediction.fixture.fixture?.id);

    // Fixture-level reliability gate.
    const hasMinimumData =
      prediction.dataQuality.homeSampleSize >= config.selection.minVenueSample ||
      prediction.dataQuality.homeSampleSize + prediction.homeTeam.overallSampleSize >=
        config.minTeamMatches;
    const computableMarkets = prediction.markets.filter((m) => m.modelProbability > 0).length;
    const enoughMarkets = computableMarkets >= config.selection.minComputableMarkets;

    if (!hasMinimumData || !enoughMarkets) {
      // Record the fixture as rejected at fixture level.
      prediction.markets.slice(0, 3).forEach((market) => {
        rejected.push({
          fixtureId,
          matchLabel,
          market,
          reasons: [
            !hasMinimumData
              ? 'Insufficient recent-match data for a reliable prediction.'
              : `Only ${computableMarkets} market(s) were computable (minimum ${config.selection.minComputableMarkets}).`,
          ],
        });
      });
      return;
    }

    const ranked = rankSelections(prediction.markets, config);
    const qualifyingIds = new Set(ranked.map((market) => market.marketId));

    ranked.forEach((market) => {
      candidates.push({
        fixtureId,
        matchLabel,
        market,
        reliability: {
          homeSampleSize: prediction.dataQuality.homeSampleSize,
          awaySampleSize: prediction.dataQuality.awaySampleSize,
          venueSamplesSufficient:
            prediction.dataQuality.homeVenueSufficient &&
            prediction.dataQuality.awayVenueSufficient,
          standingsAvailable: prediction.dataQuality.standingsAvailable,
          oddsAvailable: prediction.dataQuality.oddsAvailable,
          oddsStale: prediction.dataQuality.oddsStale,
          score: reliabilityScore(prediction),
        },
      });
    });

    prediction.markets
      .filter((market) => !qualifyingIds.has(market.marketId))
      .forEach((market) => {
        rejected.push({
          fixtureId,
          matchLabel,
          market,
          reasons: market.rejectReasons.length
            ? market.rejectReasons
            : ['Did not pass the configured thresholds.'],
        });
      });
  });

  // Rank candidates by EV when odds are present, else by probability × reliability.
  candidates.sort((a, b) => {
    const aEv = a.market.expectedValue;
    const bEv = b.market.expectedValue;
    if (aEv !== undefined && bEv !== undefined && aEv !== bEv) {
      return bEv - aEv;
    }
    return (
      b.market.modelProbability * b.reliability.score -
      a.market.modelProbability * a.reliability.score
    );
  });

  return { candidates, rejected };
};

/** A 0..1 reliability score based on sample sizes and data completeness. */
export const reliabilityScore = (prediction: FixturePrediction): number => {
  const q = prediction.dataQuality;
  let score = 0.5;

  score += Math.min(0.2, q.homeSampleSize * 0.04);
  score += Math.min(0.2, q.awaySampleSize * 0.04);
  if (q.homeVenueSufficient) score += 0.05;
  if (q.awayVenueSufficient) score += 0.05;
  if (q.standingsAvailable) score += 0.05;
  if (q.oddsAvailable) score += 0.05;
  if (q.oddsStale) score -= 0.1;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
};