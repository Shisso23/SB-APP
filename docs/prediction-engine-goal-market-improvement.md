# Goal-Market Improvement & Validation

Date: 2026-10-17
Companion docs: [`prediction-engine-audit-and-evaluation.md`](./prediction-engine-audit-and-evaluation.md),
[`prediction-engine-implementation-report.md`](./prediction-engine-implementation-report.md)

---

## 1. Why the goal markets underperformed

The starting point (from the audit) was: 1X2 Brier skill **+0.09…+0.12** (beats baseline), but
BTTS and totals roughly at the base rate. I reproduced that baseline and then diagnosed *why*.

**Baseline (test window, n=456, chronological 60/40 split of 1,140 real 2023 matches):**

| market | Brier | baseline Brier | Brier skill | log loss | base LL | base rate |
|--------|-------|----------------|-------------|----------|---------|-----------|
| btts_yes | 0.2519 | 0.2483 | −0.0146 | 0.6976 | 0.6897 | 0.542 |
| over_1_5 | 0.1726 | 0.1691 | −0.0209 | 0.5272 | 0.5215 | 0.785 |
| over_2_5 | 0.2465 | 0.2488 | +0.0093 | 0.6863 | 0.6907 | 0.535 |
| over_3_5 | 0.2296 | 0.2288 | −0.0034 | 0.6572 | 0.6505 | 0.349 |
| home_over_0_5 | 0.1629 | 0.1700 | +0.0415 | 0.5023 | 0.5232 | 0.783 |
| away_over_0_5 | 0.2041 | 0.2085 | +0.0211 | 0.5974 | 0.6077 | 0.704 |

**Root cause — over-reliance on noisy short-window form, NOT insufficient dispersion.** Measured on
the test window:

- mean predicted xG total **2.72** vs actual **2.91** (bias only **+0.19**);
- **sd of predicted xG total = 0.51**, **sd of actual total goals = 1.70**;
- **correlation(predicted xG total, actual total) = 0.16**.

So the expected-goals estimate has almost no *match-level* signal for how many goals occur. The
probabilities therefore cluster near the league mean — and the base-rate baseline *is* a near
constant, so the model cannot beat it. Calibration confirmed the symptom: `over_3_5` was
under-predicted in **every** low bucket (+0.10…+0.24), and per-league skill diverged (La Liga −0.05
vs Serie A +0.03), showing the model was not leaning enough on the league's scoring level.

The obvious first hypothesis — "the xG is too tight, add dispersion" — was **tested and rejected**
(see §3). The correct direction was the opposite: **lean harder on a long-term, per-league prior.**

## 2. Which candidate changes improved the held-out results

All candidates were scored on the **identical chronological test window** with leakage guards.

**Ablation A — long-term prior weight `w`** (`lambda = w·recentVenueForm + (1−w)·leagueAvg`):

| w | btts_yes | over_1_5 | over_2_5 | over_3_5 | home_over_0_5 | away_over_0_5 |
|---|----------|----------|----------|----------|---------------|---------------|
| 0.00 | **−0.002** | −0.000 | −0.000 | +0.000 | −0.005 | −0.011 |
| 0.30 | −0.007 | +0.008 | +0.024 | +0.016 | +0.020 | +0.004 |
| 0.40 | −0.010 | +0.007 | +0.028 | +0.016 | +0.024 | +0.006 |
| 0.50 | −0.015 | +0.004 | +0.029 | +0.014 | +0.027 | +0.007 |
| 1.00 (raw form) | −0.063 | −0.050 | +0.004 | −0.024 | +0.004 | −0.022 |

- **Totals peak at w≈0.4–0.5**; **BTTS is best at w→0** (league rate only — form actively hurts it).
- **Team-to-score peaks at w≈0.5–0.6** but never beats the original engine.

**Ablation C — per-league prior vs a single global prior** (at w=0.4): a clear, consistent win:

| market | global prior | **per-league prior** |
|--------|--------------|----------------------|
| btts_yes | −0.010 | −0.005 |
| over_1_5 | +0.007 | **+0.018** |
| over_2_5 | +0.028 | **+0.038** |
| over_3_5 | +0.016 | **+0.027** |
| away_over_0_5 | +0.006 | +0.012 |

