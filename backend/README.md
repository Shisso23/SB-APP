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

### Firebase Admin credentials

Download the service-account JSON from the Firebase console
(**Project settings → Service accounts → Generate new private key**) and place it at:

```
backend/.secrets/firebase-service-account.json
```

That directory is git-ignored. Restrict the file to your user only:

```sh
chmod 600 backend/.secrets/firebase-service-account.json
```

Then configure **either** variable (the first takes precedence):

```sh
FIREBASE_PROJECT_ID=predcitz-backend
FIREBASE_CREDENTIALS_FILE=.secrets/firebase-service-account.json
# or the standard Google SDK variable:
# GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-service-account.json
```

Relative paths resolve against `backend/`. Leaving both unset falls back to
Application Default Credentials. A configured path that does not exist fails at
startup rather than silently running unauthenticated. `FIREBASE_PROJECT_ID` must
match the frontend's `projectId`, or every token is rejected.

**Never** commit the service-account JSON, paste it into chat, or put it in
`.env.example`. The example file is committed and must hold placeholders only; a
test enforces that it contains no provider key.

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

The bounded Phase 3 management pipeline and private runner are described below.
No scheduler is installed and no ingestion is enabled automatically. Audit-log
retention and backups/restore monitoring still need operational setup. Choose
database/runtime regions and privacy retention before any paid pilot.

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

## Phase 3: private bounded jobs

Ingestion and job execution are disabled unless `PREDICTXI_INGESTION_ENABLED=True`
and `PREDICTXI_LEAGUES` explicitly allows the requested league. The provider key
remains empty. Only mock HTTP responses were used in verification. Do not enable
live access, rotate credentials, deploy or install a scheduler without approval.

Compile from the repository root using existing Node dependencies:

```sh
node_modules/.bin/tsc --project backend/prediction_runner/tsconfig.json
node -e 'const path=require("path"),webpack=require("webpack"); webpack({mode:"production",target:"node",entry:path.resolve("backend/.prediction-build/backend/prediction_runner/run.js"),output:{path:path.resolve("backend/.prediction-build/runtime"),filename:"runner.cjs"},optimization:{minimize:false},devtool:false},(error,stats)=>{if(error||stats.hasErrors()){console.error("Private runner bundling failed.");process.exitCode=1;}});'
```

Only `backend/.prediction-build/runtime/runner.cjs` is the executable artifact.
Type-only dependencies cause TypeScript to emit unused frontend configuration into
the parent scratch tree, which can contain the compromised frontend credential.
**Never package or publish the parent `.prediction-build` directory or the client
build.** Webpack bundles only runtime-reachable pure modules; the executable bundle
was scanned without printing secret values and contains no provider credential or
browser networking module. No existing source or frontend dependency was changed.
Artifact scanning must be repeated after future dependency/import changes.

The runner supports fixed-clock prediction, odds mapping and settlement using the
existing TypeScript functions. It has 4 MiB input/output limits and a maximum
10-second execution timeout. Django invokes a fixed argument list without a shell,
discards stderr and supplies only `TZ`/`LANG` to the child environment. Application
credentials and database configuration are never forwarded. The bundle digest and
full engine configuration hash identify each stored prediction version.

After approved environment/database setup, the private command is:

```sh
backend/.venv/bin/python backend/manage.py run_prediction_job --mode refresh --league 39 --season 2026
```

Modes are deliberately separate:

- `bootstrap`: fetch the configured three-season fixture history in bounded pages;
	store the actual observation time, never a retroactive availability claim.
- `refresh`: fetch active-season fixtures/results, standings and odds. It does not
	generate predictions or settle selections. Quote mapping is limited to the next
	two days' capped upcoming candidates.
- `predict`: run the private engine for capped upcoming fixtures using a persisted
	clock, engine/config hashes and only source observations known by that clock.
- `settle`: use observed final results to settle priced markets from pre-kickoff
	prediction snapshots. No prediction generation or provider requests occur here.

An eventual scheduler should run `refresh`, then `predict` as separate invocations,
and run `settle` independently. No cron entry or deployment was created. The default
idempotency slot is the current five-minute slot; `--slot` accepts an explicit
aware ISO schedule time no later than the server clock. Bootstrap is a separately
scheduled/offline operation, not something every customer request triggers.

A dedicated PostgreSQL connection holds a global session advisory lock. **Use a
direct/session-pooled endpoint, not transaction pooling.** A unique job-slot row,
bounded attempts, persisted checkpoints and a changed claim token allow recovery.
Lock liveness and claim ownership are checked before writes. Completed slots skip;
transient failed slots have exponential retry delays and at most three attempts.
No raw exception or provider body is stored in job error status.

Request budgets are shared PostgreSQL counters and reserve before every physical
request/retry. Defaults are 100 requests per job, 20/minute and 500/UTC day; these
are conservative operational limits, not model thresholds or claims about provider
plan capacity. HTTP 429 creates a 15-minute shared cooldown. Node/HTTP calls have
their own bounds; the job's cooperative deadline is checked between steps, before
writes and during streamed reads. An in-flight socket read may finish after the
deadline up to its bounded read timeout; late prediction output is never published.

Fixture upserts retain canonical data; immutable source observations retain
capture times and content hashes. Inputs use completed matches before the frozen
clock, correct-league/season standings observed by then, and timestamped pre-match
quotes. Target/standings/quote observations must be within the 15-minute source
freshness window; quotes must additionally pass the unchanged engine odds-age rule.
Missing or stale optional standings/quotes are omitted rather than invented.
Current tables or newly backfilled data cannot be used as historical observations.
Input snapshots and provenance IDs allow exact replay. Generation rechecks kickoff,
current fixture status, build digest and validity before committing.

Current premium reads return only the latest still-valid pre-match version per
fixture. `?history=true` exposes historical versions under the same Firebase and
entitlement checks; `is_actionable` and `valid_until` distinguish them from current
picks. Neither route exposes raw inputs or a public execution endpoint.

Settlement stores one immutable outcome per prediction/market, with its result
observation and the original quote retained in the prediction snapshot. Repeated
settlement is a no-op. A changed final score sets correction metadata and retains
the original outcome/profit for manual reconciliation; it never silently rewrites
performance history. Unpriced forecasts are not assigned hypothetical betting ROI.

## Verification

Compile the private bundle first, configure a dedicated local/test PostgreSQL
connection and a unique `DJANGO_TEST_DATABASE_NAME`, then run the documented Django
test command. PostgreSQL tests cover competing workers, lock loss, crash recovery,
duplicate slots, budgets, provider failures, stale inputs, UTC conversion, kickoff
changes, duplicate execution and correction-aware settlement. Private runner tests
cover fixed golden outputs, repeatability, timeouts, bounds and environment isolation.
All Firebase/provider traffic in tests is mocked. No SQLite substitution is used.

No production migration has been applied. No runner sandbox beyond the fixed code,
filtered environment and process bounds is provided; server filesystem/process
permissions and credential-free packaging must be enforced at deployment.

## Next phase: complete cutover, not a partial proxy

1. Obtain separate approval for credential rotation/revocation, accounting for
	the downtime caused by revoking the key still used by the current browser.
2. Approve real-provider staging verification for this ingestion/runner pipeline
	with a replacement backend-only credential. Keep the existing engine golden
	outputs as the parity gate; do not expose a runner URL.
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