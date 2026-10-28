"""Background cleanup of DataFrame files for expired/deleted sessions.

A heavy DataFrame lives on disk (parquet) under an opaque key of the form
``"{session_id}/{name}"`` and is referenced from the Redis-backed session. When
a session is deleted on logout or expires via its TTL, its Redis key disappears
but the parquet files it referenced remain behind -- orphaned. Left unchecked,
these files accumulate without bound.

:class:`SessionCleanup` closes that gap. A sweep iterates every DataFrame key in
the :class:`~session.dataframe_store.DataFrameStore` and deletes exactly those
whose owning session has no live key in the :class:`~session.store_redis.SessionStore`.
Live sessions' files are always retained; the sweep is idempotent (a second run
immediately after a first deletes nothing new).
"""

from __future__ import annotations

from .dataframe_store import DataFrameStore
from .store_redis import SessionStore


class SessionCleanup:
    """Delete DataFrame files whose owning session is no longer live.

    Parameters
    ----------
    session_store:
        The Redis-backed :class:`SessionStore` used to test session liveness via
        :meth:`SessionStore.exists`.
    dataframe_store:
        The :class:`DataFrameStore` whose keys are swept; orphaned keys are
        removed via :meth:`DataFrameStore.delete_dataframe`.
    """

    def __init__(self, session_store: SessionStore, dataframe_store: DataFrameStore) -> None:
        self._session_store = session_store
        self._dataframe_store = dataframe_store

    @staticmethod
    def _session_id_of(key: str) -> str:
        """Extract the ``session_id`` from an opaque ``"{session_id}/{name}"`` key.

        The ``name`` component never contains ``/``; a ``session_id`` may contain
        ``:`` (``user:{identity}``) but not ``/``. Splitting on the *last* slash
        therefore recovers the session id exactly.
        """
        session_id, _, _name = key.rpartition("/")
        return session_id

    def sweep(self) -> int:
        """Delete every orphaned DataFrame key and return the count deleted.

        A key is *orphaned* when its session id has no live ``session:{id}`` key
        in the session store. Files for live sessions are never touched. The
        sweep is idempotent: running it again after a first pass deletes nothing
        because only live-session files remain.
        """
        deleted = 0
        for key in self._dataframe_store.all_keys():
            session_id = self._session_id_of(key)
            if not self._session_store.exists(session_id):
                self._dataframe_store.delete_dataframe(key)
                deleted += 1
        return deleted
