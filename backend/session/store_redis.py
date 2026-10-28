"""Redis-backed SessionStore.

Abstraction over Redis for *small* session metadata, keyed by ``session_id``.
Only the ``SessionState`` JSON is stored here -- never heavy DataFrames, which
live in the ``DataFrameStore`` and are referenced by key.

Redis key layout::

    session:{session_id}   -> JSON string of SessionState (TTL = SESSION_TTL_SECONDS)
    session_index          -> ZSET  session_id -> last_seen epoch (for cleanup scans)

The Redis connection is built from the environment (``REDIS_HOST``,
``REDIS_PORT``, ``REDIS_DB``, optional ``REDIS_PASSWORD``) so that moving from a
same-instance Redis (Phase 1) to ElastiCache (Phase 2) is a configuration change
rather than a code change. A redis client may also be injected via the
constructor so tests can pass a ``fakeredis`` instance.
"""

from __future__ import annotations

import os
import time
from typing import Optional

from .state import SessionState

# Default TTL for an inactive session: 24h.
DEFAULT_SESSION_TTL_SECONDS = 86400

# Redis namespacing.
SESSION_KEY_PREFIX = "session:"
SESSION_INDEX_KEY = "session_index"


def _session_key(session_id: str) -> str:
    """Return the namespaced Redis key holding a session's JSON."""
    return f"{SESSION_KEY_PREFIX}{session_id}"


def _build_client_from_env():
    """Build a redis client from environment variables.

    Reads ``REDIS_HOST`` (default ``127.0.0.1``), ``REDIS_PORT`` (default
    ``6379``), ``REDIS_DB`` (default ``0``) and optional ``REDIS_PASSWORD``.
    Imported lazily so the module can be imported (and unit-tested with an
    injected client) even when ``redis`` is not installed.
    """
    import redis  # local import: optional dependency

    host = os.environ.get("REDIS_HOST", "127.0.0.1")
    port = int(os.environ.get("REDIS_PORT", "6379"))
    db = int(os.environ.get("REDIS_DB", "0"))
    password = os.environ.get("REDIS_PASSWORD") or None

    return redis.Redis(
        host=host,
        port=port,
        db=db,
        password=password,
        decode_responses=True,
    )


def _resolve_ttl_seconds() -> int:
    """Resolve ``SESSION_TTL_SECONDS`` from env, falling back to the default."""
    raw = os.environ.get("SESSION_TTL_SECONDS")
    if raw is None or raw == "":
        return DEFAULT_SESSION_TTL_SECONDS
    try:
        return int(raw)
    except (TypeError, ValueError):
        return DEFAULT_SESSION_TTL_SECONDS


class SessionStore:
    """Persist and retrieve :class:`SessionState` metadata in Redis.

    Parameters
    ----------
    client:
        An optional redis client. When ``None`` a client is built from the
        environment. Injecting a client lets tests pass a ``fakeredis`` instance.
    ttl_seconds:
        An optional TTL override. When ``None`` the value is read from
        ``SESSION_TTL_SECONDS`` (default :data:`DEFAULT_SESSION_TTL_SECONDS`).
    """

    def __init__(self, client=None, ttl_seconds: Optional[int] = None) -> None:
        self._client = client if client is not None else _build_client_from_env()
        self._ttl_seconds = ttl_seconds if ttl_seconds is not None else _resolve_ttl_seconds()

    @property
    def ttl_seconds(self) -> int:
        """Configured session TTL in seconds."""
        return self._ttl_seconds

    def get_session(self, session_id: str) -> SessionState:
        """Return the stored session or a fresh default.

        Never raises on a miss: if no session is stored for ``session_id`` a
        brand-new default :class:`SessionState` is returned. Does **not** mutate
        the session's TTL.
        """
        raw = self._client.get(_session_key(session_id))
        if raw is None:
            return SessionState()
        # redis may return bytes if decode_responses is False (e.g. some
        # injected clients); normalize to str for from_json.
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return SessionState.from_json(raw)

    def exists(self, session_id: str) -> bool:
        """Return whether a live session key exists for ``session_id``.

        Checks for the presence of ``session:{session_id}`` in Redis. Used by
        :class:`SessionCleanup` to decide whether a DataFrame key's owning
        session is still live (keep) or has expired/been deleted (orphaned).
        Does not mutate the session or its TTL.
        """
        return bool(self._client.exists(_session_key(session_id)))

    def save_session(self, session_id: str, state: SessionState) -> None:
        """Persist ``state`` under ``session_id`` with a TTL.

        Writes ``session:{session_id}`` to ``state.to_json()`` using a single
        ``SET ... EX`` (atomic overwrite of any prior value) and records the
        current epoch for the id in the ``session_index`` ZSET so cleanup can
        scan for live/stale sessions.
        """
        self._client.set(
            _session_key(session_id),
            state.to_json(),
            ex=self._ttl_seconds,
        )
        self._client.zadd(SESSION_INDEX_KEY, {session_id: time.time()})

    def delete_session(self, session_id: str) -> None:
        """Remove the session key and drop the id from ``session_index``.

        Idempotent: deleting a missing session is a no-op. Does **not** delete
        DataFrame files; file removal is handled by ``SessionCleanup.sweep()``
        (TTL-expiry path) or ``SessionManager.purge()`` (logout path).
        """
        self._client.delete(_session_key(session_id))
        self._client.zrem(SESSION_INDEX_KEY, session_id)

    def touch(self, session_id: str) -> None:
        """Refresh the TTL for an active session and bump its index score.

        If the session key no longer exists (already expired/deleted) this is a
        no-op aside from not re-creating it; the index score is still updated so
        an actively-touched id is recorded.
        """
        self._client.expire(_session_key(session_id), self._ttl_seconds)
        self._client.zadd(SESSION_INDEX_KEY, {session_id: time.time()})
