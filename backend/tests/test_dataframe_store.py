"""Property-based tests for the DataFrameStore local-disk backend.

Property 6: DataFrame round-trip fidelity with overwrite and key layout.
Validates: Requirements 4.1, 4.3, 4.4, 4.6 -- a saved DataFrame round-trips
losslessly through parquet, the returned key is ``"{session_id}/{name}"``, and
rewriting the same key replaces its content with the second DataFrame.

Property 3: Heavy DataFrame isolation across sessions.
Validates: Requirements 1.5 -- operations on one session never change another
session's referenced heavy DataFrame.
"""

import string
import tempfile

import pandas as pd
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from pandas.testing import assert_frame_equal

from session.dataframe_store import LocalDiskDataFrameStore


# --- Strategies ---------------------------------------------------------------

# The two heavy-frame names the store accepts (per the save_dataframe contract).
_DF_NAMES = st.sampled_from(["df", "df_for_tree"])

# Session ids: plain ids plus the canonical ``user:{identity}`` form. Kept to
# filesystem-friendly identity characters (the store handles ``:`` escaping, and
# we avoid ``/`` which is the key separator).
_identity_chars = string.ascii_letters + string.digits + "_-."
_plain_ids = st.text(alphabet=_identity_chars, min_size=1, max_size=12)
_user_ids = st.builds(lambda s: f"user:{s}", st.text(alphabet=_identity_chars, min_size=1, max_size=12))
_session_ids = st.one_of(_plain_ids, _user_ids)

# Column names: non-empty identifier-ish strings, unique within a frame.
_col_names = st.text(alphabet=string.ascii_letters + string.digits + "_", min_size=1, max_size=8)

# Parquet-round-trippable scalar column generators (no NaN/inf, stable dtypes).
_int_values = st.integers(min_value=-(10**9), max_value=10**9)
_float_values = st.floats(allow_nan=False, allow_infinity=False, width=64)
_bool_values = st.booleans()
_str_values = st.text(alphabet=string.printable, max_size=12)

_column_value_strategies = st.sampled_from(
    [_int_values, _float_values, _bool_values, _str_values]
)


@st.composite
def small_dataframes(draw) -> pd.DataFrame:
    """Generate a small parquet-round-trippable DataFrame.

    A handful of columns, each a homogeneous dtype drawn from
    int / float (no NaN) / bool / short string, and a handful of rows. Uses a
    plain ``RangeIndex`` (via ``reset_index``) so the parquet round-trip is
    stable, and avoids object columns with mixed types or NaN/inf.
    """
    n_cols = draw(st.integers(min_value=1, max_value=4))
    n_rows = draw(st.integers(min_value=0, max_value=6))

    # Unique column names so pandas/parquet never collapse duplicates.
    names = draw(
        st.lists(_col_names, min_size=n_cols, max_size=n_cols, unique=True)
    )

    data = {}
    for name in names:
        value_strategy = draw(_column_value_strategies)
        column = draw(
            st.lists(value_strategy, min_size=n_rows, max_size=n_rows)
        )
        data[name] = column

    df = pd.DataFrame(data)
    # Normalize the index to a plain RangeIndex for a stable round-trip.
    return df.reset_index(drop=True)


# --- Property 6 ---------------------------------------------------------------


@settings(suppress_health_check=[HealthCheck.too_slow])
@given(session_id=_session_ids, name=_DF_NAMES, first=small_dataframes(), second=small_dataframes())
def test_dataframe_round_trip_overwrite_and_key_layout(session_id, name, first, second):
    """Property 6: DataFrame round-trip fidelity with overwrite and key layout.

    For a random session id, ``name`` in ``{"df", "df_for_tree"}`` and two small
    random DataFrames:

    * ``save_dataframe`` returns the opaque key ``"{session_id}/{name}"``.
    * ``load_dataframe`` returns a frame equal (values/columns/dtypes) to the
      one saved.
    * Rewriting the same key with ``second`` replaces the content, so a
      subsequent load yields ``second`` rather than ``first``.

    **Validates: Requirements 4.1, 4.3, 4.4, 4.6**
    """
    # Fresh temp dir per example so examples never interfere with each other.
    with tempfile.TemporaryDirectory() as base_dir:
        store = LocalDiskDataFrameStore(base_dir=base_dir)

        # 4.1 / 4.4: save returns the opaque key "{session_id}/{name}".
        key = store.save_dataframe(session_id, name, first)
        assert key == f"{session_id}/{name}"

        # 4.3: round-trip equality (values, columns, dtypes).
        loaded = store.load_dataframe(key)
        assert_frame_equal(loaded, first, check_like=False)

        # 4.6: rewriting the same key replaces prior content with the second df.
        key2 = store.save_dataframe(session_id, name, second)
        assert key2 == key
        reloaded = store.load_dataframe(key)
        assert_frame_equal(reloaded, second, check_like=False)


