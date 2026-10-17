import * as fs from 'fs';
import * as path from 'path';
import { mapApiFootballOdds, mapApiFootballOddsPayload } from '../odds-provider';
import { ApiFootballOddsPayload } from '../../services/odds';

const loadSample = (): ApiFootballOddsPayload =>
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'eval-data', 'odds-sample-today.json'), 'utf8')
  );

/**
 * The sample is a REAL API-Football odds payload captured 2026-10-17, containing 6
 * bookmakers (William Hill, Bet365, Marathonbet, BetVictor, Pinnacle, 1xBet).
 */
describe('odds-provider (real API-Football payload)', () => {
  const payload = loadSample();

  it('maps the real payload to engine markets', () => {
    const mapped = mapApiFootballOddsPayload(payload);

    expect(mapped.fixtureId).toBe(1602515);
    const ids = mapped.markets.map((m) => m.marketId);
    // Match Winner (1X2), Both Teams Score, and Goals Over/Under should all map.
    expect(ids).toEqual(expect.arrayContaining(['home_win', 'draw', 'away_win']));
    expect(ids).toEqual(expect.arrayContaining(['btts_yes', 'btts_no']));
    expect(ids).toEqual(expect.arrayContaining(['over_2_5', 'under_2_5']));
    expect(mapped.bookmakers.length).toBeGreaterThan(1);
  });

  it('takes the best (highest) odds across bookmakers for each selection', () => {
    const mapped = mapApiFootballOddsPayload(payload);
    const over25 = mapped.markets.find((m) => m.marketId === 'over_2_5')!;

    // Extract all Over 2.5 prices across bookmakers from the raw payload.
    const raw: number[] = [];
    payload.response![0].bookmakers!.forEach((bm) => {
      bm.bets!.forEach((bet) => {
        if (bet.id === 5) {
          bet.values!.forEach((v) => {
            if ((v.value ?? '').trim().toLowerCase() === 'over 2.5') {
              const n = Number(v.odd);
              if (Number.isFinite(n)) raw.push(n);
            }
          });
        }
      });
    });

    expect(raw.length).toBeGreaterThan(1);
    expect(over25.decimalOdds).toBe(Math.max(...raw));
    expect(over25.bookmaker).toBeTruthy();
  });

  it('attaches an odds timestamp from the fixture update field', () => {
    const mapped = mapApiFootballOddsPayload(payload);
    expect(mapped.updatedAt).toBeTruthy();
    mapped.markets.forEach((m) => {
      expect(typeof m.timestamp).toBe('number');
      expect(m.timestamp!).toBeGreaterThan(0);
    });
  });

  it('attaches margin-adjusted probability from the same bookmaker as the best price', () => {
    const mapped = mapApiFootballOddsPayload(payload);
    const over25 = mapped.markets.find((m) => m.marketId === 'over_2_5')!;
    const bookmaker = payload.response![0].bookmakers!.find((bm) => bm.name === over25.bookmaker)!;
    const bet = bookmaker.bets!.find((item) => item.id === 5)!;
    const over = Number(bet.values!.find((value) => value.value?.trim().toLowerCase() === 'over 2.5')!.odd);
    const under = Number(bet.values!.find((value) => value.value?.trim().toLowerCase() === 'under 2.5')!.odd);
    const expected = (1 / over) / ((1 / over) + (1 / under));

    expect(over25.marginAdjustedProbability).toBeCloseTo(expected, 4);
  });

  it('never emits odds <= 1 or non-finite values', () => {
    const mapped = mapApiFootballOddsPayload(payload);
    mapped.markets.forEach((m) => {
      expect(Number.isFinite(m.decimalOdds)).toBe(true);
      expect(m.decimalOdds).toBeGreaterThan(1);
    });
  });

  it('returns an empty result for an empty payload (no historical odds)', () => {
    const mapped = mapApiFootballOdds({} as any);
    expect(mapped.markets).toHaveLength(0);
    expect(mapped.bookmakers).toHaveLength(0);
  });

  it('handles a payload with no bookmakers gracefully', () => {
    const mapped = mapApiFootballOdds({ fixture: { id: 1 }, bookmakers: [] } as any);
    expect(mapped.markets).toHaveLength(0);
  });

  it('excludes Asian and unsupported total-goals lines (e.g. 1.75, 2.25, 4.5)', () => {
    const mapped = mapApiFootballOddsPayload(payload);
    const totalMarkets = mapped.markets
      .map((m) => m.marketId)
      .filter((id) => id.startsWith('over_') || id.startsWith('under_'));
    const allowed = [
      'over_1_5', 'under_1_5', 'over_2_5', 'under_2_5', 'over_3_5', 'under_3_5',
    ];
    totalMarkets.forEach((id) => expect(allowed).toContain(id));
  });
});