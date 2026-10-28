"""Property-based tests for the per-worker DataFrameCache (LRU + byte budget).

Property 9: Cache transparency and single load.
Validates: Requirements 6.1, 6.2 -- ``cache.get(key, loader)`` returns a
DataFrame equal to a direct store load, and a counting ``loader`` is invoked at
most once per key when nothing is evicted (generous budget).

Property 10: Cache budget bound with LRU eviction.
Validates: Requirements 6.3, 6.4 -- over random ``get`` sequences the total
cached bytes stay ``<= DF_CACHE_MAX_BYTES`` after every call, and the entries
that remain are exactly those a least-recently-used reference model would keep
(so evicted entries are the least-recently-used), including the over-budget
passthrough case where a frame larger than the whole budget is returned but not
cached.
"""

import string
from collections import OrderedDict

import pandas as pd
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from pandas.testing import assert_frame_equal

from session.cache import DataFrameCache, _estimate_bytes


# --- Strategies ---------------------------------------------------------------

# Keys are drawn from a small fixed pool so random get sequences repeatedly hit
# the same keys (exercising cache hits, LRU ordering, and eviction).
_KEY_POOL = ["k0", "k1", "k2", "k3", "k4"]

_col_names = st.text(alphabet=string.ascii_letters + string.digits + "_", min_size=1, max_size=6)

_int_values = st.integers(min_value=-(10**6), max_value=10**6)
_float_values = st.floats(allow_nan=False, allow_infinity=False, width=64)
_bool_values = st.booleans()
_str_values = st.text(alphabet=string.printable, max_size=12)

_column_value_strategies = st.sampled_from(
    [_int_values, _float_values, _bool_values, _str_values]
)


@st.composite
def small_dataframes(draw) -> pd.DataFrame:
    """Generate a small DataFrame with a stable, well-defined memory footprint.

    A handful of columns, each a homogeneous dtype drawn from
    int / float (no NaN) / bool / short string, and a handful of rows. Uses a
    plain ``RangeIndex`` so ``memory_usage(deep=True)`` is stable and matches
    between the cache and the reference model.
    """
    n_cols = draw(st.integers(min_value=1, max_value=4))
    n_rows = draw(st.integers(min_value=0, max_value=8))

    names = draw(st.lists(_col_names, min_size=n_cols, max_size=n_cols, unique=True))

    data = {}
    for name in names:
        value_strategy = draw(_column_value_strategies)
        column = draw(st.lists(value_strategy, min_size=n_rows, max_size=n_rows))
        data[name] = column

    return pd.DataFrame(data).reset_index(drop=True)


# --- Property 9 ---------------------------------------------------------------


@settings(suppress_health_check=[HealthCheck.too_slow])
@given(
    data=st.data(),
    frames=st.lists(small_dataframes(), min_size=1, max_size=5),
    sequence=st.lists(st.integers(min_value=0), min_size=1, max_size=30),
)
def test_cache_transparency_and_single_load(data, frames, sequence):
    """Property 9: Cache transparency and single load.

    Build a fake "store" mapping each key to a fixed DataFrame. With a generous
    budget (large enough to hold every frame so nothing is ever evicted), run a
    random sequence of gets over a fixed set of keys. Assert:

    * (transparency) every returned frame equals the store's frame for that key
      (a direct store load), and
    * (single load) each key's counting loader is invoked at most once, since no
      entry is evicted when the budget is generous.

    **Validates: Requirements 6.1, 6.2**
    """
    # Fixed store: key -> DataFrame. Use as many keys as we have frames.
    keys = _KEY_POOL[: len(frames)]
    store = {key: frame for key, frame in zip(keys, frames)}

    # Generous budget: strictly larger than the sum of all frame sizes so the
    # eviction loop never runs and nothing is ever dropped.
    total = sum(_estimate_bytes(df) for df in store.values())
    cache = DataFrameCache(max_bytes=total + 1)

    # Counting loaders, one per key, each returning the store's frame.
    call_counts = {key: 0 for key in keys}

    def make_loader(key):
        def _loader():
            call_counts[key] += 1
            return store[key]

        return _loader

    for raw in sequence:
        key = keys[raw % len(keys)]
        returned = cache.get(key, make_loader(key))
        # Transparency: the returned frame equals a direct store load.
        assert_frame_equal(returned, store[key], check_like=False)

    # Single load: with a generous budget nothing is evicted, so each loader is
    # invoked at most once across the whole sequence.
    for key in keys:
        assert call_counts[key] <= 1


