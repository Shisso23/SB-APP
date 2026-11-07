# Forecast highlighting implementation

The inventory is 17 statistical markets (`SUPPORTED_MARKETS`) and 17 active legacy options (`betOptions`), representing 26 distinct outcomes internally. BTTS No is excluded from all forecast and model-pick displays at the user’s request, leaving 25 visible outcomes. Its complementary probability remains internal for calculations. Commented-out registry entries and enum-only entries are excluded. Home-or-away double chance and Asian over 3.0 are not supported; neither is introduced here.

`src/config/forecast-highlights.ts` is the central display configuration. Percentages are preferences for inspecting forecasts, not calibrated confidence, demonstrated accuracy, profitability, or changes to the existing selection policy. User values override display preferences only. All other display cutoffs are suggested initial preferences based on the user’s chosen selectivity, independently of engine selection cutoffs. Home and away variants use equal thresholds. These preferences remain adjustable.

| Outcome | Suggestion (inclusive) | Stronger (inclusive) | Origin |
|---|---:|---:|---|
| Home win | 60% | — | User |
| Draw | 45% | 60% | Initial preference |
| Away win | 60% | — | User |
| Home scores 1+ | 82% | — | User |
| Away scores 1+ | 82% | — | User |
| BTTS Yes | 72% | Continuous prominence above 72% | User |
| Over 1.5 / 2 goals or more | 80% | 90% | Initial preference |
| Under 1.5 | 65% | 80% | Initial preference |
| Over 2.5 | 75% | 85% | Initial preference |
| Under 2.5 | 72% | 85% | Initial preference |
| Over 3.5 | 70% | — | User |
| Under 3.5 | 80% | 90% | Initial preference |
| Home or draw | 80% | 90% | Initial preference |
| Away or draw | 80% | 90% | Initial preference |
| Home draw-no-bet | 70% | 85% | Initial preference |
| Away draw-no-bet | 70% | 85% | Initial preference |
| Total 2–5 | 78% | 88% | Initial preference |
| Total 3–6 | 72% | 85% | Initial preference |
| Total 0–3 | 80% | 90% | Initial preference |
| Home 2+ | 70% | 85% | Initial preference |
| Away 2+ | 70% | 85% | Initial preference |
| Home 1–2 | 60% | 75% | Initial preference |
| Home 2–3 | 55% | 70% | Initial preference |
| Away 1–2 | 60% | 75% | Initial preference |
| Away 2–3 | 55% | 70% | Initial preference |

The user’s home/away win thresholds (60%, without a separate stronger tier), team-to-score thresholds (82%), BTTS Yes threshold (72%) and selective over-3.5 threshold (70%) anchor the suggested preferences. Over 2.5 starts at 75%, and the broader over 1.5 at 80%. Double chance and under 3.5 / total 0–3 also start at 80% because they cover broad outcomes. DNB starts at 70% since its probability excludes refunded draws. BTTS Yes retains the user’s 72% threshold; BTTS No is hidden.

Goal ranges 2–5 and 3–6 start at 78% and 72% respectively, reflecting their relative coverage at ordinary scoring levels without asserting a mathematical ordering between those overlapping events. Two-exact-goal team ranges use 55–60% because they are narrower; their stronger tiers are 70–75%. Draw uses 45%/60%, reflecting a single, typically less probable outcome in a three-outcome market. The 65% under-1.5 cutoff makes a low-total suggestion selective while broader under-2.5 requires 72%. Stronger tiers add visual emphasis at higher probabilities. Home/away variants now use the same percentages rather than assume different tolerances. These are judgment-based starting preferences, not fitted thresholds, recommendations to stake money, or performance claims.

## Meaning and probability sources

All ranges include both endpoints, confirmed in `fixtureTotalMinMax` and the team range helpers. Half-goal markets have no push: over 1.5 is at least 2, over 2.5 at least 3, over 3.5 at least 4. Asian over 3.0 would win at 4+ and refund at exactly 3; it is absent, so the requested 70% over-3 threshold is not applied to another market.

All 16 visible existing statistical markets reuse their displayed `modelProbability` (0–1). Home-or-draw and away-or-draw already exist in the engine. DNB probabilities are conditional on a non-draw: P(home)/(P(home)+P(away)) or the away equivalent; draws are refunded. They must not be read as unconditional win probabilities.

Nine additional legacy-supported outcomes have no existing numerical probability. For the statistical view only, they sum the matching, mutually exclusive outcomes of the complete normalized base scoreline grid. The grid is exposed without changing any existing calculations. These cards explicitly identify the base model; they do not derive ranges from truncated top-five scorelines, from historical match frequencies, or from the separate prior-blended totals. Total 0–3 and under 3.5 describe the same event but can differ because they use distinct model sources; neither silently replaces the other.

Legacy rules return boolean match flags. No percentage is inferred from a legacy match flag or borrowed from the statistical model while viewing legacy rules. Missing markets, missing grids, incomplete grids, malformed probabilities, and values outside 0–1 receive no highlight. Old data without the new optional grid can still show existing forecasts; derived ranges show probability unavailable.

