import { FixtureDataModel } from '../models/fixtures';
import { StandingsDataStandingModel, StandingsModel } from '../models/standings-models';

/** A single market selection with a calibrated-by-model probability. */
export type MarketId =
  | 'home_win'
  | 'draw'
  | 'away_win'
  | 'home_over_0_5'
  | 'away_over_0_5'
  | 'btts_yes'
  | 'btts_no'
  | 'over_1_5'
  | 'under_1_5'
  | 'over_2_5'
  | 'under_2_5'
  | 'over_3_5'
  | 'under_3_5'
  | 'home_or_draw'
  | 'away_or_draw'
  | 'home_dnb'
  | 'away_dnb';

export const MARKET_LABELS: Record<MarketId, string> = {
  home_win: 'Home win',
  draw: 'Draw',
  away_win: 'Away win',
  home_over_0_5: 'Home team to score (Over 0.5)',
  away_over_0_5: 'Away team to score (Over 0.5)',
  btts_yes: 'Both teams to score',
  btts_no: 'Both teams NOT to score',
  over_1_5: 'Over 1.5 goals',
  under_1_5: 'Under 1.5 goals',
  over_2_5: 'Over 2.5 goals',
  under_2_5: 'Under 2.5 goals',
  over_3_5: 'Over 3.5 goals',
  under_3_5: 'Under 3.5 goals',
  home_or_draw: 'Double chance: Home or Draw',
  away_or_draw: 'Double chance: Away or Draw',
  home_dnb: 'Draw no bet: Home',
  away_dnb: 'Draw no bet: Away',
};

/** Explicit data-quality flags so the UI never overstates confidence. */
export interface DataQuality {
  /** Number of finished matches used for the home team (venue + overall). */
  homeSampleSize: number;
  awaySampleSize: number;
  /** Whether the venue-specific sample for each side met the configured minimum. */
  homeVenueSufficient: boolean;
  awayVenueSufficient: boolean;
  h2hSampleSize: number;
  /** Standings were available for the correct league and season. */
  standingsAvailable: boolean;
  /**
   * True when the only standings available are the *current* table, so historical
   * opponent classification carries hindsight bias.
   */
  opponentStrengthHindsightBias: boolean;
  /** Odds were present for at least one market. */
  oddsAvailable: boolean;
  oddsStale: boolean;
  fullTimeResultsOnly: boolean;
  warnings: string[];
  /**
   * Markets whose held-out predictive performance was validated against a baseline on
   * real data (see docs/prediction-engine-goal-market-improvement.md).
   * Everything else must be labelled "unvalidated".
   */
  validatedMarkets: MarketId[];
  /** Markets with measured but weak/no edge over a simple baseline. */
  weakMarkets: MarketId[];
  /** How the goal-market probabilities were produced (for transparency). */
  goalModel: 'prior-blended' | 'engine';
}

/** Per-venue aggregate for a team, backed by raw match records for explanations. */
export interface TeamVenueForm {
  sampleSize: number;
  /** Raw finished matches kept for debugging/explanations, newest first. */
  matches: FixtureDataModel[];
  goalsScored: number;
  goalsConceded: number;
  averageGoalsScored: number;
  averageGoalsConceded: number;
  /** Percentages in 0..100, derived from the sample. */
  scoredPct: number;
  concededPct: number;
  bttsPct: number;
  over1_5Pct: number;
  over2_5Pct: number;
  over3_5Pct: number;
  cleanSheetPct: number;
  winPct: number;
  drawPct: number;
  lossPct: number;
  /** Trend in goals scored/conceded: positive = improving over the window. */
  scoringTrend: number;
  defenceTrend: number;
}

export type OpponentStrengthBand = 'strong' | 'upper' | 'mid' | 'lower' | 'unknown';

export interface OpponentStrengthSummary {
  band: OpponentStrengthBand;
  /** Standings rank and points per game when known. */
  rank?: number;
  pointsPerGame?: number;
  goalDifference?: number;
  /** 0..1 confidence in the classification (reduced for current-only standings). */
  confidence: number;
  reason: string;
}

export interface OpponentAdjustedForm {
  vsStrong: number;
  vsUpper: number;
  vsMid: number;
  vsLower: number;
  /** Record of the most recent opponents with their classification. */
  entries: Array<{
    fixtureId: number;
    opponentId: number;
    opponentName: string;
    strength: OpponentStrengthSummary;
    goalsScored: number;
    goalsConceded: number;
  }>;
}

