import type { User } from 'firebase/auth';
import { publicClient } from '../api/client';

const SESSION_KEY = 'predictxi_visitor_session_key';

const getVisitorKey = (): string => {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, key);
    return key;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

export const recordVisitorPageView = async (path: string, user?: Pick<User, 'getIdToken'> | null) => {
  if (/^\/admin(?:[/?#]|$)/i.test(path)) return;
  try {
    // Admin status is server-owned. Send the token only to this public
    // endpoint so it can omit authenticated staff without changing auth UI.
    const token = user ? await user.getIdToken() : null;
    await publicClient.post('/analytics/visitor/', {
      visitorKey: getVisitorKey(),
      pagePath: path,
      referrer: typeof document === 'undefined' ? '' : document.referrer,
    }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  } catch {
    // Analytics must never block or change the browsing experience.
  }
};
