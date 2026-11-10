export * from './types';
export {
  predictFixture,
  estimateLeagueAverage,
  estimateLeagueAverageFromFixtures,
} from './predict-fixture';
export {
  buildPoissonGrid,
  estimateExpectedGoals,
  modelMatch,
  poissonPmf,
} from './poisson';
export {
  impliedProbability,
  expectedValue,
  breakEvenProbability,
  buildMarketValue,
  computeMarginAdjustedOverUnder,
} from './odds';
export {
  buildMarkets,
  rankSelections,
  groupCorrelatedMarkets,
  SUPPORTED_MARKETS,
} from './markets';
export { buildCandidateSelections, reliabilityScore } from './selection';
export { runBacktest, brierScore, logLoss, buildCalibrationBuckets } from './backtest';
export {
  collectTeamMatches,
  aggregateTeamForm,
  blendVenueAndOverall,
  goalsForTeam,
  goalsAgainstTeam,
} from './team-form';
export {
  classifyOpponentStrength,
  buildOpponentAdjustedForm,
  opponentQualityMultiplier,
  opponentStrengthEvidence,
} from './opponent-strength';
export {
  findStandingsTable,
  findStandingRow,
  parseSeason,
  pointsPerGame,
} from './standings-lookup';
export {
  createModelBetOption,
  predictFixturesWithEngine,
  MODEL_MARKET_IDS,
  MODEL_MARKET_LABELS,
} from './market-adapters';
export {
  mapApiFootballOdds,
  mapApiFootballOddsPayload,
  API_FOOTBALL_MARKET_IDS,
} from './odds-provider';
export {
  buildPaperSelections,
  settleSelection,
  evaluateMarket,
  summarisePaperSelections,
  summariseBy,
  probabilityBand,
  oddsRange,
  createEmptyPaperRecord,
} from './paper-tracking';
export type { PaperSelection, PaperRecord, PaperSettlement, PaperSummary } from './paper-tracking';
export {
  readPaperRecord,
  writePaperRecord,
  appendPaperSelections,
  settlePaperRecord,
  paperRecordCounts,
  PAPER_TRACKING_KEY,
} from './paper-store';
export {
  DEFAULT_PREDICTION_CONFIG,
  mergePredictionConfig,
} from '../config/prediction-config';
export type { PredictionConfig } from '../config/prediction-config';