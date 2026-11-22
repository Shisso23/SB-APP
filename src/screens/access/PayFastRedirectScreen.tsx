import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { CheckoutResponse } from '../../services/access/types';

/**
 * PayFast redirect screen.
 *
 * The backend returns a fully-formed, signed checkout payload plus the exact
 * PayFast URL. This screen only *submits* that payload as a form POST - the
 * same way any browser would:
 *
 *  - No signature is computed or verified here; the browser cannot do so,
 *    because it does not have (and must never have) the merchant passphrase.
 *  - No amount, merchant id or callback URL is edited here. Anything changed
 *    locally would invalidate the signature and be rejected by PayFast.
 *  - Credentials never appear in this component: `payfast_data` carries only
 *    fields PayFast needs on the checkout form.
 */
const PayFastRedirectScreen: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitted, setSubmitted] = useState(false);

  const checkout = (location.state as { checkout?: CheckoutResponse } | null)?.checkout;

  useEffect(() => {
    if (!checkout) {
      // Reached without state (e.g. a refresh). Do not invent a payload; send
      // the customer back to pick a pass instead.
      navigate('/access', { replace: true });
      return;
    }
    // Submit once. PayFast takes over from here and will redirect the browser
    // to our server's return or cancel URL.
    const timer = window.setTimeout(() => {
      if (formRef.current) {
        setSubmitted(true);
        formRef.current.submit();
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [checkout, navigate]);

  if (!checkout) {
    return null;
  }

  const { process_url: processUrl, payfast_data: fields } = checkout;

  return (
    <div className="flex flex-grow flex-col items-center justify-center px-4 pt-28 pb-16 bg-gray-900 text-white">
      <div className="w-full max-w-md rounded-lg bg-gray-800 px-6 py-8 text-center shadow-md">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-teal-400"
        />
        <h1 className="text-lg font-semibold mb-1">
          {submitted ? 'Redirecting to PayFast…' : 'Connecting to PayFast…'}
        </h1>
        <p className="text-sm text-gray-300">
          Please keep this window open while we take you to the secure payment page.
        </p>
        <p className="mt-3 text-xs text-gray-400">
          Amount: {checkout.currency} {checkout.amount}
        </p>

        {/*
          The hidden form posts the server's exact payload. `process_url` comes
          from the server response, not from a hardcoded or environment-derived
          value in the browser.
        */}
        <form ref={formRef} action={processUrl} method="post" className="hidden">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={String(value ?? '')} readOnly />
          ))}
        </form>

        <noscript>
          <p className="mt-4 text-sm text-red-200">
            JavaScript is required to continue to PayFast.
          </p>
        </noscript>

        <button
          type="button"
          onClick={() => formRef.current?.submit()}
          className="mt-5 text-sm underline text-teal-300"
        >
          Continue manually
        </button>
      </div>
    </div>
  );
};

export default PayFastRedirectScreen;