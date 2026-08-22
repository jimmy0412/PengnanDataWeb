"""Small in-process job registry for long-running data mutations."""

from __future__ import annotations

from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Lock, RLock
from typing import Callable
from uuid import uuid4

JobOperation = Callable[[Callable[[str, int, int], None]], dict]

_jobs: dict[str, dict] = {}
_jobs_lock = RLock()
_data_mutation_lock = Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="data-job")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_job(kind: str) -> dict:
    job = {
        "id": uuid4().hex,
        "kind": kind,
        "status": "queued",
        "stage": "等待執行",
        "current": 0,
        "total": 1,
        "percent": 0,
        "result": None,
        "error": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    with _jobs_lock:
        _jobs[job["id"]] = job
        # Avoid unbounded growth while preserving active and recent jobs.
        finished = [
            item for item in _jobs.values() if item["status"] in {"completed", "failed"}
        ]
        for old in sorted(finished, key=lambda item: item["updated_at"])[:-100]:
            _jobs.pop(old["id"], None)
    return deepcopy(job)


def get_job(job_id: str) -> dict | None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return deepcopy(job) if job else None


def submit_job(job_id: str, operation: JobOperation) -> None:
    _executor.submit(run_job, job_id, operation)


def _update_job(job_id: str, **changes) -> None:
    with _jobs_lock:
        job = _jobs[job_id]
        job.update(changes)
        job["updated_at"] = _now()


def run_job(job_id: str, operation: JobOperation) -> None:
    """Run a data mutation serially and publish coarse progress."""
    try:
        with _data_mutation_lock:
            _update_job(job_id, status="running", stage="開始執行")

            def report(stage: str, current: int, total: int) -> None:
                safe_total = max(total, 1)
                percent = min(100, max(0, round(current / safe_total * 100)))
                _update_job(
                    job_id,
                    status="running",
                    stage=stage,
                    current=current,
                    total=safe_total,
                    percent=percent,
                )

            result = operation(report)
            _update_job(
                job_id,
                status="completed",
                stage="完成",
                percent=100,
                result=result,
            )
    except Exception as exc:
        _update_job(
            job_id,
            status="failed",
            stage="執行失敗",
            error=str(exc),
        )
