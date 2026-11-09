# Phase 8 — Scheduled automation (cron)

How PredictXI runs generation and refresh automatically, and how to turn it on.

**Nothing here changes the prediction engine, market thresholds, rankings, or the
suggested-betlist algorithms.** Scheduling decides *when* the existing pipeline
runs and *who asked for it*; it never decides what a forecast says.

---

## 1. Approach: one dispatcher, schedules in Django

Cron entries are deliberately trivial — a single frequent tick:

```
*/5 * * * * manage.py run_schedule --due
```

The **due** decision is made inside Django from `PREDICTXI_SCHEDULE_*` settings,
not in the crontab. There is exactly **one source of truth** for schedule times.
Maintaining times in both crontab and Django would let them silently disagree, so
this design avoids it entirely: a change to the daily time is a settings change,
never a crontab edit.

**Why a dispatcher rather than one cron entry per job:**

| | Entry per job | Single dispatcher (chosen) |
|---|---|---|
| Times defined | crontab | Django settings |
| Timezone | cron implementation's | Python, verified |
| Missed tick | job silently skipped | recovered within the window |
| Adding a pass | edit crontab + deploy | change a setting |

---

## 2. Timezone handling — verified, not assumed

Storage is UTC (`USE_TZ=True`). Business dates and due times use
`PREDICTXI_BUSINESS_TIMEZONE`, default `Africa/Johannesburg`.

**The comparison happens in Python, never in the crontab**, because `CRON_TZ` is
not reliable across implementations. Verified on the current host: `man 5 crontab`
has no `CRON_TZ` entry, and the host runs `SAST +0200` while Django stores UTC.
A naive `0 5 * * *` entry would therefore fire at the wrong moment on a UTC host.

`api/admin_schedule.py` converts each due time from the business timezone to UTC
before comparing, so behaviour is identical whether the host is in Johannesburg,
UTC, or anywhere else. This is covered by tests
(`test_window_uses_business_timezone_not_host_time`,
`test_business_date_boundary_not_utc_boundary`).

**Recommended crontab preamble:**

```cron
# Belt and braces: the comparison already happens in Python, so this is not
# load-bearing. It keeps log timestamps aligned with the business day.
CRON_TZ=Africa/Johannesburg
```

---

## 3. Configuration

All values are read from the backend environment (`backend/.env`), which is
git-ignored. No secrets appear in this document.

| Variable | Default | Purpose |
|---|---|---|
| `PREDICTXI_AUTOMATION_ENABLED` | `False` | **Master switch.** Off by default. |
| `PREDICTXI_BUSINESS_TIMEZONE` | `Africa/Johannesburg` | Business-date and due-time zone |
| `PREDICTXI_LEAGUES` | *(empty)* | Enabled leagues, comma-separated ids |
| `PREDICTXI_BATCH_SIZE` | `4` | Leagues processed per inner pass |
| `PREDICTXI_SCHEDULE_DAILY_TIME` | `05:00` | Daily generation time (business tz) |
| `PREDICTXI_SCHEDULE_REFRESH_TIME` | *(empty)* | Optional pre-kickoff refresh; empty disables |
| `PREDICTXI_SCHEDULE_WINDOW_HOURS` | `6` | How late a pass may still fire |
| `PREDICTXI_STALE_JOB_HOURS` | `3` | A RUNNING job older than this is treated as interrupted |
| `PREDICTXI_INGESTION_ENABLED` | `False` | Existing pipeline gate; still required |

`PREDICTXI_INGESTION_ENABLED` must **also** be `True`, because scheduled runs
execute the existing pipeline, which has its own gate. Both are required.

---

## 4. Commands

```sh
# What cron calls. Runs whatever is due right now. Safe to run every few minutes.
manage.py run_schedule --due

# Force a pass regardless of time (manual testing, catch-up).
manage.py run_schedule --daily-generate
manage.py run_schedule --refresh

# Recover interrupted runs and re-queue them.
manage.py run_schedule --resume

# Executes queued runs. Long-lived; shares its executor with manual admin runs.
manage.py run_admin_jobs            # one pass
manage.py run_admin_jobs --loop     # poll continuously
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Work ran, or nothing was due. Both normal. |
| `1` | Automation disabled, or a configuration error (`CommandError`). |
| `2` | An unexpected error was recorded against the run. |

---

## 5. Production cron entries

Replace `/srv/sb-app` with the real deployment path.

```cron
# Generation + refresh dispatcher. Checks every 5 minutes and runs whatever is
# due; repeated ticks are safe because a run is unique per (kind, business date).
*/5 * * * * cd /srv/sb-app/backend && PREDICTXI_AUTOMATION_ENABLED=True /srv/sb-app/backend/.venv/bin/python manage.py run_schedule --due >> /var/log/predictxi-schedule.log 2>&1

