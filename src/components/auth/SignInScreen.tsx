import React, { useState } from 'react';

import { registerWithEmail, signInWithEmail, signOut } from '../../services/auth/firebase';
import { useAuth } from '../../services/auth/AuthProvider';

/** Map Firebase errors to short, user-facing messages. Never echo raw SDK detail. */
const describeAuthError = (error: unknown): string => {
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
      return 'Sign-in failed. Please try again.';
  }
};

const SignInScreen: React.FC = () => {
  const { user, initialising, markSignedOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'sign-in') {
        await signInWithEmail(email.trim(), password);
      } else {
        await registerWithEmail(email.trim(), password);
      }
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setBusy(false);
    }
  };

  if (initialising) {
    return (
      <div role="status" className="py-2 text-sm text-slate-600">
        Checking your session…
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex flex-col items-start gap-3 text-sm text-slate-700">
        <span className="max-w-full break-all">{user.email}</span>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            markSignedOut();
          }}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3 font-semibold text-slate-800 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="predictxi-email" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700">Email</label>
        <input
          id="predictxi-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-sm text-slate-900"
        />
      </div>
      <div>
        <label htmlFor="predictxi-password" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700">Password</label>
        <input
          id="predictxi-password"
          type="password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-sm text-slate-900"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="min-h-[44px] rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </button>
      <button
        type="button"
        onClick={() => { setMode(mode === 'sign-in' ? 'register' : 'sign-in'); setError(''); }}
        className="min-h-[44px] text-sm font-semibold text-teal-800 underline"
      >
        {mode === 'sign-in' ? 'Need an account?' : 'Have an account?'}
      </button>
      {error && <div role="alert" className="text-sm text-rose-800">{error}</div>}
    </form>
  );
};

export default SignInScreen;