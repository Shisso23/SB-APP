/**
 * Firebase Authentication wrapper.
 *
 * Responsibilities:
 *  - initialise the Firebase app once,
 *  - expose the signed-in user and ID tokens,
 *  - keep the API client supplied with a fresh token.
 *
 * The Firebase web config is public; no secret is handled here.
 */
import { FirebaseApp, initializeApp, getApps, getApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';

import { firebaseConfig, isFirebaseConfigured } from '../../config/firebase';

let authInstance: Auth | null = null;

const app = (): FirebaseApp => {
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
};

/** Lazily initialise Firebase Auth. Throws when the project is not configured. */
export const getFirebaseAuth = (): Auth => {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured for this environment.');
  }
  if (!authInstance) {
    authInstance = getAuth(app());
  }
  return authInstance;
};

export const signInWithEmail = async (email: string, password: string) => {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return credential.user;
};

export const registerWithEmail = async (email: string, password: string) => {
  const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  return credential.user;
};

export const signOut = async () => {
  await firebaseSignOut(getFirebaseAuth());
};

export const subscribeToAuthChanges = (listener: (user: User | null) => void) => {
  try {
    return onAuthStateChanged(getFirebaseAuth(), listener);
  } catch {
    // Report "signed out" rather than crashing the app when unconfigured.
    listener(null);
    return () => undefined;
  }
};

/**
 * Current ID token, or null when signed out.
 *
 * Firebase refreshes expired tokens automatically, so callers get a usable token
 * without managing expiry themselves.
 */
export const currentIdToken = async (): Promise<string | null> => {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
};

/** Invalidate the cached token so the next request forces a refresh. */
export const refreshIdToken = async (): Promise<string | null> => {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken(true);
  } catch {
    return null;
  }
};