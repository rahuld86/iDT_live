"""Property-based tests for the :class:`SessionManager` facade (tasks 6.2-6.4).

Each example builds a *fresh* manager from freshly constructed collaborators --
a ``fakeredis``-backed :class:`SessionStore`, a temp-dir
:class:`LocalDiskDataFrameStore`, and a generously sized :class:`DataFrameCache`
-- so examples never share Redis keys or files with one another.

Property 8: node_datasets rederivation equivalence.
Validates: Requirements 5.4 -- ``node_datasets_for(state)`` equals a direct
``create_node_datasets(df_for_tree, mapper, node_master)`` for the same inputs.

Property 15: Logout purges session and files, idempotently.
Validates: Requirements 12.1, 12.3 -- after ``purge`` the Redis session is gone
and ``list_keys(session_id)`` is empty; re-purging (and purging a never-touched
id) raises nothing and leaves the workspace empty.

Property 16: No work recovered after logout or TTL expiry.
Validates: Requirements 2.4, 11.4, 12.4 -- persisting a populated state then
purging and re-resolving the same id yields a brand-new default
:class:`SessionState` (no ``df_key``, no ``node_master``, default
hyperparameters).
"""

import string
import tempfile

import fakeredis
import pandas as pd
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from pandas.testing import assert_frame_equal

from session.cache import DataFrameCache
from session.dataframe_store import LocalDiskDataFrameStore
from session.manager import SessionManager
from session.state import SessionState
from session.store_redis import SessionStore


# --- Fresh manager helper -----------------------------------------------------


def _make_manager(base_dir):
    """Build a fresh manager over isolated collaborators.

    A new ``fakeredis`` client (so no Redis keys bleed across examples), a
    ``LocalDiskDataFrameStore`` rooted at ``base_dir`` (a fresh temp dir per
    example), and a large-budget cache so hydration is always a straightforward
    cache-or-load.
    """
    client = fakeredis.FakeRedis(decode_responses=True)
    store = SessionStore(client=client)
    df_store = LocalDiskDataFrameStore(base_dir=base_dir)
    cache = DataFrameCache(max_bytes=256 * 1024 * 1024)
    return SessionManager(store, df_store, cache), store, df_store


# --- Strategies ---------------------------------------------------------------

_identity_chars = string.ascii_letters + string.digits + "_-."
_session_ids = st.one_of(
    st.text(alphabet=_identity_chars, min_size=1, max_size=12),
    st.builds(
        lambda s: f"user:{s}",
        st.text(alphabet=_identity_chars, min_size=1, max_size=12),
    ),
)

# Column names for the random df_for_tree feature columns.
_feature_names = st.text(
    alphabet=string.ascii_lowercase, min_size=1, max_size=6
).filter(lambda s: s != "badflag")

# Parquet-round-trippable feature values (no NaN/inf for stable equality).
_int_values = st.integers(min_value=-(10**6), max_value=10**6)
_float_values = st.floats(allow_nan=False, allow_infinity=False, width=64)
_feature_value_strategies = st.sampled_from([_int_values, _float_values])


@st.composite
def df_for_tree_frames(draw) -> pd.DataFrame:
    """A small ``df_for_tree``: a few numeric feature columns plus ``badflag``.

    ``create_node_datasets`` expects a ``badflag``-style target present in the
    frame, so we always include a binary ``badflag`` column. Features are
    homogeneous numeric columns (int/float, no NaN) with a plain ``RangeIndex``
    for a stable parquet round-trip.
    """
    n_rows = draw(st.integers(min_value=1, max_value=8))
    n_feats = draw(st.integers(min_value=1, max_value=3))
    names = draw(
        st.lists(_feature_names, min_size=n_feats, max_size=n_feats, unique=True)
    )

    data = {}
    for name in names:
        value_strategy = draw(_feature_value_strategies)
        data[name] = draw(
            st.lists(value_strategy, min_size=n_rows, max_size=n_rows)
        )
    data["badflag"] = draw(
        st.lists(st.integers(min_value=0, max_value=1), min_size=n_rows, max_size=n_rows)
    )

    return pd.DataFrame(data).reset_index(drop=True)


def _mapper_rows(df_for_tree: pd.DataFrame) -> list:
    """Build a df_col mapper matching the columns of ``df_for_tree``."""
    rows = []
    for col in df_for_tree.columns:
        datatype = "target" if col == "badflag" else "numerical"
        rows.append({"column_name": col, "datatype": datatype})
    return rows


def _simple_node_master() -> list:
    """A minimal valid node_master: a single root node (parent_node=0).

    Keeping parent_node=0 means ``create_node_datasets`` skips the per-parent
    split loop (it only processes parents > 0), which keeps the derivation
    simple and deterministic while still exercising the full code path.
    """
    return [
        {
            "node_number": 1,
            "parent_node": 0,
            "variable": "",
            "lower_bound": 0,
            "upper_bound": 0,
            "list_values": "",
            "missing": 0,
        }
    ]


@st.composite
def populated_states(draw):
    """Generate a populated ``(session_id, state, df, df_for_tree)`` tuple.

    The state carries non-default hyperparameters, a target flag, a ``df_col``
    mapper, a ``node_master`` tree, and feature columns -- everything a real
    workspace would hold. The two heavy frames are returned alongside so the
    caller can ``set_dataframe`` them before persisting.
    """
    session_id = draw(_session_ids)
    df_for_tree = draw(df_for_tree_frames())
    df = draw(df_for_tree_frames())

    feature_cols = [c for c in df_for_tree.columns if c != "badflag"]
    state = SessionState(
        file_name=draw(st.text(max_size=10)),
        badflag="badflag",
        regression_flag=draw(st.integers(min_value=0, max_value=1)),
        max_depth=draw(st.integers(min_value=1, max_value=20)),
        min_node_split=draw(st.integers(min_value=1, max_value=1000)),
        min_leaf_size=draw(st.integers(min_value=1, max_value=1000)),
        max_branches=draw(st.integers(min_value=2, max_value=10)),
        criteria=draw(st.sampled_from(["entropy", "gini", "mse"])),
        df_col=_mapper_rows(df_for_tree),
        node_master=_simple_node_master(),
        X_col=feature_cols,
    )
    return session_id, state, df, df_for_tree


