import hashlib
import json
from pathlib import Path
import selectors
import shutil
import subprocess
import tempfile
import time

from django.db import transaction
from django.utils import timezone

from api.jobs import digest
from api.models import Fixture, Prediction, Settlement, SourceObservation


BUILD_ROOT = Path(__file__).resolve().parents[1] / ".prediction-build" / "runtime"
RUNNER = BUILD_ROOT / "runner.cjs"
MAX_BYTES = 4 * 1024 * 1024


class ExecutionError(Exception):
    pass


def engine_version():
    files = sorted(BUILD_ROOT.rglob("*.cjs"))
    if not RUNNER.is_file() or not files:
        raise ExecutionError("Private runner must be compiled before execution.")
    hasher = hashlib.sha256()
    for path in files:
        hasher.update(str(path.relative_to(BUILD_ROOT)).encode())
        hasher.update(path.read_bytes())
    return hasher.hexdigest()


def run_engine(payload, *, timeout_seconds=10):
    if timeout_seconds <= 0 or timeout_seconds > 10:
        raise ExecutionError("Invalid private execution deadline.")
    data = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode()
    if len(data) > MAX_BYTES or not RUNNER.is_file():
        raise ExecutionError("Runner input exceeds limits or build is missing.")
    node = shutil.which("node")
    if node is None:
        raise ExecutionError("Node runtime is unavailable.")
    with tempfile.TemporaryFile() as input_file:
        input_file.write(data)
        input_file.seek(0)
        process = subprocess.Popen(
            [node, str(RUNNER)], stdin=input_file, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            cwd=BUILD_ROOT, env={"TZ": "UTC", "LANG": "C.UTF-8"}, shell=False,
        )
        deadline = time.monotonic() + timeout_seconds
        output = bytearray()
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not selector.select(timeout=remaining):
                        raise ExecutionError("Private runner timed out.")
                    chunk = process.stdout.read1(64 * 1024)
                    if not chunk:
                        selector.unregister(process.stdout)
                    else:
                        output.extend(chunk)
                        if len(output) > MAX_BYTES:
                            raise ExecutionError("Private runner output exceeds limits.")
                process.wait(timeout=max(0.001, deadline - time.monotonic()))
            if process.returncode != 0:
                raise ExecutionError("Private runner rejected the execution.")
            try:
                return json.loads(output, parse_constant=lambda _value: (_ for _ in ()).throw(ValueError()))
            except (ValueError, UnicodeError):
                raise ExecutionError("Private runner returned invalid JSON.") from None
        except subprocess.TimeoutExpired:
            raise ExecutionError("Private runner timed out.") from None
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()


def generate_prediction(context, fixture, *, as_of=None, historical=False):
    from api.ingestion import assemble_input, milliseconds
    as_of = as_of or timezone.now()
    version = engine_version()
    timeout = min(10, context.deadline - time.monotonic())
    configuration = run_engine({"operation": "describe", "now": milliseconds(as_of)}, timeout_seconds=timeout)["configuration"]
    data, provenance, valid_until = assemble_input(fixture, as_of, configuration, historical=historical)
    frozen_input = {**data, "now": milliseconds(as_of)}
    key = dict(fixture=fixture, engine_version=version, input_hash=digest(frozen_input), config_hash=digest(configuration))
    with transaction.atomic():
        context.guard()
        existing = Prediction.objects.filter(**key).first()
        if existing:
            return existing
    output = run_engine({"operation": "predict", "input": data, "now": milliseconds(as_of)},
                        timeout_seconds=min(10, context.deadline - time.monotonic()))
    if engine_version() != version or not isinstance(output, dict) or output.get("fixture", {}).get("fixture", {}).get("id") != fixture.provider_id:
        raise ExecutionError("Engine build or output does not match the frozen input.")
    with transaction.atomic():
        context.guard()
        current = Fixture.objects.select_for_update().get(pk=fixture.pk)
        now = timezone.now()
        if current.kickoff != fixture.kickoff or (not historical and (current.status not in {"NS", "TBD"} or now >= valid_until)):
            raise ExecutionError("Fixture or input freshness changed before publication.")
        return Prediction.objects.get_or_create(**key, defaults={
            "as_of": as_of, "generated_at": now, "inputs": frozen_input, "output": output,
            "configuration": configuration, "provenance": provenance,
            "valid_until": None if historical else valid_until,
        })[0]


def settle_fixture(context, fixture):
    from api.ingestion import entries, milliseconds
    if fixture.status != "FT" or fixture.kickoff >= timezone.now() or fixture.home_goals is None or fixture.away_goals is None:
        return {"settled": 0, "corrections": 0}
    candidates = SourceObservation.objects.filter(kind="fixtures", scope=f"{fixture.league_id}:{fixture.season}",
                                                  observed_at__gte=fixture.kickoff).order_by("-observed_at", "-id")
    result_source = None
    for source in candidates:
        raw = next((item for item in entries(source.payload) if item["fixture"]["id"] == fixture.provider_id), None)
        if raw and raw["fixture"]["status"]["short"] == "FT" and raw["goals"] == {"home": fixture.home_goals, "away": fixture.away_goals}:
            result_source = source
            break
    if not result_source:
        raise ExecutionError("Final result has no matching observed provenance.")
    counts = {"settled": 0, "corrections": 0}
    predictions = Prediction.objects.filter(fixture=fixture, as_of__lt=fixture.kickoff, generated_at__lt=fixture.kickoff).order_by("id")
    for prediction in predictions:
        selections = []
        previous = {row.market_id: row for row in prediction.settlements.select_related("correction_observation")}
        for market in prediction.output.get("markets", []):
            price = market.get("decimalOdds")
            if isinstance(price, (int, float)) and price > 1:
                old = previous.get(market["marketId"])
                score = {"home": fixture.home_goals, "away": fixture.away_goals}
                if old and (old.home_goals, old.away_goals) == (fixture.home_goals, fixture.away_goals):
                    continue
                if old and old.correction_observation:
                    flagged = next((raw for raw in entries(old.correction_observation.payload) if raw["fixture"]["id"] == fixture.provider_id), None)
                    if flagged and flagged["goals"] == score:
                        continue
                selections.append({"marketId": market["marketId"], "decimalOdds": price})
        if not selections:
            continue
        settled_at = timezone.now()
        outcomes = run_engine({"operation": "settle", "now": milliseconds(settled_at), "selections": selections,
                               "homeGoals": fixture.home_goals, "awayGoals": fixture.away_goals},
                              timeout_seconds=min(10, context.deadline - time.monotonic()))
        with transaction.atomic():
            context.guard()
            for outcome in outcomes:
                row, created = Settlement.objects.get_or_create(prediction=prediction, market_id=outcome["marketId"], defaults={
                    "result_observation": result_source, "home_goals": fixture.home_goals, "away_goals": fixture.away_goals,
                    "outcome": outcome["settled"]["won"], "profit": outcome["settled"]["profit"], "settled_at": settled_at,
                })
                if created:
                    counts["settled"] += 1
                elif (row.home_goals, row.away_goals) != (fixture.home_goals, fixture.away_goals) and row.correction_observation_id != result_source.pk:
                    Settlement.objects.filter(pk=row.pk).update(correction_flagged_at=row.correction_flagged_at or settled_at,
                                                               correction_observation=result_source)
                    counts["corrections"] += 1
    return counts