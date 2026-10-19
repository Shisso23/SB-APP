import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { classifyFailure } from '../services/api/failures';

/**
 * Routes a premium/entitlement failure to the access-pass screen.
 *
 * The API client already maps HTTP 403 to `PremiumRequiredError`, so screens do
 * not need to know status codes - they only need to hand the error here. When
 * the failure is premium-related the customer is taken to `/access` to buy or
 * renew; anything else is left to the caller so the existing error UI is
 * unchanged.
 *
 * Returns true when the error was handled as a premium failure.
 */
export const usePremiumRedirect = () => {
  const navigate = useNavigate();

  return useCallback(
    (error: unknown): boolean => {
      if (classifyFailure(error) !== 'premium') return false;
      navigate('/access', { state: { reason: 'premium-required' } });
      return true;
    },
    [navigate],
  );
};

export default usePremiumRedirect;