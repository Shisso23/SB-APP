# Football Prediction Engine — Implementation Report

Date: 2026-10-17
Companion documents:
[`prediction-engine-investigation.md`](./prediction-engine-investigation.md),
[`prediction-engine-audit-and-evaluation.md`](./prediction-engine-audit-and-evaluation.md),
[`prediction-engine-goal-market-improvement.md`](./prediction-engine-goal-market-improvement.md)

> **CORRECTIONS (2026-10-17, independent audit).** The audit found and fixed four defects in the
> original implementation: (a) opponent-strength *confidence* was a no-op in the xG multiplier;
> (b) team averages were shrunk **twice** (over-regularisation); (c) 1X2 and BTTS/totals were derived
> from **different normalisers**, so they were not fully coherent; (d) the backtester leaked future
> standings into historical opponent strength. The claims below marked ~~struck through~~ are
> superseded — see the audit report for the corrected behaviour and real-data evaluation results.
> The low-score adjustment is an **approximation with a fixed constant**, **not** a fitted
> Dixon-Coles model.
>
> **LOOKBACK UPDATE:** after a chronological 2021–2025 Premier League evaluation, the Statistical
> model's default window is now **20 matches** and the fixture fetch depth is **3 seasons**. Validation
> selected 20 on 2024; untouched 2025 showed relative improvement over 5 matches, but goal markets
> still did not beat the base-rate baseline. Full results and early-season sample behavior are in
> `prediction-engine-goal-market-improvement.md` §6.

---

## 1. How the existing prediction engine worked

The pre-existing engine lived in `src/prediction-functions/*.ts` (one file per market) and was
wired into the UI through the flat `betOptions` array in `src/variables/variables.ts`.

- Each market was a **binary filter**: `currentFixtures.filter(fixture => <boolean>)` returning
  `{ fixtures, option }`. There was **no probability, confidence, or explanation** — only
  "qualifies / does not qualify".
- Shared primitives (`shared-functions.ts`) computed recency-weighted averages over the last 5
  **venue-specific** finished fixtures, a blended expected-goals helper, and a set of hard-coded
  threshold predicates (`teamMin1`, `teamMin2`, …).
- Standings were used only as a coarse `rank` difference, matched on `leagueId` **but not season**,
  and only the **current** table was ever fetched.
- **No odds**, no EV, no selection ranking, no tests, no backtesting.
- Data came from API-Football v3 through `src/services/**`; "storage" was `localStorage` caches.

A full trace (fixture → data retrieval → features → prediction → output) is in the investigation
report (§10).

## 2. What was changed and why

A new, self-contained, **pure** statistical engine was added under `src/prediction-engine/`. It does
not delete or alter any existing prediction function. The original options remain selectable; the new
`Model: …` options are appended.

| Goal | Change |
|------|--------|
| Probabilities instead of booleans | Poisson-based scoreline grid → coherent market probabilities (audit fixed a 1X2/BTTS normaliser mismatch) |
| Explainability | Every selection carries `evidence[]`; every rejection carries `rejectReasons[]`; `headline` summarises |
| Disciplined recent form | New form module with venue splits, sample sizes, recency weighting (configurable) + median blend, trend |
| Opponent strength | New module using correct league **and** season, league-size-adaptive bands, `unknown` when data is missing, hindsight-bias flag (confidence now actually applied — audit fix) |
| Matchup modelling | Attack-vs-defence blending, single shrinkage toward league baseline (audit removed double shrinkage), tight opponent-quality adjustment |
| Odds & EV | Implied probability, proportional margin removal, EV, break-even, staleness |
| Selection & ranking | Threshold **and** minimum-edge gate, EV ranking, correlation grouping, reliability score, quality gate that can abstain, rejection reasons |
| Validation | 66 unit tests, a chronological backtester with leakage guards, and a real-data (1,140 match) evaluation with baselines |
| Configuration | All thresholds in `src/config/prediction-config.ts` — no magic numbers in engine code |
| Integration | Model markets appended to `betOptions`; `EnginePredictionPanel` renders probabilities + evidence in the existing screen |

## 3. Files and modules added / modified

