import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LeagueLoadErrors, LeagueLoadFailure } from './LeagueLoadErrors';
import { LeagueDataModel } from '../../models/leagues';
const failure: LeagueLoadFailure = {
  league: { league: { id: 39, name: 'Premier League' }, country: { name: 'England' } } as LeagueDataModel,
  fixtureSeasons: [2026], standings: false, messages: ['Network error'],
};

test('uses a solid high-contrast panel and exposes a targeted retry action', () => {
  const onRetry = jest.fn();
  const { rerender } = render(<LeagueLoadErrors failures={[failure]} warnings={[]} loading={false} retryingIds={[]} onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveClass('bg-slate-900', 'border-red-400');
  expect(screen.getByRole('button', { name: 'Retry Premier League' })).toHaveClass('bg-white', 'text-slate-950');
  fireEvent.click(screen.getByRole('button', { name: 'Retry Premier League' }));
  expect(onRetry).toHaveBeenCalledWith([failure]);
  rerender(<LeagueLoadErrors failures={[failure]} warnings={[]} loading retryingIds={[39]} onRetry={onRetry} />);
  expect(screen.getByRole('button', { name: 'Retrying Premier League' })).toBeDisabled();
});

test('storage notices receive clear styling without an unrelated league retry button', () => {
  render(<LeagueLoadErrors failures={[]} warnings={['Browser storage is full']} loading={false} retryingIds={[]} onRetry={jest.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Browser storage is full');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
