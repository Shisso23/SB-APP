# Football Prediction Engine — Independent Audit & Real-Data Evaluation

Date: 2026-10-17
Auditor: source-level review + real-data evaluation (no reliance on prior reports)
Companion docs: [`prediction-engine-investigation.md`](./prediction-engine-investigation.md),
[`prediction-engine-implementation-report.md`](./prediction-engine-implementation-report.md)

---

## Executive summary

The engine is **real, compiled, tested and integrated**, and it produces **internally coherent**
probabilities. However, the original implementation report overstated two things, and the
independent audit found **four genuine defects**, all now fixed:

| # | Defect | Severity | Status |
|---|--------|----------|--------|
| 1 | `opponentQualityMultiplier` multiplied the tilt by `(1 + (1 - confidence) * 0)` → opponent-strength **confidence had zero effect**; `confidenceAverage` was dead code. Docs claimed confidence adjusted the multiplier. | Medium | **Fixed** |
| 2 | Team averages were shrunk toward the baseline in `aggregateTeamForm` **and again** in `estimateExpectedGoals` → **double shrinkage**, over-regularising small samples. | Medium | **Fixed** |
| 3 | 1X2 probabilities were rescaled by a *separate* factor (`drawInflation` then renormalise) than the grid used for BTTS/totals → the families were **not** derived from one distribution as documented. | Medium | **Fixed** |
| 4 | Backtester passed the **current** standings for historical fixtures with `standingsAreCurrent: true` → **future information leaked** into opponent strength. | High | **Fixed** (standings disabled by default in backtests) |

On **real data (1,140 completed matches, 3 leagues, 2023)** the engine **beats a base-rate baseline
on 1X2 markets** but is **approximately neutral-to-worse on BTTS and total-goals markets**. There is
**no odds feed**, so **no profitability claim is possible or made**.

---

## 1. Source-based audit (file and function references)

| Area | Function | Assessment |
|------|----------|------------|
| Recency weighting | `math-utils.ts::recencyWeights`, `weightedAverage` | Correct exponential decay; median blend damps outliers. Verified numerically (single 9-goal outlier cannot dominate). |
| Venue/overall blend | `team-form.ts::blendVenueAndOverall` | Correct weighted blend; venue filter applied **before** the window slice (fixed in the prior session). |
| Season handling | `team-form.ts::collectTeamMatches` | Falls back to all-time when the season sample is small → **mixes seasons**, surfaced only via sample sizes. Documented limitation, not silently hidden. |
| Opponent strength | `opponent-strength.ts::classifyOpponentStrength` | Seasons enforced exactly; `unknown` for missing/short samples — good. **Confidence was previously a no-op (Defect 1).** |
| Expected goals | `poisson.ts::estimateExpectedGoals` | Sound attack/defence ratio form; **double shrinkage (Defect 2)** removed. |
| Scoreline grid | `poisson.ts::buildPoissonGrid` | Normalises the full grid; **1X2 was on a separate normaliser (Defect 3)** now unified. |
| Dixon-Coles-lite | `poisson.ts::buildPoissonGrid` | See §2 — **approximation, not a fitted DC model**. Now documented as such. |
| Odds/EV | `odds.ts::buildMarketValue`, `computeMarginAdjustedOverUnder` | Correct `1/odds`, proportional margin removal, `EV = p·odds − 1`, staleness gate. Verified by unit tests. |
| Ranking | `markets.ts::rankSelections` | EV-first ordering; now accepts a **quality gate** so it can abstain (previously reliability was ignored in the UI-facing path). |
| Reliability | `selection.ts::reliabilityScore` | 0…1 score; **does not use H2H sample size**; only used by `buildCandidateSelections`, and now also via the quality gate. |
| Backtest | `backtest.ts::runBacktest` | Chronological split + per-fixture leakage guard; **standings leak (Defect 4)** fixed; base-rate baseline now added. |

## 2. What the "Dixon-Coles-lite" actually implements

`buildPoissonGrid` multiplies the independent-Poisson scoreline probability by the classic
Dixon-Coles **τ (tau)** correction for the four low-score cells:

```
(0,0): × (1 − λμρ)      (0,1): × (1 + λρ)
(1,0): × (1 + μρ)       (1,1): × (1 − ρ)
```

The **functional form matches** the published Dixon-Coles correction, and the grid is normalised
afterwards. However:

- **`rho` is a fixed configured constant** (`config.goals.lowScoreRho`, default `0.03`). It is **not
  estimated** by maximum likelihood from data, and it is **not validated**.
- The canonical model jointly estimates attack/defence/`rho` with a time-decay weighting; here only
  the tau tilt is borrowed.

**Conclusion:** this is **"Poisson with a fixed low-score tilt (Dixon-Coles-style)"**, *not* a fitted
Dixon-Coles model. The module docstring has been corrected to say exactly this. It must not be
described as a validated Dixon-Coles model.

