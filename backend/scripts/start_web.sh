#!/usr/bin/env bash
# Entry point for the "web" process (see ../Procfile).
#
# Materializes the optional Firebase service-account secret from the
# FIREBASE_CREDENTIALS_JSON env var (DigitalOcean App Platform has no
# file-based secrets, only env vars) into the path settings.py already
# expects, then execs gunicorn. If FIREBASE_CREDENTIALS_JSON is unset,
# Firebase falls back to Application Default Credentials as usual.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

if [[ -n "${FIREBASE_CREDENTIALS_JSON:-}" ]]; then
  mkdir -p .secrets
  printf '%s' "$FIREBASE_CREDENTIALS_JSON" > .secrets/firebase-service-account.json
  chmod 600 .secrets/firebase-service-account.json
fi

exec gunicorn predictxi.wsgi:application \
  --bind "0.0.0.0:${PORT:-8080}" \
  --workers "${GUNICORN_WORKERS:-3}" \
  --threads "${GUNICORN_THREADS:-2}" \
  --timeout "${GUNICORN_TIMEOUT:-120}"
