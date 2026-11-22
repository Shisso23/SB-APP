/**
 * Firebase web configuration.
 *
 * These values are PUBLIC by design: they ship in the browser bundle and only
 * identify the Firebase project. They are not secrets and grant no server access.
 * Authorisation is enforced by Firebase Security Rules and by Django verifying the
 * ID token server-side.
 *
 * Do NOT put a service-account key, API-Football key, or any provider credential in
 * this file.
 *
 * Values may be overridden per environment with REACT_APP_FIREBASE_* variables.
 */
export const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyAUzwWLvufRJ19EttfUSQQbYGdhhe3Elnk',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'predcitz-backend.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'predcitz-backend',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'predcitz-backend.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '412556625914',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:412556625914:web:a5963a405a60047c0bc643',
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || 'G-RG9XS0MXWE',
} as const;

/** True when a usable Firebase project is configured. */
export const isFirebaseConfigured = () =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);