## 3. Tested statistical properties

- Grid sums to 1; `homeWin + draw + awayWin = 1`, `bttsYes + bttsNo = 1`, `over + under = 1` for all
  thresholds (tolerance 1e-3). See `audit-fixes.test.ts`.
- BTTS is bounded between `max(0, P(home scores)+P(away scores)−1)` and `min(P(home), P(away))` —
  true only when derived from one coherent grid, which now holds.
- `opponentQualityMultiplier` is exactly `1` when confidence is unknown, and moves monotonically with
  confidence when known (regression test).
- `estimateExpectedGoals` no longer double-shrinks (regression test).
- Backtest leakage guard: predictions only ever see matches **strictly before** kickoff.

## 4. Integration status

**Integrated and working** (verified in source, not taken from the report):

- `BetAndFixturesScreen.tsx` calls `predictFixturesWithEngine(...)` inside `handleBet` (line ~981) and
  stores results in `enginePredictions` (line ~512).
- `EnginePredictionPanel` (line ~412) renders the headline, xG, key market probabilities, leading
  selection with evidence, and data-quality warnings for each fixture (line ~1467).
- The **old boolean functions still run** via `runPredict`; the new engine **runs independently and
  does not change the old recommendations**. `modelBetOptions`/`allBetOptions` exist in
  `variables.ts` but the screen still uses `betOptions` for the option bar.
- The engine receives **no odds** (none exist in the app) → every market reports `qualifies: false`
  with the reason *"No bookmaker odds available, so no verified betting value can be assessed."* The
  UI shows model probabilities regardless.
- **Robustness:** the engine call is now wrapped in `try/catch` in `handleBet`, so a malformed fixture
  cannot break the existing bet flow. Missing standings/fixtures degrade gracefully (verified: a
  fixture with zero history still returns a coherent 1X2 and `selections: []`).

**Can it predict real upcoming fixtures?** Yes — the app already fetches fixtures in the date window
and current standings; the engine consumes exactly those. It cannot compute *value* (no odds) and its
opponent-strength feature is hindsight-flagged when only the current table is available.

## 5. Real-data evaluation

### Data
- Source: **API-Football v3** via the app's own endpoint shape, captured into `eval-data/`:
  `league=39 (Premier League)`, `140 (La Liga)`, `135 (Serie A)`, `season=2023`.
- **1,140 completed matches** (380 per league, all `FT` with goals). Date range 2023-08 → 2024-05.
- Standings: only the current/final table exists → **disabled** in the backtest (no snapshots).

### Method
- Chronological 60/40 train/test split per league; only pre-kickoff matches visible (leakage guard).
- Baseline = the **training-window base rate** of each market applied to the test window.
- Metric: **Brier skill score** = `1 − Brier_model / Brier_baseline` (>0 beats the baseline).

### Results (combined, test window n=456 per market)

| Market | Accuracy | Brier | Baseline Brier | Brier skill | Log loss | Baseline LL |
|--------|----------|-------|----------------|-------------|----------|-------------|
| home_win | 0.653 | 0.2194 | 0.2446 | **+0.103** | 0.6286 | 0.6823 |
| draw | 0.730 | 0.1952 | 0.1971 | +0.010 | 0.5786 | 0.5832 |
| away_win | 0.702 | 0.1956 | 0.2150 | **+0.091** | 0.5748 | 0.6217 |
| btts_yes | 0.542 | 0.2519 | 0.2483 | **−0.015** | 0.6976 | 0.6897 |
| over_1_5 | 0.785 | 0.1726 | 0.1691 | **−0.021** | 0.5272 | 0.5214 |
| over_2_5 | 0.570 | 0.2465 | 0.2488 | +0.009 | 0.6863 | 0.6907 |
| over_3_5 | 0.660 | 0.2296 | 0.2288 | −0.003 | 0.6572 | 0.6506 |
| home_over_0_5 | 0.781 | 0.1629 | 0.1700 | +0.042 | 0.5023 | 0.5232 |
| away_over_0_5 | 0.706 | 0.2041 | 0.2085 | +0.021 | 0.5974 | 0.6076 |

Per-league (home_win / btts_yes / over_2_5 skill):
- Premier League: home_win **+0.123**, btts_yes −0.019, over_2_5 −0.033
- La Liga: home_win **+0.084**, btts_yes −0.047, over_2_5 −0.057
- Serie A: home_win **+0.103**, btts_yes −0.016, over_2_5 +0.030

**Honest interpretation**
- The model **adds real value for 1X2** (skill ≈ +0.09…+0.12) because it exploits team strength.
- For **BTTS and total-goals** the model is **statistically indistinguishable from, or slightly worse
  than, predicting the league base rate**. The venue/attack/defence signal does not improve those
  markets on this dataset.
- **No odds** exist, so ROI / closing-line value / profitability are **not** evaluated and **must not
  be claimed**.