# --- Property 10 --------------------------------------------------------------


class _ReferenceLRU:
    """A minimal reference LRU model with the same byte budget and sizing.

    Mirrors :class:`DataFrameCache` semantics so the cache's live key set can be
    checked against an independent model after every operation:

    * On a hit, mark the key most-recently-used.
    * On a miss, size the frame via ``memory_usage(deep=True).sum()`` (exactly
      what the cache uses), evict least-recently-used entries while the frame
      would exceed the budget, then insert as most-recently-used.
    * Over-budget passthrough: a frame larger than the whole budget is never
      inserted, leaving existing entries untouched.
    """

    def __init__(self, max_bytes: int) -> None:
        self._max_bytes = max_bytes
        self._entries: "OrderedDict[str, int]" = OrderedDict()  # key -> size
        self._current_bytes = 0

    def get(self, key: str, df: pd.DataFrame) -> None:
        if key in self._entries:
            self._entries.move_to_end(key)
            return

        size = _estimate_bytes(df)
        if size > self._max_bytes:
            # Over-budget passthrough: not cached, existing entries untouched.
            return

        while self._current_bytes + size > self._max_bytes and self._entries:
            _victim, victim_size = self._entries.popitem(last=False)
            self._current_bytes -= victim_size

        self._entries[key] = size
        self._current_bytes += size
        self._entries.move_to_end(key)

    @property
    def current_bytes(self) -> int:
        return self._current_bytes

    def keys(self) -> list:
        return list(self._entries.keys())


@settings(suppress_health_check=[HealthCheck.too_slow])
@given(
    frames=st.lists(small_dataframes(), min_size=1, max_size=5),
    budget_frac=st.integers(min_value=1, max_value=5),
    sequence=st.lists(st.integers(min_value=0), min_size=1, max_size=40),
)
def test_cache_budget_bound_with_lru_eviction(frames, budget_frac, sequence):
    """Property 10: Cache budget bound with LRU eviction.

    Build frames of known/varying sizes and a small budget so eviction happens.
    Over a random get sequence assert, after EACH get:

    * ``cache.current_bytes <= cache.max_bytes`` (budget bound), and
    * the cache's live key set matches an independent reference LRU model's key
      set -- so the entries evicted by the cache are exactly the least-recently-
      used ones (and the over-budget passthrough frame is cached by neither).

    **Validates: Requirements 6.3, 6.4**
    """
    keys = _KEY_POOL[: len(frames)]
    store = {key: frame for key, frame in zip(keys, frames)}

    # Pick a small budget so eviction is exercised: a fraction of the largest
    # frame's size, but at least 1 byte. Using the largest frame guarantees at
    # least one frame may exceed the budget (over-budget passthrough) when
    # budget_frac is small, and that several small frames can coexist otherwise.
    sizes = {key: _estimate_bytes(df) for key, df in store.items()}
    max_size = max(sizes.values()) if sizes else 1
    max_bytes = max(1, max_size // budget_frac)

    cache = DataFrameCache(max_bytes=max_bytes)
    reference = _ReferenceLRU(max_bytes=max_bytes)

    def make_loader(key):
        def _loader():
            return store[key]

        return _loader

    for raw in sequence:
        key = keys[raw % len(keys)]

        returned = cache.get(key, make_loader(key))
        reference.get(key, store[key])

        # The returned frame is always the correct one regardless of caching.
        assert_frame_equal(returned, store[key], check_like=False)

        # Budget bound holds after every call.
        assert cache.current_bytes <= cache.max_bytes

        # Live key set (and thus eviction choices) matches the reference LRU.
        assert set(cache.keys()) == set(reference.keys())
        # Byte accounting also agrees with the reference model.
        assert cache.current_bytes == reference.current_bytes
