# Credential Rotation & Git History Remediation Runbook

Status: **prepared, not executed.** Rotation and history rewriting are destructive and
require explicit sign-off. Nothing in this document has been run automatically.

## 1. What is exposed

**Three** API-Football credentials were committed to this repository. (An earlier
revision of this runbook said two; a history search by literal value later surfaced a
third.)

| # | Secret | Where it appeared | Status |
|---|---|---|---|
| 1 | sports key A | literal in `src/config.ts` | removed from source; still in history |
| 2 | sports key B | `.env` via `REACT_APP_API_KEY` + `X_API_SPORTS_KEY` | removed from `.env`; still in history |
| 3 | sports key C | hardcoded in `src/config.ts` by commit `b245ba9` | removed from source; still in history |

Also involved:

| Where | Detail |
|---|---|
| `backend/.env.example` | a real key had been pasted in (replaced with a placeholder) |
| Bundle artefacts | keys were inlined into production JS by CRA; a stale pre-cutover `build/` was deleted |
| `backend/.prediction-build/` | the old scratch tree captured a literal key at compile time; the directory was **never committed** and has been rebuilt clean |

All three values must be treated as **compromised**: they were pushed to
`https://github.com/Shisso23/SB-APP.git` and are present in history.

Measured scope (by literal-value search across all refs):

- `.env` appears in **7 commits**
- sports key A appears in **4 commits**
- sports key B appears in **3 commits**
- sports key C appears in **4 commits**:
  `d9e251b "More changes"`, `a010392 "API integration"`,
  `8124ead "Major improvements in predictions"`, `b245ba9 "Hardcoded key"`
- affected refs: `master`, `backend-predcits`, `feat/old-preds`, all pushed to `origin`
- two commits are self-describing (`new api key`, `Hardcoded key`), indicating repeated
  manual key handling and that earlier rotations never revoked the superseded values

**Rotate all three.** Rotating only the two originally listed would leave key C live.

## 2. Rotation first (revocation is what actually stops the leak)

Removing strings from Git does **not** un-leak a key. Anyone who fetched the repo may
still hold it. Revoke first.

1. Sign in to the API-Football dashboard and **generate a new key**.
2. **Revoke the old key(s).** Confirm the old key now returns an authentication error.
3. Give the new key **only** to Django, via the environment — never to React, never to
   `.env` files that are committed, never pasted into chat or tickets.
4. Expect the currently deployed frontend to break immediately: it still carries the
   old key. This is expected and is why the cutover and rotation ship together.
5. Check usage/billing on the old key for unexpected consumption before revoking, so
   you know whether it was abused.

Optional: request a fresh Firebase Admin service-account key and delete the old one if
you suspect it was exposed. The current one was never committed (verified), so this is
lower priority.

## 3. Stop future leaks (done — no approval needed)

- `.env` is untracked; the local file is preserved and now ignored.
- `.gitignore` matches `**/.env`, `**/.env.*`, `**/*.pem`, `**/*.key`, `**/*.p12`,
  `**/*.pfx`, `**/service-account*.json`, `**/*firebase-adminsdk*.json`,
  `**/*credentials*.json`, `**/secrets/**`, `**/.secrets/**`.
- `*.example` files stay tracked as placeholders; both now contain no real values.
- A backend test asserts `.env.example` holds no provider key.

## 4. History rewrite (DESTRUCTIVE — needs a second, explicit go-ahead)

This rewrites commits, changes every affected SHA, and requires force-pushing all
branches. Anyone with a clone must re-clone. Coordinate before running.

Prerequisites:

- [ ] Rotation done and all **three** old keys verified dead.
- [ ] Every collaborator notified and their work pushed or stashed.
- [ ] CI/automation credentials that read these branches identified.
- [ ] A full mirror backup taken:
      `git clone --mirror https://github.com/Shisso23/SB-APP.git SB-APP-backup.git`
- [ ] `git filter-repo` installed (`brew install git-filter-repo`). Do **not** use the
      deprecated `git filter-branch`.
- [ ] The exact old key values available locally, in a file **outside** the repo
      (e.g. `/tmp/secrets-to-purge.txt`), never committed. Include all three values.

Suggested sequence (review before executing):

```sh
# 1. Mirror backup (safety net)
git clone --mirror https://github.com/Shisso23/SB-APP.git /tmp/SB-APP-backup.git

# 2. Work on a fresh clone, not your live working directory
git clone https://github.com/Shisso23/SB-APP.git /tmp/SB-APP-scrub && cd /tmp/SB-APP-scrub

# 3. Drop .env from all history entirely
git filter-repo --invert-paths --path .env --force

# 4. Replace every residual secret string everywhere else.
#    One "literal==>***REMOVED***" line per key; all three keys must be listed,
#    because dropping .env alone does not touch the keys hardcoded in src/config.ts.
git filter-repo --replace-text /tmp/secrets-to-purge.txt --force

# 5. Sanity-check: no key remains in history
git log --all -S'<OLD_KEY_PLACEHOLDER>' --oneline   # expect no output
git rev-list --all --objects | wc -l                 # object count looks sane

# 6. Force-push all rewritten refs (coordinated)
git push --force --all
git push --force --tags
```

Post-rewrite:

- [ ] Tell collaborators to re-clone (their existing clones still hold the old objects).
- [ ] Delete and recreate any fork or cache that mirrors the old history.
- [ ] Purge stored copies: CI artefact stores, old `build/` outputs, Docker layers,
      error-tracker payloads, log archives, local clones, zip exports.
- [ ] Ask GitHub Support to expire the now-unreachable objects if the repo is public,
      or if you need assurance they are purged server-side.
- [ ] If the repo was ever public, treat the keys as permanently public.

## 5. Verification checklist

- [ ] `git ls-files | grep -E '(^|/)\.env$'` returns nothing.
- [ ] `git log --all -S'<OLD_KEY_A>' --oneline` returns nothing.
- [ ] `git log --all -S'<OLD_KEY_B>' --oneline` returns nothing.
- [ ] `git log --all -S'<OLD_KEY_C>' --oneline` returns nothing.
- [ ] A production build scans clean for keys, `x-apisports-key`, `X-RapidAPI-Key`,
      `REACT_APP_API_KEY`, and **`v3.football.api-sports.io`** (the data host).
      Note: `media.api-sports.io` (the logo CDN in `src/mock-data.ts`) and the public
      Firebase web `AIzaSy…` key are *expected* to match and are not leaks — scope the
      scan accordingly so a real hit is never masked by these benign ones.
- [ ] All three old keys are rejected by the provider.
- [ ] The new key exists only in the backend environment.
- [ ] `backend/.env.example` and `.env.example` contain placeholders only.

## 6. Rollback

History rewriting is not safely reversible in place. Rollback = restore from the mirror
backup and re-push the original refs. Because the leaked keys are revoked by then, a
rollback restores history but **not** exposure — the old keys stay dead either way.