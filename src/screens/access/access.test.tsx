/**
 * Stage 3 frontend tests: access passes, checkout, and payment result.
 *
 * These assert the security-critical properties:
 *  - the browser supplies only a product code and never an amount/user id,
 *  - the PayFast payload is used verbatim (never recomputed client-side),
 *  - a success redirect alone NEVER reports active access,
 *  - checkout errors never claim the payment failed.
 */
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('../../services/access', () => {
  const actual = jest.requireActual('../../services/access');
  return {
    __esModule: true,
    ...actual,
    getAccessProducts: jest.fn(),
    getMe: jest.fn(),
    startCheckout: jest.fn(),
    getPurchaseStatus: jest.fn(),
  };
});

import {
  getAccessProducts,
  getMe,
  getPurchaseStatus,
  startCheckout,
} from '../../services/access';
import AccessPassesScreen from './AccessPassesScreen';
import PayFastRedirectScreen from './PayFastRedirectScreen';
import PayFastResultScreen from './PayFastResultScreen';

const productsMock = getAccessProducts as jest.Mock;
const meMock = getMe as jest.Mock;
const checkoutMock = startCheckout as jest.Mock;
const statusMock = getPurchaseStatus as jest.Mock;

const product = {
  code: 'pxi-30d',
  name: '30-Day Predictions Pass',
  price_amount: '99.00',
  currency: 'ZAR',
  duration_days: 30,
};

