import { apiClient, apiGet } from '../api/client';

interface AccountProfile {
  email: string | null;
  phone_number: string | null;
}

const endpoint = '/me/profile/';

export const getAccountProfile = () => apiGet<AccountProfile>(endpoint);

export const updateAccountPhone = (expectedUid: string, phone: string | null) =>
  apiClient.patch<AccountProfile>(endpoint, { expected_uid: expectedUid, phone_number: phone });

export const PHONE_ERROR = 'Enter a South African number or an international number with its country calling code.';

/** Format local South African numbers and international numbers for storage.
 * This checks the number's format. Ownership and reachability are unverified.
 */
export const normalizePhone = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 64) throw new Error(PHONE_ERROR);
  let number = trimmed.replace(/[ ().-]/g, '');
  if (number.startsWith('00')) number = '+' + number.slice(2);
  if (/^0?[1-9][0-9]{8}$/.test(number)) number = '+27' + number.replace(/^0/, '');
  if (!/^\+[1-9][0-9]{6,14}$/.test(number) || (number.startsWith('+27') && !/^\+27[1-9][0-9]{8}$/.test(number))) {
    throw new Error(PHONE_ERROR);
  }
  return number;
};
