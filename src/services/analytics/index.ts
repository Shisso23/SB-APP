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

export const recordVisitorPageView = (path: string) => {
  const visitorKey = getVisitorKey();
  publicClient.post('/analytics/visitor/', {
    visitorKey,
    pagePath: path,
    referrer: typeof document === 'undefined' ? '' : document.referrer,
  }).catch(() => {
    // Analytics must never block or change the browsing experience.
  });
};