# --- Property 8 ---------------------------------------------------------------


@settings(suppress_health_check=[HealthCheck.too_slow])
@given(session_id=_session_ids, df_for_tree=df_for_tree_frames())
def test_node_datasets_rederivation_equivalence(session_id, df_for_tree):
    """Property 8: node_datasets rederivation equivalence.

    After ``set_dataframe`` for the ``df_for_tree`` frame and setting a matching
    ``df_col`` mapper plus a simple ``node_master`` on the state,
    ``manager.node_datasets_for(state)`` equals a direct
    ``create_node_datasets(df_for_tree, mapper, node_master)`` for the same
    inputs (both call the same underlying ``util`` function).

    **Validates: Requirements 5.4**
    """
    from util import create_node_datasets

    with tempfile.TemporaryDirectory() as base_dir:
        manager, _store, _df_store = _make_manager(base_dir)
        state = SessionState()

        manager.set_dataframe(session_id, state, "df_for_tree", df_for_tree)
        state.df_col = _mapper_rows(df_for_tree)
        state.node_master = _simple_node_master()

        result = manager.node_datasets_for(state)

        mapper = pd.DataFrame(state.df_col)
        node_master = pd.DataFrame(state.node_master)
        _nm, expected = create_node_datasets(df_for_tree, mapper, node_master)

        assert_frame_equal(result, expected, check_like=False)


# --- Property 15 --------------------------------------------------------------


@settings(suppress_health_check=[HealthCheck.too_slow])
@given(state_bundle=populated_states(), extra_id=_session_ids)
def test_logout_purge_idempotence(state_bundle, extra_id):
    """Property 15: Logout purges session and files, idempotently.

    Covers both the populated-workspace and empty-workspace cases:

    * A populated session (both heavy frames written + metadata persisted) is
      purged; afterwards the Redis session is gone (``resolve`` yields a fresh
      default) and ``list_keys(session_id)`` is empty.
    * Purging a *second* time, and purging an ``extra_id`` that was never
      touched, raises nothing and leaves both workspaces empty.

    **Validates: Requirements 12.1, 12.3**
    """
    session_id, state, df, df_for_tree = state_bundle

    with tempfile.TemporaryDirectory() as base_dir:
        manager, _store, df_store = _make_manager(base_dir)

        manager.set_dataframe(session_id, state, "df", df)
        manager.set_dataframe(session_id, state, "df_for_tree", df_for_tree)
        manager.persist(session_id, state)

        # Sanity: the workspace exists before purge.
        assert df_store.list_keys(session_id) != []

        # First purge removes the session and all heavy files.
        manager.purge(session_id)
        assert manager.resolve(session_id) == SessionState()
        assert df_store.list_keys(session_id) == []

        # Empty-workspace / purge-twice cases: re-purging and purging a
        # never-touched id are both harmless no-ops.
        manager.purge(session_id)  # purge twice
        manager.purge(extra_id)    # never-touched id

        assert manager.resolve(session_id) == SessionState()
        assert df_store.list_keys(session_id) == []
        assert manager.resolve(extra_id) == SessionState()
        assert df_store.list_keys(extra_id) == []


# --- Property 16 --------------------------------------------------------------


@settings(suppress_health_check=[HealthCheck.too_slow])
@given(state_bundle=populated_states())
def test_no_work_recovered_after_purge(state_bundle):
    """Property 16: No work recovered after logout or TTL expiry.

    Persist a fully populated state (``df_key``, ``node_master``, non-default
    hyperparameters, ...), purge the session, then re-resolve the same id. The
    result equals a brand-new default :class:`SessionState` -- no ``df_key``, no
    ``node_master``, and default hyperparameters -- so no prior work is
    recovered after logout (the purge path) or an equivalent TTL expiry.

    **Validates: Requirements 2.4, 11.4, 12.4**
    """
    session_id, state, df, df_for_tree = state_bundle

    with tempfile.TemporaryDirectory() as base_dir:
        manager, _store, _df_store = _make_manager(base_dir)

        manager.set_dataframe(session_id, state, "df", df)
        manager.set_dataframe(session_id, state, "df_for_tree", df_for_tree)
        manager.persist(session_id, state)

        # Confirm the persisted state really was populated (so the purge is
        # meaningfully clearing work, not resolving an already-empty session).
        persisted = manager.resolve(session_id)
        assert persisted.df_key is not None
        assert persisted.node_master is not None

        manager.purge(session_id)

        recovered = manager.resolve(session_id)
        fresh = SessionState()
        assert recovered == fresh
        # Spot-check the criterion's named fields for a precise regression point.
        assert recovered.df_key is None
        assert recovered.df_for_tree_key is None
        assert recovered.node_master is None
        assert recovered.max_depth == fresh.max_depth
        assert recovered.min_node_split == fresh.min_node_split
        assert recovered.min_leaf_size == fresh.min_leaf_size
        assert recovered.max_branches == fresh.max_branches
        assert recovered.criteria == fresh.criteria
        assert recovered.regression_flag == fresh.regression_flag