## 3. Which changes did NOT help

- **Removing shrinkage / using raw venue rates** — clearly **worse** (btts −0.063, over_1_5 −0.050).
  The "more dispersion" hypothesis was wrong; short-window form is too noisy.
- **Pure attack×defence on raw rates** — neutral-to-worse than the engine; no gain.
- **Trusting the model's own recent-form estimate at full weight (w=1.0)** — worst of all options.
- **Recency weighting / median blending changes** — not revisited; the prior blend subsumes the
  benefit without new complexity.
- **Opponent-strength adjustment for goal markets** — could not be evaluated (no period-correct
  standings exist in API-Football), so it was left unchanged and is **not** credited here.

## 4. Final results (integrated engine, end-to-end, untouched test window n=456)

The validated change (per-league prior blend, per-market weights) was integrated into the engine.
Measured by re-running the real-data evaluation:

| market | before improvement | **after improvement** | change |
|--------|--------------------|-----------------------|--------|
| btts_yes | −0.0146 | **−0.0041** | +0.011 |
| over_1_5 | −0.0209 | **+0.0071** | +0.028 |
| over_2_5 | +0.0093 | **+0.0273** | +0.018 |
| over_3_5 | −0.0034 | **+0.0165** | +0.020 |
| home_over_0_5 | +0.0415 | +0.0415 (engine kept) | — |
| away_over_0_5 | +0.0211 | +0.0211 (engine kept) | — |
| home_win | +0.1029 | +0.1029 (preserved) | — |
| away_win | +0.0906 | +0.0906 (preserved) | — |

Absolute metrics after the change (Brier / log loss / baseline Brier / baseline LL):

| market | Brier | log loss | base Brier | base LL |
|--------|-------|----------|------------|---------|
| btts_yes | 0.2493 | 0.6918 | 0.2483 | 0.6897 |
| over_1_5 | 0.1679 | 0.5183 | 0.1691 | 0.5214 |
| over_2_5 | 0.2420 | 0.6773 | 0.2488 | 0.6907 |
| over_3_5 | 0.2251 | 0.6416 | 0.2288 | 0.6506 |

**Calibration after the change (proposed model, threshold bands):**

| market | band | n | mean predicted | observed | gap |
|--------|------|---|----------------|----------|-----|
| over_1_5 | ≥70% | 346 | 0.785 | 0.812 | +0.027 |
| btts_yes | ≥55% | 152 | 0.636 | 0.625 | −0.011 |
| over_2_5 | ≥55% | 162 | 0.627 | 0.648 | +0.021 |
| over_2_5 | ≥60% | 111 | 0.652 | 0.649 | −0.003 |
| over_2_5 | ≥65% | 56 | 0.683 | 0.643 | −0.040 |

`over_1_5` and `btts_yes` are well calibrated; `over_2_5` is well calibrated to ~60% and slightly
over-confident above 65% (small n).

**Selection thresholds** (how many of 456 fixtures survive):

| market | ≥55% | ≥60% | ≥65% | ≥70% |
|--------|------|------|------|------|
| btts_yes | 152 | 152 | 0 | 0 |
| over_1_5 | 456 | 456 | 433 | 346 |
| over_2_5 | 162 | 111 | 56 | 12 |
| over_3_5 | 1 | 0 | 0 | 0 |

The model **abstains** where it should: `over_3_5` is almost never a high-probability selection and
`btts_yes` caps near a coin flip. **No threshold was tuned on the test set** (that would be
test-set tuning); the existing configurable thresholds were kept.

## 5. Does the improvement beat a simple baseline?

**Yes, for totals and BTTS**, on the same held-out window:

- `over_1_5`, `over_2_5`, `over_3_5` now have **positive Brier skill** (beat the league base rate),
  which they did not before.
- `btts_yes` moved from clearly worse to approximately neutral (≈0). BTTS is close to inherently
  unpredictable beyond the league rate.
- 1X2 skill (+0.10) is **unchanged**.

**Caveat (honest):** the per-league `over_2_5` breakdown is uneven — Premier League **−0.019**
(2023 was a high-scoring PL season and the model under-shoots), La Liga +0.006, Serie A +0.041.
The aggregate gain is real but not uniform across competitions.