**Added**
- `src/config/prediction-config.ts` — central config (`DEFAULT_PREDICTION_CONFIG`, `mergePredictionConfig`).
- `src/prediction-engine/types.ts` — types incl. `DataQuality`, `MarketValue`, `FixturePrediction`.
- `src/prediction-engine/math-utils.ts` — clamping, mean/median, recency weights, trend, shrinkage.
- `src/prediction-engine/team-form.ts` — venue/overall collection, aggregation, blending.
- `src/prediction-engine/standings-lookup.ts` — season-exact standings resolution.
- `src/prediction-engine/opponent-strength.ts` — classification + opponent-adjusted form + evidence.
- `src/prediction-engine/poisson.ts` — Poisson PMF, xG estimation, Dixon-Coles-lite grid.
- `src/prediction-engine/odds.ts` — implied prob, margin removal, EV, break-even, staleness.
- `src/prediction-engine/markets.ts` — market probabilities, evidence, ranking, correlation grouping.
- `src/prediction-engine/selection.ts` — candidate filtering, reliability score, rejected candidates.
- `src/prediction-engine/predict-fixture.ts` — the pure per-fixture orchestrator.
- `src/prediction-engine/backtest.ts` — chronological backtest (Brier, log-loss, calibration).
- `src/prediction-engine/market-adapters.ts` — `createModelBetOption`, `predictFixturesWithEngine`.
- `src/prediction-engine/index.ts` — barrel export.
- `src/prediction-engine/__tests__/*.test.ts` — six test suites.
- `src/prediction-engine/test-support/fixture-builders.ts` — deterministic test data factory.
- `src/__tests__/prediction-engine-example.test.ts` + `test-support/prediction-engine-demo.data.ts` — runnable example.

**Modified**
- `src/variables/variables.ts` — added `modelBetOptions` and `allBetOptions` (existing `betOptions` untouched).
- `src/screens/BetAndFixturesScreen/BetAndFixturesScreen.tsx` — runs the engine in `handleBet`, stores
  `enginePredictions`, and renders the `EnginePredictionPanel` with probabilities, leading selection and warnings.

## 4. New features and their data requirements

| Feature | Data required | Available today? |
|---------|---------------|------------------|
| Venue-split recent form (scored/conceded %, BTTS %, O1.5/2.5/3.5 %, clean sheet %, W/D/L %, trend) | Finished fixtures for both teams | ✅ |
| Recency weighting (configurable) + median blend | Same | ✅ |
| Opponent-strength classification (strong/upper/mid/lower/unknown) | Standings for correct league **+ season** | ✅ (current-season only → hindsight flagged) |
| Attack-vs-defence xG + Poisson market probabilities | Fixtures + optional standings baseline | ✅ |
| Odds implied prob, margin removal, EV, break-even, staleness | Bookmaker odds feed | ❌ **No odds source exists** |
| Selection gate (probability + min edge) & EV ranking | Odds for the edge part | ⚠️ EV needs odds; probability gate works today |
| Backtesting (Brier/log-loss/calibration) | Sufficient finished-fixture history | ⚠️ works, but the current UI only fetches a short window |

## 5. Limitations caused by missing data

1. **No bookmaker odds.** The codebase has no odds service, model field or UI element. Phase 6 (EV)
   is implemented and fully tested at the unit level, but in the product a selection is labelled
   *"No bookmaker odds available, so no verified betting value can be assessed."* No paid API was
   added (per the constraints). Wiring a feed only requires passing `odds?: MarketOdds[]` into
   `predictFixture`.
2. **Current-season standings only.** Opponent classification for historical matches carries
   hindsight bias; the engine **flags this** via `dataQuality.opponentStrengthHindsightBias` and
   reduces classification confidence rather than pretending the table is historical.
3. **No historical odds store** ⇒ ROI and closing-line value cannot be computed; only accuracy,
   Brier and log-loss are reported.
4. **Short fetch window** in the UI ⇒ backtests over the UI cache are not meaningful; the backtester
   is correct but needs a larger fixture history to be conclusive.

## 6. Tests executed and results

Command: `npx tsc --noEmit` → **exit 0** (no type errors).

Command: `CI=true npx react-scripts test --watchAll=false`

```
Test Suites: 7 passed (prediction engine) + 1 pre-existing failure (App.test.js)
Tests:       50 passed, 50 total
```

Engine suites (all pass):
- `team-form.test.ts` — venue split, percentages, sample sizes, blending, trend, outlier damping.
- `opponent-strength.test.ts` — strong/mid/lower, small-league adaptation, missing standings → `unknown`,
  too-few-games → `unknown`, hindsight confidence, wrong-season rejection.
