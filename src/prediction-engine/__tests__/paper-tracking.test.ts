import {
  buildPaperSelections,
  settleSelection,
  evaluateMarket,
  summarisePaperSelections,
  summariseBy,
  probabilityBand,
  oddsRange,
  PaperSelection,
} from '../paper-tracking';
import {
  appendPaperSelections,
  settlePaperRecord,
  paperRecordCounts,
  createEmptyPaperRecord,
} from '../paper-store';

describe('paper-tracking: settlement correctness', () => {
  it('evaluates every supported market correctly for a known score', () => {
    // 2-1 home win, BTTS yes, total 3 (over 2.5, not over 3.5)
    expect(evaluateMarket('home_win', 2, 1)).toBe(true);
    expect(evaluateMarket('away_win', 2, 1)).toBe(false);
    expect(evaluateMarket('draw', 2, 1)).toBe(false);
    expect(evaluateMarket('btts_yes', 2, 1)).toBe(true);
    expect(evaluateMarket('over_2_5', 2, 1)).toBe(true);
    expect(evaluateMarket('over_3_5', 2, 1)).toBe(false);
    expect(evaluateMarket('home_over_0_5', 2, 1)).toBe(true);
    expect(evaluateMarket('home_or_draw', 2, 1)).toBe(true);
    // 1-1 draw: DNB is a push
    expect(evaluateMarket('home_dnb', 1, 1)).toBeNull();
    expect(evaluateMarket('draw', 1, 1)).toBe(true);
    // 0-0
    expect(evaluateMarket('btts_no', 0, 0)).toBe(true);
    expect(evaluateMarket('under_1_5', 0, 0)).toBe(true);
  });

  it('computes profit per unit: +odds-1 on win, -1 on loss, 0 on push', () => {
    const base: PaperSelection = {
      fixtureId: 1, kickoff: 0, capturedAt: 0, homeTeam: 'A', awayTeam: 'B',
      marketId: 'home_win', label: 'Home win', modelProbability: 0.5,
      decimalOdds: 2.5, rawImpliedProbability: 0.4, edge: 0.1, expectedValue: 0.25, qualified: true,
    };
    const win = settleSelection(base, { homeGoals: 2, awayGoals: 0 });
    expect(win.settled!.won).toBe(true);
    expect(win.settled!.profit).toBeCloseTo(1.5, 6);

    const loss = settleSelection(base, { homeGoals: 0, awayGoals: 2 });
    expect(loss.settled!.profit).toBeCloseTo(-1, 6);

    const push = settleSelection({ ...base, marketId: 'home_dnb' }, { homeGoals: 1, awayGoals: 1 });
    expect(push.settled!.won).toBeNull();
    expect(push.settled!.profit).toBe(0);
  });
});

describe('paper-tracking: summary statistics', () => {
  const makeSelection = (over: Partial<PaperSelection>): PaperSelection => ({
    fixtureId: over.fixtureId ?? 1, kickoff: 0, capturedAt: 0, homeTeam: 'A', awayTeam: 'B',
    marketId: 'home_win', label: 'Home win', modelProbability: 0.6,
    decimalOdds: 2.0, rawImpliedProbability: 0.5, edge: 0.1, expectedValue: 0.2, qualified: true,
    ...over,
  });

  it('reports hit rate, ROI, Brier and a confidence interval', () => {
    const selections = [
      makeSelection({ fixtureId: 1, settled: { settledAt: 0, homeGoals: 1, awayGoals: 0, won: true, profit: 1.0 } }),
      makeSelection({ fixtureId: 2, settled: { settledAt: 0, homeGoals: 0, awayGoals: 1, won: false, profit: -1.0 } }),
      makeSelection({ fixtureId: 3, settled: { settledAt: 0, homeGoals: 2, awayGoals: 0, won: true, profit: 1.0 } }),
      makeSelection({ fixtureId: 4, settled: { settledAt: 0, homeGoals: 0, awayGoals: 1, won: false, profit: -1.0 } }),
    ];
    const s = summarisePaperSelections(selections);
    expect(s.n).toBe(4);
    expect(s.hitRate).toBe(0.5);
    expect(s.roi).toBe(0);
    expect(s.brierScore).toBeCloseTo((0.6 - 1) ** 2 / 2 + (0.6 - 0) ** 2 / 2, 6);
    expect(s.roiConfidence95).toBeGreaterThan(0);
  });

  it('excludes unsettled selections from rates and counts pushes separately', () => {
    const selections = [
      makeSelection({ fixtureId: 1, settled: { settledAt: 0, homeGoals: 1, awayGoals: 0, won: true, profit: 1.0 } }),
      makeSelection({ fixtureId: 2 }), // unsettled
      makeSelection({ fixtureId: 3, settled: { settledAt: 0, homeGoals: 1, awayGoals: 1, won: null, profit: 0 } }),
    ];
    const s = summarisePaperSelections(selections);
    expect(s.n).toBe(1);
    expect(s.pushes).toBe(1);
  });

  it('groups by probability band and odds range', () => {
    const selections = [
      makeSelection({ fixtureId: 1, modelProbability: 0.62, decimalOdds: 1.8, settled: { settledAt: 0, homeGoals: 1, awayGoals: 0, won: true, profit: 0.8 } }),
      makeSelection({ fixtureId: 2, modelProbability: 0.55, decimalOdds: 2.2, settled: { settledAt: 0, homeGoals: 0, awayGoals: 1, won: false, profit: -1 } }),
    ];
    const byBand = summariseBy(selections, probabilityBand);
    expect(Object.keys(byBand)).toEqual(expect.arrayContaining(['0.60-0.70', '0.50-0.60']));
    const byOdds = summariseBy(selections, oddsRange);
    expect(Object.keys(byOdds).length).toBeGreaterThan(0);
  });
});