export interface TeamFormAnalysis {
  teamId: number;
  teamName: string;
  venue: 'home' | 'away';
  /** Venue-specific form (home team at home / away team away). */
  venueForm: TeamVenueForm;
  /** Overall form across both venues, used as supplementary evidence. */
  overallForm: TeamVenueForm;
  /**
   * Blended form actually used by the model: venue-specific weighted by
   * `venueWeightWhenSufficient`, or leaning on overall when the venue sample is small.
   */
  blended: TeamVenueForm;
  /** Sample sizes are surfaced so callers never overstate certainty. */
  venueSampleSize: number;
  overallSampleSize: number;
  opponentStrength: OpponentAdjustedForm;
  notes: string[];
}

export interface ExpectedGoals {
  home: number;
  away: number;
  /** Diagnostics behind the estimate. */
  homeAttack: number;
  homeDefence: number;
  awayAttack: number;
  awayDefence: number;
  shrinkageApplied: number;
}

export interface ScorelineProbability {
  home: number;
  away: number;
  probability: number;
}

export interface MatchProbabilities {
  expectedGoals: ExpectedGoals;
  /** 1X2 probabilities, guaranteed to sum to 1. */
  homeWin: number;
  draw: number;
  awayWin: number;
  /** Team scoring probabilities derived from the Poisson grid. */
  homeScores: number;
  awayScores: number;
  bttsYes: number;
  bttsNo: number;
  over1_5: number;
  under1_5: number;
  over2_5: number;
  under2_5: number;
  over3_5: number;
  under3_5: number;
  homeOrDraw: number;
  awayOrDraw: number;
  homeDrawNoBet: number;
  awayDrawNoBet: number;
  /** Most likely scorelines for transparency. */
  topScorelines: ScorelineProbability[];
}

export interface MarketOdds {
  marketId: MarketId;
  decimalOdds: number;
  /** Margin-removed probability calculated within this bookmaker's complete market. */
  marginAdjustedProbability?: number;
  /** Timestamp (ms) when the odds were observed, when known. */
  timestamp?: number;
  bookmaker?: string;
}

export interface MarketValue {
  marketId: MarketId;
  label: string;
  modelProbability: number;
  /** 1 / decimalOdds (raw, still includes the margin). */
  rawImpliedProbability: number;
  /** Normalised implied probability with the margin removed, when derivable. */
  marginAdjustedProbability?: number;
  /** modelProbability - marginAdjustedProbability (or raw when margin unknown). */
  edge: number;
  expectedValue?: number;
  breakEvenProbability?: number;
  decimalOdds?: number;
  bookmaker?: string;
  oddsTimestamp?: number;
  oddsStale: boolean;
  /** Reasons this selection passed or failed its thresholds. */
  passedProbabilityThreshold: boolean;
  passedEdgeThreshold: boolean;
  qualifies: boolean;
  rejectReasons: string[];
  evidence: string[];
}

export interface FixturePrediction {
  fixture: FixtureDataModel;
  homeTeam: TeamFormAnalysis;
  awayTeam: TeamFormAnalysis;
  probabilities: MatchProbabilities;
  markets: MarketValue[];
  selections: MarketValue[];
  dataQuality: DataQuality;
  /** Short, human-readable summary safe to display directly. */
  headline: string;
}

export interface PredictionInput {
  fixture: FixtureDataModel;
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
  odds?: MarketOdds[];
  /** Overrides where the standings provided reflect the current season/table. */
  standingsAreCurrent?: boolean;
  /** Injectable clock for deterministic tests/backtests. */
  now?: number;
}

/** Raw outcome used by the backtester. */
export interface FixtureOutcome {
  fixtureId: number;
  homeGoals: number;
  awayGoals: number;
  kickoffTimestamp: number;
}

export interface CalibrationBucket {
  lowerBound: number;
  upperBound: number;
  predictions: number;
  meanPredicted: number;
  observedFrequency: number;
}

export interface BacktestMarketResult {
  marketId: MarketId;
  predictions: number;
  hits: number;
  accuracy: number;
  brierScore: number;
  logLoss: number;
  calibration: CalibrationBucket[];
  /** Brier score of the "always predict the training base rate" baseline. */
  baselineBrierScore?: number;
  /** Log loss of the same baseline. */
  baselineLogLoss?: number;
  /** Base rate observed in the training window. */
  baselineProbability?: number;
  /**
   * Brier skill score = 1 - modelBrier / baselineBrier.
   * Positive means the model beats the base-rate baseline.
   */
  brierSkillScore?: number;
}

export interface BacktestResult {
  totalFixtures: number;
  skippedFixtures: number;
  markets: BacktestMarketResult[];
  /** Whether the dataset was large enough to be meaningful. */
  sufficientData: boolean;
  notes: string[];
}

export type { FixtureDataModel, StandingsModel, StandingsDataStandingModel };