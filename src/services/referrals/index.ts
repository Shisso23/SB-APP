import { apiGet, publicClient } from '../api/client';

export interface ReferralSummary {
  registered: number;
  qualified: number;
  awaiting: number;
  daysEarned: number;
  reversed: number;
}

export type ReferralStatus = 'awaiting' | 'rewarded' | 'reversed';

export interface ReferralHistoryEntry {
  id: number;
  registeredAt: string;
  status: ReferralStatus;
  reward: {
    days: number;
    grantedAt: string;
    startsAt: string;
    endsAt: string;
    reversedAt: string | null;
    reversedSeconds: number;
  } | null;
}

export interface ReferralDashboard {
  code: string;
  link: string | null;
  summary: ReferralSummary;
  accessEndsAt: string | null;
  page: number;
  totalPages: number;
  history: ReferralHistoryEntry[];
}

export interface AdminReferral extends ReferralHistoryEntry {
  referrer: { id: number; email: string };
  referred: { id: number; email: string };
  purchaseId: number | null;
  purchaseStatus: string | null;
  paidGrantId: number | null;
  rewardEntitlementId: number | null;
}

interface AdminReferralResponse {
  summary: ReferralSummary & { daysAwarded: number };
  history: AdminReferral[];
  total: number;
  page: number;
  totalPages: number;
}

type CaptureResponse = { valid: true; ticket: string; expiresIn: number } | { valid: false };

export function captureReferral(code: string) {
  return publicClient.get<CaptureResponse>(`/referrals/capture/${encodeURIComponent(code)}/`, {
    validateStatus: status => status === 200 || status === 404,
  });
}

export const getMyReferrals = (page = 1) => apiGet<ReferralDashboard>('/me/referrals/', { params: { page } });

export const getAdminReferrals = (page: number, search: string, status: ReferralStatus | '') =>
  apiGet<AdminReferralResponse>('/admin/referrals/', { params: { page, search, status } });

export const referralStatusLabels: Record<ReferralStatus, string> = {
  awaiting: 'Awaiting first purchase', rewarded: 'Reward granted', reversed: 'Reward reversed',
};
