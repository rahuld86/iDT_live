"""SessionManager facade.

Ties together the :class:`SessionStore` (Redis metadata), the
:class:`DataFrameStore` (heavy parquet frames) and the per-worker
:class:`DataFrameCache` into the small surface that endpoints actually use. It
implements the ``resolve -> use state -> persist`` lifecycle described in the
design, plus workspace teardown (``purge``) and on-demand ``node_datasets``
rederivation.

The three collaborators are dependency-injected via the constructor so tests can
pass fakes (e.g. a ``fakeredis``-backed ``SessionStore`` and a temp-dir
``LocalDiskDataFrameStore``).
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

from .cache import DataFrameCache
from .dataframe_store import DataFrameStore
from .state import SessionState
from .store_redis import SessionStore

# The known heavy-frame names and the SessionState pointer field each maps to.
# ``set_dataframe`` uses this to decide which key field to populate.
_NAME_TO_KEY_FIELD = {
    "df": "df_key",
    "df_for_tree": "df_for_tree_key",
}


class SessionDataExpired(Exception):
    """Raised when a session references a heavy DataFrame key that no longer
    exists in the DataFrame store.

    This surfaces the "session data expired, please re-upload" condition
    (Requirement 11.2). It subclasses :class:`Exception` (not ``KeyError``) so
    that the centralized error handler can distinguish a genuinely missing
    DataFrame file from an incidental ``KeyError`` raised elsewhere in endpoint
    logic. When raised, the owning pointer field on the in-memory
    :class:`SessionState` has already been cleared (set to ``None``) so a caller
    that persists the state will drop the stale key.
    """


class SessionManager:
    """Facade over the session store, DataFrame store, and worker cache.

    Parameters
    ----------
    session_store:
        The Redis-backed :class:`SessionStore` for small session metadata.
    dataframe_store:
        The :class:`DataFrameStore` for heavy parquet frames.
    cache:
        The per-worker :class:`DataFrameCache` fronting the DataFrame store.
    """

    def __init__(
        self,
        session_store: SessionStore,
        dataframe_store: DataFrameStore,
        cache: DataFrameCache,
    ) -> None:
        self._session_store = session_store
        self._dataframe_store = dataframe_store
        self._cache = cache

    # ------------------------------------------------------------------ #
    # Resolve / persist
    # ------------------------------------------------------------------ #
    def resolve(self, session_id: str) -> SessionState:
        """Load the session for ``session_id`` or return a fresh default.

        Delegates to :meth:`SessionStore.get_session`, which never raises on a
        miss: an unknown ``session_id`` (including after logout or TTL expiry)
        yields a brand-new default :class:`SessionState`. Does not mutate TTL.
        """
        return self._session_store.get_session(session_id)

    def persist(self, session_id: str, state: SessionState) -> None:
        """Save ``state`` metadata and refresh the session TTL.

        :meth:`SessionStore.save_session` already writes with a ``SET ... EX``
        that sets the TTL, so the explicit ``touch`` is a redundant safety
        refresh (a no-op aside from bumping the index) that keeps actively used
        sessions alive even if the store's write path changes.
        """
        self._session_store.save_session(session_id, state)
        self._session_store.touch(session_id)

    # ------------------------------------------------------------------ #
    # Heavy DataFrame hydration
    # ------------------------------------------------------------------ #
    def active_df(self, state: SessionState) -> Optional[pd.DataFrame]:
        """Hydrate the raw upload ``df`` for ``state`` (cache-aware).

        Returns ``None`` when ``state.df_key`` is unset. Otherwise the frame is
        returned from the worker cache on a hit, or loaded once from the
        DataFrame store (and cached) on a miss.

        If the referenced key no longer exists in the DataFrame store (the
        store raises :class:`KeyError`), the stale ``df_key`` is cleared on the
        in-memory ``state`` and :class:`SessionDataExpired` is raised so the
        endpoint can return HTTP 400 "Session data expired, please re-upload".
        """
        return self._hydrate(state, "df_key")

    def active_df_for_tree(self, state: SessionState) -> Optional[pd.DataFrame]:
        """Hydrate the processed ``df_for_tree`` for ``state`` (cache-aware).

        Returns ``None`` when ``state.df_for_tree_key`` is unset; otherwise
        behaves like :meth:`active_df` for the processed-frame key, including
        clearing the stale key and raising :class:`SessionDataExpired` when the
        referenced parquet file is missing.
        """
        return self._hydrate(state, "df_for_tree_key")

    def _hydrate(self, state: SessionState, key_field: str) -> Optional[pd.DataFrame]:
        """Shared cache-aware load for the pointer stored in ``key_field``.

        Returns ``None`` when the pointer is unset. On a missing DataFrame file
        (``KeyError`` from the store) the stale pointer is cleared on ``state``
        and :class:`SessionDataExpired` is raised.
        """
        key = getattr(state, key_field)
        if key is None:
            return None
        try:
            return self._cache.get(
                key,
                loader=lambda: self._dataframe_store.load_dataframe(key),
            )
        except KeyError as exc:
            # The session points at a DataFrame file that no longer exists
            # (e.g. expired/cleaned up). Clear the stale pointer on the
            # in-memory state so a subsequent persist drops it, then surface a
            # dedicated "expired" error for a 400 response.
            setattr(state, key_field, None)
            raise SessionDataExpired(
                f"Referenced DataFrame key {key!r} no longer exists"
            ) from exc

    # ------------------------------------------------------------------ #
    # Heavy DataFrame write
    # ------------------------------------------------------------------ #
    def set_dataframe(
        self,
        session_id: str,
        state: SessionState,
        name: str,
        df: pd.DataFrame,
    ) -> str:
        """Persist ``df`` as parquet, set its key on ``state``, and return it.

        Signature
        ---------
        ``set_dataframe(session_id, state, name, df) -> key``

        Because :class:`SessionState` does not carry its own ``session_id``, the
        id is passed in explicitly (the cleanest of the options in the design;
        the design's ``state.df_key = session_manager.set_dataframe(...)`` usage
        is updated to pass ``session_id`` first). The frame is written via
        :meth:`DataFrameStore.save_dataframe`, which returns the opaque key
        ``"{session_id}/{name}"``.

        Side effects:
        * The appropriate pointer field on ``state`` is set -- ``df_key`` for
          ``name == "df"`` and ``df_for_tree_key`` for ``name == "df_for_tree"``.
        * The worker cache is updated via :meth:`DataFrameCache.put` so a
          subsequent :meth:`active_df` / :meth:`active_df_for_tree` is a cache
          hit. ``put`` (rather than ``get``) is used so an *overwrite* of an
          already-cached key replaces the stale frame rather than returning it.

        Returns the opaque store key.
        """
        key = self._dataframe_store.save_dataframe(session_id, name, df)

        key_field = _NAME_TO_KEY_FIELD.get(name)
        if key_field is not None:
            setattr(state, key_field, key)

        # Update the cache so a subsequent hydration is a hit; ``put`` overwrites
        # any stale entry for this key (important when the same key is rewritten).
        self._cache.put(key, df)
        return key

    # ------------------------------------------------------------------ #
    # Workspace teardown
    # ------------------------------------------------------------------ #
    def purge(self, session_id: str) -> None:
        """Delete the Redis session and every heavy DataFrame file for it.

        This is the logout path. After return the ``session:{session_id}`` key is
        absent from Redis and :meth:`DataFrameStore.list_keys` is empty for the
        id (every ``{session_id}/{name}`` parquet file deleted). Idempotent: a
        ``session_id`` with no session and no files is a no-op.
        """
        self._session_store.delete_session(session_id)
        for key in self._dataframe_store.list_keys(session_id):
            self._dataframe_store.delete_dataframe(key)

    # ------------------------------------------------------------------ #
    # node_datasets rederivation
    # ------------------------------------------------------------------ #
    def node_datasets_for(self, state: SessionState):
        """Rederive the per-node data slices for ``state``.

        Hydrates ``df_for_tree`` (via :meth:`active_df_for_tree`), rebuilds the
        ``mapper`` DataFrame from ``state.df_col`` and the ``node_master``
        DataFrame from ``state.node_master``, and calls the existing
        ``util.create_node_datasets(df_for_tree, mapper, node_master)`` to
        rederive the node slices. ``create_node_datasets`` returns
        ``(node_master, node_datasets)``; this returns only ``node_datasets``.

        ``node_datasets`` is never persisted -- it is fully derivable from these
        inputs, so it is recomputed on demand here.
        """
        df_for_tree = self.active_df_for_tree(state)
        if df_for_tree is None:
            raise ValueError(
                "Cannot rederive node_datasets: df_for_tree is not available "
                "(df_for_tree_key is unset). Complete data setup first."
            )

        # Imported lazily to avoid a heavy import at module load and to keep the
        # session package decoupled from the Flask app's util module.
        from util import create_node_datasets

        mapper = pd.DataFrame(state.df_col)
        node_master = pd.DataFrame(state.node_master)

        _node_master, node_datasets = create_node_datasets(df_for_tree, mapper, node_master)
        return node_datasets