### Reproduce
```bash
# data already captured under eval-data/ (league 39/140/135, season 2023)
CI=true npx react-scripts test --watchAll=false --testPathPattern="real-data-evaluation"
```
The test prints the full table above and asserts metric validity (not profitability).

## 6. Selection policy evaluation

Verified by `selection-policy.test.ts` (9 scenarios):

| Scenario | Behaviour |
|----------|-----------|
| High probability, poor odds | Probability gate passes, **edge gate fails** → rejected. EV computed and negative (e.g. 0.8 @ 1.05 ⇒ EV −0.16). |
| Positive EV, weak data | **Quality gate abstains** — no recommendation despite attractive odds. |
| Current standings as proxy | `opponentStrengthHindsightBias = true` is set and surfaced. |
| Correlated selections | Grouped by family (`1X2`, `BTTS`, `total-goals`, …) so they are not treated as independent. |
| Insufficient samples | `rankSelections` quality gate + `buildCandidateSelections` fixture gate both abstain. |
| Configurable thresholds | Raised `minEdge` / `minProbability` observed to change outcomes; overrides merge without losing defaults. |
| Can it abstain? | Yes — with no odds or weak data, `selections` is empty and reasons are returned. |

## 7. Changes made (this audit)

| File | Change |
|------|--------|
| `src/prediction-engine/opponent-strength.ts` | **Defect 1**: `opponentQualityMultiplier` now scales the tilt by real classification confidence; returns exactly 1 when confidence is unknown. Removed dead `(…)*0` term. |
| `src/prediction-engine/poisson.ts` | **Defect 2**: removed the second sample-shrink of lambdas (`shrinkageApplied` now 0). **Defect 3**: draw tilt folded *into* the grid so all families share one normaliser. Corrected the Dixon-Coles docstring to describe it as an approximation with a fixed constant. |
| `src/prediction-engine/markets.ts` | Added `SelectionQualityGate`; `rankSelections` and `buildMarkets` now accept it so the **content shown in the UI can abstain** on weak samples. |
| `src/prediction-engine/predict-fixture.ts` | Passes the sample-size quality gate into `buildMarkets`. |
| `src/prediction-engine/backtest.ts` | **Defect 4**: `standingsArePointInTime` option (default `false`) disables standings-based opponent strength during backtests; added a limitation note; added **base-rate baseline** (`baselineProbability`, `baselineBrierScore`, `baselineLogLoss`, `brierSkillScore`). |
| `src/prediction-engine/types.ts` | Extended `BacktestMarketResult` with baseline + skill fields. |
| `src/prediction-engine/test-support/real-data.ts` | New: API-Football JSON → engine model loader, plus base-rate computation. |
| `src/screens/BetAndFixturesScreen/BetAndFixturesScreen.tsx` | Wrapped the engine call in `try/catch` so engine failure cannot break the bet flow. |
| `src/prediction-engine/__tests__/audit-fixes.test.ts` | New: regression tests for defects 1–3. |
| `src/prediction-engine/__tests__/selection-policy.test.ts` | New: 9 selection-policy scenarios. |
| `src/prediction-engine/__tests__/real-data-evaluation.test.ts` | New: reproducible real-data evaluation with baselines. |
| `eval-data/*.json` | Real API-Football 2023 fixtures for 3 leagues (data provenance documented in the test). |

## 8. Tests run

```
npx tsc --noEmit                                              -> exit 0 (clean)
CI=true npx react-scripts test --watchAll=false --testPathPattern="prediction-engine"
  Test Suites: 10 passed, 10 total
  Tests:       66 passed, 66 total
```
(Pre-existing, unrelated: `src/App.test.js` fails because the CRA boilerplate renders the app without
a `#root` element — present before any of these changes.)

## 9. Readiness statement

**Ready for experimental use** for **1X2 / double-chance** markets, where the model demonstrably beats
a base-rate baseline on 1,140 real matches, and for **displaying transparent model probabilities** in
the app.

**Not validated / not ready for:**
- **BTTS and total-goals-based betting** — no measured edge over the base rate on real data.
- **Any value/EV or profitability claim** — no odds feed exists; the EV machinery is correct but its
  *inputs* are absent.
- **Opponent-strength-adjusted historical evaluation** — API-Football has no period-correct standings,
  so that feature is disabled in backtests (hindsight-free) but therefore also **unmeasured**.
- **Fitted Dixon-Coles** — the low-score tilt uses a fixed constant, unvalidated.

### What remains unvalidated
1. Whether recency weighting improves accuracy (config exists; not yet A/B tested on real data — a
   straightforward next step is a weighted-vs-unweighted backtest, now possible with `eval-data/`).
2. Calibration quality per bucket (reported but not yet tuned).
3. Any effect of the opponent-strength feature, since it cannot be evaluated without historical tables.