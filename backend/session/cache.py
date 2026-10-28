"""Per-worker, in-process DataFrameCache (LRU + byte budget).

A heavy DataFrame (up to ~500MB) must not be reloaded from the
:class:`DataFrameStore` on every request. Each Gunicorn worker keeps a small
in-process cache of hydrated DataFrames keyed by their opaque store key. The
cache is bounded by a total-bytes budget (``DF_CACHE_MAX_BYTES``): when
inserting a new frame would push the total over budget, least-recently-used
entries are evicted until it fits.

A single frame larger than the whole budget is an *over-budget passthrough*: it
is returned to the caller but never cached (caching it could evict everything
and still exceed the budget), so the cache's invariant -- total cached bytes
``<= DF_CACHE_MAX_BYTES`` -- always holds.

Gunicorn ``sync`` workers are single-threaded, but a lock guards every mutation
so the cache is safe under threaded workers too.
"""

from __future__ import annotations

import os
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable, List

import pandas as pd

# Default per-worker cache budget: 2GB. Tuned to instance RAM via env.
DEFAULT_DF_CACHE_MAX_BYTES = 2147483648  # 2 * 1024**3


def _resolve_max_bytes() -> int:
    """Resolve ``DF_CACHE_MAX_BYTES`` from env, falling back to the default."""
    raw = os.environ.get("DF_CACHE_MAX_BYTES")
    if raw is None or raw == "":
        return DEFAULT_DF_CACHE_MAX_BYTES
    try:
        return int(raw)
    except (TypeError, ValueError):
        return DEFAULT_DF_CACHE_MAX_BYTES


def _estimate_bytes(df: pd.DataFrame) -> int:
    """Estimate a DataFrame's in-memory footprint in bytes.

    Uses ``df.memory_usage(deep=True).sum()`` so object/string columns are
    measured by their actual contents rather than just pointer size.
    """
    return int(df.memory_usage(deep=True).sum())


@dataclass
class _Entry:
    """A cached DataFrame together with its estimated byte size."""

    df: pd.DataFrame
    size: int


class DataFrameCache:
    """In-process LRU cache of hydrated DataFrames bounded by a byte budget.

    Parameters
    ----------
    max_bytes:
        Optional override of the total-bytes budget. When ``None`` the value is
        read from ``DF_CACHE_MAX_BYTES`` (default
        :data:`DEFAULT_DF_CACHE_MAX_BYTES`). Exposed as a constructor parameter
        so tests can set a small budget.
    """

    def __init__(self, max_bytes: int | None = None) -> None:
        self._max_bytes = max_bytes if max_bytes is not None else _resolve_max_bytes()
        # OrderedDict preserves access order: the first item is the LRU, the
        # last is the MRU. ``move_to_end`` marks MRU; ``popitem(last=False)``
        # pops the LRU victim.
        self._entries: "OrderedDict[str, _Entry]" = OrderedDict()
        self._current_bytes = 0
        self._lock = threading.Lock()

    @property
    def max_bytes(self) -> int:
        """Configured total-bytes budget for the cache."""
        return self._max_bytes

    @property
    def current_bytes(self) -> int:
        """Current total estimated bytes of all cached DataFrames."""
        with self._lock:
            return self._current_bytes

    def keys(self) -> List[str]:
        """Return the currently cached keys, LRU-first."""
        with self._lock:
            return list(self._entries.keys())

    def __contains__(self, key: str) -> bool:
        with self._lock:
            return key in self._entries

    def get(self, key: str, loader: Callable[[], pd.DataFrame]) -> pd.DataFrame:
        """Return the DataFrame for ``key``, loading via ``loader`` on a miss.

        On a hit the entry is marked most-recently-used and returned without
        calling ``loader``. On a miss ``loader`` is called exactly once; the
        loaded frame's size is estimated, least-recently-used entries are
        evicted while ``current_bytes + size > max_bytes`` and the cache is not
        empty, and the frame is then inserted and marked MRU.

        A frame that alone exceeds ``max_bytes`` is returned without being
        cached (over-budget passthrough), leaving existing entries and the total
        byte count within budget.
        """
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None:
                # Hit: mark most-recently-used and return without loading.
                self._entries.move_to_end(key)
                return entry.df

        # Miss: load outside the lock so a slow parquet read does not block
        # other cache hits. ``loader`` is invoked exactly once per miss.
        df = loader()
        size = _estimate_bytes(df)

        with self._lock:
            # Another thread may have populated the key while we loaded; if so,
            # keep the existing entry (still exactly-once semantics per miss for
            # this caller's loader) and return the freshly loaded frame's slot
            # consistently by preferring the cached one.
            existing = self._entries.get(key)
            if existing is not None:
                self._entries.move_to_end(key)
                return existing.df

            # Over-budget passthrough: a single frame larger than the whole
            # budget is never cached -- caching it could not satisfy the
            # invariant. Return it directly.
            if size > self._max_bytes:
                return df

            # Eviction loop. Invariant: evicted keys are the least-recently-used
            # and ``current_bytes`` strictly decreases each iteration until the
            # incoming frame fits. Terminates because entries is finite.
            while self._current_bytes + size > self._max_bytes and self._entries:
                _victim_key, victim = self._entries.popitem(last=False)
                self._current_bytes -= victim.size

            self._entries[key] = _Entry(df=df, size=size)
            self._current_bytes += size
            self._entries.move_to_end(key)
            return df

    def put(self, key: str, df: pd.DataFrame) -> None:
        """Insert or overwrite ``df`` under ``key``, evicting to budget.

        Used after a freshly written DataFrame so a subsequent :meth:`get` is a
        cache hit rather than a store reload. Unlike :meth:`get`, ``put`` always
        (re)inserts the given frame, correctly replacing any prior entry for the
        same key -- important on overwrite, where a stale cached frame must not
        survive. The same eviction logic and over-budget passthrough as
        :meth:`get` apply, so the invariant (total cached bytes
        ``<= max_bytes``) always holds.
        """
        size = _estimate_bytes(df)
        with self._lock:
            # Drop any existing entry for this key first so an overwrite cannot
            # leave the old frame cached and keeps the byte accounting correct.
            existing = self._entries.pop(key, None)
            if existing is not None:
                self._current_bytes -= existing.size

            # Over-budget passthrough: a frame larger than the whole budget is
            # never cached (caching it could not satisfy the invariant).
            if size > self._max_bytes:
                return

            # Eviction loop: evict the least-recently-used entries until the
            # incoming frame fits within the budget.
            while self._current_bytes + size > self._max_bytes and self._entries:
                _victim_key, victim = self._entries.popitem(last=False)
                self._current_bytes -= victim.size

            self._entries[key] = _Entry(df=df, size=size)
            self._current_bytes += size
            self._entries.move_to_end(key)
