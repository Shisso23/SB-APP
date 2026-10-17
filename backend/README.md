# PredictXI Backend Foundation

This backend is separate from React. Do not publish the existing frontend: its
API-Football credential is compromised. No credential rotation or frontend cutover
is performed here. Never copy the frontend credential into this backend.

## Environment

Python 3.14 is the verified development runtime. Dependencies were resolved as
compatible wheels and import-tested before pinning. Firebase and API-Football
tests must use mocks; no real credentials are required to run them.

From the repository root:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m pip check
```

In VS Code, use **Python: Select Interpreter** and choose `backend/.venv/bin/python`
for backend editing. Terminal verification uses that executable explicitly; editor
diagnostics may use another interpreter until you select it. No workspace settings
are changed by this implementation.

Set variables from `.env.example` in your shell or secret manager. Settings do not
automatically read any environment file, particularly the existing root `.env`.
Generate a private Django secret locally and keep it outside Git and logs. Configure
an explicitly provisioned PostgreSQL database via `DATABASE_URL`; SQLite is rejected.
For local HTTP development only, set `DJANGO_DEBUG=True`. Production defaults require
HTTPS and explicit allowed hosts. CORS is not authentication or a paywall.

Configuration tests require no database:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m unittest api.tests.test_settings -v
```

## Local database and tests

Provision a dedicated local PostgreSQL database and set `DATABASE_URL` explicitly.
The database role needs CREATEDB for Django's isolated test databases, but should not
have that permission in production. No application migration has been run against
an existing database during implementation.

After configuring your own local environment:

```sh
backend/.venv/bin/python backend/manage.py check
backend/.venv/bin/python backend/manage.py makemigrations --check --dry-run
export DJANGO_TEST_DATABASE_NAME="test_predictxi_$(backend/.venv/bin/python -c 'import uuid; print(uuid.uuid4().hex[:12])')"
backend/.venv/bin/python backend/manage.py test api.tests --noinput -v 2
```

The test runner creates and drops only its uniquely named temporary PostgreSQL
database. Never point tests at a production database or substitute SQLite. For a
separately approved local development database, run `manage.py migrate` before
`manage.py runserver 127.0.0.1:8000`. Deployment is not part of this phase.

## Authentication and access

Configure `FIREBASE_PROJECT_ID` and server-side Application Default Credentials or
`FIREBASE_CREDENTIALS_FILE`. Keep credential files outside tracked paths, for example
in the ignored `backend/.secrets/` directory. The Firebase Admin client initializes
only when an authenticated request needs it, not at import/startup. Missing server
credentials fail closed. The authentication emulator is explicitly disallowed.

Send a Firebase client ID token as `Authorization: Bearer <ID_TOKEN>` over HTTPS.
The Admin SDK verifies signature, project/audience, expiry, revocation and disabled
account status. The verified UID maps to the local user; local account disabling
is enforced too. Query parameters, request bodies and token subscription/staff
claims cannot grant access. Verification failures never create a user.

Available endpoints:

- `GET /api/v1/health/`: public liveness only; no account/data/configuration details.
- `GET /api/v1/me/`: authenticated caller's identity and database-derived access.
- `GET /api/v1/fixtures/` and `/api/v1/fixtures/<id>/`: authenticated stored fixture reads.
- `GET /api/v1/predictions/` and `/api/v1/predictions/<id>/`: authenticated reads requiring
  an active, non-revoked prediction entitlement at the server's current time.

There are no public provider calls and no customer write endpoints. Premium and
identity responses use `Cache-Control: private, no-store`. Raw provider payloads
and engine inputs are not serialized. Firebase verification tests mock the SDK;
real-project integration still needs approved credentials and staging verification.

## Records and operational limitations

The initial migration defines users, fixtures, odds snapshots, versioned predictions,
access entitlements and payment events. Decimal odds and entitlement windows have
database constraints. Snapshot model `save()` prevents overwrites; this is not a
database-level tamper-proof ledger (privileged SQL/bulk updates can bypass it).
Engine/config/input versions must be recorded by the later trusted worker.

PaymentEvent is schema only: there is no webhook, voucher redemption, payment
processing or entitlement-granting signal. Raw voucher secrets must never be stored.
Metadata has a small allowlist validated by `full_clean()`; future trusted ingestion
must call validation and perform authoritative payment verification.

Global ingestion scheduling, distributed quota management, audit-log retention,
backups/restore monitoring and a private Node runner are not implemented. Django
does not currently execute the TypeScript engine or import predictions automatically.
Choose database/runtime regions and privacy retention before any paid pilot.

## Private provider adapter

`api.providers.ApiFootballProvider` uses only `API_FOOTBALL_KEY` from backend settings.
Leave it empty until a separately approved replacement credential is available.
Never use the existing compromised frontend credential. The adapter has no HTTP route.

It covers fixtures/date/date-range filters, head-to-head, leagues, standings by
league/team, odds by date/league-season/fixture, bookmakers and live odds. The host
is fixed to API-Football HTTPS. Redirects, arbitrary endpoints and unsupported
filters are rejected. Requests use a 3.05-second connect/10-second read timeout,
at most two retries for transient connection/5xx failures, at most 25 pages and
2 MiB per page. Quota responses are not retried. Pagination failure returns no
partial result. Provider bodies, authentication headers and raw exceptions are
not logged or returned in errors. Sessions ignore environment proxy/netrc settings.
Close the adapter's session when the future ingestion job finishes.

## Next phase: complete cutover, not a partial proxy

1. Obtain separate approval for credential rotation/revocation, accounting for
	the downtime caused by revoking the key still used by the current browser.
2. Add trusted ingestion and a private compiled Node batch runner. Pass validated
	JSON and an explicit clock to the unchanged TypeScript engine; reuse its golden
	outputs for parity. Do not rewrite the formulas in Python or expose a runner URL.
3. Store fixtures, standings/history, quote timestamps and versioned model snapshots
	centrally. Add application API contracts for the remaining screen workflows,
	server-side rate limiting, monitoring and provider quota budgets.
4. Migrate all browser fixtures/head-to-head, league, standings and odds helpers and
	their screen/reducer call sites together. Include bookmaker/live-odds helpers
	or explicitly remove unused calls as part of that separately approved cutover.
5. Remove every browser provider header, literal key and environment-key fallback.
	Do not copy the key into React environment variables. Rebuild and scan bundles
	and source maps before approving deployment. Route/payload shape parity and
	Firebase frontend sign-in must be tested as a complete workflow.
6. Separately approve environment-file untracking (without deleting the local file),
	coordinated Git-history remediation and old deployment/build/log cleanup.

No secrets, frontend files, existing dependency manifests or engine formulas were
changed in this phase. The ignored local virtual environment is not a deploy artifact.