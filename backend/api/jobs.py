from contextlib import contextmanager
from dataclasses import dataclass
from datetime import timedelta, timezone as utc_timezone
import hashlib
import json
import time
import uuid

import environ
from django.db import connection, transaction
from django.utils import timezone
import psycopg

from api.models import JobRun, ProviderBudget


class JobError(Exception):
    pass


class JobBusy(JobError):
    pass


class BudgetExceeded(JobError):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


@dataclass(frozen=True)
class JobPolicy:
    enabled: bool = False
    allowed_leagues: tuple = ()
    max_requests: int = 100
    per_minute: int = 20
    per_day: int = 500
    deadline_seconds: int = 180
    max_fixtures: int = 20
    max_attempts: int = 3

    @classmethod
    def from_environment(cls):
        env = environ.Env()
        values = dict(
            enabled=env.bool("PREDICTXI_INGESTION_ENABLED", default=False),
            allowed_leagues=tuple(int(value) for value in env.list("PREDICTXI_LEAGUES", default=[])),
            max_requests=env.int("PREDICTXI_JOB_REQUESTS", default=100),
            per_minute=env.int("PREDICTXI_REQUESTS_PER_MINUTE", default=20),
            per_day=env.int("PREDICTXI_REQUESTS_PER_DAY", default=500),
            deadline_seconds=env.int("PREDICTXI_JOB_SECONDS", default=180),
            max_fixtures=env.int("PREDICTXI_JOB_FIXTURES", default=20),
        )
        if any(value <= 0 for key, value in values.items() if key not in {"enabled", "allowed_leagues"}):
            raise JobError("Job limits must be positive.")
        return cls(**values)


class RunContext:
    def __init__(self, run, lock, policy):
        self.run = run
        self.token = run.claim_token
        self.lock = lock
        self.policy = policy
        self.deadline = time.monotonic() + policy.deadline_seconds

    def remaining_seconds(self):
        remaining = self.deadline - time.monotonic()
        if self.lock.closed or remaining <= 0:
            raise JobError("Worker lock or deadline is no longer valid.")
        return remaining

    def guard(self):
        self.remaining_seconds()
        try:
            self.lock.execute("SELECT 1").fetchone()
        except psycopg.Error:
            raise JobError("Worker lock session was lost.") from None
        row = JobRun.objects.select_for_update().get(pk=self.run.pk)
        if row.claim_token != self.token or row.status != "running":
            raise JobError("Worker claim is no longer valid.")
        return row

    def checkpoint(self, **changes):
        with transaction.atomic():
            row = self.guard()
            row.checkpoint = {**row.checkpoint, **changes}
            row.save(update_fields=["checkpoint"])
            self.run = row

    def charge_request(self):
        now = timezone.now().astimezone(utc_timezone.utc)
        minute = now.replace(second=0, microsecond=0)
        with transaction.atomic():
            row = self.guard()
            budget, _created = ProviderBudget.objects.get_or_create(pk=1, defaults={"day": now.date(), "minute": minute})
            budget = ProviderBudget.objects.select_for_update().get(pk=budget.pk)
            if budget.day != now.date():
                budget.day, budget.daily_requests = now.date(), 0
            if budget.minute != minute:
                budget.minute, budget.minute_requests = minute, 0
            if (budget.blocked_until and budget.blocked_until > now) or row.requests >= self.policy.max_requests or budget.daily_requests >= self.policy.per_day or budget.minute_requests >= self.policy.per_minute:
                raise BudgetExceeded("Provider request budget exhausted; retry a later schedule.")
            budget.daily_requests += 1
            budget.minute_requests += 1
            budget.save()
            row.requests += 1
            row.save(update_fields=["requests"])
            self.run = row

    def quota_cooldown(self):
        with transaction.atomic():
            self.guard()
            ProviderBudget.objects.filter(pk=1).update(blocked_until=timezone.now() + timedelta(minutes=15))


@contextmanager
def claim_job(kind, scope, slot, policy=None):
    policy = policy or JobPolicy()
    if timezone.is_naive(slot):
        raise JobError("Job slots must be timezone-aware.")
    if kind not in {"bootstrap", "refresh", "predict", "settle"}:
        raise JobError("Unknown job kind.")
    with psycopg.connect(**connection.get_connection_params(), autocommit=True) as lock:
        if not lock.execute("SELECT pg_try_advisory_lock(%s)", (734912043190,)).fetchone()[0]:
            raise JobBusy("Another pipeline worker holds the lock.")
        try:
            with transaction.atomic():
                row, _created = JobRun.objects.get_or_create(kind=kind, scope=scope, slot=slot)
                row = JobRun.objects.select_for_update().get(pk=row.pk)
                if row.status == "completed":
                    skip = True
                else:
                    skip = False
                    if row.attempts >= policy.max_attempts or (row.retry_after and row.retry_after > timezone.now()):
                        raise JobError("Job attempts or retry delay prevent execution.")
                    row.claim_token = uuid.uuid4()
                    row.attempts += 1
                    row.status = "running"
                    row.started_at = timezone.now()
                    row.finished_at = None
                    row.error_code = ""
                    row.save()
            if skip:
                yield None
                return
            context = RunContext(row, lock, policy)
            try:
                yield context
            except Exception as error:
                JobRun.objects.filter(pk=row.pk, claim_token=context.token, status="running").update(
                    status="failed", error_code=type(error).__name__[:80], finished_at=timezone.now(),
                    retry_after=timezone.now() + timedelta(minutes=2 ** row.attempts),
                )
                raise
            else:
                with transaction.atomic():
                    current = context.guard()
                    current.status = "completed"
                    current.finished_at = timezone.now()
                    current.save(update_fields=["status", "finished_at"])
        finally:
            if not lock.closed:
                lock.execute("SELECT pg_advisory_unlock(%s)", (734912043190,))