describe('paper-store: persistence with de-duplication', () => {
  it('does not duplicate (fixture, market) entries and never overwrites settled ones', () => {
    let record = createEmptyPaperRecord();
    const s1: PaperSelection = {
      fixtureId: 10, kickoff: 0, capturedAt: 0, homeTeam: 'A', awayTeam: 'B',
      marketId: 'btts_yes', label: 'BTTS', modelProbability: 0.6, decimalOdds: 1.9,
      rawImpliedProbability: 0.53, edge: 0.07, expectedValue: 0.14, qualified: true,
    };
    record = appendPaperSelections(record, [s1]);
    record = appendPaperSelections(record, [{ ...s1, modelProbability: 0.99 }]);
    expect(record.selections).toHaveLength(1);
    // Re-capture updates the unsettled value.
    expect(record.selections[0].modelProbability).toBe(0.99);

    // Settle it, then re-capture must not overwrite.
    const { record: settled } = settlePaperRecord(record, new Map([[10, { homeGoals: 3, awayGoals: 0 }]]));
    const after = appendPaperSelections(settled, [{ ...s1, modelProbability: 0.1 }]);
    expect(after.selections[0].settled).toBeDefined();
    expect(after.selections[0].modelProbability).toBe(0.99);
  });

  it('settles only fixtures whose results are known', () => {
    let record = createEmptyPaperRecord();
    record = appendPaperSelections(record, [
      { fixtureId: 1, kickoff: 0, capturedAt: 0, homeTeam: 'A', awayTeam: 'B', marketId: 'home_win', label: 'Home', modelProbability: 0.5, decimalOdds: 2, rawImpliedProbability: 0.5, edge: 0, expectedValue: 0, qualified: false },
      { fixtureId: 2, kickoff: 0, capturedAt: 0, homeTeam: 'C', awayTeam: 'D', marketId: 'home_win', label: 'Home', modelProbability: 0.5, decimalOdds: 2, rawImpliedProbability: 0.5, edge: 0, expectedValue: 0, qualified: false },
    ]);
    const { record: updated, settledCount } = settlePaperRecord(record, new Map([[1, { homeGoals: 1, awayGoals: 0 }]]));
    expect(settledCount).toBe(1);
    expect(paperRecordCounts(updated)).toEqual({ total: 2, settled: 1, pending: 1, qualified: 0 });
  });
});

describe('paper-tracking: model and price pairing', () => {
  it('records only markets with both a model probability and a price', () => {
    // Synthetic unit-test inputs only; these are not reported as real match data.
    const odds = [
      { marketId: 'btts_yes' as const, decimalOdds: 1.9, timestamp: 100, bookmaker: 'Test Book' },
      { marketId: 'over_2_5' as const, decimalOdds: 2.1, timestamp: 100, bookmaker: 'Test Book' },
    ];
    const markets = [
      { marketId: 'btts_yes' as const, label: 'BTTS Yes', modelProbability: 0.57, edge: 0.04, expectedValue: 0.083, qualifies: false },
      { marketId: 'over_2_5' as const, label: 'Over 2.5', modelProbability: 0.61, edge: 0.1, expectedValue: 0.281, qualifies: true },
      { marketId: 'home_win' as const, label: 'Home win', modelProbability: 0.5, edge: 0, expectedValue: 0, qualifies: false },
    ] as any;
    const selections = buildPaperSelections({
      fixtureId: 1,
      kickoff: 1000,
      homeTeam: 'Synthetic Home',
      awayTeam: 'Synthetic Away',
      markets,
      odds,
      qualifiedMarketIds: ['over_2_5'],
      capturedAt: 50,
    });

    expect(selections).toHaveLength(2);
    expect(selections.map((s) => s.marketId)).toEqual(['btts_yes', 'over_2_5']);
    expect(selections.every((s) => s.capturedAt < s.kickoff)).toBe(true);
    expect(selections.every((s) => s.bookmaker === 'Test Book')).toBe(true);
    expect(selections.find((s) => s.marketId === 'btts_yes')?.qualified).toBe(false);
    expect(selections.find((s) => s.marketId === 'over_2_5')?.qualified).toBe(true);
  });
});