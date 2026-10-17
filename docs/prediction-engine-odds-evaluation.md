# Bookmaker Odds Availability & Prospective Evaluation

Date: 2026-10-17
Companion reports: [`prediction-engine-audit-and-evaluation.md`](./prediction-engine-audit-and-evaluation.md),
[`prediction-engine-goal-market-improvement.md`](./prediction-engine-goal-market-improvement.md)

---

## 1. What odds data is available

### Existing repository

Before this phase, the application had **no odds service, no odds fetching, and no stored prices**. The
engine already accepted `MarketOdds[]` and computed implied probabilities, margin removal, EV and
break-even probability, but no odds data source fed it.

### API-Football v3 (existing provider)

Initial probes used the application's configured key while it was on the **Free** plan. The user has
since upgraded; `/status` now reports an active **Pro** subscription with a 7,500 daily request limit
(32 used during verification). The app's `.env` key matched its configured API key.

| Endpoint / query | Observed result |
|------------------|-----------------|
| `/odds?fixture=<past 2023 fixture>` | 0 results, including after upgrade |
| `/odds?date=2023-08-12` | 0 results |
| `/odds?league=39&season=2023` | 0 results |
| `/odds?fixture=<today's/upcoming fixture>` | 1 result with pre-match bookmaker prices |
| `/odds/live` | 43 in-play results at time of probe |
| `/odds/bookmakers` | 33-name bookmaker catalogue (metadata only) |
| `/odds/markets` | Endpoint returned “does not exist” |

**Conclusion:** historical pre-match odds for the 2023 evaluation set remain **unavailable** after
the upgrade. Today's/upcoming pre-match odds and current-season fixtures are available, so we can run
a **prospective** paper evaluation. No historical profitability claim can be made.

### Fixture access before and after the upgrade

Before upgrade, the Free plan prevented forming a valid prediction for odds-bearing 2026 fixtures:

- `fixtures?league=253&season=2026` returned a plan error stating Free plans only have access to
  seasons 2022–2024.
- `fixtures?team=16489&last=5` returned a plan error stating the `Last` parameter is unavailable.
- A league `from`/`to` request without `season` returned `The Season field is required.`
- Fetching a fixture by ID works, but supplies only that fixture, not the historical team form needed
  for a model estimate.
- A broad date query can return current fixtures, but does not provide the prior team results needed
  for valid form features, and cannot substitute for league/season history.

After upgrade, both `fixtures?league=253&season=2026` (510 fixtures) and
`fixtures?team=16489&last=5` (5 fixtures) succeeded. The app was then able to fetch current-season
MLS fixtures and create grounded model predictions.

The current plan returned 6 bookmakers for a sample upcoming fixture: William Hill, Bet365,
Marathonbet, BetVictor, Pinnacle and 1xBet. The response had an ISO fixture-level `update` timestamp
(`2026-10-16T23:23:14+00:00` in the captured sample); bookmaker-level `last_update` was often `null`.
The service captures that fixture-level update as the odds timestamp and flags staleness downstream.

### Market coverage observed

API-Football market IDs confirmed from the actual payload:

| ID | Market | Coverage in sample |
|----|--------|--------------------|
| `1` | Match Winner (Home / Draw / Away) | Available across bookmakers |
| `8` | Both Teams Score (Yes / No) | Available |
| `5` | Goals Over/Under (line-valued) | Bet365, Marathonbet, BetVictor, Pinnacle, 1xBet; not William Hill |
| `12` | Double Chance | Available in some books |
| `10` | Exact Score | Available in some books |
| `6` | 1st-half goals Over/Under | Available in some books |

Full-match O/U 1.5, 2.5, 3.5 were present in multiple bookmakers. Asian quarter-lines were also
present; the mapper deliberately excludes unsupported lines such as 1.75 and 2.25 and keeps only
1.5 / 2.5 / 3.5. Team Over 0.5 was not mapped because this sample payload did not expose a
team-specific goals market in the chosen market IDs.

### Historical odds provider options

The API-Football upgrade restored current-season fixture/history access but **did not return 2023
historical odds** in the tested fixture/date/league-season queries. The exact historical odds depth
available on other tiers still needs confirmation in the account dashboard.

Other commercial providers include The Odds API and Sportmonks, but they require separate accounts,
keys, market/league coverage checks, and potentially different historical retention. I have not added
or recommended a paid provider without a user-approved budget/coverage requirement.

## 2. What was implemented

### Reusable odds integration

- `src/services/odds/index.ts`: API-Football endpoints for odds by fixture/date/league-season,
  bookmaker catalogue and live odds.
- `src/prediction-engine/odds-provider.ts`: maps real API-Football payloads to the engine's
  `MarketOdds[]`; keeps the best available price per selection across bookmakers; attaches fixture
  odds-update timestamp and a margin-adjusted probability computed within the bookmaker supplying
  that best price; maps 1X2, BTTS and full-time O/U 1.5/2.5/3.5; excludes Asian/unsupported lines.
