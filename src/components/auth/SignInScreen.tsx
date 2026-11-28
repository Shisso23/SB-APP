import React, { useState } from 'react';

import { registerWithEmail, signInWithEmail, signOut } from '../../services/auth/firebase';
import { useAuth } from '../../services/auth/AuthProvider';
import { normalizePhone, PHONE_ERROR, updateAccountPhone } from '../../services/auth/profile';
import AccountContact from './AccountContact';
import PhoneField, { accountInput } from './PhoneField';

/** Map Firebase errors to short, user-facing messages. Never echo raw SDK detail. */
const describeAuthError = (error: unknown, registering: boolean): string => {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.';
    case 'auth/user-not-found':
      return 'No account exists for that email.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that email.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection.';
    default:
      return registering ? 'Could not create your account. Please try again.' : 'Sign-in failed. Please try again.';
  }
};

const SignInScreen: React.FC<{ onSignedIn: () => void }> = ({ onSignedIn }) => {
  const { user, initialising, markSignedOut } = useAuth();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [registration, setRegistration] = useState<{ uid: string; phone: string }>();
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    let normalizedPhone: string | null = null;
    if (mode === 'register') {
      try {
        normalizedPhone = normalizePhone(phone);
      } catch {
        setError(PHONE_ERROR);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'sign-in') {
        await signInWithEmail(email.trim(), password);
        setRegistration(undefined);
        onSignedIn();
      } else {
        const registered = await registerWithEmail(email.trim(), password);
        setRegistration(undefined);
        if (normalizedPhone) {
          try {
            await updateAccountPhone(registered.uid, normalizedPhone);
          } catch {
            setRegistration({ uid: registered.uid, phone: normalizedPhone });
          }
        }
        setPhone('');
      }
      setPassword('');
    } catch (caught) {
      setError(describeAuthError(caught, mode === 'register'));
    } finally {
      setBusy(false);
    }
  };

  if (initialising) {
    return (
      <div role="status" className="py-2 text-sm text-slate-300">
        Checking your session…
      </div>
    );
  }

  if (user) {
    return (
      <AccountContact key={user.uid} uid={user.uid} email={user.email}
        registrationInProgress={busy && mode === 'register'}
        registrationPhone={registration?.uid === user.uid ? registration.phone : undefined}
        onRegistrationResolved={() => setRegistration(undefined)}
        onSignOut={async () => {
          await signOut();
          setRegistration(undefined);
          setPhone('');
          setMode('sign-in');
          markSignedOut();
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-white">{mode === 'sign-in' ? 'Sign in to PredictXI' : 'Create your account'}</h2>
      <div>
        <label htmlFor="predictxi-email" className="block text-sm font-semibold text-slate-100">Email address</label>
        <input
          id="predictxi-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={accountInput}
        />
      </div>
      {mode === 'register' && <PhoneField value={phone} onChange={setPhone} disabled={busy} />}
      <div>
        <label htmlFor="predictxi-password" className="block text-sm font-semibold text-slate-100">Password</label>
        <input
          id="predictxi-password"
          type="password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={accountInput}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="min-h-[44px] rounded-lg bg-emerald-300 px-4 py-2 text-sm font-bold text-slate-900 enabled:hover:bg-emerald-200 disabled:opacity-60"
      >
        {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => { setMode(mode === 'sign-in' ? 'register' : 'sign-in'); setError(''); }}
        className="min-h-[44px] text-sm font-semibold text-emerald-200 underline underline-offset-4"
      >
        {mode === 'sign-in' ? 'Need an account?' : 'Have an account?'}
      </button>
      {error && <div role="alert" className="text-sm text-rose-200">{error}</div>}
    </form>
  );
};

export default SignInScreen;