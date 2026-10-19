/**
 * Guards for the Phase 4 cutover.
 *
 * These tests assert the security-critical properties: the browser must not reach
 * API-Football, must not carry a provider key, and must surface auth/premium failures
 * instead of showing stale or empty data as if it were current.
 */
import fs from 'fs';
import path from 'path';

import * as session from './session';

const readSource = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });

/** Files that must not contain provider credentials: app source, excluding tests. */
const appSourceFiles = () =>
  walk(path.resolve(process.cwd(), 'src'))
    .filter((file) => !file.includes('__tests__') && !file.includes('test-support'))
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx') && !file.endsWith('.test.js'))
    .filter((file) => !file.endsWith('mock-data.ts'));

describe('frontend credential and provider isolation', () => {
  it('does not reference the provider host or header in application source', () => {
    const offenders = appSourceFiles()
      .filter((file) => /v3\.football\.api-sports\.io|x-apisports-key|X-RapidAPI-Key/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('does not expose a provider key or key environment variable', () => {
    const offenders = appSourceFiles()
      .filter((file) => /REACT_APP_API_KEY|X_API_SPORTS_KEY|xApiSportsKey|\.apiKey\s*:/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('configures only a non-secret Django base URL', () => {
    const config = readSource('src/config.ts');
    expect(config).not.toMatch(/10a431e50d961756f81938b1c9733eae/);
    expect(config).toMatch(/apiUrl/);
    const apiConfig = readSource('src/config/api.ts');
    expect(apiConfig).toMatch(/REACT_APP_PREDICTXI_API_URL/);
    expect(apiConfig).not.toMatch(/API_KEY/);
  });
});

describe('api client failure mapping', () => {
  const load = () => {
    jest.resetModules();
    return import('./client');
  };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../auth/firebase', () => ({
      __esModule: true,
      currentIdToken: jest.fn().mockResolvedValue('test-token'),
      refreshIdToken: jest.fn().mockResolvedValue('test-token'),
    }));
    localStorage.clear();
  });

  it('fails closed when no ID token is available', async () => {
    jest.doMock('../auth/firebase', () => ({
      __esModule: true,
      currentIdToken: jest.fn().mockResolvedValue(null),
      refreshIdToken: jest.fn().mockResolvedValue(null),
    }));
    const { apiGet, SignInRequiredError } = await load();
    await expect(apiGet('/fixtures')).rejects.toBeInstanceOf(SignInRequiredError);
  });

  it('maps 401 to an expired session', async () => {
    const client = await load();
    const adapters = (client.apiClient.interceptors.response as unknown as { handlers: Array<{ rejected: (error: unknown) => Promise<never> }> }).handlers;
    const rejected = adapters[0].rejected;
    const error = await rejected({ response: { status: 401 } }).catch((caught: Error) => caught);
    expect(error.name).toBe('SessionExpiredError');
  });

  it('notifies registered listeners when a session expires', () => {
    const onExpired = jest.fn();
    session.onSessionExpired(onExpired);
    session.notifySessionExpired();
    expect(onExpired).toHaveBeenCalledTimes(1);
    session.onSessionExpired(null);
    session.notifySessionExpired();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('maps 403 to a premium error and 5xx to a service error', async () => {
    const client = await load();
    const adapters = (client.apiClient.interceptors.response as unknown as { handlers: Array<{ rejected: (error: unknown) => Promise<never> }> }).handlers;
    const rejected = adapters[0].rejected;

    const premiumError = await rejected({ response: { status: 403 } }).catch((caught: Error) => caught);
    expect(premiumError.name).toBe('PremiumRequiredError');

    const serverError = await rejected({ response: { status: 503 } }).catch((error: Error) => error);
    expect(serverError.name).toBe('ApiRequestError');
    expect((serverError as Error).message).toMatch(/temporarily unavailable/i);
  });

  it('does not echo server details in error messages', async () => {
    const client = await load();
    const adapters = (client.apiClient.interceptors.response as unknown as { handlers: Array<{ rejected: (error: unknown) => Promise<never> }> }).handlers;
    const error = await adapters[0].rejected({
      response: { status: 500, data: { detail: 'internal-host-name-and-stack' } },
    }).catch((caught: Error) => caught);
    expect(error.message).not.toMatch(/internal-host-name-and-stack/);
  });
});