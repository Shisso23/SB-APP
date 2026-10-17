/**
 * Central configuration for the prediction engine.
 *
 * Every tunable value lives here so that no magic numbers are scattered through the
 * engine. All thresholds are intentionally conservative; the engine must never claim a
 * selection is guaranteed and must never treat a historical frequency as a calibrated
 * probability.
 */
export interface PredictionConfig {
  /** Number of recent matches used as the primary form window. */
  recentWindow: number;
  /** Number of league seasons fetched so recent form can reach its configured window. */
  historySeasons: number;
  /** Absolute minimum number of finished matches before a team is considered analysable. */
  minTeamMatches: number;
  /** Minimum venue-specific matches before we rely on the venue split alone. */
  minVenueMatches: number;
  /** Minimum head-to-head matches before H2H evidence is used. */
  minH2hMatches: number;
  /**
   * Blend weight for the venue-specific sample when it is large enough.
   * The remainder is taken from the overall (home+away) sample used as supplementary evidence.
   * 1 = venue only (when sample is sufficient), 0 = overall only.
   */
  venueWeightWhenSufficient: number;
  /** Blend weight for the venue-specific sample when it is too small (leans on overall form). */
  venueWeightWhenSmall: number;
  /** Recency weighting (Phase 2). */
  recency: {
    /** When false, all matches in the window carry equal weight. */
    enabled: boolean;
    /** Exponential decay factor per match into the past (0..1). 1 = no decay. */
    decayPerMatch: number;
    /**
     * Blend between the weighted mean and the plain median, so a single exceptional
     * result cannot dominate. 1 = fully recency weighted, 0 = fully median.
     */
    weightedMeanBlend: number;
  };
  /** Expected-goals model. */
  goals: {
    /** Weight on attack vs opponent defence when blending (attack + defence = 1). */
    attackWeight: number;
    defenceWeight: number;
    /** Shrinkage: fraction pulled toward the league/global mean for small samples. */
    shrinkage: number;
    /** Baseline average goals per team used when no benchmark is available. */
    fallbackGoalsPerTeam: number;
    /** Clamp for per-team expected goals. */
    maxExpectedGoals: number;
    /** Poisson grid size (max goals per team considered). */
    gridSize: number;
    /**
     * Dixon-Coles style low-score correction strength (rho). 0 disables the correction.
     * Positive values slightly raise 0-0/1-1 damping of 1-0/0-1.
     */
    lowScoreRho: number;
    /** Draw inflation applied to the 1X2 draw probability before normalisation. */
    drawInflation: number;
  };
  /** Opponent-strength classification (Phase 3). */
  opponentStrength: {
    /**
     * Bands expressed as a fraction of the league size (top fraction of the table),
     * so classification adapts to 10- vs 20-team leagues.
     */
    strongTopFraction: number;
    upperTopFraction: number;
    lowerBottomFraction: number;
    /** Minimum matches played by an opponent for its table row to be trusted. */
    minOpponentPlayed: number;
    /**
     * Applied to opponent classification when only current (not historical) standings
     * are available. Expressed on 0..1 where 1 = fully trust the classification.
     */
    currentStandingsConfidence: number;
  };
  /** Market probability thresholds and minimum edges (Phase 6 & 7). */
  selection: {
    /** Default minimum model probability for any selection to qualify. */
    defaultMinProbability: number;
    /** Default minimum estimated edge (model - market) as a probability. */
    defaultMinEdge: number;
    /** Per-market overrides keyed by market id. */
    perMarket: Record<string, { minProbability?: number; minEdge?: number }>;
    /** Minimum venue matches required to trust an upcoming fixture. */
    minVenueSample: number;
    /** Minimum number of over/under or result markets that must be computable. */
    minComputableMarkets: number;
    /** Maximum number of ranked selections returned. */
    maxSelections: number;
  };
  /** Odds freshness. */
  odds: {
    /** Odds older than this (minutes) are flagged as stale. */
    staleAfterMinutes: number;
  };
  /**
   * Goal-market model (validated on 1,140 real 2023 matches, see
   * docs/prediction-engine-goal-market-improvement.md).
   *
   * The generic engine's expected-goals estimate over-weights noisy short-window venue
   * form for goal totals and BTTS. Blending that form heavily toward a *per-league*
   * long-term average demonstrably improved held-out Brier skill for BTTS and totals,
   * while the original engine remained better for team-to-score markets. So this is a
   * per-market selector: `enabledMarkets` lists the markets that use the prior-blended
   * model; every other market keeps using the original engine estimate untouched.
   */
  goalModel: {
    /** Whether the prior-blended goal model is used for the markets listed below. */
    enabled: boolean;
    /**
     * Per-market weight on recent venue form (0..1). The remainder is the per-league
     * long-term prior. `btts` -> 0 (league rate only) and totals -> ~0.4 were validated.
     * A market not listed falls back to `defaultRecentWeight`.
     */
    recentFormWeight: Record<string, number>;
    defaultRecentWeight: number;
    /**
     * Per-league prior source. `league` uses the per-league average derived from the
     * standings/goals available; `global` uses a single fallback average.
     * Per-league was validated as better.
     */
    priorSource: 'league' | 'global';
  };
}