const noAccess = {
  id: 1,
  firebase_uid: 'uid',
  has_prediction_access: false,
  prediction_access_starts_at: null,
  prediction_access_ends_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

const renderAt = (path: string, ui: React.ReactElement, state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state }]}>
      <Routes>
        <Route path="/access" element={ui} />
        <Route path="/access/checkout" element={ui} />
        <Route path="/access/result" element={ui} />
        <Route path="/predictions" element={<div>predictions</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('AccessPassesScreen', () => {
  it('renders prices, durations and derived benefits from the server', async () => {
    productsMock.mockResolvedValue({ data: { products: [product] } });
    meMock.mockResolvedValue({ data: noAccess });
    renderAt('/access', <AccessPassesScreen />);

    expect(await screen.findByText('30-Day Predictions Pass')).toBeInTheDocument();
    // Price comes straight from the server payload.
    expect(screen.getByText('R99.00')).toBeInTheDocument();
    expect(screen.getByText('30 days of access')).toBeInTheDocument();
    expect(screen.getByText('Full access for 30 days')).toBeInTheDocument();
  });

  it('shows an empty state when the server sells no passes', async () => {
    productsMock.mockResolvedValue({ data: { products: [] } });
    meMock.mockResolvedValue({ data: noAccess });
    renderAt('/access', <AccessPassesScreen />);
    expect(await screen.findByText('No passes are on sale right now.')).toBeInTheDocument();
  });

  it('shows a retryable error when loading fails', async () => {
    productsMock.mockRejectedValue(new Error('boom'));
    meMock.mockRejectedValue(new Error('boom'));
    renderAt('/access', <AccessPassesScreen />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('surfaces expired access distinctly from no access', async () => {
    productsMock.mockResolvedValue({ data: { products: [product] } });
    meMock.mockResolvedValue({
      data: {
        ...noAccess,
        prediction_access_ends_at: '2026-01-01T00:00:00Z',
      },
    });
    renderAt('/access', <AccessPassesScreen />);
    expect(await screen.findByText('Your premium access has expired.')).toBeInTheDocument();
  });

  it('reports active access with remaining time and expiry', async () => {
    productsMock.mockResolvedValue({ data: { products: [product] } });
    // Add an hour of slack so the assertion cannot trip on the millisecond
    // boundary between "10 days" and "9 days".
    const future = new Date(Date.now() + 10 * 86_400_000 + 3_600_000).toISOString();
    meMock.mockResolvedValue({
      data: { ...noAccess, has_prediction_access: true, prediction_access_ends_at: future },
    });
    renderAt('/access', <AccessPassesScreen />);
    expect(await screen.findByText('Your premium access is active.')).toBeInTheDocument();
    expect(screen.getByText(/days remaining/)).toBeInTheDocument();
  });

  it('sends only the product code and an idempotency key to checkout', async () => {
    productsMock.mockResolvedValue({ data: { products: [product] } });
    meMock.mockResolvedValue({ data: noAccess });
    checkoutMock.mockResolvedValue({
      data: { attempt_id: 1, status: 'pending', amount: '99.00', currency: 'ZAR', process_url: 'u', payfast_data: {} },
    });
    renderAt('/access', <AccessPassesScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Buy this pass' }));

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledTimes(1));
    expect(checkoutMock.mock.calls[0][0]).toBe('pxi-30d');
    // A second argument (the idempotency key) exists, but no amount or user id
    // is ever part of the call.
    expect(checkoutMock.mock.calls[0]).toHaveLength(2);
    expect(JSON.stringify(checkoutMock.mock.calls[0])).not.toMatch(/amount|price|user/i);
  });

  it('shows a generic retry message on checkout failure, never "payment failed"', async () => {
    productsMock.mockResolvedValue({ data: { products: [product] } });
    meMock.mockResolvedValue({ data: noAccess });
    checkoutMock.mockRejectedValue(new Error('network down'));
    renderAt('/access', <AccessPassesScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Buy this pass' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not start checkout. Please try again.');
    expect(alert.textContent).not.toMatch(/payment failed/i);
  });
});

describe('PayFastRedirectScreen', () => {
  it('posts the server payload verbatim to the server-provided URL', async () => {
    const checkout = {
      attempt_id: 7,
      status: 'pending',
      amount: '99.00',
      currency: 'ZAR',
      process_url: 'https://sandbox.payfast.co.za/eng/process',
      payfast_data: {
        merchant_id: '10000100',
        merchant_key: '46f0cd694581a',
        m_payment_id: 'PXI-abc123',
        amount: '99.00',
        item_name: '30-Day Predictions Pass',
        signature: 'abcdef0123456789abcdef0123456789',
      },
    };
    const { container } = renderAt('/access/checkout', <PayFastRedirectScreen />, { checkout });

    const form = container.querySelector('form');
    expect(form).toHaveAttribute('action', 'https://sandbox.payfast.co.za/eng/process');
    expect(form).toHaveAttribute('method', 'post');

    // Every field is forwarded unchanged, including the server's signature.
    const values: Record<string, string> = {};
    container.querySelectorAll('input[type="hidden"]').forEach((input) => {
      const el = input as HTMLInputElement;
      values[el.name] = el.value;
    });
    expect(values.signature).toBe('abcdef0123456789abcdef0123456789');
    expect(values.amount).toBe('99.00');
    expect(values.m_payment_id).toBe('PXI-abc123');
  });

  it('never renders a passphrase field', () => {
    const checkout = {
      attempt_id: 7,
      status: 'pending',
      amount: '99.00',
      currency: 'ZAR',
      process_url: 'https://sandbox.payfast.co.za/eng/process',
      payfast_data: { merchant_id: '1', amount: '99.00', signature: 'x' },
    };
    const { container } = renderAt('/access/checkout', <PayFastRedirectScreen />, { checkout });
    expect(container.innerHTML).not.toMatch(/passphrase/i);
  });
});

describe('PayFastResultScreen - a redirect is never proof of payment', () => {
  it('does NOT show active access when only the success hint is present', async () => {
    // Browser arrived with ?status=success, but the server says no access.
    meMock.mockResolvedValue({ data: noAccess });
    renderAt('/access/result?status=success', <PayFastResultScreen />);

    await waitFor(() =>
      expect(screen.getByText('We could not confirm your payment')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
    expect(screen.queryByText(/access is now active/i)).not.toBeInTheDocument();
  });

  it('shows active access only when /me reports an active entitlement', async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    meMock.mockResolvedValue({
      data: { ...noAccess, has_prediction_access: true, prediction_access_ends_at: future },
    });
    renderAt('/access/result?status=success', <PayFastResultScreen />);
    expect(await screen.findByText('Payment confirmed')).toBeInTheDocument();
  });

  it('renders a cancellation state without claiming payment failed', async () => {
    meMock.mockResolvedValue({ data: noAccess });
    renderAt('/access/result?status=cancelled', <PayFastResultScreen />);
    expect(await screen.findByText('Checkout cancelled')).toBeInTheDocument();
    expect(screen.getByText(/No payment was taken/)).toBeInTheDocument();
  });

  it('treats a network error as unconfirmed, not as failure', async () => {
    meMock.mockRejectedValue(new Error('offline'));
    renderAt('/access/result?status=success', <PayFastResultScreen />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/does not mean the payment failed/i);
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
  });

  it('reports a declined attempt as not completed', async () => {
    meMock.mockResolvedValue({ data: noAccess });
    statusMock.mockResolvedValue({
      data: { id: 9, status: 'declined', product_code: 'pxi-30d' },
    });
    renderAt('/access/result?status=success', <PayFastResultScreen />, { attemptId: 9 });
    expect(await screen.findByText('Payment was not completed')).toBeInTheDocument();
  });
});