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

The entire forecasts section is first and open by default. Its fixture cards, grid styling, fixture modal, and existing controls remain. The same probability grid now includes the remaining supported outcomes. Existing leading selections, ranked picks, explanations, odds capture, shortlist and paper tracking remain available; model selection blocks are collapsed by default. Threshold badges never add a selection. Each qualifying badge names its market, percentage and threshold; BTTS prominence increases continuously above 72%. A fixture with no qualifying forecasts displays an empty suggestion state without lowering thresholds.

Focused tests cover every market's exact boundaries, preserved user values, independent engine cutoffs, full-grid summation and inclusive ranges, existing double chance, DNB interpretation, invalid/missing data, progressive BTTS emphasis, empty suggestions, section order, default collapsed state, and model/date-filter updates. Golden regression expectations continue to compare all original forecast values and selected markets; the newly exposed grid is checked separately.