- `poisson.test.ts` — PMF validity, 1X2/BTTS/totals coherence, ordering, team-scoring consistency, xG direction.
- `odds.test.ts` — implied prob, EV, break-even, margin removal, dual gate, tiny-edge rejection, staleness, no-odds labelling.
- `predict-fixture.test.ts` — end-to-end coherence, all markets in [0,1], no-leakage (only pre-kickoff matches),
  home/away splits, odds ranking by EV, graceful degradation with no data, config merge, candidate filtering.
- `backtest.test.ts` — Brier/log-loss correctness, calibration buckets, chronological split, insufficient-data honesty.

**Pre-existing failure (not caused by these changes):** `src/App.test.js` (CRA boilerplate) fails with
`react-modal: No elements were found for selector #root`. Verified by stashing my edits and re-running:
it fails identically on the untouched tree, because it renders the full app without a `#root` node.

## 7. Backtesting results

> **SUPERSEDED by the audit report.** The numbers originally shown here came from a synthetic demo
> (`sufficientData: false`). A **real-data** evaluation on 1,140 actual 2023 matches (Premier League,
> La Liga, Serie A) is now available and reports Brier skill vs a base-rate baseline per market — see
> [`prediction-engine-audit-and-evaluation.md`](./prediction-engine-audit-and-evaluation.md) §5.

A backtester with strict train/test separation is implemented and unit-tested for correctness.
It evaluates accuracy, Brier score, log-loss and calibration buckets per market, only uses
matches strictly before each kickoff, and (after the audit) disables standings-based opponent
strength unless genuinely period-correct snapshots are supplied.

**No profitability claim is made or possible:** the repository ships no historical odds, so ROI and
closing-line value cannot be computed. Synthetic demo output (mechanics only, **not** real
performance) is omitted here in favour of the real-data table in the audit report.

## 8. How to run the improved engine

- **In the app:** run predictions as before; the new `Model: …` options are appended to the option bar,
  and every predicted fixture now shows a *Statistical model* panel (xG, key market probabilities,
  leading selection with evidence, and data-quality warnings).
- **Type-check:** `npx tsc --noEmit`
- **Tests:** `CI=true npx react-scripts test --watchAll=false --testPathPattern="prediction-engine"`
- **Runnable example (prints a full prediction, ranked candidates and a backtest):**
  `CI=true npx react-scripts test --watchAll=false --testPathPattern="prediction-engine-example"`
- **In your own code:**
  ```ts
  import { predictFixture, predictFixturesWithEngine } from './prediction-engine';
  const prediction = predictFixture({ fixture, allFixtures, leaguesStandings, odds, standingsAreCurrent: false });
  ```

## 9. Example prediction from the runnable demo (data timestamp & odds clearly identified)

Output of the example test (synthetic dataset, kickoff `2023-10-01`, illustrative odds with timestamp
`2023-10-01`; **not real fixture data and not real market prices**):

```
Alpha FC vs Beta United: model xG 0.75–0.93, most likely scoreline 0-0 (18%).
1X2: 28% / 34% / 38%. Leading selection: Under 2.5 goals — model probability 76% at 1.80,
estimated edge 23.1%.
```

Interpretation, stated honestly: the demo dataset has an artificially low scoring rate, so the model
leans under. This demonstrates the mechanics (xG → grid → probabilities → odds edges → ranked
selection), **not** a claim about real matches or about profitability. The selection passed both the
configured probability threshold and the minimum-edge gate *given the illustrative odds supplied*;
with real odds absent, the product labels it as having no verified betting value.

## 10. Design notes / guardrails honoured

- Never presents a selection as guaranteed; `qualifies` only means "passed configured thresholds".
- Always distinguishes **observed frequency** ("scored in 4/5") from **calibrated probability**.
- Opponent strength **adjusts** (tight 0.9–1.1 band), never mechanically determines, the prediction.
- Home/away records are never mixed indiscriminately: venue splits are primary, overall form is an
  explicitly labelled supplementary blend when the venue sample is small.
- Sample sizes are surfaced everywhere; the current 20-match default is still a finite sample and is
  not implied to be conclusive. Early-season low samples warn or abstain below three prior matches.
- Standings are matched by league **and season**; mismatches yield `unknown`, and current-table usage
  sets a hindsight-bias flag.
- All thresholds live in `src/config/prediction-config.ts`.
- Development constraints respected: existing functionality preserved, no paid APIs added, no code
  committed on the user's behalf.