## Presentation and verification

The entire forecasts section is first and open by default. Its fixture cards, grid styling, fixture modal, and existing controls remain. The same probability grid now includes the remaining supported outcomes. The old global and per-fixture model-pick/ranking/explanation blocks are removed. Odds capture remains in forecast cards. Explicitly saved user picks remain available in a separate “My saved picks” section when nonempty; paper records and settlement continue internally. Clear predictions is directly accessible in the primary forecast view. Threshold badges never add a selection. Each qualifying badge names its market, percentage and threshold; BTTS prominence increases continuously above 72%. A fixture with no qualifying forecasts displays an empty suggestion state without lowering thresholds.

Focused tests cover every market's exact boundaries, preserved user values, independent engine cutoffs, full-grid summation and inclusive ranges, existing double chance, DNB interpretation, invalid/missing data, progressive BTTS emphasis, empty suggestions, section order, removal of the old model-pick blocks, and model/date-filter updates. Golden regression expectations continue to compare all original forecast values and selected markets; the newly exposed grid is checked separately.

## Prediction persistence

Forecast snapshots and their date range/legacy option filters are stored together in IndexedDB, rather than serializing large payloads into localStorage. Small preferences, favourites and the existing paper/pick records retain their separate storage. The six-hour lifetime is unchanged: reads, page reloads and odds capture do not renew the original forecast timestamp. Clear predictions removes the persisted snapshot and its view together.

On first load, valid `leaguePredictions_v3` / `predictionView_v1` localStorage data migrates to IndexedDB. Old keys are removed only after the new transaction commits. If migration fails, readable old/new snapshots remain usable and the legacy copy is retained for recovery. No favourites, selected pick keys, paper history, authentication or unrelated storage is cleared. Expired league-list and standings caches are cleaned after a successful save; current auxiliary cache data remains.

Repeated copies of identical fixture objects throughout histories, legacy results and engine/team analyses are canonicalized before saving. IndexedDB structured cloning can retain those shared references. Different versions of a fixture are kept distinct, preserving the exact snapshot, probabilities and statistics. Expired/future-dated prediction entries and duplicate scope keys are removed on reads/writes. Date ranges are validated; malformed cache containers are ignored. A read that prunes expired data commits the smaller cache without extending its age.

Initial hydration is asynchronous and displays “Restoring saved forecasts…”; prediction/date controls wait for it, and restoring a custom range does not accidentally run a new prediction batch. Unmounted screens ignore late hydration results. Cache writes, migration and clear operations are queued within the tab, so clearing behind a pending write cannot leave that write restored afterward. A save reports success only when its IndexedDB transaction completes, with aborts, blocked/unavailable databases and genuine quota failures handled explicitly. Failed writes retain the previous committed snapshot and leave current in-memory forecasts usable, with an error notice rather than claiming persistence.

Tests cover migration before legacy removal, failed migration recovery, personal-data preservation, shared-reference compaction and distinct snapshot versions, expiry pruning without renewal, saving when localStorage writes are quota-blocked, genuine IndexedDB failures, queued clear/write ordering, malformed caches, asynchronous remount/view restoration, per-league retry/cache preservation, and native IndexedDB adapter transaction completion/abort/blocked handling. The IndexedDB boundary uses a separate in-memory test backend for UI/storage integration tests; adapter tests exercise browser event contracts directly.

## Prediction loading experience

Prediction runs display an inline football-themed loading panel above the primary forecasts, brought into view when a run starts. Stages follow actual fixture retrieval, standings, team-form processing, available odds checks (statistical mode only) and final forecast preparation. The panel shows elapsed time, a rotating touchline note every six seconds, and an additional message after 25 seconds. Existing forecasts remain available during a refresh; the initial empty view uses decorative skeleton cards while loading. Animation and scrolling respect reduced-motion preferences, stage updates use a polite live region, and decorative/timed messages do not repeatedly announce to screen readers. Timers are cleaned up on completion/unmount. No artificial completion percentage or minimum waiting period is introduced.

Loader tests cover pending requests, real stage changes versus timed entertainment, elapsed/long-wait messages, legacy-specific copy, timer cleanup, successful completion and failed data requests. The date-filter integration test now waits for its asynchronous batch to finish before teardown.

## Suggested bet list

The suggested list sits directly below all forecasts; the old model-pick section is removed. It uses the same visible statistical probabilities and market-specific display thresholds, including supported base-grid ranges, with BTTS No excluded. It includes only fixtures not yet started (NS/TBD). Forecast percentages meeting their configured market cutoffs determine eligibility; the old model selections, probability gates, EV gates and team-history cutoffs do not exclude a threshold-qualified forecast. Limited history is shown as context. It proposes one market per fixture and defaults to up to five matches, adjustable to 3/5/8/10. No threshold is lowered to fill empty slots.

