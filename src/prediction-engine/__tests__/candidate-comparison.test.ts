import * as fs from 'fs';
import * as path from 'path';
import { loadFixturesFromJson } from '../test-support/real-data';
import {
  buildEvaluationDataset,
  summarise,
  outcomeFor,
  MetricSummary,
} from '../test-support/evaluation';
import {
  Candidate,
  engineCandidate,
  rawRateCandidate,
  attackDefenceCandidate,
  lowShrinkageCandidate,
  priorBlendCandidate,
  setStandardLeagueAvg,
  GOAL_MARKETS_EVAL,
} from '../test-support/candidates';
import { MarketId } from '../types';

const load = (file: string) =>
  loadFixturesFromJson(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'eval-data', file), 'utf8')));
const FILES = ['premier-league-2023.json', 'la-liga-2023.json', 'serie-a-2023.json'];

describe('candidate comparison on identical chronological split', () => {
  const ds = buildEvaluationDataset({ allFixtures: FILES.flatMap(load), trainFraction: 0.6 });
  const trainAvg =
    ds.train.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0) / (2 * Math.max(1, ds.train.length));
  setStandardLeagueAvg(trainAvg);

  const evaluate = (candidate: Candidate, market: MarketId): MetricSummary => {
    const base = (() => {
      const s = ds.train
        .map((r) => outcomeFor(r, market))
        .filter((x): x is boolean => x !== null);
      return s.length ? s.filter(Boolean).length / s.length : 0.5;
    })();
    const samples = ds.test
      .map((r) => ({ probability: candidate.probability(r, market), happened: outcomeFor(r, market) }))
      .filter((x): x is { probability: number; happened: boolean } => x.happened !== null);
    return summarise(samples, base);
  };

  it('reports Brier skill for every candidate x market (test window)', () => {
    const candidates: Candidate[] = [
      engineCandidate,
      rawRateCandidate,
      attackDefenceCandidate,
      lowShrinkageCandidate,
      priorBlendCandidate(0.7, trainAvg),
      priorBlendCandidate(0.5, trainAvg),
      priorBlendCandidate(0.3, trainAvg),
    ];

    // eslint-disable-next-line no-console
    console.log(`\ntrain league avg goals/team/match = ${trainAvg.toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log('\n=== Brier skill (higher is better; >0 beats base rate) ===');
    const header = ['candidate'.padEnd(32), ...GOAL_MARKETS_EVAL.map((m) => m.padStart(13))].join(' ');
    // eslint-disable-next-line no-console
    console.log(header);

    candidates.forEach((candidate) => {
      const cells = GOAL_MARKETS_EVAL.map((market) => {
        const s = evaluate(candidate, market);
        return `${s.brierSkill >= 0 ? ' ' : ''}${s.brierSkill.toFixed(4)}`.padStart(13);
      });
      // eslint-disable-next-line no-console
      console.log(`${candidate.name.padEnd(32)} ${cells.join(' ')}`);
    });

    expect(true).toBe(true);
  });

  it('reports Brier and log loss detail for the top candidates', () => {
    const candidates = [engineCandidate, rawRateCandidate, lowShrinkageCandidate];
    // eslint-disable-next-line no-console
    console.log('\n=== Detail (Brier / logLoss) ===');
    candidates.forEach((candidate) => {
      GOAL_MARKETS_EVAL.forEach((market) => {
        const s = evaluate(candidate, market);
        // eslint-disable-next-line no-console
        console.log(
          `${candidate.name.padEnd(30)} ${market.padEnd(15)} n=${s.n} Brier=${s.brier.toFixed(4)} logLoss=${s.logLoss.toFixed(4)} skill=${s.brierSkill.toFixed(4)}`
        );
      });
    });
    expect(true).toBe(true);
  });
});