import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SuggestedBetList } from './SuggestedBetList';
import { makeForecastBetPrediction } from '../../prediction-engine/test-support/forecast-bet-builders';
const now = Date.UTC(2026, 10, 7, 10);
const props = { now, loading: false, statistical: true, selectedPickKeys: [], onReview: jest.fn(), onTogglePick: jest.fn() };
beforeEach(() => { props.onReview.mockClear(); props.onTogglePick.mockClear(); });

test('offers up to five distinct matches, adjustable size, and copies a labelled review list', async () => {
  const predictions = Array.from({ length: 8 }, (_, index) => makeForecastBetPrediction({ now, id: index + 1 }));
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<SuggestedBetList {...props} predictions={predictions} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByText('5 need price review')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add to my picks' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Suggested bet list size'), { target: { value: '3' } });
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Copy list' }));
  expect(await screen.findByRole('status')).toHaveTextContent('List copied.');
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Forecast only · odds unavailable'));
  fireEvent.click(screen.getAllByRole('button', { name: 'Review match statistics' })[0]);
  expect(props.onReview).toHaveBeenCalledWith(predictions[0]);
  expect(props.onTogglePick).not.toHaveBeenCalled();
});

test('adding a price-checked pick requires an explicit click and updates its button', () => {
  const prediction = makeForecastBetPrediction({ now, odds: [{ marketId: 'home_win', decimalOdds: 2, timestamp: now - 1000 }] });
  const { rerender } = render(<SuggestedBetList {...props} predictions={[prediction]} />);
  expect(props.onTogglePick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my picks' }));
  expect(props.onTogglePick).toHaveBeenCalledWith(1, prediction.markets[0]);
  rerender(<SuggestedBetList {...props} predictions={[prediction]} selectedPickKeys={['1:home_win']} />);
  expect(screen.getByRole('button', { name: 'Remove from my picks' })).toBeInTheDocument();
});

test('empty, legacy, loading and changed forecasts do not manufacture entries', () => {
  const prediction = makeForecastBetPrediction({ now });
  const { rerender } = render(<SuggestedBetList {...props} predictions={[prediction]} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  rerender(<SuggestedBetList {...props} predictions={[]} />);
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  expect(screen.getByText(/No upcoming matches with sufficient team history/)).toBeInTheDocument();
  rerender(<SuggestedBetList {...props} predictions={[prediction]} statistical={false} />);
  expect(screen.getByText(/Legacy rules do not supply forecast probabilities/)).toBeInTheDocument();
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  rerender(<SuggestedBetList {...props} predictions={[prediction]} loading />);
  expect(screen.getByRole('button', { name: 'Copy list' })).toBeDisabled();
  expect(screen.getByText(/Updating the suggested list/)).toBeInTheDocument();
});
