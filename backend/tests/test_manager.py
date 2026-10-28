"""Unit tests for the :class:`SessionManager` facade (task 6.1).

These verify the wiring of the SessionManager over an injected
``fakeredis``-backed :class:`SessionStore`, a temp-dir
:class:`LocalDiskDataFrameStore`, and a real :class:`DataFrameCache`:

* ``resolve`` returns a fresh default on a miss and the stored state after
  ``persist``.
* ``set_dataframe`` writes parquet, sets the right pointer field, returns the
  key, and primes the cache so hydration is a hit.
* ``active_df`` / ``active_df_for_tree`` return ``None`` when the key is unset
  and the saved frame when it is set.
* ``purge`` removes the Redis session and all DataFrame files, idempotently.
* ``node_datasets_for`` rederives slices equal to a direct
  ``create_node_datasets`` call.
"""

import fakeredis
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from session.cache import DataFrameCache
from session.dataframe_store import LocalDiskDataFrameStore
from session.manager import SessionManager
from session.state import SessionState
from session.store_redis import SessionStore


def _make_manager(tmp_path):
    client = fakeredis.FakeRedis(decode_responses=True)
    store = SessionStore(client=client)
    df_store = LocalDiskDataFrameStore(base_dir=str(tmp_path))
    cache = DataFrameCache(max_bytes=10 * 1024 * 1024)
    return SessionManager(store, df_store, cache), df_store


def test_resolve_returns_fresh_default_on_miss(tmp_path):
    manager, _ = _make_manager(tmp_path)
    state = manager.resolve("user:alice")
    assert state == SessionState()


def test_persist_then_resolve_round_trips(tmp_path):
    manager, _ = _make_manager(tmp_path)
    state = SessionState(badflag="target", max_depth=7)
    manager.persist("user:alice", state)
    assert manager.resolve("user:alice") == state


def test_active_df_none_when_key_unset(tmp_path):
    manager, _ = _make_manager(tmp_path)
    state = SessionState()
    assert manager.active_df(state) is None
    assert manager.active_df_for_tree(state) is None


def test_set_dataframe_sets_df_key_and_hydrates(tmp_path):
    manager, _ = _make_manager(tmp_path)
    state = SessionState()
    df = pd.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})

    key = manager.set_dataframe("user:alice", state, "df", df)

    assert key == "user:alice/df"
    assert state.df_key == key
    assert state.df_for_tree_key is None
    assert_frame_equal(manager.active_df(state), df)


def test_set_dataframe_for_tree_sets_df_for_tree_key(tmp_path):
    manager, _ = _make_manager(tmp_path)
    state = SessionState()
    df = pd.DataFrame({"f1": [1.0, 2.0], "badflag": [0, 1]})

    key = manager.set_dataframe("user:bob", state, "df_for_tree", df)

    assert key == "user:bob/df_for_tree"
    assert state.df_for_tree_key == key
    assert state.df_key is None
    assert_frame_equal(manager.active_df_for_tree(state), df)


def test_set_dataframe_cache_hit_avoids_store_load(tmp_path):
    manager, df_store = _make_manager(tmp_path)
    state = SessionState()
    df = pd.DataFrame({"a": [1, 2]})
    manager.set_dataframe("user:alice", state, "df", df)

    # Delete the underlying parquet; hydration must still succeed from cache.
    df_store.delete_dataframe(state.df_key)
    assert_frame_equal(manager.active_df(state), df)


def test_set_dataframe_overwrite_updates_cache(tmp_path):
    manager, _ = _make_manager(tmp_path)
    state = SessionState()
    first = pd.DataFrame({"a": [1]})
    second = pd.DataFrame({"a": [2, 3]})

    manager.set_dataframe("user:alice", state, "df", first)
    manager.set_dataframe("user:alice", state, "df", second)

    assert_frame_equal(manager.active_df(state), second)


def test_purge_removes_session_and_files(tmp_path):
    manager, df_store = _make_manager(tmp_path)
    state = SessionState()
    manager.set_dataframe("user:alice", state, "df", pd.DataFrame({"a": [1]}))
    manager.set_dataframe("user:alice", state, "df_for_tree", pd.DataFrame({"b": [2]}))
    manager.persist("user:alice", state)

    manager.purge("user:alice")

    assert manager.resolve("user:alice") == SessionState()
    assert df_store.list_keys("user:alice") == []


def test_purge_is_idempotent_on_empty(tmp_path):
    manager, df_store = _make_manager(tmp_path)
    manager.purge("user:ghost")  # no session, no files
    manager.purge("user:ghost")  # again
    assert manager.resolve("user:ghost") == SessionState()
    assert df_store.list_keys("user:ghost") == []


def test_node_datasets_for_matches_direct_call(tmp_path):
    from util import create_node_datasets

    manager, _ = _make_manager(tmp_path)
    state = SessionState()

    df_for_tree = pd.DataFrame(
        {
            "feat1": [1, 2, 3, 4],
            "badflag": [0, 1, 0, 1],
        }
    )
    manager.set_dataframe("user:alice", state, "df_for_tree", df_for_tree)

    state.df_col = [
        {"column_name": "feat1", "datatype": "numerical"},
        {"column_name": "badflag", "datatype": "target"},
    ]
    state.node_master = [
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

    result = manager.node_datasets_for(state)

    mapper = pd.DataFrame(state.df_col)
    node_master = pd.DataFrame(state.node_master)
    _nm, expected = create_node_datasets(df_for_tree, mapper, node_master)

    assert_frame_equal(result, expected)


def test_node_datasets_for_raises_when_no_df_for_tree(tmp_path):
    manager, _ = _make_manager(tmp_path)
    state = SessionState()
    with pytest.raises(ValueError):
        manager.node_datasets_for(state)
