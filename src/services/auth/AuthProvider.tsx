import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';

import { subscribeToAuthChanges } from './firebase';

interface AuthState {
  /** Null while the initial auth state is still resolving. */
  user: User | null;
  /** True until Firebase reports the first auth state. */
  initialising: boolean;
  /** Force a React re-render when the SDK drops a session. */
  markSignedOut: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, initialising: true, markSignedOut: () => undefined });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((nextUser) => {
      setUser(nextUser);
      setInitialising(false);
    });
    return unsubscribe;
  }, []);

  const markSignedOut = useCallback(() => setUser(null), []);
  const value = useMemo(() => ({ user, initialising, markSignedOut }), [user, initialising, markSignedOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);