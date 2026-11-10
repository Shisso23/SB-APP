import { predictFixture } from './engine/prediction-engine/predict-fixture';
import { mapApiFootballOdds } from './engine/prediction-engine/odds-provider';
import { settleSelection } from './engine/prediction-engine/paper-tracking';
import { buildForecastBetList, DEFAULT_BET_LIST_SIZE } from './engine/prediction-engine/forecast-bet-list';
import { DEFAULT_PREDICTION_CONFIG } from './engine/config/prediction-config';

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
    } else if (request.operation === 'bet_list') {
      // Official daily list selection. Deliberately delegates to the SAME
      // `buildForecastBetList` the desk and custom lists use, so the published
      // five-match list cannot diverge from the existing recommendation rules.
      const predictions = request.predictions;
      if (!Array.isArray(predictions) || predictions.length > 5000) throw new Error();
      const limit = Number.isSafeInteger(request.limit) ? request.limit : DEFAULT_BET_LIST_SIZE;
      if (limit < 0 || limit > DEFAULT_BET_LIST_SIZE) throw new Error();
      result = buildForecastBetList(predictions, fixedNow, { limit }).map((suggestion) => ({
        providerFixtureId: suggestion.prediction.fixture.fixture.id,
        marketId: suggestion.forecastId,
        marketLabel: suggestion.preference.label,
        marketLine: suggestion.preference.range
          ? `${suggestion.preference.range.min}-${suggestion.preference.range.max} ${suggestion.preference.range.side}`
          : '',
        probability: suggestion.probability,
        explanation: suggestion.preference.meaning ?? '',
        level: suggestion.level,
        priceStatus: suggestion.priceStatus,
        decimalOdds: Number.isFinite(suggestion.market?.decimalOdds) && (suggestion.market?.decimalOdds as number) > 1
          ? (suggestion.market?.decimalOdds as number) : null,
        bookmaker: suggestion.market?.bookmaker ?? '',
        oddsTimestamp: Number.isFinite(suggestion.market?.oddsTimestamp) ? (suggestion.market?.oddsTimestamp as number) : null,
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