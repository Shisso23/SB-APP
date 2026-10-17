# Football Prediction Engine — Investigation Report

Date: 2026-10-17
Workspace: `SB-APP` (BetSmart Prediction Desk)

## 1. Application architecture

- **Type**: Client-side React SPA (Create React App, `react-scripts` 5).
- **Language**: TypeScript (files in `src/**`), with a couple of legacy `.js` files.
- **State**: Redux + `redux-promise` (`src/redux/store.ts`, `src/reducers/**`) — used mainly for
  leagues/fixtures/teams slices.
- **Routing**: `src/navigation/root.router.tsx` (react-router-dom v6).
- **UI**: MUI + TailwindCSS; main screen `src/screens/BetAndFixturesScreen/BetAndFixturesScreen.tsx`.
- **Data provider**: API-Football v3 via `https://v3.football.api-sports.io/` (`src/config.ts`,
  hard-coded `xApiSportsKey`). Services live in `src/services/**` and go through
  `src/services/auth-network-service/auth-network.service.ts` (axios wrapper).
- **No backend / no database.** There is no server, scheduler, cron, or persistence layer.
  All "storage" is browser `localStorage` caches inside `BetAndFixturesScreen.tsx`.

## 2. Data retrieval, storage, caching, refresh

| Data | Service | Params | Cache |
|------|---------|--------|-------|
| Fixtures | `services/fixtures` (`getFixturesByDate`, `getFixturesBetweenTwoDates`, `getFilteredFixtures`, `getH2hFixtures`) | date / from-to / team / league / season / last / next | `leaguePredictions_v1` (6 h TTL) and in-memory state |
| Standings | `services/standings` (`getStandingsByLeagueId`, `getStandingsByTeamId`) | league + season | `standingsCache_v1` (6 h) |
| Leagues | `reducers/leagues` action `geFilteredLeaguesAction` | season/type | `leaguesCache_v1` (7 days) |
| Odds | — | — | **not retrieved at all** |

