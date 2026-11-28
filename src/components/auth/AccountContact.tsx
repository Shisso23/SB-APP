import React, { useEffect, useState } from 'react';

import { getAccountProfile, normalizePhone, PHONE_ERROR, updateAccountPhone } from '../../services/auth/profile';
import PhoneField from './PhoneField';

interface Props {
  uid: string;
  email: string | null;
  registrationPhone?: string;
  registrationInProgress: boolean;
  onRegistrationResolved: () => void;
  onSignOut: () => Promise<void>;
}

const AccountContact: React.FC<Props> = ({ uid, email, registrationPhone, registrationInProgress, onRegistrationResolved, onSignOut }) => {
  const [phone, setPhone] = useState(registrationPhone ?? '');
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (registrationInProgress) return;
    if (registrationPhone !== undefined) {
      setPhone(registrationPhone);
      setReady(true);
      setError('Your account is ready. The phone number could not be saved yet. Use Save phone number to try again.');
      return;
    }
    let active = true;
    setReady(false);
    setError('');
    void getAccountProfile().then(({ data }) => {
      if (!active) return;
      setPhone(data.phone_number ?? '');
      setReady(true);
    }, () => {
      if (active) setError('We could not load your contact information. Try again.');
    });
    return () => { active = false; };
  }, [attempt, registrationInProgress, registrationPhone, uid]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || saving) return;
    setMessage('');
    setError('');
    let value: string | null;
    try {
      value = normalizePhone(phone);
    } catch {
      setError(PHONE_ERROR);
      return;
    }

    setSaving(true);
    try {
      const { data } = await updateAccountPhone(uid, value);
      setPhone(data.phone_number ?? '');
      setMessage(data.phone_number ? 'Phone number saved.' : 'Phone number removed.');
      if (registrationPhone !== undefined) onRegistrationResolved();
    } catch {
      setError('We could not save your phone number. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Account details" className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-white">My account</h2>
        {email && <p className="mt-1 break-all text-sm text-slate-300">{email}</p>}
      </div>
      {ready ? (
        <form onSubmit={submit} className="space-y-3">
          <PhoneField value={phone} onChange={setPhone} disabled={saving} />
          <button type="submit" disabled={saving} className="min-h-[44px] w-full rounded-lg bg-emerald-300 px-3 text-sm font-bold text-slate-900 enabled:hover:bg-emerald-200 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save phone number'}
          </button>
        </form>
      ) : !error ? (
        <p role="status" className="text-sm text-slate-300">Loading your account…</p>
      ) : (
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-[44px] text-sm font-semibold text-emerald-200 underline">Retry account details</button>
      )}
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-200">{message}</p>}
      <button type="button" disabled={saving || registrationInProgress} onClick={() => void onSignOut()}
        className="min-h-[44px] rounded-lg border border-slate-500 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
        Sign out
      </button>
    </section>
  );
};

export default AccountContact;
