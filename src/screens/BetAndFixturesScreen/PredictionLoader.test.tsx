import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { PredictionLoader } from './PredictionLoader';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('reports work in progress and shows a longer wait message after one minute', () => {
  const { unmount } = render(<PredictionLoader leagueCount={2} statistical hasPreviousForecasts />);
  const status = screen.getByRole('status', { name: 'Prediction progress' });
  expect(status).toHaveTextContent('Loading match data and published probabilities');
  expect(screen.getByText(/usually takes about a minute/)).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(status).toHaveTextContent('Loading match data and published probabilities');
  expect(screen.getByText(/Still working/)).toBeInTheDocument();
  expect(screen.getByText(/Your previous forecasts remain below/)).toBeInTheDocument();
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('legacy loading excludes bookmaker prices', () => {
  render(<PredictionLoader leagueCount={1} statistical={false} hasPreviousForecasts={false} />);
  expect(screen.getByText(/1 selected league/)).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Prediction progress' })).toHaveTextContent('Loading match data and preparing rule-based forecasts');
});