- Real API payload saved at `eval-data/odds-sample-today.json` and used in tests. It is explicitly
  a **single current sample**, not a historical database.

### Prospective paper tracking

- `src/prediction-engine/paper-tracking.ts`: records model probability, market price, raw implied
  probability, margin-adjusted probability when available, edge, expected value, bookmaker, timestamp,
  qualification state, result, hit/miss/push and realised flat-stake return.
- Summaries support Brier score, log loss, bookmaker-implied Brier, ROI, 95% uncertainty interval,
  hit rate, mean predicted probability, and grouping by market / league / probability band / odds range.
- `src/prediction-engine/paper-store.ts`: defensive `localStorage` persistence, duplicate prevention,
  append/update and settlement.
- `BetAndFixturesScreen`: in Statistical mode, **Bet (run predictions)** fetches all pages of odds per UTC
  fixture date, retries unpriced upcoming fixtures by fixture ID, maps quotes, reruns priced model comparisons,
  and stores model/odds snapshots for future fixtures. It rejects odds timestamps at or after kickoff.
  The per-fixture **Capture pre-match odds** action remains as a manual refresh/retry.
- On a later prediction refresh, completed fixtures are matched by fixture ID and pending paper entries
  are settled from their final scores. A collapsible **Prospective odds tracking** section displays
  pending/settled counts and per-market hit rate, Brier, log loss, ROI and a 95% ROI interval.

## 3. How to use the prospective workflow

The **Best available options** list shows one leading option per upcoming match, ranked across fixtures
by estimated EV. Only final sample-qualified selections with fresh odds, the configured probability/edge
thresholds and strictly positive offered-price EV appear. Add/Remove controls update the existing pick
list. This is a model ranking, not proven betting profitability. Full probability cards and rejected
markets remain under **All forecasts and market details**. **Awaiting odds** separates provider-empty
responses, unsupported markets, invalid timestamps and network/provider errors; a provider-empty response
does not tell us whether coverage is absent or prices have not been published. No odds are fabricated.

**Forecasts without odds** shows one leading standard-market estimate per unpriced upcoming fixture,
ranked by model probability rather than EV. Each row includes supporting evidence, venue/overall sample
sizes, warnings, the odds-availability reason and approximate model break-even decimal odds (`1 / p`).
These are likelihood-only forecasts, never value-qualified picks. Below-cutoff estimates remain labelled;
fixtures with insufficient history have no leading forecast. Conditional draw-no-bet and broad
double-chance markets are excluded from this ranking to avoid presenting them as directly comparable
standard outcomes. The full market list remains in the detailed forecasts section.

Select Statistical mode, choose leagues/date range, and press **Bet (run predictions)**. The app fetches
fixtures/history/standings, computes the model output, requests date-batched odds, displays qualifying
and rejected markets, and records every priced market snapshot before kickoff. Use **Capture pre-match
odds** on a card only to retry or refresh that fixture. After a fixture finishes, rerun predictions
for its league so the result is loaded and matching paper entries are settled. The collapsible report
appears in the Predictions header.

The equivalent exported functions remain available for tests or a future worker:
`getOddsByFixture` → `mapApiFootballOddsPayload` → `predictFixture({ ..., odds })` →
`buildPaperSelections` / `appendPaperSelections` → `settlePaperRecord` → `summariseBy`.

Capture is explicit because each fixture request consumes API quota. During verification, repeated
endpoint probes exhausted the free-plan quota and a later request returned HTTP 429. The saved real
payload validates the mapper offline; a complete live capture was not possible in this run. The UI
shows the request error and does not create a paper entry when the odds call fails.

## 4. Evaluation metrics and safeguards

- Odds are associated by the exact fixture ID and market/selection label.
- Best price is retained per selection (bookmaker name recorded).
- Timestamp is recorded from API-Football's fixture-level odds `update`; missing or stale timestamps
  are visible, not inferred as “fresh”.
- Raw implied probability: `1 / decimalOdds`.
- Margin-adjusted probability: normalised within the same bookmaker's complete 1X2, BTTS or O/U
  outcome set where opposing prices are present. The best price may be from a different bookmaker
  for each selection, but each selection's margin adjustment remains tied to its own source book.
- Expected value and break-even probability use the model estimate and captured decimal odds.
- Settlement uses the actual final score; pushes are excluded from hit-rate/Brier/log-loss and report
  zero flat-stake profit.
- Reports can group by market, league, probability band and odds range.
- The 95% return interval is a simple normal-approximation interval; it is descriptive, and can be
  poor with small or dependent samples. Selections from the same match are correlated; do not treat
  them as independent bets.
- Thresholds were not lowered, and no threshold was tuned on evaluation outcomes.

