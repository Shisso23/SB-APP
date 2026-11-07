import React from 'react';
import { render, screen } from '@testing-library/react';
import { ForecastHighlight } from './ForecastHighlight';
import { FORECAST_HIGHLIGHTS } from '../../config/forecast-highlights';

test('rerenders from current forecast probabilities with inclusive boundaries', () => {
  const { rerender, container } = render(<ForecastHighlight probability={.59999} preference={FORECAST_HIGHLIGHTS.home_win} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<ForecastHighlight probability={.60} preference={FORECAST_HIGHLIGHTS.home_win} />);
  expect(screen.getByText(/meets the 60% suggestion threshold/)).toHaveAttribute('data-highlight', 'suggested');
  rerender(<ForecastHighlight probability={.82} preference={FORECAST_HIGHLIGHTS.home_win} />);
  expect(screen.getByText(/meets the 60% suggestion threshold/)).toHaveAttribute('data-highlight', 'suggested');
  rerender(<ForecastHighlight probability={.81999} preference={FORECAST_HIGHLIGHTS.away_over_0_5} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<ForecastHighlight probability={.82} preference={FORECAST_HIGHLIGHTS.away_over_0_5} />);
  expect(screen.getByText(/meets the 82% suggestion threshold/)).toHaveAttribute('data-highlight', 'suggested');
  rerender(<ForecastHighlight probability={.90} preference={FORECAST_HIGHLIGHTS.home_or_draw} />);
  expect(screen.getByText(/meets the 90% stronger-highlight threshold/)).toHaveAttribute('data-highlight', 'strong');
  rerender(<ForecastHighlight preference={FORECAST_HIGHLIGHTS.home_win} />);
  expect(container).toBeEmptyDOMElement();
});

test('BTTS prominence increases with probability above 72%', () => {
  const { rerender, container } = render(<ForecastHighlight probability={.72} preference={FORECAST_HIGHLIGHTS.btts_yes} progressive />);
  const initial = Number((container.firstChild as HTMLElement).style.fontWeight);
  rerender(<ForecastHighlight probability={.90} preference={FORECAST_HIGHLIGHTS.btts_yes} progressive />);
  expect(Number((container.firstChild as HTMLElement).style.fontWeight)).toBeGreaterThan(initial);
  expect(screen.getByText(/meets the 72% suggestion threshold/)).toBeInTheDocument();
});
