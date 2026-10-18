import { predictFixture } from '../../src/prediction-engine/predict-fixture';
import { mapApiFootballOdds } from '../../src/prediction-engine/odds-provider';
import { settleSelection } from '../../src/prediction-engine/paper-tracking';
import { DEFAULT_PREDICTION_CONFIG } from '../../src/config/prediction-config';

const MAX_BYTES = 4 * 1024 * 1024;
let size = 0;
const chunks: string[] = [];
process.stdin.setEncoding('utf8');

const reject = () => {
  process.stderr.write('Private runner rejected input or output.\n');
  process.exitCode = 1;
};

process.stdin.on('data', (chunk: string) => {
  size += Buffer.byteLength(chunk);
  if (size > MAX_BYTES) {
    reject();
    process.stdin.destroy();
    return;
  }
  chunks.push(chunk);
});
process.stdin.on('end', () => {
  if (size > MAX_BYTES) return;
  try {
    const request = JSON.parse(chunks.join(''));
    if (!Number.isSafeInteger(request.now) || request.now <= 0) throw new Error();
    const fixedNow = request.now;
    Date.now = () => fixedNow;
    let result: unknown;
    if (request.operation === 'describe') {
      result = { configuration: DEFAULT_PREDICTION_CONFIG };
    } else if (request.operation === 'map_odds') {
      result = mapApiFootballOdds(request.response);
    } else if (request.operation === 'predict') {
      const input = request.input;
      if (!input || !Array.isArray(input.allFixtures) || input.allFixtures.length > 5000 ||
          !Array.isArray(input.leaguesStandings) || !input.fixture ||
          (input.odds && (!Array.isArray(input.odds) || input.odds.length > 100))) throw new Error();
      result = predictFixture({ ...input, now: fixedNow });
    } else if (request.operation === 'settle') {
      if (!Array.isArray(request.selections) || request.selections.length > 100 ||
          !Number.isInteger(request.homeGoals) || request.homeGoals < 0 ||
          !Number.isInteger(request.awayGoals) || request.awayGoals < 0) throw new Error();
      result = request.selections.map((selection) => settleSelection(selection, {
        homeGoals: request.homeGoals, awayGoals: request.awayGoals, settledAt: fixedNow,
      }));
    } else {
      throw new Error();
    }
    const output = JSON.stringify(result, (_name, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error();
      return value;
    });
    if (!output || Buffer.byteLength(output) > MAX_BYTES) throw new Error();
    process.stdout.write(output);
  } catch {
    reject();
  }
});
process.stdin.on('error', reject);