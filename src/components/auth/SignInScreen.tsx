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
      <div role="status" className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">
        Checking your session…
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 text-xs text-slate-300">
        <span className="hidden sm:inline">{user.email}</span>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            markSignedOut();
          }}
          className="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold text-slate-200 hover:border-rose-400/50 hover:text-rose-200"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl border border-slate-600 bg-slate-800 p-3 sm:flex-row sm:items-end">
      <div>
        <label htmlFor="predictxi-email" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-300">Email</label>
        <input
          id="predictxi-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-500 bg-white px-2 py-1.5 text-sm text-slate-900"
        />
      </div>
      <div>
        <label htmlFor="predictxi-password" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-300">Password</label>
        <input
          id="predictxi-password"
          type="password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-500 bg-white px-2 py-1.5 text-sm text-slate-900"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </button>
      <button
        type="button"
        onClick={() => { setMode(mode === 'sign-in' ? 'register' : 'sign-in'); setError(''); }}
        className="text-xs font-semibold text-cyan-200 underline"
      >
        {mode === 'sign-in' ? 'Need an account?' : 'Have an account?'}
      </button>
      {error && <div role="alert" className="text-xs text-rose-200 sm:ml-2">{error}</div>}
    </form>
  );
};

export default SignInScreen;