export const DEFAULT_PREDICTION_CONFIG: PredictionConfig = {
  recentWindow: 20,
  historySeasons: 3,
  minTeamMatches: 3,
  minVenueMatches: 3,
  minH2hMatches: 2,
  venueWeightWhenSufficient: 0.75,
  venueWeightWhenSmall: 0.4,
  recency: {
    enabled: true,
    decayPerMatch: 0.85,
    weightedMeanBlend: 0.85,
  },
  goals: {
    attackWeight: 0.6,
    defenceWeight: 0.4,
    shrinkage: 0.35,
    fallbackGoalsPerTeam: 1.35,
    maxExpectedGoals: 4.5,
    gridSize: 10,
    lowScoreRho: 0.03,
    drawInflation: 1.05,
  },
  opponentStrength: {
    strongTopFraction: 0.2,
    upperTopFraction: 0.3,
    lowerBottomFraction: 0.35,
    minOpponentPlayed: 3,
    currentStandingsConfidence: 0.5,
  },
  selection: {
    defaultMinProbability: 0.55,
    defaultMinEdge: 0.03,
    perMarket: {
      btts_yes: { minProbability: 0.58 },
      over_1_5: { minProbability: 0.72 },
      over_2_5: { minProbability: 0.58 },
      over_3_5: { minProbability: 0.42 },
      home_win: { minProbability: 0.5 },
      away_win: { minProbability: 0.48 },
      draw: { minProbability: 0.3 },
      home_over_0_5: { minProbability: 0.72 },
      away_over_0_5: { minProbability: 0.62 },
    },
    minVenueSample: 3,
    minComputableMarkets: 3,
    maxSelections: 8,
  },
  odds: {
    staleAfterMinutes: 720,
  },
  goalModel: {
    enabled: true,
    recentFormWeight: {
      btts_yes: 0,
      btts_no: 0,
      over_1_5: 0.4,
      under_1_5: 0.4,
      over_2_5: 0.4,
      under_2_5: 0.4,
      over_3_5: 0.4,
      under_3_5: 0.4,
    },
    defaultRecentWeight: 0.4,
    priorSource: 'league',
  },
};

/** Deep-merge a partial override into the default config. */
export const mergePredictionConfig = (
  overrides?: DeepPartial<PredictionConfig>,
  base: PredictionConfig = DEFAULT_PREDICTION_CONFIG
): PredictionConfig => {
  if (!overrides) {
    return base;
  }

  const merge = <T>(target: T, source: any): T => {
    if (source === undefined || source === null) {
      return target;
    }
    if (Array.isArray(source) || typeof source !== 'object') {
      return source as T;
    }
    const result: any = { ...(target as any) };
    Object.keys(source).forEach((key) => {
      result[key] = merge((target as any)?.[key], source[key]);
    });
    return result as T;
  };

  return merge(base, overrides);
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export default DEFAULT_PREDICTION_CONFIG;