## 5. Actual results and limitations

**There are no historical odds for the 2023 evaluation fixtures on this key/plan**, therefore:

- Historical market-implied probabilities: **not available**.
- Historical EV / closing-line value / ROI: **not evaluated**.
- `/odds?date=2026-10-18` returned 10 fixtures with prices. The app fetched MLS and Brazilian Serie A
  season 2026 and generated prediction cards for the matching window.
- **First prospective batch:** 8 MLS and 2 Brazilian Serie A fixtures, 11 prices per fixture,
  **110 pending market records** from five or six bookmakers per fixture. All odds-update and capture
  timestamps were verified before each kickoff. Fifteen selections pass the existing thresholds; the
  other 95 priced markets are retained as non-qualified records.
- Qualified selections (model probability / best odds / estimated edge / EV per unit):

  | Fixture | Selection | Model | Odds | Edge | EV |
  |---------|-----------|-------|------|------|----|
  | Austin vs Vancouver Whitecaps | Under 3.5 | 65.99% | 1.67 Pinnacle | +8.16pp | +10.2% |
  | Houston Dynamo vs FC Dallas | BTTS Yes | 62.41% | 1.62 William Hill | +4.82pp | +1.1% |
  | Houston Dynamo vs FC Dallas | Over 1.5 | 80.69% | 1.26 Pinnacle | +4.69pp | +1.7% |
  | Houston Dynamo vs FC Dallas | Over 2.5 | 58.82% | 1.85 Pinnacle | +6.50pp | +8.8% |
  | Sporting Kansas City vs Real Salt Lake | Home win | 50.02% | 2.91 Pinnacle | +16.98pp | +45.6% |
  | Sporting Kansas City vs Real Salt Lake | Under 3.5 | 64.03% | 1.75 Pinnacle | +9.02pp | +12.1% |
  | Los Angeles Galaxy vs San Diego | Home win | 53.72% | 2.31 Pinnacle | +12.05pp | +24.1% |
  | Los Angeles Galaxy vs San Diego | Under 3.5 | 59.91% | 1.98 Pinnacle | +11.07pp | +18.6% |
  | Seattle Sounders vs CF Montreal | BTTS Yes | 62.41% | 1.63 Marathonbet | +5.99pp | +1.7% |
  | Seattle Sounders vs CF Montreal | Under 3.5 | 66.10% | 1.75 Pinnacle | +10.97pp | +15.7% |
  | Portland Timbers vs Colorado Rapids | Under 3.5 | 65.62% | 1.61 Pinnacle | +5.97pp | +5.7% |
  | FC Cincinnati vs Columbus Crew | Under 3.5 | 56.51% | 1.93 Pinnacle | +6.90pp | +9.1% |
  | Fluminense vs Santos | Over 1.5 | 80.28% | 1.30 Bet365 | +7.36pp | +4.4% |
  | Fluminense vs Santos | Over 2.5 | 58.20% | 2.00 1xBet | +10.15pp | +16.4% |
  | Bahia vs Flamengo | Under 3.5 | 69.11% | 1.50 Bet365 | +5.52pp | +3.7% |

- These are **model estimates**, not realised outcomes. All entries are pending; hit rate, Brier,
  log-loss, ROI and confidence intervals are not yet meaningful and are not reported as results.
- The engine marked standings unavailable for these fixtures, so opponent strength is unknown. This
  uncertainty is retained in the prediction explanations and limits how much confidence to place in
  these candidate selections.

The prospective workflow must run over more fixtures and settle results before we can report
meaningful out-of-sample metrics. Fifteen qualified selections across ten fixtures are far too few
to estimate performance; correlated selections and current standings limitations further reduce the
effective sample size. Profitability is **unvalidated**.

## 6. Tests and verification

- `odds-provider.test.ts`: 7 tests, including a real saved API-Football payload, best-price mapping,
  timestamps, invalid prices and exclusion of Asian/unsupported goal lines.
- `paper-tracking.test.ts`: settlement, profit, pushes, Brier/log-loss summary, confidence interval,
  grouping, de-duplication and model/price pairing using explicitly synthetic unit-test inputs.
- Full suite: **21 passed / 22 total suites; 111 tests passed**. The only failure is the pre-existing,
  unrelated `src/App.test.js` CRA boilerplate test (`react-modal: No elements were found for selector
  #root`).
- `npx tsc --noEmit`: **0 TypeScript errors**.

## 7. Next decision

Current-season fixture and team-history access is now working on the upgraded API-Football plan, and
prospective tracking is active. Historical 2023 odds still return no data; further historical odds
analysis would require confirming the plan's odds-retention window or evaluating another provider.
Exact current-tier historical retention and pricing were not independently verified (the provider
pricing/docs pages were inaccessible during this run). No historical prices or profitability have
been invented.