All qualifying alternatives are retained for selection. “Vary bet options” is enabled by default. The strongest eligible matches fill the requested list size first, keeping one option per match. Variety then selects among qualifying alternatives within those matches; it never substitutes a weaker match merely to obtain another market type. The selection first maximizes distinct market families, then balances family repetitions, then maximizes distinct outcomes and balances their repetitions. Within those preferences it favors the original strength ordering: relative surplus `(probability - suggestionThreshold) / (1 - suggestionThreshold)`, forecast probability, kickoff, fixture ID and market ID. This is a variety preference, not evidence of better accuracy or reduced betting risk. Odds/EV do not change membership or the variety preferences.

Families are centrally defined in `forecast-highlights.ts`: match results (including double chance/DNB), team to score, BTTS, goal totals, total-goal ranges, and team-goal totals/ranges. Total 0–3 and under 3.5 share an outcome for diversity counting, while retaining their own model probabilities and sources; renaming the same event must not create artificial variety. A minimum-cost assignment can reassign a flexible match to an alternative, allowing a match with only one qualifying option to remain represented. Every selected alternative still meets its original inclusive cutoff. Repeated options fill remaining slots when qualifying variety is unavailable; no match is duplicated and no threshold is lowered. Selection is applied within the chosen matches for the requested list size. Repeated bet options are allowed without a hard cap: ten qualifying matches yield ten entries even if all ten only qualify for the same bet option. If fewer matches qualify, the list remains shorter rather than inventing matches or lowering thresholds.

Turning off “Vary bet options” restores the strongest qualifying option per match. Alternatives selected for variety display their match’s strongest qualifying option and percentage, including in copied lists. The selected rows remain ordered by the original strength comparison for readability. DNB remains conditional on a non-draw and ranges retain explicit base-model source labels.

Price status is checked independently: a valid quote with a fresh timestamp must pass the existing probability and edge gates, qualification flag and positive finite model EV before it receives “Price checks passed.” Stale/missing timestamps require a quote refresh; valid quotes failing existing checks are marked accordingly; missing odds are labelled forecast-only. No odds or value estimate is invented for derived markets. Existing stale-odds checks are rerun against current time rather than trusting cached flags. The list is regenerated from the active date-filtered forecasts and model, and drops matches at kickoff.

Each entry displays its forecast, cutoff reason, market meaning, sample counts, price status, and a statistics review action. If none of a match’s displayed probabilities meets its own cutoff, that match is omitted rather than filled with an old model pick. Copy list exports the visible suggestions and their price/source caveats. Adding a price-checked entry to the existing shortlist requires an explicit click. Forecast-only suggestions remain available for manual review and copying. Generating the list never selects a bet or forms an accumulator. Legacy mode explains that numerical forecasts are required rather than borrowing statistical probabilities. The list is rebuilt from the saved forecast cache after reload.

Tests verify user threshold boundaries, relative ranking, one entry per fixture, exclusion of BTTS No and started/postponed/finished matches, limited-history warnings without suppressing threshold qualifiers and malformed/missing probabilities, range sources, negative EV, missing/stale odds timestamps, deterministic ordering, automatic removal at kickoff, list size/copy/review interactions, explicit selection, and integration with primary-section ordering, model switching and date filters.


Diversity tests cover mixed families, balanced repeats within a family, qualifying alternatives exactly at a cutoff, repeated-only matches, constrained/flexible match assignment, requested-size selection, equivalent total-goal outcomes, deterministic ordering, the strongest-only toggle, and copied alternative explanations.

## League loading errors and retries

Unrecovered fixture failures are tracked by league and season, and standings failures are tracked separately. The solid error panel uses an opaque maroon background, darker burgundy league cards, a strong red border, bright white/rose text, and pale rose retry buttons with dark red labels. It lists league/country, the affected seasons or standings, and provider/network messages. Generic storage notices share the clear presentation without receiving an unrelated league-retry action.

Each affected league has a Retry league action; multiple failures also offer Retry all failed leagues. Retries use the failure records, so they work even when the league selection has been cleared. Only failed fixture seasons are force-fetched, bypassing their fixture/prediction caches; a standings-only retry fetches no fixtures. Standings requests settle independently so one failure does not discard other leagues' results. A recovered ranged fallback does not leave behind a false failure notice. Failed/incomplete league results are not saved as fresh cache successes.

Retries preserve unaffected forecasts and odds messages and recompute only the retried leagues. Odds lookup during a retry uses those leagues' fixtures rather than repeating the global date lookup or other leagues' fixture lookups. Successful retry notices disappear individually; failures that persist keep their retry control. In-flight buttons and a run guard prevent duplicate concurrent retries. Clear predictions removes the displayed errors as well as cached results; unexpected run failures preserve existing forecasts and retain recovery actions.

Integration tests cover multiple partial failures, current- versus historical-season targeting, successful forecast/cache preservation, retry-all with partial recovery and disabled duplicate clicks, standings provider errors, recovery via automatic fallback, provider errors returned in successful HTTP responses, and retrying an entirely failed fixture batch after clearing the selection. Component checks cover readable solid styling and non-retryable storage notices.