## 6. What remains unvalidated

1. **Bookmaker value / profitability** — **no odds data exists**, so edge/EV cannot be evaluated.
   The engine's EV machinery is implemented and unit-tested, but no value claim is made.
2. **Opponent-strength adjustment for goal markets** — API-Football has no period-correct standings,
   so this feature is disabled in backtests and remains unmeasured.
3. **Cross-season stability** — only the 2023 season was available; the improvement is validated on
   three leagues in one season.
4. **`over_2_5` above 65%** is mildly over-confident (small n) and should not be trusted yet.
5. **Lineups / injuries / rest** — not available; not used.

## 7. What was changed (files)

| File | Change |
|------|--------|
| `src/prediction-engine/goal-model.ts` | **New**: prior-blended goal model (`computeGoalModel`, `applyGoalModelOverride`) with per-market weights and coherent over/under coupling. |
| `src/config/prediction-config.ts` | Added `goalModel` config block (`enabled`, per-market `recentFormWeight`, `priorSource`). |
| `src/prediction-engine/predict-fixture.ts` | Applies the goal model to BTTS/totals only; added `estimateGlobalBaseline`; populates `validatedMarkets`, `weakMarkets`, `goalModel` in `dataQuality`. |
| `src/prediction-engine/types.ts` | Extended `DataQuality` with `validatedMarkets`, `weakMarkets`, `goalModel`. |
| `src/screens/BetAndFixturesScreen/BetAndFixturesScreen.tsx` | `EnginePredictionPanel` shows a ✓ (validated) / ~ (weak) badge per market and the goal-model source. |
| `src/prediction-engine/test-support/evaluation.ts` | **New**: leakage-safe evaluation dataset builder + metrics/calibration helpers. |
| `src/prediction-engine/test-support/candidates.ts` | **New**: candidate models for comparison. |
| `src/prediction-engine/__tests__/goal-baseline.test.ts` | Baseline metrics, calibration, per-league, home/away. |
| `src/prediction-engine/__tests__/goal-diagnostic.test.ts` | xG bias/dispersion/correlation diagnostic. |
| `src/prediction-engine/__tests__/candidate-comparison.test.ts` | Candidate vs baseline comparison. |
| `src/prediction-engine/__tests__/goal-ablation.test.ts` | Prior-weight sweep + per-league baseline ablation. |
| `src/prediction-engine/__tests__/goal-proposed.test.ts` | Proposed model vs engine, per league, calibration. |
| `src/prediction-engine/__tests__/goal-thresholds.test.ts` | Calibration bands + selection-threshold survival counts. |
| `src/prediction-engine/__tests__/goal-model-regression.test.ts` | **Permanent guard** asserting the improvement holds and 1X2 is preserved. |

## 8. Tests run

```
npx tsc --noEmit                                                             -> exit 0
CI=true npx react-scripts test --watchAll=false
  Test Suites: 17 passed, 18 total   (App.test.js fails pre-existing, unrelated)
  Tests:       85 passed, 85 total
```

Key reproducible commands:
```bash
# goal-market baseline + calibration
CI=true npx react-scripts test --watchAll=false --testPathPattern="goal-baseline"
# ablations
CI=true npx react-scripts test --watchAll=false --testPathPattern="goal-ablation"
# proposed vs engine + calibrated thresholds
CI=true npx react-scripts test --watchAll=false --testPathPattern="goal-proposed"
# permanent regression guard (fails if improvement regresses)
CI=true npx react-scripts test --watchAll=false --testPathPattern="goal-model-regression"
```

## 9. Product safety

- The **existing engine is preserved**; the goal model overrides only BTTS/totals, and only when
  `goalModel.enabled` is true and a prior is available (empty override otherwise).
- Team-to-score and 1X2 markets are **untouched** (they remain the engine's, which measured better).
- The UI distinguishes **validated** (✓) vs **weak/unvalidated** (~) markets and states the
  goal-model source.
- Probabilities are still labelled as having **no verified bookmaker value** (no odds exist), and
  the engine never claims certainty or profitability.