import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SuggestedBetList } from './SuggestedBetList';
import { makeForecastBetPrediction } from '../../prediction-engine/test-support/forecast-bet-builders';
import { FORECAST_FAMILIES, FORECAST_HIGHLIGHTS, ForecastPreference } from '../../config/forecast-highlights';
import { FixturePrediction, MarketId } from '../../prediction-engine/types';
import { BetListSuggestion, getSuggestedBetList } from '../../services/predictions';
import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';

jest.mock('../../services/predictions', () => ({
  ...jest.requireActual('../../services/predictions'),
  getSuggestedBetList: jest.fn(),
}));
const mockGetSuggestedBetList = getSuggestedBetList as jest.Mock;

/**
 * Builds the SAME wire shape the real backend's `bet_list` operation returns,
 * from a `MarketValue` the real engine (`makeForecastBetPrediction`, via
 * `buildMarketValue`) already computed - so these tests exercise the component
 * against realistic server responses without needing a live backend.
 */
const toSuggestion = (prediction: FixturePrediction, marketId: MarketId): BetListSuggestion => {
  const preference: ForecastPreference = FORECAST_HIGHLIGHTS[marketId as keyof typeof FORECAST_HIGHLIGHTS];
  const market = prediction.markets.find((entry) => entry.marketId === marketId)!;
  const level = preference.strong !== undefined && market.modelProbability >= preference.strong ? 'strong'
    : market.modelProbability >= preference.suggest ? 'suggested' : 'none';
  const hasQuote = market.decimalOdds !== undefined && market.decimalOdds > 1;
  const fresh = hasQuote && !market.oddsStale;
  const checked = fresh && market.qualifies && market.passedEdgeThreshold && market.passedProbabilityThreshold
    && market.expectedValue !== undefined && market.expectedValue > 0;
  const homeSample = Math.max(prediction.dataQuality.homeSampleSize, prediction.homeTeam.overallSampleSize);
  const awaySample = Math.max(prediction.dataQuality.awaySampleSize, prediction.awayTeam.overallSampleSize);
  return {
    providerFixtureId: prediction.fixture.fixture.id,
    marketId,
    marketLabel: preference.label,
    marketLine: '',
    probability: market.modelProbability,
    explanation: preference.meaning,
    level,
    preference: {
      label: preference.label, meaning: preference.meaning, suggest: preference.suggest,
      strong: preference.strong ?? null, isRange: Boolean(preference.range),
    },
    family: FORECAST_FAMILIES[marketId as keyof typeof FORECAST_FAMILIES],
    historyLimited: homeSample < DEFAULT_PREDICTION_CONFIG.minTeamMatches || awaySample < DEFAULT_PREDICTION_CONFIG.minTeamMatches,
    priceStatus: !hasQuote ? 'unpriced' : !fresh ? 'stale' : checked ? 'checked' : 'unqualified',
    decimalOdds: hasQuote ? market.decimalOdds! : null,
    bookmaker: market.bookmaker ?? '',
    oddsTimestamp: market.oddsTimestamp ?? null,
  };
};

/** Mocks the endpoint to resolve with the strongest-qualifying-market-per-fixture
 * suggestion for each given prediction, up to `limit` - mirroring the real
 * `buildForecastBetList`'s "one market per match" behaviour closely enough for
 * these rendering/interaction tests (each test's predictions only ever have one
 * qualifying market per fixture, matching the original test fixtures).
 */
const mockBetList = (predictions: FixturePrediction[]) => {
  mockGetSuggestedBetList.mockImplementation(({ limit }: { predictions: FixturePrediction[]; limit?: number }) => {
    const suggestions = predictions
      .map((prediction) => {
        const market = prediction.markets[0];
        return market ? toSuggestion(prediction, market.marketId) : null;
      })
      .filter((suggestion): suggestion is BetListSuggestion => Boolean(suggestion) && suggestion!.level !== 'none')
      .slice(0, limit ?? 5);
    return Promise.resolve({ data: { errors: [], results: suggestions.length, response: suggestions } });
  });
};

const now = Date.UTC(2026, 10, 7, 10);
const props = { loading: false, statistical: true, selectedPickKeys: [], onReview: jest.fn(), onTogglePick: jest.fn() };
beforeEach(() => { props.onReview.mockClear(); props.onTogglePick.mockClear(); mockGetSuggestedBetList.mockReset(); });

