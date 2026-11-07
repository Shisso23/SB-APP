import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { PredictionLoader } from './PredictionLoader';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('rotates touchline notes and tracks elapsed time without inventing progress', () => {
  const { rerender, unmount } = render(<PredictionLoader stage="fixtures" leagueCount={2} includeOdds hasPreviousForecasts={false} />);
  const status = screen.getByRole('status', { name: 'Prediction progress' });
  expect(status).toHaveTextContent('Gathering fixtures');
  expect(screen.getByText('The numbers are warming up. No shuttle runs required.')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(6000); });
  expect(screen.getByText('Form is useful. Football still enjoys a plot twist.')).toBeInTheDocument();
  expect(screen.getByText('6s elapsed')).toBeInTheDocument();
  expect(status).toHaveTextContent('Gathering fixtures');
  expect(screen.getByText('Match history').closest('li')).toHaveAttribute('aria-current', 'step');
  act(() => { jest.advanceTimersByTime(20000); });
  expect(screen.getByText(/Still working/)).toBeInTheDocument();
  rerender(<PredictionLoader stage="odds" leagueCount={2} includeOdds hasPreviousForecasts />);
  expect(status).toHaveTextContent('Checking available bookmaker prices');
  expect(screen.getByText('Available prices').closest('li')).toHaveAttribute('aria-current', 'step');
  expect(screen.getByText(/Your previous forecasts remain below/)).toBeInTheDocument();
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('legacy loading excludes bookmaker prices', () => {
  const { rerender } = render(<PredictionLoader stage="form" leagueCount={1} includeOdds={false} hasPreviousForecasts={false} />);
  expect(screen.getByText('1 selected league · Legacy rules')).toBeInTheDocument();
  expect(screen.queryByText('Available prices')).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Prediction progress' })).toHaveTextContent('Reviewing team form');
  rerender(<PredictionLoader stage="forecasts" leagueCount={1} includeOdds={false} hasPreviousForecasts={false} />);
  expect(screen.getByRole('status', { name: 'Prediction progress' })).toHaveTextContent('Preparing your rule-based forecasts and match details');
});