# --- Property 3 ---------------------------------------------------------------


@settings(suppress_health_check=[HealthCheck.too_slow])
@given(
    data=st.data(),
    name1=_DF_NAMES,
    name2=_DF_NAMES,
    df1=small_dataframes(),
    df2=small_dataframes(),
)
def test_heavy_dataframe_isolation_across_sessions(data, name1, name2, df1, df2):
    """Property 3: Heavy DataFrame isolation across sessions.

    For two *distinct* session ids ``s1`` and ``s2``, saving, overwriting, and
    deleting DataFrames under ``s2`` never changes what
    ``load_dataframe(df_key(s1))`` returns -- each session's heavy DataFrame is
    fully isolated from the other.

    **Validates: Requirements 1.5**
    """
    s1 = data.draw(_session_ids, label="s1")
    # Draw s2 until it differs from s1 so the two workspaces are genuinely distinct.
    s2 = data.draw(_session_ids.filter(lambda sid: sid != s1), label="s2")

    with tempfile.TemporaryDirectory() as base_dir:
        store = LocalDiskDataFrameStore(base_dir=base_dir)

        # Establish s1's heavy DataFrame and capture a faithful baseline copy.
        key1 = store.save_dataframe(s1, name1, df1)
        baseline = store.load_dataframe(key1).copy(deep=True)

        # Now perform a series of mutating operations entirely under s2.
        key2 = store.save_dataframe(s2, name2, df2)
        store.save_dataframe(s2, name2, df1)  # overwrite s2's frame
        store.delete_dataframe(key2)          # delete s2's frame

        # s1's referenced DataFrame must be completely unchanged by all of the
        # above s2 activity.
        after = store.load_dataframe(key1)
        assert_frame_equal(after, baseline, check_like=False)

        # And s1's key set is untouched by s2 operations.
        assert store.list_keys(s1) == [key1]


# --- Regression: tricky session ids (path traversal / dot segments) ----------


import pytest


@pytest.mark.parametrize(
    "session_id",
    ["0..", ".", "..", "a/b", "user:alice", "../etc", "", "NUL", "con", "COM1"],
)
def test_tricky_session_ids_round_trip(session_id):
    """Regression for session ids that are unsafe as raw directory names.

    Session ids containing dot segments (``"0.."``, ``"."``, ``".."``), path
    separators (``"a/b"``, ``"../etc"``), or ``:`` (``"user:alice"``) used to
    either raise ``FileNotFoundError`` (dot segments escaping the session dir)
    or collide/traverse. They must now:

    * save without error and return the opaque key exactly
      ``"{session_id}/{name}"`` (unchanged key format),
    * round-trip the frame losslessly,
    * be reconstructed verbatim by ``list_keys``/``all_keys``.
    """
    name = "df"
    frame = pd.DataFrame({"a": [1]}).reset_index(drop=True)

    with tempfile.TemporaryDirectory() as base_dir:
        store = LocalDiskDataFrameStore(base_dir=base_dir)

        key = store.save_dataframe(session_id, name, frame)
        assert key == f"{session_id}/{name}"

        loaded = store.load_dataframe(key)
        assert_frame_equal(loaded, frame, check_like=False)

        assert store.list_keys(session_id) == [key]
        assert store.all_keys() == [key]

        store.delete_dataframe(key)
        assert store.list_keys(session_id) == []


def test_tricky_session_ids_isolated_on_disk():
    """Distinct tricky ids map to distinct dirs and do not clobber each other."""
    name = "df"
    ids = ["0..", ".", "..", "a/b", "user:alice", "../etc"]

    with tempfile.TemporaryDirectory() as base_dir:
        store = LocalDiskDataFrameStore(base_dir=base_dir)

        for i, sid in enumerate(ids):
            store.save_dataframe(sid, name, pd.DataFrame({"a": [i]}).reset_index(drop=True))

        # Every session is recoverable and returns its own distinct frame.
        for i, sid in enumerate(ids):
            loaded = store.load_dataframe(f"{sid}/{name}")
            assert loaded["a"].tolist() == [i]

        # all_keys reconstructs exactly the set of opaque keys we wrote.
        assert sorted(store.all_keys()) == sorted(f"{sid}/{name}" for sid in ids)