test('offers up to five distinct matches, adjustable size, and copies a labelled review list', async () => {
  const predictions = Array.from({ length: 8 }, (_, index) => makeForecastBetPrediction({ now, id: index + 1 }));
  mockBetList(predictions);
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<SuggestedBetList {...props} predictions={predictions} />);
  expect(await screen.findAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByText('5 need price review')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add to my picks' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Suggested bet list size'), { target: { value: '3' } });
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
  fireEvent.click(screen.getByRole('button', { name: 'Copy list' }));
  expect(await screen.findByRole('status')).toHaveTextContent('List copied.');
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Forecast only · odds unavailable'));
  fireEvent.click(screen.getAllByRole('button', { name: 'Review match statistics' })[0]);
  expect(props.onReview).toHaveBeenCalledWith(predictions[0]);
  expect(props.onTogglePick).not.toHaveBeenCalled();
});

test('adding a price-checked pick requires an explicit click and updates its button', async () => {
  const prediction = makeForecastBetPrediction({ now, odds: [{ marketId: 'home_win', decimalOdds: 2, timestamp: now - 1000 }] });
  mockBetList([prediction]);
  const { rerender } = render(<SuggestedBetList {...props} predictions={[prediction]} />);
  await screen.findByRole('listitem');
  expect(props.onTogglePick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my picks' }));
  expect(props.onTogglePick).toHaveBeenCalledWith(1, prediction.markets[0]);
  rerender(<SuggestedBetList {...props} predictions={[prediction]} selectedPickKeys={['1:home_win']} />);
  expect(screen.getByRole('button', { name: 'Remove from my picks' })).toBeInTheDocument();
});

test('empty, legacy, loading and changed forecasts do not manufacture entries', async () => {
  const prediction = makeForecastBetPrediction({ now });
  mockBetList([prediction]);
  const { rerender } = render(<SuggestedBetList {...props} predictions={[prediction]} />);
  expect(await screen.findAllByRole('listitem')).toHaveLength(1);
  rerender(<SuggestedBetList {...props} predictions={[]} />);
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  expect(screen.getByText(/No upcoming matches meet your suggestion thresholds/)).toBeInTheDocument();
  rerender(<SuggestedBetList {...props} predictions={[prediction]} statistical={false} />);
  expect(screen.getByText(/Legacy rules do not supply forecast probabilities/)).toBeInTheDocument();
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  rerender(<SuggestedBetList {...props} predictions={[prediction]} loading />);
  expect(screen.getByRole('button', { name: 'Copy list' })).toBeDisabled();
  expect(screen.getByText(/Updating the suggested list/)).toBeInTheDocument();
});

test('a qualifying forecast remains listed with limited history and no model selection', async () => {
  const prediction = makeForecastBetPrediction({ now, markets: { home_win: .6 } });
  prediction.selections = [];
  prediction.homeTeam.overallSampleSize = 1;
  prediction.awayTeam.overallSampleSize = 1;
  mockBetList([prediction]);
  render(<SuggestedBetList {...props} predictions={[prediction]} />);
  expect(await screen.findAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText(/Limited team history/)).toBeInTheDocument();
  expect(screen.getByText(/meets the 60% suggestion threshold/)).toBeInTheDocument();
});

test('always uses the strongest qualifying forecast per match and can return fewer matches', async () => {
  const predictions = [1, 2, 3].map(id => makeForecastBetPrediction({ now, id, markets: { home_win: .8, btts_yes: .75, over_2_5: .8 } }));
  mockBetList(predictions);
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<SuggestedBetList {...props} predictions={predictions} />);
  expect(await screen.findByText('1 market type')).toBeInTheDocument();
  expect(screen.getByText(/Uses the strongest qualifying forecast for each match/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Copy list' }));
  expect(await screen.findByRole('status')).toHaveTextContent('List copied.');
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getAllByText('Home win · 80.00%')).toHaveLength(3);
  expect(props.onTogglePick).not.toHaveBeenCalled();
});

test('requesting ten matches keeps ten qualifying entries even when their bet option repeats', async () => {
  const predictions = Array.from({ length: 10 }, (_, index) => makeForecastBetPrediction({ now, id: index + 1 }));
  mockBetList(predictions);
  render(<SuggestedBetList {...props} predictions={predictions} />);
  await screen.findAllByRole('listitem');
  fireEvent.change(screen.getByLabelText('Suggested bet list size'), { target: { value: '10' } });
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(10));
  expect(screen.getAllByText('Home win · 80.00%')).toHaveLength(10);
  expect(screen.getByText('10 of up to 10 matches')).toBeInTheDocument();
});
