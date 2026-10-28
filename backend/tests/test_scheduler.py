"""Unit tests for :mod:`session.scheduler`.

Requirement 7.5: the backend runs a cleanup sweep every
``SESSION_CLEANUP_INTERVAL`` seconds. These tests verify the wiring helper
:func:`session.scheduler.start_cleanup_scheduler` without relying on real time
passing: they use a very large interval and immediately shut the scheduler down,
asserting only that the scheduler is started and the sweep job is registered
with the configured period. The resilient-sweep wrapper and the interval
resolver are tested directly.
"""

import pytest

from session.scheduler import (
    CLEANUP_JOB_ID,
    DEFAULT_CLEANUP_INTERVAL_SECONDS,
    _make_safe_sweep,
    _resolve_interval_seconds,
    start_cleanup_scheduler,
)


class _FakeCleanup:
    """Minimal stand-in for :class:`SessionCleanup` recording sweep calls."""

    def __init__(self, raise_exc: Exception | None = None, result: int = 0) -> None:
        self.calls = 0
        self._raise_exc = raise_exc
        self._result = result

    def sweep(self) -> int:
        self.calls += 1
        if self._raise_exc is not None:
            raise self._raise_exc
        return self._result


def test_scheduler_starts_and_registers_job():
    """The scheduler starts and registers the cleanup job at the given interval."""
    cleanup = _FakeCleanup()
    # Large interval so the job never fires during the test.
    scheduler = start_cleanup_scheduler(cleanup, interval_seconds=10_000)
    try:
        assert scheduler.running
        job = scheduler.get_job(CLEANUP_JOB_ID)
        assert job is not None
        assert int(job.trigger.interval.total_seconds()) == 10_000
    finally:
        scheduler.shutdown(wait=False)


def test_scheduler_uses_env_interval_when_not_passed(monkeypatch):
    """When ``interval_seconds`` is omitted, the env var is used."""
    monkeypatch.setenv("SESSION_CLEANUP_INTERVAL", "12345")
    cleanup = _FakeCleanup()
    scheduler = start_cleanup_scheduler(cleanup)
    try:
        job = scheduler.get_job(CLEANUP_JOB_ID)
        assert int(job.trigger.interval.total_seconds()) == 12345
    finally:
        scheduler.shutdown(wait=False)


@pytest.mark.parametrize(
    "raw, expected",
    [
        (None, DEFAULT_CLEANUP_INTERVAL_SECONDS),
        ("", DEFAULT_CLEANUP_INTERVAL_SECONDS),
        ("not-an-int", DEFAULT_CLEANUP_INTERVAL_SECONDS),
        ("0", DEFAULT_CLEANUP_INTERVAL_SECONDS),
        ("-5", DEFAULT_CLEANUP_INTERVAL_SECONDS),
        ("3600", 3600),
        ("60", 60),
    ],
)
def test_resolve_interval_seconds(monkeypatch, raw, expected):
    """Interval resolution falls back to the default for invalid/missing values."""
    if raw is None:
        monkeypatch.delenv("SESSION_CLEANUP_INTERVAL", raising=False)
    else:
        monkeypatch.setenv("SESSION_CLEANUP_INTERVAL", raw)
    assert _resolve_interval_seconds() == expected


def test_safe_sweep_swallows_exceptions():
    """A sweep that raises is caught so the recurring job keeps running."""
    cleanup = _FakeCleanup(raise_exc=RuntimeError("boom"))
    safe = _make_safe_sweep(cleanup)
    # Must not raise despite the underlying sweep failing.
    safe()
    assert cleanup.calls == 1


def test_safe_sweep_invokes_underlying_sweep():
    """The wrapper delegates to the underlying sweep on the happy path."""
    cleanup = _FakeCleanup(result=3)
    safe = _make_safe_sweep(cleanup)
    safe()
    assert cleanup.calls == 1
