"""Background scheduler that periodically runs a session-cleanup sweep.

Requirement 7.5: *WHEN ``SESSION_CLEANUP_INTERVAL`` elapses, THE Backend SHALL
run a Session_Cleanup sweep.*

A :class:`~session.cleanup.SessionCleanup` sweep deletes the parquet files of
sessions that no longer have a live Redis key (logged-out or TTL-expired
workspaces). Running it on a fixed interval keeps orphaned heavy-DataFrame files
from accumulating without bound.

This module exposes :func:`start_cleanup_scheduler`, a small reusable wiring
helper. It builds an APScheduler ``BackgroundScheduler``, registers a job that
invokes ``cleanup.sweep`` every ``SESSION_CLEANUP_INTERVAL`` seconds, starts the
scheduler, and returns it (so app shutdown can call ``scheduler.shutdown()``).
The actual ``app.py`` wiring is done separately (task 10); this module only
provides the function it will call.

The sweep job is made resilient: a sweep that raises is logged and swallowed so
one failed run never tears down the recurring job.
"""

from __future__ import annotations

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler

from .cleanup import SessionCleanup

logger = logging.getLogger(__name__)

# Default sweep interval (seconds) when ``SESSION_CLEANUP_INTERVAL`` is unset.
DEFAULT_CLEANUP_INTERVAL_SECONDS = 3600

# Stable job id so repeated wiring is observable / replaceable.
CLEANUP_JOB_ID = "session_cleanup_sweep"


def _resolve_interval_seconds() -> int:
    """Resolve ``SESSION_CLEANUP_INTERVAL`` from env, falling back to default.

    A missing, empty, non-integer, or non-positive value falls back to
    :data:`DEFAULT_CLEANUP_INTERVAL_SECONDS` so the scheduler always has a valid
    positive period.
    """
    raw = os.environ.get("SESSION_CLEANUP_INTERVAL")
    if raw is None or raw == "":
        return DEFAULT_CLEANUP_INTERVAL_SECONDS
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_CLEANUP_INTERVAL_SECONDS
    return value if value > 0 else DEFAULT_CLEANUP_INTERVAL_SECONDS


def _make_safe_sweep(cleanup: SessionCleanup):
    """Wrap ``cleanup.sweep`` so an exception is logged, not propagated.

    APScheduler already isolates job exceptions, but wrapping here guarantees a
    single failed sweep never disrupts the recurring schedule and records why,
    regardless of the executor's error handling.
    """

    def _safe_sweep() -> None:
        try:
            deleted = cleanup.sweep()
            logger.info("Session cleanup sweep removed %d orphaned DataFrame key(s)", deleted)
        except Exception:  # noqa: BLE001 - resilience: keep the recurring job alive
            logger.exception("Session cleanup sweep failed; scheduler will continue")

    return _safe_sweep


def start_cleanup_scheduler(
    cleanup: SessionCleanup,
    interval_seconds: int | None = None,
) -> BackgroundScheduler:
    """Start a background job running ``cleanup.sweep`` on a fixed interval.

    Parameters
    ----------
    cleanup:
        The :class:`SessionCleanup` whose :meth:`~SessionCleanup.sweep` is
        invoked every ``interval_seconds``.
    interval_seconds:
        Seconds between sweeps. When ``None`` (the default) the interval is
        resolved from the ``SESSION_CLEANUP_INTERVAL`` environment variable,
        defaulting to :data:`DEFAULT_CLEANUP_INTERVAL_SECONDS`.

    Returns
    -------
    BackgroundScheduler
        The started scheduler. Keep the reference so the caller can
        ``shutdown()`` it during application teardown.
    """
    if interval_seconds is None:
        interval_seconds = _resolve_interval_seconds()
    elif interval_seconds <= 0:
        interval_seconds = DEFAULT_CLEANUP_INTERVAL_SECONDS

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        _make_safe_sweep(cleanup),
        trigger="interval",
        seconds=interval_seconds,
        id=CLEANUP_JOB_ID,
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Started session cleanup scheduler (interval=%d seconds, job id=%r)",
        interval_seconds,
        CLEANUP_JOB_ID,
    )
    return scheduler
