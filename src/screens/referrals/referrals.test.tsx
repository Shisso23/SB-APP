import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../services/auth/AuthProvider';
import { captureReferral, getAdminReferrals, getMyReferrals } from '../../services/referrals';
import { getReferralTicket } from '../../services/referrals/attribution';
import ReferralLanding from './ReferralLanding';
import ReferralScreen from './ReferralScreen';
import AdminReferrals from '../admin/AdminReferrals';

jest.mock('../../services/auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../../services/referrals', () => ({
  ...jest.requireActual('../../services/referrals'),
  captureReferral: jest.fn(), getAdminReferrals: jest.fn(), getMyReferrals: jest.fn(),
}));

const auth = useAuth as jest.Mock;
const capture = captureReferral as jest.Mock;
const mine = getMyReferrals as jest.Mock;
const admin = getAdminReferrals as jest.Mock;
const link = 'https://predictxi.co.za/ref/PXI9876543210';
const when = '2026-11-28T10:00:00Z';

const landing = (code: string) => render(<MemoryRouter initialEntries={[`/ref/${code}`]}>
  <Routes><Route path="/ref/:code" element={<ReferralLanding />} /></Routes>
</MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  auth.mockReturnValue({ initialising: false, user: null });
});

it('stores the first verified invitation across reloads and subsequent links', async () => {
  capture.mockResolvedValue({ data: { valid: true, ticket: 'first-server-ticket', expiresIn: 3600 } });
  const first = landing('first');
  expect(await screen.findByText(/Invitation saved/)).toBeVisible();
  expect(getReferralTicket()).toBe('first-server-ticket');
  expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/?join=1#account');
  first.unmount();
  landing('second');
  expect(await screen.findByText(/Invitation saved/)).toBeVisible();
  expect(capture).toHaveBeenCalledTimes(1);
  expect(getReferralTicket()).toBe('first-server-ticket');
});

it('shows a normal registration path for invalid invitations and leaves existing accounts alone', async () => {
  capture.mockResolvedValue({ data: { valid: false } });
  const invalid = landing('invalid');
  expect(await screen.findByText(/invitation is unavailable/i)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Create an account' })).toBeVisible();
  expect(getReferralTicket()).toBeUndefined();
  invalid.unmount();
  auth.mockReturnValue({ initialising: false, user: { uid: 'existing' } });
  landing('valid');
  expect(screen.getByText(/already have an account/i)).toBeVisible();
  expect(capture).toHaveBeenCalledTimes(1);
});

it('shows real referral metrics, private history and the personal share link for a signed-in customer', async () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    auth.mockReturnValue({ initialising: false, user: { uid: 'customer' } });
    mine.mockResolvedValue({ data: {
      link, page: 1, totalPages: 1, accessEndsAt: when,
      summary: { registered: 2, qualified: 1, awaiting: 1, daysEarned: 1, reversed: 0 },
      history: [
        { id: 41, registeredAt: when, status: 'rewarded', reward: { days: 1, grantedAt: when, startsAt: when, endsAt: when, reversedAt: null } },
        { id: 42, registeredAt: when, status: 'awaiting', reward: null },
      ],
    } });
    render(<MemoryRouter><ReferralScreen /></MemoryRouter>);
    expect(await screen.findByText('Friend #41')).toBeVisible();
    expect(screen.getByText('Friend #42')).toBeVisible();
    expect(screen.getByText(/1 premium day added on/)).toBeVisible();
    expect(screen.getByLabelText('Your referral link')).toHaveValue(link);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText('Referral link copied.')).toBeVisible();
    expect(writeText).toHaveBeenCalledWith(link);
    expect(decodeURIComponent(screen.getByRole('link', { name: 'Share on WhatsApp' }).getAttribute('href') ?? '')).toContain(link);
  } finally {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});

it('lets staff filter and inspect referral history without issuing any rewards', async () => {
  admin.mockResolvedValue({ data: {
    summary: { registered: 1, qualified: 1, daysAwarded: 1, reversed: 0 },
    total: 1, page: 1, totalPages: 1,
    history: [{ id: 8, registeredAt: when, status: 'rewarded',
      referrer: { id: 1, email: 'referrer@example.test' }, referred: { id: 2, email: 'friend@example.test' },
      purchaseId: 71, purchaseStatus: 'granted', paidGrantId: 33, rewardEntitlementId: 64,
      reward: { days: 1, grantedAt: when, reversedAt: null },
    }],
  } });
  render(<AdminReferrals revision={0} />);
  expect(await screen.findByText(/Purchase #71/)).toBeVisible();
  expect(screen.getByText(/friend@example.test/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'rewarded' } });
  fireEvent.change(screen.getByLabelText('Customer email or ID'), { target: { value: 'friend' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(admin).toHaveBeenLastCalledWith(1, 'friend', 'rewarded'));
  expect(screen.queryByRole('button', { name: /grant reward/i })).not.toBeInTheDocument();
});