- Prediction flow (`handleBet` in the screen):
  1. Read `PREDICTIONS_CACHE_KEY` and split selected leagues into cache **hits**/**misses**.
  2. For misses, fetch fixtures per league/season (`getLeaguesSeasonsFixtures`, `numberOfSeasonsBack`).
  3. `ensureStandingsFor(...)` fetches standings for each selected league (current season).
  4. `runPredict(...)` calls every selected `betOptionModel.predict({ currentFixtures, allFixtures, leaguesStandings })`.
  5. Results cached and merged into `predictedFixtures` / `groupedData`.

## 3. Existing prediction engine

- Location: `src/prediction-functions/*.ts` (one file per market), dispatched from
  `src/variables/variables.ts` (`betOptions` array) and `src/prediction-functions/index.ts`.
- **Shared primitives** in `src/prediction-functions/shared-functions.ts`, notably:
  - `sortedFinishedFixtures` (only `FT`), `getLastFive*`, `getH2HFixtures`, `getAllHomeTeamHomeFixtures`,
    `getAllAwayTeamAwayFixtures`.
  - `averageGoalsScoredAtHome/ConcededAtHome/ScoredAway/ConcededAway` → `averageFromFixtures`
    → `recencyWeightedAverage` (linear recency weights × 0.8 + median × 0.2, clamped 0..5).
  - A **blended expected-goals** helper `expectedGoalsForTeamA`:
    `0.9*(0.68*scored + 0.37*conceded) + 0.1*sqrt(scored*conceded) - 0.05*|scored-conceded|`.
  - **Threshold predicates** built on that xG: `teamMin0/1/2/3/4`, `teamMax0/1/2/3/4` (hard-coded cutoffs
    0.4 / 1.4 / 2.3 / 3.2 / 4.3 etc.).
  - Frequency helpers: `ratioAtLeast`, `percentageAtLeast`, `countMatchingFixtures`, `mostFixturesAreBTTS`,
    `homeHasAtMostNoScoreGames`, `fixtureTotalMinMax`, `teamMinGoalsInH2H`, `hasNoNilNilInFixtures`, …
  - `getHomeTeamStanding` / `getAwayTeamStanding` return `StandingsDataStandingModel` **only for the
    current standings passed in** (no season/snapshot validation — see §7).
- Each market function `currentFixtures.filter(fixture => boolean)` returns a flat **boolean filter**
  (`{ fixtures, option }`). So the output is *"this match qualifies / does not qualify"* — there is **no
  probability**, no confidence value, and no explanation of why.
- Gating: each function requires ≥3 venue fixtures + ≥1 H2H + both standings (`home-win`, `over-2-5`, etc.).

## 4. Leagues / seasons / teams / venues / kickoff

- League identity: `fixture.league.id` + `fixture.league.season` (year int). Season is used to filter
  `getAll*Team*Fixtures` (`currentSeason`), falling back to all-time when the current-season sample is
  too small — a **season-mixing** risk.
- Team identity: numeric `teams.home.id` / `teams.away.id`, compared as numbers or template strings.
- Venue: implicitly encoded by which goal fields are read (`goals.home` when home, `goals.away` when away).
- Kickoff: `fixture.fixture.timestamp` / `date`; ordering uses `timestamp`.

## 5. Home / away distinction

- **Yes** at the fixture level: separate `getAllHomeTeamHomeFixtures` / `getAllAwayTeamAwayFixtures`
  and separate average helpers. Mixed-record helpers also exist (`getLastFiveTeamFixtures`,
  `homeTeamWinsMostMatches` over arbitrary fixtures).
- Weakness: most code reads `fixture.goals.*` for the analysed side based on `fixture.teams.*.id`
  consistently, but a few helpers (e.g. `homeTeamWinsMostMatches`) do not first confirm the team is at
  that venue, and the `score.fulltime` vs `goals` fields are used inconsistently.

## 6. Existing form / goals / BTTS / totals / win calcs

- Recent form = last N (`numberOTeamLastFixturesBack`, default 5) **venue-specific** fixtures, with
  recency weighting applied inside averages only.
- No explicit per-team metric objects (no "% scored", "% conceded", clean-sheet %, BTTS %, O1.5/2.5/3.5 %,
  W/D/L %, trend). These are only computed ad-hoc per predicate inside individual market functions.
- Win probabilities: **not computed**. `home-win` etc. use rank difference + xG thresholds.

## 7. Standings integrity

- `getStandingsByLeagueId` is called with the **current** season only.
- `getHomeTeamStanding`/`getAwayTeamStanding` match on `leagueId` but **not on season**, and the API
  standings response itself is non-seasonal in shape (no per-match snapshot).
- Consequences: (a) only **current** tables exist → any "opponent strength" derived from them is
  **hindsight-biased** for historical matches; (b) promoted teams / incomplete tables are not handled
  (a team simply may not be found → `undefined`).
- No detection of "unknown" strength — missing standing just fails the predicate.

## 8. Bookmaker odds

- **Not present.** No service, model field, or UI element references odds/bookmakers. Search for
  `odds|bookmaker|implied|expected_value` returns only a marketing string in `home.screen.tsx`.
- Fixture model (`models/fixtures`) has no odds field. So value/EV cannot be computed today.

## 9. Tests, logging, error handling, UI, outputs

- **Tests**: only the CRA boilerplate `src/App.test.js`; `setupTests.js` registers jest-dom. No tests
  for prediction logic.
- **Logging**: none in the prediction path.
- **Error handling**: services rely on axios; `getFixtureTeamsStandingsLocal` has a try/catch; network
  failures in `handleBet` are not guarded.
- **UI outputs**: `BetAndFixturesScreen` groups predicted fixtures by `fixture.id → betOptionModel[]`,
  favourites are stored in `favoritePredictions_v1`, and a modal shows both teams' standings.
- **Output object**: `{ fixtures: FixtureDataModel[], option: betOptionModel }` — the UI has no place to
  show a probability, edge, or reasoning today.

## 10. Traced example (fixture → output)

1. `getFilteredFixtures`/`getLeaguesSeasonsFixtures` returns `FixtureDataModel[]` (raw API-Football JSON).
2. `dedupeFixtures` merges them into `allFixtures`; `currentFixtures` = those inside the date window.
3. `runPredict` calls `predictBothTeamsToScore({ currentFixtures, allFixtures, leaguesStandings })`.
4. Inside: for each fixture → venue last-5 lists, H2H, both standings; guard on `<3` fixtures / no H2H /
   missing standings → skip.
5. Averages (`averageGoalsScoredAtHome` …) → `expectedGoalsForTeamA` → `teamMin1(...)` xG thresholds +
   "no blank" checks. If all pass, fixture is included.
6. Output `{ fixtures: [...], option: BTTS }` → cached in `leaguePredictions_v1` → grouped for the UI.

## 11. Reuse / gaps / opportunities

**Reusable**: fixture/standings models + services, `sortedFinishedFixtures`, venue-splitting helpers,
H2H retrieval, `betOptions` registry and the screen's fetch/cache pipeline, threshold-based gating.

**Missing / weak**:
- No probabilities, no calibration, no explanation output.
- Boolean "qualifies" model with magic thresholds scattered across 30+ files.
- Recency weighting applied inside averages but never validated; no weighted/unweighted comparison.
- No opponent-strength feature; standings only used as a coarse `rank` diff.
- No season correctness / historical-snapshot safeguards.
- No odds, no EV, no selection ranking.
- No tests; no backtesting; no data-leakage protection.

## 12. Proposed implementation plan

1. **Config** (`src/config/prediction-config.ts`): all windows, weights, thresholds, minimum samples,
   strength bands, market thresholds and EV edges — no magic numbers in code.
2. **New engine modules** under `src/prediction-engine/`:
   - `types.ts` — probability/model/evidence types (with explicit `dataQuality` flags).
   - `team-form.ts` — per-team recent form (venue split + overall supplement), percentages, trend,
     with sample sizes; keeps raw match records.
   - `opponent-strength.ts` — classify opponents using standings for the **correct league+season**,
     league-size-aware bands, `unknown` when missing, and a `hindsightBias` flag.
   - `poisson.ts` — Poisson/Dixon-Coles-lite goal model producing team-scoring, BTTS, O/U 1.5/2.5/3.5,
     1X2 probabilities; mathematically coherent (totals normalised, 1X2 sums to 1).
   - `odds.ts` — implied prob, margin removal, EV, break-even, staleness.
   - `markets.ts` — market-specific probability assembly + evidence text.
   - `selection.ts` — filter, threshold + minimum-edge gate, ranking, rejection reasons.
   - `predict-fixture.ts` — orchestrator returning the full explainable prediction object.
   - `backtest.ts` — Brier / log-loss / calibration with chronological split (runnable on any fixture array).
3. **Tests** (`src/prediction-engine/__tests__/`): form, splits, opponent strength, missing standings,
   Poisson coherence, odds/EV, sample-size rejection, backtest metric correctness.
4. **Integration**: add new `betOptions` entries (`MODEL_*`) whose `predict` returns model-selected
   fixtures, and expose `getFixturePrediction` for per-fixture detail — **without removing** existing
   functions. If odds are absent, mark `noVerifiedBettingValue`.
5. Guardrails: never claim certainty; label limitations; distinguish frequency from calibrated probability.

## Constraints / limitations found

- No odds source ⇒ Phase 6 EV is implemented but will report "no verified betting value" until an odds
  feed is wired in. No paid API is introduced.
- Only current-season standings ⇒ opponent strength is hindsight-biased for historical matches and flagged.
- No historical odds/store ⇒ ROI & closing-line value backtests are not possible; only accuracy/Brier/log-loss.