# Executor. Drains queued runs. Use --loop under a supervisor instead if available.
* * * * * cd /srv/sb-app/backend && /srv/sb-app/backend/.venv/bin/python manage.py run_admin_jobs >> /var/log/predictxi-admin-jobs.log 2>&1
```

**Requirements these entries depend on:**

- **Working directory** — `cd` first. `manage.py` resolves `predictxi.settings`
  relative to the project root, and `PYTHONPATH` is not inherited by cron.
- **Interpreter** — the project virtualenv, by absolute path. Cron has a minimal
  `PATH` and will otherwise pick up a system Python without the dependencies.
- **Django settings** — `DJANGO_SETTINGS_MODULE` is set inside `manage.py`, so no
  extra export is needed.
- **Environment variables** — cron does **not** read `backend/.env`. Variables must
  be present in the crontab environment or sourced by a wrapper script. Do not
  inline secrets in the crontab; use a mode-`600` env file owned by the deploy user
  and `set -a; . /srv/sb-app/backend/.env; set +a` in a wrapper.

**Only one scheduler must own the schedule.** If the platform also runs its own
cron or scheduled jobs, disable one. Application-level locking
(`adminjob_one_active_per_kind_date`) is the safety net, not the plan.

### Platform note

Do not assume an application container runs a `cron` daemon, and do not assume an
edited container crontab survives redeployment. If the platform has no persistent
cron, use its supported scheduled-job mechanism to invoke the same commands:

- **Kubernetes** — a `CronJob` with the command from §4.
- **systemd** — a timer unit calling `run_schedule --due`.
- **Managed platforms** (Heroku Scheduler, Render Cron, Fly Machines) — schedule
  the command string directly.
- **Platforms with no scheduler at all** — run `run_admin_jobs --loop` as a
  long-lived worker and drive `run_schedule --due` from an external trigger.

In every case the invoked command is identical, so scheduling can move without
code changes.

---

## 6. Enabling, disabling, testing

**Enable**

```sh
# 1. Enable the existing pipeline gate first.
PREDICTXI_INGESTION_ENABLED=True
# 2. Configure leagues and the master switch.
PREDICTXI_LEAGUES=39,140,78
PREDICTXI_AUTOMATION_ENABLED=True
# 3. Restart the API, then install the cron entries.
```

**Disable**

Set `PREDICTXI_AUTOMATION_ENABLED=False` and restart. Cron keeps ticking and
exits `0` reporting "disabled" — no need to remove the entries. Manual admin runs
keep working either way.

**Test without waiting for the window**

```sh
# Confirms configuration and queues a run immediately.
PREDICTXI_AUTOMATION_ENABLED=True manage.py run_schedule --daily-generate

# Then execute it.
manage.py run_admin_jobs

# Inspect the outcome.
manage.py official_list_status
```

Expected output when disabled:

```
Automation is disabled (PREDICTXI_AUTOMATION_ENABLED is not True). Nothing to do.
```

---

## 7. Reliability

**Retries and backoff.** Transient provider failures are retried with exponential
backoff by the existing pipeline (`api/jobs.py`, `api/providers.py`:
`MAX_RETRIES = 2`, `retry_after = now + 2 ** attempts`). Permanent validation
failures are not retried indefinitely — the job is failed and recorded. Provider
rate limits are enforced by the existing per-minute/per-day budget.

**Idempotency.** A run is unique per `(kind, target_date)` while queued or running,
so a duplicated or repeated cron tick cannot queue a second run or publish twice.
Verified: two consecutive `--due` invocations produce one run.

**Interrupted runs.** A job left `RUNNING` beyond `PREDICTXI_STALE_JOB_HOURS` is
marked failed on the next dispatcher tick, which frees the scope for a retry. A
killed process therefore cannot wedge the queue.

**Failed refreshes preserve published data.** A failed refresh never deletes
existing `Prediction` rows (asserted by
`test_failed_refresh_preserves_previous_predictions`), so users keep seeing the
last successful forecasts.

**Failure visibility.** Failures surface in the admin run list
(`GET /api/v1/admin/jobs/` and `/api/v1/admin/jobs/<id>/`), which reports
`trigger`, `scheduleId`, `executionMechanism`, timestamps, status and error.

---

## 8. Official daily list

**Scheduled runs never publish or replace the official daily list.** Forecast
generation and official publication use different kinds, and publication requires
its own explicit configuration and pre-kickoff safeguards. A scheduled forecast
run is not authorisation to publish. Verified by
`test_no_scheduled_job_uses_the_publish_kind` and
`test_official_snapshot_is_untouched_by_scheduled_runs`.

---

## 9. Manual admin operation is unchanged

Admins keep using the Admin screen (`/admin`) to select a date and leagues and
press **Predict** or **Refresh latest data**. Those endpoints remain restricted to
Django staff; a member receives `403`. Automation being enabled does not alter
this, and both paths share the same orchestration service, the same safeguards,
and the same run records.