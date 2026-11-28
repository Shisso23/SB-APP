/** Same-site persistence for the first valid referral captured before sign-up. */
const storageKey = 'predictxi_referral_attribution_v1';

interface Attribution {
  ticket: string;
  expiresAt: number;
}

let fallback: Attribution | undefined;

export function getReferralTicket(): string | undefined {
  let saved = fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) saved = JSON.parse(raw) as Attribution;
  } catch {
    // An in-memory referral still works for registration in the current visit.
  }
  return typeof saved?.ticket === 'string' && saved.expiresAt > Date.now() ? saved.ticket : undefined;
}

export function saveFirstReferral(ticket: string, expiresIn: number) {
  if (getReferralTicket()) return;
  const saved = { ticket, expiresAt: Date.now() + expiresIn * 1000 };
  try { window.localStorage.setItem(storageKey, JSON.stringify(saved)); } catch {
    fallback = saved;
    // Storage may be disabled. Keep the current navigation and registration usable.
  }
}
